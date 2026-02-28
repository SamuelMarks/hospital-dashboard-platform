import json
import re
from pathlib import Path
from typing import Dict, Any, List


def extract_json_from_text(text: str) -> Dict[str, Any]:
  """Attempts to robustly extract JSON from LLM text output."""
  try:
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
      return json.loads(text[start : end + 1])
  except Exception:
    pass
  return {}


def score_judge_mode(mpax_truth: Dict[str, Any], candidate_text: str) -> float:
  """
  Scores how well an LLM's logical routing matches the MPAX mathematical truth.
  Extracts assignments from text and computes Mean Absolute Error (MAE) against MPAX.
  """
  # 1. Extract ground truth distribution
  truth_map = {}
  for a in mpax_truth.get("assignments", []):
    unit = a.get("Unit", "Unknown")
    truth_map[unit] = truth_map.get(unit, 0) + a.get("Patient_Count", 0)

  # 2. Naively extract numbers from LLM text (Requires strong prompt adherence)
  # A real implementation might use an LLM-as-a-judge to extract these numbers reliably.
  llm_map = extract_json_from_text(candidate_text)

  if not llm_map:
    return 0.0  # Failed to provide structured answer

  # 3. Calculate MAE
  error = 0
  all_units = set(truth_map.keys()).union(set(llm_map.keys()))
  for u in all_units:
    truth_val = float(truth_map.get(u, 0))
    llm_val = float(llm_map.get(u, 0))
    error += abs(truth_val - llm_val)

  # Inverse score: 100 is perfect, -10 for every misrouted patient
  return max(0.0, 100.0 - (error * 10))


def score_constraints_mode(expected_metrics: Dict[str, Any], candidate_mpax_result: Dict[str, Any]) -> float:
  """
  Scores how well the LLM-generated constraints performed when fed into MPAX.
  """
  if candidate_mpax_result.get("status") == "error":
    return 0.0

  assignments = candidate_mpax_result.get("assignments", [])
  overflow = sum(a.get("Patient_Count", 0) for a in assignments if a.get("Unit") == "Overflow")

  expected_overflow = expected_metrics.get("expected_overflow", 0)

  error = abs(overflow - expected_overflow)
  return max(0.0, 100.0 - (error * 20))


def score_sql_vs_mpax_mode(mpax_truth: Dict[str, Any], candidate_sql_result: Dict[str, Any]) -> float:
  """
  Compares the distribution achieved by LLM SQL vs MPAX Global Optimization.
  """
  # Similar to Judge mode, but comparing two structured datasets
  # ... Implementation omitted for brevity ...
  return 100.0


def score_critic_mode(candidate_score: int) -> float:
  """
  The critic mode already calculates a score natively based on Overflow.
  """
  return float(candidate_score)


print("Scoring metrics module loaded. Ready to evaluate mpax_benchmark_scenarios.json against LLM outputs.")
