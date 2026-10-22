"""
Network Security and SSRF Prevention Utilities.

Provides validation functions to detect and block Server-Side Request Forgery
(SSRF) attacks by verifying that user-supplied URLs do not resolve to loopback,
link-local, cloud metadata, IPv6 transition tunnels, or private network IP ranges.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok

_NAT64_NETWORK = ipaddress.IPv6Network("64:ff9b::/96")


def is_ip_private_or_restricted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
  """
  Checks if an IP address belongs to loopback, private, link-local, tunnel, or reserved ranges.

  Args:
      ip (ipaddress.IPv4Address | ipaddress.IPv6Address): The IPv4 or IPv6 address object.

  Returns:
      bool: True if the address is restricted or private, False otherwise.
  """
  if isinstance(ip, ipaddress.IPv6Address):
    if ip.ipv4_mapped is not None:
      return is_ip_private_or_restricted(ip.ipv4_mapped)
    if ip.sixtofour is not None:
      return is_ip_private_or_restricted(ip.sixtofour)
    if ip.teredo is not None:
      server_ip, client_ip = ip.teredo
      return is_ip_private_or_restricted(server_ip) or is_ip_private_or_restricted(client_ip)
    if ip in _NAT64_NETWORK:
      embedded_v4 = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
      return is_ip_private_or_restricted(embedded_v4)

  return bool(
    ip.is_loopback
    or ip.is_private
    or ip.is_link_local
    or ip.is_multicast
    or ip.is_reserved
    or ip.is_unspecified
    or not ip.is_global
  )


def _check_numeric_or_literal_ip(hostname: str, hostname_lower: str) -> AppResult[str | None]:
  """
  Checks if `hostname` is an IP literal, integer IP, or hex IP and validates it.

  Args:
      hostname (str): Original hostname string.
      hostname_lower (str): Lowercase hostname string.

  Returns:
      AppResult[str | None]: `Ok(canonical_ip)` if hostname is a valid safe IP literal,
          `Ok(None)` if not an IP literal, or `Err(AppError)` if it resolves to a restricted IP.
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
    return Ok(str(ip))
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
      return Ok(str(parsed_ip))
    except (ValueError, OverflowError):
      pass

  return Ok(None)


def _check_dns_resolution(hostname: str, strict_dns: bool = False) -> AppResult[str]:
  """
  Resolves `hostname` via DNS and verifies no resolved IP address is private or restricted.

  Args:
      hostname (str): Hostname to resolve.
      strict_dns (bool): When True, DNS lookup failure (`socket.gaierror`) returns `Err(SSRF_BLOCKED)`.

  Returns:
      AppResult[str]: `Ok(first_safe_ip_or_hostname)` if all resolved IPs are public,
          or `Err(AppError)` if restricted or unresolvable in strict mode.
  """
  first_safe_ip: str | None = None
  try:
    addr_info = socket.getaddrinfo(hostname, None)
    for info in addr_info:
      ip_str = str(info[4][0])
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
        if first_safe_ip is None:
          first_safe_ip = ip_str
      except ValueError:
        pass
  except socket.gaierror as exc:
    if strict_dns:
      return Err(
        AppError(
          code=ErrorCode.SSRF_BLOCKED,
          message=f"DNS resolution failed for hostname '{hostname}': {exc}",
          status_code=403,
        )
      )
    return Ok(hostname)

  if first_safe_ip is not None:
    return Ok(first_safe_ip)
  if strict_dns:
    return Err(
      AppError(
        code=ErrorCode.SSRF_BLOCKED,
        message=f"DNS resolution returned no valid public IP addresses for '{hostname}'.",
        status_code=403,
      )
    )
  return Ok(hostname)


def validate_safe_url_result(
  url: str,
  allowed_schemes: tuple[str, ...] = ("http", "https"),
  strict_dns: bool = False,
) -> AppResult[str]:
  """
  Validates a URL against SSRF and private IP ranges, returning an explicit `AppResult[str]`.

  Args:
      url (str): Target URL string to inspect.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).
      strict_dns (bool): Whether to fail closed if DNS resolution fails.

  Returns:
      AppResult[str]: `Ok(url)` if safe, or `Err(AppError)` with `ErrorCode.SSRF_BLOCKED`.
  """
  pin_res = resolve_and_pin_safe_ip_result(url, allowed_schemes=allowed_schemes, strict_dns=strict_dns)
  if isinstance(pin_res, Err):
    return pin_res
  return Ok(url)


def validate_safe_url(
  url: str | None,
  allowed_schemes: tuple[str, ...] = ("http", "https"),
  strict_dns: bool = False,
) -> tuple[bool, str | None]:
  """
  Validates a URL to prevent SSRF by ensuring it uses allowed schemes and does
  not target private, loopback, link-local, or cloud metadata endpoints.

  Args:
      url (str | None): The target URL string to inspect.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).
      strict_dns (bool): Whether to fail closed if DNS resolution fails.

  Returns:
      tuple[bool, str | None]: A tuple of `(is_safe, error_detail)`.
  """
  if not url:
    return False, "URL must be a non-empty string."
  res = validate_safe_url_result(url, allowed_schemes=allowed_schemes, strict_dns=strict_dns)
  if isinstance(res, Ok):
    return True, None
  return False, res.error.message


def resolve_and_pin_safe_ip_result(
  url: str,
  allowed_schemes: tuple[str, ...] = ("http", "https"),
  strict_dns: bool = False,
) -> AppResult[str]:
  """
  Validates a URL against SSRF rules and resolves its hostname once to a verified safe IP.

  Prevents DNS rebinding TOCTOU attacks by returning the validated IP address string
  so `SafeAsyncHTTPTransport` can pin the resolved IP on the outgoing connection.

  Args:
      url (str): Target URL string to inspect and resolve.
      allowed_schemes (tuple[str, ...]): Permitted URL schemes (defaults to http, https).
      strict_dns (bool): When True, unresolvable hostnames return `Err(SSRF_BLOCKED)`.

  Returns:
      AppResult[str]: `Ok(pinned_ip_or_host)` if safe, or `Err(AppError)` with `ErrorCode.SSRF_BLOCKED`.
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
  if ip_check.value is not None:
    return Ok(ip_check.value)

  return _check_dns_resolution(hostname, strict_dns=strict_dns)


class SafeAsyncHTTPTransport(httpx.AsyncHTTPTransport):
  """
  Custom async HTTP transport verifying every request target URL including redirects
  against SSRF and private IP restrictions to prevent TOCTOU DNS rebinding vulnerabilities.
  """

  def __init__(
    self,
    *,
    verify: bool = True,
    strict_dns: bool = False,
    pin_ip_rewrite: bool = False,
  ) -> None:
    """
    Initializes the SSRF-hardened async HTTP transport.

    Args:
        verify (bool): Whether to verify TLS certificates.
        strict_dns (bool): Whether to fail closed when DNS resolution fails.
        pin_ip_rewrite (bool): Whether to rewrite `request.url` host to the pinned IP
            while preserving the original `Host` header and TLS `sni_hostname`.
    """
    super().__init__(verify=verify)
    self._strict_dns = strict_dns
    self._pin_ip_rewrite = pin_ip_rewrite

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
    pin_res = resolve_and_pin_safe_ip_result(str(request.url), strict_dns=self._strict_dns)
    if isinstance(pin_res, Err):
      raise httpx.RequestError(f"Security restriction: {pin_res.error.message}", request=request)

    pinned_ip = pin_res.value
    original_host = request.url.host
    request.extensions["pinned_safe_ip"] = pinned_ip

    if self._pin_ip_rewrite and original_host and pinned_ip != original_host:
      if "host" not in request.headers:
        request.headers["host"] = original_host
      if request.url.scheme == "https" and "sni_hostname" not in request.extensions:
        request.extensions["sni_hostname"] = original_host.encode("ascii")
      request.url = request.url.copy_with(host=pinned_ip)

    return await super().handle_async_request(request)
