# Desk Claim Cards — ship report (2026-09-09)

## What shipped

R143 — the Desk is two halves. A job with a claim on the studio's hand takes a
**Claim card**; every other live job takes an **at-rest ledger row** beneath the
seven stage plates, six columns wide, one of them a date. One rendering, no
switcher, the two facets untouched (D1, D2). Cards rank by need — bands first,
oldest need date second, name on a tie — and each card prints the reason it is
where it is (D3). A row earns a card exactly when its mark is non-null (D5); the
ten unowned need kinds default to the designer and every line carries its custody
word in code (D6); the day's line quotes the top three cards plus the answered
note (D7). R144 — one new token, `--color-card-edge` `#8F8C88`, spent on Claim
cards only; the ledger keeps its hairline and the ground stays `--doc-paper`, no
shadows anywhere (D4, D4a). D9's two accessibility fixes landed first and alone:
the roster mark takes terracotta-ink and mocha, and the Desk's focus rings take
clay-ink. D10's trade-off holds — the 88px upper block is the card's link zone
and the act sits in a full-width 44px band that is not clipped and not swallowed
by the link.

**Rulings delivered.** D1, D2, D3, D4, D4a, D5, D6, D7, D8, D9, D10, D11, R5.

**Commit range.** `f2ee0061c..ae5344aab` — 14 commits, pushed to `origin/main`
2026-09-09 (fast-forward; `origin/main` was `f2ee0061c` and already an ancestor
of the branch head, so no merge commit and no conflict).

```
ae5344aab fix(desk): final review — year-aware ledger dates, wrap guards, doc corrections, dead tests removed
52f2c726c fix(desk): the teammate walkthrough and the needs-me e2e describe the two-halves Desk
767cc1b77 test(desk): e2e — a claim takes a card, a quiet job takes a row
e0140321e feat(desk): the Desk holds both halves
f141d51ac feat(desk): the at-rest ledger row and the claims grid
ba20cf71d fix(desk): the claim card's link zone is the upper block, and the act's ring is not clipped
3117e39ed feat(desk): the Claim card, and the R143 stylesheet block
f8798705a feat(desk): the claims split, and a day's line that quotes the grid
a816fd8eb fix(desk): every need's owner is required, and the guard reads it
5944943e8 feat(desk): every need states its owner, and every line its custody word
6eb42e131 docs(design): Claim cards — R143–R144
50ee0cfc2 fix(desk): mark and focus ring take the ink pigments
626dae252 docs(plan): desk claim cards — review patches, tasks 3/4 split
775727b73 docs(design): desk cards — rulings D1–D11 and implementation plan
```

`main` head after the push: **`ae5344aab254a03b9dbf124a45017b283b4fbb2a`**
(`git merge-base --is-ancestor HEAD FETCH_HEAD` → `MERGED`).

Everything below was run from the worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards` on branch
`desk-cards/build` at `ae5344aab`. The shared checkout at
`/Users/kody/Code/patina-merged` was never checked out, merged into, reset or
cleaned — see "Owed to Kody" (g).

## Gates run, and their real output

**`pnpm --filter @patina/designer-portal type-check`** — the real type gate
(`next.config.js` sets `typescript.ignoreBuildErrors: true`, so the build proves
nothing about types).

```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```

Exit 0, no diagnostics.

**`pnpm --filter @patina/designer-portal test -- --ci`**

```
Test Suites: 561 passed, 561 total
Tests:       7005 passed, 7005 total
Snapshots:   12 passed, 12 total
Time:        23.944 s
Ran all test suites.
```

The whole-workspace form was used deliberately: a `--testPathPattern` filter has
to escape the route group as `\(document\)` or
`src/app/(document)/desk/page.test.tsx` is silently dropped. The full run
collects it. The program's suites are all present and green:

```
PASS src/app/(document)/desk/page.test.tsx
PASS src/components/document/desk-claim-card.test.tsx
PASS src/components/document/desk-claims.test.tsx
PASS src/components/document/desk-ledger-row.test.tsx
PASS src/components/document/desk-roster.test.tsx
PASS src/components/document/desk-roster-settle.test.tsx
PASS src/components/document/help/desk-walkthrough.test.tsx
PASS src/lib/document/__tests__/desk-derivation.test.ts
PASS src/lib/document/__tests__/desk-roster-derivation.test.ts
PASS src/lib/document/__tests__/desk-focus-ring.test.ts
PASS src/lib/document/__tests__/contrast.test.ts
```

**`pnpm --filter @patina/designer-portal lint`** — meaningful here because
`apps/designer-portal/eslint.config.mjs` is the one working flat ESLint config
in the repo.

```
✖ 207 problems (2 errors, 205 warnings)
```

The two errors are **exactly** the recorded baseline, neither in a file this
program touched:

```
src/components/document/rooms/piece/piece-room-save-gate.test.tsx
  159:1  error  Definition for rule 'import/first' was not found  import/first

src/hooks/__tests__/use-commercial-documents.test.ts
  930:8  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …  react-hooks/rules-of-hooks
```

No third error — no regression.

**E2E** — `pnpm --filter @patina/designer-portal exec playwright test --project=chromium --workers=1 <specs>`
(the `test:e2e -- --project` form does not pin the project; the `exec` form
does). Run against the local Supabase stack at `127.0.0.1:54321` — the worktree
has no `.env.local`, so `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (local demo values from `supabase status`) were
exported for the test process; `playwright.config.ts`'s `webServer` block
self-safes the dev server to that same local stack.

Result: **9 passed, 2 failed, 1 skipped, 1 did not run** — both failures
pre-existing and unrelated to this program.

| Spec | Result |
|---|---|
| `desk-claims.spec.ts` (this program's new spec) | **4 / 4 pass** — the split, D10's link zone, "only what needs me", no sideways scroll at 390 |
| `desk-error-state.spec.ts` | **2 / 2 pass** — forced `document_state` failure + retry; 20 consecutive desk loads each reach a complete state |
| `desk-walkthrough.spec.ts` | 2 pass; **1 fail (pre-existing, below)**. The fourth stop's `[data-tour-anchor="desk-folio"]` anchor, which Task 7 moved onto the first Claim card, is exercised by the two that pass |
| `action-visibility.spec.ts` | 1 pass; **1 fail — A9, known pre-existing**; 2 blocked behind it in the serial file |

**Known-red #1 (pre-existing, not a gate).** `action-visibility.spec.ts:232`
"390px desk promotes capture-lead from the head, not the edge (A9)" — mobile bar
copy. Red at the base commit; blocks `:311` and `:332` in its serial file.

**Known-red #2, newly identified as pre-existing.**
`desk-walkthrough.spec.ts:193` "replay — ⌘K row and `?tour=` param restart at
step 1" times out on
`getByRole('dialog', { name: 'Command bar' }).getByRole('textbox')`. It fails in
isolation (`--grep replay`), so it is not flake. **Proof it is not ours:**
`e2e/document/help-panel.spec.ts:73` — a spec this program never touched, in a
file this program never edited — fails at the **identical** locator with the
identical call log. This is a standing Command-bar e2e defect, not a Claim-cards
regression. The program's diff touches no command-bar file; the only change to
`desk-walkthrough.tsx` is two lines of coachmark copy.

**Two dev-server traps worth recording.** The first e2e attempt died with
`Watchpack Error (watcher): EMFILE: too many open files` and a 120s webServer
timeout; `ulimit -n 20480` (down from the shell's inherited `1048576`, which
libuv mishandles on macOS) fixed it. The first full-parallel run then produced
4 failures; re-running with `--workers=1` against a warm server reduced that to
the 2 genuine pre-existing reds above — the other 2 were cold-compile/parallel
contention, not defects.

**Not run.** firefox and webkit (chromium only). `wp3-screenshots.spec.ts` was
not in the gate set. The ~45-job density claim from the proposal was not
exercised — the local seed has no 45-job studio and this program adds no fixture
for one; the e2e proves the split and the 390 reflow, not density at scale.

## Deploy

Authorized in-session by **D11** — "Build, verify, ship to prod." One portal
only: this program mints no migration and touches no edge function or service.

```
git rev-parse HEAD          → ae5344aab254a03b9dbf124a45017b283b4fbb2a
date -u                     → 2026-09-09T15:10:31Z   (start)
bash ./infra/deploy-portal.sh designer
                            → "==> Done: designer portal deployed to production."
```

Run from the worktree; the script resolves `REPO_ROOT` via
`git rev-parse --show-toplevel`, which returns the worktree path, so phase 1
(`pnpm turbo build --filter=@patina/designer-portal^...`, the stale-dist guard)
rebuilt this worktree's workspace dists. `infra/deploy-portal.sh` was the only
path used — no raw `opennextjs-cloudflare build`, no app-dir `wrangler deploy`.

**Env supplied inline; no `.env` file written.** The worktree has no
`apps/designer-portal/.env.local`, so the script's phase-0 preflight refused the
first attempt (`NEXT_PUBLIC_SUPABASE_URL … resolved EMPTY`). The preflight
resolves an exported `process.env` value ahead of any env file, so seven
build-time-inlined values were exported, read programmatically from the
committed `apps/designer-portal/wrangler.jsonc` `vars` block — no transcription:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_STORAGE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENV`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`. Preflight then passed:

```
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
```

`SUPABASE_ORIGIN_RUNTIME` was deliberately left unset at build time — it is a
server-read runtime var and lives in `wrangler.jsonc`
(`https://api.patina.cloud`), where the deploy output confirms it landed.

**Worker:** `patina-designer-portal`.
**Version ID:** `b615b951-e82c-461a-877a-3fb0d25f176e`.
**`npx wrangler deployments list --name patina-designer-portal`** — the list is
oldest-first, so the **bottom** row:

```
Created:     2026-09-09T15:12:15.848Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) b615b951-e82c-461a-877a-3fb0d25f176e
                 Created:  2026-09-09T15:12:12.713Z
```

Newer than the 15:10:31Z start. The previous deployment was
`937ee138-c748-4f1d-aef0-5850f54c5c47` at 2026-09-09T10:36:45Z.

## Behaviour probes

`/api/version` is **not** a freshness signal on the Workers path — neither
`deploy-portal.sh` nor `wrangler.jsonc` sets `APP_VERSION`/`BUILD_SHA`, so it
returns static defaults. It proves liveness only.

Probed on **both** hostnames — `https://patina-designer-portal.kody-be3.workers.dev`
and `https://app.patina.cloud` — with identical results:

- `/api/version` → **200** (liveness only).
- signed-out `/desk` → **307** → `/auth/signin?callbackUrl=%2Fdesk`. The gate
  holds; the Desk is not served to a signed-out fetch.
- **Freshness.** `.desk-claim-card` is a CSS class authored in `globals.css` —
  not tree-shaken, not renamed — and it ships in the global stylesheet linked
  from every page including the public sign-in page. Fetching `/auth/signin`
  yields three stylesheet hrefs (`15d98f1e5ae9d567.css`, `7f8a72e9189e8b62.css`,
  `be1a1f29529a2f57.css`); fetching each and grepping:

  ```
  FOUND in /_next/static/css/15d98f1e5ae9d567.css: desk-claim-card desk-claims-grid desk-ledger-row
  HTTP=200 bytes=231917
  occurrences  desk-claim-card:    5
  occurrences  desk-ledger-row:   13
  occurrences  desk-claims-grid:   3
  occurrences  --color-card-edge:  2
  occurrences  #8F8C88:            1
  ```

  R144's token is on the wire by name and by value.
- **Second witness — the local build output** carries the same classes, so this
  is the bundle the deploy uploaded, not a cached edge response:

  ```
  apps/designer-portal/.open-next/assets/_next/static/css/15d98f1e5ae9d567.css
  apps/designer-portal/.open-next/server-functions/default/apps/designer-portal/handler.mjs
  apps/designer-portal/.open-next/server-functions/default/apps/designer-portal/.next/server/app/(document)/desk/page.js
  apps/designer-portal/.open-next/assets/_next/static/chunks/app/(document)/desk/page-0b02289f7b85ab17.js
  ```

  Same content hash (`15d98f1e5ae9d567.css`) locally and on both hostnames.
- **`npx wrangler tail patina-designer-portal`, 62 seconds** — 12 requests,
  `"outcome": "ok"` × 12, `"status": 200` × 12, `"exceptions": []` on every
  record. No error spike.

## Not verified

- The **signed-in** Desk. Every probe above is signed-out by construction; the
  signed-in walk is Kody's, per D11.
- firefox and webkit e2e; `wp3-screenshots.spec.ts`.
- The ~45-job density claim (no seeded 45-job studio).
- Custom-domain routing is dashboard-managed out of band — no `routes` in
  `wrangler.jsonc` — but `app.patina.cloud` was probed directly and serves the
  new bundle, so it is in fact reaching this Worker.
- **A deliberate build-env divergence.** A build from the shared checkout would
  additionally inline whatever `NEXT_PUBLIC_*` its untracked
  `apps/designer-portal/.env` defines — a set of legacy, localhost-valued
  service URLs (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ORDERS_API_URL`,
  `NEXT_PUBLIC_CATALOG_API_URL`, and similar). Those were **not** exported here,
  so they inline empty rather than as localhost. The portal reaches services
  through `@patina/api-routes` server-side proxies fed by `wrangler.jsonc`'s
  `ORDERS_SERVICE_URL` / `MEDIA_SERVICE_URL` / `PROJECTS_SERVICE_URL`, so this
  should be inert — but it is a difference from the previous production bundle,
  and is recorded rather than hidden.
- Six other portal files still spend `--color-clay` (2.18:1) as a focus ring —
  D9's wider reading, deliberately out of scope; listed under (f) below.

## Owed to Kody

**(a) The signed-in prod walk of the Desk, at desktop and at 390.** D11's second
half. Two things to look at specifically: a **two-line Playfair name** and where
its underline sits; and whether the **ledger's date column reads too empty** —
only 3 of the 12 motion kinds populate it, so most at-rest rows show a blank
date cell.

**(b) RULING NEEDED — a "never both" breach from two rulings colliding.**
At-rest rows whose motion is `drafting` or `sent_unopened` print the inherited
day-count chip prose (`"Nd"`) **and** the new date column. The house rule is
never both. Two options: null the date for those two motion kinds, or drop the
`"Nd"` from the chip copy — the second touches the folio, which renders the same
chips.

**(c) PLAN GAP — D3's second sort key has no register on the card.** Cards sort
by band, then by oldest need date, then by name. The band and the name are
visible; the **oldest need date is not**. Two same-band "Your pen" cards
therefore appear in an order with no visible reason for it.

**(d) Date format.** Dates print through the portal's `dayMonth()` — long month,
`"12 August"`, with the year appended when it is not this year — rather than the
deck's `"12 Aug"`. Worth a ruling on whether the deck or the portal wins.

**(e) Two pre-existing red e2e tests, unrelated to this program, block later
tests in their serial files.** `action-visibility.spec.ts:232` (A9, mobile bar
copy) blocks `:311` and `:332`. `wp3-screenshots.spec.ts` "margin handoff"
(chips at 390) is the other. Both were red before this program and are red
after. Separately, the Command-bar e2e failure documented above
(`desk-walkthrough.spec.ts:193` and `help-panel.spec.ts:73`, identical locator)
is a third standing red worth its own ticket.

**(f) Follow-up cleanups, all found in build and left alone.**
- `wp3-screenshots.spec.ts`'s `wide` screenshot viewport should move to ~800px
  so it actually proves the two-column band and the 899px ledger collapse.
- Dead exports: `filterRosterToNeeds`; `FlatLine.stageLabel`; the desk-roster
  re-export comment; `groupClaimsByPerson`, which duplicates
  `groupRosterByPerson`.
- `deriveMotion`'s `with_client` chip prose reads "With client since 4 Aug"
  while the ledger's date column prints the same date — the date shows twice on
  those rows. Fixing the copy touches the folio, which renders the same chips.
- Six other portal files still use `--color-clay` as a focus ring —
  `(document)/doc/[id]/page.tsx`, three `scope-builder` components, and
  `.da-glyph-btn` in `globals.css`. D9 was scoped to the Desk's two sites; the
  rest remain.

**(g) The shared checkout needs reconciling before the next pull there.**
Measured read-only after the push: `/Users/kody/Code/patina-merged` is
**103 commits behind `origin/main`** and **2 commits ahead**, and both of those
two are local-only duplicates of commits already on origin under different
SHAs:

```
b8dd4b7f7 docs(design): desk project cards — panel proposal "Three Cards for the Desk"   twin on origin: f2ee0061c
deef529d1 docs(design): first letter — rulings R1–R13 recorded, deck amended             twin on origin: 8a91f69a8
```

(`git merge-base --is-ancestor 8a91f69a8 origin/main` → yes.) It also holds
colliding untracked files. Nothing in this ship touched that checkout — the
gate, the merge and the deploy all ran from the worktree — but a plain
`git pull` there will not go cleanly; the two local commits need dropping or
rebasing against their origin twins first.
