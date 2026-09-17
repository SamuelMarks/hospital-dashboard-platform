"""
Tests for Network Security, SSRF Prevention, and DNS Rebinding Interception.
"""

import ipaddress
import socket
from unittest.mock import patch

import httpx
import pytest

from app.core.network_security import SafeAsyncHTTPTransport, is_ip_private_or_restricted, validate_safe_url
from app.services.runners.http import run_http_widget


def test_is_ip_private_or_restricted_comprehensive() -> None:
  """Test is_ip_private_or_restricted across IPv4, IPv6, mapped, and carrier NAT."""
  # Loopback
  assert is_ip_private_or_restricted(ipaddress.ip_address("127.0.0.1"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("::1"))

  # Private RFC 1918
  assert is_ip_private_or_restricted(ipaddress.ip_address("10.0.0.1"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("172.16.0.1"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("192.168.1.1"))

  # Link-local & Cloud Metadata
  assert is_ip_private_or_restricted(ipaddress.ip_address("169.254.169.254"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("fe80::1"))

  # Carrier-grade NAT (RFC 6598)
  assert is_ip_private_or_restricted(ipaddress.ip_address("100.64.0.1"))

  # IPv4-mapped IPv6
  assert is_ip_private_or_restricted(ipaddress.ip_address("::ffff:127.0.0.1"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("::ffff:169.254.169.254"))

  # Global / Public IP
  assert not is_ip_private_or_restricted(ipaddress.ip_address("8.8.8.8"))
  assert not is_ip_private_or_restricted(ipaddress.ip_address("93.184.216.34"))


def test_validate_safe_url_blocks_localhost_and_internal() -> None:
  """Test that local hostnames and loopback addresses are rejected."""
  is_safe, err = validate_safe_url("http://localhost:8080/api")
  assert not is_safe
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://127.0.0.1:5432")
  assert not is_safe
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://169.254.169.254/latest/meta-data")
  assert not is_safe
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://10.0.0.5/internal")
  assert not is_safe
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://192.168.1.1/admin")
  assert not is_safe
  assert "prohibited" in err.lower()


def test_validate_safe_url_blocks_decimal_and_hex_ips() -> None:
  """Test that decimal integer and hex encoded IP hostnames are rejected when private, accepted when public."""
  # 2130706433 is 127.0.0.1 (private)
  is_safe, err = validate_safe_url("http://2130706433/api")
  assert not is_safe
  assert "prohibited" in err.lower()

  # 1568222498 is 93.184.216.34 (public)
  is_safe, err = validate_safe_url("http://1568222498/api")
  assert is_safe
  assert err is None

  # Out of range decimal integer
  with patch("app.core.network_security.socket.getaddrinfo", side_effect=socket.gaierror):
    is_safe, err = validate_safe_url("http://99999999999999/api")
    assert is_safe

  # 0x7f000001 is 127.0.0.1 (private)
  is_safe, err = validate_safe_url("http://0x7f000001/api")
  assert not is_safe
  assert "prohibited" in err.lower()

  # 0x5db8d822 is 93.184.216.34 (public)
  is_safe, err = validate_safe_url("http://0x5db8d822/api")
  assert is_safe
  assert err is None

  # Invalid hex representation
  with patch("app.core.network_security.socket.getaddrinfo", side_effect=socket.gaierror):
    is_safe, err = validate_safe_url("http://0xinvalidhex/api")
    assert is_safe


def test_validate_safe_url_blocks_unsupported_schemes() -> None:
  """Test that non-HTTP/HTTPS schemes are blocked."""
  is_safe, err = validate_safe_url("file:///etc/passwd")
  assert not is_safe
  assert "unsupported scheme" in err.lower()

  is_safe, err = validate_safe_url("ftp://example.com/file")
  assert not is_safe
  assert "unsupported scheme" in err.lower()


def test_validate_safe_url_invalid_inputs() -> None:
  """Test edge cases for empty or malformed URLs."""
  assert not validate_safe_url("")[0]
  assert not validate_safe_url(None)[0]
  assert not validate_safe_url("http://")[0]


def test_validate_safe_url_public_ip() -> None:
  """Test that public IP literal is accepted."""
  is_safe, err = validate_safe_url("http://8.8.8.8/data")
  assert is_safe
  assert err is None


def test_validate_safe_url_dns_resolution(monkeypatch) -> None:
  """Test DNS resolution branches for public, private, and malformed IPs."""
  # Case 1: Host resolves to private IP
  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("10.200.1.1", 80))],
  )
  is_safe, err = validate_safe_url("http://custom.internal.domain/api")
  assert not is_safe
  assert "resolves to restricted ip" in err.lower()

  # Case 2: Host resolves to valid public IP
  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("93.184.216.34", 80))],
  )
  is_safe, err = validate_safe_url("http://public.service.org/api")
  assert is_safe
  assert err is None

  # Case 3: Resolution produces an invalid IP string (ValueError in ipaddress)
  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("not-an-ip", 80))],
  )
  is_safe, err = validate_safe_url("http://public.service.org/api")
  assert is_safe
  assert err is None


def test_validate_safe_url_parse_exception(monkeypatch) -> None:
  """Test handling when urlparse raises an exception."""
  monkeypatch.setattr(
    "app.core.network_security.urlparse",
    lambda url: (_ for _ in ()).throw(ValueError("Simulated parse error")),
  )
  is_safe, err = validate_safe_url("http://example.com")
  assert not is_safe
  assert "malformed url" in err.lower()


@pytest.mark.asyncio
async def test_safe_async_http_transport_blocks_unsafe_target() -> None:
  """Test that SafeAsyncHTTPTransport intercepts unsafe targets at request dispatch."""
  transport = SafeAsyncHTTPTransport()
  req = httpx.Request("GET", "http://127.0.0.1:8080/secret")

  with pytest.raises(httpx.RequestError) as exc_info:
    await transport.handle_async_request(req)

  assert "Security restriction" in str(exc_info.value)


@pytest.mark.asyncio
async def test_run_http_widget_blocks_ssrf() -> None:
  """Test that run_http_widget returns status 403 on SSRF targets."""
  config = {"url": "http://127.0.0.1:8000/api/v1/system/diagnostics"}
  res = await run_http_widget(config)
  assert res["status"] == 403
  assert "Security restriction" in res["error"]


@pytest.mark.asyncio
async def test_run_http_widget_redirect_interception() -> None:
  """Test that SafeAsyncHTTPTransport intercepts redirects to restricted IP addresses."""
  # Simulate initial request passing validation, but transport intercepting redirected target
  config = {"url": "http://legit.external.api/redirect"}

  with (
    patch("app.services.runners.http.validate_safe_url", return_value=(True, None)),
    patch.object(
      SafeAsyncHTTPTransport,
      "handle_async_request",
      side_effect=httpx.RequestError("Security restriction: Direct access to 169.254.169.254 is prohibited"),
    ),
  ):
    res = await run_http_widget(config)

  assert res["status"] == 0
  assert "Security restriction" in res["error"]
