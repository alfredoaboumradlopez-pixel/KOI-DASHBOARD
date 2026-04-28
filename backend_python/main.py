"""
KOI Dashboard - API Principal
"""
from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Query, status, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, extract, cast, String
import os as _os
_USE_PG = bool(_os.environ.get("DATABASE_URL"))

def _filter_mes_anio(query, column, mes, anio):
    """Filtra por mes y anio, compatible con SQLite y PostgreSQL"""
    if _USE_PG:
        return query.filter(extract("month", column) == mes, extract("year", column) == anio)
    else:
        return query.filter(func.strftime("%m", column) == str(mes).zfill(2), func.strftime("%Y", column) == str(anio))

def _sum_filtered(db, model_col, date_col, mes, anio, extra_filter=None):
    """Suma con filtro mes/anio compatible"""
    q = db.query(func.sum(model_col))
    if _USE_PG:
        q = q.filter(extract("month", date_col) == mes, extract("year", date_col) == anio)
    else:
        q = q.filter(func.strftime("%m", date_col) == str(mes).zfill(2), func.strftime("%Y", date_col) == str(anio))
    if extra_filter is not None:
        q = q.filter(extra_filter)
    return q.scalar() or 0.0


from typing import List, Optional
from datetime import date, datetime, timedelta
import csv
import pdfplumber
import io
import os
import re

from . import models, schemas
from .database import engine, get_db
from .core.auth import get_optional_user, get_restaurante_id
from .routers.auth_router import router as auth_router
from .routers.restaurantes_router import router as restaurantes_router
from .routers.pl_router import router as pl_router
from .routers.gastos_categorizacion_router import router as gastos_cat_router
from .routers.alertas_router import router as alertas_router
from .routers.gastos_dashboard_router import router as gastos_dashboard_router
from .routers.costeo_router import router as costeo_router, seed_costeo, seed_ventas_parrot
from .routers.proveedores_analytics_router import router as proveedores_analytics_router
from .routers.flujo_caja_router import router as flujo_caja_router

models.Base.metadata.create_all(bind=engine)

# Migracion: agregar columnas nuevas si no existen
from sqlalchemy import text as _text, inspect as _inspect
try:
    _insp = _inspect(engine)
    existing_cols = [c['name'] for c in _insp.get_columns('empleados')]
    new_cols = {"rfc": "VARCHAR(20)", "curp": "VARCHAR(20)", "numero_imss": "VARCHAR(20)", "cuenta_banco": "VARCHAR(50)", "fecha_nacimiento": "DATE", "tipo_contrato": "VARCHAR(20)", "fin_contrato": "DATE"}
    with engine.begin() as conn:
        for col_name, col_type in new_cols.items():
            if col_name not in existing_cols:
                conn.execute(_text(f"ALTER TABLE empleados ADD COLUMN {col_name} {col_type}"))
                print(f"Columna {col_name} agregada a empleados")
except Exception as e:
    print(f"Migracion error: {e}")

# Migracion: convertir columnas categoria de ENUM a VARCHAR en PostgreSQL
if _USE_PG:
    try:
        with engine.begin() as conn:
            for table, col in [("gastos","categoria"),("gastos_diarios","categoria"),("proveedores","categoria_default"),("pagos_recurrentes","categoria")]:
                conn.execute(_text(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE VARCHAR(50) USING {col}::text"))
                print(f"Migrado {table}.{col} a VARCHAR")
    except Exception as e:
        print(f"Migracion categoria (ya migrado o no existe): {e}")

# Migracion: agregar valores nuevos al enum frecuenciapago en PostgreSQL
if _USE_PG:
    try:
        with engine.begin() as conn:
            conn.execute(_text("ALTER TYPE frecuenciapago ADD VALUE IF NOT EXISTS 'VARIABLE'"))
            print("Enum frecuenciapago: VARIABLE agregado")
    except Exception as e:
        print(f"Migracion frecuenciapago: {e}")

# Migracion: agregar restaurante_id a todas las tablas existentes
try:
    _insp_t = _inspect(engine)
    _tablas_tenant = [
        'categorias','cierres_turno','cuentas_por_pagar','distribucion_utilidades',
        'documentos_empleado','empleados','gastos','gastos_diarios','insumos',
        'movimientos_banco','nomina_pagos','pagos_recurrentes','pl_mensual',
        'propinas_diarias','proveedores','ventas_diarias',
    ]
    with engine.begin() as _conn_t:
        for _tbl in _tablas_tenant:
            try:
                _cols_t = [c['name'] for c in _insp_t.get_columns(_tbl)]
                if 'restaurante_id' not in _cols_t:
                    _conn_t.execute(_text(f"ALTER TABLE {_tbl} ADD COLUMN restaurante_id INTEGER REFERENCES restaurantes(id)"))
                    print(f"  restaurante_id agregado a {_tbl}")
            except Exception as _e:
                print(f"  (skip {_tbl}.restaurante_id: {_e})")
except Exception as _e:
    print(f"Migracion restaurante_id: {_e}")

# Migracion: agregar contenido_base64 a documentos_empleado
try:
    _insp3 = _inspect(engine)
    _cols_doc = [c['name'] for c in _insp3.get_columns('documentos_empleado')]
    if 'contenido_base64' not in _cols_doc:
        with engine.begin() as _conn3:
            _conn3.execute(_text("ALTER TABLE documentos_empleado ADD COLUMN contenido_base64 TEXT"))
            print("Columna contenido_base64 agregada a documentos_empleado")
except Exception as e:
    print(f"Migracion documentos_empleado: {e}")

# Auto-seed categorias si tabla vacia
try:
    from sqlalchemy.orm import Session as _Session
    with _Session(engine) as _s:
        if _s.query(models.Categoria).count() == 0:
            for nombre in models.CATEGORIAS_SEED:
                _s.add(models.Categoria(nombre=nombre))
            _s.commit()
            print(f"Categorias seed: {len(models.CATEGORIAS_SEED)} categorias creadas")
except Exception as e:
    print(f"Seed categorias error: {e}")

# Seed multi-tenant: crear KOI y backfill si necesario
try:
    from .core.auth import get_password_hash as _hash_pw
    with _Session(engine) as _st:
        # Crear restaurante KOI si no existe
        _koi = _st.query(models.Restaurante).filter(models.Restaurante.slug == 'koi').first()
        if not _koi:
            _koi = models.Restaurante(nombre='KOI Hand Roll & Poke', slug='koi', activo=True, plan='profesional')
            _st.add(_koi)
            _st.flush()
            print(f"Restaurante KOI creado (id={_koi.id})")
        _KOI_ID = _koi.id
        # Crear SUPER_ADMIN si no existe
        if not _st.query(models.Usuario).filter(models.Usuario.email == 'admin@rbo.mx').first():
            _st.add(models.Usuario(
                email='admin@rbo.mx', hashed_password=_hash_pw('rbo2026admin'),
                nombre='RBO Admin', rol='SUPER_ADMIN', restaurante_id=None, activo=True,
            ))
            print("Usuario SUPER_ADMIN creado: admin@rbo.mx / rbo2026admin")
        # Backfill restaurante_id para datos existentes de KOI
        _tenant_models = [
            models.Categoria, models.CierreTurno, models.CuentaPorPagar,
            models.DistribucionUtilidad, models.DocumentoEmpleado, models.Empleado,
            models.Gasto, models.GastoDiario, models.Insumo, models.MovimientoBanco,
            models.NominaPago, models.PagoRecurrente, models.PLMensual,
            models.PropinaDiaria, models.Proveedor, models.VentaDiaria,
        ]
        for _m in _tenant_models:
            try:
                _n = _st.query(_m).filter(_m.restaurante_id == None).count()
                if _n > 0:
                    _st.query(_m).filter(_m.restaurante_id == None).update({"restaurante_id": _KOI_ID})
            except Exception: pass
        # Catálogo de cuentas para KOI
        if _st.query(models.CatalogoCuenta).filter(models.CatalogoCuenta.restaurante_id == _KOI_ID).count() == 0:
            _cuentas = [
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
            for _c in _cuentas:
                _st.add(models.CatalogoCuenta(restaurante_id=_KOI_ID, codigo=_c[0], nombre=_c[1], tipo=_c[2], categoria_pl=_c[3], iva_acreditable=_c[4], orden=_c[5]))
        # Alertas config para KOI
        if _st.query(models.AlertaConfig).filter(models.AlertaConfig.restaurante_id == _KOI_ID).count() == 0:
            for _tipo, _umbral in [("FOOD_COST_ALTO",32.0),("NOMINA_ALTA",35.0),("MARGEN_BAJO",15.0),("VENTAS_BAJAS",80.0),("CAPTURA_INCOMPLETA",1.0)]:
                _st.add(models.AlertaConfig(restaurante_id=_KOI_ID, tipo=_tipo, umbral=_umbral))
        _st.commit()
        print(f"Multi-tenant seed OK — KOI restaurante_id={_KOI_ID}")
except Exception as _e:
    print(f"Seed multi-tenant error: {_e}")

# Migracion: severidad en alertas_log + GASTO_SIN_CATEGORIA config
try:
    _insp_al = _inspect(engine)
    _cols_al = [c['name'] for c in _insp_al.get_columns('alertas_log')]
    with engine.begin() as _conn_al:
        if 'severidad' not in _cols_al:
            _conn_al.execute(_text("ALTER TABLE alertas_log ADD COLUMN severidad VARCHAR(10) DEFAULT 'WARNING'"))
            print("  severidad agregado a alertas_log")
except Exception as _e_al:
    print(f"Migracion alertas_log.severidad: {_e_al}")

# Seed GASTO_SIN_CATEGORIA si no existe (retrocompatible)
try:
    from sqlalchemy.orm import Session as _Session2
    with _Session2(engine) as _s2:
        _koi2 = _s2.query(models.Restaurante).filter(models.Restaurante.slug == 'koi').first()
        if _koi2:
            _gsc = _s2.query(models.AlertaConfig).filter(
                models.AlertaConfig.restaurante_id == _koi2.id,
                models.AlertaConfig.tipo == 'GASTO_SIN_CATEGORIA',
            ).first()
            if not _gsc:
                _s2.add(models.AlertaConfig(restaurante_id=_koi2.id, tipo='GASTO_SIN_CATEGORIA', umbral=0.0, activo=True))
                _s2.commit()
                print("AlertaConfig GASTO_SIN_CATEGORIA agregada a KOI")
except Exception as _e_gsc:
    print(f"Seed GASTO_SIN_CATEGORIA: {_e_gsc}")

# Seed costeo KOI (insumos + platillos)
try:
    from sqlalchemy.orm import Session as _Session3
    with _Session3(engine) as _s3:
        _koi3 = _s3.query(models.Restaurante).filter(models.Restaurante.slug == 'koi').first()
        if _koi3:
            seed_costeo(_s3, restaurante_id=_koi3.id)
            print("Seed costeo KOI OK")
except Exception as _e_seed:
    print(f"Seed costeo: {_e_seed}")

# Migracion: agregar catalogo_cuenta_id a gastos y gastos_diarios
try:
    _insp_cc = _inspect(engine)
    with engine.begin() as _conn_cc:
        for _tbl_cc, _fk_clause in [('gastos', ''), ('gastos_diarios', '')]:
            try:
                _cols_cc = [c['name'] for c in _insp_cc.get_columns(_tbl_cc)]
                if 'catalogo_cuenta_id' not in _cols_cc:
                    _conn_cc.execute(_text(f"ALTER TABLE {_tbl_cc} ADD COLUMN catalogo_cuenta_id INTEGER REFERENCES catalogo_cuentas(id)"))
                    print(f"  catalogo_cuenta_id agregado a {_tbl_cc}")
            except Exception as _e2:
                print(f"  (skip {_tbl_cc}.catalogo_cuenta_id: {_e2})")
        # pl_mensual new columns
        try:
            _cols_pl = [c['name'] for c in _insp_cc.get_columns('pl_mensual')]
            if 'calculado_automaticamente' not in _cols_pl:
                _conn_cc.execute(_text("ALTER TABLE pl_mensual ADD COLUMN calculado_automaticamente BOOLEAN DEFAULT false"))
            if 'fecha_calculo' not in _cols_pl:
                _conn_cc.execute(_text("ALTER TABLE pl_mensual ADD COLUMN fecha_calculo TIMESTAMP"))
        except Exception as _e3:
            print(f"  (skip pl_mensual cols: {_e3})")
except Exception as _e:
    print(f"Migracion catalogo_cuenta_id: {_e}")

# Migracion: crear tabla ventas_por_platillo y seed datos Parrot abril 2026
try:
    with engine.begin() as _conn_vp:
        if _USE_PG:
            _conn_vp.execute(_text("""
                CREATE TABLE IF NOT EXISTS ventas_por_platillo (
                    id SERIAL PRIMARY KEY,
                    restaurante_id INTEGER REFERENCES restaurantes(id),
                    mes INTEGER NOT NULL,
                    anio INTEGER NOT NULL,
                    nombre_parrot VARCHAR(200) NOT NULL,
                    platillo_id INTEGER REFERENCES platillos(id),
                    cantidad_vendida INTEGER NOT NULL DEFAULT 0,
                    precio_promedio DOUBLE PRECISION DEFAULT 0,
                    venta_total DOUBLE PRECISION DEFAULT 0,
                    venta_neta DOUBLE PRECISION DEFAULT 0,
                    created_at TIMESTAMP DEFAULT now(),
                    UNIQUE(restaurante_id, mes, anio, nombre_parrot)
                )
            """))
    print("Tabla ventas_por_platillo OK")
except Exception as _e_vp:
    print(f"Migracion ventas_por_platillo: {_e_vp}")

try:
    from sqlalchemy.orm import Session as _Session4
    with _Session4(engine) as _s4:
        _koi4 = _s4.query(models.Restaurante).filter(models.Restaurante.slug == 'koi').first()
        if _koi4:
            seed_ventas_parrot(_s4, restaurante_id=_koi4.id, mes=4, anio=2026)
            print("Seed ventas Parrot abril 2026 OK")
except Exception as _e_sv:
    print(f"Seed ventas_parrot: {_e_sv}")

# Migracion: crear tabla config_flujo_caja e insertar default para KOI
try:
    with engine.begin() as _conn_fc:
        if _USE_PG:
            _conn_fc.execute(_text("""
                CREATE TABLE IF NOT EXISTS config_flujo_caja (
                    id SERIAL PRIMARY KEY,
                    restaurante_id INTEGER UNIQUE REFERENCES restaurantes(id),
                    saldo_banco_inicial DOUBLE PRECISION DEFAULT 0,
                    nomina_semanal_estimada DOUBLE PRECISION DEFAULT 20000,
                    dia_corte_impuestos INTEGER DEFAULT 17,
                    porcentaje_iva DOUBLE PRECISION DEFAULT 16.0,
                    porcentaje_isr DOUBLE PRECISION DEFAULT 30.0,
                    retiro_utilidades_pct DOUBLE PRECISION DEFAULT 0,
                    semana_retiro INTEGER DEFAULT 4,
                    notas TEXT,
                    updated_at TIMESTAMP DEFAULT now()
                )
            """))
        _koi_fc = _conn_fc.execute(_text("SELECT id FROM restaurantes WHERE slug='koi' LIMIT 1")).fetchone()
        if _koi_fc:
            _conn_fc.execute(_text("""
                INSERT INTO config_flujo_caja
                    (restaurante_id, saldo_banco_inicial, nomina_semanal_estimada,
                     dia_corte_impuestos, porcentaje_iva, porcentaje_isr,
                     retiro_utilidades_pct, semana_retiro)
                VALUES (:rid, 0, 20000, 17, 16.0, 30.0, 0, 4)
                ON CONFLICT (restaurante_id) DO NOTHING
            """), {"rid": _koi_fc[0]})
            print("config_flujo_caja seed OK")
except Exception as _e_fc:
    print(f"Migracion config_flujo_caja: {_e_fc}")


app = FastAPI(
    title="KOI Dashboard API",
    description="API para la gestion administrativa del restaurante KOI",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(restaurantes_router)
app.include_router(pl_router)
app.include_router(gastos_cat_router)
app.include_router(alertas_router)
app.include_router(gastos_dashboard_router)
app.include_router(costeo_router)
app.include_router(proveedores_analytics_router)
app.include_router(flujo_caja_router)

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(os.path.join(UPLOADS_DIR, "documentos"), exist_ok=True)


def parse_money(value: str) -> float:
    if not value or value.strip() == "-":
        return 0.0
    cleaned = re.sub(r'[$,\s"]', '', value.strip())
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


@app.post("/api/ventas/importar-csv", status_code=status.HTTP_201_CREATED)
def importar_csv_ventas(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = file.file.read().decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo CSV: {str(e)}")
    header_row_idx = None
    for i, row in enumerate(rows):
        if len(row) > 0 and row[0].strip() == "FECHA":
            header_row_idx = i
            break
    if header_row_idx is None:
        raise HTTPException(status_code=400, detail="No se encontro la seccion de detalle diario")
    registros_creados = 0
    registros_saltados = 0
    for row in rows[header_row_idx + 1:]:
        if len(row) < 15:
            continue
        fecha_str = row[0].strip()
        if not fecha_str or fecha_str == "-":
            continue
        try:
            fecha = datetime.strptime(fecha_str, "%d-%b-%Y").date()
        except ValueError:
            continue
        existing = db.query(models.VentaDiaria).filter(models.VentaDiaria.fecha == fecha).first()
        valores = [row[i].strip() for i in range(3, 15)]
        if all(v == "-" or v == "" for v in valores):
            registros_saltados += 1
            continue
        venta = models.VentaDiaria(
            fecha=fecha, mes=row[1].strip().lower(),
            semana=int(row[2].strip()) if row[2].strip().isdigit() else 0,
            efectivo=parse_money(row[3]), prop_ef=parse_money(row[4]),
            pay=parse_money(row[5]), prop_pa=parse_money(row[6]),
            terminales=parse_money(row[7]), prop_te=parse_money(row[8]),
            uber_eats=parse_money(row[9]), rappi=parse_money(row[10]),
            cortesias=parse_money(row[11]), otros_ingresos=parse_money(row[12]),
            total_venta=parse_money(row[13]), total_propina=parse_money(row[14]),
        )
        if existing:
            for key in ['mes','semana','efectivo','prop_ef','pay','prop_pa','terminales','prop_te','uber_eats','rappi','cortesias','otros_ingresos','total_venta','total_propina']:
                setattr(existing, key, getattr(venta, key))
        else:
            db.add(venta)
        registros_creados += 1
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando: {str(e)}")
    return {"mensaje": "Importacion completada", "registros_importados": registros_creados, "registros_saltados": registros_saltados}


@app.get("/api/ventas", response_model=List[schemas.VentaDiariaResponse])
def get_ventas(mes: Optional[str] = None, fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None, db: Session = Depends(get_db)):
    query = db.query(models.VentaDiaria)
    if mes:
        query = query.filter(models.VentaDiaria.mes == mes.lower())
    if fecha_inicio:
        query = query.filter(models.VentaDiaria.fecha >= fecha_inicio)
    if fecha_fin:
        query = query.filter(models.VentaDiaria.fecha <= fecha_fin)
    return query.order_by(models.VentaDiaria.fecha.desc()).all()


@app.post("/api/cierre-turno", response_model=schemas.CierreTurnoResponse, status_code=status.HTTP_201_CREATED)
def crear_cierre_turno(
    cierre: schemas.CierreTurnoCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_optional_user),
):
    existing = db.query(models.CierreTurno).filter(models.CierreTurno.fecha == cierre.fecha).first()
    if existing:
        # Actualizar el cierre existente
        existing.responsable = cierre.responsable
        existing.elaborado_por = cierre.elaborado_por
        existing.saldo_inicial = cierre.saldo_inicial
        existing.ventas_efectivo = cierre.ventas_efectivo
        existing.propinas_efectivo = cierre.propinas_efectivo or existing.propinas_efectivo or 0
        existing.ventas_parrot = cierre.ventas_parrot
        existing.propinas_parrot = cierre.propinas_parrot or existing.propinas_parrot or 0
        existing.ventas_terminales = cierre.ventas_terminales
        existing.propinas_terminales = cierre.propinas_terminales or existing.propinas_terminales or 0
        existing.ventas_uber = cierre.ventas_uber
        existing.ventas_rappi = cierre.ventas_rappi
        existing.cortesias = cierre.cortesias
        existing.otros_ingresos = cierre.otros_ingresos
        existing.semana_numero = cierre.semana_numero
        existing.total_venta = cierre.ventas_efectivo + cierre.ventas_parrot + cierre.ventas_terminales + cierre.ventas_uber + cierre.ventas_rappi + cierre.cortesias + cierre.otros_ingresos
        existing.total_con_propina = existing.total_venta + (existing.propinas_efectivo or 0) + (existing.propinas_parrot or 0) + (existing.propinas_terminales or 0)
        if cierre.efectivo_fisico is not None:
            existing.efectivo_fisico = cierre.efectivo_fisico
            saldo_esp = cierre.saldo_inicial + cierre.ventas_efectivo + (existing.propinas_efectivo or 0)
            existing.saldo_final_esperado = saldo_esp
            existing.diferencia = cierre.efectivo_fisico - saldo_esp
            if abs(existing.diferencia) < 0.01:
                existing.estado = models.EstadoArqueo.CUADRADA
            elif existing.diferencia > 0:
                existing.estado = models.EstadoArqueo.SOBRANTE
            else:
                existing.estado = models.EstadoArqueo.FALTANTE
        if cierre.notas:
            existing.notas = cierre.notas
        db.commit()
        db.refresh(existing)
        # Trigger alertas en background
        try:
            from .jobs.alertas_job import alertas_job as _aj
            _rid = (current_user.restaurante_id if current_user and current_user.restaurante_id else None) or existing.restaurante_id or 1
            background_tasks.add_task(_aj.evaluar_restaurante, db, _rid)
        except Exception: pass
        return existing
    total_venta = cierre.ventas_efectivo + cierre.ventas_parrot + cierre.ventas_terminales + cierre.ventas_uber + cierre.ventas_rappi + cierre.cortesias + cierre.otros_ingresos
    total_propinas_canales = cierre.propinas_efectivo + cierre.propinas_parrot + cierre.propinas_terminales
    total_con_propina = total_venta + total_propinas_canales
    total_gastos_items = sum(g.monto for g in cierre.gastos)
    total_propinas = sum(p.monto for p in cierre.propinas)
    total_gastos = total_gastos_items + total_propinas
    saldo_final_esperado = cierre.saldo_inicial + cierre.ventas_efectivo + cierre.propinas_efectivo - total_gastos
    diferencia = None
    estado = None
    if cierre.efectivo_fisico is not None:
        diferencia = cierre.efectivo_fisico - saldo_final_esperado
        if abs(diferencia) < 0.01:
            estado = models.EstadoArqueo.CUADRADA
        elif diferencia > 0:
            estado = models.EstadoArqueo.SOBRANTE
        else:
            estado = models.EstadoArqueo.FALTANTE
    db_cierre = models.CierreTurno(
        fecha=cierre.fecha, responsable=cierre.responsable, elaborado_por=cierre.elaborado_por,
        saldo_inicial=cierre.saldo_inicial, ventas_efectivo=cierre.ventas_efectivo,
        propinas_efectivo=cierre.propinas_efectivo,
        ventas_parrot=cierre.ventas_parrot,
        propinas_parrot=cierre.propinas_parrot,
        ventas_terminales=cierre.ventas_terminales,
        propinas_terminales=cierre.propinas_terminales,
        ventas_uber=cierre.ventas_uber,
        ventas_rappi=cierre.ventas_rappi,
        cortesias=cierre.cortesias,
        otros_ingresos=cierre.otros_ingresos,
        total_venta=total_venta,
        total_con_propina=total_con_propina,
        semana_numero=cierre.semana_numero,
        total_gastos=total_gastos, saldo_final_esperado=saldo_final_esperado,
        efectivo_fisico=cierre.efectivo_fisico, diferencia=diferencia, estado=estado, notas=cierre.notas,
    )
    db.add(db_cierre)
    db.flush()
    for gasto in cierre.gastos:
        db.add(models.GastoDiario(cierre_id=db_cierre.id, **gasto.model_dump()))
    for propina in cierre.propinas:
        db.add(models.PropinaDiaria(cierre_id=db_cierre.id, **propina.model_dump()))
    try:
        db.commit()
        db.refresh(db_cierre)
        # Trigger alertas en background
        try:
            from .jobs.alertas_job import alertas_job as _aj2
            _rid2 = (current_user.restaurante_id if current_user and current_user.restaurante_id else None) or db_cierre.restaurante_id or 1
            background_tasks.add_task(_aj2.evaluar_restaurante, db, _rid2)
        except Exception: pass
        return db_cierre
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.get("/api/cierre-turno", response_model=List[schemas.CierreTurnoResponse])
def listar_cierres(mes: Optional[int] = None, anio: Optional[int] = None, limit: int = 30, restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.CierreTurno)
    if mes and anio:
        query = query.filter(extract("month", models.CierreTurno.fecha) == mes, extract("year", models.CierreTurno.fecha) == anio)
    if restaurante_id is not None:
        query = query.filter(models.CierreTurno.restaurante_id == restaurante_id)
    return query.order_by(models.CierreTurno.fecha.desc()).limit(limit).all()


@app.get("/api/cierre-turno/ultimo-saldo/final")
def get_ultimo_saldo(db: Session = Depends(get_db)):
    ultimo = db.query(models.CierreTurno).order_by(models.CierreTurno.fecha.desc()).first()
    if not ultimo:
        return {"saldo": 0.0, "fecha": None, "mensaje": "No hay cierres previos"}
    saldo = ultimo.efectivo_fisico if ultimo.efectivo_fisico is not None else ultimo.saldo_final_esperado
    return {"saldo": saldo, "fecha": ultimo.fecha, "estado": ultimo.estado}


@app.get("/api/cierre-turno/{fecha}", response_model=schemas.CierreTurnoResponse)
def get_cierre_por_fecha(fecha: date, db: Session = Depends(get_db)):
    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.fecha == fecha).first()
    if not cierre:
        raise HTTPException(status_code=404, detail=f"No hay cierre para {fecha}")
    return cierre


@app.patch("/api/cierre-turno/{fecha}/arqueo", response_model=schemas.CierreTurnoResponse)
def registrar_arqueo(fecha: date, arqueo: schemas.CierreArqueoUpdate, db: Session = Depends(get_db)):
    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.fecha == fecha).first()
    if not cierre:
        raise HTTPException(status_code=404, detail=f"No hay cierre para {fecha}")
    cierre.efectivo_fisico = arqueo.efectivo_fisico
    cierre.diferencia = arqueo.efectivo_fisico - cierre.saldo_final_esperado
    if abs(cierre.diferencia) < 0.01:
        cierre.estado = models.EstadoArqueo.CUADRADA
    elif cierre.diferencia > 0:
        cierre.estado = models.EstadoArqueo.SOBRANTE
    else:
        cierre.estado = models.EstadoArqueo.FALTANTE
    try:
        db.commit()
        db.refresh(cierre)
        return cierre
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gastos", response_model=schemas.GastoResponse, status_code=status.HTTP_201_CREATED)
def crear_gasto(gasto: schemas.GastoCreate, db: Session = Depends(get_db)):
    db_gasto = models.Gasto(**gasto.model_dump())
    db.add(db_gasto)
    try:
        db.commit()
        db.refresh(db_gasto)
        return db_gasto
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gastos", response_model=List[schemas.GastoResponse])
def listar_gastos(fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None, categoria: Optional[str] = None, restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Gasto)
    if fecha_inicio:
        query = query.filter(models.Gasto.fecha >= fecha_inicio)
    if fecha_fin:
        query = query.filter(models.Gasto.fecha <= fecha_fin)
    if categoria:
        query = query.filter(models.Gasto.categoria == categoria)
    if restaurante_id is not None:
        query = query.filter(models.Gasto.restaurante_id == restaurante_id)
    return query.order_by(models.Gasto.fecha.desc()).all()




@app.put("/api/gastos/{gasto_id}")
def editar_gasto(gasto_id: int, gasto: schemas.GastoCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    for key, value in gasto.dict().items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing

@app.delete("/api/gastos/{gasto_id}")
def eliminar_gasto(gasto_id: int, db: Session = Depends(get_db)):
    existing = db.query(models.Gasto).filter(models.Gasto.id == gasto_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(existing)
    db.commit()
    return {"mensaje": "Gasto eliminado"}

@app.put("/api/proveedores/{prov_id}")
def editar_proveedor(prov_id: int, prov: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Proveedor).filter(models.Proveedor.id == prov_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for key, value in prov.dict().items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing

@app.delete("/api/proveedores/{prov_id}")
def eliminar_proveedor(prov_id: int, db: Session = Depends(get_db)):
    existing = db.query(models.Proveedor).filter(models.Proveedor.id == prov_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    db.delete(existing)
    db.commit()
    return {"mensaje": "Proveedor eliminado"}

@app.delete("/api/cierre-turno/{cierre_id}")
def eliminar_cierre(cierre_id: int, db: Session = Depends(get_db)):
    existing = db.query(models.CierreTurno).filter(models.CierreTurno.id == cierre_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Cierre no encontrado")
    db.query(models.GastoDiario).filter(models.GastoDiario.cierre_id == cierre_id).delete()
    db.query(models.PropinaDiaria).filter(models.PropinaDiaria.cierre_id == cierre_id).delete()
    db.delete(existing)
    db.commit()
    return {"mensaje": "Cierre eliminado"}


@app.post("/api/gastos/parse-factura")
async def parse_factura(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")
    contents = await file.read()
    from backend_python.factura_parser import parse_factura_pdf
    result = parse_factura_pdf(contents)
    return result

@app.post("/api/gastos/ocr")
async def ocr_gasto(file: UploadFile = File(...)):
    contents = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    
    if ext == ".pdf":
        # Intentar con pdfplumber
        try:
            import pdfplumber, io, re as _re
            pdf = pdfplumber.open(io.BytesIO(contents))
            full_text = ""
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    full_text += t + "\n"
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if row:
                            full_text += " ".join([str(c) for c in row if c]) + "\n"
            pdf.close()
            
            if len(full_text.strip()) < 20:
                raise HTTPException(status_code=422, detail="El PDF no contiene texto extraible. Sube un PDF con texto, no una imagen escaneada.")
            
            # Detectar proveedor
            PROV_MAP = {
                "BUENA TIERRA": {"nombre": "LA BUENA TIERRA", "categoria": "VEGETALES_FRUTAS"},
                "CESAR HUMBERTO CARRANZA": {"nombre": "LA BUENA TIERRA", "categoria": "VEGETALES_FRUTAS"},
                "COMERCIAL TOYO": {"nombre": "TOYO", "categoria": "PRODUCTOS_ASIATICOS"},
                "TOYO": {"nombre": "TOYO", "categoria": "PRODUCTOS_ASIATICOS"},
                "EL NAVEGANTE": {"nombre": "EL NAVEGANTE", "categoria": "PROTEINA"},
                "MARIA ISABEL HERNANDEZ": {"nombre": "EL NAVEGANTE", "categoria": "PROTEINA"},
                "VACA NEGRA": {"nombre": "VACA NEGRA", "categoria": "PROTEINA"},
                "ALIMENTOS Y CARNES": {"nombre": "VACA NEGRA", "categoria": "PROTEINA"},
                "KUME": {"nombre": "KUME", "categoria": "PRODUCTOS_ASIATICOS"},
                "KUME IMPORTACIONES": {"nombre": "KUME", "categoria": "PRODUCTOS_ASIATICOS"},
                "FREKO": {"nombre": "FREKO", "categoria": "ABARROTES"},
                "WALMART": {"nombre": "WALMART", "categoria": "ABARROTES"},
                "SAMS": {"nombre": "SAMS", "categoria": "ABARROTES"},
                "COSTCO": {"nombre": "COSTCO", "categoria": "ABARROTES"},
                "AMAZON": {"nombre": "AMAZON", "categoria": "DESECHABLES_EMPAQUES"},
                "MERCADO LIBRE": {"nombre": "MERCADO LIBRE", "categoria": "EQUIPO"},
                "FEMSA": {"nombre": "FEMSA", "categoria": "BEBIDAS"},
            }
            
            text_upper = full_text.upper()
            proveedor = None
            categoria = "OTROS"
            for key, info in PROV_MAP.items():
                if key.upper() in text_upper:
                    proveedor = info["nombre"]
                    categoria = info["categoria"]
                    break
            
            # Extraer total
            total = None
            for pattern in [r"TOTAL[:\s]*\$?\s*([\d,]+\.\d{2})", r"Total[:\s]*\$?\s*([\d,]+\.\d{2})", r"TOTAL\s+\$([\d,]+\.\d{2})"]:
                m = _re.search(pattern, full_text)
                if m:
                    total = float(m.group(1).replace(",", ""))
                    break
            
            # Extraer fecha
            fecha = None
            for pattern in [r"(\d{4}-\d{2}-\d{2})", r"(\d{1,2}/\d{1,2}/\d{4})", r"Fecha[:\s]*(\d{4}-\d{2}-\d{2})"]:
                m = _re.search(pattern, full_text)
                if m:
                    d = m.group(1)
                    if "-" in d and len(d) == 10:
                        fecha = d
                    elif "/" in d:
                        parts = d.split("/")
                        if len(parts) == 3 and len(parts[2]) == 4:
                            fecha = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                    break
            
            # Extraer descripcion de conceptos
            lines = [l.strip() for l in full_text.split("\n") if len(l.strip()) > 5]
            keywords = ["SALMON","CARNE","NEW YORK","ATUN","CAMARON","SAKE","MIRIN","NARANJA","AGUACATE","LIMON","PEPINO","NORI","SESAME","ZANAHORIA","CEBOLL"]
            desc_items = [l for l in lines if any(kw in l.upper() for kw in keywords)]
            descripcion = "; ".join(desc_items[:3]) if desc_items else None
            
            # Extraer items individuales de la tabla
            items = []
            for line in full_text.split("\n"):
                # Buscar patron: cantidad + unidad + descripcion + precio + importe
                import re as _re2
                m = _re2.match(r"^\s*(\d+(?:\.\d+)?)\s+(?:KGM|KG|H87|PZA|Pieza|L)\s+(.+?)\s+(\d[\d,]*\.\d{2})\s*$", line.strip())
                if m:
                    cant = m.group(1)
                    desc = m.group(2).strip()
                    # Quitar ClaveProdServ
                    desc = _re.sub(r"ClaveProdServ\s*-\s*\d+", "", desc).strip()
                    importe = float(m.group(3).replace(",",""))
                    if importe > 0 and len(desc) > 2:
                        items.append({"descripcion": desc, "monto": importe, "categoria": categoria})
            
            # Si no encontramos items con regex, intentar con tablas de pdfplumber
            if not items:
                try:
                    pdf2 = pdfplumber.open(io.BytesIO(contents))
                    for page in pdf2.pages:
                        tables = page.extract_tables()
                        for table in tables:
                            for row in table:
                                if row and len(row) >= 4:
                                    try:
                                        last_val = str(row[-1] or "").replace(",","").replace("$","").strip()
                                        importe = float(last_val)
                                        desc_parts = [str(c) for c in row[1:-1] if c and not str(c).replace(".","").replace(",","").isdigit()]
                                        desc = " ".join(desc_parts).strip()
                                        desc = _re.sub(r"ClaveProdServ\s*-\s*\d+", "", desc).strip()
                                        if importe > 0 and len(desc) > 2 and importe < (total or 999999):
                                            items.append({"descripcion": desc, "monto": importe, "categoria": categoria})
                                    except:
                                        pass
                    pdf2.close()
                except:
                    pass
            
            return {
                "fecha": fecha,
                "proveedor": proveedor,
                "categoria": categoria,
                "total": total,
                "descripcion": descripcion,
                "confianza": 0.8 if proveedor else 0.3,
                "items": items,
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Error procesando PDF: {str(e)}")
    else:
        raise HTTPException(status_code=422, detail="Solo se aceptan archivos PDF por ahora.")

@app.get("/api/pl/{mes}/{anio}")
def calcular_pl(mes: int, anio: int, db: Session = Depends(get_db)):
    # Ventas desde CierreTurno
    cierres = db.query(models.CierreTurno).filter(
        extract("month", models.CierreTurno.fecha) == mes,
        extract("year", models.CierreTurno.fecha) == anio
    ).all()
    ventas_totales = sum((c.total_venta or 0) for c in cierres)
    total_propinas = sum(((c.total_con_propina or 0) - (c.total_venta or 0)) for c in cierres)

    # Gastos desde tabla Gasto (gastos independientes)
    def sumar_gasto(cat_str):
        try:
            return db.query(func.sum(models.Gasto.monto)).filter(
                extract("month", models.Gasto.fecha) == mes,
                extract("year", models.Gasto.fecha) == anio,
                models.Gasto.categoria == cat_str
            ).scalar() or 0.0
        except Exception:
            return 0.0

    # Materia Prima
    mp_cats = ["PROTEINA", "VEGETALES_FRUTAS", "ABARROTES", "BEBIDAS", "PRODUCTOS_ASIATICOS"]
    costo_mp = sum(sumar_gasto(c) for c in mp_cats)

    # Gastos Operativos
    op_cats = ["DESECHABLES_EMPAQUES", "LIMPIEZA_MANTTO", "UTENSILIOS", "PERSONAL", "SERVICIOS", "EQUIPO", "MARKETING", "PAPELERIA"]
    gastos_operativos = sum(sumar_gasto(c) for c in op_cats)

    # Gastos Fijos
    gastos_renta = sumar_gasto("RENTA")
    gastos_luz = sumar_gasto("LUZ")
    gastos_software = sumar_gasto("SOFTWARE")
    gastos_fijos = gastos_renta + gastos_luz + gastos_software

    # Nomina
    gastos_nomina = sumar_gasto("NOMINA")

    # Comisiones
    comisiones_bancarias = sumar_gasto("COMISIONES_BANCARIAS")
    comisiones_plataformas = sumar_gasto("COMISIONES_PLATAFORMAS")

    # Impuestos
    impuestos = sumar_gasto("IMPUESTOS")

    # Propinas pagadas
    propinas = sumar_gasto("PROPINAS")

    # Otros
    otros = sumar_gasto("OTROS")

    # Calculos
    utilidad_bruta = ventas_totales - costo_mp
    total_gastos = gastos_operativos + gastos_fijos + gastos_nomina + comisiones_bancarias + comisiones_plataformas + propinas + otros
    utilidad_operativa = utilidad_bruta - total_gastos
    utilidad_neta = utilidad_operativa - impuestos

    # Desglose por categoria
    desglose = {}
    for cat in ["PROTEINA", "VEGETALES_FRUTAS", "ABARROTES", "BEBIDAS", "PRODUCTOS_ASIATICOS",
                "DESECHABLES_EMPAQUES", "LIMPIEZA_MANTTO", "UTENSILIOS", "PERSONAL", "PROPINAS",
                "SERVICIOS", "EQUIPO", "MARKETING", "PAPELERIA", "RENTA", "LUZ", "SOFTWARE",
                "COMISIONES_BANCARIAS", "IMPUESTOS", "NOMINA", "COMISIONES_PLATAFORMAS", "OTROS"]:
        v = sumar_gasto(cat)
        if v > 0:
            desglose[cat] = v

    _CAT_PL_MAP = {
        "PROTEINA": "costo_alimentos", "VEGETALES_FRUTAS": "costo_alimentos",
        "ABARROTES": "costo_alimentos", "PRODUCTOS_ASIATICOS": "costo_alimentos",
        "BEBIDAS": "costo_bebidas",
        "NOMINA": "nomina", "PERSONAL": "nomina",
        "DESECHABLES_EMPAQUES": "limpieza", "LIMPIEZA_MANTTO": "limpieza",
        "UTENSILIOS": "mantenimiento", "EQUIPO": "mantenimiento",
        "SERVICIOS": "servicios", "LUZ": "servicios",
        "RENTA": "renta", "MARKETING": "marketing",
        "PAPELERIA": "otros_gastos", "SOFTWARE": "otros_gastos",
        "COMISIONES_BANCARIAS": "otros_gastos", "COMISIONES_PLATAFORMAS": "otros_gastos",
        "PROPINAS": "otros_gastos", "OTROS": "otros_gastos",
        "IMPUESTOS": "impuestos",
    }
    gastos_por_categoria = sorted(
        [
            {
                "categoria": cat,
                "categoria_pl": _CAT_PL_MAP.get(cat, "otros_gastos"),
                "monto": round(monto, 2),
                "pct_ventas": round(monto / ventas_totales * 100, 1) if ventas_totales > 0 else 0,
            }
            for cat, monto in desglose.items()
        ],
        key=lambda x: -x["monto"],
    )

    return {
        "mes": mes, "anio": anio,
        "ventas_totales": ventas_totales,
        "total_propinas": total_propinas,
        "costo_materia_prima": costo_mp,
        "pct_materia_prima": (costo_mp / ventas_totales * 100) if ventas_totales > 0 else 0,
        "utilidad_bruta": utilidad_bruta,
        "gastos_operativos": gastos_operativos,
        "gastos_fijos": gastos_fijos,
        "gastos_nomina": gastos_nomina,
        "comisiones": comisiones_bancarias + comisiones_plataformas,
        "propinas_pagadas": propinas,
        "otros": otros,
        "impuestos": impuestos,
        "utilidad_operativa": utilidad_operativa,
        "utilidad_neta": utilidad_neta,
        "pct_utilidad_neta": (utilidad_neta / ventas_totales * 100) if ventas_totales > 0 else 0,
        "dias_registrados": len(cierres),
        "desglose_categorias": desglose,
        "gastos_por_categoria": gastos_por_categoria,
    }

@app.get("/api/distribucion/{mes}/{anio}", response_model=schemas.DistribucionResumen)
def calcular_distribucion(mes: int, anio: int, db: Session = Depends(get_db)):
    pl = db.query(models.PLMensual).filter(models.PLMensual.mes == mes, models.PLMensual.anio == anio).first()
    if not pl:
        calcular_pl(mes, anio, db)
        pl = db.query(models.PLMensual).filter(models.PLMensual.mes == mes, models.PLMensual.anio == anio).first()
    if not pl:
        raise HTTPException(status_code=404, detail="No se pudo calcular el P&L")
    uc = db.query(models.CierreTurno).filter(extract("month", models.CierreTurno.fecha) == mes, extract("year", models.CierreTurno.fecha) == anio).order_by(models.CierreTurno.fecha.desc()).first()
    sc = None
    if uc:
        sc = uc.efectivo_fisico if uc.efectivo_fisico is not None else uc.saldo_final_esperado
    um = db.query(models.MovimientoBanco).filter(extract("month", models.MovimientoBanco.fecha) == mes, extract("year", models.MovimientoBanco.fecha) == anio).order_by(models.MovimientoBanco.fecha.desc()).first()
    sb = um.saldo if um else None
    td = (sb + sc) if (sb is not None and sc is not None) else None
    distribuciones = []
    for s in models.SOCIOS_CONFIG:
        m = pl.utilidad_neta * (s["porcentaje"] / 100)
        dist = db.query(models.DistribucionUtilidad).filter(models.DistribucionUtilidad.pl_id == pl.id, models.DistribucionUtilidad.socio_nombre == s["nombre"]).first()
        if dist:
            dist.monto_calculado = m
        else:
            dist = models.DistribucionUtilidad(pl_id=pl.id, socio_nombre=s["nombre"], porcentaje=s["porcentaje"], monto_calculado=m)
            db.add(dist)
        distribuciones.append(schemas.DistribucionResponse(socio_nombre=s["nombre"], porcentaje=s["porcentaje"], monto_calculado=m, monto_pagado=dist.monto_pagado if dist.id else 0.0, estado=dist.estado if dist.id else models.EstadoPago.PENDIENTE, fecha_pago=dist.fecha_pago if dist.id else None))
    db.commit()
    return schemas.DistribucionResumen(mes=mes, anio=anio, utilidad_neta=pl.utilidad_neta, saldo_banco=sb, saldo_caja=sc, total_disponible=td, distribuciones=distribuciones)


@app.get("/api/dashboard/resumen", response_model=schemas.DashboardResumen)
def get_dashboard(db: Session = Depends(get_db)):
    hoy = date.today()
    vh = db.query(func.sum(models.VentaDiaria.total_venta)).filter(models.VentaDiaria.fecha == hoy).scalar() or 0.0
    ayer = hoy - timedelta(days=1)
    va = db.query(func.sum(models.VentaDiaria.total_venta)).filter(models.VentaDiaria.fecha == ayer).scalar() or 0.0
    ca = ((vh - va) / va * 100) if va > 0 else None
    is_ = hoy - timedelta(days=hoy.weekday())
    vs = db.query(func.sum(models.VentaDiaria.total_venta)).filter(models.VentaDiaria.fecha >= is_, models.VentaDiaria.fecha <= hoy).scalar() or 0.0
    vm = db.query(func.sum(models.VentaDiaria.total_venta)).filter(extract("month", models.VentaDiaria.fecha) == hoy.month, extract("year", models.VentaDiaria.fecha) == hoy.year).scalar() or 0.0
    gp = db.query(func.count(models.CuentaPorPagar.id)).filter(models.CuentaPorPagar.estado_pago == models.EstadoPago.PENDIENTE).scalar() or 0
    uc = db.query(models.CierreTurno).order_by(models.CierreTurno.fecha.desc()).first()
    ec = None
    ua = None
    if uc:
        if uc.estado:
            ec = uc.estado.value
            if uc.estado != models.EstadoArqueo.CUADRADA and uc.diferencia:
                ec += f" ({'+' if uc.diferencia > 0 else ''}{uc.diferencia:.2f})"
        ua = str(uc.fecha)
    return schemas.DashboardResumen(ventas_hoy=vh, ventas_semana=vs, ventas_mes=vm, cambio_vs_ayer=ca, gastos_pendientes=gp, estado_caja=ec, ultimo_arqueo=ua)


@app.get("/api/reportes/ventas-por-canal")
def ventas_por_canal(mes: Optional[int] = None, anio: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(func.sum(models.VentaDiaria.efectivo).label("efectivo"), func.sum(models.VentaDiaria.pay).label("pay"), func.sum(models.VentaDiaria.terminales).label("terminales"), func.sum(models.VentaDiaria.uber_eats).label("uber_eats"), func.sum(models.VentaDiaria.rappi).label("rappi"))
    if mes and anio:
        q = q.filter(extract("month", models.VentaDiaria.fecha) == mes, extract("year", models.VentaDiaria.fecha) == anio)
    r = q.first()
    return {"canales": [{"nombre": "Efectivo", "monto": r.efectivo or 0}, {"nombre": "Pay", "monto": r.pay or 0}, {"nombre": "Terminales", "monto": r.terminales or 0}, {"nombre": "Uber Eats", "monto": r.uber_eats or 0}, {"nombre": "Rappi", "monto": r.rappi or 0}]}


@app.get("/api/reportes/ventas-diarias")
def ventas_diarias_reporte(mes: Optional[int] = None, anio: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.VentaDiaria.fecha, models.VentaDiaria.total_venta)
    if mes and anio:
        q = q.filter(extract("month", models.VentaDiaria.fecha) == mes, extract("year", models.VentaDiaria.fecha) == anio)
    return [{"fecha": str(r.fecha), "total": r.total_venta} for r in q.order_by(models.VentaDiaria.fecha).all()]


@app.post("/api/banco/upload")
def upload_estado_cuenta(file: UploadFile = File(...), db: Session = Depends(get_db)):
    import tempfile, os
    registros = 0
    filename = file.filename or ""
    raw = file.file.read()
    
    # Detectar si es PDF o CSV
    if filename.lower().endswith(".pdf") or raw[:5] == b"%PDF-":
        # Parser PDF Santander
        import re as re_mod
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            with pdfplumber.open(tmp_path) as pdf:
                for page in pdf.pages:
                    table = page.extract_table()
                    if not table:
                        continue
                    for row in table:
                        if not row or len(row) < 8:
                            continue
                        # Limpiar saltos de linea en todas las celdas
                        row = [(c or "").replace("\n", "").replace("\r", "").strip() for c in row]
                        # Col 0=Cuenta, 1=Fecha, 2=Hora, 3=Sucursal, 4=Desc, 5=Cargo, 6=Abono, 7=Saldo, 8=Ref, 9=Concepto, 10=DescLarga
                        fecha_raw = row[1].replace(" ", "").replace("\n", "")
                        # Saltar header
                        if not fecha_raw or "echa" in fecha_raw.lower():
                            continue
                        # Fecha viene como DDMMYYYY (8 digitos) ej: 03022026
                        digits = re_mod.sub(r"[^0-9]", "", fecha_raw)
                        if len(digits) < 8:
                            continue
                        try:
                            dia = int(digits[:2])
                            mes_num = int(digits[2:4])
                            anio_num = int(digits[4:8])
                            if anio_num < 2000 or anio_num > 2099 or mes_num < 1 or mes_num > 12 or dia < 1 or dia > 31:
                                continue
                            from datetime import date as date_cls
                            fecha = date_cls(anio_num, mes_num, dia)
                        except (ValueError, IndexError):
                            continue
                        hora = row[2] if len(row) > 2 else ""
                        descripcion = row[4] if len(row) > 4 else ""
                        cargo = parse_money(row[5]) if len(row) > 5 else 0.0
                        abono = parse_money(row[6]) if len(row) > 6 else 0.0
                        saldo_val = parse_money(row[7]) if len(row) > 7 else None
                        referencia = row[8] if len(row) > 8 else None
                        concepto = row[9] if len(row) > 9 else descripcion
                        desc_larga = row[10] if len(row) > 10 else None
                        if cargo > 0:
                            monto, tipo = cargo, models.TipoMovimientoBanco.CARGO
                        elif abono > 0:
                            monto, tipo = abono, models.TipoMovimientoBanco.ABONO
                        else:
                            continue
                        mov = models.MovimientoBanco(
                            fecha=fecha, referencia=referencia, concepto=concepto,
                            monto=monto, tipo=tipo, saldo=saldo_val
                        )
                        db.add(mov)
                        registros += 1
            os.unlink(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error procesando PDF: {str(e)}")
    else:
        # Parser CSV original
        try:
            text = raw.decode("utf-8", errors="replace")
            reader = csv.reader(io.StringIO(text))
            rows = list(reader)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error: {str(e)}")
        for row in rows:
            if len(row) < 4:
                continue
            try:
                fecha = None
                for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
                    try:
                        fecha = datetime.strptime(row[0].strip(), fmt).date()
                        break
                    except ValueError:
                        continue
                if not fecha:
                    continue
                ref = row[1].strip() if len(row) > 1 else None
                con = row[2].strip() if len(row) > 2 else ""
                cargo_val = parse_money(row[3]) if len(row) > 3 else 0.0
                abono_val = parse_money(row[4]) if len(row) > 4 else 0.0
                saldo_val = parse_money(row[5]) if len(row) > 5 else None
                if cargo_val > 0:
                    monto, tipo = cargo_val, models.TipoMovimientoBanco.CARGO
                elif abono_val > 0:
                    monto, tipo = abono_val, models.TipoMovimientoBanco.ABONO
                else:
                    continue
                db.add(models.MovimientoBanco(fecha=str(fecha), referencia=ref, concepto=con, monto=monto, tipo=tipo, saldo=saldo_val))
                registros += 1
            except (ValueError, IndexError):
                continue
    db.commit()
    return {"mensaje": f"Se importaron {registros} movimientos", "importados": registros}


@app.get("/api/banco/movimientos", response_model=List[schemas.MovimientoBancoResponse])
def listar_movimientos_banco(mes: Optional[int] = None, anio: Optional[int] = None, solo_sin_reconciliar: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.MovimientoBanco)
    if mes and anio:
        q = q.filter(extract("month", models.MovimientoBanco.fecha) == mes, extract("year", models.MovimientoBanco.fecha) == anio)
    if solo_sin_reconciliar:
        q = q.filter(models.MovimientoBanco.reconciliado == False)
    return q.order_by(models.MovimientoBanco.fecha.desc()).all()


@app.post("/api/proveedores", response_model=schemas.ProveedorResponse, status_code=201)
def crear_proveedor(prov: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    db_prov = models.Proveedor(**prov.model_dump())
    db.add(db_prov)
    db.commit()
    db.refresh(db_prov)
    return db_prov

@app.get("/api/proveedores", response_model=List[schemas.ProveedorResponse])
def listar_proveedores(restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Proveedor).filter(models.Proveedor.activo == True)
    if restaurante_id is not None:
        query = query.filter(models.Proveedor.restaurante_id == restaurante_id)
    return query.all()

@app.post("/api/empleados", response_model=schemas.EmpleadoResponse, status_code=201)
def crear_empleado(emp: schemas.EmpleadoCreate, db: Session = Depends(get_db)):
    try:
        db_emp = models.Empleado(**emp.model_dump())
        db.add(db_emp)
        db.commit()
        db.refresh(db_emp)
        return db_emp
    except Exception as e:
        db.rollback()
        print(f"ERROR creando empleado: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/empleados", response_model=List[schemas.EmpleadoResponse])
def listar_empleados(restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Empleado).filter(models.Empleado.activo == True).options(selectinload(models.Empleado.documentos))
    if restaurante_id is not None:
        query = query.filter(models.Empleado.restaurante_id == restaurante_id)
    return query.all()

@app.post("/api/nomina", response_model=schemas.NominaPagoResponse, status_code=201)
def registrar_pago_nomina(pago: schemas.NominaPagoCreate, db: Session = Depends(get_db)):
    db_pago = models.NominaPago(**pago.model_dump())
    db.add(db_pago)
    db.commit()
    db.refresh(db_pago)
    return db_pago

@app.get("/api/nomina")
def listar_nomina(restaurante_id: Optional[int] = None, meses: int = 3, db: Session = Depends(get_db)):
    from datetime import date as _dt, timedelta as _td
    cutoff = _dt.today() - _td(days=meses * 31)
    q = db.query(models.NominaPago).filter(models.NominaPago.fecha_pago >= cutoff)
    if restaurante_id is not None:
        q = q.filter(models.NominaPago.restaurante_id == restaurante_id)
    pagos = q.order_by(models.NominaPago.fecha_pago.desc()).all()
    result = []
    for p in pagos:
        emp = db.query(models.Empleado).filter(models.Empleado.id == p.empleado_id).first()
        result.append({
            "id": p.id,
            "empleado_id": p.empleado_id,
            "empleado_nombre": emp.nombre if emp else None,
            "empleado_puesto": emp.puesto if emp else None,
            "periodo_inicio": str(p.periodo_inicio),
            "periodo_fin": str(p.periodo_fin),
            "salario_base": p.salario_base,
            "horas_extra": p.horas_extra,
            "deducciones": p.deducciones,
            "neto_pagado": p.neto_pagado,
            "fecha_pago": str(p.fecha_pago),
            "restaurante_id": p.restaurante_id,
        })
    return result

@app.post("/api/nomina/semana", status_code=201)
def registrar_nomina_semana(data: schemas.NominaSemanaCreate, db: Session = Depends(get_db)):
    creados = []
    for item in data.items:
        pago = models.NominaPago(
            empleado_id=item.empleado_id,
            periodo_inicio=data.periodo_inicio,
            periodo_fin=data.periodo_fin,
            salario_base=item.salario_base_semanal,
            horas_extra=item.propinas,
            deducciones=item.deducciones,
            neto_pagado=item.neto_pagado,
            fecha_pago=data.fecha_pago,
            restaurante_id=data.restaurante_id,
        )
        db.add(pago)
        creados.append(pago)
    db.commit()
    total = sum(i.neto_pagado for i in data.items)
    return {"ok": True, "registros": len(creados), "total_nomina": round(total, 2)}

@app.post("/api/insumos", response_model=schemas.InsumoResponse, status_code=201)
def crear_insumo(insumo: schemas.InsumoCreate, db: Session = Depends(get_db)):
    db_insumo = models.Insumo(**insumo.model_dump())
    db.add(db_insumo)
    db.commit()
    db.refresh(db_insumo)
    return db_insumo

@app.get("/api/insumos", response_model=List[schemas.InsumoResponse])
def listar_insumos(db: Session = Depends(get_db)):
    return db.query(models.Insumo).filter(models.Insumo.activo == True).all()

@app.get("/api/insumos/alertas")
def alertas_stock(db: Session = Depends(get_db)):
    alertas = db.query(models.Insumo).filter(models.Insumo.activo == True, models.Insumo.stock_actual < models.Insumo.stock_minimo).all()
    return [{"id": i.id, "nombre": i.nombre, "stock_actual": i.stock_actual, "stock_minimo": i.stock_minimo, "deficit": i.stock_minimo - i.stock_actual} for i in alertas]




@app.delete("/api/empleados/{emp_id}")
def eliminar_empleado(emp_id: int, db: Session = Depends(get_db)):
    existing = db.query(models.Empleado).filter(models.Empleado.id == emp_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    db.delete(existing)
    db.commit()
    return {"mensaje": "Empleado eliminado"}

@app.put("/api/empleados/{emp_id}")
def editar_empleado(emp_id: int, emp: schemas.EmpleadoCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Empleado).filter(models.Empleado.id == emp_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    for key, value in emp.model_dump().items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing

@app.post("/api/empleados/{emp_id}/documentos", response_model=schemas.DocumentoEmpleadoResponse, status_code=201)
async def subir_documento(emp_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    import base64 as _b64
    emp = db.query(models.Empleado).filter(models.Empleado.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máximo 10MB)")
    ext = os.path.splitext(file.filename or "")[1].lower()
    tipo = "PDF" if ext == ".pdf" else "Imagen" if ext in [".jpg", ".jpeg", ".png"] else "Documento"
    b64_content = _b64.b64encode(content).decode("utf-8")
    doc = models.DocumentoEmpleado(
        empleado_id=emp_id,
        nombre=file.filename or "archivo",
        tipo=tipo,
        ruta=f"base64:{file.filename}",
        contenido_base64=b64_content,
        restaurante_id=emp.restaurante_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

@app.get("/api/empleados/{emp_id}/documentos", response_model=List[schemas.DocumentoEmpleadoResponse])
def listar_documentos_empleado(emp_id: int, db: Session = Depends(get_db)):
    return db.query(models.DocumentoEmpleado).filter(models.DocumentoEmpleado.empleado_id == emp_id).all()

@app.get("/api/empleados/documentos/{doc_id}/archivo")
def descargar_documento(doc_id: int, db: Session = Depends(get_db)):
    import base64 as _b64
    from fastapi.responses import Response as _Resp
    doc = db.query(models.DocumentoEmpleado).filter(models.DocumentoEmpleado.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    # Base64 storage (new path)
    if doc.contenido_base64:
        content = _b64.b64decode(doc.contenido_base64)
        ext = os.path.splitext(doc.nombre)[1].lower()
        media_type = "application/pdf" if ext == ".pdf" else "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png" if ext == ".png" else "application/octet-stream"
        return _Resp(content=content, media_type=media_type, headers={"Content-Disposition": f'inline; filename="{doc.nombre}"'})
    # Legacy filesystem path
    if doc.ruta and not doc.ruta.startswith("base64:") and os.path.exists(doc.ruta):
        return FileResponse(doc.ruta, filename=doc.nombre)
    raise HTTPException(status_code=404, detail="Archivo no encontrado")

@app.delete("/api/empleados/documentos/{doc_id}")
def eliminar_documento(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.DocumentoEmpleado).filter(models.DocumentoEmpleado.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    try:
        if os.path.exists(doc.ruta):
            os.remove(doc.ruta)
    except Exception:
        pass
    db.delete(doc)
    db.commit()
    return {"ok": True}


@app.get("/api/dashboard/ventas-mes")
def ventas_mes_desde_cierres(mes: int = None, anio: int = None, db: Session = Depends(get_db)):
    from datetime import date as dt
    if not mes:
        mes = dt.today().month
    if not anio:
        anio = dt.today().year
    cierres = db.query(models.CierreTurno).filter(
        extract("month", models.CierreTurno.fecha) == mes,
        extract("year", models.CierreTurno.fecha) == anio
    ).all()
    total_venta = sum((c.total_venta or 0) for c in cierres)
    total_propinas = sum((c.total_con_propina or 0) - (c.total_venta or 0) for c in cierres)
    total_efectivo = sum((c.ventas_efectivo or 0) for c in cierres)
    total_parrot = sum((c.ventas_parrot or 0) for c in cierres)
    total_terminales = sum((c.ventas_terminales or 0) for c in cierres)
    total_uber = sum((c.ventas_uber or 0) for c in cierres)
    total_rappi = sum((c.ventas_rappi or 0) for c in cierres)
    total_cortesias = sum((c.cortesias or 0) for c in cierres)
    total_otros = sum((c.otros_ingresos or 0) for c in cierres)
    dias = [{"fecha": str(c.fecha), "total_venta": c.total_venta or 0, "total_con_propina": c.total_con_propina or 0} for c in cierres]
    return {
        "mes": mes, "anio": anio, "dias_registrados": len(cierres),
        "total_venta": total_venta, "total_propinas": total_propinas,
        "total_con_propina": total_venta + total_propinas,
        "por_canal": {
            "efectivo": total_efectivo, "parrot": total_parrot, "terminales": total_terminales,
            "uber": total_uber, "rappi": total_rappi, "cortesias": total_cortesias, "otros": total_otros
        },
        "dias": dias
    }


@app.put("/api/cierre-turno/{cierre_id}/propinas")
async def actualizar_propinas(cierre_id: int, request: Request, db: Session = Depends(get_db)):
    cierre = db.query(models.CierreTurno).filter(models.CierreTurno.id == cierre_id).first()
    if not cierre:
        raise HTTPException(status_code=404, detail="Cierre no encontrado")
    body = await request.json()
    cierre.propinas_efectivo = body.get("propinas_efectivo", 0)
    cierre.propinas_parrot = body.get("propinas_parrot", 0)
    cierre.propinas_terminales = body.get("propinas_terminales", 0)
    total_propinas = cierre.propinas_efectivo + cierre.propinas_parrot + cierre.propinas_terminales
    cierre.total_con_propina = (cierre.total_venta or 0) + total_propinas
    db.commit()
    return {"mensaje": "Propinas actualizadas", "total_propinas": total_propinas}


@app.post("/api/gastos/importar-bitacora")
async def importar_bitacora(file: UploadFile = File(...)):
    import pdfplumber, io, re as _re
    contents = await file.read()
    
    try:
        pdf = pdfplumber.open(io.BytesIO(contents))
        full_text = ""
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                full_text += t + "\n"
        pdf.close()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error leyendo PDF: {str(e)}")
    
    if len(full_text.strip()) < 20:
        raise HTTPException(status_code=422, detail="El PDF no contiene texto extraible")
    
    # Extraer fecha
    fecha = None
    fecha_match = _re.search(r"FECHA[:\s]*(?:LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO)?\s*(\d{1,2})\s*(?:DE\s*)?([A-Z]+)\s*(\d{)", full_text.upper())
    if fecha_match:
        dia = fecha_match.group(1).zfill(2)
        mes_txt = fecha_match.group(2)
        anio = fecha_match.group(3)
        meses = {"ENERO":"01","FEBRERO":"02","MARZO":"03","ABRIL":"04","MAYO":"05","JUNIO":"06","JULIO":"07","AGOSTO":"08","SEPTIEMBRE":"09","OCTUBRE":"10","NOVIEMBRE":"11","DICIEMBRE":"12"}
        mes = meses.get(mes_txt, "01")
        fecha = f"{anio}-{mes}-{dia}"
    
    # Extraer responsable
    resp_match = _re.search(r"RESPONSABLE[:\s]*(.+?)\n", full_text)
    responsable = resp_match.group(1).strip() if resp_match else "Sin responsable"
    
    # Mapeo de categorias de la bitacora a nuestras categorias
    CAT_MAP = {
        "COMIDA PERSONAL": "PERSONAL",
        "ABARROTES": "ABARROTES",
        "DESECHABLES": "DESECHABLES_EMPAQUES",
        "ESTACIONAMIENTO": "SERVICIOS",
        "PROTEINA": "PROTEINA",
        "VEGETALES": "VEGETALES_FRUTAS",
        "BEBIDAS": "BEBIDAS",
        "LIMPIEZA": "LIMPIEZA_MANTTO",
        "UTENSILIOS": "UTENSILIOS",
        "EQUIPO": "EQUIPO",
        "MARKETING": "MARKETING",
        "PRODUCTOS ASIATICOS": "PRODUCTOS_ASIATICOS",
        "PERSONAL": "PERSONAL",
        "SERVICIOS": "SERVICIOS",
        "RENTA": "RENTA",
        "LUZ": "LUZ",
        "SOFTWARE": "SOFTWARE",
    }
    
    def map_categoria(cat_text):
        cat_upper = cat_text.upper().strip()
        for key, val in CAT_MAP.items():
            if key in cat_upper:
                return val
        return "OTROS"
    
    # Mapeo comprobantes
    COMP_MAP = {
        "VALE": "VALE",
        "TICKET": "TICKET",
        "FACTURA": "FACTURA",
        "CAPTURA": "SIN_COMPROBANTE",
        "RECIBO": "RECIBO",
        "TRANSFERENCIA": "TRANSFERENCIA",
        "NOTA": "NOTA_REMISION",
    }
    
    def map_comprobante(comp_text):
        comp_upper = comp_text.upper().strip()
        for key, val in COMP_MAP.items():
            if key in comp_upper:
                return val
        return "SIN_COMPROBANTE"
    
    # Parsear lineas de gastos
    lines = full_text.split("\n")
    gastos_parsed = []
    
    for line in lines:
        # Buscar lineas con monto al final ($X,XXX o $XXX.XX)
        monto_match = _re.search(r"\$([\d,]+(?:\.\d{1,2})?)\s*$", line.strip())
        if not monto_match:
            continue
        
        monto_str = monto_match.group(1).replace(",", "")
        try:
            monto = float(monto_str)
        except:
            continue
        
        if monto <= 0:
            continue
        
        # Texto antes del monto
        text_before = line[:monto_match.start()].strip()
        
        # Intentar extraer proveedor (primera palabra/frase antes de MP/NMP)
        parts = _re.split(r"\s+(MP|NMP)\s+", text_before)
        proveedor = parts[0].strip() if parts else text_before[:30]
        
        # Buscar categoria en el texto
        categoria = "OTROS"
        for key in CAT_MAP:
            if key in text_before.upper():
                categoria = CAT_MAP[key]
                break
        
        # Buscar comprobante
        comprobante = "SIN_COMPROBANTE"
        for key in COMP_MAP:
            if key in text_before.upper():
                comprobante = COMP_MAP[key]
                break
        
        # Descripcion: lo que queda despues de proveedor/clase/categoria/comprobante
        descripcion = text_before
        
        # Ignorar lineas de TOTAL, SALDO, etc
        if any(kw in proveedor.upper() for kw in ["TOTAL", "SALDO", "VENTAS", "DIFERENCIA", "EFECTIVO FISICO", "GASTOS DEL", "ESPERADO", "CIERRE", "CONTADO", "FALTANTE", "SOBRANTE", "ELABORA"]):
            continue
        
        gastos_parsed.append({
            "fecha": fecha or str(date.today()),
            "proveedor": proveedor[:50],
            "categoria": categoria,
            "monto": monto,
            "metodo_pago": "EFECTIVO",
            "comprobante": comprobante,
            "descripcion": descripcion[:200],
        })
    
    # Extraer datos del cierre si existen
    cierre_data = None
    saldo_match = _re.search(r"Saldo Inicial[:\s]*\$?([\d,]+(?:\.\d{2})?)", full_text)
    ventas_match = _re.search(r"Ventas en Efectivo[:\s]*\$?([\d,]+(?:\.\d{2})?)", full_text)
    
    if saldo_match:
        cierre_data = {
            "saldo_inicial": float(saldo_match.group(1).replace(",", "")),
            "ventas_efectivo": float(ventas_match.group(1).replace(",", "")) if ventas_match else 0,
        }
    
    # Filtrar gastos con proveedor vacio o monto muy alto otales)
    gastos_parsed = [g for g in gastos_parsed if g["proveedor"].strip() and g["monto"] < 50000]
    
    return {
        "fecha": fecha,
        "responsable": responsable,
        "gastos": gastos_parsed,
        "total_gastos": sum(g["monto"] for g in gastos_parsed),
        "cierre": cierre_data,
        "gastos_count": len(gastos_parsed),
    }

@app.get("/api/categorias", response_model=List[schemas.CategoriaResponse])
def get_categorias(solo_activas: bool = True, restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Categoria)
    if solo_activas:
        q = q.filter(models.Categoria.activo == True)
    if restaurante_id is not None:
        q = q.filter(models.Categoria.restaurante_id == restaurante_id)
    return q.order_by(models.Categoria.nombre).all()


@app.post("/api/categorias", response_model=schemas.CategoriaResponse, status_code=status.HTTP_201_CREATED)
def create_categoria(data: schemas.CategoriaCreate, db: Session = Depends(get_db)):
    nombre = data.nombre.strip().upper()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")
    existing = db.query(models.Categoria).filter(func.upper(models.Categoria.nombre) == nombre).first()
    if existing:
        raise HTTPException(status_code=400, detail="La categoria ya existe")
    cat = models.Categoria(nombre=nombre)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@app.put("/api/categorias/{cat_id}", response_model=schemas.CategoriaResponse)
def update_categoria(cat_id: int, data: schemas.CategoriaCreate, db: Session = Depends(get_db)):
    cat = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria no encontrada")
    cat.nombre = data.nombre.strip().upper()
    db.commit()
    db.refresh(cat)
    return cat


@app.patch("/api/categorias/{cat_id}/toggle", response_model=schemas.CategoriaResponse)
def toggle_categoria(cat_id: int, db: Session = Depends(get_db)):
    cat = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria no encontrada")
    cat.activo = not cat.activo
    db.commit()
    db.refresh(cat)
    return cat


@app.delete("/api/categorias/{cat_id}")
def delete_categoria(cat_id: int, db: Session = Depends(get_db)):
    cat = db.query(models.Categoria).filter(models.Categoria.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria no encontrada")
    db.delete(cat)
    db.commit()
    return {"ok": True}


PAGOS_FIJOS_SEED = [
    {"concepto": "Renta", "proveedor": "PABELLON BOSQUES", "categoria": "RENTA", "frecuencia": "MENSUAL", "deadline_texto": "Día 1-10", "dia_limite": 10, "monto_estimado": 0},
    {"concepto": "Internet + Teléfono", "proveedor": "TELMEX", "categoria": "SERVICIOS", "frecuencia": "MENSUAL", "deadline_texto": "Día 1-24", "dia_limite": 24, "monto_estimado": 0},
    {"concepto": "Mantto/Serv. local", "proveedor": "PABELLON BOSQUES", "categoria": "SERVICIOS", "frecuencia": "MENSUAL", "deadline_texto": "Día 1-15", "dia_limite": 15, "monto_estimado": 0},
    {"concepto": "ISR / IVA / SAT", "proveedor": "SAT", "categoria": "IMPUESTOS", "frecuencia": "MENSUAL", "deadline_texto": "Día 17", "dia_limite": 17, "monto_estimado": 0},
    {"concepto": "Impuestos varios", "proveedor": "OTRO", "categoria": "IMPUESTOS", "frecuencia": "MENSUAL", "deadline_texto": "Día 11-17", "dia_limite": 17, "monto_estimado": 0},
    {"concepto": "IVA Rappi", "proveedor": "RAPPI", "categoria": "IMPUESTOS", "frecuencia": "MENSUAL", "deadline_texto": "Cierre mes", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "TPV Parrot", "proveedor": "PARROT", "categoria": "COMISIONES_BANCARIAS", "frecuencia": "MENSUAL", "deadline_texto": "Día 11", "dia_limite": 11, "monto_estimado": 0},
    {"concepto": "TPV Clip", "proveedor": "CLIP", "categoria": "COMISIONES_BANCARIAS", "frecuencia": "MENSUAL", "deadline_texto": "Día 16-28", "dia_limite": 28, "monto_estimado": 0},
    {"concepto": "TPV Getnet", "proveedor": "GETNET", "categoria": "COMISIONES_BANCARIAS", "frecuencia": "MENSUAL", "deadline_texto": "Día 1-17", "dia_limite": 17, "monto_estimado": 0},
    {"concepto": "Comisiones banco", "proveedor": "SANTANDER", "categoria": "COMISIONES_BANCARIAS", "frecuencia": "MENSUAL", "deadline_texto": "Último día", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Comisión retiro efectivo (4%)", "proveedor": "TPN", "categoria": "COMISIONES_BANCARIAS", "frecuencia": "MENSUAL", "deadline_texto": "Cierre mes", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Comisión Uber Eats", "proveedor": "UBER", "categoria": "COMISIONES_PLATAFORMAS", "frecuencia": "SEMANAL", "deadline_texto": "Cierre mes", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Comisión Rappi", "proveedor": "RAPPI", "categoria": "COMISIONES_PLATAFORMAS", "frecuencia": "SEMANAL", "deadline_texto": "Cierre mes", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Diseño / fotos / redes", "proveedor": "PABLO PAREDES", "categoria": "MARKETING", "frecuencia": "MENSUAL", "deadline_texto": "Variable", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Mktg plataformas", "proveedor": "RAPPI / UBER", "categoria": "MARKETING", "frecuencia": "MENSUAL", "deadline_texto": "Cierre mes", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "TIKTOK", "proveedor": "PAU", "categoria": "MARKETING", "frecuencia": "SEMANAL", "deadline_texto": "Variable", "dia_limite": None, "monto_estimado": 0},
    {"concepto": "Comidas personal", "proveedor": "INTERNO", "categoria": "PERSONAL", "frecuencia": "DIARIO", "deadline_texto": "Continuo", "dia_limite": None, "monto_estimado": 400},
    {"concepto": "Nómina / pagos staff", "proveedor": "INTERNO", "categoria": "NOMINA", "frecuencia": "QUINCENAL", "deadline_texto": "Día 8 y 24", "dia_limite": 24, "monto_estimado": 0},
]


@app.get("/api/pagos-recurrentes", response_model=List[schemas.PagoRecurrenteResponse])
def get_pagos_recurrentes(filtro: Optional[str] = None, restaurante_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.activo == True)
    if restaurante_id is not None:
        q = q.filter(models.PagoRecurrente.restaurante_id == restaurante_id)
    if filtro == "urgentes":
        dia = date.today().day
        q = q.filter(models.PagoRecurrente.dia_limite != None, models.PagoRecurrente.dia_limite >= dia, models.PagoRecurrente.dia_limite <= dia + 3)
    elif filtro == "proximos":
        dia = date.today().day
        q = q.filter(models.PagoRecurrente.dia_limite != None, models.PagoRecurrente.dia_limite >= dia, models.PagoRecurrente.dia_limite <= dia + 7)
    return q.order_by(models.PagoRecurrente.id).all()


@app.post("/api/pagos-recurrentes", response_model=schemas.PagoRecurrenteResponse, status_code=status.HTTP_201_CREATED)
def create_pago_recurrente(data: schemas.PagoRecurrenteCreate, db: Session = Depends(get_db)):
    pago = models.PagoRecurrente(**data.model_dump())
    db.add(pago)
    db.commit()
    db.refresh(pago)
    return pago


@app.put("/api/pagos-recurrentes/{pago_id}", response_model=schemas.PagoRecurrenteResponse)
def update_pago_recurrente(pago_id: int, data: schemas.PagoRecurrenteUpdate, db: Session = Depends(get_db)):
    pago = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pago, field, value)
    db.commit()
    db.refresh(pago)
    return pago


@app.delete("/api/pagos-recurrentes/{pago_id}")
def delete_pago_recurrente(pago_id: int, db: Session = Depends(get_db)):
    pago = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()
    return {"ok": True}


@app.post("/api/pagos-recurrentes/seed", status_code=status.HTTP_201_CREATED)
def seed_pagos_recurrentes(db: Session = Depends(get_db)):
    count = db.query(func.count(models.PagoRecurrente.id)).scalar()
    if count > 0:
        return {"message": f"Ya existen {count} pagos, seed omitido"}
    for item in PAGOS_FIJOS_SEED:
        pago = models.PagoRecurrente(**item)
        db.add(pago)
    db.commit()
    return {"message": f"{len(PAGOS_FIJOS_SEED)} pagos creados"}


_MESES_CORTOS = {1:"ene",2:"feb",3:"mar",4:"abr",5:"may",6:"jun",
                 7:"jul",8:"ago",9:"sep",10:"oct",11:"nov",12:"dic"}


@app.get("/api/pagos/flujo-caja/{restaurante_id}")
def get_flujo_caja(restaurante_id: int, dias: int = 30, db: Session = Depends(get_db)):
    import calendar as _cal
    hoy = date.today()
    hace_n = hoy - timedelta(days=dias)

    # ── Ventas promedio diario ───────────────────────────────────────────
    cierres = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.CierreTurno.fecha >= hace_n,
        models.CierreTurno.fecha <= hoy,
    ).all()

    if len(cierres) < 7:
        return {
            "datos_insuficientes": True,
            "mensaje": "Se necesitan al menos 7 días de cierres para proyectar el flujo de caja",
            "cierres_disponibles": len(cierres),
        }

    ventas_totales = sum(float(c.total_venta or 0) for c in cierres)
    ventas_promedio_diario = ventas_totales / len(cierres)

    # ── Pagos comprometidos ──────────────────────────────────────────────
    pagos_db = db.query(models.PagoRecurrente).filter(
        models.PagoRecurrente.restaurante_id == restaurante_id,
        models.PagoRecurrente.activo == True,
        models.PagoRecurrente.monto_estimado > 0,
        models.PagoRecurrente.dia_limite != None,
    ).all()

    pagos_comprometidos = []
    for pago in pagos_db:
        dia = pago.dia_limite
        mes_actual = hoy.month
        anio_actual = hoy.year

        # Ya pagado este mes
        if pago.pagado_mes == mes_actual and pago.pagado_anio == anio_actual:
            continue

        # Calcular próxima fecha de vencimiento dentro de los próximos `dias` días
        try:
            fecha_venc = hoy.replace(day=dia)
        except ValueError:
            last_day = _cal.monthrange(anio_actual, mes_actual)[1]
            fecha_venc = hoy.replace(day=min(dia, last_day))

        if fecha_venc < hoy:
            # Pasó este mes → calcular para el mes siguiente
            if mes_actual == 12:
                next_mes, next_anio = 1, anio_actual + 1
            else:
                next_mes, next_anio = mes_actual + 1, anio_actual
            last_day_next = _cal.monthrange(next_anio, next_mes)[1]
            try:
                fecha_venc = date(next_anio, next_mes, min(dia, last_day_next))
            except ValueError:
                continue

        dias_para_vencer = (fecha_venc - hoy).days
        if 0 <= dias_para_vencer <= dias:
            pagos_comprometidos.append({
                "concepto": pago.concepto,
                "proveedor": pago.proveedor,
                "monto": round(pago.monto_estimado, 2),
                "fecha_vencimiento": str(fecha_venc),
                "dias_para_vencer": dias_para_vencer,
                "estado": "pendiente",
            })

    total_comprometido = sum(p["monto"] for p in pagos_comprometidos)
    ingresos_proyectados = round(ventas_promedio_diario * dias, 2)

    # ── Semanas ──────────────────────────────────────────────────────────
    semanas = []
    for i in range(4):
        sem_inicio = hoy + timedelta(weeks=i)
        sem_fin = sem_inicio + timedelta(days=6)
        ingr_sem = round(ventas_promedio_diario * 7, 2)

        pagos_sem = [
            p for p in pagos_comprometidos
            if sem_inicio <= date.fromisoformat(p["fecha_vencimiento"]) <= sem_fin
        ]
        egr_sem = round(sum(p["monto"] for p in pagos_sem), 2)
        balance = round(ingr_sem - egr_sem, 2)

        ratio = egr_sem / ingr_sem if ingr_sem > 0 else 0
        if ratio >= 0.9:
            semaforo = "rojo"
        elif ratio >= 0.6:
            semaforo = "amarillo"
        else:
            semaforo = "verde"

        label_ini = f"{sem_inicio.day} {_MESES_CORTOS[sem_inicio.month]}"
        label_fin = f"{sem_fin.day} {_MESES_CORTOS[sem_fin.month]}"
        semanas.append({
            "semana": f"{label_ini} - {label_fin}",
            "inicio": str(sem_inicio),
            "fin": str(sem_fin),
            "ingresos_estimados": ingr_sem,
            "egresos_comprometidos": egr_sem,
            "balance": balance,
            "semaforo": semaforo,
            "pagos": pagos_sem,
        })

    alertas_flujo = [s for s in semanas if s["semaforo"] != "verde"]
    semaforo_general = "verde"
    for s in semanas:
        if s["semaforo"] == "rojo":
            semaforo_general = "rojo"
            break
        if s["semaforo"] == "amarillo":
            semaforo_general = "amarillo"

    return {
        "datos_insuficientes": False,
        "periodo_dias": dias,
        "ventas_promedio_diario": round(ventas_promedio_diario, 2),
        "ingresos_proyectados_30d": ingresos_proyectados,
        "pagos_comprometidos": pagos_comprometidos,
        "total_comprometido_30d": round(total_comprometido, 2),
        "semanas": semanas,
        "alertas_flujo": alertas_flujo,
        "resumen": {
            "semaforo_general": semaforo_general,
            "semanas_en_riesgo": len(alertas_flujo),
            "superavit_estimado_30d": round(ingresos_proyectados - total_comprometido, 2),
        },
    }


@app.post("/api/pagos-recurrentes/{pago_id}/marcar-pagado")
def marcar_pago_pagado(pago_id: int, db: Session = Depends(get_db)):
    pago = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    hoy = date.today()
    pago.pagado_mes = hoy.month
    pago.pagado_anio = hoy.year
    db.commit()
    db.refresh(pago)
    return {"ok": True, "pagado_mes": pago.pagado_mes, "pagado_anio": pago.pagado_anio}


@app.post("/api/pagos-recurrentes/{pago_id}/desmarcar-pagado")
def desmarcar_pago_pagado(pago_id: int, db: Session = Depends(get_db)):
    pago = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    pago.pagado_mes = None
    pago.pagado_anio = None
    db.commit()
    return {"ok": True}


@app.get("/api/catalogo-cuentas/{restaurante_id}")
def listar_catalogo_cuentas(restaurante_id: int, db: Session = Depends(get_db)):
    cuentas = db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.activo == True,
    ).order_by(models.CatalogoCuenta.orden).all()
    return [{"id": c.id, "codigo": c.codigo, "nombre": c.nombre, "tipo": c.tipo, "categoria_pl": c.categoria_pl} for c in cuentas]


@app.get("/api/fiscal/{restaurante_id}/posicion-mes")
def posicion_fiscal_mes(
    restaurante_id: int,
    mes: Optional[int] = None,
    anio: Optional[int] = None,
    db: Session = Depends(get_db),
):
    from calendar import monthrange
    from .services.pl_service import pl_service as _pl
    hoy = date.today()
    if not mes:
        mes = hoy.month
    if not anio:
        anio = hoy.year

    _MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto",
              "Septiembre","Octubre","Noviembre","Diciembre"]

    # P&L del mes
    pl = _pl.calcular_pl_mes(db, restaurante_id, mes, anio)

    # IVA causado = ventas_netas * 0.16
    iva_causado = round(pl.ventas_netas * 0.16, 2)

    # IVA acreditable: gastos con catalogo iva_acreditable=True
    cc_iva_ids = [c.id for c in db.query(models.CatalogoCuenta).filter(
        models.CatalogoCuenta.restaurante_id == restaurante_id,
        models.CatalogoCuenta.iva_acreditable == True,
        models.CatalogoCuenta.activo == True,
    ).all()]

    monto_iva_base = 0.0
    cierres_ids = [c.id for c in db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        extract("month", models.CierreTurno.fecha) == mes,
        extract("year", models.CierreTurno.fecha) == anio,
    ).all()]

    if cc_iva_ids:
        monto_iva_base += db.query(func.sum(models.Gasto.monto)).filter(
            models.Gasto.restaurante_id == restaurante_id,
            models.Gasto.catalogo_cuenta_id.in_(cc_iva_ids),
            extract("month", models.Gasto.fecha) == mes,
            extract("year", models.Gasto.fecha) == anio,
        ).scalar() or 0.0
        if cierres_ids:
            monto_iva_base += db.query(func.sum(models.GastoDiario.monto)).filter(
                models.GastoDiario.cierre_id.in_(cierres_ids),
                models.GastoDiario.catalogo_cuenta_id.in_(cc_iva_ids),
            ).scalar() or 0.0

    iva_acreditable = round(monto_iva_base * 0.16, 2)
    iva_por_pagar = round(max(0.0, iva_causado - iva_acreditable), 2)

    # ISR: usar ebitda como utilidad fiscal (antes de impuestos estimados)
    utilidad_fiscal = round(max(0.0, pl.ebitda), 2)
    isr_estimado = round(utilidad_fiscal * 0.30, 2)

    # Gastos deducibles (con factura) vs no deducibles
    total_gastos_g = db.query(func.sum(models.Gasto.monto)).filter(
        models.Gasto.restaurante_id == restaurante_id,
        extract("month", models.Gasto.fecha) == mes,
        extract("year", models.Gasto.fecha) == anio,
    ).scalar() or 0.0

    sin_factura_g = db.query(func.sum(models.Gasto.monto)).filter(
        models.Gasto.restaurante_id == restaurante_id,
        models.Gasto.comprobante == "SIN_COMPROBANTE",
        extract("month", models.Gasto.fecha) == mes,
        extract("year", models.Gasto.fecha) == anio,
    ).scalar() or 0.0

    total_gastos_gd = 0.0
    sin_factura_gd = 0.0
    if cierres_ids:
        total_gastos_gd = db.query(func.sum(models.GastoDiario.monto)).filter(
            models.GastoDiario.cierre_id.in_(cierres_ids),
        ).scalar() or 0.0
        sin_factura_gd = db.query(func.sum(models.GastoDiario.monto)).filter(
            models.GastoDiario.cierre_id.in_(cierres_ids),
            models.GastoDiario.comprobante == "SIN_COMPROBANTE",
        ).scalar() or 0.0

    total_gastos = round(total_gastos_g + total_gastos_gd, 2)
    sin_factura = round(sin_factura_g + sin_factura_gd, 2)
    con_factura = round(max(0.0, total_gastos - sin_factura), 2)
    pct_ded = round((con_factura / max(total_gastos, 1)) * 100, 1)

    # Obligaciones — deadline: día 17 del mes siguiente
    mes_sig = mes % 12 + 1
    anio_sig = anio + 1 if mes == 12 else anio
    fecha_limite = date(anio_sig, mes_sig, 17)
    dias_para_vencer = (fecha_limite - hoy).days

    def _sem(dias: int) -> str:
        if dias > 10: return "verde"
        if dias >= 5: return "amarillo"
        return "rojo"

    obligaciones = []
    for tipo, monto_est in [
        ("IVA mensual", iva_por_pagar),
        ("ISR provisional", isr_estimado),
        ("DIOT", 0.0),
    ]:
        decl = db.query(models.DeclaracionFiscal).filter(
            models.DeclaracionFiscal.restaurante_id == restaurante_id,
            models.DeclaracionFiscal.mes == mes,
            models.DeclaracionFiscal.anio == anio,
            models.DeclaracionFiscal.tipo == tipo,
        ).first()
        estado = "declarado" if decl else "pendiente"
        obligaciones.append({
            "tipo": tipo,
            "descripcion": f"{'Declaración y pago de ' if tipo != 'DIOT' else ''}{tipo} {_MESES[mes]} {anio}",
            "fecha_limite": str(fecha_limite),
            "dias_para_vencer": dias_para_vencer,
            "monto_estimado": monto_est,
            "estado": estado,
            "semaforo": "verde" if estado == "declarado" else _sem(dias_para_vencer),
            "fecha_declarada": str(decl.fecha_declarada) if decl else None,
            "declarada_por": decl.declarada_por if decl else None,
        })

    # Historial (últimas 6 declaraciones de este restaurante)
    historial_raw = db.query(models.DeclaracionFiscal).filter(
        models.DeclaracionFiscal.restaurante_id == restaurante_id,
    ).order_by(models.DeclaracionFiscal.created_at.desc()).limit(12).all()
    historial = [{
        "id": d.id, "mes": d.mes, "anio": d.anio, "tipo": d.tipo,
        "monto": d.monto, "fecha_declarada": str(d.fecha_declarada) if d.fecha_declarada else None,
        "declarada_por": d.declarada_por,
        "nombre_mes": _MESES[d.mes] if 1 <= d.mes <= 12 else str(d.mes),
    } for d in historial_raw]

    # Semáforo general
    pending_sems = [o["semaforo"] for o in obligaciones if o["estado"] == "pendiente"]
    if "rojo" in pending_sems:
        sem_general = "rojo"
    elif "amarillo" in pending_sems:
        sem_general = "amarillo"
    else:
        sem_general = "verde"

    if sem_general == "verde":
        msg = f"Fiscalmente al día — próximas obligaciones el 17 de {_MESES[mes_sig].lower()}"
    elif sem_general == "amarillo":
        msg = "Tienes obligaciones que vencen esta semana"
    else:
        msg = "Hay obligaciones vencidas — contacta a PMG inmediatamente"

    sin_datos = pl.dias_con_datos == 0

    return {
        "periodo": {"mes": mes, "anio": anio, "nombre": f"{_MESES[mes]} {anio}"},
        "sin_datos": sin_datos,
        "iva": {
            "causado": iva_causado,
            "acreditable": iva_acreditable,
            "por_pagar": iva_por_pagar,
            "tasa": 16.0,
        },
        "isr": {
            "utilidad_fiscal": utilidad_fiscal,
            "isr_estimado": isr_estimado,
            "pagos_provisionales": 0.0,
            "isr_pendiente": isr_estimado,
        },
        "obligaciones": obligaciones,
        "gastos_deducibles": {
            "total": con_factura,
            "sin_factura": sin_factura,
            "total_gastos": total_gastos,
            "porcentaje_deducible": pct_ded,
        },
        "resumen": {
            "total_impuestos_estimados": round(iva_por_pagar + isr_estimado, 2),
            "semaforo": sem_general,
            "mensaje": msg,
        },
        "historial": historial,
    }

@app.post("/api/fiscal/{restaurante_id}/obligacion/{tipo}/declarar")
def marcar_obligacion_declarada(
    restaurante_id: int,
    tipo: str,
    mes: int = Query(...),
    anio: int = Query(...),
    declarada_por: str = Query(default="usuario"),
    db: Session = Depends(get_db),
):
    existing = db.query(models.DeclaracionFiscal).filter(
        models.DeclaracionFiscal.restaurante_id == restaurante_id,
        models.DeclaracionFiscal.mes == mes,
        models.DeclaracionFiscal.anio == anio,
        models.DeclaracionFiscal.tipo == tipo,
    ).first()
    if existing:
        return {"ok": True, "ya_declarada": True}
    decl = models.DeclaracionFiscal(
        restaurante_id=restaurante_id,
        mes=mes,
        anio=anio,
        tipo=tipo,
        fecha_declarada=date.today(),
        declarada_por=declarada_por,
    )
    db.add(decl)
    db.commit()
    return {"ok": True, "ya_declarada": False}

@app.delete("/api/fiscal/{restaurante_id}/obligacion/{tipo}/declarar")
def desmarcar_obligacion_declarada(
    restaurante_id: int,
    tipo: str,
    mes: int = Query(...),
    anio: int = Query(...),
    db: Session = Depends(get_db),
):
    decl = db.query(models.DeclaracionFiscal).filter(
        models.DeclaracionFiscal.restaurante_id == restaurante_id,
        models.DeclaracionFiscal.mes == mes,
        models.DeclaracionFiscal.anio == anio,
        models.DeclaracionFiscal.tipo == tipo,
    ).first()
    if decl:
        db.delete(decl)
        db.commit()
    return {"ok": True}

# Servir frontend en produccion
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))
