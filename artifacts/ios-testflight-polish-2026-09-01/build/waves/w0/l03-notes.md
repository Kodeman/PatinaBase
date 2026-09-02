# First Flight · W0 · L0.3 — integration notes and the Kody runbook

Lane **L0.3**, agent half, ruling **D2**. Branch `first-flight/w0-l03`.
Rewritten after the adversarial review of 2026-09-02 (`RL03-01` … `RL03-18`).

Nothing in this file authorises a production write. §3 is the Kody-run block.

---

## 1. Notes I am sending

### O1 → **Steward / Fable** · the shared files, and the one merge conflict that is already known

**a. `supabase/config.toml` — the merged line, so the conflict is resolved once.**

L0.3 adds `'./seed/catalog/first-flight-catalog.sql'` after `'./seed/products.sql'`.
L0.7 (`first-flight/w0-l07`, commit `c1c86e9bb`) adds `'./seed/first-flight-client-fixture.sql'` after
`'./seed/project_documents_tasks.sql'` — **in both arrays**. They land on the same physical line, so
the merge conflicts by construction. Here is the final `[db.seed] sql_paths` line carrying both
(local array, line 60):

```
sql_paths = ['./seed/00-legacy-grants.sql', './seed/dev-accounts.sql', './seed/organizations.sql', './seed/vendors.sql', './seed/products.sql', './seed/catalog/first-flight-catalog.sql', './seed/designer-clients.sql', './seed/leads_room_scans.sql', './seed/client-rooms.sql', './seed/proposals.sql', './seed/proposal-captures.sql', './seed/decisions.sql', './seed/invoices.sql', './seed/schedule.sql', './seed/schedule-extremes.sql', './seed/project_documents_tasks.sql', './seed/first-flight-client-fixture.sql', './seed/paint_colors_seed.sql', './seed/procurement_workspace_dev.sql', './seed/procurement_receiving_dev.sql', './seed/procurement_notifications_dev.sql', './seed/aesthete_demo.sql', './seed/agent-tasks-dev.sql', './seed/fulfillment-vendor-profiles.sql', './seed/fulfillment-catalog-dev.sql', './seed/direct-orders-dev.sql', './seed/cloudflare-phase1-staging.sql', './seed/99-local-edge-settings.sql']
```

And the `[remotes.staging.db.seed]` array (line 88) — **L0.7's entry only**; L0.3 does not touch
staging, because round-one catalogue content is not staging scaffolding:

```
sql_paths = ['./seed/dev-accounts.sql', './seed/organizations.sql', './seed/vendors.sql', './seed/products.sql', './seed/designer-clients.sql', './seed/leads_room_scans.sql', './seed/client-rooms.sql', './seed/proposals.sql', './seed/proposal-captures.sql', './seed/decisions.sql', './seed/invoices.sql', './seed/schedule.sql', './seed/schedule-extremes.sql', './seed/project_documents_tasks.sql', './seed/first-flight-client-fixture.sql', './seed/paint_colors_seed.sql', './seed/procurement_workspace_dev.sql', './seed/procurement_receiving_dev.sql', './seed/procurement_notifications_dev.sql', './seed/aesthete_demo.sql', './seed/agent-tasks-dev.sql', './seed/fulfillment-vendor-profiles.sql', './seed/fulfillment-catalog-dev.sql', './seed/direct-orders-dev.sql', './seed/cloudflare-phase1-staging.sql']
```

**Why L0.3's entry is not optional**, given the review asked whether it should be dropped:
`scripts/run-sql-tests.sh` globs `supabase/tests/**/*.sql`, so it runs
`supabase/tests/catalog/first_flight_catalog_test.sql` on every suite run. Un-wire the seed and that
file has nothing to assert against on a bare stack — the lane's own gate becomes vacuous inside the
suite. The entry stays.

**b. The program-folder files that must be in Fable's `build/waves/w0/` commit.** The generated seed's
header names its source by **filename only**, and its instruction is "re-generate rather than patch",
which is unfollowable from a clean checkout if the manifests are not in the tree:

```
waves/w0/catalog-manifest.csv                     Leah's catalogue template
waves/w0/catalog-manifest-README.md               Leah's instructions (pieces + stories)
waves/w0/catalog-fixture.csv                      6 rows, repo photographs, mechanics only
waves/w0/editorial-manifest.csv                   Leah's editorial template (3 live story ids)
waves/w0/editorial-fixture.csv                    the 3 stories, mechanics only
waves/w0/editorial-bodies/*.md                    3 body files (today's live copy, verbatim)
waves/w0/l03-tasks.md   waves/w0/l03-notes.md
```

**c. The local stack, after this lane's third reset.** L0.3 reset at **15:07:51Z → 15:08:37Z** on
2026-09-02. A reset run from this worktree replays *this branch's* `config.toml`, which does not
carry L0.7's seed entry, so L0.7's client fixture was dropped. It was restored by hand immediately
afterwards and the stack is whole:

```
psql … -f .codex/worktrees/agent-ff-w0-l07/supabase/seed/first-flight-client-fixture.sql
NOTICE:  first-flight-client-fixture.sql: 3 client-visible documents, thread c0ff0000-…-000000000001 with 3 messages
```

Once the merged `config.toml` line above is on the integration branch, a reset there needs no such
repair.

---

### O2 → **L1-B** · the client-decode pin, and the empty-catalogue one-liner the D2 fallback needs

**a. The decode fixture.** The charter asks L0.3 to *"extend `PatinaTests/ProductDecodingTests` with a
fixture built from a real seeded row"*. `PatinaTests/**` is **not** in L0.3's owned-file map, so it
arrives as this note. `PROGRAM.md:2031` already gives L1-B a `ProductDecodingTests` task under
`C7-17` — **enter this as a numbered task in `l1-b-tasks.md` when W1 opens**, so it is scheduled work
rather than a note nobody read. Captured verbatim from `get_recommendations(null, null, 20, 0)`
against a locally seeded stack, after the fix round:

```json
{
  "id": "33ef1884-2a20-5467-879b-4a3e91cde8a9",
  "name": "Fixture Turned-Leg Side Chair",
  "tier": "designer_selection",
  "brand": "Fixture Chairworks",
  "badges": ["maker_piece"],
  "finish": "Original shellac",
  "category": "seating",
  "usdz_url": null,
  "image_url": "http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/33ef1884-2a20-5467-879b-4a3e91cde8a9/5acf9c6f-5ed7-51d2-9404-3148d2a4f21d.jpg",
  "dimensions": { "unit": "in", "depth": 20, "width": 18, "height": 36 },
  "maker_name": "Fixture Chairworks",
  "source_url": null,
  "style_tags": ["Rustic"],
  "description": "A fixture row. Turned legs, caned seat, original finish left alone.",
  "maker_story": null,
  "match_score": 50,
  "price_cents": 89000,
  "published_at": "2026-08-31T15:07:25.655739+00:00",
  "material_tags": ["ash", "cane"],
  "maker_location": "Bath, Maine",
  "patina_managed": true,
  "lead_time_weeks": 6,
  "photo_verified_at": "2026-09-02T15:08:25.655739+00:00",
  "shipping_flat_cents": null
}
```

Four things worth pinning while you are in there:

1. `category` arrives as **`"seating"`** — one of `ProductCategory`'s raw values — not `"chair"`.
   `A3-21` is closed at the source for every first-flight row, so
   `ProductCategory(normalizing:)`'s `chair`/`sofa` branch is now a hedge for legacy rows only.
2. `published_at` is **never null** on a first-flight row (`A3-22`), and `quality_score` is present on
   the minority of rows Leah scores — so `tier` is a real three-way, not a constant `new_arrival`.
3. `photo_verified_at` and `published_at` are **different moments** and must not be assumed equal.
   `published_at` is when the piece entered the catalogue; `photo_verified_at` is `now()` at the
   seeding pass. In the row above they are two days apart.
4. `usdz_url`, `maker_story`, `source_url` and `shipping_flat_cents` are **legitimately null**. The
   honest-absence branch must render nothing at all for them, not a placeholder.

**b. Reaching the empty catalogue, for `PatinaEmptyState`.** D2's fallback is the hedge the whole
ruling rests on, and it has to stay walkable. Correcting the review's premise on evidence first: the
local stack is **not** empty because of this lane. A clean reset yields **20** publishable catalogue
rows, only **6** of them first-flight — the other 14 pre-date L0.3 — so deleting this lane's rows
would not have got you there either. Use this instead, inside a transaction, and roll back when you
are done looking:

```sql
BEGIN;
UPDATE public.products SET status = 'draft' WHERE layer = 'catalog' AND status = 'published';
-- walk the app here
ROLLBACK;
```

Proven locally, rolled back:

```
 publishable_after
-------------------
                 0
 recommendations_after
-----------------------
                     0
```

Do **not** use `DELETE`: `fulfillment_writer_guard()` raises
*"direct writes to fulfillment_order_items are not permitted"* on the FK cascade. The `UPDATE` above
is the one that works, and it is exactly the state `get_recommendations` returns nothing from.

---

### O3 → **L1-D** · what the missing-image placeholder is actually for — **corrected**

`A-36` / `C-27` / `B-18` stay yours and stay needed. The first round told you four of twenty
catalogue rows render as nothing; that number was measured **after** an image upload the reset had
already destroyed, and it under-counted. Here are the measured numbers on a clean local stack, both
before and after the documented upload step.

**On a bare `pnpm supabase:reset`, before any upload — 12 of 20 render as nothing:**

| rows | why |
|---|---|
| 4 | `images` array is empty — `Oak Reading Chair`, `Unmapped Brass Sconce`, `Unmapped Oak Stool`, `Wool Kilim Runner` |
| 2 | images point at `https://fixtures.invalid/…` — `Phase One Published Catalog Chair` (`cf130000-…-000000000001`), `Phase One Published Catalog Stool` (`cf130000-…-000000000005`) |
| 6 | the first-flight fixture rows: their `product-images` URLs are real, but a reset drops the bucket's objects with the database |

**After the one documented command below — 6 of 20:** the 4 empty and the 2 `fixtures.invalid`. The
remaining 8 images are `images.unsplash.com` URLs, which need the network.

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03
python3 scripts/first-flight/upload-catalog-images.py \
  --manifest /Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-fixture.csv \
  --editorial /Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/editorial-fixture.csv \
  --profile fixture --overwrite \
  --supabase-url http://127.0.0.1:54321 \
  --service-key "$(cd /Users/kody/Code/patina-merged && supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
```

**Run it after every reset, not before.** That ordering was the review's blocker (`RL03-01`), and it
is now enforced rather than documented: `supabase/tests/catalog/first_flight_catalog_test.sql` case 10
counts the image URLs with no `storage.objects` row behind them, prints the number on every run, and
**asserts** it under `-v require_storage=1`.

Your reproduction case for the designed placeholder is the six rows in the "after" table — they are
honest absences, they never resolve, and they are reachable in a local walk with no setup at all.

---

### O4 → **Fable** · defects in the charter's own material, found by running it

| # | where | what happens | fix taken |
|---|---|---|---|
| 1 | `PROGRAM.md` L0.3, honesty query | `images = '[]'::jsonb` — `products.images` is `text[]` (`00001_initial_schema.sql:38`). The query errors; it does not return a wrong number. | `coalesce(array_length(images,1),0) = 0` |
| 2 | `PROGRAM.md` L0.3, spectrum query | `count(*) filter (where public._aesthete_product_spectrum(p.id) is not null)` → `ERROR: set-returning functions are not allowed in FILTER`. The function returns a table. | `LEFT JOIN LATERAL … sp ON true` + `count(sp.spectrums)` |
| 3 | `PROGRAM.md` L0.3, row contract | "`patina_managed` — `true` on the pieces meant to be buyable later" is not expressible: `products_catalog_requires_management` CHECKs `(layer <> 'catalog' OR patina_managed)`, and the `products_normalize_layer_defaults` BEFORE INSERT trigger sets it `true` for every catalog row regardless. `A3-20`'s "only 1 product is `patina_managed`" is therefore a fact about the *non-catalog* rows. | the seed states the constraint in a comment and does not pretend to choose |
| 4 | this lane's own first draft | Marking the seed's rows with a `first_flight` entry in `products.tags` ships that word to a tester: `get_recommendations` projects `tags` as `badges`, and `ProductDetailView.swift:484-505` renders badges under a **"PROVENANCE"** heading whose help copy reads *"Provenance badges signal verified claims about materials, craft, and origin."* | the marker moved to the derived id: `id = uuid_generate_v5('f1a57f11-9c74-4b3e-9c2f-1e5a0b7d4c10', slug)`, recomputed in SQL by `extensions.uuid_generate_v5` (schema-qualified — a bare call fails on Strata with 42883). SQL-test case 9 fails on **any** tag outside the four-word allow-list. |
| 5 | `PROGRAM.md` L0.3, "at least 8 with `published_at` inside the last 7 days" | The generator's own stagger produced **7** on a 30-row manifest (`count // 4`). A target missed by integer division. | ceiling division; a 30-row manifest now yields 8 (`RL03-14`) |
| 6 | `PROGRAM.md` L0.3, gate line 3 | The verbatim line `--check artifacts/…/catalog-manifest.csv` **cannot pass until Leah's file lands** — the template is a header row. Run today it prints `0 data rows … 1 error(s)`, exit 1, which reads as a lane failure rather than an empty inbox. | recorded in §5; the day-1..day-5 form is `--check … catalog-fixture.csv --profile fixture` |

Defects 1, 2, 4 and 5 were each found by executing the thing, not by reading it. 1 and 2 would have
cost Kody a failed prod probe; 4 would have shipped an internal string to a tester under a
verification claim.

---

### O5 → **Fable** · a judgement call worth confirming

`quality_score >= 80` makes `get_recommendations` return `tier = 'designer_selection'`, which the app
renders as a label. The validator therefore **rejects** a manifest where more than a third of rows
carry `>= 80` (and skips the rule below nine rows, so a partial file Leah is checking as she goes does
not fail on its first scored piece). That is a product judgement this lane made from VISION §6's
position on badges, not a charter instruction. If it is wrong, `MAX_HIGH_QUALITY_SHARE` in
`scripts/first-flight/build-catalog.py` is the one line to change.

### O5b → **Fable / W2** · why the spectrum rows are not marked machine-authored (`RL03-18`, declined)

The review asked for something on `product_style_spectrum` distinguishing rows this script wrote from
rows a designer saved. **Declined, and here is the reason rather than a silence.**
`00240_product_dna.sql:148-154` CHECKs `source IN ('manual','validated')`, so `'manual'` is the only
legal value the generator can write — the comment calling it "a designer save" is a comment, not a
constraint. `confidence` is a **per-dimension numeric map** (`{"warmth": 0.7, …}`) that
`_aesthete_spectrum_term` reads by key, so carrying a provenance string in it risks the scorer for no
gain.

The rows are already identifiable without a new column, and this is what the W2 recompute pass should
use:

```sql
select s.* from public.product_style_spectrum s
  join public.products p on p.id = s.product_id
 where p.slug is not null
   and p.id = extensions.uuid_generate_v5('f1a57f11-9c74-4b3e-9c2f-1e5a0b7d4c10'::uuid, p.slug);
```

When `services/aesthete-inference` is real it may overwrite exactly that set. The column is the
contract; the generator is replaceable.

---

### O6 → **Fable** · the fixture's photography, and a filename that lies

The review flagged `ff-fixture-turned-leg-side-chair` → `live-edge-coffee-table.jpg` as a reproduction
of `B-18` (a photograph that contradicts its row). **I opened the five files.** That one is
mis-*named*, not mis-mapped: `live-edge-coffee-table.jpg` is a photograph of a **turned-leg side chair
standing on grass**. The pairing was already right; the filename is what misled the review, and it is
not this lane's file to rename.

The other five mappings were re-cut so nothing contradicts:

| row | photograph | what is in it |
|---|---|---|
| `ff-fixture-oak-dining-table` (tables) | `heirloom-oak-dining-table.jpg` | a dining table, full width of the frame |
| `ff-fixture-turned-leg-side-chair` (seating) | `live-edge-coffee-table.jpg` | a turned-leg side chair (see above) |
| `ff-fixture-enamel-dome-pendant` (lighting) | `pendant-lamp.jpg` | a grey enamel dome pendant |
| `ff-fixture-glazed-stoneware-planter` (decor) | `planter-set.jpg` | a glazed ceramic planter |
| `ff-fixture-flatweave-dining-rug` (textiles) | `heirloom-oak-dining-table.jpg` | the pale flatweave rug running the full foreground of the same photograph — the row's description now says so |
| `ff-fixture-painted-pine-sideboard` (storage) | `heirloom-thumb.jpg` | **the room, not the piece** — and the row's description says exactly that |

The repository holds **five** product photographs (`artifacts/ios-daily-return-2026-08-26/mock/img/`,
duplicated under two other artifact folders; nothing else in `apps/` or `docs/` is product
photography) and the SQL test's case 4a requires **six** categories, so one row cannot have a
photograph of itself. Rather than let it pretend, the storage row's `description` reads:

> "A fixture row, and the only one whose photograph shows the room rather than the piece: the
> repository holds five product photographs and the fixture needs six categories."

Every fixture name begins "Fixture" and every description opens "A fixture row", so nothing here can
be mistaken for content. Leah's manifest replaces all six wholesale.

---

### O7 → **Fable / L2-G** · the two Python self-tests, and where they should run

`scripts/first-flight/catalog_selftest.py` (24 cases) and `scripts/first-flight/spectrum_selftest.py`
(11 cases) are this lane's tests-first tier for its Python. They are what proved the determinism, the
style-vocabulary refusal, the tag allow-list and — in this round — every one of the five validator
fixes. The review was right that nothing outside the lane runs them: they are not under
`supabase/tests/**`, so `scripts/run-sql-tests.sh` never sees them, and they have no CI hook.

They are named as a deliberate deliverable in `l03-tasks.md` task F9 and they are in the lane's gate.
`.github/workflows/**` is in no lane's owned map, so here is the exact final text for whoever owns the
quality gate — two lines in `.github/workflows/ai-quality-gate.yml`, in the job that already runs on
`pull_request`:

```yaml
      - name: First Flight catalogue pipeline self-tests
        run: |
          python3 scripts/first-flight/spectrum_selftest.py
          python3 scripts/first-flight/catalog_selftest.py
```

Both are pure Python 3 with no third-party imports and no database; they read five JPEGs from
`artifacts/ios-daily-return-2026-08-26/mock/img/` and run in under a second.

---

### O8 → **L1-D · L1-E · Leah** · the editorial contract, now enforced

The charter's L0.3 row contract ends *"plus 3 editorial stories with real hero images and
`read_minutes` derived from the body (`A3-17`, `GAP8-12`)"*. The **data** half is done and gated; the
halves that are not mine are named here.

What changed (proven locally, `psql` output):

```
             title              | read_minutes | has_hero | body_chars
--------------------------------+--------------+----------+------------
 The Grain Whisperer of Maine   |            1 | t        |        489
 Patina: The slow shape of home |            1 | t        |        386
 A defense of imperfect linen   |            1 | t        |        387
```

Before: `read_minutes` 4 / 3 / 5 over the same three bodies, `hero_image_url` NULL on all three.

- **→ L1-D** (`A3-17` is yours, W1). The hero-image half is now data: every tester-visible story
  carries a `product-images` URL, asserted by SQL-test case 11b, so the gradient fallback is the
  genuinely-image-less case rather than the normal case. What stays yours is how the card renders when
  a hero is missing, and the "1 min read" chip now telling the truth about a 90-word story — a story
  that short may deserve no chip at all, which is a design call, not a data one.
- **→ L1-E** (`GAP8-12` carries `alsoTouches: L1-E`). `read_minutes` is no longer a number anybody
  types: it is `max(1, floor(words / 200 + 0.5))`, computed by the generator and re-derived in SQL so
  the two cannot drift. If you want a story to say five minutes, the story has to be five minutes
  long. There is no `read_minutes` column in the manifest to argue with.
- **→ Leah** (via `catalog-manifest-README.md`, new final section). `editorial-manifest.csv` carries
  the **three live Strata story ids** already filled in, so an apply edits the three existing stories
  rather than adding a fourth to a surface that shows one. A hero photograph is **required** on each.
  Bodies live as `.md` files in `editorial-bodies/` and currently hold today's copy verbatim, so
  rewriting them in place is the whole job.

---

## 2. Notes I applied

| # | source | applied where |
|---|---|---|
| N1 | steward.md §4 reset order | L0.3 has now taken the reset three times; the third is **15:07:51Z → 15:08:37Z, 2026-09-02**, announced here and in the report. L0.7's fixture was restored by hand afterwards (O1c). |
| N2 | steward.md §7.1 | `get_recommendations` was run **only** against `127.0.0.1:54322`. The production probe is §3 step 7, Kody's. |
| N3 | steward.md §7.4 | Every `.md`, `.sql`, `.csv` and `.py` written with Write/Edit. No heredoc authored a file; the one inline SQL probe was written to disk with `Write` and run with `psql -f`. |
| N4 | steward.md §7.13 | No `printf … \| grep -q` anywhere; the probes are psql and Python exit codes. |
| N5 | ruling D2 | `catalog-manifest.csv`, `editorial-manifest.csv` and `catalog-manifest-README.md` are ready for Leah. The day-6 fallback call is §4. |
| N6 | PROGRAM.md L0.3 | Carried out as O3 (L1-D), O2 (L1-B) and O8 (editorial). |
| N7 | review `RL03-01` … `RL03-18` | Every blocker and major fixed; thirteen of fourteen minors taken; `RL03-18` declined with the reason in O5b. Task-by-task in `l03-tasks.md` §Fix round. |

No integration note addressed to L0.3 arrived from another lane between the two rounds (checked
`l01-notes.md`, `l02-notes.md`, `l02b-notes.md`, `l07-notes.md`).

---

## 3. KODY-RUN — seeding the catalogue and the three stories to Strata

Run this **after Leah's manifests and her photographs are in hand**, in order. Steps 1–6 are safe to
repeat. Step 7 **writes** (`match_events`, possibly `client_style_profiles`) and is the acceptance
gate.

Nothing below has a placeholder. The two credential lines read from `infra/.env`, matching
`demo-account.md`.

> **Ordering note.** On production the order is upload-then-apply (step 3 before step 5), because
> there is no reset. **Locally the order is reset → upload → apply**: `supabase db reset` drops the
> bucket's objects along with the database, so a local upload run before a reset is thrown away. That
> was the review's blocker and it is now enforced by SQL-test case 10.

### Step 0 — the shell, once

```bash
cd /Users/kody/Code/patina-merged
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export SERVICE_ROLE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export STRATA_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
export STRATA_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdmNpeGRtdXllamZ6Y2lqcGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjg0MzIsImV4cCI6MjA4Mzg0NDQzMn0.SPl6jHaeTp9McfF-AmXJUDKTwRaXD7Qf0hlve72rVg0
export CATALOG_OWNER_UID=74056c2a-866d-42b0-9e2a-d473c2484316
export PRODUCT_IMAGES_BASE=https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/public/product-images
export FF_W0=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0
export MANIFEST="$FF_W0/catalog-manifest.csv"
export EDITORIAL="$FF_W0/editorial-manifest.csv"
export LEAH_PHOTOS="$FF_W0/leah-photos"
export CATALOG_SQL="$FF_W0/first-flight-catalog-prod.sql"

test -n "$STRATA_DB_URL"    && echo "db url: loaded (${#STRATA_DB_URL} chars)"
test -n "$SERVICE_ROLE_KEY" && echo "service role key: loaded (${#SERVICE_ROLE_KEY} chars)"
ls -1 "$LEAH_PHOTOS" | wc -l
```

`STRATA_ANON_KEY` is the committed literal from `apps/client-portal/wrangler.jsonc` — a public value,
and the right principal for the anonymous acceptance probe. `LEAH_PHOTOS` is the folder the README
tells Leah to fill, and the manifests' relative image paths resolve into it.

### Step 1 — validate both manifests (no network, no database)

```bash
python3 scripts/first-flight/build-catalog.py --check "$MANIFEST" --profile release --editorial "$EDITORIAL"
```

Exit 0 or stop. It prints every problem at once with line numbers. `--profile release` enforces the
round-one floors — **≥ 30 rows · 6 categories · ≥ 3 makers · ≥ 3 pieces inside 7 days · 3 stories** —
on top of the per-row contract (a spectrum for every piece, a resolvable maker, an image that exists,
a category in the app's vocabulary, a hero photograph on every story).

### Step 2 — resize the photographs, if `--check` asked for it

```bash
sips -Z 1600 "$LEAH_PHOTOS"/*.jpg
```

Step 1 names any file that needs this and will not let it through.

### Step 3 — upload the photographs and the hero images to Strata storage

```bash
python3 scripts/first-flight/upload-catalog-images.py \
  --manifest "$MANIFEST" \
  --editorial "$EDITORIAL" \
  --profile release \
  --supabase-url "$STRATA_URL" \
  --service-key "$SERVICE_ROLE_KEY" \
  --uploader-uid "$CATALOG_OWNER_UID"
```

Pieces land as `product-images/74056c2a-…/<product id>/<uuid>.<ext>`; story heroes as
`product-images/74056c2a-…/editorial/<story id>/<uuid>.<ext>`. Both keep the 00542 convention — first
folder segment the catalogue owner's uid. Re-runs skip files already present; add `--overwrite` only
to deliberately replace one.

### Step 4 — generate the production SQL

```bash
python3 scripts/first-flight/build-catalog.py \
  --emit "$MANIFEST" \
  --editorial "$EDITORIAL" \
  --out "$CATALOG_SQL" \
  --profile release \
  --storage-base-url "$PRODUCT_IMAGES_BASE" \
  --uploader-uid "$CATALOG_OWNER_UID" \
  --assigned-by "$CATALOG_OWNER_UID"
```

Read the head of the file before applying it — it opens with the row count and the manifest it came
from. The file writes `vendors`, `products`, `product_style_spectrum` and `editorial_stories`, and it
opens with two guards and ends with a third.

### Step 5 — apply it, all or nothing

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -1 -f "$CATALOG_SQL"
```

`-1` is what makes it atomic: the file itself carries no `BEGIN`/`COMMIT`, because no other seed in
this tree opens a transaction and `pnpm supabase:reset` runs it too.

**Three things this step can say, and what each means:**

- `slug X already exists on a different row (…)` — Leah reused a slug that already belongs to a
  different Strata product. Without this guard the apply would have inserted a **second** published
  piece on that slug (`products.slug` has no unique index). Rename the manifest row or retire the old
  product; the script refuses to guess.
- `maker X matches N vendor rows` — two `vendors` rows share that name. Pick the surviving row,
  repoint anything referencing the other, re-run.
- `NOTICE: vendor X is_patina_catalog f -> true (pre-existing row)` — **not an error, but paste it
  into the apply report.** The apply flipped `is_patina_catalog` on a vendor that already existed.
  That flag gates `create_direct_order` (`A3-20`); `direct-orders` is off for round one, so the effect
  is deferred, not absent. The same branch fills a NULL `made_in` / `website` from the manifest and
  overwrites neither.

### Step 6 — the read-only checks, before spending a write

```bash
psql "$STRATA_DB_URL" -X -q -c "
with ff as (select p.* from public.products p
             where p.layer='catalog' and p.status='published' and p.slug is not null
               and p.id = extensions.uuid_generate_v5('f1a57f11-9c74-4b3e-9c2f-1e5a0b7d4c10'::uuid, p.slug))
select count(*) as publishable,
       count(*) filter (where coalesce(array_length(images,1),0)=0) as imageless,
       count(*) filter (where vendor_id is null) as makerless,
       count(distinct category) as categories,
       count(*) filter (where published_at > now() - interval '7 days') as new_this_week
from ff;"
```

Want: **publishable ≥ 30 · imageless 0 · makerless 0 · categories 6 · new_this_week ≥ 3**.

```bash
psql "$STRATA_DB_URL" -X -q -c "
select count(*) as publishable, count(sp.spectrums) as with_spectrum
from public.products p
left join lateral public._aesthete_product_spectrum(p.id) sp on true
where p.layer='catalog' and p.status='published';"
```

Want: **publishable = with_spectrum**. If they differ, step 7 returns zero rows and there is no reason
to spend the write finding that out.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -v min_publishable=30 -v require_storage=1 \
  -f supabase/tests/catalog/first_flight_catalog_test.sql
```

The same eleven cases the local gate runs, at round one's real floor and with the storage assertion
on, so a URL with no object behind it fails here rather than showing a tester a grey block. It ends in
`ROLLBACK` and writes nothing.

### Step 7 — the acceptance probe · **THIS WRITES**

`get_recommendations` inserts a `match_events` row and can insert a `client_style_profiles` row
(`A3-24`). Two callers, because the signed-in path resolves a different profile.

**7a — anonymous, over the real anon principal:**

```bash
curl -s -X POST "$STRATA_URL/rest/v1/rpc/get_recommendations" \
  -H "apikey: $STRATA_ANON_KEY" \
  -H "Authorization: Bearer $STRATA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_room_id":null,"p_category":null,"p_limit":20,"p_offset":0}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('rows:', len(d) if isinstance(d,list) else d); print(json.dumps(d[:2], indent=2) if isinstance(d,list) else '')"
```

Want: **rows ≥ 1**, and the two printed rows carry a real `maker_name` (never `Unknown Maker`), a
non-null `image_url`, and a `category` from the six.

**7b — as the demo account (D11), with the style quiz completed.** Sign in as
`firstflight@patina.cloud` in the app, finish the quiz, open Browse, and confirm the grid fills. Then
read the same thing server-side:

```bash
psql "$STRATA_DB_URL" -X -q -c "
select count(*) as rows_for_demo
from get_recommendations(null, null, 20, 0);"
```

That psql call runs with `auth.uid()` NULL, so it is a second anonymous read rather than the demo
account's — the demo-account half of 7b is the **in-app** check, not this line. Record what Browse
showed.

**7c — record the deliberate test rows:**

```bash
psql "$STRATA_DB_URL" -X -q -c "
select id, created_at, source from public.match_events order by created_at desc limit 4;"
```

Paste the four ids into the apply report. They are deliberate probe rows, not traffic.

### Step 8 — the eyes-on check

Open Browse on the review simulator pointed at **production** and confirm a full grid with real
photography and resolvable makers. Then open the home screen and confirm the story card shows a
photograph and a read time that matches the story. That is `G6`.

---

## 4. The day-6 fallback (D2), and who calls it

If Leah's manifests are not in hand by **end of day 6**, this lane calls the fallback and tells L1-B
the same day: build 1 ships an honest state on every product surface — the second half of `A4-02`'s
fix, L1-B's `PatinaEmptyState` work — and round one centres on the Studio surfaces. O2b is the
one-liner that makes that state reachable for the build and the walk.

The pipeline does not go away when the fallback is called. It is committed, proven locally, and the
runbook above works the day the manifests land, whether that is inside round one or after it.

---

## 5. Files, and three recorded deviations

**Committed on `first-flight/w0-l03`:**

```
scripts/first-flight/build-spectrums.py                 the mapping, and the refusal
scripts/first-flight/build-catalog.py                   manifests -> validated rows -> SQL
scripts/first-flight/upload-catalog-images.py           photographs + hero images -> product-images
scripts/first-flight/spectrum_selftest.py               11 cases
scripts/first-flight/catalog_selftest.py                24 cases
supabase/tests/catalog/first_flight_catalog_test.sql    11 cases + 2 reported lines
supabase/seed/catalog/first-flight-catalog.sql          generated from the two fixtures
supabase/config.toml                                    one entry added to [db.seed] sql_paths (O1a)
```

**Program folder, uncommitted — Fable commits `build/waves/w0/`** (the list is in O1b).

### Deviation 1 — `supabase/seed/products.sql` is untouched, and the "mirror" is a fixture

The charter names `supabase/seed/products.sql` as "a local mirror, so a fresh stack matches prod" and
lists it among L0.3's owned files. It is **unchanged**, and what a fresh stack now carries instead is
six rows named "Fixture …" with stand-in photography, wired in through `config.toml`.

The reasoning: wiring the generated file into the reset costs one line and moves no row that another
lane's fixtures depend on, where editing `products.sql` would rewrite a file five other suites read.
But it is a deviation, not a footnote, so: **the mirror becomes real the day Leah's manifest is
generated into `supabase/seed/catalog/first-flight-catalog.sql`** with the production storage base
URL — the same command as runbook step 4, pointed at the seed path. Until then a fresh local stack
matches prod's *shape*, not its content. **This belongs in the W0 exit record.**

### Deviation 2 — the charter's third gate line is red until Leah's file lands

`PROGRAM.md:1319` gives the verbatim line:

```bash
python3 scripts/first-flight/build-catalog.py --check artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-manifest.csv
```

Run today it prints `error: …: 0 data rows` and exits 1, because the template is a header row.
**That is an empty inbox, not a lane failure.** The day-1..day-5 form of the same gate, and the one in
this lane's report, is:

```bash
python3 scripts/first-flight/build-catalog.py --check "$FF_W0/catalog-fixture.csv" --profile fixture --editorial "$FF_W0/editorial-fixture.csv"
```

The charter's line becomes runnable at D2's manifest hand-off, and step 1 of the runbook is that line
with `--profile release`.

### Deviation 3 — the manifest paths in every gate command are absolute

`artifacts/…/build/waves/` exists only in the main checkout; it is untracked program-folder material
that Fable commits at wave close, so a repo-relative path resolves to nothing from a worktree. Every
documented command therefore names the absolute path, or `$FF_W0`, assigned in step 0.
