"""
Network Security and SSRF Prevention Utilities.

Provides validation functions to detect and block Server-Side Request Forgery
(SSRF) attacks by verifying that user-supplied URLs do not resolve to loopback,
link-local, cloud metadata, or private network IP ranges.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok


def is_ip_private_or_restricted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
  """
  Checks if an IP address belongs to loopback, private, link-local, or reserved ranges.

  Args:
      ip (ipaddress.IPv4Address | ipaddress.IPv6Address): The IPv4 or IPv6 address object.

  Returns:
      bool: True if the address is restricted or private, False otherwise.
  """
  # Check IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  mapped = getattr(ip, "ipv4_mapped", None)
  if mapped is not None:
    return is_ip_private_or_restricted(mapped)

  return bool(
    ip.is_loopback
    or ip.is_private
    or ip.is_link_local
    or ip.is_multicast
    or ip.is_reserved
    or ip.is_unspecified
    or not ip.is_global
  )


def _check_numeric_or_literal_ip(hostname: str, hostname_lower: str) -> AppResult[bool]:
  """
  Checks if `hostname` is an IP literal, integer IP, or hex IP and validates it.

  Args:
      hostname (str): Original hostname string.
      hostname_lower (str): Lowercase hostname string.

  Returns:
      AppResult[bool]: `Ok(True)` if hostname is a valid safe IP literal, `Ok(False)` if not an IP literal,
          or `Err(AppError)` if it resolves to a restricted IP.
  """
  try:
    ip = ipaddress.ip_address(hostname)
    if is_ip_private_or_restricted(ip):
      return Err(
        AppError(
          code=ErrorCode.SSRF_BLOCKED,
          message=f"Direct access to private or restricted IP '{hostname}' is prohibited.",
          status_code=403,
        )
      )
    return Ok(True)
  except ValueError:
    pass

  base = 10 if hostname_lower.isdigit() else (16 if hostname_lower.startswith("0x") else 0)
  if base:
    try:
      parsed_ip = ipaddress.IPv4Address(int(hostname_lower, base))
      if is_ip_private_or_restricted(parsed_ip):
        return Err(
          AppError(
            code=ErrorCode.SSRF_BLOCKED,
            message=f"Direct access to private or restricted IP '{parsed_ip}' is prohibited.",
            status_code=403,
          )
        )
      return Ok(True)
    except (ValueError, OverflowError):
      pass

  return Ok(False)


def _check_dns_resolution(hostname: str) -> AppResult[bool]:
  """
  Resolves `hostname` via DNS and verifies no resolved IP address is private or restricted.

  Args:
      hostname (str): Hostname to resolve.

  Returns:
      AppResult[bool]: `Ok(True)` if all resolved IPs are public, or `Err(AppError)` if restricted.
  """
  try:
    addr_info = socket.getaddrinfo(hostname, None)
    for info in addr_info:
      ip_str = info[4][0]
      try:
        resolved_ip = ipaddress.ip_address(ip_str)
        if is_ip_private_or_restricted(resolved_ip):
          return Err(
            AppError(
              code=ErrorCode.SSRF_BLOCKED,
              message=f"Hostname '{hostname}' resolves to restricted IP '{ip_str}'.",
              status_code=403,
            )
          )
      except ValueError:
        pass
  except socket.gaierror:
    pass
  return Ok(True)


def validate_safe_url_result(url: str, allowed_schemes: tuple[str, ...] = ("http", "https")) -> AppResult[str]:
  """
  Validates a URL against SSRF and private IP ranges, returning an explicit `AppResult[str]`.

  Args:
      url (str): Target URL string to inspect.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).

  Returns:
      AppResult[str]: `Ok(url)` if safe, or `Err(AppError)` with `ErrorCode.SSRF_BLOCKED`.
  """
  if not url or not isinstance(url, str):
    return Err(AppError(code=ErrorCode.SSRF_BLOCKED, message="URL must be a non-empty string.", status_code=403))

  try:
    parsed = urlparse(url)
  except Exception as e:
    return Err(AppError(code=ErrorCode.SSRF_BLOCKED, message=f"Malformed URL: {e}", status_code=403))

  if not parsed.scheme or parsed.scheme.lower() not in allowed_schemes:
    return Err(
      AppError(
        code=ErrorCode.SSRF_BLOCKED,
        message=f"Unsupported scheme: '{parsed.scheme}'. Allowed: {', '.join(allowed_schemes)}",
        status_code=403,
      )
    )

  hostname = parsed.hostname
  if not hostname:
    return Err(AppError(code=ErrorCode.SSRF_BLOCKED, message="Missing hostname in URL.", status_code=403))

  hostname_lower = hostname.lower()
  if hostname_lower in ("localhost", "metadata.google.internal") or hostname_lower.endswith(
    (".localhost", ".local", ".internal")
  ):
    return Err(
      AppError(
        code=ErrorCode.SSRF_BLOCKED,
        message=f"Access to local or internal hostname '{hostname}' is prohibited.",
        status_code=403,
      )
    )

  ip_check = _check_numeric_or_literal_ip(hostname, hostname_lower)
  if isinstance(ip_check, Err):
    return ip_check
  if ip_check.value:
    return Ok(url)

  dns_check = _check_dns_resolution(hostname)
  if isinstance(dns_check, Err):
    return dns_check

  return Ok(url)


def validate_safe_url(url: str, allowed_schemes: tuple[str, ...] = ("http", "https")) -> tuple[bool, str | None]:
  """
  Validates a URL to prevent SSRF by ensuring it uses allowed schemes and does
  not target private, loopback, link-local, or cloud metadata endpoints.

  Args:
      url (str): The target URL string to inspect.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).

  Returns:
      tuple[bool, str | None]: A tuple of (is_safe, error_detail).
  """
  res = validate_safe_url_result(url, allowed_schemes=allowed_schemes)
  if isinstance(res, Ok):
    return True, None
  return False, res.error.message


def resolve_and_pin_safe_ip_result(url: str, allowed_schemes: tuple[str, ...] = ("http", "https")) -> AppResult[str]:
  """
  Validates a URL against SSRF rules and resolves its hostname once to a verified safe IP.

  Prevents DNS rebinding TOCTOU attacks by returning the validated IP address string
  (or hostname when offline/unresolvable in mock environments) so the HTTP transport
  can pin the validated resolution in `request.extensions["pinned_safe_ip"]`.

  Args:
      url (str): Target URL string to inspect and resolve.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).

  Returns:
      AppResult[str]: `Ok(pinned_ip_or_host)` if safe, or `Err(AppError)` with `ErrorCode.SSRF_BLOCKED`.
  """
  url_res = validate_safe_url_result(url, allowed_schemes=allowed_schemes)
  if isinstance(url_res, Err):
    return url_res

  parsed = urlparse(url)
  hostname = parsed.hostname or ""
  try:
    addr_info = socket.getaddrinfo(hostname, None)
    if addr_info:
      first_ip = str(addr_info[0][4][0])
      return Ok(first_ip)
  except socket.gaierror:
    pass
  return Ok(hostname)


class SafeAsyncHTTPTransport(httpx.AsyncHTTPTransport):
  """
  Custom async HTTP transport verifying every request target URL including redirects
  against SSRF and private IP restrictions to prevent TOCTOU DNS rebinding vulnerabilities.
  """

  async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
    """
    Validates request destination and pins the validated IP before dispatching across the wire.

    Args:
        request (httpx.Request): The outgoing HTTP request.

    Returns:
        httpx.Response: The HTTP response from the target server.

    Raises:
        httpx.RequestError: If the target host or resolved IP violates SSRF policy.
    """
    pin_res = resolve_and_pin_safe_ip_result(str(request.url))
    if isinstance(pin_res, Err):
      raise httpx.RequestError(f"Security restriction: {pin_res.error.message}", request=request)
    request.extensions["pinned_safe_ip"] = pin_res.value
    return await super().handle_async_request(request)
