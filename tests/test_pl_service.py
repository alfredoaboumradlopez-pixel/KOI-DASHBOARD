"""
Tests del PLService — P&L automático
"""
import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend_python.models import Base, Restaurante, CierreTurno, Gasto, GastoDiario, NominaPago, CatalogoCuenta, Usuario
from backend_python.services.pl_service import PLService, PLResult
from backend_python.core.auth import get_password_hash

SQLALCHEMY_TEST_URL = "sqlite:///./test_pl.db"
engine_test = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

pl_service = PLService()

KOI_ID = None  # Set in fixture


@pytest.fixture(autouse=True, scope="module")
def setup_db():
    global KOI_ID
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()

    # Crear restaurante
    koi = Restaurante(nombre="KOI Test", slug="koi-pl-test", plan="profesional")
    db.add(koi)
    db.flush()
    KOI_ID = koi.id

    # Catálogo de cuentas
    cuentas = [
        CatalogoCuenta(restaurante_id=KOI_ID, codigo="4001", nombre="Ventas efectivo", tipo="INGRESO", categoria_pl="ventas_netas", orden=1),
        CatalogoCuenta(restaurante_id=KOI_ID, codigo="5001", nombre="Costo alimentos", tipo="COSTO_VENTA", categoria_pl="costo_alimentos", iva_acreditable=True, orden=10),
        CatalogoCuenta(restaurante_id=KOI_ID, codigo="6001", nombre="Nomina", tipo="GASTO_NOMINA", categoria_pl="nomina", orden=20),
        CatalogoCuenta(restaurante_id=KOI_ID, codigo="6002", nombre="Renta", tipo="GASTO_OPERATIVO", categoria_pl="renta", orden=21),
    ]
    db.add_all(cuentas)
    db.flush()

    # Cierres de enero 2026
    for dia in range(1, 11):
        c = CierreTurno(
            restaurante_id=KOI_ID,
            fecha=date(2026, 1, dia),
            responsable="Test",
            elaborado_por="Test",
            saldo_inicial=5000,
            ventas_efectivo=3000.0,
            ventas_parrot=2000.0,
            ventas_terminales=1000.0,
            ventas_uber=500.0,
            ventas_rappi=500.0,
            otros_ingresos=0.0,
            total_venta=7000.0,
            total_gastos=0.0,
            saldo_final_esperado=12000.0,
        )
        db.add(c)
    db.flush()

    # Gastos en enero 2026
    g1 = Gasto(restaurante_id=KOI_ID, fecha=date(2026, 1, 5), proveedor="Costco", categoria="costo_alimentos", monto=5000.0, metodo_pago="EFECTIVO")
    g2 = Gasto(restaurante_id=KOI_ID, fecha=date(2026, 1, 10), proveedor="Landlord", categoria="renta", monto=20000.0, metodo_pago="TRANSFERENCIA")
    db.add_all([g1, g2])

    db.commit()
    yield
    Base.metadata.drop_all(bind=engine_test)
    db.close()


def get_db():
    return TestingSessionLocal()


def test_pl_mes_ventas_positivas():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    assert result.ventas_netas > 0
    assert result.dias_con_datos == 10


def test_pl_margen_rango_razonable():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    assert -50 <= result.margen_neto_pct <= 100


def test_pl_food_cost_rango_razonable():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    assert 0 <= result.food_cost_pct <= 100


def test_pl_utilidad_neta_formula():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    assert abs(result.utilidad_neta - (result.ebitda - result.impuestos_estimados)) < 0.01


def test_pl_periodo_sin_datos_retorna_zeros():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 6, 2020)  # Fecha sin datos
    db.close()
    assert result.ventas_netas == 0.0
    assert result.dias_con_datos == 0
    assert result.margen_neto_pct == 0.0


def test_pl_gastos_sin_catalogo_cuentan():
    db = get_db()
    # Agregar un gasto sin catalogo_cuenta_id
    g = Gasto(restaurante_id=KOI_ID, fecha=date(2026, 1, 15), proveedor="Desconocido", categoria="random_sin_mapeo", monto=999.0, metodo_pago="EFECTIVO")
    db.add(g)
    db.commit()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    # El gasto sin categoría va a gastos_otros pero sí se suma
    assert result.gastos_sin_categorizar > 0
    assert result.tiene_datos_incompletos == True
    assert result.gastos_otros >= 999.0


def test_pl_semana():
    db = get_db()
    result = pl_service.calcular_pl_semana(db, KOI_ID, date(2026, 1, 7))  # miércoles semana 1
    db.close()
    assert result.fecha_inicio == date(2026, 1, 5)  # lunes
    assert result.fecha_fin == date(2026, 1, 11)  # domingo
    assert result.ventas_netas > 0


def test_pl_to_dict_floats_redondeados():
    db = get_db()
    result = pl_service.calcular_pl_mes(db, KOI_ID, 1, 2026)
    db.close()
    d = result.to_dict()
    for k, v in d.items():
        if isinstance(v, float):
            assert v == round(v, 2), f"{k}={v} no está redondeado a 2 decimales"
