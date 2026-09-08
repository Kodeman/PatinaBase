# The Agreement, Composed — Wave 3 deploy report

**Turnkey: the design-build class, the Trade Agreement, the licensing gate.**
Merged and shipped to production 2026-09-08 by the Wave 3 merge-and-deploy steward,
under Kody's in-session instruction *"Deliver the Agreement system to production"* —
which authorizes the full chain (merge → migrations → edge functions → portals → verify).

---

## 1. What went out

| Layer | Unit |
|---|---|
| Migrations | `00578_design_build_kind.sql`, `00579_trade_agreements.sql` |
| Edge functions | `proposal-send`, `commercial-document-notify`, **new** `trade-agreement-send` |
| Portals | designer (`patina-designer-portal`), client (`patina-client-portal`) |
| Flag | `design-build` — **fail-closed, and it does not exist**, so the feature is DARK |

Services and workers were **not** touched: nothing in Wave 3 changes `orders`, `media`,
`projects`, the media processor or inference.

---

## 2. The pre-merge fix — W3R3-02

Round 3's walk found the homeowner's till printing a provider error key:
*"Unable to open the payment page just now. Try again in a moment. **(stripe_not_configured)**"*.
The parenthesis came from `refusalSentence` (`apps/client-portal/src/lib/threshold/refusal.ts`),
which appends `cause.message` in development.

`apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx` no longer routes the checkout
refusal through it. The code goes to `console.error("[pay] checkout refused:", code)` and the
payer reads **"The payment page could not open. Try again."** Codes the till *can* act on
(`payment_processing`, `payment_reconciliation_required`, the two not-payable shapes,
`invoice_link_no_payer`, `stripe_error`) still map to their own sentences through
`checkoutRefusalSentence`, untouched. `invoice_not_found` still routes to `/pay/dead`.

A jest case pins it — `W3R3-02: the payer never reads the provider's error code` — asserting
the exact sentence, the absence of `stripe_not_configured`, the absence of any parenthesis,
and that the code reached the log. Four existing assertions moved to the new copy.

Commit `6a689f8f2` on `agreement/w3-integration`.

---

## 3. Merge

`origin/main` had **not moved** since `112e6f838` (`rev-list --count 112e6f838..origin/main` = 0),
and was already an ancestor of the integration branch — `git merge origin/main` reported
**"Already up to date."** No conflict, no resolution.

Migration numbering re-checked at the merge point: highest on `origin/main` is **`00577`**
(`00575_agreement_parts`, `00576_agreement_library`, `00577_agreement_fee_schedules`); ours are
**`00578`** and **`00579`**. No collision.

Edge-function fan-out re-checked:
`git diff --name-status origin/main...agreement/w3-integration -- supabase/functions/_shared/`
returns **two `A` rows only** — `_shared/trade-agreement-emails.ts` and its test. **No
pre-existing `_shared/*` file was modified**, so the deploy set stays at the three named
functions. The only importer of the new shared module is `trade-agreement-send/lib.ts` itself.

One dirty file in the main checkout, `waves/w3/build-sheet.md`, was byte-identical to the branch
version; it was restored to HEAD before the merge so the merge could bring it in losslessly.
Every other dirty path in the main checkout was left alone.

| | |
|---|---|
| Merge commit | **`c784aad9d`** — `feat(agreements): merge w3-integration into main — turnkey: the design-build class, the Trade Agreement, the licensing gate` |
| Rulings commit | **`6672a1c24`** — `docs(agreements): rulings R40–R52` |
| Pushed | `112e6f838..6672a1c24  main -> main` |

Walk-verified ship point was `8a22b83f7`; the branch carried two further commits at merge time —
round 3's walk record (`416652342`) and the W3R3-02 fix (`6a689f8f2`) — plus the steward's stack
notice (`48f69939f`).

---

## 4. Gates, re-run on the merge candidate

The local stack was reset from the integration worktree first
(`supabase db reset --workdir …/agent-agr-w3-integration`; ledger head **`00579`**), which
destroyed every row round 3's walk left. Recorded in `stack-notice.md`.

| Gate | Result |
|---|---|
| `turbo build --filter=@patina/types --force` | 1 successful |
| designer-portal `type-check` | clean |
| designer-portal **full jest** | **544 suites / 6691 tests / 12 snapshots — all passed** |
| client-portal `type-check` | clean |
| client-portal `test:coverage` | **134 suites / 2246 tests passed**; coverage floor met |
| `./scripts/run-sql-tests.sh` | **166 total · 145 green · 21 expected-fail · 0 unexpected → effective 166 / 166** |
| deno tests (`_shared`, `proposal-send`, `commercial-document-notify`, `trade-agreement-send`) | **465 passed, 0 failed** |
| `deno check` on all three `index.ts` | clean; no stray root `deno.lock` |
| `pnpm db:generate` + `git diff --exit-code database.types.ts` | **clean — types in sync at 00579** |
| admin-portal `build` (the repo's strictest gate, `.next/types` cleared first) | passed |

The 21 expected failures are the documented set in `supabase/tests/KNOWN_FAILURES.md`;
this pass changed none of them.

---

## 5. Strata — before and after

**Before.** `supabase migration list --linked` showed exactly **two** rows with an empty
`remote` — `00578` and `00579`. Every other local migration through `00577` was already
applied. Nothing unexpected was pending.

**After.** `supabase db push` → `{"upToDate":false,"migrations":["00578_design_build_kind.sql","00579_trade_agreements.sql"],"message":"Finished supabase db push."}`

### Object-level probes (`supabase db query --linked`, SELECT only)

| Probe | Result |
|---|---|
| `proposals_document_kind_check` | `CHECK ((document_kind = ANY (ARRAY['legacy','design_services','furnishings_authorization','service_addendum','trade_scope','design_build'])))` — **admits `design_build`** |
| `project_commercial_documents_document_kind_check` | also carries `design_build` |
| The five tables | all present: `studio_trade_agreements`, `studio_trade_agreement_signatures`, `studio_trade_agreement_tokens`, `studio_license_attestations`, `agreement_jurisdiction_notices` (count = 5) |
| Jurisdiction notices by state | **six rows — CA, IL, MA, MN, NY, WI — one each, every one `enabled = false`** |
| `count(*) filter (where enabled)` | **0** of 6 |
| Seeded templates | four — `patina.consultation`, **`patina.design_build`**, `patina.design_services`, `patina.furnishings_services` |
| `billing_cadence` CHECK | `per_draw` present on **both** `project_billing_authorities` and `proposal_service_terms` |
| The four functions | all present: `record_agreement_draw_lien_waiver(uuid,text,uuid,date,integer,timestamptz)`, `sign_trade_agreement_by_token(text,text,text)`, `issue_agreement_draw_invoice(uuid,text)`, `_agreement_redact_client_payload(text,text,jsonb,text)` |
| `count(*) from proposals where document_kind='design_build'` | **0** — nothing in flight |

---

## 6. Edge functions

`supabase/config.toml` carries `[functions.trade-agreement-send]` with **`verify_jwt = true`** —
the lane added it deliberately, with a comment recording the posture: the gateway verifies the
caller's JWT, and the function re-derives the caller with `auth.getUser` and re-checks
`public.is_active_studio_member` for THIS agreement's studio before it will load, mint a token
for, or send a row. The subcontractor never calls the function; they reach the paper through the
minted token on `/trade/[token]`. So **no `--no-verify-jwt` on any of the three deploys.**

| Function | Result |
|---|---|
| `proposal-send` | Deployed — script size 160 kB |
| `commercial-document-notify` | Deployed — script size 171 kB |
| `trade-agreement-send` | Deployed — script size 168 kB |

All three: `{"project_ref":"bkvcixdmuyejfzcijpdg", …, "message":"Deployed Functions."}`

### Secret check (names only — no value was read, printed or set)

`trade-agreement-send` and its shared email module read `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (all three platform-injected) and **`CLIENT_PORTAL_URL`**. It routes
every letter through `sendCompliantEmail`, which additionally reads `RESEND_API_KEY`,
`RESEND_FROM`, `UNSUBSCRIBE_TOKEN_SECRET`, plus the optional `RESEND_FROM_TRANSACTIONAL`,
`RESEND_FROM_MARKETING`, `EMAIL_DEV_MODE`, `EMAIL_DEV_REDIRECT_TO`, `EMAIL_USER_CAP_PER_HOUR`.

`supabase secrets list` confirms **`CLIENT_PORTAL_URL`, `RESEND_API_KEY`, `RESEND_FROM` and
`UNSUBSCRIBE_TOKEN_SECRET` all exist** on Strata. The optional names are absent and each has an
in-code fallback (`RESEND_FROM_TRANSACTIONAL`/`_MARKETING` fall back to `RESEND_FROM`;
`EMAIL_USER_CAP_PER_HOUR` defaults to 8). **No secret is missing, and none was invented.**

---

## 7. Portals

Deployed from the **main checkout** at `6672a1c24`, via `./infra/deploy-portal.sh` only.

`apps/designer-portal/.env.local` still points at the local stack, so — following the Wave 1 and
Wave 2 precedent — the production literals from `apps/designer-portal/wrangler.jsonc`'s `vars`
block were **exported inline for that one invocation**. **`.env.local` was not edited**, and no
`.env` file was read or written by this pass. `apps/client-portal/.env.local` already points at
production; the client portal deployed with no intervention.

### Versions

| Portal | Worker | New version | **Rollback (prior)** |
|---|---|---|---|
| designer | `patina-designer-portal` | **`6987d9ff-9154-453f-ae89-c7ab4c714d48`** (2026-09-08T14:53:19Z) | **`7a88a385-cc3e-4dc7-9a2d-0f5c1e737c5a`** (2026-09-07T22:09:54Z — the W2 ship) |
| client | `patina-client-portal` | **`f46e2e19-a806-45d1-853e-28a007533724`** (2026-09-08T14:54:52Z) | **`33a01d5a-61f4-440c-af2d-9197acda725a`** (2026-09-07T22:11:09Z — the W2 ship) |

Both read from the **bottom** row of `npx wrangler deployments list` (the list is oldest-first).

---

## 8. Verification

### Served-chunk evidence — Wave 3 strings, fetched from production

**Designer** (each chunk HTTP 200):

| Chunk | `design-build` | `Licensing` | `Trade Agreement` | `Schedule of values` | `127.0.0.1` |
|---|---|---|---|---|---|
| `3537.c4d6ae5b3b6a4ec1.js` (90 419 B) | 4 | 0 | **11** | 5 | 0 |
| `53-c82efeac4a34b865.js` (212 376 B) | 3 | **1** | 0 | 0 | 0 |
| `8649-f2ae49678248e458.js` (525 586 B) | 0 | 0 | **1** | 0 | 0 |

**Client** — `common-c8456fca2d02dd4a.js` (200, 1 033 246 B): `Schedule of values` ×1,
`Retainage` ×5, `Lien waiver` ×1, `127.0.0.1` ×0.

### The local-pointed `.env.local` concern, checked head-on

- `127.0.0.1` in the served designer sign-in HTML: **0**
- `localhost` in that HTML: **0**
- `127.0.0.1` across **all 32** chunks that page references: **0**
- runtime origin in the served HTML: `__PATINA_SUPABASE_ORIGIN = "https://api.patina.cloud"`

### Behavior probes (unauthenticated)

| Probe | Result |
|---|---|
| `GET https://app.patina.cloud/` | **200**, no redirect, "Sign In" present, 0 error markers |
| `GET https://client.patina.cloud/` | **307 → `/auth/signin?callbackUrl=%2F` → 200**, sign-in present |
| `GET https://client.patina.cloud/trade/not-a-token` | **HTTP 200**, rendering the 404 page; document title is **`Trade Agreement · Patina`**, so the Wave 3 route is live |
| `POST /functions/v1/proposal-send` (no auth) | **401** |
| `POST /functions/v1/commercial-document-notify` (no auth) | **401** |
| `POST /functions/v1/trade-agreement-send` (no auth) | **401** |
| control: `POST /functions/v1/no-such-function-xyz` | **404** |

The control matters: a function that does not exist answers 404, so the three 401s prove all
three exist on Strata **and** that `verify_jwt = true` is enforcing.

**The 200 on a dead trade token is the known nit W3R2-16**, carried by ruling and confirmed
unchanged by round 3's walk — the page is right, the status code is not.

---

## 9. Lanes retired

All six branches confirmed merged with `git merge-base --is-ancestor <branch> main`:
`agreement/w3-integration` (`48f69939f`), `agreement/w3-backend` (`a29b361a6`),
`agreement/w3-designer` (`0a50e1ac1`), `agreement/w3-client` (`4a2e560b6`),
`agreement/w3-edge` (`8ac53c567`), `agreement/w3-sub` (`c62e56a7c`) — all **MERGED**, all six
worktrees removed, all six branches deleted with `git branch -d`. `git worktree prune` run.
`git worktree list` now shows only `main` and the five worktrees belonging to other programs
(`agent-client-material`, `agent-inv-*`), which were left untouched.

---

## 10. NOT verified — read this before believing the feature works

- **No signed-in walk of any kind was made in production.** Nothing in this deploy was exercised
  through a real studio or homeowner session. Every probe above is unauthenticated.
- **The `design-build` flag does not exist in PostHog.** The feature is **dark**: fail-closed
  gating means the turnkey room, the Trade Agreement act and the licensing panel are not reachable
  by anyone until the flag is created. Per the standing lesson, verify a new flag against `/flags`
  **with a real-browser UA before enabling it** — `threshold` matched everyone on 2026-09-04.
- **No email was sent in production.** `trade-agreement-send` was never invoked with a real JWT;
  the Resend path, the letter's rendering and `notification_log` are unexercised on Strata.
- **No Stripe object was created or paid in production.** The draw-invoice rail, the deposit
  offer and the W3R3-02 fix itself are unexercised against live Stripe. The known
  `STRIPE_SECRET_KEY` account mismatch is still open and untouched by this pass.
- **The seven minors from walk round 3 are open** — W3R3-01 and W3R3-03 through W3R3-07 remain
  as recorded in `walk-web-r3.md`; only W3R3-02 was fixed here.
- **Custom-domain routing was not verified.** No `routes` block exists in either
  `wrangler.jsonc`; `app.patina.cloud` and `client.patina.cloud` are dashboard-managed
  out-of-band. They answered correctly, which is evidence but not configuration proof.
- **`/api/version` was not used as a freshness signal** — it returns static defaults on the
  Workers path and proves nothing.
- **Lint was not run** and would prove little outside designer-portal (only it has a resolvable
  ESLint config).
- **`apps/designer-portal/.env.local` still points at the local stack.** This deploy worked
  around it for one invocation; the next person deploying the designer portal must do the same
  or repoint the file. It remains owed to Kody.

---

## 11. Rollback, if it is needed

- **Portals** — redeploy the prior version listed in §7 (`7a88a385…` designer,
  `33a01d5a…` client), or check out `112e6f838` in a worktree and re-run
  `./infra/deploy-portal.sh`.
- **Edge functions** — redeploy the three from `112e6f838`.
- **Migrations** — `00578`/`00579` are append-only and roll **forward**. Nothing on Strata
  reads them yet (`design_build` proposal count is 0, all six notices disabled), so the cheapest
  containment is simply leaving the `design-build` flag uncreated, which is the state today.
