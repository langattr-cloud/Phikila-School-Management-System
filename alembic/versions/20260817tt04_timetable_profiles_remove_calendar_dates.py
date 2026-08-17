"""Add timetable-specific day snapshots and remove standalone calendar dates."""
from alembic import op
import sqlalchemy as sa
revision='20260817tt04'
down_revision='20260817tt03'
branch_labels=None
depends_on=None
def upgrade():
    op.add_column('tt_versions', sa.Column('day_indexes', sa.JSON(), nullable=True))
    op.add_column('tt_versions', sa.Column('day_names', sa.JSON(), nullable=True))
    op.execute("UPDATE tt_versions SET day_indexes='[]', day_names='[]' WHERE day_indexes IS NULL OR day_names IS NULL")
    op.alter_column('tt_versions','day_indexes',nullable=False)
    op.alter_column('tt_versions','day_names',nullable=False)
    op.drop_index('ix_tt_calendar_dates_date', table_name='tt_calendar_dates')
    op.drop_index('ix_tt_calendar_dates_school_id', table_name='tt_calendar_dates')
    op.drop_table('tt_calendar_dates')
def downgrade():
    op.create_table('tt_calendar_dates',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('school_id',sa.Integer(),nullable=False),sa.Column('date',sa.Date(),nullable=False),sa.Column('label',sa.String(length=120)),sa.Column('created_at',sa.DateTime(),nullable=False,server_default=sa.func.now()),sa.Column('updated_at',sa.DateTime(),nullable=False,server_default=sa.func.now()),sa.UniqueConstraint('school_id','date',name='uq_tt_calendar_date'))
    op.create_index('ix_tt_calendar_dates_school_id','tt_calendar_dates',['school_id'])
    op.create_index('ix_tt_calendar_dates_date','tt_calendar_dates',['date'])
    op.drop_column('tt_versions','day_names')
    op.drop_column('tt_versions','day_indexes')
