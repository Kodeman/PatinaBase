# Wave 2 — web walk environment

What a walker needs to stand the client portal up against the **local** stack and reach the
Wave-2 ceremony. Written at integration, 2026-09-05, from
`apps/client-portal/playwright.config.ts` (`webServer.env`) and `supabase/seed/`.

No key is written down here. Every value below is read out of the running stack.

## The three variables the dev server needs

`playwright.config.ts` pins exactly three, and they are the same three a hand-driven
`pnpm dev` needs to talk to the local stack rather than whatever `apps/client-portal/.env.local`
happens to hold:

| Variable | Where the value comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` — the literal in the config, not a secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from `supabase status -o env` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` from `supabase status -o env` |

⚠ `apps/client-portal/.env.local` has pointed at Strata **prod** before. The walk reads and
writes seeded fixtures, so the pin is the point — export the three above into the dev server's
own environment and let them win.

Read the two keys without them ever reaching a file or a transcript:

```
cd /Users/kody/Code/patina-merged
eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p')"
eval "$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Then start the one server the suite expects, on **:3002**:

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration \
  --filter @patina/client-portal dev
```

`SUPABASE_SERVICE_ROLE_KEY` is only read by the middleware's role lookup. Absent, the lookup
reports `unavailable` and lets the request through, so the page still renders — what pinning it
buys is that a *production* service-role key can never reach the local server by way of
`.env.local`.

## The seeded homeowner

`supabase/seed/the-client-page.sql` lays down the solo household the Wave-2 ceremony is built
against. Password for every dev account is `password123`
(`supabase/seed/dev-accounts.sql:19`, bcrypt-hashed at seed time).

| Who | Sign-in | What she holds |
|---|---|---|
| **Nora Ellison** (solo homeowner) | `client-solo@patina.dev` / `password123` | one house, **Cedar Lane Study** — project `b0000000-0000-0000-0000-00000000c0d1` |
| the three-house client | `client@patina.dev` / `password123` | several houses; the mat names the other two |

Land on `/` after sign-in — `CLIENT_AUTH_DESTINATION` is the house itself, and the page is
chrome-less by design (no header at all). The house is also reachable directly at
`/projects/b0000000-0000-0000-0000-00000000c0d1`.

### What the seed put in Nora's house

The figures the ceremony is read against, so a walker can tell a fixture from a bug:

- Authorization No. 1, signed — **$8,120** (the frozen client figure; the studio's live working
  row is $7,800 and must never appear).
- The maker whose finished work waits: **Marta Voss**.
- The draw held back until she accepts: **$2,980**.
- Invoice `INV-2026-0301`, sent and unpaid: balance **$4,060**, due **`CURRENT_DATE + 7`** —
  the day moves with the clock, so read it off the letterbox rather than expecting a fixed date.
- Rooms keyed on the drawing, in seed order: **Study, Hall, Stair**.

### Reaching the Wave-2 acts

- **The wall** (accepting a maker's finished work) stands on the house with the trade scope
  above. Per R1 the act is **unlit until the legal name is typed** — type "Nora Ellison" on the
  signature line and the hold arms. Accepting is **irreversible** and takes the $2,980 held draw
  off the page for every later run: press it only if the walk means to.
- The seed carries **no** project-approval review for either client, so the doorstep's
  ApprovalAsk correctly renders nothing. The wall is the ceremony an e2e or a walk can reach on
  this data; a Stage-2 approval has to be authored from the designer portal first.

## Re-seed before walking

The shared local stack is reset by whoever holds it (see `stack-reset-notice.md`). Before a
walk, replay the ledger and the fixtures from this branch's worktree so 00569 is present:

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/supabase
supabase db reset
```
