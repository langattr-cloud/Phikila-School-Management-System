"""Point finance receipt student references at the active students_v2 table.

The live payments and invoices use students_v2, but a legacy FK on
finance_receipts.student_id still points at students. This prevents matched
SMS payments from issuing receipts for valid students.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261010receiptfk"
down_revision = ("f8a1c2d3e4b5", "20260908mergeheads")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "finance_receipts" not in tables or "students_v2" not in tables:
        raise RuntimeError(
            "Cannot fix finance receipt student FK: finance_receipts or students_v2 is missing."
        )

    foreign_keys = inspector.get_foreign_keys("finance_receipts")
    student_fk = next(
        (fk for fk in foreign_keys
         if fk.get("constrained_columns") == ["student_id"]),
        None,
    )
    if student_fk and student_fk.get("referred_table") == "students_v2":
        return

    if student_fk and student_fk.get("name"):
        op.drop_constraint(
            student_fk["name"],
            "finance_receipts",
            type_="foreignkey",
        )

    op.create_foreign_key(
        "finance_receipts_student_id_fkey",
        "finance_receipts",
        "students_v2",
        ["student_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # The previous target (students) does not contain all active students_v2
    # records, so restoring that FK can fail and would reintroduce the bug.
    pass
