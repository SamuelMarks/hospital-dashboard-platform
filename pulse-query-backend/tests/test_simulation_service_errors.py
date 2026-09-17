"""
Tests for simulation service error handling paths.
"""

import pytest

from app.services import simulation_service as simulation_module
from app.services.simulation_service import SimulationService


def test_fetch_demand_payload_raises_on_db_error(monkeypatch) -> None:
  """Database errors should surface as ValueError with context."""
  svc = SimulationService()

  def _boom():
    raise RuntimeError("db down")

  monkeypatch.setattr(simulation_module.duckdb_manager, "get_readonly_connection", _boom)

  with pytest.raises(ValueError):
    svc._fetch_demand_payload("SELECT 1")


def test_parse_and_diff_result_handles_error_payload() -> None:
  """Solver error payloads should raise a clean ValueError."""
  svc = SimulationService()

  with pytest.raises(ValueError) as excinfo:
    svc._parse_and_diff_result('{"error": "bad solver"}', {})
  assert "Solver returned invalid data" in str(excinfo.value)


def test_parse_and_diff_result_handles_infeasible_error_payload() -> None:
  """Solver infeasible error payloads should raise SimulationInfeasibleError."""
  from app.services.simulation_service import SimulationInfeasibleError

  svc = SimulationService()

  with pytest.raises(SimulationInfeasibleError):
    svc._parse_and_diff_result('{"error": "Infeasible constraint detected"}', {})

  with pytest.raises(SimulationInfeasibleError):
    svc._parse_and_diff_result('{"error": "Flow exceeds capacity"}', {})


def test_parse_and_diff_result_handles_invalid_json() -> None:
  """Invalid JSON should raise a clean ValueError."""
  svc = SimulationService()

  with pytest.raises(ValueError):
    svc._parse_and_diff_result("{not-json", {})


def test_fetch_demand_payload_edge_branches() -> None:
  """Tests 1-column rows and 2-column rows in demand payload fetching."""
  import json
  from unittest.mock import MagicMock, patch

  svc = SimulationService()
  m_conn = MagicMock()
  m_conn.execute.return_value.fetchall.return_value = [("OnlyOne",), ("ServiceA", 10.0)]
  with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn):
    demand, state = svc._fetch_demand_payload("SELECT 1")
    assert json.loads(demand) == {"ServiceA": 10.0}
    assert state == {}


def test_parse_and_diff_eviction_low_count() -> None:
  """Tests that old_count <= 0.1 is not reported as an eviction."""
  svc = SimulationService()
  res = svc._parse_and_diff_result("[]", {("ServiceB", "UnitB"): 0.05})
  assert len(res) == 0
