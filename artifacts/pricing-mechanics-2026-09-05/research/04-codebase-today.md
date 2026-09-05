# The codebase today — how a price is made, shown, frozen, and forgotten

*Research lane R4 · 2026-09-05 · every claim below was re-opened against this checkout.*

---

## 1. The two pricing rails

Patina carries two entirely separate money systems. They share a vocabulary and nothing else.

**Rail A is the studio's own markup** — the designer buys at trade, sells to their client at a marked-up price, and Patina is the ledger for that spread. It is three tables deep. It begins at `proposal_items` (`supabase/migrations/00014_portal_business_features.sql:237`), whose money columns state their own meaning: `unit_price INTEGER NOT NULL, -- cents (trade price)` (`00014:255`), `markup_percent DECIMAL(5,2) DEFAULT 0` (`00014:256`), `unit_sell_price INTEGER NOT NULL, -- cents (client price)` (`00014:257`), and `line_total` (`00014:258`), renamed `line_total_cents` by `supabase/migrations/00142_proposal_items_line_total_rename.sql:15`. On activation the line crosses into `project_ffe_items`, the same dual model under different names — `unit_price_cents` is the CLIENT price, `trade_price_cents` the vendor cost, per the column comments at `supabase/migrations/00185_ffe_dual_pricing.sql:51-60`. When the client is asked to authorize a purchase it is snapshotted a third time into `furnishing_authorization_items` (`supabase/migrations/00412_design_services_commercial_authority.sql:243`), which keeps `client_unit_price_cents` and `client_line_total_cents` NOT NULL (`00412:254-255`) beside a nullable `trade_unit_cost_cents` and `markup_percent` (`00412:256-257`). Three tables, one spread, carried at each hop.

**Rail B is Patina's own commission on fulfillment** — the platform's take when a piece is bought through Patina rather than by the studio's own purchase order. It lives in `direct_orders.commission_rate`, in `designer_earnings` (`00014:299` onward), and in the pure helpers of `packages/fulfillment/src/money.ts`, with its default rates configured in `fulfillment_config`. The Pledge — the share of Patina's own margin returned to the commons — rides this rail, and is legal-gated: it appears in `apps/designer-portal/src/lib/document/pledge.ts` and in internal ledger journals, never in client-facing copy.

**The two rails never touch, and this is structural rather than incidental.** No column on `proposal_items`, `project_ffe_items`, or `furnishing_authorization_items` references a commission rate, a platform fee, or a Pledge accrual; no function in `packages/fulfillment/src/money.ts` reads a proposal or an FF&E row. A studio marking a sofa up 30% earns zero Rail B revenue unless the piece is also fulfilled through Patina, and a Patina-fulfilled piece earns zero Rail A markup unless a designer placed it on a schedule. Rail B is out of scope below; everything after section 1 is Rail A.

---

## 2. Pre-sale: how a line gets its price

### The four add paths, and what each one puts in the trade column

A proposal line can be born four ways, and all four write a **retail** figure into `unit_price`, the column `00014:255` names as trade.

**Manual add** goes through the edit form in `apps/designer-portal/src/components/portal/scope-builder/ffe-schedule-builder.tsx`, whose only money field is labelled `Unit Price` (`ffe-schedule-builder.tsx:264`) and writes `unit_price: Math.round(parseFloat(priceDollars || '0') * 100)` (`ffe-schedule-builder.tsx:200`). No client-price field, no per-line markup field.

**Library pick** runs through `apps/designer-portal/src/components/portal/scope-builder/build-proposal-item-from-pick.ts:119`:

```ts
const unitPrice = selection?.retailPriceCents ?? pick.priceCents ?? 0;
```

`pick.priceCents` is documented at `apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx:80` as `// products.price_retail (already cents)` and is populated from `priceCents: p.price_retail ?? null` at `product-picker-modal.tsx:233`.

**Capture-consume** is the same defect expressed in SQL. `consume_capture`, latest body at `supabase/migrations/00142_proposal_items_line_total_rename.sql:61-63`, reads:

```sql
v_unit_price := COALESCE(v_product.price_retail, 0);
v_unit_sell  := v_unit_price;
v_line_total := v_unit_sell * v_qty;
```

and inserts `v_unit_price` into `unit_price` at `00142:89`. `products.price_trade` is never consulted.

**Send-to-schedule from a pin** builds its payload at `apps/designer-portal/src/lib/scope/board-schedule.ts:74` with `unitPrice: snap.priceCents ?? 0` — a retail snapshot again. The docblock above it at `board-schedule.ts:56-60` is candid about the consequence: "name/image/price ride to the SELL side (useAddProposalItem sets unit_sell_price = unitPrice)."

### The write path and the zero-margin default

Every add path funnels into `useAddProposalItem` in `packages/supabase/src/hooks/use-proposals.ts`, where the whole markup model collapses in one line at `packages/supabase/src/hooks/use-proposals.ts:773`:

```ts
const sellPrice = unitPrice;
```

The insert then writes `unit_price: unitPrice` and `unit_sell_price: sellPrice` (`packages/supabase/src/hooks/use-proposals.ts:794-795`) — the same number in both columns. Combined with `markup_percent DECIMAL(5,2) DEFAULT 0` (`00014:256`), **every line is born at exactly zero margin**, with a retail figure sitting in the trade column. Line total is `quantity * sellPrice` for fixed and TBD lines, or the budget midpoint for allowances (`packages/supabase/src/hooks/use-proposals.ts:779-784`).

### The math, and the bulk markup bar

The markup arithmetic is pure and lives in one file, `apps/designer-portal/src/lib/scope/markup.ts`. `computeMarkupUpdate` at `markup.ts:35-48` implements `client = round(trade × (1 + markup/100))` and `line = qty × client`, returning `null` for any line that is not `fixed` (`markup.ts:39`) and clamping a negative or absent trade price to zero (`markup.ts:40`). `lineMarginCents` at `markup.ts:63-67` returns `line_total_cents − unit_price × quantity`, and deliberately returns `null` rather than zero when the trade price is unknown (`markup.ts:65`). `lensTotals` at `markup.ts:78-89` folds a set of lines into a client total, a margin total, and a `marginComplete` boolean that goes false the moment any line contributes no margin.

The only UI that sets a markup is the bulk bar. `applyBulkMarkup` at `ffe-schedule-builder.tsx:967-1008` calls `computeMarkupUpdate` per selected line (`ffe-schedule-builder.tsx:977`) and writes `markup_percent` and `unit_sell_price` only (`ffe-schedule-builder.tsx:990-991`) — never `unit_price`. Its control is an unlabelled numeric input with `aria-label="Markup percent"` at `ffe-schedule-builder.tsx:1731` and a button reading `Apply markup` at `ffe-schedule-builder.tsx:1747`; skipped lines are reported inline at `ffe-schedule-builder.tsx:1000`.

### The three floor defects

**F1 — retail lands in the trade column.** `build-proposal-item-from-pick.ts:119` takes retail; the trade figure is *available* on the same pick object, declared as `priceTradeCents?: number | null;` at `product-picker-modal.tsx:87` and populated from `priceTradeCents: p.price_trade ?? null` at `product-picker-modal.tsx:234` — and `grep -c priceTradeCents build-proposal-item-from-pick.ts` returns **0**. The builder never reads it. Because `packages/supabase/src/hooks/use-proposals.ts:773` then copies the number into the sell column too, a catalog piece with a real trade price on file arrives on the schedule showing retail-as-cost, retail-as-price, and zero margin.

**F2 — the designer-facing totals sum trade.** The per-row figure is `const lineCost = item.unit_price * item.quantity;` at `ffe-schedule-builder.tsx:463`, rendered as the row's `unitTotalLabel` (`ffe-schedule-builder.tsx:498-501`). The document figure is `totalEstimate` at `ffe-schedule-builder.tsx:1164-1177`, whose fixed-line leg is `sum + (i.unit_price || 0) * (i.quantity || 1)` at `ffe-schedule-builder.tsx:1166`. Both read `unit_price` — the trade column — and both are labelled to the designer as money the client will pay: `Estimated Total` at `ffe-schedule-builder.tsx:1621`. Meanwhile the number actually persisted to `proposals.total_amount` is built from `line_total_cents` (client) by `packages/supabase/src/lib/proposal-total.ts:22-31`. The screen and the database disagree by exactly the markup.

**F3 — a trade edit clobbers the client price.** In `useUpdateProposalItem` (`packages/supabase/src/hooks/use-proposals.ts:841`), after merging the current row (`packages/supabase/src/hooks/use-proposals.ts:892-897`) and recomputing the line total from `mergedSell` (`packages/supabase/src/hooks/use-proposals.ts:900-906`), the payload is amended at `packages/supabase/src/hooks/use-proposals.ts:911-912`:

```ts
if (updates.unit_price !== undefined) {
  payload.unit_sell_price = updates.unit_price;
}
```

Any edit that touches the trade price silently overwrites the client price with it. A designer who applies 30% markup to a line and then corrects the vendor cost by a dollar destroys the markup — and the comment at `packages/supabase/src/hooks/use-proposals.ts:909-910` records this as intentional parity with the add path rather than as a defect.

---

## 3. The Financial lens

The lens is the studio-owner money view over a pre-sale schedule, and it is the only surface in the product where trade, markup, client, and margin appear on one row.

**The gate** is `useIsStudioOwner`, defined at `packages/supabase/src/hooks/use-permissions.ts:446-454`, which resolves the `studio_owner` role from `useUserRoles()` and returns `{ isStudioOwner: false, isLoading: true }` while roles load — failing closed. It is consumed once, at `ffe-schedule-builder.tsx:911`, gating both the toggle (`ffe-schedule-builder.tsx:1367`) and the panel (`ffe-schedule-builder.tsx:1412`, `{moneyView && isStudioOwner && <FinancialLensPanel rows={lensRows} />}`). Note what the gate does *not* cover: the bulk markup bar at `ffe-schedule-builder.tsx:1727-1748` sits outside it, so markup-*setting* is available to any member while markup-*reading* is owner-only.

**The panel** is `apps/designer-portal/src/components/portal/scope-builder/financial-lens.tsx`, 232 lines, whose header comment (`financial-lens.tsx:8-11`) states the law: "DESIGNER-EYES ONLY. This analysis lives in the app, never in a file that travels." Its columns are declared at `financial-lens.tsx:94-100`: Code, Item, Qty, Trade, Markup, Client, Line margin. The hint is one constant, `const MATH_HINT = 'trade × (1 + markup) = client'` (`financial-lens.tsx:35`), rendered beside the header (`financial-lens.tsx:87`) and reused as the `title` on every margin cell (`financial-lens.tsx:128`).

**Room subtotals** are real: `RoomBlock` (`financial-lens.tsx:163-196`) folds each room's rows through `lensTotals` (`financial-lens.tsx:105`) and renders a subtotal at `financial-lens.tsx:184-193`, rooms in first-seen order with `Unassigned` last (`financial-lens.tsx:65`). Subtotal and document total both prefix `≥ ` when `marginComplete` is false (`financial-lens.tsx:190`, `financial-lens.tsx:153`) — the panel refuses to state a margin it cannot fully compute, and says so: "Some lines have no trade price on file" (`financial-lens.tsx:152`).

**The type is below the floor.** The published metadata floor is `--type-metadata-min: 12px` at `apps/designer-portal/src/app/globals.css:87`, and the mono convention is stated at `apps/designer-portal/src/components/document/stamp.tsx:52` — "Its literal is the 11px mono floor (S2), raised from 10px." The lens obeys neither. Its column headers are `fontSize: '0.55rem'` (8.8px) at `financial-lens.tsx:202`, and its room labels `fontSize: '0.58rem'` (9.28px) at `financial-lens.tsx:178` — both `font-mono uppercase`, both set as inline styles rather than through `.doc-type-meta` (`globals.css:1189-1195`), which is why the floor was never enforced against them. The single test that guards the floors, `apps/designer-portal/src/components/document/__tests__/quiet-type-foundation.test.ts:29-31`, only asserts that the tokens are *declared* in `globals.css` — it never checks that a component uses them.

**Three unshared margin computations.** The same idea is implemented three times, and no two agree.

1. `lensTotals` (`markup.ts:78-89`) — pre-sale, over `proposal_items`. Margin is **absolute cents**, `line_total_cents − unit_price × quantity` per `markup.ts:66`. No status filter: every line in the document counts. Completeness is a boolean.
2. `use-account-page.ts:110-123` — post-sale, over `project_ffe_items`. It first filters to `COMMITTED_STATUSES` (`apps/designer-portal/src/hooks/use-account-page.ts:108`, the set defined at `use-account-page.ts:66`), then computes client value as `unit_price_cents × quantity` (`use-account-page.ts:112-115`) rather than from `line_total_cents`, and reports a **percentage**: `Math.round(((clientValueCents - tradeCostCents) / clientValueCents) * 100)` at `use-account-page.ts:122`. It separately emits `estCommissionCents: Math.max(0, clientValueCents - tradeCostCents)` at `use-account-page.ts:163`. Completeness is a `tradeCoverage` count (`use-account-page.ts:161`).
3. `useProjectFinancials` (`packages/supabase/src/hooks/use-project-v2.ts:618-697`) — post-sale, over `project_ffe_items`, with **no status filter on the margin leg**. Margin is absolute cents (`use-project-v2.ts:656`), rolled up per category, and returned as `null` rather than zero when no item carries trade data (`use-project-v2.ts:674-675`). Completeness is `itemsWithTradeCount` / `totalItemCount`.

There is in fact a **fourth**: a near-duplicate `useProjectFinancials` at `apps/designer-portal/src/hooks/use-projects.ts:372`, whose margin loop (`use-projects.ts:414-435`) is byte-similar to the package version but whose query filters `.is('removed_at', null)` at `use-projects.ts:395` — a filter the package copy at `use-project-v2.ts:627` does not apply. The two hooks will report different margins for the same project the moment a line is soft-removed.

So the product answers "what is my margin?" in cents twice and in percent once, over three row populations, with two definitions of client value and two treatments of removed lines.

---

## 4. What the client sees

**The visibility law** is one pure module, `packages/utils/src/proposal-visibility.ts`, whose header (`proposal-visibility.ts:5-13`) states the intent: both the client portal and the designer's live mirror import from here, "so preview IS truth." Its per-field record is `ShareVisibility` (`proposal-visibility.ts:41-72`), eight fields ordered at `proposal-visibility.ts:75-84`: `pricing`, `roomBudgets`, `paymentSchedule`, `supplierIdentity`, `sourceUrls`, `itemDetails`, `leadTimes`, `feedbackEnabled`. The three tiers are presets over it (`proposal-visibility.ts:114-149`): `full` turns everything on; `milestone` keeps `itemDetails` and `leadTimes` but kills `pricing`, `roomBudgets`, `supplierIdentity`, and `sourceUrls`; `curated` keeps only `feedbackEnabled`. Unknown tiers fall back to `milestone` (`proposal-visibility.ts:163-165`), and an untrusted blob is coerced with `out[key] = src[key] === true` (`proposal-visibility.ts:179`) — a malformed share can only reveal less.

**The server masks per tier.** `get_client_proposal_bundle` (`supabase/migrations/00390_proposal_copy_immutability.sql:1571`) exists because, as `00390:1490-1493` puts it, "RLS filters rows, not columns: a full-row policy would expose trade pricing, internal notes, dispatch state, and every future column by default." The items projection (`00390:1622-1698`) drops the array to `'[]'` for `curated` (`00390:1623`), and gates `unit_sell_price` (`00390:1634-1638`), `line_total_cents` (`00390:1639-1643`), `vendor_name` (`00390:1644-1648`), the budget range (`00390:1654-1663`), and the snapshot's `brand`, `source_url`, and `price_retail` (`00390:1671-1687`) behind `client_visibility_tier = 'full'`. TBD lines are excluded at every tier (`00390:1697`). **`unit_price` and `markup_percent` are not in the projection at all** — no tier could carry them.

**The mirror is pinned by a contract test.** `apps/designer-portal/src/lib/document/__tests__/proposal-mirror-contract.test.ts:29-38` asserts the mirror's source contains none of `trade_price`, `trade_cost`, `unit_sell_price`, `markup_percent`, `markup_pct`, `margin_pct`, `marginPct`, `design_fee`. The inclusion of `unit_sell_price` is worth noting: the mirror *does* show client money at the `full` tier, but must reach it through `line_total_cents` rather than by naming the sell column.

**The spec book denies twice.** Client-side, `AUDIENCE_ALLOWLISTS` (`apps/designer-portal/src/lib/spec-books/model.ts:82-152`) is allow-list only and fails closed (`model.ts:154-160`); `trade_price` and `markup` appear in one audience, `internal` (`model.ts:131-132`), while `client` gets `client_price` (`model.ts:92`) and `vendor` gets no price field at all (`model.ts:102-113`). Server-side, the render function keeps `FORBIDDEN_NON_INTERNAL_KEY_PARTS = ["trade", "markup", "margin", "private", ...]` (`supabase/functions/spec-book-render/render-model.ts:173-181`) and copies `tradePriceCents`, `markup`, `markupPercent`, `margin` into the commercial block only under `if (audience === "internal")` (`render-model.ts:604-618`).

**`LineItemsBlock` renders two columns and nothing else.** In `packages/patina-design-system/src/components/proposal/LineItemsBlock.tsx`, every row is a name cell (`LineItemsBlock.tsx:80-88`, with an allowance range as a sub-line at `LineItemsBlock.tsx:82-87`) and an amount cell that is always `currency(item.line_total_cents / 100)` (`LineItemsBlock.tsx:90`). No quantity column, no unit price, no trade. The total row uses `var(--font-display)` at `1.2rem` (`LineItemsBlock.tsx:102-107`), and the docblock at `LineItemsBlock.tsx:38-39` explains why every row uses the line total: "so allowances never render $0."

**The authorization sheet has four columns and no fifth.** The rule is written into the docblock of `apps/designer-portal/src/components/document/schedule/review-release-sheet.tsx:10-11`: "Four columns and no fifth: item, room, signed quantity, client price. Trade cost never appears here, because this sheet becomes the client's document." The database enforces the same boundary for the executed instrument — the comment at `supabase/migrations/00422_authorized_schedule_phase1.sql:2157-2159` says of the client bundle that "Everything trade-side is absent by construction: no trade_price_cents, no markup_percent, no trade_unit_cost_cents, no purchase order, no vendor cost," and the projection at `00422:2110-2111` emits only `clientUnitPriceCents` and `clientLineTotalCents`.

---

## 5. Post-sale

**Dual pricing, in three sentences.** `supabase/migrations/00185_ffe_dual_pricing.sql:47-49` added `trade_price_cents` and `markup_percent` to `project_ffe_items` and fixed an activation bug that had been writing the trade unit price into the client column. `00199` then re-issued `activate_proposal_as_project` from a pre-00185 body and silently reverted both the mapping fix and the trade carry — a regression the banner of `supabase/migrations/00279_ffe_pricing_reconciliation.sql:22-30` traces forward through `00262 → 00269 → 00274`, noting "the exact bug 00185 fixed, silently back in prod." `00279` re-applied the repair onto the then-current body, which is why the dual-pricing model exists twice in the migration history.

The column meanings are fixed by comment: `unit_price_cents` is "CLIENT unit price in cents... Source of truth for client-facing money" (`00185:51-55`); `trade_price_cents` is the vendor cost, explicitly nullable, "NULL = unknown... UI must tolerate NULL" (`00185:57-60`); and `markup_percent` is "Advisory... Client price is the source of truth — this records intent and need not exactly equal unit_price/trade − 1" (`00185:62-65`). Markup post-sale is documentation, not arithmetic.

**Writes are RPC-only.** `guard_ffe_rpc_mutation` (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:935-955`) permits a direct UPDATE only when every one of a long list of columns is unchanged — `unit_price_cents`, `line_total_cents`, `trade_price_cents`, and `markup_percent` among them (`00435:944-946`) — otherwise raising "FF&E lifecycle, assignment, pricing, replacement, and removal mutations are RPC-only" (`00435:952`). The escape hatch is a transaction-local setting, `current_setting('app.ffe_mutation_rpc',true)='on'` (`00435:939`), which only the sanctioned RPCs set. The grants confirm it: `REVOKE INSERT,UPDATE,DELETE ON public.project_ffe_items ... FROM authenticated` at `00435:980`, and the re-grant on the following line does not include that table.

The client library agrees. `useUpdateFFEItemPricing` (`packages/supabase/src/hooks/use-project-v2.ts:329-347`) keeps its full input type — `tradePriceCents`, `markupPercent`, `unitPriceCents` (`use-project-v2.ts:305-323`) — then throws before touching data (`use-project-v2.ts:333-335`): "FF&E pricing changes are RPC-only; use the project selection pricing workflow." There is no working post-sale price editor in the portal.

**Two locks, and what they do not cover.** The soft lock, `guard_ffe_schedule_soft_lock` (`00422:1468-1496`), returns early unless `quantity`, `unit_price_cents`, or `line_total_cents` changed (`00422:1476-1479`), then blocks the edit if the line sits on a *sent* authorization: "schedule line quantity or price is locked while it sits on sent authorization \"%\"; void the authorization to edit" (`00422:1491`). The executed-snapshot freeze is stricter: once executed, `quantity`, `unit_price_cents`, and `line_total_cents` must match the signed snapshot exactly (`00422:1431-1436`), with a ceiling rule for allowances (`00422:1418-1430`). **Neither guard mentions `trade_price_cents` or `markup_percent`** — the studio may revise its own cost and markup on a signed line freely, because only the client's number is frozen. A configuration-derived line, by contrast, locks once `configuration_locked_at` is set, this time *including* `trade_price_cents` (`supabase/migrations/00403_product_configuration_foundation.sql:827-836`).

**Activation clamps.** The two `project_ffe_items` INSERT blocks in `00279` write `GREATEST(COALESCE(v_item.unit_price, 0), 0)` into `trade_price_cents` and `GREATEST(COALESCE(v_item.markup_percent, 0), 0)` into `markup_percent` (`00279:199-200` and `00279:237-238`). The comment at `00279:184-186` gives the reason — negative or null values "would violate the 00185 >= 0 CHECKs and block activation" — but the effect is that **unknown trade cost becomes a confident zero at activation**, which is precisely the case `00185:57-60` told the UI to tolerate as NULL. A line that crosses into a project with no trade price on file will report 100% margin forever after.

**Drift is stated, never silent.** `apps/designer-portal/src/components/document/line-unfold.tsx:441-444` renders `signed price {fmtUsd(auth.signedLineTotalCents)} · deposit clear|deposit not yet clear`, and separately, when a delta exists, `authorized ${fmtUsd(...)} · now ${fmtUsd(...)}` built at `line-unfold.tsx:364-369` and rendered in terracotta at `line-unfold.tsx:446-451` under the comment "The signed price stands; the drift is stated, never silent." The data behind it is `useAuthorizationLineDrift` (`apps/designer-portal/src/hooks/use-commercial-documents.ts:1148-1158`), whose fetch selects exactly `"id, line_total_cents, status"` (`use-commercial-documents.ts:1126`) — client money only, no trade, no markup.

---

## 6. Price freshness today

**The absence is total.** A grep across all 521 migrations for `price_verified_at|price_checked_at|price_valid_until|price_source|quote_expires|price_as_of|price_history` returns **zero hits**. Nothing on `products`, `proposal_items`, or `project_ffe_items` records when a price was last confirmed, where it came from, how long it is good for, or what it used to be. `vendor_quote_requests` — the table whose name promises otherwise — carries `scope`, `timeline`, `message`, and `status` and no money column at all (`supabase/migrations/00162_designer_portal_backlog_schema.sql:31-49). A studio can request a quote in Patina and has nowhere to put the answer.

**But every ingredient exists as a partial precedent.**

*A verification timestamp.* `products.photo_verified_at` was added by `supabase/migrations/00533_piece_detail_contract.sql:51`, with a comment that reads like a specification for the price case: "When a human last confirmed the photography on this row is the piece it claims to be. NULL means nobody has — the app says nothing rather than implying verification (C5)" (`00533:54-55`).

*A price snapshot.* `saved_items.price_cents_at_save` (`supabase/migrations/00535_saved_items_price_snapshot.sql:21-22`) is the only stored historical price in the schema, and its comment names the exact capability a freshness feature needs: "the pair is what lets the app say a price moved without inventing a figure (C5). NULL when the price was unknown at save time... and the app then says nothing" (`00535:28-29`).

*A validity window.* The only `validUntil` in the product is on a custom commission quote — `custom_commission_revisions.quote` is a jsonb column, typed as `{ retailPriceCents, tradePriceCents, validUntil, receivedAt }` in `packages/types/src/product-configuration.ts`. The shape a price-freshness feature would want already exists, for exactly one bespoke path, unindexed and unqueryable.

*A change signal.* `notify_price_drop` (original `supabase/migrations/00043_engagement_notification_triggers.sql:82-126`, re-issued at `supabase/migrations/00258_edge_settings_vault.sql:285`) fires `AFTER UPDATE OF price_retail ON products` (`00043:129`) and posts old and new price to the `price-drop-check` edge function (`00043:112-117`). It is a notification, not a record — nothing is persisted.

*A drift comparison.* `computeBoardDrift` (`apps/designer-portal/src/lib/scope/board-schedule.ts:93-110`) already compares a pin's snapshot price against the product's current retail and returns the set that moved, feeding a "price moved" badge (`board-schedule.ts:88-92`). And `client_product_snapshot` on `proposal_items` freezes a client-facing product record including `price_retail` (`00390:1683-1687`).

*A staleness rule.* The clearest precedent is already shipping. `runSpecBookPreflight` emits an `aged_price_or_lead_time` warning — "pricing or lead time may be aged" — at `apps/designer-portal/src/lib/spec-books/model.ts:446-450`, gated on `daysSince(item.updated_at, now)! > 90` (`model.ts:442-444`). The product already tells designers a price may be stale; it just infers it from the row's last write rather than from any price-specific fact.

**The reusable UI grammar.** `FieldProvenance` in `apps/designer-portal/src/components/document/spec-books/spec-book-workspace.tsx:127-153` renders a value with a mono provenance line beneath it — `{resolved.source.replaceAll("_", " ")}` plus, when present, `` ` · verified ${new Date(resolved.verifiedAt).toLocaleDateString()}` `` (`spec-book-workspace.tsx:145-149`). That is a finished "source · verified <date>" instrument at `text-[11px]`, on the mono floor, already in the Document's register. The staleness threshold that would drive it, `daysSince` at `apps/designer-portal/src/lib/spec-books/model.ts:326-331`, is declared without `export` — **module-private**, reachable from `runSpecBookPreflight` (`model.ts:422`, `model.ts:443`) and nowhere else. Any surface outside `lib/spec-books/model.ts` that wants to say "verified 94 days ago" must either export it or reimplement it.

---

## 7. Studio settings

There is one modern per-studio settings table and one dead field, and the gap between them is the whole story.

**`studio_billing_settings`** (`supabase/migrations/00428_invoice_payment_method_surcharge.sql:42-51`) is the shape any new studio-level pricing setting should copy. Its primary key *is* the organization — `studio_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE` (`00428:43-44`), one row per studio, no surrogate id. Its numeric setting carries a range CHECK inline (`00428:45-47`), and absence is meaningful: "One row per organization; absence means the platform defaults" (`00428:90`). The RLS pattern is worth copying wholesale — RLS enabled (`00428:59`), every policy `TO authenticated` with a SECURITY DEFINER helper as its predicate (`is_active_studio_member` for SELECT, `00428:65-68`; `is_org_admin_or_owner` for INSERT/UPDATE, `00428:71-81`), a comment explaining why (`00428:61-63`: "a policy that reaches organization_members directly re-enters that table's own RLS and 42501s"), no DELETE policy by design (`00428:83`), and explicit grants (`00428:85-87`).

**`user_settings.default_markup`** is the counter-example. Declared at `supabase/migrations/00014_portal_business_features.sql:475` as `default_markup DECIMAL(5,2) DEFAULT 30.00, -- Default markup percentage`, beside `show_pricing BOOLEAN DEFAULT true, -- Show trade pricing` (`00014:471`). It is typed by hand at `packages/types/src/user-management.ts:152` and `packages/shared/src/types/user-management.ts:152`, and generated at `packages/supabase/src/database.types.ts:25063`. A repo-wide grep for `default_markup|defaultMarkup` across `apps/`, `packages/`, and `supabase/` returns only those type declarations and the migration itself. **No hook, component, RPC, or edge function reads it.** Patina has shipped a default-markup setting for the life of the schedule and never once applied it to a line — and on the wrong grain besides: `user_settings` is per user, and a markup policy belongs to the studio.

**There is no `studios` table.** A grep for `CREATE TABLE ... studios` across all migrations returns nothing. The entity is `organizations` (`supabase/migrations/00021_user_management_foundation.sql:102-122`), carrying a free-form `settings JSONB NOT NULL DEFAULT '{}'` (`00021:113`); the designer-facing name is a view, `v_studios` (`supabase/migrations/00084_project_management_mvp.sql:363-372`), described at `00084:374` as a "Designer-facing alias for organizations table. RLS enforced through organizations." A studio-level pricing setting therefore has two possible homes — a typed column on a `studio_billing_settings`-shaped table, or a key in `organizations.settings` — and only the former has been validated in practice.

---

## 8. Contracts any change must respect

**Draft-only child writes.** `guard_proposal_child_draft_only` (`00390:370-494`) locks every old and new proposal parent `FOR UPDATE` in id order (`00390:474-479`) and raises `'proposal % is %, so its authored copy is immutable'` when the parent is not `draft` (`00390:481-486`). It is attached to `proposal_items` and five sibling tables (`00390:504-532`). Any pre-sale pricing change is a draft-only operation, full stop.

**The send fingerprint.** `_proposal_review_fingerprint` (`00390:173`) hashes an explicit per-item column list at `00390:218-227` that includes `item.unit_price`, `item.line_total_cents`, `item.unit_sell_price`, and `item.markup_percent` (`00390:220-221`). A new pricing column that is not added here will not invalidate a stale send.

**Revision path.** A revision is a clone: `clone_proposal(p_mode:'revision')`, latest body in `00399`, producing a `version + 1` child with `parent_proposal_id` set. Like every other copier it works from an explicit column list.

**The explicit column lists.** New columns are silently dropped by any of these unless added by hand. The ones that carry money are: the fingerprint item list (`00390:218-227`); the two activation INSERT blocks in `00279` (column lists at `00279:187-192` and `00279:225-230`, values at `00279:193-206` and `00231-244`); the authorization builder in `00422` (`00422:607-612`); the `clone_proposal` body in `00399`; and the placement RPCs in `00435`. The client bundle at `00390:1622-1698` is the inverse case — a new column is *safely* invisible there until deliberately projected.

**Catalog writes are super-admin only.** `products_catalog_update` (`supabase/migrations/00152_three_layer_catalog.sql:393-397`) requires `user_has_role(auth.uid(), 'super_admin')` in both `USING` and `WITH CHECK`. A designer cannot correct a catalog price, only a personal-layer one (`00152:389`). Any "verify this price" affordance on a catalog row needs an RPC, not an UPDATE.

**The shadow gate and the type floors.** R126 (`docs/design/the-document/DECISIONS.md:9981`) amended D4 to permit exactly one token, `--elevation-sheet`, at exactly three sites, enforced at the CSS level by `lib/document/__tests__/shadow-gate.test.ts` (`DECISIONS.md:10023-10036`). The type floors are `--type-metadata-min: 12px`, `--type-body-min: 14px`, `--type-control-min: 16px` (`globals.css:87-89`), with the mono convention at 11px stated in `stamp.tsx:52`.

**The currency formatters — six of them**, none shared: `formatDollars` at `apps/designer-portal/src/lib/currency-ui.ts:7` (and its `formatSignedDollars` at `currency-ui.ts:12`); a second `formatDollars` at `apps/designer-portal/src/components/portal/procurement/order-assistant/types.ts:207`; `fmtUsd` at `apps/designer-portal/src/lib/document/format.ts:62`; `formatCurrency` at `apps/designer-portal/src/lib/utils.ts:14`; `money` at `apps/designer-portal/src/lib/document/project-commerce.ts:458`; and `formatMoney` at `apps/designer-portal/src/components/document/rooms/piece/piece-configuration-model.ts:623`. They disagree on fraction digits — `currency-ui.ts:8` uses `maximumFractionDigits: 0` on a raw template string, `utils.ts:18` uses `minimumFractionDigits: 2` via `Intl` — so a mockup must state which surface it is drawing.

**The date helpers split on kind.** `formatCalendarDate` (`format.ts:39-60`) handles a bare `YYYY-MM-DD` timezone-safely by constructing at local noon (`format.ts:45-49`); `when` (`project-commerce.ts:465`) formats a real moment in the reader's timezone. The rule is written at `format.ts:36-38`: "Use this ONLY for days. A real moment (signed_at, engaged_at) still belongs in the reader's own timezone."

**The primitives.** `Stamp` (`stamp.tsx:56`) is DM Mono 600 uppercase, `1.5px` border, `3px` radius, `-1.5deg` rotation, at `text-[11px]` for `xs` or `text-[12px]` for `sm` (`stamp.tsx:92-96`). `StatusChip` (`status-chip.tsx:8-10`) is a 6px dot plus a mono `text-[11px]` label, "No fill, no pill, no rotation" (`status-chip.tsx:3`). `RowWash` (`row-wash.tsx:39`) paints a clip-path wash from the pointer contact point, with nine tones (`row-wash.tsx:8-17`) and its handlers exposed as `useRowWash` (`row-wash.tsx:32-34`).

---

## 9. Fixture math constraints

Any mockup in the proposal must obey these exactly.

**Client price from trade and markup** — `client = round(trade × (1 + markup/100))`, from `markup.ts:42`:
```ts
const sell = Math.round(trade * (1 + markupPercent / 100));
```
Rounding is `Math.round` on cents, applied to the unit price, *before* multiplication by quantity.

**Line total** — `line = qty × client`, from `markup.ts:46` (`line_total_cents: qty * sell`) and `packages/supabase/src/hooks/use-proposals.ts:784` (`quantity * sellPrice`). Quantity defaults to 1 (`markup.ts:41`).

**Margin** — `margin = line_total − trade × qty`, from `markup.ts:66`. Note this reads the *stored* `line_total_cents`, not a recomputed `qty × client`, so a line whose total is stale reports a margin that reflects the staleness.

**Allowance lines fold in at the midpoint** — `round((budget_min_cents + budget_max_cents) / 2)`, applied at insert (`packages/supabase/src/hooks/use-proposals.ts:783`), at update (`packages/supabase/src/hooks/use-proposals.ts:906`), and backfilled by `supabase/migrations/00165_allowance_line_total_midpoint.sql:24` as `GREATEST(0, round((budget_min_cents + budget_max_cents) / 2.0))::int`. Allowances have **no** markup and **no** margin: `computeMarkupUpdate` returns `null` for them (`markup.ts:39`) and so does `lineMarginCents` (`markup.ts:64`).

**TBD lines are excluded** from the client copy entirely (`00390:1697`) and from the on-screen estimate (`ffe-schedule-builder.tsx:1164-1177` counts only `fixed` and `allowance`), and carry no margin (`markup.ts:64`).

**Document total** — `total_amount = Σ line_total_cents + Σ proposal_phases.fee_cents`, from `packages/supabase/src/lib/proposal-total.ts:17-33`, matching the server-side `_recompute_proposal_total_locked` in `00399`. Phase fees are part of the number the client agrees to; a mockup showing an FF&E-only total is showing a different number than the database holds.

**marginPct has two definitions.** The lens does not compute a percentage at all — it reports absolute cents plus a `marginComplete` flag (`markup.ts:69-89`). The account page computes `round(((clientValue − tradeCost) / clientValue) × 100)` where `clientValue = Σ unit_price_cents × quantity` over committed lines only (`use-account-page.ts:112-123`). A mockup that shows a margin percentage must say which of the two it is, because on the same data they differ whenever `line_total_cents ≠ qty × unit_price_cents` or any line is uncommitted.

**Trade coverage must be shown, not assumed.** Because `trade_price_cents` is nullable by design (`00185:57-60`), every margin figure in the product is partial until proven otherwise. The lens prefixes `≥ ` (`financial-lens.tsx:153`, `financial-lens.tsx:190`); `useProjectFinancials` returns `null` rather than `0` (`use-project-v2.ts:674-675`); the account page reports `tradeCoverage: { withTrade, total }` (`use-account-page.ts:161`). A fixture showing a bare margin with full coverage is showing the rare case.

---

## 10. Corrections

Claims from the four relayed inputs that did not verify as stated. All four inputs are saved as delivered under `research/00-raw/`.

1. **"mono floor 11px ... DECISIONS R126 entry" (Input B; brief §8).** The 11px mono floor is real but is *not* in R126. R126 (`docs/design/the-document/DECISIONS.md:9981-10045`) rules on Direction A, the hover wash, and the D4 shadow amendment; it contains no type-floor rule. The mono floor is documented in code at `apps/designer-portal/src/components/document/stamp.tsx:52` ("Its literal is the 11px mono floor (S2), raised from 10px"). The *published CSS token* floor is 12px — `--type-metadata-min: 12px` at `apps/designer-portal/src/app/globals.css:87` — and the earlier DECISIONS reference to it is at `DECISIONS.md:7350-7351`, which names "the 12px floor (`--type-metadata-min`)". The lens's 0.55rem/0.58rem is below both.

2. **"blended margin computed in three unshared places" (Input D; brief §3).** There are **four**. A near-duplicate `useProjectFinancials` exists at `apps/designer-portal/src/hooks/use-projects.ts:372-470`, differing from the package copy in that its items query filters `.is('removed_at', null)` (`use-projects.ts:395`) where `use-project-v2.ts:627` does not.

3. **Brief §2 lists four add paths; a fifth defect site was not named.** `consume_capture` reproduces F1 in SQL: `v_unit_price := COALESCE(v_product.price_retail, 0)` at `supabase/migrations/00142_proposal_items_line_total_rename.sql:61`, inserted into `unit_price` at `00142:89`. `products.price_trade` is never read. Any fix confined to the TypeScript add paths leaves this one intact.

4. **Brief §6 "no ... history on products"; one staleness rule already ships.** `runSpecBookPreflight` emits `aged_price_or_lead_time` — "pricing or lead time may be aged" — at `apps/designer-portal/src/lib/spec-books/model.ts:446-450`, gated on `daysSince(item.updated_at, now)! > 90` (`model.ts:442-444`). Input C's "price-freshness language: none anywhere" holds for the schema (zero-hit grep, §6) but not for UI copy — see also `FieldProvenance`'s "· verified <date>" at `spec-book-workspace.tsx:145-149`. The absence is of a price-specific timestamp, not of the staleness concept.

5. **`line-unfold.tsx` "signed price … · now …" (brief §5).** These are two separate strings, not one. `signed price {fmtUsd(auth.signedLineTotalCents)} · deposit clear|deposit not yet clear` is at `line-unfold.tsx:442-443`; `authorized ${fmtUsd(...)} · now ${fmtUsd(...)}` is built at `line-unfold.tsx:366-368` and rendered at `line-unfold.tsx:449`.

6. **`useAuthorizationLineDrift` (Input D).** The hook is portal-local, not in `@patina/supabase`: `apps/designer-portal/src/hooks/use-commercial-documents.ts:1148-1158`, with its fetcher at `1118-1138`.

7. **`guard_ffe_rpc_mutation` message (Input D).** The function is `00435:935-955` (`957-960` is the trigger). Its message is "FF&E lifecycle, assignment, pricing, replacement, and removal mutations are RPC-only" (`00435:952`), not the shorter pricing-only phrasing.

8. **"no studios table — view over organizations (00021:102)" (Input A).** Correct in substance, wrong in citation. `00021:102` is `CREATE TABLE organizations`. The studios *view* is `v_studios` at `supabase/migrations/00084_project_management_mvp.sql:363-372`.

9. **`notify_price_drop 00043:82` (Input A) vs `00258:285-330` (Input D, flagged for verification).** Both are correct: the original is `00043:82-126` with its trigger at `00043:128-132`; `supabase/migrations/00258_edge_settings_vault.sql:285` re-issues an "identical body, settings now via app_setting()" (`00258:284`).

10. **`furnishing_authorization_items` "has trade_unit_cost_cents + markup_percent" (Input D).** Verified — `00412:256-257`. Worth restating positively: the studio's cost *is* frozen at signature in the same row as the client's price; it simply never reaches any client projection (`00422:2157-2159`).

11. **Line-range drift (minor; all corrected above).** `lensTotals` is `markup.ts:78-89`, not `78-95`. `useProjectFinancials` is `use-project-v2.ts:618-697`, not `618-660`. The F3 clobber is `packages/supabase/src/hooks/use-proposals.ts:911-912`, not `911-913`; the zero-margin default is `packages/supabase/src/hooks/use-proposals.ts:773`, not `~780`. `guard_proposal_child_draft_only` ends at `00390:494`, not `500`. `studio_billing_settings` is `00428:42-51`, its RLS/GRANT pattern running to `00428:94`; `45-47` is only the surcharge column.

12. **Provenance caveat.** The four inputs reached this lane as orchestrator-relayed summaries rather than verbatim agent transcripts, and are labelled as such in each file's header. Line numbers in them were treated as claims to check, not as citations.

