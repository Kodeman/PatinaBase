"""Pluggable object-storage transport for the scan-pipeline worker (W3-C).

``StorageClient`` (``storage.py``) owns every byte the worker's ordinary
artifact I/O and refine's immutable-publish path move today, all of it against
Supabase Storage REST on ``SUPABASE_SERVICE_ROLE_KEY``. This module defines the
narrower ``StorageBackend`` interface the plan's originals cutover (DELIVERY-
PLAN W3) will eventually point stage code at instead — download / upload /
exists, the operations ``ingest``, ``solve`` and ``drawings`` actually use via
``StorageClient.download_to`` and ``.upload_bytes`` — plus two concrete
backends:

* ``SupabaseStorageBackend`` — a thin adapter over ``StorageClient``. Every
  method is a direct one-line delegation to an already-tested ``StorageClient``
  method, so this backend changes nothing about the wire behavior
  ``tests/test_storage.py`` already pins; it exists to give the Supabase path a
  name under the new interface, not to reimplement it.
* ``R2StorageBackend`` — boto3 against R2's S3-compatible endpoint, mirroring
  ``services/scan-modal/src/scan_modal/io/r2.py``'s defensive checksum
  configuration. Duplicated rather than imported: ``services/scan-pipeline``
  and ``services/scan-modal`` are independently deployable packages with no
  shared dependency today, and the pattern being mirrored is a handful of
  lines (region_name="auto" + the two checksum settings — the 2025 AWS-SDK
  checksum-default change collides with R2's partial checksum matrix and fails
  otherwise-valid PUTs, so both are load-bearing, not defensive noise).

Selection: ``SCAN_STORAGE_BACKEND`` — ``"supabase"`` (default) or ``"r2"``
(config.py). Unset, ``build_storage_backend`` returns the Supabase adapter and
nothing about the worker's runtime behavior changes — this module is not wired
into ``worker.py``'s ``Context.storage`` yet (that stays ``StorageClient``,
pinned by ``refine_publisher.py``'s ``isinstance`` check); wiring a stage's
ordinary I/O through this interface, and therefore through R2, is the
originals-cutover wave's job, not this one's.

boto3 is imported lazily (inside functions), the same way ``r2.py`` does it —
a Supabase-only worker never needs it installed (see the ``r2`` extra in
pyproject.toml).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Protocol, runtime_checkable

import httpx

from .config import Settings
from .errors import PermanentError, TransientError
from .storage import StorageClient

log = logging.getLogger("patina_scan_worker.storage_backend")


@runtime_checkable
class StorageBackend(Protocol):
    """The transport surface ordinary (non-refine) artifact I/O needs."""

    def download(self, key: str) -> bytes:
        """Read one object fully into memory."""
        ...

    def download_to(self, key: str, dest_path: str) -> int:
        """Stream one object to ``dest_path``. Returns bytes written."""
        ...

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        """Upsert one object from an in-memory buffer."""
        ...

    def exists(self, key: str) -> bool:
        """True iff ``key`` names an existing object."""
        ...


class SupabaseStorageBackend:
    """Adapts ``StorageClient`` (Storage REST, service-role) to ``StorageBackend``.

    Pure delegation — every method calls straight through to an already-tested
    ``StorageClient`` method, so this backend's wire behavior IS storage.py's
    existing behavior; there is no new REST logic here.
    """

    def __init__(self, client: StorageClient) -> None:
        self._client = client

    @property
    def client(self) -> StorageClient:
        """The wrapped ``StorageClient``, for callers (refine_publisher,
        doctor) that still need its refine-specific surface."""
        return self._client

    def download(self, key: str) -> bytes:
        return self._client.download(key)

    def download_to(self, key: str, dest_path: str) -> int:
        return self._client.download_to(key, dest_path)

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self._client.upload_bytes(key, data, content_type)

    def exists(self, key: str) -> bool:
        return self._client.exists(key)


def _error_code(exc: Exception) -> str | None:
    response = getattr(exc, "response", None)
    if not isinstance(response, dict):
        return None
    error = response.get("Error")
    if not isinstance(error, dict):
        return None
    code = error.get("Code")
    return code if isinstance(code, str) else None


def _response_status(exc: Exception) -> int | None:
    response = getattr(exc, "response", None)
    if not isinstance(response, dict):
        return None
    metadata = response.get("ResponseMetadata")
    if not isinstance(metadata, dict):
        return None
    status = metadata.get("HTTPStatusCode")
    return status if isinstance(status, int) else None


def _is_not_found(exc: Exception) -> bool:
    if _error_code(exc) in {"NoSuchKey", "404", "NotFound"}:
        return True
    return _response_status(exc) == 404


#: boto3/botocore error codes that mean "try again" rather than "this request
#: is wrong" — mirrors errors.py's TransientError/PermanentError split.
_TRANSIENT_ERROR_CODES = frozenset(
    {
        "SlowDown",
        "RequestTimeout",
        "InternalError",
        "ServiceUnavailable",
        "Throttling",
        "ThrottlingException",
        "RequestTimeTooSkewed",
    }
)


def _translate_boto_error(exc: Exception, key: str, verb: str) -> Exception:
    """Classify a boto3/botocore exception into the worker's error taxonomy."""

    if _is_not_found(exc):
        return PermanentError(f"r2 {verb} {key} -> not found", token="MISSING_FILE")
    code = _error_code(exc)
    status = _response_status(exc)
    if code in _TRANSIENT_ERROR_CODES or (status is not None and status >= 500):
        return TransientError(f"r2 {verb} {key}: {exc}")
    if code is None and _response_status(exc) is None:
        # No structured AWS error response at all — a connection-level failure
        # (BotoCoreError and friends), which is retryable by nature.
        return TransientError(f"r2 {verb} {key}: {exc}")
    return PermanentError(f"r2 {verb} {key}: {exc}", token="R2_STORAGE_ERROR")


class R2StorageBackend:
    """R2 object storage over boto3's S3-compatible client.

    Mirrors ``services/scan-modal/src/scan_modal/io/r2.py``'s client
    construction: ``region_name="auto"`` and the two checksum settings are
    load-bearing, not defensive noise (see the module docstring above).
    """

    def __init__(
        self,
        *,
        bucket: str,
        endpoint: str,
        access_key_id: str,
        secret_access_key: str,
        client: Any | None = None,
    ) -> None:
        self._bucket = bucket
        self._client = (
            client
            if client is not None
            else self._build_client(endpoint, access_key_id, secret_access_key)
        )

    @staticmethod
    def _build_client(endpoint: str, access_key_id: str, secret_access_key: str) -> Any:
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name="auto",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def download(self, key: str) -> bytes:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except Exception as exc:  # noqa: BLE001 — translated below
            raise _translate_boto_error(exc, key, "GET") from exc
        return resp["Body"].read()

    def download_to(self, key: str, dest_path: str) -> int:
        directory = os.path.dirname(dest_path)
        os.makedirs(directory or ".", exist_ok=True)
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except Exception as exc:  # noqa: BLE001 — translated below
            raise _translate_boto_error(exc, key, "GET") from exc
        written = 0
        with open(dest_path, "wb") as handle:
            for chunk in resp["Body"].iter_chunks(chunk_size=1 << 20):
                handle.write(chunk)
                written += len(chunk)
        return written

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(
                Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
            )
        except Exception as exc:  # noqa: BLE001 — translated below
            raise _translate_boto_error(exc, key, "PUT") from exc

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception as exc:  # noqa: BLE001 — translated below
            if _is_not_found(exc):
                return False
            raise _translate_boto_error(exc, key, "HEAD") from exc


def _build_supabase_backend(
    settings: Settings, session: httpx.Client | None
) -> SupabaseStorageBackend:
    owned_session = session
    if owned_session is None:
        # Not the worker's shared session (http.build_session) — this one
        # applies `storage_token` when set, so a future narrower Storage
        # credential is a config change, not a code change (see config.py's
        # credential-posture note). A caller that passes its own session opts
        # out of that and keeps whatever credential its session already holds.
        token = settings.storage_token or settings.service_role_key
        owned_session = httpx.Client(
            base_url=settings.supabase_url,
            headers={"apikey": token, "Authorization": f"Bearer {token}"},
            timeout=settings.http_timeout_s,
        )
    return SupabaseStorageBackend(StorageClient(owned_session, settings))


def _build_r2_backend(settings: Settings) -> R2StorageBackend:
    missing = [
        name
        for name, value in (
            ("SCAN_STORAGE_R2_ENDPOINT", settings.r2_endpoint),
            ("SCAN_STORAGE_R2_BUCKET", settings.r2_bucket),
            ("SCAN_STORAGE_R2_ACCESS_KEY_ID", settings.r2_access_key_id),
            ("SCAN_STORAGE_R2_SECRET_ACCESS_KEY", settings.r2_secret_access_key),
        )
        if not value
    ]
    if missing:
        # settings_from_env already enforces this; this guard covers direct
        # Settings construction (tests, dataclasses.replace) bypassing it.
        raise PermanentError(
            f"R2 storage backend requires {', '.join(missing)}",
            token="CONFIG_ERROR",
        )
    return R2StorageBackend(
        bucket=settings.r2_bucket,
        endpoint=settings.r2_endpoint,
        access_key_id=settings.r2_access_key_id,
        secret_access_key=settings.r2_secret_access_key,
    )


def build_storage_backend(
    settings: Settings,
    session: httpx.Client | None = None,
    *,
    record_hook: Callable[[dict], None] | None = None,
) -> StorageBackend:
    """Construct the backend ``SCAN_STORAGE_BACKEND`` selects, shadow-wrapped
    when ``SCAN_STORAGE_SHADOW`` is set.

    ``session``, when given, is reused for the Supabase backend exactly as
    ``worker.py`` reuses its shared session today (no new httpx.Client, no
    change to which credential is sent). Omit it to get a storage-scoped
    session that honors ``storage_token`` if the environment sets one.

    ``record_hook`` is the seam the cutover wave's RPC will occupy; unset, the
    shadow ledger (JSONL) is the only record kept. See storage_shadow.py.
    """

    if settings.storage_backend == "supabase":
        primary: StorageBackend = _build_supabase_backend(settings, session)
    elif settings.storage_backend == "r2":
        primary = _build_r2_backend(settings)
    else:
        raise PermanentError(
            f"unknown SCAN_STORAGE_BACKEND {settings.storage_backend!r}",
            token="CONFIG_ERROR",
        )

    if settings.storage_shadow == "r2":
        from .storage_shadow import ShadowLedger, ShadowStorageBackend

        shadow = _build_r2_backend(settings)
        ledger = ShadowLedger(settings.effective_storage_shadow_ledger_path)
        return ShadowStorageBackend(
            primary=primary,
            shadow=shadow,
            ledger=ledger,
            record_hook=record_hook,
        )

    return primary
