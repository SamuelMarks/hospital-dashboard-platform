"""
HTTP Runner Strategy.

This module provides the logic to execute dashboard widgets configured to fetch
data from HTTP endpoints. It utilizes `httpx` for asynchronous non-blocking I/O,
essential for loading multiple widgets simultaneously on a dashboard.
"""

import httpx
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


async def run_http_widget(config: Dict[str, Any], forward_auth_token: Optional[str] = None) -> Dict[str, Any]:
  """
  Executes an HTTP request based on the provided widget configuration.

  Args:
      config (Dict[str, Any]): The configuration dictionary for the widget.
          Expected keys:
          - url (str): The target endpoint.
          - method (str, optional): HTTP method (GET, POST, etc.). Defaults to 'GET'.
          - headers (Dict[str, str], optional): Custom headers.
          - params (Dict[str, str], optional): Query parameters.
          - body (Dict[str, Any], optional): JSON body for POST/PUT requests.
          - timeout (float, optional): Request timeout in seconds. Defaults to 10.0.
      forward_auth_token (Optional[str]): If provided, adds an 'Authorization'
          header with this token value to the request. This is useful for
          calling internal protected services acting on behalf of the user.

  Returns:
      Dict[str, Any]: A dictionary containing the result of the operation.
          Structure:
          {
              "data": Any,       # The parsed JSON response from the API
              "status": int,     # HTTP status code
              "error": str|None  # Error message if the request failed
          }
  """
  url: str = config.get("url", "")
  method: str = config.get("method", "GET").upper()
  headers: Dict[str, str] = config.get("headers", {})
  query_params: Dict[str, str] = config.get("params", {})
  json_body: Optional[Dict[str, Any]] = config.get("body")
  timeout_sec: float = config.get("timeout", 10.0)

  # Basic validation
  if not url:
    return {"data": None, "status": 0, "error": "Missing URL in widget configuration."}

  # Inject Authorization header if a token is explicitly passed for forwarding
  if forward_auth_token:
    # Avoid overwriting if explicitly set in config, otherwise add it
    if "Authorization" not in headers:
      headers["Authorization"] = f"Bearer {forward_auth_token}"

  try:
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
      logger.debug(f"Executing HTTP Widget: {method} {url}")

      response = await client.request(method=method, url=url, headers=headers, params=query_params, json=json_body)

      # Raise exception for 4xx/5xx responses to catch in the block below
      response.raise_for_status()

      # Attempt to parse JSON, fall back to text if not JSON
      try:
        data = response.json()
      except ValueError:
        data = {"raw_content": response.text}

      return {"data": data, "status": response.status_code, "error": None}

  except httpx.TimeoutException:
    error_msg = f"Request timed out after {timeout_sec} seconds."
    logger.warning(f"HTTP Widget Timeout: {url}")
    return {
      "data": None,
      "status": 408,  # Request Timeout
      "error": error_msg,
    }

  except httpx.HTTPStatusError as e:
    error_msg = f"HTTP Error {e.response.status_code}: {e.response.reason_phrase}"
    logger.error(f"HTTP Widget Status Error: {url} - {error_msg}")
    # Try to return the error body if available
    try:
      error_data = e.response.json()
    except ValueError:
      error_data = None

    return {"data": error_data, "status": e.response.status_code, "error": error_msg}

  except httpx.RequestError as e:
    error_msg = f"Connection error: {str(e)}"
    logger.error(f"HTTP Widget Connection Error: {url} - {error_msg}")
    return {"data": None, "status": 0, "error": error_msg}

  except Exception as e:
    error_msg = f"Unexpected error: {str(e)}"
    logger.exception(f"HTTP Widget Validation Error: {url}")
    return {"data": None, "status": 500, "error": error_msg}
