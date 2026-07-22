"""Queue-independent orchestration contract for the disabled P2 Refine runner."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import replace
from pathlib import Path

import pytest

from patina_scan_worker.refine_adapter import (
    AdapterError,
    ColmapPose,
    NormalizedFrame,
    PinholeIntrinsics,
    PositionPrior,
    RefineDeadline,
    RefinementEvidence,
)
from patina_scan_worker.refine_runner import (
    FALLBACK_ENGINE,
    PRIMARY_ENGINE,
    REFINE_FAILURE_FATALITY,
    REFINE_MANIFEST_NAME,
    EngineAttemptError,
    EngineFailureKind,
    InputArtifact,
    NamedRefinedPose,
    RefineEngineCandidate,
    RefineFailureCode,
    RefineFileArtifact,
    RefineFrameInput,
    RefineInlineArtifact,
    RefineRunError,
    RefineRunRequest,
    RefineRunner,
)


_IDENTITY = (
    (1.0, 0.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0),
)


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
    intrinsics = PinholeIntrinsics(800.0, 805.0, 320.0, 240.0, 640, 480)
    variance = 0.01
    return NormalizedFrame(
        ordinal=ordinal,
        frame_timestamp_s=float(ordinal),
        heic_path=f"keyframes/frame_{ordinal:04d}.heic",
        image_name=f"frame_{ordinal:04d}.heic",
        arkit_camera_to_world=(
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
        ),
        native_intrinsics=intrinsics,
        intrinsics=intrinsics,
        colmap_pose=_pose(center),
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
    image_dir = workspace / "images"
    image_dir.mkdir(parents=True)
    frames = []
    for index, center in enumerate(raw_centers):
        frame = _frame(index, center)
        payload = f"physical-raster-placeholder-{index}\n".encode("ascii")
        source = image_dir / frame.image_name
        source.write_bytes(payload)
        frames.append(
            RefineFrameInput(
                frame=frame,
                relative_source_path=f"images/{frame.image_name}",
                source_sha256=hashlib.sha256(payload).hexdigest(),
                source_size_bytes=len(payload),
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
            NamedRefinedPose(f"frame_{index:04d}.heic", _pose(center))
            for index, center in enumerate(refined_centers)
        ),
        evidence=evidence or _evidence(),
        iterations=9,
        vram_peak_mb=512,
    )


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
            source_path=path,
            sha256=digest,
            size_bytes=path.stat().st_size,
            transport_content_type="application/octet-stream",
            semantic_media_type=semantic_media_type,
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
        prefix = selected_engine.encode("ascii")
        database = artifact_dir / "database-v1.db"
        seed = artifact_dir / "seed-model-v1.tar"
        aligned = artifact_dir / "aligned-sparse-model-v1.tar"
        if not database.exists():
            database.write_bytes(b"db:" + prefix)
        if not seed.exists():
            seed.write_bytes(b"seed:" + prefix)
        if not aligned.exists():
            if self.large_aligned_model:
                with aligned.open("wb") as handle:
                    handle.seek(8 * 1024 * 1024 - 1)
                    handle.write(b"x")
            else:
                aligned.write_bytes(b"aligned:" + prefix)
        return (
            self._descriptor(
                database,
                "database-v1.db",
                "application/vnd.sqlite3",
            ),
            self._descriptor(
                seed,
                "seed-model-v1.tar",
                "application/x-tar",
            ),
            self._descriptor(
                aligned,
                "aligned-sparse-model-v1.tar",
                "application/x-tar",
            ),
        )


def _deadline() -> RefineDeadline:
    return RefineDeadline(time.monotonic() + 60.0)


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
    assert first.fallback_trigger is None
    assert first.files[-1].name == REFINE_MANIFEST_NAME
    assert tuple(file.name for file in first.files[:-1]) == tuple(
        sorted(file.name for file in first.files[:-1])
    )
    assert first.manifest_key == (
        "room_file/user-1/scan-1/v3/refine/refine-manifest-v1.json"
    )

    manifest = json.loads(first.manifest.payload)
    assert manifest["schemaVersion"] == 1
    assert manifest["status"] == "complete"
    assert manifest["productionEnablement"] == "disabled"
    assert manifest["engine"] == {
        "actualCliVersion": "4.0.2",
        "actualPycolmapVersion": "4.0.2",
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
    binary_rows = {
        row["name"]: row
        for row in manifest["artifacts"]
        if row["name"]
        in {
            "database-v1.db",
            "seed-model-v1.tar",
            "aligned-sparse-model-v1.tar",
        }
    }
    assert all(
        row["transportContentType"] == "application/octet-stream"
        for row in binary_rows.values()
    )
    assert binary_rows["database-v1.db"]["semanticMediaType"] == (
        "application/vnd.sqlite3"
    )
    assert all(
        isinstance(file, RefineFileArtifact)
        for file in first.files
        if file.name in binary_rows
    )
    assert isinstance(first.manifest, RefineInlineArtifact)


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

    result = RefineRunner(backend=backend, artifact_builder=builder).run(
        request, deadline=deadline
    )

    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE, FALLBACK_ENGINE]
    assert all(seen_deadline is deadline for _, seen_deadline in backend.calls)
    assert result.selected_engine == FALLBACK_ENGINE
    assert result.fallback_trigger == EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED
    manifest = json.loads(result.manifest.payload)
    assert manifest["engine"]["selected"] == FALLBACK_ENGINE
    assert manifest["engine"]["fallbackTrigger"] == (
        EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED.value
    )
    assert manifest["engine"]["rotationPriorRepresented"] is False


def test_fallback_is_not_launched_when_the_shared_deadline_is_exhausted(tmp_path):
    class _ExpiresBeforeFallback(RefineDeadline):
        calls = 0

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            type(self).calls += 1
            if type(self).calls == 1:
                return 10.0
            raise AdapterError(
                "refine stage engine deadline is exhausted",
                "REFINE_ENGINE_TIMEOUT",
            )

    _ExpiresBeforeFallback.calls = 0
    backend = _FakeBackend(
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
        ).run(_request(tmp_path), deadline=_ExpiresBeforeFallback(100.0))

    assert raised.value.code == RefineFailureCode.ENGINE_TIMEOUT
    assert raised.value.fatal is False
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]


def test_candidate_returned_after_deadline_never_reaches_artifact_builder(tmp_path):
    class _ExpiresWhenPrimaryReturns(RefineDeadline):
        calls = 0

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            type(self).calls += 1
            if type(self).calls == 1:
                return 10.0
            raise AdapterError("expired after primary", "REFINE_ENGINE_TIMEOUT")

    _ExpiresWhenPrimaryReturns.calls = 0
    backend = _FakeBackend(primary=_candidate())
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
        calls = 0

        def remaining_seconds(self, *, now_monotonic_s=None):
            del now_monotonic_s
            type(self).calls += 1
            if type(self).calls <= 2:
                return 10.0
            raise AdapterError("expired after artifact build", "REFINE_ENGINE_TIMEOUT")

    _ExpiresWhenArtifactsReturn.calls = 0
    builder = _FakeArtifactBuilder()

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
        backend=_FakeBackend(primary=_candidate()),
        artifact_builder=_FakeArtifactBuilder(large_aligned_model=True),
    ).run(request, deadline=_deadline())

    aligned = next(
        artifact
        for artifact in result.files
        if artifact.name == "aligned-sparse-model-v1.tar"
    )
    assert isinstance(aligned, RefineFileArtifact)
    assert aligned.size_bytes == 8 * 1024 * 1024
    assert aligned.source_path.is_file()
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


def test_failure_taxonomy_is_closed_and_covers_every_public_failure_code():
    assert set(REFINE_FAILURE_FATALITY) == set(RefineFailureCode)
    assert REFINE_FAILURE_FATALITY == {
        RefineFailureCode.ENGINE_TIMEOUT: False,
        RefineFailureCode.ENGINE_FAILED: False,
        RefineFailureCode.INPUT_IO: False,
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
    }


def test_runner_remains_independent_of_queue_storage_db_and_stage_registry():
    import patina_scan_worker.refine_runner as module
    from patina_scan_worker.stages import get_handler

    source = Path(module.__file__).read_text(encoding="utf-8")
    assert "from .queue" not in source
    assert "from .storage" not in source
    assert "from .db" not in source
    assert "from .stages" not in source
    assert get_handler("scan_pipeline.refine") is None
