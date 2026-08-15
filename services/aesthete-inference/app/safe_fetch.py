"""SSRF-safe streaming fetches for externally supplied media URLs."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable, Iterable, Sequence

import httpcore
import httpx

HostnameResolver = Callable[[str, int], Awaitable[Sequence[str]]]

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
_MAX_REDIRECTS = 5
_HTTPX_VERSION = "0.28.1"
_HTTPCORE_VERSION = "1.0.9"
_NAT64_WELL_KNOWN = ipaddress.ip_network("64:ff9b::/96")
_NAT64_LOCAL_USE = ipaddress.ip_network("64:ff9b:1::/48")
_IPV4_COMPATIBLE = ipaddress.ip_network("::/96")
_SIX_TO_FOUR = ipaddress.ip_network("2002::/16")
_TEREDO = ipaddress.ip_network("2001::/32")


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

    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            raise SafeFetchError("destination address uses a disallowed IPv4-mapped form")
        if ip in _NAT64_LOCAL_USE:
            raise SafeFetchError("destination address uses a disallowed NAT64 local-use form")
        if ip in _NAT64_WELL_KNOWN:
            embedded = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
            _validated_ip(str(embedded))
        if ip in _IPV4_COMPATIBLE or ip in _SIX_TO_FOUR or ip in _TEREDO:
            raise SafeFetchError("destination address uses a disallowed transition form")
        if ip.is_site_local:
            raise SafeFetchError("destination address is site-local")

    if (
        ip.is_unspecified
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_private
        or not ip.is_global
    ):
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
    """Resolve at connect time, validate every answer, and pin the selected IP."""

    def __init__(
        self,
        resolver: HostnameResolver = resolve_hostname,
        backend: httpcore.AsyncNetworkBackend | None = None,
    ) -> None:
        self._resolver = resolver
        self._backend = backend or httpcore.AnyIOBackend()

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


def _map_httpcore_exception(exc: Exception, request: httpx.Request) -> httpx.HTTPError:
    mappings: tuple[tuple[type[Exception], type[httpx.HTTPError]], ...] = (
        (httpcore.ConnectTimeout, httpx.ConnectTimeout),
        (httpcore.ReadTimeout, httpx.ReadTimeout),
        (httpcore.WriteTimeout, httpx.WriteTimeout),
        (httpcore.PoolTimeout, httpx.PoolTimeout),
        (httpcore.ConnectError, httpx.ConnectError),
        (httpcore.ReadError, httpx.ReadError),
        (httpcore.WriteError, httpx.WriteError),
        (httpcore.RemoteProtocolError, httpx.RemoteProtocolError),
        (httpcore.LocalProtocolError, httpx.LocalProtocolError),
        (httpcore.ProxyError, httpx.ProxyError),
        (httpcore.UnsupportedProtocol, httpx.UnsupportedProtocol),
    )
    for source, target in mappings:
        if isinstance(exc, source):
            return target(str(exc), request=request)
    return httpx.TransportError(str(exc), request=request)


class _ResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream: AsyncIterable[bytes], request: httpx.Request) -> None:
        self._stream = stream
        self._request = request

    async def __aiter__(self) -> AsyncIterator[bytes]:
        try:
            async for part in self._stream:
                yield part
        except (
            httpcore.TimeoutException,
            httpcore.NetworkError,
            httpcore.ProtocolError,
            httpcore.ProxyError,
            httpcore.UnsupportedProtocol,
        ) as exc:
            raise _map_httpcore_exception(exc, self._request) from exc

    async def aclose(self) -> None:
        close = getattr(self._stream, "aclose", None)
        if close is not None:
            await close()


class PublicHTTPTransport(httpx.AsyncBaseTransport):
    """Supported httpcore pool construction with an SSRF-validating backend."""

    def __init__(
        self,
        resolver: HostnameResolver = resolve_hostname,
        network_backend: httpcore.AsyncNetworkBackend | None = None,
    ) -> None:
        if httpx.__version__ != _HTTPX_VERSION or httpcore.__version__ != _HTTPCORE_VERSION:
            raise RuntimeError(
                "aesthete safe transport requires "
                f"httpx=={_HTTPX_VERSION} and httpcore=={_HTTPCORE_VERSION}"
            )
        self._pool = httpcore.AsyncConnectionPool(
            network_backend=PublicNetworkBackend(resolver, network_backend),
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        try:
            response = await self._pool.handle_async_request(core_request)
        except (
            httpcore.TimeoutException,
            httpcore.NetworkError,
            httpcore.ProtocolError,
            httpcore.ProxyError,
            httpcore.UnsupportedProtocol,
        ) as exc:
            raise _map_httpcore_exception(exc, request) from exc
        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=_ResponseStream(response.stream, request),
            extensions=response.extensions,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()


def create_public_network_transport() -> PublicHTTPTransport:
    return PublicHTTPTransport()


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
                    "GET",
                    current,
                    headers={"accept-encoding": "identity"},
                    timeout=timeout_s,
                    follow_redirects=False,
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

                    content_encoding = response.headers.get("content-encoding", "").strip().lower()
                    if content_encoding not in {"", "identity"}:
                        raise SafeFetchError("compressed content-encoding is not allowed")

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
                    if response.is_stream_consumed:
                        chunks: AsyncIterable[bytes] = _single_chunk(response.content)
                    else:
                        chunks = response.aiter_raw()
                    async for chunk in chunks:
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


async def _single_chunk(content: bytes) -> AsyncIterator[bytes]:
    yield content
