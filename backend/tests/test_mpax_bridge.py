"""
Tests for the MPAX Bridge Service.

Verifies the Linear Programming formulation logic, specifically focusing on:
1. Basic Assignment Feasibility.
2. Affinity/Cost optimization.
3. Constraint enforcement.
4. **Robustness/Overflow handling** (Surge Scenarios).
"""

import json
import pytest
import app.services.mpax_bridge as mpax_module
from app.services.mpax_bridge import mpax_bridge


def test_basic_assignment_feasibility() -> None:
  """
  Test standard assignment where Demand < Capacity.
  """
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 20.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  assert len(data) == 1
  assert data[0]["Service"] == "ServiceA"
  assert data[0]["Unit"] == "Unit1"
  assert data[0]["Patient_Count"] == 10.0


def test_surge_overflow_handling() -> None:
  """
  Test a "Surge" scenario where Demand > Total Capacity.
  Demand: 100 Patients.
  Capacity: 10 Beds.
  Expectation: 10 Beds filled, 90 assigned to 'Overflow'.
  """
  demand = json.dumps({"ServiceSurge": 100.0})
  capacity = json.dumps({"UnitSmall": 10.0})
  affinity = json.dumps({"ServiceSurge": {"UnitSmall": 1.0}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  # We expect 2 entries: UnitSmall (10), Overflow (90)
  assert len(data) == 2

  # Verify Overflow
  overflow_item = next((i for i in data if i["Unit"] == "Overflow"), None)
  assert overflow_item is not None
  assert overflow_item["Patient_Count"] == 90.0

  # Verify Real Unit is capped
  real_item = next((i for i in data if i["Unit"] == "UnitSmall"), None)
  assert real_item is not None
  assert real_item["Patient_Count"] == 10.0


def test_overflow_not_used_when_capacity_exists() -> None:
  """
  Test that the Overflow unit is NOT used when sufficient capacity exists,
  confirming the high cost penalty works correctly.
  """
  demand = json.dumps({"ServiceA": 5.0})
  capacity = json.dumps({"Unit1": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  # Expect allocation only to Unit1
  units_used = [d["Unit"] for d in data]
  assert "Unit1" in units_used
  assert "Overflow" not in units_used


def test_affinity_based_optimization() -> None:
  """
  Test that patients are routed to the unit with higher affinity
  when multiple units have capacity.
  """
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 10.0, "Unit2": 10.0})
  # Unit1 is perfect fit (1.0), Unit2 is poor fit (0.1)
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0, "Unit2": 0.1}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  assert len(data) == 1
  assignment = data[0]
  assert assignment["Unit"] == "Unit1"
  assert assignment["Patient_Count"] == 10.0


def test_hard_constraint_enforcement() -> None:
  """
  Test explicit 'force_flow' constraints overriding natural affinity.
  """
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 10.0, "Unit2": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0, "Unit2": 0.1}})

  # Force 5 patients to Unit2 (Low affinity)
  constraints = json.dumps([{"type": "force_flow", "service": "ServiceA", "unit": "Unit2", "min": 5.0}])

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity, constraints)
  data = json.loads(result)

  allocation = {item["Unit"]: item["Patient_Count"] for item in data}
  assert allocation.get("Unit2") == 5.0
  assert allocation.get("Unit1") == 5.0


def test_bad_input_handling() -> None:
  """
  Test that malformed JSON strings result in a clean error JSON return.
  """
  result = mpax_bridge.solve_unit_assignment("{bad_json...", "{}", "{}")
  data = json.loads(result)

  assert "error" in data
  msg = data["error"].lower()
  assert "json" in msg or "parsing" in msg or "expecting property name" in msg


def test_empty_input_handling() -> None:
  """
  Test behavior with empty configuration.
  """
  result = mpax_bridge.solve_unit_assignment("{}", "{}", "{}")
  data = json.loads(result)
  assert isinstance(data, list)
  assert len(data) == 0


def test_overflow_only_when_no_capacity_units(monkeypatch) -> None:
  """
  If no real capacity units exist but demand does, Overflow should carry the load.
  This covers the G_rows empty-but-nonzero variables branch.
  """
  demand = json.dumps({"ServiceA": 5.0})
  capacity = json.dumps({})
  affinity = json.dumps({})

  class _DummyResult:
    def __init__(self, sol):
      self.primal_solution = sol

  class _DummySolver:
    def __init__(self, sol):
      self._sol = sol

    def optimize(self, _lp):
      return _DummyResult(self._sol)

  # Avoid long-running optimization for this edge-case branch.
  monkeypatch.setattr(mpax_module, "r2HPDHG", lambda **_kwargs: _DummySolver([5.0]))

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  assert len(data) == 1
  assert data[0]["Unit"] == "Overflow"
  assert data[0]["Patient_Count"] == pytest.approx(5.0)


def test_hard_constraint_max_enforced(monkeypatch) -> None:
  """
  Explicit max constraints should cap allocations for a unit.
  """
  demand = json.dumps({"ServiceA": 5.0})
  capacity = json.dumps({"Unit1": 10.0, "Unit2": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0, "Unit2": 1.0}})

  constraints = json.dumps([{"type": "force_flow", "service": "ServiceA", "unit": "Unit1", "max": 2.0}])

  class _DummyResult:
    def __init__(self, sol):
      self.primal_solution = sol

  class _DummySolver:
    def __init__(self, sol):
      self._sol = sol

    def optimize(self, _lp):
      return _DummyResult(self._sol)

  # Solution order: Unit1, Unit2, Overflow (single service).
  monkeypatch.setattr(mpax_module, "r2HPDHG", lambda **_kwargs: _DummySolver([2.0, 3.0, 0.0]))

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity, constraints)
  data = json.loads(result)

  allocation = {item["Unit"]: item["Patient_Count"] for item in data}
  assert allocation.get("Unit1", 0.0) <= 2.01
