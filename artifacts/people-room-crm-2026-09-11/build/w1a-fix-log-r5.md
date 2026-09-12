# W1a — fix log, round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact.
`ls apps/*/.env.local` → `no matches found` (checked before the reset).

Scope: the five round-5 findings the orchestrator ruled on — **B5-1 (R-AL)**,
**M5-1 (R-AM)**, **M5-2 (R-AN)**, **M5-3 (R-AO)**, **M5-4 (R-AP)**. Nothing
else was changed; the nine minor findings (m5-1 … m5-9) are untouched.

---

## B5-1 (R-AL) — the write door erased a refusal that lived only on a party row

`supabase/migrations/00594_studio_channel_consent.sql`

### What changed

`record_channel_consent()` now reads the same two ledgers the send gate reads.

1. **A pre-write test (`2a`, after the evidence gate)**: when `p_status =
   'granted'`, it asks whether any `project_parties` row on the normalised
   value, in THIS organization, says `opted_out` with a dated `sms_opt_out_at`
   — scoped by `COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))`,
   exactly as the mirror scopes, so R-AK is not re-opened. If one does and the
   record does not already say `opted_out`, it raises `channel_opted_out`. This
   is the leg that covers the INSERT case the reviewer proved: no record yet, a
   refusal on a seat only, which the `ON CONFLICT … WHERE` never sees.
2. **The same test inside the upsert's `DO UPDATE … WHERE`**, so a seat marked
   `opted_out` between that read and this write cannot be written over either.
3. **`IF NOT FOUND` disambiguation**: a write refused by the new leg raises
   `channel_opted_out` (with the seat-specific HINT) rather than printing as
   `consent_awaiting_recipient`.
4. The banner's item 2 and the function `COMMENT` now say the door reads both
   ledgers, and name the way past: record the refusal (`opted_out`, with its own
   evidence), then `record_channel_reconsent()` and the recipient's own
   YES/START.

### Evidence — the reviewer's own repro, re-run and rolled back (`$TMPDIR/r5probe.sql`)

```
=== before: the seat holds the refusal; no consent record exists ===
 sms_consent_status | dated
--------------------+-------
 opted_out          | t
 consent_records
               0
=== an ordinary studio member calls record_channel_consent(granted) ===
NOTICE:  REFUSED -> channel_opted_out
=== after: the seat that held the refusal ===
 sms_consent_status |     sms_opt_out_at     | sms_consent_source |      sms_consent_evidence
--------------------+------------------------+--------------------+--------------------------------
 opted_out          | 2026-04-01 00:00:00+00 | verbal             | A verbal STOP the studio heard
 consent_records
               0
```

Before this round that call printed `ACCEPTED`, the seat read `granted` with a
NULLed `sms_opt_out_at` and the studio's new words, and `channelConsentVerdict`
then returned `"allow"`.

New SQL **block 19**: the grant is refused (19a); no record is minted and the
seat survives byte for byte (19b/19b2); recording the refusal is accepted and
stands unanswered, a grant is still refused, `reconsent()` is still the door
(19c…19c3); and **Beta's** dated refusal on a different number does not refuse
Alpha's first grant on it, nor does Alpha's grant reach Beta's seat (19d/19d2 —
R-AK held).

---

## M5-1 (R-AM) — the edge rail resolved orgs through a function revoked from it

`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`

### What changed

1. **`_primary_studio_for` is gone from the rail.** New private
   `primaryStudioFor()` reads `organization_members` (status `active`) and
   `organizations` (`type = 'design_studio'`) and ranks them the way 00315's
   own body ranks them — owner role first, then `joined_at` NULLS LAST, then
   `created_at` — which is the shape `resolveStudioName()` already used.
2. **A failed resolve is not a NULL org.** `resolveProjectOrg()` now returns
   `{ org, failed }` and `orgsOfProjects()` returns `{ orgs, failed }`; every
   call site checks it:
   * `channelConsentVerdict()` — `failed` ⇒ `console.error` + `"refuse"`
     (taking the no-studio branch would answer this send out of every tenant's
     rows). A failed read of `studio_channel_consent` refuses the same way.
   * `orgHasOptedOutParty()` — a failed party-row read, or an opted-out seat
     that could not be attributed to a studio, counts against the send.
   * `studiosHoldingPhone()` (pipeline) — logs which projects could not be
     attributed; the phone-global party-row write and `studiosHoldingRecord()`
     still carry the keyword.
3. **The stubs are gone from the tests.** The three cases that used
   `{ _primary_studio_for: … }` in `fake-supabase` now seed real
   `organization_members` / `organizations` rows — the query shape the rail
   actually issues.

### Evidence

The revocation, still true on the reset stack:

```
$ psql … -Atc "select proacl from pg_proc where proname='_primary_studio_for'"
{postgres=X/postgres}
```

Renamed/rewritten: `a NULL-studio_id project resolves its org from
organization_members` (a vendor org the designer also belongs to is present and
is not picked), `the stale-record scan resolves a NULL-studio_id project from
organization_members`, `STOP reaches a NULL-studio_id project through the
designer's primary studio`.

New: `the primary studio is the owner-role design_studio, read off the tables`
(owner beats an earlier-joined membership; a `removed` membership is not a
candidate) and `a failed org resolve refuses the send instead of reading as no
studio` (`resolveProjectOrg` returns `{org:null, failed:true}`, and
`sendPartySms` over a client blind to `projects` does not send).

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

---

## M5-2 (R-AN) — the inbound grant nulled the disclosure version and the recorder

`supabase/migrations/00594_studio_channel_consent.sql`,
`supabase/functions/sms-inbound/pipeline.ts`

### What changed

1. **The mirror COALESCEs every evidence column.** `source`, `evidence`,
   `recorded_at`, `disclosure_version` and `recorded_by` are written as
   `COALESCE(NEW.x, pp.x)`; the verdict and its two dates are still copied
   outright. The guard tuple compares against the values the write would
   actually leave, so a NULL the COALESCE is not going to write no longer counts
   as a difference.
2. **The rail falls back to the studio's own seats.** New
   `seatConsentEvidence(supabase, partyIds)` reads
   `sms_consent_disclosure_version` / `sms_consent_recorded_by` off the target
   studio's own party rows; `writeChannelConsent()` writes
   `prior.disclosure_version ?? seat.disclosureVersion` and
   `prior.recorded_by ?? seat.recordedBy` (and now selects `recorded_by` in its
   read-then-upsert, which it did not before, so it no longer left that column
   to chance).
3. The mirror's `COMMENT` says refresh-never-erase.

### Evidence

New SQL **block 18**: a seat carrying `written / Signed the studio's field-SMS
form / field-sms-v1 / <recorder>` takes a rail-shaped record
(`granted, inbound_sms, 'Replied YES', disclosure_version NULL, recorded_by
NULL`). After the mirror the seat reads `granted / inbound_sms / Replied YES`
**and still** `field-sms-v1` and the original recorder (18a–18d).

**Block 10b widened to all five columns** (it checked three): both seats on
`+16125550155` must carry source, evidence, recorded_at, `disclosure_version =
'field-sms-v1'` and `recorded_by = <alice>`. The old global hollow-evidence
check survives as 10b2.

New Deno test: `an inbound YES carries the seat's disclosure version and
recorder onto the record` — the minted record reads `field-sms-v1` / `dz1`.

---

## M5-3 (R-AO) — moving the legacy pointer silently closed the other firm

`supabase/migrations/00592_people_cards_affiliations_rules.sql`

### What changed

`sync_person_affiliation_from_pointer()` now opens or closes ONLY the
affiliation the pointer names.

* Setting the pointer opens that affiliation (dated today,
  `ON CONFLICT … DO NOTHING`) and **no longer closes the siblings** — the
  `UPDATE … WHERE company_id <> NEW.company_id` is gone.
* Clearing the pointer closes only the affiliation `OLD.company_id` named, then
  re-derives the pointer (`_sync_person_company_pointer`) so a surviving sibling
  becomes the pointer rather than leaving a NULL pointer beside a standing fact.
  `OLD.company_id IS NULL` closes nothing — that is a pointer that had already
  drifted, and the re-derive simply lets it catch up.
* The `:391-393` comment stands; the `studio_person_affiliations` table COMMENT,
  the `studio_contacts.company_id` column COMMENT and the function COMMENT all
  now state N persons × N firms and that neither trigger closes a row it was not
  pointed at.

### Evidence

Standalone probe, rolled back — the reviewer's fixture, with the opposite ending:

```
=== M5-3: two open affiliations, the shipped card editor moves the pointer ===
    company_name    | from_date  | to_date
--------------------+------------+---------
 Northgate Electric | 2025-01-01 |
 Marrow & Sons      | 2026-01-01 |
```

(Before: `Marrow & Sons … 2026-09-11` — closed, silently.)

New SQL **block 20**: two open affiliations, pointer on the most recently begun
(20a); the card editor moves the pointer, both stay open, the pointer reads what
the designer picked (20b–20b3); clearing the firm closes only the named one, the
sibling survives, and the pointer re-derives onto it (20c–20c3).

Block 12b (`clearing the pointer must close the open affiliation`) still passes:
that person holds exactly one open affiliation, and it is the one the pointer
names.

---

## M5-4 (R-AP) — the three designated-person FKs took any card at all

`supabase/migrations/00592_people_cards_affiliations_rules.sql`

### What changed

New `public.assert_studio_contact_designations()` — SECURITY DEFINER,
`SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`,
in the shape of `assert_affiliation_card_kinds()` — fired
`BEFORE INSERT OR UPDATE OF paperwork_contact_person_id, signer_person_id,
site_contact_person_id, organization_id ON public.studio_contacts`. Each
non-NULL designation must be a `person` card in the same `organization_id` and
must not be the row itself:

* `designated_person_is_self`
* `designated_person_not_a_person`
* `designated_person_other_studio`

(`organization_id` is in the `UPDATE OF` list so moving a card between studios
re-checks.) The file banner and a function COMMENT carry the reason.

### Evidence

```
=== M5-4: a cross-studio / company / self designation ===
NOTICE:  REFUSED -> designated_person_is_self
```

New SQL **block 21**: another studio's card (21a → `designated_person_other_studio`),
a COMPANY card as signer (21b → `designated_person_not_a_person`), the row itself
(21c → `designated_person_is_self`), the INSERT path (21d), and a well-formed
same-studio person card accepted on all three columns (21e).

---

## Verification, this round

```
$ pnpm --dir …/agent-people-build supabase:reset          # sandbox off (telemetry.json EPERM)
… Applying migration 00592 / 00593 / 00594 …
Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1 … 21 passed      (22 "passed" notices, 16B included)
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 66 passed | 0 failed (127ms)          (63 before this round; +3)

$ deno check --config supabase/functions/deno.json _shared/sms.ts sms-inbound/pipeline.ts
Check … / Check …                          (clean)

# idempotency: the three files re-executed over the migrated DB, one rolled-back txn
$ { echo 'BEGIN;'; cat 00592 00593 00594; echo 'ROLLBACK;'; } | psql … -v ON_ERROR_STOP=1 -f -
exit=0 ; ^ERROR lines: 0 ; last statements: REVOKE / GRANT / COMMENT / ROLLBACK

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2631 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 6 ++++++     ← the new REVOKE, and only it

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat HEAD -- packages/supabase/src/database.types.ts
(empty)                                            ← no column or table changed this round
```

## Report corrections

`build/w1a-report.md` decision 10 and the edge-function section said the rail
resolves the org through `_primary_studio_for`; both now say it reads
`organization_members`/`organizations`, that the RPC is revoked from every
PostgREST role, and that a failed resolve is a logged refusal. The three test
sentences naming the stubbed RPC were rewritten, and the new r5 cases added.

## Still open, unchanged by this round

The nine minor findings m5-1 … m5-9. Two of them are now MORE stale because of
this round and are worth handing back: **m5-7** (report §3 prints "61 passed"
for the Deno suites — the real number is now **66** — and "465 insertions" for
the types diff, which has been 474 since r4) and **m5-9** (a `service_role`
DELETE of a consent record still leaves the mirrored seats frozen).

---

# W1a fix log — the R5 round (R5-M1, R5-M2)

Scope: exactly the two findings handed to this round. Nothing else was touched.
Local stack only — no `supabase db push`, no `supabase functions deploy`, no
Strata contact. `ls apps/*/.env.local` → `no matches found` (checked before the
first reset).

> **Path note.** The brief named `w1a-fix-log-r5.md`; this round's section is
> appended here, the way the W4 round appended its own to `w1a-fix-log-r4.md`.

---

## R5-M1 — the seat read the studio's consent as the refusal

`supabase/migrations/00594_studio_channel_consent.sql`
(`mirror_channel_consent_to_parties()`),
`supabase/tests/people/w1a_identity_channels_consent_test.sql` (blocks 4 and 27)

### The hole

W4-M2 gave the RECORD a second evidence set — `opt_out_source` /
`opt_out_evidence` / `opt_out_recorded_at` / `opt_out_recorded_by` — and kept
`record_channel_reconsent()` off it. `project_parties` has no second set. The
mirror was still copying the record's CONSENT columns onto the seat under every
verdict, `opted_out` included, so the studio's own fresh paperwork landed on the
seat as the refusal's source and words. The seat is what every shipped surface
reads (W1a ships no hook for `studio_channel_consent`), so R-Q's sentence read
off the seat became "Opted out in writing" — the studio's consent named as the
refusal — and the 10DLC artifact of how the STOP arrived was gone from the only
copy those surfaces see.

Demonstrated against the PRE-FIX function body (`pg_get_functiondef`, the four
`v_seat_*` terms swapped back to `NEW.<consent>`, loaded inside a transaction
and rolled back):

```
--- seat after the STOP ---
 opted_out | inbound_sms | Replied STOP
--- seat after the studio reconsent ---
 opted_out | written     | Signed consent form 11 Sep 2026     ← the refusal, in the studio's words
```

### What changed

`mirror_channel_consent_to_parties()` decides the seat's evidence from the
verdict it is mirroring. Four locals are computed once, before the UPDATE:

```sql
IF NEW.status = 'opted_out' THEN
  v_seat_source      := COALESCE(NEW.opt_out_source,      NEW.source);
  v_seat_evidence    := COALESCE(NEW.opt_out_evidence,    NEW.evidence);
  v_seat_recorded_at := COALESCE(NEW.opt_out_recorded_at, NEW.recorded_at);
  v_seat_recorded_by := COALESCE(NEW.opt_out_recorded_by, NEW.recorded_by);
ELSE
  v_seat_source      := NEW.source;  …
END IF;
```

and the UPDATE writes `COALESCE(v_seat_<x>, pp.sms_consent_<x>)` — refusal side
first, then the record's consent set (the legacy rows minted before `opt_out_*`
existed), then what the seat already holds, so R-AN's "never a NULL over a
non-null" still stands. The same four expressions went into the tuple guard,
or a refusal arriving with its own words would have been suppressed as identical
to the consent set already on the seat. `sms_consent_disclosure_version` has no
refusal-side twin — it belongs to the disclosure the person was shown, not to
how they refused — so it still comes from `NEW.disclosure_version`.
`COMMENT ON FUNCTION` says all of this.

### Evidence

Same fixture, post-fix:

```
--- seat after the STOP ---
 opted_out | inbound_sms | Replied STOP
--- seat after the studio reconsent ---
 opted_out | inbound_sms | Replied STOP | field-sms-v1   ← the disclosure version still mirrors
--- seat after a grant (the swap is scoped to refusals) ---
 granted   | written     | Kickoff form
```

SQL test, both amended blocks:

- **Block 4** — `4d` asserted the OPPOSITE of the ruling (it required both Alpha
  seats to carry `'Fresh written consent'` under `opted_out`) and failed on the
  first run after the fix; it now asserts `sms_consent_source = 'inbound_sms'`
  and `sms_consent_evidence = 'STOP'` on both seats, with a new `4d3` asserting
  the record carries BOTH sets at once.
- **Block 27** — `27c2` rewritten to the same assertion; new `27c3` (the
  disclosure version still mirrors), `27d3` (a second reconsent does not reach
  the seat either) and `27h` (a `granted` verdict mirrors the consent set, so
  the swap is scoped).

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
…
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's
         own evidence standing (r8 W4-M2), and the seat carries the refusal's own words
         too (r9 R5-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

28 blocks, all green (run twice: after the edit, and again after a second full
`supabase:reset`).

No GRANT or REVOKE changed. `python3 scripts/generate-legacy-grants.py` was
re-run anyway — `supabase/seed/00-legacy-grants.sql` came back byte-identical
(`git diff --stat` empty, "baseline + 2632 replayed statements").

`db:generate` after the reset leaves `packages/supabase/src/database.types.ts`
unchanged (`git diff --stat packages/supabase/src/database.types.ts` → empty):
the change is a function body, no column and no signature.

---

## R5-M2 — the report had fallen three rounds behind

`artifacts/people-room-crm-2026-09-11/build/w1a-report.md`,
`artifacts/people-room-crm-2026-09-11/build/probe10-r9-fold-dry-run.sql` (new)

### What changed

**§1.** The 00592 row gained `assert_studio_contact_designations()` (r5 R-AP),
`assert_studio_contact_rule_route()` (r6 M6-4) and the two
`studio_contact_rules` channel CHECKs (r6 M6-5). The 00594 row gained the
refusal's own evidence set — the four `opt_out_*` columns and
`studio_channel_consent_opt_out_source_check` — and the sentence naming its
three writers and the one door that must never touch it. The legacy-grants line
was 186 lines / 2628 statements; it is 210 / 2632. The "grep found nothing
before I wrote them" list gained the three new names.

**§2.** Two decisions appended. **21** is the W4 round: (a) the fold asks the
refusal of every seat in the group rather than of the winning row, with
`refusal_unanswered` coming off a LEFT JOIN to the new `refusal` CTE; (b) the
refusal's own evidence set on the record, with the three writers that fill it
and reconsent's hands-off rule. **22** is this round's R5-M1: the mirrored
refusal carries its own words onto the seat.

**§3.** Every output re-taken against a fresh reset. The functions table was 15
rows and is 18 (`assert_studio_contact_designations`,
`assert_studio_contact_rule_route`, `channel_value_was_on_sms_rail` had all
shipped without reaching it). The triggers block gained
`assert_studio_contact_rule_route_trg` and a second listing for
`studio_contacts`, plus the nineteen `studio_channel_consent` columns and the
six CHECK constraints. The SQL transcript ended at block 17 and now runs to 28
(1–27 plus 16B), with a paragraph covering blocks 18–27. Deno: `61 passed` →
**71 passed** (36 in `sms.test.ts`, 35 in `_tests/sms-inbound.test.ts`), the
whole-directory run `684` → **694 passed | 1 failed** (the pre-existing
`stripe-rail.test.ts` env failure). Types: `465` → **508 insertions**, with the
four `opt_out_*` columns named.

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (105ms)

$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
```

**§5 — the pre-push dry run.** This was the serious half. The instruction told
the operator to read the fold as a bare
`SELECT org, phone_e164, sms_consent_status FROM ranked WHERE rn = 1` — the
winning seat only, which cannot show `refusal_unanswered`: the column the
`refusal` CTE's LEFT JOIN decides, the one behaviour W4-M1 changed, and the one
that decides whether a studio may text the number at all after the fold. §5 now
carries the JOINed query and points at a runnable script,
`build/probe10-r9-fold-dry-run.sql` (the function's own CTE chain verbatim,
INSERT replaced by SELECT, plus a status × unsendable count).

It runs clean locally (0 rows — no seeded party phones). On the W4-M1 fixture —
two seats on one number in one studio, a clean 2026 grant and a legacy row
reading `granted` while carrying an unanswered 2025-11-16 opt-out — the two dry
runs disagree, which is the whole point:

```
NEW: org … | +16125550777 | granted | refusal_unanswered = t
            inbound_sms | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00
            granted | unsendable 1 | records 1
OLD: org … | +16125550777 | granted
```

The old dry run hands the operator a sendable-looking `granted`; the new one
says the record about to be minted is UNSENDABLE until the recipient's own
YES/START.

---

## Gates run

```
$ pnpm --dir <worktree> supabase:reset                    # full replay + seeds, twice
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
  → 28 blocks, All W1a assertions passed
$ deno test … _shared/sms.test.ts _tests/sms-inbound.test.ts   → ok | 71 passed | 0 failed
$ SUPABASE_DB_URL=… pnpm --dir <worktree> db:generate
$ git diff --stat packages/supabase/src/database.types.ts       → empty
$ python3 scripts/generate-legacy-grants.py                     → byte-identical
```

## Files touched

```
supabase/migrations/00594_studio_channel_consent.sql            mirror_channel_consent_to_parties() + its COMMENT
supabase/tests/people/w1a_identity_channels_consent_test.sql    blocks 4 and 27 amended (4d/4d3, 27c2/27c3/27d3/27h)
artifacts/.../build/w1a-report.md                               §1, §2 (decisions 21–22), §3 re-taken, §5 dry run
artifacts/.../build/probe10-r9-fold-dry-run.sql                 new — the runnable pre-push dry run
artifacts/.../build/w1a-fix-log-r5.md                           this section
```
