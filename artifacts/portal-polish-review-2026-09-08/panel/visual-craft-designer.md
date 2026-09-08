# Panel review — visual craft

**Method:** proposal CSS read from `index.html` and inventoried by script; the two
embedded fonts inspected with fontTools; all 1440 renders plus 390 for slides
1/5/6/7/8/11; all current shots. Findings written before §7–8; `known`/`touches`
marks added after. Unmarked findings are **new**.

**Headline judgment.** The proposal is a handsome deck arguing for a system it does
not itself keep: it publishes a 9-token palette and uses 55 hex literals, states a
six-step type scale and ships 25 sizes, states "6px radius" and ships twelve, and
argues materials need room to speak while rendering oak as a CSS stripe gradient.
The current portals are narrower, harder and more disciplined, with three real
defects — dead placeholder imagery, metadata below a homeowner's legibility floor,
and empty rooms drawn as empty rectangles. The proposal diagnoses those three
correctly and proposes worse replacements for them.

---

## Findings — `ID | sev | conf | surface | claim | evidence | change`

### Type

VC-01 | P1 | high | proposal | 25 font-sizes ship (10–48px + 2 clamps) against a stated 40/32/24/16/14/12 | CSS inventory | Collapse to seven steps.
VC-02 | P1 | high | proposal | Headings render ~72/48/26 at 1440; slide 5 prints "40/32/24" under its own 48px h2 | slide-05-1440; `h1 clamp(44,5vw,78)` | Set clamps to the published numbers.
VC-03 | P2 | high | proposal | Body is 15px, not 16px; only `.phone-content p` was patched, after the media queries | `body{font:15px/1.55}` | Set 16/1.55.
VC-04 | P1 | high | proposal | Nine Playfair sizes serve one rank (23,24,25×3,26,27×2,29,30); slide 11 shows 26 and 23 side by side at equal rank | slide-11-1440 | One h3 = 26px.
VC-05 | P1 | high | proposal | Both fonts are variable (wght 100–900 / 400–900) but `@font-face` has no `font-weight` descriptor, so every 600/700 — pills, buttons, totals — is faux bold | fontTools `fvar`; CSS | Add `font-weight:100 900` + `format('woff2')`.
VC-06 | P1 | high | proposal | DM Mono is deleted silently — zero declarations, zero specimens — while slide 5 says "use mono only for identifiers" | `grep -c 'dm mono'` = 0 | Load it; keep it for dates, identifiers, money, counts.
VC-07 | P2 | high | proposal | Zero italics anywhere; the current system's warmest device has no counterpart | no `font-style:italic` | Reserve Playfair italic for authorship and asides.
VC-08 | P2 | high | proposal | `h1` tracking −2.5px is −5.7% at the 44px floor; `h2` −4% at 32px — Playfair's serifs collide | CSS; slide-06-390 | Track optically by size.
VC-09 | P2 | med | proposal | `p{max-width:75ch}` ≈ 90 characters; audit-table cells uncapped at ~100 | CSS; slide-03-1440 | 65ch prose, 55ch cells.
VC-10 | P1 | high | current | The invoice sets one payment in three families inside 120px: `$9,125.00` mono, `$9,130.00` Playfair, `Pay $9,130.00` Inter | invoice-open-desktop | One family for money.
VC-11 | P2 | high | current | Client-portal mono runs 9px and 11px uppercase at 0.16–0.2em — below a homeowner's comfortable floor | tracking-row.tsx:187,210; story-pole.tsx:148 | Floor at 11.5px/0.08em client-side.
VC-12 | P3 | high | current | The persistent bar prints the designer's name twice, Inter over mono caps, beside an "LH" avatar | desk-final-desk-1440; ffe-1440 | Keep the mono line only.

### Colour

VC-13 | P1 | high | proposal | 55 hex literals in a 9-token stylesheet; ~40 appear once and are named nowhere (`#9b865f`, `#79603a`, `#8b8175`, `#b6aea2`, `#e8e2d6`, `#ece7df`, `#566345`, `#293e29`, `#464638`, `#555`…) | hex inventory | Name every colour or delete it.
VC-14 | P1 | high | proposal | Failure and material share a hue: warning bar and `aria-invalid` border are `#79603a`, same family as ochre `#A47836` | slide-11, slide-12 | Refusal = darker ink under a hairline. `touches: DECISIONS.md:10717`
VC-15 | P2 | high | proposal | Three olives circulate (`#394B38`, `#293E29`, `#566345`); the cover's material dot is in neither the tokens nor the action colour | CSS; slide-01-1440 | One olive, one derived hover.
VC-16 | P2 | high | proposal | Paper `#FAF7F2` and Surface `#FFFDFA` differ ~ΔE 2; the Paper swatch is invisible on slide 5. Replacing `--doc-paper #FCFAF6` moves ~1.5/channel | slide-05-1440/390 | Keep `#FCFAF6`.
VC-17 | P2 | high | proposal | The Desk board carries a saturated teal pendant photo — the loudest colour in the deck — under three cream/ochre/olive dots captioned "3 materials" | slide-08-1440/390 | Re-shoot from the stated palette.
VC-18 | P2 | med | proposal | Sage `#E6EADF` is the most-used new surface (pills, receipt, note, check-round) but is absent from the swatch row and unlabelled "new" | slide-05-1440 | Show, label and scope it.
VC-19 | P2 | high | current | Desk stage plates run slate-blue then two near-identical greens — none of the four named pigments; two adjacent stages in one green loses wayfinding at 43 jobs | desk-final-desk-1440; §5 | One-hue value ramp across seven stages. `touches: R126`
VC-20 | P3 | med | current | The no-image thumbnail is one diagonal in a hairline square — a drafting mark for "void", not "no photograph" | ffe-1440 | Reserve the diagonal for voided lines.

### Space & rhythm

VC-21 | P2 | high | proposal | Twelve radii ship (3,4,5,6,7,8,10,12,20,35,50%,`110px 8px 8px 8px`) against a stated 6px; slide 6 stacks six | CSS; slide-06-1440 | Three radii: 4 / 8 / 50%.
VC-22 | P2 | high | proposal | The button state board sits at three heights because the focus specimen's outline enlarges its box | slide-10-1440 | Reserve the outline's space in default.
VC-23 | P2 | high | proposal | Slide 11's two columns end ~90px apart, bottom-ragged | slide-11-1440 | Stretch or rebalance.
VC-24 | P2 | high | proposal | Slides 10 and 12 leave 250–450px of dead frame; slide 10's three card rules are prose with no specimen on a component-system slide | slide-10/12-1440 | Draw the three cards.
VC-25 | P1 | high | proposal @390 | "Every job · 3 shown in this prototype" orphans "prototype"; "Compact rows" wraps with its underline broken across two lines | slide-08-390 | `nowrap` the control; move the count.
VC-26 | P2 | high | proposal @390 | `.app-meta` orphans "data"/"activity" on a right-aligned second line; the landmarks row wraps so the caption reads as a fourth landmark | slide-06-390, slide-08-390 | Stack the meta bar; caption below the rule.
VC-27 | P2 | high | proposal @390 | "Your home, taking / shape." orphans the second word of the page's most important line | slide-06-390 | Balance the head.
VC-28 | P2 | high | proposal @390 | Stacked on the cover, the primary and text button have mismatched left edges (`.text-btn{padding-inline:5px}`) | slide-01-390 | Negative-margin to the optical edge.
VC-29 | P2 | med | proposal | Slide 12's phone captions sit on different baselines (unequal phone heights under `align-items:start`) | slide-12-1440 | Bottom-align captions.
VC-30 | P2 | high | current | The Desk MarginNote's × floats aligned to nothing at 1440 and collides with the running italic at 390 | desk-final-desk-1440/390 | Hang it in the true margin on line 1's baseline.
VC-31 | P2 | high | current | Each roster row leaves ~390px of empty gutter before its action, and "OPEN THE JOB" repeats 16 times (43 at real load) | desk-final-desk-1440 | Top-5 #4.
VC-32 | P2 | med | current | Desk header intervals run 24/55/20/45/65px with no module | desk-final-desk-1440 | Snap to 24px via `--space-*`.
VC-33 | P2 | med | current | Rows without a mark dot leave an empty notch in the left margin, reading as a missing element | desk-final-desk-1440 (Consultation row) | Hairline open ring at equal weight.
VC-34 | P2 | high | current | Threshold band intervals vary 20–90px | client-local-dev-desktop | One band interval, one sub-interval.
VC-35 | P2 | high | current | The FF&E status-tag column's left edge is ragged ~55px, and "—" on unspecified rows misses the money rule | ffe-1440 | Fixed tag column; tabular figures to one rule.
VC-36 | P2 | med | current | The empty house's four Mat headers sit at two y positions; only two carry a rule | client-local-dev-multi | One header row, one rule.
VC-37 | P3 | high | current | Two rules of different lengths sit ~10px apart under the doorstep block | client-local-dev-multi | One rule.

### Imagery

VC-38 | P1 | high | proposal | The material sheets are `repeating-linear-gradient` stripes at 95px and read as corrugated card; the slide arguing "give the materials room to speak" contains no material | slide-09-1440 | Photograph two real samples at ≥600px under one lamp.
VC-39 | P1 | high | proposal | The one enlarged product preview, "Solid oak table," is a photo of a green-velvet dining room | slide-09-1440 | Show the piece.
VC-40 | P1 | high | proposal | "Your home, taking shape." at 40px sits above a generated room that is not the client's home; the correction is 12px muted, ~440px below | slide-06-1440 | Never caption a concept as "your home"; label ≥14px on the image. `touches: DECISIONS.md:3775`
VC-41 | P1 | high | proposal | The proposed roster's thumbnails are 50×43px — smaller and non-square than the 64×64 it criticises — and hidden below 700px | `.job img`; slide-08-390 | Commit to 64×64 square or drop it.
VC-42 | P2 | high | proposal | One generated room carries the cover, slides 6/7/8/11 and both phones — six appearances | slide-01/06/07/08/11/12 | Three rooms, or none.
VC-43 | P2 | med | proposal | The photo does not change when the finish changes, so the decision's subject is decorative | slide-07-1440 vs -state-smoked | Lead with the plan; finish beside it.
VC-44 | P1 | high | current | Five of six FF&E thumbnails are the no-image placeholder; that column is the page's dominant left-edge texture | ffe-1440 | Top-5 #2.
VC-45 | P2 | high | current | Hall and Stair render as outlined ~370×25px rectangles holding only a tiny room name — two anonymous empty boxes; the proposal is right here | client-local-dev-desktop | Top-5 #3.
VC-46 | P2 | high | current | The plan key's only annotation truncates ("Built-in shelving, no…") and two "Previously" entries truncate mid-phrase | client-local-dev-desktop | Wrap, never truncate, in the drawing and the record.
VC-47 | P2 | high | proposal | The phone status bar is "9:41" plus two dots and a dash standing in for signal/wifi/battery | slide-12-1440 | Draw real glyphs or remove it.

### Elevation & surface

VC-48 | P1 | high | proposal | Record (flat + border) and Object (`--lift`, 8px at ~6%) are indistinguishable at render, and Sheet's `--overlay` reads as a halo — the case for amending the shadow ban fails on its own specimen board | slide-10-1440 | One 1px key + one 2px ambient, proved at 100%. `touches: D4, R126, eslint.config.mjs:83-101`
VC-49 | P2 | high | proposal | Four near-identical off-whites nest on slide 9 (`#FFF` in `#FAF7F2` in `#FFFDFA` in `#FAF7F2`), separated only by hairlines | slide-09-1440 | Two stocks per composition.
VC-50 | P2 | high | proposal | Pure `#FFF` appears twice (`.before-frame`, `.material-sheet`) in a warm system with no white token | CSS | Use `--sheet`.
VC-51 | P2 | high | proposal | `.app-meta` is a grey `#ece7df` 11px bar atop every mockup, reading as fake browser chrome — the deck's most mockup-like element | slide-06/07/08/09-1440 | Move the "fictional data" label outside the frame.
VC-52 | P3 | med | proposal | A 24px-blur lift around a 1650px frame reads as a halo, not a lift | slide-06-1440 | Scale blur to the object.

### Details

VC-53 | P2 | high | proposal | The selected chip's `outline:2px olive` is the same colour and shape family as the focus ring (3px olive) — selected and focused are indistinguishable | slide-07-1440/390 | Selection = sage fill + check; focus = outline only.
VC-54 | P2 | high | proposal | "Ready for your hand" gives three rows three action treatments with no rule, right edges ragged ~13px — on a deck whose slide 10 is "Actions have visible roles" | slide-08-1440 | One treatment per rank; one right rule.
VC-55 | P2 | high | proposal | The retry control in the failure panel is a text link — the least visible control where a bounded action is most warranted | slide-11-1440 | Outlined secondary.
VC-56 | P2 | med | proposal | "✓Selected finish" has no space between glyph and word; the check-round's ✓ sits optically high-left in its circle | slide-10-1440, slide-11-390 | Add a gap; nudge the glyph.
VC-57 | P2 | med | proposal | The loading spinner is a `#fff7` ring on the grey disabled fill, nearly invisible | slide-10-1440 | `currentColor`.
VC-58 | P2 | high | proposal | The empty-state specimen is a flat `--rail` rectangle under its own caption "Avoid an anonymous empty rectangle"; and the deck's largest type gesture is labelled "replace with a genuine project update" | slide-11-1440 | Draw what's described; never set a placeholder larger than real content.
VC-59 | P2 | med | proposal | One pill carries two unrelated meanings — "Ready to review" (a client's ask) and "Draft selection" (a document state) | slide-06, slide-09 | Ask = filled; state = hairline outline.
VC-60 | P3 | med | proposal | A second PATINA wordmark prints inside the mocked frame, and "Existing destinations retained" sits inline with the footer nav as a fifth link | slide-08-1440/390 | Remove the inner mark; caption below the rule.
VC-61 | P2 | high | current | On the Mat, two acts and one header are identical mono caps; only one is underlined, so the page's most important control looks like a label | client-local-dev-multi | Score every act; never score a header. `touches: R135, I107`
VC-62 | P2 | high | current | The empty-house doorplate prints "PREPARED FOR CLIENT USER" where the homeowner's name belongs | client-local-dev-multi | Fall back to the household name. *unverified whether prod-reachable*
VC-63 | P1 | high | current | The dark "N" tester-notes widget overlaps the letterbox at ≤600px and floats unanchored at 1440 | client-local-dev-phone/desktop | Anchor to safe area; never over the letterbox. **known** (§8.3)
VC-64 | P2 | med | current | The in-hand timer "0:47" prints twice on the FF&E screen, in two treatments, ~1100px apart | ffe-1440 | One instance.
VC-65 | P3 | med | current | The invoice prints the due date twice, once with the year and once without | invoice-open-desktop | One format.
VC-66 | P3 | low | current | The Playfair superior `$` in "Total to pay" clips against the digits' cap height | invoice-open-desktop | Set money in mono (VC-10).
VC-67 | P3 | med | current | "FINISH SETTING UP" is an action set as mono metadata with no rule, while every other Desk action carries one | desk-final-desk-1440 | Score it. `touches: I107`
VC-68 | P2 | med | current | The Desk at 390 carries a dark tab bar with an unexplained running number in persistent chrome | desk-final-desk-390 | Label it or remove it. `touches: VISION.md:73, V7`
VC-69 | P2 | high | both | The deck's claim that primary actions are text-only overstates the current state: FF&E already ships one filled dark primary beside scored ink, and it works | ffe-1440 vs slide 3 | Extend the existing pattern. `touches: I107`

---

## What the proposal gets right

- **The money table on slide 7 is the best-composed object in the deck** — Piece /
  Delivery / Tax / Selection total / Allowance / Below allowance, 14px on hairlines,
  total bolded, allowance stated as fact, surviving 390 unchanged. Better than the
  Threshold's current one-sentence money line.
- **The disclosure copy is genuinely responsible** and repeated at every interactive
  point: "Reviewing does not approve or place an order," "It does not charge you,"
  "Sample display is not color-accurate."
- **"Nothing needs you today."** — a correct, un-illustrated empty state with an
  explicit note against invented urgency.
- **The diagnosis is right three times:** the FF&E's placeholder thumbnails, the
  Threshold's empty room rectangles, and the missing bounded primary action at the
  client's decision moment.
- **The Concept/Plan lens** is honestly labelled and is the one place the deck's
  geometry is optically correct (7px outer, 3px pad, 4px inner).
- **The accessibility retain-list** — focus return, reading order, labelled inputs,
  reduced motion preserving state changes — is specific and right.
- **The cover** is a well-made editorial page and would sell the work.

## What's already excellent in the current portals

- **The scored-ink action grammar** — three ranks by rule-count and pigment rather
  than three box styles. Nothing in the proposal is this well-drawn. Protect it.
- **"Good morning, *Leah*"** over a DM Mono caps date slug: authorship, warmth and
  precision in two lines, with no photograph and no avatar.
- **"EVERY JOB · 16 LIVE · 1 OVERDUE"** then "One thing is overdue — Vandersteen."
  A count, then the name. The proposal's "3 shown in this prototype" loses both.
- **The FF&E stamps** — ORDERED clay, DAMAGED terracotta, DECISION DUE golden hour,
  each a rotated hairline box with a matching row wash. A badge system executed as a
  rubber stamp; more expensive-looking than sage pills, and meaning lives in the
  border pigment as well as the word.
- **The invoice's money typesetting** — mono tabular figures to one rule, per-method
  fees on the row, the charged amount in the button label.
- **The WallGate** — a hatched elevation with a notch cut exactly where the
  signature is owed. The best-made object across all three documents.
- **"Nothing waits for your name." / "Nothing in the letterbox."** Absence drawn as
  absence, never as a card. Better than slide 11's grey rectangle.
- **The doorplate as a drawing-set title block.** It says a firm made this.

## Top 5 changes for polish & professionalism

**1 — One seven-step scale across both portals; keep three voices.** Both
`globals.css` plus `doc-type-body`/`type-body-small`. Display 34 / 26 / 20 Playfair
(500, tracking 0 below 40px); body 16/1.55 and 14/1.5 Inter; metadata 12/1.5 and
11/1.5 DM Mono at 0.08em, down from 0.1–0.2em. Retire every one-off literal
(`tracking-row.tsx:187,210`, `doorstep.tsx:104,127,135`, `desk-roster.tsx:110,224`).
Playfair italic reserved for authorship and asides. States unchanged. Why: the
homeowner can read her own money and dates, and the studio surface stops looking
like six systems photocopied together. The proposal's scale would be a downgrade —
it has 25 sizes. `touches: CLAUDE.md:23`

**2 — Retire the placeholder square; draw the piece.** `tracking-row.tsx:109-117`
and the FF&E row thumbnail. A 64×64 (client) / 72×72 (designer) square on
`--doc-paper #FCFAF6`, 1px `#D9D1C6` hairline, `rounded-[3px]`, holding a generated
line elevation of the piece's silhouette by category — the device RoomBand already
uses for rooms, at thumbnail scale. States: photo → `object-fit:cover`; null →
silhouette plus the maker's name in 11px mono; failed load → same as null, never the
browser glyph; unspecified → empty hairline square, no diagonal. Why: five of six
FF&E rows are currently a half-X, which reads as "cancelled." A drawn silhouette is
honest, needs no photography, and is unmistakably Patina rather than a stock crop —
it answers the proposal's best criticism without importing a photograph.
`touches: R126`

**3 — Make an empty room look drawn, not empty.** `room-band.tsx`. With zero pieces,
still draw the floor line at full band width and one wall line in
`--doc-rail-stock #E8E3DB` at 1px; room name Playfair 20px left, measured width
DM Mono 11px right, one sentence in body ink under the hairline — "Nothing stands
here yet — the Study comes first." States: no pieces → as above; in transit → dashed
footprints (already built); no geometry → the sentence alone, no rectangle. Why:
Hall and Stair currently render as two labelled empty boxes, the one place the
Threshold looks unfinished to a paying homeowner.
`touches: DECISIONS.md:3775, R135`

**4 — Bridge the roster gutter; stop repeating the verb.** `desk-roster.tsx` JobLine
(`:85-155`) and the FF&E row. A dotted leader in `--text-faint #65594E` at 30%
opacity from the state sentence to a right-aligned action; "OPEN THE JOB" → "OPEN"
in DM Mono 11px keeping its single score; action column fixed at 96px so its left
edge runs straight; dot-less rows get a 7px hairline open ring (1px `#65594E`) so
the mark column never gaps; row height fixed at 44px. States: hover → existing
RowWash unchanged; overdue → terracotta line stays; tested at 16 and 43 rows. Why:
~390px of nothing currently sits between "Sarah Chen · new lead" and its action, and
three identical words print 43 times. The leader is already the Document's own
device on the FF&E — this makes the Desk consistent rather than importing
thumbnails. `touches: I107`

**5 — One voice for money; the number carries the largest type.** The invoice
surface, the Threshold doorstep money line, and the FF&E margin panel. Every amount
in DM Mono with `font-variant-numeric: tabular-nums`, right-aligned to one rule;
amount due at 30px with its label in 11px mono caps *above* it, not floating beside
it; the button label carrying the same figure in the same family; delete the
Playfair "Total to pay" figure and its clipped superior `$`. On the Threshold,
promote "Owed on the open invoice — $4,060 · due 11 September" to 20px body ink
under a hairline, ahead of the letterbox drawing. States: paid → figure struck with
the payment date beneath; partial → received and balance on two rows, balance
bolder; overdue → date in terracotta ink, no red, no badge. Why: three typefaces for
one payment is the current system's largest professionalism defect, and the
homeowner's money currently sits smaller than the room labels above it.
`touches: DECISIONS.md:10717`
