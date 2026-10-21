# Designer B — Systems / Claude layer: "The Edition"

Grounded in main at f1d83091d. Paths are under /Users/kody/Code/patina-merged/.

Governing rulings: V23 (docs/vision/VISION-DECISIONS.md:609-634; artifacts/claude-api-panel-2026-10-13/PROPOSAL.md:99-118) refuses generated imagery of the client's home and a client-facing chatbot; a person confirms every commit/send; model-backed features carry no label in the UI; "AI" banned everywhere (R3); homeowner data to a model requires the privacy page updated (R4). R142 (docs/design/the-document/DECISIONS.md:10845) bans stock and requires a provenance caption on every client image. V22: draft-first.

## 1. The Edition record

Precedent: `project_review_editions` (supabase/migrations/00434_ffe_privacy_domain_foundation.sql:294) already freezes snapshots with draft → published → superseded and a `snapshot_hash`. Copy its shape, not its table.

**`client_editions`** (migration 00843)
- `id`, `project_id` (RESTRICT), `edition_number` (UNIQUE with project), `status` CHECK IN (`drafting`, `awaiting_review`, `approved`, `superseded`, `failed`)
- `trigger_reasons text[]`, `source_hash text` (sha256 of the input set: item ids + image urls + statuses + phase + palette — debounces identical recomposition)
- `composition jsonb` — `{hero:{imageId,focal:[x,y]}, palette:{swatches:[{hex,role}], inkOnPaper}, chapters:[{key,roomId|phaseKey,headline,standing,template,imageIds[]}]}`
- `facts jsonb` — the frozen editorial allowlist per item, captured at compose time so the homeowner never reads live studio tables
- `overrides jsonb` — the designer's edits (hero, headline, caption whose/when, chapter order); applied at read, never destructive
- `prompt_version`, `llm_usage_ids bigint[]`, `attempt int`, `lease_owner`, `lease_until` (00677-style lease claim)
- `composed_at`, `reviewed_by`, `reviewed_at`, `approved_at`, `superseded_at`, `created_at`, `updated_at`
- Partial unique index: one `approved` and one `awaiting_review` per project.

**`client_edition_images`**
- `edition_id`, `item_id` (nullable), `rank` CHECK IN (`installed`, `studio`, `maker`, `silhouette`, `concept`) per R142, `storage_path`, `width`, `height`, `blurhash`, `dominant_hex`, `focal_x/y`, `alt`, `caption_what`, `caption_whose`, `caption_when`, `chapter_key`, `position`. Caption is three fields, not one string, so the "what · whose · when" form is a constraint, not a hope.

**`client_edition_requests`** (`project_id` PK, `requested_at`, `not_before`, `reasons text[]`) — the debounce inbox.

**Writers.** Only the edge function, through lease-checked RPCs: `claim_client_edition_work()`, `record_client_edition(p_edition_id, p_lease, p_composition, p_facts, p_images)`, `fail_client_edition`. Designer RPCs: `approve_client_edition`, `hold_client_edition`, `override_client_edition` — SECURITY DEFINER, gated on the 00807 access test (`can_buy_for_project` or lead). No table grants to `authenticated`.

**Reader.** `get_client_project_edition(p_project_id)` — SECURITY DEFINER, same access test as `get_client_project_threshold` (00840_client_wall_signed_name.sql:22), returns only the `approved` row with overrides merged, images as signed URLs. Allowlists per item: `name` (as signed, same COALESCE as 00840:71), `makerName` (vendors.name), `madeIn`, `material`, `finish` (project_ffe_specs), `dimensions` (selected_dimensions, formatted), `descriptionAsSigned` (products.description trimmed ≤280 chars at compose time), `roomName`. Never: prices, vendor cost, SKU, vendor URL, `notes`. Prices, logistics, approvals stay with `get_client_project_threshold`; the edition is the editorial layer laid over the same anchors, so `#ledger`, `#approvals` etc. keep their contract and the Threshold hook (apps/client-portal/src/hooks/use-commercial-client.ts) is untouched.

**Consent (V23 R4).** Two new disclosures: (a) maker names shown to the homeowner — a studio decision, a per-project switch in `projects.settings` (`client_page.show_makers`, default off) set in The Document; (b) item names, room names, and product photographs are sent to Anthropic for composition. The prompt must never carry `site_address`, household names, `project_notes`, prices, or `internal_notes`. The client portal has no privacy page today — only apps/designer-portal/src/app/(legal)/privacy/page.tsx. Phase 2 ships a client-portal privacy page as a branch for Kody's read, per R4.

## 2. Composition jobs

| Task | Who | Why |
|---|---|---|
| Image rank | code | R142 is a lookup on `source` + item status + room render presence |
| Caption what/whose/when | code | `item.name` · `vendors.name` or studio name · `created_at`; the model never invents provenance |
| Palette extraction | code | fetch the 48px rendition, k-means in the edge fn (port of packages/patina-design-system/src/components/ImagePaletteExtractor); no model |
| Contrast check | code | WCAG math; fail → swap to `--ink` on `--paper` |
| Layout template | code | three templates chosen by image count and aspect |
| Hero + focal point | Sonnet, vision | which plate leads and where its weight sits |
| Alt text per image | Sonnet, vision | same call as the hero |
| Chapter headlines + standing sentence | Sonnet, text | the editorial voice |
| Voice lint | Haiku, judge | after a deterministic regex pass against marketing/canon/lexicon.json |

**Call A — plates** (role `draft`, Sonnet 5.5 high, vision). Input: 6–12 image URL blocks + the facts JSON. Output schema: `{hero:{imageIndex, focal:[0–1,0–1], why}, images:[{index, alt ≤125 chars}]}`. **Call B — prose** (role `draft`, text). Input: facts, phase, room list, palette names, studio name. Output: `{chapters:[{key, headline ≤60, standing ≤160}], doorstep:{headline, standing}}`. **Call C — lint** (role `judge`, Haiku): returns `{violations:[{path, term}]}`; any hit → one regeneration of that chapter with the term named; second hit → chapter falls back to the deterministic headline (room name + phase word).

Request shape copies `buildDraftRequest` (supabase/functions/aesthete-dna-draft/lib.ts:340): system block = voice rules + lexicon + house-sheet caption form + JSON schema, `cache_control: ephemeral`; the volatile per-job content after the breakpoint. Use `output_config.format` for the schema; the validator still runs (refusal, truncation, out-of-range focal, "AI"/"artificial intelligence"/"generated" strings anywhere, headline length, contrast ≥4.5:1 on every ink/paper pair).

**Fallback edition (0 real images).** No model call. Hero = palette plate from `project_palettes.swatches`; each item gets `piece-silhouette.tsx`; chapters get the deterministic headline; caption reads "Reading chair · drawing by {studio} · photograph to follow". It still goes to review once, then auto-supersedes silently as images arrive (the designer approved the shape, not the pixels).

## 3. Triggers and cadence

AFTER triggers upsert `client_edition_requests` (`not_before = now() + 30 min`, reason appended) on: `project_ffe_item_images` insert/primary change; `project_ffe_items.status` → delivered/installed; `project_phases.status` change; `project_rooms.concept_render_url` set; `project_palettes` change; furnishing authorization signed; `projects.status` → closed.

`dispatch_client_edition_compose()` on pg_cron every minute, shaped like `dispatch_board_deck_import_resolve` (00677:832): no `job_runs` row, no `invoke_edge_function` unless a request is due AND the project has <2 editions today AND no `drafting` row holds a live lease AND `source_hash` differs from the latest edition. Lease 10 minutes; stale leases reclaimed. A new draft supersedes an unreviewed `awaiting_review` draft so the designer never sees two.

## 4. Designer approval loop

Where: the job's Document, a new **Press band** between the client mirror and the client-note composer (apps/designer-portal/src/components/document/client-mirror.tsx is already the enforceable "what the client sees" projection — the edition preview renders inside it with a thin banner: "Edition 4 of the Whitfield page · waiting for you"). One row on the Desk job card (desk-job-card.tsx) when an edition waits — a line, not a card (R143).

Controls, in draft-review.tsx's idiom (components/document/buying/draft-review.tsx): **Approve** (primary), **Hold** (stays draft; no re-draft until released), **Edit** — hero picker (any plate in the edition), inline headline/standing text, caption whose/when text, chapter drag order. Edits write `overrides`; Approve stores them and flips status. No "regenerate" button in V1 — that is a chatbot by another door.

Fatigue control: an edition whose only change is a new image in an already-approved chapter is marked `delta_only` and shows as a one-line diff ("Added: Study · photographed by you · 21 October"). A studio may set `auto_approve_delta_only` per project — V22 forbids schedule-send for model-written text, so this applies only when Call B did not run (plates changed, prose unchanged). Flag for Kody's ruling (C3).

No model name, no "Engine", no "AI" in either portal (R3). The band says "A new edition is ready", never why. The homeowner reads only `approved`.

## 5. Image pipeline

Hotlinked retailer URLs (`project_ffe_item_images.source='library'`) have no size, no stable host, and break. Options: (1) media worker (infra/media-worker) — right answer, blocked on docs/engineering/svc-media-shape-reconciliation-plan.md; (2) Supabase storage copy + `render/image` transforms — works today; `project-item-images` bucket and `storage_path` already exist (00807); (3) hotlink — violates the stability the hero needs.

**Phase 1–2: option 2.** A `copy` step in the compose edge fn fetches each library URL once (10 s timeout, ≤8 MB, image/* only), writes `${project_id}/editions/{hash}.jpg`, reads width/height from the header bytes, computes blurhash + dominant from a 32px decode, and stores on `client_edition_images`. Serve through `render/image?width=…&quality=…` at four widths; the client uses `<img srcset>` plus blurhash background (no next/image on Workers). Limits: retailer photos shown to a homeowner are the maker's copyright — defensible as the studio presenting a specified product to its own client, but the caption must name the maker and the image is never public. 403/hotlink-protected hosts fall to silhouette. Phase 3 swaps the copy step for the media worker; the edition schema does not change.

## 6. Cost model

Rates from supabase/functions/_shared/claude-models.ts: Sonnet 5.5 $2/$10 per MTok, cache read ×0.05; Haiku 5.5 $0.10/$0.50. Images downsized to 1024 px ≈ 1,100 tokens each.

Per edition: Call A — 10 images ≈ 11k + 3k facts + 4k cached system, 2k out ≈ $0.05. Call B — 4k + 4k cached, 1.5k out ≈ $0.024. Call C — Haiku ≈ $0.001. One lint regeneration 20% of the time ≈ $0.005. **≈ $0.08 per edition; $0.12 with a retry.** Fallback editions cost $0.

Cadence: cap 2/day; real jobs produce 3–8 editions/month during buying and install, ~1 in quiet months → **$0.25–$1.00 per active job per month**. A studio with 20 active jobs: $5–20/month, under the $50 cap. Global: `llm_feature_controls` row `client-edition-compose` with `daily_cap_usd = 5` (≈60 editions/day) under the $25 global cap.

## 7. Flag and rollout

Client UI: PostHog `client-edition-page`, via `useFeatureFlag` (apps/client-portal/src/hooks/use-feature-flag.ts, fail-closed, `NEXT_PUBLIC_FLAG_OVERRIDES` for e2e). Client accounts are gmail aliases, so `email_domain` cohorts are useless — target by the exact distinct_id of the test household, then by a `studio_id` person property. Server side: `llm_feature_controls.enabled=false` by default; `llm_studio_overrides` enables Middle West Studio only; the kill switch in `llm_controls` stops composition instantly, and approved editions keep rendering. Rollout: Middle West test household → Middle West all jobs → studios opting in → default.

## 8. Phased delivery

**Phase 1 — editorial restyle on today's data (M).** No Claude, no edition table. 00842: `get_client_project_editorial(p_project_id)` returning the §1 facts allowlist live, gated on `client_page.show_makers`; a designer RPC to set that flag. Client: new `threshold/editorial/` components — hero plate (R142 rank, deterministic), caption triplet, maker line, silhouettes, palette strip; chapters keyed on rooms; same anchors. Designer: one toggle in the job Document. Tests: jest on rank/caption/contrast; `threshold.spec` anchors unchanged; `homeowner-usability.spec` extended. Gate: `pnpm --filter @patina/client-portal type-check test test:e2e`. Flag: `client-edition-page`.

**Phase 2 — edition record, composition, approval (L).** 00843 tables + triggers + requests; 00844 lease RPCs + dispatcher + `llm_feature_controls` row; 00845 reader + designer RPCs. Edge fn `client-edition-compose` (`callClaude`, `promptVersion 'e1'`). Designer: Press band + mirror preview + Desk line. Client: reader hook, overrides merge, approved-only. Privacy page branch. Tests: Deno tests for the prompt builder/validator/lint; jest for the band; e2e approve → homeowner sees. Gate adds `supabase/functions` deno test and both portals' gates.

**Phase 3 — image pipeline, installed photo, close-out (M).** `installed` rank path from the Field app's uploads (source `upload` + item status installed) and a `closing` edition frozen with `projects.portfolio_snapshot`. Swap copy step to the media worker when reconciled. Tests: broken-link → silhouette; 403 → silhouette; close-out edition immutability.

## 9. Risks

1. Retailer image licensing — private bucket, maker named in every caption, `show_makers` consent, prefer studio uploads; a maker takedown list in `vendors`.
2. Voice drift — regex lint + Haiku judge + deterministic fallback headline; `prompt_version` pinned; weekly sample reviewed in the admin model-usage page.
3. Approval fatigue — 2/day cap, 30-min debounce, delta-only diff view, Hold; Phase 1 needs no approval.
4. Cost runaway — `source_hash` dedupe, feature daily cap $5, studio $50 cap, kill switch, lease prevents double runs.
5. Homeowner confusion on recomposition — page changes only on approve; `#previously` carries "Edition 4 · approved by Maren · 21 October"; hero changes at most once a day.
6. Accessibility regressions — alt validated for length and banned terms, contrast computed not trusted, `prefers-reduced-motion` on hero transitions; the a11y assertions in `homeowner-usability.spec` become the gate.
7. Prompt leaks homeowner data — prompt builder has an explicit allowlist and a test that fails on `site_address`, client names, prices.
8. Hotlink rot — copy-once step; nightly HEAD check demotes dead plates to silhouette on the next edition.

## 10. The 3-week cut

Ship Phase 1 whole and Phase 2 narrowed: Call B only (headlines + standing sentence, text, no vision), hero chosen by code (installed > studio > first maker photo), captions deterministic, no overrides beyond Approve/Hold, no privacy page beyond the branch, Middle West only. Cut: focal points, alt generation (use caption as alt), delta-only auto-approve, image copy step (hotlink, silhouette on error), close-out edition.
