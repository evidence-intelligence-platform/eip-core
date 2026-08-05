"""add candidate.user_id and jobposting.category

Revision ID: 20e4b27ddc6c
Revises: '430393650f73'
Create Date: 2026-08-06 01:30:04.905715

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '20e4b27ddc6c'
down_revision: Union[str, None] = '430393650f73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Candidate.user_id: links a candidate record to the account that owns it.
    # Nullable because rows created before this migration have no known owner.
    with op.batch_alter_table("candidate") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch.create_index("ix_candidate_user_id", ["user_id"])
        batch.create_foreign_key(
            "fk_candidate_user_id", "useraccount", ["user_id"], ["id"]
        )

    # JobPosting.category: the sector filter had no column to match against.
    with op.batch_alter_table("jobposting") as batch:
        batch.add_column(
            sa.Column(
                "category",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=False,
                server_default="OTHER",
            )
        )
        batch.create_index("ix_jobposting_category", ["category"])


def downgrade() -> None:
    with op.batch_alter_table("jobposting") as batch:
        batch.drop_index("ix_jobposting_category")
        batch.drop_column("category")

    with op.batch_alter_table("candidate") as batch:
        batch.drop_constraint("fk_candidate_user_id", type_="foreignkey")
        batch.drop_index("ix_candidate_user_id")
        batch.drop_column("user_id")
