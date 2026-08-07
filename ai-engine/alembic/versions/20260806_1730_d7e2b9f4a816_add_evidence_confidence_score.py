"""add evidence confidence_score

Revision ID: d7e2b9f4a816
Revises: '9c5f1e8a2d47'
Create Date: 2026-08-06 17:30:00.000000

Evidence.confidence_score has existed on the ORM model, but no migration
ever created the column. Local SQLite developers never hit this because
startup create_all builds the full schema; databases provisioned strictly
via Alembic (Postgres in production) were missing the column and would
crash on the first Evidence insert.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e2b9f4a816'
down_revision: Union[str, None] = '9c5f1e8a2d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(sa.Column("confidence_score", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.drop_column("confidence_score")
