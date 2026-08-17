"""Reconcile the class-register chain with the production schema."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "4721a8a1f38d"
down_revision = "e3e43c2c32aa"
branch_labels = None
depends_on = None


def _inspector():
    return inspect(op.get_bind())


def _table_exists(name):
    return name in _inspector().get_table_names()


def _columns(table):
    return {c["name"] for c in _inspector().get_columns(table)} if _table_exists(table) else set()


def _indexes(table):
    return {i["name"] for i in _inspector().get_indexes(table)} if _table_exists(table) else set()


def _add_column(table, column):
    if column.name not in _columns(table):
        op.add_column(table, column)


def _add_index(name, table, columns, unique=False):
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def _ensure_table(name, columns, constraints=()):
    if not _table_exists(name):
        op.create_table(name, *columns, *constraints)


def upgrade():
    _ensure_table("levels", [
        sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("name", sa.String(), nullable=True), sa.Column("code", sa.String(), nullable=True)
    ])
    _add_column("levels", sa.Column("name", sa.String(), nullable=True))
    _add_column("levels", sa.Column("code", sa.String(), nullable=True))
    _add_index("ix_levels_id", "levels", ["id"])
    _add_index("ix_levels_name", "levels", ["name"])

    _ensure_table("teachers", [
        sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("name", sa.String(), nullable=True),
        sa.Column("tsc_number", sa.String(), nullable=True), sa.Column("department", sa.String(), nullable=True)
    ])
    _add_column("teachers", sa.Column("name", sa.String(), nullable=True))
    _add_column("teachers", sa.Column("tsc_number", sa.String(), nullable=True))
    _add_column("teachers", sa.Column("department", sa.String(), nullable=True))
    _add_index("ix_teachers_id", "teachers", ["id"])
    _add_index("ix_teachers_name", "teachers", ["name"])

    _ensure_table("qualifications", [
        sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("title", sa.String(), nullable=True),
        sa.Column("institution", sa.String(), nullable=True), sa.Column("teacher_id", sa.BigInteger(), nullable=True),
    ])
    _add_column("qualifications", sa.Column("title", sa.String(), nullable=True))
    _add_column("qualifications", sa.Column("institution", sa.String(), nullable=True))
    _add_column("qualifications", sa.Column("teacher_id", sa.BigInteger(), nullable=True))
    _add_index("ix_qualifications_id", "qualifications", ["id"])

    _ensure_table("class_registers", [
        sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("academic_year_id", sa.BigInteger()),
        sa.Column("grade_form_id", sa.BigInteger()), sa.Column("stream_id", sa.BigInteger()), sa.Column("class_teacher_id", sa.BigInteger()),
        sa.Column("room_id", sa.String()), sa.Column("capacity", sa.Integer()), sa.Column("status", sa.String())
    ])
    for column in [
        sa.Column("academic_year_id", sa.BigInteger()), sa.Column("grade_form_id", sa.BigInteger()), sa.Column("stream_id", sa.BigInteger()),
        sa.Column("class_teacher_id", sa.BigInteger()), sa.Column("room_id", sa.String()), sa.Column("capacity", sa.Integer()), sa.Column("status", sa.String())
    ]:
        _add_column("class_registers", column)
    _add_index("ix_class_registers_id", "class_registers", ["id"])

    if _table_exists("academic_years"):
        _add_column("academic_years", sa.Column("year", sa.String(), nullable=True))
        cols = _columns("academic_years")
        if "year" in cols and "name" in cols:
            op.get_bind().execute(sa.text("UPDATE academic_years SET year = name WHERE year IS NULL"))

    if _table_exists("streams"):
        _add_column("streams", sa.Column("name", sa.String(), nullable=True))
        _add_column("streams", sa.Column("level_id", sa.BigInteger(), nullable=True))


def downgrade():
    pass
