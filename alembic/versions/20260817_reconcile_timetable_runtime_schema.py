"""Reconcile scheduling runtime tables with the canonical ORM contract.

The affected production tables are currently empty, so the type/constraint
reconciliation below is safe without data conversion. Legacy columns are
retained rather than dropped. No synthetic school_id is introduced.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260817tt01"
down_revision = "f8a1c2d3e4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # tt_solver_jobs: the deployed table used a text PK and several legacy
    # fields. The application contract uses an integer PK. The table is empty
    # in production, so this conversion does not rewrite timetable data.
    bind.execute(sa.text("ALTER TABLE public.tt_solver_jobs ALTER COLUMN id TYPE integer USING id::integer"))
    bind.execute(sa.text("ALTER TABLE public.tt_solver_jobs ALTER COLUMN progress TYPE integer USING progress::integer"))
    bind.execute(sa.text("ALTER TABLE public.tt_solver_jobs ALTER COLUMN school_id DROP DEFAULT"))

    # tt_lesson_requirements: align the primary key and required relationships
    # with the ORM. Production currently contains no rows.
    bind.execute(sa.text("ALTER TABLE public.tt_lesson_requirements ALTER COLUMN id TYPE integer USING id::integer"))
    bind.execute(sa.text("ALTER TABLE public.tt_lesson_requirements ALTER COLUMN class_id SET NOT NULL"))
    bind.execute(sa.text("ALTER TABLE public.tt_lesson_requirements ALTER COLUMN subject_id SET NOT NULL"))
    bind.execute(sa.text("ALTER TABLE public.tt_lesson_requirements ALTER COLUMN school_id DROP DEFAULT"))

    # tt_audit: add the fields used by the runtime ORM/job writer. Keep the
    # existing user_id/detail fields for backward compatibility and audit data.
    inspector = sa.inspect(bind)
    audit_columns = {c["name"] for c in inspector.get_columns("tt_audit")}
    additions = {
        "updated_at": "TIMESTAMPTZ DEFAULT now()",
        "actor": "VARCHAR(160)",
        "entity_id": "INTEGER",
        "summary": "TEXT",
        "at": "TIMESTAMPTZ DEFAULT now()",
        "school_id": "INTEGER",
    }
    for name, definition in additions.items():
        if name not in audit_columns:
            bind.execute(sa.text(f"ALTER TABLE public.tt_audit ADD COLUMN {name} {definition}"))

    # Do not create a synthetic tenant assignment. Existing audit data, if any,
    # must be mapped explicitly before making school_id required. This database
    # currently has zero audit rows.
    bind.execute(sa.text("ALTER TABLE public.tt_audit ALTER COLUMN school_id DROP DEFAULT"))


def downgrade() -> None:
    # Intentionally non-destructive. The legacy production columns are retained,
    # and reversing type/constraint changes could destroy data in a populated
    # environment.
    pass
