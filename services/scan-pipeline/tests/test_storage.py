"""Storage publication contracts, including P2 immutable artifacts."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

import httpx
import patina_scan_worker.storage as storage_module
import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.errors import PermanentError, TransientError
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.storage import StorageClient


_USER_ID = "user-1"
_SCAN_ID = "scan-1"
_PREFIX = f"room_file/{_USER_ID}/{_SCAN_ID}/v2/refine"
_ENV = {
    "WORKER_ID": "storage-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role",
    "WORK_DIR": tempfile.gettempdir(),
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
        self.headers = {"content-type": "application/octet-stream"}
        if headers is not None:
            self.headers.update(headers)
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

    async def __aenter__(self) -> "_Response":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def aread(self) -> bytes:
        return self._body

    def iter_bytes(self, chunk_size: int) -> Any:
        self.iter_chunk_size = chunk_size
        for offset in range(0, len(self._body), chunk_size):
            if self._iter_error is not None:
                raise self._iter_error
            chunk = self._body[offset : offset + chunk_size]
            self.bytes_yielded += len(chunk)
            yield chunk

    def iter_raw(self, chunk_size: int) -> Any:
        yield from self.iter_bytes(chunk_size)

    async def aiter_bytes(self, chunk_size: int) -> Any:
        self.iter_chunk_size = chunk_size
        for offset in range(0, len(self._body), chunk_size):
            if self._iter_error is not None:
                raise self._iter_error
            chunk = self._body[offset : offset + chunk_size]
            self.bytes_yielded += len(chunk)
            yield chunk

    async def aiter_raw(self, chunk_size: int) -> Any:
        async for chunk in self.aiter_bytes(chunk_size):
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
        recorded_post = {
            "path": path,
            "headers": kwargs.get("headers"),
            "body": uploaded,
            "chunk_sizes": chunk_sizes,
        }
        if "timeout" in kwargs:
            recorded_post["timeout"] = kwargs["timeout"]
        self.posts.append(recorded_post)
        return self.upload_response

    def stream(self, method: str, path: str, **kwargs: Any) -> _Response:
        if self.get_error is not None:
            raise self.get_error
        assert self.existing_response is not None
        recorded_get = {
            "method": method,
            "path": path,
            "headers": kwargs.get("headers"),
        }
        if "timeout" in kwargs:
            recorded_get["timeout"] = kwargs["timeout"]
        self.gets.append(recorded_get)
        return self.existing_response


class _AsyncSession:
    def __init__(self, session: _Session) -> None:
        self._session = session

    async def __aenter__(self) -> "_AsyncSession":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, method: str, path: str, **kwargs: Any) -> _Response:
        return self._session.stream(method, path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> _Response:
        if self._session.post_error is not None:
            raise self._session.post_error
        content = kwargs.get("content")
        chunk_sizes: list[int] = []
        if isinstance(content, bytes):
            uploaded = content
            chunk_sizes.append(len(content))
        elif not self._session.consume_upload:
            uploaded = b""
        else:
            chunks = []
            async for chunk in content:
                chunk_sizes.append(len(chunk))
                chunks.append(chunk)
            uploaded = b"".join(chunks)
        if self._session.after_upload is not None:
            self._session.after_upload()
        recorded_post = {
            "path": path,
            "headers": kwargs.get("headers"),
            "body": uploaded,
            "chunk_sizes": chunk_sizes,
        }
        if "timeout" in kwargs:
            recorded_post["timeout"] = kwargs["timeout"]
        self._session.posts.append(recorded_post)
        return self._session.upload_response


def _client(session: _Session) -> StorageClient:
    return StorageClient(
        session,  # type: ignore[arg-type]
        settings_from_env(_ENV),
        refine_client_factory=lambda: _AsyncSession(session),
    )


#: Descriptors borrowed by a test, released after it whether it passed or not.
#: Immutable publication no longer takes a path, so every call site has to hold
#: an open descriptor the way a real caller does.
_BORROWED_DESCRIPTORS: list[int] = []


def _descriptor(source: Path) -> int:
    descriptor = os.open(source, os.O_RDONLY)
    _BORROWED_DESCRIPTORS.append(descriptor)
    return descriptor


@pytest.fixture(autouse=True)
def _release_borrowed_descriptors():
    yield
    while _BORROWED_DESCRIPTORS:
        try:
            os.close(_BORROWED_DESCRIPTORS.pop())
        except OSError:
            pass


def _publish(client: StorageClient, source: Path, name: str = "artifact.bin") -> bool:
    payload = source.read_bytes()
    return client.publish_immutable_descriptor(
        f"{_PREFIX}/{name}",
        _descriptor(source),
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


def test_frozen_snapshot_uses_the_provisioned_work_volume(tmp_path, monkeypatch):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    work_dir = tmp_path / "qualified-work"
    work_dir.mkdir()
    observed_dirs = []
    real_temporary_file = storage_module.tempfile.TemporaryFile

    def recording_temporary_file(*args, **kwargs):
        observed_dirs.append(kwargs.get("dir"))
        return real_temporary_file(*args, **kwargs)

    monkeypatch.setattr(
        storage_module.tempfile,
        "TemporaryFile",
        recording_temporary_file,
    )
    session = _Session(_Response(200))
    settings = settings_from_env({**_ENV, "WORK_DIR": str(work_dir)})
    client = StorageClient(session, settings)  # type: ignore[arg-type]

    assert _publish(client, source) is True
    assert observed_dirs == [str(work_dir)]


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


@pytest.mark.parametrize("content_type", ["", "text/html", " application/json "])
def test_duplicate_with_missing_or_wrong_content_type_is_a_stable_conflict(
    tmp_path, content_type
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    existing = _Response(
        200,
        b"payload",
        headers={"content-type": content_type},
    )
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        existing,
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_CONFLICT"
    assert existing.bytes_yielded == 0


@pytest.mark.parametrize("content_encoding", ["gzip", "br", "deflate"])
def test_duplicate_with_encoded_body_is_rejected_before_decoding_or_hashing(
    tmp_path, content_encoding
):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    existing = _Response(
        200,
        b"encoded-body-that-must-not-be-decoded",
        headers={"content-encoding": content_encoding},
    )
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        existing,
    )

    with pytest.raises(PermanentError) as caught:
        _publish(_client(session), source)

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
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


def test_a_matching_measured_identity_is_accepted(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))
    descriptor = _descriptor(source)
    metadata = os.fstat(descriptor)

    created = _client(session).publish_immutable_descriptor(
        f"{_PREFIX}/artifact.bin",
        descriptor,
        "application/octet-stream",
        expected_sha256=hashlib.sha256(b"payload").hexdigest(),
        expected_size=7,
        user_id=_USER_ID,
        scan_id=_SCAN_ID,
        expected_identity=(metadata.st_dev, metadata.st_ino),
    )

    assert created is True
    assert len(session.posts) == 1


def test_a_descriptor_that_is_not_the_measured_inode_is_refused(tmp_path):
    """An fd number is a slot in a table; a reused slot is a different object.

    The bytes here are byte-identical to what the caller measured, so the
    digest, the size and every staging check would pass.  Only the inode says
    this is not the object that was measured.
    """

    measured = tmp_path / "measured.bin"
    measured.write_bytes(b"payload")
    substitute = tmp_path / "substitute.bin"
    substitute.write_bytes(b"payload")
    session = _Session(_Response(200))
    measured_metadata = os.stat(measured)

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(substitute),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            expected_identity=(
                measured_metadata.st_dev,
                measured_metadata.st_ino,
            ),
        )

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert "not the inode it was measured on" in str(caught.value)
    assert session.posts == []
    assert session.gets == []


@pytest.mark.parametrize(
    "expected_identity",
    [
        (),
        (1,),
        (1, 2, 3),
        [1, 2],
        ("1", 2),
        (True, 2),
        (1, None),
    ],
)
def test_a_malformed_measured_identity_is_refused(tmp_path, expected_identity):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            expected_identity=expected_identity,
        )

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert "(st_dev, st_ino) pair" in str(caught.value)
    assert session.posts == []


def test_owner_prefix_is_required_before_any_service_role_write(tmp_path):
    source = tmp_path / "artifact.bin"
    source.write_bytes(b"payload")
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_descriptor(
            f"room_file/other-user/{_SCAN_ID}/v2/refine/artifact.bin",
            _descriptor(source),
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
        _client(session).publish_immutable_descriptor(
            object_key,
            _descriptor(source),
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


def test_publication_never_opens_anything_by_path(tmp_path, monkeypatch):
    """The whole point of the descriptor contract, asserted directly.

    The old path-based publisher validated one ``open`` and uploaded from a
    second.  There is now no ``open`` of the source at all, so a name swap
    between the two has nothing to aim at.  Every ``os.open`` and ``os.lstat``
    the call makes is recorded and the source's name must not be among them.
    (The private upload scratch still opens, via ``tempfile``.)
    """

    payload = b"descriptor-only payload"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(_Response(200))
    descriptor = _descriptor(source)
    touched: list[str] = []
    real_open = storage_module.os.open
    real_lstat = storage_module.os.lstat
    real_stat = storage_module.os.stat

    def record(real):
        def wrapper(path, *args, **kwargs):
            try:
                touched.append(os.fspath(path))
            except TypeError:
                pass
            return real(path, *args, **kwargs)

        return wrapper

    monkeypatch.setattr(storage_module.os, "open", record(real_open))
    monkeypatch.setattr(storage_module.os, "lstat", record(real_lstat))
    monkeypatch.setattr(storage_module.os, "stat", record(real_stat))

    assert (
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            descriptor,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )
        is True
    )
    assert session.posts[0]["body"] == payload
    assert os.fspath(source) not in touched
    assert not any(os.fspath(source) in entry for entry in touched)


def test_replacing_the_source_at_its_path_cannot_change_published_bytes(tmp_path):
    """A same-UID swap at the name is simply not reachable from a descriptor."""

    original = b"first payload"
    replacement = b"swapped payload!"
    source = tmp_path / "artifact.bin"
    source.write_bytes(original)
    descriptor = _descriptor(source)
    decoy = tmp_path / "decoy.bin"
    decoy.write_bytes(replacement)
    os.replace(decoy, source)
    session = _Session(_Response(200))

    assert (
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            descriptor,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(original).hexdigest(),
            expected_size=len(original),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )
        is True
    )
    assert session.posts[0]["body"] == original
    assert source.read_bytes() == replacement


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="FIFO needs POSIX")
def test_a_non_regular_descriptor_is_rejected_before_any_service_role_write(tmp_path):
    fifo = tmp_path / "artifact.fifo"
    os.mkfifo(fifo)
    descriptor = os.open(fifo, os.O_RDONLY | os.O_NONBLOCK)
    _BORROWED_DESCRIPTORS.append(descriptor)
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            descriptor,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert session.posts == []


@pytest.mark.parametrize("descriptor", ("not-a-descriptor", None, True, 1.0))
def test_a_non_descriptor_source_is_rejected_before_any_service_role_write(descriptor):
    session = _Session(_Response(200))

    with pytest.raises(PermanentError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            descriptor,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            expected_size=7,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_SOURCE"
    assert session.posts == []


def test_source_mutation_while_staging_never_reaches_remote(tmp_path, monkeypatch):
    original = b"a" * ((1 << 20) * 2)
    source = tmp_path / "artifact.bin"
    source.write_bytes(original)
    real_pread = storage_module.os.pread
    mutated = False

    def mutate_between_source_chunks(descriptor, size, offset):
        nonlocal mutated
        chunk = real_pread(descriptor, size, offset)
        if not mutated and offset == 0:
            mutated = True
            with source.open("r+b") as handle:
                handle.write(b"b" * len(original))
        return chunk

    monkeypatch.setattr(storage_module.os, "pread", mutate_between_source_chunks)
    session = _Session(_Response(200))

    with pytest.raises(TransientError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(original).hexdigest(),
            expected_size=len(original),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert mutated is True
    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert "changed while staging" in str(caught.value)
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
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
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
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=expected_sha256,
            expected_size=expected_size,
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert caught.value.token == "REFINE_ARTIFACT_IO"
    # The exact clause matters: a declared size that disagrees with the live
    # descriptor must be refused before a single byte is staged, not diagnosed
    # later by the digest.
    expected_message = (
        "size no longer matches its manifest"
        if expected_size != 7
        else "hash no longer matches its manifest"
    )
    assert expected_message in str(caught.value)
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


def test_refine_deadline_bounds_download_and_upload_requests(tmp_path):
    payload = b"deadline-bound payload"
    download_session = _Session(
        _Response(200),
        existing_response=_Response(200, payload),
    )
    deadline = RefineDeadline(time.monotonic() + 30.0)

    destination = tmp_path / "download.bin"
    assert (
        _client(download_session).download_to(
            f"{_PREFIX}/input.bin",
            str(destination),
            deadline=deadline,
            reserve_seconds=5.0,
        )
        == len(payload)
    )
    assert destination.read_bytes() == payload
    assert download_session.gets[0]["timeout"] is None

    source = tmp_path / "upload.bin"
    source.write_bytes(payload)
    upload_session = _Session(_Response(200))
    assert (
        _client(upload_session).publish_immutable_descriptor(
            f"{_PREFIX}/upload.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            deadline=deadline,
            reserve_seconds=5.0,
        )
        is True
    )
    assert upload_session.posts[0]["timeout"] is None


def test_refine_deadline_duplicate_verification_is_async_and_idempotent(tmp_path):
    payload = b"same immutable bytes"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    existing = _Response(200, payload)
    session = _Session(
        _Response(409, json_body={"code": "ResourceAlreadyExists"}),
        existing,
    )

    assert (
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            deadline=RefineDeadline(time.monotonic() + 30.0),
        )
        is False
    )

    assert session.posts[0]["timeout"] is None
    assert session.gets[0]["timeout"] is None
    assert existing.bytes_yielded == len(payload)


def test_refine_total_deadline_cancels_a_progressing_download(tmp_path):
    class _ProgressingResponse(_Response):
        async def aiter_bytes(self, chunk_size: int) -> Any:
            del chunk_size
            for _ in range(10):
                await asyncio.sleep(0.06)
                yield b"x"

    response = _ProgressingResponse(200)
    session = _Session(_Response(200), existing_response=response)
    destination = tmp_path / "partial.bin"
    started = time.monotonic()

    with pytest.raises(TransientError) as caught:
        _client(session).download_to(
            f"{_PREFIX}/input.bin",
            str(destination),
            deadline=RefineDeadline(started + 0.15),
        )

    elapsed = time.monotonic() - started
    assert caught.value.token == "REFINE_ENGINE_TIMEOUT"
    assert 0 < destination.stat().st_size < 10
    assert elapsed < 0.5


def test_refine_total_deadline_cancels_a_stalled_upload(tmp_path):
    class _StalledAsyncSession(_AsyncSession):
        async def post(self, path: str, **kwargs: Any) -> _Response:
            del path, kwargs
            await asyncio.sleep(1.0)
            return self._session.upload_response

    payload = b"payload"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(_Response(200))
    client = StorageClient(
        session,  # type: ignore[arg-type]
        settings_from_env(_ENV),
        refine_client_factory=lambda: _StalledAsyncSession(session),
    )
    started = time.monotonic()

    with pytest.raises(TransientError) as caught:
        client.publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            deadline=RefineDeadline(started + 0.15),
        )

    assert caught.value.token == "REFINE_ENGINE_TIMEOUT"
    assert time.monotonic() - started < 0.5
    assert session.posts == []


def test_refine_deadline_exhaustion_stops_before_network(tmp_path):
    payload = b"payload"
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(
        _Response(200),
        existing_response=_Response(200, payload),
    )
    deadline = RefineDeadline(time.monotonic() + 1.0)
    client = _client(session)

    with pytest.raises(TransientError) as download_error:
        client.download_to(
            f"{_PREFIX}/input.bin",
            str(tmp_path / "download.bin"),
            deadline=deadline,
            reserve_seconds=2.0,
        )
    assert download_error.value.token == "REFINE_ENGINE_TIMEOUT"

    with pytest.raises(TransientError) as upload_error:
        client.publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
            deadline=deadline,
            reserve_seconds=2.0,
        )
    assert upload_error.value.token == "REFINE_ENGINE_TIMEOUT"
    assert session.gets == []
    assert session.posts == []


def test_download_stops_when_deadline_expires_between_chunks(tmp_path):
    class _ExpiringDeadline:
        def __init__(self):
            self.calls = 0

        def remaining_seconds(self):
            self.calls += 1
            if self.calls >= 3:
                raise AdapterError("expired", "REFINE_ENGINE_TIMEOUT")
            return 30.0

    payload = b"x" * ((1 << 20) + 1)
    session = _Session(
        _Response(200),
        existing_response=_Response(200, payload),
    )
    destination = tmp_path / "partial.bin"

    with pytest.raises(TransientError) as caught:
        _client(session).download_to(
            f"{_PREFIX}/input.bin",
            str(destination),
            deadline=_ExpiringDeadline(),  # type: ignore[arg-type]
        )

    assert caught.value.token == "REFINE_ENGINE_TIMEOUT"
    assert destination.stat().st_size == 1 << 20


def test_a_source_that_shrinks_mid_stage_never_reaches_remote(tmp_path, monkeypatch):
    """The short-read probe, reached the only way it can be: a shrink race."""

    payload = b"s" * ((1 << 20) * 2)
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(_Response(200))
    real_pread = storage_module.os.pread
    truncated = False

    def truncate_once(fd, size, offset):
        nonlocal truncated
        chunk = real_pread(fd, size, offset)
        if not truncated:
            truncated = True
            os.truncate(source, 16)
        return chunk

    monkeypatch.setattr(storage_module.os, "pread", truncate_once)

    with pytest.raises(TransientError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert truncated is True
    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert "ended before its manifest size" in str(caught.value)
    assert session.posts == []


def test_a_source_that_grows_mid_stage_never_reaches_remote(tmp_path, monkeypatch):
    """The trailing-byte probe, reached the only way it can be: a growth race."""

    payload = b"g" * 32
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    session = _Session(_Response(200))
    real_pread = storage_module.os.pread
    grown = False

    def grow_once(fd, size, offset):
        nonlocal grown
        chunk = real_pread(fd, size, offset)
        if not grown:
            grown = True
            with source.open("ab") as handle:
                handle.write(b"extra")
        return chunk

    monkeypatch.setattr(storage_module.os, "pread", grow_once)

    with pytest.raises(TransientError) as caught:
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            _descriptor(source),
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )

    assert grown is True
    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert "grew while staging" in str(caught.value)
    assert session.posts == []


def test_publication_never_moves_the_borrowed_offset(tmp_path):
    """Positional reads only: the owner may read the same descriptor after us."""

    payload = b"c" * ((1 << 20) + 11)
    source = tmp_path / "artifact.bin"
    source.write_bytes(payload)
    descriptor = _descriptor(source)
    os.lseek(descriptor, 5, os.SEEK_SET)
    session = _Session(_Response(200))

    assert (
        _client(session).publish_immutable_descriptor(
            f"{_PREFIX}/artifact.bin",
            descriptor,
            "application/octet-stream",
            expected_sha256=hashlib.sha256(payload).hexdigest(),
            expected_size=len(payload),
            user_id=_USER_ID,
            scan_id=_SCAN_ID,
        )
        is True
    )
    assert os.lseek(descriptor, 0, os.SEEK_CUR) == 5
    assert session.posts[0]["body"] == payload


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
