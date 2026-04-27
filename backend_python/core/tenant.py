"""
Tenant Filter — wraps SQLAlchemy queries to auto-filter by restaurante_id
"""
from sqlalchemy.orm import Session

class TenantFilter:
    def __init__(self, db: Session, restaurante_id: int):
        self.db = db
        self.restaurante_id = restaurante_id

    def query(self, *entities):
        q = self.db.query(*entities)
        model = entities[0] if entities else None
        if model is not None and hasattr(model, 'restaurante_id'):
            q = q.filter(model.restaurante_id == self.restaurante_id)
        return q

def get_tenant_db(restaurante_id: int, db: Session) -> TenantFilter:
    return TenantFilter(db, restaurante_id)
