# Lane H1 review — Letterhead, colophon, the mat (PP-1)

Reviewer context: separate from the H1 implementer. Reviewed `origin/portal-polish/h1` against
`origin/main` (head `1059f5275`), the plan's Lane H1 section, `docs/design/house-sheet/SPEC.md` §A,
and `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`. I do not trust the
implementer's report (`h1-impl.md`) and independently re-ran every gate command.

## Evidence — commands run, verbatim results

```
$ git -C /Users/kody/Code/patina-merged fetch origin && \
  git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h1 --stat
 .../src/app/pay/[token]/invoice-sheet.tsx          |   3 +-
 .../src/app/pay/[token]/settling-sheet.tsx         |   4 +-
 .../threshold/__tests__/doorplate.test.tsx         |  19 +++
 .../components/threshold/__tests__/mat.test.tsx    |  29 +++-
 .../threshold/__tests__/the-note.test.tsx          |  27 +++-
 .../threshold/__tests__/threshold.test.tsx         |   2 +-
 .../instruments/__tests__/colophon.test.tsx        |  26 ++++
 .../components/threshold/instruments/colophon.tsx  |  25 +++
 .../client-portal/src/components/threshold/mat.tsx |  87 ++++++-----
 .../src/components/threshold/the-note.tsx          |  33 ++--
 .../src/components/threshold/threshold.tsx         |  37 +++--
 .../waves/w2/h1-impl.md                            | 173 +++++++++++++++++++++
 12 files changed, 396 insertions(+), 69 deletions(-)
```
Matches the plan's file list plus the report file plus one undisclosed-in-the-file-list collateral
line in `threshold.test.tsx` (disclosed in the report's prose — see Finding 4).

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 41 passed, 41 total
Tests:       1026 passed, 1026 total
```

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal test -- src/app/pay
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
```

```
$ cd apps/client-portal && npx eslint src/components/threshold src/app/pay
apps/.../approval-ask.tsx:1080  error   react-hooks/set-state-in-effect
apps/.../instruments/tracking-row.tsx:104  warning  unused-eslint-disable
✖ 2 problems (1 error, 1 warning)
```
Confirmed both findings are pre-existing and outside this diff:
`git diff --stat origin/main...HEAD -- approval-ask.tsx tracking-row.tsx` → empty. 0 new lint errors.

All four numbers match the implementer's report exactly — no discrepancy in the claimed gate results.

## Pathspec discipline

Matches the plan's file list (`instruments/colophon.tsx` + test, `mat.tsx` + test, `doorplate.test.tsx`,
`the-note.tsx` + test, `threshold.tsx`, `invoice-sheet.tsx`, `settling-sheet.tsx`) with one disclosed
deviation — see Finding 4. `doorplate.tsx` itself is untouched (confirmed: only its test file appears
in the diff). No route changed. No anchor id renamed (`#mat-papers` is retained; see Finding 5 for a
conditional-absence nuance that does not amount to a rename in the one production call site).

## Findings

### Finding 1 — P1, high confidence: an orphan hairline when the studio name is unresolved
`threshold.tsx`'s new mount is:
```tsx
<hr className="border-[var(--border-subtle)]" />
<div className="mt-6 pb-12">
  <Colophon studioName={studioName} />
</div>
```
`<Colophon>` correctly renders `null` when `studioName` is falsy (tested, verified). But the `<hr>`
above it is **unconditional** — it has no guard on `studioName`. `studioName = words(identityQuery.data
?.name)` (`threshold.tsx:694`), and `useStudioIdentity`'s own doc comment states the contract
explicitly: *"IMPORTANT CONTRACT: `name` can be NULL (a non-designer UUID, or nothing resolvable).
Consumers apply their own fallback."* (`packages/supabase/src/hooks/use-studio-identity.ts:20-21`).
This is not merely a transient loading flash — it is a documented, permanent null case for real rows.

Further, `identityQuery` (`useStudioIdentity`) is **not** part of the page's `loading` gate
(`threshold.tsx:717-731`, the `loading = projectApprovalsLoading || proposalsQuery.isPending || ...`
disjunction has no `identityQuery` term), so the mat+colophon block can render — with `studioName` still
`null` because the identity RPC hasn't resolved yet — even when every other query has settled. This
reproduces on both render branches that mount `mat` (`GroundFloor`'s `mat` prop, and the plain `{mat}`
mount in the full-house branch — both sit behind the same top-level `if (!hydrated || loading ||
model.pending)` gate, neither branch adds its own studioName guard).

Net effect: a real, reachable client-facing page state renders a bare `<hr>` with nothing under it —
directly contradicting the global constraint **"Absence is silence... never guess, never print... a
region with nothing to say renders nothing"** and the plan's own instruction that Colophon "Renders
**nothing** when `studioName` is absent" (the instruction is about the whole colophon block on the page,
not just the component in isolation).

**No test exercises this mount at all** — `threshold.test.tsx` has zero assertions about the colophon
(`grep -i colophon` returns nothing), so neither the happy path nor the absent-name path is covered at
the integration level; only the isolated `Colophon` component (with no surrounding `<hr>`) is tested.

Fix: gate the `<hr>` on the same condition Colophon checks (e.g. `{studioName?.trim() && (<>…</>)}`), or
move the rule inside `Colophon` itself, and add a `threshold.tsx` test for the absent-studio-name case.

### Finding 2 — P2, medium confidence: "Sign out" diverges from the visual target's tier
The specimen (`client-house.html:1012`) draws the mat's exit act as `<button class="act
act--tertiary">Sign out</button>` — tertiary, the single scored word. The shipped `mat.tsx` keeps `Sign
out` on `variant="secondary"` (the two-score word) — unchanged from the pre-existing `"Leave the
house"` variant, since H1's task only asked for the label text to change. The specimen shows the same
demotion for the adjacent "Your details" act, which stays `variant="tertiary"` in the code — consistent
with the target there, but "Sign out"'s tier was not revisited.

Ownership is genuinely ambiguous from the plan text: H4 owns the `.da-*`/Scored Ink block in
`globals.css` (the CSS definitions of each tier), but `mat.tsx`'s `variant="secondary"` prop value on
this specific `ScoredAction` call is squarely inside H1's own file, and the plan's H1 review checklist
never asks for a tier change. Flagging because I was asked to compare the result against the specimen
region and report the divergence regardless of blame; the report does not mention this as a known gap
or an "owed" item, so it risks going unaddressed unless a later lane (H4 or W2 integration) is told to
reconcile it.

### Finding 3 — P3, high confidence: the-note's three-part signature is untested-in-production (correctly disclosed as owed)
`the-note.tsx`'s `signatureOf()` correctly composes `name · studio · date` and is well tested at the
component level (three-part, two-part-no-studio, and no-author-no-signature cases all pass). But the
only production call site, `threshold.tsx:1076` (`<TheNote authorName={studioName} …>`), is outside
H1's file-list scope (limited to "mount `<Colophon>` — this line only") and was correctly left
untouched. The live app therefore still renders a **two-part** signature (`{studioName} · {date}`, since
`authorName` is bound to the studio's own name, not a person's, and no `studioName` prop is passed at
all) — the spec's "full name · studio · date" is not actually reachable end-to-end yet. This is
transparently flagged as "owed" in the implementer's report, so I am not scoring it against the lane's
execution, but noting it here so the next lane that touches this call site (unclear which one owns it —
no lane in the plan's file tables lists the `<TheNote>` invocation) picks it up rather than it silently
falling through the cracks between lanes.

### Finding 4 — P3, high confidence: one line changed outside the lane's stated file list
`threshold.test.tsx:1311` (`/leave the house/i` → `/sign out/i`) is not in the plan's H1 file list, and
the plan's global constraint says "Touch ONLY the files your lane lists." This is disclosed candidly in
the report as an unavoidable, minimal, one-line consequence of the sanctioned `mat.tsx` rename (the test
would otherwise fail on this branch). I agree it was unavoidable and low-risk, but per the review brief
I'm reporting every finding regardless of severity — this is a literal pathspec-discipline deviation,
even though a defensible one.

### Finding 5 — P3, low confidence (verified inert in the one real call site): `#mat-papers`'s id becomes conditional
`mat.tsx` now wraps the `#mat-papers` div in `{(papers.length > 0 || onOpenPapers) && (...)}`. The
load-bearing anchor id list in the plan explicitly names `#mat-papers` (the `/documents` middleware
308-redirect target, per `retired-routes.ts:65`). This is not a *rename*, but it does make the id's
*presence* conditional where before it was unconditional. Verified this is inert in the one production
call site: `threshold.tsx:1012` always passes `onOpenPapers={() => setPapersOpen(true)}` (a truthy
function), so the `#mat-papers` div always renders live. The only place the id can actually vanish is a
test that renders `<Mat>` directly with `onOpenPapers: undefined` — which is exactly the new test added
in this diff (`mat.test.tsx`: "drops a column heading whose column has no rows"). No live regression,
but worth a note in case a future caller ever renders `<Mat>` without `onOpenPapers`.

### Finding 6 — informational / no action, medium confidence: Colophon's visual style shifts slightly on the pay sheets
The pay-link footers' inline phrase moves from ad-hoc Tailwind (`font-mono text-[11.5px]
tracking-[0.03em] text-[var(--color-quiet-ink)]`, inherited from the parent `<footer>`) to `.t-meta`
(12px / `.08em` tracking, once H2's class lands) plus `text-[var(--ink-faint)]` (an alias of
`--color-quiet-ink` per H2's plan, so the color is unchanged). The **text content** is byte-identical as
claimed, but the **computed type style** shifts slightly (11.5px→12px, 0.03em→0.08em tracking) as a side
effect of adopting the house-sheet class. This looks like the intended normalization the whole program
is for, not a defect — flagging only because the report's "only the source moves" framing undersells
that a visible (if subtle) style change accompanies the source move.

### Finding 7 — informational / no action, high confidence: `<p>` in place of `<span>` for the colophon
`invoice-sheet.tsx`/`settling-sheet.tsx` swap a `<span>` for a `<p className="t-meta …">` as the first
child of a `flex flex-col` footer. Verified `@tailwind base` is present in `globals.css`, so Preflight
zeroes `<p>` margins; the flex column also blockifies both tags identically as flex items. No visible
regression — confirmed by the green `src/app/pay` suite, which asserts against the rendered footer.

### Finding 8 — informational, high confidence: mat DOM shape still diverges structurally from the specimen
The specimen's mat (`client-house.html:990-1013`) is a `<dl>`/`<dt>`/`<dd>` structure; the shipped
`mat.tsx` keeps its pre-existing `<h2>` heading + `<div>` row shape (just made conditional). The plan's
H1 task never asked for a markup rewrite (only text rename + conditional heading), so this is not scored
as a defect — noted only because I was asked to say where the result diverges from the specimen region.

## Accessibility

No new interactive elements were introduced by this lane (the reused `ScoredAction` calls for "Your
details" and "Sign out" are unchanged in structure/props apart from the label text and, in the case of
Sign out, no props at all changed). No `aria-disabled`/`disabled`/44px/contrast concerns arise from this
diff specifically. The two new tests in `doorplate.test.tsx` correctly probe accessible text via
`getByTestId`/`queryByText` rather than internals.

## House sheet compliance

No new hex literals. No shadows, pills, badges, dots, ✓ glyphs, spinners, or `opacity: .5` introduced.
No truncation. `.t-meta`/`.t-authorship`/`--ink-faint` references in `colophon.tsx`/`the-note.tsx` are
correctly inert-but-harmless ahead of H2's merge (per the stated integration order H2 → H1), and jsdom
does not fail on undefined CSS classes, so the green test runs do not mask a real problem here.

## Copy strings pinned by tests

- `Leave the house` → `Sign out`: updated in `mat.tsx`, `mat.test.tsx:194`, and (collaterally)
  `threshold.test.tsx:1311`. ✅
- `Prepared by {studio} · Sent through Patina`: unchanged text, extracted into `<Colophon>`, used in
  three places (mat mount, invoice-sheet, settling-sheet). ✅
- `prepared for`: `doorplate.tsx` untouched; new absent-name assertion added. ✅
- `Ask for a change`: new test pins exactly-once. ✅

## Verdict rationale

Finding 1 (P1) is a real, reachable, currently-untested defect on a client-facing surface that directly
violates the plan's own "Absence is silence" global constraint — it needs a fix (guard the `<hr>` on
`studioName`, add a `threshold.tsx` test for the absent case) before this lane should be considered done.
Finding 2 (P2) is a genuine visual-target divergence on the exact act this lane rebuilds and is not
flagged anywhere in the lane's own report, so it should at minimum be explicitly assigned to a lane
(H4 or integration) rather than silently dropped.
