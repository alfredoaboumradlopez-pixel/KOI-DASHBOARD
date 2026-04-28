"""
Endpoints para categorizar gastos y gestionar la cola de revisión.

Dos conceptos separados:
- Categorías operativas: texto libre que usa el equipo (ABARROTES, BEBIDAS…)
  → guardadas en gastos.categoria (texto)
- Cuentas contables: códigos del catalogo_cuentas (5001, 6002…)
  → guardadas en gastos.catalogo_cuenta_id (int FK)
  → mapeadas automáticamente por el PLService / endpoint recategorizar
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
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
    incluir_todos: bool = False,   # retorna TODOS los gastos de ambas tablas
    page: int = 1,                 # página actual (1-based)
    limit: int = 200,              # items por página (0 = sin límite)
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Devuelve gastos para la pantalla de categorización.

    Modos:
    - incluir_todos=false (default): solo gastos con catalogo_cuenta_id IS NULL
      + opcionalmente los que están en cuenta 6008 (incluir_otros=true).
    - incluir_todos=true: TODOS los gastos de ambas tablas (gastos + gastos_diarios),
      con paginación (page / limit). Permite revisar y cambiar cualquier categoría.

    Paginación: page=1, limit=200. limit=0 → sin límite (úsalo con precaución).
    """
    from ..services.pl_service import _map_categoria_texto

    # ── Catálogo de cuentas del restaurante ──────────────────────────────
    cuentas = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).all()
    cuentas_map: dict[int, models.CatalogoCuenta] = {c.id: c for c in cuentas}

    id_otros = next((c.id for c in cuentas if c.codigo == "6008"), None)

    # ── "En revisión" = catalogo_cuenta_id apunta a cuenta 6008 ─────────
    # Definición simple y consistente entre contador y lista:
    # cualquier gasto asignado a "Otros gastos" (código 6008) aparece
    # en el tab "En revisión", independientemente de su categoría operativa.

    def _nombre_cuenta(cuenta_id: Optional[int]) -> Optional[str]:
        if not cuenta_id or cuenta_id not in cuentas_map:
            return None
        return cuentas_map[cuenta_id].nombre

    def _sugerir(categoria_texto: Optional[str], cuenta_actual_id: Optional[int]):
        if not categoria_texto:
            return None
        txt_lower = categoria_texto.lower().strip()
        for c in cuentas:
            if c.nombre.lower().strip() == txt_lower:
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": "alta"}
        for c in cuentas:
            if txt_lower in c.nombre.lower() or c.nombre.lower() in txt_lower:
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": "media"}
        cat_pl = _map_categoria_texto(categoria_texto)
        for c in cuentas:
            if c.categoria_pl == cat_pl:
                confianza = "alta" if c.id == cuenta_actual_id else "baja"
                return {"catalogo_cuenta_id": c.id, "nombre": c.nombre, "confianza": confianza}
        return None

    # ── Modo incluir_todos: retorna TODOS los gastos con paginación ──────
    if incluir_todos:
        offset = (page - 1) * limit if limit > 0 else 0

        # ── Conteos totales (para paginación y tabs) ─────────────────────
        total_g = db.query(func.count(models.Gasto.id)).filter(
            models.Gasto.restaurante_id == restaurante_id
        ).scalar() or 0

        total_gd = db.query(func.count(models.GastoDiario.id)).join(
            models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
        ).filter(
            models.CierreTurno.restaurante_id == restaurante_id
        ).scalar() or 0

        total_global = total_g + total_gd

        # Conteos por estado (sin paginación — van a los tabs)
        null_g = db.query(func.count(models.Gasto.id)).filter(
            models.Gasto.restaurante_id == restaurante_id,
            models.Gasto.catalogo_cuenta_id == None,
        ).scalar() or 0

        null_gd = db.query(func.count(models.GastoDiario.id)).join(
            models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
        ).filter(
            models.CierreTurno.restaurante_id == restaurante_id,
            models.GastoDiario.catalogo_cuenta_id == None,
        ).scalar() or 0

        # "En revisión" = solo gastos sin catalogo_cuenta_id (cuenta 6008 es categoría legítima)

        # ── Fetch página de gastos ────────────────────────────────────────
        items: list[dict] = []

        q_g = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id
        ).order_by(models.Gasto.fecha.desc())

        if limit > 0:
            q_g = q_g.offset(offset).limit(limit)

        for g in q_g.all():
            ccid = g.catalogo_cuenta_id
            items.append({
                "id": g.id, "tabla": "gastos",
                "fecha": str(g.fecha), "proveedor": g.proveedor,
                "descripcion": g.descripcion or "",
                "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
                "catalogo_cuenta_id": ccid,
                "cuenta_nombre": _nombre_cuenta(ccid),
                "es_otros": False,
                "sugerencia": None,   # omitir en modo todos para performance
            })

        # Si no llenamos la página con gastos, tomamos gastos_diarios
        remaining = (limit - len(items)) if limit > 0 else None
        gd_offset = max(0, offset - total_g) if limit > 0 else 0

        if remaining is None or remaining > 0:
            q_gd = db.query(models.GastoDiario, models.CierreTurno.fecha).join(
                models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
            ).filter(
                models.CierreTurno.restaurante_id == restaurante_id
            ).order_by(models.CierreTurno.fecha.desc())

            if limit > 0:
                q_gd = q_gd.offset(gd_offset).limit(remaining)

            for gd, fecha in q_gd.all():
                ccid = gd.catalogo_cuenta_id
                items.append({
                    "id": gd.id, "tabla": "gastos_diarios",
                    "fecha": str(fecha), "proveedor": gd.proveedor,
                    "descripcion": gd.descripcion or "",
                    "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
                    "catalogo_cuenta_id": ccid,
                    "cuenta_nombre": _nombre_cuenta(ccid),
                    "es_otros": False,
                    "sugerencia": None,
                })

        monto_pag = sum(i["monto"] for i in items)

        return {
            "total": total_global,          # total REAL en ambas tablas
            "total_gastos": total_g,
            "total_gastos_diarios": total_gd,
            "total_sin_catalogo": null_g + null_gd,
            "total_en_otros": 0,
            "monto_total": round(monto_pag, 2),
            "page": page,
            "limit": limit,
            "items": items,
        }

    # ── Modo original: solo NULL + opcionalmente 6008 ────────────────────
    items = []

    # gastos sin catalogo_cuenta_id
    q_null = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.catalogo_cuenta_id == None,
    ).order_by(models.Gasto.fecha.desc())
    for g in q_null.all():
        items.append({
            "id": g.id, "tabla": "gastos",
            "fecha": str(g.fecha), "proveedor": g.proveedor,
            "descripcion": g.descripcion or "",
            "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
            "catalogo_cuenta_id": None, "cuenta_nombre": None,
            "es_otros": False,
            "sugerencia": _sugerir(g.categoria, None),
        })

    # gastos en "Otros gastos"
    if incluir_otros and id_otros:
        q_otros = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id,
            models.Gasto.catalogo_cuenta_id == id_otros,
        ).order_by(models.Gasto.fecha.desc())
        for g in q_otros.all():
            items.append({
                "id": g.id, "tabla": "gastos",
                "fecha": str(g.fecha), "proveedor": g.proveedor,
                "descripcion": g.descripcion or "",
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
    ).order_by(models.CierreTurno.fecha.desc())
    for gd, fecha in gd_q.all():
        items.append({
            "id": gd.id, "tabla": "gastos_diarios",
            "fecha": str(fecha), "proveedor": gd.proveedor,
            "descripcion": gd.descripcion or "",
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
        ).order_by(models.CierreTurno.fecha.desc())
        for gd, fecha in gd_otros_q.all():
            items.append({
                "id": gd.id, "tabla": "gastos_diarios",
                "fecha": str(fecha), "proveedor": gd.proveedor,
                "descripcion": gd.descripcion or "",
                "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
                "catalogo_cuenta_id": id_otros, "cuenta_nombre": "Otros gastos",
                "es_otros": True,
                "sugerencia": _sugerir(gd.categoria, id_otros),
            })

    total_sin_cat = sum(1 for i in items if not i["es_otros"] and not i["catalogo_cuenta_id"])
    total_en_otros = sum(1 for i in items if i["es_otros"])
    monto_total = sum(i["monto"] for i in items)

    return {
        "total": len(items),
        "total_sin_catalogo": total_sin_cat,
        "total_en_otros": total_en_otros,
        "monto_total": round(monto_total, 2),
        "page": 1,
        "limit": 0,
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


# ── Helpers internos para recategorización ───────────────────────────────────

def _resolver_cuenta_id(db: Session, restaurante_id: int, categoria: Optional[str]) -> Optional[int]:
    """
    Dada una categoría operativa (texto libre), devuelve el catalogo_cuenta_id
    correcto para el restaurante usando el mapa canónico de PLService.
    """
    from ..services.pl_service import _map_categoria_texto, _CODIGO_POR_CAT_PL
    cat_pl = _map_categoria_texto(categoria)
    codigo = _CODIGO_POR_CAT_PL.get(cat_pl, "6008")
    cuenta = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.codigo == codigo,
        models.CatalogoCuenta.activo == True,
    ).first()
    return cuenta.id if cuenta else None


# ── GET /api/categorias/{restaurante_id} ─────────────────────────────────────

@router.get("/api/categorias/{restaurante_id}")
def get_categorias_por_restaurante(
    restaurante_id: int,
    solo_activas: bool = True,
    db: Session = Depends(get_db),
):
    """Retorna las categorías operativas activas de un restaurante."""
    q = db.query(models.Categoria).filter(
        models.Categoria.restaurante_id == restaurante_id
    )
    if solo_activas:
        q = q.filter(models.Categoria.activo == True)
    cats = q.order_by(models.Categoria.nombre).all()
    return [{"id": c.id, "nombre": c.nombre, "activo": c.activo} for c in cats]


# ── PUT /api/gastos/{id}/cambiar-categoria ────────────────────────────────────

class CambiarCategoriaBody(BaseModel):
    categoria: str  # texto operativo (ej: "ABARROTES")


@router.put("/api/gastos/{gasto_id}/cambiar-categoria")
def cambiar_categoria_gasto(
    gasto_id: int,
    body: CambiarCategoriaBody,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Actualiza la categoría operativa (texto) de un gasto y
    automáticamente re-mapea catalogo_cuenta_id usando el mapa canónico.

    IMPORTANTE: db.commit() se llama ANTES del audit log para garantizar
    que el save principal nunca falle por problemas con la tabla audit_log.
    """
    _check_rol(current_user)
    g = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail={"detail": "Gasto no encontrado", "code": "NOT_FOUND"})

    old_cat = g.categoria
    restaurante_id = g.restaurante_id or get_restaurante_id(current_user)

    g.categoria = body.categoria.strip().upper()
    g.catalogo_cuenta_id = _resolver_cuenta_id(db, restaurante_id, g.categoria)

    # ── Commit principal — PRIMERO, antes del audit ──────────────────────
    db.commit()
    db.refresh(g)

    # ── Audit log (best-effort: no bloquea si falla) ─────────────────────
    try:
        _audit(db, current_user, restaurante_id, "gastos", gasto_id,
               f"categoria: {old_cat} → {g.categoria}; cuenta_id → {g.catalogo_cuenta_id}")
        db.commit()
    except Exception as audit_err:
        db.rollback()
        print(f"[WARN] audit_log failed (non-blocking) gasto {gasto_id}: {audit_err}")

    print(f"[OK] cambiar_categoria gasto {gasto_id}: {old_cat!r} → {g.categoria!r} cuenta_id={g.catalogo_cuenta_id}")
    return {
        "ok": True, "id": gasto_id,
        "categoria": g.categoria,
        "catalogo_cuenta_id": g.catalogo_cuenta_id,
    }


@router.put("/api/gastos-diarios/{gasto_id}/cambiar-categoria")
def cambiar_categoria_gasto_diario(
    gasto_id: int,
    body: CambiarCategoriaBody,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    _check_rol(current_user)
    g = db.query(models.GastoDiario).filter(models.GastoDiario.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail={"detail": "Gasto diario no encontrado", "code": "NOT_FOUND"})

    old_cat = g.categoria
    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.id == g.cierre_id).first()
    restaurante_id = cierre.restaurante_id if cierre else get_restaurante_id(current_user)

    g.categoria = body.categoria.strip().upper()
    g.catalogo_cuenta_id = _resolver_cuenta_id(db, restaurante_id, g.categoria)

    # ── Commit principal — PRIMERO, antes del audit ──────────────────────
    db.commit()
    db.refresh(g)

    # ── Audit log (best-effort: no bloquea si falla) ─────────────────────
    try:
        _audit(db, current_user, restaurante_id, "gastos_diarios", gasto_id,
               f"categoria: {old_cat} → {g.categoria}; cuenta_id → {g.catalogo_cuenta_id}")
        db.commit()
    except Exception as audit_err:
        db.rollback()
        print(f"[WARN] audit_log failed (non-blocking) gasto_diario {gasto_id}: {audit_err}")

    print(f"[OK] cambiar_categoria gasto_diario {gasto_id}: {old_cat!r} → {g.categoria!r} cuenta_id={g.catalogo_cuenta_id}")
    return {
        "ok": True, "id": gasto_id,
        "categoria": g.categoria,
        "catalogo_cuenta_id": g.catalogo_cuenta_id,
    }


# ── POST /api/gastos/recategorizar/{restaurante_id} ───────────────────────────

@router.post("/api/gastos/recategorizar/{restaurante_id}")
def recategorizar_gastos(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Recorre TODOS los gastos del restaurante y actualiza catalogo_cuenta_id
    basándose en la categoría operativa (texto) actual de cada gasto.
    Idempotente — se puede llamar múltiples veces sin efectos secundarios.
    Solo SUPER_ADMIN o ADMIN.
    """
    if current_user and current_user.rol not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail={"detail": "Solo ADMIN/SUPER_ADMIN", "code": "FORBIDDEN"})

    actualizados_g = 0
    actualizados_gd = 0
    por_cuenta: dict[str, int] = {}

    # ── Tabla gastos ──────────────────────────────────────────────────────
    gastos = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id
    ).all()
    for g in gastos:
        nuevo_id = _resolver_cuenta_id(db, restaurante_id, g.categoria)
        if nuevo_id != g.catalogo_cuenta_id:
            g.catalogo_cuenta_id = nuevo_id
            actualizados_g += 1
        key = g.categoria or "SIN_CATEGORIA"
        por_cuenta[key] = por_cuenta.get(key, 0) + 1

    # ── Tabla gastos_diarios ──────────────────────────────────────────────
    gd_list = db.query(models.GastoDiario).join(
        models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
    ).filter(
        models.CierreTurno.restaurante_id == restaurante_id
    ).all()
    for gd in gd_list:
        nuevo_id = _resolver_cuenta_id(db, restaurante_id, gd.categoria)
        if nuevo_id != gd.catalogo_cuenta_id:
            gd.catalogo_cuenta_id = nuevo_id
            actualizados_gd += 1

    db.commit()

    return {
        "ok": True,
        "restaurante_id": restaurante_id,
        "gastos_actualizados": actualizados_g,
        "gastos_diarios_actualizados": actualizados_gd,
        "total_gastos_procesados": len(gastos),
        "total_gd_procesados": len(gd_list),
        "desglose_por_categoria": por_cuenta,
    }


# ── Actualizar endpoint sin-categorizar para usar categorías operativas ───────

@router.get("/api/gastos/sin-categorizar-v2/{restaurante_id}")
def gastos_sin_categorizar_v2(
    restaurante_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """
    Versión 2: 'sin categorizar' significa gastos cuya categoría operativa
    (texto) no está en la lista oficial de categorías del restaurante.
    Esto incluye gastos con categoria=NULL o con texto desconocido.
    """
    # Categorías operativas conocidas para este restaurante
    cats_activas = {
        c.nombre.upper() for c in
        db.query(models.Categoria).filter(
            models.Categoria.restaurante_id == restaurante_id,
            models.Categoria.activo == True,
        ).all()
    }

    items = []

    # gastos con categoria NULL o desconocida
    gs = db.query(models.Gasto).filter(
        models.Gasto.restaurante_id == restaurante_id,
    ).order_by(models.Gasto.fecha.desc()).limit(500).all()

    for g in gs:
        cat = (g.categoria or "").strip().upper()
        if cat not in cats_activas:
            items.append({
                "id": g.id, "tabla": "gastos",
                "fecha": str(g.fecha), "proveedor": g.proveedor,
                "categoria_texto": g.categoria, "monto": round(g.monto or 0, 2),
                "catalogo_cuenta_id": g.catalogo_cuenta_id,
                "es_desconocida": True,
            })

    # gastos_diarios con categoria desconocida
    gd_q = db.query(models.GastoDiario, models.CierreTurno.fecha).join(
        models.CierreTurno, models.GastoDiario.cierre_id == models.CierreTurno.id
    ).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
    ).order_by(models.CierreTurno.fecha.desc()).limit(500)

    for gd, fecha in gd_q.all():
        cat = (gd.categoria or "").strip().upper()
        if cat not in cats_activas:
            items.append({
                "id": gd.id, "tabla": "gastos_diarios",
                "fecha": str(fecha), "proveedor": gd.proveedor,
                "categoria_texto": gd.categoria, "monto": round(gd.monto or 0, 2),
                "catalogo_cuenta_id": gd.catalogo_cuenta_id,
                "es_desconocida": True,
            })

    return {
        "total": len(items),
        "items": items,
        "categorias_conocidas": sorted(cats_activas),
    }
