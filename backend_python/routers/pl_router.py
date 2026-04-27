"""
Endpoints del P&L automático en tiempo real
"""
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from ..database import get_db
from .. import models
from ..core.auth import get_optional_user, get_restaurante_id
from ..services.pl_service import pl_service

router = APIRouter(prefix="/api/pl", tags=["pl"])


def _check_tenant_access(restaurante_id: int, current_user: Optional[models.Usuario]):
    """SUPER_ADMIN puede ver cualquier restaurante; otros solo el suyo."""
    if current_user is None:
        return  # fallback KOI — permitido durante transición
    if current_user.rol == "SUPER_ADMIN":
        return
    if current_user.restaurante_id != restaurante_id:
        raise HTTPException(status_code=403, detail={"detail": "Sin acceso a este restaurante", "code": "FORBIDDEN"})


def _wrap(data, fecha_inicio, fecha_fin):
    return {
        "data": data.to_dict() if hasattr(data, 'to_dict') else data,
        "generado_en": datetime.utcnow().isoformat(),
        "periodo": {"inicio": str(fecha_inicio), "fin": str(fecha_fin)},
    }


@router.get("/{restaurante_id}/mes/{anio}/{mes}")
def pl_mes(
    restaurante_id: int, anio: int, mes: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail={"detail": "Mes inválido (1-12)", "code": "INVALID_MONTH"})
    result = pl_service.calcular_pl_mes(db, restaurante_id, mes, anio)
    return _wrap(result, result.fecha_inicio, result.fecha_fin)


@router.get("/{restaurante_id}/semana/{fecha}")
def pl_semana(
    restaurante_id: int, fecha: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail={"detail": "Fecha inválida. Use YYYY-MM-DD", "code": "INVALID_DATE"})
    result = pl_service.calcular_pl_semana(db, restaurante_id, d)
    return _wrap(result, result.fecha_inicio, result.fecha_fin)


@router.get("/{restaurante_id}/ytd/{anio}")
def pl_ytd(
    restaurante_id: int, anio: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    result = pl_service.calcular_pl_ytd(db, restaurante_id, anio)
    return _wrap(result, result.fecha_inicio, result.fecha_fin)


@router.get("/{restaurante_id}/comparativo/{anio}/{mes}")
def pl_comparativo(
    restaurante_id: int, anio: int, mes: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail={"detail": "Mes inválido", "code": "INVALID_MONTH"})

    # Mes actual
    actual = pl_service.calcular_pl_mes(db, restaurante_id, mes, anio)

    # Mes anterior
    if mes == 1:
        mes_ant, anio_ant = 12, anio - 1
    else:
        mes_ant, anio_ant = mes - 1, anio
    anterior = pl_service.calcular_pl_mes(db, restaurante_id, mes_ant, anio_ant)

    # Mismo mes año anterior
    mismo_mes_anio_ant = pl_service.calcular_pl_mes(db, restaurante_id, mes, anio - 1)

    def variacion(actual_val, anterior_val):
        if anterior_val == 0:
            return None
        return round(((actual_val - anterior_val) / anterior_val) * 100, 2)

    def build_comp(a, b):
        ad = a.to_dict()
        bd = b.to_dict()
        comp = {}
        for k, v in ad.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                comp[k] = {"actual": v, "anterior": bd.get(k, 0), "variacion_pct": variacion(v, bd.get(k, 0))}
        return comp

    return {
        "generado_en": datetime.utcnow().isoformat(),
        "mes_actual": actual.to_dict(),
        "mes_anterior": anterior.to_dict(),
        "mismo_mes_anio_anterior": mismo_mes_anio_ant.to_dict(),
        "variacion_vs_mes_anterior": build_comp(actual, anterior),
        "variacion_vs_anio_anterior": build_comp(actual, mismo_mes_anio_ant),
    }


@router.get("/{restaurante_id}/resumen-semana")
def pl_resumen_semanas(
    restaurante_id: int,
    semanas: int = 8,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    hoy = date.today()
    lunes_actual = hoy - timedelta(days=hoy.weekday())
    resultado = []
    for i in range(semanas):
        lunes = lunes_actual - timedelta(weeks=i)
        r = pl_service.calcular_pl_semana(db, restaurante_id, lunes)
        resultado.append({
            "semana_inicio": str(lunes),
            "semana_fin": str(lunes + timedelta(days=6)),
            "ventas_netas": round(r.ventas_netas, 2),
            "utilidad_neta": round(r.utilidad_neta, 2),
            "margen_neto_pct": round(r.margen_neto_pct, 2),
            "food_cost_pct": round(r.food_cost_pct, 2),
            "dias_con_datos": r.dias_con_datos,
        })
    resultado.reverse()
    return {"generado_en": datetime.utcnow().isoformat(), "semanas": resultado}


@router.get("/{restaurante_id}/debug")
def pl_debug(
    restaurante_id: int,
    mes: int = 0,
    anio: int = 0,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Endpoint de diagnóstico — solo SUPER_ADMIN.
    Muestra conteos y sumas crudas sin pasar por el PLService,
    para verificar qué datos existen en la BD para el restaurante.
    """
    if current_user is None or current_user.rol != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail={"detail": "Solo SUPER_ADMIN", "code": "FORBIDDEN"})

    hoy = date.today()
    if not mes:
        mes = hoy.month
    if not anio:
        anio = hoy.year

    from calendar import monthrange
    _, last_day = monthrange(anio, mes)
    fecha_inicio = date(anio, mes, 1)
    fecha_fin = date(anio, mes, last_day)

    # Cierres
    cierres = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.CierreTurno.fecha >= fecha_inicio,
        models.CierreTurno.fecha <= fecha_fin,
    ).all()
    ventas_raw = sum(
        (c.ventas_efectivo or 0) + (c.ventas_parrot or 0) + (c.ventas_terminales or 0) +
        (c.ventas_uber or 0) + (c.ventas_rappi or 0) + (c.otros_ingresos or 0)
        for c in cierres
    )
    cierre_ids = [c.id for c in cierres]

    # Gastos diarios (ligados a esos cierres)
    gd_count = 0
    gd_sum = 0.0
    gd_con_cat = 0
    gd_sin_cat = 0
    if cierre_ids:
        gds = db.query(models.GastoDiario).filter(
            models.GastoDiario.cierre_id.in_(cierre_ids)
        ).all()
        gd_count = len(gds)
        gd_sum = sum(g.monto or 0 for g in gds)
        gd_con_cat = sum(1 for g in gds if g.catalogo_cuenta_id is not None)
        gd_sin_cat = sum(1 for g in gds if g.catalogo_cuenta_id is None)

    # Gastos (tabla gastos) por restaurante_id y fecha
    gs = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.fecha >= fecha_inicio,
        models.Gasto.fecha <= fecha_fin,
    ).all()
    g_count = len(gs)
    g_sum = sum(g.monto or 0 for g in gs)
    g_con_cat = sum(1 for g in gs if g.catalogo_cuenta_id is not None)
    g_sin_cat = sum(1 for g in gs if g.catalogo_cuenta_id is None)

    # Nómina
    nomina_sum = db.query(func.sum(models.NominaPago.neto_pagado)).filter(
        models.NominaPago.restaurante_id == restaurante_id,
        models.NominaPago.fecha_pago >= fecha_inicio,
        models.NominaPago.fecha_pago <= fecha_fin,
    ).scalar() or 0.0

    # Todos los restaurantes para verificar cuál tiene los datos
    restaurantes_con_cierres = db.query(
        models.CierreTurno.restaurante_id,
        func.count(models.CierreTurno.id).label("cnt"),
        func.sum(models.CierreTurno.total_venta).label("total"),
    ).filter(
        models.CierreTurno.fecha >= fecha_inicio,
        models.CierreTurno.fecha <= fecha_fin,
        models.CierreTurno.restaurante_id != None,
    ).group_by(models.CierreTurno.restaurante_id).all()

    return {
        "restaurante_id_usado": restaurante_id,
        "periodo": {"inicio": str(fecha_inicio), "fin": str(fecha_fin)},
        "ventas_raw": round(ventas_raw, 2),
        "cierres_encontrados": len(cierres),
        "gastos_diarios_count": gd_count,
        "gastos_diarios_sum": round(gd_sum, 2),
        "gastos_diarios_con_catalogo": gd_con_cat,
        "gastos_diarios_sin_catalogo": gd_sin_cat,
        "gastos_count": g_count,
        "gastos_sum": round(g_sum, 2),
        "gastos_con_catalogo": g_con_cat,
        "gastos_sin_catalogo": g_sin_cat,
        "nomina_sum": round(float(nomina_sum), 2),
        "cierres_por_restaurante_id": [
            {"restaurante_id": r.restaurante_id, "cierres": r.cnt, "ventas_total": round(float(r.total or 0), 2)}
            for r in restaurantes_con_cierres
        ],
        "hint": "Si ventas_raw==0 pero cierres_por_restaurante_id tiene datos, el restaurante_id no coincide con los datos históricos.",
    }


@router.get("/{restaurante_id}/kpis-hoy")
def pl_kpis_hoy(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_tenant_access(restaurante_id, current_user)
    hoy = date.today()

    # Ventas de hoy
    cierre_hoy = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.CierreTurno.fecha == hoy,
    ).first()
    ventas_hoy = cierre_hoy.total_venta if cierre_hoy else None

    # Promedio mismo día de semana últimas 4 semanas
    dia_semana = hoy.weekday()
    ventas_semanas_anteriores = []
    for i in range(1, 5):
        fecha_ref = hoy - timedelta(weeks=i)
        c = db.query(models.CierreTurno).filter(
            models.CierreTurno.restaurante_id == restaurante_id,
            models.CierreTurno.fecha == fecha_ref,
        ).first()
        if c and c.total_venta:
            ventas_semanas_anteriores.append(c.total_venta)
    promedio_dia = (sum(ventas_semanas_anteriores) / len(ventas_semanas_anteriores)) if ventas_semanas_anteriores else None

    # P&L de hoy
    pl_hoy = pl_service.calcular_pl(db, restaurante_id, hoy, hoy)

    # Alertas activas
    alertas_activas = db.query(models.AlertaLog).filter(
        models.AlertaLog.restaurante_id == restaurante_id,
        models.AlertaLog.revisada == False,
    ).order_by(models.AlertaLog.created_at.desc()).limit(5).all()

    return {
        "generado_en": datetime.utcnow().isoformat(),
        "fecha": str(hoy),
        "ventas_hoy": round(ventas_hoy, 2) if ventas_hoy is not None else None,
        "promedio_dia_semana_4s": round(promedio_dia, 2) if promedio_dia else None,
        "variacion_vs_promedio_pct": round(((ventas_hoy - promedio_dia) / promedio_dia) * 100, 2) if (ventas_hoy and promedio_dia) else None,
        "margen_estimado_hoy": round(pl_hoy.utilidad_neta, 2),
        "food_cost_hoy_pct": round(pl_hoy.food_cost_pct, 2),
        "alertas_activas": [
            {"tipo": a.tipo, "mensaje": a.mensaje, "created_at": str(a.created_at)}
            for a in alertas_activas
        ],
    }
