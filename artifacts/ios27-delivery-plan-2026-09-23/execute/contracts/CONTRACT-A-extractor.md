<!--
W0-16 / T6 — one of two upstream contracts for the iOS 27 program (story US-8).
Companion file in this directory holds the other half.
Authored read-only against main (tip 2de2ae85d); file:line citations are exact.
Split from the ticket plan document by the orchestrator; content unaltered.
-->

# CONTRACT A — the FF&E extractor, corrected for ruling D7

**Function** `supabase/functions/project-ffe-document-extract`
**Version** `extractionSchemaVersion: 2` (v1 = the shape shipped today)
**Auth** Supabase user JWT. `supabase/config.toml:628-629` sets
`verify_jwt = true`; `index.ts:24-26` re-resolves the caller with service_role
`auth.getUser()`. The client never sees service_role.

## A.1 What changes and why

D7 reverses the prompt's refusal at `lib.ts:73` for exactly four fields —
**maker, SKU, price, currency**. It does **not** lift the refusal on approval,
authority, markup, or a client verdict. Markup is a margin decision, not a
printed fact; it stays prohibited.

## A.2 Request shape

```http
POST /functions/v1/project-ffe-document-extract
Authorization: Bearer <supabase user JWT>
Content-Type: application/json
```

```jsonc
{
  "projectId": "<uuid>",
  "assetId":   "<uuid>",          // an already-registered source_document
  "schemaVersion": 2              // optional; absent => 1 (legacy row set)
}
```

Or, for the camera path, `source` in place of `assetId` — see Contract B §B.3.

**The media branch is not a request field.** It is derived server-side from the
registered asset's `content_type`, which `register_project_ffe_working_media_source`
has already pinned to verified stored bytes (`00455:65-73`). A client cannot
assert which branch it gets, so it cannot lie about it.

## A.3 The image branch

**Accepted content types** — `application/pdf`, `image/jpeg`, `image/png`,
`image/webp`. That is exactly the set `00455:38` already allows and exactly the
bucket's `allowed_mime_types` at `00433:11-18`. **HEIC is not accepted**: the
bucket rejects it at upload, so Field must transcode on device before the PUT.

**Size limits** — PDF stays `MAX_PDF_BYTES = 25 MiB` (`lib.ts:1`). Images get
`MAX_IMAGE_BYTES = 10 MiB`, matching `MAX_PREPARE_SOURCE_BYTES` in
`project-review-media/lib.ts:4`. 10 MiB base64-inflates to ~13.3 MiB of request
body, which leaves headroom under the Anthropic request ceiling. The bucket's
own 50 MiB cap (`00433:16`) stays the outer bound.

**One function, not two.** A branch inside `project-ffe-document-extract`:

1. Everything downstream is already shared — `get_project_ffe_extract_upload`,
   `stage_project_ffe_document_extraction`, `project_ffe_import_batches`,
   `commit_project_ffe_import`. A second function either duplicates all of it or
   calls the same RPCs anyway.
2. `index.ts:19-69` is content-type-independent except **two** lines: the
   `MAX_*_BYTES` comparison at `:40` and the Anthropic content block at `:54`
   (`{type:"document", source:{media_type:"application/pdf"}}` becomes
   `{type:"image", source:{media_type:<sniffed>}}`).
3. A second function means a second `config.toml` entry, a second deploy target,
   and a second ACL surface to keep in step with `00444`'s REVOKE/GRANT block.

**The image branch is ~4 lines of Deno and one migration.** The blocking work is
not in the edge function:

| Blocker | Where | Effect today |
|---|---|---|
| `AND asset.content_type = 'application/pdf'` | `00437:134` | An image asset returns `NOT FOUND` from `get_project_ffe_extract_upload`. |
| `source_kind` literal `'pdf'` | `00437:218` | Every batch is stamped `pdf`. |
| Reuse guard `v_batch.source_kind <> 'pdf'` | `00437:202` | Rejects any other kind as "already staged from another source". |
| `CHECK (source_kind IN ('csv','xls','xlsx','pdf'))` | `00434:393` | No `photo` value exists. |

**Page provenance on a photograph.** A photo has no page. `00437:230` requires
`^[1-9][0-9]*$` and `00437:145` requires `provenance.page = pageNumber`, so the
image branch pins both to `1`. `provenance.sourceKind` is added so a consumer can
tell "the photo" from "page one of a document".

## A.4 The extended `ExtractionRow`

```ts
// A commercial value is NEVER a bare scalar anywhere on the wire.
export type ExtractedValue<T> = {
  value: T;
  confidence: number;          // 0–1, per value — not the row's confidence
  state: "unconfirmed";        // the ONLY literal the extractor may emit
};

export type ExtractionRow = {
  pageNumber: number;
  provenance: { page: number; confidence: number; sourceKind: "pdf" | "photo" };
  name: string;
  quantity: number;
  roomName: string | null;
  category: string | null;
  // ── D7 commercial block ────────────────────────────────────────────────
  maker:          ExtractedValue<string> | null;
  sku:            ExtractedValue<string> | null;
  unitPriceMinor: ExtractedValue<number> | null;   // integer minor units
  currency:       ExtractedValue<string> | null;   // ISO 4217, uppercase
  priceBasis:     "unknown";                        // see A.5
};
```

**Why the envelope is the whole design.** A designer-typed value is a bare scalar
travelling on a different payload (the commit decision, §A.8). An extracted value
is always wrapped. Confusing the two therefore becomes a type error rather than a
convention someone has to remember. This is the answer to "how an unconfirmed
commercial value is represented so it can never be mistaken for a designer-typed
one": **they never share a wire format.**

**Why integer minor units.** `project_ffe_items.unit_price_cents` and
`trade_price_cents` are `integer` cents (`00185:47-49`). Float money is not
representable in the destination.

**Why currency rides with price.** The `*_cents` columns carry no currency, so a
price without one is unusable. The validator enforces paired presence: `currency`
non-null iff `unitPriceMinor` is non-null.

## A.5 `priceBasis` — a correctness point the plan did not name

The extractor reads a printed tag. It cannot know whether the printed number is
a **client price** (`unit_price_cents`) or a **trade cost** (`trade_price_cents`).
`00185`'s column comment makes client price the source of truth and defines
`margin = line_total_cents − trade_price_cents × quantity`. Landing a tag price
in the wrong column is a silent margin error.

The extractor therefore emits `priceBasis: "unknown"` as a constant, and
resolving it to `"client" | "trade"` is part of the designer's per-row
confirmation. The model is never permitted to classify it.

## A.6 What the strict-key validator becomes

`validateExtraction` (`lib.ts:125-159`) keeps its shape. Changes:

- `ROW_KEYS` grows from 6 to **11** entries. The
  `Object.keys(row).length !== ROW_KEYS.size` test at `:134` still holds, so
  **every row must carry all eleven keys** — an absent commercial value is
  `null`, never a missing key. Strictness is preserved, not relaxed.
- New `EXTRACTED_VALUE_KEYS = {value, confidence, state}`, validated with the
  same membership-plus-length pair the code already uses for `PROVENANCE_KEYS`
  at `:143`.
- `state` must equal the literal `"unconfirmed"`. Any other string rejects the
  **whole extraction** (`invalid_extraction`, 502). The model can never mint a
  confirmed value, even by accident.
- `nullableText`'s existing injection guard at `:121` (`/^[=+@]/`,
  `/^-[A-Za-z]/`, control chars, length) applies to `maker`, `sku` and
  `currency` — they are text destined for spreadsheet-shaped surfaces.
- `currency`: `/^[A-Z]{3}$/` after trim. No lower-casing — ISO 4217 is uppercase.
- `unitPriceMinor`: `Number.isInteger`, `0 ≤ v ≤ 100_000_000`. That ceiling is
  1,000,000.00 in a two-minor-digit currency and sits well inside the `integer`
  column bound.
- per-value `confidence`: finite number, `0 ≤ c ≤ 1`.
- `MAX_ROWS` unchanged at 5000.

**`max_tokens` is now the binding limit.** `index.ts:50` sets `6000`. Eleven
fields per row with envelopes costs roughly 3× v1 per row. The right value cannot
be derived without the money-field gold set the plan calls for — see §A.10.

## A.7 A regression the migration must handle

`00437:239-244` flags formula-like values by scanning `jsonb_each_text(v_row)`
across every field. When `maker`/`sku`/`unitPriceMinor`/`currency` become
**objects**, `jsonb_each_text` yields the object's JSON text, which starts with
`{` — so the `^[=+@]` test silently stops covering the nested scalar. The
injection guard would appear to still run while covering nothing.

The staging function must walk into the envelopes. This is the kind of guard that
fails open and looks fine.

## A.8 Per-row confirmation on the wire

**Staging.** Commercial values land in
`project_ffe_import_rows.raw_row` (verbatim) and in a new
`normalized_row.commercial` sub-object. They must **not** be written into the
flat `normalized_row` keys.

**Why that is the strongest available safety property.** `commit_project_ffe_import`
builds its `place_product_in_project_v2` payload from six named keys at
`00439:558-566` — `productId, name, category, quantity, roomId, assignmentScope`.
It carries no price or vendor field at all. So an unconfirmed value **physically
cannot reach `project_ffe_items` through the existing commit path.** The contract
forbids widening that payload to read `normalized_row.commercial` directly.

**The confirmation channel.** Extend `p_decisions` (`00439:541-550`), which
already validates `rowOrdinal` and applies per-row updates, with an optional
per-row object:

```jsonc
{
  "rowOrdinal": 7,
  "roomId": "<uuid>", "assignmentScope": "room", "duplicateMode": "create",
  "commercial": {
    "maker": "Vaughan",            // the DESIGNER's value, a bare scalar
    "sku": "TM0064",
    "unitPriceMinor": 184000,
    "currency": "USD",
    "priceBasis": "trade"          // resolved by the designer, never the model
  }
}
```

A confirmed value is written **from the decision**, never from the extraction.
The model-read and designer-typed values travel on two wires that never merge.
The designer may accept the reading by copying it — that act is the confirmation.

**The refusal needs no new machinery.** A row carrying a non-null commercial
envelope with no matching decision gets
`validation_errors += 'unconfirmed_commercial_value'`, and `00439:551-556`
already refuses to commit any batch with a non-empty `validation_errors`. The
existing gate does the work, which is why this is the cheap design.

**No bulk accept.** Measured value accuracy for generated fields is 0.69–0.83 —
roughly one commercial reading in four is wrong. An "accept all commercial
values" affordance is therefore forbidden, and the decision payload must name
each `rowOrdinal` individually. A confirm-all button converts a 0.69 field into
a 0.69 ledger.

## A.9 The revised prompt

Replacing `lib.ts:73`:

> Extract only explicit FF&E facts that are printed in the source. Read the
> commercial block — maker, SKU, unit price and currency — only when it is
> printed verbatim; never compute, convert or infer it, and never decide whether
> a printed price is a client price or a trade cost. Never infer approval,
> authority, markup, or a client verdict. Every commercial value you return is an
> unconfirmed reading a designer must confirm: set `state` to `"unconfirmed"` on
> each, and leave a commercial field null rather than guessing. Return the source
> page in both `pageNumber` and `provenance.page` — for a photograph, use 1 — set
> `provenance.sourceKind` to `"pdf"` or `"photo"`, use an integer quantity
> (default 1), and give `provenance.confidence` and each commercial value's own
> confidence from 0–1. Submit all rows with the provided tool.

`extractionTool()`'s `input_schema` (`lib.ts:78-115`) mirrors this: eleven
`required` keys, `additionalProperties: false` at every level including inside
each `ExtractedValue`, and `state` as `{"const": "unconfirmed"}`.

## A.10 Response shape

```jsonc
{
  "batchId": "<uuid>",
  "status": "staged" | "committed" | "failed" | "abandoned",
  "reused": false,
  "rowCount": 30,
  "sourceAssetId": "<uuid>",
  "schemaVersion": 2,
  "unconfirmedCommercialRows": 12    // NEW
}
```

`unconfirmedCommercialRows` lets a caller say "12 of 30 rows carry a price you
must confirm" without a second round trip.

## A.11 Error codes

Existing, from `index.ts` — unchanged:

| Code | HTTP | Source |
|---|---|---|
| `unauthorized` | 401 | `:23`, `:26` |
| `invalid_body` | 400 | `:28` |
| `not_found` | 404 | `:34` |
| `invalid_source_manifest` | 422 | `:36` |
| `source_unavailable` | 422 | `:38` |
| `source_integrity_failed` | 409 | `:40`, `:42` |
| `extractor_unavailable` | 503 | `:44` |
| `extraction_failed` | 502 | `:57` |
| `invalid_extraction` | 502 | `:61` |
| `staging_failed` | 500 | `:66` |
| `invalid_staging_result` | 502 | `:68` |

New:

| Code | HTTP | Meaning |
|---|---|---|
| `unsupported_source_type` | 415 | Sniffed type outside the accepted four. |
| `source_too_large` | 413 | Over the branch's byte cap. Today `:40` folds this into `source_integrity_failed` 409, which is wrong — an oversize file is not a tampered one. |
| `unsupported_schema_version` | 400 | `schemaVersion` not in `{1, 2}`. |

## A.12 Idempotency

**There is no caller-supplied key, and there must not be one.** Idempotency is
content-addressed: `project_ffe_import_batches` is `UNIQUE (project_id, file_hash)`
(`00434:402`), and `00437:197-213` returns the existing batch with `reused: true`.
The effective key is `sha256(stored bytes)` scoped to the project.

Two consequences the mobile client must be built around:

1. **A retry must send the same bytes.** Two photographs of the same tag are two
   different batches. Re-encoding an image on retry defeats the dedupe and
   produces a duplicate batch.
2. **A retry must reuse the same `assetId`.** Registering the same bytes under a
   second asset hits `00437:202-205` — `unique_violation`, "file hash is already
   staged from another source".

The separate `project_ffe_command_idempotency` table (`00434:421`, claimed at
`00435:139-155`) is the *placement* command's key, not the extractor's. Its idiom
is the house standard: request-hash mismatch → `unique_violation`, in-flight →
`serialization_failure`, replay → the stored response.

## A.13 Stated explicitly — what I could not determine

1. **The right `max_tokens`.** Needs the money-field gold set. 6000 is a v1
   number and v2 rows are roughly 3× the tokens.
2. **Whether `project-ffe-document-extract` has any caller at all.** A repo-wide
   search finds the name only in `artifacts/` and `docs/` — no portal, no iOS, no
   package references it. The extractor is deployed and unexercised. Everything
   above is therefore a contract against an unproven server path, and the first
   integration will be the first real traffic it has seen.
3. **Where a confirmed non-USD currency is persisted.** `project_ffe_items` has
   no currency column (confirmed against the generated
   `packages/supabase/src/database.types.ts:16253-16299`); the `*_cents` columns
   are unqualified. A confirmed `currency` has nowhere to land except
   `custom_fields`. **This blocks the 00661 migration and needs a ruling.**
4. **HEIC transcoding in Field.** The bucket rejects HEIC, so Field must
   transcode. I did not read Field's capture pipeline to confirm it already does.
5. **Multi-image batching.** The request is `assetId`-singular, so this contract
   assumes one asset per call. Whether Anthropic accepts mixed document+image
   blocks in a single request was not verified against live API docs.
6. **A second, already-shipped path that violates D7's own rule.**
   `field_captures` already carries `sku`, `vendor_name`, `price_retail_cents`
   and `price_trade_cents` (`database.types.ts:6803+`), and
   `record_capture_enrichment_result` (`00515:236-295`) **auto-prefills
   `vendor_name` and `sku` into those columns** whenever they are NULL or empty.
   The written column carries no confirmed/unconfirmed marker, so once written a
   model reading is indistinguishable from a designer-typed one — precisely the
   confusion this contract exists to prevent. Whether D7's per-row confirmation
   is meant to reach that path is **a ruling for Kody**, not a call I can make.
   The ledger keeps `suggestions`, so it is reconstructible but not visible at
   the point of use.
7. **Whether the W3 portal review front door surfaces price at all.** Out of this
   ticket's reach. Note that `_ffe_strict_client_fields` (`00439:8-23`) allowlists
   only `note, description, dimensions, finish, material, color, leadTime, care`
   — so commercial values cannot leak to a *client* surface through that seam
   regardless.

---

