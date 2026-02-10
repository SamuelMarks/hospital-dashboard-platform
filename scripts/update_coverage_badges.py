#!/usr/bin/env python3
"""Update README coverage badges and enforce 100% coverage."""
from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
README = ROOT / "README.md"
APP_ROOT = BACKEND / "src" / "app"

TEST_BADGE_ALT = "Test Coverage"
DOC_BADGE_ALT = "Doc Coverage"


class CoverageError(RuntimeError):
  """Raised when coverage is missing or below the required threshold."""


def run(cmd: list[str], cwd: Path | None = None) -> None:
  """Run a command and surface errors with context."""
  print(f"+ {' '.join(cmd)}")
  subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def format_percent(value: float) -> str:
  """Format a percentage with minimal noise for badges."""
  rounded = round(value, 1)
  if abs(rounded - round(rounded)) < 0.05:
    return str(int(round(rounded)))
  return f"{rounded:.1f}"


def badge_color(value: float) -> str:
  """Map coverage percentage to a shields.io color."""
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
  """Build a shields.io badge URL for a coverage percentage."""
  percent_str = format_percent(value)
  encoded_value = f"{percent_str}%25"
  return f"https://img.shields.io/badge/{label}-{encoded_value}-{badge_color(value)}"


def read_percent(value: object) -> float:
  """Normalize coverage percent values into a float."""
  if value is None:
    raise CoverageError("Missing coverage percent in JSON report.")
  if isinstance(value, str):
    cleaned = value.strip().rstrip("%")
    return float(cleaned)
  return float(value)


def compute_test_coverage() -> float:
  """Run pytest with JSON coverage output and return percent covered."""
  coverage_dir = BACKEND / "coverage"
  coverage_dir.mkdir(exist_ok=True)
  coverage_json = coverage_dir / "coverage.json"

  run(["uv", "run", "pytest", "--cov-report=json:coverage/coverage.json"], cwd=BACKEND)

  if not coverage_json.exists():
    raise CoverageError("coverage.json was not created by pytest.")
  data = json.loads(coverage_json.read_text(encoding="utf-8"))
  totals = data.get("totals", {})
  percent = totals.get("percent_covered")
  if percent is None:
    percent = totals.get("percent_covered_display")
  return read_percent(percent)


def compute_doc_coverage() -> tuple[float, list[str]]:
  """Compute docstring coverage using interrogate-equivalent rules."""
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
        if node.name.startswith("_"):
          continue
        total += 1
        if ast.get_docstring(node):
          documented += 1
        else:
          missing.append(f"{path.relative_to(ROOT)}: class {node.name}")
        for child in node.body:
          if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            name = child.name
            if name.startswith("_"):
              continue
            if name.startswith("__") and name.endswith("__"):
              continue
            total += 1
            if ast.get_docstring(child):
              documented += 1
            else:
              missing.append(f"{path.relative_to(ROOT)}: method {node.name}.{name}")
      elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        name = node.name
        if name.startswith("_"):
          continue
        if name.startswith("__") and name.endswith("__"):
          continue
        total += 1
        if ast.get_docstring(node):
          documented += 1
        else:
          missing.append(f"{path.relative_to(ROOT)}: function {name}")

  percent = 100.0 if total == 0 else (documented / total * 100)
  return percent, missing


def replace_badge(text: str, alt_text: str, url: str) -> tuple[str, bool]:
  """Replace a badge URL by its alt text."""
  pattern = rf"!\[{re.escape(alt_text)}\]\([^)]*\)"
  replacement = f"![{alt_text}]({url})"
  if re.search(pattern, text):
    return re.sub(pattern, replacement, text), True
  return text, False


def insert_badges(text: str, badges: Iterable[str]) -> str:
  """Insert new badges after the existing badge block near the top."""
  lines = text.splitlines()
  insert_at = None
  for idx, line in enumerate(lines[:10]):
    if "![" in line or "[![" in line:
      insert_at = idx
      continue
    if insert_at is not None and line.strip() == "":
      break
  badge_line = " ".join(badges)
  if insert_at is None:
    lines.insert(2, badge_line)
  else:
    lines.insert(insert_at + 1, badge_line)
  return "\n".join(lines) + "\n"


def update_readme(test_percent: float, doc_percent: float) -> bool:
  """Update README badges and return True when changes were made."""
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
    text = insert_badges(text.rstrip("\n"), missing_badges)

  if text != original:
    README.write_text(text, encoding="utf-8")
    return True
  return False


def main() -> int:
  parser = argparse.ArgumentParser(description="Update coverage badges and enforce 100% coverage.")
  parser.add_argument("--stage", action="store_true", help="Stage README updates with git add.")
  args = parser.parse_args()

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


if __name__ == "__main__":
  try:
    raise SystemExit(main())
  except CoverageError as exc:
    print(f"Coverage check failed: {exc}")
    raise SystemExit(1)
