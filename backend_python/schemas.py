"""
KOI Dashboard - Schemas Pydantic
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import date, datetime
from typing import List, Optional
from .models import (
    ClaseGasto, CategoriaGasto, TipoComprobante, MetodoPago,
    TerminalOrigen, EstadoArqueo, EstadoPago, TipoMovimientoBanco
)

class GastoDiarioCreate(BaseModel):
    proveedor: str
    clase: ClaseGasto = ClaseGasto.NMP
    categoria: CategoriaGasto
    comprobante: TipoComprobante
    descripcion: str
    monto: float = Field(gt=0)

class GastoDiarioResponse(GastoDiarioCreate):
    id: int
    cierre_id: int
    model_config = ConfigDict(from_attributes=True)

class PropinaDiariaCreate(BaseModel):
    terminal: TerminalOrigen
    monto: float = Field(ge=0)

class PropinaDiariaResponse(PropinaDiariaCreate):
    id: int
    cierre_id: int
    model_config = ConfigDict(from_attributes=True)

class CierreTurnoCreate(BaseModel):
    fecha: date
    responsable: str
    elaborado_por: str
    saldo_inicial: float
    ventas_efectivo: float = 0.0
    gastos: List[GastoDiarioCreate]
    propinas: List[PropinaDiariaCreate] = []
    efectivo_fisico: Optional[float] = None
    notas: Optional[str] = None

class CierreTurnoResponse(BaseModel):
    id: int
    fecha: date
    responsable: str
    elaborado_por: str
    saldo_inicial: float
    ventas_efectivo: float
    total_gastos: float
    saldo_final_esperado: float
    efectivo_fisico: Optional[float]
    diferencia: Optional[float]
    estado: Optional[EstadoArqueo]
    notas: Optional[str]
    gastos: List[GastoDiarioResponse]
    propinas: List[PropinaDiariaResponse]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CierreArqueoUpdate(BaseModel):
    efectivo_fisico: float

class GastoCreate(BaseModel):
    fecha: date
    proveedor: str
    categoria: CategoriaGasto
    monto: float = Field(gt=0)
    metodo_pago: MetodoPago
    descripcion: Optional[str] = None

class GastoResponse(GastoCreate):
    id: int
    comprobante_url: Optional[str]
    estado: EstadoPago
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OCRResult(BaseModel):
    fecha: Optional[str] = None
    proveedor: Optional[str] = None
    categoria: Optional[str] = None
    total: Optional[float] = None
    descripcion: Optional[str] = None
    confianza: float = 0.0

class ProveedorCreate(BaseModel):
    nombre: str
    categoria_default: CategoriaGasto

class ProveedorResponse(ProveedorCreate):
    id: int
    activo: bool
    model_config = ConfigDict(from_attributes=True)

class CuentaPorPagarCreate(BaseModel):
    proveedor_id: int
    monto_total: float = Field(gt=0)
    fecha_vencimiento: date
    descripcion: Optional[str] = None

class CuentaPorPagarResponse(CuentaPorPagarCreate):
    id: int
    estado_pago: EstadoPago
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class EmpleadoCreate(BaseModel):
    nombre: str
    puesto: str
    salario_base: float = Field(gt=0)
    fecha_ingreso: date

class EmpleadoResponse(EmpleadoCreate):
    id: int
    activo: bool
    model_config = ConfigDict(from_attributes=True)

class NominaPagoCreate(BaseModel):
    empleado_id: int
    periodo_inicio: date
    periodo_fin: date
    salario_base: float
    horas_extra: float = 0.0
    deducciones: float = 0.0
    neto_pagado: float
    fecha_pago: date

class NominaPagoResponse(NominaPagoCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class InsumoCreate(BaseModel):
    nombre: str
    unidad: str
    stock_actual: float = 0.0
    stock_minimo: float = 0.0
    precio_unitario: float = 0.0
    proveedor: Optional[str] = None

class InsumoResponse(InsumoCreate):
    id: int
    ultima_compra: Optional[date]
    activo: bool
    model_config = ConfigDict(from_attributes=True)

class VentaDiariaResponse(BaseModel):
    id: int
    fecha: date
    mes: str
    semana: int
    efectivo: float
    prop_ef: float
    pay: float
    prop_pa: float
    terminales: float
    prop_te: float
    uber_eats: float
    rappi: float
    cortesias: float
    otros_ingresos: float
    total_venta: float
    total_propina: float
    model_config = ConfigDict(from_attributes=True)

class MovimientoBancoResponse(BaseModel):
    id: int
    fecha: date
    referencia: Optional[str]
    concepto: str
    monto: float
    tipo: TipoMovimientoBanco
    saldo: Optional[float]
    reconciliado: bool
    gasto_id: Optional[int]
    model_config = ConfigDict(from_attributes=True)

class PLMensualResponse(BaseModel):
    id: int
    mes: int
    anio: int
    ventas_totales: float
    costo_insumos: float
    gastos_servicios: float
    gastos_renta: float
    gastos_mantenimiento: float
    gastos_limpieza: float
    gastos_comida_personal: float
    gastos_otros: float
    gastos_nomina: float
    impuestos: float
    utilidad_bruta: float
    utilidad_operativa: float
    utilidad_neta: float
    model_config = ConfigDict(from_attributes=True)

class DistribucionResponse(BaseModel):
    socio_nombre: str
    porcentaje: float
    monto_calculado: float
    monto_pagado: float
    estado: EstadoPago
    fecha_pago: Optional[date]
    model_config = ConfigDict(from_attributes=True)

class DistribucionResumen(BaseModel):
    mes: int
    anio: int
    utilidad_neta: float
    saldo_banco: Optional[float] = None
    saldo_caja: Optional[float] = None
    total_disponible: Optional[float] = None
    distribuciones: List[DistribucionResponse]

class DashboardResumen(BaseModel):
    ventas_hoy: float = 0.0
    ventas_semana: float = 0.0
    ventas_mes: float = 0.0
    cambio_vs_ayer: Optional[float] = None
    cambio_vs_semana_anterior: Optional[float] = None
    gastos_pendientes: int = 0
    estado_caja: Optional[str] = None
    ultimo_arqueo: Optional[str] = None
    utilidad_mes: Optional[float] = None
