# Direction C — The Dark Desk

## Thesis

D4 says depth is value contrast. The product spends it almost nowhere in the working shell: the
five charcoal grounds `contrast.test.ts:221-227` names are the mobile bar, the mobile sheets, the
sub-1180 log strip and the two client-preview banners — so the only charcoal a designer meets
above 1180px is a preview of what the *client* sees. The paper, the spine, the margin, the drawer
and the desk are one cream inside 1.07:1. C takes D4's own
mechanism to its conclusion — the chrome goes charcoal and the paper stays paper. The desk is a
dark desk with one lit sheet on it; the spine and margin are the desk showing beside the
document; the drawer is a well cut one step deeper still. One warm clay rule marks every edge
where the sheet meets the desk. Nothing on the sheet changes at all.

## The scope of the inversion

**Four surfaces go charcoal: the Studio Drawer, the DocSpine, the MarginRail, and the `/desk`
route's ground. `/library`, `/people` and the ledger sheets keep paper** and receive only the
dark drawer along the bottom edge, because the drawer is the one piece of chrome that crosses
every route.

This is a scope, not a token. `--bg-primary` is what `.document-route-shell` paints under *every*
route in `app/(document)/layout.tsx` (12-measurements.md §1), so repointing it — which is what
v1 did — would turn `/people`, `/library` and every ledger charcoal while leaving their type in
the paper register: `/people` alone renders 78 pearl border-sides and 20 white card backgrounds
tuned for a cream ground (12-measurements.md §3). C therefore paints the desk ground from a
desk-route-scoped token, and the three rooms are priced as a follow-on below, not assumed.

## What stays identical

Every route, component, act, label and piece of information architecture. The greeting, the
three acts and their sub-labels, both whisper notes, the roster eyebrow and its stage groups in
order, one line per job and never a card, the three-column studio index with its labels and
doorways, the drawer's five doorways and three right-hand items. The document keeps its spine
with the seven marks, the running index, the in-hand block; its letterhead, red-letter zone,
region heads and ledgers; its FF&E lines by room; the margin's notes and chips. C changes which
ground each of those is printed on and nothing else. On the sheet, C's own contribution is
nothing: what the sheet gains — the 11px mono floor, the 14px body floor, three muted inks, three
rule weights, one state that fills — is the planks, which A and B adopt identically.

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
`contrast.test.ts`. **No colour can clear 4.5:1 on both `#FCFAF6` and `#2C2926`** — from
`L(#FCFAF6) = 0.9572` and `L(#2C2926) = 0.0226`, the cap on paper is `(0.9572+0.05)/4.5 − 0.05` =
**0.1738** and the floor on charcoal is `4.5×(0.0226+0.05) − 0.05` = **0.2768** — so the two
registers never meet, and `mock/direction-c.css` names every dark-register token with
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
| desk-route ground *(scoped, not `--bg-primary`)* | `#FAF7F2` (:62, :10) | `#37322D` | — | — | — |
| spine + margin | `rgba(229,226,221,.28)` (`doc-spine.tsx:44`) · `rgba(250,247,242,.55)` (`margin-rail.tsx:258`) | `#2C2926` | — | — | — |
| drawer | `--bg-surface` `#FFFFFF` (`studio-drawer.tsx:289`) | `#201D1B` | — | — | — |
| primary ink on dark | — (the surface has none above 1180) | `#F4F0E8` | 11.15 | 12.72 | 14.75 |
| muted ink on dark | — | `#B9AC9B` | 5.70 | 6.50 | 7.53 |
| clay on dark | `--color-clay` `#C4A57B` (:12) as pigment | same value, now also type | 5.44 | 6.21 | 7.19 |
| sage on dark | `--color-sage` `#A8B5A0` (:44) | same value, now also type | 5.91 | 6.74 | 7.81 |
| terracotta on dark | `--color-terracotta` `#D4A090` (:46) | same value, now also type | 5.57 | 6.36 | 7.37 |
| dusty blue on dark | `--color-dusty-blue` `#8B9CAD` (:45) | `#9DAEBE` (one step up, the kit's dark value) | 5.57 | 6.36 | 7.37 |
| the paper edge *(new)* | — | `2px solid #C4A57B` where sheet meets desk | — | — | — |
| `--rule-hair-dark` *(SP-03 twin)* | — (the plank's hair is charcoal at 10%, **1.015 / 1.000 / 1.011** here) | off-white at 12% | **1.442** | **1.447** | **1.419** |
| `--rule-mid-dark` *(SP-03 twin)* | — (the plank's mid rule is `#2C2926`, **1.141 / 1.000 / 1.159** here) | `#F4F0E8`, solid, 1.5px | **11.153** | **12.722** | **14.745** |
| `--rule-strong-dark` *(SP-03 twin)* | — (the plank's double rule is 2px charcoal + 1px at 18%) | 2px `#F4F0E8` over 1px off-white at 18% | **1.720** | **1.750** | **1.735** *(the under-line)* |
| state fill, dark twin *(SP-05)* | — (the plank's fill `#F4E6E0` is a **10.408:1** near-white blob on the desk) | `#473C37` — terracotta at 16% over the rails | — | **1.356** | — |
| hover step *(SP-06)* | `--bg-hover` `rgba(196,165,123,.06)` = 1.042:1 | the second sheet on the paper; the next charcoal on the chrome | **1.141** *(desk→rails)* | **1.159** *(rails→well)* | **1.097** *(sheet→second sheet)* |

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

**Section heads & rules.** On the sheet these are the planks' — the 1.5px charcoal section rule,
the hairline row rule, the double rule at movement rank — and C adds nothing to them. **On the
chrome they are not rules at all until they are twinned:** all three plank weights are hardcoded
charcoal, and charcoal on C's own grounds measures **1.141 / 1.000 / 1.159** (mid) and
**1.015 / 1.000 / 1.011** (hair) on desk / rails / well — on the rails, literally the ground's
own colour. C therefore spends the plank's dark twin set (`--rule-hair-dark`,
`--rule-mid-dark`, `--rule-strong-dark`, and the dark state fill), whose figures are in the
table above. This is not a C invention: the weights belong to SP-03 and the twins are declared
there. What is C's is the bill for spending them. That is the
honest shape of this direction: C answers the chrome, and the page is answered by the work all
three lanes share. Where the reported complaint lives — 76.4% of the rich document's type at
8-12px — C closes it only through SP-01, which is true of B as well and which A goes further
than. On the rails the same devices are redrawn in the dark register: the running index's label in `#B9AC9B`, its names in `#F4F0E8`, the current
row's clay edge unchanged, the Strata marks in clay and sage instead of pearl (pearl at
`#E5E2DD` on charcoal would be a second light, not a mark).

**Spine.** `#2C2926`, no right border — the paper's clay rule is the edge. Put down, the seven
marks, the running index and the in-hand block all keep their positions and sizes; the in-hand
box loses its filled panel and takes a 12%-off-white hairline, so the timer stops outweighing
the four places the document goes (F08).

**Margin.** The same charcoal. The whisper, "IN THE MARGIN", "+ NOTE" and the two chips are
unchanged in shape; the chips lose their paper fill and become outlined in 12% off-white, with
the money chip keeping a clay left edge (F07, F21). The margin's own section rule takes
`--rule-mid-dark` — the register's primary ink, **12.722:1** on the rails — because at the
plank's charcoal it was 1.000:1, and its item rows take `--rule-hair-dark` at **1.447:1**.

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

### Closed by the planks (all three lanes)

Identical to A's and B's list — SP-01 (F11, F12, F13, F14, F21, F22) · SP-02 (F16) · SP-03 (F18)
· SP-04 (F02 contrast half, F03 stamp hole) · SP-05 (F01, F02, F03 in part) · SP-06 (F17) ·
SP-07 (F06) · SP-08 (F07, F08) · SP-09 (F24). C's stylesheet now carries them, so C's own figures
show them; it did not in v1, which is why v1's table claimed findings its preview did not close.

### Closed by Direction C, over and above the planks

| F-id | How C addresses it |
|---|---|
| F05 | The grounds become two registers **12.16:1** apart, plus a second sheet stock at 1.097:1 — the largest separation any lane proposes. |
| F06 (beyond the plank) | The drawer is not merely given a ground but a *well*: `#201D1B`, 1.322:1 under the desk and 16.08:1 from the sheet. |
| F07, F08 (beyond the plank) | The rails are charcoal against a paper sheet — 13.87:1, where the plank alone would give a paper-on-paper step. |
| F23 | The one ground with value contrast stops being a mobile-only accident and becomes the system, in the working shell rather than in a client preview. |

### Not addressed by C

F01, F09, F10, F15, F19, F20, F25. C does not touch the sheet's own fills, texture or imagery,
and its answer to the red-letter zone (F09) is that the paper is now the only lit thing on the
screen — which the critic is right to call an avoidance rather than an answer. On the sheet, C is
the planks and nothing more.

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

**I151 / contrast.test.ts — C breaks it, twice, and the fix is a required test extension.** This
is C's largest canon debt and v1 understated it as "the ground list gains two entries".

1. **`parseTokens` is last-wins over the whole file** (`contrast.test.ts:47-53`:
   `/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g`, `Map.set`), and `inkTokens` is *every*
   token whose name ends in `-ink`, asserted ≥4.5:1 on every **light** ground. Ported to
   `globals.css` under the names the mock uses, `--c-night-quiet-ink: #F4F0E8` would be measured
   on `#FCFAF6` (≈1.1:1) and `--c-clay-quiet-ink: #C4A57B` at 2.18:1, and the suite fails hard.
   The `quiet`-in-the-name convention is `research/contrast-check.mjs`'s, not the shipped test's.
2. **The `.doc-on-dark` scope C's cost recommends is worse, not better**: a
   `.doc-on-dark { --color-clay-ink: #C4A57B; }` block in `globals.css` *overwrites the parsed
   value of the real token*, so the suite would then measure clay-ink as `#C4A57B` on paper and
   fail. `.doc-room-lifted` (globals.css:748-753) escapes this only because its override is
   `var(--color-charcoal)`, not a hex.

   **The strategy C must ship**, therefore: the dark register carries **no `-ink`-suffixed token
   names at all** — `--doc-dark-primary`, `--doc-dark-muted`, `--doc-dark-clay` — and
   `parseTokens` gains a light/dark split so a token declared inside a dark scope is measured
   against the dark grounds. That is a change to the test's parser, not to its ground list.

**The base-pigment guard widens, and that is a real cost.** `contrast.test.ts:236` ("finds no
base pigment spent as text anywhere under `src/`") exempts exactly five files
(`DARK_GROUND_SITES`, :221-227). C spends `--color-clay`, `--color-terracotta`, `--color-sage`
and dusty blue as text in `doc-spine.tsx`, `margin-rail.tsx`, `studio-drawer.tsx`,
`desk-roster.tsx`, `desk-contents.tsx` and the running index — six more files, taking the list
from **five to eleven**. At eleven entries an exemption list is close to not being a guard; the
honest framing is that C should replace the file list with a scope check (does this usage sit
inside a `data-dark-register` subtree?) rather than lengthening it. Sideways, worth saying out
loud rather than benefiting from silently: `TEXT_FORMS` only matches `clay|terracotta`, so C's
sage and dusty blue on dark are unguarded in either direction.

## Cost

**Files.** `globals.css` (three chrome grounds, the dark-register palette, the edge rule) ·
`components/document/{doc-spine,margin-rail,studio-drawer}.tsx` (each hardcodes its own
`bg-[rgba(...)]` today) · `desk-contents.tsx`, `desk-roster.tsx` and the desk route's own wrapper
for the scoped ground and the inset sheet · `mobile/mobile-bar.tsx` (the well) · every component
that prints an ink inside the three chrome regions — the running index, the shelf rows, the
margin chips, the in-hand block, the drawer items — because each has to choose a register.

**The test work, priced.** `lib/document/__tests__/contrast.test.ts` needs a **parser change**
(a light/dark split in `parseTokens`, so a dark-register token is measured against dark grounds)
and a decision about `DARK_GROUND_SITES` going from five files to eleven — see the canon check.
Call it **1 day**, and it is not optional: without it the suite is red the day C lands.

**The three rooms, as a follow-on.** `/library`, `/people` and the ledger sheets stay on paper in
this proposal. If the team later wants them dark, that is a second piece of work, not a token
flip: `/people` alone carries 78 pearl border-sides and 20 white card backgrounds tuned for a
cream ground, and none of the three is mocked in this deck. **+3-4 days and three rooms to draw**,
priced here so the ruling on C is a ruling on the chrome and the desk, not on the whole app.

**Accepted, with the note it deserves: those three rooms do change today.** Keeping them on
paper is not keeping them untouched. The drawer crosses every route and today it is
`bg-[var(--bg-surface)]` = `#FFFFFF` (`studio-drawer.tsx:289`); C makes it `#201D1B`, so
`/library`, `/people` and the ledgers gain a **16.077:1** charcoal well along the bottom edge of
a cream room, and **no figure in this deck draws it**. It is much the cheaper trade — the
alternative was v1's whole-app inversion — and it is the price of C's one true claim, that the
drawer is the piece of chrome that crosses every route. But a heading that reads "keep paper"
should not be read as "unchanged", and if the team wants to see it before ruling, the missing
artifact is one `/library` crop with the well.

**The register conversion is not an ink problem.** The tail below is the one C already names;
the wider version is that **every plank token needs a dark twin, not only every ink**. SP-03's
three weights and SP-05's fill are all hardcoded charcoal or near-white, and on C's grounds they
read 1.000-1.159 (the rules) and 10.408 (the fill, a near-white blob on the desk). C ships the
twin set — four more tokens and the selectors that choose between them, inside the same 4-5
days as the ink work, since it is the same sweep through the same chrome components.

**The sweeps.** C rides on SP-01 (1,749 literals / 252 files) and SP-03 (502 / 172) exactly as
A and B do; neither is C's own work.

**Rough size.** C's own work **4-5 days**, plus the test day, plus the planks. The risk is in the
tail: the dark register has to be complete, or one unconverted `text-[var(--text-muted)]` inside
the spine is a **1.505:1** line nobody can read — and one unconverted plank *rule* inside the
same spine is a **1.000:1** line nobody can see. The failure is silent in both directions.

**Reversibility.** High as tokens, medium in practice: reverting the grounds is one commit, but
the register choice scattered through the chrome components would want reverting too.

## Refuses

C does not touch the type scale, the rule weights on the sheet, the FF&E line, the red-letter
zone's fill, the status vocabulary, or any imagery; it adds no texture; it does not tint the
paper; it does not darken the paper (the sheet is the shipped `#FCFAF6` and stays there); it
offers no night mode, no toggle and no theme switch — C is one appearance, not two; and it does
not ask for the elevation amendment, which it argues against.

## Mock index

All four lanes are drawn from the same markup; only the lane class and the caption differ.

- `c-m1-desk-1440.html` — the desk at 1440. Greeting, acts and whispers printed on the charcoal
  desk; the roster and the studio index on one sheet **inset by 120px on each side**, with the
  2px clay rule down its left edge; the drawer as the well below. **Four of the desk's six stage
  groups, in the desk's real order**; `BRIEF · 5` and `DIRECTION · 3` are cropped and the
  figcaption says so. Pairs against `today-m1-desk-1440.html`.
- `c-m2-doc-rich-1440.html` — the document at 1440. Spine and margin charcoal, drawer in the
  well, the paper between them with a clay rule on both edges; every mark and chip on the rails
  redrawn in base pigments. On the sheet, what differs from today is the planks. The Schedule
  block renders the specimen's phase-4-of-6 state; today's capture shows the composer, because
  the local project has no phases.
- `c-m4-strip-360.html` — one column, six specimens. On the sheet the planks do the work; the
  drawer segment is the only cell that shows the register the chrome moves to.
- `c-m5-desk-390.html` — the mobile desk, sheet inset by 14px, with the bar dropped to the well
  so two charcoals stay apart. Drawn with F24 and the roster row's act/need collision assumed
  repaired — layout defects no direction here fixes.

---

## Critique dispositions (v2)

| D | Disposition | One line |
|---|---|---|
| D18 | **fix** | The inversion is scoped to the drawer, spine, margin and the `/desk` ground; `/library`, `/people` and the ledgers keep paper and take only the dark drawer, and darkening them later is priced as +3-4 days and three rooms to draw. |
| D19 | **fix** | The canon check now names both mechanisms (last-wins `parseTokens`; the `.doc-on-dark` override being worse) and commits to the strategy — no `-ink` suffix in the dark register, plus a light/dark split in the parser — priced at 1 day in Cost. |
| D20 | **accept, priced** | The six files are named, the exemption list going 5 → 11 is stated as a guard being widened rather than extended, the scope-check alternative is proposed, and `TEXT_FORMS` not matching sage or dusty blue is said out loud. |
| D21 | **fix** | `.sheet-on-desk` is inset by margin for lane C — 120px at 1440, 14px at 390 — so the sheet edge and the clay rule are in M1, M2 and M5; previews re-shot. |
| D22 | **fix** | C's stylesheet now inherits the PLANKS block, so its figures show the floors, the muted inks and the rule weights; the doc states plainly that on the sheet C is the planks and nothing more. |
| D23 | **fix** | The thesis is rewritten around the five charcoal sites `contrast.test.ts:221-227` names: above 1180 the only charcoal a designer meets is a client preview. |
| D24 | **fix** | The cap is 0.1738 and the floor 0.2768, with the two expressions shown. |
| D05 | **fix** | The rail "from" figures name their grounds (1.053:1 vs the ground, 1.081:1 vs the paper) and both margin tiers. |
| D29 | **fix** | C carries the planks; `today` is the only unplanked lane. |
| D30, D31, D32, D33 | **fix** | Real stage order with the two omissions captioned; the F24 caption on M5; `SPEC THE 3 UNSPECIFIED →` restored as the filled act; the Schedule-specimen caveat added. |
| D39 | **fix** | The findings table is split into plank-closed and C-closed, and C's own column is four rows, not nine. |

---

## Critique dispositions (v3)

The v2 re-read's new defects, D40-D49, as they touch Direction C and the planks.

| D | Disposition | One line |
|---|---|---|
| D42 | **fix** | The planks' rule tokens get dark twins, declared in SP-03 and spent by C: `--rule-hair-dark` (off-white at 12% — **1.442 / 1.447 / 1.419** on desk / rails / well), `--rule-mid-dark` (the register's primary ink, solid — **11.153 / 12.722 / 14.745**) and `--rule-strong-dark` (2px of that ink over 1px at 18% — **1.720 / 1.750 / 1.735**), plus a dark state fill `#473C37` at **1.356:1** against the rails, where the plank's `#F4E6E0` was a **10.408:1** near-white blob. The figures they replace are in the same table: charcoal on C's chrome is **1.141 / 1.000 / 1.159** and **1.015 / 1.000 / 1.011**. C's Cost now says the register conversion is not an ink problem, and prices the twins inside the same 4-5 days because it is the same sweep through the same components. |
| D46 | **accept, with the note** | `/library`, `/people` and the ledgers keep paper, and they still change: the drawer they all carry goes `#FFFFFF` → `#201D1B`, a **16.077:1** charcoal well under a cream room, and no figure in this deck draws it. Stated in Cost as the price of C's "the drawer crosses every route" argument, with the missing artifact named — one `/library` crop. |
| D47 | **fix** | `direction-c.css`'s header now prints **0.1738** and **0.2768**, matching the direction. One edit; the stylesheet is the artifact a reviewer greps. |
| D43 (plank) | **fix** | C's SP-06 value is the second sheet on the paper — **1.097:1**, and the floor for the whole plank — and, on the chrome, the next charcoal the register already declares: desk→rails **1.141:1**, rails→well **1.159:1**. The plank now promises 1.09 and prints what each lane gets. |
| the critic's two self-corrections | **carried** | The type sweep is **1,749** literals across 252 files and SP-01's mono denominator is **1,029**; C's Cost prints the first and rides on both. |
