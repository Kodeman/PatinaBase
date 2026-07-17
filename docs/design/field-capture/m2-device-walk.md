# Field Capture P1 — M2 device walk

Consolidated handoff for the M2 gate. M2 is proven by a **single end-to-end run on a
real LiDAR device (Kody's iPhone Pro)**: scan a real room in Patina Field, capture
anchors + context, finish, upload, and confirm the bundle landed intact **server-side
on Strata**. Everything below the simulator gate is device-only — this doc is the walk
script + the wording-review worksheet + the known-owed edges.

## Branch + commits

- **Branch:** `field-capture/p1-ios-capture-core` (worktree `.claude/worktrees/fc-p1-ios`; **not** merged to main).
- **Key commits** (newest first):
  - `02fa8bd6` — M2-gate fixes: C1 (confirm discrimination), C2 (durable bundle home), M1 (planner-wired), M2 (tar contract test), M3 (relaunch reconciliation)
  - `a4bc5c7f` — drop dead foreground-upload remnants
  - `6003fdea` — resumable background upload + transport archives (item 8, Part 3)
  - `33837fc3` — bundle assembly + resumable upload (item 8, Parts 1–2)
  - `238a498e` / `b4ddac6d` — context capture → Capture Inbox (item 7)
  - `41ec487b` / `4c165809` — typed anchor entry + soft UNVERIFIED gate (item 6)
  - earlier — coach + QA gate (item 5), keyframe recorder (item 4), shared-ARSession core (item 3)

## Build prerequisites

- **Signing team** `VP22LXHT7L`; bundle id `cloud.patina.field`. Set the CaptureKit + Capture targets to that team, automatic signing, a real device.
- **`Secrets.swift`** — copy `Capture/App/Configuration/Secrets.example.swift` → `Capture/App/Configuration/Secrets.swift` and fill `supabaseURL` + `supabaseAnonKey` for the **Field** Supabase project (Strata anon key). Without it the app builds but can't auth/upload.
- **`ruby scripts/generate_project.rb`** regenerates `Capture.xcodeproj/project.pbxproj` from a `**/*.swift` glob; it has been **regenerated many times** across items 3–8. **Kody's stashed device-build pbxproj mods in the main checkout (`stash@{0}`) will very likely NOT apply cleanly** on top of the regenerated project. Re-apply device signing/capabilities either (a) through the generator (edit `scripts/generate_project.rb`'s target config so a regen is idempotent) or (b) manually in Xcode after each regen. Re-run the generator any time Swift files are added/removed, then re-check signing.
- **Field auth:** sign in through **Account → Connect Patina Field** (QR is `field://login` only — every `patina://` QR is rejected). Fresh signups must be email-confirmed before they can sign in.

---

## Device-walk script (items 3–8)

Run top to bottom in one session. Each step names the item it proves and folds in the
C1/C2/M3 behavior corrections.

### Setup
- [ ] Launch Patina Field on the LiDAR device, signed in. Confirm the marketplace/home renders (no white screen ⇒ Secrets wired).
- [ ] Enter the Pro site-scan flow; F1 picks a **guard-ownable** project (designer_id/created_by = you). Note the picked project + room for the server queries below.

### Scan — shared-ARSession core (item 3)
- [ ] Start the scan; walk the room slowly. The **parametric graph updates live** (walls/openings appear) while the shared session records mesh + smoothed depth.
- [ ] Run ~10 minutes without a thermal shutdown; streams share one clock/coordinate frame (verified later by the manifest's single session block).

### Keyframes (item 4)
- [ ] Motion auto-fires keyframes (~0.5 m / 15°, sharpness-gated). Expect **200–400 keyframes** on a normal room; the blur-rejection ratio is logged to the manifest (`poseGraphSummary.blurRejectedCount` / `rawBlurFailures`). Bundle stays inside the 300–600 MB budget.

### Skip-a-wall check — coach + QA gate (item 5)
- [ ] **Deliberately skip one wall.** The end scorecard must come back **non-green** and **name that wall** in the "walk me to the gap" list (e.g. `North wall not fully captured`), verdict headline `Gaps to fix before you leave`.
- [ ] Re-cover the wall; confirm the verdict recovers toward amber/green. The scorecard persists into `scorecard.json` (and the manifest).

### Anchors — typed entry + soft gate (item 6)
- [ ] Tap two points on the live model, type the measured value (tape/laser). Enter **three spans** (two long walls + one floor-to-ceiling) in **≤ 60 s**.
- [ ] Enter an out-of-range/garbled value once → the `Check the value` state blocks it (A2 upper bound 30000 mm; smart-quote `13' 2"` must parse).
- [ ] To test the soft gate, finish with **fewer than three** anchors → the finish button reads **`Finish — mark UNVERIFIED`** and the manifest's `unverified` flag is `true`. With three, it's `Finish` and `unverified` is `false`.

### Context captures → Capture Inbox (item 7)
- [ ] Mid-scan, capture a **detail photo** (`Photo added to Inbox`) and a **voice note** (`Voice note added to Inbox`), each pinned to the current pose.
- [ ] These land in the **Capture Inbox** with a spatial address carried in **provenance only** (see server query). Note: the inbox row does NOT persist project_id/project_room_id columns — the association is in `provenance.siteScanContext.*`.

### Finish + bundle inspection (item 8)
- [ ] Finish the scan. RoomPlan finalizes; the rig writes `mesh.ply` + drains depth, then the manifest is assembled.
- [ ] **Pull the bundle off the device** (see extraction below) and run it through the validator:
  ```
  python3 scripts/validate_capture_bundle.py <path>/site-scan-<uuid>
  ```
  Expect **exit 0**. The bundle now lives under **Application Support/SiteScans/** (C2), not tmp.

### Upload (item 8 — the M2 AC)
- [ ] Let the upload run. Artifacts transport on a **background URLSession**; the durable `ScanUploadRecord` tracks per-artifact status. Watch the F4 progress reach 100%.
- [ ] The two heavy streams upload as **archives** — `depth.tar` (→ `depth_archive_url`) and `keyframes.tar` (→ `scan_bundle_url`) — alongside the per-file listing.

### Kill / resume checks (item 8 — durability)
- [ ] **Foreground retry:** trigger a mid-upload failure (toggle airplane mode briefly); confirm F4 shows an inline error + **Retry** with the "kept on this device" copy, and retry **resumes** (already-uploaded artifacts skipped — status-driven).
- [ ] **Kill/relaunch:** force-quit mid-upload, relaunch, reopen F4. The **same scanId** resumes from the durable record (no new `room_scans` row); the bundle is still on disk (Application Support survives the kill).
- [ ] **C1 negative:** if `confirm-scan-bundle` rejects the bundle (409 missing artifacts), the row must stay `processing` and F4 must offer retry — it must **never** flip to `ready`. (The RPC fallback only fires when confirm is unreachable: transport/relay/404/5xx.)

### Server-side inspection (Strata)
Pull the `scanId` from the F4 receipt (and the client scan-session id for context rows).

- [ ] **room_scans row** — `scan_schema_version = 3`, `artifacts_sha256` populated (JSONB keyed by ArtifactKind), status transitioned `processing → ready`, URL columns set:
  ```sql
  select id, status, scan_schema_version, artifacts_sha256,
         model_url, captured_room_json_url, mesh_url, bundle_manifest_url,
         depth_archive_url, scan_bundle_url, scanned_at
  from room_scans where id = '<scanId>';
  ```
- [ ] **Storage objects present at the 00287 paths** (`room-scans` bucket, `{folder}/{userIdLower}/{roomIdLower}/{filename}`):
  ```sql
  select name from storage.objects
  where bucket_id = 'room-scans' and name like '%/'||lower('<roomId>')||'/%'
  order by name;
  ```
  Expect: `usdz/…/scan.usdz`, `captured_room/…/captured_room.json`, `mesh/…/mesh.ply`,
  `manifests/…/manifest.json`, `depth/…/depth_index.ndjson`, `depth/…/depth.tar`,
  `bundle/…/keyframes.tar`, `keyframes/…/keyframe_index.ndjson`,
  `keyframes/…/keyframe_summary.json`, `scorecard/…/scorecard.json`, `anchors/…/anchors.json`,
  and `photos/…` for any posed photos.
- [ ] **confirm-scan-bundle → 200** (it HEAD-verifies `model_url`, `captured_room_json_url`, `scan_bundle_url`; `depth_archive_url` optional) and calls `mark_scan_upload_complete`. Check the edge-function logs for a 200 on this scanId.
- [ ] **field_captures rows** for the context captures, carrying provenance:
  ```sql
  select id, provenance->'siteScanContext' as ctx, created_at
  from field_captures
  where provenance->'siteScanContext'->>'scanId' = '<clientScanSessionId>'
  order by created_at;
  ```
  Each `ctx` should carry `source = "site-scan-context"`, `scanId`, `projectId`,
  `projectRoomId`, `cameraPose` (16 comma-joined values on Pro), `capturedAt`.
- [ ] **Validator on the device bundle** — `python3 scripts/validate_capture_bundle.py <bundle>` exits **0** (already run above; keep the transcript with the walk record).

**Extracting the bundle from the device:** Xcode → *Window → Devices and Simulators* →
select the device → *Installed Apps → Patina Field* → gear → **Download Container** →
right-click the `.xcappdata` → *Show Package Contents* →
`AppData/Library/Application Support/SiteScans/site-scan-<uuid>/`. (The Files app will
**not** surface Application Support unless the app enables file sharing, which it does
not — use Download Container.)

---

## ESCALATE wording catalogue (Kody's review worksheet)

Every user-facing string in items 5/6/7 ships as an **ESCALATE-class placeholder** —
review/replace wording during the walk. Sources: `SiteScanCoachViews.swift`,
`ScorecardEvaluator.swift` / `FieldCoverageCoach.swift`, `SiteScanAnchorViews.swift`,
`SiteScanContextCapture.swift`.

| # | Placeholder string (as shipped) | Screen / location | Item |
|---|---|---|---|
| 1 | `UNVERIFIED` (badge) | Scorecard card + drawing stamp | 5 |
| 2 | `Before you leave` | Scorecard card title | 5 |
| 3 | `Coverage <n> percent` | Coverage meter a11y label | 5 |
| 4 | `Looks complete` | Verdict headline — green | 5 |
| 5 | `Usable — review the gaps` | Verdict headline — amber | 5 |
| 6 | `Gaps to fix before you leave` | Verdict headline — red | 5 |
| 7 | `<Bearing> wall` / `Floor` / `Ceiling` / `Opening <n>` | Surface names (checklist + gap list) | 5 |
| 8 | `<surface> not fully captured` | Gap phrase — "walk me to the gap" | 5 |
| 9 | `Slow down` | On-site warning — moving too fast | 5 |
| 10 | `Hold steady` | On-site warning — not steady | 5 |
| 11 | `Add light` | On-site warning — too dark | 5 |
| 12 | `Move closer` | On-site warning — > 4 m distance | 5 |
| 13 | `Add measured spans` | Anchor panel title | 6 |
| 14 | `Anchor <n> of 3` | Anchor progress | 6 |
| 15 | `Tap the two ends of a real span (a wall run, or floor to ceiling)` | Anchor hint — step 0 | 6 |
| 16 | `Tap the second point` | Anchor hint — step 1 | 6 |
| 17 | `Type what your tape or laser reads` | Anchor hint — value entry | 6 |
| 18 | `Aim at a wall or the floor and tap again` | Anchor hint — tap missed geometry | 6 |
| 19 | `Measured on model` | Anchor readout label | 6 |
| 20 | `Check the value` | Anchor — out-of-range / unparseable (A2) | 6 |
| 21 | `Add` / `Retap` | Anchor buttons | 6 |
| 22 | `Finish — mark UNVERIFIED` / `Finish` | Anchor finish button (soft gate) | 6 |
| 23 | `Photo` / `Note` / `Stop` | Context capture pills | 7 |
| 24 | `Photo added to Inbox` | Context toast — photo success | 7 |
| 25 | `Voice note added to Inbox` | Context toast — voice success | 7 |
| 26 | `Couldn't capture — try again` | Context toast — capture failure | 7 |
| 27 | `Microphone unavailable` | Context toast — no mic permission | 7 |
| 28 | `Nothing recorded` | Context toast — empty voice note | 7 |
| 29 | `Reference capture` | Non-Pro screen title | 7 |
| 30 | `Photos & notes for this room` | Non-Pro screen subtitle | 7 |
| 31 | `This device has no LiDAR, so this isn't a scan — these land in your Inbox.` | Non-Pro screen body | 7 |

Item-8 upload/error copy is also placeholder and worth a pass: the failure line +
"Your scan is kept on this device — retry now, or finish later without losing it."
(`SiteScanReviewUploadViews.swift`), and `SiteScanError.bundleRejected` →
"The server couldn't verify this scan's files yet." (C1 retry surface).

---

## Known device-owed edges

Built and compiling; only device verification (or a later cycle) is owed.

1. **Airplane-mode mid-upload resume** — the background-URLSession resume path is built and status-driven; only a device run proves clean resume after a real connectivity drop.
2. **500 MB unattended completion** — the archive-per-stream transport collapses ~700 tasks to a handful; a real full-size bundle completing without babysitting F4 is device-only.
3. **Background-relaunch rehydration** — `reconcileExistingTasks()` adopts surviving tasks + dedups, and the app-delegate seam parks the system completion handler. **Requirement to verify:** on a pure background relaunch (app killed, system wakes only to deliver upload events) the service must be **instantiated** so the background session is recreated and the delegate reattaches — confirm `SupabaseSiteScanService` (and thus the uploader) is created on that launch path, otherwise the parked completion handler never fires.
4. **No continuation watchdog** — if an adopted/in-flight task neither completes nor re-delivers a terminal event, the awaiting `upload()` continuation for that kind never resolves. The durable record + resume bound the damage (a fresh launch re-plans), but a timeout that fails the continuation and re-enqueues is **deferred, not built** (noted in the uploader header).
5. **Sharpness-threshold calibration** — `KeyframeGate.standard` uses `sharpnessThreshold = 10.0` (variance-of-Laplacian), an untuned starting value. Read the real blur-rejection ratio from the manifest on the walk and recalibrate against the 200–400-keyframe / 300–600 MB targets (item 4).
6. **Voice-note transcript seam** — context voice notes ship as audio + pose into the Inbox; **on-device transcription is a deferred seam** (P1 persists the recording; transcript wiring is owed, not built).
