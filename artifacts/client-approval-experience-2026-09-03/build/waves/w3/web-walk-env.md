# Wave 3 — web walk environment

What a walker needs to stand the client portal up against the **local** stack and reach the
Wave-3 habit: the record she can keep, the successor read as one thread, and the pace she sets.
Written at integration, 2026-09-05, from `apps/client-portal/playwright.config.ts`
(`webServer.env`), `supabase/seed/`, and the three lane notes in this directory.

No key is written down here. Every value below is read out of the running stack.

## The three variables the dev server needs

Same three Wave 2 pinned, and the pin is still the point.

| Variable | Where the value comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` — the literal in the config, not a secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from `supabase status -o env` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` from `supabase status -o env` |

⚠ `apps/client-portal/.env.local` has pointed at Strata **prod** before. The walk reads and
writes seeded fixtures — export the three below into the dev server's own environment and let
them win.

```
cd /Users/kody/Code/patina-merged
eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p')"
eval "$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Then start the one server the suite expects, on **:3002**, from the integration worktree:

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration \
  --filter @patina/client-portal dev
```

## The state of the stack behind it

The shared local stack was reset by this lane from the integration branch's tree. The ledger
tops out at **00573**, over main's 00571 — so both Wave 3 migrations are live locally and both
new acts (the snooze RPC, the widened cadence column) answer rather than refuse.

Confirmed by `select version from supabase_migrations.schema_migrations order by version desc`:
`00573, 00572, 00571, 00569, 00568`.

## The seeded homeowner — unchanged from Wave 2

Password for every dev account is `password123` (`supabase/seed/dev-accounts.sql:19`).

| Who | Sign-in | What she holds |
|---|---|---|
| **Nora Ellison** (solo homeowner) | `client-solo@patina.dev` / `password123` | one house, **Cedar Lane Study** — project `b0000000-0000-0000-0000-00000000c0d1` |
| the three-house client | `client@patina.dev` / `password123` | several houses; the mat names the other two |

Land on `/` after sign-in. The page is chrome-less by design. The house is also reachable at
`/projects/b0000000-0000-0000-0000-00000000c0d1`.

Figures the ceremony is read against, so a walker can tell a fixture from a bug: Authorization
No. 1 signed at **$8,120**; the maker **Marta Voss**; the draw held back **$2,980**; invoice
`INV-2026-0301`, balance **$4,060**, due **`CURRENT_DATE + 7`**; rooms **Study, Hall, Stair**.

⚠ **`CURRENT_DATE` is the DB's, and the DB runs UTC.** Late in a Central evening the letterbox
names tomorrow-plus-seven while a local clock says today-plus-seven. Read the day off the
letterbox, never off your own wrist. (This is what turns `threshold.spec.ts:158` red after
local 7pm; see the wave report.)

## Reaching the three Wave-3 acts

### P-26 — the record she can keep

Two new addresses, both signed-in only, neither retired and neither public:

- `/decisions/<approvalId>/record`
- `/proposals/<proposalId>/record`

A stranger's read carries nothing and the sheet says "This record could not be found." without
revealing whether the id exists. On the seed there is **no** project-approval review for either
client, so the approval record has nothing to show until a Stage-2 approval is authored from the
designer portal first. The **proposal** record is reachable on the seeded paper today.

### P-27 — the successor as one thread

Needs a superseded approval and its successor — two editions, the first one *answered*. The seed
carries neither, so this act is walked only after authoring both from the designer portal. What
to look for once you have them: the continuation line ("Edition 4 replaces the edition you
returned on August 12."), the "What changed since your last answer" block, and **exactly one**
forward act — never a link back. The words *undone, reopened, reversed, void* must not appear.

The fold also opens itself: address `#approval-<id>` for a record beyond the third one in the
pile and the fold should open and scroll to it rather than leaving you at the top.

### P-28 — the pace she sets

**Cadence** lives in the details sheet (the papers sheet laid in the page, not a route). Three
options in her words: *Tell me right away* · *Once a day* · *Once a week, on Sunday*. The
column's own tokens (`right_away` / `daily` / `weekly_sunday`) must never reach the page. The
quiet-hours line reads as a fact about Patina, not a setting: "Patina never sends approval mail
before 8am or after 8pm, or on Sunday."

**Snooze** sits under the ask on an approval that is genuinely waiting on her: *Remind me —
Tomorrow morning · Sunday · When it's due · Don't remind me*, with "Still yours to answer; only
the reminders wait." underneath. On a **past-due** approval the acts are replaced by "This one
is past its date, so its notice stands." The word *overdue* must appear nowhere.

⚠ Carried advisory to watch for on the walk (**iose R3-M1**, and it reads the same on web):
"Don't remind me" answers "I won't remind you again until it's past its date." Nothing
implements an end condition beyond the overdue notice. It errs quiet, not loud.

## Re-seed before walking

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/supabase
supabase db reset
```
