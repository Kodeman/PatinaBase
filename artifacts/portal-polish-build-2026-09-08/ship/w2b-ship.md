# Wave 2b ship report — house-page follow-ups (client portal)

**Shipped 2026-09-09 (00:52 UTC).** One lane (H7) merged, two integration fixes on top, gates
green, `patina-client-portal` deployed, `main` advanced. Worker version
**`a787400e-e4e7-4d72-a0ca-4d6a188336b3`**; rollback id
**`99bc3971-d33d-47da-ac72-97112d71b1c9`** (Wave 2's deployment).

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int2b` on
`portal-polish/integration-w2b` (kept). `main` is `cdb81ebf3`.

---

## 1 · The lane gate before merging

`waves/w2b/h7-rereview.md` carries **needs-fix**, and the brief's stop condition is an unresolved
**P1**. The re-review's single finding is explicitly **P2** ("Why P2, not P1" is argued in the
report: the three call sites it names are conditional surfaces, not the structural ones the first
review caught, and none is the headline figure). No P1 stands anywhere in the H7 chain — the first
review's P1 was fixed and verified in code by the re-reviewer. **The wave proceeded; the P2 is
recorded as owed in §7 and was not written by this lane**, because the integration lane writing a
fix nobody then reviews would break the program's implementer/reviewer separation one step before
production.

Two exceptions were unavoidable and are in §2: both were red gates, not review findings.

---

## 2 · Merge, and the two fixes integration had to make

```
$ git -C .../agent-pp-int2b merge --no-ff origin/portal-polish/h7 \
      -m "chore(portal-polish): integrate h7 — wave 2 follow-ups"
2e1d75821   38 files changed, 955 insertions(+), 247 deletions(-)   — NO CONFLICTS
```

The plan's `merge(portal-polish): …` subject is refused by the `commit-msg` hook
(`scripts/hooks/patina-hooks.mjs:155-158`, the same trap W1 and W3 hit and PROGRAM.md §4 item 22
already records), so the lane merge took Wave 3's `chore(portal-polish): …` form. The merge onto
`main` **did** keep `merge(portal-polish): …` — git's own merge commit is not passed through that
hook, which is why W2's main merge could keep the subject and the lane merges could not. Worth
correcting in PROGRAM.md's item 22: the hook rejects `merge(...)` on a *normal* commit only.

Then `e82e06af8 fix(client): the piece plate carries its cents, and the e2e counts the due day on
the seed's calendar` — three files, both changes forced by a red gate:

**(a) The piece plate still printed whole dollars, and H7's own e2e went red on it.**
H7 raised `AUTHORIZATION_TOTAL` from `$8,120` to `$8,120.00` in `tests/threshold.spec.ts` but did
not convert the component that renders that figure. `instruments/tracking-row.tsx:128` carried its
own formatter with `maximumFractionDigits: 0`, so a room band printed

> `$11,100.00 agreed · two pieces` …  `Reading chair, oiled oak and shearling` **`$8,120`**

— two money idioms inside one block, which is precisely the §F-B fault the wave exists to remove,
and it was rendering at rest on every client's page. The local formatter is gone; the row calls the
same `formatCurrency` from `@patina/shared` that `room-band.tsx` (its only consumer) already uses.
`open-chapter.test.tsx:256-259` was pinning `$8,400` under the test name "in whole dollars"; both
the name and the assertion now read cents. Confirmed in the render (§4): the plates read
`$8,120.00` and `$2,980.00`, matching the specimen exactly.

**(b) `INVOICE_DUE_DAY` counted the seven days on the wrong calendar.**
The seed dates the invoice `CURRENT_DATE + 7` and Postgres runs in **UTC**; the spec counted from
the runner's **local** clock. They name the same day for most of the day and different days every
evening west of Greenwich. At 19:38 CDT on 8 September the constant asked for `15 September 2026`
while the seeded invoice said `16 September 2026`, and the suite went red on the clock alone — a
latent flake that predates H7 (H7 only added the year to the format). The constant now counts on
the UTC calendar and formats with `timeZone: 'UTC'`, the way the seed counts.

Neither change is a review finding applied silently: (a) was a failing assertion H7 wrote, (b) was
a failing assertion the wall clock produced.

---

## 3 · Wave gates (integration worktree, real output)

**Local stack.** The worktree has **no `apps/client-portal/.env.local` at all**, and that is the
safer state, not a gap: `playwright.config.ts:60-68` pins the dev server's
`NEXT_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:54321` and the CLI's fixed demo anon key in the
config itself, precisely so a `.env.local` that has pointed at Strata prod before cannot reach the
suite. Verified local before every destructive action:
`supabase status` → `API_URL http://127.0.0.1:54321`. (For the record: creating the file was also
blocked by this environment's `Edit(/**/.env.*)` deny rule; nothing was worked around.)

```
$ pnpm supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

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
metric clears it. Lint is **byte-identical to the Wave 2 baseline** (63 problems, 11 errors, 52
warnings); the 11 errors are React-compiler rules in files no lane in this wave touched. Wave 2
shipped 142 suites / 2417 tests; this wave ships **143 / 2427**.

### e2e — `tests/threshold.spec.ts`, 22/22

```
$ export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | … SERVICE_ROLE_KEY)"
$ npx playwright test tests/threshold.spec.ts --reporter=list --workers=1
  22 passed (3.2m)
```

Nothing else was on :3002 (checked with `lsof -ti :3002` before each run; the dev server used for
the renders was killed before and after).

**The service-role key is required for this suite and is not optional.** Without it exported,
`POST /api/proposals/<id>/sign` returns **500** — `SUPABASE_SERVICE_ROLE_KEY is not set — cannot
create service client` (`packages/supabase/src/server.ts:57`, reached from
`app/api/proposals/[id]/sign/route.ts:394`) — and "signs a composed agreement at its door" fails at
`toHaveCount(0)` with the door still open. That failure is **not** the fixture-consumption trap the
spec's header warns about, and it survives a fresh `supabase db reset`; the proposal stays `sent` in
the database. `playwright.config.ts:15` reads the key from the environment on purpose (the repo's
secret scan rejects a service_role JWT in a committed file), and its comment says to export it —
so it is a run-book step, not a defect. **It belongs in the plan's e2e instructions.**

**The wall gate's seeded amount is confirmed in e2e**, and H7 had already written the assertion — no
addition was needed. `threshold.spec.ts:865-868`:

```ts
await expect(consequence).toContainText(`Accepting releases ${HELD_DRAW} to ${MAKER}`);
await expect(
  page.getByRole('button', { name: new RegExp(`accept the finished work · \\${HELD_DRAW}`, 'i') }),
).toHaveCount(1);
```

with `HELD_DRAW = '$2,980.00'` — green, so the seeded `gates_on_acceptance` draw does make the wall
print **"Accept the finished work · $2,980.00"**. PROGRAM.md §4 item 18 is closed.

---

## 4 · Renders

`artifacts/portal-polish-build-2026-09-08/waves/w2b/renders/render.mjs` (Wave 2's script, output
path and filenames changed) signs in as `client-solo@patina.dev` and opens Cedar Lane Study on a
freshly reset database.

| File | Viewport | scrollWidth / clientWidth | Console errors |
|---|---|---|---|
| `renders/house-w2b-1440x900.png` | 1440×900 | **1440 / 1440** | 2, both local-stack |
| `renders/house-w2b-390x844@2x.png` | 390×844 @2× | **390 / 390** | 1, local-stack |

**No horizontal overflow at either width**, and every landmark resolves to an element that renders
(`#doorstep #changed #letterbox #wall #mat-papers`); all twelve anchors present; `Sign out` once;
owed figure `$4,060.00`; wall consequence
`Accepting releases $2,980.00 to Marta Voss for the finished work…`.

**Zero console errors originate in the app.** Both classes are the local stack and neither can
occur in production, and this run identified the one W2 could only describe:

* CSP `img-src` refusing `http://127.0.0.1:54321/storage/v1/object/public/product-images/…` — the
  policy at `next.config.js:126` allows `https:`, and prod storage is https.
* `net::ERR_CONNECTION_REFUSED` on **`http://localhost:3000/api/auth/qr/generate`** — the designer
  portal, which is not running. Captured by URL in a separate instrumented pass, so it is no longer
  an unattributed "a local service".

### Compared to `specimens/client-house.html`

**Closed by this wave** (Wave 2's numbering in `w2-ship.md` §4):

1. **Cents (W2 divergence 1) — closed.** The money block reads `$4,060.00`, `$11,100.00 agreed ·
   $0.00 paid · $4,060.00 owed`, `Held on finished work $2,980.00`, `Awaiting your name
   $11,000.00`, the letterbox `INV-2026-0301 · $4,060.00 total · $0.00 paid`, and — after §2(a) —
   the piece plates `$8,120.00` / `$2,980.00`.
2. **The due date spells its year (W2 divergence 2) — closed.** "due 16 September 2026".
3. **The wall act carries its amount (W2 divergence 5) — closed.** "Accept the finished work ·
   $2,980.00" over "Accepting releases $2,980.00 to Marta Voss…", from the seeded draw.
4. **The story pole's held tick no longer touches its label (W2 divergence 7) — closed.**
5. **"You are in: You stand at the doorstep" (W2 divergence 8) — closed.** The ≤600px bar reads
   **"YOU ARE IN: THE DOORSTEP"**, on one line with the six chapter dots beside it.
6. **"Leave the house" is gone from the portal (W2 divergence 9) — closed.**
   `ProjectsEmptyState.tsx:66` says "Sign out"; `grep -rn "Leave the house" apps/client-portal/src`
   returns nothing, and the served prod chunk carries it zero times.

**Still divergent:**

1. **The plan key prints whole dollars.** `Cedar Lane — Phase Work — $11,000, your name.` and
   `Built-in shelving, north wall — $2,980, held back until you accept it.` sit one screen below a
   block printing `$11,000.00`. `plan-key.tsx:106` uses `moneyInWords`. H7 disclosed this and left
   it for a ruling, correctly: the open question is the **register** one W2 already logged
   (`moneyInWords` in prose vs `formatCurrency` on a rule), not an oversight. **This is the most
   visible remaining fault on the page.**
2. **Three more prose surfaces do the same** — the re-review's P2: `road-orders.tsx:126,164`,
   `scope-change-ask.tsx:109,139,425`, `review-ask.tsx:514`. All three mount inside `threshold.tsx`
   but render only conditionally, so none is in this fixture's render.
3. **The money block is still two sections, not one** (W2 divergence 3) — `#ledger` and
   `#letterbox` are both on the no-rename list; merging them is a program decision.
4. **The Pay terminal act is still one disclosure deep** (W2 divergence 4).
5. **Two landmark targets differ from the specimen** (W2 divergence 6) — the plan's H3 table
   outranks the specimen here.
6. **The note's signature prints two parts, not three.** It reads *"Local Dev Studio · 7 September
   2026"* where the specimen reads *"Leah Hartwell · Local Dev Studio · 3 September 2026"*. **The
   code is right and the fixture is short**: `threshold.tsx:723-726` reads the lead from the
   project team, `project_team_members` for this project is **empty** on the seed, so
   `leadDesignerName` is null, `authorName` falls back to `studioName`, and H7's `signatureOf`
   correctly drops the duplicate segment rather than stuttering the studio twice. Seed a
   `lead_designer` and the three-part signature appears. This is the same shape as the draw H7
   seeded for the wall.
7. **The key's callout label truncates** — "Built-in shelving, no…" inside the drawing, where §A
   says wrap, not truncate. Cosmetic, inside an SVG callout; flagged, not fixed.

---

## 5 · Deploy

```
$ npx wrangler deployments list --name patina-client-portal          # BEFORE
… bottom row: 2026-09-08T23:06:54Z  99bc3971-d33d-47da-ac72-97112d71b1c9   ← ROLLBACK ID

$ ./infra/deploy-portal.sh client
Total Upload: 12784.00 KiB / gzip: 2548.03 KiB
Uploaded patina-client-portal (23.59 sec)
Deployed patina-client-portal triggers (1.10 sec)
Current Version ID: a787400e-e4e7-4d72-a0ca-4d6a188336b3

$ npx wrangler deployments list --name patina-client-portal          # AFTER
… bottom row: 2026-09-09T00:52:05Z  a787400e-e4e7-4d72-a0ca-4d6a188336b3   ← NEW
```

**How the prod build env was supplied.** The worktree has no `.env` files, so rather than copying
prod secrets around (and rather than fighting the `.env.*` deny rule), the twenty-one committed
literals in `apps/client-portal/wrangler.jsonc` `vars` were exported into the deploy shell. The
preflight resolves an exported `process.env` value first and by design
(`infra/deploy-portal.sh:68-90`), so the bundle is inlined from exactly the values the Worker
serves at runtime — no third source of truth. The deploy log confirms them
(`NEXT_PUBLIC_SUPABASE_URL https://bkvcixdmuyejfzcijpdg.supabase.co`, `NEXT_PUBLIC_ENV production`,
`NEXT_PUBLIC_APP_URL https://client.patina.cloud`). `NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE` is unset
and defaults to `'live'` (`src/lib/env.ts:6`) — no mock fallback shipped. This is a cleaner recipe
than W2's file-shuffling and is worth adopting; see §7.

**Rollback:** `npx wrangler rollback 99bc3971-d33d-47da-ac72-97112d71b1c9 --name patina-client-portal`.

---

## 6 · Smoke

1. **Bottom row is the new deployment** — `a787400e…`, 2026-09-09T00:52:05Z. ✅
2. **Served chunk.** `https://client.patina.cloud/auth/signin` → 200; the house page's components
   ride `common-67fea7f77e50297d.js` (fetched from prod, 1,044,958 bytes, 200). W2's chunk
   `common-8c32fab7858db855.js` now 404s — it was superseded, which is itself proof the bundle
   changed.

   | String | Occurrences |
   |---|---|
   | `Sign out` | **4** (W2 shipped 3; +1 is the `ProjectsEmptyState` rename) |
   | `Leave the house` | **0** (W2 shipped 1) |
   | `Accept the finished work` | 3 |
   | `Accepting releases` | 2 |
   | `The house stands at` | 3 |
   | `Prepared by` | 1 |

   **A literal `$2,980.00` cannot appear in any chunk** — every figure on this page is composed at
   runtime by `Intl.NumberFormat`, and a scan of the served chunk finds no `$<digits>.00` literal
   at all. The cents change is provable in the bundle by its formatter instead, and it is: the
   tracking-row module (located by its `drawing by` caption, 426 bytes from
   `data-testid="tracking-row-price"`) contains **zero** occurrences of `maximumFractionDigits:0`
   within ±25 KB — the whole-dollar formatter §2(a) removed is gone from the shipped code, and the
   plate figure now calls the shared helper.
3. **`npx wrangler tail patina-client-portal`** for ~60s while loading `/auth/signin` and `/` five
   times each: **10 events, all `outcome: ok`, zero exceptions, zero error logs**, statuses 200×5 /
   307×5, every event stamped `scriptVersion a787400e-e4e7-4d72-a0ca-4d6a188336b3`. **No error
   spike.**
4. **Signed-in prod walk — NOT done.** Unchanged from W2: the only credentials in the repo are the
   local seeds, and `playwright.config.ts` pins the suite at `localhost:3002`. **Owed to Kody.**

---

## 7 · Merge to main

```
$ git push origin portal-polish/integration-w2b            # e82e06af8
$ git -C /Users/kody/Code/patina-merged worktree add .../agent-pp-main2b \
      -b portal-polish/to-main-w2b origin/main
$ git merge --no-ff origin/portal-polish/integration-w2b \
      -m "merge(portal-polish): wave 2b — house page follow-ups"       # cdb81ebf3
$ git push origin portal-polish/to-main-w2b:main
   8a91f69a8..cdb81ebf3  portal-polish/to-main-w2b -> main

$ git merge-base --is-ancestor origin/portal-polish/integration-w2b origin/main   → ANCESTOR
$ git merge-base --is-ancestor origin/portal-polish/h7 origin/main                → ANCESTOR
```

`main` moved during the wave — `8a91f69a8 docs(design): first letter — rulings R1–R13 recorded`
landed after this worktree was cut from `2b3da787f`. It is docs-only
(`git diff --stat 2b3da787f..origin/main -- apps/client-portal packages` is empty), so the merge
went onto the newer tip rather than rewinding it. `main` = **`cdb81ebf3`**.

---

## 8 · Owed

**New, from this wave:**

* **A ruling on money in prose.** `plan-key.tsx:106`, `road-orders.tsx:126,164`,
  `scope-change-ask.tsx:109,139,425`, `review-ask.tsx:514` still call `moneyInWords`. This is the
  re-review's open **P2** plus H7's disclosed `plan-key` gap, and it is one question, not five:
  *does a figure inside a sentence carry cents?* §F-B says every figure in a money block does; these
  are in prose, not in a block. Rule it once and one pass closes all six call sites. Until then the
  plan key prints `$11,000` a screen below `$11,000.00`.
* **Seed a `lead_designer`** on `project_team_members` for Cedar Lane Study, so the note's
  three-part signature (H1/H7) can be seen and pinned. Today the fixture cannot show it.
* **Export `SUPABASE_SERVICE_ROLE_KEY` before running `threshold.spec.ts`** — without it the signing
  test fails with a 500 that looks like a regression. Put it in the plan's e2e step.
* **The key's SVG callout truncates** ("Built-in shelving, no…") against §A's no-truncation rule.
* **Two PROGRAM.md corrections.** §4 item 18 (seed a gating draw) is **closed** by H7. §4 item 17
  (`<TheNote studioName>`) is **closed in code** by H7 and now blocked only by the fixture above.
  §4 item 22 overstates the hook: `merge(...)` is refused on a normal commit but accepted on a
  git merge commit, which is why every main merge in this program could keep the subject.

**Carried, unchanged:**

* **Signed-in prod walk of the house page** — no prod credential exists in the repo.
* The specimen's one-section money block, the Pay act at rest, and the two landmark targets — all
  three are program decisions, not lane work.
* `--hairline` is settled: `globals.css:87` is the sheet's own `#E8E3DB` literal, verified
  byte-identical to `docs/design/house-sheet/SPEC.md:47`.

**Scope of this deploy:** the client portal only. No migration, no edge function, no other Worker;
`git diff` against `supabase/migrations/` is empty and Strata is untouched. The only database
change in the wave is `supabase/seed/the-client-page.sql`, which is local seed data.
