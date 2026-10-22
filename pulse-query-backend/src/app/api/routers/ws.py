"""
WebSocket Collaboration Router for Real-Time Dashboard updates.

Supports bi-directional WebSocket messaging between dashboard collaborators,
broadcasting layout updates, active presence, and live widget refresh events.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.routers.dashboards import get_dashboard_with_access
from app.core.result import Err
from app.database.postgres import get_db
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.websocket("/dashboards/{dashboard_id}")
async def dashboard_websocket_endpoint(
  websocket: WebSocket,
  dashboard_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  token: Annotated[str | None, Query()] = None,
) -> None:
  """
  WebSocket endpoint facilitating real-time collaborator presence and widget events.

  Requires an active JWT token query parameter and VIEW permissions to the dashboard.

  Args:
      websocket (WebSocket): Incoming client WebSocket connection.
      dashboard_id (UUID): ID of the dashboard being observed or edited.
      db (AsyncSession): PostgreSQL async database session.
      token (str | None): JWT access token provided as a query parameter.
  """
  if not token:
    await websocket.close(code=4401, reason="Unauthorized: Missing authentication token")
    return

  auth_res = await deps.authenticate_bearer_token(token, db)
  if isinstance(auth_res, Err):
    ws_reason = auth_res.error.details.get("ws_reason", "Unauthorized: Could not validate credentials")
    await websocket.close(code=4401, reason=ws_reason)
    return

  user = auth_res.value

  try:
    await get_dashboard_with_access(dashboard_id, user, db, required_level="VIEW")
  except HTTPException as exc:
    await websocket.close(code=4403, reason=f"Forbidden: {exc.detail}")
    return
  except Exception:
    await websocket.close(code=4403, reason="Forbidden: Access denied to dashboard")
    return

  dash_key = str(dashboard_id)
  await ws_manager.connect(
    dash_key,
    websocket,
    user_id=str(user.id),
    email=user.email,
    role=user.role,
  )
  try:
    while True:
      data = await websocket.receive_json()
      await ws_manager.broadcast(dash_key, data, sender=websocket)
  except WebSocketDisconnect:
    user_meta = ws_manager.disconnect(dash_key, websocket)
    if user_meta:
      await ws_manager.broadcast(
        dash_key,
        {
          "type": "USER_LEFT",
          "user": user_meta,
          "active_users": ws_manager.get_active_users(dash_key),
        },
      )
  except Exception:
    user_meta = ws_manager.disconnect(dash_key, websocket)
    if user_meta:
      await ws_manager.broadcast(
        dash_key,
        {
          "type": "USER_LEFT",
          "user": user_meta,
          "active_users": ws_manager.get_active_users(dash_key),
        },
      )
