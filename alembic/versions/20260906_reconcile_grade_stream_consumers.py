"""Align timetable, examinations and finance to canonical grade/stream context.

The existing class tables remain in place for compatibility. Grade is the
canonical academic grouping; stream is optional. Legacy class_id and
school_class_id references are deliberately preserved.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260906grstreamctx"
down_revision = "20260906classsync"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # Timetabling: make the canonical grade mandatory when a grade can be
    # resolved, while keeping the legacy class identity and school_class_id.
    op.add_column("tt_classes", sa.Column("grade_id", sa.BigInteger(), nullable=True))
    op.add_column("tt_classes", sa.Column("stream_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_tt_class_grade_id", "tt_classes", ["grade_id"])
    op.create_index("ix_tt_class_stream_id", "tt_classes", ["stream_id"])

    bind.execute(sa.text("""
        UPDATE tt_classes t
           SET grade_id = g.id,
               stream_id = CASE
                   WHEN t.school_class_id IS NOT NULL THEN sc.stream_id
                   ELSE NULL
               END
          FROM grades g
          LEFT JOIN school_classes sc ON sc.id = t.school_class_id
         WHERE t.grade_id IS NULL
           AND g.school_id = t.school_id
           AND g.level_id = t.level_id
           AND lower(trim(g.name)) = lower(trim(t.name))
    """))

    # If the class name contains a stream suffix (e.g. Grade 5A), resolve the
    # grade by prefix and stream by the matching grade/year/name/code where
    # possible. Existing rows remain valid even when no match exists.
    bind.execute(sa.text("""
        UPDATE tt_classes t
           SET grade_id = g.id,
               stream_id = s.id
          FROM grades g
          LEFT JOIN streams s
            ON s.school_id = t.school_id
           AND s.academic_year_id = t.academic_year_id
           AND s.grade_id = g.id
           AND (
                upper(trim(s.code)) = upper(trim(t.code))
                OR upper(trim(s.name)) = upper(trim(t.code))
           )
         WHERE t.grade_id IS NULL
           AND g.school_id = t.school_id
           AND g.level_id = t.level_id
           AND upper(trim(t.name)) LIKE upper(trim(g.name)) || '%'
    """))

    # Examinations currently require stream_id, which breaks grades that do
    # not have streams. Preserve the column but make stream optional.
    op.alter_column("exam_subjects", "stream_id", existing_type=sa.BigInteger(), nullable=True)

    # Finance fees may be defined at level, grade, or stream. Existing rows
    # continue to work because both new dimensions are nullable.
    op.add_column("fee_structures", sa.Column("grade_id", sa.BigInteger(), nullable=True))
    op.add_column("fee_structures", sa.Column("stream_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_fee_structures_grade_id", "fee_structures", ["grade_id"])
    op.create_index("ix_fee_structures_stream_id", "fee_structures", ["stream_id"])


def downgrade():
    op.drop_index("ix_fee_structures_stream_id", table_name="fee_structures")
    op.drop_index("ix_fee_structures_grade_id", table_name="fee_structures")
    op.drop_column("fee_structures", "stream_id")
    op.drop_column("fee_structures", "grade_id")
    op.alter_column("exam_subjects", "stream_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_index("ix_tt_class_stream_id", table_name="tt_classes")
    op.drop_index("ix_tt_class_grade_id", table_name="tt_classes")
    op.drop_column("tt_classes", "stream_id")
    op.drop_column("tt_classes", "grade_id")
