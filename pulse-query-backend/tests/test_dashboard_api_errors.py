"""
Error-path coverage for dashboard router.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.api.routers.dashboards import _validate_sql_query


async def _auth_headers(client: AsyncClient) -> dict:
  email = f"dash_err_{uuid.uuid4()}@example.com"
  pwd = "pw"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})).json()["access_token"]
  return {"Authorization": f"Bearer {token}"}


def test_validate_sql_query_empty() -> None:
  """Empty queries should no-op without raising."""
  assert _validate_sql_query("") is None


@pytest.mark.asyncio
async def test_clone_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/clone", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.get(f"/api/v1/dashboards/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.put(f"/api/v1/dashboards/{uuid.uuid4()}", json={"name": "X"}, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.delete(f"/api/v1/dashboards/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_create_widget_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  payload = {"title": "W", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}}
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/widgets", json=payload, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_widget_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.put(
    f"/api/v1/dashboards/widgets/{uuid.uuid4()}",
    json={"title": "W", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}},
    headers=headers,
  )
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_widget_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.delete(f"/api/v1/dashboards/widgets/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_reorder_dashboard_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/reorder", json={"items": []}, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_success(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  create = await client.post("/api/v1/dashboards/", json={"name": "Old"}, headers=headers)
  dash_id = create.json()["id"]

  res = await client.put(f"/api/v1/dashboards/{dash_id}", json={"name": "New"}, headers=headers)
  assert res.status_code == 200
  assert res.json()["name"] == "New"


@pytest.mark.asyncio
async def test_delete_dashboard_success(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  create = await client.post("/api/v1/dashboards/", json={"name": "Temp"}, headers=headers)
  dash_id = create.json()["id"]

  res = await client.delete(f"/api/v1/dashboards/{dash_id}", headers=headers)
  assert res.status_code == 204


@pytest.mark.asyncio
async def test_delete_widget_success(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  create_dash = await client.post("/api/v1/dashboards/", json={"name": "W"}, headers=headers)
  dash_id = create_dash.json()["id"]

  widget = await client.post(
    f"/api/v1/dashboards/{dash_id}/widgets",
    json={"title": "W1", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}},
    headers=headers,
  )
  widget_id = widget.json()["id"]

  res = await client.delete(f"/api/v1/dashboards/widgets/{widget_id}", headers=headers)
  assert res.status_code == 204
