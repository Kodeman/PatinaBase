# Drop 1 — the Order Workbench (S2)

**Back of House · screenshot drop for design authority · 2026-07-17**

**R3 (C1 fix) applied 2026-07-17 — these four PNGs are RE-CAPTURED against the
fix, not the original S2 build.** Kody's Drop 1 review produced four rulings
(R3.2 seed re-price, R3.4 order-lifecycle stage dots, R3.5 surname side-marks,
R3.6 breadcrumb fix) — all four shipped on `boh/c1-fixes`; see the KNOWN
DEVIATIONS section below for which items this addressed and closed.

The first thing the design authority sees: S1's Fulfillment Queue (current
state) plus the S2 Order Workbench on the seeded 5-vendor order — proposed
split, the unmapped-blocking state, and the post-confirm result.

- **Commit:** `f5efdfd1` — the code the ORIGINAL S2 pixels were rendered from
  (branch `boh/s2-workbench`, off `origin/boh/integration`). The four PNGs in
  this drop are now re-captured from `boh/c1-fixes` (R3 applied) — filenames
  unchanged so the drop reflects the addressed feedback in place.
- **Viewport:** 1440×900, full-page PNGs.
- **Feel authority:** `docs/prds/back-of-house-presentation.html` §07 (Order
  Workbench). Spec §5.2 (normative). Intent ported, never markup.
- **Ignore the two corner glyphs** (a small "N" bottom-left, a colored disc
  bottom-right) — local dev-mode overlays (Next.js dev indicator / dev widget),
  not part of the Workbench UI; they do not ship.

## Seed-state recipe (how to reproduce these exact pixels)

```bash
# local stack only — verify DB URL = 127.0.0.1:54322, never Strata
cd supabase && supabase db reset                         # migrations 00001→00354 + reference seeds
supabase functions serve fulfillment-intake \
  --env-file functions/_tests/test.env --no-verify-jwt   # terminal 2
cd .. && SUPABASE_SERVICE_ROLE_KEY=<local> pnpm seed:fulfillment   # 5 orders through the intake fn
psql "$LOCAL_DB" -f scripts/seed-fulfillment-fixtures.sql          # +3 band fixtures → 8 orders
# admin-portal/.env.local → NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 + NEXT_PUBLIC_ENABLE_FULFILLMENT=true
pnpm --filter @patina/admin-portal dev                   # :3001
```

The signature order is **order_no 1, "Priya Anand"** (`pi_boh_seed_1`) — 5 lines
across 5 vendors (Room & Board · Mitchell Gold + Bob Williams · Lee Industries ·
Holly Hunt · Blu Dot). The unmapped-blocking shot is **order_no 3, "Odalys
Ferreira"** (`pi_boh_seed_3`) — one mapped line + one deliberately-unmapped line.
`04` is order 1 after clicking **Confirm split**.

## Page inventory

| File | Screen | State |
|---|---|---|
| `01-queue-three-bands.png` | S1 Fulfillment Queue | 8 seeded orders across Needs Action Now / Watching / Quiet |
| `02-workbench-proposed-split.png` | S2 Order Workbench | order 1, pre-confirm — 5 proposed PO cards, ① thread on both sides, money strip |
| `03-workbench-unmapped-blocking.png` | S2 Order Workbench | order 3 — Unmapped chip + group, Confirm disabled with reason |
| `04-workbench-post-confirm.png` | S2 Order Workbench | order 1, post-confirm — 5 real PO drafts A–E, lines in `split` |

## Known deviations (for the C1 look)

**Closed by the R3 C1 fix (2026-07-17, `boh/c1-fixes`):**

- ~~Stage dots absent pre-split.~~ **R3.4.** The Queue's per-PO stage dots
  (which had nothing to dot before an order split, and varied 1–6 with vendor
  count) are replaced by the order's SIX fixed lifecycle dots (split ·
  transmitted · acknowledged · in_production · shipped · delivered) —
  present, all-empty, on EVERY row from intake, filling as the derived
  min-stage advances. Visible in shot 01 (every row now shows 6 dots).
- ~~The seeded 5-vendor order renders terracotta at the default floor.~~
  **R3.2.** The uniform-80%-trade seed (every product at exactly a 20%
  spread) tripped the terracotta warning on EVERY order, not just a
  deliberate demo. Re-priced to varied ~25–45% spreads; order 1 (the
  signature order, shots 02/04) and order 2 now read healthy (~35% and ~31%
  blended margin respectively). Order 5 (single-line, qty 2) is now the
  deliberately-thin ~18% demo instead — see the C1 fix report's per-order
  spread table for all 8 seeded orders.

**Still open:**

1. **Needs Action Now reads crowded.** Every unconfirmed order lands there
   regardless of breach (I3's band model), so the top band carries most rows.

New in **S2** (money model + drag — all flagged for the C1 ruling):

2. **Projected commission is realized margin, not a rate.** `projectedCommission
   = (product subtotal + freight) − vendor cost − freight est` — Patina's actual
   retail−trade spread, matching the presentation §07 arithmetic. The config's
   per-vendor **commission_rate_default (16%)** is a *settlement* input (S6) and a
   vendor fallback; it is threaded through the DTO but is **not** the Workbench
   projection basis. Pledge accrual = 25% of this commission (spec §8 T3).
3. **Freight est = freight charged (v1 proxy).** No independent freight estimate
   exists until the Shipment Board (S5), so freight revenue and freight expense
   net to zero and freight does not yet move the margin.
4. **Unmapped lines read optimistically.** An unmapped line contributes 0 to
   vendor cost until priced, so margin reads high until assignment, then drops —
   intentional ("mis-mapped cost caught before the PO goes out", spec §5.2).
5. **Pre-confirm drag reassigns a vendor (assign RPC), not move_line.** Before
   confirm no `fulfillment_vendor_po_lines` rows exist for `fulfillment_move_line`
   to repoint, so a pre-confirm drop between proposed groups persists via
   `fulfillment_assign_line_vendor` (reassign the line's vendor); `move_line`
   drives the *post-confirm* reshuffle (shot 04's cards are draggable). Composed
   from the existing RPCs — **no 00353 amendment was needed**; the detail DTO is
   composed in the route from base tables.

**Also addressed by R3 but not itself a KNOWN DEVIATION entry:** R3.5
(surname-only side-marks — `ANAND-1` / `FERREIRA-3`, visible in every shot)
and R3.6 (breadcrumb: deduped the doubled FULFILLMENT segment and replaced
the raw order UUID with `Order #{n} · {client name}`, visible in shots 02–04).
