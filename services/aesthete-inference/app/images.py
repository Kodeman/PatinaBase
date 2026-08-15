"""Image fetching + sanity checks for /embed/image (design §12.1).

httpx with a 10 s timeout, content-type + max-size sanity (≤ 15 MB), decoded
via Pillow. Every failure raises ImageFetchError with a caller-readable reason
— the API layer maps it to a per-item ``errors[]`` entry so one bad URL never
fails the batch.
"""

from __future__ import annotations

import httpx
from PIL import Image

from .image_safety import DecodedPixelBudget, UnsafeImageError, load_image_bytes
from .safe_fetch import HostnameResolver, SafeFetchError, fetch_public_bytes, resolve_hostname

# Retailer CDNs are sloppy about content types; accept obvious image types and
# generic byte streams (Pillow decode is the real arbiter), reject clear
# non-images (text/html error pages etc.).
_ACCEPTABLE_OPAQUE_TYPES = {"application/octet-stream", "binary/octet-stream", ""}


class ImageFetchError(Exception):
    """Per-item failure — reason is surfaced verbatim in the response errors[]."""


async def fetch_image(
    client: httpx.AsyncClient,
    url: str,
    *,
    timeout_s: float,
    max_bytes: int,
    max_pixels: int = 16_000_000,
    pixel_budget: DecodedPixelBudget | None = None,
    resolver: HostnameResolver = resolve_hostname,
) -> Image.Image:
    try:
        data = await fetch_public_bytes(
            client,
            url,
            timeout_s=timeout_s,
            max_bytes=max_bytes,
            allowed_content_types=_ACCEPTABLE_OPAQUE_TYPES,
            allowed_content_prefixes=("image/",),
            resolver=resolver,
        )
    except SafeFetchError as exc:
        reason = str(exc).replace(" is not allowed", " is not an image")
        raise ImageFetchError(reason) from None

    return decode_image(data, max_pixels=max_pixels, pixel_budget=pixel_budget)


def decode_image(
    data: bytes,
    *,
    max_pixels: int = 16_000_000,
    pixel_budget: DecodedPixelBudget | None = None,
) -> Image.Image:
    try:
        return load_image_bytes(data, max_pixels=max_pixels, budget=pixel_budget)
    except UnsafeImageError as exc:
        raise ImageFetchError(str(exc)) from None
