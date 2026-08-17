"""Add responsible teacher to examination subject assignments."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "c2f8e9a1d6b4"
down_revision = "a1c4f7b20d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "exam_subjects" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("exam_subjects")}
    if "teacher_id" not in columns:
        op.add_column("exam_subjects", sa.Column("teacher_id", sa.Integer(), nullable=True))
    indexes = {i["name"] for i in inspect(op.get_bind()).get_indexes("exam_subjects")}
    if "ix_exam_subjects_teacher_id" not in indexes:
        op.create_index("ix_exam_subjects_teacher_id", "exam_subjects", ["teacher_id"])


def downgrade() -> None:
    pass
