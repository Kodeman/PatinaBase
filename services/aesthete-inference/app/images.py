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
) -> Image.Image:
    if not url.lower().startswith(("http://", "https://")):
        raise ImageFetchError("url must be http(s)")

    try:
        async with client.stream(
            "GET", url, timeout=timeout_s, follow_redirects=True
        ) as resp:
            if resp.status_code != 200:
                raise ImageFetchError(f"fetch failed: HTTP {resp.status_code}")

            ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
            if not ctype.startswith("image/") and ctype not in _ACCEPTABLE_OPAQUE_TYPES:
                raise ImageFetchError(f"content-type {ctype!r} is not an image")

            declared = resp.headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                raise ImageFetchError(
                    f"content-length {declared} exceeds limit of {max_bytes} bytes"
                )

            buf = BytesIO()
            total = 0
            async for chunk in resp.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise ImageFetchError(
                        f"body exceeds limit of {max_bytes} bytes"
                    )
                buf.write(chunk)
    except ImageFetchError:
        raise
    except httpx.TimeoutException:
        raise ImageFetchError(f"fetch timed out after {timeout_s:g}s") from None
    except httpx.HTTPError as exc:
        raise ImageFetchError(f"fetch failed: {exc.__class__.__name__}") from None

    return decode_image(buf.getvalue())


def decode_image(data: bytes) -> Image.Image:
    try:
        img = Image.open(BytesIO(data))
        img.load()
        return img
    except Image.DecompressionBombError:
        raise ImageFetchError("image too large to decode safely") from None
    except Exception:
        raise ImageFetchError("body is not a decodable image") from None
