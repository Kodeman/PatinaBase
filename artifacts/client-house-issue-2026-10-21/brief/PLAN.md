# The House Issue — the homeowner client portal as a job-made website (plan v2, image-led)

> **v2, 21 October 2026 (SQ-1571).** Kody asked for the image-led direction on 2026-10-21 (US-48 decision #1): the arrival leads with the job's own photograph, and the money facts follow at once. v2 is merged from three new designer proposals (`inputs/designers/v2-designer-{a-editorial,b-systems,c-homeowner}.md`) and the inspiration sheet (`inputs/inspiration/INSPIRATION.md`). Spine: Designer A (editorial). Grafts: Designer C (390 arrival, standing rows, paper tab, accessibility) and Designer B (image system). Everything in v1 that v2 does not change stays as it was. The change to the arrival applies founder question Q1 in the image-first direction and is reversible: the v1 order is the recorded fallback (card Q1). Each v1 review ruling is marked "stands" or "superseded" in the **Rulings ledger** below.

## Context

Kody asked a team of designers to reconceptualize the client portal so it both drives the homeowner's engagement with the job and reads like a polished website promoting *their* job, leaning heavily on imagery of the products specified on it (reference: fitosauna.com, awwwards nominee Oct 2026), using Anthropic API credits so each page's imagery and design is built for, and adjusts with, the job. Deliverables: a concept mockup and an HTML plan document for the founding team. On 2026-10-21 Kody asked for a v2 that is led by imagery; the inspiration sheet (SQ-1568) measured Fitosauna, ERA Residence and Stanzza, and three designers proposed against it.

This is a **design-and-plan story**: it produces a canvas, an HTML document, and committed source under `artifacts/`. No app code, migrations, flags, or deploys. Three Plan-agent "designers" (editorial art director, systems/Claude-layer, homeowner experience/accessibility) each proposed, twice (v1 and v2); this file is the synthesis.

### What exists (verified at main f1d83091d, 2026-10-21)
- One signed-in surface, **the Threshold** (`apps/client-portal/src/components/threshold/threshold.tsx`, the only hook-wiring file). `/` resolves the active house; `/projects/[id]` renders the same component. The Making / `single-pane` flag was retired in f1bfe7c0f; nothing is flag-gated.
- Render order: Doorplate letterhead → "On this page" link row → sticky 170px StoryPole rail + main column: `#doorstep` (`#ledger`, `#letterbox`) → `#approvals` → `#key` SVG plan → one RoomBand per room (3:2 concept render as `figure`/`figcaption` with on-image "Concept · not installed", item rows with 64/96px `<img>` thumbnails, `PieceSilhouette` fallback) → `#road` → `#note` (Maren's letter, reply) → `#previously` → `#mat` → PresentedBy + Colophon. **Anchor ids are an external contract** (emails, pay returns, retired-route redirects in `lib/retired-routes.ts`).
- `since-yesterday.tsx` dims only opt-in `data-dimmable` units; never the doorplate, doorstep, letterbox, or gates. Below 860px a dimmed unit takes `border-left:1px + padding-left:12px` and a changed unit a 2px border plus 12px padding (Designer C): a full-bleed plate inside either would shift 12px and overflow at 390, so plates never sit inside one (V2-7).
- Visual system: Playfair / Inter / DM Mono; paper `#FAF7F2`, stock `#FCFAF6`, ink `#2C2926`; US-45 green tokens between the `green direction tokens` markers in `app/globals.css` (`--color-forest #3E5145`, card `#FFFDF9` / rule `#C9C7BD`, note `#F0F3ED`); scored-ink `.da-*`, `HoldAction` 900 ms; CSS-only motion, `--ease-editorial`; light-only; no `next/image` optimizer on Workers (size at source).
- Imagery available per job today: see **Image system → Source inventory** below (Designer B, with evidence anchors). The client reader `get_client_project_threshold` (head 00840) returns **no description, maker, finish, material, or dimensions**. `page.tsx` fetches the project view on the server (`fetchClientProjectView`, page.tsx:8) while Threshold fetches its selections on the client (threshold.tsx:1, :397).
- Claude: `supabase/functions/_shared/claude.ts` `callClaude()` (llm_reserve → call → llm_settle → PostHog `$ai_generation`); roles in `_shared/claude-models.ts` (haiku-5-5 triage/judge, sonnet-5-5 extract/answer/draft); pattern to copy is `aesthete-dna-draft/lib.ts:340` (image URL blocks, cached system prefix, JSON schema). Controls: `llm_feature_controls` (new features default DISABLED), $25/day global, $50/studio/month, kill switch, admin `model-usage` page. Dispatcher pattern: `00677_board_deck_import_resolve_dispatch.sql` (cron → `job_runs` only when work exists → lease-claimed edge fn → lease-checked RPC writes). Frozen-snapshot precedent: `project_review_editions` (00434).
- Gate for the portal: `pnpm --filter @patina/client-portal type-check`, `test` (164 jest files), `test:e2e` (`threshold.spec` 22, `homeowner-usability.spec` 8).

### Authority the concept must obey (and where it strains)
- **V8/V9**: the homeowner page *may* be designed for daily return; it may *never* measure her (no badges, counts, streaks, %, "01 / 07" denominators). **V9 P1**: studio is the author, Patina the press — letterhead opens, "Prepared by Birchwood Studio · Sent through Patina" closes, no Patina wordmark above the colophon.
- **R142 / V9 P4**: image rank installed photo > studio board/scan > maker product photo > drawn silhouette; every image captioned "what · whose · when"; concept renders carry "Concept · not installed" ≥14px on the image; **never stock, never generated rooms**. **V23** refuses generated imagery of the client's home and any client-facing chatbot; a person confirms every commit/send; **no "AI" or model name anywhere in the UI (R3)**; homeowner data to a model requires the privacy page updated (R4). **V22**: draft-first, designer approves.
- **Spec** `docs/specs/_active/client-portal-homeowner-usability.md` (CPUX-01–07, R139–R141, R202, A1–A7, F1–F8): purpose sentence on arrival; link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as page furniture (no fixed header/tabs/bottom bar); all invoices visible in four groups; 16px body, ≥15px money/dates/names, 44px targets, 48px final act; status in words, no red; 360/390 + 200% zoom; forest fill on final acts carrying an amount and on selected approval choices (A1), consequence note above; forest ink for links, focus and selected states (A2); Send change request and Confirm pause are covered by A1; framed cards `#FFFDF9` / 1px `#C9C7BD` / 8px. Non-goals: no new route tree, dashboard, nav shell; nothing invented.
- **Brand voice**: no curated/luxury/seamless/elevated/bespoke/shop/AI-powered; no exclamation, emoji, testimonials, guarantees, sales CTAs; sensory material words; Midwest places.
- **v2 holds, unchanged**: no scrims, gradients or translucency over photographs; no preloader, carousel, parallax, pinned section or video; anchors and chapter order never move; no red; status in words.
- **Strains to put before the founders, not resolve in code**: (C1) shadows — A3/F4 allow, VISION §6/V9/V20 forbid; (C2) full-bleed photography — house sheet §A10 caps plates at 120px (amended in v2); (C3) delta-only auto-approve of editions whose prose did not change vs V22's "a person confirms every send"; (Q1) imagery above the first money/approval act (v2 form); (Q2) may maker names/provenance appear on the homeowner page (consent switch); (Q3) scroll-triggered reveals vs on-mount only; plus v2's **V2-1…V2-9** (decision cards below; V2-9 from review SQ-1572).
- **Fixtures (US-44 brief; no real people)**: Birchwood Studio, Madison WI · Maren Holt (608) 555-0148 · June & Arlo Brennan ("Prepared for June Brennan") · Elm Street House (Procurement; next Living room installation; target 22 January 2027) · Lake Cottage · six invoices $1,375.00 (INV-2026-014 $600 past due 25 Sep; -019 $100 due today; -017 $300 of $800 due 2 Nov; -022 $250 due 14 Nov; -023 $50 due 30 Nov; -024 $75) · "Living room sofa, edition 2" $7,480.00 (oatmeal performance linen replaces wool bouclé; arm 26→24 in; +2 weeks; nine weeks from fabric order) · walnut sideboard "In production" at a fictional maker (Harmon Bench Works, Dayton OH — reuse from the Single Pane fixture) · Maren's update 16 October 2026 · paint makers Halvorsen and Larkin Prairie (fictional, F9).

## The concept: The House Issue

**One sentence:** the homeowner's page becomes a single-issue magazine about one house, photographed and written by the studio, printed by Patina, and re-set as the job moves; Claude is the art director on the press floor (chooses, crops, captions from record facts, names chapters, pulls palette), never the painter, and never named.

**Promise to June:** *Open this and see your own house arriving, piece by piece, in the studio's own pictures, with every ask sitting exactly where it belongs.*

**v2 thesis (Designer A spine):** every chapter opens on the strongest image the job owns — a photograph, a drawing, a board or a run of material samples — and the words come in runs of 20–70 between pictures, like a magazine spread about one house. No ink ever sits on photograph pixels; the only object over a plate is the opaque paper tab at 390 and 1440, which is page furniture, not a scrim (V2-2, R-v2-2).

### Three ideas that make it more than a restyle
1. **The job supplies the art.** Every plate is an asset the job already owns, ranked per R142. Imagery scale grows with the job: boards lead in Design, maker workshop photographs of her piece in Procurement, the first installed photograph in Installation, the studio's finished photograph at close. A job with zero photographs is still a complete page: the drawn cover (key plan at full measure on stock, swatch strip, pieces as inset plates or silhouettes), never filler.
2. **A per-job edition record, composed by Claude, approved by the designer.** A background job composes an *edition* (hero pick, chapter headlines + standing sentences; chapter order is fixed and never composed) from the job's facts and images; image perception (focal point, subject box, flags, alt) lives on the image's asset record, once per sha256. It lands `awaiting_review` in the designer's Document and only an `approved` edition reaches the homeowner. What is deterministic stays code (image rank, quality floors, ground test, crop geometry, caption what·whose·when from record fields, palette extraction, contrast, tab fallback, layout template).
3. **The page re-composes only when the job moves, and the ground never shifts.** Letterhead, purpose sentence, link row, standing rows, anchors, invoice groups, chapter order never move. The hero plate, chapter headline, and plate tint may change — once a day at most, only on designer approval — and Maren's letter opens with the notice in her voice: *"The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was."* "Since yesterday" absorbs the change as one unit.

### The designer panel (v2): why the losers lost
- A's 97%-viewport photograph at y=0 with the letterhead on it fails V9 P1 and reads as the wrong website to a low-confidence payer arriving from an invoice email → letterhead + purpose sentence first, then a 340px bleed.
- A's 40px letterhead → 96px (spec h1 24/28 + two 15px lines).
- C's purpose sentence below the hero → stays above it (CPUX-01: orientation before image).
- C's 12px captions → 15px (spec ≥15px floor for dates and names).
- A's `drawing` source kind → B's enumerated `source_kind` with `sheet`, plus the vector key plan.
- A's four new boards → one (Drawings-and-Materials); Arrival-Measured becomes y-rulers on the Main-A, Main-B and desktop boards (R-v2-1 splits Main); Image-Ledger folds into Credits.
- A's missing board placeholder → a CSS collage, no fetch.
- B's "maker photos never bleed" → narrowed to catalogue/brand photos; a workshop photograph of her own piece is job imagery per R142.
- v1's 16:10 hero at every width and standing-line-first 390 arrival → superseded (Rulings ledger R-a, R-c, R-o).

### Arrival composition at 390 (v2; first screen 0–740; Safari-with-toolbars line 664)
| y | Element |
|---|---|
| 0–96 | Letterhead: "Birchwood Studio" 15px mono · h1 "Elm Street House" Playfair 24/28 · "Prepared for June Brennan" 15px. Not fixed. |
| 96–140 | Purpose sentence 16/22, two lines at 390: "Pay invoices, review approvals, and follow your project here." |
| 140–480 | Hero plate full bleed 390×340 (`margin-inline:-16px`, never `100vw`), `fetchpriority=high`, box reserved by width/height + `dominant_hex` fill, the only eager image |
| 436–552 | Paper tab, opaque `#FAF7F2`, 116px tall, x 0–310, cut 44px into the plate's bottom-left; eyebrow `01 · ELM STREET HOUSE · PROCUREMENT` (12px DM Mono 500, 0.12em) + h2 "The living room is on its way" (Playfair 34/34, ≤2 lines). Page furniture, not a scrim: 100% opaque, ink measured on paper (`#2C2926` on `#FAF7F2` ≈ 13:1). |
| 564–608 | Caption DM Mono 15/1.45, ≤2 lines, what · whose · when: "Walnut top, planed · Harmon Bench Works · 15 October 2026" |
| 616–660 | Standing row 1 (44px block link): "$600.00 is past due since 25 September." → `#letterbox` |
| 660–704 | Standing row 2: "One approval waits: the living room sofa." → `#approvals` |
| 704–748 | Standing row 3: "Six invoices are open, $1,375.00 together." → `#ledger` |
| ≈764–852 | Link row after a 16px gap, two rows of 44px targets, F3 order |
| ≈876– | `#doorstep` heading, past-due card, consequence note, forest Pay act 48px ≈1090–1140 (screen two) |

These values were corrected after the canvas executor measured the frame (SQ-1570); its submit report carries the final link-row, doorstep and Pay positions, which is why those three are approximate. In-frame captions on the arrival boards carry no "placeholder" suffix; that note lives in a board annotation and on the Credits board.

**Invariants (canvas check enforces):** row 1 top ≤ 620 (hard fail > 664); row 3 top ≤ 740; hero height 340–380; no text over photo pixels except on the opaque tab; hero not focusable; first Tab stop after the letterhead = standing row 1. 360px: plate 360×314. 200% zoom: tab `below`. Tab fallback per image, computed in code from the 48px rendition's bottom-left 310×44 zone: `notch` | `hairline` (zone contrast vs paper < 1.3:1 → 1px `#C9C7BD` rule on the tab's top and right edges) | `below` (edge density above threshold, focal point inside the zone, or container < 320 CSS px). Standing rows are 44px block links that wrap rather than truncate; they replace v1's inline standing line, whose 24px line missed the 44px target. **Three standing rows always (R-v2-13):** every arrival, at every width and in every phase, shows all three rows in the fixed role order (`#letterbox`, `#approvals`, `#ledger`); a row with nothing to report states its zero state in words ("Nothing new since your last visit" / "Nothing waiting on you" / "No invoices open"). Roles and order never change by phase.

**Reading and focus order (Designer C):** letterhead, h1 → h2 cover headline (placed by grid rows, not `order`) → hero figure → rows 1–3 → purpose sentence is above the hero in DOM and visual order (it stays under the doorplate, CPUX-01) → nav "On this page" → `#doorstep`. The hero is not focusable, so June's first Tab stop is "$600.00 is past due".

**Phone crop (settled in review SQ-1572, R-v2-6):** the `cover_phone` crop matches the 390×340 box: 39:34 (≈1.147), with a 2× floor of 780×680.

### Arrival composition at 1440 (v2; 900px window)
| y | Element |
|---|---|
| 0–96 | Top band: letterhead left (Birchwood Studio · Elm Street House · Prepared for June Brennan); purpose sentence + link row right (44px targets); 1px hairline at 96 |
| 104–752 | Hero full bleed 1440 × min(72svh, 648); crop 16:10 (`wide`), `object-position` from the stored focal point. If the standing rows cannot meet the rule below, the hero shortens to 1440×600 before anything else moves. |
| plate's bottom edge | Paper tab, the same opaque device as 390, cut into the plate's bottom edge: eyebrow + one-line Playfair 64px h2 (does not wrap at the 1248 measure) |
| below the tab | Caption DM Mono 15px |
| top ≤ 880 | Standing rows: three 44px links in the fixed order (past due · approval · invoices open) |
| after | Chapter 02 begins |

**Invariant (R-v2-2):** at 1440 the standing rows' top is ≤ 880px page-relative, and the check fails outright above 900. The positions under the hero are measured on the canvas board, not estimated here. **Portrait-only hero:** the desktop portrait template (4:5 across 5 of 12 columns ≈520×650 beside the headline; source ≥1040 wide); phone `tall`. Never letterbox, blur-fill or upscale.

### Chapters (anchors preserved; bare numerals in DM Mono as wayfinding; eyebrows carry the spec's literal heads per A7, the Playfair headline sits beneath)
Status in words sits **above** every plate in DOM and visual order; the caption sits below.

| # | Anchor | Eyebrow | Headline (studio voice) | Opens on, then |
|---|---|---|---|---|
| 01 | new, above `#doorstep` | 01 · ELM STREET HOUSE · PROCUREMENT | *The living room is on its way* | Hero by phase: Design = board cover; Procurement = workshop photograph of her piece (*Walnut top, planed · Harmon Bench Works · 15 October 2026*); Installation = first installed room photograph; Closed = the studio's finished photograph. Then the three standing rows, all three in every phase in the same order, a zero state in words when a row has nothing to report (R-v2-13). |
| 02 | `#doorstep` `#ledger` `#letterbox` | 02 · INVOICES | *Six invoices, $1,375.00 together* | No picture: the one quiet chapter. Four groups, written states, "Total outstanding $1,375.00". |
| 03 | `#approvals` | 03 · APPROVALS | *Waiting for your approval* | Pair plate (sofa photograph + oatmeal linen sample), ~30 words, the three changes (linen replaces bouclé, arm 26 to 24 in, two weeks added), consequence note, forest 48px Approve $7,480.00 with staged consent. |
| 04 | `#key` | 04 · THE HOUSE | *Three rooms, read from the front door* | Floor plan drawing (sheet, never cropped) with room-name links in a column beside it; the drawn SVG plan is the fallback. |
| 05 | RoomBand ids | 05 · LIVING ROOM | *Walnut, linen, and a lot of light* | Chapter plate "as measured" (*Living room, as measured · photographed by Birchwood Studio · 2 June 2026*), ~40 words, material run, ~20 words, piece run with status words, concept render at 6 columns with its chip. The one held plate on the page lives here. |
| 06 | RoomBand ids | 06 · STUDY | *Oak, brass and lime plaster* | Material run from the study board, each captioned from Birchwood Studio's study board. |
| 07 | RoomBand ids | 07 · ENTRY | *One line* | One line of words and the swatch strip (Halvorsen, Larkin Prairie). |
| 08 | `#road` | 08 · PROGRESS | *In production, then on the truck, then here* | Pair: the maker's shop drawing + the workshop; labels in words NOW *In production* · MAKER *Harmon Bench Works, Dayton* · TARGET *22 January 2027*. No counts. |
| 09 | `#note` | 09 · UPDATES | *A note from the studio, 16 October* | Maren's lead line, then the photograph she mentions at 4:5 (520×650), then the reply. |
| 10 | `#previously` `#changed` | 10 · EARLIER | *What has already been settled* | Text only; "Edition 4 · approved by Maren · 21 October" lines. |
| 11 | `#mat` | 11 · DOCUMENTS AND CONTACT | *Who to call, and the documents* | Document covers (drawing set, shop drawing; the whole cover is the link); portrait only if uploaded; "Lake Cottage, the next issue" as a cover, not a sales prompt; colophon. |

Rhythm rule: never two plates in a row; 20–70 words or a chapter head between any two pictures. Scroll budget (Designer C): cover ≤740; room chapters ≤2.5 screens, except the one chapter carrying the held plate, which may run 3.75 screens (3,375px at 390; V2-9); Progress ≤1.5 screens; Invoices, Approvals, Updates and Earlier as long as their content needs, with no plate taller than 7:5.

### Image plate grammar (v2: nine plate types, plus three carried from v1)
This section is the authority for the plate enumeration (R-v2-4). The nine types, in order: Hero, Chapter plate, Held plate, Drawing or sheet, Board, Material run, Pair, Piece, Document cover. Concept is a Room-plate state, not a type.
All plates: `figure` + `img alt` + `figcaption`; 1px hairline `#E8E3DB`; caption DM Mono **15px** (15/1.45; V2-4 supersedes 12px) `#4E4339` as **exactly three stored fields** what · whose · when; a qualifier ("Placeholder, not job imagery.", "Not her piece; hers is in production.", "Photograph to follow.", "Picture did not load.") is a separate second line in its own `plate-note` element, never a fourth segment (R-f, R-v2-7), and the concept mark is the on-image chip; caption under the plate, never on the photograph; the job palette tints only a 4px rule under the frame, never the ground behind the image. Plates never carry `data-dimmable` and never sit inside a padded since-yesterday unit; the hero renders between the doorplate and `SinceYesterday`, where `ArrivalLine` sits, so it never dims.

| # | Plate | 1440 | 390 | Rules |
|---|---|---|---|---|
| 1 | Hero | 1440×648 bleed | 390×340 bleed | One per page. Eligible: installed photograph, scan ≥ floor, studio board (re-rendered 2400×1600), shared sheet or key plan (drawn cover), photograph of her own piece wherever taken. Never a concept render, never a catalogue or brand photograph. |
| 2 | Chapter plate | 1248×648 | 390×488 | At most one per chapter. |
| 3 | Held plate | — | 390 × min(780, 100svh − 72) | One per page, living-room chapter only, never sticky, never dimmed, never in Invoices or Approvals. The −72 keeps the plate's bottom edge and first caption line on screen together. |
| 4 | Drawing or sheet | 772×648 whole on stock | 358×300 | Never cropped (a cropped drawing misstates its scale); the whole drawing links to the PDF in `#mat`; alt built in code ("Sheet A-201, living room elevations"). |
| 5 | Board | 832×624 | 358×268 | Never cropped; re-rendered at 2× at Approve. Canvas placeholder is a CSS collage. |
| 6 | Material run | three 400×533 | two 171 squares + one 358×171 | Samples and site details. |
| 7 | Pair | 784×560 + 440×560 | 390×279 + 140×175 | Only in `#approvals` and scope-change asks (and the Progress pair in 08). |
| 8 | Piece | 4 × 282 | 2 × 171 | White-ground photograph `contain` with 10% inset; a 16px name + status line under every tile. Catalogue caption: *Walnut sideboard, the same model · from Harmon Bench Works' catalogue · photographed 2025*, `plate-note` second line *Not her piece; hers is in production.* |
| 9 | Document cover | 282×376 | 171×228 | The whole cover is the link. |
| — | Concept render (carried) | ≤ 612 (6 cols) | 358 inset | Concept is a Room-plate state, not a type: a room's concept render carries the ≥14px opaque chip "Concept · not installed" (`#FFFDF9`), the R142 exception. |
| — | Swatch strip | as v1 | as v1 | 40×40 from `project_palettes`, labelled with paint brand and name. |
| — | Silhouette | as v1 | as v1 | Drawn footprint; "Photograph to follow." second line; the load-failure fallback ("Picture did not load."). |

**Alt** = what is visible (≤125 chars, never "image of", never provenance), e.g. "Walnut sideboard on a workbench, doors open, shavings on the floor". The caption carries provenance. This replaces v1's "alt = first two caption segments + source kind", which made screen readers read provenance twice.
**Word budget:** headline ≤ 8 words; 20–70 words between pictures; standing rows ≤ 30 words together.
**Type (1440 / 390):** display 64/1.0 (one line on the 1440 tab, R-v2-2) · 34/1.0; chapter head 48/1.08 · 30/1.1; lead 24 · 18; eyebrow 12 DM Mono 500, 0.12em; caption 15/1.45; body 16/1.55.
Paper grain is CSS `feTurbulence` at 3% on the page, never on images.

### Image system (Designer B §2–§7)
**Source kinds:** `upload | installed | scan | board | sheet | maker | concept`. **Rank:** installed > studio-made (scan, board, sheet, upload) > maker photograph of the specified piece > catalogue (piece/pair only) > silhouette.

**Source inventory (prod not queried; per-job counts unmeasured until V2-8):**
| Source | Table / bucket | Quality | Hero-scale? | Evidence |
|---|---|---|---|---|
| Retailer item photo | `project_ffe_item_images` `source='library'`, hotlinked `url` | No width, height, alt or ground; ~35 backfilled items in prod | Rarely; white ground fails | 00807:140-147, :35-41; room-band.tsx:507-513 |
| Studio upload | same table, `source='upload'`, `storage_path` in the **public** `project-item-images` bucket | No kind field: product, workshop and site photos are indistinguishable | Yes, if it passes the floors | 00807:113-118, :144 |
| Concept render | `project_rooms.concept_render_url`, private `room-renders` | At most one per room | Never (R142) | 00580:56, :73-80 |
| Scan still | `room_scan_images`, private `room-scans`, 512px thumb + 1600px preview | Up to 10 per scan | Desktop no; phone room/held borderline | 00032:20-43; 00340:9-19 |
| Studio board | `project_boards.cover_image_url` + `items` | Cover is 800×600 PNG; 2× export gives 2400×1600 | Re-rendered plate yes, uncropped | 00179:80-99; painter.ts:15-21, :84-97 |
| Drawing sheet | `plan_sheets` (`shared`) → `plan_prints` → `project_documents` PDF | One set per job; no raster today | Yes, rendered with pdf.js, never cropped | use-plan-room.ts:628-717; pdf.ts:111 |
| Key plan | computed SVG | One | Yes, vector | plan-key.tsx:15-52 |
| Palette | `project_palettes.swatches` | 4–8 | Swatch strip only | — |
| Vendor banner | `vendors.hero_image_url` | Brand imagery | No; treated as stock | 00034:6-7 |
| Installed photo | no such kind exists | — | — | 00807:144 |

**Reuse:** `project-review-media` copy + dimension read (lib.ts:326-470, content-addressed 00546); the media worker's six widths (256–2048) WebP/AVIF + blurhash + dominant (container/server.mjs:18, :67, :104-109). **Do not reuse** designer-portal `generateSrcSet` (media-utils.ts:311): it appends `width=` to `/storage/v1/object/` URLs, and only `/render/image/` resizes, so every srcset entry it builds is the full-size original.

**Floors and crops** (device px after the crop; below a floor the plate drops one role; never upscale):
| Role | Target | Hard floor | Crop |
|---|---|---|---|
| Hero, desktop bleed | 2048×1280 | 1600×1000; 1248–1600 wide → 1248-measure plate; <1248 not a hero | `wide` 1.6 |
| Hero, phone cover | 1080×942 | 780×680 | `cover_phone` 39:34 (≈1.147) |
| Held plate, phone | 1080×2348 | 780×1696 | `tall` 0.46 |
| Chapter / room plate | 2048×1365 | 1248×832 | `wide32` |
| Pair plate | 1224 | 716 | `pair` |
| Piece plate | 564 / 495 | 330 | contain, 10% inset, white ground allowed |
| Sheet plate | 2496 wide | 2048 | none |
| Board plate | 2400×1600 | 1600 | none |
Rules (all code): `ground='white'` from border-pixel variance → piece/pair only; a crop discards at most 50% of the source and contains the whole subject box, centred on the focal point; focal + subject box stored once per sha256, normalised 0–1; under the 72svh clamp `object-position` comes from the crop rectangle's centre.

**Asset record and edition changes:**
```sql
CREATE TABLE public.client_plate_assets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_kind text NOT NULL CHECK (source_kind IN
    ('upload','installed','scan','board','sheet','maker','concept')),
  source_ref jsonb NOT NULL,            -- {table,id}: item image | scan | board | plan_print
  original_key text NOT NULL,           -- private, copy-once
  width int NOT NULL CHECK (width > 0), height int NOT NULL CHECK (height > 0),
  ground text CHECK (ground IN ('white','scene','drawing')),   -- code
  dominant_hex text, lqip text CHECK (length(lqip) <= 800),    -- code
  subject_box numeric[] CHECK (cardinality(subject_box) = 4),  -- model or designer
  focal numeric[] CHECK (cardinality(focal) = 2),
  flags text[] NOT NULL DEFAULT '{}',   -- model: watermark | people | text_overlay
  crops jsonb NOT NULL DEFAULT '{}',    -- code: {wide:{rect,widths}, cover_phone:…, tall:…}
  perceived_prompt_version text,
  UNIQUE (project_id, sha256)
);
ALTER TABLE public.client_edition_images
  ADD COLUMN asset_id uuid NOT NULL REFERENCES public.client_plate_assets(id),
  ADD COLUMN plate_role text NOT NULL CHECK (plate_role IN
    ('hero','room','held','pair','piece','sheet','board','plan','swatch','silhouette')),
  ADD COLUMN crop_key text NOT NULL DEFAULT 'none';
```
v1's per-image `blurhash`, `dominant_hex` and `focal` move off `client_edition_images` onto the asset. `composition.hero` = `{assetId, desktop: 'bleed'|'measure'|'portrait', phone: 'cover_phone'}`.

**Call A becomes two small calls:**
- **A1 perception** (Sonnet 5.5 high, vision): only assets with no `perceived_prompt_version`, ≤8 per call at 1024px long edge → `{images:[{index, subject_box[4], focal[2], flags[], alt≤125}]}`. Validator rejects a focal point outside the box, a box under 5% of the frame, unknown flags, and alt containing "AI", "generated" or "image of".
- **A2 hero pick**: ≤6 code-eligible candidates at 512px (≈233 tokens each) + facts → `{hero:{index, why≤140}, held:[≤2]}`; only inside the highest R142 tier that has an eligible plate; any other index is rejected.
- Calls B (headlines + standing sentences) and C (voice lint) are unchanged from v1.

**Never sent to the model:** drawing sheets (title blocks carry the site address and household names; prompt allowlist, R4; alt built in code); boards (alt = board name); photographs of her home — scans, installed photos — until the client privacy page ships (V2-5; until then code crops, centre with a thirds bias, plus designer drag). **Stays in code:** rank, floors, ground test, crop geometry, caption, palette (k-means on the LQIP), contrast, tab fallback, layout template. **Designer override:** in the Press band, a focal point dragged on two frames side by side (16:10 and 39:34) writes `subject_box`/`focal` with a `designer` origin; code recomputes crops; overrides persist per sha256.

**Serving:** one private R2 copy at `plates/{project_id}/{sha256}/{crop}-{w}.{avif|webp}`; crops made by the media-worker container (Sharp `extract` + resize, a small change to `generate_renditions`), callback writes `crops` via a lease-checked RPC. Plates are served through the client-portal Worker's R2 binding at `/plates/{editionId}/{sha256}/{crop}-{w}.avif` (R-v2-8): the path carries the edition id and the content hash (in Phase 1, which has no edition record, the project id stands in the edition segment). Each request runs the session check and `client_can_read_plate`: in Phase 1 that is project membership through `get_client_project_editorial`; from Phase 2 it is the approved edition only, through `get_client_project_edition` (R-v2-9). The response carries `Cache-Control: private, max-age=3600`, never `immutable` and never a year. A superseded or revoked edition's paths stop resolving at the next request, and the browser's copy expires within the hour. After logout or when her access is revoked, every plate request fails the session or membership check, so nothing new is served, and anything already in her browser's private cache is gone within the hour. Nothing public; R2 egress free.
| Plate | Widths | `sizes` |
|---|---|---|
| `cover_phone` / `tall` | 640, 828, 1080, 1242 | `100vw` |
| `wide` | 1280, 1600, 2048, 2560 | `100vw` |
| Room / pair / sheet / board | 768, 1024, 1600, 2048 | `(min-width:1296px) 1248px, calc(100vw - 32px)` |
| Piece | 256, 512, 768 | — |
`<picture>` with an art-directed `<source media="(max-width:600px)">` for the phone crop; AVIF q50 then WebP q72; `width`/`height` always set (layout shift 0). Placeholder: `dominant_hex` frame background + inline LQIP ≤800 B (24px wide, CSS-blurred); blurhash is not decoded on the client. The plate read (Phase 1 `get_client_project_editorial`, from Phase 2 the approved edition) runs on the server so the hero `<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">` is in the SSR HTML. **Targets** (Lighthouse mobile, 390, slow 4G 1.6 Mbps / 150 ms): LCP ≤ 2.5 s first visit, ≤ 1.0 s return. **Budget:** hero ≤ 120 KB, critical HTML+CSS ≤ 60 KB, Playfair display subset ≤ 40 KB, every non-hero plate `loading=lazy`. Estimates; measured on the Phase 1 build. Supabase `render/image` rejected: per-origin-image billing unverified on Strata, and it cannot crop to a focal point.

**v1 defect corrected:** v1 copied plate images into `project-item-images`, a **public** bucket (00807:113-118), which would republish makers' photographs at public URLs while v1's risk list said "private bucket". In v2 plate copies never go to `project-item-images`; they go to the private R2 prefix above.

**Failure modes and the designed answer:**
1. Two mediocre white-ground retailer photos → neither can be a hero; the drawn cover (key plan at full measure on stock, swatch strip, photos as inset piece plates); Press band says "The cover is a drawing until a photograph arrives" with one upload slot. This is also the Empty-Issue.
2. A hotlink dies → bytes copied once at add/compose; editions never render a hotlink; a failed copy (403, hotlink protection, >10 s, >20 MB) makes no asset and the piece gets a silhouette; the nightly check stays only for library rows not yet copied.
3. Portrait-only photograph on desktop → portrait template (4:5, 5 of 12 columns); phone `tall`. No letterbox, no blur fill.
4. Undersized scans or boards → scans drop to chapter plate; boards re-rendered at 2× in the designer's browser at Approve with the existing painter (a 2560px scan derivative would need a new size in `derive-scan-photo-media`, 00340).
5. Wrong model crop → validator catches impossible boxes; designer drag on both frames; persisted per sha256.
6. Reader failure or slow network → the page renders without the cover; letterhead, standing rows and money acts stay, so a picture never blocks a payment.

### Motion
Image settle on load (scale 1.015→1 + opacity, 400ms, caption +120ms); chapter head reveal **on mount only** (opacity + 12px rise, 360ms, max three staggered children); easings `cubic-bezier(0.16,1,0.3,1)` 300–400ms (B11); hold stays 900ms. **Reduced motion (v2):** no scale settle, no plate fades (the image appears when it loads), no reveals; the hold timing is kept. **Refusals R1–R11** from the inspiration sheet stand: no preloader, smooth-scroll hijack, pinned scenes, scrubbed parallax, carousels/marquees, counters, type on photographs over a scrim, sub-floor sizes, fixed/hide-on-scroll headers, video heroes, renders or lifestyle people at hero scale, sales calls to action, script faces or lettered lockups.

### Founder decision cards (the HTML doc presents these; this plan recommends)
- **C1 shadow** — recommend none; hairline + stock-on-paper step is the only depth; amend A3/F4.
- **C2 full-bleed photography (amended in v2)** — proposed ruling (R-v2-5): "Photography on the homeowner page may bleed edge to edge; no image exceeds 72% of viewport height, except the single held plate per page, which may reach min(780px, 100svh − 72px); the letterhead and purpose sentence above the first image; a shared sheet or the key plan may be the cover when no photograph meets the floor; one hero per page and at most one chapter plate per chapter; eligible only job-made images (V2-1); concept renders stay ≤612px with the mark; the 120px cap continues to govern designer and admin surfaces." Recommend yes.
- **C3 delta-only auto-approve** — recommend allowed only when no prose call ran (plates changed, words unchanged), per project opt-in; otherwise V22 holds.
- **Q1 imagery above the first money act (v2 form)** — the fact being ruled on: at 390 a 340px hero (140–480) sits above the first money fact; standing row 1 at ≈616; the forest Pay act at ≈1090 on screen two. Recommend yes, with standing row 1 top ≤ 620 as a hard gate (fail > 664). The v1 order (standing line at 228–276 above a 358×224 hero; Pay ≈905) is the recorded fallback.
- **Q2 maker names on the homeowner page** — recommend one provenance line (maker · town · in production since · photographed when) behind a per-project `show_makers` switch; no brand stories (a third voice on Maren's letterhead).
- **Q3 scroll reveals** — recommend on-mount only (motion above).
- **V2-1 which images may bleed** — only job-made images bleed (uploads, installed, scans, boards, sheets, photographs of her own piece wherever taken); catalogue and brand photographs stop at pair and piece plates (licensing; the page reads as her house, not a catalogue). Recommend yes.
- **V2-2 the paper tab** — the opaque paper tab at 390 and 1440 (R-v2-2) is page furniture, not a scrim (`notch` | `hairline` | `below`). Recommend yes.
- **V2-3 link row below the standing rows at 390** — amends CPUX-01.2/F3; the purpose sentence stays under the doorplate. Recommend yes.
- **V2-4 captions 15px** — supersedes the brief's 12px; at 390 captions run two lines. Recommend yes.
- **V2-5 photographs of her home to the model for crop perception** — only after the client privacy page ships (R4); until then code crops + designer drag. Recommend yes.
- **V2-6 crop/serving lane** — build the media-worker crop lane + private R2 + client-portal R2 binding now (M), versus CSS-only crops until the `svc_media` reconciliation. Recommend build now: CSS `object-position` can hold a stored focal point, so focal preservation is not the reason; the server rendition lane is justified by the bytes transferred (CSS crops ship full-size originals to phones) and by cropping to the 39:34 and 20:9 boxes at source.
- **V2-7 held plate** — one per page, never dimmed, never in Invoices or Approvals; one line in the since-yesterday contract. Recommend yes.
- **V2-8 pre-measurement** — one aggregate over `project_ffe_item_images` by source and host, plus header dimensions via `project-review-media` in dry-run, before sizing Phase 1. Recommend yes.
- **V2-9 chapter budget amendment (from review SQ-1572, R-v2-3)** — the 2.5-screen chapter budget stands, except the one chapter carrying the held plate may run 3.75 screens (3,375px at 390). Why: the held plate was ruled in V2-7 after the budget was written, and a plate up to 780px tall cannot fit a 2.5-screen room chapter beside its words, material run and pieces. Recommend yes.

### The Claude layer (honest split, v2)
| Task | Who | Notes |
|---|---|---|
| Image rank (R142), floors, ground test | code | source kind + item status + render presence + pixels |
| Crop geometry, tab fallback | code | largest box of the target aspect containing the subject box; 48px rendition for the tab zone |
| Caption what · whose · when | code | item name · vendor/studio · date; the model never invents provenance |
| Palette extraction | code | k-means on the LQIP (port of `ImagePaletteExtractor`) |
| Contrast check | code | WCAG math; fail → ink on paper |
| Layout template per chapter | code | templates by image count/aspect; portrait template |
| **Perception: subject box, focal, flags, alt** | Sonnet 5.5 high, vision (Call A1) | unperceived assets only, ≤8 per call at 1024px; stored per sha256 |
| **Hero pick** | Sonnet 5.5 high, vision (Call A2) | ≤6 code-eligible 512px candidates; inside the top R142 tier |
| **Chapter headlines + standing sentences** | Sonnet 5.5 high, text (Call B) | `{chapters:[{key,headline≤60,standing≤160}], doorstep:{…}}` |
| Voice lint | regex on `marketing/canon/lexicon.json` + Haiku judge (Call C) | one regeneration naming the term; second hit → deterministic headline |
Request shape copies `buildDraftRequest` (cached system block = voice rules + lexicon + caption form + schema). Validator rejects: refusal, truncation, out-of-range focal, any "AI"/"generated" string, length, contrast. Prompt allowlist test fails on `site_address`, household names, prices, `project_notes`.
**Record**: `client_editions` (status drafting → awaiting_review → approved → superseded; `source_hash` debounce; `composition`, `facts`, `overrides` jsonb; lease fields), `client_edition_images` (v2: `asset_id`, `plate_role`, `crop_key`, rank, alt, caption triplet), `client_plate_assets` (above), `client_edition_requests` (30-min debounce inbox). Writers: edge fn via lease RPCs; designer RPCs approve/hold/override; reader `get_client_project_edition` (approved only, overrides merged, plate URLs through the client-portal Worker route; allowlists name-as-signed, makerName, madeIn, material, finish, dimensions, descriptionAsSigned ≤280; never prices/SKU/notes). Triggers: item image insert/primary change, item status → delivered/installed, phase change, concept render set, palette change, authorization signed, project closed. Cap 2 editions/day/project; a new draft supersedes an unreviewed one.
**Designer loop**: a Press band in the job's Document between the client mirror (`apps/designer-portal/src/components/document/client-mirror.tsx`) and the note composer; preview renders inside the mirror; Approve / Hold / Edit (picker for every chapter opener, inline headline/standing, caption whose/when, focal drag on two frames; chapter order never moves). No "regenerate" button. Desk card gets one line, not a card. Band copy: "A new edition is ready" — never why.
**Images**: see Image system. Copy-once into the private R2 prefix through the media worker; served by the client-portal Worker route. Never `project-item-images`, never Supabase `render/image`.
**Cost v2** (rates from `claude-models.ts:35-38`, Sonnet $2 in / $10 out, cache read ×0.05; image tokens ≈ w×h/750):
| Edition | A1 | A2 | B | C | Total v2 | v1 |
|---|---|---|---|---|---|---|
| First (15 images) | $0.045 | $0.010 | $0.024 | $0.001 | ≈ $0.08 | ≈ $0.08 (Call A $0.05) |
| Later, 3 new images | $0.009 | $0.010 | $0.024 | $0.001 | ≈ $0.045 | ≈ $0.08 (every image re-sent) |
| Plates only (no Call B) | | | | | ≈ $0.02 | n/a |
| Per active job-month (1 first + 3–8 later editions) | | | | | $0.215–$0.44 | $0.32–$0.72 |
| Infrastructure per job-month | | | | | ≈70 MB R2 + ~300 writes + ~30 vCPU-s < $0.01 | Supabase `render/image`, billing unverified |
**Workload (R-v2-10):** one active job-month is 1 first edition (≈$0.08) plus 3–8 later editions (≈$0.045 each), so $0.08 + 3 × $0.045 = $0.215 to $0.08 + 8 × $0.045 = $0.44 per job-month; 20 active jobs ≈ $4.30–$8.80 a month. The v1 column is recomputed on the same workload (4–9 editions at ≈$0.08).
`llm_feature_controls` row `client-edition-compose` daily cap $5 under the $25 global cap; the $50/studio/month cap holds.
**Flag + rollout**: PostHog `client-edition-page` via `useFeatureFlag` (fail-closed); target by distinct_id, not email_domain (client accounts are gmail aliases); server side `llm_feature_controls` disabled by default, `llm_studio_overrides` enables Middle West Studio first; kill switch stops composition while approved editions keep rendering.

### Delivery phases (v2; recorded in the doc; none built in this story)
Migration numbers are indicative; reserve them at build time.
- **Before Phase 1 — pre-measurement (V2-8, S).** One aggregate over `project_ffe_item_images` by `source` and URL host, and header dimensions via `project-review-media` in dry-run. The result sizes Phase 1's floors and the share of jobs that open on the drawn cover.
- **Phase 1 — editorial restyle on today's data + crop/serving lane (M→L, no model calls).** Phase 1 has no edition record (R-v2-9): 00842 `get_client_project_editorial` is the plate reader, guarded by project membership, reading today's tables (item images, concept render, scans, palette, board covers) with the facts allowlist (gated on `show_makers`), + designer RPC for the switch; 00843 `client_plate_assets` (code-computed fields only: sha256, kind, dimensions, ground, dominant, LQIP, crops) + `client_can_read_plate` (project membership in Phase 1) + the lease-checked crop callback RPC; media-worker crop lane (Sharp extract + resize → private R2 `plates/…`) and the client-portal Worker route through an R2 binding (V2-6); the editorial read on the server for the hero preload; `threshold/editorial/` components (the nine plates + concept/swatch/silhouette, paper tab with `notch|hairline|below`, three standing rows, caption triplet at 15px, provenance line); code crops (centre, thirds bias); chapters keyed on rooms; anchors unchanged; flag `client-edition-page`. Plate copies never go to `project-item-images`. Tests: jest on rank, floors, ground, crop geometry, tab fallback, caption, contrast; `threshold.spec` anchors; `homeowner-usability.spec` + hero, standing rows (row 1 ≤ 620 at 390), first Tab stop, 200% zoom tab `below`. Gate: `pnpm --filter @patina/client-portal type-check && pnpm --filter @patina/client-portal test && pnpm --filter @patina/client-portal test:e2e`, plus the media-worker container's crop tests (named at build).
- **Phase 2 — edition record, composition, approval; perception moves onto the asset record (L).** 00844–00846 tables/triggers/requests, `client_edition_images` asset columns, lease RPCs + dispatcher + feature row, reader `get_client_project_edition` (the approved-edition-only read begins here) + designer RPCs; edge fn `client-edition-compose` (`callClaude`, `promptVersion 'e1'`) with Calls A1 (writes `subject_box`/`focal`/`flags`/alt/`perceived_prompt_version` on the asset), A2, B, C; Press band + mirror preview + focal drag + Desk line; board re-render at 2× at Approve; client reader hook; client-portal privacy page branch (R4; photographs of her home reach A1 only after it ships, V2-5). Deno tests for builder/validator/lint/allowlist (sheets and boards never in a prompt); jest for the band; e2e approve → homeowner sees. Gate adds `supabase/functions` deno test + designer gate.
- **Phase 3 — installed photo, close-out (M).** `installed` source kind from Field uploads; closing edition frozen with `portfolio_snapshot`; broken-link/403 → silhouette tests; close-out immutability; optional 2560px scan derivative in `derive-scan-photo-media`.
- **3-week cut**: pre-measurement + Phase 1 whole (including the crop/serving lane, if V2-6 is ruled "build now"; otherwise CSS-only crops) + Phase 2 narrowed to Call B only, hero by code (rank + floors, no A1/A2), code crops + designer drag, deterministic captions, Approve/Hold only, Middle West only. Copy-once into private R2 stays in.
- **Risks** (in the doc): retailer image licensing (private R2 copies, never `project-item-images`; catalogue photos never bleed, V2-1; maker named, consent switch, takedown list); voice drift (lint + judge + pinned prompt version + weekly sample); approval fatigue (2/day, debounce, delta diff, Hold); cost runaway (sha256 dedupe, caps, kill switch, lease); homeowner disorientation (approve-only changes, Maren's notice, edition line in Earlier); misreading a site photograph or render as her finished room ("as measured" caption, 6-column render cap); page weight (ladders, lazy plates, hero ≤120 KB, measured on the Phase 1 build); tab legibility on busy photographs (`hairline`/`below` fallback, measured on paper); accessibility regressions (computed contrast, validated alt, reduced motion, e2e a11y gate); prompt data leak (allowlist test; sheets and boards never sent); hotlink rot (copy-once at add/compose, silhouette on failure).

## Rulings ledger

The fifteen v1 review rulings were issued on SQ-1564's review and applied in SQ-1565 (commit 5ebb268d7, delivered as 74440353e). Their labels and content are recovered from the SQ-1565 closeout comment (c_mvi3edrz), which names each R-label with the finding it answers. All fifteen labels were recovered; none is reconstructed by guesswork. Review items 14–16 had no R-label, and items 18, 20 and 21 had no ruling.

| Label | v1 ruling (as applied in SQ-1565) | v2 status |
|---|---|---|
| R-a | Measured 390 arrival: 0–96–140–228–276–646, doorstep from 658, Pay ≈905; the standing line at 228–276 is the first-screen money act; the "inside 740" claim removed | superseded by v2 §1 (hero 140–480, standing rows 616–748, Pay ≈1090–1140) |
| R-b | The Q1 card states the fact being ruled on plus the ruling | stands (the fact is restated in v2 form, §7) |
| R-c | Hero 16:10 at every width; 4:3 removed | superseded by v2 §3 (390×340 bleed at 390; 16:10 `wide` at 1440 only) |
| R-d | Chapter order never moves; the Edit tray holds the hero picker, headline/standing fields and caption whose/when | stands |
| R-e | Eyebrows carry the spec's literal heads, plus the A7 note | stands |
| R-f | Captions are exactly three segments; examples replaced | stands (size superseded by v2 §3: 15px, V2-4) |
| R-g | Forest covers A1 and A2 (final acts with an amount, selected choices; links, focus, selected states) | stands |
| R-h | The 3-week cut matches PLAN; copy-once kept | superseded by v2 §5 (copy-once stays, into private R2, never `project-item-images`; the cut is restated in the v2 phases) |
| R-i | Full motion recipe in the doc and the Q3 card | superseded by v2 §6 (reduced motion: no settle, no plate fades, no reveals) |
| R-j | June's week dims opt-in units only | stands (v2 adds V2-7: plates are never dimmable) |
| R-k | Gate split into `type-check && test && test:e2e` | stands |
| R-l | Stacked tables at ≤760; vertical pipeline below 1100; no min-width scrollers | stands |
| R-m | SVG text sizes raised (min 11.44px at 390, 12.69px at 1440) | stands |
| R-n | check-doc rewritten: rendered-text model, attributes, the AI sentence rule, emoji, dark-theme CSS parsing, exact title, denominators | stands (v2 extends it) |
| R-o | 72vh cap: 1248×648 at a 900px-tall window | superseded by v2 §2 (full bleed 1440 × min(72svh, 648)) |

**Canvas rulings that v2 touches (SQ-1566, applied in SQ-1567 / 329e1ca14; F-labels, not R-labels).** The orchestrator's v1 summary also named these; they come from the canvas review, not the R-series.
| Label | Ruling | v2 status |
|---|---|---|
| F2 | Four CPUX-02 invoice groups with View invoice rows | stands |
| F3 / F4 | Staged approval consent: forest-outline choices, signature field, forest 48px Approve; Request changes and Pause frames | stands |
| F5 | Links are forest; no `#8B7355` | stands |
| F6 | Pay act "Continue to secure payment · [bank total from quote]" with the CPUX-03 note | stands |
| F7 | Main note carries the review values (228–276, ≈905) | superseded by v2 §1 |
| F8 | Desktop hero 1248×648 with cover fit | superseded by v2 §2 |
| F9 | Fictional paint makers Halvorsen and Larkin Prairie | stands |
| F10 | Pair plate is the maker photo plus the linen sample; paint moved to the swatch strips | stands |
| F13 | Credits board (author, Commons link, licence link, crop note) | stands (v2: Image-Ledger folds into it) |
| F14 | The hero picker offers only eligible sources, each labelled | stands (v2: picker for every chapter opener) |
| F18 | The doctype stays | stands |
F1, F11, F12, F15–F17 and F19–F22 are named in the SQ-1567 closeout only as "applied as ruled" or "oracle rewritten as ruled", without their content; they are not reconstructed here.

**Review SQ-1572 rulings (orchestrator, 21 October 2026; applied in the SQ-1573 canvas lane and the SQ-1574 doc lane).**
| Label | Ruling | Why |
|---|---|---|
| R-v2-1 | The canvas Main board becomes Main-A (arrival → living room) and Main-B (study → colophon), each ≤ 8,000px | Main measured 12,542px against an 8,000px frame, leaving six chapters outside it |
| R-v2-2 | At 1440 the standing rows' top is ≤ 880px page-relative (fail > 900), using the same opaque paper tab as 390 (eyebrow + one-line 64px h2); if infeasible the hero shortens to 1440×600 first | The desktop board measured the standing rows below the 900px fold |
| R-v2-3 | Recorded as V2-9: 2.5 screens per chapter, except the held-plate chapter may run 3.75 screens (3,375px at 390) | The held plate (V2-7) was ruled after the budget was written |
| R-v2-4 | The plate grammar above is the plate authority: Piece is a numbered type; Concept is a Room-plate state, not a type | Two authorities counted a different ninth type |
| R-v2-5 | C2 reads "no image exceeds 72% of viewport height, except the single held plate per page, which may reach min(780px, 100svh − 72px)" | The blanket 72svh cap forbade the held plate proposed beside it |
| R-v2-6 | `cover_phone` = 39:34 (≈1.147), 2× floor 780×680 | The phone crop must match the 390×340 box |
| R-v2-7 | Captions are exactly three segments; qualifiers are a separate `plate-note` second line, never a fourth segment | Qualifications were drifting into a fourth dot-separated segment |
| R-v2-8 | Plates are served through the client-portal Worker binding with `Cache-Control: private, max-age=3600` (never `immutable`, never a year); the path carries the edition id and content hash; superseded or revoked paths stop resolving at the next request | A year-long browser cache would outlive revocation and approval changes |
| R-v2-9 | Phase 1 has no edition record: the plate reader is `get_client_project_editorial`, guarded by project membership, on today's tables; the approved-edition-only read begins in Phase 2 with `get_client_project_edition` | Phase 1 promised a read whose record ships in Phase 2 |
| R-v2-10 | One workload: 1 first edition (≈$0.08) + 3–8 later editions (≈$0.045) = $0.215–$0.44 per job-month; 20 active jobs ≈ $4.30–$8.80/month | The old range did not follow from the per-edition totals |
| R-v2-11 | Canvas-lane ruling, pinned in SQ-1573; not restated here | Not part of the doc lane's contract |
| R-v2-12 | Empty-Issue keeps every chapter and anchor, including 04 The House and 10 Earlier, with empty states in words (canvas lane) | The drawn empty issue had dropped two chapters |
| R-v2-13 | Every arrival shows three standing rows in fixed role order with zero states in words ("Nothing new since your last visit" / "Nothing waiting on you" / "No invoices open"); roles and order never change by phase | Phase frames had dropped or reordered rows |

## Deliverables of this story

1. **Mockup canvas** — Design-type Artifact (same mechanics as US-44), source under `artifacts/client-house-issue-2026-10-21/canvas/project/` with `canvas.json` + boards (v1: twelve boards incl. Credits; v2 rework in SQ-1570: Main/desktop with y-rulers, Main split into Main-A (arrival → living room) and Main-B (study → colophon) in SQ-1573 per R-v2-1, nine-plate Plate-Grammar absorbing the clipping study, one new Drawings-and-Materials board, Image-Ledger folded into Credits). Photography: rights-free placeholder photographs, every caption keeping its three fields and adding "Placeholder, not job imagery." as a second line; real editions use only job-owned images.
2. **HTML plan document** for the founding team — a private Artifact page (`artifacts/client-house-issue-2026-10-21/doc/index.html`, https://claude.ai/artifact/CNgLMYo9yWxoVYxbADZvpa): v2 adds "What we borrowed, what we refused" with three reference captures, the 390 and 1440 arrival tables, the nine-plate table, the image system, cost v1 vs v2, the rulings ledger and the fifteen decision cards (V2-9 added in SQ-1574). Patina type and palette; no "AI" string; brand-lexicon clean.
3. **Brief** `brief/DESIGN-BRIEF.md`, `tools/check-canvas.mjs`, `tools/check-doc.mjs` (v2 adds the decision-card, rulings-ledger, reference-image, public-bucket and cost-column checks).
4. Designer proposals: `inputs/designers/designer-*.md` (v1) and `inputs/designers/v2-designer-*.md` (v2).

## Execution dispatch
- **v1 (done):** SQ-1562 canvas, SQ-1563 doc, SQ-1564/SQ-1566 reviews, SQ-1565/SQ-1567 fixes.
- **v2:** W1 SQ-1568 inspiration + SQ-1569 photo pool; W2 three designer proposals; W3 SQ-1570 canvas + SQ-1571 doc/plan; W4 SQ-1572 cross-provider review; W5 fix tickets from findings. Reviewer never fixes.

## Verification
- `node artifacts/client-house-issue-2026-10-21/tools/check-canvas.mjs` passes (canvas).
- `node artifacts/client-house-issue-2026-10-21/tools/check-doc.mjs` passes (doc): every v1 check, plus each decision card C1–C3, Q1–Q3, V2-1…V2-9 present once with a recommendation, the rulings ledger listing R-a…R-o, exactly three reference images ≤300 KB in the borrowed section, "project-item-images" only in a sentence that says private or never, and a cost table with v1 and v2 columns. SQ-1574 adds: the cost arithmetic (range = first + n × later for n = 3 and 8), the crop numbers (39:34 and 780×680 present, the superseded phone-crop numbers absent), the nine plate names cross-checked against this file's plate grammar, the C2 held-plate exception, no approved-edition dependency in Phase 1, the specific privacy sentences, and a seeded self-test of those checks. Browser render at 390/1440, an assistive-technology pass and Commons licence re-verification stay human review.
- Doc renders at 390 and 1440 with no horizontal scroll; dark-mode tokens defined per artifact-design contract.
- No app code, migration, flag, or deploy touched (git diff limited to `artifacts/client-house-issue-2026-10-21/`).

## Follow-ups surfaced by the explore pass (not in this story)
- `artifacts/client-homeowner-design-2026-10-20/brief/DESIGN-BRIEF.md` §6 still says "no cards, no green buttons, no shadows" — superseded by F4/F5/F8; one pointer line to §3a A1–A3 and R202 would stop the next designer tripping.
- The client-safe data boundary (which `get_client_*` readers exist and what each returns) is written nowhere in one place; a short codebase-map note would make the next client-portal feature cheaper.
- `room-capture.tsx:224` passes a raw private-bucket `model_url` to the 3D canvas without `useSignedScanModelUrl`; worth a check before any design leans on scans.
- `project-item-images` is public (00807:113-118) and today holds studio uploads; whether studio uploads of her home should stay there is outside this story.
