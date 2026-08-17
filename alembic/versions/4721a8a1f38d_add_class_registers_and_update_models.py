"""add class registers and update models

Revision ID: 4721a8a1f38d
Revises: e3e43c2c32aa
Create Date: 2026-07-26 14:52:45.232589

This migration reconciles the schema because production may already contain
objects created outside the current Alembic history.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision: str = "4721a8a1f38d"
down_revision: Union[str, Sequence[str], None] = "e3e43c2c32aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _inspector().get_table_names()


def _columns(table: str) -> set[str]:
    if not _table_exists(table):
        return set()
    return {c["name"] for c in _inspector().get_columns(table)}


def _indexes(table: str) -> set[str]:
    if not _table_exists(table):
        return set()
    return {i["name"] for i in _inspector().get_indexes(table)}


def _add_index(name: str, table: str, columns: list[str], unique: bool = False) -> None:
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def _create_levels() -> None:
    if not _table_exists("levels"):
        op.create_table(
            "levels",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("code", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
    cols = _columns("levels")
    if "name" not in cols:
        op.add_column("levels", sa.Column("name", sa.String(), nullable=True))
    if "code" not in cols:
        op.add_column("levels", sa.Column("code", sa.String(), nullable=True))
    _add_index("ix_levels_id", "levels", ["id"])
    _add_index("ix_levels_name", "levels", ["name"])


def _create_teachers() -> None:
    if not _table_exists("teachers"):
        op.create_table(
            "teachers",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("tsc_number", sa.String(), nullable=True),
            sa.Column("department", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
    cols = _columns("teachers")
    if "name" not in cols:
        op.add_column("teachers", sa.Column("name", sa.String(), nullable=True))
    if "tsc_number" not in cols:
        op.add_column("teachers", sa.Column("tsc_number", sa.String(), nullable=True))
    if "department" not in cols:
        op.add_column("teachers", sa.Column("department", sa.String(), nullable=True))
    _add_index("ix_teachers_id", "teachers", ["id"])
    _add_index("ix_teachers_name", "teachers", ["name"])
    _add_index("ix_teachers_tsc_number", "teachers", ["tsc_number"], unique=True)


def _create_qualifications() -> None:
    if not _table_exists("qualifications"):
        op.create_table(
            "qualifications",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("institution", sa.String(), nullable=True),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    cols = _columns("qualifications")
    if "title" not in cols:
        op.add_column("qualifications", sa.Column("title", sa.String(), nullable=True))
    if "institution" not in cols:
        op.add_column("qualifications", sa.Column("institution", sa.String(), nullable=True))
    if "teacher_id" not in cols:
        op.add_column("qualifications", sa.Column("teacher_id", sa.Integer(), nullable=True))
    _add_index("ix_qualifications_id", "qualifications", ["id"])


def _create_class_registers() -> None:
    if not _table_exists("class_registers"):
        op.create_table(
            "class_registers",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("academic_year_id", sa.Integer(), nullable=False),
            sa.Column("grade_form_id", sa.Integer(), nullable=False),
            sa.Column("stream_id", sa.Integer(), nullable=False),
            sa.Column("class_teacher_id", sa.Integer(), nullable=True),
            sa.Column("room_id", sa.String(), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"]),
            sa.ForeignKeyConstraint(["class_teacher_id"], ["teachers.id"]),
            sa.ForeignKeyConstraint(["grade_form_id"], ["levels.id"]),
            sa.ForeignKeyConstraint(["stream_id"], ["streams.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        cols = _columns("class_registers")
        additions = {
            "academic_year_id": sa.Integer(),
            "grade_form_id": sa.Integer(),
            "stream_id": sa.Integer(),
            "class_teacher_id": sa.Integer(),
            "room_id": sa.String(),
            "capacity": sa.Integer(),
            "status": sa.String(),
        }
        for name, typ in additions.items():
            if name not in cols:
                op.add_column("class_registers", sa.Column(name, typ, nullable=True))
    _add_index("ix_class_registers_id", "class_registers", ["id"])


def _drop_if_present(table: str, index: str) -> None:
    if _table_exists(table) and index in _indexes(table):
        op.drop_index(index, table_name=table)


def upgrade() -> None:
    _create_levels()
    _create_teachers()
    _create_qualifications()
    _create_class_registers()

    if _table_exists("grade_levels"):
        _drop_if_present("grade_levels", "ix_grade_levels_id")
        op.drop_table("grade_levels")

    if _table_exists("terms"):
        _drop_if_present("terms", "ix_terms_id")
        op.drop_table("terms")

    if _table_exists("academic_years"):
        cols = _columns("academic_years")
        if "year" not in cols:
            op.add_column("academic_years", sa.Column("year", sa.String(), nullable=True))

        bind = op.get_bind()
        unique_constraints = _inspector().get_unique_constraints("academic_years")
        for constraint in unique_constraints:
            if constraint.get("name") == "academic_years_name_key" and "name" in cols:
                op.drop_constraint("academic_years_name_key", "academic_years", type_="unique")
                break

        _add_index("ix_academic_years_year", "academic_years", ["year"], unique=True)

        if "name" in cols:
            op.drop_column("academic_years", "name")

    if _table_exists("streams"):
        cols = _columns("streams")
        if "name" not in cols:
            op.add_column("streams", sa.Column("name", sa.String(), nullable=True))
        if "level_id" not in cols:
            op.add_column("streams", sa.Column("level_id", sa.Integer(), nullable=True))
        _add_index("ix_streams_name", "streams", ["name"])

        foreign_keys = _inspector().get_foreign_keys("streams")
        exists = any(
            fk.get("referred_table") == "levels"
            and fk.get("constrained_columns") == ["level_id"]
            for fk in foreign_keys
        )
        if not exists:
            op.create_foreign_key(
                "fk_streams_level_id_levels",
                "streams",
                "levels",
                ["level_id"],
                ["id"],
            )


def downgrade() -> None:
    # Production reconciliation migrations intentionally avoid destructive
    # downgrades. Rollbacks must be handled explicitly after inspecting data.
    pass
