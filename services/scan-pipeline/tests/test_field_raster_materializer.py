from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import pytest
from patina_scan_worker.config import DEFAULT_STAGES
from patina_scan_worker.field_raster_materializer import (
    EXPECTED_HEIGHT,
    EXPECTED_WIDTH,
    HELPER_MANIFEST_NAME,
    HELPER_MANIFEST_SCHEMA,
    HELPER_RELATIVE_PATH,
    QUALIFIED_HELPER_SOURCE_SHA256,
    PackagedLibheifFieldRasterMaterializer,
    _copy_pinned_source,
    _materializer_id,
    _open_packaged_source,
    _stream_output,
    _validated_metadata,
)
from patina_scan_worker.refine_adapter import RefineDeadline
from patina_scan_worker.refine_materializer import (
    MaterializerFailureCode,
    RefineMaterializerError,
)
from patina_scan_worker.stages import get_handler


def _deadline(seconds: float = 10.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


class _Source:
    def __init__(self, path: Path) -> None:
        self.handle = path.open("rb")

    def read(self, size: int = -1) -> bytes:
        return self.handle.read(size)

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        return self.handle.seek(offset, whence)

    def tell(self) -> int:
        return self.handle.tell()

    def fileno(self) -> int:
        return self.handle.fileno()

    def close(self) -> None:
        self.handle.close()


class _Destination:
    def __init__(self, *, short: bool = False) -> None:
        self.payload = bytearray()
        self.short = short

    def write(self, payload) -> int:
        data = bytes(payload)
        if self.short:
            return max(0, len(data) - 1)
        self.payload.extend(data)
        return len(data)


def _metadata_lines(**overrides: str) -> str:
    values = {
        "schema": "patina-field-raster-libheif-helper-v2",
        "libheif_version": "1.17.6",
        "decoder_id": "libde265",
        "decoder_name": "libde265 HEVC decoder, version 1.0",
        "decoder_descriptor_count": "1",
        "matching_decoder_descriptor_count": "1",
        "input_mime_type": "image/heic",
        "top_level_images": "1",
        "metadata_blocks": "0",
        "transformation_properties": "1",
        "transformation_property_type": "irot",
        "transformation_rotation_ccw": "0",
        "ispe_width": "360",
        "ispe_height": "640",
        "presented_width": "360",
        "presented_height": "640",
        "raw_width": "360",
        "raw_height": "640",
        "default_width": "360",
        "default_height": "640",
        "raw_default_rgb_identical": "1",
    }
    values.update(overrides)
    return "".join(f"{key}={value}\n" for key, value in values.items())


def _release_with_helper(tmp_path: Path, body: str) -> Path:
    release = tmp_path / "release"
    helper = release / HELPER_RELATIVE_PATH
    helper.parent.mkdir(parents=True)
    helper.write_text(body, encoding="utf-8")
    helper.chmod(0o755)
    helper_payload = helper.read_bytes()
    manifest = helper.with_name(HELPER_MANIFEST_NAME)
    manifest.write_text(
        json.dumps(
            {
                "binarySha256": hashlib.sha256(helper_payload).hexdigest(),
                "compileFlags": [
                    "-std=c11",
                    "-O2",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-D_FORTIFY_SOURCE=3",
                    "-fstack-protector-strong",
                    "-fPIE",
                    "-pie",
                    "-Wl,-z,relro,-z,now",
                    "-x",
                    "c",
                ],
                "compilerPath": "/usr/bin/cc",
                "compilerVersion": "fixture cc 1.0",
                "libheifPackageVersion": "1.17.6-1ubuntu4.6",
                "libheifPkgConfigVersion": "1.17.6",
                "pkgConfigFlags": ["-lheif"],
                "schema": HELPER_MANIFEST_SCHEMA,
                "sourceSha256": QUALIFIED_HELPER_SOURCE_SHA256,
            },
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        + "\n",
        encoding="ascii",
    )
    manifest.chmod(0o644)
    release.chmod(0o755)
    (release / "libexec").chmod(0o755)
    helper.parent.chmod(0o755)
    return release


def _python_helper(tmp_path: Path, *, metadata: str | None = None) -> Path:
    metadata_value = metadata if metadata is not None else _metadata_lines()
    header_literal = repr(b"P6\n360 640\n255\n")
    body = (
        f"#!{sys.executable}\n"
        "import pathlib,sys\n"
        "source=pathlib.Path(sys.argv[1])\n"
        "output=pathlib.Path(sys.argv[2])\n"
        "assert len(source.read_bytes()) >= 12\n"
        f"header={header_literal}\n"
        f"output.write_bytes(header + b'x' * ({EXPECTED_WIDTH} * {EXPECTED_HEIGHT} * 3))\n"
        "output.chmod(0o600)\n"
        f"sys.stdout.write({metadata_value!r})\n"
    )
    return _release_with_helper(tmp_path, body)


def _invoke(
    tmp_path: Path,
    *,
    release: Path,
    destination: _Destination | None = None,
    deadline: RefineDeadline | None = None,
):
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    source_path = tmp_path / "source.heic"
    source_path.write_bytes(b"fake-heic-payload")
    source = _Source(source_path)
    sink = destination or _Destination()
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=scratch,
        release_prefix=release,
    )
    try:
        evidence = adapter.materialize(
            source=source,
            source_name="keyframes/keyframe_000001.heic",
            destination=sink,
            engine_name="frame_000000.ppm",
            encoded_width=EXPECTED_WIDTH,
            encoded_height=EXPECTED_HEIGHT,
            deadline=deadline or _deadline(),
        )
    finally:
        source.close()
    return evidence, sink, scratch


def test_packaged_source_is_the_i92_qualified_source():
    descriptor, digest = _open_packaged_source()
    os.close(descriptor)

    assert digest == QUALIFIED_HELPER_SOURCE_SHA256


def test_validated_metadata_accepts_only_the_qualified_profile():
    values = _validated_metadata(_metadata_lines().encode())

    assert values["schema"] == "patina-field-raster-libheif-helper-v2"
    assert values["transformation_rotation_ccw"] == "0"


@pytest.mark.parametrize(
    ("key", "value"),
    (
        ("schema", "future-schema"),
        ("decoder_id", "ffmpeg"),
        ("metadata_blocks", "1"),
        ("transformation_properties", "0"),
        ("transformation_property_type", "imir"),
        ("transformation_rotation_ccw", "180"),
        ("raw_default_rgb_identical", "0"),
        ("raw_width", "640"),
    ),
)
def test_validated_metadata_rejects_profile_drift(key, value):
    with pytest.raises(RefineMaterializerError) as caught:
        _validated_metadata(_metadata_lines(**{key: value}).encode())

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


def test_materializer_id_rejects_oversized_libheif_version_before_streaming():
    with pytest.raises(RefineMaterializerError) as caught:
        _materializer_id(
            QUALIFIED_HELPER_SOURCE_SHA256,
            "v" * 128,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


def test_wrong_dimensions_fail_before_filesystem_or_helper_access(tmp_path):
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "missing",
        release_prefix=tmp_path / "missing-release",
    )

    with pytest.raises(RefineMaterializerError) as caught:
        adapter.materialize(
            source=object(),
            source_name="keyframes/keyframe.heic",
            destination=object(),
            engine_name="frame.ppm",
            encoded_width=640,
            encoded_height=360,
            deadline=_deadline(),
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert not (tmp_path / "missing").exists()


def test_missing_scratch_parent_maps_to_stable_unqualified_failure(tmp_path):
    release = _python_helper(tmp_path)
    source_path = tmp_path / "source.heic"
    source_path.write_bytes(b"fake-heic-payload")
    source = _Source(source_path)
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "missing",
        release_prefix=release,
    )
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            adapter.materialize(
                source=source,
                source_name="keyframes/keyframe.heic",
                destination=_Destination(),
                engine_name="frame.ppm",
                encoded_width=EXPECTED_WIDTH,
                encoded_height=EXPECTED_HEIGHT,
                deadline=_deadline(),
            )
    finally:
        source.close()

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


def test_helper_binary_must_match_its_release_manifest(tmp_path):
    release = _python_helper(tmp_path)
    helper = release / HELPER_RELATIVE_PATH
    helper.write_bytes(helper.read_bytes() + b"\n# tampered\n")
    helper.chmod(0o755)

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.parametrize("link_kind", ("symlink", "hardlink"))
def test_helper_link_identity_is_rejected(tmp_path, link_kind):
    release = _python_helper(tmp_path)
    helper = release / HELPER_RELATIVE_PATH
    if link_kind == "symlink":
        target = helper.with_name("helper-target")
        helper.rename(target)
        helper.symlink_to(target.name)
    else:
        os.link(helper, helper.with_name("helper-hardlink"))

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert list((tmp_path / "scratch").iterdir()) == []


def test_copy_uses_only_the_pinned_descriptor_bytes(tmp_path):
    pinned_path = tmp_path / "pinned.heic"
    pinned_path.write_bytes(b"A" * 16)
    destination_path = tmp_path / "copied.heic"

    class SplitSource:
        def __init__(self) -> None:
            self.handle = pinned_path.open("rb")

        def fileno(self) -> int:
            return self.handle.fileno()

        def seek(self, *_args) -> int:
            return 0

        def read(self, *_args) -> bytes:
            return b"B" * 16

    source = SplitSource()
    destination_fd = os.open(
        destination_path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o600,
    )
    try:
        _copy_pinned_source(source, destination_fd, deadline=_deadline())
    finally:
        os.close(destination_fd)
        source.handle.close()

    assert destination_path.read_bytes() == b"A" * 16


def test_stream_output_unlinks_then_preserves_exact_canonical_ppm(tmp_path):
    output = tmp_path / "output.ppm"
    expected = b"P6\n360 640\n255\n" + b"x" * (EXPECTED_WIDTH * EXPECTED_HEIGHT * 3)
    output.write_bytes(expected)
    output.chmod(0o600)
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    try:
        _stream_output(directory_fd, destination, deadline=_deadline())
    finally:
        os.close(directory_fd)

    assert not output.exists()
    assert destination.payload == expected


def test_stream_output_close_uncertainty_fails_closed(
    tmp_path,
    monkeypatch,
):
    output = tmp_path / "output.ppm"
    expected = b"P6\n360 640\n255\n" + b"x" * (EXPECTED_WIDTH * EXPECTED_HEIGHT * 3)
    output.write_bytes(expected)
    output.chmod(0o600)
    output_inode = output.stat().st_ino
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    original_close = os.close
    held: list[int] = []

    def close_with_injected_failure(descriptor: int) -> None:
        try:
            metadata = os.fstat(descriptor)
        except OSError:
            return original_close(descriptor)
        if metadata.st_ino == output_inode and not held:
            held.append(descriptor)
            raise OSError("injected output close failure")
        return original_close(descriptor)

    monkeypatch.setattr(os, "close", close_with_injected_failure)
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            _stream_output(directory_fd, destination, deadline=_deadline())
    finally:
        monkeypatch.setattr(os, "close", original_close)
        for descriptor in held:
            original_close(descriptor)
        original_close(directory_fd)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert "cleanup uncertainty" in str(caught.value)
    assert destination.payload == expected


@pytest.mark.parametrize("failure", ("mode", "header", "short"))
def test_stream_output_rejects_noncanonical_ppm_before_destination(
    tmp_path,
    failure,
):
    output = tmp_path / "output.ppm"
    header = b"P3\n360 640\n255\n" if failure == "header" else b"P6\n360 640\n255\n"
    pixels = EXPECTED_WIDTH * EXPECTED_HEIGHT * 3
    if failure == "short":
        pixels -= 1
    output.write_bytes(header + b"x" * pixels)
    output.chmod(0o644 if failure == "mode" else 0o600)
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            _stream_output(directory_fd, destination, deadline=_deadline())
    finally:
        os.close(directory_fd)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""


@pytest.mark.skipif(
    sys.platform != "linux",
    reason="the production adapter intentionally requires Linux /proc/self/fd",
)
def test_linux_adapter_streams_validated_unlinked_ppm_and_cleans_scratch(tmp_path):
    release = _python_helper(tmp_path)

    evidence, destination, scratch = _invoke(tmp_path, release=release)

    assert evidence.source_width == EXPECTED_WIDTH
    assert evidence.source_height == EXPECTED_HEIGHT
    assert evidence.output_width == EXPECTED_WIDTH
    assert evidence.output_height == EXPECTED_HEIGHT
    assert QUALIFIED_HELPER_SOURCE_SHA256[:12] in evidence.materializer_id
    assert destination.payload.startswith(b"P6\n360 640\n255\n")
    assert len(destination.payload) == (
        len(b"P6\n360 640\n255\n") + EXPECTED_WIDTH * EXPECTED_HEIGHT * 3
    )
    assert list(scratch.iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_rejects_helper_metadata_drift_without_destination(tmp_path):
    release = _python_helper(
        tmp_path,
        metadata=_metadata_lines(transformation_rotation_ccw="180"),
    )
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, destination=destination)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_rejects_loaded_libheif_version_different_from_manifest(
    tmp_path,
):
    release = _python_helper(
        tmp_path,
        metadata=_metadata_lines(libheif_version="1.17.7"),
    )
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, destination=destination)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert "differs from the qualified helper manifest" in str(caught.value)
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_preserves_bounded_destination_short_write(tmp_path):
    release = _python_helper(tmp_path)
    destination = _Destination(short=True)

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, destination=destination)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_timeout_kills_helper_process_group_and_leaves_no_late_marker(
    tmp_path,
):
    marker = tmp_path / "late-marker"
    body = (
        "#!/bin/sh\n"
        "trap '' TERM\n"
        f"(trap '' TERM; sleep 1; printf late > {marker}) &\n"
        "while :; do sleep 1; done\n"
    )
    release = _release_with_helper(tmp_path, body)
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(
            tmp_path,
            release=release,
            destination=destination,
            deadline=_deadline(0.2),
        )

    assert caught.value.code is MaterializerFailureCode.DEADLINE
    time.sleep(1.1)
    assert not marker.exists()
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_successful_leader_cannot_leave_a_detached_late_writer(tmp_path):
    marker = tmp_path / "late-marker"
    body = (
        "#!/bin/sh\n"
        f"(exec >/dev/null 2>&1; sleep 1; printf late > {marker}) &\n"
        "exit 0\n"
    )
    release = _release_with_helper(tmp_path, body)
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, destination=destination)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    time.sleep(1.1)
    assert not marker.exists()
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_helper_stdout_overflow_is_bounded_and_killed(tmp_path):
    body = (
        f"#!{sys.executable}\n"
        "import sys\n"
        "sys.stdout.buffer.write(b'x' * 70000)\n"
        "sys.stdout.buffer.flush()\n"
    )
    release = _release_with_helper(tmp_path, body)
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, destination=destination)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


def test_adapter_remains_disabled_and_refine_unregistered():
    assert PackagedLibheifFieldRasterMaterializer.production_enablement == "disabled"
    assert DEFAULT_STAGES == "ingest,solve,drawings"
    assert get_handler("scan_pipeline.refine") is None
