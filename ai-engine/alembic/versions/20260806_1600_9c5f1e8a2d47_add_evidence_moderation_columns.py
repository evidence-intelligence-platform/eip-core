"""add evidence moderation columns

Revision ID: 9c5f1e8a2d47
Revises: '20e4b27ddc6c'
Create Date: 2026-08-06 16:00:00.000000

Local SQLite developers: run "alembic upgrade head" (or delete database.db and
let startup recreate the schema) — otherwise Evidence queries fail with
"no such column: review_status".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '9c5f1e8a2d47'
down_revision: Union[str, None] = '20e4b27ddc6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Evidence moderation: uploaded images and scanned PDFs wait for a human
    # verdict. Existing rows predate uploads-with-media, so backfilling them
    # as "approved" preserves their behaviour.
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(
            sa.Column(
                "review_status",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=False,
                server_default="approved",
            )
        )
        batch.add_column(sa.Column("media_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column("media_mime", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column("media_filename", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column("reviewed_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("review_note", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.create_index("ix_evidence_review_status", ["review_status"])


def downgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.drop_index("ix_evidence_review_status")
        batch.drop_column("review_note")
        batch.drop_column("reviewed_at")
        batch.drop_column("reviewed_by")
        batch.drop_column("media_filename")
        batch.drop_column("media_mime")
        batch.drop_column("media_path")
        batch.drop_column("review_status")
