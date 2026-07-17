# Drop 1 — the Order Workbench (S2)

**Back of House · screenshot drop for design authority · 2026-07-17**

The first thing the design authority sees: S1's Fulfillment Queue (current
state) plus the S2 Order Workbench on the seeded 5-vendor order — proposed
split, the unmapped-blocking state, and the post-confirm result.

- **Commit:** `f5efdfd1` — the code these pixels were rendered from (branch
  `boh/s2-workbench`, off `origin/boh/integration`; the docs commit that carries
  this file is its child).
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

Carried from **BOH-DECISIONS I3** (S1's two C1-flagged items):

1. **Stage dots absent pre-split.** No PO rows exist before confirm, so there is
   nothing to dot — the Queue's per-PO stage dots only appear once an order is
   split. (Queue-screen note; the Workbench's proposed cards show a Draft chip,
   not dots.)
2. **Needs Action Now reads crowded.** Every unconfirmed order lands there
   regardless of breach (I3's band model), so the top band carries most rows.

New in **S2** (money model + drag — all flagged for the C1 ruling):

3. **Projected commission is realized margin, not a rate.** `projectedCommission
   = (product subtotal + freight) − vendor cost − freight est` — Patina's actual
   retail−trade spread, matching the presentation §07 arithmetic. The config's
   per-vendor **commission_rate_default (16%)** is a *settlement* input (S6) and a
   vendor fallback; it is threaded through the DTO but is **not** the Workbench
   projection basis. Pledge accrual = 25% of this commission (spec §8 T3).
4. **Freight est = freight charged (v1 proxy).** No independent freight estimate
   exists until the Shipment Board (S5), so freight revenue and freight expense
   net to zero and freight does not yet move the margin.
5. **The seeded 5-vendor order renders terracotta at the default floor.** Every
   seeded mapped product is priced at exactly 80% trade (a uniform 20% spread),
   giving order 1 a **~19.75% blended margin — below the 25% config floor**. So
   the signature order legitimately trips the terracotta warning (the money strip
   doing its job). The presentation's healthy numbers were illustrative. **C1
   decision owed:** revisit the seed trade spreads or the 25% floor default.
6. **Unmapped lines read optimistically.** An unmapped line contributes 0 to
   vendor cost until priced, so margin reads high until assignment, then drops —
   intentional ("mis-mapped cost caught before the PO goes out", spec §5.2).
7. **Pre-confirm drag reassigns a vendor (assign RPC), not move_line.** Before
   confirm no `fulfillment_vendor_po_lines` rows exist for `fulfillment_move_line`
   to repoint, so a pre-confirm drop between proposed groups persists via
   `fulfillment_assign_line_vendor` (reassign the line's vendor); `move_line`
   drives the *post-confirm* reshuffle (shot 04's cards are draggable). Composed
   from the existing RPCs — **no 00353 amendment was needed**; the detail DTO is
   composed in the route from base tables.
