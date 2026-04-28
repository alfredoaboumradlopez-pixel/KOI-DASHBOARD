"""
Proyección de Flujo de Caja — KOI Dashboard
GET  /api/flujo-caja/{restaurante_id}/config
PUT  /api/flujo-caja/{restaurante_id}/config
GET  /api/flujo-caja/{restaurante_id}/proyeccion?mes=4&anio=2026
"""
from calendar import monthrange
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/flujo-caja", tags=["flujo-caja"])

MESES_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigFlujoSchema(BaseModel):
    saldo_banco_inicial: float = 0.0
    nomina_semanal_estimada: float = 20000.0
    dia_corte_impuestos: int = 17
    porcentaje_iva: float = 16.0
    porcentaje_isr: float = 30.0
    retiro_utilidades_pct: float = 0.0
    semana_retiro: int = 4
    notas: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_config(db: Session, restaurante_id: int) -> models.ConfigFlujoCaja:
    cfg = db.query(models.ConfigFlujoCaja).filter(
        models.ConfigFlujoCaja.restaurante_id == restaurante_id
    ).first()
    if not cfg:
        cfg = models.ConfigFlujoCaja(restaurante_id=restaurante_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _cfg_to_dict(cfg: models.ConfigFlujoCaja) -> dict:
    return {
        "saldo_banco_inicial": cfg.saldo_banco_inicial or 0.0,
        "nomina_semanal_estimada": cfg.nomina_semanal_estimada or 20000.0,
        "dia_corte_impuestos": cfg.dia_corte_impuestos or 17,
        "porcentaje_iva": cfg.porcentaje_iva or 16.0,
        "porcentaje_isr": cfg.porcentaje_isr or 30.0,
        "retiro_utilidades_pct": cfg.retiro_utilidades_pct or 0.0,
        "semana_retiro": cfg.semana_retiro or 4,
        "notas": cfg.notas,
        "updated_at": str(cfg.updated_at) if cfg.updated_at else None,
    }


def _semaforo(saldo: float, ingreso_semana: float) -> str:
    if saldo < 0:
        return "rojo"
    if ingreso_semana > 0 and saldo < ingreso_semana * 0.20:
        return "amarillo"
    return "verde"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{restaurante_id}/config")
def get_config(restaurante_id: int, db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, restaurante_id)
    return {"restaurante_id": restaurante_id, **_cfg_to_dict(cfg)}


@router.put("/{restaurante_id}/config")
def update_config(restaurante_id: int, body: ConfigFlujoSchema, db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, restaurante_id)
    cfg.saldo_banco_inicial = body.saldo_banco_inicial
    cfg.nomina_semanal_estimada = body.nomina_semanal_estimada
    cfg.dia_corte_impuestos = body.dia_corte_impuestos
    cfg.porcentaje_iva = body.porcentaje_iva
    cfg.porcentaje_isr = body.porcentaje_isr
    cfg.retiro_utilidades_pct = body.retiro_utilidades_pct
    cfg.semana_retiro = body.semana_retiro
    cfg.notas = body.notas
    db.commit()
    return {"ok": True, **_cfg_to_dict(cfg)}


@router.get("/{restaurante_id}/proyeccion")
def get_proyeccion(
    restaurante_id: int,
    mes: int = 0,
    anio: int = 0,
    db: Session = Depends(get_db),
):
    hoy = date.today()
    if not mes:
        mes = hoy.month
    if not anio:
        anio = hoy.year

    cfg = _get_or_create_config(db, restaurante_id)
    _, dias_mes = monthrange(anio, mes)

    # ── Ventas proyectadas: promedio diario últimos 30 días ──────────────────
    hace30 = hoy - timedelta(days=30)
    cierres_rec = db.query(models.CierreTurno).filter(
        models.CierreTurno.restaurante_id == restaurante_id,
        models.CierreTurno.fecha >= hace30,
        models.CierreTurno.fecha <= hoy,
    ).all()

    if cierres_rec:
        ventas_promedio_diario = sum(c.total_venta or 0 for c in cierres_rec) / len(cierres_rec)
    else:
        ventas_promedio_diario = 0.0

    ventas_proyectadas = round(ventas_promedio_diario * dias_mes, 2)
    ingresos_por_semana = ventas_proyectadas / 4

    # ── Impuestos mensuales estimados ────────────────────────────────────────
    # IVA neto ≈ 10% neto sobre ventas (cobrado al cliente menos acreditable)
    # ISR ≈ 30% sobre utilidad estimada (~15% margen)
    iva_mensual = round(ventas_proyectadas * (cfg.porcentaje_iva / 100) * 0.10, 2)
    utilidad_estimada = ventas_proyectadas * 0.15
    isr_mensual = round(utilidad_estimada * (cfg.porcentaje_isr / 100), 2)

    # ── Pagos recurrentes activos ────────────────────────────────────────────
    pagos_rec = db.query(models.PagoRecurrente).filter(
        models.PagoRecurrente.restaurante_id == restaurante_id,
        models.PagoRecurrente.activo == True,
    ).all()

    # ── Construir 4 semanas ──────────────────────────────────────────────────
    semana_rangos = [(1, 7), (8, 14), (15, 21), (22, dias_mes)]
    mes_nombre = MESES_ES[mes]
    semanas = []
    saldo_acumulado = cfg.saldo_banco_inicial or 0.0

    for i, (dia_ini, dia_fin) in enumerate(semana_rangos):
        semana_num = i + 1
        egresos = []

        # Nómina semanal
        egresos.append({
            "concepto": "Nómina semanal",
            "monto": cfg.nomina_semanal_estimada or 20000.0,
            "dia": min(dia_ini + 4, dia_fin),
            "tipo": "nomina",
            "variable": False,
        })

        # Pagos recurrentes con dia_limite en esta semana
        for p in pagos_rec:
            if not p.dia_limite or not p.monto_estimado or p.monto_estimado <= 0:
                continue
            if not (dia_ini <= p.dia_limite <= dia_fin):
                continue
            cat = (p.categoria or "").upper()
            if cat in ("NOMINA", "IMPUESTOS"):
                continue
            egresos.append({
                "concepto": p.concepto,
                "monto": round(p.monto_estimado, 2),
                "dia": p.dia_limite,
                "tipo": (p.categoria or "otro").lower(),
                "variable": False,
            })

        # Impuestos en semana que contiene dia_corte
        dia_corte = cfg.dia_corte_impuestos or 17
        if dia_ini <= dia_corte <= dia_fin:
            if iva_mensual > 0:
                egresos.append({
                    "concepto": "IVA estimado",
                    "monto": iva_mensual,
                    "dia": dia_corte,
                    "tipo": "impuesto",
                    "variable": False,
                })
            if isr_mensual > 0:
                egresos.append({
                    "concepto": "ISR estimado",
                    "monto": isr_mensual,
                    "dia": dia_corte,
                    "tipo": "impuesto",
                    "variable": False,
                })

        # Retiro en semana_retiro
        semana_retiro = cfg.semana_retiro or 4
        if semana_num == semana_retiro:
            pct = cfg.retiro_utilidades_pct or 0.0
            retiro_monto = round(ventas_proyectadas * (pct / 100), 2) if pct > 0 else 0.0
            egresos.append({
                "concepto": "Retiro de utilidades",
                "monto": retiro_monto,
                "dia": dia_fin,
                "tipo": "retiro",
                "variable": pct == 0,
            })

        total_egresos = round(sum(e["monto"] for e in egresos), 2)
        balance = round(ingresos_por_semana - total_egresos, 2)
        saldo_acumulado = round(saldo_acumulado + balance, 2)

        semanas.append({
            "numero": semana_num,
            "dias": f"{dia_ini}–{dia_fin} {mes_nombre}",
            "ingresos_estimados": round(ingresos_por_semana, 2),
            "egresos": egresos,
            "total_egresos": total_egresos,
            "balance_semana": balance,
            "saldo_acumulado": saldo_acumulado,
            "semaforo": _semaforo(saldo_acumulado, ingresos_por_semana),
        })

    # ── Semáforo general ─────────────────────────────────────────────────────
    semaforos = [s["semaforo"] for s in semanas]
    semaforo_general = "rojo" if "rojo" in semaforos else ("amarillo" if "amarillo" in semaforos else "verde")

    # ── Recomendaciones ──────────────────────────────────────────────────────
    recomendaciones = []
    for s in semanas:
        if s["semaforo"] == "rojo":
            deficit = abs(s["balance_semana"])
            recomendaciones.append(
                f"💡 Semana {s['numero']} ({s['dias']}) tiene un déficit de ${deficit:,.0f}. "
                f"Considera adelantar cobros de Uber Eats / Rappi o diferir algún pago no crítico."
            )
        elif s["semaforo"] == "amarillo":
            recomendaciones.append(
                f"💡 Semana {s['numero']} ({s['dias']}) puede estar ajustada. Revisa el timing de los pagos."
            )

    ultima = semanas[-1] if semanas else None
    retiro_disp = ultima["saldo_acumulado"] if ultima else 0
    if retiro_disp > 0 and (cfg.retiro_utilidades_pct or 0) == 0:
        recomendaciones.append(
            f"💰 El retiro de utilidades disponible estimado para la semana {cfg.semana_retiro or 4} "
            f"es de hasta ${retiro_disp:,.0f} sin comprometer el flujo del siguiente mes."
        )

    total_egresos_mes = round(sum(s["total_egresos"] for s in semanas), 2)

    return {
        "config": _cfg_to_dict(cfg),
        "saldo_inicial": cfg.saldo_banco_inicial or 0.0,
        "ventas_proyectadas": ventas_proyectadas,
        "ventas_promedio_diario": round(ventas_promedio_diario, 2),
        "dias_con_datos": len(cierres_rec),
        "mes": mes,
        "anio": anio,
        "semanas": semanas,
        "resumen": {
            "total_ingresos_mes": ventas_proyectadas,
            "total_egresos_mes": total_egresos_mes,
            "retiro_disponible": retiro_disp,
            "saldo_final": ultima["saldo_acumulado"] if ultima else 0,
            "semaforo_general": semaforo_general,
        },
        "recomendaciones": recomendaciones,
        "datos_insuficientes": ventas_promedio_diario == 0,
    }
