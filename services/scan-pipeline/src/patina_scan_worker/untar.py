"""Safe tar extraction for the transport archives (depth.tar / keyframes.tar).

The bundle's heavy per-file streams are tar'd at upload time (capture-bundle-spec
Part 3 / B-16): ``depth.tar`` (kind ``depthArchive``) and ``keyframes.tar`` (kind
``keyframesArchive``). Ingest untars them into the scratch bundle so later stages
(and P2) see the logical per-file layout. Extraction refuses any member that
escapes the destination — absolute paths, ``..`` segments, or symlink/hardlink
members — mirroring the validator's PATH_VIOLATION containment rules.

Python 3.12+ ships ``tarfile`` data-filter; we do the same checks explicitly so
the behaviour (and its error token) is identical on 3.11 and independent of the
interpreter's default filter.
"""

from __future__ import annotations

import os
import tarfile

from .errors import PermanentError


def _is_within(directory: str, target: str) -> bool:
    directory = os.path.realpath(directory)
    target = os.path.realpath(target)
    return target == directory or target.startswith(directory + os.sep)


def safe_extract_tar(tar_path: str, dest_dir: str) -> list[str]:
    """Extract ``tar_path`` into ``dest_dir`` safely. Returns the list of member
    names extracted (regular files + dirs). Raises PermanentError (token
    PATH_VIOLATION) on any unsafe member — an unsafe archive will not get better
    on retry.
    """
    os.makedirs(dest_dir, exist_ok=True)
    extracted: list[str] = []
    try:
        with tarfile.open(tar_path, "r:*") as tf:
            members = tf.getmembers()
            for m in members:
                name = m.name
                # Reject links outright — an artifact member must be a real file/dir.
                if m.issym() or m.islnk():
                    raise PermanentError(
                        f"tar member is a link: {name!r} in {os.path.basename(tar_path)}",
                        token="PATH_VIOLATION",
                    )
                norm = name.replace("\\", "/")
                if os.path.isabs(norm) or norm.startswith("/"):
                    raise PermanentError(
                        f"tar member is absolute: {name!r}", token="PATH_VIOLATION"
                    )
                if any(seg == ".." for seg in norm.split("/")):
                    raise PermanentError(
                        f"tar member contains a '..' segment: {name!r}",
                        token="PATH_VIOLATION",
                    )
                target = os.path.join(dest_dir, norm)
                if not _is_within(dest_dir, target):
                    raise PermanentError(
                        f"tar member escapes destination: {name!r}",
                        token="PATH_VIOLATION",
                    )
            # Second pass: all members verified safe → extract. Pass the stdlib
            # data filter where available (3.12+, backported to 3.11.4) as
            # defence-in-depth on top of our own containment checks; fall back
            # cleanly on older 3.11 that lacks the parameter.
            for m in members:
                try:
                    tf.extract(m, dest_dir, filter="data")
                except TypeError:
                    tf.extract(m, dest_dir)
                extracted.append(m.name)
    except tarfile.TarError as exc:
        # A malformed / non-tar archive is a content problem — permanent.
        raise PermanentError(
            f"not a readable tar archive ({os.path.basename(tar_path)}): {exc}",
            token="SCHEMA_VIOLATION",
        ) from exc
    return extracted
