"""
Error-path coverage for dashboard router.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Executable

from app.api.routers.dashboards import _validate_sql_query


async def _auth_headers(client: AsyncClient) -> dict[str, str]:
  """
  Registers and logs in a unique test user and returns Authorization headers.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.

  Returns:
      dict[str, str]: Dictionary containing the `Authorization: Bearer <token>` header.
  """
  email = f"dash_err_{uuid.uuid4()}@example.com"
  pwd = "pw"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})).json()["access_token"]
  return {"Authorization": f"Bearer {token}"}


def test_validate_sql_query_empty() -> None:
  """Empty queries should no-op without raising."""
  _validate_sql_query("")


@pytest.mark.asyncio
async def test_clone_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `POST /dashboards/{id}/clone` returns 404 when the source dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/clone", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `GET /dashboards/{id}` returns 404 when the dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.get(f"/api/v1/dashboards/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `PUT /dashboards/{id}` returns 404 when the dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.put(f"/api/v1/dashboards/{uuid.uuid4()}", json={"name": "X"}, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `DELETE /dashboards/{id}` returns 404 when the dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.delete(f"/api/v1/dashboards/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_create_widget_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `POST /dashboards/{id}/widgets` returns 404 when the parent dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  payload = {"title": "W", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}}
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/widgets", json=payload, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_widget_not_found(client: AsyncClient) -> None:
  """
  Verifies `PUT /dashboards/widgets/{id}` returns 404 when the widget does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.put(
    f"/api/v1/dashboards/widgets/{uuid.uuid4()}",
    json={"title": "W", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}},
    headers=headers,
  )
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_widget_not_found(client: AsyncClient) -> None:
  """
  Verifies `DELETE /dashboards/widgets/{id}` returns 404 when the widget does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.delete(f"/api/v1/dashboards/widgets/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_reorder_dashboard_not_found(client: AsyncClient) -> None:
  """
  Verifies `POST /dashboards/{id}/reorder` returns 404 when the dashboard does not exist.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  res = await client.post(f"/api/v1/dashboards/{uuid.uuid4()}/reorder", json={"items": []}, headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_dashboard_success(client: AsyncClient) -> None:
  """
  Verifies `PUT /dashboards/{id}` renames an owned dashboard and returns 200.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  create = await client.post("/api/v1/dashboards/", json={"name": "Old"}, headers=headers)
  dash_id = create.json()["id"]

  res = await client.put(f"/api/v1/dashboards/{dash_id}", json={"name": "New"}, headers=headers)
  assert res.status_code == 200
  assert res.json()["name"] == "New"


@pytest.mark.asyncio
async def test_delete_dashboard_success(client: AsyncClient) -> None:
  """
  Verifies `DELETE /dashboards/{id}` deletes an owned dashboard and returns 204.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
  headers = await _auth_headers(client)
  create = await client.post("/api/v1/dashboards/", json={"name": "Temp"}, headers=headers)
  dash_id = create.json()["id"]

  res = await client.delete(f"/api/v1/dashboards/{dash_id}", headers=headers)
  assert res.status_code == 204


@pytest.mark.asyncio
async def test_delete_widget_success(client: AsyncClient) -> None:
  """
  Verifies `DELETE /dashboards/widgets/{id}` deletes an existing widget and returns 204.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
  """
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

  from tests import conftest

  headers = await _auth_headers(client)
  orig_execute = conftest.AsyncSessionShim.execute

  async def mock_execute(self: conftest.AsyncSessionShim, statement: Executable) -> object:
    """
    Intercepts dashboard select queries to simulate None return after commit.

    Args:
        self (conftest.AsyncSessionShim): Session instance.
        statement (Executable): SQLAlchemy statement.

    Returns:
        object: Mocked or original execution result.
    """
    res = await orig_execute(self, statement)
    stmt_str = str(statement)
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

  from tests import conftest

  headers = await _auth_headers(client)
  create_dash = await client.post("/api/v1/dashboards/", json={"name": "SourceDash"}, headers=headers)
  dash_id = create_dash.json()["id"]

  orig_execute = conftest.AsyncSessionShim.execute
  clone_call = False
  dash_queries = 0

  async def mock_execute(self: conftest.AsyncSessionShim, statement: Executable) -> object:
    """
    Intercepts the second dashboard select query during clone to simulate None return.

    Args:
        self (conftest.AsyncSessionShim): Session instance.
        statement (Executable): SQLAlchemy statement.

    Returns:
        object: Mocked or original execution result.
    """
    nonlocal dash_queries
    res = await orig_execute(self, statement)
    stmt_str = str(statement)
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

  from tests import conftest

  headers = await _auth_headers(client)
  orig_execute = conftest.AsyncSessionShim.execute

  async def mock_execute(self: conftest.AsyncSessionShim, statement: Executable) -> object:
    """
    Intercepts dashboard select queries during restore-defaults to simulate None return.

    Args:
        self (conftest.AsyncSessionShim): Session instance.
        statement (Executable): SQLAlchemy statement.

    Returns:
        object: Mocked or original execution result.
    """
    res = await orig_execute(self, statement)
    stmt_str = str(statement)
    if "dashboards" in stmt_str.lower() and "users" not in stmt_str.lower():
      mock_res = MagicMock()
      mock_res.scalars.return_value.first.return_value = None
      return mock_res
    return res

  with patch.object(conftest.AsyncSessionShim, "execute", side_effect=mock_execute, autospec=True):
    res = await client.post("/api/v1/dashboards/restore-defaults", headers=headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Default dashboard could not be restored"


@pytest.mark.asyncio
async def test_dashboards_widget_update_and_reorder_branches(client: AsyncClient, db_session: AsyncSession) -> None:
  """Verifies HTTP/SQL widget creation, updates with/without SQL query, and reorder with/without group."""
  from app.core.security import create_access_token
  from app.models.dashboard import Dashboard, Widget
  from app.models.user import User

  user = User(id=uuid.uuid4(), email=f"d_br_{uuid.uuid4()}@test.com", hashed_password="x", is_active=True)
  db_session.add(user)
  await db_session.commit()
  headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}

  dash = Dashboard(id=uuid.uuid4(), name="d", owner_id=user.id)
  db_session.add(dash)
  await db_session.commit()
  w1 = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w1", type="HTTP", visualization="SCALAR", config={"url": "u"})
  w_sql = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w_s", type="SQL", visualization="TABLE", config={"query": "SELECT 1"}
  )
  w_sql_no_query = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w_sq_nq", type="SQL", visualization="TABLE", config={}
  )
  db_session.add_all([w1, w_sql, w_sql_no_query])
  await db_session.commit()

  r_http = await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "t", "type": "HTTP", "visualization": "table", "config": {"url": "https://api.test"}},
    headers=headers,
  )
  assert r_http.status_code == 200

  r_sql = await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "sql_wid", "type": "SQL", "visualization": "table", "config": {"query": "SELECT 1;"}},
    headers=headers,
  )
  assert r_sql.status_code == 200

  u1 = await client.put(
    f"/api/v1/dashboards/widgets/{w_sql.id}",
    json={"title": "updated_sql", "config": {"query": "SELECT 2;"}},
    headers=headers,
  )
  assert u1.status_code == 200

  u2 = await client.put(f"/api/v1/dashboards/widgets/{w1.id}", json={"title": "t2", "config": {"x": 1}}, headers=headers)
  assert u2.status_code == 200

  u3 = await client.put(
    f"/api/v1/dashboards/widgets/{w_sql_no_query.id}", json={"title": "t3", "config": {"y": 2}}, headers=headers
  )
  assert u3.status_code == 200

  bad_id = str(uuid.uuid4())
  r_reorder = await client.post(
    f"/api/v1/dashboards/{dash.id}/reorder",
    json={
      "items": [
        {"id": str(w1.id), "order": 2, "group": None},
        {"id": bad_id, "order": 3, "group": "g"},
        {"id": str(w_sql.id), "order": 4, "group": "g2"},
      ]
    },
    headers=headers,
  )
  assert r_reorder.status_code == 200
