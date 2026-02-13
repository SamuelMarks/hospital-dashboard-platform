"""
SQL normalization and hashing helpers.

Provides a stable fingerprint for generated SQL so we can identify
identical queries across different LLMs for analytics and UI grouping.
"""

import hashlib
import re
from typing import Optional

import sqlglot


_DEF_DIALECT = "duckdb"


def _strip_sql_comments(sql: str) -> str:
  """
  Remove SQL line and block comments while respecting quoted strings.
  """
  if not sql:
    return ""

  out = []
  i = 0
  n = len(sql)
  in_single = False
  in_double = False
  in_backtick = False
  in_bracket = False

  while i < n:
    ch = sql[i]
    nxt = sql[i + 1] if i + 1 < n else ""

    if not (in_single or in_double or in_backtick or in_bracket):
      if ch == "-" and nxt == "-":
        # Line comment: skip until newline
        i += 2
        while i < n and sql[i] != "\n":
          i += 1
        out.append("\n" if i < n and sql[i] == "\n" else " ")
        i += 1
        continue
      if ch == "/" and nxt == "*":
        # Block comment: skip until */
        i += 2
        while i < n - 1:
          if sql[i] == "*" and sql[i + 1] == "/":
            i += 2
            break
          i += 1
        out.append(" ")
        continue

    if ch == "'" and not (in_double or in_backtick or in_bracket):
      if in_single and nxt == "'":
        out.append("''")
        i += 2
        continue
      in_single = not in_single
      out.append(ch)
      i += 1
      continue

    if ch == '"' and not (in_single or in_backtick or in_bracket):
      if in_double and nxt == '"':
        out.append('""')
        i += 2
        continue
      in_double = not in_double
      out.append(ch)
      i += 1
      continue

    if ch == "`" and not (in_single or in_double or in_bracket):
      if in_backtick and nxt == "`":
        out.append("``")
        i += 2
        continue
      in_backtick = not in_backtick
      out.append(ch)
      i += 1
      continue

    if ch == "[" and not (in_single or in_double or in_backtick):
      in_bracket = True
      out.append(ch)
      i += 1
      continue

    if ch == "]" and in_bracket:
      in_bracket = False
      out.append(ch)
      i += 1
      continue

    out.append(ch)
    i += 1

  return "".join(out)


def normalize_sql(sql: str, dialect: str = _DEF_DIALECT) -> str:
  """
  Normalize SQL into a canonical string for comparison.

  Tries to parse and re-emit SQL via sqlglot. Falls back to
  whitespace normalization if parsing fails.
  """
  cleaned = (sql or "").strip().rstrip(";")
  cleaned = _strip_sql_comments(cleaned)
  if not cleaned:
    return ""

  try:
    parsed = sqlglot.parse_one(cleaned, read=dialect)
    return parsed.sql(dialect=dialect, pretty=False)
  except Exception:
    # Fallback: collapse whitespace and lowercase for rough equivalence.
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def sql_fingerprint(sql: str, dialect: str = _DEF_DIALECT) -> Optional[str]:
  """
  Return a stable hash for the normalized SQL.
  """
  normalized = normalize_sql(sql, dialect=dialect)
  if not normalized:
    return None
  return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
