"""Add grade_id required by the StudentEnrollment ORM model.

The ORM writes grade_id during student admission. Keep the column nullable so
existing enrollment rows remain valid.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260906enrollgrade"
down_revision = "20260906syncclasses"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "student_enrollments",
        sa.Column("grade_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_student_enrollments_grade_id",
        "student_enrollments",
        ["grade_id"],
    )


def downgrade():
    op.drop_index("ix_student_enrollments_grade_id", table_name="student_enrollments")
    op.drop_column("student_enrollments", "grade_id")
