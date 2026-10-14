"""Add contact fields used by supplier invoice and cheque tracking.

The finance operations module already owns finance_suppliers. These nullable
columns extend that existing table without replacing supplier records.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261014suppliercontact"
down_revision = "20261013schoolsettings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "finance_suppliers" not in inspector.get_table_names():
        # Fresh installs create the base table through the ORM model.
        return
    columns = {column["name"] for column in inspector.get_columns("finance_suppliers")}
    if "phone" not in columns:
        op.add_column("finance_suppliers", sa.Column("phone", sa.String(50), nullable=True))
    if "email" not in columns:
        op.add_column("finance_suppliers", sa.Column("email", sa.String(254), nullable=True))
    if "address" not in columns:
        op.add_column("finance_suppliers", sa.Column("address", sa.Text(), nullable=True))


def downgrade() -> None:
    # Retain contact data; dropping these columns would lose supplier details.
    pass
