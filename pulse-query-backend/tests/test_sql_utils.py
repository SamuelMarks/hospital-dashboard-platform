"""
Tests for SQL utility helpers (normalization and hashing).
"""

import hashlib
from unittest.mock import patch

from app.services import sql_utils


def test_strip_sql_comments_empty() -> None:
  """Empty input should return empty string."""
  assert sql_utils._strip_sql_comments("") == ""


def test_strip_sql_comments_handles_comments_and_quotes() -> None:
  """Comments should be removed while quoted markers remain."""
  sql = "SELECT '--not' as a, \"/*not*/\" as b, `--not` as c, [--not] as d -- line comment\nFROM t /* block comment */"
  stripped = sql_utils._strip_sql_comments(sql)

  assert "-- line comment" not in stripped
  assert "/* block comment */" not in stripped
  assert "'--not'" in stripped
  assert '"/*not*/"' in stripped
  assert "`--not`" in stripped
  assert "[--not]" in stripped


def test_strip_sql_comments_handles_escaped_quotes() -> None:
  """Escaped quotes should be preserved."""
  sql = "SELECT 'it''s' as a, \"he\"\"llo\" as b, `ba``z` as c"
  stripped = sql_utils._strip_sql_comments(sql)

  assert "it''s" in stripped
  assert 'he""llo' in stripped
  assert "ba``z" in stripped


def test_normalize_sql_uses_sqlglot() -> None:
  """Valid SQL should normalize via sqlglot."""
  normalized = sql_utils.normalize_sql("select 1;")
  assert normalized.upper().startswith("SELECT 1")


def test_normalize_sql_fallback_on_parse_error() -> None:
  """Fallback normalization should lowercase and collapse whitespace."""
  with patch("app.services.sql_utils.sqlglot.parse_one", side_effect=Exception("boom")):
    normalized = sql_utils.normalize_sql("SELECT  *  FROM  t  -- comment")
  assert normalized == "select * from t"


def test_sql_fingerprint_returns_hash() -> None:
  """Hash should be derived from normalized SQL."""
  sql = "SELECT 1"
  expected = hashlib.sha256(sql_utils.normalize_sql(sql).encode("utf-8")).hexdigest()
  assert sql_utils.sql_fingerprint(sql) == expected


def test_sql_fingerprint_empty_returns_none() -> None:
  """Empty SQL should return None."""
  assert sql_utils.sql_fingerprint("   ") is None


def test_sql_utils_edge_branches() -> None:
  """Verifies unclosed block comments, markdown SQL extraction, and template parameter interpolation."""
  assert sql_utils._strip_sql_comments("SELECT 1 /* unfinished") == "SELECT 1  "
  assert sql_utils.extract_sql_from_markdown("```sql\nSELECT 42;\n```") == "SELECT 42;"
  assert sql_utils.extract_sql_from_markdown("SELECT 99;") == "SELECT 99;"
  assert (
    sql_utils.interpolate_template_parameters(
      "SELECT '{{dept}}', {{ limit }}",
      parameters_schema={"properties": {"dept": {"default": "O'Connor"}, "limit": {"default": 5}}},
      param_overrides={"limit": 25, "ignored": None},
    )
    == "SELECT 'O''Connor', 25"
  )
  assert (
    sql_utils.interpolate_template_parameters(
      "SELECT 1",
      parameters_schema=None,
      param_overrides=None,
    )
    == "SELECT 1"
  )
  assert (
    sql_utils.interpolate_template_parameters(
      "SELECT 1",
      parameters_schema={"properties": None},
      param_overrides={},
    )
    == "SELECT 1"
  )
  assert (
    sql_utils.interpolate_template_parameters(
      "SELECT 1",
      parameters_schema={"properties": {"no_default": {}}},
      param_overrides={},
    )
    == "SELECT 1"
  )
