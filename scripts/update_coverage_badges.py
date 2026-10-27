#!/usr/bin/env python3
"""Update README coverage badges and enforce 100% coverage."""

from __future__ import annotations

import argparse
from collections.abc import Iterable
import ast
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "pulse-query-backend"
README = ROOT / "README.md"
APP_ROOT = BACKEND / "src" / "app"
WEB_APP_ROOT = ROOT / "pulse-query-ng-web" / "src" / "app"

TEST_BADGE_ALT = "Test Coverage"
DOC_BADGE_ALT = "Doc Coverage"

_BYPASS_RE = re.compile(r"(istanbul\s+ignore|v8\s+ignore|pragma:\s*no\s*cover)", re.IGNORECASE)
_FORBIDDEN_REFLECTION_FUNCS = frozenset({"getattr", "setattr", "hasattr"})
_FORBIDDEN_TYPE_NAMES = frozenset({"Any", "object"})


class CoverageError(RuntimeError):
  """Raised when coverage is missing or below the required threshold."""


def scan_for_typing_and_reflection_smells(scan_dirs: Iterable[Path] | None = None) -> list[str]:
  """
  Scans Python ASTs for forbidden `Any`/`object` usages, `__dict__` reflection,
  `typing.cast`, and `getattr`/`setattr`/`hasattr` calls.

  Args:
      scan_dirs (Iterable[Path] | None): Optional directories to scan (defaults to backend src, scripts, tests, and root scripts).

  Returns:
      list[str]: List of relative file paths and line numbers with typing or reflection violations.
  """
  target_dirs = (
    list(scan_dirs)
    if scan_dirs is not None
    else [BACKEND / "src", BACKEND / "scripts", BACKEND / "tests", ROOT / "scripts"]
  )
  violations: list[str] = []
  for folder in target_dirs:
    if not folder.exists():
      continue
    for py_path in folder.rglob("*.py"):
      tree = ast.parse(py_path.read_text(encoding="utf-8"))
      rel = py_path.relative_to(ROOT)
      has_typing_cast = any(
        isinstance(n, ast.ImportFrom) and n.module == "typing" and any(a.name == "cast" for a in n.names)
        for n in ast.walk(tree)
      )
      for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in _FORBIDDEN_TYPE_NAMES:
          violations.append(f"{rel}:{node.lineno} ({node.id})")
        elif isinstance(node, ast.Attribute) and node.attr == "__dict__":
          violations.append(f"{rel}:{node.lineno} (__dict__)")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
          if node.func.id in _FORBIDDEN_REFLECTION_FUNCS or (has_typing_cast and node.func.id == "cast"):
            violations.append(f"{rel}:{node.lineno} ({node.func.id})")
  return violations


def scan_for_coverage_bypasses() -> list[str]:
  """
  Scans backend and frontend application source files for forbidden coverage bypass comments.

  Returns:
      list[str]: List of relative file paths and line numbers containing bypass comments.
  """
  offenders: list[str] = []
  for py_path in APP_ROOT.rglob("*.py"):
    for idx, line in enumerate(py_path.read_text(encoding="utf-8").splitlines(), start=1):
      if _BYPASS_RE.search(line):
        offenders.append(f"{py_path.relative_to(ROOT)}:{idx}")

  if WEB_APP_ROOT.exists():
    for ts_path in WEB_APP_ROOT.rglob("*.ts"):
      if ts_path.name.endswith(".spec.ts") or "api-client" in ts_path.parts:
        continue
      for idx, line in enumerate(ts_path.read_text(encoding="utf-8").splitlines(), start=1):
        if _BYPASS_RE.search(line):
          offenders.append(f"{ts_path.relative_to(ROOT)}:{idx}")
  return offenders


def run(cmd: list[str], cwd: Path | None = None) -> None:
  """
  Runs a subprocess command and logs non-zero exit codes.

  Args:
      cmd (list[str]): Command and argument tokens.
      cwd (Path | None): Optional working directory path.
  """
  print(f"+ {' '.join(cmd)}")
  try:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)
  except subprocess.CalledProcessError as exc:
    print(f"Warning: Command failed with exit code {exc.returncode}")


def format_percent(value: float) -> str:
  """
  Formats a percentage value with minimal decimal noise for badges.

  Args:
      value (float): Raw coverage percentage.

  Returns:
      str: Formatted percentage string.
  """
  rounded = round(value, 1)
  if abs(rounded - round(rounded)) < 0.05:
    return str(int(round(rounded)))
  return f"{rounded:.1f}"


def badge_color(value: float) -> str:
  """
  Maps a coverage percentage to a shields.io badge color name.

  Args:
      value (float): Coverage percentage (0-100).

  Returns:
      str: Shields.io color identifier.
  """
  if value >= 100:
    return "brightgreen"
  if value >= 95:
    return "green"
  if value >= 90:
    return "yellowgreen"
  if value >= 80:
    return "yellow"
  if value >= 70:
    return "orange"
  return "red"


def badge_url(label: str, value: float) -> str:
  """
  Builds a shields.io badge URL for a coverage percentage.

  Args:
      label (str): Badge label text.
      value (float): Coverage percentage value.

  Returns:
      str: Full shields.io badge URL.
  """
  percent_str = format_percent(value)
  encoded_value = f"{percent_str}%25"
  return f"https://img.shields.io/badge/{label}-{encoded_value}-{badge_color(value)}"


def read_percent(value: str | int | float | None) -> float:
  """
  Normalizes a raw JSON coverage percentage value into a `float`.

  Args:
      value (str | int | float | None): Raw JSON value (`str`, `int`, `float`, or `None`).

  Returns:
      float: Parsed percentage value.

  Raises:
      CoverageError: If `value` is `None` or not convertible to `float`.
  """
  if isinstance(value, (int, float)) and not isinstance(value, bool):
    return float(value)
  if isinstance(value, str):
    cleaned = value.strip().rstrip("%")
    return float(cleaned)
  raise CoverageError("Missing coverage percent in JSON report.")


def compute_test_coverage() -> float:
  """
  Runs pytest with JSON coverage output and returns the total percentage covered.

  Returns:
      float: Total line/branch coverage percentage reported by pytest.

  Raises:
      CoverageError: If `coverage.json` was not produced or lacks coverage totals.
  """
  coverage_dir = BACKEND / "coverage"
  coverage_dir.mkdir(exist_ok=True)
  coverage_json = coverage_dir / "coverage.json"

  run(
    [
      "uv",
      "run",
      "pytest",
      "--cov=app",
      f"--cov-report=json:{coverage_json.as_posix()}",
    ],
    cwd=BACKEND,
  )

  if not coverage_json.exists():
    raise CoverageError("coverage.json was not created by pytest.")
  data = json.loads(coverage_json.read_text(encoding="utf-8"))
  totals = data.get("totals", {})
  percent = totals.get("percent_covered")
  if percent is None:
    percent = totals.get("percent_covered_display")
  return read_percent(percent)


def _check_class_docs(path: Path, node: ast.ClassDef, missing: list[str]) -> tuple[int, int]:
  """
  Counts total and documented items for a class definition and its public methods.

  Args:
      path (Path): Source file path.
      node (ast.ClassDef): AST `ClassDef` node.
      missing (list[str]): Mutable list collecting missing docstring identifiers.

  Returns:
      tuple[int, int]: `(total_count, documented_count)` for this class.
  """
  if node.name.startswith("_"):
    return 0, 0

  total = 1
  documented = 1 if ast.get_docstring(node) else 0
  if not documented:
    missing.append(f"{path.relative_to(ROOT)}: class {node.name}")

  for child in node.body:
    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
      name = child.name
      if name.startswith("_"):
        continue
      total += 1
      if ast.get_docstring(child):
        documented += 1
      else:
        missing.append(f"{path.relative_to(ROOT)}: method {node.name}.{name}")
  return total, documented


def compute_doc_coverage() -> tuple[float, list[str]]:
  """
  Computes docstring coverage across `APP_ROOT` using interrogate-equivalent AST rules.

  Returns:
      tuple[float, list[str]]: `(coverage_percent, missing_identifiers)`.
  """
  total = 0
  documented = 0
  missing: list[str] = []

  for path in APP_ROOT.rglob("*.py"):
    if path.name == "__init__.py":
      continue
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text)

    total += 1
    if ast.get_docstring(tree):
      documented += 1
    else:
      missing.append(f"{path.relative_to(ROOT)}: module")

    for node in tree.body:
      if isinstance(node, ast.ClassDef):
        c_tot, c_doc = _check_class_docs(path, node, missing)
        total += c_tot
        documented += c_doc
      elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
        total += 1
        if ast.get_docstring(node):
          documented += 1
        else:
          missing.append(f"{path.relative_to(ROOT)}: function {node.name}")

  percent = 100.0 if total == 0 else (documented / total * 100)
  return percent, missing


def replace_badge(text: str, alt_text: str, url: str) -> tuple[str, bool]:
  """
  Replaces an existing Markdown badge URL matching `alt_text`.

  Args:
      text (str): Full Markdown document content.
      alt_text (str): Badge alt-text identifier.
      url (str): Replacement badge image URL.

  Returns:
      tuple[str, bool]: `(updated_text, was_replaced)`.
  """
  pattern = rf"!\[{re.escape(alt_text)}\]\([^)]*\)"
  replacement = f"![{alt_text}]({url})"
  if re.search(pattern, text):
    return re.sub(pattern, replacement, text), True
  return text, False


def insert_badges(text: str, badges: Iterable[str]) -> str:
  """
  Inserts new Markdown badges after the existing badge block near the top of `text`.

  Args:
      text (str): Full Markdown document content.
      badges (Iterable[str]): Badge Markdown strings to insert.

  Returns:
      str: Updated Markdown document content.
  """
  lines = text.splitlines()
  insert_at = None
  for idx, line in enumerate(lines[:10]):
    if "![" in line or "[![" in line:
      insert_at = idx
      continue
    if insert_at is not None and line.strip() == "":
      break
  badge_line = " ".join(badges)
  nl = chr(10)
  if insert_at is None:
    lines.insert(2, badge_line)
  else:
    lines.insert(insert_at + 1, badge_line)
  return nl.join(lines) + nl


def update_readme(test_percent: float, doc_percent: float) -> bool:
  """
  Updates `README.md` coverage badges and returns `True` when changes were written.

  Args:
      test_percent (float): Test coverage percentage.
      doc_percent (float): Documentation coverage percentage.

  Returns:
      bool: `True` if `README.md` was modified, else `False`.
  """
  original = README.read_text(encoding="utf-8")
  text = original

  test_url = badge_url("test_coverage", test_percent)
  doc_url = badge_url("doc_coverage", doc_percent)

  text, _ = replace_badge(text, TEST_BADGE_ALT, test_url)
  text, _ = replace_badge(text, DOC_BADGE_ALT, doc_url)

  missing_badges = []
  if f"![{TEST_BADGE_ALT}]" not in text:
    missing_badges.append(f"![{TEST_BADGE_ALT}]({test_url})")
  if f"![{DOC_BADGE_ALT}]" not in text:
    missing_badges.append(f"![{DOC_BADGE_ALT}]({doc_url})")

  if missing_badges:
    text = insert_badges(text.rstrip(chr(10)), missing_badges)

  if text != original:
    README.write_text(text, encoding="utf-8")
    return True
  return False


def main(argv: list[str] | None = None) -> int:
  """
  CLI entry point computing test and docstring coverage and updating `README.md` badges.

  Args:
      argv (list[str] | None): Optional CLI argument list override for testing.

  Returns:
      int: Process exit code (`0` on success).

  Raises:
      CoverageError: If any coverage metric is below 100% or bypass comments exist.
  """
  parser = argparse.ArgumentParser(description="Update coverage badges and enforce 100% coverage.")
  parser.add_argument("--stage", action="store_true", help="Stage README updates with git add.")
  args = parser.parse_args(argv)

  test_percent = compute_test_coverage()
  doc_percent, missing_docs = compute_doc_coverage()

  print(f"Test coverage: {format_percent(test_percent)}%")
  print(f"Doc coverage: {format_percent(doc_percent)}%")

  updated = update_readme(test_percent, doc_percent)
  if updated:
    print("Updated README coverage badges.")

  if args.stage and updated:
    run(["git", "add", str(README)], cwd=ROOT)

  failures = []
  bypasses = scan_for_coverage_bypasses()
  if bypasses:
    failures.append(f"Forbidden coverage bypass comments found in: {', '.join(bypasses)}")
  smells = scan_for_typing_and_reflection_smells()
  if smells:
    failures.append(f"Forbidden typing/reflection constructs found in: {', '.join(smells)}")
  if test_percent < 100:
    failures.append(f"Test coverage is {format_percent(test_percent)}%")
  if doc_percent < 100:
    failures.append(f"Doc coverage is {format_percent(doc_percent)}%")
    if missing_docs:
      print("Missing docstrings:")
      for entry in missing_docs:
        print(f"  - {entry}")

  if failures:
    raise CoverageError("; ".join(failures))

  return 0


def run_cli_entrypoint(argv: list[str] | None = None) -> int:
  """
  Executes `main(argv)` and converts `CoverageError` into exit code `1`.

  Args:
      argv (list[str] | None): Optional CLI arguments list.

  Returns:
      int: Exit code (`0` on success, `1` on `CoverageError`).
  """
  try:
    return main(argv)
  except CoverageError as exc:
    print(f"Coverage check failed: {exc}")
    return 1


if __name__ == "__main__":
  raise SystemExit(run_cli_entrypoint())
