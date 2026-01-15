"""
Tests for the MPAX Bridge Service.
"""

import json
import pytest
from app.services.mpax_bridge import mpax_bridge


def test_basic_assignment_feasibility() -> None:
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 20.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  assert len(data) == 1
  assert data[0]["Service"] == "ServiceA"
  assert data[0]["Unit"] == "Unit1"
  assert data[0]["Patient_Count"] == 10.0


def test_affinity_based_optimization() -> None:
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 10.0, "Unit2": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0, "Unit2": 0.1}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)

  assert len(data) == 1
  assignment = data[0]
  assert assignment["Unit"] == "Unit1"
  assert assignment["Patient_Count"] == 10.0


def test_hard_constraint_enforcement() -> None:
  demand = json.dumps({"ServiceA": 10.0})
  capacity = json.dumps({"Unit1": 10.0, "Unit2": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0, "Unit2": 0.1}})

  constraints = json.dumps([{"type": "force_flow", "service": "ServiceA", "unit": "Unit2", "min": 5.0}])

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity, constraints)
  data = json.loads(result)

  allocation = {item["Unit"]: item["Patient_Count"] for item in data}
  assert allocation.get("Unit2") == 5.0
  assert allocation.get("Unit1") == 5.0


def test_capacity_overflow_behavior() -> None:
  demand = json.dumps({"ServiceA": 100.0})
  capacity = json.dumps({"Unit1": 10.0})
  affinity = json.dumps({"ServiceA": {"Unit1": 1.0}})

  result = mpax_bridge.solve_unit_assignment(demand, capacity, affinity)
  data = json.loads(result)
  assert isinstance(data, list)


def test_bad_input_handling() -> None:
  """
  Test that malformed JSON strings result in a clean error JSON return.
  """
  result = mpax_bridge.solve_unit_assignment("{bad_json...", "{}", "{}")
  data = json.loads(result)

  assert "error" in data
  # Error comes from json.loads, typically 'Expecting property name...'
  msg = data["error"].lower()
  assert "json" in msg or "parsing" in msg or "expecting property name" in msg


def test_empty_input_handling() -> None:
  result = mpax_bridge.solve_unit_assignment("{}", "{}", "{}")
  data = json.loads(result)
  assert isinstance(data, list)
  assert len(data) == 0
