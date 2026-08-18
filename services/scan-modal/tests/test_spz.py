"""The .ply → .spz wrapper, with the subprocess faked.

The point of `core/spz.py` is that the CLI's exact spelling is DATA
(`SPZ_COMMAND`), not code — so these tests exercise the template rendering and
the failure classification, and never run a binary.
"""

from __future__ import annotations

import pytest

from scan_modal.core.spz import (
    DEFAULT_SPZ_COMMAND,
    SPZ_COMMAND_ENV,
    SpzError,
    compress_ply_to_spz,
    spz_argv,
)


class _Result:
    def __init__(self, returncode: int = 0):
        self.returncode = returncode


@pytest.fixture
def ply(tmp_path):
    path = tmp_path / "splat.ply"
    path.write_bytes(b"ply\nformat binary_little_endian 1.0\n")
    return path


def runner_writing(output_path, payload: bytes = b"spz-bytes", returncode: int = 0):
    """A fake subprocess that does what the real CLI would: write the output."""
    calls: list[list[str]] = []

    def run(argv, timeout):
        calls.append(list(argv))
        if returncode == 0:
            output_path.write_bytes(payload)
        return _Result(returncode)

    run.calls = calls  # type: ignore[attr-defined]
    return run


# ── the argv template ───────────────────────────────────────────────────────


def test_default_template_substitutes_both_paths():
    argv = spz_argv("/w/splat.ply", "/w/room.spz", DEFAULT_SPZ_COMMAND)
    assert argv == ["spz", "convert", "/w/splat.ply", "/w/room.spz"]


def test_env_overrides_the_template(monkeypatch):
    monkeypatch.setenv(SPZ_COMMAND_ENV, "spz-cli encode --in {input} --out {output} -q 4")
    assert spz_argv("a.ply", "b.spz") == [
        "spz-cli", "encode", "--in", "a.ply", "--out", "b.spz", "-q", "4",
    ]


def test_substitution_is_into_argv_elements_never_a_shell_string(monkeypatch):
    """A path with a space (or anything shell-special) must stay ONE argument —
    the template is split before substitution, never after."""
    argv = spz_argv("/w/my room.ply", "/w/out.spz", DEFAULT_SPZ_COMMAND)
    assert argv == ["spz", "convert", "/w/my room.ply", "/w/out.spz"]


def test_a_template_missing_a_placeholder_is_refused():
    with pytest.raises(SpzError):
        spz_argv("a.ply", "b.spz", "spz convert {input}")
    with pytest.raises(SpzError):
        spz_argv("a.ply", "b.spz", "spz convert {output}")


def test_an_empty_template_is_refused():
    with pytest.raises(SpzError):
        spz_argv("a.ply", "b.spz", "   ")


# ── the conversion ──────────────────────────────────────────────────────────


def test_a_successful_conversion_returns_the_output_path(ply, tmp_path):
    out = tmp_path / "room.spz"
    run = runner_writing(out)
    assert compress_ply_to_spz(ply, out, runner=run) == out
    assert run.calls[0][0] == "spz"
    assert str(ply) in run.calls[0]


def test_a_missing_input_is_refused_before_the_binary_runs(tmp_path):
    calls: list = []
    with pytest.raises(SpzError):
        compress_ply_to_spz(tmp_path / "nope.ply", tmp_path / "out.spz",
                            runner=lambda argv, t: calls.append(argv))
    assert calls == []


def test_a_non_zero_exit_is_an_spz_error_naming_no_path(ply, tmp_path):
    out = tmp_path / "room.spz"
    with pytest.raises(SpzError) as excinfo:
        compress_ply_to_spz(ply, out, runner=runner_writing(out, returncode=3))
    message = str(excinfo.value)
    assert "3" in message
    # The workspace path never enters the message that will be persisted.
    assert str(tmp_path) not in message


def test_a_zero_exit_that_wrote_nothing_is_still_a_failure(ply, tmp_path):
    """The shape that would otherwise register a corrupt artifact as `stored`."""
    out = tmp_path / "room.spz"

    def run(argv, timeout):
        return _Result(0)

    with pytest.raises(SpzError):
        compress_ply_to_spz(ply, out, runner=run)


def test_an_empty_output_file_is_a_failure(ply, tmp_path):
    out = tmp_path / "room.spz"
    with pytest.raises(SpzError):
        compress_ply_to_spz(ply, out, runner=runner_writing(out, payload=b""))


def test_the_timeout_is_passed_through_to_the_runner(ply, tmp_path):
    out = tmp_path / "room.spz"
    seen: list[float] = []

    def run(argv, timeout):
        seen.append(timeout)
        out.write_bytes(b"x")
        return _Result(0)

    compress_ply_to_spz(ply, out, timeout=12.5, runner=run)
    assert seen == [12.5]
