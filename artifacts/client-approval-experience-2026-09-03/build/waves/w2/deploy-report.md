# Wave 2 — production deploy report ("The Decision, Delivered": the ceremony)

Deployed 2026-09-05 from the **main checkout** `/Users/kody/Code/patina-merged`,
`git rev-parse HEAD` = **`42d9057e45bbcc8e4eee4794ed15ef20314fae1b`**, branch `main`.
The working tree carried only the pre-existing unrelated modifications (`CLAUDE.md`,
`.claude/settings.json`, `project.pbxproj`, six help-walkthrough PNGs); none were touched.

Authorization: Kody's in-session ship request ("ship the improvements to production"), which
authorizes the whole chain (migration → edge functions → portals → smoke) without per-step re-ask.

Targets: Supabase project **Strata** (`bkvcixdmuyejfzcijpdg`) and **Cloudflare Workers**.
The retired Coolify box was not touched.

Order run: **migration → six edge functions → client portal → designer portal → smoke.**
The order is load-bearing: `00569` drops and recreates the approval RPCs with a defaulted
`p_why` and widens `respond_project_approval`'s payload allowlist. The client portal sends the
new payload keys (`clientConsentMethod`, `clientSignature`) and the designer portal sends
`p_why`, so both portals had to land **after** the migration. They did.

---

## A. Pre-flight (read-only)

| check | command | result |
|---|---|---|
| migration ledger | `supabase migration list --linked` | every migration through **00568** applied; **exactly one pending: `00569_approval_why_viewer_role_and_receipt`** (`remote` empty). No peer migration was pending — `db push` was the correct path, and no by-file apply or manual ledger insert was needed. |
| function versions | `supabase functions list --project-ref bkvcixdmuyejfzcijpdg` | 81 functions on Strata; before-versions for the six recorded (table in §C). |

Note on the memory line that `00555/00557/00562/00563/00564` were "pending on Strata": the live
ledger shows all five **applied**. Only `00569` was outstanding.

### verify_jwt audit

`supabase/config.toml` was grepped for `verify_jwt = false` blocks. The false set is
`stripe-webhook`, `resend-webhook`, `sms-inbound`, `sms-status`, `comms-mute`,
`test-account-login`, `fulfillment-po`, `fulfillment-evidence`, `site-request-guest` and the
other external-webhook entries — **none of our six**. `apns-send` carries an explicit
`[functions.apns-send] verify_jwt = true`; the other five have no `config.toml` block and take
the default `true`. The remote API agreed (`verify_jwt: True` for all six).
**No function was deployed with `--no-verify-jwt`.**

### What `00569` drops and creates (names only)

**Drops** (3 pre-`p_why` signatures, so the recreated ones carry the defaulted `p_why`):

- `public.create_project_approval_decision(uuid, jsonb, text)`
- `public._create_project_approval_decision_checked(…)`
- `public.supersede_project_approval_decision(…)`

Plus two `DROP CONSTRAINT IF EXISTS` on `project_approval_artifacts`
(`…_why_check`, `…_why_author_check`) — re-added in the same statement block.

**Creates / alters:**

- `ALTER TABLE public.project_approval_artifacts` — adds **`why`** and **`why_author_name`**
  (+ their check constraints and column comments)
- `CREATE OR REPLACE FUNCTION public._project_approval_release_sentence(text[])`
- `CREATE OR REPLACE FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb)`
- `CREATE OR REPLACE FUNCTION public._create_project_approval_decision_checked(…)`
- `CREATE OR REPLACE FUNCTION public.create_project_approval_decision(uuid, jsonb, text, text)`
- `CREATE OR REPLACE FUNCTION public.supersede_project_approval_decision(uuid, jsonb, timestamptz, text, text)`
- `CREATE OR REPLACE FUNCTION public.get_project_decision_reviews(uuid)` — carries the
  **`viewer_role`** projection field
- `CREATE OR REPLACE FUNCTION public._respond_project_approval_checked(…)`
- `CREATE OR REPLACE FUNCTION public.respond_project_approval(uuid, jsonb, timestamptz, text)` —
  widened payload allowlist (`clientConsentMethod`, `clientSignature`)

with the matching `REVOKE ALL` / `GRANT EXECUTE` / `COMMENT ON` on each. 1711 lines.

---

## B. Migration

`00569` was the only pending migration, so the clean path applied — **no `db query --file`, no
manual `supabase_migrations.schema_migrations` ledger insert.**

```
$ supabase db push
Initialising login role...
Connecting to remote database...
Applying migration 00569_approval_why_viewer_role_and_receipt.sql...
{"upToDate":false,"dryRun":false,"migrations":["00569_approval_why_viewer_role_and_receipt.sql"],
 "seeds":[],"roles":[],"message":"Finished supabase db push."}
```

### Object probes (the objects, not the ledger)

**Columns:**

```
$ supabase db query --linked "select column_name from information_schema.columns
    where table_name='project_approval_artifacts' and column_name in ('why','why_author_name')"
  column_name = why
  column_name = why_author_name
```

**Function signatures** — the new arities, and **no duplicates** (the dropped pre-`p_why`
3-arg `create_project_approval_decision` is gone; exactly four rows came back):

```
$ supabase db query --linked "select oid::regprocedure::text as sig from pg_proc
    where proname in ('create_project_approval_decision','supersede_project_approval_decision',
                      'respond_project_approval','notify_client_attention') order by 1"
  create_project_approval_decision(uuid,jsonb,text,text)
  notify_client_attention(uuid,text,uuid,text,text,jsonb)
  respond_project_approval(uuid,jsonb,timestamp with time zone,text)
  supersede_project_approval_decision(uuid,jsonb,timestamp with time zone,text,text)
```

**Ledger tail:**

```
$ supabase db query --linked "select version from supabase_migrations.schema_migrations
    order by version desc limit 3"
  00569
  00568
  00567
```

---

## C. Edge functions — the six

Each deployed by name, sequentially, from the main checkout. None carried `--no-verify-jwt`
(see the audit in §A). Every one returned `"message":"Deployed Functions."`. All six were done
in one pass — each bundles its own copy of the edited `_shared/decision-notify.ts` and
`_shared/project-approval-notification.ts`, so a partial deploy would have left two generations
of copy in the mail.

| function | before | after | verify_jwt | status |
|---|---:|---:|---|---|
| apns-send | 23 | **24** | true | ACTIVE |
| decision-first-notice | 1 | **2** | true | ACTIVE |
| decision-reminders | 42 | **43** | true | ACTIVE |
| decision-resolved-notify | 42 | **43** | true | ACTIVE |
| expire-decisions | 42 | **43** | true | ACTIVE |
| notification-digest | 39 | **40** | true | ACTIVE |

**All six incremented; none failed, none was left behind.** Every one kept `verify_jwt = true`.

The only recurring stderr line was the benign
`WARN: config section [inbucket] is deprecated. Please use [local_smtp] instead.`

### Probes

**(1) `decision-first-notice` no-ops cleanly on a non-existent decision.**
Service-role key fetched via `supabase projects api-keys --reveal`, held in a shell variable and
piped into curl; never printed.

```
$ curl -s -X POST …/functions/v1/decision-first-notice \
    -H "Authorization: Bearer $KEY" -H "apikey: $KEY" -H 'Content-Type: application/json' \
    -d '{"decision_id":"00000000-0000-0000-0000-000000000000"}'
{"error":"decision_not_found"}
HTTP 404
```

It authenticated (not 401), found no decision, and sent nothing — the same clean 404 Wave 1
recorded. **No real send.**

**(2) No notification burst from the deploy.**

```
$ supabase db query --linked "select count(*) from notification_log
    where created_at > now() - interval '10 minutes'"
  recent = 0      (baseline, taken before the migration)
  recent = 0      (again, after the six deploys and the invocation probe)
```

Zero rows both times.

---

## D. Client portal

### Gate — the Wave 1 trap recurred, identically

`pnpm --filter @patina/client-portal type-check` **failed on the first run**, with the exact
error Wave 1 hit:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: … } | undefined'
  does not satisfy the constraint 'PageProps'.
```

Not a source defect. `.next/` is gitignored build output and the offending file is Next's
*generated* route-type shim; `apps/client-portal/tsconfig.json` includes `.next/types/**/*.ts`,
so tsc was checking a stale artifact (dated Sep 5 07:45, predating this tree).

**Before deleting anything, ports 3000–3003 were checked** — and unlike Wave 1, two
`next-server (v16.2.10)` processes *were* listening (`:3000` and `:3002`). `lsof -d cwd` resolved
both to a **different checkout**:

```
PID 58010  cwd  …/.codex/worktrees/agent-si-integration/apps/designer-portal
PID 59184  cwd  …/.codex/worktrees/agent-si-integration/apps/client-portal
```

A peer program's dev servers, running out of the `agent-si-integration` worktree with their own
`.next` directories. They share nothing with the main checkout's build output, so the
"never `next build` over a live `next dev`" hazard did not apply and **neither peer process was
touched or killed**.

```
$ rm -rf apps/client-portal/.next/types
$ npx tsc --noEmit        # in apps/client-portal
EXIT=0                    # clean, no diagnostics
```

No source file was modified.

### Deploy

```
$ ./infra/deploy-portal.sh client        # THE ONLY portal deploy path
…
Total Upload: 12106.55 KiB / gzip: 2462.70 KiB
Worker Startup Time: 26 ms
Uploaded patina-client-portal (14.75 sec)
Deployed patina-client-portal triggers (0.72 sec)
  https://patina-client-portal.kody-be3.workers.dev
Current Version ID: c64e78bc-32e0-4896-86d9-d781a96f6b37
==> Done: client portal deployed to production.
```

No env var needed exporting — the script's preflight resolved
`NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co` and the storage key from the
app's own env files on the first attempt.

Start `2026-09-05T23:15:53Z`, worker version created `23:16:59Z`.
One benign wrangler warning: multiple environments defined, no `-e` given, so the top-level
environment was targeted (the same shape every prior client deploy used).

### Verification

**Deployments list (oldest-first — bottom row):**

```
$ npx wrangler deployments list --name patina-client-portal
…
Created:     2026-09-05T23:17:01.869Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) c64e78bc-32e0-4896-86d9-d781a96f6b37
                 Created:  2026-09-05T23:16:59.613Z
```

Bottom row is **after** the 23:15:53Z deploy start and its version id matches the script's
`Current Version ID`. The row above it is Wave 1's deploy (`ed397151`, 12:45:57Z the same day).

**Live responses:**

```
$ curl -sI https://client.patina.cloud/
HTTP/2 307 · location: /auth/signin?callbackUrl=%2F

$ curl -sI https://client.patina.cloud/auth/signin
HTTP/2 200 · content-type: text/html; charset=utf-8 · content-length: 23868

$ curl -sL https://client.patina.cloud/auth/signin | head -c 250
<!DOCTYPE html><html lang="en" class="bg-[var(--bg-primary)]">…font preloads…
```

Real Patina HTML — not a placeholder, not a blank body.

**The served bundle carries Wave 2 copy.** One string from the brief needed correcting first:
**"Return this edition" does not exist anywhere in the source** — `grep -rn "Return this edition"
apps/client-portal/src packages` returns nothing. The real Wave 2 lines are
`"… has your signature. You'll have a copy."` (the P-19 receipt, `door-gate.tsx:339` /
`threshold.tsx:324`) and `"Send this edition back for revision and a new approval request."`
(`approval-ask.tsx:108`). Both were located in the built static asset and then confirmed on the
**served** artifact:

```
$ grep -rl "has your signature" apps/client-portal/.open-next
.open-next/server-functions/default/apps/client-portal/handler.mjs
.open-next/server-functions/default/apps/client-portal/.next/server/chunks/6214.js
.open-next/assets/_next/static/chunks/common-23743dbd62ed8bc4.js

$ curl -s https://client.patina.cloud/_next/static/chunks/common-23743dbd62ed8bc4.js
HTTP 200  bytes=966453
  … has your signature. You’ll have a copy.`:null,eu=et.reduce …
  … Send this edition back for revision and a new approval request. …
```

Wave 2 copy is live on production. (The chunk hash also moved off Wave 1's
`common-08c286eeb1e3b801.js`, so this is a genuinely new asset.)

---

## E. Designer portal

### Gate

```
$ npx tsc --noEmit        # in apps/designer-portal
EXIT=0
```

### The preflight refusal — and the non-destructive fix

The first deploy attempt was **refused by the script's own preflight**, correctly:

```
$ ./infra/deploy-portal.sh designer
==> [0/3] Preflight: resolving client Supabase env the way next build will
ERROR: refusing to build designer portal — resolved NEXT_PUBLIC_SUPABASE_URL
       points at a local host (http://127.0.0.1:54321). Refusing to ship a
       local-pointed build to production. Check apps/designer-portal/.env.local.
```

`apps/designer-portal/.env.local` had been repointed at the **local** stack
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`) — the peer program's walk setup. It also
defines `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_APP_URL` and the two
PostHog vars, **all of which are build-time-inlined**. Overriding only the URL would have shipped
a prod build carrying a local anon key and `NEXT_PUBLIC_ENV=development`.

`.env.local` was **not edited** — it belongs to a running peer program. Instead the build was
compiled against the committed prod literals, which is the script's own sanctioned override:
`resolve_next_public_var` puts an **exported process.env value first**, ahead of the env files
("1) An exported process.env value wins"), and the staging branch of the same script instructs
exactly this ("Export the … NEXT_PUBLIC_SUPABASE_URL and anon key before invoking this script;
do not rely on a production `.env.local`").

All 16 `vars` from `apps/designer-portal/wrangler.jsonc` — the committed, public prod literals
that are already the source of truth for this worker's env — were exported into the deploy
shell for this single invocation, from a `chmod 600` temp file that was deleted immediately
after. No value was printed. Resolved and confirmed before the build:

```
NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token
NEXT_PUBLIC_SUPABASE_ANON_KEY  (len 208, matches wrangler.jsonc)
```

### Deploy

```
$ ./infra/deploy-portal.sh designer
…
Deployed patina-designer-portal triggers (0.67 sec)
  https://patina-designer-portal.kody-be3.workers.dev
Current Version ID: c0937064-91c1-45b5-9187-48dd976e09c7
==> Done: designer portal deployed to production.
```

Start `2026-09-05T23:19:03Z`, worker version created `23:20:26Z`. Two benign warnings: the same
multiple-environments notice, and esbuild's long-standing `direct-eval` note on
`handler.mjs` (`await eval('import ("file-type")')`) — present on every prior designer deploy.

### Verification

**Deployments list (oldest-first — bottom row):**

```
$ npx wrangler deployments list --name patina-designer-portal
…
Created:     2026-09-05T23:20:29.437Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) c0937064-91c1-45b5-9187-48dd976e09c7
                 Created:  2026-09-05T23:20:26.696Z
```

Bottom row is after the 23:19:03Z start and matches the script's `Current Version ID`. The row
above is the prior deploy (`f60d1216`, 2026-09-05T02:45:34Z).

**Live responses:**

```
$ curl -sI https://app.patina.cloud/
HTTP/2 200 · content-type: text/html; charset=utf-8 · content-length: 21022

$ curl -sL https://app.patina.cloud/ | head -c 200
<!DOCTYPE html><html lang="en">…font preloads…
```

**The served bundle carries the Wave 2 designer copy:**

```
$ grep -rl "What would you tell her about this?" apps/designer-portal/.open-next
.open-next/server-functions/default/apps/designer-portal/handler.mjs
.open-next/server-functions/default/apps/designer-portal/.next/server/app/(document)/doc/[id]/page.js
.open-next/assets/_next/static/chunks/app/(document)/doc/[id]/page-89c77350d19b9e52.js

$ curl -s 'https://app.patina.cloud/_next/static/chunks/app/(document)/doc/%5Bid%5D/page-89c77350d19b9e52.js'
HTTP 200  bytes=727717
  What would you tell her about this?     (1 match)
```

**The export did not leak local values into the bundle:**

```
$ grep -rl "127.0.0.1:54321" apps/designer-portal/.open-next/assets
(no matches)
$ grep -rl "bkvcixdmuyejfzcijpdg.supabase.co" apps/designer-portal/.open-next/assets
.open-next/assets/_next/static/chunks/5517-199f71ff1388d1df.js
.open-next/assets/_next/static/chunks/3660-2ca10058598883bb.js
```

The uploaded assets carry the prod Supabase host and no local host anywhere.

---

## What was NOT verified

- **No signed-in walk on either portal.** Every probe was anonymous. The ceremony itself — the
  frozen why on the designer side, the receipt and signature on the client side, the
  `viewer_role` gating — was never seen rendered by a logged-in eye in production. The proof
  that Wave 2 copy shipped is a string in the served chunk, not a rendered page.
- **The new RPC arguments were never exercised in prod.** No approval was created, superseded or
  responded to, so `p_why`, `clientConsentMethod` and `clientSignature` have not actually round-
  tripped through Strata. The signatures exist and the old ones are gone — that is all that is
  established. Deliberate: the brief forbade data mutations beyond the migration.
- **`viewer_role` was not probed.** `get_project_decision_reviews` was recreated, but its
  projection was not called with a real decision, so the iosb3-M2 fix (a studio co-member no
  longer seeing studio-wide approvals as the client) is unproven in prod.
- **The client receipt was not seen end-to-end.** No decision was resolved, so
  `decision-resolved-notify` has not run against the new schema in production.
- **Five of the six functions were verified only by version increment**, not by behavior. Only
  `decision-first-notice` got a live invocation probe. The `_shared/decision-notify.ts` and
  `_shared/project-approval-notification.ts` changes riding in the other five are unread in
  the wild.
- **No `wrangler tail`** on either portal, so a post-deploy error spike would not have been
  seen. `notification_log` was clean, but that covers mail, not Worker exceptions.
- **Custom-domain routing was not re-verified.** No `routes` exist in any `wrangler.jsonc`;
  `client.patina.cloud` and `app.patina.cloud` are dashboard-managed out of band. They answered
  correctly, which is evidence they are wired, not proof of their configuration.
- **iOS shipped nothing.** The Wave 2 iOS-C and iOS-D lanes are on main and build-green, but no
  TestFlight build was cut in this wave and none was cut here.
- **`apps/designer-portal/.env.local` is still pointed at the local stack.** It was deliberately
  left as the peer program set it. **Any future designer deploy from this checkout will hit the
  same preflight refusal** until that file is repointed or the same export is repeated. This is
  the one piece of state a later operator needs to know about.
- **The two peer `next dev` servers** (`agent-si-integration` worktree, ports 3000/3002) were
  left running and untouched.
- **The open findings carried onto the branch remain open** and shipped with it — the web
  stage-A/B and iOS-D items listed in §6 of the wave report, none of which blocked the merge.
- **Nothing was rolled back or half-applied.** Every step in the chain succeeded; there is no
  partial state to reconcile.
