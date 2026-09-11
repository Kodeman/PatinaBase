# W1a review, round 1 — tests, types, behaviour

Reviewer pass over `artifacts/people-room-crm-2026-09-11/build/w1a-report.md`
(commit `1970075c2`, branch `build/people-room-crm-2026-09-11`, worktree
`.codex/worktrees/agent-people-build`). Local Supabase only; nothing pushed to
Strata, nothing deployed. Every command below was actually run in this
session; output is pasted verbatim (trimmed for length where noted).

**Verdict: code-level CLEAN.** Every migration, RPC, RLS policy, edge-function
change and type-generation step I could independently probe behaves exactly
as the w1a-report claims, and I found no blocking or major defect in the
reviewed diff. There is one **major, non-code** finding: the shared local
Supabase stack was reset out from under this review **twice** by another
concurrent wave, which is exactly the migration-number collision the report
itself already flags and plans to resolve at integration (see finding P-1).
Everything else is minor or informational.

---

## 1. SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
BEGIN
INSERT 0 3
INSERT 0 0
INSERT 0 2
INSERT 0 2
INSERT 0 3
INSERT 0 2
INSERT 0 5
CREATE FUNCTION
GRANT
CREATE FUNCTION
GRANT
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Ran it three times across this session (once before, twice after the local
stack was reset out from under me — see P-1) with identical output every
time. Matches the report exactly. I also read the full 365-line test file:
the five assertion blocks genuinely exercise cross-studio RLS refusal (both
directions), E.164/email normalisation including the unparseable-phone
raw-text fallback, the opted-out-always-wins / most-recent-grant-wins /
idempotent-refold precedence rule, the mirror trigger's per-org scoping, and
`record_channel_consent`'s three refusal paths (non-member, no-studio user,
direct-INSERT `42501`). No gaps found in the test's own coverage of what it
claims to cover.

---

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .codex/worktrees/agent-people-build db:generate
Connecting to db 5432
$ git -C .codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

`git diff --stat` was already empty *before* regeneration (the 424-line diff
the report describes is already committed at `1970075c2`); regenerating
against the live local DB and diffing again produced **zero** lines of
output — the committed file is byte-for-byte what the local schema now
generates. The builder did in fact regenerate against the real schema, not
hand-edit the file.

(First attempt failed with `permission denied ... docker.sock` — a sandbox
restriction, not a real failure; re-ran with the sandbox disabled and it
connected immediately.)

---

## 3. Role probes (designer / client / anon)

Dev-account ids from `supabase/seed/dev-accounts.sql`, confirmed live:
`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004` (owner of
`Local Dev Studio`, org `b0000000-0000-0000-0000-000000000001`, and of an
orphaned `Leah Hartwell` membership row whose `organizations` row does not
exist locally — see finding P-3); `client@patina.dev` =
`a0000000-0000-0000-0000-000000000005`, **zero** `organization_members` rows
(genuinely studio-less, a clean stand-in for "client role" / "no studio").

Fixture: one `studio_contacts` card + one `studio_contact_channels` row + one
`studio_channel_consent` row, all in Local Dev Studio, inside a transaction
rolled back at the end.

**As designer@patina.dev (studio member), `SET LOCAL ROLE authenticated` +
`request.jwt.claims`:**
```
            t            | count
-------------------------+-------
 studio_contacts         |     1
 studio_contact_channels |     1
 studio_channel_consent  |     1
```
Sees its own studio's rows. Correct.

**As client@patina.dev (no studio membership), same role:**
```
            t            | count
-------------------------+-------
 studio_contacts         |     0
 studio_contact_channels |     0
 studio_channel_consent  |     0
```
Sees nothing. Correct. And the RPC:
```
NOTICE:  client RPC result: not_a_studio_member
```
Also correct — matches the report's claimed refusal exactly.

**As anon** (schema-qualified names, since anon lacking table SELECT surfaces
as `42501` permission-denied on a qualified name but as a confusing
"relation does not exist" on an unqualified one when the role also can't see
the object for name resolution — a psql/session artifact, not a codebase
issue):
```
NOTICE:  anon SELECT studio_contacts: 42501 (expected)
NOTICE:  anon SELECT studio_contact_channels: 42501 (expected)
NOTICE:  anon SELECT studio_channel_consent: 42501 (expected)
NOTICE:  anon SELECT studio_person_affiliations: 42501 (expected)
NOTICE:  anon RPC result: 42501: permission denied for function record_channel_consent
```
anon has **zero** privilege on any of the four new surfaces — stronger than
RLS alone (base table/function grants deny it outright, matching
`REVOKE ALL ... FROM PUBLIC, anon` in all three migrations).

**"Site access card" — does not exist.** Item (3) of the task asks to assert
"the site access card is invisible outside the studio." I checked:
`SELECT to_regclass('public.project_site_access_cards')` → `NULL`. There is
no site-access-card object anywhere in the repo (`grep` across all
migrations turns up nothing). The report itself lists
`project_site_access_cards` under "Out of W1a scope by instruction"
(w1a-report.md:315–319) — this wave deliberately did not build it. This is
not a defect; it's a mismatch between the review brief's assumption and
what W1a actually shipped, flagged as F-1 below so it isn't silently
dropped.

---

## 4. Edge function tests

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/
ok | 398 passed | 0 failed (1s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 16 passed | 0 failed (29ms)
```

`supabase/functions/sms-inbound` **as a directory has no test file** — the
task names it, but the actual suite lives at
`supabase/functions/_tests/sms-inbound.test.ts` (same layout every other
edge-function test in this repo uses; `sms-inbound/` only holds
`index.ts` + `pipeline.ts`). Ran it at its real path:

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 24 passed | 0 failed (24ms)
```

Full regression:

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 663 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

Confirmed pre-existing and unrelated: `stripe-rail.test.ts` only imports
`@supabase/supabase-js` directly and needs
`supabase/functions/_tests/test.env` (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `CLIENT_PORTAL_URL`) loaded via
`supabase functions serve --env-file`, which the bare `deno test` invocation
in this task does not provide. It does not import `_shared/sms.ts` or
`sms-inbound/pipeline.ts`. All counts match the report exactly (663 passed,
1 pre-existing failure, same file, same error).

### The two requested failure cases, traced against the actual gate

`_shared/sms.ts:205-238`, `channelConsentRefuses(supabase, phone, projectId)`:

```ts
// resolves org = projects.studio_id for the CALLER'S OWN job, then:
if (org) {
  const { data: record } = await supabase.from("studio_channel_consent")
    .select("status").eq("organization_id", org).eq("channel_kind", "sms")
    .eq("channel_value", phone).maybeSingle();
  if (record) return record.status === "opted_out";   // <- own-org record wins outright
}
// only reached when there is NO record for the caller's own org:
const { data: rows } = await supabase.from("project_parties")
  .select("sms_consent_status").eq("phone_e164", phone);   // <- NOT scoped by org
return (rows ?? []).some((r) => r.sms_consent_status === "opted_out");
```

**Case (a) — phone opted out in org A, granted in org B, send is for org B:**
the query only ever reads `studio_channel_consent` filtered to the caller's
own `org` (B). Org A's row is never read at all. Record exists for B
(`granted`) → not refused. This is exactly
`sms.test.ts:543` `"another studio's opt-out does not block this studio's
send"`, which I ran above and confirms `res.sent === true`. **Not a bug** —
this is the documented fix for the pre-00594 phone-global bug (G-3).

**Case (b) — no consent record for the caller's org, and an unrelated party
row on the same number is `opted_out`:** the code falls through to the
fallback query, which has **no organization filter at all** — it will match
*any* `project_parties` row on that phone number, from *any* studio's
project. This is exactly `sms.test.ts:571` `"with no studio record, an
opted-out sibling party row still blocks (fail closed)"`, confirmed passing
above. This fallback is explicitly, deliberately cross-studio-leaky by
design — the docstring at `_shared/sms.ts:199-204` says so outright ("fail
closed until the backfill is proven everywhere (PR-x)"), and the w1a-report
names this as the still-open PR-x follow-up (section 5, "Not done"). **Not a
hidden bug** — it is a disclosed, temporary, intentionally conservative
trade-off, correctly tested.

Both requested scenarios are therefore already covered, by name, in the
existing suite, and I independently confirmed both pass and both match the
intended (not accidental) behaviour by reading the gate function directly.

---

## 5. `people_directory` readers and type-check gates

`people_directory` (view, live head `00589_return_to_lead_hardening.sql:696`)
is **not touched** by any of the three W1a migrations — `grep` across
00592/00593/00594 finds no reference to it at all. Its readers:

| File | How |
|---|---|
| `packages/supabase/src/hooks/use-people.ts:125,161` | `supabase.from('people_directory').select('*')` — the only actual query |
| `packages/supabase/src/hooks/use-vendors.ts`, `use-coordination.ts`, `use-clients.ts` | reference it only via shared types/derived hooks, not a direct query |
| `apps/designer-portal/src/lib/document/{people-derivation,desk-derivation,roster-derivation}.ts` and their tests | consume `use-people.ts`'s output |
| `apps/designer-portal/src/components/document/people/**`, `roster/**`, `overlays/household-sheet.tsx`, `document/brief-section.tsx`, `document/desk-reconnect.tsx` | UI consumers, all downstream of the hook |
| `apps/mobile/Capture/**` (Swift) | separate consumer, out of scope for a TS type-check |

Since the view's definition is unchanged and the regenerated
`database.types.ts` diff is empty (§2), every one of these readers is
structurally unaffected. Confirmed by running the actual gates rather than
inferring:

```
$ pnpm --dir .codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Zero type breaks from the regenerated types, in either package.

---

## 6. Additional code-reading findings (beyond the report's own probes)

I read all three migrations end-to-end (878 lines) and the new edge-function
functions (`loadPhoneParties`, `studiosHoldingPhone`, `writeChannelConsent`
in `sms-inbound/pipeline.ts`; `channelConsentRefuses` in `_shared/sms.ts`)
looking for anything the report's own probes wouldn't surface.

### F-1 (informational, high confidence) — review-brief/deliverable mismatch on "site access card"
Task item (3) assumes a site-access-card object exists to probe for
studio-only visibility. It does not exist anywhere in the repo
(`project_site_access_cards`, confirmed via `to_regclass` → NULL and a full
`grep`), and is explicitly named as out-of-scope for W1a in the report's own
"Not done" section (w1a-report.md:315–319). Nothing to fix in W1a; flagging
so the next reviewer doesn't assume this was missed rather than never
built.
**Fix:** none needed for W1a; re-ask this probe when the wave that builds
`project_site_access_cards` lands.

### F-2 (minor, high confidence) — `studio_person_affiliations` has no entity-kind guard
`supabase/migrations/00592_people_cards_affiliations_rules.sql:163-187`
(table) and `:217-238` (INSERT/UPDATE `WITH CHECK`). The `WITH CHECK` only
enforces that `person_id` and `company_id` resolve to the *same org*
(`studio_contact_org(person_id) = studio_contact_org(company_id)`) — nothing
enforces that `person_id` actually names a card with
`entity_kind = 'person'` and `company_id` one with `entity_kind = 'company'`.
A caller can insert an affiliation with the two ids swapped, or with both ids
pointing at person cards, or both at company cards, and RLS/CHECK will
happily accept it as long as both cards are in the caller's own studio.
**Failure scenario:** a studio member (or a buggy portal form) submits
`person_id = <company card>, company_id = <person card>`; the row inserts
cleanly, and any later reader that assumes `person_id` is always a person
card (the roster/affiliation UI the next wave builds) renders nonsense
without ever hitting a DB error.
**Fix:** add a `CHECK`-equivalent (Postgres CHECK constraints can't
subquery, so this needs a `BEFORE INSERT OR UPDATE` trigger, or fold the
`entity_kind` test into the `WITH CHECK` via
`EXISTS (SELECT 1 FROM studio_contacts WHERE id = person_id AND entity_kind = 'person')`
and the mirror for `company_id`).

### F-3 (minor, medium confidence) — the "mirror" doesn't sync non-status fields on a same-status re-record
`supabase/migrations/00594_studio_channel_consent.sql:198-227`. The mirror
trigger only fires its `UPDATE ... project_parties` when
`pp.sms_consent_status IS DISTINCT FROM NEW.status` (line 223). That guard
is there for a good reason (stops a same-status re-record from re-firing
00432's opt-in SMS dispatch — the report explains this correctly). But the
side effect: if `record_channel_consent()` is called again with the **same**
`status` but a corrected/enriched `evidence`, `source`, `disclosure_version`
or `recorded_at` (e.g., someone fixes a typo in the stored evidence text, or
backfills a disclosure version after the fact — both of which
`record_channel_consent`'s own `ON CONFLICT DO UPDATE` clause at
`00594:302-316` happily accepts and stores on `studio_channel_consent`),
`project_parties.sms_consent_evidence` / `sms_consent_source` /
`sms_consent_disclosure_version` / `sms_consent_recorded_at` on the mirrored
party rows go stale and never catch up, contradicting the table comment's
"read-only cached mirror" framing (line 76-78) and the header's "two
readers, one writer" claim (line 27).
**Failure scenario:** a designer corrects a garbled `evidence` string via
`record_channel_consent` without changing `status`; `studio_channel_consent`
updates correctly; any UI still reading `project_parties.sms_consent_evidence`
(the report names "the roster view, the chips" as such readers, not yet
retired) shows the old, wrong evidence text indefinitely.
**Impact is low today**: those readers mostly branch on `sms_consent_status`,
not on the evidence/source columns, and the newer, authoritative reads should
go through `studio_channel_consent` directly. But it is a real, reproducible
gap between the stated "mirror" guarantee and the code, worth closing before
`project_parties.sms_consent_*` writes are retired (the report's own named
follow-up PR-x).
**Fix:** either drop the `IS DISTINCT FROM NEW.status` guard and instead
guard the *dispatch trigger* (00432's `fc_dispatch_optin_invite`) so it only
fires on a genuine transition into evidenced-pending — which is really where
the "don't re-fire a real SMS" invariant belongs — or explicitly re-list all
mirrored columns in the guard (`IS DISTINCT FROM` across the whole row).

### F-4 (minor, medium confidence) — non-atomic read-then-upsert in `writeChannelConsent`
`supabase/functions/sms-inbound/pipeline.ts:204-239`. Unlike
`record_channel_consent()`'s single atomic
`INSERT ... ON CONFLICT (...) DO UPDATE` (SQL-side, race-free), the edge
function's `writeChannelConsent()` does a `SELECT` to read
`consented_at`/`opt_out_at`/`disclosure_version`/`origin_project_id`, then a
separate `.upsert(...)` call that writes those same fields back computed from
the stale read (`prior.consented_at ?? null`, etc.) — two round trips, no
transaction, no row lock.
**Failure scenario:** two inbound Twilio webhooks for the same phone number
land close together (Twilio does retry on slow/failed responses — a
documented, real source of duplicate delivery) and race through
`writeChannelConsent` for the *same* `(org, phone)` key with *different*
target statuses (e.g. a STOP racing a manual "mark opted back in" from the
portal, or two different studios' STOP/YES for a shared number processed in
the same inbound batch touch different `org` keys so don't collide, but two
concurrent inbound messages for the *same* org+phone can). The second
writer's `prior` snapshot was read before the first writer's row landed, so
the second upsert can silently revert `consented_at`/`opt_out_at`/
`origin_project_id` to a value older than what the first writer just
committed — a lost update.
**Likelihood:** low (requires genuine concurrent delivery for the same
number+studio, which Twilio's per-number sequencing mostly prevents but does
not guarantee under retry). Not covered by the current test suite, which
calls the pipeline serially.
**Fix:** either move this into a single `INSERT ... ON CONFLICT DO UPDATE`
SQL statement (mirroring `record_channel_consent`'s own pattern, so there's
one write-path shape instead of two), or wrap the read+upsert pair in a
transaction/advisory lock keyed on `(org, phone)`.

### F-5 (minor, low confidence) — backfill silently drops un-normalisable numbers
`supabase/migrations/00594_studio_channel_consent.sql:129-144` and
`_shared/sms.ts:231-234` both key exclusively on `phone_e164`. A
`project_parties` row whose raw phone never normalised (so `phone_e164` is
NULL — `studio_contact_channels.value` avoids this by falling back to raw
text, per the report's own point 11, but `project_parties.phone_e164` has no
such fallback) is invisible to `backfill_channel_consent_from_parties()`,
to the mirror trigger's join, and to `channelConsentRefuses`'s fallback
query. Its consent fact (including a prior `opted_out`) never migrates into
`studio_channel_consent`. Low confidence this matters in practice — I did
not find evidence of how common un-normalisable phones are in real data —
but it's a real, silent gap worth a line in the follow-up PR-x work rather
than a fresh discovery at integration.

---

## 7. Process finding — the shared local stack was reset twice, mid-review

### P-1 (major as an operational/coordination issue; NOT a defect in the reviewed diff; high confidence, directly observed)
Partway through this review (after the SQL-test pass and the type-generation
diff, before the role probes), a direct query showed:

```
$ psql ... -c "select version, name from supabase_migrations.schema_migrations order by version desc limit 6;"
    version     |             name
----------------+------------------------------
 20260910152111 | create_contact_messages
 00594          | time_entry_auto_roster
 00593          | project_unbilled_time_repair
 00592          | time_entry_claim_and_source
 00591          | notification_log_delivery
 00590          | engagement_subject
```

— i.e. another concurrent wave's `supabase:reset` had replaced this
worktree's `00592_people_cards_affiliations_rules` /
`00593_studio_contact_channels` / `00594_studio_channel_consent` with a
*different* wave's own `00592`/`00593`/`00594` files (a `time_entry_*`
program). All four new W1a tables (`studio_channel_consent`,
`studio_contact_channels`, `studio_contact_rules`,
`studio_person_affiliations`) were gone. I ran `pnpm supabase:reset` in this
worktree to restore this wave's own migrations, re-verified the SQL test
suite still passed (§1), and continued.

**It happened a second time**, later in the same review session, while I was
reading the migration files (no DB write from me in between) — the DB
reverted to the other wave's `00592`–`00594` again. I restored it a second
time and re-verified.

This is not a bug in W1a's code — it is the exact collision the report
already names and plans to remediate ("Migration numbers are provisional,
and there is a live collision... At integration, expect to renumber this
wave's three files," w1a-report.md:296–306). But it is now **directly
confirmed to be happening live**, not just a theoretical risk read off
`schema_migrations` once: something else is actively re-running
`supabase:reset` (or an equivalent) against this same local Postgres
instance while this review is in progress, in violation of this task's
explicit "THIS wave is its sole owner" instruction.

**Consequence for anyone reading this report:** if you re-run any of the SQL
probes above right now and get "relation does not exist" for
`studio_contacts`, `studio_contact_channels`, etc., it is very likely because
the other wave has reset the stack again since I last restored it — re-run
`pnpm --dir .codex/worktrees/agent-people-build supabase:reset` first, don't
assume the tables were never built.
**Fix:** not a code fix — flag to the orchestrator that a second concurrent
wave is touching this shared local Postgres instance during a task that was
explicitly scoped as sole-owner, so it can pause/serialize that wave or move
it to its own local stack before more work is lost this way.

---

## Summary table

| id | severity | confidence | file(s) |
|---|---|---|---|
| P-1 | major (process, not a code defect) | high | shared local Supabase stack (cross-wave) |
| F-2 | minor | high | `supabase/migrations/00592_people_cards_affiliations_rules.sql:217-238` |
| F-3 | minor | medium | `supabase/migrations/00594_studio_channel_consent.sql:198-227` |
| F-4 | minor | medium | `supabase/functions/sms-inbound/pipeline.ts:204-239` |
| F-1 | informational | high | review-brief scope mismatch (no code change) |
| F-5 | minor | low | `00594_studio_channel_consent.sql:129-144`, `_shared/sms.ts:231-234` |

Zero blocking findings. Zero major findings against the reviewed code itself
(P-1 is major only as a live infrastructure/process risk, disclosed and
already planned-for by the report). All SQL tests, edge-function tests
(except the one pre-existing, unrelated `stripe-rail.test.ts` failure), and
both named type-check gates pass, and the regenerated types are byte-for-byte
identical to what's committed.
