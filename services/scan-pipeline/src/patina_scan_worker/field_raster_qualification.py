"""Qualify and materialize the physical Field/Core Image raster contract.

This is a standalone, local-only gate. It reads the three files exported by the
Debug iOS fixture and writes a deterministic PPM plus a canonical receipt to a
new output directory. It deliberately has no queue, database, Storage, worker,
or configuration imports.

The fixture DECLARES its capture profile (R118). The manifest carries
``captureProfile`` — the native landscape resolution plus the provenance of that
reading — and everything here is derived from it: the expected raster sizes, the
rotated encoded pair, and the entire expected marker set, which is RECOMPUTED by
exact integer arithmetic rather than read from the manifest. Trusting the
manifest's marker list would let a forged fixture define its own passing
criteria. At the 640x360 reference design every derivation collapses to the
pre-R118 constant, so the generalization is an exact superset, not a redraw.

HEIC decoding is delegated to a tiny packaged C helper compiled unprivileged
against Ubuntu's security-maintained system libheif. The helper is told the
encoded size on argv and echoes it back, so it cannot silently enforce a
different profile from the one declared. It decodes once with
``ignore_transformations=1`` and once with libheif defaults, then requires
the dimensions and RGB bytes to be identical. Through libheif's public API it
permits only ImageIO's single recognized, primary-item-associated identity
``irot`` property and rejects recognized effective or ambiguous crop, rotation,
and mirror transforms before off-centre marker geometry is checked or any
output directory is created.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import math
import os
import re
import shlex
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, Sequence

FIXTURE_ID = "field-core-image-raster-v1"
QUALIFICATION_NAME = "p2-item4a-field-core-image-raster"
# v3 is the R118 receipt: it records the capture profile it qualified and that
# profile's provenance. A v2 receipt could not say which profile it covered —
# there was only one, pinned — so a v2 and a v3 receipt are not interchangeable
# evidence and must not share a file name. The I92 v2 receipt is superseded, not
# extended.
QUALIFICATION_SCHEMA_VERSION = 3
MATERIALIZED_RASTER_NAME = f"{FIXTURE_ID}-materialized.ppm"
RECEIPT_NAME = "field-raster-qualification-receipt-v3.json"

# The 640x360 REFERENCE DRAWING DESIGN.  These are not a capture profile and
# must never be read as one: they are the basis the fixture's marker geometry is
# scaled from, and the exporter derives every position and extent from them by
# exact integer arithmetic.  A fixture's actual size arrives in its manifest's
# `captureProfile` — see `CaptureProfile` — because capture resolution is a
# property of the device and the ARKit configuration, not of any code here.
REFERENCE_NATIVE_WIDTH = 640
REFERENCE_NATIVE_HEIGHT = 360

# Fixture manifest schema.  v2 added `captureProfile`; v1 declared no size at
# all beyond the pinned 640x360 and is no longer accepted.
FIXTURE_MANIFEST_SCHEMA_VERSION = 2

# `captureProfile.deviceModel` the exporter reserves for its reference design.
# A fixture carrying it is a drawing, not a capture, and is refused outright:
# accepting one would qualify a profile no device produces, which is exactly the
# R118 defect.
REFERENCE_DESIGN_DEVICE_MODEL = "reference-design"

# Profile bounds.  Floor: the exporter refuses anything below the reference
# design, because the markers scale down with the profile and below 640x360 they
# stop being safely larger than the encoded-marker search radius.  Ceiling: the
# per-axis limit is the packaged helper's own MAX_DIMENSION — it applies to the
# ENCODED pair, but the encoded pair is the native pair swapped, so bounding
# native bounds both.  The pixel ceiling matches the exporter's 2^24 bound.
MIN_NATIVE_WIDTH = REFERENCE_NATIVE_WIDTH
MIN_NATIVE_HEIGHT = REFERENCE_NATIVE_HEIGHT
MAX_NATIVE_DIMENSION = 4096
MAX_NATIVE_PIXELS = 1 << 24
MAX_PROVENANCE_BYTES = 512

ENCODING_PIPELINE = (
    "CVPixelBuffer(32BGRA) -> CIImage(cvPixelBuffer:) -> oriented(.right) "
    "-> CGImage -> HEIC(quality=0.75)"
)
ORIENTATION_CONTRACT = (
    "CGImagePropertyOrientation.right (physical 90-degree clockwise raster)"
)
MARKER_COORDINATE_CONVENTION = (
    "integer pixel centres from top-left; expected encoded (x,y)=(nativeHeight-1-y,x)"
)
NATIVE_PIXEL_FORMAT = "32BGRA, tightly packed, top-left row first"

LOSSY_MARKER_SEARCH_RADIUS_PX = 3
LOSSY_MARKER_MAX_CHANNEL_ERROR = 64
MAX_MANIFEST_BYTES = 128 * 1024
MAX_HEIC_BYTES = 32 * 1024 * 1024
MAX_HELPER_SOURCE_BYTES = 256 * 1024
MAX_HARNESS_SOURCE_BYTES = 2 * 1024 * 1024
MAX_TOOL_OUTPUT_BYTES = 64 * 1024
MAX_HEVC_DECODER_DESCRIPTORS = 32
TOOL_TIMEOUT_S = 120.0
LIBHEIF_HELPER_SOURCE_NAME = "field_raster_libheif.c"
# v3 is the R118 protocol: the encoded raster size is carried to the helper on
# argv and echoed back as `declared_width`/`declared_height` instead of being
# compiled in.  The schema string is the protocol's identity, so it moves with
# the argv arity and the stdout key set.  A v2 helper meeting a v3 parser (or
# the reverse) already fails closed on the exact key-set comparison below; the
# version bump is what makes the *reason* legible instead of reporting a
# generic schema mismatch.
LIBHEIF_HELPER_SCHEMA = "patina-field-raster-libheif-helper-v3"
CC_PATH = Path("/usr/bin/cc")
PKG_CONFIG_PATH = Path("/usr/bin/pkg-config")
DPKG_QUERY_PATH = Path("/usr/bin/dpkg-query")
DPKG_PATH = Path("/usr/bin/dpkg")
OS_RELEASE_PATH = Path("/etc/os-release")
MIN_NOBLE_LIBHEIF_PACKAGE_VERSION = "1.17.6-1ubuntu4.6"
REQUIRED_LIBHEIF_PACKAGES = (
    "libheif1",
    "libheif-dev",
    "libheif-plugin-libde265",
)
NOBLE_PKG_CONFIG_LIBDIR = (
    "/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig"
)


@dataclass(frozen=True)
class CaptureProfile:
    """The physical capture profile a fixture declares, plus its provenance.

    The provenance is load-bearing, not decoration.  A manifest that declared a
    size with no evidence of where the size came from would let exactly the R118
    defect recur silently — a fixture profile assumed to match production, with
    nothing in the receipt able to contradict it.  So every string here is
    required and non-empty, and `resolutionSource` must say which API on which
    configuration produced the numbers.

    ``native_*`` is the ARKit landscape captured-image size.  The encoded HEIC is
    that pair SWAPPED, because Field encodes ``.right``-rotated.  Conflating the
    two is easy and silent, so the two are never both spelled as bare integers:
    the encoded pair only exists as the derived properties below.
    """

    native_width: int
    native_height: int
    resolution_source: str
    device_model: str
    system_version: str
    video_format: str

    @property
    def encoded_width(self) -> int:
        return self.native_height

    @property
    def encoded_height(self) -> int:
        return self.native_width

    @property
    def native_row_bytes(self) -> int:
        return self.native_width * 4

    @property
    def native_byte_count(self) -> int:
        return self.native_row_bytes * self.native_height

    @property
    def label(self) -> str:
        return f"{self.native_width}x{self.native_height}"


@dataclass(frozen=True)
class MarkerContract:
    marker_id: str
    role: str
    shape: str
    rgba_hex: str
    native_x: int
    native_y: int
    exact_pixel_count: int
    encoded_x: int
    encoded_y: int
    kind: str
    primary_half: int
    secondary_half: int

    @property
    def expected_encoded(self) -> tuple[int, int]:
        return self.encoded_x, self.encoded_y

    @property
    def rgba(self) -> tuple[int, int, int, int]:
        payload = bytes.fromhex(self.rgba_hex.removeprefix("#"))
        return payload[0], payload[1], payload[2], payload[3]


# id, role, rgbaHex, kind, corner index (ignored for non-corners). Order is part
# of the contract: four corners TL/TR/BL/BR, then the cross, then the diamond.
_MARKER_BLUEPRINTS = (
    ("corner-top-left", "corner", "#FF2020FF", "square", 0),
    ("corner-top-right", "corner", "#20E060FF", "square", 1),
    ("corner-bottom-left", "corner", "#2060FFFF", "square", 2),
    ("corner-bottom-right", "corner", "#FFE020FF", "square", 3),
    ("fiducial-magenta", "off-centre-fiducial", "#F020E0FF", "cross", 0),
    ("fiducial-cyan", "off-centre-fiducial", "#20E8F0FF", "diamond", 0),
)


def _scaled(value: int, numerator: int, denominator: int) -> int:
    """round-half-up(value * numerator / denominator), in exact integers.

    Mirrors ``FieldRasterFixtureExporter.scaled``.  Integer arithmetic, not
    float: the qualifier must land on the same pixel the exporter drew, and a
    rounding disagreement would present as a marker-mask failure with no clue
    why.
    """

    return (2 * value * numerator + denominator) // (2 * denominator)


def derive_marker_contracts(profile: CaptureProfile) -> tuple[MarkerContract, ...]:
    """Recompute the whole expected marker set from the declared profile.

    The qualifier RECOMPUTES rather than trusting the manifest's marker list.
    Trusting it would let a forged manifest define its own passing criteria —
    declare a marker wherever the raster happens to be that colour and the
    fixture always passes.  Every number below is derived from the two declared
    dimensions and the 640x360 reference design by exact integer arithmetic, so
    at the reference profile every expression collapses to the pre-R118 constant
    and the generalization is an exact superset, not a redraw.
    """

    width = profile.native_width
    height = profile.native_height
    size_numerator = min(
        width * REFERENCE_NATIVE_HEIGHT, height * REFERENCE_NATIVE_WIDTH
    )
    size_denominator = REFERENCE_NATIVE_WIDTH * REFERENCE_NATIVE_HEIGHT

    def size(reference: int) -> int:
        return _scaled(reference, size_numerator, size_denominator)

    def position_x(reference: int) -> int:
        return _scaled(reference, width, REFERENCE_NATIVE_WIDTH)

    def position_y(reference: int) -> int:
        return _scaled(reference, height, REFERENCE_NATIVE_HEIGHT)

    def clamped(x: int, y: int, half_x: int, half_y: int) -> tuple[int, int]:
        return (
            min(max(x, half_x), width - 1 - half_x),
            min(max(y, half_y), height - 1 - half_y),
        )

    corner_half = size(27)
    cross_half = size(22)
    cross_thickness = size(6)
    diamond_radius = size(21)

    corners = (
        (corner_half, corner_half),
        (width - 1 - corner_half, corner_half),
        (corner_half, height - 1 - corner_half),
        (width - 1 - corner_half, height - 1 - corner_half),
    )
    cross_center = clamped(position_x(173), position_y(91), cross_half, cross_half)
    diamond_center = clamped(
        position_x(487), position_y(271), diamond_radius, diamond_radius
    )

    corner_side = 2 * corner_half + 1
    cross_side = 2 * cross_half + 1
    cross_bar = 2 * cross_thickness + 1
    contracts: list[MarkerContract] = []
    for marker_id, role, rgba_hex, kind, corner_index in _MARKER_BLUEPRINTS:
        if kind == "square":
            native_x, native_y = corners[corner_index]
            shape = f"square-{corner_side}"
            count = corner_side * corner_side
            primary, secondary = corner_half, 0
        elif kind == "cross":
            native_x, native_y = cross_center
            shape = f"cross-{cross_side}-thickness-{cross_bar}"
            # Two overlapping bars minus the double-counted centre block.
            count = cross_side * cross_bar * 2 - cross_bar * cross_bar
            primary, secondary = cross_half, cross_thickness
        else:
            native_x, native_y = diamond_center
            shape = f"diamond-radius-{diamond_radius}"
            # |dx| + |dy| <= r has exactly 2r^2 + 2r + 1 lattice points.
            count = 2 * diamond_radius * diamond_radius + 2 * diamond_radius + 1
            primary, secondary = diamond_radius, 0
        contracts.append(
            MarkerContract(
                marker_id=marker_id,
                role=role,
                shape=shape,
                rgba_hex=rgba_hex,
                native_x=native_x,
                native_y=native_y,
                exact_pixel_count=count,
                # The physical clockwise raster maps native (x,y) -> (H-1-y, x).
                encoded_x=height - 1 - native_y,
                encoded_y=native_x,
                kind=kind,
                primary_half=primary,
                secondary_half=secondary,
            )
        )
    return tuple(contracts)


class RasterQualificationError(ValueError):
    """A stable, fail-closed qualification error."""

    def __init__(self, message: str, code: str = "FIELD_RASTER_QUALIFICATION_FAILED"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class QualificationConfig:
    manifest_path: Path
    native_bgra_path: Path
    heic_path: Path
    output_dir: Path


@dataclass(frozen=True)
class DecodedRaster:
    width: int
    height: int
    rgb: bytes
    source_channels: int
    source_pixel_type: str
    decoder_name: str
    decoder_version: str
    decoder_id: str
    decoder_descriptor_name: str
    hevc_decoder_descriptor_count: int
    matching_decoder_descriptor_count: int
    input_mime_type: str
    metadata_blocks: int
    info_width: int
    info_height: int
    presented_width: int
    presented_height: int
    default_width: int
    default_height: int
    transformation_property_count: int
    transformation_property_type: str
    transformation_rotation_ccw: int
    raw_default_rgb_identical: bool
    compiler_version: str
    pkg_config_version: str
    pkg_config_libheif_version: str
    helper_source_sha256: str
    os_release: str
    package_versions: Mapping[str, str]


@dataclass(frozen=True)
class QualificationResult:
    materialized_raster_path: Path
    receipt_path: Path
    receipt: Mapping[str, Any]


class RasterDecoder(Protocol):
    def decode_no_autorotate(
        self,
        heic: bytes,
        *,
        encoded_width: int,
        encoded_height: int,
    ) -> DecodedRaster: ...


CommandRunner = Callable[..., subprocess.CompletedProcess[str]]


def _default_command_runner(
    argv: Sequence[str],
    *,
    env: Mapping[str, str],
    timeout: float,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(argv),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=dict(env),
        timeout=timeout,
    )


def _tool_environment(scratch: Path) -> dict[str, str]:
    # Do not inherit compiler/pkg-config/library injection knobs from the
    # operator shell. The helper is compiled and run without privilege.
    return {
        "HOME": str(scratch),
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "PKG_CONFIG_LIBDIR": NOBLE_PKG_CONFIG_LIBDIR,
        "TZ": "UTC",
    }


def _bounded_detail(value: str) -> str:
    encoded = value.encode("utf-8", errors="replace")
    if len(encoded) > MAX_TOOL_OUTPUT_BYTES:
        encoded = encoded[-MAX_TOOL_OUTPUT_BYTES:]
    return encoded.decode("utf-8", errors="replace").strip()


def _ppm_token(payload: bytes, offset: int) -> tuple[bytes, int]:
    length = len(payload)
    while offset < length:
        if payload[offset] in b" \t\r\n\v\f":
            offset += 1
            continue
        if payload[offset] == ord("#"):
            newline = payload.find(b"\n", offset)
            if newline < 0:
                raise RasterQualificationError(
                    "decoder PPM has an unterminated comment"
                )
            offset = newline + 1
            continue
        break
    start = offset
    while offset < length and payload[offset] not in b" \t\r\n\v\f#":
        offset += 1
    if start == offset:
        raise RasterQualificationError("decoder PPM header is incomplete")
    return payload[start:offset], offset


def _parse_ppm(payload: bytes) -> tuple[int, int, bytes]:
    magic, offset = _ppm_token(payload, 0)
    width_token, offset = _ppm_token(payload, offset)
    height_token, offset = _ppm_token(payload, offset)
    maximum_token, offset = _ppm_token(payload, offset)
    if magic != b"P6" or maximum_token != b"255":
        raise RasterQualificationError(
            "libheif helper must materialize an 8-bit binary RGB PPM"
        )
    try:
        width, height = int(width_token), int(height_token)
    except ValueError as exc:
        raise RasterQualificationError("decoder PPM dimensions are invalid") from exc
    if width <= 0 or height <= 0:
        raise RasterQualificationError("decoder PPM dimensions must be positive")
    if offset >= len(payload) or payload[offset] not in b" \t\r\n\v\f":
        raise RasterQualificationError("decoder PPM header has no raster delimiter")
    if payload[offset : offset + 2] == b"\r\n":
        offset += 2
    else:
        offset += 1
    pixels = payload[offset:]
    if len(pixels) != width * height * 3:
        raise RasterQualificationError(
            "decoder PPM byte count does not match its dimensions"
        )
    return width, height, pixels


def _first_line(value: str, label: str) -> str:
    line = value.strip().splitlines()[0] if value.strip() else ""
    if not line or len(line.encode("utf-8")) > 512:
        raise RasterQualificationError(
            f"{label} did not report a bounded version",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        )
    return line


def _parse_helper_metadata(stdout: str) -> dict[str, str]:
    expected_keys = {
        "schema",
        "libheif_version",
        "decoder_id",
        "decoder_name",
        "decoder_descriptor_count",
        "matching_decoder_descriptor_count",
        "input_mime_type",
        "top_level_images",
        "metadata_blocks",
        "transformation_properties",
        "transformation_property_type",
        "transformation_rotation_ccw",
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
        "raw_default_rgb_identical",
    }
    values: dict[str, str] = {}
    for line in stdout.splitlines():
        key, separator, value = line.partition("=")
        if not separator or key in values:
            raise RasterQualificationError(
                "libheif helper emitted malformed metadata",
                "FIELD_RASTER_DECODE_FAILED",
            )
        values[key] = value
    if set(values) != expected_keys or values["schema"] != LIBHEIF_HELPER_SCHEMA:
        raise RasterQualificationError(
            "libheif helper metadata schema mismatch",
            "FIELD_RASTER_DECODE_FAILED",
        )
    if not re.fullmatch(r"[0-9A-Za-z.+~_-]{1,128}", values["libheif_version"]):
        raise RasterQualificationError(
            "libheif helper reported an invalid version",
            "FIELD_RASTER_DECODE_FAILED",
        )
    if values["decoder_id"] != "libde265":
        raise RasterQualificationError(
            "libheif helper did not pin the HEVC decoder to libde265",
            "FIELD_RASTER_DECODE_FAILED",
        )
    if values["input_mime_type"] != "image/heic":
        raise RasterQualificationError(
            "libheif helper did not prove an HEVC-compressed HEIC input",
            "FIELD_RASTER_DECODE_FAILED",
        )
    if values["matching_decoder_descriptor_count"] != "1":
        raise RasterQualificationError(
            "libheif helper did not prove exactly one libde265 descriptor",
            "FIELD_RASTER_DECODE_FAILED",
        )
    for key in ("transformation_properties", "transformation_rotation_ccw"):
        if not re.fullmatch(r"(?:0|[1-9][0-9]{0,3})", values[key]):
            raise RasterQualificationError(
                f"libheif helper metadata {key} is invalid",
                "FIELD_RASTER_DECODE_FAILED",
            )
    if (
        values["transformation_properties"] != "1"
        or values["transformation_property_type"] != "irot"
        or values["transformation_rotation_ccw"] != "0"
    ):
        raise RasterQualificationError(
            "libheif did not prove exactly one identity irot property",
            "FIELD_RASTER_ORIENTATION_MISMATCH",
        )
    if not re.fullmatch(r"[ -~]{1,256}", values["decoder_name"]):
        raise RasterQualificationError(
            "libheif helper reported an invalid decoder descriptor name",
            "FIELD_RASTER_DECODE_FAILED",
        )
    # `declared_*` is the profile the caller put on argv, echoed back by the
    # helper.  Checking it here means every consumer of this parser gets the
    # dimensions carried explicitly and internally consistent, instead of each
    # one re-deriving a size from whichever of the six reported dimensions it
    # happened to read.  `_metadata_positive_int` bounds all of them at 4096,
    # the helper's own MAX_DIMENSION.
    for axis in ("width", "height"):
        declared = _metadata_positive_int(values, f"declared_{axis}")
        for key in (
            f"ispe_{axis}",
            f"presented_{axis}",
            f"raw_{axis}",
            f"default_{axis}",
        ):
            if _metadata_positive_int(values, key) != declared:
                raise RasterQualificationError(
                    f"libheif helper {key} disagrees with the declared "
                    f"{axis} {declared}",
                    "FIELD_RASTER_DECODE_FAILED",
                )
    descriptor_count = _metadata_positive_int(values, "decoder_descriptor_count")
    if descriptor_count > MAX_HEVC_DECODER_DESCRIPTORS:
        raise RasterQualificationError(
            "libheif helper reported too many HEVC decoder descriptors",
            "FIELD_RASTER_DECODE_FAILED",
        )
    return values


def _metadata_positive_int(metadata: Mapping[str, str], key: str) -> int:
    try:
        value = int(metadata[key])
    except (KeyError, ValueError) as exc:
        raise RasterQualificationError(
            f"libheif helper metadata {key} is invalid",
            "FIELD_RASTER_DECODE_FAILED",
        ) from exc
    if value <= 0 or value > 4096:
        raise RasterQualificationError(
            f"libheif helper metadata {key} is outside its bound",
            "FIELD_RASTER_DECODE_FAILED",
        )
    return value


def _validated_pkg_config_tokens(stdout: str) -> tuple[str, ...]:
    try:
        tokens = tuple(shlex.split(stdout, posix=True))
    except ValueError as exc:
        raise RasterQualificationError(
            "pkg-config emitted malformed libheif flags",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        ) from exc
    for token in tokens:
        allowed = (
            token == "-pthread"
            or bool(re.fullmatch(r"-l[A-Za-z0-9_+.-]+", token))
            or bool(re.fullmatch(r"-[IL]/[A-Za-z0-9_+.,/@:-]+", token))
            or bool(
                re.fullmatch(r"-D[A-Za-z_][A-Za-z0-9_]*(?:=[A-Za-z0-9_+.,-]+)?", token)
            )
        )
        if not allowed:
            raise RasterQualificationError(
                f"pkg-config emitted unsupported compiler flag {token!r}",
                "FIELD_RASTER_DECODER_UNSUPPORTED",
            )
    if "-lheif" not in tokens:
        raise RasterQualificationError(
            "pkg-config did not select system libheif",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        )
    return tokens


def _parse_os_release(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RasterQualificationError(
            f"could not read the host OS release: {exc}",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        ) from exc
    values: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if separator and key in {"ID", "VERSION_ID", "PRETTY_NAME"}:
            values[key] = value.strip().strip('"')
    if values.get("ID") != "ubuntu" or values.get("VERSION_ID") != "24.04":
        raise RasterQualificationError(
            "Field raster qualification requires the patched Ubuntu 24.04 libheif boundary",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        )
    return values.get("PRETTY_NAME", "Ubuntu 24.04")


def _parse_dpkg_packages(stdout: str) -> dict[str, str]:
    packages: dict[str, str] = {}
    for line in stdout.splitlines():
        fields = line.split("\t")
        if len(fields) != 3:
            raise RasterQualificationError(
                "dpkg-query emitted malformed libheif package evidence",
                "FIELD_RASTER_DECODER_UNSUPPORTED",
            )
        package, status, version = fields
        if package in packages or package not in REQUIRED_LIBHEIF_PACKAGES:
            raise RasterQualificationError(
                "dpkg-query emitted unexpected libheif package evidence",
                "FIELD_RASTER_DECODER_UNSUPPORTED",
            )
        if status.strip() != "ii" or not re.fullmatch(
            r"[0-9A-Za-z.+:~_-]{1,128}", version
        ):
            raise RasterQualificationError(
                f"required package {package} is not installed with a valid version",
                "FIELD_RASTER_DECODER_UNSUPPORTED",
            )
        packages[package] = version
    if set(packages) != set(REQUIRED_LIBHEIF_PACKAGES):
        raise RasterQualificationError(
            "the required Noble libheif runtime/dev/HEVC plugin package set is incomplete",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        )
    if len(set(packages.values())) != 1:
        raise RasterQualificationError(
            "the Noble libheif runtime/dev/HEVC plugin package versions do not match",
            "FIELD_RASTER_DECODER_UNSUPPORTED",
        )
    return packages


def _write_scratch_file(path: Path, payload: bytes, mode: int) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        os.close(descriptor)


class SystemLibheifDecoder:
    """Compile and run the packaged strict-transform helper without privilege."""

    def __init__(
        self,
        *,
        cc: Path = CC_PATH,
        pkg_config: Path = PKG_CONFIG_PATH,
        dpkg_query: Path = DPKG_QUERY_PATH,
        dpkg: Path = DPKG_PATH,
        os_release: Path = OS_RELEASE_PATH,
        helper_source: Path | None = None,
        runner: CommandRunner = _default_command_runner,
    ) -> None:
        if not all(path.is_absolute() for path in (cc, pkg_config, dpkg_query, dpkg)):
            raise RasterQualificationError("qualification tool paths must be absolute")
        self._cc = cc
        self._pkg_config = pkg_config
        self._dpkg_query = dpkg_query
        self._dpkg = dpkg
        self._os_release = os_release
        self._helper_source = helper_source or Path(__file__).with_name(
            LIBHEIF_HELPER_SOURCE_NAME
        )
        self._runner = runner

    def _run(
        self,
        argv: Sequence[str],
        *,
        environment: Mapping[str, str],
        operation: str,
        failure_code: str = "FIELD_RASTER_DECODE_FAILED",
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = self._runner(
                argv,
                env=environment,
                timeout=TOOL_TIMEOUT_S,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise RasterQualificationError(
                f"{operation} could not run ({type(exc).__name__}: {exc})",
                "FIELD_RASTER_DECODER_UNAVAILABLE",
            ) from exc
        if result.returncode != 0:
            detail = _bounded_detail(result.stderr or result.stdout)
            raise RasterQualificationError(
                f"{operation} failed with exit {result.returncode}: {detail}",
                failure_code,
            )
        return result

    def decode_no_autorotate(
        self,
        heic: bytes,
        *,
        encoded_width: int,
        encoded_height: int,
    ) -> DecodedRaster:
        os_release = _parse_os_release(self._os_release)
        helper_source = _read_packaged_helper_source(self._helper_source)

        with tempfile.TemporaryDirectory(
            prefix="patina-field-raster-"
        ) as scratch_value:
            scratch = Path(scratch_value)
            environment = _tool_environment(scratch)
            package_query = self._run(
                (
                    str(self._dpkg_query),
                    "-W",
                    "-f=${Package}\\t${db:Status-Abbrev}\\t${Version}\\n",
                    *REQUIRED_LIBHEIF_PACKAGES,
                ),
                environment=environment,
                operation="Noble libheif package probe",
                failure_code="FIELD_RASTER_DECODER_UNSUPPORTED",
            )
            package_versions = _parse_dpkg_packages(package_query.stdout)
            for package, version in package_versions.items():
                self._run(
                    (
                        str(self._dpkg),
                        "--compare-versions",
                        version,
                        "ge",
                        MIN_NOBLE_LIBHEIF_PACKAGE_VERSION,
                    ),
                    environment=environment,
                    operation=f"{package} security revision probe",
                    failure_code="FIELD_RASTER_DECODER_UNSUPPORTED",
                )
            cc_version = _first_line(
                self._run(
                    (str(self._cc), "--version"),
                    environment=environment,
                    operation="C compiler version probe",
                ).stdout,
                "C compiler",
            )
            pkg_config_version = _first_line(
                self._run(
                    (str(self._pkg_config), "--version"),
                    environment=environment,
                    operation="pkg-config version probe",
                ).stdout,
                "pkg-config",
            )
            pkg_libheif_version = _first_line(
                self._run(
                    (str(self._pkg_config), "--modversion", "libheif"),
                    environment=environment,
                    operation="libheif development package probe",
                ).stdout,
                "libheif development package",
            )
            flags = _validated_pkg_config_tokens(
                self._run(
                    (str(self._pkg_config), "--cflags", "--libs", "libheif"),
                    environment=environment,
                    operation="libheif compiler flags probe",
                ).stdout
            )

            source_path = scratch / LIBHEIF_HELPER_SOURCE_NAME
            helper_path = scratch / "field-raster-libheif-helper"
            heic_path = scratch / f"{FIXTURE_ID}.heic"
            ppm_path = scratch / "decoded.ppm"
            _write_scratch_file(source_path, helper_source, 0o600)
            _write_scratch_file(heic_path, heic, 0o600)
            compile_argv = (
                str(self._cc),
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
                str(source_path),
                "-o",
                str(helper_path),
                *flags,
            )
            self._run(
                compile_argv,
                environment=environment,
                operation="libheif helper compilation",
            )
            try:
                helper_mode = helper_path.stat().st_mode
            except OSError as exc:
                raise RasterQualificationError(
                    f"compiler did not create the helper executable: {exc}",
                    "FIELD_RASTER_DECODER_UNAVAILABLE",
                ) from exc
            if not stat.S_ISREG(helper_mode) or not helper_mode & stat.S_IXUSR:
                raise RasterQualificationError(
                    "compiler output is not an executable regular file",
                    "FIELD_RASTER_DECODER_UNAVAILABLE",
                )
            # The encoded size is DECLARED to the helper rather than assumed by
            # it (R118).  It comes from the fixture's own captureProfile, so a
            # fixture at any qualified profile decodes through the same helper.
            helper_result = self._run(
                (
                    str(helper_path),
                    str(heic_path),
                    str(ppm_path),
                    str(encoded_width),
                    str(encoded_height),
                ),
                environment=environment,
                operation="libheif raw/default decode",
            )
            metadata = _parse_helper_metadata(helper_result.stdout)
            try:
                decoded_payload = ppm_path.read_bytes()
            except OSError as exc:
                raise RasterQualificationError(
                    f"libheif helper did not create its scratch PPM: {exc}",
                    "FIELD_RASTER_DECODE_FAILED",
                ) from exc

        width, height, pixels = _parse_ppm(decoded_payload)
        info_width = _metadata_positive_int(metadata, "ispe_width")
        info_height = _metadata_positive_int(metadata, "ispe_height")
        raw_width = _metadata_positive_int(metadata, "raw_width")
        raw_height = _metadata_positive_int(metadata, "raw_height")
        default_width = _metadata_positive_int(metadata, "default_width")
        default_height = _metadata_positive_int(metadata, "default_height")
        if (width, height) != (raw_width, raw_height):
            raise RasterQualificationError(
                "libheif metadata and decoded PPM dimensions disagree",
                "FIELD_RASTER_DECODE_FAILED",
            )
        if (
            metadata["top_level_images"] != "1"
            or metadata["metadata_blocks"] != "0"
            or metadata["transformation_properties"] != "1"
            or metadata["transformation_property_type"] != "irot"
            or metadata["transformation_rotation_ccw"] != "0"
            or metadata["raw_default_rgb_identical"] != "1"
        ):
            raise RasterQualificationError(
                "libheif did not prove one image with exactly one identity irot",
                "FIELD_RASTER_ORIENTATION_MISMATCH",
            )
        runtime_version = metadata["libheif_version"]
        if runtime_version != pkg_libheif_version:
            raise RasterQualificationError(
                "libheif headers/pkg-config and runtime versions disagree",
                "FIELD_RASTER_DECODER_UNSUPPORTED",
            )
        return DecodedRaster(
            width=width,
            height=height,
            rgb=pixels,
            source_channels=3,
            source_pixel_type="uint8",
            decoder_name="system libheif C API helper",
            decoder_version=runtime_version,
            decoder_id=metadata["decoder_id"],
            decoder_descriptor_name=metadata["decoder_name"],
            hevc_decoder_descriptor_count=_metadata_positive_int(
                metadata, "decoder_descriptor_count"
            ),
            matching_decoder_descriptor_count=1,
            input_mime_type=metadata["input_mime_type"],
            metadata_blocks=int(metadata["metadata_blocks"]),
            info_width=info_width,
            info_height=info_height,
            presented_width=_metadata_positive_int(metadata, "presented_width"),
            presented_height=_metadata_positive_int(metadata, "presented_height"),
            default_width=default_width,
            default_height=default_height,
            transformation_property_count=int(
                metadata["transformation_properties"]
            ),
            transformation_property_type=metadata["transformation_property_type"],
            transformation_rotation_ccw=int(
                metadata["transformation_rotation_ccw"]
            ),
            raw_default_rgb_identical=True,
            compiler_version=cc_version,
            pkg_config_version=pkg_config_version,
            pkg_config_libheif_version=pkg_libheif_version,
            helper_source_sha256=hashlib.sha256(helper_source).hexdigest(),
            os_release=os_release,
            package_versions=package_versions,
        )


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    try:
        text = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise RasterQualificationError(f"receipt is not canonical JSON: {exc}") from exc
    return (text + "\n").encode("utf-8")


def _reject_duplicate_keys(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise RasterQualificationError(f"manifest contains duplicate key {key!r}")
        result[key] = value
    return result


def _load_manifest(payload: bytes) -> dict[str, Any]:
    try:
        value = json.loads(
            payload.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys
        )
    except RasterQualificationError:
        raise
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise RasterQualificationError(
            f"manifest is not valid UTF-8 JSON: {exc}"
        ) from exc
    if not isinstance(value, dict):
        raise RasterQualificationError("manifest root must be an object")
    return value


def _require_exact_keys(value: Any, keys: set[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise RasterQualificationError(f"{label} must be an object")
    actual = set(value)
    if actual != keys:
        missing = sorted(keys - actual)
        unexpected = sorted(actual - keys)
        raise RasterQualificationError(
            f"{label} schema mismatch (missing={missing}, unexpected={unexpected})"
        )
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise RasterQualificationError(f"{label} must be a non-empty string")
    return value


def _require_int(value: Any, label: str) -> int:
    if type(value) is not int:
        raise RasterQualificationError(f"{label} must be an integer")
    return value


def _require_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RasterQualificationError(f"{label} must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise RasterQualificationError(f"{label} must be finite")
    return result


def _require_sha256(value: Any, label: str) -> str:
    digest = _require_string(value, label)
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise RasterQualificationError(f"{label} must be a lowercase SHA-256")
    return digest


def _point(value: Any, label: str) -> tuple[int, int]:
    point = _require_exact_keys(value, {"x", "y"}, label)
    return _require_int(point["x"], f"{label}.x"), _require_int(
        point["y"], f"{label}.y"
    )


def _intrinsics(value: Any, label: str) -> dict[str, float | int]:
    intrinsics = _require_exact_keys(
        value,
        {"fx", "fy", "cx", "cy", "imageWidth", "imageHeight"},
        label,
    )
    return {
        "fx": _require_number(intrinsics["fx"], f"{label}.fx"),
        "fy": _require_number(intrinsics["fy"], f"{label}.fy"),
        "cx": _require_number(intrinsics["cx"], f"{label}.cx"),
        "cy": _require_number(intrinsics["cy"], f"{label}.cy"),
        "imageWidth": _require_int(intrinsics["imageWidth"], f"{label}.imageWidth"),
        "imageHeight": _require_int(intrinsics["imageHeight"], f"{label}.imageHeight"),
    }


def _require_provenance(value: object, label: str) -> str:
    text = _require_string(value, label)
    if not text.strip():
        raise RasterQualificationError(f"{label} must not be blank")
    if len(text.encode("utf-8")) > MAX_PROVENANCE_BYTES:
        raise RasterQualificationError(f"{label} exceeds its byte bound")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in text):
        raise RasterQualificationError(f"{label} must not contain control characters")
    return text


def _capture_profile(value: object) -> CaptureProfile:
    """Parse and bound the fixture's declared capture profile.

    Every provenance string is REQUIRED, not merely tolerated.  A profile that
    is two integers and nothing else cannot be audited: it is indistinguishable
    from a guess, and a guess about the capture profile is what R118 exists to
    correct.
    """

    block = _require_exact_keys(
        value,
        {
            "nativeWidth",
            "nativeHeight",
            "resolutionSource",
            "deviceModel",
            "systemVersion",
            "videoFormat",
        },
        "captureProfile",
    )
    width = _require_int(block["nativeWidth"], "captureProfile.nativeWidth")
    height = _require_int(block["nativeHeight"], "captureProfile.nativeHeight")
    profile = CaptureProfile(
        native_width=width,
        native_height=height,
        resolution_source=_require_provenance(
            block["resolutionSource"], "captureProfile.resolutionSource"
        ),
        device_model=_require_provenance(
            block["deviceModel"], "captureProfile.deviceModel"
        ),
        system_version=_require_provenance(
            block["systemVersion"], "captureProfile.systemVersion"
        ),
        video_format=_require_provenance(
            block["videoFormat"], "captureProfile.videoFormat"
        ),
    )
    # The exporter reserves this identity for its 640x360 reference drawing.
    # Refuse it outright: it is a design, not something any device captured, and
    # qualifying it would re-create the exact defect R118 corrects — a fixture
    # profile that production never ships.
    if profile.device_model == REFERENCE_DESIGN_DEVICE_MODEL:
        raise RasterQualificationError(
            "captureProfile is the exporter's reference design, not a physical "
            "capture profile",
            "FIELD_RASTER_PROFILE_NOT_PHYSICAL",
        )
    if width < MIN_NATIVE_WIDTH or height < MIN_NATIVE_HEIGHT:
        raise RasterQualificationError(
            f"captureProfile {profile.label} is below the "
            f"{MIN_NATIVE_WIDTH}x{MIN_NATIVE_HEIGHT} reference design",
            "FIELD_RASTER_PROFILE_UNSUPPORTED",
        )
    if height > width:
        raise RasterQualificationError(
            "captureProfile must be landscape; ARKit capturedImage always is",
            "FIELD_RASTER_PROFILE_UNSUPPORTED",
        )
    # Bounds the ENCODED pair too, since encoded is native swapped.
    if width > MAX_NATIVE_DIMENSION or height > MAX_NATIVE_DIMENSION:
        raise RasterQualificationError(
            f"captureProfile {profile.label} exceeds the {MAX_NATIVE_DIMENSION}"
            " per-axis decoder bound",
            "FIELD_RASTER_PROFILE_UNSUPPORTED",
        )
    if width * height > MAX_NATIVE_PIXELS:
        raise RasterQualificationError(
            f"captureProfile {profile.label} exceeds the {MAX_NATIVE_PIXELS}"
            " pixel bound",
            "FIELD_RASTER_PROFILE_UNSUPPORTED",
        )
    return profile


def _validate_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    root = _require_exact_keys(
        manifest,
        {
            "schemaVersion",
            "fixtureID",
            "captureProfile",
            "encodingPipeline",
            "orientation",
            "markerCoordinateConvention",
            "nativeRaster",
            "encodedRaster",
            "nativeIntrinsics",
            "expectedEncodedIntrinsics",
            "markers",
        },
        "manifest",
    )
    if (
        _require_int(root["schemaVersion"], "schemaVersion")
        != FIXTURE_MANIFEST_SCHEMA_VERSION
    ):
        raise RasterQualificationError(
            f"manifest schemaVersion must be {FIXTURE_MANIFEST_SCHEMA_VERSION}"
        )
    profile = _capture_profile(root["captureProfile"])
    marker_contracts = derive_marker_contracts(profile)
    if _require_string(root["fixtureID"], "fixtureID") != FIXTURE_ID:
        raise RasterQualificationError(f"manifest fixtureID must be {FIXTURE_ID!r}")
    fixed_strings = (
        ("encodingPipeline", ENCODING_PIPELINE),
        ("orientation", ORIENTATION_CONTRACT),
        ("markerCoordinateConvention", MARKER_COORDINATE_CONVENTION),
    )
    for key, expected in fixed_strings:
        if _require_string(root[key], key) != expected:
            raise RasterQualificationError(
                f"manifest {key} does not match the v1 contract"
            )

    native = _require_exact_keys(
        root["nativeRaster"],
        {"fileName", "width", "height", "rowBytes", "pixelFormat", "sha256"},
        "nativeRaster",
    )
    expected_native = {
        "fileName": f"{FIXTURE_ID}-native.bgra",
        "width": profile.native_width,
        "height": profile.native_height,
        "rowBytes": profile.native_row_bytes,
        "pixelFormat": NATIVE_PIXEL_FORMAT,
    }
    for key, expected in expected_native.items():
        if native.get(key) != expected or type(native.get(key)) is not type(expected):
            raise RasterQualificationError(
                f"nativeRaster.{key} does not match the declared capture profile"
            )
    native_sha256 = _require_sha256(native["sha256"], "nativeRaster.sha256")

    encoded = _require_exact_keys(
        root["encodedRaster"],
        {"fileName", "width", "height", "mimeType", "sha256"},
        "encodedRaster",
    )
    expected_encoded = {
        "fileName": f"{FIXTURE_ID}.heic",
        "width": profile.encoded_width,
        "height": profile.encoded_height,
        "mimeType": "image/heic",
    }
    for key, expected in expected_encoded.items():
        if encoded.get(key) != expected or type(encoded.get(key)) is not type(expected):
            raise RasterQualificationError(
                f"encodedRaster {key}/dimensions do not match one physical clockwise rotation"
            )
    encoded_sha256 = _require_sha256(encoded["sha256"], "encodedRaster.sha256")

    native_intrinsics = _intrinsics(root["nativeIntrinsics"], "nativeIntrinsics")
    if (
        native_intrinsics["imageWidth"] != profile.native_width
        or native_intrinsics["imageHeight"] != profile.native_height
    ):
        raise RasterQualificationError(
            "native intrinsics dimensions do not match nativeRaster"
        )
    mapped_intrinsics: dict[str, float | int] = {
        "fx": native_intrinsics["fy"],
        "fy": native_intrinsics["fx"],
        "cx": profile.native_height - float(native_intrinsics["cy"]),
        "cy": native_intrinsics["cx"],
        "imageWidth": profile.encoded_width,
        "imageHeight": profile.encoded_height,
    }
    declared_intrinsics = _intrinsics(
        root["expectedEncodedIntrinsics"], "expectedEncodedIntrinsics"
    )
    for key, expected in mapped_intrinsics.items():
        actual = declared_intrinsics[key]
        if isinstance(expected, float):
            matches = math.isclose(float(actual), expected, rel_tol=0.0, abs_tol=1e-9)
        else:
            matches = actual == expected
        if not matches:
            raise RasterQualificationError(
                "expected encoded intrinsics must map as (fy,fx,H-cy,cx)"
            )

    marker_values = root["markers"]
    if not isinstance(marker_values, list) or len(marker_values) != len(
        marker_contracts
    ):
        raise RasterQualificationError(
            "manifest markers must contain the six fixture markers"
        )
    # Compared against the RECOMPUTED set, never trusted. See
    # `derive_marker_contracts`.
    for index, (value, contract) in enumerate(zip(marker_values, marker_contracts)):
        marker = _require_exact_keys(
            value,
            {
                "id",
                "role",
                "shape",
                "rgbaHex",
                "nativeCoordinate",
                "expectedEncodedCoordinate",
            },
            f"markers[{index}]",
        )
        fixed = {
            "id": contract.marker_id,
            "role": contract.role,
            "shape": contract.shape,
            "rgbaHex": contract.rgba_hex,
        }
        if any(marker.get(key) != expected for key, expected in fixed.items()):
            raise RasterQualificationError(
                f"marker {index} does not match the profile-derived contract"
            )
        if _point(marker["nativeCoordinate"], f"markers[{index}].nativeCoordinate") != (
            contract.native_x,
            contract.native_y,
        ):
            raise RasterQualificationError(
                f"marker {contract.marker_id} native coordinate changed"
            )
        if (
            _point(
                marker["expectedEncodedCoordinate"],
                f"markers[{index}].expectedEncodedCoordinate",
            )
            != contract.expected_encoded
        ):
            raise RasterQualificationError(
                f"marker {contract.marker_id} must map discretely as (H-1-y,x)"
            )

    return {
        "nativeSha256": native_sha256,
        "encodedSha256": encoded_sha256,
        "nativeIntrinsics": native_intrinsics,
        "mappedIntrinsics": mapped_intrinsics,
        "captureProfile": profile,
        "markerContracts": marker_contracts,
    }


def _validate_input_name(path: Path, expected_name: str) -> None:
    if path.name != expected_name:
        raise RasterQualificationError(
            f"exported file name must be {expected_name!r}, got {path.name!r}"
        )


def _validate_paths(config: QualificationConfig) -> Path:
    expected = (
        (config.manifest_path, f"{FIXTURE_ID}.json"),
        (config.native_bgra_path, f"{FIXTURE_ID}-native.bgra"),
        (config.heic_path, f"{FIXTURE_ID}.heic"),
    )
    for path, name in expected:
        _validate_input_name(path, name)
    parents = {path.parent.resolve(strict=True) for path, _ in expected}
    if len(parents) != 1:
        raise RasterQualificationError(
            "all three exported fixture files must share one directory"
        )
    fixture_dir = next(iter(parents))

    output = config.output_dir
    if os.path.lexists(output):
        raise RasterQualificationError(
            "qualification output directory must not already exist"
        )
    try:
        output_parent = output.parent.resolve(strict=True)
    except OSError as exc:
        raise RasterQualificationError(
            f"qualification output parent is unavailable: {exc}"
        ) from exc
    resolved_output = output_parent / output.name
    if resolved_output == fixture_dir or fixture_dir in resolved_output.parents:
        raise RasterQualificationError(
            "qualification output must not be inside the fixture directory"
        )
    return fixture_dir


def _read_regular_descriptor(descriptor: int, limit: int, label: str) -> bytes:
    before = os.fstat(descriptor)
    if not stat.S_ISREG(before.st_mode):
        raise RasterQualificationError(f"{label} must be a regular non-symlink file")
    if before.st_size < 0 or before.st_size > limit:
        raise RasterQualificationError(f"{label} exceeds the qualification size limit")
    remaining = before.st_size
    chunks: list[bytes] = []
    while remaining:
        chunk = os.read(descriptor, min(remaining, 1024 * 1024))
        if not chunk:
            raise RasterQualificationError(f"{label} shrank while it was read")
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(descriptor, 1):
        raise RasterQualificationError(f"{label} grew beyond its qualification size")
    after = os.fstat(descriptor)
    if (
        (after.st_dev, after.st_ino, after.st_size)
        != (before.st_dev, before.st_ino, before.st_size)
        or after.st_mtime_ns != before.st_mtime_ns
        or after.st_ctime_ns != before.st_ctime_ns
    ):
        raise RasterQualificationError(f"{label} changed while it was read")
    return b"".join(chunks)


def _read_fixture_inputs(fixture_dir: Path) -> tuple[bytes, bytes, bytes]:
    directory_flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_CLOEXEC", 0)
    )
    try:
        directory_descriptor = os.open(fixture_dir, directory_flags)
    except OSError as exc:
        raise RasterQualificationError(
            f"could not open the fixture directory: {exc}"
        ) from exc
    values: list[bytes] = []
    try:
        for name, limit, label in (
            (f"{FIXTURE_ID}.json", MAX_MANIFEST_BYTES, "manifest"),
            (
                f"{FIXTURE_ID}-native.bgra",
                # The manifest has not been parsed yet, so bound this read by
                # the largest profile any manifest could declare. The exact
                # byte count is checked against the profile afterwards, in
                # `_validate_native_markers`.
                MAX_NATIVE_PIXELS * 4,
                "native BGRA",
            ),
            (f"{FIXTURE_ID}.heic", MAX_HEIC_BYTES, "HEIC"),
        ):
            flags = (
                os.O_RDONLY
                | getattr(os, "O_NOFOLLOW", 0)
                | getattr(os, "O_CLOEXEC", 0)
                | getattr(os, "O_NONBLOCK", 0)
            )
            try:
                descriptor = os.open(name, flags, dir_fd=directory_descriptor)
            except OSError as exc:
                raise RasterQualificationError(
                    f"could not open exported {label} without following symlinks: {exc}"
                ) from exc
            try:
                values.append(_read_regular_descriptor(descriptor, limit, label))
            finally:
                os.close(descriptor)
    finally:
        os.close(directory_descriptor)
    return values[0], values[1], values[2]


def _read_packaged_source(path: Path, limit: int, label: str) -> bytes:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise RasterQualificationError(
            f"{label} is unavailable: {exc}",
            "FIELD_RASTER_DECODER_UNAVAILABLE",
        ) from exc
    try:
        return _read_regular_descriptor(descriptor, limit, label)
    finally:
        os.close(descriptor)


def _read_packaged_helper_source(path: Path) -> bytes:
    return _read_packaged_source(
        path,
        MAX_HELPER_SOURCE_BYTES,
        "packaged libheif helper source",
    )


def _expected_marker_points(marker: MarkerContract) -> set[tuple[int, int]]:
    """The exact pixel mask the exporter drew, rebuilt from derived geometry.

    Driven by the contract's integer geometry rather than by parsing its shape
    string, so the mask and the shape label cannot disagree.
    """

    cx, cy = marker.native_x, marker.native_y
    half = marker.primary_half
    if marker.kind == "square":
        return {
            (x, y)
            for y in range(cy - half, cy + half + 1)
            for x in range(cx - half, cx + half + 1)
        }
    if marker.kind == "cross":
        thickness = marker.secondary_half
        return {
            (x, y)
            for y in range(cy - half, cy + half + 1)
            for x in range(cx - half, cx + half + 1)
            if abs(x - cx) <= thickness or abs(y - cy) <= thickness
        }
    if marker.kind == "diamond":
        return {
            (x, y)
            for y in range(cy - half, cy + half + 1)
            for x in range(cx - half, cx + half + 1)
            if abs(x - cx) + abs(y - cy) <= half
        }
    raise AssertionError(f"unknown marker kind {marker.kind}")


def _validate_native_markers(
    native: bytes,
    *,
    profile: CaptureProfile,
    marker_contracts: tuple[MarkerContract, ...],
) -> list[dict[str, Any]]:
    row_bytes = profile.native_row_bytes
    if len(native) != profile.native_byte_count:
        raise RasterQualificationError(
            "native BGRA byte count does not match dimensions/rowBytes"
        )
    if any(native[offset + 3] != 255 for offset in range(0, len(native), 4)):
        raise RasterQualificationError("native BGRA fixture must be fully opaque")

    # Every marker pixel must BE the marker's colour, and that colour must
    # appear nowhere else in the raster. The second half needs a whole-raster
    # scan; do it once for all six markers rather than once per marker. At the
    # reference profile that is 1.4M pixel reads instead of 8.3M, and at a real
    # capture profile it is the difference between seconds and minutes.
    by_colour: dict[bytes, str] = {}
    for marker in marker_contracts:
        r, g, b, a = marker.rgba
        key = bytes((b, g, r, a))
        if key in by_colour:
            raise AssertionError(
                f"markers {by_colour[key]} and {marker.marker_id} share a colour; "
                "the exact-count proof below cannot distinguish them"
            )
        by_colour[key] = marker.marker_id
    observed = {marker_id: 0 for marker_id in by_colour.values()}
    for offset in range(0, len(native), 4):
        marker_id = by_colour.get(native[offset : offset + 4])
        if marker_id is not None:
            observed[marker_id] += 1

    evidence: list[dict[str, Any]] = []
    for marker in marker_contracts:
        r, g, b, a = marker.rgba
        expected_bgra = bytes((b, g, r, a))
        expected_points = _expected_marker_points(marker)
        if len(expected_points) != marker.exact_pixel_count:
            raise AssertionError(f"marker shape contract drifted: {marker.marker_id}")
        for x, y in expected_points:
            offset = y * row_bytes + x * 4
            if native[offset : offset + 4] != expected_bgra:
                raise RasterQualificationError(
                    f"native marker {marker.marker_id} does not match its exact {marker.shape} mask"
                )
        count = observed[marker.marker_id]
        if count != marker.exact_pixel_count:
            raise RasterQualificationError(
                f"native marker {marker.marker_id} has {count} pixels; "
                f"expected {marker.exact_pixel_count}"
            )
        evidence.append(
            {
                "id": marker.marker_id,
                "coordinate": {"x": marker.native_x, "y": marker.native_y},
                "exactPixelCount": count,
                "rgbaHex": marker.rgba_hex,
                "shape": marker.shape,
            }
        )
    return evidence


def _validate_decoded(
    decoded: DecodedRaster,
    *,
    profile: CaptureProfile,
    marker_contracts: tuple[MarkerContract, ...],
) -> list[dict[str, Any]]:
    encoded_width = profile.encoded_width
    encoded_height = profile.encoded_height
    expected_dimensions = (encoded_width, encoded_height)
    if (decoded.info_width, decoded.info_height) != expected_dimensions:
        raise RasterQualificationError(
            "raw decoder dimensions must be (nativeHeight,nativeWidth)",
            "FIELD_RASTER_DIMENSION_MISMATCH",
        )
    if (decoded.width, decoded.height) != expected_dimensions:
        raise RasterQualificationError(
            "decoded PPM dimensions must be (nativeHeight,nativeWidth)",
            "FIELD_RASTER_DIMENSION_MISMATCH",
        )
    if len(decoded.rgb) != encoded_width * encoded_height * 3:
        raise RasterQualificationError(
            "decoded RGB byte count does not match decoder dimensions"
        )
    if decoded.source_pixel_type != "uint8" or decoded.source_channels not in {3, 4}:
        raise RasterQualificationError(
            "HEIC decoder must expose uint8 RGB/RGBA source pixels"
        )
    if (
        type(decoded.transformation_property_count) is not int
        or decoded.transformation_property_count != 1
        or decoded.transformation_property_type != "irot"
        or type(decoded.transformation_rotation_ccw) is not int
        or decoded.transformation_rotation_ccw != 0
    ):
        raise RasterQualificationError(
            "HEIC decoder must prove exactly one identity irot property",
            "FIELD_RASTER_ORIENTATION_MISMATCH",
        )
    if decoded.metadata_blocks != 0:
        raise RasterQualificationError(
            "Field fixture HEIC must contain zero unqualified metadata blocks",
            "FIELD_RASTER_ORIENTATION_MISMATCH",
        )
    if (
        (decoded.presented_width, decoded.presented_height) != expected_dimensions
        or (decoded.default_width, decoded.default_height) != expected_dimensions
        or not decoded.raw_default_rgb_identical
    ):
        raise RasterQualificationError(
            "libheif raw/default comparison found a hidden crop/rotation/mirror transform",
            "FIELD_RASTER_ORIENTATION_MISMATCH",
        )

    evidence: list[dict[str, Any]] = []
    for marker in marker_contracts:
        expected_x, expected_y = marker.expected_encoded
        target = marker.rgba[:3]
        best: (
            tuple[tuple[int, int, int, int, int], int, int, tuple[int, int, int]] | None
        ) = None
        for y in range(
            max(0, expected_y - LOSSY_MARKER_SEARCH_RADIUS_PX),
            min(encoded_height, expected_y + LOSSY_MARKER_SEARCH_RADIUS_PX + 1),
        ):
            for x in range(
                max(0, expected_x - LOSSY_MARKER_SEARCH_RADIUS_PX),
                min(encoded_width, expected_x + LOSSY_MARKER_SEARCH_RADIUS_PX + 1),
            ):
                offset = (y * encoded_width + x) * 3
                observed = tuple(decoded.rgb[offset : offset + 3])
                errors = tuple(
                    abs(observed[index] - target[index]) for index in range(3)
                )
                score = (
                    max(errors),
                    sum(errors),
                    (x - expected_x) ** 2 + (y - expected_y) ** 2,
                    y,
                    x,
                )
                candidate = (score, x, y, observed)
                if best is None or candidate[0] < best[0]:
                    best = candidate
        assert best is not None
        score, observed_x, observed_y, observed_rgb = best
        if score[0] > LOSSY_MARKER_MAX_CHANNEL_ERROR:
            raise RasterQualificationError(
                f"lossy marker {marker.marker_id} was not found at clockwise (H-1-y,x)",
                "FIELD_RASTER_MARKER_MISMATCH",
            )
        evidence.append(
            {
                "id": marker.marker_id,
                "expected": {"x": expected_x, "y": expected_y},
                "observed": {"x": observed_x, "y": observed_y},
                "observedRGB": list(observed_rgb),
                "targetRGB": list(target),
                "maxChannelError": score[0],
            }
        )
    return evidence


def _write_exclusive(path: Path, payload: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise RasterQualificationError(
            f"could not create qualification artifact {path}: {exc}"
        ) from exc


def _fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _rename_noreplace(source: Path, destination: Path) -> None:
    """Atomically publish a directory without replacing a raced destination."""

    try:
        libc = ctypes.CDLL(None, use_errno=True)
    except OSError as exc:
        raise RasterQualificationError(
            "host libc is unavailable for atomic no-replace publication",
            "FIELD_RASTER_PUBLICATION_UNSUPPORTED",
        ) from exc
    source_bytes = os.fsencode(source)
    destination_bytes = os.fsencode(destination)
    try:
        if sys.platform.startswith("linux"):
            rename_function = libc.renameat2
            rename_function.argtypes = (
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_uint,
            )
            rename_function.restype = ctypes.c_int
            rename_arguments = (
                -100,  # AT_FDCWD
                source_bytes,
                -100,
                destination_bytes,
                1,  # RENAME_NOREPLACE
            )
        elif sys.platform == "darwin":
            rename_function = libc.renamex_np
            rename_function.argtypes = (
                ctypes.c_char_p,
                ctypes.c_char_p,
                ctypes.c_uint,
            )
            rename_function.restype = ctypes.c_int
            rename_arguments = (
                source_bytes,
                destination_bytes,
                0x00000004,  # RENAME_EXCL
            )
        else:
            raise RasterQualificationError(
                "atomic no-replace publication is unsupported on this host",
                "FIELD_RASTER_PUBLICATION_UNSUPPORTED",
            )
    except AttributeError as exc:
        raise RasterQualificationError(
            "host libc lacks atomic no-replace publication support",
            "FIELD_RASTER_PUBLICATION_UNSUPPORTED",
        ) from exc
    result = rename_function(*rename_arguments)
    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number in {errno.EEXIST, errno.ENOTEMPTY}:
        raise RasterQualificationError(
            "qualification output directory appeared before publication"
        )
    raise OSError(error_number, os.strerror(error_number), str(destination))


def run_field_raster_qualification(
    config: QualificationConfig,
    *,
    decoder: RasterDecoder | None = None,
) -> QualificationResult:
    """Validate the three-file contract and create local deterministic evidence."""

    harness_path = Path(__file__)
    harness_source = _read_packaged_source(
        harness_path,
        MAX_HARNESS_SOURCE_BYTES,
        "Field raster qualification harness source",
    )
    fixture_dir = _validate_paths(config)
    manifest_bytes, native_bytes, heic_bytes = _read_fixture_inputs(fixture_dir)
    manifest = _load_manifest(manifest_bytes)
    contract = _validate_manifest(manifest)
    if _sha256(native_bytes) != contract["nativeSha256"]:
        raise RasterQualificationError(
            "native BGRA SHA-256 does not match the manifest"
        )
    if _sha256(heic_bytes) != contract["encodedSha256"]:
        raise RasterQualificationError("HEIC SHA-256 does not match the manifest")

    profile: CaptureProfile = contract["captureProfile"]
    marker_contracts: tuple[MarkerContract, ...] = contract["markerContracts"]
    native_marker_evidence = _validate_native_markers(
        native_bytes,
        profile=profile,
        marker_contracts=marker_contracts,
    )
    active_decoder = decoder or SystemLibheifDecoder()
    try:
        # Pass the already-hashed bytes. The production decoder copies this
        # payload to private scratch, so a path race cannot swap the HEIC after
        # its manifest hash has been verified.
        decoded = active_decoder.decode_no_autorotate(
            heic_bytes,
            encoded_width=profile.encoded_width,
            encoded_height=profile.encoded_height,
        )
    except RasterQualificationError:
        raise
    except Exception as exc:
        raise RasterQualificationError(
            f"HEIC decoder failed ({type(exc).__name__}: {exc})",
            "FIELD_RASTER_DECODE_FAILED",
        ) from exc
    marker_evidence = _validate_decoded(
        decoded,
        profile=profile,
        marker_contracts=marker_contracts,
    )

    ppm_bytes = (
        f"P6\n{profile.encoded_width} {profile.encoded_height}\n255\n".encode("ascii")
        + decoded.rgb
    )
    receipt: dict[str, Any] = {
        "schemaVersion": QUALIFICATION_SCHEMA_VERSION,
        "qualification": QUALIFICATION_NAME,
        "status": "passed",
        "implementation": {
            "qualificationHarness": {
                "fileName": harness_path.name,
                "sha256": _sha256(harness_source),
            },
            "libheifHelper": {
                "fileName": LIBHEIF_HELPER_SOURCE_NAME,
                "sha256": decoded.helper_source_sha256,
            },
        },
        "fixture": {
            "fixtureID": FIXTURE_ID,
            # The receipt must say WHICH profile it qualified and how that
            # profile was established. Without this a later reader cannot tell a
            # measured capture profile from an assumed one — the ambiguity R118
            # was raised to remove.
            "captureProfile": {
                "nativeWidth": profile.native_width,
                "nativeHeight": profile.native_height,
                "encodedWidth": profile.encoded_width,
                "encodedHeight": profile.encoded_height,
                "resolutionSource": profile.resolution_source,
                "deviceModel": profile.device_model,
                "systemVersion": profile.system_version,
                "videoFormat": profile.video_format,
            },
            "manifest": {
                "fileName": config.manifest_path.name,
                "sha256": _sha256(manifest_bytes),
                "sizeBytes": len(manifest_bytes),
            },
            "nativeRaster": {
                "fileName": config.native_bgra_path.name,
                "sha256": _sha256(native_bytes),
                "sizeBytes": len(native_bytes),
                "width": profile.native_width,
                "height": profile.native_height,
                "rowBytes": profile.native_row_bytes,
                "markers": native_marker_evidence,
            },
            "encodedRaster": {
                "fileName": config.heic_path.name,
                "sha256": _sha256(heic_bytes),
                "sizeBytes": len(heic_bytes),
                "manifestWidth": profile.encoded_width,
                "manifestHeight": profile.encoded_height,
            },
        },
        "decoder": {
            "name": decoded.decoder_name,
            "version": decoded.decoder_version,
            "decoderID": decoded.decoder_id,
            "decoderDescriptorName": decoded.decoder_descriptor_name,
            "availableHEVCDecoderDescriptorCount": (
                decoded.hevc_decoder_descriptor_count
            ),
            "matchingLibde265DescriptorCount": (
                decoded.matching_decoder_descriptor_count
            ),
            "inputMimeType": decoded.input_mime_type,
            "inputPolicy": {
                "rawDecode": (
                    "strict heif_decoding_options: ignore_transformations=1, "
                    "decoder_id=libde265"
                ),
                "defaultDecode": (
                    "strict heif_decoding_options: ignore_transformations=0, "
                    "decoder_id=libde265"
                ),
                "comparison": "raw/default dimensions and RGB bytes must be identical",
                "autorotate": False,
                "privateScratchCopyAfterHashVerification": True,
            },
            "rawDimensions": {
                "width": decoded.info_width,
                "height": decoded.info_height,
            },
            "presentedHandleDimensions": {
                "width": decoded.presented_width,
                "height": decoded.presented_height,
            },
            "defaultDecodeDimensions": {
                "width": decoded.default_width,
                "height": decoded.default_height,
            },
            "sourceChannels": decoded.source_channels,
            "sourcePixelType": decoded.source_pixel_type,
            "orientationProof": {
                "libheifRecognizedPrimaryItemTransformProperties": {
                    "associationScope": "primary-item-associated",
                    "recognizedTypes": ["irot", "imir", "clap"],
                    "count": decoded.transformation_property_count,
                    "propertyType": decoded.transformation_property_type,
                    "rotationCCWDegrees": decoded.transformation_rotation_ccw,
                },
                "hiddenLibheifRecognizedPrimaryItemTransformEffect": False,
                "rawDefaultRGBIdentical": True,
                "embeddedMetadataBlocks": decoded.metadata_blocks,
                "embeddedExifXmpOrientation": "absent (zero metadata blocks)",
                "materializedRasterCarriesMetadata": False,
                "scope": (
                    "public libheif API proof covers recognized primary-item-"
                    "associated irot/imir/clap semantic type and value, zero "
                    "attached metadata, and strict raw/default dimension and RGB "
                    "byte identity; output PPM drops metadata"
                ),
            },
            "rawDefaultRGBIdentical": decoded.raw_default_rgb_identical,
            "toolchain": {
                "compiler": decoded.compiler_version,
                "pkgConfig": decoded.pkg_config_version,
                "pkgConfigLibheif": decoded.pkg_config_libheif_version,
                "helperSourceFile": LIBHEIF_HELPER_SOURCE_NAME,
                "helperSourceSha256": decoded.helper_source_sha256,
                "hostOS": decoded.os_release,
                "minimumNobleLibheifPackageVersion": MIN_NOBLE_LIBHEIF_PACKAGE_VERSION,
                "installedPackages": dict(decoded.package_versions),
            },
        },
        "geometry": {
            "rotation": "one-physical-clockwise-rotation",
            "encodedDimensions": {
                "width": profile.encoded_width,
                "height": profile.encoded_height,
            },
            "discreteMarkerMapping": "(x,y)=(nativeHeight-1-y,x)",
            "lossyTolerance": {
                "searchRadiusPx": LOSSY_MARKER_SEARCH_RADIUS_PX,
                "maxPerChannelError": LOSSY_MARKER_MAX_CHANNEL_ERROR,
            },
            "markers": marker_evidence,
            "continuousIntrinsics": {
                "mapping": "(fx,fy,cx,cy)->(fy,fx,H-cy,cx)",
                "native": contract["nativeIntrinsics"],
                "mapped": contract["mappedIntrinsics"],
            },
        },
        "materializedRaster": {
            "fileName": MATERIALIZED_RASTER_NAME,
            "format": "Netpbm P6 RGB uint8",
            "width": profile.encoded_width,
            "height": profile.encoded_height,
            "sizeBytes": len(ppm_bytes),
            "sha256": _sha256(ppm_bytes),
        },
        "safety": {
            "controlledPhysicalDeviceInputOnly": True,
            "inputFilesMutated": False,
            "externalSystemsTouched": [],
            "queueClaims": False,
            "databaseWrites": False,
            "storageCalls": False,
        },
    }
    receipt_bytes = _canonical_json_bytes(receipt)

    output_parent = config.output_dir.parent.resolve(strict=True)
    final_output_dir = output_parent / config.output_dir.name
    materialized_path = final_output_dir / MATERIALIZED_RASTER_NAME
    receipt_path = final_output_dir / RECEIPT_NAME
    staging_dir: Path | None = None
    published = False
    try:
        staging_dir = Path(
            tempfile.mkdtemp(
                prefix=f".{config.output_dir.name}.staging-",
                dir=output_parent,
            )
        )
        staged_materialized = staging_dir / MATERIALIZED_RASTER_NAME
        staged_receipt = staging_dir / RECEIPT_NAME
        _write_exclusive(staged_materialized, ppm_bytes)
        _write_exclusive(staged_receipt, receipt_bytes)
        _fsync_directory(staging_dir)
        _rename_noreplace(staging_dir, final_output_dir)
        published = True
        try:
            _fsync_directory(output_parent)
        except Exception:
            # Roll the commit marker back before surfacing a durability error.
            _rename_noreplace(final_output_dir, staging_dir)
            published = False
            try:
                _fsync_directory(output_parent)
            except OSError:
                pass
            raise
    except Exception as exc:
        if published and staging_dir is not None:
            try:
                _rename_noreplace(final_output_dir, staging_dir)
                published = False
            except OSError:
                pass
        if staging_dir is not None and staging_dir.exists():
            for artifact_name in (MATERIALIZED_RASTER_NAME, RECEIPT_NAME):
                try:
                    (staging_dir / artifact_name).unlink(missing_ok=True)
                except OSError:
                    pass
            try:
                staging_dir.rmdir()
            except OSError:
                pass
        if isinstance(exc, OSError):
            raise RasterQualificationError(
                f"could not publish qualification output: {exc}"
            ) from exc
        raise
    return QualificationResult(
        materialized_raster_path=materialized_path,
        receipt_path=receipt_path,
        receipt=receipt,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Qualify and materialize the Field/Core Image raster fixture"
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--native-bgra", required=True, type=Path)
    parser.add_argument("--heic", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    config = QualificationConfig(
        manifest_path=args.manifest,
        native_bgra_path=args.native_bgra,
        heic_path=args.heic,
        output_dir=args.output_dir,
    )
    try:
        result = run_field_raster_qualification(
            config,
            decoder=SystemLibheifDecoder(),
        )
    except RasterQualificationError as exc:
        print(f"ERROR [{exc.code}]: {exc}", file=sys.stderr)
        return 2
    print("Field raster qualification: PASS")
    print(f"materialized raster: {result.materialized_raster_path}")
    print(f"receipt: {result.receipt_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
