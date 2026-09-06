# Studio invoices — production deploy report ("an invoice with no house")

**Steward:** ship steward · **Date:** 2026-09-06 (UTC) · **Authorization:** Kody's in-session
order 2026-09-05, "Build and ship the whole program to prod" — authorizes the full chain
(merge → migration → edge functions → portals → smoke) without per-step re-ask.

**Targets:** Supabase project **Strata** (`bkvcixdmuyejfzcijpdg`) and **Cloudflare Workers**
(`patina-designer-portal`, `patina-client-portal`). The retired Coolify box was not touched;
no legacy artifact was run.

**Source:** `studio-invoices/integration` @ `49b09f1fa` (two docs-only commits past the brief's
`e6ef1b821`; `git diff --name-only e6ef1b821 49b09f1fa | grep -v '^artifacts/'` → empty).
Release judgment 2 verdict: **ship**.

**Order run:** merge+push → migration `00571` → 20 edge functions → designer portal →
client portal → smoke. The order is schema-forced: the functions select `studio_id, title`,
which do not exist until `00571` lands.

---

## 1. Merge to main

Pre-existing dirty paths in the main checkout were noted and left untouched
(`.claude/settings.json`, `CLAUDE.md`, `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`,
six `docs/design/.../help-walkthrough/*.png`, plus untracked artifact dirs). None were staged.

```
$ git -C /Users/kody/Code/patina-merged fetch origin main
  * branch main -> FETCH_HEAD
$ git rev-parse origin/main → 7d7a8ef2b5745225886c043be7f4df0812dd93b9
$ git rev-parse HEAD        → 7d7a8ef2b5745225886c043be7f4df0812dd93b9   (equal — main had not moved)
$ git diff --name-only origin/main 49b09f1fa | grep -v '^artifacts/' | wc -l → 63
$ git diff --name-only origin/main 49b09f1fa | grep supabase/migrations
  supabase/migrations/00571_studio_invoices.sql        (exactly one migration)
```

`git merge --no-ff` with the `merge(...)` subject was **rejected by husky** (Conventional
Commits gate), as the brief anticipated. The merge was completed with the fallback subject:

```
$ git merge --no-ff --no-autostash studio-invoices/integration -m "merge(studio-invoices): …"
  [BLOCK] Commit subject must use Conventional Commits …
  husky - commit-msg script failed (code 1)
  Not committing merge; use 'git commit' to complete the merge.
$ git diff --cached --name-only | grep -v '^artifacts/' | wc -l → 63   (only the program's files staged)
$ git commit -m "feat(studio-invoices): merge integration — studio invoices, an invoice with no house"
  [main 75b0c2840]
```

The commit hook reported advisory Prettier drift in 54 files (`[WARN] … advisory locally`) —
pre-existing, program-wide, non-blocking.

```
$ git push origin main
  To github.com:Kodeman/PatinaBase.git
     7d7a8ef2b..75b0c2840  main -> main            (pre-push hook ran the portal/deno suites; passed)
$ git push origin studio-invoices/integration
  * [new branch]  studio-invoices/integration -> studio-invoices/integration
```

**mainSha = `75b0c28404382a15cb81699bec92f3fff2e6d9a9`.**

---

## 2. Migration → Strata

### Pre-flight (read-only)

```
$ supabase --workdir /Users/kody/Code/patina-merged migration list --linked
  … {"local":"00568","remote":"00568"},{"local":"00569","remote":"00569"},{"local":"00571","remote":""}
```

Every local migration through `00569` is applied remotely; **exactly one pending: `00571`**.
No remote-only row (no peer migration missing locally) — `db push` was the correct path.

### Push

```
$ supabase --workdir /Users/kody/Code/patina-merged db push
  Applying migration 00571_studio_invoices.sql...
  {"upToDate":false,"dryRun":false,"migrations":["00571_studio_invoices.sql"],
   "seeds":[],"roles":[],"message":"Finished supabase db push."}
```

The judge's F11 note (non-CONCURRENT `idx_invoices_client` inside the migration's transaction,
a brief lock on a small `invoices` table) produced no observable stall; the push completed in
one pass with no lock error.

### Object probes (post-push)

```
$ supabase db query --linked "select … from information_schema.columns / pg_constraint / pg_class"
  {"cols":"project_id=YES, title=YES","anchor_ct":1,"idx_ct":1}

$ supabase db query --linked "select p.oid::regprocedure, EXECUTE grantees from pg_proc/aclexplode"
  create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)  → authenticated,postgres
  resolve_studio_identity(uuid,uuid,uuid)                                 → anon,authenticated,postgres,service_role

$ supabase db query --linked "select policyname, cmd, roles from pg_policies where policyname like '%household%'"
  invoice_line_items_household_select  SELECT {authenticated}
  invoice_payments_household_select    SELECT {authenticated}
  invoices_household_select            SELECT {authenticated}
```

- `invoices.title` exists; `invoices.project_id` is **nullable**; `chk_invoices_anchor` exists.
- `create_draft_studio_invoice` has EXECUTE for **authenticated** and the owner only — **not
  anon**, not service_role.
- `resolve_studio_identity` has the **3-arg** signature and **zero** 2-arg rows (the old
  signature is gone; no duplicate arity).
- The three household SELECT policies exist, all `TO authenticated`.

---

## 3. Edge functions — the 20

Deployed by name, sequentially, from the main checkout at `75b0c2840`, **after** the migration.
Every call returned `"message":"Deployed Functions."`. Before-versions captured first
(`supabase functions list --project-ref bkvcixdmuyejfzcijpdg`; 81 functions on Strata).

| function | before | after | verify_jwt | status |
|---|---:|---:|---|---|
| client-invite | 40 | **41** | true | ACTIVE |
| commercial-document-notify | 22 | **23** | true | ACTIVE |
| create-checkout-session | 44 | **45** | true | ACTIVE |
| decision-first-notice | 2 | **3** | true | ACTIVE |
| decision-reminders | 43 | **44** | true | ACTIVE |
| decision-resolved-notify | 43 | **44** | true | ACTIVE |
| expire-decisions | 43 | **44** | true | ACTIVE |
| invoice-check-intent | 19 | **20** | true | ACTIVE |
| invoice-reminders | 43 | **44** | true | ACTIVE |
| invoice-send | 44 | **45** | true | ACTIVE |
| notification-digest | 40 | 40 | true | ACTIVE — see note |
| notification-dispatch | 42 | **43** | true | ACTIVE |
| po-send | 45 | **46** | true | ACTIVE |
| proposal-nudge | 40 | **41** | true | ACTIVE |
| proposal-sign-confirmation | 37 | **38** | true | ACTIVE |
| quote-request-send | 38 | **39** | true | ACTIVE |
| review-requests | 39 | **40** | true | ACTIVE |
| spec-pdf | 36 | **37** | true | ACTIVE |
| **stripe-webhook** | 48 | **49** | **false** | ACTIVE |
| trade-rfq-send | 19 | **20** | true | ACTIVE |

`stripe-webhook` kept `verify_jwt = false` from `config.toml` (confirmed in the post-deploy
`functions list`); no function was deployed with `--no-verify-jwt`, and every other one stayed
`true`.

**`notification-digest` note (not a failure).** The CLI printed
`No change found in Function: notification-digest` and the version stayed at 40 — the CLI's own
bundle comparison found the deployed artifact byte-identical to this tree's. That is the
expected result: `notification-digest` reaches this program's deploy set only through
`_shared/project-approval-notification.ts`, which `git diff --stat 7d7a8ef2b 75b0c2840 --
supabase/functions/` shows is **not** in the program's edge diff (the 14 changed edge files are
the three `_shared` invoice modules + their tests, `_tests/stripe-rail.test.ts`,
`create-checkout-session/*`, `invoice-check-intent`, `invoice-reminders`, `invoice-send`,
`stripe-webhook`). Its live copy already equals main's.

---

## 4. Portals

### Gates (both run in the main checkout at `75b0c2840`)

```
$ pnpm --filter @patina/designer-portal type-check   → exit 0
$ pnpm --filter @patina/client-portal  type-check    → FIRST RUN FAILED:
    .next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: … } | undefined'
      does not satisfy the constraint 'PageProps'.
```

The same stale-generated-shim trap the approvals W1 and W2 deploys hit. Not a source defect:
`apps/client-portal/.gitignore:10:/.next/` — the file is gitignored build output, and
`tsconfig.json` includes `.next/types/**/*.ts`. Ports 3000–3003 were checked first
(`lsof -nP -iTCP:3000-3003 -sTCP:LISTEN`) — **no dev server was listening anywhere**, so the
"never build over a live `next dev`" hazard did not apply and nothing was killed.

```
$ rm -rf apps/client-portal/.next/types
$ pnpm --filter @patina/client-portal type-check     → exit 0
$ pnpm --filter @patina/designer-portal type-check   → exit 0
```

No source file was modified.

### Rollback set captured before deploying (bottom row = live)

```
$ npx wrangler deployments list --name patina-designer-portal   (oldest-first; bottom row)
  Created: 2026-09-05T23:20:29.437Z   Version(s): (100%) c0937064-91c1-45b5-9187-48dd976e09c7
$ npx wrangler deployments list --name patina-client-portal
  Created: 2026-09-05T23:17:01.869Z   Version(s): (100%) c64e78bc-32e0-4896-86d9-d781a96f6b37
```

Both are the approvals W2 deploys named by the release judge — still live at ship time.

### Designer portal — the env export recipe (reused from the approvals W2 report)

`apps/designer-portal/.env.local` is still pointed at the local stack (the peer program's walk
setup; the W2 report flagged this as the one piece of state a later operator must know). The
`.env.local` file was **not read, edited or touched**. The build was compiled against the
committed prod literals instead, which is the script's own sanctioned override
(`resolve_next_public_var`: "1) An exported process.env value wins").

All **16** `vars` from `apps/designer-portal/wrangler.jsonc` were written to a `chmod 600`
scratchpad file, sourced into the deploy shell for this single invocation, and the file deleted
immediately after. No value was printed. Resolved (non-secret) values confirmed before the
build, and echoed back by wrangler's own upload summary:

```
NEXT_PUBLIC_SUPABASE_URL         = https://bkvcixdmuyejfzcijpdg.supabase.co
NEXT_PUBLIC_ENV                  = production
NEXT_PUBLIC_SUPABASE_STORAGE_KEY = sb-bkvcixdmuyejfzcijpdg-auth-token
NEXT_PUBLIC_SUPABASE_ANON_KEY    (length 208, matches wrangler.jsonc)
SUPABASE_ORIGIN_RUNTIME          = https://api.patina.cloud   (the sanctioned designer-prod carve-out)
```

```
$ ./infra/deploy-portal.sh designer          # THE ONLY portal deploy path
  Uploaded patina-designer-portal (19.71 sec)
  Deployed patina-designer-portal triggers (1.07 sec)
    https://patina-designer-portal.kody-be3.workers.dev
  Current Version ID: fb8354db-b3b2-4324-9705-4f17dbd8bfe3
  ==> Done: designer portal deployed to production.
```

Start `2026-09-06T03:05:37Z` → done `03:07:04Z`. Two benign warnings, both present on every
prior designer deploy: the multiple-environments notice (top-level environment targeted) and
esbuild's `direct-eval` note on `handler.mjs`.

### Client portal

The same recipe was used for determinism: the **21** `vars` from
`apps/client-portal/wrangler.jsonc` exported from a `chmod 600` scratchpad file, deleted after.
Resolved `NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co`,
`NEXT_PUBLIC_ENV=production`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token`
(anon length 208). The storage key the memory warns about was therefore always present — the
preflight did not refuse.

```
$ ./infra/deploy-portal.sh client
  Uploaded patina-client-portal (12.44 sec)
  Deployed patina-client-portal triggers (0.76 sec)
    https://patina-client-portal.kody-be3.workers.dev
  Current Version ID: ddd88b00-1b7e-49c3-a03a-119c146f8b2d
  ==> Done: client portal deployed to production.
```

Start `2026-09-06T03:07:21Z` → done `03:08:30Z`.

### Post-deploy deployment lists (bottom row)

```
patina-designer-portal  Created: 2026-09-06T03:07:02.798Z  (100%) fb8354db-b3b2-4324-9705-4f17dbd8bfe3
patina-client-portal    Created: 2026-09-06T03:08:28.793Z  (100%) ddd88b00-1b7e-49c3-a03a-119c146f8b2d
```

Both bottom rows are newer than their deploy starts and match the script's `Current Version ID`.

---

## 5. Smoke (read-only — no prod row created, no live Stripe exercised)

**Liveness.** (`/api/version` returns static defaults on the live path — liveness only, never
freshness.)

```
$ curl -s https://patina-designer-portal.kody-be3.workers.dev/api/version
  HTTP 200  {"service":"designer-portal","version":"0.0.0","gitSha":"unknown","buildTime":null}
$ curl -s https://patina-client-portal.kody-be3.workers.dev/api/version
  HTTP 200  {"service":"client-portal","version":"0.0.0","gitSha":"unknown","buildTime":null}
$ curl -sI https://app.patina.cloud/        → HTTP 200
$ curl -sI https://client.patina.cloud/     → HTTP 307 → /auth/signin?callbackUrl=%2F
```

**The new composer is on the served designer bundle.** The literal at
`invoice-composer.tsx:459` is minified with `·` escaped as `\xb7`:

```
$ grep -rl "no house" apps/designer-portal/.open-next/assets/_next/static
  .open-next/assets/_next/static/chunks/2435-066dde2edbc331cd.js
$ curl -s https://app.patina.cloud/_next/static/chunks/2435-066dde2edbc331cd.js
  HTTP 200  bytes=190692
  …hildren:"the studio \xb7 no house"}),ep.map(e=>(…      (1 match)
```

**The houseless front door is on the served client bundle — and approvals W2 is intact.**

```
$ curl -s https://client.patina.cloud/_next/static/chunks/common-a57ad1fa4044ab29.js
  HTTP 200  bytes=970271
  …children:"From the studio \xb7 not for a house"}…        (1 match — this program)
  …has your signature…                                       (1 match — approvals W2, not regressed)
```

**`wrangler tail patina-designer-portal --format json`, ~60 s, while loading the pages:**

```
$ (3 × /desk, 3 × /)   → desk HTTP 307 (anonymous → signin), root HTTP 200
parsed events: 6 · non-ok/exception events: 0 · logs at level error: 0
statuses: {307: 3, 200: 3}
every event carries scriptVersion.id = fb8354db-b3b2-4324-9705-4f17dbd8bfe3   (the new deploy is what served them)
```

No error spike.

**DB objects re-probed after the portal deploys (read-only):**

```
title_col=1 · project_id_nullable=YES · anchor=1 · draft_rpc=1 ·
resolve_studio_identity 3-arg=1, 2-arg=0 · household_policies=3 · ledger_head=00571
```

**`supabase functions list`** shows the new versions above (19 incremented, `notification-digest`
byte-identical at 40, `stripe-webhook` at 49 with `verify_jwt=false`).

---

## 6. Flag — NOT created (dark by design)

The designer surface is fail-closed behind `useFeatureFlag('studio-invoice')`
(`invoice-composer.tsx:114`; hook default `{ value: false, isLoading: true }`), and prod
`wrangler.jsonc` carries no `NEXT_PUBLIC_FLAG_OVERRIDES` at top level. The PostHog MCP server
exposes only `authenticate` / `complete_authentication` in this session — **no flag-creation
tool is available and authenticated**, so the flag was not created. It is owed to Kody with
exact steps (§7).

---

## 7. Rollback

- **Workers** (redeploy-prior-good; `wrangler rollback` is not documented in-repo):
  designer → `c0937064-91c1-45b5-9187-48dd976e09c7`; client → `c64e78bc-32e0-4896-86d9-d781a96f6b37`.
- **Edge functions:** redeploy the 20 from a checkout at `7d7a8ef2b` (the before-versions are
  the table in §3).
- **Migration:** `title`, nullable `project_id`, `chk_invoices_anchor`, `idx_invoices_client`
  and the three policies are additive and droppable. Bodies restorable: the trigger from
  `00511:2616` + definition `00511:3076` (drop `title` from `UPDATE OF`, re-pin the contract
  hash to `3ce8183f…`); `apply_invoice_payment_effects` from `00277:128`;
  `resolve_studio_identity` = DROP the 3-arg and recreate from `00320:27`.
  **`NOT NULL` cannot be re-added once a `project_id IS NULL` row exists** — void such rows
  first or leave `project_id` nullable.
- **Instant lever:** disable the PostHog flag (once it exists), or set
  `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:false` in the designer `wrangler.jsonc` vars and
  redeploy.

---

## 8. Owed to Kody

1. **Create PostHog flag `studio-invoice`** (designer-portal project, key
   `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`): create it **disabled**, note "target
   Middle West Studio", then **verify it against `/flags` with a real-browser UA BEFORE
   enabling** (the `threshold` flag matched everyone on 2026-09-04), then enable for Middle West.
   Until it exists the designer composer option is dark and the client side is inert (no studio
   invoice can exist).
2. **Signed-in prod walk as a two-studio designer (Middle West):** draw from each studio, issue,
   confirm the letterhead and number series, record a check, confirm the `designer_earnings` row
   with `project_id` NULL. No signed-in walk was performed here — every probe was anonymous.
3. **Live Stripe was never exercised on a studio invoice** — no Checkout leg, no webhook settle,
   no ACH, no surcharge. Owed: a prod test-mode card + ACH on a studio invoice, then the
   `designer_earnings` row.
4. Ruling on ios-r3-3: the iOS Budget empty state reads "Nothing billed yet" for a
   studio-invoice-only homeowner (a consequence of S11).
5. Tell the approvals peer that **`00571` is on main and on Strata** — their `00572/00573` push
   must follow a `git merge main`. **Mint W4+ migrations from `00574`.**
6. `stripe-rail.test.ts` harness (W2-A1 / F7): `designerA` needs a designer-domain role in
   `seed()` — a pre-existing red that blocks every future money-rail Deno gate.
7. `apps/designer-portal/.env.local` still points at the local stack. **Any future designer
   deploy from this checkout hits the same preflight refusal** until it is repointed or the
   wrangler.jsonc export is repeated.

---

## 9. What was NOT verified

- **No signed-in walk on either portal in production.** The proof that the program shipped is a
  string in the served chunk plus the object probes on Strata — not a rendered, logged-in page.
- **No prod row was created and no RPC was exercised in prod.** `create_draft_studio_invoice`,
  the studio branch of `set_invoice_studio_id`, the household policies and the 3-arg
  `resolve_studio_identity` exist and are granted correctly; none has been *called* against
  Strata. Deliberate — the brief forbade creating prod rows.
- **The live money rail on a studio invoice is untouched** (owed item 3).
- **19 of the 20 functions were verified by version increment only**, not by behavior; no
  function was invoked. `notification-digest` was verified as byte-identical rather than
  redeployed.
- **No `wrangler tail` on the client portal** — only the designer worker was tailed.
- **Custom-domain routing was not re-verified.** No `routes` exist in any `wrangler.jsonc`;
  `app.patina.cloud` / `client.patina.cloud` are dashboard-managed out of band. They answered
  correctly, which is evidence they are wired, not proof of their configuration.
- **iOS shipped nothing.** The S11 iOS changes are on main; no TestFlight build was cut.
- **The judge's open minors/nits (F2–F4, F6–F17) shipped with the program**, as ruled.
- **Nothing was rolled back or half-applied.** Every step succeeded; there is no partial state.
