from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from . import models, schemas
from .database import engine, get_db

# Crea las tablas en la base de datos (solo para desarrollo, en prod usar Alembic)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="El Koi - API de Control de Gastos",
    description="API para la gestión administrativa del restaurante El Koi",
    version="1.0.0"
)

# ==========================================
# ENDPOINTS: PROVEEDORES
# ==========================================

@app.post("/proveedores/", response_model=schemas.Proveedor, status_code=status.HTTP_201_CREATED)
def create_proveedor(proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    try:
        db_proveedor = models.Proveedor(**proveedor.model_dump())
        db.add(db_proveedor)
        db.commit()
        db.refresh(db_proveedor)
        return db_proveedor
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al crear proveedor: {str(e)}")

@app.get("/proveedores/", response_model=List[schemas.Proveedor])
def read_proveedores(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Proveedor).offset(skip).limit(limit).all()

@app.get("/proveedores/{proveedor_id}", response_model=schemas.Proveedor)
def read_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    db_proveedor = db.query(models.Proveedor).filter(models.Proveedor.id == proveedor_id).first()
    if db_proveedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return db_proveedor

@app.put("/proveedores/{proveedor_id}", response_model=schemas.Proveedor)
def update_proveedor(proveedor_id: int, proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    db_proveedor = db.query(models.Proveedor).filter(models.Proveedor.id == proveedor_id).first()
    if db_proveedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    
    for key, value in proveedor.model_dump().items():
        setattr(db_proveedor, key, value)
    
    try:
        db.commit()
        db.refresh(db_proveedor)
        return db_proveedor
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar proveedor: {str(e)}")

@app.delete("/proveedores/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    db_proveedor = db.query(models.Proveedor).filter(models.Proveedor.id == proveedor_id).first()
    if db_proveedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    
    try:
        db.delete(db_proveedor)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al eliminar proveedor: {str(e)}")

# ==========================================
# ENDPOINTS: CUENTAS POR PAGAR
# ==========================================

@app.post("/cuentas-por-pagar/", response_model=schemas.CuentaPorPagar, status_code=status.HTTP_201_CREATED)
def create_cuenta_por_pagar(cuenta: schemas.CuentaPorPagarCreate, db: Session = Depends(get_db)):
    # Validar que el proveedor existe
    proveedor = db.query(models.Proveedor).filter(models.Proveedor.id == cuenta.proveedor_id).first()
    if not proveedor:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proveedor especificado no existe")
    
    try:
        db_cuenta = models.CuentaPorPagar(**cuenta.model_dump())
        db.add(db_cuenta)
        db.commit()
        db.refresh(db_cuenta)
        return db_cuenta
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al crear cuenta por pagar: {str(e)}")

@app.get("/cuentas-por-pagar/", response_model=List[schemas.CuentaPorPagar])
def read_cuentas_por_pagar(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.CuentaPorPagar).offset(skip).limit(limit).all()

@app.get("/cuentas-por-pagar/{cuenta_id}", response_model=schemas.CuentaPorPagar)
def read_cuenta_por_pagar(cuenta_id: int, db: Session = Depends(get_db)):
    db_cuenta = db.query(models.CuentaPorPagar).filter(models.CuentaPorPagar.id == cuenta_id).first()
    if db_cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por pagar no encontrada")
    return db_cuenta

@app.put("/cuentas-por-pagar/{cuenta_id}", response_model=schemas.CuentaPorPagar)
def update_cuenta_por_pagar(cuenta_id: int, cuenta: schemas.CuentaPorPagarCreate, db: Session = Depends(get_db)):
    db_cuenta = db.query(models.CuentaPorPagar).filter(models.CuentaPorPagar.id == cuenta_id).first()
    if db_cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por pagar no encontrada")
    
    # Validar proveedor si se actualiza
    if cuenta.proveedor_id != db_cuenta.proveedor_id:
        proveedor = db.query(models.Proveedor).filter(models.Proveedor.id == cuenta.proveedor_id).first()
        if not proveedor:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El proveedor especificado no existe")
            
    for key, value in cuenta.model_dump().items():
        setattr(db_cuenta, key, value)
        
    try:
        db.commit()
        db.refresh(db_cuenta)
        return db_cuenta
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar cuenta: {str(e)}")

@app.delete("/cuentas-por-pagar/{cuenta_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cuenta_por_pagar(cuenta_id: int, db: Session = Depends(get_db)):
    db_cuenta = db.query(models.CuentaPorPagar).filter(models.CuentaPorPagar.id == cuenta_id).first()
    if db_cuenta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta por pagar no encontrada")
    
    try:
        db.delete(db_cuenta)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al eliminar cuenta: {str(e)}")

# ==========================================
# ENDPOINTS: FLUJO CAJA FUERTE
# ==========================================

@app.post("/flujo-caja-fuerte/", response_model=schemas.FlujoCajaFuerte, status_code=status.HTTP_201_CREATED)
def create_flujo_caja(flujo: schemas.FlujoCajaFuerteCreate, db: Session = Depends(get_db)):
    try:
        db_flujo = models.FlujoCajaFuerte(**flujo.model_dump())
        db.add(db_flujo)
        db.commit()
        db.refresh(db_flujo)
        return db_flujo
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al registrar flujo de caja: {str(e)}")

@app.get("/flujo-caja-fuerte/", response_model=List[schemas.FlujoCajaFuerte])
def read_flujos_caja(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.FlujoCajaFuerte).offset(skip).limit(limit).all()

@app.get("/flujo-caja-fuerte/{flujo_id}", response_model=schemas.FlujoCajaFuerte)
def read_flujo_caja(flujo_id: int, db: Session = Depends(get_db)):
    db_flujo = db.query(models.FlujoCajaFuerte).filter(models.FlujoCajaFuerte.id == flujo_id).first()
    if db_flujo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de flujo de caja no encontrado")
    return db_flujo

# ==========================================
# ENDPOINTS: ARQUEO DE CAJA
# ==========================================

@app.get("/api/caja/saldo-teorico")
def get_saldo_teorico(db: Session = Depends(get_db)):
    # En un entorno real, estos valores se calcularían sumando 
    # los registros del día actual en la base de datos.
    # Para este MVP, simulamos los montos:
    saldo_inicial = 5000.00
    ventas_efectivo = 12500.50
    gastos_efectivo = 1200.00
    pago_propinas = 850.00

    # Fórmula: (Saldo Inicial + Ventas en Efectivo) - (Gastos Pagados en Efectivo + Pago de Propinas)
    saldo_teorico = (saldo_inicial + ventas_efectivo) - (gastos_efectivo + pago_propinas)

    return {
        "fecha": "2026-02-24",
        "desglose": {
            "saldo_inicial": saldo_inicial,
            "ventas_efectivo": ventas_efectivo,
            "gastos_efectivo": gastos_efectivo,
            "pago_propinas": pago_propinas
        },
        "saldo_teorico": saldo_teorico
    }
