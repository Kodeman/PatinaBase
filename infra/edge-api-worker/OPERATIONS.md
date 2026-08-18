# Edge API operational contracts

Committed Wrangler environments are preview-only and have no custom routes. The
staging environment targets the persistent Supabase staging branch (ref
`vuesoyhfrjabfxbrzekd`, `ACTIVE_HEALTHY`, a separate Postgres cluster from
prod). Hyperdrive arrays remain empty until Cloudflare returns real IDs.

## Staging promotion ladder

Staging moves off the legacy catalog in three rungs, each its own
`npx wrangler deploy --env staging`. Do not skip a rung — the middle rung is
the only configuration that produces the runbook's required "normalized
legacy = fresh = cached" comparison evidence, and `validateRuntimeConfig`
(`src/env.ts`) rejects the invalid combinations that a skipped rung would
otherwise produce:

```ts
const source = env.CATALOG_SOURCE;
if (source !== 'legacy' && source !== 'shadow' && source !== 'hyperdrive') {
  throw new ConfigurationError();
}
const percentage = integerInRange(env.CATALOG_HYPERDRIVE_PERCENT, 0, 100);
if (
  (source === 'legacy' && percentage !== 0) ||
  (source === 'shadow' && percentage !== 0) ||
  (source === 'hyperdrive' && percentage === 0)
) {
  throw new ConfigurationError();
}
```

`shadow` with a nonzero `CATALOG_HYPERDRIVE_PERCENT` and `hyperdrive` with a
zero percent both throw `ConfigurationError` at startup, so the worker
refuses to boot rather than run in an ambiguous state.

1. **`CATALOG_SOURCE: "legacy"`, `hyperdrive: []`.** Proves the worker is
   healthy with no new database dependency — no Hyperdrive bindings exist
   yet, so this rung is deployable (and is today's committed state) before
   Cloudflare has returned any binding IDs.
2. **`CATALOG_SOURCE: "shadow"`, `CATALOG_HYPERDRIVE_PERCENT: "0"`, both
   `DB_FRESH` and `DB_PUBLIC_CACHE` binding IDs present.** The only mode that
   produces the runbook's required "normalized legacy = fresh = cached"
   comparison evidence: every request still answers from the legacy path,
   but the Hyperdrive reads run alongside it and get normalized and diffed
   against the legacy result. Jumping straight to rung 3 skips this
   evidence entirely — there is no other configuration that generates it.
3. **`CATALOG_SOURCE: "hyperdrive"`, `CATALOG_HYPERDRIVE_PERCENT: "100"`.**
   Traffic is served from the Hyperdrive-backed catalog. Only safe once rung
   2's shadow comparison has run clean, because rung 3 has no legacy
   comparison running alongside it to catch a divergence before it reaches
   real responses.

Verify each rung with:

```sh
npx wrangler deployments list --env staging
```

This output is **oldest-first — read the bottom row** for the most recent
deployment. Do not rely on `/version` to confirm a rung: it returns static
defaults on the live path and proves nothing about which `CATALOG_SOURCE` or
Hyperdrive bindings are actually active.

`SUPABASE_ANON_KEY` (or the project publishable key) is required in every source
mode because the legacy catalog remains the primary source, shadow baseline, and
Hyperdrive fallback. It must be provisioned separately for each Cloudflare
environment and must never appear in `wrangler.jsonc`:

```sh
npx wrangler secret put SUPABASE_ANON_KEY --env staging
npm run config:check:provisioned -- staging
npx wrangler secret put SUPABASE_ANON_KEY --env production
npm run config:check:provisioned -- production
```

Local development supplies the same name through an uncommitted `.dev.vars`;
workerd tests inject a test-only value through Miniflare.

After Phase 1 Wave 2 provisioning and review, the coordinator may attach staging
explicitly with:

```sh
npx wrangler deploy --env staging --route 'api-staging.patina.cloud/*'
```

Production route attachment is a Phase 1 Wave 3 coordinator action:

```sh
npx wrangler deploy --env production --route 'api.patina.cloud/*'
```

Neither command belongs in a default package script or committed Wrangler route.

## Promotion ladder preconditions

`CATALOG_SOURCE` may only be `shadow` or `hyperdrive` when both `DB_FRESH` and
`DB_PUBLIC_CACHE` are provisioned. `npm run config:check` rejects the committed
config, and `validateRuntimeConfig` fails the Worker closed (503 +
`edge_api_configuration_invalid`) at the router boundary. This is deliberate: a
promoted rung with `hyperdrive: []` previously booted clean and served 100%
legacy, logging only `edge_api_catalog_hyperdrive_failure` — a failed cutover
was indistinguishable from a successful one.

`/_internal/health` reports each Hyperdrive binding as `ok`, `unavailable`, or
`not_applicable`. A binding is `not_applicable` only when it is unbound *and*
`CATALOG_SOURCE` is `legacy` — the correct rung-one steady state, which returns
200 `ok`. Any binding declared in `wrangler.jsonc` must answer regardless of
source: an `unavailable` result yields 503 `degraded` on every rung. So a green
health check on rung one means "correctly unprovisioned", and on rung three it
means "both bindings live" — the W5 matrix Health row can now distinguish them.

## Shadow acceptance evidence

Shadow mode reads legacy (served), `DB_FRESH`, and `DB_PUBLIC_CACHE`, and
compares all three. Every successfully-served catalog request emits exactly one
of `edge_api_catalog_shadow_match`, `edge_api_catalog_shadow_mismatch`, or
`edge_api_catalog_hyperdrive_failure`. Acceptance is therefore a *positive*
count, not an absence of alerts: compare the `shadow_match` count against
catalog request volume for the window. A shortfall means dropped `waitUntil`
work or an unexercised endpoint, neither of which the old mismatch-only logging
could reveal. Records are unsampled so each one pairs to a `traceId`.

## Unverified responses

If the legacy leg fails while Hyperdrive succeeds in rung 3, the Worker serves
the Hyperdrive body (200, correct data) but marks it `private, no-store` and
logs `edge_api_catalog_unverified_response` at `critical`. The comparison that
authorizes serving the public view did not run, so no shared cache may retain
the body. A run of these events during a rollout means the canary's correctness
guarantee is off, even though every response is 200.

## Cloudflare log alert contract

Alert filters match the exact `event` and `severity` fields below. Log payloads
contain only the documented allowlisted operational fields: `event`, `severity`,
`traceId`, `routeClass`, `fallback`, `comparison`, `binding`, `legacyCount`,
`freshCount`, `hyperdriveCount`, `mismatchedIdCount`, `legacyDigest`,
`freshDigest`, `hyperdriveDigest`, and `status`. Digests are 8-hex FNV-1a hashes
of the normalized result set — they discriminate differing content without
logging catalog data.

| Event filter | Severity | Meaning |
| --- | --- | --- |
| `edge_api_catalog_shadow_match` | `info` | A comparison ran and all compared sources agreed. Evidence record, not an alert — do not attach a notification. |
| `edge_api_catalog_shadow_mismatch` | `critical` | Compared sources differ. `comparison` names the pair or triple; `mismatchedIdCount` and the per-source digests distinguish a stale value from a different result set. |
| `edge_api_catalog_hyperdrive_failure` | `error` | A Hyperdrive read failed and the safe legacy fallback was used. In shadow mode `binding` names the failing leg (`DB_FRESH`, `DB_PUBLIC_CACHE`, or `both`). |
| `edge_api_catalog_legacy_failure` | `error` | Legacy public catalog read failed. |
| `edge_api_catalog_unverified_response` | `critical` | Rung 3 served the public view after the legacy comparison leg failed. The response was **not** verified and is returned `private, no-store`. |
| `edge_api_compatibility_timeout` | `error` | Supabase compatibility upstream did not complete before its deadline. |
| `edge_api_configuration_invalid` | `critical` | Runtime variables encode an invalid catalog state or incomplete configuration. |
| `edge_api_request_failure` | `error` | An otherwise unclassified request failure reached the router boundary. |

Cloudflare email notification provisioning remains an operator action. The Worker
does not send external email.
