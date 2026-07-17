"""Author the committed HEIC fixture for tests/test_photos.py.

A 2000×1500 (4:3) RGB gradient saved as HEIC via pillow-heif — mirrors an iPhone
room photo closely enough to exercise the derivative lane (decode, EXIF-orient,
downscale to a 512 thumb + a 1600 preview, JPEG-encode, aspect preservation)
while staying a few KB. 4:3 is deliberate so the tests can assert the caps land
at 512×384 and 1600×1200 with aspect preserved.

    python scripts/make_test_heic.py    # → tests/fixtures/room-photo.heic

Re-run after changing what the converter needs to cover. pillow-heif is required
(`pip install pillow-heif` or the `make test` venv).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pillow_heif
from PIL import Image

FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "room-photo.heic"


def author_room_photo(path: Path) -> None:
    pillow_heif.register_heif_opener()
    w, h = 2000, 1500  # 4:3
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    arr[..., 0] = np.linspace(0, 255, w, dtype=np.uint8)[None, :]  # R ramps across
    arr[..., 1] = np.linspace(0, 255, h, dtype=np.uint8)[:, None]  # G ramps down
    arr[..., 2] = 128
    img = Image.fromarray(arr)  # 3-channel uint8 → RGB
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="HEIF", quality=60)


if __name__ == "__main__":
    author_room_photo(FIXTURE)
    print(f"wrote {FIXTURE} ({FIXTURE.stat().st_size} bytes)")
