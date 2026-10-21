# Design brief: The House Issue (canvas + founders' plan), v2

v2 (SQ-1570): the canvas is image-led on the strongest job imagery. Sections 1–3.1 carry over
from v1; sections 3.2–9 record the v2 contract, coordinator ruling B on the 390 arrival, and
rulings V2-1 to V2-9. SQ-1573 applies the SQ-1572 review: Main split into Main-A and Main-B,
the desktop standing rows inside 880, the plate order of PLAN.md §3, and captions with a second line.

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
| Paint brands (fictional; no real brand names on any board) | Halvorsen and Larkin Prairie, both invented Midwest paint makers |
| Elm Street House living room paint | Halvorsen, Morning Oat · Larkin Prairie, Pale Birch · Halvorsen, Kettle Clay · Halvorsen, Bur Oak Green |
| Oak Hollow Cottage kitchen paint (Empty-Issue board) | Halvorsen, Quarry Chalk · Larkin Prairie, Sandbar · Halvorsen, Fence Post · Halvorsen, Spruce Smoke |
| Sofa pair plate sample | Oatmeal performance linen · maker's sample · 14 October 2026 |
| Hero caption (v2, ruling B) | Walnut top, planed · Harmon Bench Works · 15 October 2026 |

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
| forest | `#3E5145` | fill on final acts carrying an amount and on selected approval choices (A1); ink for links, focus and selected states (A2). Send change request and Confirm pause are covered by A1 |
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

### 3.2 Type (v2 scale)

| Role | Face | 1440 | 390 | Notes |
|---|---|---|---|---|
| Display (issue headline) | Playfair Display 400 | 72px / 1.0, −0.01em | 34px / 1.05 | under the photograph, never on it except on the paper tab; never below 1.0 line-height (Playfair clips) |
| Chapter head | Playfair Display 400 | 48px / 1.08 | 30px / 1.1 | studio-voice headline, italic allowed |
| Eyebrow | DM Mono 500 | 12px / 16px, 0.12em, UPPER | same | bare numeral: `05 · LIVING ROOM` |
| Lead | Inter 400 | 24px / 1.45 | 18px / 1.45 | the first paragraph after a chapter plate, 20 to 70 words |
| Caption | DM Mono 400 | 15px / 1.45, oak ink | same | V2-4: 15px, supersedes the 12px allowance |
| Body | Inter 400 | 16px / 1.55 | same | `.t-body` |
| Money, dates, names | DM Mono or Inter | ≥15px, tabular | same | `.t-money` |
| Letter lead | Playfair Display italic 400 | 20px / 1.3 | same | Maren's note |

---

## 4. Plates (nine), captions and alternative text

v2 is image-led: the strongest job image opens the issue and most chapters open on a plate (4.4). All plates: `figure` + `img alt` + `figcaption`; the img carries numeric `width` and
`height`; a 1px hairline `#E8E3DB` holds stock; the job palette tints only the 4px rule under the
frame. Plates never carry `data-dimmable`, and never two in a row.

### 4.1 The nine plates

| # | Plate | 1440 | 390 | Rule |
|---|---|---|---|---|
| 1 | Hero | 1440 × 648 bleed from a 16:10 source, capped at min(72svh, 648) | 390 × 340 (Main-A and the Plate-Grammar specimen; 360 × 314 at a 360 screen) | One per page; object-position from the stored focal point. Eligible (V2-1): installed photograph, scan above the floor, the studio board, a shared sheet or key plan, a photograph of her own piece. Never a concept render, never a catalogue photograph. Full bleed at 390 by margin-inline −16px, never 100vw. |
| 2 | Chapter plate | 1248 × 648 | 390 × 488 (4:5) | At most one per chapter; the chapter opens on it. Status in words above, caption below. |
| 3 | Held plate | none | 390 × min(780, 100svh − 72) | V2-7: phone only, one per page, held by its height; never sticky, pinned or dimmed; never in Invoices or Approvals. Source floor 780 × 1696. |
| 4 | Drawing or sheet | 772 × 648 whole on stock | 358 × 300 | Never cropped; the whole drawing links to the PDF in Documents; alt built from sheet number and title. |
| 5 | Board | 832 × 624 | 358 × 268 | The studio's board, never cropped; may be the Design-phase cover. |
| 6 | Material run | three 400 × 533 portraits | two 171 squares over one 358 × 171 band | From the room's own items only, read in the order the room is read; never follows another plate. |
| 7 | Pair | 784 × 560 + 440 × 560 inside the card | 390 × 279 bleed + 140 × 175 | Only in Approvals and scope-change asks: the piece beside the sample that changed. |
| 8 | Piece | 4 × 282 | 2 × 171 | A retailer photograph on white is contained with a tenth inset on stock; a 16px name and a status line in words under every tile. |
| 9 | Document cover | 282 × 376 | 171 wide | Chapter 11 only; the cover opens the document. |

Concept render is a state of the room plate, carried and not numbered: at most 612 wide (6
columns) at 1440, 358 inset at 390; never the cover; chip "Concept · not installed" ≥14px on opaque
`#FFFDF9`.

The swatch strip and silhouette carry over from v1. Piece tiles follow Clipping study B on the
Plate-Grammar board (multiply over a tint is refused); the silhouette is the load-failure fallback and the drawing that waits for
a photograph ("Ordered · photograph to follow").

Source floors, device pixels after the crop, never upscaled: hero desktop 1600 × 1000, hero phone
780 × 680 (the `cover_phone` crop, 39:34), chapter 1248 × 832, pair 716, piece 330, sheet 2048 wide, board 1600. A crop discards at
most half the source and keeps the whole subject. Below the floor, the image drops a plate size.

### 4.2 The paper tab (V2-2)

An opaque paper tab cut into the plate is page furniture, not a scrim; headline ink is measured on
paper. At 390 the tab is 116 tall and cut 44 into the plate (436–552 on Main-A and Empty-Issue). Code reads the
rendition's bottom-left 310 × 44 zone and picks one state per image:

| State | When | Drawn |
|---|---|---|
| notch | default | paper tab cut 44 into the plate |
| hairline | the zone is within 1.3:1 of the paper | notch plus a 1px `#C9C7BD` rule on the tab's top and right edges |
| below | the zone is busy, the focal point sits in it, or the container is under 320 (200 percent zoom) | tab moves under the plate, no overlap |

Text never sits over a photograph except on that opaque paper. At 1440 the headline sits under the
photograph, never on it.

### 4.3 Captions and alternative text

Caption grammar: `what · whose · when`, DM Mono 15px oak ink, left to the gutter, never on the
photograph. The first line is exactly three segments, in production and on the canvas, filled from
record fields; a plate with an unfillable segment is not shown, the silhouette is. Any
qualification is a separate second line (`.plate-note`, its own line at the caption size or
smaller) or the on-image concept chip, never a fourth segment. On the canvas that second line reads
`Placeholder, not job imagery` (photographs) or `Placeholder composition` (the CSS board).

The arrival boards (Main-A, Main-B, Issue-Cover-Desktop) carry no in-frame placeholder line (ruling
B): the notice sits in a canvas note beside each frame, so the captions read as they will in
production. Every other board carries the second line.

Alternative text describes what is visible; the caption carries provenance. They never repeat each
other. Never "image of"; decorative duplicates get `alt=""`. Never "your sideboard" under a
catalogue photograph; say "this design" or "the same model".

Fallback ladder for the cover: installed or workshop photograph → studio board or shared sheet or
key plan → drawn cover (Empty-Issue: the key plan at full measure; the paint strip opens the kitchen
chapter; the canvas note beside the frame says "The cover is a drawing until a photograph arrives"). Never a gradient, stock image, or render at hero scale.

### 4.4 Rhythm, words and focus

- Rhythm: most chapters open on a plate. The exceptions: 02, 07 Entry and 10 Earlier open on
  words; 08 opens on a pair; 09 on a photograph; 11 on document covers. 20 to 70 words between
  pictures; never two plates in a row.
- Word budget: the lead after a chapter plate is 20 to 70 words; the purpose sentence is one
  sentence (two lines allowed at 390); standing rows are one clause each.
- Dimming: no plate, held plate or photograph is ever dimmed, tinted or overlaid; plates never
  carry `data-dimmable` and never sit inside a padded since-yesterday unit (V2-7). The opt-in unit
  dimming of June's week stands for words (PLAN.md R-j); order and size direct attention.
- Focus: `--focus-ring` forest `#3E5145`, 2px outline, 2px offset, on every link and button;
  focus never lands on an image; a plate linked to a document is one link with the sheet title as
  its name.
- Targets 44px; the final act 48px.

---

## 5. Arrival composition and chapter table

### 5.1 Arrival at 390 (Main-A, measured at 390 × 900, Chromium, fallback fonts; ruling B)

| y | Element |
|---|---|
| 0–96 | Doorplate: Birchwood Studio · Elm Street House · Prepared for June Brennan (not fixed) |
| 96–140 | Purpose sentence 16px, two lines: "Pay invoices, review approvals, and follow your project here." |
| 140–480 | Hero 390 × 340, full bleed |
| 436–552 | Paper tab, 116 tall, cut 44 into the plate; eyebrow and the 34px headline sit on it |
| 560–604 | Hero caption, two lines at 15px: "Walnut top, planed · Harmon Bench Works · 15 October 2026" |
| 613 | Standing row 1 (money; links to Pay) |
| 657 | Standing row 2 (approvals) |
| 701 | Standing row 3 (invoices); the link row follows the standing rows (V2-3) |
| 664 | The Safari-with-toolbars first-screen line, marked on the board |

Q1 gate: standing row 1 at or above 620. Measured 613. The forest Pay act sits on screen two,
inside `#doorstep`. Empty-Issue measures the same: drawn plate 140–480, tab 436–552, rows at 613,
657 and 701. Board content: Main-A 7,986 of the 8,000 frame cap, Main-B 4,362; the living room
chapter runs 3,301 inside the 3,375 held-plate budget (V2-9).

### 5.2 Arrival at 1440 (Issue-Cover-Desktop, measured at 1440 × 900)

| y | Element |
|---|---|
| 0–96 | Band: doorplate left; purpose sentence and the link row right |
| 104–752 | Hero 1440 × 648 (min(72svh, 648)), full bleed, object-fit cover around the focal point |
| 708–812 | Paper tab cut 44 into the plate: eyebrow `01 · ELM STREET HOUSE · PROCUREMENT` and the 64px headline on one line (748–812) |
| 820–842 | Hero caption, one line (no in-frame placeholder line) |
| 855 | Standing row 1, then rows 2 and 3, each a 44px link; gate: row 1 top at or above 880, hard fail past 900 |
| below | `#doorstep` (02), then 03 with the pair 784 + 440 and the typed-name step before the act |

Below chapter 03 the desktop page matches the Main-A and Main-B boards one-to-one and is shown as text stubs, not
redrawn. A second frame shows the portrait template: a 520 × 650 plate beside the 72px headline.

### 5.3 Chapters (anchors preserved; bare numerals; order never moves)

| # | Anchor | Eyebrow | Headline (studio voice) | Opening plate |
|---|---|---|---|---|
| 01 | new, above `#doorstep` | 01 · ELM STREET HOUSE · PROCUREMENT | *The living room is on its way* | Hero: walnut top, planed, at Harmon Bench Works |
| 02 | `#doorstep` `#ledger` `#letterbox` | 02 · INVOICES | *Six invoices, $1,375.00 together* | none; the ledger is the image |
| 03 | `#approvals` | 03 · APPROVALS | *Waiting for your approval* | Pair 7:5 + sample; typed full name, consequence note, forest 48px act $7,480.00 |
| 04 | `#key` | 04 · THE HOUSE | *Three rooms, read from the front door* | sheet A-101 or the key plan, whole |
| 05+ | RoomBand ids | 05 · LIVING ROOM | *Walnut, linen, and a lot of light* | chapter plate (held plate at 390), lead, material run, pieces, concept at six columns |
| 08 | `#road` | 08 · PROGRESS | *In production, then on the truck, then here* | workshop chapter plate; Now / Next / Target in words |
| 09 | `#note` | 09 · UPDATES | *A note from the studio, 16 October* | letter plate, Playfair italic lead, reply |
| 10 | `#previously` `#changed` | 10 · EARLIER | *What has already been settled* | text ledger; nothing moves under Earlier |
| 11 | `#mat` | 11 · DOCUMENTS AND CONTACT | *Who to call, and the documents* | document covers 282 × 376; colophon |

### 5.4 Phase heroes (Phase-Strip)

| Phase | Cover |
|---|---|
| Design | the studio board (board plate as hero) |
| Procurement | the workshop photograph of her piece |
| Installation | the first installed room |
| Closed | the studio's finished photograph |

Only the cover plate and the standing rows change with the phase. The chapter order is identical
in all four; settled things stay where June last saw them.

Motion (Motion-Storyboard): image settle on load (scale 1.015 → 1 and opacity, 400ms,
cubic-bezier(0.2, 0, 0, 1); caption +120ms); chapter head reveal on mount only (opacity + 12px
rise, 360ms, at most three staggered); hold 900ms. Reduced motion: no settle, no reveal, no fade;
the image appears when it loads and the hold timing is kept.

---

## 6. Rulings sought

The canvas shows the recommended option. It does not settle any of these.

| Id | Question | Recommendation |
|---|---|---|
| C1 | Shadows: A3/F4 allow, VISION §6/V9/V20 forbid | None; hairline + stock-on-paper step is the only depth; amend A3/F4. |
| C2 (amended) | Full-bleed photography vs house sheet §A10's 120px cap | Photography may bleed edge to edge at 390 and 1440. No image exceeds 72% of viewport height, except the single held plate per page, which may reach min(780px, 100svh − 72px). The letterhead and purpose sentence above the first image. A shared sheet or the key plan may be the cover when no photograph meets the floor. The 120px cap still governs designer and admin surfaces. |
| C3 | Delta-only auto-approve vs V22 | Allowed only when no prose call ran (plates changed, words unchanged), per project opt-in; otherwise V22 holds. |
| Q1 (v2 form) | A 340px hero above the first money fact at 390 | Yes, with standing row 1 at or above 620 as a hard gate (measured 613); the forest Pay act on screen two. Reversible: the v1 order is the fallback. |
| Q2 | Maker names/provenance on the homeowner page | One provenance line behind a per-project `show_makers` switch; no brand stories. |
| Q3 | Scroll-triggered reveals vs on-mount only | On-mount only. |
| V2-1 | Full-bleed eligibility | Only job-made images bleed: uploads, installed rooms, scans, boards, sheets, photographs of her own piece wherever taken. Catalogue and brand photographs stop at pair and piece plates. Yes. |
| V2-2 | The paper tab | Page furniture, not a scrim; ink measured on paper; notch, hairline and below fallback. Yes. |
| V2-3 | Link row below the standing rows at 390 | Amends CPUX-01.2 and F3; the purpose sentence stays under the doorplate. Yes. |
| V2-4 | Captions at 15px | Supersedes the 12px allowance for captions carrying dates or names. Yes. |
| V2-5 | Automatic crop reading of photographs of her home | Yes only after the client privacy page ships; code crops and the designer drag until then. |
| V2-6 | Crop and serving lane now | Media-worker crops through R2 and a client-portal R2 binding, versus CSS-only crops until the media reconciliation. Build now. |
| V2-7 | Held plate | 390 × min(780, 100svh − 72), one per page, never dimmed, never in Invoices or Approvals. Yes; one line added to the since-yesterday contract. |
| V2-8 | Measure before sizing Phase 1 | One aggregate over the item images by source and host, plus header dimensions from a dry run. Yes. |
| V2-9 | Held-plate chapter budget | The 2.5-screen chapter budget stands, except the one chapter that carries the held plate, which may run 3.75 screens (3,375px at 390). The living room measures 3,301. Yes. |

---

## 7. Board list (thirteen)

Frame width is the viewport the board shows; height is measured from the rendered content.
Clipping-Study is retired as a board; its four treatments live on Plate-Grammar.

| Row | Board | Frame | Shows |
|---|---|---|---|
| The issue | Main-A | 390 × 7986 | the arrival at 390 (5.1) and chapters 01 to 05; 8000 is the canvas frame cap |
| The issue | Main-B | 390 × 4362 | the same phone page from 06 Study to the colophon |
| The issue | Issue-Cover-Desktop | 1440 × 4956 | the arrival at 1440 (5.2), 02, 03, text stubs below; portrait template frame |
| The plates | Plate-Grammar | 1760 wide | nine plates at size, piece tiles, swatch and silhouette, clipping study A–D |
| The plates | Drawings-and-Materials | 1600 wide | sheets A-201 and A-101, the board plate, material runs, the paper tab three ways |
| The plates | Approval-Pair | 1920 wide | chapter 03 at 1440 and 390: pair, typed name, consequence note, forest act $7,480.00, settled state |
| The plates | Living-Room-Band | 1440 wide | chapter 05: chapter plate, lead, material run, four pieces, concept at six columns, paint |
| The issue changes with the job | Phase-Strip | 2400 wide | the four phase covers (5.4) with identical chapter order |
| The issue changes with the job | Press-Band-Designer | 1440 wide | "A new edition is ready", cover picker (eligible images only), chapter openers, empty slot, focal point at 16:10 and 39:34 |
| System | Type-and-Rhythm | 1400 wide | the v2 scale, captions at 15px, lead, a drawn 200 percent zoom specimen with the tab below (inspected, not reflowed) |
| System | Motion-Storyboard | 1600 wide | settle, reveal, hold; the reduced-motion row |
| System | Empty-Issue | 390 × 4395 | the drawn cover, three standing rows, the unsigned and signed approval stages, every chapter in words where there is nothing yet |
| System | Credits | 1200 wide | all eighteen placeholder photographs: source, author, licence, processing, plates, rank, caption |

Photography on the boards: Wikimedia Commons public-domain or CC placeholders recorded in
`canvas/ASSETS.md` and on the Credits board. Real editions use only job-owned images.

---

## 8. Hard don'ts for the canvas

- No "AI", no "Claude", no model name on any board, including the Press band (V23 R3). The band
  says "A new edition is ready", never why.
- No denominators, no percent complete, no progress bars, no percent sign or exclamation point in
  rendered text.
- No badges, counts, streaks or unread dots.
- No shadows, no red, no green other than forest, no gradients or translucency over photographs.
- Text never over a photograph except on the opaque paper tab.
- No dimmed plates; no carousels, auto-advance, parallax, scroll-triggered reveals, preloader or
  video.
- Every target ≥44px; the final act 48px; money, dates and names ≥15px; captions 15px.
- No generated rooms, no stock imagery at hero scale, no concept render as the cover, no catalogue
  photograph bleeding.
- No fixed header, tabs or bottom bar on the homeowner page; the link row is page furniture.
- No Patina wordmark above the colophon; no banned lexicon (patina-brand-voice); no emoji,
  testimonials, guarantees or sales calls to action; one provenance line at most.

---

## 9. Done oracle

From `artifacts/client-house-issue-2026-10-21/`:

```bash
node tools/check-canvas.mjs            # boards: frames and content height, captions (three
                                       # segments, .plate-note second line, 15px, 4.5:1), img sizes
                                       # and alt, 44px, text over images, chapter-03 signature and
                                       # act states, three standing rows and anchor order in every
                                       # arrival frame, Main-A/Main-B split, plate order, hero
                                       # specimen, picker eligibility, credits, required/retired
                                       # copy, canvas notes, arrival measures
node tools/check-canvas.mjs --self-test
node tools/check-doc.mjs               # founders' plan page
```

Each must exit 0 and print its `ok` line. check-canvas measures in Chromium at each board's width × 900
with remote images and fonts blocked, so text sets in fallback fonts; the 200 percent zoom column is
a drawn specimen, inspected, not reflowed. The diff stays inside
`artifacts/client-house-issue-2026-10-21/`.
