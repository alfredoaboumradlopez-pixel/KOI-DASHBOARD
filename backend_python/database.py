from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# URL de conexión a PostgreSQL. 
# Reemplaza con tus credenciales reales en tu entorno.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://usuario:password@localhost/elkoi_db")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependencia para obtener la sesión de la base de datos
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
