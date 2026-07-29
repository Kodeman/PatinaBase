"""Protocol tests for the non-mutating Field/Core Image raster gate."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from dataclasses import replace
from pathlib import Path

import pytest
import patina_scan_worker.field_raster_qualification as qualification

from patina_scan_worker.field_raster_qualification import (
    FIXTURE_ID,
    MATERIALIZED_RASTER_NAME,
    RECEIPT_NAME,
    DecodedRaster,
    QualificationConfig,
    RasterQualificationError,
    SystemLibheifDecoder,
    run_field_raster_qualification,
)


MARKERS = (
    ("corner-top-left", "corner", "square-55", "#FF2020FF", (27, 27)),
    ("corner-top-right", "corner", "square-55", "#20E060FF", (612, 27)),
    ("corner-bottom-left", "corner", "square-55", "#2060FFFF", (27, 332)),
    ("corner-bottom-right", "corner", "square-55", "#FFE020FF", (612, 332)),
    (
        "fiducial-magenta",
        "off-centre-fiducial",
        "cross-45-thickness-13",
        "#F020E0FF",
        (173, 91),
    ),
    (
        "fiducial-cyan",
        "off-centre-fiducial",
        "diamond-radius-21",
        "#20E8F0FF",
        (487, 271),
    ),
)


# The 640x360 fixture's declared profile. Its provenance strings are those of a
# real device, NOT the exporter's reserved "reference-design" identity: the
# qualifier refuses that outright, so a fixture that wants to qualify must claim
# a device. This is what keeps the pre-R118 profile qualifiable — the geometry
# at 640x360 is unchanged, only the declaration is now explicit.
CAPTURE_PROFILE = {
    "nativeWidth": 640,
    "nativeHeight": 360,
    "resolutionSource": (
        "ARWorldTrackingConfiguration.videoFormat.imageResolution on "
        "SharedARCaptureRig.makeConfiguration() [sceneReconstruction=mesh]"
    ),
    "deviceModel": "iPhone18,3",
    "systemVersion": "iOS 26.5",
    "videoFormat": "640x360@60 BuiltInWideAngleCamera",
}


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _rgba(hex_value: str) -> tuple[int, int, int, int]:
    raw = bytes.fromhex(hex_value.removeprefix("#"))
    return raw[0], raw[1], raw[2], raw[3]


def _set_bgra(
    raster: bytearray,
    *,
    width: int,
    x: int,
    y: int,
    color: tuple[int, int, int, int],
) -> None:
    r, g, b, a = color
    offset = (y * width + x) * 4
    raster[offset : offset + 4] = bytes((b, g, r, a))


def _native_bgra() -> bytes:
    width, height = 640, 360
    background = (30, 35, 43, 255)
    b, g, r, a = background[2], background[1], background[0], background[3]
    raster = bytearray(bytes((b, g, r, a)) * width * height)

    for _, _, shape, rgba_hex, (cx, cy) in MARKERS:
        color = _rgba(rgba_hex)
        if shape == "square-55":
            points = (
                (x, y) for y in range(cy - 27, cy + 28) for x in range(cx - 27, cx + 28)
            )
        elif shape == "cross-45-thickness-13":
            points = (
                (x, y)
                for y in range(cy - 22, cy + 23)
                for x in range(cx - 22, cx + 23)
                if abs(x - cx) <= 6 or abs(y - cy) <= 6
            )
        else:
            points = (
                (x, y)
                for y in range(cy - 21, cy + 22)
                for x in range(cx - 21, cx + 22)
                if abs(x - cx) + abs(y - cy) <= 21
            )
        for x, y in points:
            _set_bgra(raster, width=width, x=x, y=y, color=color)
    return bytes(raster)


def _clockwise_rgb(native: bytes, *, lossy_delta: int = 0) -> bytes:
    native_width, native_height = 640, 360
    encoded_width, encoded_height = native_height, native_width
    output = bytearray(encoded_width * encoded_height * 3)
    for y in range(native_height):
        for x in range(native_width):
            native_offset = (y * native_width + x) * 4
            b, g, r, _ = native[native_offset : native_offset + 4]
            encoded_x = native_height - 1 - y
            encoded_y = x
            encoded_offset = (encoded_y * encoded_width + encoded_x) * 3
            output[encoded_offset : encoded_offset + 3] = bytes((r, g, b))

    if lossy_delta:
        for _, _, _, rgba_hex, (x, y) in MARKERS:
            encoded_x = native_height - 1 - y
            encoded_y = x
            offset = (encoded_y * encoded_width + encoded_x) * 3
            target = _rgba(rgba_hex)[:3]
            output[offset : offset + 3] = bytes(
                max(0, min(255, channel - lossy_delta)) for channel in target
            )
    return bytes(output)


def _manifest(native: bytes, heic: bytes) -> dict:
    markers = []
    for marker_id, role, shape, rgba_hex, (x, y) in MARKERS:
        markers.append(
            {
                "id": marker_id,
                "role": role,
                "shape": shape,
                "rgbaHex": rgba_hex,
                "nativeCoordinate": {"x": x, "y": y},
                "expectedEncodedCoordinate": {"x": 359 - y, "y": x},
            }
        )
    return {
        "schemaVersion": 2,
        "fixtureID": FIXTURE_ID,
        "captureProfile": dict(CAPTURE_PROFILE),
        "encodingPipeline": (
            "CVPixelBuffer(32BGRA) -> CIImage(cvPixelBuffer:) -> oriented(.right) "
            "-> CGImage -> HEIC(quality=0.75)"
        ),
        "orientation": (
            "CGImagePropertyOrientation.right (physical 90-degree clockwise raster)"
        ),
        "markerCoordinateConvention": (
            "integer pixel centres from top-left; expected encoded "
            "(x,y)=(nativeHeight-1-y,x)"
        ),
        "nativeRaster": {
            "fileName": f"{FIXTURE_ID}-native.bgra",
            "width": 640,
            "height": 360,
            "rowBytes": 2560,
            "pixelFormat": "32BGRA, tightly packed, top-left row first",
            "sha256": _sha256(native),
        },
        "encodedRaster": {
            "fileName": f"{FIXTURE_ID}.heic",
            "width": 360,
            "height": 640,
            "mimeType": "image/heic",
            "sha256": _sha256(heic),
        },
        "nativeIntrinsics": {
            "fx": 512.5,
            "fy": 509.25,
            "cx": 301.25,
            "cy": 154.75,
            "imageWidth": 640,
            "imageHeight": 360,
        },
        "expectedEncodedIntrinsics": {
            "fx": 509.25,
            "fy": 512.5,
            "cx": 205.25,
            "cy": 301.25,
            "imageWidth": 360,
            "imageHeight": 640,
        },
        "markers": markers,
    }


def _canonical_manifest_bytes(manifest: dict) -> bytes:
    return (
        json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    ).encode()


def _write_fixture(root: Path) -> tuple[QualificationConfig, bytes, bytes]:
    root.mkdir()
    native = _native_bgra()
    heic = b"controlled-physical-device-heic-placeholder"
    manifest = _manifest(native, heic)
    manifest_path = root / f"{FIXTURE_ID}.json"
    native_path = root / f"{FIXTURE_ID}-native.bgra"
    heic_path = root / f"{FIXTURE_ID}.heic"
    manifest_path.write_bytes(_canonical_manifest_bytes(manifest))
    native_path.write_bytes(native)
    heic_path.write_bytes(heic)
    return (
        QualificationConfig(
            manifest_path=manifest_path,
            native_bgra_path=native_path,
            heic_path=heic_path,
            output_dir=root.parent / "qualification-output",
        ),
        native,
        heic,
    )


class FakeDecoder:
    def __init__(
        self,
        rgb: bytes,
        *,
        width: int = 360,
        height: int = 640,
        hidden_transform: bool = False,
        metadata_blocks: int = 0,
        transformation_property_count: int = 1,
        transformation_property_type: str = "irot",
        transformation_rotation_ccw: int = 0,
    ) -> None:
        self.rgb = rgb
        self.width = width
        self.height = height
        self.hidden_transform = hidden_transform
        self.metadata_blocks = metadata_blocks
        self.transformation_property_count = transformation_property_count
        self.transformation_property_type = transformation_property_type
        self.transformation_rotation_ccw = transformation_rotation_ccw

    def decode_no_autorotate(
        self,
        heic: bytes,
        *,
        encoded_width: int,
        encoded_height: int,
    ) -> DecodedRaster:
        assert heic == b"controlled-physical-device-heic-placeholder"
        # R118: the qualifier declares the encoded size to its decoder. Record
        # it so tests can prove the declaration came from the manifest's
        # captureProfile rather than from a constant.
        self.declared = (encoded_width, encoded_height)
        return DecodedRaster(
            width=self.width,
            height=self.height,
            rgb=self.rgb,
            source_channels=3,
            source_pixel_type="uint8",
            decoder_name="fake-system-libheif-helper",
            decoder_version="1.17.fake",
            decoder_id="libde265",
            decoder_descriptor_name="fake libde265 decoder descriptor",
            hevc_decoder_descriptor_count=1,
            matching_decoder_descriptor_count=1,
            input_mime_type="image/heic",
            metadata_blocks=self.metadata_blocks,
            info_width=self.width,
            info_height=self.height,
            presented_width=self.width,
            presented_height=self.height,
            default_width=self.width,
            default_height=self.height,
            transformation_property_count=self.transformation_property_count,
            transformation_property_type=self.transformation_property_type,
            transformation_rotation_ccw=self.transformation_rotation_ccw,
            raw_default_rgb_identical=not self.hidden_transform,
            compiler_version="gcc fake",
            pkg_config_version="1.8.fake",
            pkg_config_libheif_version="1.17.fake",
            helper_source_sha256="a" * 64,
            os_release="Ubuntu 24.04.3 LTS",
            package_versions={
                "libheif1": "1.17.fake-ubuntu",
                "libheif-dev": "1.17.fake-ubuntu",
                "libheif-plugin-libde265": "1.17.fake-ubuntu",
            },
        )


def _read_receipt(path: Path) -> dict:
    return json.loads(path.read_text())


def _helper_metadata_text(**overrides: str) -> str:
    values = {
        "schema": "patina-field-raster-libheif-helper-v3",
        "libheif_version": "1.17.6",
        "decoder_id": "libde265",
        "decoder_name": "libde265 HEVC decoder",
        "decoder_descriptor_count": "1",
        "matching_decoder_descriptor_count": "1",
        "input_mime_type": "image/heic",
        "top_level_images": "1",
        "metadata_blocks": "0",
        "transformation_properties": "1",
        "transformation_property_type": "irot",
        "transformation_rotation_ccw": "0",
        "declared_width": "360",
        "declared_height": "640",
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
    return "\n".join(f"{key}={value}" for key, value in values.items())


def test_protocol_materializes_canonical_ppm_and_receipt_without_mutating_inputs(
    tmp_path,
):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    before = {
        path: (path.read_bytes(), path.stat().st_mtime_ns)
        for path in (config.manifest_path, config.native_bgra_path, config.heic_path)
    }
    decoder = FakeDecoder(_clockwise_rgb(native, lossy_delta=12))

    result = run_field_raster_qualification(config, decoder=decoder)

    assert result.materialized_raster_path.name == MATERIALIZED_RASTER_NAME
    # R118 superseded the v2 receipt: v3 records which capture profile was
    # qualified and on what provenance. Distinct names, distinct evidence.
    assert RECEIPT_NAME == "field-raster-qualification-receipt-v3.json"
    assert result.receipt_path.name == RECEIPT_NAME
    ppm = result.materialized_raster_path.read_bytes()
    assert ppm.startswith(b"P6\n360 640\n255\n")
    assert ppm[len(b"P6\n360 640\n255\n") :] == decoder.rgb

    receipt_bytes = result.receipt_path.read_bytes()
    assert receipt_bytes.endswith(b"\n")
    assert (
        receipt_bytes
        == (
            json.dumps(
                json.loads(receipt_bytes),
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            )
            + "\n"
        ).encode()
    )
    receipt = _read_receipt(result.receipt_path)
    assert receipt["schemaVersion"] == 3
    assert receipt["qualification"] == "p2-item4a-field-core-image-raster"
    assert receipt["status"] == "passed"
    assert len(receipt["implementation"]["qualificationHarness"]["sha256"]) == 64
    assert receipt["implementation"]["libheifHelper"]["sha256"] == "a" * 64
    assert receipt["decoder"]["decoderID"] == "libde265"
    assert receipt["decoder"]["decoderDescriptorName"] == (
        "fake libde265 decoder descriptor"
    )
    assert receipt["decoder"]["availableHEVCDecoderDescriptorCount"] == 1
    assert receipt["decoder"]["matchingLibde265DescriptorCount"] == 1
    assert receipt["decoder"]["inputMimeType"] == "image/heic"
    assert receipt["geometry"]["rotation"] == "one-physical-clockwise-rotation"
    assert receipt["geometry"]["continuousIntrinsics"]["mapped"] == {
        "cx": 205.25,
        "cy": 301.25,
        "fx": 509.25,
        "fy": 512.5,
        "imageHeight": 640,
        "imageWidth": 360,
    }
    assert len(receipt["geometry"]["markers"]) == 6
    assert receipt["materializedRaster"]["sha256"] == _sha256(ppm)
    assert receipt["safety"]["externalSystemsTouched"] == []
    orientation_proof = receipt["decoder"]["orientationProof"]
    assert orientation_proof["libheifRecognizedPrimaryItemTransformProperties"] == {
        "associationScope": "primary-item-associated",
        "recognizedTypes": ["irot", "imir", "clap"],
        "count": 1,
        "propertyType": "irot",
        "rotationCCWDegrees": 0,
    }
    assert (
        orientation_proof["hiddenLibheifRecognizedPrimaryItemTransformEffect"]
        is False
    )
    assert "heifGeometricTransformationProperties" not in orientation_proof
    assert "hiddenHeifCropRotationMirror" not in orientation_proof
    assert orientation_proof["scope"] == (
        "public libheif API proof covers recognized primary-item-associated "
        "irot/imir/clap semantic type and value, zero attached metadata, and "
        "strict raw/default dimension and RGB byte identity; output PPM drops "
        "metadata"
    )
    assert orientation_proof["embeddedMetadataBlocks"] == 0

    for path, (payload, mtime_ns) in before.items():
        assert path.read_bytes() == payload
        assert path.stat().st_mtime_ns == mtime_ns


def test_receipt_and_materialized_bytes_are_deterministic_across_output_directories(
    tmp_path,
):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    decoder = FakeDecoder(_clockwise_rgb(native))
    first = run_field_raster_qualification(config, decoder=decoder)
    first_receipt = first.receipt_path.read_bytes()
    first_ppm = first.materialized_raster_path.read_bytes()

    second_config = replace(config, output_dir=tmp_path / "second-output")
    second = run_field_raster_qualification(second_config, decoder=decoder)

    assert second.receipt_path.read_bytes() == first_receipt
    assert second.materialized_raster_path.read_bytes() == first_ppm


@pytest.mark.parametrize(
    ("mutation", "message"),
    (
        (lambda value: value.update(schemaVersion=1), "schemaVersion"),
        (lambda value: value.update(fixtureID="wrong"), "fixtureID"),
        (
            lambda value: value["encodedRaster"].update(width=640, height=360),
            "dimensions",
        ),
        (
            lambda value: value["expectedEncodedIntrinsics"].update(cx=204.25),
            "intrinsics",
        ),
        (
            lambda value: value["markers"][0]["expectedEncodedCoordinate"].update(x=0),
            "marker",
        ),
    ),
)
def test_manifest_schema_geometry_and_intrinsics_fail_closed(
    tmp_path, mutation, message
):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    manifest = json.loads(config.manifest_path.read_text())
    mutation(manifest)
    config.manifest_path.write_bytes(_canonical_manifest_bytes(manifest))

    with pytest.raises(RasterQualificationError, match=message):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()


def test_hash_mismatch_fails_before_decode_or_output(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    config.heic_path.write_bytes(b"tampered")

    with pytest.raises(RasterQualificationError, match="SHA-256"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()


def test_exact_exported_file_names_are_required(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    renamed = config.heic_path.with_name("renamed.heic")
    config.heic_path.rename(renamed)

    with pytest.raises(RasterQualificationError, match="file name"):
        run_field_raster_qualification(
            replace(config, heic_path=renamed),
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )


def test_native_marker_shape_is_verified_not_only_its_hash(tmp_path):
    config, native, heic = _write_fixture(tmp_path / "fixture")
    changed = bytearray(native)
    changed[0:4] = bytes((43, 35, 30, 255))
    changed_native = bytes(changed)
    manifest = _manifest(changed_native, heic)
    config.native_bgra_path.write_bytes(changed_native)
    config.manifest_path.write_bytes(_canonical_manifest_bytes(manifest))

    with pytest.raises(RasterQualificationError, match="native marker"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(changed_native)),
        )


def test_decoder_dimensions_and_orientation_must_show_raw_physical_rotation(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    rgb = _clockwise_rgb(native)

    with pytest.raises(RasterQualificationError, match="decoder dimensions"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(rgb, width=640, height=360),
        )

    with pytest.raises(RasterQualificationError, match="hidden"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(rgb, hidden_transform=True),
        )

    with pytest.raises(RasterQualificationError, match="metadata"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(rgb, metadata_blocks=1),
        )


@pytest.mark.parametrize(
    "decoder_overrides",
    (
        {"transformation_property_count": 0},
        {"transformation_property_count": 2},
        {"transformation_property_type": "imir"},
        {"transformation_property_type": "clap"},
        {"transformation_property_type": "unknown"},
        {"transformation_rotation_ccw": 90},
        {"transformation_rotation_ccw": 180},
        {"transformation_rotation_ccw": 270},
    ),
)
def test_decoder_protocol_rejects_transform_policy_drift(tmp_path, decoder_overrides):
    config, native, _ = _write_fixture(tmp_path / "fixture")

    with pytest.raises(
        RasterQualificationError, match="exactly one identity irot"
    ):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native), **decoder_overrides),
        )
    assert not config.output_dir.exists()


def test_wrong_pixel_rotation_fails_marker_mapping(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    wrong = bytearray(360 * 640 * 3)
    wrong[:] = bytes((30, 35, 43)) * (360 * 640)

    with pytest.raises(RasterQualificationError, match="lossy marker"):
        run_field_raster_qualification(config, decoder=FakeDecoder(bytes(wrong)))


def test_existing_output_directory_is_never_reused(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    config.output_dir.mkdir()
    sentinel = config.output_dir / "sentinel"
    sentinel.write_text("keep")

    with pytest.raises(RasterQualificationError, match="must not already exist"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert sentinel.read_text() == "keep"


def test_system_libheif_backend_compiles_in_scratch_and_normalizes_ppm(tmp_path):
    heic = b"fixture"
    os_release = tmp_path / "os-release"
    os_release.write_text(
        'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.3 LTS"\n'
    )
    rgb = bytes((10, 20, 30)) * 6
    calls: list[tuple[tuple[str, ...], dict[str, str], float]] = []

    def runner(argv, *, env, timeout):
        argv = tuple(argv)
        calls.append((argv, dict(env), timeout))
        if argv[0] == "/usr/bin/dpkg-query":
            package_version = "1.17.6-1ubuntu4.6"
            stdout = "".join(
                f"{package}\tii \t{package_version}\n"
                for package in (
                    "libheif1",
                    "libheif-dev",
                    "libheif-plugin-libde265",
                )
            )
            return subprocess.CompletedProcess(argv, 0, stdout, "")
        if argv[0] == "/usr/bin/dpkg":
            assert argv[1:3] == ("--compare-versions", "1.17.6-1ubuntu4.6")
            assert argv[3:] == ("ge", "1.17.6-1ubuntu4.6")
            return subprocess.CompletedProcess(argv, 0, "", "")
        if argv == ("/usr/bin/cc", "--version"):
            return subprocess.CompletedProcess(argv, 0, "gcc (Ubuntu) 13.3.0\n", "")
        if argv == ("/usr/bin/pkg-config", "--version"):
            return subprocess.CompletedProcess(argv, 0, "1.8.1\n", "")
        if argv == ("/usr/bin/pkg-config", "--modversion", "libheif"):
            return subprocess.CompletedProcess(argv, 0, "1.17.6\n", "")
        if argv == ("/usr/bin/pkg-config", "--cflags", "--libs", "libheif"):
            return subprocess.CompletedProcess(argv, 0, "-I/usr/include -lheif\n", "")
        if argv[0] == "/usr/bin/cc":
            helper = Path(argv[argv.index("-o") + 1])
            helper.write_bytes(b"fake helper")
            helper.chmod(0o700)
            return subprocess.CompletedProcess(argv, 0, "", "")
        assert Path(argv[0]).name == "field-raster-libheif-helper"
        assert Path(argv[1]).read_bytes() == heic
        # R118: the caller DECLARES the encoded size on argv rather than
        # leaving the helper to assume one.
        assert argv[3:] == ("360", "640")
        output = Path(argv[2])
        output.write_bytes(b"P6\n# noncanonical helper comment\n3 2\n255\n" + rgb)
        stdout = _helper_metadata_text(
            decoder_name="libde265 HEVC decoder, version fake",
            declared_width="3",
            declared_height="2",
            ispe_width="3",
            ispe_height="2",
            presented_width="3",
            presented_height="2",
            raw_width="3",
            raw_height="2",
            default_width="3",
            default_height="2",
        )
        return subprocess.CompletedProcess(argv, 0, stdout, "")

    decoder = SystemLibheifDecoder(
        os_release=os_release,
        runner=runner,
    )
    decoded = decoder.decode_no_autorotate(heic, encoded_width=360, encoded_height=640)

    assert decoded.width == 3
    assert decoded.height == 2
    assert decoded.rgb == rgb
    assert decoded.raw_default_rgb_identical is True
    assert decoded.transformation_property_count == 1
    assert decoded.transformation_property_type == "irot"
    assert decoded.transformation_rotation_ccw == 0
    assert decoded.decoder_version == "1.17.6"
    assert len(calls) == 10
    compile_argv = calls[8][0]
    assert "-std=c11" in compile_argv
    assert "-D_FORTIFY_SOURCE=3" in compile_argv
    assert "-Wl,-z,relro,-z,now" in compile_argv
    assert "-lheif" in compile_argv
    helper_output = compile_argv[compile_argv.index("-o") + 1]
    assert compile_argv.count(helper_output) == 1
    assert (
        sum(argument.endswith("field_raster_libheif.c") for argument in compile_argv)
        == 1
    )
    for _, env, timeout in calls:
        assert env["LC_ALL"] == "C"
        assert env["PKG_CONFIG_LIBDIR"].startswith("/usr/lib/x86_64-linux-gnu")
        assert "LD_PRELOAD" not in env
        assert "LD_LIBRARY_PATH" not in env
        assert "PKG_CONFIG_PATH" not in env
        assert timeout > 0


def test_packaged_helper_uses_strict_transform_and_dual_decode_contract():
    source = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "patina_scan_worker"
        / "field_raster_libheif.c"
    ).read_text()
    assert "heif_decoding_options_alloc()" in source
    assert "raw_options->ignore_transformations = 1;" in source
    assert "raw_options->strict_decoding = 1;" in source
    assert "default_options->strict_decoding = 1;" in source
    assert "heif_get_decoder_descriptors(" in source
    assert "heif_decoder_descriptor_get_id_name(" in source
    assert "matching_decoder_descriptor_count != 1" in source
    assert "heif_get_file_mime_type(" in source
    assert 'strcmp(input_mime_type, "image/heic")' in source
    assert "heif_context_read_from_memory_without_copy(" in source
    assert "raw_options->decoder_id = selected_decoder_id;" in source
    assert "default_options->decoder_id = selected_decoder_id;" in source
    assert "heif_item_get_transformation_properties(" in source
    assert "heif_item_get_property_type(" in source
    assert "heif_item_get_property_transform_rotation_ccw(" in source
    assert "transformation_properties != 1" in source
    assert "heif_item_property_type_transform_rotation" in source
    assert "transformation_rotation_ccw != 0" in source
    assert "heif_image_handle_get_number_of_metadata_blocks(handle, NULL)" in source
    assert "memcmp(transformed.pixels, raw.pixels, raw.size)" in source
    assert "heif_init(NULL)" in source
    assert "heif_deinit();" in source


def test_helper_metadata_rejects_unavailable_requested_decoder_evidence():
    metadata = _helper_metadata_text(
        decoder_id="builtin",
        decoder_name="builtin HEVC decoder",
    )

    with pytest.raises(
        RasterQualificationError, match="did not pin the HEVC decoder to libde265"
    ):
        qualification._parse_helper_metadata(metadata)


def test_helper_metadata_rejects_non_hevc_input_evidence():
    metadata = _helper_metadata_text(input_mime_type="image/avif")

    with pytest.raises(RasterQualificationError, match="HEVC-compressed HEIC input"):
        qualification._parse_helper_metadata(metadata)


def test_helper_metadata_rejects_ambiguous_libde265_descriptor_evidence():
    metadata = _helper_metadata_text(
        decoder_descriptor_count="2",
        matching_decoder_descriptor_count="2",
    )

    with pytest.raises(RasterQualificationError, match="exactly one libde265"):
        qualification._parse_helper_metadata(metadata)


def test_helper_metadata_requires_the_declaration_to_match_every_dimension():
    """R118: dimensions are carried explicitly, so they must agree explicitly.

    `declared_*` is the profile the caller put on argv, echoed back. A helper
    that reports a size other than the one it was told to enforce is the exact
    drift this echo exists to catch.
    """

    for key in (
        "ispe_width",
        "presented_width",
        "raw_width",
        "default_width",
    ):
        with pytest.raises(qualification.RasterQualificationError) as caught:
            qualification._parse_helper_metadata(
                _helper_metadata_text(**{key: "359"})
            )
        assert "declared width 360" in str(caught.value)
    for key in (
        "ispe_height",
        "presented_height",
        "raw_height",
        "default_height",
    ):
        with pytest.raises(qualification.RasterQualificationError) as caught:
            qualification._parse_helper_metadata(
                _helper_metadata_text(**{key: "639"})
            )
        assert "declared height 640" in str(caught.value)


def test_helper_metadata_rejects_a_v2_helper_that_omits_the_declaration():
    lines = [
        line
        for line in _helper_metadata_text().splitlines()
        if not line.startswith(("declared_width=", "declared_height="))
    ]

    with pytest.raises(RasterQualificationError, match="schema mismatch"):
        qualification._parse_helper_metadata("\n".join(lines))


def test_helper_metadata_accepts_exactly_one_identity_irot():
    metadata = qualification._parse_helper_metadata(_helper_metadata_text())

    assert metadata["transformation_properties"] == "1"
    assert metadata["transformation_property_type"] == "irot"
    assert metadata["transformation_rotation_ccw"] == "0"


@pytest.mark.parametrize(
    ("overrides", "message"),
    (
        ({"transformation_properties": "0"}, "exactly one identity irot"),
        ({"transformation_properties": "2"}, "exactly one identity irot"),
        ({"transformation_property_type": "imir"}, "exactly one identity irot"),
        ({"transformation_property_type": "clap"}, "exactly one identity irot"),
        ({"transformation_property_type": "unknown"}, "exactly one identity irot"),
        ({"transformation_rotation_ccw": "90"}, "exactly one identity irot"),
        ({"transformation_rotation_ccw": "180"}, "exactly one identity irot"),
        ({"transformation_rotation_ccw": "270"}, "exactly one identity irot"),
    ),
)
def test_helper_metadata_rejects_transform_policy_drift(overrides, message):
    with pytest.raises(RasterQualificationError, match=message):
        qualification._parse_helper_metadata(_helper_metadata_text(**overrides))


@pytest.mark.parametrize(
    "malformation",
    (
        {"transformation_properties": "not-an-int"},
        {"transformation_rotation_ccw": "-1"},
        {"transformation_rotation_ccw": "not-an-int"},
    ),
)
def test_helper_metadata_rejects_malformed_transform_evidence(malformation):
    with pytest.raises(RasterQualificationError):
        qualification._parse_helper_metadata(_helper_metadata_text(**malformation))


def test_helper_metadata_rejects_missing_transform_evidence():
    metadata = "\n".join(
        line
        for line in _helper_metadata_text().splitlines()
        if not line.startswith("transformation_property_type=")
    )

    with pytest.raises(RasterQualificationError, match="schema mismatch"):
        qualification._parse_helper_metadata(metadata)


def test_system_libheif_backend_fails_closed_when_helper_finds_hidden_transform(
    tmp_path,
):
    heic = b"fixture"
    os_release = tmp_path / "os-release"
    os_release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n')

    def runner(argv, *, env, timeout):
        argv = tuple(argv)
        if argv[0] == "/usr/bin/dpkg-query":
            stdout = "".join(
                f"{package}\tii \t1.17.6-1ubuntu4.6\n"
                for package in (
                    "libheif1",
                    "libheif-dev",
                    "libheif-plugin-libde265",
                )
            )
            return subprocess.CompletedProcess(argv, 0, stdout, "")
        if argv[0] == "/usr/bin/dpkg":
            return subprocess.CompletedProcess(argv, 0, "", "")
        if argv == ("/usr/bin/cc", "--version"):
            return subprocess.CompletedProcess(argv, 0, "gcc 13\n", "")
        if argv == ("/usr/bin/pkg-config", "--version"):
            return subprocess.CompletedProcess(argv, 0, "1.8.1\n", "")
        if argv == ("/usr/bin/pkg-config", "--modversion", "libheif"):
            return subprocess.CompletedProcess(argv, 0, "1.17.6\n", "")
        if argv == ("/usr/bin/pkg-config", "--cflags", "--libs", "libheif"):
            return subprocess.CompletedProcess(argv, 0, "-lheif\n", "")
        if argv[0] == "/usr/bin/cc":
            helper = Path(argv[argv.index("-o") + 1])
            helper.write_bytes(b"fake helper")
            helper.chmod(0o700)
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(
            argv,
            1,
            "",
            "HEIC contains a hidden crop/rotation/mirror transformation\n",
        )

    with pytest.raises(RasterQualificationError, match="hidden crop/rotation/mirror"):
        SystemLibheifDecoder(os_release=os_release, runner=runner).decode_no_autorotate(
            heic, encoded_width=360, encoded_height=640
        )


def test_system_libheif_backend_rejects_stale_noble_security_revision(tmp_path):
    os_release = tmp_path / "os-release"
    os_release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
    calls: list[tuple[str, ...]] = []

    def runner(argv, *, env, timeout):
        argv = tuple(argv)
        calls.append(argv)
        if argv[0] == "/usr/bin/dpkg-query":
            stdout = "".join(
                f"{package}\tii \t1.17.6-1ubuntu4.5\n"
                for package in (
                    "libheif1",
                    "libheif-dev",
                    "libheif-plugin-libde265",
                )
            )
            return subprocess.CompletedProcess(argv, 0, stdout, "")
        if argv[0] == "/usr/bin/dpkg":
            return subprocess.CompletedProcess(argv, 1, "", "stale revision")
        raise AssertionError(
            "compiler must not run with a stale libheif security revision"
        )

    with pytest.raises(RasterQualificationError) as failure:
        SystemLibheifDecoder(os_release=os_release, runner=runner).decode_no_autorotate(
            b"fixture", encoded_width=360, encoded_height=640
        )
    assert failure.value.code == "FIELD_RASTER_DECODER_UNSUPPORTED"
    assert "security revision" in str(failure.value)
    assert len(calls) == 2


def test_fixture_symlink_is_rejected_without_following_it(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    external = tmp_path / "external.json"
    external.write_bytes(config.manifest_path.read_bytes())
    config.manifest_path.unlink()
    config.manifest_path.symlink_to(external)

    with pytest.raises(RasterQualificationError, match="without following symlinks"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()


def test_fixture_fifo_is_rejected_without_blocking(tmp_path):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    config.manifest_path.unlink()
    os.mkfifo(config.manifest_path, mode=0o600)

    with pytest.raises(RasterQualificationError, match="regular non-symlink"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()


def test_publication_failure_removes_partial_artifacts_and_output_directory(
    tmp_path, monkeypatch
):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    real_write = qualification._write_exclusive
    calls = 0

    def fail_second_write(path, payload):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RasterQualificationError("injected receipt publication failure")
        real_write(path, payload)

    monkeypatch.setattr(qualification, "_write_exclusive", fail_second_write)
    with pytest.raises(RasterQualificationError, match="injected"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()
    assert not list(tmp_path.glob(".qualification-output.staging-*"))


def test_parent_fsync_failure_rolls_back_atomic_publication(tmp_path, monkeypatch):
    config, native, _ = _write_fixture(tmp_path / "fixture")
    real_fsync_directory = qualification._fsync_directory
    calls = 0

    def fail_parent_fsync(path):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("injected parent fsync failure")
        real_fsync_directory(path)

    monkeypatch.setattr(qualification, "_fsync_directory", fail_parent_fsync)
    with pytest.raises(RasterQualificationError, match="parent fsync failure"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()
    assert not list(tmp_path.glob(".qualification-output.staging-*"))


def test_rename_failure_never_publishes_final_output(tmp_path, monkeypatch):
    config, native, _ = _write_fixture(tmp_path / "fixture")

    def fail_rename(source, destination):
        raise OSError("injected atomic rename failure")

    monkeypatch.setattr(qualification, "_rename_noreplace", fail_rename)
    with pytest.raises(RasterQualificationError, match="atomic rename failure"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert not config.output_dir.exists()
    assert not list(tmp_path.glob(".qualification-output.staging-*"))


def test_raced_output_directory_is_never_replaced_or_cleaned(tmp_path, monkeypatch):
    config, native, _ = _write_fixture(tmp_path / "fixture")

    def race_destination(source, destination):
        destination.mkdir()
        (destination / "racer-sentinel").write_text("keep")
        raise RasterQualificationError(
            "qualification output directory appeared before publication"
        )

    monkeypatch.setattr(qualification, "_rename_noreplace", race_destination)
    with pytest.raises(RasterQualificationError, match="appeared before publication"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(native)),
        )
    assert (config.output_dir / "racer-sentinel").read_text() == "keep"
    assert not list(tmp_path.glob(".qualification-output.staging-*"))


def test_missing_libc_no_replace_symbol_is_a_stable_unsupported_error(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(qualification.ctypes, "CDLL", lambda *args, **kwargs: object())

    with pytest.raises(RasterQualificationError) as failure:
        qualification._rename_noreplace(tmp_path / "source", tmp_path / "destination")
    assert failure.value.code == "FIELD_RASTER_PUBLICATION_UNSUPPORTED"
    assert "lacks atomic no-replace" in str(failure.value)


# --- R118: the capture profile is declared, bounded, and provenanced ---------

# The pre-R118 marker contract, frozen as literals. This is the load-bearing
# assertion for "exact superset, not a redraw": the generalized arithmetic must
# reproduce these EXACTLY at the reference profile, or the I92 fixture's
# geometry silently changed underneath a receipt that still claims to cover it.
_PRE_R118_CONTRACT = (
    ("corner-top-left", "corner", "square-55", "#FF2020FF", 27, 27, 3025, 332, 27),
    ("corner-top-right", "corner", "square-55", "#20E060FF", 612, 27, 3025, 332, 612),
    ("corner-bottom-left", "corner", "square-55", "#2060FFFF", 27, 332, 3025, 27, 27),
    (
        "corner-bottom-right",
        "corner",
        "square-55",
        "#FFE020FF",
        612,
        332,
        3025,
        27,
        612,
    ),
    (
        "fiducial-magenta",
        "off-centre-fiducial",
        "cross-45-thickness-13",
        "#F020E0FF",
        173,
        91,
        1001,
        268,
        173,
    ),
    (
        "fiducial-cyan",
        "off-centre-fiducial",
        "diamond-radius-21",
        "#20E8F0FF",
        487,
        271,
        925,
        88,
        487,
    ),
)


def _profile(width=640, height=360, **overrides):
    block = dict(CAPTURE_PROFILE, nativeWidth=width, nativeHeight=height)
    block.update(overrides)
    return qualification._capture_profile(block)


def test_reference_profile_derivation_reproduces_the_pre_r118_contract():
    contracts = qualification.derive_marker_contracts(_profile(640, 360))

    assert len(contracts) == len(_PRE_R118_CONTRACT)
    for contract, expected in zip(contracts, _PRE_R118_CONTRACT):
        assert (
            contract.marker_id,
            contract.role,
            contract.shape,
            contract.rgba_hex,
            contract.native_x,
            contract.native_y,
            contract.exact_pixel_count,
            contract.encoded_x,
            contract.encoded_y,
        ) == expected


def test_derived_masks_have_exactly_the_derived_pixel_counts():
    """The count and the mask are derived independently; they must agree.

    At a non-reference profile there is no frozen literal to check against, so
    this is what keeps the arithmetic honest: the closed-form count and the
    enumerated mask are two different derivations of the same number.
    """

    for width, height in (
        (640, 360),
        (1920, 1440),
        (1280, 720),
        (1936, 1088),
        (960, 720),
        (4096, 2304),
        (640, 480),
    ):
        seen: dict[tuple[int, int], str] = {}
        for contract in qualification.derive_marker_contracts(_profile(width, height)):
            points = qualification._expected_marker_points(contract)
            assert len(points) == contract.exact_pixel_count, (
                width,
                height,
                contract.marker_id,
            )
            # Every drawn pixel must land inside the raster.
            assert all(0 <= x < width and 0 <= y < height for x, y in points)
            # Markers must not overlap at ANY profile. The qualifier proves a
            # marker by counting every pixel of its exact colour in the whole
            # raster and demanding the derived count; two markers sharing a
            # pixel would make the later one overwrite the earlier and that
            # count would be wrong. Clamping near the edges makes this a real
            # risk at extreme aspect ratios, not a theoretical one.
            for point in points:
                assert point not in seen, (
                    width,
                    height,
                    contract.marker_id,
                    seen.get(point),
                )
                seen[point] = contract.marker_id


def test_capture_profile_requires_every_provenance_string():
    for key in ("resolutionSource", "deviceModel", "systemVersion", "videoFormat"):
        for bad in ("", "   ", "x" * (qualification.MAX_PROVENANCE_BYTES + 1), "a\nb"):
            with pytest.raises(RasterQualificationError):
                _profile(**{key: bad})
        block = dict(CAPTURE_PROFILE)
        del block[key]
        with pytest.raises(RasterQualificationError):
            qualification._capture_profile(block)


def test_capture_profile_refuses_the_exporters_reference_design():
    """A drawing design is not a capture profile, however well-formed."""

    with pytest.raises(RasterQualificationError) as caught:
        _profile(deviceModel=qualification.REFERENCE_DESIGN_DEVICE_MODEL)

    assert caught.value.code == "FIELD_RASTER_PROFILE_NOT_PHYSICAL"


@pytest.mark.parametrize(
    ("width", "height"),
    (
        (639, 360),
        (640, 359),
        (360, 640),  # portrait: ARKit capturedImage never is
        (qualification.MAX_NATIVE_DIMENSION + 1, 1440),
        (4096, 4097),
    ),
)
def test_capture_profile_bounds_reject_unusable_declarations(width, height):
    with pytest.raises(RasterQualificationError) as caught:
        _profile(width, height)

    assert caught.value.code == "FIELD_RASTER_PROFILE_UNSUPPORTED"


def test_capture_profile_derives_the_encoded_pair_by_swapping_never_by_copying():
    """Native is landscape; encoded is that pair swapped. Conflation is silent."""

    profile = _profile(1920, 1440)

    assert (profile.native_width, profile.native_height) == (1920, 1440)
    assert (profile.encoded_width, profile.encoded_height) == (1440, 1920)
    assert profile.native_row_bytes == 1920 * 4
    assert profile.native_byte_count == 1920 * 1440 * 4


def test_manifest_requires_the_capture_profile_block(tmp_path):
    config, native, heic = _write_fixture(tmp_path / "fixture")
    manifest = _manifest(native, heic)
    del manifest["captureProfile"]
    config.manifest_path.write_bytes(_canonical_manifest_bytes(manifest))

    with pytest.raises(RasterQualificationError, match="manifest"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(_native_bgra())),
        )


def test_qualifier_declares_the_manifest_profile_to_its_decoder(tmp_path):
    """The encoded size the decoder is told must come from the manifest."""

    config, _, _ = _write_fixture(tmp_path / "fixture")
    decoder = FakeDecoder(_clockwise_rgb(_native_bgra()))

    run_field_raster_qualification(config, decoder=decoder)

    assert decoder.declared == (360, 640)


def test_receipt_records_the_qualified_profile_and_its_provenance(tmp_path):
    config, _, _ = _write_fixture(tmp_path / "fixture")

    result = run_field_raster_qualification(
        config,
        decoder=FakeDecoder(_clockwise_rgb(_native_bgra())),
    )

    recorded = _read_receipt(result.receipt_path)["fixture"]["captureProfile"]
    assert recorded["nativeWidth"] == 640
    assert recorded["nativeHeight"] == 360
    assert recorded["encodedWidth"] == 360
    assert recorded["encodedHeight"] == 640
    assert recorded["deviceModel"] == CAPTURE_PROFILE["deviceModel"]
    assert recorded["resolutionSource"] == CAPTURE_PROFILE["resolutionSource"]
    assert recorded["videoFormat"] == CAPTURE_PROFILE["videoFormat"]


def test_forged_marker_list_cannot_define_its_own_passing_criteria(tmp_path):
    """Markers are recomputed, not trusted.

    A manifest that moves a marker to wherever the raster happens to be that
    colour must be refused, or the fixture grades its own homework.
    """

    config, native, heic = _write_fixture(tmp_path / "fixture")
    manifest = _manifest(native, heic)
    manifest["markers"][0]["nativeCoordinate"] = {"x": 100, "y": 100}
    manifest["markers"][0]["expectedEncodedCoordinate"] = {"x": 259, "y": 100}
    config.manifest_path.write_bytes(_canonical_manifest_bytes(manifest))

    with pytest.raises(RasterQualificationError, match="native coordinate"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(_native_bgra())),
        )


def test_forged_marker_shape_or_count_cannot_widen_the_contract(tmp_path):
    config, native, heic = _write_fixture(tmp_path / "fixture")
    manifest = _manifest(native, heic)
    manifest["markers"][0]["shape"] = "square-3"
    config.manifest_path.write_bytes(_canonical_manifest_bytes(manifest))

    with pytest.raises(RasterQualificationError, match="profile-derived contract"):
        run_field_raster_qualification(
            config,
            decoder=FakeDecoder(_clockwise_rgb(_native_bgra())),
        )


# --- a whole qualification at a profile that is not the reference design ------


def _synthesize_fixture(root: Path, width: int, height: int):
    """Build a complete fixture at an arbitrary profile.

    Markers are drawn from the module's derived contracts. That is deliberate
    and is not circular: whether the arithmetic is RIGHT is settled against
    frozen literals at the reference profile
    (`test_reference_profile_derivation_reproduces_the_pre_r118_contract`) and
    against an independent enumeration
    (`test_derived_masks_have_exactly_the_derived_pixel_counts`). What this
    exercises is the PLUMBING — that a profile which is not 640x360 flows
    through read bounds, manifest validation, native marker checks, the decoder
    declaration, the encoded checks, and the receipt.
    """

    profile = _profile(width, height)
    contracts = qualification.derive_marker_contracts(profile)

    background = (30, 35, 43, 255)
    b, g, r, a = background[2], background[1], background[0], background[3]
    raster = bytearray(bytes((b, g, r, a)) * width * height)
    for contract in contracts:
        color = _rgba(contract.rgba_hex)
        for x, y in qualification._expected_marker_points(contract):
            _set_bgra(raster, width=width, x=x, y=y, color=color)
    native = bytes(raster)

    encoded_width, encoded_height = height, width
    rgb = bytearray(encoded_width * encoded_height * 3)
    for y in range(height):
        for x in range(width):
            offset = (y * width + x) * 4
            pb, pg, pr, _ = native[offset : offset + 4]
            encoded_offset = (x * encoded_width + (height - 1 - y)) * 3
            rgb[encoded_offset : encoded_offset + 3] = bytes((pr, pg, pb))

    heic = b"controlled-physical-device-heic-placeholder"
    horizontal = width / 640
    vertical = height / 360
    native_intrinsics = {
        "fx": 512.5 * horizontal,
        "fy": 509.25 * horizontal,
        "cx": 301.25 * horizontal,
        "cy": 154.75 * vertical,
        "imageWidth": width,
        "imageHeight": height,
    }
    manifest = {
        "schemaVersion": 2,
        "fixtureID": FIXTURE_ID,
        "captureProfile": dict(
            CAPTURE_PROFILE,
            nativeWidth=width,
            nativeHeight=height,
            videoFormat=f"{width}x{height}@60 BuiltInWideAngleCamera",
        ),
        "encodingPipeline": (
            "CVPixelBuffer(32BGRA) -> CIImage(cvPixelBuffer:) -> oriented(.right) "
            "-> CGImage -> HEIC(quality=0.75)"
        ),
        "orientation": (
            "CGImagePropertyOrientation.right (physical 90-degree clockwise raster)"
        ),
        "markerCoordinateConvention": (
            "integer pixel centres from top-left; expected encoded "
            "(x,y)=(nativeHeight-1-y,x)"
        ),
        "nativeRaster": {
            "fileName": f"{FIXTURE_ID}-native.bgra",
            "width": width,
            "height": height,
            "rowBytes": width * 4,
            "pixelFormat": "32BGRA, tightly packed, top-left row first",
            "sha256": _sha256(native),
        },
        "encodedRaster": {
            "fileName": f"{FIXTURE_ID}.heic",
            "width": encoded_width,
            "height": encoded_height,
            "mimeType": "image/heic",
            "sha256": _sha256(heic),
        },
        "nativeIntrinsics": native_intrinsics,
        "expectedEncodedIntrinsics": {
            "fx": native_intrinsics["fy"],
            "fy": native_intrinsics["fx"],
            "cx": height - native_intrinsics["cy"],
            "cy": native_intrinsics["cx"],
            "imageWidth": encoded_width,
            "imageHeight": encoded_height,
        },
        "markers": [
            {
                "id": contract.marker_id,
                "role": contract.role,
                "shape": contract.shape,
                "rgbaHex": contract.rgba_hex,
                "nativeCoordinate": {"x": contract.native_x, "y": contract.native_y},
                "expectedEncodedCoordinate": {
                    "x": contract.encoded_x,
                    "y": contract.encoded_y,
                },
            }
            for contract in contracts
        ],
    }

    root.mkdir()
    manifest_path = root / f"{FIXTURE_ID}.json"
    native_path = root / f"{FIXTURE_ID}-native.bgra"
    heic_path = root / f"{FIXTURE_ID}.heic"
    manifest_path.write_bytes(_canonical_manifest_bytes(manifest))
    native_path.write_bytes(native)
    heic_path.write_bytes(heic)
    config = QualificationConfig(
        manifest_path=manifest_path,
        native_bgra_path=native_path,
        heic_path=heic_path,
        output_dir=root.parent / "qualification-output",
    )
    return config, bytes(rgb), encoded_width, encoded_height


def test_qualification_passes_at_a_profile_that_is_not_the_reference_design(tmp_path):
    # 960x720 is 4:3, so `size_numerator = min(W*360, H*640)` is driven by the
    # width term — a different branch from the reference profile, where the two
    # terms are equal. A pure 16:9 scale would not exercise that.
    config, rgb, encoded_width, encoded_height = _synthesize_fixture(
        tmp_path / "fixture", 960, 720
    )
    decoder = FakeDecoder(rgb, width=encoded_width, height=encoded_height)

    result = run_field_raster_qualification(config, decoder=decoder)

    assert decoder.declared == (720, 960)
    receipt = _read_receipt(result.receipt_path)
    assert receipt["fixture"]["captureProfile"]["nativeWidth"] == 960
    assert receipt["fixture"]["captureProfile"]["nativeHeight"] == 720
    assert receipt["fixture"]["nativeRaster"]["rowBytes"] == 3840
    assert receipt["geometry"]["encodedDimensions"] == {"width": 720, "height": 960}
    assert receipt["materializedRaster"]["width"] == 720
    assert receipt["materializedRaster"]["height"] == 960
    ppm = result.materialized_raster_path.read_bytes()
    assert ppm.startswith(b"P6\n720 960\n255\n")
    assert len(ppm) == len(b"P6\n720 960\n255\n") + 720 * 960 * 3
    assert {marker["id"] for marker in receipt["geometry"]["markers"]} == {
        blueprint[0] for blueprint in qualification._MARKER_BLUEPRINTS
    }
