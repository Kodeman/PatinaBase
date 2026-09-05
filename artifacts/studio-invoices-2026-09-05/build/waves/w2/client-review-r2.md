# W2 · CLIENT lane — adversarial review, round 2

Reviewer: separate context, did not write the code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-client`, branch
`studio-invoices/w2-client`, diff `3a54d8743...HEAD` (6 commits, 23 files,
+1371 / −44).

**Verdict: fix** — no blocker; one major (R2-1), five minors, three nits.
Every numbered brief item is delivered. Both lane gates are green, run by me.

## Gates (run by the reviewer, in the worktree)

```
pnpm --filter @patina/client-portal type-check → tsc --noEmit, no output
pnpm --filter @patina/client-portal test       → Test Suites: 116 passed, 116 total
                                                 Tests: 1576 passed, 1576 total (10.8 s)
pnpm --filter @patina/supabase type-check      → clean
pnpm --filter @patina/supabase test            → 85 files, 998 passed | 12 skipped
pnpm --filter @patina/designer-portal type-check → clean (shared-hook consumer)
git status --short                             → clean (probe files removed)
```

No pre-existing failures were observed; the two the brief warned about did not appear.

## Round-1 findings — verified

| # | State | Evidence |
|---|---|---|
| C1 letterhead off the designer, not the letter's own studio | **FIXED** | `use-studio-identity.ts:39-92` gains `studioId` → `p_studio_id`; `00571_studio_invoices.sql:1318-1350` gives it precedence; probe: `identity called with: [{"studioId":"studio-A","designerId":"designer-A"}]`; new hook suite `packages/supabase/src/hooks/__tests__/use-studio-identity.test.ts` |
| C2 household money read as owed on the adopted house | **FIXED by disclosure** (the ruling the finding asked for) | `derive.ts:508` `owedStudioCount`; `house-ledger.tsx:48-66` three branches; suite asserts `Owed across 2 open invoices, one from the studio` and that a non-adopting house's row says nothing |
| C3 folded studio line indistinguishable from a house line | **FIXED** | `earlier-invoices.tsx:89-91` `origin()`; line reads `… · from the studio · not for a house` |
| C4 check panel names the HOUSE's studio | **OPEN** → R2-2 |
| C5 zero-house door folds the settlement away | **OPEN** → R2-3 |
| C6 void-only household meets the empty state | **OPEN** → R2-4 |
| C7 full "not for a house" clause on the houseless door | **OPEN** → R2-5 |
| C8 `useClientInvoices()` unconditional | **OPEN** → R2-6 |
| C9 two fallback names on one door | **OPEN** → R2-8 |
| C10 print-page identity beyond brief item 4 | **Kept, and now correct** (C1's fix covers it) |

## Findings

### R2-1 · major (0.8) — the houseless door's letterhead is taken off a different letter than the one in the slot
`letterbox-door.tsx:66-74` resolves identity from `standing[0]`, while the letter
rendered is `open[0]` (soonest due) or the `?invoice=` named row. `useClientInvoices`
(`use-invoices.ts:497-509`) orders `created_at` desc, so the two are unrelated.
Probe (paid letter from `studio-A` created first, open letter from `studio-B`):

```
P3 identity called with: [{"studioId":"studio-A","designerId":"designer-A"}]
P3 letter in slot: Invoice No. 20 · $450 total · $0 paid. Balance $450, due September 1.
```

That is the exact failure C1 was raised to prevent (deck M6: "Letterhead resolves
from the invoice's own studio, never from the designer's primary studio, so a
two-studio designer never sends the wrong name"), reintroduced one level up.
Fix: key the identity off the letter actually standing in the slot
(`open[0] ?? standing[0]`, and prefer the named row when the address names one).

### R2-2 · minor (0.9) — in the adopted house the check panel still names the HOUSE's studio
`threshold.tsx:278` `useStudioIdentity({ projectId })` → `:569 studioName` →
`:861 <Letterbox designerName={studioName}>`; `letterbox.tsx:194-199` prefers
`designerName` over the row, and `payment-method-chooser.tsx:185-195` prints
`Let ${designerName} know a check is coming` / `Thanks — ${designerName} knows a
check is on its way.` `check_remit_to` comes from `get_invoice_payment_options`,
so the remittance is right; only the name is wrong. The houseless door now gets
this right (probe: its chooser is fed the letter's own studio), so the two paths
disagree. Same shape in `EarlierInvoices`. The lane names it under "Still carried".

### R2-3 · minor (1.0) — the houseless door opens folded; M5(b) draws it open
Probe on a plain visit: `DOOR before open — chooser: false`, and only an
`Open the letterbox` act. After the act: `DOOR after open — chooser: true`,
`DOOR settle act: Settle the balance` — so the path works, it is just folded.
`proposal.html` M5(b) shows the envelope, `how you'd like to settle`, the three
choices and `Settle · $453.60` with no open act between them. The letterbox IS
the page here; there is nothing to fold it away from.

### R2-4 · minor (1.0) — the door still refuses to stand where a return needs reading
`letterbox-door.tsx:64` gates on `visibleInvoices(letters)`, which drops `void`
(`invoice-rollup.ts:10-12`), and `:97` returns `<ProjectsEmptyState/>`.
Probes: `P2 empty-state: true`, `P2 letterbox: false` at
`?invoice=inv-31&checkout=success` with a single void letter; and
`P2b empty-state on error: true` when the query fails. Brief item 3 states the
condition as "≥1 issued studio invoice (status <> draft)" — `void` is issued.
Both cases strand a `?checkout=` return, which is the stranding item 3 exists to
prevent. Fix: stand the door whenever the address carries `checkout=`/`invoice=`.

### R2-5 · minor (1.0) — the houseless door prints the contrast clause with nothing to contrast
Probe P1: `P1 studio line: From the studio · not for a house`. M5(b)'s envelope
reads only `From the studio`; the second half belongs to M5(a), where a house
name stands on the plate above. Pass a flag from the door so the clause drops it.

### R2-6 · minor (1.0) — every house reads the client-wide invoice list, adopted or not
`threshold.tsx:305` calls `useClientInvoices()` unconditionally; `:306-315`
throws the result away when `!adopted`. Probe on a non-adopted house:
`P4 useClientInvoices call count on a NON-adopted house: 3`. The query is an
unscoped `from('invoices').select('*, line_items:invoice_line_items(*)')` with
no `enabled` — a multi-house household pulls every readable invoice row, with
its line items, on every non-adopted house, for nothing.

### R2-7 · minor (1.0) — the houseless front door lost its server render
`page.tsx:73` swaps `ProjectsEmptyState` (server-rendered) for `LetterboxDoor`,
which reads `useClientInvoices()` in the browser and returns
`<div data-testid="letterbox-door-hold" aria-hidden className="min-h-[40vh]"/>`
while pending (`letterbox-door.tsx:88-93`). Every houseless client — including
the majority with no studio invoice at all — now gets a blank block on first
paint where the empty state used to be in the server HTML. The brief allowed
"via useClientInvoices / **the server-side loader page.tsx uses**"; the server
leg would keep the door a server render. Declared by the lane (carried #4).

### R2-8 · nit (0.9) — two fallback names on one door
`letterbox-door.tsx:105` `identityQuery.data?.name?.trim() || 'Your studio'` for
the Doorplate; `:117` `designerName={identityQuery.data?.name ?? null}` →
`letterbox.tsx:194-199` falls to `row.designer.*` then `'your designer'`. The
row-level leg can never fire: `useClientInvoices` selects `*, line_items` with
no `designer` embed. Pass one resolved string to both.

### R2-9 · nit (0.8) — "Nothing is waiting for you." states a zero
`letterbox-door.tsx:107`, reached when every studio letter is settled.
`other-houses.ts:47` states the house rule — "Null when nothing is waiting:
silence is the answer, never 'Nothing waiting'" — and `house-ledger.tsx:18`
repeats it ("Nothing is ever reported as zero"). Precedent is not uniform
(`the-road.tsx:165` prints "Nothing on the road."), so this is taste, not a law.

### R2-10 · nit (0.9) — the door's plate is not M5(b)'s letterhead
M5(b) prints `Middle West Studio` over `Leah Kochaver · Madison, Wisconsin`.
The door passes `projectName={studioName}` and `preparedFor` only, so the mono
line reads `prepared for Leah Kochaver`, right-aligned, with no keeper line.

### R2-11 · minor (1.0) — the door's settle path has no test
`threshold.test.tsx`'s `@patina/supabase` mock (`:63-96`) has no
`useInvoicePaymentOptions`, so mounting `Settlement` inside that suite throws —
proved by a probe: `TypeError: (0 , _supabase.useInvoicePaymentOptions) is not a
function` at `settlement.tsx:71`. No test in the repo therefore opens the door's
letterbox, and brief item 3 asks for "settle in place". I verified by hand, in a
suite with the three pay hooks mocked, that it works (R2-3's probe output).

## What is correct, checked and not merely read

- Adopted-house rule stated once (`lib/threshold/adopted-house.ts`) and read by
  both the server front door and the browser house; `road-orders.ts` keeps
  taking the answer from its caller, so there is no second copy.
- `resolveHouseForInstrument`: dropping `.in('project_id', …)` is not an authz
  loosening — `owns()` still refuses a house outside the client's list and the
  studio branch checks `client_id` against `auth.getUser()`; RLS (00571's
  household policy: `client_id = auth.uid() AND status <> 'draft'`) stands
  behind both. The `< 2 houses` short-circuit no longer swallows an invoice.
- Money rules: nothing on this lane writes money. `refunded` is excluded from
  the door's `OPEN_STATUSES` and from `derive.ts:479` `OPEN_INVOICE_STATUSES`,
  so it is neither held nor owed. Cents stay integers throughout. The merged
  list touches only the owed row — no paid/agreed/planned figure reads invoices.
- Refusals: no `overdue`, no `dashboard`, no badge, no count chip, no emoji, no
  red/green in any new homeowner-visible string (grep over the five changed
  threshold files: one comment hit, no copy hit). R135 held: no new route, no
  flag, no header, no nav on the door.
- Brief coverage: items 1-5 all delivered; the five named test files all carry
  new cases (adopted merge, non-adopted exclusion, zero-house door, `?invoice=`
  resolution, `?checkout=` return on `/`).
