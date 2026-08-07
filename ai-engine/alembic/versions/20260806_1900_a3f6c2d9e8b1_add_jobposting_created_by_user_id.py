"""add jobposting.created_by_user_id

Revision ID: a3f6c2d9e8b1
Revises: '5b3c8d1f7e92'
Create Date: 2026-08-06 19:00:00.000000

KVKK account deletion must erase "the employer's postings", which requires
knowing whose they are. Nullable: postings created before this column have no
attributable owner and are deliberately left in place on deletion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f6c2d9e8b1'
down_revision: Union[str, None] = '5b3c8d1f7e92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("jobposting") as batch:
        batch.add_column(sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        batch.create_index("ix_jobposting_created_by_user_id", ["created_by_user_id"])
        batch.create_foreign_key(
            "fk_jobposting_created_by_user_id", "useraccount", ["created_by_user_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("jobposting") as batch:
        batch.drop_constraint("fk_jobposting_created_by_user_id", type_="foreignkey")
        batch.drop_index("ix_jobposting_created_by_user_id")
        batch.drop_column("created_by_user_id")
