"""Add users table

Revision ID: 00581779dc5c
Revises: 46f05a7cf307
Create Date: 2026-08-02 12:11:24.799445

Production may already contain this table, so the migration reconciles it
instead of failing on duplicate objects.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = '00581779dc5c'
down_revision: Union[str, Sequence[str], None] = '46f05a7cf307'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _inspector().get_table_names()


def _columns(table: str) -> set[str]:
    return {c['name'] for c in _inspector().get_columns(table)} if _table_exists(table) else set()


def _indexes(table: str) -> set[str]:
    return {i['name'] for i in _inspector().get_indexes(table)} if _table_exists(table) else set()


def _add_column(table: str, name: str, column: sa.Column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def _add_index(name: str, table: str, columns: list[str], unique: bool = False) -> None:
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    if not _table_exists('users'):
        op.create_table(
            'users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('hashed_password', sa.String(), nullable=False),
            sa.Column('role', sa.String(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('is_locked', sa.Boolean(), nullable=True),
            sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        _add_column('users', 'username', sa.Column('username', sa.String(), nullable=True))
        _add_column('users', 'email', sa.Column('email', sa.String(), nullable=True))
        _add_column('users', 'hashed_password', sa.Column('hashed_password', sa.String(), nullable=True))
        _add_column('users', 'role', sa.Column('role', sa.String(), nullable=True))
        _add_column('users', 'is_active', sa.Column('is_active', sa.Boolean(), nullable=True))
        _add_column('users', 'is_locked', sa.Column('is_locked', sa.Boolean(), nullable=True))
        _add_column('users', 'last_login', sa.Column('last_login', sa.DateTime(timezone=True), nullable=True))
        _add_column('users', 'created_at', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
        _add_column('users', 'updated_at', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    _add_index('ix_users_email', 'users', ['email'], unique=True)
    _add_index('ix_users_id', 'users', ['id'])
    _add_index('ix_users_username', 'users', ['username'], unique=True)


def downgrade() -> None:
    # Do not destructively remove an existing production users table.
    pass
