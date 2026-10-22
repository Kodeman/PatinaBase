# The House Issue — Phase 3 production deploy order (US-49)

- Status: **plan, not yet run.** Nothing here has touched Strata or Cloudflare.
- Authorization: a prod deploy needs Kody's explicit request in the session that runs it.
- Scope of this note: the order that framing-versioned plate keys (SQ-1728) need. Other Phase 3 tickets add their own steps in this order.

## Order

1. **Media worker first** (`cd infra/media-worker && npx wrangler deploy`, with the README Docker workaround).
   - From this deploy on, the worker never rewrites an R2 rendition key with a different framing. A framed copy writes under `plates/<project>/<sha256>/f/<rev>/…`, and its crops name `rev`. A null-framing copy keeps the unversioned prefix unless that prefix already holds another framing. The original is written once per sha256.
   - The worker goes first so that no re-crop leased after this point can overwrite bytes a frozen edition shows. That was the SQ-1727 F1 hazard.
   - The `GET /plates/<project>/<sha256>/piece-{512|768}.webp` route still reads the unversioned piece first. Then it reads any `f/<rev>/` prefix, so the composer can see bytes that were first copied with a framing.
2. **client-plate-copy**: unchanged by SQ-1728, so it needs no deploy for this ticket. It passes the worker's `crops` (with `rev`) through to `record_client_plate_asset` unchanged. Its `originalKey` prefix check accepts the sha-level original.
3. **Migrations** (`supabase db push`): 00848 and 00849 as Phase 3 ships them. SQ-1728 changes only comments in 00848. Schema and functions are unchanged: `crops` is jsonb, and `rev` rides in each crop entry.
4. **Client portal last** (`./infra/deploy-portal.sh client-portal`, with the Supabase trio exported from `apps/client-portal/wrangler.jsonc`).
   - Pages build `?r=<rev>` from each crop's stamp. The `/plates` route resolves `?r=` to `f/<rev>/<file>`.
   - When no versioned object exists, the route falls back to the unversioned object, but only if that prefix's `crops.json` has the same framing. A malformed or repeated `r` gets a 404 before auth or any read.
   - `Cache-Control: private, max-age=3600` is unchanged: a versioned key never changes bytes, and an unversioned key is no longer rewritten with another framing.

## Window between steps 1 and 4

- New null-framing first copies land at the unversioned prefix with unstamped crops. The old client route serves them as before.
- New framed copies (and re-crops) land under `f/<rev>/` with stamped crops. The old client route ignores `r` and reads the unversioned key. Until step 4, such a picture shows the older unversioned framing if one exists, and otherwise does not load (404). Keep the window short. Pausing plate cron 69 across it is optional: it stops new framed copies from landing.
- Legacy objects (~242 copied before this change) are not re-copied. Their rows carry unstamped crops, so the page keeps reading them unversioned.

## Probes after step 4

- A legacy plate URL with no `r` gives 200, unchanged.
- A plate whose crops carry `rev` gives 200 at `?r=<rev>`.
- `?r=XYZ` and `?r=<rev>&r=<rev>` give 404 with `private, no-store`, before sign-in is checked.
- `wrangler deployments list` for both Workers: read the bottom row.

## Rollback

- Client portal: roll back to the previous version. The old route ignores `r` and serves the unversioned key, so framed-only copies stop loading again.
- Media worker: rolling back restores overwrite-in-place for re-crops (the F1 hazard). Do it only together with pausing cron 69.
