#!/usr/bin/env python3
"""No-follow filesystem guard for the privileged scan-worker installer.

The installer deliberately keeps executable releases in a root-owned namespace
while delegating only cache/state/work directories to the service account.  All
mutating operations here resolve path components with directory file
descriptors and ``O_NOFOLLOW``; no privileged write follows a service-controlled
symlink.
"""

from __future__ import annotations

import argparse
import base64
import csv
import email.parser
import hashlib
import io
import json
import os
import re
import secrets
import stat
import sys
import zipfile
from pathlib import PurePath


class GuardError(RuntimeError):
    """A managed path failed the installer's trust contract."""


SOURCE_REQUIRED_DIRECTORIES = frozenset({"src", "src/patina_scan_worker"})
SOURCE_TOP_LEVEL_FILES = frozenset(
    {
        "README.md",
        "install-colmap-4.0.2.sh",
        "install-path-guard.py",
        "install-venv-lib.sh",
        "install.sh",
        "patina-scan-worker-doctor.service",
        "patina-scan-worker-nvidia-prepare.service",
        "patina-scan-worker.gpu.conf",
        "patina-scan-worker.service",
        "pycolmap-build-requirements.txt",
        "pyproject.toml",
        "scan-worker.env.example",
    }
)
SOURCE_PACKAGE_ROOT = "src/patina_scan_worker"
SOURCE_REQUIRED_PACKAGE_FILES = frozenset(
    {
        f"{SOURCE_PACKAGE_ROOT}/__init__.py",
        f"{SOURCE_PACKAGE_ROOT}/field_raster_libheif.c",
        f"{SOURCE_PACKAGE_ROOT}/field_raster_qualification.py",
        f"{SOURCE_PACKAGE_ROOT}/pycolmap_cuda_smoke.py",
        f"{SOURCE_PACKAGE_ROOT}/refine_engine.py",
    }
)

PYCOLMAP_SOURCE_COMMIT = "d927f7e518fc20afa33390712c4cc20d85b730b8"
PYCOLMAP_SOURCE_TREE = "9c381aea43304df66df991183563b659c2f712fa"
PYCOLMAP_SOURCE_PYPROJECT_SHA256 = (
    "60b1cedf70be21acc3b8e33455f4f0d482e380c1c9cab65f8598613695be5fc5"
)
PYCOLMAP_SOURCE_CMAKE_SHA256 = (
    "d6881e9110f221cbb0e725d1ff837f0a573e9e310c83447ff3bfcf9bc1c0adaa"
)
PYCOLMAP_BUILD_TAG = "1patinacu118sm75"
PYCOLMAP_MANIFEST_KEYS = frozenset(
    {
        "artifact",
        "colmapBuild",
        "cudaArchitecture",
        "cudaDeviceCount",
        "cudaVersion",
        "gpuSiftKeypoints",
        "hasCuda",
        "pythonTag",
        "schemaVersion",
        "sourceCmakeSha256",
        "sourceCommit",
        "sourcePyprojectSha256",
        "sourceTree",
        "wheelFile",
        "wheelSha256",
        "wheelSizeBytes",
    }
)


def _octal_mode(value: str) -> int:
    try:
        mode = int(value, 8)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid octal mode: {value!r}") from exc
    if mode < 0 or mode > 0o7777:
        raise argparse.ArgumentTypeError(f"invalid mode: {value!r}")
    return mode


def _absolute(path: str) -> str:
    return os.path.abspath(os.path.normpath(path))


def _contained_parts(anchor: str, target: str) -> tuple[str, str, tuple[str, ...]]:
    anchor_abs = _absolute(anchor)
    target_abs = _absolute(target)
    try:
        common = os.path.commonpath((anchor_abs, target_abs))
    except ValueError as exc:
        raise GuardError(f"path is not contained by trusted anchor: {target}") from exc
    if common != anchor_abs:
        raise GuardError(
            f"path is not contained by trusted anchor {anchor_abs}: {target_abs}"
        )
    relative = os.path.relpath(target_abs, anchor_abs)
    parts = () if relative == "." else tuple(PurePath(relative).parts)
    if any(part in ("", ".", "..") for part in parts):
        raise GuardError(f"unsafe managed path components: {target_abs}")
    return anchor_abs, target_abs, parts


def _open_directory(path: str) -> int:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    return os.open(path, flags)


def _open_child_directory(parent_fd: int, name: str) -> int:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    return os.open(name, flags, dir_fd=parent_fd)


def _fd_mount_id(file_fd: int) -> int | None:
    """Return Linux's mount ID for an fd; fail closed if Linux hides fdinfo."""

    if not sys.platform.startswith("linux"):
        return None
    try:
        with open(f"/proc/self/fdinfo/{file_fd}", encoding="ascii") as fdinfo:
            for line in fdinfo:
                key, separator, value = line.partition(":")
                if separator and key == "mnt_id":
                    return int(value.strip())
    except (OSError, ValueError) as exc:
        raise GuardError(f"cannot inspect mount identity for fd {file_fd}") from exc
    raise GuardError(f"Linux fdinfo omitted mount identity for fd {file_fd}")


def _require_trusted_directory(
    display_path: str,
    info: os.stat_result,
    *,
    uid: int,
    gid: int,
) -> None:
    if stat.S_ISLNK(info.st_mode):
        raise GuardError(f"managed directory component is a symlink: {display_path}")
    if not stat.S_ISDIR(info.st_mode):
        raise GuardError(f"managed directory component is not a directory: {display_path}")
    if info.st_uid != uid or info.st_gid != gid:
        raise GuardError(
            f"managed directory is not owned by trusted uid/gid {uid}:{gid}: "
            f"{display_path} ({info.st_uid}:{info.st_gid})"
        )
    if stat.S_IMODE(info.st_mode) & 0o022:
        raise GuardError(f"managed directory is group/world writable: {display_path}")


def _validate_trusted_tree(anchor: str, target: str, *, uid: int, gid: int) -> None:
    anchor_abs, _target_abs, parts = _contained_parts(anchor, target)
    anchor_info = os.lstat(anchor_abs)
    _require_trusted_directory(anchor_abs, anchor_info, uid=uid, gid=gid)
    current_fd = _open_directory(anchor_abs)
    current_path = anchor_abs
    try:
        for part in parts:
            current_path = os.path.join(current_path, part)
            info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)
            _require_trusted_directory(current_path, info, uid=uid, gid=gid)
            next_fd = _open_child_directory(current_fd, part)
            os.close(current_fd)
            current_fd = next_fd
    finally:
        os.close(current_fd)


def ensure_trusted_directory(
    anchor: str,
    target: str,
    *,
    uid: int,
    gid: int,
    mode: int,
    adopt_final: bool,
) -> None:
    """Create a trusted path or adopt only its final existing real directory."""

    anchor_abs, target_abs, parts = _contained_parts(anchor, target)
    anchor_info = os.lstat(anchor_abs)
    _require_trusted_directory(anchor_abs, anchor_info, uid=uid, gid=gid)
    current_fd = _open_directory(anchor_abs)
    current_path = anchor_abs
    try:
        for index, part in enumerate(parts):
            final = index == len(parts) - 1
            current_path = os.path.join(current_path, part)
            created = False
            try:
                info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)
            except FileNotFoundError:
                os.mkdir(part, 0o755 if not final else mode, dir_fd=current_fd)
                created = True
                info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)

            if stat.S_ISLNK(info.st_mode):
                raise GuardError(f"managed directory component is a symlink: {current_path}")
            if not stat.S_ISDIR(info.st_mode):
                raise GuardError(f"managed path component is not a directory: {current_path}")

            next_fd = _open_child_directory(current_fd, part)
            if created or (final and adopt_final):
                os.fchown(next_fd, uid, gid)
                os.fchmod(next_fd, mode if final else 0o755)
                info = os.fstat(next_fd)
            _require_trusted_directory(current_path, info, uid=uid, gid=gid)
            os.close(current_fd)
            current_fd = next_fd
    finally:
        os.close(current_fd)
    _validate_trusted_tree(anchor_abs, target_abs, uid=uid, gid=gid)


def ensure_owned_directory(
    anchor: str,
    target: str,
    *,
    trusted_uid: int,
    trusted_gid: int,
    owner_uid: int,
    owner_gid: int,
    mode: int,
) -> None:
    """Create/adopt a service-owned directory beneath a trusted real anchor."""

    _validate_trusted_tree(anchor, anchor, uid=trusted_uid, gid=trusted_gid)
    anchor_abs, _target_abs, parts = _contained_parts(anchor, target)
    if not parts:
        raise GuardError("refusing to delegate the trusted anchor itself")
    current_fd = _open_directory(anchor_abs)
    current_path = anchor_abs
    try:
        for part in parts:
            current_path = os.path.join(current_path, part)
            try:
                info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)
            except FileNotFoundError:
                os.mkdir(part, mode, dir_fd=current_fd)
                info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode):
                raise GuardError(f"service directory component is a symlink: {current_path}")
            if not stat.S_ISDIR(info.st_mode):
                raise GuardError(f"service path component is not a directory: {current_path}")
            next_fd = _open_child_directory(current_fd, part)
            os.fchown(next_fd, owner_uid, owner_gid)
            os.fchmod(next_fd, mode)
            os.close(current_fd)
            current_fd = next_fd
    finally:
        os.close(current_fd)


def read_trusted_file(
    root: str,
    path: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
    max_bytes: int = 1024 * 1024,
) -> bytes:
    """Read one regular marker/snapshot file without following any symlink."""

    _validate_trusted_tree(anchor, root, uid=uid, gid=gid)
    root_abs, path_abs, parts = _contained_parts(root, path)
    if not parts:
        raise GuardError(f"trusted file path names a directory: {path_abs}")
    current_fd = _open_directory(root_abs)
    current_path = root_abs
    try:
        for part in parts[:-1]:
            current_path = os.path.join(current_path, part)
            info = os.stat(part, dir_fd=current_fd, follow_symlinks=False)
            _require_trusted_directory(current_path, info, uid=uid, gid=gid)
            next_fd = _open_child_directory(current_fd, part)
            os.close(current_fd)
            current_fd = next_fd

        name = parts[-1]
        display = os.path.join(current_path, name)
        info = os.stat(name, dir_fd=current_fd, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode):
            raise GuardError(f"trusted file is a symlink: {display}")
        if not stat.S_ISREG(info.st_mode):
            raise GuardError(f"trusted file is not regular: {display}")
        if info.st_uid != uid or info.st_gid != gid:
            raise GuardError(f"trusted file is not owned by {uid}:{gid}: {display}")
        if stat.S_IMODE(info.st_mode) & 0o022:
            raise GuardError(f"trusted file is group/world writable: {display}")
        if info.st_size > max_bytes:
            raise GuardError(
                f"trusted file exceeds {max_bytes} byte safety limit: {display}"
            )
        file_fd = os.open(
            name,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=current_fd,
        )
        try:
            opened = os.fstat(file_fd)
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise GuardError(f"trusted file changed during open: {display}")
            chunks: list[bytes] = []
            remaining = max_bytes + 1
            while remaining > 0:
                chunk = os.read(file_fd, min(65536, remaining))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            data = b"".join(chunks)
            if len(data) > max_bytes:
                raise GuardError(
                    f"trusted file exceeds {max_bytes} byte safety limit: {display}"
                )
            return data
        finally:
            os.close(file_fd)
    finally:
        os.close(current_fd)


def validate_trusted_executable(
    path: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    """Return the canonical path for a privileged executable after validation."""

    if not os.path.isabs(path):
        raise GuardError(f"trusted executable path must be absolute: {path}")

    path_abs = _absolute(path)
    _validate_trusted_tree(anchor, os.path.dirname(path_abs), uid=uid, gid=gid)
    link_info = os.lstat(path_abs)
    if not (stat.S_ISREG(link_info.st_mode) or stat.S_ISLNK(link_info.st_mode)):
        raise GuardError(f"trusted executable is not regular or a symlink: {path_abs}")
    if link_info.st_uid != uid or link_info.st_gid != gid:
        raise GuardError(f"trusted executable path is not owned by {uid}:{gid}: {path_abs}")

    target = os.path.realpath(path_abs)
    _contained_parts(anchor, target)
    _validate_trusted_tree(anchor, os.path.dirname(target), uid=uid, gid=gid)
    target_info = os.lstat(target)
    if not stat.S_ISREG(target_info.st_mode):
        raise GuardError(f"trusted executable target is not regular: {target}")
    if target_info.st_uid != uid or target_info.st_gid != gid:
        raise GuardError(f"trusted executable target is not owned by {uid}:{gid}: {target}")
    if stat.S_IMODE(target_info.st_mode) & 0o022:
        raise GuardError(f"trusted executable target is group/world writable: {target}")
    if not stat.S_IMODE(target_info.st_mode) & 0o111:
        raise GuardError(f"trusted executable target is not executable: {target}")
    return target


def _release_name(path: str, app_dir: str) -> str:
    app_abs = _absolute(app_dir)
    path_abs = _absolute(path)
    if os.path.dirname(path_abs) != app_abs:
        raise GuardError(f"release is not contained directly by {app_abs}: {path_abs}")
    name = os.path.basename(path_abs)
    if not name.startswith(".venv.release.") or len(name) <= len(".venv.release."):
        raise GuardError(f"unmanaged release name: {name!r}")
    if any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for character in name):
        raise GuardError(f"unsafe release name: {name!r}")
    return name


def _quarantine_name(path: str, app_dir: str) -> str:
    app_abs = _absolute(app_dir)
    path_abs = _absolute(path)
    if os.path.dirname(path_abs) != app_abs:
        raise GuardError(
            f"legacy quarantine is not contained directly by {app_abs}: {path_abs}"
        )
    name = os.path.basename(path_abs)
    prefix = ".venv.quarantine."
    if not name.startswith(prefix) or len(name) <= len(prefix):
        raise GuardError(f"unmanaged legacy quarantine name: {name!r}")
    if any(
        character
        not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
        for character in name
    ):
        raise GuardError(f"unsafe legacy quarantine name: {name!r}")
    return name


def generate_release_path(app_dir: str, *, anchor: str, uid: int, gid: int) -> str:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    for _ in range(128):
        candidate = os.path.join(_absolute(app_dir), f".venv.release.{secrets.token_hex(12)}")
        if not os.path.lexists(candidate):
            return candidate
    raise GuardError("could not allocate a unique release name")


def generate_quarantine_path(
    app_dir: str, *, anchor: str, uid: int, gid: int
) -> str:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    for _ in range(128):
        candidate = os.path.join(
            _absolute(app_dir), f".venv.quarantine.{secrets.token_hex(12)}"
        )
        if not os.path.lexists(candidate):
            return candidate
    raise GuardError("could not allocate a unique legacy quarantine name")


def quarantine_legacy_release(
    app_dir: str,
    source: str,
    quarantine: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    """Durably move exact legacy .venv aside without ever trusting its contents."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    app_abs = _absolute(app_dir)
    source_abs = _absolute(source)
    if source_abs != os.path.join(app_abs, ".venv"):
        raise GuardError(f"legacy source must be the exact stable .venv path: {source_abs}")
    quarantine_name = _quarantine_name(quarantine, app_abs)
    app_fd = _open_directory(app_abs)
    source_fd = -1
    try:
        source_info = os.stat(".venv", dir_fd=app_fd, follow_symlinks=False)
        if stat.S_ISLNK(source_info.st_mode) or not stat.S_ISDIR(source_info.st_mode):
            raise GuardError(f"legacy source is not a real directory: {source_abs}")
        try:
            os.stat(quarantine_name, dir_fd=app_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise GuardError(f"legacy quarantine already exists: {quarantine}")
        source_fd = _open_child_directory(app_fd, ".venv")
        opened = os.fstat(source_fd)
        if (opened.st_dev, opened.st_ino) != (source_info.st_dev, source_info.st_ino):
            raise GuardError("legacy source changed during ownership handoff")
        app_info = os.fstat(app_fd)
        if opened.st_dev != app_info.st_dev or _fd_mount_id(
            source_fd
        ) != _fd_mount_id(app_fd):
            raise GuardError("legacy source is a mounted filesystem")
        # Seal the exact directory inode before rename. A crash on either side
        # of rename therefore leaves a fail-closed root that a later service-UID
        # process cannot traverse or use to move descendants during cleanup.
        os.fchown(source_fd, uid, gid)
        os.fchmod(source_fd, 0o700)
        os.fsync(source_fd)
        os.rename(
            ".venv",
            quarantine_name,
            src_dir_fd=app_fd,
            dst_dir_fd=app_fd,
        )
        moved = os.stat(quarantine_name, dir_fd=app_fd, follow_symlinks=False)
        if (moved.st_dev, moved.st_ino) != (source_info.st_dev, source_info.st_ino):
            raise GuardError("legacy quarantine changed during rename")
        still_open = os.fstat(source_fd)
        if (still_open.st_dev, still_open.st_ino) != (moved.st_dev, moved.st_ino):
            raise GuardError("legacy quarantine changed across rename")
        os.fsync(app_fd)
    finally:
        if source_fd >= 0:
            os.close(source_fd)
        os.close(app_fd)
    return os.path.join(app_abs, quarantine_name)


def remove_legacy_quarantine(
    app_dir: str,
    quarantine: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> None:
    """Durably remove only a validated, unreferenced raw legacy quarantine."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    app_abs = _absolute(app_dir)
    quarantine_name = _quarantine_name(quarantine, app_abs)
    app_fd = _open_directory(app_abs)
    try:
        try:
            info = os.stat(quarantine_name, dir_fd=app_fd, follow_symlinks=False)
        except FileNotFoundError:
            # Absence may be the observable half of an interrupted prior rmdir.
            # Flush the parent before the transaction marker can be discarded.
            os.fsync(app_fd)
            return
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise GuardError(
                f"legacy quarantine is not a real directory: {quarantine}"
            )
        if info.st_uid != uid or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o700:
            raise GuardError(
                f"legacy quarantine root is not trusted-owner mode 0700: {quarantine}"
            )
        _remove_tree_entry(app_fd, quarantine_name, quarantine)
        os.fsync(app_fd)
    finally:
        os.close(app_fd)


def seal_legacy_quarantine(
    app_dir: str,
    quarantine: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> None:
    """Idempotently seal an inferred post-rename quarantine before readiness."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    app_abs = _absolute(app_dir)
    quarantine_name = _quarantine_name(quarantine, app_abs)
    app_fd = _open_directory(app_abs)
    quarantine_fd = -1
    try:
        info = os.stat(quarantine_name, dir_fd=app_fd, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise GuardError(
                f"legacy quarantine is not a real directory: {quarantine}"
            )
        quarantine_fd = _open_child_directory(app_fd, quarantine_name)
        opened = os.fstat(quarantine_fd)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise GuardError("legacy quarantine changed during sealing")
        app_info = os.fstat(app_fd)
        if opened.st_dev != app_info.st_dev or _fd_mount_id(
            quarantine_fd
        ) != _fd_mount_id(app_fd):
            raise GuardError("legacy quarantine is a mounted filesystem")
        os.fchown(quarantine_fd, uid, gid)
        os.fchmod(quarantine_fd, 0o700)
        os.fsync(quarantine_fd)
        os.fsync(app_fd)
    finally:
        if quarantine_fd >= 0:
            os.close(quarantine_fd)
        os.close(app_fd)


def _remove_tree_entry(
    parent_fd: int,
    name: str,
    display: str,
    *,
    expected_device: int | None = None,
    expected_mount_id: int | None = None,
) -> None:
    """Delete an untrusted tree with no-follow dirfds (Python 3.10 compatible)."""

    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if expected_device is None:
        expected_device = info.st_dev
    elif info.st_dev != expected_device:
        raise GuardError(
            f"legacy quarantine crosses a mounted filesystem: {display}"
        )
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        os.unlink(name, dir_fd=parent_fd)
        return

    child_fd = _open_child_directory(parent_fd, name)
    try:
        opened = os.fstat(child_fd)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise GuardError(f"legacy quarantine changed during cleanup: {display}")
        mount_id = _fd_mount_id(child_fd)
        if expected_mount_id is None:
            expected_mount_id = mount_id
        elif mount_id != expected_mount_id:
            raise GuardError(
                f"legacy quarantine crosses a mounted filesystem: {display}"
            )
        for child in sorted(os.listdir(child_fd)):
            _remove_tree_entry(
                child_fd,
                child,
                os.path.join(display, child),
                expected_device=expected_device,
                expected_mount_id=expected_mount_id,
            )
        os.fsync(child_fd)
    finally:
        os.close(child_fd)
    os.rmdir(name, dir_fd=parent_fd)


def create_release(
    app_dir: str,
    path: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> None:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    name = _release_name(path, app_dir)
    app_fd = _open_directory(_absolute(app_dir))
    try:
        # Keep an unpublished candidate untraversable by the live service while
        # root creates the venv and runs pip inside it. ``harden-release`` is
        # the sole publication boundary that later converts directories to
        # 0755 after dependency validation has completed.
        os.mkdir(name, 0o700, dir_fd=app_fd)
        release_fd = _open_child_directory(app_fd, name)
        try:
            os.fchown(release_fd, uid, gid)
            os.fchmod(release_fd, 0o700)
            os.fsync(release_fd)
        finally:
            os.close(release_fd)
        os.fsync(app_fd)
    finally:
        os.close(app_fd)


def install_runtime_stub(
    app_dir: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> None:
    """Atomically neutralize a legacy co-located installer with a fresh inode."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    app_fd = _open_directory(_absolute(app_dir))
    temporary = f".install.sh.runtime-only.{secrets.token_hex(12)}"
    stub = (
        b"#!/bin/bash -p\n"
        b"printf '%s\\n' 'ERROR: runtime APP_DIR is not installer source.' >&2\n"
        b"printf '%s\\n' 'Run /opt/patina/scan-pipeline-source/install.sh instead.' >&2\n"
        b"exit 2\n"
    )
    stub_fd = -1
    try:
        stub_fd = os.open(
            temporary,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0),
            0o600,
            dir_fd=app_fd,
        )
        os.fchown(stub_fd, uid, gid)
        os.fchmod(stub_fd, 0o755)
        written = 0
        while written < len(stub):
            written += os.write(stub_fd, stub[written:])
        os.fsync(stub_fd)
        os.close(stub_fd)
        stub_fd = -1
        os.replace(
            temporary,
            "install.sh",
            src_dir_fd=app_fd,
            dst_dir_fd=app_fd,
        )
        os.fsync(app_fd)
    finally:
        if stub_fd >= 0:
            os.close(stub_fd)
        try:
            os.unlink(temporary, dir_fd=app_fd)
        except FileNotFoundError:
            pass
        os.close(app_fd)


def _resolve_release_target(
    app_dir: str,
    path: str,
    *,
    stable_link: bool,
    uid: int,
    gid: int,
) -> str:
    path_abs = _absolute(path)
    if stable_link:
        info = os.lstat(path_abs)
        if not stat.S_ISLNK(info.st_mode):
            raise GuardError(f"managed stable release is not a symlink: {path_abs}")
        if info.st_uid != uid or info.st_gid != gid:
            raise GuardError(f"managed release symlink is not trusted-owner: {path_abs}")
        raw_target = os.readlink(path_abs)
        target = _absolute(
            raw_target if os.path.isabs(raw_target) else os.path.join(os.path.dirname(path_abs), raw_target)
        )
    else:
        target = path_abs
    _release_name(target, app_dir)
    return target


def resolve_release_link(
    app_dir: str,
    path: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    """Canonicalize a stable release symlink without trusting process cwd."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    return _resolve_release_target(
        app_dir,
        path,
        stable_link=True,
        uid=uid,
        gid=gid,
    )


def _harden_entry(parent_fd: int, name: str, *, uid: int, gid: int) -> None:
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if stat.S_ISLNK(info.st_mode):
        os.chown(name, uid, gid, dir_fd=parent_fd, follow_symlinks=False)
        return
    if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
        raise GuardError(f"release contains unsupported filesystem object: {name}")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    if stat.S_ISDIR(info.st_mode):
        flags |= getattr(os, "O_DIRECTORY", 0)
    entry_fd = os.open(name, flags, dir_fd=parent_fd)
    try:
        os.fchown(entry_fd, uid, gid)
        if stat.S_ISDIR(info.st_mode):
            hardened_mode = 0o755
        elif stat.S_IMODE(info.st_mode) & 0o111:
            hardened_mode = 0o755
        else:
            hardened_mode = 0o644
        os.fchmod(entry_fd, hardened_mode)
        # pip has only closed these files; closing does not make their data or
        # normalized metadata durable. Flush every regular file/directory
        # before the release root can be published and the transaction can
        # later reach its durable committed state.
        os.fsync(entry_fd)
    finally:
        os.close(entry_fd)


def _require_source_entry(
    parent_fd: int,
    name: str,
    display: str,
    *,
    directory: bool,
    uid: int,
    gid: int,
) -> None:
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if stat.S_ISLNK(info.st_mode):
        raise GuardError(f"installer source entry is a symlink: {display}")
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected_type(info.st_mode):
        expected = "directory" if directory else "regular file"
        raise GuardError(f"installer source entry is not a {expected}: {display}")
    if info.st_uid != uid or info.st_gid != gid:
        raise GuardError(
            f"installer source entry is not owned by {uid}:{gid}: {display}"
        )
    if stat.S_IMODE(info.st_mode) & 0o022:
        raise GuardError(f"installer source entry is group/world writable: {display}")
    if not directory and info.st_nlink != 1:
        raise GuardError(f"installer source file has a hardlink: {display}")

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    if directory:
        flags |= getattr(os, "O_DIRECTORY", 0)
    entry_fd = os.open(name, flags, dir_fd=parent_fd)
    try:
        opened = os.fstat(entry_fd)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise GuardError(f"installer source entry changed during open: {display}")
    finally:
        os.close(entry_fd)


def validate_source_tree(
    source_dir: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> None:
    """Require a closed, immutable snapshot of every install/build input."""

    _validate_trusted_tree(anchor, source_dir, uid=uid, gid=gid)
    source_abs = _absolute(source_dir)
    seen_required_directories: set[str] = set()
    seen_top_level_files: set[str] = set()
    seen_required_package_files: set[str] = set()
    for current, directories, files, current_fd in os.fwalk(
        source_abs, topdown=True, follow_symlinks=False
    ):
        relative_root = os.path.relpath(current, source_abs)
        for name in directories:
            relative = name if relative_root == "." else os.path.join(relative_root, name)
            if relative in SOURCE_REQUIRED_DIRECTORIES:
                seen_required_directories.add(relative)
            elif relative.startswith(f"{SOURCE_PACKAGE_ROOT}{os.sep}") and name.isidentifier():
                pass
            else:
                raise GuardError(f"unexpected installer source directory: {relative}")
            _require_source_entry(
                current_fd,
                name,
                relative,
                directory=True,
                uid=uid,
                gid=gid,
            )
        for name in files:
            relative = name if relative_root == "." else os.path.join(relative_root, name)
            if relative_root == "." and relative in SOURCE_TOP_LEVEL_FILES:
                seen_top_level_files.add(relative)
            elif relative.startswith(f"{SOURCE_PACKAGE_ROOT}{os.sep}") and (
                name.endswith(".py")
                or relative == f"{SOURCE_PACKAGE_ROOT}{os.sep}field_raster_libheif.c"
            ):
                if relative in SOURCE_REQUIRED_PACKAGE_FILES:
                    seen_required_package_files.add(relative)
            else:
                raise GuardError(f"unexpected installer source file: {relative}")
            _require_source_entry(
                current_fd,
                name,
                relative,
                directory=False,
                uid=uid,
                gid=gid,
            )
    missing_directories = sorted(
        SOURCE_REQUIRED_DIRECTORIES - seen_required_directories
    )
    missing_files = sorted(SOURCE_TOP_LEVEL_FILES - seen_top_level_files)
    missing_files.extend(
        sorted(SOURCE_REQUIRED_PACKAGE_FILES - seen_required_package_files)
    )
    if missing_directories or missing_files:
        missing = ", ".join((*missing_directories, *missing_files))
        raise GuardError(f"installer source snapshot is incomplete: {missing}")


def _validate_pycolmap_wheel(
    wheel_fd: int,
    *,
    wheel_name: str,
    python_tag: str,
) -> None:
    """Validate distribution metadata without extracting the held wheel fd."""

    expected_name = (
        f"pycolmap-4.0.2-{PYCOLMAP_BUILD_TAG}-{python_tag}-linux_x86_64.whl"
    )
    if wheel_name != expected_name:
        raise GuardError(f"unexpected PyCOLMAP wheel filename: {wheel_name!r}")
    with os.fdopen(os.dup(wheel_fd), "rb") as stream:
        try:
            archive = zipfile.ZipFile(stream)
        except zipfile.BadZipFile as exc:
            raise GuardError("PyCOLMAP artifact wheel is not a valid ZIP archive") from exc
        with archive:
            infos = archive.infolist()
            names = [info.filename for info in infos]
            if len(infos) > 10_000 or len(names) != len(set(names)):
                raise GuardError("PyCOLMAP wheel has too many or duplicate entries")
            if sum(info.file_size for info in infos) > 1024 * 1024 * 1024:
                raise GuardError("PyCOLMAP wheel expands beyond the 1 GiB safety limit")
            for info in infos:
                parts = info.filename.split("/")
                mode = info.external_attr >> 16
                if (
                    info.is_dir()
                    or info.filename.startswith("/")
                    or "\\" in info.filename
                    or any(part in ("", ".", "..") for part in parts)
                    or stat.S_IFMT(mode) not in (0, stat.S_IFREG)
                ):
                    raise GuardError(
                        f"PyCOLMAP wheel has an unsafe entry: {info.filename!r}"
                    )

            dist_info = "pycolmap-4.0.2.dist-info"
            if any(
                not (
                    name.startswith("pycolmap/")
                    or name.startswith(f"{dist_info}/")
                )
                for name in names
            ):
                raise GuardError("PyCOLMAP wheel contains an unexpected import root")
            dist_roots = {
                name.split("/", 1)[0]
                for name in names
                if ".dist-info/" in name
            }
            if dist_roots != {dist_info}:
                raise GuardError(
                    f"PyCOLMAP wheel has unexpected dist-info roots: {dist_roots!r}"
                )
            metadata_name = f"{dist_info}/METADATA"
            wheel_metadata_name = f"{dist_info}/WHEEL"
            record_name = f"{dist_info}/RECORD"
            required = {
                metadata_name,
                wheel_metadata_name,
                record_name,
                "pycolmap/__init__.py",
            }
            if not required.issubset(names):
                raise GuardError("PyCOLMAP wheel omits required package metadata")
            allowed_dist_info = required | {f"{dist_info}/licenses/COPYING.txt"}
            if any(
                name.startswith(f"{dist_info}/") and name not in allowed_dist_info
                for name in names
            ):
                raise GuardError("PyCOLMAP wheel has unexpected dist-info payload")
            core_names = [
                name
                for name in names
                if re.fullmatch(
                    r"pycolmap/_core\.cpython-312-x86_64-linux-gnu\.so", name
                )
            ]
            if len(core_names) != 1:
                raise GuardError("PyCOLMAP wheel must contain the exact CPython 3.12 core")

            try:
                metadata_text = archive.read(metadata_name).decode("utf-8")
                wheel_text = archive.read(wheel_metadata_name).decode("utf-8")
                record_text = archive.read(record_name).decode("utf-8")
            except (KeyError, UnicodeDecodeError) as exc:
                raise GuardError("PyCOLMAP wheel metadata is unreadable") from exc
            metadata = email.parser.Parser().parsestr(metadata_text)
            if metadata.get_all("Name") != ["pycolmap"]:
                raise GuardError("PyCOLMAP wheel METADATA Name must be pycolmap")
            if metadata.get_all("Version") != ["4.0.2"]:
                raise GuardError("PyCOLMAP wheel METADATA Version must be 4.0.2")
            if metadata.get_all("Requires-Dist") != ["numpy"]:
                raise GuardError("PyCOLMAP wheel must declare only Requires-Dist: numpy")
            wheel_metadata = email.parser.Parser().parsestr(wheel_text)
            if wheel_metadata.get_all("Build") != [PYCOLMAP_BUILD_TAG]:
                raise GuardError("PyCOLMAP wheel WHEEL Build tag is not qualified")
            expected_tag = f"{python_tag}-linux_x86_64"
            if wheel_metadata.get_all("Tag") != [expected_tag]:
                raise GuardError(
                    f"PyCOLMAP wheel WHEEL Tag must be {expected_tag!r}"
                )
            if wheel_metadata.get_all("Root-Is-Purelib") != ["false"]:
                raise GuardError("PyCOLMAP wheel must be a platform wheel")

            try:
                record_rows = list(csv.reader(io.StringIO(record_text), strict=True))
            except (csv.Error, UnicodeError) as exc:
                raise GuardError("PyCOLMAP wheel RECORD is invalid CSV") from exc
            if any(len(row) != 3 for row in record_rows):
                raise GuardError("PyCOLMAP wheel RECORD rows must have three columns")
            record = {row[0]: (row[1], row[2]) for row in record_rows}
            if len(record) != len(record_rows) or set(record) != set(names):
                raise GuardError("PyCOLMAP wheel RECORD does not cover the archive exactly")
            if record.get(record_name) != ("", ""):
                raise GuardError("PyCOLMAP wheel RECORD must leave its own digest empty")
            for required_hash in (*core_names, metadata_name, wheel_metadata_name):
                digest, size = record[required_hash]
                if not digest.startswith("sha256=") or not size.isdecimal():
                    raise GuardError(
                        f"PyCOLMAP wheel RECORD omits digest/size for {required_hash}"
                    )
            info_by_name = {info.filename: info for info in infos}
            for name, (record_digest, record_size) in record.items():
                if name == record_name:
                    continue
                info = info_by_name[name]
                if record_size != str(info.file_size):
                    raise GuardError(f"PyCOLMAP wheel RECORD size mismatch for {name}")
                hasher = hashlib.sha256()
                with archive.open(info, "r") as member:
                    while chunk := member.read(1024 * 1024):
                        hasher.update(chunk)
                encoded = base64.urlsafe_b64encode(hasher.digest()).rstrip(b"=")
                if record_digest != "sha256=" + encoded.decode("ascii"):
                    raise GuardError(f"PyCOLMAP wheel RECORD digest mismatch for {name}")


def validate_pycolmap_artifact(
    artifact_dir: str,
    expected_python_tag: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    """Return the only wheel in a closed, immutable CUDA artifact directory."""

    if expected_python_tag != "cp312-cp312":
        raise GuardError(
            "DeskDev PyCOLMAP artifact supports only CPython 3.12 "
            f"(got {expected_python_tag!r})"
        )
    _validate_trusted_tree(anchor, artifact_dir, uid=uid, gid=gid)
    artifact_abs = _absolute(artifact_dir)
    wheel_name = (
        f"pycolmap-4.0.2-{PYCOLMAP_BUILD_TAG}-"
        f"{expected_python_tag}-linux_x86_64.whl"
    )
    expected_entries = {"artifact.json", wheel_name}
    directory_fd = _open_directory(artifact_abs)
    try:
        entries = set(os.listdir(directory_fd))
        if entries != expected_entries:
            raise GuardError(
                "PyCOLMAP artifact must contain exactly artifact.json and "
                f"{wheel_name}; got {sorted(entries)!r}"
            )

        def inspect_entry(
            name: str,
            *,
            max_bytes: int,
            retain_bytes: bool,
            validate_wheel: bool = False,
        ) -> tuple[bytes | None, os.stat_result, str]:
            display = os.path.join(artifact_abs, name)
            before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
                raise GuardError(f"PyCOLMAP artifact entry is not regular: {display}")
            if before.st_uid != uid or before.st_gid != gid:
                raise GuardError(
                    f"PyCOLMAP artifact entry is not owned by {uid}:{gid}: {display}"
                )
            if stat.S_IMODE(before.st_mode) & 0o022:
                raise GuardError(
                    f"PyCOLMAP artifact entry is group/world writable: {display}"
                )
            if before.st_nlink != 1:
                raise GuardError(f"PyCOLMAP artifact entry has a hardlink: {display}")
            if before.st_size > max_bytes:
                raise GuardError(
                    f"PyCOLMAP artifact entry exceeds {max_bytes} bytes: {display}"
                )
            entry_fd = os.open(
                name,
                os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
                dir_fd=directory_fd,
            )
            try:
                opened = os.fstat(entry_fd)
                if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
                    raise GuardError(f"PyCOLMAP artifact entry changed: {display}")
                chunks: list[bytes] | None = [] if retain_bytes else None
                digest = hashlib.sha256()
                total = 0
                while True:
                    chunk = os.read(entry_fd, 1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise GuardError(
                            f"PyCOLMAP artifact entry exceeds {max_bytes} bytes: {display}"
                        )
                    digest.update(chunk)
                    if chunks is not None:
                        chunks.append(chunk)
                if validate_wheel:
                    os.lseek(entry_fd, 0, os.SEEK_SET)
                    _validate_pycolmap_wheel(
                        entry_fd,
                        wheel_name=wheel_name,
                        python_tag=expected_python_tag,
                    )
                after = os.fstat(entry_fd)
                identity = lambda value: (
                    value.st_dev,
                    value.st_ino,
                    value.st_mode,
                    value.st_size,
                    value.st_mtime_ns,
                    value.st_ctime_ns,
                    value.st_nlink,
                )
                if identity(after) != identity(before):
                    raise GuardError(f"PyCOLMAP artifact entry changed while read: {display}")
                return (
                    b"".join(chunks) if chunks is not None else None,
                    after,
                    digest.hexdigest(),
                )
            finally:
                os.close(entry_fd)

        manifest_bytes, _manifest_info, _manifest_sha = inspect_entry(
            "artifact.json", max_bytes=64 * 1024, retain_bytes=True
        )
        assert manifest_bytes is not None
        try:
            manifest = json.loads(manifest_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GuardError("PyCOLMAP artifact manifest is not valid UTF-8 JSON") from exc
        if not isinstance(manifest, dict) or set(manifest) != PYCOLMAP_MANIFEST_KEYS:
            raise GuardError("PyCOLMAP artifact manifest has an unexpected schema")
        canonical = (
            json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode("utf-8")
        if manifest_bytes != canonical:
            raise GuardError("PyCOLMAP artifact manifest is not canonical JSON")

        exact = {
            "artifact": "pycolmap-4.0.2-cuda118-sm75",
            "colmapBuild": "Commit d927f7e on 2026-03-18 with CUDA",
            "cudaArchitecture": "75",
            "cudaVersion": "11.8",
            "hasCuda": True,
            "pythonTag": expected_python_tag,
            "schemaVersion": 1,
            "sourceCmakeSha256": PYCOLMAP_SOURCE_CMAKE_SHA256,
            "sourceCommit": PYCOLMAP_SOURCE_COMMIT,
            "sourcePyprojectSha256": PYCOLMAP_SOURCE_PYPROJECT_SHA256,
            "sourceTree": PYCOLMAP_SOURCE_TREE,
            "wheelFile": wheel_name,
        }
        for key, expected in exact.items():
            actual = manifest.get(key)
            if type(actual) is not type(expected) or actual != expected:
                raise GuardError(
                    f"PyCOLMAP artifact manifest {key} must be {expected!r}"
                )
        for key, minimum in (("cudaDeviceCount", 1), ("gpuSiftKeypoints", 40)):
            value = manifest.get(key)
            if type(value) is not int or value < minimum:
                raise GuardError(
                    f"PyCOLMAP artifact manifest {key} must be an integer >= {minimum}"
                )
        wheel_sha = manifest.get("wheelSha256")
        if not isinstance(wheel_sha, str) or re.fullmatch(r"[0-9a-f]{64}", wheel_sha) is None:
            raise GuardError("PyCOLMAP artifact manifest wheelSha256 is invalid")
        wheel_size = manifest.get("wheelSizeBytes")
        if type(wheel_size) is not int or not (1 <= wheel_size <= 512 * 1024 * 1024):
            raise GuardError("PyCOLMAP artifact manifest wheelSizeBytes is invalid")

        _wheel_bytes, wheel_info, actual_wheel_sha = inspect_entry(
            wheel_name,
            max_bytes=512 * 1024 * 1024,
            retain_bytes=False,
            validate_wheel=True,
        )
        if wheel_info.st_size != wheel_size:
            raise GuardError("PyCOLMAP artifact wheel size does not match manifest")
        if actual_wheel_sha != wheel_sha:
            raise GuardError("PyCOLMAP artifact wheel hash does not match manifest")
    finally:
        os.close(directory_fd)
    return os.path.join(artifact_abs, wheel_name)


def _validate_release_tree(path: str, *, uid: int, gid: int) -> None:
    for current, directories, files, current_fd in os.fwalk(path, topdown=True, follow_symlinks=False):
        root_info = os.fstat(current_fd)
        _require_trusted_directory(current, root_info, uid=uid, gid=gid)
        for name in (*directories, *files):
            info = os.stat(name, dir_fd=current_fd, follow_symlinks=False)
            display = os.path.join(current, name)
            if info.st_uid != uid or info.st_gid != gid:
                raise GuardError(f"release entry is not trusted-owner: {display}")
            if not stat.S_ISLNK(info.st_mode) and stat.S_IMODE(info.st_mode) & 0o022:
                raise GuardError(f"release entry is group/world writable: {display}")


_PYTHON_LAUNCHER = re.compile(r"python(?:\d+(?:\.\d+)*)?")


def _snapshot_identity(info: os.stat_result) -> tuple[int, int, int, int, int, int]:
    """Fields a service-controlled source cannot change without detection."""

    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def _write_all(file_fd: int, data: bytes) -> None:
    offset = 0
    while offset < len(data):
        written = os.write(file_fd, data[offset:])
        if written <= 0:
            raise GuardError("short write while materializing legacy release")
        offset += written


def _is_python_launcher(relative_path: str) -> bool:
    parent, name = os.path.split(relative_path)
    return parent == "bin" and _PYTHON_LAUNCHER.fullmatch(name) is not None


def _materialized_symlink_target(
    relative_path: str,
    raw_target: str,
    *,
    interpreter: str,
    anchor: str,
    uid: int,
    gid: int,
) -> tuple[str, str]:
    """Return (target-to-create, lexical-kind) for one legacy symlink."""

    if not raw_target:
        raise GuardError(f"legacy release contains an empty symlink: {relative_path}")
    if os.path.isabs(raw_target):
        if not _is_python_launcher(relative_path):
            raise GuardError(
                f"legacy release symlink escapes the release: {relative_path} -> {raw_target}"
            )
        resolved = validate_trusted_executable(
            raw_target,
            anchor=anchor,
            uid=uid,
            gid=gid,
        )
        if resolved != interpreter:
            raise GuardError(
                "legacy Python launcher does not resolve to the selected trusted "
                f"interpreter: {relative_path} -> {resolved} (expected {interpreter})"
            )
        # Remove a second alias race: the materialized link points straight at
        # the already-canonical, trusted executable rather than retaining a
        # potentially mutable intermediate path such as /usr/bin/python3.
        return interpreter, "external-interpreter"

    parent = os.path.dirname(relative_path)
    normalized = os.path.normpath(os.path.join(parent, raw_target))
    if normalized == os.pardir or normalized.startswith(f"{os.pardir}{os.sep}"):
        raise GuardError(
            f"legacy release symlink escapes lexically: {relative_path} -> {raw_target}"
        )
    return raw_target, "internal"


def _copy_legacy_regular(
    source_fd: int,
    destination_fd: int,
    name: str,
    display: str,
    initial: os.stat_result,
    *,
    uid: int,
    gid: int,
    source_mount_id: int | None,
) -> None:
    source_file = os.open(
        name,
        os.O_RDONLY
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_CLOEXEC", 0),
        dir_fd=source_fd,
    )
    destination_file = -1
    try:
        opened = os.fstat(source_file)
        if not stat.S_ISREG(opened.st_mode) or (
            opened.st_dev,
            opened.st_ino,
        ) != (initial.st_dev, initial.st_ino):
            raise GuardError(f"legacy release file changed during open: {display}")
        if _fd_mount_id(source_file) != source_mount_id:
            raise GuardError(
                f"legacy release crosses a mounted filesystem: {display}"
            )

        mode = 0o755 if stat.S_IMODE(initial.st_mode) & 0o111 else 0o644
        destination_file = os.open(
            name,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_CLOEXEC", 0),
            mode,
            dir_fd=destination_fd,
        )
        os.fchown(destination_file, uid, gid)
        os.fchmod(destination_file, mode)

        copied = 0
        while copied <= initial.st_size:
            chunk = os.read(source_file, min(1024 * 1024, initial.st_size - copied + 1))
            if not chunk:
                break
            copied += len(chunk)
            if copied > initial.st_size:
                raise GuardError(f"legacy release file grew during copy: {display}")
            _write_all(destination_file, chunk)

        final = os.fstat(source_file)
        if copied != initial.st_size or _snapshot_identity(final) != _snapshot_identity(initial):
            raise GuardError(f"legacy release file changed during copy: {display}")
        destination_info = os.fstat(destination_file)
        if destination_info.st_nlink != 1:
            raise GuardError(f"materialized release file is not a fresh inode: {display}")
        os.fsync(destination_file)
    finally:
        if destination_file >= 0:
            os.close(destination_file)
        os.close(source_file)


def _copy_legacy_directory(
    source_fd: int,
    destination_fd: int,
    relative_root: str,
    symlinks: list[tuple[str, str]],
    *,
    interpreter: str,
    anchor: str,
    uid: int,
    gid: int,
    source_device: int,
    source_mount_id: int | None,
) -> None:
    initial_directory = os.fstat(source_fd)
    if not stat.S_ISDIR(initial_directory.st_mode):
        raise GuardError(f"legacy release component is not a directory: {relative_root or '.'}")
    if initial_directory.st_dev != source_device:
        raise GuardError(
            f"legacy release crosses a mounted filesystem: {relative_root or '.'}"
        )
    if _fd_mount_id(source_fd) != source_mount_id:
        raise GuardError(
            f"legacy release crosses a mounted filesystem: {relative_root or '.'}"
        )

    initial_names = sorted(os.listdir(source_fd))
    for name in initial_names:
        if name in ("", ".", "..") or os.sep in name:
            raise GuardError(f"unsafe legacy release entry name: {name!r}")
        relative = name if not relative_root else os.path.join(relative_root, name)
        initial = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
        if not stat.S_ISLNK(initial.st_mode) and initial.st_dev != source_device:
            raise GuardError(
                f"legacy release crosses a mounted filesystem: {relative}"
            )

        if stat.S_ISDIR(initial.st_mode):
            os.mkdir(name, 0o700, dir_fd=destination_fd)
            child_source = _open_child_directory(source_fd, name)
            child_destination = _open_child_directory(destination_fd, name)
            try:
                opened = os.fstat(child_source)
                if (opened.st_dev, opened.st_ino) != (initial.st_dev, initial.st_ino):
                    raise GuardError(
                        f"legacy release directory changed during open: {relative}"
                    )
                os.fchown(child_destination, uid, gid)
                os.fchmod(child_destination, 0o700)
                _copy_legacy_directory(
                    child_source,
                    child_destination,
                    relative,
                    symlinks,
                    interpreter=interpreter,
                    anchor=anchor,
                    uid=uid,
                    gid=gid,
                    source_device=source_device,
                    source_mount_id=source_mount_id,
                )
                os.fchmod(child_destination, 0o755)
                os.fsync(child_destination)
            finally:
                os.close(child_destination)
                os.close(child_source)
        elif stat.S_ISREG(initial.st_mode):
            _copy_legacy_regular(
                source_fd,
                destination_fd,
                name,
                relative,
                initial,
                uid=uid,
                gid=gid,
                source_mount_id=source_mount_id,
            )
        elif stat.S_ISLNK(initial.st_mode):
            raw_target = os.readlink(name, dir_fd=source_fd)
            created_target, link_kind = _materialized_symlink_target(
                relative,
                raw_target,
                interpreter=interpreter,
                anchor=anchor,
                uid=uid,
                gid=gid,
            )
            final = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
            if (final.st_dev, final.st_ino) != (initial.st_dev, initial.st_ino) or os.readlink(
                name, dir_fd=source_fd
            ) != raw_target:
                raise GuardError(f"legacy release symlink changed during copy: {relative}")
            os.symlink(created_target, name, dir_fd=destination_fd)
            os.chown(
                name,
                uid,
                gid,
                dir_fd=destination_fd,
                follow_symlinks=False,
            )
            symlinks.append((relative, link_kind))
        else:
            raise GuardError(
                f"legacy release contains unsupported filesystem object: {relative}"
            )

    final_names = sorted(os.listdir(source_fd))
    if final_names != initial_names:
        raise GuardError(
            f"legacy release directory entries changed during copy: {relative_root or '.'}"
        )
    final_directory = os.fstat(source_fd)
    initial_identity = (
        initial_directory.st_dev,
        initial_directory.st_ino,
        initial_directory.st_mode,
        initial_directory.st_mtime_ns,
        initial_directory.st_ctime_ns,
    )
    final_identity = (
        final_directory.st_dev,
        final_directory.st_ino,
        final_directory.st_mode,
        final_directory.st_mtime_ns,
        final_directory.st_ctime_ns,
    )
    if final_identity != initial_identity:
        raise GuardError(
            f"legacy release directory changed during copy: {relative_root or '.'}"
        )
    os.fsync(destination_fd)


def _validate_materialized_symlinks(
    release: str,
    symlinks: list[tuple[str, str]],
    *,
    interpreter: str,
) -> None:
    release_abs = _absolute(release)
    for relative, link_kind in symlinks:
        path = os.path.join(release_abs, relative)
        try:
            terminal = os.path.realpath(path)
        except (OSError, RuntimeError) as exc:
            raise GuardError(f"materialized release has dangling/looped symlink: {relative}") from exc
        if not os.path.exists(terminal):
            raise GuardError(f"materialized release has dangling/looped symlink: {relative}")
        contained = os.path.commonpath((release_abs, terminal)) == release_abs
        if contained:
            continue
        if not _is_python_launcher(relative) or terminal != interpreter:
            raise GuardError(
                f"materialized release symlink has an external terminal: {relative} -> {terminal}"
            )
        if link_kind not in ("internal", "external-interpreter"):
            raise GuardError(f"unknown materialized symlink policy for {relative}")


def materialize_legacy_release(
    app_dir: str,
    source: str,
    destination: str,
    interpreter: str,
    *,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    """Copy a service-controlled legacy venv into fresh trusted inodes."""

    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    app_abs = _absolute(app_dir)
    source_abs = _absolute(source)
    if source_abs == os.path.join(app_abs, ".venv"):
        source_name = ".venv"
    else:
        source_name = _quarantine_name(source_abs, app_abs)
    canonical_interpreter = validate_trusted_executable(
        interpreter,
        anchor=anchor,
        uid=uid,
        gid=gid,
    )
    destination_name = _release_name(destination, app_abs)
    app_fd = _open_directory(app_abs)
    source_fd = -1
    destination_fd = -1
    symlinks: list[tuple[str, str]] = []
    try:
        source_info = os.stat(source_name, dir_fd=app_fd, follow_symlinks=False)
        if stat.S_ISLNK(source_info.st_mode) or not stat.S_ISDIR(source_info.st_mode):
            raise GuardError(f"legacy source is not a real directory: {source_abs}")
        source_fd = _open_child_directory(app_fd, source_name)
        opened_source = os.fstat(source_fd)
        if (opened_source.st_dev, opened_source.st_ino) != (
            source_info.st_dev,
            source_info.st_ino,
        ):
            raise GuardError("legacy source changed during open")
        app_info = os.fstat(app_fd)
        if opened_source.st_dev != app_info.st_dev:
            raise GuardError("legacy source is a mounted filesystem")
        app_mount_id = _fd_mount_id(app_fd)
        source_mount_id = _fd_mount_id(source_fd)
        if app_mount_id != source_mount_id:
            raise GuardError("legacy source is a mounted filesystem")

        os.mkdir(destination_name, 0o700, dir_fd=app_fd)
        destination_fd = _open_child_directory(app_fd, destination_name)
        os.fchown(destination_fd, uid, gid)
        os.fchmod(destination_fd, 0o700)
        _copy_legacy_directory(
            source_fd,
            destination_fd,
            "",
            symlinks,
            interpreter=canonical_interpreter,
            anchor=anchor,
            uid=uid,
            gid=gid,
            source_device=opened_source.st_dev,
            source_mount_id=source_mount_id,
        )
        os.fchmod(destination_fd, 0o755)
        os.fsync(destination_fd)
        os.fsync(app_fd)
    finally:
        if destination_fd >= 0:
            os.close(destination_fd)
        if source_fd >= 0:
            os.close(source_fd)
        os.close(app_fd)

    destination_abs = os.path.join(app_abs, destination_name)
    _validate_materialized_symlinks(
        destination_abs,
        symlinks,
        interpreter=canonical_interpreter,
    )
    _validate_release_tree(destination_abs, uid=uid, gid=gid)
    validate_release(
        app_abs,
        destination_abs,
        stable_link=False,
        require_executables=True,
        anchor=anchor,
        uid=uid,
        gid=gid,
    )
    final_fd = _open_directory(destination_abs)
    app_fd = _open_directory(app_abs)
    try:
        os.fsync(final_fd)
        os.fsync(app_fd)
    finally:
        os.close(app_fd)
        os.close(final_fd)
    return destination_abs


def harden_release(
    app_dir: str,
    path: str,
    *,
    stable_link: bool,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    target = _resolve_release_target(
        app_dir, path, stable_link=stable_link, uid=uid, gid=gid
    )
    if stable_link:
        # A stable link can name the release an active worker is currently
        # traversing. Never transiently seal or rewrite that live tree here;
        # require it to already satisfy the immutable-release contract and fail
        # closed without changing its modes if it does not.
        info = os.lstat(target)
        _require_trusted_directory(target, info, uid=uid, gid=gid)
        _validate_release_tree(target, uid=uid, gid=gid)
        return target

    name = _release_name(target, app_dir)
    app_fd = _open_directory(_absolute(app_dir))
    release_fd = -1
    try:
        info = os.stat(name, dir_fd=app_fd, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise GuardError(f"release target is not a real directory: {target}")
        release_fd = _open_child_directory(app_fd, name)
        opened = os.fstat(release_fd)
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise GuardError(f"release target changed during open: {target}")

        # Seal first and publish last. In particular, a newly built candidate
        # must remain untraversable by the live service while permissive modes
        # inherited from a hostile umask are normalized below. On any failure,
        # the still-open release root deliberately remains 0700.
        os.fchown(release_fd, uid, gid)
        os.fchmod(release_fd, 0o700)
        os.fsync(release_fd)

        for _current, directories, files, current_fd in os.fwalk(
            target, topdown=True, follow_symlinks=False
        ):
            for entry in (*directories, *files):
                _harden_entry(current_fd, entry, uid=uid, gid=gid)
            # This also makes symlink entries durable; symlinks cannot be
            # opened portably for fsync, so their containing directory is the
            # durability boundary.
            os.fsync(current_fd)
        _validate_release_tree(target, uid=uid, gid=gid)

        current = os.stat(name, dir_fd=app_fd, follow_symlinks=False)
        opened = os.fstat(release_fd)
        if (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino):
            raise GuardError(f"release target changed before publication: {target}")
        if not stat.S_ISDIR(current.st_mode) or stat.S_ISLNK(current.st_mode):
            raise GuardError(f"release target is not a real directory: {target}")

        # This one chmod is the publication boundary. Descendants have already
        # been hardened and validated, and both the release and parent metadata
        # are flushed before success is reported.
        os.fchmod(release_fd, 0o755)
        os.fsync(release_fd)
        os.fsync(app_fd)
    finally:
        if release_fd >= 0:
            os.close(release_fd)
        os.close(app_fd)

    # Re-open by name after publication so success also proves the live path is
    # the validated inode, not merely the descriptor retained above.
    _validate_release_tree(target, uid=uid, gid=gid)
    return target


def validate_release(
    app_dir: str,
    path: str,
    *,
    stable_link: bool,
    require_executables: bool,
    anchor: str,
    uid: int,
    gid: int,
) -> str:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    target = _resolve_release_target(
        app_dir, path, stable_link=stable_link, uid=uid, gid=gid
    )
    info = os.lstat(target)
    _require_trusted_directory(target, info, uid=uid, gid=gid)
    _validate_release_tree(target, uid=uid, gid=gid)

    if require_executables:
        bin_dir = os.path.join(target, "bin")
        bin_info = os.lstat(bin_dir)
        _require_trusted_directory(bin_dir, bin_info, uid=uid, gid=gid)
        for name in ("python", "patina-scan-worker"):
            executable = os.path.join(bin_dir, name)
            entry_info = os.lstat(executable)
            if entry_info.st_uid != uid or entry_info.st_gid != gid:
                raise GuardError(f"release executable is not trusted-owner: {executable}")
            if not stat.S_ISLNK(entry_info.st_mode):
                if not stat.S_ISREG(entry_info.st_mode):
                    raise GuardError(f"release executable is not a regular file: {executable}")
                if stat.S_IMODE(entry_info.st_mode) & 0o022:
                    raise GuardError(f"release executable is group/world writable: {executable}")
            resolved_info = os.stat(executable)
            if not stat.S_ISREG(resolved_info.st_mode):
                raise GuardError(f"release executable target is not regular: {executable}")
            if resolved_info.st_uid != uid or resolved_info.st_gid != gid:
                raise GuardError(
                    f"release executable target is not trusted-owner: {executable}"
                )
            if stat.S_IMODE(resolved_info.st_mode) & 0o022:
                raise GuardError(
                    f"release executable target is group/world writable: {executable}"
                )
            if not os.access(executable, os.X_OK):
                raise GuardError(f"release executable is not executable: {executable}")
    return target


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--anchor", required=True)
    parser.add_argument("--trusted-uid", type=int, required=True)
    parser.add_argument("--trusted-gid", type=int, required=True)
    subparsers = parser.add_subparsers(dest="command", required=True)

    ensure = subparsers.add_parser("ensure-trusted-dir")
    ensure.add_argument("--path", required=True)
    ensure.add_argument("--mode", type=_octal_mode, required=True)
    ensure.add_argument("--adopt-final", action="store_true")

    validate_dir = subparsers.add_parser("validate-trusted-dir")
    validate_dir.add_argument("--path", required=True)

    read_file = subparsers.add_parser("read-trusted-file")
    read_file.add_argument("--root", required=True)
    read_file.add_argument("--path", required=True)
    read_file.add_argument("--max-bytes", type=int, default=1024 * 1024)

    validate_executable = subparsers.add_parser("validate-trusted-executable")
    validate_executable.add_argument("--path", required=True)

    validate_source = subparsers.add_parser("validate-source-tree")
    validate_source.add_argument("--source-dir", required=True)

    validate_pycolmap = subparsers.add_parser("validate-pycolmap-artifact")
    validate_pycolmap.add_argument("--artifact-dir", required=True)
    validate_pycolmap.add_argument("--expected-python-tag", required=True)

    owned = subparsers.add_parser("ensure-owned-dir")
    owned.add_argument("--app-dir", required=True)
    owned.add_argument("--path", required=True)
    owned.add_argument("--owner-uid", type=int, required=True)
    owned.add_argument("--owner-gid", type=int, required=True)
    owned.add_argument("--mode", type=_octal_mode, required=True)

    generate = subparsers.add_parser("generate-release-path")
    generate.add_argument("--app-dir", required=True)

    generate_quarantine = subparsers.add_parser("generate-quarantine-path")
    generate_quarantine.add_argument("--app-dir", required=True)

    validate_name = subparsers.add_parser("validate-release-name")
    validate_name.add_argument("--app-dir", required=True)
    validate_name.add_argument("--path", required=True)

    validate_quarantine_name = subparsers.add_parser("validate-quarantine-name")
    validate_quarantine_name.add_argument("--app-dir", required=True)
    validate_quarantine_name.add_argument("--path", required=True)

    resolve_link = subparsers.add_parser("resolve-release-link")
    resolve_link.add_argument("--app-dir", required=True)
    resolve_link.add_argument("--path", required=True)

    create = subparsers.add_parser("create-release")
    create.add_argument("--app-dir", required=True)
    create.add_argument("--path", required=True)

    runtime_stub = subparsers.add_parser("install-runtime-stub")
    runtime_stub.add_argument("--app-dir", required=True)

    materialize = subparsers.add_parser("materialize-legacy-release")
    materialize.add_argument("--app-dir", required=True)
    materialize.add_argument("--source", required=True)
    materialize.add_argument("--destination", required=True)
    materialize.add_argument("--interpreter", required=True)

    quarantine = subparsers.add_parser("quarantine-legacy-release")
    quarantine.add_argument("--app-dir", required=True)
    quarantine.add_argument("--source", required=True)
    quarantine.add_argument("--quarantine", required=True)

    remove_quarantine = subparsers.add_parser("remove-legacy-quarantine")
    remove_quarantine.add_argument("--app-dir", required=True)
    remove_quarantine.add_argument("--quarantine", required=True)

    seal_quarantine = subparsers.add_parser("seal-legacy-quarantine")
    seal_quarantine.add_argument("--app-dir", required=True)
    seal_quarantine.add_argument("--quarantine", required=True)

    for command in ("harden-release", "validate-release"):
        release = subparsers.add_parser(command)
        release.add_argument("--app-dir", required=True)
        release.add_argument("--path", required=True)
        release.add_argument("--stable-link", action="store_true")
        if command == "validate-release":
            release.add_argument("--require-executables", action="store_true")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    common = {
        "anchor": args.anchor,
        "uid": args.trusted_uid,
        "gid": args.trusted_gid,
    }
    try:
        if args.command == "ensure-trusted-dir":
            ensure_trusted_directory(
                args.anchor,
                args.path,
                uid=args.trusted_uid,
                gid=args.trusted_gid,
                mode=args.mode,
                adopt_final=args.adopt_final,
            )
        elif args.command == "validate-trusted-dir":
            _validate_trusted_tree(
                args.anchor,
                args.path,
                uid=args.trusted_uid,
                gid=args.trusted_gid,
            )
        elif args.command == "read-trusted-file":
            data = read_trusted_file(
                args.root,
                args.path,
                max_bytes=args.max_bytes,
                **common,
            )
            sys.stdout.buffer.write(data)
        elif args.command == "validate-trusted-executable":
            print(validate_trusted_executable(args.path, **common))
        elif args.command == "validate-source-tree":
            validate_source_tree(args.source_dir, **common)
        elif args.command == "validate-pycolmap-artifact":
            print(
                validate_pycolmap_artifact(
                    args.artifact_dir,
                    args.expected_python_tag,
                    **common,
                )
            )
        elif args.command == "ensure-owned-dir":
            ensure_owned_directory(
                args.app_dir,
                args.path,
                trusted_uid=args.trusted_uid,
                trusted_gid=args.trusted_gid,
                owner_uid=args.owner_uid,
                owner_gid=args.owner_gid,
                mode=args.mode,
            )
        elif args.command == "generate-release-path":
            print(generate_release_path(args.app_dir, **common))
        elif args.command == "generate-quarantine-path":
            print(generate_quarantine_path(args.app_dir, **common))
        elif args.command == "validate-release-name":
            _validate_trusted_tree(
                args.anchor,
                args.app_dir,
                uid=args.trusted_uid,
                gid=args.trusted_gid,
            )
            _release_name(args.path, args.app_dir)
        elif args.command == "validate-quarantine-name":
            _validate_trusted_tree(
                args.anchor,
                args.app_dir,
                uid=args.trusted_uid,
                gid=args.trusted_gid,
            )
            _quarantine_name(args.path, args.app_dir)
        elif args.command == "resolve-release-link":
            print(resolve_release_link(args.app_dir, args.path, **common))
        elif args.command == "create-release":
            create_release(args.app_dir, args.path, **common)
        elif args.command == "install-runtime-stub":
            install_runtime_stub(args.app_dir, **common)
        elif args.command == "materialize-legacy-release":
            print(
                materialize_legacy_release(
                    args.app_dir,
                    args.source,
                    args.destination,
                    args.interpreter,
                    **common,
                )
            )
        elif args.command == "quarantine-legacy-release":
            print(
                quarantine_legacy_release(
                    args.app_dir,
                    args.source,
                    args.quarantine,
                    **common,
                )
            )
        elif args.command == "remove-legacy-quarantine":
            remove_legacy_quarantine(
                args.app_dir,
                args.quarantine,
                **common,
            )
        elif args.command == "seal-legacy-quarantine":
            seal_legacy_quarantine(
                args.app_dir,
                args.quarantine,
                **common,
            )
        elif args.command == "harden-release":
            print(
                harden_release(
                    args.app_dir,
                    args.path,
                    stable_link=args.stable_link,
                    **common,
                )
            )
        elif args.command == "validate-release":
            print(
                validate_release(
                    args.app_dir,
                    args.path,
                    stable_link=args.stable_link,
                    require_executables=args.require_executables,
                    **common,
                )
            )
        else:  # pragma: no cover - argparse guarantees a known command
            raise GuardError(f"unknown command: {args.command}")
    except (GuardError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
