# Judge J2 — Product and engineering

*Axes 4, 5 and 6. 2026-08-29. This seat authored neither proposal, revised neither, and has not seen J1's verdict. Every cost claim below carries a path and a line, and every line was opened in `apps/designer-portal/` before it was quoted. Findings new to this seat are numbered `Dj2-nn`.*

---

## 1 · One line

**X — the spine is the lens.** Nothing on the paper pins. The ticket, the instruments row and the letterhead's surplus are deleted, the first region head lands at 378px, and the left rail becomes the instrument: a 200px column holding a 100px head, a 399px ladder whose segments are drawn from data at their own extents and print names *and* values, room sub-rungs, and six permanent doors. Density runs one way — a region opens one frame ahead of her and is never taken back — so no pixel above the reading line ever moves.

**Y — the paper is the lens.** One 56px band under the letterhead, sticky, whose height never changes and whose *sentence* does: line 1 names the job, the phase, the install date and the money out; line 2 carries the worst standing exception with its act at every offset. The rail narrows to 160px and becomes six equal rungs with names, no values, and a reading line; the 40px goes to the margin. Every region reserves its true height from first paint, so the scrollbar never lies.

*(196 words.)*

---

## 2 · Convergence check

**Not converged.** They are genuinely rival, and the sharpest single disagreement is nameable in one sentence.

> **Does the paper reserve its true extent from the first paint, or does it grow as she reaches each region?**

Y reserves: every region occupies its full estimated height from first paint (`§4` density; the estimator is `60 × 65px` per FF&E line on the specimen), so `document.documentElement.scrollHeight` is final at load and the scrollbar is a true measure at every offset — Y's Wave 3 spec asserts exactly that (`e2e/document/lens-density.spec.ts`, new). X refuses to reserve: an unreached region is a 68px or 112px stub and its real height arrives when it opens (X-4, `112px → 1,840px`), so the document grows monotonically as she descends. X's own R4 concedes the consequence: "the scroll extent grows monotonically… the scrollbar stops being the measure." Y's own R1 concedes the mirror: if the estimator is 15% low on a 60-line schedule the thumb jumps by ~600px. Neither can be true of the other's design, and the two risk registers name each other's cost. That is a real fork.

Four more organs diverge and are not vocabulary:

| Organ | X | Y |
|---|---|---|
| The lens line | **none** — nothing on the paper is `position: sticky`, `--doc-seam-height` drops to **zero writers** and four consumers read a declared `4rem` | one 56px sticky band, `lens-band.tsx` the sole writer, measured by `ResizeObserver` |
| The rail's payload | names **and** ≤40-char values, room sub-rungs, six doors, at 200px | names only, six equal 116px rungs, no values, no doors, at 160px |
| 1180–1439 | 136px, **words** — the household, the stage, six names, ≤15-char values, six door names | one hair rule, six ticks, **zero text labels**, labels one press away |
| Who assigns `full` | geometry — every region intersecting the frame plus everything passed; X refuses SC11's "exactly one" and says so | the running index's resolver, sole assigner, exactly one by construction |

**What they did converge on**, and it is a great deal, most of it forced by `shared-planks.md` and by four critiques hitting the same defect: the ticket dissolves with `ticket-derivation.ts` untouched; `latchedDefault` becomes an initial density and `Client approvals` opens on arrival; density is **one-way with no release, no hysteresis pair and no scroll correction**; `care` and `record` join `PROJECT_PAPER_ORDER` while `The accounts` (`page.tsx:2202`) and `Authorizations` (`page.tsx:2122`) are dropped on the same evidence; `content-visibility: auto` is adopted on the strength of F61's death at `globals.css:322-325`; the 1500-character regex is deleted with the same measured **1,109** and **143**; M-4 and M-8 are refused in near-identical words, both citing `margin-item.tsx:46`'s `--elevation-sheet` site; the fold's rule steps at the same three call sites with `region-rule.tsx` untouched. The convergence is on the floor and on the corrections. The theses are still apart.

---

## 3 · Scores

Never averaged. Three numbers per proposal, each against the anchor it sits on.

### Axis 4 — Engineering credibility

**X = 8.** Sits above the 6-anchor on every clause and short of 9 on two.

*Where it earns it.* All three load-bearing mechanisms are answered with what each *becomes*, and X is the only document that says `resolve()` is a **rewrite** rather than a reconfiguration, and states the replacement pick rule (the root containing the frame's midpoint, else the last root whose top is above it). I opened `src/hooks/use-document-running-index.ts`: `READING_BAND = '-20% 0px -62% 0px'` is at `:34`, `JUMP_LOCK_MS = 700` at `:35`, the 8 × 250ms `attach()` retry at `:120-133`, `scrollToRegion` at `:202-222` with the reduced-motion branch at `:206-214` — every citation in both proposals is exact.

The seam answer is the strongest engineering move in either document. `--doc-seam-height` has exactly four consumers and I checked all four: `src/app/globals.css:1026` (the schedule glance's `top`), `:1034` (`[data-index-region]` `scroll-margin-top`), `:1037` (the FF&E `max(…, 4rem)` floor) and `src/components/document/commercial/money-region.tsx:48` (`const SEAM_CLEARANCE`). X drops to **zero writers** and repoints all four at a declared constant. The one deletion that could bite — `globals.css:1026` — is safe for the reason X gives: `src/components/document/schedule/schedule-rule.tsx:548` reads `className="pointer-events-none sticky top-0 z-[3] h-0"`, so removing the override leaves `top: 0`. A constant cannot re-resolve mid-fling; Y's cannot make that promise (see Dj2-13).

Wave 0 is the best first wave in the program: days, zero product code, and it fixes two gates that fail *silently*. `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` carries `/data-active-section[\s\S]{0,1500}?<SectionStageLineMount/`; I measured it — the real attribute at `page.tsx:1942` is **1,109** characters from `<SectionStageLineMount` at `:1964`, and the literal `data-active-section` inside the JSX comment at `:1961` is **143**. Both proposals got both numbers right. X also converts `contrast.test.ts`'s hard-coded `RAIL_FILES` (the array is at `:327-332`) into a glob **before** the rename that would drop a file from the scan — and X's reason is right: the offender check at `:334-338` greps only for `source.includes('text-[var(${pigment})]')`.

Test blast radius is enumerated file by file *and* line by line, with keep / rewrite / delete and a reason for each, and the survivors are named as survivors — `doc-spine.test.tsx:14-19` and `responsive-document-shell.test.tsx:202-211` stay green *because* the arc does not move; `quiet-release-contracts.spec.ts:150-158` and `quiet-responsive-shell.spec.ts:251-253` stay green *because* X keeps 200px. I verified those two: `:152-154` polls `>= 199` and `:156-158` bounds paper `[200,1208]` / margin `[1208,1440]`. `quiet-release-contracts.spec.ts:169-299`, "keeps one focused timer doorway at 1280px", does die whole — `:185` locates `[data-compact-spine-timer-doorway]` and `:223` `[data-full-spine-timer]`, both evicted.

`content-visibility` carries a named fallback and a support statement: a Wave 4 Playwright find-in-page gate, and "if it fails, `[data-passed]` loses the attribute and the cost is render time, not correctness." `browserslist` is added; `apps/designer-portal/package.json` has no key today.

The 136px arithmetic holds. `page.tsx:1764` is `min-[1180px]:grid-cols-[56px_minmax(0,1fr)]` and `<main>` at `:1791` is `max-w-[1040px] justify-self-center`; `1180 − 136 = 1044 ≥ 1040`, so the measure is unchanged at every width in the tier. E1 priced widening at `weeks` on the paper's x-origin; X pays the price it actually is — two pinned e2e specs, both named.

*Why not 9.* **Dj2-01 (high, 0.85)** — X declares exactly two dependencies (Wave 2 and Wave 5 on Wave 0) and misses the one that matters. Wave 3 deletes `job-ticket.tsx`; the `Drawings` / `Spec` / `Boards` / `People` doors are built in **Wave 2** (`spine/lens-ladder.tsx` — "the track, the segments, the sub-rungs, the window, the doors"). If Wave 3 ships before Wave 2, those four rows have no destination at s0, s1, s2 or s3, at 1440 and 1280 — which is precisely DC-44 against Y, a defect Y found and fixed by moving its shelf into Wave 1. X did not. §9, Wave 3. **Dj2-02 (medium, 0.9)** — Wave 3 is the largest wave in either document (eighteen files, one deleted component, one deleted 541-line test file, one deleted `describe`, the fold→density change, `--doc-region-gap` at nine call sites, three rule call sites, four CSS declarations) and it is the only wave with no flag: "it reverts by `git revert` of one commit touching eighteen files." SC1's 378px at s0/1440 lives in that wave. X is honest about it; it is still the weakest rollback in the program. **Dj2-08 (medium, 0.7)** — `resolve()` is a rewrite of the one scroll mechanism the probe measured clean (F105, probe §2: three transitions, zero flicker across four clicks) and X carries no §10 risk entry for it, though SC12's "never null while the paper is in view" depends on the new pick rule at s1 and s2, 1440 and 1280. **Dj2-07 (low, 0.8)** — `RAIL_FILES` is `:327-332`; X says `:326-332`. Immaterial to the fix. **Dj2-14 (medium, 0.75)** — the refusal to reserve costs the scrollbar at s2/s3 on a 60-line schedule at 1440; X names it in R4 and does not price it back.

**Y = 7.** Clears the 6-anchor on every clause and reaches 9 territory in two places, but two cited sites do not say what the document says they say, and the rollback on the wave that carries SC1, SC2 and SC3 is not executable.

*Where it earns it.* The three load-bearing mechanisms get their own heading and are answered before the waves — the only document that structures them that way. The `--doc-seam-height` table is per-consumer with a `file:line` and a disposition for each, plus a **new** consumer row (`scroll-margin-top` on every focusable inside `[data-document-paper]`, not just region roots), which closes F120 more completely than X's landing-clear constant does.

Y reuses the mechanism the probe says already works instead of rewriting it: `READING_BAND` is unchanged and gains the job of assigning density, so SC11 and SC12 are true by construction. That is the lower-risk answer to load-bearing mechanism (c), and it is the reason Y's density wave is a `week`.

Two observations are the sharpest in the program and I verified both. **DC-51:** `schedule-rule.tsx:548` is `sticky top-0 z-[3] h-0` and its own comment at `:541-545` reads "it reserves nothing in flow (so nothing shifts, at any scroll depth)" — Y refuses to give it a reserved height on the ground that doing so would *create* the shift it was removing. That is correct and X never has to think about it. **DC-59:** `doc-lens` is stated as gating four named sites, including `shelves/shelf-panel.tsx:145`, whose class I read — `… min-[1440px]:left-[200px] min-[1440px]:block` — a coupling between the rail's width and an unrelated overlay's left edge that no other document surfaces, and which Y's R6 names as "the tell."

"The gates, shown green" walks all five `shadow-gate.test.ts` assertions (`:85-95`, `:97-105`, `:107-122`, `:124-127`, `:129-136` — the `it(` lines are at 85, 97, 107, 124, 129) and all four `contrast.test.ts` blocks. The 9-anchor asks for those two gates **shown** green; Y shows them and X asserts them. Y also adds `spine-ladder.tsx` to the scan list "in the same PR that creates it," and leaves `spine-timer.tsx` and `spine-shelved-blocks.tsx` on disk unmounted because deleting either would drop it from `RAIL_FILES` silently. That is the same insight X reaches by globbing, arrived at from the other side.

*Why not 8 or 9.* **Dj2-03 (high, 0.9)** — Wave 1's rollback is impossible as written. §9(b) says "`job-ticket.tsx` is **deleted as a component**", Wave 1's file list says "`src/components/document/job-ticket.tsx` — **deleted.**", and its test file is "deleted with the component" (DC-42). Wave 1's Rollback then reads: "`doc-lens` off mounts `JobTicket` at its old position and restores the ternary and the instruments row." A flag cannot mount a deleted component, and the deleted `job-ticket.test.tsx` cannot cover the restored one. This is the wave carrying SC1 (357px at s0/1440), SC2 and SC3, and the clean-rollback story is Y's principal claim against X's `git revert`. Wave 2a's rollback is fine — the files it unmounts stay on disk. Wave 1's is not.

**Dj2-04 (medium-high, 0.95)** — Y's spacing exception cites the wrong sites and drops a defect on that basis. Y's Dd-45 and Dp-43 both read "drop-with-reason", asserting that `ffe-section.tsx:1213` and `:1302` both carry `mb-1.5` = 6px, "which is Y's value; the 12px is X's error." I opened the file. `:1213` is `className="mb-1.5 mt-5 flex items-baseline justify-between gap-3"` — the **install-branch `<h2>` wrapper** for the region head. `:1302` is `className="mb-1.5"` — the **`RegionHead` wrapper**. Neither is a room or folio head; both are the *region* head's own wrapper, and `mb-1.5` is its bottom margin, not an inter-head seam. The room head is `RoomHeading`, whose wrapper is at `ffe-section.tsx:618-620`: `className="mt-4 scroll-mt-16"` — 16px, exactly the site and the value X identified after correcting both critics. Y is right that the two *cited* sites are 6px and wrong that they are the sites in dispute, and the consequence is that Y's `--doc-region-gap` plank has **no rule at all for the room heads** — the seams a reader crosses four times inside Pieces at s2, at 1440, 1280 and 390, on the one region the specimen makes sixty lines deep. §4 "Region heads and spacing".

**Dj2-05 (medium, 0.9)** — Wave 2a instructs "`data-index-region="care"` and a heading id on the existing `RegionHead` at `:254`." `care-band.tsx:251-255` is a `<FoldSeam … name="Closing the book"`; the `RegionHead name="Closing the book"` is at `:309-311`. Care-band wears two heads depending on fold state and Y's instruction points at the seam. At s3/1440 that is the rung that lands nowhere.

**Dj2-13 (medium, 0.8)** — `--doc-seam-height` stays runtime-measured and four consumers read it. Y's own R2 concedes a live exception string can overrun 56px; the mitigation is a pre-ship gate ("if that cannot bring it inside one line at 1280, the band does not ship"), which is a decision, not a mechanism. At s1, s2 and s3 at 1440 and 1280, `scroll-margin-top` and the schedule glance's `top` are still functions of a measured value. X's constant removes the class; Y's gate constrains it.

**Dj2-06 (low, 1.0, against both)** — `use-region-fold.ts:25-40` declares **eight** fold keys: `approvals` · `schedule` · `schedule-rule` · `ffe` · `money` · `money-table` · `boards` · `care`. X (§9 Wave 3) and Y (§9(a)) both say "seven." At every state and width, the widening one key short leaves `money-table` — the money region's second posture — without a density. **Dj2-09 (low, 0.85, against both)** — `CareBand` mounts twice, at `page.tsx:2134` and `:2158`; both proposals name only `:2134`. Putting `data-index-region="care"` on the component produces the root at both mount sites, and `regionHeadingId`'s throw is the guard that will find out at s3/1440.

**Path verification does not cap either score** — see §4.

### Axis 5 — Motion discipline

**X = 8.** Nine mechanics, every column filled with real values (`top 202px → 512px, height 74px → 158px`; `112px → 1,840px`; `weight 400 → 600`), and every reduced-motion cell is a real form rather than an absence. X names all nine existing `@media (prefers-reduced-motion: reduce)` blocks by line and sites its one new block after the breath's. I grepped `src/app/globals.css`: the reduce blocks are at **283, 439, 496, 833, 955, 1013, 1188, 1468, 1519**, plus the no-preference gate at **429**. X's list is exactly right, in order, with no invention.

Zero layout shift is claimed with the mechanism, and it is the best mechanism in either document: H5(b), "a region's height changes only while the entire region, and every pixel above it, is below the frame's bottom edge." That does not correct a shift, it removes the case in which one could occur — at s1, s2 and s3, at all three widths. X-1 is declared honestly as the one row a CSS media query cannot cover: its rAF handler reads `matchMedia('(prefers-reduced-motion: reduce)')` and steps the bracket, and X calls that an amendment to the CSS-only policy rather than compliance with it. Refusing to claim compliance you do not have is the discipline the axis is about.

The one ambient move is defended and its site does not move — `doc-breath` at `globals.css:271-283`, on the active StrataMark, in the rail. X names no second.

*Why not 9.* Hysteresis is not "two numbers and the distance between them"; X states one threshold and argues the second is void because there is no return. That is the right design and it does dissolve the requirement, but the number it states — **one frame height** — is frame-relative (900 at 1440, 800 at 1280, 844 at 390) and defended by a sentence rather than by a measurement from the specimen. Momentum and reverse-scroll *are* ruled separately but the ruling is distributed across M3, R2 and the state machine's `reading` state rather than made in one place, and R2's designed mitigation for a fling ("a fling suppresses the settle and the opens fire together at the landing") appears in the risk register and not in the grammar table. **Dj2-12 (low, 0.75)** — the axis-5 6-anchor lists `site` among the columns; neither table carries one, and X's sites live in prose.

**Y = 9.** The 9-anchor asks four things and Y meets all four literally, each in one place.

Every reduced-motion cell is a real form **and names the shipped block it sits beside, by number and by line, for all ten rows** — #1 `:283-288`, #2 `:439-458`, #4 `:833-878`, #7 `:1188-1195`, #9 `:1519-1523`, plus the no-preference gate at `:429-437`. I checked Y's numbering against the nine blocks in the file and every one is correct. Y-5's cell is the observation that earns the score: `.fold-settle` and `.fold-arrow-settle` are declared **only inside** `@media (prefers-reduced-motion: no-preference)` at `globals.css:429-437`, so `reduce` already receives the still form with no new rule and the seam paints visible on the first frame under `animation-fill-mode: both`. Verified at `:429-437`. That is a fact about the tree that changes what the reduce work costs, and neither the anatomy digest nor X surfaces it.

The single threshold is **240px, absolute**, and it is defended against a measurement from the specimen rather than against a sentence: one FF&E line is 65px, so 240px is more than three lines and a three-line nudge cannot re-cross it. Where X says "one frame height" and leaves the fling to a risk, Y's number is the same at 1440, 1280 and 390 and Y says why ("a line is the same height at every width").

Momentum and reverse-scroll are ruled **separately, in their own paragraph, with the reason the second case is empty**: downward the threshold sits 240px ahead of her eye; upward everything is already mounted and stays mounted, so there is no upward transition to rule. That is the anchor's clause met as written.

The one-ambient-move budget is defended and argued rather than asserted: `doc-breath` moves to the letterhead's mark, present at arrival and gone below the fold — "strictly less ambient exposure than today."

Zero layout shift carries its mechanism twice: the band's box is 56px before and after the pin, and DC-51's refusal to give the zero-height glance a height.

*Why not 10.* A 10 changes what the team thinks is possible on the axis. Y's grammar is exemplary bookkeeping over a shipped register — it teaches the team that its own `no-preference` gate has already done half the reduce work, which is worth a great deal and is not a new capability. Two reservations, neither large enough to move the number. **Dj2-10 (low-medium, 0.7)** — §4's motion paragraph says "**No layout property animates, ever**" while Y-2 transitions `top` and `height` on the clay segment from `top: 236px, height: 116px` to `top: 352px`. The row itself is honest; the paragraph overreaches, at every stop change at s1→s2, 1440 and 1280. **Dj2-11 (low, 0.6)** — Y-1 turns a text sentence in a 56px band at the top of the reading frame on **every** reading-stop commit, and Y carries a risk (R8) for the *rail's* yield reading as a bug but none for the band's sentence changing under her eye, which is the more frequent event. *What would settle this: a practitioner walk at s1→s2 at 1440 counting how often line 2 turns across one end-to-end scroll of the specimen.*

**Zero hover-only affordances in either proposal.** X's yields are position-driven and its 1180–1439 labels are printed; Y states SC5 = 0 and its 1280 labels open on **press**. `da-score-hover` in both is the shipped wash on a control whose label already prints. No automatic return is triggered by either document.

### Axis 6 — Still Patina

**X = 8.** Above the 6-anchor on every clause, and it meets the 9-anchor's naming requirement.

No new size enters 40/24/18/15/14, the mono floor stays 11px, no new pigment, no new rule weight, and — stated and kept — "No glyph is invented; C20 is untouched," so there is no second icon language. The `lg` StrataMark stays at `doc-letterhead.tsx:52-54`, the seven-mark arc never leaves the rail, the stamps, the six stage plates, the 48px crops and the ink-pool wash are untouched with the wash's exact shipped consumers named. THE STUDIO desk block appears in no file in X's §9 — I checked: `studio-drawer.tsx` is not in X's engineering path at all.

The 9-anchor asks the proposal to name what it deliberately did **not** restyle even though it was tempting, and X names an organ and a finding: the needs-attention block's terracotta rule, which F127 records as "nearly the only colour-coded signal on the first screen." X quiets everything around it and leaves the block at shipped weight.

X also polices the register against itself. v1's 2px `--color-clay` gutter tick is deleted rather than defended, and X gives the right reason: `contrast.test.ts:319-325` asserts clay is *below* AA on rail stock and `:334-338` would not have caught it because the offender scan is `source.includes('text-[var(${pigment})]')`. I read both. The only colour X adds anywhere is terracotta on an exception's own value line — small, state-carrying, exactly where Kody's taste puts it. No large tinted surface exists anywhere in the document.

One continuity point the shots decide. `w1440-spine-full.png` (verified, ledger `:42`) shows today's rail already printing values under names — `0 IN THE LOG`, `NOT SCHEDULED`, `3 PIECES · 0 ROOMS`, `$6,200 OWED` — in the 13px/11px register X keeps. X's ladder is that rail made whole; Y's rungs remove half of what the shipped rail says. On "made by the same hand," X is the more continuous of the two.

*Why not 9.* The 9-anchor asks that a practitioner cannot pick the new from the R126 floor in a still, and the rail is where that is genuinely in doubt. X takes it from 494.25px of ink to 738px, from 8 interactive children to about 21 raw, and puts four classes of object below one rule: a head, a ladder track with a travelling bracket, indented room sub-rungs, and a six-row `FILED WITH THIS JOB` list that is a new *kind* of rail object composed in existing type. X's own R1 is titled "The rail becomes the cluttered thing," and its falsifying test — "more than one tense above the `--rule-mid`" — is a test the rail can pass at s0/1440 while the stack below the rule still reads as a new instrument. I cannot click a running app; the mockup's still is what would settle it.

**Y = 7.** Clears the 6-anchor entirely and meets the naming clause well; held under X on composition.

Y's floor is equally clean: no new size, no new pigment, no new rule weight. The band's two lines are the existing 11px mono and 15px body, the rung names are `spine-running-index.tsx:97-105`'s existing 13px, the count line is `region-head.tsx:135`'s existing 12.5px. Scored Ink is the grammar for every new act — no plate, no chip-as-button. The ink ramp is refused on F74's one-step-of-headroom measurement, in the same words X uses.

Y's answer to the naming clause is good and specific: the region rule stays `doc-rule-strong` at every density, "because the moment rule weight starts carrying density the register has three weights doing four jobs." That is the loudest mark on the paper, deliberately left alone.

And Y reads Kody's recorded taste correctly in one place X does not: the rail gets **quieter in words**, 18 distinct text labels today to 7, and Y ships that number beside SC4 rather than letting a rising ink percentage stand alone as evidence of orientation.

*Why 7 and not 8.* Three compositional moves land on this axis.

The seven-mark arc leaves the rail for the letterhead's `HouseholdChip` line, and `doc-breath` moves with it. R15 and R126 put both in the rail. Amendments are not priced here — but the damage is on this axis, and it lands on the one organ the register fixed most tightly: Y's own §2 says the letterhead's title block is "untouched. Same `<header id="document-project-status">`, same `lg` StrataMark, same 40px title" and then adds a seven-mark row and two client acts to it (**Dj2-11**, above). `doc-letterhead.test.tsx:69-83` and `:85-97` pin the title, the tracking and the closing rule, and nothing pins what sits between them. At s0, 1440 and 390, that is a new composition inside R126's most ratified block.

At 1180–1439 the rail prints **no words at all** — one `--rule-hair`, six 12px ticks, one clay segment. `w1280-spine-glyph-rail.png` (verified, ledger `:59`) shows today's tier breaking `PUT` / `DOWN` and `ACTIV` / `E`, so F07 is real; Y answers it by removing the words and X by fitting them, and X's `1044 ≥ 1040` shows the fitting is free in measure. A hairline with six ticks is the one place in either proposal where the document stops looking like paper furniture and starts looking like a scrollbar, and it is a tier Kody works at.

The focus ring steps from `--color-clay` to `--color-clay-ink` across the rail. The contrast reasoning is right — I confirmed `contrast.test.ts:319-325` asserts clay is below AA on rail stock — and `-ink` companions are in NG4's own list, so this is not a violation. It is still a visible change to a shipped state on every focusable in the rail, gated by nothing: `RAIL_FILES`' scan looks only for `text-[var(…)]`, and Y says so.

**No NG violation and no hover-only affordance in either proposal. Neither is returned.**

---

## 4 · Path verification

Every `file:line` cited in each §9 was resolved against `apps/designer-portal/`. A path is counted **missing** only if it neither exists nor is declared new by the proposal itself.

### Proposal X — §9 "Engineering path"

**68 distinct paths cited. 65 exist. 3 do not — and all three are declared, not asserted.**

| Path | Status |
|---|---|
| `src/components/document/spine/lens-ladder.tsx` | **Declared new** — Wave 2, "**New:**". The `spine/` subdirectory does not exist today (`src/components/document/` holds `spine-running-index.tsx`, `spine-shelved-blocks.tsx`, `spine-timer.tsx` and no `spine/` folder). Creating it is part of the wave. |
| `src/hooks/use-lens-density.ts` | **Declared new** — Wave 4, "**New:**". |
| `components/document/spine*.tsx` and `components/document/spine/**/*.tsx` | **Glob patterns**, not paths — Wave 0's replacement for `contrast.test.ts`'s hard-coded `RAIL_FILES`. The first matches three files today; the second is forward-looking and is exactly what makes Wave 2's new file scanned on the day it lands. |

Every other cited path resolves, including the ones the design turns on: `src/hooks/use-document-running-index.ts`, `src/components/document/region/use-region-fold.ts`, `src/lib/document/document-index.ts`, `src/lib/document/ticket-derivation.ts`, `src/components/document/care-band.tsx`, `src/components/document/previous-work.tsx`, `src/app/globals.css`, `apps/designer-portal/package.json`, `playwright.config.ts`, and all nine test and spec files named for rewrite or deletion.

**X cites no path that does not exist. The axis-4 cap does not apply.**

### Proposal Y — §9 "Engineering path"

**82 distinct paths cited. 78 exist. 4 do not — and all four are declared new.**

| Path | Status |
|---|---|
| `src/components/document/lens-band.tsx` | **Declared new** — Wave 1, "**new.**" |
| `src/components/document/spine-ladder.tsx` | **Declared new** — Wave 2a, "**new.**" |
| `src/hooks/use-lens-density.ts` (also cited as `apps/designer-portal/src/hooks/use-lens-density.ts`) | **Declared new** — Wave 3, "**new.**" |
| `e2e/document/lens-band-height.spec.ts` and `e2e/document/lens-density.spec.ts` | **Declared new** — Wave 1 and Wave 3, both "**New**". |

Two paths worth confirming because they are unusual and both resolve: `src/lib/document/document-guide.ts` exists (Y cites `document-guide.ts`'s precedence gate as untouched, distinct from the component `src/components/document/document-guide.tsx` — both are real), and `src/components/document/shelves/shelf-panel.test.tsx` exists, which X never needs because X keeps 200px.

**Y cites no path that does not exist. The axis-4 cap does not apply.**

**A caveat neither count captures.** Existence is not correctness. Y cites two paths that exist and says something about them that the file does not support — `ffe-section.tsx:1213`/`:1302` as the room-head exception (**Dj2-04**) and `care-band.tsx:254` as a `RegionHead` (**Dj2-05**) — and both proposals miscount `use-region-fold.ts:25-40` at seven keys where there are eight (**Dj2-06**). A clean `ls` sweep is a floor, not a finding.

---

## 5 · Who is worse off

I favour **X**. The persona who loses is **P4 — FF&E and procurement.**

She loses the scrollbar. X refuses to reserve, so a region she has not reached is a 68px or 112px stub and its real height arrives when it opens: on the specimen the Pieces body goes `112px → 1,840px`, and on a 60-line schedule it is far more. The document therefore grows monotonically under her as she descends and the thumb shrinks continuously, at s1, s2 and s3, at 1440 and 1280. X names this itself in R4 — "it is the only instrument that told her how far into a 36-line schedule she was, and no critic's fix restores it" — and then offers her the ladder's window instead, which is derived from data rather than from `scrollHeight`. That is a substitution, not a replacement: the window tells her which sixth of the paper she is in; the thumb told her where she was inside 1,840 pixels of one region, which is the only place P4 actually works. Y builds the reserve model precisely so the scrollbar is true at every offset, and says so; X takes it away.

She loses a second thing, smaller and sharper. X's ladder draws Pieces at 182px against Money's 39px — 4.7:1 drawn for a true 10:1 — and X withdraws the phrase "true proportional extent" and puts the real scale in a count line she has to read. So the one instrument that is *shaped* like the paper is deliberately shaped wrong, by a factor of two, on the region where she spends her day. She reads `36 LINES · 4 ROOMS · 1 DAMAGED` and infers the depth; she does not see it.

And a third, which X states and refuses: the whole foot is left alone. F83's 310px teaching a concept with no content, F92's 70.3% of the foot frame carrying nothing, F80's roster question 2,000px from its door — all real, all untouched, and the s3 frame budget at 1440 moves by exactly the 65px the seam was taking. P4 lives at the foot. She gets a segment and a door and nothing else.

---

## 6 · Merge instruction

Organ by organ. The source proposal, what specifically comes from it, and what dies. The merge author may disagree only in writing.

### Spine — from **X**

Take the ladder whole: a fixed-height track the segments divide (399px at 1440, 299px at 800, 463px on pre-work), each segment at a **24px floor** plus a share distributed by an extent derived from **data** — `ticket-derivation.ts:780-793`'s counts, never a rendered box. Six stops on a project spread with `care` and `record` added to `document-index.ts:17` and `:36-57`. Names **and** ≤40-character values, because that is where the install date and the deposit live at every offset. Room sub-rungs carrying `data-room-chip`, `aria-pressed` and `toggleRoom()` from `useRoomLens()`, printed at every offset. Six `FILED WITH THIS JOB` doors. **200px at ≥1440**, refused narrowing on X's arithmetic. **136px with words at 1180–1439**, on the `1180 − 136 = 1044 ≥ 1040` proof, carrying `quiet-responsive-shell.spec.ts:224-228` and `quiet-release-contracts.spec.ts:105-118` as named rewrites. The seven-mark arc stays in the rail, above the `--rule-mid`, with `doc-breath` at its shipped site.

**What dies:** Y's 160px rail; Y's six equal 116px rungs; Y's "no values on the rail" refusal (§11.4); Y's text-free ticked 1280 tier; Y's move of the arc and the breath into the letterhead. F07 is answered by fitting the words, not by deleting them.

**Carry across from Y, two things.** (1) The **18 → 7 distinct-rail-labels counter-measure** shipped beside SC4, because X's own §4 concedes `measure-layout.mjs:245-253` counts a bordered track as continuous ink; an ink percentage alone is not evidence of orientation, and the merged rail must report both numbers. (2) F108's guard, which Y found and X only half-answers: a fallback string may never print in the same size, weight and row as a live figure — so `NOTHING YET` and `NOT KNOWN YET` are set apart from a value, not merely spelled differently.

### Header — from **X**

Nothing on the paper is `position: sticky`. `job-ticket.tsx` deleted with its sentinel, its `IntersectionObserver` and its `--doc-seam-height` publication; `ticket-derivation.ts` untouched. The instruments into the letterhead's ledger column **at ≥1180 only** (`region-head.tsx:120` is `grid-cols-1` below that, pinned by `region-head.test.tsx:110-121`). Empty vitals suppressed, `PHASES ▸` deleted, the in-hand room row to the rail. The needs band at a **reserved 136px, both branches**, so F79's 0.1189 shift has nowhere to land. And the mechanism that makes the whole thing hold: **`--doc-seam-height` drops to zero writers**, all four consumers repointed at `--doc-landing-clear: 4rem`, `globals.css:1026` deleted on the strength of `schedule-rule.tsx:548`'s Tailwind `top-0`. SC1 = 378px on the seed, 399px on the specimen.

**What dies:** Y's 56px band, entire — its two lines, its yields, its `ResizeObserver` publish, its ownership of `#doc-ticket-sentinel`, and the **12.9% of every frame it costs at s1, s2 and s3 at 1440** (18.2% at 390). A band that is 56px and honest is still a permanent tax on the axis the work needs, and X's §11.1 is right that a column carries the same facts for free.

**Carry across from Y, two things.** (1) The **standing sheet** (Y-10) behind `+3 MORE`: a `DocSheet` listing **every** standing exception with **its own act**. X's `+2 MORE · LEDGERS ↑` points at `studio-drawer.tsx:115`'s `STUDIO_BOOKS`, which is a different surface holding different content; F50's defect is that the third exception is dropped whole, and only Y's sheet actually catches it. (2) Y's **truncation rule**, stated before the band ships: the act's words truncate first, then the subject's qualifiers, and never the number, the day-count or the room — applied to the needs band's two exception lines.

### Sections and margin — spacing from **X**, the margin from **X** with one organ from **Y**

`--doc-region-gap: 24px` owned by the region wrapper, identical full, quiet or folded, at every call site in `research/10-code-anatomy.md` §6. Two exceptions: the colophon keeps `mt-14` (`doc-colophon.tsx:102`), and the room head takes **`ffe-section.tsx:618-620`, `mt-4` → 12px** — because I read the file and X is right. The fold's rule steps at `money-region.tsx:233`, `schedule-rule-region.tsx:182` and `approvals/project-approval-document.tsx`, with `region-rule.tsx` untouched and `region-rule.test.tsx:59-74` green. `CLOSED BY YOU` printed in words, not a coloured tick.

Margin: X's recovery, which is a deletion — the first-touch note recedes for good (−230px at every state after the first), two printed groups `BESIDE {region} · n` and `THE WHOLE JOB · n`, `NOTHING BESIDE PIECES YET` printed rather than blank, `MARGIN · 7 · 1 OVERDUE` on the 1180–1439 tab, and the rule that an item never prints a figure the needs band or a segment is currently printing.

**What dies:** Y's Dd-45 / Dp-43 drop-with-reason and its 6px folio-head exception, which describe the region head's wrapper and leave the room heads unruled. Y's **272px margin, its five-line shelf, and the rail narrowing that funds them — all three, together**, because they are one move and X's §11.5 arithmetic settles it: 32px of measure recovered at exactly 1440 and none at 1472 and above, against 40px of the rail's 168px inner measure, which is the whole of the value line. The four leaf doors live in the rail, not the margin.

**Carry across from Y, one thing:** the **per-item printed anchor line** on the item itself — `BESIDE PIECES`, or `ABOUT THE WHOLE JOB` when it has no anchor. X's group headings are legible only when a group has members; a line on the card is legible from a still and survives an empty anchor set, which is the case F66 says is the real one.

### Motion — from **Y**

Take Y's grammar table's discipline entire. Every reduced-motion cell names the shipped `globals.css` block it sits beside **by number and by line** — the nine reduce blocks at `:283`, `:439`, `:496`, `:833`, `:955`, `:1013`, `:1188`, `:1468`, `:1519` and the no-preference gate at `:429-437` — including Y-5's finding that `.fold-settle` and `.fold-arrow-settle` are declared only inside the no-preference gate, so `reduce` already receives the still form and the seam paints visible on the first frame. Take **240px absolute** as the open threshold, defended against the specimen's own 65px FF&E row, at 1440, 1280 and 390 alike. Take Y's paragraph ruling **momentum and reverse-scroll separately**, with the reason the upward case has no events in it.

**What dies:** X's "one frame height" as the stated distance — a frame-relative number defended by a sentence, whose fling case lives in R2 rather than in the grammar. And X's distribution of the momentum and reverse ruling across M3, R2 and the state machine: it becomes one paragraph.

**Carry across from X, three things.** (1) The **one-directional rule itself** and H5's five lettered mechanisms — a region's height changes only while it and every pixel above it are below the frame's bottom edge; a region she has passed never changes again. (2) `content-visibility: auto` with `contain-intrinsic-size: auto` on **passed** regions only, with the Wave-4 Playwright find-in-page gate and the stated fallback: drop the attribute, the cost is render time and no visual state depends on it. (3) X-1's declaration that its rAF handler reads `matchMedia` and is an **amendment** to the CSS-media-query-only policy rather than compliance with it — the merged document keeps that sentence, because it is the sentence that makes the rest of the table trustworthy.

### 390 — from **X**

The mobile bar's left zone prints **the household alone** in the slot `mobile-bar.tsx:230` gives `{context}` today, with the subset stated rather than parity asserted: identity at every offset, the stage phrase and the current region on the sheet, one tap away. The spine sheet becomes the same six-stop ladder with the same names and the same values at `min-h-11` per row — F14 answered. `py-[0.32rem]` → `py-1.5` at `mobile-margin-chips.tsx:98` and `:114`. Every sheet kind named at `mobile-sheets.tsx:260`. Header at 390: 477px of 844, against 1054 today.

**What dies:** Y's ~86–90px band at 390 and its `VANDERSTEEN RESIDENCE · $17,500 OUT` line 1. With nothing sticky anywhere, 390 has no band to measure, and Y's own SC3 concession at that width — stability rather than the 64px number — stops being a concession anyone has to make.

**Carry across from Y, one thing:** `page.tsx:1791`'s `px-7` and the resulting **334px measure** as the arithmetic every 390 string is checked against before it is written. Y is the only document that computed it, and it is the number that killed both proposals' v1 claims at that width.

---

*Ends. Fourteen findings new to this seat, `Dj2-01` to `Dj2-14`: two high, six medium, six low. Scores, never averaged — X: a4 8 · a5 8 · a6 8. Y: a4 7 · a5 9 · a6 7. Favoured: X, on the flatter shape and on two mechanisms that remove a class of defect where Y's constrain one. The single fact a merge author should carry out of this seat: `--doc-seam-height` at zero writers is the only answer in the program that F04, F34 and F87 cannot come back through.*
