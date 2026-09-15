# W5 — fix round 3 (M1-r3 + four cheap minors)

Branch `hour-tracking/portal` @ `c1c3319a5` (was `a0186d3da`), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`. Read in full:
`plan-v2.md` §0 + §6, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a),
`W5-review-r3.md`.

**Scope, as handed down**: M1-r3 (portal-local fix + the component test the
finding names) plus four cheap minors — m9-r3, m6-r3, m3-r3, m10-r3. Every
other r3 finding (m1-r3's Prettier sweep, m2/m4/m5/m7/m8/m11–m16-r3, N1–N15)
is untouched — out of this brief, per the orchestrator's stage-4 scope.

## M1-r3 — the CSV's `Client` column exported empty (colliding query key)

`apps/designer-portal/src/components/document/hours-ledger.tsx` — the
ledger's own `projects` read (`select("id, name, status, client_id")`) shared
the literal TanStack key `["document-hours-projects"]` with W3's
`useTimeCaptureProjects` (`packages/supabase/src/hooks/use-time-tracking.ts`,
`select('id, name, status')`, no `client_id`). TanStack keys the cache entry,
not the function — whichever observer's fetch resolved first filled the
entry and both read it, so the Client column was empty or correct depending
on a race between this component and `MobileSheets` (which mounts
unconditionally above the Hours sheet).

**Fix, portal-local, no shared-package edit**: the ledger's key is now
`["document-hours-projects", "with-client"]`. Nothing else changed — the
enrichment logic (`clientNameByProjectId`, keyed on `c.client_id`, from
round 1's M1 fix) was already correct; it just never ran on live data.

**Component test added** — `hours-ledger-scope.test.tsx`, new describe block
`the Export act (W5, m10-r3)` (see m10-r3 below; the same block covers both
findings since the review named one test for both):
- `exports rows carrying client_name and invoice_number, not the ledger's
  bare row (M1-r3)` — sets a `projects` row with `client_id`, a matching
  `useClients()` row, an `invoices` row, and an ledger row carrying that
  `invoice_id`; clicks Export → CSV; asserts the array handed to
  `buildTimeExportCsv` contains the row with `client_name: 'Nora Ellison'`
  and `invoice_number: 'INV-0042'`.

The test suite's `useClients()` stub is now a live variable
(`clientsData`, default `[]`) instead of a hardcoded `{ data: [] }`; the
`projects` and `invoices` table stubs in `makeClient()` gained
`projectsOverride`/`invoicesOverride` escape hatches, both reset in
`beforeEach`.

## m9-r3 — the invoice-number lookup's error is now surfaced

`hours-ledger.tsx`: the `studioExportInvoices` query now destructures
`isError`, and a new inline `role="alert"` line renders beside the Export
act when it fails ("Invoice numbers could not be read — the exported file
will show a blank Invoice # for invoiced hours."), using the same
`TERRACOTTA_INK` / `role="alert"` pattern the rollup and ledger errors
already use elsewhere in this file. No test added — the review flagged this
as unobservable on real probe data (no invoiced hours in the seed) and the
brief named it a "cheap minor," not a test-owed finding.

## m6-r3 — a rate-pending hour no longer exports a confident "0.00"

`apps/designer-portal/src/lib/document/time-export.ts`: `csvRow` now checks
`row.billing_state === "pending_authorization"` and prints the literal word
`"pending"` in both the Rate and Amount cells for such a row, instead of
`centsToDollars(0)`. The Billing State column is untouched (still prints
`pending_authorization`), and an authorized row that nets to a real zero
(e.g. a zero-duration correction) still prints `"0.00"` — the guard keys on
`billing_state`, not on the figure being zero.

**Existing test updated**: `time-export.test.ts`'s "the amount column sums
to the ledger total" case already carried a `pending_authorization` row at
`amount_cents: 0`; its summing reducer now skips a `"pending"` cell (which
contributes nothing either way, since the row's real `amount_cents` is 0)
rather than trying to `parseFloat("pending")`.

**Two new tests added** to the same file: one pins `"pending"` in both Rate
and Amount for a `pending_authorization` row; one pins that an
`authorized` row with a genuinely-zero resolved amount still prints
`"0.00"` (guarding against the fix over-firing on `amount_cents === 0`
generally).

## m3-r3 — the object-URL revoke is now deferred

`time-export.ts`'s `downloadTimeExportCsv`: dropped the synchronous
`try/finally { URL.revokeObjectURL(url) }` right after `anchor.click()` in
favor of `setTimeout(() => URL.revokeObjectURL(url), 1000)` — matching the
three other in-repo download helpers (`room-file-download.ts:57`,
`export-board.ts:82`, `spec-pdf-client.ts:59`), all of which use the
identical 1-second deferred pattern. No test — the function is explicitly
documented as "not called by any test — a thin DOM side effect, kept out of
the pure builders so they stay unit-testable without a DOM," which the fix
did not change.

## m10-r3 — one component test of the Export act

New describe block in `hours-ledger-scope.test.tsx`,
`the Export act (W5, m10-r3)`, three cases:
1. **renders only at studio scope, and is hidden at every other scope** —
   clicks through `the studio` / `this document` / `mine`, asserting
   `Export → CSV` is present only under `the studio`.
2. **is disabled when the studio window has nothing in it** — `ledgerRows =
   []`, asserts the button is `toBeDisabled()`.
3. **exports rows carrying client_name and invoice_number** — the same case
   that pins M1-r3 (see above).

`buildTimeExportCsv`/`downloadTimeExportCsv` are spied via
`jest.mock('@/lib/document/time-export', ...)` (`jest.requireActual` for
everything else, so `timeExportFilename` and the CSV builders used by the
sibling `time-export.test.ts` suite stay real); jsdom has no real download
surface to assert against, so the spy is the closest honest proxy — matching
the review's own note that `downloadTimeExportCsv` "is not called by any
test."

## Gates — run by me, verbatim

| Command | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- <the 6 specs>` (`time-export.test.ts`, `time-billing.test.ts`, `invoice-composer.test.ts`, `hours-ledger-scope.test.tsx`, `hours-ledger-add-row.test.tsx`, `invoice-composer-studio.test.tsx` — the last one is at `src/components/document/accounts/__tests__/`, not the path the brief's shorthand implied; found it and ran it separately) | **6 suites / 110 tests passed** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — identical count to r3's own recorded baseline; none in a touched file |
| `pnpm --filter @patina/admin-portal build` | exit 0, full route manifest printed |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot |

Also ran the two narrowest files alone first (44 tests) before the full
named set, per `patina-testing` step 13.

Not run: `@patina/design-system`'s own vitest suite (r3 recorded it does not
finish in 25 minutes; this fix touched no file in that package) and no
live/DB walk (not asked for this round — no migrations, no DB reset, code-
and-test-only fix).

## Commit

`c1c3319a53b5745c049214cb63bcf51517ea1b28` —
`fix(time): the CSV names the client, and three cheap Friday repairs (W5 round 3)`.
4 files changed (`hours-ledger.tsx`, `time-export.ts`,
`hours-ledger-scope.test.tsx`, `time-export.test.ts`), +207/−18. Pushed to
`origin/hour-tracking/portal` (`a0186d3da..c1c3319a5`). `git status
--porcelain` shows only pre-existing sandbox-denied `.env.example`/
`.env.development` read-permission noise (not real changes; `git add`
picked up exactly the four intended paths and nothing else).

`.prettier`/format-on-commit hook reported "Staged files have formatting
drift; this is advisory locally" for the two edited non-test files and the
one edited test file (matches m1-r3's own finding that there is no
`.prettierrc` anywhere in this app or package) — advisory only, did not
block the commit, and I did not run a Prettier sweep (m1-r3 is explicitly
out of this round's scope).

## What I did not touch

m1-r3 (Prettier sweep), m2-r3 (three-name wire contract), m4-r3 (duplicate
ledger fetch), m5-r3 (`useClients()` runs for every viewer), m7-r3 (CSV vs.
rollup divergence on legacy rows), m8-r3 (sum-test structure), m11-r3
(local-vs-UTC window), m12-r3 (Bill-week act under 44px), m13-r3 (beside vs.
beneath), m14-r3 (`held` prop), m15-r3 (W1/W2 overflow, not W5's), m16-r3
(loop-closing), and every N-note (N1–N15) — none were named in this brief.
