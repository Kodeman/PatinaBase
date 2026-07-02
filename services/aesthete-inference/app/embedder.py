"""ONNX embedding engine: nomic-embed-text-v1.5 + nomic-embed-vision-v1.5, int8.

Loads the artifacts produced by ``scripts/export_models.py`` (see
``models/manifest.json`` for the export lineage). Both towers emit unit
768-d vectors in the shared nomic v1.5 space (design §4.2).

Pooling recipes (from the model cards, reproduced in numpy):
  - text:   mean-pool over the attention mask → layer_norm → L2 normalize
            (the layer_norm is the v1.5 Matryoshka recipe; load-bearing)
  - vision: CLS token of last_hidden_state → L2 normalize

Task prefixes ("search_document: " / "search_query: ") are applied by the API
layer (main.py) — this module receives already-prefixed strings.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol, Sequence

import numpy as np
from PIL import Image

_LN_EPS = 1e-5  # torch.nn.functional.layer_norm default


class EmbedderLike(Protocol):
    """What the API layer needs from an embedding engine (real or fake)."""

    model_version: str
    warmed: bool
    text_dim: int
    image_dim: int

    def embed_texts(self, texts: Sequence[str]) -> np.ndarray: ...

    def embed_images(self, images: Sequence[Image.Image]) -> np.ndarray: ...


def l2_normalize(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=-1, keepdims=True)
    return x / np.clip(norms, 1e-12, None)


def _layer_norm(x: np.ndarray) -> np.ndarray:
    mean = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return (x - mean) / np.sqrt(var + _LN_EPS)


class OnnxEmbedder:
    """The real engine. Construction is cheap-ish (~seconds); call warmup()
    once before serving so first-request latency is honest."""

    def __init__(
        self,
        models_dir: Path,
        *,
        intra_op_threads: int = 2,
        text_max_tokens: int = 2048,
    ) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        models_dir = Path(models_dir)
        manifest_path = models_dir / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"{manifest_path} not found — run `make export` (or "
                "`python scripts/export_models.py`) to download + quantize the "
                "models before serving."
            )
        self.manifest = json.loads(manifest_path.read_text())
        self.model_version: str = self.manifest["model_version"]
        self.text_dim = 768
        self.image_dim = 768
        self.warmed = False

        so = ort.SessionOptions()
        so.intra_op_num_threads = intra_op_threads
        so.inter_op_num_threads = 1
        providers = ["CPUExecutionProvider"]

        self._text_session = ort.InferenceSession(
            str(models_dir / "text" / "model.int8.onnx"), so, providers=providers
        )
        self._vision_session = ort.InferenceSession(
            str(models_dir / "vision" / "model.int8.onnx"), so, providers=providers
        )
        self._text_input_names = {i.name for i in self._text_session.get_inputs()}
        self._vision_input_name = self._vision_session.get_inputs()[0].name

        self._tokenizer = Tokenizer.from_file(str(models_dir / "text" / "tokenizer.json"))
        self._tokenizer.enable_truncation(max_length=text_max_tokens)
        self._tokenizer.no_padding()  # we pad manually (numpy) below

        self._preproc = json.loads(
            (models_dir / "vision" / "preprocessor_config.json").read_text()
        )

    # ── text ─────────────────────────────────────────────────────────────────

    def embed_texts(self, texts: Sequence[str]) -> np.ndarray:
        """texts are already task-prefixed. Returns (n, 768) float32, L2-normalized."""
        encodings = self._tokenizer.encode_batch(list(texts))
        max_len = max(len(e.ids) for e in encodings)
        n = len(encodings)
        input_ids = np.zeros((n, max_len), dtype=np.int64)  # pad_token_id = 0
        attention_mask = np.zeros((n, max_len), dtype=np.int64)
        for row, enc in enumerate(encodings):
            ids = enc.ids
            input_ids[row, : len(ids)] = ids
            attention_mask[row, : len(ids)] = 1

        feeds: dict[str, np.ndarray] = {}
        if "input_ids" in self._text_input_names:
            feeds["input_ids"] = input_ids
        if "attention_mask" in self._text_input_names:
            feeds["attention_mask"] = attention_mask
        if "token_type_ids" in self._text_input_names:
            feeds["token_type_ids"] = np.zeros_like(input_ids)

        (last_hidden,) = self._text_session.run(None, feeds)[:1]
        # mean pool over the attention mask
        mask = attention_mask[..., None].astype(np.float32)
        summed = (last_hidden.astype(np.float32) * mask).sum(axis=1)
        counts = np.clip(mask.sum(axis=1), 1e-9, None)
        pooled = summed / counts
        return l2_normalize(_layer_norm(pooled)).astype(np.float32)

    # ── vision ───────────────────────────────────────────────────────────────

    def embed_images(self, images: Sequence[Image.Image]) -> np.ndarray:
        """Returns (n, 768) float32, L2-normalized. CLS pooling per model card."""
        pixel_values = np.stack([self._preprocess_image(im) for im in images])
        outputs = self._vision_session.run(None, {self._vision_input_name: pixel_values})
        out = outputs[0].astype(np.float32)
        if out.ndim == 3:  # last_hidden_state → CLS token
            out = out[:, 0, :]
        return l2_normalize(out).astype(np.float32)

    def _preprocess_image(self, image: Image.Image) -> np.ndarray:
        """Faithful numpy port of the repo's CLIPImageProcessor config:
        RGB convert → resize (bicubic) → center-crop 224 → rescale 1/255 →
        normalize with CLIP mean/std → CHW float32."""
        cfg = self._preproc
        if cfg.get("do_convert_rgb", True) and image.mode != "RGB":
            image = image.convert("RGB")

        if cfg.get("do_resize", True):
            size = cfg.get("size", {})
            if "shortest_edge" in size:
                short = int(size["shortest_edge"])
                w, h = image.size
                scale = short / min(w, h)
                image = image.resize(
                    (max(short, round(w * scale)), max(short, round(h * scale))),
                    Image.Resampling.BICUBIC,
                )
            else:
                image = image.resize(
                    (int(size.get("width", 224)), int(size.get("height", 224))),
                    Image.Resampling.BICUBIC,
                )

        if cfg.get("do_center_crop", True):
            crop = cfg.get("crop_size", {"height": 224, "width": 224})
            cw, ch = int(crop["width"]), int(crop["height"])
            w, h = image.size
            left = max(0, (w - cw) // 2)
            top = max(0, (h - ch) // 2)
            image = image.crop((left, top, left + cw, top + ch))
            if image.size != (cw, ch):  # source smaller than crop — pad via resize
                image = image.resize((cw, ch), Image.Resampling.BICUBIC)

        arr = np.asarray(image, dtype=np.float32)
        if cfg.get("do_rescale", True):
            arr = arr * float(cfg.get("rescale_factor", 1 / 255))
        if cfg.get("do_normalize", True):
            mean = np.asarray(cfg["image_mean"], dtype=np.float32)
            std = np.asarray(cfg["image_std"], dtype=np.float32)
            arr = (arr - mean) / std
        return arr.transpose(2, 0, 1)  # HWC → CHW

    # ── warmup ───────────────────────────────────────────────────────────────

    def warmup(self) -> None:
        self.embed_texts(["search_document: warmup"])
        self.embed_images([Image.new("RGB", (224, 224), (128, 128, 128))])
        self.warmed = True
