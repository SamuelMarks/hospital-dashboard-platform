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


@pytest.mark.asyncio
async def test_create_dashboard_scalars_none(client: AsyncClient) -> None:
  """Test create_dashboard raises 404 if re-selected dashboard returns None."""
  from unittest.mock import MagicMock, patch
  import conftest

  headers = await _auth_headers(client)
  orig_execute = conftest.AsyncSessionShim.execute

  async def mock_execute(self, *args, **kwargs):
    res = await orig_execute(self, *args, **kwargs)
    stmt_str = str(args[0]) if args else ""
    if "dashboards" in stmt_str.lower() and "users" not in stmt_str.lower():
      mock_res = MagicMock()
      mock_res.scalars.return_value.first.return_value = None
      return mock_res
    return res

  with patch.object(conftest.AsyncSessionShim, "execute", side_effect=mock_execute, autospec=True):
    res = await client.post("/api/v1/dashboards/", json={"name": "TestNone"}, headers=headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Dashboard not found"


@pytest.mark.asyncio
async def test_clone_dashboard_scalars_none(client: AsyncClient) -> None:
  """Test clone_dashboard raises 404 if re-selected dashboard returns None."""
  from unittest.mock import MagicMock, patch
  import conftest

  headers = await _auth_headers(client)
  create_dash = await client.post("/api/v1/dashboards/", json={"name": "SourceDash"}, headers=headers)
  dash_id = create_dash.json()["id"]

  orig_execute = conftest.AsyncSessionShim.execute
  clone_call = False
  dash_queries = 0

  async def mock_execute(self, *args, **kwargs):
    nonlocal dash_queries
    res = await orig_execute(self, *args, **kwargs)
    stmt_str = str(args[0]) if args else ""
    if clone_call and "dashboards" in stmt_str.lower() and "users" not in stmt_str.lower():
      dash_queries += 1
      # First dashboard query in clone_dashboard is _get_dashboard_with_access, second is reload
      if dash_queries >= 2:
        mock_res = MagicMock()
        mock_res.scalars.return_value.first.return_value = None
        return mock_res
    return res

  with patch.object(conftest.AsyncSessionShim, "execute", side_effect=mock_execute, autospec=True):
    clone_call = True
    res = await client.post(f"/api/v1/dashboards/{dash_id}/clone", headers=headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Cloned dashboard could not be loaded"


@pytest.mark.asyncio
async def test_restore_default_dashboard_scalars_none(client: AsyncClient) -> None:
  """Test restore_default_dashboard raises 404 if re-selected dashboard returns None."""
  from unittest.mock import MagicMock, patch
  import conftest

  headers = await _auth_headers(client)
  orig_execute = conftest.AsyncSessionShim.execute

  async def mock_execute(self, *args, **kwargs):
    res = await orig_execute(self, *args, **kwargs)
    stmt_str = str(args[0]) if args else ""
    if "dashboards" in stmt_str.lower() and "users" not in stmt_str.lower():
      mock_res = MagicMock()
      mock_res.scalars.return_value.first.return_value = None
      return mock_res
    return res

  with patch.object(conftest.AsyncSessionShim, "execute", side_effect=mock_execute, autospec=True):
    res = await client.post("/api/v1/dashboards/restore-defaults", headers=headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Default dashboard could not be restored"
