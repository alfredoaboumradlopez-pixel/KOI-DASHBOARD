"""
Endpoints para categorizar gastos y gestionar la cola de revisión
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from .. import models
from ..core.auth import get_optional_user, get_restaurante_id

router = APIRouter(tags=["gastos-categorizacion"])

ROLES_CATEGORIZAR = ("SUPER_ADMIN", "ADMIN", "OPERADOR")


def _check_rol(user: Optional[models.Usuario]):
    if user and user.rol not in ROLES_CATEGORIZAR:
        raise HTTPException(status_code=403, detail={"detail": "Sin permisos para categorizar", "code": "FORBIDDEN"})


def _audit(db: Session, user: Optional[models.Usuario], restaurante_id: int, tabla: str, registro_id: int, detalle: str):
    log = models.AuditLog(
        restaurante_id=restaurante_id,
        usuario_id=user.id if user else None,
        accion="CATEGORIZAR_GASTO",
        tabla_afectada=tabla,
        registro_id=registro_id,
        detalle=detalle,
    )
    db.add(log)


class CategorizarBody(BaseModel):
    catalogo_cuenta_id: int


class BatchItem(BaseModel):
    id: int
    tabla: str  # "gastos" o "gastos_diarios"
    catalogo_cuenta_id: int


@router.put("/api/gastos/{gasto_id}/categorizar")
def categorizar_gasto(
    gasto_id: int,
    body: CategorizarBody,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_rol(current_user)
    g = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail={"detail": "Gasto no encontrado", "code": "NOT_FOUND"})
    cuenta = db.query(models.CatalogoCuenta).filter(models.CatalogoCuenta.id == body.catalogo_cuenta_id).first()
    if not cuenta:
        raise HTTPException(status_code=400, detail={"detail": "Cuenta contable no encontrada", "code": "INVALID_CUENTA"})
    old_id = g.catalogo_cuenta_id
    g.catalogo_cuenta_id = body.catalogo_cuenta_id
    restaurante_id = g.restaurante_id or get_restaurante_id(current_user)
    _audit(db, current_user, restaurante_id, "gastos", gasto_id, f"catalogo_cuenta_id: {old_id} → {body.catalogo_cuenta_id}")
    db.commit()
    return {"ok": True, "id": gasto_id, "catalogo_cuenta_id": body.catalogo_cuenta_id}


@router.put("/api/gastos-diarios/{gasto_id}/categorizar")
def categorizar_gasto_diario(
    gasto_id: int,
    body: CategorizarBody,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_rol(current_user)
    g = db.query(models.GastoDiario).filter(models.GastoDiario.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail={"detail": "Gasto diario no encontrado", "code": "NOT_FOUND"})
    cuenta = db.query(models.CatalogoCuenta).filter(models.CatalogoCuenta.id == body.catalogo_cuenta_id).first()
    if not cuenta:
        raise HTTPException(status_code=400, detail={"detail": "Cuenta contable no encontrada", "code": "INVALID_CUENTA"})
    old_id = g.catalogo_cuenta_id
    g.catalogo_cuenta_id = body.catalogo_cuenta_id
    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.id == g.cierre_id).first()
    restaurante_id = cierre.restaurante_id if cierre else get_restaurante_id(current_user)
    _audit(db, current_user, restaurante_id, "gastos_diarios", gasto_id, f"catalogo_cuenta_id: {old_id} → {body.catalogo_cuenta_id}")
    db.commit()
    return {"ok": True, "id": gasto_id, "catalogo_cuenta_id": body.catalogo_cuenta_id}


@router.get("/api/gastos/sin-categorizar/{restaurante_id}")
def gastos_sin_categorizar(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    from ..services.pl_service import _map_categoria_texto
    cuentas = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).all()

    def _sugerir(categoria_texto: Optional[str]):
        if not categoria_texto:
            return None
        txt_lower = categoria_texto.lower().strip()
        # Exact nombre match
        for c in cuentas:
            if c.nombre.lower().strip() == txt_lower:
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": "alta"}
        # Substring match
        for c in cuentas:
            if txt_lower in c.nombre.lower() or c.nombre.lower() in txt_lower:
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": "media"}
        # Fallback map
        cat_pl = _map_categoria_texto(categoria_texto)
        for c in cuentas:
            if c.categoria_pl == cat_pl:
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": "baja"}
        return None

    items = []

    # gastos sin catalogo_cuenta_id
    gastos = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.catalogo_cuenta_id == None,
    ).order_by(models.Gasto.fecha.desc()).limit(200).all()
    for g in gastos:
        items.append({
            "id": g.id, "tabla": "gastos",
            "fecha": str(g.fecha), "proveedor": g.proveedor,
            "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
            "sugerencia": _sugerir(g.categoria),
        })

    # gastos_diarios sin catalogo_cuenta_id (últimas 200)
    gd_q = db.query(models.GastoDiario, models.CierreTurno.fecha).join(
        models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
    ).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.GastoDiario.catalogo_cuenta_id == None,
    ).order_by(models.CierreTurno.fecha.desc()).limit(200).all()
    for gd, fecha in gd_q:
        items.append({
            "id": gd.id, "tabla": "gastos_diarios",
            "fecha": str(fecha), "proveedor": gd.proveedor,
            "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
            "sugerencia": _sugerir(gd.categoria),
        })

    return {"total": len(items), "items": items}


@router.post("/api/gastos/categorizar-batch")
def categorizar_batch(
    items: List[BatchItem],
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_rol(current_user)
    ok = 0
    errores = []
    for item in items:
        try:
            cuenta = db.query(models.CatalogoCuenta).filter(models.CatalogoCuenta.id == item.catalogo_cuenta_id).first()
            if not cuenta:
                errores.append({"id": item.id, "tabla": item.tabla, "error": "Cuenta no encontrada"})
                continue
            if item.tabla == "gastos":
                g = db.query(models.Gasto).filter(models.Gasto.id == item.id).first()
                if g:
                    g.catalogo_cuenta_id = item.catalogo_cuenta_id
                    restaurante_id = g.restaurante_id or get_restaurante_id(current_user)
                    _audit(db, current_user, restaurante_id, "gastos", item.id, f"batch → {item.catalogo_cuenta_id}")
                    ok += 1
                else:
                    errores.append({"id": item.id, "tabla": item.tabla, "error": "No encontrado"})
            elif item.tabla == "gastos_diarios":
                g = db.query(models.GastoDiario).filter(models.GastoDiario.id == item.id).first()
                if g:
                    g.catalogo_cuenta_id = item.catalogo_cuenta_id
                    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.id == g.cierre_id).first()
                    restaurante_id = cierre.restaurante_id if cierre else get_restaurante_id(current_user)
                    _audit(db, current_user, restaurante_id, "gastos_diarios", item.id, f"batch → {item.catalogo_cuenta_id}")
                    ok += 1
                else:
                    errores.append({"id": item.id, "tabla": item.tabla, "error": "No encontrado"})
            else:
                errores.append({"id": item.id, "tabla": item.tabla, "error": "Tabla inválida"})
        except Exception as e:
            errores.append({"id": item.id, "tabla": item.tabla, "error": str(e)})
    db.commit()
    return {"categorizados": ok, "errores": errores, "total_procesados": len(items)}
