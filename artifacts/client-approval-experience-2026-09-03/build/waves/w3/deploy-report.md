# Wave 3 — production deploy report ("The Decision, Delivered": the habit)

Deployed 2026-09-06 from the **main checkout** `/Users/kody/Code/patina-merged`,
`git rev-parse HEAD` = **`43804dba005b93fce4b6d86749f31410436c8bb1`**, branch `main`.
The working tree carried only the pre-existing unrelated modifications (`CLAUDE.md`,
`.claude/settings.json`, `project.pbxproj`, six help-walkthrough PNGs) and the untracked
artifact directories; none were touched.

Authorization: Kody's in-session ship request ("ship the improvements to production"), which
authorizes the whole chain (migrations → edge functions → portals → smoke) without per-step re-ask.

Targets: Supabase project **Strata** (`bkvcixdmuyejfzcijpdg`) and **Cloudflare Workers**.
The retired Coolify box was not touched.

Order run: **migrations → six edge functions → client portal → designer portal → smoke.**
The order is load-bearing: both new client acts (the cadence picker and the snooze) refuse until
`00572` lands, and `00573` recreates `get_project_decision_reviews`, which both portals read
through the rewritten `@patina/supabase` hooks.

---

## A. Pre-flight (read-only)

| check | command | result |
|---|---|---|
| migration ledger | `supabase migration list --linked` | every migration through **00571** applied (the peer `studio-invoices` program's, as briefed); **exactly two pending: `00572_she_sets_the_pace` and `00573_approval_record_typed_name`** (`remote` empty on both). Nothing else pending — so the clean `db push` path applied, and **no by-file apply and no manual ledger insert were needed.** |
| function versions | `supabase functions list --project-ref bkvcixdmuyejfzcijpdg` | 81 functions on Strata; before-versions for the six recorded (table in §C). |

**One drift worth recording:** the before-versions are one higher than Wave 2's after-versions
(`decision-reminders` 44 where Wave 2 left 43, and so on). Something redeployed these between
Wave 2 and now. It changes nothing about this deploy — every one still incremented off the
observed baseline — but the versions in Wave 2's table are no longer the live floor.

### verify_jwt audit before deploying

`supabase/config.toml` was parsed per `[functions.<name>]` block for each of the six.
**None of them has a `verify_jwt` entry at all**, so all six take the default `verify_jwt = true`.
The remote API agreed (`verify_jwt: True` for all six, before and after).
**No function was deployed with `--no-verify-jwt`.**

### What the two migrations create (names only)

**`00572_she_sets_the_pace.sql`** — 1804 lines.

*Tables (3, all new):*

- `public.decision_snoozes` — RLS enabled; 5 policies (`decision_snoozes_owner_select`,
  `…_owner_insert`, `…_owner_update`, `…_owner_delete`, `…_service_all`);
  `idx_decision_snoozes_decision`
- `public.decision_first_notice_attempts` — RLS enabled; policy
  `decision_first_notice_attempts_service`
- `public.decision_first_notice_sweep_state` — RLS enabled; policy
  `decision_first_notice_sweep_state_service`

*Functions / RPCs:*

`notification_time_zone(uuid)` · `normalize_reminder_cadence()` (+ its `normalize_reminder_cadence`
trigger on `notification_preferences`) · `next_local_morning(text, timestamptz)` ·
`set_decision_snooze(uuid, text)` · `push_deliver_after(uuid, timestamptz)` ·
`notify_client_attention(uuid, text, uuid, text, text, jsonb)` (replaced) ·
`release_due_client_pushes(integer)` · `record_decision_studio_handoff(uuid)` ·
`_decision_first_notice_sweep_cutoff()` · `record_decision_first_notice_attempt(uuid, text)` ·
`sweep_decision_first_notices(integer)` · `_why_author_display_name(uuid)` ·
`_create_project_approval_decision_checked(…)` (replaced) ·
`backfill_why_author_display_names()`

*Column / index changes:*

- `notification_log.deliver_after` added, with `idx_notification_log_push_release`
- `notification_preferences.reminder_cadence` — default set to `'daily'`;
  `idx_notification_preferences_reminder_digest_due` rebuilt
- `project_approval_artifacts` altered inside `backfill_why_author_display_names()`

*The widened reminder cadence:* the old
`notification_preferences_reminder_cadence_check` is dropped and re-added as
**`CHECK (reminder_cadence IN ('right_away', 'daily', 'weekly_sunday'))`**, with two `UPDATE`s
ahead of it mapping the retired spellings forward (`immediate`→`right_away`,
`daily_digest`→`daily`) and parking anything else on `'daily'`. The `normalize_reminder_cadence`
trigger keeps doing that for writers that have not shipped the new picker yet.

*pg_cron — four jobs, two of them replacements:*

| job | schedule | note |
|---|---|---|
| `decision-reminders-hourly` | `0 * * * *` | **replaces** 00092's `decision-reminders-daily` (09:00 UTC), unscheduled here |
| `notification-digest-hourly` | `20 * * * *` | **replaces** 00278's `notification-digest-daily` (15:00 UTC), unscheduled here |
| `client-push-window-release` | `*/15 * * * *` | new — `public.release_due_client_pushes(200)` |
| `decision-first-notice-retry-sweep` | `*/30 * * * *` | new — `public.sweep_decision_first_notices(100)` |

All four `cron.unschedule` calls are `IF EXISTS`-guarded. The `pg_cron` extension comment is
rewritten to carry the new registry text.

*GRANT/REVOKE:* every new function gets `REVOKE ALL … FROM PUBLIC` then a narrow
`GRANT EXECUTE` (`service_role`, and `authenticated` where the portal calls it —
`set_decision_snooze`, `next_local_morning`). `decision_snoozes` is
`REVOKE ALL … FROM PUBLIC, anon` then `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated`
and `GRANT ALL` to `service_role`. Both first-notice tables are `service_role`-only.

**`00573_approval_record_typed_name.sql`** — 235 lines. A single
`CREATE OR REPLACE FUNCTION public.get_project_decision_reviews(uuid)` with its matching
`REVOKE ALL` / `GRANT EXECUTE` / `COMMENT ON`. **No table, column, enum, trigger, cron or index
change.**

---

## B. Migrations

Both were the only pending migrations, so the clean path applied — **no `db query --file`, no
manual `supabase_migrations.schema_migrations` ledger insert.**

```
$ supabase db push
Initialising login role...
Connecting to remote database...
Applying migration 00572_she_sets_the_pace.sql...
Applying migration 00573_approval_record_typed_name.sql...
{"upToDate":false,"dryRun":false,
 "migrations":["00572_she_sets_the_pace.sql","00573_approval_record_typed_name.sql"],
 "seeds":[],"roles":[],"message":"Finished supabase db push."}
```

### Object probes (the objects, not the ledger)

**The new table:**

```
$ supabase db query --linked "select table_name from information_schema.tables
    where table_name='decision_snoozes'"
  table_name = decision_snoozes
```

**The RPCs — exact signatures, matching the three-lane contract:**

```
$ supabase db query --linked "select oid::regprocedure::text as sig from pg_proc
    where proname in ('set_decision_snooze','next_local_morning','release_due_client_pushes',
                      'sweep_decision_first_notices','get_project_decision_reviews') order by 1"
  get_project_decision_reviews(uuid)
  next_local_morning(text,timestamp with time zone)
  release_due_client_pushes(integer)
  set_decision_snooze(uuid,text)
  sweep_decision_first_notices(integer)
```

`set_decision_snooze(uuid, text)` is the arity `useSetDecisionSnooze` calls.

**The widened cadence CHECK:**

```
$ supabase db query --linked "select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='notification_preferences'::regclass and conname ilike '%cadence%'"
  conname = notification_preferences_reminder_cadence_check
  def     = CHECK ((reminder_cadence = ANY (ARRAY['right_away'::text, 'daily'::text,
                                                  'weekly_sunday'::text])))
```

The three Wave 3 tokens, and only those three. It is a CHECK constraint, not an enum.

**pg_cron — all four landed active, and both retired daily jobs are gone:**

```
$ supabase db query --linked "select jobname, schedule, active from cron.job
    where jobname ilike '%notice%' or jobname ilike '%pace%' or jobname ilike '%push%'
       or jobname ilike '%decision%' or jobname ilike '%digest%' order by jobname"
  client-push-window-release            */15 * * * *   active=true
  decision-first-notice-retry-sweep     */30 * * * *   active=true
  decision-reminders-hourly             0 * * * *      active=true
  digest-dispatcher                     0 14 * * *     active=true    (pre-existing, untouched)
  expire-decisions-daily                0 2 * * *      active=true    (pre-existing, untouched)
  expire-stale-workspace-invites-daily  40 7 * * *     active=true    (pre-existing, untouched)
  notification-digest-hourly            20 * * * *     active=true
```

**`decision-reminders-daily` and `notification-digest-daily` are absent** from the result — the
two replacements took, and the retired dailies are unscheduled. Every new schedule matches the
migration exactly.

**RLS on the new table:**

```
$ supabase db query --linked "select policyname from pg_policies
    where tablename='decision_snoozes' order by policyname"
  decision_snoozes_owner_delete
  decision_snoozes_owner_insert
  decision_snoozes_owner_select
  decision_snoozes_owner_update
  decision_snoozes_service_all
```

All five policies present; RLS is on.

**Ledger tail:**

```
$ supabase db query --linked "select version from supabase_migrations.schema_migrations
    order by version desc limit 3"
  00573
  00572
  00571
```

Nothing pending.

---

## C. Edge functions — the six

Each deployed by name, sequentially, from the main checkout, in the briefed order. None carried
`--no-verify-jwt` (see the audit in §A). Every one returned `"message":"Deployed Functions."`.
All six were done in one pass — each bundles its own copy of the edited `_shared/decision-notify.ts`,
so a partial deploy would have left two generations of copy in the mail.

| function | before | after | script size | verify_jwt | status |
|---|---:|---:|---|---|---|
| decision-first-notice | 3 | **4** | 186 kB | true | ACTIVE |
| decision-reminders | 44 | **45** | 183 kB | true | ACTIVE |
| decision-resolved-notify | 44 | **45** | 182 kB | true | ACTIVE |
| expire-decisions | 44 | **45** | 182 kB | true | ACTIVE |
| notification-digest | 40 | **41** | 193 kB | true | ACTIVE |
| proposal-nudge | 41 | **42** | 183 kB | true | ACTIVE |

**All six incremented; none failed, none was left behind.** Every one kept `verify_jwt = true`.

`invoice-reminders` was correctly **not** in the set — the wave report established it names
`decision-notify` only in a comment and does not import it.

### Probes

**(1) `decision-first-notice` no-ops cleanly on a non-existent decision.**
Service-role key fetched via `supabase projects api-keys --project-ref … --reveal`, held in a
shell variable, piped into curl and unset after; never printed.

```
$ curl -s -X POST …/functions/v1/decision-first-notice \
    -H "Authorization: Bearer $KEY" -H "apikey: $KEY" -H 'Content-Type: application/json' \
    -d '{"decision_id":"00000000-0000-0000-0000-000000000000"}'
HTTP 404
{"error":"decision_not_found"}
```

It authenticated (not 401), found no decision, and sent nothing — the same clean 404 Waves 1 and 2
recorded, now on top of `00572`'s new attempt-recording tables. **No real send.**

**(2) No notification burst from the deploy.**

```
$ supabase db query --linked "select count(*) as recent from notification_log
    where created_at > now() - interval '10 minutes'"
  recent = 0      (baseline, taken after the migration and before the six deploys)
  recent = 0      (again, after the six deploys and the invocation probe)
```

Zero rows both times. Notably this is the first wave where the migration itself rescheduled live
crons — `decision-reminders-hourly` and `notification-digest-hourly` are now on the clock — and
nothing had fired into `notification_log` within the window.

**(3) The retry sweep's run history.** See §F — checked twice, and reported honestly.

---

## D. Client portal

### Gate — the same `.next/types` trap, third wave running

`apps/client-portal/.next/types` was present and dated **Sep 5 22:07**, predating this tree.
`apps/client-portal/tsconfig.json` includes `.next/types/**/*.ts`, so tsc would have checked a
stale generated route-type shim — the exact failure Waves 1 and 2 both hit.

Ports 3000–3003 were checked first: `lsof -nP -iTCP:3000-3003 -sTCP:LISTEN` returned **no
listeners**, so no peer `next dev` owned that build output (unlike Wave 2, where two did).

```
$ rm -rf apps/client-portal/.next/types
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
EXIT=0            # clean, no diagnostics
```

No source file was modified.

### Deploy

```
$ ./infra/deploy-portal.sh client        # THE ONLY portal deploy path
…
env.NEXT_PUBLIC_SUPABASE_URL ("https://bkvcixdmuyejfzcijpdg.supabase...")
env.NEXT_PUBLIC_ENV ("production")
…
Uploaded patina-client-portal (12.77 sec)
Deployed patina-client-portal triggers (0.72 sec)
  https://patina-client-portal.kody-be3.workers.dev
Current Version ID: 78ce6497-324e-4c29-976d-305b993180bc
==> Done: client portal deployed to production.
```

**No env var needed exporting** — the script's preflight resolved the prod Supabase URL and the
storage key from the app's own env files on the first attempt.

Start `2026-09-06T07:19:10Z`, worker version created `07:20:31Z`.
Two benign warnings: the usual multiple-environments notice (top-level environment targeted, the
shape every prior client deploy used) and a Node `DEP0190` deprecation notice from the script.

### Verification

**Deployments list (oldest-first — bottom row):**

```
$ npx wrangler deployments list --name patina-client-portal
…
Created:     2026-09-06T07:20:33.666Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) 78ce6497-324e-4c29-976d-305b993180bc
                 Created:  2026-09-06T07:20:31.587Z
```

Bottom row is **after** the 07:19:10Z deploy start and its version id matches the script's
`Current Version ID`. The row above it (`ddd88b00`, 2026-09-06T03:08:26Z) is a peer deploy from
earlier the same morning, not ours.

**Live responses:**

```
$ curl -sI https://client.patina.cloud/
HTTP/2 307 · location: /auth/signin?callbackUrl=%2F

$ curl -sI https://client.patina.cloud/decisions/00000000-0000-0000-0000-000000000000/record
HTTP/2 307
location: /auth/signin?callbackUrl=%2Fdecisions%2F00000000-0000-0000-0000-000000000000%2Frecord
```

The Wave 3 record route redirects to sign-in **with the full path preserved in `callbackUrl`,
`/record` segment intact** — the deep link survives the gate.

**The served bundle carries Wave 3 copy.** Both briefed strings live in the same newly-built
static asset:

```
$ grep -rl "Keep a copy" apps/client-portal/.open-next/assets
.open-next/assets/_next/static/chunks/common-f8b9003235880b11.js
$ grep -rl "Once a week, on Sunday" apps/client-portal/.open-next/assets
.open-next/assets/_next/static/chunks/common-f8b9003235880b11.js
```

Confirmed on the **served** artifact, not just the local build:

```
$ curl -s https://client.patina.cloud/_next/static/chunks/common-f8b9003235880b11.js
HTTP 200  bytes=985878
  "Keep a copy"              → 2 matches
  "Once a week, on Sunday"   → 1 match
```

Wave 3 copy is live on production. The chunk hash also moved off Wave 2's
`common-23743dbd62ed8bc4.js`, so this is a genuinely new asset.

---

## E. Designer portal

### Gate

```
$ pnpm --filter @patina/designer-portal type-check
EXIT=0
```

### The preflight refusal, and the same non-destructive workaround

`apps/designer-portal/.env.local` is **still pointed at the local stack** — exactly the state
Wave 2's report flagged as the one piece of carried state a later operator needs. (It could not
even be read here: the sandbox denies `.env*`.) Left as it is; **not edited**.

The build was instead compiled against the committed prod literals, the script's own sanctioned
override (`resolve_next_public_var` puts an exported `process.env` value ahead of the env files).
All **16 `vars` from `apps/designer-portal/wrangler.jsonc`** — public, committed, already the
source of truth for this worker's env — were exported into the deploy shell for this single
invocation, from a `0600` temp file deleted immediately after. No value was printed. Resolved and
confirmed before the build:

```
NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token
NEXT_PUBLIC_SUPABASE_ANON_KEY  (len 208, matches wrangler.jsonc)
```

With the exports in place the preflight passed on the first attempt — no refusal was hit.

### Deploy

```
$ ./infra/deploy-portal.sh designer
…
Uploaded patina-designer-portal (22.32 sec)
Deployed patina-designer-portal triggers (0.69 sec)
  https://patina-designer-portal.kody-be3.workers.dev
Current Version ID: 090b5c5e-82bb-4141-b6a5-4a32126d4221
==> Done: designer portal deployed to production.
```

Start `2026-09-06T07:21:44Z`, worker version created `07:23:13Z`. Three benign warnings: the
multiple-environments notice, esbuild's long-standing `direct-eval` note on `handler.mjs`
(`await eval('import ("file-type")')`, present on every prior designer deploy), and `DEP0190`.

### Verification

**Deployments list (oldest-first — bottom row):**

```
$ npx wrangler deployments list --name patina-designer-portal
…
Created:     2026-09-06T07:23:16.952Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) 090b5c5e-82bb-4141-b6a5-4a32126d4221
                 Created:  2026-09-06T07:23:13.550Z
```

Bottom row is after the 07:21:44Z start and matches the script's `Current Version ID`. The row
above (`fb8354db`, 2026-09-06T03:06:59Z) is the same peer's earlier deploy.

**Live response:**

```
$ curl -sI https://app.patina.cloud/
HTTP/2 200 · content-type: text/html; charset=utf-8 · content-length: 21022
```

**The export did not leak local values into the bundle:**

```
$ grep -rl "127.0.0.1:54321" apps/designer-portal/.open-next/assets
(no matches)
$ grep -rl "bkvcixdmuyejfzcijpdg.supabase.co" apps/designer-portal/.open-next/assets
.open-next/assets/_next/static/chunks/5517-18ed375f60914c4a.js
.open-next/assets/_next/static/chunks/3660-2ca10058598883bb.js
```

The uploaded assets carry the prod Supabase host and no local host anywhere. (The `5517-` chunk
hash moved off Wave 2's `5517-199f71ff1388d1df.js` — the rebuilt `@patina/supabase` dist with the
two rewritten hooks is in the bundle, which is the whole reason this portal was in the deploy set;
no designer source file changed.)

---

## F. Cron run history — one of the four is proven firing

`decision-first-notice-retry-sweep` runs `*/30`. It was scheduled at ~07:15Z; two checks, at
07:23Z and 07:25Z, both returned nothing — **the sweep has not yet been observed firing, and that
is reported as empty rather than explained away.** Its job row exists and is `active=true`, which
is what the migration is responsible for; whether pg_cron has reached its boundary is a matter of
clock, not of this deploy.

Widening the same query past the sweep, however, caught something better:

```
$ supabase db query --linked "select j.jobname, d.status, d.start_time, d.return_message
    from cron.job_run_details d join cron.job j on j.jobid=d.jobid
    where j.jobname in ('decision-first-notice-retry-sweep','client-push-window-release',
                        'decision-reminders-hourly','notification-digest-hourly')
    order by d.start_time desc limit 8"
  jobname     = notification-digest-hourly
  status      = succeeded
  start_time  = 2026-09-06 07:20:00.368058+00
  msg         = 1 row
```

**`notification-digest-hourly` fired on its very first boundary after the migration and
succeeded.** This is the single riskiest change in the wave — the digest moved from once daily at
15:00 UTC to twenty-four passes a day — and it is now the one rescheduled cron with live evidence
behind it, not just a `cron.job` row.

And it sent nothing:

```
$ supabase db query --linked "select count(*) as recent_20min from notification_log
    where created_at > now() - interval '20 minutes'"
  recent_20min = 0
```

Zero mail across a window that **contains** the 07:20:00Z digest pass. The hourly job ran, the
per-reader `isDigestDue` gate (8am-local, never-Sunday, 20-hour min-interval) declined every
recipient, and no letter went out. That is exactly the intended behavior of the new cadence, and
it is the first Wave 3 backend act observed end-to-end in production.

The other three (`decision-reminders-hourly` at `0 * * * *`, `client-push-window-release` at
`*/15`, `decision-first-notice-retry-sweep` at `*/30`) had not reached an observed boundary before
this report closed.

---

## What was NOT verified

- **No signed-in walk on either portal.** Every probe was anonymous. The habit itself — the
  Record of Decision page, the successor thread, the cadence picker, the snooze control, the
  decision spread — was never seen rendered by a logged-in eye in production. The proof that
  Wave 3 copy shipped is a string in the served chunk, not a rendered page.
- **`set_decision_snooze` was never called.** The RPC exists at the right arity and its table has
  its five policies, but no snooze was set in prod, so the round trip (RLS, `next_local_morning`,
  the recomputed reminder) is unproven. Deliberate: the brief forbade data mutations beyond the
  migrations.
- **The cadence change was never exercised.** No `notification_preferences` row was written with
  `weekly_sunday`, so the new CHECK and the `normalize_reminder_cadence` trigger have not been hit
  by a real write. The `UPDATE`s inside the migration did rewrite any pre-existing `immediate` /
  `daily_digest` rows — **that is a data mutation the migration itself performs**, and it was not
  counted or inspected before or after.
- **Three of the four cron jobs have not been observed firing.** `decision-reminders-hourly`
  (`0 * * * *`), `client-push-window-release` (`*/15`) and `decision-first-notice-retry-sweep`
  (`*/30`) are scheduled and `active=true`, but no `cron.job_run_details` row was seen for any of
  them. **`notification-digest-hourly` is the exception** — it fired at 07:20:00Z, succeeded, and
  sent zero mail (§F). That one observation is real evidence the hourly cadence and its per-reader
  gate behave, but it is one pass on one job; the hourly reminder path in particular moved from
  once-daily to twenty-four passes a day and remains unobserved in prod. If its gate is wrong, the
  blast radius is real mail, and only the local SQL test speaks to that.
- **`release_due_client_pushes` and `sweep_decision_first_notices` were never invoked.** Their
  signatures exist; their behavior in prod is unread.
- **Five of the six functions were verified only by version increment**, not by behavior. Only
  `decision-first-notice` got a live invocation probe. The `_shared/decision-notify.ts` changes
  riding in the other five are unread in the wild.
- **No `wrangler tail`** on either portal, so a post-deploy error spike would not have been seen.
  `notification_log` was clean, but that covers mail, not Worker exceptions.
- **`backfill_why_author_display_names()` was created but its effect was not probed.** Whether the
  migration ran it, and how many `project_approval_artifacts` rows it touched, was not checked.
- **Custom-domain routing was not re-verified.** No `routes` exist in any `wrangler.jsonc`;
  `client.patina.cloud` and `app.patina.cloud` are dashboard-managed out of band. They answered
  correctly, which is evidence they are wired, not proof of their configuration.
- **iOS shipped nothing.** The Wave 3 iOS-E lane is on main and build-green (2704 tests), but no
  TestFlight build was cut in this wave and none was cut here.
- **`apps/designer-portal/.env.local` is still pointed at the local stack.** Deliberately left as
  the peer program set it. **Any future designer deploy from this checkout will need the same
  export** until that file is repointed. This is the one piece of state a later operator needs.
- **Peer traffic on these workers.** Both portals had a deploy at ~03:07Z this morning from
  another program, and the six functions' before-versions sat one above Wave 2's after-versions.
  This deploy is layered on top of whatever that was; it was not investigated.
- **Nothing was rolled back or half-applied.** Every step in the chain succeeded; there is no
  partial state to reconcile.
</content>
