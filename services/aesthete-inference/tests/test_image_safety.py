from __future__ import annotations

import struct
import zlib

import pytest

from app.images import ImageFetchError, decode_image
from conftest import png_bytes


def png_with_dimensions(width: int, height: int) -> bytes:
    raw = bytearray(png_bytes(size=(1, 1)))
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw[16:29] = ihdr_data
    raw[29:33] = struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF)
    return bytes(raw)


def test_decoder_rejects_pixel_bomb_from_header_before_full_load():
    with pytest.raises(ImageFetchError, match="too large"):
        decode_image(png_with_dimensions(100_000, 100_000), max_pixels=16_000_000)


def test_decoder_turns_pillow_decompression_warning_into_rejection():
    with pytest.raises(ImageFetchError, match="too large"):
        decode_image(png_with_dimensions(7_000, 6_000), max_pixels=50_000_000)
