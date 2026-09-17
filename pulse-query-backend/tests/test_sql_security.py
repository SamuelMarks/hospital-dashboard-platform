"""
Tests for SQL Generator parameter sanitization and SQL injection prevention.
"""

from app.services.sql_generator import sql_generator


def test_process_global_filters_sanitizes_single_quotes() -> None:
  """Test that single quotes in department filter are properly escaped."""
  sql = "SELECT * FROM t WHERE 1=1 {{global_service}}"
  payload = {"dept": "Cardiology' OR '1'='1"}
  result = sql_generator.process_global_filters(sql, payload)

  assert "Clinical_Service = 'Cardiology'' OR ''1''=''1'" in result
  assert "Cardiology' OR" not in result


def test_process_global_filters_sanitizes_date_injection() -> None:
  """Test that invalid date strings or injection payloads are neutralized."""
  sql = "SELECT * FROM t WHERE 1=1 {{global_date_range}}"
  payload = {
    "start_date": "2023-01-01' OR 1=1 --",
    "end_date": "2023-12-31",
  }
  result = sql_generator.process_global_filters(sql, payload)

  # Invalid start_date should fail regex and produce empty date range injection
  assert "OR 1=1" not in result
  assert "{{global_date_range}}" not in result
  assert "BETWEEN" not in result


def test_process_global_filters_valid_dates() -> None:
  """Test that valid ISO dates are correctly formatted."""
  sql = "SELECT * FROM t WHERE date >= '{{global_start_date}}' AND date <= '{{global_end_date}}' {{global_date_range}}"
  payload = {
    "start_date": "2024-01-15",
    "end_date": "2024-06-30",
  }
  result = sql_generator.process_global_filters(sql, payload)

  assert "date >= '2024-01-15'" in result
  assert "date <= '2024-06-30'" in result
  assert "Midnight_Census_DateTime BETWEEN '2024-01-15' AND '2024-06-30'" in result


def test_process_global_filters_defaults_when_empty() -> None:
  """Test fallback defaults when parameters are omitted."""
  sql = "SELECT '{{global_start_date}}', '{{global_end_date}}', '{{global_service}}', '{{global_date_range}}'"
  result = sql_generator.process_global_filters(sql, {})

  assert "2023-01-01" in result
  assert "2023-12-31" in result
  assert "{{global_service}}" not in result
  assert "{{global_date_range}}" not in result


def test_sanitize_helpers_direct() -> None:
  """Test edge cases for direct string and date sanitizers."""
  assert sql_generator._sanitize_string_literal(None) == ""
  assert sql_generator._sanitize_string_literal("test's") == "test''s"
  assert sql_generator._sanitize_date_literal(None, "fallback") == "fallback"
  assert sql_generator._sanitize_date_literal("", "fallback") == "fallback"
  assert sql_generator._sanitize_date_literal("2024-05-10 12:00:00") == "2024-05-10 12:00:00"
  assert sql_generator._sanitize_date_literal("not-a-date", "safe") == "safe"
