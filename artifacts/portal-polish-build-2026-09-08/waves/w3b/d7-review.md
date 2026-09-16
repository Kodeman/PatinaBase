# Lane D7 review — Desk follow-ups from Wave 3 (Wave 3b)

**Reviewer context.** Separate from the implementer; did not write any of this diff. Read
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Global constraints, Shared-state
ownership, Copy strings that tests pin, the Wave 3 section and its shared-file table — Wave 3b/Lane
D7 has no dedicated plan section; confirmed against `waves/w3b/a3-review.md`, which independently
notes the same thing for its own sibling lane), `docs/design/house-sheet/SPEC.md` §A/§F (the aged-oak
rest pigment at `:50-51`, 4.20:1, and the Desk table item 5 / lead line at `:776` of
`designer-desk.html`), `apps/designer-portal/CLAUDE.md`, the Wave 3 ship report
(`ship/w3-ship.md` §4 "Divergences" and §9 "Owed to Kody" — items 3, 4, 6), `waves/w3/d1-rereview.md`
(D1's specimen-comparison table, the P2 sign-off on out-of-list files, and D1-4/5/6's dispositions),
and `d4-impl.md` off `origin/portal-polish/d4` (not on `main` — same gap D1's re-reviewer and A3's
reviewer already flagged; its "Departures" §3 and "Two side effects" §2 are exactly the two items D7
closes). Read `waves/w3b/d7-impl.md` in full off `origin/portal-polish/d7` (also not yet on `main`).

Wave 3b, like Wave 3b's Lane A3, has no canonical brief text to quote — the "brief" is the set of
owed items the Wave 3 ship report, D1's re-review, and D4's own report left on record. I verified
D7's actual scope against those three documents directly rather than trusting the report's own
"Read first" framing, and it matches: the lead-line client-name/date-idiom fix (owed by D1's
re-review's specimen table and the ship report's divergences 3/4), the 390 name-wrap fix (ship
report §9, "The 390 Desk"), the `.da-score-hover` rest-visibility fix (D4's own "Two side effects"
§2, explicitly "Recommend a follow-up lane"), and the ⌘K combobox pattern (D4's own "Departures" §3,
explicitly "Worth a ruling… a small follow-up").

Inspected `origin/main...origin/portal-polish/d7` as a diff and the worktree at
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d7` (confirmed `git rev-parse
--show-toplevel` resolves there; `git log -1` on that worktree = `7841fda9b`, matching `git
ls-remote origin portal-polish/d7` after a fresh `fetch origin`). Ran the lane's gate myself from
that worktree — see Evidence. Did not implement or previously review this lane.

## Verdict

**approve.** No P1 or P2 findings. Four P3s below, all informational — none blocks merge.

---

## Scope and pathspec discipline

```
$ git diff --stat origin/main...origin/portal-polish/d7
 .../src/app/(document)/desk/page.tsx               |   8 +-
 apps/designer-portal/src/app/globals.css           |  16 +-
 .../src/components/document/command-bar.test.tsx   |  53 +++--
 .../src/components/document/command-bar.tsx        |  11 +-
 .../src/components/document/desk-roster.test.tsx   |  21 +-
 .../src/components/document/desk-roster.tsx        |   8 +-
 .../document/__tests__/action-rest-rules.test.ts   |  33 ++-
 .../src/lib/document/__tests__/dates.test.ts        | 104 ++++++++
 .../__tests__/desk-roster-derivation.test.ts        |  44 +++-
 apps/designer-portal/src/lib/document/dates.ts      |  89 +++++++
 .../src/lib/document/desk-roster-derivation.ts      |  25 +-
 .../waves/w3b/d7-impl.md                            | 268 +++++++++++++++++++++
 12 files changed, 630 insertions(+), 50 deletions(-)
```
(268/630 above reflects the small doc-only addendum commit `7841fda9b`, made after the report's own
264-line/627-insertion snapshot; content-checked, see the "additional commit" note below.) Every file
is inside `apps/designer-portal` plus the lane's own report — no `packages/supabase`, no
`supabase/migrations`, no client-portal file, no governance doc. `git add -A` was never used
(confirmed by reading each commit's file list individually; no stray file rides along).

**Hunk-level check against sibling lanes' ownership**, since D7 revisits two files three other
lanes also touched in Wave 3:
- `desk-roster.tsx`: one hunk, inside `JobLine`'s name `<Link>` only (`className`/`data-roster-name`).
  Not the head row (D2's territory) and not the day's-line block mount point (D1's, and already
  merged — this is D1's own follow-up region, not an encroachment).
- `desk-roster-derivation.ts`: touches only the `(b)` lead-deadline branch inside
  `deriveDeskDayLine` (D1's own function) — not D2's facet predicates, not the `RosterLine`
  interface either lane extended.
- `app/(document)/desk/page.tsx`: one import line and the `dateLabel` greeting string — nowhere
  near D3's grid/`rosterBlock` or D2's `studioMembers` wiring (both far below, unreferenced here).
- `globals.css`: only the `.da-score-hover`/`.da-score-hover::after`/hover-rule block. D4's other
  Scored Ink regions (`.da-*` DocumentAction tiers, `.row-wash-score`, the caret, focus outline) are
  untouched — confirmed no other hunk appears in the diff for this file.

No sibling lane is running concurrently against these same regions in Wave 3b (D7 is the only lane
in this follow-up wave touching `apps/designer-portal`, per the artifacts tree), so there is no
live merge-conflict risk to flag, only the historical-ownership check above, which is clean.

## Gate — run myself, from the worktree, on the head commit (`7841fda9b`)

```
$ git -C /Users/kody/Code/patina-merged fetch origin   (required dangerouslyDisableSandbox — the
    plain sandboxed fetch failed with a proxy/SSH refusal, matching the plan's own sandbox note)
$ cd .codex/worktrees/agent-pp-d7 && git rev-parse --show-toplevel && git log --oneline -3
/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d7
7841fda9b docs(portal-polish): D7 report — note the pre-push advisory is the known lint pair
4f65c9fab docs(portal-polish): D7 implementation report
e5e36e96b fix(designer): ⌘K is a combobox (B03)
```

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 549 passed, 549 total
Tests:       6806 passed, 6806 total
Snapshots:   12 passed, 12 total
Time:        29.565 s
```
Matches the report's claimed numbers exactly. Wave-3 baseline was 548 suites / 6786 tests / 0 todo
(per `ship/w3-ship.md` §3). Net **+1 suite** (`dates.test.ts`), **+20 tests**, nothing lost, nothing
skipped, no new todo — the baseline is not just held, it grew.

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total
Tests:       63 passed, 63 total
```

```
$ git diff origin/main -- \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts | wc -l
0
```
The designer shadow gate and `shadow-gate.test.ts` are green and **byte-unchanged** — verified
directly, not merely re-quoted from the report.

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159   import/first
  use-commercial-documents.test.ts:930  react-hooks/rules-of-hooks
```
The two known pre-existing errors, same rules, same lines as the Wave-3 baseline. Not grown — exact
match, not just "still 2".

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/command-bar.test.tsx \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts \
    src/lib/document/__tests__/dates.test.ts \
    src/lib/document/__tests__/action-rest-rules.test.ts
Test Suites: 5 passed, 5 total
Tests:       164 passed, 164 total
```
Every suite the lane's diff actually touches or adds, green in isolation.

```
$ git diff origin/main...HEAD -- apps/designer-portal | grep '^+' | grep -oE '#[0-9A-Fa-f]{3,8}'
(empty — no new hex literal)
$ git diff origin/main...HEAD -- apps/designer-portal | grep '^+' | \
    grep -iE 'truncate|whitespace-nowrap|opacity-5|pill|badge|spinner|✓|line-clamp'
(three hits, all comments/negative-assertions about truncation — "never truncate", ".not.toContain('truncate')" — no truncation actually added)
$ git diff origin/main...HEAD -- apps/designer-portal | grep '^-' | grep -oE 'id="[a-zA-Z0-9-]+"'
(empty — no anchor id removed or renamed)
```

I reproduced every number the report claims and they check out exactly. Findings below go beyond
what the report already discloses, or push back on a disposition I weigh differently.

---

## Findings

Severity scale: P1 blocking, P2 should fix or get explicit sign-off before merge, P3 minor or
informational. Confidence is my own calibration.

### What's clean (re-verified independently, not re-quoted)

**1. The lead line leads with the client, in one date style (PP-2, D1's re-review item).**
Read `desk-roster-derivation.ts` directly: the `lead` branch's first `DayLinePart` is
`{ kind: 'job', text: lead.line.client ?? lead.line.name, engagementId: … }` and the second is
`{ kind: 'text', text: ' · new lead — respond by ' + dayMonth(lead.line.dueOn) }`, rendering
`Marcus Wright · new lead — respond by 27 August` — matching the specimen's shape
(`designer-desk.html:776`) both in client-first ordering and now in date idiom (en-GB, day before
month), where D1's original ship carried `Aug 27`. The filter changed with it, correctly: the
precondition is `!!dayMonth(entry.line.dueOn)` rather than `!!entry.line.needText`, so a `new_lead`
with an unreadable/absent deadline yields no lead line rather than a half sentence — confirmed by
the new test *"omits the lead line when the deadline cannot be read"*, which constructs exactly that
row and asserts no `lead` key survives. The job title (`Wright apartment`) is asserted, by name, to
appear nowhere on the line — a direct check against the exact defect the specimen comparison flagged.
`reconnect_due`'s pinned exclusion is untouched (not in this lane's diff at all).

**2. One date style reaches the greeting too.** `dates.ts` mirrors
`apps/client-portal/src/lib/threshold/dates.ts` line for line in contract (`parseSourceDate`,
`legalDate`, `dayMonth`, the local-parts UTC-midnight guard, the null-on-unreadable contract) —
diffed the two files directly, confirmed the shapes and doctrine comment match, with `WEEKDAY_FORMAT`
as the one addition, used only by the greeting (`desk/page.tsx`'s `dateLabel`, `TUESDAY · 8
SEPTEMBER` in place of `TUESDAY · SEPTEMBER 8`). Grepped the lane's own files for `en-US` (`grep -rn
"en-US" desk-roster-derivation.ts desk-roster.tsx "app/(document)/desk"` — zero matches) — reproduced
this myself rather than trusting the report's claimed exit code.

**3. The 390 overflow — the mechanism the fix targets is real and the fix is sound.** The Wave 3 ship
report measured `scrollWidth 437 / clientWidth 390` and isolated it, by DOM surgery, to a
pre-existing roster row with an unbreakable job name inside a `flex-wrap` `<li>` — not to any D-lane's
own new markup. `JobLine`'s name `<Link>` gains `min-w-0` (a flex child's `min-width` is `auto` by
default, so without it an unbreakable string sets the row's floor width) and
`[overflow-wrap:anywhere]` (lets a string with no break opportunity wrap rather than push). I checked
the row's other children directly: the state `<p>` already carries `min-w-0 flex-1` (pre-existing,
confirmed by reading the file, not the diff — it is unchanged), the mark span is a fixed 7px
`shrink-0`, and the trailing `DocumentAction`'s min-content is short text on a `flex-wrap` row, so it
wraps to its own line before it would need to shrink. The new test (*"lets a long job name wrap
instead of widening the page (390)"*) asserts `min-w-0` and `[overflow-wrap:anywhere]` are present
and `truncate`/`whitespace-nowrap` are absent on every `[data-roster-name]` — behavioral coverage of
the class contract, not just markup for its own sake, since jsdom cannot itself measure `scrollWidth`
against a real viewport. **The report is explicit and correct that the actual 390 render/measurement
is unverified here** — this lane started no server, matching Wave 3b's stated constraint (no dev
server, no DB, no port) and the plan's shared-state rule that renders belong to an integration lane.
I did not run a render either; I verified the CSS mechanism is the right one for the diagnosed cause,
not that it visually resolves at 390 — see Owed below, carried from the report's own "Owed" §2.

**4. `.da-score-hover` rests visible (PP-3 / R139).** This closes exactly the debt D4 itself named
and froze by test in Wave 3 (`d4-impl.md`, "Two side effects" §2: "Recommend a follow-up lane").
Read `globals.css` directly: `.da-score-hover::after` drops `transform: scaleX(0)` and its transform
transition, rests at 1px `--color-aged-oak` (4.20:1 per `SPEC.md:50-51` — meets the "3:1 rest" bar
named in my brief with margin to spare, since it's the same token R139 already blessed at
unconditional rest), and raises to `--color-clay` via `background-color` on hover/focus-visible,
using the same `--duration-fast`/`--ease-editorial` tokens `.row-wash-score` already uses one block
above (grepped both — same clock, no new token). `transform-origin` is correctly retained because
`.da-score-on::after` (an untouched, different block) still sets `transform: scaleX(1)`.
`action-rest-rules.test.ts`'s frozen exception — the test that used to name
`[".da-score-hover::after"]` — now asserts the list is **empty**, and a second new test pins both the
aged-oak rest and the clay raise by value, not just by absence of `scaleX`. I confirmed no other
`.da-*` rest rule in the stylesheet uses `scaleX(0)` by reading the test's own regex-driven
`restRulesTouching` helper output, not just trusting the assertion. The 31-file consumer list in the
report (visual-only change, no source file among the 31 edited) is accurate — `git diff --stat`
confirms none of those files appear in this diff.

**5. ⌘K completes the combobox pattern (B03), closing D4's own named gap.** D4's report explicitly
recorded that it reverted `role="combobox"` because adding it broke 21 `getByRole('textbox', …)`
call sites, and flagged "the full combobox pattern is a small follow-up." D7 adds `role="combobox"`,
`aria-expanded={!asking}` and `aria-autocomplete="list"` to the input, keeping
`aria-activedescendant`/`aria-controls`/`aria-owns` exactly as they were. I read the surrounding
code to check the `aria-expanded` logic specifically, since it is the one part not purely additive:
when `asking` (the Engine free-text question mode) is truthy, the component renders a *different*
panel entirely (`Results · "{asking}"` plus `<EngineResults>`, no `role="listbox"`) rather than the
combobox's own popup — so `aria-expanded={!asking}` correctly reports "no popup" in that state, and
`aria-controls`/`aria-owns` are correctly `undefined` there too (both keyed off `asking`). This is
the accessibility-correct reading of a genuinely dual-mode input, not a shortcut. The keyboard
handler (`ArrowDown`/`ArrowUp`/`Enter`, ends clamped, focus restore on close) is untouched — confirmed
by hunk inspection, the `onKeyDown` body has no diff lines. All 21 of the test file's `getByRole` /
`findByRole('textbox', …)` call sites (I counted 21 via `grep`, matching the report's count) are now
`combobox`, plus one new test in the existing `B03` describe pinning all four attributes by value.
Re-ran this suite myself: 46 tests (38 pre-existing + 8 original B03 + this lane's addition), all
green, zero remaining `textbox` queries in the file (grepped, zero hits).

**6. Absence-is-silence, no truncation, no new depth.** Independently grepped the whole diff (shown
above) — no new hex, no shadow/badge/pill/spinner/✓/line-clamp added, no anchor id renamed or
removed, `shadow-gate.test.ts` untouched. `--elevation-sheet` and `desk-settle` do not appear
anywhere in this diff (checked directly).

**7. Test coverage targets behavior, not just markup.** The new tests assert observable contract —
what text renders (`'Marcus Wright · new lead — respond by 27 August'`), what a facet of state
prevents (no lead line when the date is unreadable), what a CSS rest rule actually computes to
(`background-color`, not merely "not scaleX"), and what ARIA state a screen reader would see
(`aria-expanded`, `aria-autocomplete`, `role`) — not implementation-detail class-string snapshots for
their own sake. The one place a class string is asserted directly (`min-w-0`,
`[overflow-wrap:anywhere]`) is the same defensible jsdom limitation D1's own re-review already
weighed at P3 for an adjacent CSS-only mechanism (pseudo-element/focus-visible content jsdom cannot
render) — I don't consider it a fresh issue here, just the same known ceiling.

### P3 — the specificity trade the report itself flags (confidence: medium, already disclosed)

`.da-score-hover:hover::after` (two classes + pseudo-class + pseudo-element, specificity ~(0,0,3,1))
now sets `background-color`, and it is declared *before* `.da-score-on::after` (one class + one
pseudo-element, ~(0,0,1,1)) in source order but with **lower** combined specificity than the
`:hover` compound selector — meaning a control carrying both `da-score-hover` and `da-score-on`
(a selected picker/toggle) shows clay, not charcoal, while the pointer sits on it, because the hover
rule's higher specificity wins over `.da-score-on`'s charcoal regardless of source order. Before this
change both rules only ever set `transform`, to the same value, so the conflict was inert; now they
disagree on `background-color` and the more specific one wins. The report names this itself as owed
item 4 ("`.da-score-on` now loses to `:hover`") and explicitly scopes it out ("outside this lane's
file list… a one-line specificity bump in the `.da-score-on` block and a ruling, not a lane's call").
I agree with that scoping — the brief named "the `.da-score-hover` block only," and `.da-score-on` is
a separate, unedited block feeding ~30 shared consumers concurrently. Recording it here because the
review checklist asks for accessibility/visual-contract findings named regardless of whether the
lane already disclosed them, not because I think it should block merge or send D7 back — a hovered
selected control simply reads as "hovered" instead of "selected-and-hovered," which the report
correctly calls defensible.

### P3 — `dayMonth`/`legalDate` are en-GB while `WEEKDAY_FORMAT` composes with them (confidence: low, informational)

`dateLabel` builds `` `${WEEKDAY_FORMAT.format(now)} · ${dayMonth(now)}` `` and then `.toUpperCase()`s
the whole string. `WEEKDAY_FORMAT` is `Intl.DateTimeFormat('en-GB', { weekday: 'long' })`; en-GB and
en-US spell weekday names identically ("Tuesday"), so there is no visible behavior difference today,
but if a future locale swap ever touched only one of the two formatters this composition would
silently split. Not a defect — the file's own doctrine comment already anticipates exactly this class
of risk ("nothing on this surface composes its own `Intl.DateTimeFormat`… a Desk that says X one line
above Y is telling a designer two things") and `WEEKDAY_FORMAT` is exported from the same file for
this reason. Purely a note for whoever next touches locale on this surface.

### P3 — one residual date idiom the report itself owes forward, re-confirmed as out of scope here (confidence: high on the fact, not a lane defect)

The report's own "Owed" §1 states the roster row's state sentence (`New lead — respond by Aug 27`)
still prints the older `en-US`/short-month idiom, sourced from `desk-derivation.ts`'s module-private
`fmtDay`, a file explicitly not in this lane's list and shared by folio cards, the margin, and the
document guide. I confirmed the claim by grepping `desk-derivation.ts` for `fmtDay` call sites — nine
call sites (`:575,603,696,714,715,766,795,796,924,1137,1142`) plus `fmtDayTime` at `:507`, matching
the report's line numbers closely enough to trust the count (I found 12, the report says roughly the
same set; the discrepancy is the report grouping two adjacent lines as one item, not a
miscount). This means, after D7, the Desk still shows **two** date idioms in adjacent lines — `27
August` on the day's line and the greeting, `Aug 27` on the row directly beneath it — which is a
partial, not full, resolution of PP-2 on this surface. The report discloses this candidly and scopes
it correctly (a real, larger lane touching a shared file this one was not given). Not a P2: the lane
did exactly what its owed-item asked (fix the day's line and the greeting) and did not silently claim
the whole surface was done — the "Owed" section says the opposite in its own words. Noting it here so
whoever assembles the Wave 3b ship report doesn't read "one date style on the Desk (PP-2)" as
complete without the caveat.

### What I did not do

- Did not run a dev server, `supabase db reset`, or any render/e2e pass at 390/1280/1440 — Wave 3b's
  stated constraint (no DB, no port) and the plan's shared-state table both put that with an
  integration lane, which this follow-up wave has not yet named. The 390 fix is therefore verified
  as a sound CSS mechanism against a correctly-diagnosed cause, not as a rendered pixel measurement.
- Did not re-litigate D1's original re-review findings (the out-of-list `jest.mock` sign-off, the
  declined specimen items D1-4/5/6) — none of that code is touched by this diff.
- Did not attempt to resolve the `.da-score-on`/`:hover` specificity interaction or the residual
  `fmtDay` date idiom myself — both are correctly scoped out of this lane's file list per the brief
  quoted in its own report, and both are already on record as owed.
