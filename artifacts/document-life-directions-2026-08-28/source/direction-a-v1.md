# Direction A — Ink on Paper

## Thesis

The portal already has one good idea about hierarchy — set it in type, on paper, with a rule —
and it never commits to it. Playfair runs at thirty-nine sizes and tops out at 27.9px on a
document; three quarters of the small type is under the reading floor; one pearl hairline ends
a row, a section and a chapter alike; and the three grounds that name three different places
sit inside 1.07:1. A takes the existing grammar literally. Three paper stocks 1.18:1 apart, a
five-step type scale, three rule weights, three muted inks, and one device that opens every
section: the Strata mark, a mono label, a Playfair name, a 1.5px charcoal rule. No new colour,
no imagery, no inversion. About twenty token edits and a class sweep.

## What stays identical

Every route, component, act, label and piece of information architecture. The desk still opens
on "Good morning, Leah", the same three acts ("+ CAPTURE A LEAD / + OPEN A PROJECT / FIND
ANYTHING ⌘K") with the same sub-labels, the same whisper notes, the same roster under "EVERY
JOB · 16 LIVE · 1 OVERDUE" grouped by the same stages in the same order, the same three-column
studio index, the same drawer with the same five doorways and the same three right-hand items.
The document keeps its spine, its paper, its margin, its letterhead, its red-letter zone, its
region heads and their ledgers of acts, its FF&E lines by room. Nothing folds that did not
fold; nothing moves surface; no word changes. A is a stylesheet.

## The risk taken

**The desk stops being white.** `--bg-primary` goes from `#FAF7F2` to `#E0D6C4` — a warm tan
1.38:1 under the document paper. It is the single move that makes putting a document down feel
like putting it down, and it is also the move a team can dislike on sight: for three years the
portal has been one cream. If the desk ground is rejected, the rest of A still stands (the
scale, the rules, the section head), and the two rail stocks alone still open the document's
three columns.

## Token deltas

Contrast is WCAG 2.2, computed by `research/contrast-check.mjs` (math ported from
`lib/document/__tests__/contrast.test.ts:85-102`). "Stock" columns are A's three grounds.

| Token | Today (globals.css) | Proposed | on paper `#FCFAF6` | on rail `#EFE7DA` | on desk `#E0D6C4` |
|---|---|---|---|---|---|
| `--bg-primary` | `var(--color-off-white)` `#FAF7F2` (:62, :10) | `#E0D6C4` | — | — | — |
| `--doc-paper` | `#FCFAF6` (:51) | `#FCFAF6` unchanged | — | — | — |
| spine wash (`doc-spine.tsx:44`) | `rgba(229,226,221,.28)` → 1.053:1 vs ground | `#EFE7DA` | — | — | — |
| margin wash (`margin-rail.tsx:258`) | `rgba(250,247,242,.55)` → 1.000:1 vs ground | `#EFE7DA` | — | — | — |
| `--bg-surface` | `#FFFFFF` (:63) | `#FCFAF6` (a card is the sheet, not brighter than it) | — | — | — |
| `--text-primary` | `#2C2926` (:66, :15) | `#2C2926` unchanged | 13.87 | 11.78 | 10.04 |
| `--text-body` | `#5C4A3C` (:67, :14) | `#5C4A3C` unchanged | 8.06 | 6.85 | 5.83 |
| `--text-muted` | `#65594E` (:68) | `#4E4339` (SP-02) | 10.47 | 8.89 | 7.58 |
| `--text-subtle` | `#65594E` (:69) | `#5A4E43` (SP-02) | 8.33 | 7.08 | 6.03 |
| `--text-faint` | `#65594E` (:92) | `#65594E` unchanged (SP-02) | 6.51 | 5.53 | 4.72 |
| `--color-clay-ink` | `#7C5E30` (:34) | `#6F5429` | 6.77 | 5.75 | 4.90 |
| `--color-terracotta-ink` | `#9C5340` (:35) | `#8E4A38` | 6.32 | 5.37 | 4.58 |
| `--color-golden-hour-ink` | `#79651E` (:40) | `#6C5A1B` | 6.46 | 5.49 | 4.68 |
| `--color-sage-ink` | `#5F6B57` (:41) | `#55604E` | 6.36 | 5.40 | 4.60 |
| `--border-default` | `var(--color-pearl)` `#E5E2DD` (:83, :11) | `#D8CDBA` (a hairline that reads on the deeper stocks) | — | — | — |
| red-letter fill | `rgba(212,160,144,.08)` = 1.056:1 (`red-letter-zone.tsx:87`) | `#F1E1D9` = **1.220:1** under the sheet | terracotta-ink 5.18 | quiet 5.34 | clay 5.55 |
| `--rule-hair` *(new, SP-03)* | — | `1px solid rgba(44,41,38,.10)` | — | — | — |
| `--rule-mid` *(new, SP-03)* | — | `1.5px solid #2C2926` | — | — | — |
| `--rule-double` *(names `.doc-region-rule`, :738-742)* | `2px charcoal + 1px @18%` | unchanged, promoted to a token | — | — | — |

**Stock separations.** paper→rail **1.177:1** · rail→desk **1.173:1** · paper→desk **1.381:1**.
Today the same three pairs measure 1.025 / 1.000 / 1.025 (research/12-measurements.md §1, §2;
F05, F07, F08).

**Why the four inks move.** They have to. On a stock at `#E0D6C4` the shipped I151 values land
at 4.43 (clay), 4.09 (terracotta), 4.10 (golden hour) and 4.08 (sage) — under the floor
`contrast.test.ts` enforces. Holding all four at their shipped values instead caps the deepest
stock at about `#EDE5D8`, and three stocks 1.15:1 apart cannot fit between that and paper (the
arithmetic: 1.15² needs a 1.32 span, and the span available above the ink floor is 1.27). So A
either gives up the third stock or darkens the inks one step. It darkens the inks — same hue,
same role, and every one of them ends up with more headroom on paper than it has today.

## Recipes by surface

**Desk ground & roster.** The ground is `#E0D6C4`; the roster prints straight on it, still one
line per job, still never a card. `EVERY JOB · 16 LIVE · 1 OVERDUE` becomes the section head
recipe below. Stage heads (`PROJECT · 4`) go from mono 10px to mono 11px at `--text-muted`.
The job name goes 16px → 18px Playfair; the need line holds at 14px `--text-muted`; the overdue
clause keeps `--color-terracotta-ink` at its new value. Rows are separated by `--rule-hair`,
not by a dashed pearl border — dashed goes back to meaning "not yet filled in" (SP-03, F18).

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

**390 mobile.** Nothing about A depends on width. The stocks, the scale and the three rules hold
at one column; the greeting drops to 26px, which is the only size that changes with the
viewport. The mobile bar stays the charcoal strip it already is.

## Findings addressed

| F-id | How A addresses it |
|---|---|
| F05 | Three stocks at 1.177 / 1.173 / 1.381:1 replace three grounds inside 1.07:1. |
| F06 | Drawer takes the paper stock plus a 1.5px charcoal top edge (SP-07). |
| F07 | Margin rail painted on `#EFE7DA` instead of compositing to the ground (SP-08). |
| F08 | Spine takes the same stock: 1.177:1 against the sheet, from 1.053:1 (SP-08). |
| F09 | Red-letter fill raised from 1.056:1 to 1.220:1 under the sheet; its ink at 5.18:1 on it. |
| F10 | Section head and state chip split: charcoal 11px mono + 24px name + rule vs quiet 11px mono. |
| F11 | Five Playfair steps — 40 / 24 / 18 / 15 / 14 — replace thirty-nine arbitrary sizes. |
| F12 | Mono floor at 11px; mono kept for state, time and provenance only (SP-01). |
| F13 | Job name 18px against a 14px need line — a 4px rank where there was 0.25px. |
| F14 | Price and name both at 15px; the maker rises to the mono floor (SP-01, F14). |
| F16 | Three muted inks become three values (SP-02). |
| F17 | Hover raised above clay 6% (SP-06). |
| F18 | Three rule weights, one job each; dashed means one thing (SP-03). |
| F21 | Margin chip eyebrow 8px → 11px, line → 14px (SP-01). |
| F22 | Ledger money takes the 14px body step, the meta string the 11px mono step. |
| F24 | The fourth ground is painted (SP-09). |
| F02, F03 | Partly: `-ink` everywhere (SP-04) and one fill variant (SP-05). A does not add a second mark shape — see Refuses. |
| F15, F19, F25 | Not addressed. A brings no imagery, no texture, and does not touch People. |

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
shipped one. The test's ground list would need A's three stocks added — one array, named in the
cost below.

## Cost

**Files.** `globals.css` (the ~20 token edits) · `components/document/section-eyebrow.tsx`,
`region/region-head.tsx`, `desk-roster.tsx`, `doc-letterhead.tsx`, `ffe-section.tsx`,
`margin-rail.tsx`, `doc-spine.tsx`, `studio-drawer.tsx`, `red-letter-zone.tsx`,
`status-chip.tsx`, `stamp.tsx` · the `border-[var(--color-pearl)]` sweep across
`components/document/**` (502 usages, most of them a token swap) ·
`lib/document/__tests__/contrast.test.ts` (add the three stocks to the ground list).

**Rough size.** 2–3 days for the tokens and the named components; the pearl sweep is the long
pole and is mechanical. The type sweep rides on SP-01, which is shared.

**Reversibility.** High. Every value is a token; reverting is one commit against `:root`. The
class sweep is the only part that does not revert by token, and it replaces literals with
tokens, which is worth keeping either way.

## Refuses

A does not add colour beyond the four inks it darkens; does not tint any surface by state or
movement; does not add imagery or texture; does not invert any ground; does not add a second
mark shape for state (F02 stays half-closed — the dot keeps carrying five states, and A only
makes the ink under it legible); does not touch People, Library or the ledger layouts beyond
their type floors; and does not ask for the elevation amendment.

## Mock index

- `a-m1-desk-1440.html` — the desk at 1440. The tan ground under the whole page, the section
  head over its rule at "EVERY JOB" and "THE STUDIO", 11px stage heads, 18px job names, hairline
  row rules. Four stage groups are shown, one per specimen project, where the brief's crop named
  two; they are the same component and add no IA.
- `a-m2-doc-rich-1440.html` — spine, paper and margin at 1440 with the drawer. Letterhead at
  40px through the red-letter zone, the Client-approvals seam, the Schedule head and its phase
  ladder, then `PROJECT · FF&E` over the double rule and three FF&E lines by room. The Schedule
  block renders the specimen's phase-4-of-6 state; today's capture shows the composer instead,
  because the local project has no phases.
- `a-m4-strip-360.html` — one column, six specimens: roster row, FF&E line, status chip in two
  states, section head, margin chip, drawer segment. Pairs against `today-m4-strip-360.html`.
- `a-m5-desk-390.html` — the mobile desk with the mobile bar.
