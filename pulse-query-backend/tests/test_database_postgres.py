"""
Tests for PostgreSQL dependency helpers.
"""

from typing import Any

from unittest.mock import AsyncMock

import pytest

from app.database import postgres


class _DummyContext:
  def __init__(self, session: Any) -> None:
    """
    Verify init behavior.

    Args:
        session: Test parameter or fixture.
    """
    self._session = session

  async def __aenter__(self) -> Any:
    """Verify aenter behavior."""
    return self._session

  async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> Any:
    """
    Verify aexit behavior.

    Args:
        exc_type: Test parameter or fixture.
        exc: Test parameter or fixture.
        tb: Test parameter or fixture.
    """
    return False


@pytest.mark.asyncio
async def test_get_db_yields_and_closes(monkeypatch: Any) -> None:
  """Ensure get_db yields a session and closes it on teardown."""
  session = AsyncMock()
  monkeypatch.setattr(postgres, "AsyncSessionLocal", lambda: _DummyContext(session))

  generator = postgres.get_db()
  yielded = await anext(generator)

  assert yielded is session
  await generator.aclose()

  session.close.assert_awaited_once()
