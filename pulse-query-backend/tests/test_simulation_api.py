"""
Tests for Simulation API.

Verifies that the simulation endpoint correctly receives JSON config,
fetches data from DuckDB (handling 2 or 3 column formats),
and returns parsed assignments with Delta values.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.result import AppError, Err, ErrorCode, Ok
from app.main import app

SIMULATION_URL = "/api/v1/simulation"


@pytest.mark.asyncio
async def test_run_simulation_with_delta_success() -> None:
  """
  Test a simulation where the input SQL provides 3 columns (Service, Unit, Count).
  Verifies that 'Original' and 'Delta' fields are calculated correctly.
  """
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection") as mock_conn_getter,
    patch("app.services.simulation_service.mpax_bridge.solve_unit_assignment_result") as mock_solver,
  ):
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = [("Cardio", "ER", 5.0)]
    mock_conn_getter.return_value = mock_conn

    mock_solver.return_value = Ok([{"Service": "Cardio", "Unit": "ICU", "Patient_Count": 5.0}])

    payload = {
      "demand_source_sql": "SELECT svc, unit, cnt FROM table",
      "capacity_parameters": {"ICU": 10, "ER": 10},
      "constraints": [],
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

    assert res.status_code == 200
    data = res.json()
    assignments = data["assignments"]

    icu_row = next((a for a in assignments if a["Unit"] == "ICU"), None)
    assert icu_row is not None
    assert icu_row["Original_Count"] == 0.0
    assert icu_row["Delta"] == 5.0

    er_row = next((a for a in assignments if a["Unit"] == "ER"), None)
    assert er_row is not None
    assert er_row["Patient_Count"] == 0.0
    assert er_row["Original_Count"] == 5.0
    assert er_row["Delta"] == -5.0

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_legacy_2col_sql() -> None:
  """
  Test backward compatibility with 2-column SQL (Service, Count).
  Deltas should match Patient_Count (assumes Original=0).
  """
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection") as mock_conn_getter,
    patch("app.services.simulation_service.mpax_bridge.solve_unit_assignment_result") as mock_solver,
  ):
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = [("Neuro", 10.0)]
    mock_conn_getter.return_value = mock_conn

    mock_solver.return_value = Ok([{"Service": "Neuro", "Unit": "Ward_A", "Patient_Count": 10.0}])

    payload = {
      "demand_source_sql": "SELECT svc, cnt FROM table",
      "capacity_parameters": {"Ward_A": 20},
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

    assignments = res.json()["assignments"]
    assert len(assignments) == 1
    row = assignments[0]

    assert row["Unit"] == "Ward_A"
    assert row["Original_Count"] == 0.0
    assert row["Delta"] == 10.0

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_handles_infeasible_constraint_error() -> None:
  """`SIMULATION_INFEASIBLE` should map to HTTP 422 with diagnostic detail."""
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  payload = {"demand_source_sql": "SELECT 1", "capacity_parameters": {}}

  with patch(
    "app.services.simulation_service.SimulationService._fetch_demand_payload_result",
    return_value=Err(
      AppError(
        code=ErrorCode.SIMULATION_INFEASIBLE,
        message="Infeasible constraint: minimum flow (50.0) exceeds maximum flow (10.0)",
        status_code=422,
      )
    ),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

  assert res.status_code == 422
  assert "Infeasible constraint" in res.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_handles_value_error() -> None:
  """`SIMULATION_INVALID_DATA` should map to 400."""
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  payload = {"demand_source_sql": "SELECT 1", "capacity_parameters": {}}

  with patch(
    "app.services.simulation_service.SimulationService._fetch_demand_payload_result",
    return_value=Err(
      AppError(
        code=ErrorCode.SIMULATION_INVALID_DATA,
        message="Failed to execute demand query: bad",
        status_code=400,
      )
    ),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

  assert res.status_code == 400
  assert "bad" in res.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_handles_generic_error() -> None:
  """Generic `INTERNAL_ERROR` results should map to 500."""
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  payload = {"demand_source_sql": "SELECT 1", "capacity_parameters": {}}

  with patch(
    "app.services.simulation_service.SimulationService.run_scenario_result",
    return_value=Err(
      AppError(
        code=ErrorCode.INTERNAL_ERROR,
        message="Simulation Failed: boom",
        status_code=500,
      )
    ),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

  assert res.status_code == 500
  assert "Simulation Failed" in res.json()["detail"]
  app.dependency_overrides = {}
