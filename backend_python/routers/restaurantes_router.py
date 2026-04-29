"""
Gestión de restaurantes — solo SUPER_ADMIN
"""
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from pydantic import BaseModel
from ..database import get_db
from .. import models
from ..core.auth import get_current_user, require_roles, get_password_hash

router = APIRouter(prefix="/api/restaurantes", tags=["restaurantes"])
super_admin_only = require_roles("SUPER_ADMIN")

class RestauranteCreate(BaseModel):
    nombre: str
    slug: str
    plan: str = "basico"
    timezone: str = "America/Mexico_City"
    moneda: str = "MXN"

class UsuarioCreate(BaseModel):
    email: str
    password: str
    nombre: str
    rol: str = "ADMIN"

@router.post("", status_code=201)
def crear_restaurante(data: RestauranteCreate, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    if db.query(models.Restaurante).filter(models.Restaurante.slug == data.slug).first():
        raise HTTPException(status_code=400, detail={"detail": "Slug ya existe", "code": "SLUG_EXISTS"})
    r = models.Restaurante(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r

@router.get("")
def listar_restaurantes(_=Depends(super_admin_only), db: Session = Depends(get_db)):
    restaurantes = db.query(models.Restaurante).all()
    result = []
    for r in restaurantes:
        last_cierre = db.query(models.CierreTurno).filter(
            models.CierreTurno.restaurante_id == r.id
        ).order_by(models.CierreTurno.fecha.desc()).first()
        ventas_mes = db.query(func.sum(models.CierreTurno.total_venta)).filter(
            models.CierreTurno.restaurante_id == r.id,
            extract("month", models.CierreTurno.fecha) == datetime.utcnow().month,
            extract("year", models.CierreTurno.fecha) == datetime.utcnow().year,
        ).scalar() or 0.0
        result.append({
            "id": r.id, "nombre": r.nombre, "slug": r.slug, "plan": r.plan,
            "activo": r.activo, "created_at": r.created_at,
            "ventas_mes": ventas_mes,
            "ultimo_cierre": str(last_cierre.fecha) if last_cierre else None,
        })
    return result

@router.get("/{slug}")
def detalle_restaurante(slug: str, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    return r

@router.put("/{slug}")
def actualizar_restaurante(slug: str, data: RestauranteCreate, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r

@router.post("/{slug}/usuarios", status_code=201)
def crear_usuario_restaurante(slug: str, data: UsuarioCreate, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    if db.query(models.Usuario).filter(models.Usuario.email == data.email.lower()).first():
        raise HTTPException(status_code=400, detail={"detail": "Email ya registrado", "code": "EMAIL_EXISTS"})
    u = models.Usuario(
        email=data.email.lower().strip(),
        hashed_password=get_password_hash(data.password),
        nombre=data.nombre,
        rol=data.rol,
        restaurante_id=r.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "email": u.email, "nombre": u.nombre, "rol": u.rol, "restaurante_id": u.restaurante_id}

@router.post("/{slug}/alertas-config", status_code=201)
def crear_alertas_config(slug: str, configs: list, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    db.query(models.AlertaConfig).filter(models.AlertaConfig.restaurante_id == r.id).delete()
    for c in configs:
        db.add(models.AlertaConfig(restaurante_id=r.id, tipo=c["tipo"], umbral=float(c["umbral"]), activo=True))
    db.commit()
    return {"ok": True, "count": len(configs)}

@router.delete("/{slug}")
def eliminar_restaurante(slug: str, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    db.delete(r)
    db.commit()
    return {"ok": True}

@router.get("/{slug}/health")
def health_restaurante(slug: str, _=Depends(super_admin_only), db: Session = Depends(get_db)):
    r = db.query(models.Restaurante).filter(models.Restaurante.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail={"detail": "Restaurante no encontrado", "code": "NOT_FOUND"})
    last_cierre = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == r.id
    ).order_by(models.CierreTurno.fecha.desc()).first()
    dias_sin_cierre = 0
    if last_cierre:
        dias_sin_cierre = (date.today() - last_cierre.fecha).days
    elif db.query(models.CierreTurno).filter(models.CierreTurno.restaurante_id == r.id).count() > 0:
        dias_sin_cierre = 999
    alertas_activas = db.query(models.AlertaLog).filter(
        models.AlertaLog.restaurante_id == r.id,
        models.AlertaLog.revisada == False
    ).count()
    gastos_sin_categoria = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == r.id,
        models.Gasto.categoria.in_(["", "OTROS", None])
    ).count()
    semaforo = "verde"
    if dias_sin_cierre > 2 or alertas_activas > 3:
        semaforo = "rojo"
    elif dias_sin_cierre > 0 or alertas_activas > 0:
        semaforo = "amarillo"
    return {
        "restaurante": r.nombre,
        "semaforo": semaforo,
        "alertas_activas": alertas_activas,
        "ultimo_cierre": str(last_cierre.fecha) if last_cierre else None,
        "dias_sin_cierre": dias_sin_cierre,
        "gastos_sin_categoria": gastos_sin_categoria,
        "margen_semana": None,
    }
