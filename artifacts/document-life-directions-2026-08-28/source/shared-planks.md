# Shared planks — the repairs all three directions adopt identically

A plank is a repair the surface needs whichever direction the team rules for. Every plank
below is a token, a floor, a fill or a ground. **No plank adds a surface, moves a region,
changes a label, or changes what any act does.** Where a direction restates a plank at its
own value (Direction A's stocks are deeper, so A's inks are one step darker), the direction
says so in its own token table; the plank is still adopted, not replaced.

Sizes: **S** = tokens only · **M** = tokens plus a class sweep in named files · **L** = a sweep
across the whole Document tree, or a component's own markup and API. Counts below come from
`apps/designer-portal/src/components/document`:

| grep | literals | files |
|---|---|---|
| `text-\[<n>px\]` | **1,749** | **252** |
| `border-[var(--color-pearl)]` | **502** | **172** |
| `font-mono` | **1,029** | — |

---

## SP-01 · A 14px body floor and an 11px mono floor

**Closes** F11, F12, F13, F14, F21, F22.

**Change.** Every text-bearing element on a Document surface lands on one of five steps:
mono label 11px · mono state 12px · body 14px · name 16px · head 18px+. The two tokens that
already declare this (`--type-body-min: 14px`, globals.css:76; `--type-metadata-min: 12px`,
globals.css:75) become the floor in fact: `.doc-type-meta` and `.doc-type-body` replace the
arbitrary sizes rather than sitting beside them. The mono floor moves to 11px because **649 of
1,029** mono usages are at or below 10px — **63%**, not the 75% an earlier draft printed — and
296 of them are at exactly 9px. (Denominator: `grep -ro "font-mono" src/components/document |
wc -l` → **1,029**, reproduced exactly on re-read; the 1,038 an earlier critique printed came
from a looser grep and has been withdrawn. The share rounds to 63% on either figure.) A floor of 12px would move nearly two thirds of the mono on the surface; a
floor of 11px moves the same set by one step.

**Why a plank, not a direction.** 8-to-12-pixel type is 76.4% of the rich document. No
direction can be judged on its hierarchy while three quarters of the page is below the
reading floor the product already declares.

**Files.** `globals.css` · and then **every file that carries a `text-[<n>px]` literal**:
**1,749 literals across 252 files** in 25 distinct sizes (305 at `9px`, 270 at `12px`, 207 at
`10px`, 202 at `11px`). The seven components the earlier draft named
(`{ffe-section,margin-rail,region/region-head,section-eyebrow,desk-roster,doc-letterhead,
red-letter-zone}.tsx`) are where the *decisions* are; they are not where the work is.
**Size L** — this is the largest single piece of work in the package and it is a lane of its
own, not a rider on a direction. Rough size **4-6 days**, most of it mechanical, and it is the
one plank that should be sequenced before any direction ships.

---

## SP-02 · Three muted inks that are three colours

**Closes** F16.

**Change.** `--text-muted`, `--text-subtle` and `--text-faint` (globals.css:68, 69, 92) all
resolve to `#65594E` today. They become three steps: `--text-muted: #4E4339` (the working
step — metadata that is read), `--text-subtle: #5A4E43` (explanatory copy), `--text-faint:
#65594E` (provenance, kept at today's value as the quietest step). All three clear 4.5:1 on
every ground any direction declares; the deepest, `#65594E`, holds at 4.72:1 on Direction A's
desk stock.

**Why a plank.** The tokens are already three names promising three ranks. Making them three
values costs nothing and every direction spends them.

**Files.** `globals.css` only. **Size** S.

---

## SP-03 · A rule-weight token set, and one job per weight

**Closes** F18.

**Change.** Three tokens replace the single pearl hairline used 502 times:
`--rule-hair: 1px solid rgba(44,41,38,.10)` (a row ended) ·
`--rule-mid: 1.5px solid var(--color-charcoal)` (a section ended) ·
`--rule-double` = the existing `.doc-region-rule` (globals.css:738-742) (a movement ended).
Dashed keeps one meaning — not yet filled in — and stops being a row separator.

**Why a plank.** One weight cannot carry three ranks, and the third weight already exists in
the stylesheet, used in one place. This is naming what is there and spending it.

**The three weights need dark twins, and the plank owns them.** All three are hardcoded
charcoal, so on any inverted chrome they stop being rules: measured on Direction C's three
charcoals — desk `#37322D`, rails `#2C2926`, well `#201D1B` — `--rule-mid` reads
**1.141 / 1.000 / 1.159** and `--rule-hair` **1.015 / 1.000 / 1.011** — on the rails, literally
the same colour as the ground it is meant to divide. The twin set, and what each reads on the same three:

| twin | value | desk · rails · well | the light weight it twins, on the sheet |
|---|---|---|---|
| `--rule-hair-dark` | off-white at 12% | **1.442 / 1.447 / 1.419** | 1.207 |
| `--rule-mid-dark` | the dark register's primary ink, solid | **11.153 / 12.722 / 14.745** | 13.871 |
| `--rule-strong-dark` | 2px of that ink over 1px of off-white at 18% | **1.720 / 1.750 / 1.735** (the under-line) | 1.416 (the under-line) |

Only a direction that inverts a ground spends them — today that is C alone, and C prices them
(`direction-c.md`, Cost). They are named here because the weights are the plank's, not C's.

**Files.** `globals.css` · the `border-[var(--color-pearl)]` sweep in
`components/document/**`. **Size** M.

---

## SP-04 · No pigment is spent as text

**Closes** the contrast half of F02, and the stamp hole in F03.

**Change.** I151 gave every base pigment a text-grade companion (`--color-clay-ink` and the
three beside it, globals.css:34-41) and `contrast.test.ts` holds the rule. The stamp is the
hole: `stamp.tsx:31` sets `color: ink ?? color`, so a stamp declared without an explicit ink
prints its base pigment — sage at 2.01:1, clay at 2.18:1, dusty blue at 2.64:1 against the
ground. Every stamp descriptor carries an explicit `-ink`; the base pigment stays on the
border, where it is material, not type.

**Why a plank.** It is the completion of a rule the repo has already ruled and already tests.

**Files.** `components/document/stamp.tsx` · `orders-ledger.tsx` · the stamp descriptor maps ·
`lib/document/__tests__/contrast.test.ts`. **Size** S.

---

## SP-05 · State gets a ground, not only a hue

**Closes** F01, F02, F03.

**Change.** `Stamp` (stamp.tsx) and `StatusChip` (status-chip.tsx) gain one variant that
fills: the state's pigment at 16-18% over the sheet, with the matching `-ink` for the word. The
dot-and-word chip stays the default; the fill is what a row wears when the state is the reason
the row is on the page. Both stay flat — a fill inside the existing 1.5px pigment border, no
shadow, no pill, no rotation change. In the mocks the fill lands on **`Stamp`** (the
`DECISION DUE` line): `research/12-measurements.md` §8 records that `StatusChip` has **no
reachable render** on the local DB, so the stamp is what any figure in this deck can show and
what the surface renders today.

**Two things this plank costs that a token does not.** (1) `status-chip.tsx:7` is
`StatusChip({ label, color })` — a fill variant is a new prop, a variant-resolution rule, and a
decision at every call site about which rows carry it. (2) A filled stamp departs from
`KIT.md:266` — *"Stamps are always outlined, never filled … A filled/solid stamp is not this
system."* All three directions inherit that departure, so it is named here rather than in one
direction's canon check.

**Why a plank.** Three grounds on one furniture line resolve to 1.0005:1 today (F01). Whatever
the direction, the surface needs one state device that a reader can see without reading.

**Files.** `components/document/{status-chip,stamp}.tsx` · `ffe-section.tsx` · `orders-ledger.tsx`
· every call site that decides a variant. **Size** M.

---

## SP-06 · Hover is the next stock the lane already declares

**Closes** F17, F01.

**Change.** `--bg-hover` (globals.css:64) goes from `rgba(196,165,123,.06)` — 1.042:1 over the
ground — to **a step of at least 1.09:1 against the stock the row sits on, taken from the
direction's own declared stocks**. The FF&E row's local 4% hover is deleted in favour of the
token.

**The promise this plank used to make, and why it could not keep it.** v2 promised "a fill at
or above 1.10:1 on every stock the ruled direction declares" and offered one hex to do it with —
`--plank-hover-tint: #F3ECE2`, clay at 16% over the sheet. Measured against the stocks the three
directions actually declare, that hex delivers:

| stock | `#F3ECE2` reads |
|---|---|
| the sheet `#FCFAF6` | **1.125** |
| today's ground `#FAF7F2` | **1.097** |
| A's rail `#EFE7DA` | **1.046** |
| A's desk `#E0D6C4` | **1.228, and lighter than the ground** — hover inverts direction inside one lane |
| B's six movement stocks | **1.008 – 1.016** |
| B's rail | **1.089, and lighter than it** |
| C's second sheet `#F5EFE5` | **1.025** |

One value cannot clear 1.10:1 across stocks that span 1.381:1 of value, and the fill that would
try breaks a plank next door: charcoal at 6% over A's desk stock reads 1.106:1 and drops A's
tightest `-ink` to **4.137:1** on the hovered row; over B's Project stock, 1.115:1 and
**4.363:1**. SP-06 at 1.10 and SP-04's 4.5:1 floor cannot both hold on the deeper stocks. So the
plank stops being a value and becomes a rule — and the rule costs nothing, because every lane
already owns a stock one step away:

| lane | a hovered row takes | measured |
|---|---|---|
| A | the rail stock under a row on paper · over a row on the desk · the paper under a row on the rail | **1.177 · 1.173 · 1.177** |
| B | the untinted sheet showing through the tinted stock · under a row on the rail | **1.108 – 1.116 · 1.225** |
| C | the second sheet on the paper · the next charcoal on the chrome (desk→rails, rails→well) | **1.097 · 1.141 · 1.159** |

**The floor is 1.097** — C's second sheet — and the plank promises 1.09, not 1.10. Every value
above is a stock the lane has already published and whose inks already clear 4.5:1, so hover
costs no new colour and no new contrast risk.

**Why a plank.** On a surface built from lines rather than buttons, hover is how a line says
it is live. At 1.04:1 it does not say it.

**Files.** `globals.css` · `components/document/ffe-section.tsx`. **Size** S.

---

## SP-07 · The drawer gets a ground of its own

**Closes** F06, F23.

**Change.** The Studio Drawer is `bg-[var(--bg-surface)]` — pure white, 1.069:1 against the
page (studio-drawer.tsx:289). It takes a declared chrome stock instead (each direction names
which), and its top edge takes the mid rule weight from SP-03 rather than a pearl hairline.
Contents, order and behaviour unchanged; no badge, no count.

**Why a plank.** The drawer is the one piece of chrome that is always on screen. It cannot be
the same value as a card in any direction.

**Files.** `components/document/studio-drawer.tsx` (`:289` is `bg-[var(--bg-surface)]`, a
Tailwind arbitrary value, not a token) · `globals.css`. **Size M** — not S: the ground is a
component literal today.

---

## SP-08 · The two rails are painted on a stock

**Closes** F07, F08.

**Change.** The margin rail has **two** values, and both directions' tables should carry both:
`rgba(250,247,242,0.98)` between 1180 and 1439 (margin-rail.tsx:258) and
`min-[1440px]:bg-[rgba(250,247,242,0.55)]` at 1440 and above — the second composites to the
ground exactly, **1.000:1**. The spine is pearl at 28%: **1.053:1** against the off-white ground
it sits on and **1.081:1** against the document paper beside it (12-measurements.md §2; every
"from" figure in this package now names its ground). Both rails take one declared stock so the
paper is visibly flanked, and the paper's own edge takes the mid rule. Same widths, same
contents, same positions.

**Why a plank.** A rail that is the same colour as the page is not a rail; the chips inside it
float. Every direction needs the document's three columns to read as three columns.

**Files.** `components/document/{doc-spine,margin-rail}.tsx` · `globals.css`. **Size M** —
not S: `doc-spine.tsx:44` and `margin-rail.tsx:258` are Tailwind arbitrary values, and the rail
has a second value at the 1180-1439 tier.

---

## SP-09 · The desk at 390 stops showing a fourth ground

**Closes** F24.

**Change.** The shadcn base layer `--background` (globals.css:860, about `#F5F1E6`) is exposed
where the desk overflows its viewport at 390. It is repointed to `--bg-primary` so the page
has one ground under it at every width. The overflow itself is a layout defect and is out of
this program's scope; painting the ground is not.

**Why a plank.** No direction should be judged at 390 against a colour none of them chose.

**What this plank does NOT fix, and what the mocks assume.** The overflow itself — 47 CSS px of
horizontal scroll at 390 — and the roster row's act/need collision beneath it are layout
defects, out of this program's UI-only scope. **All twelve 390 mockups in this deck are drawn
with both assumed repaired**, and each M5 figcaption says so. Nothing in A, B or C fixes them;
whichever direction is ruled for, the 390 desk still needs that repair first.

**Files.** `globals.css` · `app/(document)/layout.tsx`. **Size** S.

---

## What the planks do not close

F05 (the three stocks), F09 (the most urgent band is the palest band), F10 (a section head and
a state chip are one style), F15 (no interiors surface shows what is being bought), F19 (People
renders cards where the Desk renders lines), F20 (selection reads three ways) and F25 (the one
texture is 1% alpha) are direction work, not plank work: each needs a decision
about how much tone, type or material the product wants, which is what the three directions
are for.
