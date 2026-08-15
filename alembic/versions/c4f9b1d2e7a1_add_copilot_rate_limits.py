"""Add configurable Copilot rate limits.

Revision ID: c4f9b1d2e7a1
Revises: b7d2e9a41c08
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f9b1d2e7a1"
down_revision = "b7d2e9a41c08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tt_llm_settings", sa.Column("copilot_rate_limit", sa.Integer(), nullable=False, server_default="20"))
    op.add_column("tt_llm_settings", sa.Column("copilot_rate_window_seconds", sa.Integer(), nullable=False, server_default="3600"))


def downgrade() -> None:
    op.drop_column("tt_llm_settings", "copilot_rate_window_seconds")
    op.drop_column("tt_llm_settings", "copilot_rate_limit")
