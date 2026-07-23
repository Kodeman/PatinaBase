"""Storage publication contracts, including P2 immutable artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import httpx
import patina_scan_worker.storage as storage_module
import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.errors import PermanentError, TransientError
from patina_scan_worker.storage import StorageClient


_USER_ID = "user-1"
_SCAN_ID = "scan-1"
_PREFIX = f"room_file/{_USER_ID}/{_SCAN_ID}/v2/refine"
_ENV = {
    "WORKER_ID": "storage-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role",
}


class _Response:
    def __init__(
        self,
        status_code: int,
        body: bytes = b"",
        *,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        iter_error: httpx.HTTPError | None = None,
    ) -> None:
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}
        self._iter_error = iter_error
        self.bytes_yielded = 0
        self.iter_chunk_size: int | None = None

    @property
    def text(self) -> str:
        return self._body.decode("utf-8", errors="replace")

    def json(self) -> Any:
        return json.loads(self._body)

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def iter_bytes(self, chunk_size: int) -> Any:
        self.iter_chunk_size = chunk_size
        for offset in range(0, len(self._body), chunk_size):
            if self._iter_error is not None:
                raise self._iter_error
            chunk = self._body[offset : offset + chunk_size]
            self.bytes_yielded += len(chunk)
            yield chunk


class _Session:
    def __init__(
        self,
        upload_response: _Response,
        existing_response: _Response | None = None,
        *,
        post_error: httpx.HTTPError | None = None,
        get_error: httpx.HTTPError | None = None,
        after_upload: Callable[[], None] | None = None,
        consume_upload: bool = True,
    ) -> None:
        self.upload_response = upload_response
        self.existing_response = existing_response
        self.post_error = post_error
        self.get_error = get_error
        self.after_upload = after_upload
        self.consume_upload = consume_upload
        self.posts: list[dict[str, Any]] = []
        self.gets: list[dict[str, Any]] = []

    def post(self, path: str, **kwargs: Any) -> _Response:
        if self.post_error is not None:
            raise self.post_error
        content = kwargs.get("content")
        chunk_sizes: list[int] = []
        if isinstance(content, bytes):
            uploaded = content
            chunk_sizes.append(len(content))
        elif not self.consume_upload:
            uploaded = b""
        else:
            chunks = []
            for chunk in content:
                chunk_sizes.append(len(chunk))
                chunks.append(chunk)
            uploaded = b"".join(chunks)
        if self.after_upload is not None:
            self.after_upload()
        self.posts.append(
            {
                "path": path,
                "headers": kwargs.get("headers"),
                "body": uploaded,
                "chunk_sizes": chunk_sizes,
            }
        )
        return self.upload_response

    def stream(self, method: str, path: str, **kwargs: Any) -> _Response:
        if self.get_error is not None:
            raise self.get_error
        assert self.existing_response is not None
        self.gets.append(
            {"method": method, "path": path, "headers": kwargs.get("headers")}
        )
        return self.existing_response


def _client(session: _Session) -> StorageClient:
    return StorageClient(session, settings_from_env(_ENV))  # type: ignore[arg-type]


def _publish(client: StorageClient, source: Path, name: str = "artifact.bin") -> bool:
    payload = source.read_bytes()
    return client.publish_immutable_file(
        f"{_PREFIX}/{name}",
        source,
        "application/octet-stream",
        expected_sha256=hashlib.sha256(payload).hexdigest(),
        expected_size=len(payload),
        user_id=_USER_ID,
        scan_id=_SCAN_ID,
    )


def test_absent_object_is_created_without_upsert_and_upload_is_chunked(tmp_path):
    payload = b"a" * ((1 << 20) * 2 + 17)
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(_Response(200))

    assert _publish(_client(session), source) is True

    assert session.gets == []
    assert session.posts == [
        {
            "path": f"/storage/v1/object/room-scans/{_PREFIX}/artifact.bin",
            "headers": {
                "content-type": "application/octet-stream",
                "content-length": str(len(payload)),
                "x-upsert": "false",
            },
            "body": payload,
            "chunk_sizes": [1 << 20, 1 << 20, 17],
        }
    ]


def test_httpx_sends_stream_with_exact_content_length_not_chunked(tmp_path):
    payload = b"streamed through real httpx transport"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    observed: dict[str, Any] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        observed["content_length"] = request.headers.get("content-length")
        observed["transfer_encoding"] = request.headers.get("transfer-encoding")
        observed["body"] = request.read()
        return httpx.Response(200, request=request)

    with httpx.Client(
        base_url="https://example.supabase.co",
        transport=httpx.MockTransport(handle),
    ) as session:
        assert _publish(_client(session), source) is True

    assert observed == {
        "content_length": str(len(payload)),
        "transfer_encoding": None,
        "body": payload,
    }


@pytest.mark.parametrize(
    "status,json_body",
    [
        (409, {"code": "ResourceAlreadyExists", "message": "already exists"}),
        (409, {"code": "KeyAlreadyExists", "message": "already exists"}),
        (
            400,
            {
                "statusCode": "409",
                "error": "Duplicate",
                "message": "The resource already exists",
            },
        ),
        (400, {"message": "Asset Already Exists"}),
    ],
)
def test_explicit_duplicate_response_with_identical_sha_and_size_is_idempotent(
    tmp_path, status, json_body
):
    payload = b"same immutable bytes"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    existing = _Response(200, payload)
    session = _Session(_Response(status, json_body=json_body), existing)

    assert _publish(_client(session), source) is False

    assert session.gets == [
        {
            "method": "GET",
            "path": f"/storage/v1/object/room-scans/{_PREFIX}/artifact.bin",
            "headers": {"accept-encoding": "identity"},
        }
    ]
    assert existing.bytes_yielded == len(payload)


def test_early_duplicate_response_does_not_require_upload_body_consumption(tmp_path):
    payload = b"same immutable bytes"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        _Response(200, payload),
        consume_upload=False,
    )

    assert _publish(_client(session), source) is False
    assert session.posts[0]["body"] == b""


@pytest.mark.parametrize(
    "status,json_body",
    [
        (302, {"message": "redirect"}),
        (307, {"message": "redirect"}),
        (400, {"code": "InvalidMimeType", "message": "bad mime"}),
        (409, {"code": "SomeOtherConflict", "message": "lease conflict"}),
    ],
)
def test_non_success_non_duplicate_fails_permanently_without_reading_existing_object(
    tmp_path, status, json_body
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(status, json_body=json_body))

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_PUBLISH"
    assert session.gets == []


@pytest.mark.parametrize(
    "existing",
    [b"different length", b"payloae"],
    ids=["size", "sha256"],
)
def test_duplicate_with_divergent_size_or_sha_is_stable_permanent_conflict(
    tmp_path, existing
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        _Response(200, existing),
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_CONFLICT"
    assert caught.value.fatal is True


def test_oversized_existing_object_read_stops_at_expected_size_plus_one(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"tiny")
    existing = _Response(200, b"x" * 50_000)
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        existing,
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_CONFLICT"
    assert existing.bytes_yielded == source.stat().st_size + 1


def test_existing_content_length_mismatch_fails_without_reading_body(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"tiny")
    existing = _Response(200, b"x" * 50_000, headers={"content-length": "50000"})
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        existing,
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_CONFLICT"
    assert existing.bytes_yielded == 0


@pytest.mark.parametrize("status", [408, 425, 429, 500, 503])
def test_upload_retryable_status_is_transient(tmp_path, status):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")

    with pytest.raises(TransientError) as caught:
        _publish(_client(_Session(_Response(status))), source)

    assert caught.value.token == "REFINE_ARTIFACT_IO"


def test_upload_network_error_is_transient(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(200),
        post_error=httpx.ConnectError("upload unavailable"),
    )

    with pytest.raises(TransientError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_IO"


@pytest.mark.parametrize("status", [404, 408, 425, 429, 500, 503])
def test_duplicate_verification_retryable_status_is_transient(tmp_path, status):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        _Response(status),
    )

    with pytest.raises(TransientError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_IO"


@pytest.mark.parametrize("status", [302, 307, 400, 403])
def test_duplicate_verification_non_success_is_permanent(tmp_path, status):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        _Response(status, json_body={"message": "verification rejected"}),
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"


def test_duplicate_verification_network_error_is_transient(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        get_error=httpx.ReadError("verification unavailable"),
    )

    with pytest.raises(TransientError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_IO"


def test_duplicate_verification_stream_failure_is_transient(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        _Response(200, b"payload", iter_error=httpx.ReadError("stream failed")),
    )

    with pytest.raises(TransientError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_IO"


def test_owner_prefix_is_required_before_any_service_role_write(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_file(
            f"room_file/other-user/{_SCAN_ID}/v2/refine/artifact.bin",
            source,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "OWNERSHIP_VIOLATION"
    assert session.posts == []
    assert session.gets == []


@pytest.mark.parametrize(
    "object_key",
    [
        f"/{_PREFIX}/artifact.bin",
        f"{_PREFIX}/../artifact.bin",
        f"{_PREFIX}/./artifact.bin",
        f"{_PREFIX}//artifact.bin",
        f"{_PREFIX}/artifact.bin?download=1",
        f"{_PREFIX}/artifact.bin#fragment",
        f"room_file\\{_USER_ID}\\{_SCAN_ID}\\artifact.bin",
        f"{_PREFIX}/artifact%2ebin",
    ],
)
def test_unsafe_object_key_is_rejected_before_service_role_write(tmp_path, object_key):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_file(
            object_key,
            source,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "OWNERSHIP_VIOLATION"
    assert session.posts == []
    assert session.gets == []


def test_non_regular_source_is_rejected_before_any_service_role_write():
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), Path("/dev/null"))

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert session.posts == []


def test_symlink_source_is_rejected_before_any_service_role_write(tmp_path):
    target = tmp_path / "target.bin"
    source = tmp_path / "artifact.bin"
    target.write_bytes(b"payload")
    source.symlink_to(target)
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert session.posts == []


def test_source_mutation_while_staging_never_reaches_remote(tmp_path, monkeypatch):
    original = b"a" * ((1 << 20) * 2)
    source = tmp_path / "artifact.bin"
    source.write_bytes(original)
    real_chunks = storage_module._bounded_file_chunks
    source_inode = source.stat().st_ino

    def handle_stat(handle):
        return storage_module.os.fstat(handle.fileno())

    def mutate_between_source_chunks(handle):
        for index, chunk in enumerate(real_chunks(handle)):
            yield chunk
            if index == 0 and handle.fileno() >= 0:
                if source_inode == source.stat().st_ino == handle_stat(handle).st_ino:
                    source.write_bytes(b"b" * len(original))

    monkeypatch.setattr(
        storage_module,
        "_bounded_file_chunks",
        mutate_between_source_chunks,
    )
    session = _Session(_Response(200))

    with pytest.raises(TransientError) as caught:
        _client(session).publish_immutable_file(
            f"{_PREFIX}/artifact.bin",
            source,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(original).hexdigest(),
            expected_size=len(original),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert session.posts == []


def test_source_mutation_after_frozen_snapshot_cannot_change_uploaded_bytes(tmp_path):
    original = b"first payload"
    source = tmp_path / "artifact.bin"
    source.write_bytes(original)
    session = _Session(
        _Response(200),
        after_upload=lambda: source.write_bytes(b"later payload"),
    )

    assert _publish(_client(session), source) is True
    assert session.posts[0]["body"] == original


@pytest.mark.parametrize(
    ("expected_sha256", "expected_size"),
    (
        ("not-a-sha", 7),
        ("0" * 64, -1),
        ("0" * 64, True),
    ),
)
def test_invalid_expected_fingerprint_is_rejected_before_network(
    tmp_path, expected_sha256, expected_size
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_file(
            f"{_PREFIX}/artifact.bin",
            source,
            "application/octet-stream",
            expected_sha256=expected_sha256,
            expected_size=expected_size,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
    assert session.posts == []


@pytest.mark.parametrize(
    ("expected_sha256", "expected_size"),
    (
        (hashlib.sha256(b"different").hexdigest(), 7),
        (hashlib.sha256(b"payload").hexdigest(), 8),
    ),
)
def test_manifest_fingerprint_mismatch_is_rejected_before_network(
    tmp_path, expected_sha256, expected_size
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(TransientError) as caught:
        _client(session).publish_immutable_file(
            f"{_PREFIX}/artifact.bin",
            source,
            "application/octet-stream",
            expected_sha256=expected_sha256,
            expected_size=expected_size,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert session.posts == []


def test_manifest_last_order_remains_under_caller_control(tmp_path):
    session = _Session(_Response(200))
    client = _client(session)
    artifact = tmp_path / "aligned-model.tar"
    manifest = tmp_path / "refine-manifest-v1.json"
    artifact.write_bytes(b"model")
    manifest.write_bytes(b'{"complete":true}\n')

    _publish(client, artifact, artifact.name)
    _publish(client, manifest, manifest.name)

    assert [call["path"].rsplit("/", 1)[-1] for call in session.posts] == [
        "aligned-model.tar",
        "refine-manifest-v1.json",
    ]


def test_existing_p1_upload_bytes_still_upserts(tmp_path):
    del tmp_path
    session = _Session(_Response(200))

    _client(session).upload_bytes("room_file/u/s/v1/plan.svg", b"svg", "image/svg+xml")

    assert session.posts == [
        {
            "path": "/storage/v1/object/room-scans/room_file/u/s/v1/plan.svg",
            "headers": {"content-type": "image/svg+xml", "x-upsert": "true"},
            "body": b"svg",
            "chunk_sizes": [3],
        }
    ]
