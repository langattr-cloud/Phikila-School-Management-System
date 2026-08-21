"""Migrate attendance uniqueness from legacy classes to academic streams.

The canonical attendance identity is School + Academic Year + Stream + Date.
Legacy class_id is retained for compatibility only.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260819attctx"
down_revision = "20260819acadctx"
branch_labels = None
depends_on = None


def _relation_exists(bind, name):
    return bind.execute(
        sa.text("SELECT 1 FROM pg_class WHERE relname = :name LIMIT 1"),
        {"name": name},
    ).scalar() is not None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    constraints = {c["name"] for c in inspector.get_unique_constraints("attendance_sessions")}
    if "uq_attendance_session" in constraints:
        op.drop_constraint("uq_attendance_session", "attendance_sessions", type_="unique")

    constraints = {c["name"] for c in sa.inspect(bind).get_unique_constraints("attendance_sessions")}
    if "uq_attendance_session_stream_date" not in constraints and not _relation_exists(
        bind, "uq_attendance_session_stream_date"
    ):
        op.create_unique_constraint(
            "uq_attendance_session_stream_date",
            "attendance_sessions",
            ["school_id", "academic_year_id", "stream_id", "date"],
        )


def downgrade():
    bind = op.get_bind()
    constraints = {c["name"] for c in sa.inspect(bind).get_unique_constraints("attendance_sessions")}
    if "uq_attendance_session_stream_date" in constraints:
        op.drop_constraint("uq_attendance_session_stream_date", "attendance_sessions", type_="unique")
    if "uq_attendance_session" not in constraints and not _relation_exists(bind, "uq_attendance_session"):
        op.create_unique_constraint(
            "uq_attendance_session", "attendance_sessions", ["school_id", "class_id", "date"]
        )
