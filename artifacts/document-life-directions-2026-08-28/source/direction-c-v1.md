# Direction C — The Dark Desk

## Thesis

D4 says depth is value contrast. The product has exactly one surface with real value contrast
and it only exists below 1180px: the MobileBar, charcoal at 14.46:1 against white. Above 1180 the paper, the
spine, the margin, the drawer and the desk are one cream inside 1.07:1. C takes D4's own
mechanism to its conclusion — the chrome goes charcoal and the paper stays paper. The desk is a
dark desk with one lit sheet on it; the spine and margin are the desk showing beside the
document; the drawer is a well cut one step deeper still. One warm clay rule marks every edge
where the sheet meets the desk. Nothing on the sheet changes at all.

## What stays identical

Every route, component, act, label and piece of information architecture. The greeting, the
three acts and their sub-labels, both whisper notes, the roster eyebrow and its stage groups in
order, one line per job and never a card, the three-column studio index with its labels and
doorways, the drawer's five doorways and three right-hand items. The document keeps its spine
with the seven marks, the running index, the in-hand block; its letterhead, red-letter zone,
region heads and ledgers; its FF&E lines by room; the margin's notes and chips. C changes which
ground each of those is printed on and nothing else — the sheet's own type, rules and inks are
untouched.

## The risk taken

**The desk route inverts too.** Charcoal chrome around a lit document is the easy half. The
hard half is that `/desk` — the screen a designer opens first every morning — becomes a dark
room with one sheet in it. That is C's whole argument (the document is the object; the desk is
the place you set it down) and it is the reason C can be rejected in one glance. If the desk
route is refused and only the document's chrome inverts, C survives as a document treatment;
the M1 mock is the version to rule on.

## Token deltas

C declares two registers. Paper inks are the shipped values, unchanged; desk inks are base
pigments, per the inversion rule already written at globals.css:28-33 and held in
`contrast.test.ts`. **No colour can clear 4.5:1 on both `#FCFAF6` and `#2C2926`** — 4.5:1 on
paper caps a text's relative luminance at 0.1745 and 4.5:1 on charcoal floors it at 0.283 — so
the two registers never meet, and `mock/direction-c.css` names every dark-register token with
`quiet` so `research/contrast-check.mjs` reports the cross-register pairs it forms as warnings
rather than failures. Both halves' real numbers are below.

### The light register — the sheet

| Token | Today (globals.css) | Proposed | on `#FCFAF6` | on `#F5EFE5` |
|---|---|---|---|---|
| `--doc-paper` | `#FCFAF6` (:51) | unchanged | — | — |
| second sheet | `--doc-sheet-2: #EFE9DD` (:52) | `#F5EFE5` (the hover/held stock) | — | 1.097:1 under the sheet |
| `--text-primary` | `#2C2926` (:66) | unchanged | 13.87 | 12.64 |
| `--text-body` | `#5C4A3C` (:67) | unchanged | 8.06 | 7.34 |
| `--text-muted` / `-subtle` / `-faint` | all `#65594E` (:68, :69, :92) | `#4E4339` / `#5A4E43` / `#65594E` (SP-02) | 9.22 / 7.73 / 6.51 | 8.39 / 7.03 / 5.93 |
| the four `-ink` tokens | `#7C5E30` `#9C5340` `#79651E` `#5F6B57` (:34, :35, :40, :41) | unchanged | 5.75 / 5.41 / 5.45 / 5.40 | 5.24 / 4.93 / 4.97 / 4.93 |

### The dark register — the desk

| Token | Today | Proposed | on desk `#37322D` | on rails `#2C2926` | on well `#201D1B` |
|---|---|---|---|---|---|
| desk ground | `--bg-primary` `#FAF7F2` (:62) | `#37322D` | — | — | — |
| spine + margin | `rgba(229,226,221,.28)` (`doc-spine.tsx:44`) · `rgba(250,247,242,.55)` (`margin-rail.tsx:258`) | `#2C2926` | — | — | — |
| drawer | `--bg-surface` `#FFFFFF` (`studio-drawer.tsx:289`) | `#201D1B` | — | — | — |
| primary ink on dark | — (the surface has none above 1180) | `#F4F0E8` | 11.15 | 12.72 | 14.75 |
| muted ink on dark | — | `#B9AC9B` | 5.70 | 6.50 | 7.53 |
| clay on dark | `--color-clay` `#C4A57B` (:12) as pigment | same value, now also type | 5.44 | 6.21 | 7.19 |
| sage on dark | `--color-sage` `#A8B5A0` (:44) | same value, now also type | 5.91 | 6.74 | 7.81 |
| terracotta on dark | `--color-terracotta` `#D4A090` (:46) | same value, now also type | 5.57 | 6.36 | 7.37 |
| dusty blue on dark | `--color-dusty-blue` `#8B9CAD` (:45) | `#9DAEBE` (one step up, the kit's dark value) | 5.57 | 6.36 | 7.37 |
| the paper edge *(new)* | — | `2px solid #C4A57B` where sheet meets desk | — | — | — |

**Separations.** sheet↔rails **13.87:1** (from 1.053:1) · sheet↔desk **12.16:1** (from 1.025:1)
· desk↔rails **1.141:1** · rails↔well **1.159:1** · desk↔well **1.322:1**. The three charcoals
are deliberately close: the chrome is one material with three depths, and the thing that has to
separate — paper from desk — separates by twelve stops.

**Why the desk is `#37322D` and not `#2C2926`.** If the desk took the shipped charcoal the
drawer would sit on its own colour. The desk is lifted one step so the rails read against it
and the drawer well reads below it, which is SP-07's requirement met inside one register.

## Recipes by surface

**Desk ground & roster.** The ground is `#37322D`. The greeting, the date, the acts and both
whisper notes are printed on the desk itself in `#F4F0E8` and `#B9AC9B`, with the lead act's
score in clay — the day's salutation belongs to the room, not to the paper. The roster and the
studio index sit on one sheet inset from the desk edges, `#FCFAF6`, with a 2px clay rule down
its left edge: the paper edge, C's signature. Inside the sheet nothing changes — same lines,
same 16px names, same hairlines, never a card.

**Document paper & letterhead.** The paper column is unchanged, and now has a 2px clay rule on
both edges where it meets the rails. The letterhead, the vitals, the seams and the region heads
are exactly today's — C's claim is that they were never the problem; the problem was that
nothing around them was anything.

**Section heads & rules.** Unchanged on the sheet. On the rails the same devices are redrawn in
the dark register: the running index's label in `#B9AC9B`, its names in `#F4F0E8`, the current
row's clay edge unchanged, the Strata marks in clay and sage instead of pearl (pearl at
`#E5E2DD` on charcoal would be a second light, not a mark).

**Spine.** `#2C2926`, no right border — the paper's clay rule is the edge. Put down, the seven
marks, the running index and the in-hand block all keep their positions and sizes; the in-hand
box loses its filled panel and takes a 12%-off-white hairline, so the timer stops outweighing
the four places the document goes (F08).

**Margin.** The same charcoal. The whisper, "IN THE MARGIN", "+ NOTE" and the two chips are
unchanged in shape; the chips lose their paper fill and become outlined in 12% off-white, with
the money chip keeping a clay left edge (F07, F21).

**Drawer.** `#201D1B`, one step under the rails, with a 12%-off-white top edge instead of a
pearl hairline. The wordmark and the current item in `#F4F0E8`, the rest in `#B9AC9B`, the
active underline still clay. No badge, no count (SP-07, F06, F23).

**Status chips & stamps.** On the sheet, unchanged — the paper inks still apply. On the dark
chrome the same chip takes the base pigments, which is the inversion rule the repo already
tests. C is the only direction where one component ships two registers, and the rule for which
one applies is the ground it is printed on, not the component.

**FF&E lines.** Unchanged. They live on the sheet.

**Red-letter zone.** Unchanged on the sheet, with SP-03's mid rule as its left edge. C is the
direction that leaves F09 to the plank: the zone is still the palest band on the paper, and the
argument that it no longer matters is that the paper is now the only lit thing on the screen.
The critic should test whether that is true or whether it is C avoiding the question.

**390 mobile.** The mobile bar is already charcoal, 14.46:1 against white — C is the direction the phone has
been shipping for a year. The one new problem is that the bar and the desk become the same kind
of surface, so the bar drops to the drawer's well `#201D1B`, 1.322:1 under the desk, and the
sheet stops at the bar's top edge. C is also the direction most exposed to the "heavier at
night" charge; there is no usage data behind this deck to say whether the portal is used at
night at all.

## Findings addressed

| F-id | How C addresses it |
|---|---|
| F05 | The three grounds become two registers 12.16:1 apart, plus a second sheet stock at 1.097:1. |
| F06 | The drawer is a well at `#201D1B`, 1.322:1 under the desk and 16.08:1 from the sheet (SP-07). |
| F07 | The margin is charcoal — a rail you can see, holding chips that no longer float (SP-08). |
| F08 | The spine is charcoal: 13.87:1 against the paper, from 1.053:1 (SP-08). |
| F23 | The one ground with value contrast stops being a mobile-only accident and becomes the system. |
| F24 | The fourth ground is painted (SP-09); at 390 the desk is charcoal and the bar is the well. |
| F16, F17, F18, F11, F12, F13, F14, F21, F22 | Through the shared planks. C restates none of them. |
| F02, F03 | Partly: SP-04 and SP-05; on the dark chrome the base pigments carry more separation than they can on paper. |
| F01, F09, F10, F15, F19, F20, F25 | Not addressed. C does not touch the sheet's own type, fills, texture or imagery. |

## Canon check

**D4 lint selectors** (`eslint.config.mjs:67-100`) — none tripped, and C is the direction that
most nearly needs one. Everything it does is a background colour, a border colour or an ink; no
`shadow-*` literal or template, no `box-shadow`/`drop-shadow(` string, no `boxShadow` property.
`mock/direction-c.css` and all four C fragments grep clean. C is also the strongest argument
*against* the elevation amendment: on a dark ground a sheet needs no shadow to lift, because
12:1 of value already lifts it.

**D1** — untouched. The chrome changes colour; it does not gain a surface, a tab or a panel.

**Typography-first** — the type is untouched. The hierarchy C adds is value, which is what D4
names as the sanctioned mechanism.

**Never a card** — the roster stays lines on a sheet. The sheet is the same object the document
route already paints, at the same width, with one rule for an edge and no radius; it is not a
container around each row.

**No tiles, no counts, no metrics** — nothing added; the studio index is restyled by ground only.

**I151 / contrast.test.ts** — C is the case the test was written for. The paper half is
unchanged and still passes; the dark half is the "leaves the base pigments legible on charcoal,
where the inks are not" assertion, extended from the mobile bar to the drawer, spine, margin and
desk. The test's charcoal ground list gains `#37322D` and `#201D1B`.

## Cost

**Files.** `globals.css` (three chrome grounds, the dark-register inks, the edge rule) ·
`components/document/{doc-spine,margin-rail,studio-drawer}.tsx` (each currently hardcodes its
own `bg-[rgba(...)]`) · `desk-contents.tsx`, `desk-roster.tsx` and the desk route shell for the
sheet inset · `mobile/mobile-bar.tsx` (the well) · every component that prints an ink inside the
three chrome regions — the running index, the shelf rows, the margin chips, the in-hand block,
the drawer items — because each has to choose a register ·
`lib/document/__tests__/contrast.test.ts`.

**Rough size.** 4–5 days, and the risk is in the tail: the dark register has to be complete, or
one unconverted `text-[var(--text-muted)]` inside the spine is a 1.5:1 line nobody can read. A
`.doc-on-dark` scope that repoints `--text-*` for its subtree (the mechanism `.doc-room-lifted`
already uses at globals.css:748-753) is the cheap way to make that failure loud rather than
silent.

**Reversibility.** High as tokens, medium in practice: reverting the grounds is one commit, but
the register choices scattered through the chrome components would want reverting too.

## Refuses

C does not touch the type scale, the rule weights on the sheet, the FF&E line, the red-letter
zone's fill, the status vocabulary, or any imagery; it adds no texture; it does not tint the
paper; it does not darken the paper (the sheet is the shipped `#FCFAF6` and stays there); it
offers no night mode, no toggle and no theme switch — C is one appearance, not two; and it does
not ask for the elevation amendment, which it argues against.

## Mock index

- `c-m1-desk-1440.html` — the desk at 1440. Greeting, acts and whispers printed on the charcoal
  desk; the roster and the studio index on one inset sheet with the clay rule down its left
  edge; the drawer as the well below.
- `c-m2-doc-rich-1440.html` — the document at 1440. Spine and margin charcoal, drawer in the
  well, the paper between them with a clay rule on both edges; every mark and chip on the rails
  redrawn in base pigments. The sheet's own content is identical to today's treatment.
- `c-m4-strip-360.html` — one column, six specimens. On the sheet nothing changes; the drawer
  segment is the only cell that shows the register the chrome moves to.
- `c-m5-desk-390.html` — the mobile desk, with the bar dropped to the well so two charcoals stay
  apart.
