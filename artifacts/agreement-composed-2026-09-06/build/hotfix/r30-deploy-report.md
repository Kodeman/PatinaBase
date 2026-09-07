# R30 hotfix — merge + production deploy report (2026-09-07)

**The origin agreement reaches the homeowner.** A household with zero projects
now sees and signs a sent `design_services` (origin, `project_id NULL`)
agreement at its front door; `?proposal=` and the retired `/proposals/[id]`
redirect land on it; the studio-invoice letter renders beside it; the kept
record is dated by the client's own signature row.

Client portal only. **No migration and no edge function** — confirmed empty
before the merge:

```
git diff --name-only origin/main...agreement/r30-origin-door -- supabase/migrations supabase/functions
(no output)
```

## Merge

Branch `agreement/r30-origin-door`, review-verified code head `25c27e71d`
(round-4 verdict **ship**), doc tip `fcf0ca68e`.

`origin/main` had moved past the merge-base (`a6584dbc5` → `8bc8bcc4d`) with a
single docs commit — `docs(agreements): program build docs — contract, rulings
R1–R30, wave sheets and scripts`, 9 files, all under
`artifacts/agreement-composed-2026-09-06/`, **zero overlap** with the branch's
files. `git merge origin/main` into the branch was clean by the ort strategy,
docs only (`a2d5376ce`).

Gates re-run in the worktree after that merge (via `pnpm --dir` — cwd does not
persist between calls, and a bare `cd` ran the first attempt against the main
checkout instead):

| gate | result |
|---|---|
| `pnpm --dir <wt>/apps/client-portal type-check` | **exit 0**, `tsc --noEmit`, no output |
| `pnpm --dir <wt>/apps/client-portal test` | **exit 0** — **129 suites / 2012 tests passed**, 1 snapshot, 10.4 s |

Counts match the round-4 review exactly.

**Merge commit: `253f7afcf960067e35405a70ca00913825cc752a`** (`--no-ff`), 14
files, +2402 / −33. Pushed: `8bc8bcc4d..253f7afcf  main -> main`.

The main checkout carried unrelated pre-existing dirty files beyond the two the
brief expected (`.claude/settings.json`, `CLAUDE.md`, plus the iOS pbxproj, two
other programs' docs and six help-walkthrough PNGs). The merge changeset was
diffed against them first — **zero overlap** — and all were left untouched.

`merge-base --is-ancestor` → `MERGED`. Worktree
`.codex/worktrees/agent-agr-r30` removed cleanly (no `--force` needed); branch
`agreement/r30-origin-door` deleted (was `a2d5376ce`). Nine unrelated worktrees
(agreement W2 lanes, invoice-standalone lanes) remain and were not touched.

### Pre-push hook: two advisory failures, neither blocking, neither R30's

The repo's pre-push affected-verification hook reported "advisory failures" and
the push proceeded.

1. **`client-portal type-check` failed in the main checkout** on
   `.next/types/app/page.ts(37,29): error TS2344 … Type 'undefined' is not
   assignable to type 'PageProps'`. This is **pre-existing, not R30**:
   `HomePage`'s `props?:` optional signature is **byte-identical** at
   `8bc8bcc4d` (pre-merge) and `253f7afcf` (post-merge). It surfaces only where
   `.next/types` has been generated — the main checkout has one dated 7 Sep
   08:55; the r30 worktree never built, so its clean type-check never included
   that generated file. `client-portal` sets `typescript.ignoreBuildErrors:
   true`, so it does not gate the build, and the deploy regenerated the file.
   Worth fixing on main separately.
2. **`client-portal lint` failed** (11 errors / 46 warnings). Per
   patina-verification, client-portal has only a legacy `.eslintrc.json` under
   ESLint 9 with no `ESLINT_USE_FLAT_CONFIG=false` anywhere in the repo —
   designer-portal holds the one working config. This result is **not treated
   as meaningful either way**.

## Deploy — client portal only

`apps/client-portal/.env.local` resolved to `bkvcixdmuyejfzcijpdg.supabase.co`
(Strata prod), so the preflight guard passed on its own — **the wrangler.jsonc
`vars` inline-export workaround was NOT needed and was not used, and no `.env`
file was read into a report, edited, or created.**

```
cd /Users/kody/Code/patina-merged && ./infra/deploy-portal.sh client
→ exit 0 … "==> Done: client portal deployed to production."
```

4 new static assets uploaded (incl. `_next/static/chunks/app/page-1e35db508e850a65.js`),
85 already present. Worker startup 30 ms.

| | version id | created |
|---|---|---|
| **new (live)** | `9858b5a6-8b87-4f82-9173-ffde4a76bb35` | 2026-09-07T16:59:35Z |
| **rollback to** | `48624f39-4013-4110-9262-171942bf8c26` | 2026-09-07T13:56:36Z |

`wrangler deployments list --name patina-client-portal` is oldest-first; the
**bottom** row is `9858b5a6…`.

## Verification

**Served-chunk grep (the real freshness proof).** The R30 sentence is templated
(`${…} agreement is / agreements are waiting for you.`), so the fragments are
the marker. `agreement is` / `agreements are` appear **0 times** in
`letterbox-door.tsx` at `8bc8bcc4d` — they are new in R30.

```
GET https://client.patina.cloud/_next/static/chunks/app/page-1e35db508e850a65.js → 200
  'agreements are'   → 1
  'agreement is'     → 1
  'waiting for you.' → 3
  'letterbox-door'   → 2

sha256 local .open-next build : e823b7e913ff5b36b416ae64c28ef170273974ef180b47ef60fd59bed48d35e1
sha256 as served by prod      : e823b7e913ff5b36b416ae64c28ef170273974ef180b47ef60fd59bed48d35e1
```

Byte-identical — what was built is what is being served.

**Unauthenticated front door.** `GET https://client.patina.cloud/` →
**200**, 23,953 bytes, one redirect to `/auth/signin?callbackUrl=%2F`, title
`Patina Client Portal`, "Sign in" present. Zero occurrences of `This page
couldn't load`, `Application error`, `500`, or `URL and API key are required`
(the white-screen incident class the preflight guard exists to prevent).

**The prod defect's subject, read-only on Strata:**

```sql
select id, commercial_state, sent_at from proposals
where document_kind='design_services' and project_id is null and commercial_state='sent';
```
```
f72d2912-c14b-4cea-ba6c-5726b14d502c | sent | 2026-09-04 13:55:32.42432+00
```

The one origin agreement is still there, still `sent`, still project-less —
now reachable at its household's door once its homeowner signs in. **Nothing
was mutated.**

## Not verified

- **No signed-in walk as that homeowner.** The single decisive check — opening
  `client.patina.cloud` as the addressee of `f72d2912…` and seeing the door,
  then holding to sign — was not performed. Everything above proves the code is
  built, shipped and served; it does not prove her door renders. **Kody owes
  this walk.**
- **The retired-route 308 could not be observed unauthenticated.** `GET
  /proposals/f72d2912-…` returns **307** to
  `/auth/signin?callbackUrl=%2Fproposals%2Ff72d2912-…` — auth middleware
  intercepts ahead of the redirect, and the callbackUrl is preserved, so the
  308 fires after sign-in. The 308 and the `?proposal=` deep link are covered
  by `origin-door.spec.ts` 3/3 locally, not by a prod probe.
- **No e2e was re-run against prod or post-merge.** The origin-door 3/3 and
  threshold 13/14 figures are the round-4 review's, against a local stack on
  :3202. The one threshold red (`names the other houses on the mat`) is the
  recorded `MULTI_OTHER_HOUSE_COUNT` seed-accumulation drift, a main-backlog
  item, not this branch's.
- **No `wrangler tail`** was taken; no live error-rate observation.
- **Custom-domain routing** is dashboard-managed out-of-band (no `routes` in
  wrangler.jsonc); `client.patina.cloud` answered correctly, but that binding
  was not otherwise audited.
- **client-portal lint** is not claimed clean or dirty — its config does not
  resolve under ESLint 9 (see above).
- Nothing else was deployed: no migration, no edge function, no service, no
  other portal.

## Carried open findings (from review round 4, shipped knowingly)

- **N1** — the origin door offers three acts, not four: `DoorActs` withholds
  "Ask a question" when there is no `projectId`. Pre-existing house rule, now
  reachable for the first time. The homeowner's first paper cannot ask a
  question; "Request a change" still posts a note.
- **N2** — no error branch: if `useClientSafeProposals` exhausts its inherited
  `retry: 2`, a zero-project household falls to `ProjectsEmptyState` over the
  very agreement R30 exists to reach. Widening of a gap already on `origin/main`.
- **R30-7** — the committed e2e signs through the RPC in `beforeAll`; nothing
  drives the hold gesture. Coverage gap; the reviewer drove it by hand and it
  worked.
- **R30-12** — `partitionProposals(...)` is unmemoized in the component body, so
  the two `useMemo` blocks below it do not memoize. Harmless at these sizes.
- **R30-4 / R30-5 / R30-6** — deferred to the Wave 2 client lane and the main
  backlog by ruling R30.
- **N5 (environmental)** — `apps/client-portal/playwright.config.ts` pins `:3002`
  with `reuseExistingServer: true`; with another lane's dev server on that port,
  a gate run silently exercises another branch's build. Worth a per-lane port.
