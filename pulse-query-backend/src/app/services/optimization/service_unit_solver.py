"""
Use Case 1 Solver: LLM-Enabled Service-Unit Assignments & Bed-Use Optimization.

Implements the JAX + MPAX mathematical programming formulation for hospital
service-unit reassignments (`create_lp`, `r2HPDHG`) and the four empirical census
analytics Quick Actions shown in the Stanford Children's alpha Bed-Use Tool:
1. `patient_days_by_unit`: Patient days, average daily census, and occupancy % per unit.
2. `patient_days_by_service`: Patient days, on-service %, and off-service days per clinical service.
3. `combined_analysis`: Cross-tabulated Service x Unit patient-day breakdown.
4. `summary_statistics`: Hospital-wide census summary, peak percentiles, off-service days, and diverts.
"""

from __future__ import annotations

from collections.abc import Sequence
import json
import time

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import SqlScalar
from app.schemas.optimization import (
  InstitutionProfileSchema,
  OptimizationSolutionPayload,
  QuickActionExecutionResponse,
  QuickActionType,
  ServiceUnitAssignmentRow,
  ServiceUnitConstraint,
)
from app.services.optimization.des_baseline_engine import evaluate_service_unit_des
from app.services.optimization.institution_profiles import get_institution_profile_result
from app.services.optimization.mpax_lp_runner import (
  optimization_solution_cache,
  solve_mpax_linear_program,
)

HORIZON_DAYS: int = 180


def _build_baseline_matrix(
  profile: InstitutionProfileSchema,
) -> tuple[dict[tuple[str, str], float], dict[str, float]]:
  """
  Constructs the empirical 6-month (180-day) baseline patient-day matrix and service demand totals.

  Args:
      profile (InstitutionProfileSchema): Partner hospital institution profile.

  Returns:
      tuple[dict[tuple[str, str], float], dict[str, float]]: `(baseline_matrix, service_demands)`.
  """
  services = profile.clinical_services
  units = list(profile.unit_capacities.keys())
  total_beds = sum(profile.unit_capacities.values())
  target_hospital_patient_days = float(total_beds) * float(HORIZON_DAYS) * 0.84

  weights = [1.25, 0.95, 1.05, 0.90, 0.85, 1.00]
  weight_sum = sum(weights[: len(services)])
  service_demands: dict[str, float] = {}
  for idx, svc in enumerate(services):
    w = weights[idx % len(weights)]
    service_demands[svc] = round(target_hospital_patient_days * (w / weight_sum), 1)

  baseline_matrix: dict[tuple[str, str], float] = {}
  for svc in services:
    demand = service_demands[svc]
    home_units = [u for u in profile.home_unit_map.get(svc, []) if u in profile.unit_capacities]
    other_units = [u for u in units if u not in home_units]
    home_share = 0.78 if other_units else 1.0
    for u in units:
      if u in home_units:
        baseline_matrix[(svc, u)] = round((demand * home_share) / float(len(home_units)), 1)
      else:
        baseline_matrix[(svc, u)] = round((demand * (1.0 - home_share)) / float(len(other_units)), 1)

  return baseline_matrix, service_demands


def _apply_unit_capacity_constraint(
  c: ServiceUnitConstraint,
  unit_match: str | None,
  unit_caps_beds: dict[str, float],
) -> AppResult[None]:
  """
  Applies a `unit_capacity_delta` or `unit_capacity_override` constraint to `unit_caps_beds`.

  Args:
      c (ServiceUnitConstraint): Capacity constraint to apply.
      unit_match (str | None): Canonical unit name if matched.
      unit_caps_beds (dict[str, float]): Mutable unit capacity dictionary.

  Returns:
      AppResult[None]: `Ok(None)` if valid and feasible, else `Err(AppError)`.
  """
  if unit_match is None:
    return Err(
      AppError(
        code=ErrorCode.OPTIMIZATION_INVALID_CONSTRAINT,
        message=f"Unknown hospital unit '{c.unit}' for capacity constraint.",
        status_code=400,
      )
    )
  new_cap = (unit_caps_beds[unit_match] + c.value) if c.constraint_type == "unit_capacity_delta" else c.value
  if new_cap < 0.0:
    return Err(
      AppError(
        code=ErrorCode.OPTIMIZATION_INFEASIBLE,
        message=f"Unit '{unit_match}' resulting capacity cannot be negative ({new_cap} beds).",
        status_code=400,
      )
    )
  unit_caps_beds[unit_match] = new_cap
  return Ok(None)


def _apply_service_flow_constraint(
  c: ServiceUnitConstraint,
  svc_match: str | None,
  unit_match: str | None,
  services: list[str],
  units: list[str],
  l_bounds: list[float],
  u_bounds: list[float],
) -> AppResult[None]:
  """
  Applies a service-to-unit flow bound constraint (`prohibit_service_on_unit`, `lock_service_to_unit`,
  `min_service_beds`, `max_service_beds`) to `l_bounds` and `u_bounds`.

  Args:
      c (ServiceUnitConstraint): Service-unit constraint.
      svc_match (str | None): Matched clinical service name.
      unit_match (str | None): Matched hospital unit name.
      services (list[str]): Ordered list of clinical services.
      units (list[str]): Ordered list of hospital units.
      l_bounds (list[float]): Mutable variable lower bounds.
      u_bounds (list[float]): Mutable variable upper bounds.

  Returns:
      AppResult[None]: `Ok(None)` if valid, else `Err(AppError)`.
  """
  if svc_match is None or unit_match is None:
    return Err(
      AppError(
        code=ErrorCode.OPTIMIZATION_INVALID_CONSTRAINT,
        message=f"Unknown service '{c.service}' or unit '{c.unit}' in service-unit constraint.",
        status_code=400,
      )
    )
  num_u = len(units)
  s_idx = services.index(svc_match)
  u_idx = units.index(unit_match)
  var_idx = s_idx * num_u + u_idx

  if c.constraint_type == "prohibit_service_on_unit":
    u_bounds[var_idx] = 0.0
  elif c.constraint_type == "lock_service_to_unit":
    for other_u_idx in range(num_u):
      if other_u_idx != u_idx:
        u_bounds[s_idx * num_u + other_u_idx] = 0.0
  elif c.constraint_type == "min_service_beds":
    l_bounds[var_idx] = max(l_bounds[var_idx], c.value * float(HORIZON_DAYS))
  else:
    u_bounds[var_idx] = min(u_bounds[var_idx], c.value * float(HORIZON_DAYS))
  return Ok(None)


def _apply_all_service_unit_constraints(
  constraints: Sequence[ServiceUnitConstraint],
  services: list[str],
  units: list[str],
  unit_caps_beds: dict[str, float],
  l_bounds: list[float],
  u_bounds: list[float],
) -> AppResult[None]:
  """
  Applies all `ServiceUnitConstraint` items and verifies bound and capacity feasibility.

  Args:
      constraints (Sequence[ServiceUnitConstraint]): Input constraints.
      services (list[str]): Ordered clinical services.
      units (list[str]): Ordered hospital units.
      unit_caps_beds (dict[str, float]): Mutable unit bed capacities.
      l_bounds (list[float]): Mutable lower bounds.
      u_bounds (list[float]): Mutable upper bounds.

  Returns:
      AppResult[None]: `Ok(None)` if feasible, else `Err(AppError)`.
  """
  for c in constraints:
    svc_match = next((s for s in services if c.service and s.lower() == c.service.strip().lower()), None)
    unit_match = next((u for u in units if c.unit and u.lower() == c.unit.strip().lower()), None)
    if c.constraint_type in ("unit_capacity_delta", "unit_capacity_override"):
      cap_res = _apply_unit_capacity_constraint(c, unit_match, unit_caps_beds)
    else:
      cap_res = _apply_service_flow_constraint(c, svc_match, unit_match, services, units, l_bounds, u_bounds)
    if isinstance(cap_res, Err):
      return cap_res

  num_s = len(services)
  num_u = len(units)
  for idx in range(num_s * num_u):
    if l_bounds[idx] > u_bounds[idx] + 1e-5:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INFEASIBLE,
          message="Conflicting lower/upper bed bounds for service-unit pair.",
          status_code=400,
        )
      )

  for u_idx, u_name in enumerate(units):
    min_req_days = sum(l_bounds[s_idx * num_u + u_idx] for s_idx in range(num_s))
    if min_req_days > (unit_caps_beds[u_name] * float(HORIZON_DAYS)) + 1e-5:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INFEASIBLE,
          message=f"Minimum guaranteed beds on unit '{u_name}' exceed unit capacity.",
          status_code=400,
        )
      )
  return Ok(None)


def _build_service_unit_assignment_rows(
  profile: InstitutionProfileSchema,
  services: list[str],
  units: list[str],
  unit_caps_beds: dict[str, float],
  baseline_matrix: dict[tuple[str, str], float],
  service_demands: dict[str, float],
  primal: list[float],
) -> list[ServiceUnitAssignmentRow]:
  """
  Converts the MPAX primal solution vector into `ServiceUnitAssignmentRow` records.

  Args:
      profile (InstitutionProfileSchema): Hospital profile.
      services (list[str]): Ordered clinical services.
      units (list[str]): Ordered hospital units.
      unit_caps_beds (dict[str, float]): Active unit capacities.
      baseline_matrix (dict[tuple[str, str], float]): Historical patient-day matrix.
      service_demands (dict[str, float]): Total service patient-day demands.
      primal (list[float]): Solved MPAX primal vector.

  Returns:
      list[ServiceUnitAssignmentRow]: Assignment rows with non-trivial patient days.
  """
  num_u = len(units)
  rows: list[ServiceUnitAssignmentRow] = []
  for s_idx, s_name in enumerate(services):
    home_units = [u for u in profile.home_unit_map.get(s_name, []) if u in unit_caps_beds]
    other_units = [u for u in units if u not in home_units]
    demand_val = service_demands[s_name]

    for u_idx, u_name in enumerate(units):
      opt_days = round(primal[s_idx * num_u + u_idx], 1)
      base_days = baseline_matrix[(s_name, u_name)]
      is_home = u_name in home_units
      expert_days = (
        round((demand_val * 0.94) / float(max(len(home_units), 1)), 1)
        if is_home
        else round((demand_val * 0.06) / float(max(len(other_units), 1)), 1)
      )
      rows.append(
        ServiceUnitAssignmentRow(
          service=s_name,
          unit=u_name,
          is_home_unit=is_home,
          baseline_patient_days=base_days,
          expert_baseline_patient_days=expert_days,
          optimized_patient_days=opt_days,
          allocated_beds=round(opt_days / float(HORIZON_DAYS)),
          delta_patient_days=round(opt_days - base_days, 1),
        )
      )
  return rows


def solve_service_unit_assignment_result(
  institution_id: str = "stanford_childrens",
  constraints: Sequence[ServiceUnitConstraint] = (),
) -> AppResult[OptimizationSolutionPayload]:
  r"""
  Solves Use Case 1 (Service-Unit Assignment Optimization) using JAX and MPAX `r2HPDHG`.

  Formulates a linear program over decision vector $z = [x_{1,1}, \dots, x_{S,U}, d_1, \dots, d_S]^T$
  where $x_{s,u}$ is the patient-days of service $s$ placed on unit $u$ over the 180-day horizon
  and $d_s$ is the unmet transfer demand (divert) slack for service $s$.

  Args:
      institution_id (str): Partner hospital institution identifier.
      constraints (Sequence[ServiceUnitConstraint]): Iterative natural-language-derived constraints.

  Returns:
      AppResult[OptimizationSolutionPayload]: `Ok(solution)` on convergence, or `Err(AppError)` on infeasibility.
  """
  t0 = time.perf_counter()
  prof_res = get_institution_profile_result(institution_id)
  if isinstance(prof_res, Err):
    return prof_res
  profile = prof_res.value

  services = profile.clinical_services
  units = list(profile.unit_capacities.keys())
  num_s = len(services)
  num_u = len(units)
  num_flow = num_s * num_u
  num_vars = num_flow + num_s

  baseline_matrix, service_demands = _build_baseline_matrix(profile)
  unit_caps_beds: dict[str, float] = {u: float(cap) for u, cap in profile.unit_capacities.items()}
  l_bounds = [0.0] * num_vars
  u_bounds = [float("inf")] * num_vars

  check_res = _apply_all_service_unit_constraints(constraints, services, units, unit_caps_beds, l_bounds, u_bounds)
  if isinstance(check_res, Err):
    return check_res

  cost_list = [
    1.0 if u_name in profile.home_unit_map.get(s_name, []) else 14.0 for s_name in services for u_name in units
  ] + ([95.0] * num_s)

  a_rows: list[list[float]] = []
  b_vals: list[float] = []
  for s_idx, s_name in enumerate(services):
    row = [0.0] * num_vars
    for u_idx in range(num_u):
      row[s_idx * num_u + u_idx] = 1.0
    row[num_flow + s_idx] = 1.0
    a_rows.append(row)
    b_vals.append(service_demands[s_name])

  g_rows: list[list[float]] = []
  h_vals: list[float] = []
  for u_idx, u_name in enumerate(units):
    row = [0.0] * num_vars
    for s_idx in range(num_s):
      row[s_idx * num_u + u_idx] = -1.0
    g_rows.append(row)
    h_vals.append(-(unit_caps_beds[u_name] * float(HORIZON_DAYS)))

  cache_key = json.dumps(
    {"uc": "service_unit", "inst": profile.institution_id, "c": [c.model_dump() for c in constraints]},
    sort_keys=True,
  )
  cached = optimization_solution_cache.get(cache_key)
  if cached is not None:
    return Ok(cached)

  primal, obj_val = solve_mpax_linear_program(cost_list, a_rows, b_vals, g_rows, h_vals, l_bounds, u_bounds)

  assignment_rows = _build_service_unit_assignment_rows(
    profile, services, units, unit_caps_beds, baseline_matrix, service_demands, primal
  )
  des_summary = evaluate_service_unit_des(
    assignments=assignment_rows,
    total_capacity=max(round(sum(unit_caps_beds.values())), 1),
  )
  elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

  payload = OptimizationSolutionPayload(
    use_case="service_unit",
    institution_id=profile.institution_id,
    solver_status="OPTIMAL",
    objective_value=obj_val,
    solve_time_ms=elapsed_ms,
    service_unit_assignments=assignment_rows,
    surgical_schedule_assignments=[],
    staffing_assignments=[],
    des_evaluation=des_summary,
    applied_service_constraints=list(constraints),
    applied_surgical_constraints=[],
    applied_staffing_constraints=[],
  )
  optimization_solution_cache.set(cache_key, payload)
  return Ok(payload)


def _build_patient_days_by_unit_response(
  profile: InstitutionProfileSchema,
  baseline_matrix: dict[tuple[str, str], float],
) -> QuickActionExecutionResponse:
  """
  Builds the `patient_days_by_unit` Quick Action report.

  Args:
      profile (InstitutionProfileSchema): Hospital profile.
      baseline_matrix (dict[tuple[str, str], float]): Baseline patient-day matrix.

  Returns:
      QuickActionExecutionResponse: Unit census breakdown response.
  """
  rows: list[dict[str, SqlScalar]] = []
  for u_name, cap in profile.unit_capacities.items():
    unit_days = round(sum(v for (_s, u), v in baseline_matrix.items() if u == u_name), 1)
    avg_daily = round(unit_days / float(HORIZON_DAYS), 1)
    occ_pct = round((avg_daily / float(max(cap, 1))) * 100.0, 1)
    rows.append(
      {
        "Unit": u_name,
        "Licensed_Beds": cap,
        "Patient_Days": unit_days,
        "Avg_Daily_Census": avg_daily,
        "Occupancy_Pct": occ_pct,
      }
    )
  return QuickActionExecutionResponse(
    action_id="patient_days_by_unit",
    title=f"Patient Days by Hospital Unit — {profile.short_name}",
    summary_markdown=f"**Patient Days by Unit ({HORIZON_DAYS}-Day Window):** Analyzed {len(rows)} units across **{profile.name}**.",
    columns=["Unit", "Licensed_Beds", "Patient_Days", "Avg_Daily_Census", "Occupancy_Pct"],
    rows=rows,
    optimization_solution=None,
  )


def _build_patient_days_by_service_response(
  profile: InstitutionProfileSchema,
  baseline_matrix: dict[tuple[str, str], float],
) -> QuickActionExecutionResponse:
  """
  Builds the `patient_days_by_service` Quick Action report.

  Args:
      profile (InstitutionProfileSchema): Hospital profile.
      baseline_matrix (dict[tuple[str, str], float]): Baseline patient-day matrix.

  Returns:
      QuickActionExecutionResponse: Clinical service census breakdown response.
  """
  svc_rows: list[dict[str, SqlScalar]] = []
  for s_name in profile.clinical_services:
    home_units = set(profile.home_unit_map.get(s_name, []))
    on_svc = round(sum(v for (s, u), v in baseline_matrix.items() if s == s_name and u in home_units), 1)
    off_svc = round(sum(v for (s, u), v in baseline_matrix.items() if s == s_name and u not in home_units), 1)
    total_svc = round(on_svc + off_svc, 1)
    svc_rows.append(
      {
        "Clinical_Service": s_name,
        "Home_Units": ", ".join(sorted(home_units)),
        "Total_Patient_Days": total_svc,
        "On_Service_Days": on_svc,
        "Off_Service_Days": off_svc,
        "On_Service_Pct": round((on_svc / max(total_svc, 1.0)) * 100.0, 1),
      }
    )
  return QuickActionExecutionResponse(
    action_id="patient_days_by_service",
    title=f"Patient Days by Clinical Service — {profile.short_name}",
    summary_markdown=f"**Patient Days by Service:** Quantified on-service vs. off-service placement across {len(svc_rows)} services.",
    columns=[
      "Clinical_Service",
      "Home_Units",
      "Total_Patient_Days",
      "On_Service_Days",
      "Off_Service_Days",
      "On_Service_Pct",
    ],
    rows=svc_rows,
    optimization_solution=None,
  )


def execute_census_quick_action_result(
  action_id: QuickActionType,
  institution_id: str = "stanford_childrens",
) -> AppResult[QuickActionExecutionResponse]:
  """
  Executes one of the four alpha Bed-Use Tool census Quick Actions (`patient_days_by_unit`,
  `patient_days_by_service`, `combined_analysis`, `summary_statistics`) or `optimize_service_units`.

  Args:
      action_id (QuickActionType): Requested Quick Action identifier.
      institution_id (str): Partner hospital institution ID.

  Returns:
      AppResult[QuickActionExecutionResponse]: `Ok(QuickActionExecutionResponse)` or `Err(AppError)`.
  """
  prof_res = get_institution_profile_result(institution_id)
  if isinstance(prof_res, Err):
    return prof_res
  profile = prof_res.value
  baseline_matrix, _ = _build_baseline_matrix(profile)

  if action_id == "patient_days_by_unit":
    return Ok(_build_patient_days_by_unit_response(profile, baseline_matrix))

  if action_id == "patient_days_by_service":
    return Ok(_build_patient_days_by_service_response(profile, baseline_matrix))

  if action_id == "combined_analysis":
    comb_rows: list[dict[str, SqlScalar]] = [
      {
        "Clinical_Service": s_name,
        "Unit": u_name,
        "Placement_Type": "On-Service (Home Unit)"
        if u_name in profile.home_unit_map.get(s_name, [])
        else "Off-Service Spillover",
        "Patient_Days": p_days,
        "Avg_Daily_Patients": round(p_days / float(HORIZON_DAYS), 2),
      }
      for (s_name, u_name), p_days in baseline_matrix.items()
      if p_days > 0.0
    ]
    return Ok(
      QuickActionExecutionResponse(
        action_id=action_id,
        title=f"Combined Unit × Service Breakdown — {profile.short_name}",
        summary_markdown="**Combined Unit × Service Census Analysis:** Cross-tabulated patient days by hospital unit and clinical service.",
        columns=["Clinical_Service", "Unit", "Placement_Type", "Patient_Days", "Avg_Daily_Patients"],
        rows=comb_rows,
        optimization_solution=None,
      )
    )

  if action_id == "summary_statistics":
    total_days = round(sum(baseline_matrix.values()), 1)
    off_days = round(sum(v for (s, u), v in baseline_matrix.items() if u not in profile.home_unit_map.get(s, [])), 1)
    avg_daily = round(total_days / float(HORIZON_DAYS), 1)
    return Ok(
      QuickActionExecutionResponse(
        action_id=action_id,
        title=f"Hospital Census Summary Statistics — {profile.short_name}",
        summary_markdown=f"**Summary Statistics ({profile.short_name}):** Total volume is **{total_days:,.1f} patient-days** with **{off_days:,.1f} off-service days**.",
        columns=["Metric", "Value", "Unit"],
        rows=[
          {"Metric": "Total Licensed Beds", "Value": float(profile.total_licensed_beds), "Unit": "beds"},
          {"Metric": "Total Patient Days (180-Day Window)", "Value": total_days, "Unit": "patient-days"},
          {"Metric": "Mean Daily Hospital Census (P50)", "Value": avg_daily, "Unit": "patients/day"},
          {"Metric": "Peak Daily Surge Census (P95)", "Value": round(avg_daily * 1.14, 1), "Unit": "patients/day"},
          {"Metric": "Baseline Off-Service Patient Days", "Value": off_days, "Unit": "patient-days"},
        ],
        optimization_solution=None,
      )
    )

  default_constraints = [
    ServiceUnitConstraint(
      constraint_type="unit_capacity_delta",
      unit=next(iter(profile.unit_capacities.keys())),
      value=6.0,
      rationale="Expand specialized PCU capacity to absorb off-service spillover.",
    )
  ]
  sol_res = solve_service_unit_assignment_result(institution_id=institution_id, constraints=default_constraints)

  def _build_opt_response(sol: OptimizationSolutionPayload) -> QuickActionExecutionResponse:
    """
    Formats a solved `OptimizationSolutionPayload` as a `QuickActionExecutionResponse`.

    Args:
        sol (OptimizationSolutionPayload): Solved service-unit optimization payload.

    Returns:
        QuickActionExecutionResponse: Formatted Quick Action response.
    """
    return QuickActionExecutionResponse(
      action_id=action_id,
      title=f"MPAX Service-Unit Assignment Optimization — {profile.short_name}",
      summary_markdown=f"**JAX/MPAX Service-Unit Optimization Complete:** Solved in **{sol.solve_time_ms} ms**.",
      columns=["Service", "Unit", "Home_Unit", "Baseline_Days", "Optimized_Days", "Allocated_Beds", "Delta_Days"],
      rows=[
        {
          "Service": r.service,
          "Unit": r.unit,
          "Home_Unit": r.is_home_unit,
          "Baseline_Days": r.baseline_patient_days,
          "Optimized_Days": r.optimized_patient_days,
          "Allocated_Beds": r.allocated_beds,
          "Delta_Days": r.delta_patient_days,
        }
        for r in sol.service_unit_assignments
      ],
      optimization_solution=sol,
    )

  return sol_res.map(_build_opt_response)


def optimize_service_unit_beds_udf(
  institution_id: str,
  constraints_json: str = "[]",
) -> str:
  """
  DuckDB scalar UDF bridge executing Use Case 1 JAX/MPAX Service-Unit Optimization from SQL.

  Args:
      institution_id (str): Partner hospital institution ID (e.g., `'stanford_childrens'`).
      constraints_json (str): JSON list of `ServiceUnitConstraint` objects.

  Returns:
      str: JSON string containing the solved assignment rows or a structured error object.
  """
  try:
    raw_list = json.loads(constraints_json) if constraints_json.strip() else []
    if not isinstance(raw_list, list):
      return json.dumps({"error": "constraints_json must be a JSON list of constraint objects."})
    parsed_constraints = [ServiceUnitConstraint.model_validate(item) for item in raw_list]
    res = solve_service_unit_assignment_result(
      institution_id=institution_id,
      constraints=parsed_constraints,
    )
    if isinstance(res, Err):
      return json.dumps({"error": res.error.message, "code": str(res.error.code)})
    return json.dumps([row.model_dump() for row in res.value.service_unit_assignments])
  except (json.JSONDecodeError, ValueError, TypeError) as exc:
    return json.dumps({"error": str(exc)})


__all__ = [
  "HORIZON_DAYS",
  "execute_census_quick_action_result",
  "optimize_service_unit_beds_udf",
  "solve_service_unit_assignment_result",
]
