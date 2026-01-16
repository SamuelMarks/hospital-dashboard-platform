"""
Tests for Simulation API.

Verifies that the simulation endpoint correctly receives JSON config,
fetches data from DuckDB, and returns parsed assignments from MPAX.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user  # Import dependency

SIMULATION_URL = "/api/v1/simulation"


@pytest.mark.asyncio
async def test_run_simulation_success() -> None:
  """
  Test a valid simulation scenario.
  """
  # 1. Setup Mock User
  mock_user = MagicMock()
  # Use function object key
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # 2. Mock Connections and Services
  with (
    patch("app.services.simulation_service.duckdb_manager.get_readonly_connection") as mock_conn_getter,
    patch("app.services.simulation_service.mpax_bridge.solve_unit_assignment") as mock_solver,
  ):
    # Mock DuckDB demand fetch
    mock_conn = MagicMock()
    # Returns [('Cardio', 10), ('Neuro', 5)]
    mock_conn.execute.return_value.fetchall.return_value = [("Cardio", 10.0), ("Neuro", 5.0)]
    mock_conn_getter.return_value = mock_conn

    # Mock Solver Result
    mock_solver.return_value = json.dumps(
      [
        {"Service": "Cardio", "Unit": "ICU", "Patient_Count": 10.0},
        {"Service": "Neuro", "Unit": "PCU", "Patient_Count": 5.0},
      ]
    )

    # 3. Payload
    payload = {
      "demand_source_sql": "SELECT service, cnt FROM demand_table",
      "capacity_parameters": {"ICU": 20, "PCU": 20},
      "constraints": [],
    }

    # 4. Request
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

    # 5. Assertions
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert len(data["assignments"]) == 2
    assert data["assignments"][0]["Service"] == "Cardio"

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_simulation_sql_failure() -> None:
  """
  Test handling of SQL errors during demand fetching.
  """
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection") as mock_conn_getter:
    mock_conn = MagicMock()
    mock_conn.execute.side_effect = Exception("Table not found")
    mock_conn_getter.return_value = mock_conn

    payload = {"demand_source_sql": "SELECT * FROM ghost", "capacity_parameters": {"A": 10}}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"{SIMULATION_URL}/run", json=payload)

    assert res.status_code == 400
    assert "Failed to execute demand query" in res.json()["detail"]

  app.dependency_overrides = {}
