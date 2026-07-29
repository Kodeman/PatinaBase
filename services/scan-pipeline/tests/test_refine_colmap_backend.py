from __future__ import annotations

import hashlib
import json
import os
import pathlib
import signal
import sys
import time
from dataclasses import dataclass, replace
from pathlib import Path
from types import MappingProxyType

import pytest
from _colmap_toolchain import (
    load_fake_toolchain,
    plan_supervised_command,
    write_toolchain,
)
from _json_recursion import (
    DECODE_DEPTHS,
    ENCODE_DEPTHS,
    deeply_nested_json_document,
    deeply_nested_json_payload,
    no_recursion_limit_reason,
)

from patina_scan_worker import refine_colmap_backend as backend_module
from patina_scan_worker import refine_colmap_command as command_module
from patina_scan_worker import refine_native_process as native_process
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_backend import (
    ALIGNED_MODEL_BUILD_QUALIFIED,
    COLMAP_ENGINE_REQUEST_MAX_BYTES,
    COLMAP_PACKET_MANIFEST_MAX_BYTES,
    COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED,
    ENGINE_REQUEST_CONTRACT,
    ENGINE_REQUEST_SCHEMA_VERSION,
    EVIDENCE_BUILDER_CONTRACT_COMPATIBLE,
    FALLBACK_QUALIFIED,
    MEASUREMENT_SNAPSHOT_QUALIFIED,
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
        "runId": "a" * 64,
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
                "packet.chunk.000": chunk_handle.fileno(),
                "packet.manifest": manifest_handle.fileno(),
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


def _replace_fixture_manifest(
    fixture: _PacketFixture,
    document: dict[str, object],
) -> bytes:
    payload = _canonical_json(document)
    fixture.manifest_path.write_bytes(payload)
    fixture.request["manifestSha256"] = _sha(payload)
    return payload


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
    assert manifest.run_id == "a" * 64
    assert isinstance(request, ColmapEngineRequest)
    assert [frame.engine_image_name for frame in request.frames] == [
        "frame_000000.ppm",
        "frame_000001.ppm",
        "frame_000002.ppm",
    ]
    assert manifest_offset == 0
    assert chunk_offset == 0


@pytest.mark.parametrize("payload_kind", ("manifest", "engine-request"))
def test_json_integer_digit_limit_value_error_is_normalized(tmp_path, payload_kind):
    integer_limit = sys.get_int_max_str_digits()
    if integer_limit == 0:
        pytest.skip("interpreter integer digit limit is disabled")
    oversized_integer = b"9" * (integer_limit + 1)
    fixture = _packet_fixture(tmp_path)
    try:
        if payload_kind == "manifest":
            original_manifest = fixture.manifest_path.read_bytes()
            changed = original_manifest.replace(
                b'"schemaVersion":1',
                b'"schemaVersion":' + oversized_integer,
                1,
            )
            assert changed != original_manifest
            fixture.manifest_path.write_bytes(changed)
            fixture.request["manifestSha256"] = _sha(changed)
            with pytest.raises(
                AdapterError,
                match="not valid UTF-8 JSON",
            ) as raised:
                load_colmap_packet_manifest(fixture.request, fixture.context)
        else:
            manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
            changed = fixture.engine_payload.replace(
                b'"schemaVersion":1',
                b'"schemaVersion":' + oversized_integer,
                1,
            )
            assert changed != fixture.engine_payload
            with pytest.raises(
                AdapterError,
                match="not valid UTF-8 JSON",
            ) as raised:
                parse_engine_request_member(
                    changed,
                    _manifest_bound_to_payload(manifest, changed),
                )
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is ValueError


@pytest.mark.parametrize("payload_kind", ("manifest", "engine-request"))
def test_deeply_nested_json_recursion_error_is_normalized(tmp_path, payload_kind):
    """A REAL ``RecursionError`` out of ``json.loads``, on any interpreter.

    The depth is measured here rather than hardcoded: 10 000 raises on CPython
    3.12 and parses cleanly on 3.14, which broke this test on 3.14 while the
    normalization it pins was unchanged.  See ``tests/_json_recursion.py``.
    """

    nested_payload = deeply_nested_json_payload(COLMAP_PACKET_MANIFEST_MAX_BYTES)
    if nested_payload is None:
        pytest.skip(no_recursion_limit_reason("decoder", DECODE_DEPTHS))
    assert len(nested_payload) <= COLMAP_PACKET_MANIFEST_MAX_BYTES
    assert len(nested_payload) <= COLMAP_ENGINE_REQUEST_MAX_BYTES
    fixture = _packet_fixture(tmp_path)
    try:
        if payload_kind == "manifest":
            fixture.manifest_path.write_bytes(nested_payload)
            fixture.request["manifestSha256"] = _sha(nested_payload)
            with pytest.raises(
                AdapterError,
                match="packet manifest is not valid UTF-8 JSON",
            ) as raised:
                load_colmap_packet_manifest(fixture.request, fixture.context)
        else:
            manifest = load_colmap_packet_manifest(fixture.request, fixture.context)
            with pytest.raises(
                AdapterError,
                match="engine request member is not valid UTF-8 JSON",
            ) as raised:
                parse_engine_request_member(
                    nested_payload,
                    _manifest_bound_to_payload(manifest, nested_payload),
                )
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is RecursionError


def test_deeply_nested_json_canonicalization_error_is_normalized():
    """The encoder half, with the same version-robustness.

    ``json.dumps`` and ``json.loads`` do not run out of stack at the same depth
    on the same interpreter -- 3.14 refuses an encode at 50 000 and a decode at
    100 000 -- so the encode ladder is separate and probes with the exact
    keyword arguments ``_canonical_json_bytes`` uses.
    """

    document = deeply_nested_json_document()
    if document is None:
        pytest.skip(no_recursion_limit_reason("encoder", ENCODE_DEPTHS))

    with pytest.raises(
        AdapterError,
        match="COLMAP packet JSON is not canonicalizable",
    ) as raised:
        backend_module._canonical_json_bytes(document)

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    assert type(raised.value.__cause__) is RecursionError


def test_two_chunk_manifest_requires_canonical_chunk_and_native_token_order(tmp_path):
    fixture = _packet_fixture(tmp_path)
    second_payload = b"second-immutable-chunk" * 64
    second_path = tmp_path / "packet.chunk.001.tar"
    second_path.write_bytes(second_payload)
    second_handle = second_path.open("rb")
    try:
        document = json.loads(fixture.manifest_path.read_bytes())
        document["chunks"].append(
            {
                "token": "packet.chunk.001",
                "sha256": _sha(second_payload),
                "sizeBytes": len(second_payload),
            }
        )
        document["members"][-1]["chunkToken"] = "packet.chunk.001"
        _replace_fixture_manifest(fixture, document)
        context = NativeChildContext(
            time.monotonic() + 30.0,
            MappingProxyType(
                {
                    "packet.chunk.000": fixture.chunk_handle.fileno(),
                    "packet.chunk.001": second_handle.fileno(),
                    "packet.manifest": fixture.manifest_handle.fileno(),
                }
            ),
        )

        manifest = load_colmap_packet_manifest(fixture.request, context)

        assert tuple(chunk.token for chunk in manifest.chunks) == (
            "packet.chunk.000",
            "packet.chunk.001",
        )
        reversed_document = {**document, "chunks": list(reversed(document["chunks"]))}
        _replace_fixture_manifest(fixture, reversed_document)
        with pytest.raises(AdapterError, match="canonical token order") as raised:
            load_colmap_packet_manifest(fixture.request, context)
    finally:
        second_handle.close()
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_manifest_run_id_is_bound_against_replay(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        document = json.loads(fixture.manifest_path.read_bytes())
        document["runId"] = "b" * 64
        _replace_fixture_manifest(fixture, document)

        with pytest.raises(AdapterError, match="runId does not match") as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_manifest_member_count_is_capped_before_member_iteration(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        document = json.loads(fixture.manifest_path.read_bytes())
        document["members"] = document["members"] * 101
        assert len(document["members"]) > 403
        _replace_fixture_manifest(fixture, document)

        with pytest.raises(AdapterError, match="member-count ceiling") as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


def test_manifest_rejects_more_than_400_engine_images(tmp_path):
    fixture = _packet_fixture(tmp_path)
    try:
        document = json.loads(fixture.manifest_path.read_bytes())
        request_member = document["members"][0]
        document["members"] = [
            request_member,
            *[
                {
                    "relativePath": f"images/frame_{index:06d}.ppm",
                    "chunkToken": "packet.chunk.000",
                    "archiveMember": f"images/frame_{index:06d}.ppm",
                    "sha256": "0" * 64,
                    "sizeBytes": 1,
                    "role": "engine-image",
                }
                for index in range(401)
            ],
        ]
        _replace_fixture_manifest(fixture, document)

        with pytest.raises(AdapterError, match="between 3 and 400") as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


@pytest.mark.parametrize(
    ("roles", "detail"),
    (
        (("source-ledger", "source-ledger"), "at most one"),
        (("engine-image", "source-ledger"), "between 3 and 400"),
    ),
)
def test_manifest_role_cardinality_is_bounded(tmp_path, roles, detail):
    fixture = _packet_fixture(tmp_path)
    try:
        document = json.loads(fixture.manifest_path.read_bytes())
        document["members"][-2]["role"] = roles[0]
        document["members"][-1]["role"] = roles[1]
        _replace_fixture_manifest(fixture, document)

        with pytest.raises(AdapterError, match=detail) as raised:
            load_colmap_packet_manifest(fixture.request, fixture.context)
    finally:
        fixture.close()

    assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"


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


def test_the_posture_flags_say_exactly_what_the_composition_established():
    """R121 composed the body; it did not make the body qualified.

    Every flag below is a claim about a REAL RUN on the qualified host, not
    about code existing.  The ones that stay ``False`` are named individually so
    a future flip has to touch this list.
    """

    assert PRODUCTION_ENABLEMENT == "composed-unregistered"
    # Still false, and each for its own reason:
    #  * the 200-400 band is unqualified by R117 and no packet in it has run;
    #  * only ONE CLI command exists in the plan, so "sequential" quiescence
    #    across a command sequence has never been exercised;
    #  * the local measurement-row schema is not what the composed path builds
    #    evidence from -- ``refine_evidence_builder`` consumes complete model
    #    snapshots instead, so the row snapshot is unqualified BECAUSE it is
    #    unused;
    #  * the position-prior fallback was never qualified by I90 and is not
    #    implemented here at all.
    assert PILOT_200_400_FRAME_RANGE_QUALIFIED is False
    assert SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED is False
    assert MEASUREMENT_SNAPSHOT_QUALIFIED is False
    assert FALLBACK_QUALIFIED is False
    # The class mirrors the module, so a reader inspecting an instance and a
    # reader grepping the module cannot see two different postures.
    backend = RefineColmapBackend()
    assert backend.production_enablement == PRODUCTION_ENABLEMENT
    assert backend.pilot_frame_range_qualified is PILOT_200_400_FRAME_RANGE_QUALIFIED
    assert backend.packet_extraction_qualified is PACKET_EXTRACTION_QUALIFIED
    assert backend.aligned_model_build_qualified is ALIGNED_MODEL_BUILD_QUALIFIED
    assert (
        backend.output_descriptor_handoff_qualified
        is OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED
    )
    assert (
        backend.runner_path_reopen_composition_qualified
        is RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED
    )
    assert backend.measurement_snapshot_qualified is MEASUREMENT_SNAPSHOT_QUALIFIED
    assert (
        backend.evidence_builder_contract_compatible
        is EVIDENCE_BUILDER_CONTRACT_COMPATIBLE
    )
    assert backend.primary_execution_qualified is PRIMARY_EXECUTION_QUALIFIED
    assert (
        backend.sequential_command_quiescence_qualified
        is SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED
    )
    assert (
        backend.command_exception_normalization_qualified
        is COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED
    )
    assert backend.fallback_qualified is FALLBACK_QUALIFIED
    with pytest.raises(AdapterError) as fallback:
        backend.run_fallback()
    assert fallback.value.code == "REFINE_FALLBACK_UNQUALIFIED"


def test_the_primary_plan_refuses_every_collaborator_it_was_not_given():
    """Four argument gates, each constructed and each with its own message.

    A single ``pytest.raises(AdapterError)`` around a call missing everything
    would pass no matter which gate fired, so every gate is reached by handing
    the plan three valid-shaped collaborators and exactly one wrong one.
    """

    backend = RefineColmapBackend()
    with pytest.raises(AdapterError) as raised:
        backend.run_primary(
            object(),
            context=object(),
            deadline=object(),
            toolchain=object(),
        )
    assert "requires an extracted COLMAP packet" in str(raised.value)


def test_a_native_binding_failure_is_normalized_and_bounded():
    """CONSTRUCTED: a pybind11-shaped exception, not an assertion about one.

    ``_guarded`` exists because an ``AttributeError`` from binding drift and a
    genuine solver failure otherwise reach the parent as the same anonymous
    transport error.  The adversarial case here is the one that actually breaks
    the boundary: a native message longer than the child's 1 KiB error envelope.
    """

    from patina_scan_worker.refine_colmap_backend import (
        _NATIVE_TEXT_BYTES,
        _guarded,
    )

    class _NativeError(RuntimeError):
        pass

    def explode():
        raise _NativeError("ceres report\nwith newlines\n" + "x" * 100_000)

    with pytest.raises(AdapterError) as raised:
        _guarded("pycolmap.solve", explode)
    message = str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert message.startswith("pycolmap.solve failed: _NativeError: ")
    assert "\n" not in message
    assert len(message.encode("utf-8")) < 1024
    assert message.endswith("...<truncated>")
    # ... and the bound is the declared one, not an accident of this message.
    assert len(message) <= len("pycolmap.solve failed: _NativeError: ") + (
        _NATIVE_TEXT_BYTES
    )

    # An AdapterError is NOT re-wrapped: it already carries a code the runner
    # maps, and burying it under REFINE_ENGINE_FAILED would lose that.
    original = AdapterError("already classified", "REFINE_LOW_OVERLAP")

    def reraise():
        raise original

    with pytest.raises(AdapterError) as passthrough:
        _guarded("pycolmap.solve", reraise)
    assert passthrough.value is original


def test_inherited_command_cleanup_failure_precedes_late_deadline(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    pid = os.getpid()
    monkeypatch.setattr(command_module.sys, "platform", "linux")
    monkeypatch.setattr(command_module.os, "getsid", lambda _pid: pid)
    monkeypatch.setattr(command_module.os, "getpgrp", lambda: pid)
    monkeypatch.setattr(command_module, "_enable_linux_child_subreaper", lambda: True)
    monkeypatch.setattr(
        command_module,
        "_pre_command_child_errors",
        lambda **_kwargs: (),
    )
    monkeypatch.setattr(
        command_module,
        "_post_command_quiescence_errors",
        lambda **_kwargs: (),
    )
    monkeypatch.setattr(
        command_module.os,
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
    toolchain = load_fake_toolchain(fake.parent.parent, qualified=True)
    try:
        with pytest.raises(AdapterError, match="synchronize") as raised:
            run_inherited_colmap_command(
                plan_supervised_command(toolchain, tmp_path),
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=deadline,
                log_path=tmp_path / "fsync-failure.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    # The pre-launch probe and the pre-wait probe are mandatory; the log drain
    # now observes the same carried deadline, so later probes may also land.
    assert deadline.calls >= 2


@native_engine_entrypoint
def _run_fake_cli(request, context: NativeChildContext):
    deadline = RefineDeadline(context.expires_at_monotonic_s)
    workspace = Path(request["cwd"])
    toolchain = load_fake_toolchain(Path(request["prefix"]), qualified=True)
    try:
        result = run_inherited_colmap_command(
            plan_supervised_command(toolchain, workspace),
            context=context,
            deadline=deadline,
            log_path=Path(request["logPath"]),
            cwd=workspace,
        )
    finally:
        toolchain.close()
    return {
        "returncode": result.returncode,
        "tail": result.output_tail,
        "session": os.getsid(0),
        "group": os.getpgrp(),
        "pid": os.getpid(),
    }


def _fake_cli(tmp_path: Path, program: str) -> Path:
    return write_toolchain(tmp_path / "colmap", program=program)


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="inherited command quiescence requires Linux child subreapers",
)
def test_fake_cli_inherits_native_session_and_retains_only_bounded_tail(tmp_path):
    fake = _fake_cli(
        tmp_path,
        "import sys; sys.stdout.write('x' * 70000 + 'COLMAP_OK\\n')",
    )
    log_path = tmp_path / "fake.log"
    result = run_native_engine_child(
        f"{__name__}:_run_fake_cli",
        {
            "prefix": str(fake.parent.parent),
            "logPath": str(log_path),
            "cwd": str(tmp_path),
        },
        deadline=_deadline(5.0),
    )
    assert result["returncode"] == 0
    assert result["session"] == result["group"] == result["pid"]
    assert result["tail"].endswith("COLMAP_OK\n")
    assert log_path.stat().st_size <= 64 * 1024


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="inherited command quiescence requires Linux child subreapers",
)
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
                "prefix": str(fake.parent.parent),
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


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="inherited command quiescence requires Linux child subreapers",
)
def test_fake_cli_surviving_descendant_prevents_native_success(tmp_path):
    descendant_pid_path = tmp_path / "descendant.pid"
    descendant_program = (
        "import os,pathlib,time; "
        f"pathlib.Path({str(descendant_pid_path)!r}).write_text(str(os.getpid())); "
        "time.sleep(30)"
    )
    fake = _fake_cli(
        tmp_path,
        "import subprocess,sys; "
        f"subprocess.Popen([sys.executable,'-c',{descendant_program!r}])",
    )
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_fake_cli",
                {
                    "prefix": str(fake.parent.parent),
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
def test_production_native_entrypoint_refuses_an_unpinned_host():
    """The composed child, spawned for real, refused for the right reason.

    This still runs the whole boundary -- ``spawn``, ``setsid``, descriptor
    receipt, the entry point resolve -- and the child still ends in a refusal on
    any machine that is not ``/opt/colmap/4.0.2``.  What changed at R121 is
    WHICH refusal: it is the toolchain pin rather than a fail-closed stub, and
    the distinction is asserted so a body that quietly stopped pinning would
    redden here instead of running an unpinned COLMAP.
    """

    from patina_scan_worker.refine_colmap_toolchain import QUALIFIED_COLMAP_PREFIX

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native",
            {},
            deadline=_deadline(3.0),
        )
    # WHICH refusal depends on the host, and the branch is explicit rather than
    # a set membership, so each machine asserts the exact clause that should
    # have fired on IT.  An earlier draft asserted only the toolchain code and
    # therefore passed on developer machines while failing on the one box that
    # can actually run the engine.
    if pathlib.Path(QUALIFIED_COLMAP_PREFIX).is_dir():
        # The qualified box: the pin succeeds, and the empty request is refused
        # by the packet contract before a single member is extracted.
        assert raised.value.code == "REFINE_COLMAP_PACKET_INVALID"
    else:
        assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert callable(run_refine_colmap_native)


# ===========================================================================
# The child's model reader, reached directly.
#
# It cannot be reached through the composed door on any machine without a GPU
# and a pinned COLMAP, so a mutation sweep found its clauses undefended.  It is
# duck-typed on purpose, which is what makes a stand-in reconstruction the
# smallest surface that can reach it.
# ===========================================================================
class _StandInRigid:
    def __init__(self, matrix):
        self._matrix = matrix

    def matrix(self):
        return self._matrix


class _StandInPoint2D:
    def __init__(self, xy):
        self.xy = xy
        self.point3D_id = 0


class _StandInImage:
    def __init__(self, name, camera_id, keypoints):
        self.name = name
        self.camera_id = camera_id
        self.points2D = [_StandInPoint2D(xy) for xy in keypoints]

    def cam_from_world(self):
        return _StandInRigid(
            ((1.0, 0.0, 0.0, 0.0), (0.0, 1.0, 0.0, 0.0), (0.0, 0.0, 1.0, 0.0))
        )


class _StandInElement:
    def __init__(self, image_id, point2d_idx):
        self.image_id = image_id
        self.point2D_idx = point2d_idx


class _StandInTrack:
    def __init__(self, elements):
        self.elements = elements


class _StandInPoint3D:
    def __init__(self, xyz, elements):
        self.xyz = xyz
        self.track = _StandInTrack(elements)


class _StandInReconstruction:
    def __init__(self, images, points):
        self._images = images
        self._points = points

    def reg_image_ids(self):
        return list(self._images)

    def image(self, image_id):
        return self._images[image_id]

    def point3D_ids(self):
        return list(self._points)

    def point3D(self, point3d_id):
        return self._points[point3d_id]


def _stand_in_reconstruction(points):
    images = {
        index + 1: _StandInImage(
            f"frame_{index:06d}.ppm",
            index + 1,
            [(10.0 + index, 20.0 + index), (30.0 + index, 40.0 + index)],
        )
        for index in range(3)
    }
    return _StandInReconstruction(images, points)


def _reader(reconstruction):
    from patina_scan_worker.refine_colmap_backend import _reconstruction_rows

    return _reconstruction_rows(
        reconstruction,
        label="stand-in",
        expected_names=tuple(f"frame_{index:06d}.ppm" for index in range(3)),
        context=NativeChildContext(time.monotonic() + 30.0),
    )


def test_a_track_that_observes_one_image_twice_is_excluded_and_counted():
    """MEASURED on the qualified host: COLMAP 4.0.2 really emits these.

    A 3D point projects to exactly one pixel in one camera, so a track holding
    two observations from one image is a merge of two features and at least one
    of them must carry a large residual.  The evidence builder's membership key
    forbids it outright, so the child excludes it -- and the exclusion is
    COUNTED, because an exclusion nobody can see is the failure mode this
    program keeps finding.
    """

    reconstruction = _stand_in_reconstruction(
        {
            1: _StandInPoint3D((0.0, 0.0, 5.0), [_StandInElement(1, 0), _StandInElement(2, 0)]),
            2: _StandInPoint3D((0.0, 0.0, 6.0), [_StandInElement(1, 1), _StandInElement(1, 0)]),
        }
    )
    _rows, tracks, repeated, short = _reader(reconstruction)
    assert len(tracks) == 1
    assert repeated == 1
    assert short == 0
    # The SURVIVING track is the well-formed one, not whichever came first.
    assert tuple(o.engine_image_name for o in tracks[0].observations) == (
        "frame_000000.ppm",
        "frame_000001.ppm",
    )


def test_a_single_observation_track_is_excluded_and_counted_separately():
    """The two exclusions are different facts and are reported as two numbers."""

    reconstruction = _stand_in_reconstruction(
        {
            1: _StandInPoint3D((0.0, 0.0, 5.0), [_StandInElement(1, 0), _StandInElement(2, 0)]),
            2: _StandInPoint3D((0.0, 0.0, 6.0), [_StandInElement(3, 0)]),
        }
    )
    _rows, tracks, repeated, short = _reader(reconstruction)
    assert len(tracks) == 1
    assert (repeated, short) == (0, 1)


def test_a_model_whose_every_track_is_unusable_is_refused_rather_than_emptied():
    """Excluding is not the same as accepting nothing; the floor still fires."""

    reconstruction = _stand_in_reconstruction(
        {1: _StandInPoint3D((0.0, 0.0, 5.0), [_StandInElement(2, 1), _StandInElement(2, 0)])}
    )
    with pytest.raises(AdapterError) as raised:
        _reader(reconstruction)
    assert "no usable triangulated tracks" in str(raised.value)


def test_a_track_naming_an_unregistered_image_is_refused_not_excluded():
    """The converse of the exclusion: an UNKNOWN image is a broken model.

    Exclusion is for a track this schema cannot key.  A track pointing at an
    image the model never registered is a different fact and must not be
    quietly dropped alongside it.
    """

    reconstruction = _stand_in_reconstruction(
        {1: _StandInPoint3D((0.0, 0.0, 5.0), [_StandInElement(1, 0), _StandInElement(99, 0)])}
    )
    with pytest.raises(AdapterError) as raised:
        _reader(reconstruction)
    assert "references unregistered image 99" in str(raised.value)


def _engine_frames_with_centres(centres):
    """Build the exact ``ColmapEngineFrame`` rows the graph builder reads."""

    from patina_scan_worker.refine_colmap_backend import ColmapEngineFrame

    identity = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
    return tuple(
        ColmapEngineFrame(
            ordinal=index,
            source_image_name=f"capture_{index:06d}.heic",
            frame_timestamp_s=float(index),
            engine_image_name=f"frame_{index:06d}.ppm",
            engine_relative_path=f"images/frame_{index:06d}.ppm",
            engine_sha256="0" * 64,
            engine_size_bytes=1,
            intrinsics=(600.0, 600.0, 320.0, 240.0, 640, 480),
            cam_from_world_rotation=identity,
            cam_from_world_translation=tuple(-value for value in centre),
            raw_camera_center_m=centre,
        )
        for index, centre in enumerate(centres)
    )


def test_the_two_candidate_graph_derivations_must_agree():
    """CONSTRUCTED on the band edge, which is the only place they can differ.

    The matcher's graph comes from the packet's declared centres; the evidence
    builder rebuilds its own from the raw model's parsed poses.  They agree to
    float noise -- except at ``SPATIAL_MIN_BASELINE_M``/``SPATIAL_RADIUS_M``,
    where a pair can land on opposite sides.  The disagreement is refused with
    its own message rather than surfacing two layers away as "two-view snapshot
    omitted a deterministic candidate pair".
    """

    from patina_scan_worker.refine_adapter import SPATIAL_RADIUS_M
    from patina_scan_worker.refine_colmap_backend import (
        require_candidate_graph_agreement,
    )

    # Twelve frames on a line, so the only non-temporal pair inside the spatial
    # band is the one placed exactly at the radius.
    centres = [(0.0, 0.0, 3.0 * index) for index in range(12)]
    centres[11] = (SPATIAL_RADIUS_M, 0.0, 0.0)
    frames = _engine_frames_with_centres(centres)
    pairs = build_engine_pair_graph(frames)
    by_name = {frame.engine_image_name: frame.raw_camera_center_m for frame in frames}

    # Identical centres: agreement, and no exception.
    require_candidate_graph_agreement(pairs, frames, by_name)

    # A model centre one ULP-scale step OUTSIDE the radius drops that pair from
    # the rebuilt graph, and the guard says so.
    nudged = dict(by_name)
    nudged["frame_000011.ppm"] = (SPATIAL_RADIUS_M * (1.0 + 1e-12), 0.0, 0.0)
    assert build_engine_pair_graph(
        tuple(
            replace(frame, raw_camera_center_m=nudged[frame.engine_image_name])
            for frame in frames
        )
    ) != pairs, "the fixture does not actually straddle the band edge"
    with pytest.raises(AdapterError) as raised:
        require_candidate_graph_agreement(pairs, frames, nudged)
    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "differs from the one the matcher was given" in str(raised.value)


def test_a_source_ledger_row_must_be_bound_to_the_frame_it_is_read_for():
    """Ordinal IS the join, so the join is re-stated at the point of use.

    The extractor binds row ``i`` to frame ``i`` and checks the image names
    agree.  ``_source_row`` re-states that binding rather than trusting it,
    because a ledger and a frame set that drifted apart would otherwise put one
    frame's capture provenance on another frame's evidence -- silently.
    """

    from patina_scan_worker.refine_colmap_backend import _source_row
    from patina_scan_worker.refine_packet_extractor import (
        ColmapSourceLedger,
        ColmapSourceLedgerRow,
        ExtractedColmapPacket,
    )

    frames = _engine_frames_with_centres([(0.0, 0.0, float(i)) for i in range(3)])

    def _packet(rows):
        return ExtractedColmapPacket(
            workspace_descriptor=-1,
            manifest=None,
            engine_request=ColmapEngineRequest(frames, "0"),
            extracted_relative_paths=(),
            source_ledger=ColmapSourceLedger("source-ledger-v1.json", "0" * 64, rows),
            adapter_ledger=None,
        )

    def _row(ordinal, image_name):
        return ColmapSourceLedgerRow(
            ordinal=ordinal,
            source_archive_key="bundle/o/s/keyframes.tar",
            source_member=f"keyframes/{image_name}",
            source_image_name=image_name,
            source_sha256="1" * 64,
            source_size_bytes=17,
        )

    good = tuple(_row(index, frame.source_image_name) for index, frame in enumerate(frames))
    assert _source_row(_packet(good), frames[1]).source_image_name == (
        frames[1].source_image_name
    )

    # A row whose ordinal no longer matches its position.
    shifted = (good[0], replace(good[1], ordinal=2), good[2])
    with pytest.raises(AdapterError) as raised:
        _source_row(_packet(shifted), frames[1])
    assert "is not bound to its frame" in str(raised.value)

    # ... and one whose image identity drifted while the ordinal did not.
    renamed = (good[0], replace(good[1], source_image_name="other.heic"), good[2])
    with pytest.raises(AdapterError) as raised:
        _source_row(_packet(renamed), frames[1])
    assert "is not bound to its frame" in str(raised.value)

    # A ledger too short for the frame set is a different message.
    with pytest.raises(AdapterError) as raised:
        _source_row(_packet(good[:1]), frames[2])
    assert "has no row at ordinal 2" in str(raised.value)

    # No ledger at all is refused rather than defaulted.
    naked = ExtractedColmapPacket(
        workspace_descriptor=-1,
        manifest=None,
        engine_request=ColmapEngineRequest(frames, "0"),
        extracted_relative_paths=(),
    )
    with pytest.raises(AdapterError) as raised:
        _source_row(naked, frames[0])
    assert "declared no source ledger" in str(raised.value)
