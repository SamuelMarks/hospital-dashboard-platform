"""
Unit tests for root `scripts/update_coverage_badges.py` coverage verification utility.
"""

from __future__ import annotations

import ast
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

import pytest

ROOT_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "update_coverage_badges.py"
spec = importlib.util.spec_from_file_location("root_update_coverage_badges", ROOT_SCRIPT)
assert spec is not None
assert spec.loader is not None
ucb = importlib.util.module_from_spec(spec)
sys.modules["root_update_coverage_badges"] = ucb
spec.loader.exec_module(ucb)


def test_format_percent_and_badge_colors() -> None:
  """Verifies `format_percent`, `badge_color`, and `badge_url` across all thresholds."""
  assert ucb.format_percent(100.0) == "100"
  assert ucb.format_percent(99.94) == "99.9"
  assert ucb.badge_color(100.0) == "brightgreen"
  assert ucb.badge_color(96.0) == "green"
  assert ucb.badge_color(91.0) == "yellowgreen"
  assert ucb.badge_color(82.0) == "yellow"
  assert ucb.badge_color(72.0) == "orange"
  assert ucb.badge_color(50.0) == "red"
  assert "brightgreen" in ucb.badge_url("test_coverage", 100.0)


def test_read_percent_variants() -> None:
  """Verifies `read_percent` handles int, float, percent strings, and raises `CoverageError` on None."""
  assert ucb.read_percent(100) == 100.0
  assert ucb.read_percent(98.5) == 98.5
  assert ucb.read_percent(" 99.2% ") == 99.2
  with pytest.raises(ucb.CoverageError, match="Missing coverage percent"):
    ucb.read_percent(None)


def test_run_handles_success_and_called_process_error() -> None:
  """Verifies `run` executes subprocesses and handles `CalledProcessError` without crashing."""
  with patch("subprocess.run") as mock_run:
    ucb.run(["echo", "ok"], cwd=Path("."))
    mock_run.assert_called_once()

  with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, ["bad"])):
    ucb.run(["bad"], cwd=None)


def test_scan_for_coverage_bypasses(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `scan_for_coverage_bypasses` detects bypass comments in Python and TypeScript files."""
  nl = chr(10)
  app_dir = tmp_path / "backend" / "src" / "app"
  web_dir = tmp_path / "web" / "src" / "app"
  api_client_dir = web_dir / "api-client"
  app_dir.mkdir(parents=True)
  web_dir.mkdir(parents=True)
  api_client_dir.mkdir(parents=True)

  (app_dir / "clean.py").write_text(f"x = 1{nl}", encoding="utf-8")
  (app_dir / "dirty.py").write_text(f"x = 1  # pragma: no cover{nl}", encoding="utf-8")
  (web_dir / "dirty.ts").write_text(f"// v8 ignore next{nl}export const a = 1;{nl}", encoding="utf-8")
  (web_dir / "ignored.spec.ts").write_text(f"// v8 ignore next{nl}", encoding="utf-8")
  (api_client_dir / "gen.ts").write_text(f"// istanbul ignore next{nl}", encoding="utf-8")

  monkeypatch.setattr(ucb, "ROOT", tmp_path)
  monkeypatch.setattr(ucb, "APP_ROOT", app_dir)
  monkeypatch.setattr(ucb, "WEB_APP_ROOT", web_dir)

  offenders = ucb.scan_for_coverage_bypasses()
  assert len(offenders) == 2

  monkeypatch.setattr(ucb, "WEB_APP_ROOT", tmp_path / "nonexistent")
  offenders_no_web = ucb.scan_for_coverage_bypasses()
  assert len(offenders_no_web) == 1


def test_compute_test_coverage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `compute_test_coverage` reads `percent_covered` or `percent_covered_display` and errors when missing."""
  monkeypatch.setattr(ucb, "BACKEND", tmp_path)
  cov_dir = tmp_path / "coverage"
  cov_dir.mkdir(parents=True)
  cov_json = cov_dir / "coverage.json"

  with patch.object(ucb, "run"):
    with pytest.raises(ucb.CoverageError, match="was not created"):
      ucb.compute_test_coverage()

    cov_json.write_text(json.dumps({"totals": {"percent_covered": 100.0}}), encoding="utf-8")
    assert ucb.compute_test_coverage() == 100.0

    cov_json.write_text(json.dumps({"totals": {"percent_covered_display": "99.5%"}}), encoding="utf-8")
    assert ucb.compute_test_coverage() == 99.5


def test_compute_doc_coverage_and_class_docs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `_check_class_docs` and `compute_doc_coverage` across documented and undocumented AST nodes."""
  nl = chr(10)
  app_dir = tmp_path / "src" / "app"
  app_dir.mkdir(parents=True)
  monkeypatch.setattr(ucb, "ROOT", tmp_path)
  monkeypatch.setattr(ucb, "APP_ROOT", app_dir)

  # Empty directory -> 100.0%
  (app_dir / "__init__.py").write_text("", encoding="utf-8")
  pct_empty, missing_empty = ucb.compute_doc_coverage()
  assert pct_empty == 100.0
  assert missing_empty == []

  sample_code = nl.join(
    [
      "class _PrivateClass:",
      "  pass",
      "",
      "class UndocClass:",
      "  def _priv(self):",
      "    pass",
      "  def undoc_method(self):",
      "    pass",
      "  def doc_method(self):",
      '    """Doc."""',
      "    pass",
      "",
      "def undoc_fn():",
      "  pass",
      "",
      "def doc_fn():",
      '  """Doc."""',
      "  pass",
    ]
  )
  (app_dir / "mod.py").write_text(sample_code, encoding="utf-8")
  pct, missing = ucb.compute_doc_coverage()
  assert pct < 100.0
  assert len(missing) == 4

  tree = ast.parse(f'class DocClass:{nl}  """Class doc."""{nl}  pass{nl}')
  cls_node = tree.body[0]
  assert isinstance(cls_node, ast.ClassDef)
  tot, doc = ucb._check_class_docs(app_dir / "mod.py", cls_node, [])
  assert tot == 1
  assert doc == 1


def test_replace_insert_and_update_readme(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `replace_badge`, `insert_badges`, and `update_readme` badge manipulation."""
  nl = chr(10)
  readme = tmp_path / "README.md"
  monkeypatch.setattr(ucb, "README", readme)

  # Case 1: README has no existing badges -> inserts at line 2
  readme.write_text(f"# Title{nl}{nl}Body text{nl}", encoding="utf-8")
  assert ucb.update_readme(100.0, 100.0) is True
  assert "![Test Coverage]" in readme.read_text(encoding="utf-8")
  # Second call with same percentages returns False
  assert ucb.update_readme(100.0, 100.0) is False

  # Case 2: README has an existing badge block -> inserts after badge block
  readme.write_text(f"# Title{nl}![Other](https://example.com){nl}{nl}Body{nl}", encoding="utf-8")
  assert ucb.update_readme(95.0, 90.0) is True


def test_main_success_and_failure_branches() -> None:
  """Verifies `main` staging and failure aggregation."""
  with (
    patch.object(ucb, "compute_test_coverage", return_value=100.0),
    patch.object(ucb, "compute_doc_coverage", return_value=(100.0, [])),
    patch.object(ucb, "update_readme", return_value=True),
    patch.object(ucb, "scan_for_coverage_bypasses", return_value=[]),
    patch.object(ucb, "run") as mock_run,
  ):
    assert ucb.main(["--stage"]) == 0
    mock_run.assert_called_once()

  with (
    patch.object(ucb, "compute_test_coverage", return_value=95.0),
    patch.object(ucb, "compute_doc_coverage", return_value=(90.0, ["mod.py: function foo"])),
    patch.object(ucb, "update_readme", return_value=False),
    patch.object(ucb, "scan_for_coverage_bypasses", return_value=["dirty.py:1"]),
    pytest.raises(ucb.CoverageError, match="Forbidden coverage bypass"),
  ):
    ucb.main([])
