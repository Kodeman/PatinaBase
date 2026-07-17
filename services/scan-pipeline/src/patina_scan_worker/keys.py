"""Object-key derivation — mirrors parse-room-scan / confirm-scan-bundle's
``objectKeyFromUrl`` convention exactly.

Both iOS apps write PUBLIC-shaped (`/object/public/room-scans/…`) URLs into the
room_scans artifact columns as mere path-carriers (an ecosystem convention; see
supabase/functions/parse-room-scan/lib.ts and confirm-scan-bundle/index.ts). The
worker derives the bucket-relative object key by splitting on the LAST
``/room-scans/`` and keeping the tail (query string stripped).

Bundle-read contract (blessed, code-only — design §2.3 leaves the exact
mechanism a code call):
  * The manifest (``bundle_manifest_url``) is the authoritative artifact
    inventory. Its object key derives via ``object_key_from_url``.
  * The bundle prefix is that key's parent dir; each ``manifest.artifacts[]``
    entry's ``relativePath`` resolves to ``{prefix}/{relativePath}`` — this
    reconstructs the on-device bundle directory the reference validator expects,
    and keeps userId/scanId in path segments [2]/[3] for EVERY nested path so
    the 00287 designer-read RLS still resolves.
  * When an artifact ``kind`` also has a dedicated non-null room_scans URL
    column, that column's key is preferred (it is the exact object the uploader
    PUT), with the prefix path as the fallback.
"""

from __future__ import annotations

import posixpath

_MARKER = "/room-scans/"

# manifest artifact.kind (ArtifactKind.rawValue) → dedicated room_scans URL
# column (the item-8 URLColumnPatch set). Artifacts without a dedicated column
# (posed photos, keyframe index/summary) resolve via the bundle-prefix path.
KIND_TO_URL_COLUMN: dict[str, str] = {
    "capturedRoomJson": "captured_room_json_url",
    "usdz": "model_url",
    "mesh": "mesh_url",
    "worldMap": "world_map_url",
    "depthArchive": "depth_archive_url",
    "keyframesArchive": "scan_bundle_url",
    "bundleManifest": "bundle_manifest_url",
    "photosManifest": "photos_manifest_url",
    "coverageHeatmap": "coverage_heatmap_url",
    "thumbnail": "thumbnail_url",
    "heroFrame": "hero_frame_url",
}


def object_key_from_url(url: str | None) -> str | None:
    """Bucket-relative key from a stored artifact URL. Split on the LAST
    ``/room-scans/``; a bare key (no marker) is used as-is; query stripped;
    leading slashes trimmed. Returns None for empty/non-string input.

    Byte-for-byte behavioural mirror of the TS ``objectKeyFromUrl``.
    """
    if not isinstance(url, str) or url == "":
        return None
    idx = url.rfind(_MARKER)
    key = url[idx + len(_MARKER):] if idx >= 0 else url
    q = key.find("?")
    if q >= 0:
        key = key[:q]
    key = key.lstrip("/")
    return key if key else None


def bundle_prefix_from_manifest_url(manifest_url: str | None) -> str | None:
    """Parent directory of the manifest's object key — the bundle root prefix.

    e.g. ``…/room-scans/uid/scan/manifest.json`` → ``uid/scan``.
    """
    key = object_key_from_url(manifest_url)
    if key is None:
        return None
    parent = posixpath.dirname(key)
    return parent  # '' when the manifest sits at the bucket root


def safe_relative_path(rel: str) -> str:
    """Validate a manifest ``relativePath`` before composing it into a storage
    key (mirrors the validator's PATH_VIOLATION containment rules): reject
    absolute paths and any ``..`` segment. Returns a POSIX-normalised relative
    path. Raises ValueError on violation.
    """
    if not isinstance(rel, str) or rel == "":
        raise ValueError("empty relativePath")
    norm = rel.replace("\\", "/")
    if norm.startswith("/"):
        raise ValueError(f"relativePath is absolute: {rel!r}")
    segments = norm.split("/")
    if any(seg == ".." for seg in segments):
        raise ValueError(f"relativePath contains a '..' segment: {rel!r}")
    return norm


def artifact_object_key(
    prefix: str | None,
    rel: str,
    kind: str | None,
    scan_row: dict,
) -> str:
    """Resolve the storage key for one manifest artifact.

    Preference: a dedicated non-null room_scans URL column for the kind (the
    exact object the uploader PUT); fallback to ``{prefix}/{relativePath}``.
    ``rel`` is validated for containment first.
    """
    safe_rel = safe_relative_path(rel)

    col = KIND_TO_URL_COLUMN.get(kind or "")
    if col:
        col_url = scan_row.get(col)
        col_key = object_key_from_url(col_url) if isinstance(col_url, str) else None
        if col_key:
            return col_key

    if prefix:
        return f"{prefix}/{safe_rel}"
    return safe_rel
