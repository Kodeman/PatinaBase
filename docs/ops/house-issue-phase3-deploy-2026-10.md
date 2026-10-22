# The House Issue — Phase 3 production deploy order (US-49)

- Status: **plan, not yet run.** Nothing here has touched Strata or Cloudflare.
- Authorization: a prod deploy needs Kody's explicit request in the session that runs it.
- Scope of this note: the order that framing-versioned plate keys (SQ-1728, repaired by SQ-1732) need. Other Phase 3 tickets add their own steps in this order.

## What changes

- **Media worker.** Every ingest, null framing included, writes its renditions and `crops.json` under `plates/<project>/<sha256>/f/<rev>/`, and every crop in its answer carries `rev`.
  - `rev` is 32 lowercase hex: the first 128 bits of SHA-256 over JSON `[focal, subjectBox]`.
  - The unversioned prefix `plates/<project>/<sha256>/` becomes read-only history. The only write there is the original, once. Its key names the sha256 of its own bytes, so it is the same under every framing.
  - A key is therefore only ever put again by a writer rendering the same framing: a retry, or two same-framing ingests racing. Real Sharp re-renders a framing byte-identically (`test/plate-publication.test.mjs`).
- **Client portal.** Pages build `?r=<rev>` from each crop's stamp. Unstamped (Phase 1–2) crops get no `r`.
  - The `/plates` route reads `f/<r>/<file>` for exactly one 32-hex `r`. That key only, with no fallback.
  - Any other `r` counts as none, and the route reads the unversioned key, as the Phase 2 route did. That covers no `r`, several, a malformed one, or SQ-1643's base36 cache-busters in pages already open.
  - `client_can_read_plate` still runs before any read.
- **client-plate-copy, migrations:** no change for this. `crops` is opaque jsonb, and `rev` rides in each crop entry.

## Order

0. **Pause plate cron 69 and drain it.**
   - Run `select cron.alter_job(job_id := 69, active := false);`.
   - Run the quiescence check from the Phase 1 note (`house-issue-phase1-deploy-2026-10.md`, SQ-1631 finish step 3) until it reads `quiescent`.
   - Then wait 60 s more. A Worker ingest ends within about 40 s of its start: source 10 s, processor 25 s, then the puts. The 60 s covers one the edge abandoned at 30 s.
   - Until step 3, do not invoke client-plate-copy by hand either. Its manual run (`begin_client_plate_copy_run`, service_role only) is the one other path to the worker's ingest.
   - Why: windows W1 and W2 below.
1. **Client portal first:** `./infra/deploy-portal.sh client-portal`, with the Supabase trio exported from `apps/client-portal/wrangler.jsonc`.
   - The new route reads what the old worker writes: unstamped crops at unversioned keys.
2. **Media worker:** `cd infra/media-worker && npx wrangler deploy`, with the README Docker workaround.
3. **Resume plate cron 69:** `select cron.alter_job(job_id := 69, active := true);`. From here on, every copy is stamped and versioned.
4. **client-plate-copy:** no deploy for this change. It passes `crops` through unchanged, and its `originalKey` prefix check accepts the sha-level original.
5. **Migrations 00847–00849** (`supabase db push`, with client-plate-check deployed before 00849, since 00849 schedules it). Run them after step 3.
   - They have no dependency on either Worker.
   - 00848 must not be live while the old worker can still write (W2).

## Why reads need no pause, and why the pause is still here

- **Reads are correct in every mix, without a pause.** The old worker writes only unversioned keys, with no stamp. So an old-worker ingest still in flight at step 1 or 2 produces crops the new client reads at the unversioned key, which is where the old worker wrote them. The new worker's stamped crops reach pages only after step 1, through the new route.
- **W1: stale framing for up to an hour (cosmetic).** Between steps 1 and 2, an old-worker re-crop (`set_plate_focal`, perception) still overwrites an unversioned key in place, and the crop stays unstamped.
  - The new client's URL for that crop no longer changes with focal: the Phase 2 base36 `r` is gone.
  - So a browser that cached the picture keeps the old framing until `max-age=3600` runs out.
  - With the cron paused and drained, no old-worker write happens after step 1.
- **W2: a frozen edition's bytes could change (SQ-1727 F1).** 00848 freezes a closed job's edition. The old worker re-crops in place at the unversioned key.
  - A re-crop leased before a close, and finished by the old worker after it, rewrites bytes that the frozen page reads. 00848 keeps the SQL row, but not the R2 bytes.
  - Before 00848 there is no frozen edition, so the old worker's in-place re-crop is only what Phase 2 does in prod today.
  - So 00848 must land after the last old-worker write, which step 0's drain guarantees.

## Probes after step 3

- A legacy plate URL with no `r` gives 200, unchanged.
- The same URL with a base36 `r` (for example `?r=1k2j3h`) gives 200 and the same bytes, so already-open pages keep their pictures.
- A plate copied after step 3 has `rev` on its crops and gives 200 at `?r=<rev>`.
- A 32-hex `r` that names no object gives 404 with `private, no-store`. Any `r` gives 404 to a non-member.
- `wrangler deployments list` for both Workers: read the bottom row.

## Rollback

- **Client portal:** the old route reads only unversioned keys. After step 3, copies the new worker made exist only under `f/<rev>/`, so they show the silhouette. Roll forward instead where possible.
- **Media worker:** rolling back restores overwrite-in-place at the unversioned key (W2). The new client reads its unstamped crops correctly. Once 00848 is live, roll back only together with pausing cron 69.
- Legacy objects (about 242 copied before this change) are never re-copied or rewritten. Their rows keep unstamped crops and read at the unversioned key.
