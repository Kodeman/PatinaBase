# Wave 3b — integration, gates, renders, deploy, merge

**Shipped 2026-09-09.** Two lanes merged (**A3**, **D7**), one integration fix, gates green,
`patina-designer-portal` deployed, `main` advanced. Worker version
**`cf67abe9-65e1-4818-b7d1-8eaa9943d93d`**; rollback id **`bf6a3679-40b5-4c24-8db2-7cc2348f145a`**
(Wave 3's deployment).

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3b` on
`portal-polish/integration-w3b` (kept — it holds the prod `.next` build). `main` is **`3ca24f6b2`**.

**The headline, said plainly.** The wave's stated acceptance criterion — *the Desk no longer scrolls
sideways at 390* — was **not met by the two lanes as delivered**. It is met now, by a one-line
integration fix this wave measured its way to. D7's roster-name change turns out to be **inert** on
the seed; the binding constraint was the sibling state sentence. See §5. Everything else the two
lanes claimed is true and holds up under a live render.

---

## 0 · Waiting on Wave 2b

Per the brief, nothing shared was touched until Wave 2b wrote its ship report. A poll loop watched
for `ship/w2b-ship.md` for ~19 minutes; read-only preparation ran meanwhile (the plan's Global
constraints / Shared-state table / Wave 3 section, house sheet §A + §F, designer `CLAUDE.md`,
`ship/w3-ship.md`, `waves/w3/d1-rereview.md`, `d4-impl.md` off `origin/portal-polish/d4`, both
Wave 3b lane reviews, and Wave 3's render script).

```
$ git -C /Users/kody/Code/patina-merged fetch origin      (sandbox off — SSH is blocked in-sandbox)
$ git log origin/main --oneline -3
a037cffd6 docs(portal-polish): W2b ship report, program report, and the house renders
cdb81ebf3 merge(portal-polish): wave 2b — house page follow-ups     ← the required subject
8a91f69a8 docs(design): first letter — rulings R1–R13 recorded, deck amended
```

## 1 · Lane gate before merging

| Lane | Latest review | Verdict | Unresolved P1 |
|---|---|---|---|
| A3 | `waves/w3b/a3-review.md` | **approve**, "No P1/P2 findings" | none |
| D7 | `waves/w3b/d7-review.md` | **approve**, "No P1 or P2 findings" | none |

Neither lane has a `-rereview.md`; the single review round is the latest for each, and both are
approvals. Three P3s on A3 (a whole-file Prettier reformat that flips the file's quote style away
from its 119 single-quoted neighbours; two unrelated reformat hunks in `index.ts`; the read hook
querying `project_rooms` directly rather than through the client-authorized RPC) and four on D7
(the `.da-score-on`/`:hover` specificity trade; `WEEKDAY_FORMAT` composing with en-GB helpers; the
residual `fmtDay` idiom; a class-string assertion jsdom forces). All are carried forward in §9, none
blocked the wave.

## 2 · Merges

Real `--no-ff` merges onto `portal-polish/integration-w3b`, cut from `origin/main` `a037cffd6`.
**Neither merge produced a conflict** — A3 is confined to `packages/supabase`, D7 to
`apps/designer-portal`, and no other lane has touched either region since Wave 3 landed.

| # | Commit | Subject | Conflicts |
|---|---|---|---|
| 1 | `96914883a` | `chore(portal-polish): integrate a3 — concept-render record + remove hooks` | none |
| 2 | `0d408463a` | `chore(portal-polish): integrate d7 — Desk follow-ups from Wave 3` | none |
| — | `0b0d49778` | `fix(designer): the roster state sentence wraps too — the Desk stops scrolling sideways at 390` | — (see §5) |

Both lane heads verified present: `git merge-base --is-ancestor e58e98421 HEAD` (A3) and
`7841fda9b` (D7) both true.

**Commit-subject deviation, and the exact rule.** The plan names lane merges
`merge(portal-polish): integrate <lane> — …`. The first attempt (A3) was refused —
`[BLOCK] Commit subject must use Conventional Commits`, `scripts/hooks/patina-hooks.mjs:155-158`,
which allows only `feat|fix|docs|style|refactor|perf|test|build|ci|chore`. The wording was kept
verbatim with the type changed to `chore`, as W1 and W3 did. **The wave-level merge onto `main`
kept `merge(portal-polish): wave 3b — Desk follow-ups` exactly** — W2b's correction to PROGRAM §4
item 22 is right: the hook refuses `merge(` on a *normal* commit and accepts it on a *git merge*
commit. Nothing used `--no-verify`; no hook was bypassed.

## 3 · Wave gates (integration worktree, real output)

Workspace dists built first: `pnpm turbo build --filter=@patina/designer-portal^...` (6 tasks, all
cached, FULL TURBO) then `pnpm --filter @patina/api-client build` — the fresh-worktree gap W3's
report named as item 21.

```
$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                                       (exit 0, no output)

$ pnpm --filter @patina/supabase test
Test Files  94 passed (94)
     Tests  1163 passed | 12 skipped (1175)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                       (exit 0, no output)

$ pnpm --filter @patina/designer-portal test -- --ci     (at the two merges)
Test Suites: 549 passed, 549 total
Tests:       6806 passed, 6806 total
Snapshots:   12 passed, 12 total
Time:        25.903 s

$ pnpm --filter @patina/designer-portal test -- --ci     (after the §5 fix — the shipped number)
Test Suites: 549 passed, 549 total
Tests:       6807 passed, 6807 total
Snapshots:   12 passed, 12 total
```

Wave-3 baseline was **548 suites / 6786 passed / 0 todo**. Now **549 / 6807** — **+1 suite
(`dates.test.ts`), +21 tests, no suite lost, no todo introduced.**

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159    import/first
  use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks
```
The two known pre-existing errors — same rules, same files, same lines as the Wave-3 baseline, and
the total count is unchanged at 205. **Not grown.**

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts \
    src/lib/document/__tests__/action-rest-rules.test.ts
Test Suites: 4 passed, 4 total · Tests: 74 passed

$ git diff origin/main --stat -- .../shadow-gate.test.ts .../contrast.test.ts \
    .../rail-stock.test.ts apps/designer-portal/eslint.config.mjs
(empty — all four byte-unchanged)

$ pnpm --filter @patina/admin-portal build          exit 0, full route table emitted
$ pnpm --filter @patina/client-portal type-check    exit 0
```

**One gate needed a build first, and it is a new instance of a known trap.** The client-portal
type-check failed at first with `Cannot find module '@patina/aesthete-quiz'` (plus six downstream
errors). `packages/aesthete-quiz` resolves through a `dist` that a fresh worktree does not have and
that `@patina/designer-portal^...` does not build. `pnpm --filter @patina/aesthete-quiz build` fixed
it; the exit-0 above is the post-fix run. This is the same shape as PROGRAM §4 item 21
(`@patina/api-client`), so the fresh-worktree preamble is now **two** packages, not one. A3's own
reviewer hit and worked around the same gap independently.

## 4 · Renders

`waves/w3b/renders/desk-render.mjs` reuses Wave 3's script — same sign-in as the seeded designer
(`designer@patina.dev` / `password123`, from `e2e/fixtures/auth.ts`), same walkthrough dismissal,
same overflow probe — and adds the two surfaces this wave owes. `probe.mjs`, `bisect-390.mjs`,
`row-anatomy-390.mjs` and `d7-effect-390.mjs` beside it carry the measurements §5 rests on; every
number below has a committed JSON next to it.

**Local stack.** `pnpm supabase:reset` from the integration worktree, after confirming the local
host: `npx supabase status` → `API_URL: http://127.0.0.1:54321`, `linked_project: null`. All seeds
replayed. The build/serve env was passed **inline** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
plus the CLI's local demo anon/service keys and `SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`) — never a prod key, and the local host is visible in
the command that started the server. `next build --webpack` + `next start -p 3000`, per W3's
finding that `next dev` cannot serve this app on this machine (PROGRAM §4 item 19). Port 3000 was
free before and the server was stopped after.

| File | Surface | Viewport | scrollWidth / clientWidth |
|---|---|---|---|
| `renders/desk-1440x900.png` | `/desk` | 1440×900 | 1440 / 1440 ✅ |
| `renders/doc-1440x900.png` | `/doc/006a08f4-aa39-4fcb-8e02-ee3506efb1cb` | 1440×900 | 1440 / 1440 ✅ |
| `renders/orders-ledger-1440x900.png` | Orders ledger (studio drawer sheet) | 1440×900 | 1440 / 1440 ✅ |
| `renders/desk-390x844@2x.png` (+ `-viewport`) | `/desk` | 390×844 @2× | **390 / 390 ✅** |

**Console errors: zero.** Measured the way W3's report established as honest — sign in first, then
navigate to the surface under test, so the sign-in page's own pre-auth `_getUser` failure cannot be
charged to it. `probe-report.json` → `{"desk":{"consoleErrors":[],"pageErrors":[]},"doc":{…[]},
"orders":{…[]}}`. (The looser filter in `render-report.json` still shows the two known pre-auth
lines per viewport; they land on the `/desk` URL during the sign-in navigation and are the same pair
W3 documented.)

**Shadows: one, the permitted one.** A sweep of every element's computed `box-shadow` on the signed-in
Desk returns exactly `NAV.doc-elevated → rgba(44,41,38,.08) 0 1px 2px` = `--elevation-sheet`, the
single declaration `shadow-gate.test.ts` allows. Nothing this wave wrote carries a shadow. The Orders
ledger sheet is separated by a dimmed backdrop and paper value, not depth.

### What the renders prove, in the page's own words

* **The greeting is en-GB** — `TUESDAY · 8 SEPTEMBER`, not `SEPTEMBER 8`. D7's `WEEKDAY_FORMAT` +
  `dayMonth`, live.
* **The day's line leads with the client, in one date style** —
  `Marcus Wright · new lead — respond by 11 September`, above
  `Aspen Loft Refresh — project, overdue 4 days` (clause after the dash in `--color-terracotta-ink`)
  and `and 7 more below`. The job title `Full Room` appears nowhere on that line. This is the exact
  divergence D1's re-review and `w3-ship.md` §4 items 3–4 left owed, closed and visible.
* **The `.da-score-hover` rest rule is visible at rest, on real consumers.** The Orders ledger carries
  **20** of them on one sheet. Two measured by computed style: `THE WEEK` rests at
  `rgb(139,115,85)` = `#8B7355` aged oak, `height 1px`, `transform: none` (no `scaleX(0)`), and
  raises to `rgb(196,165,123)` = `--color-clay` on hover. The project document page carries 3 more —
  `PUT DOWN` rests aged oak, raises to clay. Every tertiary act in the ledger screenshot wears a
  visible hairline: `LEDGER / THE WEEK / RECEIVING / VENDORS`, the project and payment filters,
  `SELECT MULTIPLE`, `PDF`, `open document →`. This is R139/PP-3 doing what it was written for.
* **`LEDGER`, the selected tab, rests in charcoal** (`rgb(44,41,38)`, `da-score-on`) — and **goes clay
  while hovered**, because `.da-score-hover:hover::after` outranks `.da-score-on::after`. That is
  D7's own disclosed P3, now observed live rather than reasoned about. §9 carries it.
* **The Desk at 390 is whole** — greeting, margin note, head, both facets, the day's line and the
  roster all wrap inside 390 with nothing clipped and nothing truncated.

### Divergences still visible in these renders (reported, not fixed)

1. **Two date idioms on one Desk.** The day's line reads `respond by 11 September`; the roster row
   directly beneath it reads `New lead — respond by Sep 11`, and so does the document page's own
   `New lead — respond by Sep 11`. D7's report owed this forward and scoped it correctly — the
   remaining call sites are `desk-derivation.ts`'s module-private `fmtDay`, a shared file (folio
   cards, the margin, the document guide) that was not in D7's list. **PP-2 is partially, not fully,
   resolved on this surface.**
2. **The 390 bottom bar is charcoal**, where §F-F asks for `--paper-doc` with a hairline top rule.
   This is ruled, not a defect — the plan's own rulings line says "the mobile bar's colour and
   identity block stay as built".
3. **The specimen's 390 reflow is still unbuilt** — day's line first under the greeting, sticky stage
   plates, the action column under the state sentence. No lane was ever given it. `w3-ship.md` §9
   asked for its own lane; that ask stands, now that the overflow half of the same item is closed.
4. **No boards rail** — `useRecentBoards` resolves empty on this seed, so `RecentBoardsStrip compact`
   renders nothing at all. D3's absence behaviour, working; its *content* is still unproven live.

## 5 · The 390 overflow: what the lanes shipped, what was actually wrong, and the fix

This is the wave's substantive finding, so it gets the measurements rather than a summary.

**First render, on the two lanes as merged: `scrollWidth 437 / clientWidth 390` — unchanged from the
437 Wave 3 measured, and unchanged from the 437 Wave 3 measured on an `origin/main` build.** D7's
brief was the 390 overflow; the number had not moved.

**Bisect** (`bisect-390.mjs` → `bisect-390.json`), hiding one child at a time from the roster down
and re-measuring `document.documentElement.scrollWidth`:

```
depth 0 → 390   DIV.flex flex-wrap items-center gap-x-3 gap-y-2   scrollW 410  clientW 336
depth 1 → 390   DIV.w-full                                        scrollW 410  clientW 336
depth 2 → 396   DIV.mb-8 last:mb-0        (the Direction stage group)
depth 3 → 396   UL
depth 4 → 396   LI.has-wash doc-rule-hair flex flex-wrap …        scrollW 410  clientW 336
```

**Row anatomy** (`row-anatomy-390.mjs` → `row-anatomy-390.json`), the worst row
(`Elena Marlowe — Living Room Direction`), inside a 336px `<li>`:

| child | rendered w | own scrollW | flex | overflow-wrap |
|---|---|---|---|---|
| `span.row-wash` | 336 | 336 | `0 1 auto` | normal |
| `span` (the 7px mark) | 7 | 7 | `0 0 auto` | normal |
| `a[data-roster-name]` | **292** | 292 | `0 1 auto` | **anywhere** (D7) |
| `p.doc-type-body min-w-0 flex-1` | **10** | **84** | `1 1 0%` | **normal** |
| `a.da-act` (`Open the job`) | 113 | 113 | `0 0 auto` | normal |

7 + 12 + 292 + 12 + **84** ≈ 407, and the `<li>`'s own `scrollWidth` is 410 against a 336 box. The
state sentence is `min-w-0 flex-1` — it *yields* its width to the name and is then squeezed to 10px,
narrower than its own longest word, which then overflows. The fixed bottom `<nav>` measuring 437 is
a *consequence*: the layout viewport widens to the document's overflow, so an `inset-x-0` fixed
element spans 437. Hiding the nav changed nothing (437); hiding the roster gave 390.

**What D7's change is actually worth here** (`d7-effect-390.mjs` → `d7-effect-390.json`), measured on
one build by stripping D7's two utilities back to the pre-D7 shape and re-measuring:

```
shipped (min-w-0 + [overflow-wrap:anywhere])   doc scrollWidth 437   longest name 292
pre-D7  (min-width:auto, overflow-wrap:normal) doc scrollWidth 437   longest name 292   ← identical
sentence gets [overflow-wrap:anywhere] too     doc scrollWidth 390                      ← closed
```

**D7's roster-name fix is inert on this seed.** No name on it is long enough *and* unbreakable enough
for `min-w-0` / `overflow-wrap:anywhere` to change the layout — the longest, `The Ashfords (no-login
household)`, has spaces and already wrapped. The change is not wrong (it is the correct guard for a
genuinely unbreakable name, and its test is honest about what it asserts); it simply was not the
binding constraint, and Wave 3's own DOM surgery had pointed at the name because that is where it
looked.

**The fix** (`0b0d49778`, one line plus a comment plus a test) — the same utility D7 gave the name,
given to the sentence that yields to it:

```diff
-      <p className="doc-type-body min-w-0 flex-1 text-[var(--text-muted)]">
+      <p className="doc-type-body min-w-0 flex-1 text-[var(--text-muted)] [overflow-wrap:anywhere]">
```

Its test — *"lets the state sentence wrap too, or the row still widens the page (390)"* — asserts
`[overflow-wrap:anywhere]` on every row's sentence and the absence of `truncate` /
`whitespace-nowrap` (the sheet forbids truncation), in the same jsdom-bounded idiom D7's own 390 test
uses. Full jest re-run after it: **549 / 6807**, lint unchanged at 205/2, shadow gate green and
byte-unchanged. Re-render on the rebuilt bundle: **390 / 390, zero elements past the viewport.**

Prettier warned advisory on both edited files at commit; both were **already drifting on
`origin/main`** (verified by running `prettier --check` against the `origin/main` copies) — this
change introduced no new drift.

## 6 · Deploy

```
$ npx wrangler deployments list --name patina-designer-portal     # BEFORE
… bottom row: 2026-09-08T23:56:34.337Z  bf6a3679-40b5-4c24-8db2-7cc2348f145a   ← ROLLBACK ID

$ ./infra/deploy-portal.sh designer
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
Total Upload: 16940.84 KiB / gzip: 4128.72 KiB
Uploaded patina-designer-portal (28.04 sec)
Deployed patina-designer-portal triggers (0.94 sec)
Current Version ID: cf67abe9-65e1-4818-b7d1-8eaa9943d93d
==> Done: designer portal deployed to production.

$ npx wrangler deployments list --name patina-designer-portal     # AFTER
… bottom row: 2026-09-09T01:44:22.195Z  cf67abe9-65e1-4818-b7d1-8eaa9943d93d   ← NEW
```

**Env.** W3's method, and W2b's recipe: the prod literals from `apps/designer-portal/wrangler.jsonc`
`vars` were **exported for the one invocation** (the eleven `NEXT_PUBLIC_*`, plus `SUPABASE_URL` and
the three service URLs). An exported value wins over any `.env` file in
`infra/deploy-portal.sh`, which is why this works from a worktree that has no `.env.local` — and why
the main checkout's `.env.local`, which points at `127.0.0.1`, cannot poison it.
`SUPABASE_ORIGIN_RUNTIME` was left unset at build time (it is a Worker runtime var; the preflight's
carve-out passed and the banner above confirms it).

**The inlined env was verified against the served bundle, before and after.** All 36 chunks of
`https://app.patina.cloud/auth/signin` were downloaded on both sides:

| String inlined in the served bundle | before | after |
|---|---|---|
| `https://bkvcixdmuyejfzcijpdg.supabase.co` | 1 chunk | 1 chunk |
| `api.patina.cloud` | 1 | 1 |
| `sb-bkvcixdmuyejfzcijpdg-auth-token` | 1 | 1 |
| `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG` | 2 | 2 |
| `us.i.posthog.com` | 3 | 3 |
| `client.patina.cloud` | 1 | 1 |
| `under_review` | 2 | 2 |

Exact parity, and identical to the table W3 recorded. No prod value silently dropped.

**Rollback:** `npx wrangler rollback bf6a3679-40b5-4c24-8db2-7cc2348f145a --name patina-designer-portal`.

## 7 · Smoke

1. **Bottom row is the new deployment** — `cf67abe9…`, 2026-09-09T01:44:22Z. ✅
2. **The served Desk chunk carries this wave's strings.** Named from the bundle this deploy uploaded
   (`.open-next/assets/_next/static/chunks/app/(document)/desk/page-cb273763eb0a6175.js`) and then
   fetched **from prod** (`200`, 64,094 bytes):

   | String | Occurrences |
   |---|---|
   | `respond by` | 1 |
   | `new lead — respond by` | 1 |
   | `en-GB` | 4 |
   | `overflow-wrap:anywhere` | **2** (D7's name link **and** §5's sentence fix) |
   | `Only what needs me` | 1 |
   | `By person` | 1 |

   **On the date shape:** the en-GB *idiom* is proved by the `en-GB` locale literal, not by a month
   name — `dayMonth`/`legalDate`/`WEEKDAY_FORMAT` build their strings from `Intl.DateTimeFormat` at
   runtime, so `September` correctly appears nowhere in the chunk. The rendered proof is the 1440
   screenshot: `respond by 11 September`.

3. **The combobox string is in the served bundle too**, in the chunk that actually owns the palette
   (`53-0b95b826d30b58f7.js`, `200`, 212,981 bytes — the desk page chunk does not carry the command
   bar): `combobox` ×1, `aria-autocomplete` ×1, `aria-activedescendant` ×1, `command-bar-option` ×1,
   `Nothing matches` ×1. B03 is live.
4. **`npx wrangler tail patina-designer-portal`** for ~60s while loading `/auth/signin` and `/desk`
   five times each: **10 events, all `outcome: ok`, 0 exceptions, 0 error logs**, statuses 200×5 /
   307×5, every event stamped `scriptVersion cf67abe9-65e1-4818-b7d1-8eaa9943d93d`. **No error
   spike.**
5. **Signed-in prod walk — NOT done.** Unchanged from W1/W2/W2b/W3: `e2e/fixtures/auth.ts:14-15`
   carries only the local seed and `playwright.config.ts:48` pins `baseURL` to `http://localhost:3000`.
   No prod credential exists anywhere in the repo. **Still owed to Kody.**

## 8 · Merge to main

```
$ git push -u origin portal-polish/integration-w3b
 * [new branch]  portal-polish/integration-w3b
$ git ls-remote origin portal-polish/integration-w3b
0b0d497787b8061583eb49a05933fb95f490c8cb

$ git worktree add .../agent-pp-main3b -b portal-polish/to-main-w3b origin/main
$ git merge --no-ff origin/portal-polish/integration-w3b \
      -m "merge(portal-polish): wave 3b — Desk follow-ups"
3ca24f6b2   (16 files changed, 1323 insertions(+), 121 deletions(-), no conflicts)

$ git push origin portal-polish/to-main-w3b && git push origin portal-polish/to-main-w3b:main
   a037cffd6..3ca24f6b2  portal-polish/to-main-w3b -> main

$ git merge-base --is-ancestor origin/portal-polish/integration-w3b origin/main
CONFIRMED: integration-w3b is an ancestor of origin/main
$ git ls-remote origin main
3ca24f6b2b9d171264fff59d5a7110d47eab4b05
```

`main` = **`3ca24f6b2`**, subject `merge(portal-polish): wave 3b — Desk follow-ups` exactly as the
plan names it. `main` had not moved during the wave. `agent-pp-main3b` was removed after the push,
then recreated briefly to commit this report and the PROGRAM append, and removed again.

## 9 · What was NOT verified

* **No signed-in walk against production** (§7.5).
* **A3 changes nothing in the shipped app.** Both new hooks — `useRoomConceptRenderRecord` and
  `useRemoveRoomConceptRender` — are additive library surface with **zero consumers**. D6's
  `concept-render-upload.tsx` still uses its own local `readConceptRender`/`clearConceptRender`
  helpers, so **the orphaned-storage-object bug D6's review reported is still live in the app**; A3
  wrote the cure and nobody has taken it. Confirmed: the A3 diff contains no `apps/*` file, and the
  deployed bundle's Remove path is unchanged. A3's own report says this plainly; it bears repeating
  here because a reader could otherwise take "concept-render remove hook shipped" to mean the leak
  is fixed.
* **No storage round-trip.** No object was uploaded to or deleted from `room-renders`, locally or in
  prod. A3's delete-before-null ordering is proved by unit test (`invocationCallOrder`), not against
  a real bucket.
* **The boards rail's content** — the seed has no recent boards, so only its absence behaviour was
  seen live (unchanged from W3).
* **`Nothing needs your hand today.`** and the day's line's third (answered-note) line were again
  never reached by this seed; both are unit-tested and present in the served bundle.
* **No e2e run.** The designer portal's Playwright suite is not in this wave's gate list.
* **The 390 fix was not measured on a real device** — Chromium's `isMobile` emulation at 390×844@2×.
* **Prettier drift is unresolved and advisory** across the touched files, all of it pre-existing.

## 10 · Owed to Kody

Carried from W3 and still open:

* **Signed-in prod walk of the Desk** — no prod tester credential exists in the repo.
* **The specimen's 390 reflow** (day's line first, sticky plates, action column under the sentence).
  The overflow half of `w3-ship.md` §9's "The 390 Desk" is now closed; the reflow half is not, and
  still wants its own lane.
* **`--hairline-strong` in the designer portal** — add the alias or bless `--doc-ink-border`.
* **The `.t-*` type-step classes** exist in neither portal; both waves matched values through local
  utilities. A cross-portal decision.
* **`reconnect_due` in the lead slot** — still an open product question, still tested as a deliberate
  exclusion.
* **No index on `project_notes.answered_at`** — the 60s poll's `gte` filter has no supporting index.
* **The walkthrough dialog `aria-hidden`s the whole Desk while open.**
* **`next dev` cannot serve this app on this machine** (EMFILE watcher exhaustion).

New from Wave 3b:

* **Finish PP-2 on the Desk: `desk-derivation.ts`'s `fmtDay`.** Nine-plus call sites still print
  `Sep 11` one line below `11 September`, and the document page prints it too. This is the one
  remaining reason the Desk still shows two date idioms, and it is a shared file no lane owned.
  A real lane, not a follow-up line.
* **Wire A3's hooks into `concept-render-upload.tsx`**, or the storage object still orphans on
  Remove. A3 built the cure and left it unconnected because its brief was the hooks; D6's component
  is the consumer.
* **A ruling on `.da-score-on` vs `:hover`.** `.da-score-hover:hover::after` (specificity ~0,0,3,1)
  outranks `.da-score-on::after` (~0,0,1,1), so a *selected* control reads clay-hovered rather than
  charcoal-selected while the pointer is on it — observed live on the Orders ledger's `LEDGER` tab.
  A one-line specificity bump plus a ruling closes it; both D7 and its reviewer scoped it out
  deliberately.
* **A3's Prettier reformat.** `use-room-concept-render.ts` was rewritten to double quotes end to end,
  against 119 of 133 single-quoted neighbours in the same directory, and `index.ts` carries two
  unrelated reformat hunks. No functional risk; it is diff-hygiene debt and an argument for a root
  Prettier config in the JS/TS workspace, since there is none outside `services/media` and
  `services/projects`.
* **A3's read hook queries `project_rooms` directly**, not through `get_client_project_threshold`.
  Fine for a designer consumer (`project_rooms_studio_rw`); a **client**-portal consumer may get no
  row. Inert today (zero consumers), but check before wiring.
* **`packages/aesthete-quiz` joins `packages/api-client`** as a package with no dist in a fresh
  worktree that the designer/admin turbo filters do not build. Two now; worth a `prepare` script or
  a documented preamble.

## 11 · Worktrees

* `agent-pp-int3b` (`portal-polish/integration-w3b`) — **kept**; dists built, holds the prod
  `.next` build.
* `agent-pp-main3b` (`portal-polish/to-main-w3b`, then `portal-polish/to-main-w3b-docs`) —
  **removed** after each push.
* Left for the orchestrator's sweep, unchanged from W2b's list plus this wave's:
  `agent-pp-a1`, `agent-pp-a2`, `agent-pp-a3`, `agent-pp-h1`…`h7`, `agent-pp-d1`…`d7`,
  `agent-pp-int`, `agent-pp-int2b`, `agent-pp-int3`, `agent-pp-int3b`.
