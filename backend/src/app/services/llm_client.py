"""
Multi-provider LLM client for arena-style SQL generation.

Wraps any-llm providers, executes concurrent requests, and normalizes responses.
"""

import logging
import time
import asyncio
from typing import List, Dict, Any, NamedTuple, Optional

from any_llm import AnyLLM
from starlette.concurrency import run_in_threadpool
from app.core.config import settings
from app.schemas.admin import AdminSettingsResponse

logger = logging.getLogger(__name__)


class ArenaResponse(NamedTuple):
  """
  Standardized response object for a single model's contribution to the Arena.

  Attributes:
      provider_name (str): The display name of the model (e.g., "GPT-4o").
      model_identifier (str): The technical ID (e.g., "openai/gpt-4o").
      content (str): The raw text response (SQL).
      latency_ms (int): Time taken to generate in milliseconds.
      error (Optional[str]): Error message if generation failed.
  """

  provider_name: str
  model_identifier: str
  content: str
  latency_ms: int
  error: Optional[str] = None


class LLMArenaClient:
  """
  A Multi-Provider LLM Client designed for benchmarking and fallback support.

  Instead of connecting to a single model, this client initializes a 'swarm' of
  clients based on configuration. It supports:
  1. Broadcasting a prompt to ALL models simultaneously (The Arena).
  2. Collecting performance metrics (Latency).
  3. Normalizing errors across different SDKs using `any-llm`.
  """

  def __init__(self, timeout: int = 60):
    """
    Initialize the Swarm based on settings.LLM_SWARM.

    Args:
        timeout (int): Global timeout for all providers.
    """
    self.swarm: List[Dict[str, Any]] = []

    for config in settings.LLM_SWARM:
      try:
        # Initialize any-llm clients for each configured provider
        api_base = config.get("api_base") or config.get("base_url")

        # NOTE: We do NOT pass 'model' here. OpenAI-compatible SDKs (v1+)
        # expect 'model' to be passed during the completion call, not client init.
        client = AnyLLM.create(
          config["provider"],
          api_key=config.get("api_key"),
          api_base=api_base,  # Only used for local/custom endpoints
          timeout=timeout,
        )

        self.swarm.append(
          {
            "client": client,
            "name": config["name"],  # Display Name
            "id": f"{config['provider']}/{config['model']}",  # Unique Tracking ID
            "model_name": config.get("model_name", config.get("model")),  # Actual Model ID
            "provider": config["provider"],
            "is_local": config.get("local", False),
          }
        )
        logger.info(f"Registered Arena Combatant: {config['name']} ({config['model']})")

      except Exception as e:
        logger.error(f"Failed to initialize LLM provider {config.get('name')}: {e}")

    # Fallback to prevent system crash if no providers are available
    if not self.swarm:
      logger.warning("Auto-configuring Mock Provider (No valid LLMs found)")
      self.swarm.append(
        {
          "client": None,  # Signals internal mock logic
          "name": "System Mock",
          "id": "mock/fallback",
          "model_name": "mock-model",
          "provider": "mock",
          "is_local": True,
        }
      )

  def get_available_models(self, admin_settings: Optional[AdminSettingsResponse] = None) -> List[Dict[str, Any]]:
    """
    Returns a list of configured models. Filters by admin settings if provided.
    """
    models = [
      {"id": m["id"], "name": m["name"], "provider": m["provider"], "is_local": m.get("is_local", False)}
      for m in self.swarm
    ]
    if admin_settings and admin_settings.visible_models:
      return [m for m in models if m["id"] in admin_settings.visible_models]
    return models

  async def _generate_single(
    self,
    combatant: Dict[str, Any],
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    stop: Optional[List[str]],
    admin_settings: Optional[AdminSettingsResponse] = None,
  ) -> ArenaResponse:
    """
    Internal wrapper to execute a request against a single provider
    and measure its latency.
    """
    client = combatant["client"]
    name = combatant["name"]
    model_id = combatant["id"]
    target_model_name = combatant["model_name"]

    start_time = time.time()

    # Handle Mock / Fallback Mode
    if client is None:
      mock_sql = "SELECT 'System Mock' as source, 'No LLM Configured' as status;"
      content = f"```sql\n{mock_sql}\n```"
      return ArenaResponse(provider_name=name, model_identifier=model_id, content=content, latency_ms=10, error=None)

    try:
      # Offload blocking IO to threadpool to keep asyncio loop healthy
      # We pass 'model' here to satisfy OpenAI SDK requirements
      kwargs = {}
      if admin_settings and admin_settings.api_keys:
        provider = combatant["provider"]
        if provider in admin_settings.api_keys:
          kwargs["api_key"] = admin_settings.api_keys[provider]

      response = await run_in_threadpool(
        client.completion,
        model=target_model_name,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stop=stop,
        **kwargs,
      )

      # Measure Latency
      duration_ms = int((time.time() - start_time) * 1000)

      # Robust extraction of content
      try:
        content = response.choices[0].message.content.strip()
        return ArenaResponse(provider_name=name, model_identifier=model_id, content=content, latency_ms=duration_ms)
      except (AttributeError, IndexError) as e:
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
        provider_name=name, model_identifier=model_id, content="", latency_ms=duration_ms, error=str(e)
      )

  async def generate_arena_competition(
    self,
    messages: List[Dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: Optional[List[str]] = None,
    target_model_ids: Optional[List[str]] = None,
    admin_settings: Optional[AdminSettingsResponse] = None,
  ) -> List[ArenaResponse]:
    """
    The Main Event: Broadcasts the prompt to all configured LLMs concurrently.
    Can be scoped to specific models via `target_model_ids`.

    Args:
        messages: OpenAI-format history.
        temperature: Determinism factor.
        max_tokens: Length limit.
        stop: Stop sequences (crucial for SQL generation).
        target_model_ids: Optional list of specific 'id's to query.

    Returns:
        List[ArenaResponse]: A list of results from every active model, including errors.
    """
    if not self.swarm:
      raise RuntimeError("No LLM providers are configured in the Arena.")

    # Filter combatants
    active_combatants = self.swarm
    if target_model_ids:
      active_combatants = [c for c in self.swarm if c["id"] in target_model_ids]

    if not active_combatants:
      # Fallback if filters didn't match anything -> Return empty or all?
      # Returning empty to signify strict adherence. Filters might be malformed.
      return []

    if not target_model_ids and admin_settings and admin_settings.visible_models:
      active_combatants = [c for c in active_combatants if c["id"] in admin_settings.visible_models]

    # Create tasks for all providers
    tasks = [
      self._generate_single(combatant, messages, temperature, max_tokens, stop, admin_settings)
      for combatant in active_combatants
    ]

    # Run all tasks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out unhandled coroutine exceptions (re-wrapping them as ArenaResponse errors)
    final_results = []
    for i, res in enumerate(results):
      if isinstance(res, ArenaResponse):
        final_results.append(res)
      else:
        # This catches Python crashes inside _generate_single
        combatant = active_combatants[i]
        final_results.append(
          ArenaResponse(
            provider_name=combatant["name"],
            model_identifier=combatant["id"],
            content="",
            latency_ms=0,
            error=f"Critical Client Error: {str(res)}",
          )
        )

    return final_results


# Singleton instance
llm_client = LLMArenaClient()
