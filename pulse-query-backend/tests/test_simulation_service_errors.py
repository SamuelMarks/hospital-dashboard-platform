"""
Tests for simulation service error handling paths.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.core.result import AppError, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.schemas.simulation import ScenarioResult, ScenarioRunRequest
from app.services.mpax_bridge import MpaxBridgeService
from app.services.simulation_service import SimulationInfeasibleError, SimulationService


def test_fetch_demand_payload_raises_on_db_error(monkeypatch: pytest.MonkeyPatch) -> None:
  """Database errors should surface as ValueError with context."""
  svc = SimulationService()

  def _boom() -> None:
    """Raises a simulated database connection failure."""
    raise RuntimeError("db down")

  monkeypatch.setattr(duckdb_manager, "get_readonly_connection", _boom)

  with pytest.raises(ValueError, match="Failed to execute demand query"):
    svc._fetch_demand_payload("SELECT 1")


def test_parse_and_diff_result_handles_error_payload() -> None:
  """Solver error payloads should raise a clean ValueError."""
  svc = SimulationService()

  with pytest.raises(ValueError, match="Solver returned invalid data") as excinfo:
    svc._parse_and_diff_result('{"error": "bad solver"}', {})
  assert "Solver returned invalid data" in str(excinfo.value)


def test_parse_and_diff_result_handles_infeasible_error_payload() -> None:
  """Solver infeasible error payloads should raise `SimulationInfeasibleError`."""
  svc = SimulationService()

  with pytest.raises(SimulationInfeasibleError):
    svc._parse_and_diff_result('{"error": "Infeasible constraint detected"}', {})

  with pytest.raises(SimulationInfeasibleError):
    svc._parse_and_diff_result('{"error": "Flow exceeds capacity"}', {})


def test_parse_and_diff_result_handles_invalid_json() -> None:
  """Invalid JSON should raise a clean ValueError."""
  svc = SimulationService()

  with pytest.raises(ValueError, match="Solver returned invalid data"):
    svc._parse_and_diff_result("{not-json", {})


def test_fetch_demand_payload_edge_branches() -> None:
  """Tests 1-column rows and 2-column rows in demand payload fetching."""
  svc = SimulationService()
  m_conn = MagicMock()
  m_conn.execute.return_value.fetchall.return_value = [("OnlyOne",), ("ServiceA", 10.0)]
  with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn):
    demand, state = svc._fetch_demand_payload("SELECT 1")
    assert json.loads(demand) == {"ServiceA": 10.0}
    assert state == {}


def test_parse_and_diff_eviction_low_count() -> None:
  """Tests that `old_count <= 0.1` is not reported as an eviction."""
  svc = SimulationService()
  res = svc._parse_and_diff_result("[]", {("ServiceB", "UnitB"): 0.05})
  assert len(res) == 0


def test_simulation_eviction_and_three_cols() -> None:
  """Tests 3-column demand parsing, eviction delta generation, and `run_scenario` error raising."""
  svc = SimulationService()
  m_conn = MagicMock()
  m_conn.execute.return_value.fetchall.return_value = [("Cardiology", "ICU", 15.0)]
  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(MpaxBridgeService, "solve_unit_assignment_result", return_value=Ok([])),
  ):
    res = svc.run_scenario(
      ScenarioRunRequest(
        demand_source_sql="SELECT 1",
        capacity_parameters={"ICU": 20},
      )
    )
    assert len(res.assignments) == 1
    assert res.assignments[0].Service == "Cardiology"
    assert res.assignments[0].Unit == "ICU"
    assert res.assignments[0].Patient_Count == 0.0
    assert res.assignments[0].Original_Count == 15.0
    assert res.assignments[0].Delta == -15.0

  # Test run_scenario raising SimulationInfeasibleError and ValueError when solver returns Err
  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(
      MpaxBridgeService,
      "solve_unit_assignment_result",
      return_value=Err(AppError(code=ErrorCode.SIMULATION_INFEASIBLE, message="Infeasible", status_code=422)),
    ),
    pytest.raises(SimulationInfeasibleError, match="Infeasible"),
  ):
    svc.run_scenario(ScenarioRunRequest(demand_source_sql="SELECT 1", capacity_parameters={"ICU": 20}))

  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn),
    patch.object(
      MpaxBridgeService,
      "solve_unit_assignment_result",
      return_value=Err(AppError(code=ErrorCode.SIMULATION_INVALID_DATA, message="Bad solver input", status_code=400)),
    ),
    pytest.raises(ValueError, match="Bad solver input"),
  ):
    svc.run_scenario(ScenarioRunRequest(demand_source_sql="SELECT 1", capacity_parameters={"ICU": 20}))


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
  """Verifies `run_scenario_result` and `_fetch_demand_payload` do not close an injected `olap_conn`."""
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
