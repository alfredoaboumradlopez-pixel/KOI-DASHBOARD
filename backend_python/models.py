"""
KOI Dashboard - Modelos de Base de Datos
"""
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, ForeignKey,
    Boolean, Text, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime, date
import enum

from .database import Base


class ClaseGasto(str, enum.Enum):
    NMP = "NMP"

class CategoriaGasto(str, enum.Enum):
    PROTEINA = "PROTEINA"
    VEGETALES_FRUTAS = "VEGETALES_FRUTAS"
    ABARROTES = "ABARROTES"
    BEBIDAS = "BEBIDAS"
    PRODUCTOS_ASIATICOS = "PRODUCTOS_ASIATICOS"
    DESECHABLES_EMPAQUES = "DESECHABLES_EMPAQUES"
    LIMPIEZA_MANTTO = "LIMPIEZA_MANTTO"
    UTENSILIOS = "UTENSILIOS"
    PERSONAL = "PERSONAL"
    PROPINAS = "PROPINAS"
    SERVICIOS = "SERVICIOS"
    EQUIPO = "EQUIPO"
    MARKETING = "MARKETING"
    PAPELERIA = "PAPELERIA"
    RENTA = "RENTA"
    LUZ = "LUZ"
    SOFTWARE = "SOFTWARE"
    COMISIONES_BANCARIAS = "COMISIONES_BANCARIAS"
    IMPUESTOS = "IMPUESTOS"
    NOMINA = "NOMINA"
    COMISIONES_PLATAFORMAS = "COMISIONES_PLATAFORMAS"
    OTROS = "OTROS"

class TipoComprobante(str, enum.Enum):
    VALE = "VALE"
    SISTEMA = "SISTEMA"
    FACTURA = "FACTURA"
    TICKET = "TICKET"
    SIN_COMPROBANTE = "SIN_COMPROBANTE"

class MetodoPago(str, enum.Enum):
    EFECTIVO = "EFECTIVO"
    TRANSFERENCIA = "TRANSFERENCIA"

class TerminalOrigen(str, enum.Enum):
    PARROT = "PARROT"
    CLIP = "CLIP"
    GETNET = "GETNET"
    EFECTIVO = "EFECTIVO"

class EstadoArqueo(str, enum.Enum):
    CUADRADA = "CUADRADA"
    SOBRANTE = "SOBRANTE"
    FALTANTE = "FALTANTE"

class EstadoPago(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    PAGADO = "PAGADO"

class TipoMovimientoBanco(str, enum.Enum):
    CARGO = "CARGO"
    ABONO = "ABONO"

class FrecuenciaPago(str, enum.Enum):
    DIARIO = "DIARIO"
    SEMANAL = "SEMANAL"
    QUINCENAL = "QUINCENAL"
    MENSUAL = "MENSUAL"
    ANUAL = "ANUAL"
    VARIABLE = "VARIABLE"


class Categoria(Base):
    __tablename__ = "categorias"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), nullable=False, unique=True)
    activo = Column(Boolean, default=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)


CATEGORIAS_SEED = [
    "PROTEINA","VEGETALES_FRUTAS","ABARROTES","BEBIDAS","PRODUCTOS_ASIATICOS",
    "DESECHABLES_EMPAQUES","LIMPIEZA_MANTTO","UTENSILIOS","PERSONAL","PROPINAS",
    "SERVICIOS","EQUIPO","MARKETING","PAPELERIA","RENTA","LUZ","SOFTWARE",
    "COMISIONES_BANCARIAS","IMPUESTOS","NOMINA","COMISIONES_PLATAFORMAS","OTROS",
]


class VentaDiaria(Base):
    __tablename__ = "ventas_diarias"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, index=True)
    mes = Column(String(3), nullable=False)
    semana = Column(Integer, nullable=False)
    efectivo = Column(Float, default=0.0)
    prop_ef = Column(Float, default=0.0)
    pay = Column(Float, default=0.0)
    prop_pa = Column(Float, default=0.0)
    terminales = Column(Float, default=0.0)
    prop_te = Column(Float, default=0.0)
    uber_eats = Column(Float, default=0.0)
    rappi = Column(Float, default=0.0)
    cortesias = Column(Float, default=0.0)
    otros_ingresos = Column(Float, default=0.0)
    total_venta = Column(Float, default=0.0)
    total_propina = Column(Float, default=0.0)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)


class CierreTurno(Base):
    __tablename__ = "cierres_turno"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, unique=True, index=True)
    responsable = Column(String(100), nullable=False)
    elaborado_por = Column(String(100), nullable=False)
    saldo_inicial = Column(Float, nullable=False)
    ventas_efectivo = Column(Float, nullable=False, default=0.0)
    propinas_efectivo = Column(Float, default=0.0)
    ventas_parrot = Column(Float, default=0.0)
    propinas_parrot = Column(Float, default=0.0)
    ventas_terminales = Column(Float, default=0.0)
    propinas_terminales = Column(Float, default=0.0)
    ventas_uber = Column(Float, default=0.0)
    ventas_rappi = Column(Float, default=0.0)
    cortesias = Column(Float, default=0.0)
    otros_ingresos = Column(Float, default=0.0)
    total_venta = Column(Float, default=0.0)
    total_con_propina = Column(Float, default=0.0)
    semana_numero = Column(Integer, default=0)
    total_gastos = Column(Float, nullable=False, default=0.0)
    saldo_final_esperado = Column(Float, nullable=False, default=0.0)
    efectivo_fisico = Column(Float, nullable=True)
    diferencia = Column(Float, nullable=True)
    estado = Column(SQLEnum(EstadoArqueo), nullable=True)
    notas = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    gastos = relationship("GastoDiario", back_populates="cierre", cascade="all, delete-orphan")
    propinas = relationship("PropinaDiaria", back_populates="cierre", cascade="all, delete-orphan")


class GastoDiario(Base):
    __tablename__ = "gastos_diarios"
    id = Column(Integer, primary_key=True, index=True)
    cierre_id = Column(Integer, ForeignKey("cierres_turno.id"), nullable=False)
    proveedor = Column(String(100), nullable=False)
    clase = Column(SQLEnum(ClaseGasto), nullable=False, default=ClaseGasto.NMP)
    categoria = Column(String(50), nullable=False)
    comprobante = Column(SQLEnum(TipoComprobante), nullable=False)
    descripcion = Column(String(255), nullable=False)
    monto = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    catalogo_cuenta_id = Column(Integer, ForeignKey("catalogo_cuentas.id"), nullable=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    cierre = relationship("CierreTurno", back_populates="gastos")


class PropinaDiaria(Base):
    __tablename__ = "propinas_diarias"
    id = Column(Integer, primary_key=True, index=True)
    cierre_id = Column(Integer, ForeignKey("cierres_turno.id"), nullable=False)
    terminal = Column(SQLEnum(TerminalOrigen), nullable=False)
    monto = Column(Float, nullable=False)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    cierre = relationship("CierreTurno", back_populates="propinas")


class Proveedor(Base):
    __tablename__ = "proveedores"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), index=True, nullable=False)
    categoria_default = Column(String(50), nullable=False)
    activo = Column(Boolean, default=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    cuentas = relationship("CuentaPorPagar", back_populates="proveedor")


class CuentaPorPagar(Base):
    __tablename__ = "cuentas_por_pagar"
    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False)
    monto_total = Column(Float, nullable=False)
    fecha_vencimiento = Column(Date, nullable=False)
    estado_pago = Column(SQLEnum(EstadoPago), default=EstadoPago.PENDIENTE, nullable=False)
    descripcion = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    proveedor = relationship("Proveedor", back_populates="cuentas")


class Gasto(Base):
    __tablename__ = "gastos"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, index=True)
    proveedor = Column(String(100), nullable=False)
    categoria = Column(String(50), nullable=False)
    monto = Column(Float, nullable=False)
    metodo_pago = Column(SQLEnum(MetodoPago), nullable=False)
    comprobante_url = Column(String(500), nullable=True)
    comprobante = Column(String(30), default="SIN_COMPROBANTE")
    descripcion = Column(String(255), nullable=True)
    estado = Column(SQLEnum(EstadoPago), default=EstadoPago.PENDIENTE)
    created_at = Column(DateTime, default=datetime.utcnow)
    catalogo_cuenta_id = Column(Integer, ForeignKey("catalogo_cuentas.id"), nullable=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)


class Empleado(Base):
    __tablename__ = "empleados"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    puesto = Column(String(100), nullable=False)
    salario_base = Column(Float, nullable=False)
    fecha_ingreso = Column(Date, nullable=False)
    fecha_nacimiento = Column(Date, nullable=True)
    tipo_contrato = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True)
    rfc = Column(String(20), nullable=True)
    curp = Column(String(20), nullable=True)
    numero_imss = Column(String(20), nullable=True)
    cuenta_banco = Column(String(50), nullable=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    pagos = relationship("NominaPago", back_populates="empleado")
    documentos = relationship("DocumentoEmpleado", back_populates="empleado", cascade="all, delete-orphan")


class DocumentoEmpleado(Base):
    __tablename__ = "documentos_empleado"
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    nombre = Column(String(255), nullable=False)
    tipo = Column(String(50), nullable=False)
    ruta = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    empleado = relationship("Empleado", back_populates="documentos")


class NominaPago(Base):
    __tablename__ = "nomina_pagos"
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    periodo_inicio = Column(Date, nullable=False)
    periodo_fin = Column(Date, nullable=False)
    salario_base = Column(Float, nullable=False)
    horas_extra = Column(Float, default=0.0)
    deducciones = Column(Float, default=0.0)
    neto_pagado = Column(Float, nullable=False)
    fecha_pago = Column(Date, nullable=False)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    empleado = relationship("Empleado", back_populates="pagos")


class Insumo(Base):
    __tablename__ = "insumos"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    unidad = Column(String(20), nullable=False)
    stock_actual = Column(Float, nullable=False, default=0.0)
    stock_minimo = Column(Float, nullable=False, default=0.0)
    precio_unitario = Column(Float, nullable=False, default=0.0)
    proveedor = Column(String(100), nullable=True)
    ultima_compra = Column(Date, nullable=True)
    activo = Column(Boolean, default=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)


class MovimientoBanco(Base):
    __tablename__ = "movimientos_banco"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, index=True)
    referencia = Column(String(100), nullable=True)
    concepto = Column(String(255), nullable=False)
    monto = Column(Float, nullable=False)
    tipo = Column(SQLEnum(TipoMovimientoBanco), nullable=False)
    saldo = Column(Float, nullable=True)
    reconciliado = Column(Boolean, default=False)
    gasto_id = Column(Integer, ForeignKey("gastos.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)


class PLMensual(Base):
    __tablename__ = "pl_mensual"
    id = Column(Integer, primary_key=True, index=True)
    mes = Column(Integer, nullable=False)
    anio = Column(Integer, nullable=False)
    ventas_totales = Column(Float, default=0.0)
    costo_insumos = Column(Float, default=0.0)
    gastos_servicios = Column(Float, default=0.0)
    gastos_renta = Column(Float, default=0.0)
    gastos_mantenimiento = Column(Float, default=0.0)
    gastos_limpieza = Column(Float, default=0.0)
    gastos_comida_personal = Column(Float, default=0.0)
    gastos_otros = Column(Float, default=0.0)
    gastos_nomina = Column(Float, default=0.0)
    impuestos = Column(Float, default=0.0)
    utilidad_bruta = Column(Float, default=0.0)
    utilidad_operativa = Column(Float, default=0.0)
    utilidad_neta = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    calculado_automaticamente = Column(Boolean, default=False)
    fecha_calculo = Column(DateTime, nullable=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    distribuciones = relationship("DistribucionUtilidad", back_populates="pl")


class PagoRecurrente(Base):
    __tablename__ = "pagos_recurrentes"
    id = Column(Integer, primary_key=True, index=True)
    concepto = Column(String(200), nullable=False)
    proveedor = Column(String(100), nullable=False)
    categoria = Column(String(50), nullable=False)
    frecuencia = Column(SQLEnum(FrecuenciaPago), nullable=False)
    deadline_texto = Column(String(100), nullable=False)
    dia_limite = Column(Integer, nullable=True)
    monto_estimado = Column(Float, default=0.0)
    activo = Column(Boolean, default=True)
    notas = Column(Text, nullable=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    pagado_mes = Column(Integer, nullable=True)
    pagado_anio = Column(Integer, nullable=True)


SOCIOS_CONFIG = [
    {"nombre": "Jorge", "porcentaje": 25.0},
    {"nombre": "Male", "porcentaje": 25.0},
    {"nombre": "Sotes", "porcentaje": 25.0},
    {"nombre": "Luis", "porcentaje": 12.5},
    {"nombre": "Nino", "porcentaje": 12.5},
]


class DistribucionUtilidad(Base):
    __tablename__ = "distribucion_utilidades"
    id = Column(Integer, primary_key=True, index=True)
    pl_id = Column(Integer, ForeignKey("pl_mensual.id"), nullable=False)
    socio_nombre = Column(String(50), nullable=False)
    porcentaje = Column(Float, nullable=False)
    monto_calculado = Column(Float, nullable=False)
    monto_pagado = Column(Float, default=0.0)
    fecha_pago = Column(Date, nullable=True)
    estado = Column(SQLEnum(EstadoPago), default=EstadoPago.PENDIENTE)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    pl = relationship("PLMensual", back_populates="distribuciones")


class Restaurante(Base):
    __tablename__ = "restaurantes"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    slug = Column(String(50), nullable=False, unique=True)
    activo = Column(Boolean, default=True)
    plan = Column(String(20), default='basico')
    created_at = Column(DateTime, default=datetime.utcnow)
    timezone = Column(String(50), default='America/Mexico_City')
    moneda = Column(String(3), default='MXN')

class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=False)
    nombre = Column(String(100), nullable=False)
    rol = Column(String(20), nullable=False)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ultimo_acceso = Column(DateTime, nullable=True)

class CatalogoCuenta(Base):
    __tablename__ = "catalogo_cuentas"
    id = Column(Integer, primary_key=True, index=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=False)
    nombre = Column(String(100), nullable=False)
    codigo = Column(String(20), nullable=False)
    tipo = Column(String(20), nullable=False)
    categoria_pl = Column(String(50), nullable=False)
    iva_acreditable = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

class AlertaConfig(Base):
    __tablename__ = "alertas_config"
    id = Column(Integer, primary_key=True, index=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=False)
    tipo = Column(String(50), nullable=False)
    umbral = Column(Float, nullable=False)
    activo = Column(Boolean, default=True)
    notificar_email = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AlertaLog(Base):
    __tablename__ = "alertas_log"
    id = Column(Integer, primary_key=True, index=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=False)
    tipo = Column(String(50), nullable=False)
    mensaje = Column(Text, nullable=False)
    valor_detectado = Column(Float, nullable=True)
    umbral_config = Column(Float, nullable=True)
    revisada = Column(Boolean, default=False)
    severidad = Column(String(10), default='WARNING')  # 'INFO' | 'WARNING' | 'CRITICAL'
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, index=True)
    restaurante_id = Column(Integer, ForeignKey("restaurantes.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    accion = Column(String(100), nullable=False)
    tabla_afectada = Column(String(50), nullable=True)
    registro_id = Column(Integer, nullable=True)
    detalle = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
