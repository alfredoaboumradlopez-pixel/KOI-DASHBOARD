"""
KOI Dashboard - API Principal
"""
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import date, datetime, timedelta
import csv
import io
import os
import re

from . import models, schemas
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="KOI Dashboard API",
    description="API para la gestion administrativa del restaurante KOI",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
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
        raise HTTPException(status_code=400, detail=f"Ya existe un cierre para {cierre.fecha}")
    total_gastos_items = sum(g.monto for g in cierre.gastos)
    total_propinas = sum(p.monto for p in cierre.propinas)
    total_gastos = total_gastos_items + total_propinas
    saldo_final_esperado = cierre.saldo_inicial + cierre.ventas_efectivo - total_gastos
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
def listar_gastos(fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None, categoria: Optional[models.CategoriaGasto] = None, db: Session = Depends(get_db)):
    query = db.query(models.Gasto)
    if fecha_inicio:
        query = query.filter(models.Gasto.fecha >= fecha_inicio)
    if fecha_fin:
        query = query.filter(models.Gasto.fecha <= fecha_fin)
    if categoria:
        query = query.filter(models.Gasto.categoria == categoria)
    return query.order_by(models.Gasto.fecha.desc()).all()


@app.post("/api/gastos/ocr")
async def ocr_gasto(file: UploadFile = File(...)):
    try:
        import google.generativeai as genai
    except ImportError:
        raise HTTPException(status_code=501, detail="google-generativeai no instalado")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY no configurada")
    genai.configure(api_key=api_key)
    contents = await file.read()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    mime_type = mime_map.get(ext, "image/jpeg")
    model = genai.GenerativeModel("gemini-2.0-flash")
    prompt = """Analiza esta imagen de un ticket o factura de un restaurante en Mexico.
Extrae la siguiente informacion y responde SOLO en formato JSON:
{"fecha": "YYYY-MM-DD", "proveedor": "nombre", "categoria": "una de: COMIDA_PERSONAL, PROPINAS, COMPRAS_INSUMOS, SERVICIOS, MANTENIMIENTO, LIMPIEZA, OTROS", "total": 0.00, "descripcion": "breve", "confianza": 0.0}
Si no puedes leer algun campo, dejalo null."""
    try:
        response = model.generate_content([prompt, {"mime_type": mime_type, "data": contents}])
        text = response.text.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        import json
        result = json.loads(text)
        return schemas.OCRResult(**result)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error procesando imagen: {str(e)}")


@app.get("/api/pl/{mes}/{anio}", response_model=schemas.PLMensualResponse)
def calcular_pl(mes: int, anio: int, db: Session = Depends(get_db)):
    ventas = db.query(func.sum(models.VentaDiaria.total_venta)).filter(extract("month", models.VentaDiaria.fecha) == mes, extract("year", models.VentaDiaria.fecha) == anio).scalar() or 0.0
    def sumar_gc(cat):
        return db.query(func.sum(models.GastoDiario.monto)).join(models.CierreTurno).filter(extract("month", models.CierreTurno.fecha) == mes, extract("year", models.CierreTurno.fecha) == anio, models.GastoDiario.categoria == cat).scalar() or 0.0
    def sumar_gg(cat):
        return db.query(func.sum(models.Gasto.monto)).filter(extract("month", models.Gasto.fecha) == mes, extract("year", models.Gasto.fecha) == anio, models.Gasto.categoria == cat).scalar() or 0.0
    def tc(cat):
        return sumar_gc(cat) + sumar_gg(cat)
    ci = tc(models.CategoriaGasto.COMPRAS_INSUMOS)
    gs = tc(models.CategoriaGasto.SERVICIOS)
    gr = tc(models.CategoriaGasto.RENTA)
    gm = tc(models.CategoriaGasto.MANTENIMIENTO)
    gl = tc(models.CategoriaGasto.LIMPIEZA)
    gcp = tc(models.CategoriaGasto.COMIDA_PERSONAL)
    go = tc(models.CategoriaGasto.OTROS)
    gn = db.query(func.sum(models.NominaPago.neto_pagado)).filter(extract("month", models.NominaPago.fecha_pago) == mes, extract("year", models.NominaPago.fecha_pago) == anio).scalar() or 0.0
    imp = tc(models.CategoriaGasto.IMPUESTOS)
    ub = ventas - ci
    uo = ub - (gs + gr + gm + gl + gcp + go)
    un = uo - gn - imp
    pl = db.query(models.PLMensual).filter(models.PLMensual.mes == mes, models.PLMensual.anio == anio).first()
    d = dict(ventas_totales=ventas, costo_insumos=ci, gastos_servicios=gs, gastos_renta=gr, gastos_mantenimiento=gm, gastos_limpieza=gl, gastos_comida_personal=gcp, gastos_otros=go, gastos_nomina=gn, impuestos=imp, utilidad_bruta=ub, utilidad_operativa=uo, utilidad_neta=un)
    if pl:
        for k, v in d.items():
            setattr(pl, k, v)
    else:
        pl = models.PLMensual(mes=mes, anio=anio, **d)
        db.add(pl)
    db.commit()
    db.refresh(pl)
    return pl


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
    try:
        content = file.file.read().decode("utf-8", errors="replace")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")
    registros = 0
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
            cargo = parse_money(row[3]) if len(row) > 3 else 0.0
            abono = parse_money(row[4]) if len(row) > 4 else 0.0
            saldo = parse_money(row[5]) if len(row) > 5 else None
            if cargo > 0:
                monto, tipo = cargo, models.TipoMovimientoBanco.CARGO
            elif abono > 0:
                monto, tipo = abono, models.TipoMovimientoBanco.ABONO
            else:
                continue
            db.add(models.MovimientoBanco(fecha=fecha, referencia=ref, concepto=con, monto=monto, tipo=tipo, saldo=saldo))
            registros += 1
        except (ValueError, IndexError):
            continue
    db.commit()
    return {"mensaje": f"Se importaron {registros} movimientos"}


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
