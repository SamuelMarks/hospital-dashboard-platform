"""
Unit tests for the Email Notification Service suite.

Validates MockEmailService tracking, SmtpEmailService MIME construction,
SMTP connection flows, error handling, and provider resolution.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.services.email import MockEmailService, SmtpEmailService, get_email_service


@pytest.mark.asyncio
async def test_mock_email_service() -> None:
  """Verifies message tracking and clearing in MockEmailService."""
  service = MockEmailService()
  assert service.last_token is None
  assert len(service.sent_messages) == 0

  await service.send_password_reset_email("doctor@hospital.org", "token-12345")
  assert service.last_token == "token-12345"
  assert len(service.sent_messages) == 1
  assert service.sent_messages[0]["recipient"] == "doctor@hospital.org"
  assert service.sent_messages[0]["reset_token"] == "token-12345"

  service.clear()
  assert service.last_token is None
  assert len(service.sent_messages) == 0


@pytest.mark.asyncio
async def test_mock_email_service_queue_capacity_and_production_warning(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """Verifies bounded queue eviction and production environment warning."""
  monkeypatch.setenv("ENVIRONMENT", "production")
  with patch("app.services.email.mock_service.logger.warning") as mock_warn:
    bounded_service = MockEmailService(max_messages=2)
    mock_warn.assert_called_once()

  await bounded_service.send_password_reset_email("user1@test.com", "t1")
  await bounded_service.send_password_reset_email("user2@test.com", "t2")
  assert len(bounded_service.sent_messages) == 2
  assert bounded_service.sent_messages[0]["recipient"] == "user1@test.com"

  # Third message evicts user1
  await bounded_service.send_password_reset_email("user3@test.com", "t3")
  assert len(bounded_service.sent_messages) == 2
  assert bounded_service.sent_messages[0]["recipient"] == "user2@test.com"
  assert bounded_service.sent_messages[1]["recipient"] == "user3@test.com"


@pytest.mark.asyncio
async def test_smtp_email_service_dispatch_success() -> None:
  """Verifies successful SMTP dispatch with STARTTLS and authentication."""
  service = SmtpEmailService(
    host="smtp.hospital.org",
    port=587,
    user="smtp_user",
    password="smtp_password",
    use_tls=True,
    from_email="noreply@hospital.org",
    frontend_url="https://dashboard.hospital.org",
  )

  mock_server = MagicMock()
  with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
    mock_server.__enter__.return_value = mock_server

    await service.send_password_reset_email("nurse@hospital.org", "reset-token-abc")

    mock_smtp_cls.assert_called_once_with("smtp.hospital.org", 587)
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("smtp_user", "smtp_password")
    mock_server.send_message.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_email_service_no_tls_no_auth() -> None:
  """Verifies SMTP dispatch without TLS and without credentials."""
  service = SmtpEmailService(
    host="localhost",
    port=25,
    user=None,
    password=None,
    use_tls=False,
    from_email="noreply@hospital.org",
  )

  mock_server = MagicMock()
  with patch("smtplib.SMTP", return_value=mock_server):
    mock_server.__enter__.return_value = mock_server

    await service.send_password_reset_email("tech@hospital.org", "reset-token-xyz")

    mock_server.starttls.assert_not_called()
    mock_server.login.assert_not_called()
    mock_server.send_message.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_email_service_failure_raises() -> None:
  """Verifies that socket or SMTP errors bubble up as exceptions."""
  service = SmtpEmailService(host="invalid.smtp.host")

  with patch("smtplib.SMTP", side_effect=ConnectionRefusedError("Connection refused")):
    with pytest.raises(ConnectionRefusedError):
      await service.send_password_reset_email("user@hospital.org", "token")


def test_get_email_service_provider_resolution() -> None:
  """Verifies dynamic factory selects SMTP service when configured, else mock."""
  with patch.object(settings, "SMTP_HOST", "smtp.test.com"):
    svc = get_email_service()
    assert isinstance(svc, SmtpEmailService)

  with patch.object(settings, "SMTP_HOST", None):
    svc_mock = get_email_service()
    assert isinstance(svc_mock, MockEmailService)


@pytest.mark.asyncio
async def test_forgot_password_handles_email_service_exception(client, db_session) -> None:
  """Verifies forgot-password route handles email transmission failure gracefully without crashing."""
  import uuid
  from app.models.user import User
  from app.services.email import get_email_service

  user = User(
    id=uuid.uuid4(),
    email=f"err_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()

  failing_email_svc = MagicMock()
  failing_email_svc.send_password_reset_email.side_effect = Exception("SMTP connection failure")

  from app.main import app

  app.dependency_overrides[get_email_service] = lambda: failing_email_svc
  try:
    res = await client.post("/api/v1/auth/forgot-password", json={"email": user.email})
    assert res.status_code == 200
    assert "dispatched" in res.json()["message"]
  finally:
    app.dependency_overrides.pop(get_email_service, None)
