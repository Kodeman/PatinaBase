"""Queue-independent orchestration contract for the disabled P2 Refine runner."""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import replace
from pathlib import Path

import pytest

import patina_scan_worker.refine_runner as refine_runner
from patina_scan_worker.refine_adapter import (
    COLMAP_TARGET_VERSION,
    AdapterError,
    ColmapPose,
    NormalizedFrame,
    PinholeIntrinsics,
    PositionPrior,
    RefineDeadline,
    RefinementEvidence,
    arkit_c2w_to_colmap_w2c,
    right_rotated_intrinsics,
)
from patina_scan_worker.refine_runner import (
    FALLBACK_ENGINE,
    MAX_RUNNER_ERROR_BYTES,
    PRIMARY_ENGINE,
    REFINE_FAILURE_FATALITY,
    REFINE_MANIFEST_NAME,
    EngineAttemptError,
    EngineFailureKind,
    InputArtifact,
    NamedRefinedPose,
    PreparedRefineFrame,
    RefineEngineCandidate,
    RefineEngineOutputReference,
    RefineEngineTelemetry,
    RefineFailureCode,
    RefineFallbackPolicy,
    RefineFileArtifact,
    RefineFrameInput,
    RefineInlineArtifact,
    RefineRunError,
    RefineRunRequest,
    RefineRunner,
    validate_refine_result_for_publication,
)


_IDENTITY = (
    (1.0, 0.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0),
)
_ENGINE_MEDIA_TYPES = {
    "adapter-v2.json": "application/json",
    "pairs-v2.txt": "text/plain",
    "database-v1.db": "application/vnd.sqlite3",
    "seed-model-v1.tar": "application/x-tar",
    "aligned-sparse-model-v1.tar": "application/x-tar",
    "engine-command-evidence-v1.json": "application/json",
}
_ENGINE_PAYLOADS = {
    "adapter-v2.json": b'{"schemaVersion":2}\n',
    "pairs-v2.txt": b"frame_000000.ppm frame_000001.ppm\n",
    "database-v1.db": b"database-v1\n",
    "seed-model-v1.tar": b"seed-model-v1\n",
    "aligned-sparse-model-v1.tar": b"aligned-sparse-model-v1\n",
    "engine-command-evidence-v1.json": b'{"schemaVersion":1}\n',
}


class _TargetVersionString(str):
    pass


class _TargetVersionImposter:
    def __str__(self):
        return COLMAP_TARGET_VERSION

    def __eq__(self, other):
        return other == COLMAP_TARGET_VERSION


class _ExpirableDeadline(RefineDeadline):
    def remaining_seconds(self, *, now_monotonic_s=None):
        del now_monotonic_s
        if getattr(self, "expired", False):
            raise AdapterError(
                "expired while surfacing failure", "REFINE_ENGINE_TIMEOUT"
            )
        return 10.0


def _expirable_deadline() -> _ExpirableDeadline:
    deadline = _ExpirableDeadline(time.monotonic() + 60.0)
    object.__setattr__(deadline, "expired", False)
    return deadline


def _pose(center: tuple[float, float, float]) -> ColmapPose:
    return ColmapPose(
        rotation=_IDENTITY,
        translation=tuple(-value for value in center),
        qvec=(1.0, 0.0, 0.0, 0.0),
    )


def _frame(
    ordinal: int,
    center: tuple[float, float, float],
) -> NormalizedFrame:
    native_intrinsics = PinholeIntrinsics(
        805.0,
        800.0,
        240.0,
        320.0,
        480,
        640,
    )
    intrinsics = right_rotated_intrinsics(
        native_intrinsics,
        encoded_width=640,
        encoded_height=480,
    )
    variance = 0.01
    transform = (
        1.0,
        0.0,
        0.0,
        center[0],
        0.0,
        1.0,
        0.0,
        center[1],
        0.0,
        0.0,
        1.0,
        center[2],
        0.0,
        0.0,
        0.0,
        1.0,
    )
    return NormalizedFrame(
        ordinal=ordinal,
        frame_timestamp_s=float(ordinal),
        heic_path=f"keyframes/frame_{ordinal:04d}.heic",
        image_name=f"frame_{ordinal:04d}.heic",
        arkit_camera_to_world=transform,
        native_intrinsics=native_intrinsics,
        intrinsics=intrinsics,
        colmap_pose=arkit_c2w_to_colmap_w2c(transform),
        camera_center_m=center,
        pose_prior=PositionPrior(
            position_m=center,
            covariance_m2=(
                (variance, 0.0, 0.0),
                (0.0, variance, 0.0),
                (0.0, 0.0, variance),
            ),
        ),
    )


def _request(tmp_path: Path) -> RefineRunRequest:
    raw_centers = (
        (0.0, 0.0, 0.0),
        (2.0, 0.0, 0.0),
        (0.0, 2.0, 0.0),
        (0.0, 0.0, 2.0),
    )
    workspace = tmp_path / "refine-work"
    source_dir = workspace / "extracted" / "keyframes"
    image_dir = workspace / "images"
    source_dir.mkdir(parents=True)
    image_dir.mkdir(parents=True)
    frames = []
    for index, center in enumerate(raw_centers):
        frame = _frame(index, center)
        payload = f"physical-raster-placeholder-{index}\n".encode("ascii")
        source = source_dir / frame.image_name
        source.write_bytes(payload)
        engine_name = f"frame_{index:06d}.ppm"
        engine_payload = f"P6\n1 1\n255\n{index:03d}".encode("ascii")
        engine = image_dir / engine_name
        engine.write_bytes(engine_payload)
        frames.append(
            RefineFrameInput(
                frame=frame,
                source_descriptor=_borrowed_artifact_descriptor(source),
                relative_source_path=f"extracted/keyframes/{frame.image_name}",
                source_archive_key="keyframes/user-1/room-1/keyframes.tar",
                source_member=frame.heic_path,
                source_sha256=hashlib.sha256(payload).hexdigest(),
                source_size_bytes=len(payload),
                engine_name=engine_name,
                engine_descriptor=_borrowed_artifact_descriptor(engine),
                engine_relative_path=f"images/{engine_name}",
                engine_sha256=hashlib.sha256(engine_payload).hexdigest(),
                engine_size_bytes=len(engine_payload),
                materializer_id="qualified-core-image-v1",
            )
        )
    return RefineRunRequest(
        user_id="user-1",
        scan_id="scan-1",
        room_file_id="room-file-1",
        room_file_version=3,
        workspace_root=workspace,
        frames=tuple(frames),
        inputs=(
            InputArtifact(
                key="manifests/user-1/room-1/manifest.json",
                sha256="1" * 64,
                size_bytes=4096,
            ),
            InputArtifact(
                key="keyframe-index/user-1/room-1/keyframe-index.json",
                sha256="2" * 64,
                size_bytes=8192,
            ),
            InputArtifact(
                key="keyframes/user-1/room-1/keyframes.tar",
                sha256="3" * 64,
                size_bytes=16384,
            ),
        ),
    )


def _evidence(**overrides: object) -> RefinementEvidence:
    values: dict[str, object] = {
        "input_images": 4,
        "registered_images_before": 4,
        "registered_images_after": 4,
        "common_observations": 240,
        "common_observation_set_sha256": "a" * 64,
        "reprojection_rmse_px_before": 0.8,
        "reprojection_rmse_px_after": 0.68,
        "verified_loop_edges": 1,
        "verified_loop_set_sha256": "b" * 64,
        "loop_rotation_rmse_deg_before": 1.0,
        "loop_rotation_rmse_deg_after": 0.9,
        "loop_translation_direction_rmse_deg_before": 2.0,
        "loop_translation_direction_rmse_deg_after": 1.8,
    }
    values.update(overrides)
    return RefinementEvidence(**values)  # type: ignore[arg-type]


def _candidate(
    *,
    centers: tuple[tuple[float, float, float], ...] | None = None,
    evidence: RefinementEvidence | None = None,
    large_aligned_model: bool = False,
) -> RefineEngineCandidate:
    # raw = 2 * refined + (-2, -2, -2), a known positive-scale Sim(3).
    refined_centers = centers or (
        (1.0, 1.0, 1.0),
        (2.0, 1.0, 1.0),
        (1.0, 2.0, 1.0),
        (1.0, 1.0, 2.0),
    )
    return RefineEngineCandidate(
        cli_version="4.0.2",
        binding_version="4.0.2",
        refined_poses=tuple(
            NamedRefinedPose(f"frame_{index:06d}.ppm", _pose(center))
            for index, center in enumerate(refined_centers)
        ),
        evidence=evidence or _evidence(),
        outputs=_engine_output_references(
            large_aligned_model=large_aligned_model,
        ),
        telemetry=RefineEngineTelemetry(
            duration_ms=1250,
            iterations=9,
            vram_peak_mb=512,
            command_count=4,
            metrics=(
                ("registeredImages", 4),
                ("usedGpuSift", True),
            ),
        ),
    )


def _engine_output_references(
    *,
    large_aligned_model: bool = False,
) -> tuple[RefineEngineOutputReference, ...]:
    references = []
    for name in sorted(_ENGINE_PAYLOADS):
        payload = _ENGINE_PAYLOADS[name]
        if name == "aligned-sparse-model-v1.tar" and large_aligned_model:
            payload = b"\0" * (8 * 1024 * 1024 - 1) + b"x"
        references.append(
            RefineEngineOutputReference(
                name=name,
                relative_path=f"engine-artifacts/{name}",
                sha256=hashlib.sha256(payload).hexdigest(),
                size_bytes=len(payload),
                transport_content_type="application/octet-stream",
                semantic_media_type=_ENGINE_MEDIA_TYPES[name],
            )
        )
    return tuple(references)


class _FakeBackend:
    def __init__(
        self,
        *,
        primary: RefineEngineCandidate | BaseException,
        fallback: RefineEngineCandidate | BaseException | None = None,
    ) -> None:
        self.primary = primary
        self.fallback = fallback
        self.calls: list[tuple[str, RefineDeadline]] = []

    @staticmethod
    def _return_or_raise(value: RefineEngineCandidate | BaseException | None):
        if isinstance(value, BaseException):
            raise value
        assert value is not None
        return value

    def run_primary(self, request, *, deadline):
        del request
        self.calls.append((PRIMARY_ENGINE, deadline))
        return self._return_or_raise(self.primary)

    def run_fallback(self, request, *, deadline):
        del request
        self.calls.append((FALLBACK_ENGINE, deadline))
        return self._return_or_raise(self.fallback)


#: Engine-artifact descriptors a fake builder opened, released after each test.
#: In production these are owned by the ``NativeEngineOutputs`` sink; here the
#: test session owns them, and either way the runner and publisher only borrow.
_OPEN_ARTIFACT_DESCRIPTORS: list[int] = []


@pytest.fixture(autouse=True)
def _release_artifact_descriptors():
    yield
    while _OPEN_ARTIFACT_DESCRIPTORS:
        try:
            os.close(_OPEN_ARTIFACT_DESCRIPTORS.pop())
        except OSError:
            pass


def _borrowed_artifact_descriptor(path: Path) -> int:
    flags = os.O_RDONLY
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    flags |= getattr(os, "O_NONBLOCK", 0)
    descriptor = os.open(path, flags)
    _OPEN_ARTIFACT_DESCRIPTORS.append(descriptor)
    return descriptor


class _FakeArtifactBuilder:
    def __init__(self, *, large_aligned_model: bool = False) -> None:
        self.calls = []
        self.large_aligned_model = large_aligned_model

    @staticmethod
    def _descriptor(path: Path, name: str, semantic_media_type: str):
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        return RefineFileArtifact(
            name=name,
            descriptor=_borrowed_artifact_descriptor(path),
            sha256=digest,
            size_bytes=path.stat().st_size,
            transport_content_type="application/octet-stream",
            semantic_media_type=semantic_media_type,
            display_path=str(path),
        )

    def build_engine_artifacts(
        self,
        *,
        request,
        candidate,
        selected_engine,
        alignment,
        aligned_poses,
        deadline,
    ):
        self.calls.append(
            (
                request,
                candidate,
                selected_engine,
                alignment,
                tuple(aligned_poses),
                deadline,
            )
        )
        artifact_dir = request.workspace_root / "engine-artifacts"
        artifact_dir.mkdir(exist_ok=True)
        artifacts = []
        for name in sorted(_ENGINE_PAYLOADS):
            path = artifact_dir / name
            payload = _ENGINE_PAYLOADS[name]
            if name == "aligned-sparse-model-v1.tar" and self.large_aligned_model:
                payload = b"\0" * (8 * 1024 * 1024 - 1) + b"x"
            if not path.exists():
                path.write_bytes(payload)
            artifacts.append(self._descriptor(path, name, _ENGINE_MEDIA_TYPES[name]))
        return tuple(artifacts)


def _deadline() -> RefineDeadline:
    return RefineDeadline(time.monotonic() + 60.0)


def _with_manifest_document(result, document):
    manifest = RefineInlineArtifact(
        name=REFINE_MANIFEST_NAME,
        transport_content_type="application/json",
        semantic_media_type="application/json",
        payload=refine_runner._canonical_json_bytes(document),
    )
    return replace(
        result,
        manifest_sha256=manifest.sha256,
        files=(*result.files[:-1], manifest),
    )


def test_primary_success_builds_byte_deterministic_manifest_last_artifacts(tmp_path):
    request = _request(tmp_path)
    backend = _FakeBackend(primary=_candidate())
    builder = _FakeArtifactBuilder()
    deadline = _deadline()
    runner = RefineRunner(backend=backend, artifact_builder=builder)

    first = runner.run(request, deadline=deadline)
    second = runner.run(request, deadline=deadline)

    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE, PRIMARY_ENGINE]
    assert all(seen_deadline is deadline for _, seen_deadline in backend.calls)
    assert first == second
    assert first.selected_engine == PRIMARY_ENGINE
    assert first.fallback_policy is RefineFallbackPolicy.PRIMARY_ONLY
    assert first.fallback_trigger is None
    assert first.files[-1].name == REFINE_MANIFEST_NAME
    assert tuple(file.name for file in first.files[:-1]) == tuple(
        sorted(file.name for file in first.files[:-1])
    )
    assert first.manifest_key == (
        "room_file/user-1/scan-1/v3/refine/refine-manifest-v1.json"
    )
    assert first.room_file_id == request.room_file_id
    assert first.inputs == tuple(sorted(request.inputs, key=lambda source: source.key))

    manifest = json.loads(first.manifest.payload)
    assert manifest["schemaVersion"] == 1
    assert manifest["status"] == "complete"
    assert manifest["productionEnablement"] == "disabled"
    assert manifest["engine"] == {
        "actualCliVersion": "4.0.2",
        "actualPycolmapVersion": "4.0.2",
        "fallbackPolicy": RefineFallbackPolicy.PRIMARY_ONLY.value,
        "fallbackTrigger": None,
        "rotationPriorRepresented": True,
        "selected": PRIMARY_ENGINE,
        "targetVersion": "4.0.2",
    }
    assert [row["name"] for row in manifest["artifacts"]] == sorted(
        row["name"] for row in manifest["artifacts"]
    )
    assert manifest["inputs"] == sorted(manifest["inputs"], key=lambda row: row["key"])
    assert manifest["sim3"]["scale"] == pytest.approx(2.0)
    assert manifest["trajectoryShapeChange"]["certificationRole"] == "diagnostic-only"
    assert manifest["refinementEvidence"]["refinementEvidenced"] is True
    assert manifest["refinementEvidence"]["absoluteAccuracyCertified"] is False
    assert manifest["frameInputs"][0]["sourceHeic"] == {
        "archiveKey": "keyframes/user-1/room-1/keyframes.tar",
        "imageName": "frame_0000.heic",
        "member": "keyframes/frame_0000.heic",
        "relativePath": "extracted/keyframes/frame_0000.heic",
        "sha256": request.frames[0].source_sha256,
        "sizeBytes": request.frames[0].source_size_bytes,
    }
    assert manifest["frameInputs"][0]["enginePpm"] == {
        "imageName": "frame_000000.ppm",
        "relativePath": "images/frame_000000.ppm",
        "sha256": request.frames[0].engine_sha256,
        "sizeBytes": request.frames[0].engine_size_bytes,
    }
    assert first.engine_telemetry == _candidate().telemetry
    assert first.engine_outputs == _candidate().outputs
    assert manifest["engineTelemetry"] == {
        "commandCount": 4,
        "durationMs": 1250,
        "iterations": 9,
        "metrics": [
            {"name": "registeredImages", "value": 4},
            {"name": "usedGpuSift", "value": True},
        ],
        "vramPeakMb": 512,
    }
    assert [row["name"] for row in manifest["engineOutputs"]] == sorted(
        _ENGINE_PAYLOADS
    )
    binary_rows = {
        row["name"]: row
        for row in manifest["artifacts"]
        if row["name"] in _ENGINE_PAYLOADS
    }
    assert set(binary_rows) == set(_ENGINE_PAYLOADS)
    assert all(
        row["transportContentType"] == "application/octet-stream"
        for row in binary_rows.values()
    )
    assert {
        name: row["semanticMediaType"] for name, row in binary_rows.items()
    } == _ENGINE_MEDIA_TYPES
    assert not any(
        "log" in row["name"] or "stdout" in row["name"] or "stderr" in row["name"]
        for row in manifest["artifacts"]
    )
    assert all(
        isinstance(file, RefineFileArtifact)
        for file in first.files
        if file.name in binary_rows
    )
    assert isinstance(first.manifest, RefineInlineArtifact)
    assert validate_refine_result_for_publication(first) is None


def test_publication_validator_rejects_canonical_minimal_manifest(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    malformed = _with_manifest_document(
        result,
        {
            "schemaVersion": 1,
            "status": "complete",
            "productionEnablement": "disabled",
        },
    )

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(malformed)

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True


def test_publication_validator_rejects_extra_manifest_keys(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["unreviewedExtension"] = {}

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_publication_validator_rejects_boolean_room_file_version(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["identity"]["roomFileVersion"] = True

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_publication_validator_rejects_mutated_room_file_id(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["identity"]["roomFileId"] = "room-file-2"

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_publication_validator_rejects_mutated_input_sha256(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["inputs"][0]["sha256"] = "0" * 64

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_publication_validator_rejects_mutated_input_size(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["inputs"][0]["sizeBytes"] += 1

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_publication_validator_rejects_boolean_telemetry_integer(tmp_path):
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())
    document = json.loads(result.manifest.payload)
    document["engineTelemetry"]["commandCount"] = True

    with pytest.raises(RefineRunError) as raised:
        validate_refine_result_for_publication(
            _with_manifest_document(result, document)
        )

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


@pytest.mark.parametrize(
    ("field_name", "field_value"),
    (
        ("source_member", "keyframes/wrong.heic"),
        ("engine_name", "frame_000000.heic"),
        ("engine_name", "frame_999999.ppm"),
        ("engine_relative_path", "images/frame_999999.ppm"),
        ("materializer_id", ""),
    ),
)
def test_source_heic_and_engine_ppm_identity_contract_fails_closed_before_backend(
    tmp_path,
    field_name,
    field_value,
):
    request = _request(tmp_path)
    malformed = replace(request.frames[0], **{field_name: field_value})
    backend = _FakeBackend(primary=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(
            replace(request, frames=(malformed, *request.frames[1:])),
            deadline=_deadline(),
        )

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert backend.calls == []


@pytest.mark.parametrize(
    "mutation",
    ("missing", "raw-log", "wrong-media", "wrong-sha", "mutable-container"),
)
def test_candidate_output_references_require_the_closed_immutable_six_file_set(
    tmp_path,
    mutation,
):
    candidate = _candidate()
    outputs = candidate.outputs
    if mutation == "missing":
        malformed_outputs = outputs[:-1]
    elif mutation == "raw-log":
        raw_log = replace(
            outputs[-1],
            name="bundle-adjuster-20260723T120000Z.log",
            relative_path="engine-artifacts/bundle-adjuster-20260723T120000Z.log",
            semantic_media_type="text/plain",
        )
        malformed_outputs = (*outputs, raw_log)
    elif mutation == "wrong-media":
        malformed_outputs = (
            replace(outputs[0], semantic_media_type="text/plain"),
            *outputs[1:],
        )
    elif mutation == "wrong-sha":
        malformed_outputs = (
            replace(outputs[0], sha256="f" * 64),
            *outputs[1:],
        )
    else:
        malformed_outputs = list(outputs)
    malformed = replace(candidate, outputs=malformed_outputs)  # type: ignore[arg-type]
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True
    assert len(builder.calls) == (1 if mutation == "wrong-sha" else 0)


@pytest.mark.parametrize(
    "telemetry",
    (
        RefineEngineTelemetry(
            duration_ms=True,  # type: ignore[arg-type]
            iterations=1,
            vram_peak_mb=1,
            command_count=1,
            metrics=(),
        ),
        RefineEngineTelemetry(
            duration_ms=1,
            iterations=1,
            vram_peak_mb=1,
            command_count=1,
            metrics=(("bad key", 1),),
        ),
        RefineEngineTelemetry(
            duration_ms=1,
            iterations=1,
            vram_peak_mb=1,
            command_count=1,
            metrics=(("value", float("nan")),),
        ),
        RefineEngineTelemetry(
            duration_ms=1,
            iterations=1,
            vram_peak_mb=1,
            command_count=1,
            metrics=tuple((f"metric{index}", index) for index in range(33)),
        ),
    ),
)
def test_engine_telemetry_is_exact_immutable_and_bounded(tmp_path, telemetry):
    malformed = replace(_candidate(), telemetry=telemetry)
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.EVIDENCE_INVALID
    assert builder.calls == []


def test_candidate_output_and_telemetry_are_deep_snapshotted_before_builder(tmp_path):
    original = _candidate()

    class _MutatingBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            object.__setattr__(original.outputs[0], "sha256", "f" * 64)
            object.__setattr__(
                original.telemetry,
                "metrics",
                (("mutated", "after-return"),),
            )
            snapshot = kwargs["candidate"]
            assert snapshot.outputs[0].sha256 != original.outputs[0].sha256
            assert snapshot.telemetry.metrics != original.telemetry.metrics
            return super().build_engine_artifacts(**kwargs)

    result = RefineRunner(
        backend=_FakeBackend(primary=original),
        artifact_builder=_MutatingBuilder(),
    ).run(_request(tmp_path), deadline=_deadline())

    assert result.engine_outputs[0].sha256 != "f" * 64
    assert result.engine_telemetry.metrics == (
        ("registeredImages", 4),
        ("usedGpuSift", True),
    )


def test_old_candidate_without_output_contract_fails_closed(tmp_path):
    old_candidate = _candidate()
    object.__delattr__(old_candidate, "outputs")
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=old_candidate),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True
    assert builder.calls == []


def test_known_pose_construction_failure_uses_one_deadline_for_bounded_fallback(
    tmp_path,
):
    request = _request(tmp_path)
    fallback_trigger = EngineAttemptError(
        EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED,
        "known-pose seed construction failed",
    )
    backend = _FakeBackend(primary=fallback_trigger, fallback=_candidate())
    builder = _FakeArtifactBuilder()
    deadline = _deadline()

    result = RefineRunner(
        backend=backend,
        artifact_builder=builder,
        fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
    ).run(request, deadline=deadline)

    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE, FALLBACK_ENGINE]
    assert all(seen_deadline is deadline for _, seen_deadline in backend.calls)
    assert result.selected_engine == FALLBACK_ENGINE
    assert result.fallback_policy is RefineFallbackPolicy.POSITION_PRIOR_ENABLED
    assert result.fallback_trigger == EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED
    manifest = json.loads(result.manifest.payload)
    assert manifest["engine"]["selected"] == FALLBACK_ENGINE
    assert manifest["engine"]["fallbackPolicy"] == (
        RefineFallbackPolicy.POSITION_PRIOR_ENABLED.value
    )
    assert manifest["engine"]["fallbackTrigger"] == (
        EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED.value
    )
    assert manifest["engine"]["rotationPriorRepresented"] is False


def test_position_prior_fallback_is_fail_closed_by_default(tmp_path):
    backend = _FakeBackend(
        primary=EngineAttemptError(
            EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED,
            "known-pose seed construction failed",
        ),
        fallback=_candidate(),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ENGINE_FAILED
    assert raised.value.fatal is False
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_cleanup_failure_never_uses_explicitly_enabled_fallback(tmp_path):
    backend = _FakeBackend(
        primary=EngineAttemptError(
            EngineFailureKind.CLEANUP_FAILED,
            "native process group could not be proven reaped",
        ),
        fallback=_candidate(),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ENGINE_CLEANUP_FAILED
    assert raised.value.token == "REFINE_ENGINE_CLEANUP_FAILED"
    assert raised.value.fatal is True
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_primary_cleanup_failure_precedes_deadline_expiry_while_unwinding(tmp_path):
    class _CleanupThenExpireBackend(_FakeBackend):
        def run_primary(self, request, *, deadline):
            del request
            self.calls.append((PRIMARY_ENGINE, deadline))
            object.__setattr__(deadline, "expired", True)
            raise EngineAttemptError(
                EngineFailureKind.CLEANUP_FAILED,
                "native descendants could not be proven reaped",
            )

    backend = _CleanupThenExpireBackend(primary=_candidate(), fallback=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
        ).run(_request(tmp_path), deadline=_expirable_deadline())

    assert raised.value.code is RefineFailureCode.ENGINE_CLEANUP_FAILED
    assert raised.value.fatal is True
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_fallback_cleanup_failure_precedes_deadline_expiry_while_unwinding(tmp_path):
    class _FallbackCleanupThenExpireBackend(_FakeBackend):
        def run_fallback(self, request, *, deadline):
            del request
            self.calls.append((FALLBACK_ENGINE, deadline))
            object.__setattr__(deadline, "expired", True)
            raise EngineAttemptError(
                EngineFailureKind.CLEANUP_FAILED,
                "fallback native descendants could not be proven reaped",
            )

    backend = _FallbackCleanupThenExpireBackend(
        primary=EngineAttemptError(
            EngineFailureKind.PRIMARY_UNSUPPORTED,
            "known-pose construction unavailable",
        ),
        fallback=_candidate(),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
        ).run(_request(tmp_path), deadline=_expirable_deadline())

    assert raised.value.code is RefineFailureCode.ENGINE_CLEANUP_FAILED
    assert raised.value.fatal is True
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE, FALLBACK_ENGINE]


@pytest.mark.parametrize(
    ("path", "stable_code"),
    (
        ("primary", RefineFailureCode.SIM3_INVALID),
        ("fallback", RefineFailureCode.EVIDENCE_INVALID),
    ),
)
def test_backend_refine_run_error_precedes_deadline_expiry(
    tmp_path,
    path,
    stable_code,
):
    class _StableErrorThenExpireBackend(_FakeBackend):
        @staticmethod
        def _raise_stable(deadline):
            object.__setattr__(deadline, "expired", True)
            raise RefineRunError(stable_code, "already-classified backend failure")

        def run_primary(self, request, *, deadline):
            del request
            self.calls.append((PRIMARY_ENGINE, deadline))
            if path == "primary":
                self._raise_stable(deadline)
            return self._return_or_raise(self.primary)

        def run_fallback(self, request, *, deadline):
            del request
            self.calls.append((FALLBACK_ENGINE, deadline))
            self._raise_stable(deadline)

    primary = (
        _candidate()
        if path == "primary"
        else EngineAttemptError(
            EngineFailureKind.PRIMARY_UNSUPPORTED,
            "known-pose construction unavailable",
        )
    )
    backend = _StableErrorThenExpireBackend(
        primary=primary,
        fallback=_candidate(),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
        ).run(_request(tmp_path), deadline=_expirable_deadline())

    assert raised.value.code is stable_code
    assert raised.value.fatal is True
    expected_calls = (
        [PRIMARY_ENGINE] if path == "primary" else [PRIMARY_ENGINE, FALLBACK_ENGINE]
    )
    assert [name for name, _ in backend.calls] == expected_calls


def test_artifact_builder_refine_run_error_precedes_deadline_expiry(tmp_path):
    class _StableErrorThenExpireBuilder:
        def build_engine_artifacts(self, **kwargs):
            object.__setattr__(kwargs["deadline"], "expired", True)
            raise RefineRunError(
                RefineFailureCode.ARTIFACT_INVALID,
                "already-classified artifact failure",
            )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_StableErrorThenExpireBuilder(),
        ).run(_request(tmp_path), deadline=_expirable_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True


def test_fallback_policy_rejects_untyped_configuration():
    with pytest.raises(TypeError, match="RefineFallbackPolicy"):
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy="position_prior_enabled",  # type: ignore[arg-type]
        )


def test_fallback_is_not_launched_when_the_shared_deadline_is_exhausted(tmp_path):
    class _ExpiresBeforeFallback(RefineDeadline):
        expired = False

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            if type(self).expired:
                raise AdapterError(
                    "refine stage engine deadline is exhausted",
                    "REFINE_ENGINE_TIMEOUT",
                )
            return 10.0

    class _ExpiringBackend(_FakeBackend):
        def run_primary(self, request, *, deadline):
            del request
            self.calls.append((PRIMARY_ENGINE, deadline))
            type(deadline).expired = True
            raise EngineAttemptError(
                EngineFailureKind.PRIMARY_UNSUPPORTED,
                "known-pose construction unavailable",
            )

    _ExpiresBeforeFallback.expired = False
    backend = _ExpiringBackend(primary=_candidate(), fallback=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
            fallback_policy=RefineFallbackPolicy.POSITION_PRIOR_ENABLED,
        ).run(_request(tmp_path), deadline=_ExpiresBeforeFallback(100.0))

    assert raised.value.code == RefineFailureCode.ENGINE_TIMEOUT
    assert raised.value.fatal is False
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_candidate_returned_after_deadline_never_reaches_artifact_builder(tmp_path):
    class _ExpiresWhenPrimaryReturns(RefineDeadline):
        expired = False

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            if type(self).expired:
                raise AdapterError("expired after primary", "REFINE_ENGINE_TIMEOUT")
            return 10.0

    class _ExpiringBackend(_FakeBackend):
        def run_primary(self, request, *, deadline):
            result = super().run_primary(request, deadline=deadline)
            type(deadline).expired = True
            return result

    _ExpiresWhenPrimaryReturns.expired = False
    backend = _ExpiringBackend(primary=_candidate())
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=builder).run(
            _request(tmp_path),
            deadline=_ExpiresWhenPrimaryReturns(100.0),
        )

    assert raised.value.code == RefineFailureCode.ENGINE_TIMEOUT
    assert builder.calls == []


def test_artifact_output_returned_after_deadline_never_reaches_manifest(tmp_path):
    class _ExpiresWhenArtifactsReturn(RefineDeadline):
        expired = False

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            if type(self).expired:
                raise AdapterError(
                    "expired after artifact build",
                    "REFINE_ENGINE_TIMEOUT",
                )
            return 10.0

    class _ExpiringBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            result = super().build_engine_artifacts(**kwargs)
            type(kwargs["deadline"]).expired = True
            return result

    _ExpiresWhenArtifactsReturn.expired = False
    builder = _ExpiringBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=builder,
        ).run(
            _request(tmp_path),
            deadline=_ExpiresWhenArtifactsReturn(100.0),
        )

    assert raised.value.code == RefineFailureCode.ENGINE_TIMEOUT
    assert len(builder.calls) == 1


def test_large_engine_artifact_stays_file_backed_and_is_stream_verified(
    tmp_path,
    monkeypatch,
):
    request = _request(tmp_path)

    def _forbid_unbounded_read(_self):
        raise AssertionError("runner must not call Path.read_bytes on artifacts")

    monkeypatch.setattr(Path, "read_bytes", _forbid_unbounded_read)
    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate(large_aligned_model=True)),
        artifact_builder=_FakeArtifactBuilder(large_aligned_model=True),
    ).run(request, deadline=_deadline())

    aligned = next(
        artifact
        for artifact in result.files
        if artifact.name == "aligned-sparse-model-v1.tar"
    )
    assert isinstance(aligned, RefineFileArtifact)
    assert aligned.size_bytes == 8 * 1024 * 1024
    assert os.fstat(aligned.descriptor).st_size == 8 * 1024 * 1024
    assert not hasattr(aligned, "payload")


def test_engine_artifact_hash_is_reverified_before_manifest_construction(tmp_path):
    class _CorruptDescriptorBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            artifacts[0] = replace(artifacts[0], sha256="0" * 64)
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_CorruptDescriptorBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code == RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True


@pytest.mark.parametrize("replacement_kind", ("fifo", "symlink", "regular"))
def test_engine_artifact_substituted_at_its_path_is_simply_not_consulted(
    tmp_path,
    monkeypatch,
    replacement_kind,
):
    """The reopen this contract removed, probed from the attacker's side.

    The builder hands over a descriptor and the object at that name is then
    replaced -- with a FIFO that would hang a blocking open, a symlink that
    would redirect one, or a plain file with different bytes.  A runner that
    still reopened by path would hang, hash the wrong inode, or fail.  This one
    never looks at the name, so the run completes on the original bytes.
    """

    target_name = "database-v1.db"
    decoy = tmp_path / "outside-engine-artifact.bin"

    class _SwappingBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = super().build_engine_artifacts(**kwargs)
            nonlocal armed
            armed = True
            target = (
                kwargs["request"].workspace_root / "engine-artifacts" / target_name
            )
            target.unlink()
            if replacement_kind == "fifo":
                os.mkfifo(target, 0o600)
            elif replacement_kind == "symlink":
                decoy.write_bytes(b"must-not-be-hashed\n")
                target.symlink_to(decoy)
            else:
                target.write_bytes(b"must-not-be-hashed\n")
            return artifacts

    request = _request(tmp_path)
    forbidden = request.workspace_root / "engine-artifacts" / target_name
    real_open = refine_runner.os.open
    armed = False

    def guarded_open(path, *args, **kwargs):
        if armed and os.fspath(path) == os.fspath(forbidden):
            raise AssertionError("the runner must not reopen an artifact by path")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(refine_runner.os, "open", guarded_open)
    started = time.monotonic()

    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_SwappingBuilder(),
    ).run(request, deadline=_deadline())

    assert time.monotonic() - started < 5.0
    published = next(
        artifact for artifact in result.files if artifact.name == target_name
    )
    assert published.sha256 == hashlib.sha256(_ENGINE_PAYLOADS[target_name]).hexdigest()
    assert (
        os.pread(published.descriptor, published.size_bytes, 0)
        == _ENGINE_PAYLOADS[target_name]
    )


def test_a_successful_run_never_opens_any_path(tmp_path, monkeypatch):
    """The end state of the reopen removal, asserted as one property.

    Frames and engine artifacts both arrive as borrowed descriptors now, so a
    whole successful run has no reason to call ``open`` at all.  Making that
    fatal is the only assertion that cannot rot as the internals move around.
    """

    request = _request(tmp_path)
    builder = _FakeArtifactBuilder()
    # The fake builder legitimately opens the artifacts it is handing over,
    # exactly as a real materializer or native output sink would before the
    # runner is entered.  Everything it opens lives under this one directory, so
    # the exemption is a path allow-list.  It used to be "stop enforcing once
    # the builder has been called at all", which silently left the whole
    # post-builder half of a successful run unchecked.
    builder_fixtures = f"{request.workspace_root / 'engine-artifacts'}{os.sep}"
    opened: list[str] = []
    real_open = refine_runner.os.open

    def recording_open(path, *args, **kwargs):
        try:
            opened.append(os.fspath(path))
        except TypeError:
            opened.append(repr(path))
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(refine_runner.os, "open", recording_open)

    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=builder,
    ).run(request, deadline=_deadline())

    assert [name for name in opened if not name.startswith(builder_fixtures)] == []
    # If the builder ever stops opening its own fixtures the allow-list would
    # be vacuous, and this assertion is what would say so.
    assert opened
    assert result.files[-1].name == REFINE_MANIFEST_NAME


def test_a_frame_swapped_at_its_path_is_simply_not_consulted(tmp_path):
    """The materializer's pinned descriptor now survives the whole run."""

    request = _request(tmp_path)
    first = request.frames[0]
    engine_path = request.workspace_root / first.engine_relative_path
    original = engine_path.read_bytes()
    engine_path.unlink()
    os.mkfifo(engine_path, 0o600)
    started = time.monotonic()

    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(request, deadline=_deadline())

    # A blocking reopen of that FIFO would never return.
    assert time.monotonic() - started < 5.0
    assert os.pread(first.engine_descriptor, len(original), 0) == original
    assert result.frame_inputs[0].engine_descriptor == first.engine_descriptor


def test_a_frame_descriptor_that_disagrees_with_its_ledger_is_refused(tmp_path):
    request = _request(tmp_path)
    corrupted = replace(request.frames[0], engine_sha256="0" * 64)
    request = replace(request, frames=(corrupted, *request.frames[1:]))

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert "frame engine PPM sha256 does not match its ledger" in str(raised.value)


def test_prepared_frames_carry_the_identity_the_runner_proved(tmp_path):
    """The uniqueness check computed these and threw them away.

    A descriptor NUMBER is a slot in a table.  Carrying the ``(st_dev, st_ino)``
    the runner already proved is what lets the backend seam re-``fstat`` its
    borrowed frames instead of arguing that an fd number cannot have been
    recycled -- the same move the publisher now makes for engine artifacts.
    """

    request = _request(tmp_path)

    result = RefineRunner(
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(),
    ).run(request, deadline=_deadline())

    identities = set()
    for prepared in result.frame_inputs:
        source = os.fstat(prepared.source_descriptor)
        engine = os.fstat(prepared.engine_descriptor)
        assert prepared.source_identity == (source.st_dev, source.st_ino)
        assert prepared.engine_identity == (engine.st_dev, engine.st_ino)
        identities.add(prepared.source_identity)
        identities.add(prepared.engine_identity)
    # The source HEIC and its materialized PPM are distinct objects by contract,
    # so every frame contributes exactly two identities and none repeat.
    assert len(identities) == 2 * len(result.frame_inputs)


def test_a_frame_source_that_shrinks_while_it_is_hashed_is_refused(
    tmp_path,
    monkeypatch,
):
    """The short-read guard is unreachable through the normal door, not dead.

    ``_stable_descriptor_sha256`` refuses ``st_size != expected_size`` before it
    reads a byte, so an ordinary file can never end early inside the hash loop
    and deleting ``if not chunk: raise`` leaves the whole suite green.  A source
    that shrinks AFTER that check is exactly what the guard is for -- and it is
    the only bound on the loop, which would otherwise spin forever on a
    zero-length read, so a missing guard here is a hang and not a wrong answer.
    """

    request = _request(tmp_path)
    target = request.frames[0].source_descriptor
    real_pread = os.pread
    served: list[int] = []

    def shrinking_pread(descriptor, size, offset):
        if descriptor != target:
            return real_pread(descriptor, size, offset)
        if served:
            # The source was truncated after the parent measured it.
            return b""
        served.append(offset)
        return real_pread(descriptor, 1, offset)

    monkeypatch.setattr(refine_runner.os, "pread", shrinking_pread)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert "source ended before its declared size" in str(raised.value)


def test_a_frame_may_not_reuse_another_frames_inode(tmp_path):
    request = _request(tmp_path)
    first, second = request.frames[0], request.frames[1]
    shared = replace(
        second,
        engine_descriptor=first.engine_descriptor,
        engine_sha256=first.engine_sha256,
        engine_size_bytes=first.engine_size_bytes,
    )
    request = replace(request, frames=(first, shared, *request.frames[2:]))

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert "unique file identities" in str(raised.value)


@pytest.mark.parametrize(
    "descriptor",
    (-1, "not-a-descriptor", None, 4096),
)
def test_a_frame_descriptor_must_be_a_usable_borrowed_handle(tmp_path, descriptor):
    request = _request(tmp_path)
    request = replace(
        request,
        frames=(
            replace(request.frames[0], source_descriptor=descriptor),
            *request.frames[1:],
        ),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code in (
        RefineFailureCode.INPUT_INVALID,
        RefineFailureCode.INPUT_IO,
    )


def test_a_writable_frame_descriptor_is_refused(tmp_path):
    request = _request(tmp_path)
    first = request.frames[0]
    writable = os.open(
        request.workspace_root / first.relative_source_path,
        os.O_RDWR,
    )
    _OPEN_ARTIFACT_DESCRIPTORS.append(writable)
    request = replace(
        request,
        frames=(replace(first, source_descriptor=writable), *request.frames[1:]),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert "must be borrowed read-only" in str(raised.value)


def test_the_descriptor_hasher_ignores_a_path_level_replacement(tmp_path):
    target = tmp_path / "source.bin"
    original = b"descriptor-bound-original\n"
    replacement = b"path-level-replacement!!!\n"
    assert len(original) == len(replacement)
    target.write_bytes(original)
    original_stat = target.stat()
    descriptor = _borrowed_artifact_descriptor(target)
    target.unlink()
    target.write_bytes(replacement)

    digest, stable_stat = refine_runner._stable_descriptor_sha256(
        descriptor,
        expected_size=len(original),
        deadline=_deadline(),
    )

    assert digest == hashlib.sha256(original).hexdigest()
    assert (stable_stat.st_dev, stable_stat.st_ino) == (
        original_stat.st_dev,
        original_stat.st_ino,
    )
    assert target.read_bytes() == replacement
    assert target.stat().st_ino != stable_stat.st_ino


def test_a_directory_descriptor_is_not_a_frame(tmp_path):
    request = _request(tmp_path)
    directory = os.open(request.workspace_root, os.O_RDONLY)
    _OPEN_ARTIFACT_DESCRIPTORS.append(directory)
    request = replace(
        request,
        frames=(
            replace(request.frames[0], source_descriptor=directory),
            *request.frames[1:],
        ),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert "frame source HEIC must be a regular file" in str(raised.value)


def test_two_engine_artifacts_may_not_share_one_inode(tmp_path):
    class _HardlinkingBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            directory = kwargs["request"].workspace_root / "engine-artifacts"
            link = directory / "pairs-v2.txt"
            link.unlink()
            os.link(directory / "adapter-v2.json", link)
            for index, artifact in enumerate(artifacts):
                if artifact.name == "pairs-v2.txt":
                    artifacts[index] = replace(
                        artifact,
                        descriptor=_borrowed_artifact_descriptor(link),
                    )
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_HardlinkingBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert "engine artifacts must reference unique file identities" in str(
        raised.value
    )


@pytest.mark.parametrize("display_path", ("", 12, b"/tmp/x"))
def test_an_unusable_display_path_is_refused(tmp_path, display_path):
    class _BadDisplayPathBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            artifacts[0] = replace(artifacts[0], display_path=display_path)
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_BadDisplayPathBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert "display path must be absent or a non-empty string" in str(raised.value)


def test_the_descriptor_hasher_rejects_a_size_disagreement(tmp_path):
    target = tmp_path / "source.bin"
    target.write_bytes(b"seven!!")
    descriptor = _borrowed_artifact_descriptor(target)

    with pytest.raises(ValueError) as raised:
        refine_runner._stable_descriptor_sha256(
            descriptor,
            expected_size=8,
            deadline=_deadline(),
        )

    assert "size does not match its ledger" in str(raised.value)


def test_the_descriptor_hasher_rejects_a_source_that_grew_mid_read(
    tmp_path,
    monkeypatch,
):
    """The trailing-byte probe, reached the only way it can be: a growth race."""

    target = tmp_path / "source.bin"
    payload = b"z" * 16
    target.write_bytes(payload)
    descriptor = _borrowed_artifact_descriptor(target)
    real_pread = refine_runner.os.pread
    grown = False

    def grow_once(fd, size, offset):
        nonlocal grown
        chunk = real_pread(fd, size, offset)
        if not grown:
            grown = True
            with target.open("ab") as handle:
                handle.write(b"extra")
        return chunk

    monkeypatch.setattr(refine_runner.os, "pread", grow_once)

    with pytest.raises(ValueError) as raised:
        refine_runner._stable_descriptor_sha256(
            descriptor,
            expected_size=len(payload),
            deadline=_deadline(),
        )

    assert grown is True
    assert "exceeds its declared size" in str(raised.value)


def test_the_descriptor_hasher_rejects_an_in_place_mutation(tmp_path, monkeypatch):
    target = tmp_path / "source.bin"
    payload = b"w" * 16
    target.write_bytes(payload)
    descriptor = _borrowed_artifact_descriptor(target)
    real_pread = refine_runner.os.pread
    mutated = False

    def mutate_once(fd, size, offset):
        nonlocal mutated
        chunk = real_pread(fd, size, offset)
        if not mutated and size > 1:
            mutated = True
            time.sleep(0.01)
            with target.open("r+b") as handle:
                handle.write(b"v" * len(payload))
        return chunk

    monkeypatch.setattr(refine_runner.os, "pread", mutate_once)

    with pytest.raises(ValueError) as raised:
        refine_runner._stable_descriptor_sha256(
            descriptor,
            expected_size=len(payload),
            deadline=_deadline(),
        )

    assert mutated is True
    assert "changed while it was hashed" in str(raised.value)


def test_the_descriptor_hasher_leaves_the_borrowed_offset_alone(tmp_path):
    target = tmp_path / "source.bin"
    payload = b"y" * ((1 << 20) + 3)
    target.write_bytes(payload)
    descriptor = _borrowed_artifact_descriptor(target)
    os.lseek(descriptor, 7, os.SEEK_SET)

    digest, _ = refine_runner._stable_descriptor_sha256(
        descriptor,
        expected_size=len(payload),
        deadline=_deadline(),
    )

    assert digest == hashlib.sha256(payload).hexdigest()
    assert os.lseek(descriptor, 0, os.SEEK_CUR) == 7


def test_engine_artifact_path_must_remain_inside_the_workspace(tmp_path):
    class _EscapingArtifactBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            outside = tmp_path / "outside-database-v1.db"
            outside.write_bytes(b"outside")
            artifacts[0] = self._descriptor(
                outside,
                "database-v1.db",
                "application/vnd.sqlite3",
            )
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_EscapingArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code == RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True


@pytest.mark.parametrize(
    "unsafe_name",
    (
        "database?.db",
        "database#.db",
        "database%.db",
        "database\\escape.db",
    ),
)
def test_engine_artifact_names_reject_storage_reserved_characters(
    tmp_path,
    unsafe_name,
):
    class _UnsafeNameBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            artifacts[0] = replace(artifacts[0], name=unsafe_name)
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_UnsafeNameBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code == RefineFailureCode.ARTIFACT_INVALID


@pytest.mark.parametrize(
    ("artifact_name", "semantic_media_type"),
    (
        ("adapter-v2.json", "text/plain"),
        ("pairs-v2.txt", "application/json"),
        ("database-v1.db", "application/x-tar"),
        ("database-v1.db", "application/vnd.sqlite3 "),
        ("seed-model-v1.tar", "application/vnd.sqlite3"),
        ("seed-model-v1.tar", "application/x-tar\n"),
        ("aligned-sparse-model-v1.tar", "text/plain"),
        ("aligned-sparse-model-v1.tar", "application/x-tar\x00"),
        ("engine-command-evidence-v1.json", "text/plain"),
    ),
)
def test_engine_artifact_semantic_media_type_is_exact_for_its_name(
    tmp_path,
    artifact_name,
    semantic_media_type,
):
    class _WrongMediaBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            index = next(
                index
                for index, artifact in enumerate(artifacts)
                if artifact.name == artifact_name
            )
            artifacts[index] = replace(
                artifacts[index],
                semantic_media_type=semantic_media_type,
            )
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_WrongMediaBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_arbitrary_safe_engine_artifact_name_is_rejected(tmp_path):
    class _ArbitraryArtifactBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            artifacts = list(super().build_engine_artifacts(**kwargs))
            artifacts[0] = replace(
                artifacts[0],
                name="database-copy-v1.db",
            )
            return tuple(artifacts)

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_ArbitraryArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID


def test_one_shot_artifact_builder_output_is_deterministically_invalid(tmp_path):
    class _OneShotArtifactBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            return iter(super().build_engine_artifacts(**kwargs))

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_OneShotArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True


@pytest.mark.parametrize(
    ("builder_error", "expected_code", "expected_fatal"),
    (
        (
            OSError("temporary artifact filesystem failure"),
            RefineFailureCode.INPUT_IO,
            False,
        ),
        (
            AdapterError("temporary materializer failure", "REFINE_INPUT_IO"),
            RefineFailureCode.INPUT_IO,
            False,
        ),
        (
            TimeoutError("materializer deadline expired"),
            RefineFailureCode.ENGINE_TIMEOUT,
            False,
        ),
        (
            AdapterError("materializer deadline expired", "REFINE_ENGINE_TIMEOUT"),
            RefineFailureCode.ENGINE_TIMEOUT,
            False,
        ),
        # A full workspace filesystem.  Before this case existed the code fell
        # through the AdapterError handler to ARTIFACT_INVALID, whose fatality
        # is True, so a disk that filled during the engine-output freeze killed
        # the task permanently instead of leaving it to run again once an
        # operator freed space.  ``expected_fatal is False`` is the half of this
        # assertion that would have caught that; the code alone would not.
        (
            AdapterError(
                "the freeze vault filesystem ran out of space mid-copy",
                "REFINE_ENGINE_NO_SPACE",
            ),
            RefineFailureCode.ENGINE_NO_SPACE,
            False,
        ),
        # The handler's FALLTHROUGH, which nothing exercised before.  Every
        # ``ValueError`` case here is caught by the generic ``except Exception``
        # arm instead, so changing the AdapterError default from
        # ARTIFACT_INVALID to anything else was a mutation with zero red -- the
        # exact blind spot that let REFINE_ENGINE_NO_SPACE land on a FATAL
        # default unnoticed.  An unrecognised typed code must land here, and
        # must land FATAL: the runner cannot know a code it has never been
        # taught is safe to retry.
        (
            AdapterError("an adapter code this runner has never seen", "REFINE_WIDGET"),
            RefineFailureCode.ARTIFACT_INVALID,
            True,
        ),
        (
            ValueError("deterministic malformed model"),
            RefineFailureCode.ARTIFACT_INVALID,
            True,
        ),
    ),
)
def test_artifact_builder_failures_have_stable_retryability(
    tmp_path,
    builder_error,
    expected_code,
    expected_fatal,
):
    class _RaisingBuilder:
        def build_engine_artifacts(self, **kwargs):
            del kwargs
            raise builder_error

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_RaisingBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is expected_code
    assert raised.value.fatal is expected_fatal
    if type(builder_error) is ValueError:
        assert "ValueError" in str(raised.value)
        assert "deterministic malformed model" not in str(raised.value)


def test_frame_source_path_must_be_relative_and_contained_before_backend_call(tmp_path):
    request = _request(tmp_path)
    first = replace(request.frames[0], relative_source_path="../escape.heic")
    unsafe = replace(request, frames=(first, *request.frames[1:]))
    backend = _FakeBackend(primary=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(unsafe, deadline=_deadline())

    assert raised.value.code == RefineFailureCode.INPUT_INVALID
    assert backend.calls == []


def test_one_shot_request_inputs_are_rejected_before_backend_call(tmp_path):
    request = _request(tmp_path)
    one_shot = replace(request, inputs=iter(request.inputs))  # type: ignore[arg-type]
    backend = _FakeBackend(primary=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(one_shot, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert backend.calls == []


def test_unhashable_input_key_is_a_closed_input_failure(tmp_path):
    request = _request(tmp_path)
    malformed = InputArtifact(
        key=["not", "hashable"],  # type: ignore[arg-type]
        sha256="a" * 64,
        size_bytes=1,
    )
    unsafe = replace(request, inputs=(malformed, *request.inputs[1:]))
    backend = _FakeBackend(primary=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(unsafe, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert backend.calls == []


def test_one_shot_candidate_pose_rows_are_a_fatal_closed_geometry_failure(tmp_path):
    candidate = _candidate()
    malformed = replace(
        candidate,
        refined_poses=iter(candidate.refined_poses),  # type: ignore[arg-type]
    )
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.SIM3_INVALID
    assert raised.value.fatal is True
    assert builder.calls == []


@pytest.mark.parametrize("field_name", ("cli_version", "binding_version"))
@pytest.mark.parametrize(
    "invalid_version",
    (
        "4.0.2-dev",
        "v4.0.2",
        "4.0.2.1",
        " 4.0.2",
        "4.0.2 ",
        "4.0.2\n",
        True,
        1,
        _TargetVersionString(COLMAP_TARGET_VERSION),
        _TargetVersionImposter(),
    ),
    ids=(
        "suffix",
        "prefix",
        "extra-segment",
        "leading-whitespace",
        "trailing-whitespace",
        "control-whitespace",
        "bool",
        "integer",
        "str-subclass",
        "equality-imposter",
    ),
)
def test_candidate_versions_must_be_exact_builtin_target_strings(
    tmp_path,
    field_name,
    invalid_version,
):
    candidate = replace(
        _candidate(),
        **{field_name: invalid_version},
    )
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=candidate),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.ENGINE_VERSION_MISMATCH
    assert raised.value.fatal is True
    assert builder.calls == []


def test_unhashable_refined_pose_name_is_a_closed_geometry_failure(tmp_path):
    candidate = _candidate()
    malformed_row = replace(
        candidate.refined_poses[0],
        engine_image_name=["not", "hashable"],  # type: ignore[arg-type]
    )
    malformed = replace(
        candidate,
        refined_poses=(malformed_row, *candidate.refined_poses[1:]),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.SIM3_INVALID


@pytest.mark.parametrize("field_name", ("rotation", "translation", "qvec"))
def test_mutable_nested_refined_pose_values_are_rejected(tmp_path, field_name):
    candidate = _candidate()
    first = candidate.refined_poses[0]
    if field_name == "rotation":
        malformed_pose = replace(
            first.cam_from_world,
            rotation=[  # type: ignore[arg-type]
                list(row) for row in first.cam_from_world.rotation
            ],
        )
    elif field_name == "translation":
        malformed_pose = replace(
            first.cam_from_world,
            translation=list(  # type: ignore[arg-type]
                first.cam_from_world.translation
            ),
        )
    else:
        malformed_pose = replace(
            first.cam_from_world,
            qvec=list(first.cam_from_world.qvec),  # type: ignore[arg-type]
        )
    malformed = replace(
        candidate,
        refined_poses=(
            replace(first, cam_from_world=malformed_pose),
            *candidate.refined_poses[1:],
        ),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.SIM3_INVALID
    assert raised.value.fatal is True


def test_backend_candidate_mutation_after_return_cannot_change_deep_snapshot(tmp_path):
    original = _candidate()

    class _MutatingOriginalBuilder(_FakeArtifactBuilder):
        def build_engine_artifacts(self, **kwargs):
            original_pose = original.refined_poses[0].cam_from_world
            object.__setattr__(
                original_pose,
                "rotation",
                [list(row) for row in original_pose.rotation],
            )
            object.__setattr__(
                original_pose,
                "translation",
                list(original_pose.translation),
            )
            snapshotted_pose = kwargs["candidate"].refined_poses[0].cam_from_world
            assert snapshotted_pose is not original_pose
            assert type(snapshotted_pose.rotation) is tuple
            assert all(type(row) is tuple for row in snapshotted_pose.rotation)
            assert type(snapshotted_pose.translation) is tuple
            return super().build_engine_artifacts(**kwargs)

    builder = _MutatingOriginalBuilder()
    result = RefineRunner(
        backend=_FakeBackend(primary=original),
        artifact_builder=builder,
    ).run(_request(tmp_path), deadline=_deadline())

    snapshotted_candidate = builder.calls[0][1]
    assert type(original.refined_poses[0].cam_from_world.rotation) is list
    assert type(original.refined_poses[0].cam_from_world.translation) is list
    assert type(snapshotted_candidate.refined_poses[0].cam_from_world.rotation) is tuple
    assert (
        type(snapshotted_candidate.refined_poses[0].cam_from_world.translation) is tuple
    )
    assert json.loads(result.manifest.payload)["status"] == "complete"


@pytest.mark.parametrize(
    ("field_name", "field_value"),
    (
        ("input_images", True),
        ("common_observations", False),
        ("reprojection_rmse_px_before", True),
        ("reprojection_rmse_px_after", float("nan")),
        ("loop_rotation_rmse_deg_before", float("inf")),
        ("external_error_m_before", True),
    ),
)
def test_bool_and_nonfinite_evidence_is_rejected_without_type_errors(
    tmp_path,
    field_name,
    field_value,
):
    overrides: dict[str, object] = {field_name: field_value}
    if field_name == "external_error_m_before":
        overrides.update(
            {
                "external_error_m_after": 0.1,
                "external_evidence_kind": "fixture",
                "external_evidence_ref": "fixture:v1",
            }
        )
    malformed = _candidate(evidence=_evidence(**overrides))

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=malformed),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code is RefineFailureCode.EVIDENCE_INVALID
    assert raised.value.fatal is True


@pytest.mark.parametrize(
    "mutation",
    (
        "timestamp_bool",
        "timestamp_nan",
        "camera_center",
        "camera_center_list",
        "camera_transform",
        "camera_transform_list",
        "colmap_pose",
        "intrinsics",
        "position_prior",
        "covariance",
        "covariance_non_positive",
    ),
)
def test_internally_inconsistent_frames_fail_before_backend_call(tmp_path, mutation):
    request = _request(tmp_path)
    frame_input = request.frames[0]
    frame = frame_input.frame
    if mutation == "timestamp_bool":
        frame = replace(frame, frame_timestamp_s=True)
    elif mutation == "timestamp_nan":
        frame = replace(frame, frame_timestamp_s=float("nan"))
    elif mutation == "camera_center":
        frame = replace(frame, camera_center_m=(9.0, 0.0, 0.0))
    elif mutation == "camera_center_list":
        frame = replace(
            frame,
            camera_center_m=list(frame.camera_center_m),  # type: ignore[arg-type]
        )
    elif mutation == "camera_transform":
        transform = list(frame.arkit_camera_to_world)
        transform[3] = 9.0
        frame = replace(frame, arkit_camera_to_world=tuple(transform))
    elif mutation == "camera_transform_list":
        frame = replace(
            frame,
            arkit_camera_to_world=list(  # type: ignore[arg-type]
                frame.arkit_camera_to_world
            ),
        )
    elif mutation == "colmap_pose":
        frame = replace(frame, colmap_pose=_pose((9.0, 0.0, 0.0)))
    elif mutation == "intrinsics":
        frame = replace(
            frame,
            intrinsics=replace(frame.intrinsics, fx=frame.intrinsics.fx + 1.0),
        )
    elif mutation == "position_prior":
        frame = replace(
            frame,
            pose_prior=replace(frame.pose_prior, position_m=(9.0, 0.0, 0.0)),
        )
    elif mutation == "covariance":
        frame = replace(
            frame,
            pose_prior=replace(
                frame.pose_prior,
                covariance_m2=(
                    (0.01, 2.0, 0.0),
                    (0.0, 0.01, 0.0),
                    (0.0, 0.0, 0.01),
                ),
            ),
        )
    elif mutation == "covariance_non_positive":
        frame = replace(
            frame,
            pose_prior=replace(
                frame.pose_prior,
                covariance_m2=(
                    (1.0, 2.0, 0.0),
                    (2.0, 1.0, 0.0),
                    (0.0, 0.0, 1.0),
                ),
            ),
        )
    else:  # pragma: no cover
        raise AssertionError(mutation)
    unsafe = replace(
        request,
        frames=(replace(frame_input, frame=frame), *request.frames[1:]),
    )
    backend = _FakeBackend(primary=_candidate())

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(unsafe, deadline=_deadline())

    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert backend.calls == []


def test_expired_deadline_wins_at_run_entry_before_request_iteration(tmp_path):
    request = _request(tmp_path)
    malformed = replace(
        request,
        inputs=iter(request.inputs),  # type: ignore[arg-type]
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=_candidate()),
            artifact_builder=_FakeArtifactBuilder(),
        ).run(
            malformed,
            deadline=RefineDeadline(time.monotonic() - 1.0),
        )

    assert raised.value.code is RefineFailureCode.ENGINE_TIMEOUT


def test_deadline_is_checked_periodically_while_hashing_large_inputs(tmp_path):
    import inspect

    class _ExpiresInsideHash(RefineDeadline):
        hash_checks = 0

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            if any(
                frame_info.function == "_stable_descriptor_sha256"
                for frame_info in inspect.stack()
            ):
                type(self).hash_checks += 1
                if type(self).hash_checks >= 3:
                    raise AdapterError(
                        "expired during streaming hash",
                        "REFINE_ENGINE_TIMEOUT",
                    )
            return 10.0

    request = _request(tmp_path)
    first = request.frames[0]
    payload = b"x" * (4 * 1024 * 1024)
    first_path = request.workspace_root / first.relative_source_path
    first_path.write_bytes(payload)
    request = replace(
        request,
        frames=(
            replace(
                first,
                source_descriptor=_borrowed_artifact_descriptor(first_path),
                source_sha256=hashlib.sha256(payload).hexdigest(),
                source_size_bytes=len(payload),
            ),
            *request.frames[1:],
        ),
    )
    backend = _FakeBackend(primary=_candidate())
    _ExpiresInsideHash.hash_checks = 0

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(request, deadline=_ExpiresInsideHash(100.0))

    assert raised.value.code is RefineFailureCode.ENGINE_TIMEOUT
    assert _ExpiresInsideHash.hash_checks == 3
    assert backend.calls == []


def test_degenerate_refined_centres_fail_closed_without_trying_fallback(tmp_path):
    collinear = (
        (0.0, 0.0, 0.0),
        (1.0, 0.0, 0.0),
        (2.0, 0.0, 0.0),
        (3.0, 0.0, 0.0),
    )
    backend = _FakeBackend(primary=_candidate(centers=collinear), fallback=_candidate())
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=builder).run(
            _request(tmp_path), deadline=_deadline()
        )

    assert raised.value.code == RefineFailureCode.SIM3_INVALID
    assert raised.value.fatal is True
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]
    assert builder.calls == []


def test_non_rigid_refined_pose_fails_as_invalid_sim3_input(tmp_path):
    candidate = _candidate()
    malformed = ColmapPose(
        rotation=((2.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
        translation=(-1.0, -1.0, -1.0),
        qvec=(1.0, 0.0, 0.0, 0.0),
    )
    first = replace(candidate.refined_poses[0], cam_from_world=malformed)
    candidate = replace(
        candidate,
        refined_poses=(first, *candidate.refined_poses[1:]),
    )
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=_FakeBackend(primary=candidate),
            artifact_builder=builder,
        ).run(_request(tmp_path), deadline=_deadline())

    assert raised.value.code == RefineFailureCode.SIM3_INVALID
    assert builder.calls == []


def test_malformed_evidence_fails_with_stable_permanent_code(tmp_path):
    malformed = _evidence(common_observation_set_sha256="not-a-sha")
    backend = _FakeBackend(
        primary=_candidate(evidence=malformed), fallback=_candidate()
    )
    builder = _FakeArtifactBuilder()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=builder).run(
            _request(tmp_path), deadline=_deadline()
        )

    assert raised.value.code == RefineFailureCode.EVIDENCE_INVALID
    assert raised.value.fatal is True
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]
    assert builder.calls == []


def test_valid_but_unchanged_evidence_is_not_publishable(tmp_path):
    unchanged = _evidence(
        reprojection_rmse_px_after=0.8,
        loop_rotation_rmse_deg_after=1.0,
        loop_translation_direction_rmse_deg_after=2.0,
    )
    backend = _FakeBackend(primary=_candidate(evidence=unchanged))

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=_FakeArtifactBuilder()).run(
            _request(tmp_path), deadline=_deadline()
        )

    assert raised.value.code == RefineFailureCode.NO_MEASURABLE_IMPROVEMENT
    assert raised.value.fatal is True


def test_backend_error_text_is_bounded_by_existing_log_tail_ceiling(tmp_path):
    backend = _FakeBackend(
        primary=EngineAttemptError(
            EngineFailureKind.DRIVER,
            "é" * MAX_RUNNER_ERROR_BYTES,
        )
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(
            backend=backend,
            artifact_builder=_FakeArtifactBuilder(),
        ).run(_request(tmp_path), deadline=_deadline())

    encoded = str(raised.value).encode("utf-8")
    assert raised.value.code is RefineFailureCode.GPU_DRIVER
    assert len(encoded) <= MAX_RUNNER_ERROR_BYTES
    assert encoded.startswith(b"REFINE_GPU_DRIVER: ")


@pytest.mark.parametrize(
    ("kind", "code", "fatal"),
    (
        (EngineFailureKind.TIMEOUT, RefineFailureCode.ENGINE_TIMEOUT, False),
        (EngineFailureKind.TRANSIENT_IO, RefineFailureCode.INPUT_IO, False),
        (EngineFailureKind.DRIVER, RefineFailureCode.GPU_DRIVER, False),
        (EngineFailureKind.OOM, RefineFailureCode.GPU_OOM, False),
        (
            EngineFailureKind.VERSION_MISMATCH,
            RefineFailureCode.ENGINE_VERSION_MISMATCH,
            True,
        ),
        (EngineFailureKind.INVALID_INPUT, RefineFailureCode.INPUT_INVALID, True),
        (EngineFailureKind.LOW_OVERLAP, RefineFailureCode.LOW_OVERLAP, True),
        (
            EngineFailureKind.CLEANUP_FAILED,
            RefineFailureCode.ENGINE_CLEANUP_FAILED,
            True,
        ),
    ),
)
def test_backend_failure_taxonomy_is_stable_and_non_fallback(
    kind: EngineFailureKind,
    code: RefineFailureCode,
    fatal: bool,
    tmp_path: Path,
):
    backend = _FakeBackend(
        primary=EngineAttemptError(kind, "backend detail that is not a token"),
        fallback=_candidate(),
    )

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=_FakeArtifactBuilder()).run(
            _request(tmp_path), deadline=_deadline()
        )

    assert raised.value.code == code
    assert raised.value.fatal is fatal
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_the_no_space_token_is_literally_the_one_the_native_boundary_raises():
    """The seam the original defect lived in, pinned from both sides.

    ``refine_native_process`` mints ``REFINE_ENGINE_NO_SPACE`` itself and hands
    it up as an ``AdapterError``.  The runner's ``AdapterError`` handler names a
    few codes and falls through to ``ARTIFACT_INVALID`` -- which is FATAL -- for
    everything else, so a code that exists in one module and not the other is
    silently converted from "retry once the disk has room" into "this task is
    dead".  Comparing the two constants rather than restating the string means a
    rename on either side fails here instead of in production.

    NOTE what this does NOT claim: it is not an exhaustiveness check over every
    code the native boundary can raise.  The one such code whose fatality still
    changes across this handler (``REFINE_ENGINE_FAILED``, retryable in the
    taxonomy, fatal once it falls through) is left exactly as this branch found
    it and is reported as a residual rather than pinned here as correct.
    """

    import patina_scan_worker.refine_native_process as native_process

    assert native_process._NO_SPACE_CODE == RefineFailureCode.ENGINE_NO_SPACE.value


def test_a_full_workspace_filesystem_is_retryable_not_a_dead_task():
    """The fatality, stated on its own so a code-only assertion cannot cover it.

    A retryable classification that is marked fatal is the same outage as no
    classification at all.  ``fatal`` is what the queue reads.
    """

    assert REFINE_FAILURE_FATALITY[RefineFailureCode.ENGINE_NO_SPACE] is False
    assert (
        RefineRunError(RefineFailureCode.ENGINE_NO_SPACE, "vault filesystem full").fatal
        is False
    )
    # And the fatal default it used to land on, for contrast -- so a mutation
    # that flips the whole map to False does not leave this green.
    assert REFINE_FAILURE_FATALITY[RefineFailureCode.ARTIFACT_INVALID] is True


def test_failure_taxonomy_is_closed_and_covers_every_public_failure_code():
    assert set(REFINE_FAILURE_FATALITY) == set(RefineFailureCode)
    assert REFINE_FAILURE_FATALITY == {
        RefineFailureCode.ENGINE_TIMEOUT: False,
        RefineFailureCode.ENGINE_FAILED: False,
        RefineFailureCode.INPUT_IO: False,
        RefineFailureCode.ENGINE_NO_SPACE: False,
        RefineFailureCode.GPU_DRIVER: False,
        RefineFailureCode.GPU_OOM: False,
        RefineFailureCode.ENGINE_VERSION_MISMATCH: True,
        RefineFailureCode.INPUT_INVALID: True,
        RefineFailureCode.LOW_OVERLAP: True,
        RefineFailureCode.SIM3_INVALID: True,
        RefineFailureCode.EVIDENCE_INVALID: True,
        RefineFailureCode.EVIDENCE_REGRESSION: True,
        RefineFailureCode.NO_MEASURABLE_IMPROVEMENT: True,
        RefineFailureCode.ARTIFACT_INVALID: True,
        RefineFailureCode.ENGINE_CLEANUP_FAILED: True,
    }


def test_runner_remains_independent_of_queue_storage_db_and_stage_registry():
    import patina_scan_worker.refine_runner as module
    from patina_scan_worker.stages import get_handler

    source = Path(module.__file__).read_text(encoding="utf-8")
    assert "from .queue" not in source
    assert "from .storage" not in source
    assert "from .db" not in source
    assert "from .stages" not in source
    assert "BORROWED read-only descriptor" in (RefineFileArtifact.__doc__ or "")
    assert "Nothing may open it" in (RefineFileArtifact.__doc__ or "")
    assert "descriptor identity" in (
        refine_runner._verified_frame_descriptor.__doc__ or ""
    )
    assert "The descriptors are borrowed" in (PreparedRefineFrame.__doc__ or "")
    assert get_handler("scan_pipeline.refine") is None
