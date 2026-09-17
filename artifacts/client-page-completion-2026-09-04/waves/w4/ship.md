# W4 — Ship: client-portal retirement cutover

Lane R4 (the ship). No-flag cutover, authorized by Kody in-session ("zero clients on the platform, cut
over as soon as you are ready"). Ship order per the W3 review's finding-2 ruling: **PORTAL FIRST**, probe,
then edge functions.

Skills loaded before any command: `patina-deploy`, `patina-edge-functions`, `patina-parallel-work`,
`patina-verification`.

---

## STEP 1 — Merge to main

```
$ git fetch origin
$ git rev-parse origin/main
d3f0947399f893d19d50cba240dcbb91be171bb7
$ git rev-parse origin/client-page-2/integration
4495f3f5bf26b55a4933133b8d6c0734d6fdbf3c

$ git worktree add /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-ship \
    -b client-page-2/ship origin/main
Preparing worktree (new branch 'client-page-2/ship')
branch 'client-page-2/ship' set up to track 'origin/main'.
HEAD is now at d3f094739 fix(ios): tour survives the push primer race; nameless designers are never "Client" (W0 D8c)

$ git rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-ship

$ git merge --no-ff -m "chore(client-page): merge integration — one-page client portal, old portal retired" \
    origin/client-page-2/integration
```

**Clean merge, no conflicts.** Husky accepted the `chore(...)` subject (never `merge(...)`, never
`--no-verify`).

```
$ git log --oneline -1
d95bb80a0 chore(client-page): merge integration — one-page client portal, old portal retired
$ git status --short
(empty)
```

### Migration checks

```
$ git ls-tree --name-only origin/main supabase/migrations/ | tail -3
supabase/migrations/00564_client_signoff_approval.sql
supabase/migrations/00565_the_client_page.sql
supabase/migrations/_pending

$ git diff --name-only origin/main...HEAD -- supabase/migrations
(empty)
```

`origin/main`'s migration head is **00565**; the merge adds **no** migration. Confirmed.

### Push and ancestry proof

```
$ git push origin HEAD:main
To github.com:Kodeman/PatinaBase.git
   d3f094739..d95bb80a0  HEAD -> main

$ git fetch origin && git merge-base --is-ancestor 4495f3f5b origin/main && echo YES
YES
$ git rev-parse origin/main
d95bb80a09d5c5b7ea2ba885509d3a588d095911
```

---

## STEP 2 — Main checkout

```
$ git status --short | grep -v '^??'
 M .claude/settings.json
 M CLAUDE.md
 M apps/mobile/Patina/Patina.xcodeproj/project.pbxproj
 M docs/design/the-document/screenshots/help-walkthrough/help-center.png
 M docs/design/the-document/screenshots/help-walkthrough/help-panel-orders.png
 M docs/design/the-document/screenshots/help-walkthrough/mobile-help-center.png
 M docs/design/the-document/screenshots/help-walkthrough/step-1-desk.png
 M docs/design/the-document/screenshots/help-walkthrough/step-4-drawer.png
 M docs/design/the-document/screenshots/help-walkthrough/welcome-modal.png
```

**No STOP condition.** None of the modified tracked files is under `apps/client-portal`,
`apps/designer-portal`, `packages/`, `supabase/`, or `docs/superpowers`. (The modified paths are
`docs/design/...` PNGs, a pbxproj, CLAUDE.md and settings.json — all outside the STOP set. They were
left untouched.)

### Untracked blockers

The first `git pull --ff-only` aborted:

```
error: The following untracked working tree files would be overwritten by merge:
	artifacts/client-page-completion-2026-09-04/waves/w1/l1-impl.md
	... (11 files under artifacts/client-page-completion-2026-09-04/waves/{w1,w2,w3})
```

Byte-identity check (`git hash-object` vs `git rev-parse origin/main:<path>`):

| File | Verdict |
|---|---|
| `w1/l3-impl.md`, `w1/l8-impl.md`, `w2/integrate.md`, `w2/r1.md`, `w2/residual.md`, `w3/integrate3.md` | **IDENTICAL** to incoming |
| `w1/l1-impl.md`, `w1/l2-impl.md`, `w1/l4-impl.md`, `w1/l9-impl.md` | DIFFER — local copies are **prefixes** of the incoming files (each local copy stops short of the appended "Fix round" section; 157–194 diff lines, all `<` additions on the incoming side) |
| `w2/review-integration.md` | DIFFERS — local copy carries a leading header block the committed version lacks (461 diff lines) |

**Action taken:** all 11 moved (not deleted) to
`$TMPDIR/cpc-untracked-backup-1788559186/artifacts/client-page-completion-2026-09-04/waves/...`
(`/tmp/claude-501/cpc-untracked-backup-1788559186`), so nothing was lost — including the five that
differed. Reported here per the brief; the five differing files are stale in-progress copies of the
committed reports, not new work.

```
$ git pull --ff-only origin main
$ git rev-parse HEAD
d95bb80a09d5c5b7ea2ba885509d3a588d095911
$ git merge-base --is-ancestor 4495f3f5b HEAD && echo YES
YES
```

---

## STEP 3 — Client portal (shipped FIRST)

### Type-check

First run failed with **17 `TS2307` errors, all inside `.next/types/validator.ts`** — a stale Next
route-type manifest in the main checkout, generated before this branch deleted those API routes
(`timeline/*`, `rooms/*`, `user/data-export`, `user/data-erase`). Zero errors in `src/`. No `next dev`
or `next start` process was running (`lsof -iTCP:3002 -sTCP:LISTEN` empty, `ps` empty), so the stale
`.next` was removed and the gate re-run:

```
$ rm -rf apps/client-portal/.next
$ pnpm --filter @patina/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```

**Clean.** (Matches the W3 gates report, which ran in a fresh worktree with no stale `.next`.)

### `wrangler.jsonc` end-state check

```
$ grep -n "NEXT_PUBLIC_FLAG_OVERRIDES" apps/client-portal/wrangler.jsonc
(no match, exit 1)
```

**No `NEXT_PUBLIC_FLAG_OVERRIDES` line.** End state holds — no STOP.

### Env exported

`deploy-portal.sh` was read in full. It requires only `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` to resolve (Phase 0 preflight,
fail-closed); it does **not** read `SUPABASE_SERVICE_ROLE_KEY`, so that was **not** exported.

All 18 `NEXT_PUBLIC_*` names were parsed out of the `vars` block (JSONC comments stripped
string-aware) and exported. **Names only:**

```
NEXT_PUBLIC_APP_URL                      NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES
NEXT_PUBLIC_EDGE_API_URL                 NEXT_PUBLIC_ENV
NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS      NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_ENABLE_ANALYTICS             NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_ENABLE_APPROVAL_THEATER      NEXT_PUBLIC_PROJECTS_API_URL
NEXT_PUBLIC_ENABLE_DEBUG                 NEXT_PUBLIC_QR_AUTH_URL
NEXT_PUBLIC_ENABLE_MEDIA_GALLERIES       NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_ENABLE_MILESTONE_CELEBRATIONS NEXT_PUBLIC_SUPABASE_STORAGE_KEY
NEXT_PUBLIC_ENABLE_NOTIFICATIONS         NEXT_PUBLIC_SUPABASE_URL
```

Pre-deploy assertions (no values printed): URL host contains `bkvcixdmuyejfzcijpdg` → **true**;
`NEXT_PUBLIC_SUPABASE_STORAGE_KEY` equals the canonical `sb-bkvcixdmuyejfzcijpdg-auth-token` →
**true**; all three preflight-critical vars non-empty.

### BEFORE / AFTER deployment ids

`npx wrangler deployments list --name patina-client-portal` (oldest-first — **bottom** row):

| | Version id | Created |
|---|---|---|
| **BEFORE (rollback target)** | `2571a241-84f7-4550-ab3a-6175aa13802d` | 2026-09-04T13:43:19.054Z |
| **AFTER (live now)** | `ef001b34-02e2-4b04-8431-5a9b33f1ff7b` | 2026-09-04T22:02:33.159Z |

BEFORE matches the expected rollback id from the brief exactly.

### Deploy

```
$ set -a && . "$TMPDIR/cpc-client-env.sh" && set +a
$ ./infra/deploy-portal.sh client
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
==> [1/3] Building workspace dependencies via Turborepo
 Tasks:    8 successful, 8 total
==> [2/3] Building OpenNext bundle for the client portal
==> [2.5/3] handler.mjs size: 8164177 bytes
==> [3/3] Deploying the client portal to Cloudflare Workers
Total Upload: 12087.71 KiB / gzip: 2457.70 KiB
Uploaded patina-client-portal (24.05 sec)
Deployed patina-client-portal triggers (0.75 sec)
  https://patina-client-portal.kody-be3.workers.dev
Current Version ID: ef001b34-02e2-4b04-8431-5a9b33f1ff7b
==> Done: client portal deployed to production.
```

Exit 0. Phase 1 (the stale-dist guard) ran — 8/8 turbo tasks. Handler 8.16 MB, well under the 55 MiB
gate.

### Served-chunk proof (the deploy-placeholder lesson)

Chunks located in the **fresh** `.open-next/assets`, then fetched from prod and grepped on the **served
bytes** (files written by curl, greps run against those files — not against the local build):

```
200  common-b526308ec0d43f9c.js          -> 952345 bytes served
200  app/layout-1fa0a7f59bf941bc.js      ->   2598 bytes served
200  app/page-cedbf8b067cb11e3.js        ->   1989 bytes served
```

| String | Required | Served bytes |
|---|---|---|
| `Leave the house` | MUST be present | **PRESENT** — `app/page-cedbf8b067cb11e3.js`, `common-b526308ec0d43f9c.js` |
| `get_client_project_threshold` | MUST be present | **PRESENT** — `common-b526308ec0d43f9c.js` |
| `threshold:false` | MUST be absent | **ABSENT** |
| `single-pane` | MUST be absent | **ABSENT** |
| `client-header` | MUST be absent | **ABSENT** |

All five conditions hold on the bytes Cloudflare actually served.

### Probes (curl, signed out)

| Path | Status | Location | Cache-Control |
|---|---|---|---|
| `/` | **307** | `/auth/signin?callbackUrl=%2F` | — |
| `/today` | **307** | `/auth/signin?callbackUrl=%2Ftoday` | — |
| `/invoices` | **307** | `/auth/signin?callbackUrl=%2Finvoices` | — |
| `/preferences/unsubscribe?token=x` | **200** | — | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/api/version` | **200** | — | `no-store` |
| `/projects/anything` | **307** | `/auth/signin?callbackUrl=%2Fprojects%2Fanything` | — |
| `/decisions/abc123` | **307** | `/auth/signin?callbackUrl=%2Fdecisions%2Fabc123` | — |
| `/messages` | **307** | `/auth/signin?callbackUrl=%2Fmessages` | — |
| `/auth/signin` | **200** | — | — |

**What a signed-out visitor gets, and why that is acceptable.** Middleware answers the sign-in gate
*before* the retirement fold, so `/today` and `/invoices` return **307 → `/auth/signin`**, not the
308 → `#doorstep` / `#letterbox` fold. That is by design and harmless: the original path rides along
in `callbackUrl`, so the fold applies after sign-in. **I did not observe a 308 fold in prod**; the
308 map is covered by the W3 gates' middleware unit tests and the thirteen-path e2e loop (each
asserting `private`), not by anything I ran against production.

The one live signal that *does* prove the new map is on this worker:
`/preferences/unsubscribe?token=x` returns **200 signed out**. On the pre-cutover worker that path
was authenticated and would have 307'd to sign-in. The retirement branch is what makes it public.

`/api/version` body: `{"service":"client-portal","version":"0.0.0","gitSha":"unknown","buildTime":null}`
— static defaults, liveness only, **not** deploy-freshness evidence (per patina-deploy).

### `wrangler tail` (~60 s under load)

`npx wrangler tail patina-client-portal --format pretty`, three passes over `/`, `/auth/signin`,
`/today`, `/projects/x`, `/api/version`, `/preferences/unsubscribe?token=x`:

```
Successfully created tail, expires at 2026-09-05T04:03:26Z
Connected to patina-client-portal, waiting for logs...
GET https://client.patina.cloud/ - Ok @ 9/4/2026, 5:03:36 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2F - Ok @ 9/4/2026, 5:03:37 PM
GET https://client.patina.cloud/auth/signin - Ok @ 9/4/2026, 5:03:37 PM
GET https://client.patina.cloud/today - Ok @ 9/4/2026, 5:03:37 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Ftoday - Ok @ 9/4/2026, 5:03:38 PM
GET https://client.patina.cloud/projects/x - Ok @ 9/4/2026, 5:03:39 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Fprojects%2Fx - Ok @ 9/4/2026, 5:03:39 PM
GET https://client.patina.cloud/api/version - Ok @ 9/4/2026, 5:03:39 PM
GET https://client.patina.cloud/preferences/unsubscribe?token=x - Ok @ 9/4/2026, 5:03:40 PM
GET https://client.patina.cloud/ - Ok @ 9/4/2026, 5:03:49 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2F - Ok @ 9/4/2026, 5:03:49 PM
GET https://client.patina.cloud/auth/signin - Ok @ 9/4/2026, 5:03:50 PM
GET https://client.patina.cloud/today - Ok @ 9/4/2026, 5:03:50 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Ftoday - Ok @ 9/4/2026, 5:03:50 PM
GET https://client.patina.cloud/projects/x - Ok @ 9/4/2026, 5:03:51 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Fprojects%2Fx - Ok @ 9/4/2026, 5:03:51 PM
GET https://client.patina.cloud/api/version - Ok @ 9/4/2026, 5:03:51 PM
GET https://client.patina.cloud/preferences/unsubscribe?token=x - Ok @ 9/4/2026, 5:03:51 PM
GET https://client.patina.cloud/ - Ok @ 9/4/2026, 5:03:59 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2F - Ok @ 9/4/2026, 5:03:59 PM
GET https://client.patina.cloud/auth/signin - Ok @ 9/4/2026, 5:04:00 PM
GET https://client.patina.cloud/today - Ok @ 9/4/2026, 5:04:00 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Ftoday - Ok @ 9/4/2026, 5:04:00 PM
GET https://client.patina.cloud/projects/x - Ok @ 9/4/2026, 5:04:00 PM
GET https://client.patina.cloud/auth/signin?callbackUrl=%2Fprojects%2Fx - Ok @ 9/4/2026, 5:04:00 PM
GET https://client.patina.cloud/api/version - Ok @ 9/4/2026, 5:04:01 PM
GET https://client.patina.cloud/preferences/unsubscribe?token=x - Ok @ 9/4/2026, 5:04:02 PM
```

**27 requests, all `Ok`. Zero error lines, zero exceptions, zero `Error` events.**

---

## STEP 4 — Edge functions (Strata, linked `bkvcixdmuyejfzcijpdg`)

```
$ git log --oneline -1 26b15145e
26b15145e chore(client-page): merge hotfix — /projects collapse

$ git diff --name-only 26b15145e...HEAD -- supabase/functions
supabase/functions/_shared/client-portal-links.test.ts
supabase/functions/_shared/client-portal-links.ts
supabase/functions/_shared/send-email.test.ts
supabase/functions/commercial-document-notify/core.test.ts
supabase/functions/commercial-document-notify/index.ts
supabase/functions/comms-mute/index.ts
supabase/functions/comms-notification-dispatch/index.ts
supabase/functions/create-checkout-session/index.ts
supabase/functions/create-checkout-session/invoice-checkout-core.test.ts
supabase/functions/create-checkout-session/invoice-checkout-core.ts
supabase/functions/notification-digest/index.ts
supabase/functions/notification-digest/logic.test.ts
supabase/functions/review-requests/index.ts
supabase/functions/stripe-webhook/index.ts
```

### `_shared` fan-out

One non-test `_shared` change: **`_shared/client-portal-links.ts`** (new module).
`_shared/send-email.ts` itself is **unchanged** (`git diff --stat` empty — only its `.test.ts` moved),
so no fan-out from the email chokepoint.

```
$ grep -rl "_shared/client-portal-links" supabase/functions --include=index.ts | sort
supabase/functions/commercial-document-notify/index.ts
supabase/functions/comms-notification-dispatch/index.ts
supabase/functions/create-checkout-session/index.ts
supabase/functions/notification-digest/index.ts
supabase/functions/review-requests/index.ts
supabase/functions/stripe-webhook/index.ts
```

All six importers were **already** in the changed-directory list. `comms-mute` changed directly but
imports no changed shared module. **Deploy set = 7 functions**, no extra fan-out beyond them.

### Deployed

`verify_jwt = false` in `config.toml` for `stripe-webhook` and `comms-mute` → those two carried
`--no-verify-jwt`. All others deploy at the platform default.

| # | Command | Result |
|---|---|---|
| 1 | `supabase functions deploy create-checkout-session` | `Deployed Functions.` (1.1 MB) exit 0 |
| 2 | `supabase functions deploy stripe-webhook --no-verify-jwt` | `Deployed Functions.` (1.2 MB) exit 0 |
| 3 | `supabase functions deploy notification-digest` | `Deployed Functions.` (152 kB) exit 0 |
| 4 | `supabase functions deploy comms-notification-dispatch` | `Deployed Functions.` (157 kB) exit 0 |
| 5 | `supabase functions deploy review-requests` | `Deployed Functions.` (76 kB) exit 0 |
| 6 | `supabase functions deploy commercial-document-notify` | `Deployed Functions.` (162 kB) exit 0 |
| 7 | `supabase functions deploy comms-mute --no-verify-jwt` | `Deployed Functions.` (151 kB) exit 0 |

Every response: `{"project_ref":"bkvcixdmuyejfzcijpdg", ... ,"message":"Deployed Functions."}`.

### Liveness probes

`curl -s -o /dev/null -w '%{http_code}' https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/<name>`

| Function | Code |
|---|---|
| create-checkout-session | 401 |
| stripe-webhook | 405 |
| notification-digest | 401 |
| comms-notification-dispatch | 401 |
| review-requests | 401 |
| commercial-document-notify | 401 |
| comms-mute | 400 |

All 401/405/400 as expected — **no 5xx**. The 401s prove `verify_jwt` is still on for the five that
should have it; `stripe-webhook`'s 405 (method not allowed on GET) and `comms-mute`'s 400 (missing
signed token) prove those two are reachable un-JWT'd, as intended.

`create-checkout-session`'s correctness rests on the deploy output plus the W3 gates' deno results
(`invoice-checkout-core.test.ts` including the 2 new fragment assertions; 44/44 across the touched
functions). Reading deployed source back is not possible from the CLI.

No `deno.lock` appeared at the repo root (checked: `No such file or directory`).

---

## STEP 5 — Designer portal: NOT DEPLOYED (correctly skipped)

```
$ git diff --name-only 26b15145e...HEAD -- apps/designer-portal
(empty)
```

**Zero designer-portal files changed** → per the brief, no deploy.

Two `packages/` files did change, and neither forces a designer ship:

- `packages/notifications/src/tokens.ts` — **comment-only** (a doc block on `generateUnsubscribeUrl`
  warning that `baseUrl` must be a portal still serving `/preferences`). No behavior change.
- `packages/supabase/src/hooks/use-direct-orders.ts` — additive: an optional `project_id?: string | null`
  field on the `DirectOrder` interface and `staleTime: 30_000` on `useDirectOrders()`.
  `grep -rn "useDirectOrders|use-direct-orders" apps/designer-portal/src` → **zero hits**; the designer
  portal does not consume this hook at all.

Portals resolve workspace packages at build time (`deploy-portal.sh` Phase 1 rebuilds the dists), so
the designer worker will pick both up on its next ship for any other reason. Nothing is broken in the
meantime.

`apps/mobile/Patina` also changed (26 Swift files, R1's `client.patina.cloud` route literals). That is
a TestFlight build Kody owns — **not shippable from this lane**.

---

## STEP 6 — Prod object probes (read-only, `supabase db query --linked`)

```
$ supabase db query --linked "select count(*) from public.project_notes;"
rows: [ { "count": 0 } ]

$ supabase db query --linked "select has_function_privilege('authenticated','public.get_client_project_threshold(uuid)','execute');"
rows: [ { "has_function_privilege": true } ]
```

- `public.project_notes` **exists** (query succeeded); 0 rows — expected, no clients on the platform.
- `authenticated` **has EXECUTE** on `public.get_client_project_threshold(uuid)` → **t**.

```
$ supabase migration list --linked | tail -6
... {"local":"00562","remote":"00562"},{"local":"00563","remote":"00563"},
    {"local":"00564","remote":"00564"},{"local":"00565","remote":"00565"}
```

**00565 applied on Strata; every local number has a matching remote; nothing pending.** No
`supabase db push` was run in this lane (the branch adds no migration).

---

## STEP 7 — Retire worktrees

Every branch confirmed merged **before** removal (`git merge-base --is-ancestor <branch> origin/main`):

```
ANCESTOR-OF-MAIN  client-page-2/integration
ANCESTOR-OF-MAIN  client-page-2/l1 … l9        (9 branches)
ANCESTOR-OF-MAIN  client-page-2/r1
ANCESTOR-OF-MAIN  client-page-2/r2a
ANCESTOR-OF-MAIN  client-page-2/r2b
ANCESTOR-OF-MAIN  client-page-2/r3
ANCESTOR-OF-MAIN  client-page-2/ship
```

15 of 15 are ancestors of `origin/main`.

### Removed

`git worktree unlock` (no-op — none was locked) then `git worktree remove --force`, one per lane:

```
REMOVED       .codex/worktrees/agent-cpc-int
REMOVED       .codex/worktrees/agent-cpc-l1
REMOVED       .codex/worktrees/agent-cpc-l2
REMOVED       .codex/worktrees/agent-cpc-l3
REMOVED       .codex/worktrees/agent-cpc-l4
REMOVED       .codex/worktrees/agent-cpc-l5
REMOVED       .codex/worktrees/agent-cpc-l6
REMOVED       .codex/worktrees/agent-cpc-l7
REMOVED       .codex/worktrees/agent-cpc-l8
REMOVED       .codex/worktrees/agent-cpc-l9
REMOVED       .codex/worktrees/agent-cpc-r1
REMOVED       .codex/worktrees/agent-cpc-r2a
REMOVED       .codex/worktrees/agent-cpc-r2b
REMOVED       .codex/worktrees/agent-cpc-r3
REMOVED       .codex/worktrees/agent-cpc-ship
```

15 of 15. No `REMOVE-FAILED`, no `MISSING`.

### Local branches deleted (remotes kept)

```
Deleted branch client-page-2/integration (was 4495f3f5b).
Deleted branch client-page-2/l1  (was 7dc29fa0e).
Deleted branch client-page-2/l2  (was 8d14bfb69).
Deleted branch client-page-2/l3  (was 3f7f21896).
Deleted branch client-page-2/l4  (was 87badbaa0).
Deleted branch client-page-2/l5  (was 3543e0717).
Deleted branch client-page-2/l6  (was 1ead8fca0).
Deleted branch client-page-2/l7  (was 42bd456c9).
Deleted branch client-page-2/l8  (was 2bf23a0a8).
Deleted branch client-page-2/l9  (was 373d4a834).
Deleted branch client-page-2/r1  (was 33708cf07).
Deleted branch client-page-2/r2a (was 923c0e935).
Deleted branch client-page-2/r2b (was f1bfe7c0f).
Deleted branch client-page-2/r3  (was a2c0ecbac).
Deleted branch client-page-2/ship (was d95bb80a0).
```

All 14 `origin/client-page-2/*` remotes are preserved (`git branch -r --list` confirms; the local-only
`ship` branch had no remote and needed none — its merge is on `main`).

### Final state

```
$ git worktree list
/Users/kody/Code/patina-merged  d95bb80a0 [main]

$ git branch --list 'client-page-2/*'
(none)

$ ls -d .codex/worktrees/agent-cpc-*
zsh: no matches found
```

**Only the main checkout remains.**

### `scripts/repo-gc.sh` (dry run)

```
=== summary (DRY RUN) ===
worktrees:     0 removable, 0 kept
artifact dirs: 33
estimated size: 8.3G
(dry run — pass --apply to actually remove any of the above)
```

**0 removable worktrees** — the sweep confirms nothing was left behind. The 33 artifact dirs / 8.3 GB
are ordinary local build output in the main checkout (`.next` ×3, `.open-next` ×3, `.turbo` ×26,
Capture `.build`). **I did not run `--apply`** — `apps/client-portal/.open-next` holds the freshly
built chunks this report's served-chunk proof is keyed to, and the rest is Kody's local build cache,
not this lane's to clear.

---

## What I did NOT verify

1. **A signed-in prod walk cannot be automated from this lane.** Nothing here proves what a real
   homeowner sees behind auth: the Threshold rendering, the doorplate, "Your other houses", the
   letterbox receipt, the door, or any act performed in place. **Kody's walks are still owed** —
   `kody.kochaver+testwalker@gmail.com` (solo), `+thekodys@gmail.com` (two houses),
   `kody@kochaver.com` (composer).
2. **The 308 retirement fold was not observed in production.** Signed out, middleware's auth gate
   answers first (307 → `/auth/signin?callbackUrl=…`). The fold, its anchors and the
   `private, max-age=3600` header are covered only by the W3 middleware unit tests and the
   thirteen-path e2e loop, not by any probe I ran against prod.
3. **No real Stripe Checkout return was probed.** The plan's R4 asks for one after the functions ship;
   it needs a signed-in session and a live payment method. Kody's walk covers it. Until then,
   `create-checkout-session`'s new `?checkout=` / `#letterbox` / `#road` return URLs are proven only by
   deno unit tests and a clean deploy.
4. **No email, digest, SMS or cron side effect was triggered.** `notification-digest`,
   `comms-notification-dispatch`, `review-requests`, `commercial-document-notify` and `comms-mute` were
   probed for liveness only — no message was sent and no `notification_log` row was inspected.
5. **Custom-domain routing was not re-verified.** No `routes` block exists in any `wrangler.jsonc`;
   `client.patina.cloud` is dashboard-managed out of band. It answered every probe, so it is pointing at
   the right worker, but I did not inspect the binding.
6. **`/api/version` proves nothing about freshness** — it returns the static fallback defaults
   (`0.0.0` / `unknown` / `null`). Deploy freshness rests on the `wrangler deployments list` bottom row
   and the served-chunk grep.
7. **Local gates were not re-run in this lane.** Client jest/coverage, e2e, eslint, deno and the DB
   suite are the W3 gates report's evidence (1514/1515 jest with one recorded pre-existing failure;
   coverage 71.31/66.08/71.42/73.46 over the 70/60/70/70 floor; 27/2 e2e with two recorded pre-existing
   guest-link fixture failures). I re-ran only `type-check`.
8. **PostHog flags `threshold` (866364) and `single-pane` (803059) are NOT archived.** Per the plan,
   Kody archives them **only after a clean walk**. Archiving is one-way in practice — it removes the
   rollback target.

## Rollback, if the walk goes badly

Portal-only rollback is **not sufficient** (plan Risks, W3 review §6). Rolling back requires, in the
same minute:

- `wrangler rollback` the client portal to **`2571a241-84f7-4550-ab3a-6175aa13802d`**, AND
- redeploying the **prior** versions of all seven functions above — they now emit
  `/projects/<id>?invoice=…&checkout=success#letterbox`, `…#road`, `…#approval-<id>`, `/#mat`, none of
  which the pre-cutover portal reads.

Cached 308 folds outlive a rollback by up to an hour (`private, max-age=3600`) — degraded,
self-clearing, bounded.
