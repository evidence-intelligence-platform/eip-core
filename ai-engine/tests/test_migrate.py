"""
EIF: Migration Bootstrap Tests
---
The deploy step (Dockerfile: `python -m src.db.migrate && uvicorn`) must cope
with three database states: empty (Alembic builds everything), already
stamped (plain upgrade), and — the trap — a schema provisioned by SQLModel's
create_all at an OLDER version of the models. That last one has every table
but lacks the columns later migrations add to existing tables. Stamping it
as 'head' without repairing it first skips those migrations FOREVER (the
stamp says they already ran), every query touching the new columns 500s
("no such column: evidence.review_status"), and startup create_all cannot
help because it only creates missing tables, never missing columns.
"""

import os

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlmodel import Session, SQLModel, select

import src.db.migrate as migrate
from src.db.models import Evidence

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(migrate.__file__)))
_AI_ENGINE_DIR = os.path.dirname(_BASE_DIR)

# Columns added to already-existing tables by today's migrations — exactly
# what an older create_all schema is missing.
_MODERATION_COLUMNS = {
    "review_status", "media_path", "media_mime", "media_filename",
    "reviewed_by", "reviewed_at", "review_note",
}


def _alembic_head() -> str:
    cfg = Config(os.path.join(_AI_ENGINE_DIR, "alembic.ini"))
    return ScriptDirectory.from_config(cfg).get_current_head()


def _stamped_revision(engine) -> str | None:
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


def _column_names(engine, table: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def _target_engine(tmp_path, monkeypatch):
    """
    Points BOTH halves of the migrate script at a fresh file database:
    the module-level engine (used by the detection/repair path) and the
    DATABASE_URL that alembic/env.py reads for stamp/upgrade commands.
    """
    url = f"sqlite:///{tmp_path / 'migrate_test.db'}"
    engine = create_engine(url)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(migrate, "engine", engine)
    return engine


def test_legacy_create_all_schema_is_repaired_before_stamping(tmp_path, monkeypatch):
    """
    Reproduces the repo's own dev-database state: tables from an older
    create_all, no alembic stamp, moderation and posting-owner columns
    missing. The migrate step must add the missing columns and stamp head —
    not stamp a stale schema as current.
    """
    engine = _target_engine(tmp_path, monkeypatch)
    SQLModel.metadata.create_all(engine)

    # Rewind evidence and jobposting to the shape an older create_all
    # produced (confidence_score already on the ORM; moderation and posting
    # ownership not yet). SQLite refuses to DROP a column that appears in a
    # table-level FOREIGN KEY clause, so the tables are recreated outright.
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE evidence")
        conn.exec_driver_sql(
            "CREATE TABLE evidence ("
            " id INTEGER PRIMARY KEY,"
            " candidate_external_id VARCHAR NOT NULL,"
            " requirement_external_id VARCHAR NOT NULL,"
            " source_type VARCHAR NOT NULL,"
            " status VARCHAR NOT NULL,"
            " confidence_score INTEGER,"
            " reasoning VARCHAR NOT NULL,"
            " evidence_pointer VARCHAR,"
            " created_at DATETIME NOT NULL)"
        )
        conn.exec_driver_sql("DROP TABLE jobposting")
        conn.exec_driver_sql(
            "CREATE TABLE jobposting ("
            " id INTEGER PRIMARY KEY,"
            " company_id INTEGER,"
            " title VARCHAR NOT NULL,"
            " description VARCHAR NOT NULL,"
            " category VARCHAR DEFAULT 'OTHER' NOT NULL,"
            " status VARCHAR NOT NULL,"
            " created_at DATETIME NOT NULL,"
            " FOREIGN KEY(company_id) REFERENCES company (id))"
        )
        # A row that predates the moderation columns — the repair must
        # backfill it, exactly as the real migration's server_default does.
        conn.exec_driver_sql(
            "INSERT INTO evidence (candidate_external_id, requirement_external_id,"
            " source_type, status, reasoning, created_at)"
            " VALUES ('cand_legacy', 'req_legacy', 'GITHUB', 'VERIFIED',"
            " 'Eski kayit.', CURRENT_TIMESTAMP)"
        )
    assert "review_status" not in _column_names(engine, "evidence")

    migrate.run_migrations()

    assert _MODERATION_COLUMNS <= _column_names(engine, "evidence")
    assert "created_by_user_id" in _column_names(engine, "jobposting")
    # Stamped at the real head, so FUTURE migrations keep applying.
    assert _stamped_revision(engine) == _alembic_head()

    # The app's own queries work again, with the documented backfill.
    with Session(engine) as session:
        rows = session.exec(select(Evidence)).all()
        assert len(rows) == 1
        assert rows[0].review_status == "approved"
    engine.dispose()


def test_current_create_all_schema_is_stamped_without_changes(tmp_path, monkeypatch):
    """A schema that already matches the models needs only the stamp."""
    engine = _target_engine(tmp_path, monkeypatch)
    SQLModel.metadata.create_all(engine)
    columns_before = _column_names(engine, "evidence")

    migrate.run_migrations()

    assert _column_names(engine, "evidence") == columns_before
    assert _stamped_revision(engine) == _alembic_head()
    engine.dispose()


def test_empty_database_is_built_by_the_migration_chain(tmp_path, monkeypatch):
    """A fresh database must come out of the full chain at head."""
    engine = _target_engine(tmp_path, monkeypatch)

    migrate.run_migrations()

    tables = set(inspect(engine).get_table_names())
    assert {"evidence", "jobposting", "candidate", "consentlog", "useraccount"} <= tables
    assert _MODERATION_COLUMNS <= _column_names(engine, "evidence")
    assert "created_by_user_id" in _column_names(engine, "jobposting")
    # The rename migration must have run: the ORM reads candidate_external_id.
    assert "candidate_external_id" in _column_names(engine, "consentlog")
    assert _stamped_revision(engine) == _alembic_head()
    engine.dispose()


def test_stamped_database_takes_the_plain_upgrade_path(tmp_path, monkeypatch):
    """Running migrate twice must stay idempotent: stamp once, upgrade after."""
    engine = _target_engine(tmp_path, monkeypatch)
    SQLModel.metadata.create_all(engine)

    migrate.run_migrations()
    migrate.run_migrations()

    assert _stamped_revision(engine) == _alembic_head()
    engine.dispose()
