"""
Simulation Domain Schemas.

Defines the contract for "What-If" scenario execution.
Separates the definition of the environment (Capacity, Constraints) from
the data source (Demand SQL), allowing mix-and-match analysis.
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ScenarioConstraint(BaseModel):
  """
  Represents a specific rule for the solver.
  Example: Force 'Gen_Peds' into 'Nursery' with minimum 5 beds.
  """

  type: str = Field(..., description="Constraint type (e.g., 'force_flow')")
  service: str
  unit: str
  min: float | None = None
  max: float | None = None


class ScenarioRunRequest(BaseModel):
  """
  Payload to trigger a simulation run.
  """

  demand_source_sql: str = Field(
    ..., description="SQL Query. Supports 2 cols (Service, Count) or 3 cols (Service, CurrentUnit, Count)."
  )
  capacity_parameters: dict[str, float] = Field(..., description="Map of Unit Name to available bed capacity.")
  constraints: list[ScenarioConstraint] = Field(default_factory=list, description="List of hard constraints to apply.")
  affinity_overrides: dict[str, dict[str, float]] = Field(
    default_factory=dict, description="Optional overrides for clinical affinity scores."
  )


class SimulationAssignment(BaseModel):
  """
  Single row in the optimization result.
  """

  Service: str
  Unit: str
  Patient_Count: float

  # Diff/Delta Fields
  Original_Count: float = Field(0.0, description="Count in this unit before optimization (if provided).")
  Delta: float = Field(0.0, description="Net change (Proposed - Original).")


class ScenarioResult(BaseModel):
  """
  Response containing the optimization outcome.
  """

  assignments: list[SimulationAssignment]
  status: str
  message: str | None = None
