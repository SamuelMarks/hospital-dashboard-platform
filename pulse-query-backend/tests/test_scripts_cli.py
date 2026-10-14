"""
Unit tests for CLI utility scripts in `pulse-query-backend/scripts/`.

Covers:
1. `scripts/extract_openapi.py`
2. `scripts/generate_mpax_benchmarks.py`
3. `scripts/ingest.py`
4. `scripts/seed_templates.py`
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

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

  # Also test when output_dir is empty string (relative filename in cwd)
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

  # Default out_file path branch
  with (
    patch.object(Path, "mkdir"),
    patch("builtins.open", MagicMock()),
    patch("scripts.generate_mpax_benchmarks.json.dump"),
  ):
    default_path = gen_mpax_mod.main(out_file=None, count=2)
    assert default_path.name == "mpax_benchmark_scenarios.json"


def test_ingest_script_main() -> None:
  """Verify manual ingestion CLI wrapper handles success and error exit."""
  with patch.object(ingest_mod.data_ingestion_service, "ingest_all_csvs") as mock_ingest:
    ingest_mod.main()
    mock_ingest.assert_called_once()

  with patch.object(ingest_mod.data_ingestion_service, "ingest_all_csvs", side_effect=RuntimeError("disk full")):
    with pytest.raises(SystemExit) as exc:
      ingest_mod.main()
    assert exc.value.code == 1


@pytest.mark.asyncio
async def test_seed_templates_script(tmp_path: Path) -> None:
  """Verify seed_templates script file reading, upsert branches, error handling, and main()."""
  missing_path = str(tmp_path / "missing.json")
  assert seed_templates_mod._read_templates_disk(missing_path) is None

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

  # 3. Successful seed with both existing and new templates
  existing_obj = MagicMock()
  res_existing = MagicMock()
  res_existing.scalars.return_value.first.return_value = existing_obj

  res_new = MagicMock()
  res_new.scalars.return_value.first.return_value = None

  mock_session = AsyncMock()
  mock_session.execute = AsyncMock(side_effect=[res_existing, res_new])
  mock_session.add = MagicMock()

  mock_session_cm = MagicMock()
  mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
  mock_session_cm.__aexit__ = AsyncMock(return_value=False)

  with (
    patch.object(seed_templates_mod, "DATA_FILE", str(valid_file)),
    patch.object(seed_templates_mod, "AsyncSessionLocal", return_value=mock_session_cm),
  ):
    await seed_templates_mod.seed_templates()
    assert existing_obj.description == "Updated desc"
    mock_session.add.assert_called_once()
    mock_session.commit.assert_awaited_once()

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

  # 5. CLI main()
  with (
    patch("scripts.seed_templates.asyncio.run") as mock_asio_run,
    patch("scripts.seed_templates.seed_templates", new=MagicMock(return_value="coro")),
  ):
    seed_templates_mod.main()
    mock_asio_run.assert_called_once_with("coro")
