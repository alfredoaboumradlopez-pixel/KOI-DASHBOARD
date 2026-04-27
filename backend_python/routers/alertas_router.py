"""
Endpoints del motor de alertas.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from .. import models
from ..core.auth import get_optional_user
from ..jobs.alertas_job import alertas_job

router = APIRouter(prefix="/api/alertas", tags=["alertas"])

# CRITICAL=0  WARNING=1  INFO=2  (para ordenar por prioridad)
_SEV_ORDER = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}


def _ser_alerta(a: models.AlertaLog) -> dict:
    return {
        "id": a.id,
        "tipo": a.tipo,
        "mensaje": a.mensaje,
        "severidad": getattr(a, "severidad", "WARNING") or "WARNING",
        "valor_detectado": a.valor_detectado,
        "umbral_config": a.umbral_config,
        "revisada": a.revisada,
        "created_at": str(a.created_at),
    }


# ── GET /api/alertas/{restaurante_id}/activas ────────────────────────────────
@router.get("/{restaurante_id}/activas")
def get_alertas_activas(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Alertas no revisadas, ordenadas CRITICAL → WARNING → INFO."""
    alertas = db.query(models.AlertaLog).filter(
        models.AlertaLog.restaurante_id == restaurante_id,
        models.AlertaLog.revisada == False,
    ).order_by(models.AlertaLog.created_at.desc()).all()

    alertas_sorted = sorted(alertas, key=lambda a: _SEV_ORDER.get(
        getattr(a, "severidad", "WARNING") or "WARNING", 1
    ))
    return [_ser_alerta(a) for a in alertas_sorted]


# ── POST /api/alertas/{restaurante_id}/evaluar ───────────────────────────────
@router.post("/{restaurante_id}/evaluar")
def evaluar_alertas(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Dispara evaluación manual. Solo SUPER_ADMIN o ADMIN."""
    if current_user is None or current_user.rol not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail={"detail": "Sin permisos para evaluar alertas", "code": "FORBIDDEN"},
        )
    alertas = alertas_job.evaluar_restaurante(db, restaurante_id)
    return {
        "ok": True,
        "alertas_generadas": len(alertas),
        "tipos": [a.tipo for a in alertas],
    }


# ── PUT /api/alertas/{alerta_id}/revisar ─────────────────────────────────────
@router.put("/{alerta_id}/revisar")
def revisar_alerta(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Marca una alerta como revisada y registra en audit_log."""
    alerta = db.query(models.AlertaLog).filter(models.AlertaLog.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail={"detail": "Alerta no encontrada", "code": "NOT_FOUND"})
    alerta.revisada = True
    db.add(models.AuditLog(
        restaurante_id=alerta.restaurante_id,
        usuario_id=current_user.id if current_user else None,
        accion="REVISAR_ALERTA",
        tabla_afectada="alertas_log",
        registro_id=alerta_id,
        detalle=f"Alerta {alerta.tipo} marcada como revisada",
    ))
    db.commit()
    return {"ok": True, "id": alerta_id}


# ── GET /api/alertas/{restaurante_id}/historial ──────────────────────────────
@router.get("/{restaurante_id}/historial")
def get_historial_alertas(
    restaurante_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Todas las alertas (revisadas y no) de los últimos 30 días. Paginado."""
    hace_30d = datetime.utcnow() - timedelta(days=30)
    base_q = db.query(models.AlertaLog).filter(
        models.AlertaLog.restaurante_id == restaurante_id,
        models.AlertaLog.created_at >= hace_30d,
    )
    total = base_q.count()
    alertas = base_q.order_by(models.AlertaLog.created_at.desc()) \
                    .offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [_ser_alerta(a) for a in alertas],
    }


# ── GET /api/alertas/config/{restaurante_id} ─────────────────────────────────
@router.get("/config/{restaurante_id}")
def get_config_alertas(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Configuración de umbrales del restaurante."""
    configs = db.query(models.AlertaConfig).filter(
        models.AlertaConfig.restaurante_id == restaurante_id,
    ).order_by(models.AlertaConfig.id).all()
    return [
        {
            "id": c.id,
            "tipo": c.tipo,
            "umbral": c.umbral,
            "activo": c.activo,
            "notificar_email": c.notificar_email,
        }
        for c in configs
    ]


class AlertaConfigItem(BaseModel):
    tipo: str
    umbral: float
    activo: bool


# ── PUT /api/alertas/config/{restaurante_id} ─────────────────────────────────
@router.put("/config/{restaurante_id}")
def update_config_alertas(
    restaurante_id: int,
    body: List[AlertaConfigItem],
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Actualiza umbrales. Solo SUPER_ADMIN y ADMIN."""
    if current_user is None or current_user.rol not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail={"detail": "Sin permisos para editar config de alertas", "code": "FORBIDDEN"},
        )
    for item in body:
        config = db.query(models.AlertaConfig).filter(
            models.AlertaConfig.restaurante_id == restaurante_id,
            models.AlertaConfig.tipo == item.tipo,
        ).first()
        if config:
            config.umbral = item.umbral
            config.activo = item.activo
        else:
            db.add(models.AlertaConfig(
                restaurante_id=restaurante_id,
                tipo=item.tipo,
                umbral=item.umbral,
                activo=item.activo,
            ))
    db.commit()
    return {"ok": True, "actualizados": len(body)}
