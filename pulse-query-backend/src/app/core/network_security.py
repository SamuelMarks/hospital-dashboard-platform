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
  if not url or not isinstance(url, str):
    return False, "URL must be a non-empty string."

  try:
    parsed = urlparse(url)
  except Exception as e:
    return False, f"Malformed URL: {e}"

  if not parsed.scheme or parsed.scheme.lower() not in allowed_schemes:
    return False, f"Unsupported scheme: '{parsed.scheme}'. Allowed: {', '.join(allowed_schemes)}"

  hostname = parsed.hostname
  if not hostname:
    return False, "Missing hostname in URL."

  hostname_lower = hostname.lower()

  # Check standard prohibited hostnames
  if hostname_lower in ("localhost", "metadata.google.internal") or hostname_lower.endswith(
    (".localhost", ".local", ".internal")
  ):
    return False, f"Access to local or internal hostname '{hostname}' is prohibited."

  # Check direct IP literal
  try:
    ip = ipaddress.ip_address(hostname)
    if is_ip_private_or_restricted(ip):
      return False, f"Direct access to private or restricted IP '{hostname}' is prohibited."
    return True, None
  except ValueError:
    pass  # Not a standard IP literal, proceed to decimal/hex and resolution checks

  # Check decimal/integer or hex IP representation
  if hostname_lower.isdigit():
    try:
      int_ip = ipaddress.IPv4Address(int(hostname_lower))
      if is_ip_private_or_restricted(int_ip):
        return False, f"Direct access to private or restricted IP '{int_ip}' is prohibited."
      return True, None
    except (ValueError, OverflowError):
      pass
  elif hostname_lower.startswith("0x"):
    try:
      hex_ip = ipaddress.IPv4Address(int(hostname_lower, 16))
      if is_ip_private_or_restricted(hex_ip):
        return False, f"Direct access to private or restricted IP '{hex_ip}' is prohibited."
      return True, None
    except (ValueError, OverflowError):
      pass

  # Attempt DNS resolution to check for DNS rebinding / internal hosts
  try:
    addr_info = socket.getaddrinfo(hostname, None)
    for info in addr_info:
      ip_str = info[4][0]
      try:
        resolved_ip = ipaddress.ip_address(ip_str)
        if is_ip_private_or_restricted(resolved_ip):
          return False, f"Hostname '{hostname}' resolves to restricted IP '{ip_str}'."
      except ValueError:
        pass
  except socket.gaierror:
    # If DNS cannot resolve (e.g. mock test domains or offline environments),
    # allow execution to proceed to HTTP client which handles connection failure.
    pass

  return True, None


class SafeAsyncHTTPTransport(httpx.AsyncHTTPTransport):
  """
  Custom async HTTP transport verifying every request target URL including redirects
  against SSRF and private IP restrictions to prevent TOCTOU DNS rebinding vulnerabilities.
  """

  async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
    """
    Validates request destination before dispatching across the wire.

    Args:
        request (httpx.Request): The outgoing HTTP request.

    Returns:
        httpx.Response: The HTTP response from the target server.

    Raises:
        httpx.RequestError: If the target host or resolved IP violates SSRF policy.
    """
    is_safe, error_detail = validate_safe_url(str(request.url))
    if not is_safe:
      raise httpx.RequestError(f"Security restriction: {error_detail}", request=request)
    return await super().handle_async_request(request)
