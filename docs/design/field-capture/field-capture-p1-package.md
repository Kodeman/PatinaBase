# Field Capture · P1 Build Package — "The Instrument"

Issued 2026-07-17 · Design authority → Claude Code
Companion artifact: `patina-field-capture-architecture.html` (the SC deck, sheets SC-00–SC-17). **Both files land together** in `docs/design/field-capture/`. The deck is the system definition; this package is the build order. If they conflict, this package wins for P1 scope.

---

## Part A — append-ready DECISIONS.md block

Append via `append_entry.py` (never by hand); resolve `R{next}` from `workstream_state.py` first, and let the script rewrite the integrity footer. Entry text is final — full rationale travels.

```markdown
### R{next} · Field Capture P1 boundary — six rulings — 2026-07-17

Decision session against the Field Capture architecture deck (SC series,
patina-field-capture-architecture.html). Interview format; all six ruled.

**R{next}.1 — Anchor entry: typed only.** P1 ships typed anchor entry
(read from tape or laser, keyed against taps on the live model). DISTO
BLE is not scoped for P2 — it waits for field evidence of transcription
friction. Rationale: the accuracy contract is the anchor *values*, not
the transport; typed entry captures 100% of the benefit at zero
integration risk.

**R{next}.2 — Device posture: Pro scans, non-Pro context.** Scanning
requires a LiDAR Pro device. Non-Pro iPhones get context capture —
photos and voice notes pinned to the project via Capture Inbox — and
the output is never labeled a scan. Rationale: the tolerance promise
is the product; a degraded scan path muddies it in v1, but the
context path keeps every designer in the funnel.

**R{next}.3 — On-site preview: the gate is the preview.** The QA
coverage mesh (painted surfaces, scorecard) is the on-site answer to
"did I get everything." Splats are trained server-side only; on-device
splat training is not pursued. Rationale: the on-site question is
coverage, not beauty; Metal-based training is months of work that buys
neither pillar.

**R{next}.4 — Reconstruction home: homelab behind a burst-ready
queue.** Pipeline runs on the homelab GPU (2080 Ti) from day one. The
worker contract is designed so a cloud burst worker is a config
change, not code. Flip trigger: the first non-Leah designer in
production. Rationale: pilot volume is single-designer scale; zero
marginal cost inside the existing Coolify stack; the SLA risk is
accepted until someone outside the house depends on it.

**R{next}.5 — Anchor gate: soft, with a loud stamp.** A session may
close with fewer than three anchors, but the Room File is stamped
UNVERIFIED, every dimension wears the widest badge class, and the
stamp prints in the drawing title block. Rationale: truth-framing over
blocking — the file states what it is; the friction teaches the habit
without stranding a designer whose laser is in the truck.

**R{next}.6 — Drawing formats: DXF ships in P1** alongside PDF and
SVG. Overrules the staged recommendation (PDF/SVG first): CAD import
is day-one workflow for the pilot, and review-only drawings would
leave P1 half-useful. Scope cost accepted knowingly — adds a
parametric-graph → DXF serializer (ezdxf-class, layered walls/
openings/dims) to the P1 server work; days, not weeks.
```

Footer-restore note: after append, confirm the footer line matches the file's real entry counts. A wrong count means a corrupted file — stop and reconcile before building.

---

## Part B — the build plan

### P1 scope, stated once

P1 delivers the **instrumented capture rig** and **anchor-corrected drawings with published tolerances**. It does **not** include SfM pose refinement, dense fusion, or splat training — those are P2 (deck SC-10 steps 1, 3, 5). P1 accuracy comes from the parametric layer corrected against typed anchors, and the tolerance report is honest about being the wider class. Do not build COLMAP in P1.

**P1 gate (from SC-15):** Leah retires the tape measure for one real project's drawings.

### Authority notes — bless vs escalate

Claude Code **blesses** (code-only; log as I-entries with rationale): queue technology, DXF library choice, migration numbering, bundle compression, file naming inside the bundle, worker process layout.

Claude Code **escalates** (designer-visible; the splitting question is *would a designer notice?*): drawing layout and dimension styling, badge rendering, the UNVERIFIED stamp design, the title block, Room File page layout, any coach-UI wording, any change to the anchor-entry flow. Portal surfaces follow the brand grain: typography-first, no box shadows on content.

### Sequence gates — hard stops for review

- **M1** after items 1–2: bundle spec + schema review. No iOS capture code beyond the recorder skeleton until M1 passes.
- **M2** after item 8: first end-to-end bundle from a real room on Kody's device, inspected server-side.
- **M3** after item 11: first drawing set reviewed against tape measurements — slice review with screenshots and the DXF opened in CAD.
- **M4** after item 13: Leah pilot room. This is the P1 gate.

### Additive-schema list

New tables only; **no modification of existing Capture Inbox tables without escalation**: `rooms`, `scans`, `capture_bundles`, `anchors`, `measurements`, `assets`, `room_files`, `pipeline_events`, plus status enums. Measurements carry provenance columns: `source (anchor | parametric)`, `tolerance_mm`, `tolerance_class (verified | measured | estimated)`, `verified_by`, `verified_at`. P2 adds `mesh` as a source value — leave the enum extensible.

### The numbered plan

**1 · Repo audit (build nothing first).**
Audit what already exists: the current T-03 capture flow (session code, any upload path, any bundle-like format), Capture Inbox schema and ingestion, Supabase storage buckets, any existing job/queue infrastructure, and the portal's project surface. *AC:* a written audit I-entry listing found/absent for each, with file paths; pre-emptions flagged before any item below starts.

**2 · Capture bundle spec v1 + migrations.**
Define `manifest.json` (device, session, OS version, anchors with tapped endpoints + values + method, scorecard, pose graph summary, checksums), directory layout, and the additive migrations above. Include a CLI validator. *AC:* spec doc lands in `docs/design/field-capture/`; validator accepts a synthetic bundle and rejects a corrupted one; migrations reviewed at M1.

**3 · iOS: shared-ARSession capture core.**
One custom `ARWorldTrackingConfiguration` session shared with `RoomCaptureSession` (the iOS 17 pattern). Records the parametric graph, LiDAR scene mesh, and smoothed per-frame depth with confidence, all on one clock and coordinate frame. Pin the OS support matrix and document the iOS 26 RoomCaptureView regression handling. *AC:* one 10-minute session on a 15 Pro-class device without thermal shutdown; streams share timestamps; parametric graph updates live.

**4 · iOS: keyframe recorder.**
Auto-fire on ~0.5 m or 15° of motion, sharpness-gated: full-res HEIC + depth + intrinsics + pose. *AC:* 200–400 keyframes on a typical room; blur-rejection ratio logged to the manifest; bundle stays within the 300–600 MB budget.

**5 · iOS: coach + QA gate.**
Coverage shading painted on the live mesh; motion-speed, blur, exposure, and >4 m distance warnings; per-surface checklist; end scorecard (coverage %, sharp-frame ratio, tracking health, anchor count) → green/amber/red, with red walking the user to the exact gap. *AC:* deliberately skipping one wall produces a non-green verdict naming that wall; scorecard persists into the manifest.

**6 · iOS: typed anchor entry + soft gate (R1, R5).**
Tap two points on the live model, type the value; prompt for three spans (two long + one ceiling height). Closing with fewer is allowed and sets the UNVERIFIED flag in the manifest. *AC:* anchor records carry tapped endpoints in model coordinates, value, and entry method; three anchors enterable in ≤60 seconds; the flag propagates untouched to the server.

**7 · iOS: context capture → Capture Inbox (R2).**
Voice notes and detail photos pinned to pose during the scan, landing in the Capture Inbox with a spatial address (room + pose). The non-Pro build exposes *only* this path and never labels output a scan. *AC:* a note captured mid-scan appears in the Inbox with its room reference; Pro-gating verified on a non-LiDAR device.

**8 · iOS: bundle assembly + resumable upload.**
Checksummed bundle, background `URLSession`, resumable with retries. *AC:* airplane mode mid-upload resumes cleanly; server verifies checksums; a 500 MB bundle completes without user intervention. **M2 here.**

**9 · Server: ingest, queue, burst-ready worker contract (R4).**
Validate incoming bundles; enqueue; worker interface defined so a cloud worker registers against the same queue by configuration alone. Runs on the homelab GPU via Coolify; job states queryable in Postgres. *AC:* a second worker instance (even a stub) attaches with config only; failed jobs are inspectable and re-runnable.

**10 · Server: anchor solve + tolerance model (R5).**
Fit scale and correct the parametric graph against the anchors; compute per-dimension tolerance class; emit the accuracy certificate (anchors used, residuals, class per dimension). Fewer than three anchors → UNVERIFIED propagates to every downstream artifact. *AC:* on a test room, anchored spans match typed values exactly; residuals reported; certificate JSON validates.

**11 · Server: drawing generation — SVG, PDF, DXF (R6).**
Dimensioned floor plan and four elevations per room from the corrected parametric graph. Every dimension badged by tolerance class; the UNVERIFIED stamp prints in the drawing title block when set. DXF layered (walls / openings / dimensions / text), ezdxf-class serializer. Sloped-ceiling conditions are labeled ESTIMATED in P1 — true ceiling planes are P2. *AC:* DXF opens clean in two CAD tools including Leah's; DXF dimension values match the certificate; PDF prints legibly at scale. **M3 here.**

**12 · Portal: Room File v0.**
A project-attached page: drawing downloads, the accuracy certificate rendered legibly, capture-context list. Versioned — a re-scan appends, never overwrites. Typography-first, no shadows. *AC:* Leah reaches a real room's drawing set from her project without developer help.

**13 · Telemetry + pilot readiness.**
`pipeline_events` populated end-to-end (capture metrics, upload, job timings, tolerance distribution); a minimal query surface is enough. Pilot checklist for M4. *AC:* one real room end-to-end at ≤12 minutes capture including anchors; drawing set delivered; five tape-checked dimensions all inside their published tolerance. **M4 here — the P1 gate.**

---

## The kickoff line

> Read `docs/design/field-capture/field-capture-p1-package.md` and the SC deck beside it, run the item-1 audit, and stop at M1 — bundle spec and schema review — before writing any iOS capture code.
