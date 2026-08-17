"""Hard decoded-image memory bounds shared by raster and HEIC paths."""

from __future__ import annotations

import warnings
from io import BytesIO

from PIL import Image

ABSOLUTE_MAX_IMAGE_PIXELS = 32_000_000
Image.MAX_IMAGE_PIXELS = ABSOLUTE_MAX_IMAGE_PIXELS


class UnsafeImageError(Exception):
    """Image dimensions or decoder behavior exceed the process safety policy."""


class DecodedPixelBudget:
    def __init__(self, max_pixels: int) -> None:
        self.max_pixels = max_pixels
        self.used_pixels = 0

    def claim(self, pixels: int) -> None:
        if pixels <= 0 or self.used_pixels + pixels > self.max_pixels:
            raise UnsafeImageError("image batch exceeds decoded-pixel limit")
        self.used_pixels += pixels

    def release(self, pixels: int) -> None:
        self.used_pixels = max(0, self.used_pixels - pixels)


def load_image_bytes(
    data: bytes,
    *,
    max_pixels: int,
    budget: DecodedPixelBudget | None = None,
) -> Image.Image:
    if not data:
        raise UnsafeImageError("body is not a decodable image")

    image: Image.Image | None = None
    claimed = 0
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(data))
            width, height = image.size
            pixels = width * height
            if width <= 0 or height <= 0 or pixels > max_pixels:
                raise UnsafeImageError("image too large to decode safely")
            if budget is not None:
                budget.claim(pixels)
                claimed = pixels
            image.load()
        return image
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        if budget is not None and claimed:
            budget.release(claimed)
        if image is not None:
            image.close()
        raise UnsafeImageError("image too large to decode safely") from None
    except UnsafeImageError:
        if budget is not None and claimed:
            budget.release(claimed)
        if image is not None:
            image.close()
        raise
    except Exception:
        if budget is not None and claimed:
            budget.release(claimed)
        if image is not None:
            image.close()
        raise UnsafeImageError("body is not a decodable image") from None
