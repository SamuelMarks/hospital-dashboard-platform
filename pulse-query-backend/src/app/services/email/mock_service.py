"""
Mock email notification service.

In-memory implementation suitable for development, CI testing, and offline modes.
Logs messages and tracks dispatched payloads for verification in tests.
"""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

MAX_SENT_MESSAGES = 100


class MockEmailService:
  """
  In-memory mock email notification service for testing and development environments.

  Attributes:
      sent_messages (list[dict[str, Any]]): History of sent email messages.
      last_token (str | None): Most recently dispatched reset token.
      max_messages (int): Maximum capacity for in-memory message history.
  """

  def __init__(self, max_messages: int = MAX_SENT_MESSAGES) -> None:
    """
    Initializes the mock service with empty sent message storage and checks environment hygiene.

    Args:
        max_messages (int): Maximum number of dispatched email records to retain.
    """
    self.sent_messages: list[dict[str, Any]] = []
    self.last_token: str | None = None
    self.max_messages = max_messages

    if os.getenv("ENVIRONMENT", "").lower() == "production":
      logger.warning(
        "⚠️ [MOCK EMAIL] MockEmailService is active in a PRODUCTION environment! "
        "Outbound password reset emails will NOT be dispatched to external recipients."
      )

  async def send_password_reset_email(self, recipient: str, reset_token: str) -> None:
    """
    Simulates sending a password reset email by recording the operation in memory.

    Args:
        recipient (str): Target email address.
        reset_token (str): Single-use password reset token.
    """
    logger.info(f"📧 [MOCK EMAIL] Password reset requested for {recipient} with token: {reset_token}")
    self.last_token = reset_token

    if len(self.sent_messages) >= self.max_messages:
      self.sent_messages.pop(0)

    self.sent_messages.append(
      {
        "recipient": recipient,
        "reset_token": reset_token,
        "type": "password_reset",
      }
    )

  def clear(self) -> None:
    """Clears all sent message records and resets state."""
    self.sent_messages.clear()
    self.last_token = None
