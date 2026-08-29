# FINAL — the clickable mockup, `mock/final/index.html`

MB, the builder. W4, 2026-08-29; **W4b fix pass by MB2, a fresh seat, 2026-08-29** -- see
"Review responses" at the foot, which answers every R-nn and RF-nn in
`mock/final/REVIEW.md`. The file is the proposal running: three frames on one
stage, all in the DOM at once, each a real scroll container, each with its own observers
rooted at itself. Nothing switches screens; the lens is a function of scroll, everywhere.

Written against `mock/final/SPEC.md` (every C.\* section) and `source/proposal.md` (§3 the
mechanics table, §4 organ by organ, §5 the state machine, §6 the frame budget), on the data
in `source/specimen.md`.

---

## 1 · The scroll mechanism, and why

**Chosen: a sticky band over a sentinel that reserves the open height, plus two
IntersectionObserver bands rooted at the frame driving a synchronous arithmetic resolver.**

Four separable decisions, each with the thing it was avoiding.

**(a) The lens line opens and closes off a SENTINEL, never off `scrollTop`.**
`#sentinel-<frame>` is the block that holds the letterhead. It carries
`min-block-size: var(--lens-reserve)` — a *declared* 225px at the desktop tiers, 247px at
390 — and the 56px band sits immediately below it, `position: sticky; top: 0`. One
`IntersectionObserver(cb, { root: frameEl, rootMargin: '0px', threshold: 0 })` watches the
sentinel: intersecting means the letterhead is in frame and the lens is open; not
intersecting means the band has pinned and the lens is closed. Because the sentinel's height
is what reserves the open state, **the pin displaces nothing** — the band's box is 56px
before the pin and 56px after (proposal H5(a)), and the arithmetic
`225 + 56 + 24 (--doc-region-gap) + 14 (RegionRule 6 + head padding 8) = 319` is SC1 on the
nose.

*Rejected: a `scroll` handler reading `scrollTop` and toggling a class.* SPEC C.7 item 2
forbids it, and rightly: a scroll handler on a scaled `overflow` container fires at a
different cadence than paint, so the band's state lags the band's position by a frame and
the seam visibly stutters at the boundary. The sentinel is a compositor-level fact.

*Rejected: a scroll-driven animation timeline (`animation-timeline: scroll()`).* It reads
beautifully and it cannot publish `data-lens-open` — the state contract in C.5 has to be an
attribute a prober can read, and a scroll timeline has no state, only a progress value.

**(b) The density engine is two observer bands, and a synchronous resolver over the same
two bands.** `focus(frame)` builds
`PROMOTE = [0.08, 0.38]` (a narrow band 8%–38% down the frame) and `HOLD = [0.00, 0.88]`
(a wide band), both as `IntersectionObserver` `rootMargin`s **rooted at the frame**. The
observers are the *event source*: they fire when a boundary is crossed, without a scroll
handler and without polling. `resolve()` is the *resolver*: it recomputes both bands
arithmetically from `scrollTop`, `clientHeight` and an `offsetTop` chain, and picks the
topmost region in the promote band; failing that, the current region if it is still in the
hold band; failing that, the geometrically nearest — so **it is never null** (SC12).

The asymmetry between the bands is the hysteresis: a region is promoted by entering a narrow
band near the top of the frame, and can only fall once it has left a much wider one. Measured
over a 20-step slow scroll at `--motion-scale: 4`, every region changes `data-density` at
most once per step, and the sequence is monotone — `condensed -> full -> reading` and never
back, because a region that has been committed is never taken back (L-5).

*Rejected: one band with a single threshold.* That is the oscillation SPEC C.8 item 7 exists
to catch: a region sitting exactly on a single boundary flips on every sub-pixel scroll.

*Rejected: `root: null`.* Explicitly, and this is the trap the SPEC names. Each frame is a
`transform: scale()`d `overflow-y: auto` box laid down a long page; a viewport-rooted
observer reports geometry that has nothing to do with what a reader of *that frame* sees, and
every number it produced would look plausible in a screenshot and be wrong.

*Also rejected: `getBoundingClientRect()` for the resolver's arithmetic.* Under
`transform: scale(s)` every rect is scaled, so a band expressed in unscaled pixels and a rect
measured in scaled pixels silently disagree by `s`. The resolver walks `offsetTop` up to the
frame instead (`topIn()`), which is transform-independent.

**(c) A region's height changes exactly once, entirely below the frame's bottom edge.**
`mountAhead()` commits a region's body when its top comes within **240px of the frame's
bottom edge** and never uncommits it (L-4, L-5). Until then the body is a declared reserve —
112px where the region carries a standing exception, 68px where it does not — of bare paper
under the head, the count line and the one leader act. Because the commit happens off screen
and nothing above it moves, **measured CLS over a scripted 30-step scroll from 0 to the foot
is 0**, in both the animated and the reduced register.

`mountAhead()` commits **one region per pass and re-measures**, because a region that opens
pushes the next one down: a single sweep over the closed geometry would open four regions for
a threshold only the first of them meets.

**(d) `settle()` is synchronous and `window.__lensSettled()` is a promise.** Neither the
shooter nor the prober ever waits on a velocity gate or a `setTimeout`: `settle()` forces the
settled state for the frame's current offset in one call, and `__lensSettled()` resolves after
every frame has settled and two animation frames have passed.

---

## 2 · Deviations from SPEC, one row each

| C.\* | What I did instead | Reason |
|---|---|---|
| **D-1 · lens.css §1 (via C.4)** | `.lens-line { block-size: var(--lens-height) }` is **not adopted as a layout driver**. One labelled override, `.lens-band.lens-line { block-size: 56px }`, holds the band at its declared height at every offset; `--lens-height` is published by JS as the header organ's *occupancy of the frame* (319px open, 56px closed). | lens.css's own header says "the band itself never resizes (56px before the pin, 56px after); what condenses is the STACK above it". Driving `block-size` off `--lens-height` would resize the band 319 -> 56 on the pin — the 263px layout shift that proposal H5 exists to prevent, and the exact opposite of what the token describes. The published value is unchanged; only its role is. |
| **D-2 · lens.css §3, L-2** | The reading window travels on `transform: translateY(var(--lens-reading-window-y))` with `inset-block-start: 0`, not on `inset-block-start`. | Measured: driving its y with a layout property files a `layout-shift` entry on every scroll frame — it was the whole of an otherwise-zero 0.00022 CLS. L-2's promise is "position-linked, 1:1 with scroll", which a translate keeps exactly, on the compositor, moving nothing. |
| **D-3 · C.2, the 1280 frame** | `#frame-1280`'s rail is **136px and prints every label as a word**, not a "glyph rail". The margin is a sheet behind a printed `MARGIN &middot; 7 &middot; 1 OVERDUE` tab, as C.2 requires. | The ratified proposal §4 refuses a wordless rail by name — "**No wordless rail.** SP-11 offers two branches and this document takes the first" — and proves the tier's arithmetic (`1180 - 136 = 1044 >= 1040`, so the paper's measure is unchanged). C.2's "glyph rail" is the pre-ratification shape. The proposal is the design; C.2 is the container. |
| **D-4 · C.5, `data-density`** | A region she has passed is published `reading`, not `full`. | Proposal §5 (`reading`) says "every region she has passed stays `full`", which cannot coexist with SC11 / C.5's "exactly **one** region per frame carries `data-density="full"`". Resolved for SC11, which is the harder promise; `reading` is C.5's own middle value and `--density-ink-reading` is its ink. Nothing is lost — a passed region keeps its whole body and its acts. |
| **D-5 · C.4, kit.css** | `tokens.css` and `lens.css` are inlined **verbatim**; `mock/kit.css` is **not** inlined. Its class vocabulary (`.paper`, `.spine`, `.region-head`, `.region-rule`, `.ffe-row`, `.stamp`, `.strata-mark`, `.seam`, `.mono`, `.eyebrow`, `.act`) is reproduced by name and by value in the page's own stylesheet. | kit.css carries `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` at `kit.css:148` and `:root[data-theme="dark"] { ... }` at `:200`. Both are specificity (0,2,0); `tokens.css`'s register is a bare `:root`, (0,1,0). Inlined, kit.css would **win** in a dark-scheme viewer and flip `--doc-paper` to `#211E1B`, `--text-primary` and the whole R126 register with it — breaking NG4, SC7 and the contrast census, invisibly, for exactly the readers most likely to open the Artifact. The Life Review chassis made the same call (its `index.html` contains zero `prefers-color-scheme` rules). |
| **D-6 · C.3, the letterhead's Phases fold and timer** | Both are in the letterhead as C.3 asks. The **in-hand timer prints in the vitals row** (`IN HAND TODAY 0:47`) rather than as its own row, and the **Phases fold is closed at rest**. | Proposal §4's header table *deletes* `PHASES &#9656;` and moves the in-hand row to the rail's doors, worth −54px. C.3 is binding for the mockup's data, so both stay; but the letterhead's budget is 148 + 21 vitals = 169px and SC1 = 319px depends on it, so the timer rides the vitals line (0px) and the fold costs its 20px trigger only. The fold's six phases open on press, below the letterhead rule, at scroll 0 — a user-initiated change, never a scroll-driven one. |
| **D-7 · C.6, "a different and **narrower** band demotes it"** | My demote band is **wider** (`HOLD = [0.00, 0.88]`) than the promote band (`[0.08, 0.38]`). | See §7 "targets I believe are wrong". A demote band narrower than the promote band is not hysteresis: a region promoted on entering the wide band would be demoted the same frame for not being in the narrow one, which is the oscillation C.8 item 7 forbids. Hysteresis requires the *release* threshold to be laxer than the *capture* threshold. Everything else about the row — two bands, two observers, one factory, rooted at the frame — is as written. |
| **D-8 · C.5, `data-lens-state` on `#frame-390`** | `#frame-390` publishes `mobile` at every offset except while the pen is down (`editing`). | C.5 lists `mobile` as a lens state and 390 is the state proposal §5 calls "mobile — 390, one column". Publishing `rest`/`reading` there as well would make `mobile` unreachable and the value dead. `rest` at 390 is still readable off `scrollTop === 0` and off `data-lens-open="true"`. |
| **D-9 · C.6, Rest and `data-motion`** | **Rest** also returns `data-motion` to its OS-derived base (`reduced` if `prefers-reduced-motion` matches, else `normal`) and clears the inline `--motion-scale`. | C.6 requires Rest to leave "nothing left over" and C.5 puts `data-motion` in the attribute contract, so a Rest that left `slow` standing would fail probe item 6's byte-equivalence check. Returning to the OS base rather than hard-coding `normal` keeps the reduced-motion contract honest on a machine that asks for it. |
| **D-10 · §4, the margin's two groups** | The seven margin items keep their DOM position; what lifts is the **group heading's name and count**, and the printed empty line. Each card prints its own anchor line (`TIME &middot; BESIDE PIECES`), which is §4 item 3 exactly. | Physically moving cards between the two groups on every reading-stop change is a layout change inside a column that is on screen — a `layout-shift` entry per move, and probe item 8 wants 0. The heading's six possible names and its two possible counts are all pre-printed in one fixed box and swapped by **visibility**, which files no shift. What is lost is that a card does not literally travel; what is kept is that "the margin lifts, it does not filter" and that every card is legible from a still. |
| **D-11 · The one crop, three times** | One JPEG, base64'd once into a single `--crop-heirloom` custom property, painted on the catalog-linked *Heirloom oak dining table* line — which exists once per frame, so three elements carry it. | C.1 says "**one** product crop inlined as a data URI". There is one data URI and one catalog-linked line per paper; the paper is mounted three times because C.2 requires three frames. |
| **D-12 · The paper's foot margin** | `.paper` carries `padding-bottom: 520px` (460 at 1280, 560 at 390). | Probe item 14 asks that a rail press land the named region head at the top of the frame. Without a deep foot, **The record** — the last stop — cannot reach 72px because the document ends first, and the navigator lands at 301px and lies about where it went. With it, all six stops land at exactly **y = 72**. A sheet of paper ends in a margin, not at its last word. |

---

## 3 · What the mock does not claim

The specimen (`source/specimen.md`) gives the household, the studio, the place, the dates,
the four room line-counts and their state splits, the two red-letter exceptions with their
owners and dates, `PO-2026-0418` (Sturdy Oak Woodworks, Dodgeville WI, dining table + 6 side
chairs, $14,880, sent 2026-08-11, 14 days no ack, 8-week lead), the damaged brass-and-oak
console from Fond du Lac Ironworks (delivered 2026-08-19, top panel gouged, claim drafted not
filed, carrier window closes 2026-08-26), the Hartland wool rug and walnut nightstands, all
nine money figures, the hours, and the in-hand timer. Every one of those appears verbatim.

Everything below is **invented by MB**, in the specimen's register (Wisconsin and Illinois
places, real-sounding makers, plain Midwest nouns). None of it is a fact about anything.

**Makers and vendors invented** (the specimen names only Sturdy Oak Woodworks, Dodgeville WI
and Fond du Lac Ironworks): Baraboo Upholstery Works · Blue Mounds Joinery · Oconomowoc Rug
Merchants · Racine Lamp Company · Spring Green Textiles · Whitewater Metal Shop · Evanston
Marble Works (IL) · Prairie du Sac Leather · Galena Cabinet Shop (IL) · Mineral Point Pottery
· Kettle Moraine Weavers · Cedarburg Glassworks · Rockford Brass & Iron (IL) · New Glarus
Woodturning.

**FF&E line names and prices.** The specimen gives counts and states, not lines. All 36 line
names and all 36 prices are invented, except that the dining table ($6,480) and the six side
chairs ($8,400) are split to total the specimen's **$14,880** exactly, and the four room
state splits match the specimen line for line (Living 11 ordered / 2 in transit / 1 damaged;
Dining 8 ordered of which 6 delivered; Primary 7 ordered / 2 awaiting the client, overdue;
Mudroom 3 ordered / 2 not specified).

**PO numbers other than PO-2026-0418**: PO-2026-0402, -0405, -0407, -0409, -0411, -0413,
-0414, -0416, -0417. Invented, in the specimen's own numbering shape.

**Receiving location** "Waukesha", and the receiving dates on the six delivered dining lines.
Invented.

**The schedule's six dated rows** other than the install (Tue 2026-09-15), the COM date
(2026-08-22) and the carrier window (2026-08-26): "Case goods to receiving, Waukesha"
2026-09-02, "Site walk with the trades" 2026-09-08, "Punch list and handover" 2026-09-19.
Invented.

**The two settled approvals** — "Dining room — finish sample, white oak" (authored 2026-07-28,
approved 2026-08-01) and "Whole house — hardware finish, unlacquered brass" (authored
2026-06-30, approved 2026-07-06). Invented; the specimen gives only the two overdue ones.

**The six phases and their dates** behind the letterhead's `PHASES` fold. Invented; the
specimen gives only "phase Procurement & Orders (4 of 6)".

**The six close-out items** under *Closing the book* (Warranty file · Care card for the
household · Maker letters · Photography · Final invoice · Handover book). Invented; the
specimen gives no care content, and the proposal's own value line is `0 OF 6 CLOSED OUT`.

**Four of the five rows in The record.** The specimen gives Okonkwo kitchen, Middleton WI,
completed 2026-08-14, punch list pending. Halvorsen porch (Maple Bluff WI, 2026-05-30), Ives
loft (Milwaukee WI, 2026-03-11), Danforth farmhouse (Mount Horeb WI, 2025-11-22) and Sandoval
townhouse (Evanston IL, 2025-09-05) are invented. "12 complete" is the proposal's own count.

**The margin's seven items' wording**, the three file-change lines, the two drafts and the two
handoffs ("Leah B., receiving and claims, Waukesha"; "The workroom, Baraboo, holding on COM").
The *kinds* (all MONEY and TIME) and the anchoring (three to Pieces, four to the whole job)
are F66's and the proposal's; the sentences are MB's. The `$29,640 specified, not ordered`
figure is arithmetic on the specimen's own numbers ($171,240 − $141,600).

**The first-touch note's sentence** in the margin, and the drawer's `THE STUDIO ·
MIDDLEWEST STUDIO · MADISON` crumb and its `K` avatar.

**Which line each of the five catalog crops sits on** (RF-01). `mock/img/` holds five
photographs; they are stock, they are not photographs of anything in this job, and the mapping
is MB2's, by best visual fit: `heirloom-thumb.jpg` -> *Heirloom oak dining table* ·
`live-edge-coffee-table.jpg` (which is in fact a wooden side chair, whatever its filename says)
-> *Side chairs, set of six* · `pendant-lamp.jpg` -> *Pendant, hand-blown glass* ·
`planter-set.jpg` -> *Ceramic vessel, large* · `heirloom-oak-dining-table.jpg`, the wide dining
scene, cropped low at `background-position: 50% 92%` onto the rug it stands on -> *Dining rug,
flatweave*. The other 31 lines keep the "no catalog crop on this line" glyph, which is the
truth about them.

**Two discrepancies between the proposal and the specimen, resolved for the specimen** (C.3
says the data is the specimen's, verbatim):

1. The proposal's Pieces value line reads `36 LINES &middot; 1 DAMAGED SEP 26`. The specimen
   says the carrier window closes **2026-08-26** ("tomorrow", against a today of 2026-08-25).
   The mockup prints **`36 LINES &middot; 1 DAMAGED AUG 26`**. `SEP 26` appears to be a
   transcription slip carried through §3, §4 and the ladder table.
2. The proposal's Pieces leader act reads `SPEC THE 3 UNSPECIFIED`. The specimen says the
   Mudroom has **2** unspecified lines, and 14 + 8 + 9 + 5 = 36 leaves no third anywhere. The
   mockup prints **`SPEC THE 2 UNSPECIFIED`**.

**One register decision worth naming.** Six FF&E states, four stamp fills. `ORDERED` (clay),
`DECISION DUE` (golden hour) and `DAMAGED` (terracotta) are struck as filled stamps — the
three tinted recipes tokens.css ships, at ~1.18:1 with a 1.5px pigment border and a charcoal
word. `IN TRANSIT`, `DELIVERED` and `NOT SPECIFIED` print as a plain 11px mono word in
`--text-faint`. Adding a fourth and fifth stamp tint would be a new colour token, which C.4
forbids; sharing one tint across two states would break "no two stamps share an edge"
(R33/R34). The line it draws is legible in a still: **a stamp is a state that still owes her
something.** `--fill-anchor-tint` keeps its own R126 job — the anchored margin row.

---

## 4 · Motion — the house vocabulary, spoken not reinvented

Every duration in the file is written `calc(<base> * var(--motion-scale, 1))`. There are no
hard-coded durations, so every mechanic can be watched settle at 4x.

| What | Base · ease | Reduced form | Where it came from |
|---|---|---|---|
| L-1 · the sentence turns | out 90ms / in 150ms, `--ease-editorial` | printed in place, first frame | proposal §3, lens.css `.lens-sentence-*` |
| line 1 turns (the same grammar) | 150ms `--ease-editorial`, two absolutely-placed layers crossfading | in place | L-1 |
| L-2 · the reading window travels | position-linked, 1:1 with scroll, no duration | the bracket **steps** to the segment holding the stop, redrawn on settle — the one declared JS `matchMedia` amendment (§3) | proposal §3 |
| L-3 · a segment changes register, and a segment that yields its value prints its NAME | 150ms crossfade between two layers in one 15.4px box | the layer that is on is present, the other absent, first frame | lens.css `.lens-segment-value` + RF-02 |
| L-4 · a region ahead opens | **0ms, one commit, entirely below the frame's bottom edge** | identical — there was never a transit on screen | proposal §3 |
| L-5 · a region behind is never taken back | 0ms | identical | proposal §3 |
| L-6 · the rail head yields at s0 — the STAGE PHRASE only; the household name and the phase count stay printed and turn `--text-muted` | 150ms crossfade on the phrase, 150ms colour on the two that stay | absent/present at settle; the colour lands flat | lens.css `.lens-rail-head-line` + RF-02 |
| L-7 · the fold (the letterhead's Phases) | 300ms `--ease-editorial`, `grid-template-rows` 0fr -> 1fr + opacity | instant | the Life Review's own fold |
| L-8 · the pen goes down | 150ms, rule `--rule-hair` -> 1.5px `--color-clay-ink`, ground -> `rgba(196,165,123,.12)` | present and static | lens.css `.lens-row-editing` |
| L-9 · the lens settles | none — an arithmetic gate | identical | proposal §3 |
| L-10 · the press lands | `scroll-behavior: smooth`, 700ms jump lock | an instant jump; the landing offset is identical | proposal §3 |
| L-11 · the standing sheet opens | 200ms, `translateY(8px) -> 0` + opacity | in place, full ink, first frame | lens.css `.lens-sheet-panel` |
| a stamp inks — **once, never on re-entry** (R16/R31) | 260ms `--ease-editorial`, a `scaleX` fill wipe from the left; a stamp inside a closed fold or a condensed region waits | instant fill | R126, `globals.css:322-323` |
| hover on an act — the Scored Ink bead | pool `clip-path` to `circle(3.5px)` in 180ms; the score turns clay in 150ms | lands instant | R126 |
| press on an act | `translateY(1px)` over 70ms; flood `circle(140%)` over 200ms; label turns at 60ms | no drop, no flood | R126 |
| hover on an FF&E line — the ink-pool wash | the line's own state pigment, `circle(0)` -> `circle(150%)` **from the pointer**, 260ms in / 200ms out, `--ease-editorial` | the flat `-still` tint at three quarters of the alpha, no sweep, `--wash-paint` set by the same two triggers that set `--motion-scale` | R126, `--ink-x`/`--ink-y` on `pointermove` |
| the room sub-rungs open | `block-size` 0 -> 28px, 150ms | already open, first frame | lens.css `.lens-nav-room-rung` |
| the one ambient move — `doc-breath` on the active StrataMark, in the rail | 3s `ease-in-out` infinite, opacity 1 -> .62 | none (duration resolves to 0) | R126, `globals.css:271-282` |

**Reduced motion is one mechanism, not two rulesets.** lens.css already chose SPEC C.6's
second option and this file keeps it: `--motion-scale` is set to the identical literal `0`
from both triggers —

```
@media (prefers-reduced-motion: reduce) { :root { --motion-scale: 0; --wash-paint: var(--wash-still); } }
[data-motion="reduced"]                 {         --motion-scale: 0; --wash-paint: var(--wash-still); }
```

— and every duration in the file is a `calc()` over it, so both paths resolve to `0s` with
nothing to drift. Measured: **0 elements inside `#stage` report a non-zero transition or
animation duration** under the media query, and **0** under the dev-bar toggle. The two
registers print the same words; the still wash is a value change, not a word change.

**Zero hover-only affordances.** Every act is a printed word with a printed score at rest.
The wash and the bead are decoration on top of something already legible.

---

## 5 · What is in the mockup

**Three frames, one paper.** `#frame-1440` (1440x900, rail | paper | margin),
`#frame-1280` (1280x800, a 136px word-printing rail | paper | the margin as a sheet behind a
printed tab), `#frame-390` (390x844, one column, the charcoal mobile bar, the ladder in the
Sections sheet). Each is `overflow-y: auto`; the rail, the margin and the studio drawer are
sticky inside it, so scrolling the frame is scrolling the paper. `fit()` scales **down only**
(`s = Math.min(1, (innerWidth - 48) / native)`) and sets the wrapper height to `native * s`,
so a shoot at 1560 gets 1:1 pixels and no frame leaves a hole.

**The paper**, in mount order: the letterhead (40px Playfair title, the household, the
`PROJECT` stage plate, the 11px mono vitals carrying `IN HAND TODAY 0:47`, the Phases fold) ·
the 56px lens band, sticky, its two lines both single lines by construction · Client approvals
(the two overdue red-letter exceptions with their owners, plus two settled) · Schedule (a
drawn dates rule and six dated rows; install Tuesday 2026-09-15, three weeks out) · Pieces
(**all four rooms, 36 real lines**, one carrying the 48px catalog crop) · Money (all nine
figures) · Closing the book · The record (seven settled bars, no unfold hint on them) · the
colophon. At 1440 the paper runs **6004px** — six and a half screens.

**The rail**: `Put down` · a reserved 100px head (name, the seven-mark arc with `doc-breath`
on the active mark, stage phrase, `4 OF 6`) whose two text lines yield while the letterhead is
in frame · `--rule-mid` · a 443px ladder of six declared slots, each printing **one register**
— its ≤30-character value — with the four room sub-rungs opening *inside* the Pieces slot's
own fixed height · `--rule-hair` · `FILED WITH THIS JOB` and its four doors.

**The margin** at 1440: the first-touch note capped at two lines, `IN THE MARGIN · 7`, the
capture row, the composer, `BESIDE <stop> · N` with its printed empty line, `THE WHOLE JOB · 4`,
seven chips each printing its own anchor line, file changes, drafts, handoffs.

**The click map.** Every dev-bar button · the band's household (*to the top*) · `+3 MORE`
(the standing sheet, four exceptions each with its own act) · every ladder segment (the 700ms
jump lock, landing the head at exactly 72px) · every room sub-rung · the four doors · `Put
down` · the letterhead's `PHASES` fold · every margin chip (anchors and jumps) · the composer
and the two Mudroom spec inputs (the pen goes down: the row takes its clay rule and its flat
tint, the lens freezes, **no sibling changes and nothing dims**) · the 1280 margin tab · the
390 Sections and Margin sheets. `Escape` closes any sheet and returns focus to its opener.

---

## 6 · The C.10 checklist, signed off

- [x] **One file; no build; opens from disk.** `index.html`, 602,135 bytes (452,976 before the
  W4b fix pass; the five catalog crops of RF-01 are the whole of the difference). No `<link>`, no
  import map, no bundler. (`build-index.mjs` and `gen/` generate it because the same paper is
  mounted three times and a hand-copied third frame is a frame that drifts; nothing in them is
  needed to open the file.)
- [x] **Pure ASCII.** `LC_ALL=C grep -c '[^ -~\t]' index.html` -> **0**.
- [x] **Zero external requests; fonts and the one crop are data URIs.** `grep -c 'https://'`
  -> **0**; Playwright network census over the whole load -> **0** non-`file:`/`data:`
  requests, under `file://` and under `host-sim.mjs`.
- [x] **<= 2 MB target.** 602,135 bytes = 0.57 MB. The whole of it is accounted for:
  **fonts 203,852 bytes** of `mock/assets/fonts/fonts-data-uri.css`, copied verbatim as C.1
  requires -- of which the **DM Mono 300 face is inlined and never rasterised** (R-09: nothing
  in the file asks for weight 300; C.1 says copy the file verbatim and add no face, so it stays,
  and it is roughly a sixth of the six faces) -- and **five JPEG crops, 120,984 bytes raw /
  161,312 as base64** (RF-01). Everything else, all 36 Pieces lines times three frames included,
  is 237 KB of markup, CSS and script.
- [x] **Static markup + CSS paint the rest state with JS disabled.** Verified with
  Playwright `javaScriptEnabled: false` (`shots-mb/nojs-rest.png`): the letterhead, the band
  with `$17,500 OUT` and its sentence and both acts, the rail's six value lines and four
  doors, the margin, approvals at `full` and every stop below it condensed.
- [x] **Three frames, each `overflow-y: auto`, each with its own observers rooted at itself.**
  One factory, the frame passed in; three observer sets (one sentinel observer and two density
  bands per frame). No `root: null` anywhere in the file.
- [x] **`fit()` scales down only, never up.** `Math.min(1, ...)`; `transform: none` at s = 1.
- [x] **Vandersteen data verbatim; 36 real FF&E lines across all four rooms; every invention
  listed** in §3 above. Measured: `ffeRows1440: 36`, `rooms1440: 4`, `catalogCrops1440: 5`.
- [x] **`tokens.css` `:root` copied verbatim; only the four new families added; every new
  colour carries its computed ratio in a comment.** The file is inlined byte-for-byte;
  `--density-ink-full #4E4339 /* 9.22:1 on --doc-paper #FCFAF6 */`,
  `--density-ink-reading #5A4E43 /* 7.73:1 */`, `--density-ink-condensed #65594E /* 6.51:1 */`.
  The page's own stylesheet adds **no colour token**.
- [x] **`box-shadow` on exactly the three `--elevation-sheet` sites, by computed style;
  `drop-shadow` nowhere.** Computed census over every element: **3 site CLASSES, 29 ELEMENTS**
  (R-08 -- NG2's "three sites" is three kinds of surface, and both numbers should be quoted;
  per frame it is 7 margin chips, 1-3 sheet panels and 0-1 drawers). Margin chip x21, open
  ledger sheet x6, studio drawer x2 across three frames, **all** reporting
  `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`, nothing else non-`none`, `filter: drop-shadow`
  count **0**. Source grep: `grep -c 'box-shadow'` -> **1** (lens.css's `.doc-elevated`).
- [x] **The full C.5 attribute contract published in every state, including at rest.**
  `data-lens-state` · `data-region` · `data-density` · `data-reading-index` · `data-lens-open`
  · `--lens-height` · `data-motion`. All present in the static markup before init.
- [x] **Dev bar: seven buttons, `aria-pressed` live, every state reversible.** Measured: each
  of the six non-Rest states entered, contract asserted, Rest pressed, and the C.5 attribute
  snapshot across all three frames is **byte-identical to the rest snapshot** in all six cases.
- [x] **Reduced motion shares one selector list with the media query; no duplicated ruleset.**
  Both triggers assign the identical literals to `--motion-scale` and `--wash-paint`. Measured
  both ways: **0** elements animating.
- [x] **Every duration written `calc(<base> * var(--motion-scale, 1))`.** Swept the page's
  own stylesheet for a literal duration in a `transition`, `transition-duration`,
  `transition-delay`, `animation` or `animation-duration` outside a `calc()`: **one hit**, and
  it is `.ffe-row:focus-within > .row-wash { transition-duration: 0s }` — the keyboard-focus
  wash, which is deliberately *not* a sweep. A literal `0s` is scale-invariant (there is no
  mechanic there to slow), so it cannot hide a duration from the 4x prober. Every other
  duration in the file, including the 3s `doc-breath`, is a `calc()` over `--motion-scale`.
- [x] **Density: exactly one `full` region per frame; `data-reading-index` never null.**
  Measured at 0 / 400 / 1200 and across a 30-step sweep: one `full`, always; the rail's
  `data-reading-index` equals it at every sample.
- [x] **Hysteresis: two bands, not one; no oscillation at 4x.** Promote `[0.08, 0.38]`,
  hold `[0.00, 0.88]`. Over 20 steps at `--motion-scale: 4`, each region changes at most once
  per step and the sequence is monotone.
- [x] **Zero layout shift on condense — the sentinel reserves the open height.** Measured
  CLS over a scripted 30-step scroll from 0 to the foot at 1440: **0**, with an empty
  `layout-shift` source tally.
- [x] **`settle()` and `window.__lensSettled()` exposed; `window.__mockReady` set.**
- [x] **`__mockInit()` + `readyState` guard; whole body in `try`/`catch`; `host-sim.mjs`
  reports ready with zero errors.** `mockReady: true`, `consoleErrors: []`, `pageErrors: []`,
  `externalRequests: []`, `reExecuted: 1`.
- [x] **Delegated listeners only.** One `click`, one `keydown`, one `pointermove`, one
  `focusin`, one `focusout` on `document`; one `resize` on `window`; one `scroll` per frame.
  Zero per-row listeners across 108 FF&E rows.
- [x] **No hover-only affordance anywhere.** Every act is a printed word with a printed score;
  the wash and the bead sit on top of something already legible.
- [x] **Every move present in the mockup appears in the proposal's §3 grammar table; nothing
  animates that is not listed.** §4 above is the map, row by row.

---

## 7 · Targets I believe are wrong, with a better one

**C.6 / C.7 item 3 — "one band promotes a region to `full`, a different and **narrower** band
demotes it."** Backwards. If the demote band is narrower than the promote band, every region
promoted on entering the wide band is demoted in the same callback for not being in the narrow
one — which is precisely the oscillation C.8 item 7 is written to catch. Hysteresis is a
capture threshold that is *tighter* than the release threshold. **Better target:** "one narrow
band promotes a region to `full`; a different and **wider** band is what it must leave before
it can be demoted." Built that way (D-7).

**SC4 — "Rail utilisation (`inkPx / railHeightPx`) >= 70%." Both readings, plainly (RF-05).**
At 1440, scroll 0, after the W4b fix pass: **40.8% on the merged-ink reading** (343px of merged
visible text runs, in 18 runs, over an 840px rail) and **92.2% on the first-to-last-ink span**
(775/840). At scroll 400 and 1200 the merged reading is **44.6%** (374/840) and the span is the
same 92.2%. **The merged-ink reading does not meet the 70% threshold and will not**: the rail
is used end to end, and what is not ink is the whitespace between six one-line segments, which
is the peace Kody asked for, not a defect to be filled. Before the fix pass the same numbers
were 35.0% / 91.4% (294px, 15 runs); RF-02's printed segment names are the whole of the gain.
What DID change structurally (RF-05): `.ladder` is now `flex: 1 1 auto` inside a flex-column
rail, each slot carrying its declared extent as its flex basis AND its grow/shrink weight with
a 24px floor (143px on the Pieces slot, whose four room rungs open inside its own box), and
`.spine`'s bottom padding drops 96px -> 24px. The rail no longer scrolls itself at either
desktop tier -- measured `scrollHeight/clientHeight` 905/840 -> 840/840 at 1440 and 852/740 ->
740/740 at 1280 -- and the ladder takes 450px of the 1440 rail (was a declared 443px with slack
under it) and 358px of the 1280 rail (was 398px, which did not fit).

*The original argument, unchanged:* The proposal already names why
this number is soft (§4: `measure-layout.mjs:245-253` counts an element as ink over its whole
rect if it has a background *or a border*, and the ladder's slots are `--rule-hair`-bordered,
so the track reads as continuous ink whatever it paints). **Better target, and the one that
answers Kody's first sentence:** *distinct painted text labels in the rail at 1440/s0* —
today 18, after **12**. Counted off the running mockup at rest, walking the rail and skipping
anything at `visibility: hidden`, `display: none`, zero opacity or zero block-size:

```
PUT DOWN  ·  2 AWAITING . 1 OVERDUE 6D  ·  INSTALL SEP 15 . 3 WEEKS
36 LINES . 1 DAMAGED AUG 26  ·  $17,500 OUT . $12,300 UNDRAWN  ·  0 OF 6 CLOSED OUT
12 COMPLETE  ·  FILED WITH THIS JOB  ·  Plan room  ·  Spec book  ·  Mood boards  ·  Call sheet
```

Twelve: `Put down`, six segment value lines, the doors' heading and four door names — with
the head's three lines yielded (L-6) and the four room rungs at `block-size: 0`. Both numbers
should ship; only the second one gets quieter when the design gets better.

**C.8 item 12 — "`scrollWidth <= clientWidth` on `#frame-390` and on every descendant that
could overflow."** All three frames report `scrollWidth - clientWidth = 0`, which is the part
that matters. Three classes of descendant will always report a positive delta and none of them
is visual overflow: (a) the band's two lines, whose
`white-space: nowrap; overflow: hidden; text-overflow: ellipsis` *is* the height contract the
proposal ships ("Its height is declared, never measured... both lines are single lines by
construction"); (b) `.rh-quiet`, the visually-hidden 1px sr-only line on a condensed region's
head; (c) `.act .da-pool`, the Scored Ink pool's shipped `inset: 2px -5px 5px`. **Better
target:** assert `scrollWidth <= clientWidth` on the three frame roots and on every element
whose computed `overflow-x` is `visible`, excluding elements with `text-overflow: ellipsis`
and elements clipped to 1px.

**C.3's "at least 16 real lines" against the specimen's 36.** Not wrong, but worth saying:
the mock prints all 36, because a Pieces region that ends after 16 lines cannot show L-4's
`112px -> 1,840px` commit or the four-room head rhythm the proposal spends a plank on. The
larger number is free (the file is 0.43 MB) and it is what makes the frame budget legible.

---

## 8 · The three prints, verbatim

**v1 (W4a, before the fix pass):**

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && wc -c index.html
  452976 index.html
```

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && LC_ALL=C grep -c '[^ -~\t]' index.html
0
```

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && grep -c 'box-shadow' index.html
1
```

**v2 (W4b, after the fix pass) -- the file as it stands:**

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && wc -c index.html
  602135 index.html
```

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && LC_ALL=C grep -c '[^ -~\t]' index.html
0
```

```
$ cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && grep -c 'box-shadow' index.html
1
```

v1 is preserved byte-for-byte at
`artifacts/document-lens-proposal-2026-08-28/build/index-v1.html` (452,976 bytes), which is the
way back.

---

## 9 · MB's own build check (not the C.8 probe — that is MR's, in a different context)

`self-check.mjs`, run headless. Verbatim:

```
mockReady: true
mockError: none
externalRequests: 0
pageErrors: 0
fonts: 16px "Playfair Display"=true 16px Inter=true 16px "DM Mono"=true
scroll0: {"sc1":319,"lensHeight":"319px","lensOpen":"true","bandH":56,"state":"rest","index":"approvals","map":"approvals=full schedule=reading ffe=reading money=condensed care=condensed record=condensed"}
scroll400: {"sc1":319,"lensHeight":"56px","lensOpen":"false","bandH":56,"state":"condensed","index":"approvals","map":"approvals=full schedule=reading ffe=reading money=condensed care=condensed record=condensed"}
scroll1200: {"sc1":319,"lensHeight":"56px","lensOpen":"false","bandH":56,"state":"condensed","index":"ffe","map":"approvals=reading schedule=reading ffe=full money=condensed care=condensed record=condensed"}
shadows: {"sites":{"margin-chip":21,"drawer":2,"lens-sheet-panel":6},"wrongValue":[]}
overflow: {"frame-1440":{"frame":0,...},"frame-1280":{"frame":0,...},"frame-390":{"frame":0,...}}
animatingAfterToggle: 0
animatingAfterMediaQuery: 0
reversible:condensed: true
reversible:ffe: true
reversible:w1280: true
reversible:w390: true
reversible:reduced: true
reversible:slow: true
jump: schedule:y=72,idx=schedule ffe:y=72,idx=ffe money:y=72,idx=money care:y=72,idx=care record:y=72,idx=record approvals:y=72,idx=approvals
cls: 0
unnamedFocusables: 0
counts: {"ffeRows1440":36,"rooms1440":4,"crops":3,"paperHeight1440":6004,"frames":3}
```

`host-sim.mjs` (the Artifact host's insert-after-load, scripts re-executed):

```
execResult: { "reExecuted": 1, "errors": [] }
finalState: { "mockReady": true, "bodyBackground": "rgb(235, 231, 224)" }
consoleErrors: []
pageErrors: []
externalRequests: []
```

**Against the SC targets** (design targets, hit or missed, from the numbers above):
SC1 **319px** (<= 405) · SC2 **56px** (<= 108) · SC3 **56px at 400 and at 1200, no drift**
(<= 64) · SC5 **0** hover-only acts · SC6 **0** animating under both triggers · SC8 the three
token sites and nothing else · SC9 **0** external requests · SC10 **0** overflow on all three
frames · SC11 exactly one `full`, no region with zero readable text · SC12 the index agrees at
every offset and is never null · SC13 every focusable has an accessible name, in DOM order,
with the landing 72px clear of the pinned band. SC4 and SC7 are MR's to measure.

---

## 10 · Files

- `mock/final/index.html` — **the deliverable.** 452,976 bytes, pure ASCII, zero external
  requests.
- `mock/final/FINAL.md` — this file.
- `mock/final/build-index.mjs` + `mock/final/gen/{data,css,paper,script}.mjs` — the generator.
  Not needed to open or publish the deliverable; kept so a fix lands in all three frames at once.
- `mock/final/self-check.mjs` — MB's build check. Chromium; run unsandboxed.
- `mock/final/shots-mb/` — MB's own screenshots, including `nojs-rest.png` (JavaScript
  disabled), `1440-rest`, `1440-condensed`, `1440-ffe`, `1440-sheet`, `1440-reduced`,
  `1280-reading`, `1280-margin-sheet`, `390-reading`, `390-sections`.
- `mock/final/node_modules` — a symlink into `apps/designer-portal/node_modules`, so the
  Playwright scripts resolve `@playwright/test`. Never committed, never copied.
- `build/index-v1.html` — the W4a file, preserved byte-for-byte before the fix pass.
- `mock/final/measure-rail.mjs` · `probe-act.mjs` · `probe-ovf.mjs` · `probe-bracket.mjs` —
  MB2's four measurement scripts for the fix pass (rail geometry, the R-02 clip experiment, the
  overflow census, the reading bracket across a whole read). Chromium; run unsandboxed.

---

## 11 · Review responses

MB2, a fresh seat, W4b, 2026-08-29. Every finding in `mock/final/REVIEW.md` gets exactly one
of three answers -- **FIX**, **ACCEPT AND NARROW**, **DROP WITH REASON** -- and none is left
unanswered. Sixteen findings: eleven from MR's probe (R-01...R-11) and five from the
orchestrator's own read (RF-01...RF-05).

**The gate after the pass.** `node review-clickthrough.mjs` prints **17 PASS / 1 FAIL of 18
items**. The one FAIL is item 12, and R-02 below is the whole account of why it cannot print
PASS on its literal words while NG4's ink pool and the WCAG sr-only line both stand. Every
other item that was passing still passes, measured, not asserted.

| # | Answer | One line |
|---|---|---|
| R-01 | **FIX** | The ladder takes the rail's height; both SC4 readings are printed. |
| R-02 | **ACCEPT AND NARROW** | The bleed is real; no clip can end its `scrollWidth` report, and two of the four causes were fixed. |
| R-03 | **FIX** | `data-reading-index` now has an address at 390. |
| R-04 | **FIX** | `host-sim.mjs` interrogates this mockup and asserts the static paint. |
| R-05 | **DROP WITH REASON** | C.6's reversibility clause and C.8 item 6 both require what it asks me to delete. |
| R-06 | **FIX** | `lastGo` is taken only by a frame-state press. |
| R-07 | **FIX** | The bracket is sized off the committed height; 67px, stable across a whole read. |
| R-08 | **ACCEPT AND NARROW** | Three site classes, 29 elements; both numbers now in §6. |
| R-09 | **ACCEPT AND NARROW** | The DM Mono 300 face is unused and stays; §6 explains the bytes. |
| R-10 | **FIX** | Answered by RF-02: the yielded segment prints its name. |
| R-11 | **ACCEPT AND NARROW** | An eighth button would break C.6/C.10; the id of the pen field is named instead. |
| RF-01 | **FIX** | Five real crops on five catalog-linked lines. |
| RF-02 | **FIX** | A yielded segment prints its NAME; the rail head keeps the household and the count. |
| RF-03 | **FIX** | One group per anchor that has items; the contradiction and the wrap are gone. |
| RF-04 | **FIX** | The SECTIONS slot prints the stop she is standing in. |
| RF-05 | **FIX** | Both, as ruled: the ladder distributes, and both readings are reported. |

---

### RF-01 — product crops are placeholder boxes, not the R126 48px crops · **FIX**

**C.1** ("one product crop, inlined as a data URI from `mock/img/`") and **C.4/NG4** ("48px
product crops on catalog-linked lines"). All five JPEGs in `mock/img/` are now inlined, one
data URI each, as `:root { --crop-<basename> }` custom properties -- the same property names
`mock/deck-parts/build.mjs` mints, so the deck's own crop rules and this file's agree. They are
backgrounds on `.thumb.is-catalog.crop-<basename>`, never `<img>` elements; the network census
in probe item 1 still reads **0 external requests**.

Five catalog-linked lines carry a real crop, mapped by best visual fit and listed in §3 among
the inventions: *Heirloom oak dining table*, *Side chairs, set of six*, *Pendant, hand-blown
glass* (all Dining), *Ceramic vessel, large* (Living), and *Dining rug, flatweave* (Dining,
cropped low onto the rug at `background-position: 50% 92%`). The other 31 lines keep the "no
catalog crop on this line" glyph -- including both Mudroom lines the specimen marks
`NOT SPECIFIED`, which is the finding's own instruction and the truth about them.

**What it cost.** C.1's size line: the file goes **452,976 -> 602,135 bytes** (0.43 MB ->
0.57 MB), 161,312 of it the five crops as base64. Still a quarter of the 2 MB target. C.1 says
"one product crop"; five is a deviation from the letter of C.1 and it is the finding's ruling
against NG4, which is the floor C.1 sits on.

### RF-02 — a yielded rail segment prints nothing, so the reading bracket sits on blank rail · **FIX** (and R-10 with it)

**C.5** (`data-reading-index`), **§4 L-3 and L-6** (both mechanics rows are rewritten above).

*The ladder.* Each segment is now two layers in one 15.4px box, crossfading on the one
attribute `data-region-head-in-frame`: `.seg-value` (its <=30-character value, `--text-muted`,
`--text-primary` while it is the reading index) and `.seg-name` (the region's name, 11px mono,
`--text-muted`, absolutely placed over the same box so the swap files no layout shift). While a
segment's own head is in frame its **value** yields and its **name** prints. The rail never has
a blank run, and the reading bracket never brackets nothing. SP-08 is not broken: the name is a
position signal, not a fact -- no number moves off the paper and into the rail.

*The rail head (L-6).* The seven-mark arc stays, as before. `.rail-name` (**Vandersteen**) and
`.rail-count` (**4 OF 6**) no longer carry `.lens-rail-head-line` and no longer yield: they
stay printed and turn `--text-muted` while the letterhead is in frame, back to their own ink
once it is gone. Only the stage phrase, `PROCUREMENT & ORDERS`, yields, exactly as the ruling
says. `lens(F)`'s `publish()` now stamps `data-letterhead-in-frame` on every element that
carries the attribute rather than on the yielding class, so one signal drives both behaviours.

**Measured.** SC4 at scroll 0: **35.0% (294px, 15 runs) -> 40.8% (343px, 18 runs)** merged ink;
span **91.4% -> 92.2%**. Probe item 13's contrast census grew from 129 to 131 visible runs at
rest and the minimum is unchanged at **5.32:1**. Probe item 8 still measures **CLS 0** in both
registers; item 10 still measures **0 words present in only one register**.

### RF-03 — the margin's "BESIDE <stop>" grouping shows the wrong stop's items · **FIX**

**D-10** is rewritten by this. The margin now prints **one group per anchor that has items**,
each head naming its own anchor and its own count for good: `BESIDE PIECES 3` and
`THE WHOLE JOB 4`. A head can no longer contradict the cards under it, which is what
`BESIDE APPROVALS 0` + `NOTHING BESIDE THIS STOP YET` over three `TIME · BESIDE PIECES` cards
did. The empty line is deleted with the contradiction: it can only be true when the current
stop's group is the ONLY group and it is empty, and this paper always prints two -- so the
wrap collision it caused (`YET` falling onto its own line, into the first card) is gone with
it, rather than papered over.

The lift is carried by `data-beside-current` on the head: the count turns `--text-muted` ->
`--text-primary` over a scaled 300ms while the reader is standing in that anchor's stop. One
small state-carrying thing, no large tinted surface, no layout touched.

**What I did NOT do, and why.** The finding's sub-clause "the current stop's group first" is
**dropped with reason**: the two groups are 3 chips and 4 chips tall, so putting one before the
other on every reading-index change moves everything below it inside a column that is on
screen. That files a `layout-shift` entry per change, and **C.8 item 8** ("CLS = 0 over a
scripted scroll from 0 to the foot at 1440... in both the normal and the reduced register") and
**C.10** ("Zero layout shift on condense") both forbid it. Naming both, per the rule for a
review item that conflicts with a C.\* item. The colour lift is what is left that says which
group is beside her, and it costs nothing.

### RF-04 — the mobile bar's SECTIONS slot names the wrong stop at s0 · **FIX** (and R-03 with it)

**C.5** (`data-reading-index` ... "never null while the paper is in view"). The slot prints the
stop the reader is standing in, read off `publishState()`'s one published index -- the same
value the rail reads at a wider tier. All six names are pre-printed in one fixed box, one
visible, swapped by `visibility` exactly like the group heads were, so naming the stop costs no
layout shift; each name is its own ellipsis box (`position: absolute; left: 0; right: 0`), so
the swap adds no `scrollWidth` report of its own -- measured, `.mb-swap` is 104/104.

R-03's address problem is answered in the same move: `data-reading-index` is now published on
**`.mobile-bar`** as well as on `#frame-390`, so a consumer reading the 390 tier's rail-shaped
root gets the value instead of `null`. `#rail-390` still does not exist -- 390 has no rail, it
has a bar, and inventing an empty `<aside id="rail-390">` to satisfy a selector would be a
worse answer than naming the element that actually does the rail's job.

### RF-05 — let the ladder take the rail's available height, and report both readings · **FIX** (and R-01 with it)

Both, as ruled. §7's SC4 entry above is rewritten with both numbers and says plainly which one
meets the threshold (neither: 40.8% merged, 92.2% span, threshold 70%). Structurally: `.spine`
is a flex column; `.ladder` is `flex: 1 1 auto` with the six slots' declared extents as their
flex basis **and** their grow and shrink weight, so the distribution stays data-derived; the
floor is `min-height: 24px`, and 143px on the Pieces slot because its four room sub-rungs open
inside its own box. `.spine`'s bottom padding drops from 96px to 24px.

**Measured.** The rail stops scrolling itself: `scrollHeight/clientHeight` **905/840 ->
840/840** at 1440 and **852/740 -> 740/740** at 1280. The ladder is **443 -> 450px** at 1440
and **398 -> 358px** at 1280 (where 398 never fitted). No ink was fabricated: the whitespace
between six one-line segments is the peace the ask is about.

### R-01 — SC4 rail utilisation is 35.0%, half the 70% threshold · **FIX**

Answered by RF-05 above, which ruled "do both". After the pass: **40.8% merged / 92.2% span**
at scroll 0, **44.6% / 92.2%** at 400 and 1200; the ladder distributes; §7 states both readings
and says the merged one misses. The finding's diagnosis was exactly right -- the empty run at
the top of the ladder was the largest single contributor, and RF-02 is what removed it.

### R-02 — `.act .da-pool` bleeds 5px past its act, so 31 descendants overflow at 390 · **ACCEPT AND NARROW**

The finding is real and its measurement is right. The narrower true claim is: **the bleed
cannot be made to stop reporting, by any clip, and it was never the only cause.**

*What I measured before answering* (`probe-act.mjs`, a bare act with the shipped
`inset: 2px -5px 5px` pool): `overflow: clip; overflow-clip-margin: 6px`, `overflow: clip;
overflow-clip-margin: 0`, and `contain: paint` **all still report `scrollWidth/clientWidth =
35/30`** on the act itself. Chromium computes `scrollWidth` off the layout overflow rect
whatever the clip is. The finding's first route -- "clip the bleed at the act" -- therefore
does not work, and it costs the wash's shipped look for nothing. The `.act` rule was written,
measured against the full 390/1280/1440 census (`probe-ovf.mjs`), found to change **not one
element**, and reverted; the CSS carries the measurement as a comment so the next seat does not
repeat it.

*What I did fix, because those causes were real:*
- **The schedule rule's last tick.** `.sched-rule i` was drawn at `left: 100%` with a 1.5px
  width, so it genuinely hung 2px past the rule; `.sched-rule i:last-of-type` now translates
  `-100%` and hangs inward. Removes 3 of the 31 at 390.
- **The 390 guide sentence.** `span.band-2-text` reported `255 > 200` -- the band's second line
  was being **truncated** at 390, which is not what "both lines are single lines by
  construction" means. The 390 line now reads `OVERDUE 6D · BEDROOM` and measures **184/184**;
  the ellipsis never fires and `p.band-2` stops reporting too. Removes 2 more.

*What remains, and why it is not removable:* the census at 390 is **31 -> 26**, of which **15
are the acts' own ink pools** (NG4's shipped `--elevation`-free Scored Ink wash, "the ink-pool
hover wash... clip-path circle from the pointer"), **4 are `p.rh-quiet`**, the 1px sr-only line
that C.5's non-visual channel needs and that every visually-hidden pattern reports, and the
rest are ancestors of those two. **0 elements paint past any frame edge at any of the three
widths** (`past: 0` at 390, 1280 and 1440), and `#frame-390` is `388/388`. So SC10 -- "nothing
escapes its frame" -- holds cleanly, which is what item 12 is for; item 12's literal wording
cannot be satisfied without deleting either the R126 wash or the sr-only line, and NG4 and
2.4.11 respectively forbid that. §7's "better target" stands and is now measured, not argued.

### R-03 — no `#rail-390`, so `data-reading-index` has no rail root at 390 · **FIX**

Answered inside RF-04 above: `data-reading-index` is published on `.mobile-bar`, so the tier
has an address for C.5's row. Verbatim from the fresh inventory:
`frame-390: rail=(NO #rail-390) mobile-bar idx=approvals`.

### R-04 — `host-sim.mjs` still interrogates the Life Review's DOM · **FIX**

**C.7** ("this is a publish gate, not a nicety"). Every selector is repointed: `#screen-desk`
and `#frame` are gone, `#stage` / `#frame-1440` / `#lens-1440` / `#rail-1440` are in, and the
pre-script snapshot now **asserts** C.1's static-first promise instead of reporting nulls. It
publishes a single `staticPaintOK` boolean that is true only when, with no script run at all,
three frames stand, `#lens-1440` is `data-lens-open="true"`, six regions are present, exactly
one is `full` and it is `approvals`, the frame publishes `data-lens-state="rest"` and
`data-reading-index="approvals"`, and the first region head sits at a y between 1 and 405 (SC1).
Fresh run, verbatim: `staticPaintOK: true`, `firstRegionHeadYInFrame: 320`, `regionCount: 6`,
`exactlyOneFull: true`, `frameCount: 3`, `ffeRows: 36`, `catalogCrops: 5`, `reExecuted: 1`,
`errors: []`, `consoleErrors: []`, `pageErrors: []`, `externalRequests: []`, and after the
scripts run `mockReady: true`, `mockError: null`, `lensSettledExposed: true`,
`lensHeight: "319px"`, `railReadingIndex: "approvals"`. The gate can now fail on a blank rest
state, which was the finding's whole point.

### R-05 — pressing **Rest** silently clears the reduced and slow motion registers · **DROP WITH REASON**

The mechanism is described correctly; the change is one two C.\* items forbid.

**C.6, last line:** "Every dev-bar state must be **reversible** -- pressing Rest from any state
returns to the rest state with nothing left over (probe item 6)." **C.5** puts `data-motion` on
the stage root in the attribute contract. **C.8 item 6** implements both: it snapshots the rest
contract, enters each state, presses Rest, and diffs -- and the diff includes
`if (restRef.motion !== back.motion) diff.push(...)`. Deleting `setMotion(baseMotion())` from
`goRest()` therefore turns item 6 from PASS to FAIL for two of the seven buttons. That is
`FINAL.md` deviation **D-9**, written for exactly this reason.

The consequence the finding names is also narrower than stated. "The reduced register cannot be
shown at the rest state from the dev bar at all" is not true: **Rest, then Reduced motion**
gives the reduced register at the rest state in two presses, and that is the order the shooter
and probe item 10 already use. What is true is that the order matters, which is the price of
Rest meaning "nothing left over".

### R-06 — the motion buttons steal `lastGo`, so the bar reports no frame state · **FIX**

**C.6** ("`aria-pressed` maintained on every button on every state change"). `devbar(go)` now
takes `lastGo` only on a frame-state press -- `condensed`, `ffe`, `w1280`, `w390` -- so
**Reduced motion** and **Slow motion 4x**, which move no frame, leave the frame-state button
pressed. Pressing Reduced motion at rest now yields `aria-pressed[rest=true, condensed=false,
ffe=false, w1280=false, w390=false, reduced=true, slow=false]`; a screen-reader user is told
the document is at rest **and** in the reduced register, which is both true.

### R-07 — the paper grows 725px under the reader; the reading window shrinks with it · **FIX**

`window_(F)` now sizes and places the bracket against the paper's **fully committed** height,
not the height it happens to have. That height is measured once, in init, by flipping every
region's `data-density` to `reading`, reading `scrollHeight`, and putting every attribute
straight back -- an attribute flip and one synchronous layout read before anything paints, so
no stamp inks early (`ink()` is only ever called explicitly, R16/R31) and nothing paints twice.

**Measured** (`probe-bracket.mjs`, `#frame-1440`): the bracket is **67px after Rest, 67px after
a whole 0-to-foot read, and 67px at the foot**, where it lands at y=383 in a 450px track --
exactly `track - h`. Before the fix it was 75px -> 66px over one read. `scrollHeight` still
grows 5279 -> 6004 as regions commit, below the fold as designed, and probe item 8 still
measures **CLS 0** in both registers.

### R-08 — "three sites" is three site *classes*, not three elements · **ACCEPT AND NARROW**

Correct, and it is a claim to state rather than a defect to fix -- the finding says so itself
("NG2's 'three sites' reads as three kinds of surface and the mockup honours that"). The
narrower true claim is written into §6's shadow line: **3 site classes, 29 elements** (margin
chip x21, open ledger sheet x6, studio drawer x2 across three frames), all computing exactly
`rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`, off-token values 0, `filter: drop-shadow` 0. Per
frame it is 7 margin chips, 1-3 sheet panels and 0-1 drawers. The deck should quote both
numbers and should not say "three" as an element count.

### R-09 — the DM Mono 300 face is inlined but never used · **ACCEPT AND NARROW**

Correct, and the finding's own answer is the right one: **C.1** says to copy
`mock/assets/fonts/fonts-data-uri.css` **verbatim** and not to add a face, and re-encoding the
file to drop a face is editing it. The narrower true claim is that this is a size fact, not a
defect, so it is now explained in §6's size line rather than left to be discovered: fonts are
203,852 bytes of the 602,135, the six faces include a DM Mono 300 that nothing requests, and
`document.fonts` reports it `unloaded` for that reason.

### R-10 — at rest the top rail segment prints nothing · **FIX**

Answered by RF-02: a segment that yields its value now prints its name, so the ladder no longer
opens with an empty run and the reading bracket at s0 sits on the printed words
**CLIENT APPROVALS**. The finding's second option -- "cut `spine-after-360` at an offset where
every segment prints" -- is no longer needed: every segment prints at every offset, one register
or the other. C.9's `spine-after-360` can be cut at s0, which is the honest place for it.

### R-11 — `data-lens-state="editing"` has no route from the dev bar · **ACCEPT AND NARROW**

The observation is right and the state machine works: focusing a `[data-pen]` field publishes
`editing` and blurring returns the scroll-derived state. The narrower true claim is that it has
no route **from the dev bar**, and it must not have one: **C.6** lists seven buttons and
**C.10** signs off "Dev bar: **seven** buttons". An eighth would break both.

What I did instead is name the address, so the deck can cut the pen-down frame without
guessing: the field is **`input#spec-mudroom-3-1440.spec-input`** (the Mudroom's *Ceiling
fixture* line, `aria-label="Specify Ceiling fixture, Mudroom"`); `#spec-mudroom-4-1440` is the
*Boot tray* line, and `#composer-1440` is the margin composer. `shoot-final.mjs` focuses one by
id, and the row takes its clay rule and its flat tint with no sibling changing and nothing
dimming (L-8).

### 1280 rail fix — PRIMARY BEDROOM clipped, MUDROOM missing, FILED WITH THIS JOB overprinting the first door · **FIX**

`shots/1280.png` showed the Pieces slot's room sub-rungs running past its own `overflow: hidden`
edge and `FILED WITH THIS JOB` printing over `Plan room`. RF-05's own aside already named half
of the cause -- "398 -> 358px at 1280 (where **398 never fitted**)" -- and the rest was two more
gaps between what was declared and what 136px actually forces: `.rung`'s `min-height: 28px`
fights `.lens-nav-room-rung`'s `block-size: 0` collapse (measured: a "hidden" rung still renders
8px, its padding's own floor, not 0), and every wrapped value -- `.doors-head` included --
was floored for a width its text no longer fits at 1280 (`FILED WITH THIS JOB` wraps to two
lines, `scrollHeight` 33px against a declared 20px box with no `overflow` rule, so the second
line painted straight over the next `.door`).

**Measured, before.** Pieces natural content (its wrapped value plus four *always-rendered*
28px rungs, the `.rung`/`.lens-nav-room-rung` conflict above) needs 170px; the slot's flex
distribution gave it 148.6px. `.doors-head` needs 33px; it had 20px, `overflow: visible`.

**Route taken: Override 2's collapse form**, not a bigger box -- even with the real 344px the
rail has at 1280 between the head rule and the doors (`21px rule-hair + 34px doors-head +
128px doors + 24px padding`, up from the old 358px because the doors-head fix itself costs
14px), four *open* room rows plus every segment's now-correctly-floored wrapped value do not
fit (384px needed against 344px available). So at 1280 only: the four rungs stay collapsed
(`#frame-1280 .lens-nav-room-rung { min-height: 0; }`, scoped so 1440/390 keep listing them
open, unchanged), and Pieces' value prints the count instead of the rows --
**"36 LINES · 4 ROOMS · 1 DAMAGED AUG 26"** in both the value span and the `aria-label`, per
proposal.md's own worked example. `#frame-1280 .doors-head` gets an explicit `height: 34px` (a
tuned/scoped, plain block-height reservation for the wrap, not a media-query rewrite of the
shared rule). The six slots' 1280 floors move from a uniform 24px (143px on Pieces) to their
real measured content height plus a few px -- `45,45,112,60,45,29` -- and their flex weights
move from `46,46,162,58,46,40` to `46,46,115,61,46,30` (sum 344, the real budget, replacing the
398 that RF-05 had already flagged as not fitting); 1440's `SLOTS`/`MIN_HEIGHTS` rows are
untouched. Fixed in the generator (`gen/css.mjs`, `gen/paper.mjs`) and regenerated via
`node build-index.mjs` -- confirmed byte-identical to the hand-edit it replaced.

**Measured, after.** All six 1280 seg-slots hold their full wrapped value with margin to spare
(46.4/46.4/113.1/62.6/46.4/29.1px rendered against 42.8/42.8/105.6/58.2/42.8/27.4px needed).
`.doors-head` renders at 555-589px; the first door starts at exactly 589px -- zero overlap.
A Playwright sweep of every text node under `#rail-1280` against its nearest `overflow`
ancestor (excluding the four rungs, which are correctly invisible at rest, same as they would
be at 1440 outside the Pieces/room-in-hand window) found **0 of 21 clipped**. 1440 and 390 are
byte-for-byte unchanged; `shoot-final.mjs`'s external-request/box-shadow/page-error census and
`host-sim.mjs`'s `__mockReady`/static-paint checks still read 0/3-sites-29-elements/0/true.

## 12 · Load performance

**The complaint.** Under `file://` the mockup reported `window.__mockReady` in a fifth of a
second, but in the published Artifact it showed **nothing for about ten seconds**, then grounds
without text, then text arriving over about twenty seconds.

**Why neither existing harness could see it.** `host-sim.mjs` reads the file into a string and
inserts it with one `insertAdjacentHTML`, so the whole document is parsed in a single memory
operation; `file://` has no transfer at all. Both models make document *order* free. The real
host serves the file over a network and the parser sees it arrive byte by byte — and the parser
paints nothing while a `<style>` is still arriving, because the stylesheet is pending and the
rendering steps are blocked. So **every byte declared ahead of the markup is a byte of blank
screen**, and only a streaming model can show it. `perf-stream.mjs` is that model: a throttled
local HTTP server, a real navigation, browser FCP.

**The cause, measured.** The file opened with five `<style>` blocks totalling **425,049 bytes**,
of which **363,837 bytes were base64 data URIs** — 199 KB of `@font-face` and 158 KB of product
crops — and the first byte of markup came after all of them. At 500 kbps that payload is 6.8
seconds of wire time and FCP landed at 6.89s; at 300 kbps it is 11.3 seconds and FCP landed at
11.47s, which is the ten-second blank as reported. The Life Review control paints sooner for
exactly the same reason in a smaller dose: 303 KB of leading `<style>`, FCP 5.00s / 8.29s. It
was never a faster chassis, only a lighter one.

**The fix** (`build-index.mjs`, one reordering; no CSS, no markup, no script, no data changed).
The document is now *rules, paper, payload, script*: `tokens.css` + `lens.css` + `gen/css.mjs`
(59 KB — everything needed to lay the paper out) first, the three frames second, and the
base64 payload last, between the paper and the `<script>`. The three families already carry real
fallback stacks (`--font-display` / `--font-body` / `--font-meta`) and `font-display: swap`, and
the crops are backgrounds on 48px thumbs, so nothing about the layout waits on the payload — the
text paints at once in the fallback face and the real face swaps in. The payload still lands
before `<script>`, so init measures the same declared faces it always did and `__mockReady`
still means what it meant.

### Before / after, first paint (browser FCP), streaming model, CPU 4x

| kbps | control (Life Review) | ours, before | ours, after |
| ---- | --------------------- | ------------ | ----------- |
| 300  | 8.29s                 | **11.47s**   | **1.73s**   |
| 500  | 5.00s                 | **6.89s**    | **1.06s**   |
| 1500 | 1.74s                 | **2.36s**    | **0.42s**   |

First laid-out region-head text box tracks FCP within 0.25s throughout (500 kbps: 7.05s before,
1.19s after). After the fix the mockup paints sooner than the control at every bandwidth,
despite carrying 231 KB more file.

### Before / after, `host-sim.mjs` insertion model, CPU 4x (median of 3)

| metric            | control | ours, before | ours, after |
| ----------------- | ------- | ------------ | ----------- |
| first paint       | 0.20s   | 0.27s        | 0.22s       |
| `document.fonts.ready` | 0.27s | 0.45s     | 0.38s       |
| `window.__mockReady`   | 0.20s | 0.41s     | 0.34s       |
| `__lensSettled()`      | n/a   | 0.46s     | 0.38s       |

The insertion model was never the problem and is not where the fix shows; it is quoted so the
target (first paint <= 2s, `__mockReady` <= 4s under host-sim at 4x) is on the record as met
with an order of magnitude to spare, before and after.

### The suspects that did not measure as the cause

- **Three full frames at once.** 3,080 nodes for the whole stage (control: 1,149). Real, and
  worth 187 KB of markup, but markup after the first frame does not block first paint and the
  two hidden frames cannot be deferred: `host-sim.mjs`'s static-paint gate asserts
  `frameCount === 3` **before any script runs**, so a `<template>` would fail the gate, and
  `content-visibility: hidden` saves render work without saving a single streamed byte.
- **`content-visibility: auto` layout storms.** The only `content-visibility` in the file is
  lens.css's L-5 *passed* state, which no region is in at load. Two occurrences, zero at init.
- **Synchronous forced layouts in init.** Real and measurable: init costs **14 extra layouts
  and 24 extra style recalcs** (16/26 with the script against 2/2 without), 0.147s of layout at
  4x throttling, concentrated in `lens('1440')` (55ms, the first `topIn` chain over the whole
  paper) and the R-07 `fullHeight` sweep (28ms, every region released to `reading`, one
  `scrollHeight` read, every region put back). That is ~120ms of a 340ms `__mockReady` under
  the insertion model and *noise* against a 6.9-second stall. Batching the reads would mean
  rewriting `mountAhead`'s deliberate one-commit-per-pass re-measurement (L-4/L-5) and the R-07
  sweep, both of which decide which regions commit — a mechanics change, for something no
  reader can perceive. Left alone, on the record, with the numbers.
- **A mount-ahead sweep forcing the whole paper to full.** `mountAhead` commits one region per
  pass against a 240px look-ahead edge; at rest it commits the regions within a frame-height of
  the top, not the paper. Confirmed by the gate: exactly one region full, `approvals`, and 36
  `.ffe-row`s still condensed at the pre-script snapshot.
- **`font-display: block`.** All six faces were already `swap`, and all three stacks already
  carry real fallbacks. Nothing to fix; it is *why* the reordering is safe.
- **Eager crop decode.** The five crops are CSS `background-image` data URIs on 48px thumbs,
  which Chrome already decodes lazily for off-screen elements. Their cost was their *position*
  in the file, not their decode.
- **The stage `fit()` transform.** 0.0-0.5ms across all three frames at 4x.
- **A body-wide `MutationObserver`.** There is none; the file has zero `MutationObserver`s.

### What remains

`window.__mockReady` in the *streaming* model is bounded by the whole document arriving: the
`<script>` is the last block and the readyState guard defers init to `DOMContentLoaded`, so at
500 kbps it lands at 9.75s before the fix and 9.77s after — the fix moves first paint, not
last byte. Moving the `<script>` ahead of the payload was tried and measured: it does not help,
because `DOMContentLoaded` still waits for the payload (9.83s). The only remaining lever is
total bytes, and every byte is either content, a face in use, or a crop at its published
resolution — so it stays. The reader now has a complete, readable, correctly laid out document
at 1.2s and gets the lens when the file finishes, instead of a blank rectangle for ten seconds.

### Gates, after

`node review-clickthrough.mjs` — 17 PASS / 1 FAIL of 18, item 12 the only failure, unchanged;
SC1 = 320px, SC2 = 57px, SC3 = 319px/56px/56px, SC4 = 40.8% merged-ink / 92.2% span,
SC11 = true, SC12 = true — every number identical to before the fix, not merely within 1px.
`node host-sim.mjs` — `staticPaintOK: true`, `mockReady: true`, `mockError: null`,
`lensSettledExposed: true`, frameCount 3, regionCount 6, exactly one full (`approvals`),
first region head y 320px, 36 `.ffe-row`s, 5 catalog crops, 0 console errors, 0 page errors,
0 external requests. `node shoot-final.mjs` — EXTERNAL REQUESTS 0, PAGE ERRORS 0, box-shadow
census the same three classes (`.margin-chip.doc-elevated` x7, `.drawer.doc-elevated` x2,
`.lens-sheet-panel.doc-elevated` x1) at the token value, drop-shadow 0, eight shots rewritten.
`LC_ALL=C grep -c '[^ -~\t]' index.html` = 0; `grep -c 'https://' index.html` = 0;
`wc -c index.html` = 603180 (was 602800; the +380 is the two comments explaining the order).
