from __future__ import annotations

import asyncio

import httpcore
import httpx
import pytest

from app.safe_fetch import (
    PublicHTTPTransport,
    PublicNetworkBackend,
    SafeFetchError,
    _validated_ip,
    fetch_public_bytes,
)


class ScriptedStream(httpcore.AsyncNetworkStream):
    def __init__(self, response: bytes) -> None:
        self.response = response
        self.writes = bytearray()

    async def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        chunk, self.response = self.response[:max_bytes], self.response[max_bytes:]
        return chunk

    async def write(self, buffer: bytes, timeout: float | None = None) -> None:
        self.writes.extend(buffer)

    async def aclose(self) -> None:
        return None

    async def start_tls(
        self,
        ssl_context,
        server_hostname: bytes | None = None,
        timeout: float | None = None,
    ) -> httpcore.AsyncNetworkStream:
        return self

    def get_extra_info(self, info: str):
        return None


class ScriptedBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, *responses: bytes) -> None:
        self.responses = list(responses)
        self.hosts: list[str] = []
        self.streams: list[ScriptedStream] = []

    async def connect_tcp(self, host: str, port: int, **_kwargs):
        self.hosts.append(host)
        stream = ScriptedStream(self.responses.pop(0))
        self.streams.append(stream)
        return stream

    async def connect_unix_socket(self, path: str, **_kwargs):
        raise AssertionError("unix socket must not be used")

    async def sleep(self, _seconds: float) -> None:
        return None


def response(status: str = "200 OK", headers: bytes = b"", body: bytes = b"png") -> bytes:
    return (
        f"HTTP/1.1 {status}\r\n".encode()
        + b"Content-Type: image/png\r\n"
        + f"Content-Length: {len(body)}\r\n".encode()
        + headers
        + b"Connection: close\r\n\r\n"
        + body
    )


def run_fetch(url: str, resolver, backend: ScriptedBackend) -> bytes:
    async def run() -> bytes:
        transport = PublicHTTPTransport(resolver, backend)
        async with httpx.AsyncClient(transport=transport, trust_env=False) as client:
            return await fetch_public_bytes(
                client,
                url,
                timeout_s=1,
                max_bytes=1024,
                allowed_content_types={"image/png"},
                resolver=resolver,
            )

    return asyncio.run(run())


@pytest.mark.parametrize(
    "address",
    [
        "0.0.0.0",
        "10.0.0.1",
        "100.64.0.1",
        "127.0.0.1",
        "169.254.169.254",
        "192.0.2.1",
        "224.0.0.1",
        "240.0.0.1",
        "::",
        "::1",
        "fe80::1",
        "fec0::1",
        "ff02::1",
        "2001:db8::1",
        "::ffff:127.0.0.1",
        "64:ff9b::7f00:1",
        "64:ff9b:1::7f00:1",
        "2002:7f00:1::",
        "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
    ],
)
def test_rfc_special_use_matrix_is_rejected(address):
    with pytest.raises(SafeFetchError):
        _validated_ip(address)


@pytest.mark.parametrize("address", ["93.184.216.34", "2606:4700:4700::1111"])
def test_public_address_matrix_is_allowed(address):
    assert _validated_ip(address)


def test_network_backend_pins_connection_to_validated_resolution():
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34"]

    delegate = ScriptedBackend(response())
    backend = PublicNetworkBackend(resolver, delegate)
    asyncio.run(backend.connect_tcp("cdn.test", 443))
    assert delegate.hosts == ["93.184.216.34"]


def test_production_transport_blocks_validation_to_connect_rebinding():
    calls = 0

    async def resolver(_host: str, _port: int) -> list[str]:
        nonlocal calls
        calls += 1
        return ["93.184.216.34"] if calls == 1 else ["127.0.0.1"]

    backend = ScriptedBackend(response())
    with pytest.raises(SafeFetchError, match="ConnectError"):
        run_fetch("https://cdn.test/image.png", resolver, backend)
    assert backend.hosts == []


def test_production_transport_rejects_mixed_dns_answers_before_connect():
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34", "169.254.169.254"]

    backend = ScriptedBackend(response())
    with pytest.raises(SafeFetchError, match="not public"):
        run_fetch("https://cdn.test/image.png", resolver, backend)
    assert backend.hosts == []


def test_production_transport_validates_each_redirect_hop():
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34"]

    redirect = response(
        "302 Found",
        headers=b"Location: http://127.0.0.1/internal.png\r\n",
        body=b"",
    )
    backend = ScriptedBackend(redirect)
    with pytest.raises(SafeFetchError, match="not public"):
        run_fetch("https://cdn.test/image.png", resolver, backend)
    assert backend.hosts == ["93.184.216.34"]


@pytest.mark.parametrize("host", ["2130706433", "0x7f000001"])
def test_production_transport_rejects_encoded_ipv4_literals(host):
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["127.0.0.1"]

    backend = ScriptedBackend(response())
    with pytest.raises(SafeFetchError, match="not public"):
        run_fetch(f"http://{host}/image.png", resolver, backend)
    assert backend.hosts == []


def test_production_transport_bypasses_proxy_env_and_requests_identity(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:3128")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:3128")

    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34"]

    backend = ScriptedBackend(response(body=b"safe"))
    assert run_fetch("https://cdn.test/image.png", resolver, backend) == b"safe"
    assert backend.hosts == ["93.184.216.34"]
    request_bytes = bytes(backend.streams[0].writes).lower()
    assert b"host: cdn.test" in request_bytes
    assert b"accept-encoding: identity" in request_bytes
