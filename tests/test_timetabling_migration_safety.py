"""Regression tests for timetable migration safety and revision ordering."""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "alembic" / "versions"


def _source(name: str) -> str:
    return (MIGRATIONS / name).read_text(encoding="utf-8")


def _assignment(source: str, variable: str) -> str:
    match = re.search(rf"^{variable}\s*=\s*['\"]([^'\"]+)['\"]", source, re.MULTILINE)
    assert match, f"Missing {variable} declaration"
    return match.group(1)


def test_legacy_timetable_reset_is_non_destructive():
    source = _source("20261022_remove_legacy_timetable_module.py")
    upgrade = source.split("def upgrade() -> None:", 1)[1].split("def downgrade()", 1)[0]
    assert "op.drop_table" not in upgrade
    assert "op.drop_column" not in upgrade
    assert "op.execute" not in upgrade
    assert re.search(r"def upgrade\(\) -> None:\s*#.*?\bpass\b", source, re.DOTALL)


def test_timetable_migration_chain_is_linear_and_expected():
    reset = _source("20261022_remove_legacy_timetable_module.py")
    timetable = _source("20261023_timetabling_phase1.py")
    ownership = _source("20261023_add_canonical_school_ownership.py")

    assert _assignment(reset, "revision") == "20261022timetable_reset"
    assert _assignment(timetable, "down_revision") == _assignment(reset, "revision")
    assert _assignment(timetable, "revision") == "20261023ttb01"
    assert _assignment(ownership, "down_revision") == _assignment(timetable, "revision")
    assert _assignment(ownership, "revision") == "20261023own01"


def test_ownership_migration_uses_school_primary_key_type_and_nullable_legacy_fields():
    source = _source("20261023_add_canonical_school_ownership.py")
    assert source.count('sa.Column("school_id", sa.Integer(), sa.ForeignKey("school_info.id"), nullable=True)') == 2
    assert 'op.create_index("ix_teachers_school_id", "teachers", ["school_id"])' in source
    assert 'op.create_index("ix_subjects_school_id", "subjects", ["school_id"])' in source


def test_timetable_phase_one_only_creates_and_drops_new_ttb_tables():
    source = _source("20261023_timetabling_phase1.py")
    for table in ("ttb_projects", "ttb_periods", "ttb_lesson_requirements", "ttb_constraints", "ttb_versions"):
        assert f'"{table}"' in source
    assert "op.drop_table(\"teachers\")" not in source
    assert "op.drop_table(\"subjects\")" not in source
    assert "op.drop_table(\"school_info\")" not in source
