"""
Tests for the Multi-LLM Arena Client.
Verifies broadcasting logic, latency recording, and error containment using any-llm.
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock, AsyncMock
from app.services.llm_client import LLMArenaClient

# Import the class Settings to patch the property on the class level
from app.core.config import Settings


@pytest.fixture
def mock_swarm_settings():
  """Override swarm settings to have 2 controlled mock providers."""
  mock_conf = [
    {"provider": "openai", "model": "m1", "name": "Model A", "api_key": "k1"},
    {"provider": "mistral", "model": "m2", "name": "Model B", "api_key": "k2"},
  ]
  # Patch the property on the CLASS, not the instance
  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = mock_conf
    yield


@pytest.mark.asyncio
async def test_arena_broadcast_success(mock_swarm_settings):
  """
  Test that generate_arena_competition calls all providers and aggregates results.
  """
  # Use patch context manager to validate AnyLLM creation specifically within this scope
  # We maintain the strict logic of the previous turn but fix the patching mechanism
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    # Create mock clients
    client_a = MagicMock()
    client_b = MagicMock()
    mock_create.side_effect = [client_a, client_b]

    arena = LLMArenaClient()

    # Verify Init
    assert len(arena.swarm) == 2
    assert arena.swarm[0]["name"] == "Model A"

    # Mock responses
    # We need to simulate the response structure from any-llm
    def make_response(text):
      m = MagicMock()
      m.choices = [MagicMock(message=MagicMock(content=text))]
      return m

    # Patch run_in_threadpool which wraps the synchronous AnyLLM calls
    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      # First call (Model A) -> "SQL A"
      # Second call (Model B) -> "SQL B"
      mock_thread.side_effect = [make_response("SQL A"), make_response("SQL B")]

      results = await arena.generate_arena_competition([{"role": "user", "content": "hi"}])

      assert len(results) == 2

      # Verify Result A
      res_a = next(r for r in results if r.provider_name == "Model A")
      assert res_a.content == "SQL A"
      assert res_a.latency_ms >= 0
      assert res_a.error is None

      # Verify Result B
      res_b = next(r for r in results if r.provider_name == "Model B")
      assert res_b.content == "SQL B"


@pytest.mark.asyncio
async def test_arena_partial_failure(mock_swarm_settings):
  """
  Test that if one model fails, the others still return results,
  and the failure is recorded in the error field.
  """
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    client_a = MagicMock()
    client_b = MagicMock()
    mock_create.side_effect = [client_a, client_b]

    arena = LLMArenaClient()

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      # Model A succeeds
      mock_res_a = MagicMock()
      mock_res_a.choices = [MagicMock(message=MagicMock(content="SQL A"))]

      # Model B raises Exception
      mock_thread.side_effect = [mock_res_a, Exception("API Down")]

      results = await arena.generate_arena_competition([])

      assert len(results) == 2

      res_a = next(r for r in results if r.provider_name == "Model A")
      assert res_a.content == "SQL A"
      assert res_a.error is None

      res_b = next(r for r in results if r.provider_name == "Model B")
      assert res_b.content == ""
      assert "API Down" in res_b.error


@pytest.mark.asyncio
async def test_arena_initialization_failure():
  """
  Test that if a specific provider configuration is bad, it skips only that one.
  """
  bad_conf = [
    {"provider": "bad_provider", "model": "x", "name": "Bad", "api_key": "k"},
    {"provider": "openai", "model": "y", "name": "Good", "api_key": "k"},
  ]

  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = bad_conf

    # AnyLLM.create should raise for 'bad_provider'
    with patch("app.services.llm_client.AnyLLM.create") as mock_create:
      mock_create.side_effect = [Exception("Unknown Provider"), MagicMock()]

      arena = LLMArenaClient()

      # Should have registered the Good one, logged error for Bad one
      assert len(arena.swarm) == 1
      assert arena.swarm[0]["name"] == "Good"


@pytest.mark.asyncio
async def test_arena_raises_when_no_providers_configured():
  """If no providers are configured, the arena should raise."""
  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = []

    arena = LLMArenaClient()

    with pytest.raises(RuntimeError):
      await arena.generate_arena_competition([{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_arena_handles_malformed_response(mock_swarm_settings):
  """Malformed provider responses should be normalized to errors."""
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    mock_create.side_effect = [MagicMock(), MagicMock()]

    arena = LLMArenaClient()

    class BadResponse:
      pass

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      mock_thread.return_value = BadResponse()

      result = await arena._generate_single(
        arena.swarm[0], [{"role": "user", "content": "hi"}], temperature=0.0, max_tokens=10, stop=None
      )

      assert result.error == "Malformed response structure"


@pytest.mark.asyncio
async def test_arena_wraps_unhandled_coroutine_errors(mock_swarm_settings):
  """Exceptions from _generate_single should be wrapped into ArenaResponse errors."""
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    mock_create.side_effect = [MagicMock(), MagicMock()]

    arena = LLMArenaClient()

    with patch.object(arena, "_generate_single", new_callable=AsyncMock) as mock_single:
      mock_single.side_effect = RuntimeError("boom")

      results = await arena.generate_arena_competition([{"role": "user", "content": "hi"}])

      assert len(results) == 2
      assert all("Critical Client Error" in res.error for res in results)
