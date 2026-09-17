# Lane H1 fix round — response to `h1-review.md`

Worktree `.codex/worktrees/agent-pp-h1`, branch `portal-polish/h1`. Fix commit `aa0f82a26`
(`fix(client): address W2 review — h1`), on top of the implementation commit `b03a5b3fd` and the
report commit `f3dfee734`. Pushed to `origin/portal-polish/h1`.

## Findings — disposition

### H1-F1 — P1, high confidence — orphan `<hr>` when studio name is absent → **FIXED**
The `<hr>` and the `<div className="mt-6 pb-12">…</div>` wrapper around `<Colophon>` in
`threshold.tsx` are now gated on the same condition `<Colophon>` itself checks
(`studioName?.trim()`), so the whole block — rule and colophon together — either renders as one
atomic unit or renders nothing. Added two `threshold.test.tsx` cases: one asserting the colophon
text is present with the default (named-studio) mock, one overriding `identityMock` to
`{ name: null, source: 'studio' }` and asserting neither the colophon text nor any `<hr>` element
exists in the container.

### H1-F2 — P2, medium confidence — "Sign out" tier diverges from the specimen → **FIXED**
`mat.tsx`'s `ScoredAction` for `mat_sign_out` now uses `variant="tertiary"` (was `"secondary"`),
matching `client-house.html:1012`'s `act--tertiary` and putting it on the same tier as the adjacent
"Your details" act, which the specimen also shows as tertiary. This is a one-line prop-value change
inside H1's own file (`mat.tsx`), not a `.da-*`/Scored Ink CSS edit, so it stays inside H1's scope
rather than H4's `globals.css` block. No test pinned the old variant, so nothing needed updating
there.

### H1-F3 — P3, high confidence — the-note's three-part signature not wired at the production call site → **DECLINED (out of scope)**
The plan's Lane H1 file list restricts `threshold.tsx` to "mount `<Colophon>` after the mat — this
line only." The `<TheNote authorName={studioName} …>` call site is a different line
(`threshold.tsx:1085` after the H1-F1 fix; `:1076` before it) with no `studioName` prop, and wiring
it up is a second, unrelated edit to the same restricted file — outside what this lane is
authorized to touch. Declining to fix; flagging explicitly here (as the review already did) for W2
integration or a follow-up ticket: no lane in the plan's file tables currently owns this call site,
so `<TheNote>` in production keeps rendering the two-part `{studioName} · {date}` signature until
someone is assigned to pass a real author name and `studioName` there.

### H1-F4 — P3, high confidence — collateral `threshold.test.tsx:1311` edit outside the stated file list → **NO ACTION (as the review itself recommends)**
The review's own verdict says "No action needed given the disclosure and necessity." The one-line
regex update (`/leave the house/i` → `/sign out/i`) was an unavoidable, minimal consequence of the
sanctioned `mat.tsx` copy change, already disclosed in `h1-impl.md`. Declining further action.

### H1-F5 — P3, low confidence — `#mat-papers`'s presence made conditional → **FIXED (comment only)**
Added a note directly above the conditional in `mat.tsx` recording that `#mat-papers` is the
`/documents` middleware's load-bearing 308-redirect target, that every production caller today
always passes a truthy `onOpenPapers` (so the id always renders live), and that a future caller
omitting it would make the id disappear. No behavior change — this is the "worth a comment" fix the
review itself proposed; verified inert in the one real call site still holds
(`threshold.tsx` always passes `onOpenPapers={() => setPapersOpen(true)}`).

### H1-F6 — P3, medium confidence — pay-sheet colophon's computed type style shifts slightly → **NO ACTION (informational, as the review itself concludes)**
The review's own verdict rationale does not list this among the two findings requiring a fix, and
its finding text says "This looks like the intended normalization the whole program is for, not a
defect." No source or behavior change needed beyond what H1 already shipped; declining further
action.

## Files touched by this fix round

```
apps/client-portal/src/components/threshold/threshold.tsx           (gate the hr+colophon block)
apps/client-portal/src/components/threshold/mat.tsx                 (Sign out → tertiary; #mat-papers comment)
apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx  (2 new colophon cases)
```
All three are within Lane H1's stated file list from the plan. No other file was modified — a
`git status --porcelain` after the fix commit shows only these three under
`apps/client-portal/src/components/threshold`.

## Diff stat (fix commit only)

```
$ git show --stat aa0f82a26
 .../threshold/__tests__/threshold.test.tsx         |  21 +++++++++++++
 .../client-portal/src/components/threshold/mat.tsx |   8 ++++--
 .../src/components/threshold/threshold.tsx         |  19 ++++++++++--
 3 files changed, 41 insertions(+), 7 deletions(-)
```

(A stray `npx prettier --write` run on these three files was reverted with `git checkout --` before
committing — it reformatted quote style across the entire pre-existing file bodies, which is not
this lane's to touch; the prettier warning on commit is advisory-only per the pre-commit hook's own
output and does not gate this lane.)

## Gate — re-run after the fix, verbatim output

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

```
$ pnpm --dir .codex/worktrees/agent-pp-h1 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 41 passed, 41 total
Tests:       1028 passed, 1028 total
(1026 → 1028: the two new threshold.test.tsx cases from the H1-F1 fix)
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
Same two pre-existing findings the reviewer already confirmed are outside this diff
(`git diff --stat origin/main...HEAD -- approval-ask.tsx tracking-row.tsx` → empty, re-verified in
this fix round). 0 new lint errors.

## What was not done

- H1-F3's underlying gap (the-note's live signature is still two-part) is not fixed — see
  disposition above; it requires touching a `threshold.tsx` line outside this lane's authorized
  region.
- No markup rewrite of the mat to the specimen's `<dl>/<dt>/<dd>` shape (review Finding 8,
  informational-only, not asked for by the plan's H1 task and not in the reviewer's fix list).
- No change to `invoice-sheet.tsx` / `settling-sheet.tsx` beyond what H1 already shipped (Findings 6
  and 7 are informational-only per the review's own verdict).

## Push

```
$ git push origin portal-polish/h1
To github.com:Kodeman/PatinaBase.git
   f3dfee734..aa0f82a26  portal-polish/h1 -> portal-polish/h1
```
A pre-push hook additionally ran a whole-app `eslint .` (not this lane's scoped gate command) and
reported pre-existing errors/warnings elsewhere in `apps/client-portal` unrelated to this diff,
logged as "Affected verification has advisory failures" — advisory, and the push completed.
