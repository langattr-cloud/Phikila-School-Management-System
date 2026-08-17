"""Add production student management tables.

Revision ID: c6f1a9d2e4b7
Revises: ab4d9e7c2f10
Create Date: 2026-08-17
"""

from alembic import op
import sqlalchemy as sa

revision = "c6f1a9d2e4b7"
down_revision = "ab4d9e7c2f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "students_v2",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("admission_number", sa.String(50), nullable=False, index=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("middle_name", sa.String(100)),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("preferred_name", sa.String(100)),
        sa.Column("date_of_birth", sa.Date()),
        sa.Column("gender", sa.String(20)),
        sa.Column("email", sa.String(200)),
        sa.Column("phone", sa.String(30)),
        sa.Column("address", sa.Text()),
        sa.Column("nationality", sa.String(60), server_default="Kenyan"),
        sa.Column("national_id", sa.String(50)),
        sa.Column("photo_url", sa.String(500)),
        sa.Column("admission_date", sa.Date()),
        sa.Column("current_class_id", sa.Integer(), sa.ForeignKey("school_classes.id")),
        sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id")),
        sa.Column("stream_id", sa.Integer(), sa.ForeignKey("streams.id")),
        sa.Column("status", sa.String(20), nullable=False, server_default="active", index=True),
        sa.Column("status_reason", sa.Text()),
        sa.Column("status_date", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("school_id", "admission_number", name="uq_student_admission"),
    )

    op.create_table(
        "student_guardians",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("relationship", sa.String(50), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("alt_phone", sa.String(30)),
        sa.Column("email", sa.String(200)),
        sa.Column("address", sa.Text()),
        sa.Column("occupation", sa.String(100)),
        sa.Column("is_emergency_contact", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "student_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("academic_year_id", sa.Integer(), sa.ForeignKey("academic_years.id"), nullable=False),
        sa.Column("term_id", sa.Integer(), sa.ForeignKey("terms.id")),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("school_classes.id"), nullable=False),
        sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id")),
        sa.Column("stream_id", sa.Integer(), sa.ForeignKey("streams.id")),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("enrollment_date", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "student_id", "academic_year_id", name="uq_enrollment_year"),
    )

    op.create_table(
        "student_documents",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students_v2.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("file_url", sa.String(500)),
        sa.Column("file_size", sa.Integer()),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("ocr_scan_id", sa.Integer()),
        sa.Column("uploaded_by", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("student_documents")
    op.drop_table("student_enrollments")
    op.drop_table("student_guardians")
    op.drop_table("students_v2")
