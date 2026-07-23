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
    RefineFailureCode,
    RefineFallbackPolicy,
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


def _install_open_substitution(
    monkeypatch,
    *,
    target: Path,
    replacement_kind: str,
    symlink_target: Path,
) -> dict[str, int]:
    real_open = os.open
    observed: dict[str, int] = {}

    def _racing_open(path, flags, *args, **kwargs):
        if os.fspath(path) == os.fspath(target) and not observed:
            observed["flags"] = flags
            target.unlink()
            if replacement_kind == "fifo":
                os.mkfifo(target, 0o600)
            elif replacement_kind == "symlink":
                symlink_target.write_bytes(b"must-not-be-hashed\n")
                target.symlink_to(symlink_target)
            else:  # pragma: no cover - test helper contract
                raise AssertionError(replacement_kind)
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(refine_runner.os, "open", _racing_open)
    return observed


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


@pytest.mark.parametrize("replacement_kind", ("fifo", "symlink"))
def test_frame_hash_substitution_fails_promptly_before_backend_or_manifest(
    tmp_path,
    monkeypatch,
    replacement_kind,
):
    request = _request(tmp_path)
    target = request.workspace_root / request.frames[0].relative_source_path
    observed = _install_open_substitution(
        monkeypatch,
        target=target,
        replacement_kind=replacement_kind,
        symlink_target=tmp_path / "outside-frame.bin",
    )
    backend = _FakeBackend(primary=_candidate())
    builder = _FakeArtifactBuilder()
    manifest_calls = []

    def _manifest_trap(*args, **kwargs):
        manifest_calls.append((args, kwargs))
        raise AssertionError("manifest construction must not run")

    monkeypatch.setattr(refine_runner, "_inline_json", _manifest_trap)
    started = time.monotonic()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=builder).run(
            request,
            deadline=_deadline(),
        )

    assert time.monotonic() - started < 2.0
    assert raised.value.code is RefineFailureCode.INPUT_INVALID
    assert raised.value.fatal is True
    assert str(target) not in str(raised.value)
    assert observed
    if hasattr(os, "O_CLOEXEC"):
        assert observed["flags"] & os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        assert observed["flags"] & os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        assert observed["flags"] & os.O_NONBLOCK
    assert backend.calls == []
    assert builder.calls == []
    assert manifest_calls == []


@pytest.mark.parametrize("replacement_kind", ("fifo", "symlink"))
def test_engine_artifact_hash_substitution_fails_before_manifest(
    tmp_path,
    monkeypatch,
    replacement_kind,
):
    request = _request(tmp_path)
    target = request.workspace_root / "engine-artifacts" / "database-v1.db"
    observed = _install_open_substitution(
        monkeypatch,
        target=target,
        replacement_kind=replacement_kind,
        symlink_target=tmp_path / "outside-engine-artifact.bin",
    )
    backend = _FakeBackend(primary=_candidate())
    builder = _FakeArtifactBuilder()
    manifest_calls = []

    def _manifest_trap(*args, **kwargs):
        manifest_calls.append((args, kwargs))
        raise AssertionError("manifest construction must not run")

    monkeypatch.setattr(refine_runner, "_inline_json", _manifest_trap)
    started = time.monotonic()

    with pytest.raises(RefineRunError) as raised:
        RefineRunner(backend=backend, artifact_builder=builder).run(
            request,
            deadline=_deadline(),
        )

    assert time.monotonic() - started < 2.0
    assert raised.value.code is RefineFailureCode.ARTIFACT_INVALID
    assert raised.value.fatal is True
    assert str(target) not in str(raised.value)
    assert observed
    if hasattr(os, "O_CLOEXEC"):
        assert observed["flags"] & os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        assert observed["flags"] & os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        assert observed["flags"] & os.O_NONBLOCK
    assert [name for name, _ in backend.calls] == [PRIMARY_ENGINE]
    assert len(builder.calls) == 1
    assert manifest_calls == []


def test_stable_file_hash_uses_the_descriptor_opened_before_path_replacement(
    tmp_path,
    monkeypatch,
):
    target = tmp_path / "source.bin"
    original = b"descriptor-bound-original\n"
    replacement = b"path-level-replacement\n"
    target.write_bytes(original)
    original_stat = target.stat()
    real_open = os.open
    opened = False

    def _open_then_replace(path, flags, *args, **kwargs):
        nonlocal opened
        descriptor = real_open(path, flags, *args, **kwargs)
        if os.fspath(path) == os.fspath(target) and not opened:
            opened = True
            target.unlink()
            target.write_bytes(replacement)
        return descriptor

    monkeypatch.setattr(refine_runner.os, "open", _open_then_replace)

    digest, stable_stat = refine_runner._stable_file_sha256(
        target,
        deadline=_deadline(),
    )

    assert opened is True
    assert digest == hashlib.sha256(original).hexdigest()
    assert (stable_stat.st_dev, stable_stat.st_ino) == (
        original_stat.st_dev,
        original_stat.st_ino,
    )
    assert target.read_bytes() == replacement
    assert target.stat().st_ino != stable_stat.st_ino


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
        ("database-v1.db", "application/x-tar"),
        ("database-v1.db", "application/vnd.sqlite3 "),
        ("seed-model-v1.tar", "application/vnd.sqlite3"),
        ("seed-model-v1.tar", "application/x-tar\n"),
        ("aligned-sparse-model-v1.tar", "text/plain"),
        ("aligned-sparse-model-v1.tar", "application/x-tar\x00"),
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
        image_name=["not", "hashable"],  # type: ignore[arg-type]
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
                frame_info.function == "_stable_file_sha256"
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
    assert "exact same open descriptor" in (RefineFileArtifact.__doc__ or "")
    assert "do not make a path TOCTOU-safe" in (PreparedRefineFrame.__doc__ or "")
    assert get_handler("scan_pipeline.refine") is None
