"""
Tabulador de Propinas — distribución semanal de propinas entre empleados.
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/propinas", tags=["propinas"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
WEEKDAY_MAP = {0: "lun", 1: "mar", 2: "mie", 3: "jue", 4: "vie", 5: "sab", 6: "dom"}


def _fecha_semana(anio: int, semana: int):
    """Retorna (fecha_inicio_lunes, fecha_fin_domingo) de una semana ISO."""
    inicio = date.fromisocalendar(anio, semana, 1)   # Monday
    fin    = date.fromisocalendar(anio, semana, 7)   # Sunday
    return inicio, fin


def _calcular_pool_diario(restaurante_id: int, semana: int, anio: int, db: Session) -> dict:
    """
    Consulta cierres_turno para la semana ISO dada.
    Suma propinas_efectivo + propinas_parrot + propinas_terminales por día.
    Devuelve dict {lun: X, mar: X, ...} en base al porcentaje de empleados configurado.
    """
    inicio, fin = _fecha_semana(anio, semana)

    config = db.query(models.PropinaConfig).filter(
        models.PropinaConfig.restaurante_id == restaurante_id
    ).first()
    pct = (config.porcentaje_empleados / 100.0) if config else 0.9

    # Agrupar cierres por fecha
    cierres = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.CierreTurno.fecha >= inicio,
        models.CierreTurno.fecha <= fin,
    ).all()

    pool = {d: 0.0 for d in DIAS}
    for c in cierres:
        if c.fecha is None:
            continue
        dia_key = WEEKDAY_MAP.get(c.fecha.weekday())
        if dia_key is None:
            continue
        total_prop = (
            (c.propinas_efectivo or 0.0)
            + (c.propinas_parrot or 0.0)
            + (c.propinas_terminales or 0.0)
        )
        pool[dia_key] += total_prop * pct

    return pool


def _recalcular_semana(semana: models.PropinasSemana):
    """Recalcula propina_calculada y total_neto de cada empleado basado en los días trabajados."""
    empleados = semana.empleados
    pool = {
        "lun": semana.propina_lun or 0.0,
        "mar": semana.propina_mar or 0.0,
        "mie": semana.propina_mie or 0.0,
        "jue": semana.propina_jue or 0.0,
        "vie": semana.propina_vie or 0.0,
        "sab": semana.propina_sab or 0.0,
        "dom": semana.propina_dom or 0.0,
    }

    # Count workers per day
    trabajadores_por_dia = {d: 0 for d in DIAS}
    for emp in empleados:
        for d in DIAS:
            if getattr(emp, f"trabajo_{d}", False):
                trabajadores_por_dia[d] += 1

    # Assign propina per employee
    for emp in empleados:
        total = 0.0
        for d in DIAS:
            if getattr(emp, f"trabajo_{d}", False):
                n = trabajadores_por_dia[d]
                if n > 0:
                    total += pool[d] / n
        emp.propina_calculada = round(total, 2)
        emp.total_neto = round(total - (emp.adelanto or 0.0), 2)

    # Totals for semana
    semana.total_propinas = sum(pool.values())
    semana.total_empleados = round(sum(e.propina_calculada for e in empleados), 2)
    semana.total_restaurante = round(semana.total_propinas - semana.total_empleados, 2)


def _serialize_semana(s: models.PropinasSemana) -> dict:
    return {
        "id": s.id,
        "restaurante_id": s.restaurante_id,
        "numero_semana": s.numero_semana,
        "anio": s.anio,
        "fecha_inicio": str(s.fecha_inicio),
        "fecha_fin": str(s.fecha_fin),
        "propina_lun": s.propina_lun or 0,
        "propina_mar": s.propina_mar or 0,
        "propina_mie": s.propina_mie or 0,
        "propina_jue": s.propina_jue or 0,
        "propina_vie": s.propina_vie or 0,
        "propina_sab": s.propina_sab or 0,
        "propina_dom": s.propina_dom or 0,
        "total_propinas": s.total_propinas or 0,
        "total_empleados": s.total_empleados or 0,
        "total_restaurante": s.total_restaurante or 0,
        "estado": s.estado or "borrador",
        "empleados": [_serialize_empleado(e) for e in (s.empleados or [])],
    }


def _serialize_empleado(e: models.PropinasEmpleado) -> dict:
    return {
        "id": e.id,
        "semana_id": e.semana_id,
        "nombre": e.nombre,
        "trabajo_lun": e.trabajo_lun or False,
        "trabajo_mar": e.trabajo_mar or False,
        "trabajo_mie": e.trabajo_mie or False,
        "trabajo_jue": e.trabajo_jue or False,
        "trabajo_vie": e.trabajo_vie or False,
        "trabajo_sab": e.trabajo_sab or False,
        "trabajo_dom": e.trabajo_dom or False,
        "propina_calculada": e.propina_calculada or 0,
        "adelanto": e.adelanto or 0,
        "total_neto": e.total_neto or 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class EmpleadoCreate(BaseModel):
    nombre: str


class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    trabajo_lun: Optional[bool] = None
    trabajo_mar: Optional[bool] = None
    trabajo_mie: Optional[bool] = None
    trabajo_jue: Optional[bool] = None
    trabajo_vie: Optional[bool] = None
    trabajo_sab: Optional[bool] = None
    trabajo_dom: Optional[bool] = None
    adelanto: Optional[float] = None


class SemanaPoolUpdate(BaseModel):
    propina_lun: Optional[float] = None
    propina_mar: Optional[float] = None
    propina_mie: Optional[float] = None
    propina_jue: Optional[float] = None
    propina_vie: Optional[float] = None
    propina_sab: Optional[float] = None
    propina_dom: Optional[float] = None


class ConfigUpdate(BaseModel):
    porcentaje_empleados: float
    porcentaje_restaurante: float


# ─────────────────────────────────────────────────────────────────────────────
# Config endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/config/{restaurante_id}")
def get_config(restaurante_id: int, db: Session = Depends(get_db)):
    cfg = db.query(models.PropinaConfig).filter(
        models.PropinaConfig.restaurante_id == restaurante_id
    ).first()
    if not cfg:
        return {"restaurante_id": restaurante_id, "porcentaje_empleados": 90.0, "porcentaje_restaurante": 10.0}
    return {
        "id": cfg.id,
        "restaurante_id": cfg.restaurante_id,
        "porcentaje_empleados": cfg.porcentaje_empleados,
        "porcentaje_restaurante": cfg.porcentaje_restaurante,
    }


@router.put("/config/{restaurante_id}")
def update_config(restaurante_id: int, data: ConfigUpdate, db: Session = Depends(get_db)):
    if abs(data.porcentaje_empleados + data.porcentaje_restaurante - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="Los porcentajes deben sumar 100")
    cfg = db.query(models.PropinaConfig).filter(
        models.PropinaConfig.restaurante_id == restaurante_id
    ).first()
    if not cfg:
        cfg = models.PropinaConfig(
            restaurante_id=restaurante_id,
            porcentaje_empleados=data.porcentaje_empleados,
            porcentaje_restaurante=data.porcentaje_restaurante,
        )
        db.add(cfg)
    else:
        cfg.porcentaje_empleados = data.porcentaje_empleados
        cfg.porcentaje_restaurante = data.porcentaje_restaurante
        cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return {"id": cfg.id, "restaurante_id": cfg.restaurante_id,
            "porcentaje_empleados": cfg.porcentaje_empleados,
            "porcentaje_restaurante": cfg.porcentaje_restaurante}


# ─────────────────────────────────────────────────────────────────────────────
# Semanas list
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/semanas/{restaurante_id}")
def listar_semanas(
    restaurante_id: int,
    anio: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.PropinasSemana).filter(
        models.PropinasSemana.restaurante_id == restaurante_id
    )
    if anio:
        q = q.filter(models.PropinasSemana.anio == anio)
    semanas = q.order_by(models.PropinasSemana.anio.desc(), models.PropinasSemana.numero_semana.desc()).all()
    return [_serialize_semana(s) for s in semanas]


# ─────────────────────────────────────────────────────────────────────────────
# Semana detail / creation
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/semana/{restaurante_id}")
def get_semana(
    restaurante_id: int,
    semana: int = Query(...),
    anio: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Retorna (o crea) la semana. Carga el pool de propinas desde cierres_turno si es nuevo.
    """
    existing = db.query(models.PropinasSemana).filter(
        models.PropinasSemana.restaurante_id == restaurante_id,
        models.PropinasSemana.numero_semana == semana,
        models.PropinasSemana.anio == anio,
    ).first()

    if existing:
        return _serialize_semana(existing)

    # Create new week record
    inicio, fin = _fecha_semana(anio, semana)
    pool = _calcular_pool_diario(restaurante_id, semana, anio, db)

    nueva = models.PropinasSemana(
        restaurante_id=restaurante_id,
        numero_semana=semana,
        anio=anio,
        fecha_inicio=inicio,
        fecha_fin=fin,
        propina_lun=pool["lun"],
        propina_mar=pool["mar"],
        propina_mie=pool["mie"],
        propina_jue=pool["jue"],
        propina_vie=pool["vie"],
        propina_sab=pool["sab"],
        propina_dom=pool["dom"],
        estado="borrador",
    )
    nueva.total_propinas = sum(pool.values())
    nueva.total_empleados = 0.0
    nueva.total_restaurante = nueva.total_propinas
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return _serialize_semana(nueva)


@router.put("/semana/{semana_id}/pool")
def update_pool(semana_id: int, data: SemanaPoolUpdate, db: Session = Depends(get_db)):
    """Actualiza manualmente los montos de propinas diarias."""
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == semana_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Semana no encontrada")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    _recalcular_semana(s)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize_semana(s)


@router.put("/semana/{semana_id}/estado")
def update_estado(semana_id: int, estado: str = Query(...), db: Session = Depends(get_db)):
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == semana_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Semana no encontrada")
    if estado not in ("borrador", "cerrado"):
        raise HTTPException(status_code=400, detail="Estado inválido (borrador|cerrado)")
    s.estado = estado
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize_semana(s)


@router.post("/semana/{semana_id}/recalcular")
def recalcular(semana_id: int, db: Session = Depends(get_db)):
    """Re-carga pool desde cierres_turno y recalcula empleados."""
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == semana_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Semana no encontrada")
    pool = _calcular_pool_diario(s.restaurante_id, s.numero_semana, s.anio, db)
    for d in DIAS:
        setattr(s, f"propina_{d}", pool[d])
    _recalcular_semana(s)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize_semana(s)


# ─────────────────────────────────────────────────────────────────────────────
# Empleados
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/semana/{semana_id}/empleado", status_code=201)
def crear_empleado(semana_id: int, data: EmpleadoCreate, db: Session = Depends(get_db)):
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == semana_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Semana no encontrada")
    emp = models.PropinasEmpleado(
        semana_id=semana_id,
        nombre=data.nombre.strip(),
        trabajo_lun=False, trabajo_mar=False, trabajo_mie=False,
        trabajo_jue=False, trabajo_vie=False, trabajo_sab=False, trabajo_dom=False,
        propina_calculada=0.0, adelanto=0.0, total_neto=0.0,
    )
    db.add(emp)
    db.flush()
    _recalcular_semana(s)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize_semana(s)


@router.put("/empleado/{empleado_id}")
def update_empleado(empleado_id: int, data: EmpleadoUpdate, db: Session = Depends(get_db)):
    emp = db.query(models.PropinasEmpleado).filter(models.PropinasEmpleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(emp, field, value)
    emp.updated_at = datetime.utcnow()
    # Recalculate whole week
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == emp.semana_id).first()
    _recalcular_semana(s)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize_semana(s)


@router.delete("/empleado/{empleado_id}")
def delete_empleado(empleado_id: int, db: Session = Depends(get_db)):
    emp = db.query(models.PropinasEmpleado).filter(models.PropinasEmpleado.id == empleado_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    semana_id = emp.semana_id
    db.delete(emp)
    db.flush()
    s = db.query(models.PropinasSemana).filter(models.PropinasSemana.id == semana_id).first()
    if s:
        _recalcular_semana(s)
        s.updated_at = datetime.utcnow()
    db.commit()
    if s:
        db.refresh(s)
        return _serialize_semana(s)
    return {"ok": True}
