"""Keep stream-coded class names canonical and synchronized with code."""
from alembic import op
import sqlalchemy as sa

revision = "20260902classnames"
down_revision = "20260902termuniq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Stream-coded classes use the code as their canonical display identity.
    # Numeric-only classes and special STREAM-* scheduling identities are left
    # untouched. The trigger keeps the two fields synchronized on future
    # inserts/updates as well as correcting existing rows.
    for table in ("tt_classes", "school_classes"):
        bind.execute(sa.text(f"""
            UPDATE {table}
            SET name = 'Grade ' || upper(trim(code))
            WHERE trim(code) ~ '^[0-9]+[A-Za-z]+$'
              AND trim(name) ILIKE 'Grade%'
              AND name IS DISTINCT FROM 'Grade ' || upper(trim(code))
        """))

    bind.execute(sa.text("""
        CREATE OR REPLACE FUNCTION normalize_stream_class_name()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF trim(NEW.code) ~ '^[0-9]+[A-Za-z]+$'
               AND trim(NEW.name) ILIKE 'Grade%' THEN
                NEW.name := 'Grade ' || upper(trim(NEW.code));
            END IF;
            RETURN NEW;
        END;
        $$;
    """))

    for table in ("tt_classes", "school_classes"):
        trigger = f"trg_{table}_normalize_stream_class_name"
        bind.execute(sa.text(f"DROP TRIGGER IF EXISTS {trigger} ON {table}"))
        bind.execute(sa.text(f"""
            CREATE TRIGGER {trigger}
            BEFORE INSERT OR UPDATE OF name, code ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION normalize_stream_class_name()
        """))


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("tt_classes", "school_classes"):
        bind.execute(sa.text(f"DROP TRIGGER IF EXISTS trg_{table}_normalize_stream_class_name ON {table}"))
    bind.execute(sa.text("DROP FUNCTION IF EXISTS normalize_stream_class_name()"))
