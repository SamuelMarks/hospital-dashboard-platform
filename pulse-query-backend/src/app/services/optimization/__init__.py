"""
Hospital Operations Optimization Package (LLM + JAX + MPAX).

Exports the three clinical optimization solvers, the vectorized JAX Discrete Event
Simulation (DES) Expert Baseline Engine, multi-institutional partner profiles,
and the Conversational LLM Optimization Copilot service.
"""

from app.services.optimization.des_baseline_engine import (
  evaluate_service_unit_des,
  evaluate_staffing_schedule_des,
  evaluate_surgical_schedule_des,
)
from app.services.optimization.institution_profiles import (
  INSTITUTION_PROFILES,
  MODEL_COMPENDIUM,
  QUICK_ACTIONS,
  aggregate_federated_los_priors,
  get_institution_profile_result,
  list_institution_profiles,
  list_model_compendium,
  list_quick_actions,
)
from app.services.optimization.llm_optimization_copilot import (
  LlmOptimizationCopilotService,
  extract_service_unit_constraints_from_prompt,
  extract_staffing_constraints_from_prompt,
  extract_surgical_constraints_from_prompt,
  generate_clinical_explanation,
  llm_optimization_copilot,
)
from app.services.optimization.service_unit_solver import (
  HORIZON_DAYS,
  execute_census_quick_action_result,
  optimize_service_unit_beds_udf,
  solve_service_unit_assignment_result,
)
from app.services.optimization.staffing_scheduling_solver import (
  SEASON_WINDOWS,
  solve_staffing_optimization_result,
)
from app.services.optimization.surgical_scheduling_solver import (
  DAYS_OF_WEEK,
  SURGICAL_COHORTS,
  SurgicalCohortSpec,
  estimate_postop_los_distribution,
  solve_surgical_scheduling_result,
)

__all__ = [
  "DAYS_OF_WEEK",
  "HORIZON_DAYS",
  "INSTITUTION_PROFILES",
  "MODEL_COMPENDIUM",
  "QUICK_ACTIONS",
  "SEASON_WINDOWS",
  "SURGICAL_COHORTS",
  "LlmOptimizationCopilotService",
  "SurgicalCohortSpec",
  "aggregate_federated_los_priors",
  "estimate_postop_los_distribution",
  "evaluate_service_unit_des",
  "evaluate_staffing_schedule_des",
  "evaluate_surgical_schedule_des",
  "execute_census_quick_action_result",
  "extract_service_unit_constraints_from_prompt",
  "extract_staffing_constraints_from_prompt",
  "extract_surgical_constraints_from_prompt",
  "generate_clinical_explanation",
  "get_institution_profile_result",
  "list_institution_profiles",
  "list_model_compendium",
  "list_quick_actions",
  "llm_optimization_copilot",
  "optimize_service_unit_beds_udf",
  "solve_service_unit_assignment_result",
  "solve_staffing_optimization_result",
  "solve_surgical_scheduling_result",
]
