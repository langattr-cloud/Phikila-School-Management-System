"""Restore the production migration-chain marker.

The production database records revision ``3c1551cada12``, but that revision
was removed from the repository. The live schema already contains the schema
covered by ``43fea8e527aa``; this compatibility revision restores the missing
history marker without changing database objects.

Revision ID: 3c1551cada12
Revises: 43fea8e527aa
Create Date: 2026-08-16
"""

from alembic import op

revision = "3c1551cada12"
down_revision = "43fea8e527aa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Compatibility-only revision. The database already contains the schema
    # represented by 43fea8e527aa.
    pass


def downgrade() -> None:
    # Compatibility-only revision; there are no schema operations to reverse.
    pass
