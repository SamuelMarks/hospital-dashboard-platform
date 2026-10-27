"""
WebSocket Collaboration Router for Real-Time Dashboard updates.

Supports bi-directional WebSocket messaging between dashboard collaborators,
broadcasting layout updates, active presence, and live widget refresh events.
"""

import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.postgres import get_db
from app.schemas.json_types import JsonObject, JsonValue
from app.services.dashboard_service import dashboard_service
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


class WsLayoutUpdatedMessage(BaseModel):
  """
  WebSocket client message broadcasting a dashboard grid layout change.
  """

  model_config = ConfigDict(extra="allow")

  type: Literal["LAYOUT_UPDATED"]
  items: list[JsonObject] = []


class WsWidgetUpdatedMessage(BaseModel):
  """
  WebSocket client message broadcasting a widget create, update, reload, or delete event.
  """

  model_config = ConfigDict(extra="allow")

  type: Literal["WIDGET_UPDATED", "WIDGET_RELOAD", "WIDGET_CREATED", "WIDGET_DELETED"]
  widget_id: str | None = None


class WsCursorMovedMessage(BaseModel):
  """
  WebSocket client message broadcasting a collaborator cursor position update.
  """

  model_config = ConfigDict(extra="allow")

  type: Literal["CURSOR_MOVED"]
  x: float = 0.0
  y: float = 0.0


class WsPingMessage(BaseModel):
  """
  WebSocket client heartbeat or generic typed collaboration event message.
  """

  model_config = ConfigDict(extra="allow")

  type: str
  event: str | None = None


type WsClientMessage = WsLayoutUpdatedMessage | WsWidgetUpdatedMessage | WsCursorMovedMessage | WsPingMessage
"""Discriminated union of validated incoming WebSocket client messages."""

_WS_MESSAGE_ADAPTER: TypeAdapter[WsClientMessage] = TypeAdapter(WsClientMessage)


def validate_ws_client_message_result(raw_data: JsonValue) -> AppResult[JsonObject]:
  """
  Validates an incoming WebSocket JSON payload against `WsClientMessage` or `event`-keyed collaboration messages.

  Args:
      raw_data (JsonValue): Parsed JSON value from `websocket.receive_json()`.

  Returns:
      AppResult[JsonObject]: `Ok(validated_dict)` or `Err(AppError)` if malformed.
  """
  if not isinstance(raw_data, dict):
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="WebSocket message must be a JSON object.",
        status_code=400,
      )
    )
  if "type" not in raw_data and "event" in raw_data and isinstance(raw_data["event"], str):
    normalized = dict(raw_data)
    normalized["type"] = str(raw_data["event"])
  else:
    normalized = dict(raw_data)

  try:
    validated = _WS_MESSAGE_ADAPTER.validate_python(normalized)
    dumped: JsonObject = validated.model_dump(exclude_none=True)
    return Ok(dumped)
  except ValidationError as exc:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Invalid WebSocket message schema: {exc}",
        status_code=400,
      )
    )


async def _disconnect_and_broadcast_user_left(dash_key: str, websocket: WebSocket) -> None:
  """
  Disconnects `websocket` from `dash_key` and broadcasts `USER_LEFT` if tracked.

  Args:
      dash_key (str): Stringified dashboard UUID key.
      websocket (WebSocket): Disconnecting client WebSocket instance.
  """
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
    raw_reason = auth_res.error.details.get("ws_reason", "Unauthorized: Could not validate credentials")
    ws_reason = str(raw_reason) if raw_reason is not None else "Unauthorized: Could not validate credentials"
    await websocket.close(code=4401, reason=ws_reason)
    return

  user = auth_res.value

  try:
    access_res = await dashboard_service.access_policy.get_dashboard_with_access_result(
      dashboard_id=dashboard_id,
      current_user=user,
      db=db,
      required_level="VIEW",
    )
  except (SQLAlchemyError, ValueError, RuntimeError) as exc:
    logger.warning(f"WebSocket access check failed ({type(exc).__name__}): {exc}")
    await websocket.close(code=4403, reason="Forbidden: Access denied to dashboard")
    return

  if isinstance(access_res, Err):
    await websocket.close(code=4403, reason=f"Forbidden: {access_res.error.message}")
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
      validated_msg = validate_ws_client_message_result(data)
      if isinstance(validated_msg, Ok):
        await ws_manager.broadcast(dash_key, validated_msg.value, sender=websocket)
      else:
        logger.warning(f"Dropped invalid WebSocket payload on {dash_key}: {validated_msg.error.message}")
  except (WebSocketDisconnect, SQLAlchemyError, ValueError, RuntimeError):
    await _disconnect_and_broadcast_user_left(dash_key, websocket)
