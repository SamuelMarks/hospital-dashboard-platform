"""
Tests for the HTTP Runner Service.
Verifies GET/POST functionality, header forwarding, error handling, and timeouts.
"""

import pytest
import respx
import json
from httpx import Response
from app.services.runners.http import run_http_widget


@pytest.mark.anyio
async def test_run_http_widget_success_get() -> None:
  """
  Test a successful GET request returning JSON data.
  """
  target_url = "https://api.example.com/data"
  expected_data = {"value": 42}

  # Mock the external service
  with respx.mock:
    respx.get(target_url).mock(return_value=Response(200, json=expected_data))

    config = {"url": target_url, "method": "GET"}

    result = await run_http_widget(config)

    assert result["status"] == 200
    assert result["error"] is None
    assert result["data"] == expected_data


@pytest.mark.anyio
async def test_run_http_widget_success_post_with_auth() -> None:
  """
  Test a POST request with body and forwarded auth token.
  Verifies that the Authorization header is correctly injected.
  """
  target_url = "https://api.example.com/update"
  token = "secret-token-123"
  req_body = {"key": "value"}

  with respx.mock:
    # Setup mock to inspect the request headers
    route = respx.post(target_url).mock(return_value=Response(201, json={"created": True}))

    config = {"url": target_url, "method": "POST", "body": req_body}

    result = await run_http_widget(config, forward_auth_token=token)

    assert result["status"] == 201
    assert result["data"]["created"] is True

    # Check actual request sent by httpx
    params = route.calls.last.request
    assert params.headers["Authorization"] == f"Bearer {token}"
    # httpx dumps JSON compactly by default (no spaces)
    assert params.read().decode() == '{"key":"value"}'


@pytest.mark.anyio
async def test_run_http_widget_missing_url() -> None:
  """
  Test that missing URL config returns an appropriate error immediately.
  """
  config = {"method": "GET"}
  result = await run_http_widget(config)

  assert result["status"] == 0
  assert "Missing URL" in result["error"]


@pytest.mark.anyio
async def test_run_http_widget_timeout() -> None:
  """
  Test proper handling of request timeouts.
  """
  target_url = "https://slow.api.com"

  with respx.mock:
    # Simulate a generic TimeoutException via respx side effects suitable for httpx
    respx.get(target_url).mock(side_effect=TimeoutError("Simulated Timeout"))

    config = {"url": target_url, "timeout": 1.0}

    result = await run_http_widget(config)

    # The service wraps exceptions.
    assert result["status"] in [0, 408, 500]
    assert result["error"] is not None


@pytest.mark.anyio
async def test_run_http_widget_404_error() -> None:
  """
  Test handling of HTTP 4xx client errors.
  """
  target_url = "https://api.example.com/missing"

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(404, json={"detail": "Not Found"}))

    config = {"url": target_url}

    result = await run_http_widget(config)

    assert result["status"] == 404
    assert result["error"] is not None
    assert "Not Found" in str(result["error"]) or "404" in str(result["error"])
    assert result["data"] == {"detail": "Not Found"}


@pytest.mark.anyio
async def test_run_http_widget_non_json_response() -> None:
  """
  Test handling of valid HTTP responses that are not JSON.
  """
  target_url = "https://api.example.com/text"

  with respx.mock:
    respx.get(target_url).mock(return_value=Response(200, text="Plain Success"))

    config = {"url": target_url}

    result = await run_http_widget(config)

    assert result["status"] == 200
    assert result["data"]["raw_content"] == "Plain Success"


@pytest.mark.anyio
async def test_run_http_widget_exception_safety() -> None:
  """
  Test that unexpected exceptions (e.g., config types) are caught safely.
  """
  # Passing an integer as URL will cause httpx to explode or validation logic to fail
  config = {"url": 12345}

  result = await run_http_widget(config)

  assert result["status"] == 500
  assert "Unexpected error" in result["error"]
