"""
Tests for simulation service error handling paths.
"""

import pytest

from app.services.simulation_service import SimulationService
from app.services import simulation_service as simulation_module


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

  with pytest.raises(ValueError):
    svc._parse_and_diff_result('{"error": "bad solver"}', {})


def test_parse_and_diff_result_handles_invalid_json() -> None:
  """Invalid JSON should raise a clean ValueError."""
  svc = SimulationService()

  with pytest.raises(ValueError):
    svc._parse_and_diff_result("{not-json", {})
