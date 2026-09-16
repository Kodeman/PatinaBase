# Wave 3c — integration, gates, renders, the first storage round-trip, deploy, merge

**Shipped 2026-09-09.** One lane merged (**D8**), no integration fix needed, gates green,
`patina-designer-portal` deployed, `main` advanced. Worker version
**`cfa89e71-3d30-4723-9b08-6a7c99c9c21c`**; rollback id **`cf67abe9-65e1-4818-b7d1-8eaa9943d93d`**
(Wave 3b's deployment).

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c` on
`portal-polish/integration-w3c` (kept — it holds the prod `.open-next` build). `main` is
**`66a54ba00`**.

**The headline.** Wave 3c is the wave that stopped asserting and started proving. The three items
Wave 3b left owed are closed *and observed live*: the Desk and the document page now print **one**
date idiom (zero short-month literals anywhere on either surface), a **selected** scored control
stays charcoal under the pointer, and — the thing five waves had never done — **an object was
actually put into the private `room-renders` bucket through the real UI and taken back out again,
with postgres read at all three moments.** The orphaned-storage-object bug D6's review reported and
A3 wrote the cure for is now demonstrably dead, not merely unit-tested.

One thing this wave found that no earlier wave could: the standing concept-render plate **does not
paint under a local production build**, and the reason is CSP, not the feature. §6 has the
measurement and why production is unaffected.

---

## 0 · Waiting on Wave 2c

Per the brief, nothing shared was touched until Wave 2c wrote its ship report. A poll loop watched
`ship/w2c-ship.md` for ~48 minutes; read-only preparation ran meanwhile (the plan's Global
constraints and Shared-state table, house sheet §F, designer `CLAUDE.md`, `ship/w3b-ship.md` read
off `origin/main` because the shared checkout was four waves behind, `waves/w3c/d8-review.md`,
D8's own `d8-impl.md`, Wave 3b's two render scripts, and the designer `wrangler.jsonc` `vars`).

**A note for the next wave, correcting PROGRAM §4 item 25 in the other direction.** That item says
to poll `git ls-remote origin main` rather than a ship-report path, because reports are written in
throwaway worktrees and reach `origin/main` first. Both are true at once and the pair is what to
watch: **`w3b-ship.md` did not exist in the shared checkout at all** while this wave prepared — it
was only ever on `origin/main` — yet `w2c-ship.md` *did* land in the shared checkout, and that is
what fired the wait. Poll the ref for the merge subject; read the reports with `git show
origin/main:<path>`.

```
$ git fetch origin && git log --oneline -3 origin/main
1492cdcbc docs(portal-polish): W2c ship report, program close-out, lane reports, and the house renders
f7865c728 merge(portal-polish): wave 2c — cents residuals     ← the required subject
9b66cb83f docs(portal-polish): W3b ship report, program report, lane reviews, and the Desk renders
```

## 1 · Lane gate before merging

| Lane | Latest review | Verdict | Unresolved P1 |
|---|---|---|---|
| D8 | `waves/w3c/d8-review.md` | **approve** — "Every claim in `d8-impl.md` was independently re-run or re-derived from the diff and matched. No P1 or P2 found." | none |

Two P3/observational notes on D8, neither blocking. The first — that `formatCalendarDate`'s
timezone rework rests on reasoning plus a passing DST test rather than an explicit before/after
string table, in a file 71 others consume — is carried into §10. The second is D8's own list of
residuals it correctly surfaced rather than force-fixed; it is carried into §11.

## 2 · Merge

A real `--no-ff` merge onto `portal-polish/integration-w3c`, cut from `origin/main` `1492cdcbc`.
**No conflict** — D8 is confined to `apps/designer-portal`, and Wave 2c touched only
`apps/client-portal`.

| # | Commit | Subject | Conflicts |
|---|---|---|---|
| 1 | `701856ef8` | `chore(portal-polish): integrate d8 — Desk residuals` | none |
| 2 | `9057b4d67` | `docs(portal-polish): W3c renders, the score-rule probe, and the first storage round-trip` | — |

Both D8 heads verified present: `git merge-base --is-ancestor 9fe8d4d5e HEAD` (code) and
`23239266f` (report) both true. 42 files changed, 712 insertions, 316 deletions against
`origin/main`.

**The commit-subject deviation, for the sixth time.** `merge(portal-polish): integrate d8 …` was
refused — `[BLOCK] Commit subject must use Conventional Commits`,
`scripts/hooks/patina-hooks.mjs:155-158`. Wording kept verbatim, type changed to `chore`, exactly as
W1/W3/W3b did. **The wave-level merge onto `main` kept `merge(portal-polish): wave 3c — Desk
residuals` exactly**, because a git *merge* commit never reaches that hook. Nothing used
`--no-verify`. PROGRAM §4 item 22 is confirmed a sixth time.

## 3 · Wave gates (integration worktree, real output)

Fresh-worktree preamble run first, now three steps per PROGRAM §4 item 21:
`pnpm turbo build --filter=@patina/designer-portal^...` (6 tasks, all cached, FULL TURBO), then
`pnpm --filter @patina/api-client build`, then `pnpm --filter @patina/aesthete-quiz build`. With all
three done up front, **no gate failed on a missing dist this wave** — the first wave that can say
so.

```
$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                                       (exit 0, no output)

$ pnpm --filter @patina/supabase test
Test Files  94 passed (94)
     Tests  1163 passed | 12 skipped (1175)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                       (exit 0, no output)

$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 549 passed, 549 total
Tests:       6810 passed, 6810 total
Snapshots:   12 passed, 12 total
Time:        23.554 s
```

Wave-3b baseline was **549 suites / 6807**. Now **549 / 6810** — **+3 tests, no suite gained, no
suite lost, no todo introduced.** The three are D8's own contract tests (two on the concept render's
hook-free body, one on the score rule).

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159    import/first
  use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks
```
The two known pre-existing errors — same rules, same files, same lines as the W3/W3b baseline — and
the total count is **unchanged at 205**. Not grown.

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts \
    src/lib/document/__tests__/action-rest-rules.test.ts
Test Suites: 4 passed, 4 total · Tests: 75 passed

$ git diff --stat origin/main HEAD -- .../shadow-gate.test.ts .../contrast.test.ts \
    .../rail-stock.test.ts apps/designer-portal/eslint.config.mjs
(empty — all four byte-unchanged)

$ pnpm --filter @patina/admin-portal build          exit 0, full route table emitted
$ pnpm --filter @patina/client-portal type-check    exit 0
```

`action-rest-rules.test.ts` is 75 tests here against W3b's 74 — D8's new score-rule contract test is
the extra one, and it is the only reason that four-suite total moved. **All four guarded files —
the three gate suites and `eslint.config.mjs` — are byte-unchanged from `origin/main`.**

## 4 · Renders

`waves/w3c/renders/desk-render.mjs` reuses Wave 3b's script for sign-in, the walkthrough dismissal,
the console/page-error filter and the overflow probe, and adds the two measurements this wave owes:
a short-month sweep of every text node on each surface, and a computed-style read of every
**selected** scored control at rest and under the pointer. `probe.mjs` beside it carries the clean-
console pass and the negative control.

**Local stack.** `pnpm supabase:reset` from the integration worktree, after confirming the host:
`npx supabase status` → `API_URL: http://127.0.0.1:54321`, `linked_project: null`. All seeds
replayed. Build and serve env passed **inline** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
plus the CLI's local demo anon/service keys, `SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`) — never a prod key, and the local host is echoed in
the command that started the build. `next build --webpack` + `next start -p 3000`, per PROGRAM §4
item 19. Port 3000 was free before, and released after.

| File | Surface | Viewport | scrollWidth / clientWidth |
|---|---|---|---|
| `renders/desk-1440x900.png` | `/desk` | 1440×900 | 1440 / 1440 ✅ |
| `renders/doc-1440x900.png` | `/doc/0384388c-…` | 1440×900 | 1440 / 1440 ✅ |
| `renders/orders-ledger-1440x900.png` | Orders ledger (studio drawer sheet) | 1440×900 | 1440 / 1440 ✅ |
| `renders/desk-390x844@2x.png` (+ `-viewport`) | `/desk` | 390×844 @2× | **390 / 390 ✅** |

**390 still holds.** W3b's one-line fix survives D8's date change; the widest element on the page is
`HTML` at exactly 390.

**Console errors: zero**, measured the honest way (`probe-report.json`) — sign in first, *then*
navigate to the surface under test, so the sign-in page's own pre-auth `_getUser` failure cannot be
charged to it. `{"desk":{"consoleErrors":[],"pageErrors":[]},"doc":{…[]},"orders":{…[]}}`. The
looser filter in `render-report.json` still shows the same two known pre-auth lines per viewport
that W3 and W3b documented; they land on the `/desk` URL during the sign-in redirect.

**Shadows: one, the permitted one.** `NAV.doc-elevated → rgba(44,41,38,.08) 0 1px 2px` =
`--elevation-sheet`, the single declaration `shadow-gate.test.ts` allows. Nothing this wave wrote
carries a shadow.

### PP-2, closed and visible — the wave's clearest result

The short-month sweep walks every text node and reports both idioms. Across all four surface/
viewport combinations:

| Surface | `Mon DD` short-month hits | day-month hits |
|---|---|---|
| `/desk` 1440 | **0** | `new lead — respond by 11 September`, `respond by 13 September`, `oldest due 4 September`, … |
| `/desk` 390 | **0** | same |
| document page 1440 | **0** | `Reconnect 15 September` |
| Orders ledger 1440 | **0** | same set, plus `~6 May`, `~25 May` |

W3b's divergence 1 was: *"the day's line reads `respond by 11 September`; the roster row directly
beneath it reads `New lead — respond by Sep 11`."* The roster row now reads
**`Marcus Wright · New lead — respond by 11 September`**. Both lines, one idiom. **Zero** short-month
literals remain on the Desk, the document page or the Orders ledger.

### D8 item 3, closed and visible

`.da-score-hover.da-score-on::after` at charcoal, measured by computed style on the Orders ledger:

| control | rest | **while hovered** |
|---|---|---|
| `LEDGER` (selected tab) | `rgb(44, 41, 38)` charcoal | **`rgb(44, 41, 38)` charcoal** ✅ |
| two selected filter chips (`all`) | `rgb(44, 41, 38)` | **`rgb(44, 41, 38)`** ✅ |

W3b observed this same tab going **clay** under the pointer. It no longer does.

**The negative control matters more than the positive one,** because a specificity bump is exactly
the kind of fix that can switch the hover raise off everywhere. It did not: of the **17** unselected
`.da-score-hover` controls on the same sheet, the three sampled (`THE WEEK`, `RECEIVING`, `VENDORS`)
each rest at `rgb(139,115,85)` aged oak and **still raise to `rgb(196,165,123)` clay on hover**.
Selected beats hovered; unselected still hovers. R139/PP-3 intact.

### Divergences still visible in these renders (reported, not fixed)

1. **The specimen's 390 reflow is still unbuilt** — day's line first under the greeting, sticky
   stage plates, the action column under the state sentence. No lane was ever given it; the ask
   stands from `w3-ship.md` §9 and `w3b-ship.md` §4.
2. **The 390 bottom bar is charcoal**, where §F-F asks for `--paper-doc` with a hairline top rule.
   Ruled, not a defect — "the mobile bar's colour and identity block stay as built."
3. **No boards rail** — `useRecentBoards` resolves empty on this seed, so `RecentBoardsStrip
   compact` renders nothing. D3's absence behaviour works; its *content* is still unproven live.
4. **The lens ladder's three fixed-width date registers** (`SEP 15`) were not reachable on this
   seed's surfaces, so D8's owed-forward item 1 is still unmeasured. See §10.

## 5 · The first storage round-trip

This is the wave's substantive new evidence, so it gets the whole apparatus. `renders/roundtrip.sh`
drives it end to end and writes `renders/roundtrip-evidence.txt`; the two Playwright legs are
`renders/concept-render-roundtrip.mjs`.

**What was never true before.** Five waves proved A3's delete-before-null ordering by unit test
(`invocationCallOrder`). `w3b-ship.md` §9 said it plainly: *"No storage round-trip. No object was
uploaded to or deleted from `room-renders`, locally or in prod."* And because D6's component still
used its own local `clearConceptRender`, the orphan bug was live regardless of what A3's hooks did.
D8 wired the hooks in; this wave checked the bucket.

**Target and why it is a real test of the RLS, not a bypass.** Aspen Loft Refresh
(`b0000000-…-00d1`) / Living Room (`b0000000-…-2c0b`). The project's `designer_id` **is**
`designer@patina.dev`, and `app_private.is_project_studio_member` — the gate on all four storage
policies 00580 installs — resolves through `public.is_studio_comember`, whose first clause is
`p_owner = auth.uid()`. So the write is authorized by the **signed-in user session**, through the
real UI. **No service-role key is used anywhere in the round-trip.**

```
BEFORE
  project_rooms: all four concept_render_* columns NULL
  storage.objects where bucket_id='room-renders': 0

UPLOAD leg  (Playwright: open the act → choose an 8×8 PNG → caption it → Upload)
  · room-container-text: "ADD A CONCEPT RENDER"
  · standing-caption:    "Concept render · Wave 3c round-trip proof · uploaded 8 September"

AFTER UPLOAD
  concept_render_url         b0000000-…-00d1/b0000000-…-2c0b/w3c-roundtrip.png
  concept_render_caption     Wave 3c round-trip proof
  concept_render_uploaded_at 2026-09-09 03:28:18.014+00
  concept_render_uploaded_by a0000000-0000-0000-0000-000000000004   (= designer@patina.dev)

  storage.objects
    bucket_id  room-renders
    name       b0000000-…-00d1/b0000000-…-2c0b/w3c-roundtrip.png
    owner      a0000000-0000-0000-0000-000000000004
    size_bytes 74
    mimetype   image/png
  objects_in_bucket: 1

REMOVE leg  (Playwright: press Remove)
  · after-remove-text: "ADD A CONCEPT RENDER"
  · plate-img-count:   0

AFTER REMOVE
  project_rooms: all four columns NULL again
  objects_in_bucket: 0
  storage.objects LIKE '%w3c-roundtrip.png%': 0
```

Four things this establishes that no test did:

* **The object path matches the layout the migration's comment specifies** —
  `<project_id>/<room_id>/<filename>` — so the storage policies' first-segment check is being fed
  what it expects.
* **The row's `uploaded_by` is the real signed-in designer**, not a service identity.
* **Remove deletes the object AND nulls the row.** The bucket is empty afterwards.
  **The orphan is gone.** This is the first direct evidence for it.
* **The upload is genuinely gated by user RLS**, so the four policies 00580 installed are live and
  permissive-enough for the studio that owns the project.

## 6 · The plate does not paint under a local production build — and why prod is fine

The first round-trip screenshot showed the `<img>`'s **alt text**, not the image. That is the
difference between "the signed URL works" and "the client-facing plate is broken", so it was
measured rather than waved past (`renders/plate-probe.mjs`, `plate-probe.json`).

```
img.naturalWidth        0          ← never decoded
img.complete            true
fetch(img.src)          200, image/png, 510 bytes     ← the URL itself is perfect
requestfailed           …/room-renders/…/plate-probe.png :: csp
```

The signed URL is correct and serves the file. The `<img>` load is blocked by **Content-Security-
Policy**. `apps/designer-portal/next.config.js:95-97`:

```js
isDevelopment
  ? "img-src 'self' data: https: blob: http://localhost:* http://127.0.0.1:*"
  : "img-src 'self' data: https: blob:",
```

`isDevelopment` is `process.env.NODE_ENV === 'development'` (`:11`). A render pass **must** use
`next build` + `next start` on this machine (PROGRAM §4 item 19), which is `NODE_ENV=production` —
so the local-http allowance is off, and a `http://127.0.0.1:54321` signed URL is refused.

**The control, run to be sure CSP is the whole cause** (`BYPASS_CSP=1`, same script, same build):

```
img.naturalWidth  240      img.naturalHeight 160      ← the plate paints
requestFailures   (room-renders no longer listed)
```

`renders/concept-render-standing-nocsp.png` shows it: the 92px plate, the caption
`Concept render · plate probe · uploaded 8 September`, and REPLACE / REMOVE beneath.

**Production is unaffected.** There the signed URL is
`https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/sign/room-renders/…`, matched by the
`https:` token that is present in *both* branches. Two further reasons to be confident this is an
environment artifact and not a feature defect: a **seeded `product-images` public URL on the same
page is blocked identically**, and the failure disappears the instant CSP is lifted with no other
change. It is logged in §10 anyway, because the next person to render locally will hit it and should
not have to re-derive it.

## 7 · Deploy

```
$ npx wrangler deployments list --name patina-designer-portal     # BEFORE
… bottom row: 2026-09-09T01:44:22.195Z  cf67abe9-65e1-4818-b7d1-8eaa9943d93d   ← ROLLBACK ID

$ ./infra/deploy-portal.sh designer
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
Uploaded patina-designer-portal (20.58 sec)
Deployed patina-designer-portal triggers (0.93 sec)
Current Version ID: cfa89e71-3d30-4723-9b08-6a7c99c9c21c
==> Done: designer portal deployed to production.

$ npx wrangler deployments list --name patina-designer-portal     # AFTER
… bottom row: 2026-09-09T03:34:01.317Z  cfa89e71-3d30-4723-9b08-6a7c99c9c21c   ← NEW
```

**Env.** W2b/W3b's recipe: the 15 prod literals from `apps/designer-portal/wrangler.jsonc` `vars`
were **exported for the one invocation**, with `SUPABASE_ORIGIN_RUNTIME` deliberately left unset at
build time (it is a Worker runtime var; the preflight carve-out passed and the banner above confirms
it — and the deploy log shows Cloudflare binding it as an Environment Variable regardless). An
exported value wins over any `.env` file in `infra/deploy-portal.sh`, which is why this works from a
worktree that has no `.env.local` at all.

**Rollback:** `npx wrangler rollback cf67abe9-65e1-4818-b7d1-8eaa9943d93d --name patina-designer-portal`

## 8 · Smoke

1. **Bottom row is the new deployment** — `cfa89e71…`, 2026-09-09T03:34:01Z. ✅

2. **The served Desk chunk.** Named from the bundle this deploy uploaded
   (`.open-next/assets/_next/static/chunks/app/(document)/desk/page-41e7996561dea2b5.js`) and then
   fetched **from prod** (`200`, 63,546 bytes):

   | String | Occurrences |
   |---|---|
   | `respond by` | 1 |
   | `new lead — respond by` | 1 |
   | `overflow-wrap:anywhere` | 2 (W3b's two) |
   | `en-US` | **0** |
   | `Sep `/`Jan `/`Feb `/`Mar `/`Apr `/`Jun `/`Jul `/`Aug `/`Oct `/`Nov `/`Dec ` | **0 each** |

   **No short-month literal remains in the roster module.** That is the check the brief named, and
   it passes outright.

3. **`en-GB` is no longer in the Desk chunk — and that is the change working, not a miss.** W3b
   counted 4 there. D8 moved the roster's dates out of `desk-derivation.ts`'s module-private
   `fmtDay` and into the shared `dates.ts`, so the locale literal moved with it, into the shared
   chunk `5107-211bed2a9819f3c8.js`. Fetched **from prod** (`200`, 20,315 bytes), it carries all
   five of `dates.ts`'s formatters:

   ```
   en-GB",{day:"numeric",month:"long",year:"numeric"}   legalDate
   en-GB",{day:"numeric",month:"long"}                  dayMonth
   en-GB",{month:"long"}                                MONTH_NAME_FORMAT
   en-GB",{weekday:"long"}                              WEEKDAY_FORMAT
   en-GB",{weekday:"short"}                             WEEKDAY_SHORT_FORMAT  ← D8's one new export
   ```

   Short-month literals in that chunk: **0**. Its single `en-US` is
   `{style:"currency",currency:"USD",maximumFractionDigits:0}` — the **money** formatter, exactly the
   carve-out D8 documented (en-GB with USD prints `US$17,500`). Not a date.

4. **`npx wrangler tail patina-designer-portal`** for ~60s while loading `/auth/signin` and `/desk`
   five times each: **10 events, all `outcome: ok`, 0 exceptions, 0 error logs**, statuses 200×5 /
   307×5, every event stamped `scriptVersion cfa89e71-3d30-4723-9b08-6a7c99c9c21c`. **No error
   spike.**

5. **Signed-in prod walk — NOT done.** Unchanged from W1/W2/W2b/W2c/W3/W3b: `e2e/fixtures/auth.ts`
   carries only the local seed and `playwright.config.ts` pins `baseURL` to `http://localhost:3000`.
   No prod credential exists anywhere in the repo. **Still owed to Kody.**

## 9 · Merge to main

```
$ git push -u origin portal-polish/integration-w3c
 * [new branch]  portal-polish/integration-w3c
$ git ls-remote origin portal-polish/integration-w3c
9057b4d67b595891a26ab10ec6eac724f894475e

$ git worktree add .../agent-pp-main3c -b portal-polish/to-main-w3c origin/main
$ git merge --no-ff origin/portal-polish/integration-w3c \
      -m "merge(portal-polish): wave 3c — Desk residuals"
66a54ba00   (no conflicts)

$ git push origin portal-polish/to-main-w3c && git push origin portal-polish/to-main-w3c:main
   1492cdcbc..66a54ba00  portal-polish/to-main-w3c -> main

$ git merge-base --is-ancestor origin/portal-polish/integration-w3c origin/main
CONFIRMED: integration-w3c is an ancestor of origin/main
$ git ls-remote origin main
66a54ba007027368cd33cbbd321b7d8d905c3445
```

`main` = **`66a54ba00`**, subject `merge(portal-polish): wave 3c — Desk residuals` exactly as the
plan names it. `main` had not moved during the wave. `agent-pp-main3c` was removed after the report
push.

## 10 · What was NOT verified

* **No signed-in walk against production** (§8.5).
* **The standing plate was never seen painting against a `https:` origin** — only against local
  http with CSP lifted (§6). The prod path is argued from the CSP text and the URL scheme, not
  observed.
* **The lens ladder's three date registers** (`SEP 15`, D8's owed item 1) were not on any surface
  this seed rendered, so the truncation risk behind leaving them short is still unmeasured.
* **`Nothing needs your hand today.`** and the day's line's third (answered-note) line were again
  never reached by this seed; both are unit-tested and present in the served bundle.
* **`formatCalendarDate`'s timezone rework was not proved by a before/after string table** — D8's
  reviewer's one substantive P3. It now builds a local-noon `Date` from the UTC Y/M/D parts and
  formats with the local `LEGAL_DATE`/`MONTH_NAME_FORMAT` formatters, where the timestamp branch
  previously passed `timeZone: 'UTC'` explicitly. The reasoning is sound and the suite's own
  DST/timezone-loss test runs in `America/Chicago` and passes, but 71 files consume that module and
  no wave has enumerated their rendered output.
* **No e2e run.** The designer portal's Playwright suite is not in this wave's gate list.
* **The 390 measurement is Chromium's `isMobile` emulation at 390×844@2×**, not a real device.
* **The round-trip ran against the local stack only.** No object was written to or deleted from the
  **prod** `room-renders` bucket, and no prod room has a concept render.
* **`Replace` was never exercised** — the round-trip covers Add and Remove. The upsert-at-same-path
  behaviour that stops a replace from accumulating orphans is still unit-test-only.
* **Prettier drift is unresolved and advisory** across D8's 41 touched files; all of it pre-existing
  on `origin/main` (W3b verified this for the same files), and this wave introduced none.

## 11 · Owed to Kody

**Closed by this wave** — three of the five items W3b left: PP-2's `fmtDay` on the Desk and the
document page; the `.da-score-on`-versus-hover ruling (D8 made the one-line fix and it is now
observed live); and A3's hooks wired into `concept-render-upload.tsx`, **with the orphan proved
dead against a real bucket**.

**Still open, carried forward**

* **Signed-in prod walks** of the Desk (`app.patina.cloud`) and the house page
  (`client.patina.cloud`) — no prod credential exists in the repo. Six waves have said so.
* **The specimen's 390 Desk reflow** — day's line first under the greeting, sticky stage plates, the
  action column under the state sentence. The overflow half closed in W3b; the reflow half has never
  had a lane. **This is the largest remaining piece of the Desk specimen.**
* **The `.t-*` type-step classes exist in neither portal.** Both tracks matched the sheet's values
  through local utilities. A cross-portal adoption decision.
* **`--hairline-strong` in the designer portal** — not defined; D1's rule uses `--doc-ink-border`.
  Add the alias or bless the fallback.
* **The desk walkthrough dialog `aria-hidden`s the entire Desk while open** — pre-existing chrome,
  and the first thing a new designer's screen reader meets.
* **No index on `project_notes.answered_at`** — D1's 60s poll filters on it with `gte`. Inert at
  studio scale, and a one-line `00581` when it stops being.

**New from Wave 3c**

* **The local-render CSP trap** (§6). Add `http://127.0.0.1:*` to the non-dev `img-src` branch, or
  document that locally-served private-bucket images will not paint under `next build`. Whoever
  renders the concept render next will otherwise report a broken plate that is not broken.
* **`Replace` on a concept render is unproven end to end.** The hook upserts at the same path; a
  round-trip for it is ten minutes now that the harness exists (`renders/roundtrip.sh`).
* **D8's two remaining PP-2 residuals, both needing a ruling rather than code:** the lens ladder's
  fixed-width registers (`SEP 15` inside `cap(…, 40)` — growing it to `15 SEPTEMBER` risks the
  truncation the sheet forbids, so it wants a render or a ruling), and `2:00 PM` vs `2:00 pm` in
  `desk-derivation.fmtDayTime` / `ceremony-schedule.fmtCeremonySlot`.
* **`field-sms.fmtFieldDate` now reads `Tue 14 July`, and that string leaves the building** in an
  SMS to a US trade. Changed because it sat inside the grep path. If outbound SMS should keep a US
  idiom, that is one line and one test.
* **Money stays `en-US` in seven places** by design (en-GB with USD prints `US$17,500`). If the
  house wants that as a rule rather than a comment in `format.ts:70-71`, it belongs in
  `DECISIONS.md`, which no build lane may write.

## 12 · Worktrees

* `agent-pp-int3c` (`portal-polish/integration-w3c`) — **kept**; dists built, holds the prod
  `.open-next` build.
* `agent-pp-main3c` (`portal-polish/to-main-w3c`) — **removed** after the report push.

Full sweep list in `PROGRAM.md` §8 ("Worktrees to sweep"). Every `portal-polish/*` branch, **`d8` now included**, is pushed
and an ancestor of `main`; nothing on disk holds unmerged work.
