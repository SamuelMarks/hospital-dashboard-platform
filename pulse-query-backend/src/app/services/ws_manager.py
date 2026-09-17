"""
WebSocket Connection Manager for Real-Time Collaboration.

Manages active WebSocket connections grouped by dashboard ID to broadcast
widget updates, collaborator presence, and layout adjustments.
"""

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket


class DashboardConnectionManager:
  """
  Manages real-time WebSocket client connections grouped by dashboard ID.
  """

  def __init__(self) -> None:
    """Initialize empty connection and metadata registries."""
    self.active_connections: dict[str, list[WebSocket]] = defaultdict(list)
    self.connection_metadata: dict[WebSocket, dict[str, Any]] = {}

  async def connect(
    self,
    dashboard_id: str,
    websocket: WebSocket,
    user_id: str = "",
    email: str = "",
    role: str = "",
  ) -> None:
    """
    Accepts and registers a new WebSocket connection for a dashboard.

    Args:
        dashboard_id (str): Target dashboard ID.
        websocket (WebSocket): Incoming client WebSocket.
        user_id (str): Identifier of connected user. Defaults to "".
        email (str): Email of connected user. Defaults to "".
        role (str): Clinical or administrative role. Defaults to "".
    """
    await websocket.accept()
    self.active_connections[dashboard_id].append(websocket)
    now_iso = datetime.now(UTC).isoformat()
    meta: dict[str, Any] = {
      "user_id": user_id,
      "email": email,
      "role": role,
      "connected_at": now_iso,
    }
    self.connection_metadata[websocket] = meta

    # Broadcast presence notification to all room peers including the joiner
    await self.broadcast(
      dashboard_id,
      {
        "type": "USER_JOINED",
        "user": meta,
        "active_users": self.get_active_users(dashboard_id),
      },
    )

  def disconnect(self, dashboard_id: str, websocket: WebSocket) -> dict[str, Any] | None:
    """
    Removes a disconnected WebSocket from active dashboard registry.

    Args:
        dashboard_id (str): Dashboard identifier.
        websocket (WebSocket): Disconnected WebSocket.

    Returns:
        dict[str, Any] | None: Disconnected collaborator metadata if tracked, else None.
    """
    user_meta = self.connection_metadata.pop(websocket, None)
    if dashboard_id in self.active_connections:
      if websocket in self.active_connections[dashboard_id]:
        self.active_connections[dashboard_id].remove(websocket)
      if not self.active_connections[dashboard_id]:
        del self.active_connections[dashboard_id]
    return user_meta

  def get_active_users(self, dashboard_id: str) -> list[dict[str, Any]]:
    """
    Retrieves the list of distinct active collaborator metadata dictionaries.

    Args:
        dashboard_id (str): Target dashboard ID.

    Returns:
        list[dict[str, Any]]: List of collaborator profiles currently online.
    """
    sockets = self.active_connections.get(dashboard_id, [])
    return [self.connection_metadata[ws] for ws in sockets if ws in self.connection_metadata]

  async def broadcast(
    self,
    dashboard_id: str,
    message: dict[str, Any],
    sender: WebSocket | None = None,
  ) -> None:
    """
    Broadcasts a JSON message payload to active clients connected to a dashboard.

    Args:
        dashboard_id (str): Dashboard identifier.
        message (dict[str, Any]): JSON-serializable message dictionary.
        sender (WebSocket | None): Optional socket to exclude from broadcast. Defaults to None.
    """
    if dashboard_id not in self.active_connections:
      return

    stale: list[WebSocket] = []
    for connection in list(self.active_connections[dashboard_id]):
      if sender is not None and connection == sender:
        continue
      try:
        await connection.send_json(message)
      except Exception:
        stale.append(connection)

    for dead in stale:
      self.disconnect(dashboard_id, dead)


ws_manager = DashboardConnectionManager()
