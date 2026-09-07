# Wave 1 walk environment — "The Agreement, Composed"

Date 2026-09-06 · prepared by the Wave 1 integration steward.
Everything below is **local only**. Nothing here touches Strata, and no
production key appears in this file.

> **Refreshed for integration round 2** (lanes' rounds 4–5). Integration head is
> `b2a9e68f94cc590ec77c218dc3ca992d4c498303` on `agreement/w1-integration`,
> merged over `origin/main` `3a9472f92`. The stack has been reset again from
> this worktree, so the `00575` body it carries is the **round-4** body
> (`discard_agreement_parts` present, the R17 projection trigger armed) — the
> earlier reset left a pre-R17 copy behind. §3 and §5 below are rewritten for
> what the merged tree actually does.

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
(`commercial-document-shell.tsx:205` — `if (bundle.composed ?? bundle.parts.length > 0)`),
and today's body otherwise. So the homeowner's page is the honest test of what
the designer composed — nothing to force on, and nothing to force off.

`get_client_commercial_document_bundle` emits the `parts` key (verified against
the reset stack: `pg_get_functiondef` line 100). It does **not** emit
`composed` / `agreementComposed` / `agreement_composed` — nothing in the stack
does — so the `??` always falls through to `parts.length > 0` and the branch
behaves exactly as it did before the key was added. Client finding **F-1/F-2**:
the kill switch the shell now reads has no producer. It rides as an advisory,
not a blocker, because the fallback is today's behaviour; but do not walk
expecting `composed: false` to hide a composed agreement — nothing can set it.

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

Rounds 4–5 closed the two things this section used to open with: the Add menu
no longer offers a second part of a money variant it already carries (R18), and
readiness reports the duplicate as a blocker, so Save can no longer reach the
database's 23514. The R17 walls are armed on the reset stack — the projection
trigger, the typed `agreement_composed` refusal, and the withdrawn
`authenticated` write grants on `proposal_service_terms` /
`proposal_service_rates` — and `discard_agreement_parts` exists.

What the reviews still leave standing, as walk targets rather than claims:

1. **Money on the page she signs.** Compose an agreement for a class that bills
   and leave every money part **client-hidden** (or leave it with no money part
   the class requires that the homeowner can see). The designer UI is expected
   to refuse; the DB floor (`_agreement_floor_unmet`) asks the *ceiling*
   question and not the *client-visible money* one, so a document composed by
   any other path can send, sign and countersign into an hourly authority.
   Backend **M1-new** (major, 0.90). Watch what the homeowner's page prints.
2. **A money part added from the rail.** Remove a standard money part and add a
   fresh one, then read the client page. The composer mints `custom.<uuid>`
   keys; money projects by kind+variant, so it reaches
   `proposal_service_terms` — but the **prose** parts (scope, terms,
   deliverables, exclusions) project by `part_key` (R19), so a rail-composed
   clause can write an empty body into the row both flag-off renderers read.
3. **Two members, one flag.** Sign in as the designer with the flag on and
   merely **open** the Contract Room on a fresh draft; that composes the draft
   irreversibly for the whole studio. Then sign in as a co-member the flag has
   not reached and open the seven-facet room: they should now meet the plain
   refusal sentence with Save disabled, not a form that silently loses. Backend
   **M3** — the database can un-compose, but no product surface calls
   `discard_agreement_parts`, so there is no way back from the UI.
4. **Not yet set, on both surfaces.** Compose a ceiling part and leave the
   figure empty, then read the designer's live client-preview beside the
   homeowner's page. R21 says both print "Not yet set". Client **F-5** says
   they drift on the first composed agreement — the preview prints `$0`.
5. **A deposit nobody typed.** Client **F-6**: a 50% furnishings deposit that
   was never entered can print as a money term of the design-services
   agreement the homeowner signs. Read the composed body for a deposit line
   you did not write.
6. **Flag-off byte-identity.** Restart with `agreement-parts:false` and read
   the seven-facet room and the client body. Nothing may differ from `main`.
   (The designer drafting-room jest snapshot and the client shell snapshot pin
   this; the eye is the second witness.)

## 6 · Tearing down

Leave the stack up and at `00575` for the next reader. If you must reset it,
say so in `stack-notice.md` first — this steward currently owns it.
