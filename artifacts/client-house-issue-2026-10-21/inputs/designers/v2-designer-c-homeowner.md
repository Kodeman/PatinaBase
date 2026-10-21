**Designer C, homeowner experience and accessibility. v2 proposal: the image-led House Issue for June at 390px.**

## 1. Thesis
June gets a photograph of her own house, edge to edge, in the first 96px. The first thing she can tap is still "$600.00 is past due", at y=608, and nothing ever sits between her and that link. The page gets its impact from height and full-bleed width, and from tall chapter plates further down. It does not get it from putting type on photographs or cutting words.

## 2. The 390 arrival y-table (first screen 0–740; Safari-with-toolbars line at 664)
| Element | y-range | px |
|---|---|---|
| Letterhead: "Birchwood Studio" (15px mono) / h1 "Elm Street House" (Playfair 24/28) / "Prepared for June Brennan" (15px). Not fixed. | 0–96 | 96 |
| **Hero plate**, full bleed 390×380 (`margin-inline:-16px`, never `100vw`), aspect locked at 390:380, `fetchpriority=high` | 96–476 | 380 |
| 4px palette rule | 476–480 | 4 |
| **Paper tab**, opaque `#FAF7F2`, x 0–310, cut 44px into the plate's bottom-left. Holds the eyebrow "01 · Procurement" (12px) and the h2 "The living room is on its way" (34/34, two lines, .t-d1) | 432–536 | 104 |
| Caption, 12px .t-meta, two lines: what · whose · when | 548–584 | 36 |
| **Standing row 1**: "$600.00 is past due since 25 September." → `#letterbox` | 600–644 | 44 |
| Standing row 2: "One approval waits: the living room sofa." → `#approvals` | 644–688 | 44 |
| Standing row 3: "Six invoices are open, $1,375.00 together." → `#ledger` | 688–732 | 44 |
| Purpose sentence, 16/22, two lines | 748–792 | 44 |
| Link row, two rows of 44px targets, F3 order | 800–888 | 88 |
| `#doorstep` heading, then the past-due card | 912– | |
| Consequence note, then **forest Pay act, 48px** | ~1072–1120 | 48 |

- **Hero allowance:** 380px, which is 51% of screen one. At 360px the plate scales to 360×351 and everything below rises by 29px.
- **Hard invariant:** the top of row 1 is at or above 620 in the fixture. A canvas check should enforce this, and it should fail if the hero ever pushes row 1 below 664.
- **Screen one:** studio letterhead, her sideboard in the workshop, the edition headline, the caption, and three status links (past due, approval waiting, total).
- **Screen two:** purpose sentence, link row, the past-due card with its consequence note and forest Pay, then the start of the ledger.
- **Why block rows:** v1's standing line used inline links on a 24px line, which misses the 44px product target. Each row here is a 44px block link that wraps instead of truncating.
- **No layout shift:** the hero reserves its box with `width`/`height` and a solid `dominant_hex` fill. If a slow photo shoved the rows 380px down, her tap would land on the wrong thing.

## 3. The text-on-image rule
- **No ink ever sits on photograph pixels.** Anything inside the plate's rectangle sits on an opaque paper tab. Contrast is measured ink on paper: `#2C2926` on `#FAF7F2` is about 13:1, so the photograph cannot affect it. The tab is plain paper, not a scrim.
- **Positions:** the eyebrow and headline are in the tab (bottom-left). The caption sits under the plate, left-aligned to the 16px gutter. The only R142 exception is the concept chip: "Concept · not installed", 14px, on an opaque `#FFFDF9` chip.
- **Fallback for bright or busy photos.** The edition pipeline already makes a 48px rendition for palette extraction. Code also uses it to measure the tab zone (bottom-left 310×44) and stores `tab: notch | hairline | below`:
  - The zone's luminance contrast against paper is under 1.3:1 (pale linen or plaster): `hairline`, a 1px `#C9C7BD` rule on the tab's top and right edges.
  - Edge density is above threshold, or the focal point falls inside the zone: `below`, meaning the tab sits under the plate with no overlap.
  - When the container is under 320 CSS px (200% zoom), the tab always uses `below`.
- **Captions** stay 12px metadata as R140 allows. They are never the only place a status, amount or due date appears.

## 4. The held image at 390
- **What a held plate is:** one tall plate per chapter at most, 390 × min(780, 100svh − 72). It is held by its height and by staying still, never by `position: sticky` or a scroll trigger. Subtracting 72 means the plate's bottom edge and the first caption line are always on screen together, so she never sees an image without its words.
- **Where they go:** only in chapter 04 (The house), the RoomBands and chapter 08 (Progress). Never in 02 Invoices or 03 Approvals, where the pair plate stays 7:5 inside its card.
- **Rhythm:** 20–70 words between plates, never two plates in a row.
- **Scroll budget per chapter:**
  - 01 cover: ≤740.
  - Room chapters: ≤2.5 screens (1850px).
  - 08 Progress: ≤1.5 screens.
  - 02, 03, 09 and 10: as long as their content needs, with no plate taller than 7:5.
- **Dimming risk found in the code.** In `since-yesterday.tsx`, below 860px, dimmed elements get `border-left:1px + padding-left:12px`, and changed units get a 2px border plus 12px padding. A full-bleed plate inside either would shift 12px and overflow at 390.
- **Rule: plates never carry `data-dimmable` and never sit inside a padded unit.** Only the words block dims or takes the tick. On desktop, a photograph at 0.3 opacity looks like a failed load.
- **The hero stays outside dimming.** It renders between the doorplate and `SinceYesterday`, where `ArrivalLine` already sits, so it never dims. A hero change reaches her through Maren's notice in `#note`, which is a unit and gets the tick.

## 5. Status in words that must survive
Every status line sits **above** its plate in both DOM and visual order. The caption sits below.
- **Arrival:** the three standing rows, word for word.
- **02 Invoices:**
  - The four group heads.
  - Per row: number, amount and written state ("Past due · 25 September 2026", "Due today · 20 October 2026", "Due 2 November 2026 · $500.00 paid", "No due date").
  - "Total outstanding $1,375.00".
- **03 Approvals:**
  - "Waiting for your approval" before the plate.
  - The changes: linen replaces bouclé, arm 26 to 24 in, two weeks added.
  - $7,480.00, the consequence note, and the choice labels.
  - Once settled: "Approved by June Brennan · [date]".
- **Room chapters:** a status word on every piece row ("In production", "Ordered", "Delivered", "Installed", "Photograph to follow"), at 16px beside a 64px plate. Never only in a caption, never on the image.
- **08 Progress:** Now: Procurement. Next: Living room installation. Target date: 22 January 2027 (labelled as a target). Designer update: 16 October 2026.

## 6. Screen reader, zoom and reduced motion
- **Reading and focus order:**
  1. Letterhead, h1
  2. h2 cover headline (placed by grid rows, not `order`)
  3. Hero figure
  4. Rows 1–3
  5. Purpose sentence
  6. nav "On this page"
  7. `#doorstep`

  The hero is not focusable, so **her first Tab stop is "$600.00 is past due"**.
- **Alt vs caption:** alt describes what is visible, ≤125 characters, e.g. "Walnut sideboard on a workbench, doors open, shavings on the floor". The caption carries provenance. This replaces v1's "alt = first two caption segments", which made screen readers read the provenance twice.
- **200% zoom:** the CSS width is 195. Plates keep their aspect (hero 195×190). Held plates cap at 100svh − 72, so they shrink as the viewport shrinks. The tab uses `below`. Headlines wrap at the 34px floor. Rows grow taller rather than truncating. No horizontal overflow.
- **Reduced motion:** no scale settle, no plate fades (the image appears when it loads), no reveals. The `since-yesterday` transition is already off. The 900ms hold timing is kept (A4).

## 7. Where I overrule Designer A
1. **A photograph at y=0 filling ~97% of the viewport, with the letterhead on or under it.** For a low-confidence payer arriving from an invoice email, a page that opens on someone else's-looking photograph reads as the wrong website, and it breaks V9 P1. **Keep-the-impact alternative:** the 96px letterhead first, then a full-bleed hero with no gutter, and 100% image share given to the 780px held plate in the living-room chapter.
2. **Display type set in the photograph** (the 72px paper-ink pattern on all three reference sites, R5). **Alternative:** the opaque paper tab cut 44px into the plate. It gives the same overlapping lockup silhouette, with contrast that does not depend on the photo.
3. **Fewer words: piece grids of images only, or a "held" scene with text scrolling over a pinned plate.** That erases "In production" and similar statuses and breaks 200% zoom. **Alternative:** a run of 1:1 piece plates where each tile carries a 16px name and status line underneath. The 20–70 word runs between tall plates keep the magazine rhythm.

## 8. Rulings for the founders
1. **Q1, v2 form.** A 380px hero above the first money fact (row 1 at 600–644), with the forest Pay act at about 1120 on screen two. Recommend yes, with the y≤620 row-1 check as a hard gate.
2. **CPUX-01.2 "under the doorplate".** The link row moves below the hero and standing rows (to 800). Recommend amending F3 so the standing rows count as the first landmarks.
3. **Standing rows replace v1's inline standing line.** Three 44px block links. Recommend yes.
4. **Held plates (390 × min(780, 100svh − 72)) only in 04, the RoomBands and 08, never in Invoices or Approvals, and never dimmed.** Recommend yes. This also needs one line in the `since-yesterday` contract.

### Critical files for implementation
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/brief/PLAN.md
- /Users/kody/Code/patina-merged/artifacts/client-house-issue-2026-10-21/canvas/project/Main.dc.html
- /Users/kody/Code/patina-merged/apps/client-portal/src/components/threshold/threshold.tsx
- /Users/kody/Code/patina-merged/apps/client-portal/src/components/threshold/since-yesterday.tsx
- /Users/kody/Code/patina-merged/docs/specs/_active/client-portal-homeowner-usability.md