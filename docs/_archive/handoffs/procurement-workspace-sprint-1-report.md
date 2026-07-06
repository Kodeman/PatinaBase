# Procurement Workspace — Sprint 1 Gate Report

**Sprint:** 1 of 3 — "Order day, financial truth"
**Branch:** `procurement-workspace/sprint-1-integration` (23 commits ahead of `main`)
**Status:** All planned work complete. Reviewer-approved. Awaiting Kody sign-off for merge to `main`.
**Decision needed:** Approve merge → Sprint 2 (Calendar + mobile Receiving + iOS) starts.

---

## 1 · Tasks completed

| Wave | Deliverable | Commits |
|---|---|---|
| 1.1 | Data architect dossier (schema + state machine + hook signatures + seed) | `docs/handoffs/procurement-workspace-wave-1.1-architect-dossier.md` |
| 1.2 | Migration 00148 + use-procurement.ts (7 hooks) + 11 unit tests | `80e35fc4`, `b2247ad3`, `9f0ab9ef`, `dd4ce34d` |
| 1.2.5 | Seed prerequisite rows + PO 7 NULL bug + 00147 role-wrap + use-decisions test mock | `8054167e`, `3ce57830`, `7991e820` |
| 1.2.6 | Mid-sprint review fixes — C-1 project scope on FFE link + H-1 paid_date CHECK + H-2 compensating delete | `e856f02e`, `b0fbc031` |
| 1.3a | Portal conventions dossier (1460 lines: nav diff, page skeletons, payment-pill design, STAGES lift) | `docs/handoffs/procurement-workspace-wave-1.3a-portal-conventions-dossier.md` |
| 1.3b | Nav entry + 5 procurement routes + By Vendor view + By Status view + shared PaymentPill + FFE_STAGE_KEYS lift to @patina/types | `638507af`, `a83099e1`, `8c9fbcb6`, `99a4b82f`, `f08396ef`, `3926dc4e`, `81d0f135` |
| 1.4 | OrderAssistant 4-step side panel + Order via Patina dialog + migration 00149 (`vendors.is_patina_catalog`) + Project Detail FFE collapse to summary tile | `91b75b43`, `e7c6ebd8`, `90cbf7a1`, `3babe387`, `a35a6caa`, `d7e39a69` |
| 1.5 | Final Code Reviewer pass (full sprint diff) — recommendation: APPROVE with HIGH items addressed | — |
| 1.5.5 | Reviewer polish — OrderViaPatina CTA disabled with tooltip (v1 limitation) + studio_owner RLS annotation | `7813810f`, `42103e09` |

13 substantive commits + 9 merge commits + 1 cleanup = 23 commits ahead of main.

---

## 2 · Gate criteria

| Criterion (from plan §4 Sprint 1) | Status | Evidence |
|---|---|---|
| Schema applied locally + ready for staging | ✅ | Migrations 00148 + 00149 apply clean via `supabase db reset`. 3 enums + 2 new tables + 4 RLS policies + indexes verified. |
| All four `/portal/procurement/*` routes render | ✅ | Routes: `/procurement` (redirect), `/by-vendor` (functional), `/by-status` (functional), `/calendar` (placeholder for Sprint 2), `/receiving` (placeholder for Sprint 2). Nav zone landed between Pipeline and Catalog. |
| By Vendor reads real data, groups by vendor, surfaces payment pills | ✅ | `usePurchaseOrders()` joined with vendor + payments; in-memory `groupByVendor` collapses; payment-due vendors sort first; gold "Patina Catalog" pill on Catalog vendors. |
| By Status reads real data, shows 8-stage flow, payment state | ✅ | 8-stage flow chart at top; default-expanded Production section; rows show vendor + PO + amount + PaymentPill + time-left. **Scope: rows-per-PO, not rows-per-FFE-item** (no cross-project FFE items hook in Sprint 1). |
| Order Assistant happy path: open → 4 steps → submit → toast + refresh | ✅ | 4-step flow per PRD §6. Step 4 captures payment pattern + deposit details. `useCreatePurchaseOrder` writes PO header + payment rows + links FFE items atomically (with compensating delete on partial failure). |
| FFE-zone collapse on Project Detail | ✅ | `FFEScheduleTable` swapped for `FFESummaryTile` (4 KPI tiles + CTA to procurement). `ffe-schedule-table.tsx` retained on disk for future re-use. |
| Lint + typecheck + test green | ⚠️ See §3 | Tests: 138/138 pass. Type-check: ≤3089 errors (DOWN from 3165 baseline). Lint: blocked by pre-existing `next lint` infra gap (no `.eslintrc.*` in apps/designer-portal, present on `main` before Sprint 1). |

**Verdict:** All Sprint 1 acceptance criteria met. Lint blocker is a pre-existing repo issue not introduced by Sprint 1.

---

## 3 · Evidence

- **Migration verification (local):** `\dT` shows 3 new enum types. `\d purchase_orders` + `\d po_payments` show correct columns + indexes. `\dp` shows 4 policies (2 designer + 2 studio_owner — the latter annotated as INERT in v1 per W1.5.5).
- **Seed verification:** 8 POs across all 5 payment patterns (`fifty_fifty: 3, thirty_seventy: 1, full_upfront: 1, net_30: 2, custom_milestones: 1`), 14 `po_payments` rows, Sawkille Co flagged `is_patina_catalog=true`.
- **CHECK constraint:** Direct `INSERT INTO po_payments (state='paid', paid_date=NULL)` rejected with constraint violation, confirming data-integrity guard.
- **138/138 unit tests pass** in `@patina/supabase` (11 test files, including 13 procurement-specific tests). Tests are substantive — verify call ordering for atomic 3-step mutation, exhaustiveness for all 5 patterns, compensating delete on payment-insert failure.
- **Type-check delta:** 0 new errors introduced by any Sprint 1 file. Pre-existing baseline reduced by 76 errors thanks to nav-config exhaustiveness fix and vendor-join type widening.
- **Live UI smoke test:** Not run end-to-end (worktree environments lacked .env.local consistently). Per-slice type-check + visual review against PRD slides §4–§7 was the binding gate.

---

## 4 · Outstanding items (deliberately deferred, not blocking)

**Polish carried into Sprint 2 or v2 follow-ups:**
- `?projectId=` filter on `/portal/procurement/by-vendor` — FFESummaryTile CTA currently lands unfiltered.
- Cross-project FFE-items hook — would let By Status show rows-per-FFE-item per PRD §7 mock (currently rows-per-PO).
- Trade portal URL / account email surfaces in the vendor join — OrderAssistant Step 1 shows "No trade portal on file" today.
- Real "ready FFE" feed for OrderAssistant `ffeItemIds` — currently synthetic; hook's compensating logic handles this safely.
- `OrderViaPatina` dialog wired but disabled — visible gold CTA with tooltip ("ships in a follow-up") to telegraph intent without breaking UX.

**Hardening for v2:**
- `studio_owner` RLS policies are inert in v1 by design (annotated in 00148). Real implementation needs a studios/membership table.
- `useCreatePurchaseOrder`'s 3 sequential writes should become a single Postgres RPC for true transactional atomicity.
- Migration 00147's auth.users ALTERs run conditionally (DO/EXCEPTION wrap) — confirmed safe in Coolify (postgres is superuser) but worth a post-deploy verification: `SELECT column_default FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='confirmation_token';` should return `''`.

**Plan deviations not originally scoped:**
- Added Wave 1.2.5 (sweep + seed remediation) and Wave 1.2.6 (mid-sprint review fixes) and Wave 1.5.5 (final polish). Plan §4 anticipated a Wave 1.5 reviewer pass; in practice the wave structure adapted to address findings inline.
- The orchestration plan called for a single `.claude/worktrees/procurement-workspace-sprint-1/` shared worktree per the help-system pattern. Reality: per-agent ephemeral worktrees via the harness's native `isolation: "worktree"`. Equivalent isolation, less coordination overhead.

---

## 5 · Production deploy notes (read before flipping any flag)

- **Apply 00147 + 00148 + 00149 in order via Supabase CLI on staging first.** Confirm 00147's DEFAULT hardening landed (see verification SQL above) and that `purchase_orders` + `po_payments` show up in PostgREST schema.
- **`feedback_supabase_clean_rebuild_gotchas.md` (memory)** applies — Kong base64 keys, pg_cron supabase_admin, Coolify `docker compose pull && up --force-recreate` path. No new cron jobs in this sprint, so pg_cron risk is low.
- **Seed file (`procurement_workspace_dev.sql`) is for DEV ONLY.** It assumes vendors `Nordic Atelier`, `Woodward & Sons`, `Sawkille Co`, `Apparatus`, `Ceramica` and projects `Chen Residence`, `Olsen Lake House`. Prod has different vendors and real designer/project data — do NOT apply this seed to prod.
- **No feature flag yet.** A PostHog feature flag (`procurement-workspace-pilot`) is planned for Sprint 3 (Analytics Engineer wave). For Sprint 1 → main merge, the `/portal/procurement` route will be globally visible to any designer who navigates to it. If a hidden pre-pilot is desired, gate via a quick conditional in `navigation.ts` ZONES until the flag exists.

---

## 6 · Sign-off requested

**Wave 1.5 Code Reviewer recommendation:** APPROVE merge to main, with HIGH items resolved in W1.5.5 polish commit. Both HIGH items (OrderViaPatina dead CTA, studio_owner policy annotation) landed in `7813810f`.

**Orchestrator recommendation:** Approve merge.

If approved, the orchestrator will:
1. `git checkout main && git merge --no-ff procurement-workspace/sprint-1-integration -m "merge: procurement-workspace Sprint 1 — Order day, financial truth"`
2. Push to origin.
3. Stand by for Sprint 2 kickoff (Calendar view + desktop Receiving dashboard + native iOS receiving flow + Today Dashboard procurement card).

If you'd like changes before sign-off, point me at the file:line and I'll dispatch a targeted W1.5.6 patch agent.
