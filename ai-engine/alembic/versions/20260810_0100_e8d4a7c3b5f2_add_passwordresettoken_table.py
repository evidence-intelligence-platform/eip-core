"""add passwordresettoken table

Revision ID: e8d4a7c3b5f2
Revises: 'a3f6c2d9e8b1'
Create Date: 2026-08-10 01:00:00.000000

Password reset flow (LAUNCH_READINESS launch blocker #2): a user who forgets
their password today has no recourse at all. Tokens are stored as SHA-256
hashes so a database leak cannot be replayed as working reset links.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8d4a7c3b5f2'
down_revision: Union[str, None] = 'a3f6c2d9e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "passwordresettoken",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("useraccount.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_passwordresettoken_user_id", "passwordresettoken", ["user_id"])
    op.create_index(
        "ix_passwordresettoken_token_hash", "passwordresettoken", ["token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_passwordresettoken_token_hash", table_name="passwordresettoken")
    op.drop_index("ix_passwordresettoken_user_id", table_name="passwordresettoken")
    op.drop_table("passwordresettoken")
