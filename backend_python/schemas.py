from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import List, Optional
from .models import EstadoPago, TipoMovimiento, ConceptoMovimiento

# --- Schemas Proveedor ---
class ProveedorBase(BaseModel):
    nombre: str
    categoria_default: str

class ProveedorCreate(ProveedorBase):
    pass

class Proveedor(ProveedorBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

# --- Schemas CuentaPorPagar ---
class CuentaPorPagarBase(BaseModel):
    proveedor_id: int
    monto_total: float
    fecha_vencimiento: date
    estado_pago: EstadoPago = EstadoPago.PENDIENTE

class CuentaPorPagarCreate(CuentaPorPagarBase):
    pass

class CuentaPorPagar(CuentaPorPagarBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

# --- Schemas FlujoCajaFuerte ---
class FlujoCajaFuerteBase(BaseModel):
    fecha: date
    tipo_movimiento: TipoMovimiento
    concepto: ConceptoMovimiento
    monto: float
    saldo_resultante: float

class FlujoCajaFuerteCreate(FlujoCajaFuerteBase):
    pass

class FlujoCajaFuerte(FlujoCajaFuerteBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)
