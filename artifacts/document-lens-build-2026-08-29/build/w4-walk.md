# W4 walk — density, in one direction

Server: production standalone build of `document-lens/w4` @ `5beeb0568` on
`http://localhost:3000` (pid 80025, confirmed alive via `ps`), the same code
merged at `document-lens/integration@eee60fcb0`. `/desk` → 307 confirmed
before the walk. Script: `build/w4-walk.mjs` (24-cell grid + 13 instrumented
probes). Raw data: `build/w4-walk/w4-measurements.json`. Screenshots:
`build/w4-walk/w4-*.png` (25 files — the 24-cell grid + one mobile-bar clip).
Read-only throughout: no product code, no worktree, no server restart.

## Seed verify

`docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql`
→ **14/17 PASS**, with exactly the three documented drifts:

| check | actual | expected |
|---|---|---|
| install milestone = current_date + 21 | 2026-09-19 | 2026-09-20 (UTC rollover) |
| margin_items total = 7 | 9 | 7 (two ambient `time` rows) |
| margin_items whole job = 4 | 6 | 4 (same two rows, letterhead-anchored) |

No other drift. Matches the expected baseline exactly.

## Summary table

| # | Item | Result | Note |
|---|---|---|---|
| 1 | Density map + D-B16 invariant (s0/s2/s3/foot, 1440, long paper) | **seen** — 0 violations | see §1 |
| 2 | Six quiet heads at s0 | **seen (1 of 6)** | only `care` mounts quiet on this seed; matched W4-R1 verbatim |
| 3 | Opening ahead — first quiet→full flip | **seen** | `care` flips at scrollY 7680, 237.36px into the 240px lookahead |
| 4 | One direction — scroll back to s0 | **seen** — 0 regressions | all 6 roots stay `full` |
| 5 | L-10 — press ladder's Money segment | **seen**, once measured correctly | see Differs #8 (methodology) |
| 6 | `data-lens-settled` flip timing + `__lensSettled()` | **seen** | false at t=39.7ms, true at t=611.3ms, promise resolved |
| 7 | `data-lens-state` sweep (rest/reading/editing/mobile) | **seen**, "open" **differs** | see Differs #6 |
| 8 | Fling census s0→s3, 1440 | **seen** — 0 blank frames | landing = `ffe`/`full` |
| 9 | Reduced motion (s0/s2) | **seen**, once re-margined | see Differs #9 |
| 10 | `CLOSED BY YOU` on explicit fold + reload | **seen** — printed verbatim | |
| 11 | Rail: distinct labels ≤14; D-B37 segment heights | **seen** — 14/14, 0 offenders | |
| 12 | D-B38 band line-2 y, three widths | **seen**, 1440 **differs** by 0.05px | see Differs #5 |
| 13 | Mobile bar at 390: 3 lines, reading-index, sections door | **seen** — all present | |
| 14 | Console errors per load | **seen** — uniform, pre-existing | see §14 |
| 15 | §9 Wave 4 acceptance bullets (8) | **seen**, 2 **differ** | see §15 |

---

## §1 — Density map + D-B16 invariant (1440, long paper `…d5`)

For each state, every `[data-document-paper] [data-index-region]` root's
`key` / `data-density` / `data-passed` / `rect.top`, and the three D-B16
sentences: (i) no `quiet` root has `top ≤ innerHeight+240`; (ii) every
`passed` root is `full`; (iii) `full ≥ 1` whenever any root is in frame.

| state | approvals | schedule | ffe | money | care | record | violations |
|---|---|---|---|---|---|---|---|
| s0 | full (top 326) | full (top 964) | full (top 1910) | full (top 7715) | **quiet** (top 8817) | full (top 9033) | 0 |
| s2 | full, passed (top −566) | full (top 72) | full (top 1018) | full (top 6823) | **quiet** (top 7925) | full (top 8141) | 0 |
| s3 | full, passed (top −1512) | full (top −874) | full (top 72) | full (top 5877) | **quiet** (top 6979) | full (top 7195) | 0 |
| foot | full, passed | full, passed | full, passed | full, passed | full, passed | full, passed | 0 |

**0 violations at every state.** Five of six stops (`approvals`, `schedule`,
`ffe`, `money`, `record`) mount `density="full"` from first paint on this
seed — their `latchedDefault` resolves open by business default (live
content: overdue invoice, active schedule, 62 FF&E lines, 4 complete record
entries). Only `care` (`0 of 6 closed out`) mounts `quiet`, and it promotes to
`full` only once its top comes within the 240px lookahead (§3), never
before, and never demotes again (§4).

## §2 — Six quiet heads at s0 (W4-R1)

Only `care` is quiet at s0 on this seed (see §1). Its printed head matches
`W4-R1`'s table **verbatim**:

| field | measured | W4-R1 table |
|---|---|---|
| status line | `0 of 6 closed out` | `0 of 6 closed out` ✓ |
| sr-only line | `0 of 6 closed out · not yet on the paper · press Closing the book on the index to open` | identical ✓ |
| leader (only act printed) | `Close the book` (`close-project`) | `Close the book` ✓ |
| action count in head | 1 | leader-only ✓ |

The other five stops' *full*-density status lines were also captured for
completeness (they read from a different source string — `headStatus`, not
`quietStatus`; `money-region.tsx:287`/`project-approval-document.tsx:675`
both bifurcate `status={quiet ? quietStatus : headStatus}` by design, so a
full head's text is not expected to match the quiet table):

| stop | full-density status (this seed) | leader |
|---|---|---|
| approvals | `0 decided · no decision lead` | Assign project client |
| schedule | `5 phases · Procurement & Orders · next milestone Site walk` | + New open item |
| ffe | `the FF&E schedule, by room · 5 groups · 62 lines` | File the claim |
| money | `no budget yet` | Draw an invoice |
| record | `4 complete` | Open the record |

**Coverage gap, not a defect:** the design's quiet-status strings for these
five could not be directly exercised on this seed, because none of them ever
render quiet here — a seed with a less-active phase mix would be needed to
see the other five quiet forms rendered live.

## §3 — Opening ahead

Scrolled from s0 in 40px settled steps until the first `quiet→full` flip:

- **root:** `care`
- **scrollY at flip:** 7680
- **root top at flip:** 1137.36 (innerHeight 900)
- **distance of top below the frame bottom:** 237.36px (expected ≈240 —
  within one 40px step of the declared `LENS_LOOKAHEAD_PX`)

## §4 — One direction

Roots full at the flip point (`approvals, schedule, ffe, money, care,
record` — all six, since `care` had just flipped): after scrolling back to
scrollY 0, **all six still read `full`** — 0 regressions. The lens never
demotes.

## §5 — L-10 (ladder press → Money)

Every root from the top of the paper through `money`
(`approvals, schedule, ffe, money`) was already `full` before the press even
executed (they mount full by default on this seed — see §1), so the
"force full through the target" behavior is confirmed but vacuously on this
particular seed (nothing needed forcing). Landing measurement:

- **root top after landing:** 71.55px (both default and `prefers-reduced-motion: reduce`)
- **h2 top after landing:** 94.05px
- **expected:** `--doc-landing-clear` = 72px

**Matches.** See Differs #8 for a methodology note — an earlier, less careful
read (trusting `settle()` alone) misread this as landing at ~225px; a
poll-until-the-scroll-position-stops-moving read gives 71.55px cleanly in
both motion registers.

## §6 — Settle flip timing

- `data-lens-settled` went `false` at t=39.7ms (fling start) and back to
  `true` at t=611.3ms — **571.6ms** of continuous `false`.
- `window.__lensSettled()` resolved successfully.
- See Differs #7: 571.6ms is not itself "~120ms" — the 120ms window is
  measured from the *last actual scroll movement*, not from the initial
  false-flip; the fling itself (16 synthetic wheel ticks) occupies real
  wall-clock time before it stops.

## §7 — `data-lens-state` sweep

| condition | `data-lens-state` | `[data-lens-band]` `data-lens-open` |
|---|---|---|
| s0, 1440 | `rest` | `true` |
| after scroll, 1440 | `reading` | `false` |
| care textarea focused (on-paper), 1440 | `editing` | `false` |
| margin-rail "+ Note" textarea focused | **`rest`** (unchanged) | — |
| s0, 390 | `mobile` | — |

See Differs #6 — `"open"` is not a value the shell's enum carries at all
(`rest | reading | editing | mobile`, `use-lens-state.ts:36`); it maps onto
the *band's own* `data-lens-open`, which is semantically inverted from what
its name suggests (`"true"` = unpinned/at-rest, `"false"` = pinned). See
Differs #4 — the margin rail's note field does **not** enter `editing`.

## §8 — Fling census (D-B31), s0→s3, 1440

43 samples, 16 wheel ticks totalling 3200px:

| classification | count |
|---|---|
| content | 43 |
| blank | **0** |
| pre-region | 0 |
| post-region | 0 |

Landing: `ffe`, `data-density="full"`. **0 blank frames**, as required.

## §9 — Reduced motion (s0/s2, 1440)

First script pass mis-measured this (see Differs #9); a re-check with a 2.5s
post-`quiet()` margin gives the clean result:

| | reduced | no-preference |
|---|---|---|
| `getAnimations().length` after 1s, s0 | 0 | — |
| `getAnimations().length` after 1s, s2 | 0 | — |
| `.animate-pulse` elements present, s0/s2 | 0 / 0 | — |
| visible word-set size, s0 | 531 | 531 (**identical**) |
| visible word-set size, s2 | 535 | 535 (**identical**) |

No `.animate-pulse` element was observed loading at capture time in either
register, so W5-R3's inline-pulse ruling (dated **today**, 2026-08-30, per
`build/design/reconciliation.md` — not yet landed per its own text, "W5-L2
may carry it now") could not be exercised either way here.

## §10 — `CLOSED BY YOU`

Scrolled to `money` (full), pressed its head's `Fold ↑`, reloaded the page:

- fold button found, seam found after reload
- seam text: `Money` · `no budget yet · $0 authorized` · **`CLOSED BY YOU`** · `unfold ↓`
- **prints verbatim, as ruled.**

localStorage keys under `patina:doc-fold:*:money*` cleaned up after the read.

## §11 — Rail: labels + D-B37 segment heights

- Distinct visible labels at 1440/s0: **14** = `Client User`, `PROCUREMENT & ORDERS`, `3 OF 5`, `Client approvals`, `Schedule`, `Pieces`, `Money`, `Closing the book`, `The record`, `Filed with this job`, `Plan room`, `Spec book`, `Boards`, `Call sheet`
- Formula ceiling: 3 (fixed head) + 6 (stops) + 1 (fixed doors head) + 4 (doors) = **14**. **Exactly at the ceiling, not under it.**
- D-B37, 30-step settled scroll (2400px total): **2 index changes, 0 unexplained segment-height offenders.**

## §12 — D-B38 (band line-2 y, at-rest vs pinned)

| width | at rest | pinned | equal? |
|---|---|---|---|
| 1440 | 26.14px | 26.19px | **no — 0.05px** |
| 1280 | 26.19px | 26.19px | yes |
| 390 | 26.19px | 26.19px | yes |

See Differs #5 — a 0.05px gap at 1440 only, most likely sub-pixel rendering
variance rather than a genuine second box height (the spec's own `toBe()`
form would technically fail on this exact run).

## §13 — Mobile bar, 390

- Three lines confirmed: `In this document` / `Client User` (household) / `At Client approvals` → `At Schedule` after scroll.
- `data-reading-index` on `[data-mobile-edge-owner="document-bar"]`: `approvals` → `schedule`, publishes and updates correctly.
- `[data-sections-door]` present, `aria-label="Open sections, at Client approvals"` (dynamic, updates with the stop).

## §14 — Console errors per load

All 23 signed-in contexts show the same pattern (2–9 errors each), always one
of four kinds, none unique to any one test and none referencing lens code:

1. a transient `503` + `TypeError: Failed to fetch` + `AppError: Not authenticated` immediately after landing on `/desk` post-signin (self-resolves before the doc navigation — every subsequent `/doc/…` load and every measurement succeeded cleanly);
2. `net::ERR_NAME_NOT_RESOLVED` (an external host blocked in this sandboxed environment, most likely analytics/telemetry — never a Supabase-origin or app-chunk request).

**No console error was observed that is specific to a Wave 4 lens code path**
or unique to a particular cell/probe — this is uniform, pre-existing
environment/sign-in noise.

## §15 — §9 Wave 4 acceptance bullets (proposal.md, Engineering path)

| # | Bullet | Result |
|---|---|---|
| 1 | `use-region-fold.ts` — position joins as 4th, lowest, non-persisting voice, `quiet→full` only, never `folded`, never persists | **confirmed** — §1/§4: only ever promotes, never demotes, `care` flips and stays `full` |
| 2 | `use-lens-density.ts` — one `IntersectionObserver`, single 240px-below-bottom threshold, one direction, L-9 velocity gate, `settle()`/`__lensSettled()`, imperative `data-density`/`data-passed`, never removes `data-passed`, `MutationObserver` attach (not the index's retry window) | **confirmed**, with one documented deviation: the `MutationObserver` targets `document.body`, not `[data-document-paper]` as the proposal's literal text states — `use-lens-density.ts:459-473`'s own comment (W4-C6) explains why: the paper element itself is unmounted/remounted on a refetch or re-suspend, so watching it risks a permanently stale observer on a detached node once that happens. Sound call; the code and the proposal text disagree on the stated target. |
| 3 | `globals.css` — `[data-density='quiet']` rules, `[data-passed] { content-visibility: auto; contain-intrinsic-size: auto; }`, one new reduced-motion block after `:283` covering L-1/L-3/L-6 | **partially differs.** The quiet-reserve mechanism is real but shaped differently than stated: `--doc-quiet-reserve-min` (68px) / `-exc` (112px) tokens plus `[data-document-paper] [data-index-region] { min-block-size: var(--doc-quiet-reserve, 68px) }` (`globals.css:223-225,1120-1127`) — functionally the same idea, different selector shape. **The `content-visibility: auto` rule was implemented, measured, and then deleted** (`globals.css:1129-1145`, "R127/OD-4 — DELETED, by OD-4's own pre-agreed failure move"): measured CLS was **0.8658 with the rule, 0.000986 without it**, against a D-B29 gate of exactly 0 — the property was 99.9% of the shift. `data-passed` is still written (confirmed via grep, no `removeAttribute` call), but carries no CSS consequence today. The reduced-motion block is present exactly as specified, immediately after `:283` (`globals.css:296-310`), covering the three named yield sites. |
| 4 | Six region bodies render their quiet form (head, count line, one leader, reserved height) | **confirmed for the one observable case** (`care`, §2, verbatim match); the other five never render quiet on this seed (§1/§2) — a seed-coverage gap, not a code defect (the reserve/min-block-size CSS applies uniformly per bullet 3). |
| 5 | The find-in-page gate: a passed region is more reachable via `content-visibility: auto` than today's fold; one Playwright assertion, chromium + WebKit | **not independently verified** — this walk ran chromium only (no WebKit pass), and per bullet 3's finding, the premise itself no longer holds as shipped: `content-visibility: auto` was deleted, so a passed region today is exactly as reachable via find-in-page as any ordinary, unhidden DOM subtree — neither helped nor hurt by this mechanism. |
| 6 | Tests: additive `use-region-fold.test.tsx` cases; new `e2e/document/lens-density.spec.ts` (D-B16, unchanged top across a scroll-up, `scrollHeight` grows only below the frame's top) | `lens-density.spec.ts` exists and states exactly the three sentences this walk's §1 independently reproduced (0 violations at every state). The additive unit-test cases are outside a browser walk's reach — not run here; `pnpm --filter designer-portal test -- use-region-fold` would confirm them directly. |
| 7 | Rollback: `doc-lens` off, observer never attaches, every region full, page is Wave 3's page | **not tested** — this is a fixed production build serving Wave 4 code with no live flag control surface reachable from outside; out of scope for a read-only browser walk. |
| 8 | Value alone: F39, F53, F64, and the render-cost claim for content that doesn't need space in-frame | narrative — not independently falsifiable by a runtime walk. The render-cost half of this claim is undercut by bullet 3's finding: with `content-visibility: auto` deleted, off-screen `passed` regions are not currently getting the render-cost benefit the proposal named. |

---

## Shots

All 25 written to `build/w4-walk/`, `deviceScaleFactor: 1`:

- 24-cell grid: `w4-<1440|1280|390>-<s0|s2|s3|foot>-<project|prework>.png` (heights 900/900/844) — all present, all confirmed via `[data-lens-band]` height=56 at every cell.
- `w4-390-mobile-bar.png` — the mobile bar clip (§13).

Spot-checked visually: `w4-1440-s0-project.png` (136px rail, ladder segments,
margin rail's `BESIDE PIECES · 1` / `THE WHOLE JOB · 4` grouping per W5-R1,
all present as shipped) and `w4-390-mobile-bar.png` (three-line bar, matches
§13's measured text exactly).

---

## Differs (ranked)

1. **[HIGH] `[data-passed] { content-visibility: auto }` was implemented, measured, and then deleted** (`globals.css:1129-1145`) — CLS 0.8658 with it, 0.000986 without, against a gate of exactly 0. `data-passed` is still written but has no CSS effect today. This also invalidates §9 Wave 4 bullet 5's stated find-in-page benefit and undercuts bullet 8's render-cost claim as currently shipped. See §15 rows 3, 5, 8.
2. **[MEDIUM] The density observer's `MutationObserver` watches `document.body`, not `[data-document-paper]`** as the proposal's engineering-path text states — a deliberate, well-documented deviation (W4-C6: the paper element can itself be replaced on a refetch/resuspend). See §15 row 2.
3. **[LOW-MEDIUM] Five of six stops never render quiet on this seed** — only `care` mounts `quiet` at s0; the other five default `full` per their own `latchedDefault`. W4-R1's five other quiet status-line strings could not be directly exercised here; `care`'s matched verbatim. Seed-coverage gap, not a code defect. See §2.
4. **[LOW] The margin rail's own note-composer field does not trigger `data-lens-state="editing"`** — it lives in `<ResponsiveMarginRail>`, a sibling of `<main data-document-paper>` (`page.tsx:2274` closes before `:2784` opens the rail), so `isEditable`'s `.closest('[data-document-paper]')` check excludes it. Confirmed directly: focusing "Note body" leaves state `rest`, `activeInPaper: false`. Worth a ruling on whether this is intended (the margin doesn't reflow the paper, so freezing may be unnecessary there) or an oversight. See §7.
5. **[LOW] D-B38's line-2 y-offset differs by 0.05px at 1440 only** (26.14 at rest vs 26.19 pinned); 1280 and 390 are exactly equal. Almost certainly sub-pixel rendering noise, not a second real height — but it is a literal inequality against the spec's `toBe()` assertion form. See §12.
6. **[INFO] `"open"` is not a `data-lens-state` value** — the enum is exactly `rest | reading | editing | mobile`. What the walk brief calls "open" is the band's own `data-lens-open` attribute, semantically inverted (`"true"` = at rest, `"false"` = pinned). See §7.
7. **[INFO] The settle-recovery window measured 571.6ms end-to-end**, not "~120ms" — the 120ms is the quiet window counted from the *last real scroll movement*, and the fling itself (16 wheel ticks) occupies real wall-clock time before motion actually stops. `__lensSettled()` still resolved correctly. See §6.
8. **[METHODOLOGY] A `settle()`-only read of the L-10 press briefly appears to land ~225px short of `--doc-landing-clear`** in the default (non-reduced) motion register — the app's own `behavior:'smooth'` scrollIntoView can keep animating for 1–2s after the density hook's own settle flag reads `true`. A poll-until-stationary-for-500ms read gives 71.55px (≈72) cleanly in **both** motion registers — no real defect, but `data-lens-settled` is not a safe proxy for "the scroll animation is done" when reading a press's landing position. See §5.
9. **[METHODOLOGY] The reduced-motion visible-word-set comparison first read 531 vs 110 words** at s0 (a false alarm from an under-margined `quiet()` window before some late-mounting text painted in one context); a re-check with an added 2.5s buffer shows the sets are identical at both s0 (531/531) and s2 (535/535). See §9.

## Commands run unsandboxed

Per the "Chromium/Playwright and psql need `dangerouslyDisableSandbox`" note:

- `ps -p 80025 -o pid,etime,command` — confirm the server process is alive
- `docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql` — seed verification
- `node build/w4-walk.mjs` (run twice: initial pass, then after the L-10 landing-measurement fix)
- `node /private/tmp/.../debug-l10.mjs`, `debug-l10b.mjs` — isolate the L-10 landing-position discrepancy (methodology finding #8)
- `node /private/tmp/.../debug-marginnote.mjs` — isolate the margin-note editing-state finding (#4)
- `node /private/tmp/.../debug-words.mjs`, `reduced-motion-recheck.mjs` — isolate and correct the reduced-motion word-set finding (#9)

No `.env.local` was written or read. No product code, worktree, or server
state was modified. `w4-measurements.json` carries both the original
under-margined `reducedMotion` reading (as
`reducedMotion_originalRun_underMargined`) and the corrected one (as
`reducedMotion`), so the correction is auditable rather than silently
overwritten.
