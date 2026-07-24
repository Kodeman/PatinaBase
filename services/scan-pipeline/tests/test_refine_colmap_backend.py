from __future__ import annotations

import hashlib
import json
import os
import signal
import sys
import time
from dataclasses import dataclass, replace
from pathlib import Path
from types import MappingProxyType

import pytest
from patina_scan_worker import refine_colmap_backend as backend_module
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_backend import (
    ALIGNED_MODEL_BUILD_QUALIFIED,
    COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED,
    ENGINE_REQUEST_CONTRACT,
    ENGINE_REQUEST_SCHEMA_VERSION,
    EVIDENCE_BUILDER_CONTRACT_COMPATIBLE,
    FALLBACK_QUALIFIED,
    OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED,
    PACKET_CONTRACT,
    PACKET_EXTRACTION_QUALIFIED,
    PACKET_SCHEMA_VERSION,
    PILOT_200_400_FRAME_RANGE_QUALIFIED,
    PRIMARY_EXECUTION_QUALIFIED,
    PRODUCTION_ENABLEMENT,
    RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED,
    SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED,
    ColmapEngineRequest,
    RefineColmapBackend,
    build_engine_pair_graph,
    build_primary_operation_plan,
    load_colmap_packet_manifest,
    parse_engine_request_member,
    primary_point_triangulator_argv,
    run_inherited_colmap_command,
    run_refine_colmap_native,
)
from patina_scan_worker.refine_native_process import (
    NativeChildContext,
    native_engine_entrypoint,
    run_native_engine_child,
)


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
        + "\n"
    ).encode()


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _deadline(seconds: float = 5.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _frame(index: int, *, engine_name: str | None = None) -> dict[str, object]:
    name = engine_name or f"frame_{index:06d}.ppm"
    return {
        "ordinal": index,
        "sourceImageName": f"capture_{index:06d}.heic",
        "frameTimestampSeconds": float(index),
        "engineImageName": name,
        "engineRelativePath": f"images/{name}",
        "engineSha256": _sha(f"ppm-{index}".encode()),
        "engineSizeBytes": len(f"ppm-{index}".encode()),
        "intrinsics": {
            "fx": 600.0,
            "fy": 601.0,
            "cx": 320.0,
            "cy": 240.0,
            "width": 640,
            "height": 480,
        },
        "camFromWorld": {
            "rotation": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "translation": [-float(index) * 0.1, 0.0, 0.0],
        },
        "rawCameraCenterMeters": [float(index) * 0.1, 0.0, 0.0],
    }


@dataclass
class _PacketFixture:
    request: dict[str, object]
    engine_payload: bytes
    context: NativeChildContext
    manifest_path: Path
    chunk_path: Path
    manifest_handle: object
    chunk_handle: object

    def close(self) -> None:
        self.manifest_handle.close()
        self.chunk_handle.close()


def _packet_fixture(
    tmp_path: Path,
    *,
    frame_count: int = 3,
    first_engine_name: str | None = None,
) -> _PacketFixture:
    frames = [
        _frame(index, engine_name=first_engine_name if index == 0 else None)
        for index in range(frame_count)
    ]
    engine_document = {
        "schemaVersion": ENGINE_REQUEST_SCHEMA_VERSION,
        "contract": ENGINE_REQUEST_CONTRACT,
        "targetColmapVersion": "4.0.2",
        "gpuIndex": "0",
        "frames": frames,
    }
    engine_payload = _canonical_json(engine_document)
    chunk_payload = b"immutable-tar-chunk-placeholder" * 32
    chunk_path = tmp_path / "packet.chunk.000.tar"
    chunk_path.write_bytes(chunk_payload)
    members = [
        {
            "relativePath": "engine-request-v1.json",
            "chunkToken": "packet.chunk.000",
            "archiveMember": "engine-request-v1.json",
            "sha256": _sha(engine_payload),
            "sizeBytes": len(engine_payload),
            "role": "engine-request",
        },
        *[
            {
                "relativePath": frame["engineRelativePath"],
                "chunkToken": "packet.chunk.000",
                "archiveMember": frame["engineRelativePath"],
                "sha256": frame["engineSha256"],
                "sizeBytes": frame["engineSizeBytes"],
                "role": "engine-image",
            }
            for frame in frames
        ],
    ]
    # The ledger cannot claim more uncompressed member bytes than its chunk.
    if sum(int(row["sizeBytes"]) for row in members) > len(chunk_payload):
        chunk_payload = b"x" * (sum(int(row["sizeBytes"]) for row in members) + 512)
        chunk_path.write_bytes(chunk_payload)
    manifest_document = {
        "schemaVersion": PACKET_SCHEMA_VERSION,
        "contract": PACKET_CONTRACT,
        "requestMember": "engine-request-v1.json",
        "chunks": [
            {
                "token": "packet.chunk.000",
                "sha256": _sha(chunk_payload),
                "sizeBytes": len(chunk_payload),
            }
        ],
        "members": members,
    }
    manifest_payload = _canonical_json(manifest_document)
    manifest_path = tmp_path / "packet-manifest-v1.json"
    manifest_path.write_bytes(manifest_payload)
    manifest_handle = manifest_path.open("rb")
    chunk_handle = chunk_path.open("rb")
    context = NativeChildContext(
        time.monotonic() + 30.0,
        MappingProxyType(
            {
                "packet.manifest": manifest_handle.fileno(),
                "packet.chunk.000": chunk_handle.fileno(),
            }
        ),
    )
    request = {
        "schemaVersion": PACKET_SCHEMA_VERSION,
        "contract": PACKET_CONTRACT,
        "manifestToken": "packet.manifest",
        "manifestSha256": _sha(manifest_payload),
        "runId": "a" * 64,
        "fallbackPolicy": "primary-only",
    }
    return _PacketFixture(
        request,
        engine_payload,
        context,
        manifest_path,
        chunk_path,
        manifest_handle,
        chunk_handle,
    )


def _manifest_bound_to_payload(manifest, payload: bytes):
    members = tuple(
        replace(
            member,
            sha256=_sha(payload),
            size_bytes=len(payload),
        )
        if member.relative_path == manifest.request_member
        else member
        for member in manifest.members
    )
    return replace(manifest, members=members)


def test_packet_manifest_and_engine_request_are_canonical_and_descriptor_bound(
    tmp_path,
):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest_offset = fixture.manifest_handle.tell()
        chunk_offset = fixture.chunk_handle.tell()
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        request = parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()

    assert manifest.manifest_token == "packet.manifest"
    assert [row.token for row in manifest.chunks] == ["packet.chunk.000"]
    assert isinstance(request, ColmapEngineRequest)
    assert [frame.engine_image_name for frame in request.frames] == [
        "frame_000000.ppm",
        "frame_000001.ppm",
        "frame_000002.ppm",
    ]
    assert manifest_offset == 0
    assert chunk_offset == 0


def test_packet_chunk_hash_change_is_rejected_without_shared_offset_change(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        original_offset = fixture.chunk_handle.tell()
        with fixture.chunk_path.open("r+b") as changed:
            changed.seek(0)
            changed.write(b"X")
            changed.flush()
            os.fsync(changed.fileno())
        with pytest.raises(AdapterError, match="SHA-256") as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
        assert fixture.chunk_handle.tell() == original_offset
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_manifest_allocation_has_a_small_explicit_cap(monkeypatch, tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        monkeypatch.setattr(
            backend_module,
            "COLMAP_PACKET_MANIFEST_MAX_BYTES",
            fixture.manifest_path.stat().st_size - 1,
        )
        with pytest.raises(AdapterError, match="bounded descriptor size") as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_extra_pinned_token_is_rejected(tmp_path):
    fixture = _packet_fixture(tmp_path)
    extra_path = tmp_path / "extra"
    extra_path.write_bytes(b"x")
    extra = extra_path.open("rb")
    try:
        context = NativeChildContext(
            time.monotonic() + 30.0,
            MappingProxyType(
                {
                    **dict(fixture.context._pinned_files),
                    "packet.extra": extra.fileno(),
                }
            ),
        )
        with pytest.raises(AdapterError, match="token set") as raised:
            load_colmap_packet_manifest(fixture.request, context)
    finally:
        extra.close()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_fallback_policy_is_fail_closed_before_manifest_read(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        request = {**fixture.request, "fallbackPolicy": "allow-position-prior"}
        with pytest.raises(AdapterError, match="not I90-qualified") as raised:
            load_colmap_packet_manifest(request, fixture.context)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_FALLBACK_UNQUALIFIED"


def test_schema_versions_reject_booleans_even_when_equal_to_one(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        with pytest.raises(AdapterError, match="schema version") as native:
            load_colmap_packet_manifest(
                {**fixture.request, "schemaVersion": True},
                fixture.context,
            )

        manifest_document = json.loads(fixture.manifest_path.read_bytes())
        manifest_document["schemaVersion"] = True
        manifest_payload = _canonical_json(manifest_document)
        fixture.manifest_path.write_bytes(manifest_payload)
        with pytest.raises(AdapterError, match="contract") as manifest:
            load_colmap_packet_manifest(
                {
                    **fixture.request,
                    "manifestSha256": _sha(manifest_payload),
                },
                fixture.context,
            )
    finally:
        fixture.close()
    assert native.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert manifest.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    (
        ("schemaVersion", True, "contract"),
        ("gpuIndex", "\N{ARABIC-INDIC DIGIT ZERO}", "decimal device index"),
    ),
)
def test_engine_request_rejects_noncanonical_scalar_tokens(
    tmp_path,
    field,
    value,
    message,
):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document[field] = value
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match=message) as raised:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_normalizes_huge_finite_number_and_unsafe_backslash(
    tmp_path,
):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][0]["frameTimestampSeconds"] = 10**400
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="finite number") as overflow:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )

        document = json.loads(fixture.engine_payload)
        document["frames"][0]["sourceImageName"] = r"folder\capture.heic"
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="safe HEIC") as backslash:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )
    finally:
        fixture.close()
    assert overflow.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert backslash.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_source_heic_identity(tmp_path):
    fixture = _packet_fixture(tmp_path, first_engine_name="frame_000000.heic")
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        with pytest.raises(AdapterError, match="canonical PPM") as raised:
            parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("rotation", "message"),
    (
        (
            [[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 1.0]],
            "orthonormal",
        ),
        (
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, -1.0]],
            "proper right-handed",
        ),
    ),
)
def test_engine_request_rejects_nonproper_rotation(tmp_path, rotation, message):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][0]["camFromWorld"]["rotation"] = rotation
        changed = _canonical_json(document)
        manifest = _manifest_bound_to_payload(manifest, changed)
        with pytest.raises(AdapterError, match=message) as raised:
            parse_engine_request_member(changed, manifest)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_camera_center_inconsistent_with_pose(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][1]["rawCameraCenterMeters"] = [99.0, 0.0, 0.0]
        changed = _canonical_json(document)
        manifest = _manifest_bound_to_payload(manifest, changed)
        with pytest.raises(AdapterError, match=r"-R\^T t") as raised:
            parse_engine_request_member(changed, manifest)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_requires_physical_timestamp_source_order_before_renaming(
    tmp_path,
):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][0]["frameTimestampSeconds"] = 2.0
        document["frames"][1]["frameTimestampSeconds"] = 1.0
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="sorted by timestamp") as raised:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_unsafe_or_duplicate_source_identity(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][0]["sourceImageName"] = "../capture.heic"
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="safe HEIC") as unsafe:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )

        document = json.loads(fixture.engine_payload)
        document["frames"][1]["sourceImageName"] = document["frames"][0][
            "sourceImageName"
        ]
        document["frames"][1]["frameTimestampSeconds"] = document["frames"][0][
            "frameTimestampSeconds"
        ]
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="unique") as duplicate:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )
    finally:
        fixture.close()
    assert unsafe.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert duplicate.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_arbitrary_ppm_basename(tmp_path):
    fixture = _packet_fixture(tmp_path, first_engine_name="capture.ppm")
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        with pytest.raises(AdapterError, match="canonical PPM") as raised:
            parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_wrong_dense_identity_and_parent(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        document = json.loads(fixture.engine_payload)
        document["frames"][0]["engineImageName"] = "frame_000001.ppm"
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="canonical PPM") as identity:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )

        document = json.loads(fixture.engine_payload)
        document["frames"][0]["engineRelativePath"] = "other/frame_000000.ppm"
        changed = _canonical_json(document)
        with pytest.raises(AdapterError, match="canonical images") as parent:
            parse_engine_request_member(
                changed,
                _manifest_bound_to_payload(manifest, changed),
            )
    finally:
        fixture.close()
    assert identity.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert parent.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_engine_request_rejects_unrepresented_engine_image_member(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        image_member = next(
            member for member in manifest.members if member.role == "engine-image"
        )
        manifest = replace(
            manifest,
            members=(
                *manifest.members,
                replace(
                    image_member,
                    relative_path="images/frame_999999.ppm",
                    archive_member="images/frame_999999.ppm",
                ),
            ),
        )
        with pytest.raises(AdapterError, match="frame universe") as raised:
            parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_pair_graph_uses_engine_ppm_identity_and_exact_i87_spatial_policy(tmp_path):
    fixture = _packet_fixture(tmp_path, frame_count=13)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        request = parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()
    pairs = build_engine_pair_graph(request.frames)
    assert pairs == tuple(sorted(set(pairs)))
    assert all(
        first.endswith(".ppm") and second.endswith(".ppm") for first, second in pairs
    )
    assert not any(".heic" in value for pair in pairs for value in pair)
    # Ordinals 0 and 11 are non-temporal and 1.1 m apart, so this is one of
    # the bounded spatial candidates.
    assert ("frame_000000.ppm", "frame_000011.ppm") in pairs


def test_primary_plan_preserves_exact_order_and_stable_evidence_options(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
        request = parse_engine_request_member(fixture.engine_payload, manifest)
    finally:
        fixture.close()
    operations = build_primary_operation_plan(request)
    assert [row.operation for row in operations] == [
        "pycolmap.extract_features",
        "pycolmap.rewrite_camera_rows",
        "pycolmap.match_image_pairs",
        "policy.classify_post_match_overlap",
        "pycolmap.build_known_pose_seed",
        "colmap.point_triangulator",
        "pycolmap.inspect_triangulated_model",
        "snapshot.fixed_track_raw_arkit_baseline",
        "pycolmap.create_default_bundle_adjuster",
        "pycolmap.inspect_adjusted_model",
        "sim3.align_centers_points_orientations",
        "snapshot.fixed_track_geometry",
    ]
    assert dict(operations[0].options) == {
        "cameraMode": "PER_IMAGE",
        "gpuIndex": "0",
        "randomSeed": 0,
        "useGpu": True,
    }
    assert dict(operations[2].options)["geometricVerification"] is True
    assert dict(operations[2].options)["computeRelativePose"] is True
    assert dict(operations[2].options)["randomSeed"] == 0
    assert dict(operations[3].options)["requireVerifiedNonTemporalLoop"] is True
    assert dict(operations[4].options)["fullCamFromWorld"] is True
    assert dict(operations[4].options)["preserveDatabaseImageCameraIds"] is True
    assert dict(operations[4].options)["requireExactIntrinsics"] is True
    assert dict(operations[5].options) == {
        "clearPoints": True,
        "randomSeed": 0,
        "refineIntrinsics": False,
    }
    assert dict(operations[6].options)["requireValidModel"] is True
    bundle_adjustment = dict(operations[8].options)
    assert bundle_adjustment["allRegisteredImagesInConfig"] is True
    assert bundle_adjustment["gauge"] == "TWO_CAMS_FROM_WORLD"
    assert bundle_adjustment["requireUsableSolution"] is True
    assert bundle_adjustment["requirePositiveResidualCount"] is True
    assert bundle_adjustment["requireModelWritten"] is True
    assert not any(
        key.lower().endswith("path") or key.lower() in {"pid", "timestamp", "duration"}
        for operation in operations
        for key, _ in operation.options
    )


def test_point_triangulator_argv_is_the_i90_qualified_cli_contract(tmp_path):
    argv = primary_point_triangulator_argv(
        colmap=Path("/opt/colmap/4.0.2/bin/colmap"),
        database_path=tmp_path / "database.db",
        image_path=tmp_path / "images",
        seed_model_path=tmp_path / "seed",
        triangulated_model_path=tmp_path / "triangulated",
    )
    assert argv[0:2] == ("/opt/colmap/4.0.2/bin/colmap", "point_triangulator")
    assert argv[-6:] == (
        "--clear_points",
        "1",
        "--refine_intrinsics",
        "0",
        "--Mapper.random_seed",
        "0",
    )


def test_backend_and_fallback_remain_explicitly_disabled():
    backend = RefineColmapBackend()
    assert PRODUCTION_ENABLEMENT == "disabled-uncomposed"
    assert PILOT_200_400_FRAME_RANGE_QUALIFIED is False
    assert OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED is False
    assert RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED is False
    assert PACKET_EXTRACTION_QUALIFIED is False
    assert ALIGNED_MODEL_BUILD_QUALIFIED is False
    assert EVIDENCE_BUILDER_CONTRACT_COMPATIBLE is False
    assert PRIMARY_EXECUTION_QUALIFIED is False
    assert SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED is False
    assert COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED is False
    assert FALLBACK_QUALIFIED is False
    with pytest.raises(AdapterError) as primary:
        backend.run_primary()
    with pytest.raises(AdapterError) as fallback:
        backend.run_fallback()
    assert primary.value.code == "REFINE_BACKEND_DISABLED"
    assert fallback.value.code == "REFINE_FALLBACK_UNQUALIFIED"


def test_inherited_command_cleanup_failure_precedes_late_deadline(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    pid = os.getpid()
    monkeypatch.setattr(backend_module.os, "getsid", lambda _pid: pid)
    monkeypatch.setattr(backend_module.os, "getpgrp", lambda: pid)
    monkeypatch.setattr(
        backend_module.os,
        "fsync",
        lambda _descriptor: (_ for _ in ()).throw(OSError("synthetic fsync failure")),
    )

    class ExpiresAfterLaunch:
        expires_at_monotonic_s = time.monotonic() + 30.0
        calls = 0

        def remaining_seconds(self):
            self.calls += 1
            if self.calls > 1:
                raise AdapterError("late deadline", "REFINE_ENGINE_TIMEOUT")
            return 10.0

    deadline = ExpiresAfterLaunch()
    with pytest.raises(AdapterError, match="synchronize") as raised:
        run_inherited_colmap_command(
            (str(fake), "point_triangulator"),
            context=NativeChildContext(time.monotonic() + 30.0),
            deadline=deadline,
            log_path=tmp_path / "fsync-failure.log",
            cwd=tmp_path,
        )
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert deadline.calls == 1


@native_engine_entrypoint
def _run_fake_cli(request, context: NativeChildContext):
    deadline = RefineDeadline(context.expires_at_monotonic_s)
    result = run_inherited_colmap_command(
        tuple(request["command"]),
        context=context,
        deadline=deadline,
        log_path=Path(request["logPath"]),
        cwd=Path(request["cwd"]),
    )
    return {
        "returncode": result.returncode,
        "tail": result.output_tail,
        "session": os.getsid(0),
        "group": os.getpgrp(),
        "pid": os.getpid(),
    }


def _fake_cli(tmp_path: Path, program: str) -> Path:
    path = tmp_path / "fake-colmap"
    path.write_text(f"#!{sys.executable}\n{program}\n", encoding="utf-8")
    path.chmod(0o700)
    return path


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_fake_cli_inherits_native_session_and_retains_only_bounded_tail(tmp_path):
    fake = _fake_cli(
        tmp_path,
        "import sys; sys.stdout.write('x' * 70000 + 'COLMAP_OK\\n')",
    )
    log_path = tmp_path / "fake.log"
    result = run_native_engine_child(
        f"{__name__}:_run_fake_cli",
        {
            "command": [str(fake), "point_triangulator"],
            "logPath": str(log_path),
            "cwd": str(tmp_path),
        },
        deadline=_deadline(5.0),
    )
    assert result["returncode"] == 0
    assert result["session"] == result["group"] == result["pid"]
    assert result["tail"].endswith("COLMAP_OK\n")
    assert log_path.stat().st_size <= 64 * 1024


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_fake_cli_timeout_is_killed_and_reaped_by_native_owner(tmp_path):
    pid_path = tmp_path / "fake.pid"
    fake = _fake_cli(
        tmp_path,
        "import os,pathlib,time; "
        f"pathlib.Path({str(pid_path)!r}).write_text(str(os.getpid())); "
        "time.sleep(30)",
    )
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            f"{__name__}:_run_fake_cli",
            {
                "command": [str(fake), "point_triangulator"],
                "logPath": str(tmp_path / "timeout.log"),
                "cwd": str(tmp_path),
            },
            deadline=_deadline(0.5),
        )
    assert raised.value.code in {
        "REFINE_ENGINE_TIMEOUT",
        "REFINE_ENGINE_CLEANUP_FAILED",
    }
    if pid_path.exists():
        pid = int(pid_path.read_text())
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_fake_cli_surviving_descendant_prevents_native_success(tmp_path):
    descendant_pid_path = tmp_path / "descendant.pid"
    fake = _fake_cli(
        tmp_path,
        "import subprocess,sys; "
        "subprocess.Popen([sys.executable,'-c',"
        f'"import os,pathlib,time; pathlib.Path({str(descendant_pid_path)!r}).write_text(str(os.getpid())); time.sleep(30)"'
        "])",
    )
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_fake_cli",
                {
                    "command": [str(fake), "point_triangulator"],
                    "logPath": str(tmp_path / "survivor.log"),
                    "cwd": str(tmp_path),
                },
                deadline=_deadline(5.0),
            )
        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        stop = time.monotonic() + 2.0
        while not descendant_pid_path.exists() and time.monotonic() < stop:
            time.sleep(0.01)
        descendant_pid = int(descendant_pid_path.read_text())
        stop = time.monotonic() + 2.0
        while time.monotonic() < stop:
            try:
                os.kill(descendant_pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.01)
        else:
            pytest.fail("native owner did not reap fake COLMAP descendant")
    finally:
        if descendant_pid is not None:
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_production_native_entrypoint_is_fail_closed():
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native",
            {},
            deadline=_deadline(3.0),
        )
    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert callable(run_refine_colmap_native)
