"""Storage REST client for the ``room-scans`` bucket.

Reads bundle artifacts (service-role key bypasses storage RLS on read); item 11
adds drawing uploads under the ``room_file/{userId}/{scanId}/v{version}/…``
prefix. ``room-scans`` is PRIVATE, so downloads go through the authenticated
object endpoint with the service-role key.

W3-C (storage_backend.py) wraps ``download``/``download_to``/``upload_bytes``/
``exists`` behind a swappable ``StorageBackend`` so the R2 cutover doesn't need
to touch this file: none of the four change here. The refine/immutable-publish
machinery below (deadline-bounded async I/O, descriptor staging, duplicate-
conflict resolution) stays on this class directly — it is refine-specific, and
refine's inputs/outputs are read via presigned URLs today (W1's plan), so it is
out of scope for the storage-interface work.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
import stat
import tempfile
from collections.abc import Callable, Iterator
from typing import Any, BinaryIO

import httpx

from .config import Settings
from .errors import PermanentError, TransientError
from .keys import OwnershipError, assert_owner_prefix, safe_relative_path
from .refine_adapter import AdapterError, RefineDeadline


_TRANSFER_CHUNK_BYTES = 1 << 20
_TRANSIENT_HTTP_STATUSES = frozenset({408, 425, 429})
_DUPLICATE_CODES = frozenset(
    {
        "alreadyexists",
        "duplicate",
        "keyalreadyexists",
        "resourcealreadyexists",
    }
)


def _deadline_remaining(
    deadline: RefineDeadline | None,
    *,
    reserve_seconds: float,
) -> float | None:
    if deadline is None:
        return None
    if (
        isinstance(reserve_seconds, bool)
        or not isinstance(reserve_seconds, (int, float))
        or not math.isfinite(float(reserve_seconds))
        or reserve_seconds < 0
    ):
        raise PermanentError(
            "refine storage reserve must be a finite non-negative number",
            token="REFINE_ARTIFACT_VERIFY",
        )
    try:
        remaining = deadline.remaining_seconds()
    except AdapterError as exc:
        raise TransientError(
            "refine storage deadline is exhausted",
            token="REFINE_ENGINE_TIMEOUT",
        ) from exc
    usable = remaining - float(reserve_seconds)
    if not math.isfinite(usable) or usable <= 0:
        raise TransientError(
            "refine storage deadline cannot preserve the completion reserve",
            token="REFINE_ENGINE_TIMEOUT",
        )
    return usable


def _bounded_file_chunks(
    handle: BinaryIO,
    *,
    deadline: RefineDeadline | None = None,
    reserve_seconds: float = 0,
) -> Iterator[bytes]:
    while True:
        _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
        chunk = handle.read(_TRANSFER_CHUNK_BYTES)
        if not chunk:
            break
        yield chunk


def _descriptor_snapshot(descriptor: int) -> tuple[int, int, int, int, int, int]:
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        raise PermanentError(
            "immutable storage publication source descriptor is unusable",
            token="REFINE_ARTIFACT_SOURCE",
        ) from exc
    if not stat.S_ISREG(metadata.st_mode):
        raise PermanentError(
            "immutable storage publication source is not a regular file",
            token="REFINE_ARTIFACT_SOURCE",
        )
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _stage_verified_descriptor(
    descriptor: int,
    frozen: BinaryIO,
    *,
    expected_sha256: str,
    expected_size: int,
    deadline: RefineDeadline | None = None,
    reserve_seconds: float = 0,
) -> None:
    """Copy one stable generation of a BORROWED descriptor into private scratch.

    Reads are positional, so the owner's offset is never observed or moved and
    the same descriptor can be published more than once.  ``frozen`` is an
    unlinked mode-0600 temporary owned only by this process; no network call
    happens until its bytes and the source's metadata have both been verified.
    """

    initial_snapshot = _descriptor_snapshot(descriptor)
    if initial_snapshot[3] != expected_size:
        raise TransientError(
            "immutable publication source size no longer matches its manifest",
            token="REFINE_ARTIFACT_IO",
        )

    digest = hashlib.sha256()
    copied = 0
    while copied < expected_size:
        _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
        chunk = os.pread(
            descriptor,
            min(_TRANSFER_CHUNK_BYTES, expected_size - copied),
            copied,
        )
        if not chunk:
            # This guard is the ONLY bound on this loop.  ``deadline`` is
            # optional on the legacy publication path, and
            # ``_deadline_remaining(None, ...)`` enforces nothing, so a source
            # truncated after the size check above would leave ``copied`` frozen
            # and spin here forever rather than failing.  The size check cannot
            # cover it: it runs before the first read, and the object can shrink
            # afterwards.  Deleting this raise is a hang, not a wrong answer.
            raise TransientError(
                "immutable publication source ended before its manifest size",
                token="REFINE_ARTIFACT_IO",
            )
        copied += len(chunk)
        digest.update(chunk)
        frozen.write(chunk)
    _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
    if os.pread(descriptor, 1, expected_size):
        raise TransientError(
            "immutable publication source grew while staging",
            token="REFINE_ARTIFACT_IO",
        )

    staged_snapshot = _descriptor_snapshot(descriptor)
    if staged_snapshot != initial_snapshot or copied != expected_size:
        raise TransientError(
            "immutable publication source changed while staging",
            token="REFINE_ARTIFACT_IO",
        )
    if digest.hexdigest() != expected_sha256:
        raise TransientError(
            "immutable publication source hash no longer matches its manifest",
            token="REFINE_ARTIFACT_IO",
        )

    frozen.flush()
    os.fsync(frozen.fileno())
    _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
    if _file_snapshot(frozen)[3] != expected_size:
        raise TransientError(
            "immutable publication snapshot could not be verified",
            token="REFINE_ARTIFACT_IO",
        )
    frozen.seek(0)


def _file_snapshot(handle: BinaryIO) -> tuple[int, int, int, int, int, int]:
    metadata = os.fstat(handle.fileno())
    if not stat.S_ISREG(metadata.st_mode):
        raise PermanentError(
            "immutable storage publication source is not a regular file",
            token="REFINE_ARTIFACT_SOURCE",
        )
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _error_excerpt(response: Any) -> str:
    try:
        return str(response.text)[:200]
    except Exception:
        return "<unreadable response>"


def _normalized_error_code(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return "".join(character for character in value.lower() if character.isalnum())


def _normalized_media_type(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.split(";", 1)[0].strip().lower()


def _is_explicit_duplicate(response: Any) -> bool:
    """Recognize only Supabase's documented current/legacy duplicate bodies."""

    if response.status_code not in (400, 409):
        return False
    try:
        payload = response.json()
    except (TypeError, ValueError):
        return False
    if not isinstance(payload, dict):
        return False

    for field in ("code", "error"):
        if _normalized_error_code(payload.get(field)) in _DUPLICATE_CODES:
            return True

    message = payload.get("message")
    if not isinstance(message, str):
        return False
    normalized_message = " ".join(message.lower().split())
    return "already exists" in normalized_message and (
        "asset" in normalized_message or "resource" in normalized_message
    )


def _assert_safe_owner_key(object_key: str, user_id: str, scan_id: str) -> None:
    try:
        normalized = safe_relative_path(object_key)
    except ValueError as exc:
        raise OwnershipError(str(exc)) from exc
    segments = normalized.split("/")
    if normalized != object_key or any(
        segment in ("", ".", "..") for segment in segments
    ):
        raise OwnershipError(f"unsafe storage object key: {object_key!r}")
    if any(character in object_key for character in ("?", "#", "%")):
        raise OwnershipError(f"ambiguous storage object key: {object_key!r}")
    assert_owner_prefix(object_key, user_id, scan_id)


class StorageClient:
    def __init__(
        self,
        session: httpx.Client,
        settings: Settings,
        *,
        refine_client_factory: Callable[[], Any] | None = None,
    ):
        self._s = session
        self._cfg = settings
        self._bucket = settings.room_scans_bucket
        self._refine_client_factory = (
            refine_client_factory or self._build_refine_client
        )

    @property
    def bucket(self) -> str:
        """The bucket every method on this client reads and writes.

        Exposed because a caller that RECORDS where it published needs to be
        able to prove the name it recorded is the name it wrote to; reading
        ``_bucket`` from outside would make that guard depend on a private.
        """

        return self._bucket

    def _build_refine_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._cfg.supabase_url,
            headers={
                "apikey": self._cfg.service_role_key,
                "Authorization": f"Bearer {self._cfg.service_role_key}",
            },
            timeout=None,
        )

    def _run_refine_io(
        self,
        operation: Callable[[], Any],
        *,
        deadline: RefineDeadline,
        reserve_seconds: float,
        description: str,
    ) -> Any:
        """Run one async HTTP operation under a hard monotonic total timeout.

        HTTPX timeouts are inactivity limits for individual connect/read/write/
        pool operations, not total request deadlines. Refine therefore uses a
        request-local async client under ``asyncio.timeout`` while the existing
        synchronous client remains untouched for all P1 call paths.
        """

        usable = _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
        assert usable is not None
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise PermanentError(
                "synchronous refine storage cannot run inside an event loop",
                token="REFINE_ARTIFACT_VERIFY",
            )

        async def bounded() -> Any:
            async with asyncio.timeout(usable):
                return await operation()

        try:
            result = asyncio.run(bounded())
        except TimeoutError as exc:
            raise TransientError(
                f"{description}: absolute refine storage deadline exhausted",
                token="REFINE_ENGINE_TIMEOUT",
            ) from exc
        _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
        return result

    async def _download_to_refine(
        self,
        url: str,
        object_key: str,
        dest_path: str,
        *,
        deadline: RefineDeadline,
        reserve_seconds: float,
    ) -> int:
        try:
            async with self._refine_client_factory() as client:
                async with client.stream("GET", url, timeout=None) as resp:
                    if resp.status_code == 404:
                        raise PermanentError(
                            f"object not found: {object_key}",
                            token="MISSING_FILE",
                        )
                    if resp.status_code >= 500:
                        raise TransientError(
                            f"storage GET {object_key} -> {resp.status_code}"
                        )
                    if resp.status_code >= 400:
                        body = await resp.aread()
                        raise PermanentError(
                            f"storage GET {object_key} -> {resp.status_code}: "
                            f"{body[:200]!r}",
                            token="MISSING_FILE",
                        )
                    written = 0
                    with open(dest_path, "wb") as handle:
                        async for chunk in resp.aiter_bytes(chunk_size=1 << 20):
                            _deadline_remaining(
                                deadline,
                                reserve_seconds=reserve_seconds,
                            )
                            handle.write(chunk)
                            written += len(chunk)
                    return written
        except httpx.HTTPError as exc:
            raise TransientError(
                f"storage GET {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

    def download_to(
        self,
        object_key: str,
        dest_path: str,
        *,
        deadline: RefineDeadline | None = None,
        reserve_seconds: float = 0,
    ) -> int:
        """Download a bucket object to ``dest_path``. Returns bytes written.

        404 → PermanentError token MISSING_FILE (the caller decides transient-vs-
        fatal by attempt count). 5xx / network → TransientError.
        """
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        if deadline is not None:
            return self._run_refine_io(
                lambda: self._download_to_refine(
                    url,
                    object_key,
                    dest_path,
                    deadline=deadline,
                    reserve_seconds=reserve_seconds,
                ),
                deadline=deadline,
                reserve_seconds=reserve_seconds,
                description=f"storage GET {object_key}",
            )
        try:
            with self._s.stream("GET", url) as resp:
                if resp.status_code == 404:
                    raise PermanentError(
                        f"object not found: {object_key}", token="MISSING_FILE"
                    )
                if resp.status_code >= 500:
                    raise TransientError(
                        f"storage GET {object_key} -> {resp.status_code}"
                    )
                if resp.status_code >= 400:
                    raise PermanentError(
                        f"storage GET {object_key} -> {resp.status_code}: "
                        f"{resp.read()[:200]!r}",
                        token="MISSING_FILE",
                    )
                written = 0
                with open(dest_path, "wb") as fh:
                    for chunk in resp.iter_bytes(chunk_size=1 << 20):
                        fh.write(chunk)
                        written += len(chunk)
                return written
        except httpx.HTTPError as exc:
            raise TransientError(f"storage GET {object_key}: {exc}") from exc

    def download(self, object_key: str) -> bytes:
        """Read one object fully into memory.

        Same URL, status-code classification and exception taxonomy as
        ``download_to`` (404 -> PermanentError MISSING_FILE; 5xx/network ->
        TransientError); this is the non-streaming sibling for small artifacts
        (manifests) where staging a file would be needless. Large artifacts
        should keep using ``download_to``. No ``deadline`` parameter — refine's
        deadline-bounded path uses ``download_to`` exclusively today.
        """
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        try:
            resp = self._s.get(url)
        except httpx.HTTPError as exc:
            raise TransientError(f"storage GET {object_key}: {exc}") from exc
        if resp.status_code == 404:
            raise PermanentError(
                f"object not found: {object_key}", token="MISSING_FILE"
            )
        if resp.status_code >= 500:
            raise TransientError(f"storage GET {object_key} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise PermanentError(
                f"storage GET {object_key} -> {resp.status_code}: "
                f"{resp.text[:200]!r}",
                token="MISSING_FILE",
            )
        return resp.content

    def exists(self, object_key: str) -> bool:
        """True iff ``object_key`` names an existing object.

        A lightweight existence probe against the bucket's list endpoint (the
        same one ``list_reachable`` already uses for its doctor check),
        narrowed to one key by prefix + exact-name search, rather than
        downloading the object to prove it is there.
        """
        if "/" in object_key:
            prefix, name = object_key.rsplit("/", 1)
        else:
            prefix, name = "", object_key
        try:
            resp = self._s.post(
                f"/storage/v1/object/list/{self._bucket}",
                json={"prefix": prefix, "search": name, "limit": 100},
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"storage list {object_key}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"storage list {object_key} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise PermanentError(
                f"storage list {object_key} -> {resp.status_code}: "
                f"{resp.text[:200]!r}",
                token="MISSING_FILE",
            )
        try:
            entries = resp.json()
        except ValueError:
            return False
        if not isinstance(entries, list):
            return False
        return any(
            isinstance(entry, dict) and entry.get("name") == name
            for entry in entries
        )

    def list_reachable(self) -> bool:
        """doctor probe: a list against the bucket succeeds (proves the service
        key authenticates and Storage is reachable over 443)."""
        try:
            resp = self._s.post(
                f"/storage/v1/object/list/{self._bucket}",
                json={"prefix": "", "limit": 1},
            )
        except httpx.HTTPError:
            return False
        return resp.status_code < 400

    def upload_bytes(self, object_key: str, data: bytes, content_type: str) -> None:
        """Upsert an object (used by drawings/item 11 and by verification
        fixtures). POST + x-upsert:true, mirroring the iOS uploader."""
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        try:
            resp = self._s.post(
                url,
                content=data,
                headers={"content-type": content_type, "x-upsert": "true"},
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"storage PUT {object_key}: {exc}") from exc
        if resp.status_code >= 400:
            raise RuntimeError(
                f"storage PUT {object_key} -> {resp.status_code}: {resp.text[:200]}"
            )

    async def _existing_matches_refine(
        self,
        url: str,
        object_key: str,
        expected_sha256: str,
        expected_size: int,
        expected_content_type: str,
        *,
        deadline: RefineDeadline,
        reserve_seconds: float,
    ) -> bool:
        try:
            async with self._refine_client_factory() as client:
                async with client.stream(
                    "GET",
                    url,
                    headers={"accept-encoding": "identity"},
                    timeout=None,
                ) as resp:
                    if resp.status_code == 404:
                        raise TransientError(
                            f"storage conflict verification GET {object_key} -> 404",
                            token="REFINE_ARTIFACT_IO",
                        )
                    if (
                        resp.status_code in _TRANSIENT_HTTP_STATUSES
                        or resp.status_code >= 500
                    ):
                        raise TransientError(
                            f"storage conflict verification GET {object_key} -> "
                            f"{resp.status_code}",
                            token="REFINE_ARTIFACT_IO",
                        )
                    if not 200 <= resp.status_code < 300:
                        body = await resp.aread()
                        raise PermanentError(
                            f"storage conflict verification GET {object_key} -> "
                            f"{resp.status_code}: {body[:200]!r}",
                            token="REFINE_ARTIFACT_VERIFY",
                        )

                    content_encoding = resp.headers.get("content-encoding")
                    if (
                        content_encoding is not None
                        and content_encoding.strip().lower() != "identity"
                    ):
                        raise PermanentError(
                            f"storage conflict verification GET {object_key} returned "
                            f"encoded content: {content_encoding!r}",
                            token="REFINE_ARTIFACT_VERIFY",
                        )
                    if _normalized_media_type(
                        resp.headers.get("content-type")
                    ) != _normalized_media_type(expected_content_type):
                        return False

                    content_length = resp.headers.get("content-length")
                    if content_length is not None:
                        try:
                            if int(content_length) != expected_size:
                                return False
                        except ValueError:
                            pass

                    digest = hashlib.sha256()
                    compared = 0
                    comparison_limit = expected_size + 1
                    chunk_size = min(
                        _TRANSFER_CHUNK_BYTES,
                        max(1, comparison_limit),
                    )
                    async for chunk in resp.aiter_raw(chunk_size=chunk_size):
                        _deadline_remaining(
                            deadline,
                            reserve_seconds=reserve_seconds,
                        )
                        remaining = comparison_limit - compared
                        if remaining <= 0:
                            return False
                        bounded = chunk[:remaining]
                        digest.update(bounded)
                        compared += len(bounded)
                        if len(chunk) > remaining or compared > expected_size:
                            return False
                    return (
                        compared == expected_size
                        and digest.hexdigest() == expected_sha256
                    )
        except httpx.HTTPError as exc:
            raise TransientError(
                f"storage conflict verification GET {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

    def _existing_matches(
        self,
        url: str,
        object_key: str,
        expected_sha256: str,
        expected_size: int,
        expected_content_type: str,
        *,
        deadline: RefineDeadline | None,
        reserve_seconds: float,
    ) -> bool:
        """Stream at most expected size + one raw byte from a raced object."""

        if deadline is not None:
            return self._run_refine_io(
                lambda: self._existing_matches_refine(
                    url,
                    object_key,
                    expected_sha256,
                    expected_size,
                    expected_content_type,
                    deadline=deadline,
                    reserve_seconds=reserve_seconds,
                ),
                deadline=deadline,
                reserve_seconds=reserve_seconds,
                description=f"storage conflict verification GET {object_key}",
            )
        try:
            with self._s.stream(
                "GET",
                url,
                headers={"accept-encoding": "identity"},
            ) as resp:
                if resp.status_code == 404:
                    raise TransientError(
                        f"storage conflict verification GET {object_key} -> 404",
                        token="REFINE_ARTIFACT_IO",
                    )
                if (
                    resp.status_code in _TRANSIENT_HTTP_STATUSES
                    or resp.status_code >= 500
                ):
                    raise TransientError(
                        f"storage conflict verification GET {object_key} -> "
                        f"{resp.status_code}",
                        token="REFINE_ARTIFACT_IO",
                    )
                if not 200 <= resp.status_code < 300:
                    raise PermanentError(
                        f"storage conflict verification GET {object_key} -> "
                        f"{resp.status_code}: {_error_excerpt(resp)}",
                        token="REFINE_ARTIFACT_VERIFY",
                    )

                content_encoding = resp.headers.get("content-encoding")
                if (
                    content_encoding is not None
                    and content_encoding.strip().lower() != "identity"
                ):
                    raise PermanentError(
                        f"storage conflict verification GET {object_key} returned "
                        f"encoded content: {content_encoding!r}",
                        token="REFINE_ARTIFACT_VERIFY",
                    )
                if _normalized_media_type(
                    resp.headers.get("content-type")
                ) != _normalized_media_type(expected_content_type):
                    return False

                content_length = resp.headers.get("content-length")
                if content_length is not None:
                    try:
                        if int(content_length) != expected_size:
                            return False
                    except ValueError:
                        # A malformed/missing length cannot certify equality;
                        # the bounded body comparison below remains authoritative.
                        pass

                digest = hashlib.sha256()
                compared = 0
                comparison_limit = expected_size + 1
                chunk_size = min(_TRANSFER_CHUNK_BYTES, max(1, comparison_limit))
                for chunk in resp.iter_raw(chunk_size=chunk_size):
                    remaining = comparison_limit - compared
                    if remaining <= 0:
                        return False
                    bounded = chunk[:remaining]
                    digest.update(bounded)
                    compared += len(bounded)
                    if len(chunk) > remaining or compared > expected_size:
                        return False
                matches = (
                    compared == expected_size and digest.hexdigest() == expected_sha256
                )
                return matches
        except httpx.HTTPError as exc:
            raise TransientError(
                f"storage conflict verification GET {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

    async def _publish_refine(
        self,
        url: str,
        object_key: str,
        *,
        content: Any,
        headers: dict[str, str],
    ) -> Any:
        try:
            async with self._refine_client_factory() as client:
                return await client.post(
                    url,
                    content=content,
                    headers=headers,
                    timeout=None,
                )
        except httpx.HTTPError as exc:
            raise TransientError(
                f"storage immutable PUT {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

    def publish_immutable_descriptor(
        self,
        object_key: str,
        source_descriptor: int,
        content_type: str,
        *,
        expected_sha256: str,
        expected_size: int,
        user_id: str,
        scan_id: str,
        expected_identity: tuple[int, int] | None = None,
        deadline: RefineDeadline | None = None,
        reserve_seconds: float = 0,
    ) -> bool:
        """Create one versioned artifact without replacing an existing object.

        The caller controls ordering, so it can publish every data artifact and
        publish its manifest commit marker last. Returns ``True`` when this call
        created the object and ``False`` for an identical concurrent/replayed
        object. A divergent existing object is a permanent stable conflict.

        The source is a BORROWED read-only descriptor, never a path.  Publishing
        by name meant the caller validated one open and this method uploaded from
        a second, so a same-UID actor could swap the object between the two; a
        descriptor cannot be swapped.  Every read here is positional, so the
        owner's file offset is neither observed nor disturbed, and this method
        never closes what it did not open.

        ``expected_sha256`` and ``expected_size`` bind the object to the
        already-built manifest. The source is copied into a private frozen
        descriptor, verified there, and only that descriptor is uploaded in
        bounded chunks. The required owner/scan arguments enforce the
        service-role RLS-equivalent guard before any network call.

        ``expected_identity`` is the ``(st_dev, st_ino)`` whoever measured this
        artifact saw. A descriptor number is a slot in a table: if the borrowed
        descriptor were closed anywhere between the measurement and this call,
        the same integer could be handed to a different object and every check
        below would pass on the wrong bytes. Supplying it makes that a positive
        ``fstat`` check rather than an argument that a digest cannot collide.
        """

        try:
            _assert_safe_owner_key(object_key, user_id, scan_id)
        except OwnershipError as exc:
            raise PermanentError(str(exc), token="OWNERSHIP_VIOLATION") from exc

        if (
            not isinstance(expected_sha256, str)
            or len(expected_sha256) != 64
            or any(character not in "0123456789abcdef" for character in expected_sha256)
            or isinstance(expected_size, bool)
            or not isinstance(expected_size, int)
            or expected_size < 0
        ):
            raise PermanentError(
                "immutable storage publication requires a canonical expected fingerprint",
                token="REFINE_ARTIFACT_VERIFY",
            )

        if isinstance(source_descriptor, bool) or not isinstance(
            source_descriptor, int
        ):
            raise PermanentError(
                "immutable storage publication requires a borrowed descriptor",
                token="REFINE_ARTIFACT_SOURCE",
            )

        if expected_identity is not None:
            if (
                type(expected_identity) is not tuple
                or len(expected_identity) != 2
                or any(
                    isinstance(value, bool) or not isinstance(value, int)
                    for value in expected_identity
                )
            ):
                raise PermanentError(
                    "immutable storage publication identity must be a "
                    "(st_dev, st_ino) pair",
                    token="REFINE_ARTIFACT_SOURCE",
                )
            snapshot = _descriptor_snapshot(source_descriptor)
            if (snapshot[0], snapshot[1]) != expected_identity:
                raise PermanentError(
                    "immutable publication source is not the inode it was measured on",
                    token="REFINE_ARTIFACT_SOURCE",
                )

        _deadline_remaining(deadline, reserve_seconds=reserve_seconds)
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        try:
            with tempfile.TemporaryFile(
                mode="w+b",
                prefix="patina-refine-upload-",
                dir=self._cfg.work_dir,
            ) as frozen:
                _stage_verified_descriptor(
                    source_descriptor,
                    frozen,
                    expected_sha256=expected_sha256,
                    expected_size=expected_size,
                    deadline=deadline,
                    reserve_seconds=reserve_seconds,
                )

                uploaded_digest = hashlib.sha256()
                uploaded_size = 0

                def upload_chunks() -> Iterator[bytes]:
                    nonlocal uploaded_size
                    frozen_chunks = _bounded_file_chunks(frozen)
                    for chunk in frozen_chunks:
                        uploaded_digest.update(chunk)
                        uploaded_size += len(chunk)
                        yield chunk

                async def upload_chunks_refine():
                    nonlocal uploaded_size
                    for chunk in _bounded_file_chunks(
                        frozen,
                        deadline=deadline,
                        reserve_seconds=reserve_seconds,
                    ):
                        uploaded_digest.update(chunk)
                        uploaded_size += len(chunk)
                        yield chunk

                headers = {
                    "content-type": content_type,
                    "content-length": str(expected_size),
                    "x-upsert": "false",
                }
                if deadline is None:
                    resp = self._s.post(
                        url,
                        content=upload_chunks(),
                        headers=headers,
                    )
                else:
                    resp = self._run_refine_io(
                        lambda: self._publish_refine(
                            url,
                            object_key,
                            content=upload_chunks_refine(),
                            headers=headers,
                        ),
                        deadline=deadline,
                        reserve_seconds=reserve_seconds,
                        description=f"storage immutable PUT {object_key}",
                    )
        except (httpx.HTTPError, OSError) as exc:
            raise TransientError(
                f"storage immutable PUT {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

        if 200 <= resp.status_code < 300:
            if (
                uploaded_size != expected_size
                or uploaded_digest.hexdigest() != expected_sha256
            ):
                raise PermanentError(
                    f"immutable publication source changed during upload: {object_key}",
                    token="REFINE_ARTIFACT_CONFLICT",
                )
            return True
        if resp.status_code in _TRANSIENT_HTTP_STATUSES or resp.status_code >= 500:
            raise TransientError(
                f"storage immutable PUT {object_key} -> {resp.status_code}",
                token="REFINE_ARTIFACT_IO",
            )
        if _is_explicit_duplicate(resp):
            if self._existing_matches(
                url,
                object_key,
                expected_sha256,
                expected_size,
                content_type,
                deadline=deadline,
                reserve_seconds=reserve_seconds,
            ):
                return False
            raise PermanentError(
                f"immutable refine artifact conflicts at {object_key}",
                token="REFINE_ARTIFACT_CONFLICT",
            )
        raise PermanentError(
            f"storage immutable PUT {object_key} -> {resp.status_code}: "
            f"{_error_excerpt(resp)}",
            token="REFINE_ARTIFACT_PUBLISH",
        )
