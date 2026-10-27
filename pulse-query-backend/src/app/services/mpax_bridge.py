"""
MPAX Bridge Service.

This module provides the core logic to translate high-level hospital optimization requests
(JSON Data) into Mathematical Linear Programming formulations solvable by the MPAX/JAX engine.
It includes robust handling for "Surge" scenarios by injecting virtual overflow capacity.
"""

import asyncio
from collections.abc import Mapping, Sequence
import json
import logging
import os
from typing import Protocol, TypedDict

import jax
import jax.numpy as jnp
import numpy as np
import numpy.typing as npt
from mpax import create_lp, r2HPDHG

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject, JsonValue
from app.schemas.mpax_arena import MpaxAssignmentRow, MpaxSolverTruth
from app.schemas.simulation import DemandRow, ScenarioConstraint


class JaxConfigProtocol(Protocol):
  """Structural protocol for `jax.config` with typed `update` method."""

  def update(self, name: str, val: bool) -> None:
    """Updates a JAX configuration flag."""


os.environ.setdefault("JAX_ENABLE_X64", "True")
_jax_cfg: JaxConfigProtocol = jax.config
_jax_cfg.update("jax_enable_x64", True)

logger = logging.getLogger("mpax_bridge")


class MpaxAssignmentItem(TypedDict):
  """
  Typed dictionary representing a single optimal service-to-unit patient allocation.

  Attributes:
      Service (str): Clinical service identifier.
      Unit (str): Target hospital unit identifier (or `'Overflow'`).
      Patient_Count (float): Number of patients allocated to this unit.
  """

  Service: str
  Unit: str
  Patient_Count: float


class MpaxBridgeService:
  """
  Service responsible for orchestrating the Linear Programming optimization using MPAX.

  It accepts raw JSON strings describing Demand, Capacity, and Affinities, constructs
  the constraint matrices (A, G) and vectors (b, h, c), and formats the solution
  back into a structured result or JSON string.

  Safety Features:
  - **Overflow Handling**: Automatically adds a virtual "Overflow" unit with infinite capacity
    and high cost to prevent "Infeasible" solver errors during demand surges.
  """

  def _get_var_index(self, s_idx: int, u_idx: int, num_units: int) -> int:
    """
    Calculate the flattened variable index for a given Service-Unit pair.

    Args:
        s_idx (int): The index of the Clinical Service (row equivalent).
        u_idx (int): The index of the Hospital Unit (column equivalent).
        num_units (int): The total number of units (width of the matrix).

    Returns:
        int: The integer index in the flattened solution vector.
    """
    return s_idx * num_units + u_idx

  def _build_cost_and_equality(
    self,
    services: list[str],
    units: list[str],
    demands: dict[str, float],
    affinities: dict[str, dict[str, float]],
  ) -> tuple[jnp.ndarray, jnp.ndarray, jnp.ndarray]:
    """
    Builds the cost vector `c` and equality constraint matrices `A`, `b` (`Ax = b`).

    Args:
        services (list[str]): Sorted clinical service names.
        units (list[str]): Sorted unit names including `'Overflow'`.
        demands (dict[str, float]): Service demand map.
        affinities (dict[str, dict[str, float]]): Nested service-to-unit affinity score map.

    Returns:
        tuple[jnp.ndarray, jnp.ndarray, jnp.ndarray]: Tuple of `(c, A, b)` JAX arrays.
    """
    num_services = len(services)
    num_units = len(units)
    num_vars = num_services * num_units

    c_list: list[float] = []
    for s in services:
      for u in units:
        if u == "Overflow":
          c_list.append(100.0)
        else:
          val = affinities.get(s, {}).get(u, 0.5)
          c_list.append(-1.0 * val)

    A_rows: list[npt.NDArray[np.float64]] = []
    b_vals: list[float] = []
    for s_idx, service in enumerate(services):
      row = np.zeros(num_vars, dtype=np.float64)
      for u_idx in range(num_units):
        row[self._get_var_index(s_idx, u_idx, num_units)] = 1.0
      A_rows.append(row)
      b_vals.append(demands[service])

    return jnp.array(c_list), jnp.array(np.vstack(A_rows)), jnp.array(b_vals)

  def _build_capacity_constraints(
    self,
    num_services: int,
    units: list[str],
    capacities: dict[str, float],
  ) -> tuple[jnp.ndarray, jnp.ndarray]:
    """
    Builds the inequality constraint matrix `G` and vector `h` (`Gx >= h`).

    Args:
        num_services (int): Count of clinical services.
        units (list[str]): Ordered list of units including `'Overflow'`.
        capacities (dict[str, float]): Unit capacity dictionary.

    Returns:
        tuple[jnp.ndarray, jnp.ndarray]: Tuple of `(G, h)` JAX arrays.
    """
    num_units = len(units)
    num_vars = num_services * num_units
    G_rows: list[npt.NDArray[np.float64]] = []
    h_vals: list[float] = []

    for u_idx, unit in enumerate(units):
      if unit == "Overflow":
        continue
      row = np.zeros(num_vars, dtype=np.float64)
      for s_idx in range(num_services):
        row[self._get_var_index(s_idx, u_idx, num_units)] = -1.0
      G_rows.append(row)
      h_vals.append(-1.0 * capacities[unit])

    if G_rows:
      return jnp.array(np.vstack(G_rows)), jnp.array(h_vals)
    return jnp.zeros((1, num_vars)), jnp.array([-float("inf")])

  def _validate_aggregate_flow_totals(
    self,
    service_min_totals: dict[str, float],
    unit_min_totals: dict[str, float],
    demands: dict[str, float],
    capacities: dict[str, float],
  ) -> str | None:
    """
    Validates that cumulative minimum flow bounds do not exceed service demands or unit capacities.

    Args:
        service_min_totals (dict[str, float]): Sum of minimum flow rules per service.
        unit_min_totals (dict[str, float]): Sum of minimum flow rules per unit.
        demands (dict[str, float]): Service demand dictionary.
        capacities (dict[str, float]): Unit capacity dictionary.

    Returns:
        str | None: Error message if infeasible, or None if valid.
    """
    for s_name, total_min in service_min_totals.items():
      if s_name in demands and total_min > demands[s_name]:
        return (
          f"Infeasible constraints: cumulative minimum allocation ({total_min}) "
          f"for service '{s_name}' exceeds total service demand ({demands[s_name]})."
        )

    for u_name, total_min in unit_min_totals.items():
      if u_name in capacities and total_min > capacities[u_name]:
        return (
          f"Infeasible constraints: cumulative minimum allocation ({total_min}) "
          f"for unit '{u_name}' exceeds unit capacity ({capacities[u_name]})."
        )
    return None

  def _apply_flow_constraints(
    self,
    services: list[str],
    units: list[str],
    demands: dict[str, float],
    capacities: dict[str, float],
    constraints: Sequence[Mapping[str, JsonValue]],
  ) -> tuple[jnp.ndarray, jnp.ndarray, str | None]:
    """
    Validates capacity and custom `force_flow` rules and computes variable bounds `(l_bound, u_bound)`.

    Args:
        services (list[str]): Ordered clinical service names.
        units (list[str]): Ordered unit names.
        demands (dict[str, float]): Service demand map.
        capacities (dict[str, float]): Unit capacity map.
        constraints (Sequence[Mapping[str, JsonValue]]): Custom constraint rule dictionaries.

    Returns:
        tuple[jnp.ndarray, jnp.ndarray, str | None]: `(l_bound, u_bound, error_message_or_none)`.
    """
    num_units = len(units)
    num_vars = len(services) * num_units
    l_bound = jnp.zeros(num_vars)
    u_bound = jnp.full(num_vars, jnp.inf)

    neg_unit = next((u_name for u_name, cap in capacities.items() if cap < 0), None)
    if neg_unit is not None:
      return (
        l_bound,
        u_bound,
        f"Infeasible constraint: capacity for unit '{neg_unit}' cannot be negative ({capacities[neg_unit]}).",
      )

    service_min_totals: dict[str, float] = {}
    unit_min_totals: dict[str, float] = {}

    for rule in constraints:
      if rule.get("type") != "force_flow":
        continue
      s_name = str(rule.get("service", ""))
      u_name = str(rule.get("unit", ""))
      raw_min = rule.get("min", 0.0)
      min_val = float(raw_min) if isinstance(raw_min, (int, float, str)) else 0.0
      raw_max = rule.get("max", float("inf"))
      max_val = float(raw_max) if isinstance(raw_max, (int, float, str)) else float("inf")

      if min_val > max_val:
        return (
          l_bound,
          u_bound,
          f"Infeasible constraint: minimum flow ({min_val}) exceeds maximum flow ({max_val}) for service '{s_name}' in unit '{u_name}'.",
        )
      if s_name in demands and min_val > demands[s_name]:
        return (
          l_bound,
          u_bound,
          f"Infeasible constraint: minimum allocation ({min_val}) for service '{s_name}' exceeds total service demand ({demands[s_name]}).",
        )

      if s_name in services and u_name in units:
        service_min_totals[s_name] = service_min_totals.get(s_name, 0.0) + min_val
        if u_name != "Overflow":
          unit_min_totals[u_name] = unit_min_totals.get(u_name, 0.0) + min_val

        idx = self._get_var_index(services.index(s_name), units.index(u_name), num_units)
        l_bound = l_bound.at[idx].set(min_val) if "min" in rule else l_bound
        u_bound = u_bound.at[idx].set(max_val) if "max" in rule else u_bound

    agg_err = self._validate_aggregate_flow_totals(service_min_totals, unit_min_totals, demands, capacities)
    return l_bound, u_bound, agg_err

  def _extract_assignments(
    self,
    services: list[str],
    units: list[str],
    solution_flat: npt.NDArray[np.float64],
  ) -> list[MpaxAssignmentItem]:
    """
    Formats the flattened primal solution vector into `MpaxAssignmentItem` dictionaries.

    Args:
        services (list[str]): Ordered clinical service names.
        units (list[str]): Ordered unit names.
        solution_flat (npt.NDArray[np.float64]): 1D NumPy array of solved variable values.

    Returns:
        list[MpaxAssignmentItem]: Filtered list of non-zero patient allocations.
    """
    num_units = len(units)
    assignments: list[MpaxAssignmentItem] = []
    for s_idx, service in enumerate(services):
      for u_idx, unit in enumerate(units):
        val = float(solution_flat[self._get_var_index(s_idx, u_idx, num_units)])
        if val > 0.1:
          assignments.append({"Service": service, "Unit": unit, "Patient_Count": round(val, 2)})
    return assignments

  def _solve_parsed_inputs_result(
    self,
    demands: dict[str, float],
    capacities: dict[str, float],
    affinities: dict[str, dict[str, float]],
    constraints: Sequence[Mapping[str, JsonValue]],
  ) -> AppResult[list[MpaxAssignmentItem]]:
    """
    Executes the MPAX linear programming solver on pre-parsed Python mappings.

    Args:
        demands (dict[str, float]): Service demand map.
        capacities (dict[str, float]): Unit capacity map.
        affinities (dict[str, dict[str, float]]): Service-to-unit affinity map.
        constraints (Sequence[Mapping[str, JsonValue]]): Constraint rule mappings.

    Returns:
        AppResult[list[MpaxAssignmentItem]]: `Ok(assignments)` or `Err(AppError)`.
    """
    services = sorted(list(demands.keys()))
    real_units = sorted(list(capacities.keys()))
    units = real_units + ["Overflow"]

    if len(services) * len(units) == 0:
      logger.warning("Optimization input dimensions are zero.")
      return Ok([])

    c, A, b = self._build_cost_and_equality(services, units, demands, affinities)
    G, h = self._build_capacity_constraints(len(services), units, capacities)
    l_bound, u_bound, err_msg = self._apply_flow_constraints(services, units, demands, capacities, constraints)
    if err_msg is not None:
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INFEASIBLE,
          message=err_msg,
          status_code=422,
        )
      )

    lp = create_lp(c, A, b, G, h, l_bound, u_bound, use_sparse_matrix=False)
    solver = r2HPDHG(eps_abs=1e-3, eps_rel=1e-3, verbose=False, jit=True)
    result = solver.optimize(lp)

    if result.primal_solution is None:
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INFEASIBLE,
          message="Optimization solver determined the scenario constraints are mathematically infeasible or failed to converge.",
          status_code=422,
        )
      )

    solution_flat = np.array(result.primal_solution)
    if np.isnan(solution_flat).any() or np.isinf(solution_flat).any():
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INVALID_DATA,
          message="Solver produced invalid non-finite values (NaN or Inf).",
          status_code=400,
        )
      )

    return Ok(self._extract_assignments(services, units, solution_flat))

  def solve_unit_assignment_typed(
    self,
    demand: Sequence[DemandRow] | Mapping[str, float],
    capacity: Mapping[str, float],
    affinity: Mapping[str, Mapping[str, float]],
    constraints: Sequence[ScenarioConstraint] | None = None,
  ) -> AppResult[MpaxSolverTruth]:
    """
    Executes the MPAX linear programming solver directly from typed domain models without JSON serialization.

    Args:
        demand (Sequence[DemandRow] | Mapping[str, float]): Typed demand rows or service-to-count mapping.
        capacity (Mapping[str, float]): Unit capacity mapping.
        affinity (Mapping[str, Mapping[str, float]]): Nested service-to-unit affinity mapping.
        constraints (Sequence[ScenarioConstraint] | None): Optional typed constraint models.

    Returns:
        AppResult[MpaxSolverTruth]: `Ok(MpaxSolverTruth)` or `Err(AppError)`.
    """
    demands_dict: dict[str, float] = {}
    if isinstance(demand, Mapping):
      for svc, cnt in demand.items():
        demands_dict[str(svc)] = float(cnt)
    else:
      for row in demand:
        demands_dict[row.service] = demands_dict.get(row.service, 0.0) + row.count

    capacities_dict: dict[str, float] = {str(u): float(v) for u, v in capacity.items()}
    affinities_dict: dict[str, dict[str, float]] = {
      str(s): {str(u): float(val) for u, val in unit_map.items()} for s, unit_map in affinity.items()
    }
    constraint_dicts: list[JsonObject] = [c.model_dump(exclude_none=True) for c in (constraints or [])]

    solved_res = self.solve_unit_assignment_result(
      demand_json=demands_dict,
      capacity_json=capacities_dict,
      affinity_json=affinities_dict,
      constraints_json=constraint_dicts,
    )
    if isinstance(solved_res, Err):
      return solved_res

    rows = [
      MpaxAssignmentRow(
        Service=item["Service"],
        Unit=item["Unit"],
        Patient_Count=item["Patient_Count"],
      )
      for item in solved_res.value
    ]
    return Ok(MpaxSolverTruth(status="OPTIMAL", assignments=rows))

  def solve_unit_assignment_result(
    self,
    demand_json: str | Mapping[str, float],
    capacity_json: str | Mapping[str, float],
    affinity_json: str | Mapping[str, Mapping[str, float]],
    constraints_json: str | Sequence[Mapping[str, JsonValue]] | None = None,
  ) -> AppResult[list[MpaxAssignmentItem]]:
    """
    Executes the MPAX linear programming solver from JSON strings or pre-parsed mappings and returns `AppResult`.

    Args:
        demand_json (str | Mapping[str, float]): JSON string or mapping of Service Name to Patient Count.
        capacity_json (str | Mapping[str, float]): JSON string or mapping of Unit Name to Bed Count.
        affinity_json (str | Mapping[str, Mapping[str, float]]): JSON string or nested mapping of Service -> Unit -> Score.
        constraints_json (str | Sequence[Mapping[str, JsonValue]] | None): Optional JSON list or sequence of constraint rules.

    Returns:
        AppResult[list[MpaxAssignmentItem]]: `Ok(assignments)` or `Err(AppError)`.
    """
    try:
      demands: dict[str, float] = (
        json.loads(demand_json) if isinstance(demand_json, str) else {str(k): float(v) for k, v in demand_json.items()}
      )
      capacities: dict[str, float] = (
        json.loads(capacity_json)
        if isinstance(capacity_json, str)
        else {str(k): float(v) for k, v in capacity_json.items()}
      )
      affinities: dict[str, dict[str, float]] = (
        json.loads(affinity_json)
        if isinstance(affinity_json, str)
        else {str(s): {str(u): float(val) for u, val in u_map.items()} for s, u_map in affinity_json.items()}
      )
      if constraints_json is None:
        constraints: Sequence[Mapping[str, JsonValue]] = []
      elif isinstance(constraints_json, str):
        constraints = json.loads(constraints_json) if constraints_json else []
      else:
        constraints = constraints_json
      return self._solve_parsed_inputs_result(demands, capacities, affinities, constraints)
    except Exception as e:
      logger.error(f"Optimization Failure: {e}", exc_info=True)
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INVALID_DATA,
          message=str(e),
          status_code=400,
        )
      )

  def solve_unit_assignment(
    self,
    demand_json: str,
    capacity_json: str,
    affinity_json: str,
    constraints_json: str | None = None,
  ) -> str:
    """
    Execute the Service-Unit Assignment optimization as a DuckDB SQL UDF string boundary.

    Args:
        demand_json (str): JSON string mapping Service Name to Patient Count.
        capacity_json (str): JSON string mapping Unit Name to Bed Count.
        affinity_json (str): JSON string mapping Service -> Unit -> Score (0.0 to 1.0).
        constraints_json (str | None): Optional JSON list of constraint rules.

    Returns:
        str: JSON string containing a list of optimal assignments or an `{"error": ...}` object.
    """
    res = self.solve_unit_assignment_result(demand_json, capacity_json, affinity_json, constraints_json)
    if isinstance(res, Ok):
      return json.dumps(res.value)
    return json.dumps({"error": res.error.message})

  async def solve_unit_assignment_async(
    self,
    demand_json: str,
    capacity_json: str,
    affinity_json: str,
    constraints_json: str | None = None,
  ) -> AppResult[list[MpaxAssignmentItem]]:
    """
    Asynchronously dispatches the CPU-bound JAX/MPAX LP solver to a worker thread.

    Args:
        demand_json (str): JSON string mapping Service Name to Patient Count.
        capacity_json (str): JSON string mapping Unit Name to Bed Count.
        affinity_json (str): JSON string mapping Service -> Unit -> Score.
        constraints_json (str | None): Optional JSON list of constraint rules.

    Returns:
        AppResult[list[MpaxAssignmentItem]]: `Ok(assignments)` or `Err(AppError)`.
    """
    return await asyncio.to_thread(
      self.solve_unit_assignment_result,
      demand_json,
      capacity_json,
      affinity_json,
      constraints_json,
    )


# Singleton instance to be imported by DuckDB initializer or API routes
mpax_bridge = MpaxBridgeService()
