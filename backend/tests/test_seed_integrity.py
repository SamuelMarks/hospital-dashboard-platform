"""
Tests for Template Seeding Integrity (Full 30 Questions).

Verifies that the content pack JSON contains all 30 templates defined in the scope,
including both Batch A (Flow/Volatility) and Batch B (Clinical/Risk).
Ensures that complex SQL patterns in Batch B (e.g. Self-Joins, Subqueries)
are correctly represented in the persisted data structure.
"""

import json
import os
import pytest
from typing import List, Dict, Any, Set
from app.services.template_seeder import DATA_FILE

# Complete list of 30 expected questions
EXPECTED_TITLES = {
  # Batch A
  "Predictive Availability",
  "Bottleneck Analysis",
  "Day-of-Week Volatility",
  "Weekend Effect",
  "Throughput Velocity",
  "Service Dominance",
  "Utilization Spikes",
  "Admission Lag",
  "Holiday Decompression",
  "Step-Down Flow",
  "Elective Impact",
  "Long-Stayers",
  "Shift Change Stress",
  "Seasonal Growth",
  "Capacity Forecasting",
  # Batch B
  "Cohort Isolation",
  "Bed Turnover Time",
  "Clinical Service 'Rent'",
  "Wait-list Probability",
  "Midnight vs. Noon",
  "Conditional Overstay Risk",
  "Step-Down Availability",
  "Service-Adjusted LoS",
  "Maternity-Nursery Link",
  "The '2 AM' Indicator",
  "Paired Bottlenecks",
  "Discharge Efficiency",
  "The 'NICU Cliff'",
  "Overflow Predictor",
  "Weekend Discharge Lag",
}


@pytest.fixture
def content_pack() -> List[Dict[str, Any]]:
  """Load the JSON file from disk."""
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Content Pack JSON missing at: {DATA_FILE}")

  with open(DATA_FILE, "r", encoding="utf-8") as f:
    return json.load(f)


def test_full_catalog_presence(content_pack: List[Dict[str, Any]]) -> None:
  """
  Verify that ALL 30 templates are present in the JSON file.
  """
  present_titles = {t["title"] for t in content_pack}
  missing = EXPECTED_TITLES - present_titles

  # Print missing for easier debugging if assertion fails
  if missing:
    print(f"Missing Templates: {missing}")

  assert not missing, f"Missing {len(missing)} templates in content pack."
  assert len(present_titles) >= 30


def test_batch_b_sql_complexity(content_pack: List[Dict[str, Any]]) -> None:
  """
  Targeted validation for complex SQL patterns introduced in Batch B.
  Verifies that placeholders are correctly structured for:
  - Subqueries (Midnight vs Noon)
  - Dynamic Self-Joins (Paired Bottlenecks)
  - Probability Logic (Overflow Predictor)
  """
  # Case 1: Midnight vs Noon (Subqueries)
  q20 = next(t for t in content_pack if t["title"] == "Midnight vs. Noon")
  assert "SELECT COUNT(*)" in q20["sql_template"]
  assert "INTERVAL 12 HOUR" in q20["sql_template"], "Missing Interval Logic in Q20"

  # Case 2: Overflow Predictor (Join + Logic)
  q29 = next(t for t in content_pack if t["title"] == "Overflow Predictor")
  assert "{{primary_unit}}" in q29["sql_template"]
  assert "{{service}}" in q29["sql_template"]
  assert "PROBABILITY" in q29["sql_template"], "Q29 should use PROBABILITY macro"

  # Case 3: Paired Bottlenecks (Dynamic CTEs)
  q26 = next(t for t in content_pack if t["title"] == "Paired Bottlenecks")
  assert "{{unit_1}}" in q26["sql_template"]
  assert "{{unit_2}}" in q26["sql_template"]
  assert "{{cap_1}}" in q26["sql_template"]


def test_schema_completeness(content_pack: List[Dict[str, Any]]) -> None:
  """
  Verify parameters_schema exists and is valid for all entries.
  Specific check for Overflow Predictor which has 3 params.
  """
  for t in content_pack:
    assert "parameters_schema" in t, f"{t['title']} missing schema"
    schema = t["parameters_schema"]
    assert "type" in schema
    assert schema["type"] == "object"

  q29 = next(t for t in content_pack if t["title"] == "Overflow Predictor")
  props = q29["parameters_schema"]["properties"]
  assert "primary_unit" in props
  assert "service" in props
  assert "capacity" in props
