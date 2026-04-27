"""
Endpoints de autenticación JWT
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from .. import models
from ..core.auth import (
    verify_password, create_access_token, get_current_user,
    blacklist_token, bearer_scheme
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str
    restaurante_id: Optional[int]

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(
        models.Usuario.email == data.email.lower().strip(),
        models.Usuario.activo == True
    ).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail={"detail": "Credenciales inválidas", "code": "INVALID_CREDENTIALS"})
    user.ultimo_acceso = datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        rol=user.rol,
        nombre=user.nombre,
        restaurante_id=user.restaurante_id,
    )

@router.get("/me")
def get_me(current_user: models.Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    restaurante = None
    if current_user.restaurante_id:
        restaurante = db.query(models.Restaurante).filter(models.Restaurante.id == current_user.restaurante_id).first()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "nombre": current_user.nombre,
        "rol": current_user.rol,
        "restaurante_id": current_user.restaurante_id,
        "restaurante": {"nombre": restaurante.nombre, "slug": restaurante.slug} if restaurante else None,
    }

@router.post("/logout")
def logout(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    if credentials:
        blacklist_token(credentials.credentials)
    return {"ok": True}
