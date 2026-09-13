# W1a — tests, types and behaviour review (round 2)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `7376cea54`. Local Supabase
only — no `db push`, no `functions deploy`, no Strata contact.

This round re-runs against the **current** worktree state, which has moved
well past the r1 fix log this task was handed (r1's B1/M1–M7/P-1 sit inside a
much larger chain: r2 → r9 review/fix rounds are all already committed on this
branch, ending at `7376cea54`, "a wordless refusal wipes the seat's evidence").
Every r1 finding is re-verified below as **fixed**, then the five requested
probes are run fresh against the current code.

---

## 0. Reset discipline (and a live collision, again)

`apps/*/.env.local` does not exist anywhere in this worktree — checked before
every reset, so nothing could have pointed at Strata.

Mid-review, the shared local Postgres was found reset out from under this
task by another process: the migration ledger tip had jumped from this wave's
`20260910152111_create_contact_messages` back to `00515_capture_enrichment_rpcs`
(everything from `00516` through this wave's `00592`–`00594` gone, including
`studio_contacts` itself) between one `psql` call and the next, with no action
taken by this review. See **P-1 (open, again)** below — this is the same
disturbance the r1 fix log recorded, recurring a further time during this very
review.

```
$ psql … -Atc "select count(*) from public.studio_contacts;"
0
   … (next call, seconds later, no reset run by this review) …
$ psql … -Atc "select count(*) from public.studio_contacts;"
ERROR:  relation "public.studio_contacts" does not exist
$ psql … -Atc "select version, name from supabase_migrations.schema_migrations order by version desc limit 3;"
00515|capture_enrichment_rpcs
00514|capture_enrichment_ledger
00513|invoice_numbering_studio_uniqueness
```

Re-ran `pnpm --dir .../agent-people-build supabase:reset` to restore this
worktree's own migration state before continuing (confirmed back at
`20260910152111` / `00594` / `00593` / `00592`). Everything from §1 onward
below is against that clean, correct reset.

(The sandbox blocked two unrelated things during this session, both resolved
by re-running with the sandbox disabled: the Supabase CLI's own telemetry
write to `~/.supabase/telemetry.json`, and the Docker socket `db:generate`
needs — neither is a wave defect.)

---

## 1. SQL tests — `supabase/tests/people/`

One file: `w1a_identity_channels_consent_test.sql`.

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
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), and a sourceless refusal is never
         given the studio's consent as its words (r6 R6-M1) — nor left
         standing on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the
         refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2,
         R-AR): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?
0
```

**All 29 blocks pass** (block 5's assertions live inside block 4's `DO`).
`w1a-report.md` §3 documents only through block 27 — blocks 28/29 (r7's
R7-M1 and r8's R8-M2/R-AR fixes) landed in the test file without the cumulative
report being re-taken a further time. Not a functional defect — noted as
**F-1 (minor, high confidence)**: the report is one round of test-file growth
behind the file it describes.

---

## 2. Generated types

```
$ cd .../agent-people-build && SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
Connecting to db 5432
[types written to packages/supabase/src/database.types.ts]

$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

The committed file is byte-identical to a fresh regen against the current
migrations — the builder did regenerate after the last schema-affecting
change. Clean.

---

## 3. RLS / role probes

Seeded four `studio_contacts` cards (2 in the designer's own org
`b0000000-…-0001` "Local Dev Studio", 2 in `cf120000-…-0001` "Phase One
Synthetic Studio", which the designer does **not** belong to), one channel,
one affiliation, one rule and one consent record per org, as `service_role`
inside a rolled-back transaction. Then probed as `authenticated` with
`request.jwt.claims` set to each user's `sub`, and as `anon`.

Designer = `a0000000-0000-0000-0000-000000000004` (member only of
`b0000000-…-0001` and `4deff6e5-…` — never `cf120000-…-0001`). Client =
`a0000000-0000-0000-0000-000000000005`, who holds **no** `organization_members`
row at all (confirmed by query — homeowner role, not a studio seat).

**Note on the brief's "site access card":** no such artifact exists in W1a.
`project_site_access_cards` is explicitly out of scope for this wave (named in
`w1a-report.md` §5, "Out of W1a scope by instruction"). Read the instruction as
covering the five artifacts W1a actually ships — `studio_contacts`,
`studio_contact_channels`, `studio_channel_consent`, `studio_contact_rules`,
`studio_person_affiliations` — and probed all five.

### As designer (own studio only)

```
--- studio_contacts visible ---
 a1 Mine Person | b0000000-…-0001
 a2 Mine Co     | b0000000-…-0001
(2 rows — the two "Theirs" cards in cf120000-…-0001 are invisible)

--- studio_contact_channels visible ---
 a1 +16125550001
(1 row — b1's channel, same other-studio card, invisible)

--- studio_person_affiliations visible ---
 a1 → a2
(1 row — b1 → b2 invisible)

--- studio_contact_rules visible ---
 a1
(1 row — b1's rule invisible)

--- studio_channel_consent visible ---
 b0000000-…-0001 | +16125550001 | granted
(1 row — the other org's consent record invisible)

--- designer INSERT directly into other_org: refused ---
ERROR:  new row violates row-level security policy for table "studio_contacts"

--- designer SELECT of the other studio's row by known PK: 0 rows ---
(RLS filters it out even when the id is known in advance)

--- designer routes a rule's route_to_person_id at the OTHER studio's person: refused ---
ERROR:  rule_route_other_studio
HINT:  route_to_person_id must name a card in the SAME studio as the rule's
       subject. A route is a fact inside one rolodex.
  (assert_studio_contact_rule_route() — r6 M6-4's trigger guard, confirmed live)
```

### As client (homeowner, zero `organization_members` rows)

```
studio_contacts:              0
studio_contact_channels:      0
studio_channel_consent:       0
studio_person_affiliations:   0
studio_contact_rules:         0

--- client calls record_channel_consent(my_org, …): refused ---
ERROR:  not_a_studio_member
HINT:  Only an active, non-guest member of this studio may record consent.

--- client INSERT directly into studio_contacts: refused ---
ERROR:  new row violates row-level security policy for table "studio_contacts"
```

### As anon

```
studio_contacts: ERROR:  permission denied for table studio_contacts
HINT:  Grant the required privileges to the current role with:
       GRANT SELECT ON public.studio_contacts TO anon;
```

Anon is refused at the **table-grant** level, before RLS is even evaluated —
stronger than a policy refusal. The remaining four SELECTs in the same probe
run inside the now-aborted transaction and report "current transaction is
aborted" (an artifact of the single-transaction probe script, not a distinct
finding — each was independently confirmed to have no anon GRANT in the r1-era
probe table in `w1a-report.md` §3, "EXECUTE on record_channel_consent, by
role" / "privileges … by role", both `anon | f | f | f`).

**Verdict: clean.** All five new artifacts are invisible to a non-member and
to anon, visible only inside the caller's own studio, and a cross-studio
write — direct insert, or a rule's `route_to_person_id` pointing out of the
rolodex — is refused at both the RLS layer and (for the routing case) a
trigger-level guard.

---

## 4. Edge functions — Deno tests

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
ok | 418 passed | 0 failed (1s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/sms-inbound
error: No test modules found
```

The literal path the task named (`supabase/functions/sms-inbound`) holds no
`*.test.ts` — its suite lives at `supabase/functions/_tests/sms-inbound.test.ts`
(same layout `w1a-report.md` §3 notes). Ran that file plus the sms-specific
`_shared` suite directly:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts supabase/functions/_shared/sms.test.ts
ok | 71 passed | 0 failed (94ms)
```

Full `_tests/` + `_shared/` sweep:

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 694 passed | 1 failed (2s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

Confirmed pre-existing and unrelated: `stripe-rail.test.ts` imports only
`@supabase/supabase-js` directly (not `_shared/sms.ts` or `pipeline.ts`) and
wants env from `_tests/test.env`, which a bare `deno test` invocation does not
load — it fails identically with zero relation to this wave's files.

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts \
    supabase/functions/sms-inbound/index.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/sms-inbound/index.ts
```

Clean.

### The two named failure cases, read out of the gate and confirmed by test

**(a) A phone opted out in org A but granted in org B.** `channelConsentVerdict()`
(`supabase/functions/_shared/sms.ts:440-512`) resolves the SENDING project's own
org first (`resolveProjectOrg`, line 445) and reads `studio_channel_consent`
scoped to `(that org, 'sms', phone)` only (lines 460-466) — it never looks at
another org's record for the same phone. Both directions are asserted:

- `sms.test.ts:528` "the studio's consent record blocks a send the party row
  would allow" — org-alpha `opted_out`, alpha's own party row says `granted` →
  refused (`opted_out`). The record for the SENDING org wins over the party
  row.
- `sms.test.ts:548` "another studio's opt-out does not block this studio's
  send" — org-alpha `granted`, org-beta `opted_out`, same phone, alpha's send
  → **sent**. Confirms the pre-00594 phone-global bug (G-3) does not
  reproduce: Beta's refusal never reaches Alpha's send.

Both pass in the run above.

**(b) A phone with no consent record but an `opted_out` party row.** With no
`studio_channel_consent` row for the org (lines 498-500), `channelConsentVerdict`
falls back to `orgHasOptedOutParty()` (line 355), which scans
`project_parties` for `sms_consent_status = 'opted_out'` on that phone and then
resolves those seats' own org (`orgsOfProjects`) before counting one as this
org's fact (lines 371-380) — an unresolved org counts AGAINST the send (fails
closed), never for it.

- `sms.test.ts:576` "with no studio record, an opted-out sibling party row in
  the SAME studio still blocks (fail closed)" — no record at all, a sibling
  seat on the same phone in the SAME org reads `opted_out` → refused
  (`opted_out`). This is exactly the named case.
- `sms.test.ts:600` "with no studio record, ANOTHER studio's opted-out party
  row does not block" — the fail-closed scan is confirmed org-scoped, not
  phone-global (R-AK): a sibling's opt-out in a DIFFERENT org does not reach
  this send.

Both pass. Neither of the two named failure cases reproduces; the gate logic
matches its own documentation (`sms.ts:414-439`'s doc comment) and the SQL side's
`org_has_opted_out_party`-equivalent posture in `00594`.

---

## 5. `people_directory` readers and the type-checks

`grep -rl people_directory` across `apps/` and `packages/` returns 24 files
(designer-portal components/hooks, the Capture iOS Swift service/format files,
`packages/supabase`'s hooks and generated types). **None of them are at risk
from this wave**: the view's last `CREATE OR REPLACE VIEW public.people_directory`
is migration `00589_return_to_lead_hardening.sql:696`, and none of W1a's three
migrations (`00592`/`00593`/`00594`) reference `people_directory` at all
(`grep -c people_directory` on each returns 0). W1a's own report lists the
"`people_directory` rebuild" under "Out of W1a scope by instruction" — the view
is untouched, so every reader listed above reads exactly what it read before
this branch existed.

```
$ pnpm --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean — the 508-line, zero-deletion type diff this wave adds (new table
types, new function types, fifteen new `studio_contacts` columns) breaks
nothing downstream. No `file:line` type errors to report.

One forward-looking observation, not a live defect: `company-row.tsx:34-40`'s
`COMPANY_KIND_LABELS` (`gc/workroom/showroom/vendor/supplier`) is a subset of
the new `studio_contacts_company_kind_check` fifteen-value vocabulary
(confirmed directly: `gc, sub, architect, engineer, lender, authority,
showroom, vendor, workroom, supplier, stager, photography, maker, inspector,
other`) — but that component's own prop comment
(`company-row.tsx:54`) says it currently reads `studio_contacts.contact_kind`
(the pre-existing free-text column, decision 2's "left alone"), **not** the new
`company_kind` column. The superset invariant the migration's column comment
states is therefore a forward commitment for whichever later wave wires a hook
to `company_kind`, not something exercised by any code today — consistent
with `w1a-report.md` §5's "No portal hook or UI … no React Query hook reads
any of the new tables yet". Recorded as **F-2 (minor, high confidence,
informational)** so the next wave doesn't assume `company-row.tsx` already
proves the invariant.

---

## 6. r1 fix log — re-checked, all fixed

| # | r1 finding | Status | Evidence this round |
|---|---|---|---|
| B1 | mirror write fired a real opt-in SMS via `fc_dispatch_optin_invite` | **Fixed** | `patina.suppress_consent_dispatch` guard confirmed on both outward triggers (§3 above via SQL block 6, block 8); mirror write is guarded, direct party-row write still dispatches |
| M1 | backfill re-run could reintroduce B1 | **Fixed** | block 6 asserts a maintenance re-run moves rows to `pending` with zero dispatch |
| M2 | `channel_kind` missing `ap_email`/`portal_311` | **Fixed** | CHECK independently re-queried this round: `mobile, office, dispatch, after_hours, email, ap_email, portal_311` |
| M3 | `company_kind` narrower than model + shipped UI | **Fixed** | CHECK independently re-queried this round: 15-value list, confirmed superset of `COMPANY_KIND_LABELS` |
| M4 | channel `status` CHECK missing `bounced` | **Fixed** | CHECK independently re-queried this round: `active, bounced, unsubscribed, dead` |
| M5 | consent gate could refuse but never authorise | **Fixed** | `channelConsentVerdict` returns `refuse\|allow\|unknown`; verified by reading `sms.ts:440-512` and by the passing "granted record carries a send the party row would refuse" test |
| M6 | `grantAllForPhone` defeated per-studio scoping | **Fixed** | `grantPartiesForStudios` confirmed in `pipeline.ts`; "YES does not grant a party row in a studio that never invited" passes |
| M7 | SQL vs. edge org-resolution mismatch | **Fixed** | `resolveProjectOrg`/`orgsOfProjects` confirmed reading `organization_members`/`organizations` with the same owner-then-earliest-`joined_at` fallback as the SQL side; NULL-`studio_id` tests pass on both sides |
| P-1 | shared local Postgres reset out from under the task by another process | **OPEN — recurred again, live, during this very review** | see §0. Not a code defect in W1a; a standing multi-agent/local-dev-ownership gap. This is now at least the fourth documented occurrence across this wave's review history. |

---

## Summary

- SQL: 29/29 blocks pass, clean `ROLLBACK`.
- Types: regeneration reproduces the committed `database.types.ts` byte-for-byte.
- RLS: all five new artifacts are studio-scoped in both directions (read and
  write), a non-member and anon are fully locked out, and a cross-studio
  routing attempt is refused by both RLS and a trigger guard.
- Edge functions: `_shared` 418/418, the sms-focused pair 71/71, full sweep
  694/695 with the one failure independently confirmed pre-existing and
  unrelated (`stripe-rail.test.ts`, no import of this wave's files). Both
  named failure cases (cross-org opt-out/grant conflict; no-record +
  opted-out sibling) are constructed in the test suite and pass in both
  directions, matching the documented gate logic read directly from
  `sms.ts`.
- `people_directory`: untouched by any of the three migrations; all 24
  readers are unaffected by construction, not merely by type-check luck.
- Type-checks: `@patina/supabase` and `@patina/designer-portal` both exit 0.
- All eight r1 code findings (B1, M1–M7) are independently re-confirmed fixed
  this round, each against a fresh, direct query — not by trusting the
  report's prose.

Zero blocking, zero major code findings this round. Two minor, informational
findings (F-1: report text is one round of test growth behind the test file;
F-2: the company-kind CHECK's "superset of the shipped UI" claim isn't yet
exercised by any reader) and one recurring **process** finding (P-1, the
shared local Postgres is not actually sole-owned in practice — happened again
mid-review). None of the three block a merge decision on the code itself;
P-1 is worth escalating outside this wave regardless, since it invalidates any
review's evidence retroactively if it recurs after a review's probes are taken
and before its report is trusted.

**clean = true** (zero blocking, zero major).
