# Wave 3 — integration, gates, renders, deploy, merge

**Shipped 2026-09-08.** Six lanes merged, gates green, `patina-designer-portal` deployed, `main`
fast-forwarded. Worker version **`bf6a3679-40b5-4c24-8db2-7cc2348f145a`**; rollback id
**`6987d9ff-9154-453f-ae89-c7ab4c714d48`**.

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3` on
`portal-polish/integration-w3` (kept). `main` is `99906f992`.

---

## 0 · Waiting on Wave 2

Per the brief, no shared state was touched until Wave 2 wrote its ship report. A background
`until [ -f ship/w2-ship.md ]` loop polled for ~55 minutes; read-only preparation ran meanwhile
(plan, six lane reports, house sheet §A/§D/§F, designer `CLAUDE.md`, the specimen, lane diffs).

```
$ git -C /Users/kody/Code/patina-merged fetch origin        (sandbox off — SSH)
$ git log origin/main --oneline -5
5fdd83a34 docs(portal-polish): W2 ship report — the house page live on patina-client-portal
f5fd0aeb4 merge(portal-polish): wave 2 — the house page          ← the required subject
```

## 1 · Lane gate before merging

| Lane | Latest review | Unresolved P1 |
|---|---|---|
| D4 | `d4-rereview.md:204` **approve** | none |
| D3 | `d3-review.md:178` "No P1 or P2 findings" → **approve** | none |
| D1 | `d1-rereview.md` **needs-fix** — one **P2**, explicitly *not* a code defect | **none** |
| D2 | `d2-review.md:13` **approve**, no P1/P2 | none |
| D5 | `d5-review.md:8,187` **approve**, no P1/P2 | none |
| D6 | `d6-rereview.md:251` **approve**, no P1/P2 | none |

**D1's open P2 — signed off here, as the re-reviewer asked.** D1 added one line
(`jest.mock('@/hooks/use-answered-notes', …)`) to three suites outside its file list
(`desk/page.test.tsx`, `desk-hire-handoff.test.tsx`, `desk-roster-settle.test.tsx`). The re-review
verified there is no in-lane alternative — `useQueryClient()` throws synchronously with no
`QueryClientProvider` regardless of `enabled`, and the only other routes out are editing D2's/D3's
`desk/page.tsx` or abandoning React Query for the read — and asked that integration record the
sign-off rather than send D1 round again. **Recorded: the three added mocks are accepted.** They
changed no assertion and match the stub pattern those files already use for every other Desk feed.
The same seam then bit D3's *new* suite; see §2's seam commit.

No lane carried an unresolved P1, so the wave proceeded.

## 2 · Merges

Order as planned, real `--no-ff` merges, the merged lane's jest scope re-run after each.

| # | Commit | Subject | Conflicts | Jest after |
|---|---|---|---|---|
| 1 | `197c5c20c` | `chore(portal-polish): integrate d4 — action tiers, resting row rule, palette ARIA` | none | `src/components/document` + `src/lib/document` — **393 suites / 5067 tests** |
| 2 | `49d11fd89` | `chore(portal-polish): integrate d3 — the boards rail beside the roster head` | none | `desk` + `recent-boards-strip` — 3 suites / 24 tests |
| 3 | `fa2630a8d` | `chore(portal-polish): integrate d1 — the day's line` | none (`desk-roster.tsx` auto-merged — D4's `:110` line and D1's block are disjoint) | `desk-roster` + derivation + `src/hooks` + `desk` — 32 suites / 326 tests |
| 4 | `58e24f5d8` | `chore(portal-polish): integrate d2 — the two roster facets` | **5** — see below | `desk-roster` + derivation + `desk` — 4 suites / 102 tests |
| 5 | `3677665b5` | `chore(portal-polish): integrate d5 — the mobile bar loses its dwell timer` | none | `document/mobile` + `red-letter-zone` — 5 suites / 96 tests |
| 6 | `1648d8653` | `chore(portal-polish): integrate d6 — the concept render upload` | none | `concept-render-upload` — 1 suite / 10 tests |
| — | `e15c266b8` | `test(designer): stub the day's line read in D3's boards-rail suite` | — | see §3 |
| — | `809929243` | `fix(designer): keep the roster mounted across the 1280 boards-rail boundary` | — | see §4 |

**Commit-subject deviation, same as Wave 1's.** The plan names the subjects
`merge(portal-polish): integrate <lane> — …`. The repo's `commit-msg` hook
(`scripts/hooks/patina-hooks.mjs:155-158`) accepts only
`feat|fix|docs|style|refactor|perf|test|build|ci|chore` — `merge(` was rejected with
`[BLOCK] Commit subject must use Conventional Commits` on the first attempt (D4). The wording was
kept verbatim with the type changed to `chore`. No hook was bypassed; nothing used `--no-verify`.
(Wave 2's own `merge(portal-polish): wave 2` landed as a *merge* commit whose default subject begins
`Merge `, which the hook exempts; my wave-level merge to main used `chore(` for the same reason
Wave 1 did.)

### The D2 conflicts, and how each was resolved

All five were the disjoint-region conflicts the plan predicted, plus their two test files.

1. **`app/(document)/desk/page.tsx`** — D3 had lifted `<DeskRoster roster={roster} />` into a
   `rosterBlock` const; D2 wanted `studioMembers={studioMembers}` on the old call site. Resolution:
   kept D3's structure and moved D2's prop onto the `DeskRoster` inside `rosterBlock`, so both the
   wide-grid branch and the single column pass the members. Neither hunk dropped.
2. **`components/document/desk-roster.tsx` (imports)** — D1 converted the type-only import to a value
   import for `deriveDeskDayLine`; D2 added a second import statement for the facet helpers. Resolution:
   one import statement carrying both lanes' values and all five types.
3. **`components/document/desk-roster.tsx` (component body)** — D1 added `DayLineText` and the day's-line
   hooks; D2 added `FACET_CLASS`, `FacetAct`, the `studioMembers` prop and the facet state. Resolution:
   D1's `DayLineText` first, then D2's facet definitions, then one `DeskRoster` carrying D2's signature,
   `useSettleOnce()`, D2's facet state, D1's `useAnsweredNotes`/`dayLine` memo, then D2's derived
   values. In the JSX, D2's head row, then the untouched overdue sentence, then D1's day's-line block,
   then D2's three-way group render. Verified by reading the merged file, not by trusting git.
4. **`lib/document/desk-roster-derivation.ts`** — both lanes extend `RosterLine` (auto-merged: D2's
   `stage`/`designerId`, D1's `projectId`/`client`/`dueOn`/`needText`, all present, and both lanes'
   additions to the object literal in `deriveDeskRoster`) and both append a block at EOF. The EOF
   conflict shared one closing `}`; resolution gives each function its own brace and keeps both blocks.
5. **`desk-roster.test.tsx` / `__tests__/desk-roster-derivation.test.ts`** — git interleaved the two
   appended `describe` blocks around incidental common lines. Rather than hand-splice, both files were
   **rebuilt**: the merged (already-correct) shared prefix, then D1's new `describe` taken whole from
   `origin/portal-polish/d1`, then D2's taken whole from `origin/portal-polish/d2`. Confirmed first by
   diffing each lane's prefix against `origin/main` (both are pure additions — imports, D1's
   `mockAnsweredNotes`, D2's `STUDIO` fixture and `stage`/`designerId` on the fixture rows) and then by
   grepping the rebuilt prefix for every one of those additions. Result: `desk-roster.test.tsx` 742
   lines, three trailing describes; the derivation test 947+ lines with D1's day-line describe and D2's
   five facet describes, all present.

## 3 · Wave gates (integration worktree, real output)

Workspace dists were built first (`pnpm turbo build --filter=@patina/designer-portal^...` — 6 cached,
FULL TURBO; `packages/patina-design-system/dist`, `help-system/dist`, `api-routes/dist`, `types/dist`
all present; `@patina/supabase` is a source-entry package with no dist).

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 548 passed, 548 total
Tests:       6786 passed, 6786 total
Snapshots:   12 passed, 12 total
Time:        24.014 s
```

Wave-1 baseline was **544 suites / 6691 passed + 1 todo**. Now **548 / 6786, zero todo** — **+4 suites,
+95 tests, no suite lost, and A1's `terminal` `test.todo` is gone** (D4 folded it back into
`document-action.test.tsx`'s `it.each` table, exactly as A1's note asked).

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159    import/first
  use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks
```
The two known pre-existing errors, same rule and same line as the Wave-1 baseline. **Not grown.**

```
$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total · Tests: 63 passed

$ git diff --stat origin/main -- src/lib/document/__tests__/shadow-gate.test.ts eslint.config.mjs
(empty — both byte-unchanged)

$ pnpm --filter @patina/admin-portal build
… full route table emitted, exit 0
```

**One gate needed a fix before it could run**, unrelated to the wave: the admin build first failed
`Module not found: Can't resolve '@patina/api-client'` — `packages/api-client` has
`main: ./dist/index.js` and no dist in a fresh worktree, and it is not in
`@patina/admin-portal^...`'s turbo build output set. `pnpm --filter @patina/api-client build` fixed
it; the build above is the post-fix run. Worth knowing for the next fresh worktree.

### The cross-lane seam (`e15c266b8`)

The first full-suite run was **1 suite failed / 547 passed**: D3's new
`recent-boards-strip.test.tsx` mounts `DeskPage` with no `QueryClientProvider`, and D1's
`useAnsweredNotes` throws `No QueryClient set` on render. D1 patched the three suites that existed
when it ran; D3's suite is newer. Fixed with the same one-line stub D1 used in the other three, plus
D1's own comment. No assertion changed. This is the integration-side half of D1's signed-off P2.

## 4 · Renders

`artifacts/portal-polish-build-2026-09-08/waves/w3/renders/desk-render.mjs` signs in as the seeded
designer (`designer@patina.dev` / `password123`, from `e2e/fixtures/auth.ts`), dismisses the
walkthrough dialog, opens `/desk`, shoots full-page and exercises both facets.
`renders/render-report.json` carries the machine output.

**Local stack.** `pnpm supabase:reset` from the integration worktree (all seeds replayed).
`apps/designer-portal/.env.local` **could not be created** — the permission gate refuses writes to
`.env*` under the repo, and reading them is sandbox-denied. The build/serve env was therefore passed
inline instead: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` with the CLI's local demo anon key
from `supabase status` (never a prod key), plus `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. That is
strictly safer than a file — the local host is visible in the command that started the server.

**`next dev` could not serve `/desk` on this machine.** Three attempts produced ~26
`Watchpack Error (watcher): EMFILE: too many open files` and a `_not-found` 404 for every route —
route discovery never completed (macOS kqueue watcher exhaustion; `ulimit -n` is already 1048576, so
raising it changed nothing). The render pass therefore ran against `next build` + `next start -p 3000`
with the same inline env. Nothing else was on :3000 and the server was stopped afterwards.
**Deviation from the plan's "dev server", recorded deliberately** — a production build is if anything
the truer surface for a render pass, and `NEXT_PUBLIC_*` inlines the same way.

| File | Viewport | scrollWidth / clientWidth | Console errors on the signed-in Desk |
|---|---|---|---|
| `renders/desk-1440x900.png` | 1440×900 | 1440 / 1440 ✅ | 0 |
| `renders/desk-1440x900-facet-needs-me.png` | 1440×900, "Only what needs me" pressed | 1440 / 1440 ✅ | 0 |
| `renders/desk-1440x900-facet-by-person.png` | 1440×900, "By person" pressed | 1440 / 1440 ✅ | 0 |
| `renders/desk-1280x800.png` | 1280×800 | 1280 / 1280 ✅ | 0 |
| `renders/desk-390x844@2x.png` | 390×844 @2× | **437 / 390 ❌** | 0 |

**On the console errors.** The render script's tally lists two errors per viewport
(`TypeError: Failed to fetch` from `_getUser`, then `AppError: Not authenticated`). Both fire during
the *sign-in* navigation, before the session exists, and the URL has already flipped to `/desk` when
they land, so the filter caught them. A separate probe that signs in first and then **reloads
`/desk`** records **`[]` — zero console errors, zero page errors** on the signed-in Desk. That is the
number in the table.

### The 390 overflow is pre-existing, measured, not assumed

The Desk scrolls sideways at 390 (`scrollWidth 437`). Two independent checks say Wave 3 did not cause
it and does not widen it by one pixel:

1. **DOM surgery on the shipped build.** Removing D1's `[data-desk-day-line]` block → still 437.
   Also removing D2's facet row → still 437. Also restoring D4's previous job-name classes
   (`underline decoration-transparent …` in place of `no-underline`) → still 437. Hiding the roster
   entirely → **390**. D1's day-line block and D2's head row each measure exactly 336 wide, the
   container's own width.
2. **An `origin/main` build, measured the same way.** `git checkout origin/main -- apps/designer-portal/src`,
   rebuilt, re-served, re-signed-in: **1440 → 1440/1440, 1280 → 1280/1280, 390 → 437/390.** Identical.
   The tree was restored (`git checkout HEAD -- apps/designer-portal/src`) before the deploy.

The offender is a pre-existing roster row: `JobLine`'s state-sentence `<p class="… min-w-0 flex-1">`
next to a long unbreakable job name (`The Ashfords (no-login household)`) inside a `flex-wrap` `<li>`.
No D lane owns that markup and no lane's brief mentions it. **Not fixed here — owed to Kody.**

### One blocker found and fixed: the facet reset at 1280 (`809929243`)

D3's grid rendered `rosterBlock` in two *different* JSX positions —
`isWideDesk ? <div grid>{rosterBlock}…</div> : <>{rosterBlock}…</>`. React therefore unmounted and
remounted `DeskRoster` whenever the viewport crossed 1280, and D2's facet state (`useState`) reset
silently. Measured before the fix:

```
after click                                   {"needs":"true","rows":9}
after 8s idle                                 {"needs":"true","rows":9}
after resize 1440->1400 (same breakpoint)     {"needs":"true","rows":9}
after resize 1400->1100 (crosses 1280)        {"needs":"false","rows":17}   ← the facet is gone
```

Fixed minimally in D3's own region: one wrapper `<div>` in both states with `rosterBlock` always its
first child; only the grid classes and the rail's presence switch. After the fix, same script:

```
after resize 1400->1100 (crosses 1280)        {"needs":"true","rows":9}     ← survives
```

D3's two page-level tests still pass unchanged, and every gate in §3 was re-run after the fix — the
numbers quoted there are the post-fix ones. (This is also why the first pair of facet screenshots was
wrong: Playwright's full-page capture tripped the same remount. The screenshots in the table are
post-fix and correct.)

### What the renders prove, in the page's own words

At 1440, signed in, against the reset seed:

* **Head** — `EVERY JOB · 17 LIVE · 1 OVERDUE`, the scored rule mark to its left, and to the right two
  `aria-pressed="false"` tertiary acts, **Only what needs me** and **By person**. Labels do not change
  with state (IX18).
* **The day's line** — a rule, then two lines and a link: `Aspen Loft Refresh — project, overdue 4 days`
  (the clause after the dash in `--color-terracotta-ink`), `Marcus Wright · New lead — respond by Sep 11`
  (client name leading, as D1's fix required), `and 7 more below`. Every job name is an inline act with
  the resting oak rule. The seed carries **no `project_notes.answered_at` inside 24h, so the third
  line correctly does not render** — absence is silence, not a placeholder.
* **Only what needs me** — `aria-pressed="true"`, head becomes
  `… · SHOWING WHAT NEEDS YOU`, roster narrows **17 → 9 rows**, plates drop to `BRIEF · 4 /
  PROPOSAL · 1 / PROJECT · 3 / INSTALL · 1`. (The empty-result sentence `Nothing needs your hand today.`
  is in the served bundle but this seed never empties the facet.)
* **By person** — head becomes `… · BY PERSON`, the stage plates give way to a single person plate
  **`LEAH HARTWELL · 17`** in `--rail` with `--ink` label — no stage pigment, exactly as ruled.
* **No boards rail.** The `≥1280` grid *is* live (`grid-template-columns: 662px 260px` measured), but
  `useRecentBoards` resolves empty for this seed, so `RecentBoardsStrip compact` renders nothing at
  all. D3's absence behaviour, working; the rail's *content* is unproven against real boards.
* **Exactly one `box-shadow` on the page**, `NAV.doc-elevated` = `rgba(44,41,38,.08) 0 1px 2px` =
  `--elevation-sheet`. Confirmed untouched by the wave (`git diff origin/main -- globals.css` does not
  mention `doc-elevated` or `--elevation-sheet`) and it is the one declaration `shadow-gate.test.ts`
  permits. The other two computed shadows in the DOM are a Radix dialog and a focus ring, both
  pre-existing. Nothing Wave 3 wrote carries a shadow.

### Divergences from `specimens/designer-desk.html` (reported, not fixed)

1. **The 390 layout is not the specimen's.** §D says that at 390 the day's line comes *first, under the
   greeting, ahead of the roster head*, that stage plates go `position: sticky`, and that the action
   column drops under the state sentence at the row's right edge. None of the three is implemented —
   no D lane was given the mobile reflow. With the pre-existing 390 overflow above, this is the
   wave's largest open gap against the specimen.
2. **No dotted leader, no fixed 96px action column** (§D item 8). The row is name → state sentence →
   act, with the act right-aligned and no leader between. Pre-existing row grammar; no lane owned it.
3. **The overdue line's wording.** Specimen: `One thing is overdue — Vandersteen, install, since 4
   September`. Shipped: the untouched `overdueLine` sentence (`One thing is overdue — Aspen.`) above a
   day's line reading `Aspen Loft Refresh — project, overdue 4 days`. D1 declined the specimen wording
   because the pinned assertions at `desk-roster.test.tsx:16` and `desk-roster-derivation.test.ts:158`
   must stay green and the specimen phrasing creates an RTL query ambiguity against them. Accepted at
   re-review; recorded here.
4. **Dates are `Sep 11`, not `11 September`.** PP-2's one-date-style ruling was executed by H6 for the
   client portal only; no D lane was given a designer-side date sweep. The Desk still prints the
   portal's existing short form.
5. **The house sheet's `.t-*` classes do not exist in the designer portal.** It uses `doc-type-body`,
   `font-mono text-[11px]` and friends. D1 and D2 matched the sheet's *values* through the portal's own
   utilities. A real `.t-*` adoption in `globals.css` is a program-level gap that predates this wave.
6. **`--hairline-strong` is not defined in the designer portal**, so D1's day's-line rule uses
   `--doc-ink-border` (.18 alpha), the closest existing token. Same class of gap as the client
   portal's `--hairline` note in W2.
7. **The boards rail's caption/thumbnail treatment is unverified against real boards** (seed has none).
8. **The margin note and the walkthrough dialog compete on first sign-in.** The specimen shows the
   margin note (§D item 3); a fresh session shows the "This is your Desk" dialog over it, which also
   `aria-hidden`s the whole shell while open. Pre-existing chrome, untouched by this wave, but it is
   what a first-time designer actually sees.

## 5 · Deploy

```
$ npx wrangler deployments list --name patina-designer-portal     # BEFORE
… bottom row: 2026-09-08T14:53:19.231Z  6987d9ff-9154-453f-ae89-c7ab4c714d48   ← ROLLBACK ID

$ ./infra/deploy-portal.sh designer
==> [0/3] Preflight OK: RUNTIME REPOINT ACTIVE → https://api.patina.cloud (storage pinned direct)
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
Total Upload: 16928.02 KiB / gzip: 4134.52 KiB
Uploaded patina-designer-portal (28.39 sec)
Deployed patina-designer-portal triggers (0.95 sec)
Current Version ID: bf6a3679-40b5-4c24-8db2-7cc2348f145a
==> Done: designer portal deployed to production.

$ npx wrangler deployments list --name patina-designer-portal     # AFTER
… bottom row: 2026-09-08T23:56:34.337Z  bf6a3679-40b5-4c24-8db2-7cc2348f145a   ← NEW
```

**How the prod build env was supplied — and why not Wave 2's way.** Wave 2 copied the main checkout's
`apps/client-portal/{.env.local,.env}` into its worktree. That does not work for the designer portal:
`/Users/kody/Code/patina-merged/apps/designer-portal/.env.local` **points at `http://127.0.0.1:54321`**,
and the deploy script's preflight correctly refused it —
`ERROR: refusing to build designer portal — resolved NEXT_PUBLIC_SUPABASE_URL points at a local host`.
(Copying it in was refused by the permission gate anyway.) The script resolves an **exported** value
ahead of any env file, and `wrangler.jsonc`'s committed `vars` block is the documented source of truth
for prod portal env (CLAUDE.md; and the file's own comment instructs the deployer to export
`NEXT_PUBLIC_EDGE_API_URL`). So the eleven `NEXT_PUBLIC_*` literals from
`apps/designer-portal/wrangler.jsonc` were exported for the one invocation. `SUPABASE_ORIGIN_RUNTIME`
was left unset at build time (it is a Worker runtime var; the preflight's carve-out passed and the
banner above confirms the repoint is active).

**The inlined env was then verified against the pre-deploy bundle, not trusted.** All 36 chunks of
`https://app.patina.cloud/auth/signin` were downloaded before and after:

| String inlined in the served bundle | before | after |
|---|---|---|
| `https://bkvcixdmuyejfzcijpdg.supabase.co` | 1 chunk | 1 chunk |
| `api.patina.cloud` | 1 | 1 |
| `sb-bkvcixdmuyejfzcijpdg-auth-token` | 1 | 1 |
| `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG` | 2 | 2 |
| `us.i.posthog.com` | 3 | 3 |
| `client.patina.cloud` | 1 | 1 |
| `under_review` | 2 | 2 |

Exact parity. No white-screen class of regression (the incident `deploy-portal.sh`'s preflight exists
for) and no silently-dropped prod value.

**Rollback:** `npx wrangler rollback 6987d9ff-9154-453f-ae89-c7ab4c714d48 --name patina-designer-portal`.

## 6 · Smoke

1. **Bottom row is the new deployment** — `bf6a3679…`, 2026-09-08T23:56:34Z. ✅
2. **The served chunks carry the wave's strings.** The Desk's route chunk was named from the bundle
   this deploy actually uploaded (`.open-next/assets/_next/static/chunks/app/(document)/desk/page-102b00d4d4a2a823.js`)
   and then fetched **from prod** (`200`, 63,533 bytes):

   | String | Occurrences in the served desk chunk |
   |---|---|
   | `Only what needs me` | 1 |
   | `By person` | 1 |
   | `Nothing needs your hand today` | 1 |
   | `showing what needs you` | 1 |
   | `more below` | 1 |
   | `roster-facet-needs-me` | 1 |
   | `roster-facet-by-person` | 1 |

   D6 likewise, from the served `app/(document)/doc/[id]/page-739c1bd3dd57b999.js` (`200`, 738,801
   bytes): `Add a concept render` ×1, `Concept \xb7 not installed` ×1, `Replace` ×1.
3. **`npx wrangler tail patina-designer-portal`** for ~60s while loading `/auth/signin` and `/desk`
   five times each: **10 events, all `outcome: ok`, zero exceptions, zero error logs**, statuses
   200×5 / 307×5, every event stamped `scriptVersion bf6a3679-40b5-4c24-8db2-7cc2348f145a`.
   No error spike.
4. **Signed-in prod walk — NOT done.** `apps/designer-portal/e2e/fixtures/auth.ts:14-15` carries only
   the local seed (`designer@patina.dev` / `password123`, overridable by
   `DESIGNER_E2E_EMAIL`/`_PASSWORD`, unset), and `playwright.config.ts:48` pins `baseURL` to
   `http://localhost:3000`. No `patina.cloud` host and no prod credential appear anywhere under
   `apps/designer-portal/e2e/`. **Owed to Kody: signed-in prod walk of the Desk.**

## 7 · Merge to main

```
$ git push -u origin portal-polish/integration-w3
 * [new branch]  portal-polish/integration-w3

$ git worktree add .../agent-pp-main3 -b portal-polish/to-main-w3 origin/main
HEAD is now at 96984498f docs(design): client invite first touch — proposal "The First Letter"

$ git merge --no-ff origin/portal-polish/integration-w3 -m "chore(portal-polish): wave 3 — the Desk"
99906f992   (32 files changed, 4597 insertions(+), 168 deletions(-), no conflicts)

$ git push origin portal-polish/to-main-w3 && git push origin portal-polish/to-main-w3:main
   96984498f..99906f992  portal-polish/to-main-w3 -> main

$ git merge-base --is-ancestor origin/portal-polish/integration-w3 origin/main
CONFIRMED: integration-w3 is an ancestor of origin/main
```

`main` = **`99906f992`**. `main` had moved during the wave (`96984498f`, a docs-only commit); the merge
was clean. `agent-pp-main3` removed after the push.

## 8 · What was NOT verified

* No signed-in walk against production (§6.4).
* The boards rail's *content* — the seed has no recent boards, so only its absence behaviour was seen
  live. D3's unit tests cover the three-board, 92px compact variant.
* The `Nothing needs your hand today.` empty-facet sentence and the day's line's third (answered-note)
  line were never reached by this seed; both are covered by unit tests and present in the served bundle.
* D6's upload path was not exercised against a real bucket — no file was uploaded to `room-renders`
  in prod or locally. The component's tests cover the client-side gate; the bucket's own limits were
  verified in Wave 1.
* No e2e run. The designer portal's Playwright suite is not in the Wave 3 gate list.
* Prettier drift is unresolved and advisory (the pre-commit hook warned on the merge commits).

## 9 · Owed to Kody

* **Signed-in prod walk of the Desk** — no prod tester credential exists in the repo.
* **The 390 Desk.** Two separate things, both pre-existing and neither in any lane's brief:
  the horizontal overflow (`437 / 390`, measured identically on `origin/main`), and the specimen's
  whole mobile reflow (day's line first, sticky plates, action column under the sentence). Worth its
  own lane.
* **A ruling on the overdue line's wording** (divergence 3) — the specimen's phrasing versus the two
  pinned assertions D1 had to keep green.
* **A ruling on designer-side dates** (divergence 4) — PP-2's "11 September 2026" reached the client
  portal only.
* **`--hairline-strong` in the designer portal** (divergence 6): add the alias or bless
  `--doc-ink-border`, the way W2 asked for `--hairline`.
* **The `.t-*` type-step classes** (divergence 5) — the sheet's named steps exist in neither portal as
  classes; both waves matched values through local utilities. A cross-portal decision.
* **`reconnect_due` in the lead slot** — D1's re-review left this an open product question, now tested
  as a deliberate exclusion: does a client due for a reconnect belong on the day's line?
* **No index on `project_notes.answered_at`** — D1's new 60s poll filters `gte('answered_at', …)` with
  no supporting index (`00565` indexes `(project_id, sent_at DESC)` only). Inert at studio scale; on
  record for when it isn't.
* **The walkthrough dialog `aria-hidden`s the whole Desk while open** (divergence 8). Pre-existing, but
  it means a first-time designer's screen reader sees nothing behind it.
* **`next dev` cannot serve this app on this machine** (EMFILE watcher exhaustion). Every render pass
  from here needs `next build` + `next start`, or the watcher limit raised.

## 10 · Worktrees

* `agent-pp-int3` (`portal-polish/integration-w3`) — **kept**, dists built, `.next` from the prod build.
* `agent-pp-main3` (`portal-polish/to-main-w3`) — **removed** after the push.
* Left for the orchestrator's sweep: `agent-pp-a1`, `agent-pp-a2`, `agent-pp-h1`…`h6`,
  `agent-pp-d1`…`d6`, `agent-pp-int`, `agent-pp-int3`.
