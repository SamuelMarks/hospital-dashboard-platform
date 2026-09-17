"""
Tests for Granular Multi-User Dashboard Sharing and Access Control.

Verifies ownership and role enforcement (OWNER, EDIT, VIEW) across dashboard reads,
updates, widget manipulations, exports, and share management.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.models.dashboard import Dashboard, Widget
from app.models.user import User


@pytest.fixture
async def sharing_users(db_session):
  """
  Creates an owner, an editor, a viewer, and an unauthorized user for testing.
  """
  owner = User(id=uuid.uuid4(), email="owner@hospital.org", hashed_password="pw", is_active=True)
  editor = User(id=uuid.uuid4(), email="editor@hospital.org", hashed_password="pw", is_active=True)
  viewer = User(id=uuid.uuid4(), email="viewer@hospital.org", hashed_password="pw", is_active=True)
  unauth = User(id=uuid.uuid4(), email="unauth@hospital.org", hashed_password="pw", is_active=True)

  for u in (owner, editor, viewer, unauth):
    db_session.add(u)
  await db_session.commit()
  for u in (owner, editor, viewer, unauth):
    await db_session.refresh(u)

  return {"owner": owner, "editor": editor, "viewer": viewer, "unauth": unauth}


def set_active_user(user: User):
  """Overrides dependency to simulate request as specific user."""
  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: user


@pytest.mark.asyncio
async def test_dashboard_sharing_lifecycle(client: AsyncClient, sharing_users, db_session) -> None:
  """
  Tests complete sharing lifecycle: owner grants VIEW/EDIT, checks access, and revokes.
  """
  owner = sharing_users["owner"]
  editor = sharing_users["editor"]
  viewer = sharing_users["viewer"]
  unauth = sharing_users["unauth"]

  # 1. Owner creates a dashboard with an initial widget
  set_active_user(owner)
  dash = Dashboard(id=uuid.uuid4(), name="ICU Ops Shared", owner_id=owner.id)
  db_session.add(dash)
  await db_session.flush()

  wid = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Census",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 1"},
  )
  db_session.add(wid)
  await db_session.commit()

  # 2. Owner shares with Viewer (VIEW) and Editor (EDIT)
  res_view = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": viewer.email, "permission_level": "VIEW"},
  )
  assert res_view.status_code == 200
  assert res_view.json()["permission_level"] == "VIEW"

  res_edit = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": editor.email, "permission_level": "EDIT"},
  )
  assert res_edit.status_code == 200
  assert res_edit.json()["permission_level"] == "EDIT"

  # Update existing share with viewer to EDIT (covers lines 623-624)
  res_update_share = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": viewer.email, "permission_level": "EDIT"},
  )
  assert res_update_share.status_code == 200
  assert res_update_share.json()["permission_level"] == "EDIT"

  # Set back to VIEW
  await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": viewer.email, "permission_level": "VIEW"},
  )

  # 3. List shares
  shares_res = await client.get(f"/api/v1/dashboards/{dash.id}/shares")
  assert shares_res.status_code == 200
  assert len(shares_res.json()) == 2

  # 4. Viewer tests: can view, list, and export, cannot edit or delete
  set_active_user(viewer)
  list_shared = await client.get("/api/v1/dashboards")
  assert list_shared.status_code == 200
  assert any(d["id"] == str(dash.id) and d["permission_level"] == "VIEW" for d in list_shared.json())

  view_dash = await client.get(f"/api/v1/dashboards/{dash.id}")
  assert view_dash.status_code == 200
  assert view_dash.json()["permission_level"] == "VIEW"

  view_export = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json")
  assert view_export.status_code == 200

  # Viewer cannot rename
  fail_rename = await client.put(f"/api/v1/dashboards/{dash.id}", json={"name": "Hacked Name"})
  assert fail_rename.status_code == 403

  # Viewer cannot create widget
  fail_create_widget = await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "Hacked Widget", "type": "SQL", "visualization": "table", "config": {"query": "SELECT 1"}},
  )
  assert fail_create_widget.status_code == 403

  # Viewer cannot delete dashboard
  fail_del = await client.delete(f"/api/v1/dashboards/{dash.id}")
  assert fail_del.status_code == 403

  # 5. Editor tests: can edit and create widgets, cannot delete dashboard or share
  set_active_user(editor)
  edit_rename = await client.put(f"/api/v1/dashboards/{dash.id}", json={"name": "Renamed By Editor"})
  assert edit_rename.status_code == 200

  create_wid_res = await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "Editor Widget", "type": "SQL", "visualization": "table", "config": {"query": "SELECT 2"}},
  )
  assert create_wid_res.status_code == 200
  new_wid_id = create_wid_res.json()["id"]

  # Editor can reorder
  reorder_res = await client.post(
    f"/api/v1/dashboards/{dash.id}/reorder",
    json={"items": [{"id": new_wid_id, "order": 1}]},
  )
  assert reorder_res.status_code == 200

  # Editor can delete widget
  del_wid_res = await client.delete(f"/api/v1/dashboards/widgets/{new_wid_id}")
  assert del_wid_res.status_code == 204

  # Editor cannot delete the dashboard itself
  editor_fail_del = await client.delete(f"/api/v1/dashboards/{dash.id}")
  assert editor_fail_del.status_code == 403

  # Editor cannot share with others
  editor_fail_share = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": unauth.email, "permission_level": "VIEW"},
  )
  assert editor_fail_share.status_code == 403

  # 6. Unauthorized user gets 404
  set_active_user(unauth)
  unauth_res = await client.get(f"/api/v1/dashboards/{dash.id}")
  assert unauth_res.status_code == 404

  # 7. Owner revokes share
  set_active_user(owner)
  share_id = res_view.json()["id"]
  del_share_res = await client.delete(f"/api/v1/dashboards/{dash.id}/shares/{share_id}")
  assert del_share_res.status_code == 204

  # Viewer now gets 404
  set_active_user(viewer)
  revoked_res = await client.get(f"/api/v1/dashboards/{dash.id}")
  assert revoked_res.status_code == 404

  # Cleanup overrides
  from app.main import app

  app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_sharing_validation_errors(client: AsyncClient, sharing_users, db_session) -> None:
  """
  Verifies input validation: sharing with self, unknown user, and invalid permission level.
  """
  owner = sharing_users["owner"]
  set_active_user(owner)

  dash = Dashboard(id=uuid.uuid4(), name="Validation Test Dash", owner_id=owner.id)
  db_session.add(dash)
  await db_session.commit()

  # Share with self
  res_self = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": owner.email, "permission_level": "VIEW"},
  )
  assert res_self.status_code == 400
  assert "Cannot share dashboard with yourself" in res_self.json()["detail"]

  # Share with non-existent user
  res_unknown = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": "nonexistent@fake.org", "permission_level": "VIEW"},
  )
  assert res_unknown.status_code == 404

  # Invalid permission level
  res_bad_perm = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": sharing_users["viewer"].email, "permission_level": "SUPERUSER"},
  )
  assert res_bad_perm.status_code == 400

  # Delete non-existent share
  fake_share_id = uuid.uuid4()
  res_del_fake = await client.delete(f"/api/v1/dashboards/{dash.id}/shares/{fake_share_id}")
  assert res_del_fake.status_code == 404

  from app.main import app

  app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_shared_dashboard_execution(client: AsyncClient, sharing_users, db_session) -> None:
  """
  Verifies that shared users with VIEW or EDIT permissions can refresh dashboards and widgets,
  while unauthorized users receive 404 Not Found.
  """
  owner = sharing_users["owner"]
  editor = sharing_users["editor"]
  viewer = sharing_users["viewer"]
  unauth = sharing_users["unauth"]

  # 1. Owner creates a dashboard with an initial widget
  set_active_user(owner)
  dash = Dashboard(id=uuid.uuid4(), name="Shared Exec Dash", owner_id=owner.id)
  db_session.add(dash)
  await db_session.flush()

  wid = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Census Summary",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 1 AS count"},
  )
  db_session.add(wid)
  await db_session.commit()

  # 2. Share with Viewer (VIEW) and Editor (EDIT)
  res_view = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": viewer.email, "permission_level": "VIEW"},
  )
  assert res_view.status_code == 200

  res_edit = await client.post(
    f"/api/v1/dashboards/{dash.id}/shares",
    json={"user_email": editor.email, "permission_level": "EDIT"},
  )
  assert res_edit.status_code == 200

  # 3. Viewer executes refresh_dashboard
  set_active_user(viewer)
  res_viewer_refresh = await client.post(f"/api/v1/dashboards/{dash.id}/refresh")
  assert res_viewer_refresh.status_code == 200
  data = res_viewer_refresh.json()
  assert str(wid.id) in data

  # 4. Viewer executes refresh_widget
  res_viewer_widget = await client.post(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/refresh")
  assert res_viewer_widget.status_code == 200
  assert str(wid.id) in res_viewer_widget.json()

  # 5. Editor executes refresh_dashboard and refresh_widget
  set_active_user(editor)
  res_editor_refresh = await client.post(f"/api/v1/dashboards/{dash.id}/refresh")
  assert res_editor_refresh.status_code == 200
  res_editor_widget = await client.post(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/refresh")
  assert res_editor_widget.status_code == 200

  # 6. Unauthorized user gets 404
  set_active_user(unauth)
  res_unauth_refresh = await client.post(f"/api/v1/dashboards/{dash.id}/refresh")
  assert res_unauth_refresh.status_code == 404

  res_unauth_widget = await client.post(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/refresh")
  assert res_unauth_widget.status_code == 404

  # 7. Non-existent widget on shared dashboard returns 404
  set_active_user(viewer)
  res_fake_widget = await client.post(f"/api/v1/dashboards/{dash.id}/widgets/{uuid.uuid4()}/refresh")
  assert res_fake_widget.status_code == 404

  from app.main import app

  app.dependency_overrides.pop(get_current_user, None)
