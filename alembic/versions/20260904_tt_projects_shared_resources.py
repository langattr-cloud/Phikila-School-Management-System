"""Add independent timetable projects while keeping school resources shared."""
from alembic import op
import sqlalchemy as sa

revision = "20260904ttprojects"
# Continue from the canonical merge created on 2026-09-03. The previous
# parent (20260821mergeall) created a second migration head once the later
# timetable/calendar migrations were added.
down_revision = "20260903mergeheads"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tt_projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("academic_year_id", sa.Integer(), sa.ForeignKey("academic_years.id", ondelete="SET NULL"), nullable=True),
        sa.Column("term_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("current_version_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("school_id", "name", name="uq_tt_project_name"),
    )
    op.add_column("tt_versions", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_index("ix_tt_versions_project_id", "tt_versions", ["project_id"])
    op.create_foreign_key("fk_tt_versions_project", "tt_versions", "tt_projects", ["project_id"], ["id"], ondelete="CASCADE")


def downgrade():
    op.drop_constraint("fk_tt_versions_project", "tt_versions", type_="foreignkey")
    op.drop_index("ix_tt_versions_project_id", table_name="tt_versions")
    op.drop_column("tt_versions", "project_id")
    op.drop_table("tt_projects")
