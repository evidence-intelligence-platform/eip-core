"""add candidate interests

Revision ID: a7c2e5f8b3d1
Revises: 'f2b6d9c3a1e4'
Create Date: 2026-08-10 19:00:00.000000

Candidates pick interest categories after signing up; the job feed leads with
matching sectors. Comma-separated category keys, nullable (empty = show all).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c2e5f8b3d1'
down_revision: Union[str, None] = 'f2b6d9c3a1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("candidate") as batch:
        batch.add_column(sa.Column("interests", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("candidate") as batch:
        batch.drop_column("interests")
