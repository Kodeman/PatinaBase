# W1W2-portal — round-6 fix

Branch `hour-tracking/portal`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.
Input: one finding — **M6-01** (major/high on mechanism, medium on the severity call).

**Applied:** M6-01, in full, by the brief's first remedy (gate the figures, keep the paging).
Nothing in the finding was found wrong. No DB reset, no migration, no `supabase/` path touched,
no prod anything.

---

## 1 · M6-01 — the fifth un-scoped element

**Confirmed as written.** Re-measured in this worktree:

- the week read is `.eq('user_id', userData.user.id)` at `hours-ledger.tsx:207` (the finding's
  `:193` is the `useQuery` block; the filter is four lines into the builder), narrowed further by
  `lensProjectId` at `:214`;
- `todayMin` (`:362-364`) and `weekMin` (`:365-368`) reduce **that** array;
- the `<h2>` at `:529` and the `<p>` carrying the two figures at `:551` sat outside every
  `scope ===` guard — the r5 fix guarded four elements and this is the fifth.

So in `member` / `project` / `studio` the viewer's own week stood two lines above a caption and a
total naming someone else, and in the project scope — HT-9's own case — an owner who has logged
nothing on the house read `Week · 0 min` directly above `ScopeRollup`'s `this document · this
week · 12h 30m`. Two answers to one question on one screen, the top one wrong.

**Fix** — `apps/designer-portal/src/components/document/hours-ledger.tsx:551-572`:

| Element | Now | Why |
|---|---|---|
| `Today · …` and `Week · …` (`:558-565`) | `scope === 'mine' &&` | They are the **viewer's** week in every scope. Same guard, same reason, as r5's four. |
| `‹ earlier` / `later ›` (`:568-583`) | ungated | The paging governs the read's window in **every** scope (the ledger and rollup hooks take `weekStart`/`weekEnd` too), so gating it would break the studio and member scopes' own week walk. |

The second remedy the brief offered (caption the figures `yours · this week · …`) was not taken:
the sheet already answers "yours" under the `mine` chip, and a second, differently-scoped figure
on the same line is the shape HT-30 and the r5 finding both refuse. The paging button's `ml-3`
became conditional so the line does not open with a stray indent when the figures are gone.

The `null` scope (before the membership read settles) hides the figures for one tick, which is
how r5's four already behave — the guards are literally `scope === 'mine'`, not `scope !==
'studio'`.

A plain member is unaffected: HT-8 gives her no lens and the landing belt settles her on `'mine'`.

### 1.1 · Pinned

`src/components/document/__tests__/hours-ledger-scope.test.tsx`, one new case in the **M5-02**
describe block, as the finding directed:

- *keeps the viewer's own Today and Week figures out of a scope captioned with someone else's
  name (M6-01)* — opens on the member scope (`Maria Obi` current), asserts `Week ·` and
  `Today ·` are absent from the week line, clicks `mine`, asserts both return.

The figures are fragmented across text nodes, so the case reads the week line's `textContent`
through a small `weekLine()` helper anchored on the one thing that survives every scope — the
`‹ earlier` button. That anchor is itself the assertion that the paging was **not** gated.

**Non-vacuity measured, not assumed.** With the guard temporarily replaced by `{true && (` the
new case fails at the first assertion (`hours-ledger-scope.test.tsx:918`); the component was
restored from a byte copy and re-greped before the gates below were run.

---

## 2 · Gates — run in this worktree, verbatim results

```
pnpm --dir <wt> --filter @patina/designer-portal test \
    …/hours-ledger-scope.test.tsx                        EXIT=0  PASS  1 suite, 30 tests
pnpm --dir <wt> --filter @patina/designer-portal type-check  EXIT=0  PASS  (no output)
pnpm --dir <wt> --filter @patina/designer-portal lint        EXIT=0  PASS  201 problems,
                                                                           0 errors (unchanged
                                                                           from r5; no warning
                                                                           on either changed file)
pnpm --dir <wt> --filter @patina/designer-portal test (FULL) EXIT=1  574/575 suites,
                                                                     7300 tests passed, 0 failed
```

The one non-green line is infrastructural, not a test failure: `src/hooks/document-time-provider
.test.tsx` reported *"A jest worker process (pid=63572) was terminated by another process:
signal=SIGSEGV"* — the suite ran **no** assertions. Re-run alone it passes, 7 tests, 1.56 s. It
is r5's own n11 SIGSEGV recurring; the file is untouched by this diff. Counting it, the sweep is
**575 suites / 7307 tests**, which is r5's 7306 plus this round's one new case.

`@patina/supabase` was not re-typed or re-tested and `@patina/admin-portal` was not rebuilt: the
diff is two files, both under `apps/designer-portal/src/components/document`, and touches no
`packages/*` path, so §0.24's post-package-edit gate does not apply this round.

**Not run / not verified here:** no `supabase db reset`, no SQL test, no `psql` (this stage does
not own the DB); no e2e (port 3000 is contended and this stage was not named its owner —
`hours.spec.ts` asserts nothing on the week line, so it is unaffected by name); no browser walk,
no screenshots, no live-mode render; the admin/client/manufacturer gates; prod untouched.

---

## 3 · Carried forward — unchanged from r5

M5-01 (the `15-hours.md` copy + Sanity push, scoped out to Kody after the ship) and the recorded
later-wave items **t2–t5** plus the review's other open minors are untouched by this round.

---

## 4 · Commit

```
fix(time): the week's own figures belong to the week's own scope
```

Two files, explicit pathspecs. `apps/designer-portal/next-env.d.ts` is dirty in this worktree
from an earlier Next build (`./.next/types/…` → `./.next/dev/types/…`); it is pre-existing, was
dirty before this round, and was **not** staged. No `supabase/` path, no `.env`, no `artifacts/`
tree in the commit; `supabase/config.toml` remains skip-worktree'd and unstaged.
