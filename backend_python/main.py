"""
KOI Dashboard - API Principal
"""
from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
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

models.Base.metadata.create_all(bind=engine)

# Migracion: agregar columnas nuevas si no existen
from sqlalchemy import text as _text, inspect as _inspect
try:
    _insp = _inspect(engine)
    existing_cols = [c['name'] for c in _insp.get_columns('empleados')]
    new_cols = {"rfc": "VARCHAR(20)", "curp": "VARCHAR(20)", "numero_imss": "VARCHAR(20)", "cuenta_banco": "VARCHAR(50)"}
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
def crear_cierre_turno(cierre: schemas.CierreTurnoCreate, db: Session = Depends(get_db)):
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
        return db_cierre
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.get("/api/cierre-turno", response_model=List[schemas.CierreTurnoResponse])
def listar_cierres(mes: Optional[int] = None, anio: Optional[int] = None, limit: int = 30, db: Session = Depends(get_db)):
    query = db.query(models.CierreTurno)
    if mes and anio:
        query = query.filter(extract("month", models.CierreTurno.fecha) == mes, extract("year", models.CierreTurno.fecha) == anio)
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
def listar_gastos(fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None, categoria: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Gasto)
    if fecha_inicio:
        query = query.filter(models.Gasto.fecha >= fecha_inicio)
    if fecha_fin:
        query = query.filter(models.Gasto.fecha <= fecha_fin)
    if categoria:
        query = query.filter(models.Gasto.categoria == categoria)
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
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(models.Proveedor).filter(models.Proveedor.activo == True).all()

@app.post("/api/empleados", response_model=schemas.EmpleadoResponse, status_code=201)
def crear_empleado(emp: schemas.EmpleadoCreate, db: Session = Depends(get_db)):
    db_emp = models.Empleado(**emp.model_dump())
    db.add(db_emp)
    db.commit()
    db.refresh(db_emp)
    return db_emp

@app.get("/api/empleados", response_model=List[schemas.EmpleadoResponse])
def listar_empleados(db: Session = Depends(get_db)):
    return db.query(models.Empleado).filter(models.Empleado.activo == True).all()

@app.post("/api/nomina", response_model=schemas.NominaPagoResponse, status_code=201)
def registrar_pago_nomina(pago: schemas.NominaPagoCreate, db: Session = Depends(get_db)):
    db_pago = models.NominaPago(**pago.model_dump())
    db.add(db_pago)
    db.commit()
    db.refresh(db_pago)
    return db_pago

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
    for key, value in emp.dict().items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


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
def get_categorias(solo_activas: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Categoria)
    if solo_activas:
        q = q.filter(models.Categoria.activo == True)
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
def get_pagos_recurrentes(filtro: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.PagoRecurrente).filter(models.PagoRecurrente.activo == True)
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
