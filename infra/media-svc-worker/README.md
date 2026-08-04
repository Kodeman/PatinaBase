# Media service worker

This Worker fronts the NestJS media HTTP service in a Cloudflare Container. Image-processing jobs remain in the separate `infra/media-worker` queue consumer.

## Mood-board background removal

The service exposes authenticated routes for mood-board background removal:

- `GET /boards/:boardId/background-removal-capability`
- `POST /boards/:boardId/items/:itemId/remove-background`

The POST body must be empty. The browser supplies only the board ID, item ID, and an `Idempotency-Key` header; the service resolves the current source from the authorized board item. Successful originals and cutouts live in Supabase Storage's `proposal-mood-boards` bucket. The existing media-service R2 buckets and queue pipeline are unchanged.

The implementation verifies the forwarded Supabase user JWT, applies board RLS plus an explicit studio-membership check, pins validated public DNS before fetching any stored external source, and records a durable quota/idempotency reservation in `svc_media.background_removal_requests`. Defaults are 25 successful/charged removals per studio per UTC month and 100 globally per UTC day. A paid vendor request is never retried.

## Server-only configuration

These Cloudflare Worker secrets are forwarded to the container only when present; no secret values belong in `wrangler.jsonc` or source control:

- `SUPABASE_SERVICE_ROLE_KEY` — used only for server-side reads/writes in the `proposal-mood-boards` Storage bucket and as the PostgREST project API key. Board reads still authorize with the caller's JWT.
- `REMOVE_BG_API_KEY` — API key for the initial remove.bg adapter.

Without `REMOVE_BG_API_KEY`, the capability route reports `background_removal_not_configured` and the mutation returns the same structured condition. Without the service-role key, the routes fail closed as unavailable. Configure secrets through the normal reviewed production-ops workflow; this change does not set secrets or deploy the Worker.

The approved non-secret bindings are `BACKGROUND_REMOVAL_PROVIDER=remove_bg`, `BACKGROUND_REMOVAL_STUDIO_MONTHLY_CAP`, and `BACKGROUND_REMOVAL_GLOBAL_DAILY_CAP`; the code defaults the caps to 25 and 100. No production values are committed by this change. The service also recognizes optional runtime overrides for `BACKGROUND_REMOVAL_MAX_SOURCE_BYTES`, `BACKGROUND_REMOVAL_SOURCE_TIMEOUT_MS`, `BACKGROUND_REMOVAL_VENDOR_TIMEOUT_MS`, `BACKGROUND_REMOVAL_STORAGE_TIMEOUT_MS`, and `BACKGROUND_REMOVAL_RESERVATION_TTL_MS`; an override must be deliberately forwarded from this Worker before it can affect the container.

## Schema release gate

Apply the committed Prisma migrations against the production `svc_media` direct/session connection before deploying the changed container:

```bash
DATABASE_URL='...?...&schema=svc_media' \
DIRECT_URL='...?...&schema=svc_media' \
pnpm --filter @patina/media prisma:deploy
```

The guarded command verifies the legacy schema created by `supabase/migrations/00053_svc_media_schema.sql`, records that exact schema as the one-time Prisma baseline when needed, rejects partial background-removal state, deploys pending migrations, and verifies the resulting objects. Do not use `prisma db push` in production. The container image includes the migration source for provenance, but its startup path intentionally does not mutate the database.

After a reviewed release, verify the schema object, authenticated capability behavior, a successful idempotent replay, foreign-board 404 behavior, and the latest Cloudflare deployment entry. `/version` is a static fallback and is not deployment evidence.
