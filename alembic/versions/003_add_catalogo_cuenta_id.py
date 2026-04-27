"""Add catalogo_cuenta_id to gastos and gastos_diarios

Revision ID: 003
Revises: 002
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add to gastos
    try:
        op.add_column('gastos', sa.Column(
            'catalogo_cuenta_id', sa.Integer(),
            sa.ForeignKey('catalogo_cuentas.id'),
            nullable=True
        ))
    except Exception:
        pass  # already exists
    # Add to gastos_diarios
    try:
        op.add_column('gastos_diarios', sa.Column(
            'catalogo_cuenta_id', sa.Integer(),
            sa.ForeignKey('catalogo_cuentas.id'),
            nullable=True
        ))
    except Exception:
        pass  # already exists
    # Add columns to pl_mensual for auto-calculation tracking
    try:
        op.add_column('pl_mensual', sa.Column(
            'calculado_automaticamente', sa.Boolean(), server_default='false'
        ))
    except Exception:
        pass
    try:
        op.add_column('pl_mensual', sa.Column(
            'fecha_calculo', sa.DateTime(), nullable=True
        ))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column('pl_mensual', 'fecha_calculo')
    except Exception:
        pass
    try:
        op.drop_column('pl_mensual', 'calculado_automaticamente')
    except Exception:
        pass
    try:
        op.drop_column('gastos_diarios', 'catalogo_cuenta_id')
    except Exception:
        pass
    try:
        op.drop_column('gastos', 'catalogo_cuenta_id')
    except Exception:
        pass
