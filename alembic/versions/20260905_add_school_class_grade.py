"""Add the grade column expected by the SchoolClass ORM model.

The production database can contain school_classes rows created by an older
schema that did not include the optional grade field. Keep the migration
nullable so existing classes remain valid.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260905classgrade"
down_revision = "20260904ttprojects"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "school_classes",
        sa.Column("grade", sa.String(length=100), nullable=True),
    )


def downgrade():
    op.drop_column("school_classes", "grade")
