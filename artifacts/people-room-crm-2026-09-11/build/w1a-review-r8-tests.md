# W1a review — round 8 — tests, types, behaviour

Branch `build/people-room-crm-2026-09-11`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`. Local
Supabase stack only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
No `supabase db push`, no `supabase functions deploy`, no Strata touched.

**Verdict: CLEAN.** Zero blocking, zero major. Two minor findings, both
documentation/scoping, neither a code defect. Every runnable check — SQL
tests, type regen, RLS/role probes, edge-function tests, gate-logic failure
cases, package + portal type-checks — passed or reproduced the claimed
behaviour with fresh evidence taken at the branch tip (`3ddd0ddc4`).

---

## 0. Prior fix log (r7) re-checked

`w1a-fix-log-r7.md` claimed two MAJOR fixes: **M7-1** (a `granted`-on-`granted`
RPC call silently lowered `refusal_unanswered`) and **M7-2**
(`record_channel_reconsent()` landed on `pending`, a state nothing could move
out of). Both are re-verified FIXED at the branch tip, not merely re-asserted:

- SQL test block 26 (`no studio-side verdict lowers refusal_unanswered`) —
  passed. Block 27 (`reconsent is evidence-only and re-callable`) — passed.
  Both ran fresh in this review's own `psql` invocation (§1), not copied from
  the fix log's transcript.
- Git log confirms the fix commits are on branch tip, and three MORE rounds
  landed after r7 (r8, r9, and a further consent/rule round — commits
  `9efdbeb55`, `6541f1a8e`, `e0df228f9`, `6551c5ed3`, `7376cea54`,
  `7c8eed3bd`, `bc8f4fab8`, `3ddd0ddc4`), each with its own new SQL assertion
  block (29 through 34, plus 30e). All pass (§1).

No regression: M7-1/M7-2's own assertions (blocks 26–27) still pass alongside
every later round's.

---

## 1. SQL tests — `supabase/tests/people/`

Only one file exists under that path:
`w1a_identity_channels_consent_test.sql`.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
```

Exit code: `0`. All 36 `NOTICE` lines read `passed` (grepped for `error|fail`
and got only the false-positive substring "fails closed" inside a passing
notice's own prose — no actual failure or error). Full transcript:

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
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5), and carries
         the rule-only `sms` token so "phone yes, text no" is writable
         (r4 R4-M2): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), a sourceless refusal is never given
         the studio's consent as its words (r6 R6-M1) — nor left standing on the
         sibling seat (r8 R8-M1) — and a mirrored refusal never lends the seat
         the GRANT's recorder, words or date (r9 R5-M2): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the
         refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is — including the
         card a contact rule is filed against (r8 R8-M2, R-AR; r9 R5-M1): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless
         portal refusal never erases the STOP's date or words — on the record or
         on the seats (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and
         the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside
         (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an
         SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Finding T-1 (minor, high confidence) — the report's own block count is stale again

`w1a-report.md:781` says *"31 blocks (1–30 plus 16B)"*. The file at branch tip
carries **36** (adds 30e, 31, 32, 33, 34 — the r4/r6/r8/r9-labelled blocks
above). The report elsewhere admits this exact transcript has gone stale
twice already (`w1a-report.md:547-549, 783-784`: three rounds behind at r9,
a round and a half behind at r2) — it has now happened a third time. No
functional impact: every block, old and new, passes. Fix: re-paste §3's
transcript and block count in `w1a-report.md` from the current branch tip
before this wave is called done, so the next reader doesn't have to
independently recount (as this review did).

---

## 2. `db:generate` / generated-types diff

Correct invocation (env var exported, not prefixed on the same line the
supabase CLI script re-expands it — see the flake note below):

```
$ export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

Empty diff — the committed `database.types.ts` already reflects the live
local schema. Re-ran a second time with the exact invocation given in the
task (`SUPABASE_DB_URL=... pnpm --dir ... db:generate`, prefix form) and it
also produced an empty diff on the second and third tries.

### Finding T-2 (minor, high confidence, non-reproducible) — one `db:generate` run produced a near-empty file; not a wave defect

On the *first* attempt in this session, that same prefix-form command
completed with exit 0 and no printed error, but wrote a **1.4 KB placeholder
file** (`Tables: { [_ in never]: never }` for every schema — no tables, no
functions) over `database.types.ts`, which showed as `37278` lines removed /
`9` inserted in `git diff --stat`. Re-running the identical command
immediately after (twice) reproduced the correct ~37,000-line file with an
empty diff both times, and a further isolated repro attempt (calling
`supabase gen types` directly, outside pnpm) surfaced a *different* failure
mode (`LegacyInvalidGenTypesDatabaseUrlError: "" cannot be parsed as a URL`)
caused by the classic bash prefix-assignment scoping gotcha
(`VAR=x cmd "$VAR"` expands `$VAR` in the *current* shell before the
assignment is exported to `cmd`'s environment) — but that gotcha does not
explain the pnpm case, since pnpm's own process did have the var and forwards
its environment to the script it spawns. I could not reproduce the empty-file
outcome a second time under any invocation. Likely a one-off local
Supabase-CLI/docker-proxy hiccup (old CLI `v2.77.0`; the tool itself nags to
upgrade to `v2.117.0`), not something introduced by this wave's migrations.
Flagged as a minor process/tooling note rather than a build defect, since (a)
it reverted cleanly (`git checkout --`) with zero trace, (b) it did not
reproduce, and (c) the task's own required check — diff empty **after**
regen — passed cleanly on every subsequent run.

---

## 3. Role probes (RLS)

`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004` (per
`supabase/seed/dev-accounts.sql:14,47-51`), owner of two orgs incl.
`b0000000-0000-0000-0000-000000000001` ("Local Dev Studio").
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`
(`dev-accounts.sql:15,54-58`), role `client`, not a member of that studio.

Local `studio_contacts`/`studio_contact_channels`/`studio_contact_rules`/
`studio_channel_consent`/`studio_person_affiliations` were all empty (the
report's own §5 "Not done" notes the backfills found nothing locally — seeds
run before migrations). I inserted a throwaway fixture as `postgres`
(superuser) inside one committed transaction — one person card + one channel
+ one consent record + one rule, all scoped to the designer's own org — probed
it under each role, then deleted every row (verified back to 0 rows in all
five tables afterward — no residue left in the shared local stack).

**As `authenticated` / designer (own studio):**

```
SET request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
 t            | count   →  affiliations 0 · channels 1 · rules 1 · consent 1
 studio_contacts row for "Probe Person R8" visible, organization_id = b0000000-…-0001
```

**As `authenticated` / client (different tenant, `client@patina.dev`):**

```
SET request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';
 affiliations 0 · channels 0 · rules 0 · consent 0 · studio_contacts row: 0 rows
-- direct INSERT into studio_contact_channels as this client:
ERROR:  new row violates row-level security policy for table "studio_contact_channels"
```

**As `anon`:**

```
SET ROLE anon;
ERROR:  permission denied for table studio_person_affiliations
ERROR:  permission denied for table studio_contact_channels
ERROR:  permission denied for table studio_contact_rules
ERROR:  permission denied for table studio_channel_consent
```

`anon` has no GRANT at all on any of the four new tables (fails at the
privilege layer, before RLS is even evaluated) — matches the report's claim
(`w1a-report.md:594` `anon | f | f | f`).

**Write-door probe** (designer, own studio):

```
-- direct INSERT into studio_channel_consent:
ERROR:  permission denied for table studio_channel_consent   -- no INSERT policy, no grant
-- via RPC:
select public.record_channel_consent('b0000000-…-0001','sms','6125550901','granted','verbal','probe rpc write','v1');
→ succeeds, row lands normalised to +16125550901, granted
```

Matches decision 5 and the "RPC is the only write door" probe in
`w1a-report.md:581-597` exactly: `authenticated` has EXECUTE on the RPC but no
direct table privilege at all.

### Finding T-3 (minor, high confidence) — "the site access card" does not exist in this wave; the closest available surface was probed instead

The task asked to "assert the site access card is invisible outside the
studio." No such object exists yet: `project_site_access_cards` is not in the
schema (`information_schema.tables` returns nothing for it), and
`w1a-report.md:1101-1104` explicitly lists it as **out of W1a scope by
instruction** — "named so the next wave does not assume they landed." This is
a task/reality mismatch, not a defect in the build: W1a never claimed to ship
a site-access card. In its place I probed the actual new studio-scoped
surfaces this wave DID ship — the four new tables above — for the same
property (invisible to a client account and to anon, visible only to a studio
member), and it holds. Recommend the orchestrator route the literal
"site access card" assertion to whichever wave builds
`project_site_access_cards`.

---

## 4. Edge-function tests

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
ok | 420 passed | 0 failed (1s)
```

`supabase/functions/sms-inbound` holds no `*.test.ts` of its own (matches
`w1a-report.md:880-882`) — literal
`deno test --config … supabase/functions/sms-inbound` reports "No test
modules found" (reproduced). The suite lives at
`supabase/functions/_tests/sms-inbound.test.ts`:

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 40 passed | 0 failed (26ms)
```

(Report said 35 at its last take; 40 now — five more assertions landed in the
r8/r9 rounds, consistent with the extra SQL blocks above. All pass.)

`deno check` on the two edited files, clean:

```
$ deno check --config supabase/functions/deno.json supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

### Gate-logic failure cases, constructed and confirmed

Read `channelConsentVerdict()` (`_shared/sms.ts:440-523`) and
`orgHasOptedOutParty()` (`_shared/sms.ts:355-381`) directly, then located
(and re-ran in isolation) the existing tests that are exactly these two
adversarial cases — not new tests, but independently verified as covering
the requested scenarios by reading the gate first and matching it to the
fixture:

**Case 1 — a phone opted out in org A, granted in org B.** The gate resolves
one org per send (`resolveProjectOrg`/`orgsOfProjects`, `sms.ts:276-341`) and
every downstream read — the `studio_channel_consent` lookup
(`sms.ts:460-466`) and `orgHasOptedOutParty`'s own project→org join
(`sms.ts:374-380`) — is filtered to that one org. Org A's row is never read
when resolving org B's send.

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts \
    --filter "another studio's opt-out does not block this studio's send"
ok | 1 passed  (sms.test.ts:548 — org-alpha granted, org-beta opted_out, same number → Alpha sends)

$ deno test … --filter "another studio's opted-out party row does not block this studio's granted record"
ok | 1 passed  (sms.test.ts:977 — org-alpha granted RECORD + org-beta OPTED_OUT PARTY ROW, same number → Alpha sends, G-3 does not reopen)
```

**Case 2 — a phone with no consent record, but an opted_out party row.** With
no `studio_channel_consent` row for the resolving org, the gate falls back to
`orgHasOptedOutParty` scoped to THAT org only (`sms.ts:498-500`): a same-org
opted-out party row still refuses (fail-closed, R-AK); a different-org
opted-out party row on the same number does not.

```
$ deno test … --filter "SAME studio still blocks"
ok | 1 passed  (sms.test.ts:576 — no record, opted_out sibling row in the SAME org → refuse, reason=opted_out)

$ deno test … --filter "ANOTHER studio's opted-out party row does not block"
ok | 1 passed  (sms.test.ts:600 — no record, opted_out sibling row in a DIFFERENT org → allow/unknown, send proceeds)
```

All four cited tests re-run individually and pass, confirming the gate does
NOT let org A's refusal silence org B (no cross-tenant bleed either
direction), and DOES fail closed on an un-backfilled but same-studio refusal.
No finding — behaviour matches the report's claims (decisions 10, 13 §"r2
B-3", R-AK) exactly.

---

## 5. `people_directory` readers and type-check

### Finding T-4 (minor, high confidence) — "the new view" does not exist; `people_directory` is untouched by W1a

The task asked whether "the new view" (implying W1a rebuilt
`people_directory`) still satisfies its readers. It does not need to: W1a
never touched `people_directory`. `w1a-report.md:1104` lists "the
`people_directory` rebuild" as explicitly **out of scope** for this wave —
confirmed by `git log`/`git diff` showing no migration in 00592-00594 touches
that view, and its column list is unchanged. The view itself does still exist
(pre-existing, from migrations 00221/00281/00420/00583) and is read by:

| Reader | File | How |
|---|---|---|
| `usePeople` / `usePerson` hooks | `packages/supabase/src/hooks/use-people.ts:125,161` | `supabase.from('people_directory').select('*')` — the only two direct query call sites in the whole tree |
| Generated types | `packages/supabase/src/database.types.ts:28539` | `Views.people_directory` type definition |
| Vendor admission comments/logic | `packages/supabase/src/hooks/use-vendors.ts:350,406` | describes admission semantics, no direct query |
| Coordination / client hooks | `packages/supabase/src/hooks/use-coordination.ts:454,789`, `use-clients.ts:411` | comments only, reads flow through `use-people.ts` |
| Designer portal — Document/People UI | `apps/designer-portal/src/components/document/{desk-reconnect,brief-section,household-sheet}.tsx`, `roster/{roster-row,call-sheet-mount}.tsx` (+tests), `people/{person-bits,party-profile-sheet,outreach/audience-rules}.tsx`, `people/views/directory-view.tsx`, `people/directory/makers-marketplace.tsx`, `people/profile/maker-profile.tsx` | consume via the hooks above / hand-authored `PersonRow`/`PartyRow` shapes in `people-derivation.ts:27`, `roster-derivation.ts:173`, `desk-derivation.ts:289` — none query the table directly |
| Patina Field (iOS, Swift) | `apps/mobile/Capture/Capture/Features/Leads/{SupabaseLeadsService,LeadFormat}.swift` | comments only — mirrors the view's COALESCE chain in Swift, does not query `people_directory` by name (goes through its own PostgREST calls) |

Since the view is byte-for-byte unchanged, every one of these readers is
trivially still satisfied — there is nothing for them to break against.
Because both direct call sites use `select('*')`, they would not even notice
an additive column change if one had happened. Recommend re-running this same
grep once the actual `people_directory` rebuild wave lands, since that is
when this list becomes load-bearing.

### Type-checks (regenerated types are checked-in; empty diff per §2)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean — no output, exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean — no output, exit 0)
```

No type errors anywhere in either package — the regenerated
`database.types.ts` (empty diff from committed) introduces no breaks, and
none of the `people_directory` readers above are affected since that view
was never touched.

---

## 6. Summary of findings

| ID | Severity | Confidence | File | Claim |
|---|---|---|---|---|
| T-1 | minor | high | `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:781` | SQL-test block count/transcript is stale again (says 31, file has 36) — doc-only, all blocks pass |
| T-2 | minor | high (non-reproducible) | tooling / local Supabase CLI v2.77.0 | one `db:generate` run silently wrote a near-empty types file; did not reproduce on 2 further attempts; task's required empty-diff-after-regen check passes |
| T-3 | minor | high | task scope vs. `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:1101-1104` | "the site access card" (`project_site_access_cards`) does not exist yet — explicitly out of W1a scope; probed the four actual new tables instead, which correctly isolate by studio |
| T-4 | minor | high | task scope vs. `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:1104` | "the new view" (`people_directory` rebuild) does not exist yet — explicitly out of W1a scope; the existing view is untouched, so all six reader groups above are trivially unaffected |

**No blocking or major findings.** Every prior blocking/major finding (r7's
M7-1, M7-2, and everything before it back through r1) remains fixed at branch
tip, re-verified with fresh command output rather than trusted from the log.
