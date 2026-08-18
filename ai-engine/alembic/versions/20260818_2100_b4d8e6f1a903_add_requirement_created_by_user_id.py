"""add requirement.created_by_user_id

Revision ID: b4d8e6f1a903
Revises: 'a7c2e5f8b3d1'
Create Date: 2026-08-18 21:00:00.000000

Requirements were listed and matched globally, so any signed-in employer
could read every other employer's hiring criteria. Nullable: requirements
created before this column (including job-linked req_job_<n> rows minted
pre-migration) have no attributable owner and are deliberately left in place.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d8e6f1a903'
down_revision: Union[str, None] = 'a7c2e5f8b3d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("requirement") as batch:
        batch.add_column(sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        batch.create_index("ix_requirement_created_by_user_id", ["created_by_user_id"])
        batch.create_foreign_key(
            "fk_requirement_created_by_user_id", "useraccount", ["created_by_user_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("requirement") as batch:
        batch.drop_constraint("fk_requirement_created_by_user_id", type_="foreignkey")
        batch.drop_index("ix_requirement_created_by_user_id")
        batch.drop_column("created_by_user_id")
