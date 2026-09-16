# W7 — Deploy plan (People Room CRM + email-deliverability step one)

Preflight run 2026-09-16 (session patina-merged-73's W7 owner). Read-only probes
only — no prod mutation performed to produce this plan. `origin/main` was
fast-forwarded to this branch's tip as step 4 below records; the ordered
command list is what runs FROM HERE, against the merged `main`.

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
New `origin/main`: `a1deb0753c9bbd1036c448e8fb421e2b66237d67`

---

## 0. Preconditions confirmed this pass

- `supabase migration list --linked --project-ref bkvcixdmuyejfzcijpdg`: `00591`
  and `00595`–`00620` are already applied on Strata (remote populated).
  `00592`–`00594` and `00621`–`00638` show `remote: ""` (pending, local only).
  **`--include-all` IS required** — `00592`–`00594` sit numerically behind
  Strata's already-applied `00595`–`00620`, so a plain `db push` refuses them.
- `supabase secrets list --project-ref bkvcixdmuyejfzcijpdg`: **`RESEND_WEBHOOK_SECRET`
  is present** (set 2026-07-07, untouched since) — not a STOP item for the
  `resend-webhook` deploy.
- `supabase functions list`: 84 functions live. 33 of the 34-function deploy
  set already exist (will be updated in place); **`paperwork-upload` does not
  exist yet** — its first deploy creates it (00637/W4 introduces it).
- R-BX (00636 §2 statement order): confirmed in
  `supabase/migrations/00636_invoice_link_hardening.sql` — `ALTER TABLE
  invoice_links ALTER COLUMN token DROP NOT NULL` (line 199) and `DROP
  CONSTRAINT IF EXISTS chk_invoice_links_token` (line 200) both precede
  `UPDATE invoice_links SET token = NULL ...` (line 204), which precedes the
  new `chk_invoice_links_token_frozen` (lines 207–209). **Order is correct
  per the ruling — NOT a STOP item.** This matters because
  `invoice_links` currently holds **33 live rows** on Strata (`token` still
  `NOT NULL` today) — exactly the populated-table case R-BX exists for.
- R-BD/R-BI legacy population: **0** projects with `studio_id IS NULL` on
  Strata today (and therefore 0 with an ambiguous designer-org resolution, and
  0 carrying `project_parties` seats). No ambiguous project ids to list for
  Kody — this population is currently empty; W3's backfill has nothing to do
  on this pass.
- Merge: `origin/main` (`c879118ec`) confirmed an ancestor of HEAD; pushed
  fast-forward, `build/people-room-crm-2026-09-11:main` → new `origin/main`
  `a1deb0753`. See §4 of the return summary for the two post-integration-report
  commits (`cd3be44ab`, `a1deb0753`) folded in — both are R-CD wording/guard
  fixes to `add-person-sheet.tsx` only, each independently gated green
  (jest 717/717, designer type-check clean), with one wording ruling still
  owed to Kody (noted, not blocking).
- Rollback rows (bottom = current live, oldest-first per `patina-deploy`):
  - `patina-designer-portal`: `eab16705-27fd-4edc-8e0b-abd995a21bc1` (created
    2026-09-15T09:59:02Z) — the hour-tracking ship.
  - `patina-client-portal`: `83f2dcef-46cf-4284-a298-d1ff16d1a666` (created
    2026-09-15T10:00:22Z) — the hour-tracking ship.
  - Rollback = redeploy the prior good commit (`1ead6cc53`, hour-tracking) via
    `./infra/deploy-portal.sh <name>` from a checkout at that commit, or
    `wrangler rollback --name <worker>` to the version ids above if the CLI
    supports it for these Workers.

## 1. Ordered command list

Run from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
(or wherever `main` is now checked out post-merge), absolute paths, no chained
`cd`. Order per `patina-deploy`: migrations → edge functions → services/workers
→ portals → smoke.

### 1a. Migrations (Strata, `bkvcixdmuyejfzcijpdg`)

```
supabase db push --include-all --project-ref bkvcixdmuyejfzcijpdg \
  --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build
```

Applies `00592`, `00593`, `00594`, `00621`–`00638` (18 files) in one pass.
`--include-all` is required because of `00592`–`00594` alone (§0). No secret
gates this step.

### 1b. Edge functions (34 total, `--no-verify-jwt` on 6)

Deploy in the order below (any order is safe — no cross-function runtime
dependency at deploy time — but `_shared` importers should not be assumed live
until every one of these has redeployed, per AGENTS.md's "a `_shared/*` edit
requires redeploying EVERY importing function"):

```
# --no-verify-jwt (config.toml verify_jwt = false)
supabase functions deploy fulfillment-po        --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy invoice-link-checkout --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy paperwork-upload      --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg   # NEW function, first deploy
supabase functions deploy resend-webhook        --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy sms-inbound           --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy stripe-webhook        --no-verify-jwt --project-ref bkvcixdmuyejfzcijpdg

# verify_jwt = true (default or explicit) — remaining 28
supabase functions deploy apns-send                    --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy campaign-dispatch             --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy client-invite                 --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy commercial-document-notify    --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy create-checkout-session       --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy designer-invite               --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy digest-dispatcher             --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy field-daily                   --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy fulfillment-notify            --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy invoice-reminders             --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy invoice-send                  --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy morning-brief                 --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy notification-digest           --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy notification-dispatch         --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy po-send                       --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy proposal-nudge                --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy proposal-send                 --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy proposal-sign-confirmation    --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy quote-request-send            --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy review-requests               --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy selection-review-send         --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy site-request-dispatch         --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy sms-dispatch                  --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy spec-pdf                      --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy trade-agreement-send          --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy trade-rfq-send                --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy waitlist-notify               --project-ref bkvcixdmuyejfzcijpdg
supabase functions deploy workspace-member-invite       --project-ref bkvcixdmuyejfzcijpdg
```

All 34 pass with `--workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
appended (omitted above for line length). No step here is blocked by a missing
secret — `RESEND_WEBHOOK_SECRET` (gates `resend-webhook`'s fail-closed check)
and every other secret this set reads (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `TWILIO_*`, `SUPABASE_*`) are already present (§0).

### 1c. Services / Cloudflare Workers

None in this program's own scope beyond the portals below. `edge-api` is
explicitly NOT required (email-deliverability-checklist.md's chain does not
name it; no wave report in this program touches it).

### 1d. Portals

Type-check both first (already GREEN per integration-report.md §4 — re-run if
the merge introduced anything new):

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/client-portal type-check
```

Then deploy, portal script only, from the worktree:

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/infra/deploy-portal.sh designer-portal
/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/infra/deploy-portal.sh client-portal
```

### 1e. iOS / Sanity (outside the migrate→functions→workers→portals chain, same program)

- **TestFlight**: build 5 (marketing 0.1) already uploaded and `VALID`
  (`cloud.patina.field`, ASC app id `6805156812`). **Not** assigned to a
  tester group and export compliance **not declared** — both are Kody's own
  manual ASC steps, no CLI command to enumerate here.
- **Sanity**: **BLOCKED on a token with `create` rights** on the help-system
  dataset (current token 18/18 errored `Insufficient permissions; permission
  "create" required`). Owed command once a suitable token is supplied:
  ```
  SANITY_AUTH_TOKEN=<supplied by Kody> \
    node /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/studios/help-system/scripts/run-people-help-seed.mjs --commit
  ```

### 1f. Smoke / verify

```
npx wrangler deployments list --name patina-designer-portal   # read bottom row, confirm new version on top
npx wrangler deployments list --name patina-client-portal     # same
```
Plus behavior probes per patina-deploy (not version strings): sign in as
Leah, open the People room / Directory / Call Sheet, confirm the R-CC Hours
door renders on a linked teammate card; open a `/paperwork/[token]` link;
confirm an invoice pay-link folio still resolves post-migration (00636
regenerates on next send — an existing link's UI copy-address act should say
"Patina cannot show you its address again" rather than erroring).

## 2. Blocked steps

| Step | Blocked by | Status |
|---|---|---|
| Sanity push (18 help docs) | `SANITY_AUTH_TOKEN` lacks `create` rights | STOP — needs Kody to supply a token with create rights |
| iOS tester-group assignment + export-compliance declaration | Manual ASC steps, not CLI-automatable | Owed to Kody, not a deploy-chain blocker |

No migration, edge-function, worker, or portal step is blocked by a missing
secret or by any SQL probe result this pass. `resend-webhook`'s
`RESEND_WEBHOOK_SECRET` — the one secret named as a possible STOP item in the
task brief — is confirmed present.
