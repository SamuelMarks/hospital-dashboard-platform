"""
LLM-Enabled Iterative Hospital Optimization Copilot Service.

Implements the two-stage conversational optimization workflow specified in
`MPAX_PROJECT_PLAN.md` and `[Technical_addendum]_MPAX_PROJECT_PLAN.md`:
1. Natural Language Constraint Specification Agent: Translates hospital decision makers'
   natural-language operational requests into strongly typed mathematical optimization
   constraints for Use Case 1 (Service-Unit Assignments), Use Case 2 (Surgical Scheduling
   BEDS/POINTS), and Use Case 3 (Physician & Nurse Staffing).
2. Deterministic JAX/MPAX Solve + DES Expert Baseline Evaluation: Solves the linear/integer
   program in JAX/MPAX and evaluates the resulting schedule/assignment against the vectorized
   JAX Discrete Event Simulation (DES) expert baseline.
3. Interpretable Clinical Briefing Agent: Presents the optimization results in a transparent,
   clinician-friendly format and suggests iterative follow-up refinements.
"""

from __future__ import annotations

import logging
import time
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.optimization import (
  OptimizationIteration,
  OptimizationSession,
  OptimizationUserSurvey,
)
from app.models.user import User
from app.schemas.json_types import JsonObject
from app.schemas.optimization import (
  InstitutionProfileSchema,
  OptimizationEvaluationSummaryResponse,
  OptimizationIterationRequest,
  OptimizationIterationResponse,
  OptimizationSessionCreate,
  OptimizationSessionResponse,
  OptimizationSolutionPayload,
  OptimizationSolveRequest,
  OptimizationSurveyCreate,
  OptimizationSurveyResponse,
  OptimizationUseCase,
  QuickActionExecutionRequest,
  QuickActionExecutionResponse,
  ServiceUnitConstraint,
  StaffingConstraint,
  SurgicalScheduleConstraint,
  validate_quick_action_result,
  validate_use_case_result,
)
from app.services.optimization.constraint_parser import (
  extract_service_unit_constraints_from_prompt,
  extract_staffing_constraints_from_prompt,
  extract_surgical_constraints_from_prompt,
  parse_llm_constraints_json_result,
)
from app.services.optimization.institution_profiles import (
  INSTITUTION_PROFILES,
  get_institution_profile_result,
)
from app.services.optimization.service_unit_solver import (
  execute_census_quick_action_result,
  solve_service_unit_assignment_result,
)
from app.services.optimization.staffing_scheduling_solver import (
  solve_staffing_optimization_result,
)
from app.services.optimization.surgical_scheduling_solver import (
  solve_surgical_scheduling_result,
)

logger = logging.getLogger(__name__)


def _coerce_stored_use_case(raw_use_case: str, context_label: str) -> OptimizationUseCase:
  """
  Validates a stored database `use_case` string and logs a structured warning if fallback coercion is required.

  Args:
      raw_use_case (str): Stored `use_case` column value from PostgreSQL.
      context_label (str): Diagnostic context identifier (e.g., session or survey ID).

  Returns:
      OptimizationUseCase: Validated optimization use case literal.
  """
  uc_res = validate_use_case_result(raw_use_case)
  if isinstance(uc_res, Ok):
    return uc_res.value
  logger.warning(
    f"Invalid stored optimization use_case '{raw_use_case}' in {context_label}; falling back to 'service_unit'."
  )
  return "service_unit"


def generate_follow_up_suggestions(
  use_case: OptimizationUseCase,
  profile: InstitutionProfileSchema,
) -> list[str]:
  """
  Generates actionable follow-up prompt suggestions for iterative refinement without
  recomputing full clinical Markdown explanations.

  Args:
      use_case (OptimizationUseCase): Active optimization use case.
      profile (InstitutionProfileSchema): Active partner hospital profile.

  Returns:
      list[str]: Suggested follow-up natural-language prompts.
  """
  if use_case == "service_unit":
    units = list(profile.unit_capacities.keys())
    u0 = units[0]
    u1 = units[1] if len(units) > 1 else u0
    s0 = profile.clinical_services[0]
    s1 = profile.clinical_services[1] if len(profile.clinical_services) > 1 else s0
    return [
      f"Place all {s0} patients on {u0} and open {u1} with 10 additional beds",
      f"Reserve at least 10 beds for {s1} on {u1}",
      f"What happens if we close 4 beds on {u0} for renovation?",
    ]
  if use_case == "surgical_scheduling":
    return [
      "Cap daily CVICU post-op admissions for POINTS cardiac procedures at 4 cases",
      "Reserve 4 emergency recovery beds on PICU for trauma and urgent add-ons",
      "Avoid scheduling elective BEDS spine fusion procedures on Monday",
    ]
  return [
    "Cap unexpected RN overtime shifts at 2 per unit per week",
    "Expand cross-unit float pool capacity to 6 FTE shifts during winter surge",
    "Limit RN Administrative Days (A-days) to at most 2 per week",
  ]


def generate_clinical_explanation(
  solution: OptimizationSolutionPayload,
  profile: InstitutionProfileSchema,
  model_id: str,
) -> tuple[str, list[str]]:
  """
  Generates an interpretable clinical summary of the JAX/MPAX optimization output and
  suggests actionable follow-up prompts for iterative refinement.

  Args:
      solution (OptimizationSolutionPayload): Solved JAX/MPAX payload with DES metrics.
      profile (InstitutionProfileSchema): Active partner hospital profile.
      model_id (str): Identifier of the active LLM / LiteRT assistant model.

  Returns:
      tuple[str, list[str]]: `(assistant_explanation_markdown, follow_up_suggestions)`.
  """
  metrics = solution.des_evaluation.metrics
  nl = chr(10)
  suggestions = generate_follow_up_suggestions(solution.use_case, profile)

  if solution.use_case == "service_unit":
    off_m = metrics[0]
    div_m = metrics[1]
    los_impact = solution.des_evaluation.propensity_los_impact
    saved_days = los_impact.estimated_patient_days_saved if los_impact else 0.0

    explanation = (
      f"### Service-Unit Assignment Optimization ({profile.short_name} · `{model_id}`){nl}{nl}"
      f"- **Off-Service Patient Days:** Reduced from **{off_m.manual_historical_value:,.1f}** (manual baseline) "
      f"to **{off_m.llm_mpax_value:,.1f} patient-days** (**{off_m.improvement_vs_manual_pct}% reduction**, "
      f"capturing **{off_m.expert_attainment_pct}%** of the expert Gurobi/MPAX baseline).{nl}"
      f"- **Denied Transfer Requests (Diverts):** Reduced from **{div_m.manual_historical_value:,.1f}** "
      f"to **{div_m.llm_mpax_value:,.1f} diverts** (**{div_m.improvement_vs_manual_pct}% reduction**).{nl}"
      f"- **Propensity-Matched LOS Impact:** Saves an estimated **{saved_days:,.1f} inpatient bed-days** "
      "by co-locating patients with specialized nursing teams."
    )
    return explanation, suggestions

  if solution.use_case == "surgical_scheduling":
    canc_m = metrics[0]
    tail_m = metrics[1]
    explanation = (
      f"### BEDS & POINTS Surgical Schedule Smoothing ({profile.short_name} · `{model_id}`){nl}{nl}"
      f"- **Short-Notice Surgical Cancellations:** Reduced from **{canc_m.manual_historical_value:,.1f}** "
      f"to **{canc_m.llm_mpax_value:,.1f} cancellations / 6-mo** (**{canc_m.improvement_vs_manual_pct}% reduction**).{nl}"
      f"- **Post-Operative Demand Tail Smoothing:** Mean-to-median daily admission ratio improved from "
      f"**{tail_m.manual_historical_value:.2f}** to **{tail_m.llm_mpax_value:.2f}** "
      f"(expert baseline: **{tail_m.expert_baseline_value:.2f}**), eliminating early-week PICU/CVICU bottlenecks."
    )
    return explanation, suggestions

  ot_m = metrics[0]
  ad_m = metrics[1]
  cost_m = metrics[2]
  explanation = (
    f"### Cross-Unit Physician & Nurse Scheduling Optimization ({profile.short_name} · `{model_id}`){nl}{nl}"
    f"- **Unexpected RN Overtime Shifts:** Reduced from **{ot_m.manual_historical_value:,.1f}** "
    f"to **{ot_m.llm_mpax_value:,.1f} shifts/wk** (**{ot_m.improvement_vs_manual_pct}% burnout reduction**).{nl}"
    f"- **RN Administrative Days (A-Days Sent Home):** Reduced from **{ad_m.manual_historical_value:,.1f}** "
    f"to **{ad_m.llm_mpax_value:,.1f} A-days/wk** (**{ad_m.improvement_vs_manual_pct}% reduction**).{nl}"
    f"- **RN Staffing Cost per Patient Day:** Reduced from **${cost_m.manual_historical_value:,.2f}** "
    f"to **${cost_m.llm_mpax_value:,.2f} / patient-day** (**{cost_m.improvement_vs_manual_pct}% savings**)."
  )
  return explanation, suggestions


def _merge_iteration_constraints(
  use_case: OptimizationUseCase,
  profile: InstitutionProfileSchema,
  prior_json: JsonObject,
  request: OptimizationIterationRequest,
) -> tuple[list[ServiceUnitConstraint], list[SurgicalScheduleConstraint], list[StaffingConstraint]]:
  """
  Merges prior active session constraints with new prompt-extracted or explicit constraints.

  Args:
      use_case (OptimizationUseCase): Session optimization use case.
      profile (InstitutionProfileSchema): Partner hospital profile.
      prior_json (JsonObject): Prior active constraints dictionary.
      request (OptimizationIterationRequest): Incoming iteration request.

  Returns:
      tuple[list[ServiceUnitConstraint], list[SurgicalScheduleConstraint], list[StaffingConstraint]]:
          Merged constraint lists for Use Cases 1, 2, and 3.
  """
  raw_svc = prior_json.get("service_constraints", [])
  raw_surg = prior_json.get("surgical_constraints", [])
  raw_staff = prior_json.get("staffing_constraints", [])

  svc_list = [ServiceUnitConstraint.model_validate(c) for c in (raw_svc if isinstance(raw_svc, list) else [])]
  surg_list = [SurgicalScheduleConstraint.model_validate(c) for c in (raw_surg if isinstance(raw_surg, list) else [])]
  staff_list = [StaffingConstraint.model_validate(c) for c in (raw_staff if isinstance(raw_staff, list) else [])]

  if request.service_constraints is not None:
    svc_list = list(request.service_constraints)
  elif use_case == "service_unit":
    svc_list.extend(extract_service_unit_constraints_from_prompt(request.prompt, profile))

  if request.surgical_constraints is not None:
    surg_list = list(request.surgical_constraints)
  elif use_case == "surgical_scheduling":
    surg_list.extend(extract_surgical_constraints_from_prompt(request.prompt, profile))

  if request.staffing_constraints is not None:
    staff_list = list(request.staffing_constraints)
  elif use_case == "staffing_optimization":
    staff_list.extend(extract_staffing_constraints_from_prompt(request.prompt))

  return svc_list, surg_list, staff_list


class LlmOptimizationCopilotService:
  """
  Domain service orchestrating stateless and stateful conversational JAX/MPAX optimization
  across all three clinical operational use cases, Quick Actions, and qualitative UX surveys.
  """

  def solve_stateless_result(
    self,
    request: OptimizationSolveRequest,
  ) -> AppResult[OptimizationSolutionPayload]:
    """
    Executes a stateless JAX/MPAX optimization solve for any of the three clinical use cases.

    Args:
        request (OptimizationSolveRequest): Stateless solve request payload.

    Returns:
        AppResult[OptimizationSolutionPayload]: `Ok(solution)` or `Err(AppError)`.
    """
    prof_res = get_institution_profile_result(request.institution_id)
    if isinstance(prof_res, Err):
      return prof_res
    profile = prof_res.value

    if request.use_case == "service_unit":
      svc_constraints = list(request.service_constraints)
      if request.prompt:
        svc_constraints.extend(extract_service_unit_constraints_from_prompt(request.prompt, profile))
      return solve_service_unit_assignment_result(profile.institution_id, svc_constraints)

    if request.use_case == "surgical_scheduling":
      surg_constraints = list(request.surgical_constraints)
      if request.prompt:
        surg_constraints.extend(extract_surgical_constraints_from_prompt(request.prompt, profile))
      return solve_surgical_scheduling_result(profile.institution_id, surg_constraints)

    staff_constraints = list(request.staffing_constraints)
    if request.prompt:
      staff_constraints.extend(extract_staffing_constraints_from_prompt(request.prompt))
    return solve_staffing_optimization_result(profile.institution_id, staff_constraints)

  def execute_quick_action_result(
    self,
    raw_action_id: str,
    request: QuickActionExecutionRequest,
  ) -> AppResult[QuickActionExecutionResponse]:
    """
    Executes a deterministic Quick Action chip.

    Args:
        raw_action_id (str): Quick Action identifier from URL path.
        request (QuickActionExecutionRequest): Institution and use-case context.

    Returns:
        AppResult[QuickActionExecutionResponse]: `Ok(QuickActionExecutionResponse)` or `Err(AppError)`.
    """
    act_res = validate_quick_action_result(raw_action_id)
    if isinstance(act_res, Err):
      return act_res
    action_id = act_res.value

    prof_res = get_institution_profile_result(request.institution_id)
    if isinstance(prof_res, Err):
      return prof_res
    profile = prof_res.value

    if action_id in (
      "patient_days_by_unit",
      "patient_days_by_service",
      "combined_analysis",
      "summary_statistics",
      "optimize_service_units",
    ):
      return execute_census_quick_action_result(action_id=action_id, institution_id=profile.institution_id)

    if action_id == "smooth_surgical_schedule":
      surg_res = solve_surgical_scheduling_result(institution_id=profile.institution_id)

      def _build_surg_qa(sol: OptimizationSolutionPayload) -> QuickActionExecutionResponse:
        """
        Formats a surgical scheduling `OptimizationSolutionPayload` as a `QuickActionExecutionResponse`.

        Args:
            sol (OptimizationSolutionPayload): Solved surgical schedule payload.

        Returns:
            QuickActionExecutionResponse: Formatted Quick Action response.
        """
        return QuickActionExecutionResponse(
          action_id=action_id,
          title=f"BEDS & POINTS Surgical Schedule Smoothing — {profile.short_name}",
          summary_markdown=f"**Surgical Schedule Smoothing Complete:** Post-op tail ratio improved to **{sol.des_evaluation.postop_mean_to_median_ratio}**.",
          columns=[
            "Program",
            "Procedure_Group",
            "Recovery_Unit",
            "Day",
            "Baseline_Cases",
            "Optimized_Cases",
            "Expected_LOS_Days",
            "Expected_Unit_Occupancy",
          ],
          rows=[
            {
              "Program": r.program,
              "Procedure_Group": r.procedure_group,
              "Recovery_Unit": r.recovery_unit,
              "Day": r.day_of_week,
              "Baseline_Cases": r.baseline_cases,
              "Optimized_Cases": r.optimized_cases,
              "Expected_LOS_Days": r.expected_postop_los_days,
              "Expected_Unit_Occupancy": r.expected_unit_occupancy,
            }
            for r in sol.surgical_schedule_assignments
          ],
          optimization_solution=sol,
        )

      return surg_res.map(_build_surg_qa)

    staff_res = solve_staffing_optimization_result(institution_id=profile.institution_id)

    def _build_staff_qa(sol: OptimizationSolutionPayload) -> QuickActionExecutionResponse:
      """
      Formats a staffing `OptimizationSolutionPayload` as a `QuickActionExecutionResponse`.

      Args:
          sol (OptimizationSolutionPayload): Solved staffing optimization payload.

      Returns:
          QuickActionExecutionResponse: Formatted Quick Action response.
      """
      return QuickActionExecutionResponse(
        action_id=action_id,
        title=f"Cross-Unit Physician & Nurse Staffing Optimization — {profile.short_name}",
        summary_markdown=f"**Cross-Unit Staffing Optimization Complete:** Unexpected RN overtime reduced by **{sol.des_evaluation.metrics[0].improvement_vs_manual_pct}%**.",
        columns=[
          "Unit",
          "Season_Window",
          "Core_RNs",
          "Float_RNs",
          "Physicians",
          "Overtime_Shifts",
          "A_Days",
          "Cost_Per_Patient_Day",
        ],
        rows=[
          {
            "Unit": r.unit,
            "Season_Window": r.season_window,
            "Core_RNs": r.scheduled_core_rns,
            "Float_RNs": r.scheduled_float_rns,
            "Physicians": r.scheduled_physicians,
            "Overtime_Shifts": r.unexpected_overtime_shifts,
            "A_Days": r.administrative_a_days,
            "Cost_Per_Patient_Day": r.staffing_cost_per_patient_day,
          }
          for r in sol.staffing_assignments
        ],
        optimization_solution=sol,
      )

    return staff_res.map(_build_staff_qa)

  async def _load_owned_session_result(
    self,
    session_id: str,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[OptimizationSession]:
    """
    Loads an `OptimizationSession` by UUID string and enforces user ownership / admin privileges.

    Args:
        session_id (str): Target session UUID string.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user.

    Returns:
        AppResult[OptimizationSession]: `Ok(record)` or `Err(AppError)` on 400/404/403.
    """
    try:
      parsed_uuid = uuid.UUID(session_id)
    except ValueError:
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message=f"Invalid session_id UUID: '{session_id}'",
          status_code=400,
        )
      )

    stmt = (
      select(OptimizationSession)
      .where(OptimizationSession.id == parsed_uuid)
      .options(selectinload(OptimizationSession.iterations))
    )
    record = (await db.execute(stmt)).scalars().first()
    if record is None:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_SESSION_NOT_FOUND,
          message=f"Optimization session '{session_id}' not found.",
          status_code=404,
        )
      )
    if record.user_id != current_user.id and not current_user.is_admin:
      return Err(
        AppError(
          code=ErrorCode.AUTHORIZATION_ERROR,
          message="Not authorized to access this optimization session.",
          status_code=403,
        )
      )
    return Ok(record)

  async def create_session_result(
    self,
    payload: OptimizationSessionCreate,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[OptimizationSessionResponse]:
    """
    Creates and persists a new iterative `OptimizationSession` with an initial baseline solve.

    Args:
        payload (OptimizationSessionCreate): Session creation parameters.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated hospital user.

    Returns:
        AppResult[OptimizationSessionResponse]: `Ok(OptimizationSessionResponse)` or `Err(AppError)`.
    """
    prof_res = get_institution_profile_result(payload.institution_id)
    if isinstance(prof_res, Err):
      return prof_res
    profile = prof_res.value

    default_titles: dict[OptimizationUseCase, str] = {
      "service_unit": f"Service-Unit Assignments — {profile.short_name}",
      "surgical_scheduling": f"Surgical Scheduling (BEDS & POINTS) — {profile.short_name}",
      "staffing_optimization": f"Physician & Nurse Staffing — {profile.short_name}",
    }
    session_title = (payload.title or "").strip() or default_titles[payload.use_case]

    sol_res = self.solve_stateless_result(
      OptimizationSolveRequest(
        use_case=payload.use_case,
        institution_id=profile.institution_id,
        prompt=payload.initial_prompt,
        model_id=payload.model_id,
      )
    )
    if isinstance(sol_res, Err):
      return sol_res
    initial_solution = sol_res.value

    session_record = OptimizationSession(
      user_id=current_user.id,
      use_case=payload.use_case,
      institution_id=profile.institution_id,
      title=session_title,
      active_constraints_json={
        "service_constraints": [c.model_dump(mode="json") for c in initial_solution.applied_service_constraints],
        "surgical_constraints": [c.model_dump(mode="json") for c in initial_solution.applied_surgical_constraints],
        "staffing_constraints": [c.model_dump(mode="json") for c in initial_solution.applied_staffing_constraints],
      },
      latest_solution_json=initial_solution.model_dump(mode="json"),
      baseline_comparison_json=initial_solution.des_evaluation.model_dump(mode="json"),
    )
    db.add(session_record)
    await db.flush()

    if payload.initial_prompt and payload.initial_prompt.strip():
      explanation, _ = generate_clinical_explanation(initial_solution, profile, payload.model_id)
      db.add(
        OptimizationIteration(
          session_id=session_record.id,
          turn_index=1,
          user_prompt=payload.initial_prompt.strip(),
          quick_action_id=None,
          model_id=payload.model_id,
          extracted_constraints_json=session_record.active_constraints_json,
          solver_output_json=session_record.latest_solution_json,
          des_metrics_json=session_record.baseline_comparison_json,
          expert_baseline_gap=initial_solution.des_evaluation.overall_expert_gap_pct,
          assistant_explanation=explanation,
          latency_ms=max(1, round(initial_solution.solve_time_ms)),
        )
      )

    await db.commit()
    return await self.get_session_result(str(session_record.id), db, current_user)

  async def list_sessions_result(
    self,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[list[OptimizationSessionResponse]]:
    """
    Lists all iterative optimization sessions owned by `current_user`.

    Args:
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user.

    Returns:
        AppResult[list[OptimizationSessionResponse]]: `Ok(sessions)` ordered newest first.
    """
    stmt = (
      select(OptimizationSession)
      .where(OptimizationSession.user_id == current_user.id)
      .options(selectinload(OptimizationSession.iterations))
      .order_by(OptimizationSession.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return Ok([self._serialize_session(row) for row in rows])

  async def get_session_result(
    self,
    session_id: str,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[OptimizationSessionResponse]:
    """
    Retrieves a single `OptimizationSession` and its conversational iteration history.

    Args:
        session_id (str): Target session UUID string.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user.

    Returns:
        AppResult[OptimizationSessionResponse]: `Ok(session)` or `Err(AppError)` on 404/403.
    """
    rec_res = await self._load_owned_session_result(session_id, db, current_user)
    if isinstance(rec_res, Err):
      return rec_res
    return Ok(self._serialize_session(rec_res.value))

  async def delete_session_result(
    self,
    session_id: str,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[dict[str, str]]:
    """
    Deletes an `OptimizationSession` owned by `current_user`.

    Args:
        session_id (str): Target session UUID string.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user.

    Returns:
        AppResult[dict[str, str]]: `Ok({"status": "deleted"})` or `Err(AppError)`.
    """
    rec_res = await self._load_owned_session_result(session_id, db, current_user)
    if isinstance(rec_res, Err):
      return rec_res
    await db.delete(rec_res.value)
    await db.commit()
    return Ok({"status": "deleted", "session_id": session_id})

  async def iterate_session_result(
    self,
    session_id: str,
    request: OptimizationIterationRequest,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[OptimizationIterationResponse]:
    """
    Executes a conversational optimization turn within `session_id`.

    Args:
        session_id (str): Target optimization session UUID string.
        request (OptimizationIterationRequest): Conversational turn request.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user.

    Returns:
        AppResult[OptimizationIterationResponse]: `Ok(iteration_response)` or `Err(AppError)`.
    """
    t0 = time.perf_counter()
    if not request.prompt.strip():
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Iteration prompt cannot be empty.",
          status_code=400,
        )
      )

    rec_res = await self._load_owned_session_result(session_id, db, current_user)
    if isinstance(rec_res, Err):
      return rec_res
    session_rec = rec_res.value

    use_case = _coerce_stored_use_case(session_rec.use_case, f"session:{session_rec.id}")
    profile = get_institution_profile_result(session_rec.institution_id).unwrap_or(
      INSTITUTION_PROFILES["stanford_childrens"]
    )

    prior_json: JsonObject = {} if request.reset_constraints else (session_rec.active_constraints_json or {})
    svc_c, surg_c, staff_c = _merge_iteration_constraints(use_case, profile, prior_json, request)

    sol_res = self.solve_stateless_result(
      OptimizationSolveRequest(
        use_case=use_case,
        institution_id=profile.institution_id,
        prompt=None,
        model_id=request.model_id,
        service_constraints=svc_c,
        surgical_constraints=surg_c,
        staffing_constraints=staff_c,
      )
    )
    if isinstance(sol_res, Err):
      return sol_res
    solution = sol_res.value

    explanation, suggestions = generate_clinical_explanation(solution, profile, request.model_id)
    next_turn = len(session_rec.iterations) + 1
    latency_ms = max(1, round((time.perf_counter() - t0) * 1000.0))

    updated_constraints_json: JsonObject = {
      "service_constraints": [c.model_dump(mode="json") for c in solution.applied_service_constraints],
      "surgical_constraints": [c.model_dump(mode="json") for c in solution.applied_surgical_constraints],
      "staffing_constraints": [c.model_dump(mode="json") for c in solution.applied_staffing_constraints],
    }
    solution_json: JsonObject = solution.model_dump(mode="json")
    des_json: JsonObject = solution.des_evaluation.model_dump(mode="json")

    iter_record = OptimizationIteration(
      session_id=session_rec.id,
      turn_index=next_turn,
      user_prompt=request.prompt.strip(),
      quick_action_id=request.quick_action_id,
      model_id=request.model_id,
      extracted_constraints_json=updated_constraints_json,
      solver_output_json=solution_json,
      des_metrics_json=des_json,
      expert_baseline_gap=solution.des_evaluation.overall_expert_gap_pct,
      assistant_explanation=explanation,
      latency_ms=latency_ms,
    )
    session_rec.active_constraints_json = updated_constraints_json
    session_rec.latest_solution_json = solution_json
    session_rec.baseline_comparison_json = des_json

    db.add(iter_record)
    await db.commit()
    await db.refresh(iter_record)

    return Ok(
      OptimizationIterationResponse(
        id=str(iter_record.id),
        session_id=str(session_rec.id),
        turn_index=iter_record.turn_index,
        user_prompt=iter_record.user_prompt,
        quick_action_id=iter_record.quick_action_id,
        model_id=iter_record.model_id,
        assistant_explanation=iter_record.assistant_explanation,
        follow_up_suggestions=suggestions,
        solution=solution,
        latency_ms=iter_record.latency_ms,
        created_at=iter_record.created_at,
      )
    )

  async def submit_survey_result(
    self,
    payload: OptimizationSurveyCreate,
    db: AsyncSession,
    current_user: User,
  ) -> AppResult[OptimizationSurveyResponse]:
    """
    Persists a structured qualitative & quantitative UX evaluation survey (Metric 2 of Technical Addendum).

    Args:
        payload (OptimizationSurveyCreate): Validated survey submission payload.
        db (AsyncSession): Active PostgreSQL async session.
        current_user (User): Authenticated user submitting feedback.

    Returns:
        AppResult[OptimizationSurveyResponse]: `Ok(survey_response)` or `Err(AppError)`.
    """
    parsed_session_id: uuid.UUID | None = None
    if payload.session_id:
      try:
        parsed_session_id = uuid.UUID(payload.session_id)
      except ValueError:
        return Err(
          AppError(
            code=ErrorCode.SURVEY_SUBMISSION_INVALID,
            message=f"Invalid session_id UUID: '{payload.session_id}'",
            status_code=400,
          )
        )

    record = OptimizationUserSurvey(
      user_id=current_user.id,
      session_id=parsed_session_id,
      use_case=payload.use_case,
      role_category=payload.role_category.strip() or "Physician",
      score_vs_manual_process=payload.score_vs_manual_process,
      score_vs_other_workflow_tech=payload.score_vs_other_workflow_tech,
      interpretability_score=payload.interpretability_score,
      qualitative_feedback=payload.qualitative_feedback.strip(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return Ok(self._serialize_survey(record))

  async def get_evaluation_summary_result(
    self,
    db: AsyncSession,
  ) -> AppResult[OptimizationEvaluationSummaryResponse]:
    """
    Computes aggregated quantitative (DES Expert Baseline gap) and qualitative (User Survey)
    evaluation metrics across all hospital optimization sessions.

    Args:
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[OptimizationEvaluationSummaryResponse]: `Ok(summary)`.
    """
    sess_count_res = await db.execute(select(func.count(OptimizationSession.id)))
    total_sessions = int(sess_count_res.scalar() or 0)

    iter_stats_res = await db.execute(
      select(
        func.count(OptimizationIteration.id),
        func.avg(OptimizationIteration.expert_baseline_gap),
      )
    )
    iter_row = iter_stats_res.one()
    total_iterations = int(iter_row[0] or 0)
    mean_gap = round(float(iter_row[1] or 0.0), 2)

    survey_rows_res = await db.execute(
      select(OptimizationUserSurvey).order_by(OptimizationUserSurvey.created_at.desc()).limit(25)
    )
    recent_survey_records = list(survey_rows_res.scalars().all())

    survey_stats_res = await db.execute(
      select(
        func.count(OptimizationUserSurvey.id),
        func.avg(OptimizationUserSurvey.score_vs_manual_process),
        func.avg(OptimizationUserSurvey.score_vs_other_workflow_tech),
        func.avg(OptimizationUserSurvey.interpretability_score),
      )
    )
    s_row = survey_stats_res.one()
    survey_count = int(s_row[0] or 0)
    mean_manual = round(float(s_row[1] or 0.0), 2)
    mean_tech = round(float(s_row[2] or 0.0), 2)
    mean_interp = round(float(s_row[3] or 0.0), 2)

    return Ok(
      OptimizationEvaluationSummaryResponse(
        total_sessions=total_sessions,
        total_iterations=total_iterations,
        mean_expert_baseline_gap_pct=mean_gap,
        survey_count=survey_count,
        mean_score_vs_manual_process=mean_manual,
        mean_score_vs_other_workflow_tech=mean_tech,
        mean_interpretability_score=mean_interp,
        recent_surveys=[self._serialize_survey(r) for r in recent_survey_records],
      )
    )

  def _serialize_session(self, record: OptimizationSession) -> OptimizationSessionResponse:
    """
    Converts an `OptimizationSession` ORM record and its loaded iterations into an `OptimizationSessionResponse`.

    Args:
        record (OptimizationSession): ORM session instance.

    Returns:
        OptimizationSessionResponse: Serialized Pydantic response.
    """
    use_case = _coerce_stored_use_case(record.use_case, f"session:{record.id}")

    latest_sol = (
      OptimizationSolutionPayload.model_validate(record.latest_solution_json) if record.latest_solution_json else None
    )
    prof_res = get_institution_profile_result(record.institution_id)
    profile = prof_res.value if isinstance(prof_res, Ok) else INSTITUTION_PROFILES["stanford_childrens"]

    iter_responses: list[OptimizationIterationResponse] = []
    for it in record.iterations:
      sol_payload = OptimizationSolutionPayload.model_validate(it.solver_output_json or record.latest_solution_json)
      suggestions = generate_follow_up_suggestions(sol_payload.use_case, profile)
      iter_responses.append(
        OptimizationIterationResponse(
          id=str(it.id),
          session_id=str(record.id),
          turn_index=it.turn_index,
          user_prompt=it.user_prompt,
          quick_action_id=it.quick_action_id,
          model_id=it.model_id,
          assistant_explanation=it.assistant_explanation,
          follow_up_suggestions=suggestions,
          solution=sol_payload,
          latency_ms=it.latency_ms,
          created_at=it.created_at,
        )
      )

    return OptimizationSessionResponse(
      id=str(record.id),
      user_id=str(record.user_id),
      use_case=use_case,
      institution_id=record.institution_id,
      title=record.title,
      latest_solution=latest_sol,
      iterations=iter_responses,
      created_at=record.created_at,
      updated_at=record.updated_at,
    )

  def _serialize_survey(self, record: OptimizationUserSurvey) -> OptimizationSurveyResponse:
    """
    Converts an `OptimizationUserSurvey` ORM record into an `OptimizationSurveyResponse`.

    Args:
        record (OptimizationUserSurvey): ORM survey instance.

    Returns:
        OptimizationSurveyResponse: Serialized Pydantic response.
    """
    use_case = _coerce_stored_use_case(record.use_case, f"survey:{record.id}")
    return OptimizationSurveyResponse(
      id=str(record.id),
      user_id=str(record.user_id),
      session_id=str(record.session_id) if record.session_id else None,
      use_case=use_case,
      role_category=record.role_category,
      score_vs_manual_process=record.score_vs_manual_process,
      score_vs_other_workflow_tech=record.score_vs_other_workflow_tech,
      interpretability_score=record.interpretability_score,
      qualitative_feedback=record.qualitative_feedback,
      created_at=record.created_at,
    )


llm_optimization_copilot = LlmOptimizationCopilotService()

__all__ = [
  "LlmOptimizationCopilotService",
  "extract_service_unit_constraints_from_prompt",
  "extract_staffing_constraints_from_prompt",
  "extract_surgical_constraints_from_prompt",
  "generate_clinical_explanation",
  "generate_follow_up_suggestions",
  "llm_optimization_copilot",
  "parse_llm_constraints_json_result",
]
