# Patina Decision Framework — Parallel Delivery Plan

> Operating doc for closing the decision loop end-to-end with parallel agent teams.
> Companion to `patina-ios-parallel-delivery-plan.md` (same methodology). Source review:
> `docs/decisions/patina-decision-system-completion.html`. Authored 2026-06-01.

## Why

The decision system is mature on web but the loop is **not closed**. Five gap clusters:

| | Cluster | Gap |
|---|---|---|
| **A** | Modify | No `[id]/edit` route, no `useUpdateDecision`/`useDeleteDecision`. Drafts can't be revised+sent. |
| **B** | Notify | `decision_required`/`decision_overdue` defined but never fired; no realtime; reminders bypass the notification center. |
| **C** | Integrity | No status-transition guard, no history, `blocking_status` is decorative (doesn't block procurement). |
| **D** | Surfaces | iOS has an API client but no UI; extension can't create a decision; no `room_id`/`product_id` linkage. |
| **E** | Polish | `+ New Decision` misroutes; auth-expiry shows a raw error; help content unauthored. |

## Model

`Wave 0 (tooling)` → `Wave 1 Spine (serialized, owns trunk)` → `Wave 2 Territories (6 parallel, disjoint dirs)` → `Wave 3 Stabilize`.

- Each agent works in its **own git worktree**, passes `scripts/decision-gate.sh`, then **fast-merges to main within hours**. Main is the trunk.
- The two collision hotspots — the shared hook `packages/supabase/src/hooks/use-decisions.ts` and the **migration sequence** — plus the contended `decisions/[decisionId]/page.tsx`, are all landed in the **serialized Spine wave** and then **frozen**. Territories import, never modify.
- Disjoint-directory ownership. **If two territories need the same file, escalate to the conductor and re-partition — never hand-merge.**
- Tickets: `PT-D-<wave>-<n>`. Effort S (≤2d) / M (3–5d) / L (1–2w).

## Reserved migration block

Highest existing migration is `00170_project_documents_bucket.sql`. The Spine reserves:

| File | Concern |
|---|---|
| `00171_decision_status_guard_and_events.sql` | transition trigger + `decision_events` history |
| `00172_decision_room_product_linkage.sql` | `room_id` FK on `client_decisions`, `product_id` FK on `client_decision_options`, indexes |
| `00173_decision_notifications.sql` | `decision_required`/`overdue`/`resolved` RPCs + notify log + status-change trigger |
| `00174_decision_seed_linkage.sql` *(optional)* | backfill/seed room links for dev data |

Only the conductor assigns migration numbers.

---

## Wave 0 — Conductor & tooling  ·  1 agent  ·  ~0.5d

- [x] `scripts/decision-gate.sh` (this repo) — `unit | types | lint | e2e | build | ios | web | all`.
- [x] Reserve migration block 00171–00174 (above).
- [x] This operating doc + ticket breakdown.
- **B0 exit:** gate `web` green on a clean main; doc + tickets published.

## Wave 1 — The Spine  ·  1 serialized agent owns the trunk  ·  ~2d

Lands every shared/contended surface once; nothing else merges during this wave.
Files: `supabase/migrations/0017[1-4]_*.sql`, `packages/supabase/src/hooks/use-decisions.ts`, `…/hooks/index.ts`, `packages/shared/src/types/notifications.ts`, `packages/supabase/src/database.types.ts` (regen), `supabase/seed/decisions.sql`, `…/__tests__/use-decisions.test.ts`.

| Ticket | Effort | Work | Acceptance |
|---|---|---|---|
| **PT-D-1-1** | M | Status-transition trigger (`draft→pending→responded\|expired`, `responded→pending` reopen) + `decision_events` audit table (decision_id, old/new status, actor, reason, at). | `supabase db reset` clean; invalid transition rejected; every status change writes a `decision_events` row. |
| **PT-D-1-2** | S | `room_id` FK → `project_rooms` on `client_decisions`; `product_id` FK → `products` on `client_decision_options`; room-scoped index. | reset clean; FKs enforce; `pnpm db:generate` reflects columns. |
| **PT-D-1-3** | M | RPCs `notify_decision_required/overdue/resolved` + notify log + trigger on status change; add `decision_resolved` + preference entries to `notifications.ts`. | RPCs callable; status→pending emits required; →responded emits resolved; respects prefs. |
| **PT-D-1-4** | M | Hooks: `useUpdateDecision`, `useDeleteDecision`, `usePublishDraftDecision`, `useDecisionRealtime`; wire notify RPCs into `useCreateDecision`/`useSelectDecisionOption`/`useApplyDecisionOverride`; add transition validation to `useUpdateDecisionStatus`. Extend hook tests. | `pnpm --filter @patina/supabase test` green; new hooks exported from `index.ts`. |
| **PT-D-1-5** | S | `pnpm db:generate`; add room linkage to the 5 seeded decisions. | `types` gate green; seed reset clean. |

- **B1 exit:** spine merged to main; `decision-gate.sh web` green; **spine files frozen.**

## Wave 2 — Territories  ·  6 parallel agents  ·  disjoint dirs  ·  ~3–4d

Consume frozen Wave-1 hooks/types. Merge order at B2 by descending contention: **T1 → T3 → T2 → T6 → T4/T5**.

### T1 · Web Edit & Record
Owns `apps/designer-portal/src/app/(portal)/portal/decisions/**`, `components/portal/decision-*.tsx`, `decision-option-builder.tsx`, `components/portal/project-detail/decision-*.tsx`. **Exclusive owner of `decisions/[decisionId]/page.tsx`.**
- **PT-D-2-T1-1 (M):** new `[decisionId]/edit/page.tsx` reusing `DecisionOptionBuilder`; `useUpdateDecision`/`useDeleteDecision` wired; Edit/Delete on the detail page.
- **PT-D-2-T1-2 (S):** publish-draft CTA (`usePublishDraftDecision`); re-notify on material edit.
- **PT-D-2-T1-3 (S):** expired-recovery (reopen / extend deadline) from the UI.
- **PT-D-2-T1-4 (S):** fix `+ New Decision` → client/project picker → composer (not `/portal/clients`).
- **PT-D-2-T1-5 (S):** mount `useDecisionRealtime` on the detail page so client responses appear live.

### T2 · Notifications & Delivery
Owns `supabase/functions/decision-reminders/**`, `supabase/functions/expire-decisions/**`, `packages/notifications/**`, notification-center consumer.
- **PT-D-2-T2-1 (M):** route reminders through the notification center (in-app + email + preference checks) instead of direct Resend.
- **PT-D-2-T2-2 (S):** fire required-on-send / overdue / resolved via the Wave-1 RPCs; verify dedupe.

### T3 · Integrity Enforcement (procurement)
Owns the procurement / FF&E UI (`apps/designer-portal/src/app/(portal)/portal/procurement/**` + FF&E order components).
- **PT-D-2-T3-1 (M):** block ordering while a `blocks_procurement` decision is pending; disable the order control with an inline reason + link to the decision.
- **PT-D-2-T3-2 (S):** surface "N items blocked pending this decision" on the decision/project views.

### T4 · iOS Decision Surface
Owns `apps/mobile/Patina/**/Features/Decisions/**`, `Core/Network/DecisionsAPIClient.swift`.
- **PT-D-2-T4-1 (L):** SwiftUI list → detail → option-select → consent; write paths (`apply_decision`, mark-viewed).
- **PT-D-2-T4-2 (S):** push notification handling for required/overdue. Verify via `DesignerSmokeUITests` + MobAI.

### T5 · Extension Capture → Decision
Owns `apps/extension/src/**`.
- **PT-D-2-T5-1 (M):** "Send as decision option" on the capture form with project/room context; product linkage payload (`product_id`).

### T6 · Polish & Help
Owns `apps/designer-portal/src/lib/error-handler.ts`, Sanity help content (CMS, no code collision), `apps/client-portal/src/app/decisions/**` help layer.
- **PT-D-2-T6-1 (S):** auth-expiry handling — detect 401/expired session → redirect to sign-in; dashboard shows an honest error state, not `0 open / 100%`.
- **PT-D-2-T6-2 (S):** author the missing help-system content for `designer-portal/decisions/*` surfaces (tooltips + empty states).
- **PT-D-2-T6-3 (XS, micro-PR → T1):** detail-page field tooltips (delivered to T1, owner of that file).

- **B2 exit:** all territories merged; `decision-gate.sh` green per merge.

## Wave 3 — Stabilize & close the loop  ·  2 agents  ·  ~1–2d
- **PT-D-3-1 (M):** close-the-loop e2e — designer creates → edits → sends → notification fires → client reviews + e-signs → procurement unblocks → designer notified. Extend `apps/designer-portal/e2e/decisions/*.spec.ts` + a cross-portal scenario.
- **PT-D-3-2 (S):** device smoke — `DesignerSmokeUITests` decisions golden path + MobAI report.
- **PT-D-3-3 (S):** promote decision-dir lint/type to error; regression; final `pnpm build`; flip the deck's surface matrix to green.
- **B3 exit:** close-the-loop e2e + device smoke green on main.

---

## Contention rules (load-bearing)
1. **Spine frozen after B1:** `use-decisions.ts`, `database.types.ts`, `migrations/*`, `notifications.ts`. Need a new hook? → micro-PR to the conductor, not a territory edit.
2. **`decisions/[decisionId]/page.tsx` → T1 exclusive.** T2 realtime + T6 tooltips reach it via T1 micro-PRs.
3. **Disjoint-directory ownership.** Two territories on one file → escalate + re-partition; never hand-merge.
4. Migration numbers assigned only by the conductor.

## Gate (`scripts/decision-gate.sh`)
| Layer | Command |
|---|---|
| unit | `pnpm --filter @patina/supabase test` |
| types | `pnpm db:generate && pnpm type-check` |
| lint | `pnpm lint` (`LINT_DELTA=1` for changed-file delta) |
| e2e | `pnpm --filter @patina/designer-portal test:e2e decisions/` (needs local Supabase + `dev:designer`) |
| build | `pnpm build` |
| ios (T4) | `xcodebuild test -scheme Patina -only-testing:PatinaUITests/DesignerSmokeUITests` + MobAI |

Seed: 5 decisions on `designer@patina.dev` (`b0000000-…-0d2c0[1-5]`) via `pnpm supabase:reset`. Decisions are **pure Supabase** (no Prisma).

## Branch / commit conventions
- Branches off `main`: `decisions/spine`, `decisions/territory-t1` … `decisions/territory-t6`, `decisions/stabilize`.
- Worktree per agent; fast-merge to main after gate. Conventional commits per ticket; Co-Authored-By trailer; push at each barrier.

## Execution harness
Run the waves via the **Workflow tool**: Spine = serialized `agent()`; Wave 2 = `parallel()` of 6 `agent({isolation:'worktree'})`; Wave 3 = stabilize `agent()`. The conductor sequences merges and runs the gate at B0/B1/B2/B3.
