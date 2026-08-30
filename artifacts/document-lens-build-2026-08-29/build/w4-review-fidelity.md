# W4 fidelity review — The Smart Lens, Wave 4 ("Density, in one direction")

Reviewer: FIDELITY (adversarial, read-only). Scope: `git diff 0a03b4af9..HEAD` on
`.codex/worktrees/agent-lens-w4-int` (branch `document-lens/w4`, HEAD `a13acb16c`).
Binding sources: `artifacts/document-lens-proposal-2026-08-28/source/proposal.md` (R127),
`artifacts/document-lens-proposal-2026-08-28/mock/final/FINAL.md` + `index.html`,
`artifacts/document-lens-build-2026-08-29/build/design/{reconciliation,technical-design,deviations}.md`.

## Verdict

**SHIP-AFTER-FIXES.** The Wave-4 *mechanism* (the density observer, the settle
gate, the fold hook's fourth voice, `content-visibility`, the reduce block, the
press-order wiring, the e2e falsifiers) is built with high fidelity to
`technical-design.md` and to every deviation ruled in `deviations.md` — I found
no daylight between the code and D-B15/D-B16/D-B17/D-B18/D-B19/D-B21/D-B32.

The *print* layer — what the six quiet region bodies actually show — is where
this wave drifts from the ratified design, systemically, across all six organs
it touches, with no deviation logged. Gating IDs: **F1, F2, F3** below. None of
the three requires touching the density mechanism; each is confined to the
JSX six region files render when `density === 'quiet'`.

---

## Findings

### F1 · BLOCKER · confidence: high — every quiet region prints TWO count lines, and neither is the ratified string

**What ships.** In all six touched region bodies (`project-approval-document.tsx`,
`money-region.tsx`, `ffe-section.tsx`, `care-band.tsx`, `schedule-spine.tsx`,
`previous-work.tsx`), Wave 4 adds a brand-new sibling `<p data-region-count-line>`
under `RegionHead`, gated on `density === 'quiet'`, printing an uppercase mono
sentence invented for this wave:

- Approvals: `${overdueCount} OVERDUE` · `${openCount} OPEN`
- Money: `${money(owedCents)} OWED YOU` · `${poCount} PO(S)`
- FF&E: `${total} LINE(S)` · `${roomGroups.length} ROOM(S)` · `${damaged} DAMAGED`
- Schedule: `INSTALL ${day}` · `${entries.length} PHASE(S)` (correctly capped at `LENS_COUNT_MAX_CHARS`)
- Care: `${done} OF ${total} CLOSED OUT`
- Record: `${count} COMPLETE`

But `RegionHead` (`region/region-head.tsx:135`, untouched by this wave) *already*
and *unconditionally* renders a `status` line — the pre-existing R126 sentence
each region computes regardless of density (`headStatus`/`ffeStatus`/
`scheduleStatus`, e.g. approvals: `"3 awaiting decision · Marta Chen"`; FF&E:
`"the FF&E schedule, by room · 4 groups · 36 lines"`; schedule: `"6 phases ·
Procurement · next milestone Install"`). Proposal.md is explicit that this is
the same line the design means by "count line," not a separate element:

> "The quiet head's count line stays `region-head.tsx:135`'s 12.5px." (proposal.md §2, line 49)
> "...at 24px Playfair, with `region-head.tsx:135`'s count line..." (proposal.md §4, line 152)

And proposal.md §4 R2 states the quiet form has exactly **one**:

> "`quiet` is the head at 24px Playfair with `--rule-strong`, **one** ≤40-character count line at full ink, and the region's one inked leader act..."

`technical-design.md` OD-12/DL-06 computes the 68px reserve as *rule + 24px
head-with-leader + one ≤40-char count line* — one line, not two.

So a quiet region today prints its head, **then the pre-existing R126 status
sentence** (unconditional, any density), **then the new invented count-line
sentence** — two lines of overlapping/adjacent fact where the design specifies
one. For `previous-work.tsx` and `care-band.tsx` the two lines literally
restate the *same number* in different case (`"12 complete"` then `"12
COMPLETE"`; `"0 of 6 closed out"` then `"0 OF 6 CLOSED OUT"`), which is exactly
the "one fact, one printing" rule (SP-08) this entire program is organized
around, violated in the two organs where it's most visible.

None of reconciliation.md's ratified per-region quiet count-line strings
(§"What prints" → "Quiet regions" table) — `2 awaiting the client · 1 overdue
6d`, `Install Tue Sep 15 · 3 weeks out`, `36 lines · 4 rooms · 1 damaged`,
`$17,500 out · $12,300 not drawn`, `0 of 6 closed out`, `12 complete` (sentence
case, richer content, day-counts) — are implemented anywhere. The code invents
its own new abbreviated all-caps format. No entry in `deviations.md` (which
runs to D-B32 and logs far smaller decisions, e.g. D-B8's door-name pick)
covers this. This is either a defect (should have reused/repointed
`region-head.tsx:135`'s status per the design) or an unlogged deviation that
needs a design-lead ruling before ship — either way it's gating.

### F2 · MAJOR · confidence: high — the sr-only line is identical and generic across all six organs, not the ratified per-region form

Every quiet body prints the literal, hard-coded string `"Quiet — opens as you
read"` (`className="sr-only"`) — same six words in approvals, money, ffe, care,
schedule, record. Reconciliation.md's ratified sr-only contract is per-region
and actionable:

> `2 awaiting · not yet on the paper · press Client approvals on the index to open`
> (and "same pattern" for the other five, each naming its own count and its own region)

A screen-reader user hits the same sentence on every stop and gets no region
name, no count, and no instruction for how to open it. This is a real
accessibility regression relative to the ratified spec, not merely a wording
simplification — it's the same information proposal.md's M5 exists to
guarantee, dropped to a stock string.

### F3 · MAJOR · confidence: high — the ledger's overflow acts still print at quiet density (Money, FF&E)

Proposal.md §4 R2 states plainly:

> "Do **acts** print at reduced density? The one inked leader does... The overflow
> group does not; it returns when the region opens."

`RegionHead` (unchanged by this wave) renders `actions.map(...)` unconditionally
— nothing in globals.css or in any of the six region files filters the ledger
to its first (inked) entry when `density === 'quiet'`. This is invisible for
Approvals/Schedule/Care because those regions' ledgers happen to be built as
`if/else if` chains (at most one entry) or single-entry arrays today — but it
is real and observable for:

- **Money** (`commercial/money-region.tsx:223-249`): `ledger` always carries
  three entries — `Draw an invoice` (leader), `Add a change`/`Amendment`
  (secondary), `Hours · this project ↗` (tertiary) — all three print in the
  ledger row while the region is quiet.
- **FF&E** (`ffe-section.tsx:1237-1241`): `ffeLedger` is `[leader, ...other
  kinds]` — whenever more than one kind is eligible, the non-leader acts print
  too.

None of the six new jest suites (`*-region-head.test.tsx`,
`money-region.test.tsx`'s new "quiet body" describe, etc.) assert that
secondary/tertiary acts are absent at quiet density — they only assert that
*body-content* buttons (e.g. `"See the money"`) are gone. The overflow-act leak
is untested as well as unimplemented.

### F4 · MINOR · confidence: medium — `content-visibility` fallback syntax undocumented as a deviation

`globals.css` ships:
```css
contain-intrinsic-size: auto var(--doc-quiet-reserve, 112px);
```
`technical-design.md` OD-4 states the literal CSS as `contain-intrinsic-size:
auto;` (no length). The shipped form is arguably a *correctness improvement*
(`contain-intrinsic-size: auto;` alone omits the fallback length the spec
requires — an engine would have nothing to paint before a size is remembered),
but it's an unlogged textual deviation from the binding technical-design.md in
a build whose deviation-logging discipline is otherwise exhaustive (32 D-B
entries, several far smaller than this). Worth a one-line D-B entry so a
future reader doesn't wonder whether the discrepancy was seen.

### F5 · NIT · confidence: medium — `data-region-count-line` is a new DOM attribute absent from the §5 contract table

`technical-design.md` §5's DOM/token contract table enumerates every attribute
this program writes (`data-lens-band`, `data-density`, `data-passed`, etc.).
`data-region-count-line` (present on the new `<p>` in all six organs) is not in
it. Harmless on its own, but it's the DOM footprint of F1's unratified
element — the contract table should have grown a row, or the element
shouldn't exist.

### F6 · NIT · confidence: low-medium — `data-density` is written both imperatively and by React on the same element

`use-lens-density.ts`'s `promote()` calls `root.setAttribute('data-density',
'full')` directly on the DOM node — imperative, as `technical-design.md` §5's
contract table specifies ("written by: imperative (density rAF)"). But every
region file's own comment claims the opposite for the *same* attribute on the
*same* element: *"data-density is RENDERED BY REACT from the fold's answer
(OD-13), never written imperatively here"* — and indeed React re-renders
`data-density={density}` right after, once the store's `notify()` flows
through `useLensDensityStore` → `useRegionFold` → the component. Both writes
land the same value, so there's no observable bug, but it's a redundant
double-write and the comments overstate what's true only of that file, not of
the element. Low severity because it costs nothing visible; flagged because
the discrepancy between the code's own comments and technical-design.md's own
contract table is exactly the kind of thing that misleads the next reader.

---

## What is faithful (checked, not just assumed)

- **`use-lens-density.ts`** matches D-B15 (density store speaks `full`/`null`,
  never `'quiet'`), D-B16 (discovery promotes at-or-above-lookahead roots;
  passing never promotes; `markPassed` uses `rect.bottom < 0`), D-B17
  (`enabled:false` keeps the `MutationObserver` alive, installs no IO/scroll/timer),
  D-B18 (`forceFullThrough` walks from index 0 through the target inclusive,
  wrapped in `flushSync`), D-B19 (`freeze()` defers only `commitPending`;
  `markPassed`/`settle`/`forceFullThrough` still run while frozen), and D-B32
  (settle restated exactly: a fast frame arms its own timer; slow frames never
  unsettle; `data-lens-settled` present from first commit).
- **`use-lens-state.ts`** matches D-B19's sole-writer contract exactly:
  `editing > mobile > reading/rest` priority, delegated `focusin`/`focusout`
  with a `relatedTarget` check, `freeze(editing)` called on every transition,
  `LensState` vocabulary (`'rest'|'reading'|'editing'|'mobile'`) matches
  technical-design.md §2's OD-13 amendment (`'condensed'` correctly excluded
  as a region state, not a document state).
- **The reduce block** (`globals.css`, sited immediately after the pre-existing
  `:283` block) matches D-B21's exact four selectors and touches only
  `transition`/`animation`, never `opacity`/`visibility`/`display` — correctly
  answers falsifiable sentence (d).
- **OD-12's reserve** (`--doc-quiet-reserve-min: 68px` / `-exc: 112px`,
  `min-block-size` at every density) and **OD-4's `@supports` gate** are wired
  correctly; FF&E is the only organ that actually carries exceptions and it
  correctly switches between the two reserve tokens (the other five hardcode
  `-min`, which matches their `RegionHead` calls never passing `exceptions`).
- **D-B18's addendum** (the mobile sections sheet bypassing `forceFullThrough`)
  is fixed exactly as ruled: `mobile-sheets.tsx` now calls
  `activeDoc.onJumpRegion` instead of running the unfold/scroll steps itself;
  `page.tsx` composes the one true press handler
  (`requestRegionUnfold → lens.forceFullThrough → scrollToRegion`) and feeds it
  through as `onJumpRegion` on `MobileActiveDoc` (matches the `A-08`/`C-4`
  contract shape).
- **`page.tsx`** attaches `useLensDensity(mainRef)` unconditionally, above the
  early returns, per OD-15 item 4; `mainRef` is confirmed bound to the actual
  `[data-document-paper]` node.
- **The seven new e2e specs** map cleanly onto technical-design.md §6's five
  falsifiable sentences: (a) is `lens-band-height.spec.ts` (pre-existing,
  extended); (b) and (e) are both in `lens-density.spec.ts`; (c) is
  `lens-cls.spec.ts` (correctly reworked per D-B29 to observe from the settled
  s0, `buffered:false`); (d) is `lens-reduced-motion.spec.ts`. The other three
  (`lens-a11y`, `lens-contrast`, `lens-rail-budget`) and `lens-fling` cover
  SC5/SC7/SC4-successor/D-B31 respectively, each with an honest comment about
  what is and isn't provable pre-W4-wiring. The OD-4 find-in-page gate
  (chromium + webkit) is present as specified.
- **The W3-R6/R7 letterhead follow-ups** bundled into this integration branch
  (`CALL SHEET` drops its count below 1180; the ledger gap tightens to 9px
  below 1180) match `reconciliation.md`'s W3-R6 ruling precisely.

## Classification (defect vs. candidate deviation)

| id | defect or deviation? |
|---|---|
| F1 | Defect — proposal.md and technical-design.md both specify reusing/repointing the existing `region-head.tsx:135` status line as *the* count line; a second invented element is not an alternate reading of the text, it's an additional one. Could become a ruled deviation only if a design lead explicitly prefers the new format over reconciliation.md's table — that ruling doesn't exist yet. |
| F2 | Defect — reconciliation.md's sr-only table is unambiguous and per-region; the generic string is a regression, not an interpretation. |
| F3 | Defect — proposal.md's "the overflow group does not [print]" sentence is unconditional; nothing in this wave's diff addresses it. |
| F4 | Candidate deviation, currently unlogged — likely correct engineering, needs a D-B entry. |
| F5 | Documentation gap in technical-design.md, downstream of F1. |
| F6 | Documentation inconsistency (comment vs. contract table), no runtime effect. |

## Falsifiable-sentence / acceptance-bullet coverage

- H5(a)-(f) (proposal.md §4, zero layout shift): mechanically upheld by the
  reserve + one-direction promotion + `data-passed` design; F1's extra line
  does not appear to overflow the 68/112px reserves on the seed data checked,
  but doubles the *content* inside a box originally sized for one line — a
  risk worth the correctness reviewer re-measuring on longer strings.
- technical-design.md §6 (a)-(e): all five covered by the new/updated specs (see above).
- proposal.md §9 Wave 4 bullets: "position joins as fourth voice" — met.
  "`use-lens-density.ts`..." — met (mechanism only; technical-design.md's own
  "one IO for all roots" correction, not proposal's literal "one per root," is
  what's implemented, which is correct since technical-design supersedes).
  "globals.css: quiet rules / `[data-passed]` / new reduce block" — met, with
  F4's undocumented syntax deviation. "The six region bodies render their
  quiet form: head, count line, leader, reserved height" — structurally
  present but content-wrong per F1/F3. "Find-in-page gate" — met.

## Files read (for reference)

- `apps/designer-portal/src/hooks/use-lens-density.ts`, `use-lens-state.ts` (new)
- `apps/designer-portal/src/app/globals.css` (diff)
- `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (diff)
- `apps/designer-portal/src/components/document/region/use-region-fold.ts` (diff)
- `apps/designer-portal/src/components/document/{approvals/project-approval-document,commercial/money-region,ffe-section,care-band,schedule/schedule-spine,previous-work}.tsx` (diffs)
- `apps/designer-portal/src/components/document/region/region-head.tsx` (unchanged, read for contract)
- `apps/designer-portal/src/components/document/mobile/{mobile-sheets,mobile-shell}.tsx`, `doc-letterhead.tsx`, `letterhead-instruments.tsx`, `letterhead-vitals.tsx` (diffs)
- `apps/designer-portal/e2e/document/lens-{a11y,cls,contrast,density,fling,rail-budget,reduced-motion,band-height}.spec.ts`, `quiet-responsive-shell.spec.ts`, `lens-fixtures.ts`, `e2e/helpers/lens.ts` (diffs, read for coverage mapping)

---

## Sign-off — `document-lens/w4-fix` @ `f76ba828a` (over `document-lens/w4@a13acb16c`)

Read-only pass over `git diff a13acb16c..f76ba828a` on `.codex/worktrees/agent-lens-w4-fix`,
against `reconciliation.md` **W4-R1** (~:286), `deviations.md` **D-B33…D-B36**, and
`build/w4-fix-log.md`.

### F1…F6

| id | status | evidence |
|---|---|---|
| **F1** (two count lines, invented format) | **CLOSED** | `lens-quiet-status.ts` (new, 191 lines) is the single owner of all six quiet strings; every region now does `status={quiet ? xQuietStatus : xStatus}` through `RegionHead`'s existing `status` prop — no second paragraph. Confirmed by direct diff read in all six files (`project-approval-document.tsx`, `money-region.tsx`, `ffe-section.tsx`, `care-band.tsx`, `schedule-spine.tsx`, `previous-work.tsx`); `grep -rn data-region-count-line apps/designer-portal/src apps/designer-portal/e2e` → 0 hits, matching the log's own claim. `technical-design.md` §5 gained the F5 sentence naming the deletion. |
| **F2** (generic sr-only line) | **CLOSED** | `quietStateSentence()` produces the ratified per-region, actionable form (`"$1,750 out · not yet on the paper · press Money on the index to open"`, etc.), verified in the money/approvals/ffe/care/schedule/record sr-only `<p>`s and in their test files' literal string assertions. One open sub-item: the **approvals cell** — see below. |
| **F3** (ledger overflow prints at quiet) | **CLOSED, mechanism; test coverage thin** | `RegionHead` gained `actsAtQuiet?: 'all'\|'leader'`; at `'leader'`, `printedActions = actions.slice(0,1)` and the rest are **not rendered** (not `aria-hidden`) — a deliberate, disclosed strengthening over W4-R1's literal "hidden" text, reasoned in the diff's own comment (`DocumentActionGroup`'s one-leader guard and `action-visibility.spec.ts` count `[data-action-key]` nodes, so an inert copy would still be one). All six call sites pass `actsAtQuiet={quiet ? 'leader' : 'all'}`. **Gap**: no test — not `region-head.test.tsx`, not `money-region.test.tsx` (the one region whose ledger has 3 always-present entries) — asserts that `Add a change`/`Hours · this project ↗` are actually absent while quiet. The fix reads correct by inspection; it is unverified by the suite. Not gating, but should get one assertion before this ships. |
| **F4** (undocumented `contain-intrinsic-size` fallback) | **CLOSED (superseded)** | The whole block — literal text and all — is deleted per OD-4's own pre-agreed failure move; folded into **D-B33**, which explicitly says "this also discharges fidelity F4" and keeps F4's original finding (the unreachable `var(--doc-quiet-reserve, 112px)` fallback, and OD-4's literal grammar being invalid CSS) as part of the record. Nothing left to close against. |
| **F5** (`data-region-count-line` missing from §5 table) | **CLOSED** | Moot — the attribute is gone with the element. `technical-design.md` §5 gained an explicit "no other attribute joins this table from Wave 4" line. |
| **F6** (redundant/undocumented double-write of `data-density`) | **CLOSED** | `technical-design.md` §5's `data-density` row now states **both owners are deliberate**, names the case each is absent (React alone absent between the layout-effect promotion and React's commit — the imperative write is what makes a deep landing's first paint correct; the imperative write alone absent on a React-re-created root, and on the second `CareBand` mount, which isn't a stop). Every region file's comment was rewritten from "never written imperatively here" (which was false of the *element*) to name that it's true only of *that file*. This is exactly the fix I asked for — not "remove the redundancy" but "stop the comments from lying about it." |

### D-B33 — does the code lose anything visible, and is the measurement honest

**Nothing prints differently.** `content-visibility: auto` is a pure render-cost hint — the
paint output of a subtree it applies to and one it doesn't are supposed to be identical, and the
`@supports` block's own prior comment already said so ("cost only"). `data-passed` is still
written and never removed; only the CSS rule that turned it into a rendering skip is gone, so a
passed region now always fully renders instead of sometimes having its render skipped. The
visible loss is nil; the invisible loss is F53/OD-4's render-cost saving on long papers (the
1,549-line `ffe-section.tsx` case F53 was written for) — logged honestly as an open "OD-4
fallback candidate," not swept under D-B33.

**The measurement is honest.** It's a controlled single-variable A/B (one CSS declaration
removed, everything else identical) with a large, unambiguous effect size (0.8658 → 0.000986,
99.9%), a second, independent experiment that falsified the "just needs the reserve deferred
longer" hypothesis (deferring `data-passed` two frames moved the number "not at all… to the
digit" — a real negative-result attempt that would have been easy to omit but is quoted in
`globals.css` itself), and named root causes at specific steps (9 and 24) with specific rects.
I have no basis to doubt it.

### D-B34 — does technical-design.md §6 sentence (c) gate the page or the paper?

Quoting it exactly: **"(c) CLS === 0 and 0 entries over a 30-step scroll in both motion
registers."** No qualifying noun — it does not say "the paper," "the region roots," or "the
document," and CLS as a metric (the standard web-vitals Cumulative Layout Shift) is conventionally
computed for the *whole page*, not a DOM subtree. Read literally, the sentence gates the page,
which includes the rail. The W4-fix lane's paper/chrome split is therefore a genuine **narrowing**
of the literal text, defended by inference from proposal.md's H5 ("a region above the frame
growing from its reserve is the layout shift the design forbids" — which is about paper regions)
rather than by anything in §6 itself. D-B34's own framing — "this is a scoping decision on a
ratified gate and therefore a ruling, not an engineering call" — is the right call, and I'd add:
the two numbers are at least both surfaced (paper gated at 0, chrome's 0.000986/0.001001 printed
every run), so nothing is hidden pending the ruling — but until the design lead rules D-B34, §6
sentence (c) as literally written is **not yet fully met** (the rail's own 8 layout-shift entries
are real, non-zero, unaddressed CLS on the page CLS conventionally covers).

### D-B35 — `boundingBox()` vs `getBoundingClientRect()`

Read and confirmed independently plausible: `boundingBox()` (Playwright) goes through
`DOM.getBoxModel`/compositor quads, which for a `position: sticky` element carries the
compositor's own fractional sticky offset — a well-known source of sub-pixel jitter on sticky
elements independent of the actual CSS box. Switching the assertion to `getBoundingClientRect()`
(a layout-time read) is the correct fix for a flaky `boundingBox()` reading on a sticky node, not
a loosened gate — confirmed no tolerance/engine-allowance was introduced (`toBe(56)` stands
exactly, `>= 44` stands exactly), which is the right call: a fudge factor here would have hidden
the next real regression. Composited figures are still printed alongside for visibility. No
objection.

### The mobile bar's third line vs A-01

**Matches A-01 exactly.** `mobile-bar.tsx`'s "At {stop}" span is now always mounted
(`aria-hidden={stopLabel ? undefined : true}`, `className` toggling only `invisible`, never
`display:none`/conditional mount), with ` ` filling the text node when there's no stop so the
line's box never collapses. This is precisely "pre-printed and swapped by `visibility`" — A-01's
own words — and closes the layout churn (mount/unmount on every reading-index crossing) the
correctness review's item 15 found. The `data-sections-door` hook for the flaky-selector problem
(the door's accessible name is deliberately volatile per OD-11) is a sound, minimal addition and
is in `technical-design.md`'s DOM table.

### New deltas

**NF4-01 · MAJOR · confidence: high — Approvals' quiet leader never becomes "Send a reminder."**
W4-R1's column 3 for `approvals` reads: *"the head's leader as it prints today: **the ranked
need's act when the need names approvals** (`Send a reminder`, F34), else `New approval`."*
`project-approval-document.tsx`'s `headLedger` (untouched by this fix lane) is built from
`composeAvailable`/`assignAvailable`/`reassignAvailable` only — `New approval`, `Assign project
client`, or `Assign current project client`. There is no branch anywhere that substitutes a
ranked need's act (`Send a reminder`) when one names approvals as the worst standing thing — the
leader is always one of the three admin acts, never the reminder act the design specifically
calls out. On the seed's own specimen (2 overdue approvals, one of which is presumably line 2's
worst standing item), the quiet Approvals head would print `New approval` as its leader instead of
`Send a reminder`. This predates the fix lane (F1-F3 didn't touch `headLedger`'s contents), but it
is a real, currently-shipping mismatch against W4-R1's ratified column 3, discovered by this
check.

**NF4-02 · MAJOR · confidence: high — Schedule's quiet leader is "+ New open item," never "Adjust dates."**
W4-R1's column 3 for `schedule` reads: *"`Adjust dates` (`schedule-rule-region.tsx:157`)."*
`schedule-spine.tsx`'s `scheduleLedger` (untouched by this fix lane) is unconditionally `[{key:
'new-open-item', label: '+ New open item', onClick: openComposer}]` when `designerClientId` is
set, `[]` otherwise. `Adjust dates` never appears in this ledger at all — it may be a different
component's act entirely (`schedule-rule-region.tsx`, a different file, not the one that owns
`data-index-region="schedule"`). Every quiet Schedule head therefore prints the wrong leader
relative to the ratified table, unconditionally (no data-dependent case makes this correct).

Both are pre-existing (not introduced by `w4-fix`) but neither was named in the original F1-F3
findings, in `w4-fix-log.md`'s W4-R1 section, or in any D-B row — they surfaced from checking
column 3 against the actual ledger contents, which the fix lane's own log does not claim to have
done ("the leader that prints today," taken as given, was never diffed against the table it
otherwise implements exactly). Not gating for *this* sign-off's scope (W4-R1's structural fix is
what F1-F3 asked for, and it's done), but they mean W4-R1 is not yet fully realized end to end and
should be tracked before Kody's walk, since a walker comparing the quiet Schedule/Approvals heads
against reconciliation.md's own table will see the wrong act.

### Updated verdict

**SIGNED**, with two new non-gating findings (NF4-01, NF4-02) carried forward and F3's test-gap
noted as a should-fix. F1, F2, F5, F6 are fully closed with file:line evidence. F4 is closed by
supersession into D-B33. D-B33's deviation is honest and its visible-nothing claim holds. D-B34 is
correctly identified by the fix lane as an open ruling — my own reading of §6 sentence (c)'s
literal text agrees it currently under-covers the rail's 8 entries, so the ruling should be
sought before this is called complete, but it does not block signing off Wave 4's own fixes.
D-B35 is a sound instrument fix. The mobile bar matches A-01 exactly.
