"""Qualify and materialize the physical Field/Core Image raster contract.

This is a standalone, local-only gate. It reads the three files exported by the
Debug iOS fixture and writes a deterministic PPM plus a canonical receipt to a
new output directory. It deliberately has no queue, database, Storage, worker,
or configuration imports.

HEIC decoding is delegated to a tiny packaged C helper compiled unprivileged
against Ubuntu's security-maintained system libheif. The helper decodes once
with ``ignore_transformations=1`` and once with libheif defaults, then requires
the dimensions and RGB bytes to be identical. That rejects hidden crop,
rotation, and mirror properties before off-centre marker geometry is checked or
any output directory is created.
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
QUALIFICATION_SCHEMA_VERSION = 1
MATERIALIZED_RASTER_NAME = f"{FIXTURE_ID}-materialized.ppm"
RECEIPT_NAME = "field-raster-qualification-receipt-v1.json"

NATIVE_WIDTH = 640
NATIVE_HEIGHT = 360
ENCODED_WIDTH = NATIVE_HEIGHT
ENCODED_HEIGHT = NATIVE_WIDTH
NATIVE_ROW_BYTES = NATIVE_WIDTH * 4

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
LIBHEIF_HELPER_SCHEMA = "patina-field-raster-libheif-helper-v1"
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
class MarkerContract:
    marker_id: str
    role: str
    shape: str
    rgba_hex: str
    native_x: int
    native_y: int
    exact_pixel_count: int

    @property
    def expected_encoded(self) -> tuple[int, int]:
        return NATIVE_HEIGHT - 1 - self.native_y, self.native_x

    @property
    def rgba(self) -> tuple[int, int, int, int]:
        payload = bytes.fromhex(self.rgba_hex.removeprefix("#"))
        return payload[0], payload[1], payload[2], payload[3]


MARKER_CONTRACTS = (
    MarkerContract("corner-top-left", "corner", "square-55", "#FF2020FF", 27, 27, 3025),
    MarkerContract(
        "corner-top-right", "corner", "square-55", "#20E060FF", 612, 27, 3025
    ),
    MarkerContract(
        "corner-bottom-left", "corner", "square-55", "#2060FFFF", 27, 332, 3025
    ),
    MarkerContract(
        "corner-bottom-right", "corner", "square-55", "#FFE020FF", 612, 332, 3025
    ),
    MarkerContract(
        "fiducial-magenta",
        "off-centre-fiducial",
        "cross-45-thickness-13",
        "#F020E0FF",
        173,
        91,
        1001,
    ),
    MarkerContract(
        "fiducial-cyan",
        "off-centre-fiducial",
        "diamond-radius-21",
        "#20E8F0FF",
        487,
        271,
        925,
    ),
)


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
    def decode_no_autorotate(self, heic: bytes) -> DecodedRaster: ...


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
    if not re.fullmatch(r"[ -~]{1,256}", values["decoder_name"]):
        raise RasterQualificationError(
            "libheif helper reported an invalid decoder descriptor name",
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
    """Compile and run the packaged no-transform helper without privilege."""

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

    def decode_no_autorotate(self, heic: bytes) -> DecodedRaster:
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
            helper_result = self._run(
                (str(helper_path), str(heic_path), str(ppm_path)),
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
            or metadata["transformation_properties"] != "0"
            or metadata["raw_default_rgb_identical"] != "1"
        ):
            raise RasterQualificationError(
                "libheif did not prove one image with identity transform metadata",
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


def _validate_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    root = _require_exact_keys(
        manifest,
        {
            "schemaVersion",
            "fixtureID",
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
    if _require_int(root["schemaVersion"], "schemaVersion") != 1:
        raise RasterQualificationError("manifest schemaVersion must be 1")
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
        "width": NATIVE_WIDTH,
        "height": NATIVE_HEIGHT,
        "rowBytes": NATIVE_ROW_BYTES,
        "pixelFormat": NATIVE_PIXEL_FORMAT,
    }
    for key, expected in expected_native.items():
        if native.get(key) != expected or type(native.get(key)) is not type(expected):
            raise RasterQualificationError(
                f"nativeRaster.{key} does not match the v1 contract"
            )
    native_sha256 = _require_sha256(native["sha256"], "nativeRaster.sha256")

    encoded = _require_exact_keys(
        root["encodedRaster"],
        {"fileName", "width", "height", "mimeType", "sha256"},
        "encodedRaster",
    )
    expected_encoded = {
        "fileName": f"{FIXTURE_ID}.heic",
        "width": ENCODED_WIDTH,
        "height": ENCODED_HEIGHT,
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
        native_intrinsics["imageWidth"] != NATIVE_WIDTH
        or native_intrinsics["imageHeight"] != NATIVE_HEIGHT
    ):
        raise RasterQualificationError(
            "native intrinsics dimensions do not match nativeRaster"
        )
    mapped_intrinsics: dict[str, float | int] = {
        "fx": native_intrinsics["fy"],
        "fy": native_intrinsics["fx"],
        "cx": NATIVE_HEIGHT - float(native_intrinsics["cy"]),
        "cy": native_intrinsics["cx"],
        "imageWidth": ENCODED_WIDTH,
        "imageHeight": ENCODED_HEIGHT,
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
        MARKER_CONTRACTS
    ):
        raise RasterQualificationError(
            "manifest markers must contain the six v1 markers"
        )
    for index, (value, contract) in enumerate(zip(marker_values, MARKER_CONTRACTS)):
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
                f"marker {index} does not match the v1 marker contract"
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
                NATIVE_ROW_BYTES * NATIVE_HEIGHT,
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
    cx, cy = marker.native_x, marker.native_y
    if marker.shape == "square-55":
        return {
            (x, y) for y in range(cy - 27, cy + 28) for x in range(cx - 27, cx + 28)
        }
    if marker.shape == "cross-45-thickness-13":
        return {
            (x, y)
            for y in range(cy - 22, cy + 23)
            for x in range(cx - 22, cx + 23)
            if abs(x - cx) <= 6 or abs(y - cy) <= 6
        }
    if marker.shape == "diamond-radius-21":
        return {
            (x, y)
            for y in range(cy - 21, cy + 22)
            for x in range(cx - 21, cx + 22)
            if abs(x - cx) + abs(y - cy) <= 21
        }
    raise AssertionError(f"unknown marker shape {marker.shape}")


def _validate_native_markers(native: bytes) -> list[dict[str, Any]]:
    if len(native) != NATIVE_ROW_BYTES * NATIVE_HEIGHT:
        raise RasterQualificationError(
            "native BGRA byte count does not match dimensions/rowBytes"
        )
    if any(native[offset + 3] != 255 for offset in range(0, len(native), 4)):
        raise RasterQualificationError("native BGRA fixture must be fully opaque")

    evidence: list[dict[str, Any]] = []
    for marker in MARKER_CONTRACTS:
        r, g, b, a = marker.rgba
        expected_bgra = (b, g, r, a)
        expected_points = _expected_marker_points(marker)
        if len(expected_points) != marker.exact_pixel_count:
            raise AssertionError(f"marker shape contract drifted: {marker.marker_id}")
        for x, y in expected_points:
            offset = y * NATIVE_ROW_BYTES + x * 4
            if tuple(native[offset : offset + 4]) != expected_bgra:
                raise RasterQualificationError(
                    f"native marker {marker.marker_id} does not match its exact {marker.shape} mask"
                )
        count = 0
        for y in range(NATIVE_HEIGHT):
            row_offset = y * NATIVE_ROW_BYTES
            for x in range(NATIVE_WIDTH):
                offset = row_offset + x * 4
                if tuple(native[offset : offset + 4]) == expected_bgra:
                    count += 1
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


def _validate_decoded(decoded: DecodedRaster) -> list[dict[str, Any]]:
    expected_dimensions = (ENCODED_WIDTH, ENCODED_HEIGHT)
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
    if len(decoded.rgb) != ENCODED_WIDTH * ENCODED_HEIGHT * 3:
        raise RasterQualificationError(
            "decoded RGB byte count does not match decoder dimensions"
        )
    if decoded.source_pixel_type != "uint8" or decoded.source_channels not in {3, 4}:
        raise RasterQualificationError(
            "HEIC decoder must expose uint8 RGB/RGBA source pixels"
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
    for marker in MARKER_CONTRACTS:
        expected_x, expected_y = marker.expected_encoded
        target = marker.rgba[:3]
        best: (
            tuple[tuple[int, int, int, int, int], int, int, tuple[int, int, int]] | None
        ) = None
        for y in range(
            max(0, expected_y - LOSSY_MARKER_SEARCH_RADIUS_PX),
            min(ENCODED_HEIGHT, expected_y + LOSSY_MARKER_SEARCH_RADIUS_PX + 1),
        ):
            for x in range(
                max(0, expected_x - LOSSY_MARKER_SEARCH_RADIUS_PX),
                min(ENCODED_WIDTH, expected_x + LOSSY_MARKER_SEARCH_RADIUS_PX + 1),
            ):
                offset = (y * ENCODED_WIDTH + x) * 3
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

    native_marker_evidence = _validate_native_markers(native_bytes)
    active_decoder = decoder or SystemLibheifDecoder()
    try:
        # Pass the already-hashed bytes. The production decoder copies this
        # payload to private scratch, so a path race cannot swap the HEIC after
        # its manifest hash has been verified.
        decoded = active_decoder.decode_no_autorotate(heic_bytes)
    except RasterQualificationError:
        raise
    except Exception as exc:
        raise RasterQualificationError(
            f"HEIC decoder failed ({type(exc).__name__}: {exc})",
            "FIELD_RASTER_DECODE_FAILED",
        ) from exc
    marker_evidence = _validate_decoded(decoded)

    ppm_bytes = (
        f"P6\n{ENCODED_WIDTH} {ENCODED_HEIGHT}\n255\n".encode("ascii") + decoded.rgb
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
            "manifest": {
                "fileName": config.manifest_path.name,
                "sha256": _sha256(manifest_bytes),
                "sizeBytes": len(manifest_bytes),
            },
            "nativeRaster": {
                "fileName": config.native_bgra_path.name,
                "sha256": _sha256(native_bytes),
                "sizeBytes": len(native_bytes),
                "width": NATIVE_WIDTH,
                "height": NATIVE_HEIGHT,
                "rowBytes": NATIVE_ROW_BYTES,
                "markers": native_marker_evidence,
            },
            "encodedRaster": {
                "fileName": config.heic_path.name,
                "sha256": _sha256(heic_bytes),
                "sizeBytes": len(heic_bytes),
                "manifestWidth": ENCODED_WIDTH,
                "manifestHeight": ENCODED_HEIGHT,
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
                "heifGeometricTransformationProperties": 0,
                "hiddenHeifCropRotationMirror": False,
                "rawDefaultRGBIdentical": True,
                "embeddedMetadataBlocks": decoded.metadata_blocks,
                "embeddedExifXmpOrientation": "absent (zero metadata blocks)",
                "materializedRasterCarriesMetadata": False,
                "scope": (
                    "stored pixels, zero attached metadata, and zero HEIF irot/imir/clap; "
                    "output PPM drops metadata"
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
            "encodedDimensions": {"width": ENCODED_WIDTH, "height": ENCODED_HEIGHT},
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
            "width": ENCODED_WIDTH,
            "height": ENCODED_HEIGHT,
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
