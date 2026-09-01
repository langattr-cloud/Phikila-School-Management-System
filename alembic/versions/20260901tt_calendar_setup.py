"""Add editable short labels and optional date values to timetable calendar."""
from alembic import op
import sqlalchemy as sa

revision = "20260901tt_calendar_setup"
down_revision = "20260901tt_display_mode"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('tt_periods', sa.Column('short_form', sa.String(20), nullable=False, server_default=''))
    op.add_column('tt_days', sa.Column('short_form', sa.String(20), nullable=False, server_default=''))
    op.add_column('tt_days', sa.Column('date_value', sa.Date(), nullable=True))

def downgrade():
    op.drop_column('tt_days', 'date_value')
    op.drop_column('tt_days', 'short_form')
    op.drop_column('tt_periods', 'short_form')
