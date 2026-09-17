"""
Email notification service interface.

Defines the contract for dispatching asynchronous transactional emails,
such as password reset notifications and critical system alerts.
"""

from typing import Protocol


class EmailNotificationService(Protocol):
  """
  Protocol defining asynchronous transactional email dispatch operations.
  """

  async def send_password_reset_email(self, recipient: str, reset_token: str) -> None:
    """
    Dispatches a password reset email to the specified recipient.

    Args:
        recipient (str): Target email address.
        reset_token (str): Single-use, time-bound password reset token.

    Raises:
        Exception: If email transmission fails.
    """
    ...
