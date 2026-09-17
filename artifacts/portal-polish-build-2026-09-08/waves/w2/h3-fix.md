# Lane H3 — fix round against `h3-review.md`

**Branch** `portal-polish/h3` @ `0e4f1684e` · **Worktree**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3` · pushed to `origin/portal-polish/h3`.

## Disposition

| id | Severity | Verdict | Note |
|---|---|---|---|
| h3-1 | P2 | **fixed** | `installation` now resolves to the first room band's anchor, not `key`. |
| h3-2 | P2 | **fixed** | The `sections` array drops `key` when `roomsUnread`. |
| h3-3 | P2 | **declined — superseded by ruling RR-02** | The caret is deliberately killed on `.act--inline`. Evidence below. |
| h3-4 | P2 | **no code change; flag discharged** | Verified `origin/portal-polish/h4` defines no `.act--inline` anywhere in `apps/client-portal`. |
| h3-5 | P3 | **fixed** | The door pattern reads a bare numeral count. |
| h3-6 | P3 | **declined — out of scope** | The reviewer's own fix is conditional on a visual check; this lane runs no dev server and no browser. |
| h3-7 | P3 / informational | **no change (agrees with the lane)** | Recorded for the specimen's owner. |

---

## h3-1 — Installation goes to the room, not the legend · FIXED

`story-pole.tsx`: the static `CHAPTER_SECTION` map is replaced by

```ts
function chapterSection(slug: SpinePhase['slug'], firstBandAnchor: string | null): string | null {
  if (slug === 'procurement') return 'road';
  if (slug === 'installation') return firstBandAnchor;
  return null;
}
```

`StoryPoleProps` gains `firstBandAnchor?: string | null` (default `null`), and `threshold.tsx` passes
`firstBandAnchor={model.bands[0]?.anchor ?? null}` at the one `<StoryPole>` call site. The existing
`onThePage` filter is unchanged, so a band anchor that is not in `sections` still yields plain text.

Ruling re-read at source before changing anything:
`artifacts/portal-polish-review-2026-09-08/review/02-fix-log-client-house.md:45` — *"Only the two phases
with a band are links (Procurement → `#road`, Installation → `#study`)"* — confirmed at
`03-rereview-specimens.md:49` (T06 **confirmed fixed**). `#study` is a room band, not `PlanKey`.

A house with no bands (`model.bands` empty — the `roomsUnread` branch among others) passes `null` and
Installation stays plain text, which is SF-03's omission rule rather than a link to nowhere.

## h3-2 — the key leaves the array when the key leaves the page · FIXED

`threshold.tsx:1281-1288`:

```ts
...(roomsUnread ? [] : [{ id: "key", label: "The whole house" }]),
```

The array is both the caret's watch list and the pole's `onThePage` validity set, so with h3-1 there is
now no path by which a graduation links at an id the branch did not print. (Both halves are needed: h3-1
moves Installation off `key`, h3-2 stops `key` being *claimed* as on the page at all.)

## h3-3 — the inline caret · DECLINED, and why

The finding reads the house sheet's "Focus — one rule for every tier" block literally and concludes
`.act--inline` must carry the `\2038` caret. That reading was **explicitly overturned** in the specimen
fix round, after the re-review the finding cites:

- `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html:257` — the visual target this
  lane is built against:
  `.act--inline .label::before,.act--inline .label::after,.act--inline::after{content:none}`
- `.../review/02-fix-log-client-house.md:128` — **RR-02 | Fixed** | *".act--inline replaced with the
  shared block verbatim — border-bottom mechanism, font: inherit, color: inherit, box-decoration-break:
  clone, **pseudo-rules and caret killed**."*
- `.../review/02-fix-log-decision-moment.md:126` — the sister specimen, same coordinator block, same
  sentence: *"nulls .label::before/::after and the caret"*.
- `origin/portal-polish/h4:artifacts/.../deck/index.html:350` — the deck carries the identical
  `.act--inline::after{content:none}`, a third independent copy of the ruled block.

The sheet's own §A5 prose for this tier says "Same focus **ring** as the other tiers" (SPEC.md:235) — ring,
not caret — and the mechanical reason is visible in the ruled CSS: the caret is `position:absolute;
left:1px`, which on a padding-free inline act lands on top of the word's first letter rather than in a
margin. `InlineAct` already matches the ruled block exactly (outline `2px --clay-ink`, offset `2px`, no
`::after`), so **the correct code here is the code that is already there**; adding the caret would be a
regression away from the visual target and away from three concordant files.

No change made. If the coordinator wants the sheet's §A5 block amended to say the caret is dropped for
the inline tier, that is a sheet edit, not a client-portal one, and not H3's file.

## h3-4 — the unlisted `instruments/inline-act.tsx` · flag discharged, no code change

The finding asks for no fix from H3, only that integration confirm no second `.act--inline`
implementation exists. Checked:

```
$ git grep -n "act--inline\|inline-act\|INLINE_ACT" origin/portal-polish/h4 -- apps/client-portal
(no output)

$ git grep -c "act--inline" origin/portal-polish/h4 -- apps/client-portal/src/app/globals.css
(no match; rc=1)
```

H4's Scored Ink block defines no inline tier, so there is exactly one implementation of the grammar in
the portal. The only `.act--inline` text on H4's branch is inside the pre-existing review deck HTML
(`artifacts/portal-polish-review-2026-09-08/deck/index.html`), which is a specimen, not portal CSS.
The plan gap (no lane owns the `.act--inline` grammar) stands and is for the coordinator to amend.

## h3-5 — thirteen papers · FIXED

`doorstep.tsx`: `/(?:one paper|[a-z]+ papers)(?= waits? for your name)/i` →
`/(?:one paper|[a-z0-9]+ papers)(?= waits? for your name)/i`, with a one-line note recording the
constraint the regex cannot show (`countInWords` at
`instruments/standing-sentence.ts:140-144` returns `COUNT_WORDS[whole] ?? String(whole)`, so the count is
a numeral past twelve). Covered by a new test at thirteen papers.

## h3-6 — the ledger's vertical gap · DECLINED (out of scope)

The reviewer's own remedy is conditional — *"Consider `gap-y-2` or similar **if a visual check at
integration shows** the wrapped rows read as cramped"* — and this lane runs no dev server and no browser,
so the condition cannot be evaluated here. The plan's text is "44px tall, 24px gaps" with no axis named,
and each landmark is a 44px `ScoredAction` box, so wrapped rows already sit 44px apart on baseline.
Changing the number without the render would be guessing at a design value. Left as `gap-x-6 gap-y-0`,
for integration's visual pass to settle.

## h3-7 — specimen `#story-pole` / `#previously` · no change

Agrees with the lane. Recorded for whoever owns `specimens/client-house.html`: its "Where we are" and
"The papers" landmark targets look stale against
`docs/design/the-client-page/README.md:102-118`, which names `#doorstep` and `#mat-papers` as the
load-bearing anchors. Nothing changed in this lane on that account.

---

## Gate — re-run in the worktree after the fixes

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3 \
        --filter @patina/client-portal type-check
> tsc --noEmit
(no output, exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h3 \
        --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1053 passed, 1053 total       (1048 before this round; +5)
Snapshots:   0 total
Time:        17.637 s

$ npx eslint src/components/threshold        # run from apps/client-portal
  approval-ask.tsx:1080:7        error    react-hooks/set-state-in-effect
  instruments/tracking-row.tsx:104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)
# Byte-identical to the pre-fix run and to the reviewer's run. Neither file is H3's.

$ npx jest src/components/threshold --coverage \
    --collectCoverageFrom='src/components/threshold/{story-pole,doorstep,landmark-ledger}.tsx' \
    --collectCoverageFrom='src/components/threshold/instruments/inline-act.tsx'
File                   | % Stmts | % Branch | % Funcs | % Lines
All files              |   99.07 |    95.08 |     100 |     100
  doorstep.tsx         |     100 |    96.55 |     100 |     100
  landmark-ledger.tsx  |     100 |      100 |     100 |     100
  story-pole.tsx       |   98.64 |    93.75 |     100 |     100
  inline-act.tsx       |     100 |      100 |     100 |     100
# Floor is 70/60/70/70.
```

## Diff stat (this fix commit)

```
 .../threshold/__tests__/doorstep.test.tsx          | 12 +++++
 .../threshold/__tests__/story-pole.test.tsx        | 56 ++++++++++++++++------
 .../threshold/__tests__/threshold.test.tsx         | 33 +++++++++++++
 .../src/components/threshold/doorstep.tsx          |  6 ++-
 .../src/components/threshold/story-pole.tsx        | 24 ++++++----
 .../src/components/threshold/threshold.tsx         | 12 ++++-
 6 files changed, 117 insertions(+), 26 deletions(-)
```

Staged by explicit pathspec (six files, listed one by one — no `-A`, no `.`, no `-u`).

## Tests added (5)

- `story-pole.test.tsx` (+3, and the describe's fixture house now draws a `study` band):
  Installation links `#study`; no link anywhere in the pole resolves to `#key`; a page with no band
  leaves Installation plain text.
- `threshold.test.tsx` (+2): Installation's link is `#room-<library id>` and that element is on the page,
  with no pole link at `#key`; a `roomsUnread` house prints no `#key` and every pole link it does draw
  resolves to an element that exists.
- `doorstep.test.tsx` (+1): "13 papers wait for your name" links to `#door` with the numeral inside the
  object.

## What I did not do

- **No caret added to `InlineAct`** — see h3-3 above; the ruled block kills it.
- **No `globals.css`, no `scored-action.tsx`, no gate, band, mat, colophon or date file.** The six files
  in this commit are all inside H3's declared list.
- **No prettier reformat.** The pre-push hook reports formatting drift on all six files; verified
  pre-existing (`git show HEAD~1:…/story-pole.tsx | npx prettier --check` warns identically), so
  reformatting would bury the fix in unrelated churn.
- **No dev server, no DB reset, no migration, no deploy, no `main`.**
- Did not change the ledger's `gap-y` (h3-6) or the specimen file (h3-7).
