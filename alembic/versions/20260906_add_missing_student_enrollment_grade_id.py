"""Add grade_id required by the StudentEnrollment ORM model.

The ORM writes grade_id during student admission. Keep the column nullable so
existing enrollment rows remain valid.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260906enrollgrade"
down_revision = "20260906classsync"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("student_enrollments")}
    indexes = {i["name"] for i in inspector.get_indexes("student_enrollments")}
    if "grade_id" not in columns:
        op.add_column("student_enrollments", sa.Column("grade_id", sa.Integer(), nullable=True))
    if "ix_student_enrollments_grade_id" not in indexes:
        op.create_index("ix_student_enrollments_grade_id", "student_enrollments", ["grade_id"])


def downgrade():
    bind = op.get_bind()
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("student_enrollments")}
    if "ix_student_enrollments_grade_id" in indexes:
        op.drop_index("ix_student_enrollments_grade_id", table_name="student_enrollments")
    columns = {c["name"] for c in sa.inspect(bind).get_columns("student_enrollments")}
    if "grade_id" in columns:
        op.drop_column("student_enrollments", "grade_id")
