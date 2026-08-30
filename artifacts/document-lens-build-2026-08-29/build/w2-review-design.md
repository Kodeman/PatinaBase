# W2 review — design side (the ladder) · DESIGN LEAD · 2026-08-29

Read: `build/w2-walk.md`, `build/w2-walk/{w2-1440-s0-project, w2-1440-s2-project, w2-1440-spine-clip-s0, w2-1440-spine-clip-s2, w2-1440-room-in-hand-spine-clip, w2-1280-s0-project, w2-1280-spine-clip-s0, w2-390-sections-sheet-clip, w2-1440-s0-prework}.png`. Contract: `build/design/reconciliation.md` ("What prints"). Every finding carries severity + confidence; nothing filtered.

## 1 · The ladder against the print contract

| Stop | Contract (1440 / 1280) | Seen 1440 | Seen 1280 | Verdict |
|---|---|---|---|---|
| Put down | `← PUT DOWN`, word at both tiers | `← PUT DOWN` | `←PUT DOWN` (no space after the arrow) | seen; **differs** at 1280 — the arrow and the word touch (low · 0.9) |
| Head · household | household name, `--text-muted` at s0 | `Client User` (the seed's client) | `Client User` | seen (the seed's name, not a defect) |
| Head · arc | seven `xs` marks, one row at 1440; **two rows 4+3 at 1280** (§10 ruling) | seven marks, **the seventh clipped at the rail's right edge** | two rows **4 + 3** ✓ | 1440 **differs** — the arc overflows 200px and is cut (medium · 0.9); 1280 seen |
| Head · stage | `PROCUREMENT & ORDERS` / `4 OF 6`; phrase yields at s0 (L-6) | `PROCUREMENT & ORDERS` / `3 OF 5`, **printed at s0** | `PROCUREMENT &` / `ORDERS` / `3 OF 5` | strings seen; the s0 yield is not wired (walk row 3) — **must land with W3** (medium · 0.9) |
| Client approvals | `2 AWAITING · 1 OVERDUE 6D` | `NOTHING YET` | `NOTHING YET` | **differs** — see §4 (high · 0.8) |
| Schedule | `INSTALL <date> · 3 WEEKS` | `INSTALL SEP 19 · 3 WEEKS` | same, wrapped | seen |
| Pieces | `62 LINES · 1 DAMAGED <window date>` / `62 LINES · 5 ROOMS · 1 DAMAGED` | `62 LINES · 1 DAMAGED` — **no date** | `62 LINES · 5 ROOMS · 1 DAMAGED` ✓ | 1440 **differs**: the carrier-window date is the one fact the rail carries that the paper's count line does not; the derivation dropped it (medium · 0.85). 1280 exact |
| Money | `$17,500 OUT · $28,080 UNDRAWN` | same (two lines) | same (three lines) | seen |
| Closing the book | `0 OF 6 CLOSED OUT` (seed-defined) | `NOTHING YET` | `NOTHING YET` | acceptable — the seed carries no closeout items; the fallback is the ruled word |
| The record | `N COMPLETE` | `4 COMPLETE` | `4 COMPLETE` | seen |
| Doors | `FILED WITH THIS JOB` · `Plan room` · `Spec book` · `Mood boards` · `Call sheet` | heading + `Plan room` · `Spec book` · `Boards` · **`Call sheet` under the studio drawer at 900px** | same, `Call sheet` cut | **differs** twice: the fourth door is not visible at either desktop tier at s0 (high · 0.9); the word is `Boards`, contract says `Mood boards` — the paper's own door (`Mood boards` leaf) is the source; countersign **`Boards`** only if that is the leaf's shipped name, else print the leaf's name (low · 0.7) |
| Room rungs (1440, Pieces active) | indented, one line each, `--text-muted`, held room in clay-ink | `Living Room` … `Kitchen` at ~50px pitch, **overprinting `FILED WITH THIS JOB`, `Plan room`, `Spec book`** | not printed ✓ | **differs** — the collision the walk documents (blocker · 0.95, already D-B11) |
| Pre-work rail (proposal) | `PROPOSAL` / stage · `NOTHING ON THIS PAPER YET` · doors immediately after | `PROPOSAL` / `AWAITING SIGNATURE` · `NOTHING ON THIS PAPER YET` · **doors at the rail's foot, heading clipped under the drawer** | — | strings seen; placement **differs** (medium · 0.85): the doors must follow the track's content, not sink to the foot |
| 390 Sections sheet | `Put down` top · six stops + values · `aria-current` row · four doors | all seen, `← PUT DOWN · BACK TO THE DESK`, shaded current row | — | seen (`Call sheet` hidden by the dev-tools puck is a harness artefact) |
| 390 bar | `AT <STOP>` changing with scroll | `AT CLIENT APP…` → `AT PIECES` → `AT THE RECORD` | — | seen |

## 2 · The R1 instrument — what "≤ 13 labels" means, restated mechanically

The instrument counts **labels, not values**. Rule for the walker: a *label* is a visible `innerText` line inside `[data-document-spine]` that (a) contains no digit, (b) is not the ruled fallback word (`NOTHING YET` / `NOT KNOWN YET` / `NOTHING ON THIS PAPER YET`), and (c) is not a lone non-alphanumeric glyph (the `←`). Everything else is a value line and is excluded. Under that rule the walker's list gives **14** at 1440/s0: `PUT DOWN` · `Client User` · `PROCUREMENT & ORDERS` · six stop names · `FILED WITH THIS JOB` · four doors — the walker's 15 minus the `←`.

The threshold is restated as a formula so it is spread-independent: **labels ≤ 3 + stops + 1 + doors** (Put down · household · stage phrase, the stop names, the doors heading, the door names). Six stops, four doors → **14**; the proposal spread with five doors → 15; a pre-work spread before Wave 5 → 3 + 0 + 1 + 4 + the empty-track line (counted, it has no digit) = 9. The proposal's "13" folded `←` and `PUT DOWN` into one; this rule makes the count reproducible. **Today: 14 = threshold. PASS.** Anything above the formula is a second copy or a new tenant and fails.

## 3 · Room rungs at 27px (D-B11) — countersigned, with the print stated

Countersigned: 27px rungs (the 2.5.8 floor is 24; 44px was a touch-tier reflex the desktop tier does not need). The print I want at 1440 with a room held: under `Pieces`, five rungs at **27px pitch**, indented one em, 11px mono `--text-muted`, the held room in `--color-clay-ink` with `aria-pressed`; the head gains `IN HAND · LIVING ROOM` and the door `PUT DOWN THE ROOM` (seen ✓). Two rules that D-B11 must also carry: (i) **the Pieces slot reserves no rung space while the rungs are closed** — the ~130px hole under `Pieces` at s0 (`w2-1440-spine-clip-s0.png`) is the extent reserved for absent rungs, and it reads as a gap in the list; extents distribute across the *printed* content; (ii) **rungs open by taking the distributed remainder from the other segments (down to their 36px floors), never by pushing past the track** — the doors block is a sibling, not a spillway. If five rungs at 27 plus six floors exceed the track at 900px, the rungs collapse to `+N` (proposal Dp-16) before anything overprints.

## 4 · `NOTHING YET` on the rail vs `NO APPROVALS AUTHORED` on the paper

Ruling: **the rail's fallback for a region the paper prints as empty is `NOTHING YET`, always** — one word in the rail register for every empty stop; the paper keeps its own sentence (`No approvals authored`, `Nothing filed`, `No boards yet`). These are not two wordings of one fact: the rail prints a *state*, the paper prints a *sentence*, and SP-08 governs figures. `NOT KNOWN YET` is never used for a region that mounts on the spread; it is reserved for a value unknowable on that spread (a pre-work stop).

The real finding underneath (high · 0.8): the seed carries **two overdue decisions** (`2 decisions overdue — oldest due Aug 23` in the needs block) and the approvals segment reads `NOTHING YET`, because the segment derives from `project_approval_document` records while the standing decisions live in the decisions model. The rail's value must derive from **the same source as the region head's count line** (`RegionHead` status) so the two can never disagree; if the approvals region genuinely has no authored approvals, `NOTHING YET` is right and the overdue decisions belong to the band's line 2 (Wave 3) — which is where they will print. Not a Wave-2 fix; a Wave-3 acceptance bullet: *at s0 the band's line 2 names the oldest overdue decision with its act.*

## 5 · Loss, clutter, second copies (the standing assignment)

- **Loss** — `Call sheet` is under the studio drawer at 1440 and 1280 at s0 (`w2-1440-spine-clip-s0.png`, `w2-1280-spine-clip-s0.png`): the rail's content runs past the 840px it has. Cause: head 117px (budget 100) + a track that reserves closed-rung space + doors. A door that cannot be seen is F09 back again.
- **Loss** — the seventh arc mark clipped at 1440 (`w2-1440-spine-clip-s0.png`, right edge).
- **Loss** — the damage date missing from the Pieces value at 1440 (the only carrier of the carrier window in the rail).
- **Clutter (empty kind)** — the ~130px hole under `Pieces` at s0 while rungs are closed.
- **Clutter** — the pre-work rail's doors sunk to the foot with ~450px of empty rail above them.
- **Second copies at s0 (1440)** — `PROCUREMENT & ORDERS · 3 OF 5` prints in the rail head **and** in the ticket's head line; `$17,500 owed you` prints in the ticket money row, the needs block and the rail; `1 damaged` in the ticket, the rail and the seam at s2. All three die with the ticket in **Wave 3**; none is a Wave-2 regression. The margin card `MONEY · SENT INV-2026-114` prints no figure ✓ (the no-second-figure rule holds).
- **No second copy inside the rail itself**: 14 labels, each once.

## Verdict — design side: **ship-after-fixes**

Fixes before the wave merges (design-side, in severity order): (1) the rung overflow into the doors — D-B11 as amended plus rules (i)/(ii) in §3; (2) the rail must fit 840px at 1440×900 and ~740 at 1280×800 at s0 with `Call sheet` visible — no closed-rung reserve, doors immediately after the track's content (pre-work too); (3) the seventh arc mark inside the rail at 1440; (4) the Pieces value carries the damage date at 1440 (`62 LINES · 1 DAMAGED <MMM D>`); (5) `←PUT DOWN` spacing at 1280. Carried to Wave 3 as acceptance bullets, not W2 blockers: the L-6 s0 yield of the stage phrase; the overdue decisions named on line 2; `Boards` vs `Mood boards` per the leaf's shipped name.

**W3 must not regress in the rail:** rail 200px / 136px with every label a word · six stops in paper order with the ruled value strings and the fallback `NOTHING YET` · the reading bracket on the active stop and `aria-current` exactly once · rungs only while Pieces is active or a room is held, 27px, never past the track · `FILED WITH THIS JOB` + four doors visible at s0 at both tiers · `Put down` above the head, `PUT DOWN THE ROOM` only while held · the 390 Sections sheet with all six values and `AT <STOP>` in the bar changing with scroll · label count = 3 + stops + 1 + doors.
