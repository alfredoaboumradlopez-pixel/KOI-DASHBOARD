"""
RBS — Gastos por Transferencia con Factura, Comprobante de Pago y Parser de PDF.
"""
import base64
import json
import os
import tempfile
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import extract
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..services.pdf_parser import InvoiceParser, match_payment_to_invoice, parse_image_with_vision

router = APIRouter(prefix="/api/rbs", tags=["rbs"])


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class GastoTransferenciaCreate(BaseModel):
    proveedor: str
    categoria: str
    descripcion: Optional[str] = None
    monto: float
    fecha_factura: date
    fecha_vencimiento: Optional[date] = None
    folio: Optional[str] = None
    folio_fiscal: Optional[str] = None
    rfc_emisor: Optional[str] = None
    items_json: Optional[str] = None
    estado: Optional[str] = "PENDIENTE"
    fecha_pago: Optional[date] = None


class GastoTransferenciaUpdate(BaseModel):
    proveedor: Optional[str] = None
    categoria: Optional[str] = None
    descripcion: Optional[str] = None
    monto: Optional[float] = None
    fecha_factura: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    folio: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Serializer
# ─────────────────────────────────────────────────────────────────────────────

def _serialize(g: models.GastoTransferencia) -> dict:
    hoy = date.today()
    estado = g.estado
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
        "folio": g.folio,
        "folio_fiscal": g.folio_fiscal,
        "rfc_emisor": g.rfc_emisor,
        "created_at": str(g.created_at),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Parse PDF — DEBE ir antes de los wildcards /{restaurante_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/parse-invoice")
async def parse_invoice(
    file: UploadFile = File(...),
    restaurante_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Parsea PDF, JPEG o PNG de factura o comprobante de pago.
    - PDF  → pdfplumber / Claude Vision (fallback escaneados)
    - JPEG/PNG → Claude Vision directo
    Si es comprobante, intenta match automático con facturas pendientes.
    IMPORTANTE: debe estar antes de POST /{restaurante_id} para evitar conflicto de rutas.
    """
    filename = (file.filename or "").lower()
    is_pdf   = filename.endswith(".pdf")
    is_image = filename.endswith((".jpg", ".jpeg", ".png"))

    if not is_pdf and not is_image:
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF, JPG o PNG")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máximo 10MB)")

    suffix     = ".pdf" if is_pdf else (".png" if filename.endswith(".png") else ".jpg")
    media_type = "image/png" if filename.endswith(".png") else "image/jpeg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        import traceback as _tb
        try:
            if is_image:
                result = await parse_image_with_vision(tmp_path, media_type)
            else:
                parser = InvoiceParser()
                result = parser.parse(tmp_path)
        except Exception as _parse_err:
            print(f"PARSE ERROR: {_tb.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Error al parsear archivo: {str(_parse_err)}")

        # Si es comprobante → intentar match con facturas pendientes
        if result.get("tipo_parser") == "comprobante_pago":
            try:
                facturas_db = db.query(models.GastoTransferencia).filter(
                    models.GastoTransferencia.restaurante_id == restaurante_id,
                    models.GastoTransferencia.estado == "PENDIENTE",
                ).all()
                facturas_list = [_serialize(f) for f in facturas_db]
                match_result = match_payment_to_invoice(result, facturas_list)
                result["match_sugerido"] = match_result
            except Exception as e:
                result["match_sugerido"] = None
                result["match_error"] = str(e)

        return {"ok": True, "data": result}

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# CRUD endpoints (wildcards van DESPUÉS de rutas estáticas)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{restaurante_id}/pendientes")
def listar_pendientes(restaurante_id: int, db: Session = Depends(get_db)):
    items = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.restaurante_id == restaurante_id,
        models.GastoTransferencia.estado == "PENDIENTE",
    ).order_by(models.GastoTransferencia.fecha_vencimiento.asc()).all()
    return [_serialize(g) for g in items]


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
        q = q.filter(
            extract("month", models.GastoTransferencia.fecha_factura) == mes,
            extract("year", models.GastoTransferencia.fecha_factura) == anio,
        )
    items = q.order_by(models.GastoTransferencia.fecha_factura.desc()).all()
    result = [_serialize(g) for g in items]
    if estado:
        result = [r for r in result if r["estado"] == estado.upper()]
    return result


@router.post("/{restaurante_id}", status_code=201)
def crear_rbs(restaurante_id: int, data: GastoTransferenciaCreate, db: Session = Depends(get_db)):
    import traceback as _tb
    try:
        g = models.GastoTransferencia(
            restaurante_id=restaurante_id,
            proveedor=data.proveedor.strip(),
            categoria=data.categoria or "OTROS",
            descripcion=data.descripcion,
            monto=data.monto,
            fecha_factura=data.fecha_factura,
            fecha_vencimiento=data.fecha_vencimiento,
            estado=data.estado or "PENDIENTE",
            fecha_pago=data.fecha_pago,
            folio=data.folio,
            folio_fiscal=data.folio_fiscal,
            rfc_emisor=data.rfc_emisor,
            items_json=data.items_json,
        )
        db.add(g)
        db.commit()
        db.refresh(g)
        return _serialize(g)
    except Exception as _err:
        db.rollback()
        print(f"CREAR_RBS ERROR: {_tb.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(_err)}")


@router.put("/{restaurante_id}/{gasto_id}")
def actualizar_rbs(
    restaurante_id: int, gasto_id: int,
    data: GastoTransferenciaUpdate, db: Session = Depends(get_db),
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


# ─────────────────────────────────────────────────────────────────────────────
# Subir archivos
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{restaurante_id}/{gasto_id}/factura")
async def subir_factura(
    restaurante_id: int, gasto_id: int,
    file: UploadFile = File(...), db: Session = Depends(get_db),
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
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    g.factura_url = f"data:application/{ext};base64,{base64.b64encode(content).decode()}"
    g.factura_nombre = file.filename
    g.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.post("/{restaurante_id}/{gasto_id}/comprobante")
async def subir_comprobante(
    restaurante_id: int, gasto_id: int,
    file: UploadFile = File(...), db: Session = Depends(get_db),
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
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    g.comprobante_pago_url = f"data:application/{ext};base64,{base64.b64encode(content).decode()}"
    g.comprobante_pago_nombre = file.filename
    g.estado = "PAGADO"
    g.fecha_pago = date.today()
    g.updated_at = datetime.utcnow()
    db.commit()
    # Crear registro en gastos para P&L
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
        pass
    db.refresh(g)
    return _serialize(g)


# ─────────────────────────────────────────────────────────────────────────────
# Descarga de archivos
# ─────────────────────────────────────────────────────────────────────────────

def _serve_base64_file(data_url: str, filename: str):
    from fastapi.responses import Response
    if data_url.startswith("data:"):
        _, b64part = data_url.split(",", 1)
        content = base64.b64decode(b64part)
        ext = (filename or "archivo").rsplit(".", 1)[-1].lower()
        media = "application/pdf" if ext == "pdf" else f"image/{ext}"
        return Response(
            content=content, media_type=media,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    raise HTTPException(status_code=404, detail="Archivo no disponible")


@router.get("/{restaurante_id}/{gasto_id}/factura/archivo")
def descargar_factura(restaurante_id: int, gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g or not g.factura_url:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return _serve_base64_file(g.factura_url, g.factura_nombre or "factura.pdf")


@router.get("/{restaurante_id}/{gasto_id}/comprobante/archivo")
def descargar_comprobante(restaurante_id: int, gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(models.GastoTransferencia).filter(
        models.GastoTransferencia.id == gasto_id,
        models.GastoTransferencia.restaurante_id == restaurante_id,
    ).first()
    if not g or not g.comprobante_pago_url:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    return _serve_base64_file(g.comprobante_pago_url, g.comprobante_pago_nombre or "comprobante.pdf")
