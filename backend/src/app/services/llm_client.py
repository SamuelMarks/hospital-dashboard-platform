import httpx
import logging
import json
from typing import List, Dict, Optional, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


# Standard OpenAI-compatible Chat format
class LLMClient:
  def __init__(self, timeout: int = 60):
    self.base_url = settings.LLM_API_URL
    self.api_key = "EMPTY"  # Local LLMs usually don't require a key, but some SDKs expect something
    self.timeout = timeout

  async def generate_response(
    self,
    messages: List[Dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: Optional[List[str]] = None,
  ) -> str:
    """
    Sends a chat completion request to the local LLM.

    Args:
        messages: List of {"role": "system|user", "content": "..."}
        temperature: 0.0 for deterministic SQL generation.
        max_tokens: Limit output length.
        stop: List of stop sequences (e.g., [";"] for SQL).
    """
    payload = {
      "model": "local-model",  # Often ignored by local servers, but required by schema
      "messages": messages,
      "temperature": temperature,
      "max_tokens": max_tokens,
      "stream": False,
    }

    if stop:
      payload["stop"] = stop

    endpoint = f"{self.base_url}/chat/completions"

    async with httpx.AsyncClient(timeout=self.timeout) as client:
      try:
        logger.info(f"Sending LLM request to {endpoint}")
        response = await client.post(endpoint, json=payload, headers={"Authorization": f"Bearer {self.api_key}"})
        response.raise_for_status()

        data = response.json()

        # Extract content from OpenAI-compatible response structure
        try:
          content = data["choices"][0]["message"]["content"]
          return content.strip()
        except (KeyError, IndexError):
          logger.error(f"Unexpected LLM response format: {data}")
          raise ValueError("Invalid response format from LLM provider")

      except httpx.TimeoutException:
        logger.error("LLM Request Timed Out")
        raise TimeoutError("The AI model took too long to respond.")
      except httpx.HTTPStatusError as e:
        logger.error(f"LLM HTTP Error: {e.response.text}")
        raise RuntimeError(f"LLM Provider Error: {e.response.status_code}")
      except Exception as e:
        logger.error(f"LLM Client Error: {e}")
        raise e


# specific singleton or dependency can be created if needed
llm_client = LLMClient()
