# Lane H4 re-review — Action tiers and the gates (PP-3)

**Re-reviewer context:** separate from the implementer AND from the first reviewer; I did not
implement this lane and did not trust either prior report on its word — every claim below was
re-derived from the diff, the worktree, or a command I ran myself. Branch `origin/portal-polish/h4`
at `origin`'s current tip (`4b0c8489f`, "fix(client): address W2 review — h4"), inspected read-only
at `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4`. Compared against the plan's Lane
H4 section, its Review checklist, the Review protocol, `docs/design/house-sheet/SPEC.md` (§A5, §A6,
§F, and the `.act` base rule at `:169-186`), `h4-impl.md`, `h4-review.md`, `h4-fix.md`, and
`artifacts/portal-polish-review-2026-09-08/specimens/{client-house,decision-moment}.html`.

## Verdict

**approve.** The one P1/P2 the first review found (the Pay act's native `disabled` regressing its
submitting state to the unavailable face) is fixed and I verified the fix independently — CSS
specificity/ordering, the label swap, `aria-busy` placement, and a new test that actually exercises
the pending-fetch window. No P1/P2 remains. Three P3s stand (two carried forward as correctly-scoped
and already-disclosed, one new).

## Gates — reproduced independently, a third time

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4 --filter @patina/client-portal type-check
> tsc --noEmit                                                          (clean, no output)

$ pnpm --dir .../agent-pp-h4 --filter @patina/client-portal test -- src/components/threshold src/app/pay
Test Suites: 47 passed, 47 total
Tests:       1126 passed, 1126 total
Time:        12.255 s

$ cd .../agent-pp-h4/apps/client-portal && npx eslint src/components/threshold src/app/pay
approval-ask.tsx  1080:7  error    react-hooks/set-state-in-effect
tracking-row.tsx   104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)
```

All three numbers match both the impl's and the first reviewer's numbers exactly (1126, not the
pre-fix 1124 — confirming I'm looking at the post-fix state). I independently confirmed both ESLint
hits are untouched by this diff:
`git diff origin/main...origin/portal-polish/h4 --stat -- apps/client-portal/src/components/threshold/approval-ask.tsx apps/client-portal/src/components/threshold/instruments/tracking-row.tsx`
returns nothing.

## Pathspec discipline

`git diff origin/main...origin/portal-polish/h4 --stat` (fetched fresh from `origin`, not trusting a
stale local ref): 15 entries — 8 lane-owned source/test files, 2 report files (`h4-impl.md`,
`h4-fix.md`), and **5** test files beyond the lane's declared list:
`instruments/__tests__/hold-action.test.tsx`, `__tests__/approval-ask.test.tsx`,
`__tests__/scope-change-ask.test.tsx`, `app/trade/[token]/__tests__/trade-agreement-signature.test.tsx`
(from the impl), plus `app/pay/[token]/__tests__/invoice-sheet.test.tsx` (new, from the fix).

I checked each one is test-only and mechanical, not by reading the diff summary but by reading the
diffs themselves:
- The four impl-era files are each a `toBeDisabled()`/`toBeEnabled()` → `toHaveAttribute('aria-disabled', …)`
  swap and nothing else — I read every hunk in all four and found no new assertion, no new case, no
  behavioral change beyond the API rename. `approval-ask.tsx` and `scope-change-ask.tsx` themselves
  (the non-test files) are untouched — confirmed via
  `git diff origin/main...origin/portal-polish/h4 --stat -- apps/client-portal/src/components/threshold/approval-ask.tsx apps/client-portal/src/components/threshold/scope-change-ask.tsx apps/client-portal/src/app/trade/`
  returning only the one signature test file. This is a real, unavoidable consequence of `HoldAction`
  being a shared instrument that four other callers already depend on — reverting these four files
  would make the lane's own gate red by construction.
- `invoice-sheet.test.tsx`'s new case is the regression test for h4-1 (below) — I read it and it
  actually exercises the pending-fetch window (holds a promise open with `openCheckout`, asserts
  label/class/`aria-disabled`/`aria-busy`, then resolves and awaits under `act()` so nothing leaks).
  It adds one `it()`; nothing existing in that file changed.

**Finding — pathspec breach, disclosed and justified.** `docs/superpowers/plans/2026-09-08-portal-polish-build.md`'s
global constraint is unqualified ("Touch ONLY the files your lane lists"), and five test files
outside H4's declared list carry real diffs. Both prior reports disclosed this transparently and
argued — correctly, in my independent read — that the alternative (reverting them) would make the
gate red for a reason unrelated to any defect in this lane's own work. I agree with the fix report's
own framing: nothing to fix here, flag for the integration lane's sign-off. **P3, high confidence.**

## House-sheet fidelity — re-verified line by line, not by re-reading the last reviewer's summary

I independently re-derived every claim in `h4-review.md`'s house-sheet section rather than accepting
it, and additionally checked several things neither prior report checked:

- **`.da-terminal` CSS** (`padding: 13px 22px`, `min-height: 48px`, `border-radius: 3px`, charcoal
  fill, paper text, `#1F1D1A` hover, `translateY(1px)` active): matches `SPEC.md:250-263`
  (`.act--terminal`) field for field. I grepped the sheet for the hover hex myself
  (`grep -n 1F1D1A docs/design/house-sheet/SPEC.md`) — it is the sheet's own literal, copied
  verbatim, not a new hex outside the sheet.
- **New finding, not in either prior report:** the sheet's `.act--terminal` base rule
  (`SPEC.md:250-258`) carries `letter-spacing: .06em`; H4's `.da-terminal` does not set
  `letter-spacing` at all. In practice this has **no visible effect** — every terminal label is
  rendered inside `.da-label`, and `.da-terminal .da-label` explicitly sets `letter-spacing: 0`
  (matching the sheet's own label override at `SPEC.md:270-277`/§F-C), and I confirmed by reading
  `scored-action.tsx` and both gate files that no other text renders as a direct child of `.da-act`
  outside `.da-label` on any of the three terminal call sites. A literal, cosmetically-inert
  divergence from the sheet's base rule. **P3, high confidence, no user-visible consequence.**
- **`border-radius: 3px` hardcoded rather than `var(--radius-box)`:** confirmed correct, the same way
  the first review found it — `--radius-box` does not exist anywhere in this branch's
  `globals.css` (`grep -n radius-box apps/client-portal/src/app/globals.css` on this worktree: no
  hits) because it is H2's token to add and H2 has not merged onto this lane's branch. This is the
  shared-file table's own designed consequence of parallel lanes (`Integration order: H2 → H4`), not
  a defect — I re-derived this myself rather than accepting the prior review's word for it.
- **Same gap, wider, and worth naming even though it is not this lane's to fix:** `--rail`,
  `--ink-faint`, `--ink-paper`, `--hairline-strong`, `--ink-subtle`, and the `.t-meta` class are all
  referenced by this diff's CSS and by `scored-action.tsx`'s hold caption, and **none of them exist
  in this branch's `globals.css`** — I grepped for each and got zero hits. On this branch alone (pre-
  H2-merge) a terminal act's unavailable/loading faces and the hold caption's type would render with
  unresolved custom properties and an undefined class. This is exactly what the shared-file table
  anticipates (H2 owns the token block; H2 → H4 is the stated integration order) and H4 is not at
  fault for it — I note it only because the sheet-fidelity checklist item is otherwise unverifiable
  in isolation, and a later reader should not mistake "renders correctly once H2 lands" for "renders
  correctly today." **Informational, not a numbered finding — no action for this lane.**
- **Tertiary rest rule:** `scaleX(0)` removed, rests at `--color-aged-oak` unconditionally (sheet's
  4.20:1 pigment), no `@media (hover:none)` variant, reduced-motion override of the same removed too.
  Re-verified by reading the CSS directly, not by re-reading the prior review's summary of it.
- **`--color-error`:** confirmed removed from `:root`, confirmed re-pointed
  (`.da-danger:hover { color: var(--color-error) }` deleted, no replacement declaration added because
  no rule in the diff still needs a hover color on `.da-danger` — I re-ran
  `grep -rn -- '--color-error' apps/client-portal/src` myself and got zero hits, a stronger check than
  the first review's "two non-consumer hits," because on the current (fixed) branch state there are
  now **zero** hits at all, consumer or not).
- **Unavailable block, all four legacy tiers plus terminal:** re-read the full CSS; matches the
  sheet's `SPEC.md:337-350` block plus a reasonable, harmless extension to `primary`/`danger` (not
  part of the sheet's three/four-tier system but otherwise unstyled once `disabled:opacity-50` left
  `BASE_CLASS`).
- **Focus:** `outline: 2px solid var(--color-clay-ink); outline-offset: 2px` alongside the untouched
  caret, `.da-terminal::before { color: var(--ink-paper) }` so the caret reads on the charcoal fill.
  Matches sheet `SPEC.md:290-304` exactly, including the terminal-specific caret color override at
  `:304`.
- **`.act` base rule's `white-space: nowrap`:** I checked whether the longer terminal labels
  ("Accept the finished work · $2,980.00") risk overflow/truncation on a narrow viewport given
  `nowrap` — this is the sheet's **own** base rule (`SPEC.md:186`), not something this lane added or
  could remove, and the sheet's own row-8 worked example uses the same length of label under the same
  rule. Not a finding against this lane.

## The loading fix (h4-1) — verified independently, not re-asserted

`invoice-sheet.tsx:773` region:
- `disabled={submitting}` → `aria-disabled={submitting || undefined}`. Confirmed no native `disabled`
  reaches this button (`grep -n disabled apps/client-portal/src/app/pay/\[token\]/invoice-sheet.tsx`
  shows only `:669`, `PaymentMethodChooser`'s own unrelated prop, outside the `:773` region, and two
  comment lines).
- Label swaps to `Opening payment` / `Letting {name} know` while `submitting`; class list gains
  `is-loading`; `aria-busy` sits on the wrapper `<div data-pay-print="hide">`, not the button — I read
  the JSX directly, this is the wrapper, not the control, exactly as the sheet's Loading section
  (`SPEC.md:365-370`) requires.
- CSS: `.da-terminal.is-loading` / `.da-terminal.is-loading:hover` declared with
  `background-color: var(--color-charcoal); color: var(--ink-paper); border: 0`, placed **after** the
  unavailable block in source order. I checked the specificity claim myself rather than trusting the
  fix report's arithmetic: `.da-terminal[aria-disabled='true']` is a class selector + attribute
  selector = (0,2,0); `.da-terminal.is-loading` is two class selectors = (0,2,0) — equal weight, so
  source order is the tiebreaker, and I confirmed by byte offset in the file that `.da-terminal.is-loading`
  appears after `.da-terminal[aria-disabled='true']:hover`. An act that is both `aria-disabled` (still
  unarmed, e.g. a slow click race) and `is-loading` therefore reads as working, which is the correct
  resolution — a payment that is mid-flight should never present as blocked.
- Regression test: `invoice-sheet.test.tsx`'s new case holds `fetch` open via a stashed resolver
  (`openCheckout`), clicks the act, asserts `Opening payment` / `is-loading` / `not.toBeDisabled()` /
  `aria-disabled="true"` / the wrapper's `aria-busy="true"`, then resolves and drains under `act()`.
  I ran this specific test in isolation to confirm it is not vacuous:
  `pnpm --dir .../agent-pp-h4 --filter @patina/client-portal test -- --testPathPattern='invoice-sheet.test.tsx' -t 'stays filled and says what it is doing'`
  — passes, and I additionally hand-verified it would fail against the pre-fix code by re-reading the
  removed `disabled={submitting}` / `opacity-70` version: that version had no `is-loading` class, no
  `Opening payment` label, and native `disabled` — the new assertions would not have held.

I ran the isolated case above and confirm it passed on the current worktree.

## PP-3 ruling — re-verified against the sheet's own worked language, not just the plan's paraphrase

Both gates' consequence sentences are composed only from data already read in the file (no new
fetch), drop the money clause cleanly when the amount is genuinely unknown (`wall-gate.tsx`'s
"Accepting records that this work is finished." fallback — I ran the corresponding test,
`'names no figure it has not been given'`, myself: green), and render in every state including
`aria-disabled="true"` (`wall-consequence` / `door-consequence` tests assert this directly; I read
the assertions, not just the test names). On acceptance/signing, the act **and** its consequence
sentence unmount together (`wall-gate.test.tsx`'s `'accepts, heals the hatching and stamps what was
released'` and `door-gate.test.tsx`'s `'takes the act and its sentence away once the paper is
signed'`, both re-read and both pass in my own run). The wall gate's in-flow order (consequence →
`SignatureLine` → hold caption → act) matches the sheet's own stated order for this exact row
(`SPEC.md:680`, row 8) exactly.

**Door gate's layout differs structurally** — its consequence sentence sits immediately above the
act on "the leaf," while the name field and checkboxes live in a separate DOM region above (the gate
proper), a pre-existing split the diff's own comment explains ("THE ACT SITS ON THE LEAF, NOT IN THE
GATE") and does not touch. The sheet's explicit "(consequence → name → hold caption → act)" ordering
language (`SPEC.md:710-711`, `:883-884`) appears in the context of the decision-moment specimen's
390px dock behavior, not a stated requirement for the door/proposal-signing surface, and the plan's
own step 9 for `door-gate.tsx` says only "with its own consequence sentence" — no ordering
requirement. I don't think this rises to a finding; noting it so a future reader doesn't need to
re-derive the same question.

## Other checklist items — independently re-checked, not re-asserted

- **`aria-disabled` not `disabled`, focusable, `aria-describedby` at the visible reason:** I traced
  `aria-describedby` on both gates myself rather than trusting the first review's summary.
  `wall-gate.tsx` passes `aria-describedby={hintId}` through to `HoldAction`, where it is joined with
  the internal `saidId` (the hold caption). `hintId` is the pre-existing "wall-hint" paragraph that
  already prints "Type your full name to accept." (and did before this diff) — so the sheet's B7
  requirement ("`aria-describedby` → B5's visible reason") is satisfied by pre-existing wiring, not
  new work, and the new `unmetReason`/`role="status"` mechanism this diff adds is a **distinct,
  additional** requirement (focus-move + live announcement on activation) that the sheet's
  `aria-disabled` rules section (`SPEC.md:333-336`) states separately. Both are present and correct;
  I initially suspected a gap here and traced it out fully before ruling it a non-issue.
- **44px / target size on the hand-built Pay button:** the Pay button's className omits the
  `BASE_CLASS` tailwind string entirely (it isn't a `ScoredAction`/`HoldAction`), but I confirmed
  `.da-act` carries a plain CSS rule (`position: relative; isolation: isolate; min-width: 44px;
  min-height: 44px`) that applies regardless of which utility classes ride alongside it, and
  `.da-terminal`'s own `min-height: 48px` clears the floor further. No gap.
- **44px targets generally:** unchanged base, terminal adds 48px — both clear the floor.
- **Hold caption visible:** re-read the component; the caption span carries no `sr-only` class,
  renders unconditionally, carries `data-testid` and `.t-meta`. Confirmed pointer-visible.
- **Terminal at exactly three sites:** reproduced the greps myself —
  `grep -rn 'variant="terminal"' apps/client-portal/src | grep -v __tests__` → `wall-gate.tsx:299`,
  `door-gate.tsx:867`; `grep -rln 'da-terminal' apps/client-portal/src | grep -v __tests__` →
  `globals.css`, `invoice-sheet.tsx`, `scored-action.tsx` (the last two being the definition sites,
  not additional call sites). Exactly three.
- **No `opacity: .5` anywhere in the diff:** `grep '^+' <diff> | grep -i opacity` → the two comment
  lines and one `opacity: 1` (the loading label). No `.5`/`50%` anywhere.
- **No pill/badge/dot/✓/spinner/`@keyframes`:** grepped the diff; only a comment mentioning "not a
  spinner." Nothing added.
- **No anchor id renamed:** grepped for removed `id="..."` lines in the diff; the only hit is the
  internal `saidId` span, which is new/instrument-scoped, not one of the protected page anchors.
- **Copy strings with tests:** `Accept the finished work · $X` covered with both the regex and an
  amount assertion; both consequence sentences asserted verbatim in both gates' tests; ran the
  specific assertions myself, not just the suite total.
- **Tests ship with the new file:** `scored-action.test.tsx` confirmed absent on `origin/main`
  (new file); read in full, covers the grammar named in the plan's Tests paragraph.
- **`mobile_dock` still works:** `hold-action.test.tsx`'s dock assertions pass in my own run (part of
  the 47/1126 total above).

## Money-precision inconsistency (h4-2) — re-confirmed, still correctly out of scope

`wall-gate.tsx` mixes `formatCurrency` (cents, in the new consequence sentence and label) with
`moneyInWords` (whole-dollar prose, in the pre-existing `SpineGate` caption and `Stamp`). Confirmed
both usages exist in the file today (`grep -n 'moneyInWords\|formatCurrency' wall-gate.tsx`). The
fix to unify them would touch `spine-gate.tsx` / `standing-sentence.tsx`, neither of which is in H4's
file list. Both prior reports flag this identically and correctly as an integration-lane call, not a
defect H4 could resolve within its own files. **P3, high confidence, unchanged from the first
review.**

## Comparison to the specimens

`client-house.html` row 8 (the wall gate): consequence sentence, signature line, visible hold
caption, filled charcoal terminal act with the amount in the label — matches what this diff builds,
region for region. `decision-moment.html`'s `.act--terminal .fill` (the left-to-right hold-ink sweep,
`inset:0; transform: scaleX(0) → scaleX(1) over 900ms`) is **not** duplicated by name in this diff,
but I traced the equivalent mechanism and confirmed it is functionally present: the pre-existing,
untouched `.da-hold .da-pool { clip-path: inset(0 calc(100% * (1 - var(--hold-fill,0))) 0 0);
transition: clip-path var(--hold-ms,900ms) linear }` rule already drives every `HoldAction`'s ink
sweep, and this diff's own `.da-terminal .da-pool { inset: 0; border-radius: 3px; background-color:
var(--ink-faint) }` extends that shared mechanism to the terminal tier's full face rather than the
smaller circular bead the other tiers use — the same visual outcome as the specimen's `.fill`,
reached by extending existing machinery instead of introducing a parallel one. I checked this because
neither prior report mentions the hold-fill visual at all; it holds up.

No divergence found between the built components and the specimens for the regions this lane owns.

## What I did not do

No dev server (Wave 2 integration's port), no Chromium/Playwright pass (sandbox-blocked, not this
lane's gate), no full 135-suite jest run (the lane-scoped 47-suite run is the gate this lane is held
to, and I re-ran it myself rather than trusting either prior report's number). I did not re-derive
the contrast math for `--ink-faint` on `--rail` a third time beyond spot-checking the first review's
5.32:1 figure was internally consistent — noting only, for the record, that the sheet's own inline
comment at `SPEC.md:43` claims "6.51:1" for that same pair, which does not match either reviewer's
computed 5.32:1; this is a discrepancy in the sheet's own comment, not in this lane's implementation
(the sheet is A1's file, not H4's, and not in scope for this re-review to resolve). I did not verify
Playwright's `toBeDisabled()`/`aria-disabled` behavior at `apps/client-portal/tests/threshold.spec.ts:390,664`
— correctly W2 integration's copy-table item per the plan, not this lane's gate.
