# Direction B — Honest Materials

## Thesis

A designer's day is spent judging things by eye, and across twenty-two captures the portal shows
no piece of furniture, no fabric, no finish and no room. It also spends six named phase hues on
nothing but a folder tab. B puts both to work. Paper is tinted by the movement the document is
in — one stock for each of the six stage groups the desk actually prints, drawn from the six
shipped `--phase-*` hues and tuned against **the ground each is painted on**, not against the
sheet. Status stops being a hue on a 6px dot and becomes a filled stamp at 16-18% with its
matching ink. The letterhead and the red-letter zone share one charcoal band. Where an FF&E line
links a catalog product, a 48px thumbnail sits on it.

## What stays identical

Every route, component, act, label and piece of information architecture. The desk opens on
"Good morning, Leah" with the same three acts and the same whisper notes; the roster keeps
"EVERY JOB · 16 LIVE · 1 OVERDUE", the same stage groups in the same order (the M1 figure crops
it to four of the six — Discovery · 1, Proposal · 2, Project · 4, Install · 1 — in the desk's own
order, with `BRIEF · 5` and `DIRECTION · 3` captioned as left out), one line per job, never a
card; the studio index keeps its three columns of labels and doorways with no counts;
the drawer keeps its five doorways and three right-hand items. The document keeps its spine,
paper and margin, its letterhead, red-letter zone, region heads and their ledgers, its FF&E
lines by room. The tab is the movement word the surface already prints; the tint is the stock
that word is printed on. No copy changes, no region moves, nothing folds that did not fold.

## The risk taken

**The charcoal band.** The letterhead and the red-letter zone sit together on `#2C2926`,
bled to the paper's edge — the first opaque dark block the document has ever carried, and the
highest-contrast object on the page at **12.485:1** against the Project stock the M2 sheet takes
(12.43-12.52 across the six stocks; **13.87:1** on the untinted sheet, which is the number to
quote only for a document B leaves untinted). It answers F09 (the most urgent band is the
palest band) with the bluntest instrument in the box, and it is the move most likely to read
as "an app" rather than "a document". It is also reversible in one token: drop the band, keep
the tints, and B is quieter but intact.

## Token deltas

**The v1 retune, stated plainly.** In v1 the five stocks were quoted against the sheet, where
they sat at 1.026-1.046:1 — but on the desk they are painted on the **desk ground**, where they
measured **1.001-1.020:1**. The Project band, the largest group, was at 1.001:1: flatter than the
1.025:1 the audit calls the defect. v2 tunes every stock against the ground it is actually
painted on. Alphas go from 4-6% to **9-22%**.

**The v2 retune's own bill, and the v3 fix.** Deepening the stocks by ~8% ate the rail's
headroom, and v2 did not re-measure it: at `#ECE7DF` the rails read **1.058 / 1.060 / 1.063 /
1.065 / 1.066 / 1.066:1** against the six sheets they actually flank — every one of them *below*
today's spine-against-paper **1.081:1**, which is the figure `12-measurements.md` §2 records as
part of the defect. B was the one lane whose SP-08 went backwards. v3 moves the rail one step
deeper, to **`#ECE7DF` → `#E8E3DB`**, and it now reads:

| the sheet the rail flanks | rail `#E8E3DB` vs it | rail `#ECE7DF` vs it (v2) |
|---|---|---|
| Brief `#EDEEED` | **1.098** | 1.058 |
| Proposal `#F4EDE4` | **1.100** | 1.060 |
| Project `#F8EED0` | **1.103** | 1.063 |
| Direction `#F2EEE8` | **1.105** | 1.065 |
| Discovery `#EFEFE8` | **1.106** | 1.066 |
| Install `#F6EDE7` | **1.106** | 1.066 |
| the untinted sheet `#FCFAF6` | **1.225** | 1.181 |
| *today's spine wash vs the paper* | *1.081* | *1.081* |

All seven clear today's 1.081, so SP-08 goes forward in B and not backwards. **The price is
exact.** On `#E8E3DB` three of the four paper inks fall under the 4.5:1 floor — golden-hour
**4.452**, terracotta **4.414**, sage **4.411** — so B's rail carries **only charcoal, the three
muted inks and clay-ink** (`#7C5E30`, **4.697:1**, the lowest that still prints there). Nothing
in B puts a warm pigment ink on a rail today; the rule is now a rule rather than an accident, and
`--b-rail-quiet-stock` carries the same `quiet` marker B's charcoal band already uses, so
`research/contrast-check.mjs` reports the three pairs that never occur as warnings rather than
failures. **There is no third option**: 1.08:1 under the darkest sheet (`#EDEEED`) caps the rail
at a relative luminance of **0.7858**, and sage-ink needs **0.7886** — the two windows do not
overlap, at any hue.

**One consequence to state.** The rail therefore cannot join `contrast.test.ts`'s ground list,
which asserts *every* `-ink` token against *every* light ground: three of B's four would fail
there. B's ground list gains the six stocks and the five fills; the rail is declared with the
band's `quiet` convention instead, and the register rule — charcoal, the muted ramp and clay-ink
on the rail, the warm pigment inks only on the sheet — is held by review rather than by the
suite. That is B's remaining cost on this defect, and it is named rather than absorbed.

| Token | Today (globals.css) | Proposed | vs desk ground `#FAF7F2` | vs sheet `#FCFAF6` |
|---|---|---|---|---|
| `--doc-paper` | `#FCFAF6` (:51) | unchanged — the untinted sheet | — | — |
| desk ground | `--bg-primary` `#FAF7F2` (:62) | unchanged — B spends its colour on movements | — | — |
| stock · Brief | — | `#EDEEED` — consultation `#8B9CAD` @13% (:105) | **1.088:1** | 1.116:1 |
| stock · Discovery | — | `#EFEFE8` — walkthrough `#A8B5A0` @16% (:110) | **1.081:1** | 1.108:1 |
| stock · Direction | — | `#F2EEE8` — refinement `#8B7355` @9% (:107) | **1.081:1** | 1.109:1 |
| stock · Proposal | — | `#F4EDE4` — concept `#C4A57B` @15% (:106) | **1.087:1** | 1.114:1 |
| stock · Project | — | `#F8EED0` — procurement `#E8C547` @22% (:108) | **1.084:1** | 1.111:1 |
| stock · Install | — | `#F6EDE7` — installation `#D4A090` @15% (:109) | **1.081:1** | 1.108:1 |
| rail stock | spine `rgba(229,226,221,.28)` = 1.053:1 vs the ground, 1.081:1 vs the paper (`doc-spine.tsx:44`) · margin `rgba(250,247,242,.98)` at 1180-1439 and `.55` at 1440+, the second compositing to the ground exactly, 1.000:1 (`margin-rail.tsx:258`) | `#E8E3DB` | 1.195:1 — *a ground the rails never touch, printed here only for completeness* | **1.098-1.106:1 against the six sheets they flank**, 1.103:1 under the Project stock the M2 sheet takes, 1.225:1 under the untinted sheet |
| fill · ordered | none — `status-chip.tsx:10` has no background | `#F2EBE0` (clay @18%) | — | 1.136:1; clay-ink on it **5.07:1** |
| fill · in production | none | `#F8F0D7` (golden @18%) | — | 1.093:1; golden-hour-ink **4.99:1** |
| fill · delivered | none | `#EDEEE7` (sage @18%) | — | 1.120:1; sage-ink **4.83:1** |
| fill · damaged | none | `#F4E6E0` (error `#C77B6E` @**16%**) | — | 1.168:1; terracotta-ink **4.63:1**, sage-ink **4.63:1** |
| fill · awaiting approval | none | `#E8E9E9` (dusty blue @18%) | — | 1.167:1; body ink **6.91:1** |
| band | red-letter `rgba(212,160,144,.08)` = 1.056:1 (`red-letter-zone.tsx:87`) | `#2C2926` | **12.485:1** on the Project stock B actually paints (12.43-12.52 across the six) | **13.87:1** on the untinted sheet; off-white on it 13.53:1, base clay 6.21:1, base terracotta 6.36:1 |
| tab · Brief | `--phase-consultation: #8B9CAD` (:105), white ink at 2.82:1 | `#5C7186` | — | white ink **5.05:1** |
| tab · Discovery | `--phase-walkthrough: #A8B5A0` (:110), white ink at 2.15:1 | `#4F6248` | — | white ink **6.62:1** |
| tab · Direction | `--phase-refinement: #8B7355` (:107) | `#6B5637` | — | white ink **6.97:1** |
| tab · Proposal | `--phase-concept: #C4A57B` (:106), white ink at 2.33:1 | `#8B6A3A` | — | white ink **4.98:1** |
| tab · Project | `--phase-procurement: #E8C547` (:108), white ink at 1.68:1 | `#7A6410` | — | white ink **5.74:1** |
| tab · Install | `--phase-installation: #D4A090` (:109), white ink at 2.28:1 | `#9A4E39` | — | white ink **5.96:1** |
| the muted ramp and the four `-ink` tokens | — | the planks' values, unchanged by B | — | **lowest B pair: sage-ink and terracotta-ink on the damaged fill, 4.626 / 4.629** — see below |
| hover step *(SP-06)* | `--bg-hover` `rgba(196,165,123,.06)` = 1.042:1 | **the untinted sheet showing through the tinted stock** | — | **1.108-1.116:1** on the six stocks, **1.225:1** on the rail |
| grain | `rgba(139,115,85,.01)` on 1 row in 4 (F25) | two crossed repeating gradients at 3.0% and 2.2% | — | — |

**The six-stage → stock map** (against the labels in `w1440-desk.png`, which are the ones the
surface prints — not a fourth vocabulary). Read the recipe exactly as it is written: each hue is
**composited over the sheet `#FCFAF6`** and then **measured against the desk ground `#FAF7F2`**
it is painted on. Composite the same alpha over the ground instead and you get six different
colours — concept at 15% over `#FAF7F2` is `#F2EBE0`, not `#F4EDE4`, and `#F2EBE0` is already
B's ordered-state fill; procurement at 22% over the ground is `#F6ECCC`, not `#F8EED0`. The
declared hexes below are the ones measured everywhere in this deck.

| stage group on the desk | `--phase-*` hue | alpha | stock |
|---|---|---|---|
| `BRIEF · 5` | consultation `#8B9CAD` | 13% | `#EDEEED` |
| `DISCOVERY · 1` | walkthrough `#A8B5A0` | 16% | `#EFEFE8` |
| `DIRECTION · 3` | refinement `#8B7355` | 9% | `#F2EEE8` |
| `PROPOSAL · 2` | concept `#C4A57B` | 15% | `#F4EDE4` |
| `PROJECT · 4` | procurement `#E8C547` | 22% | `#F8EED0` |
| `INSTALL · 1` | installation `#D4A090` | 15% | `#F6EDE7` |

There is no "Care" stock; v1 invented one and left Discovery and Direction unpainted. Six stage
groups, six hues, one map.

**What the stocks do and do not do, after the retune.** They now carry **value** against the
ground — 1.081-1.088:1, against the 1.025:1 the audit calls the defect — and they still carry
**hue** against each other. They do **not** carry value against each other: by construction all
six sit one step above the same ground, so pairwise they measure **1.000-1.007:1**. A movement is
told from the ground by value and from another movement by hue. That is the bet, stated as a
number.

**Where the hue would not go further without muddying.** Two stocks are named as costs, not
wins. **Brief** reaches 1.088:1 only at 13% of a cool hue and arrives as `#EDEEED`, a
near-neutral grey — the one cool surface in a warm system. **Project** needs 22% of golden hour
to reach 1.084:1 and arrives as `#F8EED0`, a buff manila; on the M2 document that is the whole
sheet. Both are the honest price of asking a light pigment to separate by value on light paper,
and both are visible in the previews.

**Why the ceiling is where it is.** B, A and C all run into the same arithmetic. The whole span
between the sheet and the point where the shipped `-ink` tokens fall under 4.5:1 is about
**1.20**, and B needs two steps inside it — ground → stock and stock → rail. Two steps of 1.081
need 1.081² = **1.169**, which fits; but B's stocks are not all at 1.081 (Brief is at 1.088, and
it is the deepest), and once the rail clears 1.08 under Brief, three of the four `-ink` tokens
are outside the floor on it. A spends the same span on three stocks and pays by darkening four
inks; **B spends it on the movements and pays by taking three inks off the rail** — the two
lanes buy different things with one budget, and neither gets both. A state fill on a tinted
sheet has even less room, which is why B's fills are composited over the untinted sheet and
separated by the stamp's own 1.5px pigment border, not by their fill alone (on the Project stock
those fills sit at 1.008-1.052:1; the border does the edge work).

**The damaged fill is 16%, not 18%.** At 18% its two tightest inks were 4.515 and 4.512 —
`toFixed(2)` = 4.51, one 8-bit step from turning `contrast.test.ts` red. At 16% both read 4.63.
The margin is now 0.13, and this paragraph is here so nobody retunes it back.

**B's lowest ink pair, stated once and correctly.** v2's table printed "lowest B pair:
`--text-faint` on the rail, 5.52:1". That figure is right for that token and wrong as a floor:
on v2's rail `#ECE7DF` the binding pair was **sage-ink `#5F6B57` at 4.578** with terracotta-ink
at 4.581 — 0.94 below the number the table published for that very ground, and tighter than the
damaged fill the direction spent a paragraph protecting. The v3 rail closes it by removing those
inks from the rail entirely, so the floor comes back to where the protective paragraph already
is: across B's nine inks and the twelve grounds B prints them on — the six stocks, the five
fills and the untinted sheet — **108 pairs, zero failures, lowest 4.626** (sage-ink on the
damaged fill; terracotta-ink 4.629 beside it). On the rail, the lowest of the six inks that
print there is **clay-ink at 4.697**.

## Recipes by surface

**Desk ground & roster.** The ground stays `#FAF7F2`. Each stage group is a band of its own
movement stock, **bled to the page's own edges** so it has no left or right edge of its own and
cannot read as a panel; its head — `PROJECT · 4`, `PROPOSAL · 2` — becomes a saturated tab in the
deepened hue with the shipped white mono label. Inside the band the roster line is unchanged: one
line per job, never a card. At deck scale the tab reads as a label plate rather than a notched
folder tab; that is stated rather than claimed away.

**No room chip on the roster.** v1 put a 40px shape-only chip on each roster line. It is dropped:
the roster would have to know per job whether a scan exists — a query `desk-roster.tsx` does not
make — and a 40px block sets the row's minimum height, which turns a line into a block against
that component's own rule ("never a card"). The FF&E thumbnail carries F15 on its own.

**Document paper & letterhead.** The sheet takes the movement's stock — the mock is a Project
document on `#F8EED0`. The letterhead sits on the charcoal band, bled to the paper's edge, with
the movement's tab above the title; title and vitals in off-white and base clay, both above 6:1
on the band, per the inversion rule at globals.css:28-33.

**Section heads & rules.** The planks' three rule weights, with the section rule taking the
movement's tab pigment instead of charcoal, so a section opening in a Project document and one in
an Install document are not the same rule. The Strata mark's first bar takes the same pigment.

**Spine.** `#E8E3DB`, one step under every movement stock — **1.098-1.106:1 below the six**,
1.103:1 below the Project stock the M2 sheet takes, 1.225:1 below the untinted sheet — so the
rail is a rail whatever the document's movement, and it is a better rail than today's 1.081:1
rather than a worse one (SP-08, F08). It does not go deeper because it is already past the point
where three of the four paper inks hold 4.5:1 on it; the rail's own register is charcoal, the
muted ramp and clay-ink, and the warm pigment inks stay on the sheet.

**Margin.** The same rail stock; the chips keep the sheet's own paper as their fill so a note
reads as paper laid on the rail (F07, F21).

**Drawer.** The sheet's paper `#FCFAF6` with a 16%-charcoal top edge — distinct from a card,
which is now a tinted stock rather than white (SP-07, F06).

**Filled states — on the Stamp.** SP-05's fill is B's default for a state that is the reason a
row is on the page, and in every figure in this deck it lands on **`Stamp`**, not on
`StatusChip`: `research/12-measurements.md` §8 records that `StatusChip` has no reachable render
on this data (0 rows in `plan_sheets`, 0 `proposal_items` with a `product_id`), so nothing in
this program has seen one on screen. The chip carries the same variant wherever it does render.
The pigment sits at 16-18% over the untinted sheet, the word takes the matching `-ink`, and the
stamp's existing 1.5px pigment border stays — on a tinted sheet the border is what separates the
chip, because the fill alone has 1.008-1.052:1 to work with.

**FF&E lines.** A 48px thumbnail leads the line **only where the line links a catalog product**
(`project_ffe_items.product_id` → `products.images[0]`). Verified on the local DB:
`project_ffe_items` has **6 rows, 0 with a `product_id`**; `products` has **21 rows, 17 with
images**. So on this data B's headline material move renders **zero thumbnails**, and the two
crops in the mock are stood in to show the treatment. **The number nobody in this program has is
the production one** — how many Strata FF&E lines carry a `product_id` — and the team should ask
for it before ruling, because if it is near zero B's answer to F15 is aspirational. Where no
product links, the line keeps the slot and shows the rail stock at **1.103:1** under the Project
stock the M2 sheet takes (1.063:1 at v2's lighter rail), with a 22%-charcoal edge: a material,
not a blank that reads as a failed image.

**Red-letter zone.** On the band, in the band's own register: terracotta base pigment for the
label at 6.36:1, off-white for the row text at 13.53:1, the left edge in base terracotta. The
palest band on the document becomes the darkest object on it — **12.485:1** from the Project
stock it sits on, 13.87:1 from an untinted sheet (F09).

**390 mobile.** The stocks and the tabs carry the stage groups once the acts stack, which makes
390 the width where B is most exposed: a tint on a phone in daylight is the first thing to go.
At 1.081-1.088:1 the bands are now a real value step rather than the 1.001:1 of v1, and the tabs
and fills still read. The mobile bar is unchanged. The figure is drawn with F24 and the roster
row's act/need collision assumed repaired — layout defects no direction here fixes.

## Findings addressed

### Closed by the planks (all three lanes)

Identical to Direction A's list — SP-01 (F11, F12, F13, F14, F21, F22) · SP-02 (F16) · SP-03
(F18) · SP-04 (F02 contrast half, F03 stamp hole) · SP-05 (F01, F02, F03 in part) · SP-06 (F17)
· SP-07 (F06) · SP-08 (F07, F08) · SP-09 (F24).

### Closed by Direction B, over and above the planks

| F-id | How B addresses it |
|---|---|
| F15 | 48px product thumbnails where a catalog link exists — the first interiors imagery on the surface, and the only lane that offers any. See the caveat above: zero linked lines locally. |
| F09 | The zone moves onto the charcoal band — 1.056:1 → **12.485:1** against the stock the sheet actually takes (13.87:1 on an untinted sheet). |
| F05 (partly) | The sheet is tinted by movement at 1.081-1.088:1 over the ground, and the rails open to **1.098-1.106:1 against the six sheets they flank**, from today's 1.081:1. The desk ground itself is unchanged. |
| F02, F03 (beyond the plank) | The state's ground carries the hue and the word sits in the matching ink, so a state is legible without resolving a 6px dot. |
| F20 | Selection can take the same fill grammar as state, in all three rooms. |
| F25 | Grain at 2.2-3.0%, from 1%. |
| F10 (partly) | The movement's pigment on the section rule ranks a section head above a state word by colour as well as by weight. |

### Not addressed by B

F13, F14 and F11 beyond the planks' floors — B does not restate the type scale, and says so.
F19 (People) is untouched.

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

**Never a card** — the roster line stays a line, and the 40px roster chip that would have made it
a block is dropped. In v1 the band had a 2px radius and stopped short of the page's edges, and
its own preview showed the result: a rounded panel with a tab on it, which is a card. In v2 the
band **bleeds to the page's own edges** — no left edge, no right edge, no radius — so it is a
stock the lines are printed on, which is what a stock is. The tab still reads as a label plate
rather than a notched folder tab at deck scale; that is a fair charge and it is not answered
here.

**No tiles, no counts, no metrics** — the studio index is untouched; the tabs print the stage
label and the count the roster already prints, verbatim.

**I151 / contrast.test.ts** — the four `-ink` values are unchanged; the test's ground list gains
the six stocks and the five state fills, and **not the rail**, because the test asserts every
`-ink` on every light ground and three of B's four read 4.41-4.45 there (see the v3 retune). Of
the 108 pairs it does gain, every one clears 4.5:1; the tightest are sage-ink and terracotta-ink
on the damaged fill at **4.626 / 4.629** (v1 had them at 4.51, one 8-bit step from red — the fill
went from 18% to 16% for that reason alone). The rail's own register — charcoal, the muted ramp
and clay-ink at 4.697 — is a review rule, not a suite rule, and that is stated as a cost rather
than hidden. The on-band pigments are the other half of the rule the test already holds: base
pigment on charcoal, not `-ink`.

## Cost

**Files.** `globals.css` (six stocks, five fills, six tabs, the grain) ·
`components/document/{status-chip,stamp,red-letter-zone,doc-letterhead,doc-spine,margin-rail,
studio-drawer,desk-roster,ffe-section}.tsx` · a movement-to-stock resolver in `lib/document/` —
a map from the stage group the desk prints, and from the section a document is in, to its stock ·
`ffe-section.tsx` plus the FF&E query for `product_id → products.images[0]` ·
`lib/document/__tests__/contrast.test.ts`.

**What is not styling.** One item, down from two. The FF&E thumbnail changes the query and the
row's markup, and the empty case has to be as good as the filled one. The roster's scan-existence
chip — which would have been a second query on `desk-roster.tsx` — is dropped.

**The sweeps.** B rides on SP-01 (1,749 `text-[<n>px]` literals across 252 files) and SP-03 (502
pearl literals across 172 files) exactly as A and C do; neither is B's own work and neither is in
the estimate below.

**Rough size.** B's own work **4-6 days**, plus the planks. The thumbnail is the long pole and
the only part that is not a stylesheet.

**Reversibility.** Medium. Tokens revert in one commit; the band, the tabs and the fills revert
with them. The thumbnail does not — once a line can show an image, taking it away is a product
change, not a token change.

**The open number.** How many production FF&E lines carry a `product_id`. Locally it is zero of
six. Nobody in this program has the Strata figure, and B's headline move is worth what that
number is worth.

## Refuses

B does not change the type scale (it takes SP-01's floors and stops); does not invert any
chrome; does not add a second texture beyond the grain; does not put a photograph anywhere a
catalog link does not exist; does not show a room scan as a picture; does not add a badge, a
count, a tile or a metric; and does not ask for the elevation amendment.

## Mock index

All four lanes are drawn from the same markup; only the lane class and the caption differ.

- `b-m1-desk-1440.html` — the desk at 1440. Four stage groups, each on its movement's stock at
  1.081-1.088:1 over the ground, bled to the page edge, under a saturated tab of the same hue.
  **Four of the desk's six groups, in the desk's real order**; `BRIEF · 5` and `DIRECTION · 3`
  are cropped and the figcaption says so. Pairs against `today-m1-desk-1440.html`.
- `b-m2-doc-rich-1440.html` — the document at 1440 on the Project stock, with the charcoal band
  carrying the movement tab, the letterhead and the red-letter zone; the rails on `#E8E3DB`;
  filled DECISION DUE and ORDERED stamps; 48px thumbs on the two catalog-linked lines and the
  honest empty slot, at the rail stock, on the rug. **The local seed has no FF&E line with a
  `product_id`** — the two crops are stood in to show the treatment, not the data. The Schedule
  block renders the specimen's phase-4-of-6 state; today's capture shows the composer, because
  the local project has no phases.
- `b-m4-strip-360.html` — one column, six specimens, with the fills and the movement tint.
- `b-m5-desk-390.html` — the mobile desk, drawn with F24 and the roster row's act/need collision
  assumed repaired. No direction in this deck fixes either.

---

## Critique dispositions (v2)

| D | Disposition | One line |
|---|---|---|
| D10 | **fix** | Every stock is retuned against the desk ground it is painted on — 1.081-1.088:1, from 1.001-1.020:1 — and both ratios (ground and sheet) are in the table. |
| D11 | **fix** | The bands bleed to the page's edges with no radius, so they have no edge of their own; the tab-as-plate read at deck scale is stated, not argued away. |
| D12 | **drop the chip** | The 40px roster scan chip is removed from the markup and the direction: it is a second query on `desk-roster.tsx` and it turns a line into a block. The FF&E thumbnail carries F15 alone. |
| D13 | **accept** | The local numbers (6 lines / 0 linked; 21 products / 17 with images) stay, and the recipe, the cost and the mock index now say the production number is unknown and must be asked for before ruling. No Strata query was run from this program. |
| D14 | **fix** | Six stocks for the six stage labels `w1440-desk.png` prints, published as a map; "Care" is gone. |
| D15 | **fix by widening** | The damaged fill is 16%, not 18%: its two tightest inks go from 4.51 to 4.63, and the paragraph explaining why is in the deltas. |
| D16 | **fix** | The recipe is rewritten around `Stamp`, and says `StatusChip` has no reachable render on this data. |
| D17 | **fix** | The unlinked slot takes the rail stock with a 22%-charcoal edge, instead of a near-white that read as a failed image. *(v3: the rail moved to `#E8E3DB`, so the slot now reads 1.103:1 under the Project stock, not 1.063:1.)* |
| D05 | **fix** | The rail's "from" figures name their grounds and both tiers (0.98 at 1180-1439, 0.55 at 1440+). |
| D29 | **fix** | B now renders the planks: `direction-b.css` inherits the shared PLANKS block, so B's figures carry the floors, the muted inks and the rule weights. |
| D30, D31, D32, D33 | **fix** | Real stage order with the two omissions captioned; the F24 caption on M5; `SPEC THE 3 UNSPECIFIED →` restored as the filled act; the Schedule-specimen caveat added. |
| D39 | **fix** | The findings table is split into plank-closed and B-closed. |

---

## Critique dispositions (v3)

The v2 re-read's new defects, D40-D49, as they touch Direction B.

| D | Disposition | One line |
|---|---|---|
| D40 | **fix** | "lowest B pair: `--text-faint` on the rail, 5.52:1" is gone. On v2's rail the binding pair was **sage-ink at 4.578** (terracotta-ink 4.581) — right token, wrong floor, by 0.94. v3's deeper rail takes those inks off the rail, so B's floor is back on the damaged fill where the protective paragraph already lives: **108 pairs, zero failures, lowest 4.626**. |
| D41 | **fix (high)** | The rail moves `#ECE7DF` → **`#E8E3DB`** and now reads **1.098 / 1.100 / 1.103 / 1.105 / 1.106 / 1.106:1** against the six sheets it flanks and **1.225:1** under the untinted sheet — every one above today's **1.081:1**, so B's SP-08 goes forward, not backwards. The "rails open to 1.152:1" claim, a ratio against a ground the rails never touch, is gone from the findings table; 1.195:1 against the desk ground is printed once and labelled as an adjacency that does not occur. The price is stated in full: golden-hour **4.452**, terracotta **4.414** and sage **4.411** fall under the floor on the new rail, so the rail carries only charcoal, the muted ramp and clay-ink (**4.697**), the token is declared `--b-rail-quiet-stock`, and the rail cannot join `contrast.test.ts`'s ground list. The arithmetic that leaves no third option is shown: 1.08 under `#EDEEED` caps the rail at luminance **0.7858**; sage-ink needs **0.7886**. |
| D48 | **fix** | The stock map now says which ground the recipe composites over and which it is measured against — **composited over the sheet `#FCFAF6`, measured against the desk ground `#FAF7F2`** — with the two colours the reader would otherwise derive (`#F2EBE0`, `#F6ECCC`) printed so nobody reproduces the wrong six. |
| D49 | **fix** | The band is quoted on the stock B actually paints: **12.485:1** on the Project stock, **12.43-12.52** across the six, with **13.87:1** kept and labelled as the untinted-sheet figure. Both appear in the deltas table, in F09's row, in the risk paragraph and in the red-letter recipe. |
| D43 (plank) | **fix** | B's SP-06 value is the untinted sheet showing through the tinted stock: **1.108-1.116:1** on the six, **1.225:1** on the rail. A fill *darker* than a movement stock is unavailable — at 1.10:1 below the Project stock the four `-ink` tokens read 4.36:1 on the hovered row — and the plank now says so. |
| the critic's two self-corrections | **carried** | The type sweep is **1,749** literals across 252 files and SP-01's mono denominator is **1,029**; B's Cost prints both. |
