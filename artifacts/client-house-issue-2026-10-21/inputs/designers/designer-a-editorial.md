# Designer A — Editorial art direction: "The House Issue"

## 1. Concept and promise

**The House Issue.** The Threshold becomes a single-issue magazine about one house, written and photographed by Birchwood Studio, printed by Patina. Each visit is the same issue, re-set overnight as the job moves: new plates arrive, chapters re-order, the lead photograph changes rank. Claude's role is the art director on the press floor: it picks the lead image from what the studio has actually shot, crops to a focal point, composes the caption from record facts, names and sequences chapters by room, and pulls the plate tint from the room's palette record. It never paints.

**Promise to June:** *"Open this and see your own house arriving, piece by piece, in the studio's own pictures, with every ask sitting exactly where it belongs."*

## 2. Page anatomy (390 / 1440)

Type system: **Display** Playfair 400, `clamp(34px, 5.2vw, 72px)`, line-height 1.0, letter-spacing -0.01em (Playfair's ascenders clip below ~0.98, so Fitosauna's 0.84 is rejected). **Chapter head** Playfair 400 `clamp(28px, 3.2vw, 44px)` / 1.08. **Eyebrow** DM Mono 500 12px, 0.08em, uppercase (existing `.t-head`, numeral in 400). **Caption** DM Mono 400 12px / 1.5 (`.t-meta`), 13px minimum at 200% zoom-safe. **Body** Inter 16px / 1.55 (`.t-body`). Money, dates, names never below 15px (`.t-money`).

Grid at 1440: 12 columns, 96px outer margin, 1248 measure; StoryPole rail stays sticky at 170px inside the left two columns. At 390: single column, 20px margins; rail collapses to its existing inline form.

| # | Chapter (anchor) | Eyebrow | Headline (studio voice) | Image treatment | 390 / 1440 |
|---|---|---|---|---|---|
| — | Letterhead (`Doorplate`) | — | Birchwood Studio wordmark, "Prepared for June Brennan", Elm Street House | Studio logo at natural size, no plate | unchanged |
| — | Link row | — | Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt | text only, 44px targets | wraps 2 lines / 1 line |
| 01 | **Lead plate** (new, above `#doorstep`) | `01 · ELM STREET HOUSE · PROCUREMENT` | *The living room is on its way* | **Hero plate** 4:3 at 390 (390×293), 16:10 at 1440 inside the 1248 measure (1248×780); caption "Walnut sideboard · photographed at Harmon Bench Works workshop, Dayton · 9 October 2026" | Display headline overlaps plate bottom edge by one line at 1440; sits beneath plate at 390 |
| 02 | `#doorstep` (`#ledger`, `#letterbox`) | `02 · WHAT IS OWING` | *Six invoices, $1,375.00 together* | no plate; the ledger is the image. Past-due stated in words. | cards #FFFDF9 / 1px #C9C7BD / 8px |
| 03 | `#approvals` | `03 · WAITING ON YOU` | *The sofa, second edition* | **Pair plate**: left, maker photo of the sofa frame (3:2); right, the oatmeal performance linen swatch record as a **swatch strip**. Caption "Oatmeal performance linen · maker's sample · 14 October 2026". Consequence note #F0F3ED above the forest 48px act with $7,480.00. | stacked / side-by-side 7:5 |
| 04 | `#key` | `04 · THE HOUSE` | *Three rooms, read from the front door* | existing SVG plan, hairline ink, no fill; room names become anchor links to each RoomBand | full width / 8 cols |
| 05–07 | RoomBand × n (existing ids) | `05 · LIVING ROOM` | *Walnut, linen, and a lot of light* (composed from the specified material words on that room's items only) | Chapter opens on the **room plate** (highest-rank image for that room: concept render with "Concept · not installed" at 14px, or installed photograph when one exists). Below, items as **piece plates** in a 2-col (390) / 4-col (1440) run, each with a one-line caption; tapping lifts the existing TrackingRow record. **Silhouette plate** for items with no image. | 1:1 piece plates 165px / 282px |
| 08 | `#road` | `08 · WHERE THINGS STAND` | *In production, then on the truck, then here* | Progress in words only; maker photo of the sideboard reused small (**piece plate**, 96px) beside its row. Target "22 January 2027" stated once as "the date Maren is working toward". | — |
| 09 | `#note` | `09 · FROM MAREN` | *A note from the studio, 16 October* | Designer's letter in Playfair italic lead line 20px (`.t-authorship`), Inter body; reply field below | 60ch measure |
| 10 | `#previously` + `#changed` | `10 · EARLIER` | *What has already been settled* | text ledger, no plates | — |
| 11 | `#mat` | `11 · PEOPLE AND PAPERS` | *Who to call, and the documents* | Maren's studio portrait only if the studio has uploaded one (**piece plate** 1:1 96px), otherwise initials in hairline | — |
| — | PresentedBy + Colophon | — | "Prepared by Birchwood Studio · Sent through Patina" | — | — |

Chapter numerals are bare ("05"), never "05 / 11". Rhythm: plate → ledger → pair → drawing → plate-and-run (repeating) → words → words → words. The eye gets a picture, then a fact, never two pictures in a row.

## 3. Image plate grammar

All plates: `object-fit: cover` unless noted, 3px radius inside RoomBand, 0 radius for full-bleed hero, 1px hairline #E8E3DB. Caption always present, always "what · whose · when", DM Mono 12px, #4E4339, 12px below the plate, left-aligned to the plate edge. Source rank per R142 is printed implicitly by the "whose" clause: *photographed at the house* > *from the studio's board* > *maker's photograph* > *drawn*.

1. **Hero plate.** One per page. 4:3 at ≤600px viewport, 16:10 above. Fills the measure (not the viewport). Focal point set by Claude as `object-position` percentages stored with the choice. Eligible sources in order: installed photograph, room scan with `quality` above threshold, studio board cover, maker `hero_image_url` for the lead piece. Never a concept render (would need the overlay at hero scale, which reads as a claim).
2. **Room plate.** 3:2, top of each RoomBand, 100% of the band measure. Concept render allowed with existing "Concept · not installed" chip at 14px. Replaced automatically by the first installed photograph of that room.
3. **Pair plate.** Two frames, 7:5 photo + swatch strip, used only in `#approvals` and scope-change asks, so the ask is seen as material not as a form.
4. **Piece plate.** 1:1, 165px (390) or 282px (1440), one per item. For a hotlinked retailer photo on white: `object-fit: contain` with 10% inset, so the product's own white becomes a mat that meets the page's stock #FCFAF6; a hairline around the frame makes the white read as a pasted clipping on a board rather than a web thumbnail. Tint from the room palette is applied to a **4px rule under the frame**, not behind the image. `mix-blend-mode: multiply` over a palette tint was considered and rejected as a fidelity risk (darkens the product June is buying). Paper grain is CSS only, an SVG `feTurbulence` noise at 3% opacity on the page background, never on the image.
5. **Swatch strip.** Row of 40×40 swatches from `project_palettes` hex values, labelled with paint brand and name in DM Mono. The one place the palette is allowed to be colour rather than a photograph, because it is a record of real paint.
6. **Silhouette plate.** Existing drawn footprint, 1:1 frame, hairline ink, caption "Floor lamp · drawn from the specification · 12 October 2026".

**Fallback ladder** when a job has few or no photographs: hero plate becomes the studio board cover; failing that, the hero slot is **omitted** and chapter 01 opens on the headline alone with a swatch strip beneath. No plate is ever filled with a gradient, a stock image, or a room render at hero scale. A page with zero images is still a complete page; it simply has more white and the numerals carry the rhythm.

**New reader needed:** item description, maker/vendor name, finish, materials, dimensions from `products` / `project_ffe_specs`, allowlisted into the client reader so captions and room headlines can use real material words. Captions without a maker name degrade to "Sofa · maker's photograph · 14 October 2026".

## 4. How the page changes with the job

- **(a) Design, boards only.** Hero is the board cover, captioned "Living room board · Birchwood Studio · 2 September 2026". Room plates are concept renders with the chip. Piece plates are mostly silhouettes and retailer clippings. Swatch strips lead. `#doorstep` is small (design fee only). The letter from Maren rises to chapter 03.
- **(b) Procurement, maker photos.** (The fixture state.) Hero is the maker's workshop photograph of the walnut sideboard. Pair plate on the sofa approval is the main event; `#doorstep` sits second with six invoices. Room plates still renders. Piece plates begin to show maker photographs with "In production" in words.
- **(c) Installation, first installed photograph.** The first installed photograph takes the hero and every board/render it supersedes recedes a rank. The living room RoomBand reorders to first. "Concept · not installed" chips disappear room by room. `#road` shrinks to two lines.
- **(d) Closed, portfolio snapshot.** Hero is the studio's finished photograph. `#doorstep` and `#approvals` collapse to one line each ("Nothing is owing"). Room plates are all installed. The page becomes the keepsake issue; the colophon gains the closing date. Lake Cottage appears in `#mat` as the next issue, not as a sales CTA.

## 5. Motion

- **Scroll reveal.** IntersectionObserver at 12% visibility; chapter head and first paragraph: opacity 0→1, translateY 12px→0, 360ms `--ease-editorial`. Stagger 60ms, max three children, then the rest appear at once. Fires once. (Synthesis ruling: reveal on mount only, not on scroll — see PLAN.md Q3.)
- **Image settle.** Plate: `scale(1.015)`→1 and opacity 0→1, 400ms; caption follows at +120ms, opacity only. No parallax.
- **Hold feedback.** Unchanged 900ms HoldAction on binding acts; the forest fill rises as a clip-path from the baseline (existing 260ms). No new motion on money.
- **Reduced motion.** `prefers-reduced-motion`: all transforms removed, opacity 150ms linear only, stagger 0.
- **Not present:** scroll-jacking, pinned sections, carousels, preloader, autoplaying anything, GSAP. CSS and one small observer only.

## 6. Founder rulings

**C2 proposed text.** "Photography on the homeowner page may fill the page measure (edge to edge at 390px, the full 1248px measure at 1440px) but never the viewport: the studio's letterhead and the page-local link row always sit above the first image, and no image exceeds 72% of the viewport height. One plate per page may be at this scale; all others follow the plate grammar. Full-measure photography is permitted only for installed photographs, studio boards, room scans, and makers' photographs of the specified piece; concept renders stay at the room plate size with the 'Concept · not installed' mark. The 120px cap continues to govern the house sheet, designer and admin surfaces, where the image is a record, not the subject."

**C1 recommendation.** No shadow. The page is a printed thing; the hairline border and the stock-on-paper tone step already separate the card. A shadow would be the only element on the page implying a light source, and the image plates would then look flat beside it. Recommend VISION §6/V9 prevail and A3/F4 be amended.

## 7. Canvas boards

1. Issue cover, 1440 — letterhead, link row, hero plate with sideboard, display headline overlapping the plate.
2. Issue cover, 390 — same chapter, stacked, link row wrapping to two lines, 44px targets marked.
3. Plate grammar sheet, 1600×1000 — six plate types side by side with caption rules, hairline, inset, palette rule.
4. Retailer clipping study, 1200×800 — same white-ground product photo in four treatments (raw, inset-and-hairline, multiply-over-tint rejected, silhouette) with notes.
5. Chapter 03 approval, 1440 and 390 pair — pair plate, consequence note, forest act with $7,480.00.
6. Living room RoomBand, 1440 — room plate with concept chip, piece plate run, one lifted TrackingRow.
7. Phase strip, 2400×700 — the cover at Design / Procurement / Installation / Closed in a row.
8. Type and rhythm sheet, 1200×1600 — Display, chapter head, eyebrow, caption, body at actual size, 200% zoom column beside.
9. Motion storyboard, 1600×600 — reveal, image settle, hold at 0/120/360/400ms frames, reduced-motion row.
10. Colophon and empty page, 390 — zero-image job showing the fallback ladder's bottom rung.

## 8. Rejected from Fitosauna

- 100vh hero with the logo floating on the photo — V9 P1 opens on the studio letterhead; the photograph is the second thing seen, not the first.
- Condensed display face at 0.84 line-height — Playfair 400 is the only display face allowed, and it clips below 1.0; tightness comes from scale and the overlap, not from leading.
- "01 / 07" indices — the denominator is a progress count by another name (V9: no measuring her). Bare numerals keep the rhythm without the arithmetic.
