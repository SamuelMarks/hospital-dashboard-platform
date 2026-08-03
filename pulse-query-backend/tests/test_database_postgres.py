"""
Tests for PostgreSQL dependency helpers.
"""

from unittest.mock import AsyncMock

import pytest

from app.database import postgres


class _DummyContext:
  def __init__(self, session):
    self._session = session

  async def __aenter__(self):
    return self._session

  async def __aexit__(self, exc_type, exc, tb):
    return False


@pytest.mark.asyncio
async def test_get_db_yields_and_closes(monkeypatch) -> None:
  """Ensure get_db yields a session and closes it on teardown."""
  session = AsyncMock()
  monkeypatch.setattr(postgres, "AsyncSessionLocal", lambda: _DummyContext(session))

  generator = postgres.get_db()
  yielded = await anext(generator)

  assert yielded is session
  await generator.aclose()

  session.close.assert_awaited_once()
