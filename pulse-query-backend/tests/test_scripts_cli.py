"""
Unit and integration tests for CLI utility scripts in `pulse-query-backend/scripts/`.

Covers:
1. `scripts/extract_openapi.py`
2. `scripts/generate_mpax_benchmarks.py`
3. `scripts/ingest.py`
4. `scripts/seed_templates.py`
"""

import asyncio
from collections.abc import Coroutine
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import duckdb
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.duckdb import duckdb_manager
from app.models.template import WidgetTemplate
from scripts import extract_openapi as extract_openapi_mod
from scripts import generate_mpax_benchmarks as gen_mpax_mod
from scripts import ingest as ingest_mod
from scripts import seed_templates as seed_templates_mod


def test_extract_openapi_and_main(tmp_path: Path) -> None:
  """Verify OpenAPI schema extraction creates parent directories and writes valid JSON."""
  nested_out = tmp_path / "nested" / "openapi.json"
  extract_openapi_mod.main(["--output", str(nested_out)])
  assert nested_out.exists()
  data = json.loads(nested_out.read_text(encoding="utf-8"))
  assert "openapi" in data
  assert "paths" in data

  plain_file = tmp_path / "plain.json"
  with patch("scripts.extract_openapi.os.path.dirname", return_value=""):
    extract_openapi_mod.extract_openapi(str(plain_file))
  assert plain_file.exists()


def test_generate_mpax_benchmarks_and_main(tmp_path: Path) -> None:
  """Verify MPAX benchmark scenario generation and CLI main entrypoint."""
  scenarios = gen_mpax_mod.generate_scenarios(count=25)
  assert len(scenarios) == 25
  assert all("expected_metrics" in s for s in scenarios)
  assert any(s["complexity"] == "High" for s in scenarios)
  assert any(s["complexity"] == "Medium" for s in scenarios)

  custom_out = tmp_path / "sub" / "mpax.json"
  written_path = gen_mpax_mod.main(out_file=custom_out, count=5)
  assert written_path == custom_out
  assert len(json.loads(custom_out.read_text(encoding="utf-8"))) == 5

  with (
    patch.object(Path, "mkdir"),
    patch("builtins.open", MagicMock()),
    patch("scripts.generate_mpax_benchmarks.json.dump"),
  ):
    default_path = gen_mpax_mod.main(out_file=None, count=2)
    assert default_path.name == "mpax_benchmark_scenarios.json"


def test_ingest_script_main(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify manual ingestion CLI wrapper ingests required CSVs into a temporary DuckDB file and exits on failure."""
  data_dir = tmp_path / "ingest_data"
  data_dir.mkdir()
  csv_file = data_dir / "hospital_data.csv"
  transfers_file = data_dir / "Synthetic_hospital_data_transfers.csv"
  nl = chr(10)
  csv_file.write_text(f"Clinical_Service,Entry_Point{nl}Cardiology,ER{nl}Neurology,Transfer{nl}", encoding="utf-8")
  transfers_file.write_text(f"CSN,Transfer_In_Unit{nl}101,ICU{nl}102,PCU{nl}", encoding="utf-8")

  temp_duckdb = str(tmp_path / "cli_ingest.duckdb")
  monkeypatch.setattr("app.services.data_ingestion.DATA_DIR", str(data_dir))
  monkeypatch.setattr(duckdb_manager, "db_path", temp_duckdb)

  ingest_mod.main()

  conn = duckdb.connect(temp_duckdb, read_only=True)
  try:
    row = conn.execute("SELECT COUNT(*) FROM hospital_data").fetchone()
    assert row is not None
    assert row[0] == 2
  finally:
    conn.close()

  # Missing required table should exit 1
  with patch("scripts.ingest.data_ingestion_service.ingest_data", return_value=["hospital_data"]):
    with pytest.raises(SystemExit) as exc_missing:
      ingest_mod.main()
    assert exc_missing.value.code == 1

  # Zero rows in required table should exit 1
  empty_conn = MagicMock()
  empty_conn.execute.return_value.fetchone.return_value = (0,)
  with (
    patch(
      "scripts.ingest.data_ingestion_service.ingest_data",
      return_value=["hospital_data", "Synthetic_hospital_data_transfers"],
    ),
    patch("scripts.ingest.duckdb_manager.get_readonly_connection", return_value=empty_conn),
  ):
    with pytest.raises(SystemExit) as exc_zero:
      ingest_mod.main()
    assert exc_zero.value.code == 1

  with patch("scripts.ingest.data_ingestion_service.ingest_data", side_effect=RuntimeError("disk full")):
    with pytest.raises(SystemExit) as exc:
      ingest_mod.main()
    assert exc.value.code == 1


@pytest.mark.asyncio
async def test_seed_templates_script(tmp_path: Path, db_session: AsyncSession) -> None:
  """Verify `seed_templates` script persists and updates real `WidgetTemplate` records."""
  missing_path = str(tmp_path / "missing.json")
  assert seed_templates_mod._read_templates_disk(missing_path) is None

  existing_tmpl = WidgetTemplate(
    title="Existing Template",
    description="Old desc",
    sql_template="SELECT 0",
    category="Legacy",
    parameters_schema={},
  )
  db_session.add(existing_tmpl)
  await db_session.commit()

  valid_file = tmp_path / "templates.json"
  valid_file.write_text(
    json.dumps(
      [
        {
          "title": "Existing Template",
          "description": "Updated desc",
          "sql_template": "SELECT 1",
          "category": "Ops",
          "parameters_schema": {},
        },
        {
          "title": "New Template",
          "description": None,
          "sql_template": "SELECT 2",
          "category": "Clinical",
        },
      ]
    ),
    encoding="utf-8",
  )

  # 1. Missing DATA_FILE branch
  with patch.object(seed_templates_mod, "DATA_FILE", missing_path):
    await seed_templates_mod.seed_templates()

  # 2. Invalid JSON branch
  bad_json_file = tmp_path / "bad.json"
  bad_json_file.write_text("{broken json", encoding="utf-8")
  with patch.object(seed_templates_mod, "DATA_FILE", str(bad_json_file)):
    await seed_templates_mod.seed_templates()

  # 3. Successful seed against real test DB session
  session_cm = MagicMock()
  session_cm.__aenter__ = AsyncMock(return_value=db_session)
  session_cm.__aexit__ = AsyncMock(return_value=False)

  with (
    patch.object(seed_templates_mod, "DATA_FILE", str(valid_file)),
    patch.object(seed_templates_mod, "AsyncSessionLocal", return_value=session_cm),
  ):
    await seed_templates_mod.seed_templates()

  rows = (await db_session.execute(select(WidgetTemplate))).scalars().all()
  by_title = {r.title: r for r in rows}
  assert "Existing Template" in by_title
  assert by_title["Existing Template"].description == "Updated desc"
  assert by_title["Existing Template"].sql_template == "SELECT 1"
  assert "New Template" in by_title
  assert by_title["New Template"].sql_template == "SELECT 2"

  # Direct upsert_template wrapper
  await seed_templates_mod.upsert_template(
    db_session,
    {"title": "Direct Wrapper Template", "description": "Direct", "sql_template": "SELECT 3", "category": "Ops"},
  )
  await db_session.commit()
  direct_row = (
    (await db_session.execute(select(WidgetTemplate).where(WidgetTemplate.title == "Direct Wrapper Template")))
    .scalars()
    .first()
  )
  assert direct_row is not None
  assert direct_row.sql_template == "SELECT 3"

  # 4. Database error rollback branch
  mock_err_session = AsyncMock()
  mock_err_session.execute = AsyncMock(side_effect=RuntimeError("db down"))
  mock_err_cm = MagicMock()
  mock_err_cm.__aenter__ = AsyncMock(return_value=mock_err_session)
  mock_err_cm.__aexit__ = AsyncMock(return_value=False)

  with (
    patch.object(seed_templates_mod, "DATA_FILE", str(valid_file)),
    patch.object(seed_templates_mod, "AsyncSessionLocal", return_value=mock_err_cm),
  ):
    await seed_templates_mod.seed_templates()
    mock_err_session.rollback.assert_awaited_once()

  # 5. CLI main() executes real seed_templates against db_session via running loop
  cli_file = tmp_path / "cli_templates.json"
  cli_file.write_text(
    json.dumps(
      [{"title": "CLI Main Template", "description": "From CLI", "sql_template": "SELECT 42", "category": "CLI"}]
    ),
    encoding="utf-8",
  )
  loop = asyncio.get_running_loop()
  spawned_tasks: list[asyncio.Task[None]] = []

  def _spawn_coro(coro: Coroutine[object, object, None]) -> None:
    """
    Schedules `coro` on the active event loop so `main()` executes the real coroutine.

    Args:
        coro (Coroutine[object, object, None]): Coroutine passed to `asyncio.run`.
    """
    spawned_tasks.append(loop.create_task(coro))

  with (
    patch.object(seed_templates_mod, "DATA_FILE", str(cli_file)),
    patch.object(seed_templates_mod, "AsyncSessionLocal", return_value=session_cm),
    patch("scripts.seed_templates.asyncio.run", side_effect=_spawn_coro),
  ):
    seed_templates_mod.main()
    for t in spawned_tasks:
      await t

  cli_row = (
    (await db_session.execute(select(WidgetTemplate).where(WidgetTemplate.title == "CLI Main Template")))
    .scalars()
    .first()
  )
  assert cli_row is not None
  assert cli_row.sql_template == "SELECT 42"

  with (
    patch.object(seed_templates_mod, "seed_templates", return_value=0),
    patch("scripts.seed_templates.asyncio.run", return_value=0),
  ):
    with pytest.raises(SystemExit) as exc_seed:
      seed_templates_mod.main()
    assert exc_seed.value.code == 1
