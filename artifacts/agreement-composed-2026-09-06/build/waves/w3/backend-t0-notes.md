# Wave 3 · T0 types handshake — backend lane notes

Date: 2026-09-07. Scope: `packages/types` only, per build-sheet §2.6 I-1 and the
§3.3 "Packages" table rows naming `packages/types/src/agreement.ts` and
`packages/types/src/commercial.ts`.

## What shipped

Commit `03ab57f496a745764ef2774c723901fb7dda32ec` on `agreement/w3-backend`
("feat(types): agreement parts vocabulary and payloads (T0)"), cherry-picked
byte-identical onto `agreement/w3-designer`, `agreement/w3-client`,
`agreement/w3-edge`, `agreement/w3-sub` (four clean cherry-picks, no
conflicts).

### `packages/types/src/agreement.ts` (extended — every W1/W2 export left byte-identical)

Appended, after `AgreementExecutionSnapshot` (W2's last export):

- `LICENSE_CREDENTIAL_TYPES` / `LicenseCredentialType` — the four values the
  M7 sheet's credential-type select offers (`WI Dwelling Contractor`,
  `MN Residential Building Contractor`, `CA CSLB`, `Other`).
- `LIEN_WAIVER_TYPES` / `LienWaiverType` — the four waiver-exchange values
  (`conditional_progress`, `unconditional_progress`, `conditional_final`,
  `unconditional_final`).
- `PRICING_BASIS_KINDS` / `PricingBasisKind` — the four pricing bases
  (`fixed`, `cost_plus`, `cost_plus_gmp`, `tm_nte`); unit price and
  cost-plus-fixed-fee are deliberately absent (non-goal §1.2 item 7).
- `SUB_DISCLOSURE_MODES` / `SubDisclosureMode` — `open_book` | `closed_book`.
- `DesignBuildCostLine`, `DesignBuildPricingBasisPayload`, `DesignBuildDraw`,
  `DesignBuildDrawsPayload`, `DesignBuildAllowance`,
  `DesignBuildAllowancesPayload`, and the grouped `DesignBuildPayloads`
  (I-1's literal name) — **new, design-build-specific** shapes for the
  `pricing_basis` / `draws` / `allowances` schedule variants.

**Deliberate choice, recorded so a reviewer doesn't read it as a miss**: W1's
`PricingBasisPayload` / `DrawsPayload` / `AllowancesPayload` (generic,
record-only shapes any class's schedule part may carry) are **untouched**.
The design-build validators in build-sheet PART 6 need field names and
shapes those generic payloads don't carry (`costLines`, `feeBps`, `gmpCents`,
`subDisclosure` on pricing; `key`/`pct`/`sortOrder`/`retainageApplies` on
draws; `amountCents`/`overageRule`/`underageRule` on allowances — the
allowance field is `amountCents` here vs. the generic payload's `cents`).
Widening the shared shapes in place would have been a silent, non-additive
change reaching every other class that carries those variants. New,
design-build-scoped types avoid that and keep the T0 commit's diff to pure
additions.

### `packages/types/src/commercial.ts`

- `COMMERCIAL_DOCUMENT_KINDS` — appended `'design_build'` (I-1; this is the
  one line the client lane's sign-route allowlist inherits for free — and
  also the one line that makes `commercial-document-shell.tsx`'s
  compiler-total `KIND_LABEL` map stop type-checking, the forcing function
  the build sheet calls out at §3.3).
- Added `DesignBuildScheduleOfValuesLine`, `DesignBuildDrawLedgerEntry`
  (mirrors `TradeScopeDraw`'s rendered-ledger shape, not the authored
  payload — carries `lienWaiver` per P12), `DesignBuildAllowanceLine`,
  `DesignBuildAttachment`, and `DesignBuildAgreement extends
  CommercialDocumentSummary` with exactly I-1's field list: `kind`,
  `pricingBasis`, `scheduleOfValues`, `draws`, `allowances`, `attachments`,
  `signatures` (plus `projectId`, matching every other non-summary member of
  the document union).
- `DesignBuildAgreement` added as a member of
  `ClientCommercialDocumentBundle.document`'s discriminated union.
- One new import: `import type { DesignBuildPricingBasisPayload,
  LienWaiverType } from './agreement';` — `commercial.ts` had no imports
  before this; `agreement.ts` still imports nothing from `commercial.ts`
  (one-directional, no cycle).

### Not touched, and why

- `BillingCadence` (commercial.ts) is not widened with `'per_draw'` — not
  named in the build sheet's §3.3 Packages table, and `CadencePayload` in
  `agreement.ts` already carries `'per_draw'` since W1. Left for whichever
  lane's own migration/portal work needs it, per the sheet's file ownership.
- `packages/supabase/src/hooks/use-proposals.ts:250`'s stale `document_kind`
  union (missing `'trade_scope'`, per the sheet's own note) is a
  `packages/supabase` file, outside this lane's `packages/types`-only remit.

## Gates run

`packages/types` type-check and build, in all four locations that carry the
commit:

| Worktree | `pnpm --filter @patina/types type-check` | `pnpm turbo build --filter=@patina/types` |
|---|---|---|
| `agent-agr-w3-backend` | clean (`tsc --noEmit`, no output) | 1 successful / 1 total, cache miss, built |
| `agent-agr-w3-designer` | — (portal build below) | 1 successful / 1 total, cache hit, replayed |
| `agent-agr-w3-client` | — (portal build below) | 1 successful / 1 total, cache hit, replayed |
| `agent-agr-w3-sub` | — (portal build below) | 1 successful / 1 total, cache hit, replayed |

Verified the three portal worktrees' `packages/types/dist/agreement.d.ts`
each actually carry `DesignBuildPayloads` post-build (grep count 2 in each) —
turbo's shared build-log cache replays backend-worktree log text on a cache
hit (env.md's documented caveat), so the dist file itself, not the log line,
is the check that matters.

`agent-agr-w3-edge` carries the commit but was not asked to build
`@patina/types` (the edge lane is Deno, not a Next.js portal consuming the
dist-resolved package) — per the task's instruction, only the three portal
worktrees (designer, client, sub) run the portal build check.

Prettier flagged both edited files as non-canonically formatted
(`[warn] packages/types/src/agreement.ts`, `[warn] .../commercial.ts`,
advisory only, does not block commit). Confirmed this is pre-existing drift,
not introduced by this change: `prettier --check` against the pre-commit
(HEAD~1) versions of both files fails identically.

## Cherry-pick record

```
03ab57f496a745764ef2774c723901fb7dda32ec  agreement/w3-backend  (origin)
b854dad52...                              agreement/w3-designer (cherry-pick, clean)
f25fa65be...                              agreement/w3-client   (cherry-pick, clean)
f108672f5...                              agreement/w3-edge     (cherry-pick, clean)
1bc317855...                              agreement/w3-sub      (cherry-pick, clean)
```

All four cherry-picks applied with zero conflicts (no lane had touched
`packages/types` before this commit landed).
