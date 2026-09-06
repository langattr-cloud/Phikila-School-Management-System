"""Reconcile student_enrollments with the StudentEnrollment ORM.

The current ORM includes an optional stream_id field. Keep it nullable so
existing enrollment rows remain valid. Add the supporting index and, when the
legacy streams table exists, its foreign key; the current production schema
has retired that table, so the column remains intentionally unconstrained.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260906enrollstream"
down_revision = "20260906enrollgrade"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("student_enrollments")}
    indexes = {i["name"] for i in inspector.get_indexes("student_enrollments")}

    if "stream_id" not in columns:
        op.add_column(
            "student_enrollments",
            sa.Column("stream_id", sa.Integer(), nullable=True),
        )
    if "ix_student_enrollments_stream_id" not in indexes:
        op.create_index(
            "ix_student_enrollments_stream_id",
            "student_enrollments",
            ["stream_id"],
        )

    # The current production schema no longer has the legacy streams table.
    # If a deployment still has it, preserve the ORM foreign-key contract.
    if bind.execute(sa.text("SELECT to_regclass('public.streams')")).scalar() is not None:
        exists = bind.execute(sa.text("""
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'student_enrollments_stream_id_fkey'
        """)).scalar()
        if not exists:
            bind.execute(sa.text("""
                ALTER TABLE student_enrollments
                ADD CONSTRAINT student_enrollments_stream_id_fkey
                FOREIGN KEY (stream_id) REFERENCES streams(id)
            """))


def downgrade():
    bind = op.get_bind()
    bind.execute(sa.text("""
        ALTER TABLE student_enrollments
        DROP CONSTRAINT IF EXISTS student_enrollments_stream_id_fkey
    """))
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("student_enrollments")}
    if "ix_student_enrollments_stream_id" in indexes:
        op.drop_index("ix_student_enrollments_stream_id", table_name="student_enrollments")
    columns = {c["name"] for c in sa.inspect(bind).get_columns("student_enrollments")}
    if "stream_id" in columns:
        op.drop_column("student_enrollments", "stream_id")
