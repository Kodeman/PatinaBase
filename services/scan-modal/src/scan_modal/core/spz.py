"""Gaussian-splat `.ply` → a servable compressed artifact, behind two seams.

SPZ is Niantic's compressed Gaussian-splat container — roughly 10× smaller than
the equivalent PLY, which is the entire reason a room splat is servable to a
browser at all.

WHAT W2 FOUND, AND WHY THIS FILE CHANGED SHAPE
──────────────────────────────────────────────
The first cut installed the crates.io `spz` crate and called `spz convert`.
There is no such subcommand: 0.0.5's whole CLI surface is `spz info` (which
READS an .spz), and 0.0.6 dropped the binary target entirely. The PyPI `spz`
wheel is not a fallback either — it has no cp311 wheel and its maturin-built
sdist does not import inside the image. So the image shipped with no PLY→SPZ
path at all, and every splat run would have trained for tens of minutes and
then failed at compression. See W2-EVIDENCE.md §4 B.

The converter is now Niantic's own C++ reference implementation
(github.com/nianticlabs/spz), built from a pinned tag in `_SPLAT_IMAGE`. Its
argv is two positionals and nothing else — read off `cli_tools/src/ply_to_spz.cpp`,
which is 24 lines and whose entire usage string is
`ply_to_spz <input.ply> <output.spz>`. That is a much more stable surface than a
Rust CLI in 0.0.x, but it is still a binary in an image, so it stays DATA:
`SPZ_COMMAND` is an argv template read from the environment, and everything here
is exercised with the runner faked.

THE FORMAT VERSION, WHICH IS NOT A DETAIL
─────────────────────────────────────────
The stock CLI has no version flag, so it writes `LATEST_SPZ_HEADER_VERSION` —
**4** at the pinned tag. Version 4 is a different container, not a variant:
`saveSpz` writes a 32-byte plaintext `NgspFileHeader` plus ZSTD streams, where
versions 1–3 take the `o.version < MIN_ZSTD_SPZ_HEADER_VERSION` branch and gzip
a 16-byte legacy header plus one stream. The portal's reader,
`@sparkjsdev/spark` 2.1.0, gunzips every file and then rejects any header
version outside 1–3 — and 2.1.0 is the newest published Spark, so there is no
upgrade to reach for. A v4 artifact is therefore unreadable in the viewer, which
is exactly what W2 shipped and diagnosed (W2-EVIDENCE.md §10b fault 2).

So the default is `ply_to_spz_v3` — `tools/ply_to_spz_v3.cpp`, the same 20 lines
with `pack_options.version = 3`, built against the same pinned library and
asserted at image-build time to emit gzip + magic `NGSP` + version 3
(`tools/spz_v3_smoke.py`). Version 3 loses nothing: `MIN_SMALLEST_THREE_QUATERNIONS_VERSION`
is 3, so it carries the same rotation encoding v4 does.

`SPZ_COMMAND` is a shell-free argv template. `{input}` and `{output}` are the
only substitutions, and they are substituted into ARGV ELEMENTS — never joined
into a shell string — so a path can never become an argument.

THE ESCAPE HATCH
────────────────
`SPZ_MODE=gzip-ply` skips the converter entirely and gzips the PLY instead. It
exists because the alternative to a compressor that will not build is not "no
splat" — a `.ply.gz` is ~4× smaller than the raw PLY, and the portal's Spark
reader reads PLY. The object is stored with `Content-Encoding: gzip`, so an
HTTP client inflates it transparently and receives exactly the `.ply` the
reader expects; the encoding is recorded in the registry mime so a row is
self-describing without opening the bytes.

Modes differ in three things and only three: the file name, the mime, and the
content encoding. `CompressedSplat` carries all three so the job glue never has
to branch on the mode itself.
"""

from __future__ import annotations

import os
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

__all__ = [
    "SpzError",
    "SPZ_COMMAND_ENV",
    "SPZ_MODE_ENV",
    "DEFAULT_SPZ_COMMAND",
    "MODE_SPZ",
    "MODE_GZIP_PLY",
    "SPZ_MODES",
    "CompressedSplat",
    "resolve_mode",
    "spz_argv",
    "compress_ply_to_spz",
    "gzip_ply",
    "compress_splat",
]

SPZ_COMMAND_ENV = "SPZ_COMMAND"
SPZ_MODE_ENV = "SPZ_MODE"

#: The default argv template: the repo's `ply_to_spz_v3`, input then output, no
#: flags. Spelled as an ABSOLUTE path rather than a bare name — the image's
#: PATH is rewritten twice during the build, and a converter that silently
#: resolves to something else is the failure mode this file already had once.
#: `/usr/local/bin/ply_to_spz` (the stock v4 CLI) is still installed beside it,
#: and `SPZ_COMMAND` can still name it — but only for someone who wants a v4
#: artifact deliberately, because no shipping Spark can read one.
DEFAULT_SPZ_COMMAND = "/usr/local/bin/ply_to_spz_v3 {input} {output}"

#: Convert to `.spz` with the pinned Niantic binary. The normal path.
MODE_SPZ = "spz"
#: Skip the converter; gzip the `.ply`. The escape hatch — see the docstring.
MODE_GZIP_PLY = "gzip-ply"
SPZ_MODES = (MODE_SPZ, MODE_GZIP_PLY)

# A conversion is CPU-bound and bounded by the splat's size; a hung binary must
# not hold an L4 open until the job timeout.
DEFAULT_TIMEOUT_S = 600.0

_GZIP_CHUNK = 1 << 20


class SpzError(RuntimeError):
    """The compression step did not produce a usable artifact."""


@dataclass(frozen=True)
class CompressedSplat:
    """One compressed splat, plus everything the registry row needs to describe it.

    `content_type` and `mime` are deliberately two fields. `content_type` is the
    header R2 stores, which must stay a bare type — a `Content-Type` carrying a
    `content-encoding` parameter is not what any client reads to decide whether
    to inflate. `mime` is what `media_objects` records, and it carries the
    encoding note so the row says what the bytes are without anyone fetching
    them. They differ only in `gzip-ply` mode.
    """

    path: Path
    mode: str
    file_name: str
    content_type: str
    mime: str
    content_encoding: str | None


def resolve_mode(mode: str | None = None) -> str:
    """Explicit argument wins, then `SPZ_MODE`, then `spz`."""
    resolved = (mode if mode is not None else os.environ.get(SPZ_MODE_ENV)) or MODE_SPZ
    resolved = resolved.strip()
    if resolved not in SPZ_MODES:
        raise SpzError(f"{SPZ_MODE_ENV} must be one of {', '.join(SPZ_MODES)}")
    return resolved


def spz_argv(input_path: str | Path, output_path: str | Path, template: str | None = None) -> list[str]:
    """Render the argv for one conversion. Pure — tested without a binary."""
    raw = template if template is not None else os.environ.get(SPZ_COMMAND_ENV) or DEFAULT_SPZ_COMMAND
    parts = shlex.split(raw)
    if not parts:
        raise SpzError(f"{SPZ_COMMAND_ENV} is empty")
    if "{input}" not in raw or "{output}" not in raw:
        raise SpzError(f"{SPZ_COMMAND_ENV} must contain both {{input}} and {{output}}")
    return [
        part.replace("{input}", str(input_path)).replace("{output}", str(output_path))
        for part in parts
    ]


def _run(argv: Sequence[str], timeout: float) -> Any:
    import subprocess

    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)


def _require_source(input_path: str | Path) -> Path:
    source = Path(input_path)
    if not source.is_file():
        raise SpzError(f"splat ply not found at {source.name}")
    return source


def _require_output(target: Path, what: str, source: Path) -> Path:
    # A zero-byte output is exactly the shape that would otherwise register a
    # corrupt artifact as `stored`.
    if not target.is_file() or target.stat().st_size == 0:
        raise SpzError(f"{what} produced no output for {source.name}")
    return target


def compress_ply_to_spz(
    input_path: str | Path,
    output_path: str | Path,
    template: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    runner: Callable[[Sequence[str], float], Any] | None = None,
) -> Path:
    """Convert a Gaussian-splat `.ply` to `.spz`. Returns the output path.

    `runner` is the seam: the real subprocess in production, a fake in tests.
    """
    source = _require_source(input_path)
    target = Path(output_path)
    argv = spz_argv(source, target, template)
    result = (runner or _run)(argv, timeout)

    returncode = getattr(result, "returncode", 0)
    if returncode != 0:
        # stderr can name the full workspace path; the binary's own name and the
        # exit code are the useful part and carry nothing signed.
        raise SpzError(f"{argv[0]} exited {returncode} converting {source.name}")
    return _require_output(target, argv[0], source)


def gzip_ply(input_path: str | Path, output_path: str | Path) -> Path:
    """Gzip a `.ply` in place on disk. Streamed — a room splat is hundreds of MB.

    `mtime=0` so the same PLY gzips to the same bytes on every run; the gzip
    header otherwise stamps the wall clock and quietly destroys the byte
    reproducibility the artifact registry is asked about.
    """
    import gzip

    source = _require_source(input_path)
    target = Path(output_path)
    with open(source, "rb") as raw, open(target, "wb") as out, gzip.GzipFile(
        filename="", mode="wb", fileobj=out, mtime=0
    ) as packed:
        while True:
            chunk = raw.read(_GZIP_CHUNK)
            if not chunk:
                break
            packed.write(chunk)
    return _require_output(target, "gzip", source)


def compress_splat(
    input_path: str | Path,
    work_dir: str | Path,
    stem: str = "room",
    mode: str | None = None,
    template: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    runner: Callable[[Sequence[str], float], Any] | None = None,
) -> CompressedSplat:
    """Compress a splat PLY by whichever mode this environment is configured for."""
    resolved = resolve_mode(mode)
    directory = Path(work_dir)

    if resolved == MODE_SPZ:
        target = directory / f"{stem}.spz"
        compress_ply_to_spz(input_path, target, template=template, timeout=timeout, runner=runner)
        return CompressedSplat(
            path=target,
            mode=resolved,
            file_name=target.name,
            content_type="application/octet-stream",
            mime="application/octet-stream",
            content_encoding=None,
        )

    target = directory / f"{stem}.ply.gz"
    gzip_ply(input_path, target)
    return CompressedSplat(
        path=target,
        mode=resolved,
        file_name=target.name,
        content_type="application/octet-stream",
        # Stored WITH `Content-Encoding: gzip`, so an HTTP client inflates the
        # object on the way in and the reader receives exactly the `.ply` it
        # already knows how to parse — the key's `.gz` suffix describes what is
        # at rest, not what a fetch yields.
        mime="application/octet-stream; content-encoding=gzip",
        content_encoding="gzip",
    )
