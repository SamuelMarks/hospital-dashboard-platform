"""
Tests for the FastAPI root endpoint handler.
"""

from app.main import root


def test_root_returns_health_message() -> None:
  """Root handler should return a simple health payload."""
  assert root() == {"message": "Hospital Analytics Platform API is running"}
