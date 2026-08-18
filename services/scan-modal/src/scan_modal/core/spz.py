"""`.ply` → `.spz` compression, behind a subprocess seam.

SPZ is Niantic's compressed Gaussian-splat container — roughly 10× smaller than
the equivalent PLY, which is the entire reason a room splat is servable to a
browser at all. SPZ 4 (May 2026) is the current generation.

WHY A SUBPROCESS AND NOT A LIBRARY CALL. The reference implementation
(`nianticlabs/spz`) is C++; the PyPI `spz` package is a Rust binding whose
published surface is "load an .spz / build splats from numpy arrays" — a
PLY→SPZ conversion entry point is not part of its documented API as of
2026-08. The dependable interface is therefore the CLI, and the CLI's exact
argument spelling is the part most likely to move under us. So it is DATA, not
code: `SPZ_COMMAND` is a template read from the environment, and everything
here is exercised in tests with the runner faked. If the CLI's spelling
changes, that is a Modal Secret / image edit, not a code change.

`SPZ_COMMAND` is a shell-free argv template. `{input}` and `{output}` are the
only substitutions, and they are substituted into ARGV ELEMENTS — never joined
into a shell string — so a path can never become an argument.
"""

from __future__ import annotations

import os
import shlex
from pathlib import Path
from typing import Any, Callable, Sequence

__all__ = ["SpzError", "SPZ_COMMAND_ENV", "DEFAULT_SPZ_COMMAND", "spz_argv", "compress_ply_to_spz"]

SPZ_COMMAND_ENV = "SPZ_COMMAND"

#: The default argv template. `spz-cli`'s `convert` subcommand, input then
#: output. Overridable per-environment without a redeploy of this package.
DEFAULT_SPZ_COMMAND = "spz convert {input} {output}"

# A conversion is CPU-bound and bounded by the splat's size; a hung binary must
# not hold an L4 open until the job timeout.
DEFAULT_TIMEOUT_S = 600.0


class SpzError(RuntimeError):
    """The .spz conversion did not produce a usable artifact."""


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


def compress_ply_to_spz(
    input_path: str | Path,
    output_path: str | Path,
    template: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    runner: Callable[[Sequence[str], float], Any] | None = None,
) -> Path:
    """Convert a Gaussian-splat `.ply` to `.spz`. Returns the output path.

    `runner` is the seam: the real subprocess in production, a fake in tests.
    A non-zero exit, a missing output file, or an empty output file are all
    failures — the CLI writing a zero-byte file on a partial read is exactly
    the shape that would otherwise register a corrupt artifact as `stored`.
    """
    source = Path(input_path)
    if not source.is_file():
        raise SpzError(f"splat ply not found at {source.name}")
    target = Path(output_path)
    argv = spz_argv(source, target, template)
    result = (runner or _run)(argv, timeout)

    returncode = getattr(result, "returncode", 0)
    if returncode != 0:
        # stderr can name the full workspace path; the binary's own name and the
        # exit code are the useful part and carry nothing signed.
        raise SpzError(f"{argv[0]} exited {returncode} converting {source.name}")
    if not target.is_file() or target.stat().st_size == 0:
        raise SpzError(f"{argv[0]} produced no .spz for {source.name}")
    return target
