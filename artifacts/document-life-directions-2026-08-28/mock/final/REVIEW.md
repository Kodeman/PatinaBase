# REVIEW — adversarial read of `mock/final/index.html`

Reviewer: did not build it. Sources: `FINAL.md`, `index.html`, `tokens.css`, `shots/*.png` (all six),
today's truth shots (`shots/w1440-desk.png`, `w1440-doc-project-rich.png`,
`w1440-ledger-sheet-orders.png`, `w1440-drawer-strip.png`, `m390-desk.png`), `source/specimen.md`,
`research/11-canon-digest.md`, `source/direction-a.md` / `direction-b.md`, and a live Playwright
click-through (`review-clickthrough.mjs`, screenshots in `review-shots/`, log in
`review-shots/probe-log.txt`).

---

## Verdict

The document state is the strongest thing this team has drawn — the charcoal band gives the page the
single anchor it has never had, the 40px Playfair title lands first, the red-letter row lands second,
and none of it reads as a different product. Everything the assembled direction asks for is
*present*, but two of its four material moves do not survive contact with the specimen it chose:
the filled stamps and the margin-chip highlight are 1.02–1.05:1 against the Project stock and
therefore invisible on the one sheet the mock actually draws, and the six movement stocks sit at
identical value (1.001–1.007:1 between neighbours), so the whole movement system is carried by hue
alone — which is precisely the thing canon says depth may not be. Plus one hard stop: the first click
of the primary interaction prints `FOLD Â†'` on the page.

---

## Findings

Severity is my read of cost to the ruling, not of effort. Every finding is reported.

---

### R01 · The fold word garbles on the first click — `FOLD Â†'`
**blocker · confidence: certain · disposition: fix**

**What/where.** `index.html:1279` — `word.innerHTML = open ? 'Fold ↑' : 'Unfold ↓'`. Those two
arrows are the *only* raw non-ASCII bytes in the entire file outside the `data:` URIs (every other
glyph is a numeric entity: `&#8595;`, `&#8593;`, `&#8984;` …), and the file carries **no
`<meta charset>`** (`grep -c charset index.html` → 0). Served from `file://`, Chromium falls back to
windows-1252 and decodes the UTF-8 arrow as two mojibake characters.

**Evidence.** Probe (3): after clicking UNFOLD the word reads `Fold â†‘`; after FOLD on Schedule it
reads `Unfold â†“`. Visible on the page in `review-shots/03-chip-anchored.png` — the Client approvals
seam reads **"FOLD Â†'"** and the Schedule head reads **"Fold â†'"**. The shoot script only ever
captures the initial state, so `shots/` never caught it.

This is the first thing anyone walking the click map will do. Add `<meta charset="utf-8">` (and/or
use `&#8593;` / `&#8595;` in the JS strings, matching the rest of the file).

---

### R02 · Filled stamps and the anchored-line highlight are invisible on the tinted sheet
**blocker · confidence: certain · disposition: fix**

**What/where.** `index.html:466-475` (stamp fills), `:454` / `:489` (`.is-anchored`,
`.margin-chip.is-active`). The five fill tints in `tokens.css` were measured **against
`--doc-paper #FCFAF6`** — FINAL.md §2 prints "1.136 / 1.093 / 1.120 / 1.168 / 1.167 vs sheet". But
the assembled direction moved the sheet to the movement stock, and the specimen is a Project, so the
sheet is `#F8EED0`. Nobody re-measured.

**Evidence.** Probe (13), computed from the rendered elements:

| fill | vs Project sheet `#F8EED0` | vs untinted paper `#FCFAF6` |
|---|---|---|
| `--fill-ordered-tint` | **1.022:1** | 1.136:1 |
| `--fill-damaged-tint` (DECISION DUE / DAMAGED) | **1.052:1** | 1.168:1 |

`--fill-production-tint #F8F0D7` is not drawn anywhere, but on `#F8EED0` it would be ~1.01:1 —
literally the same value as its ground.

Compare `shots/final-sheet-1440.png` (Orders sheet, untinted paper — ORDERED and DAMAGED read as
genuinely *filled* stamps) against `shots/final-document-ffe-1440.png` (Project stock — the same
stamps read as outlined boxes, indistinguishable from today's outlined stamps in
`shots/w1440-doc-project-rich.png`). **"Filled stamps" is delivered on the one surface that isn't
tinted and not delivered on the one that is.**

The same arithmetic breaks the click map's fourth act: the margin chip's anchored-line highlight is
`--fill-ordered-tint`, i.e. **1.022:1** on the sheet. In `review-shots/03-chip-anchored.png` the
"Procurement & Orders" row is only findable because the tint is a different *hue*; as a value it is
not there.

Fix is a second fill ramp keyed to the stock the sheet is wearing (or fills that carry a border/rule
rather than value), not a nudge to these five hexes.

---

### R03 · The six movement stocks are the same value — separation is hue-only
**high · confidence: certain · disposition: fix**

**What/where.** `tokens.css:9-14`. Every stock is tuned to ~1.081–1.088:1 *against the desk ground*
and nobody measured them against **each other**.

**Evidence.** Probe (13):

```
brief     #EDEEED  vs ground 1.088
discovery #EFEFE8  vs ground 1.081  | vs brief     1.007  tabΔ 1.311
direction #F2EEE8  vs ground 1.081  | vs discovery 1.001  tabΔ 1.054
proposal  #F4EDE4  vs ground 1.087  | vs direction 1.005  tabΔ 1.401
project   #F8EED0  vs ground 1.084  | vs proposal  1.003  tabΔ 1.154
install   #F6EDE7  vs ground 1.081  | vs project   1.003  tabΔ 1.038
```

Neighbouring stocks differ by 0.1–0.7% in luminance. Two of the six *tabs* are also near-identical in
value (direction vs discovery 1.054, install vs project 1.038) and in hue — in
`shots/final-desk-1440.png`, DIRECTION `#6B5637` and PROPOSAL `#8B6A3A` read as the same brown chip.

Canon (`research/11-canon-digest.md`, D4 / apps CLAUDE.md:19-26) is explicit that object depth is
"value contrast + flat stacked edges". A system whose six ranks are separated by hue at constant
value is the one thing the constraint was written against, and it degrades to ~two ranks for a
red-green colourblind reader. The stocks want a deliberate value ladder across the six, not six
independent 1.08:1 offsets from the same ground.

---

### R04 · The desk draws 6 roster lines for 16 jobs — the new device is untested at real density
**high · confidence: certain · disposition: fix**

**What/where.** `index.html:626-684` — one `.job-line` per `.stage-group`, under a head that reads
"EVERY JOB · 16 LIVE · 1 OVERDUE" and group heads that read BRIEF · 5, DIRECTION · 3, PROJECT · 4.

**Evidence.** Probe (1): `job lines: 6`, `groups: 6`, each group 92px tall (Project 125px).
`shots/w1440-desk.png` — today's desk prints **all sixteen lines**, four of the five BRIEF lines
above the drawer alone. `shots/final-desk-1440.png` gets 4½ groups into the same viewport.

The movement band is the whole proposition of this direction and it has only ever been drawn holding
one line. At five lines a BRIEF band is ~350px of unbroken `#EDEEED`, the desk becomes six large
colour fields, and the "one line per job, wrapping to two or three; never a card" density rule
(`desk-roster.tsx` docstring, quoted in the canon digest) has to survive inside it. Right now the
review is judging a device at a density the product never has. Draw at least one group at its real
count before the ruling.

---

### R05 · DECISION DUE and DAMAGED are the same stamp
**high · confidence: certain · disposition: fix**

**What/where.** `index.html:468-471` — `.stamp-decision` and `.stamp-damaged` both take
`color: var(--color-terracotta-ink)` and both take `background: var(--fill-damaged-tint)`.

**Evidence.** Probe (2), computed on the rendered stamps: `Decision due` → `ink=rgb(156,83,64)
fill=rgb(244,230,224)`; `Damaged` → `ink=rgb(156,83,64) fill=rgb(244,230,224)`. Byte-identical.
Visible in `shots/final-document-ffe-1440.png`: DAMAGED and DECISION DUE are the same pink chip.

Meanwhile **`--fill-approval-tint #E8E9E9` is declared in `tokens.css:20` and used zero times** — it
is plainly the fill this stamp was supposed to take. Canon's own guard
(`contrast.test.ts`, "keeps clay-ink and terracotta-ink telling two stamp kinds apart") exists
because this collapse is a known failure mode. A designer scanning the sheet cannot tell a decision
she owes from a freight claim she owes.

---

### R06 · The "walnut nightstands" photograph is a live-edge coffee table
**high · confidence: certain · disposition: fix**

**What/where.** `index.html:53` (`--crop-nightstands`), used at `:917` on the "Walnut nightstands ·
×2" line.

**Evidence.** The inlined base64 is **byte-identical to `mock/img/live-edge-coffee-table.jpg`**
(md5 `1e63e4d1fdd72e105778c2c13cc20614`, 39,713 bytes, verified against every file in `mock/img/` —
there is no nightstand image in the folder). It renders in
`shots/final-document-ffe-1440.png` as an orange ladder-back chair on grass.

FINAL.md §1 states the rule the mock breaks in its own words: "**never a stand-in photograph**". The
48px thumbnail is one of the four material moves under ruling; the argument for it should not be made
with a mislabelled photograph. Either shoot/crop a nightstand or give that line the unlinked slot.

---

### R07 · The unlinked thumb slot reads as a failed image
**high · confidence: high · disposition: fix**

**What/where.** `index.html:449` — `.thumb.is-unlinked` is a bare 48px `--rail-stock` square with a
`rgba(44,41,38,.22)` border and nothing in it.

**Evidence.** `shots/final-document-ffe-1440.png` (Hartland wool rug, Brass-and-oak console) and
`shots/final-sheet-1440.png` (Fond du Lac row) — an empty cream square immediately beside a real
photograph. That is the exact visual grammar of a broken `<img>`.

FINAL.md §1 claims "never a blank that reads as a failed image." It does. A rule, a hairline diagonal,
a centred `—`, or a mono `NO LINK` inside the slot costs nothing and settles it.

---

### R08 · Hierarchy inversion on the desk: the movement colour out-shouts the one overdue thing
**high · confidence: high · disposition: fix**

**What/where.** `.stage-group` / `.stage-head` (`index.html:277-295`) vs `.job-mark.is-urgent` (`:299`)
and `.job-overdue` (`:310`).

What you see first on `shots/final-desk-1440.png`: six saturated tabs and a yellow band. Second: the
greeting. Third: the roster lede. The *one overdue job* — the entire reason this desk exists today —
is a 7px terracotta dot and a line of terracotta text **below the fold**, inside a band whose colour
is louder than the urgency signal on it.

Today's desk (`shots/w1440-desk.png`) has the opposite ranking: flat ground, "1 OVERDUE" in the head,
"Overdue 3 days — 1 decision overdue" in terracotta as the only colour on the page. The brief was
"too flat; everything blends together" — the answer here spends its whole colour budget on
*taxonomy* (which movement) and none on *state* (what needs you). Consider the stocks at half
strength, or the tab saturated and the band nearly neutral.

---

### R09 · Region-head ledger acts render in Inter sentence case where today uses DM Mono uppercase
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:419` — `.rh-ledger .act { font-family: var(--font-body); font-size: 14px;
letter-spacing: 0; text-transform: none; }`.

**Evidence.** Probe (3): the Schedule fold word computes `Inter / none / 14px`; the Client approvals
seam word computes `"DM Mono" / uppercase / 11px`. Two type registers for the same act, three inches
apart. In `shots/final-document-ffe-1440.png` the region head reads "Spec the 2 unspecified →" and
"Add a line"; today (`shots/w1440-doc-project-rich.png`) the same slot reads
"SPEC THE 3 UNSPECIFIED →", "ADD A LINE", "BILL 3 UNINVOICED LINES →", "FOLD ↑" — all mono uppercase.

The same override is *correct* on `.drawer-center .act` (today's drawer is sentence-case Inter). It is
wrong on `.rh-ledger`. Note the two also disagree with each other after R01 is fixed, so this is a
separate fix from R01.

---

### R10 · FINAL.md's "Tab reaches all 112" is not true in any state
**medium · confidence: certain · disposition: fix (the claim)**

**What/where.** FINAL.md §5: "Every act is a real `<button>`: Tab reaches all **112** of them inside
the frame."

**Evidence.** Probe (7): `buttons inside #frame (markup): 112 | reachable in the current state: 33`.
The other 79 sit in `display:none` screens (`.screen` `:191`) — the desk, the document and the 390
desk each carry their own drawer and their own roster. 112 is the markup count, not a tab order.
Focus itself is clean (below); the sentence is the defect.

---

### R11 · The shadow count in FINAL.md §3 is state-dependent and wrong for one of the three
**medium · confidence: certain · disposition: fix (the claim)**

**What/where.** FINAL.md §3: "desk **1** · document **3** · Orders sheet **2**."

**Evidence.** Probe (10), computed `boxShadow !== 'none'` over visible elements only:

```
desk                       1  [nav.drawer]
document                   3  [button.margin-chip ×2, nav.drawer]
orders sheet (over doc)    4  [button.margin-chip ×2, nav.drawer, div.ledger-sheet]
```

Desk and document match exactly. The sheet reads 2 only when opened *from the desk*; the click map
also opens it from the document (`index.html:993`), where the two margin chips stay rendered under
the scrim. The three-site budget is intact — `grep -c box-shadow` → 3, all
`var(--elevation-sheet)` (`:328`, `:486`, `:505`) — but the probe line as written will not reproduce.

---

### R12 · The 390 desk drops "· 1 OVERDUE" and the second whisper
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:1035` (`Every job &middot; 16 live`) and `:1028-1031` (one whisper only).

**Evidence.** Probe (9): `390 roster head: Every job · 16 live`; `390 whispers: ["— This is your Desk.
Folders that need you gat"]` — one. Today's `shots/m390-desk.png` carries **"EVERY JOB · 16 LIVE · 1
OVERDUE"** and both whispers including "The studio isn't fully set up. FINISH SETTING UP".
FINAL.md §6 lists both as things that stay identical. The 390 body copy is also silently shortened
(the Byrne line loses "6 days", the Vandersteen line loses "sent Aug 13, owner Client").

Dropping the overdue count is the wrong thing to drop on the width where the roster is longest.

---

### R13 · Pieces claims 4 rooms and draws 3; the Mudroom — where the 2 unspecified live — is missing
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:869` ("4 rooms · 36 lines"), `:878` / `:891` / `:904` — three
`.room-head`s: Dining room, Living room, Primary bedroom. `source/specimen.md` gives a fourth:
**Mudroom 5 lines (3 ordered, 2 unspecified)**.

The instrument row says "36 lines · 2 unspecified" (`:797`), the black act says "Spec the 2
unspecified →" (`:872`), and the room that holds those two is not on the page. FINAL.md §7 lists five
places the mock had to choose; this is a sixth and it is undeclared. Either draw a Mudroom head with
its two unspecified lines (which would also give the review a *fourth* room-alloc grammar to look at)
or say so.

---

### R14 · The Time chip highlights its line with the money-ordered tint, and the phase row has no transition
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:454` — a single `.is-anchored { background-color: var(--fill-ordered-tint) }`
serves both chips; `.ffe-row` (`:447`) declares a background-color transition, `.phase-row` (`:429`)
does not.

**Evidence.** Probe (4): chip `time` → target `phase-active`, `targetBg rgb(242,235,224)`,
`trans: "all"` (i.e. none declared); chip `money` → target `ffe-po`, same `rgb(242,235,224)`,
`trans: "background-color"`. So a **Schedule phase** is marked with the *ordered-money* pigment, and
one of the two anchors fades while the other snaps.

Minor on its own; it matters because FINAL.md §7 calls the margin anchoring "the interaction is the
point". If the point is the interaction, the two halves should behave alike and the pigment should
mean what it means.

---

### R15 · The Orders sheet is a dialog that never takes focus
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:1127` — `role="dialog"` with no `aria-modal`; `openSheet()` (`:1258`)
sets `is-open` and `aria-hidden=false` and returns.

**Evidence.** Probe (6): `focusMovedIntoDialog: false`, `activeElement: "Ledgers ↑"` — focus stays on
the drawer button behind the scrim. Nothing traps Tab inside the sheet, nothing marks the desk
beneath inert, and nothing restores focus on Esc. Esc itself works (`:1311`) and the scrim closes
(`:1126`) ✓.

Canon (R3, quoted in the digest) is emphatic that overlays enter only through `Doc*` wrappers; this
mock is drawing the overlay's manners as well as its skin, so the manners are in scope.

---

### R16 · Motion replays: the roster re-settles on every PUT DOWN, and stamps re-ink on every entry
**medium · confidence: certain · disposition: fix**

**What/where.** `show()` (`index.html:1255`) calls `settleRoster()` on **every** arrival at the desk,
including every `← PUT DOWN`; `ink()` (`:1253`, `:1261`, `:1280`) re-wipes every stamp on every entry
to the document, every open of the Orders sheet, and every unfold.

FINAL.md §4 sells these as "the one orchestrated moment — the roster lines settle in **on desk
load**" and "a stamp inks **on state change**". Neither is what the code does. Putting a document
down and watching sixteen lines you were just looking at slide up again 320ms at 60ms stagger is the
definition of motion as noise, and it will be the third thing a reviewer does. Gate both on first
paint.

---

### R17 · The ledger row's date drops to a second line depending on how long the state text is
**medium · confidence: certain · disposition: fix**

**What/where.** `index.html:520` / `:523` — `.ledger-line-1` is `flex-wrap: wrap` with
`.ledger-when { margin-left: auto }`.

**Evidence.** `shots/final-sheet-1440.png`: the ORDERED row keeps "AUG 11 · 14 DAYS" on line 1; the
DAMAGED row pushes "AUG 19 · WINDOW CLOSES AUG 26" onto its own line, and both rows then push
PDF / OPEN DOCUMENT onto a third. Probe (6): row heights 119px vs 152px for the same row grammar.
Today (`shots/w1440-ledger-sheet-orders.png`) both rows are two lines, date right-aligned on line 1.
Give the date a fixed column rather than `margin-left:auto` in a wrapping flex.

---

### R18 · The elevation amendment is presented against D4 without citing R72, which already relaxed it for the dock
**medium · confidence: high · disposition: fix (the framing)**

**What/where.** FINAL.md §3 cites `DECISIONS.md:15` ("No shadows. Anywhere. No exceptions.") and asks
the team to rule on three sites.

But `research/11-canon-digest.md` records **R72** (`DECISIONS.md:2589-2596`): "D4 (zero shadows)
relaxed for exactly two surfaces — the folio's pickup affordance … **and the dock's hairline
surface**." The drawer *is* the dock. So the amendment Kody is being asked to rule on is really
**two** new sites (margin chips, ledger sheet), not three, and one of those two buys nothing: the
ledger sheet's `0 1px 2px rgba(44,41,38,.08)` sits on top of a `rgba(44,41,38,.45)` scrim
(`index.html:499`) and is invisible in `shots/final-sheet-1440.png`. State that, and the ask shrinks
to one honest question: do the margin chips get a shadow?

---

### R19 · Every icon in the drawer and the studio contents has been dropped
**low · confidence: certain · disposition: fix**

**What/where.** `index.html:722-733` / `:989-1000` (drawer centre, text only), `:692-710` (contents —
one generic `&#9634;` for all seven Rooms/Ledgers entries and `&mdash;` for all five Begin entries).

**Evidence.** `shots/w1440-drawer-strip.png` — today the drawer carries a book, a person, brackets,
a ledger, a magnifier, and a **bell with a terracotta unread dot**. `shots/w1440-desk.png` — today's
contents carry a distinct glyph per line plus a dotted leader rule out to SHEET. FINAL.md §6 asserts
these surfaces are identical to today, and says the drawer has "no badge and no count" when today has
a badge dot.

For a refresh whose brief is "everything blends together", quietly removing the only iconographic
differentiation on two surfaces cuts against the goal, and it means the mock is not the honest
before/after it claims.

---

### R20 · Invented breadcrumbs in the drawer
**low · confidence: certain · disposition: fix**

`index.html:720` renders `DESK` after the wordmark; today's desk drawer
(`shots/w1440-drawer-strip.png`) has no breadcrumb at all. `:987` renders `VANDERSTEEN`; today's
document drawer (`shots/w1440-doc-project-rich.png`) reads `DOCUMENT`. Small, but FINAL.md §6 lists
the drawer as verbatim.

---

### R21 · The whisper's dismiss control is gone
**low · confidence: certain · disposition: accept or fix**

Today both desk whispers and the margin whisper carry an `×` (`shots/w1440-desk.png`,
`w1440-doc-project-rich.png`, `m390-desk.png`). The mock has none, while keeping the
"APPEARS ONCE · RECEDES ON USE" label that promises one. Accept if the ruling is about surfaces, not
affordances — but then the label is writing a cheque the mock does not cash.

---

### R22 · Dead tokens and dead stamp variants
**low · confidence: certain · disposition: fix**

`--fill-approval-tint` (`tokens.css:20`) — **0 uses**, and it is the fill R05 needs.
`--color-terracotta` (`:47`) — **0 uses**. `.stamp-delivered` / `.stamp-production`
(`index.html:472-475`) are defined and never applied, so `--fill-delivered-tint` and
`--fill-production-tint` are only exercised by the contrast gate, never by a pixel. FINAL.md §2
prints measured ratios for all five fills as though all five are on the page.

---

### R23 · The full-bleed band is built by overflowing its parent by 200px
**low · confidence: certain · disposition: accept (mock) / flag for the build**

`index.html:277` — `.stage-group { margin: 10px -200px 0; padding: 10px 200px 4px }` against
`.sheet-on-desk { padding: 0 200px 44px }`. Probe (12) at 1440: `section.roster 1238>1038` — the
roster is a 200px horizontal scroll container, hidden only by `.scroll { overflow-x: hidden }`
(`:193`). Same at 390 (`368>348`). Nothing escapes the frame (`pastRightEdge: []`, `frameScroll
1438/1438`) so it is cosmetically fine here, but it hard-codes the desk's gutter into the band and
will not survive a fluid desk. Separately, every `.act` is a 5px scroll container because `.da-pool`
is `inset: 2px -5px 5px` (`:204`) — harmless, worth knowing.

---

### R24 · The roster stagger does not exist at 390
**low · confidence: certain · disposition: fix**

`--i` is set on the six 1440 job lines (`index.html:628` …) and on **none** of the 390 lines
(`:1040` …). `animation-delay: calc(var(--i) * 60ms)` (`:557`) is invalid with `--i` undefined, so all
six 390 lines settle simultaneously. Either set `--i` or drop the animation at 390 deliberately.

---

### R25 · Smallest act hit target at 390 is 30px
**low · confidence: certain · disposition: accept or fix**

Probe (9): `390 smallest act hit height: 30px` (`.act` is `padding: 4px 2px 9px` on 11px mono,
`index.html:198`). Clears WCAG 2.2 AA 2.5.8 (24px) and misses the 44px comfortable-touch target.
Today's product has the same geometry, so this is a "while you are here", not a regression.

---

### R26 · The desk section mark wears the Project movement's colour on both section heads
**low · confidence: high · disposition: fix**

`index.html:271-272` — `.sect-mark i:nth-child(2)`/`(3)` take `var(--tab-project)`. So the roster head
*and* THE STUDIO head are marked in the Project movement's olive, a colour that now carries meaning
elsewhere on the same screen. Today's mark is clay (`shots/w1440-desk.png`). Use `--color-clay` and
keep the movement palette for movements.

---

### R27 · The red-letter zone is a bordered tinted box inside the band
**low · confidence: medium · disposition: accept**

`index.html:394` — `border-left: 2px` + `background: rgba(212,160,144,.12)` + padding, nested inside
`.band`. Reads as a panel within a panel, which canon's "never a card, no cards-within-cards" language
is unfriendly to. In practice it works (`shots/final-document-1440.png`) — it is the second thing you
see, which is right — and today's red-letter zone is also a tinted block. Accept, but know that the
band + the box is one nesting level more than today.

---

### R28 · The rail — in-flight fix
**low · confidence: certain · disposition: fix (already in progress)**

Probe (13): rail `#EFE7DA` vs the Project sheet `#F8EED0` = **1.060:1**, below today's 1.081:1 —
FINAL.md §2 states this cost honestly. The separation you actually perceive in
`shots/final-document-1440.png` comes from the hue break (neutral vs yellow) and the 1px border, not
from value. The in-flight move to `#E8E3DB` (1.098–1.106 per `source/direction-b.md:53-61`) is the
right direction; note `direction-b.md:65-66` that golden-hour, terracotta and sage inks fall under
4.5:1 on it, and that this mock currently puts clay-ink on the rail twice (`.spine-active-sub` :367,
the focus ring :157 — probe sampled 4.89:1 today, which is the closest to the floor of anything on
the rail). The margin chips going to `#FCFAF6` lifted paper also interacts with R18.

---

### R29 · Small omissions from today's surfaces
**low · confidence: certain · disposition: accept or fix**

Orders sheet head drops the **`?`** help act and the filter row drops **SELECT MULTIPLE**
(`shots/w1440-ledger-sheet-orders.png`); the document drawer drops **IN HAND TODAY ↓ MIN**
(`shots/w1440-doc-project-rich.png`); the letterhead drops today's dashed **NEEDS SETUP · 1 →** chip
(project-specific — fine to drop, but FINAL.md's "dashed goes back to meaning 'not filled in' and
appears nowhere" is doing double duty as both a rule and an omission).

---

### R30 · Unverifiable-against-today elements (declare or drop)
**low · confidence: medium · disposition: fix (declare)**

FINAL.md §7 declares five choices. Three more are not declared and are not in any shot:
the **NUDGE** act on approval rows (`index.html:827`, `:835`); the italic-Playfair **room-head**
device (`:445` — today's room head is a strata mark + "Not in a room yet · 3 OF 3 UNDERWAY"); and the
`.job-mark` default blue `--tab-brief` (`:298`), which now makes the dot on **The Byrne remodel**
match the BRIEF tab while sitting in the PROPOSAL band — visible in `shots/final-desk-1440.png`. The
dot colour is close to today's, but the new tab palette gives it an accidental second meaning.

---

## Click-through probe log

Script: `mock/final/review-clickthrough.mjs` · full output `mock/final/review-shots/probe-log.txt` ·
Chromium, `file://`, 1560×1000 viewport so `#frame` renders 1:1 at 1440.

**(1) Desk — roster lines and stage groups + order** → `review-shots/01-desk.png`
```
roster head : Every job · 16 live · 1 overdue
job lines   : 6      groups : 6
  Brief · 5      lines=1  h=92px   stock=rgb(237,238,237)  tab=rgb(92,113,134)
  Discovery · 1  lines=1  h=92px   stock=rgb(239,239,232)  tab=rgb(79,98,72)
  Direction · 3  lines=1  h=92px   stock=rgb(242,238,232)  tab=rgb(107,86,55)
  Proposal · 2   lines=1  h=92px   stock=rgb(244,237,228)  tab=rgb(139,106,58)
  Project · 4    lines=1  h=125px  stock=rgb(248,238,208)  tab=rgb(122,100,16)
  Install · 1    lines=1  h=92px   stock=rgb(246,237,231)  tab=rgb(154,78,57)
```
Order matches today's desk exactly. Counts in the heads match today. Line count does not (R04).

**(2) Vandersteen line → document** → `review-shots/02-document.png`
```
doc-shell running animations: [{"name":"doc-raise","dur":270,"state":"running"}]
mid-transition opacity/transform: 0 / matrix(0.986,0,0,0.986,0,0)   ← the raise ran
document on : true
sheet background : rgb(248,238,208)  = #F8EED0 (Project stock) ✓
charcoal bands   : 1  rgb(44,41,38)  rect x=261 w=1006 h=331 ; doc-col x=261 w=1006 ✓ bleeds to the column's edges
spine / margin   : rgb(239,231,218) both ✓
thumbs : 4 total — 2 linked (48×48, data: URIs), 2 slots (48×48) ✓
stamps : Decision due ×4, Ordered ×1, Damaged ×1 — all is-inked, fill scaleX(1)
         Decision due  ink=rgb(156,83,64) fill=rgb(244,230,224)
         Damaged       ink=rgb(156,83,64) fill=rgb(244,230,224)   ← identical (R05)
         Ordered       ink=rgb(124,94,48) fill=rgb(242,235,224)
```

**(3) UNFOLD Client approvals / FOLD Schedule**
```
approvals before: h=0   rows=0px    op=0   word="Unfold ↓"  type="DM Mono"/uppercase/11px
approvals after : h=119 rows=119px  op=1   word="Fold â†‘"   aria-expanded=true
schedule  before: h=236 rows=236px  op=1   word="Fold ↑"    type=Inter/none/14px
schedule  after : h=0   rows=0px    op=0   word="Unfold â†“" aria-expanded=false
```
Heights change and aria flips ✓. The word garbles (R01) and the two fold affordances are in different
type registers (R09).

**(4) Margin chip → anchored line** → `review-shots/03-chip-anchored.png`
```
money -> target=ffe-po        chipActive=true  targetBg=rgb(242,235,224)  anchored=true  transition=background-color  inView=true
time  -> target=phase-active  chipActive=true  targetBg=rgb(242,235,224)  anchored=true  transition=all (none declared) inView=true
```
Both anchor, both scroll into view, previous chip clears ✓. Same money pigment for both, and the
highlight is 1.022:1 against the sheet (R02, R14).

**(5) ← PUT DOWN → desk** — `desk on: true` ✓

**(6) Drawer Ledgers ↑ → Orders sheet → Esc** → `review-shots/04-orders-sheet.png`
```
sheet: open=true aria-hidden=false transform=none opacity=1
       focusMovedIntoDialog=false  activeElement="Ledgers ↑"      ← R15
  row: PO-2026-0418          thumb=photo 48px  stamp=Ordered  h=119px
  row: Brass-and-oak console thumb=SLOT  48px  stamp=Damaged  h=152px   ← R17
after Esc — open: false ✓
```

**(7) Tab through the first 15 focusables** → `review-shots/05-focus.png`
All 15 draw `outline: 2px solid rgb(124,94,48)` (`--color-clay-ink`) at `outline-offset: 2px`.
**15 of 15 have a visible ring.** Order: 4 dev-bar buttons (outside the frame), then + Capture a lead,
+ Open a project, Find anything ⌘K, Finish setting up, Full Room, Open the job, Reinhardt lake house,
Open the job, Kaminski condo, Open the job, The Byrne remodel — i.e. reading order ✓.
`buttons inside #frame (markup): 112 | reachable in the current state: 33` (R10).

**(8) `reducedMotion: 'reduce'`** → `review-shots/07-reduced-motion.png`
```
media matched: true | roster lines at rest & visible: true   ← bug X-05 avoided
  spine breath   animation=none 0s   transition=all 0s
  doc raise      animation=none 0s   transition=all 0s
  roster settle  animation=none 0s   transition=all 0s
  fold           animation=none 0s   transition=none 0s
  ledger slide   animation=none 0s   transition=none 0s
  stamp ink      animation=none 0s   transition=none 0s
  chip           animation=none 0s   transition=none 0s
  ffe row        animation=none 0s   transition=none 0s
  act            animation=none 0s   transition=none 0s
  ink pool       animation=none 0s   transition=none 0s
  job name       animation=none 0s   transition=all 0s
after opening the document under reduce — running animations: []      opacity 1
after unfolding under reduce      — running animations: 0             fold height immediately 119px
```
**Clean pass.** Every duration reports 0s, nothing animates, nothing is left invisible, and the fold
lands at full height on the same frame as the click.

**(9) 390 toggle** → `review-shots/06-390.png`
```
@390 frameScroll 388/388  pastRightEdge []          ← F24 drawn repaired ✓
390 roster head : Every job · 16 live               ← "· 1 overdue" dropped (R12)
390 whispers    : 1 (today has 2)                   ← (R12)
390 job lines   : 6 | mobile bar ["The studio / The Desk","Today / 0:47","··· / More"] rgb(44,41,38)
390 smallest act hit height: 30px                   ← (R25)
```

**(10) Computed boxShadow sweep per state (visible elements only)**
```
desk                     1  [nav.drawer]
document                 3  [button.margin-chip, button.margin-chip, nav.drawer]
orders sheet (over doc)  4  [button.margin-chip ×2, nav.drawer, div.ledger-sheet]
expected 1 / 3 / 2  ->  got 1 / 3 / 4
```
All four are `rgba(44,41,38,0.08) 0px 1px 2px 0px` = `--elevation-sheet`. No fourth site exists in
CSS (`grep -c box-shadow` → 3). See R11.

**(11) Requests to a non-`file:` URL** — `external requests: 0 []` · `page errors: 0 []`.
`grep -cE "https?://" index.html` → **0**. Fully self-contained ✓.

**(12) Horizontal overflow**
```
@1440 desk  frameScroll 1438/1438  pastRightEdge []
            internal scrollers: section.roster 1238>1038, div.desk-top 1043>1038,
                                div.desk-acts 448>443, button.act ×3 (+5px each)
@1440 doc   frameScroll 1438/1438  pastRightEdge []
            internal scrollers: div.rl-row 885>880, button.act ×5 (+5px each)
@1440 sheet frameScroll 1438/1438  pastRightEdge []
@390        frameScroll  388/388   pastRightEdge []
            internal scrollers: section.roster 368>348, button.act ×3
```
**No element crosses the frame's right edge at either width.** The internal scrollers are the
negative-margin full-bleed band and the `.da-pool` inset (R23), clipped by `overflow-x: hidden`.

**(13) Sampled text/ground contrast, computed from rendered styles** — expect ≥4.5
```
PASS   5.74  movement band — white ink on the Project tab       #FFF on rgb(122,100,16)   11/600
PASS   8.30  movement band — job need on the Project stock      rgb(78,67,57) on rgb(248,238,208)
PASS  12.49  tinted sheet — instrument value                    rgb(44,41,38)
PASS   5.86  tinted sheet — instrument label (faint)            rgb(101,89,78)
PASS   8.30  tinted sheet — seam summary                        rgb(78,67,57)
PASS  13.53  charcoal band — title                              rgb(250,247,242) on rgb(44,41,38)
PASS   6.21  charcoal band — vital label (clay)                 rgb(196,165,123)
PASS   5.09  charcoal band — red-letter label                   rgb(212,160,144) on the composited fill rgb(64,55,51)
PASS  10.84  charcoal band — red-letter text                    rgb(250,247,242) on rgb(64,55,51)
PASS   6.21  charcoal band — REVIEW DECISIONS act               rgb(196,165,123)
PASS   4.89  rail — spine ACTIVE (clay-ink)                     rgb(124,94,48) on rgb(239,231,218)   ← lowest on the rail
PASS   7.83  rail — running-index value
PASS   5.53  rail — PUT DOWN act
PASS   8.11  chip — eyebrow          PASS 12.21  chip — line     PASS 12.21  chip active — line
PASS   5.07  filled stamp ORDERED — word on its own fill
PASS   4.63  filled stamp DECISION DUE — word on its own fill                              ← floor
PASS   4.63  filled stamp DAMAGED — word on its own fill
```
**Every sampled pair clears 4.5:1**, floor 4.63. The token gate agrees:
`node research/contrast-check.mjs mock/final/tokens.css` → **0 failure(s), 54 warning(s)**, and
`tokens.css` is byte-identical to the `:root` block. The failures this direction has are not
text-contrast failures — they are the *ground-to-ground* separations the gate does not measure:
```
stamp fill vs its ground   ordered  1.022:1 on the Project sheet | 1.136:1 on paper
                           damaged  1.052:1 on the Project sheet | 1.168:1 on paper
rail vs the sheet it flanks         1.060:1
stock vs neighbouring stock         1.001 – 1.007:1  (all six)
```

---

## What I would tell the team in one paragraph

You have the anchor. The charcoal band is the best single move in this program — it gives the
document a masthead, it puts the red letter where the eye already is, and it does it without making
the product look like anything other than itself; keep it, keep the 40px Playfair, keep the three
rule weights, keep the motion, which is disciplined and completely stilled under reduced-motion. What
you do not yet have is a *value* system: the six stocks are the same lightness as each other
(1.001–1.007:1), the rail is the same lightness as the sheet (1.060:1), and the stamp fills and the
anchored-line highlight are the same lightness as the ground they sit on (1.022–1.052:1) — every one
of those separations was tuned against the untinted paper and then the paper was tinted underneath
them, so on the one sheet you actually drew, the filled stamps are not filled and the margin chip's
highlight is not a highlight. Re-tune the fills and the rail *against the stock*, give the six
movements a deliberate value ladder rather than six independent offsets from the desk ground, and
split DECISION DUE from DAMAGED with the approval tint you already declared and never used. Then two
honesty items before this goes to the ruling: the desk has only ever been drawn with one line per
band when the product has sixteen, so redraw at least BRIEF · 5 at its real count before anyone
decides that bands are the answer; and the walnut nightstands are a photograph of a live-edge coffee
table, which is the one thing the mock's own rules say a thumbnail may never be. Fix the mojibake
first — `FOLD Â†'` appears on the very first click of the click map — and re-title the elevation ask,
because R72 already gave the dock its shadow and the ledger sheet's is invisible under the scrim, so
what you are really asking Kody to rule on is a shadow on two margin chips.

---

## Re-review (2026-08-28)

Second reviewer; did not build it, did not fix it. Sources: this file's own thirty findings,
`FINAL.md` (including §9's dispositions and the two design-lead rulings — the rail at `#E8E3DB` with
margin chips as lifted paper `#FCFAF6`, and one stamp recipe for every filled stamp), `index.html`,
`tokens.css`, all six `shots/*.png` and all `review-shots/*.png`, today's truth
(`shots/w1440-desk.png`, `w1440-desk-roster-rows.png`, `w1440-doc-project-rich.png`,
`w1440-ffe-lines.png`, `w1440-ledger-sheet-orders.png`, `w1440-drawer-strip.png`, `m390-desk.png`),
and `source/specimen.md`. `review-clickthrough.mjs` was corrected — its stale single
"expected sheet 2" is now four per-state expectations (the sheet opened from the desk **and** from
the document), the Tab walk runs in the desk state **and** the document state, the contrast sample
set was widened to the six tab labels / the rail / the chips / the anchored row / the untinted sheet,
and three new probes were added (fill-vs-fill separation, motion replay on `PUT DOWN`, and an
all-elements non-zero-duration sweep under reduced motion). Both scripts were re-run.

---

### 1. R01-R30, one line each

| # | Verdict | Proof |
|---|---|---|
| R01 | **resolved** | `LC_ALL=C grep -cP "[^\x00-\x7F]" index.html` -> **0**. Probe (3): `word= Fold ↑` after UNFOLD, `word= Unfold ↓` after FOLD. The JS reads `'Fold ↑' : 'Unfold ↓'` (`index.html:1503`). |
| R02 | **resolved** | Probe (13): ordered **1.182**, decision **1.183**, damaged **1.181**, anchor **1.186** against the Project sheet `rgb(248,238,208)`; charcoal word 10.55-10.57 on each. `shots/final-document-ffe-1440.png` — ORDERED / DAMAGED / DECISION DUE all read as filled. |
| R03 | **disputed (ruled, stocks) + resolved (tabs)** | Stocks unchanged: neighbours **1.001-1.007:1** (probe 13) — the design lead ruled hue-only for grounds. Tabs rebuilt and now carry the whole naming load: value steps 1.080 / 1.081 / 1.097 / 1.105 / 1.110, white ink 5.22 -> 8.20, six hues >= 30 deg apart (probe 13). My original objection stands as a *risk transferred*, not a defect: if the tabs are ever cropped, greyed or dropped, the six ranks collapse. |
| R04 | **resolved** | Probe (1): `job lines: 16`, Brief h=302px / Direction h=197 / Proposal h=144 / Project h=283. `shots/final-desk-1440.png` draws BRIEF at its real five. |
| R05 | **partly** | Fills now differ (`#E1DDC2` vs `#EFD9BF`, `index.html:500`/`:502`) — but probe (13) reports both stamps at border `rgb(156,83,64)` with the same charcoal word, and the two fills are **1.002:1** apart in value. See **R33**. |
| R06 | **resolved** | `grep -o 'crop-[a-z-]*'` -> **3 x `crop-dining-table`**, nothing else. Probe (2): 6 thumbs, 1 linked, 5 slots. `live-edge-coffee-table.jpg` is gone from the file. |
| R07 | **resolved** | `.thumb.is-unlinked` carries a hairline diagonal (`index.html:477`); visible on all five slots in `shots/final-document-ffe-1440.png`. Cost noted at **R37**. |
| R08 | **partly (accept-with-note, as disposed)** | The bands are broken by 16 lines, `.sect-mark` is clay again (`:289-290`), and exactly one terracotta mark survives (`grep`: 2 `is-urgent` across two screens = 1 per screen). But at 900px the desk's first screen is still greeting -> colour fields -> rule, and the one overdue thing is below the fold. The taxonomy-vs-state balance is still the ruling. |
| R09 | **resolved** | Probe (3): both fold words compute `"DM Mono" / uppercase / 11px`. `grep -c 'rh-ledger .act'` -> 0. |
| R10 | **resolved (the claim)** | Probe (7): markup 156; reachable **desk 54**, **document 36**. `shoot-final.mjs` prints 54 / 36 / 71 / 49. "112" is gone. |
| R11 | **resolved (the claim)** | Probe (10): desk **1**, sheet-from-desk **2**, document **3**, sheet-from-document **4** — all `rgba(44,41,38,0.08) 0px 1px 2px 0px`. `shoot-final.mjs` prints all four and they match. |
| R12 | **resolved** | Probe (9): head `Every job · 16 live · 1 overdue`, **2** whispers, **16** lines. The 390 roster markup is byte-identical to the 1440 one (`diff` of lines 664-790 vs 1164-1290 -> empty). |
| R13 | **resolved** | Four `.room-head`s (`:977`, `:990`, `:1003`, `:1027`), Mudroom "5 lines · 3 ordered · 2 unspecified" with both unspecified lines drawn. |
| R14 | **resolved** | Probe (4): both chips -> `rgb(225,220,201)` = `--fill-anchor-tint`, both targets `transition: background-color`. But the new transition opened a reduced-motion hole — **R32**. |
| R15 | **resolved** | `aria-modal="true"` (`:1328`); probe (6) `focusMovedIntoDialog: true`; 40 Tab presses never leave the dialog; Esc **and** a scrim click both restore focus to `Ledgers ↑`; closed wrapper is `display:none` so 0 buttons stay reachable. Desk-beneath `inert` still absent, as declared. |
| R16 | **UNRESOLVED (roster) / resolved (stamps)** | Stamps: 0 animations on re-entry to the document. Roster: **16/16 `settle` animations RUNNING 50ms after `← PUT DOWN`** and **16/16 after a 390 -> desk toggle**, transform `translateY(14px)` -> 0 measured mid-flight. See **R31**. |
| R17 | **resolved** | `.ledger-line-1` is a four-column grid (`:549`); probe (6) rows 119px / 135px with the date on line 1 in both; `shots/final-sheet-1440.png`. |
| R18 | **resolved (the framing)** | FINAL §3 now cites R72 alongside D4, names **two** new sites, and states that the sheet's shadow is invisible under the `.45` scrim. |
| R19 | **partly** | Drawer icons + terracotta bell dot back; ROOMS/LEDGERS carry seven distinct glyphs (`:794-806`). Still missing: today's **dotted leader rule** out to SHEET / ↗ (`grep -c leader` -> 0) and BEGIN's four per-item glyphs (`:806-810` are 5 x `&mdash;`). See **R43**. |
| R20 | **resolved** | Desk drawer = `Patina`, no crumb (`:821`); document drawer = `Patina` + `Document` (`:1110-1111`). |
| R21 | **resolved — and better than FINAL claims** | 3 x `whisper-x` (`:654`, `:1089`, `:1155`): the first desk whisper, the margin whisper, the 390 whisper. Today's *second* desk whisper has no `×` (`shots/w1440-desk.png`) and the mock correctly gives it none. §9's "Both desk whispers … carry the ×" is the thing that is wrong — see **R46**. |
| R22 | **partly** | `--fill-production-tint`, `--fill-delivered-tint`, `.stamp-production`, `.stamp-delivered` all `grep` -> 0; approval tint, terracotta and dusty-blue are all live. Still declared and never used: `--color-golden-hour-ink`, `--color-sage-ink`, `--duration-fast`. See **R42**. |
| R23 | **resolved (accepted; I concur)** | Probe (12): `section.roster 1238>1038` at 1440, `368>348` at 390, `pastRightEdge: []` at every width and state. Clipped by design; a build note, not a picture defect. |
| R24 | **resolved** | All **32/32** job lines carry `--i` (`grep -o 'job-line" style="--i:[0-9]*' | wc -l` -> 32); stagger capped at `min(var(--i),6)` (`:585`). |
| R25 | **resolved (accepted; I concur)** | Probe (9): smallest 390 act **30px**. FINAL §9 says 29px — see **R47**. Today's geometry is identical, so it is a build contract, not a mock regression. |
| R26 | **resolved** | `.sect-mark i:nth-child(2)/(3)` -> `var(--color-clay)` (`:289-290`). |
| R27 | **resolved (accepted; I concur)** | Unchanged (`:422` inside `.band` `:411`). It works: the red-letter row is the second thing you see. But see **R35** — the box also *moved*. |
| R28 | **resolved** | Probe (13): rail `rgb(232,227,219)` vs the Project sheet **1.103:1**; lowest rail text = clay-ink **4.70:1**; chips are lifted paper `rgb(252,250,246)`, chip line **13.87:1**. |
| R29 | **resolved** | `?` and SELECT MULTIPLE back in the sheet head/filters; `IN HAND TODAY 0:47` in the document drawer; bell dot present (`shots/final-sheet-1440.png`, `final-document-1440.png`). Two register deltas remain — **R38**. |
| R30 | **resolved (declared)** | `grep -c NUDGE` -> 0. The italic room head is mirrored with its strata mark, per `w1440-ffe-lines.png`. `.job-mark` follows `desk-roster.tsx`: 18 `is-none` / 12 quiet / 2 urgent across both screens = 9 / 6 / 1 per screen. |

**Counts — resolved 24 · partly 4 (R05, R08, R19, R22) · unresolved 1 (R16) · disputed 1 (R03).**

---

### 2. New findings

Severity is cost to the ruling, not effort. Every finding is reported; the orchestrator filters.

#### R31 · The roster still re-settles on every return to the desk — R16's headline case is live
**high · confidence: certain · disposition: fix**

`settleRoster()` is guarded (`hasSettled`, `index.html:1438-1448`) but the `.settling` class it adds is
**permanent**, and `.screen { display: none }` (`:206`) cancels a running CSS animation and replays it
when the element is shown again. So the guard never gets a chance to matter.

```
BOOT+1500ms    : 16 lines, all animations "finished"
PUT DOWN +50ms : 16 lines "running@42",  transform matrix(1,0,0,1,0,14)   <- translateY 14px again
PUT DOWN+170ms : 16 lines "running@167", transform matrix(1,0,0,1,0,6.4)
PUT DOWN+1.1s  : 16 lines "finished"
390 -> desk    : job-line settle animations RUNNING = 16 / 16
```

FINAL §4 sells this as fixed in its own words — "`settleRoster()` runs exactly once, on first paint —
putting a document down no longer re-settles sixteen lines you were just reading." It does. And it is
now *worse* than at first review, because there are sixteen lines instead of six. This is the third
thing a reviewer will do (open a document, put it down) and it is the one motion in the file that
reads as noise. The fix is to remove `.settling` when the animation ends, or to gate the class on the
screen's first display rather than on a module-level boolean.

#### R32 · Reduced motion: six `.phase-row` transitions survive at 300ms — the R14 fix opened the hole
**medium · confidence: certain · disposition: fix**

The stilled block (`:588-601`) names `.margin-chip, .ffe-row` but not `.phase-row`, which gained the
same `background-color` transition in the R14 fix (`:456`). New all-element sweep:

```
elements in #frame with ANY non-zero duration: 6 of 1003
  div.phase-row -> trans 0.3s (background-color)   x6
reduce: phase-row anims 30ms after the Time chip: ["background-color:running:300"]
```

So under `prefers-reduced-motion: reduce` the Time chip's own anchor — half of the interaction FINAL
§7 calls "the point" — still fades over 300ms while the Money chip's snaps. Everything else is 0s;
this is a one-selector miss, but it is in the exact place the last round was told to make the two
halves behave alike.

#### R33 · DECISION DUE and DAMAGED still share a border and a word; only the fill hue tells them apart
**medium · confidence: certain · disposition: fix or accept explicitly**

```
ordered   border rgb(124,94,48)  / word rgb(44,41,38)
decision  border rgb(156,83,64)  / word rgb(44,41,38)
damaged   border rgb(156,83,64)  / word rgb(44,41,38)      <- identical to decision
decision vs damaged fill = 1.002:1
```

FINAL §2 states the recipe as "State is carried by hue, **in the border and in the fill**." For these
two the border is byte-identical, so state is carried by the fill hue alone — a sage-over-sheet
`#E1DDC2` against a terracotta-over-sheet `#EFD9BF`, 19 deg apart at the same lightness. R05 asked for
these two to stop being the same stamp; they are now 98% the same stamp. Giving DECISION DUE its own
border ink (clay-ink is already spent on ORDERED; golden-hour-ink is declared and unused — see R42)
closes it at the cost of nothing.

Separately: `--fill-approval-tint` is **sage**, canon's settled/approved pigment, and it is now the
fill for a decision the designer *owes*. That is a semantic inversion worth a sentence of defence or
a different pigment.

#### R34 · The four fills are one value — the R03 disease has moved into the stamps
**medium · confidence: certain · disposition: accept-with-note or fix**

```
ordered vs decision = 1.001    ordered vs damaged = 1.000    ordered vs anchor = 1.004
decision vs damaged = 1.002    decision vs anchor = 1.003    damaged vs anchor = 1.004
```

The ruling ("one recipe, a common >= 1.15:1") delivered separation *from the ground* and, as a direct
consequence, zero separation *from each other*. Four different meanings — money ordered, a decision
owed, a freight claim, "you asked for this line" — now sit on one plane at one lightness, told apart
only by hue, which is the objection R03 raised about the stocks and which the design lead accepted
there for **grounds**. A stamp is not a ground; it is an object with an edge, which is the case D4 was
written about. It is the right trade for legibility and it should be ruled on knowingly, not inherited.

#### R35 · The red-letter zone moved above the instrument row — an IA change the preamble says does not happen
**medium · confidence: high · disposition: declare**

`index.html:874` `.band` contains the letterhead **and** `:887` `.red-letter`; the instrument row
starts at `:896`. Today (`shots/w1440-doc-project-rich.png`) the order is letterhead -> "THE JOB ·
PROJECT" + the eight instrument rows -> **then** NEEDS ATTENTION · IN ONE PLACE -> then the acts.
FINAL's preamble reads "same information architecture … no surface moves"; §6 lists the red-letter
zone among things that stay identical. It is the same content in a different rank. It is also, in my
read, the single best thing about the document — but it should be on the ruling as a move, not
smuggled in as a paint job, because it is the one change here that a build cannot do with CSS alone.

#### R36 · The document's Money region, its accounts seam and its closing whisper are not drawn
**medium · confidence: certain · disposition: declare or draw**

Today's document (`w1440-doc-project-rich.png`) carries, below Pieces: a full **Money** region — its
own eyebrow "THE MONEY · ONE REGION", a 24px head, four acts (DRAW AN INVOICE inked / AMENDMENT /
HOURS · THIS PROJECT -> / FOLD ↑), seven money rows each with a mono sub-line, a WORKING BUDGET block
and an AUTHORIZATIONS & TRADE SCOPES block — then the **"The accounts · this project"** seam, then the
closing whisper ("- You're on the call sheet as lead. Who else is on the job?" + FROM THE ROLODEX /
NEW PERSON / LATER). None of it is in the mock. Also absent: the **"Schedule dates"** seam.

That is the densest, most typographically crowded region in the product, and the direction's three
rule weights and three muted inks are never tested on it. FINAL §7 declares seven choices; this is an
eighth and it is undeclared.

#### R37 · Five of the six Pieces lines are the same grey diagonal slot
**medium · confidence: high · disposition: accept-with-note**

Probe (2): `thumbs: 6 total - 1 linked, 5 slots`. The diagonal fixes R07 — it no longer reads as a
broken `<img>` — but `shots/final-document-ffe-1440.png` is now a column of five identical empty
squares beside one photograph, and the Orders sheet is one photograph and one slot. The 48px crop is
one of the four material moves under ruling and the picture makes the case *against* it as much as
for it: at real coverage most lines have no image, so the column is mostly furniture for absence. If
the crop survives the ruling, the honest question is whether the slot should exist at all when a room
has no linked photographs, or whether the column collapses.

#### R38 · Two undeclared register changes inside today's row grammar
**low · confidence: certain · disposition: declare**

- `.ffe-name` is **Playfair italic** (`:478`); today's FF&E line name is Inter regular
  (`w1440-ffe-lines.png` — "Møbler Lounge Chair — Bouclé · ×2").
- `.ffe-vendor` is **DM Mono uppercase** (`:479`) — "STURDY OAK WOODWORKS · DODGEVILLE WI"; today's is
  Inter sentence case ("Nordic Atelier"). §1 promises "mono labels 11-12px **and fewer of them**";
  this adds one per FF&E line.
- The ledger row's `Open document &#8594;` (`:1370`, `:1390`) is mono uppercase; today's reads
  lowercase "open document ->" (`w1440-ledger-sheet-orders.png`), and today's date is a small serif
  "~May 6" where the mock prints `AUG 11 · 14 DAYS` in mono caps.

None is wrong; all three are restyles presented inside a §6 list headed "what stays identical".

#### R39 · Pieces no longer folds, and its head loses two of today's four acts
**low · confidence: certain · disposition: fix or declare**

Today's Pieces region head carries **SPEC THE N UNSPECIFIED ->**, **ADD A LINE**, **BILL 3 UNINVOICED
LINES ->** and **FOLD ↑**. The mock's `.rh-ledger` (`:970`) carries the first two only. FINAL's
preamble promises "Nothing folds that did not fold" — the mirror of that promise is broken here: a
region that folds today does not fold in the mock. Also dropped from the region: "Plan the project
work" + ADD THE FIRST TASK, the `FOLIO + FILE` line, and the room head's own ADD A LINE.

#### R40 · Six invented phase date ranges
**low · confidence: certain · disposition: declare**

`index.html:953-958` print `MAR 2 - MAR 20`, `MAR 23 - MAY 8`, `MAY 11 - JUL 3`, `JUL 6 - SEP 11`,
`SEP 15 - SEP 25`, `SEP 28 - OCT 2`. `source/specimen.md` states only the open date (2026-03-02), the
install date (2026-09-15) and "phase 4 of 6". FINAL §7 states "No number, date or count is invented
beyond it." Twelve dates are. They are plausible interpolations between the two real endpoints — the
claim is what needs the edit, not the dates.

#### R41 · `CALL SHEET · 3`
**low · confidence: high · disposition: declare**

`index.html:911`. Today's document reads **CALL SHEET · 0** (`w1440-doc-project-rich.png`) and the
specimen names no call-sheet count (its "3" is *The Post's* three unread). Derivable as Marit + Dale +
Middlewest, but not stated — and §6 lists "CALL SHEET · 3" among the strings that stay identical.

#### R42 · Three tokens still declared and never used; `--duration-fast` is shadowed by five literals
**low · confidence: certain · disposition: fix**

Sweep of every `--*` in `tokens.css` against `var(--*)` in `index.html`:
`--color-golden-hour-ink`, `--color-sage-ink`, `--duration-fast` -> **0 uses each**. The first two are
carried so the contrast gate can measure them, which is defensible and worth one comment line; the
third is not — `150ms` is hardcoded five times (`:222`, `:228`, `:235`, `:241`, `:249`) beside a token
that says 150ms. R22 asked for exactly this sweep and it was run only over the fills.

Note also that `--color-golden-hour-ink` is the unused pigment ink that would close R33.

#### R43 · The studio contents lose today's dotted leader, and BEGIN loses its four glyphs
**low · confidence: certain · disposition: fix**

`grep -c leader index.html` -> **0**. Today (`w1440-desk.png`, `m390-desk.png`) every ROOMS and LEDGERS
line runs a dotted leader rule from the name out to its `↗` / `SHEET` tag — it is the device that makes
that block read as a table of contents rather than three lists. And today's BEGIN column carries a
glyph after the em-dash on four of five lines (pencil, document, key, tag); the mock prints
`&mdash;` five times (`:806-810`). §9's R19 says the contents "get their own glyph per line"; two of
the three columns did.

#### R44 · The Orders sheet moves focus to the `?` help act
**low · confidence: high · disposition: accept or fix**

Probe (6): `activeElement: "?"`. `sheetFocusables()` returns `.ledger-sheet button` in DOM order and
`?` is first (`:1475`, `:1482`). It satisfies "moves focus to its first act", but the first thing a
keyboard user lands on inside a dialog they just opened is an unlabelled help mark rather than the
sheet itself or PUT BACK. Focusing the sheet container (`tabindex="-1"`) is the usual answer.

#### R45 · Still no `<meta charset>`
**low · confidence: high · disposition: fix (one line)**

`grep -c charset index.html` -> **0**. Harmless today, because the file is pure ASCII and ASCII is a
subset of every fallback encoding. But R01 was a *silent* failure — nothing in the shoot caught it,
only a click did — and the only thing standing between this file and its return is a discipline no
gate enforces at edit time. One `<meta charset="utf-8">` costs nothing and makes the ASCII rule a
belt rather than the only strap. (FINAL is right that the artifact skeleton owns the charset when
published; the file is also opened directly from `file://` by both scripts and by every reviewer.)

#### R46 · FINAL §9 R21 claims both desk whispers carry the `×`; only one does — correctly
**low · confidence: certain · disposition: fix (the claim)**

Three `whisper-x` buttons exist and they are in the right three places. Today's second desk whisper
("The studio isn't fully set up. FINISH SETTING UP") has no `×`, and the mock matches it. The
disposition text overstates the file and, if anyone implements the sentence rather than the file, it
would introduce an affordance today does not have.

#### R47 · FINAL §9 R25 says the smallest 390 act is 29px; it measures 30px
**low · confidence: certain · disposition: fix (the claim)**

Probe (9): `390 smallest act hit height: 30px`. Trivial, but it is a number in a document whose
authority rests on its numbers being re-runnable.

#### R48 · The six movement bands stay saturated under the `.45` scrim
**low · confidence: medium · disposition: accept**

`shots/final-sheet-1440.png`: with the Orders sheet open over the desk, the text behind the scrim is
gone but the six colour fields are not — the desk reads as six coloured stripes with a white card on
top. Today's scrim covers a flat ground and simply recedes. It is a consequence of spending the
colour budget on grounds; worth seeing before ruling, not worth changing here.

---

### 3. Probe outputs, in brief

**Reduced motion** — `media matched: true | roster lines at rest & visible: true`. Every named probe
reports `animation=none 0s` and `transition=… 0s`; opening the document under reduce runs no
animations and lands at opacity 1; unfolding lands at the full 119px on the same frame. The new
all-element sweep found **6 of 1003** elements in `#frame` with a non-zero duration — all six
`.phase-row`, `trans 0.3s (background-color)` (**R32**). Everything else is 0s.

**Shadow sweep, per state** — every one `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px` = `--elevation-sheet`:

```
desk                                   1  [nav.drawer]
orders sheet (opened from the DESK)    2  [nav.drawer, div.ledger-sheet]
document                               3  [button.margin-chip x2, nav.drawer]
orders sheet (opened from the DOCUMENT) 4  [button.margin-chip x2, nav.drawer, div.ledger-sheet]
expected 1 / 2 / 3 / 4  ->  got 1 / 2 / 3 / 4
```

`grep -n box-shadow index.html` -> **three lines** (`:348`, `:513`, `:532`), all
`box-shadow: var(--elevation-sheet)`, against the single `:root` declaration at `:140`. No fourth site.
`shoot-final.mjs` prints the same four counts.

**External requests** — `external requests: 0 []` · `page errors: 0 []` · `grep -cE "https?://"` -> **0**.

**Overflow** — `pastRightEdge: []` at every width and state. `@1440 desk` / `doc` / `sheet`
`frameScroll 1438/1438`; `@390 frameScroll 388/388`. The only internal scrollers are the declared
full-bleed band (`section.roster 1238>1038` at 1440, `368>348` at 390) and the `.da-pool` inset
(`button.act` +5px) — R23, accepted.

**Contrast** — 43 sampled pairs, computed from rendered styles. **Every pair >= 4.5:1; the floor is
4.70** (clay-ink on the rail, the spine's ACTIVE sub-line). Selected:

```
tab labels (white on tab)   BRIEF 5.22 · DISCOVERY 5.80 · DIRECTION 6.40 · PROPOSAL 7.03 · PROJECT 7.59 · INSTALL 8.20
movement band               job name on Brief stock 12.43 · need 8.26 · need on Project 8.30
                            OVERDUE line on Project stock 4.87 · OPEN THE JOB on Install stock 5.88
desk ground                 roster lede 7.86 · whisper 7.54
tinted sheet                instrument value 12.49 · faint label 5.86 · seam summary 8.30
charcoal band               title 13.53 · vital 6.21 · red-letter label 5.09 · red-letter text 10.84 · act 6.21
rail #E8E3DB                spine ACTIVE label 11.32 · IN THE MARGIN 11.32 · running-index value 7.52
                            margin whisper 6.31 · PUT DOWN 5.32 · + NOTE 5.32 · clay-ink ACTIVE 4.70  <- floor
chips (lifted paper)        eyebrow 9.22 · line 13.87 · sub 6.51
chips (anchor fill)         eyebrow 6.99 · line 10.52 · sub 4.94 · anchored ffe vendor 6.99
stamp words (charcoal)      ORDERED 10.56 · DECISION DUE 10.55 · DAMAGED 10.57
untinted sheet              ledger state 7.73 · ledger date 6.51
```

Ground-to-ground, which the gate does not measure:

```
stamp/anchor fill vs the Project sheet   1.181 - 1.186:1   (was 1.022 - 1.052)   FIXED
rail vs the sheet it flanks              1.103:1           (was 1.060)           FIXED
stock vs neighbouring stock              1.001 - 1.007:1   unchanged, by ruling  (R03)
fill vs fill                             1.000 - 1.004:1   new                   (R34)
```

Token gate: `node research/contrast-check.mjs mock/final/tokens.css` -> **0 failure(s), 36
warning(s)**, matching FINAL §2 exactly; `awk '/^:root \{/,/^\}/' index.html | diff - tokens.css` is
empty, so `tokens.css` is still byte-identical to the block it gates.

**Focus** — 15 of 15 in the **desk** state and 15 of 15 in the **document** state draw a visible ring,
`2px solid rgb(124, 94, 48)` at `outline-offset: 2px` (and `rgb(196, 165, 123)` for the one stop
inside the charcoal band — deliberate, 6.21:1). Both walks follow reading order. Reachable counts:
desk **54**, document **36**, sheet **71**, 390 **49**, against **156** buttons of markup across three
screens.

**ASCII** — `LC_ALL=C grep -cP "[^\x00-\x7F]" index.html` -> **0**.

---

### 4. Fidelity against today's shots

**Confirmed.** Sixteen roster lines in today's real order and at today's real counts — BRIEF · 5,
DISCOVERY · 1, DIRECTION · 3, PROPOSAL · 2, PROJECT · 4, INSTALL · 1 (probe 1; matches
`w1440-desk.png` group for group). **Four rooms** in Pieces — Dining room 8 · Living room 14 ·
Primary bedroom 9 · Mudroom 5 = 36 lines, each allocation traceable to `specimen.md:25-27`. **One
real product crop** — `grep -o 'crop-[a-z-]*'` returns `crop-dining-table` and nothing else, used on
the Pieces line and the Orders row for the same dining set; the mislabelled live-edge file is gone.
Also restored and verified against today: both whispers with `APPEARS ONCE · RECEDES ON USE` and
`FINISH SETTING UP`; the three desk acts and their sub-lines; the drawer's icon set, `HANDS FREE`,
`IN HAND TODAY 0:47`, the bell's terracotta dot and the `Leah Hartwell / LEAH HARTWELL` chip; the
sheet's `?`, `SELECT MULTIPLE`, four tabs and `THROUGHPUT`; the instrument row's eight labels; the
act ledger's four acts; the colophon's four acts; the job acts (`OPEN THE JOB` / `REVIEW DECISIONS` /
`OPEN THE SCHEDULE`); and the job-mark rule (9 no mark / 6 dusty-blue / 1 terracotta per screen).

**Still invented, or beyond what is declared.**

1. Six phase date ranges, `MAR 2 - MAR 20` … `SEP 28 - OCT 2` (**R40**).
2. `CALL SHEET · 3` — today reads `· 0`, the specimen states no count (**R41**).
3. Kaminski condo's need line, "Milwaukee WI · quiet · nothing needs your hand" — the specimen names
   Kaminski but states no need for it; the wording is today's, the pairing is the mock's.
4. The FF&E line's Playfair-italic name and DM Mono uppercase vendor, and the ledger's uppercase
   `OPEN DOCUMENT ->` (**R38**).
5. The red-letter zone's new position above the instrument row (**R35**).
6. The 48px thumbnail column itself, in both the FF&E rows and the Orders rows — today has no
   thumbnails anywhere (declared as a material move in §1; noted here because it is the one device
   with no "today" to compare against).

**Still missing from today.**

1. The entire **Money region** — head, `THE MONEY · ONE REGION` eyebrow, DRAW AN INVOICE / AMENDMENT /
   HOURS · THIS PROJECT -> / FOLD ↑, the seven money rows with their mono sub-lines, the WORKING
   BUDGET block, the AUTHORIZATIONS & TRADE SCOPES block — plus the **"The accounts · this project"**
   seam and the **"Schedule dates"** seam (**R36**).
2. The document's closing whisper and its three acts (FROM THE ROLODEX / NEW PERSON / LATER)
   (**R36**).
3. The Pieces region head's **FOLD ↑** and **BILL N UNINVOICED LINES ->**, so Pieces does not fold
   (**R39**); with it, "Plan the project work" + ADD THE FIRST TASK, `FOLIO + FILE`, and the room
   head's own ADD A LINE.
4. The studio contents' **dotted leader rule** and BEGIN's four per-item glyphs (**R43**).
5. The letterhead's dashed `NEEDS SETUP · 1 ->` chip — declared, dropped on purpose, and correct for
   this specimen.

Nothing on today's surfaces is contradicted; the gaps are all omissions, and five of the six above are
regions the direction has simply never been drawn on.

---

### 5. Revised verdict

Everything the first review called a blocker is genuinely fixed, and fixed with numbers that
re-run: the file is ASCII, the stamps are filled at 1.18:1 over the sheet they sit on with a charcoal
word at 10.5:1, the rail clears its sheet at 1.103:1, the desk draws sixteen lines instead of six, and
the walnut nightstands are no longer a photograph of a chair. What is left is one live motion defect
and a family of value collapses that the ruling created rather than removed — the roster still
re-settles all sixteen lines on every `← PUT DOWN` and every 390 toggle (R31, measured), and the four
stamp fills that were pulled off the ground are now within 1.004:1 of **each other**, with DECISION
DUE and DAMAGED sharing a border ink and a word (R33, R34). Ship-blocking, in my read: R31 and R32
only; everything else on the new list is either a claim to correct in FINAL or a choice to declare
before Kody rules.

**For the team.** It is alive now, and it is still Patina — the charcoal band gives the document the
masthead it never had, the 40px Playfair lands first and the red-letter row lands second, and the six
bands turn a flat list into a shelf you can find your place in without anything looking like a
different product. The hierarchy is real on the document (title, red letter, then the yellow sheet
and its instruments) and only half real on the desk: at 900px you see the greeting, then the colour
fields, then the roster rule — and the one overdue thing is still below the fold, wearing a 7px dot
inside a band whose colour is louder than it is, so the desk spends its budget on *which movement*
and almost none on *what needs you*. The stamps do read as stamps now: the wipe, the 1.5deg tilt, the
1.5px pigment edge and the charcoal word are unmistakable; what they do not yet read as is four
*different* stamps, because every fill sits at one lightness and two of the three drawn share a
border, so give DECISION DUE its own edge before this ships. The motion helps exactly where it
happens once — the 270ms raise, the stamp inking on its state change — and hurts where it repeats:
fix the roster replay first, because it is the third click of the click map. What I would refuse:
refuse the ledger sheet's shadow, which is invisible under a `.45` scrim and leaves one honest
elevation question (the two margin chips); refuse any more saturation on the desk bands until the
state signal out-ranks the taxonomy signal; refuse the 48px crop as a general device on the strength
of one photograph and five empty slots; refuse the FF&E line's italic-Playfair-plus-mono-vendor
restyle, which adds a mono label per line under a direction that promised fewer; and refuse to call
the document proven until the Money region — the densest thing in the product and the one this mock
never drew — has been drawn in it.
