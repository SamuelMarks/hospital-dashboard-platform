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
        client = AnyLLM.create(
          config["provider"],
          model=config["model"],
          api_key=config.get("api_key"),
          api_base=api_base,  # Only used for local/custom endpoints
          timeout=timeout,
        )

        self.swarm.append(
          {
            "client": client,
            "name": config["name"],  # Display Name
            "id": f"{config['provider']}/{config['model']}",  # Tracking ID
          }
        )
        logger.info(f"Registered Arena Combatant: {config['name']} ({config['model']})")

      except Exception as e:
        logger.error(f"Failed to initialize LLM provider {config.get('name')}: {e}")

  async def _generate_single(
    self,
    combatant: Dict[str, Any],
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    stop: Optional[List[str]],
  ) -> ArenaResponse:
    """
    Internal wrapper to execute a request against a single provider
    and measure its latency.
    """
    client = combatant["client"]
    name = combatant["name"]
    model_id = combatant["id"]

    start_time = time.time()

    try:
      # Offload blocking IO to threadpool to keep asyncio loop healthy
      response = await run_in_threadpool(
        client.completion, messages=messages, temperature=temperature, max_tokens=max_tokens, stop=stop
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
  ) -> List[ArenaResponse]:
    """
    The Main Event: Broadcasts the prompt to all configured LLMs concurrently.

    Args:
        messages: OpenAI-format history.
        temperature: Determinism factor.
        max_tokens: Length limit.
        stop: Stop sequences (crucial for SQL generation).

    Returns:
        List[ArenaResponse]: A list of results from every active model, including errors.
    """
    if not self.swarm:
      raise RuntimeError("No LLM providers are configured in the Arena.")

    # Create tasks for all providers
    tasks = [self._generate_single(combatant, messages, temperature, max_tokens, stop) for combatant in self.swarm]

    # Run all tasks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out unhandled coroutine exceptions (re-wrapping them as ArenaResponse errors)
    final_results = []
    for i, res in enumerate(results):
      if isinstance(res, ArenaResponse):
        final_results.append(res)
      else:
        # This catches Python crashes inside _generate_single
        combatant = self.swarm[i]
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
