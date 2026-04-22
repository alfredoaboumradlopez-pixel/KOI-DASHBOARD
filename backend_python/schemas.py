"""
KOI Dashboard - Schemas Pydantic
"""
from pydantic import BaseModel, ConfigDict, Field
from datetime import date, datetime
from typing import List, Optional
from .models import (
    ClaseGasto, TipoComprobante, MetodoPago,
    TerminalOrigen, EstadoArqueo, EstadoPago, TipoMovimientoBanco, FrecuenciaPago
)

class CategoriaCreate(BaseModel):
    nombre: str

class CategoriaResponse(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = ConfigDict(from_attributes=True)

class GastoDiarioCreate(BaseModel):
    proveedor: str
    clase: ClaseGasto = ClaseGasto.NMP
    categoria: str
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
    propinas_efectivo: float = 0.0
    ventas_parrot: float = 0.0
    propinas_parrot: float = 0.0
    ventas_terminales: float = 0.0
    propinas_terminales: float = 0.0
    ventas_uber: float = 0.0
    ventas_rappi: float = 0.0
    cortesias: float = 0.0
    otros_ingresos: float = 0.0
    semana_numero: int = 0
    gastos: List[GastoDiarioCreate] = []
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
    propinas_efectivo: Optional[float] = 0.0
    ventas_parrot: Optional[float] = 0.0
    propinas_parrot: Optional[float] = 0.0
    ventas_terminales: Optional[float] = 0.0
    propinas_terminales: Optional[float] = 0.0
    ventas_uber: Optional[float] = 0.0
    ventas_rappi: Optional[float] = 0.0
    cortesias: Optional[float] = 0.0
    otros_ingresos: Optional[float] = 0.0
    total_venta: Optional[float] = 0.0
    total_con_propina: Optional[float] = 0.0
    semana_numero: Optional[int] = 0
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
    categoria: str
    monto: float = Field(gt=0)
    metodo_pago: MetodoPago
    comprobante: Optional[str] = "SIN_COMPROBANTE"
    descripcion: Optional[str] = None

class GastoResponse(GastoCreate):
    id: int
    comprobante_url: Optional[str] = None
    comprobante: Optional[str] = None
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
    categoria_default: str

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
    fecha_nacimiento: Optional[date] = None
    tipo_contrato: Optional[str] = None
    rfc: Optional[str] = None
    curp: Optional[str] = None
    numero_imss: Optional[str] = None
    cuenta_banco: Optional[str] = None

class DocumentoEmpleadoResponse(BaseModel):
    id: int
    empleado_id: int
    nombre: str
    tipo: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class EmpleadoResponse(EmpleadoCreate):
    id: int
    activo: bool
    rfc: Optional[str] = None
    curp: Optional[str] = None
    numero_imss: Optional[str] = None
    cuenta_banco: Optional[str] = None
    documentos: List[DocumentoEmpleadoResponse] = []
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

class PagoRecurrenteCreate(BaseModel):
    concepto: str
    proveedor: str
    categoria: str
    frecuencia: FrecuenciaPago
    deadline_texto: str
    dia_limite: Optional[int] = None
    monto_estimado: float = 0.0
    notas: Optional[str] = None

class PagoRecurrenteUpdate(BaseModel):
    concepto: Optional[str] = None
    proveedor: Optional[str] = None
    categoria: Optional[str] = None
    frecuencia: Optional[FrecuenciaPago] = None
    deadline_texto: Optional[str] = None
    dia_limite: Optional[int] = None
    monto_estimado: Optional[float] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None

class PagoRecurrenteResponse(PagoRecurrenteCreate):
    id: int
    activo: bool
    model_config = ConfigDict(from_attributes=True)

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
