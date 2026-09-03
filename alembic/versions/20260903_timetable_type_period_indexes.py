"""Store period selection as part of the current timetable type configuration."""
from alembic import op
import sqlalchemy as sa

revision = "20260903tttypeperiods"
down_revision = "20260819academich"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"]: c for c in sa.inspect(bind).get_columns("tt_timetable_types")}
    if "period_indexes" not in columns:
        op.add_column(
            "tt_timetable_types",
            sa.Column("period_indexes", sa.JSON(), nullable=False, server_default="[]"),
        )
    bind.execute(sa.text("""
        UPDATE tt_timetable_types t
        SET period_indexes = COALESCE((
            SELECT json_agg(p.index ORDER BY p.index)
            FROM tt_periods p
            WHERE p.school_id = t.school_id AND p.is_teaching IS TRUE
        ), '[]'::json)
        WHERE t.period_indexes::text = '[]'
    """))


def downgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("tt_timetable_types")}
    if "period_indexes" in columns:
        op.drop_column("tt_timetable_types", "period_indexes")
