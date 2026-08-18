# Patina Cloudflare architecture roadmap

Status: approved target state; Phase 1 implementation plan  
Last updated: 2026-08-15  
Production data platform: Supabase Cloud project **Strata** (`bkvcixdmuyejfzcijpdg`)  
Production application platform: Cloudflare Workers, Containers, Queues, R2, Images, and Workers AI

## Executive decision

Patina will use a Cloudflare edge API as a strangler in front of Strata. Supabase remains the system of record for Auth, Postgres, Realtime, and the compatibility API surface. Cloudflare becomes the public routing, Worker-native API, media-delivery, and asynchronous enrichment plane.

The retired Coolify host, its tunnels, its self-hosted Supabase deployment, and its GHCR deployment path are not part of the target state. They must not be used for runtime, staging, administration, or background jobs. <!-- [retired-deploy-reference-allow: target-state boundary must name the retired platform explicitly] -->

```text
Web / iOS / Extension
        │
        ▼
api.patina.cloud — Edge API Worker
        ├── compatibility proxy ──► Supabase Auth / Realtime / REST / Functions
        ├── typed /v1 routes ─────► Hyperdrive ──► Strata Postgres + pgvector
        └── service bindings ─────► retained Cloudflare Containers
                                           └── Supavisor ──► Strata

assets.patina.cloud ──► policy + Image Transformations ──► private R2

Capture intake ──► Postgres outbox ──► Cloudflare Queue
                                           └── Workers AI + R2 + Hyperdrive
                                                   └── retained Nomic Container
```

## Non-negotiable boundaries

- Supabase Auth (GoTrue) is the only authentication system. NextAuth is not part of this architecture.
- Strata remains the production data platform. New Supabase branches are data-less and receive synthetic fixtures only.
- Hyperdrive is for Worker-native SQL. Retained Prisma Containers keep using Supavisor; a Hyperdrive binding is not a transparent TCP socket inside a Container.
- Authenticated, permission, write, read-after-write, vector, and session-sensitive queries use the cache-disabled `DB_FRESH` binding.
- `DB_PUBLIC_CACHE` is restricted to an approved public catalog view. It never handles user-scoped data.
- Migrations, Prisma, advisory locks, `LISTEN`/`NOTIFY`, admin tooling, and other session-dependent SQL never move to Hyperdrive.
- Supabase compatibility routes are uncached. Authenticated responses default to `Cache-Control: private, no-store`; public caching is an explicit route-level opt-in.
- R2 origins remain private. `assets.patina.cloud` is the sole delivery plane.
- `agent_tasks`, `aesthete_jobs`, `media-jobs`, and capture enrichment use separate ledgers/queues.
- Automated external sends remain prohibited; agent-produced drafts land in `awaiting_review`.

## Phase 1 target contracts

### Edge API compatibility plane

`api.patina.cloud` initially proxies these Supabase wire-compatible paths:

- `/auth/v1/*`
- `/realtime/v1/*`
- `/rest/v1/*`
- `/graphql/v1/*`
- `/functions/v1/*`
- `/storage/v1/*`

The proxy preserves methods, bodies, Supabase headers, cookies, redirects, WebSocket upgrades, CORS headers, response status, and response bodies. It prevents upstream/self-routing loops, disables caching, attaches a trace ID, and logs only structured metadata from an allow-list. Authorization, API keys, cookies, SQL parameters, URLs containing user data, and request/response content are never logged.

Clients migrate from compatibility endpoints to typed `/v1` routes one domain at a time. Auth and Realtime remain Supabase services behind the Cloudflare hostname.

### Public catalog API

`GET /v1/catalog/products?ids=<comma-separated UUIDs>`:

- accepts 1–50 unique UUIDs;
- rejects malformed or over-limit input before SQL execution;
- reads only a security-barrier view with hard-coded `layer = 'catalog'` and `status = 'published'` predicates;
- sorts by product ID;
- returns `CatalogProductSummary[]` from `@patina/types`;
- emits an ETag and `Cache-Control: public, max-age=60, stale-while-revalidate=15`;
- falls back to a normalized legacy public-catalog result if Hyperdrive fails or shadow comparison detects a mismatch;
- never widens authorization as part of fallback.

`CatalogProductSummary` contains: ID, name, brand, category, retail cents, image URLs, short description, `patinaManaged`, and the literal status `published`.

### Health contract

`GET /_internal/health` requires Cloudflare Access or a rotated service token. It probes both Hyperdrive bindings and returns only binding-level readiness. Database version, endpoint, credentials, schema names, and SQL errors are not returned.

### Hyperdrive topology

Two Hyperdrive configurations exist per remote environment:

| Binding           | Staging resource              | Production resource        | Cache policy    | Allowed workload                                                       |
| ----------------- | ----------------------------- | -------------------------- | --------------- | ---------------------------------------------------------------------- |
| `DB_FRESH`        | `strata-staging-fresh`        | `strata-prod-fresh`        | disabled        | authz, status, writes, read-after-write, pgvector, authenticated reads |
| `DB_PUBLIC_CACHE` | `strata-staging-public-cache` | `strata-prod-public-cache` | 60s + 15s stale | approved public catalog view only                                      |

Hyperdrive connects to the direct Supabase database endpoint with a dedicated least-privilege login and `pg` 8.16.3 or newer. Because Hyperdrive writes do not invalidate cached reads, no user-scoped or freshness-sensitive query may use `DB_PUBLIC_CACHE`.

### Database roles and claims

Migrations own two passwordless group roles:

- `edge_catalog_reader`: `NOLOGIN`, `NOBYPASSRLS`, schema usage plus `SELECT` on the public catalog view only. It has no direct `products` privilege.
- `edge_rls_user`: `NOLOGIN`, `NOBYPASSRLS`, permitted to assume the existing `authenticated` role through the fresh connection. It receives no broad bypass or service-role privilege.

Password-bearing `edge_catalog_login` and `edge_rls_login` are created out of band per environment, stored only in the relevant Hyperdrive configuration, and never committed or written by a migration.

An authenticated Worker route verifies the Supabase JWT issuer, audience, signature, and time claims, then begins one database transaction, applies transaction-local role and `request.jwt.claims`, executes the operation, and ends the transaction before releasing the connection. Tests must prove a later request cannot inherit the prior caller's role or claims.

## Phase 2 target: all owned media on R2

### Storage layout

Private US-jurisdiction buckets are split by durability contract:

| Environment | Originals                           | Artifacts                           |
| ----------- | ----------------------------------- | ----------------------------------- |
| staging     | `patina-staging-media-originals-us` | `patina-staging-media-artifacts-us` |
| production  | `patina-media-originals-us`         | `patina-media-artifacts-us`         |

Originals contain immutable uploaded or fetched source bytes. Artifacts contain print, offline, released-share, audit, processed non-image, and other materialized outputs. Existing `patina-raw` and `patina-processed` objects are inventoried and copied when their location or ledger contract does not satisfy this model.

### Universal object registry

Every media object receives an opaque object ID and version plus:

- bucket class and key;
- SHA-256 and R2 ETag;
- declared and observed MIME and byte size;
- image dimensions when applicable;
- provenance and third-party source/license metadata;
- access class and lifecycle state;
- creator and timestamps.

Domain tables keep authorization, licensing, guest-share, immutability, legal-hold, and retention ownership through registry references. Canonical rows never store signed URLs.

### Upload and delivery interfaces

- `POST /v1/media/uploads`: authenticated, domain-authorized, idempotent upload intent.
- `POST /v1/media/uploads/{uploadId}/confirm`: verifies actor and route/body identity, then compares R2 `HEAD` metadata with observed type, size, and checksum before enqueueing processing.
- `GET https://assets.patina.cloud/m/{mediaId}/v{version}/{preset}`: stable immutable public URLs; private bytes require a short-lived capability issued after domain authorization. Authorization runs before cached bytes are returned.

Initial raster presets are fixed and scale-down only: `thumb` 256px, `card` 512px, `detail` 1024px, and `hero` 1600px, with negotiated AVIF/WebP/JPEG. Workers use the Images binding against private R2 bytes; callers cannot supply arbitrary transformation parameters. Originals remain separately authorized.

Owned uploads always retain their original. Third-party product images enter through an SSRF-safe ingestion service, are copied to R2, and retain source/license provenance.

### Migration and rollback

The media migration uses resumable checkpoints and SHA-256 verification. Backfill recognizes bare keys, public/private Supabase URLs, persisted signed URLs, existing R2 keys, and external URLs. New portal, extension, and iOS releases use only the new contracts, with minimum versions enforced at cutover.

Source Supabase objects remain read-only for seven days after checksum verification. Rollback switches the resolver to the verified source. Domain-specific two-pass garbage collection starts only after the recovery window and a final reference/legal-hold check.

## Phase 3 target: capture enrichment

### Scope and ledgers

Chrome extension capture, Patina Field product capture, and designer-portal URL capture share one Capture Inbox API/UI. LiDAR and site-scan reconstruction remain separate.

`proposal_captures` and `field_captures` remain distinct lifecycle/RLS ledgers. Intake atomically and idempotently creates the source record and product while retaining source-specific `layer` and `status` semantics. Terminal failures preserve both records and expose manual retry.

`capture_enrichment_runs` is an orthogonal execution ledger with:

- target type/ID and content revision/hash;
- pipeline version;
- queued/running/ready/failed/cancelled status;
- dispatch state, attempts, and timestamps;
- redacted error and model metadata;
- versioned suggestions and provenance.

AI output is always a suggestion. It may prefill an empty field, but never overwrites designer-entered or device-confirmed data. Realtime progress uses proxied Supabase Realtime; uncached `(updated_at, id)` cursor polling is the recovery path.

### Outbox and queue contract

Capture intake and outbox insertion share the database transaction. A pg_cron reconciler sends undispatched rows because a Postgres transaction and Cloudflare Queue send cannot be atomic.

```ts
type CaptureEnrichmentMessageV1 = {
  schemaVersion: 1;
  enrichmentRunId: string;
  contentRevision: number;
  traceId: string;
};
```

Messages contain no source URLs, notes, user identity, or media bytes. The consumer loads authoritative Postgres/R2 state, atomically claims the current revision, and ignores duplicate, stale, dismissed, deleted, or superseded deliveries. Database idempotency is authoritative because Queues delivery is at-least-once and unordered.

### Workers AI chain

- image facts, caption, OCR: `@cf/moondream/moondream3.1-9B-A2B`;
- asynchronous Field transcription: `@cf/openai/whisper-large-v3-turbo`;
- JSON-schema normalization and suggestions: `@cf/google/gemma-4-26b-a4b-it`.

Suggestions normalize to English while retaining original OCR/transcript language. Matching uses the current category/material/color/style vocabularies and retains unmatched candidates separately. AI Gateway content logging and caching stay disabled. Derived OCR/transcript follows the capture lifecycle.

Only Cloudflare-hosted models are used. Retry only timeouts, capacity 429s, and platform 5xx. Invalid input, oversized payload, access/configuration errors, and unsupported media are terminal or partial completion.

Workers AI does not write embeddings. Current Nomic text/vision vectors and the inference Container remain canonical; content revision/hash becomes part of the Nomic job key so enrichment changes cannot leave stale vectors.

## Phase 4 target: finish the API strangler

Direct `/rest/v1` and RPC consumers migrate to typed routes in this order:

1. public reads;
2. authenticated reads;
3. idempotent writes;
4. financial and administrative workflows.

Every authenticated route verifies Supabase JWTs, uses transaction-local RLS claims, and connects through `DB_FRESH`. Cached Hyperdrive stays limited to explicitly reviewed public views. Orders, media, and projects Containers remain on Supavisor unless a separate project rewrites them as Worker-native APIs.

Compatibility `/rest/v1` and `/storage/v1` retire only after repository search, production telemetry, and minimum-client enforcement show no remaining consumers. The final stack has no Coolify runtime, staging, administration, or background jobs.

## Delivery phases and gates

### Phase 1 — edge foundation and catalog canary

1. Build the edge Worker, database roles/view/tests, shared type, client pilot, cache/auth cleanup, SSRF hardening, and legacy deployment removal in isolated branches.
2. Independently review authorization, pooled claims, caching, SQL input, SSRF, route loops, logs, and legacy-path removal.
3. Create the persistent data-less `staging` branch and apply deterministic synthetic fixtures.
4. Create the staging Worker and dual Hyperdrive configurations; validate complete Supabase compatibility plus catalog legacy/fresh/cached parity.
5. Perform a sanitized read-only production media/reference census and finalize later-phase contracts.
6. Independently sign off before production resource creation.
7. Create production roles/logins, Hyperdrive configurations, and Worker. Attach `api.patina.cloud/*` while retaining the direct Supabase DNS target.
8. Run compatibility mode, then a 10% → 50% → 100% catalog canary with one hour at each level and zero unexplained auth or normalized-result mismatches.
9. Drill the sub-five-minute rollback before 100%.

### Phase 2 — media

Repair existing upload/session/job/rendition contracts, add the registry and edge delivery gateway, migrate owned bytes with verified resumable copy, cut clients over with minimum versions, observe the seven-day recovery window, then retire direct Supabase Storage access.

### Phase 3 — capture

Add the enrichment ledger/outbox, Queue/consumer/DLQ, R2 and AI bindings, retry/replay operations, progress/recovery UI, and golden-set validation. Migrate all three producers to stable idempotency IDs.

### Phase 4 — typed domain APIs

Complete the risk-ordered compatibility migration and retire direct REST/Storage compatibility only when telemetry proves it safe.

## Phase 1 acceptance

- Clean database replay proves zero non-system `PUBLIC` schema/relation/column/sequence/routine exposure **except the signed exceptions in `supabase/tests/edge_api/public_acl_exception_registry.sql`** — the `supabase_admin`-owned `net` residual that `postgres` (`rolsuper = false`) cannot withdraw on Supabase Cloud. There is no separate platform-admin ACL phase; it was retired as unrunnable. Replay also proves future-routine hardening for the three owners this principal can `SET`, exact named compatibility grants, view predicates, RLS claims, pgvector behavior, and transaction reset. The aggregate read-only conformance gate must pass in each target environment before login creation, and its companion negative test must prove that gate still fails against a deliberately broken database.
- Worker install, generated bindings, TypeScript, unit/contract tests, and `wrangler deploy --dry-run` pass.
- Shared packages and all consumers pass their real type gates, including the strict admin build.
- Client pilot passes targeted tests and a live-data route probe.
- Aesthete hostile URL, redirect, DNS rebinding, oversized body, and timeout cases pass.
- Staging validates valid/expired/wrong-issuer JWTs, successive callers, all three product layers, injection inputs, Auth refresh/OAuth callback, Realtime WebSocket, REST/RPC/Functions/Storage passthrough, and defined infrastructure failures.
- Production returns no personal/studio products, emits no public caching for authenticated data, logs no secrets/content, and has zero unexplained shadow mismatches.
- The hourly 10% → 50% → 100% gates and timed rollback drill complete before merge/deploy is called finished.

## Authoritative references

- [Cloudflare Container connections](https://developers.cloudflare.com/containers/platform-details/workers-connections/)
- [Hyperdrive with Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)
- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Cloudflare Image Transformations via Workers](https://developers.cloudflare.com/images/optimization/transformations/transform-via-workers/)
- [Cloudflare Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
- [Workers AI: Moondream](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/)
- [Workers AI: Whisper](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- [Workers AI: Gemma](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
