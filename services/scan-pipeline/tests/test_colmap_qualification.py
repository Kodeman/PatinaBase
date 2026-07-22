"""Fake-only coverage for the non-mutating Item 4A qualification harness."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import patina_scan_worker.colmap_qualification as qualification
import patina_scan_worker.refine_engine as refine_engine
from patina_scan_worker.colmap_qualification import (
    FIXTURE_CAMERA_CENTERS_X_M,
    MIN_TRIANGULATED_POINTS,
    ModelEvidence,
    PycolmapBackend,
    PycolmapBackendConfig,
    QualificationConfig,
    fixture_engine_images,
    fixture_images,
    materialize_fixture,
    run_colmap_qualification,
)
from patina_scan_worker.refine_adapter import (
    COLMAP_LOG_TAIL_BYTES,
    AdapterError,
    ColmapCommandResult,
)


def _fake_executables(tmp_path: Path) -> dict[str, Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    paths = {}
    for name in ("colmap", "nvcc", "nvidia-smi"):
        path = bin_dir / name
        path.write_bytes(f"fake-{name}-binary\n".encode())
        path.chmod(0o755)
        paths[name] = path
    return paths


class _FakeQualificationBackend:
    version = "4.0.2"

    def __init__(self) -> None:
        self.calls = []
        self._names_by_id = {
            11 + index: image.name for index, image in enumerate(fixture_images())
        }
        self._camera_ids_by_image_id = {
            11 + index: 101 + index for index, _image in enumerate(fixture_images())
        }
        self._camera_contract_by_id = {
            101 + index: {
                "model": "PINHOLE",
                "width": image.intrinsics.image_width,
                "height": image.intrinsics.image_height,
                "params": [
                    image.intrinsics.fx,
                    image.intrinsics.fy,
                    image.intrinsics.cx,
                    image.intrinsics.cy,
                ],
            }
            for index, image in enumerate(fixture_images())
        }
        self._camera_centers_by_image_id = {
            11 + index: image.camera_center_m
            for index, image in enumerate(fixture_images())
        }
        self._cam_from_world_by_image_id = {
            11 + index: (
                (1.0, 0.0, 0.0, -image.camera_center_m[0]),
                (0.0, 1.0, 0.0, -image.camera_center_m[1]),
                (0.0, 0.0, 1.0, -image.camera_center_m[2]),
            )
            for index, image in enumerate(fixture_images())
        }
        self._written_models = {}

    def toolchain_evidence(self):
        return {
            "version": "4.0.2",
            "colmapVersion": "COLMAP 4.0.2",
            "colmapBuild": "Commit d927f7e on 2026-03-18 with CUDA",
            "hasCuda": True,
        }

    def extract_gpu_features(
        self, *, database_path, image_dir, images, gpu_index, log_path
    ):
        del log_path
        self.calls.append(("extract", gpu_index))
        database_path.write_bytes(b"deterministic-local-sqlite\n")
        return [
            {
                "name": image.name,
                "imageId": 11 + index,
                "cameraId": 101 + index,
                "keypoints": 200 + index,
                "descriptors": 200 + index,
            }
            for index, image in enumerate(images)
        ]

    def rewrite_intrinsics_preserving_ids(self, *, database_path, images, log_path):
        del log_path
        self.calls.append(("rewrite", database_path.name))
        return [
            {
                "name": image.name,
                "imageIdBefore": 11 + index,
                "imageIdAfter": 11 + index,
                "cameraIdBefore": 101 + index,
                "cameraIdAfter": 101 + index,
                "modelBefore": "SIMPLE_RADIAL",
                "modelAfter": "PINHOLE",
                "widthAfter": image.intrinsics.image_width,
                "heightAfter": image.intrinsics.image_height,
                "paramsAfter": [
                    image.intrinsics.fx,
                    image.intrinsics.fy,
                    image.intrinsics.cx,
                    image.intrinsics.cy,
                ],
                "hasPriorFocalLengthAfter": True,
                "idsPreserved": True,
            }
            for index, image in enumerate(images)
        ]

    def match_explicit_pairs(
        self, *, database_path, pairs_path, image_pairs, gpu_index, log_path
    ):
        del log_path
        self.calls.append(("match", tuple(image_pairs), gpu_index))
        by_name = {name: image_id for image_id, name in self._names_by_id.items()}
        return [
            {
                "first": first,
                "second": second,
                "firstImageId": by_name[first],
                "secondImageId": by_name[second],
                "guidedMatching": True,
                "rawMatches": 90,
                "verifiedInliers": 70,
            }
            for first, second in image_pairs
        ]

    def build_known_pose_seed(self, *, database_path, images, output_path, log_path):
        del log_path
        self.calls.append(("seed", tuple(image.name for image in images)))
        output_path.mkdir()
        (output_path / "cameras.bin").write_bytes(b"seed-cameras\n")
        (output_path / "images.bin").write_bytes(b"seed-images\n")
        (output_path / "points3D.bin").write_bytes(b"seed-no-points\n")
        ids = tuple(
            image_id
            for image_id, name in self._names_by_id.items()
            if name in {image.name for image in images}
        )
        by_name = {image.name: image for image in images}
        poses = {
            image_id: tuple(
                tuple((*pose.rotation[row], pose.translation[row])) for row in range(3)
            )
            for image_id, name in self._names_by_id.items()
            if (pose := by_name.get(name).cam_from_world if name in by_name else None)
            is not None
        }
        centers = {
            image_id: tuple(
                -sum(pose[row][column] * pose[row][3] for row in range(3))
                for column in range(3)
            )
            for image_id, pose in poses.items()
        }
        evidence = ModelEvidence(
            valid=True,
            registered_image_ids=ids,
            image_names_by_id={
                image_id: self._names_by_id[image_id] for image_id in ids
            },
            camera_ids_by_image_id={
                image_id: self._camera_ids_by_image_id[image_id] for image_id in ids
            },
            camera_contract_by_id={
                self._camera_ids_by_image_id[image_id]: self._camera_contract_by_id[
                    self._camera_ids_by_image_id[image_id]
                ]
                for image_id in ids
            },
            camera_centers_by_image_id=centers,
            num_points3d=0,
            cam_from_world_by_image_id=poses,
        )
        self._written_models[str(output_path)] = evidence
        return evidence

    def inspect_model(self, path, *, log_path):
        del log_path
        self.calls.append(("inspect", path.name))
        if str(path) in self._written_models:
            return self._written_models[str(path)]
        return ModelEvidence(
            valid=True,
            registered_image_ids=tuple(self._names_by_id),
            image_names_by_id=self._names_by_id,
            camera_ids_by_image_id=self._camera_ids_by_image_id,
            camera_contract_by_id=self._camera_contract_by_id,
            camera_centers_by_image_id=self._camera_centers_by_image_id,
            num_points3d=MIN_TRIANGULATED_POINTS + 7,
            cam_from_world_by_image_id=self._cam_from_world_by_image_id,
        )

    def bundle_adjust_with_success_evidence(self, *, input_path, output_path, log_path):
        del log_path
        self.calls.append(("bundle-adjust", input_path.name))
        output_path.mkdir()
        (output_path / "cameras.bin").write_bytes(b"binding-ba-cameras\n")
        (output_path / "images.bin").write_bytes(b"binding-ba-images\n")
        (output_path / "points3D.bin").write_bytes(b"binding-ba-points\n")
        return {
            "api": "pycolmap.create_default_bundle_adjuster",
            "usable": True,
            "terminationType": "CONVERGENCE",
            "numResiduals": 123,
            "modelWritten": True,
            "refineFocalLength": False,
            "refinePrincipalPoint": False,
            "refineExtraParams": False,
        }


def _fake_command_runner(command, *, deadline, log_path, cwd=None):
    del deadline, cwd
    command = list(command)
    program = Path(command[0]).name
    if program == "nvcc":
        output = "Cuda compilation tools, release 11.8, V11.8.89\n"
    elif program == "nvidia-smi":
        output = "NVIDIA GeForce RTX 2080 Ti, 580.159.03, 7.5\n"
    elif command[1] == "-h":
        output = "COLMAP 4.0.2 -- Structure-from-Motion and Multi-View Stereo\n"
    else:
        output = f"{command[1]} fixture OK\n"
        output_path = Path(command[command.index("--output_path") + 1])
        (output_path / "cameras.bin").write_bytes(f"{command[1]}-cameras\n".encode())
        (output_path / "images.bin").write_bytes(f"{command[1]}-images\n".encode())
        (output_path / "points3D.bin").write_bytes(f"{command[1]}-points\n".encode())
    log_path.write_text(output, encoding="utf-8")
    return ColmapCommandResult(0, log_path, output)


def _config(output_dir: Path, executables: dict[str, Path]) -> QualificationConfig:
    return QualificationConfig(
        output_dir=output_dir,
        colmap_path=str(executables["colmap"]),
        nvcc_path=str(executables["nvcc"]),
        nvidia_smi_path=str(executables["nvidia-smi"]),
        gpu_index="0",
    )


def test_fixture_pngs_and_manifest_are_byte_deterministic(tmp_path):
    _, first = materialize_fixture(tmp_path / "first")
    _, second = materialize_fixture(tmp_path / "second")

    assert first == second
    assert len(first["images"]) == len(FIXTURE_CAMERA_CENTERS_X_M) == 5
    for row in first["images"]:
        first_payload = (tmp_path / "first" / row["name"]).read_bytes()
        second_payload = (tmp_path / "second" / row["name"]).read_bytes()
        assert first_payload == second_payload
        assert first_payload.startswith(b"\x89PNG\r\n\x1a\n")


def test_full_fake_qualification_receipt_is_canonical_and_non_mutating(tmp_path):
    executables = _fake_executables(tmp_path)
    first_backend = _FakeQualificationBackend()
    second_backend = _FakeQualificationBackend()

    first_path = run_colmap_qualification(
        _config(tmp_path / "run-one", executables),
        backend=first_backend,
        command_runner=_fake_command_runner,
    )
    second_path = run_colmap_qualification(
        _config(tmp_path / "run-two", executables),
        backend=second_backend,
        command_runner=_fake_command_runner,
    )

    assert first_path.read_bytes() == second_path.read_bytes()
    receipt = json.loads(first_path.read_text())
    assert receipt["status"] == "passed"
    assert receipt["versionGate"] == {
        "target": "4.0.2",
        "cli": "4.0.2",
        "binding": "4.0.2",
        "mismatchNegativeControl": {
            "status": "passed",
            "rejectedBindingVersion": "0.0.0",
            "code": "REFINE_ENGINE_VERSION_MISMATCH",
        },
    }
    assert receipt["nonMutatingContract"] == {
        "queue": "not-imported-not-called",
        "businessDatabase": "not-imported-not-called",
        "storage": "not-imported-not-called",
        "databaseScope": "local-scratch-sqlite-only",
    }
    assert (
        receipt["toolchain"]["engineSourceSha256"]
        == hashlib.sha256(Path(refine_engine.__file__).read_bytes()).hexdigest()
    )
    assert all(row["idsPreserved"] for row in receipt["intrinsicsRewrite"])
    assert len(receipt["explicitPairMatching"]["pairs"]) == 5
    assert receipt["knownPoseSeed"]["numPoints3D"] == 0
    assert receipt["knownPoseSeed"]["images"][0] == {
        "imageId": 11,
        "name": "fixture_00.png",
        "cameraId": 101,
        "cameraCenterMeters": [-0.3, 0.0, 0.0],
        "camFromWorld": [
            [1.0, 0.0, 0.0, 0.3],
            [0.0, 1.0, 0.0, -0.0],
            [0.0, 0.0, 1.0, -0.0],
        ],
    }
    pose_control = receipt["nonIdentityPoseRoundTrip"]
    assert pose_control["expectedCamFromWorld"] == pose_control["actualCamFromWorld"]
    assert pose_control["actualCamFromWorld"] != [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
    ]
    assert all(
        camera["model"] == "PINHOLE"
        and camera["width"] == 480
        and camera["height"] == 360
        and camera["params"] == [420.0, 420.0, 240.0, 180.0]
        for camera in receipt["knownPoseSeed"]["cameras"]
    )
    assert receipt["triangulatedModel"]["numPoints3D"] >= MIN_TRIANGULATED_POINTS
    assert receipt["bundleAdjustedModel"]["numPoints3D"] >= MIN_TRIANGULATED_POINTS
    assert receipt["bundleAdjustment"]["bindingSolver"] == {
        "api": "pycolmap.create_default_bundle_adjuster",
        "usable": True,
        "terminationType": "CONVERGENCE",
        "numResiduals": 123,
        "modelWritten": True,
        "refineFocalLength": False,
        "refinePrincipalPoint": False,
        "refineExtraParams": False,
    }
    assert (
        receipt["bundleAdjustment"]["cliCompatibilityProbe"][
            "solverSuccessNotInferredFromExitCode"
        ]
        is True
    )
    assert [row["label"] for row in receipt["boundedEngineLogs"]["commands"]] == [
        "colmap-help",
        "nvcc-version",
        "nvidia-smi",
        "point-triangulator",
        "bundle-adjuster-cli-compatibility",
    ]
    for group in receipt["boundedEngineLogs"].values():
        if not isinstance(group, list):
            continue
        assert all(len(row["logSha256"]) == 64 for row in group)
        assert all(
            row["logSizeBytes"] <= receipt["boundedEngineLogs"]["capBytes"]
            for row in group
        )
    assert first_backend.calls == second_backend.calls


def test_version_mismatch_stops_before_fixture_or_database_calls(tmp_path):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    backend.version = "4.0.1"

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "mismatch", executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_VERSION_MISMATCH"
    assert backend.calls == []
    assert not (tmp_path / "mismatch" / "images").exists()


def test_qualification_rejects_an_unbounded_command_log(tmp_path):
    executables = _fake_executables(tmp_path)

    def unbounded(command, *, deadline, log_path, cwd=None):
        del command, deadline, cwd
        payload = "x" * (COLMAP_LOG_TAIL_BYTES + 1)
        log_path.write_text(payload)
        return ColmapCommandResult(0, log_path, payload)

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "unbounded", executables),
            backend=_FakeQualificationBackend(),
            command_runner=unbounded,
        )

    assert exc.value.code == "REFINE_ENGINE_LOG_IO"


def test_native_backend_failure_uses_stable_adapter_error(tmp_path):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()

    def fail_gpu_sift(**_kwargs):
        raise RuntimeError("synthetic CUDA failure")

    backend.extract_gpu_features = fail_gpu_sift

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "native-failure", executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_FAILED"
    assert str(exc.value) == (
        "PyCOLMAP GPU SIFT failed (RuntimeError): synthetic CUDA failure"
    )


def test_native_backend_failure_text_is_bounded(tmp_path):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()

    def fail_gpu_sift(**_kwargs):
        raise RuntimeError("x" * 5000)

    backend.extract_gpu_features = fail_gpu_sift
    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "bounded-native-failure", executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_FAILED"
    assert "<truncated>" in str(exc.value)
    assert len(str(exc.value).encode()) < 640


@pytest.mark.parametrize("message", ("x" * 5000, "🚀" * 1000))
def test_adapter_error_text_is_utf8_byte_bounded_without_changing_its_code(message):
    def fail_with_adapter_error():
        raise AdapterError(message, "REFINE_ENGINE_IMPORT")

    with pytest.raises(AdapterError) as exc:
        qualification._backend_call("import", fail_with_adapter_error)

    assert exc.value.code == "REFINE_ENGINE_IMPORT"
    assert str(exc.value).endswith("...<truncated>")
    assert len(str(exc.value).encode()) <= qualification.NATIVE_EXCEPTION_TEXT_BYTES


@pytest.mark.parametrize("has_cuda", (False, 1, "cuda"))
def test_qualification_rejects_invalid_cuda_capability_before_fixture(
    tmp_path, has_cuda
):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    backend.toolchain_evidence = lambda: {
        **_FakeQualificationBackend().toolchain_evidence(),
        "hasCuda": has_cuda,
    }

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "cpu-only", executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_GPU_SIFT_UNAVAILABLE"
    assert backend.calls == []
    assert not (tmp_path / "cpu-only" / "images").exists()


@pytest.mark.parametrize(
    "mutation",
    ("missing", "duplicate", "keypoint-floor", "descriptor-mismatch"),
)
def test_qualification_rejects_untrusted_gpu_sift_evidence(tmp_path, mutation):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    original = backend.extract_gpu_features

    def malformed(**kwargs):
        rows = [dict(row) for row in original(**kwargs)]
        if mutation == "missing":
            return rows[:-1]
        if mutation == "duplicate":
            rows[-1] = dict(rows[0])
        elif mutation == "keypoint-floor":
            rows[0]["keypoints"] = 39
            rows[0]["descriptors"] = 39
        elif mutation == "descriptor-mismatch":
            rows[0]["descriptors"] -= 1
        return rows

    backend.extract_gpu_features = malformed
    output_dir = tmp_path / f"bad-sift-{mutation}"
    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(output_dir, executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_GPU_SIFT_FAILED"
    assert not (output_dir / qualification.RECEIPT_NAME).exists()


@pytest.mark.parametrize(
    "mutation",
    ("missing", "duplicate", "changed-id", "changed-intrinsics"),
)
def test_qualification_rejects_untrusted_intrinsics_rewrite_evidence(
    tmp_path, mutation
):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    original = backend.rewrite_intrinsics_preserving_ids

    def malformed(**kwargs):
        rows = [dict(row) for row in original(**kwargs)]
        if mutation == "missing":
            return rows[:-1]
        if mutation == "duplicate":
            rows[-1] = dict(rows[0])
        elif mutation == "changed-id":
            rows[0]["imageIdAfter"] += 100
        elif mutation == "changed-intrinsics":
            rows[0]["paramsAfter"] = list(rows[0]["paramsAfter"])
            rows[0]["paramsAfter"][0] += 1.0
        return rows

    backend.rewrite_intrinsics_preserving_ids = malformed
    output_dir = tmp_path / f"bad-rewrite-{mutation}"
    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(output_dir, executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_FIXTURE_FAILED"
    assert not (output_dir / qualification.RECEIPT_NAME).exists()


@pytest.mark.parametrize(
    "mutation",
    ("missing", "duplicate", "raw-floor", "inlier-floor", "guided-disabled"),
)
def test_qualification_rejects_untrusted_match_evidence(tmp_path, mutation):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    original = backend.match_explicit_pairs

    def malformed(**kwargs):
        rows = [dict(row) for row in original(**kwargs)]
        if mutation == "missing":
            return rows[:-1]
        if mutation == "duplicate":
            rows[-1] = dict(rows[0])
        elif mutation == "raw-floor":
            rows[0]["rawMatches"] = 14
        elif mutation == "inlier-floor":
            rows[0]["verifiedInliers"] = 14
        elif mutation == "guided-disabled":
            rows[0]["guidedMatching"] = False
        return rows

    backend.match_explicit_pairs = malformed
    output_dir = tmp_path / f"bad-matches-{mutation}"
    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(output_dir, executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_FIXTURE_FAILED"
    assert not (output_dir / qualification.RECEIPT_NAME).exists()


def test_qualification_accepts_guided_inliers_beyond_putative_matches(tmp_path):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()
    original = backend.match_explicit_pairs

    def guided_match_growth(**kwargs):
        rows = [dict(row) for row in original(**kwargs)]
        rows[0]["rawMatches"] = 30
        rows[0]["verifiedInliers"] = 35
        return rows

    backend.match_explicit_pairs = guided_match_growth
    receipt_path = run_colmap_qualification(
        _config(tmp_path / "guided-match-growth", executables),
        backend=backend,
        command_runner=_fake_command_runner,
    )

    receipt = json.loads(receipt_path.read_text())
    first_pair = receipt["explicitPairMatching"]["pairs"][0]
    assert first_pair["rawMatches"] == 30
    assert first_pair["verifiedInliers"] == 35


def test_qualification_rejects_cli_zero_without_usable_bundle_solution(tmp_path):
    executables = _fake_executables(tmp_path)
    backend = _FakeQualificationBackend()

    def failed_bundle_adjustment(**_kwargs):
        return {
            "usable": False,
            "terminationType": "FAILURE",
            "numResiduals": 123,
        }

    backend.bundle_adjust_with_success_evidence = failed_bundle_adjustment

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "ba-failure", executables),
            backend=backend,
            command_runner=_fake_command_runner,
        )

    assert exc.value.code == "REFINE_ENGINE_FIXTURE_FAILED"
    assert "affirmative usable-solver evidence" in str(exc.value)


def test_qualification_rejects_cli_probe_that_writes_no_model(tmp_path):
    executables = _fake_executables(tmp_path)

    def empty_bundle_probe(command, *, deadline, log_path, cwd=None):
        if list(command)[1] != "bundle_adjuster":
            return _fake_command_runner(
                command,
                deadline=deadline,
                log_path=log_path,
                cwd=cwd,
            )
        del deadline, cwd
        log_path.write_text("bundle_adjuster returned zero without a model\n")
        return ColmapCommandResult(0, log_path, log_path.read_text())

    with pytest.raises(AdapterError) as exc:
        run_colmap_qualification(
            _config(tmp_path / "empty-cli-model", executables),
            backend=_FakeQualificationBackend(),
            command_runner=empty_bundle_probe,
        )

    assert exc.value.code == "REFINE_ENGINE_FIXTURE_FAILED"
    assert "missing nonempty files" in str(exc.value)


def test_main_converts_unexpected_failures_to_exit_two_json(monkeypatch, capsys):
    def fail_qualification(_config):
        raise TypeError("synthetic API mismatch")

    monkeypatch.setattr(qualification, "run_colmap_qualification", fail_qualification)

    assert qualification.main(["--output-dir", "/unused"]) == 2
    failure = json.loads(capsys.readouterr().err)
    assert failure == {
        "status": "failed",
        "code": "REFINE_ENGINE_FAILED",
        "error": "qualification failed (TypeError): synthetic API mismatch",
    }


def test_binding_output_is_hard_capped_while_it_is_written(tmp_path):
    log_path = tmp_path / "binding.log"
    with qualification._bounded_binding_output(SimpleNamespace(), log_path):
        print("discarded-prefix" * 8192)
        print("BINDING-END")

    assert log_path.stat().st_size == COLMAP_LOG_TAIL_BYTES
    assert log_path.read_bytes().endswith(b"BINDING-END\n")


def test_model_evidence_rejects_nonfinite_intrinsics_and_malformed_centers():
    backend = _FakeQualificationBackend()
    expected_names = backend._names_by_id
    expected_camera_ids = backend._camera_ids_by_image_id
    bad_camera_contract = {
        camera_id: dict(contract)
        for camera_id, contract in backend._camera_contract_by_id.items()
    }
    bad_camera_contract[101] = {
        **bad_camera_contract[101],
        "params": [float("nan"), 420.0, 240.0, 180.0],
    }
    bad_intrinsics = ModelEvidence(
        valid=True,
        registered_image_ids=tuple(expected_names),
        image_names_by_id=expected_names,
        camera_ids_by_image_id=expected_camera_ids,
        camera_contract_by_id=bad_camera_contract,
        camera_centers_by_image_id=backend._camera_centers_by_image_id,
        num_points3d=0,
        cam_from_world_by_image_id=backend._cam_from_world_by_image_id,
    )

    with pytest.raises(AdapterError, match="changed the qualified PINHOLE"):
        qualification._assert_model_identity(
            bad_intrinsics,
            expected_names,
            expected_camera_ids,
            stage="test",
            require_points=False,
        )

    bad_centers = dict(backend._camera_centers_by_image_id)
    bad_centers[11] = (float("nan"), 0.0)
    malformed_pose = ModelEvidence(
        valid=True,
        registered_image_ids=tuple(expected_names),
        image_names_by_id=expected_names,
        camera_ids_by_image_id=expected_camera_ids,
        camera_contract_by_id=backend._camera_contract_by_id,
        camera_centers_by_image_id=bad_centers,
        num_points3d=0,
        cam_from_world_by_image_id=backend._cam_from_world_by_image_id,
    )

    with pytest.raises(AdapterError, match="non-finite or malformed camera center"):
        qualification._assert_model_identity(
            malformed_pose,
            expected_names,
            expected_camera_ids,
            stage="test",
            require_points=False,
        )

    with pytest.raises(AdapterError, match="exact input camera centres"):
        qualification._assert_seed_poses(
            malformed_pose,
            {
                image_id: image.cam_from_world
                for image_id, image in zip(
                    backend._names_by_id,
                    fixture_engine_images(fixture_images()),
                )
            },
        )


class _FakeCamera:
    def __init__(self):
        self.camera_id = -1
        self.model = "SIMPLE_RADIAL"
        self.model_name = "SIMPLE_RADIAL"
        self.width = 480
        self.height = 360
        self.params = [500.0, 240.0, 180.0, 0.0]
        self.has_prior_focal_length = False


class _FakeImage:
    def __init__(self, name="", camera_id=-1, image_id=-1, **_kwargs):
        self.name = name
        self.camera_id = camera_id
        self.image_id = image_id

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
    def __init__(self, images, *, raw_matches=40, verified_inliers=35):
        self.images = {image.name: image for image in images}
        self.cameras = {image.camera_id: _FakeCamera() for image in images}
        self.raw_matches = raw_matches
        self.verified_inliers = verified_inliers
        for camera_id, camera in self.cameras.items():
            camera.camera_id = camera_id

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read_image_with_name(self, name):
        return self.images.get(name)

    def read_camera(self, camera_id):
        return self.cameras[camera_id]

    def update_camera(self, camera):
        camera.model_name = (
            "PINHOLE" if camera.model == "PINHOLE" else str(camera.model)
        )
        self.cameras[camera.camera_id] = camera

    def num_keypoints_for_image(self, image_id):
        return 120 + image_id

    def num_descriptors_for_image(self, image_id):
        return 120 + image_id

    def read_matches(self, _first_id, _second_id):
        return list(range(self.raw_matches))

    def exists_two_view_geometry(self, _first_id, _second_id):
        return True

    def read_two_view_geometry(self, _first_id, _second_id):
        return SimpleNamespace(inlier_matches=list(range(self.verified_inliers)))


class _FakeFeatureOptions:
    def __init__(self):
        self.use_gpu = False
        self.gpu_index = "-1"
        self.max_image_size = -1
        self.sift = SimpleNamespace(max_num_features=-1)


class _FakeReaderOptions:
    camera_model = "SIMPLE_RADIAL"


class _FakeMatchingOptions:
    def __init__(self):
        self.use_gpu = False
        self.gpu_index = "-1"
        self.guided_matching = False
        self.skip_geometric_verification = True


class _FakePairingOptions:
    match_list_path = Path(".")


class _FakeGeometryOptions:
    def __init__(self):
        self.compute_relative_pose = False
        self.detect_watermark = True
        self.min_num_inliers = 0
        self.ransac = SimpleNamespace(random_seed=-1)


class _FakeBundleAdjustmentOptions:
    def __init__(self):
        self.refine_focal_length = True
        self.refine_principal_point = True
        self.refine_extra_params = True
        self.print_summary = False


class _FakeBundleAdjustmentConfig:
    def __init__(self):
        self.image_ids = []
        self.gauge = None

    def add_image(self, image_id):
        self.image_ids.append(image_id)

    def fix_gauge(self, gauge):
        self.gauge = gauge


class _FakeBundleAdjustmentSummary:
    num_residuals = 123
    termination_type = SimpleNamespace(name="CONVERGENCE")

    def is_solution_usable(self):
        return True


class _FakeReconstruction:
    registry = {}

    def __init__(self, path=None):
        if path is not None:
            other = self.registry[str(path)]
            self.cameras = dict(other.cameras)
            self.images = dict(other.images)
            self.points = other.points
        else:
            self.cameras = {}
            self.images = {}
            self.points = 0

    def add_camera_with_trivial_rig(self, camera):
        self.cameras[camera.camera_id] = camera

    def add_image_with_trivial_frame(self, image, cam_from_world):
        image.cam_from_world_value = cam_from_world
        self.images[image.image_id] = image

    def is_valid(self):
        return bool(self.images) and len(self.cameras) == len(self.images)

    def num_reg_images(self):
        return len(self.images)

    def num_points3D(self):
        return self.points

    def reg_image_ids(self):
        return list(self.images)

    def image(self, image_id):
        return self.images[image_id]

    def camera(self, camera_id):
        return self.cameras[camera_id]

    def update_point_3d_errors(self):
        return None

    def write(self, path):
        Path(path, "cameras.bin").write_bytes(b"fake-cameras")
        Path(path, "images.bin").write_bytes(b"fake-images")
        Path(path, "points3D.bin").write_bytes(b"fake-points")
        self.registry[str(path)] = self


def _low_level_module(database):
    module = SimpleNamespace()
    module.__version__ = "4.0.2"
    module.COLMAP_version = "COLMAP 4.0.2"
    module.COLMAP_build = "Commit d927f7e with CUDA"
    module.has_cuda = True
    module.FeatureExtractionOptions = _FakeFeatureOptions
    module.ImageReaderOptions = _FakeReaderOptions
    module.FeatureMatchingOptions = _FakeMatchingOptions
    module.ImportedPairingOptions = _FakePairingOptions
    module.TwoViewGeometryOptions = _FakeGeometryOptions
    module.CameraMode = SimpleNamespace(PER_IMAGE="PER_IMAGE")
    module.Device = SimpleNamespace(cuda="cuda")
    module.CameraModelId = SimpleNamespace(PINHOLE="PINHOLE")
    module.BundleAdjustmentGauge = SimpleNamespace(
        TWO_CAMS_FROM_WORLD="TWO_CAMS_FROM_WORLD"
    )
    module.Database = SimpleNamespace(open=lambda _path: database)
    module.Camera = _FakeCamera
    module.Image = _FakeImage
    module.Rigid3d = lambda matrix: SimpleNamespace(matrix=lambda: matrix)
    module.Reconstruction = _FakeReconstruction
    module.BundleAdjustmentOptions = _FakeBundleAdjustmentOptions
    module.BundleAdjustmentConfig = _FakeBundleAdjustmentConfig
    module.extract_calls = []
    module.match_calls = []
    module.seed_calls = []
    module.ba_calls = []
    module.set_random_seed = lambda value: module.seed_calls.append(value)
    module.extract_features = lambda **kwargs: module.extract_calls.append(kwargs)
    module.match_image_pairs = lambda **kwargs: module.match_calls.append(kwargs)

    def create_default_bundle_adjuster(options, config, reconstruction):
        module.ba_calls.append((options, config, reconstruction))
        return SimpleNamespace(solve=lambda: _FakeBundleAdjustmentSummary())

    module.create_default_bundle_adjuster = create_default_bundle_adjuster
    return module


@pytest.mark.parametrize("truthy_non_bool", [1, "cuda", SimpleNamespace()])
def test_real_backend_reports_raw_non_bool_has_cuda(truthy_non_bool):
    module = SimpleNamespace(
        __version__="4.0.2",
        COLMAP_version="COLMAP 4.0.2",
        COLMAP_build="Commit d927f7e on 2026-03-18 with CUDA",
        has_cuda=truthy_non_bool,
    )
    backend = PycolmapBackend(
        module,
        SimpleNamespace(),
        config=PycolmapBackendConfig(0, 4096, 15),
    )
    assert backend.toolchain_evidence()["hasCuda"] is truthy_non_bool


def test_real_backend_accepts_guided_inliers_beyond_putative_matches(tmp_path):
    fixtures = fixture_images()
    database_images = [
        _FakeImage(image.name, 101 + index, 11 + index)
        for index, image in enumerate(fixtures)
    ]
    database = _FakeDatabase(
        database_images,
        raw_matches=30,
        verified_inliers=35,
    )
    module = _low_level_module(database)
    numpy = SimpleNamespace(asarray=lambda value, dtype: value, float64="float64")
    backend = PycolmapBackend(
        module,
        numpy,
        config=PycolmapBackendConfig(0, 4096, 15),
    )
    images = fixture_engine_images(fixtures)
    pairs = (qualification.explicit_pairs(fixtures)[0],)
    pairs_path = tmp_path / "pairs.txt"
    qualification.write_explicit_pairs(pairs_path, pairs)

    rewritten = backend.rewrite_intrinsics_preserving_ids(
        database_path=tmp_path / "database.db",
        images=images,
        log_path=tmp_path / "rewrite.log",
    )
    matched = backend.match_explicit_pairs(
        database_path=tmp_path / "database.db",
        pairs_path=pairs_path,
        image_pairs=pairs,
        gpu_index="0",
        log_path=tmp_path / "match.log",
    )
    validated = qualification._validate_match_rows(matched, pairs, rewritten)

    assert module.match_calls[0]["matching_options"].guided_matching is True
    assert validated == tuple(matched)
    assert validated[0]["guidedMatching"] is True
    assert validated[0]["rawMatches"] == 30
    assert validated[0]["verifiedInliers"] == 35


def test_real_backend_uses_exact_402_gpu_database_pair_and_seed_seams(tmp_path):
    fixtures = fixture_images()
    database_images = [
        _FakeImage(image.name, 101 + index, 11 + index)
        for index, image in enumerate(fixtures)
    ]
    database = _FakeDatabase(database_images)
    module = _low_level_module(database)
    numpy = SimpleNamespace(asarray=lambda value, dtype: value, float64="float64")
    backend = PycolmapBackend(
        module,
        numpy,
        config=PycolmapBackendConfig(0, 4096, 15),
    )
    engine_images = fixture_engine_images(fixtures)
    pairs = qualification.explicit_pairs(fixtures)
    pairs_path = tmp_path / "pairs.txt"
    qualification.write_explicit_pairs(pairs_path, pairs)

    sift = backend.extract_gpu_features(
        database_path=tmp_path / "database.db",
        image_dir=tmp_path,
        images=engine_images,
        gpu_index="0",
        log_path=tmp_path / "sift.log",
    )
    rewritten = backend.rewrite_intrinsics_preserving_ids(
        database_path=tmp_path / "database.db",
        images=engine_images,
        log_path=tmp_path / "rewrite.log",
    )
    matched = backend.match_explicit_pairs(
        database_path=tmp_path / "database.db",
        pairs_path=pairs_path,
        image_pairs=pairs,
        gpu_index="0",
        log_path=tmp_path / "match.log",
    )
    seed = backend.build_known_pose_seed(
        database_path=tmp_path / "database.db",
        images=engine_images,
        output_path=tmp_path / "seed",
        log_path=tmp_path / "seed.log",
    )
    triangulated_path = tmp_path / "triangulated"
    triangulated_path.mkdir()
    triangulated = _FakeReconstruction.registry[str(tmp_path / "seed")]
    triangulated.points = MIN_TRIANGULATED_POINTS + 7
    triangulated.write(triangulated_path)
    bundle_evidence = backend.bundle_adjust_with_success_evidence(
        input_path=triangulated_path,
        output_path=tmp_path / "adjusted",
        log_path=tmp_path / "bundle-adjust.log",
    )

    extract_call = module.extract_calls[0]
    assert extract_call["camera_mode"] == "PER_IMAGE"
    assert extract_call["device"] == "cuda"
    assert extract_call["extraction_options"].use_gpu is True
    assert extract_call["extraction_options"].gpu_index == "0"
    assert len(sift) == 5
    assert all(row["idsPreserved"] for row in rewritten)
    assert all(row["modelAfter"] == "PINHOLE" for row in rewritten)
    match_call = module.match_calls[0]
    assert match_call["pairing_options"].match_list_path == pairs_path
    assert match_call["device"] == "cuda"
    assert match_call["matching_options"].skip_geometric_verification is False
    assert match_call["verification_options"].ransac.random_seed == 0
    assert len(matched) == len(pairs)
    assert module.seed_calls == [0, 0]
    assert seed.registered_image_ids == (11, 12, 13, 14, 15)
    assert seed.num_points3d == 0
    for image in _FakeReconstruction.registry[str(tmp_path / "seed")].images.values():
        assert len(image.cam_from_world_value.matrix()) == 3
        assert len(image.cam_from_world_value.matrix()[0]) == 4
    ba_options, ba_config, ba_reconstruction = module.ba_calls[0]
    assert ba_config.image_ids == [11, 12, 13, 14, 15]
    assert ba_config.gauge == "TWO_CAMS_FROM_WORLD"
    assert ba_reconstruction.num_points3D() == MIN_TRIANGULATED_POINTS + 7
    assert ba_options.refine_focal_length is False
    assert ba_options.refine_principal_point is False
    assert ba_options.refine_extra_params is False
    assert ba_options.print_summary is True
    assert bundle_evidence["usable"] is True
    assert bundle_evidence["terminationType"] == "CONVERGENCE"
    assert bundle_evidence["modelWritten"] is True


def test_real_backend_returns_raw_unusable_bundle_evidence_without_writing(tmp_path):
    fixture = fixture_images()[0]
    database = _FakeDatabase([_FakeImage(fixture.name, 101, 11)])
    module = _low_level_module(database)
    numpy = SimpleNamespace(asarray=lambda value, dtype: value, float64="float64")
    backend = PycolmapBackend(
        module,
        numpy,
        config=PycolmapBackendConfig(0, 4096, 15),
    )
    input_path = tmp_path / "input"
    backend.build_known_pose_seed(
        database_path=tmp_path / "database.db",
        images=fixture_engine_images((fixture,)),
        output_path=input_path,
        log_path=tmp_path / "seed.log",
    )
    summary = SimpleNamespace(
        is_solution_usable=lambda: False,
        num_residuals=0,
        termination_type=SimpleNamespace(name="FAILURE"),
    )
    module.create_default_bundle_adjuster = lambda *_args: SimpleNamespace(
        solve=lambda: summary
    )
    output_path = tmp_path / "adjusted"

    evidence = backend.bundle_adjust_with_success_evidence(
        input_path=input_path,
        output_path=output_path,
        log_path=tmp_path / "bundle-adjust.log",
    )

    assert evidence["usable"] is False
    assert evidence["numResiduals"] == 0
    assert evidence["terminationType"] == "FAILURE"
    assert evidence["modelWritten"] is False
    assert not output_path.exists()


def test_module_has_no_queue_database_or_storage_client_imports():
    source = Path(qualification.__file__).read_text(encoding="utf-8")
    assert "from .queue" not in source
    assert "from .db" not in source
    assert "from .storage" not in source
    assert "SUPABASE_" not in source
