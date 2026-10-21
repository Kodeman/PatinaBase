# The House Issue — the homeowner client portal as a job-made website

## Context

Kody asked a team of designers to reconceptualize the client portal so it both drives the homeowner's engagement with the job and reads like a polished website promoting *their* job, leaning heavily on imagery of the products specified on it (reference: fitosauna.com, awwwards nominee Oct 2026), using Anthropic API credits so each page's imagery and design is built for, and adjusts with, the job. Deliverables: a concept mockup and an HTML plan document for the founding team.

This is a **design-and-plan story**: it produces a canvas, an HTML document, and committed source under `artifacts/`. No app code, migrations, flags, or deploys. Three Plan-agent "designers" (editorial art director, systems/Claude-layer, homeowner experience/accessibility) each proposed; this file is the synthesis.

### What exists (verified at main f1d83091d, 2026-10-21)
- One signed-in surface, **the Threshold** (`apps/client-portal/src/components/threshold/threshold.tsx`, the only hook-wiring file). `/` resolves the active house; `/projects/[id]` renders the same component. The Making / `single-pane` flag was retired in f1bfe7c0f; nothing is flag-gated.
- Render order: Doorplate letterhead → "On this page" link row → sticky 170px StoryPole rail + main column: `#doorstep` (`#ledger`, `#letterbox`) → `#approvals` → `#key` SVG plan → one RoomBand per room (3:2 concept render as `figure`/`figcaption` with on-image "Concept · not installed", item rows with 64/96px `<img>` thumbnails, `PieceSilhouette` fallback) → `#road` → `#note` (Maren's letter, reply) → `#previously` → `#mat` → PresentedBy + Colophon. **Anchor ids are an external contract** (emails, pay returns, retired-route redirects in `lib/retired-routes.ts`).
- `since-yesterday.tsx` dims only opt-in `data-dimmable` units; never the doorplate, doorstep, letterbox, or gates.
- Visual system: Playfair / Inter / DM Mono; paper `#FAF7F2`, stock `#FCFAF6`, ink `#2C2926`; US-45 green tokens between the `green direction tokens` markers in `app/globals.css` (`--color-forest #3E5145`, card `#FFFDF9` / rule `#C9C7BD`, note `#F0F3ED`); scored-ink `.da-*`, `HoldAction` 900 ms; CSS-only motion, `--ease-editorial`; light-only; no `next/image` optimizer on Workers (size at source).
- Imagery available per job today: `project_ffe_item_images` (ordered URLs, mostly hotlinked retailer photos; no width/height/alt/colour), one studio concept render per room (private `room-renders`), room scans (`room_scan_images` has width/height/quality/caption/light), `project_palettes` swatches (client-readable), `project_boards.cover_image_url`, `vendors` (hero_image_url, brand_story, made_in), `projects.portfolio_snapshot` at close, studio logo via `get_client_presentation_identity`. The client reader `get_client_project_threshold` (head 00840) returns **no description, maker, finish, material, or dimensions**.
- Claude: `supabase/functions/_shared/claude.ts` `callClaude()` (llm_reserve → call → llm_settle → PostHog `$ai_generation`); roles in `_shared/claude-models.ts` (haiku-5-5 triage/judge, sonnet-5-5 extract/answer/draft); pattern to copy is `aesthete-dna-draft/lib.ts:340` (image URL blocks, cached system prefix, JSON schema). Controls: `llm_feature_controls` (new features default DISABLED), $25/day global, $50/studio/month, kill switch, admin `model-usage` page. Dispatcher pattern: `00677_board_deck_import_resolve_dispatch.sql` (cron → `job_runs` only when work exists → lease-claimed edge fn → lease-checked RPC writes). Frozen-snapshot precedent: `project_review_editions` (00434).
- Gate for the portal: `pnpm --filter @patina/client-portal type-check`, `test` (164 jest files), `test:e2e` (`threshold.spec` 22, `homeowner-usability.spec` 8).

### Authority the concept must obey (and where it strains)
- **V8/V9**: the homeowner page *may* be designed for daily return; it may *never* measure her (no badges, counts, streaks, %, "01 / 07" denominators). **V9 P1**: studio is the author, Patina the press — letterhead opens, "Prepared by Birchwood Studio · Sent through Patina" closes, no Patina wordmark above the colophon.
- **R142 / V9 P4**: image rank installed photo > studio board/scan > maker product photo > drawn silhouette; every image captioned "what · whose · when"; concept renders carry "Concept · not installed" ≥14px on the image; **never stock, never generated rooms**. **V23** refuses generated imagery of the client's home and any client-facing chatbot; a person confirms every commit/send; **no "AI" or model name anywhere in the UI (R3)**; homeowner data to a model requires the privacy page updated (R4). **V22**: draft-first, designer approves.
- **Spec** `docs/specs/_active/client-portal-homeowner-usability.md` (CPUX-01–07, R139–R141, R202, A1–A7, F1–F8): purpose sentence on arrival; link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as page furniture (no fixed header/tabs/bottom bar); all invoices visible in four groups; 16px body, ≥15px money/dates/names, 44px targets, 48px final act; status in words, no red; 360/390 + 200% zoom; forest fill only on final acts carrying an amount, consequence note above; framed cards `#FFFDF9` / 1px `#C9C7BD` / 8px. Non-goals: no new route tree, dashboard, nav shell; nothing invented.
- **Brand voice**: no curated/luxury/seamless/elevated/bespoke/shop/AI-powered; no exclamation, emoji, testimonials, guarantees, sales CTAs; sensory material words; Midwest places.
- **Strains to put before the founders, not resolve in code**: (C1) shadows — A3/F4 allow, VISION §6/V9/V20 forbid; (C2) full-measure photography — house sheet §A10 caps plates at 120px; (C3) delta-only auto-approve of editions whose prose did not change vs V22's "a person confirms every send"; (Q1) may imagery ever sit above the first money/approval act; (Q2) may maker names/provenance appear on the homeowner page (consent switch); (Q3) scroll-triggered reveals vs on-mount only.
- **Fixtures (US-44 brief; no real people)**: Birchwood Studio, Madison WI · Maren Holt (608) 555-0148 · June & Arlo Brennan ("Prepared for June Brennan") · Elm Street House (Procurement; next Living room installation; target 22 January 2027) · Lake Cottage · six invoices $1,375.00 (INV-2026-014 $600 past due 25 Sep; -019 $100 due today; -017 $300 of $800 due 2 Nov; -022 $250 due 14 Nov; -023 $50 due 30 Nov; -024 $75) · "Living room sofa, edition 2" $7,480.00 (oatmeal performance linen replaces wool bouclé; arm 26→24 in; +2 weeks; nine weeks from fabric order) · walnut sideboard "In production" at a fictional maker (Harmon Bench Works, Dayton OH — reuse from the Single Pane fixture) · Maren's update 16 October 2026.

## The concept: The House Issue

**One sentence:** the homeowner's page becomes a single-issue magazine about one house, photographed and written by the studio, printed by Patina, and re-set as the job moves; Claude is the art director on the press floor (chooses, crops, captions from record facts, names chapters, pulls palette), never the painter, and never named.

**Promise to June:** *Open this and see your own house arriving, piece by piece, in the studio's own pictures, with every ask sitting exactly where it belongs.*

### Three ideas that make it more than a restyle
1. **The job supplies the art.** Every plate is an asset the job already owns, ranked per R142. Imagery scale grows with the job: boards lead in Design, maker workshop photographs in Procurement, the first installed photograph in Installation, the studio's finished photograph at close. A job with zero photographs is still a complete page (palette strip + silhouettes), never a filler.
2. **A per-job edition record, composed by Claude, approved by the designer.** A background job composes an *edition* (hero + focal point, per-image alt, chapter headlines + standing sentences, chapter order) from the job's facts and images; it lands `awaiting_review` in the designer's Document and only an `approved` edition reaches the homeowner. What is deterministic stays code (image rank, caption what·whose·when from record fields, palette extraction, contrast, layout template).
3. **The page re-composes only when the job moves, and the ground never shifts.** Letterhead, purpose sentence, link row, anchors, invoice groups, chapter order never move. The hero plate, chapter headline, and plate tint may change — once a day at most, only on designer approval — and Maren's letter opens with the notice in her voice: *"The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was."* "Since yesterday" absorbs the change as one unit.

### Arrival composition (390px, first 740px) — the C/A reconciliation
| y | Element |
|---|---|
| 0–96 | Letterhead: Birchwood Studio · Elm Street House · Prepared for June Brennan (not fixed) |
| 96–132 | Purpose sentence 16px: "Pay invoices, review approvals, and follow your project here." |
| 132–196 | Link row, two lines, 44px targets (F3 order) |
| 196–244 | Standing line 16px: "Six invoices are open; $600.00 is past due. One edition awaits your approval." (each clause links to its anchor) |
| 244–520 | **Hero plate** 16:10, card-wide (358×224), eyebrow `01 · ELM STREET HOUSE · PROCUREMENT`, display headline *The living room is on its way*, caption below |
| 520–740 | `#doorstep` begins: first invoice card, consequence note, forest Pay act |
At 1440 the hero fills the 1248 measure (never the viewport, ≤72vh); display headline overlaps the plate's bottom edge by one line. **Recommendation on Q1: the hero never sits above the standing line.**

### Chapters (anchors preserved; bare numerals in DM Mono as wayfinding)
| # | Anchor | Eyebrow | Headline (studio voice) | Plate |
|---|---|---|---|---|
| 01 | new, above `#doorstep` | 01 · ELM STREET HOUSE · PROCUREMENT | *The living room is on its way* | Hero plate: walnut sideboard · photographed at Harmon Bench Works, Dayton · 9 October 2026 |
| 02 | `#doorstep` `#ledger` `#letterbox` | 02 · WHAT IS OWING | *Six invoices, $1,375.00 together* | none — the ledger is the image |
| 03 | `#approvals` | 03 · WAITING ON YOU | *The sofa, second edition* | Pair plate: maker photo 7:5 + swatch strip (oatmeal performance linen · maker's sample · 14 October 2026); consequence note; forest 48px act $7,480.00 |
| 04 | `#key` | 04 · THE HOUSE | *Three rooms, read from the front door* | existing SVG plan; room names link to bands |
| 05+ | RoomBand ids | 05 · LIVING ROOM | *Walnut, linen, and a lot of light* (material words from that room's items only) | Room plate 3:2 (concept chip or installed photo), then piece plates 1:1 in a 2/4-col run, silhouettes where no photo |
| 08 | `#road` | 08 · WHERE THINGS STAND | *In production, then on the truck, then here* | Now / Next / Target in words; piece plate 96px beside the sideboard row |
| 09 | `#note` | 09 · FROM MAREN | *A note from the studio, 16 October* | letter, Playfair italic lead, reply |
| 10 | `#previously` `#changed` | 10 · EARLIER | *What has already been settled* | text ledger; "Edition 4 · approved by Maren · 21 October" lines |
| 11 | `#mat` | 11 · PEOPLE AND PAPERS | *Who to call, and the documents* | portrait only if studio uploaded one; then colophon |
Rhythm rule: plate → fact → pair → drawing → plate-and-run → words. Never two pictures in a row.

### Image plate grammar (six plates)
All plates: `figure` + `img alt` + `figcaption`; 1px hairline `#E8E3DB`; caption DM Mono 12px `#4E4339` as **three stored fields** what · whose · when; caption ink never on the photo; the job palette tints only a 4px rule under the frame (or the 1px border), never the ground behind the image; if a palette tone is ever a background, ink is chosen from paper/charcoal by computed contrast ≥4.5:1 with fallback to the plain card.
1. **Hero plate** — one per page; 16:10 (4:3 ≤600px); fills the measure, never the viewport; focal point stored as `object-position`; eligible: installed photo, scan above quality threshold, studio board cover, maker photo of the lead piece; never a concept render.
2. **Room plate** — 3:2 at the top of each RoomBand; concept render allowed with the ≥14px chip; replaced by the first installed photo of that room.
3. **Pair plate** — 7:5 photo + swatch strip; only in `#approvals` and scope-change asks.
4. **Piece plate** — 1:1, 165px (390) / 282px (1440); retailer photo on white uses `object-fit: contain` with 10% inset so the white reads as a pasted clipping on stock; `multiply` over tint rejected (darkens the product). Caption for a catalogue photo: *The same model, from Harmon Bench Works' catalogue · not her piece · hers is in production.* Never "your sideboard".
5. **Swatch strip** — 40×40 swatches from `project_palettes` with brand + name; the one place palette is colour, because it is a record of real paint.
6. **Silhouette plate** — existing drawn footprint; caption *Floor lamp · drawn from the specification · photograph to follow*. Also the load-failure fallback (figcaption stays, gains *· picture did not load*).
Alt = first two caption segments + source kind; never "image of". Paper grain is CSS `feTurbulence` at 3% on the page, never on images.

### Motion
Image settle on load (scale 1.015→1 + opacity, 400ms, caption +120ms); chapter head reveal **on mount only** (opacity + 12px rise, 360ms, max three staggered children) — **recommendation on Q3: no scroll-triggered reveals, no parallax, no pinned sections, no carousels, no preloader, no GSAP**. Hold stays 900ms. `prefers-reduced-motion`: transforms off, opacity 150ms linear.

### Founder decision cards (the HTML doc presents these; this plan recommends)
- **C1 shadow** — recommend none; hairline + stock-on-paper step is the only depth; amend A3/F4.
- **C2 full-measure photography** — proposed ruling: "Photography on the homeowner page may fill the page measure (edge to edge at 390, the 1248 measure at 1440) but never the viewport; the letterhead, purpose sentence, link row and standing line always sit above the first image; no image exceeds 72% of viewport height; one plate per page at this scale; eligible only installed photographs, studio boards, room scans, and makers' photographs of the specified piece; concept renders stay at room-plate size with the mark; the 120px cap continues to govern designer and admin surfaces."
- **C3 delta-only auto-approve** — recommend allowed only when no prose call ran (plates changed, words unchanged), per project opt-in; otherwise V22 holds.
- **Q1 imagery above the first money act** — recommend no, at every viewport.
- **Q2 maker names on the homeowner page** — recommend one provenance line (maker · town · in production since · photographed when) behind a per-project `show_makers` switch; no brand stories (a third voice on Maren's letterhead).
- **Q3 scroll reveals** — recommend on-mount only.

### The Claude layer (honest split)
| Task | Who | Notes |
|---|---|---|
| Image rank (R142) | code | source + item status + render presence |
| Caption what · whose · when | code | item name · vendor/studio · created_at; the model never invents provenance |
| Palette extraction | code | k-means on a 48px rendition (port of `ImagePaletteExtractor`) |
| Contrast check | code | WCAG math; fail → ink on paper |
| Layout template per chapter | code | three templates by image count/aspect |
| **Hero + focal point, alt text** | Sonnet 5.5 high, vision (Call A) | 6–12 image blocks + facts; schema `{hero:{imageIndex,focal,why}, images:[{index,alt≤125}]}` |
| **Chapter headlines + standing sentences** | Sonnet 5.5 high, text (Call B) | `{chapters:[{key,headline≤60,standing≤160}], doorstep:{…}}` |
| Voice lint | regex on `marketing/canon/lexicon.json` + Haiku judge (Call C) | one regeneration naming the term; second hit → deterministic headline |
Request shape copies `buildDraftRequest` (cached system block = voice rules + lexicon + caption form + schema). Validator rejects: refusal, truncation, out-of-range focal, any "AI"/"generated" string, length, contrast. Prompt allowlist test fails on `site_address`, household names, prices, `project_notes`.
**Record**: `client_editions` (status drafting → awaiting_review → approved → superseded; `source_hash` debounce; `composition`, `facts`, `overrides` jsonb; lease fields), `client_edition_images` (rank, storage_path, width/height, blurhash, dominant_hex, focal, alt, caption triplet), `client_edition_requests` (30-min debounce inbox). Writers: edge fn via lease RPCs; designer RPCs approve/hold/override; reader `get_client_project_edition` (approved only, overrides merged, signed URLs; allowlists name-as-signed, makerName, madeIn, material, finish, dimensions, descriptionAsSigned ≤280; never prices/SKU/notes). Triggers: item image insert/primary change, item status → delivered/installed, phase change, concept render set, palette change, authorization signed, project closed. Cap 2 editions/day/project; a new draft supersedes an unreviewed one.
**Designer loop**: a Press band in the job's Document between the client mirror (`apps/designer-portal/src/components/document/client-mirror.tsx`) and the note composer; preview renders inside the mirror; Approve / Hold / Edit (hero picker, inline headline/standing, caption whose/when, chapter drag). No "regenerate" button. Desk card gets one line, not a card. Band copy: "A new edition is ready" — never why.
**Images**: phase 1–2 copy-once into `project-item-images` (`${project_id}/editions/{hash}.jpg`, 10s timeout, ≤8MB, width/height/blurhash/dominant) served via Supabase `render/image` at four widths with `srcset`; 403/dead → silhouette; nightly HEAD check demotes dead plates. Swap to the media worker after `svc_media` reconciliation; schema unchanged.
**Cost** (rates from `claude-models.ts`; images downsized to 1024px ≈1,100 tokens): ≈$0.05 Call A + $0.024 Call B + $0.001 Call C ≈ **$0.08/edition** ($0.12 with retry); 3–8 editions/job/month in buying/install → **$0.25–$1.00 per active job per month**; 20 active jobs ≈ $5–20/month; `llm_feature_controls` row `client-edition-compose` daily cap $5 under the $25 global cap.
**Flag + rollout**: PostHog `client-edition-page` via `useFeatureFlag` (fail-closed); target by distinct_id, not email_domain (client accounts are gmail aliases); server side `llm_feature_controls` disabled by default, `llm_studio_overrides` enables Middle West Studio first; kill switch stops composition while approved editions keep rendering.

### Delivery phases (recorded in the doc; none built in this story)
- **Phase 1 — editorial restyle on today's data (M, no Claude).** 00842 `get_client_project_editorial` reader (facts allowlist, gated on `show_makers`) + designer RPC for the switch; `threshold/editorial/` components (hero/room/pair/piece/swatch/silhouette plates, caption triplet, provenance line); chapters keyed on rooms; anchors unchanged; flag `client-edition-page`. Tests: jest on rank/caption/contrast; `threshold.spec` anchors; `homeowner-usability.spec` + hero/caption. Gate: `pnpm --filter @patina/client-portal type-check test test:e2e`.
- **Phase 2 — edition record, composition, approval (L).** 00843–00845 tables/triggers/requests, lease RPCs + dispatcher + feature row, reader + designer RPCs; edge fn `client-edition-compose` (`callClaude`, `promptVersion 'e1'`); Press band + mirror preview + Desk line; client reader hook; client-portal privacy page branch (R4). Deno tests for builder/validator/lint; jest for the band; e2e approve → homeowner sees. Gate adds `supabase/functions` deno test + designer gate.
- **Phase 3 — image pipeline, installed photo, close-out (M).** `installed` rank from Field uploads; closing edition frozen with `portfolio_snapshot`; media-worker swap; broken-link/403 → silhouette tests; close-out immutability.
- **3-week cut**: Phase 1 whole + Phase 2 narrowed to Call B only, hero by code, deterministic captions, Approve/Hold only, Middle West only.
- **Risks** (in the doc): retailer image licensing (private bucket, maker named, consent switch, takedown list); voice drift (lint + judge + pinned prompt version + weekly sample); approval fatigue (2/day, debounce, delta diff, Hold); cost runaway (hash dedupe, caps, kill switch, lease); homeowner disorientation (approve-only changes, Maren's notice, edition line in Earlier); accessibility regressions (computed contrast, validated alt, reduced motion, e2e a11y gate); prompt data leak (allowlist test); hotlink rot (copy-once + nightly check).

## Deliverables of this story

1. **Mockup canvas** — Design-type Artifact (same mechanics as US-44), source under `artifacts/client-house-issue-2026-10-21/canvas/project/` with `canvas.json` + boards:
   1. Issue-Cover-1440 — letterhead, link row, standing line, hero plate, display headline overlap
   2. Issue-Cover-390 — the arrival table above, 44px targets marked, first act inside 740px
   3. Plate-Grammar — six plate types with caption rules, hairline, inset, palette rule
   4. Clipping-Study — one white-ground retailer photo in four treatments (raw / inset+hairline / multiply rejected / silhouette)
   5. Approval-Pair — chapter 03 at 1440 + 390: pair plate, consequence note, forest act $7,480.00
   6. Living-Room-Band-1440 — room plate with concept chip, piece-plate run, one lifted TrackingRow
   7. Phase-Strip — the cover at Design / Procurement / Installation / Closed in a row ("adjusts with the job")
   8. Press-Band-Designer — the edition draft in the designer's Document: preview in the client mirror, Approve / Hold / Edit, delta-only diff line
   9. Type-and-Rhythm — display, chapter head, eyebrow, caption, body at size; 200% zoom column
   10. Motion-Storyboard — settle/reveal/hold frames; reduced-motion row
   11. Empty-Issue-390 — zero-image job: palette strip + silhouettes
   Photography in the mockup: rights-free placeholder photographs (walnut furniture, linen, workshop) uploaded to the artifact asset store, every caption ending "· placeholder, not job imagery"; the doc states real editions use only job-owned images. Kody may swap in his own plates later.
2. **HTML plan document** for the founding team — a private Artifact page (`artifacts/client-house-issue-2026-10-21/doc/index.html`): the concept and promise; June's week (five honest return hooks, five forbidden); arrival composition; chapters; plate grammar; how the issue changes with the job; the Claude layer with the honest code/model split and the cost range; the designer loop; phases + 3-week cut; risks; the six decision cards (C1–C3, Q1–Q3) with recommendations; the engagement test (five yes/no questions); what it does not do; authority references; link to the canvas. Patina type and palette; no "AI" string; brand-lexicon clean.
3. **Brief** `artifacts/client-house-issue-2026-10-21/brief/DESIGN-BRIEF.md` (merge rule, fixtures, plate grammar, rulings sought) and `tools/check-canvas.mjs` (port of the US-44 oracle: dead anchors, aria, contrast, 44px, 390 overflow, banned strings).
4. Commit `docs(design): The House Issue — client-page concept canvas + founders' plan` on main (explicit pathspecs), push; memory note with links and owed rulings.

## Execution dispatch (after approval; Fable orchestrates, never executes)
- **W1 (parallel, own worktrees, no Serena):** (a) Opus `interaction-design-implementation` — canvas boards 1–11 + check-canvas oracle, from this file + the three designer reports (paths in the session tasks dir; copy their text into the brief first); (b) Sonnet — the HTML doc + DESIGN-BRIEF.md; (c) Haiku — fetch and license-check 6–8 placeholder photographs, downsize ≤1600px, stage for asset upload.
- **W2:** Codex `review-audit` (cross-provider) on both artifacts: authority violations (R142 captions on every image, V9 no counts/denominators, V23 R3 no "AI"/model names, brand lexicon, spec floors), plus `check-canvas.mjs` green. Fixes by the W1 lane; reviewer never fixes.
- **W3:** Fable synthesis; publish canvas (type_url Design, root = canvas dir, boards in `files`, assets uploaded) and doc; commit + push; memory; return both links and the six decisions to Kody.

## Verification
- `node artifacts/client-house-issue-2026-10-21/tools/check-canvas.mjs` passes: no dead `#` anchors, aria-expanded with aria-controls, caption ink ≥4.5:1 on every plate card, targets ≥44px, no horizontal overflow at 390, every `figure` has `figcaption` with three "·"-separated segments, no "AI" / "artificial intelligence" / "generated" / banned-lexicon strings in either artifact.
- Doc renders at 390 and 1440 with no horizontal scroll; dark-mode tokens defined per artifact-design contract.
- Both Artifacts read back (`action: read`) and open; links returned.
- No app code, migration, flag, or deploy touched (git diff limited to `artifacts/client-house-issue-2026-10-21/`).

## Follow-ups surfaced by the explore pass (not in this story)
- `artifacts/client-homeowner-design-2026-10-20/brief/DESIGN-BRIEF.md` §6 still says "no cards, no green buttons, no shadows" — superseded by F4/F5/F8; one pointer line to §3a A1–A3 and R202 would stop the next designer tripping.
- The client-safe data boundary (which `get_client_*` readers exist and what each returns) is written nowhere in one place; a short codebase-map note would make the next client-portal feature cheaper.
- `room-capture.tsx:224` passes a raw private-bucket `model_url` to the 3D canvas without `useSignedScanModelUrl`; worth a check before any design leans on scans.
