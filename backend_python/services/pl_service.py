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


# Mapeo fallback: texto de categoria → categoria_pl
_CATEGORIA_MAP: dict[str, str] = {
    "proteina": "costo_alimentos", "carne": "costo_alimentos",
    "pescado": "costo_alimentos", "mariscos": "costo_alimentos",
    "salmon": "costo_alimentos", "atun": "costo_alimentos",
    "vegetales": "costo_alimentos", "frutas": "costo_alimentos",
    "vegetales_frutas": "costo_alimentos",
    "abarrotes": "costo_alimentos", "productos_asiaticos": "costo_alimentos",
    "bebidas": "costo_bebidas",
    "nomina": "nomina", "personal": "nomina",
    "renta": "renta",
    "luz": "servicios", "gas": "servicios", "agua": "servicios",
    "servicios": "servicios",
    "mantenimiento": "mantenimiento", "limpieza_mantto": "mantenimiento",
    "limpieza": "limpieza",
    "marketing": "marketing",
    "papeleria": "admin", "software": "admin", "comisiones_bancarias": "admin",
    "utensilios": "admin", "equipo": "admin",
    "impuestos": "impuestos", "isr": "impuestos", "iva": "impuestos",
    "comisiones_plataformas": "otros_gastos",
    "desechables_empaques": "otros_gastos", "desechables": "otros_gastos",
    "propinas": "otros_gastos",
    "otros": "otros_gastos",
}


def _safe_pct(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return (numerator / denominator) * 100


def _map_categoria_texto(categoria: Optional[str]) -> str:
    """Intenta mapear categoria texto libre a categoria_pl. Default: otros_gastos."""
    if not categoria:
        return "otros_gastos"
    key = categoria.lower().strip().replace(" ", "_").replace("-", "_")
    return _CATEGORIA_MAP.get(key, "otros_gastos")


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
