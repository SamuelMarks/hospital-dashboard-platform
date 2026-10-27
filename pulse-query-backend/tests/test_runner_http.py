"""
Tests for the HTTP Runner Service.
Verifies GET/POST functionality, header forwarding, error handling, and timeouts.
"""

import httpx
import pytest
import respx
from httpx import Response

from app.services.runners.http import close_shared_http_client, get_shared_http_client, run_http_widget


@pytest.mark.asyncio
async def test_run_http_widget_success_get() -> None:
  """Test a successful GET request returning JSON data."""
  target_url = "https://api.example.com/data"
  expected_data = {"value": 42}

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(200, json=expected_data))
    config = {"url": target_url, "method": "GET"}
    result = await run_http_widget(config)

    assert result["status"] == 200
    assert result["error"] is None
    assert result["data"] == expected_data


@pytest.mark.asyncio
async def test_run_http_widget_post_with_auth() -> None:
  """Test a POST request with JSON body and Auth Token forwarding."""
  from app.schemas.json_types import JsonObject

  target_url = "https://api.example.com/update"
  token = "secret-token-123"
  req_body: JsonObject = {"key": "value"}

  with respx.mock:
    route = respx.post(target_url).mock(return_value=Response(201, json={"created": True}))
    config: JsonObject = {"url": target_url, "method": "POST", "body": req_body}
    result = await run_http_widget(config, forward_auth_token=token)

    assert result["status"] == 201
    assert isinstance(result["data"], dict)
    assert result["data"]["created"] is True

    params = route.calls.last.request
    assert params.headers["Authorization"] == f"Bearer {token}"
    assert params.read().decode() == '{"key":"value"}'


@pytest.mark.asyncio
async def test_run_http_widget_missing_url() -> None:
  """Test that missing URL config returns an appropriate error immediately."""
  config = {"method": "GET"}
  result = await run_http_widget(config)

  assert result["status"] == 0
  assert result["error"] is not None
  assert "Missing URL" in result["error"]


@pytest.mark.asyncio
async def test_run_http_widget_timeout() -> None:
  """Test proper handling of generic runtime exceptions raised during dispatch."""
  target_url = "https://slow.api.com"

  with respx.mock:
    from app.schemas.json_types import JsonObject

    respx.get(target_url).mock(side_effect=TimeoutError("Simulated Timeout"))
    config: JsonObject = {"url": target_url, "timeout": 1.0}
    result = await run_http_widget(config)

    assert result["status"] in [0, 408, 500]
    assert result["error"] is not None


@pytest.mark.asyncio
async def test_run_http_widget_404_error() -> None:
  """Test handling of HTTP 4xx client errors."""
  target_url = "https://api.example.com/missing"

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(404, json={"detail": "Not Found"}))
    config = {"url": target_url}
    result = await run_http_widget(config)

    assert result["status"] == 404
    assert result["error"] is not None
    assert "Not Found" in str(result["error"]) or "404" in str(result["error"])
    assert result["data"] == {"detail": "Not Found"}


@pytest.mark.asyncio
async def test_run_http_widget_non_json_response() -> None:
  """Test handling of valid HTTP responses that are not JSON."""
  target_url = "https://api.example.com/text"

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(200, text="Plain Success"))
    config = {"url": target_url}
    result = await run_http_widget(config)

    assert result["status"] == 200
    assert isinstance(result["data"], dict)
    assert result["data"]["raw_content"] == "Plain Success"


@pytest.mark.asyncio
async def test_run_http_widget_exception_safety() -> None:
  """Test that unexpected non-string URL types or dispatch exceptions are caught safely."""
  from app.schemas.json_types import JsonObject

  config: JsonObject = {"url": 12345}
  result = await run_http_widget(config)

  assert result["status"] == 500
  assert result["error"] is not None
  assert "Unexpected error" in result["error"]


@pytest.mark.asyncio
async def test_run_http_widget_timeout_exception() -> None:
  """Ensure `httpx.TimeoutException` is mapped to a 408 response."""
  target_url = "https://api.example.com/slow"

  with respx.mock:
    req = httpx.Request("GET", target_url)
    respx.get(target_url).mock(side_effect=httpx.TimeoutException("timeout", request=req))
    result = await run_http_widget({"url": target_url, "timeout": 0.01})

    assert result["status"] == 408
    assert result["error"] is not None
    assert "timed out" in result["error"].lower()


@pytest.mark.asyncio
async def test_run_http_widget_connection_error() -> None:
  """Ensure request errors are surfaced as connection errors."""
  target_url = "https://api.example.com/down"

  with respx.mock:
    req = httpx.Request("GET", target_url)
    respx.get(target_url).mock(side_effect=httpx.RequestError("boom", request=req))
    result = await run_http_widget({"url": target_url})

    assert result["status"] == 0
    assert result["error"] is not None
    assert "Connection error" in result["error"]


@pytest.mark.asyncio
async def test_run_http_widget_respects_existing_auth_header() -> None:
  """Ensure an explicit Authorization header is not overwritten."""
  target_url = "https://api.example.com/secure"

  with respx.mock:
    from app.schemas.json_types import JsonObject

    route = respx.get(target_url).mock(return_value=Response(200, json={"ok": True}))
    config: JsonObject = {"url": target_url, "headers": {"Authorization": "Bearer existing"}}
    result = await run_http_widget(config, forward_auth_token="new-token")

    assert result["status"] == 200
    assert route.calls.last.request.headers["Authorization"] == "Bearer existing"


@pytest.mark.asyncio
async def test_run_http_widget_status_error_with_text_body() -> None:
  """Ensure non-JSON error bodies are handled safely."""
  target_url = "https://api.example.com/fail"

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(500, text="server down"))
    result = await run_http_widget({"url": target_url})

    assert result["status"] == 500
    assert result["data"] is None


@pytest.mark.asyncio
async def test_shared_http_client_pooling_and_reuse() -> None:
  """Verifies `get_shared_http_client` reuses a pooled client and `close_shared_http_client` closes it."""
  await close_shared_http_client()
  c1 = get_shared_http_client()
  c2 = get_shared_http_client()
  assert c1 is c2
  assert not c1.is_closed

  target_url = "https://api.example.com/pooled"
  with respx.mock:
    respx.get(target_url).mock(return_value=Response(200, json={"pooled": True}))
    res = await run_http_widget({"url": target_url}, client=c1)
    assert res["status"] == 200
    assert res["data"] == {"pooled": True}

  await close_shared_http_client()
  assert c1.is_closed
  await close_shared_http_client()
