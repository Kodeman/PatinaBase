# W5 design review — the pre-work spreads · DESIGN LEAD · 2026-08-30

Reviewed `document-lens/integration` @ `99cc6d135` (code in `.codex/worktrees/agent-lens-integration`) against DL-02, OD-2, W5-R1…R4 and proposal §9 Wave 5, using the walker's `w5-walk.md` + 36 shots (`w5-walk/`); no server was up, so the print judgements below are from the shots and the walker's DOM census. The W5 fix lane (`document-lens/w5-fix`) already carries W5-C1…C7, F1–F3, D-B45 and W5-R4 (amended) — those are marked **fix pending**, not re-found. Reviews only; no code, no git.

## Verdict — **ship-after-fixes**

NEW fix-list items beyond the fix lane's (W6 integration lane unless stated):

1. **N1 · high · the paper's name clips mid-word at 390.** `w5-390-margin-sheet.png` (and the 390 project shots) print the title as **`Aspen Loft — the long p`**. The title is an `<input>` (`letterhead-vitals.tsx`), which never wraps; W3-R6's "one-line title" measurement at 390 was the input clipping, not a title that fit, and the "two-line allowance" can never occur. The mockup's `#frame-390 .lh-title` **wraps** (`line-height: 1.08`, two lines for the specimen). Ruling: at 390 (and at any width where the name exceeds the measure) the title **wraps** and never clips — the read-only `<h1>` prints the name wrapped and the `<input>` appears only in edit mode, or the field becomes an auto-growing textarea; mechanism the ARCHITECT's. Acceptance: on `…d5` at 390 the full name `Aspen Loft — the long paper` is visible in two lines; letterhead gate stays ≤ 265 (W3-R7) — with the second line the seed's letterhead lands ≈ 290, so W3-R7's 390 gate moves to **≤ 300** for a two-line title and the first-head gate to **≤ 470 net of chips** (the chips are gone after D-B45 — assert gross). The one-line seeds keep 265 / 435.
2. **N2 · medium-high · a stage-line strip stands between the band and the first head on the proposal spread.** `w5-1440-s0-proposal.png`: under the band prints `SCOPE & ENGAGEMENT · CORE · STAGE 03`, a progress bar and `CORE · 03` (the pre-existing `SectionStageLine`), then the `--rule-strong` and `The proposal` head. The mockup prints nothing between the band and the first head; and this strip prints exactly the fact W5-R2 §2 retired as "no source" — it has one. **W5-R2 §2 is amended:** `Scope & engagement`'s ladder value is **`CORE · STAGE 03`** (from the section stage line, the tier and stage this paper does carry) **`· N ROOMS`** when rooms exist (`CORE · STAGE 03 · 4 ROOMS`, 25 chars ≤ 30); the head's status line `Core · stage 03 · 4 rooms`; `4 ROOMS IN SCOPE` (W5-R2 §2, W5-C6/F3) is superseded by this form. The strip itself **moves inside the `scope` region as its body** (it is scope & engagement) and no longer stands above the first head; the stage2 mount-order contract (`MobileMarginChips → ProjectApprovalDocumentMount → SectionStageLineMount`) concerns the project paper, where approvals mount — the ARCHITECT rules the pre-work mount. Acceptance: on `…d6` at 1440/s0 the first element after `[data-lens-band]` is `[data-index-region="proposal"]`; `scope`'s ladder value reads `CORE · STAGE 03`.
3. **N3 · medium-low · the desktop rail's group count must be the group's.** The walker's #4: the 1440 rail prints `BESIDE PIECES · 1` (raised items only; settled ones fold into a separate collapsed section) while the 390 sheet prints `BESIDE PIECES · 3`. The ratified print contract (reconciliation "The margin": `BESIDE PIECES · 3`, `THE WHOLE JOB · 4`) counts **every** item in the group; W5-R1 said the sheet groups "as the rail groups them". Ruling: rail and sheet **agree** — the heading's count is the whole group at every width; the rail keeps its raised/settled partition as a second-level fold **inside** the group (raised rows open; `2 SETTLED ↓` under them), never as a separate section that changes the count. Acceptance on `…d5`: rail `BESIDE PIECES · 3` / `THE WHOLE JOB · 4`, sheet the same.
4. **N4 · low · the proposal body's lead line restates the head and the band.** `w5-1440-s0-proposal.png`: under `The proposal` head (status `Sent Aug 23 · unopened 7d`) the body opens with `SENT 7 DAYS AGO — NUDGE CLIENT USER`, the same fact and the same act the band's line 2 (`Sent Aug 23 — not yet opened` `FOLLOW UP`) and the head already print (SP-12: fewer words). Ruling: the lead line is dropped; the `WITH THE CLIENT` ledger that follows it is the body. (Fix lane if it is already in `page.tsx`'s proposal region; else W6.)

Rulings requested, ruled: **(3) the Offer** — the seed need not carry it: `OfferFacets` mounts only under the `worktable` flag (Start to Signature W2–W4, undeployed), which is off in prod as well, so Kody's prod walk cannot see it either; the DOM-order contract (`proposal → scope → vision → investment → Offer`) stays a jest assertion and I152 states that the Offer is flag-gated. **(5) the inline pulse** — a shot is **not required before ship**: the register is asserted by the jest twin (count-line text and box identical with and without the bar), by the reduce probe (`animation-name: none`, walker §8) and by `lens-density.spec.ts:163` on a cold load; a shot is wanted for I152's figure set and the W6 walk should try once more against the production build, where the fetch is slower than the dev server's cache. **(6) labels** — 13 ≤ 14 on `…d5` at 1440/s0 is the right instrument reading (values and fallbacks excluded, W3-R5 §6); per-spread pre-work budgets (`≤ 3 + stops + 1 + doors`) all met (brief 5/≤6, discovery 4/≤6, direction 4/≤6, proposal 8/≤9). **(7) reduce** — 0 running animations after 1s; the pulse's keyframes removed under reduce — seen.

## Per spread (DL-02 / OD-2 / W5-R2), 1440 and 390

| spread (`document_state`) | regions in order | head names · status · eyebrow | ladder | band line 1 (s0 / s2) · line 2 | rail head | verdict |
|---|---|---|---|---|---|---|
| brief (`23bdb027…`) | `brief`, `record` | `The brief` · `Nothing yet` · `Respond by Sep 1` — `The record` · `Nothing yet` | `The brief NOTHING YET` · `The record NOTHING YET` | empty (D-B38 yield) / `<CLIENT> · BRIEF` (not shot; walker) · `New lead — respond by Sep 1 · Respond to the inquiry · Now` | `Brief` / `Respond by Sep 1` (second line = F2, **fix pending**) | seen; F2 pending |
| discovery (`…a2`) | `discovery`, `record` | `Discovery` · `Nothing yet` · `In progress` — `The record` · `1 complete` | `Discovery NOTHING YET` · `The record 1 COMPLETE` | — · `Finish what you need to know · Add Project type and named rooms · +5 MORE` | `Discovery` / `In discovery` (F2 pending) | seen; the eyebrow `In progress` is the version/sub-label slot per W5-R2 §4 — seen |
| direction (`…b2`) | `direction`, `record` | `Direction` · `Nothing yet` · `v1 · Drafting` — `The record` · `2 complete` | `Direction NOTHING YET` · `The record 2 COMPLETE` | — · `Draw up the direction · Open the Drafting Room · +8 MORE` | `Direction` / `Drafting` (F2 pending) | seen |
| proposal (`…d6`) | `proposal`, `scope`, `vision`, `investment`, `record` (W5-R2 §1 order; Offer flag-gated) | `The proposal` · `Sent Aug 23 · unopened 7d` · `v1 · Awaiting signature` — `Scope & engagement` · `Nothing yet` (0 rooms) — `Design vision` · `Not written yet` — `The investment` · `$9,400` — `The record` · `3 complete` | `SENT AUG 23 · UNOPENED 7D` · `NOTHING YET` (→ `CORE · STAGE 03`, N2) · `NOTHING YET` (→ `NOT WRITTEN YET`, W5-C10 pending) · `$9,400` · `3 COMPLETE` | `$9,400` alone at s0 / `CLIENT USER · PROPOSAL` + `SENT AUG 23 · $9,400` at s2 (shot) — **no ordinal ✓** · `Sent Aug 23 — not yet opened` `FOLLOW UP` `+1 MORE` (W3-R2's input counted ✓) | `PROPOSAL` / `AWAITING SIGNATURE` (F2 pending) | seen; **N2, N4** |

390: the same regions and strings at every spread (walker §1 census); no doors on any pre-work spread (`project_id` NULL — W5-R1/B4 branch ✓); the sections sheet names its spread's stops; the six project stops absent on all four (W4-R1 rule: 0 of 5 forbidden keys; `record` legitimately shared) ✓.

## The Margin sheet at 390 (W5-R1) — **seen; two items fix pending**

`w5-390-margin-sheet.png`: More door `→ Margin · 7`; head **`Margin · 7`** / **`2 OVERDUE`** (the two overdue decisions; the invoice uncounted — as ruled); **`THE WHOLE JOB · 4`** then **`BESIDE PIECES · 3`**, seven rows verbatim (walker §3), each a lifted card (`doc-elevated`, R126's chips-as-paper), kind line (`DECISION · OVERDUE`), title, owner, the line-anchored rows' italic line label (`Living Room · Reading Chair — COM Fabric Pending`), one act right (`SEND A NUDGE` / `OPEN THE RECORD` / `OPEN THE FOLIO` / `REPLY`); Escape → the More door; line-anchored press jumps then opens the item sheet. Fix pending: W5-C2 (the row act opens the same sheet as the body), W5-C12/C13 (no overdue stamp; owner words), `CAPTURE A NOTE` (W5-R4 amended). **N3** is the rail's side of the same ruling.

## The proposal spread's re-parented blocks (W5-R2 §1) — **seen**

DOM order `proposal → scope → vision → investment → record` (walker §2). `vision` prints `Not written yet` (no description on this seed) and `investment` the totals ledger (`INVESTMENT · TOTAL $9,400`, `w5-1440-s2-prework.png`) — the figure printed in the head's status and in the ledger's total is the same relation Money has on the project paper (head names, ledger states) and is not a duplicate to fix. `scope` `Nothing yet` (0 rooms) — the `4 rooms` branch is unexercised on this seed; N2 now defines it.

## Acceptance bullets — proposal §9 Wave 5

| # | bullet | verdict |
|---|---|---|
| 1 | real regions with real `RegionHead`s on the four spreads | seen (1 head per region, 0 stray `<h2>`; the client-mirror preview's inner `<h2>Investment</h2>` is the client's own document preview, not a head — noted, not a defect) |
| 2 | `paperRegionsForSection` never `[]` for pre-work | seen (2 / 2 / 2 / 5) |
| 3 | an empty stop prints a sentence, never a dash | seen on the paper (`Nothing yet`, `Not written yet`); **differs on the rail** — always `NOTHING YET` (W5-C10, fix pending) |
| 4 | no new queries for brief/discovery | not verifiable from a walk; the correctness review's |
| 5 | `shelved-spine.test.tsx` rewritten | jest claim, not mine |
| 6 | depends on Wave 0 | by construction |
| 7 | rollback (`[]` table) | void — no flag (R127 ruling 3) |

## Carried into W6 acceptance
- N1 (title wraps at 390; gates 300 / 470 for a two-line name), N2 (no strip between band and first head on `…d6`; `CORE · STAGE 03` on `scope`), N3 (rail and sheet counts equal), N4.
- The fix lane's list green on the W6 build: W5-C1 (W4-R1's quiet form on pre-work regions), C2, C6 (now N2's form), F2 (rail head one line on pre-work), C10, `CAPTURE A NOTE`.
- One attempt at a pulse shot on the production build; `…d5` cold-load densities per the W4 review's item 1.

## fix sign-off · `document-lens/w5-fix` @ `625e61f74` · DESIGN LEAD · 2026-08-30 — **NOT SIGNED on one item (1b); everything else signed**

Read from the lane's own dev server on **:3010** (the same worktree; Next refuses a second `next dev` per directory, so my :3023 boot exited — I did not kill the lane's server). Probes: `scratchpad/w5-fix-probe.mjs`, `-probe3.mjs`, `w5-esc.mjs`; fresh contexts, storage cleared.

| # | item | measured | verdict |
|---|---|---|---|
| 1a | N1 — the name wraps at 390 | `Aspen Loft — the long paper` as an `<h1>`, 32px, **69 px = two lines**, `scrollWidth 327 = clientWidth 327` (no clip); letterhead **289** (≤ 300), first head **457** (≤ 470) — D-B48's numbers | **seen** |
| 1b | press the name → input; **Escape restores** | press → `INPUT[Project title]` in place with the value ✓ · **Escape → `location.pathname` = `/desk`** (`w5-esc.mjs`: `/doc/…d5` → Escape → `/desk`; the letterhead block is gone at +0.5 s, +2.5 s and after a blur click). The page-level Escape (Put down) fires from inside the title field: the reader loses the paper for pressing the key that should give her the name back | **differs — defect, medium.** The title input must handle Escape itself (restore the `<h1>`, keep focus on the name, `stopPropagation`) and the shell's Put-down key must ignore editable targets (`input, textarea, [contenteditable]`, and any `role="dialog"` — the same `isEditable` guard `use-lens-state.ts` already has). Acceptance: press → Escape → same `pathname`, `<h1>` visible with the name, focus on the name |
| 2 | N2 — `…d6` first element after the band; `scope` | the band's next sibling is the proposal region's wrapper and its first child is `[data-index-region="proposal"]`; nothing between; `scope` head `Scope & engagement` / **`Core · stage 03`**; the strip inside `scope` (`Workflow stage` · `SCOPE & ENGAGEMENT · CORE · STAGE 03` · bar · `CORE · 03`); ladder `CORE · STAGE 03` | **seen** · one low note for W6: inside `scope` the strip's own label line repeats the head's name and status 20 px below (`Core · stage 03` prints three times in one region) — the strip drops its label and its `Workflow stage` eyebrow; the bar and `CORE · 03` are the body (SP-12) |
| 3 | N3 — rail counts | 1440 rail on `…d5`: `IN THE MARGIN` · **`BESIDE PIECES · 3`** · `2 SETTLED ↓` inside the group · **`THE WHOLE JOB · 4`** · `2 SETTLED ↓` inside the group; sheet `· 3` / `· 4` | **seen** |
| 4 | N4 — the proposal body's lead | `SENT 7 DAYS AGO —` gone; the row keeps `NUDGE CLIENT USER` alone as the guide's `#proposal-send-wall` destination; the state word only as the fallback when the table head holds the act | **seen — confirmed as my intent**: the act's home is that row (the guide lands on it); a row that prints an act and nothing else is fine |
| 5 | W5-R4 — `CAPTURE A NOTE` | head row `Margin · 7` · `2 OVERDUE` · **`CAPTURE A NOTE`** · close; composer dialog **`Note to the margin`**, textarea `Note body`, placeholder **`Note to the margin…`**, autofocused, anchor line **`ABOUT THE WHOLE JOB`**, the due-date control, **`SAVE` / `DISCARD`**; Discard → focus back on **`Capture a note`**, the Margin sheet still open | **seen** |
| 6 | W5-C1 — pre-work quiet head | no pre-work region was quiet on `…d6` at 1440 (all in frame) — not exercisable live; the lane's jest carries it | **not seen live; accepted on the jest evidence** |
| 7 | the inline pulse on a cold load | caught at ~2.1 s on `…d5`: inline pulses **inside the heads** for `resolving the schedule` and `Reading the schedule`; inline for `Reading approvals`, `Loading authorizations`, `opening the ledger`; block form (as ruled) for `Reading the work`, `Loading working budget`; `Checking readiness` had resolved before the sample | **seen** |

**Anchor-line ruling (item 5, `margin_notes.anchor_id` is a uuid — W5-R6).** For I152 the composer's anchor line prints **`ABOUT THE WHOLE JOB` always**, and the note is saved `anchor_kind: 'section', anchor_id: null`, filing under `THE WHOLE JOB` — because a printed `BESIDE PIECES` over a note that then appears under `THE WHOLE JOB` is a line that lies at save time. `BESIDE <STOP>` returns with the schema column D-B44's follow-up names; until then the reader is told where the note will file, which is the truth. Appended as W5-R6 in `reconciliation.md`.

**Verdict on the fix:** signed except 1b. The Escape defect is a one-file guard (the title input + the shell's Put-down key); re-measure with `w5-esc.mjs`'s three lines (`pathname` unchanged, `<h1>` visible with the name, focus on the name) and this sign-off flips to SIGNED without a further review.

## 1b countersign · `document-lens/w5-fix` @ `8073bf464` · DESIGN LEAD · 2026-08-30 — **SIGNED**

Own server `next dev --webpack -p 3023` from the w5-fix worktree (killed after; the lane's :3010 was already down); `scratchpad/w5-esc.mjs` at 390×844 on `…d5`, then `…d6`.

| line | measured | verdict |
|---|---|---|
| pathname unchanged | `/doc/…d5` → press the name (`INPUT[Project title]` focused) → Escape → **`/doc/…d5`** | seen |
| `<h1>` visible with the name | `Aspen Loft — the long paper`, `offsetParent` set; no input mounted | seen |
| focus on the name | `document.activeElement` = **`BUTTON[Rename the project]`**, inside `#document-project-status` | seen |
| the strip inside `scope` (low note) | `scope` region prints `Scope & engagement` · `Core · stage 03` · bar · **`CORE · 03`** — the label line and the `Workflow stage` eyebrow are gone | seen |

The W5 fix is **SIGNED** in full: 1a–7 from the earlier sign-off plus 1b here. W5-R6 (anchor line `ABOUT THE WHOLE JOB` for I152) stands.
