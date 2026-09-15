# W1W2-portal — fix round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, branch `hour-tracking/portal`.
Two findings in. **One applied (M4-02), one skipped as orchestrator-scope work with the measurement re-confirmed (M4-01).**

---

## M4-01 — the onboarding article + the Sanity push — SKIPPED, and the finding's own routing is why

The finding assigns the fix to the orchestrator ("Orchestrator, not the lane"), and the lane re-measured the premise a fourth time rather than take it on trust. All three measurements agree with round 3:

```
$ ls artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/
"…/wave-1/": No such file or directory (os error 2)

$ git ls-files -- '*15-hours.md*'
(no output)

$ git log --all --oneline -- 'artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md'
(no output)

$ ls -la /Users/kody/Code/patina-merged/artifacts/…/wave-1/15-hours.md
.rw-r--r--@ 1.4k kody 3 Sep 13:04   ← exists ONLY in the main checkout, untracked
```

So the file is untracked on every ref and reachable only from the main checkout. The three standing reasons hold unchanged: copying an untracked tree between checkouts is exactly the git-hygiene landmine the program bans; running git in the main checkout is forbidden this phase; and a Sanity write is an external mutation nobody has authorised as part of W2.

**Owed to the orchestrator, unchanged from round 3 and restated here:** either track that file (or name its real home) so a lane can edit it, or scope the article + the Sanity push out of W2 the way HT-35 was scoped out — then authorise the Sanity write as its own act. When that happens, line 15 must be **rewritten, not confirmed**: "a designer or the studio's first hire can see … where the week actually went" is now false in shipped behaviour — HT-8 gives a plain member no scope lens at all, and 00606 narrows her per-row read to her own rows (she keeps a project total through `project_hours_total`, not a week view).

Nothing in the worktree changed for this finding.

## M4-02 — three new reads become three hooks — APPLIED

The finding is correct and was applied as written: the phase's hard rule ("new reads become hooks, not raw PostgREST in components") and the round-4 brief's own review question ("every new read is a hook") both bind, and the file-idiom argument that got this graded a note in rounds 2 and 3 does not survive them. `desk-contents.tsx` in particular had zero raw reads before this program.

**`packages/supabase/src/hooks/use-time-tracking.ts`** — three hooks added, keys unchanged:

| hook | key | replaces |
|---|---|---|
| `useProjectPricingStudio(projectId)` | `['document-hours-project-studio', projectId]` | `hours-ledger.tsx` `lensPricingStudio` |
| `useTimeEntryNote(entryId)` | `['document-hours-entry-note', entryId]` | `hours-ledger.tsx` `ScopeEntryNote` |
| `useStudioUnbilledTime()` | `['desk-contents-unbilled-time']` | `desk-contents.tsx` `HoursInHandAct` |

The three keys are added to the module's `timeKeys` factory **verbatim as the literals they already were**, with a comment saying why they may not be renamed into the `['time', …]` family: `useStampProjectPricingStudio`'s `onSuccess` invalidates `['document-hours-project-studio', projectId]` **by name** (the round-2 fix that made a resolved repair actually flip the "priced by" line), and the Hours sheet's week read sits beside it on `['document-hours-week']`. Renaming either would have silently un-done that repair.

`useStudioUnbilledTime` also carries the `isInvoiceEligibleTimeEntry` filter that was inline in the component, returns a typed `StudioUnbilledTimeRow[]` (`id`, `project_id`, `billing_state` — no `notes`, HT-36; no money, R95/HT-30), and names no project: RLS is the scope. Moving it out let the component drop two `as any` casts and two `as string` casts at the call sites.

**`packages/supabase/src/hooks/index.ts`** — the three functions and `StudioUnbilledTimeRow` exported from the barrel (the package index is `export * from "./hooks"`, so nothing else was needed).

**`apps/designer-portal/src/components/document/hours-ledger.tsx`** — two 12-line `useQuery` blocks become one-line hook calls. `useQuery`/`getSupabase` remain in the file for the **five pre-existing** reads the finding explicitly excluded (`grep -c "getSupabase()"` = 5, down from 8).

**`apps/designer-portal/src/components/document/desk-contents.tsx`** — the file's only raw read is gone, and with it the `useQuery`, `createBrowserClient` and `isInvoiceEligibleTimeEntry` imports. The file is back to importing hooks only.

### Test consequences

- **`__tests__/desk-contents.test.tsx`** — the `QueryClientProvider` the suite had to grow for that read is **removed** along with the `createBrowserClient` stub; with both reads now mocked hooks, no `useQuery` runs in the tree at all. The mock is two lines: `useRunningTimer`, `useStudioUnbilledTime`.
- **`__tests__/hours-ledger-scope.test.tsx`** — the `maybeSingle` branch of the chainable PostgREST stub is deleted (nothing reaches it any more) and two hook stubs take its place. Both stubs wrap a **real `useQuery` on the real key**, not a hand-rolled object: the "flips the priced-by line when the stamp resolves" case proves the repair by calling `client.invalidateQueries({ queryKey: ['document-hours-project-studio', 'project-1'] })`, and a plain object stub would have answered that invalidation with nothing and passed vacuously. `projectStudioId` stays the suite's single dial for what studio a document names. Two new call-recorders (`pricingStudioCalls`, `entryNoteCalls`) are reset in `beforeEach`.

---

## Gates run (worktree, this round)

| command | result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | pass, no output |
| `pnpm --filter @patina/designer-portal type-check` | pass, no output |
| `pnpm --filter @patina/supabase test` (vitest) | **102 files, 1255 passed, 12 skipped** |
| `pnpm --filter @patina/designer-portal test -- …hours-ledger-scope.test.tsx …desk-contents.test.tsx` | **2 suites, 30 passed** |
| `pnpm --filter @patina/designer-portal exec eslint <the 4 changed portal files>` | clean (two "unused eslint-disable" warnings on the first run were the directives I had added defensively; removed, re-run clean) |
| `pnpm --filter @patina/admin-portal build` | pass — the repo's strict gate after a `packages/*` edit |

**Not run / not verified this round:** no DB reset (forbidden for this lane), no migration minted, so no `generate-legacy-grants.py` and no `db:generate` were owed; no live-render check on :3000 (this stage does not own the port); the full designer-portal jest suite was not re-run, only the two affected files; nothing touched prod.

## Commit

`fix(time): three reads the sheet owned inline become three hooks` — explicit pathspecs, six files, no `git add -A`. `apps/designer-portal/next-env.d.ts` was already dirty on entry and was deliberately left unstaged.
