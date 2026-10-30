"""
Strongly typed Pydantic schemas for the LLM + JAX + MPAX Hospital Operations Optimization Platform.

Covers all three clinical operational use cases from `MPAX_PROJECT_PLAN.md` and
`[Technical_addendum]_MPAX_PROJECT_PLAN.md`:
1. `service_unit`: LLM-Enabled Service-Unit Assignments & Bed-Use Optimization
2. `surgical_scheduling`: LLM-Enabled Surgical Scheduling (BEDS & POINTS Post-Op Smoothing)
3. `staffing_optimization`: LLM-Enabled Physician & Nurse Scheduling Optimization
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject, SqlScalar

OptimizationUseCase: TypeAlias = Literal[
  "service_unit",
  "surgical_scheduling",
  "staffing_optimization",
]

QuickActionType: TypeAlias = Literal[
  "patient_days_by_unit",
  "patient_days_by_service",
  "combined_analysis",
  "summary_statistics",
  "optimize_service_units",
  "smooth_surgical_schedule",
  "optimize_nurse_staffing",
]

VALID_USE_CASES: tuple[OptimizationUseCase, ...] = (
  "service_unit",
  "surgical_scheduling",
  "staffing_optimization",
)

VALID_QUICK_ACTIONS: tuple[QuickActionType, ...] = (
  "patient_days_by_unit",
  "patient_days_by_service",
  "combined_analysis",
  "summary_statistics",
  "optimize_service_units",
  "smooth_surgical_schedule",
  "optimize_nurse_staffing",
)


def validate_use_case_result(raw_use_case: str) -> AppResult[OptimizationUseCase]:
  """
  Validates a raw string against `OptimizationUseCase`, returning an explicit `AppResult`.

  Args:
      raw_use_case (str): Candidate optimization use case string.

  Returns:
      AppResult[OptimizationUseCase]: `Ok(use_case)` if valid, else `Err(AppError)`.
  """
  cleaned = raw_use_case.strip()
  for uc in VALID_USE_CASES:
    if cleaned == uc:
      return Ok(uc)
  return Err(
    AppError(
      code=ErrorCode.OPTIMIZATION_USE_CASE_INVALID,
      message=f"Unsupported optimization use case '{raw_use_case}'. Valid: {', '.join(VALID_USE_CASES)}",
      status_code=400,
    )
  )


def validate_quick_action_result(raw_action: str) -> AppResult[QuickActionType]:
  """
  Validates a raw string against `QuickActionType`, returning an explicit `AppResult`.

  Args:
      raw_action (str): Candidate quick action identifier.

  Returns:
      AppResult[QuickActionType]: `Ok(action)` if valid, else `Err(AppError)`.
  """
  cleaned = raw_action.strip()
  for act in VALID_QUICK_ACTIONS:
    if cleaned == act:
      return Ok(act)
  return Err(
    AppError(
      code=ErrorCode.VALIDATION_ERROR,
      message=f"Unsupported quick action '{raw_action}'. Valid: {', '.join(VALID_QUICK_ACTIONS)}",
      status_code=400,
    )
  )


class InstitutionProfileSchema(BaseModel):
  """
  Describes a partner hospital institution profile and its non-PHI operational baseline parameters.

  Attributes:
      institution_id (str): Canonical identifier (e.g., `'stanford_childrens'`).
      name (str): Full hospital name.
      short_name (str): Concise display name.
      hospital_type (Literal["pediatric", "adult"]): Pediatric or adult academic medical center.
      total_licensed_beds (int): Total licensed inpatient beds across modeled units.
      unit_capacities (dict[str, int]): Default bed capacity per clinical unit.
      clinical_services (list[str]): Modeled clinical services.
      home_unit_map (dict[str, list[str]]): Specialized home units for each clinical service.
      surgical_programs (list[str]): Supported surgical scheduling algorithms (e.g., `['BEDS', 'POINTS']`).
      federated_node_enabled (bool): Whether privacy-preserving federated parameter sharing is active.
  """

  model_config = ConfigDict(extra="forbid")

  institution_id: str
  name: str
  short_name: str
  hospital_type: Literal["pediatric", "adult"]
  total_licensed_beds: int
  unit_capacities: dict[str, int]
  clinical_services: list[str]
  home_unit_map: dict[str, list[str]]
  surgical_programs: list[str]
  federated_node_enabled: bool = True


class ModelCompendiumEntrySchema(BaseModel):
  """
  Metadata for an LLM or On-Device ML (LiteRT) model in the optimization compendium.

  Attributes:
      model_id (str): Canonical model identifier (e.g., `'gemini-2.5-pro'`, `'medgemma-27b-text-it'`).
      display_name (str): Human-readable model name.
      family (Literal["gemini", "gemma", "medgemma", "vaultgemma", "deepseek", "llama", "litert_odml"]): Model family.
      deployment_target (Literal["gcp_cloud", "tpu_fine_tuned", "local_ollama", "litert_on_device"]): Execution runtime.
      supports_differential_privacy (bool): True for privacy-hardened models such as VaultGemma.
      supports_hot_loading (bool): True if hot-loadable via LiteRT on Android/Chrome.
  """

  model_config = ConfigDict(extra="forbid")

  model_id: str
  display_name: str
  family: Literal["gemini", "gemma", "medgemma", "vaultgemma", "deepseek", "llama", "litert_odml"]
  deployment_target: Literal["gcp_cloud", "tpu_fine_tuned", "local_ollama", "litert_on_device"]
  supports_differential_privacy: bool = False
  supports_hot_loading: bool = False


class QuickActionDefinitionSchema(BaseModel):
  """
  Metadata describing a one-click Quick Action button in the Hospital Optimization Workspace.

  Attributes:
      action_id (QuickActionType): Canonical Quick Action identifier.
      label (str): Display label shown on the Quick Action chip.
      icon (str): Icon identifier or emoji badge matching the alpha bed-use tool.
      description (str): Explanation of the analysis or optimization performed.
      use_case (OptimizationUseCase): Associated clinical optimization use case.
      default_prompt (str): Default natural-language prompt associated with this action.
  """

  model_config = ConfigDict(extra="forbid")

  action_id: QuickActionType
  label: str
  icon: str
  description: str
  use_case: OptimizationUseCase
  default_prompt: str


class ServiceUnitConstraint(BaseModel):
  """
  Mathematical constraint for Use Case 1 (Service-Unit Assignments & Bed-Use Optimization).

  Attributes:
      constraint_type (Literal["lock_service_to_unit", "prohibit_service_on_unit", "unit_capacity_delta", "unit_capacity_override", "min_service_beds", "max_service_beds"]): Type of rule.
      service (str | None): Target clinical service (e.g., `'General Pediatrics'`, `'Neurosurgery'`).
      unit (str | None): Target hospital unit (e.g., `'PCU 350'`, `'PCU 360'`, `'PICU'`).
      value (float): Numeric bed count, delta, or bound.
      rationale (str): Human-readable clinical rationale extracted from the leader's prompt.
  """

  model_config = ConfigDict(extra="forbid")

  constraint_type: Literal[
    "lock_service_to_unit",
    "prohibit_service_on_unit",
    "unit_capacity_delta",
    "unit_capacity_override",
    "min_service_beds",
    "max_service_beds",
  ]
  service: str | None = None
  unit: str | None = None
  value: float = 0.0
  rationale: str = ""


class SurgicalScheduleConstraint(BaseModel):
  """
  Mathematical constraint for Use Case 2 (Surgical Scheduling — BEDS & POINTS).

  Attributes:
      constraint_type (Literal["max_daily_postop_admits", "lock_procedure_day", "prohibit_procedure_day", "reserve_emergency_beds", "surgeon_block_cap"]): Type of surgical rule.
      program (Literal["BEDS", "POINTS", "ALL"]): Target surgical scheduling program.
      procedure_group (str | None): Surgical procedure cohort (e.g., `'Spine Fusion'`, `'VSD Repair'`).
      recovery_unit (str | None): Target post-operative recovery unit (e.g., `'PICU'`, `'CVICU'`, `'PCU 380'`).
      day_of_week (Literal["Mon", "Tue", "Wed", "Thu", "Fri"] | None): Target operating day.
      value (float): Numeric cap or reservation count.
      rationale (str): Clinical rationale for the scheduling constraint.
  """

  model_config = ConfigDict(extra="forbid")

  constraint_type: Literal[
    "max_daily_postop_admits",
    "lock_procedure_day",
    "prohibit_procedure_day",
    "reserve_emergency_beds",
    "surgeon_block_cap",
  ]
  program: Literal["BEDS", "POINTS", "ALL"] = "ALL"
  procedure_group: str | None = None
  recovery_unit: str | None = None
  day_of_week: Literal["Mon", "Tue", "Wed", "Thu", "Fri"] | None = None
  value: float = 0.0
  rationale: str = ""


class StaffingConstraint(BaseModel):
  """
  Mathematical constraint for Use Case 3 (Physician & Nurse Scheduling Optimization).

  Attributes:
      constraint_type (Literal["max_overtime_shifts", "max_a_days", "min_nurse_to_patient_ratio", "float_pool_cap", "seasonality_surge_multiplier"]): Type of staffing rule.
      unit (str | None): Target unit or `'ALL'` for cross-unit rules.
      provider_role (Literal["RN", "MD", "NP_PA", "FLOAT_RN"]): Clinical provider category.
      value (float): Numeric ratio, shift cap, or seasonal multiplier.
      rationale (str): Clinical burnout or productivity rationale.
  """

  model_config = ConfigDict(extra="forbid")

  constraint_type: Literal[
    "max_overtime_shifts",
    "max_a_days",
    "min_nurse_to_patient_ratio",
    "float_pool_cap",
    "seasonality_surge_multiplier",
  ]
  unit: str | None = None
  provider_role: Literal["RN", "MD", "NP_PA", "FLOAT_RN"] = "RN"
  value: float = 0.0
  rationale: str = ""


class PropensityLosImpactSchema(BaseModel):
  """
  Propensity-matched Length of Stay (LOS) impact estimate for Use Case 1.

  Attributes:
      baseline_mean_los_days (float): Historical mean length of stay in days.
      optimized_mean_los_days (float): Propensity-matched estimated mean LOS after reducing off-service placements.
      estimated_patient_days_saved (float): Annualized inpatient bed-days saved from on-service care specialization.
      off_service_los_penalty_days (float): Estimated additional LOS per off-service admission from propensity matching.
  """

  model_config = ConfigDict(extra="forbid")

  baseline_mean_los_days: float
  optimized_mean_los_days: float
  estimated_patient_days_saved: float
  off_service_los_penalty_days: float


class ServiceUnitAssignmentRow(BaseModel):
  """
  Single row in the Use Case 1 Service-Unit Assignment MPAX optimization output.

  Attributes:
      service (str): Clinical service name.
      unit (str): Hospital unit name.
      is_home_unit (bool): True if `unit` is a designated specialized home unit for `service`.
      baseline_patient_days (float): Historical/manual patient days assigned to this `(service, unit)` pair.
      expert_baseline_patient_days (float): Expert Gurobi/MPAX reference patient days.
      optimized_patient_days (float): User + LLM iterative MPAX optimized patient days.
      allocated_beds (int): Integer beds dedicated to `service` on `unit`.
      delta_patient_days (float): Change in patient days (`optimized_patient_days - baseline_patient_days`).
  """

  model_config = ConfigDict(extra="forbid")

  service: str
  unit: str
  is_home_unit: bool
  baseline_patient_days: float
  expert_baseline_patient_days: float
  optimized_patient_days: float
  allocated_beds: int
  delta_patient_days: float


class SurgicalBlockAssignmentRow(BaseModel):
  """
  Single row in the Use Case 2 (BEDS & POINTS) Surgical Scheduling MPAX optimization output.

  Attributes:
      program (Literal["BEDS", "POINTS"]): Non-cardiovascular (`BEDS`) or cardiovascular (`POINTS`) program.
      procedure_group (str): Elective surgical procedure cohort name.
      recovery_unit (str): Primary post-operative recovery unit (`PICU`, `CVICU`, `PCU 380`, etc.).
      day_of_week (Literal["Mon", "Tue", "Wed", "Thu", "Fri"]): Assigned day of surgery.
      baseline_cases (float): Historical number of cases scheduled on this day.
      optimized_cases (float): MPAX-smoothed number of cases scheduled on this day.
      expected_postop_los_days (float): JAX ML estimated mean post-operative LOS (accounting for long tail).
      expected_unit_occupancy (float): Resulting expected recovery unit bed demand on this day.
      unit_capacity (int): Total recovery unit bed capacity.
  """

  model_config = ConfigDict(extra="forbid")

  program: Literal["BEDS", "POINTS"]
  procedure_group: str
  recovery_unit: str
  day_of_week: Literal["Mon", "Tue", "Wed", "Thu", "Fri"]
  baseline_cases: float
  optimized_cases: float
  expected_postop_los_days: float
  expected_unit_occupancy: float
  unit_capacity: int


class StaffingShiftAssignmentRow(BaseModel):
  """
  Single row in the Use Case 3 (Physician & Nurse Scheduling) MPAX optimization output.

  Attributes:
      unit (str): Hospital unit name.
      season_window (str): Weekday / month-of-year seasonal demand window (e.g., `'Winter Mon-Wed Surge'`).
      scheduled_core_rns (float): Scheduled core unit RN FTE shifts per day.
      scheduled_float_rns (float): Cross-unit float pool RN FTE shifts allocated.
      scheduled_physicians (float): Scheduled attending/fellow physician shifts.
      unexpected_overtime_shifts (float): Expected non-voluntary overtime shifts per week.
      administrative_a_days (float): Expected A-days (shifts sent home due to low volume) per week.
      staffing_cost_per_patient_day (float): Total RN staffing cost per patient day ($ USD).
      net_margin_contribution (float): Estimated net revenue minus staffing cost per patient day ($ USD).
  """

  model_config = ConfigDict(extra="forbid")

  unit: str
  season_window: str
  scheduled_core_rns: float
  scheduled_float_rns: float
  scheduled_physicians: float
  unexpected_overtime_shifts: float
  administrative_a_days: float
  staffing_cost_per_patient_day: float
  net_margin_contribution: float


class ExpertBaselineMetricItem(BaseModel):
  """
  Quantitative comparison of a single operational KPI across Manual Historical,
  Expert-Attained Baseline (Gurobi/MPAX reference), and User + LLM MPAX Policy.

  Attributes:
      metric_key (str): Machine-readable metric key.
      label (str): Human-readable metric label.
      unit_label (str): Measurement unit (e.g., `'patient-days'`, `'cancellations/mo'`, `'$/patient-day'`).
      lower_is_better (bool): True if lower values represent better clinical/operational performance.
      manual_historical_value (float): Value under current unoptimized hospital operations.
      expert_baseline_value (float): Value attained by optimization experts (graduate-student baseline).
      llm_mpax_value (float): Value attained by the decision maker using the LLM + JAX/MPAX interface.
      improvement_vs_manual_pct (float): Percentage improvement of `llm_mpax_value` over `manual_historical_value`.
      expert_attainment_pct (float): Percentage of the expert baseline improvement captured by the user's policy.
  """

  model_config = ConfigDict(extra="forbid")

  metric_key: str
  label: str
  unit_label: str
  lower_is_better: bool = True
  manual_historical_value: float
  expert_baseline_value: float
  llm_mpax_value: float
  improvement_vs_manual_pct: float
  expert_attainment_pct: float


class DesEvaluationSummary(BaseModel):
  """
  JAX Discrete Event Simulation (DES) evaluation summary comparing the user's MPAX solution
  against the manual hospital baseline and the expert-attained baseline.

  Attributes:
      use_case (OptimizationUseCase): Evaluated use case.
      replications (int): Number of vectorized JAX Monte Carlo DES trajectories simulated.
      horizon_days (int): Simulated operational horizon in days.
      overall_expert_gap_pct (float): Relative optimality gap (%) vs. the expert baseline (0% = matches expert).
      metrics (list[ExpertBaselineMetricItem]): Breakdown of primary clinical and financial metrics.
      propensity_los_impact (PropensityLosImpactSchema | None): Propensity-matched LOS estimate (for Use Case 1).
      postop_mean_to_median_ratio (float | None): Post-op admission tail ratio (for Use Case 2).
  """

  model_config = ConfigDict(extra="forbid")

  use_case: OptimizationUseCase
  replications: int = 128
  horizon_days: int = 180
  overall_expert_gap_pct: float
  metrics: list[ExpertBaselineMetricItem]
  propensity_los_impact: PropensityLosImpactSchema | None = None
  postop_mean_to_median_ratio: float | None = None


class OptimizationSolutionPayload(BaseModel):
  """
  Unified JAX/MPAX optimization result payload across all three clinical use cases.

  Attributes:
      use_case (OptimizationUseCase): Use case that was solved.
      institution_id (str): Target hospital institution identifier.
      solver_status (Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE"]): MPAX solver convergence status.
      objective_value (float): Optimal objective value from MPAX `r2HPDHG` / `raPDHG`.
      solve_time_ms (float): JAX/MPAX solver execution duration in milliseconds.
      service_unit_assignments (list[ServiceUnitAssignmentRow]): Assignments for Use Case 1.
      surgical_schedule_assignments (list[SurgicalBlockAssignmentRow]): Assignments for Use Case 2.
      staffing_assignments (list[StaffingShiftAssignmentRow]): Assignments for Use Case 3.
      des_evaluation (DesEvaluationSummary): Quantitative JAX DES comparison against the expert baseline.
      applied_service_constraints (list[ServiceUnitConstraint]): Active Use Case 1 constraints.
      applied_surgical_constraints (list[SurgicalScheduleConstraint]): Active Use Case 2 constraints.
      applied_staffing_constraints (list[StaffingConstraint]): Active Use Case 3 constraints.
  """

  model_config = ConfigDict(extra="forbid")

  use_case: OptimizationUseCase
  institution_id: str = "stanford_childrens"
  solver_status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE"] = "OPTIMAL"
  objective_value: float
  solve_time_ms: float
  service_unit_assignments: list[ServiceUnitAssignmentRow] = Field(default_factory=list)
  surgical_schedule_assignments: list[SurgicalBlockAssignmentRow] = Field(default_factory=list)
  staffing_assignments: list[StaffingShiftAssignmentRow] = Field(default_factory=list)
  des_evaluation: DesEvaluationSummary
  applied_service_constraints: list[ServiceUnitConstraint] = Field(default_factory=list)
  applied_surgical_constraints: list[SurgicalScheduleConstraint] = Field(default_factory=list)
  applied_staffing_constraints: list[StaffingConstraint] = Field(default_factory=list)


class QuickActionExecutionRequest(BaseModel):
  """
  Request payload for executing a deterministic Quick Action (`patient_days_by_unit`, etc.).

  Attributes:
      institution_id (str): Target hospital institution profile ID.
      use_case (OptimizationUseCase): Active optimization use case.
  """

  model_config = ConfigDict(extra="forbid")

  institution_id: str = "stanford_childrens"
  use_case: OptimizationUseCase = "service_unit"


class QuickActionExecutionResponse(BaseModel):
  """
  Response returned when a user clicks one of the Quick Action buttons in the workspace.

  Attributes:
      action_id (QuickActionType): Executed Quick Action identifier.
      title (str): Human-readable report title.
      summary_markdown (str): Concise clinical narrative explaining the table/optimization output.
      columns (list[str]): Ordered column headers for tabular display.
      rows (list[dict[str, SqlScalar]]): Tabular rows computed from DuckDB census data or MPAX.
      optimization_solution (OptimizationSolutionPayload | None): Populated when the Quick Action runs an MPAX solve.
  """

  model_config = ConfigDict(extra="forbid")

  action_id: QuickActionType
  title: str
  summary_markdown: str
  columns: list[str]
  rows: list[dict[str, SqlScalar]]
  optimization_solution: OptimizationSolutionPayload | None = None


class OptimizationSolveRequest(BaseModel):
  """
  Stateless request payload for solving any of the three JAX/MPAX clinical optimization models directly.

  Attributes:
      use_case (OptimizationUseCase): Clinical use case to solve.
      institution_id (str): Partner hospital institution profile identifier.
      prompt (str | None): Optional natural-language constraint instruction to parse and apply.
      model_id (str): LLM or LiteRT model ID used when translating `prompt`.
      service_constraints (list[ServiceUnitConstraint]): Explicit Use Case 1 constraints.
      surgical_constraints (list[SurgicalScheduleConstraint]): Explicit Use Case 2 constraints.
      staffing_constraints (list[StaffingConstraint]): Explicit Use Case 3 constraints.
  """

  model_config = ConfigDict(extra="forbid")

  use_case: OptimizationUseCase = "service_unit"
  institution_id: str = "stanford_childrens"
  prompt: str | None = None
  model_id: str = "gemini-2.5-pro"
  service_constraints: list[ServiceUnitConstraint] = Field(default_factory=list)
  surgical_constraints: list[SurgicalScheduleConstraint] = Field(default_factory=list)
  staffing_constraints: list[StaffingConstraint] = Field(default_factory=list)


class OptimizationSessionCreate(BaseModel):
  """
  Request payload to create a new iterative Hospital Optimization session.

  Attributes:
      use_case (OptimizationUseCase): Clinical use case (`'service_unit'`, `'surgical_scheduling'`, or `'staffing_optimization'`).
      institution_id (str): Partner hospital institution profile ID.
      title (str | None): Optional custom session title.
      initial_prompt (str | None): Optional initial natural-language instruction to execute immediately.
      model_id (str): Default LLM or LiteRT model identifier for the session.
  """

  model_config = ConfigDict(extra="forbid")

  use_case: OptimizationUseCase = "service_unit"
  institution_id: str = "stanford_childrens"
  title: str | None = None
  initial_prompt: str | None = None
  model_id: str = "gemini-2.5-pro"


class OptimizationIterationRequest(BaseModel):
  """
  Request payload for submitting a conversational prompt or constraint update in an active session.

  Attributes:
      prompt (str): Natural language instruction from the hospital decision maker.
      quick_action_id (QuickActionType | None): Optional Quick Action triggered alongside the turn.
      model_id (str): Selected LLM or LiteRT model ID (`'gemini-2.5-pro'`, `'medgemma-27b-text-it'`, `'vaultgemma-9b'`, etc.).
      service_constraints (list[ServiceUnitConstraint] | None): Optional explicit Use Case 1 constraint overrides.
      surgical_constraints (list[SurgicalScheduleConstraint] | None): Optional explicit Use Case 2 constraint overrides.
      staffing_constraints (list[StaffingConstraint] | None): Optional explicit Use Case 3 constraint overrides.
      reset_constraints (bool): If True, clears prior session constraints before applying the new turn.
  """

  model_config = ConfigDict(extra="forbid")

  prompt: str
  quick_action_id: QuickActionType | None = None
  model_id: str = "gemini-2.5-pro"
  service_constraints: list[ServiceUnitConstraint] | None = None
  surgical_constraints: list[SurgicalScheduleConstraint] | None = None
  staffing_constraints: list[StaffingConstraint] | None = None
  reset_constraints: bool = False


class OptimizationIterationResponse(BaseModel):
  """
  Response representing a completed conversational optimization iteration.

  Attributes:
      id (str): Iteration UUID string.
      session_id (str): Parent session UUID string.
      turn_index (int): 1-based sequential turn index.
      user_prompt (str): Submitted user prompt.
      quick_action_id (str | None): Optional Quick Action identifier.
      model_id (str): Model identifier that translated constraints and explained the solution.
      assistant_explanation (str): Transparent, clinician-friendly explanation of the MPAX optimization result.
      follow_up_suggestions (list[str]): Suggested next-step prompts for iterative refinement.
      solution (OptimizationSolutionPayload): Deterministic JAX/MPAX solution and DES baseline evaluation.
      latency_ms (int): End-to-end turn execution time in milliseconds.
      created_at (datetime): Turn completion timestamp.
  """

  model_config = ConfigDict(extra="forbid")

  id: str
  session_id: str
  turn_index: int
  user_prompt: str
  quick_action_id: str | None = None
  model_id: str
  assistant_explanation: str
  follow_up_suggestions: list[str] = Field(default_factory=list)
  solution: OptimizationSolutionPayload
  latency_ms: int
  created_at: datetime


class OptimizationSessionResponse(BaseModel):
  """
  Full state of an iterative Hospital Optimization session including its history of turns.

  Attributes:
      id (str): Session UUID string.
      user_id (str): Owner user UUID string.
      use_case (OptimizationUseCase): Session optimization use case.
      institution_id (str): Partner hospital institution ID.
      title (str): Session title.
      latest_solution (OptimizationSolutionPayload | None): Most recent JAX/MPAX solution payload.
      iterations (list[OptimizationIterationResponse]): Chronological list of conversational turns.
      created_at (datetime): Session creation timestamp.
      updated_at (datetime): Session last update timestamp.
  """

  model_config = ConfigDict(extra="forbid")

  id: str
  user_id: str
  use_case: OptimizationUseCase
  institution_id: str
  title: str
  latest_solution: OptimizationSolutionPayload | None = None
  iterations: list[OptimizationIterationResponse] = Field(default_factory=list)
  created_at: datetime
  updated_at: datetime


class OptimizationSurveyCreate(BaseModel):
  """
  Payload for submitting the structured qualitative & quantitative UX evaluation survey
  mandated in `[Technical_addendum]_MPAX_PROJECT_PLAN.md`.

  Attributes:
      session_id (str | None): Optional optimization session UUID being evaluated.
      use_case (OptimizationUseCase): Evaluated optimization use case.
      role_category (str): Clinical/operational role of the respondent.
      score_vs_manual_process (int): 1-5 rating vs. the current manual graduate-student email loop.
      score_vs_other_workflow_tech (int): 1-5 rating vs. other hospital workflow technology (EHR/spreadsheets).
      interpretability_score (int): 1-5 rating of result transparency and clinical interpretability.
      qualitative_feedback (str): Free-text feedback on workflow impact and suggested improvements.
  """

  model_config = ConfigDict(extra="forbid")

  session_id: str | None = None
  use_case: OptimizationUseCase = "service_unit"
  role_category: str = "Physician"
  score_vs_manual_process: int = Field(ge=1, le=5)
  score_vs_other_workflow_tech: int = Field(ge=1, le=5)
  interpretability_score: int = Field(ge=1, le=5)
  qualitative_feedback: str = ""


class OptimizationSurveyResponse(BaseModel):
  """
  Persisted user survey record returned by the API.

  Attributes:
      id (str): Survey UUID string.
      user_id (str): Respondent user UUID string.
      session_id (str | None): Linked session UUID string if provided.
      use_case (OptimizationUseCase): Evaluated use case.
      role_category (str): Respondent role category.
      score_vs_manual_process (int): 1-5 rating vs. manual graduate-student email loop.
      score_vs_other_workflow_tech (int): 1-5 rating vs. other hospital workflow technology.
      interpretability_score (int): 1-5 rating of clinical interpretability.
      qualitative_feedback (str): Respondent's qualitative comments.
      created_at (datetime): Survey submission timestamp.
  """

  model_config = ConfigDict(extra="forbid")

  id: str
  user_id: str
  session_id: str | None = None
  use_case: OptimizationUseCase
  role_category: str
  score_vs_manual_process: int
  score_vs_other_workflow_tech: int
  interpretability_score: int
  qualitative_feedback: str
  created_at: datetime


class OptimizationEvaluationSummaryResponse(BaseModel):
  """
  Aggregated quantitative (DES Expert Baseline) and qualitative (User Survey) evaluation metrics.

  Attributes:
      total_sessions (int): Total optimization sessions created.
      total_iterations (int): Total conversational MPAX iterations executed.
      mean_expert_baseline_gap_pct (float): Average optimality gap (%) relative to expert baseline.
      survey_count (int): Total qualitative user experience surveys submitted.
      mean_score_vs_manual_process (float): Mean 1-5 rating comparing against the manual graduate-student loop.
      mean_score_vs_other_workflow_tech (float): Mean 1-5 rating comparing against other hospital workflow tech.
      mean_interpretability_score (float): Mean 1-5 rating of result transparency and interpretability.
      recent_surveys (list[OptimizationSurveyResponse]): Most recent survey submissions.
  """

  model_config = ConfigDict(extra="forbid")

  total_sessions: int
  total_iterations: int
  mean_expert_baseline_gap_pct: float
  survey_count: int
  mean_score_vs_manual_process: float
  mean_score_vs_other_workflow_tech: float
  mean_interpretability_score: float
  recent_surveys: list[OptimizationSurveyResponse] = Field(default_factory=list)


class OptimizationBenchmarkScenarioSchema(BaseModel):
  """
  Strongly typed benchmark scenario for evaluating LLM + JAX/MPAX performance across the 3 use cases.

  Attributes:
      id (str): Scenario identifier.
      use_case (OptimizationUseCase): Target use case (`service_unit`, `surgical_scheduling`, `staffing_optimization`).
      institution_id (str): Partner institution profile ID.
      theme (str): Clinical operational theme name.
      complexity (Literal["Low", "Medium", "High"]): Scenario complexity tier.
      prompt (str): Natural language decision-maker request.
      expected_constraints_json (JsonObject): Gold-standard extracted constraint payload.
      expert_baseline_metrics (dict[str, float]): Expert-attained DES baseline metrics for scoring.
  """

  model_config = ConfigDict(extra="forbid")

  id: str
  use_case: OptimizationUseCase
  institution_id: str
  theme: str
  complexity: Literal["Low", "Medium", "High"]
  prompt: str
  expected_constraints_json: JsonObject
  expert_baseline_metrics: dict[str, float]


__all__ = [
  "VALID_QUICK_ACTIONS",
  "VALID_USE_CASES",
  "DesEvaluationSummary",
  "ExpertBaselineMetricItem",
  "InstitutionProfileSchema",
  "ModelCompendiumEntrySchema",
  "OptimizationBenchmarkScenarioSchema",
  "OptimizationEvaluationSummaryResponse",
  "OptimizationIterationRequest",
  "OptimizationIterationResponse",
  "OptimizationSessionCreate",
  "OptimizationSessionResponse",
  "OptimizationSolveRequest",
  "OptimizationSolutionPayload",
  "OptimizationSurveyCreate",
  "OptimizationSurveyResponse",
  "OptimizationUseCase",
  "PropensityLosImpactSchema",
  "QuickActionDefinitionSchema",
  "QuickActionExecutionRequest",
  "QuickActionExecutionResponse",
  "QuickActionType",
  "ServiceUnitAssignmentRow",
  "ServiceUnitConstraint",
  "StaffingConstraint",
  "StaffingShiftAssignmentRow",
  "SurgicalBlockAssignmentRow",
  "SurgicalScheduleConstraint",
  "validate_quick_action_result",
  "validate_use_case_result",
]
