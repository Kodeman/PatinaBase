# The Rendered Room v2 — W3/W4 consolidated staging evidence & prod-readiness

> **Status:** staging evidence · consolidated · prod-authorization input · **Date:** 2026-08-19
> **Wave:** W3 (originals-cutover machinery) + W4 (hardening & production package)
> **Companions:** `W1-EVIDENCE.md`, `W2-EVIDENCE.md`, `DELIVERY-PLAN.md`, `ARCHITECTURE.md`, `PROPOSAL.md`
> **Format:** follows `docs/engineering/patina-cloudflare-phase-1-staging-evidence.md`

This is the consolidated evidence package the delivery plan's **W4 exit** calls
for: "an evidence document in the staging-evidence format … reviewed by Kody as
the prod-authorization input." It records what is deployed and applied (each
claim carries a probe run **today**, 2026-08-19, with its actual result), the
end-to-end proofs W1 and W2 already captured (with their artifact ids so they
stay auditable), the security posture, an **honest open-items ledger** — the
section that matters most for a go/no-go — and a prod-wave readiness assessment.

Everything here ran against **staging only** — Supabase project
`vuesoyhfrjabfxbrzekd` (a persistent, data-less branch of Strata) and Modal
environment `patina-staging`. The production Supabase ref
`bkvcixdmuyejfzcijpdg` was **never** touched: no read of it, no write, no
migration. The only production surface probed at all was the **public,
unauthenticated** `https://api.patina.cloud/*` HTTP edge — read-only, to record
that the scan surface is closed there (§1.4). No deploys, no migrations, no
mutations of any kind were performed by this pass; it is a writing-and-
verification lane.

**Headline.**

| | Where it stands |
|---|---|
| **W2 read path (mesh · splat · renders through `/v1/scan/*`)** | **shipped and drawn on staging** — re-verified at rest today |
| **W3 originals cutover** | **machinery BUILT, DORMANT — the cutover has NOT run.** Zero shadow corpus exists (§1.1, §4.2) |
| **W4 hardening (00501 quota+reaper, R2 checksum enforcement, RLS negatives)** | **applied and probe-proven** on staging |
| **Splat reconstruction quality** | **NOT designer-grade** — the frontier gap (§4.1) |
| **Budget-cap _halt_** | cap **SET** ($42.50), a halt **NOT demonstrated** (§4.5, §5) |
| **Production** | scan/upload surface **closed and verified off** on the live prod edge worker (§1.4) |

---

## 1. What is deployed / applied — verified live today

### 1.1 Staging database — migrations and the scan surface

**Ledger tail** (`supabase_migrations.schema_migrations`, staging,
2026-08-19):

```
00489 00490 00491 00492 00493 00498 00499 00500 00501 00510
```

The `00494`–`00497` gap is expected — those numbers have no files on `main`
(reserved for the sibling Phase-2 program; `migration-number-reservations.md`).
`00485`/`00493`/`00510` are prod-parity catch-ups applied 2026-08-19
(`strata-staging.md`). **00501 is Rendered Room v2's last number in the
reserved 00498–00502 band.**

Mapping to this program's waves: **00489** media-registry kernel · **00490**
`scan_worker` roles · **00491** dispatch cron · **00492** room-file version
monotonicity · **00498** upload intent + scan-version lock · **00499** upload
interface hardening · **00500** upload-kind split · **00501** upload-intent
quota + stale-intent reaper (W4, closes security-review finding 11).

**Scan-surface objects exist** (`to_regclass` / `pg_proc`, staging, today):

| Object | Result |
|---|---|
| `public.media_objects` (table) | present |
| `public.scan_pipeline_events` (table) | present |
| `scan_worker_*` RPCs | `append_event`, `complete_task`, `fail_task`, `update_room_file` — 4, present |
| upload-intent RPCs | `create_media_upload_intent`, `confirm_media_upload`, `register_media_object`, `mark_media_object_state`, `is_originals_bucket`, `caller_can_access_room_scan` — present |
| quota / reaper | `expire_stale_upload_intents(interval)` present; `public.expired_upload_originals` (seam view) present |

**Two pg_cron jobs, both `active`** (`cron.job`, today):

| jobid | jobname | schedule |
|---|---|---|
| 49 | `dispatch-scan-modal-sweep` | `*/5 * * * *` |
| 50 | `expire-stale-upload-intents-daily` | `15 7 * * *` |

### 1.2 Modal `patina-scan` app

`modal app list --env patina-staging` (today): one app, **`patina-scan`**
(`ap-zLm5zIIytE9TgWWkipevm8`), state **`deployed`**, 0 running tasks.
`modal app history patina-scan --env patina-staging` shows **v1 → v12**; the
resting deploy is **v12** (2026-08-19 03:36 CDT), the deploy that carried the
best-checkpoint export and SPZ-v3 encoder proven in `W2-EVIDENCE.md` §14. No
`patina-production` Modal environment exists (verified by its absence from the
workspace; W1/W2 record the same). Functions: `verify` (CPU), `splat` (L4),
`renders` (L40S), `spawn` (web).

### 1.3 Edge worker — staging (`patina-edge-api-staging`)

Committed `infra/edge-api-worker/wrangler.jsonc` `env.staging`:
`SCAN_ROUTES=on`, `MEDIA_UPLOADS=off`. Both probed live today against
`https://patina-edge-api-staging.kody-be3.workers.dev`:

| Probe | Expected | Observed |
|---|---|---|
| `GET /v1/scan/room-files/5bc4cef2-…/artifacts/splat` (no JWT) | 401 (route on, needs auth) | **HTTP 401** `{"error":"unauthorized"}` |
| `POST /v1/media/uploads` | 404 (uploads off → unrouted) | **HTTP 404** `{"error":"not_found"}` |

The scan route returning **401 rather than 503** is itself evidence: `env.ts`
boots the worker 503 (`edge_api_configuration_invalid`) if `SCAN_ROUTES=on`
without `SCAN_R2_ACCESS_KEY_ID`/`SCAN_R2_SECRET_ACCESS_KEY`. A clean 401 means
the **staging read-token secrets are present** and the read path is live — the
same read path that served splat bytes in `W2-EVIDENCE.md` §14.5.
`MEDIA_UPLOADS=off` needs no write secrets to rest (the path is simply
unrouted), which is why the upload route is a plain 404, not a 503.

### 1.4 Edge worker — production, and the worker-intercept correction

**A correction to record.** MEMORY (2026-08-17) held that
`api.patina.cloud` CNAMEs **directly** to `bkvcixdmuyejfzcijpdg.supabase.co`
(Kong retired), and the Phase-1 staging-evidence doc (§9) said "no route is
attached in any env." **Both are now stale.** The production edge worker
`patina-edge-api` is **live and fronting `api.patina.cloud`** — promoted to the
Phase-1 target (catalog on Hyperdrive/100). Probed live today:

| `https://api.patina.cloud/…` | Observed | What it proves |
|---|---|---|
| `GET /v1/catalog/products?ids=cf13…0001` | **200**, `x-patina-trace-id` present, `cache-control: public, max-age=60, swr=15`, `etag` = SHA-256 of `[]` (the id is a negative control) | the **worker** is answering (its own trace-id + cache shape), served from Hyperdrive |
| `GET /auth/v1/health` | **401**, `x-patina-trace-id` present | proxy passthrough through the worker |
| `GET /v1/scan/room-files/5bc4cef2-…/artifacts/splat` | **404** `{"error":"not_found"}`, `x-patina-trace-id`, `cache-control: private, no-store` | **scan surface closed on prod** (`SCAN_ROUTES=off`) |
| `POST /v1/media/uploads` | **404** | **upload surface closed on prod** (`MEDIA_UPLOADS=off`) |

`wrangler deployments list --env production` shows `patina-edge-api` deployed by
`kody@thesaunabuild.com`, newest version **`98a5d100`** (2026-08-19T03:39:54Z,
a Secret Change) atop deploys from 2026-08-18. The committed prod `vars` block
asserts `SCAN_ROUTES="off"` and `MEDIA_UPLOADS="off"`, and
`scripts/validate-config.mjs` **asserts the `off` literal for production** so a
routine redeploy cannot carry a write capability against a prod bucket in by
accident. See §3.3 for the defense-in-depth (R-1) reading of this.

### 1.5 Secrets, tokens, buckets

- **`scan-r2` Modal secret** — proven a full R2 PUT→GET→DELETE round trip on
  `patina-staging-media-artifacts-us` (`W2-EVIDENCE.md` §1, `rw_ok: true`); it
  wrote every artifact this program produced.
- **Read token** (`SCAN_R2_ACCESS_KEY_ID`/`_SECRET`, Wrangler secrets) — present
  on staging, inferred from §1.3's clean 401 boot and demonstrated by the
  capability URLs that served splat/render bytes (`W2-EVIDENCE.md` §9.4, §14.5).
  Object-Read-only, scoped to the artifacts bucket (`OPERATIONS.md`).
- **Write token** (`SCAN_R2_WRITE_ACCESS_KEY_ID`/`_SECRET`) — **PENDING, does not
  exist.** A separate token, Object-Read-&-Write scoped to the originals bucket
  only. Its absence is why `MEDIA_UPLOADS` cannot be turned on. **Kody-gated
  Cloudflare-dashboard mint** (§4.3).
- **Staging R2 buckets** — `patina-staging-media-artifacts-us` (derived
  artifacts, in use) and `patina-staging-media-originals-us` (originals target
  for the dormant upload path; the R2 checksum probe in §3.2 ran against it).

---

## 2. The end-to-end proofs already captured (consolidated, re-probed today)

W1 and W2 are the substance; this section makes them auditable in one place and
re-verifies what is cheaply re-verifiable on staging **today**. Anything not
re-verified is marked.

### 2.1 `verify` accuracy lane (W1)

- **E2E on staging, PROVEN.** Task `abad722d-…` → `done`, two ledger rows
  (`started`/`completed`), wall clock **6 944 ms** including cold start
  (`W1-EVIDENCE.md` §3). Written over the `scan_worker` role, never
  `service_role`.
- **Exact deltas.** The 1.01-scaled synthetic room produced `delta_mm` +40.0 /
  +30.0 and `offset_mm` +15.0 / +20.0 — every number derivable from the 1%
  scale, length-vs-offset paired correctly (`W1-EVIDENCE.md` §4).
- **Determinism, PASS.** Two independent Modal runs over the same bundle →
  **byte-identical** verify documents,
  `md5 = 22fc7adab35c274e5bd4b3bf63ef5a06` both (`W1-EVIDENCE.md` §5).

### 2.2 `splat` (W2) — the real run, and the artifact still at rest today

- **Real posed photos → SPZ**, 42 frames, 30k-then-**12k** iterations after the
  budget was made queue-reachable; final resting artifact exported from **step
  2 000**, **499 005** Gaussians, **8 767 038 B** SPZ-v3+gzip
  (`W2-EVIDENCE.md` §14.4–§14.5). First real run was 64.1 min at 30k; the
  best-checkpoint + 12k default cut it to **24.9 min** on L4.
- **Re-probed today (registry at rest):** `media_objects`
  `a9b6cbb8-4d32-4967-a23d-7b4c50174657`, `lifecycle_state=stored`,
  **8 767 038 B**, sha256
  `de4228a58cd891a6610ce50475d14f9462feb04c2db786df320cfb2d1f3f9f4a`,
  `access_class=authenticated_project` — **byte-for-byte the row `W2-EVIDENCE.md`
  §14.5 recorded.** `room_files` `5bc4cef2-…` v1 still references it
  (`artifacts.splat.object_id = a9b6cbb8-…`).
- **Capability URL over the wire:** proven in `W2-EVIDENCE.md` §14.5 — the edge
  worker minted a 200 on a **user** JWT (never `service_role`), the presigned R2
  GET returned **8 767 038 bytes**, and the sha256 of what the client received
  equalled the registry digest. **NOT re-run this pass:** minting a fresh user
  JWT requires a GoTrue password reset of the seed account (a staging mutation),
  which is outside this pass's read-only rails. The at-rest registry match above
  is what today's probe re-confirms; the over-the-wire leg rests on §14.5.

### 2.3 `renders` (W2) — 29 shots, interior

- **29 frames**, L40S/Cycles, after the RoomFrame + USDZ→GLB converter fixes:
  interior corners, an evenly-exposed top-down plan plate, a turntable that
  reads as a kitchen (`W2-EVIDENCE.md` §13.5 cycle 4, all PASS).
- **Re-probed today:** `room_files` `5bc4cef2-…` v1
  `artifacts.renders.count = 29`, cover `object_id`
  `7ca139c2-adb7-4177-b9f6-26331244b548`. Register-by-key stayed idempotent
  across five render sets — **29 rows, 29 ids, not 145** (`W2-EVIDENCE.md` §13.5).

### 2.4 The portal walk

Staging designer portal, signed in as the seed identity that owns the scan:
**MESH renders, SPLAT draws and orbits, render gallery shows** — first paint
within seconds, console clean, no CSP violations (`W2-EVIDENCE.md` §14.5, with
screenshots under `w2-splat-walk/`). The reconstruction *quality* verdict from
that same walk is in §4.1.

### 2.5 IFC export

IFC4 export landed in W2 (`e82271d4`), alongside SVG/PDF/DXF, deterministic
output — the fourth `drawings` serializer on the CPU box, storage-agnostic.

---

## 3. Security posture

### 3.1 Dual-RLS + equivalence-gated mirror

The read and upload paths add **no authorization of their own**; the caller's
own RLS decides, **twice**, and the two are held equivalent by a test rather
than by trust:

1. The route verifies the Supabase JWT, then reads `room_scans` under
   `SET LOCAL ROLE authenticated` on the uncached `DB_FRESH` binding — the real
   policies decide visibility.
2. It then calls a `SECURITY DEFINER` RPC that binds the caller **again** via
   `caller_can_access_room_scan` (a definer body cannot re-run the caller's RLS,
   so the check is repeated inside it).

The mirror is **gated by an equivalence assertion** in
`supabase/tests/scan_pipeline/scan_roles_conformance_test.sql`, not assumed.
Verified live today: `public.media_objects` carries exactly one SELECT policy,
`media_objects_select`, **`TO authenticated`**, with qual
`scan_id IS NOT NULL AND EXISTS (SELECT 1 FROM room_scans rs WHERE rs.id =
media_objects.scan_id)` — i.e. `media_objects` visibility **delegates to
`room_scans`' own RLS**, mirroring `room_files`' 00341 delegation.

Every negative — missing/invalid/other-tenant scan, unknown upload id, no
artifact of that kind, a Room File the caller cannot see — collapses to an
identical **404** (401 only for missing/invalid JWT). A 403 would confirm a row
exists; that is the mood-board bug class this program gates against, and the
404-before / 200-after probes in `W2-EVIDENCE.md` §9.4 and §14.5 are its
positive proof.

### 3.2 R2 checksum enforcement — probe-proven (W3-A)

That `x-amz-checksum-sha256` is *signed* into the presigned PUT was always
readable from `src/r2.ts`; whether **R2 verifies the body against it** was
asserted-in-prose by 00498 and simultaneously hedged in code. Measured
2026-08-19 from Modal on the `scan-r2` credential against
`patina-staging-media-originals-us`, reproducing `src/r2.ts`'s canonical request
exactly (`OPERATIONS.md`, "What the R2 probe established"):

| Probe | Observed |
|---|---|
| Correct bytes + correct signed checksum | **200**, object created, checksum echoed |
| **Wrong bytes**, same signed checksum, same `content-length` | **400 `BadDigest`** — the object was **never created** (follow-up HEAD → 404) |
| `HEAD` with `x-amz-checksum-mode: ENABLED` | 200 carrying `x-amz-checksum-sha256` |
| A checksum header value other than the signed one | 403 `SignatureDoesNotMatch` |

Two consequences landed in **00499**: `declaredSha256` is a **promise**, not a
label (R2 refuses a mismatched body before storing); and because a genuinely
PUT object always HEADs with a checksum, a confirm carrying **no** observed
checksum is evidence the bytes did not arrive that way — both the Worker
(`assertObservedMatchesDeclared`) and the RPC (`confirm_media_upload`) now
**fail closed** on it, and the weaker `sha256_verified_by = 'put_condition'`
was retired (only `r2_head` remains).

### 3.3 R-1 — the scan surface is NOT exposed on production (defense in depth)

R-1 is the review finding that the Phase-1 edge worker's **promotion to
production** (§1.4) could carry this program's scan/upload surface into prod
exposure. It does not, and the finding stands as **"not exposed,"** proven three
independent ways:

- **Config gate.** The prod `vars` block asserts `SCAN_ROUTES="off"` and
  `MEDIA_UPLOADS="off"`; `index.ts` leaves an `off` route **unrouted entirely**
  (it falls through to the same `not_found` any unknown path gets — the
  environment does not advertise that a scan surface exists), and
  `validate-config` asserts the `off` literal for production specifically.
- **Live probe (today).** `api.patina.cloud/v1/scan/…` → **404**,
  `/v1/media/uploads` → **404** (§1.4). The surface is closed on the running
  worker, not merely in config.
- **Git-ancestor reasoning.** The scan-route code *is* present in the deployed
  prod bundle (the prod worker was deployed 2026-08-18/19, after the scan-route
  merge on `main`), so "not exposed" is **defense-in-depth on live code**, not
  code-absence — the gate travels in the same tree that carries the routes.
  *(This third leg I relay from the review; I confirmed the deploy timeline and
  the committed-off literals, but Cloudflare reports "Source: Unknown" for the
  prod deploys, so I could not independently reduce it to a single deployed SHA.
  The first two legs — config assertion and live 404 — I verified directly.)*

### 3.4 Least-privilege roles — unprovisioned except `scan_worker_login`

`pg_roles` and `has_function_privilege`, staging, today:

- **Login roles that exist:** `scan_worker_login` (LOGIN, NOINHERIT,
  NOBYPASSRLS). **`scan_reader_login` does NOT exist** — the `scan_reader` group
  role is provisioned but has no login role, because nothing on the interactive
  read path reads through it (DELIVERY-PLAN R5; W1 §8 item 3). No production
  role of any kind exists.
- **What `scan_worker_login` can EXECUTE:** exactly **5** functions —
  `scan_worker_append_event`, `scan_worker_complete_task`,
  `scan_worker_fail_task`, `scan_worker_update_room_file` (the four W1 RPCs) and
  `register_media_object` (the W2 artifact registrar). It is **denied**
  `create_media_upload_intent`, `confirm_media_upload`, `enqueue_agent_task`,
  and `expire_stale_upload_intents` (`swl_exec = false` for each).
- **Table denials:** `has_table_privilege('scan_worker_login', …, 'SELECT')` is
  **false** on `room_files`, `media_objects`, and `profiles`.

A leaked `SCAN_WORKER_DSN` therefore reaches five scan/registrar RPCs and
**nothing else** — no table, no storage, no other queue lane, no upload-intent
minting. That is the posture 00490 was written for, demonstrated rather than
asserted.

---

## 4. The honest open-items ledger

This is the section a go/no-go should be read against.

### 4.1 Splat reconstruction quality is NOT designer-grade — the frontier

The pipeline is proven end to end; the **picture is not a room.** The staged
artifact, drawn in the portal, is "a dense clump with long spiky Gaussians
around it, and nothing in it is recognisable as the kitchen the 42 photos were
taken in" (`W2-EVIDENCE.md` §14.5). This is the wave's real remaining gap
(§14.6 item 2), and it is a **programme, not a patch**:

- **The selector is close to useless on this fixture.** Held-out PSNR spread
  across every exportable checkpoint is 0.39 dB and the winning margin was 0.013
  dB; LPIPS moves 0.19 monotonically and disagrees (`W2-EVIDENCE.md` §14.6
  item 1). An **LPIPS checkpoint-selection** change was subsequently committed
  (`fa9841d0` / `d8699f9a`, "lpips checkpoint selection") — but nothing has been
  run to show it produces a better-looking splat; it is a committed one-line-seam
  change awaiting a comparison run, not a proven quality improvement.
- **The un-run ladder.** 42 frames over a 292 sq ft room is very sparse.
  Candidates — more frames, **COLMAP pose-prior refine** (scoped in the W2 plan,
  wired behind config, **never exercised**), masking the ceiling-less void, a
  denser seed — are all unproven. Seeding from `mesh.ply` *was* done and raises
  the held-out ceiling +1.23 dB (§13.6), but the honest headline there is that
  **the iteration budget, not the init, is now the binding constraint**, and
  even the best checkpoint is not a recognisable room.

**Needs a ruling on how much reconstruction quality W2 is meant to deliver at
all** before this is called done.

### 4.2 The originals cutover — machinery BUILT, DORMANT; NOT run

W3's core stated goal is the **shadow dual-write of scan originals** onto the
Phase-2 interface. Be precise: **W3 delivered the machinery, not the cutover.**

**Built:**
- **The upload interface** — `POST /v1/media/uploads` and `/…/confirm` on the
  edge worker (`20e8b1f9`, `ec4a817b`, `33d95754`), behind `MEDIA_UPLOADS`
  (flag-off, verified 404 §1.3/§1.4).
- **The RPCs** — 00498–00501 applied on staging: intent, confirm, version lock,
  kind split, per-scan quota, reaper.
- **The iOS + Field legs** — `feat(ios): scan upload intent client + R2 shadow
  leg (dormant)` (`cd7094eb`, `12a95a7b`) and `feat(field): upload intent client
  + R2 shadow leg (dormant)` (`ca2765bd`, `a57e2d58`).
- **The storage backend** — `services/scan-pipeline/storage_backend.py` (R2/S3
  backend) and `storage_shadow.py` (`ShadowStorageBackend`, `SCAN_STORAGE_SHADOW=r2`,
  a JSONL verdict ledger and an **inert `record_hook` seam** that the cutover
  wave will supply — the module deliberately invents no schema for it yet)
  (`74d1cae1`, `a4424b7e`).

**Not run — proven by the corpus being empty.** Staging today:

| Query (today) | Result |
|---|---|
| `media_objects` where `provenance->>'source' = 'media_upload_intent'` | **0** |
| `media_objects` where `object_key like 'scan_originals/%'` | **0** |
| `media_objects` where `lifecycle_state = 'expired'` | **0** |
| total `media_objects` | 30 (29 renders + 1 splat), **all `provenance = 'parametric'`** |

**No shadow corpus exists.** The cutover needs the **write token** minted → the
`MEDIA_UPLOADS` flag turned on → **real captures with the shadow toggle set** to
accumulate the ≥50-bundle / ≥7-day / 100%-sha256-match evidence DELIVERY-PLAN
W3's exit criterion actually requires. None of that has happened. The DELIVERY-
PLAN's W3 exit criterion is therefore **NOT met** — only its interface is.

### 4.3 Kody-gated

- **Write-token mint** — create `patina-staging-media-writer` (Object Read &
  Write on `patina-staging-media-originals-us` only), set
  `SCAN_R2_WRITE_ACCESS_KEY_ID`/`_SECRET` as Wrangler secrets **and** the Modal
  `scan-r2` write pair. Cloudflare-dashboard action this repo's tooling cannot
  perform. Blocks the whole of §4.2.
- **Push-invariant confirmation** — the staging migration-ledger discipline
  (`strata-staging.md`) is marked **"PENDING KODY'S CONFIRMATION"**: file-based
  `db push` only, never MCP `apply_migration`, against staging. This needs a
  ruling before the next migration touches staging or prod.
- **Splat-quality ruling** — §4.1.
- **Budget-cap-halt decision** — §4.5.

### 4.4 Scheduled, not done

- **R2 orphan-object DELETION.** The 00501 reaper **marks** stale pending
  intents `expired`; it does **not** delete the R2 object (it has no business
  holding the write credential). `public.expired_upload_originals` is the
  read-only **seam** a future cleanup job reads to find `(bucket, object_key)`
  to delete — that job does not exist. Until it does, an expired intent's bytes
  (if any arrived) linger in R2.
- **The shared-code `database.ts` sink-pin** is owned by the **peer Phase-2 /
  edge program**, not this lane — routed there deliberately so this program does
  not fork the shared data layer. Recorded here only so it is not lost.

### 4.5 Budget-cap halt — cap SET, halt NOT demonstrated

The **$42.50 workspace cap is set** (Kody, Modal dashboard — MEMORY /
W1 §8 item 1). A **halt has NOT been demonstrated.** DELIVERY-PLAN W4's exit
"nominally wants" a demonstrated budget-cap halt; the interim guards are real
(the Starter plan halts on credit exhaustion; the dispatcher's billing guard
bounds invocation frequency; whole-wave metered spend to date is ≈ **$2.42**,
`W2-EVIDENCE.md` §14.8, well inside the cap). See §5 for the recommendation.

### 4.6 Hazards recorded (so they are not re-discovered the expensive way)

- **`db:generate` truncation hazard.** `packages/supabase`'s `generate` is
  `supabase gen types typescript … > src/database.types.ts`. The `>` redirect
  **truncates unconditionally** — a partial or failed `gen types` (a broken
  pooler connection, a wrong `SUPABASE_DB_URL`) silently writes a truncated
  `database.types.ts` rather than erroring. Regenerate only from a verified
  connection and diff the result. *(Relayed program hazard; not reproduced this
  pass.)*
- **Stale-R2-read ops trap.** `wrangler r2 object get --remote` served
  **byte-identical stale bytes** for several minutes after a key was replaced,
  through both `--file` and `--pipe` (`W2-EVIDENCE.md` §13.5). **Any visual
  verdict must be taken on bytes fetched through the writing credential and
  checked against the registry's sha256** — a verdict on a stale download is a
  verdict about the previous deploy.
- **Staging schema-drift finding.** `00373`'s `public.room_files.drawings`
  column was re-applied to staging via `execute_sql` **without a ledger row**
  (it is inside the reconciled 00480 floor, so needs no repair entry;
  `strata-staging.md`). The column exists (`jsonb`); the drift is documented,
  not open — but it is why a naive ledger-only audit of staging looks wrong.
- **`/room/[id]` scan-id trap.** The portal route takes a **scan** id, not a
  `rooms.id`; handed a room id, `useRoomScan` PostgREST-406s and the page
  renders "This room is still being drawn." — the same empty state an unparsed
  scan gets, with the real cause only in the console (`W2-EVIDENCE.md` §14.5).
  Cost one lane twenty minutes; not this program's to fix, recorded so it does
  not cost the next lane the same.

---

## 5. Prod-wave readiness assessment

**Production is explicitly out of this plan** (DELIVERY-PLAN W4 "Does not");
it awaits Kody's separate authorization. This is what that chain *would* be,
what is proven safe to replicate, and what is gated.

### The prod chain (per DELIVERY-PLAN W4 → prod)

| Step | State | Proven-safe-to-replicate / gate |
|---|---|---|
| **Prod Modal env `patina-production`** + budget cap + per-env secrets | does not exist | **GATED** — created only on prod authorization; the staging env's clean separation is proven by construction (one env, no cross-contamination), but "separation actually separates" cannot be positively demonstrated until a second env exists |
| **Prod R2 buckets** `patina-media-originals-us` / `patina-media-artifacts-us` | named in prod `wrangler.jsonc`, **not provisioned** | **GATED** — Cloudflare-dashboard action; staging's bucket pair + round-trip is the proven template |
| **Prod migrations** 00489–00501 via **file-based `db push --include-all`** | prod is at 00486 + 00493 + 00510; 00487–00492 **not applied to prod** | **GATED + CARE** — the gap makes `--include-all` mandatory (a plain push `LegacyDbPushMissingRemoteError`s). ⚠ prod `svc_*` schemas are **Prisma-shaped** — svc_* DDL must be catalog-resolving (the 00482 `2d6e9063` / 00493 pattern) or preflight prod's catalog. The staging apply is proven; the prod apply is **not** rehearsable for svc_* shape (MEMORY: prod-svc-shape divergence) |
| **CPU box** — the `solve`-stage **dual-enqueue** deploy (enqueues the Modal stages) | staging-proven via the dispatcher; box deploy is a prod step | **GATED** — the enqueue/dispatch mechanics are proven on staging end to end |
| **Portal deploys** with the **storage-key export** | designer portal CSP `scanR2Origin` from `NEXT_PUBLIC_SCAN_R2_ENDPOINT` proven on staging (`W2-EVIDENCE.md` §10b) | **CARE** — the wrangler-vars export trap (a local-pointed `.env.local` shipping the wrong ref) is a known prod-deploy footgun; export the prod endpoint explicitly |
| **Flip `SCAN_ROUTES`/`MEDIA_UPLOADS` on in prod** | both asserted `off`, verified 404 (§1.4) | **GATED** — the whole read/upload surface; validate-config asserts prod-off, so turning it on is a deliberate, reviewed edit, not a redeploy accident |

**Proven safe to replicate:** the entire staging chain — migrations applied
and object-verified, the least-privilege role pair, the Modal `patina-scan`
app, the edge read routes (gated, and live-404 when off), the R2 write/read
round trip, and the read path drawn in a portal. The rollback shape is a
**config flip** (`SCAN_ROUTES`/`CATALOG_SOURCE` → off + deploy), the same
mechanism the Phase-1 catalog rollback drill timed at **8 seconds**
(`patina-cloudflare-phase-1-staging-evidence.md` §8); the scan-route flip is
that same mechanism but has **not been separately timed** for these routes.

**Gated, and correctly so:** everything that spends money or opens a prod
surface — the prod Modal env and its budget cap, prod R2 provisioning, both prod
tokens, and the flag flips.

### The budget-cap-halt question, answered honestly

W4's exit nominally wants a *demonstrated* halt; today we have a *set* cap and
no demonstration. My read: a halt is worth a **deliberate cheap trigger** before
prod GPU spend is authorized — lower a cap (or use a throwaway scratch cap) and
run a sub-cent CPU loop until it stops, converting "cap is set" into "halt
observed" for a few cents and closing the W4 exit line honestly. It is **not a
prod-safety blocker on its own** — the cap-is-set plus Starter-plan credit-halt
plus the dispatcher billing guard are real, layered guards — but demonstrating
it is cheap insurance that the mechanism you are relying on for an unwatched
spawn target actually fires.

---

## 6. W4 exit-criteria checklist

> **Exit.** An evidence document in the `patina-cloudflare-phase-1-staging-
> evidence.md` style with every golden case green, the timed rollback drill, and
> a demonstrated budget-cap halt — reviewed by Kody as the prod-authorization
> input. — DELIVERY-PLAN §W4

| Criterion | State | Evidence |
|---|---|---|
| Evidence document in the staging-evidence style | **met** | this document |
| Golden — duplicate delivery | **met** | W1 lease-guard golden cases; lease-guard `UPDATE` (DELIVERY-PLAN R1) |
| Golden — stale revision | **met** | W2 §7.4 superseded guard fired live on `abad722d` (rf v1 vs scan v4) → `done`, `dispatch_outcome=superseded` |
| Golden — preemption & resume | **met (mechanically)** | W2 §7.3 `CheckpointCommitter`, §9.1 15 commits, §13.6 resume path exercised on real data. Actual preemption not induced; the resume *path* is proven |
| Golden — checksum mismatch | **met (probe-proven)** | §3.2 — R2 `400 BadDigest` on wrong bytes; Worker + RPC fail-closed on missing checksum |
| Golden — RLS negatives incl. mood-board class | **met** | §3.1 — identical-404 collapse, `media_objects_select` delegation, 404-before/200-after (W2 §9.4, §14.5), equivalence-gated conformance test |
| Golden — budget-cap behavior | **deferred** | §4.5 — cap **set** ($42.50), halt **not demonstrated** |
| Golden — Modal env separation actually separates | **deferred** | §5 — only `patina-staging` exists; positive cross-env isolation test needs a second env |
| Timed rollback drill | **partial** | config-flip rollback mechanism proven & timed at 8 s for the catalog (Phase-1 §8); the scan-route flip is the same mechanism but **not separately timed** |
| Registered-not-fixed proxy findings tracked as pre-prod blockers | **met (tracked)** | DELIVERY-PLAN §1/§5 (the four proxy findings + the `net.*` residual) carried as prod blockers |
| W4 hardening — quota + reaper (finding 11) | **met** | 00501 applied; cron 50 active (§1.1) |
| **Reviewed by Kody as prod-authorization input** | **owed** | this document is that input |

**Reading of the exit.** As written, W4's golden set is **mostly green**, with
**two deferred lines** (budget-cap halt; env-separation proof) and **one
partial** (scan-route rollback not separately timed). The larger truths the
checklist does not capture are §4.1 (splat quality) and §4.2 (the originals
cutover machinery is dormant — W3's stated exit is unmet). W4-the-hardening is
done; W3-the-cutover is not, and W2-the-picture is drawn but not yet a room.

---

## 7. Go / no-go read for Kody (assessment, not a decision)

The pipeline is **real and the discipline is sound**: one queue of record, a
scoped role pair that a leak reduces to five RPCs, a read path that draws in a
portal behind the caller's own RLS twice over, R2 checksum enforcement proven by
probe rather than prose, and a production edge surface that is verifiably
**closed** even though the Phase-1 worker was promoted to front `api.patina.cloud`.
On that basis the *plumbing* is prod-shaped and the staging chain is proven safe
to replicate under the stop-at-staging rails. **But two things a designer would
notice are not there yet, and one W4 line is unproven.** The splat is not a
recognisable room (§4.1) — a quality programme, not a patch, and it wants your
ruling on how far W2 is meant to go. The originals **cutover has not run** (§4.2):
the machinery is built and dormant and the shadow corpus is provably empty, so
W3's own exit is unmet until the write token is minted, the flag is flipped, and
real captures accumulate the ≥50-bundle / 7-day / 100%-match evidence. And the
budget-cap **halt** is set-but-undemonstrated (§4.5) — cheap to close, worth
closing before prod GPU spend. My honest read: this is a **clean go for
reviewing and for authorizing the prod-*infrastructure* replication** (env,
buckets, tokens, migrations) **as a staged, gated chain — and a no-go for
declaring the Rendered Room product done or for turning the scan/upload surface
on in production**, until the splat-quality ruling, the actual originals cutover,
and a demonstrated budget-cap halt are in hand. You are the decision; this is the
assessment.
