"""
Tests de multitenancy — aislamiento entre restaurantes
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend_python.models import Base
from backend_python.main import app
from backend_python.database import get_db
from backend_python import models
from backend_python.core.auth import get_password_hash

SQLALCHEMY_TEST_URL = "sqlite:///./test_multitenancy.db"
engine_test = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True, scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()
    # Crear dos restaurantes
    r1 = models.Restaurante(nombre="KOI Test", slug="koi-test", plan="profesional")
    r2 = models.Restaurante(nombre="Otro Test", slug="otro-test", plan="basico")
    db.add_all([r1, r2])
    db.flush()
    # Crear usuarios
    u_koi = models.Usuario(email="koi@test.com", hashed_password=get_password_hash("pass123"), nombre="KOI User", rol="ADMIN", restaurante_id=r1.id)
    u_otro = models.Usuario(email="otro@test.com", hashed_password=get_password_hash("pass456"), nombre="Otro User", rol="ADMIN", restaurante_id=r2.id)
    u_super = models.Usuario(email="super@test.com", hashed_password=get_password_hash("super789"), nombre="Super", rol="SUPER_ADMIN", restaurante_id=None)
    db.add_all([u_koi, u_otro, u_super])
    db.commit()
    yield
    Base.metadata.drop_all(bind=engine_test)
    db.close()

client = TestClient(app)

def get_token(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def test_login_correcto():
    resp = client.post("/api/auth/login", json={"email": "koi@test.com", "password": "pass123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()

def test_login_incorrecto_retorna_401():
    resp = client.post("/api/auth/login", json={"email": "koi@test.com", "password": "wrongpass"})
    assert resp.status_code == 401

def test_request_sin_token_retorna_401_en_endpoint_protegido():
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

def test_get_me_con_token_valido():
    token = get_token("koi@test.com", "pass123")
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "koi@test.com"

def test_super_admin_puede_ver_todos_los_restaurantes():
    token = get_token("super@test.com", "super789")
    resp = client.get("/api/restaurantes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200

def test_no_super_admin_no_puede_acceder_a_restaurantes():
    token = get_token("koi@test.com", "pass123")
    resp = client.get("/api/restaurantes", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

def test_logout_invalida_token():
    token = get_token("koi@test.com", "pass123")
    resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    # Token ya no funciona
    resp2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp2.status_code == 401
