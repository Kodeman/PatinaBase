# Grounding — Schedule spine as status organ (Direction A), 2026-08-13

## 1. Schedule data model

- `proposal_phases` (00066:59-79): name, phase_key, duration_weeks, fee_cents, revision_limit, gate_condition (TEXT free text), deliverables, sort_order. No dates until 00324.
- `project_phases` (00066 ~:260): + status CHECK (pending|in_progress|completed|delayed), start_date, target_end_date, completed_at, duration_weeks, fee_cents, revisions, gate_condition TEXT, deliverables, progress 0-100.
- **`gate_condition` is decorative, not evaluated** — rendered only as "Configured gate note ·" (`phase-advance-control.tsx:200-202`, `phase-builder.tsx:556`). Phase advance = manual `advance_project_phase` (00393). The only programmatic gates are WP4 procurement gates G1–G3 (derivations, not this column).

**Progressive-fidelity chain model ALREADY EXISTS (00323–00327, 00331; R99/R100), behind `schedule-spine` flag** (⚠ HANDOFF I55: flag live at 100% on PostHog contradicting design-authority-only intent — reconcile before ship):
- 00323:84-115 adds to project_phases: `duration_days` (authoritative), `follows_phase_id` (self-FK chain, cycle-guarded), `anchor_date` (pins phase START only), `lane 'main'|'thread'` (procurement = canonical thread).
- Precedence (00323:11-21; `packages/utils/src/schedule.ts:16-17`): duration_days > duration_weeks*7 > stored start/target dates (legacy) > unresolved.
- `schedule_milestones` (00323:120-153): phase_id, name, kind (signoff|decision|delivery|event), offset_days (relative to phase END), anchor_date, status (upcoming|due|signed|slipped). Nullable anchor + offset = working milestone.
- `proposal_schedule_milestones` (00324:149-223): anchor_date NOT NULL, no offsets, per R101.3 — "a proposal milestone is a COMMITMENT the client signs against… always a hard date, never a working offset."
- `schedule_revisions` (00323:227-279; writes 00326): append-only baseline ledger, v1 cut inside `activate_proposal_as_project` at signature; v2+ via `commit_schedule_edit` (00325) → `cut_schedule_revision` (00326); actor server-resolved (forgery-proof).
- **Pure resolver** `resolveSchedule` (`packages/utils/src/schedule.ts:1-90`) — the single place dates are computed ("Nothing else in the app computes time", R100). Clockless, total. Forward pass from anchor/projectStartDate; backward pass under anchor; slack per anchor; overlap → lane:'thread'; fallback source:'legacy-dates'; never inferred from sort_order (I56).
- Entry grammar (R100): durations `3w`/`10d`/`Sep 21`; typed hard date auto-anchors (chip, one-click unpin). Today the ONLY hardening act is manual typed entry — no event wiring.

**Project-level**: `projects.start_date`, `projects.target_end_date` (00066) = the TARGET tier. ⚠ **Dead field bug**: doc header vitals read `project?.target_completion` (`doc/[id]/page.tsx:134,977`) — not a real column (real one = target_end_date); typed AnyRecord so it silently renders nothing. Header "Target" chip is dead code today.

**TARGET vs ACTUAL**: target_end_date vs completed_at; no separate actual_start (start_date doubles). **Provenance today**: none outside the spine slice — a stored date looks equally true whether first guess or locked commitment; the resolver's `source` field ('anchor'|'chain'|'legacy-dates'|'unresolved') is the only provenance and is UI-invisible outside the flag. `schedule_revisions` = the only date memory (studio-only; O8 open on client visibility).

**`activate_proposal_as_project`** (head lineage 00140→…→00324→00326→00331; verify head before touching): copies proposal_phases→project_phases 1:1 incl. chain columns (00324 two-pass + follows remap); first phase in_progress; current_phase = first phase_key; legacy date cascade KEPT for compat → **two parallel date-computation paths live in prod** (legacy stored cascade for everything outside the flag; pure resolver behind it). Anchored proposal milestones → schedule_milestones (offset NULL, upcoming). Baseline v1 cut here.

## 2. Schedule UI

- `ScheduleSpine` (`components/document/schedule/schedule-spine.tsx`) — unfolded: phases as headings on a vertical spine; three row types: milestones (diamonds), items (client_decisions/ball-in-court), threads (parallel lane). Tasks NOT yet a row type (O9 direction-only; CoordinationWork still mounts beneath as interim).
- `ScheduleRule` (`schedule-rule.tsx`) — folded state; drawn rule, staggered labels, today-rule, thread hairlines.
- `useResolvedSchedule` (`packages/supabase/src/hooks/use-schedule.ts`) — the single impure door (I57); fetches phases + milestones, calls resolveSchedule once.
- `RippleProvider` (`schedule-ripple-context.tsx`) — ONE in-flight edit preview (never a queue); one RippleDiff shared by Rule ghosts, Spine inline preview, confirm strip. Commit via `commit_schedule_edit` (phase-duration | phase-anchor | milestone-offset; milestone-offset always clears anchor). Every commit cuts a revision.
- Delay propagation = resolver forward-pass contiguity + anchor-holding: unanchored downstream shifts automatically; anchored downstream reports shrinking slackDays or chain_does_not_fit + overrunDays ("the anchor holds… UI draws the collision").
- **"NO ACTIVE OR DELAYED PHASE IS CONFIGURED"** = `workflow/section-stage-line.tsx:101-103` — NOT the spine system; it's the R1/WP3 workflow-stage classifier (residential-workflow.ts / get_project_workflow, 00433-lineage), an independent classification of phases into canonical stages/tracks. Fires when IT finds no active/delayed phase — independent of a perfectly good chain.
- "COMPOSE A SCHEDULE · THREE STARTING POINTS" = `schedule-birth.tsx:115` (R100): Patina Six template (`seed_project_schedule_from_template`), from a past project (`copy_schedule_as_built` — actual elapsed durations become new estimates: history-as-estimate IS progressive fidelity), blank (`ghost-add-line.tsx:221` "Name a phase…").

**The Week-2 contradiction — four uncoordinated truths**:
1. `section-derivation.ts:106-113` — "Active · Week N" = raw calendar math off projects.start_date; zero phase/resolver awareness.
2. `doc/[id]/page.tsx:127-136` vitalsFor — stored current_phase TEXT + dead target_completion.
3. `section-stage-line.tsx` — workflow-stage classifier, third independent answer.
4. The resolver — the only good one — read ONLY by flag-gated Spine/Rule.
None of 1–3 consult resolveSchedule. This is the concrete case for Direction A.

## 3. Commitment-events inventory

| Event | Mechanism | Could anchor |
|---|---|---|
| Design-services agreement executed | commercial_state ratchet draft→sent→client_signed→executed (00412–00414); countersign RPC | Engagement/design start. Note: this rail is separate from the legacy proposals.status='accepted' path that cuts revision v1 — not wired to cut_schedule_revision |
| Furnishings authorization executed | create_furnishings_authorization_from_schedule + execution (00422); draws lines FROM project_ffe_items; soft-locks money fields | Procurement-thread start per executed wave |
| Trade scope / draws | trade_scope_terms progress ratchet; trade_scope_draws (Σ=price) (00423) | Trade thread start (engaged/draw-1) and completion (accepted, client-only act) — lane:'thread' material |
| Trade RFQ | 00424 | Signal only, NOT a hardening event |
| PO release | po-send edge fn; purchase_orders.sent_at | FF&E production-start; WP4 step 02 evidence — natural procurement anchor |
| PO ack/production/shipped/delivered | acknowledged_at, status+last_status_change_at, shipped (UNDATED — no departure fact), delivered_date | Goods-tracking fidelity (WP4 15-step), not phase anchors today — no wiring into phases/milestones |
| Deposits/payments | po_payments.paid_date; project_payment_milestones.paid_at | Payment-gated phases — but payment milestones explicitly kept separate from schedule_milestones (I56 A0.3 semantic collision), no cross-wiring |
| Install booking | **DOES NOT EXIST.** site_requests (00374) = Field media-capture with due_at, not a booking. No table/RPC books an install date | THE gap: "install booked" has no backing mechanism; closest analog = manual anchor via entry grammar |
| close_project | 00394 (lineage 00238→00383→00387→00394); hard-gated: all phases completed, all decisions responded, all scope changes resolved | Project end / final hardening — already refuses to fire on unfinished schedule |

**Pattern**: every event exists as a real auditable act, but NONE writes anchor_date/duration_days/milestones today. Only manual typed entry does. Direction A's event-hardening = a genuinely new wiring layer over existing chain model + existing acts.

## 4. Ratified constraints

R99–R106 (docs/design/the-document/DECISIONS.md):
- **R99**: Spine+Rule are ONE schedule, folded/unfolded, from one resolved chain; overlap renders as parallel hairline never false sequence. Direction A must FEED this, never add a competing time surface.
- **R100**: phase = duration+link or anchor; dates never primary truth on unanchored entries; ONE pure resolver; birth = three starting points; backward-compute under anchored install date; overlap legal; every edit previews via ripple; anchors refuse silent movement ("a drag that would break [an anchor] names the conflict instead"); signature freezes v1; every change cuts a revision. **Event-hardening must express as anchor/duration writes through the existing ripple→commit→revision path.**
- **R101**: clients don't see the Spine (studio-only; later "Almanac" projection); items sort blocking-first; proposal carries phases + ANCHORED milestones only ("the client signs against commitments… working milestones are composed after signature"). No client-facing working detail without a new ruling.
- **O8 (OPEN)**: client visibility of revisions/ghosts — leaning "clients see revisions touching client-facing dates; full ledger studio-side". Must resolve before client-facing fidelity display.
- **O9**: tasks fold into items eventually — not done.
- **I56**: NO chain backfill; adoption = compose-time human act, "assisted, confirmed, never silent." Auto-hardening must follow the same non-silent posture.
- **R105**: slices 03–05 accepted; comember-widening pass owed pre-rollout; flag-state contradiction (I55) to reconcile.

R1–R9 (workflow-alignment, ratified 2026-08-11):
- **R1** one paper one spine — stage classifier narrowed to section sub-labels + track fills; never a second stage surface. Under Direction A the sub-label must read through the resolver or be reconciled so they can't disagree.
- **R2** gates = six-part boundary ceremony (ARTIFACT/QUESTION/SCOPE/IMPACT/AUTHORITY/CONFIRMATION) — reuse, don't invent a third gate grammar.
- **R3** handoffs are margin items — no new bands.
- **R4** overdue = a condition: one fact, exactly three renderings (terracotta stamp / guide sentence / Desk re-sort); never badge/banner/count/push/modal/auto-action. Schedule-delay must follow this.
- **R5/R6** guide + desk need lines derive from the current gate (canonical_stage_key); 2–4 folio ceiling untouched.
- **R7** WP4 = rendering grammar over existing columns, ZERO new schema — precedent: derive, don't duplicate.
- **R8** overdue is the studio's condition — client-side indicator removed.
- **R9** schema may ship ahead of UI behind flags until governance rules.
- **§7 guard (№7/№8 open)**: actor-neutral lexicon — schedule copy naming commitment events must avoid commercial-actor language until №7 resolves.

## 5. Surfaces that must re-derive from the resolver

| Surface | File:line | Today | Under Direction A |
|---|---|---|---|
| Doc header vitals | doc/[id]/page.tsx:127-146 | stored current_phase + dead target_completion | resolver's active phase + computed targetEndDate (fix dead field regardless) |
| "Active · Week N" | section-derivation.ts:96-113 | calendar math off start_date | resolver position/slack |
| Stage sub-label | section-stage-line.tsx (+lib) | independent workflow classifier | read through / reconcile with resolver (R1-compatible) |
| Desk motion chip | desk-derivation.ts:814-947 deriveMotion | NO phase text for projects (only drift/in-flight) | resolver's live phase/slack/next-milestone |
| Desk need lines | desk-derivation.ts:483- deriveNeed | decision/PO/task facts, gate-keyed (R6) | schedule-conflict need routes here gate-keyed (test scaffold exists: desk-schedule-conflict.test.ts) |
| folder-card.tsx | — | renders what derivations hand it | downstream, automatic |

## Net picture

The hard part (pure resolver, anchors, ripple, revisions) is BUILT and ratified, behind a flag. Direction A =
(a) collapse header/sub-label/desk/classifier into readers of the one resolver;
(b) wire the §3 commitment events into anchor/duration writes through ripple→commit→revision, honoring I56's never-silent posture;
(c) fill the one real gap — an install-booking act to anchor install week;
(d) fix the dead target_completion field;
(e) reconcile the schedule-spine flag state (I55) before ship.

---

## Corrections (from PLAN.md verification pass, 2026-08-13)

- §1's `activate_proposal_as_project` lineage is STALE: live head is `00435_ffe_ga_rpc_boundaries.sql`, not 00331. Re-grep before touching.
- §4's "R105 comember-widening owed" is essentially DISCHARGED by 00316/00326/00387/00399/00401/00461; the only residual is `apply_phase_template` (00461 ~:174,585) gating template visibility on `is_system OR designer_id = v_actor`. DECISIONS I59's "deliberately omitted" note on proposal_schedule_milestones is stale — 00401:837-884 closed it.
