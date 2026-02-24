from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, Enum
from sqlalchemy.orm import relationship
from .database import Base
import enum

class EstadoPago(str, enum.Enum):
    PENDIENTE = "Pendiente"
    PAGADO = "Pagado"

class TipoMovimiento(str, enum.Enum):
    INGRESO = "Ingreso"
    EGRESO = "Egreso"

class ConceptoMovimiento(str, enum.Enum):
    VENTA_POS = "Venta_POS"
    GASTO_OPERATIVO = "Gasto_Operativo"
    PAGO_PROPINAS = "Pago_Propinas"

class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, index=True, nullable=False)
    categoria_default = Column(String, nullable=False)

    # Relación uno a muchos con CuentasPorPagar
    cuentas = relationship("CuentaPorPagar", back_populates="proveedor")

class CuentaPorPagar(Base):
    __tablename__ = "cuentas_por_pagar"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False)
    monto_total = Column(Float, nullable=False)
    fecha_vencimiento = Column(Date, nullable=False)
    estado_pago = Column(Enum(EstadoPago), default=EstadoPago.PENDIENTE, nullable=False)

    proveedor = relationship("Proveedor", back_populates="cuentas")

class FlujoCajaFuerte(Base):
    __tablename__ = "flujo_caja_fuerte"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False)
    tipo_movimiento = Column(Enum(TipoMovimiento), nullable=False)
    concepto = Column(Enum(ConceptoMovimiento), nullable=False)
    monto = Column(Float, nullable=False)
    saldo_resultante = Column(Float, nullable=False)
