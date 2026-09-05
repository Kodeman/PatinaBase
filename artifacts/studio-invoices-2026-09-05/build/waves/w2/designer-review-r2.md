# W2 designer lane — adversarial review, round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-designer`, branch `studio-invoices/w2-designer`.
Diff reviewed: `3a54d87432af4f9f6ce9c6a2cab943b3c7ff1656..HEAD` (5 commits, 14 files, +1307/−215).

```
$ git -C <wt> rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-designer
$ git -C <wt> branch --show-current
studio-invoices/w2-designer
$ git -C <wt> log --oneline 3a54d874..HEAD
50d133584 fix(designer): tell a studio invoice the truth in the void panel (R136)
0999ba55a docs(studio-invoices): W2 designer lane adversarial review, round 1
c4be840de docs(designer): R136 — studio invoices, an invoice with no house
77f29cb76 feat(designer): read a studio invoice on the ledger, receivables and folio (R136)
15c8efa33 feat(designer): draw a studio invoice from the composer (R136)
```

## Gates (run in this worktree)

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit          (clean, no output)

$ pnpm --filter @patina/designer-portal test
Test Suites: 1 failed, 512 passed, 513 total
Tests:       1 failed, 6134 passed, 6135 total
Snapshots:   1 passed, 1 total
Time:        40.961 s
```

The single failure is `client-note-composer.test.tsx:479` — `getByText("Taken down Sep 4. It moves to Previously.")` against a live `new Date()`; today is 2026-09-05. Neither that spec nor its component appears in this lane's diff. Advisory A1, unchanged from r1; it never blocks this program.

## Browser walk (new this round — r1 had none)

A dev server was started in this worktree on :3009 against the local stack
(`NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:true` plus the `playwright.config.ts`
webServer env), driven with Playwright, then killed. Local ledger tip is `00571`,
`create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)` resolves, and
`invoices.project_id` is nullable — so the walk exercised the real rail. No stack commands
were run. Two draft studio invoices the walk created were deleted afterwards
(`DELETE 2` / `DELETE 2`, `select count(*) from invoices where project_id is null` → 0).

What the walk proved:

- Flag on, no project-scoped opener → the "for" select carries exactly
  `["Pick a document…", "the studio · no house"]`.
- Choosing it renders household · regarding · ad-hoc lines · tax · terms · memo · totals ·
  Draft, with milestones/time/FF&E gone (screenshot `3-studio-mode.png`).
- As `designer@patina.dev` (two active `design_studio` rows in the local DB) the studio line
  renders: `select[aria-label="Studio"]` count 1, options `["Leah Hartwell","Local Dev Studio"]`
  — S8 holds.
- Draft → the RPC → the folio, whose head reads
  `CLIENT USER · DESIGN CONSULTATION · 12 SEPT 2026 · DRAFT` with no `document ↗` and acts
  `ISSUE & SEND` / `VOID` (screenshot `6-after-draft.png`). M3 satisfied.
- The `ClientPicker` panel portals above the composer sheet: wrapper computed
  `z-index: 70`, `elementFromPoint` at the panel's top returns `picker-on-top`. Advisory A2
  from r1 is now empirically confirmed, not just reasoned.

## Round-1 findings — status

| id | status |
|---|---|
| F1 void-panel copy (major) | **FIXED** in `50d133584`, branched on `documentProjectId`, with a studio case and a house twin in `invoice-folio.test.tsx`. Verified against M7's wording. |
| F2 lede false in studio mode | open — and now visible in `3-studio-mode.png` |
| F3 "Pick a document…" placeholder | open — the walk read the option list verbatim |
| F4 `useOrganizations()` ungated | open |
| F5 `choose-studio-invoice` analytics untested | open |
| F6 studio-less designer gets a dead act | open — **now reproduced in a browser**, see R2-1 |
| F7 `context.mode` seeds past the flag | open (latent; no caller passes `mode`) |
| F8 a `guest` studio is offered | open |
| F9 "18d overdue" | open (pre-existing designer copy) |
| F10 raw pg message in the R83 band | open (house path behaves the same) |
| F11 the `studio` Stamp's line box | open — **now measured**, see R2-2 |
| A1 / A2 / A3 | A1 unchanged; A2 confirmed by walk; A3 discharged by this round's walk |

No regression was introduced by the r1 fix: the house void copy is asserted by its own test,
and `invoice-folio.tsx` is otherwise byte-identical apart from the head line.

## New this round

**R2-1 (major).** A designer with no active `design_studio` can choose "the studio · no house",
fill every field, and the Draft act stays disabled with nothing said. Walking as the seeded
`superadmin@patina.dev` (no `organization_members` row — confirmed by SQL): household
`Client User` picked, regarding filled, one $450 line, `TOTAL $450.00 · 1 LINE`, and
`await act.isDisabled()` → `true` (screenshot `5-filled.png`). This dead end is new to this
lane: before it, a project-less composer rendered no body at all, so there was nothing to
dead-end on. One muted line under the choice — or a held act with a reason, R83's grammar —
closes it.

**R2-2 (minor).** The ledger's column rhythm breaks on a studio row. Measured on the live page
(`li.grid-cols-[1fr_auto_auto_auto]` children):

```
studio row  height 67  name-btn w 553  tail x 953  status stamp x 973  (no 4th cell)
house  row  height 59  name-btn w 431  tail x 831  status stamp x 917  document ↗ x 981
```

Dropping the fourth cell lets the `1fr` name column absorb its width, so the studio row's
status stamp lands 56px right of every house row's, and the inline `studio` Stamp
(`px-[9px] py-[3px] border-[1.5px]` inside an 11px mono line) grows the row 8px taller.
M2 draws a column-aligned ledger. Same mechanism on receivables (`1fr_auto_auto`).

**R2-3 (nit).** The regarding input has no `maxLength`; `create_draft_studio_invoice` rejects
`char_length(p_title) > 200` (00571:886), so a long title fails into the R83 band with a raw
Postgres message.

**R2-4 (nit).** `aria-label="For"` on the select is a substring match for other page labels
(`getByLabel('For')` resolved to 2 elements in the walk — the select and an "Open the job — …"
act). jsdom never sees this; a future e2e must use `select[aria-label="For"]`.

## Verdict

`fix` — no blocker, no missing brief item, gates as green as this suite gets; one major
(R2-1) and a short polish tail.
