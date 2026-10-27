"""
Simulation Orchestration Service.

Integrates the Data Layer (DuckDB) with the Optimization Engine (MPAX).
Unlike standard widget execution, this service performs a multi-step process:
1. Executes raw SQL to fetch live clinical demand.
2. Transforms tabular SQL results into the JSON structure required by the Solver.
3. Injects user-defined capacity/constraint parameters.
4. Executes the Solver (which includes virtual Overflow logic) via `AppResult`.
5. Calculates Deltas to show the user exactly where patients moved.
"""

import asyncio
from collections.abc import Mapping, Sequence
import json
import logging

import duckdb
from pydantic import BaseModel, TypeAdapter, ValidationError

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.schemas.json_types import JsonValue
from app.schemas.mpax_arena import MpaxAssignmentRow
from app.schemas.simulation import (
  DemandRow,
  ScenarioResult,
  ScenarioRunRequest,
  SimulationAssignment,
)
from app.services.mpax_bridge import MpaxAssignmentItem, mpax_bridge

logger = logging.getLogger("simulation_service")


class MpaxBridgeErrorPayload(BaseModel):
  """
  Validated schema for an error object returned by the MPAX solver bridge.

  Attributes:
      error (str): Solver error message.
  """

  error: str


type MpaxBridgeRawResult = list[MpaxAssignmentItem] | MpaxBridgeErrorPayload
MPAX_BRIDGE_RAW_ADAPTER: TypeAdapter[MpaxBridgeRawResult] = TypeAdapter(MpaxBridgeRawResult)


class SimulationService:
  """
  Service for running transient "What-If" optimization scenarios using explicit `AppResult` flows.
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
    demand_res = self._fetch_demand_payload_result(
      request.demand_source_sql,
      olap_conn=olap_conn,
    )
    if isinstance(demand_res, Err):
      return demand_res

    demand_payload, current_state = demand_res.value
    demand_map: dict[str, float] = json.loads(demand_payload) if isinstance(demand_payload, str) else dict(demand_payload)

    solver_res = mpax_bridge.solve_unit_assignment_typed(
      demand=demand_map,
      capacity=request.capacity_parameters,
      affinity=request.affinity_overrides,
      constraints=request.constraints,
    )
    if isinstance(solver_res, Err):
      return solver_res

    parsed_assignments = self._diff_assignments(solver_res.value.assignments, current_state)
    return Ok(ScenarioResult(assignments=parsed_assignments, status="success"))

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

  def _fetch_demand_typed_result(
    self,
    query: str,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> AppResult[tuple[list[DemandRow], dict[tuple[str, str], float]]]:
    """
    Executes the SQL query and returns typed `DemandRow` models and baseline unit counts without JSON serialization.

    Args:
        query (str): The SQL query string to run against DuckDB.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        AppResult[tuple[list[DemandRow], dict[tuple[str, str], float]]]:
            `Ok((demand_rows, current_state_map))` or `Err(AppError)`.
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

      demand_rows: list[DemandRow] = []
      current_state: dict[tuple[str, str], float] = {}

      for row in rows:
        if len(row) == 2:
          service = str(row[0])
          raw_cnt = row[1]
          count = float(str(raw_cnt)) if raw_cnt is not None else 0.0
          demand_rows.append(DemandRow(service=service, count=count))
        elif len(row) >= 3:
          service = str(row[0])
          unit = str(row[1])
          raw_cnt = row[2]
          count = float(str(raw_cnt)) if raw_cnt is not None else 0.0
          demand_rows.append(DemandRow(service=service, count=count, unit=unit))
          key = (service, unit)
          current_state[key] = current_state.get(key, 0.0) + count

      return Ok((demand_rows, current_state))

    except (duckdb.Error, ValueError, TypeError, RuntimeError, OSError) as e:
      logger.error(f"Error fetching simulation demand: {e}")
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INVALID_DATA,
          message=f"Failed to execute demand query: {e!s}",
          status_code=400,
        )
      )

  def _fetch_demand_payload_result(
    self,
    query: str,
    olap_conn: duckdb.DuckDBPyConnection | None = None,
  ) -> AppResult[tuple[str, dict[tuple[str, str], float]]]:
    """
    Executes the SQL query and prepares data for both the Solver and the Diff engine.

    Args:
        query (str): The SQL query string to run against DuckDB.
        olap_conn (duckdb.DuckDBPyConnection | None): Optional injected DuckDB connection.

    Returns:
        AppResult[tuple[str, dict[tuple[str, str], float]]]: `Ok((demand_json_str, current_state_map))`
            or `Err(AppError)` if executing the demand query fails.
    """
    typed_res = self._fetch_demand_typed_result(query, olap_conn=olap_conn)
    if isinstance(typed_res, Err):
      return typed_res
    demand_rows, current_state = typed_res.value
    demand_totals: dict[str, float] = {}
    for row in demand_rows:
      demand_totals[row.service] = demand_totals.get(row.service, 0.0) + row.count
    return Ok((json.dumps(demand_totals), current_state))

  def _diff_assignments(
    self,
    items: Sequence[MpaxAssignmentRow | SimulationAssignment | MpaxAssignmentItem | Mapping[str, JsonValue]],
    current_state: dict[tuple[str, str], float],
  ) -> list[SimulationAssignment]:
    """
    Computes `SimulationAssignment` items and eviction deltas from solved allocations.

    Args:
        items (Sequence[MpaxAssignmentRow | SimulationAssignment | MpaxAssignmentItem | Mapping[str, JsonValue]]): Solved allocations.
        current_state (dict[tuple[str, str], float]): Baseline `(Service, Unit) -> OriginalCount` map.

    Returns:
        list[SimulationAssignment]: Allocation list including positive, zero, and eviction deltas.
    """
    result_list: list[SimulationAssignment] = []
    processed_keys: set[tuple[str, str]] = set()

    for item in items:
      if isinstance(item, (MpaxAssignmentRow, SimulationAssignment)):
        service = item.Service
        unit = item.Unit
        new_count = item.Patient_Count
      else:
        service = str(item.get("Service", ""))
        unit = str(item.get("Unit", ""))
        raw_new = item.get("Patient_Count", 0)
        new_count = float(raw_new) if isinstance(raw_new, (int, float, str)) and not isinstance(raw_new, bool) else 0.0

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
  ) -> AppResult[list[SimulationAssignment]]:
    """
    Parses a raw solver JSON string and delegates to `_diff_assignments`, returning `AppResult`.

    Args:
        raw_json (str): JSON string from solver.
        current_state (dict[tuple[str, str], float]): Map of `(Service, Unit) -> OriginalCount`.

    Returns:
        AppResult[list[SimulationAssignment]]: `Ok(assignments)` or `Err(AppError)` with
            `SIMULATION_INFEASIBLE` (422) or `SIMULATION_INVALID_DATA` (400).
    """
    try:
      parsed = MPAX_BRIDGE_RAW_ADAPTER.validate_json(raw_json)
      if isinstance(parsed, MpaxBridgeErrorPayload):
        err_msg = parsed.error
        if "infeasible" in err_msg.lower() or "exceeds" in err_msg.lower():
          return Err(AppError(code=ErrorCode.SIMULATION_INFEASIBLE, message=err_msg, status_code=422))
        return Err(
          AppError(
            code=ErrorCode.SIMULATION_INVALID_DATA,
            message="Solver returned invalid data.",
            status_code=400,
          )
        )
      return Ok(self._diff_assignments(parsed, current_state))
    except (ValidationError, json.JSONDecodeError, ValueError, TypeError, RuntimeError) as e:
      logger.error(f"Error parsing simulation result: {e}")
      return Err(
        AppError(
          code=ErrorCode.SIMULATION_INVALID_DATA,
          message="Solver returned invalid data.",
          status_code=400,
        )
      )


# Singleton Instance
simulation_service = SimulationService()
