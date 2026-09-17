"""
WebSocket Collaboration Router for Real-Time Dashboard updates.

Supports bi-directional WebSocket messaging between dashboard collaborators,
broadcasting layout updates, active presence, and live widget refresh events.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.dashboards import get_dashboard_with_access
from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.token import TokenPayload
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.websocket("/dashboards/{dashboard_id}")
async def dashboard_websocket_endpoint(
  websocket: WebSocket,
  dashboard_id: UUID,
  token: Annotated[str | None, Query()] = None,
  db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> None:
  """
  WebSocket endpoint facilitating real-time collaborator presence and widget events.

  Requires an active JWT token query parameter and VIEW permissions to the dashboard.

  Args:
      websocket (WebSocket): Incoming client WebSocket connection.
      dashboard_id (UUID): ID of the dashboard being observed or edited.
      token (str | None): JWT access token provided as a query parameter.
      db (AsyncSession): PostgreSQL async database session.
  """
  # 1. Validate Token
  if not token:
    await websocket.close(code=4401, reason="Unauthorized: Missing authentication token")
    return

  try:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    user_id_str = payload.get("sub")
    if not user_id_str:
      await websocket.close(code=4401, reason="Unauthorized: Invalid token payload")
      return
    token_data = TokenPayload(sub=UUID(user_id_str))
  except (JWTError, ValueError):
    await websocket.close(code=4401, reason="Unauthorized: Could not validate credentials")
    return

  # 2. Fetch User
  result = await db.execute(select(User).where(User.id == token_data.sub))
  user = result.scalars().first()
  if not user or not user.is_active:
    await websocket.close(code=4401, reason="Unauthorized: Inactive or non-existent user")
    return

  # 3. Check Dashboard Permissions
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
      # Broadcast message to all collaborators on the dashboard, excluding sender
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
