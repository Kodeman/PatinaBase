# Patina Vendor Pipeline — Cowork Instructions

**Location: `/vendor-pipeline/INSTRUCTIONS.md`**
**Last updated: April 2026**

> **Schema note (April 2026):** The pipeline lives in three tables — `public.pipeline_vendors`, `public.pipeline_vendor_scores`, and `public.cowork_tasks`. There is also an older, unrelated `public.vendors` table (catalog-side, from migration `00001`) with a completely different shape (`brand_story`, `contact_info`, `headquarters_city`). **Do not read from or write to `public.vendors`.** All pipeline operations use the `pipeline_*` tables.

---

## What This File Is

This is the master instruction set for Claude Cowork operating the Patina vendor pipeline. It lives in the root of the Cowork project folder. Every task Cowork performs reads from this file to understand its role, its boundaries, and its output formats.

Cowork is the engine. The Admin Portal at admin.patina.cloud is the dashboard. They share a Supabase database as their communication layer. Cowork reads pending tasks from the `cowork_tasks` table, executes them, and writes results back. Cowork never talks to the portal directly — only through the database and the local filesystem.

---

## Project Folder Structure

```
/vendor-pipeline/
├── INSTRUCTIONS.md              ← You are here
├── templates/
│   ├── vendor-qualification-rubric.md
│   ├── product-schema.json
│   ├── brand-voice-guide.md
│   ├── outreach-email-template.md
│   └── brief-template.md
├── prospects/
│   └── [vendor-slug]-scorecard.md
├── outreach/
│   ├── [vendor-slug]-brief.pdf
│   └── [vendor-slug]-email-draft.md
├── onboarding/
│   ├── [vendor-slug]/
│   │   ├── raw/                 # vendor's original files
│   │   ├── mapped/              # normalized to Patina schema
│   │   ├── images/              # downloaded & renamed images
│   │   └── import-ready.csv     # final file for Supabase import
├── feeds/
│   └── [vendor-slug]/
│       ├── latest.csv
│       └── sync-reports/
└── logs/
    └── task-log.md              # running log of completed tasks
```

---

## Database Connection

Cowork accesses Supabase using the **service_role key** (bypasses Row Level Security). The connection details live in the local `.env` — never hard-code them in committed files:

```
SUPABASE_URL=https://api.patina.cloud           # production (Kong gateway)
# or http://localhost:54321 for local dev
SUPABASE_SERVICE_ROLE_KEY=[stored in .env in this folder]
```

All database reads and writes use the Supabase REST API or the `supabase` CLI. When writing scripts, use:

```bash
# Read example (get pending tasks)
curl -s "${SUPABASE_URL}/rest/v1/cowork_tasks?status=eq.pending&order=created_at.asc" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

# Write example (update task status)
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/cowork_tasks?id=eq.${TASK_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status": "running", "picked_up_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

Or if writing Python/Node scripts, use the Supabase client library with the service role key.

---

## Task Execution Model

### How Tasks Arrive

1. A human clicks a button in the Admin Portal (e.g., "Generate Brief")
2. The portal writes a row to `cowork_tasks` with `status: 'pending'`
3. Cowork's scheduled polling picks up the task
4. Cowork sets status to `'running'`
5. Cowork executes the task
6. Cowork writes results to `output_payload`, `output_files`, and sets status to `'completed'` or `'failed'`

### Polling Cadence

Check for pending tasks every 5 minutes. For each pending task:

1. Read the task row
2. Set `status = 'running'` and `picked_up_at = NOW()`
3. Execute based on `task_type` (see task definitions below)
4. On success: set `status = 'completed'`, `completed_at = NOW()`, populate `output_payload` and `output_files`
5. On failure: set `status = 'failed'`, `error_message = [human-readable description]`, increment `retry_count`. If `retry_count < max_retries`, set `status = 'pending'` again for retry.

### Scheduled/Recurring Tasks

Some tasks run on a schedule without being triggered from the portal. These have `is_recurring = true` and a `cron_expression`. Execute them on schedule and update `last_run_at` after each run.

Current recurring tasks:
- **Weekly Prospect Scan**: Every Monday at 2:00 AM CT — `0 2 * * 1`
- **Feed Sync (per live vendor)**: Every Monday at 6:00 AM CT — `0 6 * * 1`
- **Data Quality Audit**: Every Friday at 9:00 AM CT — `0 9 * * 5`

---

## Task Type Definitions

### 1. `prospect_scan`

**Purpose:** Discover new furniture manufacturers that match Patina's criteria.

**Trigger:** Recurring (weekly) or manual from portal.

**Input payload:**
```json
{
  "categories_needed": ["lighting", "dining", "storage"],
  "scan_sources": ["furniture_today", "business_of_home", "ad_pro", "instagram"],
  "exclude_vendor_ids": ["uuid-1", "uuid-2"]
}
```

**Execution steps:**
1. Search trade publication sites (Furniture Today, Business of Home, AD PRO) for recent articles about new furniture lines, brand launches, and manufacturers expanding trade programs.
2. Search Instagram and industry directories for maker-driven furniture brands, prioritizing domestic manufacturing, heritage/craft positioning, and sustainable practices.
3. For each prospect found, check if they already exist in `pipeline_vendors` by name or website URL. Skip duplicates.
4. For new prospects, gather: name, website URL, location, product categories, approximate price range, company size.
5. Write new vendors to `pipeline_vendors` with `stage = 'discovery'` and `source = 'cowork_scan'`. Also generate a URL-safe `slug` (lowercase, hyphens, no special chars) — it is `UNIQUE NOT NULL`.
6. Auto-trigger an `auto_score` task for each new vendor by inserting a row into `cowork_tasks` with `task_type = 'auto_score'`, `vendor_id = [new id]`, `status = 'pending'`.

**Output payload:**
```json
{
  "prospects_found": 8,
  "prospects_added": 5,
  "prospects_skipped_duplicate": 3,
  "new_vendor_ids": ["uuid-a", "uuid-b", "uuid-c", "uuid-d", "uuid-e"]
}
```

**Output files:** None (data goes directly to DB).

---

### 2. `auto_score`

**Purpose:** Research a vendor and score rubric dimensions 1–4 (operational dimensions).

**Trigger:** After prospect discovery, or manual "Re-score" from portal.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "vendor_name": "Thos. Moser",
  "website_url": "https://thosmoser.com"
}
```

**Execution steps:**
1. Visit the vendor's website. Look for:
   - Trade/wholesale program page (evidence for Dimension 1: Drop-Ship Readiness)
   - Product catalog or line sheet — assess data structure (Dimension 2: Data Quality)
   - Pricing visible? MSRP listed? (Dimension 3: Margin Viability)
   - Search for the brand on Wayfair, Perigold, 1stDibs, Amazon (Dimension 4: Channel Conflict)
2. Score each dimension 1–5 using the rubric in `/templates/vendor-qualification-rubric.md`. Be conservative — when in doubt, score lower.
3. Upsert each score into `pipeline_vendor_scores` (unique key: `vendor_id, dimension`) with `scored_by = 'cowork'`. The table has a `weighted_score` column that is `GENERATED ALWAYS AS (raw_score * weight) STORED` — do not write to it. You must write `dimension_name` and `weight` alongside `raw_score` (the portal denormalizes these so it doesn't have to join).
4. Include evidence text for each score explaining what was found.
5. Recompute the vendor's aggregate columns on `pipeline_vendors` (see "Aggregate recomputation" below). The portal uses the same logic on its own mutation path, so Cowork must match it exactly.
6. Save a scorecard document to `/prospects/[vendor-slug]-scorecard.md`.

**Output payload:**
```json
{
  "scores": {
    "1_dropship": { "raw": 4, "evidence": "Active trade program, ships via Ryder Last Mile" },
    "2_data": { "raw": 3, "evidence": "PDF catalog only, no structured feed" },
    "3_margin": { "raw": 5, "evidence": "~60% MSRP-to-wholesale spread based on visible pricing" },
    "4_channel": { "raw": 5, "evidence": "Own DTC site + independent retailers, no marketplace exclusivity" }
  },
  "partial_score": 230,
  "scorecard_path": "/prospects/thos-moser-scorecard.md"
}
```

**Scorecard template (save to `/prospects/[slug]-scorecard.md`):**

```markdown
# [Vendor Name] — Qualification Scorecard

**Scored by:** Cowork (Dimensions 1–4)
**Date:** [date]
**Vendor URL:** [url]

## Dimension Scores

### 1. Drop-Ship Readiness (×15) — Score: [X]/5
[Evidence paragraph]

### 2. Data Quality (×15) — Score: [X]/5
[Evidence paragraph]

### 3. Margin Viability (×15) — Score: [X]/5
[Evidence paragraph]

### 4. Channel Conflict (×10) — Score: [X]/5
[Evidence paragraph]

## Partial Score: [X]/275

## Awaiting: Leah's review (Dimensions 5–8)

## Hard Veto Check
- [ ] Exclusive platform agreement: [Yes/No — details]
- [ ] No DTC shipping capability: [Yes/No — details]
- [ ] Margin below 30%: [Yes/No — details]
- [ ] Brand risk: [Yes/No — details]
```

---

### 2a. `rescore`

**Purpose:** Same as `auto_score` — re-run dimensions 1–4 research and write fresh scores — but triggered manually from the portal ("Re-score with Cowork" button on the vendor detail page) rather than after initial discovery.

**Trigger:** Manual from portal only.

**Input payload:**
```json
{
  "vendor_slug": "thos-moser"
}
```
(The portal includes `vendor_id` on the task row itself, so the payload is minimal.)

**Execution:** Identical to `auto_score`. Upsert the 4 operational dimension scores (the unique constraint on `(vendor_id, dimension)` means existing rows are overwritten), then recompute aggregates.

**Output payload:** Same shape as `auto_score`.

---

### 3. `generate_brief`

**Purpose:** Create a one-page research brief for Leah before an outreach call.

**Trigger:** Manual from portal (vendor detail → "Generate Brief").

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "vendor_name": "Thos. Moser",
  "website_url": "https://thosmoser.com"
}
```

**Execution steps:**
1. Deep-research the vendor: website, About page, press mentions, social media presence, any interviews or profiles.
2. Identify the trade contact (trade program page, LinkedIn search for wholesale/trade rep).
3. Summarize their brand story in 2–3 sentences using Patina's voice — warm, craft-forward, specific.
4. List their key product categories with approximate price ranges.
5. Note current retail/online channels.
6. Note any sustainability or craft credentials.
7. Write 3 suggested talking points for Leah's call (why Patina is a fit for them specifically).
8. Save as markdown to `/outreach/[vendor-slug]-brief.md`.

**Output payload:**
```json
{
  "brief_path": "/outreach/thos-moser-brief.md",
  "primary_contact": {
    "name": "Jane Smith",
    "role": "Trade Program Director",
    "email": "jane@thosmoser.com",
    "phone": null
  }
}
```

**Also update the vendor record** with contact info if found:
```sql
UPDATE pipeline_vendors SET
  primary_contact_name = 'Jane Smith',
  primary_contact_role = 'Trade Program Director',
  primary_contact_email = 'jane@thosmoser.com'
WHERE id = '[vendor_id]';
```

---

### 4. `draft_email`

**Purpose:** Draft an outreach email from Leah to the vendor's trade contact.

**Trigger:** Manual from portal.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "vendor_name": "Thos. Moser",
  "contact_name": "Jane Smith",
  "contact_email": "jane@thosmoser.com"
}
```

**Execution steps:**
1. Read the vendor's brief from `/outreach/[vendor-slug]-brief.md` if it exists.
2. Read the outreach template from `/templates/outreach-email-template.md`.
3. Draft a personalized email. The email comes **from Leah at Middlewest Studio** — NOT from Patina. The frame is: "I'm a designer who specifies your product. I'm building a technology platform that helps designers source and sell more of your furniture."
4. Keep it under 200 words. Warm, specific to their brand, not salesy.
5. Save to `/outreach/[vendor-slug]-email-draft.md`.

**Output payload:**
```json
{
  "email_path": "/outreach/thos-moser-email-draft.md",
  "subject_line": "Connecting from Middlewest Studio — love what you're building",
  "word_count": 178
}
```

**Important:** This is a DRAFT. Leah reviews and sends it herself. Cowork never sends emails.

---

### 5. `ingest_feed`

**Purpose:** Process a vendor's raw product data (CSV, PDF, or file dump) into Patina's product schema.

**Trigger:** Manual from portal when onboarding begins.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "vendor_name": "Room & Board",
  "raw_data_path": "/onboarding/room-and-board/raw/",
  "data_format": "csv",
  "field_hints": {
    "sku_column": "Item Number",
    "name_column": "Product Name",
    "price_column": "Retail Price"
  }
}
```

**Execution steps:**
1. Read the product schema from `/templates/product-schema.json`.
2. Read the raw data files from the vendor's onboarding folder.
3. If CSV: map columns to Patina schema fields. Use `field_hints` if provided, otherwise infer from column names.
4. If PDF: extract product tables using PDF parsing. Structure into rows.
5. For each product:
   - Map to schema: name, sku, dimensions (L×W×H), weight, materials, wholesale_price, msrp, finish options
   - Flag missing required fields
   - Generate a Patina-slug from the name
6. Download product images from vendor site if URLs are in the data. Rename to `[vendor-slug]-[sku]-[01|02|03].jpg`. Save to `/onboarding/[vendor-slug]/images/`.
7. Check image dimensions — flag any below 2000×2000.
8. Output a clean CSV to `/onboarding/[vendor-slug]/import-ready.csv`.
9. Output a mapping report showing what was mapped, what was missing, and what needs human review.

**Output payload:**
```json
{
  "products_processed": 47,
  "products_complete": 38,
  "products_missing_fields": 9,
  "missing_field_summary": {
    "dimensions": 5,
    "materials": 3,
    "images_below_threshold": 4
  },
  "import_csv_path": "/onboarding/room-and-board/import-ready.csv",
  "image_folder": "/onboarding/room-and-board/images/",
  "images_downloaded": 142,
  "mapping_report_path": "/onboarding/room-and-board/mapping-report.md"
}
```

---

### 5a. `normalize_data`

**Purpose:** Run a second pass over an already-ingested product set to normalize units, clean strings, dedupe finish variants, and standardize materials vocabulary. Split out from `ingest_feed` so operators can re-run normalization without re-downloading source files.

**Trigger:** Manual from portal, typically after an `ingest_feed` task completes but before the human review step.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "import_csv_path": "/onboarding/room-and-board/import-ready.csv"
}
```

**Execution steps:**
1. Load the `import-ready.csv` from the onboarding folder.
2. Normalize: units (inches vs cm), currency (always cents at rest), whitespace, title-case product names, canonical materials (e.g. "solid oak" vs "OAK").
3. Dedupe finish variants that represent the same SKU.
4. Re-emit the CSV in place and write a diff report to `/onboarding/[vendor-slug]/normalize-report.md`.

**Output payload:**
```json
{
  "rows_before": 47,
  "rows_after": 41,
  "dedupes": 6,
  "normalize_report_path": "/onboarding/room-and-board/normalize-report.md"
}
```

---

### 6. `feed_sync`

**Purpose:** Pull latest data from a live vendor's product feed and detect changes.

**Trigger:** Recurring (weekly per live vendor) or manual.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "vendor_name": "Room & Board",
  "feed_url": "https://example.com/trade-feed.csv",
  "data_format": "csv",
  "field_mapping": { "sku": "Item Number", "price": "Retail Price", "stock": "Available" }
}
```

**Execution steps:**
1. Download the latest feed file. Save to `/feeds/[vendor-slug]/latest.csv`.
2. Compare against previous sync (if exists): identify price changes, new products, discontinued products, stock level changes.
3. Generate a change report.
4. Update `pipeline_vendors.last_feed_sync_at` for this vendor.
5. DO NOT auto-import changes to the products table. The portal handles that after human review.

**Output payload:**
```json
{
  "products_in_feed": 312,
  "price_changes": 7,
  "new_products": 3,
  "discontinued": 1,
  "stock_changes": 22,
  "change_report_path": "/feeds/room-and-board/sync-reports/2026-04-15.md"
}
```

---

### 7. `image_audit`

**Purpose:** Scan a vendor's product images and assess quality.

**Trigger:** During onboarding or manual.

**Input payload:**
```json
{
  "vendor_id": "uuid",
  "image_folder": "/onboarding/room-and-board/images/"
}
```

**Execution steps:**
1. Scan all images in the folder.
2. For each: check dimensions, file size, format.
3. Flag images below 2000×2000.
4. Identify likely image types: hero (white background), lifestyle (room setting), detail (closeup).
5. Group by SKU based on filename convention.
6. Report which SKUs have hero images, which are missing, which have only lifestyle shots.

**Output payload:**
```json
{
  "total_images": 142,
  "images_above_threshold": 128,
  "images_below_threshold": 14,
  "skus_with_hero": 45,
  "skus_missing_hero": 2,
  "audit_report_path": "/onboarding/room-and-board/image-audit.md"
}
```

---

## Scoring Rules

When auto-scoring (task type `auto_score`), follow these rules strictly:

1. **Always reference the rubric document** at `/templates/vendor-qualification-rubric.md` for scoring criteria.
2. **Score conservatively.** If evidence is ambiguous, score one point lower than you think.
3. **Never score dimensions 5–8.** Those are Leah's. If you find brand/aesthetic information during research, include it in the scorecard as context for Leah, but do not assign a numeric score. (The portal's `/api/admin/vendors/[slug]/leah-review` endpoint rejects submissions for any dimension outside 5–8, and `scored_by_leah` on `pipeline_vendors` is how the Leah-queue logic decides when she's done. Writing Leah scores via Cowork will bypass her review UI and produce inconsistent state.)
4. **Check hard vetoes first.** Before scoring, verify none of the automatic disqualifiers apply (exclusive agreements, no DTC shipping, margin below 30%, brand risk). If a veto applies, set `has_hard_veto = true` and `veto_reason` on the vendor record, then skip scoring.
5. **Always include evidence.** Every score must have a text explanation of what was found and where.
6. **Use the portal's aggregate rules.** See "Aggregate recomputation" below. The portal applies identical logic on its own mutation path, so you MUST match it byte-for-byte or the UI will flicker when both systems touch the same vendor.

---

## Aggregate recomputation

Whenever Cowork writes to `pipeline_vendor_scores` (insert, upsert, or delete), it must immediately recompute and update four columns on the parent `pipeline_vendors` row. The portal runs the same routine server-side in `src/app/api/admin/vendors/[slug]/scores/route.ts` — keep them in sync.

Algorithm:

```
scores   = SELECT dimension, weighted_score, scored_by
           FROM pipeline_vendor_scores
           WHERE vendor_id = :vendor_id

total_score          = SUM(weighted_score)            -- always computed, never null
triage_level         = triage(total_score)            -- see table below
scored_by_kody       = COUNT(DISTINCT dimension WHERE scored_by IN ('cowork','kody')) >= 4
scored_by_leah       = COUNT(DISTINCT dimension WHERE scored_by = 'leah')              >= 4
awaiting_leah_review = scored_by_kody AND NOT scored_by_leah
```

**Triage (`total_score` → `triage_level`):**
- `>= 400` → `'green'`
- `>= 300` → `'yellow'`
- `>= 200` → `'orange'`
- `<  200` → `'red'`

**Note on partial scoring:** The portal ALWAYS computes a triage level from whatever weighted scores exist. A partial-scored vendor with only dimensions 1–4 can score at most 275 → triage will read `'orange'` or `'red'`. Use `awaiting_leah_review = true` (not a null triage) to signal "not yet fully evaluated" — the portal renders the Leah-queue banner off that flag, not off the triage color.

Write the update in a single statement right after the score upsert:

```sql
UPDATE pipeline_vendors
   SET total_score          = :total,
       triage_level         = :triage,
       scored_by_kody       = :k,
       scored_by_leah       = :l,
       awaiting_leah_review = :k AND NOT :l
 WHERE id = :vendor_id;
```

---

## Writing Standards

All documents Cowork generates (briefs, scorecards, reports) should follow these guidelines:

1. **Use Patina's brand voice** for anything client/vendor-facing: warm, specific, craft-forward. Reference `/templates/brand-voice-guide.md`.
2. **Use clear, factual language** for internal documents (scorecards, audit reports). No marketing speak. Just state what was found.
3. **Include timestamps** on all documents — date generated, date of data.
4. **Include sources** — if a score is based on information from a specific URL, include that URL.
5. **Use markdown** for all documents. No HTML, no DOCX. Markdown renders in the portal and is human-readable in the filesystem.

---

## Error Handling

When a task fails:

1. Write the error to `error_message` in plain language. Not a stack trace — a sentence explaining what went wrong. Examples:
   - "Vendor website returned 403 Forbidden — may require authentication or be blocking automated access."
   - "CSV file has 47 columns but field_mapping only covers 12. Unmapped columns: [list]."
   - "Image download failed for 3 URLs — server timeout after 30 seconds."
2. If the error is recoverable (timeout, temporary unavailability), increment `retry_count` and set status back to `pending`.
3. If the error requires human intervention (new CSV format, login required, mapping ambiguity), set status to `failed` and describe clearly what the human needs to do.
4. Log all errors to `/logs/task-log.md` with timestamp, task ID, vendor name, and error description.

---

## Security & Boundaries

1. **Never send emails directly.** Draft them and save to the filesystem. Leah sends them.
2. **Never modify the catalog `products` or legacy `vendors` tables directly.** Generate import-ready CSVs. The admin portal handles the actual catalog import after human review.
3. **Only write to `pipeline_vendors`, `pipeline_vendor_scores`, and `cowork_tasks`.** The `public.vendors` table is a different, catalog-facing thing — do not touch it.
4. **Never expose the service_role key** in any output file or log.
5. **Never access vendor systems that require authentication** without explicit credentials provided in the task's input_payload.
6. **Always write to the designated folder structure.** Don't create files outside `/vendor-pipeline/`.
7. **Rate-limit web research.** No more than 1 request per 2 seconds to any single domain. Respect robots.txt.

### Valid task types

The `cowork_tasks.task_type` column has a CHECK constraint accepting exactly these values — any insert with a different value will fail:

```
prospect_scan, auto_score, rescore, generate_brief, draft_email,
ingest_feed, normalize_data, feed_sync, image_audit
```

### Valid task statuses

The `cowork_tasks.status` column accepts: `pending`, `picked_up`, `running`, `completed`, `failed`, `cancelled`. The portal's cancel button only flips `pending → cancelled`; all other transitions are Cowork's responsibility.

---

## Task Log Format

Append to `/logs/task-log.md` after every task completion:

```markdown
### [YYYY-MM-DD HH:MM] — [task_type] — [vendor_name or 'system']
**Status:** completed | failed
**Duration:** Xm Ys
**Summary:** [One sentence describing what was done]
**Output:** [File paths or "DB only"]
**Notes:** [Any issues, warnings, or follow-up needed]
```

---

*Patina Vendor Pipeline · Cowork Instructions v1.0*
*Where Time Adds Value*
