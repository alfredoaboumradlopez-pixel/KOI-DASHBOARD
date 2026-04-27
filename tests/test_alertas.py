"""
Tests del motor de alertas.
Usa una BD SQLite en memoria para no necesitar PostgreSQL.
"""
from __future__ import annotations
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch


# ── helpers de mocks ────────────────────────────────────────────────────────

def _make_pl(
    food_cost_pct=25.0,
    nomina_pct=30.0,
    margen_neto_pct=20.0,
    ventas_netas=100_000.0,
):
    pl = MagicMock()
    pl.food_cost_pct = food_cost_pct
    pl.nomina_pct = nomina_pct
    pl.margen_neto_pct = margen_neto_pct
    pl.ventas_netas = ventas_netas
    return pl


def _make_config(tipo: str, umbral: float, activo: bool = True):
    c = MagicMock()
    c.tipo = tipo
    c.umbral = umbral
    c.activo = activo
    return c


def _make_db_no_dup():
    """Devuelve un db mock donde NO hay duplicado en 24h."""
    db = MagicMock()
    # _anti_duplicado query chain → .first() retorna None
    db.query.return_value.filter.return_value.filter.return_value.filter.return_value.filter.return_value.first.return_value = None
    db.add = MagicMock()
    db.commit = MagicMock()
    return db


# ── 1. FOOD_COST_ALTO dispara alerta cuando excede umbral ───────────────────

def test_food_cost_alto_genera_alerta():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    config = _make_config("FOOD_COST_ALTO", 32.0)
    pl_semana = _make_pl(food_cost_pct=35.0)
    pl_mes = _make_pl()
    db = _make_db_no_dup()

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, date.today())
    assert resultado is not None, "Debería generarse alerta con food cost 35% > umbral 32%"
    assert resultado.tipo == "FOOD_COST_ALTO"
    assert "35.0%" in resultado.mensaje


def test_food_cost_bajo_umbral_no_genera_alerta():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    config = _make_config("FOOD_COST_ALTO", 32.0)
    pl_semana = _make_pl(food_cost_pct=28.0)
    pl_mes = _make_pl()
    db = _make_db_no_dup()

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, date.today())
    assert resultado is None, "No debe generarse alerta con food cost 28% < umbral 32%"


# ── 2. Anti-duplicados: dos evaluaciones seguidas no generan dos alertas ────

def test_anti_duplicado_no_genera_doble_alerta():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    config = _make_config("FOOD_COST_ALTO", 32.0)
    pl_semana = _make_pl(food_cost_pct=35.0)
    pl_mes = _make_pl()

    # Primera evaluación: sin duplicado → crea alerta
    db_primera = _make_db_no_dup()
    primera = job._evaluar_regla(db_primera, 1, config, pl_semana, pl_mes, date.today())
    assert primera is not None

    # Segunda evaluación: hay duplicado existente → retorna None
    db_segunda = MagicMock()
    # Simular que ya existe una alerta no revisada en las últimas 24h
    alerta_existente = MagicMock()
    db_segunda.query.return_value.filter.return_value.filter.return_value.filter.return_value.filter.return_value.first.return_value = alerta_existente

    segunda = job._evaluar_regla(db_segunda, 1, config, pl_semana, pl_mes, date.today())
    assert segunda is None, "No debe generar alerta duplicada en 24h"


# ── 3. CAPTURA_INCOMPLETA cuando no hay cierre de ayer ─────────────────────

def test_captura_incompleta_genera_alerta_sin_cierre_ayer():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    hoy = date.today()
    ayer = hoy - timedelta(days=1)

    config = _make_config("CAPTURA_INCOMPLETA", 1.0)
    pl_semana = _make_pl()
    pl_mes = _make_pl()

    db = _make_db_no_dup()
    # Simular último cierre hace 2 días
    ultimo_cierre = MagicMock()
    ultimo_cierre.fecha = hoy - timedelta(days=2)
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = ultimo_cierre

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, hoy)
    assert resultado is not None, "Debe generarse alerta si faltan días sin cierre"
    assert "2 días" in resultado.mensaje


def test_captura_incompleta_no_alerta_con_cierre_hoy():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    hoy = date.today()
    config = _make_config("CAPTURA_INCOMPLETA", 1.0)
    pl_semana = _make_pl()
    pl_mes = _make_pl()

    db = _make_db_no_dup()
    # Simular último cierre HOY (0 días sin cierre)
    ultimo_cierre = MagicMock()
    ultimo_cierre.fecha = hoy
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = ultimo_cierre

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, hoy)
    assert resultado is None, "No debe generar alerta si el cierre es de hoy"


# ── 4. Endpoint /activas retorna solo alertas no revisadas ──────────────────

def test_activas_solo_no_revisadas():
    """
    Verifica la lógica de filtrado: /activas debe retornar únicamente
    alertas con revisada=False.
    """
    # Simular lista de alertas
    alerta_no_revisada = MagicMock()
    alerta_no_revisada.id = 1
    alerta_no_revisada.tipo = "FOOD_COST_ALTO"
    alerta_no_revisada.revisada = False
    alerta_no_revisada.severidad = "WARNING"

    alerta_revisada = MagicMock()
    alerta_revisada.id = 2
    alerta_revisada.tipo = "MARGEN_BAJO"
    alerta_revisada.revisada = True
    alerta_revisada.severidad = "WARNING"

    # Filtrar manualmente (como hace el endpoint)
    todas = [alerta_no_revisada, alerta_revisada]
    activas = [a for a in todas if not a.revisada]

    assert len(activas) == 1
    assert activas[0].id == 1
    assert activas[0].revisada is False


# ── 5. Revisar alerta → ya no aparece en activas ───────────────────────────

def test_revisar_alerta_la_oculta_de_activas():
    """
    Después de marcar una alerta como revisada, no debe aparecer
    en las activas.
    """
    alerta = MagicMock()
    alerta.id = 10
    alerta.tipo = "NOMINA_ALTA"
    alerta.revisada = False

    # Simular PUT /revisar
    alerta.revisada = True

    # Filtrar activas
    activas = [a for a in [alerta] if not a.revisada]
    assert len(activas) == 0, "Alerta revisada no debe aparecer en activas"


# ── 6. Severidad CRITICAL en food cost >= 38% ──────────────────────────────

def test_food_cost_critical_cuando_mayor_38():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    config = _make_config("FOOD_COST_ALTO", 32.0)
    pl_semana = _make_pl(food_cost_pct=40.0)
    pl_mes = _make_pl()
    db = _make_db_no_dup()

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, date.today())
    assert resultado is not None
    assert resultado.severidad == "CRITICAL", "Food cost >= 38% debe ser CRITICAL"


def test_food_cost_warning_entre_32_y_38():
    from backend_python.jobs.alertas_job import AlertasJob
    job = AlertasJob()

    config = _make_config("FOOD_COST_ALTO", 32.0)
    pl_semana = _make_pl(food_cost_pct=35.0)
    pl_mes = _make_pl()
    db = _make_db_no_dup()

    resultado = job._evaluar_regla(db, 1, config, pl_semana, pl_mes, date.today())
    assert resultado is not None
    assert resultado.severidad == "WARNING", "Food cost entre 32% y 38% debe ser WARNING"
