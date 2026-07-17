# Capture Bundle Spec v1 — "The Instrument"

Field Capture P1 · Part B item 2 · M1 review deliverable
Issued 2026-07-17 · Design authority → Claude Code
Companion: `field-capture-p1-package.md` (build order), `patina-field-capture-architecture.html` (SC deck, sheets SC-06→SC-13), `00341_field_capture_p1_schema.sql` (the four additive tables), `scripts/validate_capture_bundle.py` (the CLI validator).

---

## 1. Purpose & scope

This spec defines the **on-disk capture bundle** the Patina Field instrument writes for one room and uploads to the `room-scans` bucket — the artifact M2 will inspect server-side. It is a strict **superset of the live v3 iOS `ScanManifest`** (`apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift`), not a parallel format (R-e). A v3 bundle decodes cleanly against this spec; a v1 capture bundle adds the instrument layer — typed ground-truth anchors, the QA scorecard, a pose-graph summary, required per-file checksums, and the UNVERIFIED flag — on top of everything v3 already carries.

The DB value `room_scans.scan_schema_version = 3` marks a bundle as a v1 capture bundle (the column exists since 00077; Field writes the value, no DDL). The manifest additionally carries `bundleSpecVersion: 1` so a reader distinguishes a Field *instrument* bundle from a plain Patina *client* v3 bundle without a DB round-trip.

What this spec does **not** cover: SfM pose refinement, dense fusion, splat training, or drawing generation (P2 / later P1 items). The `poseGraphSummary` here is the **on-device** pose graph the shared ARSession already holds — a summary, not a refined SfM graph. Context capture (voice notes, detail photos) lands in the **Capture Inbox** (`field_captures`, 00233), not in the scan bundle; it is a sibling stream, referenced but not embedded.

---

## 2. Relationship to the v3 ScanManifest (field-by-field)

The deck (SC-12) describes the manifest only as *"device, session, anchors, pose graph"* — a section list, not a key list. The live v3 `ScanManifest` is the concrete contract this spec supersets. Every v3 top-level key is **inherited** unchanged; the instrument layer is **new**.

| v3 `ScanManifest` field | Disposition in v1 capture bundle | Notes |
|---|---|---|
| `schemaVersion` (Int, =3) | **inherited** | On-disk bundle format version. Stays 3. |
| `scanId` (UUID) | **inherited** | = `room_scans.id` server-side. |
| `roomLocalId`, `roomName` | **inherited** | |
| `createdAt`, `completedAt` | **inherited** | |
| `device{model, osVersion, hasLidar, roomPlanVersion}` | **inherited** | Satisfies the deck's "device" + the package's "OS version" requirement. |
| `capture{highFidelityDepthEnabled, autoPhotoInterval, multiRoomBuilderId}` | **inherited** | |
| `artifacts[{kind, relativePath, sizeBytes, sha256, mimeType}]` | **extended** | `sha256` becomes **REQUIRED** for every artifact in a v1 bundle (optional in v3). `ArtifactKind` gains no new *required* kinds; `capturedRoomJson` + `usdz` are mandatory. |
| `photos[PhotoEntry]` | **inherited** | Posed **context** photos. Field writes the per-photo sidecar as a **top-level `photos_metadata.json`** (a JSON array of `FieldPhotoEntry`, 1:1 with `room_scan_images`) — the validator also still accepts the deck's `photos/photos_metadata.ndjson`. NB the deck's `keyframes/`→`photos/` mapping does **not** apply to Field: Field keeps a **separate `keyframes/` dir** (SfM lane, §4/§3.6) distinct from these posed photos (context lane). |
| `captureEnvironment{…}` | **inherited** | lightEstimate, thermalState, batteryLevel, motionQuality, opticalFlowMean, sceneDepthFrameCount, coverageHeatmapPresent. |
| `annotations{roomNotes, userProvidedRoomName, reviewCompletedAt}` | **inherited** | |
| — | **new** `bundleSpecVersion` (Int, =1) | Distinguishes a Field instrument bundle from a plain v3 client bundle. |
| — | **new** `session{…}` | Session identity + timing (§3.2). |
| — | **new** `anchors[…]` | Typed ground-truth anchors (§3.3) → `scan_anchors`. |
| — | **new** `scorecard{…}` | QA gate result (§3.4). |
| — | **new** `poseGraphSummary{…}` | On-device pose-graph summary (§3.5). |
| — | **new** `unverified` (Bool) | Session closed with < 3 anchors (§6). |
| — | **new** `checksumAlgorithm` (String, ="sha256") | Integrity contract (§7). |
| — | **new** `keyframes/` sidecar dir | `keyframe_index.ndjson` + `keyframe_summary.json`, listed as `keyframeIndex` / `keyframeSummary` artifacts (item 8, §3.6/§4). Field's SfM lane — **distinct** from posed `photos/`. |

Backward compatibility is preserved the way v3 preserved v2: every new key is additive; a v3-only reader ignores unknown keys, and a v1 reader treats the new keys as required only when `bundleSpecVersion >= 1`.

---

## 3. `manifest.json` schema

The manifest is the authoritative inventory. All v3 keys (§2) remain; the instrument keys below are added. Types are JSON; the source of truth for the inherited half is `ScanManifest.swift`.

### 3.1 Top level (instrument additions)

```jsonc
{
  "schemaVersion": 3,            // v3 on-disk format (inherited)
  "bundleSpecVersion": 1,        // NEW — Field instrument bundle marker
  "scanId": "…uuid…",
  "roomName": "Dining Room",
  "createdAt": "2026-07-17T15:04:00Z",
  "completedAt": "2026-07-17T15:14:30Z",
  "unverified": false,           // NEW — true iff anchors.length < 3 (§6)
  "checksumAlgorithm": "sha256", // NEW — §7

  "device":   { … v3 DeviceInfo … },
  "capture":  { … v3 CaptureInfo … },
  "session":  { … §3.2 … },          // NEW
  "anchors":  [ … §3.3 … ],          // NEW
  "scorecard":{ … §3.4 … },          // NEW
  "poseGraphSummary": { … §3.5 … },  // NEW
  "captureEnvironment": { … v3 … },
  "annotations":        { … v3 … },
  "artifacts": [ … §3.6 … ],
  "photos":    [ … v3 PhotoEntry … ]
}
```

### 3.2 `session`

```jsonc
"session": {
  "sessionId": "…uuid…",          // ARSession run id; distinct from scanId
  "appVersion": "1.4.0",
  "appBuild": "812",
  "startedAt": "2026-07-17T15:04:00Z",
  "endedAt":   "2026-07-17T15:14:30Z",
  "captureDurationSeconds": 630,   // AC target ≤ 12 min = 720 s (SC-16)
  "arWorldTrackingConfig": "shared-roomcapture", // iOS 17 shared-session pattern (SC-07)
  "thermalPeak": "nominal"         // peak ProcessInfo.thermalState during capture
}
```

### 3.3 `anchors` (→ `scan_anchors`)

The accuracy contract (SC-08): *two long spans + one ceiling height*, entered as taps on the live model with a typed value. P1 is **typed only** (R1). Endpoints are the raw taps in **model space, metres** (R-h).

```jsonc
"anchors": [
  {
    "id": "…uuid…",             // client_anchor_id — idempotency key
    "index": 0,                  // capture order
    "label": "north wall run",
    "spanKind": "span",          // 'span' | 'height'
    "entryMethod": "typed",      // P1: 'typed' only (R1)
    "endpointA": { "x": 0.021, "y": 0.004, "z": -1.883 },  // metres, ARKit world frame
    "endpointB": { "x": 4.402, "y": 0.006, "z": -1.871 },
    "modelSpanMeters": 4.381,    // captured tap-to-tap distance (for scale residual)
    "measuredValueMm": 4394      // typed ground truth, integer mm (R-h)
  }
]
```

Server landing: one `scan_anchors` row per entry, upserted on `(scan_id, client_anchor_id)`.

### 3.4 `scorecard` (→ persisted into the manifest; surfaced by the coach)

The QA gate (SC-09). The verdict is advisory — red walks the user to the gap, it does not block the upload.

```jsonc
"scorecard": {
  "coveragePct": 92,             // painted-mesh coverage
  "sharpFrameRatio": 0.87,       // sharp keyframes / total
  "trackingHealth": "good",      // 'good' | 'fair' | 'poor'
  "anchorCount": 3,              // MUST equal anchors.length (validator checks)
  "verdict": "green",            // 'green' | 'amber' | 'red'
  "surfaceChecklist": [
    { "surface": "floor",   "covered": true },
    { "surface": "ceiling", "covered": true },
    { "surface": "wall:north", "covered": true },
    { "surface": "opening:door-1", "covered": false }
  ],
  "namedGaps": [                 // item-8 sync: [{surface, phrase}], NOT [String]
    { "surface": "opening:door-1", "phrase": "the doorway to the hall" }
  ]
}
```

`namedGaps` is an **array of `{surface, phrase}` objects** (one per gap the coach can name aloud) — superseding the earlier `[String]` shape (item 8, blessed §11). It is **optional**; the validator (§10) checks the object shape only when present.

### 3.5 `poseGraphSummary`

The on-device pose graph the shared ARSession holds — a **summary** only (full SfM is P2, SC-10). **Required** top-level manifest key in a v1 capture bundle (M1 review fix — the P1 package AC gates this section; the validator's `REQUIRED_TOP_LEVEL_KEYS` and `--make-fixture` both treat it as mandatory, not optional).

```jsonc
"poseGraphSummary": {
  "keyframeCount": 312,          // target 200–400 (SC-07)
  "nodeCount": 312,
  "edgeCount": 1180,
  "loopClosures": 4,
  "meanTranslationDriftPct": 0.31, // ARKit drift estimate (~0.2–0.5%, SC-13)
  "blurRejectedCount": 47,         // keyframes dropped by the sharpness gate
  "rawBlurFailures": 63,           // NEW (item 8) — raw sharpness-gate failures before dedup
  "encodeDropped": 2               // NEW (item 8) — keyframes lost to HEIC encode backpressure
}
```

`rawBlurFailures` and `encodeDropped` are Field-added instrument counts (item 8). The validator (§10) requires `keyframeCount`, `blurRejectedCount`, `rawBlurFailures`, and `encodeDropped` to be integers when present.

### 3.6 `artifacts` (v3 shape, `sha256` now required)

```jsonc
"artifacts": [
  { "kind": "capturedRoomJson", "relativePath": "captured_room.json",
    "sizeBytes": 48213, "sha256": "…64 hex…", "mimeType": "application/json" },
  { "kind": "usdz", "relativePath": "scan.usdz",
    "sizeBytes": 5120344, "sha256": "…", "mimeType": "model/vnd.usdz+zip" }
]
```

`capturedRoomJson` and `usdz` are **mandatory**; `mesh`, `worldMap`, `depthArchive`, `coverageHeatmap`, `annotations`, `photoThumbnails`, `depthIndex`, `photosManifest`, `scorecard`, `anchors`, `keyframeIndex`, `keyframeSummary`, `bundleManifest` are optional and validated only when listed. Field's assembler emits `usdz`, `capturedRoomJson`, `mesh`, `depthIndex`, `photosManifest` (the top-level `photos_metadata.json`), `scorecard`, `anchors`, `keyframeIndex`, and `keyframeSummary` (item 8).

---

## 4. Directory layout

Canonical on-disk layout, reconciling the live v3 bundle (`Application Support/Scans/{scanId}/`) with the deck's SC-12 section list. Live v3 filenames win over the deck's aspirational names (blessed §11). The deck's `room.param.json`→`captured_room.json` and `room.usdz`→`scan.usdz` mappings hold. The deck's `keyframes/`→`photos/` mapping does **not** apply to Field (item 8, blessed §11): Field keeps `photos/` (posed **context** photos) and a **separate `keyframes/` dir** (the SfM-lane frames) as two distinct lanes.

```
<scanId>/
  manifest.json                 # authoritative inventory (§3)
  captured_room.json            # REQUIRED — RoomPlan parametric graph (deck: room.param.json)
  scan.usdz                     # REQUIRED — textured mesh (deck: room.usdz)
  mesh.ply                      # optional — LiDAR scene mesh (deck: mesh/)
  world_map.arworldmap          # optional — relocalization
  coverage_heatmap.json         # optional — XZ coverage grid
  annotations.json              # optional — v3 review annotations
  anchors.json                  # optional — sidecar mirror of manifest.anchors (kind: anchors)
  scorecard.json                # optional — sidecar mirror of manifest.scorecard (kind: scorecard)
  photos_metadata.json          # Field sidecar — JSON ARRAY of FieldPhotoEntry (len == photos.length); TOP-LEVEL, kind: photosManifest
  photos/                       # posed CONTEXT photos (context lane — NOT the deck's keyframes/)
    auto_001.50.heic
    thumb_auto_001.50.jpg
    photos_metadata.ndjson      # legacy deck path — one FieldPhotoEntry per line; still accepted, but Field writes the top-level photos_metadata.json instead
  keyframes/                    # SfM lane (item 8) — distinct from posed photos/
    keyframe_index.ndjson       # one JSON object per fired keyframe (non-blank line count == keyframe_summary.fired)
    keyframe_summary.json       # { fired, blurRejected, rawBlurFailures, encodeDropped, blurRejectionRatio }
    keyframe_<…>.heic           # per-keyframe image
    keyframe_<…>.bin            # per-keyframe pose/telemetry sidecar
  depth/                        # optional — LiDAR evidence (deck: depth/)
    depth_index.ndjson          # depth-frame index
    <frame>.bin                 # per-frame depth payload (.bin, not PNG)
```

**No `notes/` directory in v1.** Context notes (deck `notes/`) are **not** in this bundle — they route to the Capture Inbox (`field_captures`, 00233) with a spatial address (item 7), a sibling stream, never a bundle dir.

**Storage path on upload** (unchanged from 00077/00287): `{artifactType}/{userId}/{scanId}/…` in the private `room-scans` bucket (500 MB limit; MIME list from 00077). No new bucket (R-e). Bundle budget: **300–600 MB/room** (SC-12).

---

## 5. Units (explicit — R-h)

Three coordinate/measure regimes, never mixed:

| Regime | Where | Unit | Example |
|---|---|---|---|
| **Model space** | anchor `endpointA/B`, `modelSpanMeters`, all ARKit/RoomPlan poses (`cameraTransform`) | **metres**, ARKit world frame (y-up) | `endpointB.x = 4.402` |
| **DB stored values** | `scan_anchors.measured_value_mm`, `room_file_measurements.value_mm`, `tolerance_mm` | **integer millimetres** | `measuredValueMm = 4394` |
| **Drawings** | rendered SVG/PDF/DXF dimensions (item 11) | **feet–inches** (fractional) | `14' 5"` |

Rationale: model space is whatever ARKit hands us (metres); millimetres-as-integer is the exact, roundoff-free storage unit for tolerances (never floats/dollars-style drift — matches the house "integer" discipline); ft-in is the drawing convention Leah reads. Conversions happen at the boundaries only: metres→mm at ingest (× 1000, round), mm→ft-in at render. Note the **separate** existing lane: `room_scan_geometry`/`_elements` (00337) stores parsed RoomPlan geometry in **feet (numeric)** — that is the display-geometry lane; the anchor/tolerance lane here is **mm (integer)**. They are deliberately distinct and never cross-assigned.

---

## 6. UNVERIFIED flag propagation (R-g / R108.5)

A session may close with **fewer than three anchors**. When it does, the truth-framing chain is:

1. **Manifest** — `unverified: true` is written iff `anchors.length < 3`. The validator (§10) enforces `unverified == (anchors.length < 3)` and `scorecard.anchorCount == anchors.length` — an inconsistent pair is a named failure.
2. **Ingest** — the server sets `room_files.unverified = true` for the generated version and records `anchor_count` on the row + in `certificate`.
3. **Measurements** — every `room_file_measurements` row for an unverified file wears the **widest** `tolerance_class = 'estimated'` (no dimension may claim `verified` without an anchor; the `rfm_anchor_source_shape` CHECK DB-enforces both halves: an `anchor`-sourced row must name its anchor, **and** a `'verified'` `tolerance_class` must have `anchor_id` set regardless of `source` — a `parametric` row can never claim `verified`).
4. **Drawing** — the UNVERIFIED stamp prints in the title block (item 11), and `room_files.tolerance_class` rolls up to the broadest class.

The flag is carried untouched from device to server — item 6's AC ("the flag propagates untouched to the server") is satisfiable because it lives verbatim in the manifest and is re-asserted, never recomputed differently, at each stage.

---

## 7. Checksums & integrity

- **Algorithm: SHA-256** (`checksumAlgorithm: "sha256"`), lowercase hex, 64 chars. Blessed §11 — matches `room_scans.artifacts_sha256` (00082, keyed by `ArtifactKind.rawValue`) and the Swift `Data.sha256` the uploader already computes.
- Every entry in `artifacts[]` carries a **required** `sha256` over the exact bytes at `relativePath`. `photos/` files are covered collectively by the `photosManifest`/`photoThumbnails` artifacts and individually by their `room_scan_images` rows; a v1 bundle SHOULD also list a `photosManifest` artifact with its own checksum.
- On upload the iOS uploader merges each artifact hash into `room_scans.artifacts_sha256` via `merge_scan_artifact_sha256()` (00082); `confirm-scan-bundle` (thin, HEAD-reachability only today) is superseded at item 9 by a checksum-walking ingest that compares stored bytes against `artifacts_sha256`.
- **The CLI validator (§10) is the reference implementation** of the integrity check: file-present + size-match + sha256-match for every listed artifact.

---

## 8. Server-side landing (manifest → rows)

No new `rooms`/`scans`/`capture_bundles`/`assets` tables (R-a). The bundle lands against the existing `room_scans` row (created by the design-request/scan flow) plus the four additive tables in `00341`:

| Manifest section | Lands in | Writer |
|---|---|---|
| top-level urls, `artifacts[].sha256`, progress | `room_scans` columns (00077/00082) + `artifacts_sha256` | iOS uploader (owner) |
| `anchors[]` | `scan_anchors` (upsert on `scan_id`,`client_anchor_id`) | iOS owner write / ingest |
| `photos[]` | `room_scan_images` (00077/00082) | iOS owner write |
| solve output (per-dimension) | `room_file_measurements` | ingest (service-role, item 10) |
| deliverable version + certificate | `room_files` (append-only, new `version`) | ingest (service-role, item 10/11) |
| capture/upload/solve/drawing timings | `scan_pipeline_events` | ingest (service-role, item 13) |

RLS: reads on all four delegate to the scan's own visibility on `room_scans` (owner / designer-association / studio-co-member compose — 00337 pattern). `scan_anchors` additionally takes owner writes (device posts anchors, mirroring `room_scan_images`). `room_files` / `room_file_measurements` / `scan_pipeline_events` are server-generated: SELECT via delegation, writes service-role only. Ingestion RPCs are **out of scope for 00341** — they arrive with item 9.

---

## 9. Provenance & tolerance model (SC-08/11/12/13)

Every published dimension (`room_file_measurements`) is a row with provenance (R-d, SC-12 quad *source / tolerance / verifier / timestamp*):

- `source` — `'anchor'` (grounded on a typed span) | `'parametric'` (from the corrected RoomPlan graph). **P2 widens the CHECK to add `'mesh'`** (dense-fusion evidence).
- `tolerance_mm` — the ± tolerance in integer mm.
- `tolerance_class` — `'verified'` (anchor-exact, ±1 cm / 0.5% target, SC-13) | `'measured'` (parametric, in-tolerance) | `'estimated'` (sloped ceilings, no-anchor spans, any UNVERIFIED file). Matches SC-11's badge triad `verified / measured ± x / estimated`. **DB-enforced (`rfm_anchor_source_shape`, 00341, M1 review fix):** `tolerance_class = 'verified'` requires `anchor_id IS NOT NULL` regardless of `source` — the constraint is not just convention, a `'verified'` row with no anchor cannot be inserted.
- `verified_by` / `verified_at` — the designer-override receipt (SC-08: "field truth always outranks reconstruction").

The **accuracy certificate** (`room_files.certificate`, SC-08 "the receipt") records anchors used, per-anchor residuals, and the class per dimension. Authority order when streams disagree (SC-06): **dense evidence → parametric model → live preview**.

---

## 10. CLI validator contract

`scripts/validate_capture_bundle.py <bundle_dir>` (python3, stdlib only). Exit 0 = valid; non-zero = one or more **named** failures printed to stderr. Checks:

1. **manifest present & parses** — `manifest.json` exists and is valid JSON.
2. **schema** — required top-level keys present: `schemaVersion`, `bundleSpecVersion`, `scanId`, `device`, `session`, `anchors`, `scorecard`, `poseGraphSummary`, `unverified`, `checksumAlgorithm`, `artifacts`. `poseGraphSummary` is **required**, not optional (M1 review fix — the P1 package AC gates it as a manifest section; `--make-fixture` emits it). (`SCHEMA_VIOLATION`)
3. **checksum algorithm** — `checksumAlgorithm == "sha256"`. (`SCHEMA_VIOLATION`)
4. **required artifacts** — `capturedRoomJson` + `usdz` kinds present in `artifacts[]`. (`MISSING_ARTIFACT`)
5. **path containment** — checked BEFORE any file access for every artifact: `relativePath` must not be absolute, must not contain a `..` segment, and its resolved `os.path.realpath` must stay inside `os.path.realpath(bundle_dir)` (catches an intermediate symlinked directory routing outside the bundle); the resolved candidate itself must not be a symlink (an artifact must be a real file, never a link — even one that points back inside the bundle). (`PATH_VIOLATION`, M1 review fix)
6. **per-artifact integrity** — for every artifact: file exists at `relativePath` (`MISSING_FILE`), `sha256` present and matches the computed SHA-256 of the bytes (`CHECKSUM_MISMATCH`), and `sizeBytes` matches actual size when present (`SIZE_MISMATCH`).
7. **anchor / UNVERIFIED consistency** — `unverified == (len(anchors) < 3)` and `scorecard.anchorCount == len(anchors)`; each anchor has `endpointA/B` with numeric `x,y,z`, `measuredValueMm > 0`, `entryMethod == "typed"`. (`ANCHOR_INCONSISTENCY`)
8. **scorecard.namedGaps shape** (item 8) — if `scorecard.namedGaps` is present it must be an **array of `{surface, phrase}` objects** (both strings) — no longer `[String]`. Optional; checked only when present. (`SCHEMA_VIOLATION`)
9. **pose-graph summary shape** (item 8) — if `poseGraphSummary` is present it must be an object; `keyframeCount`, `blurRejectedCount`, `rawBlurFailures`, `encodeDropped` must be integers when present. (`SCHEMA_VIOLATION`)
10. **keyframe index/summary consistency** (item 8) — if both `keyframes/keyframe_index.ndjson` and `keyframes/keyframe_summary.json` exist and the summary carries an integer `fired`, the index's non-blank line count must equal `fired`. (`KEYFRAME_INCONSISTENCY`)
11. **photos parity** — if `photos/photos_metadata.ndjson` exists, its non-empty line count equals `len(manifest.photos)`; the Field **top-level `photos_metadata.json`** (a JSON array) is **also** accepted and its length is checked the same way. (`PHOTO_COUNT_MISMATCH`)

`--make-fixture <dir>` writes a minimal synthetic **valid** bundle (tiny placeholder binaries, checksums computed, `poseGraphSummary` with `rawBlurFailures`/`encodeDropped`, a `scorecard.namedGaps` object array, and a `keyframes/` dir whose `keyframe_index.ndjson` line count matches `keyframe_summary.fired`, listed as `keyframeIndex`/`keyframeSummary` artifacts). `--selftest` runs four cases: (1) a fresh fixture must validate cleanly; (2) a copy with one artifact's bytes corrupted (checksum mismatch) and one file deleted must fail naming **both** `CHECKSUM_MISMATCH` and `MISSING_FILE`; (3) a copy whose manifest lists an artifact with `relativePath: "../escape.bin"` must fail naming `PATH_VIOLATION` (M1 review fix); (4) a copy whose `keyframe_summary.fired` is bumped past the index line count must fail naming `KEYFRAME_INCONSISTENCY` (item 8). No committed binary fixtures.

---

## 11. Blessed decisions (code-only calls — log with rationale)

Per the package's authority note, these are code-only (I-entry class) calls made in this spec; each is reversible and designer-invisible.

| # | Decision | Rationale |
|---|---|---|
| B-1 | **Superset v3, don't fork.** The manifest keeps every v3 `ScanManifest` key and adds the instrument layer; `scan_schema_version` stays the DB marker (=3), `bundleSpecVersion` (=1) is a manifest-only Field marker. | R-e. One decoder path; a v3 client bundle and a v1 instrument bundle share types. Avoids a second uploader/validator. |
| B-2 | **Checksum = SHA-256, lowercase hex.** | Matches `room_scans.artifacts_sha256` (00082) and the Swift `Data.sha256` already computed on-device. Zero new crypto. |
| B-3 | **Keep live v3 filenames; map the deck's aspirational names.** `captured_room.json` (not `room.param.json`), `scan.usdz` (not `room.usdz`), `photos/` (not `keyframes/`). | The v3 names already ship in `ScanBundleWriter`/`FieldPhotoEntry`; renaming would churn working iOS + `room_scan_images` for zero benefit. |
| B-4 | **No whole-bundle compression; rely on already-compressed artifacts.** HEIC photos, USDZ (a zip), optional `depth.zip`, PLY as-is. `bundleArchive` (bundle.zip) stays an optional backup kind, not the transport. | 300–600 MB budget is met by per-file formats; a second gzip layer buys little and complicates resumable range uploads. |
| B-5 | **`sha256` becomes required per artifact in v1** (optional in v3). | The instrument's promise is integrity; the validator/ingest checksum-walk needs a hash on every listed file. |
| B-6 | **Anchor endpoints stored as `{x,y,z}` JSONB in metres; typed value as integer mm.** | Endpoints are opaque model-space coordinates (queried rarely, carried for residual/re-solve) → JSONB is fine; the measured value is exact ground truth → integer mm (R-h), never a float. |
| B-7 | **`client_anchor_id` idempotency key on `scan_anchors`.** | Mirrors `field_captures.client_capture_id` (00233); a resumed/retried upload upserts on `(scan_id, client_anchor_id)` instead of duplicating anchors. |
| B-8 | **Four additive tables, renamed to the house namespace.** `scan_anchors` / `room_files` / `room_file_measurements` / `scan_pipeline_events` (not anchors/measurements/pipeline_events/assets). | R-b. Avoids collisions with `pipeline_stage_events` (00305) and `media_assets` (svc_media); `scan_*`/`room_*` is the family pattern (00077/00082/00337). |
| B-9 | **Reads delegate to `room_scans` RLS; anchors owner-writable; the server-generated three are service-role-write-only.** | R-a + 00337 pattern. One EXISTS composes owner/designer/studio; anchors are device input (owner write, like `room_scan_images`); files/measurements/events are solve output (service-role, no client write). |
| B-10 | **`poseGraphSummary` is the on-device summary, not an SfM graph.** | SfM/COLMAP is P2 (SC-10). P1 carries the ARKit-held pose graph's summary stats so telemetry + the accuracy budget have inputs without building reconstruction. |
| B-11 | **Migration minted at `00341`.** | 00341–00349 verified free on main + all branches; 00350–00369 are the materialized BOH reservation (files exist on boh/* branches). |
| B-12 | **M1 review-pass fixes.** `rfm_anchor_source_shape` CHECK tightened so `tolerance_class = 'verified'` DB-requires `anchor_id` regardless of `source` (was convention-only, comment claimed enforcement that the CHECK didn't do); validator adds `os.path.realpath` containment + symlink refusal for every artifact `relativePath` (`PATH_VIOLATION`); `poseGraphSummary` promoted from documented-but-unchecked to a required top-level manifest key. | Review found the anchor-source CHECK's comment overclaimed what it enforced, the validator trusted manifest-supplied paths without containment checks, and `poseGraphSummary` was never actually gated despite the P1 package AC naming it. |
| B-13 | **Item-8 sync: spec + validator + fixture track the real `FieldManifestAssembler` manifest.** `scorecard.namedGaps` is `[{surface, phrase}]` (was `[String]`); `poseGraphSummary` gains Field counts `rawBlurFailures` + `encodeDropped`. | The iOS assembler is the shipping writer; the spec/validator are the reference contract and must match it byte-for-byte or the CLI rejects real bundles. `namedGaps` carries a coach-speakable phrase per gap, not a bare surface id. |
| B-14 | **Field keeps a separate `keyframes/` SfM lane; the deck's `keyframes/`→`photos/` mapping does not apply to Field.** `keyframes/keyframe_index.ndjson` (one object per fired keyframe) + `keyframe_summary.json` (`fired`/`blurRejected`/`rawBlurFailures`/`encodeDropped`/`blurRejectionRatio`), surfaced as `keyframeIndex`/`keyframeSummary` artifacts. Validator adds `KEYFRAME_INCONSISTENCY` (index line count == `summary.fired`). | Posed photos are the **context** lane (1:1 with `room_scan_images`); the SfM keyframes are a **distinct** lane feeding the pose graph. Collapsing them (per the deck) would conflate two streams with different downstream landings. `notes/` remains absent — context notes route to the Capture Inbox. |
| B-15 | **Photos sidecar is a top-level `photos_metadata.json` (JSON array); the legacy `photos/photos_metadata.ndjson` stays accepted.** | Field's assembler writes the top-level array (kind `photosManifest`); the validator accepts either form so v3/deck-shaped bundles still parse. Parity check compares the sidecar length (array len or ndjson line count) to `len(manifest.photos)`. |
```
