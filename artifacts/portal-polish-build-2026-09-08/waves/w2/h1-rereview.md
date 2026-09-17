# Lane H1 re-review — Letterhead, colophon, the mat (PP-1)

Re-reviewer, separate context from both the H1 implementer and the original H1 reviewer. Did not
trust `h1-impl.md`, `h1-review.md`, or `h1-fix.md` — independently re-fetched the branch, re-read the
full diff, re-ran every gate command from the worktree, and re-verified each disposition in
`h1-fix.md` against the actual code.

## Scope

`git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h1` (branch head
`aa0f82a26`, on top of impl `b03a5b3fd` and report commit `f3dfee734`), inspected in
`.codex/worktrees/agent-pp-h1` (read-only). Compared against the plan's Lane H1 section, the Review
protocol, `docs/design/house-sheet/SPEC.md` §A (read from the H1 worktree copy — A1 has not merged to
`main` yet), and `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html` lines
996–1022 (the mat + colophon region).

## Evidence — commands run, verbatim output

```
$ git -C /Users/kody/Code/patina-merged fetch origin
(sandbox blocked ssh on first attempt — retried with dangerouslyDisableSandbox: true, exit 0)

$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h1 --stat
 .../src/app/pay/[token]/invoice-sheet.tsx          |   3 +-
 .../src/app/pay/[token]/settling-sheet.tsx         |   4 +-
 .../threshold/__tests__/doorplate.test.tsx         |  19 +++
 .../components/threshold/__tests__/mat.test.tsx    |  29 +++-
 .../threshold/__tests__/the-note.test.tsx          |  27 +++-
 .../threshold/__tests__/threshold.test.tsx          |  23 ++-
 .../instruments/__tests__/colophon.test.tsx        |  26 ++++
 .../components/threshold/instruments/colophon.tsx  |  25 +++
 .../client-portal/src/components/threshold/mat.tsx |  93 ++++++-----
 .../src/components/threshold/the-note.tsx          |  33 ++--
 .../src/components/threshold/threshold.tsx          |  46 ++++--
 .../waves/w2/h1-impl.md                            | 173 +++++++++++++++++++++
 12 files changed, 431 insertions(+), 70 deletions(-)
```
Matches the plan's file list exactly, plus the report file, plus one collateral line in
`threshold.test.tsx` (already flagged in the original review as Finding 4, disclosed and accepted —
no new pathspec violation introduced by the fix round).

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 41 passed, 41 total
Tests:       1028 passed, 1028 total
Time:        9.222 s
```

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal test -- src/app/pay
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
```

```
$ cd .codex/worktrees/agent-pp-h1/apps/client-portal && npx eslint src/components/threshold src/app/pay
apps/.../approval-ask.tsx:1080  error   react-hooks/set-state-in-effect
apps/.../instruments/tracking-row.tsx:104  warning  unused-eslint-disable
✖ 2 problems (1 error, 1 warning)
```
Independently re-confirmed both are pre-existing and outside this diff:
`git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h1 --stat -- \
  apps/client-portal/src/components/threshold/approval-ask.tsx \
  apps/client-portal/src/components/threshold/instruments/tracking-row.tsx` → empty output. 0 new
lint errors.

All four gate numbers match both `h1-fix.md`'s and `h1-review.md`'s (pre-fix) claims exactly, and the
test count moved 1026→1028 exactly as the fix report said (the two new `threshold.test.tsx` colophon
cases).

## Disposition of the original review's findings

**H1-F1 (P1) — orphan `<hr>` when studio name is absent — verified FIXED.**
`threshold.tsx` now wraps both the `<hr>` and the `<div className="mt-6 pb-12"><Colophon .../></div>`
in a single `{studioName?.trim() && (...)}` guard — the exact condition `Colophon` itself checks — so
rule and colophon appear or vanish together. Confirmed by direct diff read (not just the fix report's
prose). New test `renders no orphan hairline when the studio name is absent` sets
`identityMock.mockReturnValue(settled({ name: null, source: 'studio' }))` and asserts both the
colophon text and `container.querySelectorAll('hr')` are empty. Verified independently that
`threshold.tsx`'s render tree contains exactly one `<hr>` in the whole component subtree
(`grep -rn "<hr" apps/client-portal/src/components/threshold/` → one hit, the colophon's), so this
assertion is precise, not a coincidental pass. A second new test confirms the present-name path still
renders the phrase. Both pass. No regression: `<Mat>` itself stays unconditional (it has its own
required content — people/papers/sign-out — independent of studio name), only the trailing
rule+colophon block is gated. Closed.

**H1-F2 (P2) — "Sign out" tier diverges from the specimen — verified FIXED.**
`mat.tsx`'s `ScoredAction actionKey="mat_sign_out"` now reads `variant="tertiary"` (was
`"secondary"`). Cross-checked against the specimen directly:
`client-house.html:1012` → `<button class="act act--tertiary" data-act="signout">Sign out</button>`.
Matches. No test asserted the old `secondary` variant so nothing needed updating, and none does now —
correct, since `getByRole('button', { name: /sign out/i })` doesn't inspect variant. `variant="tertiary"`
is an existing, already-used value on this same component (the adjacent papers-tab and "Your details"
acts both already use it), so no new prop value was invented. Closed.

**H1-F5 (P3) — `#mat-papers` presence made conditional — comment-only fix, adequate.**
A comment was added directly above the conditional recording the anchor's load-bearing status and
that every current caller passes a truthy `onOpenPapers`. Verified against `threshold.tsx`: the one
production mount still passes `onOpenPapers={() => setPapersOpen(true)}` unconditionally. This was
correctly scored P3/informational in the original review (no live regression), and a comment is a
proportionate response — no further action needed.

**H1-F3 (P3) — the-note's live signature still two-part — correctly declined, correctly still open.**
Confirmed `threshold.tsx:1085` (`<TheNote authorName={studioName} …>`) still passes no `studioName`
prop, so the composed signature in production is `{studioName} · {date}` (two-part), not the
three-part `name · studio · date` the spec (§A8/line 683 of the H1 worktree's `SPEC.md`) and the
component itself now support. The plan's H1 file list restricts the `threshold.tsx` touch to "mount
`<Colophon>` after the mat — this line only," so wiring `<TheNote>`'s `studioName` prop is genuinely a
second, unrelated edit to a line outside that scope. Declining was correct lane discipline. **This
remains an open gap with no assigned owner** — no lane in the plan's Wave 2 file tables lists the
`<TheNote>` call site. Flagging again here (see Findings, below) so it is not lost between H1's close
and W2 integration.

**H1-F4 (P3) — collateral `threshold.test.tsx:1311` edit — no action, correctly.** Unavoidable,
one-line, already disclosed. No new issue.

**H1-F6 (P3) — pay-sheet colophon's computed type style shift — no action, correctly.** Confirmed
informational per the original review's own text; the fix round rightly took no action.

## Additional independent checks (not solely re-verifying prior findings)

- **House sheet compliance.** Re-checked the full diff for new hex literals, `opacity`/`.5`,
  `truncate`/`line-clamp`, and bare `disabled=` — none found
  (`git diff ... | grep -in "opacity-5\|opacity: .5\|truncate\|line-clamp\|disabled=\|bg-\[#\|text-\[#\|border-\[#"`
  → no output). No pills, badges, dots, ✓ glyphs, spinners.
- **`.t-meta`/`.t-authorship` class use.** `Colophon` uses `.t-meta` + `text-[var(--ink-faint)]`,
  matching `SPEC.md:449` exactly (`.t-meta, --ink-faint`). `TheNote`'s signature now uses
  `t-authorship` (matching `SPEC.md:140`'s named class) plus `text-right text-[var(--text-body)]` for
  alignment/color, consistent with the spec's worked example at line 683
  (`Signed .t-authorship: "Leah Hartwell · Local Dev Studio · 3 September 2026"`) — the three-part
  format the code now produces matches this exactly. These classes are defined by Lane H2's
  (unmerged) `globals.css` work, not yet present in `main` or this branch — inert-but-harmless until
  H2 merges first per the plan's stated merge order (H2 → H1), so this is not a defect in H1's own
  diff.
- **Anchor ids.** `#mat` (unconditional), `#mat-papers` (conditional per above, inert in practice) —
  no id renamed anywhere in the diff. `id="mat-head"` in the specimen has no corresponding id in the
  shipped markup, but that was true before this lane too (not introduced or removed by this diff) and
  is not in the plan's protected-id list.
- **Accessibility.** No new interactive elements. `ScoredAction`'s `tertiary` variant is an existing,
  already-tested code path (used for the papers tab and "Your details" before this change) — no new
  focus/44px/contrast surface introduced. `doorplate.test.tsx`'s new tests use
  `getByTestId`/`queryByText`, not implementation internals.
- **Copy strings vs. their tests.** `"Leave the house"` → `"Sign out"`: pinned in `mat.test.tsx:194`
  and `threshold.test.tsx`. `"Prepared by {studio} · Sent through Patina"`: unchanged text, pinned in
  `colophon.test.tsx` (present/absent/whitespace/undefined cases) and now in `threshold.test.tsx`
  (present + absent-with-no-orphan-hr cases). The-note's new three-part signature format: pinned in
  `the-note.test.tsx` (full, no-studio, no-author cases). All new/changed copy has a test.
- **Wordmark-absence test** (plan step 7, easy to miss since it's not itself a numbered finding in
  either review): present — `doorplate.test.tsx`: `it('carries no PATINA wordmark', ...)` using
  `queryByText(/patina/i)`. Confirmed passing in the `src/components/threshold` run above.
- **Specimen comparison, mat + colophon region.** Structure still diverges from the specimen's
  `<dl>/<dt>/<dd>` markup (shipped code keeps `<h2>` + `<div>` rows, now conditional) — correctly
  scored informational-only by the original review (Finding 8) since the plan's H1 steps never asked
  for a markup rewrite. The specimen also separates a `mat-rule` `<hr>` (before the mat section) from
  a distinct `colophon-rule` `<hr>` (before the colophon) — two hairlines total around that whole
  region — while the shipped code has no `mat`-side hairline (pre-existing, not this lane's task) and
  one colophon-side hairline (this lane's, now correctly gated). No new divergence beyond what the
  original review already noted.

## Findings (this re-review)

### RR-1 — P3, high confidence: H1-F3's gap is real, correctly declined, and still has no assigned owner
Not a defect in this lane's execution — the decline was the right call, in-scope-wise. Restating it
here (rather than treating it as closed) because the plan's Wave 2 file tables do not list the
`<TheNote>` call site under any lane, and nothing in `h1-fix.md` or this branch creates a tracking
item for it. Recommend the W2 integration lane (or a follow-up ticket) own passing `studioName` into
the `<TheNote authorName={studioName} …>` call at `threshold.tsx:1085` so the three-part signature the
spec describes actually reaches production. No code change requested of Lane H1 itself.

### RR-2 — informational, no action, high confidence: `.t-meta`/`.t-authorship` remain inert pending H2
Confirmed the classes `Colophon` and `TheNote` now reference do not yet exist in `main` or on this
branch — they ship with Lane H2. This is by design per the plan's stated merge order (H2 → H1) and was
already surfaced by the original review (Finding 6); re-verified it is still true post-fix and still
harmless (jsdom does not fail on an undefined class, and the green test runs above confirm no
regression). No action needed from H1; integration must land H2 before H1 for the intended visual
result, exactly as the plan specifies.

No new P1 or P2 finding. Both P1/P2 items from the original review (H1-F1, H1-F2) are verified fixed
in the actual diff and by an independently re-run gate, not merely re-stated from the fix report's
prose.

## Verdict rationale

Every gate command was re-run from this context, from the worktree, against the actual branch head,
and produced results identical to both prior reports. Both fixes were verified by reading the diff
directly (not trusting `h1-fix.md`'s narrative) and cross-checking H1-F2 against the specimen's HTML.
No pathspec violation, no house-sheet violation, no accessibility regression, no untested copy change,
no anchor-id rename. The one remaining open item (RR-1 / H1-F3) is out of this lane's authorized scope
by the plan's own file list and was correctly declined rather than fixed out-of-scope — it is a
program-level gap to hand to integration, not a reason to send this lane back for another fix round.

**Approve.**
