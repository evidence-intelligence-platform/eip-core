"""add useraccount company profile

Revision ID: c4a9f1e2d7b8
Revises: 'e8d4a7c3b5f2'
Create Date: 2026-08-10 17:00:00.000000

Everyone registers with a personal e-mail. Employers additionally supply a
verifiable company profile at sign-up: legal name, tax number (required),
headcount band, and — only when the team exceeds five people — a corporate
e-mail. All nullable so candidate accounts leave them empty.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a9f1e2d7b8'
down_revision: Union[str, None] = 'e8d4a7c3b5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("useraccount") as batch:
        batch.add_column(sa.Column("company_name", sa.String(), nullable=True))
        batch.add_column(sa.Column("tax_number", sa.String(), nullable=True))
        batch.add_column(sa.Column("company_size", sa.String(), nullable=True))
        batch.add_column(sa.Column("company_email", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("useraccount") as batch:
        batch.drop_column("company_email")
        batch.drop_column("company_size")
        batch.drop_column("tax_number")
        batch.drop_column("company_name")
