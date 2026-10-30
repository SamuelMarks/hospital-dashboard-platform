"""
Model Compendium & DES Expert Baseline Evaluation Module (`evaluate_optimization_models.py`).

Evaluates out-of-the-box and JAX/TPU fine-tuned models from `[Technical_addendum]_MPAX_PROJECT_PLAN.md`:
- `gemini-2.5-pro` (Regulatory-Compliant Cloud Agent)
- `medgemma-27b-text-it` (JAX/TPU Clinical Optimization Tuned)
- `vaultgemma-9b` (Differentially Private Healthcare LLM)
- `gemma4:26b` (JAX/MaxText TPU Fine-Tuned)
- `deepseek-r1` (Mathematical Reasoning Comparator)
- `llama-3.3-70b` (Open-Source Comparator)
- `litert-medgemma-4b-int4` (On-Device Hot-Loadable Android/Chrome)

Scores each model on:
1. Constraint Translation Accuracy (`constraint_f1_score`)
2. Quantitative Optimality Attainment vs. JAX DES Expert Baseline (`expert_attainment_pct`)
3. Clinical Explanation Faithfulness (`explanation_faithfulness_score`)
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import json
from pathlib import Path
from typing import TypedDict

from app.core.result import Err
from app.schemas.json_types import JsonObject, JsonValue
from app.schemas.optimization import OptimizationSolveRequest, validate_use_case_result
from app.services.optimization import (
  generate_clinical_explanation,
  get_institution_profile_result,
  list_model_compendium,
  llm_optimization_copilot,
)
from app.services.optimization.institution_profiles import INSTITUTION_PROFILES
from scripts.generate_optimization_benchmarks import (
  OptimizationBenchmarkDict,
  generate_optimization_scenarios,
)


class ModelBenchmarkEvaluationRow(TypedDict):
  """Typed dictionary representing one model's evaluation metrics on a benchmark scenario."""

  scenario_id: str
  use_case: str
  model_id: str
  constraint_f1_score: float
  expert_attainment_pct: float
  explanation_faithfulness_score: float
  composite_score: float


def score_constraint_translation(
  expected_constraints: Mapping[str, JsonValue],
  actual_constraints: Mapping[str, JsonValue],
) -> float:
  """
  Computes deterministic constraint-extraction accuracy in `[0.0, 100.0]`.

  Args:
      expected_constraints (Mapping[str, JsonValue]): Gold-standard constraint dictionary.
      actual_constraints (Mapping[str, JsonValue]): Extracted constraint dictionary.

  Returns:
      float: Percentage match score in `[0.0, 100.0]`.
  """
  keys = ("service_constraints", "surgical_constraints", "staffing_constraints")
  total_expected = 0
  matched = 0

  for k in keys:
    exp_list = expected_constraints.get(k, [])
    act_list = actual_constraints.get(k, [])
    exp_items = exp_list if isinstance(exp_list, list) else []
    act_items = act_list if isinstance(act_list, list) else []
    total_expected += len(exp_items)
    act_types = {str(item.get("constraint_type")) for item in act_items if isinstance(item, Mapping)}
    for exp_item in exp_items:
      if isinstance(exp_item, Mapping) and str(exp_item.get("constraint_type")) in act_types:
        matched += 1

  if total_expected == 0:
    return 100.0
  return round((float(matched) / float(total_expected)) * 100.0, 2)


def score_explanation_faithfulness(explanation: str, metric_values: Sequence[float]) -> float:
  """
  Verifies that the natural-language clinical explanation faithfully cites the solved MPAX metrics.

  Args:
      explanation (str): Markdown explanation produced by the copilot.
      metric_values (Sequence[float]): Primary solved numeric KPIs.

  Returns:
      float: Faithfulness percentage in `[0.0, 100.0]`.
  """
  if not explanation.strip():
    return 0.0
  if not metric_values:
    return 100.0

  hits = 0
  for val in metric_values:
    formatted_1 = f"{val:,.1f}"
    formatted_2 = f"{val:.2f}"
    if formatted_1 in explanation or formatted_2 in explanation:
      hits += 1
  return round((float(hits) / float(len(metric_values))) * 100.0, 2)


def evaluate_all_models_on_benchmarks(
  scenarios: Sequence[OptimizationBenchmarkDict] | None = None,
) -> list[ModelBenchmarkEvaluationRow]:
  """
  Evaluates the model compendium across all optimization benchmark scenarios.

  Args:
      scenarios (Sequence[OptimizationBenchmarkDict] | None): Optional pre-loaded scenarios.

  Returns:
      list[ModelBenchmarkEvaluationRow]: Evaluation rows for every `(scenario, model)` pair.
  """
  active_scenarios = list(scenarios) if scenarios is not None else generate_optimization_scenarios()
  models = list_model_compendium()
  results: list[ModelBenchmarkEvaluationRow] = []

  for scen in active_scenarios:
    uc_res = validate_use_case_result(scen["use_case"])
    use_case = uc_res.unwrap_or("service_unit")

    for model_entry in models:
      sol_res = llm_optimization_copilot.solve_stateless_result(
        OptimizationSolveRequest(
          use_case=use_case,
          institution_id=scen["institution_id"],
          prompt=scen["prompt"],
          model_id=model_entry.model_id,
        )
      )
      if isinstance(sol_res, Err):
        results.append(
          {
            "scenario_id": scen["id"],
            "use_case": use_case,
            "model_id": model_entry.model_id,
            "constraint_f1_score": 0.0,
            "expert_attainment_pct": 0.0,
            "explanation_faithfulness_score": 0.0,
            "composite_score": 0.0,
          }
        )
        continue

      sol = sol_res.value
      actual_constraints: JsonObject = {
        "service_constraints": [json.loads(c.model_dump_json()) for c in sol.applied_service_constraints],
        "surgical_constraints": [json.loads(c.model_dump_json()) for c in sol.applied_surgical_constraints],
        "staffing_constraints": [json.loads(c.model_dump_json()) for c in sol.applied_staffing_constraints],
      }
      c_score = score_constraint_translation(scen["expected_constraints_json"], actual_constraints)
      attainment = round(max(0.0, 100.0 - sol.des_evaluation.overall_expert_gap_pct), 2)

      prof = get_institution_profile_result(scen["institution_id"]).unwrap_or(INSTITUTION_PROFILES["stanford_childrens"])
      explanation, _ = generate_clinical_explanation(sol, prof, model_entry.model_id)
      f_score = score_explanation_faithfulness(
        explanation,
        [m.llm_mpax_value for m in sol.des_evaluation.metrics],
      )
      composite = round(0.45 * c_score + 0.40 * attainment + 0.15 * f_score, 2)

      results.append(
        {
          "scenario_id": scen["id"],
          "use_case": use_case,
          "model_id": model_entry.model_id,
          "constraint_f1_score": c_score,
          "expert_attainment_pct": attainment,
          "explanation_faithfulness_score": f_score,
          "composite_score": composite,
        }
      )

  return results


def main(output_path: Path | None = None) -> list[ModelBenchmarkEvaluationRow]:
  """
  Runs the comparative model evaluation suite and optionally writes JSON results to `output_path`.

  Args:
      output_path (Path | None): Optional output JSON path.

  Returns:
      list[ModelBenchmarkEvaluationRow]: Evaluated leaderboard rows.
  """
  rows = evaluate_all_models_on_benchmarks()
  if output_path is not None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
      json.dump(rows, f, indent=2)
  print(f"Evaluated {len(rows)} model-scenario pairs across Use Cases 1, 2, and 3.")
  return rows


if __name__ == "__main__":
  main()
