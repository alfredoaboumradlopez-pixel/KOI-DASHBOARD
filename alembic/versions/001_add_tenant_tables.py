"""Add tenant infrastructure tables

Revision ID: 001
Revises:
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # restaurantes
    op.create_table('restaurantes',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('slug', sa.String(50), nullable=False),
        sa.Column('activo', sa.Boolean(), server_default='true'),
        sa.Column('plan', sa.String(20), server_default='basico'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('timezone', sa.String(50), server_default='America/Mexico_City'),
        sa.Column('moneda', sa.String(3), server_default='MXN'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    # usuarios
    op.create_table('usuarios',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('email', sa.String(150), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('rol', sa.String(20), nullable=False),
        sa.Column('restaurante_id', sa.Integer(), sa.ForeignKey('restaurantes.id'), nullable=True),
        sa.Column('activo', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('ultimo_acceso', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    # catalogo_cuentas
    op.create_table('catalogo_cuentas',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('restaurante_id', sa.Integer(), sa.ForeignKey('restaurantes.id'), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('codigo', sa.String(20), nullable=False),
        sa.Column('tipo', sa.String(20), nullable=False),
        sa.Column('categoria_pl', sa.String(50), nullable=False),
        sa.Column('iva_acreditable', sa.Boolean(), server_default='false'),
        sa.Column('activo', sa.Boolean(), server_default='true'),
        sa.Column('orden', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    # alertas_config
    op.create_table('alertas_config',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('restaurante_id', sa.Integer(), sa.ForeignKey('restaurantes.id'), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('umbral', sa.Float(), nullable=False),
        sa.Column('activo', sa.Boolean(), server_default='true'),
        sa.Column('notificar_email', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    # alertas_log
    op.create_table('alertas_log',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('restaurante_id', sa.Integer(), sa.ForeignKey('restaurantes.id'), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('mensaje', sa.Text(), nullable=False),
        sa.Column('valor_detectado', sa.Float(), nullable=True),
        sa.Column('umbral_config', sa.Float(), nullable=True),
        sa.Column('revisada', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    # audit_log
    op.create_table('audit_log',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('restaurante_id', sa.Integer(), sa.ForeignKey('restaurantes.id'), nullable=True),
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('accion', sa.String(100), nullable=False),
        sa.Column('tabla_afectada', sa.String(50), nullable=True),
        sa.Column('registro_id', sa.Integer(), nullable=True),
        sa.Column('detalle', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('alertas_log')
    op.drop_table('alertas_config')
    op.drop_table('catalogo_cuentas')
    op.drop_table('usuarios')
    op.drop_table('restaurantes')
