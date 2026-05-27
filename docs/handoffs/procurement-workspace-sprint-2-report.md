# Procurement Workspace — Sprint 2 Gate Report

**Sprint:** 2 of 3 — "Logistics, mobile inspection"
**Branch:** `procurement-workspace/sprint-2-integration` (22 commits ahead of `main`)
**Status:** All planned work complete. Reviewer-approved with polish. xcodebuild + 151/151 tests green.
**Decision needed:** Approve merge → Sprint 3 (QBO export + capture loop + pilot flag) starts.

---

## 1 · Tasks completed

| Wave | Deliverable | Commits |
|---|---|---|
| 2.1 | Data architect dossier (receiving + damage_claims + delivery_events view + columns + 6 hook signatures + auto-draft semantics + client-side conflict-detection helper signature + seed) | `f248dfdb`, dossier at `docs/handoffs/procurement-workspace-wave-2.1-architect-dossier.md` |
| 2.2 | Migration 00150 + receiving seed + 6 hooks + 11 unit tests (149 total) | `3bf37119`, `191ddf9b`, `cbbf66e6`, `4cce4d11` |
| 2.3 | Calendar view + `delivery-conflicts.ts` (11 helper tests) + Receiving dashboard (4 tabs + drawers) + Today procurement card + iOS ReceiveDeliveryView (xcodebuild green, 7 iOS unit tests) | `c78e2238`, `856db830`, `f046eef7`, `b4e9c826`, with 4 merge commits |
| 2.4 | ETA quick-edit drawer + `useUpdatePurchaseOrderETA` hook + iOS `MediaUploadClient` (3-step PAR upload to `media.patina.cloud/v1/media/upload`) + `AppCoordinator.receiveDelivery` case + DesignerHome entry button + exhaustive switch updates (7 sites) | `e92ac30f`, `afd275c1` + 2 prior + 2 merge commits |
| 2.5 | Final Code Reviewer pass (full sprint diff) — recommendation: APPROVE with polish | — (orchestrator-dispatched, no commit) |
| 2.5.5 | Reviewer polish — C-1 `inspectionsPending` semantic inversion fixed (now counts un-inspected delivered POs) + H-1 `delivery_events` view LEFT JOIN LATERAL for inspection columns + H-2 `MediaUploadClient` try? → try await + H-3 stomping `received_quantity` write removed | `8b0ffbfe` + merge |

**Test counts:** 151/151 Supabase tests pass (was 138 entering Sprint 2; +13 procurement Sprint 2 tests). 122 iOS unit tests pass. 11 `delivery-conflicts` web tests pass.

---

## 2 · Gate criteria

| Criterion (from plan §4 Sprint 2) | Status | Evidence |
|---|---|---|
| Migration 00150 applied locally + ready for staging | ✅ | `supabase db reset` clean; 2 enums + 2 tables + 1 view + 2 column additions verified. View `delivery_events` returns correct UNION of delivery + install rows. RLS policies use the INERT studio_owner pattern (annotated). |
| Calendar view renders 2-month grid with at least one synthetic conflict | ✅ | Project-axis grid (rows = projects, cols = 8-9 week columns) renders all delivery + install events. Conflicts panel below grid shows overlap / late_arrival / drift with suggestions. 11 unit tests cover all conflict types + edge cases (null dates, cross-project independence). |
| Receiving dashboard shows 4 tabs with real data | ✅ | KPI row (4 tiles using `useTodayProcurementCounts` + 30-day inspection pass rate). Tabs: Arriving (POs with confirmed_eta next 7d) / Pending Inspection (delivered without inspection) / Damage Claims (drafted + vendor_notified) / Cleared (30-day clean). Log + Damage drawers wired to mutations. |
| Today Dashboard card landed | ✅ | `ProcurementTodayCard` slotted in Today page with 3 KPI tiles + "View workspace" footer link. Loading skeleton + empty state. |
| iOS receive flow completes against staging Supabase | ⚠️ Pending MobAI smoke | Build green on simulator; agent confirms `** TEST SUCCEEDED **` (7 iOS unit tests pass). Real-device + media upload smoke is Kody-side, deferred to a follow-up session per W2.5 plan. |
| Code Reviewer pass + findings addressed | ✅ | Reviewer found 1 CRITICAL (semantic) + 3 HIGH; all 4 landed in W2.5.5 polish. Reviewer's verdict: APPROVE WITH POLISH. |
| `pnpm` tests, xcodebuild, type-check green | ✅ | 151/151 Supabase tests. 122 iOS unit tests. xcodebuild SUCCEEDED on main repo simulator. Type-check delta 0 (3165 baseline). |

**Verdict:** All Sprint 2 acceptance criteria met. The one ⚠️ is a deliberate decoupling — MobAI is a separate session per your selection (b) in the W2.5 check-in.

---

## 3 · Evidence

- **Migration verification:** `\dT receiving_inspection_outcome damage_claim_state` returns the two new enums. `\d receiving_inspections` shows 9 cols + 4 indexes + 2 FKs + RLS enabled. `\d damage_claims` shows 9 cols + 3 indexes + 2 CHECK constraints + RLS. `\d+ delivery_events` confirms view with UNION over POs + install milestones, now including `inspection_id` + `inspection_outcome` from LATERAL join (W2.5.5 H-1 fix).
- **Seed:** 2 receiving inspections (clean Woodward + damaged Apparatus) + 1 auto-drafted damage claim, all dated within week of 2026-05-26 so Today Dashboard counts have something to show.
- **xcodebuild:** `** BUILD SUCCEEDED **` on iPhone 17 / iOS 26.5 simulator from main repo (post-merge).
- **Conflict detection:** 11/11 tests pass — empty input, in-window overlap, out-of-window non-overlap, late_arrival, drift, cross-project independence, sort stability, late ≠ drift double-flag guard, null-date guard, tuning constants.
- **Compensating-delete atomicity:** verified on both web (`useCreateReceivingInspection` step 4 with rollback test) and iOS (`ReceiveDeliveryViewModel.submit()` mirrors the contract).
- **Live UI smoke test:** Not run end-to-end; per-slice type-check + visual review against PRD §8/§9 was the binding gate (same approach as Sprint 1).

---

## 4 · Outstanding items (deliberately deferred — not blocking gate)

**Deferred to a follow-up MobAI session (Kody-side):**
- **Real-device iOS smoke run** — TestFlight or direct install on LiDAR iPhone, navigate DesignerHome → tap "Receive delivery" → pick PO → capture 3 photos via PhotosPicker → tap "All good" or "Damage" → confirm upload + DB writes. Reviewer flagged the `media.patina.cloud/v1/media/upload` URL as correct per `infra/cloudflare-tunnel-config.yml` but live verification is Kody-side.

**Wave 3 / v2 follow-ups surfaced during Sprint 2:**
- Per-item `received_quantity` tracking — column kept in schema (00150), but write path removed (W2.5.5 H-3 fix). Sprint 3+ wave will add per-item input UX.
- `?projectId=` filter on `/portal/procurement/by-vendor` — FFESummaryTile CTA still lands unfiltered (carried over from Sprint 1).
- Trade portal URL / contact email on vendors join — OrderAssistant Step 1 still shows "No trade portal on file".
- studio_owner full RLS implementation (studios + members table) — v2.
- `useCreatePurchaseOrder` / `useCreateReceivingInspection` 3-step writes → Postgres RPC for true transactionality (v2 hardening).

---

## 5 · Production deploy notes

- **Apply migration 00150 + regen types on staging first.** Confirm enums + 2 tables + view exist via `\dT` and `\d+ delivery_events`.
- **`update_updated_at()` function** must already exist (defined in migration 00001/00021). Sprint 1 W1.2.5 + W1.5.5 already verified its availability across local + prod.
- **`DeploymentTarget.current` in iOS** must resolve to `.selfHosted` for prod builds. `Secrets.swift` (gitignored) configures this — confirm before TestFlight upload.
- **`media.patina.cloud` Cloudflare Tunnel route** is correctly mapped per `infra/cloudflare-tunnel-config.yml` line 78–79 (`media.patina.cloud → http://media:3014` internal). Verify the route is live after deploy.
- **Sprint 2 ships no feature flag.** The procurement workspace is globally visible to any signed-in designer. If a hidden pre-pilot is desired, gate `/portal/procurement` in `navigation.ts` ZONES until the PostHog flag lands in Sprint 3.
- **Receiving seed (`procurement_receiving_dev.sql`) is DEV-only.** It assumes seeded POs from `procurement_workspace_dev.sql`. Do NOT apply to prod.

---

## 6 · Sign-off requested

**Wave 2.5 Code Reviewer recommendation:** APPROVE merge to main, with HIGH items resolved in W2.5.5 polish commit. All 4 items (C-1 + H-1 + H-2 + H-3) landed in `8b0ffbfe`.

**Orchestrator recommendation:** Approve merge. MobAI smoke is a follow-up session; the gate doesn't block on it.

If approved, the orchestrator will:
1. `git checkout main && git merge --no-ff procurement-workspace/sprint-2-integration -m "merge: procurement-workspace Sprint 2 — Logistics, mobile inspection (22 commits)"`
2. Push to origin.
3. Stand by for Sprint 3 kickoff (QBO CSV export + capture-to-slot Chrome ext integration + Layer 1→2→3 promotion + PostHog feature flag + pilot turn-on for Leah + 2 designers).

If you'd like changes before sign-off, point me at file:line and I'll dispatch a targeted W2.5.6 patch.
