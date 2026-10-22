"""
Simulation Orchestration Service.

Integrates the Data Layer (DuckDB) with the Optimization Engine (MPAX).
Unlike standard widget execution, this service performs a multi-step process:
1. Executes raw SQL to fetch live clinical demand.
2. Transforms tabular SQL results into the JSON structure required by the Solver.
3. Injects user-defined capacity/constraint parameters.
4. Executes the Solver (which includes virtual Overflow logic).
5. Calculates Deltas to show the user exactly where patients moved.
"""

import asyncio
from collections.abc import Sequence
import json
import logging
from typing import Any

import duckdb

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.schemas.simulation import (
  ScenarioResult,
  ScenarioRunRequest,
  SimulationAssignment,
)
from app.services.mpax_bridge import MpaxAssignmentItem, mpax_bridge

logger = logging.getLogger("simulation_service")


class SimulationInfeasibleError(ValueError):
  """Raised when an optimization scenario is mathematically infeasible or contains contradictory constraints."""


class SimulationService:
  """
  Service for running transient "What-If" optimization scenarios.
  """

  def run_scenario_result(
    self,
    request: ScenarioRunRequest,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> AppResult[ScenarioResult]:
    """
    Executes a simulation scenario and returns an explicit `AppResult[ScenarioResult]`.

    Args:
        request (ScenarioRunRequest): Scenario configuration payload.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        AppResult[ScenarioResult]: `Ok(ScenarioResult)` on success, or `Err(AppError)` on failure.
    """
    logger.info("Starting Simulation Scenario Run")
    try:
      demand_json, current_state = self._fetch_demand_payload(
        request.demand_source_sql,
        olap_conn=olap_conn,
      )
      capacity_json = json.dumps(request.capacity_parameters)
      constraints_json = json.dumps([c.model_dump() for c in request.constraints])
      affinity_json = json.dumps(request.affinity_overrides)

      solver_res = mpax_bridge.solve_unit_assignment_result(
        demand_json=demand_json,
        capacity_json=capacity_json,
        affinity_json=affinity_json,
        constraints_json=constraints_json,
      )
      if isinstance(solver_res, Err):
        return solver_res

      parsed_assignments = self._diff_assignments(solver_res.value, current_state)
      return Ok(ScenarioResult(assignments=parsed_assignments, status="success"))
    except SimulationInfeasibleError as e:
      return Err(AppError(code=ErrorCode.SIMULATION_INFEASIBLE, message=str(e), status_code=422))
    except ValueError as e:
      return Err(AppError(code=ErrorCode.SIMULATION_INVALID_DATA, message=str(e), status_code=400))
    except Exception as e:
      return Err(AppError(code=ErrorCode.INTERNAL_ERROR, message=f"Simulation Failed: {e!s}", status_code=500))

  def run_scenario(
    self,
    request: ScenarioRunRequest,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> ScenarioResult:
    """
    Executes a simulation based on the provided configuration, unwrapping `run_scenario_result`.

    Args:
        request (ScenarioRunRequest): The scenario definition.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        ScenarioResult: The optimal allocation of patients to beds including differentials.

    Raises:
        SimulationInfeasibleError: When constraints are mathematically infeasible.
        ValueError: When demand SQL or solver inputs are invalid.
    """
    res = self.run_scenario_result(request, olap_conn=olap_conn)
    if isinstance(res, Ok):
      return res.value
    if res.error.code == ErrorCode.SIMULATION_INFEASIBLE:
      raise SimulationInfeasibleError(res.error.message)
    raise ValueError(res.error.message)

  async def run_scenario_async(
    self,
    request: ScenarioRunRequest,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> AppResult[ScenarioResult]:
    """
    Asynchronously executes `run_scenario_result` in a worker thread via `asyncio.to_thread`.

    Args:
        request (ScenarioRunRequest): Scenario configuration payload.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        AppResult[ScenarioResult]: `Ok(ScenarioResult)` on success, or `Err(AppError)` on failure.
    """
    return await asyncio.to_thread(self.run_scenario_result, request, olap_conn)

  def _fetch_demand_payload(
    self,
    query: str,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> tuple[str, dict[tuple[str, str], float]]:
    """
    Executes the SQL query and prepares data for both the Solver and the Diff engine.

    Args:
        query (str): The SQL query string to run against DuckDB.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        tuple[str, dict[tuple[str, str], float]]: Tuple of `(demand_json_str, current_state_map)`.

    Raises:
        ValueError: If executing the demand query fails.
    """
    try:
      owns_conn = olap_conn is None
      conn = olap_conn if olap_conn is not None else duckdb_manager.get_readonly_connection()
      try:
        cursor = conn.execute(query)
        rows = cursor.fetchall()
      finally:
        if owns_conn:
          conn.close()

      demand_totals: dict[str, float] = {}
      current_state: dict[tuple[str, str], float] = {}

      for row in rows:
        if len(row) == 2:
          service = str(row[0])
          count = float(row[1])
          demand_totals[service] = demand_totals.get(service, 0.0) + count
        elif len(row) >= 3:
          service = str(row[0])
          unit = str(row[1])
          count = float(row[2])
          demand_totals[service] = demand_totals.get(service, 0.0) + count
          key = (service, unit)
          current_state[key] = current_state.get(key, 0.0) + count

      return json.dumps(demand_totals), current_state

    except Exception as e:
      logger.error(f"Error fetching simulation demand: {e}")
      raise ValueError(f"Failed to execute demand query: {e!s}") from e

  def _diff_assignments(
    self,
    items: Sequence[MpaxAssignmentItem | dict[str, Any]],
    current_state: dict[tuple[str, str], float],
  ) -> list[SimulationAssignment]:
    """
    Computes `SimulationAssignment` items and eviction deltas from solved allocations.

    Args:
        items (Sequence[MpaxAssignmentItem | dict[str, Any]]): Solved service-to-unit allocations.
        current_state (dict[tuple[str, str], float]): Baseline `(Service, Unit) -> OriginalCount` map.

    Returns:
        list[SimulationAssignment]: Allocation list including positive, zero, and eviction deltas.
    """
    result_list: list[SimulationAssignment] = []
    processed_keys: set[tuple[str, str]] = set()

    for item in items:
      service = str(item.get("Service", ""))
      unit = str(item.get("Unit", ""))
      new_count = float(item.get("Patient_Count", 0))

      key = (service, unit)
      processed_keys.add(key)

      original = current_state.get(key, 0.0)
      delta = new_count - original

      result_list.append(
        SimulationAssignment(
          Service=service,
          Unit=unit,
          Patient_Count=new_count,
          Original_Count=original,
          Delta=delta,
        )
      )

    for (svc, unit), old_count in current_state.items():
      if (svc, unit) not in processed_keys and old_count > 0.1:
        result_list.append(
          SimulationAssignment(
            Service=svc,
            Unit=unit,
            Patient_Count=0.0,
            Original_Count=old_count,
            Delta=-1.0 * old_count,
          )
        )

    return result_list

  def _parse_and_diff_result(
    self, raw_json: str, current_state: dict[tuple[str, str], float]
  ) -> list[SimulationAssignment]:
    """
    Parses a raw solver JSON string and delegates to `_diff_assignments`.

    Args:
        raw_json (str): JSON string from solver.
        current_state (dict[tuple[str, str], float]): Map of `(Service, Unit) -> OriginalCount`.

    Returns:
        list[SimulationAssignment]: List of allocation results with change metrics.

    Raises:
        SimulationInfeasibleError: When the solver JSON contains an infeasibility error.
        ValueError: When the solver JSON is malformed or contains a data error.
    """
    try:
      data = json.loads(raw_json)
      if isinstance(data, dict) and "error" in data:
        err_msg = str(data["error"])
        if "infeasible" in err_msg.lower() or "exceeds" in err_msg.lower():
          raise SimulationInfeasibleError(err_msg)
        raise ValueError(err_msg)
      return self._diff_assignments(data, current_state)
    except SimulationInfeasibleError:
      raise
    except Exception as e:
      logger.error(f"Error parsing simulation result: {e}")
      raise ValueError("Solver returned invalid data.") from e


# Singleton Instance
simulation_service = SimulationService()
