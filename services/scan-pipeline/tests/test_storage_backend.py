"""StorageBackend interface conformance: StorageClient's two new methods
(``download``, ``exists``), the SupabaseStorageBackend adapter, R2StorageBackend
(hand-rolled fake boto3 client — no boto3 import needed; matches this package's
test-fixture style, see tests/test_storage.py), and build_storage_backend's
config-driven selection.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.errors import PermanentError, TransientError
from patina_scan_worker.storage import StorageClient
from patina_scan_worker.storage_backend import (
    R2StorageBackend,
    StorageBackend,
    SupabaseStorageBackend,
    build_storage_backend,
)

_USER_ID = "user-1"
_SCAN_ID = "scan-1"
_PREFIX = f"room_file/{_USER_ID}/{_SCAN_ID}/v2/refine"
_ENV = {
    "WORKER_ID": "storage-backend-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role",
}
R2_ENV = {
    "SCAN_STORAGE_R2_ENDPOINT": "https://r2.example.com",
    "SCAN_STORAGE_R2_BUCKET": "patina-staging-media-artifacts-us",
    "SCAN_STORAGE_R2_ACCESS_KEY_ID": "key-id",
    "SCAN_STORAGE_R2_SECRET_ACCESS_KEY": "secret",
}


# ── StorageClient.download / .exists (Supabase REST, additive methods) ──────


class _RestResponse:
    def __init__(self, status_code: int, body: bytes = b"", json_body: Any = None):
        if json_body is not None:
            import json as _json

            body = _json.dumps(json_body).encode("utf-8")
        self.status_code = status_code
        self._body = body

    @property
    def content(self) -> bytes:
        return self._body

    @property
    def text(self) -> str:
        return self._body.decode("utf-8", errors="replace")

    def json(self) -> Any:
        import json as _json

        return _json.loads(self._body)


class _RestSession:
    """Minimal httpx.Client double for `.get()` / `.post()` — distinct from
    tests/test_storage.py's `_Session`, which only models `.post()`/`.stream()`
    for the refine/immutable-publish call shapes and does not accept a
    `json=` kwarg the way `exists()`'s list call does."""

    def __init__(self, response: _RestResponse, *, error: Exception | None = None):
        self.response = response
        self.error = error
        self.gets: list[dict[str, Any]] = []
        self.posts: list[dict[str, Any]] = []

    def get(self, path: str, **kwargs: Any) -> _RestResponse:
        if self.error is not None:
            raise self.error
        self.gets.append({"path": path, **kwargs})
        return self.response

    def post(self, path: str, **kwargs: Any) -> _RestResponse:
        if self.error is not None:
            raise self.error
        self.posts.append({"path": path, **kwargs})
        return self.response


def _rest_client(session: _RestSession) -> StorageClient:
    return StorageClient(session, settings_from_env(_ENV))  # type: ignore[arg-type]


def test_download_returns_full_object_bytes():
    payload = b"manifest bytes"
    session = _RestSession(_RestResponse(200, payload))
    assert _rest_client(session).download(f"{_PREFIX}/manifest.json") == payload
    assert session.gets == [
        {"path": f"/storage/v1/object/room-scans/{_PREFIX}/manifest.json"}
    ]


def test_download_404_is_permanent_missing_file():
    session = _RestSession(_RestResponse(404))
    with pytest.raises(PermanentError) as caught:
        _rest_client(session).download(f"{_PREFIX}/missing.bin")
    assert caught.value.token == "MISSING_FILE"


@pytest.mark.parametrize("status", [500, 502, 503])
def test_download_5xx_is_transient(status):
    session = _RestSession(_RestResponse(status))
    with pytest.raises(TransientError):
        _rest_client(session).download(f"{_PREFIX}/flaky.bin")


def test_download_other_4xx_is_permanent_missing_file():
    session = _RestSession(_RestResponse(403, b"forbidden"))
    with pytest.raises(PermanentError) as caught:
        _rest_client(session).download(f"{_PREFIX}/forbidden.bin")
    assert caught.value.token == "MISSING_FILE"


def test_download_network_error_is_transient():
    session = _RestSession(_RestResponse(200), error=httpx.ConnectError("down"))
    with pytest.raises(TransientError):
        _rest_client(session).download(f"{_PREFIX}/x.bin")


def test_exists_true_when_name_present_in_listing():
    session = _RestSession(
        _RestResponse(200, json_body=[{"name": "plan.svg"}, {"name": "other.pdf"}])
    )
    assert _rest_client(session).exists(f"{_PREFIX}/plan.svg") is True
    assert session.posts == [
        {
            "path": "/storage/v1/object/list/room-scans",
            "json": {"prefix": _PREFIX, "search": "plan.svg", "limit": 100},
        }
    ]


def test_exists_false_when_name_absent_from_listing():
    session = _RestSession(_RestResponse(200, json_body=[{"name": "other.pdf"}]))
    assert _rest_client(session).exists(f"{_PREFIX}/plan.svg") is False


def test_exists_false_on_empty_listing():
    session = _RestSession(_RestResponse(200, json_body=[]))
    assert _rest_client(session).exists(f"{_PREFIX}/plan.svg") is False


def test_exists_top_level_key_uses_empty_prefix():
    session = _RestSession(_RestResponse(200, json_body=[{"name": "root.txt"}]))
    assert _rest_client(session).exists("root.txt") is True
    assert session.posts[0]["json"] == {"prefix": "", "search": "root.txt", "limit": 100}


@pytest.mark.parametrize("status", [500, 503])
def test_exists_5xx_is_transient(status):
    session = _RestSession(_RestResponse(status))
    with pytest.raises(TransientError):
        _rest_client(session).exists(f"{_PREFIX}/plan.svg")


def test_exists_4xx_is_permanent():
    session = _RestSession(_RestResponse(400, b"bad request"))
    with pytest.raises(PermanentError) as caught:
        _rest_client(session).exists(f"{_PREFIX}/plan.svg")
    assert caught.value.token == "MISSING_FILE"


# ── SupabaseStorageBackend: pure delegation to StorageClient ────────────────


class _RecordingStorageClient:
    """Duck-typed StorageClient double: SupabaseStorageBackend only calls
    these four methods, so this avoids constructing httpx machinery just to
    prove delegation happens with the right arguments."""

    def __init__(self):
        self.calls: list[tuple[str, Any]] = []
        self.download_result = b"bytes"
        self.download_to_result = 7
        self.exists_result = True

    def download(self, key: str) -> bytes:
        self.calls.append(("download", key))
        return self.download_result

    def download_to(self, key: str, dest_path: str) -> int:
        self.calls.append(("download_to", (key, dest_path)))
        return self.download_to_result

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.calls.append(("upload_bytes", (key, data, content_type)))

    def exists(self, key: str) -> bool:
        self.calls.append(("exists", key))
        return self.exists_result


def test_supabase_backend_conforms_to_storage_backend_protocol():
    fake = _RecordingStorageClient()
    backend = SupabaseStorageBackend(fake)  # type: ignore[arg-type]
    assert isinstance(backend, StorageBackend)


def test_supabase_backend_delegates_every_method_unchanged():
    fake = _RecordingStorageClient()
    backend = SupabaseStorageBackend(fake)  # type: ignore[arg-type]

    assert backend.download("k1") == b"bytes"
    assert backend.download_to("k2", "/tmp/dest") == 7
    backend.upload("k3", b"payload", "application/octet-stream")
    assert backend.exists("k4") is True
    assert backend.client is fake

    assert fake.calls == [
        ("download", "k1"),
        ("download_to", ("k2", "/tmp/dest")),
        ("upload_bytes", ("k3", b"payload", "application/octet-stream")),
        ("exists", "k4"),
    ]


# ── R2StorageBackend: hand-rolled fake boto3 S3 client ───────────────────────


class _FakeS3Error(Exception):
    """Shaped like botocore.exceptions.ClientError (`.response`), without
    importing botocore — R2StorageBackend's error translation only reads
    `getattr(exc, "response", None)`, so this is sufficient and keeps these
    tests boto3-free."""

    def __init__(self, code: str, status: int | None = None, message: str = "error"):
        super().__init__(message)
        self.response: dict[str, Any] = {"Error": {"Code": code}, "ResponseMetadata": {}}
        if status is not None:
            self.response["ResponseMetadata"]["HTTPStatusCode"] = status


class _FakeConnectionError(Exception):
    """No `.response` attribute at all — mirrors a botocore BotoCoreError
    (endpoint unreachable, timeout, etc.)."""


class _FakeStreamingBody:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data

    def iter_chunks(self, chunk_size: int):
        for offset in range(0, len(self._data), chunk_size):
            yield self._data[offset : offset + chunk_size]


class _FakeS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_calls: list[dict[str, Any]] = []
        self.get_error: Exception | None = None
        self.put_error: Exception | None = None
        self.head_error: Exception | None = None

    def get_object(self, Bucket: str, Key: str):
        if self.get_error is not None:
            raise self.get_error
        try:
            data = self.objects[(Bucket, Key)]
        except KeyError:
            raise _FakeS3Error("NoSuchKey", status=404)
        return {"Body": _FakeStreamingBody(data)}

    def put_object(self, Bucket: str, Key: str, Body, ContentType: str, **_: Any):
        if self.put_error is not None:
            raise self.put_error
        data = Body.read() if hasattr(Body, "read") else Body
        self.objects[(Bucket, Key)] = data
        self.put_calls.append({"Bucket": Bucket, "Key": Key, "ContentType": ContentType})
        return {"ETag": '"fake-etag"'}

    def head_object(self, Bucket: str, Key: str):
        if self.head_error is not None:
            raise self.head_error
        if (Bucket, Key) not in self.objects:
            raise _FakeS3Error("NoSuchKey", status=404)
        return {}


def _r2_backend(client: _FakeS3Client) -> R2StorageBackend:
    return R2StorageBackend(
        bucket="patina-staging-media-artifacts-us",
        endpoint="https://r2.example.com",
        access_key_id="key-id",
        secret_access_key="secret",
        client=client,
    )


def test_r2_backend_conforms_to_storage_backend_protocol():
    assert isinstance(_r2_backend(_FakeS3Client()), StorageBackend)


def test_r2_upload_then_download_round_trips():
    backend = _r2_backend(_FakeS3Client())
    backend.upload("scans/room.glb", b"glb-bytes", "model/gltf-binary")
    assert backend.download("scans/room.glb") == b"glb-bytes"


def test_r2_download_to_streams_to_a_file(tmp_path):
    client = _FakeS3Client()
    client.objects[("patina-staging-media-artifacts-us", "scans/room.glb")] = b"x" * 5000
    backend = _r2_backend(client)
    dest = tmp_path / "nested" / "room.glb"

    written = backend.download_to("scans/room.glb", str(dest))

    assert written == 5000
    assert dest.read_bytes() == b"x" * 5000


def test_r2_download_missing_key_is_permanent_missing_file():
    backend = _r2_backend(_FakeS3Client())
    with pytest.raises(PermanentError) as caught:
        backend.download("nope.bin")
    assert caught.value.token == "MISSING_FILE"


def test_r2_exists_true_and_false():
    client = _FakeS3Client()
    backend = _r2_backend(client)
    assert backend.exists("nope.bin") is False
    backend.upload("present.bin", b"data", "application/octet-stream")
    assert backend.exists("present.bin") is True


@pytest.mark.parametrize(
    "code,status",
    [("SlowDown", 503), ("Throttling", 400), ("InternalError", 500), ("ServiceUnavailable", 503)],
)
def test_r2_retryable_errors_are_transient(code, status):
    client = _FakeS3Client()
    client.get_error = _FakeS3Error(code, status=status)
    backend = _r2_backend(client)
    with pytest.raises(TransientError):
        backend.download("k.bin")


def test_r2_unretryable_client_error_is_permanent():
    client = _FakeS3Client()
    client.put_error = _FakeS3Error("AccessDenied", status=403)
    backend = _r2_backend(client)
    with pytest.raises(PermanentError) as caught:
        backend.upload("k.bin", b"data", "application/octet-stream")
    assert caught.value.token == "R2_STORAGE_ERROR"


def test_r2_connection_level_error_is_transient():
    client = _FakeS3Client()
    client.get_error = _FakeConnectionError("endpoint unreachable")
    backend = _r2_backend(client)
    with pytest.raises(TransientError):
        backend.download("k.bin")


def test_r2_head_object_5xx_is_transient_not_treated_as_absent():
    client = _FakeS3Client()
    client.head_error = _FakeS3Error("InternalError", status=500)
    backend = _r2_backend(client)
    with pytest.raises(TransientError):
        backend.exists("k.bin")


# ── build_storage_backend: config-driven selection ───────────────────────────


def test_build_storage_backend_defaults_to_supabase():
    settings = settings_from_env(_ENV)
    backend = build_storage_backend(settings, session=_RestSession(_RestResponse(200)))
    assert isinstance(backend, SupabaseStorageBackend)


def test_build_storage_backend_reuses_the_given_session_verbatim():
    session = _RestSession(_RestResponse(200, b"hello"))
    settings = settings_from_env(_ENV)
    backend = build_storage_backend(settings, session=session)
    assert backend.download(f"{_PREFIX}/x.bin") == b"hello"
    assert session.gets  # the passed-in session, not a new one, took the call


def test_build_storage_backend_r2_selection_uses_a_real_boto3_client():
    pytest.importorskip("boto3")
    settings = settings_from_env({**_ENV, "SCAN_STORAGE_BACKEND": "r2", **R2_ENV})
    backend = build_storage_backend(settings)
    assert isinstance(backend, R2StorageBackend)
    assert backend.bucket == "patina-staging-media-artifacts-us"


def test_build_storage_backend_shadow_wraps_the_primary():
    from patina_scan_worker.storage_shadow import ShadowStorageBackend

    settings = settings_from_env({**_ENV, "SCAN_STORAGE_SHADOW": "r2", **R2_ENV})
    fake_r2 = _FakeS3Client()

    # The shadow leg constructs its own R2StorageBackend internally (via
    # _build_r2_backend), which — like the r2-selection test above — needs a
    # real boto3 import; skip cleanly if it is not installed rather than
    # asserting behavior this environment cannot exercise.
    pytest.importorskip("boto3")
    del fake_r2  # not used on this path; kept to document the intent above

    backend = build_storage_backend(
        settings, session=_RestSession(_RestResponse(200, b"primary-bytes"))
    )
    assert isinstance(backend, ShadowStorageBackend)


def test_build_storage_backend_unknown_backend_is_permanent_config_error():
    settings = settings_from_env(_ENV)
    object.__setattr__(settings, "storage_backend", "azure-blob")
    with pytest.raises(PermanentError) as caught:
        build_storage_backend(settings)
    assert caught.value.token == "CONFIG_ERROR"


def test_build_storage_backend_r2_missing_env_is_permanent_config_error():
    settings = settings_from_env(_ENV)
    # Bypass settings_from_env's own R2-required-vars check to prove
    # build_storage_backend's defensive re-check (direct Settings
    # construction / dataclasses.replace can still reach this).
    object.__setattr__(settings, "storage_backend", "r2")
    with pytest.raises(PermanentError) as caught:
        build_storage_backend(settings)
    assert caught.value.token == "CONFIG_ERROR"
    assert "SCAN_STORAGE_R2_ENDPOINT" in str(caught.value)
