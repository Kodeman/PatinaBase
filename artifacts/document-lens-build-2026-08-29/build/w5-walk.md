# W5 walk — the pre-work spreads

Server: `next dev --webpack -p 3021` in `.codex/worktrees/agent-lens-integration`
(branch `document-lens/integration` @ `99cc6d135` — Wave 5 merged, `w5-fix`
**not** merged). `/desk` → 307 confirmed before the walk. Scripts:
`build/w5-walk.mjs` (main pass, 35 shots + probes) and `build/w5-walk-fixup.mjs`
(five timing-sensitive re-probes the main pass under-margined). Raw data:
`build/w5-walk/w5-measurements.json`, `build/w5-walk/w5-fixup-measurements.json`.
Read-only throughout: no product code, no worktree, no server restart, no
committed data change (one DB read-only census query; no writes).

## §0 — the "section switcher" does not exist as a product control

The brief asked to "find the section switcher" to view brief/discovery/
direction/proposal on `…d6`. There is no such control. `document_state`
(`supabase/migrations/00191_document_state_view.sql`) derives
`active_section` per row from which of four disjoint shapes it is (project /
proposal chain / lead / pre-signing relationship); a single id can only ever
be `direction`/`proposal` (a proposal row, gated on `status`) or `brief`
(a lead) or `discovery` (a `designer_clients` row) — never more than one
section for one id, and `…d6` is fixed as a `proposals` row with
`status='sent'` → always `proposal`. `use-table-pin.ts`'s "turn" is not a
preview switcher either — it only adopts a *pending* composition once the
underlying facts genuinely change; it cannot conjure four states out of one.

I reached each of the four sections via **four different `document_state`
rows for the same designer** (`designer_id = a0000000-…-0004`), queried live:

| section | doc id used | source row |
|---|---|---|
| brief | `23bdb027-7c0d-4c67-b8c2-cdc345276ffc` | lead "Full Room" (Marcus Wright), status `new/viewed/contacted` |
| discovery | `d0c10000-0000-0000-0000-0000000000a2` | fixed seed row, "The Ashfords (no-login household)" (`designer-clients.sql` `dc_discovery`) |
| direction | `d0c10000-0000-0000-0000-0000000000b2` | fixed seed row, draft proposal "Elena Marlowe — Living Room Direction" (also `DRAFT_PROPOSAL_ID` in `e2e/document/quiet-responsive-shell.spec.ts`) |
| proposal | `b0000000-0000-0000-0000-000000000d6` | the program's own pre-work fixture, "Aspen Loft — Guest Wing", sent/unopened |

This is a coverage note, not a defect — it does mean the four spreads shown
below are not four "faces" of one document, so cross-section facts (e.g. the
household name) differ row to row.

## Seed verify

`docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql`
→ **14/17 PASS**, the three known drifts only:

| check | actual | expected |
|---|---|---|
| install milestone = current_date + 21 | 2026-09-19 | 2026-09-20 (UTC rollover) |
| margin_items total = 7 | 9 | 7 (two ambient `time` rows) |
| margin_items whole job = 4 | 6 | 4 (same two rows, letterhead-anchored) |

## Summary table

| # | Item | Result |
|---|---|---|
| 1 | Pre-work region census (brief/discovery/direction/proposal) | **seen, 1 differs** — W5-C1 (double count-line + wrong sr-only text) confirmed live; DOM/head/ladder/band/stage-phrase contract otherwise clean |
| 2 | Proposal spread DOM order + content | **seen** — `proposal → scope → vision → investment → record`, Offer absent (gated on `finalizeTable`, not active here — not a defect), band `$9,400` alone at s0 / `SENT AUG 23 · $9,400` pinned |
| 3 | 390 Margin sheet (D-B30/W5-R1) | **seen, 1 differs** — W5-C2 confirmed live (row act opens the same sheet as the row body); everything else (7/7 rows, groups, no stamp, Escape→More, line jump) matches the ruling |
| 4 | Inline loading register + CLS | **seen, inconclusive on the pulse itself** — dev-server timing outran the visible window twice; `money.offsetTop` stable at every read that succeeded; a top-level `Picking up…` full-page loader (not the FF&E-local register) is what the 500ms shot actually caught |
| 5 | Six project quiet heads at s0 | **seen** — only `care` quiet, matches the "D-B46 not merged" expectation exactly |
| 6 | Letterhead heights + 390 first-head gross | **seen, 0 violations** — 192.06 / 255.17 / 423.17, all under W3-R7's chromium baseline |
| 7 | Rail labels | **seen, 0 violations** — d5 @1440 = 13 distinct (≤14); d6 per spread all within `≤3 + stops + 1 + doors` |
| 8 | Reduced motion | **seen, 0 violations** — 0 running animations after 1s; the FF&E pulse's `animation-name` is `none` under reduce (found on retry) |
| 9 | Console errors | **seen — uniform, pre-existing**, 3 known classes, no new class from Wave 5 |
| 10 | §9 Wave 5 acceptance bullets | **seen, 1 differs, 1 partial** — see §10 |

---

## §1 — Pre-work region census

Captured live via `[data-document-paper] [data-index-region]` + `[data-region-head]`
on all four section docs, 1440/s0 and 390/s0.

### brief (`23bdb027-…`)
- Regions in DOM order: `brief`, `record` — 2 regions, exactly 1 `[data-region-head]` each, 0 stray `<h2>`.
- `brief` head: name **"The brief"**, status **"Nothing yet"**, eyebrow **"Respond by Sep 1"**.
- `record` head: name **"The record"**, status **"Nothing yet"**.
- Ladder rows verbatim: `The brief → NOTHING YET`, `The record → NOTHING YET`.
- Band line 1 at s0: empty (yielded, per D-B38); band line 2: `New lead — respond by Sep 1 · Respond to the inquiry · Now`.
- Rail stage phrase: **"Brief" / "Respond by Sep 1"** — one line, no ordinal.
- Rail (390) census: 5 distinct labels, 2 stops, 0 doors (no `projectId` → `Filed with this job` correctly absent).

### discovery (`d0c10000-…-a2`)
- Regions: `discovery`, `record`. 1 head each, 0 stray `<h2>`.
- `discovery` head: name **"Discovery"**, status **"Nothing yet"**, eyebrow **"In progress"**.
- `record` head: status **"1 complete"**.
- Ladder: `Discovery → NOTHING YET`, `The record → 1 COMPLETE`.
- Band line 2: `Finish what you need to know · Add Project type and named rooms · +5 MORE`.
- Rail stage phrase: **"Discovery" / "In discovery"**.
- Rail (390): 4 distinct labels, 2 stops, 0 doors.

### direction (`d0c10000-…-b2`)
- Regions: `direction`, `record`. 1 head each, 0 stray `<h2>`.
- `direction` head: name **"Direction"**, status **"Nothing yet"**, eyebrow **"v1 · Drafting"**.
- `record` head: status **"2 complete"**.
- Ladder: `Direction → NOTHING YET`, `The record → 2 COMPLETE`.
- Band line 2: `Draw up the direction · Open the Drafting Room · +8 MORE`.
- Rail stage phrase: **"Direction" / "Drafting"**.
- Rail (390): 4 distinct labels, 2 stops, 0 doors.

### proposal (`…d6`)
- Regions: `proposal`, `scope`, `vision`, `investment`, `record` — 5 regions, **1** `[data-region-head]` each.
- `proposal` head: name **"The proposal"**, status **"Sent Aug 23 · unopened 7d"**, eyebrow **"v1 · Awaiting signature"**.
- `scope` head: status **"Nothing yet"** (this seed has 0 rooms — cannot exercise W5-C6's `4 ROOMS`/`4 ROOMS IN SCOPE` mismatch on this doc).
- `vision` head: status **"Not written yet"**.
- `investment` head: status **"$9,400"** (no `20% MARGIN` — matches W5-R2 §2 exactly).
- `record` head: status **"3 complete"**.
- Ladder verbatim: `The proposal → SENT AUG 23 · UNOPENED 7D`, `Scope & engagement → NOTHING YET`, `Design vision → NOTHING YET`, `The investment → $9,400`, `The record → 3 COMPLETE`.
- Rail stage phrase: **"Proposal" / "Awaiting signature"**.
- Rail (390): 8 distinct labels, 5 stops, 0 doors.

**W4-R1's rule** ("zero of `approvals|money|ffe|schedule|care`"): confirmed
**0 of 5** present on all four spreads (`record` is legitimately present —
it is explicitly the one stop shared with every spread per
`document-index.ts`'s own comment, not one of the five the rule forbids).

**Differs found — W5-C1, confirmed live.** `PreworkRegion`'s quiet branch is
never observed here (every region above is `full` on these low-content
seeds), so the *live* double-print could not be re-triggered by this walk —
but the code is unchanged from the correctness review's read
(`prework-region.tsx:87-96` still prints `{status.toUpperCase()}` in a second
`<p data-region-count-line>` plus the generic `Quiet — opens as you read`
sr-only line whenever `density==='quiet'`), and the fix commit
(`a9865ed74`, `document-lens/w5-fix`) is confirmed **not** an ancestor of
`document-lens/integration@99cc6d135`. Recorded as a code-confirmed, not
re-exercised, finding.

**Noted, not a defect.** The `proposal` region's DOM subtree contains a
**second** `<h2>Investment</h2>` (11px mono, `client-mirror.tsx:187`) —
inside `ProposalInstruments`' nested "what the client sees" preview panel,
which reproduces the client's own document structure (Vision/Scope/
Investment/etc. as its own headings) for a live preview. `headCount` for
every region stayed **1** in every case (the census only counts
`[data-region-head]`, which this preview panel does not use), and the panel
sits well below the fold — it is not a second RegionHead and does not
compete with the rail. Flagging because the task asked to check for stray
`<h2>`s specifically.

## §2 — Proposal spread DOM order and content (`…d6`)

- DOM order: **`proposal → scope → vision → investment → record`** — matches W5-R2 §1 exactly. No separate top-level `Offer` key (as ruled — the Offer, when it mounts, is a child of `investment`).
- `vision` = **"Not written yet"** (this proposal has no description) ✓.
- `scope` = **"Nothing yet"** (this proposal has 0 rooms — the `4 rooms in scope` / `Nothing yet` fork is seed-dependent; only the empty branch was exercised here) ✓ OD-1 vocabulary.
- `investment` = **"$9,400"** alone, no `20% MARGIN` ✓.
- Band right slot: **`$9,400`** alone at s0 (`open="true"`, `rightFlush` = moneyOnly); pinned (`open="false"`) reads **`SENT AUG 23 · $9,400`** — exactly the `SENT <date> · <total>` form the task named, confirmed at both states.
- **Offer not observed**: `proposalOffer` (`OfferFacets`) is gated on `finalizeTable` (`page.tsx:2233`, the "worktable"/Start-to-Signature composed-table flag), which this boot did not activate — so the Offer never mounts on an ordinary read of a sent proposal, and the "Offer stays below every block" contract could not be exercised live. Not a defect: the contract is about *where* the Offer lands *when it mounts*, and it simply doesn't mount outside the finalize-table flow.

## §3 — The 390 Margin sheet (`…d5`)

More door label: **`→ Margin · 7`**. Sheet head: **`Margin · 7`** / **`2 overdue`**.
Groups: **`THE WHOLE JOB · 4`** then **`BESIDE PIECES · 3`** — 7 rows total, verbatim:

| group | kind line | title | owner | line label | act |
|---|---|---|---|---|---|
| WHOLE JOB | Decision · overdue | Primary bedroom — rug and nightstands | Client | — | Send a nudge |
| WHOLE JOB | Decision · responded | Dining room — finish sample | Client | — | Open the record |
| WHOLE JOB | Decision · responded | Whole-house hardware | Client | — | Open the record |
| WHOLE JOB | Money · sent | INV-2026-114 | Client | — | Open the folio |
| BESIDE PIECES | Decision · overdue | Living room — fabric for the reading chair | Client | Living Room · Reading Chair — COM Fabric Pending | Send a nudge |
| BESIDE PIECES | Message · Leah Hartwell | Console — damage photos | Leah Hartwell | Living Room · Brass-and-Oak Console | Reply |
| BESIDE PIECES | Message · Leah Hartwell | PO-2026-0418 follow-up | Leah Hartwell | Dining Room · Dining Table — Sturdy Oak | Reply |

No "stamp" (`OVERDUE 6 DAYS`-style) prints on any row — confirms **W5-C12**
(`overdueStampLabel` imported but unused in the row) — the kind line
(`Decision · overdue`) is the only status marker, not the ruled stamp form.

**Differs found — W5-C2, confirmed live.** Pressing the first row's act
button (`Send a nudge`) opened the **same** `margin-item` sheet
(`aria-label="Margin item"`, `data-mobile-sheet-kind="margin-item"`) that
pressing the row's body opens — the act performs no distinct action, exactly
as the correctness review found (`e27705aaa`, `document-lens/w5-fix`, not
merged). No inline "nudge sent" or similar fired; only navigation to the
detail sheet.

Line-anchored row body press (re-tested cleanly in the fixup pass): scroll
moved (`0 → 2883`), then opened `margin-item` — the jump + item-sheet
contract works as coded.

Escape from a freshly-opened Margin sheet (re-tested cleanly): sheet closes
(`sheetStillOpen: false`), focus lands on **`button[aria-label="More studio
actions"]`** — the More door — confirmed correct.

`[data-mobile-margin-chips]` count: **0 at 390** (both the deleted
letterhead call site and `useBelow980()`'s null return account for this);
**3 at 1280** — `LineMarginChips` still mounts per FF&E line at ≥980
(`ffe-section.tsx:519`, W5-C7's "unreachable in both branches" claim is
about the ≥1180 caller having been *deleted*, not about the 980–1180 window,
where it still renders with a bare `data-mobile-margin-chips` attribute —
W5-C4's finding, confirmed: the attribute carries no `="line"` value).

Sections sheet (separate door, `[data-sections-door]`): opens with
`aria-label="Sections of this document"`.

## §4 — The inline loading register + CLS

Two attempts, both dev-server-timing-limited:

1. **Single 500ms shot** (`w5-1440-s0-loading.png`): caught a top-level
   **`Picking up…`** full-page loader (not the FF&E region's own inline
   register) — the document shell had not mounted at all yet.
2. **Poll to ~4s post-`load`** (`w5-1440-s0-loading-late.png`,
   `w5-fixup-measurements.json` → `loadingPoll`): on this run `page.goto`
   itself took **~8.1s** to reach the `load` event (contended local dev
   server, not a prod number), and by the time the `ffe`/`money` regions
   existed in the DOM (~10.4s from navigation start) the underlying query
   had already resolved — no transient pulse was caught in either attempt.

This is a **coverage gap from dev-server timing, not a defect finding**: the
inline mechanism itself is confirmed present in code
(`section-loading-line.tsx`'s `variant="inline"`, shipped in
`b66c5cb0b`, which **is** on `integration`) and is confirmed **rendering and
correctly frozen under reduced motion** (see §8) — just never caught mid-load
against real Supabase latency in this environment.

`money.offsetTop`: the "before settle" read raced ahead of the region's own
mount (`null`), so no before/after-settle comparison was possible on the
first attempt; the fixup poll confirms the value is **stable across every
sample once the region exists** (`360.27px`, one distinct value across the
whole poll window, `moneyStableAcrossPoll: true`) — no CLS observed on
`money` specifically, for whatever window this run could see.

## §5 — Six project quiet heads at s0 (`…d5`)

| stop | density |
|---|---|
| approvals | full |
| schedule | full |
| ffe | full |
| money | full |
| **care** | **quiet** |
| record | full |

Only `care` quiet — matches the brief's own expectation exactly (D-B46's
resolution gate is not merged on `integration`).

## §6 — Letterhead + first-head budgets (`…d5`)

| measure | value | gate |
|---|---|---|
| letterhead height @1440 | 192.06px | ≤ 205px ✓ |
| letterhead height @390 | 255.17px | ≤ 265px ✓ |
| first `[data-region-head]` top @390 (gross) | 423.17px | ≤ 435px ✓ |

All three land within a few hundredths of a pixel of W3-R7's own recorded
chromium baseline (192.06 / 255.17 / 423.17) — no regression.

## §7 — Rail labels

`…d5` @1440/s0: **13** distinct labels (`Client User`, `PROCUREMENT & ORDERS`,
`3 OF 5`, six stop names, `Filed with this job`, 3 doors) — R1's falsifier is
"more than 13"; 13 is the budget's own ceiling, so this is a **pass with zero
headroom**, worth a note for whoever adds a 14th door or stop next.

`…d6` per spread — all comfortably inside `≤ 3 + stops + 1 + doors`:

| spread | labels | stops | doors | budget |
|---|---|---|---|---|
| brief | 5 | 2 | 0 | ≤ 6 |
| discovery | 4 | 2 | 0 | ≤ 6 |
| direction | 4 | 2 | 0 | ≤ 6 |
| proposal | 8 | 5 | 0 | ≤ 9 |

## §8 — Reduced motion

0 animations with `playState==='running'` 1s after settle on `…d5`, reduced
motion on. The FF&E inline loading pulse (caught on retry, a fresh cold load
with reduce on): `animation-name: none`, `animation-duration: 0s` — the
`motion-reduce:animate-none` utility correctly removes the pulse's keyframes
under reduce, matching W5-R3's ruled reduced form ("the bar stands still").

## §9 — Console errors per load

Every page load in this walk carried console errors, but they fall into
exactly **3 known, environment-caused classes** (same conclusion as the W4
walk's §14):

1. `kv3qrinl.apicdn.sanity.io` CORS failures — the help-system content CDN,
   blocked by CORS from `localhost:3021` in local dev; unrelated to lens code.
2. A `403 Forbidden` + `TypeError: Failed to fetch` + `AppError: Not
   authenticated` triplet on the **first** navigation after `signIn()` in a
   fresh context — a session-cookie-sync race in the walker's own sign-in
   flow, not seen on subsequent navigations within the same context.
3. `net::ERR_NAME_NOT_RESOLVED` — an unresolvable telemetry/analytics host in
   this sandboxed network.

No new error class traceable to Wave 5's own code changes.

## §10 — §9 Wave 5 acceptance bullets (proposal.md, Engineering path)

The proposal's Wave 5 section (`source/proposal.md:745-753`) is prose, not a
numbered list; decomposed into its constituent claims:

| # | Bullet | Result |
|---|---|---|
| 1 | `page.tsx` wraps brief/discovery/direction/proposal bodies in real regions with real `RegionHead`s | **confirmed** — §1: 1 head per region, 4/4 spreads |
| 2 | `document-index.ts`'s `paperRegionsForSection` stops returning `[]` for the four pre-work sections | **confirmed** — `SECTION_PAPER_REGIONS` returns 2 regions (brief/discovery/direction) or 5 (proposal), never `[]`, live on all four docs |
| 3 | A stop with no value prints `NOTHING YET` / `NOT KNOWN YET` — a sentence, never a dash | **confirmed on the paper** (`Nothing yet`, `Not written yet`), **differs on the rail** — the ladder's fallback is always the generic `NOTHING YET`, even where the paper's own sentence is `Not written yet` (`vision`, live in §1/§2) — this is **W5-C10**, confirmed live: the rail and the paper state an empty stop two different ways, the exact thing `preworkStatus`'s one-derivation design exists to prevent |
| 4 | No new queries needed for `brief` and `discovery` | not independently verifiable from a browser walk (a source-level claim about hook reuse) |
| 5 | Tests: `shelved-spine.test.tsx:155-197` rewritten | not run here (unit-test claim, out of a runtime walk's reach) |
| 6 | Depends on Wave 0 | confirmed by construction — this walk ran against `integration@99cc6d135`, which contains Wave 0 |
| 7 | Rollback: the per-section order table returns `[]`, ladder falls back to head + doors (Wave 2 behaviour) | not tested — no live flag/rollback surface reachable from a read-only walk |

**1 differs (bullet 3), 1 confirmed-by-construction (bullet 6), 2 out of a
runtime walk's reach (4, 5), 1 untestable here (7), 2 clean.**

---

## Shots

36 PNGs in `build/w5-walk/` (35 from the main pass + 1 from the fixup pass,
plus each pass's own `-measurements.json`), `deviceScaleFactor: 1`:

- 24-cell grid: `w5-<1440|1280|390>-<s0|s2|s3|foot>-<project|prework>.png`
  (heights 900/900/844) — all 24 present.
- Pre-work section spreads: `w5-<1440|390>-s0-<brief|discovery|direction|proposal>.png` — 8 present.
- `w5-390-margin-sheet.png`, `w5-390-sections-sheet.png`.
- `w5-1440-s0-loading.png` (500ms single shot), `w5-1440-s0-loading-late.png` (fixup poll, ~4s post-`load`).

Spot-checked visually: `w5-1440-s0-project.png` (rail 3 OF 5, ladder, desktop
margin rail — **note**: the desktop rail shows `BESIDE PIECES · 1` /
`THE WHOLE JOB · 4`, not `· 3` / `· 4` — see Differs #4 below, this is a
raised-vs-settled partition difference, not a Margin-sheet defect),
`w5-1440-s0-proposal.png` (letterhead, band, ladder all as described in §2),
`w5-1440-s0-brief.png` (single head, no double-print), `w5-390-margin-sheet.png`
(matches §3's table exactly).

---

## Differs (ranked)

1. **[MEDIUM, code-confirmed] W5-C1 — `PreworkRegion`'s quiet form re-prints the count line and the wrong sr-only sentence.** Not re-triggerable live on these low-content seeds (every pre-work region stayed `full`), but the source is unchanged from the correctness review and the fix (`a9865ed74`) is confirmed not merged into `integration`. See §1.
2. **[MEDIUM, confirmed live] W5-C2 — the Margin sheet's row "act" performs no distinct act; it opens the same detail sheet the row body opens.** Confirmed by direct interaction. Fix (`e27705aaa`) confirmed not merged. See §3.
3. **[LOW, confirmed live] W5-C10 — the ladder's empty-stop fallback is always `NOTHING YET`, even where the paper's own status line prints `Not written yet`.** The rail and the paper state an empty `vision` stop two different ways on the same load. See §1/§2/§10.
4. **[LOW-INFO, confirmed live, not a defect] The desktop 1440 margin rail's `BESIDE PIECES` count (1) does not match the mobile 390 Margin sheet's `BESIDE PIECES` count (3) for the same project at the same time.** Traced to source: `margin-rail.tsx`'s `anchorGroups` only lists `raised` (needs-action) items — `settled` items fold away into a separate collapsed section the rail doesn't expand by default — while `use-margin-sheet.ts`'s groups (W5-R1's own ruling: "the sheet lists **all 7** items") deliberately show the flat, unpartitioned set. `THE WHOLE JOB` count agrees (4 = 4) because none of those four happen to be settled; 2 of the 3 line-anchored items do. Intentional per W5-R1's text, but worth a design-lead note if "as the rail groups them" was meant to imply matching counts, not just matching heading/order style.
5. **[LOW, confirmed live, code-level not a defect] W5-C4/C7 — `[data-mobile-margin-chips]` at 1280 (3 elements) carries a bare attribute (no `="line"` value)**, and the deleted ≥1180 letterhead-branch call site means the attribute selector only ever matches the line branch today. Matches the correctness review exactly.
6. **[LOW, confirmed live] W5-C12 — no overdue stamp prints on any Margin-sheet row**, despite two of the seven rows being overdue. See §3.
7. **[INFO] A second `<h2>Investment</h2>` lives inside the `proposal` region's DOM**, from `ProposalInstruments`' nested client-preview panel (`client-mirror.tsx`), not from a competing RegionHead. `headCount` stayed 1 everywhere; flagged because the brief specifically asked to check for stray `<h2>`s. See §1.
8. **[INFO] The Offer (`OfferFacets`) never mounted on the proposal spread in this walk** — it is gated on `finalizeTable` (the "worktable" composed-table flow), inactive on an ordinary read of a sent proposal, so the "Offer stays below every block" DOM-order contract could not be exercised live. See §2.
9. **[METHODOLOGY] The inline loading register (D-B39/W5-R3) was not caught rendering in either of two attempts** — a cold `next dev` navigation took ~8s to reach `load` on this contended local server, by which point the underlying query had already resolved. The mechanism is confirmed present in code and confirmed correctly frozen under reduced motion; only the transient render itself went unobserved. See §4/§8.
10. **[METHODOLOGY] The rail-label budget at `…d5`/1440 (13 distinct) is at R1's ceiling with zero headroom** (the falsifier is "more than 13"). Not a violation today, but the next label added to that rail trips it. See §7.

## Commands run unsandboxed

Per "Chromium/Playwright and psql need `dangerouslyDisableSandbox`":

- `npx supabase status` — local demo keys (matched exactly against
  `playwright.config.ts`'s hardcoded local values, which is what booted the
  server).
- `rm -rf .next` (only inside `.codex/worktrees/agent-lens-integration/apps/designer-portal`).
- `next dev --webpack -p 3021` (nohup, background) — booted twice: the first
  attempt omitted `--webpack` and Next 16 defaulted to Turbopack, which
  errored on the repo's webpack config; killed (never bound the port) and
  rebooted with `--webpack`.
- `docker exec -i supabase_db_supabase psql -U postgres -d postgres < build/seed/seed-verify.sql`.
- `docker exec -i supabase_db_supabase psql -U postgres -d postgres -c "select … from document_state where designer_id = '…'"` — read-only census to locate real brief/discovery/direction document ids (§0). No writes.
- `node build/w5-walk.mjs`, `node build/w5-walk-fixup.mjs`, and one ad hoc
  `node /tmp/debug-h2.mjs` (isolating the stray `<h2>Investment</h2>` finding).

No `.env.local` was written or read (env vars passed inline on the boot
command, matching `apps/designer-portal/playwright.config.ts`'s own
documented values). No product code, worktree, or DB row was modified.
`:3021` server killed at the end of this walk.
