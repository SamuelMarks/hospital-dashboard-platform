"""
Tests for Simulation API.

Verifies that the simulation endpoint correctly receives JSON config,
fetches data from DuckDB (handling 2 or 3 column formats),
and returns parsed assignments with Delta values.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user  # Import dependency

SIMULATION_URL = "/api/v1/simulation"


@pytest.mark.asyncio
async def test_run_simulation_with_delta_success() -> None:
  """
  Test a simulation where the input SQL provides 3 columns (Service, Unit, Count).
  Verifies that 'Original' and 'Delta' fields are calculated correctly.
  """
  # 1. Setup Mock User
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # 2. Mock Connections and Services
  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection") as mock_conn_getter,
    patch("app.services.simulation_service.mpax_bridge.solve_unit_assignment") as mock_solver,
  ):
    # Mock DuckDB: Return current state
    # Cardio is currently in 'ER' (5 pts).
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = [("Cardio", "ER", 5.0)]
    mock_conn_getter.return_value = mock_conn

    # Mock Solver: Moves patients to 'ICU'
    # Solver output format: [{"Service": "Cardio", "Unit": "ICU", "Patient_Count": 5.0}]
    # Note: Solver won't return 'ER' because count is 0 there now.
    mock_solver.return_value = json.dumps([{"Service": "Cardio", "Unit": "ICU", "Patient_Count": 5.0}])

    # 3. Payload
    payload = {
      "demand_source_sql": "SELECT svc, unit, cnt FROM table",
      "capacity_parameters": {"ICU": 10, "ER": 10},
      "constraints": [],
    }

    # 4. Request
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

    # 5. Assertions
    assert res.status_code == 200
    data = res.json()
    assignments = data["assignments"]

    # We expect 2 entries:
    # 1. Cardio -> ICU: Current=0, New=5, Delta=+5
    # 2. Cardio -> ER: Current=5, New=0, Delta=-5 (Inferred 0)

    # Find ICU entry
    icu_row = next((a for a in assignments if a["Unit"] == "ICU"), None)
    assert icu_row is not None
    assert icu_row["Original_Count"] == 0.0
    assert icu_row["Delta"] == 5.0

    # Find ER entry
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
    patch("app.services.simulation_service.mpax_bridge.solve_unit_assignment") as mock_solver,
  ):
    # Mock DuckDB: 2 Columns
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = [("Neuro", 10.0)]
    mock_conn_getter.return_value = mock_conn

    # Solver
    mock_solver.return_value = json.dumps([{"Service": "Neuro", "Unit": "Ward_A", "Patient_Count": 10.0}])

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
async def test_run_simulation_handles_value_error() -> None:
  """ValueError should map to 400."""
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  payload = {"demand_source_sql": "SELECT 1", "capacity_parameters": {}}

  with patch("app.api.routers.simulation.simulation_service.run_scenario", side_effect=ValueError("bad")):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

  assert res.status_code == 400
  assert "bad" in res.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_handles_generic_error() -> None:
  """Generic errors should map to 500."""
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  payload = {"demand_source_sql": "SELECT 1", "capacity_parameters": {}}

  with patch("app.api.routers.simulation.simulation_service.run_scenario", side_effect=RuntimeError("boom")):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

  assert res.status_code == 500
  assert "Simulation Failed" in res.json()["detail"]

  app.dependency_overrides = {}
