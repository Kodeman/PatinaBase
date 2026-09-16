# W7 — fix round 5

**One finding in the brief, one fix.** `W7-R5-01` is **confirmed by my own measurement** — and it is **worse than filed**. Applied, re-measured, gates green, pushed.

Branch `hour-tracking/portal`. One file touched:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal/apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx`

No migration, no SQL, no test file added or changed. `00618` / `00619` untouched.

---

## W7-R5-01 — the composer's role picker at 390 · **FIXED**

### The finding is right, and it understates the defect

The review measured the row against `.g-room`'s column (358px at 390, 720px at 1440). The real DOM chain puts the editor one box deeper:

`.g-page > .g-room > article.g-paper > .g-part > .g-fold > the row`
(`agreement-composer.tsx:1331-1332` and `:1126-1132`; `GalleyPart` → `.g-fold` at `galley-part.tsx:178`; `GalleyFold` mounts `PartEditor` headless)

and `.g-paper` (`galley.css:282-288`) spends `1px` border + `var(--module)` = 24px padding on each side. So the measure the row actually gets is:

| viewport | `.g-room` (what the review measured against) | `.g-fold` (the real measure) |
|---|---|---|
| 390 | 358 | **308** |
| 1024 | 664 | **614** |
| 1440 | 720 | **670** |

Measured headless (Playwright chromium 1.58.2, the app's own compiled Tailwind — `tailwindcss -c tailwind.config.ts -i src/app/globals.css` — plus `galley.css` verbatim, the real `Select`/`Input`/`Button` class strings from `ui/controls`), the shipped round-4 shape at 390 gives:

| | review's figure | measured in the real chain |
|---|---|---|
| role `<select>` | 107px | **57.4px** |
| its text box | 56px | **5.9px** |

My label ruler reproduces the review's numbers to a tenth — `Support designer` **104.1**, `Lead designer` **86.2**, `Choose a role` **84.1**, `Bookkeeper` **73.9**, `Vendor` **44.2** — so the two harnesses agree on type metrics and disagree only about the container. (Both resolve to Times: `--font-body` is `var(--font-inter), …` and `--font-inter` is injected by the Next font loader, so outside the app the whole declaration is invalid at computed-value time. Same ruler, same conclusion, and Inter is the wider face — every clip below is a floor, not a ceiling.)

At a **5.9px** text box the closed picker prints not "roughly the first half of every label" but **no label at all** — not even `Vendor`. The severity call stands as major.

### What I did NOT do, and why

The review's own suggested shape — `max-[767px]:grid-cols-[minmax(0,1fr)_auto]`, i.e. `Remove` on its own line with the picker keeping `1fr` beside the 140px rate — was measured and **rejected**:

| shape at 390 | picker | its text box | longest label |
|---|---|---|---|
| review's suggestion (picker + 140px rate on line 1) | 154.5 | **103.0** | 104.1 — **still clips** |

It returns the picker to ~205px only against the 358px figure; against the real 308px fold it lands 1.1px short of `Support designer` **in Times**, and Inter is wider. A fix that is one pixel from the same defect is not a fix.

### The shape shipped

Below the galley's own 768px breakpoint the **picker takes the whole first line**, and the rate and `Remove` share the second. At 768 and above the row is the three-column shape round 4 shipped, unchanged.

```
row     grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3
        md:grid-cols-[minmax(0,1fr)_140px_auto]
Select  wrapperClassName="col-span-2 md:col-span-1"
Button  className="justify-self-end"
```

`140px` leads the mobile track list so the rate keeps its drawn 140px measure on line 2 and `Remove` takes the rest and sits at the end — no `max-w-*` override needed. `md` is Tailwind's default 768px (no `screens` key in `tailwind.config.ts`), which is `galley.css:48/54`'s breakpoint exactly, so the row changes shape on the same line the room does.

### Re-measured, same harness

| viewport | fold | picker BEFORE | text box BEFORE | picker AFTER | text box AFTER | row height AFTER | `Remove` | overflow-x |
|---|---|---|---|---|---|---|---|---|
| **390** | 308 | 57.4 | **5.9** | **308.0** | **256.5** | 42.9 → 99.4 (two lines) | 83.6 × 30.2 | 390 / 390 — none |
| **1024** | 614 | 363.4 | 311.9 | **363.4** | **311.9** | 42.9 (unchanged) | 83.6 × 30.2 | 1024 / 1024 — none |
| **1440** | 670 | 419.4 | 367.9 | **419.4** | **367.9** | 42.9 (unchanged) | 83.6 × 30.2 | 1440 / 1440 — none |

At 390 the text box goes **5.9 → 256.5px** against a longest label of 104.1 — 2.4× headroom, so it survives the swap to Inter with room over. At 1024 and 1440 every number is **byte-identical** to the shipped shape: the fix costs the wide widths nothing.

## Gates

Run in this context, in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`:

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no output, exit 0 |
| `pnpm --filter @patina/designer-portal test` (full suite) | **581 suites / 7440 tests passed**, 1 snapshot, 0 failures, 27.0s |
| `pnpm --filter @patina/designer-portal test -- …/agreement/__tests__` | **21 suites / 371 tests passed** — includes `part-editor.test.tsx` and `part-editor-role-picker.test.tsx` |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 pre-existing warnings (unused eslint-disable directives, unrelated files) |
| headless measurement, 390 / 1024 / 1440 | table above; no horizontal overflow at any width |

No DB reset and no `run-sql-tests.sh` this round: nothing under `supabase/` was touched, and the isolated stack was left alone.

## What I did NOT verify

- **Not driven in the running portal.** The measurement is a harness — the real DOM chain, the app's own compiled Tailwind, `galley.css` verbatim and the controls' real class strings — not `pnpm dev` with a drafting agreement on screen. It cannot see anything the harness does not reproduce (the Next font loader's Inter, `--font-body` resolving, a parent the chain above missed).
- **Times, not Inter.** Every width above is measured in the fallback face, the same one the review's ruler landed on. The direction is safe (Inter is wider, the fix's headroom is 2.4×), but the exact pixel figures are Times figures.
- Only `W7-R5-01` was in the brief. **W7-R5-02** (`Remove` does not re-index `sortOrder`, so `+ Add a role` can seat two rows at the same position) and **W7-R5-03** (`Remove` at 30px against §A's 44px floor) are both live in the code I just touched, three lines from this change, and are **untouched** — they were not mine to fix this round.
