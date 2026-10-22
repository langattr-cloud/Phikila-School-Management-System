"""Remove legacy timetable data structures while preserving school/platform identity.

This is intentionally forward-only: old timetable schedules and solver state are
not compatible with a clean rebuild. Shared school membership and platform
administration tables are preserved.
"""
from alembic import op

revision = "20261022timetable_reset"
down_revision = "20261014capitation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the module-entitlement infrastructure but remove the old feature flag.
    op.execute("""
        DELETE FROM tt_school_module_entitlements
        WHERE module_key = 'timetable'
    """)

    # The trigger existed only to mirror the old timetable class model. Canonical
    # school_classes and its existing rows remain untouched.
    op.execute("DROP TRIGGER IF EXISTS trg_sync_tt_class_to_school_class ON tt_classes")
    op.execute("DROP FUNCTION IF EXISTS sync_tt_class_to_school_class()")

    # Remove leaf/dependent tables first. CASCADE handles legacy FK constraints,
    # policies, and indexes attached to these timetable-only relations.
    for table in (
        "tt_solver_jobs",
        "tt_lessons",
        "tt_lesson_requirements",
        "tt_versions",
        "tt_constraints",
        "tt_events",
        "tt_appearance_settings",
        "tt_timetable_types",
        "tt_calendar_configs",
        "tt_projects",
        "tt_llm_credentials",
        "tt_llm_models",
        "tt_llm_settings",
        "timetable_entries",
        "timetable_allocations",
        "timetables",
        "lesson_periods",
        "working_days",
        "tt_rooms",
        "tt_subjects",
        "tt_teachers",
        "tt_classes",
        "tt_periods",
        "tt_days",
    ):
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')


def downgrade() -> None:
    raise NotImplementedError(
        "The legacy timetable schema and data are intentionally not restored. "
        "Rebuild the timetable module with new migrations."
    )
