"""Persist whether a timetable type/version is day- or date-based."""
from alembic import op
import sqlalchemy as sa
revision = "20260901tt_display_mode"
down_revision = "20260901tt_types"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('tt_timetable_types', sa.Column('display_mode', sa.String(10), nullable=False, server_default='day'))
    op.add_column('tt_versions', sa.Column('display_mode', sa.String(10), nullable=False, server_default='day'))

def downgrade():
    op.drop_column('tt_versions', 'display_mode')
    op.drop_column('tt_timetable_types', 'display_mode')
