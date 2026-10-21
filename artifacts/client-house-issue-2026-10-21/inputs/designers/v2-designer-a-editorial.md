# Designer A: the House Issue v2, a photographed issue about one house

Two notes before the proposal:
- **Rulings R-a to R-o are not in PLAN.md** or anywhere else in the artifact folder. I found only R-d (chapter order held on the Closed frame) and R-o (the desktop hero at 1248×648), both named in commit 329e1ca14. I worked from those two plus C1–C3 and Q1–Q3.
- **There is no placeholder photograph of a studio board** among the 18 files. Any board plate needs one more placeholder fetched, or it cannot be mocked honestly.

## 1. Thesis

Every chapter of the page opens on the strongest image the job owns: a held plate, a drawing or a run of material samples. The words come in runs of 20–70 between pictures, like a magazine spread about one house. The Patina ground rules hold because no text ever sits on a photograph: furniture stays in a 96px top band (letterhead, purpose sentence, link row), captions sit under or beside each picture, and the money facts are on the first screen at both widths.

## 2. Arrival

**At 1440 (900px window).** The photograph takes 67% of the first screen.

| Element | y | Size |
|---|---|---|
| Top band, row 1: "Birchwood Studio" at x=48; "Elm Street House · Prepared for June Brennan" right-aligned | 0–48 | Playfair 22 / Inter 15 |
| Top band, row 2: purpose sentence on the left; link row on the right (six links, each 44px tall), 1px hairline at y=96 | 48–96 | 16 / 15 |
| Hero photograph, edge to edge, 1440×600 (2.4:1), never taller than 72% of the window (an 800px window gives 1440×576) | 104–704 | — |
| Under the photograph, left: eyebrow `01 · ELM STREET HOUSE · PROCUREMENT`, then the headline *The living room is on its way* on one line, at most 1000px wide | 720–800 | 12 / 72 |
| Under the photograph, right (x=1104–1392): caption in three lines | 724–790 | DM Mono 15 |
| Standing line; each clause links to its section and is a 44px target | 816–860 | 24/1.3 |
| Chapter 02 begins | 884 | — |

**At 390 (first screen ends at 740).** The photograph takes 52%.

| Element | y | Size |
|---|---|---|
| "Birchwood Studio" with "Prepared for June Brennan" | 0–40 | 18 / 15 |
| Purpose sentence, two lines | 44–92 | 16 |
| Hero photograph, edge to edge, 390×384 (about 1:1), with its own stored focal point | 100–484 | — |
| Paper notch: a solid `#FAF7F2` block 270×84 that covers the photograph's bottom-left corner and holds the headline in two lines (see ruling 3) | 400–484 | 34/1.0 |
| Caption, two lines | 492–536 | 15 |
| Standing line, two link lines of 44px | 548–636 | 18 |
| Link row, two rows of 44px | 644–732 | 15 |
| Chapter 02 (invoices) begins | 748 | — |

**How the hero is captioned:** on its own line under the photograph at 390, and in the column to the right of the headline at 1440. It is never set on the photograph and never sits on a tint.

**The hero by phase:**
- **Design:** the cover of the studio's board.
- **Procurement (the fixture):** the maker's workshop photograph of June's own sideboard. This keeps Maren's notice ("The page now opens on your sideboard…") true. Placeholder 14 stands in. Caption: *Walnut top for her sideboard, planed · photographed by Harmon Bench Works · 15 October 2026*.
- **Installation:** the first photograph of a room as installed.
- **Closed:** the studio's finished photograph.

## 3. Picture sizes and rhythm

Sizes are given as width × height (ratio).

| Picture type | At 1440 | At 390 | Where it comes from |
|---|---|---|---|
| Hero | 1440×600 (2.4), edge to edge, ≤72% of window height | 390×384 (≈1.0), edge to edge | one per page |
| Chapter-opening plate | 1248×648 (1.93) inside the page width | 390×488 (4:5), edge to edge, 66% of an 740 screen | one per chapter; "held" by its height, never pinned |
| Drawing | 772×648 on the stock ground, shown whole (never cropped), hairline frame; the whole drawing links to the full sheet | 358×300, 16px side margins | floor plan, shop drawings |
| Board | 832×624 (4:3) | 358×268 | the studio board's cover image |
| Material | three portraits at 400×533 (3:4) | two squares 171×171, the third 358×171 | samples and site details |
| Pair (approval) | photo 784×560 (7:5) next to material 440×560, total 1248 | photo 390×279 edge to edge; material 140×175 beside its own line of text | approvals only |
| Pieces | 4 columns of 282×282 | 2 columns of 171×171 | one square per item; unchanged from v1 |
| Document cover | 4 columns of 282×376 (3:4); the whole cover is the link | 2 columns of 171×228 | chapter 11 |

- **Concept renders** go no wider than 612px (6 columns) at 1440, or 358px inset at 390, with the "Concept · not installed" label at 14px or larger.

**Word budget:**
- Chapter headline: 8 words or fewer.
- Between any two pictures: 20–70 words or a chapter head. No two pictures ever touch.
- Standing sentence: 30 words or fewer.

**Type (1440 / 390):**
- Display: 72/1.0 and 34/1.0.
- Chapter head: 48/1.08 and 30/1.1.
- Lead line: 24 and 18.
- Eyebrow: 12px DM Mono 500, tracked 0.12em, at both widths.
- Caption: DM Mono 15/1.45 at both widths, raised from 12 because captions carry names and dates.
- Body: 16/1.55.

Display at 1440 is 4.5 times body, which matches the reference sites.

## 4. Chapter by chapter

The number in each "Opens on" cell is the image's rank from best to worst (rank 1 is an installed photograph; see Constraints section).

| # | Opens on | Then |
|---|---|---|
| 01 Cover | Hero: workshop photograph of her sideboard (rank 3) | Standing line |
| 02 Invoices | No picture; the invoice list stands alone, the one quiet chapter | Four invoice groups, unchanged |
| 03 Approvals | Pair: sofa (04, rank 3) next to the oatmeal linen sample (03, rank 3) | About 30 words on the change, the consequence note, then the green 48px "Approve" act with $7,480.00 |
| 04 The house | Drawing: the floor plan (12, rank 2), with room names as links in a column beside it. Era's hotspot idea, without any text on the picture. The existing drawn plan is the fallback | — |
| 05 Living room | Chapter plate: the studio's site photograph of her living room (09, rank 2, *Living room as measured · photographed by Birchwood Studio · 2 June 2026*) | About 40 words, then the material run (walnut 08, linen 03, morning light 18; this is where *Walnut, linen, and a lot of light* comes from), about 20 words, the piece run, then the concept render at 6 columns with its label |
| 06 Study | Material run from the study board (oak 15, brass 16, lime plaster 17), each captioned *from Birchwood Studio's study board · 2 September 2026* | The board picture once a placeholder exists |
| 07 Entry | No picture; one line and the paint swatch strip | — |
| 08 Progress | Pair: the maker's shop drawing (13, rank 2) next to the workshop (02, rank 3) | Labels with words beside the pair: NOW *In production* · MAKER *Harmon Bench Works, Dayton* · TARGET *22 January 2027*. No counts |
| 09 Updates | Maren's letter. Her lead line comes first, then the photograph she mentions (14, a second crop at 4:5, 520×650) | Reply |
| 10 Earlier | Text list of past decisions; no pictures | — |
| 11 People and papers | Document covers: drawing set (12), shop drawing (13) | Portrait of Maren only if uploaded; *Lake Cottage, the next issue* at 282×376 (11, a cover, not a sales prompt); then the colophon |

**The 12 v1 boards:**
- **Changed (9):**
  - **Main:** the 390 page.
  - **Issue-Cover-Desktop:** the 1440 page.
  - **Plate-Grammar:** grows from six picture types to nine and absorbs the clipping study as one row.
  - **Approval-Pair:** the material sample becomes a full picture.
  - **Living-Room-Band:** chapter plate plus material run.
  - **Phase-Strip:** the hero at each phase.
  - **Type-and-Rhythm:** the new type sizes.
  - **Press-Band-Designer:** the hero picker becomes a picker for every chapter opener.
  - **Credits:** all 18 photographs.
- **Light touch (2):**
  - **Empty-Issue:** shows how each chapter opener falls back when the job has no image.
  - **Motion-Storyboard:** the settle-on-load applies to chapter plates.
- **Dropped (1):** Clipping-Study, folded into Plate-Grammar.

**New boards:**
1. **Arrival-Measured:** the 1440×900 and 390×740 first screens with the y-tables drawn on.
2. **Drawings:** the floor plan in chapter 04 and the shop drawing pair in chapter 08, at both widths.
3. **Materials:** the material runs for chapters 05 and 06 at both widths.
4. **Image-Ledger:** every picture on the page with its rank, its what · whose · when caption and its chapter, so reviewers can check the image rules.

## 5. Three moves borrowed from the reference sites

1. **The first screen belongs to a photograph** (they give it 98–100%; this design gives 67% at 1440 and 52% at 390). It still works within the rules because all the page furniture sits in a 96px band on paper, as on Stanzza. It is not fixed and has no tint over the picture. The letterhead still opens the page and the money facts still land on the first screen.
2. **One picture held for a whole screen** (Era holds one for about 3.5 screens; Fitosauna holds a portrait). Here the hold comes from height alone: a 4:5 chapter plate is 66% of a phone screen, and the reader simply scrolls past it. There is no pinning, scrubbing or carousel, so anchors and 200% zoom keep working.
3. **Short facts beside the picture, and the picture as the link** (Stanzza's project facts). Facts are words and dates only, never counts. The floor plan's room links, the document covers and the shop-drawing pair each give a tap target well over 44px.

## 6. Risks and rulings for the founders

1. **C2 amendment.** The adopted wording allows one picture at the full 1248 page width. This design needs an edge-to-edge hero at 1440 (1440×600) plus one chapter plate per chapter at 1248×648, all capped at 72% of the window height.
2. **The paper notch at 390.** It is a solid paper block over the photograph's corner, not see-through. Is it a "scrim"? If yes, the headline drops under the caption and the link row moves to 700–788, just past the first screen.
3. **Caption size of 15px.** The brief sets captions at 12px, but the spec's 15px floor for names and dates arguably covers captions. At 390 that makes captions two to three lines.
4. **Image rank and data for the new picture kinds.** Do site photographs (stills from room scans), studio floor plans and makers' shop drawings count as rank 2 (studio board or scan)? No client reader exposes drawings or document thumbnails today, so phase 1 needs a `drawing` source kind and a reader field. A board placeholder also has to be fetched before chapter 06 or the Design frame can be mocked.
5. **Page weight and misreading.**
   - **Weight:** about 16 pictures sit on the 390 page, and the Workers setup has no image optimizer. Pictures need `srcset` at four widths, and only the hero loads eagerly.
   - **Misreading:** a beautiful site photograph or render can read as "your finished room". The "as measured" caption and the 6-column cap on renders are the guard, and the founders should confirm both.

### Critical Files for Implementation
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/brief/PLAN.md
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/brief/DESIGN-BRIEF.md
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/canvas/project/Main.dc.html
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/canvas/project/Issue-Cover-Desktop.dc.html
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/inputs/photos/MANIFEST.md