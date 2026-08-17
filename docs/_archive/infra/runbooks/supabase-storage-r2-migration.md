> [!WARNING]
> Historical only. Do not execute this retired storage procedure. See `docs/engineering/patina-cloudflare-plan.md` for the current R2 roadmap.

# Runbook — Migrate Supabase Storage backend from local disk to Cloudflare R2

**Goal:** move the self-hosted `supabase/storage-api` object store off the local
`/var/lib/storage` Docker volume and onto Cloudflare R2, with **zero application
code change** (URLs, RLS, and `supabase.storage.from(...)` calls all keep working —
only the bytes move). This complements the media service, which already uses R2.

**Who runs this:** Kody, on the Coolify host (`kody@192.168.1.14`), in a short
maintenance window. The repo-side changes (compose + `.env.example`) are already
committed — see the diff on this branch.

**Scope of buckets moving:** `product-images`, `project-documents`,
`proposal-mood-boards`, `proposal-assets`, `portfolio-items`, `room-scans`,
`room-hero-frames`, `avatars`, plus feedback screenshots — every logical bucket in
`storage.objects`. storage-api namespaces them all as prefixes inside ONE R2 bucket.

---

## 0. Facts (verified against storage-api v1.0.6 source)

- S3 backend passes **only** `region` / `endpoint` / `forcePathStyle` to the S3
  client; credentials come from the **AWS SDK default chain** → `AWS_ACCESS_KEY_ID`
  / `AWS_SECRET_ACCESS_KEY`. (The `S3_PROTOCOL_*` vars are for the *inbound* S3
  server, not the backend — do not use them here.)
- On-disk layout is `FILE_STORAGE_BACKEND_PATH/<bucketName>/<key>`, which maps
  **1:1** to S3 key `<bucketName>/<key>` — a straight copy preserves keys.
- R2 account id: `be3aaeed18a81b5d90ee2263b62219ea` → endpoint
  `https://be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com`.
- Compose env already set on this branch (both `infra/docker-compose.supabase.yml`
  and `infra/coolify/docker-compose.supabase-coolify.yml`): `STORAGE_BACKEND=s3`,
  `GLOBAL_S3_BUCKET=${SUPABASE_STORAGE_R2_BUCKET:-patina-storage}`,
  `GLOBAL_S3_ENDPOINT=https://${R2_ACCOUNT_ID}...`, `GLOBAL_S3_FORCE_PATH_STYLE=true`,
  `REGION=auto`, `AWS_ACCESS_KEY_ID/SECRET` from `SUPABASE_STORAGE_R2_*`.

---

## 1. Provision R2 (Cloudflare dashboard or API)

1. Create R2 bucket **`patina-storage`** (same account as the media buckets).
2. Create an **R2 API token** with **Object Read & Write** scoped to `patina-storage`
   only (least privilege — do NOT reuse the media-service `R2_*` keys).
3. Put the values in the host `infra/.env` (never commit):
   ```
   SUPABASE_STORAGE_R2_BUCKET=patina-storage
   SUPABASE_STORAGE_R2_ACCESS_KEY_ID=<token access key id>
   SUPABASE_STORAGE_R2_SECRET_ACCESS_KEY=<token secret>
   # R2_ACCOUNT_ID is already set (shared with the media service)
   ```

## 2. Initial (live) sync — no downtime yet

Run rclone from a throwaway container that mounts the storage volume read-only, so
you don't need host paths. Replace the volume name if different (prod Coolify volume
is `es8w8g0c00og4gsgg0k8w8o8_storage-data`; `docker volume ls | grep storage`).

```bash
VOL=es8w8g0c00og4gsgg0k8w8o8_storage-data
docker run --rm -v "$VOL":/data:ro rclone/rclone \
  --s3-provider Cloudflare \
  --s3-endpoint  https://be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com \
  --s3-access-key-id     "$SUPABASE_STORAGE_R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$SUPABASE_STORAGE_R2_SECRET_ACCESS_KEY" \
  --s3-region auto --s3-no-check-bucket \
  copy /data :s3:patina-storage --progress --transfers 16 --checkers 32
```

Notes:
- rclone sets `Content-Type` from the file extension automatically, which covers the
  xattr caveat below for extension-bearing keys.
- This first pass can run against the live system; new writes during it are caught by
  the final sync in step 3.

## 3. Maintenance window — final sync + cutover

1. Announce a short window (uploads will 5xx briefly).
2. Stop just the storage service so no new local writes happen:
   `docker stop storage-es8w8g0c00og4gsgg0k8w8o8` (prod container name).
3. Re-run the **same rclone command** (it only copies deltas). Optionally use
   `sync` instead of `copy` for an exact mirror.
4. Deploy the updated compose (Coolify: update the base64 `docker_compose_raw`
   via the API, then `POST /applications/{uuid}/restart` — see the Coolify API notes
   in project memory). Ensure the new `SUPABASE_STORAGE_R2_*` env vars are present.
5. Bring storage back up; confirm healthcheck (`/status`) green.

## 4. Smoke test (do NOT skip — gate before decommission)

For **each** bucket, via the portals and/or curl against `api.patina.cloud/storage/v1`:
- **Existing object still loads:** open a pre-migration asset (a product image, a
  mood board, an avatar, a room scan) in the portal — it must render.
- **Content-Type is correct:** `curl -sI` a public object URL and confirm
  `Content-Type: image/...` (NOT `application/octet-stream`). If any come back as
  octet-stream, it's the xattr-loss case (see caveat) — re-check whether storage-api
  is sourcing type from Postgres; worst case re-upload those keys with an explicit
  `--header-upload "Content-Type: ..."` or fix the DB `metadata->>mimetype`.
- **New upload works:** upload a fresh file through a portal flow; confirm the object
  appears in R2 (`rclone ls :s3:patina-storage/<bucket>/...` or the CF dashboard) and
  is **not** newly written under `/var/lib/storage`.
- **Signed URL + one imgproxy transform** (e.g. a resized image) both succeed.

## 5. Decommission (after a few clean days in prod)

- Once verified, the `storage_data` / `...storage-data` volume is a cold backup.
  Keep it a week, then remove the volume mount from the storage service and delete
  the volume.

---

## Rollback

The local volume is untouched during migration, so rollback is instant: in the
storage service env, set `STORAGE_BACKEND: file` again (revert the compose block),
redeploy. Any objects uploaded *after* cutover live only in R2 — re-sync them back
with `rclone copy :s3:patina-storage /data` before reverting if you must preserve
post-cutover writes.

## Caveats / risks

- **xattr metadata loss:** single-part uploads on the file backend stored
  `content-type`/`cache-control` as **extended attributes**, which rclone does not
  carry into R2 object metadata. Mitigations: rclone infers Content-Type from the
  key's file extension, and storage-api serves Content-Type from its Postgres
  `storage.objects` metadata — so this is expected to be a non-issue, but it is the
  reason the step-4 Content-Type check is mandatory.
- **version suffixes:** if any on-disk filenames carry a `withOptionalVersion`
  suffix, they copy verbatim (keys still match) — no action, but eyeball a listing.
- **R2 S3 quirks:** covered by `forcePathStyle=true` + `region=auto` +
  `--s3-no-check-bucket` (R2 rejects some bucket-level HEAD/create calls).
