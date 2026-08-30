# W3 walk — the lens line

Repo `/Users/kody/Code/patina-merged`, program folder `artifacts/document-lens-build-2026-08-29`. Dev server: `next-server` pid 985 on `http://localhost:3000`, booted from `.codex/worktrees/agent-lens-w3-int`, branch `document-lens/w3` @ `121d6434b` (confirmed live, unchanged from the brief). Walk script: `build/w3-walk.mjs`; raw data: `build/w3-walk/w3-measurements.json`; shots: `build/w3-walk/w3-*.png`. Read-only throughout — no product-code edits, no commits, no worktree changes, server left running.

## Commands run unsandboxed

- `curl -sI localhost:3000/desk` — plain read, ran sandboxed (no override needed).
- `docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql` — Docker exec, `dangerouslyDisableSandbox: true`.
- `node build/w3-walk.mjs` — Playwright/Chromium against `localhost:3000`, `dangerouslyDisableSandbox: true`.
- One follow-up one-off `node -e "..."` Playwright script (CSS var / job-ticket-absence / title-size probe, not saved as a file) — `dangerouslyDisableSandbox: true`.

## Setup

- **Server alive:** `curl -sI localhost:3000/desk` → `HTTP/1.1 307 Temporary Redirect` to `/auth/signin?callbackUrl=%2Fdesk` — alive, unauthenticated redirect as expected. PASS.
- **Seed verify:** `seed-verify.sql` → **15/17 PASS**, not 17/17. The two FAILs are `margin_items total = 7` (actual 8) and `margin_items whole job (anchor=letterhead/section) = 4` (actual 5) — this is **pre-existing seed drift already logged at W2** (`build/w2-walk.md:46-48`: "not a Smart Lens defect... the seed is not in the exact state the fixture describes"), not something new from W3. All 15 other checks (rooms, lines, damage, blocked lines, install milestone, overdue approvals, POs, pre-work doc) PASS. Every measurement below that depends on seed data (the standing sheet's 8 items, the rail's value lines, the money figures) reads from *this* seed state, not the fixture's stated numbers — noted inline where it matters.

## 1 — Band height at all 24 cells

`[data-lens-band]` `getBoundingClientRect().height`, sampled after the band is visible + two rAFs, at every width × state × spread cell.

| width | state | spread | height | result |
|---|---|---|---|---|
| 1440 | s0 | project | 56 | seen |
| 1440 | s2 | project | 56 | seen |
| 1440 | s3 | project | 56 | seen |
| 1440 | foot | project | 56 | seen |
| 1440 | s0 | prework | 56 | seen |
| 1440 | s2 | prework | 56 | seen |
| 1440 | s3 | prework | 56 | seen |
| 1440 | foot | prework | 56 | seen |
| 1280 | s0 | project | 56 | seen |
| 1280 | s2 | project | 56 | seen |
| 1280 | s3 | project | 56 | seen |
| 1280 | foot | project | 56 | seen |
| 1280 | s0 | prework | 56 | seen |
| 1280 | s2 | prework | 56 | seen |
| 1280 | s3 | prework | 56 | seen |
| 1280 | foot | prework | 56 | seen |
| 390 | s0 | project | 56 | seen |
| 390 | s2 | project | 56 | seen |
| 390 | s3 | project | 56 | seen |
| 390 | foot | project | 56 | seen |
| 390 | s0 | prework | 56 | seen |
| 390 | s2 | prework | 56 | seen |
| 390 | s3 | prework | 56 | seen |
| 390 | foot | prework | 56 | seen |

**24/24 = 56.** Also confirmed via computed style: `getComputedStyle([data-document-shell]).getPropertyValue('--doc-band-height')` → `56px`. `--doc-region-gap` → `24px`. Both declared tokens present exactly as `globals.css` states.

## 2 — Line 1 / line 2 text at each cell

Read as `textContent.trim()` of `[data-lens-line="1"]` and `[data-lens-line="2"]`. The band lays line 1 out as `justify-between` (an identity span + a right-flush span with a visual gap); `textContent` concatenates the two spans with no separator, so e.g. `"...3 OF 5" + "INSTALL SEP 19..."` reads as one run below — on screen (see the shots) there is a real gap. Reported verbatim, concatenation artifact noted once here rather than per row.

| cell | line 1 (raw textContent) | line 2 (raw textContent) |
|---|---|---|
| 1440/s0/project | `$17,500 OWED YOU, 7 DAYS` | `$17,500 owed you+7 MORENow at Client approvals · Reading…` |
| 1440/s2/project | `CLIENT USER · PROCUREMENT & ORDERS 3 OF 5` + `INSTALL SEP 19 · $17,500 OWED YOU, 7 DAYS` | `$17,500 owed you+7 MORENow at Schedule · Install Sat, Sep 19 · 3 weeks out` |
| 1440/s3/project | same line 1 as s2 | `$17,500 owed you+7 MORENow at Pieces · 62 lines · 5 rooms · 1 damaged` |
| 1440/foot/project | same line 1 as s2 | `$17,500 owed you+7 MORENow at The record · 4 complete` |
| 1280/s0–foot/project | identical to the matching 1440 rows | identical to the matching 1440 rows |
| 390/s0–foot/project | identical to the matching 1440 rows | identical to the matching 1440 rows |
| 1440/1280/390 s0/prework | `` (empty — `open=true` hides identity, and there is no `moneyOnly` fact on a proposal spread) | `Sent Aug 23 — not yet openedFollow up` |
| 1440/1280/390 s2/s3/foot/prework | `CLIENT USER · PROPOSAL` + `SENT AUG 23` | `Sent Aug 23 — not yet openedFollow up` (unchanged across s2/s3/foot) |

Line 2 on the project doc turns correctly per stop (`Client approvals` → `Schedule` → `Pieces` → `The record`) at every width — the L-1 sentence-turn contract holds identically at 1440, 1280 and 390. On the pre-work doc, line 2 never turns across s2/s3/foot: **seen as expected**, not a defect — `SECTION_PAPER_REGIONS.proposal = []` (`document-index.ts:98`), so a proposal spread mounts no `[data-index-region]` roots at all and there is no stop to report (see §3/§5 "not reachable" below).

## 3 — SC1: first `[data-region-head]` top

| cell | found | top (px) | key | vs. gate | result |
|---|---|---|---|---|---|
| 1440/s0/project | yes | **383.06** | `approvals-head` | ≤405 gate: **PASS** | differs from proposal's stated exact number |
| 390/s0/project | yes | 665.31 | `approvals-head` | n/a (gate is 1440-scoped) | seen |
| 390/s0/prework | yes | 1373.16 | `record` | n/a | seen (see note) |

**Differs:** the walker brief's gate is `≤405`, which passes (383.06 < 405). But `proposal.md:713` states the wave's own target is **exactly 298px** ("`Client approvals` stops arriving as a 55.5px `FoldSeam` at y 791.8... SC1 = 298px requires it"; also "without this change the wave lands the first head near 354px"). The measured 383.06 is neither the proposal's target (298) nor its stated fallback-without-the-change number (354) — it clears the walker's pass/fail line but the proposal's own precise number is off by ~85px against the design doc. `approvals` is confirmed **open by default** (the first head is `approvals-head`, and line 2 at s0 reads `Now at Client approvals`), so the *mechanism* (latched default → initial density) is working; only the exact pixel figure differs from the design doc's arithmetic.

390/s0/prework's first head is `record` (previous-work's "The record" head), not an approvals/schedule head — expected, since a proposal spread mounts none of the Project regions; previous-work is the one region that still mounts everywhere per the proposal ("a stop with no mounted root prints its name and `NOTHING YET`... the pre-work rule (SP-05) applied at the foot").

## 4 — `--doc-landing-clear`, laid out

`getComputedStyle(document.querySelector('[data-document-paper] [data-index-region]')).scrollMarginTop` → **`72px`**. Matches the declared `calc(var(--doc-band-height) + 16px)` = `calc(56px + 16px)` exactly. **PASS**, and consistent with the W3 integration commit's own fix (`121d6434b`, "measure the landing clearance, don't parse it" — the same laid-out-probe technique used here rather than `parseFloat` on the raw custom-property string, which the commit message notes returns `NaN` on an unregistered custom property).

## 5 — Inter-stop gaps, 1440/s0/project

`next.top − prev.bottom` for each consecutive pair of `[data-document-paper] [data-index-region]` roots, in DOM order (approvals → schedule → ffe → money → care → record):

| pair | gap (px) | vs 24±1 | result |
|---|---|---|---|
| approvals → schedule | **290.88** | fail | **differs** |
| schedule → ffe | 24 | pass | seen |
| ffe → money | 24 | pass | seen |
| money → care | 24 | pass | seen |
| care → record | **108.5** | fail | **differs** |

**3 of 5 pairs land exactly on 24.** The two outliers are explained by page composition, not a broken token: `--doc-region-gap` itself reads `24px` everywhere (confirmed in §1), but two of the five "adjacent" index-region pairs are not actually adjacent in the DOM —

- **approvals → schedule**: `page.tsx` mounts `<ScheduleRuleRegion>` (the phase-timeline "Rule" instrument, `schedule/schedule-rule-region.tsx`) *between* `<ProjectApprovalDocumentMount>` (`data-index-region="approvals"`) and `<ScheduleSpine>` (`data-index-region="schedule"`). `schedule-rule-region.tsx` takes the `--doc-region-gap` token on its own margins (per `proposal.md:716`), but it carries no `data-index-region` of its own, so the gap this measurement reports is really *(approvals' own bottom margin) + (the whole Rule instrument) + (schedule's own top margin)* — not the bare 24px token.
- **care → record**: `<KickoffBand>` (self-silencing, "ungated: it self-silences on the flag, a staffed sheet, or its own dismissal") mounts between `<CareBand>` (`care`) and `<PreviousWork>` (`record`) in this branch of `page.tsx`, and on this seed it is not silencing itself.

Neither is a Smart Lens regression — the walker instruction's "must be 24±1" assumption holds only where two index-region roots are genuinely DOM-adjacent, and 2 of the paper's 5 consecutive pairs are not, by design. Flagging because the instruction asked for every pair, verbatim.

## 6 — Letterhead at 390/s0/project (D-B20's owed measurement)

`#document-project-status` (`doc-letterhead.tsx:54`) `getBoundingClientRect()`:

| doc | height | vs proposal's budgeted 191px | ledger position |
|---|---|---|---|
| project (…d5) | **367.06px** | +176px over budget; alone 26px over the whole 341px 390-header budget | stacked under the vitals |
| prework (…d6) | 283.5px | +92.5px over budget | stacked under the vitals |

The ledger's own grid (`min-[1180px]:grid-cols-[1fr_auto]`) begins 67px into the header on both docs (`top: 103` vs the header's `top: 36`) — that 67px is the title/vitals stack; the instruments print stacked beneath it in the same single column, confirming **D-B20's "not hidden, stacked under the vitals"** claim as shipped. **`deviations.md`'s D-B20 measurement line has been updated in place with these two numbers** (only that line was touched).

## 7 — Rail labels at 1440/s0/project (R1 instrument)

Distinct non-empty `innerText` lines inside `[data-document-spine]`, split into "value" lines (carry a digit or a stated fallback) and "label" lines (everything else) — same heuristic as `w2-r1-instrument.mjs`.

- Distinct lines: **22**
- Label-only lines: **15**
- Walker's threshold: **14** (stated as `3 + six stops + 1 + four doors`)

**Differs by 1.** The 15 observed labels are: `←`, `PUT DOWN`, `Client User`, `PROCUREMENT & ORDERS`, `Client approvals`, `Schedule`, `Pieces`, `Money`, `Closing the book`, `The record` (the six stops), `FILED WITH THIS JOB`, `Plan room`, `Spec book`, `Boards`, `Call sheet` (the four doors). That accounts for the "six stops" (6) + "1" (`FILED WITH THIS JOB`) + "four doors" (4) = 11 cleanly, but the leading bucket the instruction calls "3" is actually **4** here: `←`, `PUT DOWN`, `Client User`, `PROCUREMENT & ORDERS`. Whether `Client User` (the household name) and `PROCUREMENT & ORDERS` (the stage word) count as static rail furniture ("labels") or as data the rail is printing ("values") is a judgment call the classifier resolves by "does it contain a digit," and neither does — so both land in the label bucket here, one more than the instruction's "3" expects. Not a functional defect; a counting-convention ambiguity, flagged because the instruction gave an exact target.

## 8 — Standing sheet

Pressed `[data-lens-more]` (`+7 MORE`, `withheld = standingCount(8) − 1`) at 1440 and 390.

| width | door text | dialog title | rows (verbatim, in order) | focus → door on close |
|---|---|---|---|---|
| 1440 | `+7 MORE` | `STANDING · 8` | see below | **true** |
| 390 | `+7 MORE` | `STANDING · 8` | identical to 1440 | **true** |

Rows (both widths, identical): `PAST DUE` / `$17,500 owed you` (no act) · `PAST DUE` / `Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22 — send a reminder` / `SEND REMINDER` · `DECISION DUE` / `2 decisions overdue — oldest due Aug 23` / `CHASE THE APPROVAL` · `AWAITING INSPECTION` / `1 piece delivered — awaiting inspection` / `INSPECT THE DELIVERY` · `CLAIM OPEN` / `FDL-0912 has an open damage claim` / `FILE THE CLAIM` · `NOT SENT` / `PO-2026-0418 drafted — not yet sent` / `SEND THE PURCHASE ORDER` · `STUCK` / `1 damaged` (no act) · `STUCK` / `2 unspecified` (no act). Eight items, matching `STANDING · 8`. **All seen, PASS**, including the close-button copy difference between widths (`PUT BACK · ESC` at 1440 vs `CLOSE` at 390 — both are `DocSheetHead`'s own supplied labels, not a defect).

Shots: `w3-1440-sheet-project.png`, `w3-390-sheet-project.png`.

## 9 — Letterhead-in-frame yield, 1440

At s0 (`atTop`): `open="true"`, line 1 = `$17,500 OWED YOU, 7 DAYS`. After scrolling `#document-project-status` out of frame (`afterScroll`): `open="false"`, line 1 = `CLIENT USER · PROCUREMENT & ORDERS 3 OF 5` + `INSTALL SEP 19 · $17,500 OWED YOU, 7 DAYS`.

- **Stage phrase appears:** yes (`stagePhraseAppeared: true` — `open` flips to `false`, which is exactly the condition `lens-band.tsx:125` uses to print `line1.identity`/`line1.stage` instead of nothing).
- **Line 1 changes:** yes (`line1Changed: true`).

**Both seen, matching RF-02/L-6 as designed.**

## 10 — Reduced motion

`page.emulateMedia({ reducedMotion: 'reduce' })`, repeated at 1440/s0 and 1440/s2, `document.getAnimations().length` after 1s wait:

| state | animation count | expected |
|---|---|---|
| s0 | **0** | 0 — seen |
| s2 | **0** | 0 — seen |

Visible band word set at s2, reduced vs. no-preference: **identical** (byte-for-byte array match, 34 words each, verified programmatically). **Both checks PASS.**

## 11 — `desk-walkthrough` sanity

`/desk` loads (`deskLoaded: true`). The long-paper link is present (`<a href="/doc/b0000000-…-d5">Aspen Loft — the long paper</a>`, `longPaperLinkFound: true`), but the click **timed out after 30s**: a `div[data-testid="welcome-modal-overlay"]` (`aria-hidden="true"` yet still intercepting pointer events) sat over the link for the whole retry window. This is the **help-system first-signin tour** (`first-signin-tour.tsx`), gated by its own storage key `help-system.welcome-shown.first-project-walkthrough` — the same key the walk script's `addInitScript` sets to `'1'` before every other navigation in this run, and it worked everywhere else (no modal blocked any of the 24 grid shots or the sheet/reduced-motion passes). It only surfaced on this direct `/desk → click` path, which the source comments (`first-signin-tour.tsx:18`) note also has a server-tracked "TourState" that "wouldn't travel" from a bare localStorage marker. **Not a Wave 3 / Smart Lens defect** — it is a pre-existing help-system quirk this walk happened to trip by clicking through `/desk` UI instead of navigating straight to `/doc/…` — but it is the one thing in this walk that is genuinely **broken** (a blocking, `aria-hidden="true"` overlay eating pointer events on a page it shouldn't be showing at all in an already-toured session), so it is named here rather than silently routed around.

Shot: `w3-desk-walkthrough.png` (desk page, modal not visible in the static shot since it only intercepted the click, not the render).

## 12 — Console errors per page load

| label | errors |
|---|---|
| 1440-project | 1× `TypeError: Failed to fetch` (Supabase auth-js `_getUser`, on first load before sign-in settles) + 3× `net::ERR_NAME_NOT_RESOLVED` |
| 1440-prework | none |
| 1280-project | 3× `net::ERR_NAME_NOT_RESOLVED` |
| 1280-prework | 1× `TypeError: Failed to fetch` (same auth-js path) + 1× `AppError: Not authenticated` (react-query onError) |
| 390-project | 3× `net::ERR_NAME_NOT_RESOLVED` |
| 390-prework | none |
| 1440-sheet | 2× `net::ERR_NAME_NOT_RESOLVED` |
| 390-sheet | none |
| 1440-letterhead-yield | 3× `net::ERR_NAME_NOT_RESOLVED` |
| 1440-reduced-motion | 3× `net::ERR_NAME_NOT_RESOLVED` |
| 1440-no-preference-s2 | 3× `net::ERR_NAME_NOT_RESOLVED` |
| desk-walkthrough | none |

`net::ERR_NAME_NOT_RESOLVED` is consistent with third-party calls (PostHog/Sanity) failing DNS resolution in this sandboxed environment — not app code, and not new to Wave 3 (same class of noise appears in prior waves' walks). The `TypeError: Failed to fetch` / `AppError: Not authenticated` pair appears only on the *first* context created per browser instance, before the freshly-signed-in session's cookies are fully live for a background `_getUser()` call race — transient, and did not recur once signed in. No console error in this walk references any Wave 3 file (`lens-band`, `lens-ladder`, `use-region-fold`, `use-lens-frame`, `standing-sheet`, `doc-sheet`, `doc-letterhead`).

## 13 — §9 Wave 3 acceptance, bullet by bullet

Source: `artifacts/document-lens-proposal-2026-08-28/source/proposal.md:702-731` ("Wave 3 — The lens line"). Many of these are code-shape facts a browser walk cannot confirm or deny (file deletions, "unchanged" markers, test-file rewrites); those are marked **not verifiable via UI walk** rather than guessed at.

| bullet | result |
|---|---|
| `lens-band.tsx` — two lines, declared height, `aria-live="polite"`, `#doc-ticket-sentinel`, nowrap+ellipsis | **seen** — 56px height at 24/24 cells; source confirms `aria-live="polite"` on line 2 (`data-lens-line="2"`) and `#doc-ticket-sentinel` as the band's immediate previous sibling |
| `job-ticket.tsx` deleted, with sentinel/observer/pin/seam | **seen** — `document.querySelector('[data-job-ticket]')` is null on the live page |
| `ticket-derivation.ts` unchanged | not verifiable via UI walk (code-level) |
| `page.tsx` — ticket mount removed, `LensBand` in its place, `RedLetterZone`/`DocumentGuide` ternary deleted, `LetterheadInstruments` moves into the letterhead at ≥1180, `<FolioLetterhead>` stays, `MobileMarginChips` doesn't move | **partially seen** — `[data-lens-band]` mounts where the ticket used to be and no `Needs attention` region was encountered anywhere in the walk; the ≥1180/instruments-stack split at 390 is directly confirmed (§6); `FolioLetterhead`/`MobileMarginChips` positions not independently probed |
| `red-letter-zone.tsx`, `document-guide.tsx` become model providers | not verifiable via UI walk (code-level) |
| `overlays/doc-sheet.tsx` — standing sheet as new `kind` | **seen** — `role="dialog"`, `aria-labelledby`, Esc-dismiss, focus-return all confirmed (§8) |
| `doc-letterhead.tsx` — instruments ledger at ≥1180; `pb-5`→`pb-4`; keeps `lg` StrataMark + 40px title | **seen** (title): computed `font-size: 40px` on the letterhead's title element, confirmed live. `pb-4` vs `pb-5` and the StrataMark's `lg` size class not independently measured |
| `use-region-fold.ts` — `latchedDefault` becomes initial density; SC1 | **differs** — mechanism confirmed (approvals opens by default, first head is `approvals-head`); exact pixel value differs from the proposal's stated 298 (see §3) |
| `globals.css` — `--doc-region-gap:24px`, `--doc-band-height:56px`, `--doc-landing-clear:calc(...)=72px`, focusable clearance, `scroll-padding-bottom:60px`, schedule reserved height | **seen** — all four values confirmed via computed style (§1, §4, and a follow-up probe: `scroll-padding-bottom: 60px` on `<html>`). Schedule's own reserved-height rule not independently probed |
| `commercial/money-region.tsx:48` `SEAM_CLEARANCE` reads `--doc-landing-clear` | not verifiable via UI walk (code-level) — but the 72px value it would read is confirmed present (§4) |
| Region wrappers take the `--doc-region-gap` token (approvals/schedule/ffe/money/care/record wrappers) | **differs** — the token itself is 24px everywhere (§1), and 3 of 5 measured adjacent-root gaps land exactly on 24; 2 of 5 don't, because of intervening non-indexed organs, not because the token is wrong (§5) |
| Folded rule step at its three call sites | not verifiable via UI walk (code-level; no region was in a folded state on this seed to observe the rule step) |
| Delete `job-ticket.test.tsx` | not verifiable via UI walk (test-suite fact) |
| Rewrite `page.test.tsx`'s ticket-mount describe | not verifiable via UI walk (test-suite fact) |
| Rewrite `responsive-document-shell.test.tsx` (8 rows / 3 spreads, room-in-hand flow) | not verifiable via UI walk (test-suite fact) |
| Rewrite `quiet-responsive-shell.spec.ts` (`toHaveCount(8)` at 1440/1280, 390 unfold path) | not verifiable via UI walk (test-suite fact) |
| Rewrite `use-region-fold.test.tsx` (`latchedDefault` → `'open'`) | not verifiable via UI walk (test-suite fact) |
| Survivors: `ticket-derivation.test.ts`, `doc-letterhead.test.tsx`, `region-head.test.tsx`, `fold-seam.test.tsx`, `row-overflow.test.tsx` | not verifiable via UI walk (test-suite fact) |
| New `e2e/document/lens-band-height.spec.ts` — 56 in 18 cells (rich + pre-work × 1440/1280/390 × 3 scroll positions) | **seen, and exceeded** — this walk samples 24 cells (4 states × 3 widths × 2 spreads, vs the spec's 18 = 3 scroll positions × 3 widths × 2 spreads) and gets 56 in all 24 (§1) |
| Gates green: `shadow-gate.test.ts`, `contrast.test.ts` | not verifiable via UI walk (requires running the test suite, not a live-page walk) |
| Rollback: cannot be reverted by a flag; `git revert` of one commit | not verifiable via UI walk (repo-state fact) |
| Depends on Wave 2 | confirmed structurally — the walk runs against `document-lens/w3` @ `121d6434b`, which the worktree's own `git log` shows builds on the ladder/W2 work (rail nav, `data-document-spine`, room chips all present and functioning throughout this walk) |

## Shot list (24 + 4 bonus)

`build/w3-walk/`:
`w3-1440-s0-project.png` `w3-1440-s2-project.png` `w3-1440-s3-project.png` `w3-1440-foot-project.png`
`w3-1440-s0-prework.png` `w3-1440-s2-prework.png` `w3-1440-s3-prework.png` `w3-1440-foot-prework.png`
`w3-1280-s0-project.png` `w3-1280-s2-project.png` `w3-1280-s3-project.png` `w3-1280-foot-project.png`
`w3-1280-s0-prework.png` `w3-1280-s2-prework.png` `w3-1280-s3-prework.png` `w3-1280-foot-prework.png`
`w3-390-s0-project.png` `w3-390-s2-project.png` `w3-390-s3-project.png` `w3-390-foot-project.png`
`w3-390-s0-prework.png` `w3-390-s2-prework.png` `w3-390-s3-prework.png` `w3-390-foot-prework.png`
Bonus: `w3-1440-spine-clip-s0.png` (rail clip) · `w3-1440-sheet-project.png` / `w3-390-sheet-project.png` (standing sheet) · `w3-desk-walkthrough.png` (desk sanity).

All at `deviceScaleFactor: 1`; viewport heights 900/900/844 for 1440/1280/390 respectively, per the brief.

## Differs — ranked by distance from the design

1. **Inter-stop gaps, approvals→schedule (290.88px vs 24±1) and care→record (108.5px vs 24±1)** — largest raw deltas, but explained: both are non-adjacent pairs in the DOM (an unindexed `ScheduleRuleRegion` and an unindexed `KickoffBand` sit between them respectively), and the `--doc-region-gap` token itself is correct at 24px everywhere it's actually declared (§5).
2. **Letterhead height at 390 (367.06px project / 283.5px prework) vs. the proposal's budgeted 191px** — the largest *unexplained-by-composition* gap: the stacked ledger genuinely costs ~176–92px more than budgeted, and by itself already exceeds the whole 341px 390-header budget on the project doc. This is the number D-B20 was owed; now recorded there (§6).
3. **SC1 = 383.06px vs. the proposal's stated 298px** — passes the walker's ≤405 gate and the *mechanism* (approvals open by default) is confirmed working, but the specific figure in the design doc's own arithmetic doesn't hold (§3).
4. **Rail label count = 15 vs. the walker's stated threshold of 14** — off by one, and traceable to a counting-convention ambiguity (whether `Client User`/`PROCUREMENT & ORDERS` count as labels or values), not a missing/extra UI element (§7).
5. **`/desk` walkthrough blocked by a stray `welcome-modal-overlay`** — a real, reproducible interaction bug (an `aria-hidden="true"` layer still eats pointer events), but pre-existing help-system behavior unrelated to any Wave 3 file (§11).

Everything else measured — band height (24/24 at 56px), `--doc-landing-clear` (72px exactly), the standing sheet (title/rows/focus-return at both widths), the letterhead-in-frame yield (both the stage phrase and line 1 change), reduced motion (0 animations, identical word sets), and console errors (no Wave 3 file implicated) — **matches the design as built.**
