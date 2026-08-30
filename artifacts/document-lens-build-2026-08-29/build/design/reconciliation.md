# Reconciliation — mockup vs proposal, ruled · DESIGN LEAD · 2026-08-29

Program: The Smart Lens → production. Sources: `artifacts/document-lens-proposal-2026-08-28/source/proposal.md` (R127, ratified as written), `mock/final/FINAL.md` (§2 D-1…D-12, §11 R-01…R-11 + RF-01…RF-05, "1280 rail fix"), `mock/final/REVIEW-2.md`, `source/specimen.md`.

**Precedence (Kody, 2026-08-29):** PROPOSAL governs MECHANICS — one-direction density, fold→density, no seam variable, the declared 56px band. MOCKUP governs WHAT PRINTS — yielded segments print their name, L-6 partial yield, the 1280 collapse form, the foot reserve.

Every ruling below has four parts: **ruling · basis · ships · walker sees** (exact strings/positions at 1440 / 1280 / 390). Where a delta feeds an ARCHITECT decision, my countersignature position is stated as *DESIGN LEAD proposes*. Deviations that survive go to `build/design/deviations.md` with the measurement that forced them.

---

## 1 · D-1 — the mockup publishes `--lens-height`; the proposal publishes nothing

- **Ruling:** proposal. Nothing is published. The band's height is a declared constant (`--doc-band-height: 56px`), the landing clearance a second (`--doc-landing-clear: 72px`). No `ResizeObserver`, no JS writer, no `--lens-height`.
- **Basis:** MECHANICS. The mockup's `--lens-height` (319 open / 56 closed) was an occupancy readout for its own dev bar and probe (FINAL §2 D-1 says so). It is the class of thing R127 deletes: a measured value that can acquire a second writer.
- **Ships:** the two constants in `globals.css`; consumers read them; nothing else.
- **Walker sees:** `[data-lens-band]` measures 56px at scroll 0, 400, 1200 at 1440, 1280 and 390 (18 cells). At s0 the band sits in flow under the letterhead; from s1 it is pinned at `top: 0`. Nothing above or below it resizes when it pins.

## 2 · D-2 — the reading window travels on `translateY`, not `inset-block-start`

- **Ruling:** adopt the mockup's implementation as the way L-2 is built. Logged as **D-B1** in `deviations.md` ("measured: driving y with a layout property files a `layout-shift` entry every frame; the whole of an otherwise-zero 0.00022 CLS").
- **Basis:** MECHANICS — but the proposal's L-2 promise is "position-linked, 1:1 with scroll, moving nothing", and only the compositor path keeps that promise under the CLS=0 gate. This is an implementation of the mechanic, not a change to it.
- **Ships:** `data-lens-window` written in the rAF handler as a translate; `inset-block-start: 0`.
- **Walker sees:** the `--rule-mid` bracket rides the ladder's gutter continuously with scroll at 1440 and 1280; no text moves; under reduced motion it steps (L-2's reduce form), never glides.

## 3 · D-4 — a passed region publishes `reading`, not `full` → OD-13

- **Ruling:** proposal on mechanics; the visual question is settled here: **a passed region looks exactly like a full one.** Nothing about a region she has scrolled past changes on the paper — same head, same body, same acts, same ink. There is therefore no *printed* meaning for a third density value.
- **Basis:** MECHANICS (proposal §5 *reading*: "every region she has passed stays `full` and takes `data-passed`"). The mockup invented `reading` to satisfy SC11's "exactly one `full`", a criterion the proposal §6 refuses. The print side has no use for the third value.
- **DESIGN LEAD proposes (for OD-13):** two values, `data-density="full" | "quiet"`, plus the boolean `data-passed`. SC11 is amended to the proposal's form (`full ≥ 1`; the `full` set = regions intersecting the frame ∪ passed). If the ARCHITECT needs a distinct state for the *reading stop* (the one the ladder brackets), it is `data-reading-index` on the shell/rail, not a density value.
- **Ships:** `[data-density='quiet']` rules only; `[data-passed]` carries `content-visibility: auto` and no visual rule.
- **Walker sees:** scrolling back up from s3, every region she passed is complete and unchanged; no region anywhere prints in a lighter ink.

## 4 · D-6 — the mockup keeps the `PHASES` fold and prints `IN HAND TODAY 0:47` in the vitals

- **Ruling:** proposal. `PHASES ▸` is deleted from `letterhead-vitals.tsx`; the in-hand **room** row leaves the letterhead for the rail's doors (`Put down the room`, only while a room is held); the elapsed **clock** leaves for the studio drawer, which already prints `IN HAND TODAY`. The vitals row prints only fields that carry a value.
- **Basis:** MECHANICS (F129/F134; SC1's 148px letterhead subtotal depends on it). The mockup kept both because its SPEC C.3 bound the specimen's data, not because it argued for them — FINAL §2 D-6 says so.
- **Ships:** vitals row = `OPENED 2026-03-02 · PHASE 4 OF 6 · STUDIO MIDDLEWEST, MADISON` (21px at 1440 on real data; 0px when a document has none of the three). No `PHASES` word. No clock in the letterhead. Letterhead `pb-5` → `pb-4`.
- **Walker sees:** at 1440 s0 the letterhead is mark · 40px title · household chip + stage plate · one vitals line · `--rule-mid`; the first region head lands ≤ 405px (target 298 seed / 319 specimen). The drawer's right zone reads `IN HAND TODAY 0:47`. At 390 the vitals wrap to two lines and stay in the letterhead (Dj1-15).

## 5 · D-7 — the mockup's hysteresis pair (hold band wider than promote band)

- **Ruling:** proposal — one threshold, one direction, no release, therefore no pair. The mockup needed a pair only because its three-value vocabulary *demotes* (`full → reading`); under §3 nothing demotes, so nothing oscillates.
- **Basis:** MECHANICS (proposal §4 M3: "There is no release threshold, so there is no hysteresis pair to tune").
- **DESIGN LEAD proposes (to the ARCHITECT):** the only surface that can flicker is the *reading stop* (which segment the bracket names), and that is the running index's existing resolver with its 700ms jump lock plus the L-9 settle gate (<40px/frame for 120ms). Keep those two; add nothing.
- **Ships:** `use-lens-density.ts` with a single `LENS_LOOKAHEAD_PX` mount threshold; `data-passed` never removed.
- **Walker sees:** stepping 40px at a time across a region's opening boundary, the density map changes exactly once and never changes back; bisecting the boundary and stepping ±24px shows no flip.

## 6 · D-12 — the paper's foot reserve (520 / 460 / 560px)

- **Ruling:** mockup, as a **requirement**, not as a literal: pressing the last stop (`The record`) must land its head at `--doc-landing-clear` (72px) at every tier, and the document must not end before that is possible. The ARCHITECT derives the reserve from the real page (the last region's height and the tier's frame), not from the mockup's three numbers.
- **Basis:** WHAT PRINTS — where the navigator lands is something the walker sees (the mockup measured every stop landing at exactly y = 72 only with the foot; without it the last stop landed at 301px "and the navigator lies").
- **DESIGN LEAD proposes:** the foot is the colophon's own margin — the colophon keeps `mt-14` and gains bottom padding of `max(60px, calc(100dvh − var(--doc-landing-clear) − <last region's box>))`, computed once per tier in CSS with `min-height` on a foot element rather than measured in JS. The paper "ends in a margin, not at its last word."
- **Ships:** a foot rule on `[data-document-paper]` (or the colophon wrapper) per the ARCHITECT's derivation.
- **Walker sees:** press `The record` on the ladder at 1440, 1280, and in the Sections sheet at 390 → its head sits at y = 72 under the band, bare paper and the colophon below it.

## 7 · RF-02 — a yielded segment prints its **name**; the rail head yields the stage phrase only (L-3, L-6)

- **Ruling:** mockup. **L-3:** while a segment's own `[data-region-head]` is in frame, its *value* yields and its *name* prints (11px mono, `--text-muted`), in the same 15.4px box, so the bracket never sits on blank rail. **L-6:** at s0 the rail head yields the **stage phrase** only; `Vandersteen` (13px) and `4 OF 6` stay printed and turn `--text-muted` while the letterhead is in frame, returning to `--text-primary` when it leaves. The arc never yields.
- **Basis:** WHAT PRINTS. The proposal's "prints nothing" left the reading bracket around emptiness — F13 in a new coat ("below the fold the paper stops naming the job"). A name is a position signal, not a fact; SP-08 (one fact, one printing) is not broken because no number moves off the paper.
- **Ships:** two layers per segment swapped on `data-region-head-in-frame` (no layout shift); `data-letterhead-in-frame` drives the head.
- **Walker sees:** 1440 s0 — rail reads `← PUT DOWN` · `Vandersteen` (muted) · arc · `4 OF 6` (muted) · `--rule-mid` · `CLIENT APPROVALS` (name, bracketed) · `INSTALL SEP 15 · 3 WEEKS` · `36 LINES · 1 DAMAGED AUG 26` + four room rungs · `$17,500 OUT · $12,300 UNDRAWN` · `0 OF 6 CLOSED OUT` · `12 COMPLETE` · `FILED WITH THIS JOB` · `Plan room` · `Spec book` · `Mood boards` · `Call sheet`. 1440 s2 (Pieces in frame) — `PIECES` prints as a name under the bracket; every other segment prints its value; the head prints all three lines in full ink. 1280 — identical words inside 112px, wrapping at spaces.

## 8 · RF-03 — margin groups: one group per anchor that has items; the empty line is deleted; cards do not move

- **Ruling:** mockup. Headings are `BESIDE PIECES · 3` and `THE WHOLE JOB · 4` — one per anchor that has members — and a heading's count lifts to `--text-primary` while the reader stands in that anchor's stop (`data-beside-current`). Cards keep their DOM order; nothing physically re-sorts on a reading-stop change (CLS 0). The proposal's `NOTHING BESIDE PIECES YET` line is **dropped**: it can only be true when the current stop's group is the only group and is empty, and the wrap collision it caused is gone with it.
- **Basis:** WHAT PRINTS. The proposal's item 4 ("empty is printed, not blank") was answered by the heading + count, which is printed; and its item 2 ("current stop's group first") conflicts with the CLS = 0 gate the same proposal asks for (L-4/L-5, "nothing she is reading moves under her" SP-03).
- **Ships:** per-card anchor line (`TIME · BESIDE PIECES` / `MONEY · ABOUT THE WHOLE JOB`); group heads with counts; the 1180–1439 tab `MARGIN · 7 · 1 OVERDUE`; first-touch note capped at two lines; duplicate `IN THE MARGIN` heading removed.
- **Walker sees:** 1440 — margin column: first-touch note (2 lines, once) · `IN THE MARGIN · 7` · `NOTE PHOTO VOICE` · composer · `BESIDE PIECES 3` · three `TIME · BESIDE PIECES` cards · `THE WHOLE JOB 4` · four `MONEY · ABOUT THE WHOLE JOB` cards; when Pieces is the reading stop the `3` reads charcoal, otherwise muted. 1280 — closed tab `MARGIN · 7 · 1 OVERDUE`; the sheet prints the same groups once, no duplicate heading. 390 — line-anchored chips inline beside their line; the rest in the sheet under `ABOUT THE WHOLE JOB · 4`.

## 9 · RF-05 / R-01 — SC4 reads 40.8 % merged ink / 92.2 % span, not ≥ 70 %

- **Ruling:** neither the proposal's 70 % nor the mockup's 40.8 % is the instrument. **The rail metric this program gates on is the label count: ≤ 13 distinct text labels in the rail at 1440/s0** (proposal §4, R1's own falsifier; mockup measured 12). Merged-ink % and first-to-last-ink span are **reported**, never gated. `SC4 ≥ 70 %` is retired from `brief.md`'s criteria for the build.
- **Basis:** instrument correction, not precedence. `measure-layout.mjs` counts bordered boxes as ink; the ladder is `--rule-hair`-bordered; the number measures the instrument. Kody's sentence was *cluttered*, and clutter is labels, not pixels.
- **Ships:** the ladder distributes its segments across the rail's available height (`flex: 1 1 auto`, data-derived bases, 36px floor per segment; `pb-24` on the spine → 24px); whitespace between six one-line segments is kept — "the peace the ask is about".
- **Walker sees:** at 1440/s0 the rail does not scroll itself (`scrollHeight === clientHeight`); the six segments spread down the track with the reading bracket on the first; label count ≤ 13.

## 10 · The 1280 collapse form → OD-14

- **Ruling:** mockup. At 1180–1439 the room sub-rungs **do not print**; `Pieces` carries the rooms in its value. The `FILED WITH THIS JOB` head gets a real two-line height (34px) so it never overprints `Plan room`. Per-segment floors at 1280 are set from the wrapped value heights (the mockup measured 45/45/112/60/45/29), not a uniform 24.
- **Basis:** WHAT PRINTS, and measured: at 136px column / 112px measure, four open rungs plus six wrapped values need ~384px against ~344 available (FINAL §11 "1280 rail fix"). Override 2 already provides the collapse form; the mockup applies it permanently at this tier.
- **DESIGN LEAD proposes (for OD-14):** at 1440 rungs print while the bracket touches `Pieces` or a room is in hand (proposal Override 2); at 1280 rungs never print; the room lens at 1280 is reachable through the Pieces region's own room heads on the paper (which carry `data-room-chip`) and through the 390-style sheet is **not** needed. The 1280 value string is **`36 LINES · 4 ROOMS · 1 DAMAGED`** (29 chars, inside the 30 cap); the damage *date* prints on the paper's count line and in line 2 when it is the worst thing — the rail is not the place for a third copy at this width. At 1440 the value is `36 LINES · 1 DAMAGED AUG 26` (27) with the four rungs beneath it (rooms are implicit).
- **Ships:** a 1280-only rule on the ladder (`min-[1180px]:` … `max-[1439px]`) that hides rungs and swaps the Pieces value string; the doors head at a declared height.
- **Walker sees:** 1280 s0 — the rail reads `Put down` · `Vandersteen` · arc · `PROCUREMENT` / `& ORDERS` / `4 OF 6` (wrapped at spaces) · `CLIENT` / `APPROVALS` · `INSTALL SEP` / `15 · 3 WEEKS` · `36 LINES · 4` / `ROOMS · 1` / `DAMAGED` · `$17,500 OUT ·` / `$12,300` / `UNDRAWN` · `0 OF 6 CLOSED` / `OUT` · `12 COMPLETE` · `FILED WITH` / `THIS JOB` · `Plan room` · `Spec book` · `Mood boards` · `Call sheet`. No word breaks mid-word; no clipped rung; no overprint.

**Ruling on the arc at 1180–1439 (W1-L1 measurement, 2026-08-29): (d) — the arc wraps to two rows, same marks.** Seven `xs` StrataMarks (16px + gap) need 154px and the tier's measure is 112px, so the horizontal row cannot print. Ruled: the arc `<ul>` keeps its seven `xs` marks and its `-mx-2`, and at 1180–1439 only it takes `flex-wrap` — **four marks on the first row, three on the second**, each `li` at `min-h-6` (24px, the 2.5.8 floor for a pointer tier) instead of `min-h-11`, so the arc costs 48px. Rejected: (a) vertical — 308px empties the ladder's budget; (b) a 14px mark — a new StrataMark size, a register change under NG4; (c) active mark + count — deletes the one thing the rail earns by being true across the whole document. Consequence for the head reserve at 1280: name 18 + arc 48 + stage phrase 2 lines 32 + count 16 ≈ **116px** (the 1440 head stays 100); the ladder track at 1280 loses ~16px (358 → ~342), which the mockup's measured per-slot floors (45/45/112/60/45/29 = 336) still fit. Logged for the ARCHITECT as a 1280-only head reserve; no ladder rule changes.
- **Walker sees (1280, s1+):** the head reads `Vandersteen` · `◆ ◆ ◆ ◆` / `◆ ◇ ◇` (two rows, the active mark breathing) · `PROCUREMENT` / `& ORDERS` / `4 OF 6`; at s0 the phrase yields and the two rows and the count stay.

## 11 · R-02 — `.da-pool` / sr-only `scrollWidth` reports at 390

- **Ruling:** does not transfer. The 5px Scored Ink bead overhang is the shipped R126 press mechanic (`.da-pool`), and the 1×1 clipped sr-only line is the proposal's own M5 non-visual channel; both report `scrollWidth > clientWidth` on their parent while painting nothing past any edge. The product's SC10 asserts what SC10 means: **nothing paints past the viewport edge** (`documentElement.scrollWidth ≤ clientWidth`, plus a per-element check that skips clipped / ≤1px-wide nodes).
- **Basis:** mockup chassis artefact; the ruling protects the R126 wash and the a11y line from being "fixed" away.
- **Ships:** the SC10 assertion written to that definition, with the reason in the spec's comment.
- **Walker sees:** no horizontal scrollbar at 390, 1280, 1440; the bead still blooms 5px past an act on press.

## 12 · Specimen corrections (carried into the seed)

| Wrong (in proposal / deck) | Right | Source |
|---|---|---|
| `1 DAMAGED SEP 26` | **`1 DAMAGED AUG 26`** — the carrier window closes 2026-08-26 | specimen: "carrier window closes 2026-08-26 (tomorrow)" |
| `SPEC THE 3 UNSPECIFIED` | **`SPEC THE 2 UNSPECIFIED`** — Mudroom 5 (3 ordered, 2 unspecified); 14+8+9+5 = 36 leaves no third | specimen rooms line |
| — | Two figures are **seed-defined, not specimen**: `0 OF 6 CLOSED OUT` (closing-the-book items) and `12 COMPLETE` (the record). The seed decides them; the proposal's strings are examples, not facts | specimen has no closeout or record counts |

No third arithmetic error found: `OVERDUE 6D` (sent 08-13, today 08-25), `OVERDUE 3D` (COM by 08-22), PO 14 days (sent 08-11), Invoice 2026-114 22 days, Byrne `UNOPENED 6D` (sent 08-19) all reconcile.

## 13 · The mobile-bar slot → OD-11 (joint with ARCHITECT) — **signed 2026-08-29**

- **Proposal:** the household moves to the bar's left zone (`mobile-bar.tsx:230-231`). **Mockup (RF-04):** the `SECTIONS` slot prints the stop she is standing in.
- **Ruling (joint):** the ARCHITECT's mechanics stand — today's three-slot bar (sections door · primary act · `MORE`) is kept; the left zone prints the **household**; the bar root publishes `data-reading-index`; the sections button's `aria-label` reads `Open sections, at {stop}`; the sheet's active row is `aria-current`. My earlier "retire the primary-act slot" is withdrawn (mechanics, not print). **Print amendment (adopted):** the stop is *printed*, not only announced — the left zone carries three lines inside `min-h-[64px]`: `IN THIS DOCUMENT` (11px mono overline) · household (14px, truncated) · **`AT PIECES`** (11px mono `--text-muted`, pre-printed names swapped by visibility → no layout shift).
- **Open for the ARCHITECT (DL-05):** at 390 the bar's primary act and the band's line-2 act are the same act printed twice in one frame; one act, one printing — the architect picks (rank-2 act in the slot, or drop the slot while the band is mounted) and logs it.
- **Walker sees (390, any offset):** bar `IN THIS DOCUMENT / The Vanderste… / AT PIECES` | one act | `MORE`; band `$17,500 OUT · INSTALL SEP 15` / `OVERDUE 6D · Primary bedroom approval` `REMIND` `+3 MORE`.

---

## What prints — the print contract per organ

### The band (56px; line 1 = 11px mono `--text-muted`; line 2 = 15px; both `nowrap` + ellipsis)

**Line 1 — left / right, per spread kind** (right slot is right-flush; both slots yield to the letterhead at s0: at s0 only facts the letterhead does **not** print survive — money and the next date):

| Spread | Left (identity · stage) | Right | At s0 |
|---|---|---|---|
| project | `VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6` | `INSTALL SEP 15 · $17,500 OUT` | `$17,500 OUT` |
| install | `… · INSTALLATION & STYLING 5 OF 6` | `INSTALL TUE SEP 15 · $17,500 OUT` (money only while anything is outstanding) | `$17,500 OUT` |
| care | `… · COMPLETION 6 OF 6` | money emphasis only (`$17,500 OUT`); empty when nothing is outstanding — no date after install (OD-1) | money emphasis or nothing |
| brief | `REINHARDT LAKE HOUSE · BRIEF` | nothing — no dated or money fact exists on this spread (E1 §4; OD-1) | nothing |
| discovery | `… · DISCOVERY 2 OF 6` | nothing (OD-1) | nothing |
| direction | `… · DESIGN DEVELOPMENT 3 OF 6` | nothing (OD-1) | nothing |
| proposal | identity from `deriveTicketIdentity` (`THE BYRNES · PROPOSAL`) | `SENT AUG 19 · <investment total>` — on the Byrne specimen the $9,400 fee, not $184,500 (DL-01) | the investment total |

Yield rules: the current stop's name is **never** on line 1 (the paper's `<h2>` and the ladder carry it). While `Money` is the reading stop the right-flush money figure drops (`INSTALL SEP 15` alone). Pressing the household is *to the top* (focus → `#document-project-status`). At 390 line 1 is the two facts the letterhead does not print: `$17,500 OUT · INSTALL SEP 15` (28 chars in 334px).

**Line 2 — the sentence that changes (L-1), per spread:** the worst standing exception ranked by deadline, with its act, then `· +N MORE` when any were withheld; when nothing stands, the stage's guide sentence (I146's seven stage sentences) with its act.

| Spread | Worst standing (specimen) | Nothing standing |
|---|---|---|
| project | `OVERDUE 6 DAYS · Primary bedroom approval, with the client since Aug 13` `SEND A REMINDER` `+3 MORE` | `Name the phases for this project` `OPEN THE SCHEDULE` |
| install | `PO-2026-0418 unanswered 14 days — dining table, 6 chairs` `CHASE STURDY OAK` | `Walk the punch list` `OPEN THE LIST` |
| care | `Punch item open 9 days — mudroom bench` `CLOSE IT OUT` | `Close the book` `START THE CLOSE` |
| proposal | `Sent Aug 19 · unopened 6 days` `NUDGE THE BYRNES` | `Send the agreement` `SEND` |
| brief / discovery / direction | the stage's own dated need when one exists | the I146 stage sentence for that stage, with its act |

Ink: terracotta-ink `#9C5340` when an exception stands; charcoal otherwise. **Truncation order (rule, every width):** the act's words first (`SEND A REMINDER` → `REMIND`), then the subject's qualifiers (`with the client since Aug 13` → `Primary bedroom approval`), **never** the number, the day-count or the room. At 390 the walker will read `OVERDUE 6D · Primary bedroom approval` `REMIND` `+3 MORE`.

### The ladder (one line per stop; ≤ 30 chars; 11px mono value / 13px name)

| Stop | Value (1440) | Value (1280) | Name when yielded | Leader act (region head) |
|---|---|---|---|---|
| Client approvals | `2 AWAITING · 1 OVERDUE 6D` | same | `CLIENT APPROVALS` | `SEND A REMINDER` |
| Schedule | `INSTALL SEP 15 · 3 WEEKS` | same | `SCHEDULE` | `MOVE THE DATE` |
| Pieces | `36 LINES · 1 DAMAGED AUG 26` + rungs `LIVING ROOM` `DINING ROOM` `PRIMARY BEDROOM` `MUDROOM` | `36 LINES · 4 ROOMS · 1 DAMAGED` (OD-14 splice, date dropped to stay ≤30), no rungs | `PIECES` | `SPEC THE 2 UNSPECIFIED` |
| Money | `$17,500 OUT · $12,300 UNDRAWN` | same | `MONEY` | `DRAW AN INVOICE` |
| Closing the book | `0 OF 6 CLOSED OUT` (seed-defined) | same | `CLOSING THE BOOK` | `START THE CLOSE` |
| The record | `12 COMPLETE` (seed-defined) | same | `THE RECORD` | `OPEN THE RECORD` |
| *(no number)* | name at 13px + `NOTHING YET` / `NOT KNOWN YET` beneath, `--text-muted` | same | — | — |

Pre-work (after Wave 5), proposal spread: `THE PROPOSAL` `SENT AUG 19 · UNOPENED 6D` · `SCOPE & ENGAGEMENT` `CORE · STAGE 03` · `DESIGN VISION` / `NOTHING YET` · `THE INVESTMENT` `$184,500 · 20% MARGIN`. Brief/discovery/direction (per OD-2 + DL-02): stops `THE BRIEF` / `DISCOVERY` / `DIRECTION` + `THE RECORD`, each printing its name (13px) over `NOTHING YET` until it carries content; between Wave 2 and Wave 5 the track prints one line `NOTHING ON THIS PAPER YET`. Doors, every spread, every desktop tier: `FILED WITH THIS JOB` · `Plan room` · `Spec book` · `Mood boards` · `Call sheet` (+ `Put down the room` only while a room is held; + **`The client's copy`** on the proposal spread only — OD-8/DL-04). **On the seeded long paper** the numbers will differ (see Seed requirements): the seed decides line counts, the damage date, the overdue day-counts — the *shape* of every string above is the contract, the digits are the seed's.

### Quiet regions (head 24px Playfair + `--rule-strong` · one count line ≤ 40 chars · one inked leader · sr-only state line)

| Region | Count line | sr-only line |
|---|---|---|
| Client approvals | `2 awaiting the client · 1 overdue 6d` | `2 awaiting · not yet on the paper · press Client approvals on the index to open` |
| Schedule | `Install Tue Sep 15 · 3 weeks out` | same pattern |
| Pieces | `36 lines · 4 rooms · 1 damaged` | `36 lines · not yet on the paper · press Pieces on the index to open` |
| Money | `$17,500 out · $12,300 not drawn` | … |
| Closing the book | `0 of 6 closed out` | … |
| The record | `12 complete` | … |
| empty | `Nothing yet` (no count); `Not known yet` when unknowable on this spread | `Nothing yet` |
| folded by her | `--rule-mid`, italic name, mono summary, `UNFOLD ↓`, **`CLOSED BY YOU`** | — |
| folded by default (non-stop keys only: schedule frame, money table, boards strip — DL-09) | `--rule-mid`, italic name, mono summary, `UNFOLD ↓`, **no cause line** | — |

Exceptions never go quiet, except the one the band's line 2 is naming at that moment. Numbers never soften. Region rule stays `doc-rule-strong` at every density.

### The margin

Headings: `IN THE MARGIN · 7` · capture row `NOTE PHOTO VOICE` · `BESIDE PIECES · 3` (one per anchor with items; count lifts to charcoal while standing in that stop) · `THE WHOLE JOB · 4`. Card anchor lines: `TIME · BESIDE PIECES`, `MONEY · ABOUT THE WHOLE JOB`. Tab at 1180–1439: `MARGIN · 7 · 1 OVERDUE`. A card never prints a figure the band or a segment is printing (kind + subject only).

### The mobile bar (390)

`IN THIS DOCUMENT` / household · `SECTIONS` / current stop · `MARGIN` / `7 · 1 overdue`. Sections sheet rows (`min-h-11`): `Put down` (top) · six stops with the same names and ≤30-char values · `FILED WITH THIS JOB` · four doors. Sheet kinds named: `Sections`, `Margin item`, `Studio actions`.

### The standing sheet (L-11, `DocSheet` new kind)

Title `Standing · 4` in the sheet's own title register (OD-6) — the count = every standing exception, none withheld. Rows, ranked by deadline, each with its own act: `OVERDUE 6D · Primary bedroom approval — Hartland rug, walnut nightstands · sent Aug 13` `SEND A REMINDER` · `OVERDUE 3D · Living room fabric for the reading chair · COM by Aug 22` `CHOOSE THE FABRIC` · `CLOSES TOMORROW · Carrier window, brass-and-oak console` `FILE THE CLAIM`* · `14 DAYS · PO-2026-0418 unanswered, Sturdy Oak` `CHASE STURDY OAK`. Close = `PUT BACK · Esc`; focus returns to the `+N MORE` word. (*The claim's act names the existing damage door; filing itself is still §11.7's refusal.)

---

## Seed requirements — the long paper (`b0000000-0000-0000-0000-0000000000d5`)

Every string above must be exercisable on the seeded document. **All dates relative to `now()`** (`now() - interval '6 days'`, etc.) so `OVERDUE 6D`, `14 DAYS`, `CLOSES TOMORROW` stay true on any day the walker runs.

- **Rooms (≥ 4; propose 5):** Living room 18 · Dining room 12 · Primary bedroom 14 · Mudroom 8 · Kitchen 10 = **62 lines**, all with `project_room_id`; ≥ 40 with `product_id` into the 21 local `products` (crops render on catalog-linked lines).
- **Statuses across the 62** (after the `aaa_ffe_ratchet_to_po_stage` trigger): a spread of `specified`/`ordered`/`production`/`shipped`/`delivered`; **exactly 2 unspecified** (`SPEC THE 2 UNSPECIFIED`); **exactly 1 damaged** — the brass-and-oak console, delivered `now() − 6d`, `blocked_reason` "top panel gouged", carrier window `now() + 1d` (`1 DAMAGED <tomorrow's date>` on the ladder, `CLOSES TOMORROW` in the sheet).
- **Approvals:** two awaiting the client — one **overdue 6 days** (Primary bedroom rug + nightstands, sent `now() − 12d`, due `now() − 6d`), one **overdue 3 days** (Living room reading-chair fabric, COM by `now() − 3d`); at least two approved (dining finish sample; whole-house hardware) so the region prints history.
- **Purchase orders:** ≥ 3; one **unacknowledged 14 days** — `PO-2026-0418`, Sturdy Oak Woodworks, dining table + 6 chairs, $14,880, sent `now() − 14d`, `acknowledged_at` null; one acknowledged; one delivered.
- **Schedule:** install milestone `now() + 21d` (a Tuesday if the seed can choose) so `INSTALL <date> · 3 WEEKS` prints; a COM milestone `now() − 3d` (overdue); a site walk `now() + 14d`; punch list `now() + 25d`.
- **Money:** outstanding invoice $17,500 sent `now() − 22d`; deposit not drawn $12,300 tied to PO-2026-0418; budget/specified/ordered figures that reconcile (`$184,500 / $171,240 / $141,600`).
- **Closing the book / the record:** ≥ 6 closeout items, 0 closed (`0 OF 6 CLOSED OUT`); ≥ 12 settled sections/records (`12 COMPLETE`) — or, if the record derives from settled sections only, whatever count the seed yields is written into the walk's expected strings.
- **Margin:** 7 items — 3 anchored to Pieces lines (time/photo on the console, the COM, the PO), 4 whole-job money/time items — so `BESIDE PIECES · 3` / `THE WHOLE JOB · 4` print.
- **A second, pre-work document** for the same designer (a proposal, sent `now() − 6d`, unopened, $9,400 fee) so `SENT <date> · UNOPENED 6D` / `NUDGE …` is exercisable at 1440/1280/390.
- `build/seed/seed-verify.sql` asserts: rooms ≥ 4, lines ≥ 60, lines with product ≥ 40, unspecified = 2, damaged = 1, overdue approvals = 2, POs ≥ 3, unacknowledged 14-day PO = 1, margin items = 7.

---

## W3-L2 rulings — the band's line 2, the guide's leftovers, the letterhead at 390 · DESIGN LEAD · 2026-08-29

Read on `document-lens/w3-l2` @ `48d5b0de5`: `lib/document/lens-band-derivation.ts` (`NEED_TIER`, `TIER_ORDER`, `rankStanding`), `components/document/lens-band.tsx`, `components/document/standing-sheet.tsx`, `components/document/doc-letterhead.tsx`, `page.tsx` around the `LensBand` mount, `page.test.tsx`'s W3 comments, `lib/document/need-tie-break.ts` (`TIE_BREAK_RANK`), and the mockup's line-2 and sheet specimen.

**W3-R1 · Line 2 prints in deadline order, not kind order — neither the shipped `NEED_TIER` nor the desk's `TIE_BREAK_RANK`.** The mockup's line 2 on the specimen reads `OVERDUE 6 DAYS · Primary bedroom approval, with the client since Aug 13` first, and its sheet lists `OVERDUE 6 DAYS` · `OVERDUE 3 DAYS` · `CLOSES TOMORROW` (the damage window) · `14 DAYS NO ACK` (the PO) — an approval six days past its day above a claim window that closes tomorrow above a maker's fourteen-day silence. That is the proposal's own sentence ("the standing set is ranked by deadline, and a deadline is a fact, not a capability") and it is what prints. Ruling: `rankStanding` sorts by **deadline distance** — things past their day first, most days overdue first; then things with a deadline ahead, soonest first; then things with no deadline (a silence), longest-standing first — and only within equal distance does the desk's `TIE_BREAK_RANK` (`need-tie-break.ts:92`) break the tie. On `…d5` (62 lines · 1 damaged · 2 overdue approvals · a PO 14 days unacknowledged · a window closing tomorrow) line 2 therefore prints the **older overdue approval** with its act, and the sheet runs approval (6d) → approval/COM (3d) → carrier window (tomorrow) → PO silence (14d). On the A1 fixture the same rule prints whichever of the task and the damage is nearer its deadline — a task past its day beats a window still open; a window closing tomorrow beats a task due next week. The desk keeps its kind-rank for the roster (A1's invariant is the roster's, not the band's); the guide's headline may lead with a different item than line 2 and that is not a defect, because the guide prints only when nothing stands. Accepted; the fix lane replaces the four-tier sort with the deadline sort and keeps the tiers only as eyebrow words.

**W3-R2 · The guide's leftovers.** (a) `model.reason` — **dropped**, deliberately: it restated the headline in prose ("Something on this job needs a decision") and SP-12 says quieter means fewer words. (b) The **inputs** (`Input needed · Client signature · Client · blocks Project activation · +N more`) are facts about the paper's next stage, not standing exceptions, and they must survive — **in the standing sheet, as their own section**: the sheet prints `Standing · N` (N = exceptions + open inputs) with the exception rows first (eyebrow · sentence · own act), then a rule and a second heading **`INPUT NEEDED · N`** whose rows print `label · owner · blocks <stage>` in the same register (eyebrow = the input's kind word, e.g. `SIGNATURE`; sentence = `Client signature · Client · blocks Project activation`; act = the guide's action where it gives one, e.g. `FOLLOW UP`). Line 2's `+N MORE` counts them, so at every offset the inputs are one press away; at s0 on the A1 proposal fixture line 2 (guide kind) reads `Sent Aug 23 — not yet opened` `FOLLOW UP` `+1 MORE` and the sheet holds the signature row. (c) The open-inputs count prints nowhere on the paper — the sheet heading carries it. Nothing returns to the paper as a strip. The fix lane makes `standing-sheet.tsx` take `inputs: LensInputItem[]` beside `items`.

**W3-R3 · The instruments ledger at 390 (D-B20) — ratified.** The ledger stays mounted at every width: `grid-cols-1` under the vitals at 390, `min-[1180px]:grid-cols-[1fr_auto]` above (proposal §4 header table and the 390 budget: "the instruments stay here, budgeted"). The 390 form: one row of scored-ink acts (`MESSAGE THE CLIENT · PREVIEW AS THE CLIENT`, the scan door) under the vitals, wrapping to at most two lines, 44px targets. The walker records the 390 letterhead height on `…d5` against the budget **≤ 191px** (title on two lines) plus the ledger row; if the ledger's row pushes the first region head past **341px of 844** (the 390 header budget), the ledger goes to one line by shortening its labels (`MESSAGE · PREVIEW`), never by dropping an act.

**W3-R4 · `proposalInvestment` null through Wave 4 — acceptable.** On a proposal spread the right slot prints `SENT <date>` alone and `moneyOnly` prints nothing at s0 until Wave 5's `investment` stop lands. A fact the spread cannot yet derive prints nothing, never a placeholder — the same rule as OD-1's brief/discovery/direction slots. Wave-5 acceptance bullet: `SENT AUG 19 · $9,400` on the Byrne-shaped seed document once the investment stop exists.

Carried unchanged into the W3 review: the L-6 s0 yield of the stage phrase; the overdue decisions named on line 2 (now guaranteed by W3-R1); `Boards` per the leaf's shipped name.

## W3-R4 · the letterhead at 390 — D-B26 countersigned with amendments · DESIGN LEAD (re-seated) · 2026-08-29

**Measured against the mockup's own 390 frame** (`mock/final/index.html`, `#frame-390 .letterhead`): it prints the **mark row** (`.lh-marks` 34px + 10px, `strata-mark size-lg`), the **title at 32px** (`#frame-390 .lh-title { font-size: 32px }`, `line-height: 1.08` → 34.6px a line; two lines for the specimen title), the **household line** with the stage plate (`.lh-house`, 23px + 6px), the **vitals** (21px + 14px) and the closed `PHASES` fold; `padding-bottom: 16px` + `--rule-mid`. **It prints no instruments ledger at any offset at 390** — `MESSAGE` / `PREVIEW` / `SHARING` / `CALL SHEET` occur 0 times in the frame. That is where the proposal's 191 comes from (44 + 69 + 29 + 35 + 16 = ≈193 with a two-line title): a 32px title and no ledger. The proposal's §9:394 line ("the 40px title wraps to two lines; the instruments stay here, budgeted") priced a 40px title into 191 and could not have been met — the arithmetic D-B26 records is right; the two inputs it inherited (40px title, ledger row) were not both the mockup's.

**Ruling — (a) amended, no element dropped.** The mark row stays (arrival, proposal H3 — the mockup prints it at 390); the household chip stays (the paper's own name; the band's 390 line 1 prints `$17,500 OUT · INSTALL SEP 15`, not the household, and the mobile bar prints it only from s1 — dropping the chip would leave the household unprinted at s0). The ledger row stays, as D-B20 ratified and W3-R3 shortened. What changes is the one thing the mockup prints differently: **at 390 the title prints at 32px** (`#frame-390` rule; precedence — mockup governs what prints). The "40px title" bullet in `w3-review-design.md` B5 is the ≥1180/1280 figure; it does not apply at 390 and must not be asserted there. Options (b), (c), (d) are rejected: each removes something the mockup prints to pay for something it does not.

**Budgets the fix lane's spec asserts** (18px root; pads `pt-[14px] pb-[18px]`; ledger one line): 390 = 14 + 44 + 69.1 (32px, two lines) + 29 + 20 + 44 + 18 + 1.5 ≈ **240px** worst case (two-line title), ≈ 205 with a one-line title → gate **letterhead ≤ 240px**; first `[data-region-head]` ≤ 32 + 240 + 24 + 56 + 24 + 14 = **≤ 390px of 844** (46 %; against 665 today). D-B26's 260 / 410 are superseded by 240 / 390. 1440 stays **≤ 170px** as D-B26 rules (40px title, one line).

**Labels — confirmed with one correction to D-B26's mechanism note.** There is no separate `MILESTONES` act to fold: `letterhead-instruments.tsx:471-509` is one instrument, `SharingTierInstrument`, whose label prints the current tier — `Sharing · Milestones` (`TIERS` = Full access / Milestones / Curated). At ≥1180 the ledger prints `MESSAGE · PREVIEW · SHARING · MILESTONES · CALL SHEET · N`, where `SHARING · MILESTONES` is **one act** stating its tier. At 390 the same instrument prints **`SHARING` alone** (its tier is one press away inside its own menu; the accessible name keeps `Sharing · Milestones`), so the row is `MESSAGE · PREVIEW · SHARING · CALL SHEET · N` — 35 chars × 7.5 + 3 gaps × 18 ≈ 316px, one line inside 327; gate ≤ 2 lines. `MESSAGE` / `PREVIEW` drop the family word at every width (it repeats the chip 20px above); `aria-label`s keep `Message the client` / `Preview as the client`.

**D-B24 short form — confirmed.** `<STATE> <DAYS>D · <SUBJECT ≤ 12>` + first-word act + whole `+N MORE` is the mockup's 390 line 2 exactly (`OVERDUE 6D · BEDROOM` `REMIND` `+3 MORE`, measured 184/184 in FINAL.md R-02). Subject = the head noun of the item's *object* (the room, the invoice number, the piece — `BEDROOM`, `INV-2026-114`, `CONSOLE`), never the act's verb or the owner. When the item carries no day-count the form is `<STATE> · <SUBJECT>` (`NO ACK · PO-0912`), not `<STATE> nullD`. State words are the sheet's eyebrow words as D-B24 lists them.

## W3-R5 · the letterhead budgets as measured, the ledger register, the margin chips at 390, `SEND`, the label count · DESIGN LEAD · 2026-08-29

Measured on `document-lens/w3-fix` @ `3fb009c4b` (`build/w3-fix-log.md` "Owed a ruling"): 1440 letterhead **238.9** (pt 14 + mark row 51.25 + title 44.1 + gap 9 + ledger 101.4 = two rows + pb 18); the ledger cannot be one row inside the 432px track because `DocumentAction` is 12px mono at 0.1em (`MESSAGE 72 + PREVIEW 71 + SHARING · MILESTONES 180 + CALL SHEET · 0 130` + 3 × 13.5 = 493.5px). 390 letterhead **312.67** (title 35.5 one line, vitals 36.25 two rows, ledger 97 two rows); first head **610.92**, of which **157.3px is `MobileMarginChips`** (`mobile-margin-chips.tsx:89`, `min-[980px]:hidden`) standing between the band and the first region — a block W3-R4's formula never counted. W3-R4's chrome figures (mark row 44, no grid gap, ledger 44) were the mockup's, not the shipped chrome's; the shipped chrome (mark row 51.25, `gap-y` 9, act boxes `min-h-[44px]`) is accepted as measured.

**1. The ledger's labels — `SHARING` alone at every width.** The tier word is state the Sharing instrument's own menu prints one press away; on the letterhead it is the only label that costs a second row. ≥1180 prints `MESSAGE · PREVIEW · SHARING · CALL SHEET · N` (72 + 71 + 72 + 130 + 40.5 = 385.5px → one row inside 432 at 1440; ≤ 2 rows inside the 324 floor at 1180–1439). The accessible name stays `Sharing · Milestones`. W3-R4's ≥1180 label set is superseded by this one.

**2. The ledger's register below 1180 — the 11px mono floor.** At 390 the same four acts at 12px/0.1em measure 345 + 40.5 = 385px in a 327px run and can never be one row. Below 1180 the letterhead ledger prints its acts at **11px** (the proposal's "11px mono floor", §3 — the register the band's line 1 already uses): 7.5 px/char → `MESSAGE 52.5 + PREVIEW 52.5 + SHARING 52.5 + CALL SHEET · 0 105` + 40.5 = **303px, one row inside 327**. Targets stay `min-h-[44px]`. Mechanism (a `size`/`register` prop on `DocumentAction` or a wrapper class on the ledger) is the ARCHITECT's; the print is this.

**3. The gates the spec asserts** (on `…d5`; the title is one line at both widths on this seed):
- **1440 letterhead ≤ 185px** (14 + 51.25 + 44.1 + 9 + 44 + 18 = 180.35). Title `scrollWidth === clientWidth`; vitals one row; ledger one row.
- **390 letterhead ≤ 250px** (14 + 51.25 + 35.5 + 9 + 29 + 36.25 + 9 + 44 + 18 = 246); allowance for a two-line 32px title +35.5 (≤ 286), stated in the spec's comment, not asserted on this seed. Ledger one row.
- **390 first `[data-region-head]` ≤ 400px** (32 + 250 + 24 + 56 + 24 + 14) **measured net of the chips block**: the spec asserts `firstHead.top − chipsBlock.height ≤ 400` and records `chipsBlock.height` in its output. W3-R4's 240 / 390 are superseded by 250 / 400.

**4. The margin chips at 390 — an owed deviation, not this fix.** The mockup's `#frame-390` prints **nothing** between `#lens-390` and `region-approvals-390`; its seven margin chips live in the 390 **Margin sheet** opened from the mobile bar (FINAL.md "390 Sections and Margin sheets"). The shipped app has no whole-margin sheet — `mobile-sheets.tsx` opens `margin-item` sheets per chip, and the bar has no margin door — so hiding the chips block at 390 would remove the margin at 390 entirely. Ruling: the chips block stays as shipped for Wave 3; **the mockup's form (a Margin sheet at 390 with a door in the mobile bar, the chips block yielding to it) is logged as an owed deviation for the ARCHITECT to price** (D-B27; a candidate for Wave 5 with the pre-work regions, or a follow-up after I152). Until it lands, the 390 first-head gate is net of the chips block, and the gross number is recorded beside it.

**5. `SEND REMINDER → SEND` — confirmed.** The first-word rule is the rule; `REMIND` in D-B24's example was the mockup's word for a different act string and no rule produces it. The subject carries the object (`OVERDUE 7D · INV-2026-114` `SEND`); an act whose first word is `THE`/`A` does not exist in the shipped labels, so no exception is needed.

**6. The rail-label count — 14, not 17.** R1's instrument counts **labels**: the head's text lines, the stop names, the `FILED WITH THIS JOB` heading and the door names. **Value lines are not labels** — a line carrying a figure or a date (`INSTALL SEP 19 · 3 WEEKS`, `62 LINES · 1 DAMAGED AUG 29`, `$17,500 OUT`, `$28,080 UNDRAWN`, `0 OF 6 CLOSED OUT`, `4 COMPLETE`) is the stop's value, and `NOTHING YET` is a value's fallback (excluded by the instrument's own wording). The lane's 17 counted six values; the gate stays **≤ 14 = 3 + stops + 1 + doors**, and W4-L4's reading is the right one.

**7. Two review items the lane left for a ruling, ruled here:** C-11 — yes, clear the stop announcement when `printed` changes (line 2's new sentence is the only thing read). C-12 — the sheet's close returns focus to the `+N MORE` door; if the door no longer prints (the count dropped to 0 while the sheet was open), to line 2's act; if neither, to the band root (`tabIndex={-1}`), never `<body>`. FID-07 — restore `py-6` on the approvals region's open root beside `mt-[var(--doc-region-gap)]`: the internal padding is what prints and nothing ruled its removal.

## W3-R6 · the letterhead budgets after W3-R5, ruled from the shipped chrome · DESIGN LEAD · 2026-08-29

Measured on `document-lens/w3-fix` @ `b6330afd4` (`build/w3-fix-log.md` pass 2): **1440 letterhead 192.06** (pt 14 + mark 51.25 + title 44.19 + gap-y 9 + row 2 = the chip+vitals cell 54.63 — chip 25.88 + `mt-1.5` 6.75, vitals 17.5 + `mt-1` 4.5 — + pb 18 + rule 1); **390 letterhead 308.17** — the ledger is still two rows: at 11px the four acts measure 67 + 66 + 66 + 120 (`CALL SHEET · N`) = 319 + 3 × 13.5 gaps = **359.5px in a 327px run** (W3-R5's 303 counted glyphs and not `px-[6px]` × 4 = 48 or the 0.1em tracking), and the vitals wrap to two rows (36.25); **390 first head 476.17 net of the chips** (gross 633.42, chips 157.25). Pass 1 → 2: 1440 238.9 → 192.06, ledger two rows → one at 1440, SC1 379.94 → 360.06.

**Ruling — the shipped chrome's arithmetic is accepted; two print changes close the 390 ledger row.** The chip's and vitals' internal margins (11.25px) are the chrome's own spacing and print as shipped. The vitals' two rows at 390 are the mockup's own form (`.vitals { flex-wrap: wrap; min-height: 21px }` — the specimen's four vitals wrap there too) and print as shipped. What does not print as shipped is a two-row ledger at 390, and two changes make it one row:

1. **`CALL SHEET · N` → `CALL SHEET` below 1180.** The count is the door's (the ladder's `Call sheet · N` door and the sections sheet print it; the `aria-label` keeps `Call sheet · N`); on a 327px run the four characters ` · N` are what the row cannot afford. Saving ≈ **31px** (120 → ≈ 89 at 7.7 px/char + padding). Row: 67 + 66 + 66 + 89 + 40.5 = **328.5**.
2. **The ledger's gap 13.5 → 9px below 1180** (`gap-[9px]`, the band's own `LENS_LINE2_GAP_PX`). Saving **13.5px**. Row: **315px inside 327** — 12px of slack, one row of 44 by construction. `px-[6px]` and the 0.1em tracking stay (the act's 44px target and its register are not the lever).

Expected 390 letterhead after both: 308.17 − (97 − 44) = **≈ 255**; first head net of chips ≈ 476.17 − 53 = **≈ 423**.

**The gates the spec asserts (final; `…d5`; supersede W3-R5's 185 / 250 / 400):**
- **1440 letterhead ≤ 195px** (measured 192.06; allowance 3). Title `scrollWidth === clientWidth`, vitals one row, ledger one row.
- **390 letterhead ≤ 260px** (expected ≈ 255; allowance 5). Ledger **one row** (`[data-letterhead-ledger]` height ≤ 48); title one line on this seed; the two-line-title allowance (+35.5) is stated in the spec's comment, not asserted.
- **390 first `[data-region-head]` ≤ 430px net of `MobileMarginChips`** (expected ≈ 423; the spec asserts `firstHead.top − chipsBlock.height ≤ 430` and prints the gross, ≈ 580, and the chips height beside it). The chips block itself stays an owed deviation (W3-R5 §4, D-B27 for the ARCHITECT to price).

Both changes are a one-pass W4-integration wiring item (`letterhead-instruments.tsx` label below 1180; the ledger group's gap below 1180); the three `test.fail()` cases are re-pointed to 195 / 260 / 430 in the same commit and must pass. No further letterhead lever is open: the mark row, the 32px title, the chip line, the vitals and the ledger are each the mockup's or a ratified deviation's, and none may be dropped at 390.

## W5-R1 · the 390 Margin sheet is the whole margin (D-B30) · DESIGN LEAD · 2026-08-29

**Cited:** the mockup's `#sheet-margin-390` (`mock/final/index.html`, `role="dialog" aria-label="The margin"`) prints `THE MARGIN 7` with **seven** `.sheet-row`s — every margin item on the paper, line-anchored ones included — a `CAPTURE A NOTE` lead act and a close; no group headings (the mockup's sheet is a flat list). W1's desktop rail groups the same items `BESIDE <stop>` / `THE WHOLE JOB` (proposal §6, the ratified mechanic). W5-L3 as shipped (`document-lens/w5-l3` @ `682be7ef2`) prints `Margin · 4 · 1 overdue` — only the `anchor_kind='letterhead'` set `MobileMarginChips` showed — and leaves the three line-anchored items as chips under their Pieces lines.

**Ruling — (a), the whole margin.** The sheet is the rail's 390 form, and the rail carries the whole margin; a margin door that hides three of seven items sends the reader to the wrong count. The sheet lists **all 7** items, grouped by anchor as the rail groups them (the grouping is the proposal's mechanic; the mockup's flat list is the only thing it simplifies): **`THE WHOLE JOB`** (the four letterhead/section-anchored items) above **`BESIDE PIECES`** (the three line-anchored items, each row's second line naming its line — `Living room · reading-chair fabric`), in the rail's own order within each group. A line-anchored row jumps to its line (the chip's press path) and its `margin-item` sheet opens from the row as it did from the chip. **The line-anchored chips retire at 390** (`MobileMarginChips` prints nothing below 980 once the sheet carries the margin — D-B27/D-B30's form); at ≥980 nothing changes.

**Head string the spec asserts on `…d5`:** door `Margin · 7`, sheet head **`Margin · 7 · 2 overdue`** — the two overdue decisions (the rug/nightstands decision, letterhead-anchored; the COM reading-chair-fabric decision, line-anchored under Pieces) are what the margin derivation counts as overdue; the outstanding invoice is a money item, not an overdue decision, and is not counted (as shipped). Group headings `THE WHOLE JOB · 4` and `BESIDE PIECES · 3`. On `…d6` (no lines) the door prints `Margin · N` with one group `THE WHOLE JOB` and no `BESIDE` heading.

## W3-R7 · the letterhead budgets across engines — one number per width, with the engine allowance stated · DESIGN LEAD · 2026-08-29

**Measured on `document-lens/w4` @ `8545739eb`** after W3-R6's wiring (`CALL SHEET` + `gap-[9px]` below 1180): chromium **192.06 / 255.17 / 423.17-net** (all three inside 195 / 260 / 430); WebKit **201 / 262.25 / 430.25** — the 1440 case +6 over, the other two +2.25 and +0.25 over. The difference is WebKit's font metrics and rounding (the same engine that lays out 1431px at a 1440 viewport), not a print difference: the same elements print in the same rows in both engines.

**Ruling — (b).** A budget is a promise about the letterhead's height as a reader sees it, and a reader on Safari is a reader; a chromium-only gate (a) would leave the promise unverified where the phones are, and per-browser gates (c) would put a pair in an acceptance bullet that should carry one number. The gates move to **1440 letterhead ≤ 205px · 390 letterhead ≤ 265px · 390 first `[data-region-head]` ≤ 435px net of `MobileMarginChips`**, asserted in **both** chromium and webkit; the allowance over chromium's own numbers (+10 / +5 / +5) is the **engine allowance**, named in the spec's comment beside each case with both engines' measured figures, so a future regression is read against the measurement and not against the slack. Firefox stays skipped with its stated reason.

**R127 carries one number per width:** "the letterhead measures ≤ 205px at 1440 and ≤ 265px at 390, and the first region head lands ≤ 435px of 844 at 390 net of the margin chips (chromium 192 / 255 / 423; WebKit 201 / 262 / 430 — the difference is engine metrics)". The chips block's gross figure stays recorded beside it until D-B27/D-B30 retires it at 390 (W5-R1).

## W4-R1 · what a quiet stop prints — the head's own status line, one leader, one sr-only line · DESIGN LEAD · 2026-08-29

**Ruling.** A quiet stop prints its `RegionHead` and nothing else: the head's name, **its own status line** (the count line IS the head's status line — no second paragraph, no uppercase count strip), **one leader act** (the head's existing leader, by name; the overflow group and every other act are hidden at quiet — `aria-hidden` and out of the tab order), and **one sr-only line** immediately after the status line. The region rule stays `--rule-strong`. Everything W4-L2/L3 added beside the head — the invented uppercase count paragraph, the generic `Quiet — opens as you read` string, the full act ledger — is deleted (fidelity F1–F3). Source for every string: the mockup's condensed heads (`mock/final/index.html` `#frame-1440` `.rh-count` / `.rh-quiet`, listed below in the print contract) with the seed's facts substituted; sentence case with ` · ` separators; numbers never soften.

**The missing-fact rule:** a segment whose fact is absent is dropped with its separator (`62 lines · 5 rooms` when nothing is damaged; `0 of 6 closed out` never becomes `— of 6`); when no fact exists the status line prints **`Nothing yet`**, or **`Not known yet`** where the fact is unknowable on this spread; no placeholder, no dash.

| Stop (key) | (1) status line at quiet on `…d5` | (2) sr-only line | (3) leader that prints at quiet |
|---|---|---|---|
| Client approvals (`approvals`) | `3 awaiting the client · 2 overdue` (mockup: `2 awaiting the client · 1 overdue 6d`; the day-count prints when one item is overdue — `1 overdue 6d` — and drops when the count is plural) | `3 awaiting the client · not yet on the paper · press Client approvals on the index to open` (amended 2026-08-29: the rule governs — the first segment verbatim) | the head's leader as it prints today: the ranked need's act when the need names approvals (`Send a reminder`, F34), else `New approval` (`project-approval-document.tsx:507`) |
| Money (`money`) | `$17,500 out · $28,080 not drawn` (mockup: `$17,500 out · $12,300 not drawn`; the same two figures the rail's value line prints — `4 POs` is the ledger's count, not the status line) | `$17,500 out · not yet on the paper · press Money on the index to open` | `Draw an invoice` (`money-region.tsx:200`) |
| Pieces (`ffe`) | `62 lines · 5 rooms · 1 damaged` (mockup: `36 lines · 4 rooms · 1 damaged`) | `62 lines · not yet on the paper · press Pieces on the index to open` | the FF&E leader as it prints today (`ffe-leader`: the ranked need's act — `File the claim` / `Spec the 4 unspecified`; default `Add a line`, `ffe-section.tsx:1141`) |
| Schedule (`schedule`) | `Install Sep 19 · 3 weeks out` (mockup: `Install Tue Sep 15 · 3 weeks out`; the weekday is dropped — the paper prints one date form, the rail's `INSTALL SEP 19 · 3 WEEKS`; phases never print here) | `Install Sep 19 · not yet on the paper · press Schedule on the index to open` | `Adjust dates` (`schedule-rule-region.tsx:157`) |
| Closing the book (`care`) | `0 of 6 closed out` (mockup identical) | `0 of 6 closed out · not yet on the paper · press Closing the book on the index to open` | `Close the book` (`care-band.tsx:365`) |
| The record (`record`) | `4 complete` (mockup: `12 complete`); on a paper with no record, `Nothing yet` and **no leader, not a press target** (W2 ruling) | `4 complete · not yet on the paper · press The record on the index to open` (`Nothing yet` when empty) | `Open the record` (`previous-work.tsx:79`) |

The sr-only line's form is fixed: **`<the status line's first segment> · not yet on the paper · press <Name> on the index to open`** — the first segment, never the whole status line (the status line is already read), and the stop's printed name verbatim. When the status line is `Nothing yet` the sr-only line is `Nothing yet` alone.

**`…d6` and every pre-work spread: these six never print.** Pre-work papers have their own regions (W5-L1; `paperRegionsForSection` returns the pre-work keys), and the six stop bodies do not mount there — a quiet Pieces or Money head on a brief would be a fiction. The spec asserts zero of the six `data-index-region` keys on `…d6`.

## W5-R2 · the pre-work regions — four rulings on W5-L1 · DESIGN LEAD · 2026-08-29

**Cited.** The mockup carries **no pre-work frame** (`mock/final/index.html`: 0 hits for a brief/discovery/direction/proposal region; its three frames are the project paper). The pre-work specimen is the proposal's own — §4:169 (`The proposal` `SENT AUG 19 · UNOPENED 6D` · `Scope & engagement` `CORE · STAGE 03` · `Design vision` / `NOTHING YET` · `The investment` `$184,500 · 20% MARGIN`), §5:306–308 (`Core · stage 03` / `Not written yet` / `$184,500 · 20% margin`) — as ratified in OD-2 and DL-02, whose own sentence governs: *"the shape of every string is the contract, the digits are the seed's."* W5-L1 (`document-lens/w5-l1` @ `78eb0ab54`) is measured against that.

**1. `scope` and `vision` may not stand bodyless — re-parent now (W5-L2).** A stop that prints `Not written yet` over a vision the designer has written is a placeholder standing in for a fact, which OD-1's rule forbids (a fact prints, or nothing does — never a stand-in), and a `scope` stop with a body that lives under `investment` sends the ladder to the wrong place. W5-L2 re-parents the blocks out of `proposal-blocks-readonly.tsx` by region: **`vision`** ← the `description` block; **`scope`** ← the per-room budgets and the terms; **`investment`** ← the totals ledger, with the **Offer at its foot**. DOM order on the proposal spread, which the finalize contract keeps: `proposal` → `scope` (room budgets, terms) → `vision` (description) → `investment` (totals) → **Offer** — the Offer stays below every block because `investment` is the last block-bearing region, so the contract's "below the blocks" holds without a rule of its own. Until W5-L2 lands, `scope`/`vision` print name over `Not written yet` and are **not press targets** (a stop with no mounted root — the SP-05 rule), so nothing lies in the interim.

**2. The two specimen facts with no column — ratified as printed.** `The investment` prints **`$184,500`** alone (the margin percentage is the studio's internal figure and has no column on this paper; a fact with no source never prints — OD-1); `Scope & engagement` prints **`4 rooms in scope`** (ladder value `4 ROOMS IN SCOPE`, 16 chars ≤ 30) in place of `CORE · STAGE 03`, which named a tier and a stage this paper does not carry. Both are shape-preserving: one mono value line per stop, digits from the seed. The specimen's `20% MARGIN` and `CORE · STAGE 03` are retired from the print contract (the §5 rows above are superseded by this ruling).

**3. Line 1 on pre-work spreads prints no ordinal — `<CLIENT> · DISCOVERY`.** `N OF 6` is the **project's phase count** (`project_phases`, the letterhead's `4 OF 6`); a pre-work paper has no phase, the section arc's seven entries are sections and not stages, and `2 OF 7` is a number no ruling states. The band's identity on brief/discovery/direction/proposal is the client and the spread name (OD-1: `THE BYRNES · PROPOSAL`); the rail head prints the stage phrase without an ordinal on the same spreads, so the two agree. The mockup's `2 OF 6` does not exist — no pre-work frame — and is not adopted.

**4. The double head — remove the inline `<h2>`.** `BriefSection` and `DiscoverySection` drop their own 16px `<h2>` ("Brief", "Discovery"); the 24px `RegionHead` is the one head, as direction and proposal already have it. From the inline head, a **version or saved stamp** (`v3 · saved Aug 12`, when the component prints one) moves into the head's eyebrow (11px mono, `--text-muted`, above the name — the same slot direction/proposal used); a sub-label that restates the name is dropped; a sub-label that names a distinct fact (a date, an author) moves into the head's status line only if the ladder segment's own count line is empty — the head's status line stays the segment's count line (W5 rule), never two lines.

## W5-R3 · the loading register prints inside the head's count line — D-B39 countersigned (c) · DESIGN LEAD · 2026-08-30

**Cited.** The mockup carries **no loading state** (FINAL.md names one ambient move only — `doc-breath` on the active StrataMark in the rail, 3s, `globals.css:271-282` — and no skeleton, shimmer or pending form anywhere on the paper); the proposal's M4 keeps the ambient budget at one. The shipped register is `section-loading-line.tsx`: a `role="status" aria-live="polite"` paragraph carrying an `animate-pulse` pearl bar (`h-[0.85em] w-24 max-w-[45%] rounded-[2px] bg-[var(--color-pearl)]`, `motion-reduce:animate-none`) and an sr-only label — a **state**, not an ambient move: it starts with the fetch and ends with it. D-B39 measured FF&E's `Checking readiness` row (17.25px + `mb-2`) unmounting under the head on a cold load of `…d5` — a 24px collapse above the reader, H5's forbidden shift.

**Ruling — (c), with the form.** The loading register keeps its shipped material and loses its own line box: **`SectionLoadingLine` gains an `inline` variant** — the same pearl bar at the count line's own size (`inline-block h-[0.85em] w-[3ch] align-middle ml-[0.5ch]`, same `animate-pulse`, same `motion-reduce:animate-none`, same `rounded-[2px]`), rendered as the **last inline child of the head's count line**, after its text, with `role="status"` and the sr-only label unchanged (`Checking readiness`). The count line's text does not change while it loads and does not change when it resolves; the bar mounts and unmounts inside a line box that exists in both states, so no box moves. Not a dot (a new glyph the paper does not have), not a second sentence, not a shimmer over the text. It **prints at quiet and at full alike** — the head is the same element at both densities and the count line is the head's (W4-R1). Under reduce the bar stands still and disappears on resolve, which is its printed reduced form.

**Where the inline form applies — every site that prints BESIDE existing content under a head** (a supplementary row whose unmount would move what is already read): `ffe-section.tsx:1377` `Checking readiness` (D-B39's site) and `:1426` `Reading the schedule`; `approvals/project-approval-document.tsx:845` `Reading approvals`; `commercial/authorizations-ledger.tsx:187` `Loading authorizations`; `schedule/schedule-spine.tsx:872` `resolving the schedule`; `account-band.tsx:218` `opening the ledger`. Each attaches to its own region head's count line (or, for a sub-block with no head, to the nearest printed line above it — the ledger's title line). **The block form stays where the line stands in for a body that does not exist yet** and nothing below it has been read: `brief-section.tsx:39`, `brief-recap.tsx:32`, `discovery/discovery-recap.tsx:80`, `work-block.tsx:155`, `commercial/derived-budget-grid.tsx:129`, `accounts/accounts-book.tsx:157`, `schedule-thread-panel.tsx:222`, `section-stage-line-mount.tsx:90` — there the body replacing it is the region's reserve arriving (D-B16's permitted change), not a shift above the reader; W5-L2's re-parenting (W5-R2 §1) removes the brief/discovery block sites' double-printing risk by putting them inside their own regions. One loading register exists: the same bar, block or inline, one label form (sentence case, no ellipsis), sr-only always.

**W5-L2 may carry it now**, as one named item in its brief: the `inline` variant on `SectionLoadingLine` and the six supplementary sites above; the jest twin asserts the count line's text and its box height are identical with the bar mounted and unmounted, and `lens-density.spec.ts:163` stays green on a cold load of `…d5`.

## W5-R4 · the Margin sheet's capture row — omitted for I152 (c); F2 and F3 confirmed · DESIGN LEAD · 2026-08-30

**Cited.** The mockup's `#sheet-margin-390` head carries a lead act `CAPTURE A NOTE`, a prose line (*"The margin holds what is beside the paper and not on it — a note, a photograph from receiving, a figure you are not ready to write down. It is yours; the household never sees it."*), the heading `IN THE MARGIN 7`, and a `.margin-capture` row of three quiet acts **`NOTE · PHOTO · VOICE`** above the seven rows. That triplet is the **Field Companion's capture register** (Patina Field, "The Visit": note, photo, voice into the margin) drawn into the web sheet so a designer reading on her phone could file into the margin without changing apps. The shipped designer portal has **no margin-note composer at any width**: nothing in `apps/designer-portal` or `packages/supabase` inserts into `margin_notes` (the `margin_items` view's note branch is fed by the Field app), photo and voice capture exist only in Patina Field, and the portal's only "Leave a note" (`mobile-bar.tsx:507`, `command-bar.tsx:568`, `feedback-sheet.tsx`) is the **R7.2 feedback sheet — a note to Patina, not to the margin**. A `CAPTURE A NOTE` door onto it would be a mislabelled door: the reader would expect a margin item and send product feedback.

**Ruling — (c).** The capture row is **omitted for I152**. (a) has no target to open; (b) would require a new composer writing `margin_notes` — an organ, not a fix-lane item — and shipping `NOTE` alone next to a missing `PHOTO · VOICE` would print a promise the web cannot keep. The Margin sheet ships as W5-R1 rules it: `Margin · N · M overdue`, `THE WHOLE JOB · N` / `BESIDE <stop> · N`, the rows, `CLOSE`. Deviation row (ARCHITECT to write, next id): *"mockup's `CAPTURE A NOTE` + `NOTE · PHOTO · VOICE` omitted; no capture path exists on the web; the Field app is the capture path"*. **What the reader loses:** nothing she has today — the web margin has never been writable at any width; a designer on her phone still files a note, a receiving photograph or a voice memo through Patina Field, and it appears in this sheet as it appears in the desktop rail. **Owed follow-up** (post-I152, priced by the ARCHITECT): a text-only margin-note composer for the web — `CAPTURE A NOTE` as the sheet's lead act opening a `DocSheet` note form that writes `margin_notes` (anchor = the current stop, `THE WHOLE JOB` by default) — with `PHOTO · VOICE` staying the Field app's until the web has a capture path worth printing; the prose line prints with it, not before it.

**F2 — confirmed.** On brief/discovery/direction/proposal spreads the rail head prints **only the stage name** (one line, 11px mono); `doc-spine.tsx`'s second-line fallback (`Awaiting signature` / `In discovery` / `Respond by Aug 12`) is retired on pre-work spreads so the band's `<CLIENT> · DISCOVERY` (W5-R2 §3) and the rail agree; the project paper keeps its two lines and the ordinal.

**F3 — confirmed.** `Scope & engagement`'s ladder value is **`4 ROOMS IN SCOPE`** (16 chars) and its head status line **`4 rooms in scope`**, as W5-R2 §2 rules; `The investment` **`$184,500`**; `Design vision` name over `NOTHING YET` until W5-R2 §1's re-parent lands, then its own count line or `Not written yet` when the description is empty.

## W5-R4 (amended) · `CAPTURE A NOTE` ships text-only in I152 — (a) · DESIGN LEAD · 2026-08-30

**Premise corrected by the ARCHITECT (D-B44):** the portal does write `margin_notes` — `hooks/use-margin-notes.ts:30-38` `useCreateMarginNote()` (`anchor_kind: 'line' | 'section' | 'letterhead'`), used by the desktop rail's note capture (`margin-rail.tsx:493`, textarea `:674` — R14: one tap, type, save), `discovery-margin.tsx:23` and `call-plan.tsx:67`. So a text composer exists at ≥1180 where the rail prints, and below 1180 the reader has no way to write the note the rail lets her write at her desk. That changes the answer: the sheet's `CAPTURE A NOTE` is not a new organ, it is the rail's own composer re-hosted, and its absence at 390 is a loss this wave introduces (the 390 sheet is now the margin's home there). **W5-R4 (c) is superseded by (a).** The photo/voice judgement stands: `PHOTO · VOICE` have no web path at any width and are not printed — `NOTE` beside an unhonoured pair would be a promise.

**What prints (the W5 fix lane carries it now):**
- **Position and label** — as the mockup: **`CAPTURE A NOTE`** is the sheet's **lead act in the head row**, right of `Margin · N · M overdue`, before `CLOSE` (`.act.is-lead`, the terracotta lead register); **no `NOTE · PHOTO · VOICE` row** below the head and no prose line (the prose printed above a capture row it introduced; without the row it is an orphan). The groups follow as W5-R1 rules.
- **The composer** — a `DocSheet` (kind `note`, `tone="paper"`, `aria-label="Note to the margin"`) that re-hosts the rail's form with the rail's own words: textarea `aria-label="Note body"`, placeholder **`Note to the margin…`** (the rail's `:678`; the `Note on this line…` variant never prints here — the sheet anchors to a stop, not a line), autofocused on open; the optional due-date control the rail has (`aria-label="Note due date (optional)"`, default today — R12/R14: a note due today joins needs-action at 5pm); the anchor line printed above the textarea in the card's own mono register: **`BESIDE <STOP>`** when the reader is standing in a stop (`anchor_kind: 'section'`, the current `data-reading-index` stop, its printed name — `BESIDE PIECES`), else **`ABOUT THE WHOLE JOB`** (`anchor_kind: 'letterhead'`) — the same two anchor lines the desktop cards print, so the note lands where she would read it; acts **`Save`** (`save-margin-note`, primary, disabled while empty or pending) and **`Discard`** (`discard-margin-note`, tertiary), the rail's own keys.
- **After save** — the composer closes, the Margin sheet re-prints with the new row in its group and the head count +1 (`Margin · 8`), and **focus returns to `CAPTURE A NOTE`** (the opener; OD-6's rule); the new row carries the rail's first-touch `NOTE` eyebrow. `Discard` and `Escape` return focus to the same act with nothing written.
- **≥1180 nothing changes** — the rail keeps its inline composer; the sheet prints only below the rail (W5-R1).

**Spec on `…d5` at 390:** head row `Margin · 7 · 2 overdue` · `CAPTURE A NOTE` · `CLOSE`; press → dialog `Note to the margin` with placeholder `Note to the margin…`, anchor line `ABOUT THE WHOLE JOB` at s0 (no reading stop) and `BESIDE PIECES` after landing on Pieces; type, `Save` → sheet head `Margin · 8 · 2 overdue`, the row under its group, focus on `CAPTURE A NOTE`; `afterAll` deletes the note. Zero `PHOTO` / `VOICE` text in the sheet.

## W5-R5 · from the W5 design review (`build/w5-review-design.md`) — four rulings the fix lanes read here · DESIGN LEAD · 2026-08-30

1. **The title wraps at 390 and never clips** (N1). The letterhead title is an `<input>` and prints `Aspen Loft — the long p` on `…d5` at 390; the mockup's `#frame-390 .lh-title` wraps to two lines. The read-only name prints wrapped (the input only in edit mode, or an auto-growing textarea — ARCHITECT's mechanism). Gates for a two-line name at 390: letterhead ≤ 300, first head ≤ 470 (gross — the chips are gone after D-B45); one-line names keep W3-R7's 265 / 435.
2. **W5-R2 §2 amended — `Scope & engagement` prints `CORE · STAGE 03`** (N2). The fact has a source: the section stage line. Ladder value `CORE · STAGE 03` + `· N ROOMS` when rooms exist (`CORE · STAGE 03 · 4 ROOMS`, ≤ 30); head status `Core · stage 03 · 4 rooms`. `4 ROOMS IN SCOPE` (W5-R2 §2, W5-C6/F3) is superseded. The stage-line strip (`SCOPE & ENGAGEMENT · CORE · STAGE 03`, bar, `CORE · 03`) **no longer stands between the band and the first head** on pre-work spreads — it becomes the `scope` region's body; the first element after `[data-lens-band]` on `…d6` is `[data-index-region="proposal"]`.
3. **Rail and sheet group counts agree** (N3). `BESIDE <stop> · N` / `THE WHOLE JOB · N` count every item in the group at every width (the ratified print contract: `BESIDE PIECES · 3`); the desktop rail keeps raised/settled as a fold inside the group (`2 SETTLED ↓`), never a separate section that changes the heading's count.
4. **The proposal body's lead line is dropped** (N4): `SENT 7 DAYS AGO — NUDGE CLIENT USER` restates the head's status and the band's act; the `WITH THE CLIENT` ledger is the body's first row.

Ruled without change: the Offer stays flag-gated (`worktable`, off in prod) — the seed need not carry it; no pulse screenshot is required before ship (jest twin + reduce probe + `lens-density.spec.ts:163` are the gates); 13 labels ≤ 14 is the right reading.

## W5-R6 · the sheet composer's anchor line for I152 — `ABOUT THE WHOLE JOB`, always · DESIGN LEAD · 2026-08-30

`margin_notes.anchor_id` is a `uuid`; a stop key cannot be recorded, so a section note saves `anchor_kind: 'section', anchor_id: null` and files under `THE WHOLE JOB`. The printed anchor line must say where the note will file: **`ABOUT THE WHOLE JOB`** at every offset for I152 — never `BESIDE <STOP>` over a note that then appears in the other group. `BESIDE <STOP>` (W5-R4 amended) returns when D-B44's follow-up gives the table a stop column. Also from the W5 fix sign-off (`build/w5-review-design.md`): **Escape inside the title input must restore the name and stop there** — today it fires the shell's Put-down and leaves the paper (`/doc/…` → `/desk`); the shell's Escape ignores editable targets and dialogs.

_ARCHITECT's note (2026-08-30, not a re-ruling): the saved kind is `anchor_kind: 'letterhead'`, `anchor_id: null` per D-B44(a) — `margin_notes` has no column that can carry a stop, so a `'section'` kind with a null id would claim an anchor the row cannot keep; the print ruled here, `ABOUT THE WHOLE JOB` always, stands unchanged and the W5 fix lane ships both._

## W6-R1 · from the final walk (`build/w6-walk.md`) · DESIGN LEAD · 2026-08-30

1. **The short form's subject is the item's object, per need kind.** `…d7` at 390 printed `CONFLICT · TWO` `RESOLVE` for `Two installs collide — week of Sep 21 · RESOLVE THE SCHEDULE` — `shortSubject` fell to the sentence's first word. For a schedule conflict the object is the week: **`CONFLICT · SEP 21` `RESOLVE`** (`<STATE> · <SUBJECT>`; no day-count). `shortSubject` takes a branch per need kind (invoice → its number, decision → its room, damage → the piece, conflict → the week); the jest twin adds the `…d7` shape. Phase C wiring.
2. **`Fold ↑` prints at quiet beside the leader** — signed deviation. W4-R1's "one leader; every other act hidden" governs the region's acts; the fold control is L-7's own voice and must stay reachable on a quiet region. Regions with no fold (`care`, `record`) print one act.
3. Verdict of the final walk: **SHIP** — every acceptance number met on `975fdf6b7`; one wiring-sized fix (§1); one 403 resource to name.

## Cross-review log

2026-08-29 — DESIGN LEAD reviewed `technical-design.md` (DL-01…DL-12, all countersigned; DL-09 conditional on non-stop keys keeping their default fold; DL-05's 390 act duplication left to the ARCHITECT). Adopted here: OD-1 care/brief/discovery/direction right-flush forms and the proposal investment figure; OD-2 pre-work stop names; OD-8 fifth door on proposals; OD-11 joint form; OD-14 1280 string; OD-6 sheet title.

## Reviewed by ARCHITECT

_2026-08-29. Read in full. Findings carry severity + confidence; none filtered. Countersign states at the end._

| id | sev | conf | Finding |
|---|---|---|---|
| A-01 | **high** | 0.9 | §13 retires the mobile bar's primary-act slot. **Engineering objection.** The centre slot is a studio-wide contract, not a document one: `useMobilePrimaryAction` (`mobile/mobile-shell.tsx:205`) is registered by 11 surfaces — `document-guide.tsx:52`, `red-letter-zone.tsx:67`, `letterhead-instruments.tsx:303`, `proposal-watch.tsx:157/:409`, `proposal-instruments.tsx:286`, `compose/composing-page.tsx:189`, `people/people-room.tsx:102`, `rooms/library/library-room.tsx:115`, `rooms/piece/piece-room.tsx:486` — with priorities `letterhead 0 · guide 5 · lifecycle 10` (`mobile/lifecycle-mobile-action.ts:3-7`). Lifecycle acts (`mark-proposal-signed`, priority 10) are **forward** acts, not standing exceptions; the band's line 2 carries only the worst standing exception, so retiring the slot loses I148's ratified "one true single primary act" on the proposal spread and on every non-document surface. `e2e/document/action-visibility.spec.ts:213-262` asserts the slot at 390 on `/desk` (`capture-lead`), `/doc/<sent proposal>` (`mark-proposal-signed`), `/library` (`capture-piece`), `/people` (`add-person`) via `expectMobileBar` (`:134-148`: `[data-mobile-edge-owner]` count 1, `[data-action-key]` count 1, 44px row); `mobile-bar.test.tsx:236-262` asserts the act renders full-width unclipped. **Ruling (mechanics):** the three slots stay `[context | primary act | More]`. The DL's two facts both print in the **left** zone: overline = household (11px mono, replaces `IN THIS DOCUMENT`), heading = the current stop (14px, from `data-reading-index`, names pre-printed and swapped by `visibility`); `aria-label="Open sections, at ${stop}"`; `MARGIN · 7 · 1 overdue` moves into More as its first row (the margin sheet door already exists there). Adopted into OD-11 below; the DL re-issues the 390 bar string. |
| A-02 | **high** | 0.85 | Seed §"Margin: 7 items — 3 anchored to Pieces lines". `margin_items` is a **view** (`kind, item_id, project_id, proposal_id, anchor_kind, anchor_id, state, title, detail, ts, payload`), not a table — nothing can be inserted into it. `useMarginItems` reads `client_decisions` / `project_parties` (`packages/supabase/src/hooks/use-margin-items.ts:270,316,376`). The seed author must read the view's definition (`\d+ margin_items` in psql) and seed the **source rows** (`client_decisions` with `room_id`/anchor semantics, `project_time_entries`, `invoices`) so that `anchor_kind/anchor_id` resolve to Pieces lines; "3 beside Pieces" is only true if the view derives an FF&E anchor at all — verify before promising the heading. |
| A-03 | **high** | 0.9 | Seed §"Closing the book / the record": `0 OF 6 CLOSED OUT` and `12 COMPLETE` are **derived**, not stored — no `closeout_items` table exists; `care-band.tsx` and `previous-work.tsx` compute them from phases/sections (`project_phases.status`, settled sections in `document_state`). The seed author traces both derivations; the walk's expected strings are written from what the seed yields (make that the rule, not the fallback). |
| A-04 | medium | 0.9 | Seed §"exactly 1 damaged": `damage_claims` requires `receiving_inspection_id` (FK) and `ffe_item_id`. Inserting the `receiving_inspections` row fires trigger C (`00184` `trg_receiving_inspection_side_effects`): stamps `purchase_orders.delivered_date` on every outcome, advances the PO to `delivered` **only on a CLEAN outcome**, marks items received. The console's inspection must carry a non-clean outcome; keep the "delivered" PO a separate one with a clean inspection (trigger B then cascades `delivered` to its lines). |
| A-05 | medium | 0.95 | Seed §statuses: the ratchet (`ffe_ratchet_to_po_stage`, `00184:100-160`) fires only when `purchase_order_id` is set and only moves status **up** to `po_status_to_ffe_stage(po.status)` (`draft/confirmed→ordered`, `in_production→production`, `shipped`, `delivered`). Implementable, with two rules: the **2 unspecified** lines must have `purchase_order_id = NULL` (any link ratchets them to ≥ `ordered`); the status spread is set by choosing PO statuses, not item statuses (an item inserted as `production` on a `draft` PO stays `production`; the ratchet never lowers). `specified`/`quoted`/`approved` lines never carry a PO. |
| A-06 | medium | 0.8 | Print contract, brief/discovery/direction line 1 right slot: `NO DATE YET` in the right-flush mono slot is a **fallback printed in the live-figure register** — the confusion F108 guards against on the ladder. Ruling (register mechanics): on spreads with no dated or money fact the right slot is **absent**, not a fallback string (OD-1 already says "nothing"). `NO DATE YET`/`NOT KNOWN YET` live only under a name row on the ladder. |
| A-07 | medium | 0.8 | §6 D-12: `max(60px, calc(100dvh − … − <last region's box>))` — a region's box is not a CSS value. Ruling: `[data-document-paper] { padding-block-end: calc(100dvh - var(--doc-landing-clear) - 4rem) }`, so the scroll extent always lets the last head land at 72px whatever the last region's height (slight over-reserve; the colophon keeps `mt-14`). Adopted into the seam/token contract; the DL's requirement stands as written. |
| A-08 | medium | 0.85 | §13 depends on `data-reading-index` on `.mobile-bar` and `aria-current` in the Sections sheet, but `MobileActiveDoc` (`mobile-shell.tsx`) carries `sections[].state`, not an index key. Contract: `MobileActiveDoc` gains `readingIndex: DocumentIndexKey | null`, set by `page.tsx` from `activeKey`; the bar and the sheet read it. Added to C-4. |
| A-09 | low | 0.9 | §2 numbers the translateY deviation **D-B1**; `technical-design.md` OD-7 also used D-B1 for the sr-only announcement span. Renumbered: translateY = D-B1 (DL), sr-only announce = **D-B2** (ARCHITECT). |
| A-10 | low | 0.85 | §7 L-6: the head yields the **stage phrase only**; `Vandersteen`/`4 OF 6` turn `--text-muted` at s0. My state machine's rest row said two lines yield — adopted (what prints is the DL's); `technical-design.md` §2 updated. |
| A-11 | medium | 0.8 | Standing sheet row `FILE THE CLAIM`*: bind it to a shipped act only (the receiving/damage door the Pieces line already opens); W3-L1 may not add an act — proposal §11.7 refuses filing. The row's act label is that door's existing label, not a new verb. |
| A-12 | low | 0.7 | §10 1280 walker string `INSTALL SEP` / `15 · 3 WEEKS` splits a date across lines. Wrapping at spaces is the rule; keeping `SEP 15` together with a non-breaking space is the DL's call — noted, not ruled. |
| A-13 | low | 0.9 | Print contract "Doors, every spread, every desktop tier: Plan room · Spec book · Mood boards · Call sheet" — on a **pre-work proposal** document those four are project-keyed and open nothing off a project (`ticket-derivation.ts:177-196`). See OD-8: the door list is per spread. |
| A-14 | info | 0.9 | §9 rail metric: countersigned. `SC4 ≥ 70 %` retired; gate = ≤ 13 labels; ink % and span reported. |
| A-15 | info | 0.9 | §3, §5, §11, §12: countersigned as written (two densities; no hysteresis pair; R-02 does not transfer; AUG 26 / 2 unspecified into the seed). |

**Countersign states.** OD-13 — **countersigned** as proposed (`full|quiet` + `data-passed`; SC11 = `full ≥ 1`). OD-11 — **countersigned with amendment** (A-01: the primary-act slot stays; household + current stop print in the left zone; the DL re-issues the 390 strings). OD-8 — **countersigned** with the per-spread door rule (A-13). OD-14 — **countersigned**: rungs never print at 1280, `36 LINES · 4 ROOMS · 1 DAMAGED`, doors head 34px; floors are **derived per segment** from the value's wrapped line count, not the mockup's six literals. No item escalates to Kody.

## W6-R1 · F1 — the short subject is the need's OBJECT (ORCHESTRATOR, taken 2026-08-30)

The DESIGN LEAD's final walk read `…d7` at 390 printing **`CONFLICT · TWO`  `RESOLVE`**. The
sentence is "Two milestones land on Sep 21"; `shortSubject` took the first token of three or more
characters that was not a qualifier, which is `Two` — a quantity, not a subject. The one half of
the short form the reader cannot reconstruct from the state word beside it is exactly the subject,
so `TWO` costs her the whole line.

**Ruled:** the subject is the need's OBJECT, and each KIND states where its object lives.
`shortSubject(sentence, kind?)` gains a per-kind table (`SUBJECT_BY_KIND`) —
`schedule_conflict` / `schedule_proposal` → the DATE (`SEP 21`); `overdue_invoice` → the code, then
the figure; `po_unacknowledged` / `po_unsent` → the PO number; `damage_claim` → the piece's code;
everything else keeps the generic head-noun scan, which is the right answer for a decision
(`Primary bedroom approval` → `BEDROOM`). A kind whose sentence does not carry its stated source
falls through to the generic scan rather than printing nothing — a missing subject is worse than an
imperfect one.

`LensStandingItem` gains `needKind: NeedKind | null` (null for a ticket exception, which has no
kind) so the composer can consult it. The signature stays `(sentence, kind?)` rather than `(item)`
so the ten existing call sites keep asserting the generic rule, which is still what every unlisted
kind gets.

**Falsifiers** (`lens-band-derivation.test.ts`, "the short subject is the need's OBJECT, chosen by
kind"): the walked `…d7` shape asserts `SEP 21` **and** asserts that the same sentence without the
kind still reads `TWO` — so the case fails the moment the kind stops being consulted; plus one per
seeded kind (proposed date, invoice with and without a code, PO unacknowledged and unsent, damage,
decision) and the fall-through.

