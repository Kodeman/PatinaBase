# W1a — adversarial migration review, round 1

Reviewer: separate context from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, commit `1970075c2`.

**Verdict: NOT CLEAN — 1 blocking, 7 major, 14 minor.**

Read in full: `00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`,
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/_tests/fake-supabase.ts`, plus the cited bodies of 00281,
00284, 00315, 00417, 00432, 00556, 00584.

---

## 0. What passed

Recorded first so the findings below are read against a mostly-sound wave.

| Check | Result |
|---|---|
| Numbering after head 00591 (`ls supabase/migrations/*.sql \| sort \| tail`) | ✅ 00592/00593/00594; timestamp file ignored |
| Any function redefined without grafting the grep-winner body | ✅ none — grep for each of the six new function names returns ONLY the wave's own file (evidence §1) |
| Banner header on each migration | ✅ all three |
| Idempotent rerun | ✅ all three files re-ran inside one rolled-back transaction with zero errors (evidence §3) |
| New table ⇒ `ENABLE ROW LEVEL SECURITY` + policies in the same file | ✅ 4/4 tables, RLS on, 1/4/4/4 policies |
| Explicit GRANTs both directions + `REVOKE … FROM PUBLIC, anon` | ✅ `anon` holds **zero** privileges on all four tables and zero EXECUTE on all six functions |
| `SECURITY DEFINER` pins `search_path` | ✅ 5 definer functions all `{search_path=public}`; the one invoker trigger fn pins `public, pg_temp` |
| `python3 scripts/generate-legacy-grants.py` re-run | ✅ regenerating produces **no diff** — the seed is current |
| `db:generate` | ✅ regenerating produces **no diff**; committed change is `424 0` (insertions / deletions) |
| Money in cents | ✅ no money column added; `retainage_bps` is an integer basis-point field |
| Enum `ADD VALUE` in the same transaction | ✅ none — TEXT + CHECK throughout, per PD-4 |
| Guarded crons | ✅ none added |
| Extension functions schema-qualified | ✅ only `gen_random_uuid()` (pg_catalog core, 158 prior migrations use it bare); `auth.uid()`, `public.normalize_phone_e164`, `public._primary_studio_for` all qualified |
| Prod commands anywhere in the wave's files | ✅ none (`grep -nE "db push\|functions deploy\|supabase\.co\|bkvcixdmuyejfzcijpdg"` → no match) |
| Client-portal (or any app/package) reading the new tables | ✅ none outside `database.types.ts` |
| `people_directory` altered | ✅ untouched; still 12 columns after reset |
| RLS predicates match the direction | ✅ channels/affiliations/card-rules on `is_active_studio_member(studio_contact_org(...))`; the engagement leg of rules on `is_studio_comember(project_party_designer(...))`; consent on `is_active_studio_member(organization_id)` |
| `studio_channel_consent` write door | ✅ `authenticated` gets SELECT only; direct INSERT **and** UPDATE both raise `42501` (probed) |
| Cross-studio RPC call | ✅ refused with `not_a_studio_member` (probed) |
| Mirror trigger loop | ✅ cannot loop — nothing on `project_parties` writes `studio_channel_consent`; the only AFTER trigger there is `fc_optin_invite_dispatch`, which calls an edge function (see B1) |
| Send gate fail-closed | ✅ every refusal branch in `sendPartySms` returns `{sent:false}`; a failed/absent consent read falls through to the phone-global party scan, and the legacy `not_consented` / `not_invitable` gates are untouched |

---

## 1. Redefinition lineage — the grep, run

```
$ cd .../supabase/migrations
$ for f in studio_contact_org project_party_designer normalize_studio_contact_channel \
       backfill_channel_consent_from_parties mirror_channel_consent_to_parties record_channel_consent; do
    echo "=== $f ==="; grep -rln "CREATE OR REPLACE FUNCTION[^(]*$f" *.sql | sort; done
=== studio_contact_org ===
00592_people_cards_affiliations_rules.sql
=== project_party_designer ===
00592_people_cards_affiliations_rules.sql
=== normalize_studio_contact_channel ===
00593_studio_contact_channels.sql
=== backfill_channel_consent_from_parties ===
00594_studio_channel_consent.sql
=== mirror_channel_consent_to_parties ===
00594_studio_channel_consent.sql
=== record_channel_consent ===
00594_studio_channel_consent.sql
```

Every new function is genuinely new; no prior body exists to graft. The report's
claim on this point holds. The helpers the wave *calls* were read at their
grep-winner heads and are unmodified: `is_active_studio_member`
(`00417:40-55`), `is_studio_comember` (`00556:51-76`, superseding `00315:29-52`),
`_primary_studio_for` (`00315:70-83`), `normalize_phone_e164` (`00281:81-103`),
`update_updated_at_column`, `fc_dispatch_optin_invite` (`00432:27-68`, retriggered
by `00284:254-257`).

---

## 2. Reset and tests, run by this reviewer

```
$ pnpm --dir .../agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
… 29 seed files …
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

`apps/designer-portal/.env.local` does not exist in this worktree (checked before
the first reset), so no prod-pointing risk.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

The two `CREATE FUNCTION` statements inside the test are `pg_temp.assume_user` /
`pg_temp.reset_role` helpers — no production function is stubbed, so the RLS
assertions are real.

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 40 passed | 0 failed (105ms)
```

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2619 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql      # (empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts # (empty)
```

Object probes (post-reset):

```
          relname           | rls | forced | policies
----------------------------+-----+--------+----------
 studio_channel_consent     | t   | f      |        1
 studio_contact_channels    | t   | f      |        4
 studio_contact_rules       | t   | f      |        4
 studio_person_affiliations | t   | f      |        4

         table_name         |    grantee    |                          privs
----------------------------+---------------+---------------------------------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
   (no `anon` row for any of the four)

                proname                | secdef | provolatile |            proconfig
---------------------------------------+--------+-------------+---------------------------------
 backfill_channel_consent_from_parties | t      | v           | {search_path=public}
 mirror_channel_consent_to_parties     | t      | v           | {search_path=public}
 normalize_studio_contact_channel      | f      | v           | {"search_path=public, pg_temp"}
 project_party_designer                | t      | s           | {search_path=public}
 record_channel_consent                | t      | v           | {search_path=public}
 studio_contact_org                    | t      | s           | {search_path=public}

 studio_channel_consent_pkey | PRIMARY KEY (organization_id, channel_kind, channel_value)
```

All 15 new `studio_contacts` columns present; `people_directory` still 12 columns.

---

## 3. Idempotent rerun

All three files re-executed against the already-migrated DB inside one
transaction, rolled back:

```
### 00592 re-ran OK      (NOTICEs only: "column … already exists, skipping",
### 00593 re-ran OK       "relation … already exists, skipping")
### 00594 re-ran OK
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
```

No errors. Note the local seed set contains **zero** `project_parties` rows and no
rolodex card with a phone or email, so the 00593 and 00594 backfills insert 0 rows
on every local run. The report discloses this (§5); it means the backfill
precedence rule is proven only by the wave's own SQL-test fixture, never against
seed data. Kept as an evidence note, not a finding.

---

## FINDINGS

### BLOCKING

#### B1 — one recorded `pending` consent becomes N real opt-in SMS to the same number
`supabase/migrations/00594_studio_channel_consent.sql:198-241` (body `:209-223`),
firing `public.fc_dispatch_optin_invite` (`00432:27-68`, trigger
`00284:254-257`).
**Confidence: high (proven).**

`mirror_channel_consent_to_parties()` writes `NEW.status` **and the whole evidence
set** onto *every* party row in the studio carrying that number. When the status
is `pending`, each newly-pending row independently satisfies
`fc_dispatch_optin_invite`'s guard (status `pending`, `phone_e164` non-null,
source + recorded_at + disclosure_version non-null, evidence non-blank, and OLD
was not already an evidenced-pending row), so each fires
`invoke_edge_function('sms-dispatch', … 'sms_optin_invite')`.

The migration's own banner (`00594:34-37`) names this dispatch as the hazard the
file's ordering exists to avoid — but the ordering only protects the one in-file
fold. At runtime the trigger is live and the fan-out is unguarded.

Proof — three party rows on one number in one studio, one RPC call:

```sql
-- three not_asked party rows on +16125550142, three projects, one studio
SELECT public.record_channel_consent(
  '…000a','sms','(612) 555-0142','pending','written','kickoff form','field-sms-v1','…000a');
 rpc_status
------------
 pending

SELECT sms_consent_status, count(*) AS party_rows,
       count(*) FILTER (WHERE sms_consent_source IS NOT NULL
                          AND sms_consent_recorded_at IS NOT NULL
                          AND sms_consent_disclosure_version IS NOT NULL
                          AND btrim(coalesce(sms_consent_evidence,'')) <> '')
         AS fully_evidenced_would_dispatch
FROM project_parties WHERE phone_e164='+16125550142' GROUP BY 1;
 sms_consent_status | party_rows | fully_evidenced_would_dispatch
--------------------+------------+--------------------------------
 pending            |          3 |                              3
```

Three dispatches, three identical opt-in texts to one human, from one studio act.
Duplicate opt-in traffic on a 10DLC campaign is exactly the carrier-filtering
exposure the room exists to remove, and it directly contradicts direction §1.4
("one record per studio per channel value").

Nothing calls `record_channel_consent` with `pending` yet (no portal hook in
W1a; the inbound rail only writes `granted`/`opted_out`), so this cannot fire on
Strata today. It fires the moment W2's hook lands, and the fix belongs in this
migration rather than in a later one against a table already pushed.

**Suggested fix:** make the mirror skip `pending` entirely (it is the one status
whose write has an external side effect — `not_asked` / `granted` / `opted_out`
mirror harmlessly), **or** suppress the dispatch trigger for the mirror's own
update (`SET LOCAL patina.suppress_optin_dispatch = '1'` read by
`fc_dispatch_optin_invite`), **or** restrict the mirror to the party row the act
named.

---

### MAJOR

#### M1 — the documented "re-run the backfill after the push" step reintroduces B1
`supabase/migrations/00594_studio_channel_consent.sql:193` and `:238-241`;
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md:311-312`
("`backfill_channel_consent_from_parties()` can be re-run afterwards as
`service_role` without overwriting anything").
**Confidence: high (proven).**

Idempotent for *data*, not for *side effects*. Once the trigger exists, every row
the fold inserts fires the mirror. Proof, with the trigger live:

```sql
-- one of three party rows on the number is an evidenced `pending`; no consent record yet
SELECT public.backfill_channel_consent_from_parties();
 rows_folded
-------------
           1
SELECT id, sms_consent_status FROM project_parties WHERE phone_e164='+16125550142' ORDER BY id;
 e1…0001 | pending      <- was already pending
 e1…0002 | pending      <- flipped by the mirror  → dispatch
 e1…0003 | pending      <- flipped by the mirror  → dispatch
```

Two opt-in SMS out of a maintenance call. The report's post-deploy instruction
must either be withdrawn or paired with B1's fix.

#### M2 — `channel_kind` vocabulary omits channels both binding specs require
`supabase/migrations/00593_studio_contact_channels.sql:37-39`.
**Confidence: high.**

Shipped: `mobile | office | dispatch | email | after_hours`.
`crm-model.md` §2, Reach channel `channel_kind`, specifies
`mobile/office/dispatch/after_hours/ap_email/email/app/account/field_link/paper/portal_311`.
Two of the omissions are load-bearing, not aspirational:

- `ap_email` — `direction.md` §2.2, entity E6, states the company card owns
  "office, dispatch, **AP**, after-hours". The AP address is the one the
  bookkeeper pays from (`remit_to` lands in 00592 with no channel to pair with).
- `portal_311` — fixture F-27 Ray Thao is "scheduled through 311 portal" and is
  cited in the same dictionary row (CS4-7) that the migration quotes verbatim at
  `:43` to justify `sms_capable`.

Widening a CHECK later is cheap; discovering mid-W2 that the AP line has no kind
is not.

#### M3 — `company_kind` CHECK is narrower than the model **and** than the shipped UI
`supabase/migrations/00592_people_cards_affiliations_rules.sql:116-122`.
**Confidence: high.**

Shipped: `gc, sub, vendor, maker, architect, engineer, inspector, lender, stager,
photographer, other`.
`crm-model.md` §2 Company.company_kind:
`gc/sub/architect/engineer/lender/authority/showroom/vendor/workroom/supplier/stager/photography/maker`.

Missing `workroom`, `showroom`, `supplier`, `authority`. The first three are live
today — `COMPANY_KIND_LABELS` at
`apps/designer-portal/src/components/document/people/directory/company-row.tsx:34-40`
renders `gc / workroom / showroom / vendor / supplier` for existing company cards.
Migrating those `contact_kind` values into `company_kind` (which is the whole
point of the new column, and what the Firms chip will filter on) raises `23514`.
`authority` is the AHJ kind the fixture's F-27 needs and is not covered by
`inspector` (direction §3.8 and C13 treat lender/inspector as the paper-exempt
pair; a city department is neither a person's employer nor a lender).

#### M4 — `studio_contact_channels.status` has no `bounced`
`supabase/migrations/00593_studio_contact_channels.sql:50`.
**Confidence: high.**

Shipped `active | dead | unsubscribed`; `crm-model.md` §2 (Reach channel `status`,
and Person `email_status`) specifies `ok | bounced | unsubscribed | dead`, with
CS6-10 explicitly requiring a dated bounce. `direction.md` §7's P3 row has the
email rail writing `status`/`status_at` back onto the channel — a bounce is the
single most common value that rail produces and it has nowhere to land. (`ok` vs
`active` is a harmless rename; the missing value is not.)

#### M5 — the new "primary" gate can refuse but never authorise
`supabase/functions/_shared/sms.ts:189-236` (`channelConsentRefuses`), read at
`:486-491`; the positive gate is still `:496-506` over `resolveRecipient`'s
single party-row read at `:250-262`.
**Confidence: medium.**

`channelConsentRefuses` returns `record.status === "opted_out"`. It never returns
"allow". The `!isInvite && recipient.consent !== 'granted'` gate immediately below
still reads `project_parties.sms_consent_status`. Because the mirror fires only on
a **consent write**, never on a party-row insert, a new seat created for a number
the studio already recorded `granted` for starts `not_asked` and the send is
refused with `not_consented` — the fixture's F-11 case (Dana's 2025 consent, new
Okonkwo seat) still needs a manual re-record.

This fails closed, so it is not a compliance defect; it is the half of G-3 the
wave claims to close. The doc comment at `:189-195` ("the studio that owns the job
is … the only one whose grant may authorise it") describes behaviour that does not
ship, which will mislead the next reader. Either wire the positive branch (record
`granted` ⇒ allow) or correct the comment and name the gap in the W2 brief.

#### M6 — the kept phone-global `grantAllForPhone` defeats the wave's own per-studio scoping
`supabase/functions/sms-inbound/pipeline.ts:434-448` (YES branch) and `:410-418`
(START branch).
**Confidence: medium (behaviour certain; severity partly pre-existing).**

`writeChannelConsent` is carefully scoped — YES grants a consent record only for
the studios that actually hold a `pending` row. The very next line,
`grantAllForPhone(supabase, from, nowIso, true)`, still flips **every** party row
on that number to `granted`, across every studio. Since the send gate's positive
test reads the party row (M5), a studio that never invited the number can now text
it, while its own consent record stays `not_asked`. The record and the mirror are
left permanently disagreeing — the "two writers" hazard `direction.md` C10 warns
about.

Pre-existing behaviour, kept deliberately per the report §5. But the wave adds the
scoped record *without* removing the unscoped writer, so the scoping buys nothing
on the send path today, and PR-x's follow-up now has to unpick two writers rather
than one.

#### M7 — `studiosHoldingPhone` drops NULL-`studio_id` projects the SQL side keeps
`supabase/functions/sms-inbound/pipeline.ts` (`studiosHoldingPhone`, the
`if (!row.studio_id || seen.has(row.studio_id)) continue;` line) vs
`00594:141` and `:221` (`COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))`).
**Confidence: medium (impact depends on whether any Strata project has a NULL `studio_id`).**

The SQL backfill and the mirror resolve a project's org through the COALESCE
fallback; the inbound rail uses `studio_id` alone. Consequence: for a project
whose `studio_id` is NULL, the migration **creates** a consent record (under the
designer's primary studio) but an inbound STOP **never updates it**. The record
stays `granted`/`not_asked` while the party rows go `opted_out`, so the People
room will print "Texting" for a number that has STOPped. Sends still fail closed
(the record's org never resolves in `channelConsentRefuses`, so it falls to the
party-row scan), but the studio-facing fact is wrong — the exact class of bug
(chip says one thing, gate does another) that G-3 and 00594 exist to end.

Either give the edge function the same COALESCE (a small RPC or a
`projects` → `_primary_studio_for` lookup) or make the SQL side skip NULL
`studio_id` too, so the two agree.

---

### MINOR

#### m1 — `reach_preference` silently dropped
`direction.md` §7 lists `reach_preference` on the `studio_contacts` (person) row
and `crm-model.md` §2 types it `text/email/phone/office/app` (CS4-5, F-13 has no
work cell). It is not added, and unlike the four contact-rule columns it is **not**
named in the report's deliberate-omissions list (`w1a-report.md:50-54`). Plausibly
subsumed by `studio_contact_channels.preferred` (`00593:48`) — but that is one
preferred flag per channel row, not a person-level posture, and nothing says so.
**Confidence: high.** Fix: add it, or record the subsumption as a ruling.

#### m2 — an orphaned contact rule is invisible **and** undeletable
`00592:259-260` (`subject_id` is polymorphic, no FK) and `:289-290`.
**Confidence: high (proven).**
Deleting the subject card leaves the rule row; `studio_contact_org(subject_id)`
then returns NULL, `is_active_studio_member(NULL)` is false, and the row is
unreadable and undeletable by any studio member:

```
 rules_left_after_card_delete | 1
 rules_visible_to_member      | 0
 rules_deletable_by_member    | 0
```

Rare in practice (`studio_contacts` has no DELETE policy — 00417 is soft-delete
only), so the path is service_role or a future cascade. Worth a cleanup trigger or
an admin-visible orphan sweep.

#### m3 — `record_channel_consent` accepts `granted` with no source, evidence or disclosure version
`00594:246-320`. **Confidence: high (proven).**
```
SELECT (public.record_channel_consent('…000a'::uuid,'sms'::text,'6125550150'::text,'granted'::text)).*;
 status  | source | evidence | disclosure_version
---------+--------+----------+--------------------
 granted |        |          |
```
`crm-model.md` §2 marks Consent.source, .disclosure_version and .recorded_by
required and .evidence_text required for `pending`. Nothing in the table CHECKs it
and the one write door does not validate it. This matches
`project_parties`' own posture (no consent-evidence CHECK there either — verified),
so it is a carried-forward gap, not a regression. Fix belongs with the W2 hook, or
as a CHECK keyed on `status IN ('pending','granted')`.

#### m4 — `record_channel_consent` does not pin `origin_project_id` to the org
`00594:299-300`. **Confidence: high (proven).** An Alpha member recorded a consent
row carrying a **Beta** project id. No read leak (project name reads are
RLS-gated), but R-Q's sentence can name a job the studio does not own.

#### m5 — the mirror never refreshes evidence on a same-status re-record
`00594:223` (`AND pp.sms_consent_status IS DISTINCT FROM NEW.status`).
**Confidence: high (proven).** The guard is correct for suppressing a re-fire of
the 00432 dispatch, but it also suppresses evidence propagation. Probed: a party
row mirrored from an evidence-free `granted` still carried
`sms_consent_evidence = NULL` after a second `granted` that *did* carry evidence.
If anything downstream reads the mirrored evidence (the invite dispatch does, for
`pending`), it can read stale or absent. Guard on the evidence set too, or
`IS DISTINCT FROM` the whole tuple.

#### m6 — the two consent writers disagree about `origin_project_id` precedence
`00594:315` (`COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)` — new
wins) vs `pipeline.ts` `writeChannelConsent` (`prior.origin_project_id ?? t.projectId`
— prior wins). **Confidence: high.** Consequence for R-Q: "Opted out by text,
3 Dec 2025, on the Lindqvist kitchen." will name the *grant's* job, not the STOP's,
whenever a grant preceded the STOP. One column cannot carry both jobs; pick one
rule (probably: the origin follows the current verdict) and apply it in both
writers.

#### m7 — `tax_id_last4 char(4)` blank-pads
`00592:101`. **Confidence: medium.** `char(n)` right-pads; `'123'` stores as
`'123 '` and compares equal to `'123'` under `bpchar` rules but not after a cast
to `text`. Every other text column in the wave is `text`. Use `text` with a
`CHECK (tax_id_last4 ~ '^[0-9]{4}$')`.

#### m8 — affiliations' SELECT/DELETE gate only on the person's org
`00592:212-215`, `:231-234`, `:242-245`. **Confidence: medium.** Only the
INSERT/UPDATE `WITH CHECK` pins the two cards to one studio (`:224-227`,
`:235-238`) — good, and the wave's own test proves it. But a row written by
service_role (or by a future migration) straddling two studios is visible to the
person's studio and invisible to the company's, with no way for the company's
studio to see or remove it. Add the same equality to the USING legs.

#### m9 — `Consent.evidence_file` not carried
`crm-model.md` §2 (CS4-18, "the form itself cannot be attached today") lists an
`evidence_file`; 00594 carries only `evidence text`. **Confidence: high.**
Probably intentional deferral; not named anywhere.

#### m10 — a studio that holds the number only on a rolodex card gets no opt-out record
`pipeline.ts` `studiosHoldingPhone` derives studios from `project_parties` rows
only, never from `studio_contact_channels` (00593). **Confidence: medium.** After
W2 puts the number on a card without a seat, a STOP will leave that studio's
record absent; the room prints nothing rather than "Opted out".

#### m11 — the 00592–00594 collision is live, not hypothetical
**Confidence: high (observed).** During this review the shared local stack was
twice re-seeded by a concurrent wave whose migrations occupy **the same three
numbers** — after its reset the ledger read `00594` while
`studio_channel_consent` did not exist and `project_time_entries` did:

```
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
 00594 / 00593 / 00592
$ psql … -c "select tablename from pg_tables where schemaname='public' and tablename like 'studio_%';"
 studio_contacts, studio_agreement_parts, …   (none of the four new tables)
$ psql … -c "select tablename from pg_tables where schemaname='public' and tablename like '%time_entr%';"
 project_time_entries
```

A textbook instance of the "verify by probing objects, never by the ledger" rule.
The report discloses the collision (§5) and the renumber is owed at integration;
recorded here so the integrator does not read a green ledger as proof.

#### m12 — deploy-order coupling not named in the report's redeploy list
`sms.ts:206-215` queries `studio_channel_consent` unconditionally. If any of the
four `_shared/sms.ts` importers (`sms-dispatch`, `site-request-dispatch`,
`field-daily`, `sms-inbound`) is redeployed before 00594 lands on Strata, the
query errors, `data` is null, and the function falls through to the party-row scan
— fail closed, so nothing breaks, but the W7 chain should still state
**migrations before functions**. **Confidence: medium.**

#### m13 — the W1a report's probe output is not reproducible on the shared stack
**Confidence: high (observed).** See m11: the brief asserts this wave owns the
local stack; it does not. Every probe in `w1a-report.md` §3 needed a fresh
`supabase:reset` from this worktree to reproduce. All of them did reproduce once
reset — no claim in §3 was found to be false.

#### m14 — the backfills exercise nothing locally
`w1a-report.md:308-312` discloses it; confirmed independently (`INSERT 0 0` ×4 in
00593, `backfill… → 0` in 00594, with zero `project_parties` rows and no
card carrying a phone in the seed set). **Confidence: high.** The precedence rule
that the whole room now rests on is proven only against the SQL test's own
fixture. Before the Strata push, consider a dry-run `SELECT` of the `ranked` CTE
against prod data so the fold is seen before it is taken.

---

## 4. Not findings (checked, clean)

- `normalize_studio_contact_channel` is `SECURITY INVOKER` with no EXECUTE grant to
  `authenticated`. Correct: trigger-function EXECUTE is checked at `CREATE TRIGGER`,
  not at fire time, and the posture copies `00281`'s `normalize_party_phone_e164`.
- The normalising trigger runs before the `ON CONFLICT` arbiter is evaluated, so
  the 00593 backfill really does dedupe three spellings of one number:
  `(612) 555-0142`, `612-555-0142`, `+1 612 555 0142` → **1 row**, value
  `+16125550142` (probed).
- An unparseable phone keeps its trimmed raw text (`'  ext 4  '` → `'ext 4'`),
  as `00593:14-16` claims (probed).
- `ON CONFLICT DO NOTHING` on a re-run inserts zero rows, so the mirror does not
  fire on a plain migration replay — B1/M1 need a genuinely new fold row.
- `mirror_channel_consent_to_parties` cannot loop: `project_parties` carries only
  `set_updated_at`, `normalize_phone_project_parties` (BEFORE) and
  `fc_optin_invite_dispatch`, none of which writes `studio_channel_consent`.
- `idx_project_parties_phone_e164` exists, so the mirror's UPDATE is indexed.
- No client-facing RLS branch anywhere in the wave; `anon` is fully revoked. PR-w
  is not yet in play (the site access card is W-later, correctly listed as out of
  scope).
- `fake-supabase.ts`'s composite-`onConflict` change is backward compatible for
  single-column callers (`cols.length === 1` reduces to the old predicate) and the
  full 40-test run is green.
