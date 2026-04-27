#!/usr/bin/env python3
"""
Seed inicial multi-tenant:
1. Crea restaurante KOI
2. Crea usuario SUPER_ADMIN
3. Backfill restaurante_id=1 en todos los datos existentes
4. Crea catálogo de cuentas para KOI
5. Crea alertas_config para KOI
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from backend_python.database import engine, SessionLocal
from backend_python import models
from backend_python.core.auth import get_password_hash

def run_seed():
    db: Session = SessionLocal()
    results = []
    try:
        # 1. Crear restaurante KOI si no existe
        koi = db.query(models.Restaurante).filter(models.Restaurante.slug == 'koi').first()
        if not koi:
            koi = models.Restaurante(nombre='KOI Hand Roll & Poke', slug='koi', activo=True, plan='profesional')
            db.add(koi)
            db.flush()
            results.append(f"✓ Restaurante KOI creado (id={koi.id})")
        else:
            results.append(f"→ Restaurante KOI ya existe (id={koi.id})")
        KOI_ID = koi.id

        # 2. Crear SUPER_ADMIN
        admin = db.query(models.Usuario).filter(models.Usuario.email == 'admin@rbo.mx').first()
        if not admin:
            admin = models.Usuario(
                email='admin@rbo.mx',
                hashed_password=get_password_hash('rbo2026admin'),
                nombre='RBO Admin',
                rol='SUPER_ADMIN',
                restaurante_id=None,
                activo=True,
            )
            db.add(admin)
            results.append("✓ Usuario SUPER_ADMIN admin@rbo.mx creado")
        else:
            results.append("→ SUPER_ADMIN ya existe")

        # 3. Backfill
        tablas = [
            models.Categoria, models.CierreTurno, models.CuentaPorPagar,
            models.DistribucionUtilidad, models.DocumentoEmpleado, models.Empleado,
            models.Gasto, models.GastoDiario, models.Insumo, models.MovimientoBanco,
            models.NominaPago, models.PagoRecurrente, models.PLMensual,
            models.PropinaDiaria, models.Proveedor, models.VentaDiaria,
        ]
        total_updated = 0
        for model in tablas:
            count = db.query(model).filter(model.restaurante_id == None).count()
            if count > 0:
                db.query(model).filter(model.restaurante_id == None).update({"restaurante_id": KOI_ID})
                total_updated += count
                results.append(f"  ✓ {model.__tablename__}: {count} registros → restaurante_id={KOI_ID}")
        if total_updated == 0:
            results.append("→ Backfill: todos los registros ya tenían restaurante_id")

        # 4. Catálogo de cuentas
        existing_cat = db.query(models.CatalogoCuenta).filter(models.CatalogoCuenta.restaurante_id == KOI_ID).count()
        if existing_cat == 0:
            cuentas = [
                ("4001","Ventas efectivo","INGRESO","ventas_netas",False,1),
                ("4002","Ventas terminal","INGRESO","ventas_netas",False,2),
                ("4003","Ventas Uber Eats","INGRESO","ventas_netas",False,3),
                ("4004","Ventas Rappi","INGRESO","ventas_netas",False,4),
                ("5001","Costo alimentos","COSTO_VENTA","costo_alimentos",True,10),
                ("5002","Costo bebidas","COSTO_VENTA","costo_bebidas",True,11),
                ("6001","Nómina","GASTO_NOMINA","nomina",False,20),
                ("6002","Renta","GASTO_OPERATIVO","renta",True,21),
                ("6003","Luz y gas","GASTO_OPERATIVO","servicios",True,22),
                ("6004","Mantenimiento","GASTO_OPERATIVO","mantenimiento",True,23),
                ("6005","Limpieza","GASTO_OPERATIVO","limpieza",True,24),
                ("6006","Comida personal","GASTO_OPERATIVO","otros_gastos",False,25),
                ("6007","Marketing","GASTO_ADMIN","marketing",True,26),
                ("6008","Otros gastos","GASTO_OPERATIVO","otros_gastos",False,27),
                ("7001","ISR","IMPUESTO","impuestos",False,30),
                ("7002","IVA a pagar","IMPUESTO","impuestos",False,31),
            ]
            for codigo, nombre, tipo, cat_pl, iva, orden in cuentas:
                db.add(models.CatalogoCuenta(
                    restaurante_id=KOI_ID, codigo=codigo, nombre=nombre,
                    tipo=tipo, categoria_pl=cat_pl, iva_acreditable=iva, orden=orden
                ))
            results.append(f"✓ Catálogo de cuentas: {len(cuentas)} cuentas creadas para KOI")
        else:
            results.append(f"→ Catálogo de cuentas ya existe ({existing_cat} cuentas)")

        # 5. Alertas config
        existing_alertas = db.query(models.AlertaConfig).filter(models.AlertaConfig.restaurante_id == KOI_ID).count()
        if existing_alertas == 0:
            alertas = [
                ("FOOD_COST_ALTO", 32.0),
                ("NOMINA_ALTA", 35.0),
                ("MARGEN_BAJO", 15.0),
                ("VENTAS_BAJAS", 80.0),
                ("CAPTURA_INCOMPLETA", 1.0),
            ]
            for tipo, umbral in alertas:
                db.add(models.AlertaConfig(restaurante_id=KOI_ID, tipo=tipo, umbral=umbral))
            results.append(f"✓ Alertas config: {len(alertas)} alertas configuradas para KOI")
        else:
            results.append(f"→ Alertas config ya existen ({existing_alertas})")

        db.commit()
        print("\n=== SEED INICIAL COMPLETADO ===")
        for r in results:
            print(r)
        print("================================\n")

    except Exception as e:
        db.rollback()
        print(f"\n❌ ERROR en seed — rollback completo: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
