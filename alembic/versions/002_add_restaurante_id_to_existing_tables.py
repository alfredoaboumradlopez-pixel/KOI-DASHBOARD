"""Add restaurante_id to all existing tables (nullable for KOI data preservation)

Revision ID: 002
Revises: 001
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None

TABLAS = [
    'categorias', 'cierres_turno', 'cuentas_por_pagar', 'distribucion_utilidades',
    'documentos_empleado', 'empleados', 'gastos', 'gastos_diarios', 'insumos',
    'movimientos_banco', 'nomina_pagos', 'pagos_recurrentes', 'pl_mensual',
    'propinas_diarias', 'proveedores', 'ventas_diarias',
]


def upgrade() -> None:
    for tabla in TABLAS:
        try:
            op.add_column(tabla, sa.Column(
                'restaurante_id', sa.Integer(),
                sa.ForeignKey('restaurantes.id'),
                nullable=True
            ))
        except Exception:
            pass  # column already exists


def downgrade() -> None:
    for tabla in TABLAS:
        try:
            op.drop_column(tabla, 'restaurante_id')
        except Exception:
            pass
