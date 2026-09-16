# W1W2-portal — round-7 fix

Branch `hour-tracking/portal` @ `dc817df55` (was `e17fa6475`), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`. One commit,
addressing the review's one major finding.

## M7-01 — 44px targets on the three new acts

**Finding.** Three acts this wave introduced landed 16–22px tall against house
sheet §A5's 44px floor: the `pending_authorization` doorway button
(`hours-ledger.tsx`), the `Set the studio rate →` Link (`hours-ledger.tsx`),
and the pending band's `Studio rates →` Link (`pending-time-authorization-band.tsx`).
None carried `.da-act`'s grammar or the lens words' `min-h-11 inline-flex
items-center` idiom.

**Fix applied** — exactly as the review's *Exact fix* prescribed: added
`min-h-11 inline-flex items-center` to all three, matching the precedent at
`hours-ledger.tsx:636` and `:1179` (`da-score-hover min-h-11 inline-flex
items-center t-head`).

- `apps/designer-portal/src/components/document/hours-ledger.tsx`
  - doorway button (`EntryRow`, was `:1662`): `className="min-h-11 inline-flex
    items-center whitespace-nowrap rounded-[3px] border
    border-[var(--color-pearl)] px-1.5 t-head text-[var(--color-aged-oak)]
    hover:text-[var(--color-charcoal)]"` — dropped `py-[2px]` since `min-h-11`
    +`items-center` now own the vertical box; the pill shape (border, radius,
    padding-x) is unchanged.
  - `Set the studio rate →` Link (was `:1753`): `min-h-11 inline-flex
    items-center` prepended, link text/decoration unchanged.
- `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx`
  - `Studio rates →` Link (was `:69`): same `min-h-11 inline-flex
    items-center` prepended.

**Pinned.** Added one case to `hours-ledger-scope.test.tsx` —
*"the 44px act grammar on the wave's three new doors (M7-01)"* — that:
1. Introduces `weekEntryOverride` (a new module-level override, reset in
   `beforeEach`, mirroring the existing `ledgerRows`/`rollupRows` pattern) so
   a single case can put `WEEK_ENTRY` into a rate-pending, pending-authorization
   shape (`billing_state: 'pending_authorization'`, `hourly_rate_cents: null`,
   `rate_source: 'none'`) without disturbing every other case that relies on
   the default `WEEK_ENTRY`.
2. Renders the sheet (default `viewerRole: 'owner'`, scope `'mine'`) and
   `findByRole`s all three acts, asserting `min-h-11`, `inline-flex`, and
   `items-center` each appear in `className`.

First attempt used synchronous `getByRole` right after `render()` and failed
— the week's entries come from an async `useQuery`, so the row (and the
doorway/link inside it) isn't in the DOM on the first paint. Switched to
`await screen.findByRole(...)`, which waits for the query to resolve; all
three assertions then passed. This is now `31/31` in the spec (was 30/30 —
one new case), not `32`: the earlier review's count already included the
suite's whole file, so the delta here is `+1`.

## Gates re-run (this fix, this worktree)

```
$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> tsc --noEmit
(no output)                                                       EXIT=0  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx
PASS src/components/document/__tests__/hours-ledger-scope.test.tsx
  ...
  the 44px act grammar on the wave's three new doors (M7-01)
    ✓ gives the pending-authorization doorway, the studio-rate door and the band's door a 44px target (25 ms)
  ...
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total                                  EXIT=0  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                           EXIT=0  PASS (0 errors)
  — identical count to r7's baseline; the diff contributes zero new warnings.
```

## Commit hygiene

One commit, `fix(time): 44px targets on the three new acts`
(`dc817df55`), three files staged by explicit pathspec:
- `apps/designer-portal/src/components/document/hours-ledger.tsx`
- `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx`
- `apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx`

The pre-existing dirty `apps/designer-portal/next-env.d.ts` (present before
this fix, noted in r7's own hygiene check) was left unstaged and uncommitted,
as before. No migration, no `generate-legacy-grants.py`, no `db:generate` —
nothing outside `apps/designer-portal` changed. `supabase/config.toml` was
not touched. The DB was not reset.

Pushed: `e17fa6475..dc817df55 hour-tracking/portal -> hour-tracking/portal`.
The repo's commit-time hook ran a full unfiltered `pnpm test`/`lint`/
`type-check` sweep across every app/service as part of `git push`
(admin-portal jest failures on an unrelated `media-uploader.test.tsx`
jsdom `arrayBuffer` gap; client-portal lint errors on unrelated hooks) —
none of these touch a file this fix changed, the hook logged them as
"advisory failures" and did not block the push, and none are addressed
here (out of this fix's scope; the review's named gates are all designer-
portal-scoped and all pass clean).

## What was NOT re-verified

Everything the r7 review already listed as unverified stands unverified here
too (no `supabase db reset`, no e2e run, no browser walk, no prod/Strata
touch, no PostHog check) — this fix touched only the three class strings and
one new jest case, and re-ran only the three gates the finding named.
