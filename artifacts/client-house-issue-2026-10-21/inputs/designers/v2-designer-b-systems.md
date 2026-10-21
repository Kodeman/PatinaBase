# Designer B, systems: The House Issue v2, image-led and evidence-first

## 1. Thesis
The job already has enough material for full-bleed screens, but most of it is not photographs. It is drawings (the key plan SVG, shared PDF sheets), boards that can be re-rendered at 2400×1600, and studio uploads. The retailer photos v1 leaned on are usually white-ground clippings, which fail every hero floor. So the pipeline must check pixels before anything goes to the model, crop on the server for each viewport, and serve stable private URLs. If it doesn't, "image-led" turns into upscaled catalogue shots that are slow to load.

## 2. Source inventory
I did not query prod. Per-job counts are unmeasured. Before Phase 1, run one aggregate over `project_ffe_item_images` (by source and host) and pull header dimensions with `project-review-media/lib.ts:396-470` in dry-run.

| Source | Table / bucket | Typical per job, quality | Hero-scale? | Evidence |
|---|---|---|---|---|
| Retailer item photo | `project_ffe_item_images` `source='library'`, hotlinked `url` | Copy of `products.images` taken when the item is added. No width, height, alt or ground. Prod has about 35 backfilled items | Rarely. White ground fails | 00807:140-147, :35-41; room-band.tsx:507-513 (96px) |
| Studio upload | same table, `source='upload'`, `storage_path` in **public** `project-item-images` | No kind field: product, workshop and site photos are indistinguishable | Yes, if it passes the §3 floors | 00807:113-118 (public=true), :144 |
| Concept render | `project_rooms.concept_render_url`, private `room-renders`, 8 MB cap | At most one per room | Never (R142) | 00580:56, :73-80; room-band.tsx:364-372 |
| Scan still | `room_scan_images`, private `room-scans`, HEIC original, 512px thumb and 1600px JPEG preview | Up to 10 per scan | Desktop: no (1600 is under the floor). Phone room/held plate: borderline | 00032:20-43; 00340:9-19; storage-url.ts:4-8 |
| Studio board | `project_boards.cover_image_url` plus `items` jsonb | Stored cover is an 800×600 PNG. The 2× export of a 1200×800 canvas gives 2400×1600 | Cover: no. Re-rendered board plate: yes, uncropped | 00179:80-99; painter.ts:15-21, :84-97; board-room-shell.tsx:670-706 |
| Drawing sheet | `plan_sheets` (`state='shared'`) → `plan_prints` → `project_documents` PDF | One drawing set per job. No raster exists today | Yes, as a sheet plate rendered with pdf.js, never cropped | use-plan-room.ts:628-717; 00429:135; pdf.ts:111 `renderPageThumbnail` |
| Key plan | Computed SVG | One | Yes, as a drawing plate (vector, no bytes) | plan-key.tsx:15-52 |
| Palette | `project_palettes.swatches` | 4–8 swatches | Swatch strip only | PLAN.md:14 |
| Vendor banner | `vendors.hero_image_url` | Banner from the maker's website | No. It is brand imagery, not her piece, so treat it as stock | 00034:6-7 |
| Installed photo | No such kind exists | n/a | n/a | 00807:144 (only `library` or `upload`) |

**Pipelines to reuse:**
- The `project-review-media` function copies files and reads their dimensions (lib.ts:326-470), and is content-addressed (00546).
- `project_review_media_assets` lives in a private bucket with no storage policy, so only service_role can read it (00433:18-25, :56-74).
- The media worker already produces six widths (256–2048) in WebP and AVIF, plus blurhash and dominant colour (container/server.mjs:18, :67, :104-109).

**Do not reuse:** designer-portal `generateSrcSet` (media-utils.ts:311). It appends `width=` to `/storage/v1/object/` URLs (media-utils.ts:220-224, :268-282). Only `/render/image/` URLs are resized, so today every srcset entry it builds is the full-size original.

**v1 defect:** v1 copies retailer photos into `project-item-images`, which is a **public** bucket (00807:113-118). That republishes the makers' copyrighted photos at public URLs, while v1's risk list says "private bucket". Plate copies must go into a private bucket.

## 3. Quality floors and crop rules
Floors are in device pixels **after** the crop. Below a floor, the plate drops one role. The pipeline never upscales.

| Role | Box (CSS px) | Target | Hard floor | Crop |
|---|---|---|---|---|
| Hero, desktop bleed | 1440 × min(900, 72svh), 16:10 | 2048×1280 | 1600×1000. Between 1248 and 1600 wide it becomes a 1248-measure plate; under 1248 it is not a hero | `wide` 1.6 |
| Hero, phone cover | 390 × 452 (288→740), 0.86 | 1080×1256 | 780×907 | `cover_phone` 0.86 |
| Held plate, phone | 390 × 848, 0.46 | 1080×2348 | 780×1696 | `tall` 0.46 |
| Room plate | 1248 / 358, 3:2 | 2048×1365 | 1248×832 | `wide32` |
| Pair plate | about 612 / 358, 7:5 | 1224 | 716 | `pair` |
| Piece plate | 282 / 165, 1:1 | 564 / 495 | 330 | contain, 10% inset, white ground allowed |
| Sheet plate | 1248 / 358, sheet aspect | 2496 wide | 2048 | **none**. A cropped drawing misstates its scale. Links to the PDF in `#mat` |
| Board plate | 1248 / 358, canvas aspect | 2400×1600 | 1600 | **none**. Re-rendered at Approve |
| Plan / swatch / silhouette | vector or CSS | n/a | n/a | n/a |

**Rules (all code):**
- `ground='white'` is detected in code by the variance of border pixels. A white-ground image is only ever a piece or pair plate.
- A crop may discard at most 50% of the source area, and it must contain the whole subject box. Otherwise that role is closed to the image.
- Focal point and subject box are stored once per image, normalised 0–1. Code computes every crop as the largest box of the target aspect that contains the subject box and is centred on the focal point.
- If the 72svh clamp shortens the frame, `object-position` comes from the crop rectangle's centre.

## 4. Edition record and Call A
Image perception (focal point, subject box, flags, alt) belongs to the image bytes, not to the edition. Store it once per sha256 so later editions only send new images to the model.

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
v1's per-image `blurhash`, `dominant_hex` and `focal` move off `client_edition_images` onto the asset. `composition.hero` becomes `{assetId, desktop:'bleed'|'measure'|'portrait', phone:'cover_phone'}`.

**Call A becomes two small calls:**
- **A1, perception** (Sonnet 5.5 high, vision). Only assets with no `perceived_prompt_version`, up to 8 per call, images at 1024px long edge. Output: `{images:[{index, subject_box[4], focal[2], flags[], alt≤125}]}`. The validator rejects a focal point outside the subject box, a box under 5% of the frame, unknown flags, or alt containing "AI", "generated" or "image of".
- **A2, hero pick.** Up to 6 code-eligible candidates as 512px renditions (about 233 tokens each), plus the facts. Output: `{hero:{index, why≤140}, held:[≤2 indices]}`. The model may only choose inside the highest R142 rank tier that has an eligible plate. Any index outside that set is rejected.

**Never sent to the model:**
- Drawing sheets. Their title blocks carry the site address and household names (prompt allowlist, R4). Sheet alt is built in code: "Sheet A-201, living room elevations".
- Boards. Alt is the board name.
- Photographs of her home (scans, installed photos) until the privacy page ships. Until then those get a crop computed in code: centre with a thirds bias, plus designer adjustment.

**Stays in code:** rank, eligibility floors, ground test, crop geometry, caption what · whose · when, palette (k-means on the LQIP), contrast, layout template.

**Designer override:** in the Press band, a focal point can be dragged on two frames side by side (16:10 and 0.86). It writes `subject_box`/`focal` with a `designer` origin, and code recomputes the crops.

## 5. Serving
- **Ladders and `sizes`:**

  | Plate | Widths | `sizes` |
  |---|---|---|
  | `cover_phone` / `tall` | 640, 828, 1080, 1242 | `100vw` |
  | `wide` | 1280, 1600, 2048, 2560 | `100vw` |
  | Room / pair / sheet / board | 768, 1024, 1600, 2048 | `(min-width:1296px) 1248px, calc(100vw - 32px)` |
  | Piece | 256, 512, 768 | n/a |

- **Markup:** `<picture>` with art-directed `<source media="(max-width:600px)">` for the phone crop. AVIF q50 first, WebP q72 fallback. `width`/`height` attributes always set, so layout shift is 0.
- **Storage:** one copy in R2 at `plates/{project_id}/{sha256}/{crop}-{w}.{avif|webp}`. Crops are made by the media-worker container (Sharp `extract` + resize, a small change to `generate_renditions`). The worker's callback writes `crops` through a lease-checked RPC.
- **URLs:** the client-portal Worker serves `/plates/{assetId}/{crop}-{w}.avif` through an R2 binding. It checks the session and calls a `client_can_read_plate` RPC (approved edition only), then returns `Cache-Control: private, max-age=31536000, immutable`. Nothing is public, signed URLs don't change between visits, and R2 egress is free.
- **Placeholder:** `dominant_hex` as the frame's background, plus an inline LQIP data URI of 24px width and at most 800 B, CSS-blurred. Blurhash is not decoded on the client.
- **LCP:** today `page.tsx` fetches the project view on the server (`fetchClientProjectView`, page.tsx:8), while Threshold fetches its selections on the client (threshold.tsx:1, :397). The edition must be read on the server so the hero `<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">` is in the server-rendered HTML.
- **Target** (Lighthouse mobile, 390px, slow 4G at 1.6 Mbps and 150 ms RTT): LCP ≤ 2.5 s on first visit and ≤ 1.0 s on return visits.
- **Budget:** hero ≤ 120 KB, critical HTML+CSS ≤ 60 KB, Playfair display subset ≤ 40 KB, all non-hero plates `loading=lazy`. These are estimates; measure them on the Phase 1 build.

## 6. Cost compared with v1
Rates from claude-models.ts:35-38 (Sonnet $2 in / $10 out, cache read ×0.05). Image tokens ≈ w×h/750.

| Edition | A1 | A2 | B | C | Total |
|---|---|---|---|---|---|
| First (15 images) | $0.045 | $0.010 | $0.024 | $0.001 | **≈ $0.08**, same as v1 |
| Later, 3 new images | $0.009 | $0.010 | $0.024 | $0.001 | **≈ $0.045** |
| Plates only (no Call B) | | | | | **≈ $0.02** |

- **Per job-month:** one first edition plus 3–8 later ones ≈ **$0.15–$0.45** (v1: $0.25–$1.00).
- **Infrastructure:** about 70 MB of R2 per job ($0.001), around 300 writes ($0.0014), and about 30 vCPU-seconds of container time (under $0.001). That is under $0.01 per job-month.
- **Alternative:** if we used Supabase `render/image` instead, it is billed per origin image, and whether Strata's plan includes it is unverified. No code builds a render URL today; storage-url.ts:45-52 only parses them. It also cannot crop to a focal point.

## 7. Failure modes and the designed answer
1. **Two mediocre white-ground retailer photos.** Neither can be a hero. The cover becomes a drawn cover: the key plan at full measure on stock, the swatch strip, and the photos as inset piece plates. The Press band says "The cover is a drawing until a photograph arrives" and offers one upload slot. Nothing is upscaled.
2. **A hotlinked image dies.** Bytes are copied once when the item image is added or the edition is composed. Editions only reference assets with stored bytes and never render a hotlink. If the copy fails (403, hotlink protection, over 10 s, over 20 MB), no asset is made and the piece gets a silhouette. The nightly check stays only for library rows not yet copied.
3. **A portrait-only photo on desktop.** The wide crop would discard more than 50% of it. Desktop uses a portrait template instead: a 4:5 plate across 5 of 12 columns (about 520×650; source must be at least 1040 wide) beside the headline. The phone gets it as a `tall` held plate. No letterboxing and no blurred fill.
4. **Undersized scans or boards** (1600px preview, 800×600 cover). Scans drop to room plate. Boards are re-rendered at 2× in the designer's browser at Approve, using the existing painter. A 2560px scan derivative would need a new size in `derive-scan-photo-media` (00340).
5. **The model crops the subject wrongly.** The validator catches impossible boxes. The designer drags the focal point on both frames, and code recomputes. Overrides persist per sha256, so the image never needs fixing twice.
6. **The edition reader fails or the network is slow.** The page renders without the cover: letterhead, standing line and money acts stay in place, so a picture never blocks a payment.

## 8. Rulings for the founders
1. **Retailer and maker photos at full bleed.** Recommend: only job-made images (uploads, installed photos, scans, boards, sheets) may bleed. Maker and retailer photos stop at pair and piece plates. Reasons: licensing, and the page should read as her house, not a catalogue.
2. **Sending photos of her home to the model for crop perception (R4).** Recommend yes, once the client privacy page ships. Until then, those photos get code crops plus designer adjustment.
3. **Crop and serving lane now.** Options: build the media-worker crop lane via R2 and a client-portal R2 binding now (M), or wait for the svc_media reconciliation and ship Phase 1 with desktop-only CSS crops. Recommend building it now.
4. **Amend C2 from "page measure" to full bleed** (edge to edge, at most 72svh, letterhead and standing line above), and allow a shared sheet or the key plan as the cover when no photograph meets the floor. Recommend yes to both.

### Critical files for implementation
- /Users/kody/Code/patina-merged/supabase/migrations/00807_us37_project_item_images.sql
- /Users/kody/Code/patina-merged/supabase/functions/project-review-media/lib.ts
- /Users/kody/Code/patina-merged/infra/media-worker/container/server.mjs
- /Users/kody/Code/patina-merged/apps/client-portal/src/app/page.tsx
- /Users/kody/Code/patina-merged/apps/designer-portal/src/lib/plans/pdf.ts