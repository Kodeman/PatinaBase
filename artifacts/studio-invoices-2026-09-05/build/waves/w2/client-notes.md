# W2 · CLIENT lane — the studio's letter on the homeowner's page

Branch `studio-invoices/w2-client`, worktree `.codex/worktrees/agent-si-client`,
off `studio-invoices/integration` @ `3a54d8743` (W1 merged: `useClientInvoices()`,
`Invoice.project_id` nullable, `Invoice.title`).

Delivers §5 of `discovery/04-blast-radius.md` and mockups M5(a)/M5(b) of
`proposal.html`. No new route, no flag (R135).

## What changed

**`src/lib/threshold/adopted-house.ts` (new)** — the adopted-house rule, stated
once. `adoptedHouseId(houseIds)` = the lowest project id the client can open;
`standsUnfiled(projectId, otherHouseIds)` = "is this that house". `road-orders.ts`
already described the rule in prose and takes the answer from its caller; the two
callers that compute it (the browser house and the server front door) now read one
implementation, so they cannot drift.

**`components/threshold/threshold.tsx`** — reads `useClientInvoices()` beside
`useProjectInvoices(projectId)` and, when this house is the adopted one, merges the
`project_id === null` rows (drafts excluded) into ONE list. That merged list feeds
`deriveThreshold`, `houseIds` (so correspondence notices about a studio invoice are
filed here), the note's invoice enclosures and `<Letterbox invoices>`. The old
inline lowest-id expression for `standsUnfiledAsks` is now the shared helper. The
settle gate holds on the client-invoice query only while this house is the adopted
one (a disabled/irrelevant query may never hold the page). `onRefetch` is a stable
`useCallback` re-reading both queries — the confirmation poll holds it in an effect
dependency list, so a fresh identity per render would restart the poll.

**`components/threshold/letterbox.tsx`** — a letter whose row has
`project_id === null` carries its own line, *From the studio · not for a house*,
and its `title` on the line where a house name would stand. Settlement, the payment
chooser and the surcharge are untouched.

**`lib/data/active-project.ts`** — `resolveHouseForInstrument` gets the studio
branch. The invoice read can no longer be scoped by `.in('project_id', …)` (a studio
invoice has no project), so it selects `project_id, client_id` by id: a project
invoice still resolves through `owns()`; a null-project row is checked against
`auth.getUser()` and then answered with `adoptedHouseId(projectIds)`. The
`projectIds.length < 2 → null` short-circuit no longer swallows an invoice — it now
reads `projectIds.length < 2 && !invoiceId` — and a client with no house at all
returns before any read.

**`app/page.tsx` + `components/threshold/letterbox-door.tsx` (new)** — a client with
ZERO houses meets `LetterboxDoor` instead of `ProjectsEmptyState`: the studio's
letterhead (`Doorplate`, brand resolved from the invoice's own designer), the
standing line, `<Letterbox>` with the studio's letters and settle in place, and the
same two acts (`EmptyStateActs`, now exported from `ProjectsEmptyState.tsx`) that
state already gave her. No header, no nav. It matters beyond copy: `ProjectsEmptyState`
mounts no `Letterbox`, so `useCheckoutReturn` never ran on `/` — a household who paid
came back to "no active projects yet" and no receipt. The door falls back to
`ProjectsEmptyState` itself when nothing is waiting, and holds rather than flashing
that state while the letters are still coming. A client who HAS a house that will not
open still meets the empty state.

**`app/invoices/[invoiceId]/print/page.tsx`** — the "Project" block prints
*Regarding · <title>* for a studio invoice. Brand identity resolves by
`designerId` when there is no project to resolve through (it would otherwise
print "Your Designer" on a money document).

## Gates

```
pnpm --filter @patina/client-portal type-check   → clean (tsc --noEmit, no output)
pnpm --filter @patina/client-portal test         → Test Suites: 116 passed, 116 total
                                                   Tests: 1568 passed, 1568 total
```
Both from a bare `cd` into the worktree. No pre-existing failures were observed in
this worktree — the full suite is green. `packages/patina-design-system` and
`packages/aesthete-quiz` had no `dist/` in a fresh worktree and type-check cannot
run without them (`pnpm --filter @patina/design-system --filter @patina/aesthete-quiz build`).

## Tests added

- `components/threshold/__tests__/letterbox.test.tsx` — the studio line and the
  regarding line appear for a null-project row, appear for a titleless one as the
  line alone, and never appear for a house letter.
- `components/threshold/__tests__/earlier-invoices.test.tsx` — a studio letter kept
  behind the slot is listed and keeps its settle act.
- `components/threshold/__tests__/threshold.test.tsx` — the adopted-house merge; the
  house's own letter kept behind the studio's; a non-adopted house excluding studio
  rows; a house invoice never read as a studio one. Plus the whole `LetterboxDoor`
  block: letterhead + letter, the `?checkout=` return read on `/`, the empty-state
  fallback, drafts and house invoices never opening the door, and the hold.
- `lib/data/__tests__/active-project.test.ts` — a studio invoice resolving to the
  adopted (not last-moved) house; the one-house case the count rule would have
  skipped; refusal for another household and for an unreadable session; project
  invoices unchanged; a house outside the list refused; no read with no house.
- `app/__tests__/page.test.tsx` — zero houses opens the letterbox door; a client with
  a house that will not open still meets the empty state; `?invoice=` on a studio
  invoice opens the adopted house.

## Carried, not fixed

1. `useStudioIdentity` still takes only `projectId | designerId`; W1 added
   `p_studio_id` to `resolve_studio_identity` but did not thread it through the hook.
   The letterbox door and the print sheet therefore brand off the invoice's
   `designer_id`, which falls to `_primary_studio_for(designer)` — the wrong
   letterhead for a two-studio designer (risk 4 in the plan's register). A one-field
   addition to `packages/supabase/src/hooks/use-studio-identity.ts` closes it; it was
   outside this lane's file list.
2. `earlier-invoices.tsx` lists a studio letter as `Invoice No. NN · $x · due …` with
   no regarding line — indistinguishable from a house letter once folded open. The
   envelope in the slot says which it is; the folded lines do not.
3. `LetterboxDoor` treats a `void` studio invoice as nothing waiting (it uses
   `visibleInvoices`, the surface's own reader), so a household whose only studio
   invoice was voided meets the empty state rather than an unreadable letterbox.
4. The door reads `useClientInvoices()` client-side, so the zero-house front door
   decides after hydration rather than in the server render. It holds instead of
   flashing, but it is a hold the housed front door does not have.

deploySet: client portal.

---

## Fix round 1 — 2026-09-05

Three findings from the lane's adversarial review (C1 major, C2 major, C3 major),
all fixed. Carried items 1 and 2 above are now closed by C1 and C3.

### C1 · the letterhead came off the designer, not off the letter's own studio

`packages/supabase/src/hooks/use-studio-identity.ts` — `UseStudioIdentityParams`
gains `studioId`, passed as `p_studio_id`. 00571 gave the resolver that argument
precedence ("a studio invoice carries its own studio_id, so neither the project
nor the designer's primary studio is consulted"), and `database.types.ts` already
carries it; nothing was threading it. Without it a designer who belongs to two
studios — Kody does — signs a studio invoice with the other studio's name.

The query key widened from `['studio-identity', projectId ?? designerId]` to
`['studio-identity', { studioId, projectId, designerId }]`, because a caller that
names a studio AND a designer fallback must not read the answer cached for a
caller that named only one of them. `useUpdateOrganization` invalidates by the
`['studio-identity']` prefix, which is unaffected; no caller reads the exact key.

Call sites: `letterbox-door.tsx:70` and `app/invoices/[invoiceId]/print/page.tsx:32`
now pass `{ studioId: invoice.studio_id, designerId: invoice.designer_id }` — the
designer stays as the leg 00571 falls through to when the named studio is not an
active design studio.

### C2 · the merged list made household money read as owed on the adopted house

`deriveThreshold` sums every open invoice into the ledger, so merging the studio
letter into `invoices` made the adopted house state "Owed across 2 open invoices
$9,575 · soonest due 10 August" with no clause saying part of it was never drawn
against this house.

Ruled: KEEP it in the rollup, DISCLOSE it on the row. Dropping it would put the
letterbox and the ledger into disagreement — the letter standing in the slot,
settleable, with its money missing from the only figure the page states — which
is the one thing a money surface may not do. So `HouseLedgerModel` gains
`owedStudioCount` and the owed row's words carry the origin:

- all of them from the studio: `Owed on the open invoice from the studio, not for
  this house` / `Owed across N open invoices from the studio, not for this house`
- mixed: `Owed across N open invoices, one from the studio`
- none: unchanged.

### C3 · a folded studio line was indistinguishable from a house line

`earlier-invoices.tsx` gains `origin()`, keyed off `project_id === null`, carrying
the envelope's own clause onto the line:
`Invoice No. 31 · $450 · due August 20 · from the studio · not for a house`.
House lines are byte-identical to before.

### Tests

- `packages/supabase/src/hooks/__tests__/use-studio-identity.test.ts` (new, 4 cases):
  the rpc args for a studio + designer call, for a project call, the studio-alone
  enable and key, and the idle case.
- `components/threshold/__tests__/threshold.test.tsx`: the door asks for the
  letterhead by the letter's own studio; the adopted house's owed row discloses
  the studio letter; a non-adopting house's owed row does not.
- `components/threshold/__tests__/house-ledger.test.tsx`: the three owed-row
  branches, plus the unchanged all-house row.
- `components/threshold/__tests__/earlier-invoices.test.tsx`: the studio line's
  clause; a house line says nothing about the studio.
- `lib/threshold/__tests__/derive.test.ts`: `owedStudioCount` counted and not
  counted.
- Fixtures in `house-ledger.test.tsx` and `threshold-robustness.test.tsx` carry
  `owedStudioCount: 0`.

### Gates

```
pnpm --filter @patina/client-portal type-check   → clean
pnpm --filter @patina/client-portal test         → 116 suites, 1576 tests, all pass
pnpm --filter @patina/supabase type-check        → clean
pnpm --filter @patina/supabase test              → 85 files, 998 passed | 12 skipped
pnpm --filter @patina/designer-portal type-check → clean (shared-hook consumer)
```

### Still carried

- Items 3 and 4 above stand as written (both are deliberate, not defects).
- `earlier-invoices.tsx` hands `Settlement` the `designerName` prop the ADOPTED
  HOUSE's studio name when the row's own `designer` join is absent; for a studio
  letter drawn by a different studio of a two-studio designer, the check payee
  line could name the house's studio. The letterbox has the same shape. Not in
  the finding list; a `studio_id`-keyed payee is a separate ruling.
- The print sheet has no test suite in this repo (no `app/invoices/**/__tests__`),
  so C1's print-side change is covered at the hook boundary only.

## Fix round 2 — 2026-09-05

### R2-1 (major) · the plate named one studio over another studio's letter

`letterbox-door.tsx` resolved `useStudioIdentity` from `standing[0]`, while the
letter actually drawn in the slot is chosen by `Letterbox` itself: the
`?invoice=` named row if the address named one, else the soonest-due open row.
`useClientInvoices` orders `created_at desc`, so those two rows are unrelated —
a household holding letters from two studios could read one studio's plate over
the other studio's money. C1 fixed this class of error one level up (the
letterhead comes off the row's own `studio_id`, never off the designer's primary
studio); this is the same mistake made about *which row*.

The door now repeats the slot's own choice, over the same `letters` list it hands
`Letterbox` — named `?? open[0] ?? standing[0]` — and asks for the letterhead
with that row's `studio_id` / `designer_id`. Nothing else moved: the `open` memo
only shifted above the identity query so the choice can read it. The name is
resolved before the door is ever drawn (the door holds on
`invoicesQuery.isPending`, which outlasts `useNamedInvoice`'s effect), so no
frame paints the wrong plate; and `consumeNamedInvoice` is a latch that caches
its answer, so the door reading it does not starve `Letterbox`'s own read.

Files:

- `apps/client-portal/src/components/threshold/letterbox-door.tsx`
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx`

### Tests

Both new tests fail on the pre-fix body and pass on the fixed one — verified by
temporarily restoring `standing[0]`: `2 failed, 6 passed` → `8 passed`.

- *names the studio of the letter in the slot, not the newest letter's* — a paid
  letter from `studio-ash` stands first in the list, an open one from `studio-1`
  is in the slot; identity is asked for `studio-1`, never for `studio-ash`, and
  the doorplate reads "Middle West Studio".
- *follows the letter the address named to that letter's studio* — `?invoice=`
  names the later-due `studio-ash` letter; the plate reads "The Ash Studio" and
  the envelope's regarding line is that letter's.

The named-letter test unfolds the letter (the door's own behaviour), and
unfolding mounts `Settlement`, so `useInvoicePaymentOptions` / `useStartCheckout`
/ `useNotifyCheckIntent` were added to this suite's `@patina/supabase` factory
with inert defaults in the `LetterboxDoor` `beforeEach`. Settlement's own
behaviour stays `settlement.test.tsx`'s.

### Gates

```
pnpm --filter @patina/client-portal type-check
> tsc --noEmit            (clean, no output)

pnpm --filter @patina/client-portal test
Test Suites: 116 passed, 116 total
Tests:       1578 passed, 1578 total
Snapshots:   0 total
Time:        10.582 s
```

### Still carried

- The three items under "Still carried" in fix round 1 stand as written; none
  was in this round's finding list.
