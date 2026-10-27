"""
Simulation Domain Schemas.

Defines the contract for "What-If" scenario execution.
Separates the definition of the environment (Capacity, Constraints) from
the data source (Demand SQL), allowing mix-and-match analysis.
"""

from pydantic import BaseModel, ConfigDict, Field


class DemandRow(BaseModel):
  """
  Typed demand row representing clinical service demand and optional current unit baseline.

  Attributes:
      service (str): Clinical service identifier.
      count (float): Patient demand count.
      unit (str | None): Optional current unit where patients are located.
  """

  service: str
  count: float
  unit: str | None = None


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

  Provides both PEP 8 snake_case accessors (`service`, `unit`, `patient_count`,
  `original_count`, `delta`) and wire-compatible PascalCase fields (`Service`,
  `Unit`, `Patient_Count`, `Original_Count`, `Delta`).
  """

  model_config = ConfigDict(populate_by_name=True)

  Service: str = Field(..., validation_alias="Service", serialization_alias="Service")
  Unit: str = Field(..., validation_alias="Unit", serialization_alias="Unit")
  Patient_Count: float = Field(..., validation_alias="Patient_Count", serialization_alias="Patient_Count")

  # Diff/Delta Fields
  Original_Count: float = Field(
    0.0,
    validation_alias="Original_Count",
    serialization_alias="Original_Count",
    description="Count in this unit before optimization (if provided).",
  )
  Delta: float = Field(
    0.0,
    validation_alias="Delta",
    serialization_alias="Delta",
    description="Net change (Proposed - Original).",
  )

  @property
  def service(self) -> str:
    """Returns the clinical service name in snake_case."""
    return self.Service

  @property
  def unit(self) -> str:
    """Returns the hospital unit name in snake_case."""
    return self.Unit

  @property
  def patient_count(self) -> float:
    """Returns the optimized patient count in snake_case."""
    return self.Patient_Count

  @property
  def original_count(self) -> float:
    """Returns the baseline original count in snake_case."""
    return self.Original_Count

  @property
  def delta(self) -> float:
    """Returns the net patient count delta in snake_case."""
    return self.Delta


class ScenarioResult(BaseModel):
  """
  Response containing the optimization outcome.
  """

  assignments: list[SimulationAssignment]
  status: str
  message: str | None = None
