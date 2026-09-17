"""
SMTP email notification service.

Production implementation of email delivery using standard SMTP with TLS/STARTTLS.
Offloads blocking network socket operations to asyncio executor threads.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


class SmtpEmailService:
  """
  Production SMTP email notification service.

  Dispatches emails using standard SMTP over TLS or plain SMTP depending on configuration.
  """

  def __init__(
    self,
    host: str | None = None,
    port: int | None = None,
    user: str | None = None,
    password: str | None = None,
    use_tls: bool | None = None,
    from_email: str | None = None,
    frontend_url: str | None = None,
  ) -> None:
    """
    Initializes the SMTP email service.

    Args:
        host (str | None): SMTP server host address.
        port (int | None): SMTP server port.
        user (str | None): Authentication username.
        password (str | None): Authentication password.
        use_tls (bool | None): Whether to negotiate STARTTLS encryption.
        from_email (str | None): Default sender email address.
        frontend_url (str | None): Base URL of the web client for reset links.
    """
    self.host = host or settings.SMTP_HOST or "localhost"
    self.port = port if port is not None else settings.SMTP_PORT
    self.user = user or settings.SMTP_USER
    self.password = password or settings.SMTP_PASSWORD
    self.use_tls = use_tls if use_tls is not None else settings.SMTP_TLS
    self.from_email = from_email or settings.EMAILS_FROM_EMAIL
    self.frontend_url = frontend_url or settings.FRONTEND_URL

  def _send_sync(self, msg: MIMEMultipart, recipient: str) -> None:
    """
    Synchronously transmits an email message via SMTP.

    Args:
        msg (MIMEMultipart): Pre-constructed MIME email message.
        recipient (str): Target recipient email address.

    Raises:
        smtplib.SMTPException: If socket connection or authentication fails.
    """
    with smtplib.SMTP(self.host, self.port) as server:
      if self.use_tls:
        server.starttls()
      if self.user and self.password:
        server.login(self.user, self.password)
      server.send_message(msg, from_addr=self.from_email, to_addrs=[recipient])

  async def send_password_reset_email(self, recipient: str, reset_token: str) -> None:
    """
    Asynchronously dispatches a password reset email via SMTP.

    Args:
        recipient (str): Target email address.
        reset_token (str): Single-use password reset token.
    """
    reset_url = f"{self.frontend_url}/reset-password?token={reset_token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Password Reset Request - Pulse Query Platform"
    msg["From"] = self.from_email
    msg["To"] = recipient

    text_content = (
      "Hello,\n\n"
      "A password reset was requested for your account.\n"
      f"Please use the following link to reset your password:\n"
      f"{reset_url}\n\n"
      "If you did not request this, please ignore this email.\n"
    )
    html_content = (
      f"<p>Hello,</p>"
      f"<p>A password reset was requested for your account.</p>"
      f"<p><a href='{reset_url}'>Click here to reset your password</a></p>"
      f"<p>If you did not request this, please ignore this email.</p>"
    )

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
      await asyncio.to_thread(self._send_sync, msg, recipient)
      logger.info(f"Password reset email sent to {recipient}")
    except Exception as e:
      logger.error(f"Failed to send password reset email to {recipient}: {e}")
      raise
