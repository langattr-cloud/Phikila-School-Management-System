"""add columns to academic_years

Revision ID: 4c7888868b57
Revises: 00581779dc5c
Create Date: 2026-08-02 19:28:41.919098

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '4c7888868b57'
down_revision: Union[str, Sequence[str], None] = '00581779dc5c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# PostgreSQL enum is shared by several columns in this revision. Creating it
# through each sa.Enum instance makes the second CREATE TYPE fail.
STATUS_ENUM = postgresql.ENUM(
    'ACTIVE', 'INACTIVE', 'ARCHIVED', name='statusenum', create_type=False
)


def upgrade() -> None:
    """Upgrade schema."""
    # Create the shared enum exactly once before any table/column uses it.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'statusenum'
            ) THEN
                CREATE TYPE statusenum AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
            END IF;
        END
        $$;
    """)

    op.create_table('academic_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('value', sa.String(length=255), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )
    op.create_index(op.f('ix_academic_settings_id'), 'academic_settings', ['id'], unique=False)
    op.create_table('curriculums',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('education_system', sa.String(length=100), nullable=False),
    sa.Column('effective_date', sa.Date(), nullable=False),
    sa.Column('status', STATUS_ENUM, nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_curriculums_id'), 'curriculums', ['id'], unique=False)
    op.create_table('subjects',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code'),
    sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_subjects_id'), 'subjects', ['id'], unique=False)
    op.create_table('level_subjects',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('level_id', sa.Integer(), nullable=False),
    sa.Column('subject_id', sa.Integer(), nullable=False),
    sa.Column('lessons_per_week', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['level_id'], ['levels.id'], ),
    sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_level_subjects_id'), 'level_subjects', ['id'], unique=False)
    op.create_table('terms',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('academic_year_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('status', STATUS_ENUM, nullable=True),
    sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_terms_id'), 'terms', ['id'], unique=False)
    op.add_column('academic_years', sa.Column('name', sa.String(length=50), nullable=False))
    op.add_column('academic_years', sa.Column('start_date', sa.Date(), nullable=False))
    op.add_column('academic_years', sa.Column('end_date', sa.Date(), nullable=False))
    op.add_column('academic_years', sa.Column('is_current', sa.Boolean(), nullable=True))
    op.add_column('academic_years', sa.Column('status', STATUS_ENUM, nullable=True))
    op.drop_index(op.f('ix_academic_years_year'), table_name='academic_years')
    op.create_unique_constraint(None, 'academic_years', ['name'])
    op.drop_column('academic_years', 'year')
    op.add_column('levels', sa.Column('display_order', sa.Integer(), nullable=False))
    op.add_column('levels', sa.Column('status', STATUS_ENUM, nullable=True))
    op.alter_column('levels', 'name',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.alter_column('levels', 'code',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.drop_index(op.f('ix_levels_name'), table_name='levels')
    op.create_unique_constraint(None, 'levels', ['name'])
    op.create_unique_constraint(None, 'levels', ['code'])
    op.add_column('streams', sa.Column('capacity', sa.Integer(), nullable=True))
    op.add_column('streams', sa.Column('status', STATUS_ENUM, nullable=True))
    op.alter_column('streams', 'level_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.alter_column('streams', 'name',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.drop_index(op.f('ix_streams_name'), table_name='streams')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_index(op.f('ix_streams_name'), 'streams', ['name'], unique=False)
    op.alter_column('streams', 'name',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('streams', 'level_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.drop_column('streams', 'status')
    op.drop_column('streams', 'capacity')
    op.drop_constraint(None, 'levels', type_='unique')
    op.drop_constraint(None, 'levels', type_='unique')
    op.create_index(op.f('ix_levels_name'), 'levels', ['name'], unique=False)
    op.alter_column('levels', 'code',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('levels', 'name',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.drop_column('levels', 'status')
    op.drop_column('levels', 'display_order')
    op.add_column('academic_years', sa.Column('year', sa.VARCHAR(), autoincrement=False, nullable=True))
    op.drop_constraint(None, 'academic_years', type_='unique')
    op.create_index(op.f('ix_academic_years_year'), 'academic_years', ['year'], unique=True)
    op.drop_column('academic_years', 'status')
    op.drop_column('academic_years', 'is_current')
    op.drop_column('academic_years', 'end_date')
    op.drop_column('academic_years', 'start_date')
    op.drop_column('academic_years', 'name')
    op.drop_index(op.f('ix_terms_id'), table_name='terms')
    op.drop_table('terms')
    op.drop_index(op.f('ix_level_subjects_id'), table_name='level_subjects')
    op.drop_table('level_subjects')
    op.drop_index(op.f('ix_subjects_id'), table_name='subjects')
    op.drop_table('subjects')
    op.drop_index(op.f('ix_curriculums_id'), table_name='curriculums')
    op.drop_table('curriculums')
    op.drop_index(op.f('ix_academic_settings_id'), table_name='academic_settings')
    op.drop_table('academic_settings')
    op.execute("DROP TYPE IF EXISTS statusenum")
