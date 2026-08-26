# D4 — Product Intent, Rulings, and Promised-but-Unbuilt Items

**Scope note on file locations.** Two of the assigned paths in the brief don't exist
at the literal repo root — `DECISIONS.md` and `HANDOFF.md` live under workstream
directories, not `/`:
- `docs/design/the-document/DECISIONS.md` (9,431 lines — the live ruling ledger for
  "The Document" workstream, which also carries every Field Capture P1/P2 ruling)
- `docs/design/workflow-alignment/HANDOFF.md` (182 lines)

All citations below are file path + line number (DECISIONS.md) or section name
(everything else) as of this read (2026-08-24, `main`).

**A numbering trap worth flagging up front.** DECISIONS.md reuses the labels
**R107–R114 twice** for two *unrelated* programs, at different dates:
- **R107–R123 (2026-07-16 → 2026-07-29)** = Room View + Field Capture P1/P2 —
  the block this report is about (lines 3765–6400).
- **R107–R114 (2026-08-13)** = an unrelated later program, "Direction A: the
  spine as status organ" (schedule-fidelity / Date Instruments), lines
  8044–8103.

Anyone citing "R108" or "R114" without a date is ambiguous in this file. This
report always pairs the R-number with its date.

---

## 1 · Stated product intent for Patina Field, over time

| Date | Source | Stated intent |
|---|---|---|
| 2026-07 (T-03 origin) | `apps/mobile/Capture/README.md` | "Patina Field is a standalone camera-first iOS app — it turns a physical object in a showroom into a structured, located, synced **specimen**." The founding product is a *product-capture* tool for designers at markets/showrooms. |
| 2026-07-07 (Field app split) | project memory `project_field_app_split.md` (cited in MEMORY.md; not independently re-read this pass) | Capture rebranded to **Patina Field**, gained a second "Work" surface (dashboard, projects, leads, decisions read-only, messages, PO receiving, QR portal-login, pro LiDAR site-scan) for designers/trades — 18 Work screens beside the original 33 capture screens. |
| 2026-07-16/17 (R107, DECISIONS.md:3765) | The Room View ruling | "The scan becomes a Patina drawing — not a scan viewer." Rooms captured by Field become first-class Studio material (`/rooms`, `/room/[id]`), not attachments. This is the moment site-scan capture becomes a *designer-portal* concern, not just an on-device artifact. |
| 2026-07-17 (Field Capture P1, `docs/design/field-capture/field-capture-p1-package.md:72`) | P1 gate | "**Leah retires the tape measure** for one real project's drawings." The product promise for P1 is stated in one sentence: typed-anchor-corrected drawings (SVG/PDF/DXF) with a published, honest tolerance — no fabricated precision. |
| 2026-07-17 (R108.2, DECISIONS.md:3904) | Device posture | Non-Pro (non-LiDAR) iPhones get **context capture** — photos and voice notes pinned to the project via **Capture Inbox** — explicitly so "the context path keeps every designer in the funnel" even without a scanning device. This is the earliest explicit statement of a device-agnostic "capture whatever, land it in the right place" intent, and it predates the later Site Portal PRD by exactly zero days (same ruling session). |
| 2026-07-18 (P2, `docs/design/field-capture/field-capture-p2-package.md:16-18`) | P2 scope statement | "**P2 delivers presence**: the room she steps into, and the mesh she measures." SC-05's one-line law: "the splat is what she sees, the mesh is what she measures." P2 gate (SC-15): "**a maker quotes from the Room File without a site visit.**" |
| 2026-07-17 (PRD, `docs/prds/FieldCaptrueApp/Field-Site-Portal-PRD-v1.md`) | Field Site Portal PRD v1 | The broadest, most deliberate statement of "field companion" intent in the repo. Opens: "Field solved the showroom... The project, though, lives on a site the designer visits twice a month. Between visits, site truth arrives as texted photos at odd angles, verbal dimensions..., and a contractor who answers when he can." Goal: "close the loop" between designer and site with **Site Requests** (structured asks), **zero-friction guest fulfillment** (no account, ≤2 taps from an SMS link), and a per-project **Site Binder** as ground truth. Explicit non-goals: PM/scheduling/punch-lists, payments/contracting, floor-plan authoring, Android, client-facing access (v1). Closing line: "Field earned the pocket in the showroom. The site is where it earns the project." |
| 2026-07-18 (Field Site Request implementation, `docs/field-site-requests/p1-contract.md`) | Implementation trace, **supersedes the PRD's infra assumptions** | States explicitly it "replaces the stale assumptions in earlier planning artifacts": Field is the designer surface (not a separate portal), `project_rooms` is the Binder spine, guest access is an opaque request token through Edge functions, Supabase/Cloudflare are the only infra — "There is no Coolify, guest account/JWT, second room model, or second mobile persistence stack." |
| 2026-08-18 (Leah Session 05 prep, `docs/design/the-document/leah-session-05-one-pager.md`) | Founder-designer sit-down, not yet run/logged | Question 5 of 6 blocks is explicitly about **client experience** and includes "**Would her clients scan a room?**" — i.e. an open question about whether room-scan capture should extend to the client (homeowner) side, not just designer/pro. No R-entry or findings exist yet for this session (see §5, open rulings). |

**Net read**: intent has moved from (a) *showroom specimen capture* → (b) *site-scan-as-drawing-source for the designer's own project* → (c) *"whoever is on site, capturing whatever the designer needs, coming back structured"* (the PRD's Site Request model, largely **built**, see §4) → (d) an *unresolved* question about whether "the field companion" should also mean voice-note-driven quick capture with transcription for the designer herself, which is the shape your program brief is asking about and which the repo does **not** yet have a ruled architecture for (see §4/§5).

---

## 2 · Constraint ledger — every ruling that binds this program

Rulings are cited `R{n} ({date})` against `docs/design/the-document/DECISIONS.md`
unless noted otherwise. "Binds how" is one line, evidence-grounded.

### Device posture / capture scope
- **R108.2 (2026-07-17), DECISIONS.md:3904.** Scanning requires a LiDAR Pro device; non-Pro iPhones get **context capture only** (photos + voice notes → Capture Inbox), and that output is "never labeled a scan." *Binds:* any field-companion capture surface must draw a hard line between "scan" (Pro-gated, measured) and "context" (any device, never measured) — this line cannot be blurred by a unified capture UI that doesn't also carry the label discipline.
- **R108.1 (2026-07-17).** Anchor entry (ground-truth dimensions) is **typed only** in P1 — DISTO BLE explicitly deferred pending field evidence of transcription friction. *Binds:* a voice-driven "say the measurement" flow is not yet a ruled feature; it would need its own ruling session (this is exactly the R108.1 rationale being tested by whatever voice work you're now scoping).
- **R108.3 (2026-07-17), amended by R114.1 (2026-07-18).** Originally: no on-device splat training/preview — the QA coverage scorecard is the sole on-site "did I get everything" signal. **Overruled 2026-07-18**: on-device splat preview is IN, but strictly two-tier — device preview is orientation-only, "never measured against, never the deliverable, never labeled a scan"; only the server-trained splat is the Room File deliverable. *Binds:* the same two-tier discipline (on-device = orientation/glance, server = truth) is the established pattern for any new on-device AI feature (including, by extension, on-device voice transcription drafts vs. server re-transcription — D6's research already recommends exactly this shape independently).
- **R108.4 → amended R109.1 (2026-07-17).** Reconstruction runs on a Kody-managed Linux box, natively (no Coolify — "Coolify is out — too much overhead — and stays out"), behind a burst-ready queue contract (cloud worker = config change, not code; flip trigger = first non-Leah designer in production). *Binds:* any new server-side processing this program adds (e.g. voice transcription) should target the existing `agent_tasks` queue / Supabase edge functions / Cloudflare Workers AI pattern — not a new bespoke worker, and never Coolify (also flatly stated in CLAUDE.md/AGENTS.md as globally retired infra).
- **R108.5 (2026-07-17).** Soft anchor gate: a session may close with fewer than three anchors, but is stamped **UNVERIFIED** everywhere downstream (widest tolerance badge, drawing title block). *Binds:* the "truth-framing over blocking" discipline — friction teaches the habit without stranding a designer — is the house pattern for handling incomplete field capture generally, including voice notes that fail to transcribe cleanly (should degrade honestly, not block or silently drop).
- **R108.6 (2026-07-17).** DXF ships in P1 alongside PDF/SVG — CAD import is day-one pilot workflow, overruling a staged PDF/SVG-first recommendation. *Binds:* export-format completeness for anything that reaches a maker/contractor is judged against real workflow needs, not a minimum-viable subset.

### Trust / on-device vs. server framing
- **R114.1 (2026-07-18).** The two-tier framing (device = beauty/orientation, server = deliverable) is stated as "the trust architecture," explicitly generalizable. *Binds:* directly relevant precedent for any voice-capture UX — an on-device draft transcript is a legitimate, valuable UX (immediate feedback), but it must never silently become the record of truth without a server pass, per the same trust logic. D6's own recommendation (hybrid on-device draft + server re-transcription with reconciliation, not silent overwrite) independently converges on this same pattern — worth citing R114.1 as the house precedent when writing that spec.

### Worker / infra
- **R109.1 (2026-07-17).** Worker home is Kody's Linux box, native install, burst-ready contract; GPU work "earns its keep at P2 splat training," not before. *Binds:* CPU-cheap stages ride existing infra at zero marginal cost; GPU/expensive stages (which a heavier server-side transcription/LLM-structuring pipeline could resemble cost-wise) get evaluated against the same "config change, not code, gated on a real trigger" discipline — plausibly Cloudflare Workers AI (already the prod host) rather than the GPU box, per D6's own infra read.

### Data model / naming
- **I84 pre-emption 1 (2026-07-17), DECISIONS.md:4018.** New Field Capture tables must NOT collide with the live namespace: `rooms` (00019) and `room_scans` (00014) already exist; new tables are `scan_anchors`, `room_files`, `room_file_measurements`, `scan_pipeline_events` (all FK'd to `room_scans`, not fresh top-level entities). *Binds:* any new field-companion schema work must audit for existing tables before minting — this bit the program once already (the P1 package's own "additive-schema list" collided with live tables at audit time).
- **I84, DECISIONS.md:3973-3977.** **Two distinct "Capture Inbox" concepts already exist and are easy to conflate**: `field_captures` (00233/00235 — the Field-app inbox, portal UI unbuilt) vs. `proposal_captures` (00130 — the portal's own "Capture Inbox" UI, `capture-inbox.tsx`). *Binds:* naming discipline — a new field-companion surface must disambiguate explicitly from both, not add a third "Capture Inbox."
- **B-17 semantic-vs-transport MIME split** (referenced R110, DECISIONS.md:4064-4098). Storage transport MIME (octet-stream) and semantic/manifest MIME are deliberately different fields. *Binds:* a new audio artifact type (voice-note file) must follow this split rather than fighting the storage bucket's allow-list the way the P1 bundle artifacts originally did (a real, fixed production defect).
- **Migration numbering discipline** (I84 pre-emption 2; also **patina-db-migrations** skill). Numbers must be verified free across `main` + all branches before minting — the P1/P2 programs hit real collisions with the BOH reservation range (00350-00369) and had to renumber. *Binds:* mint new field-companion migrations only after a live free-number check, never by inspecting `main` alone (parallel branches are common in this repo per `patina-parallel-work`).

### Queue / agent-OS
- **AGENTS.md / CLAUDE.md, "Agent OS rules."** Task queue is `agent_tasks` via `@patina/agent-queue`; "never a parallel queue"; agents write business data ONLY via `enqueue_agent_task`. *Binds:* if a voice-capture → LLM-structuring pipeline needs an async job (e.g. server transcription, or Claude-based extraction into structured field items per D6 §B), it is an `agent_tasks` task type, not a bespoke table/queue — mirrors how `scan_pipeline.refine/fuse/splat` were added as new task-type values with **zero DDL** (D.1, field-capture-p2-package.md:143-145) because `agent_tasks.task_type` has no CHECK constraint.
- **AGENTS.md.** "No automated external sends — drafts land `awaiting_review`." *Binds:* if voice-note transcription surfaces extracted action items (tasks, dimensions, decisions) that would write into a shared/visible record, the D6-recommended confidence-gated confirmation step is not just good UX — it is close to a house-wide policy pattern (nothing auto-commits without a human glance), and should probably route through the same `awaiting_review` posture the rest of Agent OS uses.

### SMS / field-coordination overlap
- **I53 (2026-07-08), DECISIONS.md:2921-2937.** The **Field Coordination** program (separate from Patina Field the app) already built a login-less SMS channel to GCs/subs/installers/receivers: `project_parties`, `sms_conversations`/`sms_messages`, `apply_field_effect` as the single field-mutation choke point, `field_link_tokens` (hash-at-rest, no-login `/field/[token]` client-portal page), an LLM-parse hybrid (Claude Haiku forced-tool-use against the party's open items; confidence-gated: ≥0.8 applies, 0.5-0.8 asks one clarification, <0.5 → Desk triage). *Binds:* this is a **directly adjacent, already-shipped** LLM-structuring-of-field-input pattern (party SMS text → structured status) your program should study before designing a new voice→structured-item pipeline — the confidence-threshold shape (apply / clarify / triage) is exactly the kind of house precedent D6's extraction-pattern recommendations should be checked against, and the naming risk is real: `field_link_tokens`/`/field/[token]` (SMS coordination, 64-hex tokens) vs. the newer `sr_` token namespace for Site Requests are **deliberately different token families on the same universal link domain** (see `docs/field-site-requests/p1-contract.md`, "Access and retention contract" — "Raw tokens use an `sr_` namespace so the Field universal link claims only Site Requests and leaves legacy 64-hex `/field/*` Coordination links on the web").
- **R98 (2026-07-xx, undated in text but placed before R99/2026-07-15), DECISIONS.md:2988-2996.** The Desk's "Open requests" strip (pool + claim model for inbound design requests) is a separate, older mechanism from Site Requests — don't conflate "a request" in the Desk vocabulary; there are now at least three distinct "request" concepts in the product (design requests / pool-claim; site requests / SR01-20; SMS field-coordination items). *Binds:* naming — a field-companion voice/quick-capture feature should avoid the word "request" for a new concept without checking against these three existing uses.

### Deferred/parked scope adjacent to this program
- **R112/R113 P2 ledger (2026-07-17/18), DECISIONS.md:4170-4174, 4238-4243.** Explicitly parked, not forgotten: *voice-note audio seam* (repeated in three separate carried-ledger entries — R110, R112, R113, and again in field-capture-p2-package.md Part F, "slotted into item 10"). *Binds:* this is the single most on-point unbuilt item for your program — see §4.
- **R106 Arrival Arc (2026-07-16), DECISIONS.md:3719-3731, 3761.** "Optional voice-note attachment" was **ruled in** for the designer's client-facing introduction message (ceremony flow) — "Intro, optional voice note, and slots travel together" — but iOS Wave 3 shipped it **without** the voice note: "MatchIntroductionView (three movements per scene 05, **no voice note per ruling**)"; line 3761 records "**Voice note and A/B-shape request lineage remain deliberately deferred.**" *Binds:* there is already one ruled-then-deferred voice-note feature in the product (client-facing, not field-capture) — a separate, adjacent gap from the Field Capture "voice-note audio seam," worth distinguishing in scoping.

---

## 3 · Persona facts about Leah / designers relevant to mobile capture

Evidence-grounded, from the assigned docs (the P1/P2 pilot subject is explicitly
named Leah throughout; the Leah-session docs are portal-UX research, not
field-specific, but the mobile-relevant fragments are below):

- **Leah is the standing pilot subject for Field Capture end-to-end**, named in the PRD ("Leah composes, the Kippley crew delivers, week one of P1" — §15 Pilot), in `m4-pilot-checklist.md` ("M4 is the pilot: one real room, end to end, by Leah, without developer help"), and in the P1/P2 rulings (M4 gate = "Leah retires the tape measure"). As of the latest DECISIONS.md entry touching this (R113, 2026-07-18), **M4's literal gate (Leah's device pilot) was deferred, not passed** — Kody accepted M4 on his own device testing instead, and "Leah's device build, flag entry, and pilot walk... carry forward as the first P2-era operational item, and her walk remains the first third-party validation of the instrument." Per project memory (`project_shelved_spine_shipped_2026_08_15.md`, cited in MEMORY.md, not independently re-verified this pass), a Leah device pilot walk is still listed as owed as of mid-August. **This report cannot confirm from the read docs whether Leah has ever actually held the Field Capture app on a real site as of 2026-08-24** — treat as an open item, not confirmed-done.
- **The one-handed / on-the-move persona is explicit in the PRD**, not inferred: "GC, trade, site super, occasionally the homeowner" as fulfillers; the whole guest-fulfillment design (App Clip, ≤2 taps, no account) is built around "A GC's patience is a design constraint: names first, scope stated plainly, no account as toll" (PRD §9). This is about the *field pro* persona more than Leah's own persona, but Leah is the *composer* on the other end of the same friction budget: PRD E1 sets "compose a request in under two minutes" as her acceptance criterion.
- **Leah's phone-reach instinct was tracked as a UX signal in an unrelated portal-usability protocol** (`docs/design/the-document/leah-session-01-first-tuesday.html`, a desktop-portal usability-test script, not field-specific): "If she instinctively reaches for mobile, that's the D3 pattern's importance measured live — note it, and gently keep her on desktop (the interim mobile layout isn't what we're testing)." This is weak evidence but it is the one directly-observed (well, planned-to-observe) data point in the repo about Leah's mobile reflexes, and it predates any Field pilot walk.
- **Leah Session 05 (2026-08-18 prep doc, not yet run/logged as of this read) is explicitly scoped to ask her about field/mobile appetite**: block 5 of the interview script asks "Would her clients scan a room?" and probes "AR appetite" and "phone vs. web split" for client experience — the *client* side of room-scan capture, an open question this program should watch for an answer to (see §5). The one-pager also flags **"MVP wedge" block 2** ranks four candidate MVP focuses including "**capture/memory**" against taste recs, client-facing wow, and procurement autopilot — i.e., Kody himself is treating "capture" as a live, unresolved priority-ranking question for the company's actual MVP wedge, as of 2026-08-18, which is squarely this program's territory.
- **Time-tracking activity vocabulary already includes "Site visit"** as a first-class category (`project_time_entries`, 00177 — cited DECISIONS.md:42, 140): the picker asks `activity` = Design / Sourcing / Client / **Site visit** / Admin. This confirms "site visit" is an established, named concept in the product's own data model already, independent of the Field app — a field-companion capture surface that starts/stops a site-visit timer would be extending an existing vocabulary, not inventing one.
- **Field pros (not Leah) get the zero-friction, no-login design discipline** (PRD §2 goal 2, §5 E2): link → landing → checklist in ≤2 taps, App Clip fallback, no account ever. This is the *opposite* persona constraint from Leah's — worth keeping distinct in any spec: Leah is an account-holder using the full app; her field contacts are guests who must never be asked to sign up.

---

## 4 · Promised-but-unbuilt items related to field capture

Ranked roughly by directness to "voice notes / quick capture landing in the
right place," most relevant first. Each cites the carrying-ledger location.

1. **Voice-note audio playback/seam — explicitly parked three times, never closed.**
   - First flagged as a **device-owed edge** at M2 (R110, 2026-07-17, DECISIONS.md:4094-4096): "Device-owed edges carried forward, not gating M2: airplane-mode resume, 500 MB unattended background completion, background-relaunch session rehydration, sharpness-threshold calibration, **voice-note audio seam**."
   - Re-carried at P1 close (R112, DECISIONS.md:4170-4174) and again at P1→P2 handoff (R113, DECISIONS.md:4238-4243) — same phrase, still open both times.
   - Explicitly **slotted for P2 item 10** (field-capture-p2-package.md:295: "*voice-note audio seam* — **slotted into item 10** (the registry surfaces voice notes; the audio playback seam lands with it)"). Item 10 is "the pinned photo/context registry on plan + walkthrough" — per that item's own AC (field-capture-p2-package.md:270-271), a captured voice note should appear as a marker in the walkthrough/plan and "tapping opens it." **This report finds no evidence in the read docs that P2 item 10 has shipped** — the last Field Capture ruling this ledger records is R123 (2026-07-29), well before item 10's sequence position (after P2-M3, item 9). Per project memory, the P2 program has continued past this ledger's coverage under a "Rendered Room" name (not independently verified this pass — outside the assigned reading set) — worth an explicit status check before scoping new voice work, since "the seam already has a landing item queued" changes the shape of new work from *invent* to *finish*.
   - **What exists today, confirmed**: voice notes CAN be captured (R108.2's context-capture path; the M2 device-walk script literally exercises it — `docs/design/field-capture/m2-device-walk.md`: "capture a **detail photo**... and a **voice note** (`Voice note added to Inbox`)"), and they land in `field_captures` with pose/spatial provenance under `provenance @> {"siteScanContext...}`. What's missing is (a) any transcription of that audio, and (b) any playback UI — the seam is explicitly "audio," meaning even *hearing the note back* is unbuilt, before transcription is even in scope.

2. **Voice-note attachment on the client-facing Arrival Arc introduction — ruled in, then shipped without it.**
   - R106 (2026-07-16, DECISIONS.md:3719-3731) explicitly designs "Optional voice-note attachment" into the designer's intro message, with playback on the client's iOS screen ("voice note playable inline"). The build record (DECISIONS.md:3761, Wave 3) states: "MatchIntroductionView (three movements per scene 05, **no voice note per ruling**), one-tap client_pick..." and the closing line: "**Voice note and A/B-shape request lineage remain deliberately deferred.**" This is a *different* voice-note feature (client-facing, ceremony-scoped) from the Field Capture context-capture one — worth distinguishing, but both point at the same underlying gap: Patina has ruled voice-note UX into the product twice and shipped it neither time.

3. **App Clip guest-fulfillment path — explicitly a "proposal," not a ruled build item.**
   - PRD §12: "Full app if installed; otherwise **App Clip** (proposal): checklist + measure + photo kits inside the clip budget." The word "proposal" is doing real work here — it is presented as a recommendation, not a ruling. `docs/field-site-requests/p1-contract.md`'s "Delivery and evidence boundaries" confirms: "The App Clip, custom kits/markup, video, TUS/large-transfer work, intelligent Binder, and spatial projections remain **P2–P4 evidence-gated programs**" — i.e. still unbuilt as of the P1 contract doc.

4. **Web fulfillment fallback for non-iOS pros (PRD O3, "photo + measure only, or all kits?" — open).** Site Request P1's contract doc does list a guest **web** path in its lifecycle table (SR13-20 apply to both native and web guest modes per "Web stores the complete delivery record and `Blob`s in IndexedDB"), suggesting the web fallback did get built in P1 rather than deferred to P2 as the PRD originally scoped it — but the *scope* question (which kits) reads as still open per O3.

5. **Walkthrough capture (K-03), Verify (K-05), item markup (S-03), offline hardening — PRD's own P2 bucket**, per PRD §15 phasing table. Not confirmed built or unbuilt in the docs read this pass (outside the P1-contract trace, which only covers K-01/K-02).

6. **Designer-Taught Intelligence spec for the Site Binder (PRD §13, P3): chapters & transcripts, tape read, auto-filing, gap sense, Ask the Binder.** All P3, all explicitly proposal-only ("it proposes; the designer confirms" is the architecture, not yet the implementation). The **transcript** capability here (walkthrough video → searchable text, per-room chapters) is the *other* transcription surface in the product besides voice notes — worth scoping together if your program is building any transcription pipeline, since PRD FR-7/FR-8 already specify the target shape (`search_binder(project, query)` spanning dims/notes/entry-titles/transcript segments, pgvector embeddings, seek-to-timestamp on transcript hits).

7. **Placeholder / unreviewed copy still standing, by the program's own admission.** R110 (DECISIONS.md:4090-4092): "the escalate-class coach/anchor/scorecard strings shipped as placeholders, were seen during the walk, and stand as accepted-for-P1 unless Kody flags changes (catalogue in m2-device-walk.md)." The P2 package (item 12 AC) similarly flags every "orientation-not-measurement" preview string as "escalate-class UI strings... ruled at the slice review, not settled here" — i.e. still not finally worded as of the P2 package's writing.

8. **Device passes owed, standing as of the last confirmed state (per DECISIONS.md and project memory, not independently re-verified against current device state this pass):**
   - Leah's own device pilot walk (M4's literal gate — deferred at R113, still listed owed per MEMORY.md as of mid-August).
   - Kody's authenticated prod walks of the Room View photo surfaces and Field's posed-photo TestFlight pass (I83, DECISIONS.md:3888).
   - A `stash@{0}` conflict noted twice (I75/I83-adjacent and separately in project memory `project_p2_dirty_state_autostash_2026_07_29.md`) — Kody's local Capture pbxproj device-build mods were stashed to allow fast-forward pulls during the Field Capture program; **pop-or-drop is explicitly still Kody's call** per memory, and `m2-device-walk.md` itself warns the stashed mods "will very likely NOT apply cleanly" on a regenerated project — a real risk for anyone doing further device work on Capture without checking this first.

9. **GIN index on `field_captures.provenance`** — carried since R112/R113 as a required precondition "before inbox scale," slotted into P2 item 10 alongside the voice-note seam (same item, same status question as #1 above).

---

## 5 · Open rulings Kody still owes that intersect this program

From the PRD's own §18 Open Questions (all unresolved as of the PRD's writing;
no DECISIONS.md entry found in this pass that closes any of them):

- **O1** — Reassignment / multiple pros per one Site Request (v1 is single-assignee only).
- **O2** — Client visibility into the Site Binder: "a share-view of the Binder, or never?" — directly relevant to whether a field-companion capture flow ever surfaces to the homeowner, not just the designer/pro.
- **O3** — Web fallback scope: photo+measure only, or all kits? (Possibly resolved in practice by the P1 build shipping a general web guest mode — see §4 item 4 — but no explicit ruling closes O3 as a design question.)
- **O4** — Retention for unapproved deliverables after close (PRD proposes 90 days; the P1 contract doc's "90-day clock... for deliverables that were never approved into the Binder" suggests this was adopted as built, but again with no DECISIONS.md ruling entry located confirming it was a deliberate Kody call vs. an implementer default).
- **O5** — Walkthrough length/resolution caps.
- **O6** — Verify (K-05) result grading: structured pass/fail only, or graded with a required note?
- **O7** — Room taxonomy: freeform per project vs. kind-templates (feeds "gap sense").
- **O8** — "Portal surface: when The Document reads the Binder, what renders in the Desk vs. the margin?" — explicitly flagged in the PRD as "Candidate for a workstream R-entry; cross-surface, not Field's call alone." This is the single most directly relevant open question to a "field companion lands info in the right place in the portal's project flow" program brief — it is *named* as unresolved and cross-cutting.

Plus, from the constraint ledger above:
- **Leah Session 05** (§3) is scheduled/prepped but — per the empty `leah-session-05-findings-template.md` and no matching "L5" DECISIONS.md entry — **not yet run or not yet logged** as of this read. Its block 5 question "Would her clients scan a room?" and block 2's MVP-wedge ranking (capture/memory vs. three other candidates) are live inputs this program should wait for or explicitly flag as pending.
- **DISTO BLE transcription-friction re-open trigger** (R108.1): explicitly deferred "until field evidence of transcription friction" — if your program is assembling evidence that manual/typed capture is friction-heavy on site, that is the exact trigger condition named in the original ruling, worth citing directly when re-raising it.
- **Whether P2 item 10 (voice-note seam + GIN index) has shipped** is not resolvable from the assigned reading set — DECISIONS.md's Field Capture coverage stops at R123 (2026-07-29); commit-log evidence (not part of the assigned reading, checked only opportunistically) shows Field Site Request work continuing into September-adjacent commits and a separate "Rendered Room" / scan-pipeline-v2 program referenced in project memory as of 2026-08-19 — status of the specific voice-note item within that later work is not confirmed here and should be checked directly (e.g. `git log --oneline -- 'docs/design/field-capture/*' 'docs/architecture/CAD Generation Pipeline/*'`, or ask Kody) before assuming it's still purely a paper ruling.

---

## 6 · Naming / lexicon conventions

Drawn from the ruling ledger itself (which is unusually explicit about naming
discipline — several rulings exist *specifically* to fix a naming collision).
Group by surface:

### The portal's document/room grammar ("The Document")
- **The Desk** — the home/landing surface; explicitly *not* a document (D1's strict-focus law doesn't apply to it), never carries counts/tiles/metrics (R95, "The Contents Page" — a dashboard is explicitly forbidden).
- **The Document** — the per-engagement working surface (was "the project page"); sections, a margin, ledgers/sheets/folios open as document-adjacent surfaces, never tabs (a repeated "Strata rule": DM-mono links, never tabs — R70/R28 grammar).
- **Rooms / The Rooms** — a top-level Studio room (roster) for scanned rooms; **Room View** is the per-room viewer at `/room/[id]` with **Plan · Orbit · Walk** as its three named modes (R107). **Room File** is the *drawing-set deliverable* (`/portal/projects/[id]/room-file/[scanId]`, R112 item 12) — distinct from Room View; do not conflate "Room View" (the interactive viewer) with "Room File" (the versioned drawing/certificate package).
- **The Site Binder** — the PRD's proposed name for the per-project field-truth record, keyed to **Room** as its spine ("Room is its spine; Binder Entries are approved deliverables filed to rooms"). Confirmed built under this name in `docs/field-site-requests/p1-contract.md` (`site_binder_current`, "Binder rooms," "Binder detail," "Binder history").
- **Capture Inbox** — **ambiguous, house-flagged risk** (I84): two real, distinct things share this name — `field_captures` (Field-app inbox, 00233/00235) and `proposal_captures` (portal UI, 00130, `capture-inbox.tsx`). Any new surface must pick a third, unambiguous name rather than "Capture Inbox" again.
- **Specimen** — the founding Patina Field noun for a captured showroom *product* (not a room, not a site fact). Keep distinct from "Site Request item" / "deliverable" (site/room facts) and from "capture" (the generic verb covering both).
- **Site Request** — the PRD/built-feature noun for a designer's structured ask to a field pro; composed of **Request Items**, typed by **Capture Kit** (K-01 Measure Set … K-06 Install Check), fulfilled into **Deliverables**, approved into the **Site Binder**. Screen IDs `SR01`–`SR20` deliberately avoid the app's pre-existing `S1`–`S5` namespace (Capture README, "Screens" table note).
- **"A request"** is otherwise overloaded in this product — at least three senses exist: (1) **design requests** (Desk's "Open requests" pool/claim, R98 — a homeowner asking for a designer), (2) **Site Requests** (this program), (3) SMS **field-coordination items** (I53's `apply_field_effect` targets, not literally called "requests" but functionally the same shape — a designer asking a party to do/confirm something). A new field-companion feature should avoid re-using "request" without qualifying which of the three it means.
- **The Post** — the notification/mail surface (bell icon), with two pages: **Letters** and **the Record** (R82). Not to be confused with any new "activity feed" a field-companion program might want — the house pattern is to route new notice types through the existing post-derivation classifier, not build a parallel feed.
- **Folio** — a document's attached-files strip/viewer (`ProposalFolioStrip`, project folio, etc.) — a specific, reused term for "the files attached to this document," versioned, never overwritten.
- **Ledgers / sheets** — money and roster surfaces (Accounts book, Orders, Hours, People) render as centered paper-folio sheets (R96, "The Laid Sheet"), never the old charcoal bottom-slide-up.
- **The margin** — the document's side-rail for notes/signals/cross-references; pins from Room View annotation flow here (R107 stage 2, "Annotate").

### Field / capture-specific
- **Patina Field** — the app's product name (bundle `cloud.patina.field`, universal-link scheme `field://`); "Patina Field (T-03)" in the README is the internal track name, not user-facing.
- **The Instrument** — the P1 build package's own subtitle ("Field Capture · P1 Build Package — 'The Instrument'"); "Presence" is P2's subtitle. These read as internal program names, not surfaced product copy.
- **UNVERIFIED** — a specific, capitalized stamp state (soft anchor gate, R108.5) that prints in drawing title blocks; part of the tolerance-badge vocabulary alongside **verified / measured / estimated** (the badge triad referenced throughout P2).
- **True Layer / Present Layer** — P2's internal vocabulary for the measured-drawing deliverable vs. the photoreal splat walkthrough (SC-05/SC-11); "the splat is what she sees, the mesh is what she measures" is the one-line law. Likely internal/engineering vocabulary rather than designer-facing copy (not confirmed either way in the docs read).
- **Frames** — named, saved Orbit viewpoints captured into the folio/boards (R107 stage 2) — a specific noun, not generic "screenshot."
- **Field parties** — the SMS-coordination program's roster concept: gc / sub / installer / receiver, each with a **trade** and **consent status** (I53). A field-companion program that talks to on-site people should reuse "party" + these four kind values rather than inventing new role names.

### Company-wide brand voice (`.agents/skills/patina-brand-voice/SKILL.md`)
This skill governs **external/consumer-facing marketing copy** (outreach, pins,
landing pages, decks) — it is not the internal UI-copy grammar above, but its
hard rules matter for anything a homeowner/client or field pro reads:
- **Never lead with AI/algorithm/ML/"powered by" language.** Outcomes first, technology stays the silent enabler.
- **"Designers are the intelligence layer"** — the product's AI/LLM capability is *always* named **"Designer-Taught Intelligence"** in copy — "never the two-letter abbreviation" (this exact phrasing recurs in DECISIONS.md at the PRD level too, §13: "The word used in every surface and every doc is Designer-Taught Intelligence — never 'AI.'"). This directly binds any voice-transcription/LLM-structuring feature's user-facing copy: it must not say "AI transcribes your voice note" — it needs Designer-Taught-Intelligence framing or must stay silent about the mechanism per the brand rule.
- **Voice attributes**: confident-not-arrogant, sensory/tangible, story-driven (provenance), plain-spoken Midwest. Numbers must be true/sourced — no puffery stats.
- **Lexicon to prefer**: patina, provenance, heirloom, grain, workshop, maker, hand-built, honest materials, trade, studio. **Avoid**: disrupt, revolutionize, AI-powered, curated (overused), luxury, elevated-as-filler, bespoke (unless literally custom), gig, marketplace-speak.
- **Midwest-only examples/testimonials** — no coastal signifiers.

### A cross-cutting copy discipline worth naming explicitly
Several rulings independently arrive at the same UX-writing law even though
none of them cite each other: **truth-framing over blocking / over
impersonation.** R108.5 (UNVERIFIED stamps rather than hard-blocking), R113
("Middle Studio has taken your request in hand" — "it reports what happened,
it does not speak in the designer's voice"), R114.1 (preview strings must say
"orientation, not measurement"), and R110's honesty-states requirement (PRD
FR-10: "Empty, offline, uploading, and failure states are explicit and
directive... no spinner-forever, no silent loss"). Any new field-companion
copy — including transcription-confidence or upload-state strings — should be
written against this same law rather than invented fresh.
