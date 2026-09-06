# Carry lane — adversarial review, round 1

**Reviewer:** separate context; did not write this code.
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
(`git rev-parse --show-toplevel` → that path), branch `studio-invoices/integration`.
**Range reviewed:** `e0daf3863..HEAD`, head `bcc4fdecdefed503fc25d40691dfe3ab9236a8fe`.

```
bcc4fdecd docs(studio-invoices): W2 wave report — the Carry section
4be21baea fix(designer): guest studios out of the composer, bound the regarding line, tell a studio void the truth
bf25750fa fix(client): resolve the letterbox payee from the letter, not from the house
```

```
 apps/client-portal/.../__tests__/earlier-invoices.test.tsx  | 47 +++++++
 apps/client-portal/.../__tests__/letterbox.test.tsx         | 84 ++++++++++++
 apps/client-portal/.../__tests__/threshold.test.tsx         | 41 +++++++
 apps/client-portal/.../threshold/earlier-invoices.tsx       | 45 ++++++--
 apps/client-portal/.../threshold/letter-payee.ts            | 38 ++++++ (new)
 apps/client-portal/.../threshold/letterbox.tsx              | 15 +--
 apps/designer-portal/.../__tests__/invoice-composer-studio.test.tsx | 72 ++++++++
 apps/designer-portal/.../accounts/__tests__/invoice-folio.test.tsx  | 37 +++++
 apps/designer-portal/.../accounts/invoice-composer.tsx      |  2 +
 apps/designer-portal/.../accounts/invoice-folio.tsx         |  6 +-
 apps/designer-portal/.../document/__tests__/invoice-composer.test.ts | 39 +++++
 apps/designer-portal/src/lib/document/invoice-composer.ts   | 17 ++-
 artifacts/.../build/waves/w2/wave-report.md                 | 42 +++++++
 13 files changed, 463 insertions(+), 22 deletions(-)
```

## Verdict — **ship** (no blocker, no major)

All four briefed items are delivered, each with tests in the suite that already
covers the neighbouring code. No money-path, RLS or homeowner-copy defect. No
migration touched (correct — out of scope), no stack command run, nothing outside
the four items changed.

## Gates — run by the reviewer

```
pnpm --dir <wt> --filter @patina/client-portal type-check
> tsc --noEmit                                        (no output — clean)

pnpm --dir <wt> --filter @patina/client-portal test
Test Suites: 116 passed, 116 total
Tests:       1582 passed, 1582 total

pnpm --dir <wt> --filter @patina/designer-portal type-check
> tsc --noEmit                                        (no output — clean)

pnpm --dir <wt> --filter @patina/designer-portal test -- accounts composer
FAIL src/components/document/__tests__/client-note-composer.test.tsx
PASS src/components/document/accounts/__tests__/accounts-studio-rows.test.tsx
PASS src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx
PASS src/components/document/accounts/__tests__/invoice-folio.test.tsx
PASS src/components/document/accounts/accounts-query-states.test.tsx
PASS src/components/document/coordination/__tests__/item-composer-party.test.tsx
PASS src/components/document/schedule/__tests__/milestone-composer.test.tsx
PASS src/lib/document/__tests__/invoice-composer.test.ts
Test Suites: 1 failed, 7 passed, 8 total   Tests: 1 failed, 96 passed, 97 total

pnpm --dir <wt> --filter @patina/designer-portal test        (shared lib changed)
Test Suites: 1 failed, 512 passed, 513 total
Tests:       1 failed, 6147 passed, 6148 total
```

The single red suite is **not this lane's** and is not a regression:
`client-note-composer.test.tsx:479` asserts the literal
`"Taken down Sep 4. It moves to Previously."`; `git blame` puts that line on
`ffb9cff6f9 (2026-09-04)`, a commit that predates the lane base `e0daf3863`, and
the file appears nowhere in the carry diff. This is the report's own **W2-A4**
advisory. Advisory, not blocking.

## Item-by-item

| # | brief item | state | proof |
|---|---|---|---|
| 1 | R3-1 + R3-12 — payee off the letter | **delivered** | new `letter-payee.ts` `useLetterPayee(row, fallback)` resolves `useStudioIdentity({studioId: row.studio_id, projectId: row.project_id, designerId: row.designer_id})`, the 00571 precedence `letterbox-door.tsx:95` uses; `letterbox.tsx:196` takes `studio` from it (was `designerName?.trim() || row.designer…`); `earlier-invoices.tsx:101-127` `FoldedSettlement` resolves per folded letter. `useClientInvoices` selects `*` (`use-invoices.ts:504`), so `studio_id`/`designer_id` are really on the row — the fix is not resolving off fields the query never returns. Tests: `letterbox.test.tsx` +2, `earlier-invoices.test.tsx` +1, `threshold.test.tsx` +1 (plate `Quist Interiors`, check `The Ash Studio`). |
| 2 | F-F8 — guest memberships out of the list | **delivered** | `invoice-composer.ts:210-221` adds `o.membership?.role !== 'guest'` and an active-status leg; the W-1 `.sort(name, id)` is untouched. Shape verified against the real hook: `use-organizations.ts:176-182` builds `membership: {id, role, status, joined_at}` and `MemberRole` (`:19`) includes `'guest'` — the filter matches production data, not just the fixture. Mirrors 00571's own rule (`00571_studio_invoices.sql:856-862`, `insufficient_privilege`). Tests +3 pure, +3 component. |
| 3 | F-R2-3 — bound the regarding line | **delivered** | `invoice-composer.tsx:510` `maxLength={200}`; 00571 refuses at `char_length(p_title) > 200` (`00571:889`). `char_length` counts characters and JS `maxLength` counts UTF-16 units, so the field is never looser than the RPC. Test asserts the attribute. |
| 4 | W-5 — studio void copy | **delivered** | `invoice-folio.tsx:313-317` keys the result note on `documentProjectId` (`:182` = `invoice.project_id`), exactly as the confirm copy at `:817` already was. Two tests (studio note, house note unchanged). |

Homeowner-facing strings: the diff adds none. No badge, count chip, red/green, check
icon, shadow, tab, emoji, "AI", "gate", "task", "dashboard" or "overdue" enters any
surface. Designer copy uses "studio invoice"; "ad-hoc" is still only the line kind.

## Findings — every one, unfiltered

### C1 · minor (0.9) — the brief's literal test says "the plate names B"; the delivered plate names A, on purpose
`apps/client-portal/src/components/threshold/threshold.tsx:278` is **unchanged**
(`useStudioIdentity({ projectId })`), and the new test asserts
`expect(screen.getByTestId('doorplate-line')).toHaveTextContent('Quist Interiors')`
— the HOUSE's studio — while only the check panel names the letter's studio.
The brief's item 1 reads "…→ the plate names B". Two readings; the implementer
took "plate" as the payee plate and said so in wave-report §7 ("`threshold.tsx` is
unchanged: the doorplate, the note and the mat still name the HOUSE's studio, which
is right"). The mockup supports the delivered choice — M5(a) draws the adopted
house's plate as `Hollis House / Middle West Studio · Madison` with the letter
carrying its own line "From the studio · not for a house" — and the R3-1 finding
text itself scopes the defect to the payee ("only the displayed name is wrong").
**No fix recommended**; flagged so the orchestrator rules rather than discovers it.

### C2 · minor (0.85) — the new void note contradicts the confirm copy the other way
`invoice-folio.tsx:817` (and M7, verbatim) tells the designer *"Voiding **keeps the
number** and marks the invoice void."* Two seconds later `:315` now says
*"invoice voided · **the number retired**, the letter withdrawn"*. W-5 was a
confirm/result contradiction; this substitutes a different one, and "retired"
also contradicts the deck. The brief dictated the wording, so this is off-deck,
not off-brief. A note that says only what the confirm promised — e.g.
`invoice voided · the letter withdrawn, nothing else released` — closes both.
Designer-facing only.

### C3 · minor (0.8) — a designer whose only design studios are guest memberships now hits a silent dead end
`studioChoiceAvailable` is flag-only (`invoice-composer.tsx:115-117`), so
"the studio · no house" is still offered; with every membership dropped,
`studios` is empty, `studioId = chosenStudioId || studios[0]?.id || ''` (`:181`)
is `''`, and `canDraftStudioInvoice` requires a studio (`invoice-composer.ts:238-245`),
so Draft never enables and **nothing explains why** — `multiStudio` is false, so no
studio line renders either. Before this fix the draw at least produced the R83 band.
Rare shape, no data risk. No test covers the empty-list case.
Cheap remedy: hide the houseless option (or state the reason in the R83 band) when
`studios.length === 0`.

### C4 · nit (0.9) — the membership filter is fail-open, and its status leg is dead
`o.membership?.role !== 'guest'` and `(o.membership?.status ?? 'active') === 'active'`
both keep a row whose `membership` is missing, and the composer feeds the list
through a structural cast (`invoice-composer.tsx:177`, `as ComposerStudio[]`), so
TS proves nothing about the runtime shape. Harmless today: `useOrganizations`
always builds `membership` and already filters `.eq('status','active')`
(`use-organizations.ts:167`), which also makes the status leg unreachable in
production. Noted because the DB rule it mirrors is fail-closed.

### C5 · nit (0.85) — a second identity RPC on every client page view, and a cache key that can never hit
`useLetterPayee` runs on every mounted `Letterbox`, including plain house letters,
under key `['studio-identity', {studioId, projectId, designerId}]`, which can never
match Threshold's `['studio-identity', {projectId}]` (`threshold.tsx:278`). Every
homeowner house view now issues one extra `resolve_studio_identity` for an answer
the page already holds. It also diverges from the print route, which passes
`projectId` alone when a project exists (`invoices/[invoiceId]/print/page.tsx:34-38`)
— two precedence shapes for the same question.

### C6 · nit (0.7) — no held render on a money surface, unlike the door
`letterbox-door.tsx:114` deliberately holds while `identityQuery.isPending`
("A door that renders the empty state and then grows a letter is the one reversal a
money surface may not perform"). `useLetterPayee` has no equivalent: for a studio
letter in an adopted house the payee reads the fallback (the HOUSE's studio) until
the RPC lands, then flips. The query starts at `Letterbox` mount and the check panel
is two clicks away, so the window is small; on an RPC error the old (wrong) name is
what stands, which is no worse than before the fix.

### C7 · nit (0.9) — the `row.designer` fallback leg is dead on both paths that use it
`letter-payee.ts:31-33` falls back to `row.designer.full_name/business_name`, but
neither `useProjectInvoices` (`use-invoices.ts:479`) nor `useClientInvoices`
(`:504`) embeds `designer` — only `useInvoice` does (`:448`), which the letterbox
never calls. Harmless; the comment implies a live precedence that cannot fire.

### A1 · advisory (1.0) — the one red designer suite is pre-existing
`client-note-composer.test.tsx:479`, blamed to `ffb9cff6f9 (2026-09-04)`, asserts a
date literal that only passes on the day it was written. Not in the carry diff,
fails identically at the lane base. Same as the report's W2-A4. Never blocks.

## Checks that came back clean

- Hook rules: `useLetterPayee` sits at `letterbox.tsx:196` with no top-level early
  return above it (`awk '/^  return|^  if \(/'` over lines 120-200 → no output);
  `FoldedSettlement` is a component, and `settling` is a single id, so at most one
  is ever mounted — no hook in a loop.
- `useStudioIdentity` really accepts `studioId` and gates
  `enabled: !!(studioId || projectId || designerId)`
  (`packages/supabase/src/hooks/use-studio-identity.ts:37-77`) — no query fires for a
  null row.
- Remittance is untouched: `payment-method-chooser.tsx:166-170` still prints
  `checkRemitTo` from `get_invoice_payment_options`; `designerName` only names who is
  notified. No money value, cents handling, status write or webhook path is in the diff.
- `activeDesignStudios` has exactly one non-test call site, so the tightened filter
  cannot narrow an unrelated list.
- Wave-report §7's counts and gate numbers reproduce exactly (116/1582, 512/513,
  6147/6148, 7-of-8), and its test tally (+2/+1/+1/+3/+3/+2) matches the diff.
