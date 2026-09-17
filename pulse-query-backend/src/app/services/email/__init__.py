"""
Email Notification Service Package.

Exposes interfaces, concrete SMTP implementations, mock test doubles,
and the singleton/dependency provider for transactional email delivery.
"""

from app.core.config import settings
from app.services.email.interfaces import EmailNotificationService
from app.services.email.mock_service import MockEmailService
from app.services.email.smtp_service import SmtpEmailService

# Global default mock service for test environments
_mock_email_service = MockEmailService()


def get_email_service() -> EmailNotificationService:
  """
  Provides the active email notification service instance based on environment settings.

  Returns:
      EmailNotificationService: SmtpEmailService if SMTP_HOST configured, else MockEmailService.
  """
  if settings.SMTP_HOST:
    return SmtpEmailService()
  return _mock_email_service


__all__ = [
  "EmailNotificationService",
  "MockEmailService",
  "SmtpEmailService",
  "_mock_email_service",
  "get_email_service",
]
