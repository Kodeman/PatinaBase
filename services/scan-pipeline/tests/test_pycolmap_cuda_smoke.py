"""The bounded CUDA smoke follows PyCOLMAP 4.0.2's feature wrapper shapes."""

from __future__ import annotations

import json
import sys
from types import SimpleNamespace

import numpy as np

from patina_scan_worker.pycolmap_cuda_smoke import main


def test_smoke_reads_feature_descriptors_data(monkeypatch, tmp_path, capsys):
    prefix = tmp_path / "venv"
    package = prefix / "lib" / "python3.12" / "site-packages" / "pycolmap"
    package.mkdir(parents=True)
    module_file = package / "__init__.py"
    module_file.write_text("# fake installed module\n")

    class Options:
        def __init__(self):
            self.max_image_size = 0
            self.sift = SimpleNamespace(max_num_features=0)

    descriptors = SimpleNamespace(data=np.ones((64, 128), dtype=np.uint8))
    extractor = SimpleNamespace(
        extract_from_uint8_array=lambda image: (list(range(64)), descriptors)
    )
    pycolmap = SimpleNamespace(
        __file__=str(module_file),
        __version__="4.0.2",
        COLMAP_version="COLMAP 4.0.2",
        COLMAP_build="Commit d927f7e on 2026-03-18 with CUDA",
        has_cuda=True,
        get_num_cuda_devices=lambda: 1,
        FeatureExtractionOptions=Options,
        FeatureExtractor=SimpleNamespace(create=lambda **_kwargs: extractor),
        Device=SimpleNamespace(cuda="cuda"),
    )
    monkeypatch.setitem(sys.modules, "pycolmap", pycolmap)

    assert main(["--expected-prefix", str(prefix)]) == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["keypoints"] == 64
    assert receipt["has_cuda"] is True
