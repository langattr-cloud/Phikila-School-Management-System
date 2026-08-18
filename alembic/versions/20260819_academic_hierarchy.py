"""Normalize academic hierarchy: school -> year -> level -> grade -> stream.

Existing levels are preserved as the canonical education sections and copied into
new grades. Existing streams are retained and linked to the inferred grade and
current academic year. No student or result rows are deleted.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260819academich"
down_revision = "20260818streams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "grades" not in tables:
        op.create_table(
            "grades",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("school_id", sa.Integer(), sa.ForeignKey("school_info.id"), nullable=False),
            sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("code", sa.String(30), nullable=False),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("status", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("school_id", "level_id", "code", name="uq_grade_school_level_code"),
        )
        op.create_index("ix_grades_school_id", "grades", ["school_id"])
        op.create_index("ix_grades_level_id", "grades", ["level_id"])

    # Existing production streams are level-scoped. Map them to a grade using
    # the existing class grade value where possible, otherwise create a generic
    # grade named after the level. This keeps the migration deterministic and
    # leaves ambiguous data visible for later admin correction.
    bind.execute(sa.text("""
        INSERT INTO grades (school_id, level_id, name, code, display_order, status)
        SELECT l.school_id, l.id, l.name, l.code, l.display_order, l.status
        FROM levels l
        WHERE NOT EXISTS (
          SELECT 1 FROM grades g WHERE g.school_id=l.school_id AND g.level_id=l.id AND g.code=l.code
        )
    """))

    columns = {c["name"] for c in sa.inspect(bind).get_columns("streams")}
    if "academic_year_id" not in columns:
        op.add_column("streams", sa.Column("academic_year_id", sa.BigInteger(), nullable=True))
    if "grade_id" not in columns:
        op.add_column("streams", sa.Column("grade_id", sa.BigInteger(), nullable=True))
    if "class_teacher_id" not in columns:
        op.add_column("streams", sa.Column("class_teacher_id", sa.Integer(), nullable=True))

    bind.execute(sa.text("""
        UPDATE streams s
        SET grade_id = g.id
        FROM grades g
        WHERE s.grade_id IS NULL
          AND g.level_id = s.level_id
          AND g.school_id = s.school_id
    """))
    bind.execute(sa.text("""
        UPDATE streams s
        SET academic_year_id = ay.id
        FROM academic_years ay
        WHERE s.academic_year_id IS NULL
          AND ay.school_id = s.school_id
          AND ay.is_current IS TRUE
    """))
    # If a school has no current year, leave the stream unresolved rather than
    # inventing historical ownership. The application will require an academic
    # year when creating new streams.

    bind.execute(sa.text("""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='streams_grade_id_fkey') THEN
            ALTER TABLE streams ADD CONSTRAINT streams_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='streams_academic_year_id_fkey') THEN
            ALTER TABLE streams ADD CONSTRAINT streams_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
          END IF;
        END $$;
    """))
    op.create_index("ix_streams_grade_id", "streams", ["grade_id"])
    op.create_index("ix_streams_academic_year_id", "streams", ["academic_year_id"])


def downgrade() -> None:
    # Deliberately conservative: dropping the new hierarchy could invalidate
    # migrated relationships. Preserve data and require an explicit manual
    # rollback migration if ever needed.
    pass
