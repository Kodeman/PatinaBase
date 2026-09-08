# Wave 2 ship report — the house page (client portal)

**Shipped 2026-09-08.** Six lanes merged, gates green, `patina-client-portal` deployed, `main`
fast-forwarded. Worker version **`99bc3971-d33d-47da-ac72-97112d71b1c9`**; rollback id
**`f46e2e19-a806-45d1-853e-28a007533724`**.

Integration worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int` on
`portal-polish/integration` (kept). `main` is `f5fd0aeb4`.

---

## 1 · Lane gate before merging

Every lane's re-review carries **approve** and no unresolved P1 (h1, h2, h3, h4, h5, h6 —
`waves/w2/h*-rereview.md`). Nothing blocked the wave.

---

## 2 · Merges

Order as planned, real merges, the merged lane's jest scope re-run after each.

| # | Commit | Subject | Conflicts | Jest after |
|---|---|---|---|---|
| 1 | `5b6676143` | `chore(portal-polish): integrate h2 — house-sheet tokens and the seven type steps` | none | `house-sheet-tokens.test.ts` — 1 suite / 19 tests |
| 2 | `2f7f6ca13` | `chore(portal-polish): integrate h1 — letterhead, colophon, the mat` | none | `src/components/threshold` — 41 suites / 1028 tests |
| 3 | `e2e132cc8` | `chore(portal-polish): integrate h4 — action tiers and the gates` | none (globals.css and invoice-sheet.tsx auto-merged on disjoint regions) | `threshold` + `app/pay` — 48 suites / 1139 tests |
| — | `c3c924b9c` | `chore(portal-polish): dedupe the .consequence rule into H2's type block` | — | 49 suites / 1158 tests |
| 4 | `dcac7e499` | `chore(portal-polish): integrate h3 — landmark ledger and the story pole` | none | `threshold` — 44 suites / 1087 tests |
| 5 | `1cf28aea1` | `chore(portal-polish): integrate h5 — rooms, plates and the concept render slot` | none | `threshold` — 46 suites / 1133 tests |
| 6 | `e9589197d` | `chore(portal-polish): integrate h6 — the money block and one date` | **1** — `story-pole.tsx` import block | — |
| — | `d380530d5` | `chore(portal-polish): settle the cross-lane seams` | — | `threshold` + `lib/threshold` + `app` — 104 suites / 1911 tests |
| — | `5a846bd53` | `test(client): wave 2 e2e — sign out, the landmarks, the consequence, the owed figure, the pole` | — | full suite (§3) |

The commit-msg hook rejects a `merge(...)` type, so the six lane merges took the plan's
`chore(portal-polish): …` form (Wave 1's precedent); the merge onto `main` kept
`merge(portal-polish): wave 2 — the house page`.

**The one conflict.** `story-pole.tsx` — H3 added the `ScoredAction` import, H6 added
`DAY_MONTH_FORMAT`/`MONTH_NAME_FORMAT` from `lib/threshold/dates`, at the same line. Both are used
(H3 at `:192`, H6 at `:75`/`:83`/`:87`), so both were kept. No hunk was dropped anywhere in the wave.

**Cross-lane seams settled at integration**, exactly the three the brief named:

1. `.consequence` was declared twice — H2's type block (`globals.css:304`) and a local copy H4 had
   added so its gates had the rule before H2 merged. H4's copy is gone; H2's stands. The two bodies
   were identical (`--ink` is `var(--color-charcoal)`, `globals.css:88`).
2. `letterbox.tsx` carried `const TERMINAL = 'terminal' as ScoredActionVariant` with a `TODO(H4)`.
   H4's variant is present (`scored-action.tsx:42-47`), so the cast, its comment and the now-unused
   `ScoredActionVariant` import are gone; the act passes `variant="terminal"` directly.
3. `room-band.tsx` had its own `LEGAL_DATE` formatter for the concept-render caption. It now calls
   H6's `legalDate` from `lib/threshold/dates`, and the local formatter is gone.

---

## 3 · Wave gates (integration worktree, real output)

**Local stack.** `apps/client-portal/.env.local` did not exist in the worktree; created from
`.env.example` with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the CLI's local demo anon
key from `supabase status` (never a prod key), `SUPABASE_SERVICE_ROLE_KEY` left empty. Verified
`http://127.0.0.1:54321` before the reset. The file is gitignored (`apps/client-portal/.gitignore:26`).

```
$ pnpm supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.66 |    71.57 |   75.77 |   77.97 |
Test Suites: 142 passed, 142 total
Tests:       2417 passed, 2417 total
Snapshots:   1 passed, 1 total
```
Coverage floor is 70/60/70/70 (`jest.config.js:71-78`): **75.66 / 71.57 / 75.77 / 77.97** — every
metric clears it.

```
$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```
Baseline confirmed independently, not assumed: the same command in
`.codex/worktrees/agent-pp-h2` (`origin/main` + H2's CSS only) reports **63 problems (11 errors, 52
warnings)**. The count did **not** grow — not the errors, not the warnings. All 11 errors are
React-compiler rules in files this wave did not change.

### e2e

`tests/threshold.spec.ts`, single chromium project, server on :3002 (nothing else was on that port).
Extended per the plan with five new cases, plus two existing assertions that the wave changed by
design:

* `INVOICE_DUE_DAY` was composed `en-US` ("September 15"); the page now prints one idiom, so it is
  `en-GB` ("15 September") — H6/PP-2.
* the wall's accept act asserted `toBeDisabled()`; R139 made unavailable `aria-disabled`, so it
  asserts `aria-disabled="true"` **and** the absence of the native attribute — H4/PP-3.

New cases: `Sign out` once on the mat (and "Leave the house" absent from the page); the five
landmarks, each href resolving to an element that renders, `data-never-dim` on `#letterbox`; **a
landmark omitted when its target is absent** (the three-house client's Aspen Loft has no `#wall`,
no `#door`, no `#approval-*`, so "What needs you" is not printed — four landmarks, not five, and
never a disabled one); the wall gate's consequence sentence present *before* the act is armed and
positioned above it; the owed figure as the announced figure (`.t-d2`, larger than the stands
sentence, the reconciling sentence naming the figures, no `$0.00` placeholder); the story pole's
labels as real anchor links with the caret still not a control.

```
$ npx playwright test tests/threshold.spec.ts --reporter=list --workers=1
  22 passed (2.9m)
```

An earlier run showed the composed-agreement signing test red. That test consumes its fixture — the
spec says so at its head ("run twice against one stack without a reset and the second run finds a
door already open") — and I had run it in isolation beforehand. After `pnpm supabase:reset` the full
file is 22/22 green. One earlier fully-parallel run also flaked that same test; serial is clean.

---

## 4 · Renders

`artifacts/portal-polish-build-2026-09-08/waves/w2/renders/render.mjs` signs in as
`client-solo@patina.dev` with `threshold.spec.ts`'s own disclosure-then-password helper, opens Cedar
Lane Study and shoots full-page.

| File | Viewport | scrollWidth / clientWidth | Console errors |
|---|---|---|---|
| `renders/house-1440x900.png` | 1440×900 | 1440 / 1440 | 2, both local-stack (below) |
| `renders/house-390x844@2x.png` | 390×844 @2× | 390 / 390 | 1, local-stack (below) |

**One blocker found and fixed.** At 390 the page scrolled sideways — `scrollWidth 457 > clientWidth
390`. The offenders were H3's new ≤600px story-pole bar: the "You are in: …" act is
`whitespace-nowrap shrink-0` (the shared `BASE_CLASS`) and the chapter dots beside it were pushed 67px
past the edge. Fixed minimally, layout only, in `story-pole.tsx` — the bar's flex row gains
`flex-wrap` with `gap-x-3 gap-y-2`, so the dots drop to a second line rather than off the page. The
sheet's "no truncation — wrap" answer, not a hidden overflow. Every gate above was re-run after the
fix and the numbers quoted are the post-fix ones.

**The remaining console errors are the local stack, not the page**, and neither can occur in prod:

* `img-src` CSP refusing `http://127.0.0.1:54321/storage/v1/object/public/product-images/…` — the
  policy at `next.config.js:126` allows `https:`, and prod storage is https. No lane touched
  `next.config.js` or `middleware.ts` (`git diff --stat origin/main...HEAD` on both is empty).
* one `ERR_CONNECTION_REFUSED` at 1440 for a local service that is not running.

The dark circular "N" at the left edge of the 1440 shot is Next's dev-indicator badge; it is not in
the DOM (no element with that text) and does not exist in a production build.

### Divergences from `specimens/client-house.html` (reported, not fixed here)

1. **No cents.** The specimen sets `$4,060.00`, `$11,100.00`, `$0.00`; the page prints `$4,060`,
   `$11,100`, `$0`. `h6-impl.md` flagged this and left it: whole-dollar is what nine suites pin.
   **Needs a ruling** if Kody wants the specimen's cents.
2. **The due date drops the year.** Specimen "due 11 September 2026"; the page prints "due 15
   September" because H6's rule spells the year only when it is not this year. Consistent with
   `dates.ts`, inconsistent with the specimen.
3. **The money block is two sections, not one.** The specimen has one `#letterbox` carrying the
   figure, the drawing, the consequence sentence and a `Pay $4,060.00` terminal act. The page keeps
   `#ledger` (figure, due line, reconciling sentence) and `#letterbox` (drawing, "Open the
   letterbox", "Print"). Both ids are on the no-rename list; H6 declined to merge them as out of
   scope, correctly.
4. **The Pay terminal act is one disclosure deep.** Only one `[data-action-variant="terminal"]`
   renders at rest (the wall gate's). The letterbox at rest offers `Open the letterbox` (secondary)
   and `Print`; the terminal Pay act with the amount and its consequence sentence live inside the
   opened letterbox. The specimen shows it at rest. The checkout path itself is green in e2e.
5. **The wall act carries no amount on this fixture.** Specimen: "Accept the finished work ·
   $2,980.00" over "Accepting releases $2,980.00 to Marta Voss…". The page renders "Accept the
   finished work" over "Accepting records that this work is finished. It does not close the project
   or change your invoice." — H4's honest fallback, because the seed's trade scope has no draw with
   `gatesOnAcceptance`. Code, not copy: a fixture gap, worth seeding if the amount-in-label is to be
   seen.
6. **Two landmark targets differ from the specimen** — "Where we are" → `#doorstep` (specimen
   `#story-pole`) and "The papers" → `#mat-papers` (specimen `#previously`). Both follow the plan's
   Lane H3 table, which outranks the specimen here.
7. **The held graduation's tick touches its label.** At desktop the story pole's held mark runs into
   the "I" of INSTALLATION with no gap, where the other graduations have one. Legible, nothing
   clipped — cosmetic, ~2px.
8. **"You are in: You stand at the doorstep"** reads doubled on the ≤600px bar when the section
   label is a sentence. H3's copy; a rewording, not a defect.
9. **"Leave the house" still exists in the portal** — at
   `src/components/projects/ProjectsEmptyState.tsx:66`, a surface no lane owned. It is off the house
   page (the e2e asserts the body never contains it there).

---

## 5 · Deploy

```
$ pnpm --filter @patina/client-portal type-check      # on 5a846bd53
> tsc --noEmit                                        (exit 0)

$ npx wrangler deployments list --name patina-client-portal    # BEFORE
… bottom row: 2026-09-08T14:54:52Z  f46e2e19-a806-45d1-853e-28a007533724   ← ROLLBACK ID

$ ./infra/deploy-portal.sh client
Total Upload: 12785.04 KiB / gzip: 2574.05 KiB
Uploaded patina-client-portal (28.30 sec)
Deployed patina-client-portal triggers (1.35 sec)
Current Version ID: 99bc3971-d33d-47da-ac72-97112d71b1c9

$ npx wrangler deployments list --name patina-client-portal    # AFTER
… bottom row: 2026-09-08T23:06:54Z  99bc3971-d33d-47da-ac72-97112d71b1c9   ← NEW
```

The script's preflight refuses a local-pointed build, and the worktree's `.env.local` pointed at
`127.0.0.1` for the gates. For the build only, that file was moved aside and the main checkout's
`apps/client-portal/{.env.local,.env}` (the prod build env) copied in; the deploy log confirms the
inlined values (`NEXT_PUBLIC_SUPABASE_URL https://bkvcixdmuyejfzcijpdg.supabase.co`,
`NEXT_PUBLIC_ENV production`, `NEXT_PUBLIC_APP_URL https://client.patina.cloud`). The local-stack
`.env.local` was restored immediately after, verified back at `http://127.0.0.1:54321`. The dev
server on :3002 was stopped before the build (never `next build` over `next dev`).

**Rollback:** `npx wrangler rollback f46e2e19-a806-45d1-853e-28a007533724 --name patina-client-portal`.

---

## 6 · Smoke

1. **Bottom row is the new deployment** — `99bc3971…`, 2026-09-08T23:06:54Z. ✅
2. **Served chunks carry the wave's strings.** `https://client.patina.cloud/auth/signin` → 200; its
   chunk list includes `common-8c32fab7858db855.js`, which is the chunk that carries the house page's
   components. Fetched from prod (1,045,002 bytes, 200) and grepped:

   | String | Occurrences in the served chunk |
   |---|---|
   | `Sign out` | 3 |
   | `Where we are` | 1 |
   | `What changed` | 1 |
   | `What you owe` | 1 |
   | `What needs you` | 2 |
   | `The papers` | 1 |
   | `Accept the finished work` | 2 |
   | `You are in:` | 1 |
   | `Prepared by` | 1 |
   | `Leave the house` | 1 (the untouched `ProjectsEmptyState`, see divergence 9) |
3. **`npx wrangler tail patina-client-portal`** for ~60s while loading the sign-in page and `/`
   five times: **13 events, all `outcome: ok`, zero exceptions, zero error logs**, statuses 200×9 /
   307×4, every event stamped `scriptVersion 99bc3971-d33d-47da-ac72-97112d71b1c9`. No error spike.
4. **Signed-in prod walk — NOT done.** Searched the e2e helpers for a prod tester credential: the
   only accounts are the local seeds `client-solo@patina.dev` / `client@patina.dev` /
   `designer@patina.dev` with `password123`, and `playwright.config.ts` pins the suite at
   `http://localhost:3002` and the local Supabase. No prod credential exists in the repo.
   **Owed to Kody: signed-in prod walk of the house page.**

---

## 7 · Merge to main

```
$ git -C .../agent-pp-int push origin portal-polish/integration
   bf25e56c4..5a846bd53  portal-polish/integration -> portal-polish/integration

$ git -C /Users/kody/Code/patina-merged worktree add .../agent-pp-main -b portal-polish/to-main-w2 origin/main
$ git -C .../agent-pp-main merge --no-ff origin/portal-polish/integration -m "merge(portal-polish): wave 2 — the house page"
f5fd0aeb4
$ git push origin portal-polish/to-main-w2 && git push origin portal-polish/to-main-w2:main
   1059f5275..f5fd0aeb4  portal-polish/to-main-w2 -> main

$ git merge-base --is-ancestor origin/portal-polish/integration origin/main
ANCESTOR: integration is in main
```

`main` = **`f5fd0aeb4`**. `agent-pp-main` removed; `agent-pp-int` kept.

Wave diff: **75 files, +5,193 / −635** (`1059f5275..5a846bd53`).

---

## 8 · Owed

* **Owed to Kody: a signed-in prod walk of the house page** — no prod tester credential exists.
* **A ruling on cents** in the money block (divergence 1) and, with it, whether the due line spells
  the year the way the specimen does (divergence 2).
* **Seed a `gatesOnAcceptance` draw** on the trade scope so the wall act can carry its amount
  (divergence 5) — today the fallback sentence is what a real client sees.
* **`--hairline`** — H5 wanted the sheet's `#E8E3DB` for plate borders; H2's alias block does not
  define it and §A10 forbids borrowing `--rail` for a stroke, so the plates use the portal's
  `--border-default` (`#E5E2DD`). Either add the alias or bless `--border-default` on the sheet.
* **`<TheNote studioName>`** — H1's three-part signature only reaches production once
  `threshold.tsx:1085` passes the studio name; no lane owned that call site.
* **`.act--inline` / `InlineAct`** (H3) is not on the plan's shared-file table; there is exactly one
  implementation, but the table should name it before another lane touches prose-inline acts.
* **`formatCurrency` vs `moneyInWords`** on the wall gate (H4's `h4-2`) — prose caption beside a
  cents-precision consequence. A register call, still unmade.
* Wave 2 deployed **the client portal only**. No migration, no edge function, no other Worker.
