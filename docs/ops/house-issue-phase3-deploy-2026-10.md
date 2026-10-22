# The House Issue — Phase 3 production deploy order (US-49)

- Status: **deployed** (SQ-1599, 2026-10-22, ~18:55Z). The orchestrator ran the procedure directly; the run log and final evidence are below.
- Authorization: a prod deploy needs Kody's explicit request in the session that runs it.
- Scope of this note: the order that framing-versioned plate keys (SQ-1728, repaired by SQ-1732) need. Other Phase 3 tickets add their own steps in this order.
- SQ-1734 changes only this procedure and a read-only listing helper. No prod checks or mutations were run to prepare it.

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

Commands below are for a separately authorized deploy session, from the repository root unless stated otherwise. SQL blocks run in that session's authenticated Strata SQL editor. Never paste credentials into this note or a receipt.

0. **Pause plate cron 69 and drain it (cheap first step, not proof of Worker termination).**
   ```sql
   select cron.alter_job(job_id := 69, active := false);
   ```
   - Run the quiescence check from the Phase 1 note (`house-issue-phase1-deploy-2026-10.md`, SQ-1631 finish step 3) until it reads `quiescent`, then allow another 60 s for ordinary work to settle.
   - `job_runs` observes the edge caller, not the remote Worker's publication. The processor timer is cleared before sequential R2 puts; a client abort and another 60 s do **not** prove those puts stopped (SQ-1733 F1's application-level reproduction, not an observed prod failure).
   - Until step 3, do not invoke client-plate-copy by hand either. Its manual run (`begin_client_plate_copy_run`, service_role only) is the one other application path to the worker's ingest. Do not send version-override or old preview/version URL requests during this procedure.
1. **Client portal first:** `./infra/deploy-portal.sh client` (the script accepts only `client|designer|admin|manufacturer` and exits 2 otherwise), with the Supabase trio exported from `apps/client-portal/wrangler.jsonc` in the same shell.
   - Go to step 2 only if this exits 0 and the bottom row of `(cd apps/client-portal && npx wrangler deployments list)` is the new deployment. On any failure, stop: the worker must not go ahead of the client.
   - The new route reads what the old worker writes: unstamped crops at unversioned keys.
2. **Media worker:** deploy with the README Docker workaround.
   ```sh
   (cd infra/media-worker && npx wrangler deploy)
   (cd infra/media-worker && npx wrangler deployments list)
   ```
   - Continue only if `wrangler deploy` exited 0. On failure, stop and record it; the old worker keeps serving, so nothing else changes.
   - Read the **bottom two rows** (oldest-first). Record the previous row's version UUID as `OLD_VERSION_ID` (not its deployment ID), the new version UUID, and the new deployment's UTC time as `T2`. If the previous deployment split traffic, stop: enumerate every previously active version and apply the barrier to each.
   - Confirm the new version serves **100%**, with no version overrides. Copy the real recorded values into these variables, not the example placeholders:
   ```sh
   export OLD_VERSION_ID='REPLACE_WITH_PREVIOUS_VERSION_UUID'
   export T2='REPLACE_WITH_DEPLOY_TIME_UTC_ISO_ENDING_Z'
   export W_SECONDS=1800
   ```
   - Step 3 may be performed immediately after step 2 while step 2b waits. New ordinary invocations route to the new version: Cloudflare says `wrangler deploy` “immediately deploys it to 100% of traffic in a single step” ([versions and deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)). This does **not** terminate an invocation already on the old version. Resuming is safe for new copies; **step 2b, not resume, gates 00848**.

### Step 2b — old-version publication barrier (required before step 5)

Record the source assessment and both observations in the deploy receipt. **W = 30 min (1800 s), ASSUMED**, not a platform guarantee. Earliest check time is `T2 + W`; extend the observation window as described below after a hit. Do not convert missing logs, listing errors, or an unbounded path into a pass.

**(a) Ownership and platform lifetime assessment**

R2 publication happens **in the Worker, not the Container**: `infra/media-worker/wrangler.jsonc:36–42` assigns the `PLATES` R2 binding to the Worker; `src/index.ts:175–179` delegates only image processing to the Container. In `infra/media-worker/src/plates.ts:499–532`, the Worker itself awaits `PLATES.put` for renditions, original and `crops.json`, after the processor timer is cleared at line 492. No publication deadline or incoming `request.signal` check covers these puts. Container exit therefore does not prove publication has stopped.

Authoritative documentation checked for this procedure (re-check at execution if the platform changes):

| Path | Cited statement | What it does / does not establish |
| --- | --- | --- |
| In-flight HTTP Worker on an old deployed version | [Workers limits — Duration](https://developers.cloudflare.com/workers/platform/limits/): “There is no hard limit on duration for HTTP-triggered Workers.” [Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/): “A deployment determines which version(s) of your Worker are actively serving traffic.” | New traffic changes version; neither statement bounds an already-running old invocation after our deploy. **No authoritative own-deploy bound established.** |
| Client disconnect | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): “When the client disconnects or the response is complete, tasks associated with that request may be canceled.” | “May” is not a guaranteed cancel-by deadline for outstanding R2 puts. |
| `waitUntil` | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): “`waitUntil()` can extend execution for up to 30 seconds after the response is sent or the client disconnects.” | The ingest awaits publication in its handler, not `waitUntil`; this is not a 30 s handler lifetime bound. |
| Cloudflare runtime replacement | [Workers limits — Runtime updates](https://developers.cloudflare.com/workers/platform/limits/): older runtime processes “give existing Workers requests and connections up to 20 minutes to finish.” | This is Cloudflare's runtime-update grace, **not** an established bound for our Worker-version deployment. Do not reuse it as one. |
| Container rollout | [Container rollouts](https://developers.cloudflare.com/containers/platform-details/rollouts/): “The process has up to 15 minutes to exit after `SIGTERM`”; “If the process is still running after 15 minutes, the platform sends `SIGKILL`.” Also: “Deploy success means the rollout started, not that every container instance has finished replacing.” | Grace starts at SIGTERM, not necessarily T2. It bounds Container shutdown, not the Worker's later R2 publication. |
| Edge caller | Local `supabase/functions/client-plate-copy/lib.ts:55–59` has a 30 s ingest timeout and 50 s whole-run hard end; `ingest.ts:23–34` passes the signal to fetch. [Supabase limits](https://supabase.com/docs/guides/functions/limits): maximum worker duration is “the duration an Edge Function worker will stay active”; “Free plan: 150s”, “Paid plans: 400s”; “Request idle timeout: 150s”. | These bound the caller, not remote publication. The docs do not promise remote cancellation on caller termination. |

Because the Worker publication path lacks an authoritative deploy-relative bound, **30 min is a conservative operational assumption**. Both observations below are mandatory but are not proof that a still-pending invocation cannot finish later. If that residual assumption is unacceptable to the release authority, **hold 00848**; no stronger bound is claimed here.

**(b) Observed quiet at or after T2 + W — BOTH required**

1. **Workers observability: zero OLD_VERSION_ID invocations ended in the last W.**
   - Dashboard: **Workers & Pages → patina-media-worker → Observability**, then **Query Builder**. Add AND filters for Worker `patina-media-worker`, invocation events, and the exact `OLD_VERSION_ID` in the version-ID metadata. In the structured event this is normally `$workers.scriptVersion.id`; confirm the actual key/value on a known old-version row first. Do not mistake version tags or deployment IDs for the UUID. If the field is unavailable, the check is unavailable, not green.
   - [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) says “Each Workers invocation returns a single invocation log” and identifies it by `$cloudflare.$metadata.type = "cf-worker-event"`. [Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/) says “Filters have three components: a key, an operator, and a value” and “Adding multiple filters combines them with an AND operator.” Use the event's actual invocation-type key, not a text search of console messages.
   - **Invocation logs arrive at completion, not as a live census of pending handlers.** Cloudflare describes the completion model for [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/): “It captures events after the producer has finished executing.” Applying that model to Workers Logs delivery is an **ASSUMED operational interpretation**, not a guaranteed log-ingestion deadline. Refresh after ingestion has caught up; if completeness/lag cannot be established, hold.
   - Query the **full retained interval containing the old version's invocations**, not only events *started* after T2: an old request may start earlier and finish in the last W. Inspect invocation start plus wall duration/completion metadata to determine the end time. Require zero ends in `[check_time − W, check_time]` (all outcomes, including canceled/error). If end times cannot be determined, conservatively require zero old-version rows across that full interval; otherwise hold, never silently substitute start-time quiet.
   - Verify old-version logging was enabled, invocation logs persisted, and head sampling was 100%, with no account-cap sampling or missing retention. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/): “If `head_sampling_rate` is unspecified, it is configured to a default value of 1 (100%).” The checked config has `observability.enabled: true` at `infra/media-worker/wrangler.jsonc:51`; verify the **deployed old version**, not just this file. Missing/sampled/truncated evidence does not pass. Save version, query filters, time bounds and result in the receipt.
2. **R2 listing: zero legacy-prefix objects uploaded at or after T2.** Wrangler's [R2 commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/) document object `get` (“Fetch an object from an R2 bucket”), `put` and `delete`, but no object-list command. Use the read-only S3 helper from the repo root:
   ```sh
   node scripts/ops/plates-legacy-writes-since.mjs --since "$T2"
   ```
   - Required environment: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (existing R2 S3 credentials, preferably bucket-scoped **Object Read only**). `R2_BUCKET_PLATES` defaults to `patina-plates`; record it in the receipt and do not point this check at staging. The helper uses the existing `services/media` dependency `@aws-sdk/client-s3` (workspace install required); `--help` needs neither dependencies nor credentials. Do not print secrets.
   - The helper paginates **all** `plates/` objects with ListObjectsV2; `LastModified` is the S3 listing equivalent of R2 `uploaded`. It prints keys and plate identities for objects outside `plates/<project>/<sha>/f/<rev>/`, excluding only the sha-level content-addressed `original.<ext>`, whose timestamp is `>= T2` (rounded down to the second to avoid a timestamp precision gap). This includes legacy renditions **and `crops.json`**. The new worker never writes these keys; a hit identifies an old-version write, assuming no other/manual writer.
   - Exit **0** plus `complete:true, hits:0` is required. Exit **1** means hits; **2** means invalid input, missing credentials/dependency, timeout or incomplete listing — not quiet. Keep every offending key. No writes or deletes occur. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/): listing is “Strongly consistent: the list operation will list all objects at that point in time.” A paginated scan is not a lock or a guarantee against a future write.

**If either observation hits before 00848:** do not push. Wait another W and repeat **both** checks. Keep the original T2 audit cutoff and the hit list: the `uploaded >= T2` scan is cumulative, so a real R2 hit will remain a hit even after quiet resumes. **Do not reset T2, delete the evidence, or waive it by waiting.** Escalate persistent hits to the release authority for a new rollout decision; this procedure has no automatic repair or bypass. If either observation is unavailable, hold step 5.

### Continue after the barrier

3. **Resume plate cron 69** if not already resumed immediately after step 2:
   ```sql
   select cron.alter_job(job_id := 69, active := true);
   ```
   New invocations use the stamped/versioned writer; an old invocation already in flight is why step 2b still exists.
4. **client-plate-copy:** no deploy for this change. It passes `crops` through unchanged, and its `originalKey` prefix check accepts the sha-level original.
5. **Migrations 00847–00849**, only after step 2b passes and its assumption is accepted. Deploy client-plate-check first, since 00849 schedules it:
   Paste this as one block. It is fail-closed in bash and zsh, with or without `set -e`, and it never closes your shell. Every command whose failure matters runs in an `||` context, so errexit cannot cut the block short. The block never pushes after a failed function deploy. It always runs the post-check after the push returns, because a failed push may already have applied 00848. A failure of either is reported in `step5_exit`.
   ```sh
   step5_exit=0
   (
     supabase functions deploy client-plate-check \
       || { echo 'STOP: client-plate-check deploy failed; db push NOT run'; exit 1; }
     push_status=0; supabase db push || push_status=$?
     audit_status=0; node scripts/ops/plates-legacy-writes-since.mjs --since "$T2" || audit_status=$?
     echo "push_status=$push_status audit_status=$audit_status"
     if [ "$push_status" -ne 0 ] || [ "$audit_status" -ne 0 ]; then
       echo 'STOP: push or post-check failed; halt the rollout'; exit 1
     fi
   ) || step5_exit=$?
   echo "step5_exit=$step5_exit"
   ```
   - Continue past step 5 only on `step5_exit=0`. A nonzero exit halts the whole rollout: record `supabase migration list` and the post-check output, and escalate. Do not retry the push blindly.
   - The push applies 00847–00849 in **one batch**. Per the orchestrator's SQ-1734 ruling, run the post-check immediately when it returns, before any further operation; no between-migrations stop or manual ledger manipulation. 00849 touches neither Worker. The pre-push barrier, not the post-check, gates 00848.
   - If this post-check hits, list the affected `projectId`/`sha256` plates from its JSON lines and treat it as a **W2 incident**: pause cron 69, preserve keys/timestamps and the deployment/edition identities, and escalate for controlled re-ingest **under the new worker**, with affected frozen editions assessed explicitly. No automatic repair, overwrites or deletion. An audit error also blocks further rollout pending a complete check.

## Why reads need no pause, and why the pause is still here

- **Reads are correct in every mix, without a pause.** The old worker writes only unversioned keys, with no stamp. So an old-worker ingest still in flight at step 1 or 2 produces crops the new client reads at the unversioned key, which is where the old worker wrote them. The new worker's stamped crops reach pages only after step 1, through the new route.
- **W1: stale framing for up to an hour (cosmetic).** Between steps 1 and 2, an old-worker re-crop still overwrites an unversioned key in place, and the crop stays unstamped. The new client's URL no longer changes with focal, so a browser can keep the old framing until `max-age=3600` expires. Step 0 reduces this window; it does not prove absence of late writes.
- **W2: a frozen edition's bytes could change (SQ-1727 F1).** A re-crop leased before close but published by the old worker afterward rewrites bytes the frozen page reads. 00848 keeps the SQL row, not the R2 bytes. Before 00848, this is only Phase 2's existing in-place behavior. Step **2b** is the required observed barrier before introducing freeze, with its residual lifetime assumption stated explicitly.

## Probes after step 5 and its post-check

- A legacy plate URL with no `r` gives 200, unchanged.
- The same URL with a base36 `r` (for example `?r=1k2j3h`) gives 200 and the same bytes, so already-open pages keep their pictures.
- A plate copied after step 3 has `rev` on its crops and gives 200 at `?r=<rev>`.
- A 32-hex `r` that names no object gives 404 with `private, no-store`. Any `r` gives 404 to a non-member.
- `wrangler deployments list` for both Workers: read the bottom row.

## Rollback

- **Client portal:** the old route reads only unversioned keys. After step 3, copies the new worker made exist only under `f/<rev>/`, so they show the silhouette. Roll forward instead where possible.
- **Media worker:** rollback restores overwrite-in-place at the unversioned key (W2); the new client reads its unstamped crops.
  - **The danger after 00848 is the legacy writer once it is live again, not the version being retired.** The new version never writes legacy keys, so there is no barrier to run *before* rolling back. Do not wait for observability silence on the serving version: `/health`, `/enqueue`, composer plate reads and media-jobs traffic keep it busy indefinitely.
  - **Drain the ingest caller before rolling back, while the new writer still serves.** Pausing cron does not stop a client-plate-copy run already in flight. Such a run may still be awaiting source resolution or geometry before it POSTs (`supabase/functions/client-plate-copy/lib.ts:397–403`, `ingest.ts:13–24`). If the legacy writer is serving by then, it overwrites frozen bytes.
    1. Pause cron 69 (`select cron.alter_job(job_id := 69, active := false);`) and forbid manual `begin_client_plate_copy_run`. Record the pause time `TP`.
    2. **Pre-pause cron executions have ended (observed).** A cron tick that fired before the pause runs `dispatch_client_plate_copy` in SQL. It can block on a row lock before it writes its `job_runs` row or enqueues its edge call (`00843_client_plate_assets.sql:674–710`).
       - First confirm `show cron.log_run;` reads `on`. If it is off, `cron.job_run_details` gets no rows, and an empty result proves nothing; hold the rollback.
       - pg_cron leaves `start_time` NULL while a run is `starting`, `connecting` or `sending`, and sets it at `running`. Filter on `runid`, never on `start_time`.
       - Repeat until `live_cron_runs` is `0`. Then record `TD`, the later of `last_end` and `TP`:
       ```sql
       select count(*) filter (where status in ('starting','connecting','sending','running')) as live_cron_runs,
              max(end_time) as last_end
       from (select status, end_time from cron.job_run_details
             where jobid = 69 order by runid desc limit 50) recent;
       ```
    3. **The dispatched edge calls have left the queue.** `invoke_edge_function` enqueues the call through pg_net, and pg_net sends it later. Go on only when this returns `0`:
       ```sql
       select count(*) as queued_copy_calls from net.http_request_queue
       where url like '%/functions/v1/client-plate-copy%';
       ```
    4. Run the Phase 1 quiescence check (`house-issue-phase1-deploy-2026-10.md`, SQ-1631 finish step 3) until it reads `quiescent`. Also run this, and go on only when it returns `0`, which means no request is still leased to a live run:
       ```sql
       select count(*) as live_leases from public.client_plate_requests
       where status = 'leased' and lease_expires_at > now();
       ```
    5. **Every dispatch has a proven completion.** A call that left the queue has finished its HTTP transfer *or* timed out (`timeout_milliseconds` = 60000, `supabase/migrations/00258_edge_settings_vault.sql:78`). A timeout proves nothing: the edge worker may never have started, or it may start later. pg_net's own responses are no proof either, because `net._http_response` keeps them for only 6 h by default. The proof is each run's own row. `dispatch_client_plate_copy()` writes one `job_runs` row per dispatch, carrying `request_id` (`supabase/migrations/00843_client_plate_assets.sql`). Once a call is sent, only the edge function moves that row out of `running`, through `finish_client_plate_copy_run`, and it does so before it answers (`supabase/functions/client-plate-copy/index.ts:129–142`). The dispatcher closes a row itself only on its `not_sent` and `error` branches, where no call survives: a NULL dispatch sends nothing, and the exception rolls back the enqueue. The dispatcher's sweep closes a run that never reported back with the error `no completion reported`. So read every run ever dispatched, with no time window:
       ```sql
       select count(*) filter (where status = 'running'
                                  or error = 'no completion reported') as unproven,
              max(finished_at) as last_finish
       from public.job_runs
       where job_name = 'client-plate-copy';
       ```
       Go on only when `unproven` is `0`. A run that is still `running` may have a worker that has not started yet. A run the sweep closed may have a worker that starts late. Either one holds the rollback. A `claim_failed` exit records its own `failed` finish before it answers (`supabase/functions/client-plate-copy/lib.ts:451–456`). If that finish is not confirmed, the row stays `running` and holds. Fail closed on all of them. On 2026-10-22, all 118 runs since Phase 1 read as edge-finished (`succeeded`, or `failed` with the function's own copy error).
    6. Do not roll back before `max(TD, last_finish, time step 3 first read 0) + 400 s`. 400 s is the Supabase paid-plan maximum edge worker duration cited in step 2b(a). It is a margin for work after a proven finish, not a bound on when a worker that timed out might start; step 5 already holds every such run. If any of steps 2–5 cannot be read, or `unproven` is not `0`, hold the rollback and roll forward instead.
  - Then roll back. Keep cron 69 paused and manual runs forbidden for as long as the legacy writer serves. `/health`, `/enqueue`, composer reads and media-jobs traffic are separate from plate ingest (`infra/media-worker/src/index.ts:159–184`) and may continue.
  - Never resume cron 69 on the legacy writer while 00848 is live. Roll forward to the new writer, record a fresh `T2` and the retiring **legacy** version UUID as `OLD_VERSION_ID`, and pass step 2b against that retired version. Resume cron 69 only after that.
  - Any legacy-prefix write found after freeze is a W2 incident, as in step 5. Rollback plus a short wait is never safe on its own.
- Legacy objects (about 242 copied before this change) are not automatically re-copied, rewritten or deleted. Their rows keep unstamped crops and read at the unversioned key; incident remediation is a separate authorized action.

## Run log — SQ-1599, 2026-10-22

### Preflight (production unchanged)

- GO: ticket comment `c_mvjvbayp_652081`, main **247838af2d930136350aae34b9bd9d1dc9de6e0e**. Confirmed shared checkout `/Users/kody/Code/patina-merged` at that hash; staged paths empty. Both `patina-deploy` and `patina-prod-ops` loaded. The orchestrator transferred sole ownership of portal builds, media deploy, main checkout and Strata CLI to this executor.
- Closeout ruling: leave this note as a working-tree delivery; the orchestrator owns its explicit-pathspec commit and push. Do not interpret the ticket's older commit/submit wording as this executor's closeout authority.
- Read-only R2 feasibility check at **18:30Z**, not the step-2b barrier: existing credentials in `infra/.env` (values never printed), bucket `patina-plates`, `scanned:5502`, `hits:0`, `complete:true`, helper exit 0. No object writes or deletes. A fresh audit using the actual T2 remains mandatory.
- Active media deployment before any change: deployment `eb8e1850-fc12-4fa8-89c3-af9a8c39505d`, version **d1ab1141-7e06-4ae8-997d-cd16167f49ec**, 100%, created **2026-10-22T11:24:19.271Z**. `wrangler deployments list` bottom row and `deployments status --json` agree. Saved old version metadata under the evidence directory below.
- Deployed old-version dashboard settings: Logs enabled, Include Invocation logs checked, Persist logs checked, Logs sampling 100%. A known invocation row has `$metadata.type=cf-worker-event`, `$workers.scriptVersion.id=d1ab1141-7e06-4ae8-997d-cd16167f49ec`, `eventType=alarm`, `entrypoint=MediaProcessor`, `executionModel=durableObject`, `outcome=ok`, `wallTimeMs=180022`, start `timestampNs=1792693896448000000`. Thus durations exist in the dashboard even though the MCP events adapter cannot decode this row. The dashboard also warns that accounts exceeding 20M monthly events without accepting new pricing are sampled; absence of account-cap sampling is **not yet established**. Step 2b is **not passed**.
- Cloudflare MCP upstream defect: events view with the verified service, version and invocation-type AND filters fails output-schema validation at `result.events.events[0].$workers` (`event` and `requestId` expected, undefined). Reproduces with `dry:false`; no error is interpreted as quiet. A `dry:false` count query returns 273 invocation rows in 11:24:19Z–18:30Z; default `dry:true` calculations are not execution evidence. The MCP numeric calculations returned empty/zero output despite the dashboard row's nonzero wall time, so they are not accepted as end-time proof.
- Resource-fit question sent before any mutation: the literal portal script runs Turbo without a concurrency cap and neither portal pins Next's `experimental.cpus`. Requested an approved process-local two-core cap before builds. No cron pause, deploy, migration push, manual edge invocation or rollback has run.
- Evidence directory: `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1599/` (`preflight-r2.txt`, `old-media-version.json`). Free disk at preflight: 63 GiB. Existing instruments cover the R2 audit; no new project tooling or code was added.

### STOP before step 0 — resource-contract contradiction

- The orchestrator ruled that the canonical deploy command must remain unchanged and disallowed a scratch Node preload, CPU shim and RAYON overrides. It offered the whole machine's heavy budget, with builds serialized.
- This launch's higher-priority executor contract nevertheless fixes heavy work at **at most two workers / two cores**. The local machine exposes 14 logical CPUs, `CIRCLE_NODE_TOTAL` is unset, and installed Next 16.2.1 `dist/server/config-shared.js:202` derives its default CPU count from the machine. Its `dist/build/index.js:309–326` uses `experimental.cpus` for build workers; neither portal's config overrides that value. `infra/deploy-portal.sh:563` also invokes Turbo without a concurrency cap. Serializing whole builds does not bound workers within one build.
- No unapproved cap or config change was added, and no build was launched outside the hard budget. Requested corrected resource authority or an approved existing bounded build seam; releasing the deployment claim with this contradiction evidence.
- Steps **0–5, designer deployment, manual nightly link check and all final production probes remain NOT RUN**. Cron 69/70 were not changed. No deployment, migration, function, flag, data, or R2 object was mutated. No background task is owned. No commit/push/submit was made; the orchestrator owns the retained note's commit under the working-tree ruling.
- Pinned manual verifier: **could_not_run**; preflight listing success is not Phase 3 acceptance. No code bodies changed, so complexity/coverage measurement is not applicable. No broad suite was run. Account-cap sampling/ingestion completeness is still unestablished and must be checked before a future step-2b pass; the preflight is not a waiver.

### Final handoff before step 0

- The orchestrator subsequently authorized a scratch process-local Node CPU cap for the two portal builds, but that does not bound the **native Turbo** task launcher. Its documented control is `--concurrency`; the installed `turbo-darwin-arm64@2.8.14` binary has no `TURBO_CONCURRENCY` environment token. No preload, pnpm wrapper, Turbo shim or RAYON override was created or used.
- Final orchestrator decision: **stop before step 0 and release SQ-1599 to todo**. The orchestrator will execute the deployment from main, continuing from this note. The unresolved Turbo/Next worker-budget fit, not an observed production fault or failed rollout, is the release reason.
- R2 preflight passed; old-version observability is reachable through the dashboard alarm row with the version UUID and wall duration; the MCP events schema failure remains reported. Read-only SQL also observed 13 `awaiting_review` editions; the multi-statement MCP returned only its final result, so no other baseline rows are claimed from that call.
- `git diff --check -- docs/ops/house-issue-phase3-deploy-2026-10.md` passed. This note is the only tracked path changed by this launch; it remains uncommitted. All production mutations remain NOT RUN, and no background process or browser tab remains owned after handoff.

### Execution — orchestrator, direct (2026-10-22)

The routed executor released before step 0. Its hard two-worker limit cannot run the canonical `deploy-portal.sh`. The orchestrator then claimed SQ-1599 directly and ran the procedure from the main checkout at **247838af2**, with Kody's in-session authorization. No CPU caps, shims or script changes were used.

- **Pre-ship gate:** `pnpm --filter @patina/client-portal type-check` exit 0; `pnpm --filter @patina/designer-portal type-check` exit 0. Free disk 62 GiB.
- **Step 0:** `cron.alter_job(69, active := false)` at **18:40:46Z**. Quiescence check `quiescent` at 18:40:50Z (0 running). Settle: more than 60 s elapsed before step 1's upload.
- **Step 1:** client portal. Rollback **21329b68-2e80-4231-a206-0f7783ba943c**. The Supabase trio was exported from `apps/client-portal/wrangler.jsonc` in the same shell (anon key masked). `./infra/deploy-portal.sh client` exit 0, `==> Done: client portal deployed to production.` Bottom row: version **d37c2b30-ac81-431c-b67a-1780ea3dffc1**, 100%, created 2026-10-22T18:42:14.868Z.
- **Step 2:** media worker, deployed with the README `DOCKER_CONFIG` workaround and `wrangler deploy` (exit 0). The container image was unchanged ("no changes"). Bottom two rows: previous **d1ab1141-7e06-4ae8-997d-cd16167f49ec** (= `OLD_VERSION_ID`, 100%, no split), new **47e88d03-9d7a-418e-91a3-212f098359b7**, 100%. `T2` = **2026-10-22T18:42:53.576Z**, `W` = 1800 s.
- **Step 3:** `cron.alter_job(69, active := true)` at **18:43:17Z**, immediately after step 2, as the doc allows. Step 2b still gates 00848.
- **Step 2b preparation (read-only):**
  - Workers Observability calculations view (`dry:false`). Filters: `$workers.scriptName = patina-media-worker` AND `$workers.scriptVersion.id = d1ab1141-…` AND `$metadata.type = cf-worker-event`, over 11:20Z–18:55Z. 278 invocation events, max `$workers.wallTimeMs` **360047**. Event types: Container DO `alarm` keep-alives (~180 s), `POST /process`, `POST /plates/ingest`, and plate GETs. The latest old alarm was triggered 18:38:49; with ~180 s wall it ends ~18:41:49. The 18:42:20Z bucket is empty.
  - Account-cap sampling: no sampling key exists in the dataset (keys searched: `sampl|rate|truncat`; only `$workers.truncated` found). Cross-check against ground truth: the old version served copy runs 289459–289490 (11:29–11:37Z), which recorded **25** ingests (7+2+2+2+4+2+2+4). Workers Logs holds **26** old-version `POST /plates/ingest` events. A sampled log would undercount; it does not. Logs are treated as unsampled for this Worker.
  - Rule applied at check time `C`: zero old-version invocations end in `[C − W, C]`. Ends are bounded by the bucket start plus that bucket's max wall time.
- **Step 2b waived by the release authority.** Kody, in session: "keep going, dont wait for the barrier check". The 30-minute `W` window was not waited out. Instant evidence taken in its place, before step 5:
  - zero old-version (`d1ab1141-…`) fetch or ingest events since 11:40Z; the only later old-version events are alarm keep-alives;
  - `node scripts/ops/plates-legacy-writes-since.mjs --since "$T2"` gave `scanned:5502`, `hits:0`, `complete:true`.
  - This is a waiver, not a pass of the barrier as written. The step 5 post-check audit (below) is the remaining guard.
- **Step 5, first run (18:52:06Z):**
  - `supabase functions deploy client-plate-check` succeeded.
  - `supabase db push --yes` failed with `DbPushMissingRemoteError`. The remote ledger row `20260910152111` sorts after the local numbered files, so the CLI refuses without `--include-all`. Nothing was applied.
  - The block's post-check audit ran anyway: `hits:0`, `complete:true`.
- **Step 5, re-run:**
  - A dry run with `--include-all` listed exactly **00847, 00848, 00849** (Phases 1 and 2 used the same flag).
  - Re-ran the block with `supabase db push --include-all --yes`. It applied 00847–00849 between 18:52:38Z and 18:52:45Z.
  - Post-check audit: `hits:0`, `complete:true`. `step5_exit=0`.
- **Functions after step 5:** all `ACTIVE`, all `verify_jwt` true — `client-plate-copy` v3, `client-edition-compose` v1, `client-plate-check` v1.
- **Cron:** all active.
  - 69 `client-plate-copy-dispatch` (`* * * * *`)
  - 70 `client-edition-compose-dispatch` (`* * * * *`)
  - 71 `client-plate-link-check` (`20 3 * * *`)
- **Manual link check** (the nightly job, run once by hand):
  - `public.invoke_edge_function` request **611504** at 18:53:14Z returned HTTP 200.
  - `job_runs` **290417** `client-plate-check` succeeded: checked 2, alive 2, dead 0, errors 0, skipped 1, trigger `invocation`.
  - 2 of 223 `project_ffe_item_images` rows now carry `link_checked_at`.
- **Counts:** `client_plate_assets` 214; `client_editions` 13 `awaiting_review`. No copy or compose runs since cron 69 resumed; the dispatchers log only when work exists.
- **Anonymous plate probes** on `client.patina.cloud/plates/…/piece-768.webp`: HTTP **401** with `cache-control: private, no-store` in all three cases — no `r`, base36 `?r=1k2j3h`, and a 32-hex `r`.
  - **NOT RUN:** the signed-in probes (legacy 200, rev 200, unknown rev 404). They need a client session from Kody.
- **Designer portal:**
  - Rollback **28914e72-dbc7-4728-b1b3-39004f950580**.
  - Trio exported from `apps/designer-portal/wrangler.jsonc` (same shell). `./infra/deploy-portal.sh designer` exit 0.
  - Bottom row: version **83646c8e-f26c-48f4-89ca-1d5700390843**, 100%, created 2026-10-22T18:54:58.375Z.
- **Liveness:** `/api/version` returns 200 on the designer workers.dev host, `app.patina.cloud` and `client.patina.cloud`. Media `/health` 200.
- **Flag:** PostHog `client-edition-page` (982269) is active, one group, rollout **100**, unchanged.

### Final evidence — Phase 3 shipped

| Unit | Live | Rollback |
|---|---|---|
| Strata migrations | 00842–00849 applied (00847–00849 this run, 18:52:38–45Z) | roll forward only |
| Edge functions | `client-plate-copy` v3 · `client-edition-compose` v1 · `client-plate-check` v1 (new) | prior function version |
| Client portal | **d37c2b30-ac81-431c-b67a-1780ea3dffc1** | 21329b68-2e80-4231-a206-0f7783ba943c |
| Media worker | **47e88d03-9d7a-418e-91a3-212f098359b7** | d1ab1141-7e06-4ae8-997d-cd16167f49ec |
| Designer portal | **83646c8e-f26c-48f4-89ca-1d5700390843** | 28914e72-dbc7-4728-b1b3-39004f950580 |
| Cron | 69/70 every minute, 71 nightly 03:20 UTC — all active | `cron.alter_job(…, active := false)` |
| Flag | `client-edition-page` 100% | set rollout to 0 |

**Not verified:** signed-in plate probes, the hero/TTFB probe, prod walks and VoiceOver. Each needs a signed-in client or designer session. `CLIENT_PRIVACY_PAGE_LIVE` stays unset until Kody reads /privacy.

### Follow-up — SQ-1735 media-worker deploy (2026-10-22)

- **Change:** c68673855 — an atomic same-framing manifest union. R2 makes a conditional create, or an ETag-matched update, with at most five retries and then a 503.
- **Review:** SQ-1744 (Astra) READY for the code. Its independent rerun passed 82/82. workerd `r2-bucket.c++` `buildSingleEtagArray` confirms that `etagDoesNotMatch: '*'` is sent as a wildcard.
- **Residuals:**
  - The SQL `crops = EXCLUDED.crops` stale-settle: filed as SQ-1745.
  - The mixed-version rollout clobber: mitigated by the full drain below.
- **Drain** (the rollback section's steps 1–6, not only the step-0 snapshot):
  - Cron 69 paused at TP **19:16:30Z**.
  - `cron.log_run` on; `live_cron_runs` 0 (last end 19:16:00Z); queued copy calls 0; live leases 0; `unproven` 0 (last finish 11:37:20Z). First all-zero read at 19:16:35Z.
  - Waited until 19:23:15Z; re-read all zero at 19:23:25Z.
- **Deploy:** `wrangler deploy` with the README `DOCKER_CONFIG` workaround, from main c68673855. Container image unchanged.
  - Bottom row: version **552d4c8e-84a0-48ee-b40f-366b08700660**, 100%, 19:23:35.930Z. Rollback **47e88d03-9d7a-418e-91a3-212f098359b7**.
  - `/health` 200.
- **Cron 69 resumed** at 19:23:52Z.
