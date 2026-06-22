# Handoff — The Document, Track 6: the lead→client gap-closures (R61–R66)

**To:** Claude Code (implementation authority)
**From:** the design session — 2026-06-18
**Closes:** the live lead→client audit (`the-document-lead-to-client-gap-analysis.html`) — gaps **G1** (lead intake), **G2** (the proposal action), **G3** (people in ⌘K), **G4** (runaway timer) — plus the **Discovery capture gap** between intake and the proposal (R66).
**Reads against:** `DECISIONS.md` R61–R66 · `the-document-spec` v1.6 · look/feel references `patina-p0-intake-and-proposal-prototype.html` (intake + proposal) and `patina-discovery-section-prototype.html` (Discovery).

> **Audit-first, hard.** The repo is moving fast and is far ahead of the June-14 gap matrix (People Room, the decision composer, coordination, the whole Document are live). Every "build" below is **new surface over an already-complete data layer** — verify what exists before writing, and assume some of this may already be underway. The rulings name the exact hooks/mutations; confirm them.

---

## Part A — DECISIONS.md state (already appended; footer healthy)

R61–R66 are in the log; footer recomputed and healthy:
`*Entries: D1–D14 · O1–O7 (resolved) · I1–I40 · R1–R66 · L1–L4 · THE GO · FLIP CONFIRMED · last id = R66*`

Build to **R61** (intake triage), **R62** (capture + people in ⌘K), **R63** (proposal action), **R64** (runaway timer), **R65** (which resolved the four ⚠ provisionals — fold its decisions into each slice below), and **R66** (the Discovery section — Slice 5). Nothing to re-paste. The **v1.7 spec fold** for Track 6 is owed but does not block the build.

---

## Part B — build plan

Standing rules: additive-only (D7 — old zones keep working untouched), real data, behind the `the-document-pilot` flag, one PR per slice titled `the-document: track6 N — <name>`, end with the `DECISIONS.md` I-entry + screenshots (desktop ≥1280 + ~390px). Slices 1–2 (intake) chain; slices 3 and 4 are independent and can parallelize.

### Slice 1 — Intake triage on the Desk (R61 + R65)

**Audit first:** `document_state` (00211) Shapes **C** `lead` (`leads.status in ('new','viewed','contacted')`) and **D** `relationship` (`designer_clients.status='lead'` + no live proposal/project) — a captured lead already surfaces as a Brief folder, so this is the missing *act*, not new derivation. Confirm: `useDeclineLead`, `useUpdateLeadStatus`, the `new_lead` need kind in `desk-derivation`, and the nurture/touchpoint row model (People). **Do NOT reuse `useAcceptLead`** — it sets `status='active'`, which is **invisible to `document_state`** (verified: 3 active/no-project rows → 0 visible; flip to 'lead' → 1 Discovery row). Leave it untouched for the old zone (D7).

**Build:**
- New `useBeginDiscovery` (`@patina/supabase`): `leads.status='accepted'` + upsert `designer_clients.status='lead'` → the folder flips **Brief → Discovery** ("Schedule the discovery call").
- The triage component on the lead's Desk folder: **Accept → Discovery** · **Nurture** · **Pass**. Invalidate the Desk/`document-state` query keys in `onSuccess` (the desk key lives in the app) so the folder re-derives without reload (§5).
- **Nurture (R65) = schedule a dated touchpoint.** Capture a reconnect date; `useUpdateLeadStatus('contacted')` moves it off the needs-hand band immediately (gate the `new_lead` folder to `status in ('new','viewed')`), and the dated touchpoint **rises again as a Desk need when due** (`desk-derivation`). A skipped date = shelve to People's reconnect queue (the Engine's "worth reconnecting" covers it).
- **Pass → declined** (`useDeclineLead`, `status='declined'`) — drops Shape C, stays in People as declined.

**Accept:** a `new` lead renders a Brief folder with the three triage acts · Accept flips Brief→Discovery and the row stays **visible** in `document_state` (the 'lead' status, not 'active') · Nurture-with-date leaves the band and re-rises on its due date · Pass declines · all three re-derive the Desk without reload.
**Schema:** additive only — verify a nurture-touchpoint due date exists (add if not); no destructive migration.

### Slice 2 — The Capture front door + people in ⌘K (R62 + R65 + G3)

**Audit first:** `useCreateLead`, the `DocSheet` overlay machinery, the ⌘K command filter, `usePeopleDirectory`, and `leads.response_deadline` (R10 lead window).

**Build:**
- A **"＋ Capture a lead"** CTA on the Desk header **and** a ⌘K **"new lead"** command, both opening a `CaptureLeadSheet` (DocSheet overlay, D1/D4): name · contact · project one-line · **source** → `useCreateLead`. The ⌘K filter is **alias-aware** ("new lead" / "new client" / "capture" all match the command — not only "Ask the Engine").
- Default `response_deadline` = **+1 day** (R10) so the new lead rises as a `new_lead` need.
- **Source field (R65) = free-text with suggestion chips** (Referral · Website/quiz · Instagram · Past client · …). **Store a canonical `source` when a chip is chosen** (free text otherwise) so People's pipeline-conversion / referral-rate stats stay clean.
- **On create (R65): route to `/doc/{leadId}`** — the captured lead opens as its Brief document to continue filling.
- **G3:** ⌘K also returns **"jump to [person] →"** rows from `usePeopleDirectory` — the missing noun beside documents + ledgers.

**Accept:** the CTA and ⌘K both open the capture sheet · "new lead/new client/capture" match the command · a captured lead gets +1d and **opens its Brief doc** · chip sources persist a canonical value · typing a person's name in ⌘K returns a jump-to-person row.
**Schema:** additive — verify `response_deadline`; add source canonicalization if needed.

### Slice 3 — The proposal action (R63 + R65 / G2)  *(independent)*

**Audit first:** `proposal-instruments.tsx` — its `isLive = sent|viewed|accepted|revised` gate excludes **expired/declined** (matches neither `isDraft` nor `isLive`), so **no instrument renders** today, even though the Desk advertises "revise or follow up." Confirm `SendSheet`→`send_proposal`, `ReviseSheet`→`clone_proposal`, the letterhead-instruments component (currently project-only), and `rpc_start_direct_thread` (00103).

**Build:**
- Expired/declined proposals render instruments: **Revise** (primary — `clone_proposal`, a superseding new version) · **Preview** · **Resend** (`send_proposal`). (R65: Revise is primary; no distinct "Follow up" button.)
- Make the **letterhead instruments stage-consistent** — **View as the client · Send a note** across Brief→Care, not project-only.
- **"Send a note" / follow-up** routes through **`rpc_start_direct_thread(client_id)`** (a designer↔client 1:1 thread, no `project_id`) using the proposal's/relationship's `client_id` — `rpc_start_project_thread` can't serve a pre-project proposal.

**Accept:** opening an **expired** proposal shows Revise (primary) · Preview · Resend · the Desk verb maps to Revise + Send-a-note · letterhead instruments appear at every stage · Send-a-note opens a 1:1 thread with no project.
**Schema:** none (presentation + existing RPCs).

### Slice 4 — The runaway-timer bound (R64 + R65 / G4)  *(independent)*

**Audit first:** `time-derivation.ts` (`idleSecondsFromPings`, `IDLE_THRESHOLD_SECONDS=60`, `LogOffer.idleSeconds`, `closeOutTimer`), `document-time-provider`. Today idle is annotation-only (D10) with **no runaway bound** — `closeOutTimer` proposes full elapsed regardless (the 36h / ~2,187-quiet-minute offer we saw).

**Build (extend D10, do not reverse it — normal short idle still annotates, never trims):**
- A **contiguous idle gap ≥ 30 min** marks the timer **abandoned**; on abandonment the close-out proposes the **active** duration (elapsed − idle), idle annotated, not summed.
- `document-time-provider` **auto-pauses accumulation at last-activity (+grace)** on long idle / session end, so raw seconds can't balloon while a tab is closed.

**Accept:** a 30-min+ idle gap → close-out proposes active time (not a 36h figure) · raw seconds stop accumulating on a closed/long-idle tab · short idle still annotates without trimming (D10 intact).
**Schema:** none (derivation + provider). **Telemetry:** log abandonment frequency + idle-annotation volume — mirror the IDLE_THRESHOLD "watch with data" posture; revisit the 30-min number on week-one data.

### Slice 5 — The Discovery section (R66)  *(sits between Slice 2 and Slice 3 — it feeds the proposal)*

**Audit first:** where lead/relationship facts already persist — `leads`, `designer_clients`, and any project/proposal scope fields (rooms, budget, timeline, style/`product_styles`, the room scan from R27/iOS) — the structured essentials should map to existing columns before adding any. Confirm `document_state` Shape **D** `relationship` (Discovery active, from R61), the margin Note kind (R14), and the folio (R24).

**Build (structured capture, not a form-wizard):**
- A **self-composing Discovery section** body (R40 grammar — fills in any order, Strata-mark progress, usable at any %) on the active Discovery section. Replaces the inert spine bar.
- **Five structured essentials** — typed fields, NOT freeform prose: **Scope & rooms** (type enum + room list) · **Budget** (range) · **Timeline** (target / hard dates) · **Style & inspiration** (style tags from the Aesthete vocabulary + a folio board) · **How they live** (per-room lifestyle). Plus deepening (structured where it helps, not gating): **Keep & avoid · Decision-makers · The site & scan** (R27 scan + measurements → folio, R24).
- **The margin stays unstructured-notes-only** — the call's tone/hesitations land as a Note (R14); **never structured facts in the margin.** This is the load-bearing split in R66.
- **The discovery-call checklist** (off R61's "Schedule the discovery call" need) records facts into the structured fields; notes/tone → the margin.
- **Readiness = the five essentials filled → "ready for Direction"** (soft gate): the spine stamp settles and Direction/the proposal opens — no sign-off ceremony, no hard block (R23 gates are client approvals only; discovery isn't one).
- **Auto-seed:** on readiness, the structured essentials **map field → field into the Direction + the proposal Drafting Room** (type, rooms, budget range, style tags, keep-list). Wire the seed off the same fields, not a copy.

**Accept:** the essentials capture as **structured data** (can't be filled as prose) · the margin holds notes only (no structured facts) · the call checklist writes into the fields · five essentials → the section reads **"ready"** and Direction opens · beginning the Direction arrives **pre-seeded** from the structured essentials.
**Schema:** additive — reuse existing scope/budget/timeline/style/room-scan fields where they exist; add typed columns only for genuinely-new essentials (audit first). **Internal in v1** — no client-facing questionnaire.

### Sequence & gates

- **Chain:** Slice 1 → 2 (the funnel front door) → **5 (Discovery)** → feeds 3 (the proposal); **parallel:** 4 is independent.
- **Telemetry to wire:** capture→accept conversion; the 30-min abandonment frequency; ⌘K person-jump usage.
- **No destructive migrations** (D7). The old `/portal` lead/proposal zones stay working untouched.
- **Review milestone:** capture a lead → it opens its Brief → **Accept flips it to Discovery** → capture the five **structured** essentials → Discovery reads **"ready"** and the Direction opens **pre-seeded** → (separately) an expired proposal offers **Revise/Resend** and the timer no longer proposes a 36-hour log. Screenshots to `screenshots/track-6/`.

---

## Kickoff line (paste to start Claude Code)

> Build Track 6 (R61–R66), the lead→client gap-closures, onto the live Desk/Document/People foundation — **audit-first, since the repo's ahead of the gap matrix.** Slice 1: add `useBeginDiscovery` + Desk triage (Accept→Discovery / Nurture-with-date / Pass), gating `new_lead` to status in ('new','viewed') and **not** touching the old `useAcceptLead` 'active' bug. Slice 2: the "＋ Capture a lead" CTA + alias-aware ⌘K "new lead" → `CaptureLeadSheet` (+1d deadline, free-text-with-chips source, route to `/doc/{leadId}`) and "jump to [person]" in ⌘K. Slice 5: the **Discovery section** — a self-composing body capturing five **structured** essentials (scope+rooms · budget range · dates · style tags · per-room lifestyle), the margin staying unstructured-notes-only, essentials-filled → "ready" → **auto-seed** the Direction + Drafting Room. Slice 3 (independent): render Revise/Preview/Resend on expired/declined proposals + stage-consistent letterhead, follow-up via `rpc_start_direct_thread`. Slice 4 (independent): the 30-min runaway-timer bound + auto-pause, extending D10. Additive, behind the flag, one PR per slice. Review milestone: capture → Brief → Accept→Discovery → structured essentials → "ready" → Direction opens pre-seeded; expired proposal offers Revise; the timer stops proposing a 36h log.
