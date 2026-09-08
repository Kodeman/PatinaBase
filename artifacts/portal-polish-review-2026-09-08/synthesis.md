# Portal polish — panel synthesis

Seven reviewers read the outside team's proposal ("A home taking shape"), the
two live portals, and the code behind them. Visual craft, interaction, IA and
wayfinding, accessibility, brand and editorial, plus two seats at the table —
Leah Hartwell, the studio principal carrying sixteen live jobs, and Nora
Ellison, the homeowner with $4,060 due in four days. This is the verdict, the
direction, and the five principles the specimens are built to prove.

---

## 1. Verdict on the outside proposal

**The diagnosis is right, and it is specific enough to act on.** Five things
the panel confirmed independently:

- The studio's creative work is never on screen with the day's work.
  `RecentBoardsStrip` sits *after* the entire roster, so at 16 jobs it is
  ~2,000px down and at 43 it is ~4,000px down (IA-17, L1).
- The client's decision moment has no stated consequence. The wall gate says
  only "Type your full name to accept"; it never names what acceptance
  releases (IX42, N4).
- Product imagery is placeholder. Five of six FF&E thumbnails render as a
  diagonal hash in a hairline square — a drafting mark for *void* — beside
  dollar figures up to $14,880 (VC-44, VC-20, L6, IA-32).
- Empty rooms render as empty rectangles. Hall and Stair draw as outlined
  ~370×25px boxes holding a 9px room name — precisely the "anonymous empty
  rectangle" the deck's own slide 11 warns against, already shipped (VC-45,
  IA-31, IX41).
- The terminal act is under-weighted and hover-gated. `.da-tertiary` carries
  `transform: scaleX(0)` at rest, so on a phone the Desk and the mat present
  zero visible interactive marks; and the wall gate's accept word renders at
  full charcoal ink while the code intends it disabled (IX03, IX04, IX02,
  B01).

**The prescription is mostly wrong for these two users.** It answers a paper
problem with a marketing-page grammar: hero photograph, sage pill, filled
olive CTA, green receipt with a circled ✓ (BE-12, IA-26, L4). On a surface
whose credibility is paper, that is a downgrade in trust. Leah: "I've fired
software for looking like this." Nora, on the photoreal room: "I was about to
feel proud of a room I don't have." Four specific failures:

**The Desk breaks at real load.** The hero board plus "Ready for your hand"
occupies ~460px above the roster head, so at 1440×900 a designer sees zero
jobs on first paint where today she sees six and two stage plates (IA-01,
IX25). Stage grouping is replaced by a text column, turning "show me
everything in install" from one heading scan into reading 43 rows (IA-02,
IX27). There is no overdue channel anywhere: no count, no sentence, no row
mark (IA-03). It was demoed at three jobs, against the deck's own audit
finding of 43 (L2).

**The client page has no money on it.** No letterbox, no balance, no due date
— so the one filled primary on the page points at a $2,400 review rather than
the $4,060 obligation with a date on it (IX12, IA-19, N1, N10). The
homeowner's name appears zero times across fifteen slides; the studio's name
appears twice (BE-01, BE-02).

**The materials are fake.** "Natural oak" and "Smoked oak" are
`repeating-linear-gradient` stripes at 95px that read as corrugated card, and
the one enlarged "Solid oak table" preview is a stock photo of a green-velvet
dining set with a glass top — on the slide arguing that materials need room
to speak (VC-38, VC-39, BE-18).

**The system breaks its own spec.** 55 hex literals against a 9-token
palette, ~40 of them named nowhere; 25 font sizes against a stated six-step
scale; twelve radii against a stated "6px"; nine Playfair sizes serving one
rank; both fonts variable with no `font-weight` descriptor in `@font-face`,
so every 600/700 in the deck — pills, buttons, totals — is faux bold; DM Mono
deleted silently while slide 5 tells you to use it (VC-01, VC-04, VC-05,
VC-06, VC-13, VC-21). The elevation triad the deck asks us to amend D4 for is
indistinguishable at render: Record (flat + border) and Object (`--lift`, 8px
at ~6% alpha) cannot be told apart on the specimen board that argues for them
(VC-48, A48).

**What verifies, verifies exactly.** The three published contrast ratios are
honest to two decimals — 13.53 body, 6.35 muted, 9.24 primary-on-olive (A01).
44px targets are real, including a late correction pulling `.lens button` from
40 to 44 — someone checked (A13). Reduced motion is complete (A36). All
fifteen images carry honest alt text (A37). And the focus indicator — 3px at
4px offset, never below 7.35:1 on any ground it lands on — is better than
either portal's (A23). We take the geometry and change the pigment.

---

## 2. Keep / modify / decline

### KEEP — adopt as proposed

| What | Evidence |
|---|---|
| A consequence sentence at every terminal act — what the act does, and what it does not do | IX42; BE (non-commitment copy is "the language of a firm that expects to be held to what it wrote") |
| The amount inside the act label, generalised from the invoice's own `Pay $9,130.00` | IX (proposal "correctly generalised" the pattern) |
| "Nothing needs you today" on the client page — with the date and the source of the next thing | BE-4 ("better than 'quiet · nothing needs your hand'"), N8, VC ("a correct, un-illustrated empty state") |
| Focus indicator geometry — 3px ring at 4px offset — in Patina pigment, not olive | A23, IX07 |
| Reserved feedback space: a status line with `min-height` so the layout never shifts under a pointer | IX (`.feedback{min-height:28px}`) |
| Image caption discipline: what it is / whose it is / when | A37, BE-2 |
| The money table composition — Piece / Delivery / Total to one rule, allowance as a sentence below the rule, no illustrative tax | VC ("best-composed object in the deck"), IA-25, BE-28, A45 |
| "Continue where you left off" and "a client replied last night" as roster-head *lines*, not a hero | L16, IA-07 |
| Finish comparison in the designer's own document, with real sample photographs | L10, BE-18 |
| 44px minimum targets, stated in the token file | A13 |
| 12px sentence-case values for metadata legibility; DM Mono caps retained for running heads only | A12, C12 |
| The date-field error pattern — `<label for>` + `aria-invalid` + `aria-describedby` + visible non-colour error | A31, L14 |
| The image-source hierarchy, enforced by caption | BE-20 |

### MODIFY — the idea is right, the execution changes

| Proposal | Ruling |
|---|---|
| Filled primary action | Yes — but only at terminal money/paper acts, in charcoal `#2C2926`, which is already Patina-native on the invoice. Never olive. (VC-69, IX10) |
| Larger piece imagery | 96–120px plates on desktop above a value threshold, 64px in dense schedules — with a **drawn silhouette** placeholder, never a hash block (BE-21, IA-32, VC-44, L6) |
| Density toggle | Becomes roster **facets** — "Only what needs me" / "By person" — not a padding switch that saves ~15px a row (IA-11, IA-12, IA top-5 #4) |
| Landmarks row | A five-item **landmark ledger** under the doorplate with real anchors, omitted when the target does not render — not a footer index pointing at ids that don't exist (IA-20, IA-21, A30, IA top-5 #2) |
| Decision view | Expands **in place at an anchor**, never a route — the deep-link fold every note and email depends on must survive (IA-24, IA-46) |
| Receipt | A stamped, numbered, party-named record on paper — not a green card with a circled ✓ (BE-14, IA top-5 #2) |
| "Ready for your hand" | Becomes **"The day's line"**: at most three lines derived from the roster's own need model, inside the roster head, never a second queue (IA top-5 #1, IA-05) |

### DECLINE

| Proposal | Why |
|---|---|
| Hero photograph of a generated room on the client page | VC-40, L3, N2, BE-20 — a convincing fake room beside a real dollar figure is the fastest way to lose trust in every other number |
| Pills, status dots, badges | IA-39, L4 |
| Green success fill | IA-26 |
| The flat / lift / overlay shadow triad | VC-48, A48 — indistinguishable at render, invisible at 200% zoom and in forced-colors |
| New accents olive `#394B38`, ochre `#A47836`, sheet `#FFFDFA` | VC-13 to VC-16 — none exists in the repo; ochre is 3.69:1 and will become body text; `#FFFDFA` vs `#FCFAF6` moves ~1.5/channel |
| A flat roster without stage plates | IA-02 |
| Inline "Find a project" replacing ⌘K | IX28, IA-13 |
| PATINA wordmark or "us" copy on client surfaces | BE-01, BE-02, BE-05 |
| The "LW" avatar disc | BE-10 — a chat convention on a letter |
| ✓ glyphs as typography | BE-15 |
| A spinner | BE-37 — the client portal's `HoldAction` already refuses one |

---

## 3. Five principles of polish & professionalism

### 1. The studio is the author; Patina is the press.

**Rule:** every client surface opens with a two-sided letterhead — studio
left, "Prepared for &lt;Client&gt;" right — and closes with a colophon,
"Prepared by &lt;Studio&gt; · Sent through Patina". No Patina wordmark above
the colophon. Never a placeholder identity. The designer's full name and date
on every note. Copy in the studio's voice.

**Evidence:** the standalone invoice already does this and it is the strongest
brand artifact in the system (BE-26, BE-03). The proposal never reproduces it
(BE-01, BE-02, BE-34). The live portal already breaks it in one place:
"LEAH HARTWELL" as the studio and "PREPARED FOR CLIENT USER" as the addressee
(BE-23, VC-62).

**What changes:** "Tell us what you would like to change." → "Tell Leah what
you'd like to change." (BE-05). "Leave the house" → "Sign out", with "the mat"
kept as the running head (BE-09). The studio note signs "Leah Hartwell ·
Local Dev Studio · 3 September 2026", not "— L." (BE-10). Where the client's
display name is unset, the right-hand slot prints nothing.

### 2. Money, dates and names carry the largest true type.

**Rule:** a floor of 15px, sentence case, ≥4.5:1 for any money figure, date,
party name, or consequence sentence. One family for money — DM Mono tabular
figures aligned to one rule. The owed figure outranks the agreed figure. One
date style, "11 September 2026". Never a $0 placeholder. One sentence
reconciling agreed / paid / owed.

**Evidence:** C15 sets the floor; A10 finds the proposal's money-safety
sentences at 12px, the smallest copy on the page. VC-10 finds one payment set
in three families inside 120px on the invoice; BE-17 the same. IX39 and BE-38
find the hierarchy inverted on the doorstep: "The house stands at $11,100
agreed" at ~19px Playfair, and "$4,060 · due 11 September" — the figure with
an obligation and a date — at ~12px mono beneath it. IX47 finds three money
figures on the doorstep that never reconcile. BE-16 finds "due 11 September"
one line above "due September 11."

**What changes:** the owed figure takes the announcement rank; every ledger
figure is DM Mono tabular to one right rule; one reconciling sentence sits
under them.

### 3. Every act shows its weight and its consequence.

**Rule:** three tiers, assigned by consequence and never by page.

- **Tertiary** — a scored word with a resting 1px rule at ≥3:1
  (`--color-aged-oak #8B7355` = 4.20:1).
- **Secondary** — the two-score word.
- **Terminal** — money moves or a paper is signed: filled charcoal, paper
  text, the amount inside the label.

One consequence sentence at ≥15px above every terminal act. The hold is
announced to pointer users ("Press and hold to accept"), not only to screen
readers. `aria-disabled` with a named reason instead of `disabled`. After the
act, the act is replaced by its dated record. Selection (reversible, "Note my
choice") and authorization (typed name) are different tiers. Focus: a 2px
`--color-clay-ink #7C5E30` outline at 2px offset, plus the existing caret.

**Evidence:** B01 measures the resting score at 1.75:1 — below SC 1.4.11 — so
"OPEN THE JOB" reads as metadata until hover, and on touch there is no hover
(IX03, IX04). IX02: the accept act renders at full ink while disabled. IX01:
HOLD_MS is 900 and the sentence naming the gesture is `sr-only`. A16 and C05:
the real `disabled` attribute removes the gate from the tab order and takes
its `aria-describedby` reason with it. IX11: an "APPROVED" chip sits beside a
still-enabled "✓ APPROVE" act. IX10: three unrelated action grammars ship in
one product. IX09 and L7: paying $9,125 is one click, accepting $2,980 of
finished work needs a typed name and a 900ms hold. The interaction verdict and
N5/N7 separate the tiers: a checkbox records that someone understood; a typed
name records *who*.

### 4. Honest imagery at real scale.

**Rule:** a source hierarchy enforced by caption — installed photograph >
the studio's own board or scan still > the maker's product photograph > a
drawn silhouette. Never a procedural fill. Never stock. Never a generated
room captioned as the client's. Every plate captioned what / whose / when in
12px. Piece plates at 96–120px on desktop. An empty room is a floor line and
one sentence, never a rectangle. The room drawing's footprint labels hold an
11px rendered floor on a phone.

**Evidence:** BE-18 and VC-38/VC-39 on the fake materials; VC-40, L3, N2 on
the generated room captioned "Your home"; VC-44 and L6 on the hash-block
placeholder; IA-31, IA-32, VC-45 on the empty rectangles and the 64px plates;
C01 on the footprint labels rendering at 3.9px at 390 — `plan-key.tsx`
already solved this with a documented eleven-pixel floor and a phone crop, and
`room-band.tsx` never got it (A top-5 #1). BE-22: the homeowner sees nothing
of her own house but line drawings — honest and dull, and dull reads as cheap.
The answer is the studio's own material, captioned truthfully, not stock.

### 5. One scale, one rhythm, absence is silence.

**Rule:** a seven-step scale. Playfair 34 / 26 / 20 at weight 500, tracking 0
below 40px, italic reserved for authorship and asides. Inter 16/1.55 and
14/1.5. DM Mono 12 and 11 at 0.08em — caps for running heads, sentence case
for values. A 24px vertical module. Three radii: 2px and 3px hairline boxes,
50% only for marks. Three paper stocks — `#FAF7F2`, `#FCFAF6`, `#E8E3DB` —
and a hairline of `#E8E3DB` or `rgba(44,41,38,.14)`. No shadows in the
specimens; the existing `--elevation-sheet: 0 1px 2px rgba(44,41,38,.08)` may
appear only on a temporary sheet. State pigments only: clay `#C4A57B`/
`#7C5E30`, golden hour `#E8C547`/`#79651E`, terracotta `#D4A090`/`#9C5340`,
sage `#A8B5A0`/`#5F6B57`. A region with nothing to say renders nothing. A
sentence that names a thing links to it. Wrap, never truncate. The story pole
navigates. Nothing placeholder.

**Evidence:** VC top-5 #1 on the scale (the proposal's would be a downgrade —
it has 25 sizes); VC-32 on the Desk header's 24/55/20/45/65px intervals with
no module; VC-34 on the Threshold's 20–90px band intervals; VC-21 on twelve
radii; IX05, IX40 and IA-22 on sentences that name a thing and don't link to
it — the doorstep announces an ask whose gate sits ~1,400px below with no
jump; VC-46, IA-29 and IA-30 on truncation in the drawing, the plan key and
the Previously record; IA-23 on the story pole holding every section id and
rendering none as a link.

---

## 4. What the current portals must keep

The panel agreed on these without being asked to:

- **The scored-ink grammar.** Three ranks by rule-count and pigment rather
  than three box styles. Nothing in the proposal is this well-drawn (VC).
- **"Good morning, *Leah*" over a DM Mono caps date.** Authorship, warmth and
  precision in two lines, with no photograph and no avatar.
- **The overdue trio** — "EVERY JOB · 16 LIVE · 1 OVERDUE", then "One thing is
  overdue — Vandersteen.", then a terracotta line on the row. Three levels of
  the same fact, each legible alone. The proposal has no replacement (IA-03,
  L1, IX).
- **The stage plates.** Six pigments, white 11px mono, count inside, 5.22–8.20:1
  — colour genuinely supplementary, and the fastest scan device on either
  surface at real load (B08, IA, IX).
- **The house ledger + letterbox pair, with `data-never-dim`.** Agreed total,
  owed, invoice number, paid, balance and due date inside the first screen,
  structurally exempt from any dimming pass. IA calls it the single most
  professional decision in either portal.
- **`HoldAction` and `consent-copy.ts`.** 900ms, keyboard hold parity, scroll
  cancels, early release is a silent cancel, reduced motion stills the fill but
  keeps the wait, `mobile_dock` so a long paper cannot bury the act — and
  per-instrument consent lines drift-tested against the signing API. This is
  "defensible if disputed" (IX).
- **The FF&E stamps.** A twelve-state inspection stamp on four dials, ageing
  in border weight only, never in the word. A real identity asset (VC, BE).
- **The invoice.** Letterhead, itemised makers, a signed note, three payment
  methods each honestly priced, and one filled dark button carrying the exact
  amount (BE-26, IA, L).
- **The WallGate drawing** — a hatched elevation with a notch cut exactly
  where the signature is owed. The best-made object across all three documents
  (VC).
- **The letterhead and the doorplate**, read as a drawing-set title block.
- **TrackingRow's screen-reader contract** — one `sr-only` stage sentence,
  everything decorative hidden, no double reading, a designed placeholder for
  both a null URL and a 404 (C06).
- **Three real muted steps** (9.22 / 7.73 / 6.51 on doc-paper) and hover
  washes that shift the ground only 1.11–1.14:1, with the ratios written into
  the CSS (B09).
- **"Absence is silence."** A region with nothing to say renders nothing, and
  the doorstep withholds its sentence until every query answers.
- **The deep-link fold** — `#door`, `#wall`, `#letterbox`, `#previously` and
  per-band anchors resolved at first paint, so an emailed link lands correctly
  (IA-46).

---

## 5. What reads unfinished today

One slide. Everything below was confirmed by at least one reviewer against a
render or a file.

| # | What | ID |
|---|---|---|
| 1 | Placeholder thumbnails on 5 of 6 FF&E rows — the page's dominant left-edge texture | VC-44 |
| 2 | Empty rooms as outlined rectangles (Hall, Stair) | IA-31, IX41, VC-45 |
| 3 | The story pole is not navigable, and is hidden outright below 600px | IA-23, C03 |
| 4 | The doorstep sentence is not linked to its gate ~1,400px away | IX40, IA-22 |
| 5 | Actions hover-gated on touch — `.da-tertiary` and the roster name rest at `scaleX(0)` | IX03, IX04, B01 |
| 6 | The accept act renders at full ink while disabled | IX02 |
| 7 | The hold is never announced to pointer users | IX01 |
| 8 | Room-band footprint labels render at 3.9px on a phone | C01 |
| 9 | Stage words printed twice at 9px on the tracking row | C07 |
| 10 | Three typefaces for one payment inside 120px | VC-10 |
| 11 | "PREPARED FOR CLIENT USER" in the letterhead | BE-23, VC-62 |
| 12 | The tester-notes widget sits over the balance line at ≤600px | C02, VC-63, BE-25 |
| 13 | "TODAY 0:47" dwell timer on the mobile Desk, in the only decorative italic on the page | BE-30 |
| 14 | Three action grammars in one product | IX10 |
| 15 | An "APPROVED" chip beside a still-enabled "APPROVE" act | IX11 |
| 16 | ⌘K palette has no `aria-modal`, no listbox/option semantics, no `aria-activedescendant` | B03 |
| 17 | Truncated "Previously" rows and a clipped plan-key label | IA-29, IA-30, VC-46 |
| 18 | "Leave the house" as the only sign-out | BE-09 |
| 19 | Mat column headers printed with no rows beneath them | BE-24, VC-36 |

---

## 6. Rulings a change would touch

Rules are off for this review. Listed, not argued, for later reconciliation.

- **I107** — a resting rule on the tertiary tier; a filled terminal act.
- **D4 / R126 / `eslint.config.mjs:83-101`** — none of the three specimens use
  a shadow, but the `--elevation-sheet` token is named in the house sheet for
  the temporary-sheet case.
- **R126** — plate sizes at 96–120px; the owed figure outranking the agreed
  figure; the seven-step type scale.
- **R135** — the landmark ledger under the doorplate; "Sign out" as wording;
  the colophon as page furniture.
- **R137** — selection wording kept verbally distinct from payment wording.
- **R51** — `role="status"` stationary sentences are not toasts.
- **`DECISIONS.md:3775`** — photographs only for installed work; the label
  floor on drawn geometry.
- **`VISION.md:73`** — facets on one roster are not a dashboard.
- **`VISION.md:50`** — remove the dwell timer.
- **D1** — a skip link is not persistent nav.
