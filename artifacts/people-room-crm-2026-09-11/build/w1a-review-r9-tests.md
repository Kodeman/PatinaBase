# W1a review — round 9 — tests, types, behaviour

Branch `build/people-room-crm-2026-09-11`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
tip `52c4d17ca` (r10's M1/M2 fix commit — one round past the r8-tests review's
`3ddd0ddc4`). Local Supabase stack only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No
`supabase db push`, no `supabase functions deploy`, nothing touched on Strata.
Every probe row inserted for the RLS section was deleted afterward — all five
tables verified back to 0 rows.

**Verdict: CLEAN.** Zero blocking, zero major. Two minor findings carried
forward from prior rounds (task/scope mismatches, not code defects); the
prior round's staleness finding (T-1) is now fixed. Every runnable check —
SQL tests, type regen, RLS/role probes, edge-function tests, two
freshly-constructed gate-logic failure cases, package + portal type-checks —
passed or reproduced the claimed behaviour with fresh evidence taken at the
branch tip.

---

## 0. Prior fix log (`w1a-fix-log-r8.md`) re-checked

Two rulings, both re-verified FIXED at the current tip, not merely
re-asserted from the log:

- **R-AQ (r8 R8-M1)** — a wordless refusal must wipe the seat's four evidence
  columns rather than COALESCE-ing in the sibling grant's paperwork. SQL test
  block 27 (`27i6`–`27i8` per the log) passed in my own fresh `psql` run
  below.
- **R-AR (r8 R8-M2)** — a card something points at cannot change its
  `entity_kind` or `organization_id` out from under its dependents. SQL test
  block 29 passed in my own fresh run.

Both are exercised inside the full test file I ran myself (§1), not copied
from the fix log's transcript, and both still pass three rounds later (r9's
R5-M1/R5-M2, r10's M1/M2) alongside everything the later rounds added.

---

## 1. SQL tests — `supabase/tests/people/`

Only one file exists under that path.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql \
    > "$TMPDIR/w1a_test_out.txt" 2>&1; echo "EXIT CODE: $?"
EXIT CODE: 0

$ grep -c NOTICE "$TMPDIR/w1a_test_out.txt"
37

$ tail -5 "$TMPDIR/w1a_test_out.txt"
DO
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
DO
ROLLBACK

$ grep -E "ROLLBACK|ERROR" "$TMPDIR/w1a_test_out.txt"
ROLLBACK
```

37 NOTICE lines (36 block-pass notices + the closing "All W1a assertions
passed." line), zero `ERROR`, one `ROLLBACK` — the whole file runs inside one
transaction and leaves no residue. This matches `w1a-report.md`'s own current
claim exactly ("**37 blocks** … **36 notices**"; `… | grep -c NOTICE` must
read 37) — **the staleness this transcript suffered three times before (r2,
r9, and again before r10) is not present now.** The r8-tests review's
Finding T-1 ("the report's own block count is stale again," 31 claimed vs. 36
actual) is **fixed**: `w1a-fix-log-r10.md` §M2 explicitly re-took this
section from the tip and the count now agrees with the file.

All 36 individual `NOTICE … passed` lines were inspected; none reads
`error`/`fail` outside the substring "fails closed" inside passing prose (same
false-positive the r8 review flagged and dismissed — confirmed again here).

---

## 2. `db:generate` / generated-types diff

```
$ git status --porcelain -- packages/supabase/src/database.types.ts
(empty — clean before regen)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
(exit 0)

$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

The exact invocation the task specifies, run once, produced a clean empty
diff on the first attempt — the r8 review's Finding T-2 (a one-off empty-file
regen on an old CLI, non-reproducible) did not recur this round. (Note: this
command needs real Docker-socket access; it fails inside the default Bash
sandbox with `permission denied … docker.sock`, which is a sandbox
restriction, not a wave defect — confirmed by re-running the identical
command with the sandbox disabled, which then succeeds cleanly.)

---

## 3. Role probes (RLS)

`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004`
(`supabase/seed/dev-accounts.sql:14,47-51,113`), owner of two orgs including
`b0000000-0000-0000-0000-000000000001` ("Local Dev Studio").
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`
(`dev-accounts.sql:15,54-58,114`), a homeowner role, not a member of any
`organization_members` row.

All five people-room tables were empty on the shared local stack (backfills
found nothing locally — seeds run before migrations, per `w1a-report.md`
§5). I inserted a throwaway fixture as `postgres` (superuser) inside one
committed transaction — one person card, one company card, one channel, one
consent record, one contact rule, one affiliation, all scoped to the
designer's own studio `b0000000-…-0001` — probed each role, then deleted every
row (verified back to 0 in all five tables).

**As `authenticated` / designer (own studio, `SET request.jwt.claims`
carrying `sub=a0000000-…-0004`):**

```
             t              | count 
----------------------------+-------
 studio_contacts            |     2
 studio_contact_channels    |     1
 studio_channel_consent     |     1
 studio_contact_rules       |     1
 studio_person_affiliations |     1
```
All 6 probe rows visible (2 studio_contacts, one person one company).

**As `authenticated` / client (`sub=a0000000-…-0005`, no studio membership):**

```
             t              | count 
----------------------------+-------
 studio_contacts            |     0
 studio_contact_channels    |     0
 studio_channel_consent     |     0
 studio_contact_rules       |     0
 studio_person_affiliations |     0
```
Zero rows visible on every table — RLS correctly scopes to studio membership.

**As `anon`** (each table probed individually since the first denial aborts a
combined `UNION ALL`):

```
=== anon SELECT on studio_contacts ===
ERROR:  permission denied for table studio_contacts
=== anon SELECT on studio_contact_channels ===
ERROR:  permission denied for table studio_contact_channels
=== anon SELECT on studio_channel_consent ===
ERROR:  permission denied for table studio_channel_consent
=== anon SELECT on studio_contact_rules ===
ERROR:  permission denied for table studio_contact_rules
=== anon SELECT on studio_person_affiliations ===
ERROR:  permission denied for table studio_person_affiliations
```

`anon` has no GRANT at all on any of the five tables — refused at the
privilege layer before RLS is even evaluated. Matches the report's own probe
(`w1a-report.md` "EXECUTE on record_channel_consent, by role": `anon | f`).

**Write-door probe** (designer, own studio, `authenticated`):

```
insert into studio_channel_consent (organization_id, channel_kind, channel_value, status)
values ('b0000000-0000-0000-0000-000000000001','sms','+19999999999','granted');

ERROR:  permission denied for table studio_channel_consent
HINT:  Grant the required privileges to the current role with: GRANT INSERT ON public.studio_channel_consent TO authenticated;
```

No INSERT/UPDATE/DELETE grant exists for `authenticated` on
`studio_channel_consent` — `record_channel_consent()` (SECURITY DEFINER) is
the only door, exactly as decision 5 and the report's own "RPC is the only
write door" probe claim.

### Finding T-3 (minor, high confidence) — "the site access card" does not exist in this wave

The task asks to "assert the site access card is invisible outside the
studio." No such object exists: `grep -rn "site_access_card"` across the
entire worktree (`.sql`, `.ts`, `.tsx`) returns **zero matches**, and
`w1a-report.md` §5 explicitly lists `project_site_access_cards` as
**out of W1a scope by instruction** ("named so the next wave does not
assume they landed"). This is unchanged from the r8-tests review's identical
Finding T-3 — it is a standing task/reality mismatch, not a regression or a
new defect. In its place I probed the four actual new tables this wave DID
ship (above) for the same property — invisible to a non-member account and
to `anon`, visible only to a studio member — and it holds cleanly.
**Recommend:** route the literal "site access card" assertion to whichever
future wave builds `project_site_access_cards`; there is nothing in W1a for
it to fail against.

---

## 4. Deno tests — `_shared` and `sms-inbound`

Literal task invocation:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound
ok | 420 passed | 0 failed (1s)
```

Only `_shared`'s 26 test files ran (420 tests, including `sms.test.ts`'s 38).
`supabase/functions/sms-inbound/` itself holds no `*.test.ts` — its suite
lives at `supabase/functions/_tests/sms-inbound.test.ts`, exactly as
`w1a-report.md` discloses ("a literal `deno test … sms-inbound` reports 'No
test modules found'"). Confirmed by listing every `running N tests from …`
line in the output (stripped of ANSI): all 26 are under `_shared/`, none
under `sms-inbound/`.

Running the actual sms-inbound suite location, and the report's own combined
gate command, for completeness:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts
ok | 42 passed | 0 failed (32ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 80 passed | 0 failed (282ms)
```

80 (38 + 42) matches the report's own count exactly.

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```
Clean, no type errors on either edited file.

### Gate-logic failure cases — freshly constructed, not reused

Read `channelConsentVerdict()` (`supabase/functions/_shared/sms.ts:440-523`),
`orgHasOptedOutParty()` (`sms.ts:346-381`), `resolveProjectOrg()` /
`orgsOfProjects()` (`sms.ts:276-341`) directly, then wrote a standalone Deno
test file exercising `sendPartySms()` (the public entry point) against two
constructed fixtures — not a re-run of an existing test, a new one built
straight off the gate's own logic, run once and then deleted (temp file
`supabase/functions/_shared/__probe_gate.test.ts`, never committed; worktree
verified clean afterward with `git status --porcelain`).

**Case 1 — a phone opted out in org A, granted in org B.**
`studio_channel_consent` seeded with `(org-A, opted_out, refusal_unanswered=true)`
and `(org-B, granted, refusal_unanswered=false)` for the same
`+15559990001`; two `project_parties` seats, one per org/project.

```
org A (opted_out record) result: {"sent":false,"reason":"opted_out"}
org B (granted record) result:   {"sent":true, ...}
ok | 2 passed | 0 failed
```

Org A's own record refuses org A's send; org B's own record allows org B's
send, unaffected by org A's STOP. Confirms decision 13 / R-AK: the gate
resolves one org per send and never lets one tenant's refusal silence
another's grant, in either direction.

**Case 2 — a phone with no consent record at all, but an opted_out party row
in the SAME resolving org.** `studio_channel_consent` left empty for `org-C`;
two `project_parties` seats on `+15559990002` in `org-C`, one `not_asked`
(the send target) and one already `opted_out`.

```
no-record + sibling-opted-out result: {"sent":false,"reason":"opted_out"}
ok | 1 passed
```

With no record for the resolving studio, `channelConsentVerdict()` falls back
to `orgHasOptedOutParty()` scoped to that same org and fails closed on the
sibling's refusal — matches decision 13's documented fallback exactly.

Both cases behave exactly as `w1a-report.md` claims for decisions 10/13/R-AK;
no finding.

---

## 5. `people_directory` readers and type-check

### Finding T-4 (minor, high confidence) — `people_directory` is untouched by W1a

`grep -l "people_directory" supabase/migrations/00592_people_cards_affiliations_rules.sql
supabase/migrations/00593_studio_contact_channels.sql
supabase/migrations/00594_studio_channel_consent.sql` returns **no matches**
(exit 1). The view's current definition is
`00589_return_to_lead_hardening.sql:696` (last `CREATE OR REPLACE VIEW`,
unchanged since); its 12-column shape
(`person_id, role, display_name, email, phone, profile_id, project_id,
designer_id, status_raw, last_touch_at, meta, scope`) is identical before and
after this wave. Its "FIELD / ROSTER PARTIES" branch
(`00589_return_to_lead_hardening.sql:822-855`) reads `project_parties`
directly and embeds `sms_consent_status`, `sms_consented_at`,
`sms_opt_out_at` into `meta` — but **not** the evidence columns
(`sms_consent_source/evidence/recorded_at/recorded_by`) that W1a's mirror
now nulls on a wordless refusal (decision 23, R-AQ). Those two dates are
explicitly the ones decisions 22/23 leave untouched ("not evidence"), so even
that indirect exposure is unaffected by this wave's behavioural change. No
branch of the view joins `studio_contacts`, so none of W1a's fifteen new
columns or four new tables are visible through it either way — consistent
with `w1a-report.md` §5 listing "the `people_directory` rebuild" as
explicitly out of scope.

Readers found (`grep -rln "people_directory" apps packages`, excluding
`node_modules`):

| Reader | File | How |
|---|---|---|
| `usePeople` / `usePerson` hooks | `packages/supabase/src/hooks/use-people.ts` | direct `supabase.from('people_directory')` query — the only real call sites |
| Generated types | `packages/supabase/src/database.types.ts` | `Views.people_directory` type |
| `use-vendors.ts`, `use-coordination.ts`, `use-clients.ts` | `packages/supabase/src/hooks/` | comment/derivation references only, no direct query |
| Designer portal Document/People UI | `apps/designer-portal/src/components/document/{desk-reconnect,brief-section,household-sheet}.tsx`, `roster/{roster-row,call-sheet-mount}.tsx` (+tests), `people/{person-bits,party-profile-sheet,outreach/audience-rules}.tsx`, `people/views/directory-view.tsx`, `people/directory/makers-marketplace.tsx`, `people/profile/maker-profile.tsx`, `lib/document/{people-derivation,roster-derivation,desk-derivation}.ts` | consume via the hooks above, never query the table directly |
| Patina Field (iOS/Swift) | `apps/mobile/Capture/Capture/Features/Leads/{SupabaseLeadsService,LeadFormat}.swift` | comments mirroring the view's COALESCE chain; does not query `people_directory` by name |

Since the view is byte-for-byte unchanged and its two SQL call sites both use
`select('*')`, every reader here is trivially unaffected — there is nothing
for them to break against in W1a. This is the same conclusion the r8-tests
review reached (its identical Finding T-4); re-confirmed independently this
round with the same grep and the same migration-diff check.

### Type-checks

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean — no output; exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean — no output; exit 0)
```

Both exit 0 with zero output. No type break anywhere in either package. The
regenerated `database.types.ts` (empty diff, §2) introduces nothing new to
break against, and none of the `people_directory` readers above are affected
since that view was never touched by this wave.

---

## 6. Summary of findings

| ID | Severity | Confidence | File | Claim | Status |
|---|---|---|---|---|---|
| T-1 (r8) | minor | high | `artifacts/people-room-crm-2026-09-11/build/w1a-report.md` | SQL-test block count/transcript was stale (said 31, file had 36) | **FIXED** — `w1a-fix-log-r10.md` §M2 re-took §3 from the tip; report now correctly reads 37/36 and matches my own fresh 37-NOTICE run |
| T-2 (r8) | minor | high (non-reproducible) | tooling / local Supabase CLI | one prior `db:generate` run silently wrote a near-empty types file | Did not recur this round — first attempt on the exact task invocation produced a clean empty diff |
| T-3 | minor | high | task scope vs. `w1a-report.md` §5 | "the site access card" (`project_site_access_cards`) does not exist anywhere in this worktree — explicitly out of W1a scope by instruction; probed the four actual new tables instead, which correctly isolate by studio | **open** (standing scope note, not a code defect; carried forward unchanged from r8) |
| T-4 | minor | high | task scope vs. `w1a-report.md` §5 | `people_directory` is untouched by W1a — no migration in 00592-00594 references it, its column shape and its roster branch's exposed columns are unchanged; all six reader groups are trivially unaffected | **open** (standing scope note, not a code defect; carried forward unchanged from r8) |

**No blocking or major findings.** Both R-AQ/R-AR fixes from `w1a-fix-log-r8.md`
remain fixed at the current tip (`52c4d17ca`), re-verified with fresh command
output rather than trusted from the log. The two open items (T-3, T-4) are
task-instruction/reality mismatches inherent to what W1a was scoped to ship,
not defects in the code that shipped — they will resolve themselves once the
waves that build `project_site_access_cards` and rebuild `people_directory`
land.
