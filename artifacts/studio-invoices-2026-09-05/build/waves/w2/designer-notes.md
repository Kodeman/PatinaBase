# W2 · Designer portal — studio invoices (R136)

Lane: `studio-invoices/w2-designer`, worktree `.codex/worktrees/agent-si-designer`, branched from
`studio-invoices/integration` @ `3a54d8743`. Deploy set: **designer portal**.

## What W1 had already landed (confirmed, not redone)

- `Invoice.project_id: string | null` + `Invoice.title: string | null`; `useCreateDraftStudioInvoice`
  (returns the new invoice id as a bare `string`), `useClientInvoices`.
- Portal null-safety already in place: `invoice-folio.tsx` passes `projectId: invoice.project_id ?? undefined`
  into all five mutations and guards the `document ↗` doorway; `invoice-overlays.tsx` guards
  `router.push('/doc/…')`; ledger/receivables already read `project?.name ?? title ?? 'Studio'`;
  `desk-receivables.ts` already `continue`s on a null `project_id` and carries three tests for it
  (`lib/document/__tests__/desk-receivables.test.ts` — deliverable 3 was confirmation only, no new case needed).

## What this lane changed

**`src/lib/document/invoice-composer.ts`** — the pure twin. `STUDIO_TARGET` (`'__studio__'`, the select's
sentinel), `activeDesignStudios()` (the S8 rule: `type === 'design_studio' && status === 'active'`),
`canDraftStudioInvoice()` = household + non-blank title + a studio + ≥1 assembled line.

**`src/components/document/accounts/invoice-composer.tsx`** — the section formerly labelled *the document*
is labelled **for** and its select carries **"the studio · no house"** ahead of the houses, both only when
`useFeatureFlag('studio-invoice')` resolves `{ value: true, isLoading: false }` AND the opener did not name a
project. Flag off or still loading → the composer is byte-identical to today (`the document`, `aria-label="Project"`).
Choosing the studio hides milestones / unbilled time / FF&E (they are house-bound, S6 — and the selection memo
returns an adhoc-only shape in studio mode, so no stale tick can reach the RPC), and shows: a **studio** select
only when `activeDesignStudios()` returns >1 (S8; otherwise the single studio is used silently), a **household**
`ClientPicker` (S4, R73 inline add), a required **regarding** input (S12), then the composer's existing ad-hoc
grid / tax / terms(15) / memo / totals / `DocumentAction actionKey="draft-invoice"` / R83 band — all unchanged.
Draft calls `useCreateDraftStudioInvoice` and hands `onDrafted(invoiceId, null)`.

**`src/components/document/accounts/invoice-overlays.tsx`** — `InvoiceComposerContext` gains `mode?: 'studio'`
(honoured only while the flag is on); `onDrafted`'s second parameter is now `string | null`.

**`src/components/document/accounts/accounts-ledger-page.tsx` / `accounts-receivables-page.tsx`** — the house
column reads `project?.name ?? title` followed by a small mono `<Stamp label="studio" color="var(--color-clay-ink)" />`
when `project_id === null` (M2/M4), and the `document ↗` doorway does not render on those rows.

**`src/components/document/accounts/invoice-folio.tsx`** — head line reads `household · project?.name ?? title · status`
(M3). The doorway guard and the `?? undefined` mutation args were already W1's.

**`src/components/portal/client-picker.tsx`** — one additive optional prop, `popoverClassName`, merged into the
Radix popover panel's class. Default behaviour is unchanged for all five existing hosts.

**`docs/design/the-document/DECISIONS.md`** — R136 appended (last id was R135).

## The one judgement call worth reviewing: ClientPicker layering

`draft-proposal-opener.tsx:27-45` records the lesson that the picker's popover portals to `<body>` at `z-50`
and must not out-number its host — the fix there was to bring the host *down* into the `z-50` band so DOM order
settles the stack. That is not available here: the composer's host, `PaperFolioSheet`, is `z-[60]` by design
(above DocSheet `z-50` and RoomSheet `z-55`), so at `z-50` the picker's panel would paint *behind* the sheet and
the household field would be mouse-dead. The house already has a precedent for exactly this case —
`components/document/date/folio-popover.tsx:48` sets `PANEL_Z = 70`, commented "clear of DocSheet (z-50),
RoomSheet (z-55) and PaperFolioSheet (z-[60])". So the composer passes `popoverClassName="z-[70]"`. The prop is
opt-in; the picker's default stays `z-50` and no existing host moves.

## Deviation from the brief, stated plainly

The brief asked for a `DocumentAction actionKey="choose-studio-invoice"` for the choice. The choice is made in a
native `<select>` (that is what "the select gains a first option" requires), and a `DocumentAction` is a button —
the two cannot both be true. The composer therefore fires the *same analytics pair* `DocumentAction` fires, by
hand and with the same isolate-and-log guard: `documentEvents.actionShown` once when the option becomes
available, `documentEvents.actionSelected` when it is chosen, both with
`{ surface_key: 'accounts', region_key: 'invoice-composer', action_key: 'choose-studio-invoice', variant: 'secondary', presentation: 'inline' }`.
No new analytics module; no new registry entry.

## Tests

- `src/lib/document/__tests__/invoice-composer.test.ts` — extended: `canDraftStudioInvoice` (5 branches:
  ready / no household / blank+whitespace title / no studio / no line), adhoc-only assembly, `activeDesignStudios`
  (manufacturer and deactivated org rejected; the two-studio case), `STUDIO_TARGET`.
- `src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx` (new, 9 tests) — fail-closed while
  `isLoading`, hidden with the flag off (label still reads "the document"), never offered to a project-scoped
  opener; studio mode hides the three pull-throughs and shows household + regarding; studio line silent at one
  studio and present at two; the Draft act stays disabled until all three are present; the RPC payload asserted
  exactly (trimmed title, resolved studioId, `paymentTermsDays: 15`, one adhoc line) and `onDrafted(id, null)`;
  the R83 band renders the refusal inline with "Try again".
- `src/components/document/accounts/__tests__/accounts-studio-rows.test.tsx` (new, 3 tests) — ledger studio row
  carries the regarding line + `studio` stamp and no doorway while the house row keeps both; receivables studio
  row same, and keeps its "Send reminder" chase.
- `src/components/document/accounts/__tests__/invoice-folio.test.tsx` — the existing studio test now also asserts
  the head reads `Client Example · Design consultation, September · draft`.

## Gates

```
pnpm --filter @patina/designer-portal type-check   → clean (tsc --noEmit, no output)
pnpm --filter @patina/designer-portal test         → 512/513 suites, 6132/6133 tests pass
npx eslint <the five changed source files> + accounts/__tests__/  → clean
```

The single failure is **pre-existing and clock-dependent, not this lane's**:
`src/components/document/__tests__/client-note-composer.test.tsx:479` expects
`"Taken down Sep 4. It moves to Previously."` while `client-note-composer.tsx:326` renders
`` `Taken down ${fmtDay(new Date().toISOString())}` `` — today is 2026-09-05, so it renders "Taken down Sep 5".
Neither file is touched by this lane (`git status` confirms), and it imports nothing this lane changed.
Fix belongs to whoever owns that suite: inject the clock, or freeze it with `jest.setSystemTime`.

## Not done here (by design)

- No Desk need line for an overdue studio invoice (S9 — v1 chases from Receivables).
- No registry / ⌘K / Contents entry — the existing `draw-invoice` verb is the only door (S3), so the
  registry, hierarchy and desk-action-label contract tests are untouched and green.
- The composer's standing lede still reads "Everything billable pulls through below", which is true of a house
  and not of the studio. Left as-is: it was not in scope and the mockup does not draw it. Worth a copy pass.

## Fix round 1

**F1 (major) — void-panel copy, `invoice-folio.tsx`.** Fixed. The panel's paragraph is now branched on
`documentProjectId` (the same `invoice.project_id` the doorway is gated on, read at :182). A house invoice
keeps the unchanged sentence; a studio invoice reads the M7 line, plus the "This cannot be undone." clause
the house copy already carried:

> Voiding keeps the number and marks the invoice void. Nothing else is released; a studio invoice holds no
> milestones or time. This cannot be undone.

The review's tension is resolved the way M7 draws it: "acts unchanged" in the brief means the act row and the
mutations are unchanged (they are — `doVoid` and the `Void`/`Void invoice` buttons are untouched); the panel's
prose is a visible surface M7 explicitly branches, and no other lane owns this file.

Two tests added to `accounts/__tests__/invoice-folio.test.tsx`: one opens the panel on a `project_id: null`
invoice and asserts the studio sentence plus the absence of `/payment milestones and time entries/`; the twin
opens it on the base (house) fixture and asserts the original sentence, so a future edit cannot silently
collapse the branch to one string.

### Gates, round 1

```
pnpm --filter @patina/designer-portal type-check   → clean (tsc --noEmit, no output)
pnpm --filter @patina/designer-portal test         → Test Suites: 1 failed, 512 passed, 513 total
                                                     Tests:       1 failed, 6134 passed, 6135 total
```

The one failure is the same pre-existing clock-dependent `client-note-composer.test.tsx:479` documented above
(it wants "Sep 4"; today is Sep 5). `git diff studio-invoices/integration -- <that test> <that component>` is
empty — this lane never touched either file. Lane suites alone:

```
jest --testPathPattern "invoice-folio|invoice-composer|accounts-studio-rows|desk-receivables"
Test Suites: 5 passed, 5 total
Tests:       43 passed, 43 total
```
