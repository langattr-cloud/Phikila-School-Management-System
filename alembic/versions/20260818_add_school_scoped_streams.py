"""Add school-scoped streams under the existing levels/grades.

The existing ``levels`` table remains the canonical grade resource. This
migration only makes the existing ``streams`` table tenant-aware, adds an
optional code, and protects it with tenant RLS. Existing streams are mapped to
their level's school; no synthetic school ID is introduced.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260818streams"
down_revision = "f8a1c2d3e4b5"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _columns(table: str):
    return {column["name"] for column in _inspector().get_columns(table)}


def _indexes(table: str):
    return {index["name"] for index in _inspector().get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    columns = _columns("streams")

    if "school_id" not in columns:
        op.add_column("streams", sa.Column("school_id", sa.BigInteger(), nullable=True))
    if "code" not in columns:
        op.add_column("streams", sa.Column("code", sa.String(30), nullable=True))

    unresolved = bind.execute(sa.text("""
        SELECT COUNT(*)
        FROM streams s
        LEFT JOIN levels l ON l.id = s.level_id
        WHERE s.school_id IS NULL
          AND l.school_id IS NULL
    """)).scalar_one()
    if unresolved:
        raise RuntimeError(
            "Cannot assign school ownership to existing streams because one or more "
            "streams reference a level without a school_id. Map those records before retrying."
        )

    bind.execute(sa.text("""
        UPDATE streams s
        SET school_id = l.school_id
        FROM levels l
        WHERE s.level_id = l.id
          AND s.school_id IS NULL
    """))

    remaining = bind.execute(sa.text("SELECT COUNT(*) FROM streams WHERE school_id IS NULL")).scalar_one()
    if remaining:
        raise RuntimeError(
            "Cannot make streams tenant-scoped because some existing streams have no resolvable school."
        )

    op.alter_column("streams", "school_id", existing_type=sa.BigInteger(), nullable=False)

    if "ix_streams_school_id" not in _indexes("streams"):
        op.create_index("ix_streams_school_id", "streams", ["school_id"])
    if "ix_streams_level_id" not in _indexes("streams"):
        op.create_index("ix_streams_level_id", "streams", ["level_id"])

    bind.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'streams_school_id_fkey'
            ) THEN
                ALTER TABLE streams
                    ADD CONSTRAINT streams_school_id_fkey
                    FOREIGN KEY (school_id) REFERENCES school_info(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """))

    bind.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_stream_school_level_name'
            ) THEN
                ALTER TABLE streams
                    ADD CONSTRAINT uq_stream_school_level_name
                    UNIQUE (school_id, level_id, name);
            END IF;
        END $$;
    """))

    bind.execute(sa.text("""
        ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS streams_read ON streams;
        CREATE POLICY streams_read ON streams
          FOR SELECT
          USING (school_id IN (SELECT public.tt_user_schools()));

        DROP POLICY IF EXISTS streams_write ON streams;
        CREATE POLICY streams_write ON streams
          FOR ALL
          USING (
            school_id IN (SELECT public.tt_user_schools())
            AND public.tt_can_write(school_id)
          )
          WITH CHECK (
            school_id IN (SELECT public.tt_user_schools())
            AND public.tt_can_write(school_id)
          );
    """))


def downgrade() -> None:
    bind = op.get_bind()
    stream_count = bind.execute(sa.text("SELECT COUNT(*) FROM streams")).scalar_one()
    if stream_count:
        raise RuntimeError(
            "Refusing to downgrade school-scoped streams while stream records exist; "
            "dropping school ownership would destroy tenant isolation. Archive/delete "
            "streams explicitly before a rollback."
        )

    bind.execute(sa.text("DROP POLICY IF EXISTS streams_write ON streams"))
    bind.execute(sa.text("DROP POLICY IF EXISTS streams_read ON streams"))
    bind.execute(sa.text("ALTER TABLE streams DISABLE ROW LEVEL SECURITY"))

    bind.execute(sa.text("ALTER TABLE streams DROP CONSTRAINT IF EXISTS uq_stream_school_level_name"))
    bind.execute(sa.text("ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_school_id_fkey"))
    if "ix_streams_level_id" in _indexes("streams"):
        op.drop_index("ix_streams_level_id", table_name="streams")
    if "ix_streams_school_id" in _indexes("streams"):
        op.drop_index("ix_streams_school_id", table_name="streams")

    columns = _columns("streams")
    if "code" in columns:
        op.drop_column("streams", "code")
    if "school_id" in columns:
        op.drop_column("streams", "school_id")
