"""Keep timetable classes and canonical school classes in sync.

Academic Setup creates timetable classes in ``tt_classes`` while student
admission consumes the canonical ``school_classes`` table. This migration
backfills the canonical rows and installs database triggers so future class
creates/updates stay synchronized regardless of which application path writes
``tt_classes``.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260906classsync"
down_revision = "20260905classstream"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # Backfill canonical school_classes for existing timetable classes and
    # establish the FK bridge on tt_classes.
    bind.execute(sa.text("""
        INSERT INTO school_classes
            (school_id, name, code, grade, student_count, capacity, level_id,
             class_teacher_id, academic_year_id, status, created_at)
        SELECT
            t.school_id, t.name, t.code, NULL, t.student_count, 45, t.level_id,
            t.class_teacher_id, t.academic_year_id, 'active', CURRENT_TIMESTAMP
        FROM tt_classes t
        LEFT JOIN school_classes s
          ON s.school_id = t.school_id
         AND upper(trim(s.code)) = upper(trim(t.code))
         AND s.academic_year_id IS NOT DISTINCT FROM t.academic_year_id
         AND s.level_id IS NOT DISTINCT FROM t.level_id
        WHERE t.school_class_id IS NULL
          AND s.id IS NULL
    """))

    bind.execute(sa.text("""
        UPDATE tt_classes t
           SET school_class_id = s.id,
               updated_at = CURRENT_TIMESTAMP
          FROM school_classes s
         WHERE t.school_class_id IS NULL
           AND s.school_id = t.school_id
           AND upper(trim(s.code)) = upper(trim(t.code))
           AND s.academic_year_id IS NOT DISTINCT FROM t.academic_year_id
           AND s.level_id IS NOT DISTINCT FROM t.level_id
    """))

    bind.execute(sa.text("""
        CREATE OR REPLACE FUNCTION sync_tt_class_to_school_class()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            canonical_id integer;
        BEGIN
            IF TG_OP = 'INSERT' THEN
                IF NEW.school_class_id IS NOT NULL THEN
                    SELECT id INTO canonical_id
                      FROM school_classes
                     WHERE id = NEW.school_class_id
                       AND school_id = NEW.school_id;
                    IF canonical_id IS NULL THEN
                        RAISE EXCEPTION 'school_class_id % does not belong to school %', NEW.school_class_id, NEW.school_id;
                    END IF;
                ELSE
                    SELECT id INTO canonical_id
                      FROM school_classes
                     WHERE school_id = NEW.school_id
                       AND upper(trim(code)) = upper(trim(NEW.code))
                       AND academic_year_id IS NOT DISTINCT FROM NEW.academic_year_id
                       AND level_id IS NOT DISTINCT FROM NEW.level_id
                     ORDER BY id
                     LIMIT 1;

                    IF canonical_id IS NULL THEN
                        INSERT INTO school_classes
                            (school_id, name, code, grade, student_count, capacity,
                             level_id, class_teacher_id, academic_year_id, status, created_at)
                        VALUES
                            (NEW.school_id, NEW.name, upper(trim(NEW.code)), NULL,
                             NEW.student_count, 45, NEW.level_id, NEW.class_teacher_id,
                             NEW.academic_year_id, 'active', CURRENT_TIMESTAMP)
                        RETURNING id INTO canonical_id;
                    END IF;
                    NEW.school_class_id := canonical_id;
                END IF;

                UPDATE school_classes
                   SET name = NEW.name,
                       code = upper(trim(NEW.code)),
                       student_count = NEW.student_count,
                       level_id = NEW.level_id,
                       class_teacher_id = NEW.class_teacher_id,
                       academic_year_id = NEW.academic_year_id,
                       status = 'active',
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = NEW.school_class_id;

                RETURN NEW;
            END IF;

            IF TG_OP = 'UPDATE' THEN
                IF NEW.school_class_id IS NULL THEN
                    SELECT id INTO canonical_id
                      FROM school_classes
                     WHERE school_id = NEW.school_id
                       AND upper(trim(code)) = upper(trim(NEW.code))
                       AND academic_year_id IS NOT DISTINCT FROM NEW.academic_year_id
                       AND level_id IS NOT DISTINCT FROM NEW.level_id
                     ORDER BY id
                     LIMIT 1;
                    IF canonical_id IS NULL THEN
                        INSERT INTO school_classes
                            (school_id, name, code, grade, student_count, capacity,
                             level_id, class_teacher_id, academic_year_id, status, created_at)
                        VALUES
                            (NEW.school_id, NEW.name, upper(trim(NEW.code)), NULL,
                             NEW.student_count, 45, NEW.level_id, NEW.class_teacher_id,
                             NEW.academic_year_id, 'active', CURRENT_TIMESTAMP)
                        RETURNING id INTO canonical_id;
                    END IF;
                    NEW.school_class_id := canonical_id;
                END IF;

                UPDATE school_classes
                   SET name = NEW.name,
                       code = upper(trim(NEW.code)),
                       student_count = NEW.student_count,
                       level_id = NEW.level_id,
                       class_teacher_id = NEW.class_teacher_id,
                       academic_year_id = NEW.academic_year_id,
                       status = 'active',
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = NEW.school_class_id
                   AND school_id = NEW.school_id;

                RETURN NEW;
            END IF;

            IF TG_OP = 'DELETE' THEN
                IF OLD.school_class_id IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM student_enrollments e
                        WHERE e.school_class_id = OLD.school_class_id
                   ) THEN
                    DELETE FROM school_classes WHERE id = OLD.school_class_id;
                END IF;
                RETURN OLD;
            END IF;

            RETURN NEW;
        END;
        $$;
    """))

    bind.execute(sa.text("""
        DROP TRIGGER IF EXISTS trg_sync_tt_class_to_school_class ON tt_classes;
        CREATE TRIGGER trg_sync_tt_class_to_school_class
        BEFORE INSERT OR UPDATE OR DELETE ON tt_classes
        FOR EACH ROW EXECUTE FUNCTION sync_tt_class_to_school_class();
    """))


def downgrade():
    bind = op.get_bind()
    bind.execute(sa.text("DROP TRIGGER IF EXISTS trg_sync_tt_class_to_school_class ON tt_classes"))
    bind.execute(sa.text("DROP FUNCTION IF EXISTS sync_tt_class_to_school_class()"))
