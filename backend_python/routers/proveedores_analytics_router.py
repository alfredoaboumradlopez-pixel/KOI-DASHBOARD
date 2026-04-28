"""
Proveedores Analytics Router
Endpoints para estadísticas, alertas, historial y comparativo de proveedores.
"""
from __future__ import annotations
import os
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/proveedores-stats", tags=["proveedores-analytics"])

_USE_PG = bool(os.environ.get("DATABASE_URL"))

_MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


def _extract_month(col):
    if _USE_PG:
        return extract("month", col)
    else:
        return func.cast(func.strftime("%m", col), func.Integer() if False else func.String())


def _filter_mes_anio_pg(q, col, mes, anio):
    if _USE_PG:
        return q.filter(extract("month", col) == mes, extract("year", col) == anio)
    else:
        return q.filter(
            func.strftime("%m", col) == str(mes).zfill(2),
            func.strftime("%Y", col) == str(anio),
        )


def _sumar_por_proveedor(
    db: Session, restaurante_id: int, mes: int, anio: int
) -> Dict[str, Dict[str, Any]]:
    """
    Returns dict keyed by PROVEEDOR.strip().upper() with:
      { total, categoria, transacciones: [{ fecha, categoria, descripcion, monto }] }
    Combines both Gasto and GastoDiario tables.
    """
    result: Dict[str, Dict[str, Any]] = {}

    # ── Gasto table ──
    q_g = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.proveedor != "",
        models.Gasto.proveedor != None,
    )
    q_g = _filter_mes_anio_pg(q_g, models.Gasto.fecha, mes, anio)
    gastos = q_g.all()
    for g in gastos:
        key = g.proveedor.strip().upper()
        if not key:
            continue
        if key not in result:
            result[key] = {"total": 0.0, "categoria": g.categoria or "", "transacciones": []}
        result[key]["total"] += g.monto or 0.0
        result[key]["transacciones"].append({
            "fecha": str(g.fecha),
            "categoria": g.categoria or "",
            "descripcion": g.descripcion or "",
            "monto": g.monto or 0.0,
        })

    # ── GastoDiario joined with CierreTurno ──
    q_gd = (
        db.query(models.GastoDiario, models.CierreTurno.fecha)
        .join(models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id)
        .filter(
            models.GastoDiario.restaurante_id == restaurante_id,
            models.GastoDiario.proveedor != "",
            models.GastoDiario.proveedor != None,
        )
    )
    q_gd = _filter_mes_anio_pg(q_gd, models.CierreTurno.fecha, mes, anio)
    gastos_diarios = q_gd.all()
    for gd, fecha_cierre in gastos_diarios:
        key = gd.proveedor.strip().upper()
        if not key:
            continue
        if key not in result:
            result[key] = {"total": 0.0, "categoria": gd.categoria or "", "transacciones": []}
        result[key]["total"] += gd.monto or 0.0
        result[key]["transacciones"].append({
            "fecha": str(fecha_cierre),
            "categoria": gd.categoria or "",
            "descripcion": gd.descripcion or "",
            "monto": gd.monto or 0.0,
        })

    return result


@router.get("/{restaurante_id}/alertas")
def get_alertas_proveedores(
    restaurante_id: int,
    mes: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    mes = mes or hoy.month
    anio = anio or hoy.year

    if mes == 1:
        mes_ant, anio_ant = 12, anio - 1
    else:
        mes_ant, anio_ant = mes - 1, anio

    actual = _sumar_por_proveedor(db, restaurante_id, mes, anio)
    anterior = _sumar_por_proveedor(db, restaurante_id, mes_ant, anio_ant)

    items = []
    for proveedor, data in actual.items():
        mes_actual_total = data["total"]
        mes_anterior_total = anterior.get(proveedor, {}).get("total", 0.0)
        if mes_anterior_total > 0:
            variacion_pct = round((mes_actual_total - mes_anterior_total) / mes_anterior_total * 100, 1)
        else:
            variacion_pct = None
        alerta = variacion_pct is not None and variacion_pct > 10
        items.append({
            "proveedor": proveedor,
            "categoria": data["categoria"],
            "mes_actual": round(mes_actual_total, 2),
            "mes_anterior": round(mes_anterior_total, 2),
            "variacion_pct": variacion_pct,
            "alerta": alerta,
            "transacciones_mes": len(data["transacciones"]),
        })

    items.sort(key=lambda x: x["mes_actual"], reverse=True)
    return items


@router.get("/{restaurante_id}/estadisticas")
def get_estadisticas_proveedores(
    restaurante_id: int,
    mes: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    mes = mes or hoy.month
    anio = anio or hoy.year

    if mes == 1:
        mes_ant, anio_ant = 12, anio - 1
    else:
        mes_ant, anio_ant = mes - 1, anio

    proveedores_activos = db.query(func.count(models.Proveedor.id)).filter(
        models.Proveedor.restaurante_id == restaurante_id,
        models.Proveedor.activo == True,
    ).scalar() or 0

    actual = _sumar_por_proveedor(db, restaurante_id, mes, anio)
    anterior = _sumar_por_proveedor(db, restaurante_id, mes_ant, anio_ant)

    top_proveedor = None
    if actual:
        top_name = max(actual, key=lambda k: actual[k]["total"])
        top_proveedor = {"nombre": top_name, "total": round(actual[top_name]["total"], 2)}

    mayor_incremento = None
    best_var: Optional[float] = None
    for proveedor, data in actual.items():
        ant_total = anterior.get(proveedor, {}).get("total", 0.0)
        if ant_total > 0:
            var = (data["total"] - ant_total) / ant_total * 100
            if best_var is None or var > best_var:
                best_var = var
                mayor_incremento = {
                    "nombre": proveedor,
                    "variacion_pct": round(var, 1),
                    "categoria": data["categoria"],
                }

    return {
        "proveedores_activos": proveedores_activos,
        "top_proveedor": top_proveedor,
        "mayor_incremento": mayor_incremento,
    }


@router.get("/{restaurante_id}/historial/{nombre}")
def get_historial_proveedor(
    restaurante_id: int,
    nombre: str,
    meses: int = Query(3),
    db: Session = Depends(get_db),
):
    from urllib.parse import unquote
    nombre = unquote(nombre)
    nombre_upper = nombre.strip().upper()

    hoy = date.today()

    # Build list of (mes, anio) for the last `meses` months PLUS current month = meses+1 total
    periodos = []
    for i in range(meses, -1, -1):
        m = hoy.month - i
        y = hoy.year
        while m <= 0:
            m += 12
            y -= 1
        periodos.append((m, y))

    # Fetch all transactions
    transacciones = []

    # From Gasto
    if periodos:
        oldest_mes, oldest_anio = periodos[0]
        oldest_date = date(oldest_anio, oldest_mes, 1)

        q_g = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id,
            func.upper(models.Gasto.proveedor) == nombre_upper,
            models.Gasto.fecha >= oldest_date,
        )
        for g in q_g.all():
            transacciones.append({
                "fecha": str(g.fecha),
                "categoria": g.categoria or "",
                "descripcion": g.descripcion or "",
                "monto": g.monto or 0.0,
            })

        # From GastoDiario
        q_gd = (
            db.query(models.GastoDiario, models.CierreTurno.fecha)
            .join(models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id)
            .filter(
                models.GastoDiario.restaurante_id == restaurante_id,
                func.upper(models.GastoDiario.proveedor) == nombre_upper,
                models.CierreTurno.fecha >= oldest_date,
            )
        )
        for gd, fecha_cierre in q_gd.all():
            transacciones.append({
                "fecha": str(fecha_cierre),
                "categoria": gd.categoria or "",
                "descripcion": gd.descripcion or "",
                "monto": gd.monto or 0.0,
            })

    # Sort by fecha desc, limit 50
    transacciones.sort(key=lambda x: x["fecha"], reverse=True)
    transacciones = transacciones[:50]

    # Build tendencia: last 4 months (including current)
    tendencia_periodos = periodos[-4:] if len(periodos) >= 4 else periodos
    tendencia = []
    for m, y in tendencia_periodos:
        data = _sumar_por_proveedor(db, restaurante_id, m, y)
        total = data.get(nombre_upper, {}).get("total", 0.0)
        tendencia.append({
            "mes_label": _MESES_LABEL[m - 1],
            "mes": m,
            "anio": y,
            "total": round(total, 2),
        })

    # Compute mes_actual and mes_anterior from the last two periods
    mes_actual_total = 0.0
    mes_anterior_total = 0.0
    if len(periodos) >= 1:
        curr_m, curr_y = periodos[-1]
        curr_data = _sumar_por_proveedor(db, restaurante_id, curr_m, curr_y)
        mes_actual_total = curr_data.get(nombre_upper, {}).get("total", 0.0)
    if len(periodos) >= 2:
        prev_m, prev_y = periodos[-2]
        prev_data = _sumar_por_proveedor(db, restaurante_id, prev_m, prev_y)
        mes_anterior_total = prev_data.get(nombre_upper, {}).get("total", 0.0)

    if mes_anterior_total > 0:
        variacion_pct = round((mes_actual_total - mes_anterior_total) / mes_anterior_total * 100, 1)
    else:
        variacion_pct = None

    return {
        "transacciones": transacciones,
        "tendencia": tendencia,
        "total_mes_actual": round(mes_actual_total, 2),
        "total_mes_anterior": round(mes_anterior_total, 2),
        "variacion_pct": variacion_pct,
    }


@router.get("/{restaurante_id}/comparativo")
def get_comparativo_proveedores(
    restaurante_id: int,
    mes: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    mes = mes or hoy.month
    anio = anio or hoy.year

    data = _sumar_por_proveedor(db, restaurante_id, mes, anio)

    # Group by categoria
    categorias: Dict[str, Dict[str, float]] = {}
    for proveedor, info in data.items():
        cat = info["categoria"] or "SIN_CATEGORIA"
        if cat not in categorias:
            categorias[cat] = {}
        categorias[cat][proveedor] = categorias[cat].get(proveedor, 0.0) + info["total"]

    result = []
    for cat, provs in categorias.items():
        total_cat = sum(provs.values())
        proveedores_list = []
        for prov_nombre, total in sorted(provs.items(), key=lambda x: x[1], reverse=True):
            pct = round(total / total_cat * 100, 1) if total_cat > 0 else 0.0
            proveedores_list.append({
                "nombre": prov_nombre,
                "total": round(total, 2),
                "pct": pct,
            })
        result.append({
            "categoria": cat,
            "total_categoria": round(total_cat, 2),
            "proveedores": proveedores_list,
        })

    result.sort(key=lambda x: x["total_categoria"], reverse=True)
    return result
