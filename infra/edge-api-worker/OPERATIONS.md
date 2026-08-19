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

Shadow mode reads legacy (served), `DB_CATALOG_FRESH` (the uncached catalog
reader, `edge_catalog_login`), and `DB_PUBLIC_CACHE`, and compares all three.
The fresh leg is `DB_CATALOG_FRESH`, not `DB_FRESH` — `DB_FRESH` is the
authenticated RLS login (`edge_rls_login`) reserved for the `/v1/_authcheck`
path and never read by a catalog comparison. Every successfully-served catalog request emits exactly one
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

## Scan read path (`/v1/scan/*`)

`GET /v1/scan/room-files/:roomFileId/artifacts/:kind` — `kind` is `splat`, `glb`,
or `renders`. Single kinds answer `{kind, url, expiresAt}`; `renders` answers
`{kind, shots: {<shot name>: {url, expiresAt}}}`. `url` is a 600-second
SigV4 query-signed R2 GET; every response is `private, no-store`.

**Authorization is the caller's own RLS.** The route verifies the Supabase JWT
and then reads inside ONE `SET LOCAL ROLE authenticated` transaction on
`DB_FRESH` — the uncached binding. `room_files`' delegation to `room_scans`
(00341) and `media_objects_select`'s delegation to the same (00489) decide
visibility; the worker adds no predicate of its own. There is **no `scan_reader`
role and no `scan_media_read` view** on this path: that view is a service
capability with no tenant predicate, and 00490 requires one before any login
role inherits it. User-scoped rows never ride `DB_PUBLIC_CACHE`.

Only `lifecycle_state` `stored` or `verified` is signed. A `pending` object has
no confirmed bytes and `deleted` is terminal; signing either would hand the
portal a URL that 404s at R2.

Missing or invalid JWT is **401**. Everything else — malformed id, unknown kind,
a Room File the caller cannot see, no artifact of that kind, no servable object
— is an identical **404**. A 403 would confirm the row exists, which is the
mood-board bug class this plan gates against.

### `SCAN_ROUTES` and the two pending secrets

`SCAN_ROUTES` is `off` in **every** committed environment, including production
— the read path ships to staging only (DELIVERY-PLAN W2 "Does not"). `off`
leaves the path unrouted, so it 404s like any unknown path and the environment
does not advertise that a scan surface exists.

`on` additionally requires, or the worker boots 503 with
`edge_api_configuration_invalid`:

| Piece | Where | State |
| --- | --- | --- |
| `SCAN_R2_ENDPOINT` | `wrangler.jsonc` var | committed (`https://<account>.r2.cloudflarestorage.com`, bare origin, no path) |
| `SCAN_R2_BUCKET` | `wrangler.jsonc` var | committed (`patina-staging-media-artifacts-us` on staging) |
| `DB_FRESH` | Hyperdrive binding | provisioned on staging and production |
| `SCAN_R2_ACCESS_KEY_ID` | Wrangler secret | **PENDING — does not exist** |
| `SCAN_R2_SECRET_ACCESS_KEY` | Wrangler secret | **PENDING — does not exist** |

The two secrets are an R2 API token's access key id and secret. Minting one is a
Cloudflare dashboard action and is **not** something this repo's tooling can do.
The same pair belongs in the Modal `scan-r2` secret (`R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY`), which is also still a placeholder — so one token, set in
both places, keeps the writer and the reader on the same credentials.

Turning the read path on, once a token exists:

```sh
npx wrangler secret put SCAN_R2_ACCESS_KEY_ID --env staging
npx wrangler secret put SCAN_R2_SECRET_ACCESS_KEY --env staging
# then flip env.staging vars.SCAN_ROUTES to "on" in wrangler.jsonc
npm run config:check
npm run config:check:provisioned -- staging
npx wrangler deploy --env staging
```

`config:check:provisioned` requires the two secrets **only** where that scope's
`SCAN_ROUTES` is `on`, so an environment resting at `off` stays provisionable
without them. Rollback is the same flip back to `"off"` plus a deploy — a config
change, not a code change.

## Media upload interface (`/v1/media/uploads`)

The Phase-2 upload interface, piloted for scan **originals** (DELIVERY-PLAN W3).
Two POST routes:

- `POST /v1/media/uploads` — body `{scanId, artifactKind, filename,
  declaredSha256, declaredSize, declaredMime}`. Answers `201` for a new intent
  and `200` for a repeated one, with `{uploadId, putUrl, expiresAt,
  requiredHeaders}`. `putUrl` is a 1800-second SigV4 query-signed R2 **PUT**.
- `POST /v1/media/uploads/:uploadId/confirm` — HEADs the object with the same
  credentials, compares observed size/checksum against what the intent declared,
  and answers `{uploadId, lifecycle, sha256, etag, sizeBytes}`.

Every response is `private, no-store`.

**`requiredHeaders` are conditions, not suggestions.** `content-length` and
`x-amz-checksum-sha256` are signed into the URL, so a PUT that omits or alters
either fails at R2 as `SignatureDoesNotMatch`.

### What the R2 probe established

That the headers are *signed* was always demonstrable from `src/r2.ts`. Whether
R2 actually **verifies the body against the signed digest** was not — 00498
asserted it in prose and simultaneously hedged against it in code, recording a
weaker `sha256_verified_by = 'put_condition'` for the case where a HEAD came
back with no checksum. Measured 2026-08-19 against
`patina-staging-media-originals-us`, run from Modal on the `scan-r2` credential,
reproducing `src/r2.ts`'s canonical request exactly (same signed-header set,
same sorted query, `UNSIGNED-PAYLOAD`, `region=auto`):

| Probe | Observed |
| --- | --- |
| Correct bytes + correct signed `x-amz-checksum-sha256` | `200`; object created; response echoes `x-amz-checksum-sha256` |
| **Wrong bytes**, same signed checksum, identical `content-length` | **`400 BadDigest`** — *"The SHA-256 checksum you specified did not match what we received"*, quoting both digests. A follow-up HEAD returns **`404`**: the object was never created |
| `HEAD` with `x-amz-checksum-mode: ENABLED` | `200` carrying `x-amz-checksum-sha256` |
| Sending a checksum header value other than the signed one | `403 SignatureDoesNotMatch` |

All four results reproduce identically for `x-amz-checksum-crc64nvme`, R2's
documented full-object algorithm — so either would have served; SHA-256 is kept
because it is the digest iOS already computes and the registry already stores.

Two consequences, both landed in **00499**:

- The condition is real, so `declaredSha256` is a **promise**, not a label: R2
  refuses a body that does not hash to it before storing anything.
- R2 **reports** the digest on HEAD, so an object that arrived through the
  presigned PUT always has one. A confirm carrying no observed checksum is
  therefore evidence the bytes did **not** arrive that way — the one case that
  must not be waved through. Both the Worker
  (`assertObservedMatchesDeclared`) and the RPC (`confirm_media_upload`) now
  **fail closed** on it, and `put_condition` is retired: the only value
  `sha256_verified_by` can record is `r2_head`.

**The key carries no authorization.**
`scan_originals/{scanId}/{artifactKind}/{filename}` is registry-keyed. The legacy
Supabase Storage layout (`{userId}/{roomId}/…`) made the path the authorization;
DELIVERY-PLAN W3 forbids carrying that into R2. `artifactKind` is the closed set
of schema-v3 bundle kinds (`keys.py`'s `KIND_TO_URL_COLUMN` + `KIND_TO_FOLDER`).

**Authorization is the caller's own RLS, twice.** The route verifies the JWT,
then reads `room_scans` under `SET LOCAL ROLE authenticated` on `DB_FRESH` — the
real policies decide — before calling 00498's SECURITY DEFINER RPC, which binds
the caller again through `caller_can_access_room_scan`. That mirror exists only
because a definer body cannot re-run the caller's RLS; it is gated by an
equivalence assertion in
`supabase/tests/scan_pipeline/scan_roles_conformance_test.sql`, not trusted.

Missing or invalid JWT is **401**. A malformed body is **400**. An unknown scan,
an invisible scan, an unknown upload id, and an upload belonging to someone else
are one identical **404**. A confirm whose observed bytes disagree with the
declared ones is **409 `upload_mismatch`** with a `reason` (`size`, `checksum`,
`missing`, `state`, `registry`) and the registry row **stays `pending`**, so the
client can re-PUT without re-issuing an intent.

### `MEDIA_UPLOADS` and the two pending WRITE secrets

`MEDIA_UPLOADS` is `off` in every committed environment. `off` leaves both paths
unrouted, so they 404 like any unknown path. Production is additionally asserted
`off` by `validate-config` — the upload interface ships to staging only, and the
failure mode being guarded against is a write capability against a production
bucket arriving in a routine redeploy.

`on` additionally requires, or the worker boots 503 with
`edge_api_configuration_invalid`:

| Piece | Where | State |
| --- | --- | --- |
| `SCAN_R2_ENDPOINT` | `wrangler.jsonc` var | committed (shared with the read path) |
| `SCAN_R2_ORIGINALS_BUCKET` | `wrangler.jsonc` var | committed (`patina-staging-media-originals-us` on staging) |
| `DB_FRESH` | Hyperdrive binding | provisioned on staging and production |
| `SCAN_R2_WRITE_ACCESS_KEY_ID` | Wrangler secret | **PENDING — does not exist** |
| `SCAN_R2_WRITE_SECRET_ACCESS_KEY` | Wrangler secret | **PENDING — does not exist** |

The write pair is a **separate** R2 API token from the read pair, and that
separation is the point: the read token is Object Read only, scoped to
`patina-staging-media-artifacts-us`; the write token is Object Read & Write,
scoped to `patina-staging-media-originals-us` and nothing else. Neither
credential is the whole media surface. Minting the token is a Cloudflare
dashboard action this repo's tooling cannot perform — create
`patina-staging-media-writer` with Object Read & Write on the originals bucket
only.

Turning the upload interface on, once that token exists:

```sh
npx wrangler secret put SCAN_R2_WRITE_ACCESS_KEY_ID --env staging
npx wrangler secret put SCAN_R2_WRITE_SECRET_ACCESS_KEY --env staging
# then flip env.staging vars.MEDIA_UPLOADS to "on" in wrangler.jsonc
npm run config:check
npm run config:check:provisioned -- staging
npx wrangler deploy --env staging
```

**Before the first BROWSER upload — not before the first iOS one — set the
originals bucket's CORS policy.** The presigned PUT is issued by this Worker but
performed by the client straight against
`<account>.r2.cloudflarestorage.com`, which is a different origin from any
portal. A browser therefore preflights it, and R2 answers that preflight from
the BUCKET's CORS configuration — nothing the Worker sends can substitute, and
the Worker's own `access-control-allow-*` headers on `/v1/media/uploads` cover
only the intent call, not the PUT that follows it. Without the bucket policy the
upload fails as an opaque "Failed to fetch" with no request in the R2 logs,
which is the same shape the read path already hit once on staging.

It is deliberately **not** set now: no browser client issues these uploads yet,
and a CORS policy is a standing grant of cross-origin write access to whatever
origins it names. iOS and the pipeline are unaffected either way — `URLSession`
and server-side clients do not preflight.

When a browser client does arrive, allow exactly the portal origins that need
it, the methods and headers the PUT actually uses, and expose `etag` so the
client can read it back:

```sh
npx wrangler r2 bucket cors set patina-staging-media-originals-us \
  --allowed-origins https://app.patina.cloud \
  --allowed-methods PUT \
  --allowed-headers content-type,content-length,x-amz-checksum-sha256 \
  --expose-headers etag \
  --max-age 3600
```

`--allowed-origins '*'` is the wrong answer here even though the URL is already
a capability: the capability is time-boxed and single-object, but a wildcard
turns every origin the user's browser visits into a potential relay for one.

`config:check:provisioned` requires the write pair **only** where that scope's
`MEDIA_UPLOADS` is `on`. Rollback is the same flip back to `"off"` plus a deploy
— a config change, not a code change.

## Cloudflare log alert contract

Alert filters match the exact `event` and `severity` fields below. Log payloads
contain only the documented allowlisted operational fields: `event`, `severity`,
`traceId`, `routeClass`, `fallback`, `comparison`, `binding`, `legacyCount`,
`freshCount`, `hyperdriveCount`, `mismatchedIdCount`, `legacyDigest`,
`freshDigest`, `hyperdriveDigest`, `status`, `artifactKind`, `uploadStage`, and
`mismatchReason`. Digests are
8-hex FNV-1a hashes of the normalized result set — they discriminate differing
content without logging catalog data. `artifactKind` is a closed vocabulary
(`splat`, `glb`, `renders`); the scan route's Room File id, bucket, object key,
and minted capability URL are all deliberately absent, so `traceId` is the only
handle on an individual scan request. `uploadStage` (`intent`, `confirm`) and
`mismatchReason` (`size`, `checksum`, `missing`, `state`, `registry`) are closed
vocabularies on the same terms: the scan id, upload id, object key, declared
checksum, and the presigned URL never appear.

| Event filter | Severity | Meaning |
| --- | --- | --- |
| `edge_api_catalog_shadow_match` | `info` | A comparison ran and all compared sources agreed. Evidence record, not an alert — do not attach a notification. |
| `edge_api_catalog_shadow_mismatch` | `critical` | Compared sources differ. `comparison` names the pair or triple; `mismatchedIdCount` and the per-source digests distinguish a stale value from a different result set. |
| `edge_api_catalog_hyperdrive_failure` | `error` | A Hyperdrive read failed and the safe legacy fallback was used. In shadow mode `binding` names the failing leg (`DB_CATALOG_FRESH`, `DB_PUBLIC_CACHE`, or `both`). |
| `edge_api_catalog_legacy_failure` | `error` | Legacy public catalog read failed. |
| `edge_api_catalog_unverified_response` | `critical` | Rung 3 served the public view after the legacy comparison leg failed. The response was **not** verified and is returned `private, no-store`. |
| `edge_api_compatibility_timeout` | `error` | Supabase compatibility upstream did not complete before its deadline. |
| `edge_api_configuration_invalid` | `critical` | Runtime variables encode an invalid catalog state or incomplete configuration. |
| `edge_api_request_failure` | `error` | An otherwise unclassified request failure reached the router boundary. |
| `edge_api_scan_artifact_failure` | `error` | The scan read path could not answer: the RLS read failed, or presigning did. Never emitted for an unauthorized caller or an artifact that simply is not there — both of those are ordinary 401/404s and are not logged. `artifactKind` names the kind asked for. |
| `edge_api_media_upload_failure` | `warning` (409) / `error` (503) | The upload interface refused or could not answer. At `warning` it is a real mismatch between what R2 holds and what the intent declared — `uploadStage` says which leg, `mismatchReason` says which comparison, and the registry row is still `pending`. At `error` it is a presign, credential, or registry fault. Never emitted for an unauthorized caller, a malformed body, or an invisible scan — those are ordinary 401/400/404s and are not logged. |
| `edge_api_proxy_origin_rejected` | `error` | The proxy refused to forward a request whose resolved upstream escaped the pinned origin or the compatibility path set. Expected count is zero — any occurrence is a probe or a bug. Action: investigate the `traceId`; no notification wiring change. |

Cloudflare email notification provisioning remains an operator action. The Worker
does not send external email.
