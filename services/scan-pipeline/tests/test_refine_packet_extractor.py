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

import pytest

import patina_scan_worker.refine_colmap_backend as backend_module
import patina_scan_worker.refine_packet_extractor as extractor_module
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
    native_engine_entrypoint,
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

    def direct_context(self) -> NativeChildContext:
        return NativeChildContext(
            time.monotonic() + 10.0,
            MappingProxyType(
                {
                    "packet.chunk.000": self.chunk_handle.fileno(),
                    "packet.manifest": self.manifest_handle.fileno(),
                }
            ),
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


@native_engine_entrypoint
def _extract_packet_probe(request, context: NativeChildContext):
    with extract_colmap_packet(request, context) as packet:
        workspace_metadata = os.lstat(packet.workspace)
        member_modes = {
            relative_path: stat.S_IMODE(
                os.lstat(packet.workspace / relative_path).st_mode
            )
            for relative_path in packet.extracted_relative_paths
        }
        result = {
            "workspace": str(packet.workspace),
            "workspaceMode": stat.S_IMODE(workspace_metadata.st_mode),
            "workspaceOwner": workspace_metadata.st_uid,
            "memberModes": member_modes,
            "runId": packet.manifest.run_id,
            "frameNames": [
                frame.engine_image_name for frame in packet.engine_request.frames
            ],
            "paths": list(packet.extracted_relative_paths),
        }
    return result


def _run(fixture: _PacketFixture):
    return run_native_engine_child(
        _entrypoint("_extract_packet_probe"),
        fixture.request,
        deadline=_deadline(),
        pinned_files=fixture.pinned_files,
    )


def _load_manifest(fixture: _PacketFixture):
    return load_colmap_packet_manifest(fixture.request, fixture.direct_context())


def _extract_direct_chunk(fixture: _PacketFixture):
    manifest = _load_manifest(fixture)
    ledger = extractor_module._new_extraction_workspace()
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
        result = _run(fixture)
        assert fixture.manifest_handle.tell() == 3
        assert fixture.chunk_handle.tell() == 17
    finally:
        fixture.close()

    assert result["workspaceMode"] == 0o700
    assert result["workspaceOwner"] == os.geteuid()
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
    assert not Path(result["workspace"]).exists()
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []
    assert PACKET_EXTRACTION_QUALIFIED is False


def test_extraction_rejects_parent_process_even_with_valid_pinned_descriptors(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        with (
            pytest.raises(AdapterError, match="dedicated native child") as raised,
            extract_colmap_packet(fixture.request, fixture.direct_context()),
        ):
            pytest.fail("parent process entered the extraction context")
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_BACKEND_DISABLED"


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
    monkeypatch.setattr(extractor_module.tempfile, "mkdtemp", reject_workspace)
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
                        tmp_path,
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
        tmp_path,
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


@pytest.mark.parametrize("failure_target", ("descriptor-close", "workspace-rmdir"))
def test_failed_workspace_creation_surfaces_cleanup_uncertainty(
    tmp_path,
    monkeypatch,
    failure_target,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setattr(extractor_module.tempfile, "tempdir", str(scratch))
    real_fstat = os.fstat
    real_close = os.close
    real_rmdir = os.rmdir
    failed = False

    def wrong_identity(descriptor):
        metadata = real_fstat(descriptor)
        return SimpleNamespace(
            st_dev=metadata.st_dev,
            st_ino=metadata.st_ino + 1,
            st_uid=metadata.st_uid,
            st_mode=metadata.st_mode,
        )

    def inject_close_failure(descriptor):
        nonlocal failed
        if failure_target == "descriptor-close" and not failed:
            failed = True
            real_close(descriptor)
            raise OSError("synthetic workspace descriptor close failure")
        return real_close(descriptor)

    def inject_rmdir_failure(path, *args, **kwargs):
        nonlocal failed
        if (
            failure_target == "workspace-rmdir"
            and not failed
            and Path(path).name.startswith("patina-refine-colmap-packet-")
        ):
            failed = True
            real_rmdir(path, *args, **kwargs)
            raise OSError("synthetic workspace rmdir failure")
        return real_rmdir(path, *args, **kwargs)

    monkeypatch.setattr(extractor_module.os, "fstat", wrong_identity)
    monkeypatch.setattr(extractor_module.os, "close", inject_close_failure)
    monkeypatch.setattr(extractor_module.os, "rmdir", inject_rmdir_failure)
    with pytest.raises(AdapterError, match="cannot (?:close|remove)") as raised:
        extractor_module._new_extraction_workspace()

    assert failed is True
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []


def test_member_parent_close_failure_closes_new_member_descriptor(
    tmp_path,
    monkeypatch,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    monkeypatch.setattr(extractor_module.tempfile, "tempdir", str(scratch))
    ledger = extractor_module._new_extraction_workspace()
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

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert failed is True
    assert member_descriptors
    for descriptor in member_descriptors:
        with pytest.raises(OSError):
            os.fstat(descriptor)
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []


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
            _run(fixture)
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
            _run(fixture)
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
            _run(fixture)
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
            _run(fixture)
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
            _run(fixture)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []


def test_chunk_is_revalidated_after_copy_before_request_parse(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    manifest = _load_manifest(fixture)
    ledger = extractor_module._new_extraction_workspace()
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
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    fixture = _packet_fixture(tmp_path)
    monkeypatch.setattr(extractor_module.tempfile, "tempdir", str(scratch))
    manifest = _load_manifest(fixture)
    ledger = extractor_module._new_extraction_workspace()
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
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert write_count == 2
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []


def test_reopened_request_descriptor_identity_is_revalidated(
    tmp_path,
    monkeypatch,
):
    fixture = _packet_fixture(tmp_path)
    manifest, ledger, _paths, request_payload = _extract_direct_chunk(fixture)
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


@pytest.mark.parametrize(
    "failure_target",
    ("destination", "request-directory", "request"),
)
def test_destination_and_request_close_failures_are_normalized_and_cleaned(
    tmp_path,
    monkeypatch,
    failure_target,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    fixture = _packet_fixture(tmp_path)
    monkeypatch.setattr(extractor_module.tempfile, "tempdir", str(scratch))
    manifest = _load_manifest(fixture)
    ledger = extractor_module._new_extraction_workspace()
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
        fixture.close()
    assert failed
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert list(scratch.glob("patina-refine-colmap-packet-*")) == []


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
            _run(fixture)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.skipif(os.name != "posix", reason="native Refine requires POSIX")
def test_native_request_cannot_supply_a_lookalike_engine_payload(tmp_path):
    fixture = _packet_fixture(tmp_path)
    fixture.request["enginePayload"] = "{}"
    try:
        with pytest.raises(AdapterError, match="unknown or missing field") as raised:
            _run(fixture)
    finally:
        fixture.close()
    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
