"""item 3 — the GPU-extras packaging contract.

Locks the shape of pyproject's optional-dependencies so a refactor can't silently
(a) drop a stage extra, (b) let CUDA leak into a CPU install, or (c) break the
`[gpu]` meta-extra. These assert the DECLARED extras — the actual CUDA install +
`import torch` is the operator's box step (there is no GPU here).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from pathlib import Path

PYPROJECT = Path(__file__).resolve().parent.parent / "pyproject.toml"
SERVICE_ROOT = PYPROJECT.parent


def _extras() -> dict[str, list[str]]:
    with PYPROJECT.open("rb") as fh:
        data = tomllib.load(fh)
    return data["project"]["optional-dependencies"], data["project"]["dependencies"]


def test_all_stage_extras_declared():
    extras, _ = _extras()
    assert set(extras) == {"solve", "drawings", "refine", "fuse", "splat", "gpu", "dev"}


def test_cpu_install_never_pulls_cuda():
    # The base runtime dep set and the CPU extras must be CUDA-free — a CPU-only
    # worker (plain install.sh) must never drag in torch/gsplat/CUDA.
    extras, base = _extras()
    cuda_markers = ("torch", "gsplat", "pycolmap", "open3d", "cuda", "nvidia")
    for name in ("solve", "drawings"):
        joined = " ".join(extras[name]).lower()
        assert not any(m in joined for m in cuda_markers), f"[{name}] leaked CUDA: {extras[name]}"
    base_joined = " ".join(base).lower()
    assert not any(m in base_joined for m in cuda_markers), f"base deps leaked CUDA: {base}"


def test_gpu_stage_extras_pull_only_their_imports():
    extras, _ = _extras()
    # refine drives the exact COLMAP target via pycolmap — NOT torch. install.sh
    # supplies the qualified wheel as a direct candidate in the same resolver
    # transaction, so this metadata remains truthful for pip check.
    refine = " ".join(extras["refine"]).lower()
    assert "pycolmap" in refine and "torch" not in refine and "gsplat" not in refine
    # fuse = Open3D TSDF (+ trimesh export) — NOT torch.
    fuse = " ".join(extras["fuse"]).lower()
    assert "open3d" in fuse and "torch" not in fuse
    # splat is the ONLY torch/CUDA stage.
    splat = " ".join(extras["splat"]).lower()
    assert "torch" in splat and "gsplat" in splat


def test_refine_pins_the_target_pycolmap_binding_exactly():
    extras, _ = _extras()
    pycolmap = next(dep.replace(" ", "").lower() for dep in extras["refine"] if dep.lower().startswith("pycolmap"))
    assert pycolmap == "pycolmap==4.0.2"


def test_splat_pins_a_turing_safe_torch_ceiling():
    # sm_75 rides PyTorch's cu118 wheels; the box installs +cu118 via the index.
    # We pin an UPPER bound so a future torch that drops sm_75/cu118 can't be
    # resolved silently — the pin is the documented ceiling.
    extras, _ = _extras()
    torch_spec = next(s for s in extras["splat"] if s.lower().startswith("torch"))
    assert "<" in torch_spec, f"torch must carry an upper bound (Turing ceiling): {torch_spec!r}"


def test_gpu_is_the_meta_extra():
    # [gpu] is a self-referential meta-extra = refine + fuse + splat (the box's
    # one-line install) — it must not re-declare concrete packages.
    extras, _ = _extras()
    gpu = [d.replace(" ", "").lower() for d in extras["gpu"]]
    assert gpu == ["patina-scan-worker[refine,fuse,splat]"]


def test_gpu_meta_extra_expands_to_all_concrete_stage_requirements():
    """Resolver-shaped proof: recursively expand our self-extra and ensure it
    terminates in the concrete requirements for all three GPU stages."""
    import pytest
    Requirement = pytest.importorskip("packaging.requirements").Requirement
    extras, _ = _extras()

    expanded: set[str] = set()
    pending = [Requirement(dep) for dep in extras["gpu"]]
    seen_extras: set[str] = set()
    while pending:
        requirement = pending.pop()
        if requirement.name == "patina-scan-worker":
            for extra in requirement.extras:
                assert extra in extras
                if extra not in seen_extras:
                    seen_extras.add(extra)
                    pending.extend(Requirement(dep) for dep in extras[extra])
        else:
            expanded.add(requirement.name.lower())

    assert seen_extras == {"refine", "fuse", "splat"}
    assert {"pycolmap", "scipy", "open3d", "trimesh", "torch", "gsplat", "numpy"} <= expanded


def test_every_extra_is_a_valid_pep508_requirement():
    # network-free "do the extras resolve?" — every dep parses as a PEP 508
    # requirement, and the [gpu] meta-extra references our own package's three
    # GPU extras. (The actual CUDA install is the operator's box step.)
    import pytest
    Requirement = pytest.importorskip("packaging.requirements").Requirement
    extras, base = _extras()
    for dep in base:
        Requirement(dep)
    for name, deps in extras.items():
        for dep in deps:
            Requirement(dep)  # raises InvalidRequirement on a malformed spec
    meta = Requirement(extras["gpu"][0])
    assert meta.name == "patina-scan-worker"
    assert meta.extras == {"refine", "fuse", "splat"}


def test_field_raster_helper_survives_real_wheel_and_sdist_builds(tmp_path):
    isolated_source = tmp_path / "source"
    isolated_source.mkdir()
    shutil.copy2(SERVICE_ROOT / "pyproject.toml", isolated_source)
    shutil.copy2(SERVICE_ROOT / "README.md", isolated_source)
    shutil.copytree(SERVICE_ROOT / "src", isolated_source / "src")
    distribution_dir = tmp_path / "dist"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "build",
            "--no-isolation",
            "--wheel",
            "--sdist",
            "--outdir",
            str(distribution_dir),
        ],
        cwd=isolated_source,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    assert result.returncode == 0, result.stdout

    wheel = next(distribution_dir.glob("*.whl"))
    with zipfile.ZipFile(wheel) as archive:
        wheel_names = set(archive.namelist())
    assert "patina_scan_worker/field_raster_libheif.c" in wheel_names
    assert "patina_scan_worker/field_raster_qualification.py" in wheel_names
    assert "patina_scan_worker/refine_engine.py" in wheel_names
    assert "patina_scan_worker/refine_materializer.py" in wheel_names
    assert "patina_scan_worker/refine_native_process.py" in wheel_names
    assert "patina_scan_worker/refine_publisher.py" in wheel_names
    assert "patina_scan_worker/refine_runner.py" in wheel_names

    source_distribution = next(distribution_dir.glob("*.tar.gz"))
    with tarfile.open(source_distribution, "r:gz") as archive:
        source_names = set(archive.getnames())
    assert any(name.endswith("/field_raster_libheif.c") for name in source_names)
    assert any(name.endswith("/field_raster_qualification.py") for name in source_names)
    assert any(name.endswith("/refine_engine.py") for name in source_names)
    assert any(name.endswith("/refine_materializer.py") for name in source_names)
    assert any(name.endswith("/refine_native_process.py") for name in source_names)
    assert any(name.endswith("/refine_publisher.py") for name in source_names)
    assert any(name.endswith("/refine_runner.py") for name in source_names)
