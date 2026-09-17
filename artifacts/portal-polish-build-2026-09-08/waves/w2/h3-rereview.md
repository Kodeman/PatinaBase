# Lane H3 re-review — landmark ledger and the story pole (PP-5 / IA-20, IA-23)

**Re-reviewer context.** Separate context from both the implementer and the first reviewer. I did not
trust `h3-impl.md`, `h3-review.md`, or `h3-fix.md` — every claim below was independently re-derived from
`git diff origin/main...origin/portal-polish/h3`, from reading the full changed files in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3` (read-only), and by re-running every gate
command myself in that worktree. Branch tip re-fetched fresh (`git -C .../patina-merged fetch origin`,
sandbox disabled after a proxy-auth error on the first attempt — the standard network-egress sandbox
restriction, not a repo problem). `docs/design/house-sheet/SPEC.md` read from `origin/main` (Wave 1 has
landed, so it exists there now — §A and §F). Specimen read from
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`, plus its own design-review
trail (`review/01a…`, `02-fix-log-client-house.md`, `03-rereview-specimens.md`) to separate a *stale*
specimen detail from a *ruled* one, exactly as the brief asks.

## Verdict

**approve.** Both P2s the first review raised (`installation → #key`, the unconditional `key` entry in
`sections`) are fixed in the branch tip and independently verified by re-reading the diff, re-running
the fix's own tests, and reasoning through all three `roomsUnread`/`model.groundFloor` combinations by
hand. The one remaining item from the first round (the inline-act focus caret) was correctly declined —
I re-derived the same conclusion independently from the SPEC.md text itself, not just from the fix
round's citations. Nothing P1 or P2 remains. I found one new, low-severity item the first round did not
raise (a fabricated citation in `h3-impl.md`'s self-justification, harmless but worth flagging under
"do not trust the lane's report"), and I'm carrying forward two P3s and one informational item from the
first round that are still true and still unfixed.

## Evidence — gates re-run myself, from the worktree, on the current branch tip

```
$ git -C /Users/kody/Code/patina-merged fetch origin && \
  git -C /Users/kody/Code/patina-merged log origin/main..origin/portal-polish/h3 --oneline
920920691 feat(client): landmark ledger under the doorplate; the story pole navigates (PP-5)
0e4f1684e fix(client): address W2 review — h3
# worktree confirmed at this tip: git -C .../agent-pp-h3 log --oneline -1 → 0e4f1684e

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3 \
        --filter @patina/client-portal type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3 \
        --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1053 passed, 1053 total
Time:        16.8 s
# Matches h3-fix.md's claimed post-fix numbers exactly (1053, up from 1048 pre-fix; +5).

$ npx eslint src/components/threshold        # from apps/client-portal
✖ 2 problems (1 error, 1 warning)
  approval-ask.tsx:1080        error    react-hooks/set-state-in-effect
  instruments/tracking-row.tsx:104  warning  Unused eslint-disable directive
# Both pre-existing, in files H3 never touches (confirmed against the diff's file list below).
# 0 new errors from H3's files.

$ npx jest src/components/threshold --coverage \
    --collectCoverageFrom='src/components/threshold/{story-pole,doorstep,landmark-ledger}.tsx' \
    --collectCoverageFrom='src/components/threshold/instruments/inline-act.tsx'
doorstep.tsx         100 / 96.55 / 100 / 100
landmark-ledger.tsx  100 / 100  / 100 / 100
story-pole.tsx       98.64 / 93.75 / 100 / 100
inline-act.tsx       100 / 100  / 100 / 100
# Floor is 70/60/70/70. All four comfortably clear it.

$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h3 --stat
 .../threshold/__tests__/doorstep.test.tsx          | 112 ++
 .../threshold/__tests__/landmark-ledger.test.tsx   |  96 ++
 .../threshold/__tests__/story-pole.test.tsx        | 153 ++
 .../threshold/__tests__/threshold.test.tsx         | 140 ++
 .../src/components/threshold/doorstep.tsx          |  88 +/-
 .../instruments/__tests__/inline-act.test.tsx      |  45 ++
 .../threshold/instruments/inline-act.tsx           |  42 ++
 .../src/components/threshold/landmark-ledger.tsx   | 101 ++
 .../src/components/threshold/story-pole.tsx        | 138 +/-
 .../src/components/threshold/threshold.tsx         |  59 +/-
 .../waves/w2/h3-impl.md                            | 190 ++
 11 files changed, 1123 insertions(+), 41 deletions(-)
```

## Pathspec discipline

The 8 files on H3's list are exactly the 8 changed (region-correct: `threshold.tsx`'s diff is only the
`sections` array, `firstGateAnchor`/`whatNeedsYou`/`houseHasSpoken` consts, the `<LandmarkLedger>` mount,
and the one `firstBandAnchor` prop on `<StoryPole>` — H5's band-rendering props untouched, confirmed by
reading the whole hunk). No touch to `globals.css`, `scored-action.tsx`, `wall-gate.tsx`, `door-gate.tsx`,
`room-band.tsx`, `tracking-row.tsx`, or any H1/H4/H5/H6 file — confirmed by the full diff, not just the
stat.

**Carried forward, still true (P2, confidence high, already flagged in round 1).**
`instruments/inline-act.tsx` (+ its test) is not on H3's file list or in the shared-file table. I
re-verified the underlying facts rather than taking the first review's word: the plan's own H3 step 2
requires ".act--inline grammar (§F-D)" for the doorstep's object link, and no lane's file list gives
anyone ownership of that grammar (H2 owns tokens/`.t-*`; H4 owns only the Scored Ink block from `:193`
in `globals.css`) — this is a real gap in the plan, not an invention. Given the gap, a new file was the
only place to put shared grammar two lanes' files (`doorstep.tsx`, `story-pole.tsx`) both need. I
independently re-ran the collision check the fix round reports:
```
$ git -C /Users/kody/Code/patina-merged grep -n "act--inline\|inline-act\|INLINE_ACT" \
      origin/portal-polish/h4 -- apps/client-portal   → no match
$ git -C /Users/kody/Code/patina-merged grep -n "act--inline\|InlineAct" \
      origin/portal-polish/h2 -- apps/client-portal   → no match
$ git -C /Users/kody/Code/patina-merged show origin/portal-polish/h1:.../instruments/inline-act.tsx
$ git -C /Users/kody/Code/patina-merged show origin/portal-polish/h5:.../instruments/inline-act.tsx
$ git -C /Users/kody/Code/patina-merged show origin/portal-polish/h6:.../instruments/inline-act.tsx
  → "path does not exist" on all three
```
No other lane defines the file or the CSS grammar. There is exactly one implementation in the portal.
This is a plan gap for the integrator to note when reconciling lanes, not a fix H3 owes — I am not
downgrading this off the findings list because it is still, factually, a file outside H3's declared
scope, but it does not block approval: the deviation is justified, non-duplicative, and was disclosed by
the lane itself (not discovered despite the lane).

## House sheet conformance

- **Type steps.** `className="t-head"` on the ledger's five acts and no `.t-*` class anywhere in
  `story-pole.tsx`'s pre-existing (untouched) label markup. Confirmed against
  `docs/design/house-sheet/SPEC.md:674` (landmark ledger: "`.act--tertiary` anchors, `.t-head`") and the
  specimen (`client-house.html:654-658`, `<a class="act act--tertiary t-head">` with sentence-case
  source text — `.t-head`'s CSS does the uppercasing). H3's markup matches this exactly: labels are
  written sentence-case in JSX (`'Where we are'`, `'What changed'`, …) with `className="t-head"`
  layered on top of `ScoredAction variant="tertiary"`, not hand-uppercased. This resolves to nothing
  until H2 lands (H2 hasn't merged into this branch) — self-disclosed in `h3-impl.md`, and confirmed:
  `docs/design/house-sheet/SPEC.md`'s `.t-head` class does not exist yet on `origin/portal-polish/h3`'s
  `globals.css`. Not a defect; integration order is H2 → H1 → H4 → H3 for exactly this reason.
- **No new hex, no shadow, no pill/badge/dot/✓/spinner, no truncation, no `opacity:.5` on a state.**
  Re-grepped the full diff myself: `grep -inE '#[0-9a-f]{3,6}\b|box-shadow|opacity:\s*\.?5|opacity-50|
  rounded-full|badge|spinner|✓|line-clamp|text-ellipsis|truncate|disabled='` over
  `git diff origin/main...origin/portal-polish/h3 -- apps/client-portal`. One hit: the pre-existing
  ≤600px phase-progress dots (`rounded-full`), which moved (re-parented into the new one-line bar) but
  were not newly added — the plan explicitly grandfathers "the mobile bar's colour and identity block
  stay as built." Confirmed by reading both sides of that diff hunk. No other hits.
- **`.act--inline` grammar vs. the sheet (§A5 / §F-D), read from the current, merged SPEC.md.** Rest
  rule 1px `--color-aged-oak` at `padding-bottom: 3px` ✓ (SPEC: `bottom:-3px;height:1px;
  background:var(--oak)`, with `--oak` an alias to `--color-aged-oak` per H2's plan); hover 1.5px
  `--color-quiet-ink` with the padding compensated 3px→2.5px so the baseline doesn't jump ✓ (SPEC:
  `hover .label::before{background:var(--ink-faint);height:1.5px}`, `--ink-faint` aliasing
  `--color-quiet-ink`); unconditional, no `@media (hover:none)`, no `scaleX` ✓; inherits
  family/size/case/colour, no min-height box, no padding ✓ (SPEC: `display:inline;min-height:0;
  min-width:0;padding:0;font-family:inherit;…`); focus outline `2px solid var(--color-clay-ink)` offset
  `2px` ✓ (SPEC's shared `.act:focus-visible` rule, byte-identical).
  **The caret finding from round 1 (P2) was correctly declined — independently re-derived, not just
  trusted.** I read SPEC.md's own text at `docs/design/house-sheet/SPEC.md:297-300` myself: the generic
  `.act::after` "proofreader's caret, kept" rule sits under "Focus — one rule for every tier" and is
  never overridden by the `.act--inline` block shown in the SPEC's own code sample (that block only
  nulls `.act--inline .label::after`, a *different* pseudo-element — the label's second underline score
  — not the outer `.act::after` caret). Read literally, the SPEC's code block does not kill the caret
  for the inline tier. But the SPEC's own *prose* for §F-D says "Same focus **ring** as the other
  tiers" — ring, not ring-and-caret — and the specimen's actual CSS
  (`client-house.html:257`: `.act--inline .label::before,.act--inline .label::after,
  .act--inline::after{content:none}`) explicitly nulls `.act--inline::after` too, which the code sample
  in SPEC.md simply omits. That specimen behaviour is a *ruled* fix (`02-fix-log-client-house.md:128`,
  RR-02, "pseudo-rules and caret killed"; confirmed at the sister specimen's fix log too), not a stale
  leftover — so SPEC.md's printed CSS block for `.act--inline` is itself incomplete relative to its own
  ruled §F-D prose and the specimen it is supposed to describe. `InlineAct` matches the specimen and the
  prose, not the SPEC's incomplete code sample. **This is a real gap in `docs/design/house-sheet/
  SPEC.md` — worth a line for whoever owns that file (Lane A1's territory) — but it is not a defect in
  H3's code**, and I am closing out round 1's caret finding rather than carrying it forward.

## The ruling implemented (PP-5 / IA-20, IA-23)

- **Landmark ledger.** Omission-not-disabling correctly built (`landmarks.length === 0` → `return null`;
  every landmark answered by a boolean/string prop the caller computes, never derived inside the
  component). I re-traced `whatYouOwe = houseHasSpoken && !(model.groundFloor && roomsUnread)` against
  all three of `threshold.tsx`'s render branches by hand:
  - `!hydrated || loading || model.pending` → `houseHasSpoken` false → `whatYouOwe` false regardless.
    Correct: `quietDoorstep` renders no letterbox at all.
  - `model.groundFloor && !roomsUnread` → `GroundFloor` branch, `toll={letterbox}` passed as a prop and
    rendered by `GroundFloor` with its own `id="letterbox"` (pre-existing, unchanged). Predicate:
    `!(true && false) = true`. Correct — letterbox does render here.
  - `model.groundFloor && roomsUnread` → falls through to the `else` branch (the `GroundFloor` condition
    fails), where `doorstep`'s `{model.groundFloor ? null : letterbox}` child evaluates to `null`
    (`model.groundFloor` is true). Predicate: `!(true && true) = false`. Correct — no letterbox renders.
  - `!model.groundFloor` (either value of `roomsUnread`) → `else` branch, `{model.groundFloor ? null :
    letterbox}` evaluates to `letterbox` unconditionally. Predicate: `!(false && x) = true` for any
    `x`. Correct — letterbox always renders here regardless of `roomsUnread`.
  All four cases check out. This predicate is careful and correct.
- **`whatChanged` reuses `doorstep.tsx`'s own exported `hasChangedBlock()`** rather than re-deriving the
  condition — read both call sites, they pass identical arguments (`showSince`, `changedCount`,
  `readingMark`), so the ledger and the block it points at cannot drift out of sync. Good design.
- **Doorstep inline link.** `readSentence()`'s earliest-match-wins approach against
  `standing-sentence.ts`'s actual clause order (pieces → papers → acceptance → balance) is consistent
  with how `joinClauses` actually orders the middle sentence — I read `standingSentence()` myself rather
  than taking this on faith. The h3-5 fix (`[a-z0-9]+ papers` instead of `[a-z]+ papers`) closes the
  13+-papers gap the first review found: `countInWords` falls back to `String(whole)` past twelve, and
  the new character class admits digits. Verified against the actual test added
  (`doorstep.test.tsx`: "13 papers wait for your name" → `href="#door"`, text "13 papers") and by
  re-reading the regex myself: `\S+` in the balance pattern already handled arbitrary numeral formats
  (including cents, e.g. "$9,125.00"), so only the papers pattern needed the digit class.
- **Story pole navigates.** Both P2s from round 1 are fixed and I re-verified the fix independently
  rather than trusting the disposition table:
  - `chapterSection('installation', firstBandAnchor)` now returns `firstBandAnchor` (the first room
    band's own anchor) instead of the static `'key'`. I re-read the cited ruling myself:
    `artifacts/portal-polish-review-2026-09-08/review/02-fix-log-client-house.md:45` — "Only the two
    phases with a band are links (Procurement → `#road`, Installation → `#study`)" — confirmed fixed at
    `03-rereview-specimens.md:49` (SF-03/T06). `#study` is `client-house.html`'s room band anchor, not
    `PlanKey`'s `#key`. The fix's mapping is correct against this ruling.
  - `threshold.tsx`'s `sections` array now reads `...(roomsUnread ? [] : [{ id: "key", … }])` instead of
    an unconditional entry. I confirmed by reading `plan-key.tsx` myself that `PlanKey` always renders
    `id="key"` once mounted (no internal early-return-null path) and is mounted only in the
    `!roomsUnread` branch of `threshold.tsx` — so the array's condition now exactly tracks whether the
    element exists. Before this fix, a `roomsUnread` house would have had `onThePage.has('key') ===
    true` with no `#key` element on the page — a link to nowhere pointed at by "Installation" in
    exactly the scenario the fix's own test (`threshold.test.tsx`: "draws no chapter link at a key a
    house whose rooms failed never prints") now covers. I re-ran this specific test path via the full
    suite run above (1053/1053 green) and additionally confirmed by reading the test body that it
    forces `roomsQuery` into an error state and asserts both `#key` is absent and every drawn pole link
    resolves to a real element.
  - Only one call site of `<StoryPole>` exists in the portal (`threshold.tsx:1308`); `firstBandAnchor`
    is optional with a `null` default, so no other consumer breaks. Confirmed by grep.

## Copy strings

No pinned string (`Leave the house`, the colophon phrase, `prepared for`, `Ask for a change`,
`Open the letterbox`, `/accept/i`) appears in this diff — confirmed by grep over the full diff. New
copy ("Where we are" / "What changed" / "What you owe" / "What needs you" / "The papers" / "You are in:
…") is new-and-tested, not a rename of an existing pinned string.

## No anchor renamed

`doorstep.tsx` adds `id="changed"` (new, additive); `story-pole.tsx` adds `id="story-pole-rail"` on the
`<ol>` (new; the `<aside>` keeps its existing `id="story-pole"`). `threshold.test.tsx`'s "renames no
anchor" test asserts the full existing id set is still present
(`doorstep key letterbox wall door road note previously mat mat-papers ledger`) — I independently
re-checked this list against `docs/design/the-client-page/README.md:102-118`'s load-bearing table and
confirmed none of those ids are missing, renamed, or repointed by this diff.

## Accessibility

- Focus outline matches the sheet on every new interactive element (see house-sheet section above); the
  caret question is resolved, not open (see above).
- `aria-disabled` is never used — correctly, since nothing in H3's scope has an "unavailable" state;
  landmarks and pole links are omitted rather than disabled, and this is pinned by test
  (`landmark-ledger.test.tsx`: every surviving link lacks `aria-disabled` after an omission case).
- 44px targets: the ledger's five acts and the ≤600px toggle are `ScoredAction` instances, which carry
  `min-h-[44px] min-w-[44px]` in `scored-action.tsx`'s `BASE_CLASS` — I read that file myself to confirm
  this is unconditional and does not depend on H2 landing. `InlineAct`'s doorstep/pole links correctly
  do *not* carry a 44px box — the sheet explicitly exempts `.act--inline` from `min-height`/`min-width`.
- Roles: `<nav aria-label="Landmarks">` for the ledger (confirmed non-generic accessible name via test);
  `aria-expanded`/`aria-controls="story-pole-rail"` wired on the ≤600px toggle and exercised by test
  (open/close, `data-open` attribute, the rail's `max-[600px]:hidden` class toggling).
- Contrast: only existing tokens (`--color-aged-oak`, `--color-quiet-ink`, `--color-clay-ink`) — no new
  colour to check.
- **Carried forward from round 1 (P3, low, cosmetic, unfixed by design).** `LandmarkLedger`'s wrap
  layout is `gap-x-6 gap-y-0` — the plan's "44px tall, 24px gaps" doesn't specify an axis, and the fix
  round declined to guess at a value without a browser render available in this lane. Still true; still
  a fair thing to check visually at integration, not a blocker.

## Specimen comparison

The raw `client-house.html` differs from the plan's (and H3's) literal landmark targets in two places:
"Where we are" → `#story-pole` in the specimen vs. `#doorstep` in the plan/lane; "The papers" →
`#previously` in the specimen vs. `#mat-papers` in the plan/lane. I independently re-derived which side
is correct rather than accepting round 1's conclusion: `docs/design/the-client-page/README.md:102-118`
— the load-bearing anchor/redirect table this whole program is forbidden from repointing — names
`#mat-papers` explicitly as the "documents" anchor and `#doorstep` as the primary approvals/room-scans
landing anchor; it never names `#story-pole` or `#previously` as a redirect target for either concept.
The specimen's own design-review trail never rules on the ledger's five targets by name (only on the
pole's chapter links, which is the separate `#study`/SF-03 finding above). On that evidence the plan's
`#doorstep`/`#mat-papers` reads as a deliberate correction over a stale specimen detail, and H3 followed
the plan correctly. Not attributed to the lane; recorded because the brief asks for every specimen
divergence to be named.

Beyond that: the story pole's phase links use the `.act--inline` grammar in both the lane
(`<InlineAct>`) and the specimen (`class="act act--inline pole-phase t-body-sm"`,
`client-house.html:722,726`) — matching exactly, down to the `--oak` rest rule and 1.5px hover colour.
`docs/design/house-sheet/SPEC.md:678`'s prose ("Six phases as `.act--tertiary` **links**") disagrees
with both the specimen and the lane here — this is a SPEC.md wording gap (the table row predates the
§F-D amendment that introduced `.act--inline` specifically for "the day's line links" and similar
in-prose acts), not a lane defect; H3's choice matches the visual truth.

## Report-integrity finding (new; not raised in round 1)

**Finding (P3, confidence high).** `h3-impl.md`'s justification for the unlisted `inline-act.tsx` file
reads: "my brief permits 'a small shared class in the threshold instruments'" (quotation marks in the
original). I searched the entire plan (`docs/superpowers/plans/2026-09-08-portal-polish-build.md`), the
rulings doc, and the review corpus under `artifacts/portal-polish-review-2026-09-08/` for this phrase and
any near-variant — it does not appear anywhere. No document authorizes "a small shared class in the
threshold instruments" in those words or in substance; H3's own brief (the Lane H3 section of the plan)
says nothing about where the `.act--inline` grammar should live. The underlying engineering decision
(creating the file to fill a genuine, independently-verified plan gap) is sound and already accounted
for as the P2 pathspec finding above — but the report attributes that decision to a permission that was
never granted, quoting a source that doesn't exist. This doesn't change the verdict (the file itself is
disclosed, justified on its merits, and flagged in the diff), but it is exactly the kind of unverifiable
claim a re-reviewer is asked to catch rather than pass through, so I'm recording it rather than silently
correcting for it.

## What the lane did not do (independently verified against the diff, not the report)

Confirmed true by reading the diff myself: no `globals.css` touch; no H1/H4/H5/H6 file touch; no dev
server, DB reset, `db:generate`, migration, or deploy in either commit; the ≤600px dot strip was
re-parented, not removed or restyled; both fix-commit disposition claims (h3-1/h3-2 fixed, h3-4
discharged with an independently-reproducible grep) check out exactly as stated.

## Summary of findings

| # | Severity | Confidence | Finding | Status |
|---|---|---|---|---|
| 1 | P2 | Medium | `instruments/inline-act.tsx` (+ test) is not on H3's file list or in the shared-file table — a real, well-justified, plan-gap-driven pathspec deviation. Independently confirmed: no other lane defines `.act--inline`/`InlineAct` anywhere in the portal, so there is exactly one implementation of the grammar. Not a merge risk; worth a line in the integration notes so the plan's shared-file table gets amended for future lanes touching prose-inline acts. | Open — informational for integration, not a code fix H3 owes |
| 2 | P3 | High | `h3-impl.md` attributes the decision to create `inline-act.tsx` to a quoted permission ("my brief permits…") that does not appear anywhere in the plan or supporting docs. The decision itself is sound; the citation is fabricated. | Open — report-integrity note, no code change needed |
| 3 | P3 | Low-medium | `LandmarkLedger`'s wrap layout uses `gap-y-0`; the plan's "24px gaps" doesn't name an axis, and no browser render was available in this lane to judge the wrapped case. | Open — visual check at integration |
| 4 | Informational | High (real difference) / Low (defect) | Raw specimen's "Where we are"/"The papers" targets (`#story-pole`/`#previously`) differ from the plan's and lane's (`#doorstep`/`#mat-papers`); cross-checked against the load-bearing anchor table, the plan's choice is correct and the specimen looks stale here. Not attributed to the lane. | For the specimen's owner |
| 5 | Informational | High | `docs/design/house-sheet/SPEC.md`'s printed `.act--inline` CSS block doesn't show the `::after{content:none}` override that both its own §F-D prose ("Same focus **ring**") and the specimen's actual CSS require to kill the caret on inline acts — a documentation gap in the sheet itself, not in H3's code. `InlineAct` correctly matches the prose and the specimen. | For the sheet's owner (Lane A1's territory) |

Two P2s from round 1 (`installation → #key`, the unconditional `sections` entry) are **fixed and
independently re-verified** — not carried forward. The caret finding (round 1, P2) is **resolved as
correctly declined** on independent re-derivation from the SPEC.md text itself — not carried forward.
The gap-y visual check (round 1, P3) and the specimen-anchor divergence (round 1, informational) are
unchanged and still true, so they're carried forward as-is. Nothing above rises to P1 or an unresolved
P2, so the verdict is **approve**.

## What's good, for the record

The `whatYouOwe`/`whatChanged`/`houseHasSpoken` derivation in `threshold.tsx` is careful and I traced it
correctly across all four state combinations by hand, not just the three the first review named — it
holds. The `hasChangedBlock()` export closes a real drift risk between the ledger and the block it
points at. The fix round's own citations (the ruling doc, the specimen CSS, the sister specimen's fix
log) all check out on independent re-reading — this lane's self-reporting, aside from the one fabricated
quotation above, is unusually reliable: both P2s it declined to hide were self-flagged in `h3-impl.md`
before any reviewer found them, and the fix round's declines (h3-3, h3-6) are correct engineering calls,
not evasions.
