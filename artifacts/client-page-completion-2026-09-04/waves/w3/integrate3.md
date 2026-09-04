# W3 — Integration step 3 (R2b → R2a → main)

Branch: `client-page-2/integration`
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
Start: `98e36a9eb` · **Merge-chain head: `3c0b3b89d`** (pushed; this report is the commit on top of it)

## Merge order and commits

| # | Commit | What |
|---|---|---|
| 1 | `b4b91f94d` | `chore(client-page-2): merge r2b — chrome, making v1, instruments moved, one playwright server` (`f1bfe7c0f`) |
| 2 | `3fa155c36` | `chore(client-page-2): merge r2a — routes, api, hooks, tests` (`923c0e935`) |
| 3 | `07f2c9025` | `fix(client-page-2): close the two cross-lane gaps r2a and r2b left` |
| 4 | `3c0b3b89d` | `chore(client-page-2): merge origin/main — iOS W0 D8c and H4 fixes` (`d3f094739`) |

Both lanes forked from `98e36a9eb`, so the fork points were clean.

## Conflicts

**One**, in merge 2: `apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts`.

Resolved to **r2b's version**. r2a's side could not stand:

- it read `components/commercial/awaiting-signature-cards.tsx` off disk as a drift guard — r2b **deleted** that file;
- it imported `CONSENT_LINES`, `SIGN_LABELS`, `SUMMARY_FRAGMENTS` from `../consent-copy` — r2b rewrote `consent-copy.ts` as `consentLineFor` / `signLabelFor` / `summaryLineFor` functions and exports none of those three.

Everything r2a's side asserted that still has a subject (the refusal-token guard against `app/api/proposals/[id]/sign/route.ts`, the kind-label check, the branch structure, the refusal sentences) survives in r2b's version. The remaining diff between the two was quote style.

The rest of the overlap — the `timeline/`, `today/`, `scans/`, `project-overview` and `project-view-wrapper` deletions both lanes made — merged as identical deletes with no conflict. Merge 4 (`origin/main`) had **no conflicts**: main carried only `apps/mobile/Patina` changes, so `supabase/seed/00-legacy-grants.sql` needed no regeneration.

## Two cross-lane gaps neither lane owned (`07f2c9025`)

1. **`src/app/__tests__/page.test.tsx` mocked a deleted module.** r2b swapped `<ProjectSurfaceSwitch>` for `<Threshold>` in `app/page.tsx` but never touched the front-door suite, which still did `jest.mock('@/components/making/project-surface-switch', …)`. That both violated the no-`@/components/making/` proof and would have rendered the real `<Threshold>` under the test's mocked data. Mock now points at `@/components/threshold/threshold` with the same props (`projectId`, `otherHouses`, `viewSource`).
2. **`src/app/budget/` survived r2a's route deletion.** r2a deleted the budget page but left `rollup.ts` + its suite in place, because they are live code: `visibleInvoices` / `computeInvoiceRollup` are read by `threshold/earlier-invoices.tsx` and `lib/threshold/derive.ts`. The tree is retired, so the module moved to `src/lib/threshold/invoice-rollup.ts` (test alongside), three importers updated, stale comments naming `/budget` and `project-invoices-summary.tsx` rewritten.

## End state — verified against the retirement plan

- `app/page.tsx` and `app/projects/[projectId]/page.tsx` both render `<Threshold …/>` directly, server-fetching via `fetchClientProjects` / `fetchClientProjectView`. No surface switch, no flag.
- `AppChrome` is a `display: contents` marker carrying the public/authenticated split and nothing else — no header, no drawer, no project switcher.
- `src/components/making/` gone; the six instruments live at `src/components/threshold/instruments/` with their suites.
- `wrangler.jsonc` carries no `NEXT_PUBLIC_FLAG_OVERRIDES`; `playwright.config.ts` runs ONE server, ONE project.

### Grep proofs (final tree)

| Proof | Result |
|---|---|
| `@/components/making/` in `src`/`tests` | none |
| `useFeatureFlag('threshold'\|'single-pane')` | none (only the generic `useFeatureFlag` hook definition remains, for future flags) |
| `threshold:false` | none |
| `src/app/{today,decisions,proposals,invoices/page,budget,documents,orders,messages,inbox,reviews,scans,account,settings,demo}` | none present |

## Gates

- `pnpm --dir …/apps/client-portal type-check` — **clean** (run after merge 2+3 and again after merge 4).
- `pnpm --dir …/apps/client-portal test -- threshold instruments middleware` — **49 suites, 972 tests, all pass**.
- Full `pnpm … test` (beyond the required gate, for cross-lane safety): **114 of 115 suites pass, 1512 of 1513 tests pass.**

## Advisories

1. **Pre-existing, unrelated failure:** `src/lib/__tests__/portal-access.test.ts` › "returns null for manufacturer (no manufacturer portal) and unknown values" fails — `foreignPortalFromDomain('manufacturer')` now returns the maker workspace. Neither `portal-access.ts` nor its suite was touched by r2a, r2b, main, or this integration (last touched in `1bc3748b0`); the manufacturer portal was deployed after the test was written. It fails on the integration base too. **Not caused by the retirement, and not fixed here** — flag it to whoever owns the portal gate.
2. `src/lib/analytics/events.ts` and `src/hooks/use-commercial-client.ts` carry doc comments that still name "The Making" and the `single-pane` flag. `makingEvents` itself is very much alive — the threshold's gates and scored actions report through it — so this is stale prose, not a stale flag read, and renaming the event namespace is a behavior change (PostHog event names) that no lane was asked for.
3. `AppChrome`'s `PUBLIC_PREFIXES` still lists `/demo`, whose tree is deleted. Harmless (an unreachable prefix), left alone.
4. A pre-existing unstaged modification to `docs/design/the-document/screenshots/schedule-boards-wave2/2-guest-share-desktop.png` was in the worktree at the start and was **not** committed.
