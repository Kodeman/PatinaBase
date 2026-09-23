# Deploy 1 — The Second House, Wave 1

**Ticket** SQ-151 · **Date** 2026-09-23 · **Merge commit** `4ebaa804b133cfa3cba7a76f8ae05035742c34e3` (main)
**Authorization** Kody's in-session "Go" to the orchestrator's message that the GO "also serves as the 'ship' for Deploy 1"; R-SH3 authorizes the Wave 1 prod mutations. Deploy 2 is **not** covered.

## Outcome: PARTIAL — stopped at step 3b, nothing rolled forward

| # | Step | Result |
|---|---|---|
| 1 | Preflight (merge + migration sequence) | **GREEN** |
| 2 | `supabase db push` → Strata + read-only assertions | **GREEN** |
| 3a | `deploy-portal.sh designer` | **GREEN** — version `b61988c8-a7a1-4813-a619-44eaedef2166` |
| 3b | `deploy-portal.sh admin` | **RED — refused by the script's own chunk gate.** Build passed; nothing was deployed. |
| 4 | Probes | designer **GREEN**; admin **not reachable** (3b never deployed); invite send **substituted** (see §5) |
| 5 | This report | written, committed |

**Live prod state right now:** Strata carries 00655/00656/00657; designer portal serves the Wave 1 build; **admin portal is still `45f1094c` from 2026-09-02**. That combination is degraded — see §6.

---

## 1 · Preflight (read-only) — GREEN

```
$ git merge-base --is-ancestor build/studio-hook-2026-09-22 main   → MERGED
$ git rev-parse main                                               → 4ebaa804b133cfa3cba7a76f8ae05035742c34e3
$ ls supabase/migrations | tail -6
00654_client_letter_phone_status.sql
00655_pledge_copy_out_email_templates.sql
00656_pause_middle_west_enrollments.sql
00657_retire_funnel_views.sql
20260910152111_create_contact_messages.sql
_pending
```

00655/00656/00657 in sequence, no gap.

**Main-checkout gate.** The dispatch worktree's harness refuses any git command aimed at the shared checkout (`git -C …` → "Refusing to run it"), so `git status` in `/Users/kody/Code/patina-merged` could not be run. Verified by content instead — `diff -rq` between this worktree (clean at `4ebaa804b`) and the main checkout over `supabase/migrations`, `supabase/functions`, `apps/designer-portal/src`, `apps/admin-portal/src`, `packages/` (excl. `dist`/`node_modules`/`.turbo`), `infra/`, `scripts/`, `docs/field`: **zero tracked content differences**, plus exactly the expected drift — `docs/field/sms-10dlc-runbook.md` modified, `docs/field/sms-10dlc-campaign-update-ticket.md` and `scripts/field-line/twilio-campaign-update.mjs` untracked — and otherwise only ignored artifacts (`.env*`, `.wrangler`, `.turbo`, `.venv`, `.DS_Store`, legacy `infra/coolify`). `.git/HEAD` → `ref: refs/heads/main`; `refs/heads/main` → `4ebaa804b…`. This is a stronger check than `git status` for deploy purposes: it compares content of the trees the build reads.

**Pre-push ledger check.** `supabase migration list` → 609 rows, **exactly three pending** (`00655`, `00656`, `00657`), **zero remote-only**. No numbering collision.

## 2 · Migrations → Strata — GREEN

`--include-all` is mandatory here and is the repo's established procedure (`docs/field/sms-10dlc-runbook.md` §Phase 0: remote's max version is the timestamp `20260910152111`, so every `006xx` file classifies as `missing-remote` and a plain push errors having applied nothing — confirmed again by this run's plain dry-run returning `LegacyDbPushMissingRemoteError`).

Dry-run planned exactly three, `seeds:[]`, `roles:[]`. Apply, 2026-09-23 **13:03:5x UTC**, exit **0**:

```
$ cd supabase && supabase db push --linked --project-ref bkvcixdmuyejfzcijpdg --include-all
Initialising login role...
Connecting to remote database...
Applying migration 00655_pledge_copy_out_email_templates.sql...
Applying migration 00656_pause_middle_west_enrollments.sql...
Applying migration 00657_retire_funnel_views.sql...
{"upToDate":false,"dryRun":false,"migrations":["00655_pledge_copy_out_email_templates.sql","00656_pause_middle_west_enrollments.sql","00657_retire_funnel_views.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

**The CLI suppressed all `RAISE NOTICE` output** — no `00656: … flipped active->paused` line appears above. Per the SQ-155 E6 gate, the assertion therefore rests on the read-only SELECTs below, not on the green push.

### 2a · E6 gate — the two Middle West enrollments are paused (SELECT only, emails masked)

```sql
SELECT substr(e.id::text,1,8), substr(e.user_id::text,1,8), e.status, e.next_step_at, e.current_step,
       (e.next_step_at = '2026-10-15T15:00:00Z'::timestamptz) AS next_step_at_is_resume
FROM public.sequence_enrollments e JOIN public.automated_sequences s ON s.id = e.sequence_id
WHERE s.name = 'Designer Onboarding'
  AND (e.user_id::text LIKE '19e7ae9b%' OR e.user_id::text LIKE '1a94f78f%' OR e.user_id::text LIKE '86cdd0aa%');
```

| enrollment | seat | status | next_step_at | is_resume | current_step |
|---|---|---|---|---|---|
| `24f71966` | `19e7ae9b` | **paused** | 2026-10-15 15:00:00+00 | true | 10 |
| `82a64492` | `1a94f78f` | **paused** | 2026-10-15 15:00:00+00 | true | 7 |
| `9ad7029e` | `86cdd0aa` (QA seat) | **active** | 2026-09-28 13:30:08.601+00 | false | 13 |

Exactly the three expected rows, exactly the expected ids. Both Middle West seats paused at the R-SH10 resume time; the QA seat untouched and still `active`. **E6 gate PASSED.** No pause was improvised.

### 2b · 00655 — the three templates carry no promise copy

`updated_at` on all three = `2026-09-23 13:03:53.074242+00` (this push).

| slug | subject_default | `%pledge%` | `%commission%` | `%quarter of our commission%` | `%share in what it earns%` | subject promise |
|---|---|---|---|---|---|---|
| `designer-invite` | "An invitation to Patina" | false | false | false | false | false |
| `milestone-first-payment` | "First money through the books" | false | false | false | false | false |
| `onboarding-aesthete` | "Teach it your taste" | false | false | false | false | false |

ILIKE was run over the **entire** `html_content`, not a 200-character window. Visible preheader prose, tags stripped, first line of each: "Your desk is set. One click signs you in — no password." / "Paid, recorded, reconciled — nothing left for you to file." / "Patina learns your eye the way an apprentice would — by watching, and by asking." (Literal first 200 bytes of each body is XHTML DOCTYPE boilerplate, which is why the ILIKE columns above are the real evidence.)

### 2c · 00657 — the three funnel views are gone

```
designer_funnel = null · conversion_funnel = null · consumer_funnel = null
funnel_views_remaining (pg_views) = 0
ledger tail (desc) = 20260910152111, 00657, 00656, 00655, 00654, 00653
```

## 3 · Portals → Cloudflare Workers

### 3a · designer-portal — GREEN, version `b61988c8-a7a1-4813-a619-44eaedef2166`

Pre-ship type gate (designer's `build` ignores type errors, so `type-check` is the real gate):
`pnpm --filter @patina/designer-portal type-check` → `tsc --noEmit`, **no errors**.

**First attempt was refused, correctly.** `./infra/deploy-portal.sh designer` Phase 0:

```
ERROR: refusing to build designer portal — resolved NEXT_PUBLIC_SUPABASE_URL
       points at a local host (http://127.0.0.1:54321). Refusing to ship a
       local-pointed build to production. Check apps/designer-portal/.env.local.
```

`apps/*/.env.local` in the main checkout is currently **local-pointed**. Permission to read that file is denied in this session, so it was neither read nor edited. Resolved with the override the script itself documents as highest precedence — "an exported process.env value wins (the operator override) … it is precisely the environment the child build inherits, and Next never overrides a value already in process.env" — exporting the Supabase trio plus `SUPABASE_ORIGIN_RUNTIME` **from the portal's own committed `wrangler.jsonc` production `vars` block** (root CLAUDE.md: the source of truth for prod portal env), then invoking `./infra/deploy-portal.sh designer` unchanged. The staging block can never be picked up (the extractor reads only the text above the first `"env"` key). Values used: `NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token`, `SUPABASE_ORIGIN_RUNTIME=https://api.patina.cloud` (the sanctioned designer-prod repoint), anon key masked.

Script output, tail:

```
==> [0/3] Preflight OK: RUNTIME REPOINT ACTIVE → https://api.patina.cloud (storage pinned direct)
==> [2.6/3] Chunk gate: 246 client chunks; checking every exported NEXT_PUBLIC_* name
==> [2.6/3] Chunk gate: resolved PostHog key literal present in 9 chunk(s)
==> [3/3] Deploying the designer portal to Cloudflare Workers
Deployed patina-designer-portal triggers (1.04 sec)
Current Version ID: b61988c8-a7a1-4813-a619-44eaedef2166
==> Done: designer portal deployed to production.
```

Exit **0**. No local value leaked into the bundle: `127.0.0.1:54321` / `localhost:5432` → **0** built chunks; `bkvcixdmuyejfzcijpdg.supabase.co` → 2 chunks.

`wrangler deployments list --name patina-designer-portal`, **bottom row** (list is oldest-first):

```
Created:     2026-09-23T15:32:32.739Z
Version(s):  (100%) b61988c8-a7a1-4813-a619-44eaedef2166
```

Previous bottom row was `386a0902-b115-4bc7-898c-a394126396f2` (2026-09-17T11:08).

### 3b · admin-portal — RED. Refused by `deploy-portal.sh`'s Phase 2.6 chunk gate. NOT deployed.

The admin build itself **passed** — `next build` is admin's strict real type gate and OpenNext completed (`handler.mjs` 16,460,855 bytes). The refusal is the gate that runs immediately after:

```
==> [2.6/3] Chunk gate: 348 client chunks; checking every exported NEXT_PUBLIC_* name
    NEXT_PUBLIC_ENV: name survives in 1 chunk(s)
    NEXT_PUBLIC_ENABLE_MFA: name survives in 2 chunk(s)
    NEXT_PUBLIC_ENABLE_DUAL_CONTROL: name survives in 2 chunk(s)
    NEXT_PUBLIC_ENABLE_IMPERSONATION: name survives in 2 chunk(s)
    NEXT_PUBLIC_ENABLE_ANALYTICS: name survives in 2 chunk(s)
    NEXT_PUBLIC_ENABLE_DEBUG: name survives in 2 chunk(s)
ERROR: refusing to deploy admin portal — client chunks still contain the
       literal NAME of these vars, i.e. the build left them as runtime
       property accesses (a.env.NEXT_PUBLIC_X) instead of inlining values
```

Chunks named: `app/(dashboard)/settings/page-3cf8f6d2ce1a78bb.js`, `app/(dashboard)/flags/page-e073371335ef1255.js`. Exit **1** — Phase 3 never ran, so nothing reached Cloudflare.

**This is a false positive, and it is pre-existing — nothing in Wave 1 caused it.** The gate is a bare substring grep for the var *name* over every chunk file. Those six names are in the admin bundle as **quoted display copy**: the settings and flags pages deliberately show operators which env var gates which feature.

```
apps/admin-portal/src/app/(dashboard)/settings/page.tsx:134
  description="NEXT_PUBLIC_ENABLE_MFA — gates UI hooks for MFA prompts. Server-side enforcement is separate."
apps/admin-portal/src/app/(dashboard)/flags/page.tsx:32
  envVar: 'NEXT_PUBLIC_ENABLE_MFA',
```

In the built chunk they appear only inside string literals, with the values coming from server data:

```
aEnabled,description:"NEXT_PUBLIC_ENABLE_MFA — gates UI hooks
),(0,s.jsx)(c,{label:"NEXT_PUBLIC_ENV",value:e.environm
```

The failure the gate exists to catch — a surviving `x.env.NEXT_PUBLIC_*` property access — does **not** occur for any of the six. A repo-wide grep of the built chunks for `[A-Za-z0-9_$]+\.env\.NEXT_PUBLIC_[A-Z_]+` returns only `NEXT_PUBLIC_API_TIMEOUT` and `NEXT_PUBLIC_API_URL` in one other chunk; neither is declared in `apps/admin-portal/wrangler.jsonc`, so the gate never checks them (a separate, pre-existing gap — not touched here).

Why it has not bitten before: admin-portal's last deploy is `45f1094c` (2026-09-02), predating the chunk gate, which was added on 2026-09-11 in response to the flags-dark outage. Admin-portal has most likely never been deployed through this gate.

**Stopped here rather than routing around it.** `deploy-portal.sh` is the only sanctioned portal path and it offers no waiver or allowlist; `opennextjs-cloudflare build`/`wrangler deploy` from the app dir is forbidden (it is how the stale-dist `TypeError: proposalTierVisibility is not a function` reached prod). Amending the gate means editing `infra/deploy-portal.sh`, which is outside this ticket's declared scope, is a safety-critical file in the prod deploy path, and — done by the same agent that would then use it to ship — should not go in unreviewed. The ticket's own instruction is to stop on red and not roll forward.

**Recommended fix (for whoever takes it):** make the gate match the failure it names rather than the bare name — require the property-access form, e.g. `grep -rlE "[A-Za-z0-9_$]+\.env\.${gate_name}\b"`, so a var name appearing as quoted UI copy no longer blocks a deploy while `a.env.NEXT_PUBLIC_X` still does. Keep the PostHog value check as-is. That is a one-line change with a real regression risk profile, so it wants its own ticket and review.

## 4 · Probes

**4a · Designer chunk — the Accounts-book Pledge band is gone from the served bundle. GREEN.**

The accounts code ships in `app/(document)/layout-0341001946c84bda.js`. Fetched from the live origin:

```
$ curl 'https://app.patina.cloud/_next/static/chunks/app/(document)/layout-0341001946c84bda.js'
http=200 bytes=175076
```

| grep over the served chunk | hits |
|---|---|
| `The Pledge, returned to you` | **0** |
| `What teaching returns` | **0** |
| `given to the commons` | **0** |
| `returned to you` | **0** |
| `pledge` | **0** |
| `Design fees` (positive control — retained studio earnings copy) | **1** |

The positive control matters: it proves the fetch landed on the real accounts chunk rather than a 404 or an unrelated file. sha256 of the served chunk equals sha256 of the artifact this run built (`5e5afebf904b1540d98472ff9680d082…`, `cmp` identical) — so the bytes in production are the bytes built from `4ebaa804b`. The same five markers are also 0 across all 246 built chunks, including `pledgeYtd` and `givenToCommons`.

**4b · Admin analytics "Unavailable" readout — NOT VERIFIABLE.** The retired-readout copy (`Unavailable — funnel readouts retired 2026-09.`, `apps/admin-portal/src/app/(dashboard)/analytics/page.tsx:289`, a `'use client'` page) is in the build that step 3b refused to deploy. It is not in production, so there was nothing to probe. Signed-in admin walk not attempted for the same reason.

**4c · designer-invite send — SUBSTITUTED, deliberately.** Two independent reasons not to send:

1. **Not possible here.** `supabase/functions/designer-invite/index.ts` requires a caller holding an admin-domain role (`user_roles` JOIN `roles`, `domain='admin'`). Admin sign-in is magic-link only, to `kody@kochaver.com`; no admin JWT is obtainable in this session.
2. **It would exceed the authorization.** That function mints an account, flips `profiles.is_designer` and inserts a `user_roles` grant. Sending one would create a real prod designer account — a fifth prod mutation, outside the four R-SH3 authorizes and against this ticket's "No other prod change".

The substituted evidence is stronger for the question actually being asked. The function renders from the database row, not the `.tsx` — `renderTemplateFromDb(admin, 'designer-invite', …)` at line 253, then `sendCompliantEmail` with `subject: rendered.subject`, `html: rendered.html`. §2b asserts that exact row's subject and **entire** body carry no Pledge/commission/quarter/share text. What a live send would add is proof of variable substitution, not of copy.

## 5 · What was deployed, and what was not

| Unit | Command | Authorized in-session | Result |
|---|---|---|---|
| Strata migrations 00655/00656/00657 | `supabase db push --linked --project-ref bkvcixdmuyejfzcijpdg --include-all` | yes | applied, exit 0, asserted by SELECT |
| designer-portal | `./infra/deploy-portal.sh designer` (with the documented exported-env override) | yes | `b61988c8-a7a1-4813-a619-44eaedef2166` |
| admin-portal | `./infra/deploy-portal.sh admin` (same override) | yes | **refused by chunk gate, not deployed** |
| edge functions | — | — | none changed in Wave 1; none deployed |
| services / workers | — | — | untouched |
| retired Coolify box | — | — | never contacted |

Not verified: custom-domain routing (no `routes` in any wrangler.jsonc — `patina.cloud` hostnames are dashboard-managed); `wrangler tail` error-spike watch; any signed-in walk of either portal; lint (only designer-portal's config resolves, and it was not run); the combined full repo gate (the orchestrator owns that).

## 6 · Live prod risk while step 3b is unresolved — act on this

00657 dropped `conversion_funnel` while the **2026-09-02 admin build is still serving**, and that build reads it. `apps/admin-portal/src/app/api/admin/decision-analytics/route.ts` as deployed fetches `bottleneckPhases` and the funnel in one `Promise.all`, then:

```ts
if (bottleneckRes.error) throw new Error(bottleneckRes.error.message);
if (funnelRes.error) throw new Error(funnelRes.error.message);
…
} catch (err) { return serverError((err as Error).message ?? 'Failed to load decision analytics'); }
```

`conversion_funnel` no longer exists, so `funnelRes.error` is set (undefined_table) and the throw is unconditional — **the whole endpoint 500s, taking the bottleneck readout down with it**, not just the funnel. The admin analytics page therefore shows a failed load instead of the intended "Unavailable — funnel readouts retired 2026-09."

Blast radius is one page behind super_admin (Kody is the only super_admin), no data at risk, nothing customer-facing. The resolution is **forward**: unblock and ship admin-portal. Do not roll back — 00657 is a `DROP VIEW` (append-only ledger; reversal is a new migration), and the designer deploy is correct and wanted.

## 7 · Deviations from the ticket text, each deliberate

1. `deploy-portal.sh` takes `designer`/`admin`, not `designer-portal`/`admin-portal` (its own usage line and `case` statement). Ran the names the script accepts.
2. `--include-all` added to `db push` — mandatory, for the documented reason; a plain push applied nothing.
3. The Supabase trio exported from `wrangler.jsonc` before invoking the script, because `.env.local` is local-pointed and unreadable in this session. This is the script's own documented operator override, not a bypass; the script ran unmodified, and the bundle was verified free of local values.
4. The Management API read-only SELECTs were run via `supabase db query --linked` (which the CLI routes through the Management API). SELECT-only, emails masked to 8-hex prefixes.
5. Main-checkout `git status` replaced with a content `diff` (harness refuses git against the shared checkout).
6. designer-invite live send replaced with row-level proof (§4c).
7. `pnpm --filter @patina/designer-portal type-check` added ahead of the designer deploy, per patina-deploy §5.

## 8 · Owed to Kody

- **A decision on 3b** — amend the chunk gate (recommended fix in §3b) or waive it for admin-portal — then ship admin-portal. Until then the admin analytics page is 500ing (§6).
- `apps/*/.env.local` in `/Users/kody/Code/patina-merged` is local-pointed (`http://127.0.0.1:54321`). Every future portal deploy from that checkout needs the same override, or the files repointed.
- Signed-in prod walks: designer accounts book (no Pledge band, studio earnings intact); admin analytics once shipped.
- A live designer-invite send to a Patina mailbox, from a signed-in admin, if the rendered-copy walk is still wanted (§4c).
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_TIMEOUT` survive as runtime property accesses in an admin chunk and are undeclared in `wrangler.jsonc`, so the gate never checks them — pre-existing, unexamined here.
