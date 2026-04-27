"""
P&L Service — calcula estado de resultados en tiempo real desde las tablas fuente.
Lee-only: nunca modifica datos.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from .. import models


@dataclass
class PLResult:
    # Período
    fecha_inicio: date
    fecha_fin: date
    dias_con_datos: int = 0

    # Ingresos
    ventas_efectivo: float = 0.0
    ventas_parrot: float = 0.0
    ventas_terminales: float = 0.0
    ventas_uber: float = 0.0
    ventas_rappi: float = 0.0
    ventas_otros: float = 0.0
    ventas_netas: float = 0.0
    propinas_totales: float = 0.0

    # Costo de ventas
    costo_alimentos: float = 0.0
    costo_bebidas: float = 0.0
    total_costo_ventas: float = 0.0

    # Utilidad bruta
    utilidad_bruta: float = 0.0
    margen_bruto_pct: float = 0.0

    # Gastos operativos
    gastos_nomina: float = 0.0
    gastos_renta: float = 0.0
    gastos_servicios: float = 0.0
    gastos_mantenimiento: float = 0.0
    gastos_limpieza: float = 0.0
    gastos_marketing: float = 0.0
    gastos_admin: float = 0.0
    gastos_otros: float = 0.0
    total_gastos_operativos: float = 0.0

    # Resultados
    ebitda: float = 0.0
    margen_ebitda_pct: float = 0.0
    impuestos_estimados: float = 0.0
    utilidad_neta: float = 0.0
    margen_neto_pct: float = 0.0

    # Ratios clave
    food_cost_pct: float = 0.0
    nomina_pct: float = 0.0

    # Metadata
    tiene_datos_incompletos: bool = False
    gastos_sin_categorizar: int = 0
    advertencias: list = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serializa a dict con floats redondeados a 2 decimales."""
        result = {}
        for k, v in self.__dict__.items():
            if isinstance(v, float):
                result[k] = round(v, 2)
            elif isinstance(v, date):
                result[k] = v.isoformat()
            else:
                result[k] = v
        return result


# Mapeo canónico: texto de categoria (normalizado) → categoria_pl
# Fuente de verdad compartida con el endpoint /api/gastos/recategorizar
# Regla: normalizar con _normalizar_categoria() antes de buscar
_CATEGORIA_MAP: dict[str, str] = {
    # ── Costo alimentos ───────────────────────────────────────────────────
    "proteina":             "costo_alimentos",
    "carne":                "costo_alimentos",
    "carnes":               "costo_alimentos",
    "pescado":              "costo_alimentos",
    "mariscos":             "costo_alimentos",
    "salmon":               "costo_alimentos",
    "atun":                 "costo_alimentos",
    "vegetales":            "costo_alimentos",
    "frutas":               "costo_alimentos",
    "vegetales_frutas":     "costo_alimentos",
    "abarrotes":            "costo_alimentos",
    "productos_asiaticos":  "costo_alimentos",
    "ingredientes":         "costo_alimentos",
    "materia_prima":        "costo_alimentos",
    "mercado":              "costo_alimentos",
    "lacteos":              "costo_alimentos",
    "panaderia":            "costo_alimentos",
    "tortillas":            "costo_alimentos",
    "cocina":               "costo_alimentos",

    # ── Costo bebidas ─────────────────────────────────────────────────────
    "bebidas":              "costo_bebidas",
    "licores":              "costo_bebidas",
    "vinos":                "costo_bebidas",
    "cervezas":             "costo_bebidas",
    "refrescos":            "costo_bebidas",
    "aguas":                "costo_bebidas",

    # ── Nómina ────────────────────────────────────────────────────────────
    "nomina":               "nomina",
    "personal":             "nomina",
    "salarios":             "nomina",
    "sueldos":              "nomina",
    "empleados":            "nomina",

    # ── Renta ─────────────────────────────────────────────────────────────
    "renta":                "renta",
    "arrendamiento":        "renta",

    # ── Servicios (Luz y gas) ─────────────────────────────────────────────
    "luz":                  "servicios",
    "gas":                  "servicios",
    "agua":                 "servicios",
    "electricidad":         "servicios",
    "servicios":            "servicios",
    "telefono":             "servicios",
    "internet":             "servicios",
    "telmex":               "servicios",
    "cfe":                  "servicios",

    # ── Mantenimiento ─────────────────────────────────────────────────────
    "mantenimiento":        "mantenimiento",
    "reparacion":           "mantenimiento",
    "plomero":              "mantenimiento",
    "electricista":         "mantenimiento",
    "herramientas":         "mantenimiento",
    "equipo":               "mantenimiento",   # ← corregido (antes: admin)
    "utensilios":           "mantenimiento",   # ← corregido (antes: admin)

    # ── Limpieza ──────────────────────────────────────────────────────────
    "limpieza":             "limpieza",
    "limpieza_mantto":      "limpieza",        # ← corregido (antes: mantenimiento)
    "desechables_empaques": "limpieza",        # ← corregido (antes: otros_gastos)
    "desechables":          "limpieza",
    "detergente":           "limpieza",
    "desinfectante":        "limpieza",

    # ── Marketing ─────────────────────────────────────────────────────────
    "marketing":            "marketing",
    "publicidad":           "marketing",
    "redes_sociales":       "marketing",
    "fotografia":           "marketing",

    # ── Impuestos ─────────────────────────────────────────────────────────
    "impuestos":            "impuestos",
    "isr":                  "impuestos",
    "iva":                  "impuestos",

    # ── Otros gastos (default) ────────────────────────────────────────────
    "papeleria":            "otros_gastos",    # ← corregido (antes: admin)
    "software":             "otros_gastos",    # ← corregido (antes: admin)
    "comisiones_bancarias": "otros_gastos",    # ← corregido (antes: admin)
    "comisiones_plataformas": "otros_gastos",
    "propinas":             "otros_gastos",
    "otros":                "otros_gastos",
    "miscelaneos":          "otros_gastos",
    "varios":               "otros_gastos",
    "comida_personal":      "otros_gastos",
}

# Código de cuenta preferido por categoria_pl (para resolver ambigüedad en catalogo)
# Usado por recategorizar endpoint para mapear categoria → catalogo_cuenta_id exacto
_CODIGO_POR_CAT_PL: dict[str, str] = {
    "costo_alimentos":  "5001",
    "costo_bebidas":    "5002",
    "nomina":           "6001",
    "renta":            "6002",
    "servicios":        "6003",
    "mantenimiento":    "6004",
    "limpieza":         "6005",
    "marketing":        "6007",
    "impuestos":        "7001",
    "otros_gastos":     "6008",
    "admin":            "6008",   # fallback: admin → 6008
}


def _safe_pct(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return (numerator / denominator) * 100


def _normalizar_categoria(categoria: Optional[str]) -> str:
    """Normaliza texto de categoría: minúsculas, sin acentos, espacios→guion_bajo."""
    if not categoria:
        return ""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", categoria)
    sin_ac = "".join(c for c in nfkd if not unicodedata.combining(c))
    return sin_ac.lower().strip().replace(" ", "_").replace("-", "_")


def _map_categoria_texto(categoria: Optional[str]) -> str:
    """Mapea texto de categoría operativa → categoria_pl. Default: otros_gastos."""
    if not categoria:
        return "otros_gastos"
    key = _normalizar_categoria(categoria)
    if key in _CATEGORIA_MAP:
        return _CATEGORIA_MAP[key]
    # Substring fallback: si alguna key está contenida en el texto
    for map_key, cat_pl in _CATEGORIA_MAP.items():
        if map_key in key or key in map_key:
            return cat_pl
    return "otros_gastos"


def _get_catalogo_map(db: Session, restaurante_id: int) -> dict[int, str]:
    """Retorna {catalogo_cuenta_id: categoria_pl} para el restaurante."""
    cuentas = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).all()
    return {c.id: c.categoria_pl for c in cuentas}


def _accumulate_gasto(result: PLResult, categoria_pl: str, monto: float):
    """Acumula el monto en la línea correcta del PLResult."""
    cat = categoria_pl or "otros_gastos"
    if cat == "costo_alimentos":
        result.costo_alimentos += monto
    elif cat == "costo_bebidas":
        result.costo_bebidas += monto
    elif cat == "nomina":
        result.gastos_nomina += monto
    elif cat == "renta":
        result.gastos_renta += monto
    elif cat in ("servicios",):
        result.gastos_servicios += monto
    elif cat == "mantenimiento":
        result.gastos_mantenimiento += monto
    elif cat == "limpieza":
        result.gastos_limpieza += monto
    elif cat == "marketing":
        result.gastos_marketing += monto
    elif cat in ("admin",):
        result.gastos_admin += monto
    elif cat == "impuestos":
        result.impuestos_estimados += monto
    else:
        result.gastos_otros += monto


class PLService:

    def calcular_pl(
        self,
        db: Session,
        restaurante_id: int,
        fecha_inicio: date,
        fecha_fin: date,
    ) -> PLResult:
        result = PLResult(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        catalogo_map = _get_catalogo_map(db, restaurante_id)

        # 1. INGRESOS desde cierres_turno
        cierres = db.query(models.CierreTurno).filter(
            models.CierreTurno.restaurante_id == restaurante_id,
            models.CierreTurno.fecha >= fecha_inicio,
            models.CierreTurno.fecha <= fecha_fin,
        ).all()

        result.dias_con_datos = len(cierres)
        for c in cierres:
            result.ventas_efectivo += c.ventas_efectivo or 0
            result.ventas_parrot += c.ventas_parrot or 0
            result.ventas_terminales += c.ventas_terminales or 0
            result.ventas_uber += c.ventas_uber or 0
            result.ventas_rappi += c.ventas_rappi or 0
            result.ventas_otros += c.otros_ingresos or 0
            # Propinas (informativo)
            result.propinas_totales += (
                (c.propinas_efectivo or 0) +
                (c.propinas_parrot or 0) +
                (c.propinas_terminales or 0)
            )

        result.ventas_netas = (
            result.ventas_efectivo + result.ventas_parrot +
            result.ventas_terminales + result.ventas_uber +
            result.ventas_rappi + result.ventas_otros
        )

        # 2. GASTOS DIARIOS (gastos_diarios vinculados a cierres_turno)
        cierre_ids = [c.id for c in cierres]
        if cierre_ids:
            gastos_diarios = db.query(models.GastoDiario).filter(
                models.GastoDiario.cierre_id.in_(cierre_ids)
            ).all()
            for g in gastos_diarios:
                monto = g.monto or 0
                if g.catalogo_cuenta_id and g.catalogo_cuenta_id in catalogo_map:
                    cat_pl = catalogo_map[g.catalogo_cuenta_id]
                    _accumulate_gasto(result, cat_pl, monto)
                else:
                    # Fallback por texto
                    cat_pl = _map_categoria_texto(g.categoria)
                    _accumulate_gasto(result, cat_pl, monto)
                    if not g.catalogo_cuenta_id:
                        result.gastos_sin_categorizar += 1

        # 3. GASTOS (tabla gastos — método de pago, facturas, etc.)
        gastos = db.query(models.Gasto).filter(
            models.Gasto.restaurante_id == restaurante_id,
            models.Gasto.fecha >= fecha_inicio,
            models.Gasto.fecha <= fecha_fin,
        ).all()
        for g in gastos:
            monto = g.monto or 0
            if g.catalogo_cuenta_id and g.catalogo_cuenta_id in catalogo_map:
                cat_pl = catalogo_map[g.catalogo_cuenta_id]
                _accumulate_gasto(result, cat_pl, monto)
            else:
                cat_pl = _map_categoria_texto(g.categoria)
                _accumulate_gasto(result, cat_pl, monto)
                if not g.catalogo_cuenta_id:
                    result.gastos_sin_categorizar += 1

        # 4. NÓMINA desde nomina_pagos
        nomina_total = db.query(func.sum(models.NominaPago.neto_pagado)).filter(
            models.NominaPago.restaurante_id == restaurante_id,
            models.NominaPago.fecha_pago >= fecha_inicio,
            models.NominaPago.fecha_pago <= fecha_fin,
        ).scalar() or 0.0
        result.gastos_nomina += nomina_total

        # 5. CÁLCULOS DERIVADOS
        result.total_costo_ventas = result.costo_alimentos + result.costo_bebidas
        result.utilidad_bruta = result.ventas_netas - result.total_costo_ventas
        result.margen_bruto_pct = _safe_pct(result.utilidad_bruta, result.ventas_netas)

        result.total_gastos_operativos = (
            result.gastos_nomina + result.gastos_renta + result.gastos_servicios +
            result.gastos_mantenimiento + result.gastos_limpieza + result.gastos_marketing +
            result.gastos_admin + result.gastos_otros
        )

        result.ebitda = result.utilidad_bruta - result.total_gastos_operativos
        result.margen_ebitda_pct = _safe_pct(result.ebitda, result.ventas_netas)
        result.utilidad_neta = result.ebitda - result.impuestos_estimados
        result.margen_neto_pct = _safe_pct(result.utilidad_neta, result.ventas_netas)

        result.food_cost_pct = _safe_pct(result.total_costo_ventas, result.ventas_netas)
        result.nomina_pct = _safe_pct(result.gastos_nomina, result.ventas_netas)

        # 6. METADATA / ADVERTENCIAS
        result.tiene_datos_incompletos = result.gastos_sin_categorizar > 0
        if result.gastos_sin_categorizar > 0:
            result.advertencias.append(
                f"{result.gastos_sin_categorizar} gastos sin categoría contable — sumados a 'otros'"
            )
        if result.dias_con_datos == 0:
            result.advertencias.append("Sin cierres de turno registrados en el período")
        if result.food_cost_pct > 40:
            result.advertencias.append(f"Food cost alto: {round(result.food_cost_pct, 1)}%")
        if result.nomina_pct > 40:
            result.advertencias.append(f"Nómina alta: {round(result.nomina_pct, 1)}%")

        return result

    def calcular_pl_mes(self, db: Session, restaurante_id: int, mes: int, anio: int) -> PLResult:
        from calendar import monthrange
        _, last_day = monthrange(anio, mes)
        return self.calcular_pl(
            db, restaurante_id,
            fecha_inicio=date(anio, mes, 1),
            fecha_fin=date(anio, mes, last_day),
        )

    def calcular_pl_semana(self, db: Session, restaurante_id: int, fecha_cualquiera: date) -> PLResult:
        # Lunes de la semana
        lunes = fecha_cualquiera - timedelta(days=fecha_cualquiera.weekday())
        domingo = lunes + timedelta(days=6)
        return self.calcular_pl(db, restaurante_id, fecha_inicio=lunes, fecha_fin=domingo)

    def calcular_pl_ytd(self, db: Session, restaurante_id: int, anio: int) -> PLResult:
        hoy = date.today()
        return self.calcular_pl(
            db, restaurante_id,
            fecha_inicio=date(anio, 1, 1),
            fecha_fin=date(anio, hoy.month, hoy.day) if hoy.year == anio else date(anio, 12, 31),
        )


pl_service = PLService()
