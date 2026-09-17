"""
Unit tests for the MPAX Arena Scoring Metrics module.

Verifies mathematical correctness, edge case handling, and scoring accuracy
for Judge, Constraints, SQL vs MPAX, and Critic evaluation modes.
"""

import sys
from pathlib import Path
from typing import Any

# Ensure scripts module is discoverable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from score_mpax_arena import (
  extract_json_from_text,
  score_constraints_mode,
  score_critic_mode,
  score_judge_mode,
  score_sql_vs_mpax_mode,
)


def test_extract_json_from_text_valid() -> None:
  """Verifies extraction of valid JSON dictionary from formatted text."""
  text = 'Analysis: {"ICU": 5, "MedSurg": 15} is optimal.'
  result = extract_json_from_text(text)
  assert result == {"ICU": 5, "MedSurg": 15}


def test_extract_json_from_text_invalid() -> None:
  """Verifies failure modes return an empty dictionary."""
  assert extract_json_from_text("No json here") == {}
  assert extract_json_from_text("Malformed { not json }") == {}
  assert extract_json_from_text("List JSON [1, 2, 3]") == {}


def test_score_judge_mode_exact_match() -> None:
  """Verifies 100% score when candidate text matches MPAX truth perfectly."""
  truth: dict[str, Any] = {
    "assignments": [
      {"Unit": "ICU", "Patient_Count": 5},
      {"Unit": "MedSurg", "Patient_Count": 10},
    ]
  }
  text = '{"ICU": 5, "MedSurg": 10}'
  score = score_judge_mode(truth, text)
  assert score == 100.0


def test_score_judge_mode_degraded_and_invalid() -> None:
  """Verifies penalization for allocation errors and handling of missing JSON."""
  truth: dict[str, Any] = {
    "assignments": [
      {"Unit": "ICU", "Patient_Count": 5},
      {"unit": "MedSurg", "count": 10},
    ]
  }
  # Missing JSON
  assert score_judge_mode(truth, "no structured data") == 0.0

  # Partial error: ICU=4 (error 1), MedSurg=11 (error 1), Total error = 2 -> 100 - 20 = 80
  score = score_judge_mode(truth, '{"ICU": 4, "MedSurg": 11}')
  assert score == 80.0

  # Non-numeric value in JSON
  score_non_num = score_judge_mode(truth, '{"ICU": "invalid", "MedSurg": 10}')
  assert score_non_num < 100.0

  # Massive error bound at 0.0
  score_zero = score_judge_mode(truth, '{"ICU": 100, "MedSurg": 100}')
  assert score_zero == 0.0


def test_score_constraints_mode() -> None:
  """Verifies evaluation of constraint performance and overflow penalty."""
  expected: dict[str, Any] = {"expected_overflow": 2}

  # Status error
  assert score_constraints_mode(expected, {"status": "error"}) == 0.0

  # Exact match
  candidate_ok: dict[str, Any] = {
    "status": "success",
    "assignments": [
      {"Unit": "ICU", "Patient_Count": 5},
      {"unit": "overflow", "count": 2},
    ],
  }
  assert score_constraints_mode(expected, candidate_ok) == 100.0

  # Penalty applied: overflow = 4 vs expected 2 -> error 2 -> 100 - 40 = 60
  candidate_err: dict[str, Any] = {
    "status": "success",
    "assignments": [{"Unit": "Overflow", "Patient_Count": 4}],
  }
  assert score_constraints_mode(expected, candidate_err) == 60.0

  # Massive error bounded at 0.0
  candidate_huge_err: dict[str, Any] = {
    "status": "success",
    "assignments": [{"Unit": "Overflow", "Patient_Count": 50}],
  }
  assert score_constraints_mode(expected, candidate_huge_err) == 0.0


def test_score_sql_vs_mpax_mode_exact_match() -> None:
  """Verifies exact SQL match against ground truth yields top score."""
  truth: dict[str, Any] = {
    "assignments": [
      {"Unit": "ICU", "Patient_Count": 10},
      {"Unit": "MedSurg", "Patient_Count": 20},
    ]
  }
  sql_result: dict[str, Any] = {
    "data": [
      {"department": "ICU", "volume": 10},
      {"target_unit": "MedSurg", "census": 20},
    ],
    "error": None,
  }
  score = score_sql_vs_mpax_mode(truth, sql_result)
  assert score == 100.0


def test_score_sql_vs_mpax_mode_error_and_empty() -> None:
  """Verifies handling of SQL execution errors and malformed result payloads."""
  truth: dict[str, Any] = {"assignments": [{"Unit": "ICU", "Patient_Count": 10}]}

  # Error reported
  assert score_sql_vs_mpax_mode(truth, {"error": "Syntax Error", "data": []}) == 0.0

  # Empty data
  assert score_sql_vs_mpax_mode(truth, {"data": []}) == 0.0
  assert score_sql_vs_mpax_mode(truth, {}) == 0.0
  assert score_sql_vs_mpax_mode(truth, {"data": "not a list"}) == 0.0

  # No recognized columns or valid rows
  assert score_sql_vs_mpax_mode(truth, {"data": [{"unrelated": 123}]}) == 0.0
  assert score_sql_vs_mpax_mode(truth, {"data": ["invalid_row"]}) == 0.0

  # Fallback to assignments key
  sql_assignments: dict[str, Any] = {"assignments": [{"unit_category": "ICU", "patients": "invalid_num"}]}
  score_inv = score_sql_vs_mpax_mode(truth, sql_assignments)
  assert score_inv >= 0.0


def test_score_sql_vs_mpax_mode_degraded_and_zero_demand() -> None:
  """Verifies score degradation for partial mismatches and handling of zero demand."""
  truth: dict[str, Any] = {
    "assignments": [
      {"Unit": "ICU", "Patient_Count": 10},
      {"Unit": "MedSurg", "Patient_Count": 10},
    ]
  }
  # Partial mismatch
  sql_result: dict[str, Any] = {
    "data": [
      {"unit": "ICU", "count": 8},
      {"unit": "MedSurg", "count": 12},
    ]
  }
  score = score_sql_vs_mpax_mode(truth, sql_result)
  assert 0.0 < score < 100.0

  # Truth with zero demand
  zero_truth: dict[str, Any] = {"assignments": []}
  assert score_sql_vs_mpax_mode(zero_truth, {"data": [{"unit": "ICU", "count": 5}]}) == 0.0


def test_score_critic_mode() -> None:
  """Verifies floating-point conversion of critic scores."""
  assert score_critic_mode(95) == 95.0
  assert score_critic_mode(0) == 0.0
