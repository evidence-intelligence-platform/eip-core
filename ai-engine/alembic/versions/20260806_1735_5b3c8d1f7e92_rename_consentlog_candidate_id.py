"""rename consentlog.candidate_id to candidate_external_id

Revision ID: 5b3c8d1f7e92
Revises: 'd7e2b9f4a816'
Create Date: 2026-08-06 17:35:00.000000

The init migration created consentlog.candidate_id, but the ORM model reads
and writes ConsentLog.candidate_external_id. Same drift mechanism as
confidence_score: create_all-provisioned SQLite databases already have the
correct name, so only strictly Alembic-provisioned databases carry the old
one. The index is renamed too so it matches what create_all would generate.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '5b3c8d1f7e92'
down_revision: Union[str, None] = 'd7e2b9f4a816'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_consentlog_candidate_id", table_name="consentlog")
    with op.batch_alter_table("consentlog") as batch:
        batch.alter_column("candidate_id", new_column_name="candidate_external_id")
    op.create_index(
        "ix_consentlog_candidate_external_id", "consentlog", ["candidate_external_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_consentlog_candidate_external_id", table_name="consentlog")
    with op.batch_alter_table("consentlog") as batch:
        batch.alter_column("candidate_external_id", new_column_name="candidate_id")
    op.create_index("ix_consentlog_candidate_id", "consentlog", ["candidate_id"])
