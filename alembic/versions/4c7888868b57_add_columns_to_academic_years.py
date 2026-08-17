"""Reconcile academic schema with existing production tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "4c7888868b57"
down_revision = "00581779dc5c"
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


def _add_column(table, name, column):
    if name not in _columns(table):
        op.add_column(table, column)


def _add_index(name, table, columns, unique=False):
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def _create_table_if_missing(name, columns, constraints=None):
    if not _table_exists(name):
        op.create_table(name, *columns, *(constraints or []))


def _ensure_status_enum():
    op.get_bind().execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statusenum') THEN
                CREATE TYPE statusenum AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
            END IF;
        END $$;
    """))


def upgrade():
    _ensure_status_enum()
    status_enum = sa.Enum("ACTIVE", "INACTIVE", "ARCHIVED", name="statusenum", create_type=False)

    _create_table_if_missing("academic_settings", [
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.String(255), nullable=False), sa.Column("description", sa.String(255)),
    ], [sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("key")])
    _add_index("ix_academic_settings_id", "academic_settings", ["id"])

    _create_table_if_missing("curriculums", [
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("name", sa.String(100), nullable=False),
        sa.Column("education_system", sa.String(100), nullable=False), sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("status", status_enum, nullable=True),
    ], [sa.PrimaryKeyConstraint("id")])
    _add_index("ix_curriculums_id", "curriculums", ["id"])

    _create_table_if_missing("subjects", [
        sa.Column("id", sa.BigInteger(), nullable=False), sa.Column("name", sa.String(100), nullable=False), sa.Column("code", sa.String(20), nullable=False),
    ], [sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("code"), sa.UniqueConstraint("name")])
    _add_index("ix_subjects_id", "subjects", ["id"])

    _create_table_if_missing("level_subjects", [
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("level_id", sa.BigInteger(), nullable=False),
        sa.Column("subject_id", sa.BigInteger(), nullable=False), sa.Column("lessons_per_week", sa.Integer()),
    ], [sa.PrimaryKeyConstraint("id"), sa.ForeignKeyConstraint(["level_id"], ["levels.id"]), sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"])])
    _add_index("ix_level_subjects_id", "level_subjects", ["id"])

    _create_table_if_missing("terms", [
        sa.Column("id", sa.BigInteger(), nullable=False), sa.Column("academic_year_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False), sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False), sa.Column("status", status_enum, nullable=True),
    ], [sa.PrimaryKeyConstraint("id"), sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"])])
    _add_index("ix_terms_id", "terms", ["id"])

    if _table_exists("academic_years"):
        _add_column("academic_years", "name", sa.Column("name", sa.String(50), nullable=True))
        _add_column("academic_years", "start_date", sa.Column("start_date", sa.Date(), nullable=True))
        _add_column("academic_years", "end_date", sa.Column("end_date", sa.Date(), nullable=True))
        _add_column("academic_years", "is_current", sa.Column("is_current", sa.Boolean(), nullable=True))
        _add_column("academic_years", "status", sa.Column("status", status_enum, nullable=True))
    if _table_exists("levels"):
        _add_column("levels", "display_order", sa.Column("display_order", sa.Integer(), nullable=True))
        _add_column("levels", "status", sa.Column("status", status_enum, nullable=True))
    if _table_exists("streams"):
        _add_column("streams", "capacity", sa.Column("capacity", sa.Integer(), nullable=True))
        _add_column("streams", "status", sa.Column("status", status_enum, nullable=True))


def downgrade():
    pass
