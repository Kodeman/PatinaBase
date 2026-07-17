#!/usr/bin/env python3
"""validate_capture_bundle.py — Field Capture bundle validator (capture-bundle-spec-v1).

Reference implementation of the integrity + consistency checks defined in
docs/design/field-capture/capture-bundle-spec-v1.md §10. Stdlib only.

Usage:
    validate_capture_bundle.py <bundle_dir>       Validate a bundle; exit 0 if valid,
                                                   non-zero with named failures on stderr.
    validate_capture_bundle.py --make-fixture <d> Write a minimal synthetic VALID bundle.
    validate_capture_bundle.py --selftest         Self-check: fixture passes; a corrupted
                                                   copy fails naming both violations.

Failure names (stable tokens; one line per failure on stderr):
    MISSING_MANIFEST       manifest.json absent
    MANIFEST_PARSE         manifest.json is not valid JSON
    SCHEMA_VIOLATION       required key missing / wrong checksum algorithm
    MISSING_ARTIFACT       a mandatory artifact kind is not listed
    MISSING_FILE           an artifact's relativePath does not exist on disk
    CHECKSUM_MISMATCH      an artifact's sha256 does not match the bytes
    SIZE_MISMATCH          an artifact's sizeBytes disagrees with the file
    ANCHOR_INCONSISTENCY   UNVERIFIED flag / anchorCount / anchor shape wrong
    PHOTO_COUNT_MISMATCH   photos_metadata.ndjson line count != manifest.photos length
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile

# Mandatory artifact kinds a v1 capture bundle must list (spec §3.6).
REQUIRED_ARTIFACT_KINDS = ("capturedRoomJson", "usdz")

# Required top-level manifest keys for a v1 instrument bundle (spec §3.1 / §10.2).
REQUIRED_TOP_LEVEL_KEYS = (
    "schemaVersion",
    "bundleSpecVersion",
    "scanId",
    "device",
    "session",
    "anchors",
    "scorecard",
    "unverified",
    "checksumAlgorithm",
    "artifacts",
)

# The accuracy contract: three verified spans (SC-08). Below this → UNVERIFIED.
MIN_VERIFIED_ANCHORS = 3

CHUNK = 1 << 20  # 1 MiB


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_bundle(bundle_dir: str) -> list[str]:
    """Return a list of 'TOKEN: detail' failure strings. Empty list == valid."""
    failures: list[str] = []

    manifest_path = os.path.join(bundle_dir, "manifest.json")
    if not os.path.isfile(manifest_path):
        return [f"MISSING_MANIFEST: {manifest_path} not found"]

    try:
        with open(manifest_path, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return [f"MANIFEST_PARSE: {exc}"]

    if not isinstance(manifest, dict):
        return ["MANIFEST_PARSE: top-level JSON is not an object"]

    # ── §10.2 required keys ────────────────────────────────────────────────
    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in manifest:
            failures.append(f"SCHEMA_VIOLATION: missing top-level key '{key}'")

    # ── §10.3 checksum algorithm ───────────────────────────────────────────
    algo = manifest.get("checksumAlgorithm")
    if algo is not None and algo != "sha256":
        failures.append(
            f"SCHEMA_VIOLATION: checksumAlgorithm must be 'sha256', got {algo!r}"
        )

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        failures.append("SCHEMA_VIOLATION: 'artifacts' must be an array")
        artifacts = []

    # ── §10.4 required artifact kinds ──────────────────────────────────────
    listed_kinds = {
        a.get("kind") for a in artifacts if isinstance(a, dict)
    }
    for kind in REQUIRED_ARTIFACT_KINDS:
        if kind not in listed_kinds:
            failures.append(f"MISSING_ARTIFACT: required artifact kind '{kind}' not listed")

    # ── §10.5 per-artifact integrity ───────────────────────────────────────
    for a in artifacts:
        if not isinstance(a, dict):
            failures.append("SCHEMA_VIOLATION: artifact entry is not an object")
            continue
        rel = a.get("relativePath")
        kind = a.get("kind", "?")
        if not isinstance(rel, str) or not rel:
            failures.append(f"SCHEMA_VIOLATION: artifact '{kind}' has no relativePath")
            continue
        fpath = os.path.join(bundle_dir, rel)
        if not os.path.isfile(fpath):
            failures.append(f"MISSING_FILE: {rel} (kind '{kind}')")
            continue

        declared_sha = a.get("sha256")
        if not isinstance(declared_sha, str) or len(declared_sha) != 64:
            failures.append(f"SCHEMA_VIOLATION: artifact '{rel}' missing required 64-hex sha256")
        else:
            actual_sha = sha256_of(fpath)
            if actual_sha != declared_sha.lower():
                failures.append(
                    f"CHECKSUM_MISMATCH: {rel} declared {declared_sha[:12]}… actual {actual_sha[:12]}…"
                )

        declared_size = a.get("sizeBytes")
        if declared_size is not None:
            actual_size = os.path.getsize(fpath)
            if actual_size != declared_size:
                failures.append(
                    f"SIZE_MISMATCH: {rel} declared {declared_size} actual {actual_size}"
                )

    # ── §10.6 anchor / UNVERIFIED consistency ──────────────────────────────
    anchors = manifest.get("anchors")
    if not isinstance(anchors, list):
        failures.append("SCHEMA_VIOLATION: 'anchors' must be an array")
        anchors = []
    else:
        unverified = manifest.get("unverified")
        expected_unverified = len(anchors) < MIN_VERIFIED_ANCHORS
        if isinstance(unverified, bool) and unverified != expected_unverified:
            failures.append(
                f"ANCHOR_INCONSISTENCY: unverified={unverified} but anchors.length="
                f"{len(anchors)} (expected unverified={expected_unverified})"
            )
        scorecard = manifest.get("scorecard")
        if isinstance(scorecard, dict):
            sc_count = scorecard.get("anchorCount")
            if sc_count is not None and sc_count != len(anchors):
                failures.append(
                    f"ANCHOR_INCONSISTENCY: scorecard.anchorCount={sc_count} != anchors.length={len(anchors)}"
                )
        for i, anc in enumerate(anchors):
            if not isinstance(anc, dict):
                failures.append(f"ANCHOR_INCONSISTENCY: anchor[{i}] is not an object")
                continue
            for ep in ("endpointA", "endpointB"):
                pt = anc.get(ep)
                if not isinstance(pt, dict) or not all(_is_number(pt.get(k)) for k in ("x", "y", "z")):
                    failures.append(f"ANCHOR_INCONSISTENCY: anchor[{i}].{ep} missing numeric x/y/z")
            mv = anc.get("measuredValueMm")
            if not (isinstance(mv, int) and not isinstance(mv, bool) and mv > 0):
                failures.append(f"ANCHOR_INCONSISTENCY: anchor[{i}].measuredValueMm must be a positive integer")
            if anc.get("entryMethod") != "typed":
                failures.append(
                    f"ANCHOR_INCONSISTENCY: anchor[{i}].entryMethod must be 'typed' in P1 (got {anc.get('entryMethod')!r})"
                )

    # ── §10.7 photos parity ────────────────────────────────────────────────
    ndjson = os.path.join(bundle_dir, "photos", "photos_metadata.ndjson")
    if os.path.isfile(ndjson):
        with open(ndjson, "r", encoding="utf-8") as fh:
            line_count = sum(1 for ln in fh if ln.strip())
        photos = manifest.get("photos")
        if isinstance(photos, list) and line_count != len(photos):
            failures.append(
                f"PHOTO_COUNT_MISMATCH: photos_metadata.ndjson has {line_count} lines "
                f"but manifest.photos has {len(photos)}"
            )

    return failures


# ── Fixture generation ─────────────────────────────────────────────────────

def make_fixture(dest: str) -> None:
    """Write a minimal synthetic VALID v1 capture bundle with tiny placeholders."""
    os.makedirs(os.path.join(dest, "photos"), exist_ok=True)

    # Tiny placeholder binaries (content is irrelevant; checksums are computed
    # over whatever we write).
    files = {
        "captured_room.json": b'{"walls":[],"openings":[],"objects":[]}\n',
        "scan.usdz": b"USDZ\x00placeholder-bytes-for-fixture-only\x00",
        "mesh.ply": b"ply\nformat ascii 1.0\nelement vertex 0\nend_header\n",
    }
    photo_bytes = b"\xff\xd8\xff\xe0PLACEHOLDER-HEIC\xff\xd9"
    photo_rel = "photos/auto_001.50.heic"
    files[photo_rel] = photo_bytes

    artifacts = []
    for rel, data in files.items():
        with open(os.path.join(dest, rel), "wb") as fh:
            fh.write(data)

    def artifact(kind: str, rel: str, mime: str) -> dict:
        full = os.path.join(dest, rel)
        return {
            "kind": kind,
            "relativePath": rel,
            "sizeBytes": os.path.getsize(full),
            "sha256": sha256_of(full),
            "mimeType": mime,
        }

    artifacts.append(artifact("capturedRoomJson", "captured_room.json", "application/json"))
    artifacts.append(artifact("usdz", "scan.usdz", "model/vnd.usdz+zip"))
    artifacts.append(artifact("mesh", "mesh.ply", "model/ply"))

    # One posed photo → one ndjson line → manifest.photos length 1.
    photo_entry = {
        "id": "00000000-0000-4000-8000-000000000001",
        "relativePath": photo_rel,
        "kind": "auto",
        "capturedAt": "2026-07-17T15:05:00Z",
        "timestampSeconds": 50.0,
        "mimeType": "image/heic",
        "sizeBytes": len(photo_bytes),
        "width": 4032,
        "height": 3024,
        "isFullResolution": True,
        "cameraTransform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        "cameraIntrinsics": {"fx": 3200.0, "fy": 3200.0, "cx": 2016.0, "cy": 1512.0, "width": 4032, "height": 3024},
        "eulerAngles": [0.0, 0.0, 0.0],
    }
    with open(os.path.join(dest, "photos", "photos_metadata.ndjson"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(photo_entry) + "\n")

    anchors = [
        {
            "id": "00000000-0000-4000-8000-0000000000a1",
            "index": 0, "label": "north wall run", "spanKind": "span", "entryMethod": "typed",
            "endpointA": {"x": 0.02, "y": 0.0, "z": -1.88},
            "endpointB": {"x": 4.40, "y": 0.0, "z": -1.87},
            "modelSpanMeters": 4.381, "measuredValueMm": 4394,
        },
        {
            "id": "00000000-0000-4000-8000-0000000000a2",
            "index": 1, "label": "east wall run", "spanKind": "span", "entryMethod": "typed",
            "endpointA": {"x": 4.40, "y": 0.0, "z": -1.87},
            "endpointB": {"x": 4.39, "y": 0.0, "z": 3.11},
            "modelSpanMeters": 4.980, "measuredValueMm": 4991,
        },
        {
            "id": "00000000-0000-4000-8000-0000000000a3",
            "index": 2, "label": "ceiling height", "spanKind": "height", "entryMethod": "typed",
            "endpointA": {"x": 1.00, "y": 0.0, "z": 0.0},
            "endpointB": {"x": 1.00, "y": 2.74, "z": 0.0},
            "modelSpanMeters": 2.740, "measuredValueMm": 2743,
        },
    ]

    manifest = {
        "schemaVersion": 3,
        "bundleSpecVersion": 1,
        "scanId": "00000000-0000-4000-8000-00000000dead",
        "roomName": "Fixture Room",
        "createdAt": "2026-07-17T15:04:00Z",
        "completedAt": "2026-07-17T15:14:30Z",
        "unverified": False,  # 3 anchors → verified
        "checksumAlgorithm": "sha256",
        "device": {"model": "iPhone16,2", "osVersion": "26.5", "hasLidar": True, "roomPlanVersion": "1.0"},
        "capture": {"highFidelityDepthEnabled": False, "autoPhotoInterval": 2.0},
        "session": {
            "sessionId": "00000000-0000-4000-8000-00000000beef",
            "appVersion": "1.4.0", "appBuild": "812",
            "startedAt": "2026-07-17T15:04:00Z", "endedAt": "2026-07-17T15:14:30Z",
            "captureDurationSeconds": 630,
            "arWorldTrackingConfig": "shared-roomcapture", "thermalPeak": "nominal",
        },
        "anchors": anchors,
        "scorecard": {
            "coveragePct": 92, "sharpFrameRatio": 0.87, "trackingHealth": "good",
            "anchorCount": 3, "verdict": "green",
            "surfaceChecklist": [
                {"surface": "floor", "covered": True},
                {"surface": "ceiling", "covered": True},
                {"surface": "wall:north", "covered": True},
            ],
        },
        "poseGraphSummary": {
            "keyframeCount": 312, "nodeCount": 312, "edgeCount": 1180,
            "loopClosures": 4, "meanTranslationDriftPct": 0.31, "blurRejectedCount": 47,
        },
        "captureEnvironment": {"coverageHeatmapPresent": False},
        "annotations": {"roomNotes": ""},
        "artifacts": artifacts,
        "photos": [photo_entry],
    }

    with open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)


# ── Self-test ──────────────────────────────────────────────────────────────

def selftest() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        good = os.path.join(tmp, "bundle")
        make_fixture(good)

        failures = validate_bundle(good)
        if failures:
            print("SELFTEST FAIL: fresh fixture did not validate:", file=sys.stderr)
            for f in failures:
                print("  " + f, file=sys.stderr)
            return 1
        print("selftest: fresh fixture validates cleanly (0 failures) — OK")

        # Corrupt one artifact's bytes without touching its declared sha256, and
        # delete one file. Expect CHECKSUM_MISMATCH + MISSING_FILE, both named.
        with open(os.path.join(good, "scan.usdz"), "ab") as fh:
            fh.write(b"CORRUPTION")
        os.remove(os.path.join(good, "mesh.ply"))

        failures = validate_bundle(good)
        tokens = {f.split(":", 1)[0] for f in failures}
        need = {"CHECKSUM_MISMATCH", "MISSING_FILE"}
        print(f"selftest: corrupted fixture produced failures: {sorted(tokens)}")
        for f in failures:
            print("  " + f)
        if not need.issubset(tokens):
            print(
                f"SELFTEST FAIL: expected {sorted(need)} in failures, got {sorted(tokens)}",
                file=sys.stderr,
            )
            return 1

    print("SELFTEST PASS: valid bundle accepted; corrupted bundle rejected naming both violations.")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a Field Capture bundle (capture-bundle-spec-v1).",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("bundle_dir", nargs="?", help="path to a bundle directory to validate")
    group.add_argument("--make-fixture", metavar="DIR", help="write a minimal synthetic valid bundle to DIR")
    group.add_argument("--selftest", action="store_true", help="run the built-in self-test")
    args = parser.parse_args(argv)

    if args.selftest:
        return selftest()

    if args.make_fixture:
        make_fixture(args.make_fixture)
        print(f"wrote fixture bundle to {args.make_fixture}")
        return 0

    failures = validate_bundle(args.bundle_dir)
    if failures:
        print(f"INVALID: {len(failures)} failure(s) in {args.bundle_dir}", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
        return 1
    print(f"VALID: {args.bundle_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
