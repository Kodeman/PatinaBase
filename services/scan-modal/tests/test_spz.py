"""The splat-compression seam, with the subprocess faked and the gzip real.

The point of `core/spz.py` is that the CLI's exact spelling is DATA
(`SPZ_COMMAND`), not code — so the `spz` path exercises the template rendering
and the failure classification and never runs a binary. The `gzip-ply` fallback
has no binary to fake, so it is tested for real: it must produce bytes that
actually inflate back to the PLY, or it is not a fallback.
"""

from __future__ import annotations

import gzip

import pytest

from scan_modal.core.spz import (
    DEFAULT_SPZ_COMMAND,
    MODE_GZIP_PLY,
    MODE_SPZ,
    SPZ_COMMAND_ENV,
    SPZ_MODE_ENV,
    SpzError,
    compress_ply_to_spz,
    compress_splat,
    gzip_ply,
    resolve_mode,
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


def test_default_template_is_the_real_binarys_real_argv():
    """`ply_to_spz <input.ply> <output.spz>` — two positionals, no flags.

    Read off cli_tools/src/ply_to_spz.cpp in the pinned nianticlabs/spz tag the
    image builds. The previous default (`spz convert …`) named a subcommand that
    has never existed in any published version of the crate that shipped a
    binary, which is why every splat run would have failed after training.
    """
    argv = spz_argv("/w/splat.ply", "/w/room.spz", DEFAULT_SPZ_COMMAND)
    assert argv == ["/usr/local/bin/ply_to_spz", "/w/splat.ply", "/w/room.spz"]


def test_env_overrides_the_template(monkeypatch):
    monkeypatch.setenv(SPZ_COMMAND_ENV, "spz-cli encode --in {input} --out {output} -q 4")
    assert spz_argv("a.ply", "b.spz") == [
        "spz-cli", "encode", "--in", "a.ply", "--out", "b.spz", "-q", "4",
    ]


def test_substitution_is_into_argv_elements_never_a_shell_string(monkeypatch):
    """A path with a space (or anything shell-special) must stay ONE argument —
    the template is split before substitution, never after."""
    argv = spz_argv("/w/my room.ply", "/w/out.spz", DEFAULT_SPZ_COMMAND)
    assert argv == ["/usr/local/bin/ply_to_spz", "/w/my room.ply", "/w/out.spz"]


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
    assert run.calls[0][0] == "/usr/local/bin/ply_to_spz"
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


# ── mode selection ──────────────────────────────────────────────────────────


def test_the_default_mode_is_spz(monkeypatch):
    monkeypatch.delenv(SPZ_MODE_ENV, raising=False)
    assert resolve_mode() == MODE_SPZ


def test_the_env_selects_the_fallback(monkeypatch):
    monkeypatch.setenv(SPZ_MODE_ENV, MODE_GZIP_PLY)
    assert resolve_mode() == MODE_GZIP_PLY


def test_an_explicit_mode_beats_the_env(monkeypatch):
    monkeypatch.setenv(SPZ_MODE_ENV, MODE_GZIP_PLY)
    assert resolve_mode(MODE_SPZ) == MODE_SPZ


def test_an_unknown_mode_is_refused(monkeypatch):
    monkeypatch.setenv(SPZ_MODE_ENV, "brotli")
    with pytest.raises(SpzError):
        resolve_mode()


# ── the gzip-ply fallback — no fake, the real compressor ────────────────────


def test_gzip_ply_round_trips_the_exact_bytes(tmp_path):
    source = tmp_path / "splat.ply"
    payload = b"ply\nformat binary_little_endian 1.0\n" + bytes(range(256)) * 4096
    source.write_bytes(payload)

    out = gzip_ply(source, tmp_path / "room.ply.gz")

    assert gzip.decompress(out.read_bytes()) == payload
    assert out.stat().st_size < len(payload)


def test_gzip_ply_is_byte_reproducible(tmp_path):
    """The gzip header stamps mtime by default, which would make two runs of an
    unchanged splat differ in sha256 for no reason anyone could act on."""
    source = tmp_path / "splat.ply"
    source.write_bytes(b"ply\n" + b"a" * 4096)

    first = gzip_ply(source, tmp_path / "a.ply.gz").read_bytes()
    second = gzip_ply(source, tmp_path / "b.ply.gz").read_bytes()
    assert first == second


def test_gzip_ply_refuses_a_missing_input(tmp_path):
    with pytest.raises(SpzError):
        gzip_ply(tmp_path / "nope.ply", tmp_path / "out.ply.gz")


# ── compress_splat: the seam the job actually calls ─────────────────────────


def test_compress_splat_in_spz_mode_names_and_types_the_artifact(ply, tmp_path):
    run = runner_writing(tmp_path / "room.spz")
    result = compress_splat(ply, tmp_path, mode=MODE_SPZ, runner=run)

    assert result.mode == MODE_SPZ
    assert result.file_name == "room.spz"
    assert result.path == tmp_path / "room.spz"
    assert result.content_type == "application/octet-stream"
    assert result.mime == "application/octet-stream"
    assert result.content_encoding is None


def test_compress_splat_in_gzip_mode_skips_the_binary_entirely(ply, tmp_path):
    """The whole point of the fallback: the converter is not consulted."""
    calls: list = []
    result = compress_splat(ply, tmp_path, mode=MODE_GZIP_PLY,
                            runner=lambda argv, t: calls.append(argv))

    assert calls == []
    assert result.mode == MODE_GZIP_PLY
    assert result.file_name == "room.ply.gz"
    assert gzip.decompress(result.path.read_bytes()) == ply.read_bytes()


def test_compress_splat_in_gzip_mode_records_the_encoding_two_ways(ply, tmp_path):
    """R2 gets a bare Content-Type plus a Content-Encoding header; the registry
    gets a mime that says both, so the row describes the bytes on its own."""
    result = compress_splat(ply, tmp_path, mode=MODE_GZIP_PLY)

    assert result.content_type == "application/octet-stream"
    assert result.content_encoding == "gzip"
    assert result.mime == "application/octet-stream; content-encoding=gzip"


def test_compress_splat_reads_the_mode_from_the_environment(ply, tmp_path, monkeypatch):
    monkeypatch.setenv(SPZ_MODE_ENV, MODE_GZIP_PLY)
    assert compress_splat(ply, tmp_path).file_name == "room.ply.gz"


def test_compress_splat_honours_the_stem(ply, tmp_path, monkeypatch):
    monkeypatch.setenv(SPZ_MODE_ENV, MODE_GZIP_PLY)
    assert compress_splat(ply, tmp_path, stem="splat").file_name == "splat.ply.gz"
