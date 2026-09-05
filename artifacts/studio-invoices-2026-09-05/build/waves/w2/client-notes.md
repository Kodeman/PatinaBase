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
