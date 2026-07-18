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
import os
import secrets
import stat
import sys
from pathlib import PurePath


class GuardError(RuntimeError):
    """A managed path failed the installer's trust contract."""


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


def generate_release_path(app_dir: str, *, anchor: str, uid: int, gid: int) -> str:
    _validate_trusted_tree(anchor, app_dir, uid=uid, gid=gid)
    for _ in range(128):
        candidate = os.path.join(_absolute(app_dir), f".venv.release.{secrets.token_hex(12)}")
        if not os.path.lexists(candidate):
            return candidate
    raise GuardError("could not allocate a unique release name")


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
        os.mkdir(name, 0o755, dir_fd=app_fd)
        release_fd = _open_child_directory(app_fd, name)
        try:
            os.fchown(release_fd, uid, gid)
            os.fchmod(release_fd, 0o755)
            os.fsync(release_fd)
        finally:
            os.close(release_fd)
        os.fsync(app_fd)
    finally:
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
        os.fchmod(entry_fd, stat.S_IMODE(info.st_mode) & ~0o022)
    finally:
        os.close(entry_fd)


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
    name = _release_name(target, app_dir)
    app_fd = _open_directory(_absolute(app_dir))
    try:
        info = os.stat(name, dir_fd=app_fd, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise GuardError(f"release target is not a real directory: {target}")
        release_fd = _open_child_directory(app_fd, name)
        try:
            os.fchown(release_fd, uid, gid)
            os.fchmod(release_fd, stat.S_IMODE(info.st_mode) & ~0o022)
        finally:
            os.close(release_fd)
    finally:
        os.close(app_fd)

    for _current, directories, files, current_fd in os.fwalk(
        target, topdown=True, follow_symlinks=False
    ):
        for entry in (*directories, *files):
            _harden_entry(current_fd, entry, uid=uid, gid=gid)
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

    owned = subparsers.add_parser("ensure-owned-dir")
    owned.add_argument("--app-dir", required=True)
    owned.add_argument("--path", required=True)
    owned.add_argument("--owner-uid", type=int, required=True)
    owned.add_argument("--owner-gid", type=int, required=True)
    owned.add_argument("--mode", type=_octal_mode, required=True)

    generate = subparsers.add_parser("generate-release-path")
    generate.add_argument("--app-dir", required=True)

    create = subparsers.add_parser("create-release")
    create.add_argument("--app-dir", required=True)
    create.add_argument("--path", required=True)

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
        elif args.command == "create-release":
            create_release(args.app_dir, args.path, **common)
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
    except (GuardError, FileExistsError, FileNotFoundError, NotADirectoryError, PermissionError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
