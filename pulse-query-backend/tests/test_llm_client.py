"""
Tests for the Multi-LLM Arena Client.
Verifies broadcasting logic, latency recording, and error containment using any-llm.
"""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from app.core.config import Settings
from app.schemas.admin import AdminSettingsResponse
from app.services.llm_client import LLMArenaClient


@pytest.fixture
def mock_swarm_settings() -> Generator[None, None, None]:
  """
  Overrides `Settings.LLM_SWARM` with 2 controlled mock providers.

  Yields:
      None: Control to the test with `LLM_SWARM` patched.
  """
  mock_conf = [
    {"provider": "openai", "model": "m1", "name": "Model A", "api_key": "k1"},
    {"provider": "mistral", "model": "m2", "name": "Model B", "api_key": "k2"},
  ]
  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = mock_conf
    yield


def test_get_available_models(mock_swarm_settings: None) -> None:
  """Verify get_available_models returns mapped DTO compatible list."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()
    models = arena.get_available_models()
    assert isinstance(models, list)
    assert len(models) == 2
    assert models[0].name == "Model A"


def test_reload_swarm(mock_swarm_settings: None) -> None:
  """Verify reload_swarm reinitializes swarm with custom api keys."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()
    fake_admin = MagicMock()
    fake_admin.api_keys = {"openai": "test-key"}
    arena.reload_swarm(fake_admin)
    assert len(arena.swarm) > 0


@pytest.mark.asyncio
async def test_arena_competition_target_filtering(mock_swarm_settings: None) -> None:
  """Verify target model IDs param correctly cuts down the swarm size."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()

    results = await arena.generate_arena_competition(
      [{"role": "user", "content": "hi"}], target_model_ids=["non-existent-id"]
    )
    assert len(results) == 0


@pytest.mark.asyncio
async def test_arena_competition_no_swarm() -> None:
  """Verify exception is raised if the swarm is completely empty."""
  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = []
    arena = LLMArenaClient()
    arena.swarm = []
    with pytest.raises(RuntimeError) as excInfo:
      await arena.generate_arena_competition([])
    assert "No LLM providers" in str(excInfo.value)


@pytest.mark.asyncio
async def test_arena_broadcast_success(mock_swarm_settings: None) -> None:
  """Test that `generate_arena_competition` calls all providers and aggregates results."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    client_a = MagicMock()
    client_b = MagicMock()
    mock_create.side_effect = [client_a, client_b]

    arena = LLMArenaClient()

    def make_response(text: str) -> MagicMock:
      """
      Creates a mock provider completion response containing `text`.

      Args:
          text (str): Completion content text.

      Returns:
          MagicMock: Mock completion response object.
      """
      m = MagicMock()
      m.choices = [MagicMock(message=MagicMock(content=text))]
      return m

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      mock_thread.side_effect = [make_response("SQL A"), make_response("SQL B")]

      results = await arena.generate_arena_competition([{"role": "user", "content": "hi"}])

      assert len(results) == 2

      res_a = next(r for r in results if r.provider_name == "Model A")
      assert res_a.content == "SQL A"
      assert res_a.latency_ms >= 0
      assert res_a.error is None

      res_b = next(r for r in results if r.provider_name == "Model B")
      assert res_b.content == "SQL B"


@pytest.mark.asyncio
async def test_arena_partial_failure(mock_swarm_settings: None) -> None:
  """
  Test that if one model fails, the others still return results,
  and the failure is recorded in the error field.
  """
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    client_a = MagicMock()
    client_b = MagicMock()
    mock_create.side_effect = [client_a, client_b]

    arena = LLMArenaClient()

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      mock_res_a = MagicMock()
      mock_res_a.choices = [MagicMock(message=MagicMock(content="SQL A"))]

      mock_thread.side_effect = [mock_res_a, Exception("API Down")]
      results = await arena.generate_arena_competition([])

      assert len(results) == 2
      res_b = next(r for r in results if r.provider_name == "Model B")
      assert res_b.error is not None
      assert "API Down" in res_b.error


@pytest.mark.asyncio
async def test_arena_broadcast_admin_settings(mock_swarm_settings: None) -> None:
  """Test that `generate_arena_competition` passes api keys from admin settings."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    client_a = MagicMock()
    mock_create.side_effect = [client_a, MagicMock()]
    arena = LLMArenaClient()
    settings = AdminSettingsResponse(
      api_keys={"openai": "override-key"}, visible_models=[arena.swarm[0]["id"], arena.swarm[1]["id"]]
    )

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      mock_thread.return_value = MagicMock()
      await arena.generate_arena_competition([{"role": "user", "content": "hi"}], admin_settings=settings)
      call_args = mock_thread.call_args_list[0]
      assert call_args.kwargs.get("api_key") == "override-key"


def test_get_available_models_filtered(mock_swarm_settings: None) -> None:
  """Verify `get_available_models` filters based on `admin_settings`."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()
    settings = AdminSettingsResponse(api_keys={}, visible_models=[arena.swarm[0]["id"]])
    models = arena.get_available_models(settings)
    assert len(models) == 1
    assert models[0].id == arena.swarm[0]["id"]


@pytest.mark.asyncio
async def test_arena_initialization_failure() -> None:
  """Test that if a specific provider configuration is bad, it skips only that one."""
  bad_conf = [
    {"provider": "bad_provider", "model": "x", "name": "Bad", "api_key": "k"},
    {"provider": "openai", "model": "y", "name": "Good", "api_key": "k"},
  ]

  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = bad_conf

    with patch("app.services.llm_client.AnyLLM.create") as mock_create:
      mock_create.side_effect = [Exception("Unknown Provider"), MagicMock()]

      arena = LLMArenaClient()

      assert len(arena.swarm) == 1
      assert arena.swarm[0]["name"] == "Good"


@pytest.mark.asyncio
async def test_arena_defaults_to_mock_when_no_providers() -> None:
  """If configured swarms fail to load, arena should use Mock fallback."""
  with patch.object(Settings, "LLM_SWARM", new_callable=PropertyMock) as mock_prop:
    mock_prop.return_value = []

    arena = LLMArenaClient()
    assert len(arena.swarm) == 1
    assert arena.swarm[0]["name"] == "System Mock"

    results = await arena.generate_arena_competition([{"role": "user", "content": "hi"}])
    assert len(results) == 1
    assert "System Mock" in results[0].content
    assert "-- Generated by FallbackMockProvider (No API key configured)" in results[0].content
    assert results[0].is_fallback is True

    chunks = [chunk async for chunk in arena.stream_tokens([{"role": "user", "content": "hi"}])]
    full_text = "".join(chunks)
    assert "synthetic_hospital_data" in full_text


@pytest.mark.asyncio
async def test_arena_handles_malformed_response(mock_swarm_settings: None) -> None:
  """Malformed provider responses should be normalized to errors."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    mock_create.side_effect = [MagicMock(), MagicMock()]

    arena = LLMArenaClient()

    class BadResponse:
      """Stub completion response lacking a `choices` attribute."""

    class NullContentChoice:
      """Stub choice whose `message.content` is None."""

      def __init__(self) -> None:
        """Initializes message with None content."""
        self.message = MagicMock(content=None)

    class NullContentResponse:
      """Stub completion response with a choice whose message content is None."""

      def __init__(self) -> None:
        """Initializes choices list with `NullContentChoice`."""
        self.choices = [NullContentChoice()]

    with patch("app.services.llm_client.run_in_threadpool") as mock_thread:
      mock_thread.return_value = BadResponse()

      result = await arena._generate_single(
        arena.swarm[0], [{"role": "user", "content": "hi"}], temperature=0.0, max_tokens=10, stop=None
      )

      assert result.error == "Malformed response structure"

      mock_thread.return_value = NullContentResponse()
      result_null = await arena._generate_single(
        arena.swarm[0], [{"role": "user", "content": "hi"}], temperature=0.0, max_tokens=10, stop=None
      )
      assert result_null.error == "Malformed response structure"


@pytest.mark.asyncio
async def test_arena_wraps_unhandled_coroutine_errors(mock_swarm_settings: None) -> None:
  """Exceptions from `_generate_single` should be wrapped into `ArenaResponse` errors."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    mock_create.side_effect = [MagicMock(), MagicMock()]

    arena = LLMArenaClient()

    with patch.object(arena, "_generate_single", new_callable=AsyncMock) as mock_single:
      mock_single.side_effect = RuntimeError("boom")

      results = await arena.generate_arena_competition([{"role": "user", "content": "hi"}])

      assert len(results) == 2
      assert all(res.error is not None and "Critical Client Error" in res.error for res in results)


def test_llm_client_helpers_and_configured_models(mock_swarm_settings: None) -> None:
  """Verifies helper functions and `configured_models` initialization/deduplication in `LLMArenaClient`."""
  _ = mock_swarm_settings
  from app.services.llm_client import (
    _infer_processor_type,
    _normalize_ollama_root_url,
    _parse_configured_model_entry,
  )

  assert _normalize_ollama_root_url("http://localhost:11434/v1/") == "http://localhost:11434"
  assert _normalize_ollama_root_url("http://localhost:11434") == "http://localhost:11434"
  assert _parse_configured_model_entry("   ") is None
  assert _parse_configured_model_entry("no-separator") is None
  assert _parse_configured_model_entry("openai:") is None
  assert _parse_configured_model_entry("ollama:llama3|Llama 3 Local") == ("ollama", "llama3", "Llama 3 Local")
  assert _parse_configured_model_entry("groq/mixtral") == ("groq", "mixtral", "mixtral (groq)")
  assert _infer_processor_type("sql", "SQL", True) == "SQL"
  assert _infer_processor_type("ollama", "ollama:llama3", True) == "OLLAMA"
  assert _infer_processor_type("openai", "openai/gpt-4o", False) == "ANY_LLM"

  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()
    admin_cfg = AdminSettingsResponse(
      api_keys={"groq": "g-key"},
      visible_models=[],
      configured_models=[
        "groq:mixtral-8x7b|Mixtral 8x7B",
        "ollama:llama3.2",
        "openai/m1",  # duplicate of existing swarm entry
        "invalid_entry",
      ],
      ollama_api_base="http://localhost:11434/v1",
    )
    arena.reload_swarm(admin_cfg)
    models = arena.get_available_models(
      admin_settings=AdminSettingsResponse(
        api_keys={},
        visible_models=[],
        configured_models=["cohere:command-r", "groq:mixtral-8x7b", "bad"],
      ),
      include_sql=True,
    )
    ids = [m.id for m in models]
    assert ids[0] == "SQL"
    assert "cohere:command-r" in ids


@pytest.mark.asyncio
async def test_discover_ollama_models_and_processors_async(mock_swarm_settings: None) -> None:
  """Verifies `discover_ollama_models_result` and `get_available_processors_async` across all branches."""
  _ = mock_swarm_settings
  from app.core.result import Err, Ok

  with patch("app.services.llm_client.AnyLLM.create", return_value=MagicMock()):
    arena = LLMArenaClient()

    # 1. Successful discovery with mock http_client
    mock_http = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
      "models": [{"name": "llama3:latest"}, {"name": "llama3:latest"}, {"name": ""}, "not-a-dict"]
    }
    mock_http.get.return_value = mock_resp

    res_ok = await arena.discover_ollama_models_result(
      ollama_api_base="http://localhost:11434/v1",
      http_client=mock_http,
    )
    assert isinstance(res_ok, Ok)
    assert len(res_ok.value) == 2
    assert res_ok.value[0].id == "ollama:llama3:latest"
    assert res_ok.value[0].processor_type == "OLLAMA"

    # Deduplication in get_available_processors_async
    processors = await arena.get_available_processors_async(
      admin_settings=AdminSettingsResponse(
        api_keys={},
        visible_models=[],
        configured_models=["ollama:llama3:latest"],
      ),
      include_sql=True,
      discover_ollama=True,
      http_client=mock_http,
    )
    proc_ids = [p.id for p in processors]
    assert proc_ids[0] == "SQL"
    assert proc_ids.count("ollama:llama3:latest") == 1

    # 2. Non-200 HTTP status
    mock_resp_500 = MagicMock()
    mock_resp_500.status_code = 500
    mock_http.get.return_value = mock_resp_500
    res_err_status = await arena.discover_ollama_models_result(http_client=mock_http)
    assert isinstance(res_err_status, Err)

    # 3. Network exception with owned httpx.AsyncClient
    with patch("app.services.llm_client.httpx.AsyncClient") as mock_client_cls:
      owned_instance = AsyncMock()
      owned_instance.get.side_effect = RuntimeError("connection refused")
      mock_client_cls.return_value = owned_instance
      res_err_exc = await arena.discover_ollama_models_result()
      assert isinstance(res_err_exc, Err)
      owned_instance.aclose.assert_awaited_once()

    # 4. get_available_processors_async when discovery fails or discover_ollama=False
    processors_fallback = await arena.get_available_processors_async(
      include_sql=False,
      discover_ollama=True,
      http_client=mock_http,
    )
    assert len(processors_fallback) >= 1

    processors_no_disc = await arena.get_available_processors_async(
      include_sql=True,
      discover_ollama=False,
    )
    assert processors_no_disc[0].id == "SQL"


@pytest.mark.asyncio
async def test_dynamic_combatant_creation_in_arena(mock_swarm_settings: None) -> None:
  """Verifies `_build_dynamic_combatant` and on-demand model execution in `generate_arena_competition`."""
  _ = mock_swarm_settings
  with patch("app.services.llm_client.AnyLLM.create") as mock_create:
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content="SELECT 42"))]
    mock_create.return_value = mock_client

    arena = LLMArenaClient()
    assert arena._build_dynamic_combatant("invalid") is None

    with patch("app.services.llm_client.run_in_threadpool", return_value=mock_resp):
      res_matched = await arena.generate_arena_competition(
        [{"role": "user", "content": "count"}],
        target_model_ids=[arena.swarm[0]["id"]],
      )
      assert len(res_matched) == 1

      res = await arena.generate_arena_competition(
        [{"role": "user", "content": "count"}],
        target_model_ids=["ollama:qwen2.5-coder"],
      )
      assert len(res) == 1
      assert res[0].content == "SELECT 42"

    # When AnyLLM.create raises inside _build_dynamic_combatant, it falls back to FallbackMockProvider
    mock_create.side_effect = RuntimeError("init error")
    dyn = arena._build_dynamic_combatant("custom:model")
    assert dyn is not None
    assert dyn["id"] == "custom:model"


def test_stream_chunk_protocol_and_extract_chunk_delta() -> None:
  """Verifies `StreamChunkProtocol` runtime conformance and `_extract_chunk_delta` branches."""
  from app.services.llm_client import StreamChunkProtocol, _extract_chunk_delta

  class _Delta:
    """Stub streaming delta with `content`."""

    def __init__(self, content: str | None) -> None:
      """Initializes delta content."""
      self.content = content

  class _StreamChoice:
    """Stub choice with `delta`."""

    def __init__(self, delta: _Delta | None) -> None:
      """Initializes choice delta."""
      self.delta = delta

  class _TextChoice:
    """Stub legacy choice with `text`."""

    def __init__(self, text: str | None) -> None:
      """Initializes choice text."""
      self.text = text

  class _Chunk:
    """Stub completion chunk implementing `StreamChunkProtocol`."""

    def __init__(self, choices: list[_StreamChoice | _TextChoice]) -> None:
      """Initializes chunk choices."""
      self.choices = choices

  chunk_stream = _Chunk([_StreamChoice(_Delta("SELECT "))])
  assert isinstance(chunk_stream, StreamChunkProtocol)
  assert _extract_chunk_delta(chunk_stream) == "SELECT "

  chunk_text = _Chunk([_TextChoice("FROM ")])
  assert isinstance(chunk_text, StreamChunkProtocol)
  assert _extract_chunk_delta(chunk_text) == "FROM "

  chunk_empty = _Chunk([])
  assert _extract_chunk_delta(chunk_empty) is None
