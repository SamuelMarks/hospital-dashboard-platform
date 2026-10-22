"""Utility script for injecting Angular i18n attributes into HTML templates."""

from __future__ import annotations

import glob
import os
import re

_TAGS_TO_LOCALIZE: set[str] = {
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "button",
  "a",
  "label",
  "mat-label",
  "mat-card-title",
  "mat-card-subtitle",
  "mat-error",
  "mat-chip",
  "th",
  "td",
  "mat-menu-item",
  "mat-option",
  "mat-step",
  "mat-panel-title",
  "mat-panel-description",
  "mat-hint",
  "mat-checkbox",
  "mat-radio-button",
  "mat-slide-toggle",
  "mat-tab",
}


def _pop_closing_tag(stack: list[tuple[str, bool]], tag_name: str) -> list[tuple[str, bool]]:
  """
  Pops `stack` back to the most recent matching opening `tag_name`.

  Args:
      stack (list[tuple[str, bool]]): Active tag stack of `(tag_name, has_i18n)` tuples.
      tag_name (str): Closing HTML tag name.

  Returns:
      list[tuple[str, bool]]: Updated tag stack.
  """
  for i in range(len(stack) - 1, -1, -1):
    if stack[i][0] == tag_name:
      return stack[:i]
  return stack


def _transform_opening_tag(token: str, stack: list[tuple[str, bool]]) -> str:
  """
  Transforms an opening HTML tag token, adding `i18n` when eligible and updating `stack`.

  Args:
      token (str): Raw HTML opening tag token.
      stack (list[tuple[str, bool]]): Mutable tag stack of `(tag_name, has_i18n)` tuples.

  Returns:
      str: Transformed HTML tag token.
  """
  match = re.match(r"""<([a-zA-Z0-9\-]+)(\s*(?:[^>]*?(?:"[^"]*"|'[^']*'|[^>]*?)*)?)>""", token, re.DOTALL)
  if not match:
    return token

  tag_name = match.group(1)
  attrs = match.group(2)
  has_i18n_content = bool(re.search(r"\bi18n(?:\s*=|[\s>])", attrs + ">"))
  parent_has_i18n = any(s_i18n for _, s_i18n in stack)

  if tag_name in _TAGS_TO_LOCALIZE and not has_i18n_content and not parent_has_i18n:
    has_i18n_content = True
    token = f"<{tag_name} i18n{attrs[:-1]}/>" if attrs.endswith("/") else f"<{tag_name} i18n{attrs}>"

  if not attrs.endswith("/") and not (attrs.endswith(">") and token.endswith("/>")):
    stack.append((tag_name, has_i18n_content))
  return token


def process_html(content: str) -> str:
  """
  Adds `i18n` and `i18n-*` attributes to eligible HTML elements and attributes in `content`.

  Args:
      content (str): Raw HTML template content string.

  Returns:
      str: Updated HTML content with `i18n` markers.
  """
  for attr in ["placeholder", "aria-label", "title", "matTooltip"]:
    pattern = r"(?<!i18n-)(?<!\[)\b(" + attr + r')="([^"]*[a-zA-Z][^"]*)"'
    content = re.sub(pattern, r'i18n-\1 \1="\2"', content)

  tokens = re.split(r"""(</?[a-zA-Z0-9\-]+(?:>|\s[^>]*?(?:"[^"]*"|'[^']*'|[^>]*?)*>))""", content)
  out: list[str] = []
  stack: list[tuple[str, bool]] = []

  for t in tokens:
    if t.startswith("</"):
      match = re.match(r"</([a-zA-Z0-9\-]+)>", t)
      if match:
        stack = _pop_closing_tag(stack, match.group(1))
      out.append(t)
    elif t.startswith("<"):
      out.append(_transform_opening_tag(t, stack))
    else:
      out.append(t)

  return "".join(out)


def main(target_dir: str | None = None) -> int:
  """
  Scans `src/app/**/*.html` (or `target_dir`) and applies `process_html` in-place.

  Args:
      target_dir (str | None): Optional directory path override to scan for `.html` files.

  Returns:
      int: Number of HTML files updated.
  """
  resolved_dir = target_dir if target_dir is not None else os.path.join(os.path.dirname(__file__), "src/app")
  files = glob.glob(resolved_dir + "/**/*.html", recursive=True)
  updated_count = 0
  for f in files:
    if f.endswith("login.component.html"):
      continue
    with open(f, encoding="utf-8") as file:
      content = file.read()

    new_content = process_html(content)

    if new_content != content:
      with open(f, "w", encoding="utf-8") as file:
        file.write(new_content)
      print(f"Updated: {f}")
      updated_count += 1
  return updated_count


if __name__ == "__main__":  # pragma: no cover
  main()
