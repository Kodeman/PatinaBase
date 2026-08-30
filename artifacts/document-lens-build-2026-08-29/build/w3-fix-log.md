# W3 FIX LANE — one row per finding id · 2026-08-29

Branch `document-lens/w3-fix` off `document-lens/integration@4915583c2`, worktree
`.codex/worktrees/agent-lens-w3-fix`. Seven commits; not merged (the reviewers sign first).

| sha | subject |
|---|---|
| `1c3184fcd` | fix(document): the band ranks by deadline distance, and prints two forms |
| `cef6831bc` | fix(document): the band owns its sentinel, and stops clipping its own act |
| `bb5904751` | fix(document): a folded region says who closed it |
| `15cd94ea6` | fix(document): the letterhead grid — the title never clips again |
| `6a54d52b0` | fix(document): the pre-work rail, the head's status track, and the 24px gap |
| `ba94fc5b0` | feat(document): the lens line's telemetry, and the page memoises its model |
| `52a595366` | test(document): tests that can fail, pointed at what actually prints |
| `<final>` | test(document): the e2e budgets stand apart from the defects they were bundled with |

---

## Closed

| id | commit | evidence |
|---|---|---|
| **W3-R1 / FID-01 / C-07** | `1c3184fcd` | `rankStanding` sorts on `sense`(past/ahead/none) → `distance` → (silences only) `standingSince` → `needTieBreakRank` → input order. `TIER_ORDER` deleted. `shortenAct` keeps the FIRST word. Falsifier in `lens-band-derivation.test.ts` ("puts a window closing tomorrow above a decision due weeks out": distances `[1, 21]`) and in `page.test.tsx` ("leads line 2 by deadline distance", rewriting the tier-order pin at the old `:1544`). |
| **D-B24 / R2** | `1c3184fcd` | `LENS_LINE2_MEASURE_PX {full:900,narrow:950,mobile:327}`, `LENS_LINE2_PX_PER_CHAR 7.7`, `LENS_MONO_PX_PER_CHAR 7.5`, `LENS_LINE2_GAP_PX 9` in `lens-constants.ts`; `LENS_LINE2_MAX_CHARS`, `truncateLine`, `trailingQualifier` deleted. `LensStandingItem.short = {state, days, subject ≤12}`; `line2.long` / `line2.short` / `line2.form`; `LensBandInput.tier` from the page's media tier. `data-lens-line2-form` on `[data-lens-line="2"]`. `LINE_CLIP` is the backstop only. **Jest twin**: every one of the eight seeded items' short form fits 327 with act + door, and every long form fits 900. |
| **D-B26 dedupe** | `1c3184fcd` | `LensStandingItem.namesMoney` (ticket `money` row, need kind `overdue_invoice`); `rightSlot()` drops the money half and nulls `moneyOnly`. Three jest cases on the `…d5` shape. |
| **W3-R2 / FID-03** | `1c3184fcd` | `StandingSheet` takes `inputs`; title `Standing · ${items.length + inputs.length}`; `[data-standing-input-heading]` prints `INPUT NEEDED · N` under a rule, `[data-standing-input-row]` rows below the exceptions. `+N MORE` counts both. `page.tsx` builds them from `guideInputs` (C-6): eyebrow = the label's last word, sentence = `label · owner · blocks stage`, act = the guide's. |
| **FID-02** | `bb5904751` | `FoldSeamProps.cause`; `[data-fold-cause]` inside the summary cell (a fourth grid child would open an implicit second row and break the one-line 44px control). Seven call sites pass `fold.cause`, one added attribute each. DL-09 verified: `cause` is non-null iff `explicit === true`, no second condition. **Two corrections to the review's list** — `previous-work.tsx` renders no `FoldSeam`; `project-mood-boards.tsx` and `schedule-spine.tsx` do. |
| **C-01** | `cef6831bc` | `data-lens-state` gone from `lens-band.tsx`; a jest case asserts it is absent both open and pinned. `data-lens-open` stays. |
| **C-02** | `cef6831bc`, `52a595366` | The clip is on `[data-lens-sentence]`; line 2 keeps `whitespace-nowrap` only. jsdom asserts the class split; the 390 e2e cell measures `getComputedStyle(line2).overflow === 'visible'`, the act box at **46.56 × 44px**, and `elementFromPoint` hitting the act 2px inside its top AND bottom edges. |
| **C-03** | `ba94fc5b0` | `bandModel` hoisted above the early returns into a `useMemo`. Deps are VALUES (`inputSignature`, `guideHeadline`, `guideActLabel`, `bandStageWord`, …), not the arrays/models above it, which are rebuilt every render from the same reads. `bandStop` is its own memo. |
| **C-04 / FID-04** | `cef6831bc` | `LensBand` observes `#doc-ticket-sentinel` (`threshold: 0`) and owns `open`; the `open` prop is gone and `page.tsx` no longer passes `letterheadInFrame`, which now feeds only the rail head (D-B23). `onPinChange` added. Both jest suites drive a capturing IO mock, so the adjacency assertions guard a live mechanism again. |
| **C-05 / A-07** | `cef6831bc` | `[data-document-paper] { padding-block-end: calc(100dvh - var(--doc-landing-clear) - 4rem) }`. |
| **C-06** | `cef6831bc` | `scroll-padding-bottom: max(72px, calc(60px + env(safe-area-inset-bottom)))` — the shell's own bottom inset restated. |
| **C-08** | `cef6831bc` | `LENS_ANNOUNCE_DEDUPE_MS` imported from `lens-constants.ts`; `LENS_TURN_OUT_MS` moved there and imported. No local re-declaration. |
| **FID-05** | `cef6831bc` | `prefersReducedMotion()` guard (SSR-safe, `typeof window`/`typeof matchMedia`) swaps `printed` synchronously with no timer. Jest case drives a reduce-matching `matchMedia` and asserts the new words are on the page with `opacity-100` and no timer run. |
| **FID-06 / RF-02** | `cef6831bc` | `stagePhrase.bottom` gets `data-spine-stage-count` and its own muted/primary ternary off `letterheadInFrame`; it was inheriting an unconditionally muted parent. |
| **D-B22** | `ba94fc5b0`, `52a595366` | `lensLineShown`/`lensLineActed`/`lensStandingSheetOpened` in `document-events.ts` with the D-B22 payload; `guideShown`/`guideSelected` deleted with their event names. Fired from `page.tsx` — `shown` from a `useEffect` keyed on `[id, line2.kind, act key, standingCount]`, `acted`/`opened` from the callbacks `LensBand` receives. No `posthog.capture` in `lens-band.tsx`. `document-guide.test.tsx`'s telemetry cases moved to `page.test.tsx`. |
| **D-B26 / B1 / W3-R4** | `15cd94ea6` | Title row spans both tracks; row 2 = chip + vitals \| ledger in `minmax(18rem,24rem)`; labels shed the family word at every width, `SHARING` alone at 390, full `aria-label`s; 32px title at 390. **Measured at 1440: title `scrollWidth === clientWidth` (900/900), vitals 17.5px, ledger 2 rows** — B5's defect closed. The two BUDGET numbers are not met; see "Owed" below. |
| **B4** | `6a54d52b0` | The empty-track line was in the markup and invisible: a definite `flexBasis: 0` with `flexGrow: 0` laid the box out at zero height and `overflow-y-auto` clipped it. Now `flexBasis: auto` on an empty spread. `FILED WITH THIS JOB` prints only with ≥1 door. **`…d6` genuinely has zero doors** (`project_id` NULL → OD-8 withholds the four project doors; `clientCopy` is set only on the Finalize table), so the heading is omitted — the ruling's second branch. |
| **B5** | `6a54d52b0` | `min-[1180px]:grid-cols-[minmax(20rem,1fr)_auto]` on `[data-region-head]`. `minmax(0,1fr)` would have been a no-op (the left cell already has `min-w-0`) and `shrink-0` is inert on a grid item — the cause was the `auto` track sizing to the ledger's max-content. |
| **B7** | `6a54d52b0` | `KickoffBand` and `AccountBand` roots take `mt-[var(--doc-region-gap)]` and no bottom margin; `ScheduleRuleRegion` already had it. **Measured, block-to-block on `…d5` at 1440/s0: 24.0 · 24.0 · 24.0 · 24.0 · 24.0 · 24.0 · 24.0** — every gap on the stop path. (Letterhead→band is 18 from the header's own `mb-4`; last block→colophon is 63 from the colophon's ruled `mt-14`.) |
| **D-B25** | `52a595366` | `margin-handoffs.spec.ts:154` pins BOTH supersessions (`#document-next-up` count 0 AND `section[aria-label="Needs attention"]` count 0), asserts `[data-lens-line="2"][data-lens-line2-kind="standing"]`, opens `[data-lens-more]` and matches one `[data-standing-row][data-standing-tier="overdue"]` on the sheet-row regex with act `Chase the approval`. **PASSES on chromium.** `:193` stays `test.fixme` with its reasoning; only its selector is brought forward. |
| **C-15** | `52a595366` | Both `worktable-finalize` cases now read the rendered band inside `renderPage()`. The `SENT AUG 10 · $5,000` fixture assertion — a line the shipped page cannot print — is replaced by an explicit assertion that no `$5,000` reaches the right slot and no placeholder stands in its place (W3-R4). |
| **C-16** | `52a595366` | The two self-referential cases deleted; the count case (which `TableFrame` could in principle fail) kept and its sibling restated as a count too. |
| **C-17** | `52a595366` | `page.test.tsx` asserts `document.querySelectorAll('[aria-live]')` has length 1 on a rendered page — OD-7's invariant is the document's, and it had only ever been asserted inside the band. |
| **C-18** | `cef6831bc` | The vacuous jsdom `--doc-seam-height` absence assertion dropped; the `ResizeObserver` half (which has a subject) kept, and the Playwright one (which has a live publisher for a subject) untouched. |

## Judged no-change, with the reason

| id | reason |
|---|---|
| **C-09** (`use-lens-frame` leaks a queued rAF) | Real, but outside every item in the brief and inside a hook W4-L1 owns. Not touched rather than touched half-way while another lane edits it. |
| **C-10** (the letterhead watch retires and never re-arms) | Same hook, same owner. Its blast radius shrank with C-04: `letterheadInFrame` no longer drives the band's pin, only the rail head's yield. |
| **C-11** (`aria-atomic` re-reads the stop announcement) | Not in the brief. Real; the write-side dedupe is correct and the read-side repetition is the gap. Cheap fix (clear `announcement` when `printed` changes) left for a ruling. |
| **C-12** (sheet close can drop focus to `<body>`) | Not in the brief, and OD-6 as written names the same element as trigger and fallback — the contract's hole as much as the code's. Needs a ruling, not a patch. |
| **C-13** (`--doc-quiet-reserve` token drift) | W4 territory (OD-12's consumer is a W4 deliverable); renaming a shipped token from this lane would collide with W4-L1. |
| **C-14** (`1rem → 16px` has no ledger row) | A deviations-ledger row, not code. The artefact is the design lead's file, not this lane's. |
| **C-19** (a ticket-only exception silences the guide's act) | The review itself calls it "a ruling question rather than a slip". Note: after W3-R1 it is far less reachable — an actless ticket exception now has to win on deadline distance, and the `…d5` money row (distance 0, tie-break 5) no longer leads. |
| **C-20 / FID-09** (`deriveRedLetterModel` dead) | Not in the brief; deleting an exported symbol another lane may adopt is not this lane's call. |
| **C-21** (`moreId` unreferenced, no dialog semantics) | Not in the brief. |
| **C-22** (`ffe-section.tsx` `scroll-mt-16`) | Not in the brief; the CSS rule wins on specificity so nothing changes today. |
| **C-23** (`line2.kind === 'none'` unreachable) | Still reachable in principle and now covered by the derivation suite's empty-spread case, which asserts the whole `line2` shape including `form: 'long'`, `short: null`. |
| **C-24** (ladder segments carry `data-index-region`) | Explicitly a W4 forward hazard; the review's own fix is a W4 CSS scope. |
| **FID-07** (approvals lost `py-6`) | **NOT implemented, per the brief.** Confirmed present: `project-approval-document.tsx`'s open-state root reads `mt-[var(--doc-region-gap)] min-w-0 border-y border-[var(--border-subtle)]` with no `py-6`. It looks like collateral of the `mt-6 … py-6` → `mt-[var(--doc-region-gap)]` string replacement rather than a ruled simplification: nothing in the proposal, reconciliation or technical design asks for the internal padding to go, and `RegionRule`/`FoldSeam` add no margin, so the region's head and content now sit flush against its own `border-y`. Restoring `py-6` alongside the new `mt-` is a one-token change whenever it is ruled. |
| **FID-08** | Same as C-14 — a ledger row, not code. |
| **FID-10** ("add the schedule content block's reserved height") | **NOT implemented, per the brief.** Confirmed: `globals.css` declares `--doc-quiet-reserve-min: 68px` / `--doc-quiet-reserve-exc: 112px` and nothing consumes them — no `min-block-size` rule, no `data-density` selector in the CSS, and no component branches on `fold.density`. This is the same stub C-13 names under a different token pair, and its consumer is OD-12, a W4-L1 deliverable. Nothing is missing from Wave 3's own surface; the proposal's bullet is priced into Wave 4. |

---

## Owed a ruling — the two letterhead BUDGET numbers (W3-R4)

The defect B5 named is closed and asserted. The budgets are not met, and the arithmetic
says they cannot be met as W3-R4 states them. They are asserted in their own cases,
titled `… (W3-R4 budget — OWED A RULING)`, left failing rather than weakened.

**1440, measured (chromium):** `pt 14 + mark row 51.25 (40 + 11.25 mb) + title 44.1 +
gap-y 9 + ledger row 101.4 (TWO rows) + pb 18 = 238.9` against ≤170. W3-R4 priced the
mark row at 44, counted no grid gap, and assumed a ONE-row ledger at 44. Even with a
one-row ledger the shipped chrome measures ≈185.

**Why the ledger cannot be one row inside `minmax(18rem,24rem)` = 432px:**
`DocumentAction`'s base class is `font-mono text-[12px] tracking-[0.1em]`, not the 11px
at 7.5 px/char W3-R4's arithmetic assumed. Measured act boxes at 1440:
`MESSAGE 72 + PREVIEW 71 + SHARING · MILESTONES 180 + CALL SHEET · 0 130 = 453px`,
plus 3 × 13.5px gaps = **493.5px**. webkit measures 249.25 (it lays out 950px of measure).

**390, measured:** letterhead **312.67** against ≤240 (title 35.5 one line, vitals 36.25
two rows, ledger 97 two rows), first `[data-region-head]` at **610.92** against ≤390.

**The 390 first-head miss is mostly NOT the letterhead.** Measured settled stack at
390×844 on `…d5`: letterhead bottom 366.7 → band 56 → bottom 422.7 → **`MobileMarginChips`
(`div.flex flex-wrap … min-[980px]:hidden`) 157.3px** → first head 610.9. W3-R4's formula
(`32 + LH + 24 + 56 + 24 + 14`) counts no chips block at all. Of the 221px overshoot,
≈32 is the letterhead and ≈157 is the chips.

Two levers, both the DESIGN LEAD's: widen the right track past 24rem (≈34rem fits one
row at 1440), or shorten the ≥1180 labels the way 390 already shortens them — and, at
390, rule where `MobileMarginChips` stands relative to the header budget.

---

## Divergence from a cited example, stated not silently taken

`shortenAct` keeps the act's **first** word, exactly as the brief and W3-R4's
`CHASE THE APPROVAL → CHASE` / `FILE THE CLAIM → FILE` examples require. D-B24 and the
design review also list `SEND REMINDER → REMIND`, which no word-selection rule produces —
`REMIND` is a morphological transform of "reminder". This lane prints `SEND`. No gate
depends on `REMIND` (the D-B24 390 falsifier that asserts it is not in this lane's items).

---

# PASS 2 — W3-R5, the fidelity sign-off (NF-01/NF-02) and the correctness sign-off (N-01…N-13)

Same branch, same worktree. Jest **465 suites / 5418 tests, 0 failing** (pass 1 was 465/5404;
delta +14, every one named below). Type-check 0. Lint the 2 known. e2e chromium **exit 0,
23 passed**; webkit **exit 0, 16 passed**.

| id | state | evidence |
|---|---|---|
| **W3-R5 §1** labels | closed | `SHARING` alone at every width; the ≥1180 set is `MESSAGE · PREVIEW · SHARING · CALL SHEET · N`. `aria-label` keeps `Sharing · Milestones` at both tiers (asserted). `useWideTier`/`WIDE_TIER` deleted — nothing in the letterhead reads the viewport in JS any more. |
| **W3-R5 §2** register | closed | The ledger's acts print at the 11px mono floor below 1180 and 12px at/above it. **Mechanism: a wrapper class on the group**, not a prop on `DocumentAction` — `[&_.da-act]:text-[11px] min-[1180px]:[&_.da-act]:text-[12px]`. It is the smaller change (one className string vs. a new API on a component used portal-wide) and the only one that actually wins: `DocumentAction`'s own `text-[12px]` is a single class, so a `text-[11px]` handed down as `className` would race it in the stylesheet, where the descendant selector `.parent .da-act` (0,2,0) beats it outright. Verified in the browser: `actFont: "11px"` at 390, `min-h-[44px]` untouched. Also dropped the group's now-redundant `mt-1` (the grid's `gap-y` already separates row 2). |
| **W3-R5 §3** budgets | re-pointed; **three declared `test.fail()`** | 185 / 250 / 400 replace 170 / 240 / 390, and the first-head gate is net of the chips with the gross printed. Measured: **1440 letterhead 192.06** (was 238.9 — the ledger is now ONE row), **390 letterhead 308.17** (was 312.67), **390 first head 476.17 net / 633.42 gross, chips 157.25**. Still over; see "The three budget numbers" below. |
| **FID-07** | closed | `py-6` restored on the approvals open root; the folded branch is untouched. |
| **C-11** | closed | The announcement clears when the printed line turns. **Keyed on the printed WORDS, not on `printed`**: the page rebuilds the model object on every settling read, and an identity key wiped the stop line one commit after the announce effect wrote it — caught by the existing dedupe case going red. |
| **C-12** | closed | `fallbackFocusRef` is a resolver object whose `current` getter walks door → line-2 act → band root (`tabIndex={-1}`); `DocSheet` reads `.current` in its cleanup, so the chain resolves at close time. Two cases: the door unmounting under the open sheet lands focus on the act; with neither door nor act left it lands on the band, never `<body>`. |
| **item 7** `SEND` | confirmed | First-word rule stands. `grep -rn "REMIND" src e2e` → one hit, the assertion `shortenAct('SEND A REMINDER') === 'SEND'`. D-B24's `REMIND` example appears in no expectation. |
| **NF-01** | closed, **fixture diverged** | New describe in `lens-band-height.spec.ts`, chromium + webkit. Measured: 390 prints `OVERDUE 7D · INV-2026-114`, `scrollWidth 204 / clientWidth 204`, act `SEND`, `+N MORE` visible, `form="short"`; 1440 prints the full 76-char sentence, `form="long"`. **The ratified `psqlRun` paid-mutation is NOT implemented, deliberately**: marking the invoice paid removes the `overdue_invoice` need itself, so the case would assert a sentence the paper no longer prints. The mutation existed to make the long invoice sentence outrank the ticket's short `$17,500 owed you` under the retired tier sort; after W3-R1 + N-01 the invoice ranks worst on its own date (−7), which the test proves on the untouched seed. A fixture that must not run is a stronger result than one that does. |
| **NF-02** | closed | `sm:text-[40px]` → `min-[1180px]:text-[40px]` at all three sites (`doc-letterhead.tsx` ×1, `letterhead-vitals.tsx` ×2) and in the `doc-letterhead.test.tsx` class assertion. `sm` is 640px, so every phone above it was already getting the 40px title W3-R4 rules out at 390. |
| **N-01** (major) | closed | `RedLetterRow.dueOn` carries `NeedLine.dueOn` through `page.tsx`; `LensStandingItem.deadline`; `rankStanding(rows, needs, now)` and `LensBandInput.now`, injected, never `Date.now()` inside the derivation. Distance = `calendarDaysUntil(deadline, now)`; the sentence regex survives as the LAST resort only. `short.days` derives from the same distance. **`po-silence` is a silence whatever date it carries** — `po_unacknowledged` sets `dueOn` from the PO's SENT day, which read as a deadline would rank a 14-day quiet above a window closing tomorrow, against W3-R1. **Proved end to end**: before, 390 printed `OVERDUE · INV-2026-114` (no count, the regex finding nothing in "— oldest due Aug 22"); after, `OVERDUE 7D · INV-2026-114`. Falsifiers rewritten on the desk's real emitted shapes, including the `overdue_decision` vs `overdue_invoice` case (both tie-break 2, separated only by their dates) and a case that strips `dueOn` to show the regex is not what is working. |
| **N-02** (major) | closed | `LensBandLine2.withheld = standingCount − (worst ? 1 : 0)`; the band prints `printed.withheld`. Three derivation cases, asserting the DOOR: a guide line with one open input prints `+1 MORE` (W3-R2's own example, where `standingCount − 1` printed no door at all). |
| **N-03** (major) | closed | **(a)** no JS tier swap is left in the letterhead — W3-R5 §1 removed the only label variant and §2's register is CSS, so `useWideTier` is gone and nothing reflows on the first client frame. **(b)** the latch compares the LONG form (`sameItem`), so the tier settling under the model is adopted in place, and a `hasPrinted` ref makes the first model print directly. At 390 line 2 no longer blanks for 90ms on every load. No `useLayoutEffect`, no hydration mismatch. |
| **N-05** | closed | `LensAct.key`; telemetry `action_key` is the act's key (`task_due-0`), never its printed label — which changes with the short form, a rewording or the tier. |
| **N-06** | closed | `border-[var(--rule-mid)]` → `border-[var(--doc-ink-border)]`. `--rule-mid` is the shorthand `1.5px solid #2C2926`, so `border-<arbitrary>` set an invalid `border-color` and the rule fell back to `currentColor` — terracotta, inherited from the eyebrow class on the same element. |
| **N-07** | closed | Vitals row: `overflow-hidden text-ellipsis` → `overflow-clip [overflow-clip-margin:6px]`. The row holds real focusable acts (`Set dates`) whose focus ring was clipped flat; `text-ellipsis` was inert on a flex container. |
| **N-08** | closed | `shortSubject` cuts at a word boundary ≤12; three cases including a single over-length word. |
| **N-10** | closed | The telemetry case asserts `toHaveBeenCalledTimes(1)`, not just the last call. |
| **N-11** | closed | `lensLineShown` is gated on `hydrated && resolutionState !== 'loading' && 'error'`; a new case renders the loading tree and asserts nothing fires. |
| **N-13** | closed | The three budget cases are `test.describe(… ) { test.fail() }` with the decomposition written above them. Both browsers exit 0; no silently red case remains. |
| **N-04** | no change, as ruled | W3-R4's 32px title at 390 and W3-R5's `SHARING` at every width both sit in `deviations.md` under D-B26 as recorded deviations; nothing to carry. |
| **N-09 / N-12** | report only | N-12 = this reconciliation. |

## Jest reconciliation, pass 1 → pass 2 (N-12)

465 suites both passes (no new file). **5404 → 5418, +14**, all four named:

| suite | Δ | what was added |
|---|---|---|
| `lens-band-derivation.test.ts` | +9 | 5 N-01 deadline cases, 3 N-02 door cases, 1 N-08 word-boundary case |
| `lens-band.test.tsx` | +3 | 1 C-11 case, 2 C-12 focus-chain cases |
| `page.test.tsx` | +1 | N-11 (nothing fires from the loading tree) |
| `letterhead-instruments.test.tsx` | +1 | W3-R5 §2 (the 11px floor, and the 44px target it does not touch) |

Two suites (`add-line-sheet`, `payment-milestones-builder`) reported "failed to run" on one
full-suite pass and passed in isolation and on every re-run — worker flake, not a change.

## The three budget numbers (owed, and why)

Each is `test.fail()` with its arithmetic in the spec. The **defects** are closed; what is left
is that the ruled figures were priced against an idealised stack.

- **1440 letterhead 192.06 vs ≤185 (+7.06).** `pt 14 + mark 51.25 + title 44.19 + gap-y 9 +
  row2 54.63 + pb 18 + 1`. Row 2 is the **chip+vitals cell (54.63), not the ledger (48.5)**:
  chip 25.88 with `mt-1.5` 6.75, vitals 17.5 with `mt-1` 4.5. W3-R5 priced it `29 + 20 = 49`
  and did not count those two internal margins (11.25). Trimming a letterhead's internal
  vertical rhythm to reach a number is the design lead's call, not this lane's.
- **390 letterhead 308.17 vs ≤250 (+58.17).** The ledger is still TWO rows (97 vs 44). At the
  11px floor the four acts measure **67 + 66 + 66 + 120 = 319 + 3 × 13.5 gaps = 359.5** in a
  327px run. W3-R5's 303 counted the GLYPHS at 7.5 px/char but not `DocumentAction`'s own
  `px-[6px]` (12px × 4 = 48) or its `tracking-[0.1em]`. The vitals are also two rows (36.25
  vs 20). Levers: trim the acts' horizontal padding at 390, or shorten `CALL SHEET · N` (120px,
  the widest of the four).
- **390 first head 476.17 net vs ≤400 (+76.17)**, gross 633.42 with `MobileMarginChips` 157.25.
  Carries the letterhead's overshoot plus the chips' own wrapper. D-B27 (the mockup's 390
  Margin sheet) is the ruled home for that block.

Progress this pass: 1440 letterhead **238.9 → 192.06**, SC1 **379.94 → 360.06**, the ledger
**2 rows → 1** at 1440.

## WebKit

`lens-band-height` is fully green on webkit (16 passed, exit 0). NF-01's fit assertion carries a
**9px allowance on webkit only**, written down: WebKit lays out a classic scrollbar and measures
against the layout viewport, so the same 390 frame gives ~4px less measure than chromium — the
same gutter behind `docClientWidth 1431` at a 1440 viewport in `e2e-baseline.md`. The regex on
the sentence's text already proves no words are lost; the allowance is on the visual-elision
check alone.
