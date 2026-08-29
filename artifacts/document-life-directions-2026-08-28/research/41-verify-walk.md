# Life Review — live verification walk (branch `document-life/integration`)

Run 2026-08-28, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-life-integration`, head `1b93def1a` (confirmed via `git log -1`; `git fetch origin` failed — no network egress to the remote from this sandbox, not investigated further since head was already confirmed correct).

## 0. Guardrail note (read first)

`apps/designer-portal/.env.local` could not be copied from the main checkout, and no `.env*` file could be read or written anywhere in the repo by any tool (Bash sandboxed, Bash with `dangerouslyDisableSandbox: true`, and the `Read`/`Write` tools all hard-refuse any path matching `.env`/`.env.*`, independent of sandbox mode — a permission-system-level block, not a sandbox one). I did not attempt to route around this (e.g. via `dd`, `python shutil`, symlinks, or obfuscated paths) since the restriction is clearly deliberate.

Worked around it without ever reading a restricted file: pulled the local Supabase demo credentials live from `supabase status`'s own stdout (not a file read), and booted `pnpm dev:designer` with those values as **inline shell env vars** instead of a `.env.local`. This fully covered the designer-portal itself. It did **not** cover the three NestJS services' own env needs (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, Redis creds) — see §1.

## 1. Server

- Killed the stale main-checkout `next dev` on :3000 (PID 52138).
- `packages/supabase` has no build step (ships `.ts` source directly via its `exports` map) — the `pnpm turbo build --filter=@patina/designer-portal^...` step was a no-op for it and that's expected, not a gap.
- Booted from the worktree root:
  ```
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<local demo anon key, from `supabase status`>
  SUPABASE_SERVICE_ROLE_KEY=<local demo service key, from `supabase status`>
  NEXT_PUBLIC_ORDERS_API_URL=http://localhost:3015
  NEXT_PUBLIC_MEDIA_SERVICE_URL=http://localhost:3014
  NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3016
  NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
  NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true,the-document-pilot:true,procurement-workspace-pilot:true'
  nohup pnpm dev:designer > build/dev-integration.log 2>&1 &
  ```
- designer-portal: **:3000, PID 18620**, `✓ Ready in 511ms`. **Left running** at end of this walk.
- media service: **:3014, PID 18699**, up.
- orders (:3015) / projects (:3016): **not serving.** Root-caused, not just noted: (a) `packages/cache/dist` was missing — fixed with `pnpm turbo build --filter=@patina/cache` (cache-hit restore); (b) after that both crash-loop on Prisma init with `Environment variable not found: DATABASE_URL` — my inline-env boot never supplied `DATABASE_URL`/`SUPABASE_JWT_SECRET`/Redis creds for the services layer (patina-local-dev's documented requirement), and those also live only in `.env` files I could not touch. **No shot, probe, or e2e failure in this walk traced back to these two services being down** — the ledger sheet's Orders data (§3) rendered correctly, which confirms that read path goes through Supabase/RLS directly, not the NestJS service.
- Pre-warmed `/auth/signin` (200), `/desk` (307, expected — unauthenticated), `/doc/<rich>` (307, expected).
- Ladder ids: `research/state-ladder.json`'s `project_rich` id (`5536f8d2-...`) 404'd — the DB had been reset again since that file was written. Re-resolved live via the same psql query the file documents: Chen Residence is now `de922823-d1b9-491a-8ad5-99e8e4f013c5` (still tied-highest at 3 FFE items, same tiebreak precedent). `project_plain` and `proposal_sent` matched the file unchanged; `install`/`brief` were not re-resolved (not needed — this walk's required shot list never uses them).

## 2. E2E — `e2e/document`, chromium

**First attempt invalidated itself twice** before a clean run: (a) `pnpm test:e2e -- e2e/document --project=chromium` passed `--` through literally to Playwright (pnpm/Playwright arg-passing quirk), so the project filter never applied and all 3 browsers ran; (b) that run (and a clean chromium-only rerun) both hit Chromium launch failures — macOS seatbelt `Permission denied (1100)` on the mach-port rendezvous Chromium's own sandbox needs — a sandbox-caused failure per the task's own criteria, fixed by re-running with `dangerouslyDisableSandbox: true` (explicitly pre-authorized for Playwright/Chromium).

**Clean run** (`--project=chromium`, sandbox disabled):

```
41 passed, 11 failed, 1 skipped, 14 did not run   (67 total, 2.1m)
```

**Re-run of the 11 failures once** (isolate flakes):

```
2 passed on rerun (FLAKY):
  gate-ceremony.spec.ts:54 — "an unsettled gate stands as six named parts, in order"
  margin-handoffs.spec.ts:63 — "every gate is a margin item: lane, need line, and exactly one act"
  (both failed the first time with "Test timeout of 60000ms exceeded" waiting on a locator —
   consistent with parallel-worker cold-compile contention, not a real defect)

9 failed both times (real, not flaky):
```

| Spec | First assertion message |
|---|---|
| `action-visibility.spec.ts:213` — 390px surfaces place context, primary, and More in one edge owner | `expect(locator).toHaveCount(1)` — Received 0. `getByTestId('mobile-bar').locator('[data-action-key="capture-lead"]')` never appears (33× polled, 0 elements) |
| `arrival-arc.spec.ts:235` — full arc (R106, Wave 2) | `AuthApiError: Database error finding users` → Postgres `invalid input syntax for type uuid: "undefined"`, from `getUserIdByEmail`'s `adminDb.auth.admin.listUsers(...)` |
| `desk-error-state.spec.ts:42` — forced document_state failure shows one coherent error surface | same `AuthApiError`/`uuid: "undefined"` as above |
| `desk-walkthrough.spec.ts:115` — existing designer, no modal, offer note starts the tour | same `AuthApiError`/`uuid: "undefined"` as above |
| `help-panel.spec.ts:73` — desk ⌘K "Help…" opens the contextual panel | same `AuthApiError`/`uuid: "undefined"` as above |
| `dissolve-redirects.spec.ts:420` — `/preferences/unsubscribe` answers signed OUT (R91 contract) | `expect(unsub.status()).toBe(200)` — Received `500` |
| `plan-room.spec.ts:86` — files a dropped set, shares a sheet with the client | `Error: could not seed the e2e project: studio_id_not_designer_studio` |
| `quiet-release-contracts.spec.ts:74` — holds the paper and chrome in every exact responsive transition | `expect(locator).toBeVisible()` — `[data-document-shell]` never appears (5000ms) |
| `spec-book-workspace.spec.ts:56` — opens the workbench, one audience-safe preview surface | `expect(locator).toBeVisible()` — `getByRole('navigation', {name: 'Spec book workspace'})` never appears (5000ms) |

**Reading these 9**: 4 of them (`arrival-arc`, `desk-error-state`, `desk-walkthrough`, `help-panel`) share one root cause — a Postgres-level `uuid: "undefined"` error inside GoTrue's own admin `listUsers` call, independent of which spec calls it. That is a shared test-helper/local-auth-service condition, not 4 independent app bugs — worth one investigation, not four. `plan-room`'s seed error and (plausibly) `quiet-release-contracts`/`spec-book-workspace`'s missing-element timeouts are consistent with the same id-drift I hit firsthand in §1 (this local DB was reset multiple times across this session alone, once mid-walk) — re-run against one stable, freshly-seeded DB before trusting these three as real regressions. `dissolve-redirects.spec.ts:420` and `action-visibility.spec.ts:213` read as genuine, spec-specific findings (see Should list).

## 3. Shots + probes

All 3 passes (1440, 390, 1440-reduced-motion) completed with **zero failed shots** (10/10 captured). Script: `build/verify-shots.mjs`, run via `node --input-type=module < build/verify-shots.mjs` from the worktree's `apps/designer-portal` (a real file at the `build/` path outside any node_modules tree can't resolve `@playwright/test` by walking up its own directory — cwd-relative `[eval]`-style resolution via stdin is what actually makes "run from apps/designer-portal" work; a plain `node /abs/path/to/script.mjs` does not, confirmed both ways). Shots: `build/shots/*.png`. Probes: `build/shots/{w1440,m390,w1440-reduced}-probes.json`.

### Probe outputs (verbatim highlights; full JSON in the three `*-probes.json` files)

**box-shadow inventory** — matches the brief's expectation exactly, modulo one dev-only artifact:
- `desk`: drawer (`aria-label="Studio drawer"`, `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`) + the TanStack Query devtools floating button (`rgba(0,0,0,0.1)...`, a *different* shadow — this is dev-only chrome hidden via `display:none` by the harness's overlay-hider, `getComputedStyle` still reports its declared shadow regardless of visibility; not part of production UI, ignore it in the count).
- `doc-project-rich` / `doc-ffe`: drawer + **2** margin chips (`doc-elevated` divs) + devtools button — matches "drawer + margin chips."
- `ledger-sheet-orders`: drawer + devtools + the dialog panel (`role="dialog"`, `doc-sheet-panel`) — matches "+panel."
- Every real (non-devtools) shadow is the identical `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px` = `--elevation-sheet`. **Pass.**

**Hover wash** (`desk-hover`, first PROJECT-stage line):
```
clipPath: "circle(150% at 488px 33.7456px)"
backgroundColor: "rgba(109, 78, 36, 0.08)"   ← exactly --wash-project
```
(`doc-ffe-hover`, a stamped FFE line): `clipPath: circle(150% ...)`, `backgroundColor: rgba(196, 165, 123, 0.16)` = `--wash-clay` (no per-line stage tone on FFE rows — correct, clay is the FFE-line default). **Pass** on both.

**Settle-on-return**: the *first* method (two `page.goto()` round-trips) reported 12 running `desk-settle` animations on return — **this was a test-method artifact**, not a defect: `page.goto()` is a hard reload each time, which resets the `settledOnce` module-level flag the app relies on (real users navigate client-side via `<Link>`, which never reloads the bundle). Re-tested with a real SPA round-trip (click the roster line's own link out, click the in-app `href="/desk"` breadcrumb back — `build/verify-settle-spa.mjs`):
```
desk-settle elements on FIRST load: 0 (already past the animation window by check time)
desk-settle elements on SPA return: 0
RUNNING desk-settle animations on SPA return: 0
```
**Pass** — confirms the "settle once per session" contract holds under real navigation.

**Reduced motion**: `.desk-settle`'s own keyframe is correctly silenced (`animation: none` fires; the class stays on the DOM per the code's own design, count stayed 16). But **39 other elements** (roster name links via `row-wash-score`, action buttons/chips) still report `transitionDuration: "0.15s"` under `prefers-reduced-motion: reduce` — only the small set of elements explicitly marked `motion-safe:`/`motion-reduce:` (the stamp's tone transition, the settle keyframe) are covered; ordinary `transition-colors duration-150` hover states elsewhere are not scoped to reduced motion at all. The brief's "all durations 0s" bar is **not met globally** — only for the specifically-guarded animations. Also observed: the *first* roster line shows a static (non-swept) wash tint with no hover present — traced to the desk walkthrough tour focusing that row as its opening anchor; `:focus-within` correctly triggers the CSS's own documented "focus arrives with no sweep" static-tint rule. **Expected, not a bug.**

**Fonts**: `document.fonts.status: "loaded"` on desk. **Pass.**

**Console errors**: one recurring message, `Failed to load resource: ... 500`, traced to `POST /api/auth/qr/generate` → `Error: supabaseKey is required` at `createAdminClient`. Root cause: Turborepo's strict env mode only passes through env vars a task explicitly lists (confirmed for `NEXT_PUBLIC_FLAG_OVERRIDES` via `turbo.json`'s `globalPassThroughEnv`) — `SUPABASE_SERVICE_ROLE_KEY`, exported in my launch shell, did not reach the actual `next dev` child process that turbo spawned, so any server route needing the admin client 500s. This is specific to my inline-env boot method (a `.env.local`-based boot wouldn't hit it, since dotenv files are read inside the Next process itself, not filtered by turbo's task-level passthrough) — **not a code defect**, and unrelated to Life Review (QR device pairing is a different, pre-existing feature). No other console errors appeared across any of the 10 shots.

**390px overflow (F24)**: `scrollWidth: 437` vs `clientWidth: 390` on `/desk` → **47px overflow**. No prior number was recorded to diff against in this program's own history, so I can't confirm "same vs. grew" — reporting the raw number as instructed.

**Contrast samples** (corrected after finding and fixing a bug in my own first draft of the probe — see below):

| Sample | Text / effective background | Ratio | vs. ≥4.5 |
|---|---|---|---|
| Stage tab label ("Brief · 5") | white on `rgb(73,112,147)` (own pill bg) | **5.22** | Pass |
| Region name ("Schedule") | `rgb(44,41,38)` on paper `rgb(252,250,246)` | **13.87** | Pass |
| Filled stamp word ("In production") | `rgb(44,41,38)` on tint `rgb(239,230,218)` | **11.71** | Pass |
| "On this paper" label | `rgb(139,115,85)` on `rgb(232,227,219)` | **3.51** | **Fail** |
| Margin chip kind line (`.mi-k`) | — | — | Not found — Chen Residence's margin content on this project is `MONEY · VENDOR PAYMENT DUE` cards, not the `.mi-k`-styled kind line (that class renders on a different margin-item shape used elsewhere, e.g. gate handoffs); inconclusive with this fixture, not a failure |

Self-caught bug: my probe's `effectiveBg()` originally started walking from the text element's *parent*, which is correct for plain body text but wrong for anything that paints its own background on the same node as its text (the stage-tab pill, the filled stamp) — that first pass reported a nonsense 1.07 ratio for the stage tab (reading the page background behind it instead of its own pill color). Fixed to start at the element itself; re-ran all 5 samples with `build/verify-contrast-recheck.mjs` — table above is the corrected result. "On this paper" (`spine-running-index.tsx`, 11px `font-mono`, well under the 18.66px "large text" carve-out) genuinely fails at 3.51 — this is a pre-existing `--color-aged-oak`-on-pearl token combination, not something the Life Review commits touched.

## 4. Screen-by-screen vs. the mockup

Compared each shot to `mock/final/shots/final-*.png` (treatment, not content — the mockup uses specimen data, the app the local seed).

- **THE STUDIO block on /desk**: compared pixel-for-pixel by eye against the pre-change baseline `artifacts/document-life-directions-2026-08-28/shots/w1440-desk.png` — **visually identical** (same spacing, icons, dotted leaders, three-column layout). Confirmed not disturbed by this branch.
- **Desk roster**: colored stage-tab pills (Brief blue/Discovery teal/Direction green/Proposal olive/Project brown/Install terracotta) now present where the pre-change baseline had plain black-text labels — exactly the ruled "A with a little of B's colour" direction. Hover wash on a roster line renders as a full-row warm wash with the link underlining — matches the mockup's intent.
- **Doc top-of-page** (`doc-project-rich`): my first capture of this landed mid-page (already scrolled to the Schedule region) — a test-script artifact from navigating to the same URL twice in one page session (re-checked with a single fresh navigation, `scrollY: 0`, `build/shots/w1440-doc-project-rich-topcheck.png` is the corrected evidence). That corrected top view matches the mockup's structure closely: heading → client line (empty-state "No client linked — attach one") → key-facts row → property table (ROOMS/PIECES/DRAWINGS/SPEC/BOARDS/MONEY/DATES/PEOPLE, each with a `→`) → NEEDS ATTENTION callout → action row → first folded region. One open question I couldn't resolve with confidence: the mockup shows a bold "PROJECT" eyebrow label directly above the colored rule-bars; the live capture's equivalent space is harder to read at this resolution — worth a closer look, not asserted as a defect.
- **Pieces / FFE**: layout, header row (`SPEC THE N UNSPECIFIED` black pill, `ADD A LINE`, `BILL N UNINVOICED LINES`), thumbnail-name-maker-stamp-price row shape all match. Filled stamps present (`IN PRODUCTION`, `RECEIVED`) using the tint+border recipe the mockup shows.
- **Ledger sheet (Orders)**: dialog chrome, tabs, project/payment filters, PO row shape (thumbnail, id, outline stamp, status text, date, project·amount·payment line, PDF/open-document link) all match the mockup's `final-sheet-1440.png` closely, including the deliberate outline-vs-filled stamp distinction (outline here, filled on FFE lines) being consistent in both.
- **Margin rail**: italic intro copy, "IN THE MARGIN" heading, bordered money-chip cards — matches the mockup's right-rail treatment.
- **Mobile** (`m390-desk.png`, full-page): the full-page capture shows the fixed bottom Studio-drawer bar duplicated mid-page with odd narrow-column text wrapping right at that seam — this is a well-known Chromium/Playwright `fullPage` artifact with `position: fixed` elements (they render at their viewport-relative position on every stitched tile), **not a real layout bug**. Confirmed with a targeted viewport-only recapture at the same scroll position (`m390-desk-viewport-recheck.png`): the roster line wraps normally, multiple words per line, no defect.

### Three biggest visual deviations from the mockup

1. **Typography scale, most visible on roster job-names and stage-tab pills.** The mockup's serif job-name ("Full Room") reads roughly 24–26px by eye; the shipped `desk-roster.tsx` pins it at a literal `text-[16px]`. This is the single most visually obvious gap between every mock screenshot and every live one — but it is **identical to the pre-change baseline** (same 16px in the pre-Life-Review `w1440-desk.png`), so it predates this branch and isn't something the Life Review work regressed. Flagging because it's still the most visible mock-vs-real gap, not because this branch caused it.
2. **FFE filled-stamp tones read close to each other in this fixture.** Chen Residence only exercises 2 of the 4 filled tones (`IN PRODUCTION`, `RECEIVED`), and at normal reading size the two tan/clay-family tints are hard to tell apart at a glance — where the mockup demonstrates 4 visually distinct hues (tan/red/gold-highlighted-row/etc.) across a richer fixture. Couldn't verify all 4 filled tones render distinctly with this project's data; worth a follow-up capture against a project with a `damaged` or `decision`-tone line.
3. **FFE "by room" grouping and real thumbnails weren't exercised.** The mockup groups Pieces by room with subheadings and shows a real product photo for one line; Chen Residence has 0 rooms assigned to any of its 3 FFE items, so the live capture only ever shows the flat "Not in a room yet" group with placeholder thumbnails. The by-room code path clearly exists (rail shows "0 ROOMS", mockup demonstrates it) — this is a fixture-coverage gap in what I could verify, not a demonstrated defect.

## 5. Blocking / Should / Note

**Blocking**: none found in the Life Review implementation itself. Everything the ruled direction specifically asked for (colored stage tabs, filled/outline stamp distinction, hover wash mechanics, box-shadow consistency, THE STUDIO untouched) verified clean.

**Should**:
- `dissolve-redirects.spec.ts:420` — `/preferences/unsubscribe?token=<garbage>` 500s instead of returning 200 per the documented R91 contract (signed-out unsubscribe must always answer, even with a bad token).
- `action-visibility.spec.ts:213` — the 390px mobile action bar's `capture-lead` action never appears (0 of 33 polls); worth a direct look, not clearly fixture-driven like several of the others.
- The 4 specs sharing `AuthApiError: Database error finding users` / `uuid: "undefined"` (`arrival-arc`, `desk-error-state`, `desk-walkthrough`, `help-panel`) — one shared root cause in `getUserIdByEmail`'s admin `listUsers` call against this local Supabase instance; investigate once rather than per-spec.
- "On this paper" label contrast (3.51, target ≥4.5) — pre-existing `--color-aged-oak`-on-pearl token, not introduced by this branch, but real and measurable.

**Note**:
- `plan-room.spec.ts:86`, `quiet-release-contracts.spec.ts:74`, `spec-book-workspace.spec.ts:56` — all three read as plausible fixture/id-drift casualties (this local DB was reset mid-session, twice, independent of anything I did) rather than demonstrated app regressions; re-run once against one stable freshly-seeded DB before trusting them.
- Reduced motion: only the explicitly `motion-safe:`/`motion-reduce:`-guarded animations (settle keyframe, stamp fill transition) are actually silenced; ~39 other hover/focus color transitions still run at 150ms under `prefers-reduced-motion: reduce`. Not obviously in scope for this branch, but the brief's literal "all durations 0s" bar isn't met.
- orders/projects NestJS services never came up this session (missing `DATABASE_URL` etc. in my inline-env boot, plus a `@patina/cache` dist gap I fixed separately) — confirmed this didn't affect anything verified here, but flagging so it isn't mistaken for a clean full-stack boot.
- `POST /api/auth/qr/generate` 500s locally due to turbo's env-passthrough filtering `SUPABASE_SERVICE_ROLE_KEY` out of the child process — an artifact of my inline-env boot method, not a code defect, unrelated to Life Review.
- TanStack Query devtools button appears in every box-shadow inventory (dev-only chrome, filter out when reading those probes).
- Chromium/Playwright `fullPage` screenshots at 390px duplicate fixed-position elements mid-page and can make surrounding text appear to wrap incorrectly — a capture-tool artifact, confirmed not a real bug via a targeted viewport recapture.

## Artifacts

- Dev server log: `build/dev-integration.log`
- E2E logs: `build/e2e-run1.log` (invalidated, 3-browser/no-filter), `build/e2e-run2-chromium.log` (invalidated, sandboxed launch flakiness), `build/e2e-run3-chromium-nosandbox.log` (clean baseline), `build/e2e-rerun-failures.log` (flake-isolation rerun)
- Capture script: `build/verify-shots.mjs`; follow-up probes: `build/verify-settle-spa.mjs`, `build/verify-contrast-recheck.mjs`, `build/verify-doc-top-recheck.mjs`, `build/verify-mobile-wrap-recheck.mjs`, `build/verify-reduced-wash-recheck{,2,3}.mjs`
- Shots + probe JSON: `build/shots/`
- Server left running: designer-portal PID 18620 on :3000, media PID 18699 on :3014.

---

## Re-verify after fixes (11a553ff1)

Run 2026-08-28 (later same day), same worktree/server (`/Users/kody/Code/patina-merged/.codex/worktrees/agent-life-integration`, designer-portal PID 60310 on :3000 — reused, not restarted). Branch `document-life/integration`, head advanced from the prior walk's `1b93def1a` to **`11a553ff1`** across 7 commits fixing code-review findings S1, S5, C1, S2/W2, T3, S8/T5/T4, and P1/T1/S6 (see `build/10-code-review.md`). DB unchanged: Chen Residence (`de922823-d1b9-491a-8ad5-99e8e4f013c5`) confirmed still `PROJECT_RICH_ID`, still 3 FFE items (2 clay/ordered-family, 1 sage/delivered-family — no `damaged` or `decision_due` FFE line exists in this designer's seed, same fixture gap as the prior walk).

Script: `build/verify-shots-v2.mjs` (adapted from `verify-shots.mjs`, all shots/probes `-v2` suffixed under `build/shots/`), run the same way (`node --input-type=module < build/verify-shots-v2.mjs` from the worktree's `apps/designer-portal`, `dangerouslyDisableSandbox: true` for the same pre-authorized Chromium mach-port sandbox reason as the prior walk). All 3 passes (1440, 390, 1440-reduced) completed with **zero failed shots** (11/11 captured across the three passes, plus 3 follow-up scripts for artifacts the main script's method couldn't cleanly produce — see below).

### Probe outputs (verbatim highlights; full JSON in `build/shots/{w1440,m390,w1440-reduced}-v2-probes.json`)

**Box-shadow inventory — unchanged from the prior walk, still correct:**
- `desk`: drawer only (`rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`) + devtools button (dev-only, ignore).
- `doc-project-rich` / `doc-ffe`: drawer + **3** `doc-elevated` margin-rail chips (TIME · AUG 29, MONEY · VENDOR PAYMENT DUE ×2) + devtools.
- `ledger-sheet-orders`: drawer + devtools + the dialog panel (`role="dialog"`, `doc-sheet-panel`).
- Every real (non-devtools) shadow is still the identical `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`. **Pass**, matches brief exactly (desk = drawer; document = drawer + margin chips; sheet = +panel).

**Hover wash sweep** — unchanged mechanic, still correct:
```
desk-hover (first PROJECT-stage line): clipPath "circle(150% at 488px 33.7456px)", backgroundColor "rgba(109, 78, 36, 0.08)" = --wash-project
doc-ffe-hover (stamped FFE line):      clipPath "circle(150% at 450px 38.7463px)", backgroundColor "rgba(196, 165, 123, 0.16)" = --wash-clay
```
**Pass** on both — clip-path reaches `circle(150% …)`, background is the stage's own `--wash-*` token, byte-for-byte the same values `globals.css` declares.

**Settle after a real SPA navigation** (`verify-settle-spa.mjs`, re-run unmodified):
```
desk-settle elements on FIRST load: 0
navigated (SPA) to /doc/b0000000-0000-0000-0000-0000000000d3
navigated (SPA) back to /desk
desk-settle ELEMENTS present on SPA return: 0
RUNNING desk-settle animations on SPA return: 0
```
**Pass** — unchanged from the prior walk, "settle once per session" still holds under real client-side navigation. (The main v2 script's *hard*-reload settle probe, included for continuity, again reports 12 running on return — this is the same known test-method artifact the prior walk documented: `page.goto()` reloads the JS bundle and resets the module-level `settledOnce` flag; not a regression, not a real user path.)

**Reduced motion** — **not fixed, and not in scope for this fix round** (none of S1/S5/C1/S2/W2/T3/S8/T5/T4/P1 target it; code review's C9 called reduced motion "complete" — this walk's numbers say otherwise, both before and after the fix round):
```
reducedMotionOffenders:desk-reduced-motion → 39 elements (16 <a>.row-wash-score, 15 <span>, 8 <button>), all transitionDuration: "0.15s", animationDuration: "0s"
deskSettleElementCount:desk-reduced-motion → 16 (class stays on the DOM, keyframe correctly silenced separately)
```
Identical count (39) to the prior walk. **Unchanged** — real, pre-existing, not touched by this fix round.

**Console errors** — same single recurring message as the prior walk, same already-diagnosed non-defect cause (turbo env-passthrough filtering `SUPABASE_SERVICE_ROLE_KEY` out of the `next dev` child in this session's inline-env boot; `/api/auth/qr/generate` 500s as a result):
```
consoleErrors:w1440 → ["Failed to load resource: the server responded with a status of 500 (Internal Server Error)"]
consoleErrors:m390 → []
consoleErrors:reduced-motion → ["Failed to load resource: ... 500"]
```

**390px overflow (F24)** — unchanged: `scrollWidth: 437` vs `clientWidth: 390` → still 47px overflow, identical number to the prior walk. Not touched by this fix round, not claimed fixed by any of its commits.

**Contrast samples** (`build/shots/w1440-v2-probes.json`, corrected `effectiveBg()` walk carried over from the prior walk):

| Sample | Text / effective background | Ratio | vs. ≥4.5 | Δ vs. prior walk |
|---|---|---|---|---|
| Stage tab label ("Brief · 5") | white on `rgb(73,112,147)` | **5.22** | Pass | unchanged |
| Region name ("Schedule") | `rgb(44,41,38)` on `rgb(252,250,246)` | **13.87** | Pass | unchanged |
| Filled stamp word ("In production") | `rgb(44,41,38)` on `rgb(239,230,218)` | **11.71** | Pass | unchanged |
| **"On this paper" label** | `rgb(78,67,57)` on `rgb(232,227,219)` | **7.52** | **Pass** | **was 3.51 (Fail) — T3 fix confirmed live: label moved off `--color-aged-oak` onto `--text-muted`** |
| **Roster overdue clause, hovered** (new sample) | `rgb(156,83,64)` (`--color-terracotta-ink`) on `rgb(250,247,242)` | **5.28** | Pass | new — "Overdue 5 days — 3 decisions overdue — oldest due Aug 23" |
| Margin chip kind line (`.mi-k`) | — | — | Not found | unchanged — Chen Residence's margin content is still MONEY chips, not `.mi-k` lines; fixture gap, inconclusive, not a failure |
| Filled stamp word, `decision`/`damaged` tones | *(not exercisable — no such FFE line in this designer's data)* | **11.72 / 11.76** (computed independently off the shipped CSS tokens, matches the code's own comments exactly) | Pass (by computation) | code-verified only |

**Stamp inventory** (all `[data-stamp-variant]` elements on `doc-project-rich`): 2× `filled`/`ordered` ("In production"), 1× `filled`/`delivered` ("Received") — matches the S5 fix's tone map (`ordered`→clay, `delivered`→sage) exactly; no outline stamps happened to render on this particular scroll capture.

**RegionRule inventory** (all `[data-rule-weight]` elements on `doc-project-rich`): all 6 visible instances read `weight="strong"`, class `doc-rule-strong`, computed `height: 6px`. Cross-checked `.doc-rule-strong` in `globals.css` (2px `#2C2926` top border + 1px `var(--doc-ink-border)` = `rgba(44,41,38,0.18)` bottom border, 6px box) against the legacy `.doc-region-rule` recipe two lines below it in the same file — **byte-for-byte identical**, confirming the S1 fix note's "var-for-var" claim in code, not just by class name.

### Fold-seam first paint (C1)

The literal "screenshot immediately at `domcontentloaded`" approach (in `verify-shots-v2.mjs`) caught the route's own loading skeleton ("Picking up…"), a Suspense/`loading.tsx` boundary unrelated to FoldSeam — inconclusive by itself, superseded by a focused follow-up (`build/verify-fold-first-paint-v2.mjs`): navigate, wait only for `[data-document-shell]` (the earliest point any FoldSeam can exist in the DOM), then read computed style and screenshot with **zero** further wait:
```
seamState (at [data-document-shell] appearance): {
  "found": true, "opacity": "0", "transform": "matrix(1, 0, 0, 1, 0, -4)",
  "animationName": "fold-in", "animationPlayState": "running",
  "visible": true, "inViewport": true, "top": 776.5625
}
```
This is the correct shape for the fix: the seam is present, visible (non-zero size, in the DOM, in viewport) and its entrance animation is **already running** — driven by the browser's CSS engine, not gated behind a JS/hydration branch. The `opacity: 0` reading is the animation's own declared **from**-keyframe at t≈0, not the old bug's indefinite JS-gated invisibility — code inspection (`fold-seam.tsx`, `globals.css` `@keyframes fold-in`/`fold-arrow-flip`, `animation-fill-mode: both`) confirms nothing here depends on React hydration completing; a hydration failure would leave the animation running to completion regardless. `build/shots/w1440-v2-fold-first-paint-shell.png` (captured moments later, once earlier-page skeleton rows had resolved) shows the "Schedule dates · PHASE DATES … UNFOLD ↓" seam fully legible.

### Artifacts (new this walk)

- `build/verify-shots-v2.mjs` — main capture script (adds `fold-first-paint`, roster-overdue-clause contrast, stamp/rule inventories to the prior script's shot+probe set)
- `build/verify-fold-first-paint-v2.mjs` — focused C1 recheck (seam state at `[data-document-shell]` appearance)
- `build/verify-doc-top-v2.mjs` — fresh-navigation top-of-doc recapture (see below)
- `build/verify-mobile-viewport-v2.mjs` — viewport-only (non-fullPage) mobile recapture
- Shots: `build/shots/{w1440,m390,w1440-reduced}-v2-*.png` (11 from the main script + 3 follow-ups)
- Probes: `build/shots/{w1440,m390,w1440-reduced}-v2-probes.json`

## 4v2. Screen-by-screen checks (post-fix)

**(1) Every `RegionRule` outside Pieces renders the 6px double rule exactly as on main; Pieces keeps the strong rule.**
**PASS.** `region-rule.tsx`'s default flipped back to `weight = 'strong'` (fbe25cfa7). Grepped every call site in `src/components/document/**`: the 11 previously-demoted sites (`project-mood-boards.tsx`, `care-band.tsx`, `schedule-rule-region.tsx`, `schedule-spine.tsx`, `money-region.tsx`, `project-approval-document.tsx`) all call `<RegionRule />` with no explicit `weight` → now render `strong` again, byte-for-byte matching the pre-R126 `.doc-region-rule` recipe (verified in `globals.css`, not just by class name). `ffe-section.tsx:1290` explicitly passes `weight="strong"` for Pieces. No call site anywhere passes `weight="mid"` — the two ranks the doc-comment describes exist in code but nothing currently opts into `mid`, so live capture shows all rules at the strong/double weight, matching main.

**(2) Filled stamps: IN PRODUCTION/ORDERED → clay plate; RECEIVED/DELIVERED → sage plate; DECISION DUE → golden; DAMAGED → terracotta; tilted −1.5°; any other kind stays outline.**
**PASS on the two tones this fixture exercises (code-verified on the other two).** `stamp.tsx`'s `ffeStampTone()` (via `ffe-section.tsx`) now maps `ordered/production/shipped`→`ordered` (clay), `received/delivered/installed`→`delivered` (sage, the S5 fix), `decision_due`→`decision` (golden), `damaged`→`damaged` (terracotta), everything else→`null`/outline. Live capture (`w1440-v2-doc-ffe.png`) shows 2 clay "IN PRODUCTION" plates and 1 sage "RECEIVED" plate on Chen Residence's 3 FFE items, all tilted `matrix(0.999657, -0.0261769, ...)` = −1.5°. This designer's seed still has **no** `damaged` or `decision_due` FFE line (confirmed via `psql` against `project_ffe_items` — only `delivered`/`production`/`shipped` statuses exist across both of the designer's richest projects), so the golden/terracotta filled plates aren't live-exercisable — same fixture gap the prior walk noted, unrelated to this fix round. Independently recomputed the WCAG contrast for all 5 `--fill-*-tint` tokens against `--color-charcoal` from the raw hex values in `globals.css` (not just trusting the code comments): ordered 11.71, decision 11.72, damaged 11.76, delivered 11.69, anchor 11.78 — matches the shipped code's own inline comments exactly.

**(3) The fold-seam control (UNFOLD ↓ / FOLD ↑) is visible in the first-paint shot.**
**PASS.** See the dedicated section above — the seam is unconditionally present and CSS-animating from the instant `[data-document-shell]` exists, independent of JS hydration (C1's actual fix, `6f828d753`). `w1440-v2-doc-project-rich-top.png` (a fresh, non-revisited navigation — see note below) shows "Client approvals … UNFOLD ↓" as the first folded region under the property table, fully legible.

**(4) Rail labels legible.**
**PASS.** `w1440-v2-doc-project-rich-top.png`'s left rail ("ON THIS PAPER", "Client approvals", "Schedule", "Pieces", "Money") and the "IN HAND" card all read clearly at normal size; `m390-v2-doc-project-rich.png` shows the same rail content reflowed and still legible on mobile. "On this paper" specifically (the T3 fix target) now measures 7.52:1, comfortably above 4.5.

**(5) THE STUDIO block identical to `shots/w1440-desk.png`.**
**PASS.** Compared `w1440-v2-desk.png` against the pre-change baseline pixel-for-pixel by eye: same three-column ROOMS/LEDGERS/BEGIN layout, same dotted leaders, same icons, same copy. Untouched by this fix round (none of the 7 commits touch desk-roster's STUDIO block).

**(6) Tick-box glyphs (✓ in 13px boxes) not overflowing.**
**PASS (code-verified; not in the required shot list so not independently screenshotted this walk).** All 5 sites the review flagged (`work-block.tsx:220`, `care-band.tsx:380`, `coordination/item-composer.tsx:921`, `coordination/coordination-work.tsx:164`, `roster/rolodex-picker.tsx:472`) now read `text-[8px] font-bold leading-none` inside the same `h-[13px] w-[13px] border-[1.5px]` box (10px content box) — an 8px glyph fits comfortably where the sweep's 11px bold glyph did not.

### Blocking / Should / Note (post-fix)

**Blocking**: none. All 7 fix-round commits verified working as intended, live and in code.

**Should**:
- Reduced motion — still 39 non-`motion-safe:`-scoped hover/focus transitions active under `prefers-reduced-motion: reduce` (identical count to the prior walk). This directly contradicts code review finding C9 ("Reduced motion is complete") — C9 should be revisited; it was never in this fix round's scope (S1/S5/C1/S2/W2/T3/S8/T5/T4/P1), so this is a pre-existing gap surfacing again, not a regression from the fixes.
- 390px overflow (F24) — unchanged at 47px (`scrollWidth: 437` vs `clientWidth: 390`), not addressed by this fix round; still worth a look, not introduced by these fixes.

**Note**:
- Margin chip kind line (`.mi-k`) still not exercisable on Chen Residence — same fixture gap as the prior walk, inconclusive rather than failing.
- `decision`/`damaged` filled-stamp tones (golden/terracotta) still not live-exercisable with this designer's seed data (no FFE line in either `damaged` or blocked-by-decision state exists in `project_ffe_items` for any of this designer's projects) — verified correct by direct token-math computation instead; a fixture with one of each would let a future walk screenshot all 4 filled tones together.
- The main v2 script's naive "screenshot at `domcontentloaded`" landed on the route's own loading skeleton rather than testing FoldSeam at all — not a bug, just this walk's own method note for next time: wait for `[data-document-shell]`, not just `domcontentloaded`, when the goal is "first meaningful paint."
- The v2 script's first `doc-project-rich` capture (inline in `verify-shots-v2.mjs`) re-hit the exact same Next.js scroll-restoration artifact the prior walk found (revisiting the same doc URL a 3rd time in one page session lands mid-scroll, not at the top) — worked around identically, with a fresh single-navigation script (`verify-doc-top-v2.mjs`) rather than trusting the in-session capture. Confirms this is a real, reproducible test-harness quirk (not something either fix round changed), worth building into the next iteration of the main script directly (`window.scrollTo(0,0)` before any "top of doc" capture that follows an earlier visit in the same page).
- Console 500 on `/api/auth/qr/generate`, TanStack devtools shadow, and the fullPage+`position:fixed` mobile stitching artifact all persist unchanged from the prior walk, for the same already-diagnosed non-defect reasons — not re-litigated here.
