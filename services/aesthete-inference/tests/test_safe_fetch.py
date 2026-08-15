from __future__ import annotations

import asyncio

import httpcore
import pytest

from app.safe_fetch import PublicNetworkBackend


class RecordingBackend:
    def __init__(self) -> None:
        self.hosts: list[str] = []

    async def connect_tcp(self, host: str, _port: int, **_kwargs):
        self.hosts.append(host)
        return object()

    async def sleep(self, _seconds: float) -> None:
        return None


def test_network_backend_pins_connection_to_validated_resolution():
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34"]

    backend = PublicNetworkBackend(resolver)
    delegate = RecordingBackend()
    backend._backend = delegate

    asyncio.run(backend.connect_tcp("cdn.test", 443))

    assert delegate.hosts == ["93.184.216.34"]


def test_network_backend_rejects_private_dns_answer_before_connect():
    async def resolver(_host: str, _port: int) -> list[str]:
        return ["93.184.216.34", "169.254.169.254"]

    backend = PublicNetworkBackend(resolver)
    delegate = RecordingBackend()
    backend._backend = delegate

    with pytest.raises(httpcore.ConnectError, match="not public"):
        asyncio.run(backend.connect_tcp("cdn.test", 443))

    assert delegate.hosts == []
