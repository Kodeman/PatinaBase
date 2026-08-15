# PLAN — Direction A: the spine as status organ

**Implements** R107–R114 (DECISIONS.md, 2026-08-13). **Grounded in** `docs/design/schedule-fidelity/grounding.md`. **Out of scope:** O10 (client-visible fidelity — blocked on O8), O11 (payment milestones hardening — I56 A0.3 collision stands). Neither is touched by any wave below; no code path in this plan reads `project_payment_milestones` or emits schedule fidelity to a client surface.

Migrations head at time of writing: **00473**. Numbers minted here are PROVISIONAL (patina-db-migrations §8).

---

## 0 · Verification corrections to the grounding

Three claims from grounding §2/§5 were spot-checked and are **confirmed**; two gate claims are **materially different from the ruling's assumption** and change the sequencing.

**Confirmed:**
- `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:134,977` — `project?.target_completion` on an `AnyRecord` (`:108 type AnyRecord = any`). Dead field; two call sites, both silent. Real column is `projects.target_end_date`.
- `apps/designer-portal/src/lib/document/section-derivation.ts:106-113` — `activeSub` case `'project'` does `Math.floor((now - projectStartDate)/WEEK_MS)+1`. Zero phase/resolver awareness. Caller at `page.tsx:413` feeds `projectStartDate: project?.start_date`.
- `apps/designer-portal/src/components/document/workflow/section-stage-line.tsx` carries all three leaked strings: `:101-103` "No active or delayed phase is configured" (the `model === null` branch), `:85-93` "N active phases not classified to a canonical stage", and `:106` renders `model.provenance` whose fallback is `section-stage-line.ts:71` `"Derived from the project schedule · no template provenance recorded"`.

**Corrected — GATE 1, the R105 comember-widening pass is effectively already discharged.** The ruling treats this as owed work. It is not, or is nearly not:
- `commit_schedule_edit` and `cut_schedule_revision` were re-cut widened in `00326_schedule_memory.sql:681,90` (`public.is_studio_comember(designer_id)`), superseding 00325's narrow `designer_id = auth.uid()` guard.
- `project_phases` RLS widened at `00316_studio_shared_workspace_rls.sql:158`; `schedule_milestones` and `schedule_revisions` each carry a studio sibling policy alongside the narrow one (`00323:191,266`) — permissive OR, so covered.
- `proposal_schedule_milestones` — DECISIONS I59 (line 3418) records the studio-comember leg as *deliberately* omitted, but `00401_proposal_policy_locking_integrity.sql:457-460,837-884` **dropped the narrow policies and recreated all four on `is_design_studio_comember`**. The recorded exception is stale.
- `apply_phase_template` (head `00461:82`) and `copy_schedule_as_built` (head `00399`) both guard on `public._can_author_proposal(...)` (00387:533), itself a comember predicate.

**The one residual:** `apply_phase_template` head body, `00461` lines ~174 and ~585, gates template visibility on `is_system OR designer_id = v_actor` — a comember cannot apply a studio-mate's private `phase_templates` row. That is the whole remaining pass. **Do not redo the R105 sweep.** Action: probe live (below), then close the residual in one small migration if confirmed.

**Corrected — GATE 2, the I55 flag contradiction is a decision, not an investigation.** Confirmed at `DECISIONS.md:3761`: PostHog flag `schedule-spine` **id 764880, project 326191, 100% general rollout, no property conditions** — contradicting R105's ship posture (`:3694-3698`: "created disabled and enabled for the design authority alone as pilot"). Consumer is `page.tsx:518` (`useFeatureFlag('schedule-spine')`), fail-closed while loading, gating `<ScheduleSpine>` vs `<CoordinationBand>`. So the Spine has been live to **all designers** since ~2026-07-16, not to Kody alone. Decision procedure in §1.G1 — the plan does not assume which way it goes.

---

## GATES (must clear before Wave 1 merges)

### G1 · Reconcile `schedule-spine` (I55) — **decision, then act**
Do not silently flip. Procedure:
1. **Establish the fact.** PostHog: read flag 764880 in project 326191: rollout %, conditions, and the *evaluation history* (how many distinct designers have actually seen `true`). Also `document_state`/`project_phases` probe: how many projects have non-null `duration_days`/`follows_phase_id`/`anchor_date` — i.e. how many designers have already *composed* against the spine and would lose their surface if the flag narrows.
2. **Put the two options to design authority (Kody), not to engineering.** (a) **Ratify the live state** — the 100% rollout becomes intentional; Wave 1's collapse ships to everyone at once and the flag becomes vestigial. (b) **Restore pilot intent** — narrow 764880 to `kody@kochaver.com`, accepting that any designer who composed a chain in the last four weeks loses the Spine and falls back to `CoordinationBand` with their chain columns intact-but-invisible.
3. **Whichever wins, Wave 1's collapse surfaces are gated on a NEW flag, `schedule-fidelity`, not on `schedule-spine`.** Rationale: the four status mouths (header, sub-label, stage line, desk) are *not* the Spine — they render on every project document whether or not the Spine is mounted, so coupling them to a flag whose meaning is contested imports the contradiction. `schedule-fidelity` is created **disabled**, fail-closed (matches `use-feature-flag.ts`'s documented posture), enabled for design authority first.
4. Record the outcome as a new DECISIONS entry (I-series) before Wave 1 merges. **Blocker.** Size **S** (one PostHog read + one ruling).

### G2 · Close the R105 residual
1. **Probe, don't infer:** against Strata — confirm the live `apply_phase_template` body still carries `is_system OR designer_id = v_actor` (`pg_proc`), and confirm `proposal_schedule_milestones` policies are the 00401 design-studio set (`pg_policies`).
2. If confirmed: **`supabase/migrations/00474_schedule_template_comember_visibility.sql`** — `CREATE OR REPLACE FUNCTION public.apply_phase_template(...)` grafted from the `00461` body verbatim (grep-`|sort|tail -1` winner), single delta: `AND (is_system OR public._can_author_proposal(designer_id))` at both sites. Banner lineage `00324 → 00461 → 00474`. No grants added ⇒ no `generate-legacy-grants.py` re-run. Regenerate types is a no-op (no public-schema shape change) — still run `pnpm db:generate` and assert `git diff --exit-code` clean.
3. If the probe shows 00401's policies did *not* land on Strata, that is a different (larger) finding — stop and report, do not widen scope here.
Size **S**.

---

## WAVE 1 — The collapse (no event wiring, no schema)

R114: this ships first. Four mouths become readers of one derivation. No RPC changes, no migration except G2.

### 1.1 · The selection + fidelity library (the new load-bearing piece)

**Ruling gap — flagged, not reinterpreted.** R111 says "the resolver selects the active phase." **`resolveSchedule` has no selection function.** `ResolvedSchedule` (`packages/utils/src/schedule.ts:136-141`) is `{ phases, milestones, conflicts, slackDays }`; `ResolvedPhase` (`:118-126`) has no "active" notion. R108 likewise says "Week 2 exists only downstream of a hard anchor," but `ResolvedPhase.source` cannot answer that: `source:'chain'` covers both *rooted at an upstream `anchor_date`* (hard) and *rooted at `projectStartDate`/legacy `startDate`* (soft) — the resolver tracks the distinction internally as `via` (`:403-470`) but does not export it.

**Decision (call this out to design authority):** extend the resolver's *output*, not the schema. Two additive fields on `ResolvedPhase`, both pure, both computed inside the existing passes:
- `governingAnchorId: string | null` — the id of the anchored phase the chain traces to (own id when `source==='anchor'`; the forward-pass origin's anchor when reached through `via:'forward'`; the downstream anchor when `via:'backward'`; `null` when the origin was `projectStartDate` or legacy dates).
- `origin: 'anchor' | 'project-start' | 'legacy' | 'none'` — names the root of the phase's date, so the fidelity mapper needs no second traversal.

This is derivation over existing data (R7 precedent) — no new column, no new query. Without it, R107 and R108 are jointly unimplementable as written.

**New file — `packages/utils/src/schedule-fidelity.ts`** (placement decision: `packages/utils`, beside `schedule.ts`, **not** the portal lib. Reasons: it is pure and clock-injected exactly like the resolver; the desk, the doc, and — later — the proposal composer all consume it; `schedule-entry.ts`/`schedule-compose.ts` set the precedent of schedule-adjacent pure modules living here; and admin-portal will eventually need the same vocabulary. Portal-lib placement would force a second copy the moment the desk and the doc diverge in module graph.)

Exports:
```
export type Fidelity = 'band' | 'frame' | 'committed' | 'record';
export function phaseFidelity(phase: ResolvedPhase, status: PhaseStatus): Fidelity
export interface ScheduleSelection { activePhaseId: string | null; reason: 'today-in-window'|'status-in-progress'|'next-upcoming'|'none'; }
export function selectActivePhase(resolved: ResolvedSchedule, statuses: Map<string,PhaseStatus>, today: string): ScheduleSelection
export function positionText(resolved, selection, today): string | null   // "Week 3" | "Band" | "Frame"
export function targetEnd(resolved): { date: string | null; fidelity: Fidelity }
```
Mapping (R107, spelled so it is testable):
| `origin` / status | Fidelity |
|---|---|
| status `completed` (any origin) | `record` |
| `source==='anchor'`, or `origin==='anchor'` | `committed` |
| `origin==='project-start'` (`source==='chain'`) | `frame` |
| `origin==='legacy'` (`source==='legacy-dates'`) | `band` |
| `source==='unresolved'` | `band` |

Selection (R111): the resolver selects, by date window `[start,end]` containing `today`, excluding `completed`; ties broken lane `main` before `thread`, then `sort_order`. If no window contains today, fall back to the single `in_progress`/`delayed` phase if exactly one exists (`reason:'status-in-progress'`), else the earliest `start > today` (`reason:'next-upcoming'`), else `null`.

**Week N (R108, the T1 kill):** `positionText` returns `"Week ${n}"` **only** when `selectActivePhase` returns a phase with `governingAnchorId !== null`, where `n = floor((today − governingAnchorDate)/7)+1`. Otherwise it returns the fidelity word — `'Frame'` or `'Band'` — never a week. Legacy-dates projects therefore read `Band`, never `Week 14`. This is the honest rendering I56 demands: no backfill, and the two parallel date paths stay parallel; the collapse just stops lying about which one it read.

Files touched: `packages/utils/src/schedule.ts` (additive output fields + the two passes), `packages/utils/src/index.ts` (re-export), new `packages/utils/src/schedule-fidelity.ts`.
Tests: extend `packages/utils/src/schedule.test.ts` (pin `governingAnchorId`/`origin` for each of the eight existing chain shapes incl. backward pass, cycle, orphan link); new `packages/utils/src/schedule-fidelity.test.ts` (fidelity table above × selection matrix × Week-N gating; the "legacy project must never say Week N" case is the headline assertion). Runner is **jest** (`@patina/utils` `"test":"jest"`), not vitest. Size **M**.

### 1.2 · Header vitals (R108 + the ratified quick fix)

`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`
- `:126-147 vitalsFor` — signature changes from `(row, project, proposal)` to `(row, project, proposal, schedule: ScheduleVitals | null)`. Project branch becomes: resolver-selected phase name · `targetEnd()` rendered with its fidelity register (`Target Nov 2026` when `committed`; `Target ~Nov 2026` / band language when `frame`/`band`; nothing when `band` with no date) · money unchanged.
- Kill `project?.target_completion` at **both** `:134` and `:977`. `:977` (`CareSection completedLabel`) reads `project?.target_end_date` — that is the honest column and Care is a settled surface, so no fidelity register needed there.
- Narrow `type AnyRecord = any` (`:108`) for `project` at least to `{ target_end_date: string|null; total_amount_cents: number|null; start_date: string|null }` — the `any` is why the dead field was silent. Low cost, high value; do it.
- Data: `page.tsx` already holds `phases` (`:412 installPhase` derives from it). Add `useResolvedSchedule(row.project_id)` beside it — one hook, and `useProjectPhases` is already in flight so the marginal cost is the `schedule_milestones` query only.

Tests: `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx` (exists; already mocks `schedule-spine`). Add cases: dead-field regression (a project with `target_end_date` set renders a target; one with only a phantom `target_completion` renders none), and a `band` project renders no fake target. Size **S**.

### 1.3 · "Active · Week N" (R108)

`apps/designer-portal/src/lib/document/section-derivation.ts`
- `SectionFacts` (`:33-39`) gains `schedule: { selection, fidelity, positionText } | null` (a narrow projection, not the whole `ResolvedSchedule` — keeps this module dependency-light per its own docblock).
- `activeSub` case `'project'` (`:106-113`): delete the `WEEK_MS` arithmetic. Return `Active · ${positionText}` where positionText is `Week N` / `Frame` / `Band`, falling back to bare `'Active'` when `schedule === null` (loading) — never a computed week.
- `futureSub` case `'install'` (`:120-123`) reads `f.installStartDate`, which `page.tsx:412` sources from `installPhase?.start_date` — a **legacy stored date**. Reroute to the resolver's `end`/`start` for the installation phase and render with its fidelity register. (Grounding §5 does not list this surface; it is the same lie in a fifth mouth and R108 reaches it.)
- Caller `page.tsx:413`: pass the projection; drop `projectStartDate` from the week math (keep the field, other cases use it).

Tests: `apps/designer-portal/src/lib/document/__tests__/section-derivation.test.ts` — replace the week-math cases with the three-register cases plus a "legacy project never says Week" assertion. Size **S**.

### 1.4 · Stage line (R111 selection split + R113 string removals)

`apps/designer-portal/src/lib/document/section-stage-line.ts` — the classifier **loses selection**. Today `headlineGroupFor` (`:96-103`) picks the headline by *canonical track order over the classifier's own active groups*; under R111 the caller passes the resolver's selected phase id and the classifier's job reduces to naming that phase's stage.
- `deriveSectionStageLine(state, selection: ScheduleSelection, fidelity: Fidelity)`.
- `headlineGroupFor` becomes `groupContainingPhase(state, selection.activePhaseId)`; the canonical-track fallback survives **only** when `activePhaseId === null` (no schedule at all), and in that case the sub-label must not claim a position.
- `subLabelFor` (`:47-58`) becomes **stage · position · fidelity**: `"Design Development · FF&E · stage 06 of 04–09 · Week 3 · Committed"` / `"… · Band"`. Position comes from `positionText`, never recomputed here.
- `provenanceFor` (`:60-74`): delete the `"no template provenance recorded"` and `"no project phase topology"` fallbacks. When there are no template sources, return `null` and render nothing. **Leaked string 3 killed.**
- `unclassifiedCount` stays in the model (telemetry/tests may want it) but **stops rendering**.

`apps/designer-portal/src/components/document/workflow/section-stage-line.tsx`
- `:80-95` — delete the `unclassifiedCount > 0` disclosure block. **Leaked string 2 killed.**
- `:99-104` — the `model === null` branch's "No active or delayed phase is configured" is replaced by **band rendering**: the section stage line renders the fidelity word and the tracks it does know, or renders nothing at all when it knows nothing. R113: an unanchored engagement is a legitimate Band. **Leaked string 1 killed.**
- `:105-107` — render `model.provenance` only when non-null.

`apps/designer-portal/src/components/document/section-stage-line-mount.tsx` — now needs the resolver. It already owns `useProjectWorkflow`; add `useResolvedSchedule(projectId)` + `selectActivePhase`/`phaseFidelity`, and pass the selection down. Keep the existing `isLoading` ("Reading project workflow…") and `isError` ("Stage position unavailable · the schedule itself is unchanged") branches — both are honest and neither is a leaked machine string; extend the loading gate to cover the schedule query too so no half-derived label flashes.

**Setup nudges move to the desk (R113 + R6).** The removed strings were doing real work for a designer with an unconfigured schedule. That work relocates to `deriveNeed` as a new need kind, gate-keyed on `canonical_stage_key` per R6 — see 1.5. It must **not** appear in the doc body in any form.

Tests: `__tests__/section-stage-line.test.ts` (rewrite: selection-driven headline, three-part sub-label, provenance-null path, no unclassified copy, band path). Add a **string-absence contract test** in the same suite asserting none of the three retired strings appears in either module's output for any input — this is the R113 regression guard and it is cheap. Size **M**.

### 1.5 · Desk (R108 motion + R113/R6 need)

`apps/designer-portal/src/lib/document/desk-derivation.ts`
- `deriveMotion` (`:814-947`): today a project falls through drift → `in_flight` → `null` — no phase text at all. Add, **above** `in_flight` and **below** the R28 drift tier (drift is an existing R22 chip and outranks a status statement): a `schedule_position` motion kind rendering fidelity-honest text — `"Design Development · Week 3"` (committed), `"Design Development · Frame"`, `"Band — no anchor yet"`. Never a bare date on a `band` source.
- `deriveNeed` (`:483-…`): new kind `schedule_unconfigured` — "Name the phases for this project" / "Anchor the install week" — gate-keyed on the current gate per R6, ranked **below** `schedule_conflict` and below `task_due` (it is setup, not a live obstruction). This is where R113's nudges live.
- New `MotionKind`/`NeedKind` union members + `NEED_ACTION_LABELS` entries.

`apps/designer-portal/src/hooks/use-desk-engagements.ts` — new side feed. Follow the `buildDeskConflicts` precedent exactly (`:37,241`): **one** query for phases across all desk projects (`project_phases` select chain columns + status + sort_order, `.in('project_id', projectIds)`), **one** for `schedule_milestones` through the phase join, both added to the existing `Promise.all` (`:~150-201`), each degrading to `undefined` on its own error (`:240-241` pattern) so the desk never dies on the feed.

New file `apps/designer-portal/src/lib/document/desk-schedule.ts` — `buildDeskSchedule(phaseRows, milestoneRows, today): Map<projectId, DeskScheduleInput>`, grouping by `project_id` and calling `resolveSchedule` + `selectActivePhase` **once per project**. Pure, testable, mirrors `desk-conflicts.ts`.

`partitionDesk` gains the map as an eighth argument (it already takes seven).

Tests: `__tests__/desk-derivation.test.ts` (motion ranking), new `__tests__/desk-schedule.test.ts` (grouping + per-project resolution + the "50 projects" perf shape), and **`__tests__/desk-schedule-conflict.test.ts` — the existing 127-line scaffold**: extend its `projectRow()` fixture and add the `schedule_unconfigured` ranking cases beside the existing `schedule_conflict` ones; it already pins that drift stays a chip and never a need, which is the exact discipline the new need must not violate. Size **M**.

### Wave 1 gates, flags, rollout

**Gate commands** (patina-verification matrix — `designer-portal`'s real gate is `type-check`, `build` is NOT a gate; `@patina/utils` has both `type-check` and `test`):
```
pnpm --filter @patina/utils test
pnpm --filter @patina/utils build            # shared-package edit → build before consumers type-check
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- section-derivation section-stage-line desk-derivation desk-schedule desk-schedule-conflict
pnpm --filter @patina/designer-portal lint   # the ONE lint that resolves in this repo
pnpm --filter @patina/admin-portal build     # repo's strictest gate — @patina/utils is shared
pnpm --filter @patina/client-portal type-check
```
Do **not** report a root `pnpm test` sweep as coverage — it silently skips `types`/`shared`/`catalog-ui`/`manufacturer-portal`.
Live-data check: re-render `/doc/{id}` with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (the `withMockData()` fallback at `lib/mock-data.ts` swallows any error into mocks — a "working" header proves nothing on `auto`).

**Flags:** ~~new PostHog flag `schedule-fidelity`~~ **VOIDED by I127 (2026-08-13)**: no production users on platform — Wave 1 ships unconditional, 100% GA, no flag gate, legacy branches deleted rather than parked. Loading fallbacks (bare 'Active' while schedule null) still stand. Wave 2/3 flags presumptively dropped on the same reasoning; confirm at wave start.

**Rollout:** G2 migration → `supabase db push` (Strata) → `./infra/deploy-portal.sh designer` (**never** raw `opennextjs-cloudflare build` — the `@patina/utils` stale-dist incident is precisely this wave's shape: we are editing `packages/utils`) → enable `schedule-fidelity` for design authority → walk one legacy-dates project and one anchored project, screenshot both, confirm the legacy one says Band.

**Wave 1 size:** resolver/lib **M** · header **S** · section-derivation **S** · stage line **M** · desk **M** · gates **S**.

---

## WAVE 2 — Event wiring (R109 / R110)

Only after Wave 1 is live and the four mouths agree. Nothing here changes what a surface *says*; it changes what writes an anchor.

### 2.1 · The mechanism (R100: "all writes travel the existing ripple→commit→revision path")

**Trigger is the wrong instrument. Argument, four ways:**
1. **R110 is unimplementable via trigger.** A ceremony must state its schedule impact *before* confirmation. A trigger fires *after* the row is written — it can only ever be a fait accompli. R110's whole point is gating the ceremony class against quiet widening; a trigger is the quiet widening.
2. **Actor is lost.** `cut_schedule_revision` (`00326:90`) resolves the actor server-side and that is called forgery-proof. A trigger on `purchase_orders.sent_at` fires under the **`service_role`** of the `po-send` edge function — the revision would be authored by nobody.
3. **R109's three classes collapse.** A trigger can only *write*. It has no vocabulary for "propose a ripple the designer commits in one act" (operational fact) or "raise an R4 conflict" (contradiction). The trichotomy is the ruling.
4. **I56's posture.** "Assisted, confirmed, never silent." A trigger is the definition of silent.

**Chosen mechanism: factor, don't extend.** `commit_schedule_edit` (head `00326:681`) is `SECURITY INVOKER` and guards `is_studio_comember(designer_id)` — the *designer*. But a signature ceremony is executed by the **client**, who will never satisfy that guard. Extending the RPC's signature would either break the guard or bolt a bypass onto a public entry point.

Instead, follow the repo's own established shape — the `_execute_furnishings_authorization_authorized` / `execute_furnishings_authorization` / `..._with_trusted_ip` / `..._on_paper` family (`00412:2019,2209,2229`; `00425:559,811`):
- **New internal:** `public._commit_schedule_edit_authorized(p_project_id uuid, p_edits jsonb, p_reason text, p_actor uuid, p_disclosed_impact jsonb)` — `SECURITY DEFINER`, `SET search_path TO 'public'`, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`, `GRANT TO service_role` only. Body = `00326:681`'s body verbatim minus the ownership guard, plus the `cut_schedule_revision` call with `p_actor` passed through. **The caller has already authorized.**
- `commit_schedule_edit` is re-cut as the thin public wrapper: guard → `_commit_schedule_edit_authorized(..., auth.uid(), NULL)`. Its external contract is byte-identical, so `schedule-ripple-context.tsx` and every Slice-04 test keep working untouched.
- Each ceremony's existing `_*_authorized` inner function calls `_commit_schedule_edit_authorized` **inside its own transaction**, after its own authorization, passing the impact JSON it disclosed. One revision per ceremony, actor = the ceremony's actor, atomic with the ceremony.

**`supabase/migrations/00475_schedule_ceremony_anchors.sql`** (provisional). Banner lineage for every redefined body — grep-`|sort|tail -1` each one at authoring time, do not trust this list:
- `commit_schedule_edit`: `00325 → 00326 → 00475`
- `_execute_furnishings_authorization_authorized`: `00412 → 00414 → 00422 → 00475` (**four prior bodies — the highest revert risk in this plan**)
- `_execute_trade_scope_authorized`, `_accept_trade_scope_authorized`, `engage_trade_scope`: `00423 → 00475`
- `_sign_design_services_agreement_authorized` / `countersign_design_services_agreement`: `00412 → 00414 → 00475`
- `activate_proposal_as_project`: head is **`00435_ffe_ga_rpc_boundaries.sql`**, not 00324/00326 (grounding §1's lineage is stale — corrected there). Signature-cuts-v1 is already correct; don't re-cut it. What Wave 2 adds: the design-services *executed* rail (`commercial_state` ratchet, 00412–00414) is a separate rail from `proposals.status='accepted'` and is not wired to `cut_schedule_revision` at all — wire it to write the engagement-start anchor + cut a revision.

**Anchor mapping (R109 class per event):**
| Event | Class | Write |
|---|---|---|
| Design-services agreement executed | ceremony | anchor on the first main-lane phase (engagement start) |
| Furnishings authorization executed (incl. `_on_paper`) | ceremony | anchor on the procurement thread phase (`lane='thread'`) for that wave |
| Trade scope `engage_trade_scope` | ceremony | anchor: trade thread start |
| Trade scope `_accept_trade_scope_authorized` | ceremony | milestone: thread completion (`kind='event'`) |
| Install window confirmed | ceremony | Wave 3 |
| `po-send` → `purchase_orders.sent_at` (`supabase/functions/po-send/index.ts:573-577`) | **operational fact** | prepare ripple only |
| `delivered_date` | **operational fact** | prepare ripple only |
| Contradicts a committed anchor | **contradiction** | R4 conflict, never a slide |
| Trade RFQ (00424) | signal | nothing |

### 2.2 · R110 — impact disclosed at consent

Each ceremony UI computes impact **client-side, pre-confirmation**, using the same pure resolver: run `resolveSchedule` over the current chain with the prospective anchor applied, diff against current — exactly what `RippleProvider` (`schedule-ripple-context.tsx:166 diff`) already computes. Reuse `RippleDiff` and its one-honest-sentence renderer; render it into the ceremony's **IMPACT** block via `GateImpact` (`components/document/approvals/gate-anatomy.tsx:156` — `GATE_PARTS` already includes `"impact"`; the R2 anatomy is built, do not invent a second grammar).

**Downgrade-to-proposal failure mode.** If impact cannot be computed — chain unresolved, `chain_cycle`, phases still loading, or `source:'unresolved'` for the target phase — the ceremony **still runs**, but passes `p_disclosed_impact = NULL`, and `_commit_schedule_edit_authorized` **refuses to write the anchor** and instead records a pending proposal for the designer to commit. Enforce this server-side, not just in UI: a `NULL` disclosed-impact on a ceremony-class call is a hard branch, so a UI bug cannot become a quiet hardening. Storage for the pending proposal: a `schedule_revisions` row is the wrong shape (committed history). Simplest honest option that adds no schema — the ceremony's existing audit/evidence JSON carries a `proposed_anchor` blob, and a desk need line surfaces "An executed authorization proposes an install anchor — review." **Open engineering question to settle at Wave 2 design time, flagged.**

### 2.3 · Operational proposals + contradictions

- `po-send` (`index.ts:573-577`) — at first-send `sent_at` stamp, additionally record a prepared ripple. The edge function runs under `service_role`, so it *may* call `_commit_schedule_edit_authorized` — but **must not**, per R109 (a fact proposes, it does not write). It writes only the proposal record. Deno test: `deno test --allow-all --config supabase/functions/deno.json supabase/functions/po-send/index.test.ts` (suite exists).
- Contradiction class → **R4 discipline, one fact, exactly three renderings**: terracotta stamp on the spine row · one guide sentence · desk re-sort. **Never** a badge, banner, count, push, modal, or auto-action. Routes through the existing `schedule_conflict` need kind (`desk-schedule-conflict.test.ts` pins its ranking) — extend, don't add a fourth rendering.
- **Actor-neutral copy (§7 guard, №7/№8 open).** Every string this wave adds must avoid commercial-actor language. Follow the I125 sweep's register: anchors are named by the *act*, not the party. Add these strings to the string-absence contract test from 1.4.

### Wave 2 gates / flags / risks
Gates: Wave 1's command set, plus `pnpm supabase:reset` + `scripts/run-supabase-sql-test.sh supabase/tests/procurement/state_chain_test.sql` and each RLS suite through the same runner; `pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts`; a direct RPC probe of each re-cut ceremony (call it, then `SELECT` the resulting `project_phases.anchor_date` **and** the `schedule_revisions` row — the migrations ledger proves nothing).
Flag: `schedule-hardening`, separate from `schedule-fidelity`, fail-closed. Server side has no flag — the flag gates whether ceremony UIs render the IMPACT block and pass a disclosed impact; with the flag off, ceremonies pass `NULL` and therefore never harden. Clean, testable off-state with no SQL branch.
Size: mechanism/migration **L** · ceremony wiring **L** · R110 impact UI **M** · operational proposals **M** · copy sweep **S**.

---

## WAVE 3 — `install_windows` (R112)

The package's only schema request. "The date itself remains `anchor_date`; only the evidence of commitment is new."

**`supabase/migrations/00476_install_windows.sql`** (provisional; re-check `ls supabase/migrations/*.sql | sort | tail` at authoring).

```
public.install_windows
  id uuid PK default gen_random_uuid()
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  phase_id uuid REFERENCES project_phases(id) ON DELETE SET NULL   -- the phase the anchor lands on
  starts_on date NOT NULL
  ends_on   date NOT NULL CHECK (ends_on >= starts_on)
  state text NOT NULL CHECK (state IN ('held','confirmed','released'))
  held_until timestamptz
  held_by uuid REFERENCES profiles(id)
  confirmed_at timestamptz, confirmed_by uuid
  released_at  timestamptz, released_by uuid
  disclosed_impact jsonb                                            -- R110 evidence
  created_at timestamptz NOT NULL DEFAULT now()
```
Partial unique index: one non-released window per project. RLS **enabled in the same file**, policies mirroring `project_phases` (`00316:158`): studio read/write via `is_studio_comember(p.designer_id)`; client `SELECT` only — and **only** when `state='confirmed'` (R101; O10 open). A held-but-unconfirmed window is studio-only.

RPCs, all `SECURITY DEFINER`, `SET search_path TO 'public'`, `REVOKE EXECUTE FROM PUBLIC, anon`, `GRANT TO authenticated`:
- `hold_install_window(p_project_id, p_starts_on, p_ends_on)` → uuid. Comember guard. Writes **no anchor** — a hold is not a commitment.
- `confirm_install_window(p_window_id, p_disclosed_impact jsonb)` → uuid. Guard, then `_commit_schedule_edit_authorized(project, [{kind:'phase-anchor', phase_id, anchor_date: starts_on}], reason, auth.uid(), p_disclosed_impact)`. **`p_disclosed_impact IS NULL` ⇒ hold confirms but no anchor is written** (R110 downgrade), same branch as Wave 2.
- `release_install_window(p_window_id, p_reason text)`. Releasing does **not** silently unpin the anchor — it cuts a revision recording the release and leaves the anchor, or unpins with a disclosed impact. **The ruling does not say which — flagged for ruling.**

UI: new `apps/designer-portal/src/components/document/schedule/install-window-ceremony.tsx`, built from `approvals/gate-anatomy.tsx`'s six parts (`GateCeremony`/`GatePartBlock`/`GateImpact`/`GateQuestion`) — reuse, per R2. Mounted from `schedule-spine.tsx` on the installation phase row and from the Install section in `page.tsx` (`row.active_section === 'install'`). Copy stays **actor-neutral** pending №7 ("the window is held" / "the window is confirmed", never a counterparty name).

Data layer: `packages/supabase/src/hooks/use-install-window.ts` (query + three mutations, invalidating `['schedule-milestones', projectId]` and the `useProjectPhases` key so the Spine re-resolves); types via `pnpm db:generate`.

Audit/revision integration: confirmation cuts a revision through the shared internal (no separate ledger). `disclosed_impact` on the row is the R110 evidence trail; `schedule_revisions` is the date memory. Two records, two jobs, no duplication.

Tests: new `supabase/tests/schedule/install_window_test.sql` (plain `psql`, `ON_ERROR_STOP=1`, following `supabase/tests/procurement/state_chain_test.sql`'s shape) — hold→confirm writes exactly one anchor + one revision; confirm with `NULL` impact writes zero anchors; a comember can hold; a client cannot see a `held` row; the partial unique index rejects a second live window. Plus `apps/designer-portal/src/components/document/schedule/__tests__/install-window-ceremony.test.tsx`.

Flag: `install-window`, fail-closed. Rollout: `supabase db push` → `deploy-portal.sh designer` → probe the RPC and `SELECT` the row before claiming anything works.
Size: migration+RLS+RPCs **M** · hooks/types **S** · ceremony UI **M** · tests **M**.

---

## Risk register

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| R1 | **Resolver perf on desk-wide derivation** | `resolveSchedule` is O(phases) with a cycle-detection pass, run once **per project** across every desk folder; the real cost is the two new `.in()` queries widening an already-8-way `Promise.all` in `use-desk-engagements.ts`. | Select only chain columns, not `*`. Memoize `buildDeskSchedule` on the row arrays. Measure before/after with existing desk telemetry; if it regresses, derive motion only for folders that actually render. |
| R2 | **R101 client-surface leakage** | Wave 1 edits `section-derivation.ts` and `vitalsFor`, both with client-portal cousins; Wave 3 adds a client-readable table. O8/O10 are open. | `install_windows` client SELECT restricted to `state='confirmed'`. Wave 1 touches designer-portal only — grep that no client-portal component imports `schedule-fidelity`; add the check to the string-absence contract test. |
| R3 | **Comember RLS** | `_commit_schedule_edit_authorized` is `SECURITY DEFINER` with the ownership guard removed — the safety property moves into "every caller authorizes first." One careless future caller = cross-studio anchor write. | `REVOKE FROM PUBLIC, anon, authenticated`; `GRANT TO service_role` only. `_authorized` suffix per repo contract. Assert the ACL in the SQL test, not just in review. |
| R4 | **Stale-body revert on the ceremony monoliths** | `_execute_furnishings_authorization_authorized` has four prior bodies across 00412/00414/00422 — the exact class that caused 00199 to revert 00185. | Every redefinition sourced from grep-`|sort|tail -1`, body verbatim, delta grafted, lineage in banner. Confirm no later file redefines it before merge. |
| R5 | **G1 goes the "narrow the flag" way** | Designers who composed chains for four weeks lose the Spine; chain data intact but invisible — reads as data loss. | Quantify the affected population in G1 step 1 *before* the ruling; if non-trivial, that fact should change the ruling. |
| R6 | **Two parallel date paths persist** | I56 forbids backfill; legacy stored dates stay authoritative for non-chain projects forever. | The Week-N gate makes honesty structural: `positionText` cannot emit a week without a `governingAnchorId`. Pin with the headline test. |
| R7 | **Migration number collisions at merge** | 00474–00476 provisional; other workstreams active. | Re-check `sort \| tail` at authoring and at integration; renumber the undeployed side (filename + internal banner). |
| R8 | **No CI** | Nothing runs tests on push/PR. | Local gates are the only gates. Report exact commands and verbatim output per wave; "not verified" is an acceptable line item, a guess is not. |

---

## Under-determined as written — needs blessing/ruling before the affected wave

1. **R111 selection rules** (Wave 1): the resolver has no selection function; §1.1's tie-breaking rules (today-in-window, main-before-thread, fallbacks) are proposed, not ratified.
2. **Resolver output extension** (Wave 1): `governingAnchorId` + `origin` on `ResolvedPhase` — additive, derivation-only, but edits the file R100 declares sacred. The single most consequential call in the plan.
3. **R110 proposal storage** (Wave 2): no proposal object exists; proposed = ceremony's evidence JSON carries `proposed_anchor`, surfaced via a desk need line. Alternative stretches R112's schema budget.
4. **R112 release semantics** (Wave 3): does releasing a confirmed window unpin the anchor, and must the unpinning disclose impact? R100's "anchors refuse silent movement" argues yes-with-disclosure; the ruling is silent.
5. **Record corrections owed**: grounding §1's stale `activate_proposal_as_project` lineage (head `00435`) — corrected in grounding addendum; DECISIONS I59's stale claim on `proposal_schedule_milestones` (closed by `00401:837-884`) — correction entry owed.

**Verification status of this plan:** code-read only at `47b473fd`. No commands were run; the G1 (PostHog flag 764880 evaluation history) and G2 (Strata `pg_proc`/`pg_policies`) probes are prerequisites and have not been performed.
