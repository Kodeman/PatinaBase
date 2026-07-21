"""Bounded runtime qualification for the DeskDev PyCOLMAP CUDA artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


EXPECTED_BUILD = "Commit d927f7e on 2026-03-18 with CUDA"
EXPECTED_VERSION = "4.0.2"
MIN_KEYPOINTS = 40
IMAGE_SIZE = 512


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-prefix", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)

    import numpy as np
    import pycolmap

    expected_prefix = Path(args.expected_prefix).resolve(strict=True)
    module_path = Path(pycolmap.__file__).resolve(strict=True)
    try:
        module_path.relative_to(expected_prefix)
    except ValueError as exc:
        raise RuntimeError(
            f"pycolmap loaded outside candidate prefix: {module_path}"
        ) from exc

    if pycolmap.__version__ != EXPECTED_VERSION:
        raise RuntimeError(f"unexpected pycolmap version: {pycolmap.__version__!r}")
    if pycolmap.COLMAP_version != "COLMAP 4.0.2":
        raise RuntimeError(f"unexpected COLMAP_version: {pycolmap.COLMAP_version!r}")
    if pycolmap.COLMAP_build != EXPECTED_BUILD:
        raise RuntimeError(f"unexpected COLMAP_build: {pycolmap.COLMAP_build!r}")
    if type(pycolmap.has_cuda) is not bool or not pycolmap.has_cuda:
        raise RuntimeError(
            f"pycolmap.has_cuda must be the bool True, got {pycolmap.has_cuda!r}"
        )
    devices = int(pycolmap.get_num_cuda_devices())
    if devices < 1:
        raise RuntimeError("PyCOLMAP cannot see a CUDA device")

    # Fixed-size, deterministic, high-contrast texture.  It bounds work and
    # produces enough stable corners to distinguish a real CUDA SIFT execution
    # from an import-only or empty-result probe.
    y, x = np.indices((IMAGE_SIZE, IMAGE_SIZE), dtype=np.int32)
    checker = ((x // 16 + y // 16) & 1) * 192
    texture = (x * 17 + y * 29 + ((x * y) % 61) * 3) & 63
    image = np.ascontiguousarray((checker + texture).astype(np.uint8))
    options = pycolmap.FeatureExtractionOptions()
    options.max_image_size = IMAGE_SIZE
    sift = options.sift
    sift.max_num_features = 4096
    options.sift = sift
    extractor = pycolmap.FeatureExtractor.create(
        options=options,
        device=pycolmap.Device.cuda,
    )
    keypoints, descriptors = extractor.extract_from_uint8_array(image)
    keypoint_count = int(len(keypoints))
    if keypoint_count < MIN_KEYPOINTS:
        raise RuntimeError(
            f"CUDA SIFT returned only {keypoint_count} keypoints; need {MIN_KEYPOINTS}"
        )
    descriptor_data = np.asarray(descriptors.data)
    if descriptor_data.ndim != 2 or descriptor_data.shape != (keypoint_count, 128):
        raise RuntimeError(
            "CUDA SIFT descriptor shape does not match keypoints: "
            f"{descriptor_data.shape!r} vs {keypoint_count}"
        )
    if not np.isfinite(descriptor_data).all():
        raise RuntimeError("CUDA SIFT returned non-finite descriptors")

    print(
        json.dumps(
            {
                "colmap_build": pycolmap.COLMAP_build,
                "cuda_devices": devices,
                "has_cuda": pycolmap.has_cuda,
                "keypoints": keypoint_count,
                "module": str(module_path),
                "version": pycolmap.__version__,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
