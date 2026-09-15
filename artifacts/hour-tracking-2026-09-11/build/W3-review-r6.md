# W3 — verification, round 6 (targeted: W3-R5-M1)

**clean = true**

**Reviewed** `hour-tracking/portal` @ `2f1b243b9` (was `c13ec3e08`), worktree `.codex/worktrees/agent-portal`, read-only.
**Against** `W3-review-r5.md` finding `W3-R5-M1` and `W3-fix-r5.md`.

## What was claimed

`W3-fix-r5.md` says: `BillablePill` gained a `className` prop forwarded to both the act and the reason `<span>`; `log-strip.tsx` defines `STRIP_LIGHT_INK = 'max-[1179px]:!text-[rgba(250,247,242,0.72)]'` (the exact value the pre-existing `Discard` act already carries) and passes it to both `BillablePill` and `RateReadout`, from the strip only; `log-strip.test.tsx` gained an assertion checking `toHaveClass` on that class on both nodes; no live-browser 390/1024 measurement was possible because writing the worktree's `.env.local` was refused.

## Source confirmation

- `log-strip.tsx:37` defines `STRIP_LIGHT_INK = 'max-[1179px]:!text-[rgba(250,247,242,0.72)]'` — byte-identical to the `Discard` act's override at `log-strip.tsx:178` (`className="min-h-11 max-[1179px]:!text-[rgba(250,247,242,0.72)]"`), which the r5 review measured live at ~8:1.
- `log-strip.tsx:188-205` — `<BillablePill … className={STRIP_LIGHT_INK} />` and `<RateReadout … className={STRIP_LIGHT_INK} />`, both in the strip's own render only. No other caller (`hours-ledger.tsx`, `log-time-sheet.tsx`, `mobile-sheets.tsx`) passes a `className` — confirmed by grep; those surfaces render on paper and don't need the override.
- `time-capture.tsx:79-124` — `BillablePill` takes `className` in its prop type, forwards it to the `DocumentAction` act (`:114`) **and** interpolates it into the reason `<span>` (`:120`, `` `min-w-0 truncate t-head text-[var(--color-aged-oak)] ${className ?? ''}` ``) — both nodes the review measured (2.14:1 pill, 3.23:1 readout) now carry the override.
- `document-action.tsx:235` — `DocumentAction` joins `className` into `[BASE_CLASS, VARIANT_CLASS[variant], className ?? ''].join(' ')`, so the class actually reaches the rendered button rather than being swallowed.
- `time-capture.tsx:202-239` (`RateReadout`) also carries `className` on its own `<span>` (`:236`), and separately now returns `null` for `provenance.kind === 'nonbillable'` (`:224`, the m1 fix) — confirmed not to interfere with M1: the two fixes are independent code paths (early return vs. className passthrough) and both are exercised in the same jest file without conflict.

**Both controls carry the sub-1180 light-ink override, confirmed in source.**

## Test confirmation

`log-strip.test.tsx:216-233`, `'keeps the billable pill and rate readout legible on the dark bar below 1180px (WCAG AA, W3-R5-M1)'`, asserts `toHaveClass('max-[1179px]:!text-[rgba(250,247,242,0.72)]')` on both the pill act (`getByRole('button', { name: /Non-billable/ })`) and the rate-readout span. Ran it — passes. **log-strip.test.tsx asserts it, confirmed.**

## Gates re-run (verbatim, this session)

| Gate | Result |
|---|---|
| `pnpm --dir …/agent-portal --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal test -- src/components/document/log-strip.test.tsx src/components/document/time-capture.test.tsx` | `log-strip.test.tsx`: **13 passed / 13** (`time-capture.test.tsx` does not exist — confirmed via the file list; its two exports are covered by `log-strip.test.tsx` plus the four other suites below, matching the fix report's own note) |
| Broader re-run: `log-strip.test.tsx` + `command-bar-log-time.test.tsx` + `hours-ledger-add-row.test.tsx` + `hours-ledger-scope.test.tsx` + `mobile-sheets.test.tsx` | **5 suites, 89 tests, all pass** (matches fix report) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal lint` | **exit 0 · 0 errors, 201 warnings** — grepped the full output for `log-strip`/`log-time-sheet`/`time-capture`: **no hits** in the four touched files |

Full lint tail (problem count line):
```
✖ 201 problems (0 errors, 201 warnings)
```

## Live-browser attempt at 390

Tried it, on port 3100 only (3000/3002 untouched — confirmed both free before and after). Contrary to the fix report, the worktree's `apps/designer-portal/.env.local` **already exists** (gitignored, presumably persisted from an earlier round in this same long-lived worktree) and is correctly pointed at the isolated stack (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`); `supabase status --workdir` confirms the stack is up at 54421/54422. So the env-write refusal the fix report hit wasn't a blocker this round — but **W3-R5-N13 (dev does not hydrate in this worktree) reproduced anyway**: `next dev --webpack -p 3100` boots clean (`Ready in 303ms`, HMR connects, chunks load, no page errors), but a Playwright probe against `/auth/signin` — the exact repro shape N-13 used — shows `aria-expanded` on the sign-in disclosure staying `false` after a click (`button count: 7`, click fires, no state change). This is the same "chunks load, fiber never attaches" signature r5 already recorded, not something new. Reproducing it cost a few minutes rather than most of an hour, but it's the same wall: the app can't be driven interactively via `next dev` in this worktree right now, only via a production build (which r5 already used for its 6/7 e2e pass and which this task's brief doesn't authorize me to substitute for "dev server on port 3100 ONLY").

Per the task's own instruction — *"if next dev still does not hydrate here (W3-R5-N13), say so and rely on the unit assertion"* — that's what this round does. Killed the dev server, reverted the one incidental change it made (`apps/designer-portal/next-env.d.ts`, the same dev/prod `.next` path swap r5 saw for the same reason), confirmed `git status` empty and ports 3100/3000/3002 all free.

## Verdict

`W3-R5-M1` is discharged: both new controls carry the identical, already-proven light-ink override on the exact class the pre-existing sibling controls use, the class reaches the DOM via `DocumentAction`'s join, and `log-strip.test.tsx` pins it with a dedicated assertion. Type-check, the named + broader test set, and lint are all green with no regressions and no touched-file lint hits. Live pixel measurement at 390/1024 remains unverified from this environment (N-13 persists) — the unit assertion is the substitute the task's own instructions anticipate for exactly this case.

**clean = true.**
