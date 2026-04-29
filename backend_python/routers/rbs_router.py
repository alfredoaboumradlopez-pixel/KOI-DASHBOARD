"""
RBS — Gastos por Transferencia con Factura y Comprobante de Pago
"""
import base64
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/rbs", tags=["rbs"])


class GastoTransferenciaCreate(BaseModel):
    proveedor: str
    categoria: str
    descripcion: Optional[str] = None
    monto: float
    fecha_factura: date
    fecha_vencimiento: Optional[date] = None


class GastoTransferenciaUpdate(BaseModel):
    proveedor: Optional[str] = None
    categoria: Optional[str] = None
    descripcion: Optional[str] = None
    monto: Optional[float] = None
    fecha_factura: Optional[date] = None
    fecha_vencimiento: Optional[date] = None


def _serialize(g: models.GastoTransferencia) -> dict:
    hoy = date.today()
    estado = g.estado
    # Auto-calcular VENCIDO
    if estado == "PENDIENTE" and g.fecha_vencimiento and g.fecha_vencimiento < hoy:
        estado = "VENCIDO"
    return {
        "id": g.id,
        "restaurante_id": g.restaurante_id,
        "proveedor": g.proveedor,
        "categoria": g.categoria,
        "descripcion": g.descripcion,
        "monto": g.monto,
        "fecha_factura": str(g.fecha_factura),
        "fecha_vencimiento": str(g.fecha_vencimiento) if g.fecha_vencimiento else None,
        "factura_nombre": g.factura_nombre,
        "tiene_factura": bool(g.factura_url),
        "comprobante_pago_nombre": g.comprobante_pago_nombre,
        "tiene_comprobante": bool(g.comprobante_pago_url),
        "estado": estado,
        "fecha_pago": str(g.fecha_pago) if g.fecha_pago else None,
        "created_at": str(g.created_at),
    }


@router.get("/{restaurante_id}")
def listar_rbs(
    restaurante_id: int,
    estado: Optional[str] = None,
    mes: Optional[int] = None,
    anio: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.restaurante_id == restaurante_id
    )
    if mes and anio:
        from sqlalchemy import extract
        q = q.filter(
            extract("month", models.GastoTransferencia.fecha_factura) == mes,
            extract("year", models.GastoTransferencia.fecha_factura) == anio,
        )
    items = q.order_by(models.GastoTransferencia.fecha_factura.desc()).all()
    result = [_serialize(g) for g in items]
    if estado:
        result = [r for r in result if r["estado"] == estado.upper()]
    return result


@router.get("/{restaurante_id}/pendientes")
def listar_pendientes(restaurante_id: int, db: Session = Depends(get_db)):
    items = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.restaurante_id == restaurante_id,
        models.GastoTransferencia.estado == "PENDIENTE",
    ).order_by(models.GastoTransferencia.fecha_vencimiento.asc()).all()
    return [_serialize(g) for g in items]


@router.post("/{restaurante_id}", status_code=201)
def crear_rbs(restaurante_id: int, data: GastoTransferenciaCreate, db: Session = Depends(get_db)):
    g = models.GastoTransferencia(
        restaurante_id=restaurante_id,
        proveedor=data.proveedor.strip(),
        categoria=data.categoria,
        descripcion=data.descripcion,
        monto=data.monto,
        fecha_factura=data.fecha_factura,
        fecha_vencimiento=data.fecha_vencimiento,
        estado="PENDIENTE",
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.put("/{restaurante_id}/{gasto_id}")
def actualizar_rbs(
    restaurante_id: int, gasto_id: int,
    data: GastoTransferenciaUpdate, db: Session = Depends(get_db)
):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(g, field, value)
    g.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.delete("/{restaurante_id}/{gasto_id}")
def eliminar_rbs(restaurante_id: int, gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(g)
    db.commit()
    return {"ok": True}


@router.post("/{restaurante_id}/{gasto_id}/factura")
async def subir_factura(
    restaurante_id: int, gasto_id: int,
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máximo 10MB)")
    b64 = base64.b64encode(content).decode("utf-8")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    g.factura_url = f"data:application/{ext};base64,{b64}"
    g.factura_nombre = file.filename
    g.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.post("/{restaurante_id}/{gasto_id}/comprobante")
async def subir_comprobante(
    restaurante_id: int, gasto_id: int,
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máximo 10MB)")
    b64 = base64.b64encode(content).decode("utf-8")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    g.comprobante_pago_url = f"data:application/{ext};base64,{b64}"
    g.comprobante_pago_nombre = file.filename
    g.estado = "PAGADO"
    g.fecha_pago = date.today()
    g.updated_at = datetime.utcnow()
    db.commit()

    # Crear registro en gastos para que entre al P&L
    try:
        gasto_pl = models.Gasto(
            fecha=g.fecha_pago,
            proveedor=g.proveedor,
            categoria=g.categoria,
            monto=g.monto,
            metodo_pago="TRANSFERENCIA",
            comprobante="FACTURA" if g.factura_url else "SIN_COMPROBANTE",
            descripcion=f"[RBS] {g.descripcion or g.proveedor}",
            restaurante_id=g.restaurante_id,
        )
        db.add(gasto_pl)
        db.commit()
    except Exception:
        pass  # No bloquear si falla

    db.refresh(g)
    return _serialize(g)


@router.get("/{restaurante_id}/{gasto_id}/factura/archivo")
def descargar_factura(restaurante_id: int, gasto_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import Response
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g or not g.factura_url:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if g.factura_url.startswith("data:"):
        _, b64part = g.factura_url.split(",", 1)
        content = base64.b64decode(b64part)
        ext = (g.factura_nombre or "archivo").rsplit(".", 1)[-1].lower()
        media = "application/pdf" if ext == "pdf" else f"image/{ext}"
        return Response(content=content, media_type=media,
                        headers={"Content-Disposition": f'inline; filename="{g.factura_nombre}"'})
    raise HTTPException(status_code=404, detail="Archivo no disponible")


@router.get("/{restaurante_id}/{gasto_id}/comprobante/archivo")
def descargar_comprobante(restaurante_id: int, gasto_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import Response
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g or not g.comprobante_pago_url:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    if g.comprobante_pago_url.startswith("data:"):
        _, b64part = g.comprobante_pago_url.split(",", 1)
        content = base64.b64decode(b64part)
        ext = (g.comprobante_pago_nombre or "archivo").rsplit(".", 1)[-1].lower()
        media = "application/pdf" if ext == "pdf" else f"image/{ext}"
        return Response(content=content, media_type=media,
                        headers={"Content-Disposition": f'inline; filename="{g.comprobante_pago_nombre}"'})
    raise HTTPException(status_code=404, detail="Archivo no disponible")
