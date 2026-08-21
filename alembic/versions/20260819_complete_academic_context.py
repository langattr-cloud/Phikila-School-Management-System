"""Complete School -> Year -> Level -> Grade -> Stream context.

Additive migration: preserves legacy class columns while making grade/stream
placement available to enrollment, attendance and examinations.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260819acadctx"
down_revision = "20260818streams"
branch_labels = None
depends_on = None


def _inspector(): return sa.inspect(op.get_bind())
def _tables(): return set(_inspector().get_table_names())
def _columns(table): return {c["name"] for c in _inspector().get_columns(table)}
def _indexes(table): return {i["name"] for i in _inspector().get_indexes(table)}
def _add_column(table, column):
    if column.name not in _columns(table): op.add_column(table, column)
def _add_index(name, table, columns):
    if name not in _indexes(table): op.create_index(name, table, columns)


def _ensure_grade_table():
    if "grades" in _tables(): return
    op.create_table(
        "grades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("school_info.id"), nullable=False),
        sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False), sa.Column("code", sa.String(30), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "level_id", "code", name="uq_grade_school_level_code"),
    )
    _add_index("ix_grades_id", "grades", ["id"])
    _add_index("ix_grades_school_id", "grades", ["school_id"])
    _add_index("ix_grades_level_id", "grades", ["level_id"])


def upgrade():
    bind = op.get_bind()
    _ensure_grade_table()
    bind.execute(sa.text("""
        INSERT INTO grades (school_id, level_id, name, code, display_order, status)
        SELECT l.school_id, l.id, l.name, l.code, l.display_order, TRUE
        FROM levels l
        WHERE NOT EXISTS (
            SELECT 1 FROM grades g WHERE g.school_id=l.school_id AND g.level_id=l.id AND g.code=l.code
        )
    """))

    if "streams" in _tables():
        _add_column("streams", sa.Column("academic_year_id", sa.BigInteger()))
        _add_column("streams", sa.Column("grade_id", sa.BigInteger()))
        _add_column("streams", sa.Column("class_teacher_id", sa.Integer()))
        bind.execute(sa.text("""
            UPDATE streams s SET grade_id=g.id FROM grades g
            WHERE s.grade_id IS NULL AND g.level_id=s.level_id AND g.school_id=s.school_id
        """))
        bind.execute(sa.text("""
            UPDATE streams s SET academic_year_id=ay.id FROM academic_years ay
            WHERE s.academic_year_id IS NULL AND ay.school_id=s.school_id AND ay.is_current=TRUE
        """))
        _add_index("ix_streams_academic_year_id", "streams", ["academic_year_id"])
        _add_index("ix_streams_grade_id", "streams", ["grade_id"])

    for table in ("students_v2", "student_enrollments"):
        if table in _tables(): _add_column(table, sa.Column("grade_id", sa.Integer()))

    if "student_enrollments" in _tables() and "stream_id" in _columns("student_enrollments"):
        bind.execute(sa.text("""
            UPDATE student_enrollments e SET grade_id=s.grade_id FROM streams s
            WHERE e.grade_id IS NULL AND e.stream_id=s.id
        """))
    if "students_v2" in _tables() and "stream_id" in _columns("students_v2"):
        bind.execute(sa.text("""
            UPDATE students_v2 st SET grade_id=s.grade_id FROM streams s
            WHERE st.grade_id IS NULL AND st.stream_id=s.id
        """))

    if "attendance_sessions" in _tables():
        _add_column("attendance_sessions", sa.Column("level_id", sa.Integer(), sa.ForeignKey("levels.id")))
        _add_column("attendance_sessions", sa.Column("grade_id", sa.Integer(), sa.ForeignKey("grades.id")))
        _add_column("attendance_sessions", sa.Column("stream_id", sa.Integer(), sa.ForeignKey("streams.id")))
        if "school_classes" in _tables():
            bind.execute(sa.text("""
                UPDATE attendance_sessions a SET stream_id=sc.stream_id
                FROM school_classes sc WHERE a.stream_id IS NULL AND a.class_id=sc.id AND sc.stream_id IS NOT NULL
            """))
        bind.execute(sa.text("""
            UPDATE attendance_sessions a SET grade_id=s.grade_id, level_id=s.level_id
            FROM streams s WHERE a.grade_id IS NULL AND a.stream_id=s.id
        """))

    if "exam_subjects" in _tables():
        _add_column("exam_subjects", sa.Column("grade_id", sa.Integer(), sa.ForeignKey("grades.id")))
        _add_column("exam_subjects", sa.Column("stream_id", sa.Integer(), sa.ForeignKey("streams.id")))
        if "school_classes" in _tables():
            bind.execute(sa.text("""
                UPDATE exam_subjects e SET stream_id=sc.stream_id
                FROM school_classes sc WHERE e.stream_id IS NULL AND e.class_id=sc.id AND sc.stream_id IS NOT NULL
            """))
        bind.execute(sa.text("""
            UPDATE exam_subjects e SET grade_id=s.grade_id
            FROM streams s WHERE e.grade_id IS NULL AND e.stream_id=s.id
        """))


def downgrade():
    pass
