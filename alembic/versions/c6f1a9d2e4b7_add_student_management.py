"""Add production student management tables without assuming school_classes exists."""

from alembic import op
import sqlalchemy as sa

revision = "c6f1a9d2e4b7"
down_revision = ("ab4d9e7c2f10", "b7d2e9a41c08")
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _tables():
    return set(_inspector().get_table_names())


def _add_missing_columns(table, definitions):
    existing = {c["name"] for c in _inspector().get_columns(table)}
    for column in definitions:
        if column.name not in existing:
            op.add_column(table, column)


def _add_index(name, table, columns, unique=False):
    if name not in {i["name"] for i in _inspector().get_indexes(table)}:
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    tables = _tables()

    if "students_v2" not in tables:
        op.create_table(
            "students_v2",
            sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("admission_number", sa.String(50), nullable=False), sa.Column("first_name", sa.String(100), nullable=False),
            sa.Column("middle_name", sa.String(100)), sa.Column("last_name", sa.String(100), nullable=False), sa.Column("preferred_name", sa.String(100)),
            sa.Column("date_of_birth", sa.Date()), sa.Column("gender", sa.String(20)), sa.Column("email", sa.String(200)), sa.Column("phone", sa.String(30)),
            sa.Column("address", sa.Text()), sa.Column("nationality", sa.String(60), server_default="Kenyan"), sa.Column("national_id", sa.String(50)),
            sa.Column("photo_url", sa.String(500)), sa.Column("admission_date", sa.Date()), sa.Column("current_class_id", sa.Integer()),
            sa.Column("level_id", sa.BigInteger()), sa.Column("stream_id", sa.BigInteger()), sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("status_reason", sa.Text()), sa.Column("status_date", sa.Date()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True)), sa.UniqueConstraint("school_id", "admission_number", name="uq_student_admission"),
        )
    else:
        _add_missing_columns("students_v2", [
            sa.Column("school_id", sa.Integer()), sa.Column("admission_number", sa.String(50)), sa.Column("first_name", sa.String(100)),
            sa.Column("middle_name", sa.String(100)), sa.Column("last_name", sa.String(100)), sa.Column("preferred_name", sa.String(100)),
            sa.Column("date_of_birth", sa.Date()), sa.Column("gender", sa.String(20)), sa.Column("email", sa.String(200)), sa.Column("phone", sa.String(30)),
            sa.Column("address", sa.Text()), sa.Column("nationality", sa.String(60)), sa.Column("national_id", sa.String(50)), sa.Column("photo_url", sa.String(500)),
            sa.Column("admission_date", sa.Date()), sa.Column("current_class_id", sa.Integer()), sa.Column("level_id", sa.BigInteger()), sa.Column("stream_id", sa.BigInteger()),
            sa.Column("status", sa.String(20)), sa.Column("status_reason", sa.Text()), sa.Column("status_date", sa.Date()), sa.Column("created_at", sa.DateTime(timezone=True)), sa.Column("updated_at", sa.DateTime(timezone=True)),
        ])

    _add_index("ix_students_v2_id", "students_v2", ["id"])
    _add_index("ix_students_v2_school_id", "students_v2", ["school_id"])
    _add_index("ix_students_v2_admission_number", "students_v2", ["admission_number"])
    _add_index("ix_students_v2_status", "students_v2", ["status"])

    tables = _tables()
    if "student_guardians" not in tables:
        op.create_table(
            "student_guardians", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("full_name", sa.String(200), nullable=False),
            sa.Column("relationship", sa.String(50), nullable=False), sa.Column("phone", sa.String(30), nullable=False), sa.Column("alt_phone", sa.String(30)),
            sa.Column("email", sa.String(200)), sa.Column("address", sa.Text()), sa.Column("occupation", sa.String(100)), sa.Column("is_emergency_contact", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True)),
        )
    if "student_enrollments" not in tables:
        op.create_table(
            "student_enrollments", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("academic_year_id", sa.BigInteger(), sa.ForeignKey("academic_years.id"), nullable=False),
            sa.Column("term_id", sa.BigInteger(), sa.ForeignKey("terms.id")), sa.Column("class_id", sa.Integer(), nullable=False), sa.Column("level_id", sa.BigInteger()), sa.Column("stream_id", sa.BigInteger()),
            sa.Column("status", sa.String(20), server_default="active"), sa.Column("enrollment_date", sa.Date()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("school_id", "student_id", "academic_year_id", name="uq_enrollment_year"),
        )
    if "student_documents" not in tables:
        op.create_table(
            "student_documents", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False), sa.Column("document_type", sa.String(50), nullable=False),
            sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text()), sa.Column("file_url", sa.String(500)), sa.Column("file_size", sa.Integer()),
            sa.Column("mime_type", sa.String(100)), sa.Column("ocr_scan_id", sa.Integer()), sa.Column("uploaded_by", sa.String(64)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    pass
