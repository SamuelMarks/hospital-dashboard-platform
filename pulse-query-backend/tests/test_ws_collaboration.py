"""
Tests for WebSocket Collaboration Channel and Manager.

Validates authentication, dashboard permission checks, presence management,
and broadcast behavior across real-time WebSocket collaborator channels.
"""

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, WebSocketDisconnect

from app.api.routers.ws import dashboard_websocket_endpoint
from app.core import security
from app.models.user import User
from app.services.ws_manager import DashboardConnectionManager, ws_manager


@pytest.mark.asyncio
async def test_ws_manager_connect_and_disconnect() -> None:
  """Test connect and disconnect lifecycle in ws_manager with presence and metadata."""
  manager = DashboardConnectionManager()
  dash_id = str(uuid.uuid4())
  mock_ws1 = MagicMock()
  mock_ws1.accept = AsyncMock()
  mock_ws1.send_json = AsyncMock()

  mock_ws2 = MagicMock()
  mock_ws2.accept = AsyncMock()
  mock_ws2.send_json = AsyncMock()

  await manager.connect(dash_id, mock_ws1, user_id="u1", email="u1@test.com", role="DATA_ANALYST")
  await manager.connect(dash_id, mock_ws2, user_id="u2", email="u2@test.com", role="CHIEF_MEDICAL_OFFICER")
  mock_ws1.accept.assert_awaited_once()
  assert mock_ws1 in manager.active_connections[dash_id]
  assert mock_ws2 in manager.active_connections[dash_id]

  users = manager.get_active_users(dash_id)
  assert len(users) == 2
  assert users[0]["user_id"] == "u1"
  assert users[1]["user_id"] == "u2"

  # Disconnect one websocket; connection list remains non-empty
  meta1 = manager.disconnect(dash_id, mock_ws1)
  assert meta1 is not None
  assert meta1["user_id"] == "u1"
  assert dash_id in manager.active_connections
  assert mock_ws1 not in manager.active_connections[dash_id]
  assert mock_ws2 in manager.active_connections[dash_id]

  # Disconnect second websocket; key is deleted
  meta2 = manager.disconnect(dash_id, mock_ws2)
  assert meta2 is not None
  assert meta2["user_id"] == "u2"
  assert dash_id not in manager.active_connections

  # Disconnecting a websocket from non-existent dashboard should safely return None
  assert manager.disconnect("non-existent-dash", mock_ws1) is None

  # Disconnecting an untracked websocket from active dashboard
  untracked_ws = MagicMock()
  await manager.connect(dash_id, mock_ws1, user_id="u1")
  assert manager.disconnect(dash_id, untracked_ws) is None
  assert mock_ws1 in manager.active_connections[dash_id]


@pytest.mark.asyncio
async def test_ws_manager_broadcast_success_sender_exclusion_and_stale_cleanup() -> None:
  """Test broadcast sends message to clients, excludes sender, and discards failed sockets."""
  manager = DashboardConnectionManager()
  dash_id = str(uuid.uuid4())

  ws1 = MagicMock()
  ws1.accept = AsyncMock()
  ws1.send_json = AsyncMock()

  ws2 = MagicMock()
  ws2.accept = AsyncMock()
  ws2.send_json = AsyncMock(side_effect=RuntimeError("Connection closed"))

  ws3 = MagicMock()
  ws3.accept = AsyncMock()
  ws3.send_json = AsyncMock()

  await manager.connect(dash_id, ws1, user_id="u1")
  await manager.connect(dash_id, ws2, user_id="u2")
  await manager.connect(dash_id, ws3, user_id="u3")

  ws1.send_json.reset_mock()
  ws2.send_json.reset_mock()
  ws3.send_json.reset_mock()

  payload = {"event": "WIDGET_UPDATED", "widget_id": "w1"}
  # Broadcast excluding ws1 as sender
  await manager.broadcast(dash_id, payload, sender=ws1)

  # ws1 should be excluded
  ws1.send_json.assert_not_called()
  # ws3 should receive payload
  ws3.send_json.assert_awaited_once_with(payload)
  # ws2 should have been purged due to exception
  assert ws2 not in manager.active_connections[dash_id]
  assert ws1 in manager.active_connections[dash_id]
  assert ws3 in manager.active_connections[dash_id]

  # Broadcast to non-existent dashboard should safely return
  await manager.broadcast("non-existent-dash", payload)


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_missing_token() -> None:
  """Connecting without token should close with 4401."""
  dash_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.close = AsyncMock()
  db = AsyncMock()

  await dashboard_websocket_endpoint(mock_ws, dash_id, token=None, db=db)
  mock_ws.close.assert_awaited_once_with(code=4401, reason="Unauthorized: Missing authentication token")


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_invalid_token_payload() -> None:
  """Connecting with malformed or sub-missing token should close with 4401."""
  dash_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.close = AsyncMock()
  db = AsyncMock()

  # Token without 'sub'
  with patch("app.api.routers.ws.jwt.decode", return_value={"other": "claim"}):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token="token-without-sub", db=db)
  mock_ws.close.assert_awaited_with(code=4401, reason="Unauthorized: Invalid token payload")

  # Malformed JWT
  with patch("app.api.routers.ws.jwt.decode", side_effect=ValueError("bad token")):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token="bad-jwt", db=db)
  mock_ws.close.assert_awaited_with(code=4401, reason="Unauthorized: Could not validate credentials")


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_user_not_found_or_inactive() -> None:
  """Connecting with valid token but non-existent or inactive user should close with 4401."""
  dash_id = uuid.uuid4()
  user_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.close = AsyncMock()
  db = AsyncMock()

  valid_token = security.create_access_token(subject=user_id, expires_delta=timedelta(minutes=10))

  # Case 1: User not found in DB
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = None
  db.execute.return_value = mock_result

  await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)
  mock_ws.close.assert_awaited_with(code=4401, reason="Unauthorized: Inactive or non-existent user")

  # Case 2: Inactive user
  inactive_user = MagicMock(spec=User)
  inactive_user.is_active = False
  mock_result.scalars.return_value.first.return_value = inactive_user

  await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)
  mock_ws.close.assert_awaited_with(code=4401, reason="Unauthorized: Inactive or non-existent user")


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_access_denied() -> None:
  """Connecting to unauthorized dashboard should close with 4403."""
  dash_id = uuid.uuid4()
  user_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.close = AsyncMock()
  db = AsyncMock()

  valid_token = security.create_access_token(subject=user_id, expires_delta=timedelta(minutes=10))
  active_user = MagicMock(spec=User)
  active_user.id = user_id
  active_user.is_active = True
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = active_user
  db.execute.return_value = mock_result

  # HTTPException from permission check
  with patch(
    "app.api.routers.ws.get_dashboard_with_access",
    side_effect=HTTPException(status_code=403, detail="Permission denied"),
  ):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)
  mock_ws.close.assert_awaited_with(code=4403, reason="Forbidden: Permission denied")

  # Generic exception from permission check
  with patch(
    "app.api.routers.ws.get_dashboard_with_access",
    side_effect=RuntimeError("Access denied"),
  ):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)
  mock_ws.close.assert_awaited_with(code=4403, reason="Forbidden: Access denied to dashboard")


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_full_lifecycle() -> None:
  """Connecting with valid credentials should accept connection, broadcast presence, and cleanup on disconnect."""
  dash_id = uuid.uuid4()
  user_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.accept = AsyncMock()
  mock_ws.close = AsyncMock()
  mock_ws.send_json = AsyncMock()
  mock_ws.receive_json = AsyncMock(side_effect=[{"type": "WIDGET_RELOAD"}, WebSocketDisconnect()])
  db = AsyncMock()

  valid_token = security.create_access_token(subject=user_id, expires_delta=timedelta(minutes=10))
  active_user = MagicMock(spec=User)
  active_user.id = user_id
  active_user.email = "collab@hospital.org"
  active_user.role = "ATTENDING_PHYSICIAN"
  active_user.is_active = True

  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = active_user
  db.execute.return_value = mock_result

  with patch("app.api.routers.ws.get_dashboard_with_access", return_value=(MagicMock(), "VIEW")):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)

  mock_ws.accept.assert_awaited_once()
  assert str(dash_id) not in ws_manager.active_connections


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_generic_exception() -> None:
  """Socket error during message loop triggers cleanup and USER_LEFT broadcast."""
  dash_id = uuid.uuid4()
  user_id = uuid.uuid4()
  mock_ws = MagicMock()
  mock_ws.accept = AsyncMock()
  mock_ws.close = AsyncMock()
  mock_ws.send_json = AsyncMock()
  mock_ws.receive_json = AsyncMock(side_effect=RuntimeError("Connection terminated abruptly"))
  db = AsyncMock()

  valid_token = security.create_access_token(subject=user_id, expires_delta=timedelta(minutes=10))
  active_user = MagicMock(spec=User)
  active_user.id = user_id
  active_user.email = "error@hospital.org"
  active_user.role = "CHARGE_NURSE"
  active_user.is_active = True

  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = active_user
  db.execute.return_value = mock_result

  with patch("app.api.routers.ws.get_dashboard_with_access", return_value=(MagicMock(), "VIEW")):
    await dashboard_websocket_endpoint(mock_ws, dash_id, token=valid_token, db=db)

  mock_ws.accept.assert_awaited_once()
  assert str(dash_id) not in ws_manager.active_connections


@pytest.mark.asyncio
async def test_dashboard_websocket_endpoint_untracked_disconnect_branches() -> None:
  """Test WebSocketDisconnect and Exception when ws_manager returns None for user_meta."""
  dash_id = uuid.uuid4()
  user_id = uuid.uuid4()
  db = AsyncMock()

  valid_token = security.create_access_token(subject=user_id, expires_delta=timedelta(minutes=10))
  active_user = MagicMock(spec=User)
  active_user.id = user_id
  active_user.email = "untracked@hospital.org"
  active_user.role = "DATA_ANALYST"
  active_user.is_active = True

  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = active_user
  db.execute.return_value = mock_result

  # Branch 1: WebSocketDisconnect when disconnect returns None
  mock_ws1 = MagicMock()
  mock_ws1.accept = AsyncMock()
  mock_ws1.close = AsyncMock()
  mock_ws1.receive_json = AsyncMock(side_effect=WebSocketDisconnect())

  with (
    patch("app.api.routers.ws.get_dashboard_with_access", return_value=(MagicMock(), "VIEW")),
    patch("app.api.routers.ws.ws_manager.disconnect", return_value=None),
  ):
    await dashboard_websocket_endpoint(mock_ws1, dash_id, token=valid_token, db=db)

  # Branch 2: Generic Exception when disconnect returns None
  mock_ws2 = MagicMock()
  mock_ws2.accept = AsyncMock()
  mock_ws2.close = AsyncMock()
  mock_ws2.receive_json = AsyncMock(side_effect=RuntimeError("Generic failure"))

  with (
    patch("app.api.routers.ws.get_dashboard_with_access", return_value=(MagicMock(), "VIEW")),
    patch("app.api.routers.ws.ws_manager.disconnect", return_value=None),
  ):
    await dashboard_websocket_endpoint(mock_ws2, dash_id, token=valid_token, db=db)
