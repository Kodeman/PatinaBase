"""Non-mutating COLMAP 4.0.2 qualification for the P2 refine engine.

The production refine handler is deliberately not registered yet.  This module
only creates a deterministic synthetic fixture and local scratch artifacts.  It
does not import the queue, database client, Storage client, or worker config.

DeskDev runs this module after the item-3 doctor passes.  Unit tests inject a
fake backend so ordinary development machines do not need PyCOLMAP or a GPU.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import shutil
import struct
import sys
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from . import refine_engine
from .refine_engine import (
    EngineImage,
    ModelEvidence,
    PycolmapBackend,
    PycolmapBackendConfig,
    RefineEngineBackend as QualificationBackend,
)
from .refine_adapter import (
    COLMAP_LOG_TAIL_BYTES,
    COLMAP_TARGET_VERSION,
    LEASE_COMPLETION_RESERVE_S,
    REFINE_STAGE_ENGINE_BUDGET_S,
    AdapterError,
    ColmapPose,
    ColmapCommandResult,
    PinholeIntrinsics,
    RefineDeadline,
    publish_immutable,
    qualify_colmap_versions,
    run_colmap_subprocess,
)

QUALIFICATION_SCHEMA_VERSION = 1
QUALIFICATION_NAME = "p2-item4a-colmap-known-pose"
FIXTURE_VERSION = "tiny-multiview-v1"
RECEIPT_NAME = "colmap-qualification-receipt-v1.json"
QUALIFICATION_RANDOM_SEED = 0
MAX_GPU_SIFT_FEATURES_PER_IMAGE = 4096
NATIVE_EXCEPTION_TEXT_BYTES = 512

FIXTURE_WIDTH = 480
FIXTURE_HEIGHT = 360
FIXTURE_INTRINSICS = PinholeIntrinsics(
    fx=420.0,
    fy=420.0,
    cx=240.0,
    cy=180.0,
    image_width=FIXTURE_WIDTH,
    image_height=FIXTURE_HEIGHT,
)
FIXTURE_CAMERA_CENTERS_X_M = (-0.30, -0.15, 0.0, 0.15, 0.30)
FIXTURE_PAIR_ORDINALS = ((0, 1), (0, 4), (1, 2), (2, 3), (3, 4))
MIN_GPU_SIFT_KEYPOINTS_PER_IMAGE = 40
MIN_RAW_MATCHES_PER_PAIR = 15
MIN_VERIFIED_INLIERS_PER_PAIR = 15
MIN_TRIANGULATED_POINTS = 20

# Backward-compatible test/operator access; implementation ownership is shared.
_bounded_binding_output = refine_engine._bounded_binding_output


@dataclass(frozen=True)
class FixtureImage:
    ordinal: int
    name: str
    camera_center_m: tuple[float, float, float]
    intrinsics: PinholeIntrinsics = FIXTURE_INTRINSICS


@dataclass(frozen=True)
class QualificationConfig:
    output_dir: Path
    colmap_path: str = "colmap"
    nvcc_path: str = "/usr/local/cuda-11.8/bin/nvcc"
    nvidia_smi_path: str = "/usr/bin/nvidia-smi"
    gpu_index: str = "0"


CommandRunner = Callable[..., ColmapCommandResult]


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _bounded_exception_text(exc: BaseException) -> str:
    """Return one bounded line so a native exception cannot flood stderr/JSON."""

    raw = (
        str(exc).replace("\r", " ").replace("\n", " ").encode("utf-8", errors="replace")
    )
    if len(raw) <= NATIVE_EXCEPTION_TEXT_BYTES:
        return raw.decode("utf-8", errors="replace")
    suffix = b"...<truncated>"
    prefix = raw[: NATIVE_EXCEPTION_TEXT_BYTES - len(suffix)].decode(
        "utf-8", errors="ignore"
    )
    return prefix + suffix.decode("ascii")


def _backend_call(label: str, callback: Callable[[], Any]) -> Any:
    """Normalize native binding failures into the qualification error contract."""

    try:
        return callback()
    except AdapterError as exc:
        bounded = _bounded_exception_text(exc)
        if bounded == str(exc):
            raise
        raise AdapterError(bounded, exc.code) from exc
    except Exception as exc:
        raise AdapterError(
            f"{label} failed ({type(exc).__name__}): {_bounded_exception_text(exc)}",
            "REFINE_ENGINE_FAILED",
        ) from exc


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _json_bytes(value: Mapping[str, Any]) -> bytes:
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


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _stored_zlib(payload: bytes) -> bytes:
    """Return a byte-stable zlib stream using uncompressed DEFLATE blocks."""

    stream = bytearray(b"\x78\x01")
    if not payload:
        blocks = [b""]
    else:
        blocks = [
            payload[offset : offset + 65535] for offset in range(0, len(payload), 65535)
        ]
    for index, block in enumerate(blocks):
        stream.append(1 if index == len(blocks) - 1 else 0)
        size = len(block)
        stream.extend(struct.pack("<HH", size, 0xFFFF ^ size))
        stream.extend(block)
    stream.extend(struct.pack(">I", zlib.adler32(payload) & 0xFFFFFFFF))
    return bytes(stream)


def _grayscale_png(width: int, height: int, pixels: bytes) -> bytes:
    if len(pixels) != width * height:
        raise AdapterError(
            "qualification PNG pixel count does not match its dimensions"
        )
    scanlines = b"".join(
        b"\x00" + pixels[row * width : (row + 1) * width] for row in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", _stored_zlib(scanlines))
        + _png_chunk(b"IEND", b"")
    )


def _texture_value(x_m: float, y_m: float, layer: int) -> int:
    """A deterministic, multi-scale world-space texture with stable corners."""

    cell_m = (0.072, 0.086, 0.10)[layer]
    scaled_x = (x_m + 20.0) / cell_m
    scaled_y = (y_m + 20.0) / cell_m
    cell_x = math.floor(scaled_x)
    cell_y = math.floor(scaled_y)
    local_x = scaled_x - cell_x
    local_y = scaled_y - cell_y
    mixed = (
        (cell_x * 0x45D9F3B) ^ (cell_y * 0x119DE1F3) ^ ((layer + 1) * 0x27D4EB2D)
    ) & 0xFFFFFFFF
    value = 36 + ((mixed ^ (mixed >> 13) ^ (mixed >> 21)) & 0xB7)
    if local_x < 0.10 or local_y < 0.10:
        value = 244 if (mixed & 1) else 12
    elif (cell_x + 2 * cell_y + layer) % 11 == 0:
        dx = local_x - 0.5
        dy = local_y - 0.5
        if dx * dx + dy * dy < 0.12:
            value = 255 - value
    return value


def _fixture_pixels(camera_center_x_m: float) -> bytes:
    intrinsics = FIXTURE_INTRINSICS
    pixels = bytearray(FIXTURE_WIDTH * FIXTURE_HEIGHT)
    panels = (
        (3.2, -1.45, -0.20, -1.10, 1.10, 0),
        (4.35, 0.18, 1.55, -1.15, 1.15, 1),
    )
    for row in range(FIXTURE_HEIGHT):
        ray_y = (row - intrinsics.cy) / intrinsics.fy
        row_offset = row * FIXTURE_WIDTH
        for column in range(FIXTURE_WIDTH):
            ray_x = (column - intrinsics.cx) / intrinsics.fx
            surface = (5.8, 2)
            for depth_m, min_x, max_x, min_y, max_y, layer in panels:
                world_x = camera_center_x_m + depth_m * ray_x
                world_y = depth_m * ray_y
                if min_x <= world_x <= max_x and min_y <= world_y <= max_y:
                    surface = (depth_m, layer)
                    break
            depth_m, layer = surface
            world_x = camera_center_x_m + depth_m * ray_x
            world_y = depth_m * ray_y
            pixels[row_offset + column] = _texture_value(world_x, world_y, layer)
    return bytes(pixels)


def fixture_images() -> tuple[FixtureImage, ...]:
    return tuple(
        FixtureImage(
            ordinal=index,
            name=f"fixture_{index:02d}.png",
            camera_center_m=(center_x, 0.0, 0.0),
        )
        for index, center_x in enumerate(FIXTURE_CAMERA_CENTERS_X_M)
    )


def fixture_engine_images(
    images: Sequence[FixtureImage],
) -> tuple[EngineImage, ...]:
    """Map the synthetic COLMAP-coordinate fixture into the shared engine seam."""

    identity = (
        (1.0, 0.0, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 1.0),
    )
    return tuple(
        EngineImage(
            name=image.name,
            intrinsics=image.intrinsics,
            cam_from_world=ColmapPose(
                rotation=identity,
                translation=tuple(-value for value in image.camera_center_m),
                qvec=(1.0, 0.0, 0.0, 0.0),
            ),
        )
        for image in images
    )


def non_identity_pose_control_image(image: EngineImage) -> EngineImage:
    """Return a deterministic arbitrary pose used only for write/read control."""

    angle = math.radians(31.0)
    rotation = (
        (math.cos(angle), 0.0, math.sin(angle)),
        (0.0, 1.0, 0.0),
        (-math.sin(angle), 0.0, math.cos(angle)),
    )
    center = (1.25, -0.4, 2.75)
    translation = tuple(
        -sum(rotation[row][column] * center[column] for column in range(3))
        for row in range(3)
    )
    return EngineImage(
        name=image.name,
        intrinsics=image.intrinsics,
        cam_from_world=ColmapPose(
            rotation=rotation,
            translation=translation,
            qvec=(math.cos(angle / 2.0), 0.0, math.sin(angle / 2.0), 0.0),
        ),
    )


def _pose_matrix(pose: ColmapPose) -> tuple[tuple[float, float, float, float], ...]:
    return tuple(
        tuple((*pose.rotation[row], pose.translation[row])) for row in range(3)
    )


def _pose_center(pose: ColmapPose) -> tuple[float, float, float]:
    return tuple(
        -sum(pose.rotation[row][column] * pose.translation[row] for row in range(3))
        for column in range(3)
    )


def materialize_fixture(
    image_dir: Path,
) -> tuple[tuple[FixtureImage, ...], Mapping[str, Any]]:
    image_dir.mkdir(parents=True, exist_ok=False)
    images = fixture_images()
    rows: list[dict[str, Any]] = []
    for image in images:
        payload = _grayscale_png(
            FIXTURE_WIDTH,
            FIXTURE_HEIGHT,
            _fixture_pixels(image.camera_center_m[0]),
        )
        path = image_dir / image.name
        path.write_bytes(payload)
        rows.append(
            {
                "name": image.name,
                "sha256": _sha256_bytes(payload),
                "sizeBytes": len(payload),
                "cameraCenterMeters": list(image.camera_center_m),
            }
        )
    contract: dict[str, Any] = {
        "version": FIXTURE_VERSION,
        "width": FIXTURE_WIDTH,
        "height": FIXTURE_HEIGHT,
        "intrinsics": {
            "model": "PINHOLE",
            "params": [
                FIXTURE_INTRINSICS.fx,
                FIXTURE_INTRINSICS.fy,
                FIXTURE_INTRINSICS.cx,
                FIXTURE_INTRINSICS.cy,
            ],
        },
        "images": rows,
    }
    contract["manifestSha256"] = _sha256_bytes(_json_bytes(contract))
    return images, contract


def explicit_pairs(images: Sequence[FixtureImage]) -> tuple[tuple[str, str], ...]:
    if len(images) != len(FIXTURE_CAMERA_CENTERS_X_M):
        raise AdapterError("qualification fixture image count changed unexpectedly")
    pairs = {
        tuple(sorted((images[left].name, images[right].name)))
        for left, right in FIXTURE_PAIR_ORDINALS
    }
    return tuple(sorted(pairs))


def write_explicit_pairs(
    path: Path, pairs: Sequence[tuple[str, str]]
) -> Mapping[str, Any]:
    payload = "".join(f"{first} {second}\n" for first, second in sorted(pairs)).encode(
        "utf-8"
    )
    path.write_bytes(payload)
    return {
        "count": len(pairs),
        "sha256": _sha256_bytes(payload),
        "sizeBytes": len(payload),
    }


def _resolve_executable(value: str, label: str) -> Path:
    candidate = shutil.which(value) if os.sep not in value else value
    if candidate is None:
        raise AdapterError(
            f"{label} executable not found: {value}", "REFINE_ENGINE_FAILED"
        )
    path = Path(candidate).resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise AdapterError(
            f"{label} is not an executable file: {path}", "REFINE_ENGINE_FAILED"
        )
    return path


def _prepare_output(output_dir: Path) -> Path:
    if output_dir.is_symlink():
        raise AdapterError("qualification output directory cannot be a symlink")
    if output_dir.exists():
        if not output_dir.is_dir():
            raise AdapterError("qualification output path must be a directory")
        if any(output_dir.iterdir()):
            raise AdapterError("qualification output directory must be empty")
    else:
        output_dir.mkdir(parents=True, mode=0o700)
    return output_dir.resolve(strict=True)


def _model_files(path: Path) -> Mapping[str, Any]:
    rows = []
    for candidate in sorted(path.iterdir(), key=lambda item: item.name):
        if candidate.is_file():
            rows.append(
                {
                    "name": candidate.name,
                    "sha256": _sha256_file(candidate),
                    "sizeBytes": candidate.stat().st_size,
                }
            )
    expected_names = {"cameras.bin", "images.bin", "points3D.bin"}
    observed = {row["name"] for row in rows if row["sizeBytes"] > 0}
    missing = sorted(expected_names - observed)
    if missing:
        raise AdapterError(
            f"sparse model is missing nonempty files: {', '.join(missing)}",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    result: dict[str, Any] = {"files": rows}
    result["manifestSha256"] = _sha256_bytes(_json_bytes(result))
    return result


def _model_receipt(model: ModelEvidence, path: Path) -> Mapping[str, Any]:
    return {
        "valid": model.valid,
        "registeredImageIds": list(model.registered_image_ids),
        "images": [
            {
                "imageId": image_id,
                "name": model.image_names_by_id[image_id],
                "cameraId": model.camera_ids_by_image_id[image_id],
                "cameraCenterMeters": list(model.camera_centers_by_image_id[image_id]),
                "camFromWorld": [
                    list(row) for row in model.cam_from_world_by_image_id[image_id]
                ],
            }
            for image_id in model.registered_image_ids
        ],
        "cameras": [
            {"cameraId": camera_id, **model.camera_contract_by_id[camera_id]}
            for camera_id in sorted(model.camera_contract_by_id)
        ],
        "numPoints3D": model.num_points3d,
        "artifactEvidence": _model_files(path),
    }


def _run_bounded_command(
    runner: CommandRunner,
    command: Sequence[str],
    *,
    deadline: RefineDeadline,
    log_path: Path,
) -> ColmapCommandResult:
    result = runner(command, deadline=deadline, log_path=log_path)
    if not log_path.is_file():
        raise AdapterError("qualification command did not retain its bounded log")
    if log_path.stat().st_size > COLMAP_LOG_TAIL_BYTES:
        raise AdapterError(
            "qualification command log exceeded the 64 KiB cap",
            "REFINE_ENGINE_LOG_IO",
        )
    if len(result.output_tail.encode("utf-8")) > COLMAP_LOG_TAIL_BYTES:
        raise AdapterError(
            "qualification command output tail exceeded the 64 KiB cap",
            "REFINE_ENGINE_LOG_IO",
        )
    return result


def _bounded_log_evidence(label: str, log_path: Path) -> Mapping[str, Any]:
    if not log_path.is_file() or log_path.stat().st_size > COLMAP_LOG_TAIL_BYTES:
        raise AdapterError(
            f"{label} did not retain a bounded engine log",
            "REFINE_ENGINE_LOG_IO",
        )
    return {
        "label": label,
        "kind": "pycolmap-binding",
        "logName": log_path.name,
        "retained": True,
        "validatedWithinCap": True,
        "logSha256": _sha256_file(log_path),
        "logSizeBytes": log_path.stat().st_size,
    }


def _negative_version_control(cli_output: str) -> Mapping[str, str]:
    try:
        qualify_colmap_versions(cli_output, "0.0.0")
    except AdapterError as exc:
        if exc.code != "REFINE_ENGINE_VERSION_MISMATCH":
            raise
        return {"status": "passed", "rejectedBindingVersion": "0.0.0", "code": exc.code}
    raise AdapterError("COLMAP mismatch negative control unexpectedly passed")


def _evidence_rows(
    value: Any,
    *,
    label: str,
    code: str,
) -> tuple[Mapping[str, Any], ...]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise AdapterError(f"{label} evidence must be a sequence", code)
    rows = tuple(value)
    if any(not isinstance(row, Mapping) for row in rows):
        raise AdapterError(f"{label} evidence contains a non-object row", code)
    return rows


def _positive_evidence_int(value: Any, *, label: str, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise AdapterError(f"{label} must be a positive integer", code)
    return value


def _nonnegative_evidence_int(value: Any, *, label: str, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise AdapterError(f"{label} must be a non-negative integer", code)
    return value


def _validate_toolchain_evidence(
    value: Any,
    *,
    binding_version: str,
) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise AdapterError(
            "PyCOLMAP toolchain evidence must be an object",
            "REFINE_ENGINE_FAILED",
        )
    required_strings = ("version", "colmapVersion", "colmapBuild")
    for key in required_strings:
        if not isinstance(value.get(key), str) or not value[key]:
            raise AdapterError(
                f"PyCOLMAP toolchain evidence has invalid {key}",
                "REFINE_ENGINE_FAILED",
            )
    if value["version"] != binding_version:
        raise AdapterError(
            "PyCOLMAP toolchain evidence disagrees with the binding version",
            "REFINE_ENGINE_VERSION_MISMATCH",
        )
    if type(value.get("hasCuda")) is not bool or value["hasCuda"] is not True:  # noqa: E721
        raise AdapterError(
            "PyCOLMAP reports a CPU-only build; GPU SIFT cannot be qualified",
            "REFINE_GPU_SIFT_UNAVAILABLE",
        )
    return dict(value)


def _validate_gpu_sift_rows(
    value: Any,
    images: Sequence[EngineImage],
) -> tuple[Mapping[str, Any], ...]:
    code = "REFINE_GPU_SIFT_FAILED"
    rows = _evidence_rows(value, label="GPU SIFT", code=code)
    expected_by_name = {image.name: image for image in images}
    if len(rows) != len(expected_by_name):
        raise AdapterError("GPU SIFT evidence has a missing or duplicate image", code)
    by_name: dict[str, Mapping[str, Any]] = {}
    image_ids: set[int] = set()
    camera_ids: set[int] = set()
    for row in rows:
        name = row.get("name")
        if not isinstance(name, str) or name not in expected_by_name or name in by_name:
            raise AdapterError(
                "GPU SIFT evidence has an unknown or duplicate image", code
            )
        image_id = _positive_evidence_int(
            row.get("imageId"), label=f"GPU SIFT imageId for {name}", code=code
        )
        camera_id = _positive_evidence_int(
            row.get("cameraId"), label=f"GPU SIFT cameraId for {name}", code=code
        )
        keypoints = _nonnegative_evidence_int(
            row.get("keypoints"), label=f"GPU SIFT keypoints for {name}", code=code
        )
        descriptors = _nonnegative_evidence_int(
            row.get("descriptors"),
            label=f"GPU SIFT descriptors for {name}",
            code=code,
        )
        if image_id in image_ids or camera_id in camera_ids:
            raise AdapterError("GPU SIFT evidence reuses an image or camera ID", code)
        if keypoints < MIN_GPU_SIFT_KEYPOINTS_PER_IMAGE or descriptors != keypoints:
            raise AdapterError(
                f"GPU SIFT evidence is too small for {name}: "
                f"keypoints={keypoints}, descriptors={descriptors}",
                code,
            )
        image_ids.add(image_id)
        camera_ids.add(camera_id)
        by_name[name] = {
            "name": name,
            "imageId": image_id,
            "cameraId": camera_id,
            "keypoints": keypoints,
            "descriptors": descriptors,
        }
    return tuple(by_name[image.name] for image in images)


def _validate_rewrite_rows(
    value: Any,
    images: Sequence[EngineImage],
    sift_rows: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], ...]:
    code = "REFINE_ENGINE_FIXTURE_FAILED"
    rows = _evidence_rows(value, label="intrinsics rewrite", code=code)
    expected_by_name = {image.name: image for image in images}
    sift_by_name = {str(row["name"]): row for row in sift_rows}
    if len(rows) != len(expected_by_name):
        raise AdapterError(
            "intrinsics rewrite evidence has a missing or duplicate image", code
        )
    by_name: dict[str, Mapping[str, Any]] = {}
    for row in rows:
        name = row.get("name")
        if not isinstance(name, str) or name not in expected_by_name or name in by_name:
            raise AdapterError(
                "intrinsics rewrite evidence has an unknown or duplicate image", code
            )
        image_id_before = _positive_evidence_int(
            row.get("imageIdBefore"), label=f"imageIdBefore for {name}", code=code
        )
        image_id_after = _positive_evidence_int(
            row.get("imageIdAfter"), label=f"imageIdAfter for {name}", code=code
        )
        camera_id_before = _positive_evidence_int(
            row.get("cameraIdBefore"), label=f"cameraIdBefore for {name}", code=code
        )
        camera_id_after = _positive_evidence_int(
            row.get("cameraIdAfter"), label=f"cameraIdAfter for {name}", code=code
        )
        image = expected_by_name[name]
        params = row.get("paramsAfter")
        expected_params = (
            image.intrinsics.fx,
            image.intrinsics.fy,
            image.intrinsics.cx,
            image.intrinsics.cy,
        )
        if (
            row.get("idsPreserved") is not True
            or image_id_before != image_id_after
            or image_id_after != sift_by_name[name]["imageId"]
            or camera_id_before != camera_id_after
            or camera_id_after != sift_by_name[name]["cameraId"]
            or row.get("modelAfter") != "PINHOLE"
            or row.get("widthAfter") != image.intrinsics.image_width
            or row.get("heightAfter") != image.intrinsics.image_height
            or row.get("hasPriorFocalLengthAfter") is not True
            or not isinstance(params, Sequence)
            or isinstance(params, (str, bytes))
            or len(params) != 4
            or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                or abs(float(value) - expected) > 1e-9
                for value, expected in zip(params, expected_params)
            )
        ):
            raise AdapterError(
                f"intrinsics rewrite evidence is inconsistent for {name}", code
            )
        by_name[name] = dict(row)
    return tuple(by_name[image.name] for image in images)


def _validate_match_rows(
    value: Any,
    pairs: Sequence[tuple[str, str]],
    rewrite_rows: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], ...]:
    code = "REFINE_ENGINE_FIXTURE_FAILED"
    rows = _evidence_rows(value, label="explicit-pair matching", code=code)
    expected_pairs = tuple(pairs)
    if len(rows) != len(expected_pairs):
        raise AdapterError(
            "explicit-pair evidence has a missing or duplicate pair", code
        )
    ids_by_name = {str(row["name"]): int(row["imageIdAfter"]) for row in rewrite_rows}
    by_pair: dict[tuple[str, str], Mapping[str, Any]] = {}
    expected_set = set(expected_pairs)
    for row in rows:
        pair = (row.get("first"), row.get("second"))
        if pair not in expected_set or pair in by_pair:
            raise AdapterError(
                "explicit-pair evidence has an unknown or duplicate pair", code
            )
        first, second = pair
        first_id = _positive_evidence_int(
            row.get("firstImageId"), label=f"firstImageId for {pair}", code=code
        )
        second_id = _positive_evidence_int(
            row.get("secondImageId"), label=f"secondImageId for {pair}", code=code
        )
        raw_matches = _nonnegative_evidence_int(
            row.get("rawMatches"), label=f"rawMatches for {pair}", code=code
        )
        inliers = _nonnegative_evidence_int(
            row.get("verifiedInliers"),
            label=f"verifiedInliers for {pair}",
            code=code,
        )
        if first_id != ids_by_name[first] or second_id != ids_by_name[second]:
            raise AdapterError("explicit-pair evidence changed an image ID", code)
        if raw_matches < MIN_RAW_MATCHES_PER_PAIR:
            raise AdapterError(
                f"explicit pair {first} {second} has only {raw_matches} raw matches",
                code,
            )
        if inliers < MIN_VERIFIED_INLIERS_PER_PAIR:
            raise AdapterError(
                f"explicit pair {first} {second} has only {inliers} verified inliers",
                code,
            )
        if inliers > raw_matches:
            raise AdapterError(
                f"explicit pair {first} {second} has more verified inliers than raw matches",
                code,
            )
        by_pair[(first, second)] = dict(row)
    return tuple(by_pair[pair] for pair in expected_pairs)


def _validated_pose_matrix(
    value: Any,
    *,
    stage: str,
) -> tuple[tuple[float, float, float, float], ...]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != 3
    ):
        raise AdapterError(
            f"{stage} model has a malformed cam_from_world pose",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    rows: list[tuple[float, float, float, float]] = []
    for row in value:
        if (
            isinstance(row, (str, bytes))
            or not isinstance(row, Sequence)
            or len(row) != 4
            or any(
                isinstance(item, bool)
                or not isinstance(item, (int, float))
                or not math.isfinite(float(item))
                for item in row
            )
        ):
            raise AdapterError(
                f"{stage} model has a malformed cam_from_world pose",
                "REFINE_ENGINE_FIXTURE_FAILED",
            )
        rows.append(tuple(float(item) for item in row))
    return tuple(rows)


def _assert_model_identity(
    model: ModelEvidence,
    expected_names_by_id: Mapping[int, str],
    expected_camera_ids_by_image_id: Mapping[int, int],
    *,
    stage: str,
    require_points: bool,
) -> None:
    if not isinstance(model, ModelEvidence):
        raise AdapterError(
            f"{stage} backend returned malformed model evidence",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    expected_ids = tuple(sorted(expected_names_by_id))
    if model.valid is not True:
        raise AdapterError(
            f"{stage} model is internally invalid", "REFINE_ENGINE_FIXTURE_FAILED"
        )
    if (
        isinstance(model.num_points3d, bool)
        or not isinstance(model.num_points3d, int)
        or model.num_points3d < 0
    ):
        raise AdapterError(
            f"{stage} model has an invalid 3D point count",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    if model.registered_image_ids != expected_ids:
        raise AdapterError(
            f"{stage} model changed the registered database image IDs",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    expected_camera_ids = set(expected_camera_ids_by_image_id.values())
    try:
        observed_key_sets = (
            set(model.image_names_by_id),
            set(model.camera_ids_by_image_id),
            set(model.camera_centers_by_image_id),
            set(model.cam_from_world_by_image_id),
            set(model.camera_contract_by_id),
        )
    except TypeError as exc:
        raise AdapterError(
            f"{stage} backend returned malformed model evidence",
            "REFINE_ENGINE_FIXTURE_FAILED",
        ) from exc
    if observed_key_sets != (
        set(expected_ids),
        set(expected_ids),
        set(expected_ids),
        set(expected_ids),
        expected_camera_ids,
    ):
        raise AdapterError(
            f"{stage} model evidence is missing or duplicates an ID",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    actual_names = {
        image_id: model.image_names_by_id[image_id] for image_id in expected_ids
    }
    if actual_names != dict(expected_names_by_id):
        raise AdapterError(
            f"{stage} model changed the image-ID/name join",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    actual_camera_ids = {
        image_id: model.camera_ids_by_image_id[image_id] for image_id in expected_ids
    }
    if actual_camera_ids != dict(expected_camera_ids_by_image_id):
        raise AdapterError(
            f"{stage} model changed the image-ID/camera-ID join",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )
    for image_id in expected_ids:
        center = model.camera_centers_by_image_id[image_id]
        if (
            isinstance(center, (str, bytes))
            or not isinstance(center, Sequence)
            or len(center) != 3
            or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in center
            )
        ):
            raise AdapterError(
                f"{stage} model has a non-finite or malformed camera center",
                "REFINE_ENGINE_FIXTURE_FAILED",
            )
        _validated_pose_matrix(
            model.cam_from_world_by_image_id[image_id],
            stage=stage,
        )
    expected_params = [
        FIXTURE_INTRINSICS.fx,
        FIXTURE_INTRINSICS.fy,
        FIXTURE_INTRINSICS.cx,
        FIXTURE_INTRINSICS.cy,
    ]
    for camera_id in sorted(expected_camera_ids):
        camera = model.camera_contract_by_id[camera_id]
        try:
            params = list(camera["params"])
            model_name = camera["model"]
            width = camera["width"]
            height = camera["height"]
        except (KeyError, TypeError) as exc:
            raise AdapterError(
                f"{stage} model has malformed camera evidence",
                "REFINE_ENGINE_FIXTURE_FAILED",
            ) from exc
        if (
            model_name != "PINHOLE"
            or width != FIXTURE_WIDTH
            or height != FIXTURE_HEIGHT
            or len(params) != len(expected_params)
            or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in params
            )
            or any(
                abs(float(left) - right) > 1e-8
                for left, right in zip(params, expected_params)
            )
        ):
            raise AdapterError(
                f"{stage} model changed the qualified PINHOLE intrinsics",
                "REFINE_ENGINE_FIXTURE_FAILED",
            )
    if require_points and model.num_points3d < MIN_TRIANGULATED_POINTS:
        raise AdapterError(
            f"{stage} model has only {model.num_points3d} triangulated points",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )


def _validate_bundle_adjustment_evidence(value: Any) -> Mapping[str, Any]:
    code = "REFINE_ENGINE_FIXTURE_FAILED"
    if not isinstance(value, Mapping):
        raise AdapterError("bundle adjustment evidence must be an object", code)
    residuals = value.get("numResiduals")
    termination = value.get("terminationType")
    if (
        value.get("usable") is not True
        or isinstance(residuals, bool)
        or not isinstance(residuals, int)
        or residuals <= 0
        or not isinstance(termination, str)
        or termination in {"FAILURE", "USER_FAILURE"}
        or value.get("modelWritten") is not True
        or value.get("refineFocalLength") is not False
        or value.get("refinePrincipalPoint") is not False
        or value.get("refineExtraParams") is not False
    ):
        raise AdapterError(
            "bundle adjustment lacks affirmative usable-solver evidence",
            code,
        )
    return dict(value)


def _assert_seed_poses(
    model: ModelEvidence,
    expected_poses_by_image_id: Mapping[int, ColmapPose],
) -> None:
    for image_id, expected_pose in expected_poses_by_image_id.items():
        expected_center = _pose_center(expected_pose)
        actual_center = model.camera_centers_by_image_id[image_id]
        actual_matrix = _validated_pose_matrix(
            model.cam_from_world_by_image_id[image_id],
            stage="known-pose seed",
        )
        expected_matrix = _pose_matrix(expected_pose)
        if (
            len(actual_center) != 3
            or not all(math.isfinite(value) for value in actual_center)
            or any(
                abs(left - right) > 1e-9
                for left, right in zip(actual_center, expected_center)
            )
        ):
            raise AdapterError(
                "known-pose seed did not persist the exact input camera centres",
                "REFINE_ENGINE_FIXTURE_FAILED",
            )
        if any(
            abs(actual_matrix[row][column] - expected_matrix[row][column]) > 1e-9
            for row in range(3)
            for column in range(4)
        ):
            raise AdapterError(
                "known-pose seed did not persist the exact input cam_from_world",
                "REFINE_ENGINE_FIXTURE_FAILED",
            )


def run_colmap_qualification(
    config: QualificationConfig,
    *,
    backend: QualificationBackend | None = None,
    command_runner: CommandRunner = run_colmap_subprocess,
) -> Path:
    """Run the exact local-only Item 4A proof and publish its receipt last."""

    output_dir = _prepare_output(config.output_dir)
    image_dir = output_dir / "images"
    logs_dir = output_dir / "logs"
    logs_dir.mkdir()
    database_path = output_dir / "database.db"
    pairs_path = output_dir / "pairs.txt"
    pose_control_path = output_dir / "non-identity-pose-control-model"
    seed_path = output_dir / "seed-model"
    triangulated_path = output_dir / "triangulated-model"
    cli_adjusted_path = output_dir / "cli-adjusted-probe"
    adjusted_path = output_dir / "adjusted-model"

    colmap = _resolve_executable(config.colmap_path, "COLMAP")
    nvcc = _resolve_executable(config.nvcc_path, "nvcc")
    nvidia_smi = _resolve_executable(config.nvidia_smi_path, "nvidia-smi")
    engine = (
        _backend_call(
            "PyCOLMAP import",
            lambda: PycolmapBackend.load(
                config=PycolmapBackendConfig(
                    random_seed=QUALIFICATION_RANDOM_SEED,
                    maximum_features_per_image=MAX_GPU_SIFT_FEATURES_PER_IMAGE,
                    geometric_verification_minimum_inliers=(
                        MIN_VERIFIED_INLIERS_PER_PAIR
                    ),
                )
            ),
        )
        if backend is None
        else backend
    )

    started = time.monotonic()
    deadline = RefineDeadline.start(
        now_monotonic_s=started,
        lease_expires_at_monotonic_s=(
            started + REFINE_STAGE_ENGINE_BUDGET_S + LEASE_COMPLETION_RESERVE_S
        ),
    )

    command_rows: list[dict[str, Any]] = []
    binding_rows: list[Mapping[str, Any]] = []
    log_index = 0

    def next_log_path(label: str) -> Path:
        nonlocal log_index
        path = logs_dir / f"{log_index:02d}-{label}.log"
        log_index += 1
        return path

    def run_probe(label: str, argv: Sequence[str]) -> ColmapCommandResult:
        log_path = next_log_path(label)
        result = _run_bounded_command(
            command_runner,
            argv,
            deadline=deadline,
            log_path=log_path,
        )
        command_rows.append(
            {
                "label": label,
                "program": Path(argv[0]).name,
                "subcommand": argv[1] if len(argv) > 1 else None,
                "logName": log_path.name,
                "retained": True,
                "validatedWithinCap": True,
                "logSha256": _sha256_file(log_path),
                "logSizeBytes": log_path.stat().st_size,
            }
        )
        return result

    cli_help = run_probe("colmap-help", [str(colmap), "-h"])
    binding_version = _backend_call("PyCOLMAP version probe", lambda: engine.version)
    qualification = qualify_colmap_versions(cli_help.output_tail, binding_version)
    pycolmap_evidence = _validate_toolchain_evidence(
        _backend_call("PyCOLMAP toolchain evidence", engine.toolchain_evidence),
        binding_version=binding_version,
    )
    mismatch_control = _negative_version_control(cli_help.output_tail)
    nvcc_result = run_probe("nvcc-version", [str(nvcc), "--version"])
    gpu_result = run_probe(
        "nvidia-smi",
        [
            str(nvidia_smi),
            "--query-gpu=name,driver_version,compute_cap",
            "--format=csv,noheader",
        ],
    )

    images, fixture_contract = materialize_fixture(image_dir)
    engine_images = fixture_engine_images(images)
    pairs = explicit_pairs(images)
    pair_contract = write_explicit_pairs(pairs_path, pairs)
    sift_log = next_log_path("pycolmap-gpu-sift")
    sift_log.touch(exist_ok=False)
    gpu_sift_rows = _validate_gpu_sift_rows(
        _backend_call(
            "PyCOLMAP GPU SIFT",
            lambda: engine.extract_gpu_features(
                database_path=database_path,
                image_dir=image_dir,
                images=engine_images,
                gpu_index=config.gpu_index,
                log_path=sift_log,
            ),
        ),
        engine_images,
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-gpu-sift", sift_log))
    rewrite_log = next_log_path("pycolmap-intrinsics-rewrite")
    rewrite_log.touch(exist_ok=False)
    rewrite_rows = _validate_rewrite_rows(
        _backend_call(
            "PyCOLMAP intrinsics rewrite",
            lambda: engine.rewrite_intrinsics_preserving_ids(
                database_path=database_path,
                images=engine_images,
                log_path=rewrite_log,
            ),
        ),
        engine_images,
        gpu_sift_rows,
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-intrinsics-rewrite", rewrite_log)
    )
    match_log = next_log_path("pycolmap-explicit-pairs")
    match_log.touch(exist_ok=False)
    match_rows = _validate_match_rows(
        _backend_call(
            "PyCOLMAP explicit-pair matching",
            lambda: engine.match_explicit_pairs(
                database_path=database_path,
                pairs_path=pairs_path,
                image_pairs=pairs,
                gpu_index=config.gpu_index,
                log_path=match_log,
            ),
        ),
        pairs,
        rewrite_rows,
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-explicit-pairs", match_log))
    expected_names_by_id = {
        int(row["imageIdAfter"]): str(row["name"]) for row in rewrite_rows
    }
    expected_camera_ids_by_image_id = {
        int(row["imageIdAfter"]): int(row["cameraIdAfter"]) for row in rewrite_rows
    }
    engine_images_by_name = {image.name: image for image in engine_images}
    expected_poses_by_image_id = {
        int(row["imageIdAfter"]): engine_images_by_name[str(row["name"])].cam_from_world
        for row in rewrite_rows
    }

    pose_control_image = non_identity_pose_control_image(engine_images[0])
    pose_control_row = next(
        row for row in rewrite_rows if row["name"] == pose_control_image.name
    )
    pose_control_image_id = int(pose_control_row["imageIdAfter"])
    pose_control_camera_id = int(pose_control_row["cameraIdAfter"])
    pose_control_names = {pose_control_image_id: pose_control_image.name}
    pose_control_camera_ids = {pose_control_image_id: pose_control_camera_id}
    pose_control_poses = {
        pose_control_image_id: pose_control_image.cam_from_world,
    }
    pose_control_write_log = next_log_path("pycolmap-non-identity-pose-write")
    pose_control_write_log.touch(exist_ok=False)
    pose_control_written = _backend_call(
        "PyCOLMAP non-identity pose write control",
        lambda: engine.build_known_pose_seed(
            database_path=database_path,
            images=(pose_control_image,),
            output_path=pose_control_path,
            log_path=pose_control_write_log,
        ),
    )
    binding_rows.append(
        _bounded_log_evidence(
            "pycolmap-non-identity-pose-write", pose_control_write_log
        )
    )
    _assert_model_identity(
        pose_control_written,
        pose_control_names,
        pose_control_camera_ids,
        stage="non-identity pose write control",
        require_points=False,
    )
    _assert_seed_poses(pose_control_written, pose_control_poses)
    pose_control_read_log = next_log_path("pycolmap-non-identity-pose-read")
    pose_control_read_log.touch(exist_ok=False)
    pose_control_model = _backend_call(
        "PyCOLMAP non-identity pose read control",
        lambda: engine.inspect_model(
            pose_control_path,
            log_path=pose_control_read_log,
        ),
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-non-identity-pose-read", pose_control_read_log)
    )
    _assert_model_identity(
        pose_control_model,
        pose_control_names,
        pose_control_camera_ids,
        stage="non-identity pose read control",
        require_points=False,
    )
    _assert_seed_poses(pose_control_model, pose_control_poses)

    seed_log = next_log_path("pycolmap-known-pose-seed")
    seed_log.touch(exist_ok=False)
    seed_model = _backend_call(
        "PyCOLMAP known-pose seed",
        lambda: engine.build_known_pose_seed(
            database_path=database_path,
            images=engine_images,
            output_path=seed_path,
            log_path=seed_log,
        ),
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-known-pose-seed", seed_log))
    _assert_model_identity(
        seed_model,
        expected_names_by_id,
        expected_camera_ids_by_image_id,
        stage="known-pose seed",
        require_points=False,
    )
    _assert_seed_poses(seed_model, expected_poses_by_image_id)
    if seed_model.num_points3d != 0:
        raise AdapterError(
            "known-pose seed model must not contain points",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )

    triangulated_path.mkdir()
    run_probe(
        "point-triangulator",
        [
            str(colmap),
            "point_triangulator",
            "--database_path",
            str(database_path),
            "--image_path",
            str(image_dir),
            "--input_path",
            str(seed_path),
            "--output_path",
            str(triangulated_path),
            "--clear_points",
            "1",
            "--refine_intrinsics",
            "0",
            "--Mapper.random_seed",
            str(QUALIFICATION_RANDOM_SEED),
        ],
    )
    triangulated_inspect_log = next_log_path("pycolmap-inspect-triangulated")
    triangulated_inspect_log.touch(exist_ok=False)
    triangulated_model = _backend_call(
        "PyCOLMAP triangulated-model inspection",
        lambda: engine.inspect_model(
            triangulated_path,
            log_path=triangulated_inspect_log,
        ),
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-inspect-triangulated", triangulated_inspect_log)
    )
    _assert_model_identity(
        triangulated_model,
        expected_names_by_id,
        expected_camera_ids_by_image_id,
        stage="triangulated",
        require_points=True,
    )

    cli_adjusted_path.mkdir()
    run_probe(
        "bundle-adjuster-cli-compatibility",
        [
            str(colmap),
            "bundle_adjuster",
            "--input_path",
            str(triangulated_path),
            "--output_path",
            str(cli_adjusted_path),
            "--BundleAdjustment.refine_focal_length",
            "0",
            "--BundleAdjustment.refine_principal_point",
            "0",
            "--BundleAdjustment.refine_extra_params",
            "0",
        ],
    )
    bundle_adjust_log = next_log_path("pycolmap-bundle-adjuster")
    bundle_adjust_log.touch(exist_ok=False)
    bundle_adjustment_evidence = _validate_bundle_adjustment_evidence(
        _backend_call(
            "PyCOLMAP bundle adjustment",
            lambda: engine.bundle_adjust_with_success_evidence(
                input_path=triangulated_path,
                output_path=adjusted_path,
                log_path=bundle_adjust_log,
            ),
        ),
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-bundle-adjuster", bundle_adjust_log)
    )
    adjusted_inspect_log = next_log_path("pycolmap-inspect-adjusted")
    adjusted_inspect_log.touch(exist_ok=False)
    adjusted_model = _backend_call(
        "PyCOLMAP adjusted-model inspection",
        lambda: engine.inspect_model(
            adjusted_path,
            log_path=adjusted_inspect_log,
        ),
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-inspect-adjusted", adjusted_inspect_log)
    )
    _assert_model_identity(
        adjusted_model,
        expected_names_by_id,
        expected_camera_ids_by_image_id,
        stage="bundle-adjusted",
        require_points=True,
    )

    toolchain: dict[str, Any] = {
        "colmap": {
            "targetVersion": qualification.target_version,
            "cliVersion": qualification.cli_version,
            "path": str(colmap),
            "sha256": _sha256_file(colmap),
        },
        "pycolmap": pycolmap_evidence,
        "nvcc": {
            "path": str(nvcc),
            "sha256": _sha256_file(nvcc),
            "output": nvcc_result.output_tail.strip(),
        },
        "gpu": {
            "query": gpu_result.output_tail.strip(),
            "requestedIndex": config.gpu_index,
        },
        "python": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
            "executable": str(Path(sys.executable).resolve()),
        },
        "harnessSourceSha256": _sha256_file(Path(__file__)),
        "engineSourceSha256": _sha256_file(Path(refine_engine.__file__)),
    }
    toolchain["evidenceSha256"] = _sha256_bytes(_json_bytes(toolchain))

    receipt: dict[str, Any] = {
        "schemaVersion": QUALIFICATION_SCHEMA_VERSION,
        "qualification": QUALIFICATION_NAME,
        "status": "passed",
        "nonMutatingContract": {
            "queue": "not-imported-not-called",
            "businessDatabase": "not-imported-not-called",
            "storage": "not-imported-not-called",
            "databaseScope": "local-scratch-sqlite-only",
        },
        "versionGate": {
            "target": COLMAP_TARGET_VERSION,
            "cli": qualification.cli_version,
            "binding": qualification.binding_version,
            "mismatchNegativeControl": mismatch_control,
        },
        "configuredRandomSeeds": {
            "pycolmap": QUALIFICATION_RANDOM_SEED,
            "twoViewGeometryRansac": QUALIFICATION_RANDOM_SEED,
            "pointTriangulatorMapper": QUALIFICATION_RANDOM_SEED,
        },
        "toolchain": toolchain,
        "fixture": fixture_contract,
        "gpuSift": {
            "requestedDevice": "cuda",
            "requestedGpuIndex": config.gpu_index,
            "randomSeed": QUALIFICATION_RANDOM_SEED,
            "images": list(gpu_sift_rows),
        },
        "intrinsicsRewrite": list(rewrite_rows),
        "explicitPairMatching": {**pair_contract, "pairs": list(match_rows)},
        "database": {
            "name": database_path.name,
            "sha256": _sha256_file(database_path),
            "sizeBytes": database_path.stat().st_size,
        },
        "nonIdentityPoseRoundTrip": {
            "name": pose_control_image.name,
            "imageId": pose_control_image_id,
            "cameraId": pose_control_camera_id,
            "expectedCamFromWorld": [
                list(row) for row in _pose_matrix(pose_control_image.cam_from_world)
            ],
            "actualCamFromWorld": [
                list(row)
                for row in pose_control_model.cam_from_world_by_image_id[
                    pose_control_image_id
                ]
            ],
            "model": _model_receipt(pose_control_model, pose_control_path),
        },
        "knownPoseSeed": _model_receipt(seed_model, seed_path),
        "triangulatedModel": _model_receipt(triangulated_model, triangulated_path),
        "bundleAdjustment": {
            "cliCompatibilityProbe": {
                "artifactEvidence": _model_files(cli_adjusted_path),
                "solverSuccessNotInferredFromExitCode": True,
            },
            "bindingSolver": dict(bundle_adjustment_evidence),
        },
        "bundleAdjustedModel": _model_receipt(adjusted_model, adjusted_path),
        "boundedEngineLogs": {
            "capBytes": COLMAP_LOG_TAIL_BYTES,
            "commands": command_rows,
            "bindings": binding_rows,
        },
    }
    receipt["payloadSha256"] = _sha256_bytes(_json_bytes(receipt))
    receipt_path = output_dir / RECEIPT_NAME
    publish_immutable(receipt_path, _json_bytes(receipt))
    return receipt_path


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run the local-only P2 Item 4A COLMAP 4.0.2 GPU/known-pose qualification"
        )
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--colmap", default="colmap", dest="colmap_path")
    parser.add_argument(
        "--nvcc", default="/usr/local/cuda-11.8/bin/nvcc", dest="nvcc_path"
    )
    parser.add_argument(
        "--nvidia-smi",
        default="/usr/bin/nvidia-smi",
        dest="nvidia_smi_path",
    )
    parser.add_argument("--gpu-index", default="0")
    args = parser.parse_args(argv)
    try:
        receipt_path = run_colmap_qualification(
            QualificationConfig(
                output_dir=args.output_dir,
                colmap_path=args.colmap_path,
                nvcc_path=args.nvcc_path,
                nvidia_smi_path=args.nvidia_smi_path,
                gpu_index=args.gpu_index,
            )
        )
    except Exception as exc:
        if not isinstance(exc, AdapterError):
            exc = AdapterError(
                "qualification failed "
                f"({type(exc).__name__}): {_bounded_exception_text(exc)}",
                "REFINE_ENGINE_FAILED",
            )
        print(
            json.dumps(
                {"status": "failed", "code": exc.code, "error": str(exc)},
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    print(
        json.dumps(
            {
                "status": receipt["status"],
                "receipt": str(receipt_path),
                "payloadSha256": receipt["payloadSha256"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
