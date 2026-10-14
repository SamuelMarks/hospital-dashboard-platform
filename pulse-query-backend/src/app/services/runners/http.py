"""
HTTP Runner Strategy.

This module provides the logic to execute dashboard widgets configured to fetch
data from HTTP endpoints. It utilizes `httpx` for asynchronous non-blocking I/O,
essential for loading multiple widgets simultaneously on a dashboard.
"""

import logging
from typing import Any

import httpx

from app.core.network_security import SafeAsyncHTTPTransport, validate_safe_url
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.execution import HttpRunnerPayload, HttpRunnerResultDict

logger = logging.getLogger(__name__)

_shared_http_client: httpx.AsyncClient | None = None


def get_shared_http_client() -> httpx.AsyncClient:
  """
  Returns a shared, connection-pooled `httpx.AsyncClient` configured with `SafeAsyncHTTPTransport`.

  Returns:
      httpx.AsyncClient: Singleton pooled async HTTP client.
  """
  global _shared_http_client
  if _shared_http_client is None or _shared_http_client.is_closed:
    transport = SafeAsyncHTTPTransport(verify=True)
    _shared_http_client = httpx.AsyncClient(transport=transport, follow_redirects=True, timeout=10.0)
  return _shared_http_client


async def close_shared_http_client() -> None:
  """
  Closes and resets the shared `httpx.AsyncClient` connection pool if open.
  """
  global _shared_http_client
  if _shared_http_client is not None and not _shared_http_client.is_closed:
    await _shared_http_client.aclose()
  _shared_http_client = None


async def _dispatch_http_request(
  method: str,
  url: str,
  headers: dict[str, str],
  query_params: dict[str, str],
  json_body: dict[str, Any] | None,
  timeout_sec: float,
  client: httpx.AsyncClient | None = None,
) -> httpx.Response:
  """
  Dispatches an HTTP request using either a provided pooled `httpx.AsyncClient` or a scoped `SafeAsyncHTTPTransport`.

  Args:
      method (str): HTTP verb.
      url (str): Target URL.
      headers (dict[str, str]): Request headers.
      query_params (dict[str, str]): URL query parameters.
      json_body (dict[str, Any] | None): Optional JSON body payload.
      timeout_sec (float): Request timeout in seconds.
      client (httpx.AsyncClient | None): Optional pooled client instance.

  Returns:
      httpx.Response: Raw HTTP response.
  """
  if client is not None:
    return await client.request(
      method=method,
      url=url,
      headers=headers,
      params=query_params,
      json=json_body,
      timeout=timeout_sec,
    )

  transport = SafeAsyncHTTPTransport(verify=True)
  async with httpx.AsyncClient(transport=transport, follow_redirects=True, timeout=timeout_sec) as scoped_client:
    logger.debug(f"Executing HTTP Widget: {method} {url}")
    return await scoped_client.request(
      method=method,
      url=url,
      headers=headers,
      params=query_params,
      json=json_body,
    )


async def execute_http_result(
  config: dict[str, Any],
  forward_auth_token: str | None = None,
  client: httpx.AsyncClient | None = None,
) -> AppResult[HttpRunnerPayload]:
  """
  Executes an HTTP widget request and returns an explicit `AppResult[HttpRunnerPayload]`.

  Args:
      config (dict[str, Any]): Widget configuration dictionary (`url`, `method`, `headers`, `params`, `body`, `timeout`).
      forward_auth_token (str | None): Optional bearer token to forward when `Authorization` is not set.
      client (httpx.AsyncClient | None): Optional pre-configured/pooled `httpx.AsyncClient`.

  Returns:
      AppResult[HttpRunnerPayload]: `Ok(HttpRunnerPayload)` on 2xx response, or `Err(AppError)` with status/details.
  """
  url: Any = config.get("url", "")
  method: str = str(config.get("method", "GET")).upper()
  headers: dict[str, str] = dict(config.get("headers", {}))
  query_params: dict[str, str] = config.get("params", {})
  json_body: dict[str, Any] | None = config.get("body")
  timeout_sec: float = float(config.get("timeout", 10.0))

  if not url:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Missing URL in widget configuration.",
        status_code=0,
      )
    )

  if isinstance(url, str):
    is_safe, error_detail = validate_safe_url(url)
    if not is_safe:
      logger.warning(f"Blocked SSRF attempt to unsafe URL: {url} ({error_detail})")
      return Err(
        AppError(
          code=ErrorCode.SSRF_BLOCKED,
          message=f"Security restriction: {error_detail}",
          status_code=403,
        )
      )

  if forward_auth_token and "Authorization" not in headers:
    headers["Authorization"] = f"Bearer {forward_auth_token}"

  try:
    response = await _dispatch_http_request(
      method=method,
      url=url,
      headers=headers,
      query_params=query_params,
      json_body=json_body,
      timeout_sec=timeout_sec,
      client=client,
    )
    response.raise_for_status()

    try:
      data = response.json()
    except ValueError:
      data = {"raw_content": response.text}

    return Ok(HttpRunnerPayload(data=data, status=response.status_code))

  except httpx.TimeoutException:
    error_msg = f"Request timed out after {timeout_sec} seconds."
    logger.warning(f"HTTP Widget Timeout: {url}")
    return Err(
      AppError(
        code=ErrorCode.HTTP_EXECUTION_ERROR,
        message=error_msg,
        status_code=408,
      )
    )

  except httpx.HTTPStatusError as e:
    error_msg = f"HTTP Error {e.response.status_code}: {e.response.reason_phrase}"
    logger.error(f"HTTP Widget Status Error: {url} - {error_msg}")
    return Err(
      AppError(
        code=ErrorCode.HTTP_EXECUTION_ERROR,
        message=error_msg,
        status_code=e.response.status_code,
        details={"response_text": e.response.text},
      )
    )

  except httpx.RequestError as e:
    error_msg = f"Connection error: {e!s}"
    logger.error(f"HTTP Widget Connection Error: {url} - {error_msg}")
    return Err(
      AppError(
        code=ErrorCode.HTTP_EXECUTION_ERROR,
        message=error_msg,
        status_code=0,
      )
    )

  except Exception as e:
    error_msg = f"Unexpected error: {e!s}"
    logger.exception(f"HTTP Widget Validation Error: {url}")
    return Err(
      AppError(
        code=ErrorCode.INTERNAL_ERROR,
        message=error_msg,
        status_code=500,
      )
    )


async def run_http_widget(
  config: dict[str, Any],
  forward_auth_token: str | None = None,
  client: httpx.AsyncClient | None = None,
) -> HttpRunnerResultDict:
  """
  Executes an HTTP request based on the provided widget configuration.

  Args:
      config (dict[str, Any]): The configuration dictionary for the widget.
          Expected keys:
          - url (str): The target endpoint.
          - method (str, optional): HTTP method (GET, POST, etc.). Defaults to 'GET'.
          - headers (dict[str, str], optional): Custom headers.
          - params (dict[str, str], optional): Query parameters.
          - body (dict[str, Any], optional): JSON body for POST/PUT requests.
          - timeout (float, optional): Request timeout in seconds. Defaults to 10.0.
      forward_auth_token (str | None): If provided, adds an 'Authorization'
          header with this token value to the request. This is useful for
          calling internal protected services acting on behalf of the user.
      client (httpx.AsyncClient | None): Optional pooled `httpx.AsyncClient` to reuse.

  Returns:
      HttpRunnerResultDict: A dictionary containing the result of the operation.
  """
  res = await execute_http_result(config, forward_auth_token=forward_auth_token, client=client)
  if isinstance(res, Ok):
    return {"data": res.value.data, "status": res.value.status, "error": None}

  error_data: Any = None
  raw_body = res.error.details.get("response_text")
  if raw_body is not None:
    import json

    try:
      error_data = json.loads(raw_body)
    except ValueError:
      error_data = None

  return {"data": error_data, "status": res.error.status_code, "error": res.error.message}
