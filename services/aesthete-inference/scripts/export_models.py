#!/usr/bin/env python3
"""Download + quantize the nomic v1.5 embedding pair into ./models (design §4.2, §12.1).

Export lineage
--------------
Both HuggingFace repos publish fp32 ONNX exports (`onnx/model.onnx`, exported
upstream by the nomic team via optimum). We PREFER those published weights —
no torch, no re-export drift — and apply onnxruntime int8 *dynamic*
quantization ourselves so the quantization parameters are pinned here rather
than inherited from an unversioned upstream `model_quantized.onnx`.

    nomic-ai/nomic-embed-text-v1.5   @ e9b6763023c676ca8431644204f50c2b100d9aab
        onnx/model.onnx  ──quantize_dynamic(QInt8)──▶  models/text/model.int8.onnx
    nomic-ai/nomic-embed-vision-v1.5 @ e3a725bce72db07ca4adb1d83da08903f3ee02f8
        onnx/model.onnx  ──quantize_dynamic(QInt8)──▶  models/vision/model.int8.onnx

Everything (revisions, sha256 of source + output, quantization params,
onnxruntime version) is recorded in models/manifest.json. `model_version`
(surfaced by /healthz and every embed response) changes ONLY when any of the
above changes — bump the `-rN` suffix.

Usage:
    python scripts/export_models.py [--out models]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import shutil
import sys
from pathlib import Path

MODEL_VERSION = "nomic-v1.5-onnx-int8-r1"

TEXT_REPO = "nomic-ai/nomic-embed-text-v1.5"
TEXT_REVISION = "e9b6763023c676ca8431644204f50c2b100d9aab"
TEXT_AUX_FILES = ["tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "config.json"]

VISION_REPO = "nomic-ai/nomic-embed-vision-v1.5"
VISION_REVISION = "e3a725bce72db07ca4adb1d83da08903f3ee02f8"
VISION_AUX_FILES = ["preprocessor_config.json", "config.json"]

ONNX_SOURCE_FILE = "onnx/model.onnx"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def export_one(repo: str, revision: str, aux_files: list[str], out_dir: Path) -> dict:
    from huggingface_hub import hf_hub_download
    from onnxruntime import __version__ as ort_version
    from onnxruntime.quantization import QuantType, quantize_dynamic

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"→ {repo}@{revision[:12]}: downloading {ONNX_SOURCE_FILE} …", flush=True)
    src = Path(hf_hub_download(repo_id=repo, filename=ONNX_SOURCE_FILE, revision=revision))
    src_sha = sha256(src)

    for aux in aux_files:
        p = Path(hf_hub_download(repo_id=repo, filename=aux, revision=revision))
        shutil.copy2(p, out_dir / Path(aux).name)

    quantized = out_dir / "model.int8.onnx"
    print(f"→ {repo}: int8 dynamic quantization → {quantized} …", flush=True)
    quantize_dynamic(
        model_input=str(src),
        model_output=str(quantized),
        weight_type=QuantType.QInt8,
    )

    entry = {
        "repo": repo,
        "revision": revision,
        "source_file": ONNX_SOURCE_FILE,
        "source_sha256": src_sha,
        "aux_files": aux_files,
        "quantized_file": str(quantized.name),
        "quantized_sha256": sha256(quantized),
        "quantization": {
            "method": "onnxruntime.quantization.quantize_dynamic",
            "weight_type": "QInt8",
            "onnxruntime_version": ort_version,
        },
    }
    print(f"✓ {repo}: {quantized.stat().st_size / 1e6:.0f} MB quantized", flush=True)
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_out = Path(__file__).resolve().parent.parent / "models"
    parser.add_argument("--out", type=Path, default=default_out)
    args = parser.parse_args()

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    manifest = {
        "model_version": MODEL_VERSION,
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "text": export_one(TEXT_REPO, TEXT_REVISION, TEXT_AUX_FILES, out / "text"),
        "vision": export_one(VISION_REPO, VISION_REVISION, VISION_AUX_FILES, out / "vision"),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"✓ wrote {out / 'manifest.json'} (model_version={MODEL_VERSION})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
