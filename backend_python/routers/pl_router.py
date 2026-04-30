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


# ─────────────────────────────────────────────────────────────────────────────
# V2 P&L — nueva estructura de grupos y categorías
# ─────────────────────────────────────────────────────────────────────────────

# Mapeo: UPPERCASE categoría (como aparece en gastos_por_categoria) → (grupo_v2, linea_v2)
_V2_CAT_MAP: dict[str, tuple[str, str]] = {
    # FOOD COST
    "PROTEINA":          ("food_cost", "PROTEINA"),
    "CARNE":             ("food_cost", "PROTEINA"),
    "CARNES":            ("food_cost", "PROTEINA"),
    "PESCADO":           ("food_cost", "PROTEINA"),
    "MARISCOS":          ("food_cost", "PROTEINA"),
    "SALMON":            ("food_cost", "PROTEINA"),
    "ATUN":              ("food_cost", "PROTEINA"),
    "VEGETALES":         ("food_cost", "VEGETALES FRUTAS"),
    "FRUTAS":            ("food_cost", "VEGETALES FRUTAS"),
    "VEGETALES_FRUTAS":  ("food_cost", "VEGETALES FRUTAS"),
    "ABARROTES":         ("food_cost", "ABARROTES"),
    "INGREDIENTES":      ("food_cost", "ABARROTES"),
    "MATERIA_PRIMA":     ("food_cost", "ABARROTES"),
    "LACTEOS":           ("food_cost", "ABARROTES"),
    "PANADERIA":         ("food_cost", "ABARROTES"),
    "TORTILLAS":         ("food_cost", "ABARROTES"),
    "COCINA":            ("food_cost", "ABARROTES"),
    "MERCADO":           ("food_cost", "ABARROTES"),
    "PRODUCTOS_ASIATICOS": ("food_cost", "PRODUCTOS ASIATICOS"),
    # BEVERAGE COST
    "BEBIDAS":           ("beverage_cost", "BEBIDAS"),
    "LICORES":           ("beverage_cost", "BEBIDAS"),
    "VINOS":             ("beverage_cost", "BEBIDAS"),
    "CERVEZAS":          ("beverage_cost", "BEBIDAS"),
    "REFRESCOS":         ("beverage_cost", "BEBIDAS"),
    "AGUAS":             ("beverage_cost", "BEBIDAS"),
    # NÓMINA (sueldos)
    "NOMINA":            ("nomina_g", "NOMINA"),
    "SALARIOS":          ("nomina_g", "NOMINA"),
    "SUELDOS":           ("nomina_g", "NOMINA"),
    # GASTOS PERSONAL (no sueldos)
    "PERSONAL":          ("gastos_personal", "PERSONAL"),
    "COMIDA_PERSONAL":   ("gastos_personal", "PERSONAL"),
    # OPERACIÓN
    "LIMPIEZA":          ("operacion", "LIMPIEZA MANTTO"),
    "LIMPIEZA_MANTTO":   ("operacion", "LIMPIEZA MANTTO"),
    "DESINFECTANTE":     ("operacion", "LIMPIEZA MANTTO"),
    "DETERGENTE":        ("operacion", "LIMPIEZA MANTTO"),
    "DESECHABLES_EMPAQUES": ("operacion", "DESECHABLES EMPAQUES"),
    "DESECHABLES":       ("operacion", "DESECHABLES EMPAQUES"),
    "ESTACIONAMIENTO":   ("operacion", "ESTACIONAMIENTO"),
    "MANTENIMIENTO":     ("operacion", "MANTENIMIENTO"),
    "REPARACION":        ("operacion", "MANTENIMIENTO"),
    "PLOMERO":           ("operacion", "MANTENIMIENTO"),
    "ELECTRICISTA":      ("operacion", "MANTENIMIENTO"),
    "HERRAMIENTAS":      ("operacion", "MANTENIMIENTO"),
    "MARKETING":         ("operacion", "MARKETING"),
    "PUBLICIDAD":        ("operacion", "MARKETING"),
    "REDES_SOCIALES":    ("operacion", "MARKETING"),
    "FOTOGRAFIA":        ("operacion", "MARKETING"),
    "PAPELERIA":         ("operacion", "PAPELERIA"),
    "EQUIPO":            ("operacion", "EQUIPO"),
    "UTENSILIOS":        ("operacion", "EQUIPO"),
    # SERVICIOS
    "SERVICIOS":         ("servicios", "SERVICIOS"),
    "TELEFONO":          ("servicios", "SERVICIOS"),
    "INTERNET":          ("servicios", "SERVICIOS"),
    "TELMEX":            ("servicios", "SERVICIOS"),
    "CFE":               ("servicios", "SERVICIOS"),
    "GAS":               ("servicios", "SERVICIOS"),
    "AGUA":              ("servicios", "SERVICIOS"),
    "ELECTRICIDAD":      ("servicios", "LUZ"),
    "LUZ":               ("servicios", "LUZ"),
    "RENTA":             ("servicios", "RENTA"),
    "ARRENDAMIENTO":     ("servicios", "RENTA"),
    # COMISIONES
    "COMISIONES_BANCARIAS":    ("comisiones", "COMISIONES BANCARIAS"),
    "COMISIONES BANCARIAS":    ("comisiones", "COMISIONES BANCARIAS"),
    "COMISIONES_PLATAFORMAS":  ("comisiones", "COMISIONES PLATAFORMAS"),
    "COMISIONES PLATAFORMAS":  ("comisiones", "COMISIONES PLATAFORMAS"),
    # IMPUESTOS
    "IMPUESTOS":         ("impuestos", "ISR"),
    "ISR":               ("impuestos", "ISR"),
    "IVA":               ("impuestos", "IVA"),
    # OTROS
    "OTROS":             ("otros", "OTROS"),
    "MISCELANEOS":       ("otros", "OTROS"),
    "VARIOS":            ("otros", "OTROS"),
    "SOFTWARE":          ("otros", "OTROS"),
    "PROPINAS":          ("otros", "OTROS"),
}

# Fallback por categoria_pl cuando el texto no matchea
_V2_PL_FALLBACK: dict[str, tuple[str, str]] = {
    "costo_alimentos":  ("food_cost", "ABARROTES"),
    "costo_bebidas":    ("beverage_cost", "BEBIDAS"),
    "nomina":           ("nomina_g", "NOMINA"),
    "renta":            ("servicios", "RENTA"),
    "servicios":        ("servicios", "SERVICIOS"),
    "mantenimiento":    ("operacion", "MANTENIMIENTO"),
    "limpieza":         ("operacion", "LIMPIEZA MANTTO"),
    "marketing":        ("operacion", "MARKETING"),
    "admin":            ("otros", "OTROS"),
    "otros_gastos":     ("otros", "OTROS"),
    "impuestos":        ("impuestos", "ISR"),
}

# Grupos operativos (para calcular TOTAL GASTOS OPERATIVOS — excluye impuestos y costo_ventas)
_OPEX_GRUPOS = {"nomina_g", "gastos_personal", "operacion", "servicios", "comisiones", "otros"}

# Grupos de costo de ventas
_COSTO_VENTAS_GRUPOS = {"food_cost", "beverage_cost"}


def _build_v2(pl, ventas: float, alerta_otros_threshold: float = 0.005) -> dict:
    """
    Transforma PLResult.gastos_por_categoria en la nueva estructura v2.
    Acepta el PLResult completo para tomar ventas_netas y los totales ya calculados.
    """
    from ..services.pl_service import PLResult
    result = pl

    # 1. Acumular montos en {grupo: {linea: monto}}
    grupos: dict[str, dict[str, float]] = {}

    def _add(grupo: str, linea: str, monto: float):
        if grupo not in grupos:
            grupos[grupo] = {}
        grupos[grupo][linea] = grupos[grupo].get(linea, 0.0) + monto

    for item in result.gastos_por_categoria:
        cat_text = (item.get("categoria") or "").upper().strip()
        cat_pl   = item.get("categoria_pl") or ""
        monto    = item.get("monto") or 0.0

        if cat_text in _V2_CAT_MAP:
            grupo, linea = _V2_CAT_MAP[cat_text]
        elif cat_pl in _V2_PL_FALLBACK:
            grupo, linea = _V2_PL_FALLBACK[cat_pl]
        else:
            grupo, linea = "otros", "OTROS"

        _add(grupo, linea, monto)

    def _pct(monto: float) -> float:
        return round(monto / ventas * 100, 2) if ventas > 0 else 0.0

    def _grupo_dict(grupo_key: str, lines_default: list[str]) -> dict:
        d = grupos.get(grupo_key, {})
        detalle = {line: round(d.get(line, 0.0), 2) for line in lines_default}
        # Include any extra lines not in defaults
        for k, v in d.items():
            if k not in detalle:
                detalle[k] = round(v, 2)
        subtotal = sum(detalle.values())
        return {"detalle": detalle, "subtotal": round(subtotal, 2), "porcentaje": _pct(subtotal)}

    # 2. Costo de ventas
    fc = _grupo_dict("food_cost", ["PROTEINA", "VEGETALES FRUTAS", "ABARROTES", "PRODUCTOS ASIATICOS"])
    bev = _grupo_dict("beverage_cost", ["BEBIDAS"])
    total_costo = round(fc["subtotal"] + bev["subtotal"], 2)
    utilidad_bruta = round(ventas - total_costo, 2)

    # 3. Gastos operativos
    nom   = _grupo_dict("nomina_g",       ["NOMINA"])
    pers  = _grupo_dict("gastos_personal", ["PERSONAL"])
    oper  = _grupo_dict("operacion",       ["LIMPIEZA MANTTO", "DESECHABLES EMPAQUES", "ESTACIONAMIENTO", "MANTENIMIENTO", "MARKETING", "PAPELERIA", "EQUIPO"])
    serv  = _grupo_dict("servicios",       ["SERVICIOS", "LUZ", "RENTA"])
    com   = _grupo_dict("comisiones",      ["COMISIONES BANCARIAS", "COMISIONES PLATAFORMAS"])

    otros_subtotal = sum(grupos.get("otros", {}).values())
    otros_alerta   = ventas > 0 and (otros_subtotal / ventas) > alerta_otros_threshold
    otros_dict = {
        "detalle": {"OTROS": round(otros_subtotal, 2)},
        "subtotal": round(otros_subtotal, 2),
        "porcentaje": _pct(otros_subtotal),
        "alerta": otros_alerta,
        "alerta_threshold": alerta_otros_threshold,
        "alerta_mensaje": (
            f"OTROS supera el {alerta_otros_threshold*100:.1f}% de ventas "
            f"(${otros_subtotal:,.0f}). Revisa si hay gastos que deban reclasificarse."
        ) if otros_alerta else None,
    }

    total_opex = round(
        nom["subtotal"] + pers["subtotal"] + oper["subtotal"] +
        serv["subtotal"] + com["subtotal"] + otros_subtotal,
        2,
    )

    # 4. Impuestos
    imp_d  = grupos.get("impuestos", {})
    imp_isr = round(imp_d.get("ISR", 0.0), 2)
    imp_iva = round(imp_d.get("IVA", 0.0), 2)
    # Fallback: use PLResult's impuestos_estimados if no line-item taxes found
    if imp_isr == 0 and imp_iva == 0 and result.impuestos_estimados > 0:
        imp_isr = round(result.impuestos_estimados, 2)
    total_imp = round(imp_isr + imp_iva, 2)

    # 5. Totales
    ebitda        = round(utilidad_bruta - total_opex, 2)
    utilidad_neta = round(ebitda - total_imp, 2)

    return {
        "periodo": {
            "inicio": str(result.fecha_inicio),
            "fin":    str(result.fecha_fin),
        },
        "ventas": round(ventas, 2),
        "propinas_totales": round(result.propinas_totales, 2),
        "costo_ventas": {
            "food_cost":    fc,
            "beverage_cost": bev,
            "total": total_costo,
            "total_porcentaje": _pct(total_costo),
            "margen_bruto_pct": _pct(utilidad_bruta),
        },
        "utilidad_bruta": utilidad_bruta,
        "utilidad_bruta_pct": _pct(utilidad_bruta),
        "gastos_operativos": {
            "nomina":          nom,
            "gastos_personal": pers,
            "operacion":       oper,
            "servicios":       serv,
            "comisiones":      com,
            "otros":           otros_dict,
            "total": total_opex,
            "total_porcentaje": _pct(total_opex),
        },
        "ebitda": ebitda,
        "ebitda_pct": _pct(ebitda),
        "impuestos": {
            "detalle": {"ISR": imp_isr, "IVA": imp_iva},
            "total": total_imp,
        },
        "utilidad_neta": utilidad_neta,
        "utilidad_neta_pct": _pct(utilidad_neta),
        # KPIs extra para colores
        "food_cost_pct":     fc["porcentaje"],
        "beverage_cost_pct": bev["porcentaje"],
        "advertencias": result.advertencias,
        "gastos_sin_categorizar": result.gastos_sin_categorizar,
        "dias_con_datos": result.dias_con_datos,
    }


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


@router.get("/{restaurante_id}/v2/mes/{anio}/{mes}")
def pl_v2_mes(
    restaurante_id: int, anio: int, mes: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    """Nueva estructura P&L v2 con grupos granulares."""
    _check_tenant_access(restaurante_id, current_user)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail={"detail": "Mes inválido (1-12)", "code": "INVALID_MONTH"})
    result = pl_service.calcular_pl_mes(db, restaurante_id, mes, anio)
    ventas = result.ventas_netas
    return _build_v2(result, ventas)


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
