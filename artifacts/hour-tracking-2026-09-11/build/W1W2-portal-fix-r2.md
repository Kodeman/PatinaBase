# W1W2-portal — round-2 fixes

Worktree `.codex/worktrees/agent-portal`, branch `hour-tracking/portal`.
Base under repair: `ff2065ed6` (the round-1 fix commit).

---

## Findings

### R2-01 — the repair did not refresh the fact it repairs · **FIXED**

`packages/supabase/src/hooks/use-time-tracking.ts:901-918`.

`useStampProjectPricingStudio`'s `onSuccess` invalidated `invalidateProjectTime` (`['projects',id,…]`
+ `timeKeys.all = ['time']`), `['projects']` and `['document-hours-week']` — and the round-1 M1 fix had
just moved the pricing-studio fact onto a **new** key, `['document-hours-project-studio', lensProjectId]`
(`hours-ledger.tsx:424`), which none of those covers. Confirmed exactly as reported. Two lines added:

```ts
queryClient.invalidateQueries({ queryKey: ['document-hours-project-studio', projectId] });
queryClient.invalidateQueries({ queryKey: ['document-hours-pending-authorization'] });
```

(The pending-authorization read is keyed `[..., lensProjectId]`; the bare prefix invalidates every
variant of it, which is what's wanted — the band's "rate pending" rows are exactly what the stamp
changes for hours logged after it.)

**Pinned twice**, because the behaviour has two halves and each half can break alone:

* `packages/supabase/src/hooks/__tests__/use-time-tracking.test.ts` (**new**, 3 cases) — the hook's own
  `onSuccess` invalidates `['document-hours-project-studio','project-1']` and
  `['document-hours-pending-authorization']` (plus the three keys it already refreshed), its `mutationFn`
  sends the RPC, and a server refusal propagates rather than being swallowed. This is the real code under
  test; the identity-mock rig is `use-studio-member-rates.test.ts`'s.
* `hours-ledger-scope.test.tsx` → *"flips the priced-by line when the stamp resolves"* — with
  `projects.studio_id` NULL the sheet offers "Name your studio"; resolving the stamp and invalidating
  **that key** flips the line to `Leah Mbeki Studio`, and the "no studio yet" sentence and the door both
  go. It pins the key name the hook must invalidate from the consumer's side.

### R2-02 — three money readouts printed a figure before the read answered · **FIXED**

`apps/designer-portal/src/components/document/hours-ledger.tsx`.

Confirmed as reported: no pending branch in any of the three, and no `placeholderData` in any of the three
hooks, so `fmtMinutes(0)` = `"0 min"` stood as a studio's grand total while loading **and after a refusal**.

| Readout | Where | Now |
|---|---|---|
| `ScopeRollup` grand total | `:1008-1031` | `rollup.isPending` → `Reading…`; `rollup.isError` → **no total at all**, the terracotta `role="alert"` stands alone |
| `ScopeRollup` zero sentence | `:1065-1068` | `"Nothing logged in this window."` is now behind `!isPending` (it was the second half of the same lie) |
| `ScopeEntries` | `:1207-1214` | `ledger.isPending` → `Reading…`; `"No entries in this window."` waits for an answer |
| `MemberProjectTotal` | `:1136-1144` | `total.isPending` → `Reading…`; the zero can no longer stand where `project_hours_total` has not answered (its doc comment at `use-time-tracking.ts:842-849` requires exactly this) |

`Reading…` is the sheet's existing word for an unanswered read (`ScopeEntryNote`, `:1333`) — no new
vocabulary, no spinner, no per-second motion (R69).

**Pinned** by four new `hours-ledger-scope.test.tsx` cases. The mocked hooks now carry a real settle state
(`ready | pending | error`) instead of always-resolved data, which is also why they could not have caught
this before:

* *"says it is reading rather than printing a studio total of zero"* — `Reading…` present, `0 min` absent,
  `Nothing logged in this window.` absent.
* *"shows no total at all when the studio rollup is refused"* — the refusal renders, no figure does.
* *"waits for an answer before saying there are no entries"*.
* *"prints no zero for a document total the function has not given (HT-10-a)"* — scoped to that
  `<section>`, because the sheet's own front matter legitimately reads `0 min` for an empty week.

### R2-03 — HT-35 · **NOT FIXED — recorded as EXPLICITLY DESCOPED** (orchestrator ruling owed)

The finding's own FIX says the orchestrator owes a ruling plus a migration number, and that until then
HT-35 is to be recorded as descoped rather than done. Done, in the one place a later lane will look:
`apps/designer-portal/src/lib/analytics/document-events.ts:177-186` now says HT-35 is **explicitly
descoped from W2**, names the three columns that do not exist (`user_settings`, `profiles`,
`profiles.help_state` = the help-system's own cache), names the missing migration number, and says it
returns as ONE stage — band + opt-out + both emitters — when Kody rules where the preference lives.

Re-verified this round, not taken on trust: `document-time-provider.tsx` and `account-profile-page.tsx`
carry no HT-35 code, and `time_autostart_disclosed` / `time_autostart_opted_out` have no emitter.

**Owed to Kody:** where the per-member auto-start preference lives, and one migration number.

### R2-04 — the e2e spec had never been executed · **FIXED — RUN, AND GREEN**

Ran, and it took two corrections to make the run mean anything:

**(a) The suite could not be pointed at this program's stack.** `playwright.config.ts` hardcodes
`baseURL: http://localhost:3000` *and* `NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321` — the peer
program's stack — with `reuseExistingServer: !CI`. That file **cannot be edited**: it carries the local
CLI's demo `service_role` JWT and `scripts/hooks/core.mjs` `scanSecrets()` reads a changed file's FULL
staged content, so any edit to any line blocks the commit (the documented trap; precedent
`playwright.ship-bar.config.ts`). So: **`apps/designer-portal/playwright.hours.config.ts`** (new) derives
from the base and overrides only the port and the stack, from env vars, with **no literal key in the
file** — and a loopback-only guard plus a "keys required with the URL" guard, so the base's self-safing
rule is kept rather than loosened. Defaults are unchanged (port 3000, the 54321 stack), chromium-only
project.

**(b) The spec was blocked by an inert modal, not by the sheet.** First run failed at
`hours.spec.ts:67` — `the studio` "element(s) not found" — with the accessibility snapshot showing the
lens rendering **both words correctly** (`group: [button: mine, button: the studio]`) underneath
`dialog "This is your Desk"`: the Desk Walkthrough welcome modal is a real `<dialog>`, so everything
outside it is inert and aria-hidden. Its suppression is a **server-side tour record**
(`profiles.help_state`, `desk-walkthrough.tsx:486-489`), not the localStorage marker
`e2e/fixtures/auth.ts` pre-sets — that marker is obsolete, and a freshly seeded designer is offered the
tour. The spec now declines it (`declineDeskWalkthrough`, allowed to find nothing after the first serial
test writes the record). This is an e2e-environment defect the spec has to survive, not a defect in the
lens.

Second run: **5 passed (1.5m)**, chromium, port 3100, against `127.0.0.1:54421`. So the lens at
**1440 / 1024 / 390** is now observed, not read: each word ≥ 44px at every width, no horizontal page
overflow, `mine` current, `the studio` present, the doorway strips its own query, and the studio scope's
group-by row renders with `by person` current and the entries one act away.

The finding's own caveat stands and is not closed by this green: the 44px loop covers **the lens buttons
only** — not round-2 n10's wider target set.

**Honest side effect of the first, invalid run:** `pnpm --filter … test:e2e -- --config …` passes a
literal `--` through to Playwright, which ends option parsing, so `--config` became a positional filter
and the **base** config ran: a dev server on :3000 against the peer program's `:54321` stack, signing in
as `designer@patina.dev`. It wrote nothing but auth session rows there (the spec seeds nothing, starts and
closes no timer, and the walkthrough's `later`/`abandoned` record is written only by a CTA or a modal
close event, neither of which fired). The correct invocation bypasses the npm script:
`npx playwright test --config=playwright.hours.config.ts …` — and its 5-test, chromium-only run is proof
the derived config was the one loaded.

### R2-05 — the onboarding article · **BLOCKED, not fixed** (orchestrator owes the file's home)

Re-measured this round, in both checkouts:

```
git -C <worktree> ls-files --error-unmatch artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md
  → did not match any file(s) known to git
git -C /Users/kody/Code/patina-merged ls-files artifacts/designer-onboarding-learning-2026-09-03/ | wc -l
  → 0        (the whole tree is untracked, and not gitignored)
```

The file exists only in the main checkout's working tree, so it cannot land as a commit on this branch,
and copying it in would import another program's untracked artifact tree — the git-hygiene landmine. The
Sanity push is an external mutation with no session authorization. The edit itself remains two sentences
(`:9`, `:15`) — and `:15` ("a designer **or the studio's first hire** can see … where the week actually
went") is the half HT-8/HT-10 made false, since a plain member gets no lens and her own rows only.

**Owed to Kody / orchestrator:** track that file or name its real home, and authorize the Sanity write.

---

## Gates

All from the repo root, `pnpm --dir .codex/worktrees/agent-portal`.

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/hours-ledger-scope.test.tsx` | **PASS** — 17 passed (12 pre-existing + 5 new) |
| `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-time-tracking.test.ts` | **PASS** — 3 passed (new file) |
| `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal test` | **PASS** — 575 suites, **7286 tests**, 0 failed, 1 snapshot |
| `pnpm --filter @patina/designer-portal lint` | **PASS** — `203 problems (0 errors, 203 warnings)`, the same count as round 1; no warning on any file this round touched |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/supabase test` | **PASS** — 102 files, 1254 tests, 12 skipped |
| `pnpm --filter @patina/admin-portal build` | **PASS** — the repo's strictest gate (`next build`, no `ignoreBuildErrors`) |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live npx playwright test --config=playwright.hours.config.ts e2e/document/hours.spec.ts` | **PASS — 5 passed (1.5m)**, chromium, `PLAYWRIGHT_DESIGNER_PORT=3100`, `PLAYWRIGHT_SUPABASE_URL=http://127.0.0.1:54421` |

Database facts behind the e2e run, read from this program's isolated stack
(`psql 127.0.0.1:54422`), not inferred from the UI:

* `designer@patina.dev` = `a0000000-…-0004`, **owner** of two `design_studio` orgs (Leah Hartwell, Local
  Dev Studio) → the HT-8 precondition for the lens holds on the stack the run used.
* 11 migrations at/after `00604` are applied.

`supabase db reset` was **not** run (not this stage's to own). No `supabase/` file changed, so no
migration, no `generate-legacy-grants.py`, no `db:generate` / `database.types.ts` regeneration is owed.
`supabase/config.toml` was never staged.

### What this round did NOT verify

* **Only chromium.** The spec is chromium-pinned by design (single seeded actor; the `00177:37-41`
  one-running-timer index is per user globally), so firefox/webkit are skipped, not passed.
* **No `--fix`-free formatting claim beyond designer-portal's lint**; lint outside designer-portal is not
  trusted (no resolvable config) and was not run.
* `client-portal type-check` was **not re-run**: round 1 established it is RED for a reason outside this
  branch (`@patina/aesthete-quiz` has no `dist/` in this worktree), and nothing this round touches it.
* **No SQL assertions.** No RLS claim is made here; the e2e run reads the DB through the portal only,
  apart from the two `psql` facts above.
* The Sanity help article and HT-35's surfaces are **not** verified, because they are not built (R2-03,
  R2-05).
* `apps/designer-portal/next-env.d.ts` is dirty in the worktree — Next regenerates it on build/dev. Not
  staged, not this change's.

---

## Push

```
ff2065ed6..4ed047205  hour-tracking/portal -> hour-tracking/portal
```

Commit `4ed047205` — `fix(time): a figure waits for its answer, and the repair refreshes what it repaired`,
7 files, +431/−59:

* `packages/supabase/src/hooks/use-time-tracking.ts` · `…/__tests__/use-time-tracking.test.ts` (new)
* `apps/designer-portal/src/components/document/hours-ledger.tsx` ·
  `…/__tests__/hours-ledger-scope.test.tsx`
* `apps/designer-portal/src/lib/analytics/document-events.ts`
* `apps/designer-portal/playwright.hours.config.ts` (new) · `apps/designer-portal/e2e/document/hours.spec.ts`

Nothing else was staged; `supabase/config.toml` untouched. `apps/designer-portal/next-env.d.ts` is dirty
(Next regenerates it) and deliberately left unstaged.

**The pre-push hook printed `Affected verification has advisory failures.` — chased down, and it is not this
branch's.** This round it is **`@patina/client-portal lint`**: `62 problems (10 errors, 52 warnings)`, every
error a React-Compiler rule in a client-portal file this branch does not touch —
`auth/verify-otp/page.tsx:131`, `field/[token]/site-request-guest.tsx:609`, `quiz/results/results-view.tsx:348`,
`components/auth/ClientPortalLogin.tsx:120`, `components/proposal-document.tsx:109`,
`components/threshold/approval-ask.tsx:1081`, `hooks/use-aesthete-matches.ts:84`, `hooks/use-feature-flag.ts:144`,
`hooks/use-hydrated.ts:23`. Reproduced directly with
`pnpm --filter @patina/client-portal lint`. client-portal is in the affected set only because
`packages/supabase` changed; my diff contains no client-portal file. (Worth passing on: contrary to
`patina-verification`'s "treat client-portal lint as unverified", its config now *does* resolve and its lint
*does* fail loudly — 10 standing errors on `main`-level code.)
