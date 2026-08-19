"""Build-time proof that the image's SPZ converter writes format **version 3**.

This runs inside `_SPLAT_IMAGE`'s build, not in a test suite, because the thing
it proves is a property of a compiled binary in a particular image — and the
alternative place to discover it is sixty minutes into a paid L4 run, which is
exactly how W2 found the previous converter defect (W2-EVIDENCE.md §4 B, §10b).

WHAT IT ASSERTS, AND WHY THAT IS THE RIGHT ASSERTION
────────────────────────────────────────────────────
Read off the pinned spz source (`src/cc/load-spz.cc` at SPZ_SOURCE_COMMIT), the
two containers are not variants of one layout — they are different files:

  version 1–3  `saveSpz` takes the `o.version < MIN_ZSTD_SPZ_HEADER_VERSION`
               branch: `serializePackedGaussians` writes a 16-byte
               `LegacyPackedGaussiansHeader` (magic `NGSP`, u32 version,
               u32 numPoints, …) followed by the attribute buffers, and the
               WHOLE stream is then gzipped. So at rest the file begins with the
               gzip magic `1f 8b`, and `NGSP`/version live at offsets 0 and 4 of
               the DECOMPRESSED bytes.

  version 4    a 32-byte plaintext `NgspFileHeader` at offset 0 (`NGSP`, u32
               version, …) followed by ZSTD streams. No outer gzip at all.

`@sparkjsdev/spark` 2.1.0 — the portal's reader, and the newest published Spark
— opens every `.spz` through a gunzip reader and then rejects any header version
outside 1–3. Both halves of the v4 container defeat it, which is why asserting
"version == 3" without also asserting "gzip at offset 0" would miss half the
contract.

The stock `ply_to_spz` is asserted to still write v4. That is not redundancy:
it is what proves the v3 assertion is measuring our `pack_options.version = 3`
and not a property the pinned library would have had anyway. If a future bump of
SPZ_SOURCE_COMMIT changes that default, this line is the one that says so.
"""

from __future__ import annotations

import argparse
import gzip
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

# `property float` names `loadSplatFromPly` requires, in the order written.
# 45 `f_rest_*` gives shDim 15 → SH degree 3, which is what splatfacto exports,
# so the smoke exercises the SH quantisation path rather than a degree-0 stub.
_SH_COEFFS = 45
_POINTS = 64

NGSP_MAGIC = b"NGSP"
GZIP_MAGIC = b"\x1f\x8b"


def write_smoke_ply(path: Path, points: int = _POINTS) -> int:
    """Write a tiny, finite, valid Gaussian-splat PLY. Returns the point count.

    Values are deliberately unremarkable and finite: `packGaussians` silently
    drops non-finite points, and a dropped point would make the numPoints
    assertion below fail for a reason that has nothing to do with the version.
    """
    names = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2"]
    names += [f"f_rest_{i}" for i in range(_SH_COEFFS)]
    names += ["opacity", "scale_0", "scale_1", "scale_2"]
    names += ["rot_0", "rot_1", "rot_2", "rot_3"]

    header = "ply\nformat binary_little_endian 1.0\n"
    header += f"element vertex {points}\n"
    header += "".join(f"property float {n}\n" for n in names)
    header += "end_header\n"

    index = {n: i for i, n in enumerate(names)}
    body = bytearray()
    for p in range(points):
        row = [0.0] * len(names)
        row[index["x"]] = 0.01 * p
        row[index["y"]] = 0.02 * p
        row[index["z"]] = 0.03 * p
        row[index["f_dc_0"]] = 0.5
        row[index["f_dc_1"]] = 0.25
        row[index["f_dc_2"]] = -0.25
        row[index["opacity"]] = 2.0
        row[index["scale_0"]] = -3.0
        row[index["scale_1"]] = -3.0
        row[index["scale_2"]] = -3.0
        row[index["rot_0"]] = 1.0  # w; the rest stay 0 → identity rotation
        body += struct.pack(f"<{len(row)}f", *row)

    path.write_bytes(header.encode("ascii") + bytes(body))
    return points


def _legacy_header(spz_bytes: bytes) -> tuple[bytes, int, int]:
    """(magic, version, numPoints) from a gzip-wrapped v1–3 file."""
    if spz_bytes[:2] != GZIP_MAGIC:
        raise AssertionError(
            f"expected a gzip container at offset 0, found {spz_bytes[:4].hex(' ')}"
        )
    raw = gzip.decompress(spz_bytes)
    if len(raw) < 16:
        raise AssertionError(f"decompressed to {len(raw)} bytes; a header is 16")
    magic = raw[0:4]
    version, num_points = struct.unpack_from("<II", raw, 4)
    return magic, version, num_points


def _ngsp_header(spz_bytes: bytes) -> tuple[bytes, int]:
    """(magic, version) from a plaintext v4 NGSP file."""
    if len(spz_bytes) < 32:
        raise AssertionError(f"file is {len(spz_bytes)} bytes; an NGSP header is 32")
    return spz_bytes[0:4], struct.unpack_from("<I", spz_bytes, 4)[0]


def _convert(binary: str, source: Path, target: Path) -> bytes:
    result = subprocess.run(
        [binary, str(source), str(target)], capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        raise AssertionError(
            f"{binary} exited {result.returncode}\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )
    if not target.is_file() or target.stat().st_size == 0:
        raise AssertionError(f"{binary} produced no output")
    return target.read_bytes()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v3-binary", default="/usr/local/bin/ply_to_spz_v3")
    parser.add_argument(
        "--stock-binary",
        default="/usr/local/bin/ply_to_spz",
        help="the unmodified pinned CLI; pass '' to skip the discrimination check",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        source = work / "smoke.ply"
        points = write_smoke_ply(source)

        produced = _convert(args.v3_binary, source, work / "smoke_v3.spz")
        magic, version, num_points = _legacy_header(produced)
        if magic != NGSP_MAGIC:
            raise AssertionError(f"magic is {magic!r}, expected {NGSP_MAGIC!r}")
        if version != 3:
            raise AssertionError(f"SPZ format version is {version}, expected 3")
        if num_points != points:
            raise AssertionError(f"header says {num_points} points, wrote {points}")
        print(
            f"[spz-smoke] {args.v3_binary}: gzip container, magic NGSP, "
            f"version 3, {num_points} points, {len(produced)} bytes — OK"
        )

        if args.stock_binary:
            stock = _convert(args.stock_binary, source, work / "smoke_stock.spz")
            stock_magic, stock_version = _ngsp_header(stock)
            if stock_magic != NGSP_MAGIC or stock_version != 4:
                raise AssertionError(
                    f"the pinned stock CLI wrote magic {stock_magic!r} version "
                    f"{stock_version}; this smoke assumes it writes plaintext v4, "
                    "which is what makes the v3 assertion above meaningful. "
                    "Re-read the pinned spz source before changing this."
                )
            print(
                f"[spz-smoke] {args.stock_binary}: plaintext NGSP, version 4 — "
                "the v3 assertion is measuring our flag, not the library default"
            )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print(f"[spz-smoke] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
