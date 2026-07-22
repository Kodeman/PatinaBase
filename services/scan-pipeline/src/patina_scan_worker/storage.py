"""Storage REST client for the ``room-scans`` bucket.

Reads bundle artifacts (service-role key bypasses storage RLS on read); item 11
adds drawing uploads under the ``room_file/{userId}/{scanId}/v{version}/…``
prefix. ``room-scans`` is PRIVATE, so downloads go through the authenticated
object endpoint with the service-role key.
"""

from __future__ import annotations

import errno
import hashlib
import os
import stat
from collections.abc import Iterator
from typing import Any, BinaryIO

import httpx

from .config import Settings
from .errors import PermanentError, TransientError
from .keys import OwnershipError, assert_owner_prefix, safe_relative_path


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


def _bounded_file_chunks(handle: BinaryIO) -> Iterator[bytes]:
    while chunk := handle.read(_TRANSFER_CHUNK_BYTES):
        yield chunk


def _file_fingerprint(handle: BinaryIO) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    for chunk in _bounded_file_chunks(handle):
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


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
    def __init__(self, session: httpx.Client, settings: Settings):
        self._s = session
        self._cfg = settings
        self._bucket = settings.room_scans_bucket

    def download_to(self, object_key: str, dest_path: str) -> int:
        """Download a bucket object to ``dest_path``. Returns bytes written.

        404 → PermanentError token MISSING_FILE (the caller decides transient-vs-
        fatal by attempt count). 5xx / network → TransientError.
        """
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
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

    def _existing_matches(
        self,
        url: str,
        object_key: str,
        expected_sha256: str,
        expected_size: int,
    ) -> bool:
        """Stream at most expected size + one byte from a raced object."""

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
                for chunk in resp.iter_bytes(chunk_size=chunk_size):
                    remaining = comparison_limit - compared
                    if remaining <= 0:
                        return False
                    bounded = chunk[:remaining]
                    digest.update(bounded)
                    compared += len(bounded)
                    if len(chunk) > remaining or compared > expected_size:
                        return False
                return (
                    compared == expected_size and digest.hexdigest() == expected_sha256
                )
        except httpx.HTTPError as exc:
            raise TransientError(
                f"storage conflict verification GET {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

    def publish_immutable_file(
        self,
        object_key: str,
        source_path: str | os.PathLike[str],
        content_type: str,
        *,
        user_id: str,
        scan_id: str,
    ) -> bool:
        """Create one versioned artifact without replacing an existing object.

        The caller controls ordering, so it can publish every data artifact and
        publish its manifest commit marker last. Returns ``True`` when this call
        created the object and ``False`` for an identical concurrent/replayed
        object. A divergent existing object is a permanent stable conflict.

        The source is fingerprinted and uploaded from the same open descriptor
        in bounded chunks. The required owner/scan arguments enforce the
        service-role RLS-equivalent guard before any network call.
        """

        try:
            _assert_safe_owner_key(object_key, user_id, scan_id)
        except OwnershipError as exc:
            raise PermanentError(str(exc), token="OWNERSHIP_VIOLATION") from exc

        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        source_name = os.fspath(source_path)
        try:
            source_lstat = os.lstat(source_name)
            if stat.S_ISLNK(source_lstat.st_mode) or not stat.S_ISREG(
                source_lstat.st_mode
            ):
                raise PermanentError(
                    "immutable storage publication source is not a regular file",
                    token="REFINE_ARTIFACT_SOURCE",
                )
            flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
            flags |= getattr(os, "O_NOFOLLOW", 0)
            try:
                descriptor = os.open(source_name, flags)
            except OSError as exc:
                if exc.errno == errno.ELOOP:
                    raise PermanentError(
                        "immutable storage publication source is a symbolic link",
                        token="REFINE_ARTIFACT_SOURCE",
                    ) from exc
                raise
            with os.fdopen(descriptor, "rb") as source:
                initial_snapshot = _file_snapshot(source)
                if initial_snapshot[:2] != (
                    source_lstat.st_dev,
                    source_lstat.st_ino,
                ):
                    raise TransientError(
                        f"immutable publication source changed while opening: {source_path}",
                        token="REFINE_ARTIFACT_IO",
                    )
                expected_sha256, expected_size = _file_fingerprint(source)
                if expected_size != initial_snapshot[3]:
                    raise TransientError(
                        f"immutable publication source changed while hashing: {source_path}",
                        token="REFINE_ARTIFACT_IO",
                    )
                hashed_snapshot = _file_snapshot(source)
                if hashed_snapshot != initial_snapshot:
                    raise TransientError(
                        f"immutable publication source changed while hashing: {source_path}",
                        token="REFINE_ARTIFACT_IO",
                    )
                source.seek(0)

                uploaded_digest = hashlib.sha256()
                uploaded_size = 0

                def upload_chunks() -> Iterator[bytes]:
                    nonlocal uploaded_size
                    for chunk in _bounded_file_chunks(source):
                        uploaded_digest.update(chunk)
                        uploaded_size += len(chunk)
                        yield chunk

                resp = self._s.post(
                    url,
                    content=upload_chunks(),
                    headers={
                        "content-type": content_type,
                        "content-length": str(expected_size),
                        "x-upsert": "false",
                    },
                )
                uploaded_snapshot = _file_snapshot(source)
        except (httpx.HTTPError, OSError) as exc:
            raise TransientError(
                f"storage immutable PUT {object_key}: {exc}",
                token="REFINE_ARTIFACT_IO",
            ) from exc

        if uploaded_snapshot != hashed_snapshot:
            raise TransientError(
                f"immutable publication source changed during upload: {source_path}",
                token="REFINE_ARTIFACT_IO",
            )

        if 200 <= resp.status_code < 300:
            if (
                uploaded_size != expected_size
                or uploaded_digest.hexdigest() != expected_sha256
            ):
                raise PermanentError(
                    f"immutable publication source changed during upload: {source_path}",
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
