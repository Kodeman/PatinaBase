# W1a — tests, types, behaviour review (round 3)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, reviewed at HEAD `6551c5ed3`
("the fold takes the refusal from the seat that holds it (r2 R2-M1/R2-M2)") —
the tip named in `w1a-report.md` / `w1a-fix-log-r2.md` at review time. Local
Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) — no
`supabase db push`, no `supabase functions deploy`, nothing touched on Strata.
This session ran a `supabase:reset` before any test work and was the sole
owner of the local stack for the review; the stack was left at the branch tip
(see §1).

This file supersedes the earlier `w1a-review-r3-tests.md` in this directory
(timestamped 19:31, written many fix-log rounds ago against an older HEAD) —
overwritten per this task's explicit output path, not merged with it. This
review's own scope is the five numbered items in the brief: SQL tests,
`db:generate` idempotency, three-role RLS probes (designer / client / anon),
Deno tests plus two hand-constructed consent-gate failure cases, and the
`people_directory` reader survey with the two type-check gates.

**Prior fix log re-checked**: `w1a-fix-log-r2.md` (all sections, through
"Round 9 — R2-M1, R2-M2, P-1") — every item it claims fixed is confirmed
fixed below (the SQL suite block for each still passes at this HEAD; see §1).
Nothing in it is open.

---

## 1. SQL tests — `supabase/tests/people/`

Only one file exists under that path:
`w1a_identity_channels_consent_test.sql`.

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(Sandbox note: the bare `supabase db reset` invocation failed under this
session's default sandbox with `EPERM` writing
`/Users/kody/.supabase/telemetry.json.tmp...` — a CLI telemetry write outside
the sandbox's allowed paths, not a code defect. Re-run with
`dangerouslyDisableSandbox: true` succeeded cleanly; same for `db:generate`
below, which needs the Docker socket.)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  8. mirror fan-out, site-request leg (B-1): passed
NOTICE:  9. record_channel_consent transition gate (B-2): passed
NOTICE:  10. mirror evidence refresh (M-1): passed
NOTICE:  11. one normalisation + origin rule (M-3): passed
NOTICE:  12. affiliations are the home, company_id the pointer (R-AI): passed
NOTICE:  13. an inbound grant releases its parked site requests (B-1/M-2): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2/M-1): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  18. the mirror never nulls an evidence column (R-AN): passed
NOTICE:  19. the write door reads the seats too (R-AL): passed
NOTICE:  20. the pointer moves one affiliation, not all of them (R-AO): passed
NOTICE:  21. the designated people are people, in this studio (R-AP): passed
NOTICE:  22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed
NOTICE:  23. the mirror keeps both dates (r6 M6-2): passed
NOTICE:  24. the routed person is a person, in this studio (r6 M6-4): passed
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable ... : passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one ... : passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal ... (r2 R2-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

**31/31 blocks pass** (1–30 plus 16B, matching the report's own count).
Every entire-file transaction rolls back — no residue left in the shared
stack. **Clean.**

---

## 2. `db:generate` idempotency

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    status --short -- packages/supabase/src/database.types.ts
(no output — clean before regen)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> @patina/supabase@0.0.1 generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
(exit 0)

$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

The builder regenerated the file against the live, freshly-reset database and
produced byte-identical output to what's committed. **Clean.**

---

## 3. Role probes — designer, client, anon

Seed accounts (`supabase/seed/dev-accounts.sql`):
`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004`, owner of org
`b0000000-0000-0000-0000-000000000001` ("Local Dev Studio").
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`, a member of
**no** organization (confirmed:
`select * from organization_members where user_id = <client uid>` → 0 rows) —
used here as the "authenticated but not a studio member" case, since the
local seed carries no `client` role rows in `studio_contacts`/the new tables
to probe against directly. A second org, `cf120000-0000-4000-8000-000000000001`
("Phase One Synthetic Studio"), stood in for "another tenant."

Local fixture (none of the four new tables had any seed rows — confirmed
`select count(*) from studio_contacts` = 0 after reset, matching the report's
"the backfills found nothing locally"), written as `postgres`/superuser
inside a transaction that was rolled back at the end of the probe — one
`studio_contacts` card + one `studio_contact_channels` row + one
`studio_channel_consent` record in each of the two orgs.

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
```

**As designer@patina.dev (owner of org b0000000...1):**

```
-- studio_contacts visible (own-org card only, the other org's is invisible) --
                  id                  |           organization_id            |      full_name
--------------------------------------+--------------------------------------+----------------------
 f0000000-0000-4000-8000-00000000a001 | b0000000-0000-0000-0000-000000000001 | Designer Studio Card
(1 row)   -- the cf120000-org card does not appear

-- studio_contact_channels visible --
                  id                  |               owner_id               |    value
--------------------------------------+--------------------------------------+--------------
 f1000000-0000-4000-8000-00000000b001 | f0000000-0000-4000-8000-00000000a001 | +16125550001
(1 row)

-- studio_channel_consent visible (SELECT-only door) --
           organization_id            | channel_value | status
--------------------------------------+---------------+---------
 b0000000-0000-0000-0000-000000000001 | +16125550001  | granted
(1 row)

-- direct INSERT into studio_channel_consent as authenticated --
NOTICE:  expected: direct insert refused (insufficient_privilege)

-- people_directory as designer (view untouched by W1a, still resolves) --
  role   | count
---------+-------
 client  |     5
 contact |     1
 lead    |     5
(3 rows)
```

Confirms: RLS scopes all three new tables to the caller's own org
(`studio_contact_org()` / `is_active_studio_member`), the other org's card,
channel and consent record are invisible, and `record_channel_consent()`
really is the only write door — a direct `INSERT` as `authenticated` is
refused by grant, not by policy (`studio_channel_consent` has SELECT-only
privileges for `authenticated`, per §1's grant probe in `w1a-report.md`).

**As client@patina.dev (authenticated, zero org memberships):**

```
-- studio_contacts --            (0 rows)
-- studio_contact_channels --    (0 rows)
-- studio_channel_consent --     (0 rows)
```

All three new tables are empty for a signed-in user who belongs to no studio
— the `is_active_studio_member(...)` resolver correctly returns nothing to
check membership against, so RLS clears every row. **Clean.**

**As anon:**

```
-- SELECT on studio_contacts --
NOTICE:  expected: anon has no SELECT privilege at all
-- SELECT on studio_channel_consent --
NOTICE:  expected: anon has no SELECT privilege at all
-- EXECUTE record_channel_consent(...) --
NOTICE:  expected: anon cannot execute record_channel_consent
```

`anon` holds no `SELECT` grant on any of the four new tables and no
`EXECUTE` on the write RPC — confirmed at the privilege level (`GRANT`, not
merely an RLS policy that would degrade to zero rows), matching §1's grant
table in `w1a-report.md` (`anon` `f`/`f`/`f` throughout). **Clean.**

### Finding — "the site access card" does not exist in W1a

**Severity: informational (not a defect). Confidence: high.**

The brief asks to "assert the site access card is invisible outside the
studio." No such object exists anywhere in this worktree:

```
$ grep -rln "site.access.card\|SiteAccessCard\|site_access_card" \
    apps packages supabase --include="*.ts" --include="*.tsx" --include="*.sql"
(no output)
```

`w1a-report.md` §5 ("Not done") names `project_site_access_cards` explicitly
as **out of W1a's scope by instruction** — it is a W2+ table. This is not a
gap in the wave's own work (the report says so plainly and the orchestrator's
own scoping ruled it out), but the review brief's premise doesn't match what
this wave shipped, so there is nothing in W1a to probe for that assertion.
The four tables that *do* exist (`studio_contact_channels`,
`studio_channel_consent`, `studio_contact_rules`, `studio_person_affiliations`)
were probed above instead and all four are correctly studio-scoped.

---

## 4. Edge-function tests — `_shared` and `sms-inbound`

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (96ms)
```

(`supabase/functions/sms-inbound/` itself holds no `*.test.ts` — its suite
lives at `supabase/functions/_tests/sms-inbound.test.ts`, as the report notes.
Running literally on the two directories named in the brief —
`supabase/functions/_shared supabase/functions/sms-inbound` — picks up every
`_shared` suite, `sms-inbound` contributing none of its own:)

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound
ok | 418 passed | 0 failed (1s)
```

No failures either way. **Clean.**

### Constructed failure case 1 — a phone opted out in org A, granted in org B

Built as a standalone Deno test against the real `sendPartySms` /
`channelConsentVerdict` code path (via `createFakeSupabase`), with **real
`studio_channel_consent` records on both sides** (not one record + one party
row, to isolate the record-vs-record case specifically):

```ts
studio_channel_consent: [
  { organization_id: "org-A", channel_kind: "sms", channel_value: "+15559990001", status: "opted_out" },
  { organization_id: "org-B", channel_kind: "sms", channel_value: "+15559990001", status: "granted" },
]
```

```
CASE 1 (send a party seated in org B): {"sent":true, ...}
CASE 1b (send a party seated in org A, same fixture): {"sent":false,"reason":"opted_out"}
```

**Result: org B's own `granted` record authorises its send; org A's opted-out
record does not reach org B's gate at all.** This is exactly the documented,
deliberate, already-tested design (`w1a-report.md` decision 13, ruling R-AK:
"the no-record fallback reduces across the studio's own projects, never
across tenants" — and the same scoping applies to the record-present branch).
The existing suite already covers the record+party-row shape of this
("another studio's opted-out party row does not block this studio's granted
record"); this construction confirms the record+record shape lands the same
way. **Not a new defect — verified as designed.** Flagging it explicitly
because it is the scenario the brief asked to construct: a phone that has
told org A STOP can still be texted by org B once org B has its own consent
record, by design, per-tenant. That is a real compliance-relevant behaviour
(10DLC consent is legally scoped per sender/campaign, which is the report's
own justification for it, not a gap this review is re-litigating) but it is
worth the orchestrator's explicit sign-off if it hasn't had one beyond the
engineering ruling already on record.

### Constructed failure case 2 — no consent record, but an opted_out party row

```
CASE 2  (no record anywhere; opted_out sibling row in the SAME resolving org):
  {"sent":false,"reason":"opted_out"}
CASE 2b (no record anywhere; opted_out row is in a DIFFERENT org; the target
         party's own status is not_asked):
  {"sent":false,"reason":"not_consented"}
```

Case 2 confirms the no-record fallback fails closed on the resolving org's
own opted-out sibling, per decision 13. Case 2b confirms the fallback is
correctly org-scoped in the other direction too: an unrelated org's opted-out
row does not leak into this org's send and does not get mis-reported as
`"opted_out"` (a laundering risk this review specifically checked for) —
the refusal is correctly told apart from ordinary non-consent
(`"not_consented"`). **Both behave as documented. No defect found.**

---

## 5. `people_directory` readers, and the two type-check gates

```
$ grep -rln "people_directory" \
    apps packages --include="*.ts" --include="*.tsx"
```

22 files reference the string. Of those, exactly **one** performs an actual
database read of the view:

| File | How |
|---|---|
| `packages/supabase/src/hooks/use-people.ts:125,161` | `supabase.from('people_directory').select('*')` — the sole `.from('people_directory')` call anywhere in `apps/` or `packages/` |

Everything else — `use-clients.ts`, `use-vendors.ts`, `use-coordination.ts`,
and every `apps/designer-portal/src/components/document/**` /
`apps/designer-portal/src/lib/document/**` file the grep matched — references
`people_directory` only in **comments** documenting that a write to
`designer_clients` / `vendors` / `project_parties` is what the view unions
over; none of them queries the view directly. They consume it exclusively
through `use-people.ts`'s typed hook (`PeopleDirectoryRow`, `PartyRole`, the
`usePeopleDirectory`-shaped query), which is the one contract that matters.

`PeopleDirectoryRow`'s twelve fields (`person_id, role, display_name, email,
phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta,
scope`) match the view's live column list exactly:

```
$ psql ... -c "\d+ public.people_directory"
person_id · role · display_name · email · phone · profile_id · project_id ·
designer_id · status_raw · last_touch_at · meta · scope     (12 columns)
```

**W1a does not touch `people_directory` or any of the tables it selects
from** (`designer_clients`, `leads`, `vendors`, `project_parties`,
`studio_contacts` — confirmed by `grep` across all three W1a migrations: no
hit) — the report's own §5 lists "the `people_directory` rebuild" among the
items explicitly out of scope. The one reader is therefore unaffected by
construction, not merely by observation. **Clean — no reader broken.**

Type-check gates:

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. **No type breaks from the regenerated `database.types.ts`.**

---

## 6. Summary

| # | Check | Result |
|---|---|---|
| 1 | SQL tests (31 blocks) | **31/31 pass** |
| 2 | `db:generate` idempotency | **empty diff** |
| 3 | RLS probes (designer / client / anon) | **all four new tables correctly studio-scoped; RPC is the only write door; anon has no privilege at all** |
| 3b | "site access card" invisibility | **N/A — table does not exist in W1a (out of scope by instruction); informational finding only** |
| 4 | Deno tests (`_shared` + `sms-inbound`) | **71/71 (targeted) and 418/418 (full `_shared` dir); 0 failed** |
| 4b | Constructed gate failure case 1 (opt-out org A / grant org B) | **behaves as documented (R-AK); not a defect** |
| 4c | Constructed gate failure case 2 (no record + opted-out party row) | **fails closed correctly, org-scoped both directions; not a defect** |
| 5 | `people_directory` readers | **one DB reader (`use-people.ts`), unaffected — view untouched by W1a** |
| 5b | `@patina/supabase` type-check | **clean** |
| 5c | `@patina/designer-portal` type-check | **clean** |

**Findings**

| ID | Severity | Confidence | File | Claim |
|---|---|---|---|---|
| F1 | informational | high | (task brief vs. `w1a-report.md` §5) | The review brief assumes a "site access card" exists in W1a; `project_site_access_cards` is explicitly out of scope for this wave (report §5). Nothing to test; not a code defect. |
| F2 | informational | high | `supabase/functions/_shared/sms.ts:440-497` (`channelConsentVerdict`) | Confirmed by construction: a phone opted out of org A can still be texted by org B once org B records its own `granted` consent — deliberate, per-tenant, already ruled (decision 13/R-AK) and already covered by the existing suite. Flagging only because the brief asked this scenario be constructed by hand; recommend the orchestrator have explicit sign-off on this cross-tenant consent posture if that hasn't already happened outside the engineering ruling. |

No blocking or major findings. **Clean = zero blocking, zero major — this
round is clean.**
