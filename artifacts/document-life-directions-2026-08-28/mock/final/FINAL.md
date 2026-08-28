# FINAL — Ink on Paper, with a little of Honest Materials' colour

The clickable mockup for the designer portal's visual refresh. Direction A (Ink on Paper) is the
base; Direction B (Honest Materials) survives in exactly three places, and in one new interaction.
One self-contained file, `mock/final/index.html` — no external request of any kind, the fonts and the
one catalog crop inlined as `data:` URIs. The file is **pure ASCII**: every glyph above U+007F is a
numeric entity in the markup and a `\uXXXX` escape in the JS, so the artifact skeleton's charset owns
the encoding and nothing can garble on a `file://` open (R01).

Everything in it is a **stylesheet over today's product**: same routes, same components, same acts,
same words, same information architecture. Nothing folds that did not fold; no surface moves. The one
thing the first build had out of order is back in it: **letterhead → instrument row → red letter**,
exactly as `shots/w1440-doc-project-rich.png` reads it (R35) — and as of the 2026-08-28 revision all
three sit on the paper, in today's own materials, because the charcoal band is gone.

---

## 1. The direction, as revised

**"A, with a little of B's colour."** Direction A is the whole skeleton and the whole material
register. Direction B contributes colour at three sites and nowhere else, plus the pigment the new
hover wash takes.

**Everything from A — Ink on Paper**

- Playfair document title at **40px**, tracking `-0.015em`; the client line Playfair italic in
  `--color-clay-ink`; the letterhead closed by `--rule-mid`.
- Region names at **24px** over a **1.5px charcoal rule**. The section head is the signature: the
  Strata mark, a mono 11px label, a Playfair name, a 1.5px charcoal rule.
- **Three rule weights, three ranks**: hairline `1px rgba(44,41,38,.10)` ends a row · `1.5px #2C2926`
  ends a section · the double rule (`2px #2C2926` + `1px rgba(44,41,38,.18)`) opens a movement.
  Dashed goes back to meaning "not filled in" and appears nowhere.
- Body floor **14px**; mono labels **11–12px and fewer of them**. The studio contents keep today's own
  register exactly — a Playfair **sentence-case** name and a **lowercase** mono sub-line
  (`shots/w1440-desk.png`), neither of them wearing the act's uppercase or its .1em tracking.
- **Three real muted inks** (`#4E4339` / `#5A4E43` / `#65594E`), where today all three are `#65594E`.
- **Three paper stocks, and only three.** The desk ground keeps today's cream `#FAF7F2` — **A's tan
  `#E0D6C4` is not taken**; the document is one untinted sheet `#FCFAF6`; the spine and the margin
  are one deeper stock `#E8E3DB` (the design lead's ruling from the last round stands, superseding
  A's `#EFE7DA`), with a margin chip drawn as a lifted piece of the sheet, `#FCFAF6`, on it.
- **The letterhead, the instrument row and the red-letter zone sit on the paper**, in today's order
  (R35) and in today's own materials: the red letter is the terracotta wash `rgba(212,160,144,.08)`
  behind a 2px terracotta rule, and every word on it is a paper `-ink`.

**Exactly three things from B — Honest Materials**

1. **Filled stamps.** The state's own canon pigment composited over the sheet the stamp sits on —
   now `--doc-paper #FCFAF6`, because the ground changed — to a common **~1.18:1**, a 1.5px pigment
   border (`currentColor`, the state's own `-ink`) and a **charcoal word**. ORDERED clay ·
   DECISION DUE golden hour · DAMAGED terracotta · the anchor highlight dusty-blue. *State is hue;
   legibility is charcoal*, at 11.7:1 on every one of them.
2. **The six saturated stage tabs, on the roster heads.** The `--tab-*` set, unchanged — six pigments
   on two ladders at once, no two hues closer than 30°, each a clear value step darker than the one
   before it, white label at 5.22–8.20:1. **The tab only, as a small plate on the head line.** There
   is no tinted band under a stage group: the rows print straight on the cream, exactly as
   `shots/w1440-desk.png` draws them.
3. **48px product crops on catalog-linked lines** — Pieces and the Orders ledger — where `mock/img/`
   holds a photograph of that actual kind of piece. One line qualifies, the dining set. Every other
   line takes the rail-stock slot with its ruled diagonal. Never a stand-in photograph.

Plus **2–3% paper grain** (two crossed repeating gradients at 3.0% and 2.2%), which is B's tooth and
costs no colour. Drawer, spine and margin stay light; the one charcoal surface left in the mock is the
390 mobile bar, which is today's own.

**And one new thing — the hover wash**

Kody: *"Maybe an animated color highlight on hover."* Every roster line and every FF&E line opens a
**warm wash** under the pointer — the row's own pigment, laid over the ground it sits on, swept open
as a `clip-path` circle from the exact point of contact by the same mechanic the Scored Ink bead uses,
260ms in on `--ease-editorial`, 200ms out. The name's score turns clay at the same time. **The rule is
the ratio, not the alpha:** every wash lands at **~1.12:1** over its own ground, and the alpha follows
the pigment's value — 8% for the six dark stage pigments, 16 / 24 / 16% for the three light state
pigments — so the highlight reads the same on both surfaces. Under `prefers-reduced-motion: reduce`
the wash is a flat tint at three quarters of that alpha, applied instantly with no sweep; keyboard
focus takes the same wash statically, plus the focus ring. The row never moves and no text ever
changes colour. Values and ratios: §2, *The hover wash*.

**Depth** is unchanged: exactly one token, `--elevation-sheet`, at three sites (§3).

---

## Revision 2026-08-28 — A with B's colour

The first build was **B on A's skeleton**: six movement-tinted desk bands bled to the page edge, a
Project-stock document sheet, and one charcoal band carrying the letterhead, the instrument row and
the red letter. Kody's ruling, verbatim:

> "the desk is starting to look silly with the banded colors edge to edge. and the document with the
> dark header and yellow body looks terrible. Direction A would have been better guidance, pulling in
> a little more of direction B's color, Maybe an animated color highlight on hover."

And, in the interview that followed: B's colour survives **only** as filled stamps, saturated stage
tabs on the roster heads, and 48px thumbnails on catalog-linked lines; the hover highlight is a warm
wash sweeping the row.

**Removed**

| What | Was | Why |
|---|---|---|
| the six movement-tinted desk bands | `--stock-brief` … `--stock-install`, bled `-200px` either side of the measure so a group had no edge of its own | *"banded colors edge to edge."* The six `--stock-*` tokens are deleted; `.stage-group` is a plain `margin-top: 20px` and the roster rows sit on the cream exactly as today's `w1440-desk.png` draws them. This also retires R48 — the six colour fields no longer stand up behind the Orders sheet's scrim, because there are none. |
| the tinted document sheet | `.doc-col { background: var(--stock-project) }` `#F8EED0` | *"yellow body."* The sheet is `--doc-paper #FCFAF6` throughout. |
| the charcoal band | `.band { background: #2C2926 }`, carrying the letterhead, the instrument row and the red letter | *"the dark header … looks terrible."* All three sit on the paper now, in today's order and today's treatment: Playfair 40px title in `--text-primary`, mono instruments in `--text-muted` with charcoal values, the red letter as `rgba(212,160,144,.08)` behind a 2px terracotta rule. |
| `--band-terracotta-quiet-ink`, the `.band .act` register, the `.band .strata-mark` overrides, the band's own focus-ring colour | the charcoal band's inverted register | nothing prints on charcoal any more except the 390 mobile bar, which keeps `--band-quiet-ink` and `--band-clay-quiet-ink`. |
| the saturated plate on the document's movement word | `.movement-tab { background: var(--tab-project) }` | B's colour is spent on the roster heads only. The **label is unchanged** — `PROJECT` still opens the document — but on paper it takes what A gives every other one of these: a mono 11px eyebrow at `--text-muted`. |

**Kept, and recomputed**

- The four **stamp fills** were composited over the Project stock; the ground changed, so all four are
  recomputed over `#FCFAF6` at ~1.18:1. One side-effect is a strict improvement: at this lighter value
  **every canon ink clears 4.5:1 on all four fills** (floor 4.56), so the fills no longer need the
  checker's skip — `/* contrast: ignore */` is off them and they are fully gated. Only `--rail-stock`
  still carries the skip, for the reason §7 item 1 states.
- The **six `--tab-*` values** are untouched.
- The **48px crops and slots** are untouched.
- **Depth, motion vocabulary, the click map, every label, every act, the IA and the specimen data**
  are untouched.

**Added** — the hover wash, described in §1 and measured in §2.

## 2. Token table

Contrast is WCAG 2.2, computed by `research/contrast-check.mjs` over `mock/final/tokens.css` (the
`:root` block of `index.html`, extracted verbatim). **`0 failure(s), 22 warning(s)`**; every warning is
a `quiet`-marked pair that never occurs on a real surface (a mobile-bar ink measured against paper, a
paper ink measured against the bar's charcoal).

**One token carries the checker's own documented skip**, `--rail-stock`, and it says why on its own
line. The rail's register is **partial by ruling** — it prints only charcoal, the muted ramp and
clay-ink; terracotta-, golden-hour- and sage-ink never appear on it. The gate's
all-inks-against-all-grounds cross-product would read those deliberate absences as failures, so the
rail's complete ratio table is printed in §7 item 1 instead of hidden. The four stamp fills used to
carry the same skip and **no longer need it**: recomputed over the untinted sheet they are light
enough that every canon ink clears 4.5:1 on all four, so they are fully gated. Every other ground
stays fully gated too.

### Grounds

| Token | Value | globals.css line it replaces | Measured |
|---|---|---|---|
| `--desk-ground` | `#FAF7F2` | `--bg-primary` (:62) — **unchanged** | inks 5.28–13.53:1 |
| `--doc-paper` | `#FCFAF6` | `--doc-paper` (:51) — **unchanged**, the one untinted sheet | inks 5.41–13.87:1 |
| `--rail-stock` | `#E8E3DB` | spine wash `rgba(229,226,221,.28)` (`doc-spine.tsx:44`, 1.081:1 vs paper) · margin wash `rgba(250,247,242,.98/.55)` (`margin-rail.tsx:258`, 1.000:1 at 1440) | **1.225:1 off the sheet** · 1.195:1 off the desk ground — full table in §7 item 1 |
| `--band-quiet-chrome` | `#2C2926` | `--color-charcoal` (:15) | the **390 mobile bar only**; `--band-quiet-ink` reads 13.53:1 on it |
| `--stage-ground` | `#EBE7E0` | none — outside the mock frame, the reviewer's stage | every ink ≥ 4.571:1 |

**Deleted with the bands** (Revision 2026-08-28): `--stock-brief`, `--stock-discovery`,
`--stock-direction`, `--stock-proposal`, `--stock-project`, `--stock-install` and
`--band-terracotta-quiet-ink`. Nothing on the page is tinted any more except a stamp, an anchored
line and a hovered row.

**The rail, and why it stayed at `#E8E3DB`.** A's `#EFE7DA` was tuned against the untinted paper
(1.177:1). When the mock still drew six tinted sheets it fell to 1.055–1.063:1 against them, and the
design lead ruled **separation over register**: the rail goes to `#E8E3DB`. The tinted sheets are now
gone, but the ruling stands — against the one untinted sheet `#E8E3DB` reads **1.225:1**, a full step
clearer than A's own value, and the rail keeps its partial register: charcoal, the muted ramp and
clay-ink, all of which it holds (4.70–11.32:1). The three warm pigment inks (terracotta 4.41,
golden-hour 4.45, sage 4.41) are what it gives up, and it prints none of them.

### Filled stamps — one recipe, charcoal word (the design lead's ruling on R02, recomputed 2026-08-28)

**The ruling:** one recipe for every filled stamp — the state's own pigment composited over **the
sheet the stamp actually sits on** to a common value, the **1.5px pigment border** (`currentColor`, so
it is still the state's own ink), and a **charcoal word** (`--text-primary #2C2926`, which is
`--color-charcoal`, `globals.css:15`). *State is hue; legibility is charcoal.* The anchored-line
highlight takes the same value so the four sit on one plane.

**What the revision changed: the ground.** The sheet was `--stock-project #F8EED0` and is now
`--doc-paper #FCFAF6`, so all four fills are recomputed against it at a common **~1.18:1**. Nothing
about the recipe moved; the alphas did, and they came down (26/46/26/21% → 23/35/23/19%).

**The R33/R34 amendment stands — one pigment per state, carrying both halves.** An earlier build gave
DECISION DUE and DAMAGED the same `--color-terracotta-ink` border, leaving the fill hue to carry the
whole distinction alone; and it drew DECISION DUE in **sage**, canon's settled/approved pigment, for a
decision the designer still owes. Both stay closed: every state takes its own canon pigment and spends
it on the fill **and** the 1.5px border.

| State | Pigment | Fill | Border |
|---|---|---|---|
| ORDERED | `--color-clay` `#C4A57B` | `--fill-ordered-tint` | `--color-clay-ink` `#7C5E30` |
| DECISION DUE | `--color-golden-hour` `#E8C547` | `--fill-decision-tint` | `--color-golden-hour-ink` `#79651E` |
| DAMAGED | `--color-terracotta` `#D4A090` | `--fill-damaged-tint` | `--color-terracotta-ink` `#9C5340` |
| the anchored line | `--color-dusty-blue` `#8B9CAD` | `--fill-anchor-tint` | — (a wash, not an object) |

Measured on the page, the three drawn borders are `rgb(124,94,48)` / `rgb(121,101,30)` /
`rgb(156,83,64)` — three inks, no repeat.

| Token | Value | Composite | vs paper `#FCFAF6` | charcoal on it | hue / sat |
|---|---|---|---|---|---|
| `--fill-ordered-tint` | `#EFE6DA` | `--color-clay #C4A57B` @ **23%** | **1.185:1** | **11.71:1** | 34.3° / 40% |
| `--fill-decision-tint` | `#F5E7B9` | `--color-golden-hour #E8C547` @ **35%** | **1.184:1** | **11.72:1** | 46.0° / 75% |
| `--fill-damaged-tint` | `#F3E5DF` | `--color-terracotta #D4A090` @ **23%** | **1.179:1** | **11.76:1** | 18.0° / 45% |
| `--fill-anchor-tint` | `#E7E8E8` | `--color-dusty-blue #8B9CAD` @ **19%** | **1.178:1** | **11.78:1** | 180.0° / 2% |

And pairwise, so the cost is ruled on rather than inherited (R34). One recipe at one common value
means the four cannot separate by **value**; they separate by **hue and by saturation**, and the
untinted ground widened every hue gap against the previous build:

| Pair | hue gap | saturation gap | value |
|---|---|---|---|
| ORDERED vs DECISION DUE | 11.7° | **35 pts** | 1.001:1 |
| ORDERED vs DAMAGED | 16.3° | 6 pts | 1.005:1 |
| ORDERED vs the anchor | **145.7°** | 37 pts | 1.006:1 |
| DECISION DUE vs DAMAGED | **28.0°** | 30 pts | 1.004:1 |
| DECISION DUE vs the anchor | 134.0° | **73 pts** | 1.005:1 |
| DAMAGED vs the anchor | **162.0°** | 43 pts | 1.001:1 |

`--fill-production-tint`, `--fill-delivered-tint` and `--fill-approval-tint` were deleted earlier
(R22, R33), so §2 prints ratios only for fills that appear on the page.

**Why the charcoal word was the unlock.** Holding the state's own `-ink` as the word capped the fill:
terracotta-ink (L 0.1363) capped its fills at 1.082:1, which is why an earlier build shipped DECISION
DUE and DAMAGED at 1.074:1 and they still read as outlines. Charcoal is L 0.0226 and needs a ground no
lighter than L 0.2768, so it removes the constraint entirely. The measured floor on any fill is
**11.71:1**.

**The fills are now fully gated.** This is the one strict improvement the revision bought for free.
Over the Project stock the four fills sat deep enough that the warm pigment inks fell to 4.10–4.16:1
on them and all four had to carry `/* contrast: ignore */`. Over the untinted sheet they sit lighter,
and **every canon ink clears 4.5:1 on all four** — floor **4.56** (terracotta-ink on ORDERED),
`--text-faint` 5.50–5.53, clay-ink 4.86–4.89, golden-hour-ink 4.60–4.63. The skip is off them; the
checker measures them like any other ground and reports **0 failures**.

The one clay-ink that prints on an anchored row (the Schedule phase's numeral and its ACTIVE state
word) still **turns charcoal while the row is anchored** — kept, because it costs nothing and the
anchored row is the one place a fill and a pigment ink meet:

```css
.phase-row.is-anchored .phase-num,
.phase-row.is-anchored .phase-state { color: var(--text-primary); }
```

`--fill-anchor-tint` replaced `--fill-ordered-tint` at both anchor sites (R14): a Schedule phase was
being marked with the *ordered-money* pigment. The anchoring wash is its own token that means "you
asked for this line", and both chips animate identically (`.phase-row` gained the `background-color`
transition `.ffe-row` already had).

### Inks

| Token | Value | globals.css line it replaces | On rail `#E8E3DB` | On the sheet `#FCFAF6` | On the desk `#FAF7F2` |
|---|---|---|---|---|---|
| `--text-primary` | `#2C2926` | :66 — unchanged | 11.321 | 13.871 | 13.532 |
| `--text-body` | `#5C4A3C` | :67 — unchanged | 6.577 | 8.058 | 7.861 |
| `--text-muted` | `#4E4339` | :68 (`#65594E`) | 7.522 | 9.216 | 8.990 |
| `--text-subtle` | `#5A4E43` | :69 (`#65594E`) | 6.310 | 7.731 | 7.542 |
| `--text-faint` | `#65594E` | :92 — unchanged | 5.317 | 6.514 | 6.355 |
| `--color-clay-ink` | `#7C5E30` | :34 — unchanged (I151) | 4.697 | 5.754 | 5.613 |
| `--color-terracotta-ink` | `#9C5340` | :35 — unchanged | *4.414 — never on the rail* | 5.408 | 5.276 |
| `--color-golden-hour-ink` | `#79651E` | :40 — unchanged | *4.452 — never on the rail* | 5.454 | 5.321 |

`--color-sage-ink` is **deleted** (R42). It was declared so the gate could measure it and then never
printed; sage is now nowhere on this page except the IN HAND dot. `--color-golden-hour-ink` is no
longer in that position either — it is the DECISION DUE stamp's 1.5px border (R33).

A tenth pigment joins the base set: **`--color-dusty-blue: #8B9CAD`** (`globals.css:45`), so the
roster's job mark can follow `desk-roster.tsx:23-26` exactly — terracotta for an urgent need,
dusty-blue for a quiet one, **no mark at all** where a line needs nothing. `--color-terracotta` is
what the urgent mark takes, so it is no longer a dead token (R22).

The lowest ratio anywhere the mock actually prints is **4.68 — terracotta-ink on the Project group's
hovered row**, the OVERDUE clause under the Vandersteen name. Off a hovered row the floor is
**4.70 — clay-ink on the rail**, the spine's ACTIVE sub-line.

### The 390 mobile bar's own register

The charcoal band is gone (Revision 2026-08-28). One charcoal surface is left in the mock — the 390
mobile bar — and it is today's own; A keeps it (*"the mobile bar stays the charcoal strip it already
is"*). Two tokens serve it, and `--band-terracotta-quiet-ink` is deleted because nothing terracotta
prints on charcoal any more.

| Token | Value | Measured on `#2C2926` |
|---|---|---|
| `--band-quiet-ink` | `#FAF7F2` | **13.532** |
| `--band-clay-quiet-ink` | `#C4A57B` | **6.208** |

**These two are the inversion rule, applied** (`globals.css:28-33`). The I151 `-ink` tokens are paper
inks and only paper inks; on a charcoal ground the darkening runs the wrong way — clay-ink measures
**2.411:1** on `#2C2926`, while the base pigment it was darkened from reads 6.208. Both carry the
`quiet` marker, exactly as `direction-b.css` does, so the checker reports the pairs that never occur
(a bar ink on paper, a paper ink on the bar) as warnings rather than failures.

**The letterhead, the instrument row and the red letter now print on paper**, and every one of them
takes a paper ink:

| On the paper | Ink | Ground | Ratio |
|---|---|---|---|
| the movement eyebrow, PROJECT | `--text-muted` | `#FCFAF6` | **9.216** |
| the title | `--text-primary` | `#FCFAF6` | **13.871** |
| the client line | `--color-clay-ink` | `#FCFAF6` | **5.754** |
| vital label · instrument label · instrument arrow | `--text-muted` | `#FCFAF6` | **9.216** |
| vital value · instrument value | `--text-primary` | `#FCFAF6` | **13.871** |
| NEEDS ATTENTION · IN ONE PLACE | `--color-terracotta-ink` | `#F9F3EE` — terracotta `.08` over the sheet, 1.056:1 | **5.12** |
| the red letter's sentence | `--text-primary` | `#F9F3EE` | **13.14** |
| REVIEW DECISIONS | `--text-body` | `#F9F3EE` | **7.63** |

### Saturated stage tabs — white ink

The second of the three things B's colour survives as, and the six values are untouched by the
revision. R03 had objected that the six *stocks* separated by hue at one value; the stocks are now
gone, so the tab **is** the naming, alone, and it had to be right on both ladders. The old set doubled
up: DIRECTION `#6B5637` and PROPOSAL `#8B6A3A` were the same hue (36°), and PROJECT sat 12° from them.
The six below run cool→warm on **two ladders at once** — no two hues closer than **30.0°**, and each
tab a clear value step (≥ **1.080:1**) darker than the one before it, so the naming survives a
red-green colourblind read and a greyscale print. They print as a small plate on the roster head line
and nowhere else.

| Token | Value | Hue | Replaces | White ink | Step from the previous tab |
|---|---|---|---|---|---|
| `--tab-brief` | `#497093` | 208° | `--phase-consultation` `#8B9CAD` (:105), white at 2.82:1 | **5.22** | — |
| `--tab-discovery` | `#307063` | 168° | `--phase-walkthrough` `#A8B5A0` (:110), white at 2.15:1 | **5.80** | 1.111 |
| `--tab-direction` | `#366A3A` | 125° | `--phase-refinement` `#8B7355` (:107) | **6.40** | 1.104 |
| `--tab-proposal` | `#575D1D` | 66° | `--phase-concept` `#C4A57B` (:106), white at 2.33:1 | **7.03** | 1.098 |
| `--tab-project` | `#6D4E24` | 35° | `--phase-procurement` `#E8C547` (:108), white at 1.68:1 | **7.59** | 1.080 |
| `--tab-install` | `#823832` | 5° | `--phase-installation` `#D4A090` (:109), white at 2.28:1 | **8.20** | 1.080 |

The tab palette no longer leaks into the section marks: `.sect-mark` goes back to `--color-clay`
(R26), so the movement pigments mean movements and nothing else. The document's own movement word,
`PROJECT`, **gave up its plate** in the revision and takes A's mono eyebrow at `--text-muted` — the
label is unchanged, the colour is not spent twice.

White is a literal, not a token — the checker cross-multiplies every text against every ground, and
naming white as a text token would measure it against fifteen paper grounds it never touches.

### The hover wash — new, 2026-08-28

A hovered row takes **its own pigment**: the stage's tab on a roster line, the line's state on an FF&E
line, and clay where an FF&E line has no state. It is not a token in `:root` — it is a `--wash` custom
property declared on the six `.mv-*` groups and on `.ffe-row`, so the value travels with the row and
the mechanic is one rule.

**The rule is the ratio, not the alpha** (the coordinator's ruling). *The wash lands at ~1.12:1 over
its own ground; alpha follows the pigment's value.* The six stage pigments are dark and reach that at
**8%**; the three state pigments are light and need **16 / 24 / 16%** to reach the same place. One
highlight, and it reads on both surfaces — `final-desk-hover-1440.png` beside
`final-ffe-hover-1440.png`. The still variant is three quarters of the swept alpha throughout.

| Row | Pigment | Wash | Composited ground | vs the ground under it |
|---|---|---|---|---|
| roster · Brief | `--tab-brief` `#497093` | `rgba(73,112,147,.08)` | `#ECECEA` | **1.107:1** |
| roster · Discovery | `--tab-discovery` `#307063` | `rgba(48,112,99,.08)` | `#EAECE7` | **1.113:1** |
| roster · Direction | `--tab-direction` `#366A3A` | `rgba(54,106,58,.08)` | `#EAECE3` | **1.116:1** |
| roster · Proposal | `--tab-proposal` `#575D1D` | `rgba(87,93,29,.08)` | `#EDEBE1` | **1.118:1** |
| roster · Project | `--tab-project` `#6D4E24` | `rgba(109,78,36,.08)` | `#EFE9E2` | **1.128:1** |
| roster · Install | `--tab-install` `#823832` | `rgba(130,56,50,.08)` | `#F0E8E3` | **1.132:1** |
| FF&E · ordered / no state | `--color-clay` `#C4A57B` | `rgba(196,165,123,.16)` | `#F3ECE2` | **1.125:1** |
| FF&E · decision due | `--color-golden-hour` `#E8C547` | `rgba(232,197,71,.24)` | `#F7EDCC` | **1.123:1** |
| FF&E · damaged | `--color-terracotta` `#D4A090` | `rgba(212,160,144,.16)` | `#F6ECE6` | **1.115:1** |

Nine washes, **1.107–1.132:1**, mean 1.120. The FF&E hexes are the ones the browser composites, read
back off the page by `review-clickthrough.mjs` item (14): `rgb(243,236,226)` / `rgb(247,237,204)` /
`rgb(246,236,230)`.

**Every text on a washed row clears 4.5:1.** The floor is **4.68**, the OVERDUE clause
(`--color-terracotta-ink`) on the Project group's wash, which is the deepest wash on the page; on the
three FF&E washes nothing falls below **8.19**. The stamp on a washed row is unaffected — its fill is
opaque, so the charcoal word still reads 11.71–11.76:1.

| On a washed roster row (Project, `#EFE9E2`) | Ink | Ratio |
|---|---|---|
| the job name | `--text-primary` | **12.00** |
| the need line | `--text-muted` | **7.97** |
| the OVERDUE clause | `--color-terracotta-ink` | **4.68** |
| REVIEW DECISIONS | `--text-faint` | **5.63** |

| On a washed FF&E row | ordered `#F3ECE2` | decision due `#F7EDCC` | damaged `#F6ECE6` |
|---|---|---|---|
| the piece name / the price (`--text-primary`) | **12.33** | **12.35** | **12.44** |
| the maker line (`--text-muted`) | **8.19** | **8.21** | **8.26** |
| the stamp word on its own opaque fill | 11.71 | 11.72 | 11.76 |

**The deepest ground the page can build** is a wash **on top of the anchor fill** — hover an FF&E line
while a margin chip anchors it. `rgba(196,165,123,.16)` over `--fill-anchor-tint #E7E8E8` composites
to `#E1DDD7`; the two inks that print there hold at **10.69** (`--text-primary`) and **7.10**
(`--text-muted`). Item (14) measures that case explicitly, compositing from the row itself rather than
from its parent, so the anchor fill is counted.

Under `prefers-reduced-motion: reduce` the wash drops to `--wash-still` — three quarters of the swept
alpha, 6% and 12 / 18 / 12% — and is applied instantly, which raises every ratio above.

### Rules and motion

| Token | Value | globals.css |
|---|---|---|
| `--rule-hair` | `1px solid rgba(44,41,38,.10)` | new (SP-03) |
| `--rule-mid` | `1.5px solid #2C2926` | new (SP-03) |
| the double rule | `2px #2C2926` + `1px rgba(44,41,38,.18)` | unchanged, `.doc-region-rule` :738 |
| `--ease-editorial` | `cubic-bezier(0.22,1,0.36,1)` | :115 unchanged |
| `--duration-fast` / `--duration-normal` | `150ms` / `300ms` | :116-117 unchanged — `--duration-fast` is now **spent**, at the five sites that carried a `150ms` literal beside it (R42) |
| `--press-in` / `--press-out` | `70ms` / `240ms` | :122-123 unchanged |

**Focus.** The one deviation from a shipped value: `:focus-visible` takes a 2px
`--color-clay-ink` `#7C5E30` outline rather than the ad-hoc kit's 2px `--color-clay` `#C4A57B`
(`globals.css:719-722`). Clay measures **2.05:1** on the sheet; clay-ink measures **5.75:1**.
Both are canon tokens; the darker one is the one a focus ring can be seen through.

---

## 3. The one elevation token — the amendment (Q04): **two new sites, not three**

```css
--elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);
```

Spent in exactly three places, and nowhere else:

| # | Site | Line in `index.html` | Already relaxed? |
|---|---|---|---|
| 1 | the Studio Drawer | `.drawer` | **yes — R72 already gave the dock its hairline surface** |
| 2 | the margin chips | `.margin-chip` | no — **this is the ask** |
| 3 | the open Orders ledger sheet | `.ledger-sheet` | no — but it buys nothing (below) |

`grep -n "box-shadow" index.html` → **3 lines**, all reading `box-shadow: var(--elevation-sheet)`,
against the one `--elevation-sheet` declaration in `:root`. The rendered count is **state-dependent**
(R11); the shoot's probe counts computed `boxShadow !== 'none'` on visible elements:

| State | Count | What |
|---|---|---|
| desk | **1** | the drawer |
| document | **3** | the drawer + the two margin chips |
| Orders sheet **opened from the desk** | **2** | the drawer + the sheet |
| Orders sheet **opened from the document** | **4** | + the two margin chips, still rendered under the scrim |

The click map opens the sheet from both places, so 4 is as real as 2. `shoot-final.mjs` now prints
both.

**Re-framed after R18.** D4 (`DECISIONS.md:15`) reads "No shadows. Anywhere. No exceptions." — but
**R72** (`DECISIONS.md:2589-2596`, recorded in `research/11-canon-digest.md`) already relaxed D4 for
exactly two surfaces: the folio's pickup affordance **and the dock's hairline surface**. The drawer
*is* the dock, so site 1 is not an ask at all. And the ledger sheet's `0 1px 2px rgba(44,41,38,.08)`
sits on top of a `rgba(44,41,38,.45)` scrim, where it is invisible — visible in
`shots/final-sheet-1440.png`, and **accepted with a note** rather than removed, because deleting one
of three identical declarations would make the budget harder to read than it is worth for a shadow
nobody can see either way.

So the honest question for the ruling is one question: **do the two margin chips get a shadow?**
`source/amendment-elevation.md` carries the ask and the counter-argument (all three directions close
F06/F07/F08 with grounds alone, and none of them asked for a shadow while doing it). If the ruling
closes the amendment, deleting the token and its three declarations is the whole change — nothing else
in this mock depends on it.

---

## 4. Motion — the portal's own vocabulary

| What | Duration · ease | Reduced-motion fallback | Source |
|---|---|---|---|
| the document opens — raise to fill | 270ms `ease-out`, opacity 0→1 + scale .986→1 | no animation; the document is simply there | `globals.css:171-179` `@keyframes doc-raise`; applied at `doc/[id]/page.tsx:1764` |
| a section folds / unfolds | ~300ms `--ease-editorial`, `grid-template-rows` 0fr→1fr + opacity | instant | `--ease-editorial` :115, `--duration-normal` :117 |
| the Orders ledger sheet slides up | 240ms `--ease-editorial`, translateY 24px→0 + opacity; takes `--elevation-sheet` | instant | `--press-out` :123 is the same 240ms clock |
| a stamp inks on state change — **once per stamp, never on re-entry** (R16) | 260ms `--ease-editorial`, border→fill wipe (`scaleX` from the left); a stamp inside a closed seam waits for its unfold, which is the click map's own act | instant fill | the pool's own clock — `globals.css:322-323`, `clip-path 260ms var(--ease-editorial)` |
| hover on an act — the Scored Ink bead + score thicken | pool `clip-path` to `circle(3.5px)` in 180ms; the clay score 1px→2px in 150ms | no transition; hover lands instant | `globals.css:458-466` |
| **hover on a roster line or an FF&E line — the warm wash** (new, 2026-08-28) | the row's own pigment laid to **~1.12:1** over its ground (8% on the roster, 16 / 24 / 16% on FF&E), `clip-path` `circle(0)`→`circle(150%)` **from the pointer** over 260ms `--ease-editorial`; receding over 200ms on leave; the name's score turns clay at the same time | **a flat tint at three quarters of that alpha, applied instantly, no sweep** — and keyboard focus takes that same static wash in both registers, plus the ring | the bead's own mechanic — `globals.css:322-323`, `--ink-x`/`--ink-y` written on `pointermove` at `:697` |
| press on an act — the word drops, the ink floods from the contact point | `translateY(1px)` over `--press-in` 70ms; flood `circle(140%)` over 200ms; label turns over at 60ms | **no drop; the press is carried by a thicker score** (`::before` 1.5px→3px) | `globals.css:503-514`; the stilled rule at `:640-644` |
| the one orchestrated moment — the roster lines settle in **once per page load** | 320ms `--ease-editorial`, **transform only** (`translateY(14px)`→0), 60ms stagger **capped at the 7th line** (`calc(min(var(--i),6) * 60ms)`) — sixteen uncapped lines would settle for a full second | no animation — the lines are at rest, never invisible (bug X-05) | `globals.css:157-168` `doc-sheet-up` — its transform half |
| the spine's active mark breathes | 3s `ease-in-out` infinite, opacity 1→.62→1 | `animation: none` | `globals.css:193-209` `doc-breath` — the system's only ambient motion |

Everything above is stilled inside one `@media (prefers-reduced-motion: reduce)` block; the block
names each rule explicitly rather than using a blanket `transition: none` on `*`.

Everything above is stilled by name, and the sweep now proves the list is complete: under
`prefers-reduced-motion: reduce`, **0 of 1082** elements inside `#frame` report a non-zero animation
or transition duration. `.phase-row` — which gained a `background-color` transition in the R14 fix and
was missed by the stilled block — is named there now (R32), so the Time chip's anchor snaps exactly
as the Money chip's does.

**Motion never replays** (R31/R16), and this is the part the first build got wrong in its own words.
`settleRoster()` still runs once, but a module-level guard was never the mechanism: `.screen
{ display: none }` **cancels a running CSS animation and replays it when the element is shown again**,
so a `.settling` class left on the lines re-settled all sixteen on every `— PUT DOWN`, every sheet
close and every 390 toggle. The class is now removed on each line's `animationend` (with a 900ms belt
for lines that were never painted, and for reduced motion where `animationend` never fires), and
nothing puts it back. Measured 50ms after each switch, `settle` animations running: **PUT DOWN 0 /
sheet close 0 / 390 → desk 0**, and **0** lines still carry the class at the end.
`ink()` only ever *adds* `is-inked`, so a stamp wipes in on the state change that first brings it into
view and never again.

---

## 5. The click map — the whole of it

| From | Act | To |
|---|---|---|
| dev bar (outside the frame) | `Desk` · `Document` · `Orders sheet` · `390` | jumps straight to that state |
| Desk | the Vandersteen line's **name**, or **REVIEW DECISIONS** on it | the Document, with the 270ms raise |
| Document | **← PUT DOWN** (spine) | the Desk |
| Document | **UNFOLD ↓** on *Client approvals* | unfolds; the word turns to **FOLD ↑**; the two DECISION DUE stamps ink in |
| Document | **FOLD ↑** on *Schedule* (unfolded at rest, six phases) | folds; the word turns to **UNFOLD ↓** |
| Document | **FOLD ↑** on *Pieces* (unfolded at rest, four rooms) | folds; the word turns to **UNFOLD ↓**. Pieces folds today, so it folds here (R39) |
| Document | **UNFOLD ↓** on *Design authority* / *Closing the book* | unfolds / folds the same way |
| Document | a **margin chip** | the chip marks itself and its anchored line takes the dusty-blue anchor highlight, scrolled into view |
| Desk or Document | **Ledgers ↑** in the drawer (also *Orders* in the studio contents) | the Orders ledger sheet slides up over the desk, under the drawer |
| Orders sheet | **PUT BACK · ESC**, the scrim, or the **Esc** key | closes, and focus returns to the act that opened it |
| anywhere | **FIND ANYTHING ⌘K** | inert, by design |

Every act is a real `<button>`, Enter and Space activate, and `:focus-visible` draws the 2px clay-ink
ring on all fifteen of the first fifteen stops. The old "112" was the **markup** count across three
screens, two of which are `display:none` at any moment — never a tab order (R10). What Tab actually
reaches, **per state**, measured by `shoot-final.mjs`:

| State | Reachable | (markup, all three screens) |
|---|---|---|
| Desk | **54** | 158 |
| Document | **38** | 158 |
| Orders sheet (over the desk) | **71** | 158 |
| 390 desk | **49** | 158 |

(Both counts rose by two against the last build: Pieces gained **BILL UNINVOICED LINES →** and its
**FOLD ↑**, per R39.)

The Orders sheet is a real dialog (R15): it takes `aria-modal`, moves focus to its first act on open,
traps Tab inside itself while open, and hands focus back to the act that opened it on Esc or PUT BACK.
"Its first act" is now **PUT BACK — ESC**, not the unlabelled `?` help mark that happens to sit first
in the head's DOM order (R44); the probe reads `activeElement: "Put back — Esc"`.

The **390** state shows the desk at 390×844 with the mobile bar (THE STUDIO · The Desk / TODAY · 0:47
/ ··· · More), carrying **both** whispers, the full body copy and the full roster head **EVERY JOB · 16
LIVE · 1 OVERDUE** — R12's three omissions, all restored — and the same sixteen lines the 1440 desk
draws. F24 — today's 390 overflow — is drawn repaired: the roster line stacks name, need and act
instead of wrapping into a column of single words. The shoot probes for horizontal overflow at both
widths and finds none.

---

## 6. What stays identical

Routes, components, acts, copy and information architecture — read off
`shots/w1440-desk.png`, `w1440-doc-project-rich.png`, `w1440-ledger-sheet-orders.png`,
`w1440-drawer-strip.png` and `m390-desk.png`:

- the greeting **"Good morning, Leah"** and its date line;
- the three desk acts **+ CAPTURE A LEAD** / *begin a brief*, **+ OPEN A PROJECT** / *no proposal
  needed*, **FIND ANYTHING ⌘K**;
- both whisper notes, with **APPEARS ONCE · RECEDES ON USE** and **FINISH SETTING UP**;
- the roster head **EVERY JOB · 16 LIVE · 1 OVERDUE**, the six stage groups in the desk's own order
  (BRIEF · 5, DISCOVERY · 1, DIRECTION · 3, PROPOSAL · 2, PROJECT · 4, INSTALL · 1) **drawn at their
  real counts — all sixteen lines** (R04) — and the job acts **OPEN THE JOB** / **REVIEW DECISIONS** /
  **OPEN THE SCHEDULE**; the job mark follows `desk-roster.tsx:23-26` exactly: terracotta on the one
  urgent line, dusty-blue on a quiet need, **nothing** where a line needs nothing;
- **THE STUDIO** and its three columns — ROOMS (Library / People / The Scans), LEDGERS (Orders /
  Accounts / Hours / The Post), BEGIN (Open a project / Draft a design agreement / Draw an invoice ·
  new / Add a maker / Open the Drafting Room), with their sub-lines and their SHEET / ↗ tags;
- the drawer, **with today's icons back** (R19/R20): the desk drawer is **Patina** with *no*
  breadcrumb, the document drawer reads **DOCUMENT** (not VANDERSTEEN); the centre carries a book, two
  people, scan corners, a ledger and a magnifier beside **Library / People / The Scans / Ledgers ↑ /
  Find anything ⌘K**; the right carries **HANDS FREE** on the desk and **IN HAND TODAY 0:47** in the
  document, then a bell **with its terracotta unread dot** beside THE POST, then Leah Hartwell. No
  count — but the dot is there, because today's is;
- the document's letterhead and vitals, then the instrument row (ROOMS / PIECES / DRAWINGS / SPEC /
  BOARDS / MONEY / DATES / PEOPLE), then the red-letter zone (**NEEDS ATTENTION · IN ONE PLACE**) —
  all three on the paper, as today's are — and then the act ledger (**MESSAGE THE CLIENT / PREVIEW AS
  THE CLIENT / SHARING · MILESTONES / CALL SHEET · 0**). That is today's order and
  today's count, and the mock is back in both (R35, R41); plus the spine's **← PUT DOWN**,
  **ON THIS PAPER**, **IN HAND**, and the colophon line;
- the Orders ledger's head (**⬡ ORDERS · LEDGER**, **?**, **PUT BACK · ESC**), its lede, its tabs
  (**LEDGER / THE WEEK / RECEIVING / VENDORS**), **THROUGHPUT**, the project and payment filters with
  **SELECT MULTIPLE** at their right, and the row grammar (PO number · stamp · state · date in a
  column of its own, then project · money · sent-state, **PDF**, **OPEN DOCUMENT →**);
- the studio contents' own glyph per line — book, people, scan corners, box, ledger, clock, bell
  over ROOMS and LEDGERS, and, after the em-dash, folder-plus / pencil / file / hammer / tag down
  BEGIN — plus the **dotted leader** that runs from each ROOMS and LEDGERS name out to its `↗` or
  SHEET tag, which is the device that makes the block read as a table of contents rather than as three
  lists (R43). The names stay Playfair **sentence case** and the sub-lines lowercase mono, as today's
  are: both were inheriting the act's uppercase and .1em tracking, which today's contents do not have.

**Every act outside the drawer is Scored Ink** — DM Mono 12px uppercase with its score
(`globals.css:276-732`) — as today's are. The region ledger's leader **SPEC THE 2 UNSPECIFIED →** is
the `inked` variant (charcoal pool, off-white label, clay score riding on the ink), and **ADD A LINE**,
**FOLD ↑** / **UNFOLD ↓**, **+ NOTE**, **PAUSE**, **+ LOG**, **PDF**, **OPEN DOCUMENT →** and
**PUT BACK · ESC** are all mono caps and scored. The one sentence-case sans register left in the file
is the drawer's centre, which is what today's drawer is (R09).

---

## 7. What the mock does not claim

### Item 1 — the rail, measured (the design lead's ruling)

`--rail-stock` is **`#E8E3DB`**. The spine and the margin both take it; the margin chips sit on it as
**lifted paper**, `--doc-paper #FCFAF6` plus the elevation token they already carried, so a pigment
kind-label always prints on paper rather than on the rail.

| Rail `#E8E3DB` against | Ratio |
|---|---|
| `--doc-paper #FCFAF6`, the one sheet it flanks | **1.225** |
| the desk ground `#FAF7F2` | 1.195 |
| **a margin chip `#FCFAF6` against the rail** | **1.225** |

The six movement stocks it was tuned against are gone (Revision 2026-08-28) — it cleared 1.098–1.106:1
against them, and against the untinted sheet it now reads **1.225:1**, a step clearer than A's own
`#EFE7DA` (1.177:1).

| Ink on the rail | Ratio | Printed on the rail? |
|---|---|---|
| `--text-primary` `#2C2926` | 11.321 | yes — the spine's active label, the running-index names, IN THE MARGIN |
| `--text-muted` `#4E4339` | 7.522 | yes — ON THIS PAPER, the running-index values |
| `--text-body` `#5C4A3C` | 6.577 | yes — the user chip inside the drawer's rail-stock avatar |
| `--text-subtle` `#5A4E43` | 6.310 | yes — the margin whisper |
| `--text-faint` `#65594E` | 5.317 | yes — ← PUT DOWN, + NOTE, the ×, the spine note, APPEARS ONCE |
| `--color-clay-ink` `#7C5E30` | **4.697** | yes — the spine's ACTIVE sub-line, and the focus ring |
| `--color-terracotta-ink` `#9C5340` | *4.414* | **no** |
| `--color-golden-hour-ink` `#79651E` | *4.452* | **no** |
| `--color-sage-ink` `#5F6B57` | *4.411* | **deleted** (R42) |

**Nothing had to be moved to charcoal** — every text the mock actually prints on the rail already
clears 4.5:1 on `#E8E3DB`. The three warm pigment inks are the register the rail gives up by ruling,
and it prints none of them; the token carries `/* contrast: ignore */` for exactly that reason, with
this table standing in for the gate's cross-product (§2).

### Everything else

- **The data is the specimen**, `source/specimen.md` (the Vandersteen residence, "today" =
  Tuesday 2026-08-25). No number, date or count is invented beyond it. Derived figures are arithmetic
  on the specimen's own rooms: 14 + 8 + 9 + 5 = **36 lines**, of which **2 unspecified** (the
  mudroom's), hence **34 of 36 specified**. Three places where the last build broke that promise, and
  what they print now:

  | Was | Now | Why |
  |---|---|---|
  | six invented phase date ranges, `MAR 2 — MAR 20` — `SEP 28 — OCT 2` | the two dates the specimen actually states, each as an open range: phase **i** `Mar 2 —` (the project opened 2026-03-02) and phase **v** `Sep 15 —` (it installs Tue 2026-09-15). The other four print the **em-dash placeholder** today uses for a date it does not have | R40. The specimen states no range *end* anywhere, so no range end is drawn |
  | `CALL SHEET · 3` | `CALL SHEET · 0`, which is what `w1440-doc-project-rich.png` reads | R41. The specimen's "3" is *The Post's* three unread, not a call-sheet count |
  | (absent) | **BILL UNINVOICED LINES →**, restored without a count — today's reads `BILL 3 UNINVOICED LINES →` | R39. The act is today's; the count is not in the specimen and is not derivable from it, so the act is printed and the number is not invented |
- **One line carries a real crop, and only one** (R06). `mock/img/` holds five photographs:
  `heirloom-oak-dining-table.jpg` and `heirloom-thumb.jpg` (the same dining set — a table with six
  upholstered side chairs), `live-edge-coffee-table.jpg` (**which is a photograph of an antique
  ladder-back side chair standing on grass** — neither a coffee table nor a nightstand),
  `pendant-lamp.jpg` and `planter-set.jpg`. The specimen names no pendant and no planter. So exactly
  one line in the mock is a piece `mock/img/` actually holds a photograph of:

  | Line | Where | Crop or slot |
  |---|---|---|
  | Dining table + 6 side chairs | Pieces · Dining room | **48px crop** — `heirloom-oak-dining-table.jpg` |
  | PO-2026-0418 (the same dining set) | Orders ledger · Sturdy Oak Woodworks | **48px crop** — the same file |
  | Brass-and-oak console | Pieces · Living room | slot |
  | Hartland wool rug | Pieces · Primary bedroom | slot |
  | Walnut nightstands · ×2 | Pieces · Primary bedroom | slot |
  | Mudroom bench | Pieces · Mudroom | slot |
  | Not specified yet | Pieces · Mudroom | slot |
  | Brass-and-oak console | Orders ledger · Fond du Lac Ironworks | slot |

  The previous build inlined `live-edge-coffee-table.jpg` on the nightstands line; that file is gone
  from the mock and **the dining set is now the only image in it**. The slot is a rail-stock square
  with a **hairline diagonal** through it (R07), so it reads as a deliberate mark rather than as a
  broken `<img>`.
- **The elevation is not canon** — see §3.
- **Three register changes inside today's row grammar, declared rather than reverted** (R38). Each is
  a restyle the direction chose, not a string or a component the mock moved, and each has a reason:

  | Change | Today | Why the mock keeps it |
  |---|---|---|
  | `.ffe-name` is **Playfair italic** | Inter regular (`w1440-ffe-lines.png`, "Møbler Lounge Chair — Bouclé · ×2") | The FF&E line names a **piece**, and the italic Playfair is already today's device for naming a *thing in a room* — it is exactly what the room head above it uses (`ffe-section.tsx:535-556`, §7 choice 7). Making the room and its pieces one voice is the direction's one typographic claim about this region |
  | `.ffe-vendor` is **DM Mono uppercase** | Inter sentence case ("Nordic Atelier") | The vendor is not prose, it is a **key** — the same string that keys the Orders ledger's vendor group, where today already prints it mono uppercase (`w1440-ledger-sheet-orders.png`: STURDY OAK WOODWORKS). One register for one datum across two surfaces. It does cost one mono label per line against §1's "fewer of them", and that is the trade to rule on |
  | the ledger row's `OPEN DOCUMENT →` is **mono uppercase** | lowercase "open document →" | §6's rule — *every act outside the drawer is Scored Ink, DM Mono 12px uppercase with its score*. Today's ledger row is the one place that act is not; keeping it lowercase would make the sheet the single exception to the direction's own act grammar |
- **Seven places where the mock had to choose**, all flagged rather than absorbed:
  1. **Ten of the sixteen roster lines are not in the specimen.** The desk is now drawn at today's
     real density — all sixteen lines under the six stage heads (R04) — but the specimen names only
     five live projects (Vandersteen, Byrne, Okonkwo, Reinhardt, Kaminski). Where the specimen has no
     line, the line is taken **verbatim from `shots/w1440-desk.png` and
     `shots/w1440-desk-roster-rows.png`** — real captured product data, not an invention:

     | Group | From the specimen | Verbatim from today's captured desk |
     |---|---|---|
     | BRIEF · 5 | — | Full Room · Sarah Chen · Sep 2 · Full Room · Lily Tanaka · Sep 3 · Full Room · David Nielsen · Sep 2 · Consultation · Elena Ruiz · Full Room · Marcus Wright · Aug 31 |
     | DISCOVERY · 1 | Reinhardt lake house | — |
     | DIRECTION · 3 | Kaminski condo | Elena Marlowe — Living Room Direction · Concurrency source draft |
     | PROPOSAL · 2 | The Byrne remodel | Aspen Loft — Living Room Refresh |
     | PROJECT · 4 | The Vandersteen Residence | Birch Hollow · Marrow & Vale Residence · Chen Residence |
     | INSTALL · 1 | Okonkwo kitchen | — |

     Today's captured desk carries its OVERDUE line in INSTALL (Aspen Loft Refresh); **here the one
     overdue line is the Vandersteen one**, by the design lead's ruling, so "16 LIVE · 1 OVERDUE" and
     "One thing is overdue — Vandersteen" stay true of the specimen and exactly one line wears the
     terracotta mark. Two captured lines that would have added a second urgent mark (Olsen Lake House,
     Aspen Loft Refresh) are therefore not drawn.
  2. **"Design authority"** is drawn as a folded seam because the assembled direction names it. Today's
     surface has retired that word — `project-authority-band.test.tsx:58` asserts it is absent — so
     this seam is the direction's naming, not today's. Its summary line ("No authorizations recorded
     yet") and its body are verbatim from the shot's authorizations block.
  3. **"Closing the book · 0 OF 0 CLOSED OUT"** is today's empty-state string, verbatim from the shot,
     on a project with 36 lines. The specimen states no close-out count.
  4. **The console's room.** The specimen does not assign the brass-and-oak console to a room; the mock
     files it under Living room, which is the room whose allocation reads "1 damaged".
  5. **The margin anchors.** The specimen ties neither margin item to a line, so the mock's anchors
     are its own: Time → the active Schedule phase, Money → the ordered PO line. The interaction is
     the point; the pairing is not a claim. Both now take the same neutral `--fill-anchor-tint` and
     the same transition, so neither anchor is marked with a pigment that means something else.
  6. **The Mudroom's two unspecified lines** (R13). The specimen gives the Mudroom "5 lines (3
     ordered, 2 unspecified)" and names no piece in it except a **mudroom bench**, mentioned in the
     Post's three unread ("a Vandersteen question about the mudroom bench"). The mock draws the room
     head with its real allocation and the two unspecified lines the region's leader points at: the
     bench, and one line left literally "Not specified yet". Neither carries a maker or a price,
     because the specimen states none.
  7. **The room head's device.** `w1440-ffe-lines.png` shows today's room head as a Strata mark +
     a Playfair-italic name + a right-aligned mono count ("*Not in a room yet* … 3 OF 3 UNDERWAY"),
     which is `ffe-section.tsx:535-556`. The mock mirrors it exactly — mark, italic name, mono
     allocation — so the italic room head is today's device, not the mock's invention (R30).
- **The Orders ledger's second row is keyed by the piece, not a PO.** The specimen gives exactly one
  PO number (PO-2026-0418). The console row therefore carries the piece name where a PO number would
  sit, rather than inventing one. THROUGHPUT reads **1 OPEN · 0 UNSENT**, both derived from those two
  rows.
- **The file is ASCII** (R01). Every glyph above U+007F is a numeric entity in the markup
  (`&#8593;`, `&#8595;`, `&#8984;`, `&mdash;`, `&middot;` …) and a `\uXXXX` escape in the JS, so the
  page cannot mojibake on a `file://` open, whatever charset the host assumes. Gate:
  `LC_ALL=C grep -cP "[^\x00-\x7F]" index.html` → **0**.
- **Four regions of the document are not drawn, and the direction does not claim them** (R36). Below
  Pieces, today's Project document carries a full **Money** region — its own THE MONEY · ONE REGION
  eyebrow, a 24px head, four acts (DRAW AN INVOICE inked / AMENDMENT / HOURS · THIS PROJECT → / FOLD ↑),
  seven money rows each with a mono sub-line, a WORKING BUDGET block and an AUTHORIZATIONS & TRADE
  SCOPES block — then the **"The accounts · this project"** seam, then the **"Schedule dates"** seam, then
  the closing whisper and its three acts (FROM THE ROLODEX / NEW PERSON / LATER). None of the four is
  in the mock. **They are outside the ratified click map** (§5), which is the whole of what this mockup
  undertakes to show, so the mock neither draws them nor claims them. What that costs is worth saying
  plainly: the Money region is the densest, most typographically crowded thing in the product, and the
  direction's three rule weights and three muted inks have therefore **not** been tested on it. It is
  the first place to draw next, and it is not proof of anything today.
- **The 48px slot column is honest, and it is mostly empty** (R37, accepted). Of six Pieces lines one
  carries a photograph and five carry the ruled diagonal slot; the Orders sheet is one photograph and
  one slot. That is the true coverage of `mock/img/` against this specimen, and the picture argues
  both sides of the crop at once — it shows what a linked photograph buys, and it shows a column that
  is mostly furniture for absence. Whether the slot should exist at all when a room has no linked
  photographs, or whether the column collapses, is a question for the ruling, not something to hide by
  drawing stand-in photographs.
- **~~The six movement bands stay saturated under the sheet's .45 scrim~~** (R48) — **retired by the
  2026-08-28 revision.** There are no bands. The scrim now covers a flat cream ground and simply
  recedes, exactly as today's does, and `final-sheet-1440.png` shows it.
- **~~The FF&E wash is the faintest thing on the page~~** — **ruled and closed 2026-08-28.** The first
  cut spent one alpha, 8%, over two surfaces whose pigments differ in value by design, so a roster row
  washed at 1.107–1.132:1 while an FF&E row washed at 1.038–1.059:1 and barely read. The coordinator
  ruled that **the highlight must read on both surfaces**, and that the rule is the ratio rather than
  the alpha: *the wash lands at ~1.12:1 over its own ground; alpha follows the pigment's value.* The
  three state pigments went to 16 / 24 / 16%, landing 1.125 / 1.123 / 1.115:1 against the roster's
  1.107–1.132:1, with every ink on a washed FF&E row at **≥8.19**. The one-recipe claim survives — it
  was always a claim about where the wash lands, and now it is stated that way.
- **The frame is a mock, not the app.** 1440×900 and 390×844 are drawn at native size and scaled down
  only when the window cannot hold them, never up. It is a deliberately single-theme page: every
  colour is painted from a token, so it renders identically on a light or a dark host, and it carries
  no dark theme.

---

## 8. How to rebuild the shots

```bash
# the Chromium launch needs a real mach port, so this one command runs unsandboxed
cd /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/final
node shoot-final.mjs
```

`shoot-final.mjs` resolves `@playwright/test` through `mock/final/node_modules`, a symlink to
`apps/designer-portal/node_modules` — ESM resolves from the script's own directory, not the working
directory, so the symlink is required wherever the command is run from. Recreate it with:

```bash
ln -sfn /Users/kody/Code/patina-merged/apps/designer-portal/node_modules \
        /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/final/node_modules
```

**Nine PNGs** land in `mock/final/shots/`, each clipped to `#frame` at `deviceScaleFactor: 2`:
`final-desk-1440.png` · `final-desk-contents-1440.png` (the desk scrolled to THE STUDIO, so the
dotted leader can be seen — R43) · **`final-desk-hover-1440.png`** (the pointer on the Vandersteen
line, shot 300ms in, past the 260ms sweep) · `final-document-1440.png` ·
`final-document-ffe-1440.png` · **`final-ffe-hover-1440.png`** (the pointer on the ordered dining
set) · `final-sheet-1440.png` · `final-desk-390.png` · `final-desk-1440-reduced.png`
(`reducedMotion: 'reduce'`). The run prints the loaded font families, the `box-shadow` count **per
state, including the sheet opened from the document**, any external request, horizontal overflow at
both widths, the **reachable** focusable count per state beside the markup total, the **wash probe**
(the rgba each hovered row resolves, its clip-path and its transition duration), and the **settle
probe** (R31): how many `settle` animations are running 50ms after PUT DOWN, 50ms after the sheet
closes and 50ms after a 390 → desk toggle. All three must read **0**.

Last run:

```
box-shadow · desk     1  · document 3  · sheet from the desk 2  · sheet from the document 4
external requests     none
horizontal overflow   none          horizontal overflow @390  none
reachable · desk 54  · document 38  · Orders sheet 71  · 390 49
wash · roster (Vandersteen)  rgba(109, 78, 36, 0.08)  clip circle(150% ...)  0.26s
wash · FF&E (dining set)     rgba(196, 165, 123, 0.16)  clip circle(150% ...)  0.26s
settle · 16 on first paint · PUT DOWN 0 · sheet close 0 · 390 -> desk 0 · class left 0
```

`review-clickthrough.mjs` is the reviewer's own adversarial probe — **fourteen** items, screenshots in
`review-shots/`. Re-run it after any edit; it is the only thing that catches what the shoot cannot,
because the shoot only ever captures a state's first paint.

**Item (13) hard-codes no ground.** It walks up from the sampled element compositing every translucent
background until it reaches an opaque one, so the red-letter zone is measured on the `#F9F3EE` it
actually renders as rather than on an assertion about the CSS. **43 of 43** sampled pairs pass; the
floor across the set is **4.70** (clay-ink on the rail).

```
  PASS  13.87  letterhead — title on paper                 fg=rgb(44,41,38)  bg=rgb(252,250,246)
  PASS  13.87  letterhead — instrument value on paper      fg=rgb(44,41,38)  bg=rgb(252,250,246)
  PASS   9.22  letterhead — instrument label (muted)       fg=rgb(78,67,57)  bg=rgb(252,250,246)
  PASS   5.12  red letter on paper — label (terracotta-ink) fg=rgb(156,83,64) bg=rgb(249,243,238)
  PASS  13.14  red letter on paper — the sentence          fg=rgb(44,41,38)  bg=rgb(249,243,238)
  PASS   7.63  red letter on paper — REVIEW DECISIONS act  fg=rgb(92,74,60)  bg=rgb(249,243,238)
  — 43 of 43 sampled pairs pass — 0 short of 4.5:1
```

**Item (14) is the hover wash**, added with the revision. It hovers a roster line and **four** FF&E
lines — ordered, damaged, decision due, and the dining set **anchored** so the wash lands on top of
`--fill-anchor-tint` — composites each row's `--wash` over the ground the row actually renders on
(from the row itself, so an anchor fill is counted), and measures every text on the washed row against
that composite; it also reads the `clip-path` at the moment the pointer lands and again 340ms later,
so the sweep is proved rather than asserted, and it repeats the read under
`prefers-reduced-motion: reduce`. Last run:

```
  -- ROSTER, the Vandersteen line (Project pigment) --
  wash rgba(109, 78, 36, 0.08) over ground rgb(250, 247, 242)  ->  rgb(239, 233, 226)
      (row 1038x86, unchanged by the wash)
  clip-path at t0 circle(21.4794% at 156.747px 26.2918px) -> after 340ms circle(150% at 313.4px 44px)
      SWEPT   transition 0.26s
  the name's score: rgb(196, 165, 123)          <- clay, and drawn
  PASS  12.00  .job-name      PASS  7.97  .job-need
  PASS   4.68  .job-overdue   PASS  5.63  .act
  -- FF&E, the ordered dining set (clay .16) --
  wash rgba(196, 165, 123, 0.16) over ground rgb(252, 250, 246) -> rgb(243, 236, 226)   SWEPT  0.26s
  PASS  12.33 .ffe-name   PASS  8.19 .ffe-vendor   PASS 12.33 .ffe-price   PASS 11.71 stamp word
  -- FF&E, the damaged console (terracotta .16) --      -> rgb(246, 236, 230)   SWEPT
  PASS  12.44 / 8.26 / 12.44, stamp word 11.76
  -- FF&E, the Hartland wool rug (golden hour .24) --   -> rgb(247, 237, 204)   SWEPT
  PASS  12.35 / 8.21 / 12.35, stamp word 11.72
  -- FF&E, the dining set ANCHORED and hovered --       -> rgb(225, 221, 215)   SWEPT
  PASS  10.69 / 7.10 / 10.69, stamp word 11.71
  keyboard focus on the name: wash clip circle(150% at 50% 50%) (instant, transition 0s)
      + focus ring "2px solid rgb(124, 94, 48)"
  => swept: roster true / ordered true / damaged true / decision true / anchored true;
     0 washed-row text(s) short of 4.5:1
  hover wash under reduce -- immediately: clip circle(150% ...) bg rgba(109, 78, 36, 0.06) dur 0s
  hover wash under reduce -- after 320ms: unchanged  (INSTANT: no sweep)
```

The gates:

```bash
cd /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/final
LC_ALL=C grep -cP "[^\x00-\x7F]" index.html         # 0 -- the file is pure ASCII
grep -n "box-shadow" index.html                      # 3 lines, all box-shadow: var(--elevation-sheet)
grep -n "elevation-sheet" index.html                 # + the one :root declaration = 4
grep -cE "https?://" index.html                      # 0
grep -ciE "elevated|curated|luxur|bespoke|seamless" index.html   # 0 -- the brand grep
awk '/^:root \{/,/^\}/' index.html > tokens.css      # regenerate, then:
node ../../research/contrast-check.mjs tokens.css    # 0 failure(s), 22 warning(s)
```

`mock/final/tokens.css` is the `:root` block of `index.html`, lifted out because
`contrast-check.mjs` parses CSS and cannot read a whole HTML file.

The brand grep runs over this file too and reads **1** — this page, on the line above, quoting its own
pattern. Every other file in `mock/final/` reads 0.

---

## 9. Review dispositions — every finding in `REVIEW.md`, answered

Thirty findings, R01–R30. "fix" means the mock changed; "accept" means the mock did not change and
the reason is stated. **Three rows below were superseded by the re-review** — R05 and R22 by
R33's pigment ruling, R16 by R31's measured replay — and each says so in place. The re-review's
own dispositions, R31–R48, are §10.

**This section and §10 are kept as history, and they are history.** They record what was decided on
the build that carried the six movement stocks and the charcoal band. Kody's 2026-08-28 revision
removed both; where a row's *numbers* were measured against a ground that no longer exists, the row is
marked **[superseded 2026-08-28]** and §2 carries the current value. The *rulings* in these rows all
still stand — one recipe per stamp, one pigment per state, today's order on the letterhead, the ASCII
fold, the settle-once mechanic, the dialog contract.

| # | Severity | Disposition | What happened |
|---|---|---|---|
| R01 | blocker | **fix** | The whole file is folded to ASCII — the two JS arrows became `\u2191` / `\u2193`, every decorative box-rule and em-dash in the comments became ASCII. `LC_ALL=C grep -cP "[^\x00-\x7F]"` → 0; the probe now reads `FOLD ↑` / `UNFOLD ↓` correctly on the first click. |
| R02 | blocker | **fix — fully, under the design lead's ruling** · *[values superseded 2026-08-28]* | First pass held each stamp's own `-ink` as the word, which capped the terracotta stamps at 1.074:1. The design lead then ruled **one recipe for all filled stamps**: pigment fill over the sheet the stamp sits on, the 1.5px pigment border, and a **charcoal word**. The ruling stands; the sheet changed. Then: fill ≥1.15:1 over `#F8EED0` — `#EADBBA` / `#EFD9BF` / `#E1DCC9` / `#F1DB91`, charcoal 10.52–10.57:1. Now: ~1.18:1 over `#FCFAF6` — `#EFE6DA` / `#F3E5DF` / `#E7E8E8` / `#F5E7B9`, charcoal **11.71–11.78:1**, and fully gated. Current table in §2. |
| R03 | high | **accept (stocks) + fix (tabs)** | The stocks stay at one value, 1.001–1.007:1 between neighbours — movement told by hue between movements, per Kody's ruling. The six **tabs** are rebuilt: no two hues closer than 30.0°, each a value step ≥1.080:1 darker than the last, white ink 5.22–8.20:1 (§2). |
| R04 | high | **fix** | The desk draws all **sixteen** lines under the six heads, at both widths. Ten come verbatim from today's captured desk; the table of which is which is §7 item 1's neighbour. |
| R05 | high | **fix — superseded by R33** · *[values superseded 2026-08-28]* | The first answer gave DECISION DUE a **sage** fill under a **shared terracotta-ink border**, which left the two stamps 98% the same object and put canon's settled pigment on a decision the designer owes. Closed by giving DECISION DUE **golden hour** in both halves, against DAMAGED's terracotta in both. Recomputed over the untinted sheet the gap is wider still: `#F5E7B9` (46.0°, 75%) against `#F3E5DF` (18.0°, 45%) — **28.0° of hue, 30 points of saturation, and two different border inks.** |
| R06 | high | **fix** | The mislabelled crop is deleted from the file. Only the dining set carries a photograph — on its Pieces line and on its Orders row — because it is the only piece `mock/img/` actually holds. Full table in §7. |
| R07 | high | **fix** | The unlinked slot carries a hairline diagonal, so it reads as a mark, not a failed image. |
| R08 | high | **accept-with-note** | The stocks are ratified and hue-only by ruling (R03), so halving them is not the mock's call. What the mock did do partly answers it: the desk now draws 16 lines so the bands are broken by content rather than being empty colour fields, the head reads **1 OVERDUE**, and the terracotta mark is the *only* terracotta on the page — the job marks follow `desk-roster.tsx` and the section marks gave the movement palette back (R26). The taxonomy-vs-state balance is still a ruling for the team. |
| R09 | medium | **fix** | The `.rh-ledger .act` sans/sentence-case override is deleted. Every act outside the drawer is Scored Ink, DM Mono uppercase with its score; the leader is the `inked` variant. The drawer keeps sentence-case Inter, which is what today's drawer is. |
| R10 | medium | **fix (the claim)** | "112" is gone. §5 prints the **reachable** count per state — desk 54, document 36, Orders sheet 71, 390 49 — beside the 156-button markup total, and `shoot-final.mjs` measures all four. |
| R11 | medium | **fix (the claim)** | §3 prints four counts, not three: desk 1, document 3, **sheet from the desk 2, sheet from the document 4**. The shoot opens it both ways and prints both. |
| R12 | medium | **fix** | The 390 desk gets back "· 1 OVERDUE", the second whisper (FINISH SETTING UP), and the full body copy — its roster markup is now byte-identical to the 1440 one. |
| R13 | medium | **fix** | The **Mudroom** is drawn — head, real allocation (5 lines · 3 ordered · 2 unspecified) and the two unspecified lines the leader points at. Pieces now draws four rooms for "4 rooms". Declared as choice 6 in §7. |
| R14 | medium | **fix** | New `--fill-anchor-tint` (dusty-blue over the sheet) replaces the ordered-money pigment at both anchor sites, and `.phase-row` gained the same `background-color` transition `.ffe-row` had, so the two halves behave alike. |
| R15 | medium | **fix** | The sheet takes `aria-modal`, moves focus to its first act on open, traps Tab inside itself, and restores focus to the opener on Esc / PUT BACK. The probe now reads `focusMovedIntoDialog: true`. Marking the desk beneath `inert` is left to the build. |
| R16 | medium | **fix — the roster half was wrong; see R31** | The claim was true of `settleRoster()` and false of the page: a hidden `.screen` replays a cancelled animation, so the class had to come **off**, not merely be added once. 0 running after every return to the desk now. `settleRoster()` runs once, on first paint. `ink()` only adds `is-inked`, so a stamp wipes in on the state change that first shows it and never again — the two DECISION DUE stamps still ink in on the unfold, because they are inside a closed seam at boot. |
| R17 | medium | **fix** | `.ledger-line-1` is a four-column grid, so the date holds its own column instead of dropping behind a long state. Nothing is clipped. |
| R18 | medium | **fix (the framing)** | §3 now cites **R72** (`DECISIONS.md:2589-2596`) alongside D4: the drawer *is* the dock and its shadow was already relaxed, so the amendment is **two new sites**, and the ledger sheet's is invisible under the .45 scrim. The ask shrinks to one question — do the two margin chips get a shadow? |
| R19 | low | **fix** | The drawer centre carries book / people / scan corners / ledger / magnifier as inline SVG, the bell keeps its **terracotta unread dot**, and the studio contents get their own glyph per line (book, people, scan, box, ledger, clock, bell). The Begin column keeps today's em-dash leader. |
| R20 | low | **fix** | No breadcrumb on the desk; **DOCUMENT** in the document. |
| R21 | low | **fix** | **Corrected claim (R46):** *one* desk whisper carries the `×` — the first, the one that reads APPEARS ONCE · RECEDES ON USE — and so does the margin whisper. Today's second desk whisper ("The studio isn't fully set up. FINISH SETTING UP") has **no** `×` (`shots/w1440-desk.png`) and the mock correctly gives it none. Three `whisper-x` buttons in the file, in the right three places; the old wording would have added an affordance today does not have. |
| R22 | low | **fix — completed by R42** | `--fill-production-tint`, `--fill-delivered-tint`, `.stamp-production` and `.stamp-delivered` are deleted; `--color-terracotta` is the urgent job mark and `--color-dusty-blue` the quiet one, so both are live. The sweep R22 asked for was run only over the *fills*; run over **every** token it turns up two more that were declared and never printed: `--color-sage-ink`, now deleted, and `--duration-fast`, now spent at the five sites that carried its literal. §2 prints ratios only for what appears on the page. |
| R23 | low | **accept** | The full-bleed band is still built by overflowing `.stage-group` 200px each way against `.sheet-on-desk`'s 200px gutter, and `.da-pool`'s `inset: 2px -5px 5px` still makes each act a 5px scroll container. Both are **clipped by design** — `.scroll { overflow-x: hidden }` — nothing crosses the frame's right edge at either width (`pastRightEdge: []`), and the shoot reports no horizontal overflow. It hard-codes the desk's gutter into the band and will not survive a fluid desk; that is a note for the build, not a defect in the picture. |
| R24 | low | **fix** | `--i` is set on all sixteen 390 lines (the 390 roster is the same markup), and the stagger is capped at the 7th line so sixteen lines do not settle for a full second. |
| R25 | low | **accept-with-note** | **Corrected number (R47):** the smallest act at 390 measures **30px**, not 29 (probe 9). Same reading — clears WCAG 2.2 AA 2.5.8 (24px), misses the 44px comfortable target. Today's product has the identical geometry (`.act` padding on 11px mono), so changing it here would make the mock stop being a stylesheet over today's product, which is the one promise §1 makes. A real fix is `globals.css`'s `.da-act { min-height: 44px }` contract, which belongs to the build. |
| R26 | low | **fix** | `.sect-mark` goes back to `--color-clay`; the movement palette stays for movements. |
| R27 | low | **accept** · *[resolved 2026-08-28]* | The red-letter zone was a bordered tinted block **inside** the charcoal band — band + box, one nesting level more than today. The band is gone, so the zone is now exactly what today's is: a terracotta wash on the paper behind a 2px terracotta rule. |
| R28 | low | **fix** | The rail is `#E8E3DB`, ≥1.09:1 against every sheet; the margin chips are lifted paper `#FCFAF6`. Every rail text clears 4.5:1 on it, so nothing moved to charcoal. Numbers in §7 item 1. |
| R29 | low | **fix** | The sheet's `?` and **SELECT MULTIPLE** are back; the document drawer shows **IN HAND TODAY 0:47**; the bell has its dot. The letterhead's dashed NEEDS SETUP · 1 → chip stays dropped — it is project-specific and the specimen's project is set up — and §1's "dashed appears nowhere" is a rule about the rule weights, stated as such. |
| R30 | low | **fix** | **NUDGE** is deleted (no shot of today's surface shows it). The italic room head is **kept and mirrored exactly**, because `w1440-ffe-lines.png` shows it as today's device (Strata mark + Playfair italic + right-aligned mono count) — the mock now draws the mark it was missing. `.job-mark` follows `desk-roster.tsx:23-26`: `--color-terracotta` urgent, `--color-dusty-blue` quiet, no mark otherwise — so a dot no longer accidentally matches a tab. |

---

## 10. Re-review dispositions — R31–R48, and the four rows the first pass left partly open

The design lead's rulings, applied. One line each. Every number below is re-runnable from
`shoot-final.mjs`, `review-clickthrough.mjs` or `research/contrast-check.mjs`.

| # | Ruling | What happened |
|---|---|---|
| **R31** | **FIX (blocker)** | The roster settles **once per page load**. `.settling` is added on first paint and removed on each line's `animationend` (900ms belt for lines never painted, and for reduced motion where the event never fires); nothing puts it back, because `.screen { display: none }` cancels and replays a running animation. Probe, 50ms after each switch: **PUT DOWN 0 / sheet close 0 / 390 → desk 0**, and **0** lines still carry the class. Was 16/16 on all three. |
| **R32** | **FIX (blocker)** | `.phase-row` joins `.margin-chip, .ffe-row` in the `prefers-reduced-motion: reduce` block. All-element sweep: **0 of 1082** elements inside `#frame` report a non-zero animation or transition duration (was 6 of 1003), the hover wash included. The Time chip's anchor snaps exactly as the Money chip's does. |
| **R33** | **FIX** | One recipe kept; **one pigment per state, spent on both the fill and the 1.5px border.** ORDERED clay / clay-ink, DECISION DUE **golden hour** / **golden-hour-ink**, DAMAGED terracotta / terracotta-ink, the anchor dusty-blue. Sage is off the stamps entirely — it is canon's settled pigment and never marks something the designer owes. Measured borders: `rgb(124,94,48)` / `rgb(121,101,30)` / `rgb(156,83,64)`, no repeat. |
| **R34** | **FIX (the ruling is now explicit, not inherited)** · *[values superseded 2026-08-28]* | The four fills sit on one plane by the one-recipe ruling — now ~1.18:1 over the untinted sheet, 1.001–1.006:1 from each other — so they separate by **hue and saturation**, and §2 prints the pairwise table so that trade is ruled on rather than discovered. On the new ground the gaps widened: DECISION DUE vs DAMAGED **28.0° / 30 pts**, DECISION DUE vs the anchor **134.0° / 73 pts**. |
| **R35** | **FIX** · *[the band is gone, 2026-08-28; the ORDER is what survives]* | Today's order restored and still drawn: **letterhead → instrument row → red letter**, then the act ledger. Then, all three rode the one charcoal band and took base pigments because the I151 darkening inverts on charcoal. Now they sit on the paper and take paper inks — the ratio table is in §2, *The 390 mobile bar's own register*. `--band-terracotta-quiet-ink` was live only for the band and is deleted. (The specimen's project is set up, so there is no NEEDS SETUP line between letterhead and instruments — declared at §9 R29.) |
| **R36** | **ACCEPT-WITH-NOTE** | The Money region, the accounts seam, the Schedule-dates seam and the closing rolodex whisper are **out of the ratified click map** (§5), so the mock does not draw them and §7 now says so — including the cost: the densest, most crowded region in the product is the one the three rule weights and three muted inks have **not** been tested on. |
| **R37** | **ACCEPT** | Honest slots, one real crop. §7 now states the coverage plainly (one photograph, five slots in Pieces; one and one in the sheet) and puts the question the picture raises — whether the column should collapse when a room has no linked photographs — to the ruling rather than answering it with stand-in photographs. |
| **R38** | **DECLARE** | The three register changes are kept and declared in §7 with a reason each: the FF&E line's **Playfair italic** name (the room head above it already is — one voice for a thing in a room), its **DM Mono uppercase** vendor (the vendor is a key, and today's Orders ledger already prints it that way), and the ledger's uppercase **OPEN DOCUMENT →** (§6's rule that every act outside the drawer is Scored Ink). The mono-per-line cost against §1's "fewer of them" is stated. |
| **R39** | **FIX** | **Pieces folds again**, unfolded at rest, and its head carries the two acts it was missing: **BILL UNINVOICED LINES →** and **FOLD ↑** beside SPEC THE 2 UNSPECIFIED → and ADD A LINE. The count in BILL is left off — today reads "3", the specimen states none and none is derivable (declared, §7). New row in the click map; markup 156 → 158, document reachable 36 → 38. |
| **R40** | **FIX** | The twelve invented dates are gone. Phase **i** prints `Mar 2 —` and phase **v** `Sep 15 —` — the only two dates `specimen.md` states, each as an open range because the specimen states no range end; the other four print the **em-dash placeholder** today uses for a date it does not have. |
| **R41** | **FIX** | `CALL SHEET · 3` → `CALL SHEET · 0`, which is what `w1440-doc-project-rich.png` reads. §6's list is corrected with it. |
| **R42** | **FIX** | The five `150ms` literals are `var(--duration-fast)`. Full token sweep, then one deletion: **`--color-sage-ink`**, declared so the gate could measure it and then never printed. `--color-golden-hour-ink` is no longer unused — it is the DECISION DUE border (R33). The 2026-08-28 revision deleted seven more that lost their surface: the six `--stock-*` and `--band-terracotta-quiet-ink`. Every `--*` in `tokens.css` still has at least one `var()` in `index.html`. |
| **R43** | **FIX** | The **dotted leader** is back: it runs from each ROOMS / LEDGERS name out to its `↗` or SHEET tag, on the name's own baseline. BEGIN's five glyphs are back after the em-dash — folder-plus, pencil, file, hammer, tag, per `w1440-desk.png`. **And one thing the re-review did not catch:** both the name and the sub-line were inheriting the act's uppercase and .1em tracking, so the whole block read as mono caps where today reads "Library / pieces and makers". Both are back in today's register — Playfair sentence case, lowercase mono — which also makes §1's claim about the contents true. New shot: `shots/final-desk-contents-1440.png`. |
| **R44** | **FIX** | The sheet lands focus on **PUT BACK · ESC**, by id, not on whatever sits first in the head's DOM order. Probe: `activeElement: "Put back · Esc"`. The `?` keeps its place in the visual order and in the Tab trap. |
| **R45** | **ACCEPT** | No `<meta charset>`. The artifact skeleton owns the charset at publish, and the file is pure ASCII (`LC_ALL=C grep -cP "[^\x00-\x7F]"` → **0**), which is a subset of every fallback encoding — so there is nothing for a `file://` open to garble. |
| **R46** | **FIX (the claim)** | §9's R21 row is corrected: **one** desk whisper carries the `×`, and so does the margin whisper. Today's second desk whisper has none and the mock correctly gives it none; the old wording would have had an implementer add an affordance today does not have. |
| **R47** | **FIX (the claim)** | §9's R25 row now reads **30px**, which is what probe (9) measures. The reading is unchanged. |
| **R48** | **ACCEPT**, then **RETIRED 2026-08-28** | The six bands stayed saturated under the .45 scrim, declared in §7 as a consequence of spending the colour budget on grounds. Kody's revision removed the bands, so the finding no longer has an object. |

**The four rows the first pass left partly open.**

| # | Where it stands |
|---|---|
| **R05** | **Closed by R33.** The objection was that DECISION DUE and DAMAGED were still one stamp; golden hour gives DECISION DUE its own fill *and* its own border ink, so nothing is shared but the recipe and the charcoal word. |
| **R08** | **Still accept-with-note, and here is why not.** The one-line item left was the desk's first 900px: greeting → colour fields → rule, with the single overdue thing below the fold wearing a 7px dot inside a band louder than it is. That is not a one-line fix and it is not the mock's call: halving the stocks' saturation would reverse Kody's own R03 ruling (movement told by hue between movements), and promoting the overdue line above the roster would move a surface, which is the one thing §1 promises not to do. **The taxonomy-vs-state balance stays on the ruling sheet**, and the re-review's sentence for it — the desk spends its budget on *which movement* and almost none on *what needs you* — is the fairest statement of the question. |
| **R19** | **Closed by R43.** The two items left — the dotted leader and BEGIN's per-line glyphs — are both drawn. |
| **R22** | **Closed by R42.** The sweep R22 asked for was run over every token, not just the fills; the three it found are spent or deleted. |
| **R16** | **Closed by R31**, and it is the same finding: the claim was true of the function and false of the page. |
