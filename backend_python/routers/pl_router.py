"""
Endpoints del P&L automático en tiempo real
"""
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
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
