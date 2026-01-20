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

import json
import logging
from typing import List, Dict, Any, Tuple

from app.database.duckdb import duckdb_manager
from app.services.mpax_bridge import mpax_bridge
from app.schemas.simulation import (
  ScenarioRunRequest,
  ScenarioResult,
  SimulationAssignment,
)

logger = logging.getLogger("simulation_service")


class SimulationService:
  """
  Service for running transient "What-If" optimization scenarios.
  """

  def run_scenario(self, request: ScenarioRunRequest) -> ScenarioResult:
    """
    Executes a simulation based on the provided configuration.

    The process includes a "Virtual Overflow" safety net. If demand exceeds
    capacity, the optimization will not fail but will allocate patients
    to an "Overflow" unit, which will appear in the assignments list.

    Args:
        request (ScenarioRunRequest): The scenario definition.

    Returns:
        ScenarioResult: The optimal allocation of patients to beds including differentials.
    """
    logger.info("Starting Simulation Scenario Run")

    # 1. Fetch Demand Data from DuckDB
    # Returns the JSON for the solver AND a baseline map for diffing
    demand_json, current_state = self._fetch_demand_payload(request.demand_source_sql)

    # 2. Serialize Parameters for Bridge
    capacity_json = json.dumps(request.capacity_parameters)
    constraints_json = json.dumps([c.model_dump() for c in request.constraints])
    affinity_json = json.dumps(request.affinity_overrides)

    # 3. Run Optimization
    # This calls the JAX/MPAX solver via the bridge
    raw_result = mpax_bridge.solve_unit_assignment(
      demand_json=demand_json,
      capacity_json=capacity_json,
      affinity_json=affinity_json,
      constraints_json=constraints_json,
    )

    # 4. Parse Result & Calculate Delta
    parsed_assignments = self._parse_and_diff_result(raw_result, current_state)

    return ScenarioResult(assignments=parsed_assignments, status="success")

  def _fetch_demand_payload(self, query: str) -> Tuple[str, Dict[Tuple[str, str], float]]:
    """
    Executes the SQL query and prepares data for both the Solver and the Diff engine.

    Supports two SQL formats:
    1. 2 Columns: (Service, Count) -> Baseline assumes 0 distribution.
    2. 3 Columns: (Service, Unit, Count) -> Baseline built from this distribution.

    Args:
        query (str): The SQL query string to run against DuckDB.

    Returns:
        Tuple containing:
        - str: JSON string for solver: `{"Service": TotalCount}`
        - dict: Baseline Map: `{(Service, Unit): Count}`
    """
    try:
      conn = duckdb_manager.get_readonly_connection()
      cursor = conn.execute(query)
      rows = cursor.fetchall()
      conn.close()

      demand_totals: Dict[str, float] = {}
      current_state: Dict[Tuple[str, str], float] = {}

      for row in rows:
        if len(row) == 2:
          # Format: Service, Count
          service = str(row[0])
          count = float(row[1])
          demand_totals[service] = demand_totals.get(service, 0.0) + count
          # We don't know the unit, so current_state remains empty for this row

        elif len(row) >= 3:
          # Format: Service, Unit, Count
          service = str(row[0])
          unit = str(row[1])
          count = float(row[2])

          # Aggregate for solver
          demand_totals[service] = demand_totals.get(service, 0.0) + count

          # Store specific location for diffing
          key = (service, unit)
          current_state[key] = current_state.get(key, 0.0) + count

      return json.dumps(demand_totals), current_state

    except Exception as e:
      logger.error(f"Error fetching simulation demand: {e}")
      raise ValueError(f"Failed to execute demand query: {str(e)}")

  def _parse_and_diff_result(
    self, raw_json: str, current_state: Dict[Tuple[str, str], float]
  ) -> List[SimulationAssignment]:
    """
    Converts MPAX JSON into Pydantic models and injects Delta values.

    Logic:
    - Iterates over Solver assignments (New State).
    - Compares against `current_state` (Old State) to calculate `Delta`.
    - Adds implicit "Negative Delta" rows for patients moved completely OUT of a unit.

    Args:
        raw_json (str): JSON string from solver.
        current_state (Dict): Map of `(Service, Unit) -> OriginalCount`.

    Returns:
        List[SimulationAssignment]: List of allocation results with change metrics.
    """
    try:
      data = json.loads(raw_json)
      if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])

      result_list = []

      # Process solver outputs
      processed_keys = set()

      for item in data:
        service = item.get("Service")
        unit = item.get("Unit")
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

      # Detect "Evictions":
      # If a unit/service pair existed in Current State but is NOT in Solver Output,
      # it means the count went to 0 (solver filtered it). We must document this removal.
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

    except Exception as e:
      logger.error(f"Error parsing simulation result: {e}")
      raise ValueError("Solver returned invalid data.")


# Singleton Instance
simulation_service = SimulationService()
