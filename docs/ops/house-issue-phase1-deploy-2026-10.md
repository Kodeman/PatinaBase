# The House Issue — Phase 1 production deploy (US-49, SQ-1586)

- Date: 2026-10-22 (UTC), 00:57Z–01:17Z
- Outcome: **Phase 1 deployed, NOT landed.**
  - Live: media worker, edge function, migrations, client portal, R2 buckets.
  - The plate ingest lane collapsed (F1) and is paused (section 8).
  - Flag `client-edition-page` is held at **0%**.
- Source: main `9fd6863d7344a0702fb1230956c2b9a53e8d2b42` (SQ-1619 combined W2 gate green on this sha), deployed from a clean linked worktree at that commit (no `.env*` in `apps/client-portal`); `supabase db push` ran from the linked main checkout at the same commit (migrations dir byte-identical).
- Authorization: Kody's "deliver this entirely to production" (orchestrator dispatch comment, 00:31Z).
- Retired Coolify box: not touched.
- Raw logs and probe output: `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1586/`.

## 0. PostHog flag `client-edition-page` created at 0% (before any deploy)

- Project 326191 (same project as `single-pane` 803059). Flag id **982269**, `active: true`, one release group, no properties, `rollout_percentage: 0`, `bucketing_identifier: distinct_id`, `evaluation_runtime: all`.
- Probe: `POST https://us.i.posthog.com/flags/?v=2` (real Chrome UA, random distinct_id) → `{"key":"client-edition-page","enabled":false,"reason":{"code":"out_of_rollout_bound"}}`.

## 1. R2 buckets

- `npx wrangler r2 bucket create patina-plates` and `… patina-plates-staging` (from `infra/media-worker`).
- `r2 bucket list`: `patina-plates` created 2026-10-22T00:58:13.403Z; `patina-plates-staging` created 2026-10-22T00:58:15.278Z.
- `r2 bucket dev-url get patina-plates`: "Public access via the r2.dev URL is disabled."

## 2. Media worker

- `infra/media-worker/wrangler.jsonc`: `vars.SUPABASE_STORAGE_ORIGIN` set to `https://bkvcixdmuyejfzcijpdg.supabase.co` at the top level AND under `env.staging` (was `""`; committed with this note).
- `npx wrangler secret put PLATE_INGEST_SECRET`: fresh 48-byte value from `openssl rand -base64 48 | tr '+/' '-_'` (64 chars), piped by stdin, never printed. `wrangler secret list` names: COMPLETE_CALLBACK_SECRET, COMPLETE_CALLBACK_URL, ENQUEUE_SECRET, PLATE_INGEST_SECRET.
- `npx wrangler deploy` (Docker `credsStore` workaround from the README): container app `patina-media-worker-mediaprocessor` (a03e87b7-1e9c-4d7e-9e55-9174e6a974ce) modified; bindings table lists `env.PLATES (patina-plates) R2 Bucket` and `env.SUPABASE_STORAGE_ORIGIN ("https://bkvcixdmuyejfzcijpdg.supabase...")`; URL `https://patina-media-worker.kody-be3.workers.dev`.
- `npx wrangler deployments list` (oldest first, last three):
  - 2026-09-02T02:44:40Z Upload `2bd8f98f-0cb8-46d9-b52d-fd0d52164131` (previous good)
  - 2026-10-22T00:58:50Z Secret Change `981fe2da-cf5f-4e76-8138-7c54675c17dd`
  - **2026-10-22T00:59:21Z Upload `148a345f-6802-4fe7-b045-cdff30bb3541` (bottom row)**
- Probe: `POST /plates/ingest` without bearer → 401.

## 3. Edge function `client-plate-copy` on Strata

- `supabase secrets set --env-file …` (MEDIA_WORKER_URL=https://patina-media-worker.kody-be3.workers.dev, PLATE_INGEST_SECRET=same value): `count: 2`; both names updated 2026-10-22T01:00:33Z (neither existed before).
- `supabase functions deploy client-plate-copy --project-ref bkvcixdmuyejfzcijpdg` → "Deployed Functions." (95 kB).
- `supabase functions list` row: `client-plate-copy` id e64ba46a-728f-4047-a6cd-c4e62784ba25, ACTIVE, version 1, verify_jwt true, updated 2026-10-22T01:00:36Z.

## 4. Migrations 00842 / 00843

- Before: `supabase migration list` — pending exactly `00842`, `00843`; no remote-only rows. Plain `db push --dry-run` refused (`DbPushMissingRemoteError`: local files before remote `20260910152111`); `db push --include-all --dry-run` listed exactly the two files.
- `supabase db push --include-all` 01:01:17Z–01:01:21Z: "Applying migration 00842_client_editorial_reader.sql… Applying migration 00843_client_plate_assets.sql… Finished supabase db push."
- After, `supabase migration list` tail: `00841|00841`, `00842|00842`, `00843|00843`, `20260910152111|20260910152111`; 0 pending.
- Backfill + dispatcher (read-only SQL):
  - 01:02:03Z — first run 288016 started 01:02:00 (`dispatch_state: sent`); requests: maker 223, scan 21, board 1 (245 total).
  - 01:02:52Z — 7 maker `done`, 7 `client_plate_assets` rows.
  - 01:09:48Z (8 min) — `done` maker 7; `leased` maker 7; `queued` maker 209, scan 21, board 1; `failed` 0; assets 7.
  - job_runs: 288016 succeeded (claimed 10, recorded 7, failed 3); **288018, 288020, 288022, 288028, 288030, 288032 failed (claimed 10, recorded 0, failed 10 each, "all 10 copies failed")**.
  - Error classes (`last_error`, all attempts=1, requeued): `ingest 504: {"error":"processor did not finish within 25 s"}` — maker 60, scan 5, board 1. **No 403 class yet; the only class is the processor deadline.** See Findings F1.

## 5. Client portal

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` exported from `apps/client-portal/wrangler.jsonc` `vars` in the same shell, then `./infra/deploy-portal.sh client`.
- Preflight: all three sources `exported`; URL `https://bkvcixdmuyejfzcijpdg.supabase.co`; 15 NEXT_PUBLIC_* vars exported in Phase 0b. Ends "==> Done: client portal deployed to production."
- Bindings table includes `env.PLATES (patina-plates) R2 Bucket`, plus SVC_PROJECTS/SVC_ORDERS/SVC_MEDIA, PAY_LINK_RATELIMIT, ASSETS. Startup 23 ms; handler 8,905,702 bytes.
- `npx wrangler deployments list --name patina-client-portal`:
  - 2026-10-21T10:36:45Z `02128e9a-a5b5-4b04-b52a-e8c50bc7b4a9` (previous good)
  - **2026-10-22T01:03:17Z `0a2eec5e-ca71-46fd-a3b7-a049bd73ce4f` (bottom row)**
- Built bundle (`apps/client-portal/.open-next`): 3 files mention `client-edition-page`; 0 inlined `client-edition-page:<value>` overrides; `NEXT_PUBLIC_FLAG_OVERRIDES` appears only as the runtime `process.env` read.
- `/api/version` → 200.

## 6. Probes (read-only)

Signed out (curl):

| Case | Request | Result |
|---|---|---|
| step 6 / (d) | `curl -sI …/plates/00000000-0000-0000-0000-000000000000/<64 zeros>/wide-1280.avif` | **401**, `cache-control: private, no-store`, no `location` |
| (d) | same, GET | 401, `private, no-store`, body 0 bytes, no `location` |
| (e) | `…/wide-12.png`, `…/hero-1280.avif` | 404, body 0 bytes, `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` |
| (f) | cross-site headers (`Sec-Fetch-Site: cross-site`, foreign Origin/Referer), no cookies | 401, `private, no-store`, body 0 |

Signed in (Chrome, same-origin fetch on client.patina.cloud; the session is a Middle West Studio member, which `client_can_read_plate` admits through `can_buy_for_project`). Plate: project 008225a4-… (member), sha `f97e5971…78af`, `piece-512`:

| Case | Result |
|---|---|
| (a) GET `piece-512.avif` | **200**, `cache-control: private, max-age=3600`, `vary: rsc, …, Cookie`, `x-content-type-options: nosniff`, `etag: "f8e4d98e8557db018d8774c9deb56e55"`, `content-type: image/avif`, 842 bytes |
| (a) GET `piece-512.webp` | 200, same headers, `image/webp`, 1,382 bytes |
| (b) `If-None-Match: "<etag>"` | **304**, only ETag + `private, max-age=3600` + Vary, 0 bytes |
| (b) `If-None-Match: W/"<etag>"` | 304 (lean) |
| (b) `If-None-Match: "x", "<etag>"` | 304 (lean) |
| (b) non-matching `If-None-Match` | 200 |
| (c) same sha under another member project (6dbe6814-…) | **404**, empty |
| (c) same sha under a non-member project (2d906fa1-…) | 404, empty |
| crop not emitted (`wide-1280.avif`) | 404, empty |
| (e) malformed / short sha, signed in | 404, empty |

- The member 200 shows that the Headers-typed `onlyIf` is accepted by the R2 binding under OpenNext (SQ-1622 F6).
- Deviation, not blocking: route 404s leave the Worker with Next's `private, no-cache, no-store, max-age=0, must-revalidate`, not the route's literal `private, no-store`. They are still no-store with an empty body; 401s keep the literal value.

Not done (OWED): see below.

## 7. PostHog flag rollout

- Final state: **0%** (id 982269, active, one group, `rollout_percentage: 0`).
- The orchestrator ruled at 01:13Z to HOLD the flag at 0. A page whose plates have not ingested renders silhouettes for every piece, and the ON path has never been observed in prod. That is not Phase 1 landed.
- A follow-up ticket repairs the lane and then raises the flag.

## 8. Plate lane paused (prod mutation, reversible)

- 01:13:43Z: `select cron.alter_job(job_id := 69, active := false)`, i.e. jobid **69** `client-plate-copy-dispatch` (`* * * * *`, `SELECT public.dispatch_client_plate_copy();`). `cron.job` then shows `active: false`.
  - The orchestrator's `UPDATE cron.job …` was refused (`42501 permission denied for table job`); `cron.alter_job` is the supported path.
- No failed requests were re-queued and no `attempts` value was touched.
- Run 288047, started 01:13:00 before the pause, was allowed to finish: 01:14:51, failed, claimed 10 / recorded 0 / failed 10.
- Confirmation at 01:16:09Z: the newest `job_runs` start is still 01:13:00, so no run began in the 2+ minutes after the pause.
- Final queue state, by status/source_kind/attempts:
  - done: maker/1: 7
  - queued: board/1: 1, maker/0: 111, maker/1: 105, scan/0: 14, scan/1: 7
  - leased: 0; failed: 0
- Nothing reached the permanent-failure cap.
- Resume after the repair: `select cron.alter_job(job_id := 69, active := true);`

## Findings

- **F1 (major, production): the plate ingest lane collapsed after the first run.** Since 01:03Z every `client-plate-copy` run fails 10/10 with `ingest 504: processor did not finish within 25 s`. `wrangler tail` shows only `POST /plates/ingest → 504`, with no logs or exceptions. Container app health: 1 active, 4 healthy, 0 failed.
  - Likely cause: every ingest is addressed to ONE container instance (`getContainer(env.MEDIA_PROCESSOR, 'plates')`, 1 vCPU, standard-2). The edge runs `CONCURRENCY = 3` per run, and the minute cron starts overlapping runs of about 105 s each. Work the edge has abandoned keeps running in the container (the SQ-1602/SQ-1609 residual: abort across the DO/Container boundary is unverified), so the container saturates.
  - Requests become `failed` permanently at `attempts >= 3`. The sources are retained, so they can be re-queued by SQL after a repair.
  - Pages degrade to silhouettes and drawn covers, the designed fallback; nothing leaks.
- F1 snapshot at 01:13:54Z (read-only):
  - Requests by status/source_kind/attempts:
    - done: maker/1: 7
    - leased: maker/1: 6, scan/1: 1
    - queued: board/1: 1, maker/0: 111, maker/1: 99, scan/0: 14, scan/1: 6
    - failed: 0
  - The 7 assets, all `maker`, written 01:02:05–01:02:34 by run 288016:
    - 93cf80a5-3179-4bc0-867e-c305911709d8 (6dbe6814)
    - a1ac1a2a-460b-408c-9e03-ff2104ad6d02 (2d906fa1)
    - c6c8ed72-41a6-4035-89f8-602060b9a52a (6dbe6814)
    - d63d094d-0345-499e-9a16-c728cc243dfe (008225a4)
    - bb4448ee-90b4-49fe-a151-0f72d86f2c80 (008225a4)
    - 3728acf1-19b8-4041-a1ed-1a154a10f641 (904bfc77)
    - ffe87636-ca72-474c-840b-13f6b854bf79 (008225a4)
  - `job_runs` client-plate-copy (start–finish, seconds, claimed/recorded/failed):
    - 288016 01:02:00–01:02:58, 59 s, 10/7/3, succeeded
    - 288018 01:03:00–01:04:42, 102 s, 10/0/10
    - 288020 01:04:00–01:05:42, 102 s, 10/0/10
    - 288022 01:05:00–01:06:43, 103 s, 10/0/10
    - 288028 01:06:00–01:07:44, 105 s, 10/0/10
    - 288030 01:07:00–01:08:45, 105 s, 10/0/10
    - 288032 01:08:00–01:09:46, 106 s, 10/0/10
    - 288034 01:09:00–01:10:46, 107 s, 10/0/10
    - 288036 01:10:00–01:11:48, 108 s, 10/0/10
    - 288043 01:11:00–01:12:25, 85 s, 10/0/10
    - 288045 01:12:00–01:13:49, 110 s, 10/0/10
    - 288047 started 01:13:00, before the pause

    Every failed run reports "all 10 copies failed".
  - Container app `patina-media-worker-mediaprocessor` a03e87b7-1e9c-4d7e-9e55-9174e6a974ce:
    - version 5 (image sha256:2531c808…5292), standard-2 (1 vCPU, 6 GiB), max_instances 5;
    - health: active 1, healthy 4, failed 0;
    - every ingest is routed to the single DO/container key `'plates'`.
- F2: no storage-hosted board cover exists in prod. The single board request is a public Herman Miller hotlink, so the SQ-1613 "one signed board-cover ingest" probe cannot be run on existing data. The equivalent signed private path is the 21 room-scan requests, and they are currently stuck behind F1.
- Residuals carried from reviews, not fixed here:
  - SQ-1602: concurrent same-bytes ingests can race the crops.json write; fetch 10 s plus processor 25 s can exceed the edge's 30 s by up to 5 s; abort across DO/Container is unverified (now observed as F1).
  - SQ-1609 R2: concurrent crop-union loss. SQ-1609 R4: the processor deadline can outlive the edge by up to 5 s.
  - SQ-1613: F1 empty-var weaker pin (moot, the var is set); F4 three untested redirect cases; F6 README and wrangler comment staleness.

## OWED

- **(a) Lane repair, re-queue and cron resume.** Fix F1. Repair sites:
  - single container key: `infra/media-worker/src/index.ts:178` `getContainer(env.MEDIA_PROCESSOR, 'plates')`;
  - edge `CONCURRENCY = 3`: `supabase/functions/client-plate-copy/index.ts:24`;
  - processor deadline `PROCESSOR_TIMEOUT_MS = 25_000`: `infra/media-worker/src/plates.ts:24`;
  - edge abort `INGEST_TIMEOUT_MS = 30_000`: `supabase/functions/client-plate-copy/lib.ts:54`;
  - attempt cap `attempts >= 3`: `supabase/migrations/00843_client_plate_assets.sql:565,676`;
  - overlapping minute runs.

  Then re-queue the failed/attempted requests deliberately and resume jobid 69.

  **Repair (SQ-1629, corrected by SQ-1634).** Root cause: one 1-vCPU container took every ingest. The edge ran 3 at a time, minute runs of about 105 s overlapped, abandoned work kept its CPU, and AVIF at Sharp's default effort 4 cost 5.8 of the 7.0 s that a 2500x2500 Herman Miller source needs. That class is 122 of the 238 queued.
  - The media worker encodes AVIF at effort 2: a 2500x2500 source falls from 7.0 s to 2.2 s, with the same or fewer bytes.
  - The container runs one plate job at a time, each in its own forked process. A second job meanwhile gets `503 {"error":"busy"}` at once. At the job's budget, or when the Worker hangs up, the container SIGKILLs the job's process and answers 504; it takes the next job only once that process has exited. The budget is what is left of the Worker's 25 s less 1 s, counted from when the request arrives.
  - client-plate-copy claims one request at a time and keeps one ingest in flight. Its run clock starts at function entry: no copy starts after 20 s, and every awaited step (claim, ownership read, signing, ingest, record, fail, finish) has ended by 50 s. The ingest gets min(30 s, time left less 5 s). A row whose ownership read or signing comes back after 20 s, or whose claim comes back between 20 s and 45 s, is failed unstarted as `run budget exceeded`. A `503 busy` ingest is failed as `ingest 503 busy` and ends that run.
  - A claim still unanswered at its 45 s step deadline is abandoned: the run stops waiting and ends, and a response that arrives later, at 46 s or after the 50 s hard end alike, is never settled. **Ruling (SQ-1655 R1):** if the database leased a row for an abandoned claim, recovery waits for its 10-minute lease expiry. The attempt cap (`attempts >= 3`) counts every claimed attempt, because the claim itself increments `attempts`: a `503 busy`, an `ingest 504`, a `run budget exceeded` and an abandoned claim each spend one. So a row that already has 2 attempts is left `failed` by the dispatcher on its first abandoned claim, not re-queued, and its `last_error` keeps the earlier attempt's text (the dispatcher writes `COALESCE(last_error, 'lease expired')`), so it does not say the lease expired. The separate expired-lease recovery in step 4(b) handles an expired lease while the cron is paused; a row already marked `failed` by the dispatcher needs deliberate operator re-queueing.
  - There is no new migration.

  Finish steps (SQ-1631), in order, with jobid 69 still paused:
  1. Deploy the media worker: `cd infra/media-worker && npx wrangler deploy`. This rebuilds the container image, because `container/` changed. Keep `SUPABASE_STORAGE_ORIGIN` at both levels.
  2. Run `supabase functions deploy client-plate-copy`.
  3. Quiescence check. Run it and print the result; go on only when it reads `quiescent`:
     ```sql
     SELECT CASE WHEN count(*) = 0 THEN 'quiescent' ELSE 'NOT quiescent: wait, then re-check' END AS verdict,
            count(*) AS running_runs,
            max(started_at) AS newest_running_start
     FROM public.job_runs
     WHERE job_name = 'client-plate-copy'
       AND status = 'running'
       AND started_at > now() - interval '15 minutes';
     ```
  4. Re-queue. Run these only while jobid 69 is paused.
     - (a) The rows the broken lane spent attempts on. This includes `queued` rows, so that the 1-attempt requests get all 3 attempts back. It never touches a `leased` row:
       ```sql
       UPDATE public.client_plate_requests
       SET status = 'queued', attempts = 0, last_error = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE status IN ('queued', 'failed')
         AND last_error LIKE 'ingest 504%';
       ```
     - (b) Expired leases. This is a separate statement, run only after step 3 printed `quiescent`. It touches only leases that have already run out, and it repeats the step 3 check, so it changes nothing while a run is open:
       ```sql
       UPDATE public.client_plate_requests
       SET status = 'queued', attempts = 0, last_error = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE status = 'leased'
         AND lease_expires_at < now()
         AND NOT EXISTS (
           SELECT 1 FROM public.job_runs
           WHERE job_name = 'client-plate-copy'
             AND status = 'running'
             AND started_at > now() - interval '15 minutes'
         );
       ```
  5. Resume the cron: `select cron.alter_job(job_id := 69, active := true);`. Note the time.
  6. Watch for 10 minutes. Pass means all four hold:
     - every run finishes in under 60 s;
     - two runs are never `running` at once;
     - `recorded` grows;
     - no request gets an `ingest 504` error.
     ```sql
     -- Each run: how long it took, and what it did.
     SELECT id, status, started_at, finished_at - started_at AS took, detail, error
     FROM public.job_runs
     WHERE job_name = 'client-plate-copy' AND started_at > now() - interval '10 minutes'
     ORDER BY started_at;

     -- Overlapping runs: expect no rows.
     SELECT a.id, b.id
     FROM public.job_runs AS a
     JOIN public.job_runs AS b
       ON a.id < b.id
      AND b.started_at < coalesce(a.finished_at, now())
      AND a.started_at < coalesce(b.finished_at, now())
     WHERE a.job_name = 'client-plate-copy' AND b.job_name = 'client-plate-copy'
       AND a.started_at > now() - interval '10 minutes'
       AND b.started_at > now() - interval '10 minutes';

     -- Errors since the resume: expect 0 for 'ingest 504%'. Any 'ingest 503 busy' means two runs met at the processor.
     SELECT last_error, count(*)
     FROM public.client_plate_requests
     WHERE updated_at > now() - interval '10 minutes' AND last_error IS NOT NULL
     GROUP BY last_error;
     ```
     If any check fails, pause again with `select cron.alter_job(job_id := 69, active := false);`.
- **(b) Flag → 100.** Raise `client-edition-page` (982269) to 100%, then assert that the hero figure and its `<link rel=preload>` for `/plates/…` are PRESENT in signed-in server HTML (view-source or a curl with the session cookie), not merely that nothing errored. Take one TTFB reading before and after the rise (600 ms server-decision budget).
- **(c) Signed private-source ingest proof.** Queue, then a worker fetch pinned to `SUPABASE_STORAGE_ORIGIN`, then R2 renditions, then a `client_plate_assets` row.
  - No storage-hosted board cover exists in prod; the only board request is a public hotlink.
  - The proof therefore needs a room scan (`room-scans`, 21 requests queued) or a concept render (`room-renders`; none set in prod today).
- **(d) Signed-in client-page probes.** These need a client session on a project where that account is `client_id`. Check at 390 and 1440:
  - hero and standing rows render;
  - a scope-change title containing "%" shows "A request is waiting for you." in row 2 (R1);
  - an invoice pay link still resolves `#letterbox`.

  The only browser session available here was a studio member with no client project: `/` renders the letterbox door hold and `/projects/<id>` renders nothing.

## Rollback (recorded, not run)

- Client portal: `cd apps/client-portal && npx wrangler rollback 02128e9a-a5b5-4b04-b52a-e8c50bc7b4a9` (or redeploy main at the prior commit through `deploy-portal.sh`).
- Flag: set `client-edition-page` (982269) rollout to 0, or turn it inactive. Fail-closed: today's page renders.
- Media worker: `cd infra/media-worker && npx wrangler rollback 2bd8f98f-0cb8-46d9-b52d-fd0d52164131`. The plate lane then 404s, and requests fail and stay re-queueable.
- Plate copy: already paused (`cron.alter_job(69, active := false)`, section 8); `active := true` resumes it.
- Migrations 00842/00843 are additive, with no down migration; roll forward only.
- R2 buckets stay; they are private, with r2.dev disabled.
