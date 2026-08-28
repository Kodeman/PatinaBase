# Direction B — Honest Materials

## Thesis

A designer's day is spent judging things by eye, and across twenty-two captures the portal
shows no piece of furniture, no fabric, no finish and no room. It also spends six named phase
hues on nothing but a folder tab. B puts both to work. Paper is tinted by the movement the
document is in — Brief, Proposal, Project, Install, Care each on their own stock, drawn from
the six shipped `--phase-*` hues at 5–6%. Status stops being a hue on a 6px dot and becomes a
filled chip at 18% with its matching ink. The letterhead and the red-letter zone share one
charcoal band. Where an FF&E line links a catalog product, a 48px thumbnail sits on it.

## What stays identical

Every route, component, act, label and piece of information architecture. The desk opens on
"Good morning, Leah" with the same three acts and the same whisper notes; the roster keeps
"EVERY JOB · 16 LIVE · 1 OVERDUE", the same stage groups in the same order, one line per job,
never a card; the studio index keeps its three columns of labels and doorways with no counts;
the drawer keeps its five doorways and three right-hand items. The document keeps its spine,
paper and margin, its letterhead, red-letter zone, region heads and their ledgers, its FF&E
lines by room. The tab is the movement word the surface already prints; the tint is the stock
that word is printed on. No copy changes, no region moves, nothing folds that did not fold.

## The risk taken

**The charcoal band.** The letterhead and the red-letter zone sit together on `#2C2926`,
bled to the paper's edge — the first opaque dark block the document has ever carried, and the
highest-contrast object on the page at 13.87:1. It answers F09 (the most urgent band is the
palest band) with the bluntest instrument in the box, and it is the move most likely to read
as "an app" rather than "a document". It is also reversible in one token: drop the band, keep
the tints, and B is quieter but intact.

## Token deltas

| Token | Today (globals.css) | Proposed | Contrast |
|---|---|---|---|
| `--doc-paper` | `#FCFAF6` (:51) | unchanged — the untinted sheet | — |
| stock · Brief *(new)* | — | `#F6F5F2` (dusty blue `#8B9CAD` @5%) | body ink 7.71:1 · clay-ink 5.50:1 |
| stock · Proposal *(new)* | — | `#F9F5EF` (clay `#C4A57B` @6%) | body ink 7.73:1 · clay-ink 5.52:1 |
| stock · Project *(new)* | — | `#FBF7ED` (golden hour `#E8C547` @5%) | body ink 7.85:1 · clay-ink 5.61:1 |
| stock · Install *(new)* | — | `#FAF5F0` (terracotta `#D4A090` @6%) | body ink 7.75:1 · clay-ink 5.54:1 |
| stock · Care *(new)* | — | `#F7F6F1` (sage `#A8B5A0` @6%) | body ink 7.76:1 · clay-ink 5.54:1 |
| rail stock *(new)* | spine `rgba(229,226,221,.28)` (`doc-spine.tsx:44`) · margin `rgba(250,247,242,.55)` (`margin-rail.tsx:258`) | `#F0EADC` | 1.151:1 under the sheet, from 1.053:1 and 1.000:1 |
| chip fill · ordered | none — `status-chip.tsx:10` has no background | `#F2EBE0` (clay @18%) | clay-ink on it **5.07:1**; 1.136:1 vs paper |
| chip fill · in production | none | `#F8F0D7` (golden @18%) | golden-hour-ink **4.99:1**; 1.093:1 vs paper |
| chip fill · delivered | none | `#EDEEE7` (sage @18%) | sage-ink **4.83:1**; 1.120:1 vs paper |
| chip fill · damaged | none | `#F2E3DE` (error `#C77B6E` @18%) | terracotta-ink **4.51:1**; 1.198:1 vs paper |
| chip fill · awaiting approval | none | `#E8E9E9` (dusty blue @18%) | body ink **6.91:1**; 1.167:1 vs paper |
| band | red-letter `rgba(212,160,144,.08)` = 1.056:1 (`red-letter-zone.tsx:87`) | `#2C2926` | off-white on it **13.53:1**; base clay **6.21:1**; base terracotta **6.36:1** |
| tab · Brief | `--phase-consultation: #8B9CAD` (:105) with white ink | `#5C7186` | white ink **5.05:1**, from 2.82:1 |
| tab · Proposal | `--phase-concept: #C4A57B` (:106) | `#8B6A3A` | white ink **4.98:1**, from 2.33:1 |
| tab · Project | `--phase-procurement: #E8C547` (:108) | `#7A6410` | white ink **5.74:1**, from 1.68:1 |
| tab · Install | `--phase-installation: #D4A090` (:109) | `#9A4E39` | white ink **5.96:1**, from 2.28:1 |
| tab · Care | `--phase-walkthrough: #A8B5A0` (:110) | `#4F6248` | white ink **6.62:1**, from 2.15:1 |
| `--text-muted` / `-subtle` / `-faint` | all `#65594E` (:68, :69, :92) | `#4E4339` / `#5A4E43` / `#65594E` (SP-02) | 9.22 / 7.73 / 6.51:1 on paper |
| the four `-ink` tokens | `#7C5E30` `#9C5340` `#79651E` `#5F6B57` (:34, :35, :40, :41) | unchanged — every B ground clears 4.5:1 with them | lowest pair 4.51:1 |
| grain *(new)* | `rgba(139,115,85,.01)` on 1 row in 4 (F25) | two crossed repeating gradients at 3.0% and 2.2% | — |

**What the tints do and do not do.** The five movement stocks sit within **1.02–1.05:1** of the
sheet and within **1.02:1** of each other. They are told apart by hue, not by value. That is
the bet B is making, and it is the first thing the critic should test: if hue at 5% cannot be
read across two documents opened an hour apart, B's signature is decorative and only its tabs,
fills and band are doing work. The separation B can prove in numbers is elsewhere — the rail
stock at 1.151:1, the chip fills at 1.09–1.20:1, the band at 13.87:1.

**Why the tabs deepen.** `DECISIONS.md:2613` already records the defect: "White tab ink on the
lighter status hues (terracotta / clay / golden) is low-contrast for the small mono label."
B does not put white on a light hue; it deepens the hue until the shipped white ink clears
4.5:1. The base `--phase-*` tokens stay as they are for rules, marks and pools.

## Recipes by surface

**Desk ground & roster.** The ground stays `#FAF7F2`; B spends its colour on the movements, not
on the page. Each stage group is a band of its own movement stock, and its head — `PROJECT · 4`,
`PROPOSAL · 2` — becomes a saturated folder tab in the deepened hue with the shipped white mono
label, notched into the band's left edge. Inside the band the roster line is unchanged: one
line per job, never a card. A 40px shape-only chip stands where a room scan exists; it is a flat
tint with a dashed edge, never a stand-in photograph.

**Document paper & letterhead.** The sheet takes the movement's stock — the mock is a Project
document on `#FBF7ED`. The letterhead sits on the charcoal band, bled to the paper's edge, with
the movement's tab above the title; title and vitals in off-white and base clay, both above
6:1 on the band, per the inversion rule at globals.css:28-33.

**Section heads & rules.** Unchanged in structure. The region rule's 2px charcoal top border
takes the movement's tab pigment instead, so a section opening in a Project document and one in
an Install document are not the same rule. The Strata mark's first bar takes the same pigment.

**Spine.** `#F0EADC`, one step deeper than any movement stock, so the rail is a rail whatever
the document's movement (SP-08, F08).

**Margin.** The same rail stock; the chips keep the sheet's own paper as their fill so a note
reads as paper laid on the rail (F07, F21).

**Drawer.** The sheet's paper `#FCFAF6` with a 16%-charcoal top edge — distinct from a card,
which is now a tinted stock rather than white (SP-07, F06).

**Status chips & stamps.** The fill variant from SP-05 becomes B's default for a state that is
the reason a row is on the page: the pigment at 18%, the word in the matching `-ink`, the dot
dropped because the ground now carries the hue. Stamps keep their shape and rotation and take
the same fill. This is B's one deliberate departure from `KIT.md` §7 ("stamps are always
outlined, never filled") — named here so the team rules on it rather than discovering it.

**FF&E lines.** A 48px thumbnail leads the line **only where the line links a catalog product**
(`project_ffe_items.product_id` → `products.images[0]`). The local seed has **zero** linked
lines, so every thumbnail in the mock is a catalog crop stood in deliberately, and the mock
shows the honest case too: the Hartland wool rug links no product, so it keeps the slot and
shows stock rather than a stand-in. Room-scan thumbs on the desk are shape-only. Name, maker,
stamp and price keep SP-01's floors.

**Red-letter zone.** On the band, in the band's own register: terracotta base pigment for the
label at 6.36:1, off-white for the row text at 13.53:1, the left edge in base terracotta. The
palest band on the document becomes the darkest object on it (F09).

**390 mobile.** The stocks and the tabs are the only thing carrying the stage groups once the
acts stack, which makes 390 the width where B is most exposed: a 5% tint on a phone in daylight
is close to no tint. The tabs and the fills still read. The mobile bar is unchanged.

## Findings addressed

| F-id | How B addresses it |
|---|---|
| F01 | Three competing row grounds resolve to one: decision-due takes the chip fill at 1.198:1; hover is a tint step (SP-06); the highlight becomes a left edge. |
| F02 | The 6px dot stops being the only carrier — the state's ground carries it, the word sits in the matching ink. |
| F03 | Two geometries, not one: outlined for a lifecycle stamp, filled for the state that is the reason the row is there. |
| F06 | Drawer on the sheet's paper, distinct from tinted cards (SP-07). |
| F07, F08 | Both rails on `#F0EADC`, 1.151:1 under the sheet (SP-08). |
| F09 | The zone moves onto the charcoal band — from 1.056:1 to 13.87:1. |
| F15 | Product thumbnails at 48px, where a catalog link exists — the first interiors imagery on the surface. |
| F16 | Three muted inks become three values (SP-02). |
| F17 | Hover raised above clay 6% (SP-06). |
| F18 | Rule weights from SP-03, with the movement's pigment on the section rule. |
| F20 | Selection can take the same fill grammar as state, in all three rooms. |
| F25 | Grain at 2.2–3.0%, from 1%. |
| F05 | Partly: the sheet is tinted by movement, the rails are opened to 1.151:1 — but the desk ground stays `#FAF7F2`. |
| F10, F11, F12, F13, F14, F21, F22 | Only through the shared planks. B does not restate the type scale. |
| F19, F24 | F24 through SP-09. B does not touch People. |

## Canon check

**D4 lint selectors** (`eslint.config.mjs:67-100`) — none tripped. Every B move is a background
colour, a border colour, a 48px background-image on an `<img>`-free element, or a
`repeating-linear-gradient`. No `shadow-*` literal or template, no `box-shadow`/`drop-shadow(`
string, no `boxShadow` property. `mock/direction-b.css` and all four B fragments grep clean.

**D1** — untouched. The tab is a label's treatment, not a navigation control; it opens nothing.

**Typography-first** — B is the direction that leans least on type, which is a fair charge
against it. Its defence is that the CLAUDE.md rule bans *cards-within-cards and tab bars* as the
hierarchy mechanism, not colour: B adds no nesting and no bar. The folder tab is the shipped
`FolderCard` device (`folder-card.tsx`, `.folio-tab`) applied to a heading, not a new control.

**Never a card** — the roster line stays a line. A movement band is a ground behind a group of
lines, with no border, no radius beyond 2px and no elevation; it is a stock, not a container.
This is the move the critic should press hardest: a tinted band with a tab on it is one step
from a card, and B's answer is that it has no edge of its own.

**No tiles, no counts, no metrics** — the studio index is untouched; the tabs print the stage
label and the count the roster already prints, verbatim.

**I151 / contrast.test.ts** — the four `-ink` values are unchanged; the test's ground list gains
the five stocks, the five chip fills and the rail — every pair clears 4.5:1, the tightest being
terracotta-ink and sage-ink on the damaged fill at 4.51:1. The on-band pigments are the other
half of the rule the test already holds (base pigment on charcoal, not `-ink`).

## Cost

**Files.** `globals.css` (five stocks, five fills, five tabs, the grain) ·
`components/document/{status-chip,stamp,red-letter-zone,doc-letterhead,doc-spine,margin-rail,
studio-drawer,desk-roster,ffe-section}.tsx` · a movement-to-stock resolver in
`lib/document/` (a map from the section the document is in to its stock — data the surface
already has) · `ffe-section.tsx` plus the FF&E query for `product_id → products.images[0]` ·
`lib/document/__tests__/contrast.test.ts`.

**Rough size.** 4–6 days. The thumbnail is the only part that is not styling: the FF&E line
does not select the product image today, so the query and the row's markup both change, and the
empty case has to be as good as the filled one.

**Reversibility.** Medium. Tokens revert in one commit; the band, the tabs and the fills revert
with them. The thumbnail does not — once a line can show an image, taking it away is a product
change, not a token change.

## Refuses

B does not change the type scale (it takes SP-01's floors and stops); does not invert any
chrome; does not add a second texture beyond the grain; does not put a photograph anywhere a
catalog link does not exist; does not show a room scan as a picture; does not add a badge, a
count, a tile or a metric; and does not ask for the elevation amendment.

## Mock index

- `b-m1-desk-1440.html` — the desk at 1440. Four stage groups, each on its movement's stock
  under a saturated tab; shape-only room chips on the roster lines; everything else as today.
- `b-m2-doc-rich-1440.html` — the document at 1440 on the Project stock, with the charcoal band
  carrying the movement tab, the letterhead and the red-letter zone; the rails on `#F0EADC`;
  filled DECISION DUE and ORDERED chips; 48px thumbs on the two catalog-linked lines and the
  honest empty slot on the rug. **The local seed has no FF&E line with a `product_id`** — the
  two crops are stood in from `mock/img/` to show the treatment, not the data.
- `b-m4-strip-360.html` — one column, six specimens, with the fills and the movement tint.
- `b-m5-desk-390.html` — the mobile desk, where the tints carry the stage groups alone.
