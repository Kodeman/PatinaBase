# Design brief: The House Issue (canvas + founders' plan)

Story: the homeowner page as a studio-authored, job-made website. Source of truth for the concept:
`brief/PLAN.md` (approved synthesis). Detail comes from the three designer proposals in
`inputs/designers/` (A editorial, B systems, C homeowner). Where a proposal and PLAN.md differ,
PLAN.md wins. Where this brief and PLAN.md differ, PLAN.md wins; report it rather than picking.

Frozen today: **Wednesday, 21 October 2026**. Every date on every board is written long:
`22 January 2027`, never `22/01/27` or `Jan 22`.

Nothing in this story is app code. The canvas and the doc are mockups and a plan; no migration,
flag, or deploy is touched.

---

## 1. Merge rule

1. **Structure wins from the existing authority.** The spec
   (`docs/specs/_active/client-portal-homeowner-usability.md`, CPUX-01–07, A1–A7, F1–F8),
   R139–R141, R202 and the live client CSS (`apps/client-portal/src/app/globals.css`, including the
   US-45 green tokens between the `green direction tokens` markers) decide layout furniture,
   acts, cards, anchors, and invoice grouping. The House Issue does not move any of them.
2. **The new concept wins from PLAN.md.** Plates, chapters, caption grammar, the edition record,
   re-composition, and motion come from PLAN.md's synthesis, not from any single designer report.
3. **Readability floors outrank both.** 16px body; 15px or larger for money, dates and names;
   4.5:1 for all text; 44px targets; 48px final act; 360/390 and 200% zoom without horizontal
   scroll. If any value below would break a floor, the floor wins.
4. **Strains are not resolved on the canvas.** C1–C3 and Q1–Q3 (section 6) are shown as the
   recommended option, with C1's alternative labelled, and left for the founders.

Fonts (the only network line on any board):

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Real weights only. Never ask for 700.

---

## 2. Fixtures

Verbatim from PLAN.md (US-44 brief; no real people):

> Birchwood Studio, Madison WI · Maren Holt (608) 555-0148 · June & Arlo Brennan ("Prepared for
> June Brennan") · Elm Street House (Procurement; next Living room installation; target
> 22 January 2027) · Lake Cottage · six invoices $1,375.00 (INV-2026-014 $600 past due 25 Sep;
> -019 $100 due today; -017 $300 of $800 due 2 Nov; -022 $250 due 14 Nov; -023 $50 due 30 Nov;
> -024 $75) · "Living room sofa, edition 2" $7,480.00 (oatmeal performance linen replaces wool
> bouclé; arm 26→24 in; +2 weeks; nine weeks from fabric order) · walnut sideboard "In
> production" at a fictional maker (Harmon Bench Works, Dayton OH — reuse from the Single Pane
> fixture) · Maren's update 16 October 2026.

The maker is fictional: **Harmon Bench Works, Dayton OH**. On boards, write dates long
("25 September 2026"), so the fixture's short forms above expand when set.

Fixture strings the boards reuse:

| Where | String |
|---|---|
| Purpose sentence | Pay invoices, review approvals, and follow your project here. |
| Link row (F3 order) | Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt |
| Standing line | Six invoices are open; $600.00 is past due. One edition awaits your approval. |
| Standing sentence (road) | Now: Procurement. Next: Living room installation. Target 22 January 2027. |
| Colophon | Prepared by Birchwood Studio · Sent through Patina |
| Maren's re-composition notice | The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was. |
| Press band (designer) | A new edition is ready |
| Earlier ledger line | Edition 4 · approved by Maren · 21 October |

---

## 3. Palette and type tokens

### 3.1 Colour (light; the homeowner page is light-only)

| Token | Hex | Use |
|---|---|---|
| paper | `#FAF7F2` | page ground |
| stock | `#FCFAF6` | opened region, field ground |
| hairline | `#E8E3DB` | structure rules, plate frame |
| ink | `#2C2926` | body, money, dates, names |
| oak ink | `#4E4339` | captions, secondary prose, purpose sentence |
| subtle | `#5A4E43` | eyebrows, meta |
| forest | `#3E5145` | final act fill only (carries an amount) |
| forest press | `#2F3E35` | final act pressed |
| card | `#FFFDF9` with 1px `#C9C7BD`, 8px radius | framed cards (R202) |
| note | `#F0F3ED` | consequence note above an act |
| record | `#E8EEE7` / rule `#B6C3B7` | approved record block |

Text on paper: ink 13.53:1, oak ink 8.99:1, subtle 7.54:1. Paper on forest is 7.96:1. No red,
no green other than forest, no gradients, no translucency.

The job palette (from `project_palettes`) is never page colour. It tints only the 4px rule under a
plate or the plate's 1px border. If a palette tone is ever a background, ink is chosen from paper
or charcoal by computed contrast ≥4.5:1, falling back to the plain card.

The founders' plan page (`doc/index.html`) also defines warm dark equivalents (ground `#1E1C19`,
stock `#262320`, ink `#F3EDE4`, hairline `#3A3631`, forest `#8FA797`) for its own viewers; the
canvas boards stay light.

### 3.2 Type

| Role | Face | Size / line | Notes |
|---|---|---|---|
| Display (issue headline) | Playfair Display 400 | `clamp(34px, 5.2vw, 72px)` / 1.0, −0.01em | never below 1.0 line-height (Playfair clips) |
| Chapter head | Playfair Display 400 | `clamp(28px, 3.2vw, 44px)` / 1.08 | studio-voice headline, italic allowed |
| Eyebrow | DM Mono 500 | 12px / 16px, 0.08em, UPPER | bare numeral: `05 · LIVING ROOM` |
| Caption | DM Mono 400 | 12px / 1.5, oak ink | what · whose · when; 13px at 200% zoom-safe |
| Body | Inter 400 | 16px / 1.55 | `.t-body` |
| Money, dates, names | DM Mono or Inter | ≥15px, tabular | `.t-money` |
| Letter lead | Playfair Display italic 400 | 20px / 1.3 | Maren's note |

---

## 4. The six plates and caption grammar

All plates: `figure` + `img alt` + `figcaption`; 1px hairline `#E8E3DB`; caption DM Mono 12px
`#4E4339`, stored as three fields; caption ink never on the photograph.

1. **Hero plate.** One per page. 16:10 (4:3 at ≤600px). Fills the measure, never the viewport.
   Focal point stored as `object-position`. Eligible: installed photo, scan above the quality
   threshold, studio board cover, maker photo of the lead piece. Never a concept render.
2. **Room plate.** 3:2 at the top of each room band. A concept render is allowed with the
   "Concept · not installed" chip at ≥14px on a `#FFFDF9` chip. Replaced by the first installed
   photo of that room.
3. **Pair plate.** 7:5 photo + swatch strip. Only in `#approvals` and scope-change asks.
4. **Piece plate.** 1:1, 165px (390) / 282px (1440). A retailer photo on white uses
   `object-fit: contain` with a 10% inset so the white reads as a pasted clipping on stock.
   `multiply` over a tint is rejected (it darkens the product).
5. **Swatch strip.** 40×40 swatches from `project_palettes` with brand + name. The one place
   palette is colour, because it is a record of real paint.
6. **Silhouette plate.** The existing drawn footprint. Also the load-failure fallback: the
   figcaption stays and gains "· picture did not load".

Caption grammar: `what · whose · when`, sentence case, three segments, no adjectives of praise.
Code fills the segments from record fields; nothing invents one. A plate with an unfillable
segment is not shown; the silhouette is.

| Kind | Example caption |
|---|---|
| Installed | Reading chair, installed in the living room · photographed by Birchwood Studio · 3 September 2026 |
| Workshop | Walnut sideboard, in the workshop · photographed by Harmon Bench Works · 15 October 2026 |
| Maker catalogue | The same model, from Harmon Bench Works' catalogue · not her piece · hers is in production. |
| Board or scan | Living room, scan drawing · by Birchwood Studio · 2 June 2026 |
| Concept | Concept render of the living room · by Birchwood Studio · 12 May 2026 · not installed |
| Silhouette | Walnut sideboard · drawing · photograph to follow |

Never "your sideboard" under a catalogue photo; say "this model" or "the same model".

Alt = the first two caption segments + the source kind, e.g.
`alt="Walnut sideboard in the workshop, photograph from Harmon Bench Works"`. Never "image of".
Decorative duplicates get `alt=""`.

Fallback ladder: hero → studio board cover → hero slot omitted (chapter 01 opens on the headline
with a swatch strip beneath). A zero-photo job is a complete page: palette strip + silhouettes.
Never a gradient, stock image, or render at hero scale.

Paper grain, if drawn, is CSS `feTurbulence` at 3% on the page, never on images.

---

## 5. Arrival composition and chapter table

### 5.1 Arrival (390px, first 740px)

| y | Element |
|---|---|
| 0–96 | Letterhead: Birchwood Studio · Elm Street House · Prepared for June Brennan (not fixed) |
| 96–132 | Purpose sentence 16px: "Pay invoices, review approvals, and follow your project here." |
| 132–196 | Link row, two lines, 44px targets (F3 order) |
| 196–244 | Standing line 16px: "Six invoices are open; $600.00 is past due. One edition awaits your approval." (each clause links to its anchor) |
| 244–520 | **Hero plate** 16:10, card-wide (358×224), eyebrow `01 · ELM STREET HOUSE · PROCUREMENT`, display headline *The living room is on its way*, caption below |
| 520–740 | `#doorstep` begins: first invoice card, consequence note, forest Pay act |

At 1440 the hero fills the 1248 measure (never the viewport, ≤72vh); the display headline
overlaps the plate's bottom edge by one line. The hero never sits above the standing line.

### 5.2 Chapters (anchors preserved; bare numerals)

| # | Anchor | Eyebrow | Headline (studio voice) | Plate |
|---|---|---|---|---|
| 01 | new, above `#doorstep` | 01 · ELM STREET HOUSE · PROCUREMENT | *The living room is on its way* | Hero plate: walnut sideboard · photographed at Harmon Bench Works, Dayton · 9 October 2026 |
| 02 | `#doorstep` `#ledger` `#letterbox` | 02 · WHAT IS OWING | *Six invoices, $1,375.00 together* | none; the ledger is the image |
| 03 | `#approvals` | 03 · WAITING ON YOU | *The sofa, second edition* | Pair plate: maker photo 7:5 + swatch strip (oatmeal performance linen · maker's sample · 14 October 2026); consequence note; forest 48px act $7,480.00 |
| 04 | `#key` | 04 · THE HOUSE | *Three rooms, read from the front door* | existing SVG plan; room names link to bands |
| 05+ | RoomBand ids | 05 · LIVING ROOM | *Walnut, linen, and a lot of light* (material words from that room's items only) | Room plate 3:2, then piece plates 1:1 in a 2/4-col run, silhouettes where no photo |
| 08 | `#road` | 08 · WHERE THINGS STAND | *In production, then on the truck, then here* | Now / Next / Target in words; piece plate 96px beside the sideboard row |
| 09 | `#note` | 09 · FROM MAREN | *A note from the studio, 16 October* | letter, Playfair italic lead, reply |
| 10 | `#previously` `#changed` | 10 · EARLIER | *What has already been settled* | text ledger; "Edition 4 · approved by Maren · 21 October" lines |
| 11 | `#mat` | 11 · PEOPLE AND PAPERS | *Who to call, and the documents* | portrait only if the studio uploaded one; then colophon |

Rhythm rule: plate → fact → pair → drawing → plate-and-run → words. Never two pictures in a row.

Motion (Motion-Storyboard board): image settle on load (scale 1.015→1 + opacity, 400ms, caption
+120ms); chapter head reveal on mount only (opacity + 12px rise, 360ms, max three staggered);
hold stays 900ms; reduced motion: transforms off, opacity 150ms linear.

---

## 6. Rulings sought

The canvas shows the recommended option. It does not settle any of these.

| Id | Question | Recommendation (PLAN.md) |
|---|---|---|
| C1 | Shadows: A3/F4 allow, VISION §6/V9/V20 forbid | None; hairline + stock-on-paper step is the only depth; amend A3/F4. Show one labelled shadow alternative only where a board compares. |
| C2 | Full-measure photography vs house sheet §A10's 120px cap | Adopt the proposed ruling text below. |
| C3 | Delta-only auto-approve vs V22 | Allowed only when no prose call ran (plates changed, words unchanged), per project opt-in; otherwise V22 holds. |
| Q1 | Imagery above the first money/approval act | No, at every viewport. |
| Q2 | Maker names/provenance on the homeowner page | One provenance line (maker · town · in production since · photographed when) behind a per-project `show_makers` switch; no brand stories. |
| Q3 | Scroll-triggered reveals vs on-mount only | On-mount only; no scroll reveals, parallax, pinned sections, carousels, preloader. |

C2 proposed ruling, verbatim:

> "Photography on the homeowner page may fill the page measure (edge to edge at 390, the 1248
> measure at 1440) but never the viewport; the letterhead, purpose sentence, link row and standing
> line always sit above the first image; no image exceeds 72% of viewport height; one plate per
> page at this scale; eligible only installed photographs, studio boards, room scans, and makers'
> photographs of the specified piece; concept renders stay at room-plate size with the mark; the
> 120px cap continues to govern designer and admin surfaces."

---

## 7. Board list

Eleven boards, from PLAN.md. Frame sizes come from designer A where it gave one; otherwise the
frame width is the viewport the board shows and the height follows the content.

| # | Board | Frame | Shows |
|---|---|---|---|
| 1 | Issue-Cover-1440 | 1440 wide | letterhead, link row, standing line, hero plate, display headline overlap |
| 2 | Issue-Cover-390 | 390 wide, first 740 marked | the arrival table above, 44px targets marked, first act inside 740px |
| 3 | Plate-Grammar | 1600×1000 | six plate types with caption rules, hairline, inset, palette rule |
| 4 | Clipping-Study | 1200×800 | one white-ground retailer photo in four treatments (raw / inset+hairline / multiply rejected / silhouette) |
| 5 | Approval-Pair | 1440 and 390 frames side by side | chapter 03: pair plate, consequence note, forest act $7,480.00 |
| 6 | Living-Room-Band-1440 | 1440 wide | room plate with concept chip, piece-plate run, one lifted TrackingRow |
| 7 | Phase-Strip | 2400×700 | the cover at Design / Procurement / Installation / Closed in a row |
| 8 | Press-Band-Designer | 1440 wide (designer portal) | the edition draft in the designer's Document: preview in the client mirror, Approve / Hold / Edit, delta-only diff line |
| 9 | Type-and-Rhythm | 1200×1600 | display, chapter head, eyebrow, caption, body at size; 200% zoom column |
| 10 | Motion-Storyboard | 1600×600 | settle / reveal / hold frames at 0/120/360/400ms; reduced-motion row |
| 11 | Empty-Issue-390 | 390 wide | zero-image job: palette strip + silhouettes |

Photography on the boards: rights-free placeholder photographs (walnut furniture, linen,
workshop) from the artifact asset store. Real editions use only job-owned images.

---

## 8. Hard don'ts for the canvas

- No "AI", no "Claude", no model name on any board, including the Press band and the designer
  surfaces (V23 R3). The band says "A new edition is ready", never why.
- No denominators: chapter numerals are bare (`05`), never a numeral over a total.
- No percent complete, no progress bars.
- No badges, no counts, no streaks, no unread dots.
- Every placeholder photo caption ends `· placeholder, not job imagery`.
- No shadows, except the one labelled C1 alternative.
- No red anywhere; status in words.
- No carousels, no auto-advance, no parallax, no scroll-triggered reveals, no preloader, no video.
- Every target ≥44px; the final act 48px.
- Money, dates and names ≥15px.
- No generated rooms, no stock imagery, no concept render at hero scale.
- No fixed header, tabs, or bottom bar on the homeowner page; the link row is page furniture.
- No Patina wordmark above the colophon.
- No banned lexicon (patina-brand-voice skill), no exclamation points, no emoji, no
  testimonials, guarantees, or sales calls to action.
- No maker brand story on the homeowner page; one provenance line at most.

---

## 9. Done oracle

From `artifacts/client-house-issue-2026-10-21/`:

```bash
node tools/check-canvas.mjs   # canvas boards: dead anchors, aria, caption contrast, 44px, 390 overflow,
                              # figure/figcaption with three "·" segments, banned strings
node tools/check-doc.mjs      # founders' plan page: title, banned lexicon, exclamation points,
                              # stray "AI", emoji, dark theme present, no numeral-over-total index
```

Both must exit 0 and print their `ok` line. The diff stays inside
`artifacts/client-house-issue-2026-10-21/`.
