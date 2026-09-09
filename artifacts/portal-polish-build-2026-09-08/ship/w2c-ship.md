# Wave 2c — integration, gates, renders, deploy, merge

**Shipped 2026-09-09 (03:04 UTC).** One lane (**H8**) merged, no integration fix needed, gates green,
`patina-client-portal` deployed, `main` advanced. Worker version
**`6f8adbb5-c024-4f25-bebd-070ee18924e1`**; rollback id **`a787400e-e4e7-4d72-a0ca-4d6a188336b3`**
(Wave 2b's deployment).

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int2c` on
`portal-polish/integration-w2c` (kept — it holds the prod `.open-next` build). `main` is
**`f7865c728`**.

**The headline, said plainly.** The plan key now prints `$11,000.00` where it printed `$11,000` —
the single most visible fault Wave 2b left on the house page is closed, and with it the whole
"money in prose" question at the six call sites Wave 2b named. On the rendered page **every money
token carries cents**, at both widths. What this wave did *not* close is `approval-ask.tsx`, which
reaches `moneyInWords` through `approvalWeighing`; it was outside H8's brief and outside Wave 2b's
divergent list, and it is carried in §8 rather than fixed by an integration lane nobody would then
review.

---

## 0 · Waiting on Wave 3b

Per the brief, nothing shared was touched until Wave 3b wrote its ship report. The poll watched for
`ship/w3b-ship.md`; the file landed on `origin/main` (Wave 3b committed it from its own merge-to-main
worktree, so it never appeared in the bare `/Users/kody/Code/patina-merged` checkout, whose `main`
is still parked at `deef529d1`). Read-only preparation ran meanwhile: the plan's Global constraints
and Shared-state table, `docs/design/house-sheet/SPEC.md` §F-B, `ship/w2b-ship.md`, `ship/PROGRAM.md`,
`waves/w2c/h8-impl.md`, `waves/w2c/h8-review.md`, and Wave 2b's render script.

```
$ git -C /Users/kody/Code/patina-merged fetch origin      (sandbox off — SSH is blocked in-sandbox)
$ git log origin/main --oneline -3
9b66cb83f docs(portal-polish): W3b ship report, program report, lane reviews, and the Desk renders
3ca24f6b2 merge(portal-polish): wave 3b — Desk follow-ups        ← the required subject
0b0d49778 fix(designer): the roster state sentence wraps too — …
```

**Worth recording for the next wave:** the ship-report file is the wrong wait signal. It is written
inside a throwaway merge-to-main worktree and pushed, so it exists on `origin/main` minutes before
it exists at the polled path — and if that worktree is removed, it never appears there at all. Poll
`git ls-remote origin main` for the wave's merge subject instead.

## 1 · Lane gate before merging

| Lane | Latest review | Verdict | Unresolved P1 |
|---|---|---|---|
| H8 | `waves/w2c/h8-review.md` | **approve** — "No P1 or P2 found" | none |

H8 has no `-rereview.md`; the single review round is the latest, and it is an approval. Its one
finding is **P3** and is about the *report*, not the code: `h8-impl.md` §2 says `review-ask.test.tsx`
pins no rendered money string, but `it("formats a price in the item's own currency, not a default
USD")` asserts `/£2,400/` at the exact call site H8 touched. The assertion still passes — the regex
is unanchored, so it matched `£2,400` before and matches `£2,400.00` now — which is also why it
would not have caught a regression. Carried in §8 as a one-line tightening (`/£2,400\.00/`) for
whoever next opens that file. **The wave proceeded; nothing was fixed silently.**

## 2 · Merge

A real `--no-ff` merge onto `portal-polish/integration-w2c`, cut from `origin/main` `9b66cb83f`.

| # | Commit | Subject | Conflicts |
|---|---|---|---|
| 1 | `55151fdbd` | `chore(portal-polish): integrate h8 — cents residuals` | **none** |

```
$ git diff --stat origin/main HEAD
 .../__tests__/road-orders.test.tsx       | 8 +++++---
 .../__tests__/scope-change-ask.test.tsx  | 4 ++--
 .../threshold/plan-key.tsx               | 5 +++--
 .../threshold/review-ask.tsx             | 4 ++--
 .../threshold/road-orders.tsx            | 6 +++---
 .../threshold/scope-change-ask.tsx       | 8 ++++----
 6 files changed, 19 insertions(+), 16 deletions(-)
```

Exactly the six files H8 named, all under `apps/client-portal`. Lane head verified present:
`git merge-base --is-ancestor 726e58820 HEAD` → true.

**Commit-subject deviation, and the rule it confirms.** The brief names the lane merge
`merge(portal-polish): integrate h8 — cents residuals`. The `commit-msg` hook refused it —
`[BLOCK] Commit subject must use Conventional Commits`, `scripts/hooks/patina-hooks.mjs:155-158` —
so the wording was kept verbatim with the type changed to `chore`, as W1, W3, W2b and W3b each did.
**The wave-level merge onto `main` kept `merge(portal-polish): wave 2c — cents residuals` exactly.**
That is the fifth independent confirmation of W2b's correction to PROGRAM §4 item 22: the hook
refuses `merge(` on a *normal* commit and never sees a *git merge* commit. Nothing used
`--no-verify`; no hook was bypassed.

## 3 · Wave gates (integration worktree, real output)

Workspace dists built first: `pnpm install` then
`pnpm turbo build --filter=@patina/client-portal^...` (8 tasks, all cached, FULL TURBO). Verified
the restore actually landed in *this* worktree rather than trusting the cache-replay log, which
prints the originating worktree's paths: `packages/types/dist`, `packages/api-routes/dist`,
`packages/auth/dist`, `packages/help-system/dist` and `packages/patina-design-system/dist` all
present. `@patina/shared` and `@patina/supabase` have **no** `dist` and need none — both resolve
through `"main": "./src/index.ts"`, which is worth knowing before someone reports them as the
fresh-worktree gap that `@patina/api-client` and `@patina/aesthete-quiz` genuinely are.

**Local stack, confirmed before every destructive action.**

```
$ npx supabase status -o json
API_URL: http://127.0.0.1:54321 | DB_URL: postgresql://…@127.0.0.1:54322/postgres | linked: <absent>

$ pnpm supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

The worktree carries **no `.env.local` at all** (`apps/client-portal/.env.example` only), which is
the safer state and the same one W2b recorded: `playwright.config.ts:60-68` pins the dev server's
`NEXT_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:54321` and the CLI's fixed demo anon key in the
config itself, so a `.env.local` that has pointed at Strata prod before cannot reach the suite.

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.78 |    71.56 |    75.9 |   78.09 |
Test Suites: 143 passed, 143 total
Tests:       2427 passed, 2427 total
Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```

Coverage floor is 70/60/70/70 (`jest.config.js:71-78`): **75.78 / 71.56 / 75.90 / 78.09** — every
metric clears it, and every figure is **identical to the Wave 2b baseline**, as a lane that edited
assertions in place rather than adding files should be. Suites and tests are **143 / 2427**, the
same count Wave 2b shipped: nothing lost, nothing added.

Lint is **byte-identical to the baseline** at 63 problems / 11 errors / 52 warnings. The eleven
errors were attributed by file rather than counted: `auth/invite/[token]/page.tsx`,
`auth/verify-otp/page.tsx` (×2), `field/[token]/site-request-guest.tsx`, `quiz/results/results-view.tsx`,
`components/auth/ClientPortalLogin.tsx`, `components/proposal-document.tsx`,
`components/threshold/approval-ask.tsx`, `hooks/use-aesthete-matches.ts`, `hooks/use-feature-flag.ts`,
`hooks/use-hydrated.ts`, `lib/data/projects.ts` — all React-compiler rules, and **none of the six
files this wave touched appears among them.**

### e2e — `tests/threshold.spec.ts`, 22/22

```
$ export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | … SERVICE_ROLE_KEY)"
$ npx playwright test tests/threshold.spec.ts --reporter=list --workers=1
  22 passed (3.4m)
```

Nothing else was on :3002 (`lsof -nP -iTCP:3002 -sTCP:LISTEN` before every run).

**This took three runs, and the two red ones were the machine, not the code. The detail matters
because it will happen again.** While this wave ran, at least three other agent programs were
working the same clone: `agent-client-material` serving a `next dev` on :3202, `agent-fl-l2` running
an admin-portal `next build`, and `agent-fl-l3` running a client-portal jest coverage pass — **93
node processes** in total.

* **Run 1 (dev server, fresh reset): 21 passed, 1 failed** — "signs a composed agreement at its
  door" timed out polling `commercial_document_signatures` for a row that was never written; the
  door had closed in the UI and the proposal was still `sent` in the database. The service-role key
  *was* exported (`admin()` fails with its own named message otherwise, and did not).
* **Run 2 (dev server): 12 passed, 10 failed** — wholesale, including assertions no lane has ever
  touched. Not a code signal.
* **Diagnosis.** `next dev` on this machine hit the same watcher ceiling `PROGRAM §4 item 19`
  records for the designer portal, and it now reaches the **client** portal too: a manually started
  dev server logged **28 × `Watchpack Error (watcher): EMFILE: too many open files, watch`** and then
  answered **404 for every route**, indefinitely. `ulimit -n` is already 1048576, so this is the
  system-wide kqueue pool being consumed by the other programs' watchers, not a per-process limit.
* **`next start` is not the workaround.** A production build served with `pnpm start` answers, but
  `next.config.js:60` sets `output: 'standalone'`, and Next says so itself — *"next start does not
  work with output: standalone"*. Against that server the suite went **1 passed / 21 failed**. Use
  `node .next/standalone/server.js`, or don't use a production build here.
* **The clean run.** The isolated case passed first
  (`npx playwright test … -g "signs a composed agreement"` → 1 passed, 45.6s) on a freshly reset
  database, which ruled H8 out. The full suite then passed 22/22 on a dev server that came up with
  **zero EMFILE lines**, after a fresh `supabase db reset`. Both red runs are attributable and
  neither is a defect in this wave's diff.
* **A footgun in the runner, worth fixing.** `pnpm --filter @patina/client-portal test:e2e -- …`
  interposes a literal `--` that Playwright takes as a positional argument, so
  `-g "<pattern>"` is silently ignored and the whole file runs. Call `npx playwright test` from
  `apps/client-portal` when filtering.

## 4 · Renders

`waves/w2c/renders/render.mjs` is Wave 2b's script with the output path changed and three probes
added: the plan key's rendered sentences, every money token in the page's **visible text** (a
TreeWalker that rejects `SCRIPT`/`STYLE`, so the RSC flight payload's `$1`/`$2` placeholders cannot
be mistaken for figures — the first cut of this probe made exactly that mistake), and console errors
captured with their source URL rather than as bare text. It signs in as `client-solo@patina.dev`
and opens Cedar Lane Study on a freshly reset database. Full output:
`waves/w2c/renders/render-report.json`.

| File | Viewport | scrollWidth / clientWidth | Console errors |
|---|---|---|---|
| `renders/house-w2c-1440x900.png` | 1440×900 | **1440 / 1440** | 2, both local-stack |
| `renders/house-w2c-390x844@2x.png` | 390×844 @2× | **390 / 390** | 1, local-stack |

**No horizontal overflow at either width.** All twelve anchors present
(`doorstep key letterbox wall door road note previously mat mat-papers ledger changed`); all five
landmarks resolve to an element that renders; `Sign out` once; owed `$4,060.00`; wall consequence
*"Accepting releases $2,980.00 to Marta Voss for the finished work."*

**Zero console errors originate in the app** — both classes are the local stack, named by URL:

* `net::ERR_CONNECTION_REFUSED` on **`http://localhost:3000/api/auth/qr/generate`** — the designer
  portal, which is not running.
* CSP `img-src` refusing `http://127.0.0.1:54321/storage/v1/object/public/product-images/…` — the
  policy at `next.config.js:126` allows `https:`, and prod storage is https.

### What the renders prove

**The plan key prints cents.** From the DOM, at both widths:

```
Shut     Cedar Lane — Phase Work — $11,000.00, your name.
Hatched  Built-in shelving, north wall — $2,980.00, held back until you accept it.
Open     Everything else in the house stands open.
```

and confirmed in the screenshot, one screen below the money block's `$11,000.00`. **Wave 2b
divergence 1 — the most visible remaining fault on the page — is closed.**

**Every money token the page shows carries cents.** The visible-text sweep returns exactly
`$0.00 · $2,980.00 · $4,060.00 · $8,120.00 · $11,000.00 · $11,100.00` — **no whole-dollar figure
anywhere on the rendered house page**, at 1440 or 390.

### Still divergent from `specimens/client-house.html` (reported, not fixed)

Carried unchanged from Wave 2b, all program decisions or fixture gaps rather than lane work:

1. **`approval-ask.tsx` still prints whole dollars** through `approvalWeighing` →
   `standing-sentence.ts`'s `moneyInWords`. Not on Wave 2b's divergent list, not in H8's brief, and
   **not visible in this fixture** — the approval ask mounts conditionally and this seed does not
   raise it. The formatter is present in the shipped chunk (§6). This is now the last money-in-prose
   surface on the Threshold.
2. **The money block is still two sections, not one** — `#ledger` and `#letterbox` are both on the
   no-rename list; merging them is a program decision.
3. **The Pay terminal act is still one disclosure deep.**
4. **Two landmark targets differ from the specimen** — the plan's H3 table outranks the specimen.
5. **The note's signature prints two parts, not three** — the code is right and the fixture is
   short: `project_team_members` is empty for this project, so `leadDesignerName` is null.
6. **The key's SVG callout truncates** — "Built-in shelving, no…" inside the drawing, where §A says
   wrap. Visible in the 1440 render. Cosmetic, inside an SVG callout; flagged, not fixed.

## 5 · Deploy

```
$ npx wrangler deployments list --name patina-client-portal          # BEFORE
… bottom row: 2026-09-09T00:52:05Z  a787400e-e4e7-4d72-a0ca-4d6a188336b3   ← ROLLBACK ID

$ ./infra/deploy-portal.sh client
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
Total Upload: 12788.58 KiB / gzip: 2546.17 KiB
Uploaded patina-client-portal (17.76 sec)
Deployed patina-client-portal triggers (1.03 sec)
Current Version ID: 6f8adbb5-c024-4f25-bebd-070ee18924e1
==> Done: client portal deployed to production.

$ npx wrangler deployments list --name patina-client-portal          # AFTER
… bottom row: 2026-09-09T03:04:49Z  6f8adbb5-c024-4f25-bebd-070ee18924e1   ← NEW
```

**Env.** W2b's recipe, unchanged and worth keeping: the twenty-one committed literals in
`apps/client-portal/wrangler.jsonc` `vars` were exported for the one invocation. The preflight
resolves an exported `process.env` value first and by design (`infra/deploy-portal.sh:68-90`), so
the bundle is inlined from exactly the values the Worker serves at runtime — no `.env` file was
created, copied or read, and the main checkout's local-pointing `.env.local` cannot poison a
worktree that has none. The deploy log echoes each one back.
`NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE` is unset and defaults to `'live'` (`src/lib/env.ts:6`) — no
mock fallback shipped.

`wrangler` warned that multiple environments are defined and none was named; the top-level
environment is the intended target and is what a bare `deploy` uses. Same warning as every prior
wave, same outcome.

**Rollback:** `npx wrangler rollback a787400e-e4e7-4d72-a0ca-4d6a188336b3 --name patina-client-portal`.

## 6 · Smoke

1. **Bottom row is the new deployment** — `6f8adbb5…`, 2026-09-09T03:04:49Z. ✅
2. **The served chunk is this build's.** The house page's components ride
   `common-f572448c9d7a2d21.js`, named from the bundle this deploy uploaded
   (`.open-next/assets/_next/static/chunks/`, located by grepping it for
   `held back until you accept it`) and then fetched **from prod**: `200`, **1,046,376 bytes**.
   Wave 2b's chunk `common-67fea7f77e50297d.js` now **404s** — superseded, which is itself proof the
   bundle changed. `https://client.patina.cloud/auth/signin` → `200`.

   | String | Occurrences |
   |---|---|
   | `Sign out` | **4** |
   | `Leave the house` | **0** |
   | `held back until you accept it` | 1 (the plan key's own sentence) |
   | `Accept the finished work` | 3 |
   | `Accepting releases` | 2 |

3. **`maximumFractionDigits:0` is absent from the plan-key module region.** Measured, not asserted:
   the plan key's marker sits at byte 380,425 of the chunk, and the count of
   `maximumFractionDigits:0` within **±5 KB, ±25 KB and ±50 KB of it is zero in all three windows**.
   The whole-dollar formatter H8 removed is gone from the shipped code and the sentence now calls
   the shared helper.

   **Eleven occurrences remain elsewhere in the chunk, and honesty requires naming them** — none is
   one of H8's six sites, and the nearest is 133 KB away:

   | # | Distance from the plan key | What it is |
   |---|---|---|
   | 1–2 | 297 KB | `@patina/shared`'s `formatCents` / `formatCentsCompact` utilities |
   | 3–4 | 176–184 KB | commercial-document and signature surfaces, not the Threshold |
   | 5 | **133 KB** | `standing-sentence.ts`'s `moneyInWords` — **the live `approval-ask.tsx` consumer** of §4 item 1 |
   | 6 | 260 KB | `designBuildMoney`, which appends its own cents (`${s}.${padStart}`) and does print them |
   | 7–11 | 568–637 KB | design-system and canvas surfaces (proposal cards, room budget lines) |

   **A literal `$2,980.00` cannot appear in any chunk** — every figure on this page is composed at
   runtime by `Intl.NumberFormat`. The cents change is provable in the bundle by its formatter, and
   it is.
4. **`npx wrangler tail patina-client-portal`** for ~60s while loading `/auth/signin` and `/` five
   times each: **10 events, all `outcome: ok`, 0 exceptions, 0 error logs**, statuses 200×5 / 307×5,
   every event stamped `scriptVersion 6f8adbb5-c024-4f25-bebd-070ee18924e1`. **No error spike.**
5. **Signed-in prod walk — NOT done.** Unchanged from W1/W2/W2b/W3/W3b: the only credentials in the
   repo are the local seeds and `playwright.config.ts` pins `localhost:3002`. **Owed to Kody.**

## 7 · Merge to main

```
$ git push -u origin portal-polish/integration-w2c
 * [new branch]  portal-polish/integration-w2c
$ git ls-remote origin portal-polish/integration-w2c
55151fdbdb3e0542421d910822ceb2b5455955b5

$ git worktree add .../agent-pp-main2c -b portal-polish/to-main-w2c origin/main
$ git merge --no-ff origin/portal-polish/integration-w2c \
      -m "merge(portal-polish): wave 2c — cents residuals"
f7865c728   (6 files changed, 19 insertions(+), 16 deletions(-), no conflicts)

$ git push origin portal-polish/to-main-w2c && git push origin portal-polish/to-main-w2c:main
   9b66cb83f..f7865c728  portal-polish/to-main-w2c -> main

$ git merge-base --is-ancestor origin/portal-polish/integration-w2c origin/main
CONFIRMED: integration-w2c is ancestor of origin/main
$ git merge-base --is-ancestor origin/portal-polish/h8 origin/main
CONFIRMED: h8 is ancestor of origin/main
$ git ls-remote origin main
f7865c7280343b0fa0d565f90585f24bb55bc4e1
```

`main` = **`f7865c728`**, subject `merge(portal-polish): wave 2c — cents residuals` exactly as the
brief names it. `main` had not moved during the wave. `main` in the bare
`/Users/kody/Code/patina-merged` checkout is **not** this — it is parked at `deef529d1` and has been
since before Wave 2b; every wave has advanced `main` from a worktree without pulling the shared
checkout forward. Harmless, but it is why a ship report never appears at its own path there.

## 8 · What was NOT verified

* **No signed-in walk against production** (§6.5).
* **`approval-ask.tsx` was never exercised.** The seed does not raise an approval ask, so the one
  remaining whole-dollar surface on the Threshold was neither rendered nor e2e'd — its formatter's
  presence in the shipped chunk is the only live evidence about it (§6.3).
* **No storage, migration or edge-function change.** `git diff` against `supabase/` is empty; Strata
  is untouched. The client portal is the only Worker this wave deployed.
* **The 390 render is Chromium emulation**, not a real device.
* **Prettier drift is unresolved and advisory** on all six touched files — pre-existing on
  `origin/main`, verified as such by H8 and independently by its reviewer.

## 9 · Owed to Kody

**New, or newly sharpened, from this wave:**

* **`approval-ask.tsx`'s `approvalWeighing`** — the last money-in-prose surface on the Threshold.
  One lane, the same shape as H8, closes it; the ruling Wave 2b asked for is now answered in
  practice for the other six sites, so this one is mechanical.
* **Tighten `review-ask.test.tsx`'s `/£2,400/`** to `/£2,400\.00/`. It passes either way today,
  which means it is not guarding the thing it looks like it guards.
* **`next dev` cannot reliably serve the *client* portal on this machine either** — 28 EMFILE
  watcher errors and a 404 for every route, with `ulimit -n` already at 1048576. PROGRAM §4 item 19
  should be widened from "the designer portal" to "any Next app on this machine while other agent
  programs are running", and `next start` recorded as a non-workaround while `output: 'standalone'`
  is set.
* **Poll `git ls-remote origin main`, not a ship-report path**, when one wave waits on another (§0).
* **`pnpm --filter … test:e2e -- <args>`** eats Playwright's flags; document `npx playwright test`
  for filtered runs.

**Carried, unchanged:**

* **Signed-in prod walks of both the house page and the Desk** — no prod credential exists in the
  repo.
* **Seed a `lead_designer`** on Cedar Lane Study so the note's three-part signature can be seen.
* **The plan key's SVG callout truncates** against §A's no-truncation rule.
* The specimen's one-section money block, the Pay act at rest, and the two landmark targets — all
  three are program decisions.

## 10 · Worktrees

* `agent-pp-int2c` (`portal-polish/integration-w2c`) — **kept**; dists restored, holds the prod
  `.open-next` build.
* `agent-pp-main2c` (`portal-polish/to-main-w2c`) — **removed** after this report was committed, as
  every `agent-pp-main*` before it.
* Left for the orchestrator's sweep, unchanged from W3b's list plus this wave's — see
  `PROGRAM.md` §8.

**One branch on disk is not in `main`: `portal-polish/d8`** (`.codex/worktrees/agent-pp-d8`,
head `23239266f`). It is **Wave 3c's lane**, reviewed in `waves/w3c/d8-review.md`, carrying the
designer-side date sweep and the `.da-score-on`-versus-hover fix that Wave 3b left owed. It is
pushed to origin and **not merged**. **Do not sweep it.** See `PROGRAM.md` §8.
