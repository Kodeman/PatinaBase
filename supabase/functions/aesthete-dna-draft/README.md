# aesthete-dna-draft

Aesthete Engine Wave 2C — the Claude draft-fill worker (design
`docs/prds/AE/aesthete-engine-system-design.md` §6.2–6.3, §5.2, §12.2).

Drains `dna_draft` jobs from `aesthete_jobs` (00241) every 2 minutes
(pg_cron → `invoke_edge_function`). Per product: loads the products row + up
to 3 image URLs → `claude-haiku-4-5` with a cached system prefix (role, six
spectrum pole anchors verbatim from the product brief, the 12 archetypes from
the `styles` table) and structured outputs enforcing the §6.3 JSON schema →
escalates once to `claude-sonnet-5` on `overall_confidence < 0.6` or schema
failure → writes `product_dna_drafts` (prompt_version `p1`,
replace-only-if-better), `product_styles` `source='ml_predicted'`,
`teaching_queue` triage, and accrues `aesthete_spend_ledger`.

**Drafts never write canonical rows** (§5.2): `product_dna` and
`product_style_spectrum` are untouchable from this function — the DbPort in
`lib.ts` has no method that can reach them.

## Files

| File | Role |
|---|---|
| `index.ts` | `Deno.serve` boot: env, CORS, deadline, wiring |
| `lib.ts` | Pure logic (prompt, schema, validation, triage, spend, pass) — dependency-free, unit-tested |
| `db.ts` | `DbPort` over supabase-js (service role) |
| `claude.ts` | `ClaudeCaller` over the official `@anthropic-ai/sdk` (npm specifier) |
| `fixtures/` | Golden Claude drafts (high-confidence clean · low-confidence → escalation) |
| `index.test.ts` | Mocked suite — **no real API calls** |
| `smoke.test.ts` | Real-API smoke, gated behind env (below) |

## Environment

| Var | Required | Default | Notes |
|---|---|---|---|
| `SUPABASE_URL` | injected | — | runtime-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | injected | — | claim/complete RPCs are service-role-only (00241) |
| `ANTHROPIC_API_KEY` | for drafting | — | edge secret only (§12.5). Missing → the fn **parks** (`{parked:true, reason:'no_api_key'}`), never crashes |
| `DAILY_BUDGET_USD` | no | `20` | spend governor: ledger ≥ budget → park before claiming (§6.2) |

## Response

```jsonc
{ "claimed": 4, "drafted": 3, "escalated": 1, "parked": false, "usd": 0.0512 }
// parked:  { "claimed": 0, "drafted": 0, "escalated": 0, "parked": true, "usd": 0, "reason": "budget_exhausted" | "no_api_key" | "no_archetypes" }
// "failed": n appears when any job failed (queue backoff retries it)
```

## Tests (mocked — safe anywhere)

```bash
deno test supabase/functions/aesthete-dna-draft/
```

## Real-API smoke (costs ~1–2¢ — run deliberately)

Not run by default; ignored unless **both** env vars are set. The Anthropic
SDK is imported dynamically so the normal suite never resolves it.

```bash
DENO_NO_PACKAGE_JSON=1 RUN_REAL_SMOKE=1 ANTHROPIC_API_KEY=sk-ant-... \
  deno test --allow-env --allow-net supabase/functions/aesthete-dna-draft/smoke.test.ts
```

(`DENO_NO_PACKAGE_JSON=1` because the monorepo root package.json puts deno
into manual-node_modules mode, where `claude.ts`'s `npm:` SDK specifier
refuses to resolve; the edge runtime itself bundles `npm:` natively.)

Asserts one live haiku structured-output round-trip (draft parses, archetype
resolves, spend accounted). No DB access.

## Local dry run (no key → park path)

```bash
supabase functions serve aesthete-dna-draft --env-file /dev/null &
curl -s -X POST http://127.0.0.1:54321/functions/v1/aesthete-dna-draft \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' -d '{}'
# → {"claimed":0,"drafted":0,"escalated":0,"parked":true,"usd":0,"reason":"no_api_key"}
```

## Schema ↔ 00240 mapping notes (for the teaching-prefill consumer)

- The draft jsonb follows §6.3 families; per-family confidence is a scalar
  `conf` plus a per-dimension `style.spectrum_conf` map (the §6.3 example's
  mixed scalar/map `conf` collapsed to this). The teaching UI maps family
  `conf` → `product_dna.confidence` keys on designer save.
- `color.value`/`saturation` → `color_value`/`color_saturation`;
  `patina.potential` → `patina_potential`; `commercial.price_tier_estimate` →
  `price_tier`; `material.primary`+`materials` stay on `products.materials`
  at save time (00240 keeps materials on products).
- Archetype names are an **enum built from `styles` at request time**, so
  `product_styles` rows always resolve by name.
- `product_styles.assigned_by` (NOT NULL, no FK) is written as the nil UUID
  `00000000-0000-0000-0000-000000000000` for engine rows; provenance is
  `source='ml_predicted'`.
- TODO(Wave 3D): few-shot calibration anchors from
  `spectrum_calibration_products` (unseeded until the calibration sprint);
  bump `PROMPT_VERSION` when they land.
