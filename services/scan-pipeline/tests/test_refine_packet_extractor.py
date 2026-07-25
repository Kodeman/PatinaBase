"""Adversarial tests for the disabled child-side Refine packet extractor."""

from __future__ import annotations

import hashlib
import json
import os
import stat
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
    ENGINE_REQUEST_CONTRACT,
    ENGINE_REQUEST_SCHEMA_VERSION,
    PACKET_CONTRACT,
    PACKET_EXTRACTION_QUALIFIED,
    PACKET_SCHEMA_VERSION,
    load_colmap_packet_manifest,
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
    images = [f"P6\n1 1\n255\n{i:03d}".encode() for i in range(3)]
    frames = [_frame(index, payload) for index, payload in enumerate(images)]
    engine_payload = _canonical_json(
        {
            "schemaVersion": ENGINE_REQUEST_SCHEMA_VERSION,
            "contract": ENGINE_REQUEST_CONTRACT,
            "targetColmapVersion": "4.0.2",
            "gpuIndex": "0",
            "frames": frames,
        }
    )
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
            "workspaceIsDistinctDescriptor": (
                packet.workspace_descriptor != context.workspace_descriptor()
            ),
            "memberModes": member_modes,
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
    assert result["workspaceIsLeasedRoot"] is True
    assert result["workspaceIsDistinctDescriptor"] is True
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
            (Path(lease.path) / "squatter.bin").write_bytes(b"x")
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
    real_dup = os.dup
    duplicates: list[int] = []
    failed = False

    def wrong_identity(descriptor):
        metadata = real_fstat(descriptor)
        if descriptor in duplicates:
            return SimpleNamespace(
                st_dev=metadata.st_dev,
                st_ino=metadata.st_ino + 1,
                st_uid=metadata.st_uid,
                st_mode=metadata.st_mode,
            )
        return metadata

    def record_dup(descriptor):
        duplicate = real_dup(descriptor)
        duplicates.append(duplicate)
        return duplicate

    def inject_close_failure(descriptor):
        nonlocal failed
        if not failed and descriptor in duplicates:
            failed = True
            real_close(descriptor)
            raise OSError("synthetic workspace lease duplicate close failure")
        return real_close(descriptor)

    monkeypatch.setattr(extractor_module.os, "dup", record_dup)
    monkeypatch.setattr(extractor_module.os, "fstat", wrong_identity)
    monkeypatch.setattr(extractor_module.os, "close", inject_close_failure)
    try:
        with pytest.raises(AdapterError, match="cannot close") as raised:
            _leased_ledger(lease)
    finally:
        monkeypatch.undo()
        assert _release(lease) == ()

    assert failed is True
    assert duplicates
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
            assert not (Path(lease.path) / "member.bin").exists()
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
    request_path = Path(lease.path) / request_member.relative_path
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
    directory_path = Path(lease.path) / "images"
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
    request_path = Path(lease.path) / request_member.relative_path
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
