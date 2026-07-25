"""Adversarial tests for the disabled child-side Refine packet extractor."""

from __future__ import annotations

import ast
import hashlib
import inspect
import json
import os
import stat
import textwrap
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType, SimpleNamespace

import patina_scan_worker.refine_colmap_backend as backend_module
import patina_scan_worker.refine_native_process as native_process
import patina_scan_worker.refine_packet_extractor as extractor_module
import pytest
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_backend import (
    COLMAP_PACKET_MAX_ENGINE_IMAGES,
    COLMAP_PACKET_MIN_ENGINE_IMAGES,
    ENGINE_REQUEST_CONTRACT,
    ENGINE_REQUEST_SCHEMA_VERSION,
    PACKET_CONTRACT,
    PACKET_EXTRACTION_QUALIFIED,
    PACKET_SCHEMA_VERSION,
    PILOT_200_400_FRAME_RANGE_QUALIFIED,
    ColmapEngineRequest,
    ColmapPacketChunk,
    ColmapPacketManifest,
    ColmapPacketMember,
    load_colmap_packet_manifest,
    parse_engine_request_member,
)
from patina_scan_worker.refine_native_process import (
    NativeChildContext,
    NativePinnedFile,
    NativeWorkspaceLease,
    native_engine_entrypoint,
    provision_native_workspace_lease,
    run_native_engine_child,
)
from patina_scan_worker.refine_packet_extractor import (
    COLMAP_PACKET_MEMBER_MAX_BYTES,
    COLMAP_PACKET_TAR_BLOCK_BYTES,
    extract_colmap_packet,
)

_ZERO_BLOCK = b"\x00" * COLMAP_PACKET_TAR_BLOCK_BYTES


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


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _frame(index: int, payload: bytes) -> dict[str, object]:
    name = f"frame_{index:06d}.ppm"
    return {
        "ordinal": index,
        "sourceImageName": f"capture_{index:06d}.heic",
        "frameTimestampSeconds": float(index),
        "engineImageName": name,
        "engineRelativePath": f"images/{name}",
        "engineSha256": _sha256(payload),
        "engineSizeBytes": len(payload),
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


def _ustar_name_fields(name: str) -> tuple[bytes, bytes]:
    encoded = name.encode("ascii")
    if len(encoded) <= 100:
        return encoded, b""
    for separator in range(len(encoded) - 1, -1, -1):
        if encoded[separator : separator + 1] == b"/":
            prefix = encoded[:separator]
            leaf = encoded[separator + 1 :]
            if prefix and leaf and len(prefix) <= 155 and len(leaf) <= 100:
                return leaf, prefix
    raise AssertionError("test USTAR name is not representable")


def _ustar_header(
    name: str,
    payload_size: int,
    *,
    typeflag: bytes = b"0",
    linkname: bytes = b"",
) -> bytes:
    leaf, prefix = _ustar_name_fields(name)
    header = bytearray(COLMAP_PACKET_TAR_BLOCK_BYTES)
    header[0 : len(leaf)] = leaf
    header[100:108] = b"0000600\x00"
    header[108:116] = b"0000000\x00"
    header[116:124] = b"0000000\x00"
    header[124:136] = f"{payload_size:011o}\x00".encode()
    header[136:148] = b"00000000000\x00"
    header[148:156] = b"        "
    header[156:157] = typeflag
    header[157 : 157 + len(linkname)] = linkname
    header[257:263] = b"ustar\x00"
    header[263:265] = b"00"
    header[329:337] = b"0000000\x00"
    header[337:345] = b"0000000\x00"
    header[345 : 345 + len(prefix)] = prefix
    checksum = sum(header)
    header[148:156] = f"{checksum:06o}\x00 ".encode()
    return bytes(header)


def _ustar_archive(
    entries: Sequence[tuple[str, bytes, bytes]],
    *,
    terminator_blocks: int = 2,
    trailing: bytes = b"",
) -> bytes:
    output = bytearray()
    for name, payload, typeflag in entries:
        output.extend(_ustar_header(name, len(payload), typeflag=typeflag))
        output.extend(payload)
        output.extend(b"\x00" * ((-len(payload)) % COLMAP_PACKET_TAR_BLOCK_BYTES))
    output.extend(_ZERO_BLOCK * terminator_blocks)
    output.extend(trailing)
    output.extend(b"\x00" * ((-len(output)) % COLMAP_PACKET_TAR_BLOCK_BYTES))
    return bytes(output)


def _corrupt_first_member_padding(payload: bytes) -> bytes:
    changed = bytearray(payload)
    padding_offset = COLMAP_PACKET_TAR_BLOCK_BYTES + int(
        payload[124:135].decode("ascii"),
        8,
    )
    changed[padding_offset] = 1
    return bytes(changed)


def _replace_first_header_field(
    payload: bytes,
    start: int,
    replacement: bytes,
) -> bytes:
    changed = bytearray(payload)
    changed[start : start + len(replacement)] = replacement
    changed[148:156] = b"        "
    changed[148:156] = f"{sum(changed[:512]):06o}\x00 ".encode()
    return bytes(changed)


def _replace_header_name_split(
    header: bytes,
    *,
    name: str,
    prefix: str,
) -> bytes:
    changed = bytearray(header)
    changed[0:100] = b"\x00" * 100
    changed[345:500] = b"\x00" * 155
    encoded_name = name.encode("ascii")
    encoded_prefix = prefix.encode("ascii")
    assert len(encoded_name) <= 100
    assert len(encoded_prefix) <= 155
    changed[0 : len(encoded_name)] = encoded_name
    changed[345 : 345 + len(encoded_prefix)] = encoded_prefix
    changed[148:156] = b"        "
    changed[148:156] = f"{sum(changed):06o}\x00 ".encode()
    return bytes(changed)


def _fixture_images(count: int = 3) -> list[bytes]:
    return [f"P6\n1 1\n255\n{index:03d}".encode() for index in range(count)]


def _engine_request_payload(count: int = 3) -> bytes:
    return _canonical_json(
        {
            "schemaVersion": ENGINE_REQUEST_SCHEMA_VERSION,
            "contract": ENGINE_REQUEST_CONTRACT,
            "targetColmapVersion": "4.0.2",
            "gpuIndex": "0",
            "frames": [
                _frame(index, payload)
                for index, payload in enumerate(_fixture_images(count))
            ],
        }
    )


@dataclass
class _PacketFixture:
    request: dict[str, object]
    manifest_payload: bytes
    chunk_payload: bytes
    manifest_path: Path
    chunk_path: Path
    manifest_handle: object
    chunk_handle: object

    @property
    def pinned_files(self) -> dict[str, NativePinnedFile]:
        return {
            "packet.manifest": NativePinnedFile(
                self.manifest_handle.fileno(),
                _sha256(self.manifest_payload),
                len(self.manifest_payload),
            ),
            "packet.chunk.000": NativePinnedFile(
                self.chunk_handle.fileno(),
                _sha256(self.chunk_payload),
                len(self.chunk_payload),
            ),
        }

    def direct_context(
        self,
        workspace_descriptor: int | None = None,
    ) -> NativeChildContext:
        return NativeChildContext(
            time.monotonic() + 10.0,
            MappingProxyType(
                {
                    "packet.chunk.000": self.chunk_handle.fileno(),
                    "packet.manifest": self.manifest_handle.fileno(),
                }
            ),
            workspace_descriptor,
        )

    def close(self) -> None:
        self.manifest_handle.close()
        self.chunk_handle.close()


def _packet_fixture(
    tmp_path: Path,
    *,
    entry_transform: (
        Callable[[list[tuple[str, bytes, bytes]]], list[tuple[str, bytes, bytes]]]
        | None
    ) = None,
    archive_transform: Callable[[bytes], bytes] | None = None,
    member_transform: (
        Callable[[list[dict[str, object]]], list[dict[str, object]]] | None
    ) = None,
) -> _PacketFixture:
    images = _fixture_images()
    engine_payload = _engine_request_payload()
    entries = [
        ("engine-request-v1.json", engine_payload, b"0"),
        *[
            (f"images/frame_{index:06d}.ppm", payload, b"0")
            for index, payload in enumerate(images)
        ],
    ]
    if entry_transform is not None:
        entries = entry_transform(entries)
    chunk_payload = _ustar_archive(entries)
    if archive_transform is not None:
        chunk_payload = archive_transform(chunk_payload)
    members = [
        {
            "relativePath": "engine-request-v1.json",
            "chunkToken": "packet.chunk.000",
            "archiveMember": "engine-request-v1.json",
            "sha256": _sha256(engine_payload),
            "sizeBytes": len(engine_payload),
            "role": "engine-request",
        },
        *[
            {
                "relativePath": f"images/frame_{index:06d}.ppm",
                "chunkToken": "packet.chunk.000",
                "archiveMember": f"images/frame_{index:06d}.ppm",
                "sha256": _sha256(payload),
                "sizeBytes": len(payload),
                "role": "engine-image",
            }
            for index, payload in enumerate(images)
        ],
    ]
    if member_transform is not None:
        members = member_transform(members)
    manifest_payload = _canonical_json(
        {
            "schemaVersion": PACKET_SCHEMA_VERSION,
            "contract": PACKET_CONTRACT,
            "runId": "a" * 64,
            "requestMember": "engine-request-v1.json",
            "chunks": [
                {
                    "token": "packet.chunk.000",
                    "sha256": _sha256(chunk_payload),
                    "sizeBytes": len(chunk_payload),
                }
            ],
            "members": members,
        }
    )
    manifest_path = tmp_path / "packet-manifest-v1.json"
    chunk_path = tmp_path / "packet.chunk.000.tar"
    manifest_path.write_bytes(manifest_payload)
    chunk_path.write_bytes(chunk_payload)
    return _PacketFixture(
        {
            "schemaVersion": PACKET_SCHEMA_VERSION,
            "contract": PACKET_CONTRACT,
            "manifestToken": "packet.manifest",
            "manifestSha256": _sha256(manifest_payload),
            "runId": "a" * 64,
            "fallbackPolicy": "primary-only",
        },
        manifest_payload,
        chunk_payload,
        manifest_path,
        chunk_path,
        manifest_path.open("rb"),
        chunk_path.open("rb"),
    )


def _deadline(seconds: float = 5.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _entrypoint(name: str) -> str:
    return f"{__name__}:{name}"


def _lease(directory: Path) -> NativeWorkspaceLease:
    """Provision the parent-side workspace a direct-call test would receive."""

    directory.mkdir(mode=0o700, exist_ok=True)
    return provision_native_workspace_lease(str(directory), deadline=_deadline(30.0))


def _release(lease: NativeWorkspaceLease) -> tuple[str, ...]:
    return native_process._release_workspace_lease(lease, leader_quiescent=True)


def _lease_context(
    lease: NativeWorkspaceLease,
    seconds: float = 30.0,
) -> NativeChildContext:
    return NativeChildContext(
        time.monotonic() + seconds,
        MappingProxyType({}),
        lease.descriptor,
    )


def _packet_root(lease: NativeWorkspaceLease) -> Path:
    """Extraction lands in the lease's packet/ child, not in the lease root."""

    return Path(lease.path) / native_process.NATIVE_WORKSPACE_PACKET_SUBDIRECTORY


def _leased_ledger(lease: NativeWorkspaceLease):
    return extractor_module._lease_extraction_workspace(_lease_context(lease))


def _member_mode(workspace_descriptor: int, relative_path: str) -> int:
    parts = relative_path.split("/")
    directory = workspace_descriptor
    opened: list[int] = []
    try:
        for part in parts[:-1]:
            directory = os.open(
                part,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=directory,
            )
            opened.append(directory)
        return stat.S_IMODE(
            os.stat(parts[-1], dir_fd=directory, follow_symlinks=False).st_mode
        )
    finally:
        for descriptor in opened:
            os.close(descriptor)


@native_engine_entrypoint
def _extract_packet_probe(request, context: NativeChildContext):
    with extract_colmap_packet(request, context) as packet:
        workspace_metadata = os.fstat(packet.workspace_descriptor)
        leased_metadata = os.fstat(context.workspace_descriptor())
        packet_metadata = os.stat(
            native_process.NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
            dir_fd=context.workspace_descriptor(),
            follow_symlinks=False,
        )
        member_modes = {
            relative_path: _member_mode(packet.workspace_descriptor, relative_path)
            for relative_path in packet.extracted_relative_paths
        }
        result = {
            "workspaceMode": stat.S_IMODE(workspace_metadata.st_mode),
            "workspaceOwner": workspace_metadata.st_uid,
            "workspaceIsLeasedRoot": (
                workspace_metadata.st_dev,
                workspace_metadata.st_ino,
            )
            == (leased_metadata.st_dev, leased_metadata.st_ino),
            "workspaceIsPacketSubdirectory": (
                workspace_metadata.st_dev,
                workspace_metadata.st_ino,
            )
            == (packet_metadata.st_dev, packet_metadata.st_ino),
            "leaseEntries": sorted(os.listdir(context.workspace_descriptor())),
            "workspacePathMatchesLease": os.path.dirname(context.workspace_path())
            != "",
            "commandPath": os.path.basename(
                context.workspace_subdirectory_path(
                    native_process.NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY
                )
            ),
            "workspaceIsDistinctDescriptor": (
                packet.workspace_descriptor != context.workspace_descriptor()
            ),
            "memberModes": member_modes,
            "sourceLedger": (
                None
                if packet.source_ledger is None
                else {
                    "relativePath": packet.source_ledger.relative_path,
                    "sha256": packet.source_ledger.sha256,
                    "imageNames": [
                        row.source_image_name for row in packet.source_ledger.rows
                    ],
                    "members": [row.source_member for row in packet.source_ledger.rows],
                    "sizes": [
                        row.source_size_bytes for row in packet.source_ledger.rows
                    ],
                }
            ),
            "adapterLedger": (
                None
                if packet.adapter_ledger is None
                else {
                    "relativePath": packet.adapter_ledger.relative_path,
                    "sha256": packet.adapter_ledger.sha256,
                    "materializerId": packet.adapter_ledger.materializer_id,
                    # The trimmed ledger exposes no rows at all; asserting the
                    # attribute is absent keeps a future re-add from arriving
                    # silently.
                    "hasRows": hasattr(packet.adapter_ledger, "rows"),
                }
            ),
            "engineImageCount": packet.engine_image_count,
            "withinPilotFrameRange": packet.within_pilot_frame_range,
            "runId": packet.manifest.run_id,
            "frameNames": [
                frame.engine_image_name for frame in packet.engine_request.frames
            ],
            "paths": list(packet.extracted_relative_paths),
        }
    return result


def _run(fixture: _PacketFixture, workspace_parent: Path):
    workspace_parent.mkdir(mode=0o700, exist_ok=True)
    return run_native_engine_child(
        _entrypoint("_extract_packet_probe"),
        fixture.request,
        deadline=_deadline(),
        pinned_files=fixture.pinned_files,
        workspace_parent_directory=str(workspace_parent),
    )


def _load_manifest(fixture: _PacketFixture):
    return load_colmap_packet_manifest(fixture.request, fixture.direct_context())


def _extract_direct_chunk(fixture: _PacketFixture, lease: NativeWorkspaceLease):
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    extracted_paths: set[str] = set()
    payload = extractor_module._extract_archive_chunk(
        chunk=manifest.chunks[0],
        manifest=manifest,
        context=fixture.direct_context(),
        ledger=ledger,
        extracted_paths=extracted_paths,
    )
    return manifest, ledger, extracted_paths, payload


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_exact_ustar_packet_extracts_in_native_child_and_cleans_workspace(
    tmp_path,
    monkeypatch,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setenv("TMPDIR", str(scratch))
    fixture = _packet_fixture(tmp_path)
    try:
        fixture.manifest_handle.seek(3)
        fixture.chunk_handle.seek(17)
        result = _run(fixture, scratch)
        assert fixture.manifest_handle.tell() == 3
        assert fixture.chunk_handle.tell() == 17
    finally:
        fixture.close()

    assert result["workspaceMode"] == 0o700
    assert result["workspaceOwner"] == os.geteuid()
    # Extraction owns packet/, not the lease root: item 3's TMPDIR and cwd are
    # siblings inside the same one-purge tree.
    assert result["workspaceIsLeasedRoot"] is False
    assert result["workspaceIsPacketSubdirectory"] is True
    assert result["workspaceIsDistinctDescriptor"] is True
    assert result["leaseEntries"] == ["packet", "tmp", "work"]
    assert result["workspacePathMatchesLease"] is True
    assert result["commandPath"] == "work"
    assert result["runId"] == "a" * 64
    assert set(result["memberModes"].values()) == {0o600}
    assert result["frameNames"] == [
        "frame_000000.ppm",
        "frame_000001.ppm",
        "frame_000002.ppm",
    ]
    assert result["paths"] == [
        "engine-request-v1.json",
        "images/frame_000000.ppm",
        "images/frame_000001.ppm",
        "images/frame_000002.ppm",
    ]
    # The parent removes its own workspace after the child exits.
    assert list(scratch.iterdir()) == []
    assert PACKET_EXTRACTION_QUALIFIED is False


def test_extraction_rejects_unsealed_context_before_source_or_workspace_action(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    source_touched = False
    workspace_touched = False

    def reject_source(*_args, **_kwargs):
        nonlocal source_touched
        source_touched = True
        raise AssertionError("source must not be touched")

    def reject_workspace(*_args, **_kwargs):
        nonlocal workspace_touched
        workspace_touched = True
        raise AssertionError("workspace must not be touched")

    monkeypatch.setattr(backend_module, "load_colmap_packet_manifest", reject_source)
    monkeypatch.setattr(
        extractor_module,
        "_lease_extraction_workspace",
        reject_workspace,
    )
    try:
        with (
            pytest.raises(AdapterError, match="verified native child") as raised,
            extract_colmap_packet(fixture.request, fixture.direct_context()),
        ):
            pytest.fail("parent process entered the extraction context")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert raised.value.__cause__ is None
    assert source_touched is False
    assert workspace_touched is False


def test_context_lookalike_cannot_claim_verified_boundary_before_actions(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    source_touched = False
    workspace_touched = False

    class ForgedContext:
        is_verified_native_boundary = True

        def remaining_seconds(self):
            return 30.0

    def reject_source(*_args, **_kwargs):
        nonlocal source_touched
        source_touched = True
        raise AssertionError("source must not be touched")

    def reject_workspace(*_args, **_kwargs):
        nonlocal workspace_touched
        workspace_touched = True
        raise AssertionError("workspace must not be touched")

    monkeypatch.setattr(backend_module, "load_colmap_packet_manifest", reject_source)
    monkeypatch.setattr(
        extractor_module,
        "_lease_extraction_workspace",
        reject_workspace,
    )
    try:
        with (
            pytest.raises(AdapterError) as raised,
            extract_colmap_packet(fixture.request, ForgedContext()),
        ):
            pytest.fail("forged context entered the extraction context")
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert str(raised.value) == (
        "COLMAP packet extraction requires a verified native child boundary"
    )
    assert raised.value.__cause__ is None
    assert source_touched is False
    assert workspace_touched is False


def test_boundary_inspection_failure_is_fixed_before_actions(tmp_path, monkeypatch):
    fixture = _packet_fixture(tmp_path)
    context = fixture.direct_context()
    source_touched = False
    workspace_touched = False

    def inspect_boundary(_context):
        raise RuntimeError("DO_NOT_LEAK_BOUNDARY")

    def reject_source(*_args, **_kwargs):
        nonlocal source_touched
        source_touched = True
        raise AssertionError("source must not be touched")

    def reject_workspace(*_args, **_kwargs):
        nonlocal workspace_touched
        workspace_touched = True
        raise AssertionError("workspace must not be touched")

    monkeypatch.setattr(
        NativeChildContext,
        "is_verified_native_boundary",
        property(inspect_boundary),
    )
    monkeypatch.setattr(backend_module, "load_colmap_packet_manifest", reject_source)
    monkeypatch.setattr(
        extractor_module,
        "_lease_extraction_workspace",
        reject_workspace,
    )
    try:
        with (
            pytest.raises(AdapterError) as raised,
            extract_colmap_packet(fixture.request, context),
        ):
            pytest.fail("uninspectable context entered the extraction context")
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert str(raised.value) == (
        "cannot authenticate COLMAP packet native child boundary"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)
    assert source_touched is False
    assert workspace_touched is False


def test_truthy_non_boolean_boundary_is_rejected(tmp_path, monkeypatch):
    fixture = _packet_fixture(tmp_path)
    context = fixture.direct_context()
    source_touched = False
    workspace_touched = False

    def reject_source(*_args, **_kwargs):
        nonlocal source_touched
        source_touched = True
        raise AssertionError("source must not be touched")

    def reject_workspace(*_args, **_kwargs):
        nonlocal workspace_touched
        workspace_touched = True
        raise AssertionError("workspace must not be touched")

    monkeypatch.setattr(
        NativeChildContext,
        "is_verified_native_boundary",
        property(lambda _context: 1),
    )
    monkeypatch.setattr(backend_module, "load_colmap_packet_manifest", reject_source)
    monkeypatch.setattr(
        extractor_module,
        "_lease_extraction_workspace",
        reject_workspace,
    )
    try:
        with (
            pytest.raises(AdapterError) as raised,
            extract_colmap_packet(fixture.request, context),
        ):
            pytest.fail("truthy non-boolean context entered the extraction context")
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert str(raised.value) == (
        "COLMAP packet extraction requires a verified native child boundary"
    )
    assert source_touched is False
    assert workspace_touched is False


def test_missing_descriptor_capability_fails_before_source_or_workspace_action(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    source_touched = False
    workspace_touched = False

    def reject_source(*_args, **_kwargs):
        nonlocal source_touched
        source_touched = True
        raise AssertionError("source must not be touched")

    def reject_workspace(*_args, **_kwargs):
        nonlocal workspace_touched
        workspace_touched = True
        raise AssertionError("workspace must not be touched")

    monkeypatch.setattr(extractor_module.os, "supports_dir_fd", frozenset())
    monkeypatch.setattr(extractor_module.os, "pread", reject_source)
    monkeypatch.setattr(
        extractor_module,
        "_lease_extraction_workspace",
        reject_workspace,
    )
    try:
        with (
            pytest.raises(AdapterError, match="descriptor safety") as raised,
            extract_colmap_packet(fixture.request, fixture.direct_context()),
        ):
            pytest.fail("unsupported platform entered extraction")
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert source_touched is False
    assert workspace_touched is False


@pytest.mark.parametrize("helper", ("existing", "creating"))
def test_directory_chain_closes_duplicate_when_noninheritable_setup_fails(
    tmp_path,
    monkeypatch,
    helper,
):
    root_descriptor = os.open(tmp_path, os.O_RDONLY)
    root_metadata = os.fstat(root_descriptor)
    real_dup = os.dup
    real_close = os.close
    duplicates: list[int] = []
    closed: list[int] = []

    def record_dup(descriptor):
        duplicate = real_dup(descriptor)
        duplicates.append(duplicate)
        return duplicate

    def fail_noninheritable(descriptor, _value):
        if descriptor in duplicates:
            raise OSError("synthetic non-inheritable failure")

    def record_close(descriptor):
        if descriptor in duplicates:
            closed.append(descriptor)
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "dup", record_dup)
    monkeypatch.setattr(
        extractor_module.os,
        "set_inheritable",
        fail_noninheritable,
    )
    monkeypatch.setattr(extractor_module.os, "close", record_close)
    try:
        with pytest.raises((AdapterError, OSError)):
            if helper == "existing":
                extractor_module._open_existing_directory_chain(
                    root_descriptor,
                    (),
                )
            else:
                extractor_module._open_directory_chain(
                    extractor_module._ExtractionLedger(
                        root_descriptor,
                        (root_metadata.st_dev, root_metadata.st_ino),
                        [],
                        [],
                    ),
                    (),
                )
    finally:
        real_close(root_descriptor)

    assert len(duplicates) == 1
    assert closed == duplicates


@pytest.mark.parametrize("helper", ("existing", "creating"))
def test_directory_chain_closes_new_child_when_old_descriptor_close_fails(
    tmp_path,
    monkeypatch,
    helper,
):
    if helper == "existing":
        (tmp_path / "child").mkdir(mode=0o700)
    root_descriptor = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    root_metadata = os.fstat(root_descriptor)
    real_dup = os.dup
    real_open = os.open
    real_close = os.close
    old_descriptors: set[int] = set()
    child_descriptors: set[int] = set()
    failed = False

    def record_dup(descriptor):
        duplicate = real_dup(descriptor)
        old_descriptors.add(duplicate)
        return duplicate

    def record_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if path == "child":
            child_descriptors.add(descriptor)
        return descriptor

    def fail_old_close(descriptor):
        nonlocal failed
        if not failed and descriptor in old_descriptors:
            failed = True
            old_descriptors.remove(descriptor)
            real_close(descriptor)
            raise OSError("synthetic old-directory close failure")
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "dup", record_dup)
    monkeypatch.setattr(extractor_module.os, "open", record_open)
    monkeypatch.setattr(extractor_module.os, "close", fail_old_close)
    ledger = extractor_module._ExtractionLedger(
        root_descriptor,
        (root_metadata.st_dev, root_metadata.st_ino),
        [],
        [],
    )
    try:
        with pytest.raises(AdapterError, match="directory-chain") as raised:
            if helper == "existing":
                extractor_module._open_existing_directory_chain(
                    root_descriptor,
                    ("child",),
                )
            else:
                extractor_module._open_directory_chain(
                    ledger,
                    ("child",),
                )
    finally:
        real_close(root_descriptor)

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert failed is True
    assert child_descriptors
    for descriptor in child_descriptors:
        with pytest.raises(OSError):
            os.fstat(descriptor)


def test_workspace_lease_is_required_before_any_extraction_scratch(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        with pytest.raises(AdapterError, match="workspace lease is unavailable"):
            extractor_module._lease_extraction_workspace(fixture.direct_context())
    finally:
        fixture.close()


@pytest.mark.parametrize(
    "poison",
    ("mode", "occupied"),
)
def test_workspace_lease_borrow_rejects_an_unclean_or_public_lease(tmp_path, poison):
    lease = _lease(tmp_path / "lease")
    try:
        if poison == "mode":
            os.chmod(lease.path, 0o755)
            expected = "not a private owned directory"
        else:
            (
                Path(lease.path)
                / native_process.NATIVE_WORKSPACE_PACKET_SUBDIRECTORY
                / "squatter.bin"
            ).write_bytes(b"x")
            expected = "not empty"
        with pytest.raises(AdapterError, match=expected) as raised:
            _leased_ledger(lease)
        assert raised.value.code == "REFINE_ENGINE_FAILED"
    finally:
        os.chmod(lease.path, 0o700)
        assert _release(lease) == ()
    assert list((tmp_path / "lease").iterdir()) == []


def test_failed_workspace_lease_borrow_surfaces_cleanup_uncertainty(
    tmp_path,
    monkeypatch,
):
    lease = _lease(tmp_path / "lease")
    real_fstat = os.fstat
    real_close = os.close
    real_open = os.open
    borrowed: list[int] = []
    failed = False

    def public_borrow(descriptor):
        metadata = real_fstat(descriptor)
        if descriptor in borrowed:
            return SimpleNamespace(
                st_dev=metadata.st_dev,
                st_ino=metadata.st_ino,
                st_uid=metadata.st_uid,
                st_mode=stat.S_IFDIR | 0o755,
            )
        return metadata

    def record_open(path, *args, **kwargs):
        descriptor = real_open(path, *args, **kwargs)
        if path == native_process.NATIVE_WORKSPACE_PACKET_SUBDIRECTORY:
            borrowed.append(descriptor)
        return descriptor

    def inject_close_failure(descriptor):
        nonlocal failed
        if not failed and descriptor in borrowed:
            failed = True
            real_close(descriptor)
            raise OSError("synthetic workspace lease borrow close failure")
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "open", record_open)
    monkeypatch.setattr(extractor_module.os, "fstat", public_borrow)
    monkeypatch.setattr(extractor_module.os, "close", inject_close_failure)
    try:
        with pytest.raises(AdapterError, match="cannot close") as raised:
            _leased_ledger(lease)
    finally:
        monkeypatch.undo()
        assert _release(lease) == ()

    assert failed is True
    assert borrowed
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert list((tmp_path / "lease").iterdir()) == []


def test_parent_lease_provisioning_failure_removes_its_own_directory(
    tmp_path,
    monkeypatch,
):
    container = tmp_path / "lease"
    container.mkdir(mode=0o700)
    real_fstat = os.fstat
    inspections = 0

    def fail_workspace_inspection(descriptor):
        nonlocal inspections
        inspections += 1
        if inspections == 2:
            raise OSError("synthetic workspace lease inspection failure")
        return real_fstat(descriptor)

    monkeypatch.setattr(native_process.os, "fstat", fail_workspace_inspection)
    with pytest.raises(AdapterError, match="cannot provision a private") as raised:
        provision_native_workspace_lease(str(container), deadline=_deadline(30.0))
    monkeypatch.undo()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    # The parent removes the half-provisioned workspace it created itself.
    assert list(container.iterdir()) == []


@pytest.mark.parametrize("failure_phase", ("stat", "open"))
def test_new_directory_identity_failure_does_not_strand_workspace(
    tmp_path,
    monkeypatch,
    failure_phase,
):
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    real_stat = os.stat
    real_open = os.open
    failed = False

    def fail_created_stat(path, *args, **kwargs):
        nonlocal failed
        if failure_phase == "stat" and not failed and path == "child":
            failed = True
            raise OSError("DO_NOT_LEAK_CREATED_STAT")
        return real_stat(path, *args, **kwargs)

    def fail_created_open(path, flags, *args, **kwargs):
        nonlocal failed
        if (
            failure_phase == "open"
            and not failed
            and path == "child"
            and flags & os.O_DIRECTORY
        ):
            failed = True
            raise OSError("DO_NOT_LEAK_CREATED_OPEN")
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(extractor_module.os, "stat", fail_created_stat)
    monkeypatch.setattr(extractor_module.os, "open", fail_created_open)
    try:
        with pytest.raises(
            AdapterError,
            match="cannot create or open a private",
        ) as raised:
            extractor_module._open_directory_chain(ledger, ("child",))
        assert "DO_NOT_LEAK" not in str(raised.value)
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()

    assert failed is True
    assert _release(lease) == ()
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.parametrize("failure_phase", ("fstat", "set-inheritable"))
def test_new_member_identity_failure_does_not_strand_workspace(
    tmp_path,
    monkeypatch,
    failure_phase,
):
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    real_open = os.open
    real_fstat = os.fstat
    real_set_inheritable = os.set_inheritable
    member_descriptors: set[int] = set()
    failed = False

    def record_member_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if path == "member.bin" and flags & os.O_CREAT:
            member_descriptors.add(descriptor)
        return descriptor

    def fail_member_fstat(descriptor):
        nonlocal failed
        if failure_phase == "fstat" and not failed and descriptor in member_descriptors:
            failed = True
            raise OSError("DO_NOT_LEAK_MEMBER_FSTAT")
        return real_fstat(descriptor)

    def fail_member_set_inheritable(descriptor, inheritable):
        nonlocal failed
        if (
            failure_phase == "set-inheritable"
            and not failed
            and descriptor in member_descriptors
        ):
            failed = True
            raise OSError("DO_NOT_LEAK_MEMBER_INHERITABLE")
        return real_set_inheritable(descriptor, inheritable)

    monkeypatch.setattr(extractor_module.os, "open", record_member_open)
    monkeypatch.setattr(extractor_module.os, "fstat", fail_member_fstat)
    monkeypatch.setattr(
        extractor_module.os,
        "set_inheritable",
        fail_member_set_inheritable,
    )
    try:
        with pytest.raises(AdapterError, match="cannot create") as raised:
            extractor_module._create_extracted_member(
                ledger,
                SimpleNamespace(relative_path="member.bin"),
            )
        assert "DO_NOT_LEAK" not in str(raised.value)
        if failure_phase == "fstat":
            assert ledger.files == []
            assert ledger.file_identities == {}
            assert not (_packet_root(lease) / "member.bin").exists()
        else:
            assert ledger.files == ["member.bin"]
            assert set(ledger.file_identities) == {"member.bin"}
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()

    assert failed is True
    assert member_descriptors
    assert _release(lease) == ()
    assert list((tmp_path / "lease").iterdir()) == []


def test_member_parent_close_failure_closes_new_member_descriptor(
    tmp_path,
    monkeypatch,
):
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    real_dup = os.dup
    real_open = os.open
    real_close = os.close
    parent_descriptors: set[int] = set()
    member_descriptors: set[int] = set()
    failed = False

    def record_dup(descriptor):
        duplicate = real_dup(descriptor)
        parent_descriptors.add(duplicate)
        return duplicate

    def record_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if path == "member.bin" and flags & os.O_CREAT:
            member_descriptors.add(descriptor)
        return descriptor

    def fail_parent_close(descriptor):
        nonlocal failed
        if not failed and descriptor in parent_descriptors:
            failed = True
            parent_descriptors.remove(descriptor)
            real_close(descriptor)
            raise OSError("synthetic parent close failure")
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "dup", record_dup)
    monkeypatch.setattr(extractor_module.os, "open", record_open)
    monkeypatch.setattr(extractor_module.os, "close", fail_parent_close)
    try:
        with pytest.raises(AdapterError, match="member parent") as raised:
            extractor_module._create_extracted_member(
                ledger,
                SimpleNamespace(relative_path="member.bin"),
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert failed is True
    assert member_descriptors
    for descriptor in member_descriptors:
        with pytest.raises(OSError):
            os.fstat(descriptor)
    assert _release(lease) == ()
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.parametrize(
    ("total_length", "accepted"),
    ((255, True), (256, True), (257, False)),
)
def test_exact_ustar_path_capacity_is_shared(total_length, accepted):
    prefix_length = total_length - 101
    value = ("p" * prefix_length) + "/" + ("n" * 100)
    assert len(value.encode("ascii")) == total_length
    helpers = (
        backend_module._canonical_ustar_member_name,
        extractor_module._canonical_ustar_member_name,
    )
    for helper in helpers:
        if accepted:
            assert helper(value, "fixture") == value
        else:
            with pytest.raises(AdapterError, match="not representable"):
                helper(value, "fixture")


@pytest.mark.parametrize("short_form", (True, False))
def test_ustar_header_requires_unique_canonical_name_prefix_split(short_form):
    if short_form:
        full_name = "prefix/member.bin"
        noncanonical_name = "member.bin"
        noncanonical_prefix = "prefix"
    else:
        full_name = ("a" * 10) + "/" + ("b" * 40) + "/" + ("c" * 50)
        noncanonical_prefix, noncanonical_name = full_name.split("/", 1)
        assert len(noncanonical_name.encode("ascii")) <= 100
    canonical = _ustar_header(full_name, 1)
    changed = _replace_header_name_split(
        canonical,
        name=noncanonical_name,
        prefix=noncanonical_prefix,
    )

    with pytest.raises(AdapterError, match="split is not canonical") as raised:
        extractor_module._parse_ustar_header(changed)

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize(
    "typeflag",
    (b"1", b"2", b"3", b"4", b"5", b"6", b"x", b"g", b"L", b"K", b"S"),
)
def test_archive_rejects_every_nonregular_and_extension_type(tmp_path, typeflag):
    def transform(entries):
        changed = list(entries)
        name, payload, _regular = changed[1]
        changed[1] = (name, payload, typeflag)
        return changed

    fixture = _packet_fixture(tmp_path, entry_transform=transform)
    try:
        with pytest.raises(AdapterError, match="rejects links") as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize(
    ("entry_transform", "archive_transform", "detail"),
    (
        (
            lambda entries: [*entries, entries[0]],
            None,
            "repeats a member",
        ),
        (
            lambda entries: [*entries, ("undeclared.bin", b"x", b"0")],
            None,
            "undeclared member",
        ),
        (
            lambda entries: entries[:-1],
            None,
            "omits a declared member",
        ),
        (
            lambda entries: [entries[1], entries[0], *entries[2:]],
            None,
            "order is not canonical",
        ),
        (
            None,
            lambda payload: payload + _ustar_archive([("second.bin", b"x", b"0")]),
            "exact terminator",
        ),
        (
            None,
            lambda payload: payload + _ZERO_BLOCK,
            "exact terminator",
        ),
        (
            None,
            lambda payload: payload[:-COLMAP_PACKET_TAR_BLOCK_BYTES],
            "terminator",
        ),
    ),
)
def test_archive_universe_and_terminator_are_exact(
    tmp_path,
    entry_transform,
    archive_transform,
    detail,
):
    fixture = _packet_fixture(
        tmp_path,
        entry_transform=entry_transform,
        archive_transform=archive_transform,
    )
    try:
        with pytest.raises(AdapterError, match=detail) as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize(
    ("archive_transform", "detail"),
    (
        (
            lambda payload: bytes([payload[0] ^ 1]) + payload[1:],
            "checksum",
        ),
        (
            _corrupt_first_member_padding,
            "padding is not zero",
        ),
    ),
)
def test_archive_rejects_corrupt_checksum_or_member_padding(
    tmp_path,
    archive_transform,
    detail,
):
    fixture = _packet_fixture(tmp_path, archive_transform=archive_transform)
    try:
        with pytest.raises(AdapterError, match=detail) as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize(
    ("start", "replacement"),
    (
        (100, b"0000644\x00"),
        (108, b"0000001\x00"),
        (116, b"0000001\x00"),
        (136, b"00000000001\x00"),
        (265, b"owner"),
        (297, b"group"),
        (329, b"0000001\x00"),
        (337, b"0000001\x00"),
    ),
)
def test_archive_rejects_noncanonical_ustar_metadata(
    tmp_path,
    start,
    replacement,
):
    fixture = _packet_fixture(
        tmp_path,
        archive_transform=lambda payload: _replace_first_header_field(
            payload,
            start,
            replacement,
        ),
    )
    try:
        with pytest.raises(AdapterError, match="metadata is not canonical") as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_archive_rejects_member_hash_mismatch_and_cleans_partial_workspace(
    tmp_path,
    monkeypatch,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setenv("TMPDIR", str(scratch))

    def transform(members):
        changed = [dict(member) for member in members]
        changed[-1]["sha256"] = "0" * 64
        return changed

    fixture = _packet_fixture(tmp_path, member_transform=transform)
    try:
        with pytest.raises(AdapterError, match="SHA-256") as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    # A failed extraction still leaves the parent-owned workspace removed.
    assert list((tmp_path / "lease").iterdir()) == []


def test_chunk_is_revalidated_after_copy_before_request_parse(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    manifest = _load_manifest(fixture)
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    extracted_paths: set[str] = set()
    real_revalidate = extractor_module._revalidate_chunk_after_extraction
    mutation_count = 0

    def mutate_then_revalidate(chunk, context):
        nonlocal mutation_count
        mutation_count += 1
        with fixture.chunk_path.open("r+b") as changed:
            changed.seek(COLMAP_PACKET_TAR_BLOCK_BYTES)
            original = changed.read(1)
            changed.seek(COLMAP_PACKET_TAR_BLOCK_BYTES)
            changed.write(bytes([original[0] ^ 1]))
            changed.flush()
            os.fsync(changed.fileno())
        return real_revalidate(chunk, context)

    monkeypatch.setattr(
        extractor_module,
        "_revalidate_chunk_after_extraction",
        mutate_then_revalidate,
    )
    try:
        original_offset = fixture.chunk_handle.tell()
        with pytest.raises(
            AdapterError,
            match="changed during extraction",
        ) as raised:
            extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=extracted_paths,
            )
        assert fixture.chunk_handle.tell() == original_offset
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()
        assert _release(lease) == ()
        fixture.close()

    assert mutation_count == 1
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_deadline_is_checked_before_each_positional_archive_read(tmp_path):
    fixture = _packet_fixture(tmp_path)
    context = NativeChildContext(
        time.monotonic() - 1.0,
        MappingProxyType({"packet.chunk.000": fixture.chunk_handle.fileno()}),
    )
    try:
        original_offset = fixture.chunk_handle.tell()
        with pytest.raises(AdapterError) as raised:
            extractor_module._pread_exact(
                fixture.chunk_handle.fileno(),
                offset=0,
                size_bytes=COLMAP_PACKET_TAR_BLOCK_BYTES,
                context=context,
                label="deadline fixture",
            )
        assert fixture.chunk_handle.tell() == original_offset
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"


def test_member_cap_is_rejected_from_manifest_without_large_allocation(
    tmp_path,
):
    fixture = _packet_fixture(
        tmp_path,
        member_transform=lambda members: [
            *members[:-1],
            {
                **members[-1],
                "sizeBytes": COLMAP_PACKET_MEMBER_MAX_BYTES + 1,
            },
        ],
    )
    try:
        with pytest.raises(
            AdapterError,
            match="per-member byte ceiling",
        ) as raised:
            _load_manifest(fixture)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("member_transform", "detail"),
    (
        (
            lambda members: [
                *members[:-1],
                {
                    **members[-1],
                    "relativePath": "images/frame_\x7f000002.ppm",
                },
            ],
            "canonical safe relative path",
        ),
        (
            lambda members: [members[1], members[0], *members[2:]],
            "canonical chunk/member order",
        ),
    ),
)
def test_manifest_rejects_control_bytes_and_relabelable_member_order(
    tmp_path,
    member_transform,
    detail,
):
    fixture = _packet_fixture(tmp_path, member_transform=member_transform)
    try:
        with pytest.raises(AdapterError, match=detail) as raised:
            _load_manifest(fixture)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_partial_write_failure_cleans_only_created_workspace_ledger(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    extracted_paths: set[str] = set()
    real_pwrite = extractor_module.os.pwrite
    write_count = 0

    def fail_second_member(descriptor, payload, offset):
        nonlocal write_count
        write_count += 1
        if write_count == 2:
            raise OSError("synthetic extraction write fault")
        return real_pwrite(descriptor, payload, offset)

    monkeypatch.setattr(extractor_module.os, "pwrite", fail_second_member)
    try:
        with pytest.raises(AdapterError, match="cannot write") as raised:
            extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=extracted_paths,
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert write_count == 2
    assert list((tmp_path / "lease").iterdir()) == []


def test_reopened_request_descriptor_identity_is_revalidated(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest, ledger, _paths, request_payload = _extract_direct_chunk(fixture, lease)
    assert request_payload is not None
    real_open = extractor_module.os.open
    real_fstat = extractor_module.os.fstat
    request_descriptors: set[int] = set()

    def record_request_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if path == "engine-request-v1.json" and not flags & os.O_CREAT:
            request_descriptors.add(descriptor)
        return descriptor

    def change_request_identity(descriptor):
        metadata = real_fstat(descriptor)
        if descriptor in request_descriptors:
            return SimpleNamespace(
                st_mode=metadata.st_mode,
                st_uid=metadata.st_uid,
                st_dev=metadata.st_dev,
                st_ino=metadata.st_ino,
                st_size=metadata.st_size,
                st_nlink=2,
            )
        return metadata

    monkeypatch.setattr(extractor_module.os, "open", record_request_open)
    monkeypatch.setattr(extractor_module.os, "fstat", change_request_identity)
    try:
        with pytest.raises(
            AdapterError,
            match="request identity is not exact",
        ) as raised:
            extractor_module._read_and_parse_extracted_request(
                ledger=ledger,
                manifest=manifest,
                context=fixture.direct_context(),
                expected_request_payload=request_payload,
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        fixture.close()
    assert request_descriptors
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_cleanup_refuses_same_uid_extracted_member_replacement(tmp_path):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest, ledger, _paths, request_payload = _extract_direct_chunk(fixture, lease)
    assert request_payload is not None
    request_member = manifest.member_by_path[manifest.request_member]
    request_path = _packet_root(lease) / request_member.relative_path
    original_descriptor = os.open(request_path, os.O_RDONLY | os.O_CLOEXEC)
    replacement_payload = b"same-uid replacement must survive refused cleanup"
    cleanup_errors: tuple[str, ...] = ()
    try:
        request_path.unlink()
        request_path.write_bytes(replacement_payload)
        request_path.chmod(0o600)
        replacement_metadata = os.lstat(request_path)
        assert (
            replacement_metadata.st_dev,
            replacement_metadata.st_ino,
        ) != ledger.file_identities[request_member.relative_path]

        cleanup_errors = extractor_module._cleanup_extraction_workspace(ledger)

        assert any(
            "extracted member identity changed before cleanup" in error
            for error in cleanup_errors
        )
        assert request_path.read_bytes() == replacement_payload
    finally:
        os.close(original_descriptor)
        fixture.close()
        # The parent owns the workspace, so its bounded cleanup still succeeds
        # even after the child ledger refused the swapped identity.
        assert _release(lease) == ()

    assert cleanup_errors
    assert not request_path.exists()
    assert list((tmp_path / "lease").iterdir()) == []


def test_cleanup_refuses_same_uid_extracted_directory_replacement(tmp_path):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    _manifest, ledger, _paths, request_payload = _extract_direct_chunk(fixture, lease)
    assert request_payload is not None
    directory_path = _packet_root(lease) / "images"
    original_descriptor = os.open(
        directory_path,
        os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC,
    )
    replacement_payload = b"same-uid directory replacement must survive cleanup"
    replacement_path = directory_path / "replacement.bin"
    cleanup_errors: tuple[str, ...] = ()
    try:
        for child in directory_path.iterdir():
            child.unlink()
        directory_path.rmdir()
        directory_path.mkdir(mode=0o700)
        replacement_path.write_bytes(replacement_payload)
        replacement_path.chmod(0o600)
        replacement_metadata = os.lstat(directory_path)
        assert (
            replacement_metadata.st_dev,
            replacement_metadata.st_ino,
        ) != ledger.directory_identities["images"]

        cleanup_errors = extractor_module._cleanup_extraction_workspace(ledger)

        assert any("directory identity changed" in error for error in cleanup_errors)
        assert replacement_path.read_bytes() == replacement_payload
    finally:
        os.close(original_descriptor)
        fixture.close()
        assert _release(lease) == ()

    assert cleanup_errors
    assert not directory_path.exists()
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.parametrize(
    ("target", "expected_error"),
    (
        ("file", "cannot remove extracted member member.bin"),
        ("directory", "cannot remove extracted directory child"),
    ),
)
def test_cleanup_os_errors_are_fixed_and_do_not_leak(
    tmp_path,
    monkeypatch,
    target,
    expected_error,
):
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    real_rmdir = os.rmdir
    if target == "file":
        descriptor = extractor_module._create_extracted_member(
            ledger,
            SimpleNamespace(relative_path="member.bin"),
        )
    else:
        descriptor = extractor_module._open_directory_chain(ledger, ("child",))
    os.close(descriptor)

    def fail_unlink(*_args, **_kwargs):
        raise OSError("DO_NOT_LEAK_UNLINK")

    def fail_rmdir(path, *args, **kwargs):
        if path == "child":
            raise OSError("DO_NOT_LEAK_RMDIR")
        return real_rmdir(path, *args, **kwargs)

    monkeypatch.setattr(extractor_module.os, "unlink", fail_unlink)
    monkeypatch.setattr(extractor_module.os, "rmdir", fail_rmdir)
    errors = extractor_module._cleanup_extraction_workspace(ledger)

    assert errors == (expected_error,)
    assert "DO_NOT_LEAK" not in " ".join(errors)

    monkeypatch.undo()
    # The parent-owned lease still removes what the child ledger could not.
    assert _release(lease) == ()
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.skipif(
    not hasattr(os, "mkfifo"),
    reason="FIFO replacement requires POSIX mkfifo",
)
def test_reopened_request_uses_nonblocking_open_before_fifo_type_check(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest, ledger, _paths, request_payload = _extract_direct_chunk(fixture, lease)
    assert request_payload is not None
    request_member = manifest.member_by_path[manifest.request_member]
    request_path = _packet_root(lease) / request_member.relative_path
    original_descriptor = os.open(request_path, os.O_RDONLY | os.O_CLOEXEC)
    real_open = extractor_module.os.open
    saw_nonblocking_request_open = False
    cleanup_errors: tuple[str, ...] = ()

    def require_nonblocking_request_open(path, flags, *args, **kwargs):
        nonlocal saw_nonblocking_request_open
        if path == Path(request_member.relative_path).name and not (flags & os.O_CREAT):
            if not flags & os.O_NONBLOCK:
                raise AssertionError("request FIFO reopen omitted O_NONBLOCK")
            saw_nonblocking_request_open = True
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(extractor_module.os, "open", require_nonblocking_request_open)
    try:
        request_path.unlink()
        os.mkfifo(request_path, mode=0o600)
        with pytest.raises(
            AdapterError,
            match="request identity is not exact",
        ) as raised:
            extractor_module._read_and_parse_extracted_request(
                ledger=ledger,
                manifest=manifest,
                context=fixture.direct_context(),
                expected_request_payload=request_payload,
            )
        cleanup_errors = extractor_module._cleanup_extraction_workspace(ledger)

        assert saw_nonblocking_request_open is True
        assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
        assert stat.S_ISFIFO(os.lstat(request_path).st_mode)
        assert any(
            "extracted member identity changed before cleanup" in error
            for error in cleanup_errors
        )
    finally:
        os.close(original_descriptor)
        fixture.close()
        monkeypatch.undo()
        # A FIFO the parent never created is still removed by parent cleanup.
        assert _release(lease) == ()

    assert not request_path.exists()
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.parametrize(
    "failure_target",
    ("destination", "request-directory", "request"),
)
def test_destination_and_request_close_failures_are_normalized_and_cleaned(
    tmp_path,
    monkeypatch,
    failure_target,
):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    real_open = extractor_module.os.open
    real_dup = extractor_module.os.dup
    real_close = extractor_module.os.close
    target_descriptors: set[int] = set()
    failed = False
    phase = "extraction"

    def record_target_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if (failure_target == "destination" and flags & os.O_CREAT) or (
            failure_target == "request"
            and path == "engine-request-v1.json"
            and not flags & os.O_CREAT
        ):
            target_descriptors.add(descriptor)
        return descriptor

    def record_target_dup(descriptor):
        duplicate = real_dup(descriptor)
        if failure_target == "request-directory" and phase == "request":
            target_descriptors.add(duplicate)
        return duplicate

    def fail_target_close(descriptor):
        nonlocal failed
        if not failed and descriptor in target_descriptors:
            failed = True
            target_descriptors.remove(descriptor)
            real_close(descriptor)
            raise OSError("synthetic descriptor close failure")
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "open", record_target_open)
    monkeypatch.setattr(extractor_module.os, "dup", record_target_dup)
    monkeypatch.setattr(extractor_module.os, "close", fail_target_close)
    extracted_paths: set[str] = set()
    try:
        if failure_target == "destination":
            with pytest.raises(AdapterError, match="cannot close") as raised:
                extractor_module._extract_archive_chunk(
                    chunk=manifest.chunks[0],
                    manifest=manifest,
                    context=fixture.direct_context(),
                    ledger=ledger,
                    extracted_paths=extracted_paths,
                )
        else:
            request_payload = extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=extracted_paths,
            )
            assert request_payload is not None
            phase = "request"
            with pytest.raises(AdapterError, match="cannot close") as raised:
                extractor_module._read_and_parse_extracted_request(
                    ledger=ledger,
                    manifest=manifest,
                    context=fixture.direct_context(),
                    expected_request_payload=request_payload,
                )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        monkeypatch.undo()
        assert _release(lease) == ()
        fixture.close()
    assert failed
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert list((tmp_path / "lease").iterdir()) == []


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_archive_rejects_manifest_file_directory_collision_before_extraction(tmp_path):
    def entries_transform(entries):
        return [*entries, ("source-ledger.json", b"{}", b"0")]

    def members_transform(members):
        return [
            *members,
            {
                "relativePath": "images",
                "chunkToken": "packet.chunk.000",
                "archiveMember": "source-ledger.json",
                "sha256": _sha256(b"{}"),
                "sizeBytes": 2,
                "role": "source-ledger",
            },
        ]

    fixture = _packet_fixture(
        tmp_path,
        entry_transform=entries_transform,
        member_transform=members_transform,
    )
    try:
        with pytest.raises(AdapterError, match="path collision") as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_native_request_cannot_supply_a_lookalike_engine_payload(tmp_path):
    fixture = _packet_fixture(tmp_path)
    fixture.request["enginePayload"] = "{}"
    try:
        with pytest.raises(AdapterError, match="unknown or missing field") as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_native_extraction_without_a_parent_lease_is_refused(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        with pytest.raises(
            AdapterError,
            match="workspace lease is unavailable",
        ) as raised:
            run_native_engine_child(
                _entrypoint("_extract_packet_probe"),
                fixture.request,
                deadline=_deadline(),
                pinned_files=fixture.pinned_files,
            )
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert PACKET_EXTRACTION_QUALIFIED is False


# ---------------------------------------------------------------------------
# Optional source/adapter ledgers: cardinality, identity, manifest relationship,
# the closed role universe, and the enforced-vs-pilot frame cap.
# ---------------------------------------------------------------------------

_SOURCE_ROLE = extractor_module.COLMAP_PACKET_SOURCE_LEDGER_ROLE
_ADAPTER_ROLE = extractor_module.COLMAP_PACKET_ADAPTER_LEDGER_ROLE
_REQUEST_ROLE = extractor_module.COLMAP_PACKET_ENGINE_REQUEST_ROLE
_IMAGE_ROLE = extractor_module.COLMAP_PACKET_ENGINE_IMAGE_ROLE
_SOURCE_LEDGER_PATH = extractor_module.COLMAP_PACKET_LEDGER_MEMBER_PATHS[_SOURCE_ROLE]
_ADAPTER_LEDGER_PATH = extractor_module.COLMAP_PACKET_LEDGER_MEMBER_PATHS[_ADAPTER_ROLE]
_MATERIALIZER_ID = "field-raster-v1.2fcccaf0feafa92fdca3fd2a"
_RUN_ID = "a" * 64


def _source_ledger_document(count=3, row_transform=None, **overrides):
    rows = [
        {
            "ordinal": index,
            "sourceArchiveKey": (
                f"room_capture/74056c2a/843b273a/capture-{index:06d}.tar"
            ),
            "sourceMember": f"images/capture_{index:06d}.heic",
            "sourceImageName": f"capture_{index:06d}.heic",
            "sourceSha256": _sha256(f"source-{index}".encode()),
            "sourceSizeBytes": 4096 + index,
        }
        for index in range(count)
    ]
    if row_transform is not None:
        rows = row_transform(rows)
    document = {
        "schemaVersion": extractor_module.SOURCE_LEDGER_SCHEMA_VERSION,
        "contract": extractor_module.SOURCE_LEDGER_CONTRACT,
        "runId": _RUN_ID,
        "frames": rows,
    }
    document.update(overrides)
    return document


def _adapter_ledger_document(**overrides):
    """The rowless adapter envelope.

    There is deliberately no ``count``/``row_transform`` knob: the ledger
    carries no ``frames`` array, so there are no rows to perturb.  Anything
    frame-shaped a caller adds arrives as an unknown envelope field.
    """

    document = {
        "schemaVersion": extractor_module.ADAPTER_LEDGER_SCHEMA_VERSION,
        "contract": extractor_module.ADAPTER_LEDGER_CONTRACT,
        "runId": _RUN_ID,
        "materializerId": _MATERIALIZER_ID,
    }
    document.update(overrides)
    return document


def _ledger_entries(
    *,
    source=None,
    adapter=None,
    source_path=_SOURCE_LEDGER_PATH,
    adapter_path=_ADAPTER_LEDGER_PATH,
):
    entries = []
    if source is not None:
        entries.append((_SOURCE_ROLE, source_path, source))
    if adapter is not None:
        entries.append((_ADAPTER_ROLE, adapter_path, adapter))
    return tuple(entries)


def _packet_fixture_with_ledgers(tmp_path, ledgers) -> _PacketFixture:
    """Add ledger members in the canonical archive/manifest order."""

    def entry_transform(entries):
        combined = [*entries, *[(path, payload, b"0") for _r, path, payload in ledgers]]
        return sorted(combined, key=lambda entry: entry[0])

    def member_transform(members):
        combined = [
            *members,
            *[
                {
                    "relativePath": path,
                    "chunkToken": "packet.chunk.000",
                    "archiveMember": path,
                    "sha256": _sha256(payload),
                    "sizeBytes": len(payload),
                    "role": role,
                }
                for role, path, payload in ledgers
            ],
        ]
        return sorted(
            combined,
            key=lambda member: (member["chunkToken"], member["archiveMember"]),
        )

    return _packet_fixture(
        tmp_path,
        entry_transform=entry_transform,
        member_transform=member_transform,
    )


def _ledger_parse_inputs(tmp_path, ledgers):
    """Return (manifest, engine_request) for a packet carrying ``ledgers``."""

    fixture = _packet_fixture_with_ledgers(tmp_path, ledgers)
    try:
        manifest = _load_manifest(fixture)
    finally:
        fixture.close()
    return manifest, parse_engine_request_member(_engine_request_payload(), manifest)


def _packet_member(path, role, *, sha256=None, size_bytes=16, chunk="packet.chunk.000"):
    return ColmapPacketMember(
        path,
        chunk,
        path,
        sha256 or ("0" * 64),
        size_bytes,
        role,
    )


def _base_members(images=3):
    return [
        _packet_member("engine-request-v1.json", _REQUEST_ROLE),
        *[
            _packet_member(f"images/frame_{index:06d}.ppm", _IMAGE_ROLE)
            for index in range(images)
        ],
    ]


def _manifest_of(members, *, request_member="engine-request-v1.json"):
    return ColmapPacketManifest(
        "packet.manifest",
        "1" * 64,
        _RUN_ID,
        request_member,
        (ColmapPacketChunk("packet.chunk.000", "2" * 64, 512),),
        tuple(members),
    )


# --- closed role universe and ledger cardinality ---------------------------


def test_role_validation_rejects_a_role_outside_the_closed_universe():
    members = [*_base_members(), _packet_member("notes.json", "engine-ledger")]
    with pytest.raises(AdapterError, match="role outside the universe") as raised:
        extractor_module._validate_packet_member_roles(_manifest_of(members))
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("role", "path"),
    ((_SOURCE_ROLE, _SOURCE_LEDGER_PATH), (_ADAPTER_ROLE, _ADAPTER_LEDGER_PATH)),
)
def test_role_validation_rejects_a_second_ledger_for_one_role(role, path):
    members = [
        *_base_members(),
        _packet_member(path, role),
        _packet_member(path, role),
    ]
    with pytest.raises(AdapterError, match="more than one ledger for a role"):
        extractor_module._validate_packet_member_roles(_manifest_of(members))


@pytest.mark.parametrize("requests", (0, 2))
def test_role_validation_requires_exactly_one_engine_request(requests):
    members = [
        *[
            _packet_member(f"engine-request-v{index}.json", _REQUEST_ROLE)
            for index in range(requests)
        ],
        *[
            _packet_member(f"images/frame_{index:06d}.ppm", _IMAGE_ROLE)
            for index in range(3)
        ],
    ]
    with pytest.raises(AdapterError, match="exactly one engine request"):
        extractor_module._validate_packet_member_roles(
            _manifest_of(members, request_member="engine-request-v0.json")
        )


@pytest.mark.parametrize("images", (0, 1, 2, 401, 512))
def test_role_validation_enforces_the_authoritative_engine_image_bound(images):
    with pytest.raises(AdapterError, match="between 3 and 400 engine images"):
        extractor_module._validate_packet_member_roles(
            _manifest_of(_base_members(images))
        )


@pytest.mark.parametrize("images", (3, 200, 400))
def test_role_validation_accepts_the_authoritative_engine_image_bound(images):
    validated = extractor_module._validate_packet_member_roles(
        _manifest_of(_base_members(images))
    )
    assert validated.engine_image_count == images
    assert (validated.source, validated.adapter) == (None, None)
    assert validated.declared_roles == frozenset()


@pytest.mark.parametrize(
    ("role", "path"),
    (
        (_SOURCE_ROLE, "images/source-ledger-v1.json"),
        (_SOURCE_ROLE, _ADAPTER_LEDGER_PATH),
        (_ADAPTER_ROLE, "ledgers/adapter-ledger-v1.json"),
    ),
)
def test_role_validation_rejects_a_ledger_outside_its_exact_path(role, path):
    members = [*_base_members(), _packet_member(path, role)]
    with pytest.raises(AdapterError, match="not at its exact declared path"):
        extractor_module._validate_packet_member_roles(_manifest_of(members))


def test_role_validation_rejects_an_oversized_ledger_member():
    members = [
        *_base_members(),
        _packet_member(
            _SOURCE_LEDGER_PATH,
            _SOURCE_ROLE,
            size_bytes=extractor_module.COLMAP_PACKET_LEDGER_MAX_BYTES + 1,
        ),
    ]
    with pytest.raises(AdapterError, match="ledger exceeds its byte ceiling"):
        extractor_module._validate_packet_member_roles(_manifest_of(members))


@pytest.mark.parametrize(
    "request_member",
    ("missing-request.json", "images/frame_000000.ppm"),
)
def test_role_validation_rejects_an_undeclared_or_misrouted_request(request_member):
    with pytest.raises(AdapterError, match="undeclared or misrouted"):
        extractor_module._validate_packet_member_roles(
            _manifest_of(_base_members(), request_member=request_member)
        )


def test_role_validation_reports_both_optional_ledgers():
    members = [
        *_base_members(),
        _packet_member(_SOURCE_LEDGER_PATH, _SOURCE_ROLE),
        _packet_member(_ADAPTER_LEDGER_PATH, _ADAPTER_ROLE),
    ]
    validated = extractor_module._validate_packet_member_roles(_manifest_of(members))
    assert validated.source is not None
    assert validated.adapter is not None
    assert validated.source.relative_path == _SOURCE_LEDGER_PATH
    assert validated.adapter.relative_path == _ADAPTER_LEDGER_PATH
    assert validated.declared_roles == frozenset({_SOURCE_ROLE, _ADAPTER_ROLE})
    assert validated.engine_image_count == 3


@pytest.mark.parametrize("role", sorted(extractor_module.COLMAP_PACKET_MEMBER_ROLES))
def test_packet_role_universe_matches_the_manifest_loader(tmp_path, role):
    """Drift guard: the extractor's closed set is the loader's accepted set."""

    if role == _REQUEST_ROLE:
        # A packet declares exactly one engine request, so the role is proven
        # accepted by the baseline fixture rather than by adding a second one.
        fixture = _packet_fixture(tmp_path)
        try:
            manifest = _load_manifest(fixture)
        finally:
            fixture.close()
        assert manifest.member_by_path[manifest.request_member].role == _REQUEST_ROLE
        return
    path = {
        _IMAGE_ROLE: "images/frame_000003.ppm",
        _SOURCE_ROLE: _SOURCE_LEDGER_PATH,
        _ADAPTER_ROLE: _ADAPTER_LEDGER_PATH,
    }[role]
    payload = b"{}\n"
    fixture = _packet_fixture_with_ledgers(tmp_path, ((role, path, payload),))
    try:
        manifest = _load_manifest(fixture)
    finally:
        fixture.close()
    assert manifest.member_by_path[path].role == role


def _loader_allowed_roles() -> frozenset[str]:
    """Read the loader's ``allowed_roles`` literal out of its own source.

    The extractor's ``COLMAP_PACKET_MEMBER_ROLES`` cannot be compared against
    the loader's set by importing it -- the loader builds it as a function
    local.  Parsing the literal is the only way to see the *whole* set, and
    seeing the whole set is the point: a behavioural probe can only ever show
    that some role is accepted or that some chosen sentinel is refused, which
    is why the previous sentinel-based guard missed a fifth role being added.

    Every structural assumption below is asserted rather than assumed, so any
    rewrite that would hide a role (a second binding, an augmented assignment,
    a set built by ``|`` or a comprehension, a non-literal element) turns this
    guard red instead of quietly weakening it.
    """

    tree = ast.parse(textwrap.dedent(inspect.getsource(load_colmap_packet_manifest)))
    bindings = [
        node
        for node in ast.walk(tree)
        if (
            (
                isinstance(node, ast.Assign)
                and any(
                    isinstance(target, ast.Name) and target.id == "allowed_roles"
                    for target in node.targets
                )
            )
            or (
                isinstance(node, (ast.AugAssign, ast.AnnAssign, ast.NamedExpr))
                and isinstance(node.target, ast.Name)
                and node.target.id == "allowed_roles"
            )
        )
    ]
    assert len(bindings) == 1, "the loader must bind allowed_roles exactly once"
    binding = bindings[0]
    assert type(binding) is ast.Assign and len(binding.targets) == 1
    literal = binding.value
    assert type(literal) is ast.Set, "allowed_roles must stay a plain set literal"
    roles = tuple(ast.literal_eval(element) for element in literal.elts)
    assert all(type(role) is str for role in roles)
    assert len(set(roles)) == len(roles), "allowed_roles must not repeat a role"
    return frozenset(roles)


def test_manifest_loader_role_universe_equals_the_extractor_constant():
    """Drift guard in BOTH directions, unlike a per-member acceptance probe.

    ``test_packet_role_universe_matches_the_manifest_loader`` only proves
    extractor-set ⊆ loader-set; adding a fifth role to the loader alone left
    the whole suite green.  Set equality is what actually pins the two copies.
    """

    assert _loader_allowed_roles() == extractor_module.COLMAP_PACKET_MEMBER_ROLES


def test_manifest_loader_enforces_its_declared_role_universe(tmp_path):
    """The literal is not decoration: a role outside it is actually refused.

    The set-equality guard above compares source text; this one proves the
    text is consulted at runtime.  Its sentinel is derived from the parsed
    literal rather than hardcoded, so it cannot go stale the way the old
    ``"engine-ledger"`` sentinel did.
    """

    unknown_role = "engine-ledger"
    assert unknown_role not in _loader_allowed_roles()
    assert unknown_role not in extractor_module.COLMAP_PACKET_MEMBER_ROLES
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        ((unknown_role, "engine-ledger-v1.json", b"{}\n"),),
    )
    try:
        with pytest.raises(AdapterError, match="unsupported role"):
            _load_manifest(fixture)
    finally:
        fixture.close()


# --- the enforced 3--400 bound versus the unqualified 200--400 pilot band ---


def test_pilot_frame_range_is_explicit_subrange_and_is_not_enforced():
    pilot_minimum = extractor_module.COLMAP_PACKET_PILOT_MIN_ENGINE_IMAGES
    pilot_maximum = extractor_module.COLMAP_PACKET_PILOT_MAX_ENGINE_IMAGES
    assert (pilot_minimum, pilot_maximum) == (200, 400)
    assert COLMAP_PACKET_MIN_ENGINE_IMAGES < pilot_minimum
    assert pilot_maximum == COLMAP_PACKET_MAX_ENGINE_IMAGES
    # The pilot band is a classification, never a rejection: the enforced bound
    # still admits packets below it, and the band itself stays unqualified.
    assert (
        extractor_module._validate_packet_member_roles(
            _manifest_of(_base_members(COLMAP_PACKET_MIN_ENGINE_IMAGES))
        ).engine_image_count
        == COLMAP_PACKET_MIN_ENGINE_IMAGES
    )
    assert PILOT_200_400_FRAME_RANGE_QUALIFIED is False


@pytest.mark.parametrize(
    ("images", "within"),
    ((3, False), (199, False), (200, True), (400, True)),
)
def test_extracted_packet_reports_whether_it_is_in_the_pilot_band(images, within):
    packet = extractor_module.ExtractedColmapPacket(
        -1,
        _manifest_of(_base_members(images)),
        None,
        (),
    )
    assert packet.engine_image_count == images
    assert packet.within_pilot_frame_range is within
    assert (packet.source_ledger, packet.adapter_ledger) == (None, None)


# --- end-to-end extraction with the optional ledgers -----------------------


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_packet_with_both_ledgers_is_parsed_and_bound_to_the_manifest(
    tmp_path,
    monkeypatch,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setenv("TMPDIR", str(scratch))
    source_payload = _canonical_json(_source_ledger_document())
    adapter_payload = _canonical_json(_adapter_ledger_document())
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        _ledger_entries(source=source_payload, adapter=adapter_payload),
    )
    try:
        result = _run(fixture, scratch)
    finally:
        fixture.close()

    assert result["paths"] == [
        _ADAPTER_LEDGER_PATH,
        "engine-request-v1.json",
        "images/frame_000000.ppm",
        "images/frame_000001.ppm",
        "images/frame_000002.ppm",
        _SOURCE_LEDGER_PATH,
    ]
    assert result["sourceLedger"] == {
        "relativePath": _SOURCE_LEDGER_PATH,
        "sha256": _sha256(source_payload),
        "imageNames": [
            "capture_000000.heic",
            "capture_000001.heic",
            "capture_000002.heic",
        ],
        "members": [
            "images/capture_000000.heic",
            "images/capture_000001.heic",
            "images/capture_000002.heic",
        ],
        "sizes": [4096, 4097, 4098],
    }
    assert result["adapterLedger"] == {
        "relativePath": _ADAPTER_LEDGER_PATH,
        "sha256": _sha256(adapter_payload),
        "materializerId": _MATERIALIZER_ID,
        "hasRows": False,
    }
    assert result["engineImageCount"] == 3
    assert result["withinPilotFrameRange"] is False
    assert set(result["memberModes"].values()) == {0o600}
    # The parent still removes every extracted ledger with its workspace.
    assert list(scratch.iterdir()) == []
    assert PACKET_EXTRACTION_QUALIFIED is False


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize("present", ("none", "source", "adapter"))
def test_optional_ledgers_are_absent_without_failing_extraction(
    tmp_path,
    monkeypatch,
    present,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setenv("TMPDIR", str(scratch))
    ledgers = {
        "none": (),
        "source": _ledger_entries(source=_canonical_json(_source_ledger_document())),
        "adapter": _ledger_entries(adapter=_canonical_json(_adapter_ledger_document())),
    }[present]
    fixture = _packet_fixture_with_ledgers(tmp_path, ledgers)
    try:
        result = _run(fixture, scratch)
    finally:
        fixture.close()
    assert (result["sourceLedger"] is None) is (present != "source")
    assert (result["adapterLedger"] is None) is (present != "adapter")
    assert list(scratch.iterdir()) == []


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
@pytest.mark.parametrize(
    ("ledgers", "detail"),
    (
        (
            _ledger_entries(
                source=_canonical_json(_source_ledger_document()),
                source_path="engine-inputs/source-ledger-v1.json",
            ),
            "not at its exact declared path",
        ),
        (
            _ledger_entries(source=b"{}\n"),
            "unknown or missing field",
        ),
        (
            _ledger_entries(source=b"not-json\n"),
            "not valid UTF-8 JSON",
        ),
        (
            # A producer that still emits the pre-trim per-frame array is
            # refused end to end, not silently tolerated.
            _ledger_entries(
                adapter=_canonical_json(
                    _adapter_ledger_document(
                        frames=[
                            {
                                "ordinal": index,
                                "engineImageName": f"frame_{index:06d}.ppm",
                                "engineRelativePath": f"images/frame_{index:06d}.ppm",
                                "engineSha256": _sha256(payload),
                                "engineSizeBytes": len(payload),
                            }
                            for index, payload in enumerate(_fixture_images())
                        ]
                    )
                ),
            ),
            "unknown or missing field",
        ),
    ),
)
def test_native_extraction_fails_closed_on_a_bad_ledger(tmp_path, ledgers, detail):
    fixture = _packet_fixture_with_ledgers(tmp_path, ledgers)
    try:
        with pytest.raises(AdapterError, match=detail) as raised:
            _run(fixture, tmp_path / "lease")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert list((tmp_path / "lease").iterdir()) == []


# --- ledger document parsing ----------------------------------------------


def _row_change(index, **changes):
    def transform(rows):
        rows[index] = {**rows[index], **changes}
        return rows

    return transform


def _row_without(index, key):
    def transform(rows):
        rows[index] = {
            name: value for name, value in rows[index].items() if name != key
        }
        return rows

    return transform


def _row_replaced(index, value):
    def transform(rows):
        rows[index] = value
        return rows

    return transform


def _parse_source(tmp_path, payload):
    manifest, engine_request = _ledger_parse_inputs(
        tmp_path,
        _ledger_entries(source=_canonical_json(_source_ledger_document())),
    )
    return extractor_module._parse_source_ledger(
        payload,
        manifest=manifest,
        member=manifest.member_by_path[_SOURCE_LEDGER_PATH],
        engine_request=engine_request,
    )


def _parse_adapter(tmp_path, payload):
    manifest, engine_request = _ledger_parse_inputs(
        tmp_path,
        _ledger_entries(adapter=_canonical_json(_adapter_ledger_document())),
    )
    del engine_request  # the trimmed adapter ledger no longer consumes frames
    return extractor_module._parse_adapter_ledger(
        payload,
        manifest=manifest,
        member=manifest.member_by_path[_ADAPTER_LEDGER_PATH],
    )


def test_source_ledger_happy_path_binds_every_frame(tmp_path):
    payload = _canonical_json(_source_ledger_document())
    parsed = _parse_source(tmp_path, payload)
    assert parsed.relative_path == _SOURCE_LEDGER_PATH
    assert parsed.sha256 == _sha256(payload)
    assert [row.ordinal for row in parsed.rows] == [0, 1, 2]
    assert [row.source_image_name for row in parsed.rows] == [
        "capture_000000.heic",
        "capture_000001.heic",
        "capture_000002.heic",
    ]
    assert parsed.rows[2].source_archive_key.endswith("capture-000002.tar")
    assert parsed.rows[2].source_size_bytes == 4098
    assert parsed.rows[2].source_sha256 == _sha256(b"source-2")


def test_source_ledger_accepts_one_digest_repeated_at_one_size(tmp_path):
    """The digest/size rule must not over-reject byte-identical sources.

    Two frames rastered from the same object is legitimate; what is impossible
    is one digest at two sizes.  The ``(archiveKey, member)`` uniqueness rule
    still applies and is unaffected.
    """

    payload = _canonical_json(
        _source_ledger_document(
            row_transform=_row_change(
                1,
                sourceSha256=_sha256(b"source-0"),
                sourceSizeBytes=4096,
            )
        )
    )
    parsed = _parse_source(tmp_path, payload)
    assert parsed.rows[0].source_sha256 == parsed.rows[1].source_sha256
    assert parsed.rows[0].source_size_bytes == parsed.rows[1].source_size_bytes == 4096
    assert parsed.rows[0].source_member != parsed.rows[1].source_member


def test_source_ledger_accepts_a_size_exactly_at_the_declared_ceiling(tmp_path):
    ceiling = extractor_module.COLMAP_PACKET_SOURCE_OBJECT_MAX_BYTES
    # The ceiling is the per-file native pinned-file bound, not an invention.
    assert ceiling == extractor_module.COLMAP_PACKET_MEMBER_MAX_BYTES
    assert ceiling == native_process.NATIVE_CHILD_MAX_PINNED_FILE_BYTES
    payload = _canonical_json(
        _source_ledger_document(row_transform=_row_change(0, sourceSizeBytes=ceiling))
    )
    assert _parse_source(tmp_path, payload).rows[0].source_size_bytes == ceiling


def test_source_ledger_archive_key_residual_is_unanchored_and_carried(tmp_path):
    """Executable form of a DECLARED residual, not an accepted regression.

    The packet manifest carries only a 64-hex ``runId`` -- no owner id, no scan
    id -- so nothing in this module can tell one owner's archive path from
    another's.  A foreign key is therefore accepted and carried into the parsed
    row.  This test exists so that residual is visible in the suite rather than
    only in a docstring; closing it needs an owner/scan binding in the manifest.
    """

    foreign_key = "room_capture/00000000/ffffffff/capture-000000.tar"
    payload = _canonical_json(
        _source_ledger_document(
            row_transform=_row_change(0, sourceArchiveKey=foreign_key)
        )
    )
    parsed = _parse_source(tmp_path, payload)
    assert parsed.rows[0].source_archive_key == foreign_key


def test_adapter_ledger_happy_path_is_the_rowless_materializer_envelope(tmp_path):
    payload = _canonical_json(_adapter_ledger_document())
    parsed = _parse_adapter(tmp_path, payload)
    assert parsed.relative_path == _ADAPTER_LEDGER_PATH
    assert parsed.sha256 == _sha256(payload)
    assert parsed.materializer_id == _MATERIALIZER_ID
    # The whole novel information content of this ledger is one string.
    assert not hasattr(parsed, "rows")
    assert not hasattr(extractor_module, "ColmapAdapterLedgerRow")


def test_engine_request_already_proves_every_fact_a_frame_row_would_have(tmp_path):
    """Why F5's trim loses nothing: the removed row checks were derivable.

    Each dropped adapter-row assertion is re-derived here from the extracted
    engine request and the manifest alone -- no ledger involved.  If this ever
    stops holding, the trim's premise is broken and the rows have to come back.
    """

    manifest, engine_request = _ledger_parse_inputs(
        tmp_path,
        _ledger_entries(adapter=_canonical_json(_adapter_ledger_document())),
    )
    declared_engine_images = {
        member.relative_path
        for member in manifest.members
        if member.role == _IMAGE_ROLE
    }
    covered: set[str] = set()
    for index, frame in enumerate(engine_request.frames):
        member = manifest.member_by_path[frame.engine_relative_path]
        # name, path, digest, size: exactly the four fields a row repeated.
        assert frame.ordinal == index
        assert frame.engine_image_name == f"frame_{index:06d}.ppm"
        assert frame.engine_relative_path == f"images/{frame.engine_image_name}"
        assert member.role == _IMAGE_ROLE
        assert member.sha256 == frame.engine_sha256
        assert member.size_bytes == frame.engine_size_bytes
        covered.add(frame.engine_relative_path)
    # Injectivity plus the frame-count agreement enforced by
    # _read_and_parse_optional_ledgers is what the dropped exact-coverage check
    # used to assert about ledger rows.
    assert len(covered) == len(engine_request.frames)
    assert covered == declared_engine_images


@pytest.mark.parametrize(
    ("payload_factory", "detail"),
    (
        (lambda: b"{", "not valid UTF-8 JSON"),
        (lambda: b"\xff\xfe\n", "not valid UTF-8 JSON"),
        (lambda: b"[]\n", "not canonical JSON"),
        (
            lambda: json.dumps(_source_ledger_document()).encode(),
            "not canonical JSON",
        ),
        (
            lambda: _canonical_json({**_source_ledger_document(), "extra": 1}),
            "unknown or missing field",
        ),
        (
            lambda: _canonical_json(
                {
                    name: value
                    for name, value in _source_ledger_document().items()
                    if name != "runId"
                }
            ),
            "unknown or missing field",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(schemaVersion=2)),
            "contract is unsupported",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(schemaVersion=True)),
            "contract is unsupported",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(contract="patina-refine-colmap-source-ledger")
            ),
            "contract is unsupported",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(runId="b" * 64)),
            "runId does not match its manifest",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(frames={})),
            "frames must be an exact JSON array",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(count=2)),
            "does not cover every engine frame",
        ),
        (
            lambda: _canonical_json(_source_ledger_document(count=4)),
            "does not cover every engine frame",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_replaced(1, "row"))
            ),
            "row 1 has an invalid shape",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(0, extra=1))
            ),
            "row 0 has an invalid shape",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_without(2, "sourceSha256"))
            ),
            "row 2 has an invalid shape",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(1, ordinal=0))
            ),
            "ordinals must be dense and ordered",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(1, ordinal=True))
            ),
            "ordinal must be an integer",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(1, ordinal=-1))
            ),
            "ordinal must be an integer",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceImageName="capture_000009.heic")
                )
            ),
            "row does not match its engine frame",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(0, sourceImageName=5))
            ),
            "row does not match its engine frame",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceMember="images/other.heic")
                )
            ),
            "member does not match its image identity",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceArchiveKey="/absolute/key.tar")
                )
            ),
            "not a canonical safe relative path",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceArchiveKey="../escape.tar")
                )
            ),
            "not a canonical safe relative path",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceArchiveKey=7)
                )
            ),
            "must be a non-empty POSIX relative path",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceSha256="A" * 64)
                )
            ),
            "must be a lowercase SHA-256",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(row_transform=_row_change(0, sourceSizeBytes=0))
            ),
            "sourceSizeBytes must be an integer >= 1",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceSizeBytes=True)
                )
            ),
            "sourceSizeBytes must be an integer >= 1",
        ),
        # An unbounded size is not a harmless oddity: it flows straight into
        # published evidence, and no downstream reader re-measures the object.
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(0, sourceSizeBytes=10**60)
                )
            ),
            "sourceSizeBytes must be an integer <= ",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(
                        0,
                        sourceSizeBytes=(
                            extractor_module.COLMAP_PACKET_SOURCE_OBJECT_MAX_BYTES + 1
                        ),
                    )
                )
            ),
            "sourceSizeBytes must be an integer <= ",
        ),
        # Self-consistency, checkable without the absent objects: one digest
        # cannot describe two different byte counts.
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(1, sourceSha256=_sha256(b"source-0"))
                )
            ),
            "declares one source digest at two sizes",
        ),
        (
            lambda: _canonical_json(
                _source_ledger_document(
                    row_transform=_row_change(
                        2,
                        sourceSha256=_sha256(b"source-0"),
                        sourceSizeBytes=1,
                    )
                )
            ),
            "declares one source digest at two sizes",
        ),
    ),
)
def test_source_ledger_rejections(tmp_path, payload_factory, detail):
    with pytest.raises(AdapterError, match=detail) as raised:
        _parse_source(tmp_path, payload_factory())
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("payload_factory", "detail"),
    (
        (lambda: b"{", "not valid UTF-8 JSON"),
        (
            lambda: _canonical_json(_adapter_ledger_document(runId="c" * 64)),
            "runId does not match its manifest",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(schemaVersion=99)),
            "contract is unsupported",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(materializerId="")),
            "materializerId is not canonical",
        ),
        (
            lambda: _canonical_json(
                _adapter_ledger_document(materializerId=f" {_MATERIALIZER_ID} ")
            ),
            "materializerId is not canonical",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(materializerId=None)),
            "materializerId is not canonical",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(materializerId="x" * 129)),
            "materializerId is not canonical",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(materializerId=5)),
            "materializerId is not canonical",
        ),
        (
            lambda: _canonical_json(
                {
                    name: value
                    for name, value in _adapter_ledger_document().items()
                    if name != "materializerId"
                }
            ),
            "unknown or missing field",
        ),
        # The trimmed ledger has no rows, so "a bad row" is now expressed as an
        # unknown envelope field.  Every shape a pre-trim producer could emit
        # -- a well-formed frames array, a junk one, or a single stray key --
        # lands on the same closed field-set refusal.
        (
            lambda: _canonical_json(_adapter_ledger_document(frames=[])),
            "unknown or missing field",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(frames="row")),
            "unknown or missing field",
        ),
        (
            lambda: _canonical_json(
                _adapter_ledger_document(
                    frames=[{"ordinal": 0, "engineImageName": "frame_000000.ppm"}]
                )
            ),
            "unknown or missing field",
        ),
        (
            lambda: _canonical_json(_adapter_ledger_document(extra=1)),
            "unknown or missing field",
        ),
        (lambda: b"[]\n", "not canonical JSON"),
        (
            lambda: json.dumps(_adapter_ledger_document()).encode(),
            "not canonical JSON",
        ),
    ),
)
def test_adapter_ledger_rejections(tmp_path, payload_factory, detail):
    with pytest.raises(AdapterError, match=detail) as raised:
        _parse_adapter(tmp_path, payload_factory())
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize("ledger_kind", ("source", "adapter"))
def test_deeply_nested_ledger_json_recursion_error_is_normalized(
    tmp_path,
    ledger_kind,
):
    depth = 10_000
    nested_payload = b"[" * depth + b"0" + b"]" * depth
    parse = _parse_source if ledger_kind == "source" else _parse_adapter
    with pytest.raises(AdapterError, match="not valid UTF-8 JSON") as raised:
        parse(tmp_path, nested_payload)
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is RecursionError


def _duplicated_frame_request(engine_request):
    """A hand-built request whose frame identities repeat.

    ``parse_engine_request_member`` can never produce this; the ledger parsers
    must still refuse it rather than trust their caller.
    """

    frames = engine_request.frames
    return ColmapEngineRequest((frames[0], frames[1], frames[1]), "0")


def test_source_ledger_refuses_a_repeated_source_object(tmp_path):
    manifest, engine_request = _ledger_parse_inputs(
        tmp_path,
        _ledger_entries(source=_canonical_json(_source_ledger_document())),
    )
    rows = _source_ledger_document()["frames"]
    rows[2] = {**rows[1], "ordinal": 2}
    payload = _canonical_json(_source_ledger_document(row_transform=lambda _r: rows))
    with pytest.raises(AdapterError, match="repeats a source object identity"):
        extractor_module._parse_source_ledger(
            payload,
            manifest=manifest,
            member=manifest.member_by_path[_SOURCE_LEDGER_PATH],
            engine_request=_duplicated_frame_request(engine_request),
        )


# ``test_adapter_ledger_refuses_an_unaccounted_declared_engine_image`` and
# ``test_adapter_ledger_refuses_a_row_naming_an_undeclared_member`` were deleted
# here rather than ported: both drove ``_parse_adapter_ledger`` with hand-built
# per-frame rows, and the trimmed ledger has no rows for them to perturb.  What
# they were really asserting -- that the engine-image universe is covered
# exactly and that no row names an undeclared member -- is now carried by
# ``test_engine_request_already_proves_every_fact_a_frame_row_would_have``
# against the request and manifest directly, which is where those facts were
# always established.


# --- capture, re-read identity, and internal fail-closed seams -------------


def _hand_built_manifest(fixture, ledger_members):
    """Build a manifest object the backend loader would refuse to produce."""

    engine_payload = _engine_request_payload()
    members = [
        ColmapPacketMember(
            "engine-request-v1.json",
            "packet.chunk.000",
            "engine-request-v1.json",
            _sha256(engine_payload),
            len(engine_payload),
            _REQUEST_ROLE,
        ),
        *[
            ColmapPacketMember(
                f"images/frame_{index:06d}.ppm",
                "packet.chunk.000",
                f"images/frame_{index:06d}.ppm",
                _sha256(payload),
                len(payload),
                _IMAGE_ROLE,
            )
            for index, payload in enumerate(_fixture_images())
        ],
        *[
            ColmapPacketMember(
                path,
                "packet.chunk.000",
                path,
                _sha256(payload),
                len(payload),
                role,
            )
            for role, path, payload in ledger_members
        ],
    ]
    members.sort(key=lambda member: (member.chunk_token, member.archive_member))
    chunk = ColmapPacketChunk(
        "packet.chunk.000",
        _sha256(fixture.chunk_payload),
        len(fixture.chunk_payload),
    )
    return ColmapPacketManifest(
        "packet.manifest",
        _sha256(fixture.manifest_payload),
        _RUN_ID,
        "engine-request-v1.json",
        (chunk,),
        tuple(members),
    )


def test_extract_chunk_refuses_a_ledger_with_nowhere_to_be_captured(tmp_path):
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        _ledger_entries(source=_canonical_json(_source_ledger_document())),
    )
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    try:
        with pytest.raises(AdapterError, match="nowhere to be captured") as raised:
            extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=set(),
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_extract_chunk_rejects_a_repeated_ledger_role(tmp_path):
    payload = _canonical_json(_source_ledger_document())
    second_payload = _canonical_json(_source_ledger_document(count=3))
    ledger_members = (
        (_SOURCE_ROLE, "source-ledger-v1.json", payload),
        (_SOURCE_ROLE, "source-ledger-v2.json", second_payload),
    )
    fixture = _packet_fixture_with_ledgers(tmp_path, ledger_members)
    manifest = _hand_built_manifest(fixture, ledger_members)
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    try:
        with pytest.raises(AdapterError, match="repeats a ledger role") as raised:
            extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=set(),
                ledger_payloads={},
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert list((tmp_path / "lease").iterdir()) == []


def test_extract_chunk_rejects_a_repeated_engine_request(tmp_path):
    """The twin of ``test_extract_chunk_rejects_a_repeated_ledger_role``.

    Found by mutation sweep, not by review: deleting this guard left the whole
    extractor suite green even though its ledger-role twin was covered.  No
    manifest ``load_colmap_packet_manifest`` produces can carry two
    engine-request members, so the guard is only reachable through a hand-built
    manifest -- which is exactly the seam a future caller could arrive on.
    """

    second_request = _engine_request_payload()
    request_members = ((_REQUEST_ROLE, "engine-request-v2.json", second_request),)
    fixture = _packet_fixture_with_ledgers(tmp_path, request_members)
    manifest = _hand_built_manifest(fixture, request_members)
    assert (
        sum(member.role == _REQUEST_ROLE for member in manifest.members) == 2
    ), "the hand-built manifest must carry the two requests the loader would refuse"
    lease = _lease(tmp_path / "lease")
    ledger = _leased_ledger(lease)
    try:
        with pytest.raises(AdapterError, match="repeats the engine request") as raised:
            extractor_module._extract_archive_chunk(
                chunk=manifest.chunks[0],
                manifest=manifest,
                context=fixture.direct_context(),
                ledger=ledger,
                extracted_paths=set(),
                ledger_payloads={},
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert list((tmp_path / "lease").iterdir()) == []


def test_uncanonicalizable_ledger_json_is_normalized_not_masked(tmp_path, monkeypatch):
    """``_canonical_json_bytes`` must raise, not return ``None``.

    Also a mutation-sweep find.  Returning ``None`` still fails closed -- the
    caller compares ``payload != None`` and reports "not canonical JSON" -- so
    the guard is *masked* rather than load-bearing for safety.  It is still the
    difference between a diagnosable error and a misleading one, and this pins
    the normalization of a serializer exception into ``AdapterError``.
    """

    # Everything that needs a real serializer is built first: the extractor and
    # this test file share one ``json`` module object, so the patch below is
    # global and would otherwise break fixture construction instead of the
    # code under test.
    payload = _canonical_json(_source_ledger_document())
    manifest, engine_request = _ledger_parse_inputs(
        tmp_path,
        _ledger_entries(source=payload),
    )
    member = manifest.member_by_path[_SOURCE_LEDGER_PATH]

    def refuse_to_serialize(*_args, **_kwargs):
        raise ValueError("injected serializer failure")

    monkeypatch.setattr(extractor_module.json, "dumps", refuse_to_serialize)
    with pytest.raises(AdapterError, match="not canonicalizable") as raised:
        extractor_module._parse_source_ledger(
            payload,
            manifest=manifest,
            member=member,
            engine_request=engine_request,
        )
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is ValueError


def _extracted_source_ledger(tmp_path, lease):
    """Extract a packet carrying a source ledger and hand back the re-read inputs."""

    source_payload = _canonical_json(_source_ledger_document())
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        _ledger_entries(source=source_payload),
    )
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    ledger_payloads: dict[str, bytes] = {}
    extractor_module._extract_archive_chunk(
        chunk=manifest.chunks[0],
        manifest=manifest,
        context=fixture.direct_context(),
        ledger=ledger,
        extracted_paths=set(),
        ledger_payloads=ledger_payloads,
    )
    assert ledger_payloads[_SOURCE_ROLE] == source_payload
    return fixture, manifest, ledger, ledger_payloads[_SOURCE_ROLE]


@pytest.mark.parametrize(
    ("failing_function", "detail"),
    (
        ("dup", "cannot open the extracted COLMAP source ledger directory"),
        ("open", "cannot open the extracted COLMAP source ledger"),
        ("fstat", "cannot inspect the extracted COLMAP source ledger"),
    ),
)
def test_ledger_reread_os_failures_are_normalized(
    tmp_path,
    monkeypatch,
    failing_function,
    detail,
):
    """Each OSError seam on the ledger re-read path raises AdapterError, not OSError.

    All three survived the mutation sweep before this test existed: with the
    guard deleted the re-read either leaks a raw ``OSError`` or trips over an
    unbound descriptor.  A ledger sits at the packet root, so its directory
    chain is empty and ``os.dup`` alone stands in for the chain open.
    """

    lease = _lease(tmp_path / "lease")
    fixture, manifest, ledger, payload = _extracted_source_ledger(tmp_path, lease)
    real_open = extractor_module.os.open
    real_fstat = extractor_module.os.fstat
    ledger_descriptors: set[int] = set()

    def fail_dup(_descriptor):
        raise OSError("injected dup failure")

    def fail_open(path, flags, *args, **kwargs):
        if path == _SOURCE_LEDGER_PATH and not flags & os.O_CREAT:
            raise OSError("injected open failure")
        return real_open(path, flags, *args, **kwargs)

    def record_open(path, flags, *args, **kwargs):
        descriptor = real_open(path, flags, *args, **kwargs)
        if path == _SOURCE_LEDGER_PATH and not flags & os.O_CREAT:
            ledger_descriptors.add(descriptor)
        return descriptor

    def fail_fstat(descriptor):
        if descriptor in ledger_descriptors:
            raise OSError("injected fstat failure")
        return real_fstat(descriptor)

    if failing_function == "dup":
        monkeypatch.setattr(extractor_module.os, "dup", fail_dup)
    elif failing_function == "open":
        monkeypatch.setattr(extractor_module.os, "open", fail_open)
    else:
        monkeypatch.setattr(extractor_module.os, "open", record_open)
        monkeypatch.setattr(extractor_module.os, "fstat", fail_fstat)
    try:
        with pytest.raises(AdapterError, match=detail) as raised:
            extractor_module._read_extracted_member_payload(
                ledger=ledger,
                member=manifest.member_by_path[_SOURCE_LEDGER_PATH],
                context=fixture.direct_context(),
                expected_payload=payload,
                label="source ledger",
            )
    finally:
        # Cleanup must run against real syscalls, not the injected ones.
        monkeypatch.undo()
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is OSError
    if failing_function == "fstat":
        assert ledger_descriptors


def test_copy_member_rejects_an_oversized_ledger_before_any_descriptor_use(tmp_path):
    fixture = _packet_fixture(tmp_path)
    oversized = ColmapPacketMember(
        _SOURCE_LEDGER_PATH,
        "packet.chunk.000",
        _SOURCE_LEDGER_PATH,
        "0" * 64,
        extractor_module.COLMAP_PACKET_LEDGER_MAX_BYTES + 1,
        _SOURCE_ROLE,
    )
    try:
        # Both descriptors are invalid on purpose: the ceiling must reject the
        # member before a single read or write is attempted.
        with pytest.raises(AdapterError, match="ledger exceeds its byte ceiling"):
            extractor_module._copy_archive_member(
                -1,
                source_offset=0,
                destination_descriptor=-1,
                member=oversized,
                context=fixture.direct_context(),
            )
    finally:
        fixture.close()


def test_read_extracted_member_payload_requires_a_captured_payload(tmp_path):
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        _ledger_entries(source=_canonical_json(_source_ledger_document())),
    )
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    try:
        with pytest.raises(AdapterError, match="was never captured") as raised:
            extractor_module._read_extracted_member_payload(
                ledger=ledger,
                member=manifest.member_by_path[_SOURCE_LEDGER_PATH],
                context=fixture.direct_context(),
                expected_payload=None,
                label="source ledger",
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_extracted_ledger_identity_change_is_detected_on_reread(tmp_path):
    source_payload = _canonical_json(_source_ledger_document())
    fixture = _packet_fixture_with_ledgers(
        tmp_path,
        _ledger_entries(source=source_payload),
    )
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    ledger_payloads: dict[str, bytes] = {}
    try:
        extractor_module._extract_archive_chunk(
            chunk=manifest.chunks[0],
            manifest=manifest,
            context=fixture.direct_context(),
            ledger=ledger,
            extracted_paths=set(),
            ledger_payloads=ledger_payloads,
        )
        assert ledger_payloads[_SOURCE_ROLE] == source_payload
        extracted = _packet_root(lease) / _SOURCE_LEDGER_PATH
        original = extracted.read_bytes()
        with extracted.open("r+b") as changed:
            changed.seek(len(original) - 2)
            changed.write(bytes([original[-2] ^ 1]))
            changed.flush()
            os.fsync(changed.fileno())
        with pytest.raises(AdapterError, match="identity changed") as raised:
            extractor_module._read_extracted_member_payload(
                ledger=ledger,
                member=manifest.member_by_path[_SOURCE_LEDGER_PATH],
                context=fixture.direct_context(),
                expected_payload=ledger_payloads[_SOURCE_ROLE],
                label="source ledger",
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert list((tmp_path / "lease").iterdir()) == []


def test_optional_ledger_read_requires_frame_count_agreement(tmp_path):
    fixture = _packet_fixture(tmp_path)
    lease = _lease(tmp_path / "lease")
    manifest = _load_manifest(fixture)
    ledger = _leased_ledger(lease)
    engine_request = parse_engine_request_member(_engine_request_payload(), manifest)
    try:
        with pytest.raises(AdapterError, match="frame count disagrees") as raised:
            extractor_module._read_and_parse_optional_ledgers(
                ledger=ledger,
                manifest=manifest,
                context=fixture.direct_context(),
                engine_request=engine_request,
                members=extractor_module._PacketLedgerMembers(None, None, 4),
                ledger_payloads={},
            )
    finally:
        assert extractor_module._cleanup_extraction_workspace(ledger) == ()
        assert _release(lease) == ()
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
