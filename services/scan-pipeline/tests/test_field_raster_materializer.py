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
    HELPER_MANIFEST_NAME,
    HELPER_MANIFEST_SCHEMA,
    HELPER_RELATIVE_PATH,
    QUALIFIED_HELPER_SOURCE_SHA256,
    REFERENCE_DESIGN_ENCODED_PROFILE,
    FieldRasterProfile,
    PackagedLibheifFieldRasterMaterializer,
    _copy_pinned_source,
    _materializer_id,
    _MAX_PROFILE_DIMENSION,
    _MAX_PROFILE_PPM_BYTES,
    _open_packaged_source,
    _stream_output,
    _validated_metadata,
)
from patina_scan_worker.field_raster_qualification import LIBHEIF_HELPER_SCHEMA
from patina_scan_worker.refine_adapter import RefineDeadline
from patina_scan_worker.refine_materializer import (
    MaterializerFailureCode,
    RefineMaterializerError,
)
from patina_scan_worker.stages import get_handler

# TEST DATA, not a contract. 1440x1920 is the encoded pair observed on scan
# 95266be1's keyframe index — one device, one scan. It lives here rather than
# in the module because capture resolution is not a code constant (ARKit picks
# the format; the recorder stamps it per keyframe), and writing it into the
# adapter is the exact defect R118 corrects. Its only job here is to be a
# second, differently-shaped profile: "the profile is a parameter" cannot be
# demonstrated with one size.
OBSERVED_CAPTURE_PROFILE = FieldRasterProfile(1440, 1920)

PROFILES = (REFERENCE_DESIGN_ENCODED_PROFILE, OBSERVED_CAPTURE_PROFILE)
PROFILE_IDS = tuple(profile.label for profile in PROFILES)


def _deadline(seconds: float = 30.0) -> RefineDeadline:
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


_FIXED_METADATA = {
    "schema": LIBHEIF_HELPER_SCHEMA,
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
    "raw_default_rgb_identical": "1",
}
_DIMENSION_KEYS = (
    "declared_width",
    "declared_height",
    "ispe_width",
    "ispe_height",
    "presented_width",
    "presented_height",
    "raw_width",
    "raw_height",
    "default_width",
    "default_height",
)


def _metadata_lines(profile: FieldRasterProfile, **overrides: str) -> str:
    values = dict(_FIXED_METADATA)
    for key in _DIMENSION_KEYS:
        values[key] = str(profile.height if key.endswith("_height") else profile.width)
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


def _python_helper(
    tmp_path: Path,
    *,
    profile: FieldRasterProfile,
    metadata: str | None = None,
    argv_log: Path | None = None,
) -> Path:
    """A stand-in helper that obeys the v3 argv protocol.

    With ``metadata=None`` every dimension it reports — the PPM header, the
    payload length, and all ten metadata dimensions — is computed from
    ``argv[3]``/``argv[4]``. Nothing about the profile is baked into the body,
    so if the adapter stopped passing the declaration the helper would fail on
    the missing argument rather than silently agreeing with itself.
    """

    lines = [
        f"#!{sys.executable}",
        "import pathlib,sys",
        "source=pathlib.Path(sys.argv[1])",
        "output=pathlib.Path(sys.argv[2])",
        "width=int(sys.argv[3])",
        "height=int(sys.argv[4])",
        "assert len(source.read_bytes()) >= 12",
    ]
    if argv_log is not None:
        lines.append(
            f"pathlib.Path({str(argv_log)!r}).write_text(repr(sys.argv[1:]))"
        )
    if metadata is None:
        lines += [
            "header=('P6\\n%d %d\\n255\\n' % (width,height)).encode('ascii')",
            "output.write_bytes(header + b'x' * (width*height*3))",
            "output.chmod(0o600)",
            f"values=dict({_FIXED_METADATA!r})",
            "values.update({k: str(height if k.endswith('_height') else width)"
            f" for k in {_DIMENSION_KEYS!r}}})",
            "sys.stdout.write(''.join('%s=%s\\n' % kv for kv in values.items()))",
        ]
    else:
        # Drift cases still emit a well-formed PPM at the declared size so the
        # refusal is attributable to the metadata and nothing else.
        lines += [
            "header=('P6\\n%d %d\\n255\\n' % (width,height)).encode('ascii')",
            "output.write_bytes(header + b'x' * (width*height*3))",
            "output.chmod(0o600)",
            f"sys.stdout.write({metadata!r})",
        ]
    return _release_with_helper(tmp_path, "\n".join(lines) + "\n")


def _invoke(
    tmp_path: Path,
    *,
    release: Path,
    profile: FieldRasterProfile,
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
        profile=profile,
    )
    try:
        evidence = adapter.materialize(
            source=source,
            source_name="keyframes/keyframe_000001.heic",
            destination=sink,
            engine_name="frame_000000.ppm",
            encoded_width=profile.width,
            encoded_height=profile.height,
            deadline=deadline or _deadline(),
        )
    finally:
        source.close()
    return evidence, sink, scratch


def test_packaged_source_is_the_pinned_helper_source():
    descriptor, digest = _open_packaged_source()
    os.close(descriptor)

    assert digest == QUALIFIED_HELPER_SOURCE_SHA256


def test_helper_source_carries_dimensions_on_argv_rather_than_pinning_them():
    source = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "patina_scan_worker"
        / "field_raster_libheif.c"
    ).read_text()

    assert "EXPECTED_WIDTH" not in source
    assert "EXPECTED_HEIGHT" not in source
    assert "parse_declared_dimension(argv[3]" in source
    assert "parse_declared_dimension(argv[4]" in source
    assert "argc != 5" in source
    assert 'printf("declared_width=%d\\n", declared_width);' in source
    assert "ispe_width != declared_width" in source
    assert "MAX_PPM_BYTES" in source
    assert f"schema={LIBHEIF_HELPER_SCHEMA}" in source


# --- the declaration is bounded, not merely variable -------------------------


@pytest.mark.parametrize(
    "dimensions",
    (
        (0, 640),
        (360, 0),
        (-360, 640),
        (_MAX_PROFILE_DIMENSION + 1, 640),
        (360, _MAX_PROFILE_DIMENSION + 1),
        # R118's own example of what an unbounded profile would cost.
        (60000, 60000),
    ),
)
def test_profile_refuses_dimensions_outside_the_declared_bound(dimensions):
    with pytest.raises(ValueError):
        FieldRasterProfile(*dimensions)


@pytest.mark.parametrize("dimensions", ((True, 640), (360.0, 640), ("360", 640)))
def test_profile_refuses_non_integer_dimensions(dimensions):
    with pytest.raises(TypeError):
        FieldRasterProfile(*dimensions)


def test_the_widest_admissible_profile_still_fits_the_byte_ceiling():
    """The two bounds agree, and the per-axis one binds first.

    This records the derivation rather than asserting a number: the largest
    profile the axis ceiling admits must still be inside the PPM byte ceiling
    the enclosing materializer and the frozen child both enforce, or the axis
    ceiling alone would not be a real bound on allocation.
    """

    widest = FieldRasterProfile(_MAX_PROFILE_DIMENSION, _MAX_PROFILE_DIMENSION)

    assert widest.ppm_size <= _MAX_PROFILE_PPM_BYTES
    assert OBSERVED_CAPTURE_PROFILE.ppm_size < widest.ppm_size


def test_profile_derives_its_own_ppm_header_and_size():
    assert OBSERVED_CAPTURE_PROFILE.ppm_header == b"P6\n1440 1920\n255\n"
    assert OBSERVED_CAPTURE_PROFILE.ppm_size == len(b"P6\n1440 1920\n255\n") + (
        1440 * 1920 * 3
    )
    assert REFERENCE_DESIGN_ENCODED_PROFILE.ppm_header == b"P6\n360 640\n255\n"
    assert REFERENCE_DESIGN_ENCODED_PROFILE.ppm_size == len(b"P6\n360 640\n255\n") + (
        360 * 640 * 3
    )


def test_adapter_requires_an_explicitly_declared_profile(tmp_path):
    with pytest.raises(TypeError):
        PackagedLibheifFieldRasterMaterializer(scratch_parent=tmp_path)
    with pytest.raises(TypeError):
        PackagedLibheifFieldRasterMaterializer(
            scratch_parent=tmp_path,
            profile=(1440, 1920),
        )

    adapter = PackagedLibheifFieldRasterMaterializer(
        scratch_parent=tmp_path,
        profile=OBSERVED_CAPTURE_PROFILE,
    )

    assert adapter.profile == OBSERVED_CAPTURE_PROFILE


# --- metadata is checked against the declaration -----------------------------


@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_validated_metadata_accepts_the_declared_profile(profile):
    values = _validated_metadata(_metadata_lines(profile).encode(), profile=profile)

    assert values["schema"] == LIBHEIF_HELPER_SCHEMA
    assert values["declared_width"] == str(profile.width)
    assert values["transformation_rotation_ccw"] == "0"


@pytest.mark.parametrize(
    ("key", "value"),
    (
        ("schema", "patina-field-raster-libheif-helper-v2"),
        ("decoder_id", "ffmpeg"),
        ("metadata_blocks", "1"),
        ("transformation_properties", "0"),
        ("transformation_property_type", "imir"),
        ("transformation_rotation_ccw", "180"),
        ("raw_default_rgb_identical", "0"),
        ("raw_width", "641"),
        ("ispe_height", "639"),
        ("presented_width", "359"),
        ("default_height", "641"),
        # A helper that echoes a declaration other than the one it was given
        # is exactly the drift the echo exists to catch.
        ("declared_width", "359"),
        ("declared_height", "639"),
    ),
)
def test_validated_metadata_rejects_drift_from_the_declaration(key, value):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    with pytest.raises(RefineMaterializerError) as caught:
        _validated_metadata(
            _metadata_lines(profile, **{key: value}).encode(),
            profile=profile,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


def test_metadata_valid_for_one_profile_is_rejected_against_another():
    """The core R118 property: the check is against the declaration."""

    payload = _metadata_lines(OBSERVED_CAPTURE_PROFILE).encode()

    assert _validated_metadata(payload, profile=OBSERVED_CAPTURE_PROFILE)
    with pytest.raises(RefineMaterializerError) as caught:
        _validated_metadata(payload, profile=REFERENCE_DESIGN_ENCODED_PROFILE)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert "360x640" in str(caught.value)


@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_materializer_id_carries_the_declared_profile(profile):
    value = _materializer_id(QUALIFIED_HELPER_SOURCE_SHA256, "1.17.6", profile)

    assert value.endswith(f"-{profile.label}")
    assert QUALIFIED_HELPER_SOURCE_SHA256[:12] in value


def test_materializer_id_rejects_oversized_libheif_version_before_streaming():
    with pytest.raises(RefineMaterializerError) as caught:
        _materializer_id(
            QUALIFIED_HELPER_SOURCE_SHA256,
            "v" * 128,
            OBSERVED_CAPTURE_PROFILE,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_dimensions_other_than_the_declaration_fail_before_any_access(
    tmp_path,
    profile,
):
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "missing",
        release_prefix=tmp_path / "missing-release",
        profile=profile,
    )

    with pytest.raises(RefineMaterializerError) as caught:
        adapter.materialize(
            source=object(),
            source_name="keyframes/keyframe.heic",
            destination=object(),
            engine_name="frame.ppm",
            # The transpose is a real hazard here, not a synthetic one: the
            # fixture is 360x640 and its native buffer is 640x360.
            encoded_width=profile.height,
            encoded_height=profile.width,
            deadline=_deadline(),
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert profile.label in str(caught.value)
    assert not (tmp_path / "missing").exists()


def test_missing_scratch_parent_maps_to_stable_unqualified_failure(tmp_path):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    release = _python_helper(tmp_path, profile=profile)
    source_path = tmp_path / "source.heic"
    source_path.write_bytes(b"fake-heic-payload")
    source = _Source(source_path)
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "missing",
        release_prefix=release,
        profile=profile,
    )
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            adapter.materialize(
                source=source,
                source_name="keyframes/keyframe.heic",
                destination=_Destination(),
                engine_name="frame.ppm",
                encoded_width=profile.width,
                encoded_height=profile.height,
                deadline=_deadline(),
            )
    finally:
        source.close()

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED


def test_helper_binary_must_match_its_release_manifest(tmp_path):
    release = _python_helper(tmp_path, profile=REFERENCE_DESIGN_ENCODED_PROFILE)
    helper = release / HELPER_RELATIVE_PATH
    helper.write_bytes(helper.read_bytes() + b"\n# tampered\n")
    helper.chmod(0o755)

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, profile=REFERENCE_DESIGN_ENCODED_PROFILE)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.parametrize("link_kind", ("symlink", "hardlink"))
def test_helper_link_identity_is_rejected(tmp_path, link_kind):
    release = _python_helper(tmp_path, profile=REFERENCE_DESIGN_ENCODED_PROFILE)
    helper = release / HELPER_RELATIVE_PATH
    if link_kind == "symlink":
        target = helper.with_name("helper-target")
        helper.rename(target)
        helper.symlink_to(target.name)
    else:
        os.link(helper, helper.with_name("helper-hardlink"))

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(tmp_path, release=release, profile=REFERENCE_DESIGN_ENCODED_PROFILE)

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


@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_stream_output_unlinks_then_preserves_exact_canonical_ppm(tmp_path, profile):
    output = tmp_path / "output.ppm"
    expected = profile.ppm_header + b"x" * (profile.width * profile.height * 3)
    output.write_bytes(expected)
    output.chmod(0o600)
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    try:
        _stream_output(
            directory_fd,
            destination,
            profile=profile,
            deadline=_deadline(),
        )
    finally:
        os.close(directory_fd)

    assert not output.exists()
    assert destination.payload == expected


def test_stream_output_rejects_a_ppm_written_at_another_profile(tmp_path):
    output = tmp_path / "output.ppm"
    other = REFERENCE_DESIGN_ENCODED_PROFILE
    output.write_bytes(other.ppm_header + b"x" * (other.width * other.height * 3))
    output.chmod(0o600)
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            _stream_output(
                directory_fd,
                destination,
                profile=OBSERVED_CAPTURE_PROFILE,
                deadline=_deadline(),
            )
    finally:
        os.close(directory_fd)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""


def test_stream_output_close_uncertainty_fails_closed(
    tmp_path,
    monkeypatch,
):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    output = tmp_path / "output.ppm"
    expected = profile.ppm_header + b"x" * (profile.width * profile.height * 3)
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
            _stream_output(
                directory_fd,
                destination,
                profile=profile,
                deadline=_deadline(),
            )
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
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    output = tmp_path / "output.ppm"
    header = b"P3\n360 640\n255\n" if failure == "header" else profile.ppm_header
    pixels = profile.width * profile.height * 3
    if failure == "short":
        pixels -= 1
    output.write_bytes(header + b"x" * pixels)
    output.chmod(0o644 if failure == "mode" else 0o600)
    directory_fd = os.open(tmp_path, os.O_RDONLY)
    destination = _Destination()
    try:
        with pytest.raises(RefineMaterializerError) as caught:
            _stream_output(
                directory_fd,
                destination,
                profile=profile,
                deadline=_deadline(),
            )
    finally:
        os.close(directory_fd)

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""


@pytest.mark.skipif(
    sys.platform != "linux",
    reason="the production adapter intentionally requires Linux /proc/self/fd",
)
@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_linux_adapter_streams_validated_unlinked_ppm_and_cleans_scratch(
    tmp_path,
    profile,
):
    release = _python_helper(tmp_path, profile=profile)

    evidence, destination, scratch = _invoke(
        tmp_path,
        release=release,
        profile=profile,
    )

    assert evidence.source_width == profile.width
    assert evidence.source_height == profile.height
    assert evidence.output_width == profile.width
    assert evidence.output_height == profile.height
    assert QUALIFIED_HELPER_SOURCE_SHA256[:12] in evidence.materializer_id
    assert evidence.materializer_id.endswith(f"-{profile.label}")
    assert destination.payload.startswith(profile.ppm_header)
    assert len(destination.payload) == profile.ppm_size
    assert list(scratch.iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
@pytest.mark.parametrize("profile", PROFILES, ids=PROFILE_IDS)
def test_linux_helper_receives_the_declared_profile_on_argv(tmp_path, profile):
    argv_log = tmp_path / "argv.txt"
    release = _python_helper(tmp_path, profile=profile, argv_log=argv_log)

    _invoke(tmp_path, release=release, profile=profile)

    recorded = eval(argv_log.read_text())  # noqa: S307 - fixture-written literal
    assert len(recorded) == 4
    assert recorded[2] == str(profile.width)
    assert recorded[3] == str(profile.height)


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_rejects_a_helper_that_ignores_the_declaration(tmp_path):
    """A helper still pinned to 360x640 must not pass at capture resolution."""

    release = _python_helper(
        tmp_path,
        profile=OBSERVED_CAPTURE_PROFILE,
        metadata=_metadata_lines(REFERENCE_DESIGN_ENCODED_PROFILE),
    )
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(
            tmp_path,
            release=release,
            profile=OBSERVED_CAPTURE_PROFILE,
            destination=destination,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert "1440x1920" in str(caught.value)
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_rejects_helper_metadata_drift_without_destination(tmp_path):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    release = _python_helper(
        tmp_path,
        profile=profile,
        metadata=_metadata_lines(profile, transformation_rotation_ccw="180"),
    )
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(
            tmp_path,
            release=release,
            profile=profile,
            destination=destination,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_rejects_loaded_libheif_version_different_from_manifest(
    tmp_path,
):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    release = _python_helper(
        tmp_path,
        profile=profile,
        metadata=_metadata_lines(profile, libheif_version="1.17.7"),
    )
    destination = _Destination()

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(
            tmp_path,
            release=release,
            profile=profile,
            destination=destination,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert "differs from the qualified helper manifest" in str(caught.value)
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


@pytest.mark.skipif(sys.platform != "linux", reason="Linux process boundary")
def test_linux_adapter_preserves_bounded_destination_short_write(tmp_path):
    profile = REFERENCE_DESIGN_ENCODED_PROFILE
    release = _python_helper(tmp_path, profile=profile)
    destination = _Destination(short=True)

    with pytest.raises(RefineMaterializerError) as caught:
        _invoke(
            tmp_path,
            release=release,
            profile=profile,
            destination=destination,
        )

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
            profile=OBSERVED_CAPTURE_PROFILE,
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
        _invoke(
            tmp_path,
            release=release,
            profile=OBSERVED_CAPTURE_PROFILE,
            destination=destination,
        )

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
        _invoke(
            tmp_path,
            release=release,
            profile=OBSERVED_CAPTURE_PROFILE,
            destination=destination,
        )

    assert caught.value.code is MaterializerFailureCode.RASTER_UNQUALIFIED
    assert destination.payload == b""
    assert list((tmp_path / "scratch").iterdir()) == []


def test_adapter_remains_disabled_and_refine_unregistered():
    assert PackagedLibheifFieldRasterMaterializer.production_enablement == "disabled"
    assert DEFAULT_STAGES == "ingest,solve,drawings"
    assert get_handler("scan_pipeline.refine") is None
