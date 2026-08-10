"""add jobapplication standout_traits cache

Revision ID: f2b6d9c3a1e4
Revises: 'c4a9f1e2d7b8'
Create Date: 2026-08-10 18:00:00.000000

The employer dashboard shows 2-3 AI-derived standout traits per applicant.
They are computed once (LLM summary of the verified evidence, with a
deterministic fallback) and cached here as a JSON string so later loads do
not re-call the model.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b6d9c3a1e4'
down_revision: Union[str, None] = 'c4a9f1e2d7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("jobapplication") as batch:
        batch.add_column(sa.Column("standout_traits", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("jobapplication") as batch:
        batch.drop_column("standout_traits")
