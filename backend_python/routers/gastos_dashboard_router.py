"""
gastos_dashboard_router.py
==========================
GET /api/gastos/dashboard/{restaurante_id}?mes=4&anio=2026

Retorna resumen analítico mensual de gastos para el módulo Dashboard Gastos.
Combina `gastos` (transferencias/facturas) + `gastos_diarios` (bitácora efectivo).
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models

router = APIRouter(tags=["gastos-dashboard"])

# ── Helpers ────────────────────────────────────────────────────────────────────

MESES_ES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

MP_COMPROBANTES = {"FACTURA", "TICKET", "RECIBO", "NOTA_REMISION", "VALE", "TRANSFERENCIA"}


def _es_mp(comp: Optional[str]) -> bool:
    if not comp:
        return False
    return comp.upper().strip() in MP_COMPROBANTES


def _semana_num(dia: int) -> int:
    """1-7→0, 8-14→1, 15-21→2, 22+→3"""
    if dia <= 7:
        return 0
    if dia <= 14:
        return 1
    if dia <= 21:
        return 2
    return 3


def _label_semana(mes: int, anio: int, sem: int) -> str:
    ini_dias = [1, 8, 15, 22]
    ultimo = calendar.monthrange(anio, mes)[1]
    fin_dias = [7, 14, 21, ultimo]
    m = str(mes).zfill(2)
    return f"{m}-{str(ini_dias[sem]).zfill(2)} al {m}-{str(fin_dias[sem]).zfill(2)}"


def _prev_mes_anio(mes: int, anio: int):
    if mes == 1:
        return 12, anio - 1
    return mes - 1, anio


def _tipo_to_color_key(tipo: Optional[str]) -> str:
    if not tipo:
        return "operativo"
    t = tipo.upper()
    if "COSTO" in t:
        return "costo"
    if "NOMINA" in t:
        return "nomina"
    if "IMPUESTO" in t:
        return "impuesto"
    return "operativo"


# ── Main endpoint ──────────────────────────────────────────────────────────────

@router.get("/api/gastos/dashboard/{restaurante_id}")
def gastos_dashboard(
    restaurante_id: int,
    mes: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    mes = mes or hoy.month
    anio = anio or hoy.year
    mes_ant, anio_ant = _prev_mes_anio(mes, anio)

    # ── Resolver catalogo_cuentas para el restaurante ─────────────────────────
    cuentas_rows = db.query(
        models.CatalogoCuenta.id,
        models.CatalogoCuenta.nombre,
        models.CatalogoCuenta.tipo,
    ).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).all()
    cuenta_info: dict[int, dict] = {
        r.id: {"nombre": r.nombre, "tipo": r.tipo} for r in cuentas_rows
    }

    # ── Cargar gastos del período actual ──────────────────────────────────────
    gastos_act = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        extract("month", models.Gasto.fecha) == mes,
        extract("year", models.Gasto.fecha) == anio,
    ).all()

    gd_act = (
        db.query(models.GastoDiario, models.CierreTurno.fecha)
        .join(models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id)
        .filter(
            models.CierreTurno.restaurante_id == restaurante_id,
            extract("month", models.CierreTurno.fecha) == mes,
            extract("year", models.CierreTurno.fecha) == anio,
        )
        .all()
    )

    # ── Cargar gastos del período anterior (solo montos por categoría) ─────────
    def _montos_por_cat_gastos(m, a):
        rows = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id,
            extract("month", models.Gasto.fecha) == m,
            extract("year", models.Gasto.fecha) == a,
        ).all()
        d: dict[str, float] = defaultdict(float)
        for g in rows:
            d[(g.categoria or "OTROS").strip().upper()] += float(g.monto or 0)
        return d

    def _montos_por_cat_gd(m, a):
        rows = (
            db.query(models.GastoDiario)
            .join(models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id)
            .filter(
                models.CierreTurno.restaurante_id == restaurante_id,
                extract("month", models.CierreTurno.fecha) == m,
                extract("year", models.CierreTurno.fecha) == a,
            )
            .all()
        )
        d: dict[str, float] = defaultdict(float)
        for g in rows:
            d[(g.categoria or "OTROS").strip().upper()] += float(g.monto or 0)
        return d

    prev_gastos = _montos_por_cat_gastos(mes_ant, anio_ant)
    prev_gd = _montos_por_cat_gd(mes_ant, anio_ant)
    prev_por_cat: dict[str, float] = defaultdict(float)
    for cat, m in prev_gastos.items():
        prev_por_cat[cat] += m
    for cat, m in prev_gd.items():
        prev_por_cat[cat] += m

    # ── Agregar por categoría y calcular métricas ──────────────────────────────
    # Estructura: cat → {monto, transacciones, cuenta_id, cuenta_nombre, tipo_cuenta, items}
    por_cat: dict[str, dict] = defaultdict(lambda: {
        "monto": 0.0,
        "items": [],
        "cuenta_id": None,
        "cuenta_nombre": None,
        "tipo_cuenta": "operativo",
    })

    total_transferencia = 0.0
    total_efectivo = 0.0
    total_mp = 0.0
    total_nmp = 0.0
    dia_montos: dict[str, float] = defaultdict(float)
    proveedor_montos: dict[str, float] = defaultdict(float)
    semana_montos: list[float] = [0.0, 0.0, 0.0, 0.0]

    # Gastos (transferencias/facturas)
    for g in gastos_act:
        cat = (g.categoria or "OTROS").strip().upper()
        monto = float(g.monto or 0)
        comp = g.comprobante or ""
        fecha_str = str(g.fecha)
        dia = g.fecha.day if hasattr(g.fecha, "day") else int(str(g.fecha).split("-")[2])

        total_transferencia += monto
        if _es_mp(comp):
            total_mp += monto
        else:
            total_nmp += monto

        dia_montos[fecha_str] += monto
        if g.proveedor:
            proveedor_montos[g.proveedor.strip().upper()] += monto
        semana_montos[_semana_num(dia)] += monto

        bucket = por_cat[cat]
        bucket["monto"] += monto
        if bucket["cuenta_id"] is None and g.catalogo_cuenta_id:
            info = cuenta_info.get(g.catalogo_cuenta_id, {})
            bucket["cuenta_id"] = g.catalogo_cuenta_id
            bucket["cuenta_nombre"] = info.get("nombre")
            bucket["tipo_cuenta"] = _tipo_to_color_key(info.get("tipo"))
        bucket["items"].append({
            "id": g.id,
            "tabla": "gastos",
            "fecha": fecha_str,
            "proveedor": g.proveedor or "",
            "descripcion": g.descripcion or "",
            "monto": round(monto, 2),
            "comprobante": comp,
        })

    # Gastos diarios (efectivo)
    for gd, fecha_cierre in gd_act:
        cat = (gd.categoria or "OTROS").strip().upper()
        monto = float(gd.monto or 0)
        comp = str(gd.comprobante.value) if gd.comprobante else ""
        fecha_str = str(fecha_cierre)
        dia = fecha_cierre.day if hasattr(fecha_cierre, "day") else int(str(fecha_cierre).split("-")[2])

        total_efectivo += monto
        if _es_mp(comp):
            total_mp += monto
        else:
            total_nmp += monto

        dia_montos[fecha_str] += monto
        if gd.proveedor:
            proveedor_montos[gd.proveedor.strip().upper()] += monto
        semana_montos[_semana_num(dia)] += monto

        bucket = por_cat[cat]
        bucket["monto"] += monto
        if bucket["cuenta_id"] is None and gd.catalogo_cuenta_id:
            info = cuenta_info.get(gd.catalogo_cuenta_id, {})
            bucket["cuenta_id"] = gd.catalogo_cuenta_id
            bucket["cuenta_nombre"] = info.get("nombre")
            bucket["tipo_cuenta"] = _tipo_to_color_key(info.get("tipo"))
        bucket["items"].append({
            "id": gd.id,
            "tabla": "gastos_diarios",
            "fecha": fecha_str,
            "proveedor": gd.proveedor or "",
            "descripcion": gd.descripcion or "",
            "monto": round(monto, 2),
            "comprobante": comp,
        })

    # ── Totales generales ──────────────────────────────────────────────────────
    total_gastos = total_transferencia + total_efectivo
    num_transacciones = len(gastos_act) + len(gd_act)
    dias_distintos = len(dia_montos)
    promedio_diario = (total_gastos / dias_distintos) if dias_distintos > 0 else 0.0

    dia_mas_caro = max(dia_montos.items(), key=lambda x: x[1]) if dia_montos else (None, 0.0)
    proveedor_top = max(proveedor_montos.items(), key=lambda x: x[1]) if proveedor_montos else (None, 0.0)

    # ── Construir por_categoria ordenado ──────────────────────────────────────
    alertas = []
    categorias_out = []
    for cat, data in sorted(por_cat.items(), key=lambda x: -x[1]["monto"]):
        monto_cat = data["monto"]
        pct = (monto_cat / total_gastos * 100) if total_gastos > 0 else 0.0
        prom_tx = (monto_cat / len(data["items"])) if data["items"] else 0.0
        prev = prev_por_cat.get(cat, 0.0)
        if prev > 0:
            vs_ant = round((monto_cat - prev) / prev * 100, 1)
        elif monto_cat > 0:
            vs_ant = 100.0  # nuevo gasto sin mes anterior
        else:
            vs_ant = 0.0

        if vs_ant > 15.0:
            alertas.append({
                "categoria": cat,
                "variacion_pct": vs_ant,
                "mes_actual": round(monto_cat, 2),
                "mes_anterior": round(prev, 2),
            })

        # Ordenar items de más reciente a más antiguo
        items_sorted = sorted(data["items"], key=lambda x: x["fecha"], reverse=True)

        categorias_out.append({
            "categoria": cat,
            "cuenta_contable": data["cuenta_nombre"] or "Sin cuenta",
            "tipo_cuenta": data["tipo_cuenta"],
            "monto_total": round(monto_cat, 2),
            "porcentaje": round(pct, 1),
            "num_transacciones": len(data["items"]),
            "promedio_transaccion": round(prom_tx, 2),
            "vs_mes_anterior": vs_ant,
            "mes_anterior_monto": round(prev, 2),
            "gastos": items_sorted,
        })

    # ── Tendencia semanal ──────────────────────────────────────────────────────
    tendencia = [
        {
            "semana": _label_semana(mes, anio, i),
            "monto": round(semana_montos[i], 2),
        }
        for i in range(4)
    ]

    return {
        "periodo": {
            "mes": mes,
            "anio": anio,
            "nombre_mes": f"{MESES_ES[mes]} {anio}",
        },
        "resumen": {
            "total_gastos": round(total_gastos, 2),
            "total_mp": round(total_mp, 2),
            "total_nmp": round(total_nmp, 2),
            "total_efectivo": round(total_efectivo, 2),
            "total_transferencia": round(total_transferencia, 2),
            "num_transacciones": num_transacciones,
            "promedio_diario": round(promedio_diario, 2),
            "dia_mas_caro": {
                "fecha": dia_mas_caro[0],
                "monto": round(dia_mas_caro[1], 2),
            },
            "proveedor_top": {
                "nombre": proveedor_top[0],
                "monto": round(proveedor_top[1], 2),
            },
        },
        "por_categoria": categorias_out,
        "tendencia_semanal": tendencia,
        "alertas_gastos": sorted(alertas, key=lambda x: -x["variacion_pct"]),
    }
