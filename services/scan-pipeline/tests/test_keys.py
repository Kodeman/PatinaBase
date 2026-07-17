"""Object-key derivation — real per-kind layout (B-18) + owner anchoring (C2)."""

from __future__ import annotations

import pytest

from patina_scan_worker.keys import (
    KIND_TO_FOLDER,
    OwnershipError,
    artifact_object_key,
    assert_owner_prefix,
    object_key_from_url,
    owner_segments_from_key,
    safe_relative_path,
)

UID = "faa8cb85-c74c-45d0-887c-d7826756c2b4"
ROOM = "11111111-2222-3333-4444-555555555555"
MANIFEST_KEY = f"manifests/{UID}/{ROOM}/manifest.json"


def test_object_key_from_url_public_and_signed_and_bare():
    assert (
        object_key_from_url(
            "https://p/storage/v1/object/public/room-scans/manifests/u/s/manifest.json"
        )
        == "manifests/u/s/manifest.json"
    )
    assert (
        object_key_from_url(
            "https://p/storage/v1/object/sign/room-scans/a/b/c.json?token=xyz"
        )
        == "a/b/c.json"
    )
    assert object_key_from_url("u/s/CapturedRoom.json") == "u/s/CapturedRoom.json"
    assert object_key_from_url("") is None
    assert object_key_from_url(None) is None


def test_owner_segments_from_key():
    assert owner_segments_from_key(MANIFEST_KEY) == (UID, ROOM)
    assert owner_segments_from_key("usdz/u/r/scan.usdz") == ("u", "r")
    with pytest.raises(ValueError):
        owner_segments_from_key("toofew/segments")


def test_safe_relative_path_rejects_escapes():
    assert safe_relative_path("keyframes/keyframe_index.ndjson") == "keyframes/keyframe_index.ndjson"
    for bad in ("/etc/passwd", "../escape.bin", "a/../../b", ""):
        with pytest.raises(ValueError):
            safe_relative_path(bad)


def test_artifact_object_key_column_backed_wins():
    scan_row = {
        "captured_room_json_url": (
            f"https://p/storage/v1/object/public/room-scans/captured_room/{UID}/{ROOM}/captured_room.json"
        )
    }
    assert (
        artifact_object_key(MANIFEST_KEY, "captured_room.json", "capturedRoomJson", scan_row)
        == f"captured_room/{UID}/{ROOM}/captured_room.json"
    )


@pytest.mark.parametrize(
    "kind,rel,folder,filename",
    [
        ("keyframeIndex", "keyframes/keyframe_index.ndjson", "keyframes", "keyframe_index.ndjson"),
        ("keyframeSummary", "keyframes/keyframe_summary.json", "keyframes", "keyframe_summary.json"),
        ("depthIndex", "depth/depth_index.ndjson", "depth", "depth_index.ndjson"),
        ("scorecard", "scorecard.json", "scorecard", "scorecard.json"),
        ("anchors", "anchors.json", "anchors", "anchors.json"),
    ],
)
def test_artifact_object_key_columnless_prefix_swap(kind, rel, folder, filename):
    # THE regression guard: column-less kinds must land in their PER-KIND folder,
    # not in the manifest's `manifests/` prefix. (This is what C1 caught.)
    key = artifact_object_key(MANIFEST_KEY, rel, kind, {})
    assert key == f"{folder}/{UID}/{ROOM}/{filename}"
    assert KIND_TO_FOLDER[kind] == folder


def test_artifact_object_key_unknown_kind_raises():
    with pytest.raises(ValueError):
        artifact_object_key(MANIFEST_KEY, "mystery.bin", "mysteryKind", {})


def test_artifact_object_key_containment_enforced():
    with pytest.raises(ValueError):
        artifact_object_key(MANIFEST_KEY, "../escape.bin", "mesh", {})


def test_assert_owner_prefix_accepts_owner_key():
    assert_owner_prefix(f"keyframes/{UID}/{ROOM}/keyframe_index.ndjson", UID, ROOM)
    # room_id absent → the room segment is not checked
    assert_owner_prefix(f"usdz/{UID}/whatever/scan.usdz", UID, None)


def test_assert_owner_prefix_rejects_foreign_uid():
    foreign = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(OwnershipError):
        assert_owner_prefix(f"usdz/{foreign}/{ROOM}/scan.usdz", UID, ROOM)


def test_assert_owner_prefix_rejects_room_mismatch_when_present():
    with pytest.raises(OwnershipError):
        assert_owner_prefix(f"usdz/{UID}/other-room/scan.usdz", UID, ROOM)


def test_assert_owner_prefix_rejects_too_short_key():
    with pytest.raises(OwnershipError):
        assert_owner_prefix("toofew/seg", UID, ROOM)
