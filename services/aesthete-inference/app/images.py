"""Image fetching + sanity checks for /embed/image (design §12.1).

httpx with a 10 s timeout, content-type + max-size sanity (≤ 15 MB), decoded
via Pillow. Every failure raises ImageFetchError with a caller-readable reason
— the API layer maps it to a per-item ``errors[]`` entry so one bad URL never
fails the batch.
"""

from __future__ import annotations

from io import BytesIO

import httpx
from PIL import Image

from .safe_fetch import HostnameResolver, SafeFetchError, fetch_public_bytes, resolve_hostname

# Guard against decompression bombs before Pillow's own (much higher) default.
Image.MAX_IMAGE_PIXELS = 64_000_000

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

    return decode_image(data)


def decode_image(data: bytes) -> Image.Image:
    try:
        img = Image.open(BytesIO(data))
        img.load()
        return img
    except Image.DecompressionBombError:
        raise ImageFetchError("image too large to decode safely") from None
    except Exception:
        raise ImageFetchError("body is not a decodable image") from None
