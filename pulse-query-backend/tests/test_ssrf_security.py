"""
Tests for Network Security, SSRF Prevention, and DNS Rebinding Interception.
"""

import ipaddress
import socket
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.core.network_security import (
  SafeAsyncHTTPTransport,
  is_ip_private_or_restricted,
  resolve_and_pin_safe_ip_result,
  validate_safe_url,
)
from app.core.result import Err, Ok
from app.services.runners.http import run_http_widget


def test_is_ip_private_or_restricted_comprehensive() -> None:
  """Test `is_ip_private_or_restricted` across IPv4, IPv6, mapped, 6to4, Teredo, NAT64, and carrier NAT."""
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
  assert not is_ip_private_or_restricted(ipaddress.ip_address("::ffff:8.8.8.8"))

  # 6to4 (2002::/16) embedding 127.0.0.1 (2002:7f00:0001::1) and 8.8.8.8 (2002:0808:0808::1)
  assert is_ip_private_or_restricted(ipaddress.ip_address("2002:7f00:0001::1"))
  assert not is_ip_private_or_restricted(ipaddress.ip_address("2002:0808:0808::1"))

  # Teredo (2001::/32)
  assert is_ip_private_or_restricted(ipaddress.ip_address("2001:0000:4136:e378:8000:63bf:3fff:fdd2"))
  assert is_ip_private_or_restricted(ipaddress.ip_address("2001:0000:7f00:0001:0000:0000:f7f7:f7f7"))

  # NAT64 (64:ff9b::/96) embedding 127.0.0.1 and 8.8.8.8
  assert is_ip_private_or_restricted(ipaddress.ip_address("64:ff9b::127.0.0.1"))
  assert not is_ip_private_or_restricted(ipaddress.ip_address("64:ff9b::8.8.8.8"))

  # Global / Public IP
  assert not is_ip_private_or_restricted(ipaddress.ip_address("8.8.8.8"))
  assert not is_ip_private_or_restricted(ipaddress.ip_address("93.184.216.34"))
  assert not is_ip_private_or_restricted(ipaddress.ip_address("2606:4700:4700::1111"))


def test_validate_safe_url_blocks_localhost_and_internal() -> None:
  """Test that local hostnames and loopback addresses are rejected."""
  is_safe, err = validate_safe_url("http://localhost:8080/api")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://127.0.0.1:5432")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://169.254.169.254/latest/meta-data")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://10.0.0.5/internal")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://192.168.1.1/admin")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()


def test_validate_safe_url_blocks_decimal_and_hex_ips() -> None:
  """Test that decimal integer and hex encoded IP hostnames are rejected when private, accepted when public."""
  is_safe, err = validate_safe_url("http://2130706433/api")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://1568222498/api")
  assert is_safe
  assert err is None

  with patch("app.core.network_security.socket.getaddrinfo", side_effect=socket.gaierror):
    is_safe, err = validate_safe_url("http://99999999999999/api")
    assert is_safe

  is_safe, err = validate_safe_url("http://0x7f000001/api")
  assert not is_safe
  assert err is not None
  assert "prohibited" in err.lower()

  is_safe, err = validate_safe_url("http://0x5db8d822/api")
  assert is_safe
  assert err is None

  with patch("app.core.network_security.socket.getaddrinfo", side_effect=socket.gaierror):
    is_safe, err = validate_safe_url("http://0xinvalidhex/api")
    assert is_safe


def test_validate_safe_url_blocks_unsupported_schemes() -> None:
  """Test that non-HTTP/HTTPS schemes are blocked."""
  is_safe, err = validate_safe_url("file:///etc/passwd")
  assert not is_safe
  assert err is not None
  assert "unsupported scheme" in err.lower()

  is_safe, err = validate_safe_url("ftp://example.com/file")
  assert not is_safe
  assert err is not None
  assert "unsupported scheme" in err.lower()


def test_validate_safe_url_invalid_inputs() -> None:
  """Test edge cases for empty or malformed URLs."""
  assert not validate_safe_url("")[0]
  assert not validate_safe_url(None)[0]
  assert not validate_safe_url("http://")[0]
  assert isinstance(resolve_and_pin_safe_ip_result(""), Err)


def test_validate_safe_url_public_ip() -> None:
  """Test that public IP literal is accepted."""
  is_safe, err = validate_safe_url("http://8.8.8.8/data")
  assert is_safe
  assert err is None


def test_validate_safe_url_dns_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
  """Test DNS resolution branches for public, private, and malformed IPs."""
  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("10.200.1.1", 80))],
  )
  is_safe, err = validate_safe_url("http://custom.internal.domain/api")
  assert not is_safe
  assert err is not None
  assert "resolves to restricted ip" in err.lower()

  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("93.184.216.34", 80)), (None, None, None, None, ("93.184.216.35", 80))],
  )
  is_safe, err = validate_safe_url("http://public.service.org/api")
  assert is_safe
  assert err is None

  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: [(None, None, None, None, ("not-an-ip", 80))],
  )
  is_safe, err = validate_safe_url("http://public.service.org/api")
  assert is_safe
  assert err is None

  # Strict DNS fails closed when resolution produces no valid IP or raises gaierror
  strict_empty = resolve_and_pin_safe_ip_result("http://public.service.org/api", strict_dns=True)
  assert isinstance(strict_empty, Err)

  monkeypatch.setattr(
    "app.core.network_security.socket.getaddrinfo",
    lambda host, port: (_ for _ in ()).throw(socket.gaierror("DNS failed")),
  )
  strict_err = resolve_and_pin_safe_ip_result("http://unresolvable.invalid/api", strict_dns=True)
  assert isinstance(strict_err, Err)
  assert "dns resolution failed" in strict_err.error.message.lower()


def test_validate_safe_url_parse_exception(monkeypatch: pytest.MonkeyPatch) -> None:
  """Test handling when urlparse raises an exception."""
  monkeypatch.setattr(
    "app.core.network_security.urlparse",
    lambda url: (_ for _ in ()).throw(ValueError("Simulated parse error")),
  )
  is_safe, err = validate_safe_url("http://example.com")
  assert not is_safe
  assert err is not None
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
  assert res["error"] is not None
  assert "Security restriction" in res["error"]


@pytest.mark.asyncio
async def test_run_http_widget_redirect_interception() -> None:
  """Test that SafeAsyncHTTPTransport intercepts redirects to restricted IP addresses."""
  config = {"url": "http://legit.external.api/redirect"}

  with (
    patch("app.services.runners.http.validate_safe_url_result", return_value=Ok("http://legit.external.api/redirect")),
    patch.object(
      SafeAsyncHTTPTransport,
      "handle_async_request",
      side_effect=httpx.RequestError("Security restriction: Direct access to 169.254.169.254 is prohibited"),
    ),
  ):
    res = await run_http_widget(config)

  assert res["status"] == 0
  assert res["error"] is not None
  assert "Security restriction" in res["error"]


@pytest.mark.asyncio
async def test_resolve_and_pin_safe_ip_and_transport_rewriting() -> None:
  """Verifies `SafeAsyncHTTPTransport` pins the resolved IP, sets SNI/Host headers, and rewrites URL when configured."""
  with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]):
    res_ok = resolve_and_pin_safe_ip_result("https://example.com/api")
    assert isinstance(res_ok, Ok)
    assert res_ok.value == "93.184.216.34"

    # 1. With pin_ip_rewrite=True, request URL host is rewritten to the resolved IP, Host header & SNI preserved
    transport_pin = SafeAsyncHTTPTransport(pin_ip_rewrite=True)
    req_https = httpx.Request("GET", "https://example.com/api")
    # Remove default host header to test auto-insertion, then also test when host header is already present
    req_https.headers.pop("host", None)
    with patch.object(
      httpx.AsyncHTTPTransport,
      "handle_async_request",
      new=AsyncMock(return_value=httpx.Response(200)),
    ):
      resp = await transport_pin.handle_async_request(req_https)
      assert resp.status_code == 200
      assert req_https.extensions.get("pinned_safe_ip") == "93.184.216.34"
      assert req_https.extensions.get("sni_hostname") == b"example.com"
      assert req_https.headers["host"] == "example.com"
      assert req_https.url.host == "93.184.216.34"

    # Also test HTTP scheme with existing Host header and pre-set sni_hostname
    req_http = httpx.Request("GET", "http://example.com/api", headers={"Host": "custom.example.com"})
    with patch.object(
      httpx.AsyncHTTPTransport,
      "handle_async_request",
      new=AsyncMock(return_value=httpx.Response(200)),
    ):
      await transport_pin.handle_async_request(req_http)
      assert req_http.headers["host"] == "custom.example.com"
      assert req_http.url.host == "93.184.216.34"

  # Test IPv6 literal bracket formatting when pin_ip_rewrite=True
  with patch("socket.getaddrinfo", return_value=[(10, 1, 6, "", ("2606:4700:4700::1111", 0, 0, 0))]):
    transport_v6 = SafeAsyncHTTPTransport(pin_ip_rewrite=True)
    req_v6 = httpx.Request("GET", "https://ipv6.example.com/api")
    with patch.object(
      httpx.AsyncHTTPTransport,
      "handle_async_request",
      new=AsyncMock(return_value=httpx.Response(200)),
    ):
      await transport_v6.handle_async_request(req_v6)
      assert req_v6.url.host == "2606:4700:4700::1111"

  with patch("socket.getaddrinfo", return_value=[]):
    res_empty = resolve_and_pin_safe_ip_result("https://example.com/api")
    assert isinstance(res_empty, Ok)
    assert res_empty.value == "example.com"

  with patch("socket.getaddrinfo", side_effect=socket.gaierror("offline")):
    res_offline = resolve_and_pin_safe_ip_result("https://example.com/api")
    assert isinstance(res_offline, Ok)
    assert res_offline.value == "example.com"

  res_err = resolve_and_pin_safe_ip_result("http://127.0.0.1/admin")
  assert isinstance(res_err, Err)
