# Wave 2 walk environment — "The Agreement, Composed", the Library

Written 2026-09-07 by the Wave 2 integration steward, from
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(branch `agreement/w2-integration`, HEAD `a8906896f`).

> **Read the wave report first.** Three gates are red on this branch and two of
> them are Wave 2's own (`wave-report.md` §Gates). The walk is set up here so it
> can be run the moment those are cleared; walking it before they are cleared
> will reproduce the failures rather than discover them.

---

## 1 · The stack

The shared local Supabase stack is already reset to this branch — every
migration through `00577_agreement_fee_schedules.sql` applied, every seed
replayed. Nothing else needs doing to the database before the walk.

```
Supabase API      http://127.0.0.1:54321
Supabase Postgres postgresql://postgres:postgres@127.0.0.1:54322/postgres
Supabase Studio   http://127.0.0.1:54323
Mailpit           http://127.0.0.1:54324
```

Confirm the head before you start:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select version from supabase_migrations.schema_migrations order by version desc limit 2;"
# expect: 00577 / 00576
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select to_regclass('public.agreement_templates'), to_regclass('public.studio_agreement_parts'),
          to_regclass('public.agreement_part_events'), to_regclass('public.agreement_execution_snapshots');"
# expect: four non-null names
```

If someone else has reset the stack in the meantime, redo it from this
worktree — never from the main checkout, which is a migration behind:

```bash
supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration
```

## 2 · The service-role key (local only)

Not written into this file — a repo hook rejects any committed file carrying a
service-role JWT, and this file lives in the repo tree. Fetch it on demand:

```bash
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status --workdir /Users/kody/Code/patina-merged -o env \
  | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status --workdir /Users/kody/Code/patina-merged -o env \
  | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')"
```

Both are the Supabase CLI's fixed local demo keys — signed with the public demo
JWT secret, meaningless outside this machine. They still never belong in a
committed `.env` or in any prod config.

## 3 · Booting the two portals from this worktree

Both flags must be on together. `agreement-library` is fail-closed and only
renders when `agreement-parts` is also true; with either off, both portals must
render exactly as Wave 1 shipped.

`NEXT_PUBLIC_*` is inlined at dev-server start — change the override and you
must restart the server, not just reload the page.

### Designer portal — `http://localhost:3000`

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="…"          # §2
export SUPABASE_SERVICE_ROLE_KEY="…"              # §2
export NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true
export NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live # build sheet §7 — `auto` serves mock
                                                  # data on ANY thrown call and will make a
                                                  # broken RLS path look green
pnpm dev:designer                                 # designer portal + orders + media + projects
```

### Client portal — `http://localhost:3002`

Separate shell, same worktree:

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration/apps/client-portal
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="…"          # §2
export SUPABASE_SERVICE_ROLE_KEY="…"              # §2
export NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true
pnpm dev
```

⚠ `apps/*/.env.local` has pointed at Strata **prod** before. Before the first
click, confirm what the running server actually loaded:

```bash
curl -s http://localhost:3000/ | grep -o '127.0.0.1:54321' | head -1   # expect a hit
curl -s http://localhost:3002/ | grep -o '127.0.0.1:54321' | head -1   # expect a hit
```

The client Playwright config (`apps/client-portal/playwright.config.ts`) sets
`reuseExistingServer: true` and pins **no** flag override in `webServer.env` —
so a server you started yourself with the two flags is the only way the e2e
touchpoint sees Wave 2 UI. Start the server first, then run Playwright.

## 4 · Seeded accounts

Every `*@patina.dev` account below is created by `supabase/seed/dev-accounts.sql`
with the password **`password123`** (bcrypt-hashed at seed time,
`dev-accounts.sql:5,19`). The `tester@patina.cloud` / `000000` test-login
precedent from the studio-invite program is a **production** convenience and has
no seeded local counterpart — use the `@patina.dev` accounts locally.

| Account | Password | Who they are | Walk role |
|---|---|---|---|
| `designer@patina.dev` | `password123` | Leah Hartwell. **Owner of two active `design_studio` organizations** — `Leah Hartwell` (`8f6dc5b0-ef48-4132-a102-a5eed2136936`) and `Local Dev Studio` (`b0000000-0000-0000-0000-000000000001`) | The walk's designer (build sheet §9 designates "an owner or admin of a two-studio account") |
| `client@patina.dev` | `password123` | The multi-house homeowner | The walk's homeowner, steps 9–13 |
| `client-solo@patina.dev` | `password123` | The single-house homeowner (`the-client-page.sql`) | Alternate homeowner if a one-house door is wanted |
| `studio_manager@patina.dev` | `password123` | `studio_admin` | The admin-not-owner case for R3 (Save-as-template visible) |
| `superadmin@patina.dev` | `password123` | `super_admin` | Admin portal, if needed |

**Read this before step 2 of the walk.** `designer@patina.dev` is precisely the
persona backend blocker **R3-B1** breaks: `00576_agreement_library.sql:677-681`
refuses any studio Template unless the actor and the lead designer share
*exactly one* studio, and this account shares two with herself. Verified on this
reset stack — the two rows above are both `design_studio` / `active` / `owner`.
Walk steps 2 and 5 will refuse until R3-B1 is fixed. There is no seeded
one-studio designer who is also the author of an executed-shape draft, so the
walk cannot be routed around the blocker by swapping the walker.

## 5 · What is already on the stack for the walk

```
public.agreement_templates (kind='seeded'):
  patina.consultation          consultation          Consultation / hourly              5 parts
  patina.design_services       design_services       Design services (Patina standard)   9 parts
  patina.furnishings_services  furnishings_services  Furnishings only                    7 parts
  patina.design_build          — absent, by design (Wave 3)
```

Designer finding **R3-5** applies here: the template picker filters by the
agreement's class, so on a `design_services` agreement only
`patina.design_services` is selectable — two of the three seeded templates are
unreachable from the room as shipped.

## 6 · The one fixture the walk and the e2e both want and neither has

`apps/client-portal/tests/threshold.spec.ts:636` drives a seeded per-phase
agreement, *Cedar Lane — Phase Work*, id
`b0000000-0000-0000-0000-00000000cb04`, expected `sent`. That id appears
**nowhere else in the repository** — no seed file creates it (`grep -rln
00000000cb04 supabase apps` returns the spec alone). Until a seed owns it, the
e2e touchpoint fails at its first assertion and walk steps 9–13 have to be
reached by composing an agreement by hand through the room (steps 1–8) instead
of by opening a ready one.

## 7 · Running the e2e touchpoint once the fixture exists

```bash
# server first, with the flags (see §3), then:
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration/apps/client-portal
export SUPABASE_SERVICE_ROLE_KEY="…"
export NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true
npx playwright test tests/threshold.spec.ts --workers=1 --reporter=list
```

`pnpm --filter @patina/client-portal test:e2e -- --workers=1` does **not** work:
pnpm forwards the literal `--` to Playwright, which reads it as a test-file
regex and reports *"No tests found"*. Call `npx playwright test` directly.

## 8 · SQL probes the walk asks for

Step 12:

```sql
SELECT fee_basis, fee_amount_cents, fee_schedule, retainer_credit_rule
FROM public.project_billing_authorities
WHERE source_proposal_id = '<the proposal id>';
```

Step 13:

```sql
SELECT s.document_hash = sig.evidence_fingerprint AS hash_matches
FROM public.agreement_execution_snapshots s
JOIN public.commercial_document_signatures sig
  ON sig.proposal_id = s.proposal_id AND sig.party_role = 'studio'
WHERE s.proposal_id = '<the proposal id>';
```

## 9 · Housekeeping

- The client dev server started for the integration e2e run has been stopped;
  ports 3000 and 3002 were free at the time of writing.
- No scratch databases remain on the stack (`patina_w1`, `patina_base`,
  `patina_final`, `patina_w2r3` are all gone; only `postgres` and
  `storage_vectors` exist).
- Nothing was pushed. Nothing was applied to Strata. No Worker was deployed.
