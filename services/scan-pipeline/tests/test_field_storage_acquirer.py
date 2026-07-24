"""Adversarial tests for the disabled Field Storage acquisition adapter."""

from __future__ import annotations

import asyncio
import hashlib
import time
import traceback
from collections.abc import Iterable
from typing import Any, Self

import httpx
import pytest
from patina_scan_worker.config import DEFAULT_STAGES, settings_from_env
from patina_scan_worker.field_storage_acquirer import FieldStorageArtifactAcquirer
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_materializer import (
    MaterializerFailureCode,
    RefineSourceArtifact,
)
from patina_scan_worker.stages import get_handler

USER_ID = "user-1"
SCAN_ID = "scan-1"
OBJECT_KEY = f"manifests/{USER_ID}/{SCAN_ID}/manifest.json"
_ENV = {
    "WORKER_ID": "field-storage-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role",
}
_DEFAULT_WRITE = object()


class _Response:
    def __init__(
        self,
        status_code: int,
        body: bytes,
        *,
        headers: dict[str, str] | None = None,
        chunks: Iterable[bytes] | None = None,
        delay_seconds: float = 0,
        stream_error: BaseException | None = None,
        exit_error: BaseException | None = None,
    ) -> None:
        self.status_code = status_code
        self.headers = {"content-length": str(len(body))}
        if headers is not None:
            self.headers.update(headers)
        self._chunks = tuple(chunks) if chunks is not None else (body,)
        self._delay_seconds = delay_seconds
        self._stream_error = stream_error
        self._exit_error = exit_error
        self.entered = False
        self.exited = False
        self.cancelled = False
        self.bytes_yielded = 0
        self.chunk_size: int | None = None

    async def __aenter__(self) -> Self:
        self.entered = True
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self.exited = True
        if self._exit_error is not None:
            raise self._exit_error

    async def aiter_raw(self, chunk_size: int):
        self.chunk_size = chunk_size
        try:
            for chunk in self._chunks:
                if self._delay_seconds:
                    await asyncio.sleep(self._delay_seconds)
                if self._stream_error is not None:
                    raise self._stream_error
                self.bytes_yielded += len(chunk)
                yield chunk
        except asyncio.CancelledError:
            self.cancelled = True
            raise


class _AsyncClient:
    def __init__(
        self,
        response: _Response,
        *,
        stream_error: BaseException | None = None,
    ) -> None:
        self.response = response
        self.stream_error = stream_error
        self.calls: list[dict[str, Any]] = []
        self.entered = False
        self.exited = False

    async def __aenter__(self) -> Self:
        self.entered = True
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self.exited = True

    def stream(self, method: str, url: str, **kwargs: Any) -> _Response:
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": kwargs.get("headers"),
                "timeout": kwargs.get("timeout"),
            }
        )
        if self.stream_error is not None:
            raise self.stream_error
        return self.response


class _Factory:
    def __init__(self, client: _AsyncClient) -> None:
        self.client = client
        self.calls = 0

    def __call__(self) -> _AsyncClient:
        self.calls += 1
        return self.client


class _ClosingByteStream(httpx.AsyncByteStream):
    def __init__(self, chunks: Iterable[bytes]) -> None:
        self._chunks = tuple(chunks)
        self.closed = False

    async def __aiter__(self):
        for chunk in self._chunks:
            yield chunk

    async def aclose(self) -> None:
        self.closed = True


class _ClosingMockTransport(httpx.MockTransport):
    def __init__(self, handler) -> None:
        super().__init__(handler)
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True
        await super().aclose()


class _Sink:
    def __init__(self, *, write_result: object = _DEFAULT_WRITE) -> None:
        self.payload = bytearray()
        self.write_result = write_result
        self.calls = 0

    def write(self, payload) -> int:
        self.calls += 1
        value = bytes(payload)
        if self.write_result is not _DEFAULT_WRITE:
            return self.write_result  # type: ignore[return-value]
        self.payload.extend(value)
        return len(value)


def _source(payload: bytes, *, object_key: str = OBJECT_KEY) -> RefineSourceArtifact:
    return RefineSourceArtifact(
        object_key=object_key,
        sha256=hashlib.sha256(payload).hexdigest(),
        size_bytes=len(payload),
    )


def _deadline(seconds: float = 5.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _adapter(
    response: _Response,
    *,
    stream_error: BaseException | None = None,
) -> tuple[FieldStorageArtifactAcquirer, _Factory, _AsyncClient]:
    client = _AsyncClient(response, stream_error=stream_error)
    factory = _Factory(client)
    return (
        FieldStorageArtifactAcquirer(
            settings_from_env(_ENV),
            client_factory=factory,
        ),
        factory,
        client,
    )


def _acquire(
    adapter: FieldStorageArtifactAcquirer,
    source: RefineSourceArtifact,
    sink: _Sink,
    *,
    deadline: RefineDeadline | None = None,
    user_id: str = USER_ID,
    scan_id: str = SCAN_ID,
) -> None:
    adapter.acquire(
        source=source,
        user_id=user_id,
        scan_id=scan_id,
        destination=sink,
        deadline=deadline or _deadline(),
    )


def test_exact_identity_response_streams_raw_bytes_without_a_path():
    payload = b"exact immutable Field bytes"
    response = _Response(
        200,
        payload,
        headers={"content-encoding": "identity"},
        chunks=(payload[:5], payload[5:]),
    )
    adapter, factory, client = _adapter(response)
    sink = _Sink()

    _acquire(adapter, _source(payload), sink)

    assert sink.payload == payload
    assert factory.calls == 1
    assert client.calls == [
        {
            "method": "GET",
            "url": f"/storage/v1/object/room-scans/{OBJECT_KEY}",
            "headers": {"accept-encoding": "identity"},
            "timeout": None,
        }
    ]
    assert response.entered is True
    assert response.exited is True
    assert response.chunk_size == len(payload) + 1


def test_real_httpx_success_path_proves_auth_raw_bytes_and_closure():
    payload = b"\x1f\x8braw-not-transformed\x00\xff"
    stream = _ClosingByteStream((payload[:4], payload[4:]))
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-length": str(len(payload))},
            stream=stream,
        )

    transport = _ClosingMockTransport(respond)
    adapter = FieldStorageArtifactAcquirer(
        settings_from_env(_ENV),
        transport=transport,
    )
    sink = _Sink()

    _acquire(adapter, _source(payload), sink)

    assert len(requests) == 1
    request = requests[0]
    assert request.method == "GET"
    assert str(request.url) == (
        f"https://example.supabase.co/storage/v1/object/room-scans/{OBJECT_KEY}"
    )
    assert request.headers["apikey"] == "service-role"
    assert request.headers["authorization"] == "Bearer service-role"
    assert request.headers["accept-encoding"] == "identity"
    assert sink.payload == payload
    assert stream.closed is True
    assert transport.closed is True


@pytest.mark.parametrize(
    ("object_key", "user_id", "scan_id"),
    (
        (f"manifests/other/{SCAN_ID}/manifest.json", USER_ID, SCAN_ID),
        (f"manifests/{USER_ID}/other/manifest.json", USER_ID, SCAN_ID),
        (f"/{OBJECT_KEY}", USER_ID, SCAN_ID),
        (f"manifests/{USER_ID}/{SCAN_ID}/../manifest.json", USER_ID, SCAN_ID),
        (f"manifests/{USER_ID}/{SCAN_ID}//manifest.json", USER_ID, SCAN_ID),
        (f"{OBJECT_KEY}?download=1", USER_ID, SCAN_ID),
        (f"{OBJECT_KEY}#fragment", USER_ID, SCAN_ID),
        (f"{OBJECT_KEY}%2e", USER_ID, SCAN_ID),
        (OBJECT_KEY, "bad owner", SCAN_ID),
        (OBJECT_KEY, USER_ID, "bad scan"),
    ),
)
def test_owner_and_key_validation_precedes_client_and_sink(
    object_key,
    user_id,
    scan_id,
):
    payload = b"payload"
    response = _Response(200, payload)
    adapter, factory, client = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(
            adapter,
            _source(payload, object_key=object_key),
            sink,
            user_id=user_id,
            scan_id=scan_id,
        )

    assert caught.value.code in {
        MaterializerFailureCode.OWNERSHIP.value,
        MaterializerFailureCode.INPUT_INVALID.value,
    }
    assert factory.calls == 0
    assert client.calls == []
    assert sink.calls == 0


@pytest.mark.parametrize(
    ("status", "code"),
    (
        (404, MaterializerFailureCode.INPUT_INVALID),
        (408, MaterializerFailureCode.INPUT_IO),
        (425, MaterializerFailureCode.INPUT_IO),
        (429, MaterializerFailureCode.INPUT_IO),
        (500, MaterializerFailureCode.INPUT_IO),
        (401, MaterializerFailureCode.INPUT_IO),
        (403, MaterializerFailureCode.INPUT_IO),
        (206, MaterializerFailureCode.INPUT_INVALID),
        (409, MaterializerFailureCode.INPUT_INVALID),
    ),
)
def test_http_statuses_have_stable_materializer_classification(status, code):
    payload = b"payload"
    response = _Response(status, payload)
    adapter, _, _ = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), sink)

    assert caught.value.code == code.value
    assert sink.calls == 0
    assert response.exited is True


@pytest.mark.parametrize(
    "headers",
    (
        {"content-length": ""},
        {"content-length": "nope"},
        {"content-length": "6"},
        {"content-length": "7, 7"},
        {"content-encoding": "gzip"},
        {"content-encoding": "br"},
        {"content-range": "bytes 0-6/7"},
    ),
)
def test_response_protocol_drift_is_rejected_before_sink_write(headers):
    payload = b"payload"
    response = _Response(200, payload, headers=headers)
    adapter, _, _ = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), sink)

    assert caught.value.code == MaterializerFailureCode.INPUT_INVALID.value
    assert sink.calls == 0


def test_missing_content_length_is_rejected_before_sink_write():
    payload = b"payload"
    response = _Response(200, payload)
    del response.headers["content-length"]
    adapter, _, _ = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), sink)

    assert caught.value.code == MaterializerFailureCode.INPUT_INVALID.value
    assert sink.calls == 0


def test_body_larger_than_declared_is_rejected_without_writing_oversized_chunk():
    payload = b"payload"
    response = _Response(
        200,
        payload,
        chunks=(payload + b"x",),
    )
    adapter, _, _ = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), sink)

    assert caught.value.code == MaterializerFailureCode.INPUT_INVALID.value
    assert sink.payload == b""


def test_truncated_body_is_transient_and_hash_drift_is_permanent():
    payload = b"payload"
    truncated = _Response(200, payload, chunks=(payload[:-1],))
    adapter, _, _ = _adapter(truncated)
    with pytest.raises(AdapterError) as truncated_error:
        _acquire(adapter, _source(payload), _Sink())
    assert truncated_error.value.code == MaterializerFailureCode.INPUT_IO.value

    changed = b"payloae"
    drift = _Response(200, changed)
    drift.headers["content-length"] = str(len(payload))
    adapter, _, _ = _adapter(drift)
    with pytest.raises(AdapterError) as hash_error:
        _acquire(adapter, _source(payload), _Sink())
    assert hash_error.value.code == MaterializerFailureCode.INPUT_INVALID.value


@pytest.mark.parametrize("write_result", (None, 0, 1, True))
def test_sink_must_accept_every_chunk_in_full(write_result):
    payload = b"payload"
    response = _Response(200, payload)
    adapter, _, _ = _adapter(response)
    sink = _Sink(write_result=write_result)

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), sink)

    assert caught.value.code == MaterializerFailureCode.INPUT_IO.value


def test_network_and_response_cleanup_errors_are_transient():
    payload = b"payload"
    response = _Response(200, payload)
    adapter, _, _ = _adapter(
        response,
        stream_error=httpx.ConnectError("offline"),
    )
    with pytest.raises(AdapterError) as connect_error:
        _acquire(adapter, _source(payload), _Sink())
    assert connect_error.value.code == MaterializerFailureCode.INPUT_IO.value

    response = _Response(
        200,
        payload,
        exit_error=httpx.CloseError("cannot close response: cleanup-secret"),
    )
    adapter, _, _ = _adapter(response)
    with pytest.raises(AdapterError) as close_error:
        _acquire(adapter, _source(payload), _Sink())
    assert close_error.value.code == MaterializerFailureCode.INPUT_IO.value
    assert "cleanup-secret" not in str(close_error.value)
    assert close_error.value.__cause__ is None
    assert close_error.value.__context__ is None


def test_default_client_protocol_failure_cannot_retain_service_role_secret():
    payload = b"payload"
    secret_marker = "TOP-SECRET-SERVICE-ROLE"
    secret = f"{secret_marker}\r\nInjected: yes"
    env = dict(_ENV)
    env["SUPABASE_SERVICE_ROLE_KEY"] = secret
    observed_headers: list[tuple[str, str]] = []

    def reject_malformed_header(request: httpx.Request) -> httpx.Response:
        observed_headers.append(
            (
                request.headers["apikey"],
                request.headers["authorization"],
            )
        )
        raise httpx.LocalProtocolError(
            f"illegal header value contains {request.headers['apikey']!r}"
        )

    adapter = FieldStorageArtifactAcquirer(
        settings_from_env(env),
        transport=httpx.MockTransport(reject_malformed_header),
    )

    with pytest.raises(AdapterError) as caught:
        _acquire(adapter, _source(payload), _Sink())

    error = caught.value
    formatted = "".join(
        traceback.format_exception(type(error), error, error.__traceback__)
    )
    assert observed_headers == [(secret, f"Bearer {secret}")]
    assert error.code == MaterializerFailureCode.INPUT_IO.value
    assert secret_marker not in str(error)
    assert secret_marker not in repr(error)
    assert secret_marker not in formatted
    assert error.__cause__ is None
    assert error.__context__ is None
    assert error.__suppress_context__ is True


def test_expired_deadline_precedes_client_and_sink():
    payload = b"payload"
    response = _Response(200, payload)
    adapter, factory, client = _adapter(response)
    sink = _Sink()

    with pytest.raises(AdapterError) as caught:
        _acquire(
            adapter,
            _source(payload),
            sink,
            deadline=RefineDeadline(time.monotonic() - 1),
        )

    assert caught.value.code == MaterializerFailureCode.DEADLINE.value
    assert factory.calls == 0
    assert client.calls == []
    assert sink.calls == 0


def test_total_deadline_cancels_progressing_stream_and_prevents_late_writes():
    payload = b"abcdefghij"
    response = _Response(
        200,
        payload,
        chunks=tuple(bytes([value]) for value in payload),
        delay_seconds=0.05,
    )
    adapter, _, _ = _adapter(response)
    sink = _Sink()
    started = time.monotonic()

    with pytest.raises(AdapterError) as caught:
        _acquire(
            adapter,
            _source(payload),
            sink,
            deadline=RefineDeadline(started + 0.13),
        )

    elapsed = time.monotonic() - started
    written_at_return = bytes(sink.payload)
    time.sleep(0.15)
    assert caught.value.code == MaterializerFailureCode.DEADLINE.value
    assert 0 < len(written_at_return) < len(payload)
    assert bytes(sink.payload) == written_at_return
    assert response.cancelled is True
    assert response.exited is True
    assert elapsed < 0.5


def test_slow_sink_write_cannot_return_success_or_write_after_return():
    payload = b"payload"
    response = _Response(200, payload)
    adapter, _, _ = _adapter(response)

    class _SlowSink(_Sink):
        def write(self, chunk) -> int:
            time.sleep(0.05)
            return super().write(chunk)

    sink = _SlowSink()
    started = time.monotonic()

    with pytest.raises(AdapterError) as caught:
        _acquire(
            adapter,
            _source(payload),
            sink,
            deadline=RefineDeadline(started + 0.01),
        )

    elapsed = time.monotonic() - started
    written_at_return = bytes(sink.payload)
    time.sleep(0.05)
    assert caught.value.code == MaterializerFailureCode.DEADLINE.value
    assert written_at_return == payload
    assert bytes(sink.payload) == written_at_return
    assert sink.calls == 1
    assert response.exited is True
    assert 0.04 <= elapsed < 0.5


def test_running_event_loop_is_rejected_before_client_creation():
    payload = b"payload"
    response = _Response(200, payload)
    adapter, factory, client = _adapter(response)

    async def invoke() -> str:
        with pytest.raises(AdapterError) as caught:
            _acquire(adapter, _source(payload), _Sink())
        return caught.value.code

    code = asyncio.run(invoke())

    assert code == MaterializerFailureCode.INPUT_INVALID.value
    assert factory.calls == 0
    assert client.calls == []


def test_adapter_remains_disabled_and_refine_unregistered():
    assert FieldStorageArtifactAcquirer.production_enablement == "disabled"
    assert DEFAULT_STAGES == "ingest,solve,drawings"
    assert get_handler("scan_pipeline.refine") is None
