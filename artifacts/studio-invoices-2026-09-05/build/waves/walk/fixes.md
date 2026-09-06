
## WALK-FIX — W-1 (major): the composer's default studio was row order

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration` · **branch** `studio-invoices/integration` · 2026-09-05

**Finding.** `activeDesignStudios` only filtered; `useOrganizations()` issues no
`ORDER BY`, so `studios[0]` in `invoice-composer.tsx:181` was Postgres physical
row order. A two-studio designer could silently bill from the wrong studio —
wrong letterhead, wrong number sequence, and `studio_invoice_counters` burns a
number on issue.

**Fix.** `apps/designer-portal/src/lib/document/invoice-composer.ts` — the
filter now ends in `.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))`.
`filter` already returns a fresh array, so the caller's rows are not reordered.
The same ordering also fixes the `<select>` option order (component line 482),
which maps over the same list, so the visible first option and the silent
default are one and the same.

**Tests** (`apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts`,
three added to the existing `activeDesignStudios` describe):
- `orders by name, so the silent default never rides on row order` — two input
  permutations of three studios return the same ids in name order.
- `breaks a same-name tie on id, so the first row is still fixed`.
- `leaves the caller's array untouched`.

**Gates**

```
$ npx jest src/lib/document/__tests__/invoice-composer.test.ts   # apps/designer-portal
  activeDesignStudios
    ✓ keeps only active design studios — a manufacturer is not a studio
    ✓ reports the two-studio case the studio line is gated on (S8) (7 ms)
    ✓ orders by name, so the silent default never rides on row order
    ✓ breaks a same-name tie on id, so the first row is still fixed
    ✓ leaves the caller’s array untouched
Test Suites: 1 passed, 1 total
Tests:       23 passed, 23 total

$ npx jest src/components/document/accounts/__tests__
PASS src/components/document/accounts/__tests__/invoice-folio.test.tsx
PASS src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx
PASS src/components/document/accounts/__tests__/accounts-studio-rows.test.tsx
Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total

$ npx tsc --noEmit                                              # apps/designer-portal
TSC_EXIT=0   (no output)

$ npx eslint src/lib/document/invoice-composer.ts src/lib/document/__tests__/invoice-composer.test.ts
ESLINT_EXIT=0   (no output)
```

No migration changed — no `supabase db reset`, no stack handshake needed; no
`stack-request` was written and no stack command was run.
