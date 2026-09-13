# W1a — round 4 review: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `e0df228f9` ("a contact rule is
filed under the noun its subject actually is (r8 F1)"). Reviewed against
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` and
`w1a-fix-log-r3.md`. Local Supabase only — no `supabase db push`, no
`supabase functions deploy`, no Strata contact, at any point in this review.

**Verdict: CLEAN. Zero blocking, zero major.** Two informational
(process/environment) notes below, neither a defect in the reviewed diff.

---

## 0. Incident during this review — shared local stack was reset by another process

Between step 2 (db:generate) and step 3 (role probes) the shared local
Supabase Postgres container restarted on its own and came back at migration
tip `00292` — three-hundred migrations behind this worktree's `00594` +
`20260910152111`. `docker ps` showed `supabase_db_supabase` with
`Up 2 seconds` at the moment I first noticed. This means some other process on
this machine ran a reset/checkout against the shared `127.0.0.1:54322` stack
while this session was supposed to be its sole owner (per the task brief).

I restored the stack with `pnpm supabase:reset` from this worktree
(transcript in §1) and re-ran the full SQL suite to confirm nothing was lost;
it re-passed clean (§1). Everything reported below step 3 onward was taken
**after** this recovery, against a verified-correct DB state. This is not a
finding against the w1a diff — it's a process/environment hazard (matches the
project's own `feedback_shared_checkout_*` memory entries) and is reported so
the orchestrator knows the stack was momentarily not exclusive to this wave.

## 1. SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
```

Run twice (before and after the stack-reset incident in §0); identical result
both times, 31 blocks, all passed, clean `ROLLBACK`, exit 0:

```
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
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's own
         evidence standing (r8 W4-M2), the seat carries the refusal's own words too (r9
         R5-M1), and a sourceless refusal is never given the studio's consent as its words
         (r6 R6-M1) — nor left standing on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the refusal keeps
         the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless portal refusal
         never erases the STOP's date or words — on the record or on the seats (r2 R2-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Recovery transcript for §0 (`pnpm supabase:reset`, tail):

```
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[...29 seed files...]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Confirmed migration tip after recovery: `20260910152111`, `00594`, `00593`
(`supabase_migrations.schema_migrations`, descending).

**Finding: none.** All 31 blocks pass, matching the report's own transcript
verbatim.

---

## 2. `db:generate` / generated-types drift

```
$ git status --short packages/supabase/src/database.types.ts
(empty)
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

(First attempt failed with `permission denied … docker.sock` — a sandbox
restriction on this review session, not a repo issue; re-run with the sandbox
disabled succeeded.)

**Finding: none.** The committed file is exactly what a fresh regen produces —
the builder did in fact regenerate types after the schema changes, and nothing
has drifted since.

---

## 3. Role probes (RLS) — designer, client, anon

Seed data has zero rows in all four new tables today
(`studio_contact_channels` / `studio_channel_consent` /
`studio_person_affiliations` / `studio_contact_rules` are all empty after
`supabase:reset`, and so is `studio_contacts` — matches the report's own §5
note that "the backfills found nothing locally"). I built a one-transaction,
rolled-back fixture (one person card + one company card + one channel + one
consent record + one affiliation + one rule, all in
`b0000000-0000-0000-0000-000000000001` "Local Dev Studio", the studio
`designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`) owns) and probed
it as three roles. Full script:
`/private/tmp/.../scratchpad/probe_rls_roles.sql` (not part of the repo; ROLLBACK
at the end, nothing committed).

**As the designer** (`SET LOCAL ROLE authenticated` + `request.jwt.claims` for
`a0000000-0000-0000-0000-000000000004`, a studio member):

```
 designer sees studio_contacts | 2
 designer sees channels        | 1
 designer sees consent         | 1
 designer sees affiliations    | 1
 designer sees rules           | 1
OK: authenticated direct INSERT on studio_channel_consent refused (42501)
```

**As the client** (`client@patina.dev`, `a0000000-0000-0000-0000-000000000005`
— confirmed via `organization_members` to hold **zero** memberships, i.e. not
in this studio):

```
 client sees studio_contacts    | 0
 client sees channels           | 0
 client sees consent            | 0
 client sees affiliations       | 0
 client sees rules              | 0
```

**As anon:**

```
anon: insufficient_privilege on studio_contacts (no table grant at all)
anon: insufficient_privilege on studio_contact_channels (no table grant at all)
OK: anon has no SELECT privilege on studio_channel_consent
anon: insufficient_privilege on studio_person_affiliations (no table grant at all)
anon: insufficient_privilege on studio_contact_rules (no table grant at all)
```

All five outcomes match the report's claims exactly: RLS scopes every new
table to studio co-members, a same-studio card is fully invisible to a
non-member account, anon has no read access anywhere, and
`studio_channel_consent`'s only write door is the RPC (a direct `authenticated`
INSERT is refused with `42501`, matching decision 5 / the report's "RPC is the
only write door" probe).

**"Site access card" probe — not applicable to W1a.**

```
$ psql … -Atc "select to_regclass('public.project_site_access_cards'), \
    to_regclass('public.v_access_grants')"
(both empty — neither object exists)
```

`project_site_access_cards` and `v_access_grants` are both explicitly listed
in the report's §5 "Out of W1a scope by instruction" — this wave does not ship
them. The task brief's "assert the site access card is invisible outside the
studio" step therefore has nothing to probe against in this wave; I'm flagging
it as informational rather than fabricating a result. (If this instruction is
a template shared across multiple waves, the site-access-card leg belongs to
whichever wave does ship `project_site_access_cards`.)

**Finding: none** on what W1a actually ships. Informational note on the
site-access-card step above.

---

## 4. Edge-function tests + the two constructed failure cases

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/
ok | 418 passed | 0 failed (1s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/sms-inbound
error: No test modules found
```

The second result is expected, not a bug: `supabase/functions/sms-inbound/`
holds no `*.test.ts` of its own — its suite lives at
`supabase/functions/_tests/sms-inbound.test.ts` (report §3 notes this exact
gotcha). Running the real path:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts
ok | 35 passed | 0 failed (25ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 694 passed | 1 failed (2s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

`stripe-rail.test.ts`'s failure is pre-existing and unrelated (it needs
`_tests/test.env`, which a bare `deno test` invocation does not load) —
confirmed against the report's own identical count (694 passed / 1 failed).

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

### Gate logic read + independently constructed failure cases

Read `channelConsentVerdict()` (`supabase/functions/_shared/sms.ts:440-505`)
and `orgHasOptedOutParty()` (`:355-381`). Rather than only trusting the
existing suite, I wrote a standalone probe file exercising the exported
`sendPartySms()` (which calls `channelConsentVerdict()` internally) against
the fake-supabase harness, for the two scenarios named in the brief:

**Case 1 — a phone opted out in org A but granted in org B** (two
`studio_channel_consent` rows, same `channel_value`, different
`organization_id`):

```
PROBE 1a: phone opted_out in org A -> org A send refuses ... ok
PROBE 1b: SAME phone granted in org B -> org B send allows ... ok
```

**Case 2 — a phone with no consent record at all, but an opted_out
`project_parties` row**:

```
PROBE 2: no consent record, opted_out party row in same studio -> refuse ... ok
PROBE 2 control: no consent record, opted_out party row in ANOTHER studio -> allow ... ok
```

```
ok | 4 passed | 0 failed (23ms)
```

**Finding: none.** Both failure cases behave correctly: the gate is
per-(studio, channel_value) — a refusal recorded by org A does not touch org
B's independent grant on the same number, and vice versa (multi-tenant
isolation on the record side); and the fail-closed fallback for a
not-yet-backfilled pair is scoped to the resolving studio's own
`project_parties` rows, never phone-globally, per decision 13 / R-AK — the
negative control (case-2 sibling in a *different* studio) correctly does
**not** block. This matches every claim in report decision 13 and the r3
fix-log's F3 section, independently re-verified rather than taken on faith.

Probe file:
`/private/tmp/.../scratchpad/probe_gate_cases.test.ts` (scratch-only, not part
of the repo).

---

## 5. Readers of `people_directory` columns — type-check

`people_directory` is a **pre-existing view** (unrelated migration lineage,
00221/00281), not touched by W1a. Confirmed by definition dump
(`pg_get_viewdef`) and by diff scope:

```
$ git diff --stat 700261663 -- apps/designer-portal/src apps/client-portal/src \
    apps/admin-portal/src packages/supabase/src
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 1 file changed, 508 insertions(+)
```

W1a touches **zero** files under `apps/` or the rest of `packages/supabase/src`
— the only change anywhere a portal could see is the additive,
zero-deletion regen of `database.types.ts` (§2). The report's own §5 confirms
this ("No portal hook or UI. `packages/supabase` gained only the regenerated
`database.types.ts`").

Readers of `people_directory` (`grep -rl "people_directory" apps packages
--include="*.ts" --include="*.tsx"`), narrowed to the actual query call
(`.from('people_directory')`):

| File | What it does |
|---|---|
| `packages/supabase/src/hooks/use-people.ts:125` | `supabase.from('people_directory').select('*')` — the list query |
| `packages/supabase/src/hooks/use-people.ts:161` | same view, filtered `.eq('person_id', personId)` — the single-record query |

(`use-vendors.ts`, `use-clients.ts`, `use-coordination.ts`, and the
`apps/designer-portal/src/components/document/**` / `lib/document/**` files
listed by the broader grep only reference the view in **comments**, or
consume `use-people.ts`'s hook output rather than querying the view
themselves.)

Both queries `select('*')`, so their TS shape comes from
`Database['public']['Views']['people_directory']['Row']` in
`database.types.ts`. Since the view's own SQL is unchanged and the generated
types for it are unchanged (the whole diff is additive, §2), there is nothing
for these readers to drift against.

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/supabase type-check
> tsc --noEmit
(clean, exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, exit 0)
```

**Finding: none.** No reader of `people_directory` is affected, no
regenerated-type breakage anywhere in `@patina/supabase` or
`@patina/designer-portal` (the two workspaces that actually consume it).

---

## 6. Prior fix log (`w1a-fix-log-r3.md`) — re-checked

| Finding | Status |
|---|---|
| M3-1 / R-AG (`not_asked` erased a grant + evidence) | **Still fixed.** SQL block 9 (via the RAG-specific assertions folded into block 9/14) and block 26/27 exercise this; `not_asked` refused as a target status, evidence never emptied by a restated field. |
| M3-2 / R-AH (deferred-send path never read the studio record) | **Still fixed.** `flush: the studio's granted record carries a deferred send…` / `…opted-out record suppresses…` both pass (§4). |
| M3-3 / R-AI (two homes for person-at-firm) | **Still fixed.** SQL block 12, all six sub-cases, passes. |
| M3-4 / R-AJ (START manufactured consent for a studio that never asked) | **Still fixed.** `_tests/sms-inbound.test.ts`'s three START-target tests pass (§4, 35/35). |
| F3 / R-AK (no-record fallback reduced across tenants) | **Still fixed, independently re-verified** — see §4's Case 2 / Case 2 control, constructed fresh rather than re-running the shipped test. |

No regression found in any of the five. The branch has moved substantially
past r3 (through r9, per the report's decision log) with further fixes
layered on top (evidence-set separation, the R-AR identity-hold guard, the
r8 F1 rule-subject-kind fix) — all still green in the current suite.

---

## 7. Summary

| Area | Result |
|---|---|
| SQL tests (31 blocks) | pass, both before and after the mid-review stack incident |
| `db:generate` drift | none — empty diff |
| RLS: designer (member) | sees all 5 fixture rows across the 4 new tables |
| RLS: client (non-member) | sees 0 rows across all 4 tables |
| RLS: anon | no privilege on any of the 4 new tables or `studio_contacts` |
| Write door | direct `authenticated` INSERT on `studio_channel_consent` refused (42501) |
| "site access card" probe | N/A — table not shipped by W1a (out of scope by instruction) |
| Edge tests: `_shared/` | 418/418 |
| Edge tests: `sms-inbound` (real path) | 35/35 |
| Edge tests: full tree | 694 passed / 1 pre-existing unrelated failure |
| `deno check` (2 edited files) | clean |
| Constructed failure case 1 (cross-org opted_out vs granted) | correct isolation, both directions |
| Constructed failure case 2 (no record + opted_out sibling) | correct fail-closed, correct same-studio scoping |
| `people_directory` readers | unaffected (view untouched, zero portal files touched) |
| `@patina/supabase` type-check | clean |
| `@patina/designer-portal` type-check | clean |
| Prior r3 fix-log findings | all 5 still fixed, no regression |

**No blocking or major findings.** One process/environment note (§0: the
shared local stack was reset by something else mid-review and had to be
recovered) and one scope note (§3: the site-access-card probe step has no
target in this wave). Neither is a defect in the w1a diff.
