# Wave 1 walk environment — "The Agreement, Composed"

Date 2026-09-06 · prepared by the Wave 1 integration steward.
Everything below is **local only**. Nothing here touches Strata, and no
production key appears in this file.

---

## 0 · What is already true when you sit down

- The shared local Supabase stack has been reset by this steward and is
  **running at migration head `00575`** (`00575_agreement_parts.sql` applied,
  all 33 seed files replayed). Probe if you want it:
  ```bash
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -tAc "select version from supabase_migrations.schema_migrations order by version desc limit 1"
  # → 00575
  ```
- `supabase_edge_runtime_supabase` and `supabase_pooler_supabase` are stopped
  (they were stopped before this build began and were left that way). Nothing
  in the Wave 1 walk needs either.
- The integration worktree is bootstrapped: `pnpm install --frozen-lockfile`
  done, and every workspace package the two portals depend on is built
  (8/8 turbo tasks).
- Neither portal has a `.env.local` in this worktree — **on purpose**. Every
  value is passed inline below, so the walk cannot accidentally inherit a
  `.env.local` that points at Strata prod (that has happened before —
  `patina-local-dev`).

Worktree for the walk:

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration
```

## 1 · Local keys and URLs

Read them yourself rather than trusting a paste — they are the Supabase CLI's
fixed demo pair, identical on every developer's machine, and they authorize
nothing outside `127.0.0.1`:

```bash
supabase status --workdir /Users/kody/Code/patina-merged -o env
#   API_URL           http://127.0.0.1:54321
#   DB_URL            postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   STUDIO_URL        http://127.0.0.1:54323
#   MAILPIT_URL       http://127.0.0.1:54324      ← every portal email lands here
#   ANON_KEY          eyJhbGciOiJIUzI1NiIs…       (safe to paste anywhere local)
#   SERVICE_ROLE_KEY  eyJhbGciOiJIUzI1NiIs…       (LOCAL ONLY — never off this machine,
#                                                  never into a file: the repo's
#                                                  pre-commit scan rejects it)
```

## 2 · Boot the designer portal (`:3000`) with the flag forced on

One bare `cd` in its own shell call, then the run — `pnpm --dir <wt> turbo …`
mis-spawns here (`env.md`):

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration

eval "$(supabase status --workdir /Users/kody/Code/patina-merged -o env \
        | grep '^SERVICE_ROLE_KEY=' | sed 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/')"
export SUPABASE_SERVICE_ROLE_KEY

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status --workdir /Users/kody/Code/patina-merged -o env | sed -n 's/^ANON_KEY=//p')" \
NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true \
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
pnpm --filter @patina/designer-portal dev
```

- `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` is the **only** way the
  composer appears: `useFeatureFlag('agreement-parts')` is fail-closed and the
  PostHog flag does not exist yet. Call sites:
  `components/document/rooms/drafting/service-agreement-drafting-room.tsx:84`
  and `components/document/account/account-studio-page.tsx:162`.
- `…DATA_MODE=live` disables the designer portal's mock fallback, which
  otherwise swallows an RLS denial and renders fixture data that looks real
  (`patina-verification` trap 1). Leave it on for a walk that is supposed to
  prove something.
- **`NEXT_PUBLIC_*` is inlined at dev-server start.** Changing the override
  means restarting the server, not reloading the tab.
- To walk the **flag-off** side — the byte-identity promise — restart with
  `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false` (or drop the variable
  entirely; fail-closed gives the same answer).

## 3 · Boot the client portal (`:3002`)

Separate shell, same stack:

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration

eval "$(supabase status --workdir /Users/kody/Code/patina-merged -o env \
        | grep '^SERVICE_ROLE_KEY=' | sed 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/')"
export SUPABASE_SERVICE_ROLE_KEY

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status --workdir /Users/kody/Code/patina-merged -o env | sed -n 's/^ANON_KEY=//p')" \
pnpm --filter @patina/client-portal dev
```

The client side of Wave 1 carries **no flag**: the shell renders the composed
body when the bundle it already fetches carries parts
(`commercial-document-shell.tsx:194` — `if (bundle.parts.length > 0)`), and
today's body otherwise. So the homeowner's page is the honest test of what the
designer composed — nothing to force on, and nothing to force off.

Two portals on one browser share a cookie jar and will sign each other out
(`project_local_two_portal_cookie_collision.md`). Use two profiles, or one
window per portal.

## 4 · The seeded accounts

All seeded passwords are **`password123`** (`supabase/seed/dev-accounts.sql:5`).

| Who | Email | Use it for |
|---|---|---|
| Designer — Leah Hartwell | `designer@patina.dev` | the Contract Room, the composer, Account → Studio → Agreement defaults |
| Studio manager | `studio_manager@patina.dev` | the R3 read-vs-write split on studio defaults (a member who is not owner/admin must read and not write) |
| Homeowner | `client@patina.dev` | the client page at `:3002` |
| Super admin | `superadmin@patina.dev` | only if you need `:3001` |

`tester@patina.cloud / 000000` is the **prod** test-login precedent from the
studio-invite program — it does not exist on this local stack. Use the table
above locally.

The two seeded design-services agreements
(`Aspen Loft — Design Services` `b0000000-…-0000000cd001` and
`Cedar Lane — Design Services` `b0000000-…-00000000cb01`, both owned by
`designer@patina.dev`) are **`accepted`**, i.e. frozen by
`guard_commercial_authored_child` — they are the right places to check that a
document authored before parts still renders exactly as it did, and the wrong
place to try composing. **To walk the composer, create a fresh design-services
agreement from the Drafting Room**; it is born in `draft` and
`materialize_standard_parts` seeds the nine standard parts on first open under
the flag.

## 5 · What the walk should try to break

The Wave 1 reviews leave four things standing that only a person at the
keyboard will feel. They are written here as walk targets, not as claims:

1. **A second money part of the same kind.** Add a second Ceiling (or
   Retainer / Cadence / Deposit / Role-rates) from the Add menu. Readiness is
   expected to say ready; Save is expected to be refused by the database with
   *"an agreement carries only one …"*. Backend R2 / designer DR20.
2. **A money part added from the rail.** Remove a standard money part and add
   a fresh one, then read the client page. The composer mints
   `custom.<uuid>` keys; money projects by kind+variant, so this should now
   reach `proposal_service_terms` — but the **prose** parts (scope, terms,
   deliverables, exclusions) still project by `part_key`, so a rail-composed
   clause may write an empty body into the row both flag-off renderers read.
   Backend R3.
3. **Two members, one flag.** Sign in as the designer with the flag on, compose
   a ceiling; sign in as a second co-member with the flag **off** and save the
   seven-facet room. The page the client signs and the authority the studio
   bills against can end up carrying different numbers. Backend R1 — the open
   blocker, unruled.
4. **Flag-off byte-identity.** Restart with `agreement-parts:false` and read
   the seven-facet room and the client body. Nothing may differ from `main`.
   (The jest snapshot already pins this; the eye is the second witness.)

## 6 · Tearing down

Leave the stack up and at `00575` for the next reader. If you must reset it,
say so in `stack-notice.md` first — this steward currently owns it.
