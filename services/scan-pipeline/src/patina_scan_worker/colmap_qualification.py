"""Non-mutating COLMAP 4.0.2 qualification for the P2 refine engine.

The production refine handler is deliberately not registered yet.  This module
only creates a deterministic synthetic fixture and local scratch artifacts.  It
does not import the queue, database client, Storage client, or worker config.

DeskDev runs this module after the item-3 doctor passes.  Unit tests inject a
fake backend so ordinary development machines do not need PyCOLMAP or a GPU.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib
import io
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
from typing import Any, Callable, Mapping, Protocol, Sequence

from .refine_adapter import (
    COLMAP_LOG_TAIL_BYTES,
    COLMAP_TARGET_VERSION,
    LEASE_COMPLETION_RESERVE_S,
    REFINE_STAGE_ENGINE_BUDGET_S,
    AdapterError,
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


@dataclass(frozen=True)
class ModelEvidence:
    valid: bool
    registered_image_ids: tuple[int, ...]
    image_names_by_id: Mapping[int, str]
    camera_ids_by_image_id: Mapping[int, int]
    camera_contract_by_id: Mapping[int, Mapping[str, Any]]
    camera_centers_by_image_id: Mapping[int, tuple[float, float, float]]
    num_points3d: int


class QualificationBackend(Protocol):
    """The engine-facing seam used by both the real and fake qualification."""

    @property
    def version(self) -> str: ...

    def toolchain_evidence(self) -> Mapping[str, Any]: ...

    def extract_gpu_features(
        self,
        *,
        database_path: Path,
        image_dir: Path,
        images: Sequence[FixtureImage],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def rewrite_intrinsics_preserving_ids(
        self,
        *,
        database_path: Path,
        images: Sequence[FixtureImage],
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def match_explicit_pairs(
        self,
        *,
        database_path: Path,
        pairs_path: Path,
        image_pairs: Sequence[tuple[str, str]],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def build_known_pose_seed(
        self,
        *,
        database_path: Path,
        images: Sequence[FixtureImage],
        output_path: Path,
        log_path: Path,
    ) -> ModelEvidence: ...

    def inspect_model(self, path: Path, *, log_path: Path) -> ModelEvidence: ...

    def bundle_adjust_with_success_evidence(
        self,
        *,
        input_path: Path,
        output_path: Path,
        log_path: Path,
    ) -> Mapping[str, Any]: ...


CommandRunner = Callable[..., ColmapCommandResult]


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _backend_call(label: str, callback: Callable[[], Any]) -> Any:
    """Normalize native binding failures into the qualification error contract."""

    try:
        return callback()
    except AdapterError:
        raise
    except Exception as exc:
        raise AdapterError(
            f"{label} failed ({type(exc).__name__}): {exc}",
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


class _BoundedTextLog(io.TextIOBase):
    """A text writer whose retained file is always a capped UTF-8 tail."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._tail = bytearray()
        self._handle = path.open("w+b")
        self._closed_by_owner = False

    @property
    def encoding(self) -> str:
        return "utf-8"

    def writable(self) -> bool:
        return True

    def write(self, value: str) -> int:
        if self._closed_by_owner:
            raise ValueError("write to closed qualification log")
        payload = value.encode("utf-8", errors="replace")
        if len(payload) >= COLMAP_LOG_TAIL_BYTES:
            self._tail[:] = payload[-COLMAP_LOG_TAIL_BYTES:]
        else:
            overflow = len(self._tail) + len(payload) - COLMAP_LOG_TAIL_BYTES
            if overflow > 0:
                del self._tail[:overflow]
            self._tail.extend(payload)
        self._handle.seek(0)
        self._handle.truncate(0)
        self._handle.write(self._tail)
        self._handle.flush()
        return len(value)

    def flush(self) -> None:
        if not self._closed_by_owner:
            self._handle.flush()

    def close_owned(self) -> None:
        if self._closed_by_owner:
            return
        self._handle.flush()
        os.fsync(self._handle.fileno())
        self._handle.close()
        self._closed_by_owner = True


@contextlib.contextmanager
def _bounded_binding_output(pycolmap_module: Any, log_path: Path):
    """Capture Python and C++ binding streams into one hard-capped tail."""

    writer = _BoundedTextLog(log_path)
    try:
        with contextlib.redirect_stdout(writer), contextlib.redirect_stderr(writer):
            ostream = getattr(pycolmap_module, "ostream", None)
            if ostream is None:
                yield
            else:
                with ostream(stdout=True, stderr=True):
                    yield
    finally:
        writer.close_owned()


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


class PycolmapBackend:
    """Exact PyCOLMAP 4.0.2 database/model calls used by the future engine."""

    def __init__(self, pycolmap_module: Any, numpy_module: Any) -> None:
        self._p = pycolmap_module
        self._np = numpy_module

    @classmethod
    def load(cls) -> "PycolmapBackend":
        try:
            pycolmap_module = importlib.import_module("pycolmap")
            numpy_module = importlib.import_module("numpy")
        except (ImportError, OSError) as exc:
            raise AdapterError(
                f"cannot import the COLMAP qualification bindings: {exc}",
                "REFINE_ENGINE_IMPORT",
            ) from exc
        return cls(pycolmap_module, numpy_module)

    @property
    def version(self) -> str:
        return str(self._p.__version__)

    def toolchain_evidence(self) -> Mapping[str, Any]:
        has_cuda = self._p.has_cuda
        if type(has_cuda) is not bool or not has_cuda:  # noqa: E721
            raise AdapterError(
                "PyCOLMAP has_cuda must be the bool True; GPU SIFT cannot be qualified",
                "REFINE_GPU_SIFT_UNAVAILABLE",
            )
        return {
            "version": self.version,
            "colmapVersion": str(self._p.COLMAP_version),
            "colmapBuild": str(self._p.COLMAP_build),
            "hasCuda": has_cuda,
        }

    def _database(self, path: Path) -> Any:
        return self._p.Database.open(path)

    def _image(self, database: Any, name: str) -> Any:
        image = database.read_image_with_name(name)
        if image is None:
            raise AdapterError(f"PyCOLMAP database is missing fixture image {name}")
        return image

    def extract_gpu_features(
        self,
        *,
        database_path: Path,
        image_dir: Path,
        images: Sequence[FixtureImage],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]:
        if type(self._p.has_cuda) is not bool or not self._p.has_cuda:  # noqa: E721
            raise AdapterError(
                "PyCOLMAP has_cuda must be the bool True; GPU SIFT cannot be qualified",
                "REFINE_GPU_SIFT_UNAVAILABLE",
            )
        extraction_options = self._p.FeatureExtractionOptions()
        extraction_options.use_gpu = True
        extraction_options.gpu_index = gpu_index
        extraction_options.max_image_size = max(FIXTURE_WIDTH, FIXTURE_HEIGHT)
        sift_options = extraction_options.sift
        sift_options.max_num_features = 4096
        extraction_options.sift = sift_options
        reader_options = self._p.ImageReaderOptions()
        reader_options.camera_model = "SIMPLE_RADIAL"
        rows: list[dict[str, Any]] = []
        camera_ids: set[int] = set()
        with _bounded_binding_output(self._p, log_path):
            self._p.set_random_seed(QUALIFICATION_RANDOM_SEED)
            self._p.extract_features(
                database_path=database_path,
                image_path=image_dir,
                image_names=[image.name for image in images],
                camera_mode=self._p.CameraMode.PER_IMAGE,
                reader_options=reader_options,
                extraction_options=extraction_options,
                device=self._p.Device.cuda,
            )

            with self._database(database_path) as database:
                for fixture_image in images:
                    image = self._image(database, fixture_image.name)
                    image_id = int(image.image_id)
                    camera_id = int(image.camera_id)
                    keypoints = int(database.num_keypoints_for_image(image_id))
                    descriptors = int(database.num_descriptors_for_image(image_id))
                    if image_id <= 0 or camera_id <= 0:
                        raise AdapterError(
                            "PyCOLMAP created a non-positive database identifier"
                        )
                    if (
                        keypoints < MIN_GPU_SIFT_KEYPOINTS_PER_IMAGE
                        or descriptors != keypoints
                    ):
                        raise AdapterError(
                            f"GPU SIFT evidence is too small for {fixture_image.name}: "
                            f"keypoints={keypoints}, descriptors={descriptors}",
                            "REFINE_GPU_SIFT_FAILED",
                        )
                    camera_ids.add(camera_id)
                    rows.append(
                        {
                            "name": fixture_image.name,
                            "imageId": image_id,
                            "cameraId": camera_id,
                            "keypoints": keypoints,
                            "descriptors": descriptors,
                        }
                    )
        if len(camera_ids) != len(images):
            raise AdapterError(
                "CameraMode.PER_IMAGE did not create one camera per fixture image"
            )
        return rows

    def rewrite_intrinsics_preserving_ids(
        self,
        *,
        database_path: Path,
        images: Sequence[FixtureImage],
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]:
        rows: list[dict[str, Any]] = []
        with (
            _bounded_binding_output(self._p, log_path),
            self._database(database_path) as database,
        ):
            for fixture_image in images:
                image_before = self._image(database, fixture_image.name)
                image_id_before = int(image_before.image_id)
                camera_id_before = int(image_before.camera_id)
                camera = database.read_camera(camera_id_before)
                model_before = str(camera.model_name)
                camera.model = self._p.CameraModelId.PINHOLE
                camera.width = fixture_image.intrinsics.image_width
                camera.height = fixture_image.intrinsics.image_height
                camera.params = [
                    fixture_image.intrinsics.fx,
                    fixture_image.intrinsics.fy,
                    fixture_image.intrinsics.cx,
                    fixture_image.intrinsics.cy,
                ]
                camera.has_prior_focal_length = True
                database.update_camera(camera)

                image_after = self._image(database, fixture_image.name)
                camera_after = database.read_camera(int(image_after.camera_id))
                params_after = [float(value) for value in camera_after.params]
                expected_params = [
                    fixture_image.intrinsics.fx,
                    fixture_image.intrinsics.fy,
                    fixture_image.intrinsics.cx,
                    fixture_image.intrinsics.cy,
                ]
                ids_preserved = (
                    int(image_after.image_id) == image_id_before
                    and int(image_after.camera_id) == camera_id_before
                    and int(camera_after.camera_id) == camera_id_before
                )
                if not ids_preserved:
                    raise AdapterError(
                        "camera rewrite changed a database image or camera ID"
                    )
                if (
                    str(camera_after.model_name) != "PINHOLE"
                    or int(camera_after.width) != fixture_image.intrinsics.image_width
                    or int(camera_after.height) != fixture_image.intrinsics.image_height
                    or not bool(camera_after.has_prior_focal_length)
                    or len(params_after) != len(expected_params)
                    or any(
                        abs(left - right) > 1e-9
                        for left, right in zip(params_after, expected_params)
                    )
                ):
                    raise AdapterError(
                        "camera rewrite did not persist exact PINHOLE intrinsics"
                    )
                rows.append(
                    {
                        "name": fixture_image.name,
                        "imageIdBefore": image_id_before,
                        "imageIdAfter": int(image_after.image_id),
                        "cameraIdBefore": camera_id_before,
                        "cameraIdAfter": int(image_after.camera_id),
                        "modelBefore": model_before,
                        "modelAfter": str(camera_after.model_name),
                        "widthAfter": int(camera_after.width),
                        "heightAfter": int(camera_after.height),
                        "paramsAfter": params_after,
                        "hasPriorFocalLengthAfter": bool(
                            camera_after.has_prior_focal_length
                        ),
                        "idsPreserved": ids_preserved,
                    }
                )
        return rows

    def match_explicit_pairs(
        self,
        *,
        database_path: Path,
        pairs_path: Path,
        image_pairs: Sequence[tuple[str, str]],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]:
        matching_options = self._p.FeatureMatchingOptions()
        matching_options.use_gpu = True
        matching_options.gpu_index = gpu_index
        matching_options.guided_matching = True
        matching_options.skip_geometric_verification = False
        pairing_options = self._p.ImportedPairingOptions()
        pairing_options.match_list_path = pairs_path
        verification_options = self._p.TwoViewGeometryOptions()
        verification_options.compute_relative_pose = True
        verification_options.detect_watermark = False
        verification_options.min_num_inliers = MIN_VERIFIED_INLIERS_PER_PAIR
        ransac_options = verification_options.ransac
        ransac_options.random_seed = QUALIFICATION_RANDOM_SEED
        verification_options.ransac = ransac_options
        rows: list[dict[str, Any]] = []
        with _bounded_binding_output(self._p, log_path):
            self._p.set_random_seed(QUALIFICATION_RANDOM_SEED)
            self._p.match_image_pairs(
                database_path=database_path,
                matching_options=matching_options,
                pairing_options=pairing_options,
                verification_options=verification_options,
                device=self._p.Device.cuda,
            )

            with self._database(database_path) as database:
                for first_name, second_name in image_pairs:
                    first = self._image(database, first_name)
                    second = self._image(database, second_name)
                    first_id = int(first.image_id)
                    second_id = int(second.image_id)
                    raw_matches = int(len(database.read_matches(first_id, second_id)))
                    verified = bool(
                        database.exists_two_view_geometry(first_id, second_id)
                    )
                    inliers = 0
                    if verified:
                        geometry = database.read_two_view_geometry(first_id, second_id)
                        inliers = int(len(geometry.inlier_matches))
                    if raw_matches < MIN_RAW_MATCHES_PER_PAIR:
                        raise AdapterError(
                            f"explicit pair {first_name} {second_name} has only {raw_matches} raw matches",
                            "REFINE_ENGINE_FIXTURE_FAILED",
                        )
                    if not verified or inliers < MIN_VERIFIED_INLIERS_PER_PAIR:
                        raise AdapterError(
                            f"explicit pair {first_name} {second_name} has only {inliers} verified inliers",
                            "REFINE_ENGINE_FIXTURE_FAILED",
                        )
                    rows.append(
                        {
                            "first": first_name,
                            "second": second_name,
                            "firstImageId": first_id,
                            "secondImageId": second_id,
                            "rawMatches": raw_matches,
                            "verifiedInliers": inliers,
                        }
                    )
        return rows

    def _new_camera(self, fixture_image: FixtureImage, camera_id: int) -> Any:
        camera = self._p.Camera()
        camera.camera_id = camera_id
        camera.model = self._p.CameraModelId.PINHOLE
        camera.width = fixture_image.intrinsics.image_width
        camera.height = fixture_image.intrinsics.image_height
        camera.params = [
            fixture_image.intrinsics.fx,
            fixture_image.intrinsics.fy,
            fixture_image.intrinsics.cx,
            fixture_image.intrinsics.cy,
        ]
        camera.has_prior_focal_length = True
        return camera

    def build_known_pose_seed(
        self,
        *,
        database_path: Path,
        images: Sequence[FixtureImage],
        output_path: Path,
        log_path: Path,
    ) -> ModelEvidence:
        reconstruction = self._p.Reconstruction()
        output_path.mkdir(parents=True, exist_ok=False)
        with (
            _bounded_binding_output(self._p, log_path),
            self._database(database_path) as database,
        ):
            for fixture_image in images:
                database_image = self._image(database, fixture_image.name)
                image_id = int(database_image.image_id)
                camera_id = int(database_image.camera_id)
                camera = self._new_camera(fixture_image, camera_id)
                reconstruction.add_camera_with_trivial_rig(camera)
                image = self._p.Image(
                    name=fixture_image.name,
                    camera_id=camera_id,
                    image_id=image_id,
                )
                center_x, center_y, center_z = fixture_image.camera_center_m
                cam_from_world = self._p.Rigid3d(
                    self._np.asarray(
                        [
                            [1.0, 0.0, 0.0, -center_x],
                            [0.0, 1.0, 0.0, -center_y],
                            [0.0, 0.0, 1.0, -center_z],
                        ],
                        dtype=self._np.float64,
                    )
                )
                reconstruction.add_image_with_trivial_frame(image, cam_from_world)
        if not bool(reconstruction.is_valid()):
            raise AdapterError("known-pose seed reconstruction is internally invalid")
        if int(reconstruction.num_reg_images()) != len(images):
            raise AdapterError("known-pose seed did not register every fixture image")
        if int(reconstruction.num_points3D()) != 0:
            raise AdapterError("known-pose seed unexpectedly contains 3D points")
        reconstruction.write(output_path)
        return self.inspect_model(output_path, log_path=log_path)

    def inspect_model(self, path: Path, *, log_path: Path) -> ModelEvidence:
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction(path)
            registered_ids = tuple(
                sorted(int(value) for value in reconstruction.reg_image_ids())
            )
            reconstruction_images = {
                image_id: reconstruction.image(image_id) for image_id in registered_ids
            }
            names = {
                image_id: str(image.name)
                for image_id, image in reconstruction_images.items()
            }
            camera_ids = {
                image_id: int(image.camera_id)
                for image_id, image in reconstruction_images.items()
            }
            centers = {
                image_id: tuple(float(value) for value in image.projection_center())
                for image_id, image in reconstruction_images.items()
            }
            camera_contract = {}
            for camera_id in sorted(set(camera_ids.values())):
                camera = reconstruction.camera(camera_id)
                camera_contract[camera_id] = {
                    "model": str(camera.model_name),
                    "width": int(camera.width),
                    "height": int(camera.height),
                    "params": [float(value) for value in camera.params],
                }
            return ModelEvidence(
                valid=bool(reconstruction.is_valid()),
                registered_image_ids=registered_ids,
                image_names_by_id=names,
                camera_ids_by_image_id=camera_ids,
                camera_contract_by_id=camera_contract,
                camera_centers_by_image_id=centers,
                num_points3d=int(reconstruction.num_points3D()),
            )

    def bundle_adjust_with_success_evidence(
        self,
        *,
        input_path: Path,
        output_path: Path,
        log_path: Path,
    ) -> Mapping[str, Any]:
        output_path.mkdir(exist_ok=False)
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction(input_path)
            options = self._p.BundleAdjustmentOptions()
            options.refine_focal_length = False
            options.refine_principal_point = False
            options.refine_extra_params = False
            options.print_summary = True
            config = self._p.BundleAdjustmentConfig()
            for image_id in sorted(
                int(value) for value in reconstruction.reg_image_ids()
            ):
                config.add_image(image_id)
            config.fix_gauge(self._p.BundleAdjustmentGauge.TWO_CAMS_FROM_WORLD)
            adjuster = self._p.create_default_bundle_adjuster(
                options,
                config,
                reconstruction,
            )
            summary = adjuster.solve()
            usable = bool(summary.is_solution_usable())
            num_residuals = int(summary.num_residuals)
            termination_type = str(summary.termination_type.name)
            if not usable or num_residuals <= 0:
                raise AdapterError(
                    "PyCOLMAP bundle adjustment did not produce a usable solution",
                    "REFINE_ENGINE_FIXTURE_FAILED",
                )
            reconstruction.update_point_3d_errors()
            reconstruction.write(output_path)
        return {
            "api": "pycolmap.create_default_bundle_adjuster",
            "usable": usable,
            "terminationType": termination_type,
            "numResiduals": num_residuals,
            "refineFocalLength": False,
            "refinePrincipalPoint": False,
            "refineExtraParams": False,
        }


def _assert_model_identity(
    model: ModelEvidence,
    expected_names_by_id: Mapping[int, str],
    expected_camera_ids_by_image_id: Mapping[int, int],
    *,
    stage: str,
    require_points: bool,
) -> None:
    expected_ids = tuple(sorted(expected_names_by_id))
    if not model.valid:
        raise AdapterError(f"{stage} model is internally invalid")
    if model.registered_image_ids != expected_ids:
        raise AdapterError(f"{stage} model changed the registered database image IDs")
    actual_names = {
        image_id: model.image_names_by_id[image_id] for image_id in expected_ids
    }
    if actual_names != dict(expected_names_by_id):
        raise AdapterError(f"{stage} model changed the image-ID/name join")
    actual_camera_ids = {
        image_id: model.camera_ids_by_image_id[image_id] for image_id in expected_ids
    }
    if actual_camera_ids != dict(expected_camera_ids_by_image_id):
        raise AdapterError(f"{stage} model changed the image-ID/camera-ID join")
    for image_id in expected_ids:
        center = model.camera_centers_by_image_id[image_id]
        if len(center) != 3 or not all(math.isfinite(value) for value in center):
            raise AdapterError(
                f"{stage} model has a non-finite or malformed camera center"
            )
    expected_params = [
        FIXTURE_INTRINSICS.fx,
        FIXTURE_INTRINSICS.fy,
        FIXTURE_INTRINSICS.cx,
        FIXTURE_INTRINSICS.cy,
    ]
    for camera_id in sorted(set(expected_camera_ids_by_image_id.values())):
        camera = model.camera_contract_by_id[camera_id]
        params = list(camera["params"])
        if (
            camera["model"] != "PINHOLE"
            or camera["width"] != FIXTURE_WIDTH
            or camera["height"] != FIXTURE_HEIGHT
            or len(params) != len(expected_params)
            or not all(math.isfinite(value) for value in params)
            or any(
                abs(left - right) > 1e-8 for left, right in zip(params, expected_params)
            )
        ):
            raise AdapterError(
                f"{stage} model changed the qualified PINHOLE intrinsics"
            )
    if require_points and model.num_points3d < MIN_TRIANGULATED_POINTS:
        raise AdapterError(
            f"{stage} model has only {model.num_points3d} triangulated points",
            "REFINE_ENGINE_FIXTURE_FAILED",
        )


def _assert_seed_centers(
    model: ModelEvidence,
    expected_centers_by_image_id: Mapping[int, tuple[float, float, float]],
) -> None:
    for image_id, expected_center in expected_centers_by_image_id.items():
        actual_center = model.camera_centers_by_image_id[image_id]
        if (
            len(actual_center) != 3
            or not all(math.isfinite(value) for value in actual_center)
            or any(
                abs(left - right) > 1e-9
                for left, right in zip(actual_center, expected_center)
            )
        ):
            raise AdapterError(
                "known-pose seed did not persist the exact input camera centres"
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
    seed_path = output_dir / "seed-model"
    triangulated_path = output_dir / "triangulated-model"
    cli_adjusted_path = output_dir / "cli-adjusted-probe"
    adjusted_path = output_dir / "adjusted-model"

    colmap = _resolve_executable(config.colmap_path, "COLMAP")
    nvcc = _resolve_executable(config.nvcc_path, "nvcc")
    nvidia_smi = _resolve_executable(config.nvidia_smi_path, "nvidia-smi")
    engine = (
        _backend_call("PyCOLMAP import", PycolmapBackend.load)
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
    pairs = explicit_pairs(images)
    pair_contract = write_explicit_pairs(pairs_path, pairs)
    sift_log = next_log_path("pycolmap-gpu-sift")
    sift_log.touch(exist_ok=False)
    gpu_sift_rows = _backend_call(
        "PyCOLMAP GPU SIFT",
        lambda: engine.extract_gpu_features(
            database_path=database_path,
            image_dir=image_dir,
            images=images,
            gpu_index=config.gpu_index,
            log_path=sift_log,
        ),
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-gpu-sift", sift_log))
    rewrite_log = next_log_path("pycolmap-intrinsics-rewrite")
    rewrite_log.touch(exist_ok=False)
    rewrite_rows = _backend_call(
        "PyCOLMAP intrinsics rewrite",
        lambda: engine.rewrite_intrinsics_preserving_ids(
            database_path=database_path,
            images=images,
            log_path=rewrite_log,
        ),
    )
    binding_rows.append(
        _bounded_log_evidence("pycolmap-intrinsics-rewrite", rewrite_log)
    )
    match_log = next_log_path("pycolmap-explicit-pairs")
    match_log.touch(exist_ok=False)
    match_rows = _backend_call(
        "PyCOLMAP explicit-pair matching",
        lambda: engine.match_explicit_pairs(
            database_path=database_path,
            pairs_path=pairs_path,
            image_pairs=pairs,
            gpu_index=config.gpu_index,
            log_path=match_log,
        ),
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-explicit-pairs", match_log))
    seed_log = next_log_path("pycolmap-known-pose-seed")
    seed_log.touch(exist_ok=False)
    seed_model = _backend_call(
        "PyCOLMAP known-pose seed",
        lambda: engine.build_known_pose_seed(
            database_path=database_path,
            images=images,
            output_path=seed_path,
            log_path=seed_log,
        ),
    )
    binding_rows.append(_bounded_log_evidence("pycolmap-known-pose-seed", seed_log))
    expected_names_by_id = {
        int(row["imageIdAfter"]): str(row["name"]) for row in rewrite_rows
    }
    expected_camera_ids_by_image_id = {
        int(row["imageIdAfter"]): int(row["cameraIdAfter"]) for row in rewrite_rows
    }
    expected_centers_by_name = {image.name: image.camera_center_m for image in images}
    expected_centers_by_image_id = {
        int(row["imageIdAfter"]): expected_centers_by_name[str(row["name"])]
        for row in rewrite_rows
    }
    _assert_model_identity(
        seed_model,
        expected_names_by_id,
        expected_camera_ids_by_image_id,
        stage="known-pose seed",
        require_points=False,
    )
    _assert_seed_centers(seed_model, expected_centers_by_image_id)
    if seed_model.num_points3d != 0:
        raise AdapterError("known-pose seed model must not contain points")

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
    bundle_adjustment_evidence = _backend_call(
        "PyCOLMAP bundle adjustment",
        lambda: engine.bundle_adjust_with_success_evidence(
            input_path=triangulated_path,
            output_path=adjusted_path,
            log_path=bundle_adjust_log,
        ),
    )
    if (
        bundle_adjustment_evidence.get("usable") is not True
        or int(bundle_adjustment_evidence.get("numResiduals", 0)) <= 0
        or bundle_adjustment_evidence.get("terminationType")
        in {"FAILURE", "USER_FAILURE", None}
    ):
        raise AdapterError(
            "bundle adjustment lacks affirmative usable-solver evidence",
            "REFINE_ENGINE_FIXTURE_FAILED",
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

    pycolmap_evidence = dict(
        _backend_call("PyCOLMAP toolchain evidence", engine.toolchain_evidence)
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
                f"qualification failed ({type(exc).__name__}): {exc}",
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
