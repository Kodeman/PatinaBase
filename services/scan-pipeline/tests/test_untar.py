"""Safe tar extraction — containment rules mirror the validator's PATH_VIOLATION."""

from __future__ import annotations

import io
import os
import tarfile

import pytest

from patina_scan_worker.errors import PermanentError
from patina_scan_worker.untar import safe_extract_tar


def _make_tar(path: str, entries: dict[str, bytes]) -> None:
    with tarfile.open(path, "w") as tf:
        for name, data in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))


def test_extracts_regular_members(tmp_path):
    tar = tmp_path / "depth.tar"
    _make_tar(str(tar), {"depth/0001.bin": b"\x00\x01", "depth/0002.bin": b"\x02\x03"})
    dest = tmp_path / "out"
    names = safe_extract_tar(str(tar), str(dest))
    assert set(names) == {"depth/0001.bin", "depth/0002.bin"}
    assert (dest / "depth" / "0001.bin").read_bytes() == b"\x00\x01"


def test_rejects_absolute_member(tmp_path):
    tar = tmp_path / "bad.tar"
    _make_tar(str(tar), {"/etc/evil": b"x"})
    with pytest.raises(PermanentError) as ei:
        safe_extract_tar(str(tar), str(tmp_path / "out"))
    assert ei.value.token == "PATH_VIOLATION"


def test_rejects_parent_escape_member(tmp_path):
    tar = tmp_path / "bad.tar"
    _make_tar(str(tar), {"../escape.bin": b"x"})
    with pytest.raises(PermanentError) as ei:
        safe_extract_tar(str(tar), str(tmp_path / "out"))
    assert ei.value.token == "PATH_VIOLATION"


def test_rejects_symlink_member(tmp_path):
    tar = tmp_path / "bad.tar"
    with tarfile.open(str(tar), "w") as tf:
        link = tarfile.TarInfo("link")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        tf.addfile(link)
    with pytest.raises(PermanentError) as ei:
        safe_extract_tar(str(tar), str(tmp_path / "out"))
    assert ei.value.token == "PATH_VIOLATION"


def test_corrupt_archive_is_permanent(tmp_path):
    bad = tmp_path / "notatar.tar"
    bad.write_bytes(b"PLACEHOLDER-DEPTH-TAR\x00not-a-real-tar\x00")
    with pytest.raises(PermanentError) as ei:
        safe_extract_tar(str(bad), str(tmp_path / "out"))
    assert ei.value.token == "SCHEMA_VIOLATION"


def test_nothing_extracted_before_verification(tmp_path):
    """A tar with a good member AND a bad member extracts NOTHING (fail-closed)."""
    tar = tmp_path / "mixed.tar"
    _make_tar(str(tar), {"ok.bin": b"x", "../escape.bin": b"y"})
    dest = tmp_path / "out"
    with pytest.raises(PermanentError):
        safe_extract_tar(str(tar), str(dest))
    # the good member must not have been written (all-members-verified-first)
    assert not (dest / "ok.bin").exists()
