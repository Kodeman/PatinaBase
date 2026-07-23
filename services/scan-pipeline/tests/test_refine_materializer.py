"""Adversarial contract tests for the disabled P2 Refine materializer."""

from __future__ import annotations

import hashlib
import io
import json
import os
import stat
import tarfile
import time
from dataclasses import replace
from pathlib import Path

import pytest

import patina_scan_worker.refine_materializer as refine_materializer
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_materializer import (
    FieldRasterMaterialization,
    MaterializerFailureCode,
    RefineMaterializationLimits,
    RefineMaterializationRequest,
    RefineMaterializer,
    RefineMaterializerError,
    RefineSourceArtifact,
)


USER_ID = "user-1"
SCAN_ID = "scan-1"
TASK_ID = "task-1"
LEASE_ID = "lease-1"


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


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
    ).encode("utf-8")


def _index_row(index: int, *, timestamp: float | None = None) -> dict[str, object]:
    value = float(index if timestamp is None else timestamp)
    stem = f"keyframe_{index:06d}"
    return {
        "heicPath": f"keyframes/{stem}.heic",
        "depthPath": f"keyframes/{stem}.bin" if index == 1 else None,
        "timestampSeconds": value + 1000.0,
        "frameTimestamp": value,
        "cameraTransform": [
            1.0,
            0.0,
            0.0,
            value,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
        ],
        "intrinsics": {
            "fx": 2.5,
            "fy": 2.0,
            "cx": 1.5,
            "cy": 1.0,
            "imageWidth": 3,
            "imageHeight": 2,
        },
        "sharpness": 250.0,
        "width": 2,
        "height": 3,
        "hasDepth": index == 1,
        "smoothedDepth": index == 1,
    }


def _tar_bytes(
    entries: list[tuple[tarfile.TarInfo, bytes | None]],
) -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for member, payload in entries:
            member.mtime = 0
            if payload is not None:
                member.size = len(payload)
                archive.addfile(member, io.BytesIO(payload))
            else:
                archive.addfile(member)
    return output.getvalue()


def _regular(name: str, payload: bytes) -> tuple[tarfile.TarInfo, bytes]:
    return tarfile.TarInfo(name), payload


class _MemoryAcquirer:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.calls: list[tuple[str, Path, RefineDeadline]] = []

    def acquire(
        self,
        *,
        object_key: str,
        destination: Path,
        deadline: RefineDeadline,
    ) -> None:
        self.calls.append((object_key, destination, deadline))
        destination.write_bytes(self.objects[object_key])


class _PrematerializedRaster:
    """Deterministic test adapter; deliberately not a production HEIC decoder."""

    def __init__(
        self,
        *,
        source_width_delta: int = 0,
        output_width_delta: int = 0,
    ) -> None:
        self.source_width_delta = source_width_delta
        self.output_width_delta = output_width_delta
        self.calls: list[tuple[Path, Path, str, RefineDeadline]] = []

    def materialize(
        self,
        *,
        source: Path,
        destination: Path,
        engine_name: str,
        encoded_width: int,
        encoded_height: int,
        deadline: RefineDeadline,
    ) -> FieldRasterMaterialization:
        self.calls.append((source, destination, engine_name, deadline))
        width = encoded_width + self.output_width_delta
        pixels = bytes([len(self.calls)]) * (width * encoded_height * 3)
        destination.write_bytes(
            f"P6\n{width} {encoded_height}\n255\n".encode("ascii") + pixels
        )
        return FieldRasterMaterialization(
            materializer_id="fake-prematerialized-ppm-v1",
            source_width=encoded_width + self.source_width_delta,
            source_height=encoded_height,
            output_width=width,
            output_height=encoded_height,
        )


class _MutableDeadline(RefineDeadline):
    def remaining_seconds(self, *, now_monotonic_s=None):
        del now_monotonic_s
        if getattr(self, "expired", False):
            raise AdapterError("expired", "REFINE_ENGINE_TIMEOUT")
        return 60.0


def _deadline() -> _MutableDeadline:
    value = _MutableDeadline(time.monotonic() + 60.0)
    object.__setattr__(value, "expired", False)
    return value


class _Fixture:
    def __init__(
        self,
        workspace_parent: Path,
        *,
        rows: list[dict[str, object]] | None = None,
        summary: dict[str, object] | None = None,
        archive_entries: list[tuple[tarfile.TarInfo, bytes | None]] | None = None,
    ) -> None:
        self.rows = rows or [
            _index_row(2, timestamp=2.0),
            _index_row(0, timestamp=0.0),
            _index_row(1, timestamp=1.0),
        ]
        index_payload = b"".join(_canonical_json(row) for row in self.rows)
        summary_payload = _canonical_json(
            summary
            or {
                "fired": len(self.rows),
                "blurRejected": 2,
                "rawBlurFailures": 3,
                "encodeDropped": 0,
                "blurRejectionRatio": 0.4,
            }
        )
        if archive_entries is None:
            archive_entries = []
            for row in self.rows:
                heic_path = str(row["heicPath"])
                archive_entries.append(
                    _regular(heic_path, f"heic:{heic_path}".encode("ascii"))
                )
                depth_path = row.get("depthPath")
                if isinstance(depth_path, str):
                    archive_entries.append(
                        _regular(depth_path, f"depth:{depth_path}".encode("ascii"))
                    )
            archive_entries.sort(key=lambda entry: entry[0].name)
        archive_payload = _tar_bytes(archive_entries)

        self.index = RefineSourceArtifact(
            object_key=f"keyframes/{USER_ID}/{SCAN_ID}/keyframe_index.ndjson",
            sha256=_sha256(index_payload),
            size_bytes=len(index_payload),
        )
        self.summary = RefineSourceArtifact(
            object_key=f"keyframes/{USER_ID}/{SCAN_ID}/keyframe_summary.json",
            sha256=_sha256(summary_payload),
            size_bytes=len(summary_payload),
        )
        self.archive = RefineSourceArtifact(
            object_key=f"bundle/{USER_ID}/{SCAN_ID}/keyframes.tar",
            sha256=_sha256(archive_payload),
            size_bytes=len(archive_payload),
        )
        manifest_document = {
            "schemaVersion": 3,
            "bundleSpecVersion": 1,
            "scanId": SCAN_ID,
            "checksumAlgorithm": "sha256",
            "artifacts": [
                {
                    "kind": "keyframeIndex",
                    "relativePath": "keyframes/keyframe_index.ndjson",
                    "sizeBytes": self.index.size_bytes,
                    "sha256": self.index.sha256,
                    "mimeType": "application/x-ndjson",
                },
                {
                    "kind": "keyframeSummary",
                    "relativePath": "keyframes/keyframe_summary.json",
                    "sizeBytes": self.summary.size_bytes,
                    "sha256": self.summary.sha256,
                    "mimeType": "application/json",
                },
                {
                    "kind": "keyframesArchive",
                    "relativePath": "keyframes.tar",
                    "sizeBytes": self.archive.size_bytes,
                    "sha256": self.archive.sha256,
                    "mimeType": "application/x-tar",
                },
            ],
        }
        manifest_payload = _canonical_json(manifest_document)
        self.manifest = RefineSourceArtifact(
            object_key=f"manifests/{USER_ID}/{SCAN_ID}/manifest.json",
            sha256=_sha256(manifest_payload),
            size_bytes=len(manifest_payload),
        )
        self.objects = {
            self.manifest.object_key: manifest_payload,
            self.index.object_key: index_payload,
            self.summary.object_key: summary_payload,
            self.archive.object_key: archive_payload,
        }
        self.request = RefineMaterializationRequest(
            user_id=USER_ID,
            scan_id=SCAN_ID,
            task_id=TASK_ID,
            lease_id=LEASE_ID,
            workspace_parent=workspace_parent,
            manifest=self.manifest,
            keyframe_index=self.index,
            keyframe_summary=self.summary,
            keyframes_archive=self.archive,
        )


def _materializer(
    fixture: _Fixture,
    *,
    raster: _PrematerializedRaster | None = None,
    limits: RefineMaterializationLimits | None = None,
) -> tuple[RefineMaterializer, _MemoryAcquirer, _PrematerializedRaster]:
    acquirer = _MemoryAcquirer(fixture.objects)
    raster = raster or _PrematerializedRaster()
    return (
        RefineMaterializer(
            acquirer=acquirer,
            raster_materializer=raster,
            limits=limits or RefineMaterializationLimits(),
        ),
        acquirer,
        raster,
    )


def test_materializes_private_deterministic_runner_seam(tmp_path):
    fixture = _Fixture(tmp_path)
    materializer, acquirer, raster = _materializer(fixture)
    deadline = _deadline()

    result = materializer.materialize(fixture.request, deadline=deadline)

    assert result.production_enablement == "disabled"
    assert result.task_id == TASK_ID
    assert result.lease_id == LEASE_ID
    assert result.workspace_root.parent == tmp_path
    assert stat.S_IMODE(result.workspace_root.stat().st_mode) == 0o700
    assert [row.kind for row in result.inputs] == [
        "bundleManifest",
        "keyframeIndex",
        "keyframeSummary",
        "keyframesArchive",
    ]
    assert [row.source_member for row in result.frames] == [
        "keyframes/keyframe_000000.heic",
        "keyframes/keyframe_000001.heic",
        "keyframes/keyframe_000002.heic",
    ]
    assert [row.engine_name for row in result.frames] == [
        "frame_000000.ppm",
        "frame_000001.ppm",
        "frame_000002.ppm",
    ]
    assert [row.engine_relative_path for row in result.frames] == [
        "images/frame_000000.ppm",
        "images/frame_000001.ppm",
        "images/frame_000002.ppm",
    ]
    assert all(row.engine_path.is_file() for row in result.frames)
    assert all(row.encoded_width == 2 and row.encoded_height == 3 for row in result.frames)
    assert all(row.source_sha256 == _sha256(row.source_path.read_bytes()) for row in result.frames)
    assert all(row.engine_sha256 == _sha256(row.engine_path.read_bytes()) for row in result.frames)
    assert all(call[2] is deadline for call in acquirer.calls)
    assert all(call[3] is deadline for call in raster.calls)
    assert [call[0] for call in acquirer.calls] == [
        fixture.manifest.object_key,
        fixture.index.object_key,
        fixture.summary.object_key,
        fixture.archive.object_key,
    ]
    assert not (result.workspace_root / "incoming").exists()
    assert not (result.workspace_root / "raster-incoming").exists()


def test_owner_prefix_is_rejected_before_workspace_or_acquirer_io(tmp_path):
    workspace_parent = tmp_path / "must-not-be-touched"
    fixture = _Fixture(workspace_parent)
    request = replace(
        fixture.request,
        keyframes_archive=replace(
            fixture.archive,
            object_key=f"bundle/other-user/{SCAN_ID}/keyframes.tar",
        ),
    )
    materializer, acquirer, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.OWNERSHIP
    assert caught.value.fatal is True
    assert acquirer.calls == []
    assert not workspace_parent.exists()


def test_expired_deadline_prevents_workspace_and_acquirer_io(tmp_path):
    fixture = _Fixture(tmp_path)
    materializer, acquirer, _ = _materializer(fixture)
    deadline = _deadline()
    object.__setattr__(deadline, "expired", True)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=deadline)

    assert caught.value.code is MaterializerFailureCode.DEADLINE
    assert caught.value.fatal is False
    assert acquirer.calls == []
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("source_kind", ("symlink", "fifo"))
def test_acquired_non_regular_source_is_rejected_without_blocking(tmp_path, source_kind):
    fixture = _Fixture(tmp_path)

    class _UnsafeAcquirer(_MemoryAcquirer):
        def acquire(self, *, object_key, destination, deadline):
            self.calls.append((object_key, destination, deadline))
            if not self.calls[:-1]:
                if source_kind == "symlink":
                    target = destination.parent / "outside"
                    target.write_bytes(self.objects[object_key])
                    destination.symlink_to(target)
                else:
                    os.mkfifo(destination)
                return
            destination.write_bytes(self.objects[object_key])

    acquirer = _UnsafeAcquirer(fixture.objects)
    materializer = RefineMaterializer(
        acquirer=acquirer,
        raster_materializer=_PrematerializedRaster(),
    )

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_acquired_checksum_mismatch_is_fail_closed(tmp_path):
    fixture = _Fixture(tmp_path)
    fixture.objects[fixture.index.object_key] += b"tampered"
    materializer, _, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_deadline_expiry_after_acquirer_is_fail_closed(tmp_path):
    fixture = _Fixture(tmp_path)
    deadline = _deadline()

    class _ExpiringAcquirer(_MemoryAcquirer):
        def acquire(self, *, object_key, destination, deadline):
            super().acquire(
                object_key=object_key,
                destination=destination,
                deadline=deadline,
            )
            object.__setattr__(deadline, "expired", True)

    acquirer = _ExpiringAcquirer(fixture.objects)
    materializer = RefineMaterializer(
        acquirer=acquirer,
        raster_materializer=_PrematerializedRaster(),
    )

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=deadline)

    assert caught.value.code is MaterializerFailureCode.DEADLINE
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "bad_entry",
    (
        "traversal",
        "symlink",
        "hardlink",
        "device",
        "duplicate",
        "extra",
    ),
)
def test_archive_preflight_rejects_unsafe_or_ambiguous_members_before_extraction(
    tmp_path, bad_entry
):
    rows = [_index_row(index) for index in range(3)]
    entries = [
        _regular(str(row["heicPath"]), b"heic") for row in rows
    ]
    entries.append(_regular(str(rows[1]["depthPath"]), b"depth"))
    if bad_entry == "traversal":
        entries.append(_regular("../escape.heic", b"x"))
    elif bad_entry in {"symlink", "hardlink", "device"}:
        member = tarfile.TarInfo("keyframes/bad.heic")
        if bad_entry == "symlink":
            member.type = tarfile.SYMTYPE
            member.linkname = "/etc/passwd"
        elif bad_entry == "hardlink":
            member.type = tarfile.LNKTYPE
            member.linkname = str(rows[0]["heicPath"])
        else:
            member.type = tarfile.CHRTYPE
            member.devmajor = 1
            member.devminor = 3
        entries.append((member, None))
    elif bad_entry == "duplicate":
        entries.append(_regular(str(rows[0]["heicPath"]), b"again"))
    else:
        entries.append(_regular("keyframes/unindexed.heic", b"x"))
    fixture = _Fixture(tmp_path, rows=rows, archive_entries=entries)
    materializer, _, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_archive_file_count_and_expanded_byte_limits_are_enforced(tmp_path):
    fixture = _Fixture(tmp_path)
    limits = RefineMaterializationLimits(
        max_archive_members=3,
        max_archive_expanded_bytes=8,
    )
    materializer, _, _ = _materializer(fixture, limits=limits)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_archive_payload_cannot_change_between_preflight_and_extraction(
    tmp_path, monkeypatch
):
    fixture = _Fixture(tmp_path)
    materializer, _, _ = _materializer(fixture)
    real_preflight = refine_materializer._preflight_archive

    def mutate_after_preflight(archive, **kwargs):
        result = real_preflight(archive, **kwargs)
        payload = bytearray(archive.path.read_bytes())
        offset = payload.find(b"heic:keyframes/")
        assert offset >= 0
        payload[offset] ^= 1
        archive.path.write_bytes(payload)
        return result

    monkeypatch.setattr(
        refine_materializer,
        "_preflight_archive",
        mutate_after_preflight,
    )

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_index_summary_and_archive_membership_must_agree(tmp_path):
    rows = [_index_row(index) for index in range(3)]
    entries = [
        _regular(str(row["heicPath"]), b"heic")
        for row in rows[:-1]
    ]
    entries.append(_regular(str(rows[1]["depthPath"]), b"depth"))
    fixture = _Fixture(
        tmp_path,
        rows=rows,
        summary={"fired": 4},
        archive_entries=entries,
    )
    materializer, _, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_index_encoded_dimensions_must_match_physical_right_rotation(tmp_path):
    rows = [_index_row(index) for index in range(3)]
    rows[1]["width"] = 3
    fixture = _Fixture(tmp_path, rows=rows)
    materializer, _, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_raster_evidence_and_ppm_dimensions_are_independently_verified(tmp_path):
    fixture = _Fixture(tmp_path)
    raster = _PrematerializedRaster(source_width_delta=1)
    materializer, _, _ = _materializer(fixture, raster=raster)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert caught.value.fatal is True
    assert list(tmp_path.iterdir()) == []


def test_manifest_inventory_must_bind_all_three_child_artifacts(tmp_path):
    fixture = _Fixture(tmp_path)
    manifest = json.loads(fixture.objects[fixture.manifest.object_key])
    manifest["artifacts"][0]["sha256"] = "0" * 64
    payload = _canonical_json(manifest)
    fixture.objects[fixture.manifest.object_key] = payload
    request = replace(
        fixture.request,
        manifest=replace(
            fixture.manifest,
            sha256=_sha256(payload),
            size_bytes=len(payload),
        ),
    )
    materializer, _, _ = _materializer(fixture)

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_INVALID
    assert list(tmp_path.iterdir()) == []


def test_same_task_and_lease_cannot_reuse_an_existing_workspace(tmp_path):
    fixture = _Fixture(tmp_path)
    materializer, _, _ = _materializer(fixture)
    first = materializer.materialize(fixture.request, deadline=_deadline())
    assert first.workspace_root.exists()

    with pytest.raises(RefineMaterializerError) as caught:
        materializer.materialize(fixture.request, deadline=_deadline())

    assert caught.value.code is MaterializerFailureCode.INPUT_IO
    assert first.workspace_root.exists()
