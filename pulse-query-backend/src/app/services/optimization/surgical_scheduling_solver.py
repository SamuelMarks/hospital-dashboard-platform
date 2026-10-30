"""
Use Case 2 Solver: LLM-Enabled Surgical Scheduling Optimization (BEDS & POINTS).

Implements the JAX ML Post-Operative Length of Stay (LOS) estimator (handling long-tailed
recovery distributions) and the MPAX linear programming surgical master schedule optimizer
(`create_lp`, `r2HPDHG`) for:
1. `BEDS`: Non-cardiovascular elective surgical scheduling (Neurosurgery, Orthopedics, General Surgery).
2. `POINTS`: Cardiovascular surgical scheduling (Congenital Heart Surgery, VSD/ASD Repair, Fontan).
"""

from __future__ import annotations

from collections.abc import Sequence
import json
import time
from typing import Literal, TypedDict

import jax.numpy as jnp

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.optimization import (
  OptimizationSolutionPayload,
  SurgicalBlockAssignmentRow,
  SurgicalScheduleConstraint,
)
from app.services.optimization.des_baseline_engine import evaluate_surgical_schedule_des
from app.services.optimization.institution_profiles import get_institution_profile_result
from app.services.optimization.mpax_lp_runner import (
  optimization_solution_cache,
  solve_mpax_linear_program,
)

DAYS_OF_WEEK: tuple[Literal["Mon", "Tue", "Wed", "Thu", "Fri"], ...] = (
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
)


class SurgicalCohortSpec(TypedDict):
  """Typed specification for an elective surgical cohort in BEDS or POINTS."""

  program: Literal["BEDS", "POINTS"]
  procedure_group: str
  recovery_unit_role: Literal["PICU", "CVICU", "ACUTE"]
  weekly_cases: float
  baseline_day_shares: tuple[float, float, float, float, float]
  median_los_days: float
  tail_sigma: float


SURGICAL_COHORTS: tuple[SurgicalCohortSpec, ...] = (
  {
    "program": "BEDS",
    "procedure_group": "Posterior Spinal Fusion & Neuro",
    "recovery_unit_role": "PICU",
    "weekly_cases": 15.0,
    "baseline_day_shares": (0.34, 0.32, 0.16, 0.10, 0.08),
    "median_los_days": 3.4,
    "tail_sigma": 0.58,
  },
  {
    "program": "BEDS",
    "procedure_group": "Otolaryngology & Airway Reconstruction",
    "recovery_unit_role": "ACUTE",
    "weekly_cases": 20.0,
    "baseline_day_shares": (0.30, 0.30, 0.20, 0.12, 0.08),
    "median_los_days": 2.1,
    "tail_sigma": 0.46,
  },
  {
    "program": "POINTS",
    "procedure_group": "Biventricular & VSD Cardiac Repair",
    "recovery_unit_role": "CVICU",
    "weekly_cases": 10.0,
    "baseline_day_shares": (0.36, 0.32, 0.16, 0.10, 0.06),
    "median_los_days": 4.8,
    "tail_sigma": 0.66,
  },
  {
    "program": "POINTS",
    "procedure_group": "Single-Ventricle & Complex Arch Reconstruction",
    "recovery_unit_role": "CVICU",
    "weekly_cases": 6.0,
    "baseline_day_shares": (0.38, 0.34, 0.14, 0.08, 0.06),
    "median_los_days": 6.2,
    "tail_sigma": 0.74,
  },
)


def estimate_postop_los_distribution(
  median_los_days: float,
  tail_sigma: float,
) -> tuple[float, list[float]]:
  r"""
  Estimates expected post-operative Length of Stay (LOS) and daily carryover weights in JAX
  accounting for long-tailed recovery distributions (Shi, Mahdian, Blanchet, Glynn, Shin & Scheinker, 2023).

  Args:
      median_los_days (float): Median post-operative stay in days.
      tail_sigma (float): Log-normal tail dispersion parameter $\sigma$.

  Returns:
      tuple[float, list[float]]: `(expected_mean_los_days, five_day_carryover_kernel)`.
  """
  med = jnp.asarray(median_los_days, dtype=jnp.float32)
  sig = jnp.asarray(tail_sigma, dtype=jnp.float32)
  expected_los = float(med * jnp.exp(0.5 * jnp.square(sig)))

  lag_days = jnp.arange(5, dtype=jnp.float32)
  survival_weights = jnp.exp(-lag_days / jnp.maximum(expected_los * 0.65, 0.5))
  norm_kernel = survival_weights / jnp.sum(survival_weights)
  return round(expected_los, 2), [round(float(w), 4) for w in norm_kernel.tolist()]


def _cohort_matches_constraint(cohort: SurgicalCohortSpec, c: SurgicalScheduleConstraint) -> bool:
  """
  Checks whether a `SurgicalScheduleConstraint` applies to `cohort`.

  Args:
      cohort (SurgicalCohortSpec): Surgical cohort specification.
      c (SurgicalScheduleConstraint): Candidate constraint.

  Returns:
      bool: True if the constraint applies to `cohort`.
  """
  program_ok = c.program in ("ALL", cohort["program"])
  group_ok = c.procedure_group is None or c.procedure_group.lower() in cohort["procedure_group"].lower()
  return program_ok and group_ok


def _apply_surgical_day_constraint(
  c: SurgicalScheduleConstraint,
  l_bounds: list[float],
  u_bounds: list[float],
) -> AppResult[None]:
  """
  Applies a day-of-week surgical constraint (`prohibit_procedure_day` or `lock_procedure_day`).

  Args:
      c (SurgicalScheduleConstraint): Day-of-week constraint.
      l_bounds (list[float]): Mutable variable lower bounds.
      u_bounds (list[float]): Mutable variable upper bounds.

  Returns:
      AppResult[None]: `Ok(None)` if valid, else `Err(AppError)`.
  """
  if c.day_of_week not in DAYS_OF_WEEK:
    return Err(
      AppError(
        code=ErrorCode.OPTIMIZATION_INVALID_CONSTRAINT,
        message=f"Invalid day_of_week '{c.day_of_week}' in surgical constraint.",
        status_code=400,
      )
    )
  num_days = len(DAYS_OF_WEEK)
  d_idx = DAYS_OF_WEEK.index(c.day_of_week)
  for p_idx, cohort in enumerate(SURGICAL_COHORTS):
    if _cohort_matches_constraint(cohort, c):
      var_idx = p_idx * num_days + d_idx
      if c.constraint_type == "prohibit_procedure_day":
        u_bounds[var_idx] = 0.0
      else:
        l_bounds[var_idx] = max(l_bounds[var_idx], c.value)
  return Ok(None)


def _apply_single_surgical_constraint(
  c: SurgicalScheduleConstraint,
  picu_unit: str,
  cvicu_unit: str,
  unit_caps: dict[str, float],
  daily_unit_cap_override: dict[str, float],
  l_bounds: list[float],
  u_bounds: list[float],
) -> AppResult[None]:
  """
  Applies a single `SurgicalScheduleConstraint` to unit capacities or day-of-week bounds.

  Args:
      c (SurgicalScheduleConstraint): Constraint to apply.
      picu_unit (str): Default PICU unit name.
      cvicu_unit (str): Default CVICU unit name.
      unit_caps (dict[str, float]): Mutable unit bed capacities.
      daily_unit_cap_override (dict[str, float]): Mutable daily post-op admit caps.
      l_bounds (list[float]): Mutable variable lower bounds.
      u_bounds (list[float]): Mutable variable upper bounds.

  Returns:
      AppResult[None]: `Ok(None)` if valid, else `Err(AppError)`.
  """
  if c.value < 0.0:
    return Err(
      AppError(
        code=ErrorCode.OPTIMIZATION_INFEASIBLE,
        message=f"Surgical constraint value cannot be negative ({c.value}).",
        status_code=400,
      )
    )

  if c.constraint_type == "reserve_emergency_beds":
    target_u = c.recovery_unit or picu_unit
    matched_u = next((u for u in unit_caps if u.lower() == target_u.strip().lower()), picu_unit)
    unit_caps[matched_u] = unit_caps[matched_u] - c.value
    if unit_caps[matched_u] <= 0.0:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INFEASIBLE,
          message=f"Emergency bed reservation ({c.value}) exceeds total capacity on unit '{matched_u}'.",
          status_code=400,
        )
      )
    return Ok(None)

  if c.constraint_type == "max_daily_postop_admits":
    if c.value < 1.5:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INFEASIBLE,
          message=f"Maximum daily post-op admits cap ({c.value}) is too restrictive.",
          status_code=400,
        )
      )
    target_u = c.recovery_unit or cvicu_unit
    matched_u = next((u for u in unit_caps if u.lower() == target_u.strip().lower()), cvicu_unit)
    daily_unit_cap_override[matched_u] = c.value
    return Ok(None)

  if c.constraint_type == "surgeon_block_cap":
    for idx in range(len(u_bounds)):
      u_bounds[idx] = min(u_bounds[idx], c.value)
    return Ok(None)

  return _apply_surgical_day_constraint(c, l_bounds, u_bounds)


def _build_surgical_schedule_rows(
  primal: list[float],
  role_to_unit: dict[str, str],
  unit_caps: dict[str, float],
) -> list[SurgicalBlockAssignmentRow]:
  """
  Builds `SurgicalBlockAssignmentRow` items from the solved MPAX primal vector.

  Args:
      primal (list[float]): Solved MPAX primal vector.
      role_to_unit (dict[str, str]): Mapping from recovery unit role to unit name.
      unit_caps (dict[str, float]): Active unit capacities.

  Returns:
      list[SurgicalBlockAssignmentRow]: Solved surgical block rows across cohorts and days.
  """
  num_days = len(DAYS_OF_WEEK)
  rows: list[SurgicalBlockAssignmentRow] = []
  for p_idx, cohort in enumerate(SURGICAL_COHORTS):
    expected_los, kernel = estimate_postop_los_distribution(cohort["median_los_days"], cohort["tail_sigma"])
    rec_unit = role_to_unit[cohort["recovery_unit_role"]]
    u_cap = round(unit_caps[rec_unit])
    cohort_days = [primal[p_idx * num_days + d] for d in range(num_days)]

    for d_idx, day_name in enumerate(DAYS_OF_WEEK):
      carryover_occ = sum(
        cohort_days[(d_idx - lag) % num_days] * kernel[lag] * (expected_los * 0.42) for lag in range(num_days)
      )
      rows.append(
        SurgicalBlockAssignmentRow(
          program=cohort["program"],
          procedure_group=cohort["procedure_group"],
          recovery_unit=rec_unit,
          day_of_week=day_name,
          baseline_cases=round(cohort["weekly_cases"] * cohort["baseline_day_shares"][d_idx], 2),
          optimized_cases=round(cohort_days[d_idx], 2),
          expected_postop_los_days=expected_los,
          expected_unit_occupancy=round(carryover_occ, 2),
          unit_capacity=u_cap,
        )
      )
  return rows


def solve_surgical_scheduling_result(
  institution_id: str = "stanford_childrens",
  constraints: Sequence[SurgicalScheduleConstraint] = (),
) -> AppResult[OptimizationSolutionPayload]:
  r"""
  Solves Use Case 2 (BEDS & POINTS Surgical Scheduling Optimization) using JAX and MPAX `r2HPDHG`.

  Assigns weekly elective surgical case volume $y_{p,d}$ across operating days $d \in \{	ext{Mon..Fri}\}$
  for each surgical cohort $p$ to smooth post-operative bed occupancy across PICU, CVICU, and Acute Care units.

  Args:
      institution_id (str): Partner hospital institution identifier.
      constraints (Sequence[SurgicalScheduleConstraint]): Surgical scheduling constraints.

  Returns:
      AppResult[OptimizationSolutionPayload]: `Ok(solution)` on convergence, or `Err(AppError)` on infeasibility.
  """
  t0 = time.perf_counter()
  prof_res = get_institution_profile_result(institution_id)
  if isinstance(prof_res, Err):
    return prof_res
  profile = prof_res.value

  unit_names = list(profile.unit_capacities.keys())
  picu_unit = next((u for u in unit_names if "PICU" in u or "ICU" in u), unit_names[0])
  cvicu_unit = next((u for u in unit_names if "CVICU" in u or "CICU" in u or "Cardiac" in u), unit_names[-1])
  acute_unit = next((u for u in unit_names if u not in (picu_unit, cvicu_unit)), unit_names[0])
  role_to_unit: dict[str, str] = {"PICU": picu_unit, "CVICU": cvicu_unit, "ACUTE": acute_unit}
  unit_caps: dict[str, float] = {u: float(cap) for u, cap in profile.unit_capacities.items()}

  num_cohorts = len(SURGICAL_COHORTS)
  num_days = len(DAYS_OF_WEEK)
  num_vars = num_cohorts * num_days
  l_bounds = [0.0] * num_vars
  u_bounds = [float("inf")] * num_vars
  daily_unit_cap_override: dict[str, float] = {}

  for c in constraints:
    c_res = _apply_single_surgical_constraint(
      c, picu_unit, cvicu_unit, unit_caps, daily_unit_cap_override, l_bounds, u_bounds
    )
    if isinstance(c_res, Err):
      return c_res

  for p_idx, cohort in enumerate(SURGICAL_COHORTS):
    max_weekly = sum(u_bounds[p_idx * num_days + d] for d in range(num_days))
    min_weekly = sum(l_bounds[p_idx * num_days + d] for d in range(num_days))
    if max_weekly < cohort["weekly_cases"] - 1e-4 or min_weekly > cohort["weekly_cases"] + 1e-4:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INFEASIBLE,
          message=f"Surgical cohort '{cohort['procedure_group']}' weekly requirement cannot be satisfied.",
          status_code=400,
        )
      )

  day_congestion_weights = (12.0, 11.0, 6.5, 6.0, 7.0)
  cost_list = [
    day_congestion_weights[d_idx]
    * (1.0 + 0.15 * estimate_postop_los_distribution(c["median_los_days"], c["tail_sigma"])[0])
    for c in SURGICAL_COHORTS
    for d_idx in range(num_days)
  ]

  a_rows: list[list[float]] = []
  b_vals: list[float] = []
  g_rows: list[list[float]] = []
  h_vals: list[float] = []

  for p_idx, cohort in enumerate(SURGICAL_COHORTS):
    eq_row = [0.0] * num_vars
    for d_idx in range(num_days):
      eq_row[p_idx * num_days + d_idx] = 1.0
    a_rows.append(eq_row)
    b_vals.append(cohort["weekly_cases"])

    target_u = role_to_unit[cohort["recovery_unit_role"]]
    cap_override = daily_unit_cap_override.get(target_u)
    base_cap = cohort["weekly_cases"] * 0.26
    daily_cap = min(base_cap, cap_override) if cap_override is not None else base_cap
    for d_idx in range(num_days):
      var_idx = p_idx * num_days + d_idx
      ineq_row = [0.0] * num_vars
      ineq_row[var_idx] = -1.0
      g_rows.append(ineq_row)
      h_vals.append(-max(daily_cap, l_bounds[var_idx]))

  cache_key = json.dumps(
    {"uc": "surgical_scheduling", "inst": profile.institution_id, "c": [c.model_dump() for c in constraints]},
    sort_keys=True,
  )
  cached = optimization_solution_cache.get(cache_key)
  if cached is not None:
    return Ok(cached)

  primal, obj_val = solve_mpax_linear_program(cost_list, a_rows, b_vals, g_rows, h_vals, l_bounds, u_bounds)

  schedule_rows = _build_surgical_schedule_rows(primal, role_to_unit, unit_caps)
  des_summary = evaluate_surgical_schedule_des(schedule_rows=schedule_rows)
  elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

  payload = OptimizationSolutionPayload(
    use_case="surgical_scheduling",
    institution_id=profile.institution_id,
    solver_status="OPTIMAL",
    objective_value=obj_val,
    solve_time_ms=elapsed_ms,
    service_unit_assignments=[],
    surgical_schedule_assignments=schedule_rows,
    staffing_assignments=[],
    des_evaluation=des_summary,
    applied_service_constraints=[],
    applied_surgical_constraints=list(constraints),
    applied_staffing_constraints=[],
  )
  optimization_solution_cache.set(cache_key, payload)
  return Ok(payload)


__all__ = [
  "DAYS_OF_WEEK",
  "SURGICAL_COHORTS",
  "SurgicalCohortSpec",
  "estimate_postop_los_distribution",
  "solve_surgical_scheduling_result",
]
