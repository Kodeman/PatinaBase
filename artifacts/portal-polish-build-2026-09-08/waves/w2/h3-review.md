# Lane H3 review — landmark ledger and the story pole (PP-5 / IA-20, IA-23)

**Reviewer context.** Separate context from the implementer. Branch `portal-polish/h3` diffed against
`origin/main` (`git diff origin/main...origin/portal-polish/h3`); worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3` inspected read-only; gate commands re-run
independently from that worktree; house sheet read from `docs/design/house-sheet/SPEC.md` at
`origin/main` (§A, §F); specimen read from
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`; the specimen's own design-review
trail (`artifacts/portal-polish-review-2026-09-08/review/01a…03…`) consulted to tell a *stale* specimen
detail from a *ruled* one. I did not trust the lane's `h3-impl.md` — every claim in it below was
independently re-derived from the diff or re-run.

## Verdict

**needs-fix** — two P2s materially affect navigation correctness / house-sheet conformance; a third P2 is
a pathspec deviation (justified but real). Nothing P1. Everything else is small.

## Evidence — gates re-run from the worktree

```
$ pnpm --dir .../agent-pp-h3 --filter @patina/client-portal type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .../agent-pp-h3 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1048 passed, 1048 total
Time:        34.111 s
(matches h3-impl.md's numbers exactly)

$ npx eslint src/components/threshold        # run from apps/client-portal
✖ 2 problems (1 error, 1 warning) — both in approval-ask.tsx / tracking-row.tsx, neither
touched by this lane (react-hooks/set-state-in-effect pre-existing; unused eslint-disable
pre-existing). 0 new errors from this lane's files.

$ pnpm test -- <the 4 new/changed source files> --coverage
doorstep.tsx        96.00 / 96.55 / 100 / 95.45   (100/100 in the full-dir run; other suites
                                                    exercise it too — not a floor problem either way)
landmark-ledger.tsx 100 / 100 / 100 / 100
story-pole.tsx      98.57 / 88.31 / 100 / 100
inline-act.tsx      100 / 100 / 100 / 100
```

`git diff origin/main...origin/portal-polish/h3 --stat` touches exactly the 8 files on H3's list, plus
the report `.md`. Test counts claimed in `h3-impl.md` (8/6/8/6/5 = 33, reported as "22 new" for the four
touched-not-new files + the two new files' own suites) were recounted by hand against the diff and are
accurate to the `it(` block.

## Pathspec discipline

- The 8 listed files (`landmark-ledger.tsx`+test, `story-pole.tsx`+test, `doorstep.tsx`+test,
  `threshold.tsx`+test) are exactly what changed, region-correct (`threshold.tsx`'s diff is only the
  `sections` array, the two new consts feeding it, and the `<LandmarkLedger>` mount — H5's band props
  untouched, confirmed by reading the full diff).
- **Finding (P2, confirmed).** `instruments/inline-act.tsx` and its test are **not on H3's file list**
  and are not named in the shared-file table. The plan's step 2 requires the doorstep object to use
  "the `.act--inline` grammar (§F-D)", but no lane's `globals.css` region is assigned that grammar (H2
  owns tokens/`.t-*`; H4 owns only the Scored Ink block from `:193`) — a real gap in the plan, not an
  invention by the lane. Given the gap, creating a new file was a reasonable call, but it is still an
  unlisted file, and it duplicates the sheet's `.act--inline` implementation as a bespoke Tailwind
  string rather than the sheet's own `.act`/`.label`-with-pseudo-rule pattern (functionally equivalent —
  see below — but a second implementation of the same grammar). **Flag for integration**: confirm no
  other lane (H4, in the Scored Ink block) also defines `.act--inline`/`.act--inline` CSS — if it does,
  the two need reconciling, not both kept.
- No touch to `globals.css`, `scored-action.tsx`, `wall-gate.tsx`, `door-gate.tsx`, `room-band.tsx`,
  `tracking-row.tsx`, or any H1/H4/H5/H6 file. Confirmed by the full diff.

## House sheet conformance

- **Type steps**: `className="t-head"` on the ledger's five acts is correct per the plan but doesn't
  resolve to anything until H2 lands (H2 hasn't merged onto this lane's base) — acceptable, self-noted,
  falls back to the existing `.da-tertiary` sizing in the interim. Not a defect.
- **No new hex, no shadow, no pill/badge/dot/✓/spinner, no truncation, no `opacity:.5` on a state**:
  confirmed by grep across the full diff — the only `rounded-full`/dot markup is the **pre-existing**
  ≤600px phase-progress dots, unchanged in substance (just re-parented into the new one-line bar), and
  the plan explicitly grandfathers "the mobile bar's colour and identity block stay as built." No other
  hits for shadow/pill/badge/opacity-5/truncate/ellipsis/line-clamp in this diff.
- **`.act--inline` grammar vs. the sheet (§F-D)**: rest rule 1px `--color-aged-oak` at 3px under the
  baseline ✓; hover 1.5px `--color-quiet-ink` (the sheet's `--ink-faint` alias value) with the padding
  compensated so the rule doesn't jump ✓; unconditional (no `@media (hover:none)`, no `scaleX`) ✓;
  inherits family/size/case/colour, no min-height box ✓; focus outline `2px solid var(--color-clay-ink)`
  offset `2px` ✓ (matches the sheet's `.act:focus-visible` exactly).
  **Finding (P2, confirmed).** The sheet's "Focus — one rule for every tier" section defines the outline
  **and** "the proofreader's caret, kept" — an `::after`/`\2038` glyph that fades in on focus — as one
  rule applying to **every** act tier, `.act--inline` included ("Same focus ring as the other tiers").
  The existing `.da-act::before` caret (client `globals.css:430-451`) already implements this for every
  `ScoredAction`-based act on the page (confirmed by reading that block). `InlineAct` implements the
  outline half only; it has no caret glyph at all. The doorstep's linked object and the two story-pole
  chapter links are therefore the only acts on the Threshold whose focus state doesn't show the mark
  every other act shows. My reviewer brief asks explicitly to check "focus ring **+ caret**" — this is
  that check, and it fails. Low visual severity, but a genuine, unambiguous house-sheet deviation.

## The ruling implemented (PP-5 / IA-20, IA-23)

- **Landmark ledger**: omission-not-disabling is correctly built and tested (`landmark-ledger.test.tsx`,
  6 tests) — every target answered from what the page actually rendered, not derived independently
  inside the component. I traced `whatYouOwe`'s predicate
  (`houseHasSpoken && !(model.groundFloor && roomsUnread)`) against `threshold.tsx`'s three render
  branches by hand (the quiet/loading branch, the `GroundFloor` branch which passes the letterbox via
  its `toll` prop, and the else/room-bands branch which embeds it in `doorstep`'s children) and it is
  **correct** in all three cases — `Letterbox` always renders `id="letterbox"` once mounted regardless
  of which parent embeds it, and the predicate exactly tracks when it's mounted. `whatChanged` correctly
  reuses `doorstep.tsx`'s own new `hasChangedBlock()` export rather than re-deriving the condition, so
  the two can't drift. This is careful, correct work.
- **Doorstep inline link**: the earliest-object-wins regex approach is a reasonable reading of the plan
  (which only ever describes a single "the object", singular). Tested well (8 new tests) including the
  "two candidates, only the earliest links" case and the "names nothing, links nothing" case.
  **Finding (P3, low confidence of real-world impact, but a genuine gap).** `papersClause`'s multi-count
  branch is `${countInWords(papers)} papers wait for your name`, and `countInWords` falls back to a bare
  numeral (`String(whole)`) past twelve. The doorstep's object regex for the door case is
  `/(?:one paper|[a-z]+ papers)(?= waits? for your name)/i` — the plural branch requires a **letter-only**
  count word. At 13+ open papers with no wall/letterbox clause ahead of it in the sentence, the regex
  finds no match anywhere and the sentence renders with **no** inline link at all, contradicting the
  plan's unconditional "the doorstep sentence's object becomes an inline link to its gate." Thirteen
  simultaneous open papers is an unlikely fixture, which is why I rate this P3, but it is a real,
  untested edge case.
- **Story pole navigates**: graduation-links-to-section and caret-stays-inert are both correctly built
  and tested (8 new tests, including "never links a chapter whose section is not on this page").
  **Finding (P2, confirmed against the specimen's own design-review trail, not just the raw HTML).**
  `CHAPTER_SECTION = { procurement: 'road', installation: 'key' }`. `installation → #key` is wrong.
  `artifacts/portal-polish-review-2026-09-08/review/02-fix-log-client-house.md:45` (ruling **SF-03**,
  confirmed fixed at `03-rereview-specimens.md:49`) states explicitly: *"Only the two phases with a band
  are links (Procurement → `#road`, Installation → `#study`)"* — `#study` is a **room band's** anchor,
  not `#key` (the `PlanKey` schematic-legend section, a different part of the page entirely). The lane's
  own `h3-impl.md` self-flags this exact uncertainty ("If the ruling is the band, the map moves to the
  first `band.anchor`...") — the ruling **is** the band; this needs the one-line fix the lane already
  scoped out for itself. This compounds with a second, related problem the lane also self-flagged:
  `threshold.tsx`'s `sections` array still lists `{ id: "key", ... }` **unconditionally**, even in the
  branch where `PlanKey`/`#key` is skipped for `roomsUnread`. Today this only matters for the story
  pole's own IntersectionObserver (which silently drops missing nodes — no crash), but it also feeds
  `onThePage` in `story-pole.tsx`, the exact set `CHAPTER_SECTION`'s targets are checked against before
  being allowed to link. In the `roomsUnread` state, `onThePage.has('key')` is `true` even though
  `#key` never renders — meaning **"Installation" would draw as a live link to an id that is not on the
  page**, which is precisely the IA-21 failure this whole feature exists to prevent (the plan's own
  words: "an index pointing at ids that do not render"). Fixing the chapter map to use the first room
  band's anchor (and gating that entry, or dropping `key` from `sections` when `roomsUnread`) closes
  both problems at once — this is squarely inside H3's own owned region of `threshold.tsx` and
  `story-pole.tsx`, no H5 coordination required.

## Copy strings

No pinned copy string (`Leave the house`, the colophon phrase, `prepared for`, `Ask for a change`,
`Open the letterbox`, `/accept/i`) is touched by this diff. Confirmed by grep. New copy introduced —
"Where we are" / "What changed" / "What you owe" / "What needs you" / "The papers" / "You are in: …" —
is new-and-tested, not a rename.

## No anchor renamed

`doorstep.tsx` adds `id="changed"` (new); `story-pole.tsx` adds `id="story-pole-rail"` on the `<ol>`
(new, not a route anchor — the `<aside>` keeps `id="story-pole"`). `threshold.test.tsx`'s new
"renames no anchor" test asserts the full existing set
(`doorstep key letterbox wall door road note previously mat mat-papers ledger`) is still present — I
independently confirmed against `docs/design/the-client-page/README.md:102-118`'s load-bearing anchor
table that none of those are missing or repointed. Good.

## Accessibility

- Focus outline present on every new interactive element and matches the sheet's colour/offset — but
  see the caret finding above (P2).
- `aria-disabled` is never used because nothing here has an unavailable state to represent — landmarks
  and story-pole links are omitted, not disabled, which is the correct grammar per the plan. Confirmed
  by test (`for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-disabled')`).
- 44px targets: the ledger's five acts inherit `.da-act`'s `min-h-[44px] min-w-[44px]` from
  `ScoredAction` regardless of H2 landing — confirmed in `scored-action.tsx`'s `BASE_CLASS`. The
  `story-pole-toggle` button is also a `ScoredAction`, same guarantee. Inline links inside prose
  correctly do **not** carry a 44px box (the sheet explicitly exempts `.act--inline` from `min-height`).
- Roles: `<nav aria-label="Landmarks">` for the ledger; `aria-expanded`/`aria-controls` wired correctly
  on the ≤600px toggle, confirmed open/close by test including the `data-open` attribute and the
  rail's `max-[600px]:hidden` class toggling.
- Contrast: only existing tokens used (`--color-aged-oak` ≈4.20:1 per the sheet, `--color-quiet-ink`,
  `--color-clay-ink`) — no new colour introduced to check.
- **Finding (P3, low confidence, cosmetic).** `LandmarkLedger`'s container is
  `flex flex-wrap items-center gap-x-6 gap-y-0` — the plan specifies "44px tall, 24px gaps" without
  saying whether that's one axis or both; at the ≤390px wrap the two rows would sit with zero vertical
  breathing room beyond `.da-act`'s own padding. Worth a visual check at integration against the
  specimen (which doesn't show a wrapped ledger).

## Specimen comparison — two flagged, both resolve *against* the raw specimen, not the lane

The raw `client-house.html` differs from the plan's literal landmark targets in two places: "Where we
are" → `#story-pole` (plan/lane: `#doorstep`) and "The papers" → `#previously` (plan/lane: `#mat-papers`).
I chased both down rather than taking the specimen at face value:

- `docs/design/the-client-page/README.md:102-118` — the **load-bearing** anchor table this whole program
  is forbidden from repointing — names `#mat-papers` as the "documents" anchor and `#doorstep` as a
  primary landing anchor; it does not mention `#story-pole` or `#previously` as redirect targets at all.
- The specimen's own design-review trail (`review/01a-specimens-technical.md:53`,
  `01b-specimens-design.md`) treats the story pole and landmark ledger as two **separate** navigation
  systems and never rules on the ledger's own five targets by name — only on the pole's chapter links
  (`SF-03`, `T06`), which is the `#study` finding above.

So on the balance of evidence, the plan's `#doorstep` / `#mat-papers` for these two landmarks look like a
deliberate, load-bearing-anchor-aware correction over an earlier/stale specimen detail, and H3 followed
the plan correctly. I'm recording this so integration doesn't "fix" H3 back toward the stale specimen —
but flagging it because the task asked me to name every specimen divergence I found, and this is one,
even though I don't believe it's a defect.

## What the lane did not do (verified against the diff, not just the report)

Confirmed true: no `globals.css` touch; no H4/H5/H6 file touch; no dev server, DB reset, `db:generate`,
migration, or deploy; the ≤600px dot strip was moved, not removed; the `sections`/`key` and
chapter-map items are exactly what the lane's own report flags (see above — I'm elevating both from
"flag for reviewer" to "P2, fix before merge" because the room-anchor answer turned out to be
independently confirmable from the design-review trail, not merely a plausible guess).

## Summary of findings

| # | Severity | Confidence | Finding |
|---|---|---|---|
| 1 | P2 | High | `CHAPTER_SECTION.installation = 'key'` should be the first room band's anchor (`model.bands[0]?.anchor`) per ruling **SF-03**/the reviewed specimen (`#study`), not `#key`. |
| 2 | P2 | High | `threshold.tsx`'s `sections` array lists `key` unconditionally; combined with #1's `onThePage` check, a `roomsUnread` house can draw "Installation" as a link to an id that never renders — the exact IA-21 failure this feature exists to prevent. Fix alongside #1 (gate the `key` entry on `!roomsUnread`, or drop the stale entry once #1 moves off `key` entirely). |
| 3 | P2 | High | `InlineAct` omits the house sheet's unified focus caret (`.act::after`, "kept" for every tier including `.act--inline`) — present on every other act on the page via `.da-act::before`, absent on the doorstep object link and the two story-pole chapter links. |
| 4 | P2 | Medium | `instruments/inline-act.tsx` (+ test) is not on H3's file list nor the shared-file table — a real (if well-justified, plan-gap-driven) pathspec deviation. Flag for integration to confirm H4 doesn't independently define `.act--inline` in the Scored Ink block, which would leave two implementations of the same grammar. |
| 5 | P3 | Low-medium | The doorstep's papers-object regex requires a letter-only count word; at 13+ simultaneous open papers with no wall/letterbox clause ahead of it, no inline link renders at all, contradicting the plan's unconditional rule. Untested edge case. |
| 6 | P3 | Low | Ledger wraps with `gap-y-0`; unclear from the plan whether the "24px gaps" applies to both axes. Worth a visual check against a wrapped case (the specimen doesn't show one). |
| 7 | P3 / informational | High (that it's a real difference) / Low (that it's a defect) | Raw specimen's "Where we are"/"The papers" targets differ from the plan's (and lane's) `#doorstep`/`#mat-papers`; cross-checked against the load-bearing anchor table in `docs/design/the-client-page/README.md`, the plan's choice looks correct and the specimen looks stale here. Not attributed to the lane. |

## What's good, for the record

The `whatYouOwe`/`whatChanged`/`houseHasSpoken` derivation in `threshold.tsx` is careful, correct, and
independently traceable against all three render branches — this is the kind of place a plausible-looking
predicate is usually wrong, and it wasn't. Test counts and gate output in `h3-impl.md` were verified
byte-for-byte reproducible from a clean run in the worktree. Pathspec discipline is otherwise exact.
The lane's own report correctly surfaced the two issues I'm elevating to P2 (#1/#2) rather than hiding
them — worth noting since a fix round should go quickly.
