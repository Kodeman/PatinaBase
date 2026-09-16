# W7 — fix round 6

**One finding in the brief, one fix.** `W7-R6-01` applied exactly as specified. Gates green, pushed.

Branch `hour-tracking/portal` @ `0196b7987` (one commit ahead of `337564357`).
One file changed, plus a test file extended:

- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/components/document/account/account-studio-page.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/components/document/account/__tests__/agreement-defaults-card.test.tsx`

No migration, no SQL. `00618`/`00619`/`supabase/config.toml` untouched.

---

## W7-R6-01 — the studio-defaults role picker at 390 · **FIXED**

### The fix, exactly as specified

The finding's own shape, applied verbatim to the studio-defaults rate-card row (`account-studio-page.tsx:1148-1234`, Account → Studio → Agreement defaults):

```
row     grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2
        sm:grid-cols-[minmax(0,1fr)_120px_auto]
Select  wrapperClassName="col-span-2 sm:col-span-1"
button  className="justify-self-end text-[12px] …"  (Remove — added
        justify-self-end so it hugs the right on the shared second
        line, same treatment the composer's Button got for W7-R5-01)
```

Below `sm` (640px — the line `doc-sheet.tsx` already changes its own padding
on, per the finding) the picker takes the whole first line; the rate input
and `Remove` share the second, with the rate leading at its drawn 120px and
`Remove` taking the rest. At `sm` and above the row is the original
three-column shape, unchanged.

### Measured — Playwright against the real dev server, port 3100 only

Per the brief, this was **not** a standalone harness (the shape the review
rounds used) — a real `next dev --webpack -p 3100` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal`,
driven by `@playwright/test` chromium against `http://localhost:3100` (never
`127.0.0.1` — the cross-origin dev block this program's own notes warn
about). Ports 3000/3002 were never touched; `lsof -ti:3100` was empty before
start and after teardown.

To reach the row without an authenticated session, I added a temporary
probe route (`src/app/w7-r6-01-probe/page.tsx`) that renders the real
container chain read out of the source — `doc-sheet.tsx`'s panel
(`w-full max-w-[640px] px-6 sm:px-9`, 1px border) → `account-sheet.tsx`'s
`mx-auto max-w-xl` → the page's own `max-w-md` — wrapping the exact
post-fix row markup and the real `Select` control import, and briefly
excepted that one path from `middleware.ts`'s auth matcher. Both the probe
page and the middleware change were **reverted before commit** (`git
checkout -- apps/designer-portal/src/middleware.ts`; the probe directory
deleted) — `git status --porcelain` on the worktree shows only the two
files listed above changed.

| viewport | row (fold measure) | picker column | its text box | rate | `Remove` | overflow-x |
|---|---|---|---|---|---|---|
| **390** | 289.0 | **289.0** | **289.0** | 120 | 45.5 × 18 | 390 / 390 — none |
| **1440** | 504.0 | 320.5 | 320.5 | 120 | 45.5 × 18 | 1440 / 1440 — none |

At 390 the review's label ruler (`Support designer` 104.1, `Lead designer`
86.2, `Choose a role` 84.1, `Bookkeeper` 73.9, `Vendor` 44.2, same font/size)
now fits comfortably inside a 289px text box — 2.8× the longest label, up
from a 68.5px box that fit only `Vendor`. At 1440 the picker column (320.5)
is materially the same shape the review measured pre-fix at that width
(326.0), confirming the wide layout is unchanged.

One measurement note for the record: the review's own harness (a
standalone Tailwind/PostCSS compile against `globals.css` + `galley.css`
copied verbatim, no dev server) computed 298.0/308.0 for this row at 390
using a 16px rem assumption; the app's actual root font-size is **18px**
(confirmed via `getComputedStyle(documentElement).fontSize` against the
running dev server), which is why my dev-server-measured row (289.0) reads
a few px under the review's harness figure. Both numbers land in the same
place for the question that matters — the picker fills the row rather than
a 120px column — and I flag the discrepancy rather than silently taking
either figure as exact.

### What I did NOT do

- Did not touch the sixth open §A deviation this same finding runs beside
  (`W7-R6-05`, the studio page's 18×40px `Remove`) — not in the brief.
- Did not re-index `sortOrder` on `Remove` (`W7-R5-02`) or touch the
  `rateCardForSave` trim (`W7-R5-04`) — both untouched, not mine this round.
- Did not drive a signed-in browser walk of the live Account → Studio
  sheet; the probe reproduces the real container chain and the real
  `Select` control but is not the authenticated page itself.

## Gates

Run in this context, in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`:

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no output, exit 0 |
| `pnpm --filter @patina/designer-portal test -- agreement-defaults-card` | **19/19 passed**, including the new W7-R6-01 pin |
| `pnpm --filter @patina/designer-portal test -- account-studio-page` | **17/17 passed** (unrelated suite in the same file family, unaffected) |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 pre-existing warnings (same baseline `fix-r5` reported) |
| Playwright, dev server on port 3100, 390 / 1440 | table above; no horizontal overflow at either width |

No DB reset and no `run-sql-tests.sh`: nothing under `supabase/` was
touched, and the isolated stack (`patina-hours`, 127.0.0.1:54422) was left
alone.

### The new test

`agreement-defaults-card.test.tsx` — *"stacks the picker onto its own line
below sm and spans it across both columns (W7-R6-01)"* — renders
`AccountStudioPage` with the flag on and an owner session (the suite's
existing fixtures), gets the `Select` via its `aria-label`, walks to its
wrapping `<span>` (the `Select` control's own wrapper element) and that
span's parent (the grid row `<div>`), and asserts:

- the wrapper span's className contains `col-span-2` and `sm:col-span-1`
- the row div's className contains `grid-cols-[120px_minmax(0,1fr)]` and
  `sm:grid-cols-[minmax(0,1fr)_120px_auto]`
- the row div's className is not the pre-fix single-row string, as a
  sanity check against a silent revert

This pins the classes the Playwright measurement above depends on, so a
regression back to the single-row shape fails in CI rather than only under
a real viewport.
