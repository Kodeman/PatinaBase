"""SSRF-safe streaming fetches for externally supplied media URLs."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable, Iterable, Sequence

import httpcore
import httpx

HostnameResolver = Callable[[str, int], Awaitable[Sequence[str]]]

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
_MAX_REDIRECTS = 5


class SafeFetchError(Exception):
    """A URL, connection, or response failed the external-media policy."""


async def resolve_hostname(host: str, port: int) -> Sequence[str]:
    loop = asyncio.get_running_loop()
    records = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return tuple(dict.fromkeys(record[4][0] for record in records))


def _validated_ip(address: str) -> str:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        raise SafeFetchError("destination address is invalid") from None

    if not ip.is_global or (ip.version == 6 and ip.ipv4_mapped and not ip.ipv4_mapped.is_global):
        raise SafeFetchError("destination address is not public")
    return str(ip)


async def validate_public_url(
    url: httpx.URL,
    resolver: HostnameResolver = resolve_hostname,
) -> None:
    if url.scheme not in {"http", "https"} or not url.host:
        raise SafeFetchError("url must be http(s)")
    if url.username or url.password:
        raise SafeFetchError("url credentials are not allowed")

    try:
        literal = ipaddress.ip_address(url.host.split("%", 1)[0])
    except ValueError:
        try:
            addresses = await resolver(url.host, url.port or (443 if url.scheme == "https" else 80))
        except (OSError, UnicodeError):
            raise SafeFetchError("hostname could not be resolved") from None
        if not addresses:
            raise SafeFetchError("hostname could not be resolved")
        for address in addresses:
            _validated_ip(address)
    else:
        _validated_ip(str(literal))


class PublicNetworkBackend(httpcore.AsyncNetworkBackend):
    """Resolve once, validate every answer, and connect to the validated IP."""

    def __init__(self, resolver: HostnameResolver = resolve_hostname) -> None:
        self._resolver = resolver
        self._backend = httpcore.AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[httpcore.SOCKET_OPTION] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        try:
            addresses = await self._resolver(host, port)
            if not addresses:
                raise SafeFetchError("hostname could not be resolved")
            validated = [_validated_ip(address) for address in addresses]
        except (OSError, UnicodeError, SafeFetchError) as exc:
            raise httpcore.ConnectError(str(exc)) from exc

        return await self._backend.connect_tcp(
            validated[0],
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[httpcore.SOCKET_OPTION] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        raise httpcore.ConnectError("unix sockets are not allowed for external media")

    async def sleep(self, seconds: float) -> None:
        await self._backend.sleep(seconds)


def create_public_network_transport() -> httpx.AsyncHTTPTransport:
    transport = httpx.AsyncHTTPTransport(trust_env=False)
    pool = getattr(transport, "_pool", None)
    if pool is None or not hasattr(pool, "_network_backend"):
        raise RuntimeError("installed httpx does not expose a configurable network backend")
    pool._network_backend = PublicNetworkBackend()
    return transport


async def fetch_public_bytes(
    client: httpx.AsyncClient,
    url: str,
    *,
    timeout_s: float,
    max_bytes: int,
    allowed_content_types: set[str],
    allowed_content_prefixes: tuple[str, ...] = (),
    resolver: HostnameResolver = resolve_hostname,
) -> bytes:
    try:
        current = httpx.URL(url)
    except (TypeError, ValueError):
        raise SafeFetchError("url must be http(s)") from None

    try:
        async with asyncio.timeout(timeout_s):
            for redirect_count in range(_MAX_REDIRECTS + 1):
                await validate_public_url(current, resolver)
                async with client.stream(
                    "GET", current, timeout=timeout_s, follow_redirects=False
                ) as response:
                    if response.status_code in _REDIRECT_STATUSES:
                        if redirect_count == _MAX_REDIRECTS:
                            raise SafeFetchError("too many redirects")
                        location = response.headers.get("location")
                        if not location:
                            raise SafeFetchError("redirect is missing location")
                        try:
                            current = current.join(location)
                        except (TypeError, ValueError):
                            raise SafeFetchError("redirect location is invalid") from None
                        continue

                    if response.status_code != 200:
                        raise SafeFetchError(f"fetch failed: HTTP {response.status_code}")

                    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                    if content_type not in allowed_content_types and not any(
                        content_type.startswith(prefix) for prefix in allowed_content_prefixes
                    ):
                        raise SafeFetchError(f"content-type {content_type!r} is not allowed")

                    declared = response.headers.get("content-length")
                    if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                        raise SafeFetchError(
                            f"content-length {declared} exceeds limit of {max_bytes} bytes"
                        )

                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > max_bytes:
                            raise SafeFetchError(f"body exceeds limit of {max_bytes} bytes")

                    if not body:
                        raise SafeFetchError("empty response body")
                    return bytes(body)
    except SafeFetchError:
        raise
    except (TimeoutError, httpx.TimeoutException):
        raise SafeFetchError(f"fetch timed out after {timeout_s:g}s") from None
    except httpx.HTTPError as exc:
        raise SafeFetchError(f"fetch failed: {exc.__class__.__name__}") from None

    raise SafeFetchError("fetch failed")
