# Lane H3 — Landmark ledger and the story pole (PP-5 / IA-20, IA-23)

**Branch** `portal-polish/h3` · **Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3`
· cut from `origin/main` @ `1059f5275` (W1 ship report — 00580 on Strata).

## What shipped

### 1. `landmark-ledger.tsx` (new)

Five `.t-head` tertiary acts (`ScoredAction variant="tertiary" className="t-head"`, so the 44px control
box and the unconditional oak rest rule come from the portal's own Scored Ink grammar — H4's block),
laid out `flex flex-wrap gap-x-6` (24px) so they wrap to two rows at 390 and still stand above the
doorstep.

| Landmark | Target | Rendered when |
|---|---|---|
| Where we are | `#doorstep` | the house has spoken |
| What changed | `#changed` | the doorstep's since block drew |
| What you owe | `#letterbox` (carries `data-never-dim`) | the letterbox drew |
| What needs you | first of `#wall` / `#door` / `#approval-<id>` | an ask drew |
| The papers | `#mat-papers` | the mat drew |

**A landmark whose target does not render is omitted, never disabled.** The component takes five
explicit props rather than deriving presence itself — only the page knows which of its regions drew —
and returns `null` when it has none. `threshold.tsx` answers each from what the branches below
actually render (see §4).

### 2. `instruments/inline-act.tsx` (new)

The `.act--inline` grammar from house sheet §A5 / §F-D, as a Tailwind class string plus a thin `<a>`
wrapper: `display:inline`, no min-height box, `font/letter-spacing/text-transform/color: inherit`, a
1px `--color-aged-oak` rule at `padding-bottom: 3px`, hover → `--color-quiet-ink` at 1.5px, focus ring
`2px --color-clay-ink` at `outline-offset: 2px`, `box-decoration-break: clone` so a wrapped link keeps
its rule. **Not in `globals.css`** (H2/H4 own that file) — my brief permits "a small shared class in the
threshold instruments", and both the doorstep and the pole need the same word inked the same way.
No new hex literal: every colour is an existing client-portal token.

### 3. `doorstep.tsx`

- `id="changed"` **added** to the since-yesterday block (`data-testid="doorstep-changed-block"`).
  Nothing renamed — the section is still `id="doorstep"`.
- `hasChangedBlock()` exported so the ledger omits "What changed" from the same predicate that decides
  whether the block draws, rather than a second copy of the condition that can drift.
- The sentence's **object** becomes an inline link to its gate. The objects are the clauses
  `standingSentence` composes, so each phrase is only ever written when the thing it names is on the
  page: `finished work` → `#wall`; `one paper` / `<n> papers … waits for your name` → `#door`;
  `a balance of $X … stands open` → `#letterbox`. The **earliest** object in the sentence wins, and
  exactly one link is drawn; a sentence naming nothing ("Nothing waits on you today.") draws none.

### 4. `story-pole.tsx`

- **Graduations navigate.** A chapter links to the section the page keeps for it, filtered against the
  `sections` prop so a link never points at a section the page did not give:
  `procurement → #road`, `installation → #key`. The other four chapters have no section of their own
  and stay plain text — SF-03's ruling, that three chapter names resolving to one anchor is worse than
  none. The held graduation is a link on the same rule (it is `installation` in the common case, which
  is what `specimens/client-house.html` draws).
- **The caret did not become a control**: still an `aria-hidden` `<span>`, no href, not inside any
  anchor or button (pinned by a test).
- **≤600px**: the rail is no longer hidden outright. The aside becomes `position: sticky; top: 0` on
  `--bg-primary` with a hairline bottom rule, the "The story pole" head hides, and a one-line
  **"You are in: {section}"** tertiary act (`aria-expanded` / `aria-controls="story-pole-rail"`,
  `data-open` on the aside) opens the same graduation list. The six dots moved onto that same line so
  the bar is genuinely one line; the `story-pole-here` label hides there because the toggle already
  says it. Jumping to a chapter shuts the bar. Above 600px nothing changed — the rail is the rail.
- New id `story-pole-rail` on the `<ol>` (added, nothing renamed).

### 5. `threshold.tsx` — only my two regions

- **The `sections` array** (`:1254-1264`) gains `letterbox` and the first gate, in the order the page
  prints them: `doorstep → letterbox → wall|door → key → bands → road → note → previously → mat`.
  `letterbox` is guarded on `!model.groundFloor` because a ground-floor house with unread rooms falls
  into this branch and prints no letterbox. The gate entry uses `firstGateAnchor`.
- **`<LandmarkLedger>` mounted directly under the doorplate**, outside `<SinceYesterday>` — an index
  that faded with the page would be an index of nothing.
- Two new consts feeding both: `firstGateAnchor` (`wall` → `door` → null, computed from the existing
  `firstWallId`/`firstDoorId`, which are already the ids of gates whose paper is present) and
  `whatNeedsYou` (that, else `approval-<doorstepAsks[0].decisionId>`), plus `houseHasSpoken`
  (`hydrated && !loading && !model.pending`) so a page holding its place shows no landmarks.

Nothing else in `threshold.tsx` moved. H5's band props are untouched.

## Evidence

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(no output, exit 0)

$ pnpm --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1048 passed, 1048 total          (1026 before this lane; +22 new)
Time:        30.502 s

$ pnpm --filter @patina/client-portal test          # whole portal
Test Suites: 136 passed, 136 total
Tests:       2283 passed, 2283 total
Snapshots:   1 passed, 1 total
Time:        118.963 s

$ npx eslint src/components/threshold/{landmark-ledger,story-pole,doorstep,threshold}.tsx \
             src/components/threshold/instruments/inline-act.tsx \
             src/components/threshold/__tests__/{landmark-ledger,story-pole,doorstep,threshold}.test.tsx \
             src/components/threshold/instruments/__tests__/inline-act.test.tsx
(no output, exit 0)

$ npx eslint src/components/threshold                # whole dir
✖ 2 problems (1 error, 1 warning)
  approval-ask.tsx:1080  error   react-hooks/set-state-in-effect
  instruments/tracking-row.tsx:104  warning  Unused eslint-disable directive
# Identical with this lane's changes stashed → 0 NEW errors. Neither file is mine.

# Coverage over this lane's four source files (floor 70/60/70/70):
  doorstep.tsx         100 stmts / 96.55 branch / 100 funcs / 100 lines
  landmark-ledger.tsx  100 / 100 / 100 / 100
  story-pole.tsx       98.57 / 93.5 / 100 / 100
  inline-act.tsx       100 / 100 / 100 / 100
```

Note: `npx eslint` must run from `apps/client-portal` — from the repo root ESLint 9 finds no
`eslint.config.js` and exits before linting anything.

## Diff stat

```
 apps/client-portal/src/components/threshold/__tests__/doorstep.test.tsx    | 100 ++++
 apps/client-portal/src/components/threshold/__tests__/story-pole.test.tsx  | 127 +++++
 apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx   | 107 ++++
 apps/client-portal/src/components/threshold/doorstep.tsx                   |  84 +++-
 apps/client-portal/src/components/threshold/story-pole.tsx                 | 128 ++++--
 apps/client-portal/src/components/threshold/threshold.tsx                  |  47 +-
 6 files changed, 555 insertions(+), 38 deletions(-)
 + apps/client-portal/src/components/threshold/landmark-ledger.tsx                  (new)
 + apps/client-portal/src/components/threshold/__tests__/landmark-ledger.test.tsx   (new)
 + apps/client-portal/src/components/threshold/instruments/inline-act.tsx           (new)
 + apps/client-portal/src/components/threshold/instruments/__tests__/inline-act.test.tsx (new)
```

## Tests added (22)

- `landmark-ledger.test.tsx` (6): all five struck; nav not a header and not a threshold unit; a
  landmark whose target is absent is omitted and no survivor is `aria-disabled`; `data-never-dim` on
  What you owe only; "What needs you" follows `wall` / `door` / `approval-<id>`; renders nothing with
  nothing to give.
- `inline-act.test.tsx` (5): anchor at its in-page target; the oak rule is unconditional (no `scaleX`,
  no hover-only rule); no min-height/min-width box and type inherited; the house focus ring;
  attributes forwarded.
- `doorstep.test.tsx` (+8): `#changed` on the since block; no block and no `#changed` when there is
  nothing to put in it; a reading mark alone draws it; finished work → `#wall`, papers → `#door`,
  balance → `#letterbox`; only the first object is linked; a sentence naming nothing links nothing.
- `story-pole.test.tsx` (+8): chapters with a section link to it; chapters without stay plain text; a
  chapter whose section is not on this page is never a link; every link drawn points at a section the
  page gave; the caret is not a control; the ≤600 bar renders, says where she is and expands/collapses;
  the bar's label follows the caret; jumping shuts the bar.
- `threshold.test.tsx` (+6): the ledger stands between the doorplate and the doorstep; every landmark
  href resolves to an element on the page; What needs you → `#wall` and What you owe carries
  `data-never-dim`; a page holding its place renders no ledger; **no anchor renamed** (the full id set
  `doorstep key letterbox wall door road note previously mat mat-papers ledger` still resolves); the
  `sections` array is proved through the IntersectionObserver's observed nodes, which now include
  `letterbox` and `wall`.

## What I did not do

- **No `globals.css`.** The inline-act grammar lives in `instruments/inline-act.tsx`; H2 and H4 own
  that file this wave.
- **No anchor renamed.** Added only: `#changed` (doorstep) and `#story-pole-rail` (the `<ol>`, not a
  route anchor). Cross-checked against `docs/design/the-client-page/README.md:102-118`.
- **No dev server, no DB reset, no `pnpm db:generate`, no migration, no deploy.**
- Did not touch H5's band props, H4's `scored-action.tsx` / gates, H1's mat / colophon, or H6's dates.
- Did not remove the ≤600 dot strip (not in scope) — it moved onto the new bar's line instead.
- Did not add `t-head`/`t-meta` CSS: `className="t-head"` on the ledger's acts resolves once **H2**
  lands (integration order H2 → H1 → H4 → **H3**), which is why the ledger reads its size from the
  Scored Ink tertiary until then rather than breaking.

## Flags for the reviewer / integration

1. **`#key` in an error state.** The `sections` array lists `key` unconditionally (pre-existing), but
   `PlanKey` is skipped when `roomsUnread`. In that one error state the pole's `installation` link
   would point at an absent `#key` (the caret already watched the same absent id before this lane). I
   left the array's `key` entry alone rather than widen my region; gating it on `!roomsUnread` is a
   one-line follow-up if the reviewer wants it closed.
2. **Chapter → section map.** `procurement → #road`, `installation → #key` is my reading of "graduation
   labels … become anchor links to their section ids" under SF-03's omission rule; the specimen wires
   Installation to the first room band (`#study`) instead. If the ruling is the band, the map moves to
   the first `band.anchor` and `threshold.tsx` must mark which sections are bands.
3. **The doorstep's object link** is matched out of the sentence string because `threshold.tsx`'s
   `<Doorstep …>` call sites are outside my region — no new prop could be passed. If a later lane owns
   those call sites, an explicit `{text, href}` prop would be sturdier than the three regexes.
4. `jest` prints "A worker process has failed to exit gracefully" on the **full** portal run. Present
   before this lane; all 136 suites pass.
