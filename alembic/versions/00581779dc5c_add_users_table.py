"""Reconcile the users table with the production schema."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = '00581779dc5c'
down_revision: Union[str, Sequence[str], None] = '46f05a7cf307'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _bind():
    return op.get_bind()


def _inspector():
    return inspect(_bind())


def _table_exists(name: str) -> bool:
    # to_regclass is schema-qualified and avoids inspector/search_path ambiguity.
    return _bind().execute(text("SELECT to_regclass(:name)"), {"name": f"public.{name}"}).scalar() is not None


def _columns(table: str) -> set[str]:
    return {c['name'] for c in _inspector().get_columns(table)} if _table_exists(table) else set()


def _indexes(table: str) -> set[str]:
    return {i['name'] for i in _inspector().get_indexes(table)} if _table_exists(table) else set()


def _add_column(table: str, name: str, column: sa.Column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def _add_index(name: str, table: str, columns: list[str], unique: bool = False) -> None:
    existing = _columns(table)
    if name not in _indexes(table) and all(column in existing for column in columns):
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
        # Production already has a public.users table with a different, leaner
        # schema. Add only the historical fields that are actually missing.
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
    pass
