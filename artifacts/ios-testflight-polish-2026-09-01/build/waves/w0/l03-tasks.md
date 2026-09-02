# First Flight · W0 · L0.3 — The room is not empty (agent half)

Lane: **L0.3**, agent half only. Ruling **D2**. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03`, branch `first-flight/w0-l03`,
base `3b7916db1`.

Read in this order before task 1: `rulings-2026-09-02.md` → `PROGRAM.md` §3 W0 L0.3 + §7 + §2 →
`waves/w0/steward.md` §4, §5 (L0.3 block), §7.

Nothing in this file authorises a production write. Every prod step is a Kody-run line, collected in
`l03-notes.md` §Kody-run and in the lane report's `kodyRun`.

---

## Standing lines (PROGRAM.md §7 requires all four before task 1)

### 1. `IOS_GATE_UDID`

**Not applicable to this lane, and deliberately so.** The steward's clone table
(`steward.md` §3) allocates simulator clones to **L0.1 (`8ED58095-…`)** and **L0.7 (`BD0AC7E5-…`)**
only. L0.3 owns no Swift file, builds no target and runs no simulator: its artefacts are three Python
scripts, one psql test, one generated seed and three Leah-facing documents. **This lane runs no
`xcodebuild` and no `xcrun simctl` command at all.** Its gate is `pnpm supabase:reset` + psql + the
validator (§Gate below).

The one iOS-adjacent claim the lane makes — that `ProductCategory`'s six raw values are the category
vocabulary — is a **file read**, not a build:
`apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:289-296`. The lane asserts nothing about the
binary. The client-side decode pin the charter asks for
(`PatinaTests/ProductDecodingTests` extended with a real seeded row) is an **integration note to L1-B**,
not a commit here — `PatinaTests/**` is not in L0.3's owned-file map and no lane may edit another
lane's files (steward.md §5).

### 2. The VISION check

> *Name any finding in my table whose fix would add or entrench something VISION §6 refuses (tab / zone
> / dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI" label) and say
> why it survives.*

L0.3's table is `A4-02` (blocker), `A3-21` (major), `A3-22` (major).

| finding | does the fix touch a VISION §6 refusal? | verdict |
|---|---|---|
| `A4-02` — the marketplace returns zero pieces | No UI at all. The fix is data: catalogue rows plus one `product_style_spectrum` row per row. It **removes** an empty grid rather than adding a surface. | survives |
| `A3-21` — every catalog row is `'lighting'` | Data only: the stored `category` string is normalised to the six `ProductCategory` raw values. No new navigation, no zone, no tab. | survives |
| `A3-22` — `published_at` / `quality_score` NULL everywhere | Data only. **One caution, recorded rather than waived:** `quality_score ≥ 80` makes `get_recommendations` return `tier='designer_selection'`, which the app renders as a **badge-like label**, and `match_score` renders as "*N*% match" (`ProductModel.swift:194`). VISION §6 refuses *badges* as decoration and engagement bait. It survives because the label is a **truth claim about the piece** (a designer did select it; the number is the engine's own score), not a count or a nudge — and because L0.3 does not invent either number: `quality_score` comes from Leah's manifest column and is absent when she does not supply it. **Two guards ship in the validator:** `quality_score` is never auto-filled, and `--check` errors when a manifest gives more than a third of its rows `≥ 80` (a "designer selection" that is most of the catalogue is decoration, and that is the VISION objection). |

Nothing in this lane prints "AI", "A.I.", "artificial intelligence" or "machine learning" — asserted by
a grep in task 9, over every file the lane writes.

`badges` in the `get_recommendations` projection is `p.tags`, and
`ProductDetailView.swift:484-505` renders it under a **"PROVENANCE"** heading whose help copy calls the
entries *"verified claims about materials, craft, and origin"*. So a tag is tester-visible copy making a
verification claim. **Two guards:** the validator rejects any manifest `tags` value outside a four-word
allow-list, and the pipeline puts **no** internal marker in that column at all — the seed's own rows are
identified by their derived id (`id = uuid_generate_v5(FIRST_FLIGHT_NS, slug)`), which
`extensions.uuid_generate_v5` recomputes in SQL. (An earlier draft did write a `first_flight` tag; it
was caught by reading a real `get_recommendations` row back and is recorded as Defect 4 below.)

### 3. The notes I must apply

Searched: `l02-notes.md`, `l02b-notes.md`, `retier-D1.md`, `steward.md`, `PROGRAM.md` §3 L0.3,
`rulings-2026-09-02.md`. Result:

| # | from | note | where it lands |
|---|---|---|---|
| N1 | steward.md §4 | **Reset ownership: L0.3 resets *second*.** L0.2 has finished its suite; L0.7 resets third and may not start before L0.3 reports finished. Announce start and finish. | task 8 |
| N2 | steward.md §7.1 / PROGRAM.md L0.3 | The acceptance probe `select count(*) > 0 from get_recommendations(null,null,20,0)` **writes** (`match_events`, possibly `client_style_profiles`). Never run it against production; the agent's own pre-check is read-only. | task 8 (local only), `l03-notes.md` §Kody-run |
| N3 | steward.md §7.4 | Markdown/SQL/shell authored with Write/Edit, **never** a Bash heredoc — the prod-mutation hook pattern-matches inside heredocs. | every task |
| N4 | steward.md §7.13 | `printf <big> \| grep -q` false-FAILs under `pipefail` (SIGPIPE). Probe scripts use a `case`-glob contains test. | task 5 (`upload-catalog-images.py` has no shell probe; recorded so the runbook lines avoid it) |
| N5 | rulings D2 | Manifest template to Leah **day 1**; pipeline proven locally **day 2**; the fallback call is **end of day 6**. | task 6, `l03-notes.md` |
| N6 | PROGRAM.md L0.3 | `A-36`/`C-27`/`B-18` (missing-image rendering) are **L1-D's** and are needed whether or not the catalogue lands. `A3-21`/`A3-22` carry `alsoTouches: L1-B`. | `l03-notes.md` §Notes out |

No note anywhere in `waves/w0/` is addressed to L0.3 by name. N1–N6 are the standing constraints that
bind it.

### 4. The notes I will send

Full text in `l03-notes.md`; summary:

| # | to | subject |
|---|---|---|
| O1 | **Steward / Fable** | `supabase/config.toml` `[db.seed] sql_paths` gains `./seed/catalog/first-flight-catalog.sql`. Shared file, not in any lane's owned map; it is the only way `pnpm supabase:reset` leaves a fresh stack matching prod, which is what the charter asks `supabase/seed/products.sql` to guarantee. **L0.7 resets after L0.3 and will pick this up** — six extra published catalogue rows on its stack. |
| O2 | **L1-B** | The client-decode pin the charter wants (`PatinaTests/ProductDecodingTests` against a real seeded row) — exact JSON fixture supplied, since `PatinaTests/**` is L1-B's. |
| O3 | **L1-D** | The seed guarantees `images` non-empty for every first-flight row, so the missing-image placeholder is a hedge for *pre-existing* rows, not for the new catalogue. Names the four local rows that would show it. |
| O4 | **Fable** | Three defects in the charter's own SQL, found by running it (§Defects below). The honesty query and the spectrum query as written in `PROGRAM.md` do not execute. |
| O5 | **Fable / L0.2** | `products_catalog_requires_management` forces `patina_managed = true` on **every** catalog row; the charter's "true on the pieces meant to be buyable later" cannot be honoured selectively. |

---

## Defects in the charter's own SQL, found by running it

Recorded here because the fix changes what this lane writes.

1. **`images = '[]'::jsonb` does not execute.** `products.images` is `text[]`
   (`00001_initial_schema.sql:38`), not `jsonb`. The imageless count must be
   `coalesce(array_length(images,1),0) = 0`.
2. **The spectrum count does not execute.** `_aesthete_product_spectrum` is a **set-returning**
   function; `count(*) filter (where public._aesthete_product_spectrum(p.id) is not null)` fails with
   `ERROR: set-returning functions are not allowed in FILTER`. It must be a `LEFT JOIN LATERAL` and
   `count(sp.spectrums)`.
3. **`patina_managed` is not a choice.** `CHECK ((layer <> 'catalog') OR (patina_managed = true))`
   plus the `products_normalize_layer_defaults` BEFORE INSERT trigger force it `true` for every catalog
   row. The seed cannot express "true only on the buyable ones".
4. **A provenance tag would have shipped as a "verified claim".** Marking the seed's rows with a
   `first_flight` entry in `products.tags` — the obvious way to make them countable — puts the word in
   front of a tester on the piece detail, under a heading that says Patina verifies it. Found by
   reading a real `get_recommendations` row back after the first local apply, not by reading the
   charter. The marker moved to the derived id.

---

## Tasks

Each task: write the failing check → run it and see it fail → implement → run it and see it pass →
commit with explicit pathspecs.

---

### Task 1 — the spectrum mapping, and its refusal

**Failing test.** `scripts/first-flight/spectrum_selftest.py` — a stdlib-only self-test that
(a) resolves a known style/material/palette triple to a fixed six-dimension vector, (b) asserts every
dimension lands in `[-1, 1]`, (c) asserts an **unknown style raises** `SpectrumUnresolved`, (d) asserts
determinism (same input twice → identical output).

**Run.** `python3 scripts/first-flight/spectrum_selftest.py` → fails, module absent.

**Implement.** `scripts/first-flight/build-spectrums.py`:

- `STYLE_SPECTRUM` — Leah's style vocabulary → the six dimensions
  `warmth · complexity · formality · timelessness · boldness · craftsmanship`, the exact set
  `_aesthete_product_spectrum` reads (`00244_aesthete_match_rpc.sql:214-269`), each in `[-1, 1]`.
  Every value carries a comment naming who chose it and why (the charter requires the mapping table to
  name its author; it is this lane, under D2, and the file says so).
- `MATERIAL_ADJUST`, `PALETTE_ADJUST` — small signed deltas keyed on words, summed then clamped.
- `resolve_spectrum(style, materials, palette) -> (spectrum, confidence, provenance)`; raises
  `SpectrumUnresolved` when `style` is outside the vocabulary. **No default, no neutral fallback** —
  the charter's rule is that a row without a spectrum is not publishable.
- `confidence`: `source='manual'` and a per-dimension map, so
  `_aesthete_product_spectrum` returns the canonical branch at the 0.7 manual default rather than the
  draft branch.
- CLI: `--list-styles`, `--explain <style>`, `--check <manifest.csv>` (every row resolves or the
  process exits 1 naming the rows).

**Run.** `python3 scripts/first-flight/spectrum_selftest.py` → passes.

**Commit.** `feat(first-flight): hand-authored product spectrum mapping (L0.3)` —
`scripts/first-flight/build-spectrums.py scripts/first-flight/spectrum_selftest.py`

---

### Task 2 — the manifest contract and the validator

**Failing test.** `scripts/first-flight/catalog_selftest.py` — asserts, against temporary CSVs written
by the test itself: a row missing `image_1` is rejected; a category outside the six `ProductCategory`
raw values is rejected; a blank optional column becomes SQL `NULL` and never a placeholder string; a
`price_retail_usd` that is not a positive number is rejected; a maker named `Unknown Maker` is
rejected; a `tags` value outside the allow-list is rejected; more than a third of rows at
`quality_score ≥ 80` is rejected; and `--profile release` rejects a manifest with fewer than 30 rows,
fewer than 6 categories, fewer than 3 makers or fewer than 3 rows published inside 7 days.

**Run.** → fails, module absent.

**Implement.** `scripts/first-flight/build-catalog.py`, stdlib only (Python 3.9 on this machine — no
`match`, no `X | Y` annotations):

- Loads `build-spectrums.py` by path (`importlib.util.spec_from_file_location`) because a hyphenated
  filename is not importable and the charter fixes both names.
- Reads the manifest, validates every row, and **refuses to emit a row without a spectrum**.
- Deterministic ids: `product_id = uuid5(FIRST_FLIGHT_NS, slug)`, image object name
  `uuid5(FIRST_FLIGHT_NS, product_id + '/' + index)` — so `build-catalog.py` and
  `upload-catalog-images.py` agree on every path with no shared state, and a re-run does not orphan
  the previous upload.
- Emits idempotent SQL: vendor resolve-or-insert by `lower(name)` (there is **no** unique constraint on
  `vendors.name`, so `ON CONFLICT` is not available and a name matching more than one row raises),
  then `INSERT … ON CONFLICT (id) DO UPDATE` for `products`, then
  `INSERT … ON CONFLICT (product_id) DO UPDATE` for `product_style_spectrum`.
- Modes: `--check <manifest>` (validate only, exit non-zero on any error), `--emit <manifest> --out
  <path>`, `--profile fixture|release`, `--storage-base-url`, `--uploader-uid`, `--assigned-by`.
- Honesty: an empty optional cell emits `NULL`. `published_at` uses the manifest value when given,
  otherwise a deterministic stagger across the last 8 weeks with the newest rows inside 7 days — and
  the generated file's header says in one line that `published_at` means *when the piece entered the
  Patina catalogue*, which is the only thing it is asserting.

**Run.** `python3 scripts/first-flight/catalog_selftest.py` → passes.

**Commit.** `feat(first-flight): catalogue manifest validator and SQL generator (L0.3)` —
`scripts/first-flight/build-catalog.py scripts/first-flight/catalog_selftest.py`

---

### Task 3 — the Leah-facing template and README

**Check.** `python3 scripts/first-flight/build-catalog.py --check <template>` must exit **non-zero**
with "0 data rows" — a header-only template is not a manifest, and the validator must say so rather
than emitting an empty seed.

**Implement.** `waves/w0/catalog-manifest.csv` (header row only) and
`waves/w0/catalog-manifest-README.md`: every column, required vs optional, the photo requirements
(≤ 1600 px long edge, JPEG q80, JPEG/PNG/WebP/AVIF/HEIC, ≤ 50 MB — the bucket's own
`allowed_mime_types` and `file_size_limit`), the honesty rule (blank means absent, never a guess), the
style vocabulary `build-spectrums.py --list-styles` prints, and the four release-profile floors
(≥ 30 rows · 6 categories · ≥ 3 makers · ≥ 3 rows inside 7 days).

**Run.** the `--check` above; confirm exit 1 and the message.

**Commit.** *(program-folder files; Fable commits `build/waves/w0/` — no lane commit)*

---

### Task 4 — the fixture manifest

**Check.** `python3 scripts/first-flight/build-catalog.py --check --profile fixture <fixture>` exits 0;
the same file under `--profile release` exits **non-zero** naming the floors it misses. That negative
run is what proves the release gate fires — the fixture itself can never reach 30 rows.

**Implement.** `waves/w0/catalog-fixture.csv`, 6 rows over the six `ProductCategory` values, every
`image_1` an existing repo file. The repo holds **five** product photographs, all under
`artifacts/ios-daily-return-2026-08-26/mock/img/`; the fixture states in its own header that two rows
read the same dining-room photograph and that it is a **mechanics fixture, never shipped**.

**Run.** both `--check` runs.

**Commit.** *(program-folder file)*

---

### Task 5 — the image pipeline

**Failing test.** `--dry-run` against the fixture must print six `PUT` targets under
`product-images/<uid>/<product_id>/<uuid>.<ext>` and exit 0 **without a network call**; a missing local
file must exit non-zero naming it.

**Implement.** `scripts/first-flight/upload-catalog-images.py`, stdlib only
(`urllib.request`), the Storage REST API so local and prod are the same code path:

- `--supabase-url` + `--service-key` (env `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`), `--uploader-uid`,
  `--manifest`, `--dry-run`, `--overwrite`.
- Object name from the same `uuid5` derivation as task 2, first folder segment = `--uploader-uid`, so
  the 00542 INSERT policy (`(storage.foldername(name))[1] = auth.uid()::text`) is satisfied when the
  upload runs as that account and the path is still correct under the service key.
- Refuses a file over the bucket's limit or outside its mime list; refuses a long edge > 1600 px
  unless `--allow-oversize`, and prints the `sips -Z 1600` line to fix it.
- Never writes to production by itself: `--supabase-url` has no default.

**Run.** the two checks above.

**Commit.** `feat(first-flight): catalogue image upload pipeline (L0.3)` —
`scripts/first-flight/upload-catalog-images.py`

---

### Task 6 — the SQL test

**Failing test.** `supabase/tests/catalog/first_flight_catalog_test.sql` against the **current**
(un-seeded) stack must fail with a message naming the count that is wrong.

**Implement.** House style: plain psql, `ON_ERROR_STOP=1`, `BEGIN` … DO-block `ASSERT`s … `ROLLBACK`
(the shape of `supabase/tests/aesthete/aesthete_space_test.sql`). Asserts, all scoped to
`'first_flight' = ANY(tags)` because the local stack carries pre-existing dev-seed catalogue rows that
belong to other fixtures (`cf13…` phase-one rows, `bff0…` unmapped rows) and are not this lane's to
change:

1. `publishable ≥ :min_publishable` (psql variable, default **30** = Leah's bar; the fixture run passes
   `-v min_publishable=6`).
2. `imageless = 0`, using `array_length` — see Defect 1.
3. `makerless = 0`, and **no** first-flight row resolves to `'Unknown Maker'`.
4. `count(distinct category) = 6`, and every value is one of the six `ProductCategory` raw values.
5. `new_this_week ≥ 3`.
6. **every** first-flight publishable row has a non-null `_aesthete_product_spectrum` — a
   `LEFT JOIN LATERAL`, see Defect 2.
7. `published_at` and `quality_score` are non-null on every first-flight row (`A3-22`).
8. A `RAISE NOTICE` reporting the same five counts **unscoped**, so the whole-stack picture is visible
   without failing the gate on rows this lane does not own.

**Run.** fail on the un-seeded stack; pass after task 8's seed.

**Commit.** `test(first-flight): catalogue honesty and spectrum assertions (L0.3)` —
`supabase/tests/catalog/first_flight_catalog_test.sql`

---

### Task 7 — generate the seed and wire the reset

**Check.** `supabase/seed/catalog/first-flight-catalog.sql` re-generated twice from the same fixture is
byte-identical (determinism), and applying it twice leaves the same row counts (idempotence).

**Implement.** Generate the file from `catalog-fixture.csv` with the local storage base URL and the
local uploader uid; add `'./seed/catalog/first-flight-catalog.sql'` to `[db.seed] sql_paths` in
`supabase/config.toml`, immediately after `./seed/products.sql`. **`supabase/seed/products.sql` is not
touched** — the charter's "local mirror, so a fresh stack matches prod" is delivered by the new seed
file being in the reset path, and editing `products.sql` would move rows other lanes' fixtures depend
on. `[remotes.staging.db.seed]` is left alone: this catalogue is round-one content, not staging
scaffolding, and the derivation rule in that file's comment is about the local/staging delta, not about
adding content to staging.

**Run.** the determinism + idempotence checks.

**Commit.** `feat(first-flight): generated fixture catalogue seed, wired into the local reset (L0.3)` —
`supabase/seed/catalog/first-flight-catalog.sql supabase/config.toml`

---

### Task 8 — the local proof (**the second reset of W0**)

Announce start in the report. L0.2 has finished; L0.7 may not start until this finishes.

1. Upload the fixture images to **local** storage:
   `python3 scripts/first-flight/upload-catalog-images.py --supabase-url http://127.0.0.1:54321 …`
2. `pnpm supabase:reset` (unsandboxed).
3. The read-only pre-check — the five honesty counts (Defect 1's form) and the spectrum count
   (Defect 2's form). Record verbatim.
4. `psql … -v min_publishable=6 -f supabase/tests/catalog/first_flight_catalog_test.sql`.
5. `python3 scripts/first-flight/build-catalog.py --check --profile fixture <fixture>`.
6. **Local only, never prod:** `select count(*) > 0 from get_recommendations(null, null, 20, 0);` and
   the first rows it returns, so the lane can say whether the marketplace is non-empty — this is the
   `A4-02` gate and it writes a `match_events` row on the local stack, which is free.

Announce finish.

**Commit.** none (evidence goes in the report).

---

### Task 9 — copy and provenance sweep

**Check.** Over every file this lane wrote:
`grep -riE '\bA\.?I\.?\b|artificial intelligence|machine learning|journey|curated|elevated|bespoke'`
returns nothing a tester would read (`patina-brand-voice`; steward.md §7.12), and
`git status --porcelain` (unsandboxed, in the worktree) shows nothing the lane does not own.

**Commit.** none.

---

### Task 10 — notes and the Kody runbook lines

Write `waves/w0/l03-notes.md` with O1–O5 in exact final text, plus the **Kody-run** block: the prod
image upload, the prod row apply, the two acceptance probes, and the `match_events` ids to record —
every command placeholder-free, variables assigned at the top.

**Commit.** *(program-folder file)*

---

## Gate

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03
pnpm supabase:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q -v ON_ERROR_STOP=1 \
  -v min_publishable=6 -f supabase/tests/catalog/first_flight_catalog_test.sql
python3 scripts/first-flight/build-catalog.py --check --profile fixture \
  /Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-fixture.csv
python3 scripts/first-flight/spectrum_selftest.py
python3 scripts/first-flight/catalog_selftest.py
```

Two deviations from the charter's verbatim gate lines, both forced:

- `$SUPABASE_DB_URL` is not exported in this environment; the literal local URL is used and printed.
- The manifest path is **absolute**. `artifacts/…/build/waves/` exists only in the main checkout — it
  is untracked program-folder material that Fable commits at wave close — so the repo-relative form in
  the charter resolves to nothing from a worktree.

`-v min_publishable=6` is the fixture floor. Leah's manifest runs the same file with the default 30.

---
---

# FIX ROUND — adversarial review of 2026-09-02 (RL03-01 … RL03-18)

Same lane, same branch, fresh context. Eighteen findings: **1 blocker, 3 majors, 14 minors.** Every
blocker and major is fixed; the minors are all cheap and all taken except **RL03-18**, declined below
with a written reason.

## Standing lines, restated for the fix round

### 1. `IOS_GATE_UDID`

**Still not applicable, for the same reason and now with a second one.** The steward's clone table
(`steward.md` §3) allocates clones to **L0.1** and **L0.7** only; this lane owns no Swift file, builds
no target and runs no simulator. The fix round adds Python, SQL and markdown and nothing else. **No
`xcodebuild`, no `xcrun simctl`, no `IOS_GATE_UDID` export.** The gate is the §Fix-round gate below.

### 2. The VISION check, re-run over the fix round's new surface

The fix round adds one thing the original did not have: **editorial rows** (`RL03-03`, charter L0.3
"plus 3 editorial stories", findings `A3-17` ⇢ L1-D/W1 and `GAP8-12` ⇢ L0.3/W2).

| new surface | does it touch a VISION §6 refusal? | verdict |
|---|---|---|
| `editorial_stories.read_minutes`, now **derived** from the body at 200 wpm rather than asserted | It **removes** a claim rather than adding one. The old rows print "4 MIN READ" over 489 characters; derivation prints "1 MIN READ" over the same body, or the real number over a real body. No badge, no count, no nudge. | survives |
| `editorial_stories.hero_image_url`, now **required** by the validator | A photograph in place of a gradient rectangle. VISION §6 refuses decoration that carries no information; a hero photograph of the maker's work is the information. | survives |
| `product_style_spectrum` provenance (`RL03-18`) | Declined — see task F12. Nothing added, so nothing to check. | n/a |

The four-word `tags` allow-list, the `quality_score ≥ 80` cap and the "no internal marker in a
tester-visible column" rule are unchanged and now also cover the editorial columns: `tag`, `title`,
`subtitle`, `maker_name` and `maker_location` are tester-visible copy and the validator rejects the
brand-voice words `patina-brand-voice` bans, plus "AI" in any form (steward.md §7.12).

### 3. The notes I must apply

Every review finding, as a numbered task below. No new integration note arrived from another lane
between the first round and this one (checked: `l01-notes.md`, `l02-notes.md`, `l02b-notes.md`,
`l07-notes.md` carry no line addressed to L0.3).

### 4. The notes I will send

Rewritten in `l03-notes.md` §1 with exact final text: **O1** (steward — the *merged* `config.toml`
line covering L0.3's and L0.7's entries, so the conflict is resolved once), **O2** (L1-B — the decode
pin, plus the empty-catalogue one-liner the D2 fallback needs to stay walkable), **O3** (L1-D —
**corrected**: the measured placeholder population after a clean reset), **O4** and **O5** (Fable,
unchanged), **O6** (Fable — fixture photography, now one photograph per row), **O7** (Fable / L2-G —
the two Python self-test scripts and the exact CI line that should run them), **O8** (L1-D / L1-E /
Leah — the editorial contract and who writes the bodies).

---

## Fix-round tasks

### Task F1 — the committed seed stops claiming photographs that do not exist (RL03-01, blocker)

**The defect, reproduced.** On the shared local stack, before any fix:

```
select count(*) from storage.objects where bucket_id='product-images';   -->  0
select count(*) … first-flight rows in public.products;                  -->  6
```

`supabase db reset` recreates the database, and the original Task 8 ordered the image upload **before**
the reset — so the objects the six rows point at are destroyed by the very next step. Every reset since
has planted six rows whose `images` array resolves to HTTP 400.

**Failing test first.** Add **case 10** to `supabase/tests/catalog/first_flight_catalog_test.sql`: for
every first-flight image URL under `…/object/public/product-images/…`, a matching row must exist in
`storage.objects`. Run it against the current stack with `-v require_storage=1` and watch it fail with
the count 6.

**Implement.** Three things, none of which is a new abstraction:

1. `require_storage` defaults to **0**, in which case case 10 `RAISE NOTICE`s `images_unbacked=N`
   instead of asserting. This keeps `bash scripts/run-sql-tests.sh` green on a bare reset (the suite
   runs this file with no `-v`) while making the number **visible in every run** rather than silent.
   The lane's own gate and Kody's production step pass `-v require_storage=1` and assert.
2. The generated seed's header carries the one-line local upload command, so anyone who reads the file
   or sees a grey block knows the remedy without reading this task list.
3. Task ordering reversed everywhere it appears (this file, `l03-notes.md`, the README): **reset →
   upload → apply/verify**, never the reverse.

**Run.** `-v require_storage=1` before the upload → `FAIL 10`. Run the upload. Same command → pass.
Default (no `-v`) → `NOTICE … images_unbacked=0`.

**Commit.** `supabase/tests/catalog/first_flight_catalog_test.sql`.

---

### Task F2 — `--check` enforces the `new_this_week` floor (RL03-02, major)

**The defect, reproduced.** A manifest with `published_at` filled on every row and every date older
than a week passes `--check` (`0 published inside 7 days`, exit 0) and then fails the SQL test's case 5
— *after* the photographs are uploaded and the rows applied.

**Failing test first.** Add a `catalog_selftest.py` case: a manifest whose every row carries
`published_at=2026-01-05` must raise `ManifestError` naming `new_this_week`.

**Implement.** `_assign_dates` currently runs **after** `_check_manifest`, so the checker cannot see
resolved dates. Swap the two calls, then assert `count_recent(rows) >= MIN_RECENT` **in both profiles**
— the floor is the SQL test's case 5, which is profile-independent, so a fixture that would fail it must
fail `--check` too.

**Run.** `python3 scripts/first-flight/catalog_selftest.py`; then `--check` on the fixture (still 0) and
on the all-old copy (now exit 1).

**Commit.** `scripts/first-flight/build-catalog.py`, `scripts/first-flight/catalog_selftest.py`.

---

### Task F3 — a 30-row manifest reaches the charter's 8 recent rows (RL03-14, minor)

`recent = min(count, max(MIN_RECENT, count // 4))` gives **7** at 30 rows; the charter asks for at
least 8. Integer division, not a decision.

**Failing test first.** A selftest case: 30 blank-dated rows must yield `count_recent >= 8`.

**Implement.** Ceiling division: `-(-count // 4)`. At 6 rows the value is unchanged (3), so the
committed fixture's offsets do not move.

**Run.** `catalog_selftest.py`.

**Commit.** with F2.

---

### Task F4 — the vendor block stops silently mutating pre-existing production vendors (RL03-04, major)

**The defect.** On a name match the emitted SQL runs `UPDATE public.vendors SET is_patina_catalog =
true` — a mutation of a pre-existing production row that no runbook step announces — and **discards**
the manifest's `made_in` / `website` for that maker, so a vendor with a NULL `made_in` keeps it and the
app shows no `maker_location` even though the manifest supplied one. A second hole: `q(sample.…)` takes
the **first** row for a maker, so two rows disagreeing on `made_in` resolve silently.

**Failing test first.** A selftest case: two rows naming the same maker with different non-blank
`maker_made_in` must raise `ManifestError`.

**Implement.**
1. Validator: a maker's `maker_made_in` / `maker_website` must be consistent across the rows that name
   it (blank cells are absences, not disagreements).
2. Emitted SQL: `UPDATE … SET is_patina_catalog = true, made_in = COALESCE(made_in, <manifest>),
   website = COALESCE(website, <manifest>)`, and `RAISE NOTICE` naming **every** vendor whose
   `is_patina_catalog` this apply actually changed, so it lands in Kody's apply report. `RAISE NOTICE`
   rather than an exception: flipping the flag is the intended effect, and the runbook now says so.

**Run.** `catalog_selftest.py`; regenerate the fixture seed and read the vendor block back.

**Commit.** `scripts/first-flight/build-catalog.py`, `scripts/first-flight/catalog_selftest.py`.

---

### Task F5 — a slug that already exists on Strata stops the apply (RL03-10, minor)

Idempotency is keyed on the derived id, not the slug. `products.slug` carries no unique index
(`pg_indexes` on `products`: `products_pkey`, `idx_products_vendor_sku_catalog`), so reusing a real
Strata slug inserts a **second** published catalogue row rather than updating the first.

**Failing test first (a real one, not a string match).** Locally, inside a transaction: insert a decoy
`products` row carrying a fixture slug and a different id, apply the generated seed, and watch it not
raise. That is the defect.

**Implement.** A pre-apply `DO` block that raises when any manifest slug exists on a row whose id is
not the derived id, naming the slug and the colliding id.

**Run.** Same transaction, rolled back: the apply now raises. Then apply cleanly with no decoy.

**Commit.** `scripts/first-flight/build-catalog.py`.

---

### Task F6 — `photo_verified_at` stops fabricating a verification moment (RL03-09, minor)

The manifest carries a boolean; the generator wrote `published_at` into `photo_verified_at`, inventing
the moment of verification. Emit `now()` instead, with a header line saying the timestamp records the
**seeding pass**, not the verification — which is what the file already says about `published_at`.

**Run.** Regenerate; grep the emitted column.

**Commit.** with F4.

---

### Task F7 — the three editorial stories enter the pipeline (RL03-03, major)

The charter's L0.3 row contract ends *"Plus 3 editorial stories with real hero images and
`read_minutes` derived from the body (`A3-17`, `GAP8-12`)"*, and nothing in the first round addressed
it. `findings.json` routes `A3-17` to **L1-D / W1** and `GAP8-12` to **L0.3 / W2**, so the app-side
rendering stays L1-D's — but the **data** half is this lane's and is what both findings are actually
about: three rows on Strata with `hero_image_url NULL` and `read_minutes` of 4 / 3 / 5 over bodies of
489 / 386 / 387 characters (`00143_editorial_stories.sql:143-198`, three fixed uuids).

**Failing test first.** Add **case 11** to the SQL test: every editorial row a tester can see
(`published_at <= now()`, not expired) must carry a non-null `hero_image_url`, a non-empty `body_md`,
and `read_minutes` equal to the derived value. Run it on the current stack — it fails on all three
rows.

**Implement**, inside the two scripts the owned-file map already names (no fifth script):

- `build-catalog.py` gains an optional `--editorial MANIFEST`. Columns: `story_id` (optional — blank
  derives `uuid5(FIRST_FLIGHT_NS, 'editorial/' + slug)`; the three live Strata ids are pre-filled in
  the template so the apply **updates** them rather than adding a fourth story), `slug`, `tag`,
  `title`, `subtitle`, `maker_name`, `maker_location`, `body_file` **or** `body_md`, `hero_image`,
  `featured_slug`, `published_offset_days`, `sort_order`.
- `read_minutes` is **never read from the manifest**. It is `max(1, floor(words / 200 + 0.5))`, and the
  SQL test recomputes the same expression in Postgres. That is `GAP8-12`'s fix line — *"derive
  read_minutes from the body"* — implemented as a property of the pipeline rather than a one-off edit.
- `hero_image` is **required**. That is `A3-17`'s hero half.
- `upload-catalog-images.py` gains the same `--editorial`, uploading heroes to
  `<uploader uid>/editorial/<story id>/<uuid5>.<ext>` — first folder segment the uploader's uid, which
  is what 00542's INSERT policy requires.
- A fixture editorial manifest (`waves/w0/editorial-fixture.csv` + three short bodies) proves the
  mechanics locally, and its short bodies make the point: derived, the three stories read **1 MIN**.

**Run.** `--check --editorial` on the fixture; regenerate; reset; upload; apply; SQL test case 11.

**Commit.** `scripts/first-flight/build-catalog.py`, `scripts/first-flight/upload-catalog-images.py`,
`supabase/tests/catalog/first_flight_catalog_test.sql`.

---

### Task F8 — no placeholder survives in a Kody-run command (RL03-11, minor)

`sips -Z 1600 /path/to/leahs/photos/*.jpg` is the one line in the runbook that cannot be pasted
(steward.md §7.1: *no placeholder in any command*). Fix by assigning `LEAH_PHOTOS` in Step 0 to a
**concrete** path — `waves/w0/leah-photos`, the folder the README tells Leah to fill, which is also
where the manifest's relative `image_1` paths resolve. `upload-catalog-images.py`'s printed hint drops
its `--out <file>` fragment and names `$CATALOG_SQL`.

**Run.** Read the runbook end to end for `<`, `>` and `/path/to`.

**Commit.** `scripts/first-flight/upload-catalog-images.py`.

---

### Task F9 — the two self-test scripts become a named deliverable (RL03-12, minor)

`catalog_selftest.py` (59 checks) and `spectrum_selftest.py` (21 checks) are the lane's **tests-first**
tier for its Python — they are what proved determinism, the vocabulary refusal and the tag allow-list —
but the first round never named them in a task and nothing outside the lane runs them. Named here as a
deliberate deliverable, kept in the fix-round gate, and routed to Fable / L2-G as **O7** with the exact
CI line, because `.github/workflows/**` is in no lane's owned map.

**Commit.** none (this file, plus `l03-notes.md` §O7).

---

### Task F10 — the fixture's photography stops contradicting its row (RL03-16, minor)

`ff-fixture-turned-leg-side-chair` carries `live-edge-coffee-table.jpg` — literally the `B-18` defect,
in rows that ship on main. Remap all six rows so no photograph contradicts its piece; where a
photograph must serve two rows, it must plausibly contain both.

**Run.** Regenerate; read the six emitted `images` arrays.

**Commit.** *(program-folder file — `catalog-fixture.csv`)*

---

### Task F11 — reset, upload, apply, and re-run everything (RL03-15, minor)

The review found the full SQL suite at **143 / 145** with two unexpected failures
(`aesthete/product_dna_test.sql`, `proposals/proposal_copy_immutability_test.sql`) where the lane had
reported 145 / 145 — the shared local stack moved between the two runs. This is **L0.3's third and
final reset of W0**; announce start and finish, then run the whole suite and report the verbatim tail
whatever it says.

**Run.** `pnpm supabase:reset` → upload (local) → `-v require_storage=1` SQL test → both selftests →
`bash scripts/run-sql-tests.sh`.

**Commit.** `supabase/seed/catalog/first-flight-catalog.sql` (regenerated).

---

### Task F12 — the notes, rewritten with the corrections (RL03-05, 06, 07, 08, 13, 17, 18)

| finding | disposition |
|---|---|
| `RL03-05` `config.toml` owned by no lane, L0.7 edits the same line | **Taken.** The change stays (un-wiring it would make the SQL test vacuous in `run-sql-tests.sh`, which globs `supabase/tests/**`), and **O1** now hands the steward the *merged* final line — L0.3's entry after `./seed/products.sql`, L0.7's after `./seed/project_documents_tasks.sql` — plus the staging-array decision, so the conflict is resolved once. |
| `RL03-06` the `ProductDecodingTests` pin was handed on, not written | **Taken as far as the owned-file rule allows.** `PatinaTests/**` is L1-B's. **O2** carries the fixture verbatim and states explicitly that it must be entered as a **numbered task in `l1-b-tasks.md` when W1 opens** — `PROGRAM.md:2031` already gives L1-B a `ProductDecodingTests` task under `C7-17`, so it has a home. |
| `RL03-07` `supabase/seed/products.sql` untouched, the "mirror" is a six-row fixture | **Taken as a recorded deviation**, not a footnote: `l03-notes.md` §5 now states it as a decision with its reason and its expiry (the mirror becomes real when Leah's manifest is generated into the same path), and flags it for the W0 exit record. |
| `RL03-08` the charter's third gate line cannot pass on the template | **Taken.** `l03-notes.md` §5 records that the day-1..day-5 form is `--check --profile fixture … catalog-fixture.csv`, and that the charter's line becomes runnable at D2's manifest hand-off. |
| `RL03-13` the fixture makes the empty-catalogue state unreachable | **Taken, with the premise corrected on evidence.** Measured on a clean local stack: **20** publishable catalogue rows, **6** of them first-flight — so 14 pre-date this lane and the empty state was never reachable locally. **O2** still gives L1-B the exact one-liner, because the D2 fallback must stay walkable regardless of whose rows are in the way. |
| `RL03-17` the lane's manifest, README, task list and notes are untracked | **Confirmed expected** (§7 step 7: Fable commits `build/waves/<wave>/`), and **O1** now names the five program-folder files that must be in that commit — `catalog-manifest.csv`, `catalog-manifest-README.md`, `catalog-fixture.csv`, `editorial-manifest.csv`, `editorial-fixture.csv` (+ its three body files) — because the seed's header names its source by filename and "re-generate rather than patch" is unfollowable without them. |
| `RL03-18` generated spectrum rows land as `source='manual'` | **Declined, with reason.** `00240_product_dna.sql:148-154` CHECKs `source IN ('manual','validated')`, so `'manual'` is the only legal value; `confidence` is a **per-dimension numeric map** that `_aesthete_spectrum_term` reads by key, so smuggling a provenance string into it risks the scorer. The rows are already identifiable without a new column: `product_style_spectrum.assigned_by = <catalogue owner uid>` **and** `product_id ∈ _ff_scope`. Recorded as **O5b** to Fable for the W2 recompute pass rather than changed here. |

**Commit.** *(program-folder file)*

---

## Fix-round gate

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03
export FF_LOCAL_DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export FF_W0=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0

pnpm supabase:reset

python3 scripts/first-flight/upload-catalog-images.py \
  --manifest "$FF_W0/catalog-fixture.csv" \
  --editorial "$FF_W0/editorial-fixture.csv" \
  --profile fixture --overwrite \
  --supabase-url http://127.0.0.1:54321 \
  --service-key "$(cd /Users/kody/Code/patina-merged && supabase status -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"

psql "$FF_LOCAL_DB" -X -q -v ON_ERROR_STOP=1 -v min_publishable=6 -v require_storage=1 \
  -f supabase/tests/catalog/first_flight_catalog_test.sql

python3 scripts/first-flight/build-catalog.py --check "$FF_W0/catalog-fixture.csv" \
  --profile fixture --editorial "$FF_W0/editorial-fixture.csv"
python3 scripts/first-flight/spectrum_selftest.py
python3 scripts/first-flight/catalog_selftest.py
bash scripts/run-sql-tests.sh
```

The service key is read from `supabase status` at run time and never written into this file. The
verbatim tails of every command land in the lane report's `gate`.

Two environment notes, both hit while running this:

- `scripts/run-sql-tests.sh` calls `mktemp -d`, which the Bash sandbox denies; `LOG_DIR` then resolves
  empty and the script dies with `error: no .sql files found`. Run that one line **unsandboxed**. It
  is not a defect in the script.
- `pnpm supabase:reset` from a lane worktree replays **that branch's** `config.toml`, so it drops any
  seed another lane added. After this lane's reset, L0.7's `first-flight-client-fixture.sql` was
  re-applied by hand (see `l03-notes.md` §O1c) so the shared stack was left whole.
