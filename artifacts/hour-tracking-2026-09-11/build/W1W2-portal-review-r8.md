# W1W2-portal — verification, round 8

**clean = true**

Verifier: read-only (no changes made). Branch `hour-tracking/portal` @ `dc817df55`
(matches `origin/hour-tracking/portal` — the fix's own claimed push), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`. One commit since r7's
`e17fa6475`: `dc817df55 fix(time): 44px targets on the three new acts`.

Scope: confirm r7's one major finding, **M7-01**, is discharged in current source, and
re-run the three gates the fix report names.

---

## 1 · M7-01 — confirmed discharged, read directly

All three acts r7 flagged now carry the lens words' `min-h-11 inline-flex items-center`
grammar in the current source (not just in the fix's diff description):

| Act | File : line | Class string (as read) |
|---|---|---|
| `pending_authorization` doorway `{billingLabel} →` | `hours-ledger.tsx:1662` | `"min-h-11 inline-flex items-center whitespace-nowrap rounded-[3px] border border-[var(--color-pearl)] px-1.5 t-head text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"` |
| `Set the studio rate →` | `hours-ledger.tsx:1754` | `"min-h-11 inline-flex items-center t-head text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"` |
| `Studio rates →` (pending band) | `pending-time-authorization-band.tsx:70` | `"min-h-11 inline-flex items-center t-head text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"` |

Each carries `min-h-11`, `inline-flex`, and `items-center` — the exact grammar the review's
*Exact fix* prescribed, matching the precedent at `hours-ledger.tsx:636`/`:1179`
(`da-score-hover min-h-11 inline-flex items-center t-head`). The doorway button also dropped
`py-[2px]` as the fix report states, since `min-h-11`+`items-center` now own the vertical box;
the pill shape (border, radius, padding-x) is otherwise unchanged.

**Pinned case confirmed present and correct.** `hours-ledger-scope.test.tsx:951-985` —
`describe('the 44px act grammar on the wave's three new doors (M7-01)')` — sets
`weekEntryOverride` to a `pending_authorization` / `rate_source: 'none'` shape, renders the
sheet, and asserts (via `await screen.findByRole(...)`, correctly async-safe against the
week's `useQuery`) that all three elements' `className` matches `/\bmin-h-11\b/`,
`/\binline-flex\b/`, and `/\bitems-center\b/`. This is the case that ran and passed below.

M7-01 is **discharged**: fixed exactly as prescribed, and pinned so a regression would fail
the suite.

---

## 2 · Gates — re-run by this verifier, verbatim

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal \
    --filter @patina/designer-portal type-check
> tsc --noEmit
(no output)                                                       EXIT=0  PASS

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal \
    --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx
PASS src/components/document/__tests__/hours-ledger-scope.test.tsx
  the Hours scope lens ................................ 24 passed
  the sheet's un-scoped remainder (M5-02) ............. 4 passed
  the 44px act grammar on the wave's three new doors (M7-01)
    ✓ gives the pending-authorization doorway, the studio-rate door and
      the band's door a 44px target (26 ms)
  what a chip and a failed note say (n3 · n1) ......... 2 passed
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total                                  EXIT=0  PASS

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal \
    --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                           EXIT=0  PASS (0 errors)
  — identical count to r7's baseline (and to the fix report's claim); the diff contributes
    zero new warnings.
```

All three match the fix report's own numbers exactly (type-check clean, 31/31 with the new
M7-01 case present and passing, lint 201/0/EXIT=0).

---

## 3 · Commit hygiene — clean

One commit, `dc817df55 fix(time): 44px targets on the three new acts`, `git show --stat`:
3 files, all under the branch's own scope —
`apps/designer-portal/src/components/document/hours-ledger.tsx`,
`apps/designer-portal/src/components/document/pending-time-authorization-band.tsx`,
`apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx` —
`+47/−4`. Conventional Commits (`fix(time):`), no `merge(…)`. `origin/hour-tracking/portal`
resolves to the same SHA as local `HEAD`, confirming the push the fix report claims.
`supabase/config.toml` untouched (still skip-worktree'd, per r7). No migration, no
`generate-legacy-grants.py`, no `db:generate` owed — nothing outside `apps/designer-portal`
changed.

---

## 4 · What this verification did NOT do (by brief scope)

Per the assignment, this pass checked only M7-01 and the three named gates. Everything r7
listed as open (n7-01 through n7-09, t1–t19) is unchanged and untouched by this one-finding
fix — the fix report says so explicitly and this verifier did not re-check any of it (no
`supabase db reset`, no e2e run, no browser walk, no prod/Strata touch, no PostHog check, no
re-litigation of the minor/note findings or the caveat on M7-01's severity call). Those
findings stand exactly as r7 recorded them, carried forward, not part of this clean=true
determination.

**clean = true** applies narrowly: M7-01 (r7's only blocking-for-clean item, its one MAJOR)
is discharged, and the three gates the review and fix both name are green.
