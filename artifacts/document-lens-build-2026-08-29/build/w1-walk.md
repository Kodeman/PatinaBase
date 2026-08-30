# W1 walk — Smart Lens, post-integration-merge

Dev server booted from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration`
(branch `document-lens/integration` @ `7c8b33e39`), `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
flag overrides `call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true,the-document-pilot:true`,
local Supabase URL/anon key inline (copied verbatim from `apps/designer-portal/playwright.config.ts`
`webServer.env`). Shot with `build/w1-walk.mjs` (copied from `build/w0-walk.mjs`, same
sign-in/welcome-shown/hide-dev-overlays technique as `e2e/fixtures/auth.ts` /
`e2e/helpers/hide-dev-overlays.ts`), signed in as `designer@patina.dev`. 16 PNGs in
`build/w1-walk/` (12 required state shots + 4 extra clips) plus `build/w1-walk/measurements.json`.
Server left running.

## 1. Stale worktree cleanup

- Killed the pre-fix dev server (pid 41483, `node` under
  `.codex/worktrees/agent-lens-w1-int/apps/designer-portal`) and its media-service child
  (pid 41560, port 3014); ports 3015/3016 were already free.
- Confirmed `git merge-base --is-ancestor document-lens/w1 document-lens/integration` → true,
  then `git worktree remove --force /Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-w1-int`
  → succeeded, gone from `git worktree list`.
- `pnpm install` in the integration worktree (node_modules was missing) → succeeded, 24.3s.
- Booted `pnpm dev:designer`; `/desk` returned 307 on the 2nd poll.

## 2. Seed verify — `build/seed/seed-verify.sql` against `supabase_db_supabase`

All **17/17 checks PASS**:

| check_name | actual | expected | result |
|---|---|---|---|
| a non-clean receiving_inspections row exists | 1 | >= 1 | PASS |
| a separate PO reaches clean-delivered >= 1 | 1 | >= 1 | PASS |
| blocked lines = 2 (console + COM) | 2 | = 2 | PASS |
| damaged = 1 | 1 | = 1 | PASS |
| install milestone = current_date + 21 | 2026-09-19 | 2026-09-19 | PASS |
| lines >= 60 | 62 | >= 60 | PASS |
| lines with product >= 40 | 58 | >= 40 | PASS |
| margin_items beside Pieces (anchor=line) = 3 | 3 | = 3 | PASS |
| margin_items total = 7 | 7 | = 7 | PASS |
| margin_items whole job (anchor=letterhead/section) = 4 | 4 | = 4 | PASS |
| open damage_claims on a line of this project = 1 | 1 | = 1 | PASS |
| overdue approvals = 2 | 2 | = 2 | PASS |
| PO unacknowledged >= 14d = 1 | 1 | = 1 | PASS |
| pre-work doc d6 exists (sent, unopened) | 1 | = 1 | PASS |
| purchase orders >= 3 | 4 | >= 3 | PASS |
| rooms >= 4 | 5 | >= 4 | PASS |
| unspecified = 2 | 2 | = 2 | PASS |

## 3. Acceptance table

| # | Bullet | Status | Evidence |
|---|---|---|---|
| 1 | Rail head prints `← Put down` above a reserved head with household | **seen** | `w1-1440-spine-clip.png`, `w1-1440-s0-project.png`: "← PUT DOWN" (link outside `[data-spine-head]`, per code) then "Client User" (household) inside the head block. |
| 2 | Seven-mark arc | **seen** | Same clips: one un-wrapped row of 7 marks at 1440 (`w1-1440-spine-clip.png`), wrapped 4+3 at 1280 (`w1-1280-spine-clip.png`). |
| 3 | `PROCUREMENT & ORDERS` / `4 OF 6`-style stage phrase (whatever the seed prints) at 1440 | **differs** | The rail's `data-spine-stage-phrase` actually prints **"PROJECT" / "ACTIVE · WEEK 11"** (section label + `activeSub()` from `section-derivation.ts`, e.g. `Active · Week 11`) — never an "N OF M" count. The literal string `PROCUREMENT & ORDERS · 3 OF 5` **does** appear on this document, but on the **paper's own section-fold header** ("THE JOB · PROJECT · PROCUREMENT & ORDERS 3 OF 5", visible in `w1-1440-s0-project.png`/`w1-1440-s2-project.png`), not in the rail. A stage phrase does print in the rail head (satisfying the general shape of the bullet) but never in the `X OF Y` form the bullet describes, and it is not the letterhead's phrase. |
| 4 | At 1280 the arc wraps 4 + 3 | **seen** | `w1-1280-spine-clip.png`: 4 marks first row, 3 marks second row. |
| 5 | Every label prints as words (at 1280) | **seen** | `w1-1280-spine-clip.png`/`w1-1280-s0-project.png`: "PUT DOWN", "Client User", "PROJECT", "ACTIVE · WEEK 11" all spelled out in full, no truncation to glyphs/abbreviations. |
| 6 | No timer/presence in the rail | **seen** | Neither clip shows a clock/elapsed-time or presence indicator anywhere in `[data-document-spine]`; confirmed in code — `doc-spine.tsx`'s own comment states the timer/presence line was evicted (OD-16), and no such element rendered. |
| 7 | Letterhead has no `Phases` toggle | **seen** | `w1-1440-s0-project.png`/`w1-1280-s0-project.png`: letterhead reads "Procurement START Jun 10 × TARGET Oct 21 × SET A BUDGET BAND" — no "Phases" text/toggle anywhere on the letterhead in any shot (project or prework). |
| 8 | No dash placeholders — an unset vital prints an act like `Set dates` | **seen** | Same letterhead line: the unset budget vital prints the act **"SET A BUDGET BAND"** rather than a dash. No literal `—`/`-` placeholder characters seen standing in for a vital on the letterhead. |
| 9 | Letterhead has no in-hand row | **seen** | No "In hand · …" text anywhere on the letterhead in any of the 12 state shots. (The rail's own `roomInHand` row is null throughout this walk — no room was taken in hand — so its absence is not itself conclusive of the letterhead behavior, but no candidate in-hand element renders on the letterhead in any shot.) |
| 10 | Margin at 1440: group headings `BESIDE PIECES · 3` / `THE WHOLE JOB · 4` | **differs** | `w1-1440-s0-project.png`: headings actually read **"BESIDE PIECES · 1"** / **"THE WHOLE JOB · 2"**, with a collapsed **"SETTLED · 4"** section below. Root cause (`margin-rail.tsx:427-455`): `anchorGroups` is built only from `raised` (unresolved) items, not the anchor's full membership — so the seed's total-per-anchor counts (3 beside-pieces, 4 whole-job, confirmed by seed-verify) split into 1 raised + 2 settled (beside) and 2 raised + 2 settled (whole job). Internally consistent (1+2 raised = 3 = the margin tab's count; 2+2 settled = 4 = "SETTLED · 4"; 3+4 = 7 total), but the group-heading counts are "raised in this anchor," not "total in this anchor." |
| 11 | Per-card anchor lines | **seen** | `w1-1440-s0-project.png`: each margin card ends with an anchor line — "BESIDE PIECES" (reading-chair decision) or "ABOUT THE WHOLE JOB" (primary-bedroom decision, the sent invoice). |
| 12 | No duplicated `IN THE MARGIN` | **seen** | Exactly one "IN THE MARGIN" heading visible at 1440 (`w1-1440-s0-project.png`), confirmed in code: the sheet-header printing (1180–1439) is `min-[1440px]:hidden` and the rail-column printing is bare (only `min-[1440px]:block`) — the two are CSS-complementary and can never coexist. |
| 13 | Margin tab at 1280 reads `Margin · 7 · 1 OVERDUE` (or the seed's numbers) | **differs (numbers only, format confirmed)** | `w1-1280-margin-tab-closed.png`: tab reads **"MARGIN · 3 · 2 OVERDUE"**. The format (`Margin · <raised-count> · <overdue-count> OVERDUE`) matches the bullet's shape, but the count is the *raised* count (3), not the seed's *total* margin_items count (7) — same root cause as #10. Overdue count (2) matches seed-verify's "overdue approvals = 2" exactly. On the zero-margin prework doc (d6) the tab correctly degrades to the bare **"MARGIN"** with no counts (`w1-1280-s0-prework.png`), matching the documented zero-handling in `margin-rail.tsx` (`marginTabLabel` returns `'Margin'` before `worst` is consulted when `count === 0`). |
| 14 | Drawer's `In hand today` is a button | **seen** | `studio-drawer.tsx:520-531`: rendered as `<button type="button" data-drawer-timer-doorway onClick={() => openTimer()}>` whenever `holding && inHandToday > 0`. Visible in every desktop shot as "IN HAND TODAY 1h 38m" (project doc) / "1h 39m" (prework doc) in the bottom-right of the studio drawer. |
| 15 | At 390 the bar's left zone prints `IN THIS DOCUMENT` / household / `At <stop>` | **seen, with a visual caveat** | `w1-390-mobile-bar-clip.png`/`w1-390-s0-project.png`: prints "IN THIS DOCUMENT" / "Client User" / "AT CLIENT APP…" (truncated "At Client Approvals"). All three lines are present and `stopLabel` is populated (not null) on the project doc — contradicts the pre-integration correctness review's expectation that `readingIndex` was still unwired (A-08); it now resolves on the project doc. **Caveat:** a fixed circular "N" icon (bottom-left, present at every width, unrelated to this wave's rail/margin/bar work) visually overlaps the household line in every 390 shot — "Client User" reads with its leading "Cl" clipped behind the icon in some shots. Accessible name is unaffected (the aria-label is computed from data, not the visible clip), but the visible text is partially obscured. On the prework doc (d6) no "At …" line prints (`w1-390-s0-prework.png`) — `stopLabel` is null there, which the bar handles correctly by omitting the third line rather than printing "At null" or similar. |
| 16 | Sections door labelled `Open sections, at …` | **seen (by code + behavior)** | `mobile-bar.tsx:230-234`: the whole left-zone button's `aria-label` is `` `Open sections, at ${stopLabel}` `` when a stop is set, bare `'Open sections'` otherwise. Not independently verifiable from a screenshot (it's an aria-label, not visible text), but the same button visibly renders the "AT CLIENT APP…" third line on the project doc, confirming `stopLabel` is populated there, so the accessible name should carry the "at" clause on that document. |
| 17 | Grid at 1280 is 136px (`[data-document-spine]` boundingBox) | **seen — exact match** | Measured `spineWidth` = **136** at 1280 (see measurements below). |

## 4. Distinct rail text labels at 1440/s0

14 distinct trimmed lines from `[data-document-spine]`.innerText (in DOM order, de-duplicated):

1. `←` (Put-down link's icon glyph)
2. `PUT DOWN`
3. `Client User`
4. `PROJECT`
5. `ACTIVE · WEEK 11`
6. `ON THIS PAPER`
7. `Client approvals`
8. `0 IN THE LOG`
9. `Schedule`
10. `WEEK 11`
11. `Pieces`
12. `62 PIECES · 5 ROOMS`
13. `Money`
14. `$17,500 OWED`

Note: items 6–14 are the "shelved spine" running index (`shelved` prop, `hidden min-[1440px]:block` — an existing feature, not part of the reserved head), items 1–5 are the head proper (Put-down link + `[data-spine-head]`).

## 5. Rail head measured heights (`[data-spine-head]` boundingBox)

| Width | Height (px) | CSS reserve in `doc-spine.tsx` |
|---|---|---|
| 1440 | **116.75** | `min-[1440px]:min-h-[100px]` |
| 1280 | **139.5** | base `min-h-[116px]` (below-1440 tier) |

Both measured heights **exceed** their CSS `min-h` reserve (116.75 > 100 at 1440; 139.5 > 116 at 1280) — the household name + two-line stage phrase push the head past the value the code comments describe as "reserved... never measured, so nothing above the rule moves." This is worth flagging for later waves: the head is a `min-height`, not a fixed height, so content that runs long (a longer household name, a longer stage sub like "Active · Week 11") can grow it past the documented reserve.

`[data-document-spine]` width: 200px at 1440, **136px at 1280** (matches the code comment's "136px of words from 1180px, 200px from 1440px" and acceptance bullet #17 exactly).

## 6. Console / render errors

No render/hydration errors on any page. Console noise, quoted:

- All three widths, consistently (matches the W0 baseline, confirmed benign — external font/analytics host lookups failing in the sandboxed dev network):
  `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` (×3 per width)
- **New vs. the W0 baseline** (W0's walk reported zero console errors beyond the above): at 1280, once, right before that context's successful sign-in:
  `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
  — traced in `build/dev-boot-w1-walk.log` to `POST /api/auth/qr/generate 500` (×3 total across the run, one per new browser context hitting `/auth/signin`). This is the Ambient QR Auth feature's QR-generate call failing in this local/dev harness; sign-in itself still completed successfully every time via the email/password path immediately after. Pre-existing to this environment, not something Wave 1's rail/margin/bar changes touch.
- At 390, during context setup, before sign-in completed:
  ```
  TypeError: Failed to fetch
      at eval (webpack-internal:///.../@supabase/auth-js/dist/module/lib/helpers.js:120:25)
      ...
  Error: AppError: Not authenticated
      at handleApiError (webpack-internal:///./src/lib/error-handler.ts:587:12)
      at Object.onError (webpack-internal:///./src/lib/react-query.ts:15:88)
  ```
  Transient — occurred once, before the sign-in redirect resolved; the subsequent `w1-390-s0-project.png` etc. all render fully authenticated content with no error banners. Did not recur on the 1440/1280 contexts.

## 7. Screenshots produced

`build/w1-walk/` — 16 PNGs:

- 12 required state shots: `w1-{1440,1280,390}-{s0,s2,s3}-project.png`, `w1-{1440,1280,390}-s0-prework.png`
- 4 extra clips: `w1-1440-spine-clip.png`, `w1-1280-spine-clip.png`, `w1-1280-margin-tab-closed.png`, `w1-390-mobile-bar-clip.png`
- `measurements.json` (spineWidth/headHeight/railLabels, raw data behind §4–5)

## 8. Server state

Left running from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration` on
`:3000` (media service child on `:3014`), booted via `nohup pnpm dev:designer &`, log at
`build/dev-boot-w1-walk.log`.

## Commands run unsandboxed (W1-walk)

- `kill $(lsof -i :3000 -t) $(lsof -i :3014 -t) $(lsof -i :3015 -t) $(lsof -i :3016 -t)` — killed stale dev server (pid 41483, node from `.codex/worktrees/agent-lens-w1-int/apps/designer-portal`) and its media-service child (pid 41560, port 3014); sandboxed attempt failed with "operation not permitted" on the `kill` syscalls. Ports 3015/3016 were already free.
- `pnpm install` in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration` — `node_modules` was missing; sandboxed run failed on a pnpm store reflink (`ERR_PNPM_GenericFailure Operation not permitted (os error 1), reflink ...`), unsandboxed run succeeded in 24.3s.
- Booted `pnpm dev:designer` from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration` (branch `document-lens/integration` @ `7c8b33e39`) with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, flag overrides, and local Supabase URL/anon key inline; `nohup ... &` (backgrounded long-lived process needs unsandboxed exec).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/desk` polling loop — server came up after ~2 attempts (307).
- `git worktree remove /Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-w1-int` — sandboxed run failed reading `.env*` files during git's dirty-check ("Operation not permitted") and then refused with "contains modified or untracked files, use --force"; confirmed `git merge-base --is-ancestor document-lens/w1 document-lens/integration` (true) then ran `git worktree remove --force` unsandboxed per instructions — succeeded, worktree gone from `git worktree list`.
- `docker exec -i supabase_db_supabase psql -U postgres -d postgres < seed-verify.sql` — sandboxed run failed ("permission denied ... docker API socket"), ran unsandboxed. All 17 checks PASS.
- `node build/w1-walk.mjs` (Playwright/Chromium driving the live dev server) — sandboxed run failed to resolve `@playwright/test` (the artifacts folder carries no `node_modules`); ran unsandboxed after symlinking `build/node_modules → apps/designer-portal/node_modules` for the duration of the run (symlink removed afterward, not committed).
