# Direction A — Ink on Paper

## Thesis

The portal already has one good idea about hierarchy — set it in type, on paper, with a rule —
and it never commits to it. Playfair runs at thirty-nine sizes and tops out at 27.9px on a
document; three quarters of the small type is under the reading floor; one pearl hairline ends
a row, a section and a chapter alike; and the three grounds that name three different places
sit inside 1.07:1. A takes the existing grammar literally. On top of the planks every lane
adopts — a reading floor, three muted inks, three rule weights — A adds three paper stocks
1.18:1 apart, a five-step Playfair scale, four one-step-darker paper inks, and one device that
opens every section: the Strata mark, a mono label, a Playfair name, a 1.5px charcoal rule. No
new colour, no imagery, no inversion. About twenty token edits of its own, riding on two sweeps
the planks own and price.

## What stays identical

Every route, component, act, label and piece of information architecture. The desk still opens
on "Good morning, Leah", the same three acts ("+ CAPTURE A LEAD / + OPEN A PROJECT / FIND
ANYTHING ⌘K") with the same sub-labels, the same whisper notes, the same roster under "EVERY
JOB · 16 LIVE · 1 OVERDUE" grouped by the same stages in the same order (the M1 figure crops it
to four of the six groups — Discovery · 1, Proposal · 2, Project · 4, Install · 1 — in the
desk's own order, with `BRIEF · 5` and `DIRECTION · 3` left out and captioned), the same
three-column studio index, the same drawer with the same five doorways and the same three right-hand items.
The document keeps its spine, its paper, its margin, its letterhead, its red-letter zone, its
region heads and their ledgers of acts, its FF&E lines by room. Nothing folds that did not
fold; nothing moves surface; no word changes. A is a stylesheet.

## The risk taken

**The desk stops being white.** The desk route's ground goes from `#FAF7F2` to `#E0D6C4` — a warm
tan 1.38:1 under the document paper. It is the single move that makes putting a document down feel
like putting it down, and it is also the move a team can dislike on sight: for three years the
portal has been one cream. If the desk ground is rejected, the rest of A still stands (the
scale, the rules, the section head), and the two rail stocks alone still open the document's
three columns.

## Token deltas

Contrast is WCAG 2.2, computed by `research/contrast-check.mjs` (math ported from
`lib/document/__tests__/contrast.test.ts:85-102`). "Stock" columns are A's three grounds.

| Token | Today (globals.css) | Proposed | on paper `#FCFAF6` | on rail `#EFE7DA` | on desk `#E0D6C4` |
|---|---|---|---|---|---|
| desk-route ground *(scoped, see Cost)* | `--bg-primary` `#FAF7F2` (:62, :10) | `#E0D6C4` | — | — | — |
| `--doc-paper` | `#FCFAF6` (:51) | `#FCFAF6` unchanged | — | — | — |
| spine wash (`doc-spine.tsx:44`) | `rgba(229,226,221,.28)` → 1.053:1 vs ground | `#EFE7DA` | — | — | — |
| margin wash (`margin-rail.tsx:258`) | `rgba(250,247,242,.55)` → 1.000:1 vs ground | `#EFE7DA` | — | — | — |
| `--bg-surface` *(scoped, see Cost)* | `#FFFFFF` (:63) | `#FCFAF6` (a card is the sheet, not brighter than it) — as a `--doc-surface` declared on the Document tree, **not** `--bg-surface` at `:root` | — | — | — |
| `--text-primary` | `#2C2926` (:66, :15) | `#2C2926` unchanged | 13.87 | 11.78 | 10.04 |
| `--text-body` | `#5C4A3C` (:67, :14) | `#5C4A3C` unchanged | 8.06 | 6.85 | 5.83 |
| `--text-muted` | `#65594E` (:68) | `#4E4339` (SP-02, plank) | 9.22 | 7.83 | 6.67 |
| `--text-subtle` | `#65594E` (:69) | `#5A4E43` (SP-02, plank) | 7.73 | 6.57 | 5.60 |
| `--text-faint` | `#65594E` (:92) | `#65594E` unchanged (SP-02, plank) | 6.51 | 5.53 | 4.72 |
| `--color-clay-ink` | `#7C5E30` (:34) | `#6F5429` | 6.77 | 5.75 | 4.90 |
| `--color-terracotta-ink` | `#9C5340` (:35) | `#8E4A38` | 6.32 | 5.37 | 4.58 |
| `--color-golden-hour-ink` | `#79651E` (:40) | `#6C5A1B` | 6.46 | 5.49 | 4.68 |
| `--color-sage-ink` | `#5F6B57` (:41) | `#55604E` | 6.36 | 5.40 | 4.60 |
| `--border-default` | `var(--color-pearl)` `#E5E2DD` (:83, :11) | `#D8CDBA` — 1.508:1 on paper, 1.281:1 on the rail | — | — | — |
| desk hairline *(new)* | — (pearl everywhere) | `#C9BCA4` — **1.301:1** on the desk stock, against today's pearl-on-off-white **1.209:1** | — | — | — |
| red-letter fill | `rgba(212,160,144,.08)` = 1.056:1 (`red-letter-zone.tsx:87`) | `#F1E1D9` = **1.220:1** under the sheet | terracotta-ink 5.18 | quiet 5.34 | clay 5.55 |
| `--rule-hair` *(new, SP-03)* | — | `1px solid rgba(44,41,38,.10)` | — | — | — |
| `--rule-mid` *(new, SP-03)* | — | `1.5px solid #2C2926` | — | — | — |
| `--rule-double` *(names `.doc-region-rule`, :738-742)* | `2px charcoal + 1px @18%` | unchanged, promoted to a token | — | — | — |
| hover step *(SP-06)* | `--bg-hover` `rgba(196,165,123,.06)` = 1.042:1 | **the next stock A already declares** — the rail stock under a row on paper, over a row on the desk; the paper under a row on the rail | **1.177** | **1.177** | **1.173** |

**Stock separations.** paper→rail **1.177:1** · rail→desk **1.173:1** · paper→desk **1.381:1**.

**What each of those replaces, with the ground named** (12-measurements.md §1-§2; every "from"
figure in this deck now says what it is measured against):

| pair | today | with A |
|---|---|---|
| document paper vs the off-white ground | **1.025:1** | the ground is no longer painted under the paper; the rails are, at **1.177:1** |
| spine wash vs the ground it sits on / vs the paper beside it | **1.053:1** / **1.081:1** | **1.177:1** against the paper |
| margin rail vs the ground, at 1440 (`0.55` alpha) | **1.000:1** | **1.177:1** |
| margin rail at 1180-1439 (`0.98` alpha) | a different composite the audit did not measure | **1.177:1**, one value at both tiers |
| desk route vs document paper | **1.025:1** | **1.381:1** |

**Why the four inks move.** They have to. On a stock at `#E0D6C4` the shipped I151 values land
at **4.166** (clay), **3.916** (terracotta), **3.949** (golden hour) and **3.913** (sage) — under
the floor `contrast.test.ts` enforces. Holding all four at their shipped values instead caps the
deepest stock at about `#EDE5D8`, and `CR(#FCFAF6, #EDE5D8)` = **1.199** — so the whole span
available above the shipped ink floor is 1.20, while three stocks 1.15:1 apart need 1.15² =
**1.3225**. A either gives up the third stock or darkens the inks one step. It darkens the inks —
same hue, same role, and every one of them ends up with more headroom on paper than it has today.
(All eight figures recomputed with the WCAG 2.2 formula; the earlier draft printed 4.43 / 4.09 /
4.10 / 4.08 and a 1.27 span, all of which flattered the status quo.)

## Recipes by surface

**Desk ground & roster.** The ground is `#E0D6C4` — **scoped to the desk route, not to
`--bg-primary`.** `--bg-primary` is what `.document-route-shell` paints under *every* route in
`app/(document)/layout.tsx` (12-measurements.md §1), so repointing it would take `/library`,
`/people` and every ledger sheet tan along with the desk. A scopes it instead (Cost prices the
scoping edit, and prices the unscoped alternative). The roster prints straight on the stock,
still one line per job, still never a card. `EVERY JOB · 16 LIVE · 1 OVERDUE` becomes the section head
recipe below. Stage heads (`PROJECT · 4`) go from mono 10px to mono 11px at `--text-muted`.
The job name goes 16px → 18px Playfair; the need line holds at 14px `--text-muted`; the overdue
clause keeps `--color-terracotta-ink` at its new value. Rows are separated by the planks'
`--rule-hair`, not by a dashed pearl border — dashed goes back to meaning "not yet filled in"
(SP-03, F18). The border token needs **two** values, not one: `#D8CDBA` reads at 1.508:1 on
paper and 1.281:1 on the rail but only **1.092:1** on the desk stock — *worse* than today's
pearl-on-off-white 1.209:1, on the one stock A moved the most content onto. A second value,
`#C9BCA4` at **1.301:1**, is scoped to the desk route.

**Document paper & letterhead.** Paper unchanged at `#FCFAF6`. The title goes 27.9px → **40px**
Playfair, tracking `-0.015em`, and the letterhead closes with `--rule-mid` instead of a pearl
hairline. The client line stays Playfair italic in `--color-clay-ink`. The vitals row moves
from mono 8px labels / 10px values to a single mono 11px step, which is the whole vitals delta.

**Section heads & rules.** This is the signature. Every section opens the same way: the Strata
mark at 40/28/16px × 2px (from 34/24/14 × 1.5px, `section-eyebrow.tsx:19-23`), a mono **11px**
label at `--text-muted`, the Playfair name at **24px** (from 18px, `region-head.tsx:127`), the
status line at **14px** (from 12.5px), and then `--rule-mid` across the measure. A movement
head — Schedule, Pieces, Money — takes `--rule-double` instead. Three ranks, three weights, one
device (F10, F11, F18).

**Spine.** Ground `#EFE7DA`, so the left column reads as a column against the sheet (1.177:1,
from 1.053:1). The running-index names go to 14px; their state lines to mono 11px. The current
row keeps its 2px clay edge. The in-hand box keeps its shape but takes the rail's own hairline
(`#D8CDBA`) rather than a pearl border, so the timer stops being the heaviest object in the
spine (F08).

**Margin.** Same stock as the spine, so the paper is flanked by one material on both sides. The
chip keeps its shape; its eyebrow goes from 8px to mono 11px, its line to 14px (F21).

**Drawer.** Ground `#FCFAF6` — the paper stock, not white — with `--rule-mid` along its top
edge, which is the one place in A where the mid rule runs the full width of the window (SP-07,
F06). Contents unchanged, no badges, no counts.

**Status chips & stamps.** The chip keeps the dot and the word; the word goes from mono 10px to
mono 11px and takes `--text-faint` while the section-head register takes charcoal, which is the
split F10 asks for. Stamps keep the outline and the −1.5° rotation, take an explicit `-ink`
(SP-04), and gain the fill variant from SP-05 for the one state that is the reason the row is
on the page — in the mocks, DECISION DUE.

**FF&E lines.** Name 13.5px → 15px Playfair italic; maker 8.5px → mono 11px; price 13px → 15px
Playfair, no longer the largest thing on the line (F14). Room heads keep Playfair italic and
their mono allocation. Rows separated by `--rule-hair`.

**Red-letter zone.** The fill goes from terracotta at 8% — `rgba(212,160,144,.08)`, 1.056:1
over paper — to a declared stock, `#F1E1D9` (terracotta at 28%), **1.220:1** under the sheet.
The left edge stays 2px terracotta; the eyebrow keeps `--color-terracotta-ink` at A's darker
value, 5.18:1 on the new stock. Every other A ink clears 4.5:1 on it too (F09).

**Hover.** A takes SP-06 as the plank now writes it — a hovered row moves one step along A's own
ladder of stocks rather than taking a new colour. On paper the row takes the rail stock
(**1.177:1**); on the desk stock it takes the rail stock from the other side (**1.173:1**); on the
rail it takes the paper (**1.177:1**). The plank's single v2 hex, `#F3ECE2`, read **1.046:1** on
A's rail and was *lighter* than A's desk stock; a fill deep enough to clear 1.10:1 on the desk
stock would have put A's tightest ink at **4.137:1** on the hovered row. No new value, no new
contrast risk.

**390 mobile.** Nothing about A depends on width: the stocks, the scale and the three rules hold
at one column, and the mobile bar stays the charcoal strip it already is. The 26px greeting at
390 is today's measured size, shared by all four lanes — not an A move. The M5 mock is drawn
with F24 (the 390 overflow) and the roster row's act/need collision **assumed repaired**; both
are layout defects and no direction in this deck fixes them (SP-09).

## Findings addressed

Split, so the compare table can be built from the second column alone: the planks are adopted
identically by A, B and C and close the same findings in all three lanes.

### Closed by the planks (all three lanes)

| F-id | Plank |
|---|---|
| F11, F12, F13, F14, F21, F22 | SP-01 — the 11px mono and 14px body floors |
| F16 | SP-02 — three muted inks that are three colours |
| F18 | SP-03 — three rule weights, one job each; dashed means one thing |
| F02 (contrast half), F03 (the stamp hole) | SP-04 — no pigment spent as text |
| F01 (partly), F02 (partly), F03 (partly) | SP-05 — one state that fills |
| F17, F01 (partly) | SP-06 — hover above clay 6% |
| F06 | SP-07 — the drawer gets a ground |
| F07, F08 | SP-08 — the two rails are painted on a stock |
| F24 | SP-09 — one ground under the page at every width |

### Closed by Direction A, over and above the planks

| F-id | How A addresses it |
|---|---|
| F05 | Three stocks at 1.177 / 1.173 / 1.381:1 replace three grounds inside 1.07:1. This is A's, and no other lane claims it. |
| F09 | The red-letter fill becomes a declared stock, `#F1E1D9`, at **1.220:1** under the sheet, from 1.056:1; its own ink reads 5.18:1 on it. |
| F10 | Section head and state chip split: charcoal 11px mono + a 24px Playfair name + a 1.5px rule, against a quiet 11px mono chip. The planks give the floor; A gives the rank. |
| F11 (beyond the floor) | Five Playfair steps — 40 / 24 / 18 / 15 / 14 — replace thirty-nine arbitrary sizes. The floor is SP-01's; the scale is A's. |
| F13 (beyond the floor) | An 18px job name against a 14px need line — a 4px rank where there was 0.25px. |
| F14 (beyond the floor) | Price and name both at 15px, so the number stops outranking the piece. |
| F06, F07, F08 (beyond the plank) | A names *which* stock each surface takes, so the drawer, the rails and the sheet are three values rather than three intentions. |

### Not addressed by A

F15 (no interiors surface shows what is being bought), F19 (People renders cards), F20
(selection reads three ways), F25 (the one texture is 1% alpha). A brings no imagery, no
texture, and does not touch People. F02's shape half stays open — see Refuses.

## Canon check

**D4 lint selectors** (`eslint.config.mjs:67-100`) — none tripped. A adds no `shadow-*` class
literal, no `shadow-*` template literal, no `box-shadow`/`drop-shadow(` string literal, no
`box-shadow` in a template, and no `boxShadow` inline-style property. Every A move is a token
value, a font-size, a border-width or a border-colour. `mock/direction-a.css` and all four A
fragments grep clean for shadows.

**D1** — one document at a time is untouched: A moves no surface, opens no panel, adds no tab.

**Typography-first** — A is nothing but type, colour and rule weight. It adds no card, no tile,
no nesting; the section device is the Strata mark, which is what `apps/designer-portal/CLAUDE.md`
names for the role.

**Never a card** — the roster stays `<li>` lines (`desk-roster.tsx:29-34`); A changes their
separator weight and two font sizes and nothing else. `--bg-surface` moving off pure white makes
cards *less* card-like, not more.

**No tiles, no counts, no metrics** — the studio index keeps labels and doorways
(`desk-contents.tsx`); A restyles its sub-lines from mono to Inter and adds nothing.

**I151 / contrast.test.ts** — A moves four `-ink` tokens *downward* in luminance. The test
asserts ≥4.5:1 on the light grounds; every proposed value clears it with more headroom than the
shipped one, and the hue-gap assertion at `contrast.test.ts:161-186` still holds (A's inks sit
24.30° apart against the base pigments' 20.40°). The edit is three stocks added plus two
hardcoded grounds updated — priced in Cost, not "one array".

## Cost

**A's own files.** `globals.css` (about twenty token edits) ·
`components/document/{section-eyebrow,region/region-head,desk-roster,doc-letterhead,ffe-section,
margin-rail,doc-spine,studio-drawer,red-letter-zone,status-chip,stamp}.tsx` ·
`lib/document/__tests__/contrast.test.ts`.

**The scoping edit.** The desk ground must not ride on `--bg-primary`. A adds a
`--desk-ground` token painted by the desk route's own wrapper (`app/(document)/desk/page.tsx`
or a `data-desk-route` attribute on the shell in `app/(document)/layout.tsx`) — one component
edit, and the honest alternative is priced below.

**The second scoping edit — `--bg-surface`.** A moves `--bg-surface` off pure white, and that
token is not a Document token: `grep -ro "var(--bg-surface)" src | wc -l` = **83 usages across 51
files**, and most of them are nowhere near a document — `components/portal/scope-builder` (9
files), `components/portal/procurement` (5), `components/ui/controls` (3), plus `proposals`,
`ffe`, `products/{promotion,nomination}`, `toast-provider.tsx`, `faceted-filter-popover.tsx`,
`bulk-action-bar.tsx`, `mood-board/board-room-shell.tsx` and
`app/(document)/library/judgments/page.tsx`. **A scopes it the same way it scopes the ground:** a
`--doc-surface` declared on the Document tree and consumed inside `components/document`, so the
83 sites outside it keep the white they were drawn against. That is a second one-component edit,
plus the `components/document` call sites that read `--bg-surface` today. Repointing
`--bg-surface` at `:root` instead repaints every white surface in the portal shell — **51 files,
none of them mocked in this deck** — and it is not what A asks for.

**The two sweeps A rides on, counted.** Neither is priced by the eleven components above:

| sweep | literals | files | rides on |
|---|---|---|---|
| `text-[<n>px]` → the five type steps | **1,749** | **252** | SP-01 (plank, Size L) |
| `border-[var(--color-pearl)]` → the three rule weights | **502** | **172** | SP-03 (plank) |

**Rough size.** A's own token and component work is **2-3 days**. The type sweep is **4-6 days**
and belongs to SP-01, which every direction rides on; the pearl sweep is **2-3 days** and belongs
to SP-03. The package is not a three-day change, and the earlier draft's "2-3 days" covered only
the first row of that table.

**`contrast.test.ts`, precisely.** Not "one array". `LIGHT_GROUNDS` (`contrast.test.ts:32-38`) is
**five hardcoded entries**, not the tokens plus two: `'--doc-paper': '#FCFAF6'`,
`'--color-off-white': '#FAF7F2'`, `white: '#FFFFFF'`, `'red-letter band over paper': '#F9F3EE'`
(derived from `rgba(212,160,144,0.08)`) and `'note band over paper': '#F8F0EA'`, the last of
which A does not touch. A changes the red-letter fill to `#F1E1D9`, so that entry goes stale and
must be re-derived. The `white` entry **stays valid and stays load-bearing**:
`grep -ro "bg-white" src/components/document | wc -l` = **108**, so pure white is still painted
108 times inside the Document tree, and once `--bg-surface` is scoped (above) it is the ratio
that protects those 108 sites. (An earlier draft said moving
`--bg-surface` made it "a ground nothing paints". That was wrong, and it was wrong in A's own
favour.) Adding A's three stocks is the rest of the edit. A's inks clear all of them — 20 pairs,
zero failures, lowest 4.577 — so this is bookkeeping, not a break.

**If the team refuses the scoping edit** and repoints `--bg-primary` directly: `/library`,
`/people` and every ledger sheet take the tan ground too. That is not free — `/people` alone
renders 78 pearl border-sides and 20 white card backgrounds tuned for a cream ground
(12-measurements.md §3) — and it is not mocked in this deck. Price it as **+2-3 days and three
more rooms to draw** before ruling.

**Reversibility.** High. Every value is a token; reverting is one commit against `:root`. The two
sweeps do not revert by token, but they replace literals with tokens, which is worth keeping
whichever direction wins.

## Refuses

A does not add colour beyond the four inks it darkens; does not tint any surface by state or
movement; does not add imagery or texture; does not invert any ground; does not add a second
mark shape for state (F02 stays half-closed — the dot keeps carrying five states, and A only
makes the ink under it legible); does not touch People, Library or the ledger layouts beyond
their type floors; and does not ask for the elevation amendment.

**That third refusal is true only because both of A's app-wide tokens are scoped** — the tan
ground to the desk route, and `--bg-surface` to the Document tree as a `--doc-surface`. Unscoped,
either one leaves the Document tree entirely: the ground takes three rooms with it, and
`--bg-surface` takes **83 usages across 51 files**, most of them portal shell rather than
document. Both scopings are priced in Cost, and so is refusing them.

## Mock index

All four lanes — today, A, B and C — are drawn from **the same markup**; only the lane class and
the caption differ. `today-*` fragments carry no planks, so they are the control.

- `today-m1-desk-1440.html` — the desk at 1440 as it ships: one stock, one hairline weight, one
  type register. The control for A, B and C's M1.
- `a-m1-desk-1440.html` — the desk at 1440. The tan stock under the page, the planks' 11px mono
  and 14px body floors, the section head over its 1.5px rule at "EVERY JOB" and "THE STUDIO",
  18px job names. **Four of the desk's six stage groups, in the desk's real order** (Discovery ·
  1, Proposal · 2, Project · 4, Install · 1); `BRIEF · 5` and `DIRECTION · 3` are cropped, and
  the figcaption says so. Counts and labels are `w1440-desk.png`'s own.
- `a-m2-doc-rich-1440.html` — spine, paper and margin at 1440 with the drawer. Letterhead at
  40px through the red-letter stock, the Client-approvals seam, the Schedule head and its phase
  ladder, then `PROJECT · FF&E` over the double rule and three FF&E lines by room. The filled act
  is `SPEC THE 3 UNSPECIFIED →`, which is the one the live surface fills
  (`w1440-doc-project-rich.png`); the Schedule head carries no filled act, as it does not today.
  The Schedule block renders the specimen's phase-4-of-6 state; today's capture shows the
  composer, because the local project has no phases.
- `a-m4-strip-360.html` — one column, six specimens: roster row, FF&E line, status chip in two
  states (the second wearing SP-05's fill), section head, margin chip, drawer segment. Pairs
  against `today-m4-strip-360.html`.
- `a-m5-desk-390.html` — the mobile desk with the mobile bar, drawn with F24 and the roster row's
  act/need collision assumed repaired. No direction in this deck fixes either.

---

## Critique dispositions (v2)

Every defect in `source/critique.md` that touches Direction A, the planks or all three lanes.
`fix` = changed in v2 · `accept` = kept, with the note the critic asked for · `drop` = declined,
with the reason.

| D | Disposition | One line |
|---|---|---|
| D01 | **fix** | The desk ground is scoped to the desk route, not `--bg-primary`; the scoping edit and the unscoped alternative (+2-3 days, three unmocked rooms) are both priced in Cost. |
| D02 | **fix** | `--text-muted` and `--text-subtle` recomputed: 9.22 / 7.83 / 6.67 and 7.73 / 6.57 / 5.60; they now agree with B's and C's tables and with SP-02. |
| D03 | **fix** | The shipped inks on `#E0D6C4` are 4.166 / 3.916 / 3.949 / 3.913, not 4.43 / 4.09 / 4.10 / 4.08; the argument is unchanged and now understates nothing. |
| D04 | **fix** | The span above the shipped ink floor is `CR(#FCFAF6, #EDE5D8)` = 1.199, not 1.27, against the 1.3225 that three 1.15:1 steps need. |
| D05 | **fix** | Every "from" figure now names its ground, in a table: spine 1.053:1 vs the ground and 1.081:1 vs the paper; the margin rail at both the 0.55 and 0.98 tiers. |
| D06 | **fix** | Cost now carries both sweeps with counts (1,749 literals / 252 files; 502 / 172) and re-times the package: A's own work 2-3 days, SP-01 4-6, SP-03 2-3. |
| D07 | **fix** | The "only size that changes with the viewport" sentence is gone; 26px at 390 is today's shared baseline, and the doc says so. |
| D08 | **fix** | A second hairline, `#C9BCA4` at 1.301:1, is scoped to the desk stock; `#D8CDBA`'s 1.092:1 there is stated rather than hidden. |
| D09 | **fix** | Cost names both hardcoded entries — `'red-letter band over paper': '#F9F3EE'` and `white: '#FFFFFF'` — and what each becomes. |
| D25 | **fix** | SP-01 is re-sized L with the 1,749/252 counts and called its own lane of work, sequenced before any direction. |
| D26 | **fix** | The denominator is 1,029 by `grep -ro "font-mono" src/components/document | wc -l` (the critic reproduced 1,038 by the same shape of grep); either way the share is 63%, not 75%, and the plank says so. |
| D27 | **fix** | SP-07 and SP-08 are re-sized M with the component literals named, and the rail's 1180-1439 `0.98` value is in the plank and in A's table. |
| D28 | **fix** | SP-05 now carries the `KIT.md:266` departure and the `StatusChip` API change; the fill is described landing on `Stamp`, which is what any figure can show. |
| D29 | **fix** | SP-01/02/03/05/06 are hoisted into a `.lane-a, .lane-b, .lane-c` PLANKS block in `direction-a.css`; B and C now render the floors, the muted inks and the rule weights, and `today-*` is the only unplanked lane. |
| D30 | **fix** | The four groups are in the desk's real order (Discovery, Proposal, Project, Install) with `BRIEF · 5` and `DIRECTION · 3` captioned as cropped; the "same order" claim is now true. |
| D31 | **fix** | Every M5 figcaption reads "drawn with F24 (the 390 overflow) assumed repaired — a defect, not a direction", and SP-09 says the same about the row collision. |
| D32 | **fix** | `SPEC THE 3 UNSPECIFIED →` is restored as the filled act and the invented Schedule button is gone, in all three lanes (one shared edit). |
| D33 | **fix** | The Schedule-specimen caveat is in all three mock indexes and in all three M2 figcaptions, not only A's. |
| D34 | **fix** | `today-m1-desk-1440.html` added, so the 1440 desk has a control drawn from the same markup. A today M2 is not added — the M2 crop's control is section 03's own evidence shot of the same region. |
| D35 | **accept** | BLOCK 1 stays in `direction-a.css`; the header now labels the three blocks (shapes / planks / lane) and says B and C depend on it. Splitting the file would change the deck's injection contract for one line of tidiness. |
| D39 | **fix** | Every findings table is split into "closed by the planks" and "closed by this direction"; the compare table should be built from the second half only. |

---

## Critique dispositions (v3)

The v2 re-read's new defects, D40-D49, as they touch Direction A and the planks. Same key:
`fix` = changed in v3 · `accept` = kept, with the note the critic asked for · `drop` = declined,
with the reason.

| D | Disposition | One line |
|---|---|---|
| D42 (plank half) | **fix** | SP-03 now carries a dark twin for each of its three weights — `--rule-hair-dark` / `--rule-mid-dark` / `--rule-strong-dark` — measured on C's three charcoals; the twins are the plank's, and C prices spending them. A spends none of them: A inverts no ground. |
| D43 | **fix** | SP-06 stops being one hex with a 1.10 promise it does not keep. It becomes a rule — a hovered row takes the next stock the lane already declares — and the plank prints what each lane gets, floor **1.097**. A's values are **1.177 / 1.173 / 1.177**, and A's table carries the row. |
| D44 | **fix** | `--bg-surface` is scoped exactly as the ground is, as a `--doc-surface` on the Document tree. The unscoped count is printed — **83 usages across 51 files**, most of them outside the Document tree — and priced as the alternative. A's Refuses now says which two tokens are scoped and what each costs unscoped, so the sentence is true. |
| D45 | **fix** | "a ground nothing paints" is gone. `white: '#FFFFFF'` stays valid and load-bearing: **108 `bg-white` literals** in `components/document` still paint it, and after the `--doc-surface` scoping it is the ratio that protects them. `LIGHT_GROUNDS` is named as five hardcoded entries, including the `'note band over paper': '#F8F0EA'` A does not touch. |
| the critic's two self-corrections | **carried** | The type sweep is **1,749** literals across 252 files (not 1,745) and SP-01's mono denominator is **1,029** (not 1,038); both figures are the ones this document and the deck now print. |
