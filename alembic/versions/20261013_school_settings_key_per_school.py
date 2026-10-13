"""Allow the same settings label across multiple schools.

The settings `key` is a type/label, not a globally unique identifier. Tenant
uniqueness belongs on `school_id`, which already has its own unique constraint.
Older database schemas may have an obsolete unique constraint/index on `key`,
which prevents initializing a second school's profile.
"""

from alembic import op
import sqlalchemy as sa


revision = "20261013schoolsettings"
down_revision = "20261011membershipphone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "school_settings" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("school_settings")}
    if "key" not in columns:
        return

    # Drop only global uniqueness on the label column. Keep school_id uniqueness
    # so each school can have at most one settings row.
    unique_constraints = inspector.get_unique_constraints("school_settings")
    dropped_constraint_names = set()
    for constraint in unique_constraints:
        if constraint.get("column_names") == ["key"] and constraint.get("name"):
            name = constraint["name"]
            op.drop_constraint(name, "school_settings", type_="unique")
            dropped_constraint_names.add(name)

    # Some deployments may have a standalone unique index instead of a
    # constraint. Drop that too, but never drop unrelated or composite indexes.
    inspector = sa.inspect(bind)
    for index in inspector.get_indexes("school_settings"):
        if (
            index.get("unique")
            and index.get("column_names") == ["key"]
            and index.get("name")
            and index["name"] not in dropped_constraint_names
        ):
            op.drop_index(index["name"], table_name="school_settings")


def downgrade() -> None:
    # This change is intentionally not reversed automatically: once multiple
    # schools share the default key, restoring global uniqueness would fail and
    # would reintroduce the production bug. Restore manually only if the data
    # model is changed to use globally unique keys.
    pass
