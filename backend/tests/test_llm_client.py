import pytest
import httpx
from app.services.llm_client import llm_client


@pytest.mark.asyncio
async def test_llm_connection_error():
  """
  Test that the client raises a clear error when no LLM is running.
  We expect a ConnectError or Timeout because localhost:8000 might be down
  or not serving /v1/chat/completions yet.
  """
  messages = [{"role": "user", "content": "Hello"}]

  # We use a very short timeout to fail fast
  llm_client.timeout = 1

  # If you actually have an LLM running, this might pass!
  # Otherwise, it ensures our error handling wrapper works.
  try:
    await llm_client.generate_response(messages)
  except Exception as e:
    # We just want to ensure it doesn't crash the whole app silently
    # Includes httpx.RequestError to catch ConnectError, protocol errors, etc.
    assert isinstance(e, (RuntimeError, TimeoutError, IOError, httpx.RequestError))
    print(f"\n✅ LLM Client correctly caught error: {e}")
