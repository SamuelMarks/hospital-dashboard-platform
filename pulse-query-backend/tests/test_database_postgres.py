"""
Tests for PostgreSQL dependency helpers, SQLite compatibility type compilers,
and full Alembic migration lifecycle (`alembic/env.py` and `alembic/versions/*.py`).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import TracebackType
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest

from app.database import postgres
from app.models import register_orm_models

type ExcType = type[BaseException] | None
type ExcVal = BaseException | None
type ExcTb = TracebackType | None


class _DummyContext:
  """Async context manager test double yielding a pre-configured session object."""

  def __init__(self, session: AsyncMock) -> None:
    """
    Initializes the dummy context manager with a mock session.

    Args:
        session (AsyncMock): Mock async database session.
    """
    self._session = session

  async def __aenter__(self) -> AsyncMock:
    """
    Enters the async context and returns the mock session.

    Returns:
        AsyncMock: Configured mock session.
    """
    return self._session

  async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> bool:
    """
    Exits the async context without suppressing exceptions.

    Args:
        exc_type (ExcType): Exception type if raised.
        exc (ExcVal): Exception instance if raised.
        tb (ExcTb): Traceback if raised.

    Returns:
        bool: Always False so exceptions propagate.
    """
    _ = (exc_type, exc, tb)
    return False


def test_register_orm_models() -> None:
  """Verifies `register_orm_models` returns all registered SQLAlchemy declarative model classes."""
  models = register_orm_models()
  model_names = {cls.__name__ for cls in models}
  assert {
    "AdminSetting",
    "AlertRule",
    "Conversation",
    "Dashboard",
    "DashboardShare",
    "ExperimentLog",
    "Message",
    "MessageCandidate",
    "ModelCandidate",
    "OptimizationIteration",
    "OptimizationSession",
    "OptimizationUserSurvey",
    "RefreshToken",
    "User",
    "Widget",
    "WidgetTemplate",
  }.issubset(model_names)


@pytest.mark.asyncio
async def test_get_db_yields_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
  """Ensure `get_db` yields a session and closes it on teardown."""
  session = AsyncMock()
  monkeypatch.setattr(postgres, "AsyncSessionLocal", lambda: _DummyContext(session))

  generator = postgres.get_db()
  yielded = await anext(generator)

  assert yielded is session
  await generator.aclose()

  session.close.assert_awaited_once()


def test_sqlite_type_compilers() -> None:
  """Verifies `compile_jsonb_sqlite`, `compile_uuid_sqlite`, and `register_sqlite_type_compilers`."""
  postgres.register_sqlite_type_compilers()
  assert postgres.compile_jsonb_sqlite() == "JSON"
  assert postgres.compile_uuid_sqlite() == "TEXT"


@pytest.mark.asyncio
async def test_validate_postgres_duckdb_and_config_results(monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `validate_postgres_connection_result`, `validate_duckdb_storage_result`, and `check_configuration_hygiene_result`."""
  from app.core.diagnostics import check_configuration_hygiene_result
  from app.core.result import Err, ErrorCode, Ok
  from app.database.duckdb import duckdb_manager

  # Postgres Ok & Err
  monkeypatch.setattr(postgres, "validate_postgres_connection", AsyncMock(return_value={"status": "connected"}))
  pg_ok = await postgres.validate_postgres_connection_result()
  assert isinstance(pg_ok, Ok)

  monkeypatch.setattr(
    postgres,
    "validate_postgres_connection",
    AsyncMock(return_value={"status": "error", "error": "refused"}),
  )
  pg_err = await postgres.validate_postgres_connection_result()
  assert isinstance(pg_err, Err)
  assert pg_err.error.code == ErrorCode.POSTGRES_UNAVAILABLE

  # DuckDB Ok & Err
  monkeypatch.setattr(duckdb_manager, "validate_duckdb_storage", lambda: {"status": "ready"})
  dd_ok = duckdb_manager.validate_duckdb_storage_result()
  assert isinstance(dd_ok, Ok)

  monkeypatch.setattr(duckdb_manager, "validate_duckdb_storage", lambda: {"status": "error", "error": "locked"})
  dd_err = duckdb_manager.validate_duckdb_storage_result()
  assert isinstance(dd_err, Err)
  assert dd_err.error.code == ErrorCode.DUCKDB_STORAGE_ERROR

  # Config Hygiene Ok & Err
  class _DummySettings:
    """Dummy settings test double with a non-empty SECRET_KEY."""

    SECRET_KEY = "valid-secret"
    LLM_SWARM: list[dict[str, str]] = []

  assert isinstance(check_configuration_hygiene_result(_DummySettings()), Ok)

  class _EmptySecretSettings:
    """Dummy settings test double with a blank SECRET_KEY."""

    SECRET_KEY = "   "
    LLM_SWARM: list[dict[str, str]] = []

  cfg_err = check_configuration_hygiene_result(_EmptySecretSettings())
  assert isinstance(cfg_err, Err)
  assert cfg_err.error.code == ErrorCode.CONFIGURATION_ERROR


def test_alembic_sqlite_upgrade_commits_all_migrations(
  tmp_path: pytest.TempPathFactory,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """
  Verifies that running Alembic `upgrade head`, `downgrade base`, and offline/dialect branches
  against `alembic/env.py` and all `alembic/versions/*.py` executes every migration path cleanly.

  Args:
      tmp_path (pytest.TempPathFactory): Temporary directory fixture.
      monkeypatch (pytest.MonkeyPatch): Pytest monkeypatch helper.
  """
  import contextlib
  import sqlite3

  from alembic import command, context
  from alembic.config import Config

  from app.core.config import BACKEND_ROOT, settings

  db_file = Path(str(tmp_path)) / "test_alembic_commit.db"
  sqlite_uri = f"sqlite+aiosqlite:///{db_file}"

  # Seed a legacy pre-Alembic `users` table without `is_admin` or `alembic_version`
  with contextlib.closing(sqlite3.connect(str(db_file))) as legacy_conn:
    legacy_conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, email VARCHAR NOT NULL)")
    legacy_conn.commit()

  monkeypatch.setattr(type(settings), "SQLALCHEMY_DATABASE_URI", property(lambda _self: sqlite_uri))

  alembic_cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
  alembic_cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))

  # 1. Upgrade up to head
  command.upgrade(alembic_cfg, "head")

  with contextlib.closing(sqlite3.connect(str(db_file))) as conn:
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").fetchall()}
    assert "alembic_version" in tables
    assert "users" in tables
    assert "admin_settings" in tables
    assert "dashboards" in tables
    assert "widgets" in tables
    assert "widget_templates" in tables
    assert "templates" in tables

    user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    assert {"id", "email", "hashed_password", "is_active", "is_admin", "role", "language_preference"}.issubset(user_cols)

    version_rows = conn.execute("SELECT version_num FROM alembic_version").fetchall()
    assert version_rows == [("014",)]

  # 2. Run upgrade("head") again when `alembic_version` already exists (exercises false branch in do_run_migrations)
  command.upgrade(alembic_cfg, "head")

  # 3. Exercise `downgrade` across all revisions (`head` -> `base`) using op.drop_column mock on SQLite
  with patch("alembic.op.drop_column") as mock_drop_col:
    command.downgrade(alembic_cfg, "base")
    assert mock_drop_col.call_count >= 3

  # 4. Exercise `alembic/env.py` offline mode and `config.config_file_name is None` branch
  env_path = BACKEND_ROOT / "alembic" / "env.py"
  spec_env = importlib.util.spec_from_file_location("alembic_env_test", env_path)
  assert spec_env is not None
  assert spec_env.loader is not None
  mock_cfg = Config()
  mock_cfg.config_file_name = None
  with (
    patch.object(context, "config", mock_cfg, create=True),
    patch.object(context, "is_offline_mode", return_value=True, create=True),
    patch.object(context, "configure", create=True) as mock_ctx_configure,
    patch.object(context, "begin_transaction", create=True),
    patch.object(context, "run_migrations", create=True) as mock_ctx_run,
  ):
    env_mod = importlib.util.module_from_spec(spec_env)
    spec_env.loader.exec_module(env_mod)
    mock_ctx_configure.assert_called_once()
    mock_ctx_run.assert_called_once()

  # 5. Exercise `002_add_templates.py` postgresql dialect branch and `012_migrate_visit_id_to_visit_type.py` data branches
  from alembic.script import ScriptDirectory

  script_dir = ScriptDirectory.from_config(alembic_cfg)
  mod_002 = script_dir.get_revision("002").module

  pg_bind = MagicMock()
  pg_bind.dialect.name = "postgresql"
  with (
    patch("alembic.op.create_table", create=True),
    patch("alembic.op.create_index", create=True),
    patch("alembic.op.f", side_effect=lambda x: x, create=True),
    patch("alembic.op.get_bind", return_value=pg_bind, create=True),
    patch("alembic.op.execute", create=True) as mock_exec_002,
  ):
    mod_002.upgrade()
    mock_exec_002.assert_called_with("CREATE OR REPLACE VIEW templates AS SELECT * FROM widget_templates")

  mod_012 = script_dir.get_revision("012").module

  # Raw string JSON branch, invalid JSON string branch, dict match branch, and dict non-match branch in 012
  str_bind = MagicMock()
  str_bind.execute.return_value.fetchall.return_value = [
    (uuid.uuid4(), '{"query": "SELECT Visit_ID FROM t"}'),
    (uuid.uuid4(), "{bad-json"),
    (uuid.uuid4(), {"query": "SELECT Visit_ID FROM t2"}),
    (uuid.uuid4(), {"query": "SELECT 1"}),
  ]
  with patch("alembic.op.get_bind", return_value=str_bind):
    mod_012.upgrade()
    assert str_bind.execute.call_count == 3

  # Outer exception branch in 012
  err_bind = MagicMock()
  err_bind.execute.side_effect = RuntimeError("db unavailable")
  with patch("alembic.op.get_bind", return_value=err_bind):
    mod_012.upgrade()
