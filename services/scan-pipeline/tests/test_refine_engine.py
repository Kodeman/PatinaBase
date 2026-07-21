"""Shared COLMAP 4.0.2 engine seam, independent of qualification fixtures."""

from __future__ import annotations

import math
from pathlib import Path
from types import SimpleNamespace

import pytest

from patina_scan_worker.refine_adapter import ColmapPose, PinholeIntrinsics
from patina_scan_worker.refine_engine import (
    EngineImage,
    PycolmapBackend,
    PycolmapBackendConfig,
)


class _FakeCamera:
    def __init__(self) -> None:
        self.camera_id = -1
        self.model = "SIMPLE_RADIAL"
        self.width = 640
        self.height = 480
        self.params = [500.0, 320.0, 240.0, 0.0]
        self.has_prior_focal_length = False

    @property
    def model_name(self) -> str:
        return str(self.model)


class _FakeImage:
    def __init__(self, name="", camera_id=-1, image_id=-1, **_kwargs) -> None:
        self.name = name
        self.camera_id = camera_id
        self.image_id = image_id
        self.cam_from_world_value = None

    def projection_center(self):
        matrix = self.cam_from_world_value.matrix()
        rotation = [row[:3] for row in matrix]
        translation = [row[3] for row in matrix]
        return [
            -sum(rotation[row][column] * translation[row] for row in range(3))
            for column in range(3)
        ]

    def cam_from_world(self):
        return self.cam_from_world_value


class _FakeDatabase:
    def __init__(self, images) -> None:
        self.images = {image.name: image for image in images}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read_image_with_name(self, name):
        return self.images.get(name)


class _FakeReconstruction:
    registry = {}

    def __init__(self, path=None) -> None:
        if path is None:
            self.cameras = {}
            self.images = {}
        else:
            other = self.registry[str(path)]
            self.cameras = dict(other.cameras)
            self.images = dict(other.images)

    def add_camera_with_trivial_rig(self, camera) -> None:
        self.cameras[camera.camera_id] = camera

    def add_image_with_trivial_frame(self, image, cam_from_world) -> None:
        image.cam_from_world_value = cam_from_world
        self.images[image.image_id] = image

    def is_valid(self):
        return bool(self.images) and len(self.images) == len(self.cameras)

    def num_reg_images(self):
        return len(self.images)

    def num_points3D(self):
        return 0

    def reg_image_ids(self):
        return list(self.images)

    def image(self, image_id):
        return self.images[image_id]

    def camera(self, camera_id):
        return self.cameras[camera_id]

    def write(self, path) -> None:
        Path(path, "cameras.bin").write_bytes(b"cameras")
        Path(path, "images.bin").write_bytes(b"images")
        Path(path, "points3D.bin").write_bytes(b"points")
        self.registry[str(path)] = self


def _pycolmap_module(database):
    module = SimpleNamespace()
    module.Camera = _FakeCamera
    module.CameraModelId = SimpleNamespace(PINHOLE="PINHOLE")
    module.Database = SimpleNamespace(open=lambda _path: database)
    module.Image = _FakeImage
    module.Reconstruction = _FakeReconstruction
    module.Rigid3d = lambda matrix: SimpleNamespace(matrix=lambda: matrix)
    return module


def test_known_pose_seed_preserves_arbitrary_cam_from_world_and_database_ids(tmp_path):
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
    pose = ColmapPose(
        rotation=rotation,
        translation=translation,
        qvec=(math.cos(angle / 2.0), 0.0, math.sin(angle / 2.0), 0.0),
    )
    frame = EngineImage(
        name="frame_0001.png",
        intrinsics=PinholeIntrinsics(800.0, 805.0, 321.5, 242.5, 640, 480),
        cam_from_world=pose,
    )
    database_image = _FakeImage(frame.name, camera_id=101, image_id=11)
    database = _FakeDatabase([database_image])
    module = _pycolmap_module(database)
    numpy = SimpleNamespace(asarray=lambda value, dtype: value, float64="float64")
    engine = PycolmapBackend(
        module,
        numpy,
        config=PycolmapBackendConfig(
            random_seed=17,
            maximum_features_per_image=3072,
            geometric_verification_minimum_inliers=23,
        ),
    )

    evidence = engine.build_known_pose_seed(
        database_path=tmp_path / "database.db",
        images=(frame,),
        output_path=tmp_path / "seed",
        log_path=tmp_path / "seed.log",
    )

    persisted = _FakeReconstruction.registry[str(tmp_path / "seed")].images[11]
    expected_matrix = [
        [*rotation[0], translation[0]],
        [*rotation[1], translation[1]],
        [*rotation[2], translation[2]],
    ]
    for actual_row, expected_row in zip(
        persisted.cam_from_world_value.matrix(), expected_matrix
    ):
        assert actual_row == pytest.approx(expected_row)
    assert evidence.registered_image_ids == (11,)
    assert evidence.camera_ids_by_image_id == {11: 101}
    assert evidence.camera_centers_by_image_id[11] == pytest.approx(center)
    for actual_row, expected_row in zip(
        evidence.cam_from_world_by_image_id[11], expected_matrix
    ):
        assert actual_row == pytest.approx(expected_row)


@pytest.mark.parametrize(
    "pose",
    (
        ColmapPose(
            rotation=(
                (1.0, 0.0, 0.0),
                (0.0, float("nan"), 0.0),
                (0.0, 0.0, 1.0),
            ),
            translation=(0.0, 0.0, 0.0),
            qvec=(1.0, 0.0, 0.0, 0.0),
        ),
        ColmapPose(
            rotation=((1.0, 0.0), (0.0, 1.0), (0.0, 0.0)),  # type: ignore[arg-type]
            translation=(0.0, 0.0, float("inf")),
            qvec=(1.0, 0.0, 0.0, 0.0),
        ),
    ),
)
def test_engine_image_rejects_nonfinite_or_malformed_pose(pose):
    with pytest.raises(ValueError, match="finite 3x3 rotation and 3-vector"):
        EngineImage(
            name="frame.png",
            intrinsics=PinholeIntrinsics(800.0, 805.0, 321.5, 242.5, 640, 480),
            cam_from_world=pose,
        )


def test_engine_module_has_no_queue_business_db_storage_or_settings_imports():
    import patina_scan_worker.refine_engine as engine_module

    source = Path(engine_module.__file__).read_text(encoding="utf-8")
    assert "from .queue" not in source
    assert "from .db" not in source
    assert "from .storage" not in source
    assert "from .config" not in source
    assert "SUPABASE_" not in source
