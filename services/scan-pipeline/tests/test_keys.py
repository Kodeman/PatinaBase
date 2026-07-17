"""Object-key derivation — mirrors parse-room-scan's objectKeyFromUrl tests."""

from __future__ import annotations

import pytest

from patina_scan_worker.keys import (
    artifact_object_key,
    bundle_prefix_from_manifest_url,
    object_key_from_url,
    safe_relative_path,
)


def test_object_key_from_url_public_and_signed_and_bare():
    assert (
        object_key_from_url(
            "https://p.supabase.co/storage/v1/object/public/room-scans/u/s/CapturedRoom.json"
        )
        == "u/s/CapturedRoom.json"
    )
    # signed URL with a query string
    assert (
        object_key_from_url(
            "https://p.supabase.co/storage/v1/object/sign/room-scans/a/b/c.json?token=xyz"
        )
        == "a/b/c.json"
    )
    # deep app-variance path after the marker
    assert (
        object_key_from_url(
            "https://p/storage/v1/object/public/room-scans/field/2026/07/scan/CapturedRoom.json"
        )
        == "field/2026/07/scan/CapturedRoom.json"
    )
    # already a bare key
    assert object_key_from_url("u/s/CapturedRoom.json") == "u/s/CapturedRoom.json"
    # empty / None
    assert object_key_from_url("") is None
    assert object_key_from_url(None) is None


def test_bundle_prefix():
    url = "https://p/storage/v1/object/public/room-scans/uid/scan/manifest.json"
    assert bundle_prefix_from_manifest_url(url) == "uid/scan"
    assert bundle_prefix_from_manifest_url("manifest.json") == ""
    assert bundle_prefix_from_manifest_url(None) is None


def test_safe_relative_path_rejects_escapes():
    assert safe_relative_path("photos/auto_001.heic") == "photos/auto_001.heic"
    with pytest.raises(ValueError):
        safe_relative_path("/etc/passwd")
    with pytest.raises(ValueError):
        safe_relative_path("../escape.bin")
    with pytest.raises(ValueError):
        safe_relative_path("a/../../b")
    with pytest.raises(ValueError):
        safe_relative_path("")


def test_artifact_object_key_prefers_column_then_prefix():
    scan_row = {
        "captured_room_json_url": (
            "https://p/storage/v1/object/public/room-scans/uid/scan/captured_room.json"
        )
    }
    # kind with a dedicated non-null column → column-derived key
    assert (
        artifact_object_key("uid/scan", "captured_room.json", "capturedRoomJson", scan_row)
        == "uid/scan/captured_room.json"
    )
    # kind without a column → prefix + relativePath
    assert (
        artifact_object_key("uid/scan", "keyframes/keyframe_index.ndjson", "keyframeIndex", scan_row)
        == "uid/scan/keyframes/keyframe_index.ndjson"
    )
    # column present but null → prefix fallback
    assert (
        artifact_object_key("uid/scan", "mesh.ply", "mesh", {"mesh_url": None})
        == "uid/scan/mesh.ply"
    )


def test_artifact_object_key_containment_enforced():
    with pytest.raises(ValueError):
        artifact_object_key("uid/scan", "../escape.bin", "mesh", {})
