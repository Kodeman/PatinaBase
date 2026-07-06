# Track 6 — Lead → Client funnel completion · Wave 0 architecture addendum

> Closes the gap-analysis P0s **G1** (lead intake) + **G2** (the proposal action) and the
> adjacent P1s **G3** (people in ⌘K) + **G4** (runaway-timer guard).
> Rulings: **R61–R64** (see DECISIONS.md). Prototype: `patina-p0-intake-and-proposal-prototype.html`.
> **Zero migrations** — all work is additive UI + app-layer mutations on a complete read model (D7-trivial).

## What's already built (don't rebuild)

`document_state` (00211) already unions four shapes — verified against the live local schema:

| Shape | engagement_kind | Source / predicate | active_section |
|---|---|---|---|
| A | `project` | `projects` | project/install/care |
| B | `proposal` | live proposal chain, `project_id IS NULL` | direction (draft) / proposal |
| **C** | `lead` | `leads.status in ('new','viewed','contacted')` | **brief** |
| **D** | `relationship` | `designer_clients.status='lead'` AND no live proposal/project/open-lead | **discovery** |

`desk-derivation.ts` already derives `new_lead` (:413), `in_discovery` (:579), `proposal_expired` (:380).
`section-derivation.ts` already maps `engagement_kind='lead'`→Brief. Mutations `useCreateLead`,
`useAcceptLead`, `useDeclineLead`, `useUpdateLeadStatus`, `AddLeadDialog`, the Drafting Room,
`SendSheet`, `ReviseSheet`, `ProposalPreviewRail`, and RPCs `send_proposal`/`clone_proposal`/
`rpc_start_direct_thread` all exist.

## Wave 0 finding — the Accept conflict (SQL-verified)

The old `useAcceptLead` sets `designer_clients.status='active'`, but Shape D (Discovery) requires
`status='lead'`. An `active`, project-less relationship is **invisible** in `document_state`
(proven: 3 such rows → 0 visible; flipping one to `'lead'` → 1 Discovery row, rolled back).
**Fix shipped in Wave 0:** new mutation **`useBeginDiscovery`** in
`packages/supabase/src/hooks/use-leads.ts` (exported from the hooks barrel) — sets
`leads.status='accepted'` + upserts `designer_clients.status='lead'`, mirroring `useAcceptLead`'s
partial-unique-index handling. `useAcceptLead` is untouched (the old `/portal/leads` keeps working).

## Per-agent contracts (Wave 1)

### Agent A — Capture front door + ⌘K (G1 capture, G3) · R62
- **Files:** `app/(document)/desk/page.tsx`, `components/document/command-bar.tsx`,
  `components/document/engine/engine-results.tsx`, new `components/document/overlays/capture-lead-sheet.tsx`.
- "＋ Capture a lead" CTA on the Desk header. `CaptureLeadSheet` (use `overlays/doc-sheet.tsx`
  frame, zero shadows) collects name · contact · project one-liner · source → `useCreateLead`
  (`project_type` is required by the table — map the one-liner/source, default `project_type`).
  Set `response_deadline` +1 day so the lead rises as a `new_lead` need. (`useCreateLead` doesn't
  set a deadline today — either extend the input or PATCH via `useUpdateLeadStatus`/a follow-up update.)
- Command bar: register an **alias-aware "Capture a lead / new lead"** command; add **"jump to
  [person] →"** rows from `usePeopleDirectory`. Reuse the existing action/ledger row pattern.
- **Does NOT touch `doc/[id]/page.tsx`** → runs parallel-safe with B and D.

### Agent B — Triage on the Desk + Brief body (G1 triage) · R61
- **Files:** `components/document/folder-card.tsx` (or a new `TriageBar`), `lib/document/desk-derivation.ts`,
  the **Brief-stage block** in `app/(document)/doc/[id]/page.tsx`.
- Inline **Accept / Nurture / Pass** on `new_lead` folders → `useBeginDiscovery` /
  `useUpdateLeadStatus('contacted')` / `useDeclineLead`. In each onSuccess, **also invalidate the
  Desk/document-state query key** (find it in `use-desk-engagements.ts`) so the folder re-derives
  without reload (one-act-many-surfaces).
- **Gate the `new_lead` needs-hand folder to `status in ('new','viewed')`** in `desk-derivation.ts`
  so a `contacted` (nurtured) lead leaves the needs-hand band. Tune post-accept text → "Schedule the
  discovery call".
- Fill the **Brief section body** (currently quiet) when a lead document opens — captured contact,
  one-liner, source, and the triage affordance, in Document grammar.
- Shares `doc/[id]/page.tsx` only with Agent C, in a **distinct region** (Brief block vs. proposal block).

### Agent C — The proposal action (G2) · R63  — run AFTER B (shares `doc/[id]/page.tsx`)
- **Files:** `components/document/proposal-instruments.tsx`, `components/document/letterhead-instruments.tsx`,
  the proposal/relationship instrument mount in `app/(document)/doc/[id]/page.tsx`.
- Extend the actionable set so **expired/declined** proposals offer **Preview · Resend · Revise**
  (reuse `SendSheet`→`send_proposal`, `ReviseSheet`→`clone_proposal`). `proposal-instruments.tsx:~82`
  currently `isLive = sent|viewed|accepted|revised` — expired falls through to nothing.
- Make letterhead instruments **stage-consistent** (View as the client · Send a note) across stages,
  not project-only. Route "Send a note" with no project_id through **`rpc_start_direct_thread(client_id)`**.

### Agent D — Runaway-timer guard (G4) · R64
- **Files:** `lib/document/time-derivation.ts`, `hooks/document-time-provider.tsx`, `__tests__`.
- Add an **abandonment guard**: a contiguous idle gap ≥ `RUNAWAY_IDLE_SECONDS` (provisional 30 min)
  marks the timer abandoned; the close-out then proposes **active** time (elapsed − idle), idle
  annotated, not summed. Provider **auto-pauses at last-activity** on long idle / session end.
  Normal short idle keeps the shipped D10 annotate-don't-trim. Unit-test the bound.
- Touches no file shared with A/B/C → parallel-safe.

## Parallelism

A, B, D are file-disjoint → safe to run together. **C runs after B** (both edit `doc/[id]/page.tsx`).

## Verification (Wave 2)
- `supabase db reset` clean (no new migrations); SQL smoke: capture→Shape C, `useBeginDiscovery`→Shape D,
  decline→off-Desk, `rpc_start_direct_thread` on a pre-project proposal.
- designer-portal `type-check` + `build`; document jest/vitest (mock `field-primitives` per-suite — ESM trap).
- Live Chrome walk (flag `the-document-pilot` on): capture→triage Accept→Discovery; ⌘K "new lead" + jump-to-person;
  expired proposal → Revise/Resend/Follow-up act; timer close-out proposes a sane number. Zero shadows; D1 preserved.
- Screenshots ≥1280 + ~390px; PRs titled `the-document: …`.
