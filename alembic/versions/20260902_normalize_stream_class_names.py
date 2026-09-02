"""Keep stream-coded class names canonical and synchronized with code."""
from alembic import op
import sqlalchemy as sa

revision = "20260902classnames"
down_revision = "20260902termuniq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Stream-coded classes use the code as their canonical display identity.
    # Only numeric+letter codes are normalized; special scheduling identities
    # such as STREAM-123 and numeric-only classes are intentionally untouched.
    canonical_name = sa.text("""
        UPDATE {table}
        SET name = 'Grade ' || upper(trim(code))
        WHERE trim(code) ~ '^[0-9]+[A-Za-z]+$'
          AND trim(name) ILIKE 'Grade%'
          AND name IS DISTINCT FROM 'Grade ' || upper(trim(code))
    """)

    bind = op.get_bind()
    for table in ("tt_classes", "school_classes"):
        bind.execute(sa.text(canonical_name.text.format(table=table)))


def downgrade() -> None:
    # Display normalization is intentionally not reversed: the previous
    # values are not reliably recoverable from the class code.
    pass
