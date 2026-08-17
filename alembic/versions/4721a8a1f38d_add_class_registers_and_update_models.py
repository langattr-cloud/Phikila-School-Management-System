"""Add class registers and reconcile existing school schema.

Production may already contain these objects from the Supabase bootstrap.
This revision is additive and never drops existing tables or columns.
"""
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


def _add_index(name, table, columns):
    if name not in _indexes(table):
        op.create_index(name, table, columns)


def _add_column(table, name, typ):
    if name not in _columns(table):
        op.add_column(table, sa.Column(name, typ, nullable=True))


def upgrade():
    if not _table_exists("levels"):
        op.create_table(
            "levels",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String()),
            sa.Column("code", sa.String()),
        )
    _add_column("levels", "name", sa.String())
    _add_column("levels", "code", sa.String())
    _add_index("ix_levels_id", "levels", ["id"])
    _add_index("ix_levels_name", "levels", ["name"])

    if not _table_exists("teachers"):
        op.create_table(
            "teachers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("tsc_number", sa.String()),
            sa.Column("department", sa.String()),
        )
    _add_column("teachers", "name", sa.String())
    _add_column("teachers", "tsc_number", sa.String())
    _add_column("teachers", "department", sa.String())
    _add_index("ix_teachers_id", "teachers", ["id"])
    _add_index("ix_teachers_name", "teachers", ["name"])
    _add_index("ix_teachers_tsc_number", "teachers", ["tsc_number"])

    if not _table_exists("qualifications"):
        op.create_table(
            "qualifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("institution", sa.String()),
            sa.Column("teacher_id", sa.Integer()),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
        )
    _add_column("qualifications", "title", sa.String())
    _add_column("qualifications", "institution", sa.String())
    _add_column("qualifications", "teacher_id", sa.Integer())
    _add_index("ix_qualifications_id", "qualifications", ["id"])

    if not _table_exists("class_registers"):
        op.create_table(
            "class_registers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("academic_year_id", sa.Integer()),
            sa.Column("grade_form_id", sa.Integer()),
            sa.Column("stream_id", sa.Integer()),
            sa.Column("class_teacher_id", sa.Integer()),
            sa.Column("room_id", sa.String()),
            sa.Column("capacity", sa.Integer()),
            sa.Column("status", sa.String()),
        )
    for name, typ in {
        "academic_year_id": sa.Integer(), "grade_form_id": sa.Integer(), "stream_id": sa.Integer(),
        "class_teacher_id": sa.Integer(), "room_id": sa.String(), "capacity": sa.Integer(), "status": sa.String(),
    }.items():
        _add_column("class_registers", name, typ)
    _add_index("ix_class_registers_id", "class_registers", ["id"])

    # Preserve the existing grade_levels/terms tables and existing academic_years
    # columns. Only add missing compatibility fields.
    if _table_exists("academic_years"):
        _add_column("academic_years", "year", sa.String())
        _add_index("ix_academic_years_year", "academic_years", ["year"])

    if _table_exists("streams"):
        _add_column("streams", "name", sa.String())
        _add_column("streams", "level_id", sa.Integer())
        _add_index("ix_streams_name", "streams", ["name"])


def downgrade():
    pass
