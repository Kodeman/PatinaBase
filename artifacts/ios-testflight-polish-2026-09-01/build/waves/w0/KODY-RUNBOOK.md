# First Flight · W0 — THE KODY RUNBOOK

**Every command on this page is a production write or a production read. No agent ran any of it, and
no agent may.** Assembled by the **W0 closer** on 2026-09-02 from all eight W0 lanes, superseding the
partial version L0.2 wrote (which covered the two migrations only). Ten blocks, **A → J**, in the order
they must run.

`rulings-2026-09-02.md` closes with *"Every prod mutation is a Kody-run step in
`build/waves/w0/KODY-RUNBOOK.md`."* This is that file.

**No angle bracket appears in any command on this page.** Every value is either a literal or a variable
assigned at the top of its own block, and every block's variables are re-assignable on their own — you
can start at any block without having run the ones before it, except where a block says otherwise.
(The 2026-08-26 placeholder incident is why: a command handed over with a placeholder in it gets run
with the placeholder in it.)

---

## The order, and what actually gates what

| Block | What it does | Gated by | Reversible? |
|---|---|---|---|
| **A** | Merge L0.2b to `main`, redeploy the designer portal, deploy `client-invite` (A10) | nothing | yes — `wrangler rollback`; the function redeploys from `git` |
| **B** | Apply **00555** (the security migration), regenerate, probe, walk The Document | **A** (B2's ruling is now made — see B2) | partly — see B9 |
| **C** | Apply **00557** (`increment_scan_upload_attempt`) and probe | B (same session) | no rollback needed |
| **D** | Mint `firstflight@patina.cloud` and append the Vault allow-list | nothing (B may run before or after) | mostly — one row is permanent |
| **E** | Confirm the Stripe key (**D10**) and the APNs env (**D9**) — **read-only** | nothing | n/a |
| **F** | Publish the three tour bodies in Sanity | nothing | yes — republish |
| **G** | App Store Connect: localization, review detail, testers, age rating, name | **D** (G3 names the demo account) | mostly |
| **H** | PostHog: the three flags, error tracking, the Debug kill-switch check | nothing | yes — one click |
| **I** | The archive dry run, the export, and the entitlement check | a checkout carrying L0.1 | n/a — produces artifacts only |
| **J** | The two conditional steps: L0.7's studio probe, and the catalogue seed | J1 nothing · J2 Leah's manifest | J2 is a real write |

**A → B is the only hard ordering in the wave**, and it is ruling **D8**: 00555 removes anon's blanket
`SELECT` on `vendors`, and two live designer-portal routes read that table with no `getUser()` guard.
Applying before A converts a live leak into a live outage on `app.patina.cloud`. VISION ranks The
Document (surface #1) above the iOS app (surface #2): *The Document never breaks to unblock the app.*

**Everything else is parallel.** E, F, H and I gate nothing. G waits only on D.

---

## Block A — merge L0.2b and redeploy the designer portal

**What it proves.** That the designer portal's **four** vendors routes —
`/api/catalog/vendors`, `/api/catalog/vendors/[id]`, `/api/admin/catalog/vendors` and
`/api/admin/catalog/vendors/[id]` — no longer hand the thirteen internal trade columns to an
unauthenticated `curl`, or to a signed-in homeowner. That is the third exposure, the one that is not
the app's and that 00555 does **not** fix (it converts it to a 500). This is half of gate **G3**, and
it is the gate on Block B.

### A0 — variables

```bash
export REPO=/Users/kody/Code/patina-merged
export PORTAL=patina-designer-portal
export LANE_BRANCH=first-flight/w0-l02b
```

### A1 — record what is live BEFORE anything changes

`wrangler deployments list` prints **oldest-first**. The **bottom** row is what is live now. Save the
whole list to a file — that file is the record A5 compares against and the one A8 falls back on if more
than one deploy happens before you need to roll back.

```bash
cd "$REPO"
mkdir -p "$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/apply-log"
npx wrangler deployments list --name "$PORTAL" \
  | tee "$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/apply-log/designer-deployments-before.txt" \
  | tail -12
```

Paste the bottom row into the apply report. You do not need to hand a version id to the rollback in A8 —
it targets the previous deployment on its own and prints which one before asking — but having the list
on disk means you can name a specific one if the obvious target is not the right one.

### A2 — merge the lane to `main`

L0.2b merges to `main` **on its own**, ahead of `first-flight/integration`: it is a designer-portal fix,
not an iOS one, and it gates 00555.

```bash
cd "$REPO"
git fetch origin
git checkout main
git merge --no-ff "$LANE_BRANCH" \
  -m 'chore(first-flight): integrate L0.2b — guard the vendors catalogue routes and move the comms vendor picker onto list_vendor_profiles'
git push origin main
```

Husky rejects `merge:` commit subjects — the `chore(first-flight):` subject above is deliberate.
The three commits you are merging are `ffdee7273`, `57f9e1ce8`, `fc82db841`.

Confirm the guard is really on `main` before spending a deploy:

```bash
cd "$REPO"
git log --oneline -4 -- apps/designer-portal/src/app/api/catalog/vendors \
  apps/designer-portal/src/app/api/admin/catalog/vendors \
  packages/supabase/src/hooks/use-comms.ts
# FOUR route files, not two — RF-04 found the same defect on the admin pair.
# Every one must call the role helper, and none may still say select('*').
grep -rn 'getAuthenticatedDesignerAdmin' \
  apps/designer-portal/src/app/api/catalog/vendors \
  apps/designer-portal/src/app/api/admin/catalog/vendors
grep -rn "select('\*')" \
  apps/designer-portal/src/app/api/catalog/vendors \
  apps/designer-portal/src/app/api/admin/catalog/vendors \
  | grep -vE ':[0-9]+: *(//|\*)'     # comment lines filtered — want NO hits left
grep -n 'list_vendor_profiles' packages/supabase/src/hooks/use-comms.ts
```

### A3 — one grep before the deploy that costs nothing and can save a day

`useVendorProfiles` calls `list_vendor_profiles`, and that function does not exist on Strata until
Block B. Between A and B the hook calls a function that is not there (PostgREST `PGRST202`). At the time
this was written the hook had **no UI consumer** — the grep returns only the barrel export, the
definition and its test — so the break is latent. Re-run the grep now, because a lane that landed since
could have made it live:

```bash
cd "$REPO"
grep -rn useVendorProfiles apps packages --include='*.ts' --include='*.tsx'
```

Three hits or fewer (`hooks/index.ts`, `use-comms.ts`, the test) → latent, proceed. A hit in a portal
page → do not leave the A→B window open overnight.

### A3b — ⚠ ONE PRECONDITION THAT WILL 503 FOUR ROUTES IF IT IS MISSING

L0.2b's guard resolves the caller's role with a **service-role** client, and
`createAdminClient()` throws when `SUPABASE_SERVICE_ROLE_KEY` is not in the runtime environment. That
key is **not** in `apps/designer-portal/wrangler.jsonc` (grep it — there is no such `var`), so on
Cloudflare it can only be a Worker **secret**. If it is not set, all four vendors routes —
`/api/catalog/vendors`, `/api/catalog/vendors/[id]`, `/api/admin/catalog/vendors`,
`/api/admin/catalog/vendors/[id]` — answer **503 "Role check unavailable"** to everybody, including
Leah. (503, not 500: the helper distinguishes a role *refusal* from a role *outage* so nobody spends an
afternoon on permissions during a config problem — RF-07.) The same key is already required by
`POST /api/clients/invite`, so if invites work in production today it is set; check anyway, it is one
command:

```bash
cd "$REPO"
npx wrangler secret list --name "$PORTAL"
```

Want `SUPABASE_SERVICE_ROLE_KEY` in the list. If it is absent, set it before A4
(`npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name "$PORTAL"`, value from the Strata dashboard
→ Project Settings → API → `service_role`) and never write it into a file.

### A4 — deploy

`./infra/deploy-portal.sh` is **the only** portal deploy path — it rebuilds the workspace-package dists
first, and skipping that is what once shipped `TypeError: proposalTierVisibility is not a function` to
production. The `NEXT_PUBLIC_*` exports below are copied verbatim from
`apps/designer-portal/wrangler.jsonc`'s top-level `vars`: those values are inlined **at build time from
the process environment**, and an exported value beats `apps/designer-portal/.env.local` — which has
pointed at the wrong project before. This is the wrangler-vars export trap; the exports are not
optional.

```bash
cd "$REPO"
export NEXT_PUBLIC_SUPABASE_URL="https://bkvcixdmuyejfzcijpdg.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdmNpeGRtdXllamZ6Y2lqcGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjg0MzIsImV4cCI6MjA4Mzg0NDQzMn0.SPl6jHaeTp9McfF-AmXJUDKTwRaXD7Qf0hlve72rVg0"
export NEXT_PUBLIC_SUPABASE_STORAGE_KEY="sb-bkvcixdmuyejfzcijpdg-auth-token"
export NEXT_PUBLIC_APP_URL="https://app.patina.cloud"
export NEXT_PUBLIC_CLIENT_PORTAL_URL="https://client.patina.cloud"
export NEXT_PUBLIC_ENV="production"
export NEXT_PUBLIC_POSTHOG_KEY="phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG"
export NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
export NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE="under_review"
export NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS="apple"
export NEXT_PUBLIC_EDGE_API_URL="https://api.patina.cloud"

./infra/deploy-portal.sh designer production
```

### A5 — confirm the deploy landed

```bash
cd "$REPO"
npx wrangler deployments list --name "$PORTAL" | tail -12
```

**Oldest-first — read the BOTTOM row.** Its timestamp must be newer than the A2 merge commit. A
deployment row is not a behaviour, which is why A6 exists.

### A6 — the probes. Exposure #3 stays open until these pass

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.patina.cloud/api/catalog/vendors
```
**Want `401`.** A `200` means the guard is not live.

```bash
curl -s https://app.patina.cloud/api/catalog/vendors | head -c 200
```
**Want** a short `Unauthorized` body — **not** a JSON array carrying `trade_terms`, `orders_email`,
`trade_account_email`, `trade_portal_url` or `notes`. A status code alone does not prove the trade file
is gone.

```bash
export VENDOR_ID=00000000-0000-0000-0000-000000000000
curl -s -o /dev/null -w '%{http_code}\n' "https://app.patina.cloud/api/catalog/vendors/$VENDOR_ID"
```
**Want `401`.** That uuid is the shape, not a real row — the guard must fire before the lookup, so a
nonexistent id must still answer 401 and never 404.

**The two admin routes carry the same defect and the same fix (RF-04), so probe them too.** They were
untouched by the first RL02B-01 commit — five handlers, all `getUser()`-only, all `select('*')` on the
same table:

```bash
for p in /api/admin/catalog/vendors "/api/admin/catalog/vendors/$VENDOR_ID"; do
  printf '%-46s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://app.patina.cloud$p")"
done
curl -s -X POST https://app.patina.cloud/api/admin/catalog/vendors \
  -H 'Content-Type: application/json' -d '{"name":"probe-should-not-exist"}' \
  -o /dev/null -w 'POST %{http_code}\n'
```
**Want `401` on all three.** The POST matters as much as the reads: `vendors` carries a permissive
`Authenticated users can insert vendors` policy, so before RF-04 any signed-in session could create
rows through that handler. Its write verbs are now **admin-domain only** — a designer gets `403
"Forbidden: admin role required"`, which is the thing to check in A7's signed-in walk if you are signed
in as Leah rather than as an admin.

### A7 — the signed-in half (this is a walk, not a probe)

Signed in to `app.patina.cloud` as yourself, in a browser: the vendors catalogue page still lists
makers, and one vendor's detail still renders its trade fields (terms, orders email, portal URL). You
are signed in; they belong there. If either is broken, roll back — the guard is wrong, not the data.

### A8 — rollback

Run it **without `--yes`** the first time: with no version id wrangler targets the previous deployment,
prints which one it is, and asks. Read that line against the bottom row you saved in A1 before
confirming.

```bash
cd "$REPO"
npx wrangler rollback --name "$PORTAL"
```

If more than one deploy has landed since A1 and the previous deployment is not the right target, name
the id from `apply-log/designer-deployments-before.txt`:

```bash
cd "$REPO"
export ROLLBACK_ID="$(tail -n +1 \
  "$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/apply-log/designer-deployments-before.txt" \
  | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)"
echo "rollback target from the pre-deploy list: $ROLLBACK_ID"
npx wrangler rollback "$ROLLBACK_ID" --name "$PORTAL"
```

That `grep` takes the **last** uuid in the saved list, which is the bottom row — the one that was live
before A4. Read the echoed value against your own note before confirming the prompt.

### A9 — one thing to know before Block B

**This paragraph used to say the guard authenticates but does not authorize. It no longer does, and
the history is worth keeping.** L0.2b's first cut added `getUser()` only. All four portals share one
cookie name on `.patina.cloud` and the designer-portal middleware passes `/api/*` through, so a
homeowner signed in at `client.patina.cloud` could still read a vendor's trade file by typing an
`app.patina.cloud/api/catalog/vendors/<id>` URL — round one's own cohort, holding a session the route
accepted. RL02B-01 (fix round 1) put both `/api/catalog/vendors` routes behind
`getAuthenticatedDesignerAdmin`; **RF-04** (fix round 2) found the same five handlers still open on
`/api/admin/catalog/vendors` and `/api/admin/catalog/vendors/[id]` and closed those too, admin-domain
only on the write verbs.

So **G3 may now be written as "the exposure is closed"** — but only once A6 has actually returned
`401` on all five paths. Until then it is closed in the branch, not in production.

### A10 — deploy the `client-invite` edge function (ruling B2 v3(d))

**New in fix round 3.** Nothing above depends on it and nothing below is blocked by it, but it belongs
in Block A because it ships with the same merge and it is the second half of the fix `l1-a-notes.md`
describes.

**What it proves.** That a client who accepts a designer's invitation stops being labelled a designer.
`handle_new_user` gives every email/password sign-up `profiles.role = 'designer'` — that is the
pre-00555 default and ruling **B2 v3(a)** deliberately leaves it alone — and the client portal's
invite-accept form signs up over email/password with **no role hint**
(`AcceptInviteForm.tsx:64`). `handleAccept` is the one server-side moment that knows the caller is a
client, so it now writes `role = 'homeowner'` there as `service_role`.

The function is deployed from `main` after A2's merge. It imports `_shared/branded-email.ts` and
`_shared/studio-identity.ts`, but this change touches **neither**, so no other function needs
redeploying.

```bash
cd "$REPO"
git log --oneline -2 origin/main -- supabase/functions/client-invite/index.ts
grep -n "accept role relabel" supabase/functions/client-invite/index.ts

supabase functions deploy client-invite --project-ref bkvcixdmuyejfzcijpdg
```

The `grep` must print a line before you deploy — it is the only cheap proof that the checkout you are
deploying from carries the change rather than the pre-round-3 file.

**Verify** (read-only, and it does not need a real invitation):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/client-invite/accept" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
```
**Want `401`** (`unauthorized` — no Authorization header). A `404` means the function is not deployed;
a `500` means it is deployed and broken, and A8's rollback does not cover edge functions — redeploy the
previous revision from `git`.

The behavioural check belongs to the next real invitation: accept one, then read the accepting user's
`profiles.role` (Block B7 has the query). Clients who accepted **before** this deploy keep the wrong
label until the one-time backfill in **B7** runs.

---

## Block B — apply 00555, the security migration

**What it proves.** That the two live anon-key exposures are shut: all 24 production `profiles` rows
(emails, Stripe customer ids, phones, addresses) and `notification_preferences` with SELECT/INSERT/
UPDATE/DELETE. Plus the `vendors` public-face/trade-file column split; the `profiles.is_designer`
authority pin on **both** UPDATE policies and both INSERT policies; the two RESTRICTIVE write policies
that stop a non-designer minting a `designer_clients` row; `anon` losing `designer_clients` entirely;
and seven `FOR ALL / TO PUBLIC / auth.uid() IS NULL` policies dropped. Rulings in force: **DM-1**,
**D8**, and **B2 v3** (B2 below — read it, it changed).

**Block B now carries two steps that are not the migration:** the read-only pre-apply audits at
**B7a**, which say who RF2-01 costs on production, and the one-time label backfill at **B7b**. B7a runs
*before* B5.

**Never `supabase db push`.** Strata's ledger and this tree do not match; `db push` would drag every
migration Strata lacks, including any a peer branch has minted. Both files go on with `psql -f`, one at
a time, each followed by its own `schema_migrations` row. Same selective-apply discipline as 00541/00542.

### B0 — variables

```bash
export REPO=/Users/kody/Code/patina-merged
export PROJECT_REF=bkvcixdmuyejfzcijpdg
export SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' "$REPO/infra/.env" | cut -d= -f2-)"
export ANON_KEY="$(cd "$REPO" && python3 -c "
import json,re,pathlib
raw = pathlib.Path('apps/client-portal/wrangler.jsonc').read_text()
raw = re.sub(r'^\s*//.*$', '', raw, flags=re.M)
print(json.loads(raw)['vars']['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
")"

test -n "$STRATA_DB_URL" && echo "db url: loaded"
echo "anon key: ${#ANON_KEY} chars, prefix ${ANON_KEY:0:3}"     # expect 208 chars, eyJ
```

If `STRATA_DB_URL` is not in `infra/.env` under that name, take the URI from the Supabase dashboard
(Project Settings → Database → Connection string → URI) and export it by hand. Never paste it into a
file, a commit, or a chat.

### B1 — the deploy gate (D8). Not SQL. If this fails, STOP.

```bash
cd "$REPO"
git fetch origin
git log --oneline -1 origin/main -- apps/designer-portal packages/supabase/src/hooks
curl -s -o /dev/null -w '%{http_code}\n' https://app.patina.cloud/api/catalog/vendors
```

Both conditions required: the `git log` line is **Block A's merge commit** and it is on `origin/main`;
and the `curl` prints **`401`**. A `200` means the guard is not live and applying now converts a live
leak into a live outage. A `500` means the migration already went on ahead of the deploy — go straight
to B9.

### B2 — ✅ RULED (v3). Nothing to decide here; read it and carry on.

> **FABLE RULING B2 v3 (2026-09-02) — supersedes B2 v1 and B2 v2 wherever they appear in the
> migration, this runbook and `wave-report.md`.**
>
> **(a)** `profiles.role` is a **LABEL**, never an authorization input. `handle_new_user` keeps the
> pre-00555 default (`'designer'` for any signup without an explicit role hint — portals unchanged,
> Apple/Google on the portals unchanged); an explicit `'homeowner'` hint still wins.
>
> **(b)** Authority comes only from `user_roles` (`roles.domain IN ('designer','admin')`) or
> `profiles.is_designer`, which are written only by `service_role` / SECURITY DEFINER paths. Every
> policy or function this migration adds that decides authority predicates on those two, never on
> `profiles.role`.
>
> **(c)** The own-row `profiles` `UPDATE` policy allows `role` to change **ONLY** to `'homeowner'` (a
> self-downgrade; never upward) and `is_designer` only to `false`; the iOS app performs that
> self-downgrade after Apple/Google sign-in (that is W1 · L1-A's A3-07 fix; the exact contract is in
> `build/waves/w1/l1-a-notes.md`).
>
> **(d)** The `client-invite` edge function's accept path sets `profiles.role = 'homeowner'` for the
> accepting user as `service_role` — `supabase/functions/client-invite/index.ts` `handleAccept`.
> Deployed at **A10**; already-accepted clients need the one-time backfill in **B7**.
>
> **(e)** The sibling policy `"Designers can update their client profiles"` treats
> `role IN ('homeowner','client')` as the client vocabulary in `USING` and `WITH CHECK`, with a W2 note
> that the `'client'` / `'homeowner'` split must be reconciled.
>
> **All of it is already in the files. There is no blank to fill and no step to add here.**

**What v3 changes, against the version of this page you may have read before:**

| | v2 (superseded) | **v3** |
|---|---|---|
| `handle_new_user` | a `CASE` on `raw_app_meta_data->>'provider'`; `email` → `designer`, everything else → `homeowner` | **00313 verbatim** — `COALESCE(v_role,'designer')`, no provider branch |
| own-row `UPDATE` | `role` and `is_designer` FROZEN | a one-way **ratchet**: `role` may fall to `'homeowner'`, `is_designer` to `false` |
| `designer_clients` restrictive policies | `is_designer` **or** `role IN ('designer','admin','super_admin')` | `is_designer` **or** a `user_roles` grant in the designer/admin **domain** |
| own-row `INSERT` | pinned `role = 'homeowner'` and `is_designer IS NOT TRUE` | pins **`is_designer` only** |
| sibling `UPDATE` | `role = 'homeowner'` | `role IN ('homeowner','client')` |
| A3-07's fix lives | in the trigger | in the app (L1-A) and in `client-invite` (A10) |

**Why the two earlier cuts were wrong.**

*v1* changed `COALESCE(v_role, 'designer')` (00313:64) to `COALESCE(v_role, 'homeowner')`. Right for the
iOS app; wrong for the **designer portal's own signup page**, which also sends no role
(`apps/designer-portal/src/app/auth/signup/page.tsx:147-157` sends `{ name, company, phone }`). Every
portal self-signup designer would have been written `role = 'homeowner'` and then labelled **`client`**
in every comms thread by `public.comms_resolve_role` (00103:37-42).

*v2* replaced the constant with a provider `CASE`. Two things were wrong with it. The smaller one is
that its first cut pointed the allowlist at the privileged value (`ELSE 'designer'`), which handed
`designer` to the Google button beside the Apple one and to every provider added later. The larger one
is the shape itself: **which button somebody tapped is not which kind of account they are.** A designer
can sign in with Apple. A client can sign up with an email and a password — the client portal's own
invite-accept form does exactly that (`AcceptInviteForm.tsx:64`). A trigger guessing from the provider
writes a wrong label for both, silently, at the one moment nobody is watching.

**And the label was never the boundary.** Nothing in the schema grants authority from `profiles.role`:
`claim_design_request` / `open_design_requests` (00286), `accept_design_request` (00330),
`design_request_submit` (00285) and `search_shareable_designers` all read `profiles.is_designer`;
`profiles_select_admin` reads `user_roles`; and after **RF2-01** so do the two restrictive policies on
`designer_clients`. That last one is why v2 mattered: fix round 2's roster predicate carried an
`OR current_profile_role() IN ('designer','admin','super_admin')` leg, and since `handle_new_user` gives
**every** email/password signup that label, the leg read *"anyone who can complete a signup form may
mint a roster row"* — the exact primitive the restrictive policy was added to close.

**What the migration does instead** (00555 §a2(ii)) — this is 00313's body, unmodified:

```sql
v_role := CASE
  WHEN NEW.raw_user_meta_data->>'role' = 'homeowner' THEN 'homeowner'
  ELSE NULL
END;
...
INSERT INTO public.profiles (id, email, display_name, role)
VALUES (NEW.id, NEW.email, v_display_name, COALESCE(v_role, 'designer'))
ON CONFLICT (id) DO NOTHING;
```

00313's security rule is untouched: `raw_user_meta_data` is **client-controlled**, so exactly one client
string is honoured — the literal `'homeowner'` — and anything else (including a forged `'super_admin'`)
is ignored and falls to the default. `user_roles` is untouched too: every signup still gets the
`app_user` grant, and `profiles.is_designer` is still synced from `user_roles` by 00290's trigger.

**Regression cover, so it cannot drift back quietly.**
`supabase/tests/rls/00555_ios_round_one_security.test.sql`:

- **§11** inserts eight real `auth.users` rows. **11a Apple → `designer`** and **11b email, no hint →
  `designer`** are the two that flipped meaning in v3; 11c an explicit hint → `homeowner`; **11d** a
  forged `super_admin` hint → `designer` **and no admin `user_roles` row**; 11e–11h (providers-array
  only, Google, no `raw_app_meta_data`, email+google linked) all → `designer`, because there is no
  provider logic left to get wrong.
- **§11i** runs the two relabel paths: `client-invite`'s `service_role` write lands, and the same write
  attempted by an ordinary caller against **another** id does not.
- **§7i–7i5** are the ratchet: the self-downgrade lands, it is idempotent, and it does not turn back.
- **§7j** mints a roster row as the account fix round 2 let through — `role = 'designer'`,
  `is_designer` false, no grant — and must be refused. **§7k** is the other half: a real designer, and
  an admin-domain grant holder with `is_designer` false, both succeed, and a `'client'`-labelled
  rostered client can still be renamed.
- **§10** asserts `handle_new_user`'s definition still carries `COALESCE(v_role, 'designer')` and does
  **not** mention `raw_app_meta_data` — that token appears nowhere in 00313, so its presence means a
  provider branch crept back in. A `LIKE '%homeowner%'` guard would prove nothing: 00313's body carries
  the literal twice.

**One line in the apply report: "B2 v3 — the trigger is 00313 verbatim; the relabel moved to the app
(L1-A) and to client-invite (A10)."**

### B3 — re-check the migration band with a command that can see peer branches

```bash
cd "$REPO"
git fetch origin
git log --all --diff-filter=A --format='' --name-only -- 'supabase/migrations/*.sql' \
  | grep -E '^supabase/migrations/005[4-9][0-9]' | sort -u
git worktree list
psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT version || '|' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5"
```

Expect `00555_ios_round_one_security.sql` and `00557_increment_scan_upload_attempt.sql` to be the only
files at those numbers, and neither version in the Strata ledger. **`00556` is a deliberate gap** —
`increment_scan_upload_attempt` was minted as 00556, found to collide with
`00556_admin_studio_management.sql` on `admin-studios/build` (commit `d69e23f3f`, already applied to the
shared local stack), and renumbered to 00557. The `ls supabase/migrations` habit **cannot** see a peer
branch, which is how the first collision was missed.

If either number has been taken since, renumber the file **before** applying — the filename, its banner,
its test file, and `supabase/seed/00-legacy-grants.sql` via `python3 scripts/generate-legacy-grants.py`.

### B4 — prove it locally first. The whole suite, not the one file.

This is what 00555's own AFTER-APPLY block instructs, and it is the gate that decides the migration.

```bash
cd "$REPO"
pnpm supabase:reset
bash scripts/run-sql-tests.sh 2>&1 | tee /tmp/first-flight-sql.log
tail -20 /tmp/first-flight-sql.log
grep -E '^(FAIL|EXPECTED-FAIL) ' /tmp/first-flight-sql.log
grep -oE '[a-z0-9_/.-]+\.test\.sql' "$REPO/supabase/tests/KNOWN_FAILURES.md" | sort -u
grep -E '0055[57]' /tmp/first-flight-sql.log
```

**A failure name that is not already in `supabase/tests/KNOWN_FAILURES.md` is a stop, not a note** — and
nothing gets added to that file to make this pass. Both of this wave's files must be among the passes:
`PASS supabase/tests/rls/00555_ios_round_one_security.test.sql` and
`PASS supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql`. The integration steward measured
`total 147 · green 126 · expected-fail 21 · unexpected-fail 0` on 2026-09-02, with the expected-fail set
matching `KNOWN_FAILURES.md` exactly — no new name, no listed file silently gone green.

### B5 — apply 00555

Only after B1 is green. (B2 is ruled and already in the file — it is a read, not a gate.)

```bash
cd "$REPO"

psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00555_ios_round_one_security.sql

psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00555','ios_round_one_security') ON CONFLICT DO NOTHING;"

psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT version || '|' || name FROM supabase_migrations.schema_migrations
    WHERE version = '00555'"
```

The file is a single transaction ending in a `DO $$ … ASSERT … $$` verification block, so a failed
assertion aborts the whole file rather than half-applying it. If `psql` returns non-zero, **nothing was
written** — read the error, fix the file, start again.

**What to expect while it runs.** It creates one index, `idx_fulfillment_orders_designer_profile`,
inside that same transaction and **not** `CONCURRENTLY`, so it holds an `ACCESS EXCLUSIVE` lock on
`public.fulfillment_orders` until commit. At production's row counts this is sub-second; it is named
here so a concurrent write blocking for a moment is not a surprise. There is no second index.

### B6 — regenerate what the migration invalidates

```bash
cd "$REPO"
python3 scripts/generate-legacy-grants.py
pnpm db:generate
git diff --stat packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql
```

Both were regenerated on the lane branch already, so an **empty diff is the expected result** and means
the branch was correct. A non-empty diff means Strata carries something the branch does not — read it
before committing it. **Never hand-edit `supabase/seed/00-legacy-grants.sql`.**

One follow-up this unblocks, for the record: `packages/supabase/src/hooks/use-comms.ts:1063-1066`
carries a `getSupabase() as any` cast with two comment lines, added only because
`list_vendor_profiles` is not yet in the generated `Functions` union. Once `db:generate` has run against
a Strata that has 00555, that cast comes out. It is a one-line task for the lane that owns the file, not
something to hand-edit here.

### B7a — TWO READ-ONLY AUDITS, **before** B5's apply (RF2-05)

New in fix round 3, and they belong *before* the apply rather than after it: **RF2-01 narrows who may
write `public.designer_clients`, and these two queries say who that costs on production.** Run them at
B3 time, in the same session, and paste both outputs into the apply report. Nothing here writes.

**Audit 1 — every roster owner, by the signals the new policy actually reads.**

```bash
psql "$STRATA_DB_URL" -X -q -c "
SELECT p.role                                   AS profile_role,
       COALESCE(p.is_designer, false)           AS is_designer,
       EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = p.id AND r.domain IN ('designer','admin'))
                                                AS has_grant,
       count(DISTINCT dc.designer_id)           AS owners,
       count(*)                                 AS roster_rows
  FROM designer_clients dc
  JOIN profiles p ON p.id = dc.designer_id
 GROUP BY 1,2,3
 ORDER BY 4 DESC;"
```

**The shape to want** is that every row has `is_designer = t` **or** `has_grant = t`. Those owners keep
writing. A row with **both false** is an account that could mint a roster row before 00555 and cannot
after it — read `profile_role` on that row before deciding:

| `profile_role` | `is_designer` | `has_grant` | reading |
|---|---|---|---|
| `designer` | `t` | either | fine — the ordinary designer |
| `designer` | `f` | `t` | fine — grant present, `is_designer` not yet synced (00290) |
| `admin` / `super_admin` | `f` | `t` | fine — the admin-domain leg |
| **`designer`** | **`f`** | **`f`** | 🛑 **HARD STOP — the self-signup shape.** Has the label, no authority. If it is a real designer, grant them a designer-domain `user_roles` row **before B5**; if it is a stray signup, delete its roster rows **before B5**. Do not apply with rows in this category still undecided |
| `homeowner` / `client` | `f` | `f` | 🛑 **HARD STOP** — should not exist as a roster **owner** at all. Same two outcomes: grant, or delete the rows. Before B5 |

**The last two rows became a hard stop in fix round 3 pass 2 (RF3-03), and the reason is that the
migration got stricter, not weaker.** `"Designers can update their client profiles"` now checks the
**caller's** own authority — `is_designer`, or a designer/admin `user_roles` grant — in both its `USING`
and its `WITH CHECK`. Before that change an owner in either category kept a live write on their
"client's" profile (and a PII read through `can_view_profile`'s roster leg) purely because the roster
row existed, and the restrictive policies could not reach it: they govern `INSERT` and `UPDATE` on
`designer_clients`, and **this migration deliberately deletes no existing roster row.** After the
change, such an owner is locked out instead — which is correct, and is exactly why you want to know
who they are *before* the apply rather than from a support ticket after it.

If both categories are empty, RF2-01 and RF3-03 cost production nothing and you can apply without a
second thought. If they are not, the affected accounts are named by:

```bash
psql "$STRATA_DB_URL" -X -q -c "
SELECT DISTINCT p.id, p.email, p.role, p.is_designer
  FROM designer_clients dc
  JOIN profiles p ON p.id = dc.designer_id
 WHERE COALESCE(p.is_designer, false) = false
   AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = p.id AND r.domain IN ('designer','admin'))
 ORDER BY p.email;"
```

**Existing rows are not touched** — the restrictive policies are `INSERT` and `UPDATE` only, and
`SELECT` is deliberately untouched — so a lost write does not hide anyone's existing roster. The cost
for a listed account is that it can no longer add a client, **and (RF3-03) can no longer edit the
profiles of the clients it already has**, until it holds `is_designer` or a designer/admin grant. Both
are restored by the same one-line grant; neither is restored by re-creating roster rows.

**Audit 2 — orphan roster rows.** The predicate above joins `profiles`; a roster row whose
`designer_id` has no `profiles` row would vanish from audit 1's counts entirely and would be invisible
to the whole analysis.

```bash
psql "$STRATA_DB_URL" -X -q -c "
SELECT count(*) FILTER (WHERE p.id IS NULL)  AS designer_without_profile,
       count(*) FILTER (WHERE dc.client_id IS NOT NULL AND c.id IS NULL)
                                             AS client_without_profile,
       count(*)                              AS total_rows
  FROM designer_clients dc
  LEFT JOIN profiles p ON p.id = dc.designer_id
  LEFT JOIN profiles c ON c.id = dc.client_id;"
```

**Want `designer_without_profile = 0`.** `designer_clients.designer_id` is FK'd to `profiles(id)`, so a
non-zero count means the FK is missing or NOT VALID on Strata — stop and read it, because audit 1's
numbers are then incomplete. `client_without_profile` is **expected to be non-zero and is fine**: a
roster row created by the designer-portal Add Client flow before the client has an account carries
`client_name` / `client_email` with a NULL `client_id`, and only the NULL-`client_id` case is filtered
out of the count above.

### B7b — the one-time backfill for clients who already accepted (ruling B2 v3(d))

`client-invite`'s accept handler now writes `role = 'homeowner'` (A10), but only for **future**
acceptances. Clients who accepted before that deploy are still labelled `designer` by
`handle_new_user`'s default. This sweeps them up. It is the **only write in Block B other than the
migration**, and it is deliberately narrow.

**Preview first — read-only, and it names every row the UPDATE would touch:**

```bash
psql "$STRATA_DB_URL" -X -q -c "
SELECT p.id, p.email, p.role, COALESCE(p.is_designer,false) AS is_designer,
       max(ci.accepted_at) AS latest_accept,
       count(*)            AS invitations_accepted
  FROM client_invitations ci
  JOIN profiles p ON p.id = ci.accepted_by
 WHERE ci.accepted_at IS NOT NULL
   AND p.role <> 'homeowner'
   AND COALESCE(p.is_designer, false) = false
   AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = p.id AND r.domain IN ('designer','admin'))
 GROUP BY p.id, p.email, p.role, p.is_designer
 ORDER BY latest_accept DESC;"
```

⚠ **The preview is grouped by profile, and that is the fix for RF3-09.** It used to project one row per
**invitation**, so a homeowner invited by two designers appeared twice — preview `2`, `UPDATE 1` — and
the line below told you that mismatch meant something was wrong. `invitations_accepted > 1` is normal
and is exactly that case.

**Read the list before running the UPDATE.** Every row should be recognisably a client of Leah's or of
another designer. The two guards after `p.role <> 'homeowner'` are what keep a real designer from being
relabelled because they once accepted a client invitation addressed to their own mailbox: if
`is_designer` is true, or a designer/admin grant exists, the row is excluded. Anyone excluded that way
is also someone the app would relabel on sign-in, so if the exclusion surprises you, that is worth
knowing before Block D.

**Then the write, with the same predicate:**

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c "
UPDATE profiles p
   SET role = 'homeowner', updated_at = now()
  FROM client_invitations ci
 WHERE ci.accepted_by = p.id
   AND ci.accepted_at IS NOT NULL
   AND p.role <> 'homeowner'
   AND COALESCE(p.is_designer, false) = false
   AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = p.id AND r.domain IN ('designer','admin'));"
```

`UPDATE n` must equal the preview's row count — the preview is one row per **profile**, and
`UPDATE … FROM` touches each profile once, so they match exactly. (If you re-run the older ungrouped
preview from somewhere, expect `UPDATE n ≤ that row count`, equal to its distinct `id` count.)
Re-running the write is a no-op (`UPDATE 0`) because `p.role <> 'homeowner'` no longer matches.

**Rollback:** there is none that is honest — the previous value was `designer` for every affected row,
so restoring it is `SET role = 'designer'` for exactly the ids the preview printed. **Save the preview
output** to `apply-log/` before running the write; that file is the rollback.

This is a **label** change. It moves nothing about what those accounts can do: `is_designer` and
`user_roles` are untouched by both statements, and the predicate excludes anyone who holds either.

### B7 — the read-only probes

Full script with before/after values: [`../../migrations-draft/00555_probes.md`](../../migrations-draft/00555_probes.md)
— **read it from the repo tree on this branch**, not from an older working copy. The tracked file is
the one whose headings are `§9b` / `§9d` / `§9f`; a pre-2026-09-02 copy numbers the same sections
`§9c`/`§12` and is missing the placeholder-free `USER_JWT` recipe.

PROGRAM.md's exit criteria name probes that are not the file's section numbers. The mapping:

| Exit criterion | Section | Want |
|---|---|---|
| Probe 1 | **§1** | `profiles` as anon: was `200` (24 rows) → now **`401`** |
| Probe 2 | **§2** | `notification_preferences` as anon: was `200` → now **`401`** |
| Probe 3 | **§3** | `vendors` public face `200`; `notes`/`trade_terms` **`401`**; `select=*` **`401`** |
| Probe 4 | **§5** | the iOS product read with its `vendors!products_vendor_id_fkey` embed still `200` **with a non-null maker** |
| Probe 5 | **§11** | `app.patina.cloud/api/catalog/vendors` unauthenticated: **`401`** — not a 200 carrying trade columns, and not a 500. **Plus the three admin paths from A6** (RF-04) |
| **9b** | **§9b** | the `FOR ALL` / `TO PUBLIC` / `auth.uid() IS NULL` sweep returns **0 rows** |
| **9d** | **§9d** | `vendors` anon column allowlist = the **24** public-face columns, `id` among them |
| **9f** | **§9f** | **BOTH** `UPDATE` policies on `profiles` PIN `is_designer`; the owner's is the one-way **ratchet** (B2 v3(c)); the sibling's `USING` reads the OLD row over **both** client strings; and `designer_clients` carries the two RESTRICTIVE write policies, predicating on `user_roles` and **not** on `profiles.role` |

**9f is the blocker probe and it wants TWO rows.** `profiles` carries two permissive `UPDATE` policies;
Postgres ORs the permissive `WITH CHECK`s, and a permissive policy whose `WITH CHECK` is NULL reuses its
own `USING` — so one policy with a role pin and one without is no pin at all. If §9f returns one row, or
two rows one of which has a null `with_check`, the hole is open.

Probe 4 fails loudly if the column allowlist forgot `id`. Probe 5 is a **different principal** from
probes 1-3 (the portal's own server-side client, not the anon key) — **G3 needs both**.

**The 9d and 9f shapes, measured on the LOCAL stack after `pnpm supabase:reset` (2026-09-02, fix
round 3)**, so you know what "after" looks like before you run them against Strata:

```
-- 9f, profiles
                 policyname                 |  cmd   | has_with_check | pins_is_designer | ratchet_floor | using_pins_old_row | using_client_vocab | checks_caller_authority
--------------------------------------------+--------+----------------+------------------+---------------+--------------------+--------------------+-------------------------
 Designers can update their client profiles | UPDATE | t              | t                | f             | t                  | t                  | t
 Users can update own profile               | UPDATE | t              | t                | t             | f                  | f                  | f
(2 rows)

-- 9f-ia, designer_clients
              policyname              |  cmd   | permissive  | reads_user_roles | reads_profile_role
--------------------------------------+--------+-------------+------------------+--------------------
 designer_clients_updater_is_designer | UPDATE | RESTRICTIVE | t                | f
 designer_clients_writer_is_designer  | INSERT | RESTRICTIVE | t                | f
(2 rows)

-- 9f-ii, handle_new_user is 00313 verbatim
 t

-- 9d
24
```

**Five of those columns say the opposite thing on the two rows, and every one of them is deliberate.**

- **`using_pins_old_row` is `f` on the OWNER policy and `t` on the SIBLING.** The owner's `USING` is
  `auth.uid() = id` and its pin lives in the `WITH CHECK`, through the SECURITY DEFINER helper. On the
  sibling it must be `t`: an `f` there is the demotion hole RF-01 closed — a `WITH CHECK` pinned to
  literals is satisfied *by construction* when the caller is turning a designer INTO a homeowner.
- **`ratchet_floor` is `t` on the OWNER policy and `f` on the SIBLING.** This is new in fix round 3 and
  it is ruling **B2 v3(c)**: the owner's `WITH CHECK` is a one-way ratchet, `role` may fall to
  `'homeowner'` and `is_designer` to `false`, never upward. An `f` on the owner row means the ratchet
  is gone and the iOS app's A3-07 fix (W1 · L1-A) will start 403-ing. A `t` on the sibling row would
  mean somebody put a self-downgrade leg on a policy that edits **other people's** rows — read it
  immediately.
- **`using_client_vocab` is `t` on the SIBLING and `f` on the OWNER.** Ruling **B2 v3(e)**: the sibling
  must read `role IN ('homeowner','client')`, because production and the fixtures both carry clients
  under both strings and `'homeowner'` alone left a designer unable to rename their own client. The
  owner policy has no vocabulary list at all, so `f` is right there. The probe matches the **quoted**
  strings — the bare words `client` and `designer_clients` are all over the sibling's `EXISTS`
  subquery, so an unquoted match would pass on a policy that had dropped the literal.
- **`checks_caller_authority` is `t` on the SIBLING and `f` on the OWNER.** New in fix round 3 pass 2,
  finding **RF3-03**. The sibling edits **other people's** rows, so both its clauses now open with the
  same two-signal predicate the `designer_clients` restrictive policies use —
  `current_profile_is_designer() IS TRUE OR EXISTS (user_roles ⨝ roles, domain IN ('designer','admin'))`.
  An `f` there means a roster row minted **before** 00555 by a non-designer still buys its holder a
  write on that client's profile: the restrictive policies govern new writes only, and this migration
  deletes no existing roster row. The owner policy is `f` because the caller *is* the target row there,
  so `auth.uid() = id` already answers the authority question.
- **`reads_profile_role` is `f` on BOTH `designer_clients` rows, and `reads_user_roles` is `t`.** That
  is finding **RF2-01**. Fix round 2 shipped these two with an
  `OR current_profile_role() IN ('designer','admin','super_admin')` leg — and `handle_new_user` gives
  **every** email/password signup exactly that label, so the leg read *"anyone who completed a signup
  form may mint a roster row"*. A `t` in `reads_profile_role` means the vulnerability is back.

**`pins_is_designer` is not decoration, and it matches the COMPARISON rather than the column name.**
`profiles.role` is a label; `profiles.is_designer` is the column the designer-side RPCs actually read as
authority — `claim_design_request` and the `open_design_requests` view (00286),
`accept_design_request` (00330), `design_request_submit` (00285),
`_can_manage_configurable_product`, and 00555's own `search_shareable_designers`. An earlier version of
this probe asked `with_check ILIKE '%is_designer%'`, which the substring inside
`current_profile_is_designer()` satisfies on its own — it would have passed over a `WITH CHECK` that
pinned nothing (RF-06). Note also that Postgres DEPARSES `a IS NOT DISTINCT FROM b` as
`NOT (a IS DISTINCT FROM b)`, which is the spelling the owner row is matched on.

Reproduce them directly with, respectively:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT policyname, cmd, (with_check IS NOT NULL) AS has_with_check,
          (with_check ILIKE '%NOT (is_designer IS DISTINCT FROM%'
           OR with_check ILIKE '%is_designer IS NOT TRUE%')          AS pins_is_designer,
          (with_check ILIKE '%is_designer = false%'
           AND with_check NOT ILIKE '%is_designer = true%')          AS ratchet_floor,
          (qual ILIKE '%is_designer IS NOT TRUE%')                   AS using_pins_old_row,
          (qual ILIKE '%''homeowner''%' AND qual ILIKE '%''client''%') AS using_client_vocab,
          (COALESCE(qual,'') ILIKE '%current_profile_is_designer%'
           AND COALESCE(qual,'') ILIKE '%user_roles%'
           AND COALESCE(with_check,'') ILIKE '%current_profile_is_designer%'
           AND COALESCE(with_check,'') ILIKE '%user_roles%')         AS checks_caller_authority
     FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE'
    ORDER BY policyname;"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT policyname, cmd, permissive,
          (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%user_roles%'           AS reads_user_roles,
          (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%current_profile_role%' AS reads_profile_role
     FROM pg_policies
    WHERE schemaname='public' AND tablename='designer_clients'
      AND policyname LIKE 'designer_clients_%is_designer' ORDER BY policyname;"

psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT pg_get_functiondef(p.oid) LIKE '%COALESCE(v_role, ''designer'')%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%raw_app_meta_data%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';"

psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='vendors'
      AND grantee='anon' AND privilege_type='SELECT';"
```

**Two `profiles` rows in the shape above, two RESTRICTIVE `designer_clients` rows with
`reads_profile_role = f`, `handle_new_user` → `t`, and the count `24`.** Anything else and something is
open — go back to `00555_probes.md` §9d / §9f / §9f-ia / §9f-ii for the full column list and the policy
predicates.

**Four more one-line ACL checks, new in fix round 3** (RF2-08 / RF2-09 / RF2-10 / RF3-07):

```bash
psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
     FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name='designer_clients' AND grantee='anon';"
# want exactly SELECT — one grant, and that grant is SELECT (RF2-08, corrected by RF3-01)
```

⚠ **`SELECT` here is the answer, not a leftover — do not "fix" it to zero.** An earlier draft of this
line and of `00555_probes.md` §9f-ib both said *want 0*, which contradicts the migration, which
`GRANT SELECT ON public.designer_clients TO anon` and then **ASSERTs** the privilege is present. The
reason is not a caller of this table: `storage.objects` carries the policy *"Designers manage discovery
folio objects"* (`00224:165`) whose `USING` reads `designer_clients`, and **Postgres checks the ACL of
every table named in a relation's policy set at executor init, before filtering those policies by
role.** The policy is `TO authenticated`; the check is not. Revoking `SELECT` therefore `42501`s every
**anon** read of `storage.objects` and takes two unrelated suites red. RLS still returns `anon` zero
rows from the table itself (`00014`'s policy is `auth.uid() = designer_id`, and `auth.uid()` is NULL
for anon), so the grant satisfies a permission check without opening a read. The query above asks for
the **set** rather than the count precisely so that a returned write grant still fails it.

```bash
psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT has_table_privilege('authenticated','public.profiles','TRUNCATE')
       OR has_table_privilege('authenticated','public.profiles','REFERENCES')
       OR has_table_privilege('authenticated','public.designer_clients','TRUNCATE')
       OR has_table_privilege('authenticated','public.designer_clients','REFERENCES');"
# want f — RLS does not constrain TRUNCATE (RF2-09 on profiles, RF3-07 on designer_clients)

psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT has_function_privilege('public','public.handle_new_user()','EXECUTE')
       OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE');"
# want f — a trigger function needs no EXECUTE grant to fire (RF2-10, extended to
#          authenticated by RF3-11)
```

**Advisors** (read-only; you or an agent):

```
mcp__claude_ai_Supabase__get_advisors(project_id="bkvcixdmuyejfzcijpdg", type="security")
```
or the dashboard: project `bkvcixdmuyejfzcijpdg` → Advisors → Security.

The `security_definer_view` **ERROR count must still be 21**. 00555 creates no view at all
(`profile_cards` was cut), so the count cannot move for that reason; a 22nd means something else was
added and needs reading. 00555's five new functions — `can_view_profile`, `current_profile_role`,
`current_profile_is_designer`, `search_shareable_designers`, `list_vendor_profiles` — are SECURITY
DEFINER with a pinned `search_path`, so none of them should raise `function_search_path_mutable`.
(`current_profile_is_designer` was added in fix round 1 and is the fifth; a checklist that still says
four is pre-2026-09-02.) `current_profile_role` is the one to check
by name: it is the smallest of the four and the `profiles` UPDATE policy cannot work without it. The
migration's own verification block fails the transaction with *"authenticated cannot execute
current_profile_role — the UPDATE policy denies every write"* if its grant did not land.

### B8 — The Document still works. A WALK, not a probe, and half of G3.

```bash
mkdir -p /Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/shots/w0/l0.2b-portal-after
```

Signed in as yourself on `app.patina.cloud`, screenshot each of the four:

1. The **vendors catalogue** page renders its rows.
2. A **vendor detail** opens, with its trade fields (you are signed in — they belong there).
3. The **People directory** shows names, emails and phones.
4. **Roster and team avatars** resolve — no nameless rows.

Screenshots to `artifacts/ios-testflight-polish-2026-09-01/shots/w0/l0.2b-portal-after/`.
**Any regression here is an immediate rollback, not a follow-up.**

**This list used to have a fifth item — "the comms vendor picker lists vendors and does not show an
error state" — and it was removed in fix round 3 (RF2-12) because there is no such screen.**
`useVendorProfiles` has no UI consumer: the grep returns only the hook's definition, the package barrel
that re-exports it, and its own test. **A6 and A3 already say this** about the same hook, in the same
runbook, and B8 asked you to screenshot it anyway. A walk step aimed at a screen that does not exist is
worse than a missing one: it cannot pass, so it either gets marked done without being done or it stalls
the block. Re-run the grep if you want to confirm nothing landed since:

```bash
cd "$REPO"
grep -rn 'useVendorProfiles' apps packages --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

If that returns anything under `apps/`, a lane has wired it up since this was written — put the step
back and screenshot it.

The `list_vendor_profiles` RPC still ships and is still correct: the hook must not throw `42501` the
moment someone does wire it up, and probe **§9a** in `00555_probes.md` covers the function directly.

### B9 — rollback

**Do not reach for this silently — it re-opens the exposure `A3-04` describes.** Use it if B8 regresses,
then say so in the apply report.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "CREATE POLICY \"Profiles are viewable by everyone\" ON public.profiles FOR SELECT USING (true);
   GRANT SELECT ON public.profiles TO anon;"
```

That restores the read path the portal and both apps used before 00555. It does **not** undo the
`vendors` column split, the dropped marketing-rail policies, the `WITH CHECK` on
`"Users can update own profile"`, the two RESTRICTIVE policies on `designer_clients`, or the
`is_designer` pin on the `profiles` INSERT legs. If one of *those* is the regression, the narrower
undos, each independent of the others:

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "GRANT SELECT ON public.vendors TO anon;"
```

**The own-row `UPDATE` pin.** ⚠ **This one is not a plain revert to 00013, and the reason matters.**
00013's original is `FOR UPDATE USING (auth.uid() = id)` with **no `WITH CHECK`** — which is the
self-elevation hole §a2(i-a) exists to close. Recreating it verbatim hands every authenticated account
`profiles.is_designer = true` on its own row, and that is the column the design-request pool (00286),
`accept_design_request` (00330) and `search_shareable_designers` read as **authority**. So the undo
below **keeps the `is_designer` pin and drops only the `role` ratchet leg** (RF3-08). That is also the
likelier regression by far: the only thing this policy newly permits is L1-A's `PATCH role='homeowner'`,
which needs the role half alone.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS \"Users can update own profile\" ON public.profiles;
   CREATE POLICY \"Users can update own profile\" ON public.profiles
     FOR UPDATE TO authenticated
     USING ((SELECT auth.uid()) = id)
     WITH CHECK (
       (SELECT auth.uid()) = id
       AND (is_designer IS NOT DISTINCT FROM public.current_profile_is_designer()
            OR is_designer = false)
     );"
```

If you genuinely need 00013's shape back — and you should be able to name what broke that the statement
above does not fix — it is the one below. **It re-opens `is_designer` self-elevation platform-wide, on
the column the whole designer rail reads. Prefer almost anything else, and say so in the apply report if
you run it.**

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS \"Users can update own profile\" ON public.profiles;
   CREATE POLICY \"Users can update own profile\" ON public.profiles
     FOR UPDATE USING (auth.uid() = id);"
```

**The sibling `UPDATE` policy's caller-authority check (RF3-03)**, if a real designer turns out to be
unable to edit a client they already have. Same warning as the roster-mint undo below — **prefer
granting that account a designer-domain `user_roles` row**, which is one row and fixes both symptoms at
once. B7a's audit names the affected accounts before the apply, which is why it is a hard stop.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS \"Designers can update their client profiles\" ON public.profiles;
   CREATE POLICY \"Designers can update their client profiles\" ON public.profiles
     FOR UPDATE TO authenticated
     USING (EXISTS (SELECT 1 FROM public.designer_clients dc
                     WHERE dc.client_id = profiles.id
                       AND dc.designer_id = (SELECT auth.uid()))
            AND role IN ('homeowner','client') AND is_designer IS NOT TRUE)
     WITH CHECK (EXISTS (SELECT 1 FROM public.designer_clients dc
                          WHERE dc.client_id = profiles.id
                            AND dc.designer_id = (SELECT auth.uid()))
                 AND role IN ('homeowner','client') AND is_designer IS NOT TRUE);"
```

**The roster mint (RF2-01), if a real designer turns out to be locked out of Add Client.** Dropping
these two restores the pre-00555 posture on `public.designer_clients`, where **any** authenticated
account can mint a roster row — which is the primitive behind the profile-takeover chain, so prefer
granting the affected account a designer-domain `user_roles` row over reaching for this. B7a's audit is
what tells you which of the two you are actually looking at.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS designer_clients_writer_is_designer  ON public.designer_clients;
   DROP POLICY IF EXISTS designer_clients_updater_is_designer ON public.designer_clients;"
```

**The `profiles` INSERT leg**, if some path that legitimately inserts its own profiles row starts
failing. 00013's original had `WITH CHECK ((auth.uid() = id) OR (auth.uid() IS NULL))`; the second leg
is the anon write hole and must **not** come back, so the undo restores only the first half — which is
00555's own policy minus the `is_designer` pin.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS \"Users can insert own profile\" ON public.profiles;
   CREATE POLICY \"Users can insert own profile\" ON public.profiles
     FOR INSERT TO authenticated
     WITH CHECK ((SELECT auth.uid()) = id);"
```

And the 00017 INSERT sibling, whose only 00555 change is the `is_designer` pin and the re-scope from
`PUBLIC` to `authenticated`:

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "DROP POLICY IF EXISTS \"Designers can create homeowner profiles\" ON public.profiles;
   CREATE POLICY \"Designers can create homeowner profiles\" ON public.profiles
     FOR INSERT TO authenticated
     WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND role = 'homeowner');"
```

⚠ **Dropping either INSERT policy without re-creating it locks out the path it serves**, and dropping
only one of the two leaves the other as an OR-branch around the pin you were trying to remove — which
is the OR-branch mistake this migration spent two fix rounds on. Run the `DROP` and the `CREATE` in the
same statement, as written above.

**Not rolled back by any of this:** the `REVOKE`s. The write half of `designer_clients` from `anon`
(RF2-08 — the `SELECT` is **kept**, see B7), `TRUNCATE` and `REFERENCES` on `profiles` **and on
`designer_clients`** from `authenticated` (RF2-09, RF3-07), and `EXECUTE` on `handle_new_user` from
`PUBLIC`, `anon` **and `authenticated`** (RF2-10, RF3-11) have no callers by construction — if one of
them is somehow the regression, the undo is the matching `GRANT`, and it is worth a hard look at what
was using it.

### B10 — three things you are being told, not asked

1. **`can_view_profile` is a relationship oracle.** It is `GRANT EXECUTE … TO authenticated` and lives
   in the PostgREST-exposed `public` schema, so any signed-in user can `POST
   /rest/v1/rpc/can_view_profile` with an arbitrary uuid and learn whether they have a relationship with
   that person. The grant is **required** (Postgres checks policy-function EXECUTE at executor-init) and
   the function only ever answers about the caller's own relationships. Nothing needs to change to ship.
   But **DM-1 ruled on the anon read and the PII split, not on this** — it is a new authenticated-facing
   surface, and moving the helper to a non-exposed schema is scheduled into the W2 `profile_private`
   migration. Its predicate is also partly self-assertable: several of the linking rows it joins (a
   lead, a scan share) are INSERTable by an ordinary authenticated user.
2. **The counterparty read is the whole row.** Admitting a caller exposes `email`, `phone` and
   `stripe_customer_id` too, until the PII split. That is DM-1 as ruled, restated so it is not a surprise
   later.
3. **A real designer can roster any homeowner and rewrite that homeowner's email — which redirects
   their invoices.** `designer_clients` accepts any `client_id`, so a designer can add a stranger to
   their roster with no prior relationship and then `PATCH` that profile. Measured on a clean stack:
   the seeded designer `POST`ed `designer_clients{designer_id: self, client_id: <a homeowner>}` → 201,
   then `PATCH`ed that profile's `email` and `phone` → 200. **This is not the cosmetic edit an earlier
   draft of this block called it (RF3-04).** `supabase/functions/invoice-send/index.ts:204` resolves the
   recipient as `invoice.client?.email` **first** and falls back to `designer_clients.client_email` only
   when that is null; `invoice-reminders` and `stripe-webhook` resolve in the same order. So the reach is
   invoice-recipient **redirection**.
   **It is not a merge blocker**, and that is a judgement, not an oversight: before 00555 *any*
   authenticated account could do this, and after it only an account holding real designer authority
   can. Strictly narrower, on a platform whose designer population is vetted. The W2 fix is
   **column-scoped** — a designer may edit display and notes fields on a rostered client, never
   `email`, `phone` or `stripe_customer_id` — and that scope is the whole point of filing it rather than
   widening this migration. The non-designer version of the same trick is closed here, prospectively by
   the two RESTRICTIVE policies on `designer_clients` and retrospectively by the caller-authority check
   on the sibling `UPDATE` policy (RF3-03).

**Also owed, and not blocking:** 00555's READERS block enumerates **nine silent degradations** — reads
that answer `200` with a `null` embed, so nothing logs and a name simply disappears. Open
`build/waves/w3/00555-degradations.md` with one line per site and a verdict (*cosmetic* /
*audit-relevant* / *row-losing*). **Two of the nine are not cosmetic:** `project_unbilled_time` is a
SECURITY INVOKER view with an **INNER JOIN** on `profiles`, so it does not null a name — it **loses
rows**, and therefore **understates unbilled time**; and `use-commercial-documents.ts:1290` is the
acceptance recorder, an **audit** field, not decoration.

---

## Block C — apply 00557, `increment_scan_upload_attempt`

**What it proves.** That the one RPC the iOS uploader calls and production does not have now exists
(**D13** — write the function rather than delete the call, because removing a call is a behaviour change
in a lane not otherwise touching the upload path). It mirrors `mark_scan_upload_complete`'s shape and
grants: SECURITY INVOKER, pinned `search_path`, anon + authenticated EXECUTE.

Run it in the same shell as Block B (`$STRATA_DB_URL` is already set); B0 re-assigns it if not.

```bash
cd "$REPO"

psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00557_increment_scan_upload_attempt.sql

psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00557','increment_scan_upload_attempt') ON CONFLICT DO NOTHING;"
```

### C1 — the probe

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT p.proname,
          pg_get_function_identity_arguments(p.oid) AS args,
          p.prosecdef                               AS security_definer,
          p.proconfig                               AS config,
          pg_get_userbyid(acl.grantee)              AS grantee,
          acl.privilege_type
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     LEFT JOIN LATERAL aclexplode(p.proacl) AS acl ON true
    WHERE n.nspname = 'public' AND p.proname = 'increment_scan_upload_attempt'
    ORDER BY grantee, privilege_type;"
```

**Want exactly this**, measured on the local stack after `pnpm supabase:reset` on 2026-09-02 — four
rows, one per grant:

```
            proname            |      args      | security_definer |        config        |    grantee    | privilege_type
-------------------------------+----------------+------------------+----------------------+---------------+----------------
 increment_scan_upload_attempt | p_scan_id uuid | f                | {search_path=public} | anon          | EXECUTE
 increment_scan_upload_attempt | p_scan_id uuid | f                | {search_path=public} | authenticated | EXECUTE
 increment_scan_upload_attempt | p_scan_id uuid | f                | {search_path=public} | postgres      | EXECUTE
 increment_scan_upload_attempt | p_scan_id uuid | f                | {search_path=public} | service_role  | EXECUTE
```

`security_definer = f` and `EXECUTE` for `anon` **and** `authenticated` are the two that matter — they
are what mirrors `mark_scan_upload_complete`. `config` is `{search_path=public}`, **not**
`search_path=public, pg_temp`; that is the function as written and is not a defect. A `-` in the grantee
column would be `PUBLIC`, and there should be none. Then confirm the ledger:

```bash
psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT version || '|' || name FROM supabase_migrations.schema_migrations
    WHERE version IN ('00555','00557') ORDER BY version"
```

**Rollback: none needed.** 00557 only adds a function the app already calls and already falls back
from. If it must come off, `DROP FUNCTION public.increment_scan_upload_attempt(uuid);` returns
production to exactly where it was — but that is undoing a fix, not repairing a break.

---

## Block D — the demo account, `firstflight@patina.cloud` (D7 + D11)

**What it proves.** That the identity L0.5's beta-review notes name, the one W1 · L1-A's
`AuthService.verifyOtp` fallback signs in, and the one the device pass walks, exists on Strata with a
real-looking house: one project with a live designer, one decision awaiting the client, one sent
proposal, one open invoice, one document and one thread. It retires `tester@patina.cloud` from the app's
story and closes `A3-15`.

Full narrative version, with what was proved locally and at what level:
[`demo-account.md`](demo-account.md). This block is the ordered command set.

### D0 — read this before you start

**There is no clean rollback for one row.** `guard_proposal_copy_immutability()` refuses to DELETE a
non-draft proposal and `guard_proposal_authority()` refuses to move its status back to `draft` — both
were hit for real on the local stack:

```
ERROR:  non-draft proposals are immutable editions and cannot be deleted
ERROR:  proposal status may only change through its canonical lifecycle authority
```

So the `sent` proposal this seeds is **permanent on Strata**. Everything else can be deleted; that one
cannot. Three things make it safe rather than alarming: it is **one transaction** (any failure leaves
production exactly as it was); it is **idempotent** (every row carries a fixed `ff`-prefixed uuid with
`ON CONFLICT (id) DO NOTHING` — a second run reports `INSERT 0 0` on every statement); and every row is
identifiable at a glance by that `ff` prefix.

### D1 — variables

```bash
export REPO=/Users/kody/Code/patina-merged
export SUPABASE_URL="https://bkvcixdmuyejfzcijpdg.supabase.co"
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' "$REPO/infra/.env" | cut -d= -f2-)"
export SERVICE_ROLE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/infra/.env" | cut -d= -f2-)"
export DEMO_SQL="$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/demo-account.sql"

test -n "$SERVICE_ROLE_KEY" && echo "service role key: loaded (${#SERVICE_ROLE_KEY} chars)"
test -n "$STRATA_DB_URL"    && echo "db url: loaded"
test -f "$DEMO_SQL"         && echo "seed file: found"
```

### D2 — ✅ RULED. The seed already carries it; nothing to edit before D6.

> **Ruling D2-demo (Fable, 2026-09-02): the demo proposal ships at
> `client_visibility_tier = 'full'`.** The demo account exists to show a tester a real house, and the
> proposal is where the money lives. **`demo-account.sql` has been changed** — the line now reads
> `'legacy', 'full', TRUE, FALSE, 0,`. Do not edit it.

**The vocabulary, so the choice is legible.** The column takes exactly three values
(`00084_project_management_mvp.sql:35` for `projects`, `00141_proposal_client_visibility_tier.sql:28`
for `proposals` — `CHECK (client_visibility_tier IN ('full','milestone','curated'))`), and
`get_client_proposal_bundle` (`00390_proposal_copy_immutability.sql:1622-1700`) reads them as:

| tier | what the client's proposal read returns |
|---|---|
| `curated` | `items` collapses to `[]` — **no line items at all** |
| `milestone` | items render, but `unit_sell_price`, `line_total_cents`, `vendor_name`, `budget_min_cents`, `budget_max_cents`, `brand`, `source_url` and `price_retail` are **all forced to NULL**, and `record_completeness_hidden` is set |
| `full` | the line items carry their money |

`total_amount` is on the proposal header and is returned on every tier, which is exactly why
`milestone` reads as a bug: an $18,500 header over five line names with blank prices (`L07-07`).
**`full` is the only tier that shows line items with prices**, so `full` it is.

**One-way, and that is why it was a gate.** `guard_proposal_copy_immutability` (00390:1243) lists
`client_visibility_tier` among the columns a **non-draft** proposal may never change, and this row is
inserted as `sent`. It had to be right before D6, not after.

**What did not change.** The `projects` row (~line 125) keeps `'milestone'` — that column governs the
project surface, not this proposal read — and nothing else in `demo-account.sql` moved. W1 · L1-E's
`L07-07` copy line ("Your designer is sharing the scope, not the line prices.") stays **optional**: it
is the string for a designer who deliberately withholds prices, and the demo account is no longer one.

### D3 — create the auth user (GoTrue admin API)

No password and no mailbox: `email_confirm: true` marks it confirmed outright, and sign-in happens
through the Vault code in D7. `user_metadata.role` is `homeowner` deliberately — `handle_new_user`
honours exactly one client-supplied role string and that is it, and it is the same string the iOS app
sends at `AuthService.swift:437` and `:563`.

```bash
curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"firstflight@patina.cloud","email_confirm":true,"user_metadata":{"role":"homeowner","display_name":"First Flight"}}'
```

Expect a JSON user object with an `id`. `{"code":422,"msg":"A user with this email address has already
been registered"}` means it already exists — fine, skip to D4. Confirm the trigger did its half:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, role, display_name FROM public.profiles WHERE email = 'firstflight@patina.cloud';"
```

Expect one row, `role = homeowner`. **Either order works relative to Block B** — 00313 already honours
the explicit hint; 00555 §a2(ii) only changes what happens when there is no hint.

### D4 — resolve Leah's profile id and her studio id (read-only)

**Look first.** This prints every candidate, so you can see whether the match is unambiguous before
anything is assigned:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, display_name, full_name, business_name, created_at
     FROM public.profiles
    WHERE is_designer IS TRUE AND (email ILIKE '%leah%' OR full_name ILIKE '%leah%')
    ORDER BY created_at;"
```

**Then assign by command substitution, never by retyping a uuid.** If the query above returned more than
one designer, narrow the `WHERE` clause here to the one you want *before* running it:

```bash
export DESIGNER_PROFILE_ID="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT id FROM public.profiles
    WHERE is_designer IS TRUE AND (email ILIKE '%leah%' OR full_name ILIKE '%leah%')
    ORDER BY created_at LIMIT 1")"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, display_name, full_name FROM public.profiles WHERE id = '$DESIGNER_PROFILE_ID';"

export STUDIO_ID="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT o.id
     FROM public.organizations o
     JOIN public.organization_members m ON m.organization_id = o.id
    WHERE m.user_id = '$DESIGNER_PROFILE_ID' AND m.status = 'active'
    ORDER BY o.created_at LIMIT 1")"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, name, type FROM public.organizations WHERE id = '$STUDIO_ID';"

echo "designer: ${DESIGNER_PROFILE_ID:-EMPTY — STOP}"
echo "studio:   ${STUDIO_ID:-EMPTY — STOP}"
```

**Read those rows back before continuing.** This is the designer who will appear in the demo client's
house, on the proposal, on the invoice and in the thread. A wrong match is written into production in D5
and the `sent` proposal cannot be deleted. An empty value means the `ILIKE` matched nothing, or Leah has
no `active` membership — **stop and fix the query**, because `psql -v` would substitute an empty string.

### D5 — pre-flight the one value that can collide

`uniq_invoices_studio_number` makes `(studio_id, invoice_number)` unique, and
`chk_invoices_number_when_issued` requires a number on any non-draft invoice. The script uses `FF-0001`.

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, invoice_number, status, total_cents
     FROM public.invoices
    WHERE studio_id = '$STUDIO_ID' AND invoice_number = 'FF-0001';"
```

Expect **zero rows**. If a row comes back, edit `invoice_number` in `demo-account.sql` to `FF-0002` (or
the next free one) before running it — do not delete the existing invoice.

### D6 — run the seed

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v designer_profile_id="$DESIGNER_PROFILE_ID" \
  -v studio_id="$STUDIO_ID" \
  -f "$DEMO_SQL"
```

The script prints its own verification after `COMMIT`. Expect, in order:

```
 projects | pending_decisions | sent_proposals | payable_invoices
        1 |                 1 |              1 |                1

 client_visible_docs | live_threads | messages
                   1 |            1 |        1

 id | email | role | display_name | is_designer
 …  | firstflight@patina.cloud | homeowner | First Flight | f

 invoice_number | status | total_cents | amount_paid_cents | balance_cents | currency | due_date
 FF-0001        | sent   |        4200 |                 0 |          4200 | USD      | (future)
```

The first row is the one that matters: `EngagementTier.resolve` returns `.activeProject` when any of
those four counts is above zero, so all four at 1 means the app opens on the Studio, not on the
marketplace pitch. The last query (`V5`) prints `f` when run as `postgres` because `auth.uid()` is NULL
for a superuser session — that is expected, and D8's check is the real one.

### D7 — append the account to the Vault allow-list

**Append. Never replace.** `test_login_accounts` is a comma-separated list and `tester@patina.cloud`
(and possibly others) are already in it; overwriting silently unhooks every account already there.

Read the current value first:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app.settings.test_login_accounts';"
```

Then, in the Supabase dashboard → **Project Settings → Vault**, open
`app.settings.test_login_accounts` and set its value to **exactly what you just read, with
`,firstflight@patina.cloud` appended** — no spaces around the comma.

Confirm both halves exist (the edge function fails closed if either is missing —
`supabase/functions/test-account-login/lib.ts`), then confirm the read path the function actually uses:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT name, length(decrypted_secret) AS len
     FROM vault.decrypted_secrets
    WHERE name IN ('app.settings.test_login_accounts', 'app.settings.test_login_code')
    ORDER BY name;"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT public.app_setting('test_login_accounts') LIKE '%firstflight@patina.cloud%' AS allowlisted;"
```

Both rows present with `len > 0`; the second query returns `t`.

### D8 — verify

**D8a — the login round trip.** This mints a real single-use magiclink token. Reading the response is
the proof; do **not** open the link — consuming it burns the token.

```bash
export TEST_LOGIN_CODE="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name = 'app.settings.test_login_code'")"
echo "test login code: ${#TEST_LOGIN_CODE} chars"     # non-zero, or D7 did not land

curl -sS -X POST "$SUPABASE_URL/functions/v1/test-account-login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({'email': 'firstflight@patina.cloud',
                  'code': os.environ['TEST_LOGIN_CODE']}))
")" | cut -c1-120
```

Expect a body containing **`token_hash`** — that is the key the function returns
(`lib.ts:256`). `hashed_token` is only GoTrue's internal property name, so looking for that string reads
a correct success as a failure. A generic `403` means the allow-list append did not land or the code does
not match — the function returns the *same* 403 for every failure on purpose, so re-check D7 rather than
guessing which half is wrong. A `429` is the rate limiter (00551: 20 per IP or 300 globally in the
trailing 15 minutes) — wait and retry.

**D8b — the counterparty read, as the account itself.** Run this **after** Block B; it is the half that
proves 00555 did not blind the demo account.

```bash
psql "$STRATA_DB_URL" -X -q <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM auth.users WHERE email='firstflight@patina.cloud'),
                    'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT 'projects'  AS surface, count(*) FROM public.projects
UNION ALL SELECT 'decisions', count(*) FROM public.client_decisions WHERE status='pending'
UNION ALL SELECT 'invoices',  count(*) FROM public.invoices
UNION ALL SELECT 'documents', count(*) FROM public.project_documents
UNION ALL SELECT 'threads',   count(*) FROM public.comms_threads
UNION ALL SELECT 'messages',  count(*) FROM public.comms_messages;
SELECT jsonb_array_length(public.list_client_proposals()) AS proposals;
ROLLBACK;
SQL
```

Expect `1` on every surface and `proposals = 1`. A `0` on `projects` or `invoices` means the RLS leg did
not admit the account; a `0` on `messages` means the thread's participant rows are wrong.

**D8c — the app.** Sign in on the simulator or the device as `firstflight@patina.cloud` with the Vault
code. The Studio should show one project, one decision waiting, one proposal to sign, one invoice to
pay, one document and one unread message from Leah — **with Leah's name on it**, not a blank.

### D9 — rollback, and how far it actually goes

**Read this before you run it. It deletes production rows, and it deliberately stops short.**

`demo-account.sql` inserts into ten tables, in this order: `designer_clients` · `projects` ·
`client_decisions` · `client_decision_options` · `proposals` · `invoices` · `project_documents` ·
`comms_threads` · `comms_thread_participants` · `comms_messages`. The block below removes the last
eight, in reverse, in one transaction:

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM public.comms_messages            WHERE id::text        LIKE 'ff%';
DELETE FROM public.comms_thread_participants WHERE thread_id::text LIKE 'ff%';
DELETE FROM public.comms_threads             WHERE id::text        LIKE 'ff%';
DELETE FROM public.project_documents         WHERE id::text        LIKE 'ff%';
DELETE FROM public.invoices                  WHERE id::text        LIKE 'ff%';
DELETE FROM public.client_decision_options   WHERE id::text        LIKE 'ff%';
DELETE FROM public.client_decisions          WHERE id::text        LIKE 'ff%';
COMMIT;
SQL
```

**Three rows are NOT in that list, on purpose:**

- **The `sent` proposal (`ff400000-…`) cannot be deleted.** `guard_proposal_copy_immutability` refuses
  the DELETE outright — proved on the local stack, verbatim: *"non-draft proposals are immutable
  editions and cannot be deleted"*.
- **The project (`ff100000-…`) and the `designer_clients` row (`ff200000-…`) are therefore also stuck**,
  because the surviving proposal references both, and the same trigger blocks the `ON DELETE SET NULL`
  update that would otherwise release the `designer_client_id` link. *(This is read from the schema and
  from 00390:1178-1250, **not** executed — if you do try, `ON_ERROR_STOP` aborts the whole transaction
  and nothing is written, which is the safe failure.)*

So a full retirement is: run the block above, remove `firstflight@patina.cloud` from the Vault
allow-list, and delete the auth user. Three `ff`-prefixed rows stay behind, orphaned, harmless and
obvious at a glance by that prefix. That is the price of the demo house, and it is why D0 says read the
script once and run it once.

---

## Block E — Stripe (D10) and APNs (D9). **Read-only. Nothing here mutates anything.**

**What it proves.** That the two credentials the device pass depends on are actually on the edge
runtime, so device rows **D-12** (Apple Pay / invoice payment) and **D-07** (push round trip) are *live*
rather than *blocked*. Both were outside the audit's reach — APNs env is edge-function env, not Vault,
and the Stripe key is yours.

```bash
export REPO=/Users/kody/Code/patina-merged
export PROJECT_REF=bkvcixdmuyejfzcijpdg
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' "$REPO/infra/.env" | cut -d= -f2-)"
```

### E1 — Stripe (D10)

```bash
cd "$REPO"
supabase secrets list --project-ref "$PROJECT_REF"
```

`secrets list` prints **names and digests, never values**. Want `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` both present.

**The digest cannot tell you live from test.** The only honest check of the *mode* is the Stripe
Dashboard: switch to **live** mode → Developers → API keys, and confirm the live secret key's last four
characters match the value you set. If you would rather verify from the shell without printing anything,
compare digests — and treat a non-match as inconclusive rather than as a failure, because the digest
algorithm is Supabase's, not yours:

```bash
# Paste the live key into this variable only; it is never echoed.
read -rs STRIPE_LIVE_KEY
printf '%s' "$STRIPE_LIVE_KEY" | shasum -a 256
unset STRIPE_LIVE_KEY
```

**The tax / shipping setting.** `create-checkout-session` reads
`fulfillment_config` key `direct_orders.tax_shipping_enabled` and **fails closed** — anything other than
an explicit `{"enabled": true}` is off:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT key, value, updated_at FROM public.fulfillment_config
    WHERE key = 'direct_orders.tax_shipping_enabled';"
```

**Zero rows, or a value that is not `{\"enabled\": true}`, means tax and shipping are OFF** — which is
correct for round one and needs no change: `direct-orders` is off (**D1**), so the only Stripe path a
tester takes is **paying an invoice**, and that path does not read this row. It is checked here so the
apply report can say which state it was in, not because it needs changing.

**What this block cannot prove.** That a payment completes. That is device row **D-12** — Apple Pay
inside hosted Checkout, on your phone, against a real small invoice, in R1's device pass. If the key
turns out to be test-mode, D-12 is reported **blocked**, never failed, and What to Test says so plainly.

### E2 — APNs (D9)

```bash
cd "$REPO"
supabase secrets list --project-ref "$PROJECT_REF"
supabase functions list --project-ref "$PROJECT_REF"
```

Want all four names present — `APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` — and
`apns-send` listed as **ACTIVE**. `APNS_TOPIC` must be the app's bundle id, `cloud.patina.app`; the
function picks the APNs host per token, so the plumbing is right and the credentials are the unknown.

The token side, which only has rows once a build has run on a device:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT environment, count(*), max(updated_at)
     FROM public.device_push_tokens GROUP BY environment ORDER BY environment;"
```

Before build 1 this is expected to be empty or to hold only `development` rows. **The row that matters
for D-07 is a `production` one**, and it appears only after a TestFlight build registers — which is why
D-07 is a device claim and closes in R1, not here. If it never appears, the first place to look is the
exported entitlement in Block I: an `aps-environment` of `development` registers sandbox tokens and the
push silently never arrives.

---

## Block F — Sanity: publish the three tour bodies

**What it proves.** That the app's first sentence is not false. `FirstLaunchTour.swift` renders
`loaded?.body ?? step.fallback?.body`, so **Sanity wins over the binary** — wrong copy in Sanity
overrides correct copy in the app.

Project `kv3qrinl`, dataset **`production`**. Studio `https://patina-help.sanity.studio/` (HTTP 200,
checked 2026-09-02). Full step-by-step with both routes and the exact MCP call shapes:
[`sanity-publish-steps.md`](sanity-publish-steps.md). Copy source: [`sanity-tour-copy.md`](sanity-tour-copy.md).

### F1 — the four documents

| `_id` | surfaceKey | field | new value |
|---|---|---|---|
| `cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54` | `ios-app/first-launch-tour/step-1-home` | `coachmarkContent.body` | `This is Today — what moved in your house, and what is waiting on you.` |
| `afb0ff70-4aa0-4d2d-ae11-e16a769160f1` | `ios-app/first-launch-tour/step-2-saved` | `coachmarkContent.heading` | `What needs you` |
| `afb0ff70-4aa0-4d2d-ae11-e16a769160f1` | *(same doc)* | `coachmarkContent.body` | `Anything waiting on you lands here, dated. Tap a line to go straight to it.` |
| `6581a570-0c16-487d-b50a-b3950b5f6f71` | `ios-app/first-launch-tour/step-3-profile` | `coachmarkContent.heading` | `Your Studio` |
| `6581a570-0c16-487d-b50a-b3950b5f6f71` | *(same doc)* | `coachmarkContent.body` | `Your studio — projects, proposals, invoices and files` |
| `50c728fe-68d2-4403-be5d-b42be3bcd651` | `ios-app/home/match-pill` | `tooltipContent.body` | `Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing.` |

Step 1's heading (`Welcome to Patina`) is already correct — leave it. **Do not rename any `surfaceKey`**:
they key the documents and are pinned by `PatinaTests/FirstLaunchTourTests.swift`.

### F2 — publish, and mind the draft trap

**Publish every document you touch. Do not leave a draft.** `SanityHelpClient` sends **no `perspective`
parameter** and pins API version `v2024-01-01`, whose default perspective is **`raw`** — which includes
`drafts.*`. The queries end in `[0]`, so with both a published document and a draft of it in the
dataset, two rows match and `[0]` picks one **non-deterministically**: the app can read either version,
and a different one on the next launch. The dataset had **zero** drafts on 2026-09-02, so this is a trap
you create by leaving one, not one that already exists.

On the desk: edit **Coachmark Content → Heading / Body** on the three tour documents (you will not see a
Tooltip section on them — the schema hides it unless `contentType` is `tooltip`/`fieldHelper`/`learnMore`,
and `coachmarkContent` is the object the app reads), and **Tooltip / Field Helper Content → Body Text**
on `match-pill`. That last field has a **hard** 160-character validation; the new sentence is 141.

### F3 — the probes, all read-only

**Probe 1 — the three tour bodies.** PROGRAM.md §3 · L0.4 prints this with `"body": pt::text(body)`;
**that projection returns `null`** — `body` is not a top-level portable-text field on `helpContent`.
Use this instead:

```
mcp__claude_ai_Sanity__query_documents(
  resource = {"projectId": "kv3qrinl", "dataset": "production"},
  perspective = "raw",
  query = '*[_type=="helpContent" && surfaceKey match "ios-app/first-launch-tour*"]
            | order(surfaceKey asc)
            { _id, surfaceKey, _updatedAt,
              "heading": coachmarkContent.heading,
              "body": coachmarkContent.body }'
)
```

Expect three rows, `_updatedAt` today, and the exact strings above. **Fail** if any row still contains
`Daily Room`, `+ Add`, or the heading `Your profile`.

**Probe 2 — the match-pill tooltip, through the app's own request shape:**

```bash
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]' \
  --data-urlencode '$sk="ios-app/home/match-pill"' \
  --data-urlencode '$ct="tooltip"' \
  --data-urlencode '$p="all"'
```
HTTP 200 and `result.tooltipContent.body` equal to the new sentence. **Fail** on any `PLACEHOLDER`.

**Probe 3 — no drafts left behind:**

```bash
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=count(*[_id in path("drafts.**")])'
```
Expect `"result":0`.

**Probe 4 — the "AI" and banned-word sweep, re-run on *published* content.** The repo-side compiled-
string sweep is clean; this copy lives outside the repo, so the sweep has to be re-run here. The exact
script is `sanity-publish-steps.md` §"Probe 4". **The gate is that no `coachmark` row and no
`ios-app/home/match-pill` row appears in its output** — the eleven `fieldHelper` placeholders are
deliberately left alone until W2 and will print.

**Probe 5 — the app actually shows it** (simulator; an agent may run this). Use the **D7/D11 demo
account**, which has never run the tour — completion state is cross-device, held in
`profiles.help_state`, so a reinstall alone will not bring the tour back for an account that has seen
it. Fresh-install state is `terminate` → `uninstall` → `xcrun simctl keychain` reset → `install` →
re-apply the status-bar override, with the clone's own udid spelled out on every call, never `booted`,
and a **signed** Debug build only — never a `CODE_SIGNING_ALLOWED=NO` product. Under **D1a** the walker
launches **without** `-PatinaFlags` and must see the four-tab bar. Capture with `xcrun simctl io`
screenshot only — never desktop capture. Expect `Step 1 of 3` reading the new sentence, and
`Step 3 of 3` anchored on the **Studio tab** of the bar.

**Rollback.** Re-publish the previous body text from the Studio's document history. Sanity keeps
revisions; nothing here is destructive.

---

## Block G — App Store Connect

**What it proves.** That `testflight review view` returns populated attributes with
`demoAccountRequired: true` and a demo account name matching **D11** — the L0.5 exit criterion — and that
the TestFlight card a tester sees is not blank.

App **6762007888** (`cloud.patina.app`) · CLI `~/.blitz/bin/asc` · credentials at
`~/.blitz/asc-credentials.json` (never printed). Full runbook, with the before-state and the four traps:
[`asc-runbook.md`](asc-runbook.md) · before-state [`asc-state-before.md`](asc-state-before.md).

### G0 — two traps that will bite before you type anything

1. **A boolean flag MUST be written `--flag=value`. A space kills the rest of the line.** Proved on the
   installed binary with read-only commands: `--internal false` still filtered to the internal group,
   and a `--output table` sitting *after* the stray word was never applied. So
   `--demo-account-required true` silently drops `--demo-account-name`, `--demo-account-password` and
   `--notes`, **and still exits 0**. Every boolean below is `=`-joined.
2. **Run `asc` outside any agent sandbox.** Inside it every call dies with
   `tls: failed to verify certificate: x509: OSStatus -26276` — the filtering proxy terminates TLS and
   `asc` correctly refuses the substituted certificate. Your own terminal is unaffected.

Two more, smaller: the review detail **already exists**, so the verb is `edit`, not `create`, and its id
is `6762007888` — the same digits as the app id, which reads like a typo and is not. And
`--demo-account-password` is **not a password**: the app has no password field; the value is the
six-digit `test_login_code` from the Strata Vault.

### G1 — variables and preflight

```bash
export ASC=~/.blitz/bin/asc
export APP=6762007888
export W0=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0

# Fill these five in before running anything in G2. An unset one fails the preflight loudly.
export FEEDBACK_EMAIL=
export CONTACT_EMAIL=
export CONTACT_PHONE=
export DEMO_ACCOUNT_EMAIL=firstflight@patina.cloud
export DEMO_ACCOUNT_CODE=
```

```bash
set -u
for f in beta-description.md beta-review-notes.md; do
  test -f "$W0/$f" || { echo "MISSING: $f"; exit 1; }
done
if grep -n 'PASTE_TEST_LOGIN_CODE' "$W0/beta-review-notes.md"; then
  echo "STOP — replace PASTE_TEST_LOGIN_CODE in beta-review-notes.md with the real six-digit code"
  exit 1
fi
for v in FEEDBACK_EMAIL CONTACT_EMAIL CONTACT_PHONE DEMO_ACCOUNT_EMAIL DEMO_ACCOUNT_CODE; do
  eval "val=\${$v:-}"
  test -n "$val" || { echo "STOP — $v is empty"; exit 1; }
done
wc -m "$W0/beta-description.md" "$W0/beta-review-notes.md"
echo "preflight OK"
```

Expected today: **2157** and **3862** characters — the notes file becomes 3847 once the six-digit code
replaces the 21-character token, 153 under Apple's 4000-character cap. Both files are **body text only**
— no headings, no `**`, no front matter — because `--description "$(cat …)"` and `--notes "$(cat …)"`
send them byte-for-byte to Apple. Anything added to those files is published.

**G depends on D.** `DEMO_ACCOUNT_EMAIL` is fixed by **D11**, and Block D must have minted
`firstflight@patina.cloud` and added it to the allow-list, or the credential this publishes to Apple
does not work.

### G2 — the two writes

```bash
$ASC testflight app-localizations create --app $APP --locale en-US \
  --description "$(cat "$W0/beta-description.md")" \
  --feedback-email "$FEEDBACK_EMAIL" \
  --marketing-url "https://patina.cloud/app" \
  --privacy-policy-url "https://patina.cloud/privacy"
```

The app has **zero** localizations today, so this is `create`. Without it the tester's card is blank and
external submission is refused. ⚠ Both URLs must resolve before this runs — Apple fetches them, and
`C1-30`/`C5-04` put the same `/privacy` URL on the app's first screen, so one dead page fails twice.
If it returns a duplicate-resource error the row exists — resolve the id and switch verbs:

```bash
LOC_ID=$($ASC testflight app-localizations list --app $APP --output json | jq -r '.data[0].id')
$ASC testflight app-localizations update --id "$LOC_ID" \
  --description "$(cat "$W0/beta-description.md")" \
  --feedback-email "$FEEDBACK_EMAIL"
```

```bash
DETAIL_ID=$($ASC testflight review view --app $APP --output json | jq -r '.data[0].id')
test -n "$DETAIL_ID" || { echo "STOP — no review detail id"; exit 1; }

$ASC testflight review edit --id "$DETAIL_ID" \
  --contact-first-name Kody \
  --contact-last-name Kochaver \
  --contact-email "$CONTACT_EMAIL" \
  --contact-phone "$CONTACT_PHONE" \
  --demo-account-required=true \
  --demo-account-name "$DEMO_ACCOUNT_EMAIL" \
  --demo-account-password "$DEMO_ACCOUNT_CODE" \
  --notes "$(cat "$W0/beta-review-notes.md")"
```

`--demo-account-required=true` is placed **first** among the demo flags so that even a future parser
change cannot orphan the two values behind it.

### G3 — internal testers

```bash
export INTERNAL=71f90727-fc35-4499-824a-3794c06095de

$ASC testflight testers add --app $APP --group "$INTERNAL" \
  --email "$CONTACT_EMAIL" --first-name Kody --last-name Kochaver

export LEAH_EMAIL=
export LEAH_LAST=
test -n "$LEAH_EMAIL" || { echo "STOP — LEAH_EMAIL is empty"; exit 1; }
$ASC testflight testers add --app $APP --group "$INTERNAL" \
  --email "$LEAH_EMAIL" --first-name Leah --last-name "$LEAH_LAST"
```

**Internal Patina** carries `hasAccessToAllBuilds: true`, so once these two are testers every upload
reaches them without a `builds add-groups` call, and internal distribution skips Beta App Review
entirely — which is how the whole chain gets proved before Apple is ever asked.
**`MiddleWest Client` (`2231934a-d514-4f96-aae1-1745561f9353`) stays empty** until beta review passes
and the device pass is clean (R1 Step 7). Adding an external tester now sends an invitation the build
cannot honour.

### G4 — age rating

Today the declaration `d405ec23-68bb-4dfd-b971-18a6c4847ac2` says **false** to messaging and **false** to
user-generated content, while the app ships `Features/Messaging/` and room photo/scan capture. Two
answers are wrong; the other twenty-three are correct — so **not `--all-none`**, which would reset them.

```bash
$ASC age-rating edit --app $APP \
  --messaging-and-chat=true \
  --user-generated-content=true

$ASC age-rating view --app $APP --output json --pretty
```

`beta-review-notes.md` already explains both to the reviewer, so the declaration and the notes agree.

### G5 — the three UI-only steps

- **App name (`A2-21`).** App Store Connect → Patina → App Information → **Name**. The record says
  "Patina Design"; the built `CFBundleName` is "Patina"; `Info.plist:21` carries a third string. Pick
  **Patina**. The version is still `PREPARE_FOR_SUBMISSION`, so the rename is free.
- **Encryption.** With `ITSAppUsesNonExemptEncryption = NO` in the plist (L0.1 / `A2-06`) the question
  stops being asked per upload. Answer in the UI only if ASC still prompts after the upload.
- **Signing (`A2-19`).** Do **not** create profiles by hand. Block I's archive with
  `-allowProvisioningUpdates` regenerates the App Store profiles for both bundle ids. The account holds
  exactly one profile of any type today — `2M9A3BAL47 "cloud.patina.app App Store"`, state **INVALID** —
  and none for the widget. If the archive does not fix it, delete `2M9A3BAL47` in Certificates,
  Identifiers & Profiles and re-archive.

### G6 — the read-only probe

Sandbox off (G0.2). Each line states what "pass" looks like.

```bash
ASC=~/.blitz/bin/asc; APP=6762007888

$ASC testflight review view --app $APP --output json --pretty
# PASS: attributes is no longer {} — contact first/last/email/phone set,
#       demoAccountRequired true, demoAccountName firstflight@patina.cloud, notes non-empty

$ASC testflight app-localizations list --app $APP --output json --pretty
# PASS: total 1, locale en-US, feedbackEmail set, privacyPolicyUrl https://patina.cloud/privacy

$ASC testflight testers list --app $APP --output table       # PASS: 2 rows (was 0)
$ASC testflight groups list --app $APP --output table        # PASS: unchanged, two groups
$ASC age-rating view --app $APP --output json --pretty       # PASS: messagingAndChat true, UGC true
$ASC apps view --id $APP --output json --pretty              # PASS: name "Patina"
$ASC profiles list --profile-type IOS_APP_STORE --output table
# PASS (only AFTER Block I's archive): two VALID rows — cloud.patina.app and cloud.patina.app.widget.
# The flag is --profile-type. There is no --filter-profile-type.
```

Diff the result against [`asc-state-before.md`](asc-state-before.md). **W0 · L0.5 exits when
`testflight review view` returns populated attributes.**

**Not in this block:** `what-to-test-build-1.md` goes up in **R1 Step 5** against the new build, and
`builds add-groups` / `testflight review submit` are R1 Steps 5 and 7, after the device pass. Before the
notes go up, apply the standing rule: *What to Test may not send a tester at a surface that carries an
open blocker* — and **item 4 (a proposal) is the one to re-read**, because L0.7 returned `L07-01`
against exactly that surface (see Block J1).

### G7 — the ids R1 needs

| Name | ID |
|---|---|
| App | `6762007888` |
| Beta App Review detail | `6762007888` |
| Internal Patina (internal group) | `71f90727-fc35-4499-824a-3794c06095de` |
| MiddleWest Client (external group) | `2231934a-d514-4f96-aae1-1745561f9353` |
| Age rating declaration | `d405ec23-68bb-4dfd-b971-18a6c4847ac2` |
| Existing App Store profile (INVALID) | `2M9A3BAL47` |
| Build 2, expired, 2026-05-12 | `9b61ad6c-49da-4356-bd7c-4b8bd8832bad` |

---

## Block H — PostHog (project **326191**)

**What it proves.** That the three flags exist in a *deliberate* state, and that error tracking is on —
which is the only way you will see a TestFlight crash at all.

### H1 — ⚠ THE ROLLOUT, AND WHY IT IS NOT 0%

**PROGRAM.md §3 · L0.6 step 2 says "0% rollout" for all three flags. Do not do that for `house-first`.**

D1 ships the four-tab root; **D1a** makes `house-first` resolve **true when PostHog has no answer**, and
an explicit `false` payload the kill switch. PostHog does **not** omit a flag that evaluates false — it
returns the flag **with the value `false`**. So a 0%-rollout `house-first` arrives as an *answer*, the
kill-switch clause fires, and every tester loses the four-tab root on their **second** launch: launch 1
has no cached payload and takes the default (bar ON); launch 2 reads a cached `false` (bar OFF). That
silently undoes D1, on the second launch, for everyone.

Set, in the dashboard:

| Flag | Rollout | State |
|---|---|---|
| `house-first` | **100% — everyone, no cohort, no individual overrides** | active |
| `direct-orders` | 0% | active |
| `house-widget` | 0% | active |

**The kill switch is then still one click**: drop `house-first` to 0% and every tester falls back to the
single-stack root on their next launch. That is the behaviour D1a asks for, and it is the reason the
flag must be at 100% rather than deleted.

Create any of the three keys that do not exist. **Do not delete them.**

*Claim level, stated plainly: the code side of this is verified in the branch; the PostHog side is
reasoned from how PostHog evaluates flags and is **not** observed. H4 is the probe that settles it.*

### H2 — error tracking

Turn **Error tracking ON** for the project. L0.1 shipped the SDK half
(`errorTrackingConfig.autoCapture = true`, via `@_spi(Experimental) import PostHog`); without the
project half, **build 1 reports no crashes at all**.

Confirm the project is the one `Secrets.postHogAPIKey` points at, host `https://us.i.posthog.com`.

### H3 — the Debug kill-switch check

L0.1 made `AppConfiguration.analyticsEnabled` real (it was declared and referenced nowhere, so Debug
builds reported into the **production** project). With it false, **a Debug launch must produce zero
events in the project's live feed.** Watch the live feed while a Debug build launches; anything arriving
means the guard did not land.

⚠ **One consequence to know before a walker reports it as a defect:** the same guard also turns off the
two PostHog-only experiments in Debug — `onboarding_walk_first` and `ios_screen_name_v2` — because
`PostHogService.isFeatureEnabled` returns false when the client is not initialised. So **every Debug
walk sees quiz-first onboarding**, while a Release TestFlight tester may resolve walk-first from the live
payload. That is expected, not a bug, and it belongs in the walker's brief.

### H4 — the read-only probe

Read back `active`, `rollout_percentage` and the release-condition set for the three keys. Then, on the
review simulator, launch the **Release-configured** build twice with **no** `-PatinaFlags` argument and
read the resolution line from the app log:

```
[FeatureFlags] resolved via posthog-cache: on=[house-first]     ← PostHog answered
[FeatureFlags] resolved via defaults: on=[house-first]          ← PostHog had nothing
```

**Launch 2 is the one that reads a cached payload**, and `posthog-cache` with `house-first` *absent* from
`on=[…]` is the D1/D1a contradiction, live.

**The line is now emitted in Release.** `FeatureFlags.logResolution` was inside `#if DEBUG`, which meant
the probe could not be run at all on the build it is about: the line did not exist in a Release binary,
and in a Debug build H3's own analytics guard makes the provider answer nil so the source could only
ever read `defaults`. It is now emitted **unconditionally at `PatinaLog.ui.notice`** — `notice` is the
lowest os_log level that survives into a Release log archive, so it is readable over Console from a
TestFlight device. It carries flag **keys** and a branch name and nothing else: no user id, no distinct
id, no payload.

**How to read it off a TestFlight build.** With the device attached, open **Console.app**, select the
device in the sidebar, and filter on subsystem `com.patina.app` (category `ui`) — or from the terminal:

```bash
log stream --predicate 'subsystem == "com.patina.app" AND category == "ui"' --level info
```

`log stream` shows notice-level messages without `--level debug`; the `--level info` above only widens
it. Launch the app, read the line, background it, launch again, read the second one.

The **App Group mirror** remains as a cross-check rather than a substitute: `FeatureFlagMirror` writes
the resolved set to `group.cloud.patina.app` in Release too. Say which you used if you use both.

---

## Block I — the archive dry run, the export, and the entitlement check

**What it proves.** `A2-07` — *the riskiest step in the program, and it has never been run.* No
`Release*` directory exists in any of the ~40 `Patina-*` DerivedData trees and
`~/Library/Developer/Xcode/Archives` does not exist, so whole-module optimisation over 92k LOC,
distribution signing with an embedded appex, the Stamp-Git-SHA phase under `CONFIGURATION != Debug`,
`ENABLE_NS_ASSERTIONS=NO` and dSYM emission are all unproven **at once**. `ios-gate.sh release` being
green proves the compile, not the archive.

This runs twice: **once now**, as the W0 exit criterion, and **again as R1 Step 2** against the build
that ships.

### I0 — variables, and the one precondition

```bash
export REPO=/Users/kody/Code/patina-merged
export ARCHIVE="$REPO/apps/mobile/Patina/.build/archives/Patina.xcarchive"
export EXPORT_DIR="$REPO/apps/mobile/Patina/.build/export"
export EXPORT_OPTIONS="$REPO/apps/mobile/Patina/scripts/ExportOptions.plist"
```

**The checkout must carry L0.1.** On `main` as it stood before the W0 merge, `-configuration Release`
does not compile (`G-01`, four `#Preview` blocks referencing `#if DEBUG` fixtures) and the archive dies
at compile. Check, and if it is empty run from the integration worktree instead:

```bash
cd "$REPO"
git log --oneline -1 -- apps/mobile/Patina/Config/Version.xcconfig
# A commit here means L0.1 is in this checkout. Nothing here means it is not:
#   export REPO=/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-integration
# and re-run the three exports above.
```

**`IOS_GATE_UDID` does not need to be set for this block** — `cmd_archive` takes
`-destination 'generic/platform=iOS'` and never calls `sim_destination()`. Leave it unset. Do **not**
export the review device `973D1724-90BF-4A0A-B02D-481D561547B3` here: if the same shell later runs
`unit`, it would install and run the whole test tier on the program's protected walk device.

### I1 — archive

```bash
cd "$REPO"
apps/mobile/Patina/scripts/ios-gate.sh archive
```

Want `** ARCHIVE SUCCEEDED **`. This tier uses `-allowProvisioningUpdates`, so it makes network round
trips to App Store Connect and may create or modify provisioning profiles on team `VP22LXHT7L` — which
is exactly why it is yours and not an agent's. (The tier is not guarded in code today; only a comment
and this page stop an agent typing it. Worth a one-line `PATINA_ALLOW_ARCHIVE=1` guard in W2.)

### I2 — read the archive before exporting it

```bash
plutil -p "$ARCHIVE/Products/Applications/Patina.app/Info.plist" \
  | grep -E 'CFBundleVersion|CFBundleShortVersionString|MinimumOSVersion|UIDeviceFamily|ITSAppUsesNonExemptEncryption|UILaunchScreen'

plutil -p "$ARCHIVE/Products/Applications/Patina.app/PlugIns/PatinaWidget.appex/Info.plist" \
  | grep CFBundleVersion

find "$ARCHIVE/Products/Applications/Patina.app" -name PrivacyInfo.xcprivacy \
  | grep -E 'Patina\.app/PrivacyInfo\.xcprivacy|PlugIns/PatinaWidget\.appex/PrivacyInfo\.xcprivacy'

ls "$ARCHIVE/dSYMs/"
```

Want, from PROGRAM.md's L0.1 exit criteria:

- `CFBundleVersion` **3** on the app **and** on the appex — they must be identical or the widget trips
  ITMS. `CFBundleShortVersionString` **1.0**.
- `MinimumOSVersion` **26.0** (D6) · `UIDeviceFamily` **[1]** (D4) ·
  `ITSAppUsesNonExemptEncryption` **false** · `UILaunchScreen` = `{ UIColorName = LaunchBackground }`.
- `PrivacyInfo.xcprivacy` at **both** filtered paths. ITMS-91053 is evaluated per binary, so the appex
  needs its own (**D15**). The unfiltered `find` also lists three vendored copies; those are not the two
  that matter, which is why the `grep` is part of the command.
- `PatinaWidget.appex` present under `Products/Applications/Patina.app/PlugIns/`.

One cosmetic artefact you will see and should not chase: the product still emits
`AppIcon76x76@2x~ipad.png` and a `CFBundleIcons~ipad` key, because the Icon Composer `.icon` declares the
pad idiom. `UIDeviceFamily` is `[1]`, which is what ITMS-90474 validation reads.

### I3 — export

```bash
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates
```

`ExportOptions.plist` is `method: app-store-connect`, `teamID: VP22LXHT7L`, `signingStyle: automatic`,
`manageAppVersionAndBuildNumber: false` — that last one matters, or ASC would renumber the build out from
under `Config/Version.xcconfig`.

### I4 — the entitlement check that exists nowhere else

This is the only step that closes `A2-24` / `G-12` and the export half of `A2-23`. Until it runs, all
three are **pending**, not done.

```bash
unzip -o -q "$EXPORT_DIR/Patina.ipa" -d "$EXPORT_DIR/unzipped"

codesign -d --entitlements :- "$EXPORT_DIR/unzipped/Payload/Patina.app" 2>/dev/null \
  | grep -E 'aps-environment|get-task-allow|application-identifier|application-groups'

codesign -d --entitlements :- "$EXPORT_DIR/unzipped/Payload/Patina.app/PlugIns/PatinaWidget.appex" 2>/dev/null \
  | grep -E 'application-identifier|application-groups'
```

Want on the app: **`aps-environment = production`**, **no** `get-task-allow`,
`VP22LXHT7L.cloud.patina.app`, `group.cloud.patina.app`.
Want on the appex: `VP22LXHT7L.cloud.patina.app.widget`, `group.cloud.patina.app`, **no**
`aps-environment`.

**If `aps-environment` is still `development`, STOP.** Push registers sandbox tokens, the R1 push round
trip (device row **D-07**) silently never arrives, and Block E2's `device_push_tokens` will fill with
`development` rows. The source entitlement says `development` on purpose — automatic signing is expected
to rewrite it at export — so the fix at that point is to split the Debug/Release entitlements files
(`C9-20`) and re-archive, not to guess at the source file beforehand.

### I5 — confirm the build number clears the ASC floor

```bash
~/.blitz/bin/asc builds list --app 6762007888 --paginate
grep -n 'CURRENT_PROJECT_VERSION\|MARKETING_VERSION' \
  /Users/kody/Code/patina-merged/apps/mobile/Patina/Config/Version.xcconfig
```

`CURRENT_PROJECT_VERSION` (**3**) must be strictly greater than every number `builds list` returns.
Today that list holds one row: version `2`, uploaded 2026-05-12, `processingState VALID`, expired true.

**Rollback: none, and none is needed.** This block produces artifacts under
`apps/mobile/Patina/.build/`; nothing is uploaded. `rm -rf` the archive and export directories to start
clean.

---

## Block J — the two conditional steps

### J1 — is the round-one designer in more than one active studio? (read-only)

**What it proves.** Whether `L07-01` — *signing a proposal fails with `studio_id_not_designer_studio`* —
is **live** for round one's cohort or merely latent. This is the only production question L0.7's walk
could not answer, and What to Test item 4 sends a tester at exactly that surface.

Run it in the Strata SQL editor (dashboard → project `bkvcixdmuyejfzcijpdg` → SQL Editor) or with
`psql`. It reads three tables and writes nothing.

```sql
SELECT p.email,
       count(DISTINCT om.organization_id) AS active_design_studios,
       string_agg(DISTINCT o.name, ' | ' ORDER BY o.name) AS studios
FROM public.profiles AS p
JOIN public.organization_members AS om ON om.user_id = p.id
JOIN public.organizations AS o ON o.id = om.organization_id
WHERE om.status = 'active'
  AND om.role <> 'guest'
  AND o.type = 'design_studio'
  AND o.status = 'active'
  AND p.id IN (SELECT DISTINCT designer_id FROM public.proposals WHERE status = 'sent')
GROUP BY p.email
ORDER BY active_design_studios DESC, p.email;
```

**Read it like this.** Any row with `active_design_studios >= 2` is a designer **whose clients cannot
sign a proposal today**. If Leah's row is `1`, `L07-01` is latent for round one and can be scheduled into
W1 normally. If it is `2` or more, it **blocks build 1 for that studio** and must be fixed or named in
What to Test — and G6's warning about item 4 applies.

Re-run this unchanged after the fix lands and confirm the answer is the one the fix intends. No other
verification is possible without a real signature, and a real signature on production is not a probe.

### J2 — the catalogue and editorial seed, **the day Leah's manifest lands** (D2)

**What it proves.** Gate **G6** — the marketplace shows real pieces rather than a grid of grey blocks.
Today production holds **one** published catalogue product, a $20 "Smoke Test Ceramic Lamp" with no
image, so `get_recommendations` returns zero rows for every caller.

**Do not run this until the manifests and photographs are in hand.** If they are not by **end of day 6**,
L0.3 calls **D2's fallback** and build 1 ships the honest "still curating" state instead. The pipeline
does not go away — it is committed, proven locally, and works the day the manifests land, inside round
one or after it.

Steps 0-6 are safe to repeat. **Step 7 writes** (`match_events`, possibly `client_style_profiles`) and
is the acceptance gate. On production the order is **upload-then-apply** (J2.3 before J2.5) because there
is no reset; locally it is reset → upload → apply, since `supabase db reset` drops the bucket's objects
with the database.

**J2.0 — the shell, once:**

```bash
cd /Users/kody/Code/patina-merged
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export SERVICE_ROLE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export STRATA_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
export STRATA_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdmNpeGRtdXllamZ6Y2lqcGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjg0MzIsImV4cCI6MjA4Mzg0NDQzMn0.SPl6jHaeTp9McfF-AmXJUDKTwRaXD7Qf0hlve72rVg0
export CATALOG_OWNER_UID=74056c2a-866d-42b0-9e2a-d473c2484316
export PRODUCT_IMAGES_BASE=https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/public/product-images
export FF_W0=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0
export MANIFEST="$FF_W0/catalog-manifest.csv"
export EDITORIAL="$FF_W0/editorial-manifest.csv"
export LEAH_PHOTOS="$FF_W0/leah-photos"
export CATALOG_SQL="$FF_W0/first-flight-catalog-prod.sql"

test -n "$STRATA_DB_URL"    && echo "db url: loaded (${#STRATA_DB_URL} chars)"
test -n "$SERVICE_ROLE_KEY" && echo "service role key: loaded (${#SERVICE_ROLE_KEY} chars)"
ls -1 "$LEAH_PHOTOS" | wc -l
```

`STRATA_ANON_KEY` is the committed literal from `apps/client-portal/wrangler.jsonc` — a public value, and
the right principal for the anonymous acceptance probe.

**J2.1 — validate both manifests** (no network, no database):

```bash
python3 scripts/first-flight/build-catalog.py --check "$MANIFEST" --profile release --editorial "$EDITORIAL"
```

Exit 0 or stop. `--profile release` enforces round one's floors — **≥ 30 rows · 6 categories · ≥ 3 makers
· ≥ 3 pieces inside 7 days · 3 stories** — on top of the per-row contract. It prints every problem at
once with line numbers. *(The same line against the 6-row `catalog-fixture.csv` exits 1 by design; the
fixture form is `--profile fixture`.)*

**J2.2 — resize the photographs, if `--check` asked for it:**

```bash
sips -Z 1600 "$LEAH_PHOTOS"/*.jpg
```

**J2.3 — upload the photographs and the story heroes:**

```bash
python3 scripts/first-flight/upload-catalog-images.py \
  --manifest "$MANIFEST" \
  --editorial "$EDITORIAL" \
  --profile release \
  --supabase-url "$STRATA_URL" \
  --service-key "$SERVICE_ROLE_KEY" \
  --uploader-uid "$CATALOG_OWNER_UID"
```

Pieces land as `product-images/74056c2a-…/<product id>/…`; story heroes under `…/editorial/<story id>/…`.
Both keep the 00542 convention — first folder segment is the catalogue owner's uid. Re-runs skip files
already present; add `--overwrite` only to deliberately replace one.

**J2.4 — generate the production SQL:**

```bash
python3 scripts/first-flight/build-catalog.py \
  --emit "$MANIFEST" \
  --editorial "$EDITORIAL" \
  --out "$CATALOG_SQL" \
  --profile release \
  --storage-base-url "$PRODUCT_IMAGES_BASE" \
  --uploader-uid "$CATALOG_OWNER_UID" \
  --assigned-by "$CATALOG_OWNER_UID"
```

Read the head of the file before applying it — it opens with the row count and the manifest it came from.

**J2.5 — apply it, all or nothing:**

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -1 -f "$CATALOG_SQL"
```

`-1` is what makes it atomic: the file carries no `BEGIN`/`COMMIT` of its own, because no other seed in
this tree opens a transaction and `pnpm supabase:reset` runs it too. Three things it can say:

- `slug X already exists on a different row (…)` — Leah reused a slug that belongs to a different Strata
  product. Without the guard the apply would insert a **second** published piece on that slug
  (`products.slug` has no unique index). Rename the manifest row or retire the old product.
- `maker X matches N vendor rows` — two `vendors` rows share that name. Pick the survivor, repoint, re-run.
- `NOTICE: vendor X is_patina_catalog f -> true (pre-existing row)` — **not an error, but paste it into
  the apply report.** That flag gates `create_direct_order`; `direct-orders` is off for round one, so the
  effect is deferred, not absent.

**J2.6 — the read-only checks, before spending a write:**

```bash
psql "$STRATA_DB_URL" -X -q -c "
with ff as (select p.* from public.products p
             where p.layer='catalog' and p.status='published' and p.slug is not null
               and p.id = extensions.uuid_generate_v5('f1a57f11-9c74-4b3e-9c2f-1e5a0b7d4c10'::uuid, p.slug))
select count(*) as publishable,
       count(*) filter (where coalesce(array_length(images,1),0)=0) as imageless,
       count(*) filter (where vendor_id is null) as makerless,
       count(distinct category) as categories,
       count(*) filter (where published_at > now() - interval '7 days') as new_this_week
from ff;"
```
Want **publishable ≥ 30 · imageless 0 · makerless 0 · categories 6 · new_this_week ≥ 3**.

```bash
psql "$STRATA_DB_URL" -X -q -c "
select count(*) as publishable, count(sp.spectrums) as with_spectrum
from public.products p
left join lateral public._aesthete_product_spectrum(p.id) sp on true
where p.layer='catalog' and p.status='published';"
```
Want **publishable = with_spectrum**. If they differ, J2.7 returns zero rows and there is no reason to
spend the write finding that out.

```bash
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -v min_publishable=30 -v require_storage=1 \
  -f supabase/tests/catalog/first_flight_catalog_test.sql
```
The same eleven cases the local gate runs, at round one's real floor and with the storage assertion on,
so a URL with no object behind it fails here rather than showing a tester a grey block. It ends in
`ROLLBACK` and writes nothing.

**J2.7 — the acceptance probe · THIS WRITES.** `get_recommendations` inserts a `match_events` row and can
insert a `client_style_profiles` row.

```bash
curl -s -X POST "$STRATA_URL/rest/v1/rpc/get_recommendations" \
  -H "apikey: $STRATA_ANON_KEY" \
  -H "Authorization: Bearer $STRATA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_room_id":null,"p_category":null,"p_limit":20,"p_offset":0}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('rows:', len(d) if isinstance(d,list) else d); print(json.dumps(d[:2], indent=2) if isinstance(d,list) else '')"
```

Want **rows ≥ 1**, and the two printed rows carrying a real `maker_name` (never `Unknown Maker`), a
non-null `image_url`, and a `category` from the six.

Then the demo-account half, which is **in-app, not SQL**: sign in as `firstflight@patina.cloud`, finish
the quiz, open Browse, and confirm the grid fills. Record what Browse showed. Finally, record the probe
rows so they are not read later as traffic:

```bash
psql "$STRATA_DB_URL" -X -q -c "
select id, created_at, source from public.match_events order by created_at desc limit 4;"
```

**J2.8 — the eyes-on check (G6).** Open Browse on the review simulator pointed at **production** and
confirm a full grid with real photography and resolvable makers. Then open the home screen and confirm
the story card shows a photograph and a read time that matches the story.

**Rollback.** The catalogue rows are identifiable by the deterministic uuid in J2.6's `ff` CTE
(`uuid_generate_v5` over the slug), so a mis-seeded set can be deleted by that predicate. Do it in one
transaction and re-run J2.6 afterwards. Uploaded images are storage objects and are removed from the
Storage dashboard.

---

## What is claimed here, and at what level

| Claim | Level |
|---|---|
| 00555 / 00557 apply cleanly and their assertions hold | **local only** — `pnpm supabase:reset` + the whole SQL suite, 2026-09-02. Never run against Strata by an agent |
| `demo-account.sql` applies clean, is idempotent, and the four tier signals come back 1/1/1/1 | **local only**, 2026-09-02 |
| The probes' "before" values in `00555_probes.md` | **read-only, measured on Strata 2026-09-01** |
| The advisor `security_definer_view` count of 21 | **read-only, measured on Strata 2026-09-01** |
| Every "after" value on this page | **not verified** — that is what this runbook asks you to confirm |
| Block A's `401` | **not verified** — it depends on a deploy that had not happened when this was written |
| The PostHog rollout reasoning in H1 | **reasoned from the SDK source**, not observed against the live project. H4 is the probe |
| `aps-environment = production` on the exported app | **not verified — pending I4.** The source entitlement says `development` on purpose |
| Any Stripe payment completing | **not verified — device claim**, R1's D-12 |
| The Sanity copy in production | **not verified** — the dataset had zero drafts and the old bodies on 2026-09-02 |

**Nothing on this page was executed.** No agent ran `psql`, a Supabase MCP write, `asc`, a Sanity write,
a PostHog change, `wrangler`, `deploy-portal.sh`, `functions deploy` or `db push` in wave W0.
