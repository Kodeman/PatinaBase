# W2 · CLIENT lane — adversarial review, round 3

Reviewer: separate context, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-client`, branch
`studio-invoices/w2-client`, diff `3a54d8743...HEAD` (9 commits).

## Gates (run by the reviewer, in the worktree)

```
pnpm --filter @patina/client-portal type-check
> tsc --noEmit                (clean, no output)

pnpm --filter @patina/client-portal test
Test Suites: 116 passed, 116 total
Tests:       1578 passed, 1578 total
Time:        10.66 s
```

The brief's "two known pre-existing failures" did not appear: the suite is
fully green in this worktree.

## Brief items — all delivered

1. `threshold.tsx` merge behind the adopted-house rule — delivered
   (`lib/threshold/adopted-house.ts` states the rule once; `standsUnfiledAsks`
   now reads it, so the orders rail and the letters cannot drift).
2. `app/page.tsx` + `active-project.ts` studio branch, `< 2 houses` no longer
   swallowing an invoice — delivered.
3. Letterbox-only front door mounting `Letterbox` — delivered (with the void /
   error gap below).
4. Print page `Regarding · <title>` — delivered.
5. Tests in all five named files — delivered, plus `house-ledger` and `derive`.

## Round-2 finding — verified fixed

**R2-1** (plate named one studio over another studio's letter). Fixed:
`letterbox-door.tsx:82-86` now repeats the slot's own choice
(`named ?? open[0] ?? standing[0]`) over the same list handed to `Letterbox`,
and asks `useStudioIdentity` with that row's `studio_id`/`designer_id`. Two
tests assert it (the newest-letter case and the `?invoice=` case).

## Findings

Severity/confidence per finding; the orchestrator filters.

### major

- **R3-1 (was R2-2, unfixed twice)** — in the ADOPTED HOUSE the check panel
  names the house's studio as payee for a letter drawn by another studio.
  Probe: `threshold.tsx:278 useStudioIdentity({ projectId })` →
  `:569 studioName` → `:861 designerName={studioName}`; with the house branded
  "The Vale Studio" and `STUDIO_INVOICE.studio_id = 'studio-1'` the check panel
  printed `Let The Vale Studio know a check is coming`, and
  `identityMock.mock.calls[0] = [{"projectId":"proj-vale"}]`. The houseless
  door now gets this right (R2-1's fix), so the two paths disagree.
  `check_remit_to` comes from `get_invoice_payment_options`, so remittance is
  correct — only the name is wrong. Kody is a two-studio designer, so this is
  live for the first customer.

### minor

- **R3-2 (was R2-4)** — the door refuses to stand for a void-only household and
  on a query error, so a `?checkout=` return is never read. Probes:
  `?invoice=inv-31&checkout=success` with one `void` letter → `empty-state:
  true`, `letterbox: false`; `isError` with `data: undefined` → `empty-state on
  error: true`. Off the brief's own words for item 3 ("status <> draft"); void
  is issued. `letterbox-door.tsx:64` gates on `visibleInvoices`, which drops
  draft AND void.
- **R3-3 (was R2-3)** — the door renders folded: `chooser before open: false`,
  `settle act before open: false`; after clicking "Open the letterbox",
  `Settle the balance`. M5(b) (proposal.html:512-522) draws the envelope, "how
  you'd like to settle", the three choices and "Settle · $453.60" with no open
  act between them.
- **R3-4 (was R2-5)** — the door prints "From the studio · not for a house"
  where there is no house to contrast with. M5(b) reads only "From the studio"
  (proposal.html:512); the full clause belongs to M5(a).
- **R3-5 (was R2-6)** — `useClientInvoices()` runs on every house visit and its
  result is discarded in a non-adopted house. Probe: `useClientInvoices calls
  on NON-adopted house: 3`. The hook (`packages/supabase/src/hooks/
  use-invoices.ts:497-509`) is an unscoped `from('invoices').select('*,
  line_items:invoice_line_items(*)')` with no `enabled`.
- **R3-6 (was R2-7)** — the houseless front door lost its server render: every
  zero-house client, including the majority with no studio invoice, gets
  `<div data-testid="letterbox-door-hold" aria-hidden />` in the server HTML
  and only sees the empty state after hydration (`page.tsx:73`,
  `letterbox-door.tsx:56,88-97`). The brief allowed the server-side loader leg.
- **R3-11 (new)** — the doorstep's standing sentence sums the studio letter into
  the house's open balance with no clause. `threshold.tsx:621
  balanceCents: model.ledger.owedCents ?? 0` → `standing-sentence.ts:254-257
  'a balance of $X stands open'`. C2's ruling ("keep it in the rollup, disclose
  it on the row") landed on the ledger row only; the sentence above it is a
  second undisclosed surface.
- **R3-12 (new)** — on the door, `Letterbox` hands `EarlierInvoices`
  `designerName={studio}` (letterbox.tsx:336), which is the SLOT letter's
  studio. A household holding letters from two studios therefore reads the slot
  studio's name as payee on every folded letter — the same class R2-1 fixed for
  the plate, one level down.

### nit

- **R3-7 (was R2-8)** — two fallback names on one door
  (`letterbox-door.tsx:105 'Your studio'`, `:117 designerName={… ?? null}` →
  letterbox.tsx:194-199 `row.designer.*` → 'your designer'), and the row-level
  leg can never fire: `useClientInvoices` embeds no `designer`.
- **R3-8 (was R2-9)** — with every studio letter settled the door states the
  zero twice: `waiting line: Nothing is waiting for you.` and
  `letterbox body: Nothing in the letterbox.` House rule stated twice in this
  codebase (`other-houses.ts:47`, `house-ledger.tsx:18`); counter-precedent at
  `the-road.tsx:165`, so this is taste.
- **R3-9 (was R2-10)** — the door's plate is not M5(b)'s letterhead: `Doorplate`
  prints `prepared for <name>` right-aligned plus the month, where the mockup
  has 'Middle West Studio' over mono 'Leah Kochaver · Madison, Wisconsin'.
- **R3-10 (was R2-11, partially fixed)** — the three pay hooks are now in the
  door's test mock and the `?invoice=` test does mount `Settlement` (a crash
  would fail it), but nothing asserts the chooser or the Settle act on the
  door, so brief item 3's "settle in place" is covered only by absence of a
  throw. `grep -n "Settle" threshold.test.tsx` → two comment lines, no
  assertion.
- **R3-13 (new)** — the door's two filters disagree about `void`: `standing`
  drops it (`visibleInvoices`) but `letters` — the list handed to `Letterbox` —
  keeps it, so `?invoice=<void studio id>` unfolds a cancelled letter with a
  live act: `letterbox body: Invoice No. 99 · $450 total · $0 paid. Balance
  $450, due August 10.` / `settle act: Settle the balance`. Pre-existing on the
  housed path (the same probe against a void PROJECT invoice gives
  `Invoice No. 9 … Settle the balance`), so not a lane regression.
- **R3-14 (new, scope)** — `derive.ts` `owedStudioCount` and the `house-ledger`
  owed-row copy ("Owed across 3 open invoices, one from the studio") are
  homeowner-visible design that appears in neither the plan, the M5 mockups,
  nor the lane's file list (`04-blast-radius.md §5` marks `derive`/`standing`
  untouched, `(c)`). Defensible as C2's answer, but it is unruled copy on the
  house ledger.

## Not found

No blocker. No money-path or RLS defect: nothing in the diff writes an invoice
status, the webhook and the rollup trigger are untouched, all figures stay
integer cents, and `refunded`/`void` are excluded from both the open filter
(`OPEN_STATUSES = sent | partially_paid`) and the rollup. No vision refusal in
any new homeowner string (`grep -iE "overdue|badge|emoji|dashboard|\bgate\b|
\btask\b|text-red|bg-red|text-green|bg-green|shadow-"` over the added lines →
no match). The browser's adopted set and the server's are provably the same
list (`toOtherHouses(projects, id)` on both `/` and `/projects/[projectId]`).
The `useStudioIdentity` query-key widening is safe: the only invalidation is a
`['studio-identity']` prefix (`use-organizations.ts:317`), and no caller reads
the exact key. `resolve_studio_identity`'s 00571 head (00571:1318-1350) does
give `p_studio_id` precedence, so the hook change matches the deployed body.

**Verdict: fix** — one major (R3-1), no blocker.
