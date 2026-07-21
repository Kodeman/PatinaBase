"""Shared exact PyCOLMAP 4.0.2 database/model seam for P2 Refine.

The Item 4A qualification harness and the future Refine handler must execute
the same binding implementation.  This module owns that implementation while
remaining independent of worker settings, queue, business database, and
Storage clients.  Qualification policy is supplied through
``PycolmapBackendConfig``; a later handler may use its own reviewed thresholds
without duplicating the version-sensitive PyCOLMAP calls.
"""

from __future__ import annotations

import contextlib
import importlib
import io
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from .refine_adapter import (
    COLMAP_LOG_TAIL_BYTES,
    AdapterError,
    ColmapPose,
    PinholeIntrinsics,
)

REFINE_ENGINE_ERROR_CODE = "REFINE_ENGINE_FAILED"


def _engine_error(message: str) -> AdapterError:
    return AdapterError(message, REFINE_ENGINE_ERROR_CODE)


@dataclass(frozen=True)
class EngineImage:
    """One materialized image and its exact known-pose engine inputs."""

    name: str
    intrinsics: PinholeIntrinsics
    cam_from_world: ColmapPose

    def __post_init__(self) -> None:
        rotation = self.cam_from_world.rotation
        translation = self.cam_from_world.translation
        valid_rotation = (
            isinstance(rotation, Sequence)
            and not isinstance(rotation, (str, bytes))
            and len(rotation) == 3
            and all(
                isinstance(row, Sequence)
                and not isinstance(row, (str, bytes))
                and len(row) == 3
                and all(
                    not isinstance(value, bool)
                    and isinstance(value, (int, float))
                    and math.isfinite(float(value))
                    for value in row
                )
                for row in rotation
            )
        )
        valid_translation = (
            isinstance(translation, Sequence)
            and not isinstance(translation, (str, bytes))
            and len(translation) == 3
            and all(
                not isinstance(value, bool)
                and isinstance(value, (int, float))
                and math.isfinite(float(value))
                for value in translation
            )
        )
        if not valid_rotation or not valid_translation:
            raise _engine_error(
                "engine image pose must have a finite 3x3 rotation and 3-vector translation"
            )


@dataclass(frozen=True)
class ModelEvidence:
    valid: bool
    registered_image_ids: tuple[int, ...]
    image_names_by_id: Mapping[int, str]
    camera_ids_by_image_id: Mapping[int, int]
    camera_contract_by_id: Mapping[int, Mapping[str, Any]]
    camera_centers_by_image_id: Mapping[int, tuple[float, float, float]]
    num_points3d: int
    cam_from_world_by_image_id: Mapping[
        int, tuple[tuple[float, float, float, float], ...]
    ]


@dataclass(frozen=True)
class PycolmapBackendConfig:
    random_seed: int
    maximum_features_per_image: int
    geometric_verification_minimum_inliers: int

    def __post_init__(self) -> None:
        integer_values = (
            self.random_seed,
            self.maximum_features_per_image,
            self.geometric_verification_minimum_inliers,
        )
        if any(
            isinstance(value, bool) or not isinstance(value, int)
            for value in integer_values
        ):
            raise _engine_error("PyCOLMAP engine configuration must use integers")
        if self.random_seed < 0:
            raise _engine_error("PyCOLMAP random seed must be non-negative")
        if any(value <= 0 for value in integer_values[1:]):
            raise _engine_error("PyCOLMAP engine options must be positive")


class RefineEngineBackend(Protocol):
    """Internal engine seam shared by real and fake qualification adapters."""

    @property
    def version(self) -> str: ...

    def toolchain_evidence(self) -> Mapping[str, Any]: ...

    def extract_gpu_features(
        self,
        *,
        database_path: Path,
        image_dir: Path,
        images: Sequence[EngineImage],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def rewrite_intrinsics_preserving_ids(
        self,
        *,
        database_path: Path,
        images: Sequence[EngineImage],
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
        images: Sequence[EngineImage],
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
            raise ValueError("write to closed PyCOLMAP log")
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


class PycolmapBackend:
    """Exact PyCOLMAP 4.0.2 database/model adapter used by Refine."""

    def __init__(
        self,
        pycolmap_module: Any,
        numpy_module: Any,
        *,
        config: PycolmapBackendConfig,
    ) -> None:
        self._p = pycolmap_module
        self._np = numpy_module
        self._config = config

    @classmethod
    def load(cls, *, config: PycolmapBackendConfig) -> "PycolmapBackend":
        try:
            pycolmap_module = importlib.import_module("pycolmap")
            numpy_module = importlib.import_module("numpy")
        except (ImportError, OSError) as exc:
            raise AdapterError(
                f"cannot import the COLMAP bindings: {exc}",
                "REFINE_ENGINE_IMPORT",
            ) from exc
        return cls(pycolmap_module, numpy_module, config=config)

    @property
    def version(self) -> str:
        return str(self._p.__version__)

    def toolchain_evidence(self) -> Mapping[str, Any]:
        has_cuda = self._p.has_cuda
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
            raise _engine_error(f"PyCOLMAP database is missing engine image {name}")
        return image

    def extract_gpu_features(
        self,
        *,
        database_path: Path,
        image_dir: Path,
        images: Sequence[EngineImage],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]:
        if not images:
            raise _engine_error("PyCOLMAP feature extraction needs at least one image")
        rows: list[dict[str, Any]] = []
        camera_ids: set[int] = set()
        with _bounded_binding_output(self._p, log_path):
            if type(self._p.has_cuda) is not bool or not self._p.has_cuda:  # noqa: E721
                raise _engine_error("PyCOLMAP CUDA feature extraction is unavailable")
            extraction_options = self._p.FeatureExtractionOptions()
            extraction_options.use_gpu = True
            extraction_options.gpu_index = gpu_index
            extraction_options.max_image_size = max(
                max(image.intrinsics.image_width, image.intrinsics.image_height)
                for image in images
            )
            sift_options = extraction_options.sift
            sift_options.max_num_features = self._config.maximum_features_per_image
            extraction_options.sift = sift_options
            reader_options = self._p.ImageReaderOptions()
            reader_options.camera_model = "SIMPLE_RADIAL"
            self._p.set_random_seed(self._config.random_seed)
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
                for engine_image in images:
                    image = self._image(database, engine_image.name)
                    image_id = int(image.image_id)
                    camera_id = int(image.camera_id)
                    keypoints = int(database.num_keypoints_for_image(image_id))
                    descriptors = int(database.num_descriptors_for_image(image_id))
                    if image_id <= 0 or camera_id <= 0:
                        raise _engine_error(
                            "PyCOLMAP created a non-positive database identifier"
                        )
                    camera_ids.add(camera_id)
                    rows.append(
                        {
                            "name": engine_image.name,
                            "imageId": image_id,
                            "cameraId": camera_id,
                            "keypoints": keypoints,
                            "descriptors": descriptors,
                        }
                    )
        if len(camera_ids) != len(images):
            raise _engine_error(
                "CameraMode.PER_IMAGE did not create one camera per engine image"
            )
        return rows

    def rewrite_intrinsics_preserving_ids(
        self,
        *,
        database_path: Path,
        images: Sequence[EngineImage],
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]:
        rows: list[dict[str, Any]] = []
        with (
            _bounded_binding_output(self._p, log_path),
            self._database(database_path) as database,
        ):
            for engine_image in images:
                image_before = self._image(database, engine_image.name)
                image_id_before = int(image_before.image_id)
                camera_id_before = int(image_before.camera_id)
                camera = database.read_camera(camera_id_before)
                model_before = str(camera.model_name)
                camera.model = self._p.CameraModelId.PINHOLE
                camera.width = engine_image.intrinsics.image_width
                camera.height = engine_image.intrinsics.image_height
                camera.params = [
                    engine_image.intrinsics.fx,
                    engine_image.intrinsics.fy,
                    engine_image.intrinsics.cx,
                    engine_image.intrinsics.cy,
                ]
                camera.has_prior_focal_length = True
                database.update_camera(camera)

                image_after = self._image(database, engine_image.name)
                camera_after = database.read_camera(int(image_after.camera_id))
                params_after = [float(value) for value in camera_after.params]
                expected_params = [
                    engine_image.intrinsics.fx,
                    engine_image.intrinsics.fy,
                    engine_image.intrinsics.cx,
                    engine_image.intrinsics.cy,
                ]
                ids_preserved = (
                    int(image_after.image_id) == image_id_before
                    and int(image_after.camera_id) == camera_id_before
                    and int(camera_after.camera_id) == camera_id_before
                )
                if not ids_preserved:
                    raise _engine_error(
                        "camera rewrite changed a database image or camera ID"
                    )
                if (
                    str(camera_after.model_name) != "PINHOLE"
                    or int(camera_after.width) != engine_image.intrinsics.image_width
                    or int(camera_after.height) != engine_image.intrinsics.image_height
                    or not bool(camera_after.has_prior_focal_length)
                    or len(params_after) != len(expected_params)
                    or any(
                        abs(left - right) > 1e-9
                        for left, right in zip(params_after, expected_params)
                    )
                ):
                    raise _engine_error(
                        "camera rewrite did not persist exact PINHOLE intrinsics"
                    )
                rows.append(
                    {
                        "name": engine_image.name,
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
        rows: list[dict[str, Any]] = []
        with _bounded_binding_output(self._p, log_path):
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
            verification_options.min_num_inliers = (
                self._config.geometric_verification_minimum_inliers
            )
            ransac_options = verification_options.ransac
            ransac_options.random_seed = self._config.random_seed
            verification_options.ransac = ransac_options
            self._p.set_random_seed(self._config.random_seed)
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

    def _new_camera(self, engine_image: EngineImage, camera_id: int) -> Any:
        camera = self._p.Camera()
        camera.camera_id = camera_id
        camera.model = self._p.CameraModelId.PINHOLE
        camera.width = engine_image.intrinsics.image_width
        camera.height = engine_image.intrinsics.image_height
        camera.params = [
            engine_image.intrinsics.fx,
            engine_image.intrinsics.fy,
            engine_image.intrinsics.cx,
            engine_image.intrinsics.cy,
        ]
        camera.has_prior_focal_length = True
        return camera

    def build_known_pose_seed(
        self,
        *,
        database_path: Path,
        images: Sequence[EngineImage],
        output_path: Path,
        log_path: Path,
    ) -> ModelEvidence:
        output_path.mkdir(parents=True, exist_ok=False)
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction()
            with self._database(database_path) as database:
                for engine_image in images:
                    database_image = self._image(database, engine_image.name)
                    image_id = int(database_image.image_id)
                    camera_id = int(database_image.camera_id)
                    camera = self._new_camera(engine_image, camera_id)
                    reconstruction.add_camera_with_trivial_rig(camera)
                    image = self._p.Image(
                        name=engine_image.name,
                        camera_id=camera_id,
                        image_id=image_id,
                    )
                    pose = engine_image.cam_from_world
                    cam_from_world = self._p.Rigid3d(
                        self._np.asarray(
                            [
                                [*pose.rotation[0], pose.translation[0]],
                                [*pose.rotation[1], pose.translation[1]],
                                [*pose.rotation[2], pose.translation[2]],
                            ],
                            dtype=self._np.float64,
                        )
                    )
                    reconstruction.add_image_with_trivial_frame(image, cam_from_world)
            if not bool(reconstruction.is_valid()):
                raise _engine_error(
                    "known-pose seed reconstruction is internally invalid"
                )
            if int(reconstruction.num_reg_images()) != len(images):
                raise _engine_error(
                    "known-pose seed did not register every engine image"
                )
            if int(reconstruction.num_points3D()) != 0:
                raise _engine_error("known-pose seed unexpectedly contains 3D points")
            reconstruction.write(output_path)
            return self._model_evidence(reconstruction)

    def inspect_model(self, path: Path, *, log_path: Path) -> ModelEvidence:
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction(path)
            return self._model_evidence(reconstruction)

    def _model_evidence(self, reconstruction: Any) -> ModelEvidence:
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
        poses = {}
        for image_id, image in reconstruction_images.items():
            matrix = image.cam_from_world().matrix()
            poses[image_id] = tuple(
                tuple(float(value) for value in row) for row in matrix
            )
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
            cam_from_world_by_image_id=poses,
        )

    def bundle_adjust_with_success_evidence(
        self,
        *,
        input_path: Path,
        output_path: Path,
        log_path: Path,
    ) -> Mapping[str, Any]:
        if output_path.exists():
            raise _engine_error("bundle-adjusted output path already exists")
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
            model_written = False
            if usable and num_residuals > 0:
                output_path.mkdir(exist_ok=False)
                reconstruction.update_point_3d_errors()
                reconstruction.write(output_path)
                model_written = True
        return {
            "api": "pycolmap.create_default_bundle_adjuster",
            "usable": usable,
            "terminationType": termination_type,
            "numResiduals": num_residuals,
            "modelWritten": model_written,
            "refineFocalLength": False,
            "refinePrincipalPoint": False,
            "refineExtraParams": False,
        }
