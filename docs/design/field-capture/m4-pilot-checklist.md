# M4 Pilot Readiness Checklist — Field Capture P1

The P1 gate runbook. M4 is the pilot: **one real room, end to end, by Leah,
without developer help.** This file is the ordered path to pilot day, the
pilot-day walk itself, the abort lines, and the items still owed before we run it.

- Package: `field-capture-p1-package.md` item 13 (this is M4, the P1 gate).
- Worker: `services/scan-pipeline/` (README has install + query-surface snippets).
- Rulings: R108.5 (soft anchor gate), R109 (native Linux worker), R110 (M2 passed).
- Accuracy contract: SC-08 (two long spans + one ceiling height), SC-13 (±1 cm /
  0.5% target), the pilot success criteria below.

---

## A. Prod-deploy prerequisites — IN ORDER

Each step is gated on the one before it. Nothing here is automatic; every prod
mutation is an explicit, verified act (patina-deploy discipline).

1. **Database — `supabase db push` to Strata** (linked project `bkvcixdmuyejfzcijpdg`).
   Push, in ledger order, the three P1 migrations NOT yet on Strata (Strata head
   was 00340 at M3):
   - `00341_field_capture_p1_schema.sql` — the four additive tables
     (`scan_anchors`, `room_files`, `room_file_measurements`,
     `scan_pipeline_events`) + RLS + the `room_files.status` `solved` value + the
     `room_file_measurements` UNIQUE + `room_files.drawings` JSONB.
   - `00370_scan_pipeline_ingest_trigger.sql` — the `room_scans → ready` enqueue
     trigger + the 15-min catch-up sweep + its pg_cron entry.
   - `00372_scan_pipeline_query_surface.sql` — the two admin telemetry views.
   Verify by probing objects, not the ledger: `SELECT to_regclass('public.room_files')`,
   `\d room_files` shows the `drawings` column, the trigger `trg_room_scans_enqueue_ingest`
   is present, `cron.job` lists `scan-pipeline-ingest-sweep`, and the two views exist.
   Regenerate + commit `database.types.ts` at this point (deferred through P1 to
   avoid colliding with the item-12 portal branch).

2. **Worker — install on Kody's Linux box** (R109.1; the box he stood up, not
   Coolify). From `services/scan-pipeline/`:
   - `sudo ./install.sh` — creates the `patina` user, the venv, `apt install
     libcairo2` (cairosvg → PDF), `pip install .[drawings]`, the systemd unit,
     the env template; runs `doctor` last.
   - Fill `/etc/patina/scan-worker.env` (0600): `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY` (Strata), `WORKER_ID=homelab-1`. Leave
     `STAGES=ingest,solve,drawings`.
   - `patina-scan-worker doctor` → all green (GPU absent is an expected WARNING in
     P1); then `systemctl enable --now patina-scan-worker`;
     `journalctl -u patina-scan-worker -f`.
   - The box is outbound-443-only; the pipeline drains with the Cloudflare Tunnel
     down (the tunnel is ops access, not a dependency).

3. **`confirm-scan-bundle` — photos-count follow-up fix.** The live edge function
   still does HEAD-reachability + a photos-count parity check that predates the
   B-19 photos-lane ruling. Confirm it (a) no longer expects a `photosManifest`
   artifact/URL column, and (b) compares `manifest.photos[]` length to the
   `room_scan_images` row count (not to a `photos_metadata.json` artifact).
   Deploy: `supabase functions deploy confirm-scan-bundle`.

4. **Portal — deploy Room File v0** (item 12, its own branch). `./infra/deploy-portal.sh designer`
   from the MAIN checkout (never a worktree — stale-dist hazard). The Room File
   page reads `room_files` + `scan_pipeline_runs` + `scan_tolerance_distribution`
   and downloads `svg_url`/`pdf_url`/`dxf_url` (signed GET → blob).

5. **Feature flag — enable for Leah.** Turn the room-file flag on for Leah's
   account only (PostHog, kody-style single-user rollout), fail-closed elsewhere.

6. **iOS — Patina Field build to Leah's device** with the anchor coach (the M4
   SC-08 nudge). TestFlight or a direct device install; confirm `field://login`
   QR sign-in works against Strata and the anchor-entry step shows the
   long-span coaching.

---

## B. Pilot-day walk (the P1 gate — the AC)

**Pilot-day probe (run first, before Leah's official walk).** Capture a room
**with posed photos** on the pilot device build and confirm its `room_files` row
reaches `status = 'generated'`, **not `error`**. This proves the B-19 iOS
manifest change — `FieldManifestAssembler` no longer listing `photos_metadata.json`
as a bundle artifact — is actually on the device build Leah is using, not only in
the `confirm-scan-bundle` edge-fn fix. A device build that predates B-19 will
still list the orphan `photosManifest`, and ingest will park the scan `error` on
its `MISSING_FILE` (worker emits `ingest.kind_skipped` first, then the validator
names it). If the probe scan errors, the device build is stale — rebuild + reinstall
before proceeding.

Leah, on her own, in a real project room:

1. **Capture ≤ 12 minutes including anchors.** Open Patina Field → Site Scan →
   walk the room (coverage coach green) → drop anchors following the coach:
   **two LONG spans + one ceiling height** (SC-08). The coach nudges toward long
   spans but never blocks (R108.5). Finish.
2. **Upload + reconstruct.** The bundle uploads (resumable, background-safe);
   `confirm-scan-bundle` flips the scan to `ready`; the trigger enqueues
   `scan_pipeline.ingest`; the worker drains ingest → solve → drawings; the
   `room_files` row reaches `status = 'generated'`.
3. **Drawing set delivered to her Room File.** Leah reaches the room's Room File
   from her project (no developer help) and sees the plan + four elevations + the
   accuracy certificate; downloads the DXF/PDF.
4. **Five tape-checked dimensions inside published tolerance.** Leah tapes five
   real dimensions; each is within the drawing's published ± for its badge class.
   This is the accuracy proof (SC-13).

**Success criteria (pilot pass):** all four above hold — ≤12 min capture, a
delivered drawing set reached unaided, and five tape checks inside tolerance —
with the certificate honest about UNVERIFIED / short-span fits where they occur
(truth-framing over false precision).

**Watch the telemetry (admin):** while the walk runs, the two views tell the
story — `scan_pipeline_runs` for stage timings + status + attempts, and
`scan_tolerance_distribution` for the p50/p95 by class. If the anchors were short
or inconsistent, the certificate flags the residuals and the measured tolerances
widen honestly (seen on the M3 real-room pull: short spans → ±loose, not false
precision).

---

## C. Rollback / abort

The pilot is reversible at every layer; a captured scan is never lost.

- **Flag off** — turn the room-file flag off for Leah; the portal surface
  disappears; nothing else changes.
- **Worker stop** — `systemctl stop patina-scan-worker`. In-flight jobs are
  reclaimed by the visibility timeout; queued jobs wait. No data loss.
- **Scans stay safe on-device.** Patina Field holds a durable scan record; an
  un-uploaded or un-reconstructed scan is re-uploadable later — an abort strands
  nothing. Server-side, `room_scans` + the bundle in Storage are untouched by a
  worker stop; a parked `failed` job is inspectable and `requeue_agent_task`-able.
- **No prod migration rollback needed** — the P1 schema is purely additive
  (four new tables + additive columns/views); disabling the flag + stopping the
  worker fully neutralises the feature without a down-migration.
- **Full abandon (not just pause)** — if pulling the feature entirely, also
  `SELECT cron.unschedule('scan-pipeline-ingest-sweep');` (00370). Otherwise the
  ready→ready trigger + the 15-min sweep keep enqueuing `scan_pipeline.ingest`
  tasks that no running worker claims — harmless (they sit `queued`) but untidy,
  and they'd resume the moment a worker restarts.

---

## D. Open items owed before pilot day (program ledger)

These are known gaps to close (or consciously accept) before the walk:

- **Field posed-photo device pass** — the posed-photo capture + upload lane
  (`room_scan_images`, `photos/` folder) verified on a physical LiDAR iPhone, not
  just Simulator.
- **Background-upload device edges** — app-kill mid-upload, thermal throttling,
  network flaps on the resumable `URLSession.background` path, on-device.
- **Voice-note audio seam** — the site-scan voice-note capture/attach path (if in
  the pilot scope) exercised end to end.
- **Sharpness calibration** — the keyframe blur/sharpness thresholds tuned against
  real-room lighting, so the scorecard's `sharpFrameRatio` and the coverage
  verdict reflect reality on Leah's device.

None of these block the *reconstruction* pipeline (items 9–13, all green
locally); they are capture-side field-verification items that the on-device
pilot itself will exercise. Decide per item: close before, or watch during.

---

## E. P2 / follow-on ledger (record now, resolve later)

Not P1-blocking, but owed before the surfaces they touch ship:

- **Walk co-designer drawing download end-to-end before shared access ships.**
  The 00287 storage-policy segment rules are *settled for association reads* —
  its OR branch accepts the **scan id at segment `[3]`** (`rs.id::text = (…)[3]`),
  which is exactly the `room_file/{uid}/{scanId}/v{n}/…` prefix the drawings write
  (see the item-13 D2 verdict). That's proven by SQL; it has **not** been walked
  live by a second (associated) designer downloading the SVG/PDF/DXF. Do that
  before the shared-Room-File access path ships.
- **A3 deep-link gap applies to shared Room File links.** The open A3 deep-link
  issue (a Room File / room link that doesn't resolve on cold open) extends to
  *shared* Room File links handed to a co-designer — verify the shared-link open
  path when A3 is closed.
