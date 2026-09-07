# Wave 2 environment — "The Agreement, Composed", the Library

Written 2026-09-07 by the Wave 2 steward.

## Base

- Base sha: `a6584dbc5a07dd91af9eec67489ec669deb5961e` (`main` / `origin/main`, HEAD at the
  time of minting).
- This is a descendant of `61a68919d` (the w1-integration merge — "the agreement, composed,
  wave 1"), confirmed via `git merge-base --is-ancestor 61a68919d HEAD`.
- Verified on this base: `supabase/migrations/00575_agreement_parts.sql` present (Wave 1's
  migration), and `agreement-parts` used as a real `useFeatureFlag('agreement-parts')` /
  `useFeatureFlag("agreement-parts")` gate in
  `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx`
  and `apps/designer-portal/src/components/document/account/account-studio-page.tsx`.

## Worktrees + branches

All three created with `git worktree add -b <branch> <path> a6584dbc5a07dd91af9eec67489ec669deb5961e`.

| Lane      | Worktree path                                                                          | Branch                 |
|-----------|-----------------------------------------------------------------------------------------|-------------------------|
| backend   | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`                  | `agreement/w2-backend`  |
| designer  | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`                 | `agreement/w2-designer` |
| client    | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`                   | `agreement/w2-client`   |

All three confirmed at HEAD `a6584dbc5a07dd91af9eec67489ec669deb5961e` via
`git -C <wt> rev-parse HEAD` immediately after creation.

Bootstrap done for all three: `pnpm install --frozen-lockfile` (bare `cd <wt>` first, each its
own Bash call — cwd does not persist across calls) succeeded in ~32-34s each. Dependent builds:

- backend: `pnpm turbo build --filter=@patina/supabase^...` → 2/2 successful (cache hit,
  `@patina/types`, `@patina/utils`).
- designer: `pnpm turbo build --filter=@patina/designer-portal^...` → 6/6 successful
  (`@patina/design-system`, `@patina/help-system`, `@patina/api-routes`, etc.).
- client: `pnpm turbo build --filter=@patina/client-portal^...` → 8/8 successful
  (`@patina/design-system`, `@patina/aesthete-quiz`, `@patina/api-client`, etc.).

## Mint numbers

Highest `005NN` migration filename found across every local ref (heads + remotes + tags),
via `git for-each-ref` + `git ls-tree -r --name-only <ref> -- supabase/migrations` per ref:
`00575_agreement_parts.sql` (on `main`, `origin/main`, and the `agreement/w1-*` branches — no
ref anywhere has gone past it).

- **mintFrom = 00576**
- **mintFrom+1 = 00577**

Wave 2 uses both consecutive numbers, per the build sheet. Confirm against the same
`for-each-ref` sweep before applying either migration, in case a sibling program has minted
in the interim.

## Local URLs

- Designer portal: `http://localhost:3000`
- Client portal: `http://localhost:3002`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Supabase Studio: `http://127.0.0.1:54323`

## Flag override syntax (for the walk)

Confirmed against `apps/designer-portal/src/hooks/use-feature-flag.ts`'s `parseFlagOverride`:
comma-separated `name:value` pairs, colon-delimited, each side trimmed, value `true`/`false`
(anything else parses false). Exact syntax to turn both Wave 2 gates on:

```
NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true
```

Set this in the portal's dev env (or inline before `pnpm dev:*`) — it is a
`NEXT_PUBLIC_*` var, inlined at build/dev start, so a running dev server must be restarted
after changing it. Per the program's fail-closed rule: `agreement-library` only renders when
`agreement-parts` is ALSO on — both flags must be present and `true` together for Wave 2 UI to
show. With either flag off (or absent), both portals must render exactly as Wave 1 shipped.

## Service-role key (local-only — for the walk)

**Local Supabase stack only.** Not included inline here — a repo hook blocks committing/writing
JWT-shaped secrets, and this doc lives in the repo tree. Fetch it yourself, on demand, with:

```
supabase status --workdir /Users/kody/Code/patina-merged -o env
```

That prints `SERVICE_ROLE_KEY` and `ANON_KEY` for the current local stack (both are the
default demo-project keys `supabase start` mints — they have no meaning outside this
machine's local instance — but still never paste them into prod config or a committed
`.env`). Keys are stable across stack restarts on this project's `config.toml`; reconfirm
rather than assume if you're unsure.

## Scratch-DB recipe (for lane migration validation)

Each lane validates its own migration(s) against a scratch database — never against the
shared stack at `54322` directly. Recipe (run from any lane's worktree; `psql`/`createdb`/
`dropdb`/`pg_dump` all point at the local Postgres on `54322`):

```bash
# 1. Create a scratch DB seeded from the current shared stack (Wave 1 fully applied):
createdb -h 127.0.0.1 -p 54322 -U postgres patina_w1

# 2. Clone the current shared stack's schema+data into it:
pg_dump -h 127.0.0.1 -p 54322 -U postgres postgres | \
  psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -d patina_w1

# 3. Apply your lane's new migration(s) on top, in order, stopping on first error:
psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -d patina_w1 \
  -f supabase/migrations/00576_<slug>.sql
psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -d patina_w1 \
  -f supabase/migrations/00577_<slug>.sql   # if your lane owns the second number

# 4. Validate (RPCs, RLS, projections, etc.) against patina_w1, not against `postgres`.

# 5. When done, drop it — do not leave scratch DBs lying around on the shared stack:
dropdb -h 127.0.0.1 -p 54322 -U postgres patina_w1
```

Password is `postgres` for the local `postgres` role (matches `DB_URL` above); set `PGPASSWORD`
or pass `-W` as your shell requires.

## Stack ownership

Per `stack-notice.md` in this same directory: **this program (agreement-w2) now owns the
local Supabase stack.** Lanes use scratch DBs per the recipe above and must not reset, stop,
or otherwise mutate the shared stack. The integration steward resets the shared stack (only
after all three lanes land) to apply the merged migrations for integration testing.

## Notes for the next reader

- `git status` was not run destructively; no shared-stack mutation occurred while writing this
  file. All commands against `54322` in this document were read-only (`select ... limit 3`)
  or informational (`supabase status`).
- Program docs under `build/` are gitignored by the repo's `build/` rule. This file and
  `stack-notice.md` are written to disk only, per instruction — the integration steward
  `git add -f`s and commits program docs, not the Wave 2 steward.
