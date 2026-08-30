# W5 · fix log

**Lane** `document-lens/w5-fix`, worktree `.codex/worktrees/agent-lens-w5-fix`.
**Base** `4f5291a63` (`origin/document-lens/w5`'s tip), with `document-lens/w4`'s tip
`5beeb0568` merged forward as `16426b735` — the reviewers read `be8d1eaf0`, which is
`4f5291a63` + that same w4 merge, so W5-C3 could only be triaged against it.
**Sources** `w5-review-correctness.md` (W5-C1…C7 + 15 minors), `w5-review-fidelity.md` (F1…F5),
`reconciliation.md` W4-R1 / W5-R1 / W5-R2 / W5-R3 / **W5-R4** / **W5-R5**, `deviations.md`
D-B30 / D-B39 / **D-B44** / **D-B45** / **D-B48**, plus the coordinator's four mid-lane rulings.

The lane did not write Wave 5 and did not review it.

---

## Commits

| sha | subject |
|---|---|
| `16426b735` | merge w4 tip into w5-fix |
| `a9865ed74` | W5-C1/C3/C6/C7/C9 + F1/F3/F5 — the quiet stop, the scaled read, and one margin surface |
| `e27705aaa` | W5-C2/C5/C8/C10/C11/C14/C16/C17 + F2, W5-R4(a) — the margin acts, and the pre-work head holds its box |
| `12b054e33` | W5-R5 §2/§3/§4 (N2/N3/N4) — the scope stop states what its body prints |
| `abf32722d` | item 11 / D-B48 — the paper's name wraps, and never clips |
| `ab6b94d54` | the last two basket-order artefacts |

`git diff --stat 4f5291a63..HEAD` → **63 files, +2200 / −895** (this lane's own work, excluding
the w4 merge: **52 files, +1751 / −885**).

---

## Per id

| id | outcome |
|---|---|
| **1 · W5-C1 / F1** | `PreworkRegion`'s quiet branch shipped both forms W4-R1 deleted by name — a second uppercase `<p data-region-count-line>` restating the status line `RegionHead` had just printed from the same string, and the stock `Quiet — opens as you read`. Now the head plus one sr-only sentence via `quietStateSentence`, `actsAtQuiet="leader"`, `allowNoActs` kept. New `prework-region.test.tsx` (6 cases) drives the real store with `__setDensityForTest(null)` — the reviewer's point exactly: under jsdom every rect is zero, so the density hook promotes every root on mount and the quiet branch never renders unless a test forces it. |
| **2 · W5-C2** | The row's inline act PERFORMS. Both controls called `openMarginItem`, so a button named `Send a nudge` opened a dialog and sent nothing. The act table answers `{ label, perform }`: the nudge runs `useSendDecisionReminder`, the folio runs `openInvoiceFolio` — the same implementations `margin-bodies.tsx` runs — and any act needing the item's own fetched detail is named `Open` and opens. The architect's falsifiers both ways: pressing `Send a nudge` calls the mutation and leaves the margin sheet up; the row body opens the item sheet and sends nothing. `mobile-margin-sheet.spec.ts` upgraded from "exists" to "performs". |
| **3 · W5-C3** | **Diagnosed from the failure message itself** — the W4 lane's diagnostic printed `transforms DIV:matrix(0.99974, 0, 0, 0.99974, 0, 0)` beside `offsetHeight 56` and `css 56px`, and 56 × 0.99974 = 55.98544 against the observed 55.9854736328125. The scale is `@keyframes doc-raise` (globals.css, "D12 pick-up: raise-to-fill (~270ms)", `scale(0.986)` → `none`); the read landed in its last ~2 %. The box was never wrong. Fixed where it happens: the band's eighteen cells poll their own ancestor transform chain to `none` before measuring. **The whole file is green, chromium (23/23) and webkit (23/23).** |
| **4 · W5-C7 / D-B45** | `MobileMarginChips` DELETED, both branches, with `useLetterheadMargin`, the `ffe-section.tsx` mount, its suite and **17** `jest.mock` stubs. The architect's evidence held on inspection: the file's own docstring says "the desktop margin rail owns these above 980px". `handoffs-in-margin-contract.test.ts` re-points — "counts" on the hook, **"LISTS"** on `mobile-sheets.tsx`'s `gates.map` (the half `gates.length` alone could never prove), and `existsSync(chips) === false` makes the deletion the contract; `stage2-approval-cutover-contract` drops the same file. **W5-C4 moot.** Falsifiers: `git grep MobileMarginChips -- src` → comments only; `[data-mobile-margin-chips]` count 0 at 390 and in `lens-band-height`'s 390 cases. |
| **5 · W5-C5** | The pre-work head reserves its eyebrow's line box (`min-h-[15.4px]`, D-B38's literal). All three feeds land after first paint and on direction/proposal that head is the FIRST region on the paper. Heads whose eyebrow is a constant are untouched — nothing is reserved for a line that was never going to move. |
| **6 · W5-C6 / F3** | **SUPERSEDED mid-lane by W5-R5 §2** — see below. `4 ROOMS IN SCOPE` was implemented, then retired. |
| **7 · F2 / W5-R4** | A pre-work rail head prints ONE line. `stageWord` comes from the ticket's phase, which no pre-work spread has, so the head fell through to `activeSection.sub` — `Awaiting signature`, `In discovery`, `Respond by Aug 12`. New `isPreWorkSection`; the project paper keeps its two lines and its ordinal. e2e asserts `[data-spine-stage-count]` count 0 and one line. |
| **8 → 10 · W5-R4(a) / D-B44** | Superseded from "leave a comment" to **`CAPTURE A NOTE` ships, text only**. Head row `Margin · N` / `M overdue` / `Capture a note` / CLOSE; a paper `DocSheet` named `Note to the margin` with the anchor line, an autofocused textarea, the rail's own optional due date defaulting to today, `Save` / `Discard`. The composer is the RAIL's, **re-hosted not forked** — same `useCreateMarginNote`, same `Note body` label, same 5pm convention. `NOTE · PHOTO · VOICE` and the prose line stay unshipped. Save/Discard/Escape return focus to the act explicitly (the composer returns to the MARGIN sheet, so `restoreSheetFocus`'s "never pull focus back while a modal owns it" rightly stands down). 7 jest cases + a full 390 e2e flow with `psqlRun` cleanup. |
| **9 · Minors (15)** | Below. |
| **11 · D-B48** | Below. |
| **F5** | The stale `mobile-bar.tsx` comment, and `mobile-shell.tsx`'s twin. |

### The 15 minors

| id | outcome |
|---|---|
| W5-C8 | **NO CHANGE, with reason.** `AccountBand`'s loading row invents nothing: both strings it prints (`The accounts · this project`, `Studio eyes only`) are the LOADED row's own literals, and the two data cells are empty placeholders. That is W5-R3's "the nearest printed line above it" exactly. The `<div>`-vs-`<button>` difference is correct — there is nothing to press yet. |
| W5-C9 | `Margin · 0` prints no door. A door is a way to something; that one opened an empty sheet and renamed itself `Margin · 0` → `Margin · 7` in front of the reader when the query landed. W5-R1 writes it `Margin · N`; at N = 0 there is no N and nothing behind it. |
| W5-C10 | **KEPT, ruling named at the derivation.** `Not written yet` / `Not sent yet` are ruled by W5-R2 §1 and restated by W5-R4's F3; OD-2's pair governs the RAIL's caps fallback, which both still take (`empty()`'s default is `NOTHING YET`). |
| W5-C11 | `overdueCount` filters on KIND, not just state. The DB view's invariant is not the code's: `margin_items` happens to write `'overdue'` only in the decision branch, so a state filter got the right answer for the wrong reason. The fixture that "proved" it used an invoice in state `sent`, which any implementation excludes — it is `overdue` now, so the assertion has teeth. |
| W5-C12 | The row prints its overdue stamp — **the fact the row HOLDS**, not `overdueStampLabel`, whose `Overdue · 6 days` needs an `OverdueCondition` with a due date. `MarginItemRow` carries no date field and no row→condition derivation exists, so a day count here would be invented rather than read. |
| W5-C13 | **No change** — `marginRowOwner`'s vocabulary is a fidelity question for the design lead, unpinned by any test either way. |
| W5-C14 | A line-anchored row takes L-10's order first (`onJumpRegion('ffe')` unfolds and promotes, which is what MOUNTS the line), then lands on the line two frames later. Both the jest and the e2e assertions were upgraded off the race the reviewer named: the e2e polled `scrollY !== before` immediately after a smooth scroll — motion, not a destination. |
| W5-C15 | **Moot** with D-B45. |
| W5-C16 | The `declared` path is de-duped again (`Array.from(new Set(...))`) — filtering through `PROJECT_PAPER_ORDER` gave it for free; resolving key by key did not. A guard, not a live defect. |
| W5-C17 | `scope` no longer prints `Reading…` for a number it already holds: `settled` is a fact about the PROPOSAL query, and `scopeRooms` comes from the ticket's rooms. |
| W5-C18…C22 | **No change** — notes for the W6 audit, as the review itself frames them. C19's page-level `use-margin-items` mocks hide nothing otherwise unproven (the real path is covered three ways); C22's items are trivia. |

### W5-R5 (the design review's four rulings)

| id | outcome |
|---|---|
| **§2 / N2** | `Scope & engagement` prints `CORE · STAGE 03` on the rail and `Core · stage 03` in its head, `· N ROOMS` behind it where the paper has rooms. The fact has a SOURCE: the section stage-line strip that prints it, which is now this stop's own **body** rather than a free-standing band between the letterhead and the first head. `SectionStageLineMount` reports its sub-label up (the `onEyebrow` shape) so head, rail and body are one fact; the leading `Scope & Engagement · ` segment is trimmed because the head prints that name one line above. e2e: the first element after `[data-lens-band]` on `…d6` is `[data-index-region="proposal"]`, and the strip is inside `[data-index-region="scope"]`. |
| **§3 / N3** | A group heading counts EVERY item in its group. The rail counted `raised` only and printed `BESIDE PIECES · 1` where the sheet printed `· 3`. R12 still holds — resolved items fold — but the fold lives INSIDE its own group now (`2 settled ↓`), keyed by that group, so folding never moves a heading's count and folding one group never folds another. The single global Settled section is gone. Tested on the `…d5` shape. |
| **§4 / N4** | The `SENT 7 DAYS AGO —` lead is dropped (SP-12). **The row and its act stay**, and the reason is load-bearing: `document-guide.ts`'s `SEND_WALL_ANCHOR_ID` sends the reader to `#proposal-send-wall` for exactly that act, so removing the row outright lands the guide on nothing. The state word stays too — not a restatement but the FALLBACK printed only when the table's head has taken the act; without it that case left an empty row, which `finalize-leader-hoist` proves. **Flagged:** dropping the row entirely is a ruling about the guide's destination, not a print change. |
| **§1 / N1** | Not started, as instructed — it arrived as item 11 below. |

### Item 11 · D-B48 — the name wraps

The title was an `<input>`, the one element that cannot wrap: at 390 `…d5` printed
`Aspen Loft — the long p`. The spec chose the input BECAUSE it cannot wrap and used
`scrollWidth === clientWidth` as the witness — which an overflowed input satisfies, so the guard
was blind to the defect it was chosen for. The stale rationale is **inverted in place**, not
deleted.

At rest the name is `<h1>` text wrapping at word boundaries; the visible name IS the control
(`<button aria-label="Rename the project" data-letterhead-title-edit>`, `cursor: text`, no second
glyph); pressing swaps the input in place, same box, caret at the END; focus returns to the button;
the `<h1>` never changes element type. **`Escape` now RESTORES** — it used to blur, and blur
commits, so the one key meaning "leave it alone" saved. Seven jest falsifiers.

**NOT `flex-wrap` on the `<h1>`**: its two flex ITEMS are the name and the SaveDot, which do not
wrap — the NAME wraps inside its own box. Adding it moved the baseline 0.08px and D-B38 caught it.

Gates chosen by measured line count, one number per count:

| | chromium | webkit | gate |
|---|---|---|---|
| two-line letterhead (`…d5`) | **288.72** | **286.25** | 300 (D-B48 predicted 289.7) |
| two-line first head, gross | **456.72** | **454.25** | 470 (predicted 457.7) |
| one-line letterhead (`…d4`) | **254.17** | **252.25** | 265 |
| one-line first head, gross | **422.17** | **420.25** | 435 |

3+ lines fails as a seed defect. The old D-B30 case is gated the same way rather than against a
bare 435 — the name wrapping is exactly why it moved.

**Seed.** `b0000000-0000-0000-0000-0000000000d4` (`Aspen Loft`, 10 chars), the same shape as `…d5`
in everything the LETTERHEAD reads — status, phase, the four money figures, the dates, the same
client and designer, an activating lineage proposal — created once and never deleted for the same
00390/00399 reason `…d5` is. It does **not** carry `…d5`'s 62 FF&E lines, POs, decisions or margin,
none of which the letterhead's height depends on; that is a deliberate, stated narrowing of "the
same shape". Idempotent (re-ran clean twice). `seed-verify.sql` **18/18 PASS**:

```
 one-line-name paper d4 exists (Aspen Loft, <= 11 chars) | 1 | = 1 | PASS
 margin_items total = 7                                  | 7 | = 7 | PASS
```

`seed-verify.sql`'s margin totals now filter `kind <> 'time'`, because the PRODUCT counts it that
way (`use-margin-sheet.ts` filters time out before it counts, which is why the sheet reads
`Margin · 7`). Without it the check fails on any stack where the studio timer has ever run — a row
the seed never wrote and the margin never prints. **It failed here for exactly that reason**, and
the two rows were e2e timer residue, not seed drift.

---

## Two findings the lane surfaced that the reviews did not

1. **`margin_notes.anchor_id` is a `uuid`, and no column records the stop.** W5-R4(a) ruled the
   composer writes `anchor_kind: 'section'` with the reading stop. A stop key (`'ffe'`) is not a
   uuid: writing one is a 400 (`22P02 invalid input syntax for type uuid`) — **caught by the e2e,
   not by reasoning**. Falling back to `anchor_kind: 'section'` + `anchor_id: null` would have
   left the note claiming an anchor it did not have.

   **Ruled, and shipped: `D-B44(a)`** — the composer always writes `anchor_kind: 'letterhead'`,
   `anchor_id: null`, from every stop; **`W5-R6`** — the composer's anchor line prints
   `ABOUT THE WHOLE JOB` at every stop, not `BESIDE <STOP>`. The note is about the whole job
   because that is the only thing the row can honestly say it is about.

   **State it plainly: which stop a note was captured beside is not recorded anywhere.** Not in
   `anchor_kind`, not in `anchor_id`, not in the body. It is not a degraded reading of the data —
   the datum does not exist. Recording it needs a column `margin_notes` has not got
   (**owed migration, D-B44**).
2. **Five instruments were reading a still-arriving paper.** `lens-rail-budget`'s D-B37 baseline
   (every segment at the 40px minimum, then step 1 read the real derived floors — `ffe: 40 →
   138.63`), `quiet-responsive-shell`'s Money landing (153.98 off the declared 72) and its
   sections-door case, `prework-regions`' opener (one read `Reading…`), and D-B38's float equality.
   All passed alone and failed only late in the eight-file basket. Four took D-B28's ruled
   `quiet()` precondition; D-B38 took a one-decimal tolerance (its defect was a 7.7px lift — two
   orders of magnitude away from the 0.02px noise).

   A **global** "no finite animation is running" precondition was tried first and is NOT kept: it
   slowed every settle in the basket (8.3m → 11.2m) and moved D-B37's baseline into the
   data-arrival window, turning it red. Recorded because it looked right and was not.

---

## Follow-ups after the correctness sign-off

Three rounds, all in this lane. `D-B44(a)` and `W5-R6` are the two rulings that closed finding 1
above; everything else is a defect the sign-off named.

| id | outcome |
|---|---|
| **W5F-05** (blocker) | **`D-B44(a)` + `W5-R6` shipped.** The composer writes `anchorKind: 'letterhead'`, `anchorId: null` from **every** stop — not `'section'`, at no stop — and its anchor line prints **`ABOUT THE WHOLE JOB`** everywhere, never `BESIDE <STOP>`. The e2e asserts the printed line, not the payload alone. Finding 1 and ruling 1 of this log rewritten to the shipped form, including the plain statement that the capturing stop is recorded **nowhere** (owed migration). |
| **W5F-02** (defect) | The stage-strip suppression gate was `isPreWorkSection` — all four pre-work stages — but the `scope` stop that re-hosts the strip mounts on the **proposal spread only**. Brief, discovery and direction therefore lost the strip outright instead of re-hosting it. Now `stageStripInScope = stageStripSpread === 'proposal'`; the three section-mode spreads keep the free-standing strip that `section-stage-line-mount.tsx`'s section branch exists to serve. |
| **W5F-04** (defect) | `preworkStageLine` was derived in render with a side effect in its path; now a pure `useMemo` over `row?.active_section` alone. |
| **W5F-06** (defect) | The rail and the mobile sheet each decided *twice*, in their own words, which margin rows are listable and how they group — and had already drifted (`kind === 'time'` filtered in one place, counted in the other). New `src/lib/document/margin-groups.ts`: `marginListable()` and `groupMarginRows(rows, { order, decorate })`, imported by both. `seed-verify.sql`'s margin totals filter `kind <> 'time'` to match. |
| **W5F-01** (minor) | Duplicate `PREWORK_SECTIONS` in `page.tsx` removed — one list. |
| **W5F-03** (minor) | Both stage-strip gates read one `stageStripSpread`, so they cannot disagree about which spread this is. |
| **W5F-07** (minor) | The one-line-name paper the D-B48 gates need moved to seed id `…d7` with a 5-phase main lane. **Not `…d4`** — that id is `Marrow & Vale Residence`, already owned by `supabase/seed/schedule-extremes.sql`, and the first attempt renamed it and gave it 12 phases. Repaired by hand and re-run; `seed-verify.sql` gains two checks (`…d7` exists, `…d7` has 5 phases) → **19/19 PASS**. |
| **1b** (medium, gating) | **Escape meant two things at once.** In the D-B48 title field it restored the name (`D-B48`) — and the same keystroke reached the shell's Put-down (D1), which pushed `/desk`. The reader corrected herself and lost the paper. Fixed at **both** ends, deliberately: the input stops the key (`stopPropagation` + `nativeEvent.stopImmediatePropagation`, since the shell's listener is on `document`, outside React's tree), restores `serverTitle`, and returns focus to the name button; and the shell's own handler now ignores editable targets via `isEditableTarget`, **exported from `use-lens-state.ts`** so the guard that decides `editing` and the guard that decides Put-down read one selector and cannot drift. Either half alone would close the report; the shell half is the one that holds when a future field forgets to stop the key. Jest for both halves — the shell's case fires at a field appended **outside** React's tree, so it cannot pass on the input's `stopPropagation` — plus the three lines in `lens-band-height.spec.ts`'s D-B48 case: pathname unchanged, `<h1>` visible carrying the name, focus on the name button. |
| **Strip label** (low) | Hosted inside `scope`, whose head already prints the stop's name and status, the strip printed its own label line under it — `Core · stage 03` three times down one column — and added a second `Workflow stage` landmark inside the stop that already carries that name. `SectionStageLine`/`SectionStageLineMount` take `hosted`: the label line and the sr-only eyebrow drop, the frame becomes a plain `div` (no landmark, no dangling `aria-labelledby`), and the bars with `CORE · 03` are the body. Free-standing, both are unchanged — asserted both ways. |

### NF-01 — a real ellipsis, left visible

A margin row's long form clipped by **1px** at one width. The first read was rounding (204 against
203); a precise `Range` measurement proved text **204.45** against a box **202.58** — a genuine
ellipsis, not noise. Traced to `+10 MORE`: two digits, driven by the date, and the `standing`
segment beside it comes from the ticket's needs rather than the margin, so neither is a constant
this lane can size against. Recorded as an enumerated **`test.fixme`** carrying the full
measurement rather than papered over with a wider gate.

---

## Gates

```
type-check   0
lint         2 errors — piece-room-save-gate.test.tsx:159,
             use-commercial-documents.test.ts:930 (both pre-existing, do-not-touch)
jest         475 suites · 5625 tests · 0 failing   (the reconciliation below)
seed-verify  19/19 PASS
shadow-gate + contrast + lens-css-scope: 3 suites, 64 tests, PASS
```

### Jest reconciliation

| | suites | tests | failing |
|---|---|---|---|
| base `16426b735` (w5 tip + w4 tip), `--json` | 476 | 5619 | **2 (1 suite)** |
| `document-lens/w5-fix` | **475** | **5625** | **0** |

**W5F2-03 — the two numbers reconciled.** The Gates block above read
`476 suites · 5639 tests` while this table read `475 / 5625`; the program plan's rule is that a
suite count cannot move without a written reconciliation, so here it is. **`475 / 5625` is the
measured figure** and the Gates block now states it. The `476 / 5639` reading was taken mid-lane,
before the last two commits: it still counted `mobile-margin-chips.test.tsx` (the +1 suite, 14
tests) which D-B45 deletes together with the component it tests. 5639 − 14 = 5625, and 476 − 1 =
475. Nothing else moved between the two readings.

**The base was already red**, and its only failing suite is `mobile-margin-chips.test.tsx` —
the component's own tests, failing because the component printed at no width, which is W5-C7's
finding. D-B45 deletes suite and component together, which is the −1 suite; +6 tests net across
the new `prework-region` suite, the composer and act falsifiers, D-B48's seven, N3's, and the
retired chips cases.

### E2E — dev :3010 (`:3000`, the walk's prod server, and `:3013` untouched)

**chromium — 67 passed, 0 failed, 0 not-run.** `prework-regions` · `mobile-margin-sheet` ·
`lens-band-height` · `lens-density` · `lens-cls` · `lens-rail-budget` ·
`workflow-stage-responsive` · `quiet-responsive-shell`.

**webkit, sharded — 14 passed** (`prework-regions` + `mobile-margin-sheet`) and **23 passed**
(`lens-band-height` alone). **0 failed.**

**After the three follow-up rounds, re-run:** chromium **48 passed, 1 skipped, 0 failed**
(`prework-regions` · `mobile-margin-sheet` · `lens-band-height` · `lens-rail-budget` ·
`workflow-stage-responsive`); webkit **15 passed** (`prework-regions` + `mobile-margin-sheet`)
and **23 passed, 1 skipped** (`lens-band-height`). The one skip is NF-01's enumerated `fixme`,
in both engines. `D-B48 — Escape leaves the name alone and does NOT put the paper down` is
green on both.

⚠ **Cold-server artefact, recorded.** The first chromium attempt failed seven tests at once,
every one on `expect([data-document-shell]).toBeVisible` timing out at 30s. Nothing was wrong
with the paper: seven workers hit a freshly booted dev server and the `/doc/[id]` route had not
compiled. The single test that happened to run after compilation finished passed in 5.4s. Warm
the route first (`curl /doc/…`), then run. A basket that fails *identically everywhere* is
usually not N defects.

Numbers printed: paper CLS **0** in both motion registers (chrome 0.0000554); D-B38 line 2
`s0 26.19 / pinned 26.19` at all three widths; rail census 13 (ceiling 13) long, 7 (ceiling 9)
pre-work; D-B48's eight measurements above.

---

## Left for a ruling

1. **The stop a note was captured beside is unrecorded** (above) — RULED for this wave
   (`D-B44(a)` payload, `W5-R6` print: `letterhead` / `null` / `ABOUT THE WHOLE JOB`, and the
   composer no longer claims otherwise). What remains open is the **migration** that would give
   `margin_notes` somewhere to put the stop, and whether that is wanted at all.
2. **W5-R5 §4's full reading** — dropping the send-wall row entirely would orphan
   `document-guide.ts`'s `SEND_WALL_ANCHOR_ID`.
3. **W5-C13** — `marginRowOwner`'s `Client / Vendor / You / Field` vs D-B30's
   `OWNER CLIENT/DESIGNER/MAKER`.
4. The **`…d7` seed's deliberate narrowing** — letterhead-shaped, not FF&E-shaped. (Was written
   `…d4` before W5F-07 moved the one-line-name paper off that id: `…d4` is
   `Marrow & Vale Residence`, already owned by `supabase/seed/schedule-extremes.sql`. The
   narrowing is also smaller than first stated — `…d7` is seeded with a 5-phase main lane, so
   the schedule is not empty, only the FF&E is.)
