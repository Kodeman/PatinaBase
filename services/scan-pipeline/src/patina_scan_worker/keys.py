"""Object-key derivation — mirrors the SHIPPED iOS uploader layout exactly.

The Field uploader (apps/mobile/Capture/.../RoomScanStoragePath.swift +
ScanUploadDescriptor.swift) writes every artifact to a PER-KIND folder:

    {folder}/{userId}/{roomId}/{filename}

(00077 storage RLS: segment [2] = userId, segment [3] = roomId — 1-based). The
manifest itself lives at ``manifests/{userId}/{roomId}/manifest.json``. This is
pinned as a contract in capture-bundle-spec-v1.md **B-18** (storage layout); the
map below MUST stay in lockstep with the iOS ``ScanUploadDescriptor.all`` table.

Both iOS apps write PUBLIC-shaped (`/object/public/room-scans/…`) URLs into the
room_scans columns as mere path-carriers; ``object_key_from_url`` derives the
bucket-relative key by splitting on the LAST ``/room-scans/`` (mirrors
parse-room-scan / confirm-scan-bundle).

Bundle-read contract (design §2.3 leaves the mechanism a code call):
  * The manifest (``bundle_manifest_url``) is the authoritative inventory; its
    object key derives via ``object_key_from_url`` and pins the verified
    ``{userId}/{roomId}`` owner segments.
  * A kind with a dedicated non-null room_scans URL column resolves to that
    column's key (the exact object the uploader PUT).
  * A COLUMN-LESS kind (depthIndex, scorecard, anchors, keyframeIndex,
    keyframeSummary) resolves by PREFIX-SWAP off the manifest's verified owner
    segments: ``{KIND_TO_FOLDER[kind]}/{userId}/{roomId}/{basename(relativePath)}``.
  * EVERY derived key is owner-anchored (``assert_owner_prefix``) before use —
    the worker's service key bypasses storage RLS, so this check IS the
    RLS-equivalent (C2 / OWNERSHIP_VIOLATION).
"""

from __future__ import annotations

import posixpath

_MARKER = "/room-scans/"

# manifest artifact.kind (ArtifactKind.rawValue) → dedicated room_scans URL
# column (the item-8 URLColumnPatch / ScanUploadDescriptor `column` field).
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

# manifest artifact.kind → storage FOLDER (segment [0], 0-based). Pinned by the
# iOS ScanUploadDescriptor.all table and capture-bundle-spec B-18. The
# column-backed kinds are here too so the layout is complete and testable, but
# they normally resolve via their column; the five COLUMN-LESS kinds
# (depthIndex, scorecard, anchors, keyframeIndex, keyframeSummary) rely on it.
KIND_TO_FOLDER: dict[str, str] = {
    "usdz": "usdz",
    "capturedRoomJson": "captured_room",
    "mesh": "mesh",
    "bundleManifest": "manifests",
    "depthIndex": "depth",
    "scorecard": "scorecard",
    "anchors": "anchors",
    "keyframeIndex": "keyframes",
    "keyframeSummary": "keyframes",
    "depthArchive": "depth",
    "keyframesArchive": "bundle",
}


class OwnershipError(ValueError):
    """A derived object key is not under the scan owner's ``{uid}/{room}`` prefix
    (C2). Raised by ``assert_owner_prefix``; ingest maps it to the permanent
    OWNERSHIP_VIOLATION token."""


class KeyResolutionError(ValueError):
    """An artifact kind has neither a dedicated URL column nor a known B-18
    folder — its storage key cannot be derived. Surfaced by a real M2 bundle:
    the iOS assembler listed a ``photosManifest`` artifact it never uploaded and
    never gave a descriptor folder. Ingest SKIPS such an artifact (rather than
    hard-failing) so the validator returns the honest MISSING_FILE verdict."""


def object_key_from_url(url: str | None) -> str | None:
    """Bucket-relative key from a stored artifact URL. Behavioural mirror of the
    TS ``objectKeyFromUrl``: split on the LAST ``/room-scans/``; bare key used
    as-is; query stripped; leading slashes trimmed."""
    if not isinstance(url, str) or url == "":
        return None
    idx = url.rfind(_MARKER)
    key = url[idx + len(_MARKER):] if idx >= 0 else url
    q = key.find("?")
    if q >= 0:
        key = key[:q]
    key = key.lstrip("/")
    return key if key else None


def owner_segments_from_key(key: str) -> tuple[str, str]:
    """Extract ``(userId, roomId)`` from a bucket key ``{folder}/{uid}/{room}/…``.
    Raises ValueError if the key has too few segments to carry them."""
    parts = key.split("/")
    if len(parts) < 3:
        raise ValueError(
            f"storage key has too few segments to carry owner/room: {key!r}"
        )
    return parts[1], parts[2]


def safe_relative_path(rel: str) -> str:
    """Validate a manifest ``relativePath`` (mirrors the validator's
    PATH_VIOLATION rules): reject absolute paths and any ``..`` segment. Returns
    a POSIX-normalised relative path; raises ValueError on violation."""
    if not isinstance(rel, str) or rel == "":
        raise ValueError("empty relativePath")
    norm = rel.replace("\\", "/")
    if norm.startswith("/"):
        raise ValueError(f"relativePath is absolute: {rel!r}")
    if any(seg == ".." for seg in norm.split("/")):
        raise ValueError(f"relativePath contains a '..' segment: {rel!r}")
    return norm


def artifact_object_key(
    manifest_key: str,
    rel: str,
    kind: str | None,
    scan_row: dict,
) -> str:
    """Resolve the storage key for one manifest artifact.

    Preference: a dedicated non-null room_scans URL column (the exact object the
    uploader PUT); otherwise PREFIX-SWAP off the manifest's verified owner
    segments into the kind's per-kind folder. ``rel`` is containment-checked
    first. Raises ValueError on an unresolvable kind or a bad relativePath."""
    safe_rel = safe_relative_path(rel)

    col = KIND_TO_URL_COLUMN.get(kind or "")
    if col:
        col_url = scan_row.get(col)
        col_key = object_key_from_url(col_url) if isinstance(col_url, str) else None
        if col_key:
            return col_key

    folder = KIND_TO_FOLDER.get(kind or "")
    if not folder:
        raise KeyResolutionError(
            f"no storage folder known for artifact kind {kind!r} "
            f"(not in the v1 B-18 layout, and no dedicated URL column set)"
        )
    uid, room = owner_segments_from_key(manifest_key)
    filename = posixpath.basename(safe_rel)
    return f"{folder}/{uid}/{room}/{filename}"


def assert_owner_prefix(key: str, user_id: str, room_id: str | None) -> None:
    """Owner-prefix anchoring (C2). The worker's service key bypasses storage
    RLS, so this reproduces the 00077 RLS guard: segment [1] (0-based) MUST be
    the scan owner's ``user_id``, and segment [2] MUST be the row's ``room_id``
    when present (nullable). Raises ``OwnershipError`` on any mismatch."""
    parts = key.split("/")
    if len(parts) < 3:
        raise OwnershipError(f"key too short to verify owner prefix: {key!r}")
    if parts[1] != str(user_id):
        raise OwnershipError(
            f"key owner segment {parts[1]!r} != row user_id {user_id!r}: {key!r}"
        )
    if room_id and parts[2] != str(room_id):
        raise OwnershipError(
            f"key room segment {parts[2]!r} != row room_id {room_id!r}: {key!r}"
        )
