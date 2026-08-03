# Phase 3 — The Reach

Master PRD: [00-mood-board-prd.md](./00-mood-board-prd.md) ·
Architecture: [04-technical-foundations.md](./04-technical-foundations.md) ·
Previous: [Phase 2 — The Audience](./02-phase-2-the-audience.md)

---

## Overview

Phase 3 is about what leaves the room and what comes into it.

- **Export that honors the composition.** Today `spec-pdf` re-lays a board as a
  section-grouped tile grid (`supabase/functions/spec-pdf/index.ts:315-370`) —
  the composition is discarded at exactly the moment it matters — and there is
  no PNG at all. Phase 3 adds a composition-true PNG and a composition-true PDF,
  keeping the tile grid as an explicitly named "spec sheet" variant.
- **New sources.** Paste a product URL onto the canvas and get a pin, with
  provenance. Surface Chrome-extension captures in the rail.
- **Background removal** — the table-stakes-adjacent feature Programa and Studio
  Designer conspicuously lack. Ruling #3: third-party API first, behind a
  media-service endpoint.
- **An image pipeline** that stops shipping full-resolution originals to every
  render, and stops accumulating orphans.
- **Templates** — Ruling #4: studio-saved *and* Patina-seeded.

**Flag:** still `mood-board-editor`. Individual sub-features that depend on
external configuration (background removal) degrade gracefully when
unconfigured rather than failing.

---

## Dependencies

| Dependency | Status | Note |
|-----------|--------|------|
| Phase 2 complete | required | `BoardComposition` is the export source of truth — one renderer, one geometry model |
| `spec-pdf` edge function + `_shared/spec-pdf.ts` (855 lines, `@react-pdf/renderer@4.3.0` via `npm:` on Deno) | shipped | Already handles `kind: 'item' \| 'document' \| 'board'`, auth-by-caller-JWT with a service-role admin client, 404-collapse for not-found and not-owned, and a **structural** money-never-trade invariant (the render model types have no trade-price field) |
| `proposal-mood-boards` bucket (00131), public-read | shipped | Upload path `${ownerId}/boards/${boardId}/${uuid}.${ext}` |
| Capture pipeline + `useCaptureFromUrl` | shipped | The URL-unfurl target; extension captures already flow to the library |
| `product-picker-modal.tsx` `scope='library'` with captures | shipped | Rail source for R3.3.4 |
| Media service (`services/media`, port 3014, NestJS, R2 storage) | shipped | Host for the background-removal endpoint (Ruling #3) |
| `@patina/api-routes` proxy middleware | shipped | The only sanctioned path from a portal to a NestJS service; mutations are **not** retried by default |
| pg_cron + `public.invoke_edge_function` + `job_runs` | shipped | Agent OS scheduled-job convention for the orphan sweep |
| Seed conventions (`supabase/seed/`, `config.toml [db.seed] sql_paths`) | shipped | Only wired files run |

---

## Detailed requirements

### R3.1 — Composition-true export

**Decision: PNG is rendered client-side by a purpose-built painter onto an
offscreen `<canvas>`; PDF is rendered server-side by extending the existing
`spec-pdf` edge function with a `kind: 'board-composition'` that positions
elements absolutely through `@react-pdf/renderer`. No new rendering dependency
is added on either side.**

Justification:

- `html2canvas` and `satori` are **not** in the dependency tree. `html2canvas`
  re-implements a CSS subset in JS with well-known font, shadow, and gradient
  fidelity gaps, and is meaningful bundle weight against the designer worker's
  55MiB deploy gate. `satori` is server-side and handles only a JSX/CSS subset.
- The composition is a **closed vocabulary** — six pin types (`product`,
  `capture`, `image`, `palette`, `note`, `room_scan`) plus section bands. A
  deterministic painter over a fixed vocabulary gives exact fidelity for the
  shapes we actually draw, with no surprises from a general-purpose DOM
  rasterizer.
- The `proposal-mood-boards` bucket is public-read, so images load into a canvas
  with `crossOrigin="anonymous"` without tainting it. This is the one CORS
  question that matters and it is already answered by the bucket's
  configuration.
- PDF is already a solved problem in this repo: `_shared/spec-pdf.ts` renders
  with `@react-pdf/renderer`, which supports absolute positioning and remote
  image `src`. Rendering the composition there — rather than wrapping a
  client-produced raster — keeps vector text crisp, keeps the money-never-trade
  invariant structural, and reuses the existing auth and 404-collapse.

**Fallback:** if the painter's fidelity for `note` typography (wrapping,
webfonts) proves disproportionately expensive, fall back to serializing the
composition to SVG (`<foreignObject>` with inlined CSS and base64-embedded
images) and rasterizing it through an `Image` → canvas. Note the Safari
`foreignObject` caveats and re-verify AC3.3 on Safari if this path is taken. Do
**not** fall back to adding `html2canvas`.

#### R3.1.1 — PNG export

**R3.1.1.1** An **Export ▸ PNG** action in the room's top bar renders the
current board's composition and triggers a download named
`<board-name>-<yyyy-mm-dd>.png`.

**R3.1.1.2** Output dimensions are `canvas_width × 2` by `canvas_height × 2`
(2× device-independent scale), capped at 8192px on the longest edge; above the
cap, scale down uniformly and report the effective scale in the UI.

**R3.1.1.3** The painter draws, in order: background fill from
`background_color`; section bands with labels; pins in ascending `z_index`,
each with its `rotation` applied about its center.

**R3.1.1.4** Per-type painting must match `BoardComposition`'s visual output:

| Type | Painted as |
|------|-----------|
| `product`, `capture` | image (from `data.image_url`), object-fit contain within the pin box, plus the name/price/vendor caption block when the composition shows it |
| `image` | image, object-fit contain |
| `room_scan` | snapshot image plus the scan label |
| `palette` | swatch strip from the palette snapshot |
| `note` | rounded rect with wrapped text |

**R3.1.1.5** Fonts: the painter uses the same font stack the composition uses,
and must wait on `document.fonts.ready` before drawing text. A missing webfont
falls back to the system stack rather than drawing with a wrong metric.

**R3.1.1.6** Images are loaded with `crossOrigin="anonymous"`. Any image that
fails to load is drawn as a neutral placeholder box with the pin's name, and the
export completes with a warning listing the failed pins — a broken image never
aborts the export.

**R3.1.1.7** Export runs off the interaction thread where possible
(`OffscreenCanvas` + `createImageBitmap` when available, main-thread fallback
otherwise) and shows determinate progress. A board of 100 pins must complete in
under 10s on a 2020-class laptop.

**R3.1.1.8** Export never mutates board state and never enters the undo stack.

#### R3.1.2 — PDF export

**R3.1.2.1** `spec-pdf` gains `kind: 'board-composition'`, requiring `boardId`,
alongside the existing `kind: 'board'` which is retained and relabelled in the
UI as **Spec sheet** (the section-grouped tile grid).

**R3.1.2.2** The UI presents two distinct PDF choices — **Composition** (the
board as arranged) and **Spec sheet** (the tile grid) — never one ambiguous
"Export PDF".

**R3.1.2.3** The composition page is laid out by mapping the board's logical
canvas onto a single landscape page at the aspect ratio of
`canvas_width : canvas_height`, letterboxed into A4 or Letter per the existing
document convention. Pin geometry is scaled by a single factor; rotation is
applied with `@react-pdf/renderer`'s transform support.

**R3.1.2.4** Section bands render behind pins with their labels, matching R2.1.3.

**R3.1.2.5** The money invariant is preserved structurally: the board
composition model must carry **no** trade-price, markup, or margin field, exactly
as `SpecBoardModel` does today. Do not add one "for flexibility".

**R3.1.2.6** Auth is unchanged: caller resolved from the `Authorization` header,
loads performed by the service-role admin client, not-found and not-owned both
collapsing to 404.

**R3.1.2.7** A board too dense to render legibly on one page (heuristic: more
than 60 pins, or any pin smaller than 20pt on the scaled page) emits a warning
in the UI suggesting the Spec sheet variant. It still renders.

**R3.1.2.8** `_shared/spec-pdf.ts` is a shared module. Changing it requires
**redeploying every function that imports it** — see **patina-edge-functions**.
Enumerate the importers before deploying.

### R3.2 — Cover thumbnails

**R3.2.1** A board cover image is generated from the real composition using the
R3.1.1 painter at a fixed 800×600 fit-contain, on a **debounced** trigger
(30s after the last structural change, and on room exit).

**R3.2.2** The cover is uploaded to `${ownerId}/boards/${boardId}/cover.png`
(a stable path — overwritten, not versioned) and its URL is stored on the board.
If no column exists for it, store it under an existing JSONB field rather than
adding a column; only add a column if no such field exists, in which case fold
it into the Phase 3 migration.

**R3.2.3** The launcher strip (Phase 1 R1.2.1), desk recents (R1.2.3), and the
project board surface (Phase 2 R2.5.1) all render the cover, falling back to a
generated placeholder built from the board's first four pin images.

**R3.2.4** Cover generation failures are silent to the user and logged; a board
without a cover renders the fallback.

### R3.3 — URL unfurl and capture sources

**R3.3.1** `⌘V` with a URL on the clipboard (the Phase 1 R1.7.5 no-op) creates a
pin at the pointer by running the URL through the existing capture pipeline
(`useCaptureFromUrl`). A placeholder pin appears immediately and resolves in
place; on failure the placeholder becomes an editable `note` carrying the URL
rather than vanishing.

**R3.3.2** Dropping a URL onto the canvas (OS drag of a link) does the same at
the drop point.

**R3.3.3 — Provenance is retained.** The source URL is written to the pin's
`data.source_url` and rendered as the host name on the composition (the
`sourceHost` helper already exists at
`packages/patina-design-system/src/components/proposal/BoardsBlock.tsx:97`).

**R3.3.4** The left rail's **Captures** tab lists the studio's captures,
including those created by the Chrome extension (which already flow to the
library), newest first, with search. Dragging one onto the canvas creates a
`capture` pin retaining `capture_id`.

**R3.3.5** Unfurl is rate-limited per user and shows a clear message when the
target site blocks scraping — never a silent no-op.

**R3.3.6** Pinterest is explicitly **not** integrated
([N5](./00-mood-board-prd.md#7-non-goals)). A Pinterest URL goes through the
generic path and succeeds or fails on its own merits.

### R3.4 — Background removal

**Ruling #3 (Kody, 2026-08-03):** third-party API first, behind a media-service
endpoint. Revisit in-house (rembg/ONNX on the inference worker) only if volume
justifies it. The cutout is stored as a **new** image; the original is retained
so the action is revertible.

**R3.4.1** The floating inspector on an `image`, `product`, or `capture` pin
carries a **Remove background** action.

**R3.4.2** The portal calls a media-service endpoint through
`@patina/api-routes` — never a direct `fetch` to the service, and never a direct
call to the third-party vendor from the browser (the vendor key is server-side
only).

**R3.4.3** The media service endpoint accepts a source image URL (which must
resolve inside the `proposal-mood-boards` bucket — reject arbitrary URLs),
calls the configured vendor, and writes the result to
`${ownerId}/boards/${boardId}/${uuid}-cutout.png` in the same bucket.

**R3.4.4** On success the pin's `data.image_url` swaps to the cutout and
`data.original_image_url` retains the original. **Revert** in the inspector
swaps them back. Both are single undoable commands.

**R3.4.5** The original object is never deleted by this feature. The orphan
sweep (R3.5.4) must treat any object referenced by `data.original_image_url` as
live.

**R3.4.6 — Graceful degrade.** When the vendor is unconfigured, the endpoint
returns a structured `background_removal_not_configured` error (the same idiom
as the orders service's `stripe_not_configured`), and the inspector action is
hidden rather than shown-and-broken. This must be the behavior in local dev by
default.

**R3.4.7 — Budget guard.** A per-studio monthly call cap and a global daily cap
are enforced server-side. Exceeding a cap returns a structured error the UI
renders as "background removal limit reached", with the cap and the reset date.
Caps are configuration, not constants in code.

**R3.4.8** Mutations through `@patina/api-routes` are not retried by default —
do not enable retry for this endpoint. A double-submit would double-bill.

**R3.4.9** Vendor selection, key storage, and cost are an implementation
decision at build time; the endpoint contract in R3.4.3 must not leak which
vendor is in use to the client.

### R3.5 — Image pipeline

**R3.5.1** Uploads (Phase 1 R1.7.3, R1.7.5) are downscaled client-side before
upload when the source exceeds 2400px on the longest edge, preserving aspect
ratio and re-encoding to WebP where the browser supports it, with a JPEG
fallback. The original file is not uploaded.

**R3.5.2** Two variants are stored per uploaded image: the display image
(≤2400px) and a thumbnail (≤400px) at
`${ownerId}/boards/${boardId}/${uuid}-thumb.<ext>`. The rail, launcher covers,
and stacked mobile fallback consume the thumbnail; the composition and export
consume the display image.

**R3.5.3** The bucket stays **public-read**
([N8](./00-mood-board-prd.md#7-non-goals)). Nothing in this phase depends on
signed URLs.

**R3.5.4 — Orphan cleanup.** A scheduled job sweeps objects under
`*/boards/*` that no live row references:
- Implemented as a Supabase edge function invoked by **pg_cron** via
  `public.invoke_edge_function`, per the Agent OS scheduled-job convention.
  Run history lands in `job_runs`. No external host is involved.
- An object is **live** if it is referenced by any `proposal_board_items.data`
  field (`image_url`, `original_image_url`, thumbnail derivations),
  by any `project_boards` frozen snapshot, by any `board_templates` row
  (R3.6), or is a board `cover.png` for an existing board.
- Because Phase 1 R1.13.5 pastes images **by reference**, an object may be
  referenced from multiple boards. The sweep must count references across all
  boards, not just the board whose path prefix the object sits under.
- Objects are deleted only after a **14-day grace period** from last reference
  loss. The job records candidates on the first pass and deletes on a later one;
  it never deletes on first sight.
- The job is dry-run by default behind a configuration switch, and its first
  production runs must be dry-run with the candidate list reviewed.

**R3.5.5** Existing images uploaded before Phase 3 have no thumbnail. Consumers
fall back to the display image. No backfill is required; a backfill may be run
later as a one-off.

### R3.6 — Board templates

**Ruling #4 (Kody, 2026-08-03):** studio-saved templates **and** a small
Patina-seeded starter set.

**R3.6.1** A **Save as template** action in the room's overflow menu captures
the current board as a template: item geometry, `z_index`, `rotation`, item
types, `data` snapshots, section names and colors, canvas dimensions, and
background color.

**R3.6.2** A template **strips owner references**: no `product_id`,
`capture_id`, `palette_id`, no proposal or project id, no `created_by` beyond
the owning studio. Product pins are retained as `data`-snapshot-only
placeholders so the composition reads correctly and the designer replaces them.

**R3.6.3** Image references in a template point at bucket objects. A template
saved from a board keeps referencing the same objects; the orphan sweep must
therefore treat template-referenced objects as live (R3.5.4).

**R3.6.4** The "New board" flow offers a template picker with two groups:
**Patina starters** (seeded) and **Your studio** (saved). Choosing a template
materializes a new board with the template's composition.

**R3.6.5** Materialization creates real `proposal_board_items` rows under the
new board's owner. Nothing is shared or linked back to the template — a
template is a stamp, not a live reference.

**R3.6.6** A studio can rename and delete its own templates. Patina-seeded
starters are read-only and cannot be deleted by a studio.

**R3.6.7** The seeded starter set is small and opinionated — target 4 to 6
templates covering the common board shapes (e.g. single-room concept, palette +
materials study, furniture plan by zone, before/after). Exact set is a content
decision at build time.

---

## Out of scope for Phase 3

| # | Not in Phase 3 | Note |
|---|----------------|------|
| — | AI image editing / generative enhance | [N6](./00-mood-board-prd.md#7-non-goals) — the category arms race, not our differentiator |
| — | Layered PSD export | Morpholio has it; no demand evidence for Patina |
| — | Pinterest API | [N5](./00-mood-board-prd.md#7-non-goals) |
| — | In-house background removal (rembg/ONNX on the inference worker) | Explicitly deferred by Ruling #3 until volume justifies it |
| — | Making the bucket private / signed URLs | [N8](./00-mood-board-prd.md#7-non-goals) |
| — | Backfilling thumbnails for pre-Phase-3 images | R3.5.5 — optional one-off later |
| — | Board-to-spec generation (cut sheet, shoppable list) | [O3](./00-mood-board-prd.md#9-open-items) |
| — | Realtime presence | [O1](./00-mood-board-prd.md#9-open-items) |

**Cleanup decision due in Phase 3** ([O4](./00-mood-board-prd.md#9-open-items)):
whether to delete `board-editor.tsx` (1644 lines), `BoardCanvas.tsx`, and
`BoardStatic.tsx` once the flag is at 100% and no consumers remain. Deleting
them is the expected outcome; make the call explicitly rather than by drift.

---

## Migrations

One new table plus one seed. **Take the next `NNNNN` at build time**
(`ls supabase/migrations/*.sql | sort | tail -1`) — never a number from this
doc. Follow **patina-db-migrations**.

### `NNNNN_board_templates.sql`

| Element | Detail |
|---------|--------|
| `public.board_templates` | `id UUID PK DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `description TEXT`, `kind TEXT NOT NULL CHECK (kind IN ('seeded','studio'))`, `studio_id UUID` (null for seeded, FK to the studio/workspace owner for studio templates), `canvas_width INT NOT NULL`, `canvas_height INT NOT NULL`, `background_color TEXT NOT NULL DEFAULT '#FAF8F5'`, `sections JSONB NOT NULL DEFAULT '[]'`, `items JSONB NOT NULL DEFAULT '[]'`, `cover_url TEXT`, `created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` |
| Owner CHECK | `kind = 'seeded'` ⇒ `studio_id IS NULL`; `kind = 'studio'` ⇒ `studio_id IS NOT NULL` |
| `updated_at` trigger | Reuse `public.update_updated_at_column()` |
| Index | `(studio_id, updated_at DESC) WHERE studio_id IS NOT NULL`; partial index on `kind = 'seeded'` |
| RLS | Enabled. **Read:** any authenticated user may read `kind = 'seeded'`; a member may read their studio's templates (mirror the studio-membership helper pattern from 00316 — co-member policies must be `SECURITY DEFINER` helpers granted `TO authenticated`, or the policy 42501s). **Write:** studio members may insert/update/delete their own studio's templates only. **No one** may write `kind = 'seeded'` rows through RLS; those arrive by migration. |

### `NNNNN_seed_board_templates.sql`

- Inserts the 4–6 Patina starter templates as `kind = 'seeded'` rows.
- Idempotent: `ON CONFLICT DO NOTHING` on a stable natural key, and every row
  carries a seed marker per the repo's seed conventions so it can be identified
  and re-run safely.
- Any cover images for starters are committed as bucket objects under a Patina-
  owned prefix, not a user prefix, so the orphan sweep never considers them.

### Possible third migration

If R3.2.2 finds no existing JSONB field on `proposal_boards` to hold the cover
URL, add `cover_url TEXT` in the same build's migration. Prefer the existing
field; only add a column if there is genuinely nowhere to put it.

### Migration hygiene

- Schema-qualify extension functions (`extensions.uuid_generate_v5(...)`) — the
  prod `db push` session's `search_path` lacks `extensions`.
- Any GRANT/REVOKE change ⇒ regenerate the local ACL seed:
  `python3 scripts/generate-legacy-grants.py`.
- Wire the seed file into `config.toml [db.seed] sql_paths` if it is meant to
  run on local reset — unwired seed files silently do not run.
- After applying: `pnpm supabase:reset` then `pnpm db:generate`.

---

## Analytics

| Event | Properties | Fired when |
|-------|-----------|-----------|
| `board_exported` | `format` (`png` \| `pdf_composition` \| `pdf_spec_sheet`), `board_id`, `item_count`, `duration_ms`, `failed_image_count` | An export completes |
| `board_export_failed` | `format`, `board_id`, `reason` | An export aborts |
| `bg_removed` | `board_id`, `board_item_id`, `item_type`, `duration_ms` | A cutout is applied |
| `bg_remove_blocked` | `reason` (`not_configured` \| `budget_exceeded`), `board_id` | The action is refused |
| `template_used` | `source` (`seeded` \| `studio`), `template_id`, `board_id` | A board is created from a template |
| `template_saved` | `template_id`, `item_count`, `section_count` | A board is saved as a template |
| `url_unfurled` | `board_id`, `host`, `outcome` (`resolved` \| `failed`) | A pasted or dropped URL resolves or fails |

Feeds metric **M7** — `board_exported{format}` volume, and the composition share
of board exports (`pdf_composition` + `png` versus `pdf_spec_sheet`).

---

## Acceptance criteria

| AC | Criterion | Proves |
|----|-----------|--------|
| AC3.1 | PNG export of a board with all six pin types, 3 sections, and a rotated pin produces an image whose pin positions, sizes, and rotations match a screenshot of `BoardComposition` for the same board within a small pixel tolerance | R3.1.1.3, R3.1.1.4 |
| AC3.2 | Output is exactly `canvas_width × 2` by `canvas_height × 2` for a board under the 8192px cap, and uniformly scaled with a reported factor above it | R3.1.1.2 |
| AC3.3 | Text in the PNG uses the composition's font, verified after `document.fonts.ready`; a forced font-load failure produces system-stack text, not misplaced glyphs | R3.1.1.5 |
| AC3.4 | An image pin whose object is deleted from the bucket exports as a labelled placeholder and the export still completes, with the failure reported | R3.1.1.6 |
| AC3.5 | A 100-pin board exports PNG in under 10s and the UI remains responsive with determinate progress | R3.1.1.7 |
| AC3.6 | `spec-pdf` with `kind: 'board-composition'` returns a PDF whose page reproduces the composition; `kind: 'board'` still returns the tile grid unchanged | R3.1.2.1 |
| AC3.7 | The export menu presents "Composition" and "Spec sheet" as separate, labelled choices | R3.1.2.2 |
| AC3.8 | A board belonging to another designer returns 404 for both PDF kinds — not 403, not a distinguishable error | R3.1.2.6 |
| AC3.9 | The board composition PDF model type has no trade-price, markup, or margin field (verified by type, not by runtime filter) | R3.1.2.5 |
| AC3.10 | Every function importing `_shared/spec-pdf.ts` is enumerated and redeployed together; a stale importer is detectable and was not left behind | R3.1.2.8 |
| AC3.11 | Editing a board and waiting 30s produces a cover at `${ownerId}/boards/${boardId}/cover.png`; the launcher strip renders it; a board with no cover renders the fallback | R3.2.1–R3.2.4 |
| AC3.12 | Pasting a product URL creates a placeholder that resolves into a pin with `data.source_url` set and the host shown on the composition | R3.3.1, R3.3.3 |
| AC3.13 | A URL that cannot be scraped becomes an editable note carrying the URL — the pin never silently disappears | R3.3.1 |
| AC3.14 | The rail's Captures tab lists extension-created captures; dragging one creates a pin retaining `capture_id` | R3.3.4 |
| AC3.15 | "Remove background" produces a cutout at a new `-cutout.png` path, swaps `data.image_url`, retains `data.original_image_url`, and Revert restores the original. Both are single ⌘Z steps | R3.4.3, R3.4.4 |
| AC3.16 | With no vendor configured (default local dev), the inspector shows **no** Remove background action, and a direct API call returns `background_removal_not_configured` | R3.4.6 |
| AC3.17 | Exceeding the studio cap returns a structured budget error rendered as a readable limit message with the reset date; the vendor is not called | R3.4.7 |
| AC3.18 | The background-removal route is not configured for retry; a simulated timeout does not produce two vendor calls | R3.4.8 |
| AC3.19 | The client never receives any vendor identifier in a response body, header, or error | R3.4.9 |
| AC3.20 | A 6000px source upload lands as a ≤2400px display image plus a ≤400px thumbnail; the rail uses the thumbnail and the composition uses the display image | R3.5.1, R3.5.2 |
| AC3.21 | The orphan sweep dry-run on a seeded fixture lists exactly the unreferenced objects; an image referenced from a second board by paste, from a template, from a frozen `project_boards` snapshot, or as `original_image_url` is **not** listed | R3.5.4 |
| AC3.22 | The sweep deletes nothing on the first pass; a candidate is deleted only after 14 days without a reference; `job_runs` records each run | R3.5.4 |
| AC3.23 | Save-as-template produces a `board_templates` row with no `product_id`/`capture_id`/`palette_id` anywhere in `items`, and with section names preserved | R3.6.1, R3.6.2 |
| AC3.24 | New-board offers both groups; choosing a seeded starter materializes real `proposal_board_items` rows under the new board and no link back to the template exists | R3.6.4, R3.6.5 |
| AC3.25 | A studio can rename and delete its own templates; an attempt to delete or modify a `kind = 'seeded'` row is refused by RLS | R3.6.6, migration RLS |
| AC3.26 | A member of studio A cannot read, update, or delete a template belonging to studio B | migration RLS |
| AC3.27 | The seven Phase 3 events fire with the documented property sets | Analytics |

---

## Verification plan

No CI. Local gates only — **patina-verification**.

### Gate commands

| Scope | Command | Gates |
|-------|---------|-------|
| Migrations | `pnpm supabase:reset` then `pnpm db:generate` | Both migrations apply on a full replay; the seed runs only if wired into `config.toml` |
| RLS | A scratch SQL script asserting cross-studio denial and seeded-row immutability, run as two distinct authenticated roles | AC3.25, AC3.26 |
| Edge function | `supabase functions serve spec-pdf` locally, POST both `kind: 'board'` and `kind: 'board-composition'` | AC3.6, AC3.8 |
| Edge function tests | `supabase/functions/_tests/` (Deno) | Composition model shape, money invariant (AC3.9) |
| Design system | `pnpm --filter @patina/design-system test` and `build` | Painter geometry shared with `BoardComposition` |
| Media service | `pnpm --filter @patina/media test`, `build` | Background-removal endpoint contract, budget guard, unconfigured path |
| Designer portal | `pnpm --filter designer-portal type-check`, `test`, `lint`, `build` | Export UI, unfurl, inspector actions, template picker |
| E2e | `pnpm --filter designer-portal test:e2e` with the flag override | AC3.1 (visual), AC3.12, AC3.24 |

### Automated coverage by layer

**Painter unit tests** (vitest, in the design system alongside
`BoardComposition` so both consume one geometry fixture):
- pin placement, scale, and rotation math at 1× and 2×
- the 8192px cap and its reported scale factor
- per-type paint calls for all six types (assert draw-call sequence against a
  mocked 2D context — do not assert pixels here)
- failed-image placeholder path
- font-ready gating

**Visual regression**: a small fixture board rendered by `BoardComposition` in a
headless browser and by the painter, compared with a pixel-difference threshold.
This is the only meaningful guard on AC3.1 — a draw-call test will not catch a
transform error.

**Edge-function Deno tests**: composition model construction from a board row;
type-level assertion that no trade-money field exists; 404-collapse for foreign
boards; both `kind`s covered.

**Media-service Jest specs**: URL allow-list rejection of non-bucket sources;
vendor unconfigured → structured error; budget cap enforcement; no retry on
mutation.

**SQL fixture tests for the sweep**: build a fixture with (a) an unreferenced
object, (b) an object referenced by a second board via paste, (c) an object
referenced only as `original_image_url`, (d) an object referenced by a
`project_boards` snapshot, (e) an object referenced by a template, (f) a board
cover. Assert only (a) is a candidate, and that nothing is deleted on the first
pass.

**Playwright e2e**: paste a URL → pin resolves; export PNG → file downloads with
non-zero size and expected dimensions; create a board from a seeded template →
items exist.

### Manual walk checklist

| # | Check | ☐ |
|---|-------|---|
| 1 | Export PNG of a real, messy board and compare side by side with the on-screen composition at 100% | ☐ |
| 2 | Export the composition PDF and the spec-sheet PDF of the same board; open both in Preview and in Acrobat | ☐ |
| 3 | Print the composition PDF; confirm the composition survives paper | ☐ |
| 4 | Export a board with a rotated pin, a note with long wrapped text, and a palette strip | ☐ |
| 5 | Remove background on a product image, revert, remove again; confirm the original object still exists in the bucket | ☐ |
| 6 | Trip the budget guard deliberately and read the message | ☐ |
| 7 | Paste 5 different manufacturer URLs; note which unfurl and which fall back to a note | ☐ |
| 8 | Run the orphan sweep in dry-run against a copy of production data and read the full candidate list before ever enabling deletion | ☐ |
| 9 | Create a board from each seeded starter and confirm each reads as a usable starting point, not a demo | ☐ |

Deploy notes (**patina-deploy**, **patina-edge-functions**):
- `supabase functions deploy spec-pdf` — and redeploy **every** other function
  importing `_shared/spec-pdf.ts` in the same pass.
- Media service ships to Cloudflare Containers: `cd infra/media-worker && npx wrangler deploy`.
- Portals ship only via `./infra/deploy-portal.sh <name>`.
- Verify deploys by `wrangler deployments list` (oldest first — read the bottom)
  plus behavior probes. `/version` endpoints return static defaults and prove
  nothing.
