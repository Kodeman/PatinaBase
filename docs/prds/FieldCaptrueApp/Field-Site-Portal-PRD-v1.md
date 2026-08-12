# Field Site Portal — PRD v1

| | |
|---|---|
| **Status** | Draft v1 — plan approved 2026-07-17; PRD pending review |
| **Owner** | Kody |
| **Surface** | Patina Field · iOS (T-03 expansion) |
| **Related** | Site Portal plan deck · Screen system (`patina-field-site-portal-screens.html`) · T-05 Capture Inbox · Designer Portal ("The Document") |
| **Routing** | `Strata/PRDs/Field-Site-Portal-PRD-v1.md` → promote to `Patina-docs/02-product/ios-app/` on approval |

**Purpose.** Expand Patina Field from a showroom capture companion into the channel between the studio and the job site: designers compose structured Site Requests, anyone onsite fulfills them through guided capture with zero-friction guest access, and approved deliveries file themselves into a per-project Site Binder that becomes the ground truth for specs, drawings, and maker briefs.

---

## 1 · Problem

Field solved the showroom: capture in five seconds, file it later. The project, though, lives on a site the designer visits twice a month. Between visits, site truth arrives as texted photos at odd angles, verbal dimensions ("about eight feet, maybe"), and a contractor who answers when he can. Every studio decision — a counter run, a vanity spec, a maker brief — leans on numbers that are late, blurry, or absent. The designer's tools stop at the studio door; the channel between designer and site is owned by nobody and served by group texts.

## 2 · Goals

1. **Close the loop.** A designer can ask for exactly what she needs and get it back, reviewed and filed, without leaving Patina.
2. **Zero-friction pro entry.** A field pro delivers a full request from a text link with no account, no training, and no app-store detour on the happy path.
3. **Structured truth.** Dimensions land as data (canonical units, provenance), not pixels. Photos and video land pre-filed by room.
4. **The Binder as ground truth.** Every approved deliverable accrues into a living site record that later features (Portal views, maker briefs, exports) stand on.
5. **Honor the grain.** One thing in hand; capture stays fast; the Binder grows — nothing converts; Designer-Taught Intelligence proposes and the designer confirms.

### Non-goals (v1)

- Project management, scheduling, or punch-list workflows — we carry site *truth*, not site *tasks*.
- Payments or contracting between designer and pro.
- Floor-plan generation or CAD authoring (exports come in Phase 4; authoring never).
- Android pro app — the web fulfillment fallback (Phase 2) covers non-iOS pros.
- Client-facing access (flagged as O2).

## 3 · Users & roles

| Role | Who | Access |
|---|---|---|
| **Designer** | Patina account holder; Field + Portal user | Full: compose, review, Binder |
| **Field pro** | GC, trade, site super, occasionally the homeowner | Guest: their request only, via scoped link; account optional, ever |

One assignee per request in v1 (accountability and token scoping stay simple); reassignment and multi-pro are O1.

## 4 · Core objects

- **Site Request** — a composed brief: one or more items, one assignee, a due date, an optional note. States: `draft → sent → in_progress → delivered → closed` (plus `expired`).
- **Request Item** — a single ask, typed by kit, optionally bound to a room, carrying its own guidance (diagram, shot list, prompts, markup). States: `pending → captured → delivered → approved | redo → (recaptured → delivered …)`; an approved re-delivery marks the prior deliverable `superseded`.
- **Capture Kit** — the item template. K-01 Measure Set · K-02 Detail Photos · K-03 Walkthrough · K-04 Condition Report · K-05 Verify · K-06 Install Check. Kits are templates; a request mixes any; designers can save their own.
- **Deliverable** — what came back: dims payload, photo set, video, or check result, with capture and delivery timestamps and a review state.
- **Site Binder** — the per-project record. **Room** is its spine; **Binder Entries** are approved deliverables filed to rooms with full provenance. Entries are append-only; superseded values remain visible in history. The Binder grows; nothing is retyped and nothing silently overwrites.

## 5 · User stories & acceptance criteria

**E1 · Compose (designer)**
- *As a designer, I compose a request in under two minutes* — pick project → kits → items → assignee → due → send. AC: send enabled only with ≥1 item and an assignee; composing against a project pre-loads its rooms; item templates prefill from kit.
- *I mark up a photo or plan so "this wall" is unambiguous* (P2). AC: arrow/box/label tools only; labels auto-letter A, B, C; the same markup renders on the pro's capture screen.

**E2 · Guest access (pro)**
- *As a pro, I open a text link and I'm in my checklist* — no account, no tour. AC: link → landing states who's asking, for which site, how many items, and the scope ("you'll see this request only") → checklist in ≤2 taps; works via App Clip when the full app isn't installed (proposal, §12).
- *I can stop and come back.* AC: link reopens to current state; token honored until request close + 7-day redo grace; resend voids the old link.

**E3 · Guided capture (pro)**
- *Measure:* diagram shows exactly where A, B, C go; fractions keypad; metric toggle. AC: values stored canonical (mm) with display preference; optional tape-in-frame proof photo attaches to the dim.
- *Photos:* shot list with ghost-frame guidance; auto-advance through shots. AC: reference image visible during capture; low-light warning.
- *Walkthrough* (P2): prompted route; "Next room" stamps a chapter. AC: recording survives app background; max length soft-capped (O5).
- *Verify* (P2): approved sample side-by-side with live camera; structured match / no-match + proof. AC: no-match triggers priority notification to the designer.
- *One item in hand.* AC: capture screens present exactly one item; the checklist holds the rest.

**E4 · Review (designer)**
- *Deliveries arrive item by item; I approve or send back with a pinned note.* AC: Approve files to the Binder immediately; Redo reopens only that item; the note appears verbatim on the pro's returned item; quick-reason chips (glare, wrong angle, closer) prefill.
- *Dimensions are data.* AC: approved dims queryable by room; conflicts with an existing Binder dim surface a warning at review (P3).

**E5 · Binder (designer)**
- *One place remembers the site.* AC: rooms show coverage (dims · photos · clips); each dim carries provenance (who, when, proof); history is append-only with superseded values visible.
- *The Binder tells me what's missing* (P3). AC: gap suggestions draft a prefilled Measure Set; nothing sends without the designer's confirm.
- *I search everything* (P3). AC: one query across dims, notes, and transcripts; transcript hits seek playback to the moment.

**E6 · Notifications** — see matrix, §10. AC: the thread of record lives in Field; SMS nudges to pros are rate-limited (1/day per request).

**E7 · Offline (pro-critical, P2 hardened)**
- AC: all capture works with zero signal; queue persists across relaunch; uploads resume in background; checklist shows honest per-item upload state; "delivered" is claimed only after server receipt.

**E8 · Designer-Taught Intelligence** (P3) — chapters & transcripts, tape read, auto-filing, gap sense, Ask the Binder. AC for all: it proposes, the designer (or pro, for tape read) confirms; no suggestion writes to the Binder without a human yes; every confirm/decline is a training signal scoped to this designer.

## 6 · Functional requirements

**FR-1 Request lifecycle.** Draft persists locally until sent. Send issues a scoped token, dispatches the SMS, and freezes item definitions; post-send edits version the item (v2) rather than mutating what the pro sees mid-capture. Close occurs when all items are approved, or manually; expiry is due + 14 days with a designer prompt.

**FR-2 Guest scope.** The guest session sees: this request's items, its own captures, the designer's name/studio, the site's display name. It cannot browse the project, the Library, other requests, or the Binder.

**FR-3 Dims.** Canonical storage mm (integer); display per viewer preference; imperial entry via fractions keypad to 1/16 in. Every dim: value, label, item ref, capturer, timestamp, optional proof media.

**FR-4 Media.** Photos: original retained, JPEG derivative for display. Video: HEVC capture, 1080p cap (O5), server transcode to preview; originals retained. All media keyed under `requests/{request_id}/…` then re-homed to Binder paths on approval.

**FR-5 Review integrity.** Review is item-granular; no bulk approve in v1 (approvals must stay meaningful). Redo requires a note (chips count). Superseded deliverables remain retrievable from item history.

**FR-6 Binder filing.** Approval writes a Binder Entry (room, kind, payload/media, source deliverable, approver, timestamp). Items without a room prompt filing at first approval; the choice persists for that item.

**FR-7 Walkthrough.** Chapters from pro stamps (P2); transcript generated server-side on upload (P3); chapter/transcript segments carry room refs for filing and search.

**FR-8 Search.** `search_binder(project, query)` spans dims (label+value), notes, entry titles, transcript segments; transcript results return a seek timestamp. Embeddings via pgvector (P3).

**FR-9 Nudges.** Designer-initiated SMS nudge, rate-limited 1/day/request; automatic reminder at due − 24h if `in_progress` and undelivered items remain.

**FR-10 Honesty states.** Empty, offline, uploading, and failure states are explicit and directive (what happened, what to do); no spinner-forever, no silent loss.

## 7 · Screen inventory

Full visual spec with annotations and flows: `patina-field-site-portal-screens.html`. Index:

| Ref | Screen | Side | Phase | Flows |
|---|---|---|---|---|
| S-01 | Site tab · project hub | Designer | P1 | A, D |
| S-02 | Request composer | Designer | P1 | A |
| S-03 | Item editor · markup | Designer | P2 | A |
| S-04 | Assign & send | Designer | P1 | A |
| S-05 | Request tracker | Designer | P1 | A |
| S-06 | Delivery review · inbox | Designer | P1 | C |
| S-07 | Review · measure item | Designer | P1 | C |
| S-08 | Review · photos + redo note | Designer | P1 | C |
| S-09 | Walkthrough player | Designer | P2/P3 | C |
| S-10 | Site Binder · rooms | Designer | P1 | C, D |
| S-11 | Binder · room detail | Designer | P1 | C, D |
| S-12 | Ask the Binder | Designer | P3 | D |
| S-13 | Text link · landing | Pro | P1 | B |
| S-14 | Checklist | Pro | P1 | B |
| S-15 | Guided measure | Pro | P1 | B |
| S-16 | Guided photos · ghost frame | Pro | P1 | B |
| S-17 | Walkthrough capture | Pro | P2 | B |
| S-18 | Verify · side-by-side | Pro | P2 | B |
| S-19 | Delivered · done | Pro | P1 | B |
| S-20 | Returned item · redo | Pro | P1 | C |

## 8 · Flows

- **F-A Compose & send** — S-01 → S-02 → (S-03 per item) → S-04 → SMS out → S-05 tracker.
- **F-B Guest delivery** — SMS → S-13 → S-14 → S-15/16/17/18 per item → S-14 → S-19 → delivery notification to designer.
- **F-C Review loop** — notification → S-06 → S-07/S-08/S-09 → Approve → Binder entry (S-10/S-11) ∣ Redo → SMS to pro → S-20 → recapture → back to S-06.
- **F-D The loop closes** — S-10 gap sense → prefilled S-02 → F-A; S-12 search rides the same ground truth.

## 9 · Design principles applied

Typography-first; hairline Strata rules, not tabs; no shadows on content. One item in hand — the checklist holds the rest. Capture stays fast: a dim enters as quickly as it reads; a photo asks one framing decision. The Binder grows — nothing converts, nothing is retyped, history is never silently overwritten. Designer-Taught Intelligence proposes; a human confirms. A GC's patience is a design constraint: names first, scope stated plainly, no account as toll. The margin asks for the designer's hand: redo notes are her voice, verbatim, pinned to the exact item.

## 10 · Notifications matrix

| Event | Recipient | Channel |
|---|---|---|
| Request sent | Pro | SMS (link) |
| Pro opened request | Designer | Push (quiet) |
| Item delivered | Designer | Push, batched per session |
| All items delivered | Designer | Push |
| Verify no-match | Designer | Push, priority |
| Redo issued | Pro | SMS (+ push if app) |
| Due − 24h, undelivered | Pro | SMS reminder (auto, once) |
| Nudge | Pro | SMS, designer-initiated, 1/day cap |
| Request closed | Both | Push / SMS "all set" |

## 11 · Data model (Supabase / Postgres, RLS throughout)

```
site_requests    id · project_id · created_by · assignee_name · assignee_phone
                 status · due_at · note · sent_at · closed_at · created_at
request_items    id · request_id · kit (k01–k06) · title · room_id? · sort
                 guidance jsonb (dim_labels, diagram, shot_list, prompts, markup_ref)
                 status · version
deliverables     id · item_id · kind (dims|photos|video|check) · payload jsonb
                 media_paths[] · captured_at · delivered_at
                 state (delivered|approved|redo|superseded) · review_note · reviewed_at
site_rooms       id · project_id · name · kind · sort
binder_entries   id · project_id · room_id · kind · payload jsonb · media_paths[]
                 source_deliverable_id · approved_by · approved_at
request_access   id · request_id · token_hash · contact · expires_at
                 last_seen_at · revoked_at
transcripts(P3)  deliverable_id · segments jsonb (t, text, room_ref) · embedding vector
```

Guest auth: token exchange (`guest_bootstrap`) mints a short-lived JWT carrying a `request_id` claim; RLS policies on `request_items`/`deliverables` match the claim; Storage policies match the `requests/{request_id}/` prefix. Designers authorize via project membership as elsewhere in Patina. `binder_entries` is append-only by policy.

## 12 · System behaviors

- **Guest entry.** SMS link → universal link. Full app if installed; otherwise **App Clip** (proposal): checklist + measure + photo kits inside the clip budget, graduating to the full app for walkthrough video. Web fulfillment (P2) backstops non-iOS pros — photo and measure kits first (O3).
- **Offline.** On-device queue (SQLite/GRDB); background `URLSession`; resumable uploads via Supabase Storage TUS. Delivery is server-acknowledged; the checklist never claims what the server hasn't received.
- **Media pipeline.** Upload → transcode worker (video preview) → (P3) transcription worker → chapter/segment write → embedding job (pgvector). Workers ride the existing Coolify deploy.
- **Notifications.** APNs for designers (and pros with the app); SMS via provider for guests. All events also land in the request's activity thread — the in-app record is primary.
- **Token lifecycle.** Expires at request close + 7 days (redo grace); resend regenerates and revokes; designer can revoke manually.

## 13 · Designer-Taught Intelligence spec (P3)

| Capability | Trigger | Proposes | Confirmed by | Learns from |
|---|---|---|---|---|
| Chapters & transcripts | Video upload | Room-split chapters, searchable text | Designer (edits chapter bounds) | Corrections |
| Tape read | Tape in frame during measure | The value, as a chip | Pro, one tap | Accept/decline |
| Auto-filing | Delivery without room | Room + item filing | Designer | Refiling |
| Gap sense | Binder coverage scan | Prefilled Measure Set draft | Designer (sends or discards) | Sent/edited/discarded |
| Ask the Binder | Query | Ranked cross-kind results | — (read-only) | Result taps |

The rule, everywhere: **it proposes; the designer confirms.** No suggestion writes to the Binder unconfirmed. Signals stay scoped to the designer's account. The word used in every surface and every doc is Designer-Taught Intelligence — never the two-letter abbreviation.

## 14 · Edge cases & failure states

- **Dead zone site** — capture fully offline; "2 uploading — keep the phone on wifi tonight" on S-19; delivery completes when receipt lands.
- **Pro loses the link** — designer resends from S-05; old token voids.
- **Wrong number** — designer edits assignee pre-open; post-open reassignment is O1 (v1: close and re-send).
- **Designer edits after send** — item versions to v2; pro sees "updated" badge; captured work on v1 stays reviewable.
- **Video fails mid-upload** — TUS resumes; after 24h stalled, both sides see a directive failure state (retry / re-record).
- **Measurement conflicts with Binder** — review surfaces the delta (P3); designer chooses; both values persist in history.
- **Duplicate delivery taps** — idempotent submit on item id + version.
- **Expiry** — request expires at due + 14 days; designer prompted to extend, close, or re-send.

## 15 · Phasing

| Phase | Ships | Proves |
|---|---|---|
| **P1 · The loop** | K-01/K-02 kits, guest link (App Clip proposal), checklist, guided measure/photo, item review with redo notes, Binder v1 (rooms + entries), notifications, S-01–02, 04–08, 10–11, 13–16, 19–20 | A GC delivers through a link he never signed up for |
| **P2 · Rich capture** | K-03 walkthrough + player, K-05 verify, item markup (S-03), offline hardening, web fulfillment fallback, K-04/K-06 | The channel beats texted photos on quality |
| **P3 · Intelligent Binder** | Transcripts + search (S-12), tape read, auto-filing, gap sense, conflict warnings | DTI earns trust one confirmed suggestion at a time |
| **P4 · Spatial** | RoomPlan/LiDAR kit, AR measure, PDF Binder export, dims → CSV/DXF → maker briefs | Site truth flows into drawings and commissions |

**Pilot.** Live Middlewest projects: Leah composes, the Kippley crew delivers, week one of P1. Entry: one active site, one willing pro, rooms seeded. Exit signals: requests fully delivered without a phone call; Leah's redo notes become the P2 spec.

## 16 · Metrics (pilot hypotheses — calibrate before treating as targets)

- Activation: first request sent within week one of access.
- Pro funnel: link → open → first capture → full delivery (hypothesis: most requests fully delivered by due + 1 day).
- Median time-to-delivery per kit.
- Redo rate trending down after week two.
- Displacement: dims arriving in-channel vs texted (qualitative, with Leah).
- Binder coverage: rooms with ≥1 dim set per active project.

## 17 · Risks

- **Pro won't open it** → names-first landing, App Clip path, SMS thread as safety net; measure the funnel before adding features.
- **Video reliability on site signal** → TUS + honest states; walkthrough held to P2 so P1 trust is built on photos and dims.
- **Bad data in the Binder** → provenance on every value, proof photos, review gate, conflict surfacing; approval is the only door in.
- **Scope creep into PM software** → non-goals stand; truth, not tasks.
- **DTI overreach** → the confirm rule is architectural (no unconfirmed writes), not a style preference.

## 18 · Open questions

- **O1** — Reassignment / multiple pros per request: v2 model?
- **O2** — Client visibility: a share-view of the Binder, or never?
- **O3** — Web fallback scope: photo + measure only, or all kits?
- **O4** — Retention for unapproved deliverables after close (proposal: purge at 90 days).
- **O5** — Walkthrough caps: length and resolution defaults.
- **O6** — Verify results: structured pass/fail only, or graded with note required?
- **O7** — Room taxonomy: freeform per project vs kind templates seeding gap sense.
- **O8** — Portal surface: when The Document reads the Binder, what renders in the Desk vs the margin? (Candidate for a workstream R-entry; cross-surface, not Field's call alone.)

---

*Field earned the pocket in the showroom. The site is where it earns the project.*
