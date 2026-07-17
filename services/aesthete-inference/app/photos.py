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
) -> bytes:
    """Stream a photo from a (signed) URL with a hard size cap.

    No content-type gate — HEIC is served as anything from ``image/heic`` to
    ``application/octet-stream``, and the source is our own signed storage URL;
    the Pillow/pillow-heif decode is the real arbiter. Any fetch-side failure
    raises :class:`PhotoFetchError` (the route maps it to 502).
    """
    if not url.lower().startswith(("http://", "https://")):
        raise PhotoFetchError("url must be http(s)")

    try:
        async with client.stream(
            "GET", url, timeout=timeout_s, follow_redirects=True
        ) as resp:
            if resp.status_code != 200:
                raise PhotoFetchError(f"fetch failed: HTTP {resp.status_code}")

            declared = resp.headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                raise PhotoFetchError(
                    f"content-length {declared} exceeds limit of {max_bytes} bytes"
                )

            buf = bytearray()
            async for chunk in resp.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise PhotoFetchError(f"body exceeds limit of {max_bytes} bytes")
    except PhotoFetchError:
        raise
    except httpx.TimeoutException:
        raise PhotoFetchError(f"fetch timed out after {timeout_s:g}s") from None
    except httpx.HTTPError as exc:
        raise PhotoFetchError(f"fetch failed: {exc.__class__.__name__}") from None

    if not buf:
        raise PhotoFetchError("empty response body")
    return bytes(buf)


def convert_heic_to_jpeg(
    data: bytes,
    *,
    thumb_max_px: int = 512,
    preview_max_px: int = 1600,
    jpeg_quality: float = 0.8,
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
        base = Image.open(BytesIO(data))
        base.load()
    except PhotoDecodeError:
        raise
    except Exception:
        raise PhotoDecodeError("body is not a decodable image") from None

    # Respect EXIF orientation, then normalise to RGB (JPEG has no alpha).
    base = ImageOps.exif_transpose(base) or base
    if base.mode != "RGB":
        base = base.convert("RGB")

    # jpeg_quality arrives as a 0–1 float; Pillow wants an int 1–95.
    quality = max(1, min(95, int(round(jpeg_quality * 100))))

    def render(max_px: int) -> dict:
        variant = base.copy()
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

    return {"thumb": render(thumb_max_px), "preview": render(preview_max_px)}
