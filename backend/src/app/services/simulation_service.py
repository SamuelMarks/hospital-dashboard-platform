"""
Simulation Orchestration Service.

Integrates the Data Layer (DuckDB) with the Optimization Engine (MPAX).
Unlike standard widget execution, this service performs a multi-step process:
1. Executes raw SQL to fetch live clinical demand.
2. Transforms tabular SQL results into the JSON structure required by the Solver.
3. Injects user-defined capacity/constraint parameters.
4. Executes the Solver and returns ephemeral results.
"""

import json
import logging
from typing import List, Dict, Any

from app.database.duckdb import duckdb_manager
from app.services.mpax_bridge import mpax_bridge
from app.schemas.simulation import ScenarioRunRequest, ScenarioResult, SimulationAssignment

logger = logging.getLogger("simulation_service")


class SimulationService:
  """
  Service for running transient "What-If" optimization scenarios.
  """

  def run_scenario(self, request: ScenarioRunRequest) -> ScenarioResult:
    """
    Executes a simulation based on the provided configuration.

    Args:
        request (ScenarioRunRequest): The scenario definition.

    Returns:
        ScenarioResult: The optimal allocation of patients to beds.
    """
    logger.info("Starting Simulation Scenario Run")

    # 1. Fetch Demand Data from DuckDB
    # We need to execute the user's SQL to get the current state of the hospital
    demand_json = self._fetch_demand_as_json(request.demand_source_sql)

    # 2. Serialize Parameters for Bridge
    capacity_json = json.dumps(request.capacity_parameters)
    constraints_json = json.dumps([c.model_dump() for c in request.constraints])
    affinity_json = json.dumps(request.affinity_overrides)

    # 3. Run Optimization
    # This calls the JAX/MPAX solver via the bridge
    raw_result = mpax_bridge.solve_unit_assignment(
      demand_json=demand_json, capacity_json=capacity_json, affinity_json=affinity_json, constraints_json=constraints_json
    )

    # 4. Parse Result
    parsed_assignments = self._parse_bridge_result(raw_result)

    return ScenarioResult(assignments=parsed_assignments, status="success")

  def _fetch_demand_as_json(self, query: str) -> str:
    """
    Executes the SQL query and converts result to { "Service": Count } format.
    """
    try:
      conn = duckdb_manager.get_readonly_connection()
      # We wrap the user query to ensure we get expected columns or fail gracefully
      # Note: We assume the user query returns columns effectively mappable to Service/Count
      # For robustness, we treat the first string column as Service and first number as Count
      cursor = conn.execute(query)
      rows = cursor.fetchall()

      # Simple mapping logic: { Row[0]: Row[1] }
      demand_map: Dict[str, float] = {}
      for row in rows:
        if len(row) >= 2:
          service = str(row[0])
          count = float(row[1])
          demand_map[service] = count

      conn.close()
      return json.dumps(demand_map)

    except Exception as e:
      logger.error(f"Error fetching simulation demand: {e}")
      raise ValueError(f"Failed to execute demand query: {str(e)}")

  def _parse_bridge_result(self, raw_json: str) -> List[SimulationAssignment]:
    """
    Converts the JSON string from MPAX into Pydantic models.
    """
    try:
      data = json.loads(raw_json)
      if isinstance(data, dict) and "error" in data:
        raise ValueError(data["error"])

      return [SimulationAssignment(**item) for item in data]
    except Exception as e:
      logger.error(f"Error parsing simulation result: {e}")
      raise ValueError("Solver returned invalid data.")


# Singleton Instance
simulation_service = SimulationService()
