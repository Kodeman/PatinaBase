# Lane D7 — Desk follow-ups from Wave 3

**Branch** `portal-polish/d7` · **head** `e5e36e96b` · cut from `origin/main` `2b3da787f`
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d7`
(`git rev-parse --show-toplevel` confirmed before every write; no git command was run in the shared
checkout except `fetch`, `worktree add`, and read-only `log`/`ls-remote`.)

Read first: the plan's *Global constraints*, *Shared-state ownership*, *Copy strings that tests pin*
and the Wave 3 section; `docs/design/house-sheet/SPEC.md` §A/§F (the Desk table at :631 —
`Sarah Chen (respond by 11 September)` — and the money block at :676);
`apps/designer-portal/CLAUDE.md`; `artifacts/portal-polish-build-2026-09-08/ship/w3-ship.md`;
`waves/w3/d1-rereview.md`. `d4-impl.md` does not exist on `main` — the D4 record is `d4-review.md` /
`d4-fix.md` / `d4-rereview.md`, and the `.da-score-hover` exception was read from the frozen test
itself (`action-rest-rules.test.ts:72-80`).

**No dev server, no database, no port.** Wave 2b's ownership of the local DB and :3002 was never
touched; this lane ran jest / type-check / lint only.

---

## Three commits

| Commit | Message |
|---|---|
| `5bb437cae` | `fix(designer): the lead line leads with the client; one date style on the Desk (PP-2)` |
| `cd55d9b91` | `fix(designer): roster names wrap at 390; .da-score-hover rests visible (PP-3)` |
| `e5e36e96b` | `fix(designer): ⌘K is a combobox (B03)` |

Every commit staged by explicit pathspec; `git add -A` never used. Pushed and verified:

```
$ git ls-remote origin portal-polish/d7
e5e36e96bf9488c0ac1fbf82cd4c1d5fb7b6ec95	refs/heads/portal-polish/d7
```

---

## 1 · The lead line leads with the client (D1-1)

`desk-roster-derivation.ts` — the `lead` slot no longer borrows the need's own sentence. It writes
the specimen's line (`specimens/designer-desk.html:776`) itself:

```
{ kind: 'job',  text: lead.line.client ?? lead.line.name, engagementId }
{ kind: 'text', text: ` · new lead — respond by ${dayMonth(lead.line.dueOn)}` }
```

Rendered: **`Marcus Wright · new lead — respond by 27 August`**, the client name as the inline act
(`RosterLine.client`, which `clientOf` already refuses to fill with a placeholder), sentence-cased,
and the job title (`Wright apartment`) printed nowhere on the line — asserted by name in the new
test. The job name still stands in where the row has no readable client; that fallback is unchanged
and still covered.

**Why it stopped borrowing `needText`.** The need's sentence is dated `Aug 27` by
`desk-derivation.ts`'s `fmtDay` (en-US, out of this lane's file list — see *Owed* below). Borrowing
it would have put a second date style inside the very band PP-2 is about. The filter changed with
it: the slot now requires a *readable* `dueOn` (`!!dayMonth(entry.line.dueOn)`) instead of a
non-empty `needText`, so the precondition is exactly what the sentence prints — a `new_lead` with no
deadline (`New lead — respond`) yields no lead line rather than a half-written one. New test pins
that.

`reconnect_due` stays excluded and its pinned exclusion test is untouched.

## 2 · One date style on the Desk (PP-2)

New `src/lib/document/dates.ts`, mirroring `apps/client-portal/src/lib/threshold/dates.ts` — same
signatures, same doctrine comment, same null-on-unreadable contract:
`parseSourceDate`, `legalDate` ("11 September 2026"), `dayMonth` ("11 September"),
`DAY_MONTH_FORMAT`, `MONTH_NAME_FORMAT`, all en-GB. One addition: `WEEKDAY_FORMAT` (`en-GB`,
`weekday: 'long'`), for the Desk greeting — kept in the file for the same reason
`MONTH_NAME_FORMAT` is in the client's: so the surface holds one locale and no caller composes a
second `Intl.DateTimeFormat`.

Routed through it:

* the day's line's lead deadline (above);
* the greeting's date line, `src/app/(document)/desk/page.tsx:209` —
  `TUESDAY · SEPTEMBER 8` becomes `TUESDAY · 8 SEPTEMBER`.

The gate the brief named:

```
$ grep -rn "en-US" src/lib/document/desk-roster-derivation.ts \
      src/components/document/desk-roster.tsx "src/app/(document)/desk"
exit=1   (zero matches)
```

Nothing else the roster or the day's line prints formats a date in code: the overdue clause is
`overdueElapsedPhrase` ("6 days", no date), and the row's state sentence carries the need's text
verbatim. That is the residual — see *Owed*.

**Test strings updated** (the only two the change altered):
`desk-roster.test.tsx:491` and `__tests__/desk-roster-derivation.test.ts:563`.

## 3 · 390 overflow — the name wraps

`desk-roster.tsx`, `JobLine`'s name link gains `min-w-0 [overflow-wrap:anywhere]` and a
`data-roster-name` hook. A flex child's `min-width` is `auto`, so the unbreakable name was setting
the row's minimum width — the mechanism the W3 ship report measured (`scrollWidth 437 / 390`, DOM
surgery isolating it to the roster row, identical on `origin/main`). Nothing is truncated: the
sheet forbids it, and the test asserts the absence of `truncate` / `whitespace-nowrap` as well as the
presence of the two wrapping classes.

The row's other flex children were left alone deliberately: the state `<p>` already carries
`min-w-0 flex-1`, the mark is a fixed 7px `shrink-0`, and the trailing `DocumentAction` cannot
overflow (its min-content is the word "Open") — on a `flex-wrap` row it wraps before it shrinks, so
`min-w-0` there would change no pixel while adding a class to a D4-owned control.

New jest: `desk-roster.test.tsx` › *"lets a long job name wrap instead of widening the page (390)"*.
**The render check at 390 is the integration lane's** — this lane started no server.

## 4 · `.da-score-hover` rests visible (PP-3 / R139)

`globals.css` — `.da-score-hover::after` drops `transform: scaleX(0)` and its transform transition;
the 1px `--color-aged-oak` rule now stands at rest and the hover/focus-visible rule raises it to
`--color-clay`, on `background-color var(--duration-fast) var(--ease-editorial)` — the same two
tokens and the same clock `.row-wash-score` uses (`globals.css:412-426`). `transform-origin` stays,
because `.da-score-on::after` (a different block, not touched) still asserts `scaleX(1)`. The
reduced-motion override (`transition: none`) still matches.

`action-rest-rules.test.ts` — the frozen exception is gone. The test that named
`[".da-score-hover::after"]` now asserts the list is **empty**: *no* `.da-*` rest rule uses
`scaleX(0)`. A second test pins the new rest (aged oak, no `scaleX`) and the raise (clay), so the
regression fails by name. The file header was updated to say the exception no longer exists.

**Consumers whose appearance changes** (31 source files wear the class; no other file's source was
edited). For the integration lane's two renders, a document page and the orders ledger are marked ★:

```
components/document/account/member-title-line.tsx
components/document/account/studio-setup-checklist.tsx
components/document/account/studio-setup-whisper.tsx
components/document/commercial/trade/party-field.tsx
components/document/compose/composing-page.tsx
components/document/coordination/item-composer.tsx
components/document/discovery/field-kit.tsx
components/document/doc-spine.tsx                      ★ (on every document page)
components/document/drafting/proposal-mirror.tsx
components/document/engine/engine-results.tsx
components/document/folio-strip.tsx
components/document/letterhead-vitals.tsx              ★ (on every document page)
components/document/margin-note.tsx
components/document/margin-rail.tsx
components/document/orders-book-receiving.tsx
components/document/orders-book-vendors.tsx
components/document/orders-ledger.tsx                  ★ (the orders ledger)
components/document/people/directory/makers-marketplace.tsx
components/document/people/directory/scope-lens.tsx
components/document/people/directory/trade-chip-row.tsx
components/document/people/profile/profile-shell.tsx
components/document/people/views/directory-view.tsx
components/document/rooms/drafting/drafting-room.tsx
components/document/rooms/library/library-card.tsx
components/document/rooms/piece/piece-room.tsx
components/document/rooms/room-shell.tsx               ★ (every room)
components/document/rooms/room-view/facts-rail.tsx
components/document/roster/rolodex-picker.tsx
components/document/roster/roster-row.tsx
components/document/schedule/milestone-composer.tsx
components/document/worktable/rooms-rail.tsx
```

Suggested pair: **a document page** (`doc-spine` + `letterhead-vitals` + `room-shell` all on one
screen) and **the orders ledger**.

## 5 · ⌘K completes the combobox pattern (B03)

`command-bar.tsx` — the input gains `role="combobox"`, `aria-expanded={!asking}` (the listbox
renders exactly when `asking` is null), and `aria-autocomplete="list"`, keeping
`aria-activedescendant`, `aria-controls` and `aria-owns` as they were. Keyboard behaviour is byte-for
byte unchanged: the `onKeyDown` handler was not edited.

`command-bar.test.tsx` — all 20 `textbox` queries (19 `getByRole`/`findByRole` call sites plus the
`paletteInput()` helper) are now `combobox`; one comment saying "from a textbox" says "from a
combobox". One new test in the existing B03 describe pins the four attributes.

---

## Gate — run from the worktree on `e5e36e96b`

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 549 passed, 549 total
Tests:       6806 passed, 6806 total
Snapshots:   12 passed, 12 total
Time:        25.177 s
```

Wave-3 baseline was **548 suites / 6786 passed / 0 todo**. Net **+1 suite** (`dates.test.ts`) and
**+20 tests**; nothing lost, nothing skipped, no todo introduced.

`shadow-gate.test.ts` green and **unedited** — `git diff --name-only 2b3da787f HEAD` returns no path
matching `shadow`.

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  …/piece-room-save-gate.test.tsx  159:1  error  Definition for rule 'import/first' was not found
  …/use-commercial-documents.test.ts 930:8 error react-hooks/rules-of-hooks
```

The two known pre-existing errors, same rules and same lines as the Wave-3 baseline. Not grown.

Diffstat against `origin/main`:

```
 src/app/(document)/desk/page.tsx                          |   8 +-
 src/app/globals.css                                       |  16 ++--
 src/components/document/command-bar.test.tsx              |  53 ++++++---
 src/components/document/command-bar.tsx                   |  11 ++-
 src/components/document/desk-roster.test.tsx              |  21 +++-
 src/components/document/desk-roster.tsx                   |   8 +-
 src/lib/document/__tests__/action-rest-rules.test.ts      |  33 ++++--
 src/lib/document/__tests__/dates.test.ts                  | 104 ++++++++++++++++
 src/lib/document/__tests__/desk-roster-derivation.test.ts |  44 ++++++-
 src/lib/document/dates.ts                                 |  89 ++++++++++++++
 src/lib/document/desk-roster-derivation.ts                |  25 ++--
 11 files changed, 362 insertions(+), 50 deletions(-)
```

---

## Owed / for the orchestrator

1. **PP-2 is only half-answered on the Desk, and the other half is out of this lane's file list.**
   The roster ROW's state sentence still prints `New lead — respond by Aug 27`, because it carries
   `NeedLine.text` verbatim from `src/lib/document/desk-derivation.ts:478`'s module-private
   `fmtDay` (`en-US`, `month: 'short'`). Nine call sites in that one file produce a date the Desk
   prints: `:575` and `:603` (`— oldest due …`), `:696` (`Sent …`), `:714`/`:715` (`Opened …`),
   `:766` (`Reconnect — touchpoint due …`), `:795`/`:796` (`Respond by …`), `:924` (`oldest …`),
   `:1137`/`:1142` (`With client since …`), plus `fmtDayTime` at `:507` for
   `Discovery · Thu 2:00 PM`. That file was **not** in this lane's file list and **not** in the
   brief's grep, and it is deliberately shared: its needs feed the folio cards, the margin, the
   document guide and the client-mirror contract, not just the roster. Routing it through
   `dates.ts` is a real lane — 16 sentence-shaped pinned strings and roughly 250 short-month
   assertions across the designer suites sit downstream of it. **Until it runs, the Desk still
   shows two date idioms:** `27 August` on the day's line and the greeting, `Aug 27` on the row
   beneath.
2. **The 390 render is unverified here.** The class fix is unit-tested; the measurement
   (`scrollWidth` at 390×844) belongs to the integration lane, along with the specimen's whole
   mobile reflow (day's line first, sticky plates) which no lane has been given.
3. **Prettier drift is pre-existing and repo-wide, not introduced here.** The pre-commit hook warned
   on all three commits; `npx prettier --check` warns identically on files this lane never touched
   (e.g. `overdue-condition.ts`). Left alone rather than reformatting whole files inside a fix
   commit — same call the W3 ship report recorded.
4. **`.da-score-on` now loses to `:hover`.** With the rest visible, `.da-score-hover:hover::after`
   (specificity 0,2,1) beats `.da-score-on::after` (0,1,1), so a *selected* picker turns clay while
   the pointer is on it instead of holding charcoal. That block is outside this lane's file list
   (the brief scoped the change to "the `.da-score-hover` block only") and the behaviour is
   defensible — a hovered control reads as hovered — but if the house wants selection to win, that
   is a one-line specificity bump in the `.da-score-on` block and a ruling, not a lane's call.

## Worktree

`.codex/worktrees/agent-pp-d7` — **kept** (deps installed, `@patina/designer-portal^...` dists
built) for the integration lane. Retire with `git worktree remove` after the merge.
