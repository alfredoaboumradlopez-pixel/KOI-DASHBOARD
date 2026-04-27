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
    incluir_otros: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Devuelve gastos sin catalogo_cuenta_id.
    Con incluir_otros=true también devuelve gastos en 'Otros gastos' (6008)
    para que el usuario pueda revisarlos manualmente.
    """
    from ..services.pl_service import _map_categoria_texto
    cuentas = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).all()

    # ID de la cuenta "Otros gastos" (código 6008) para este restaurante
    id_otros = next((c.id for c in cuentas if c.codigo == "6008"), None)

    def _sugerir(categoria_texto: Optional[str], cuenta_actual_id: Optional[int]):
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
                confianza = "baja"
                if c.id == cuenta_actual_id:
                    confianza = "alta"  # ya está bien categorizado
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": confianza}
        return None

    def _nombre_cuenta(cuenta_id: Optional[int]) -> Optional[str]:
        if not cuenta_id:
            return None
        for c in cuentas:
            if c.id == cuenta_id:
                return c.nombre
        return None

    items = []

    # gastos sin catalogo_cuenta_id
    q_null = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.catalogo_cuenta_id == None,
    ).order_by(models.Gasto.fecha.desc()).limit(200)
    for g in q_null.all():
        items.append({
            "id": g.id, "tabla": "gastos",
            "fecha": str(g.fecha), "proveedor": g.proveedor,
            "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
            "catalogo_cuenta_id": None, "cuenta_nombre": None,
            "es_otros": False,
            "sugerencia": _sugerir(g.categoria, None),
        })

    # gastos en "Otros gastos" (para revisión manual, opcional)
    if incluir_otros and id_otros:
        q_otros = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id,
            models.Gasto.catalogo_cuenta_id == id_otros,
        ).order_by(models.Gasto.fecha.desc()).limit(500)
        for g in q_otros.all():
            items.append({
                "id": g.id, "tabla": "gastos",
                "fecha": str(g.fecha), "proveedor": g.proveedor,
                "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
                "catalogo_cuenta_id": id_otros, "cuenta_nombre": "Otros gastos",
                "es_otros": True,
                "sugerencia": _sugerir(g.categoria, id_otros),
            })

    # gastos_diarios sin catalogo_cuenta_id
    gd_q = db.query(models.GastoDiario, models.CierreTurno.fecha).join(
        models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
    ).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.GastoDiario.catalogo_cuenta_id == None,
    ).order_by(models.CierreTurno.fecha.desc()).limit(200)
    for gd, fecha in gd_q.all():
        items.append({
            "id": gd.id, "tabla": "gastos_diarios",
            "fecha": str(fecha), "proveedor": gd.proveedor,
            "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
            "catalogo_cuenta_id": None, "cuenta_nombre": None,
            "es_otros": False,
            "sugerencia": _sugerir(gd.categoria, None),
        })

    # gastos_diarios en "Otros gastos"
    if incluir_otros and id_otros:
        gd_otros_q = db.query(models.GastoDiario, models.CierreTurno.fecha).join(
            models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
        ).filter(
            models.CierreTurno.restaurante_id == restaurante_id,
            models.GastoDiario.catalogo_cuenta_id == id_otros,
        ).order_by(models.CierreTurno.fecha.desc()).limit(500)
        for gd, fecha in gd_otros_q.all():
            items.append({
                "id": gd.id, "tabla": "gastos_diarios",
                "fecha": str(fecha), "proveedor": gd.proveedor,
                "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
                "catalogo_cuenta_id": id_otros, "cuenta_nombre": "Otros gastos",
                "es_otros": True,
                "sugerencia": _sugerir(gd.categoria, id_otros),
            })

    total_sin_cat = sum(1 for i in items if not i["es_otros"])
    total_en_otros = sum(1 for i in items if i["es_otros"])
    monto_total = sum(i["monto"] for i in items)

    return {
        "total": len(items),
        "total_sin_catalogo": total_sin_cat,
        "total_en_otros": total_en_otros,
        "monto_total": round(monto_total, 2),
        "items": items,
    }


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
