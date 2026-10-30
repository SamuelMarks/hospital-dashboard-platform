"""
Hospital Operations Optimization Benchmark Dataset Generator.

Synthesizes non-PHI operational benchmark scenarios and expert-solved ground-truth
baselines (`pulse-query-backend/data/optimization_benchmarks.json`) across the three
clinical operational use cases from `MPAX_PROJECT_PLAN.md`:
1. `service_unit`: Service-Unit Assignments & Bed-Use Optimization
2. `surgical_scheduling`: BEDS & POINTS Surgical Scheduling Optimization
3. `staffing_optimization`: Cross-Unit Physician & Nurse Scheduling Optimization
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, TypedDict

from app.core.result import Ok
from app.schemas.json_types import JsonObject
from app.schemas.optimization import OptimizationSolveRequest, OptimizationUseCase
from app.services.optimization import (
  extract_service_unit_constraints_from_prompt,
  extract_staffing_constraints_from_prompt,
  extract_surgical_constraints_from_prompt,
  get_institution_profile_result,
  llm_optimization_copilot,
)
from app.services.optimization.institution_profiles import INSTITUTION_PROFILES


class OptimizationBenchmarkDict(TypedDict):
  """Typed dictionary representing a generated optimization benchmark entry."""

  id: str
  use_case: OptimizationUseCase
  institution_id: str
  theme: str
  complexity: Literal["Low", "Medium", "High"]
  prompt: str
  expected_constraints_json: JsonObject
  expert_baseline_metrics: dict[str, float]


SCENARIO_SEEDS: tuple[tuple[str, OptimizationUseCase, str, str, Literal["Low", "Medium", "High"], str], ...] = (
  (
    "opt-uc1-001",
    "service_unit",
    "stanford_childrens",
    "Service-Unit Reassignment & PCU Expansion",
    "Medium",
    "Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds.",
  ),
  (
    "opt-uc1-002",
    "service_unit",
    "stanford_childrens",
    "Neurosurgery Cohort Specialization",
    "High",
    "Reserve at least 10 beds for Neurosurgery on PCU 380 and open 4 additional beds on PCU 380.",
  ),
  (
    "opt-uc1-003",
    "service_unit",
    "chop",
    "Multi-Institutional Pediatric Surge Balancing",
    "Medium",
    "Assume we open PCU West with 8 additional beds and reserve at least 10 beds for Cardiology on CICU.",
  ),
  (
    "opt-uc2-001",
    "surgical_scheduling",
    "stanford_childrens",
    "POINTS Cardiovascular Recovery Smoothing",
    "High",
    "Cap daily CVICU post-op admissions for POINTS cardiac procedures at 4 cases to prevent cancellations.",
  ),
  (
    "opt-uc2-002",
    "surgical_scheduling",
    "stanford_childrens",
    "BEDS Non-Cardiovascular Spine & Trauma Buffer",
    "Medium",
    "Reserve 4 emergency recovery beds on PICU and avoid scheduling elective BEDS procedures on Monday.",
  ),
  (
    "opt-uc3-001",
    "staffing_optimization",
    "stanford_childrens",
    "Nurse Burnout & Overtime Reduction",
    "Medium",
    "Cap unexpected RN overtime shifts at 2 per week and expand cross-unit float pool to 6 shifts.",
  ),
  (
    "opt-uc3-002",
    "staffing_optimization",
    "stanford_health_care",
    "Seasonal A-Day & Staffing Cost Optimization",
    "High",
    "Limit RN Administrative Days (A-days) to 2 per week and cap overtime shifts at 3 per week.",
  ),
)


def generate_optimization_scenarios() -> list[OptimizationBenchmarkDict]:
  """
  Synthesizes and solves the canonical multi-use-case optimization benchmark scenarios.

  Returns:
      list[OptimizationBenchmarkDict]: Solved benchmark scenario dictionaries.
  """
  scenarios: list[OptimizationBenchmarkDict] = []

  for scen_id, use_case, inst_id, theme, complexity, prompt in SCENARIO_SEEDS:
    prof = get_institution_profile_result(inst_id).unwrap_or(INSTITUTION_PROFILES["stanford_childrens"])
    svc_c = extract_service_unit_constraints_from_prompt(prompt, prof) if use_case == "service_unit" else []
    surg_c = extract_surgical_constraints_from_prompt(prompt, prof) if use_case == "surgical_scheduling" else []
    staff_c = extract_staffing_constraints_from_prompt(prompt) if use_case == "staffing_optimization" else []

    sol_res = llm_optimization_copilot.solve_stateless_result(
      OptimizationSolveRequest(
        use_case=use_case,
        institution_id=inst_id,
        prompt=prompt,
      )
    )
    assert isinstance(sol_res, Ok)
    sol = sol_res.value
    baseline_metrics: dict[str, float] = {m.metric_key: m.expert_baseline_value for m in sol.des_evaluation.metrics}

    scenarios.append(
      {
        "id": scen_id,
        "use_case": use_case,
        "institution_id": inst_id,
        "theme": theme,
        "complexity": complexity,
        "prompt": prompt,
        "expected_constraints_json": {
          "service_constraints": [json.loads(c.model_dump_json()) for c in svc_c],
          "surgical_constraints": [json.loads(c.model_dump_json()) for c in surg_c],
          "staffing_constraints": [json.loads(c.model_dump_json()) for c in staff_c],
        },
        "expert_baseline_metrics": baseline_metrics,
      }
    )

  return scenarios


def main(output_path: Path | None = None) -> Path:
  """
  Generates the optimization benchmark dataset and writes it to `data/optimization_benchmarks.json`.

  Args:
      output_path (Path | None): Optional custom output path override.

  Returns:
      Path: Path to the written JSON benchmark dataset.
  """
  data = generate_optimization_scenarios()
  out_file = (
    output_path
    if output_path is not None
    else Path(__file__).resolve().parent.parent / "data" / "optimization_benchmarks.json"
  )
  out_file.parent.mkdir(parents=True, exist_ok=True)
  with open(out_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

  print(f"Successfully generated {len(data)} Hospital Optimization benchmark scenarios at {out_file}")
  return out_file


if __name__ == "__main__":
  main()
