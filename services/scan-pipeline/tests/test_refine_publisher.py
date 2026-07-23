"""Manifest-last publication for the disabled Refine runner."""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import replace
from pathlib import Path

import patina_scan_worker.refine_publisher as publisher_module
import pytest

from patina_scan_worker.errors import PermanentError, TransientError
from patina_scan_worker.refine_adapter import RefineDeadline
from patina_scan_worker.refine_publisher import RefinePublisher
from patina_scan_worker.refine_runner import (
    REFINE_MANIFEST_NAME,
    RefineInlineArtifact,
    RefineRunner,
)
from patina_scan_worker.storage import StorageClient
from test_refine_runner import (
    _FakeArtifactBuilder,
    _FakeBackend,
    _candidate,
    _request,
)


class _RecordingStorage(StorageClient):
    def __init__(
        self,
        *,
        replay: bool = False,
        fail_at: int | None = None,
    ) -> None:
        self.replay = replay
        self.fail_at = fail_at
        self.calls: list[dict[str, object]] = []

    def publish_immutable_file(
        self,
        object_key,
        source_path,
        content_type,
        *,
        expected_sha256,
        expected_size,
        user_id,
        scan_id,
        deadline=None,
        reserve_seconds=0,
    ):
        payload = Path(source_path).read_bytes()
        self.calls.append(
            {
                "key": object_key,
                "path": Path(source_path),
                "contentType": content_type,
                "sha256": expected_sha256,
                "sizeBytes": expected_size,
                "userId": user_id,
                "scanId": scan_id,
                "deadline": deadline,
                "reserveSeconds": reserve_seconds,
                "payload": payload,
            }
        )
        if self.fail_at is not None and len(self.calls) == self.fail_at:
            raise TransientError("injected storage failure", token="REFINE_ARTIFACT_IO")
        assert hashlib.sha256(payload).hexdigest() == expected_sha256
        assert len(payload) == expected_size
        return not self.replay


def _deadline(seconds: float = 60.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _result(tmp_path: Path):
    request = _request(tmp_path)
    return RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(request, deadline=_deadline())


def _publisher(storage: StorageClient, tmp_path: Path, reserve: float = 5.0):
    spool = tmp_path / "spool"
    spool.mkdir(exist_ok=True)
    return RefinePublisher(
        storage,
        spool_root=spool,
        completion_reserve_seconds=reserve,
    )


def test_publishes_canonical_artifacts_then_manifest_last(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage()

    receipt = _publisher(storage, tmp_path).publish(
        result,
        user_id="user-1",
        scan_id="scan-1",
        deadline=_deadline(),
    )

    keys = [call["key"] for call in storage.calls]
    assert keys[-1] == result.manifest_key
    assert [key.rsplit("/", 1)[-1] for key in keys[:-1]] == sorted(
        artifact.name for artifact in result.files[:-1]
    )
    assert storage.calls[-1]["payload"] == result.manifest.payload
    assert all(call["reserveSeconds"] == 5.0 for call in storage.calls)
    assert all(call["deadline"] is not None for call in storage.calls)
    assert receipt.created_keys == tuple(keys)
    assert receipt.replayed_keys == ()
    assert receipt.manifest.object_key == result.manifest_key
    assert receipt.manifest.sha256 == result.manifest_sha256
    assert receipt.manifest.created is True
    assert receipt.created_count == len(result.files)


def test_identical_replay_reports_every_key_without_overwrite(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage(replay=True)

    receipt = _publisher(storage, tmp_path).publish(
        result,
        user_id="user-1",
        scan_id="scan-1",
        deadline=_deadline(),
    )

    assert receipt.created_keys == ()
    assert receipt.replayed_keys == tuple(call["key"] for call in storage.calls)
    assert receipt.manifest.created is False


def test_failure_before_commit_never_attempts_manifest(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage(fail_at=2)

    with pytest.raises(TransientError):
        _publisher(storage, tmp_path).publish(
            result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert len(storage.calls) == 2
    assert all(call["key"] != result.manifest_key for call in storage.calls)


def test_expired_or_reserved_deadline_fails_before_storage(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage()

    with pytest.raises(TransientError) as caught:
        _publisher(storage, tmp_path, reserve=30.0).publish(
            result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(5.0),
        )

    assert caught.value.token == "REFINE_ENGINE_TIMEOUT"
    assert storage.calls == []


def test_owner_or_manifest_ledger_mismatch_fails_before_storage(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage()

    with pytest.raises(PermanentError) as owner_error:
        _publisher(storage, tmp_path).publish(
            result,
            user_id="other-user",
            scan_id="scan-1",
            deadline=_deadline(),
        )
    assert owner_error.value.token == "REFINE_ARTIFACT_VERIFY"

    malformed_manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=result.manifest.payload.replace(
            b'"artifacts":[',
            b'"artifacts":[],"discarded":[',
            1,
        ),
    )
    malformed_result = replace(
        result,
        manifest_sha256=malformed_manifest.sha256,
        files=(*result.files[:-1], malformed_manifest),
    )
    with pytest.raises(PermanentError):
        _publisher(storage, tmp_path).publish(
            malformed_result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )
    assert storage.calls == []


def test_inline_spools_are_private_ephemeral_regular_files(tmp_path):
    result = _result(tmp_path)
    storage = _RecordingStorage()

    _publisher(storage, tmp_path).publish(
        result,
        user_id="user-1",
        scan_id="scan-1",
        deadline=_deadline(),
    )

    inline_names = {
        artifact.name
        for artifact in result.files
        if type(artifact) is RefineInlineArtifact
    }
    inline_calls = [
        call
        for call in storage.calls
        if str(call["key"]).rsplit("/", 1)[-1] in inline_names
    ]
    assert inline_calls
    assert all(not Path(call["path"]).exists() for call in inline_calls)
    assert list((tmp_path / "spool").iterdir()) == []


def test_boolean_manifest_schema_is_rejected_before_storage(tmp_path):
    result = _result(tmp_path)
    malformed_manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=result.manifest.payload.replace(
            b'"schemaVersion":1',
            b'"schemaVersion":true',
            1,
        ),
    )
    malformed_result = replace(
        result,
        manifest_sha256=malformed_manifest.sha256,
        files=(*result.files[:-1], malformed_manifest),
    )
    storage = _RecordingStorage()

    with pytest.raises(PermanentError) as caught:
        _publisher(storage, tmp_path).publish(
            malformed_result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
    assert storage.calls == []


def test_runner_strict_publication_contract_is_rechecked_before_storage(tmp_path):
    result = _result(tmp_path)
    document = json.loads(result.manifest.payload)
    del document["engineOutputs"]
    payload = (
        json.dumps(
            document,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")
    malformed_manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=payload,
    )
    malformed_result = replace(
        result,
        manifest_sha256=malformed_manifest.sha256,
        files=(*result.files[:-1], malformed_manifest),
    )
    storage = _RecordingStorage()

    with pytest.raises(PermanentError) as caught:
        _publisher(storage, tmp_path).publish(
            malformed_result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
    assert storage.calls == []


@pytest.mark.parametrize(
    "mutation",
    ["room-file-id", "input-sha256", "input-size"],
)
def test_trusted_identity_and_input_ledger_are_bound_before_storage(
    tmp_path,
    mutation,
):
    result = _result(tmp_path)
    document = json.loads(result.manifest.payload)
    if mutation == "room-file-id":
        document["identity"]["roomFileId"] = "unbound-room-file"
    elif mutation == "input-sha256":
        document["inputs"][0]["sha256"] = "0" * 64
    else:
        document["inputs"][0]["sizeBytes"] = 1
    payload = (
        json.dumps(
            document,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")
    malformed_manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=payload,
    )
    malformed_result = replace(
        result,
        manifest_sha256=malformed_manifest.sha256,
        files=(*result.files[:-1], malformed_manifest),
    )
    storage = _RecordingStorage()

    with pytest.raises(PermanentError) as caught:
        _publisher(storage, tmp_path).publish(
            malformed_result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
    assert storage.calls == []


@pytest.mark.parametrize("invalid_size", [True, 1.0], ids=["boolean", "float"])
def test_manifest_artifact_sizes_require_exact_json_integers(
    tmp_path,
    invalid_size,
):
    result = _result(tmp_path)
    document = json.loads(result.manifest.payload)
    document["artifacts"][0]["sizeBytes"] = invalid_size
    payload = (
        json.dumps(
            document,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")
    malformed_manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=payload,
    )
    malformed_result = replace(
        result,
        manifest_sha256=malformed_manifest.sha256,
        files=(*result.files[:-1], malformed_manifest),
    )
    storage = _RecordingStorage()

    with pytest.raises(PermanentError) as caught:
        _publisher(storage, tmp_path).publish(
            malformed_result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert caught.value.token == "REFINE_ARTIFACT_VERIFY"
    assert storage.calls == []


def test_inline_spool_closes_descriptor_when_fdopen_fails(tmp_path, monkeypatch):
    result = _result(tmp_path)
    storage = _RecordingStorage()
    real_open = publisher_module.os.open
    opened: list[int] = []

    def recording_open(*args, **kwargs):
        descriptor = real_open(*args, **kwargs)
        opened.append(descriptor)
        return descriptor

    def failing_fdopen(*args, **kwargs):
        del args, kwargs
        raise OSError("synthetic fdopen failure")

    monkeypatch.setattr(publisher_module.os, "open", recording_open)
    monkeypatch.setattr(publisher_module.os, "fdopen", failing_fdopen)

    with pytest.raises(TransientError) as caught:
        _publisher(storage, tmp_path).publish(
            result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=_deadline(),
        )

    assert caught.value.token == "REFINE_ARTIFACT_IO"
    assert opened
    with pytest.raises(OSError):
        os.fstat(opened[-1])
    assert storage.calls
    assert all(call["key"] != result.manifest_key for call in storage.calls)


def test_cleanup_cannot_consume_deadline_and_still_return_success(
    tmp_path,
    monkeypatch,
):
    result = _result(tmp_path)
    storage = _RecordingStorage()
    real_temporary_directory = publisher_module.tempfile.TemporaryDirectory

    class _SlowCleanupDirectory(real_temporary_directory):
        def cleanup(self):
            time.sleep(0.2)
            return super().cleanup()

    monkeypatch.setattr(
        publisher_module.tempfile,
        "TemporaryDirectory",
        _SlowCleanupDirectory,
    )
    started = time.monotonic()

    with pytest.raises(TransientError) as caught:
        _publisher(storage, tmp_path, reserve=0.0).publish(
            result,
            user_id="user-1",
            scan_id="scan-1",
            deadline=RefineDeadline(started + 0.1),
        )

    assert caught.value.token == "REFINE_ENGINE_TIMEOUT"
    assert storage.calls[-1]["key"] == result.manifest_key
    assert list((tmp_path / "spool").iterdir()) == []
