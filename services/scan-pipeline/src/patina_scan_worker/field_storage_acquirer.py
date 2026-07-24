"""Disabled, owner-scoped Field Storage acquisition adapter for P2 Refine.

The adapter is deliberately queue-independent. It accepts one already-validated
``RefineSourceArtifact`` and streams the exact raw Storage object generation
into the materializer-owned bounded descriptor sink. It never receives or
opens a destination path.

Every service-role read repeats the owner/scan guard before constructing an
HTTP client. One carried ``RefineDeadline`` cancels the asynchronous request,
body stream, and response cleanup and is checked immediately around every
synchronous sink write. The only intended sink is the materializer-owned
bounded private regular-file writer. A kernel-blocked regular-file write cannot
be preempted in-process; that remains an explicit killable-composition gate
while this adapter is disabled. The adapter accepts only an exact identity
response whose content length, byte count, and SHA-256 match the materializer
request.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
from collections.abc import Callable
from typing import Any, NoReturn

import httpx

from .config import Settings
from .keys import OwnershipError, assert_owner_prefix, safe_relative_path
from .refine_adapter import AdapterError, RefineDeadline
from .refine_materializer import (
    MaterializerFailureCode,
    RefineBoundedWriter,
    RefineMaterializerError,
    RefineSourceArtifact,
)

_TRANSFER_CHUNK_BYTES = 1 << 20
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_OPERATIONAL_HTTP_STATUSES = frozenset({401, 403, 408, 425, 429})
_MAX_ERROR_BYTES = 4096


def _bounded_message(value: object) -> str:
    return (
        str(value)
        .encode("utf-8", errors="replace")[:_MAX_ERROR_BYTES]
        .decode(
            "utf-8",
            errors="ignore",
        )
    )


def _fail(code: MaterializerFailureCode, message: str) -> NoReturn:
    raise AdapterError(_bounded_message(message), code.value)


def _remaining(deadline: RefineDeadline) -> float:
    if not isinstance(deadline, RefineDeadline):
        _fail(MaterializerFailureCode.DEADLINE, "deadline has the wrong contract type")
    try:
        remaining = deadline.remaining_seconds()
    except AdapterError as exc:
        _fail(MaterializerFailureCode.DEADLINE, exc)
    if (
        isinstance(remaining, bool)
        or not isinstance(remaining, (int, float))
        or not math.isfinite(float(remaining))
        or float(remaining) <= 0
    ):
        _fail(MaterializerFailureCode.DEADLINE, "deadline is exhausted")
    return float(remaining)


def _stable_identifier(value: object, label: str) -> str:
    if not isinstance(value, str) or _SAFE_IDENTIFIER.fullmatch(value) is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"{label} must be a stable ASCII identifier",
        )
    return value


def _validate_owner_key(object_key: object, user_id: str, scan_id: str) -> str:
    if (
        not isinstance(object_key, str)
        or not object_key
        or any(character in object_key for character in ("\\", "?", "#", "%"))
    ):
        _fail(MaterializerFailureCode.OWNERSHIP, "unsafe Storage object key")
    try:
        normalized = safe_relative_path(object_key)
    except ValueError as exc:
        _fail(MaterializerFailureCode.OWNERSHIP, exc)
    segments = normalized.split("/")
    if normalized != object_key or any(
        segment in ("", ".", "..") for segment in segments
    ):
        _fail(MaterializerFailureCode.OWNERSHIP, "unsafe Storage object key")
    try:
        assert_owner_prefix(object_key, user_id, scan_id)
    except OwnershipError as exc:
        _fail(MaterializerFailureCode.OWNERSHIP, exc)
    return object_key


def _validate_source(
    source: object,
    *,
    user_id: object,
    scan_id: object,
) -> RefineSourceArtifact:
    if type(source) is not RefineSourceArtifact:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "source artifact has the wrong contract type",
        )
    owner = _stable_identifier(user_id, "user_id")
    scan = _stable_identifier(scan_id, "scan_id")
    _validate_owner_key(source.object_key, owner, scan)
    if (
        not isinstance(source.sha256, str)
        or _SHA256.fullmatch(source.sha256) is None
        or isinstance(source.size_bytes, bool)
        or not isinstance(source.size_bytes, int)
        or source.size_bytes <= 0
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "source artifact needs a canonical positive fingerprint",
        )
    return source


def _validated_content_length(value: str | None, expected_size: int) -> None:
    if value is None or re.fullmatch(r"[0-9]+", value.strip()) is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "Field Storage response lacks one valid Content-Length",
        )
    try:
        actual = int(value.strip())
    except ValueError:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "Field Storage response Content-Length is invalid",
        )
    if actual != expected_size:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "Field Storage response Content-Length disagrees with the source ledger",
        )


class FieldStorageArtifactAcquirer:
    """Concrete disabled adapter for immutable Field bundle acquisition."""

    production_enablement = "disabled"

    def __init__(
        self,
        settings: Settings,
        *,
        client_factory: Callable[[], Any] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not isinstance(settings, Settings):
            raise TypeError("settings must be Settings")
        if client_factory is not None and not callable(client_factory):
            raise TypeError("client_factory must be callable")
        if client_factory is not None and transport is not None:
            raise TypeError("client_factory and transport are mutually exclusive")
        self._base_url = settings.supabase_url
        self._service_role_key = settings.service_role_key
        self._bucket = settings.room_scans_bucket
        self._transport = transport
        self._client_factory = client_factory or self._build_client

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "apikey": self._service_role_key,
                "Authorization": f"Bearer {self._service_role_key}",
            },
            timeout=None,
            transport=self._transport,
        )

    async def _acquire(
        self,
        *,
        source: RefineSourceArtifact,
        destination: RefineBoundedWriter,
        deadline: RefineDeadline,
    ) -> None:
        url = f"/storage/v1/object/{self._bucket}/{source.object_key}"
        async with (
            self._client_factory() as client,
            client.stream(
                "GET",
                url,
                headers={"accept-encoding": "identity"},
                timeout=None,
            ) as response,
        ):
            status = response.status_code
            if status in _OPERATIONAL_HTTP_STATUSES or status >= 500:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"Field Storage GET returned operational status {status}",
                )
            if status == 404:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "Field Storage source object is missing",
                )
            if status != 200:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    f"Field Storage GET returned unexpected status {status}",
                )

            content_encoding = response.headers.get("content-encoding")
            if (
                content_encoding is not None
                and content_encoding.strip().lower() != "identity"
            ):
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "Field Storage response applied a content encoding",
                )
            if response.headers.get("content-range") is not None:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "Field Storage response is unexpectedly partial",
                )
            _validated_content_length(
                response.headers.get("content-length"),
                source.size_bytes,
            )

            digest = hashlib.sha256()
            received = 0
            chunk_size = min(_TRANSFER_CHUNK_BYTES, source.size_bytes + 1)
            async for chunk in response.aiter_raw(chunk_size=chunk_size):
                _remaining(deadline)
                if not isinstance(chunk, bytes):
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        "Field Storage response yielded a non-byte chunk",
                    )
                if not chunk:
                    continue
                received += len(chunk)
                if received > source.size_bytes:
                    _fail(
                        MaterializerFailureCode.INPUT_INVALID,
                        "Field Storage response exceeds the source byte ledger",
                    )
                _remaining(deadline)
                try:
                    written = destination.write(chunk)
                except (AdapterError, RefineMaterializerError):
                    raise
                except Exception as exc:  # noqa: BLE001 - normalize injected sink
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"bounded acquisition sink raised {type(exc).__name__}",
                    )
                if (
                    isinstance(written, bool)
                    or not isinstance(written, int)
                    or written != len(chunk)
                ):
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        "bounded acquisition sink did not accept the full chunk",
                    )
                _remaining(deadline)
                digest.update(chunk)

            _remaining(deadline)
            if received != source.size_bytes:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    "Field Storage response ended before its declared byte count",
                )
            if digest.hexdigest() != source.sha256:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "Field Storage response SHA-256 disagrees with the source ledger",
                )

    def acquire(
        self,
        *,
        source: RefineSourceArtifact,
        user_id: str,
        scan_id: str,
        destination: RefineBoundedWriter,
        deadline: RefineDeadline,
    ) -> None:
        """Stream one exact object into the materializer's bounded file sink.

        The absolute deadline is checked on both sides of every synchronous
        write. This prevents a slow completed write from producing success, but
        cannot interrupt an uninterruptible kernel write in this disabled
        in-process adapter.
        """

        validated = _validate_source(source, user_id=user_id, scan_id=scan_id)
        _remaining(deadline)
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "synchronous Field Storage acquisition cannot run in an event loop",
            )

        async def bounded() -> None:
            async with asyncio.timeout(_remaining(deadline)):
                await self._acquire(
                    source=validated,
                    destination=destination,
                    deadline=deadline,
                )

        failure: AdapterError | None = None
        try:
            asyncio.run(bounded())
        except (AdapterError, RefineMaterializerError):
            raise
        except TimeoutError:
            failure = AdapterError(
                "Field Storage acquisition exhausted the carried deadline",
                MaterializerFailureCode.DEADLINE.value,
            )
        except httpx.TimeoutException:
            failure = AdapterError(
                "Field Storage acquisition failed in the HTTP timeout category",
                MaterializerFailureCode.INPUT_IO.value,
            )
        except httpx.NetworkError:
            failure = AdapterError(
                "Field Storage acquisition failed in the HTTP network category",
                MaterializerFailureCode.INPUT_IO.value,
            )
        except httpx.ProtocolError:
            failure = AdapterError(
                "Field Storage acquisition failed in the HTTP protocol category",
                MaterializerFailureCode.INPUT_IO.value,
            )
        except httpx.HTTPError:
            failure = AdapterError(
                "Field Storage acquisition failed in the HTTP client category",
                MaterializerFailureCode.INPUT_IO.value,
            )
        except Exception:  # noqa: BLE001 - normalize client/context-manager boundary
            failure = AdapterError(
                "Field Storage acquisition failed in the runtime category",
                MaterializerFailureCode.INPUT_IO.value,
            )
        if failure is not None:
            failure.__cause__ = None
            failure.__context__ = None
            failure.__suppress_context__ = True
            raise failure from None
        _remaining(deadline)
