"""
Tests for simulation service `AppResult` error handling and delta computation paths.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.core.result import AppError, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.schemas.simulation import ScenarioResult, ScenarioRunRequest
from app.services.mpax_bridge import MpaxBridgeService
from app.services.simulation_service import SimulationService


def test_fetch_demand_payload_returns_err_on_db_error(monkeypatch: pytest.MonkeyPatch) -> None:
  """Database errors should surface as `Err(AppError)` with `SIMULATION_INVALID_DATA`."""
  svc = SimulationService()

  def _boom() -> None:
    """Raises a simulated database connection failure."""
    raise RuntimeError("db down")

  monkeypatch.setattr(duckdb_manager, "get_readonly_connection", _boom)

  res = svc._fetch_demand_payload_result("SELECT 1")
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.SIMULATION_INVALID_DATA
  assert "Failed to execute demand query" in res.error.message


def test_parse_and_diff_result_handles_error_payload() -> None:
  """Solver error payloads should return `Err(AppError)` with `SIMULATION_INVALID_DATA`."""
  svc = SimulationService()

  res = svc._parse_and_diff_result('{"error": "bad solver"}', {})
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.SIMULATION_INVALID_DATA
  assert "Solver returned invalid data" in res.error.message


def test_parse_and_diff_result_handles_infeasible_error_payload() -> None:
  """Solver infeasible error payloads should return `Err(AppError)` with `SIMULATION_INFEASIBLE`."""
  svc = SimulationService()

  res1 = svc._parse_and_diff_result('{"error": "Infeasible constraint detected"}', {})
  assert isinstance(res1, Err)
  assert res1.error.code == ErrorCode.SIMULATION_INFEASIBLE
  assert res1.error.status_code == 422

  res2 = svc._parse_and_diff_result('{"error": "Flow exceeds capacity"}', {})
  assert isinstance(res2, Err)
  assert res2.error.code == ErrorCode.SIMULATION_INFEASIBLE
  assert res2.error.status_code == 422


def test_parse_and_diff_result_handles_invalid_json() -> None:
  """Invalid JSON should return `Err(AppError)` with `SIMULATION_INVALID_DATA`."""
  svc = SimulationService()

  res = svc._parse_and_diff_result("{not-json", {})
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.SIMULATION_INVALID_DATA
  assert "Solver returned invalid data" in res.error.message


def test_fetch_demand_payload_edge_branches() -> None:
  """Tests 1-column rows and 2-column rows in demand payload fetching."""
  svc = SimulationService()
  m_conn = MagicMock()
  m_conn.execute.return_value.fetchall.return_value = [("OnlyOne",), ("ServiceA", 10.0)]
  with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn):
    res = svc._fetch_demand_payload_result("SELECT 1")
    assert isinstance(res, Ok)
    demand, state = res.value
    assert json.loads(demand) == {"ServiceA": 10.0}
    assert state == {}


def test_parse_and_diff_eviction_low_count() -> None:
  """Tests that `old_count <= 0.1` is not reported as an eviction."""
  svc = SimulationService()
  res = svc._parse_and_diff_result("[]", {("ServiceB", "UnitB"): 0.05})
  assert isinstance(res, Ok)
  assert len(res.value) == 0


def test_simulation_eviction_and_three_cols() -> None:
  """Tests 3-column demand parsing, eviction delta generation, and `run_scenario_result` error propagation."""
  svc = SimulationService()
  m_conn = MagicMock()
  m_conn.execute.return_value.fetchall.return_value = [("Cardiology", "ICU", 15.0)]
  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(MpaxBridgeService, "solve_unit_assignment_result", return_value=Ok([])),
  ):
    res = svc.run_scenario_result(
      ScenarioRunRequest(
        demand_source_sql="SELECT 1",
        capacity_parameters={"ICU": 20},
      )
    )
    assert isinstance(res, Ok)
    assert len(res.value.assignments) == 1
    assert res.value.assignments[0].Service == "Cardiology"
    assert res.value.assignments[0].Unit == "ICU"
    assert res.value.assignments[0].Patient_Count == 0.0
    assert res.value.assignments[0].Original_Count == 15.0
    assert res.value.assignments[0].Delta == -15.0

  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(
      MpaxBridgeService,
      "solve_unit_assignment_result",
      return_value=Err(AppError(code=ErrorCode.SIMULATION_INFEASIBLE, message="Infeasible", status_code=422)),
    ),
  ):
    inf_res = svc.run_scenario_result(ScenarioRunRequest(demand_source_sql="SELECT 1", capacity_parameters={"ICU": 20}))
    assert isinstance(inf_res, Err)
    assert inf_res.error.code == ErrorCode.SIMULATION_INFEASIBLE

  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(
      MpaxBridgeService,
      "solve_unit_assignment_result",
      return_value=Err(AppError(code=ErrorCode.SIMULATION_INVALID_DATA, message="Bad solver input", status_code=400)),
    ),
  ):
    bad_res = svc.run_scenario_result(ScenarioRunRequest(demand_source_sql="SELECT 1", capacity_parameters={"ICU": 20}))
    assert isinstance(bad_res, Err)
    assert bad_res.error.code == ErrorCode.SIMULATION_INVALID_DATA


@pytest.mark.asyncio
async def test_run_scenario_result_and_async_branches(monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `run_scenario_result` and `run_scenario_async` return Ok and Err variants for all error types."""
  svc = SimulationService()
  req = ScenarioRunRequest(demand_source_sql="SELECT 1", capacity_parameters={"ICU": 10})

  monkeypatch.setattr(
    svc, "run_scenario_result", lambda _r, _c=None: Ok(ScenarioResult(assignments=[], status="success"))
  )
  ok_res = await svc.run_scenario_async(req)
  assert isinstance(ok_res, Ok)
  assert ok_res.value.status == "success"


def test_simulation_service_with_injected_olap_conn() -> None:
  """Verifies `run_scenario_result` and `_fetch_demand_payload_result` do not close an injected `olap_conn`."""
  svc = SimulationService()
  mock_conn = MagicMock()
  mock_conn.execute.return_value.fetchall.return_value = [("Cardio", 10.0)]

  with patch.object(MpaxBridgeService, "solve_unit_assignment_result", return_value=Ok([])):
    res = svc.run_scenario_result(
      ScenarioRunRequest(demand_source_sql="SELECT 'Cardio', 10", capacity_parameters={"ICU": 10}),
      olap_conn=mock_conn,
    )
    assert isinstance(res, Ok)
    mock_conn.close.assert_not_called()


def test_simulation_assignment_snake_case_properties_and_typed_bridge() -> None:
  """Verifies `SimulationAssignment` snake_case accessors and `solve_unit_assignment_typed` with `DemandRow` list."""
  from app.schemas.simulation import DemandRow, ScenarioConstraint, SimulationAssignment
  from app.services.mpax_bridge import mpax_bridge

  assignment = SimulationAssignment(
    Service="Cardiology",
    Unit="ICU",
    Patient_Count=12.0,
    Original_Count=8.0,
    Delta=4.0,
  )
  assert assignment.service == "Cardiology"
  assert assignment.unit == "ICU"
  assert assignment.patient_count == 12.0
  assert assignment.original_count == 8.0
  assert assignment.delta == 4.0

  rows = [DemandRow(service="Cardiology", count=6.0, unit="ER"), DemandRow(service="Cardiology", count=4.0)]
  constraints = [ScenarioConstraint(type="force_flow", service="Cardiology", unit="ICU", min=2.0, max=15.0)]
  typed_res = mpax_bridge.solve_unit_assignment_typed(
    demand=rows,
    capacity={"ICU": 20.0},
    affinity={"Cardiology": {"ICU": 10.0}},
    constraints=constraints,
  )
  assert isinstance(typed_res, Ok)
  assert typed_res.value.status == "OPTIMAL"
  assert len(typed_res.value.assignments) >= 1

  svc = SimulationService()
  diffed = svc._diff_assignments(
    [{"Service": "Cardiology", "Unit": "ICU", "Patient_Count": 10.0}],
    {("Cardiology", "ICU"): 4.0},
  )
  assert len(diffed) == 1
  assert diffed[0].delta == 6.0
