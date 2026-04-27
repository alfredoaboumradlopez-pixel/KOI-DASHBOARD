"""
Multi-tenant JWT Authentication
"""
import os
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models

SECRET_KEY = os.environ.get("SECRET_KEY", "koi-rbo-dev-secret-change-in-prod-2026")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.environ.get("ACCESS_TOKEN_EXPIRE_HOURS", "8"))

bearer_scheme = HTTPBearer(auto_error=False)
_token_blacklist: set = set()
KOI_DEFAULT_RESTAURANTE_ID = 1

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def blacklist_token(token: str):
    _token_blacklist.add(token)

def _decode_token(token: str) -> Optional[int]:
    if token in _token_blacklist:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except (JWTError, ValueError):
        return None

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.Usuario:
    if not credentials:
        raise HTTPException(status_code=401, detail={"detail": "No autenticado", "code": "NOT_AUTHENTICATED"})
    user_id = _decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail={"detail": "Token inválido", "code": "INVALID_TOKEN"})
    user = db.query(models.Usuario).filter(models.Usuario.id == user_id, models.Usuario.activo == True).first()
    if not user:
        raise HTTPException(status_code=401, detail={"detail": "Usuario no encontrado", "code": "USER_NOT_FOUND"})
    return user

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[models.Usuario]:
    if not credentials:
        return None
    user_id = _decode_token(credentials.credentials)
    if not user_id:
        return None
    return db.query(models.Usuario).filter(models.Usuario.id == user_id, models.Usuario.activo == True).first()

def get_restaurante_id(user: Optional[models.Usuario]) -> int:
    if user is None:
        return KOI_DEFAULT_RESTAURANTE_ID
    return user.restaurante_id or KI_DEFAULT_RESTAURANTE_ID

def require_roles(*roles: str):
    def checker(current_user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
        if current_user.rol not in roles:
            raise HTTPException(status_code=403, detail={"detail": "Sin permisos suficientes", "code": "FORBIDDEN"})
        return current_user
    return checker
