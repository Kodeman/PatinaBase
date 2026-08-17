"""HEIC → JPEG derivative lane for Room View photos (I78, blessed code-only).

Every ``room_scan_images`` row lands as ``image/heic`` — undecodable in Chrome
and Firefox — and iOS never uploads the 256px thumbnail it builds locally, so
``thumbnail_url`` is NULL on every prod row. This module mirrors the GLB
archival lane (``app/usdz.py``): one ``/convert/heic-to-jpeg`` endpoint does a
single decode of a signed HEIC into a 512px thumbnail + a 1600px preview,
returned as base64 JPEG. The ``derive-scan-photo-media`` edge sweep drives it and
lands the derivatives at ``photo_derivatives/{uid}/{seg3}/{stem}_{size}.jpg``.

pillow-heif is imported **lazily inside the conversion function** (and
``register_heif_opener`` is called there, not at import): a broken libheif wheel
must never take down the embed worker's ``/embed/*`` routes. This module is
imported at app start, but ``pillow_heif`` is only touched when a conversion runs
or ``/healthz`` probes :func:`heif_available`.
"""

from __future__ import annotations

import base64
from functools import lru_cache
from io import BytesIO
import httpx

from .image_safety import UnsafeImageError, load_image_bytes
from .safe_fetch import HostnameResolver, SafeFetchError, fetch_public_bytes, resolve_hostname


class PhotoFetchError(Exception):
    """Upstream photo fetch failed (bad URL / HTTP status / timeout / size) → 502."""


class PhotoDecodeError(Exception):
    """Bytes could not be decoded into an image → 422. Reason is caller-readable."""


@lru_cache(maxsize=1)
def heif_available() -> bool:
    """Cheap, cached probe: is the HEIF decode toolchain importable?

    Cached so ``/healthz`` (open, hit often) never pays the import cost twice and
    a missing/broken pillow-heif wheel degrades to ``heif_available: false``
    rather than a crash. Result is process-lifetime stable — a wheel doesn't
    appear at runtime. Import only; the opener is registered inside
    :func:`convert_heic_to_jpeg`.
    """
    try:
        import pillow_heif  # noqa: F401
        from PIL import Image, ImageOps  # noqa: F401

        return True
    except Exception:
        return False


async def fetch_photo(
    client: httpx.AsyncClient,
    url: str,
    *,
    timeout_s: float,
    max_bytes: int,
    resolver: HostnameResolver = resolve_hostname,
) -> bytes:
    """Stream a photo from a (signed) URL with a hard size cap.

    HEIC and generic binary storage content types are accepted; unrelated
    types are rejected before the body is read. Any fetch-side failure raises
    :class:`PhotoFetchError` (the route maps it to 502).
    """
    try:
        return await fetch_public_bytes(
            client,
            url,
            timeout_s=timeout_s,
            max_bytes=max_bytes,
            allowed_content_types={
                "application/octet-stream",
                "binary/octet-stream",
                "image/heic",
                "image/heif",
                "image/heic-sequence",
                "image/heif-sequence",
            },
            resolver=resolver,
        )
    except SafeFetchError as exc:
        raise PhotoFetchError(str(exc)) from None


def convert_heic_to_jpeg(
    data: bytes,
    *,
    thumb_max_px: int = 512,
    preview_max_px: int = 1600,
    jpeg_quality: float = 0.8,
    max_pixels: int = 32_000_000,
) -> dict:
    """Decode HEIC bytes ONCE → a 512px thumb + a 1600px preview, both JPEG-b64.

    One fetch (route), one decode here: ``exif_transpose`` (respect capture
    orientation) → RGB → two ``thumbnail`` downscales off copies of the single
    decoded base (best quality, never an upscale) → two JPEG encodes. CPU-bound;
    pillow-heif imported + registered lazily. Raises :class:`PhotoDecodeError`
    (→ 422) when the bytes aren't a decodable image.
    """
    import pillow_heif
    from PIL import Image, ImageOps

    pillow_heif.register_heif_opener()

    if not data:
        raise PhotoDecodeError("empty request body")

    try:
        base = load_image_bytes(data, max_pixels=max_pixels)
    except UnsafeImageError as exc:
        raise PhotoDecodeError(str(exc)) from None

    # Respect EXIF orientation, then normalise to RGB (JPEG has no alpha).
    oriented = ImageOps.exif_transpose(base)
    if oriented is not base:
        base.close()
        base = oriented
    if base.mode != "RGB":
        converted = base.convert("RGB")
        base.close()
        base = converted

    # jpeg_quality arrives as a 0–1 float; Pillow wants an int 1–95.
    quality = max(1, min(95, int(round(jpeg_quality * 100))))

    def render(max_px: int) -> dict:
        variant = base.copy()
        try:
            variant.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
            out = BytesIO()
            variant.save(out, format="JPEG", quality=quality, optimize=True)
            raw = out.getvalue()
            return {
                "b64": base64.b64encode(raw).decode("ascii"),
                "width": variant.width,
                "height": variant.height,
                "bytes": len(raw),
            }
        finally:
            variant.close()

    try:
        return {"thumb": render(thumb_max_px), "preview": render(preview_max_px)}
    finally:
        base.close()
