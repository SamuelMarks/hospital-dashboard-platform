"""
Unit tests for root `scripts/add_i18n.py` HTML i18n injection utility.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

ROOT_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "add_i18n.py"
spec = importlib.util.spec_from_file_location("root_add_i18n", ROOT_SCRIPT)
assert spec is not None
assert spec.loader is not None
add_i18n = importlib.util.module_from_spec(spec)
sys.modules["root_add_i18n"] = add_i18n
spec.loader.exec_module(add_i18n)


def test_pop_closing_tag_matches_and_unmatched() -> None:
  """Verifies `_pop_closing_tag` pops back to matching tag or leaves stack unchanged."""
  stack = [("div", False), ("span", True), ("b", False)]
  assert add_i18n._pop_closing_tag(stack, "span") == [("div", False)]
  assert add_i18n._pop_closing_tag(stack, "nonexistent") == stack


def test_transform_opening_tag_variants() -> None:
  """Verifies `_transform_opening_tag` handles non-matching tokens, self-closing tags, and nested i18n."""
  stack: list[tuple[str, bool]] = []
  # Non-matching malformed token
  assert add_i18n._transform_opening_tag("<>", stack) == "<>"

  # Self-closing localizable tag
  res_self = add_i18n._transform_opening_tag("<span/>", stack)
  assert res_self == "<span i18n/>"
  assert stack == []

  # Opening localizable tag pushes to stack
  res_open = add_i18n._transform_opening_tag('<h1 class="title">', stack)
  assert res_open == '<h1 i18n class="title">'
  assert stack == [("h1", True)]

  # Child tag inside already localized parent is not double-localized
  res_child = add_i18n._transform_opening_tag("<span>", stack)
  assert res_child == "<span>"
  assert stack[-1] == ("span", False)


def test_process_html_attributes_and_nested_tags() -> None:
  """Verifies `process_html` localizes attributes, normal tags, and respects closing tags."""
  raw = '<div placeholder="Enter name"><p>Hello <span>World</span></p></unmatched></div ><br/>'
  processed = add_i18n.process_html(raw)
  assert 'i18n-placeholder placeholder="Enter name"' in processed
  assert "<p i18n>" in processed
  assert "<span>World</span>" in processed


def test_main_scans_and_updates_html_files(tmp_path: Path) -> None:
  """Verifies `main` updates eligible HTML files and skips `login.component.html` and unchanged files."""
  app_dir = tmp_path / "sub"
  app_dir.mkdir(parents=True)

  login_file = app_dir / "login.component.html"
  login_file.write_text("<h1>Login</h1>", encoding="utf-8")

  comp_file = app_dir / "card.component.html"
  comp_file.write_text("<h2>Card Title</h2>", encoding="utf-8")

  already_file = app_dir / "already.component.html"
  already_file.write_text("<h2 i18n>Already</h2>", encoding="utf-8")

  updated = add_i18n.main(str(tmp_path))
  assert updated == 1
  assert login_file.read_text(encoding="utf-8") == "<h1>Login</h1>"
  assert comp_file.read_text(encoding="utf-8") == "<h2 i18n>Card Title</h2>"
  assert already_file.read_text(encoding="utf-8") == "<h2 i18n>Already</h2>"
