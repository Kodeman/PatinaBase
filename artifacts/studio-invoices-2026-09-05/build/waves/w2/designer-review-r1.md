# W2 · designer lane — adversarial review, round 1

Reviewer: separate context, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-designer`
(`git rev-parse --show-toplevel` confirmed), branch `studio-invoices/w2-designer`,
base `3a54d87432af4f9f6ce9c6a2cab943b3c7ff1656`.

```
c4be840de docs(designer): R136 — studio invoices, an invoice with no house
77f29cb76 feat(designer): read a studio invoice on the ledger, receivables and folio (R136)
15c8efa33 feat(designer): draw a studio invoice from the composer (R136)
 13 files changed, 1054 insertions(+), 213 deletions(-)
```

**Verdict: fix** — no blocker, one major (M7's void copy), nine minor/nit, two advisories.

## Gates I ran myself

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                   (no output — clean)

$ pnpm --filter @patina/designer-portal test
Test Suites: 1 failed, 512 passed, 513 total
Tests:       1 failed, 6132 passed, 6133 total

$ npx jest invoice-composer accounts-studio-rows desk-receivables invoice-folio   (in apps/designer-portal)
Test Suites: 5 passed, 5 total
Tests:       41 passed, 41 total

$ npx eslint <the 7 changed source files> + the two __tests__ dirs
(no output — clean)
```

The single red suite is **not this lane's**: `client-note-composer.test.tsx:479` asserts
`"Taken down Sep 4. It moves to Previously."` while `client-note-composer.tsx:326` renders
`` `Taken down ${fmtDay(new Date().toISOString())}` ``. Today is 2026-09-05 → "Sep 5". Neither
file is in the lane diff. Independently reproduced and root-caused (see A1).

## Brief items, traced

| # | Item | Verdict |
|---|---|---|
| 1 | composer "for" + studio option + studio/household/regarding + adhoc/tax/terms/memo/totals + `draft-invoice` + canDraft twin + `useCreateDraftStudioInvoice` + `onDrafted(id, null)` + R83 band + `choose-studio-invoice` analytics | delivered; the analytics ride is a hand-fired `documentEvents` pair rather than a `DocumentAction` (a `<select>` option cannot be a button) — documented deviation, house guard style copied verbatim from `document-action.tsx:217-222` |
| 2 | ledger + receivables rows (title + mono `studio` Stamp, no doorway); folio head household · title · status, no doorway, acts unchanged | delivered — except M7's void copy (F1) |
| 3 | `desk-receivables.ts` skips studio invoices, test case | confirmed at base (W1 shipped both the `continue` at `:71` and three tests); nothing owed |
| 4 | R136 appended to DECISIONS.md | delivered — last id was R135, footer convention `*Entries add: R136 · last id = R136*` matches the six entries above it |
| 5 | tests in the neighbouring suites; registry/hierarchy/desk-action-label contracts stay green | delivered — 41 tests across the five suites; no registry entry added, contracts untouched and green in the full run |

## Findings

### F1 · major · confidence 0.8 — the void panel still promises to release milestones and time on a studio invoice
`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx:812-815`
```
Voiding releases any linked payment milestones and time entries so they can be billed
again. This cannot be undone.
```
M7 (`proposal.html:551-558`) draws this panel explicitly for a studio invoice —
*"Voiding keeps the number and marks the invoice void. Nothing else is released; a studio
invoice holds no milestones or time."* — and its caption states the rule: *"The house-invoice
void copy says milestones and time entries are released… A studio invoice has neither, so its
copy says only what is true."* The copy is unbranched, so a designer voiding INV-0031 is told
something false about her own invoice. Tension to note for synthesis: brief item 2 says "acts
unchanged", which may have been read as covering the panel copy — but M7 is in this lane's named
mockup set and no other lane owns `invoice-folio.tsx`.
**Fix:** branch on `invoice.project_id === null`, plus a case in `invoice-folio.test.tsx`.

### F2 · minor · confidence 0.95 — the sheet's lede is false in studio mode
`invoice-composer.tsx:432-435` — "Everything billable pulls through below — tick what this
invoice should carry, in any order." In studio mode nothing pulls through and there is nothing
to tick. Self-declared in the lane notes ("Worth a copy pass") and left. One ternary.

### F3 · minor · confidence 0.9 — "Pick a document…" under the "for" label
`invoice-composer.tsx:453` — with the flag on, the section is labelled *for* and offers a
non-document as its first option, while the empty option still reads "Pick a document…".

### F4 · minor · confidence 0.85 — `useOrganizations()` fires on every composer open
`invoice-composer.tsx:120`. The hook carries an `enabled` option added for exactly this case
(`use-organizations.ts:145-149`: "lets a caller behind a feature flag hold the query back
entirely rather than fetching and discarding the result"). Today every designer who opens the
composer — flag off, project-scoped, all of them — pays for an `organization_members` round
trip that only studio mode reads. `useOrganizations({ enabled: studioChoiceAvailable })`.

### F5 · minor · confidence 0.95 — the analytics pair has no test
`STUDIO_CHOICE_EVENT` (`invoice-composer.tsx:87-93`, fired at `:253` and `:272`) is the one
behaviour the brief names by action key and the only one with no assertion.
`invoice-composer-studio.test.tsx` does not mock or spy `documentEvents`.

### F6 · minor · confidence 0.7 — a dead Draft act when no active design studio resolves
`invoice-composer.tsx:180` `studioId = chosenStudioId || studios[0]?.id || ''` and `:335`
`canDraftStudioInvoice` requires it. Before `useOrganizations` settles — and permanently for a
designer whose only orgs are non-`design_studio` or non-`active` — "Draft the invoice" is
disabled with nothing said. R83's grammar is that a refusal is spoken at the act site.

### F7 · minor · confidence 0.8 — `context.mode: 'studio'` is incoherent when the flag is off
`invoice-composer.tsx:105-117`: `target` seeds to `STUDIO_TARGET` from `context.mode`, but
`studioMode` also requires `studioChoiceAvailable`. Flag off/loading → the select is controlled
to a value with no matching `<option>` (blank), and `(studioMode || projectId)` is false so the
whole body is missing. Recovers when a project is picked. No caller passes `mode` today
(`grep openInvoiceComposer(` — 11 call sites, none set it), so it is latent; the field was
required by the brief. Seed `target` only when the choice is actually available.

### F8 · minor · confidence 0.7 — a `guest` membership is offered in the studio select
`activeDesignStudios()` filters on the organization (`type`/`status`); `useOrganizations`
filters membership `status`, not `role`. `00571_studio_invoices.sql:826, 861-869` and the
trigger arms (`:146, :163, :181, :260`) all require `role <> 'guest'`, so choosing such a studio
fails in the RPC and surfaces as a raw wrapped Postgres message in the R83 band. Narrow (needs
≥2 studios, one of them guest) but cheap to exclude.

### F9 · nit · confidence 0.9 — "overdue" survives on the row the lane rewrote
`accounts-receivables-page.tsx:180` `overdue ? `${days}d overdue` : 'within terms'`. M4 draws
"18 days past" and this program's refusal list names "overdue" (say "past due"). Pre-existing,
designer-facing (not homeowner copy), but the lane reflowed this exact expression to make room
for the stamp and left the word.

### F10 · nit · confidence 0.8 — the R83 band shows a wrapped DB error, not M7's sentence
`use-invoices.ts:811-814` throws `Failed to create draft studio invoice: <pg message>`, which
the band renders in uppercase mono. M7 draws "The draft didn't take. The household isn't on this
studio's roster yet; pick them again or add them." Consistent with the house invoice path today,
so this is mockup-vs-consistency, not a regression.

### F11 · nit · confidence 0.5 — the stamp inside a `truncate` line is unverified in a browser
`accounts-ledger-page.tsx:132-138`, `accounts-receivables-page.tsx:172-178`: `<Stamp>` is
`inline-block`, `-rotate-[1.5deg]`, `px-[9px] py-[3px]`, dropped inside a `truncate` (nowrap +
overflow-hidden) 11px mono line. jsdom cannot see clipping or a baseline bump. Eyes on it during
the ship walk.

## Advisories (never block)

**A1 · the full designer jest cannot be green on any day but 2026-09-04.**
`client-note-composer.test.tsx:479` hardcodes "Sep 4" against `client-note-composer.tsx:326`'s
`new Date()`. Owner: whoever owns that suite (`jest.setSystemTime`, or inject the clock). Every
lane in this program will keep reporting 512/513.

**A2 · the ClientPicker `z-[70]` bump is sound; I checked the mechanism rather than trusting it.**
`draft-proposal-opener.tsx:38-41` says "deliberately no z-index bump on the popover", which reads
at first like a house rule this lane broke. It is not, and the lane's reasoning holds:
- `PaperFolioSheet` is `createPortal(…, document.body)` at `z-[60]` with a *separate* absolutely
  positioned scrim (`paper-folio-sheet.tsx:76-88`) — i.e. already the safe shape that opener
  describes; the `z-50` picker would paint *behind* the scrim and be mouse-dead.
- `PopoverPrimitive.Portal` is in use (`client-picker.tsx:271`), so the panel is a body sibling
  of the sheet, and `@radix-ui/react-popper/dist/index.mjs:139-153` copies the content's computed
  z-index onto the positioner wrapper — so `z-[70]` on Content really does lift the whole portal.
- `cn` is `twMerge(clsx(...))` (`lib/utils.ts:6-8`), so `z-50` is dropped, not fighting `z-[70]`.
- Esc does not tear the sheet down: `@radix-ui/react-use-escape-keydown` listens in **capture**
  phase and `react-dismissable-layer/dist/index.mjs:59-66` calls `event.preventDefault()` before
  dismissing, so `PaperFolioSheet`'s bubble-phase guard (`if (e.defaultPrevented) return`) bails.
- Precedent exists: `date/folio-popover.tsx:50` `PANEL_Z = 70` for a panel opened inside this
  same sheet. The prop is opt-in; the five existing hosts keep `z-50`.

**A3 · no browser walk was performed.** The lane's logic is covered in jsdom (41 tests), but the
picker's layering inside the folio sheet, the stamp's line box (F11) and the flag's
no-flash-while-loading behaviour are browser-only. A signed-in walk of
`/desk?book=accounts&page=ledger` → "Draw an invoice" with `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:true`,
and once more with it false, belongs to the ship step.

## What I checked and found correct (no finding)

- **Fail-closed flag.** `use-feature-flag.ts:118-119` seeds `value=false, isLoading=true`, and
  `studioChoiceAvailable` additionally requires `!flagLoading` and `!context.projectId`. Asserted
  in three tests (loading / off / project-scoped opener).
- **S6 line isolation.** The `selection` memo (`invoice-composer.tsx:286-299`) returns an
  adhoc-only shape in studio mode, so no stale tick can reach the RPC even if state survived.
- **The RPC contract end to end.** Hook named args (`use-invoices.ts:798-808`) match
  `00571_studio_invoices.sql:772-780` exactly; the per-line key set
  `kind/description/quantity/unit_amount_cents/metadata/sort_order` matches the RPC's allowlist
  (`00571:~903-907`), `metadata` defaults to `{}` (`buildLineRow:326`) which passes both the
  `jsonb_typeof` and forbidden-key checks; `kind` is forced to `'adhoc'`.
- **Money.** Integer cents throughout (`dollarsToCents`), `taxRate` a fraction exactly as the
  house path, `paymentTermsDays` NaN → 15. No status writes, no rollup writes, nothing near the
  webhook.
- **Null-safety sweep.** Every remaining `project_id` deref in the portal is guarded
  (`invoice-folio.tsx:182/210/219/247/287/310`, both accounts pages, `desk-receivables.ts:71`).
- **D4 zero shadows.** `git diff … | grep -c "^+.*shadow"` → `0`.
- **Refusals.** No homeowner-facing string is added by this lane; every new string is designer
  copy, and it uses the prescribed vocabulary ("studio invoice", "the studio · no house",
  "ad-hoc lines").
- **Repo hygiene.** Three commits, Conventional subjects, no trailers, explicit pathspecs, no
  stray files, nothing pushed; `designer-notes.md` landed under the gitignored `build/` via
  `git add -f`.
- **Diff size.** `invoice-composer.tsx` reads as 557 changed lines but is 217 whitespace-
  insensitive (`git diff -w`): the rest is re-indentation from wrapping the three pull-through
  sections in `{!studioMode && (<>…)}`. No gratuitous reformatting.
