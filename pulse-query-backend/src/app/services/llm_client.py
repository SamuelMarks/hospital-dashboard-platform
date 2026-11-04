"""
Multi-provider LLM client for arena-style SQL generation.

Wraps `any-llm` providers, `gemma-4-sql` SDK/server, local Ollama with semaphore concurrency
protection, and proprietary cloud LLMs (Gemini, OpenAI, Anthropic, Mistral).
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
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import ModelInfo
from app.schemas.json_types import JsonPrimitive
from app.services.llm.discovery import (
  SQL_NO_MODEL_INFO,
  _infer_processor_type,
  _normalize_ollama_root_url,
  _parse_configured_model_entry,
  assemble_available_models,
  build_gemma4_sql_model_info,
  discover_ollama_models_result as _discover_ollama_models_result,
  normalize_ollama_tag_key,
  resolve_ollama_model_alias,
)
from app.services.llm.error_classifier import classify_llm_error
from app.services.llm.fallback_mock import (
  FallbackMockProvider,
  build_streaming_error_fallback_sql,
  build_streaming_mock_sql_response,
)
from app.services.llm.gemma4_sql_provider import Gemma4SqlProvider
from app.services.llm.swarm_registry import build_raw_swarm_configs

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
  Structural protocol representing an initialized `AnyLLM` or `Gemma4SqlProvider` client supporting `.completion(...)`.
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
      client (LLMProviderClientProtocol | AnyLLM | Gemma4SqlProvider | FallbackMockProvider | None):
          Initialized provider client or `FallbackMockProvider`.
      name (str): Display name for the model.
      id (str): Unique tracking identifier (`provider/model`).
      model_name (str): Underlying model identifier passed to completion calls.
      provider (str): Provider slug (`openai`, `gemini`, `mistral`, `anthropic`, `gemma4sql`, `mock`).
      is_local (bool): True if hosted locally.
  """

  client: "LLMProviderClientProtocol | AnyLLM | Gemma4SqlProvider | FallbackMockProvider | None"
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


def _extract_completion_content(response: StreamableCompletionResult) -> AppResult[str]:
  """
  Extracts trimmed text content from a non-streaming completion response as an `AppResult[str]`.

  Args:
      response (StreamableCompletionResult): Completion response object from provider.

  Returns:
      AppResult[str]: `Ok(content)` with trimmed completion text, or `Err(AppError)` when malformed.
  """
  if not isinstance(response, CompletionChunkProtocol) or not response.choices:
    return Err(
      AppError(
        code=ErrorCode.LLM_PROVIDER_ERROR,
        message="Malformed response structure",
        status_code=502,
      )
    )
  first_choice = response.choices[0]
  if not isinstance(first_choice, CompletionMessageChoiceProtocol) or first_choice.message.content is None:
    return Err(
      AppError(
        code=ErrorCode.LLM_PROVIDER_ERROR,
        message="Malformed response structure",
        status_code=502,
      )
    )
  return Ok(first_choice.message.content.strip())


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
  1. Broadcasting a prompt to ALL models simultaneously (The Arena) while serializing
     local Ollama requests via a semaphore to prevent `llama-server` segmentation faults.
  2. Collecting performance metrics (Latency).
  3. Normalizing errors across different SDKs using `any-llm`, `gemma-4-sql`, and `classify_llm_error`.
  """

  def __init__(self, timeout: int = 60, max_local_concurrent: int | None = None) -> None:
    """
    Initialize the Swarm based on `settings.LLM_SWARM`.

    Args:
        timeout (int): Global timeout for all providers.
        max_local_concurrent (int | None): Optional concurrency cap for local Ollama/llama-server requests.
    """
    self.timeout = timeout
    cap = max_local_concurrent if max_local_concurrent is not None else max(1, settings.OLLAMA_MAX_CONCURRENT_REQUESTS)
    self._local_semaphore = asyncio.Semaphore(cap)
    self.swarm: list[SwarmCombatantDict] = []
    self._unconfigured_cloud_ids: set[str] = set()
    self.init_swarm()

  def _build_raw_swarm_configs(
    self,
    keys: dict[str, str],
    configured_models: list[str] | None,
    ollama_api_base: str | None,
    gemma4_sql_enabled: bool | None,
    gemma4_sql_backend: str | None,
    gemma4_sql_model_name: str | None,
    gemma4_sql_api_base: str | None,
  ) -> list[dict[str, JsonPrimitive]]:
    """
    Builds the normalized list of raw swarm configuration dictionaries from `settings.LLM_SWARM` and overrides.

    Args:
        keys (dict[str, str]): Custom API keys mapping.
        configured_models (list[str] | None): Additional `provider:model` entries.
        ollama_api_base (str | None): Optional custom Ollama base URL.
        gemma4_sql_enabled (bool | None): Optional explicit enable flag for `gemma-4-sql`.
        gemma4_sql_backend (str | None): Optional `gemma-4-sql` backend engine override.
        gemma4_sql_model_name (str | None): Optional `gemma-4-sql` model identifier override.
        gemma4_sql_api_base (str | None): Optional `gemma-4-sql serve` HTTP URL override.

    Returns:
        list[dict[str, JsonPrimitive]]: Normalized configuration dictionaries.
    """
    return build_raw_swarm_configs(
      keys=keys,
      configured_models=configured_models,
      ollama_api_base=ollama_api_base,
      gemma4_sql_enabled=gemma4_sql_enabled,
      gemma4_sql_backend=gemma4_sql_backend,
      gemma4_sql_model_name=gemma4_sql_model_name,
      gemma4_sql_api_base=gemma4_sql_api_base,
    )

  def init_swarm(
    self,
    custom_api_keys: dict[str, str] | None = None,
    configured_models: list[str] | None = None,
    ollama_api_base: str | None = None,
    gemma4_sql_enabled: bool | None = None,
    gemma4_sql_backend: str | None = None,
    gemma4_sql_model_name: str | None = None,
    gemma4_sql_api_base: str | None = None,
  ) -> None:
    """
    Initializes or reloads the Swarm based on settings, updated API keys, `gemma-4-sql`, and configured `any-llm` models.

    Args:
        custom_api_keys (dict[str, str] | None): Updated API keys to apply.
        configured_models (list[str] | None): Additional `provider:model` or `provider/model` entries.
        ollama_api_base (str | None): Optional custom Ollama base URL.
        gemma4_sql_enabled (bool | None): Optional explicit enable flag for `gemma-4-sql`.
        gemma4_sql_backend (str | None): Optional `gemma-4-sql` backend engine override.
        gemma4_sql_model_name (str | None): Optional `gemma-4-sql` model identifier override.
        gemma4_sql_api_base (str | None): Optional `gemma-4-sql serve` HTTP URL override.
    """
    self.swarm = []
    self._unconfigured_cloud_ids = set()
    keys = custom_api_keys or {}
    seen_ids: set[str] = set()
    raw_configs = self._build_raw_swarm_configs(
      keys=keys,
      configured_models=configured_models,
      ollama_api_base=ollama_api_base,
      gemma4_sql_enabled=gemma4_sql_enabled,
      gemma4_sql_backend=gemma4_sql_backend,
      gemma4_sql_model_name=gemma4_sql_model_name,
      gemma4_sql_api_base=gemma4_sql_api_base,
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
        is_local = bool(config.get("is_local", config.get("local", False)))

        client: LLMProviderClientProtocol | AnyLLM | Gemma4SqlProvider
        if logical_provider == "gemma4sql" or provider == "gemma4sql":
          backend_name = api_key if api_key in {"mlx", "jax", "pytorch", "keras", "maxtext", "api"} else "mlx"
          client = Gemma4SqlProvider(
            model_name=str(config.get("model_name", config.get("model"))),
            backend=backend_name,
            api_base=api_base,
            beam_width=settings.GEMMA4_SQL_BEAM_WIDTH,
            max_length=settings.GEMMA4_SQL_MAX_LENGTH,
            show_confidence=settings.GEMMA4_SQL_SHOW_CONFIDENCE,
          )
        else:
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

        if (
          not is_local
          and logical_provider not in {"ollama", "gemma4sql", "llamacpp", "sql", "mock"}
          and not (api_key or settings.get_provider_api_key(logical_provider))
        ):
          self._unconfigured_cloud_ids.add(combatant_id)

        self.swarm.append(
          {
            "client": client,
            "name": str(config["name"]),
            "id": combatant_id,
            "model_name": str(config.get("model_name", config.get("model"))),
            "provider": logical_provider,
            "is_local": is_local,
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
    gemma4_enabled = (
      admin_settings.gemma4_sql_enabled
      if admin_settings is not None and isinstance(admin_settings.gemma4_sql_enabled, bool) and bool(configured_models)
      else None
    )
    gemma4_backend = (
      admin_settings.gemma4_sql_backend
      if admin_settings is not None and isinstance(admin_settings.gemma4_sql_backend, str)
      else None
    )
    gemma4_model = (
      admin_settings.gemma4_sql_model_name
      if admin_settings is not None and isinstance(admin_settings.gemma4_sql_model_name, str)
      else None
    )
    gemma4_base = (
      admin_settings.gemma4_sql_api_base
      if admin_settings is not None and isinstance(admin_settings.gemma4_sql_api_base, str)
      else None
    )
    self.init_swarm(
      custom_api_keys=api_keys,
      configured_models=configured_models,
      ollama_api_base=ollama_api_base,
      gemma4_sql_enabled=gemma4_enabled,
      gemma4_sql_backend=gemma4_backend,
      gemma4_sql_model_name=gemma4_model,
      gemma4_sql_api_base=gemma4_base,
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
    show_all: bool = False,
  ) -> list[ModelInfo]:
    """
    Returns a list of configured models (and optionally `SQL [no model]` + discovered Ollama models).

    Args:
        admin_settings (AdminSettingsResponse | None): Optional admin configuration to filter models by visibility.
        include_sql (bool): Whether to prepend the `SQL [no model]` processor option.
        discovered_ollama (list[ModelInfo] | None): Optional list of dynamically discovered Ollama models.
        show_all (bool): Whether to include unconfigured/unavailable models with non-connected status.

    Returns:
        list[ModelInfo]: List of configured model/processor information objects.
    """
    swarm_entries: list[dict[str, JsonPrimitive]] = [
      {
        "id": m["id"],
        "name": m["name"],
        "provider": m["provider"],
        "is_local": m["is_local"],
        "has_api_key": m["id"] not in self._unconfigured_cloud_ids,
      }
      for m in self.swarm
    ]
    return assemble_available_models(
      swarm_entries=swarm_entries,
      admin_settings=admin_settings,
      include_sql=include_sql,
      discovered_ollama=discovered_ollama,
      show_all=show_all,
    )

  async def get_available_processors_async(
    self,
    admin_settings: AdminSettingsResponse | None = None,
    include_sql: bool = False,
    discover_ollama: bool = False,
    http_client: httpx.AsyncClient | None = None,
    show_all: bool = False,
  ) -> list[ModelInfo]:
    """
    Asynchronously resolves all available processors (`SQL [no model]`, `gemma-4-sql`, discovered Ollama models, and `any-llm` models).

    Args:
        admin_settings (AdminSettingsResponse | None): Optional admin configuration.
        include_sql (bool): Whether to include the `SQL [no model]` processor option.
        discover_ollama (bool): Whether to dynamically query Ollama `/api/tags`.
        http_client (httpx.AsyncClient | None): Optional HTTP client for Ollama discovery.
        show_all (bool): Whether to include unconfigured/unavailable models with non-connected status.

    Returns:
        list[ModelInfo]: Ordered list of selectable processors/models.
    """
    discovered: list[ModelInfo] | None = None
    if discover_ollama:
      ollama_base = admin_settings.ollama_api_base if admin_settings else None
      disc_res = await self.discover_ollama_models_result(ollama_api_base=ollama_base, http_client=http_client)
      discovered = disc_res.value if isinstance(disc_res, Ok) else []
    models = self.get_available_models(
      admin_settings=admin_settings,
      include_sql=include_sql,
      discovered_ollama=discovered,
      show_all=show_all,
    )
    gemma4_explicitly_enabled = bool(settings.GEMMA4_SQL_ENABLED) or bool(
      admin_settings
      and admin_settings.gemma4_sql_enabled
      and include_sql
      and (
        not discover_ollama
        or show_all
        or bool(admin_settings.gemma4_sql_api_base)
        or any("gemma4sql" in c.lower() for c in (admin_settings.configured_models or []))
      )
    )
    if gemma4_explicitly_enabled and all(m.processor_type != "GEMMA_4_SQL" for m in models):
      gemma_info = build_gemma4_sql_model_info(admin_settings)
      if (gemma_info.status == "connected" or show_all) and (
        show_all
        or not (admin_settings and admin_settings.visible_models)
        or gemma_info.id in admin_settings.visible_models
      ):
        models.append(gemma_info)
    return models

  async def _try_lightweight_ollama_fallback(
    self,
    client: LLMProviderClientProtocol | AnyLLM | Gemma4SqlProvider,
    failed_model_name: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    stop: list[str] | None,
    admin_settings: AdminSettingsResponse | None,
  ) -> str | None:
    """
    Attempts a single fallback completion using the primary discovered lightweight Ollama model
    when a requested local Ollama model fails (e.g. `Connection error.` or unpulled heavy tag).

    Args:
        client (LLMProviderClientProtocol | AnyLLM | Gemma4SqlProvider): Active provider client.
        failed_model_name (str): Original model tag that raised an exception.
        messages (list[dict[str, str]]): OpenAI-formatted messages.
        temperature (float): Sampling temperature.
        max_tokens (int): Maximum completion tokens.
        stop (list[str] | None): Optional stop sequences.
        admin_settings (AdminSettingsResponse | None): Optional admin settings containing `ollama_api_base`.

    Returns:
        str | None: Trimmed completion content from the fallback model, or `None` if unavailable/failed.
    """
    ollama_base = admin_settings.ollama_api_base if admin_settings else None
    disc_res = await self.discover_ollama_models_result(ollama_api_base=ollama_base)
    if not isinstance(disc_res, Ok) or not disc_res.value:
      return None

    fallback_tag: str | None = None
    for candidate in disc_res.value:
      cand_tag = candidate.id.removeprefix("ollama:").removeprefix("ollama/")
      if cand_tag != failed_model_name or normalize_ollama_tag_key(cand_tag) != normalize_ollama_tag_key(
        failed_model_name
      ):
        fallback_tag = cand_tag
        break

    if not fallback_tag:
      return None

    try:
      fallback_resp = await run_in_threadpool(
        client.completion,
        model=fallback_tag,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stop=stop,
      )
      extracted_fb = _extract_completion_content(fallback_resp)
      return extracted_fb.value if isinstance(extracted_fb, Ok) else None
    except Exception as fallback_exc:
      logger.warning(f"Lightweight Ollama fallback '{fallback_tag}' also failed: {fallback_exc}")
    return None

  async def _execute_provider_completion(
    self,
    combatant: SwarmCombatantDict,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    stop: list[str] | None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> ArenaResponse:
    """
    Executes the underlying completion call for a single combatant and classifies any provider/crash error.

    Args:
        combatant (SwarmCombatantDict): Target combatant configuration.
        messages (list[dict[str, str]]): OpenAI-formatted messages.
        temperature (float): Sampling temperature.
        max_tokens (int): Maximum completion tokens.
        stop (list[str] | None): Optional stop sequences.
        admin_settings (AdminSettingsResponse | None): Optional admin settings override.

    Returns:
        ArenaResponse: Standardized provider response with latency and classified error telemetry.
    """
    client = combatant["client"]
    name = str(combatant["name"])
    model_id = str(combatant["id"])
    raw_target_model_name = str(combatant["model_name"])
    provider = str(combatant["provider"])
    is_local_ollama = provider == "ollama" or (bool(combatant.get("is_local")) and provider in {"ollama", "openai"})
    target_model_name = resolve_ollama_model_alias(raw_target_model_name) if is_local_ollama else raw_target_model_name

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
      override_key = (
        admin_settings.api_keys[provider]
        if (admin_settings and admin_settings.api_keys and provider in admin_settings.api_keys)
        else None
      )
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

      extracted = _extract_completion_content(response)
      if isinstance(extracted, Ok):
        return ArenaResponse(
          provider_name=name,
          model_identifier=model_id,
          content=extracted.value,
          latency_ms=duration_ms,
        )
      return ArenaResponse(
        provider_name=name,
        model_identifier=model_id,
        content="",
        latency_ms=duration_ms,
        error=extracted.error.message,
      )

    except Exception as e:
      if is_local_ollama:
        fb_content = await self._try_lightweight_ollama_fallback(
          client=client,
          failed_model_name=raw_target_model_name,
          messages=messages,
          temperature=temperature,
          max_tokens=max_tokens,
          stop=stop,
          admin_settings=admin_settings,
        )
        if fb_content is not None:
          duration_ms = int((time.time() - start_time) * 1000)
          return ArenaResponse(
            provider_name=name,
            model_identifier=model_id,
            content=fb_content,
            latency_ms=duration_ms,
          )

      duration_ms = int((time.time() - start_time) * 1000)
      classified = classify_llm_error(provider=provider, model=target_model_name, raw_error=e)
      remediation = str(classified.details.get("remediation") or "").strip()
      err_str = f"{classified.message} | Remediation: {remediation}" if remediation else classified.message
      return ArenaResponse(
        provider_name=name,
        model_identifier=model_id,
        content="",
        latency_ms=duration_ms,
        error=err_str,
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
    Serializes local Ollama / `llama-server` requests via `self._local_semaphore` so concurrent
    model loads do not cause a segmentation fault (`SIGSEGV`).

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
    is_local_ollama = bool(combatant.get("is_local")) and combatant.get("provider") in {"ollama", "openai", "llamacpp"}
    if is_local_ollama:
      async with self._local_semaphore:
        return await self._execute_provider_completion(combatant, messages, temperature, max_tokens, stop, admin_settings)
    return await self._execute_provider_completion(combatant, messages, temperature, max_tokens, stop, admin_settings)

  def _build_dynamic_combatant(
    self,
    model_spec: str,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> SwarmCombatantDict | None:
    """
    Builds an on-demand `SwarmCombatantDict` for a `provider:model` or `provider/model` string
    when it is not already pre-registered in `self.swarm`.

    Args:
        model_spec (str): Target model identifier (e.g. `'ollama:llama3'`, `'gemma4sql:google/gemma-4-sql-9b'`, or `'openai:gpt-4o-mini'`).
        admin_settings (AdminSettingsResponse | None): Optional admin settings with API keys and Ollama host.

    Returns:
        SwarmCombatantDict | None: On-demand combatant dictionary, or `None` if `model_spec` is not parseable.
    """
    parsed = _parse_configured_model_entry(model_spec)
    if parsed is None:
      return None
    prov, mod_name, disp_name = parsed
    if prov == "gemma4sql":
      backend = (
        admin_settings.gemma4_sql_backend
        if admin_settings and admin_settings.gemma4_sql_backend
        else settings.GEMMA4_SQL_BACKEND
      )
      api_base = (
        admin_settings.gemma4_sql_api_base
        if admin_settings and admin_settings.gemma4_sql_api_base
        else settings.GEMMA4_SQL_API_BASE
      )
      gemma_client = Gemma4SqlProvider(model_name=mod_name, backend=backend, api_base=api_base)
      return {
        "client": gemma_client,
        "name": gemma_client.name,
        "id": model_spec,
        "model_name": mod_name,
        "provider": "gemma4sql",
        "is_local": True,
      }

    keys = (admin_settings.api_keys if admin_settings and admin_settings.api_keys else {}) or {}
    ollama_base = admin_settings.ollama_api_base if admin_settings else None
    is_ollama = prov == "ollama"
    sdk_provider = "openai" if is_ollama else prov
    api_key = (
      "ollama"
      if is_ollama
      else (keys.get(prov) or keys.get(f"{prov.upper()}_API_KEY") or settings.get_provider_api_key(prov))
    )
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

  async def generate_arena_competition_result(
    self,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: list[str] | None = None,
    target_model_ids: list[str] | None = None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> AppResult[list[ArenaResponse]]:
    """
    Broadcasts the prompt to all configured LLMs concurrently and returns an `AppResult[list[ArenaResponse]]`.

    Args:
        messages (list[dict[str, str]]): OpenAI-format history.
        temperature (float): Determinism factor.
        max_tokens (int): Length limit.
        stop (list[str] | None): Stop sequences.
        target_model_ids (list[str] | None): Optional list of specific model IDs to query.
        admin_settings (AdminSettingsResponse | None): Optional administrative settings.

    Returns:
        AppResult[list[ArenaResponse]]: `Ok(results)` from active models, or `Err(AppError)` when no swarm is configured.
    """
    if not self.swarm:
      return Err(
        AppError(
          code=ErrorCode.CONFIGURATION_ERROR,
          message="No LLM providers are configured in the Arena.",
          status_code=503,
        )
      )

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
      return Ok([])

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

    return Ok(final_results)

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
    res = await self.generate_arena_competition_result(
      messages=messages,
      temperature=temperature,
      max_tokens=max_tokens,
      stop=stop,
      target_model_ids=target_model_ids,
      admin_settings=admin_settings,
    )
    if isinstance(res, Err):
      raise RuntimeError(res.error.message)
    return res.value

  def _select_stream_combatant(
    self,
    model_id: str | None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> SwarmCombatantDict:
    """
    Selects the target combatant dictionary for streaming, building a dynamic combatant if needed.

    Args:
        model_id (str | None): Optional model ID to match.
        admin_settings (AdminSettingsResponse | None): Optional admin settings for dynamic combatant construction.

    Returns:
        SwarmCombatantDict: Selected combatant dictionary from `self.swarm` or dynamically built.
    """
    if model_id:
      norm = model_id.replace(":", "/")
      combatant = next((c for c in self.swarm if c["id"] in {model_id, norm} or c["id"].replace(":", "/") == norm), None)
      if combatant is not None:
        return combatant
      dynamic = self._build_dynamic_combatant(model_id, admin_settings)
      if dynamic is not None:
        return dynamic
    return self.swarm[0]

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

    combatant = self._select_stream_combatant(model_id, admin_settings)
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
  "Gemma4SqlProvider",
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
