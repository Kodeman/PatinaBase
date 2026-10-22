# The House Issue — Phase 2 production deploy (US-49, SQ-1594)

- Date: 2026-10-22 (UTC), 11:24Z–11:35Z
- Outcome: **Phase 2 deployed and landed.** Steps 1–7 completed in the seq 44/47 order. No stop condition triggered, and nothing was rolled back.
  - Live: media worker `d1ab1141`, seven edge functions, 00844–00846, designer `28914e72`, client `21329b68`, and `/privacy` at 200.
  - First dispatch: 13/13 backfill editions composed in 7 runs with 0 failures, all `awaiting_review`, $0.34.
  - `CLIENT_PRIVACY_PAGE_LIVE` is still unset (OWED: Kody's read of `/privacy`).
- Source: main `f364a5424f3d6d16499f36cd233c40831b9489b0` (GO comment on SQ-1594, 11:20Z).
  - `git rev-parse HEAD` of the main checkout `/Users/kody/Code/patina-merged` = the GO SHA, on branch `main`.
  - Every prod CLI ran from that checkout with the sandbox off. Its deploy sources (`supabase/functions`, `supabase/migrations`, `infra/media-worker`, `apps/{client,designer}-portal`, `packages`, `infra/deploy-portal.sh`, lockfile) are byte-identical to a clean worktree at the same SHA (`diff -rq`). The only extras are untracked build artifacts (`.swc`, `public/sw.js`, workbox, `.DS_Store`, `.claude/`) and the env files below.
- Preconditions:
  - SQ-1717 done, combined gate green on `4ee6e50ae` (disposition `9c0e4cdbb`, `docs/ops/house-issue-phase2-gate-2026-10.md`).
  - SQ-1631 done (Phase 1 finish, `f364a5424`).
  - GO comment names `f364a5424`.
- Authorization: Kody authorized the full US-49 production chain in session (ticket description; GO comment).
- Order: story log seq 44/47/71, as the ticket describes: media-worker → edge functions → migrations → designer portal → client portal → dispatch watch.
- `CLIENT_PRIVACY_PAGE_LIVE`: **not set** (absent from `supabase secrets list`), by the GO comment and seq 44/71. It waits on Kody's read of `/privacy`.
- Retired Coolify box: not touched.
- Raw logs and probe output: `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1594/`.

## 1. Media worker (plate-read route)

- Live before: `e49a8043` (built from `76ffeaa3a`, no plate-read route). Changed since: `container/Dockerfile`, `src/plates.ts` (the `GET /plates/{projectId}/{sha256}/piece-{512|768}.webp` route, SQ-1714 lineage).
- `cd infra/media-worker && DOCKER_CONFIG=<minimal config without credsStore> CLOUDFLARE_ACCOUNT_ID=… npx wrangler deploy` (README workaround), 11:24:16Z–11:24:57Z, exit 0.
  - Bindings include `env.PLATES (patina-plates) R2 Bucket` and `env.SUPABASE_STORAGE_ORIGIN ("https://bkvcixdmuyejfzcijpdg.supabase...")`.
  - `SUCCESS Modified application patina-media-worker-mediaprocessor (Application ID: a03e87b7-1e9c-4d7e-9e55-9174e6a974ce)`.
  - `Current Version ID: d1ab1141-7e06-4ae8-997d-cd16167f49ec`.
- `npx wrangler deployments list` (oldest first, last two):
  - 2026-10-22T02:58:32Z Upload `e49a8043-e3e6-4d46-9671-86add434db99` (previous, **rollback**)
  - **2026-10-22T11:24:19Z Upload `d1ab1141-7e06-4ae8-997d-cd16167f49ec` (bottom row)**
- Probes (unauthenticated, `https://patina-media-worker.kody-be3.workers.dev`):

| Request | Result |
|---|---|
| `GET /plates/<uuid zeros>/<64 zeros>/piece-512.webp`, no bearer | **401** |
| same, `Authorization: Bearer wrong` | **401** |
| `GET …/wide-1280.avif` (not an allowlisted read file), no bearer | 401 (bearer is checked before the path) |
| `POST /plates/ingest`, no bearer | 401 |

  - The old build answered any `GET /plates/…` with 404, so the 401 shows that the route is live.
- Cron 69 was NOT paused across the roll (optional per GO). The queue was drained (242 done, 3 failed, 0 queued) before and after, so the roll had nothing to claim. No plate `job_runs` row was written between 11:05Z and 11:25Z.

## 2. Edge functions

- `supabase secrets list` (names only, 53 names): `ANTHROPIC_API_KEY` **present**; `MEDIA_WORKER_URL`, `PLATE_INGEST_SECRET` present; `CLIENT_PRIVACY_PAGE_LIVE` **absent** (not set, by instruction).
- Importers of `_shared/claude.ts` / `_shared/claude-models.ts`, re-derived with `grep` at the GO SHA: `client-edition-compose`, `aesthete-dna-draft`, `board-deck-import-resolve`, `companion-message`, `project-ffe-document-extract`, and `sms-inbound` (through `sms-inbound/pipeline.ts` → `_shared/field-parse.ts`). That makes six entrypoints, matching seq 57/65. `_shared/hours-judgment.ts` mentions field-parse only in a comment.
- `supabase functions deploy <fn> --project-ref bkvcixdmuyejfzcijpdg`, 11:25:40Z–11:26:00Z. Each one ended `"message":"Deployed Functions."`, exit 0. `sms-inbound` was deployed with `--no-verify-jwt` (config.toml `verify_jwt = false`).
- `supabase functions list`, before → after:

| Function | Before | After (id, verify_jwt, updated) |
|---|---|---|
| client-edition-compose | absent | **v1** b80d15d4-f4ea-4752-a63a-cc0cfd4696be, jwt true, 11:25:42Z |
| aesthete-dna-draft | v42 | **v43**, jwt true, 11:25:45Z |
| board-deck-import-resolve | v6 | **v7**, jwt true, 11:25:48Z |
| companion-message | v41 | **v42**, jwt true, 11:25:51Z |
| project-ffe-document-extract | v16 | **v17**, jwt true, 11:25:54Z |
| client-plate-copy | v2 (built from `76ffeaa3a`) | **v3**, jwt true, 11:25:56Z (now carries SQ-1643/1655/1679) |
| sms-inbound | v40 | **v41**, jwt **false**, 11:26:00Z |

- Probe: `POST /functions/v1/client-edition-compose` with no auth → 401.

## 3. Migrations 00844–00846

- Before: `supabase migration list` pending exactly `00844`, `00845`, `00846`; no remote-only rows. `db push --include-all --dry-run` listed exactly those three files. `--include-all` is needed because remote `20260910152111` sorts after the local files, as in Phase 1.
- `supabase db push --include-all --yes`, 11:26:33Z–11:26:36Z: "Applying migration 00844_client_editions.sql… 00845_client_edition_rpcs.sql… 00846_client_edition_reader.sql… Finished supabase db push." exit 0.
- After, `supabase migration list` tail: `00843|00843`, `00844|00844`, `00845|00845`, `00846|00846`, `20260910152111|20260910152111`; 0 pending, 0 remote-only.
- Read-only SQL (11:26:46Z):

| Check | Expected | Observed |
|---|---|---|
| `llm_feature_controls` `client-edition-compose` | enabled, daily_cap_usd 5 | `{"enabled":true,"daily_cap_usd":5}` (no row existed before) |
| `client_edition_requests` backfill | one per project holding a plate | **13** `backfill` rows, `queued`, available 11:26:35Z. Pre-push `count(distinct project_id) from client_plate_assets` = 13 |
| `cron.job` edition dispatcher | new every-minute job | jobid **70** `client-edition-compose-dispatch`, `* * * * *`, `SELECT public.dispatch_client_edition_compose();`, active |

- Deviation: none.

## 4. Designer portal

- Wrapper (scratchpad, not committed) exported `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` from `apps/designer-portal/wrangler.jsonc` `vars` in the same shell. It then ran `./infra/deploy-portal.sh designer` from the main checkout, 11:27:19Z–11:28:59Z, exit 0.
  - Preflight: all three trio sources `exported`. URL `https://bkvcixdmuyejfzcijpdg.supabase.co`, storage key `sb-bkvcixdmuyejfzcijpdg-auth-token`. 8 wrangler `NEXT_PUBLIC_*` exported in Phase 0b.
  - Chunk gate: 302 client chunks, PostHog key literal in 22. `handler.mjs` 20,016,794 bytes.
  - "Uploaded 48 files (295 already uploaded)". `Current Version ID: 28914e72-dbc7-4728-b1b3-39004f950580`. Ends "==> Done: designer portal deployed to production."
- `npx wrangler deployments list --name patina-designer-portal`:
  - 2026-10-21T10:38:12Z `2acd3cf7-2ee3-4424-87d4-f1b5be65c53c` (previous, **rollback**)
  - **2026-10-22T11:28:57Z `28914e72-dbc7-4728-b1b3-39004f950580` (bottom row)**
- `https://app.patina.cloud/api/version` → 200 (liveness only).
- Pre-ship type-check: covered by the SQ-1717 combined gate on `4ee6e50ae`, which ran both portals' type-check. Since then, main gained docs plus a test-only mock (`caa60928c`); no portal source changed.

## 5. Client portal

- Same wrapper with `apps/client-portal/wrangler.jsonc`: `./infra/deploy-portal.sh client`, 11:29:22Z–11:30:39Z, exit 0.
  - Preflight trio `exported`, same URL and storage key. 15 `NEXT_PUBLIC_*` exported in Phase 0b.
  - Chunk gate: 69 client chunks, PostHog key literal in 1.
  - Bindings include `env.PLATES (patina-plates) R2 Bucket`. `Current Version ID: 21329b68-2e80-4231-a206-0f7783ba943c`.
- `npx wrangler deployments list --name patina-client-portal`:
  - 2026-10-22T01:03:17Z `0a2eec5e-ca71-46fd-a3b7-a049bd73ce4f` (previous, **rollback**)
  - **2026-10-22T11:30:36Z `21329b68-2e80-4231-a206-0f7783ba943c` (bottom row)**
- Probes (signed out, curl):

| Request | Before (11:29Z, `0a2eec5e`) | After (11:31Z, `21329b68`) |
|---|---|---|
| `GET https://client.patina.cloud/privacy` | 307 (sign-in redirect) | **200**, `text/html`, 17,749 B, `<title>Privacy · Patina</title>`, `<h1>Privacy`, names Anthropic |
| `curl -I …/plates/00000000-0000-0000-0000-000000000000/<64 zeros>/wide-1280.avif` | 401 | **401**, `cache-control: private, no-store`, no `location` |
| `/api/version` | n/a | 200 |

- `/privacy` is now live in prod. `CLIENT_PRIVACY_PAGE_LIVE` was still **not** set: the GO comment and seq 44/71 hold it until Kody's read of `/privacy` is recorded on the board.

## 6. First dispatch watch (read-only SQL, 11:26Z–11:35Z)

- The cron (jobid 70) first fired at 11:27:00Z, about 25 s after the push. The 13 backfill requests drained in 7 runs by 11:33:30Z, within 7 minutes and well inside the 35-minute window.

| job_runs id | Window (UTC) | Claimed | Composed | Failed | Unsettled | USD |
|---|---|---|---|---|---|---|
| 289454 | 11:27:00–11:27:47 | 3 | 3 | 0 | 0 | 0.047190 |
| 289456 | 11:28:00–11:29:11 | 2 | 2 | 0 | 0 | 0.079863 |
| 289458 | 11:29:00–11:29:38 | 2 | 2 | 0 | 0 | 0.035524 |
| 289462 | 11:30:00–11:30:53 | 1 | 1 | 0 | 0 | 0.079046 |
| 289472 | 11:31:00–11:31:53 | 2 | 2 | 0 | 0 | 0.054259 |
| 289475 | 11:32:00–11:33:17 | 2 | 2 | 0 | 0 | 0.030804 |
| 289478 | 11:33:00–11:33:30 | 1 | 1 | 0 | 0 | 0.009460 |

- Every run `succeeded`, 0 failed runs, `error` null on all. Per-request outcomes: 13 × `composed`. `client_edition_requests`: 13 `done`, 0 queued.
- `client_editions` at 11:34:48Z: **13 `awaiting_review`, kind `full`, `auto_published` false**. 0 approved, 0 auto-published, 0 `plates_only`, 0 failed. Model `claude-sonnet-5-5`, prompt `e1`. Edition `cost_usd` total is $0.336146. The admin page's "Today" for the feature read $0.4344 at about 11:32Z, from settled `llm_usage` rows (40 at 11:33Z). The two figures were not reconciled here: the editions sum and the ledger sum differ by about $0.10. Candidate follow-up: check whether some calls (perception, judge) are not attributed to `client_editions.cost_usd`. That is V22 draft-first, as expected: no prior approved edition exists, so C3 plates-only never applied.
- Function edge logs 11:25–11:40Z for `client-edition-compose`: 200 × 4 sampled, 401 × 1 (my own unauthenticated probe).
- Heroes: 4 editions have a hero (3 maker, 1 board plate). `client_edition_images` holds those 4 `hero` rows only. 9 editions open on the drawn cover (`hero: null`).

**Photograph-of-home inputs with `CLIENT_PRIVACY_PAGE_LIVE` unset, as observed:**

- Scans exist on one project only, `b8b20d16-29d1-460b-b42a-37e085d2d96d`: 21 `scan` plates, all ingested in Phase 1. No `installed` plates exist yet (Phase 3).
- **No scan was perceived.** `client_plate_assets` `source_kind='scan'` with `perceived_prompt_version` set = 0 of 21. Perceived assets overall: 25, all `maker` (`e1`). The one `board` plate was not perceived either, per the composer's never-sheet/board rule.
- **No scan was placed.** 0 `client_edition_images` rows of kind scan. The `b8b20d16` edition (`78ebfc2b-…`, seq 1, $0.012464) has `hero: null` and `held: []`. Its notice reads "This is the first page we have drawn for you. It opens on the cover, and the Living is the room on it."
- **Why, as observed:** the scans never reached the composer at all. Its facts (`get_project_editorial_facts`, the homeowner envelope `_build_project_editorial`) carry **0 assets** for `b8b20d16`, and its one room has an empty `scanAssetIds`. The composer's own privacy gate (`kindSendable`: scan/installed only when `privacyLive`) was therefore not exercised in prod. The scans were excluded upstream, by the reader.
- Wider observation (informational, not a deploy blocker):
  - 9 of 13 editions have 0 assets in their facts, although every project holds 1–31 ingested plates.
  - The envelope lists 0 items for those projects, and 0 rooms for 2 of them.
  - This is the Phase 1 reader's selection, the same envelope the homeowner page reads. It is not composer behaviour.
  - When `CLIENT_PRIVACY_PAGE_LIVE` is set, scans will still not reach the model until the envelope links `b8b20d16`'s scans to its room. Whether that is intended belongs to the reader's owner.

## 7. Admin model-usage page

- An admin session was available in Chrome (signed in as kody@middlewest.studio). `https://admin.patina.cloud/model-usage` → Features table row **`client-edition-compose`**: Enabled on, Daily cap (USD) **5**, Studio monthly cap "No cap", Today **$0.4344**, This month $0.4344. Read only; nothing clicked or saved.
- Screenshot: `verification/SQ-1594/13-admin-model-usage-row.png`.
- Same page: Kill switch "OFF — calls allowed"; global daily cap 25; per-studio monthly cap 50.

## 8. Flags and plate cron

- PostHog `client-edition-page` (982269): untouched, stays at 100.
- Plate cron 69 `client-plate-copy-dispatch`: untouched, active (as SQ-1631 left it).
- `CLIENT_PRIVACY_PAGE_LIVE`: untouched, unset.
- Nothing flipped.

## Env-file note (pre-existing deviation, informational)

- The main checkout carries developer `apps/{client,designer}-portal/.env` and `.env.local` (April and August).
- `deploy-portal.sh` Phase 0b exports only the `NEXT_PUBLIC_*` names declared in `wrangler.jsonc`, so `next build` still inlines the other `NEXT_PUBLIC_*` names from `.env`. Examples: client `NEXT_PUBLIC_API_URL=http://client.localhost/api` and `NEXT_PUBLIC_WS_URL=http://api.localhost/projects`; designer `NEXT_PUBLIC_ENABLE_DEBUG=true` and `NEXT_PUBLIC_API_URL=http://designer.localhost/api`.
- Every earlier main-checkout portal deploy carried the same values, so this is not new with this deploy. Phase 1 deployed the client portal from a clean worktree, which had no `.env` files.
- The Supabase trio was exported explicitly and won (`exported` in preflight).
- Whether any shipped code still reads those legacy names was not audited here. That audit is a candidate follow-up, not a deploy blocker.

## Rollback (recorded, not run)

- Composition kill switch, which leaves approved editions rendering: `UPDATE llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';`
- Pause the dispatcher: `select cron.alter_job(job_id := 70, active := false);` (jobid 70, `client-edition-compose-dispatch`).
- Designer portal: `cd apps/designer-portal && npx wrangler rollback 2acd3cf7-2ee3-4424-87d4-f1b5be65c53c`.
- Client portal: `cd apps/client-portal && npx wrangler rollback 0a2eec5e-ca71-46fd-a3b7-a049bd73ce4f`. This also takes `/privacy` back to 307.
- Media worker: `cd infra/media-worker && npx wrangler rollback e49a8043-e3e6-4d46-9671-86add434db99`. The compose function's plate reads then 404, so perception degrades and composition does not stop.
- Edge functions: redeploy from the previous main SHA.
  - `client-plate-copy` v2 came from `76ffeaa3a`.
  - The five claude importers came from their 2026-10-13/16 builds.
  - `client-edition-compose` is new: disable it with the kill switch, or `supabase functions delete`.
- Migrations 00844–00846 are append-only and roll forward. The kill switch plus the cron pause stop all new composition.

## OWED

- **Kody: read `/privacy`** (live at `https://client.patina.cloud/privacy` since 11:30Z) and record the read on the board. Only after that: `supabase secrets set CLIENT_PRIVACY_PAGE_LIVE=true` (seq 44/71, V2-5). The ticket's pinned verifier lists "CLIENT_PRIVACY_PAGE_LIVE set after that", which is therefore **not met by design** in this deploy. The GO comment holds it.
- **Kody / Leah: 13 editions await studio review** in the designer Press band. Nothing reaches a homeowner until Approve. Signed-in designer walk of the Press band (Approve / Hold / Undo, focal frames, makers switch) not done here.
- Signed-in homeowner walk on an approved edition (edition reader, notice, hero preload) is not possible until a studio approves one. The Phase 1 OWED items (hero-present server HTML, TTFB, scan-plate 200 for a `b8b20d16` member, the 3 maker sources) carry over.
- Reader scope question (above): `b8b20d16`'s 21 scans are absent from the editorial envelope, and 9 of 13 projects have no assets in it. That needs an owner decision before the privacy flip can mean anything for scans.
- seq 54/55 follow-up SQ-1678 (forward migration 00847, consumed-request requeue) remains post-deploy.
- Map refresh: none needed (docs only).
