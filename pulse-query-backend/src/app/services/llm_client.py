"""
Multi-provider LLM client for arena-style SQL generation.

Wraps any-llm providers, executes concurrent requests, and normalizes responses.
"""

import asyncio
from collections.abc import AsyncGenerator, AsyncIterable, Iterable, Sequence
import contextlib
import logging
import time
from typing import NamedTuple, Protocol, TypedDict, runtime_checkable

from any_llm import AnyLLM
import httpx
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.result import AppResult, Ok
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import ModelInfo
from app.schemas.json_types import JsonPrimitive
from app.services.llm.discovery import (
  SQL_NO_MODEL_INFO,
  _infer_processor_type,
  _normalize_ollama_root_url,
  _parse_configured_model_entry,
  assemble_available_models,
  discover_ollama_models_result as _discover_ollama_models_result,
)
from app.services.llm.fallback_mock import (
  FallbackMockProvider,
  build_streaming_error_fallback_sql,
  build_streaming_mock_sql_response,
)

logger = logging.getLogger(__name__)


@runtime_checkable
class CompletionDeltaProtocol(Protocol):
  """
  Structural protocol representing a streaming completion delta with `content`.
  """

  @property
  def content(self) -> str | None:
    """Delta content token string or None."""


@runtime_checkable
class CompletionMessageProtocol(Protocol):
  """
  Structural protocol representing a non-streaming completion message with `content`.
  """

  @property
  def content(self) -> str | None:
    """Message content string."""


@runtime_checkable
class CompletionStreamChoiceProtocol(Protocol):
  """
  Structural protocol representing a single streaming choice item with `delta`.
  """

  @property
  def delta(self) -> CompletionDeltaProtocol | None:
    """Streaming delta payload."""


@runtime_checkable
class CompletionTextChoiceProtocol(Protocol):
  """
  Structural protocol representing a legacy text-streaming choice item with `text`.
  """

  @property
  def text(self) -> str | None:
    """Legacy text completion delta."""


@runtime_checkable
class CompletionMessageChoiceProtocol(Protocol):
  """
  Structural protocol representing a single non-streaming choice item with `message`.
  """

  @property
  def message(self) -> CompletionMessageProtocol:
    """Non-streaming completion message."""


@runtime_checkable
class CompletionChunkProtocol(Protocol):
  """
  Structural protocol representing an `any-llm` streaming chunk or non-streaming completion response.
  """

  @property
  def choices(
    self,
  ) -> Sequence[CompletionStreamChoiceProtocol | CompletionTextChoiceProtocol | CompletionMessageChoiceProtocol]:
    """Sequence of completion choices."""


StreamChunkProtocol = CompletionChunkProtocol
"""Alias for `CompletionChunkProtocol` used by streaming consumers."""


type StreamableCompletionResult = (
  CompletionChunkProtocol | AsyncIterable[CompletionChunkProtocol] | Iterable[CompletionChunkProtocol]
)


class LLMProviderClientProtocol(Protocol):
  """
  Structural protocol representing an initialized `AnyLLM` client supporting `.completion(...)`.
  """

  def completion(
    self,
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: list[str] | None = None,
    stream: bool = False,
    api_key: str | None = None,
  ) -> StreamableCompletionResult:
    """
    Executes a synchronous or streaming chat completion request.

    Args:
        model (str): Target model identifier.
        messages (list[dict[str, str]]): OpenAI-formatted conversation messages.
        temperature (float): Sampling temperature.
        max_tokens (int): Maximum completion tokens.
        stop (list[str] | None): Optional stop sequences.
        stream (bool): Whether to return a streaming iterator.
        api_key (str | None): Optional API key override.

    Returns:
        StreamableCompletionResult: Completion response or chunk iterator.
    """


class SwarmCombatantDict(TypedDict):
  """
  Typed dictionary representing an active LLM combatant in `LLMArenaClient.swarm`.

  Attributes:
      client (LLMProviderClientProtocol | AnyLLM | FallbackMockProvider | None):
          Initialized `AnyLLM` provider client or `FallbackMockProvider`.
      name (str): Display name for the model.
      id (str): Unique tracking identifier (`provider/model`).
      model_name (str): Underlying model identifier passed to completion calls.
      provider (str): Provider slug (`openai`, `gemini`, `mistral`, `anthropic`, `mock`).
      is_local (bool): True if hosted locally.
  """

  client: "LLMProviderClientProtocol | AnyLLM | FallbackMockProvider | None"
  name: str
  id: str
  model_name: str
  provider: str
  is_local: bool


class ArenaResponse(NamedTuple):
  """
  Standardized response object for a single model's contribution to the Arena.

  Attributes:
      provider_name (str): The display name of the model (e.g., "GPT-4o").
      model_identifier (str): The technical ID (e.g., "openai/gpt-4o").
      content (str): The raw text response (SQL).
      latency_ms (int): Time taken to generate in milliseconds.
      error (str | None): Error message if generation failed.
      is_fallback (bool): Flag indicating if response originated from FallbackMockProvider.
  """

  provider_name: str
  model_identifier: str
  content: str
  latency_ms: int
  error: str | None = None
  is_fallback: bool = False


class _StreamDoneSentinel:
  """Typed sentinel marker signaling completion of a background token stream."""


_DONE_SENTINEL = _StreamDoneSentinel()

type StreamQueueItem = str | Exception | _StreamDoneSentinel


def _extract_chunk_delta(chunk: CompletionChunkProtocol) -> str | None:
  """
  Extracts text delta from a streaming completion chunk.

  Args:
      chunk (CompletionChunkProtocol): Completion chunk from any-llm provider.

  Returns:
      str | None: The extracted delta content string, or None if unavailable.
  """
  if isinstance(chunk, CompletionChunkProtocol) and chunk.choices:
    choice = chunk.choices[0]
    delta = choice.delta if isinstance(choice, CompletionStreamChoiceProtocol) else None
    if delta is not None and delta.content:
      return str(delta.content)
    if isinstance(choice, CompletionTextChoiceProtocol) and choice.text:
      return str(choice.text)
  return None


def _pump_stream_to_queue(
  stream_iterable: Iterable[CompletionChunkProtocol],
  queue: asyncio.Queue[StreamQueueItem],
  loop: asyncio.AbstractEventLoop,
) -> None:
  """
  Consumes a synchronous iterable in a background thread and queues tokens.

  Args:
      stream_iterable (Iterable[CompletionChunkProtocol]): Synchronous generator or iterable producing chunks.
      queue (asyncio.Queue[StreamQueueItem]): Destination async queue for tokens or exceptions.
      loop (asyncio.AbstractEventLoop): The running asyncio event loop.
  """
  try:
    for chunk in stream_iterable:
      delta = _extract_chunk_delta(chunk)
      if delta:
        loop.call_soon_threadsafe(queue.put_nowait, delta)
    loop.call_soon_threadsafe(queue.put_nowait, _DONE_SENTINEL)
  except Exception as exc:
    loop.call_soon_threadsafe(queue.put_nowait, exc)


class LLMArenaClient:
  """
  A Multi-Provider LLM Client designed for benchmarking and fallback support.

  Instead of connecting to a single model, this client initializes a 'swarm' of
  clients based on configuration. It supports:
  1. Broadcasting a prompt to ALL models simultaneously (The Arena).
  2. Collecting performance metrics (Latency).
  3. Normalizing errors across different SDKs using `any-llm`.
  """

  def __init__(self, timeout: int = 60) -> None:
    """
    Initialize the Swarm based on settings.LLM_SWARM.

    Args:
        timeout (int): Global timeout for all providers.
    """
    self.timeout = timeout
    self.swarm: list[SwarmCombatantDict] = []
    self.init_swarm()

  def init_swarm(
    self,
    custom_api_keys: dict[str, str] | None = None,
    configured_models: list[str] | None = None,
    ollama_api_base: str | None = None,
  ) -> None:
    """
    Initializes or reloads the Swarm based on settings, updated API keys, and configured `any-llm` models.

    Args:
        custom_api_keys (dict[str, str] | None): Updated API keys to apply.
        configured_models (list[str] | None): Additional `provider:model` or `provider/model` entries.
        ollama_api_base (str | None): Optional custom Ollama base URL.
    """
    self.swarm = []
    keys = custom_api_keys or {}
    seen_ids: set[str] = set()

    raw_configs: list[dict[str, JsonPrimitive]] = [
      {
        "provider": c.get("provider"),
        "model": c.get("model"),
        "api_key": c.get("api_key"),
        "api_base": str(c.get("api_base") or c.get("base_url") or "") or None,
        "name": c.get("name"),
        "model_name": str(c.get("model_name") or c.get("model") or ""),
        "is_local": bool(c.get("is_local", c.get("local", False))),
      }
      for c in settings.LLM_SWARM
    ]
    for entry in configured_models or []:
      parsed = _parse_configured_model_entry(entry)
      if parsed is not None:
        prov, mod_name, disp_name = parsed
        is_ollama = prov == "ollama"
        raw_configs.append(
          {
            "provider": "openai" if is_ollama else prov,
            "logical_provider": prov,
            "model": mod_name,
            "model_name": mod_name,
            "name": disp_name,
            "api_key": "ollama" if is_ollama else keys.get(prov),
            "api_base": (f"{_normalize_ollama_root_url(ollama_api_base)}/v1") if is_ollama else None,
            "is_local": is_ollama,
          }
        )

    for config in raw_configs:
      try:
        raw_base = config.get("api_base") or config.get("base_url")
        api_base = str(raw_base) if isinstance(raw_base, str) else None
        provider = str(config["provider"])
        logical_provider = str(config.get("logical_provider", provider))
        raw_cfg_key = config.get("api_key")
        cfg_api_key = str(raw_cfg_key) if isinstance(raw_cfg_key, str) else None
        api_key = (
          keys.get(logical_provider)
          or keys.get(provider)
          or keys.get(f"{logical_provider.upper()}_API_KEY")
          or cfg_api_key
        )

        client = AnyLLM.create(
          provider,
          api_key=api_key,
          api_base=api_base,
          timeout=self.timeout,
        )

        combatant_id = f"{logical_provider}/{config['model']}"
        if combatant_id in seen_ids:
          continue
        seen_ids.add(combatant_id)

        self.swarm.append(
          {
            "client": client,
            "name": str(config["name"]),
            "id": combatant_id,
            "model_name": str(config.get("model_name", config.get("model"))),
            "provider": logical_provider,
            "is_local": bool(config.get("is_local", config.get("local", False))),
          }
        )
        logger.info(f"Registered Arena Combatant: {config['name']} ({config['model']})")

      except Exception as e:
        logger.error(f"Failed to initialize LLM provider {config.get('name')}: {e}")

    if not self.swarm:
      logger.warning("Auto-configuring FallbackMockProvider (No valid LLMs found)")
      mock_provider = FallbackMockProvider()
      self.swarm.append(
        {
          "client": mock_provider,
          "name": mock_provider.name,
          "id": "mock/fallback",
          "model_name": mock_provider.model_name,
          "provider": "mock",
          "is_local": True,
        }
      )

  def reload_swarm(self, admin_settings: AdminSettingsResponse | None = None) -> None:
    """
    Reloads the swarm using updated API keys and configured models from admin configuration.

    Args:
        admin_settings (AdminSettingsResponse | None): Updated admin settings containing `api_keys` and `configured_models`.
    """
    api_keys = admin_settings.api_keys if admin_settings is not None else None
    configured_models = (
      admin_settings.configured_models
      if admin_settings is not None and isinstance(admin_settings.configured_models, list)
      else None
    )
    ollama_api_base = (
      admin_settings.ollama_api_base
      if admin_settings is not None and isinstance(admin_settings.ollama_api_base, str)
      else None
    )
    self.init_swarm(
      custom_api_keys=api_keys,
      configured_models=configured_models,
      ollama_api_base=ollama_api_base,
    )

  async def discover_ollama_models_result(
    self,
    ollama_api_base: str | None = None,
    http_client: httpx.AsyncClient | None = None,
  ) -> AppResult[list[ModelInfo]]:
    """
    Queries the Ollama `/api/tags` endpoint to dynamically discover locally available Ollama models.

    Args:
        ollama_api_base (str | None): Optional override for the Ollama server base URL.
        http_client (httpx.AsyncClient | None): Optional pre-configured async HTTP client for testing.

    Returns:
        AppResult[list[ModelInfo]]: `Ok` containing discovered Ollama `ModelInfo` items, or `Err(AppError)`.
    """
    return await _discover_ollama_models_result(ollama_api_base=ollama_api_base, http_client=http_client)

  def get_available_models(
    self,
    admin_settings: AdminSettingsResponse | None = None,
    include_sql: bool = False,
    discovered_ollama: list[ModelInfo] | None = None,
  ) -> list[ModelInfo]:
    """
    Returns a list of configured models (and optionally `SQL [no model]` + discovered Ollama models).

    Args:
        admin_settings (AdminSettingsResponse | None): Optional admin configuration to filter models by visibility.
        include_sql (bool): Whether to prepend the `SQL [no model]` processor option.
        discovered_ollama (list[ModelInfo] | None): Optional list of dynamically discovered Ollama models.

    Returns:
        list[ModelInfo]: List of configured model/processor information objects.
    """
    swarm_entries: list[dict[str, JsonPrimitive]] = [
      {
        "id": m["id"],
        "name": m["name"],
        "provider": m["provider"],
        "is_local": m["is_local"],
      }
      for m in self.swarm
    ]
    return assemble_available_models(
      swarm_entries=swarm_entries,
      admin_settings=admin_settings,
      include_sql=include_sql,
      discovered_ollama=discovered_ollama,
    )

  async def get_available_processors_async(
    self,
    admin_settings: AdminSettingsResponse | None = None,
    include_sql: bool = False,
    discover_ollama: bool = False,
    http_client: httpx.AsyncClient | None = None,
  ) -> list[ModelInfo]:
    """
    Asynchronously resolves all available processors (`SQL [no model]`, discovered Ollama models, and `any-llm` models).

    Args:
        admin_settings (AdminSettingsResponse | None): Optional admin configuration.
        include_sql (bool): Whether to include the `SQL [no model]` processor option.
        discover_ollama (bool): Whether to dynamically query Ollama `/api/tags`.
        http_client (httpx.AsyncClient | None): Optional HTTP client for Ollama discovery.

    Returns:
        list[ModelInfo]: Ordered list of selectable processors/models.
    """
    discovered: list[ModelInfo] = []
    if discover_ollama:
      ollama_base = admin_settings.ollama_api_base if admin_settings else None
      disc_res = await self.discover_ollama_models_result(ollama_api_base=ollama_base, http_client=http_client)
      if isinstance(disc_res, Ok):
        discovered = disc_res.value
    return self.get_available_models(
      admin_settings=admin_settings,
      include_sql=include_sql,
      discovered_ollama=discovered,
    )

  async def _generate_single(
    self,
    combatant: SwarmCombatantDict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    stop: list[str] | None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> ArenaResponse:
    """
    Internal wrapper to execute a request against a single provider and measure its latency.

    Args:
        combatant (SwarmCombatantDict): Target combatant configuration.
        messages (list[dict[str, str]]): OpenAI-formatted messages.
        temperature (float): Sampling temperature.
        max_tokens (int): Maximum completion tokens.
        stop (list[str] | None): Optional stop sequences.
        admin_settings (AdminSettingsResponse | None): Optional admin settings override.

    Returns:
        ArenaResponse: Standardized provider response with latency and error telemetry.
    """
    client = combatant["client"]
    name = str(combatant["name"])
    model_id = str(combatant["id"])
    target_model_name = str(combatant["model_name"])

    start_time = time.time()

    if isinstance(client, FallbackMockProvider) or client is None:
      provider_instance = (
        client
        if isinstance(client, FallbackMockProvider)
        else FallbackMockProvider(name=name, model_name=target_model_name)
      )
      content = provider_instance.generate_response(messages)
      return ArenaResponse(
        provider_name=name,
        model_identifier=model_id,
        content=content,
        latency_ms=10,
        error=None,
        is_fallback=True,
      )

    try:
      override_key: str | None = None
      if admin_settings and admin_settings.api_keys:
        provider = str(combatant["provider"])
        if provider in admin_settings.api_keys:
          override_key = admin_settings.api_keys[provider]

      if override_key is not None:
        response = await run_in_threadpool(
          client.completion,
          model=target_model_name,
          messages=messages,
          temperature=temperature,
          max_tokens=max_tokens,
          stop=stop,
          api_key=override_key,
        )
      else:
        response = await run_in_threadpool(
          client.completion,
          model=target_model_name,
          messages=messages,
          temperature=temperature,
          max_tokens=max_tokens,
          stop=stop,
        )

      duration_ms = int((time.time() - start_time) * 1000)

      try:
        if not isinstance(response, CompletionChunkProtocol):
          raise AttributeError("Response does not implement CompletionChunkProtocol")
        first_choice = response.choices[0]
        if not isinstance(first_choice, CompletionMessageChoiceProtocol) or first_choice.message.content is None:
          raise AttributeError("Choice does not contain message content")
        content = first_choice.message.content.strip()
        return ArenaResponse(provider_name=name, model_identifier=model_id, content=content, latency_ms=duration_ms)
      except (AttributeError, IndexError, TypeError):
        return ArenaResponse(
          provider_name=name,
          model_identifier=model_id,
          content="",
          latency_ms=duration_ms,
          error="Malformed response structure",
        )

    except Exception as e:
      duration_ms = int((time.time() - start_time) * 1000)
      return ArenaResponse(
        provider_name=name,
        model_identifier=model_id,
        content="",
        latency_ms=duration_ms,
        error=str(e) or type(e).__name__,
      )

  def _build_dynamic_combatant(
    self,
    model_spec: str,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> SwarmCombatantDict | None:
    """
    Builds an on-demand `SwarmCombatantDict` for a `provider:model` or `provider/model` string
    when it is not already pre-registered in `self.swarm`.

    Args:
        model_spec (str): Target model identifier (e.g. `'ollama:llama3'` or `'openai:gpt-4o-mini'`).
        admin_settings (AdminSettingsResponse | None): Optional admin settings with API keys and Ollama host.

    Returns:
        SwarmCombatantDict | None: On-demand combatant dictionary, or `None` if `model_spec` is not parseable.
    """
    parsed = _parse_configured_model_entry(model_spec)
    if parsed is None:
      return None
    prov, mod_name, disp_name = parsed
    keys = (admin_settings.api_keys if admin_settings and admin_settings.api_keys else {}) or {}
    ollama_base = admin_settings.ollama_api_base if admin_settings else None
    is_ollama = prov == "ollama"
    sdk_provider = "openai" if is_ollama else prov
    api_key = "ollama" if is_ollama else (keys.get(prov) or keys.get(f"{prov.upper()}_API_KEY"))
    api_base = f"{_normalize_ollama_root_url(ollama_base)}/v1" if is_ollama else None
    client: LLMProviderClientProtocol | AnyLLM | FallbackMockProvider
    try:
      client = AnyLLM.create(sdk_provider, api_key=api_key, api_base=api_base, timeout=self.timeout)
    except Exception:
      client = FallbackMockProvider(name=disp_name, model_name=mod_name)
    return {
      "client": client,
      "name": disp_name,
      "id": model_spec,
      "model_name": mod_name,
      "provider": prov,
      "is_local": is_ollama,
    }

  async def generate_arena_competition(
    self,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: list[str] | None = None,
    target_model_ids: list[str] | None = None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> list[ArenaResponse]:
    """
    Broadcasts the prompt to all configured LLMs concurrently.
    Can be scoped to specific models via `target_model_ids`.

    Args:
        messages (list[dict[str, str]]): OpenAI-format history.
        temperature (float): Determinism factor.
        max_tokens (int): Length limit.
        stop (list[str] | None): Stop sequences.
        target_model_ids (list[str] | None): Optional list of specific model IDs to query.
        admin_settings (AdminSettingsResponse | None): Optional administrative settings.

    Returns:
        list[ArenaResponse]: A list of results from every active model, including errors.

    Raises:
        RuntimeError: When `self.swarm` is empty.
    """
    if not self.swarm:
      raise RuntimeError("No LLM providers are configured in the Arena.")

    active_combatants = list(self.swarm)
    if target_model_ids:
      normalized_targets = {tid.replace(":", "/") for tid in target_model_ids} | set(target_model_ids)
      matched = [
        c for c in self.swarm if c["id"] in normalized_targets or c["id"].replace(":", "/") in normalized_targets
      ]
      if not matched:
        for tid in target_model_ids:
          dynamic_comb = self._build_dynamic_combatant(tid, admin_settings)
          if dynamic_comb is not None:
            matched.append(dynamic_comb)
      active_combatants = matched

    if not active_combatants:
      return []

    if not target_model_ids and admin_settings and admin_settings.visible_models:
      active_combatants = [c for c in active_combatants if c["id"] in admin_settings.visible_models]

    tasks = [
      self._generate_single(combatant, messages, temperature, max_tokens, stop, admin_settings)
      for combatant in active_combatants
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    final_results: list[ArenaResponse] = []
    for i, res in enumerate(results):
      if isinstance(res, ArenaResponse):
        final_results.append(res)
      else:
        combatant = active_combatants[i]
        final_results.append(
          ArenaResponse(
            provider_name=combatant["name"],
            model_identifier=combatant["id"],
            content="",
            latency_ms=0,
            error=f"Critical Client Error: {res!s}",
          )
        )

    return final_results

  def _select_stream_combatant(self, model_id: str | None) -> SwarmCombatantDict:
    """
    Selects the target combatant dictionary for streaming.

    Args:
        model_id (str | None): Optional model ID to match.

    Returns:
        SwarmCombatantDict: Selected combatant dictionary from `self.swarm`.
    """
    combatant = next((c for c in self.swarm if c["id"] == model_id), None) if model_id else None
    return combatant or self.swarm[0]

  async def _stream_from_live_result(
    self,
    stream_result: StreamableCompletionResult,
  ) -> AsyncGenerator[str, None]:
    """
    Yields token deltas from an `any-llm` completion result (sync, async iterator, or sync generator).

    Args:
        stream_result (StreamableCompletionResult):
            Raw stream object returned by `client.completion(..., stream=True)`.

    Yields:
        str: Token delta strings.
    """
    if isinstance(stream_result, CompletionChunkProtocol):
      first_choice = stream_result.choices[0]
      raw_msg = (
        first_choice.message.content
        if isinstance(first_choice, CompletionMessageChoiceProtocol) and first_choice.message.content is not None
        else ""
      )
      content = str(raw_msg)
      for word in content.split(" "):
        yield word + " "
      return

    if isinstance(stream_result, AsyncIterable):
      async for chunk in stream_result:
        delta = _extract_chunk_delta(chunk)
        if delta:
          yield delta
      return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[StreamQueueItem] = asyncio.Queue()
    pump_task = asyncio.create_task(asyncio.to_thread(_pump_stream_to_queue, stream_result, queue, loop))
    try:
      while True:
        item = await queue.get()
        if item is _DONE_SENTINEL:
          break
        if isinstance(item, Exception):
          raise item
        yield str(item)
    finally:
      pump_task.cancel()
      with contextlib.suppress(asyncio.CancelledError, Exception):
        await pump_task

  async def stream_tokens(
    self,
    messages: list[dict[str, str]],
    model_id: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> AsyncGenerator[str, None]:
    """
    Streams tokens incrementally from the selected model (or first active model in the swarm).

    Args:
        messages (list[dict[str, str]]): List of message dictionaries representing conversation history.
        model_id (str | None): Optional specific model identifier to target.
        temperature (float): Sampling temperature for generation.
        max_tokens (int): Maximum tokens to generate.
        admin_settings (AdminSettingsResponse | None): Admin settings for API key and model visibility overrides.

    Yields:
        str: Incremental token strings.
    """
    if not self.swarm:
      yield "SELECT 'No LLM providers configured' as status;"
      return

    combatant = self._select_stream_combatant(model_id)
    client = combatant.get("client")
    if isinstance(client, FallbackMockProvider) or client is None:
      mock_response = build_streaming_mock_sql_response()
      words = mock_response.split(" ")
      for i, word in enumerate(words):
        yield word + (" " if i < len(words) - 1 else "")
      return

    try:
      if admin_settings and admin_settings.api_keys and combatant["provider"] in admin_settings.api_keys:
        stream_result = await run_in_threadpool(
          client.completion,
          model=combatant["model_name"],
          messages=messages,
          temperature=temperature,
          max_tokens=max_tokens,
          stream=True,
          api_key=admin_settings.api_keys[combatant["provider"]],
        )
      else:
        stream_result = await run_in_threadpool(
          client.completion,
          model=combatant["model_name"],
          messages=messages,
          temperature=temperature,
          max_tokens=max_tokens,
          stream=True,
        )
      async for token in self._stream_from_live_result(stream_result):
        yield token

    except Exception as e:
      logger.warning(f"Streaming failed, falling back to standard generation: {e}")
      res = await self._generate_single(combatant, messages, temperature, max_tokens, None, admin_settings)
      fallback_text = build_streaming_error_fallback_sql() if res.error else res.content
      for word in fallback_text.split(" "):
        yield word + " "


# Singleton instance
llm_client = LLMArenaClient()

__all__ = [
  "ArenaResponse",
  "CompletionChunkProtocol",
  "CompletionDeltaProtocol",
  "CompletionMessageChoiceProtocol",
  "CompletionMessageProtocol",
  "CompletionStreamChoiceProtocol",
  "CompletionTextChoiceProtocol",
  "FallbackMockProvider",
  "LLMArenaClient",
  "LLMProviderClientProtocol",
  "SQL_NO_MODEL_INFO",
  "StreamChunkProtocol",
  "SwarmCombatantDict",
  "_extract_chunk_delta",
  "_infer_processor_type",
  "_normalize_ollama_root_url",
  "_parse_configured_model_entry",
  "_pump_stream_to_queue",
  "httpx",
  "llm_client",
]
