# W1a — round 3 review fixes: M3-1 / M3-2 / M3-3 / M3-4 / F3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, on top of `9b570a36f`.

Applied per the orchestrator's binding rulings **R-AG, R-AH, R-AI, R-AJ, R-AK**
(`artifacts/people-room-crm-2026-09-11/rulings.md`). Nothing else from the r3
reviews was taken.

Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact, no `.env.local` repoint — `apps/designer-portal/.env.local` does
not exist in this worktree (checked before the first reset):

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

Files touched:

```
supabase/migrations/00592_people_cards_affiliations_rules.sql
supabase/migrations/00594_studio_channel_consent.sql
supabase/functions/_shared/sms.ts
supabase/functions/_shared/sms.test.ts
supabase/functions/sms-inbound/pipeline.ts
supabase/functions/_tests/sms-inbound.test.ts
supabase/tests/people/w1a_identity_channels_consent_test.sql
supabase/seed/00-legacy-grants.sql        (regenerated, never hand-edited)
packages/supabase/src/database.types.ts   (regenerated)
artifacts/people-room-crm-2026-09-11/build/w1a-report.md
```

---

## M3-1 (R-AG) — `record_channel_consent(…,'not_asked')` erased a grant and its whole evidence set

**What changed**, in `00594_studio_channel_consent.sql`:

1. `not_asked` is refused as a target status, one gate before the transition
   check (`:578-586`). It stays a legal value in the table's CHECK (the backfill
   mints it) and a legal thing to read (the chip still prints "Not asked") — no
   studio act may write it.

```sql
  -- R-AG. `not_asked` is the absence of a record; recording it is not an act
  -- the studio can perform, and taking it here destroys the evidence set both
  -- on the record and on every mirrored seat.
  IF p_status = 'not_asked' THEN
    RAISE EXCEPTION 'consent_not_recordable'
      USING HINT = 'There is nothing to record: not_asked is the absence of a '
                   'consent, not a verdict. Record the verdict that actually '
                   'happened (pending / granted / opted_out).';
  END IF;
```

2. No write may empty the evidence set. The `v_same` CASE arms became plain
   COALESCEs, and `recorded_by` joined them:

```sql
      source             = COALESCE(EXCLUDED.source, scc.source),
      evidence           = COALESCE(EXCLUDED.evidence, scc.evidence),
      recorded_at        = EXCLUDED.recorded_at,
      disclosure_version = COALESCE(EXCLUDED.disclosure_version, scc.disclosure_version),
      recorded_by        = COALESCE(EXCLUDED.recorded_by, scc.recorded_by),
```

   Laundering (r2's B-2 concern) is closed by the evidence gate instead of by
   nulling: every status the door still accepts must supply its own source and
   evidence, so a status CHANGE has already restated them by the time it reaches
   the write. The only field a change may legitimately omit is
   `disclosure_version` on an `opted_out` — a refusal is shown no disclosure,
   and the version the person WAS shown is a fact the audit still needs. The
   declared `v_same` is gone (unused); the banner, the section-4 doctrine block
   and the function COMMENT all say the new rule.

**Proof, as an ordinary studio member** (the reviewer's own scenario, two
mirrored seats on the number; `$TMPDIR/probe_rag.sql`, whole thing rolled back):

```
--- A. a grant with its full evidence set
 status  | source  |      evidence       | disclosure_version | stamped
---------+---------+---------------------+--------------------+---------
 granted | written | Signed kickoff form | field-sms-v1       | t

--- B. the four-argument not_asked call the reviewer used to erase it
NOTICE:  refused: consent_not_recordable

--- C. the record, untouched
 status  | source  |      evidence       | disclosure_version
---------+---------+---------------------+--------------------
 granted | written | Signed kickoff form | field-sms-v1

--- D. and both mirrored seats still carry the 10DLC evidence
                  id                  | sms_consent_status | sms_consent_source | sms_consent_evidence | sms_consent_disclosure_version
--------------------------------------+--------------------+--------------------+----------------------+--------------------------------
 e8000000-0000-4000-8000-000000000001 | granted            | written            | Signed kickoff form  | field-sms-v1
 e8000000-0000-4000-8000-000000000002 | granted            | written            | Signed kickoff form  | field-sms-v1

--- E. an opt-out that restates its own words but no disclosure version
  status   | source |        evidence         | disclosure_version
-----------+--------+-------------------------+--------------------
 opted_out | verbal | Told me on site to stop | field-sms-v1
```

**Tests.** SQL block 9d/9d2/9d3 rewritten (the old 9d asserted the erasure was
correct), 9e's expected error updated — `not_asked` is now refused one gate
earlier, so `opted_out → not_asked` raises `consent_not_recordable` rather than
`channel_opted_out`. Both still refuse.

---

## M3-2 (R-AH) — the deferred-send path never read the studio's consent record

**What changed**, in `_shared/sms.ts`: `flushDeferredMessages()` now runs the
same two gates as `sendPartySms()`, in the same order, keyed off the deferred
row's own `party_id` (the select at `:820` already reads it):

```ts
    let deferredProjectId: string | null = null;
    if (row.party_id) {
      const { data: deferredParty } = await supabase
        .from("project_parties").select("project_id").eq("id", row.party_id).maybeSingle();
      deferredProjectId = (deferredParty as { project_id?: string | null } | null)?.project_id ?? null;
    }
    const verdict = await channelConsentVerdict(supabase, phone, deferredProjectId);
    if (verdict === "refuse") { …suppressed "opted_out"…; continue; }
    const studioGranted = verdict === "allow";
```

and `studioGranted` lifts the two positive party-row gates below it
(`!studioGranted && consent !== "pending" && …`, `!studioGranted && consent !==
"granted"`), exactly as in `sendPartySms`.

**Tests** (`_shared/sms.test.ts`), both new and both failing before the change:

```
flush: the studio's granted record carries a deferred send the party row would refuse ... ok
flush: the studio's opted-out record suppresses a deferred send the party rows would allow ... ok
```

The first is the fail-closed half (F-11's seat sits at `not_asked`; the
studio's own grant now survives quiet hours). The second is the fail-open half
(the owning studio's record says `opted_out`; another studio's granted row on
the same number no longer carries the send).

---

## M3-3 (R-AI) — two homes for "which firm is this person at"

**What changed**, in `00592_people_cards_affiliations_rules.sql`, after the
affiliations table's grants:

1. **Backfill.** Every person already linked through `studio_contacts.company_id`
   gets one OPEN affiliation (`to_date` NULL), pinned to one studio the way the
   RLS `WITH CHECK` pins it:

```sql
INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
SELECT p.id, p.company_id, NULL, NULL
  FROM public.studio_contacts p
  JOIN public.studio_contacts c ON c.id = p.company_id
 WHERE p.company_id IS NOT NULL
   AND p.entity_kind = 'person'
   AND c.organization_id = p.organization_id
ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;
```

2. **The pointer, kept equal.** `sync_studio_contact_company_pointer()` (AFTER
   INSERT/UPDATE/DELETE on the affiliations, both sides on a row that moves
   person) defers to `_sync_person_company_pointer(uuid)`, which re-derives
   `studio_contacts.company_id` from the person's open affiliation (most
   recently begun; NULL when there is none). One direction only. Both are
   SECURITY DEFINER with `search_path` pinned, and both are revoked from
   `PUBLIC, anon, authenticated` — the trigger runs as the definer owner and
   `_sync_person_company_pointer` takes a caller-supplied person id:

```
               proname               | secdef |        config        | anon_exec | auth_exec
-------------------------------------+--------+----------------------+-----------+-----------
 _sync_person_company_pointer        | t      | {search_path=public} | f         | f
 sync_studio_contact_company_pointer | t      | {search_path=public} | f         | f
```

3. **COMMENTs** on both, as ruled: the table COMMENT says it is the home and the
   one the room reads (the company card's crew list, R-W); the new
   `COMMENT ON COLUMN studio_contacts.company_id` says it is a derived pointer
   kept for legacy readers and that a direct write to it is overwritten by the
   next affiliation write.

**Proof — the REAL migration statement over legacy-shaped data** (fixture
created, then `\i migrations/00592_…sql`, all rolled back):

```
--- BEFORE: affiliations for the legacy-linked person
 affiliations
--------------
            0

--- AFTER the REAL 00592 backfill: one open row, and the pointer agrees
              person_id               |              company_id              | open |               pointer
--------------------------------------+--------------------------------------+------+--------------------------------------
 c9000000-0000-4000-8000-000000000001 | c9000000-0000-4000-8000-000000000002 | t    | c9000000-0000-4000-8000-000000000002

--- and the trigger re-derives the pointer when the person leaves
 pointer_after_leaving
-----------------------

```

**Tests.** New SQL block 12 (`12a` open → pointer set, `12a2` block 1's own
affiliation moved its person's pointer too, `12b` a direct legacy write to the
column does not survive the next affiliation write, `12c` closing clears it,
`12d` deleting clears it, `12e` the fold leaves exactly one open row and a
re-run adds nothing, `12f` no person card anywhere points at a firm it has no
open affiliation with).

**Not taken** (outside the ruling): the shipped hooks still write `company_id`
directly; they are not repointed here. The trigger makes that write transient
rather than authoritative, and the COMMENT says so.

---

## M3-4 (R-AJ) — the inbound START manufactured consent for a studio that never asked

**What changed**, in `sms-inbound/pipeline.ts`: the START target set is now the
studios whose own record for that number is `opted_out` (the refusal it lifts)
or `pending` (the invite it answers). The seat-derived arm survives only to
carry each qualifying studio's party rows:

```ts
    const startOrgs = await studiosHoldingRecord(supabase, from, ["opted_out", "pending"]);
    const startOrgSet = new Set(startOrgs);
    const startTargets = withRecordOnlyStudios(
      (await studiosHoldingPhone(supabase, await loadPhoneParties(supabase, from)))
        .filter((t) => startOrgSet.has(t.org)),
      startOrgs,
    );
```

The code comment that carried the false claim is replaced by one that states
what the code does. The report sentence is corrected too (§1, `sms-inbound`
bullet) — see below.

**Tests** (`_tests/sms-inbound.test.ts`), three new:

```
START does not grant a seat-holding studio whose record never left not_asked ... ok
START grants a studio whose record is pending (the invite it answers) ... ok
START mints no consent record for a seat-holding studio that has none ... ok
```

The first also asserts the seat-holding `not_asked` studio gains no `granted`
party row, so the record and the mirror still agree. The two pre-existing START
tests (`START re-grants per studio…`, `START lifts a seatless opted_out record…`)
pass unchanged — both studios in them hold `opted_out` records.

**Consequence, recorded in the report's "Not done":** a studio with a seat but
no record at all cannot be re-subscribed by a START. In practice a STOP writes an
`opted_out` record for every studio holding the number, so the studios a START
can answer always have one.

---

## F3 (R-AK) — the no-record fallback reduced across tenants

**What changed**, in `_shared/sms.ts`: `channelConsentVerdict()`'s no-record
branch is scoped to the resolving studio's own party rows, through the
`orgHasOptedOutParty()` helper the stale-record scan already uses:

```ts
  // No record for this studio yet (the backfill has not reached this pair):
  // fail closed on a refusal already on this studio's own books.
  if (org) {
    return (await orgHasOptedOutParty(supabase, phone, org)) ? "refuse" : "unknown";
  }

  // No studio resolves at all — nothing to scope to, so the reduction stays
  // phone-global here and only here.
```

The doc comment above the function now says the fallback reduces across the
studio's own projects, never across tenants, and names the one surviving
phone-global case. `w1a-report.md` §1's `sms.ts` bullet and the decision log say
the same (decision 13, new).

**Tests** (`_shared/sms.test.ts`): the existing "with no studio record, an
opted-out sibling party row still blocks (fail closed)" was the reviewer's own
exhibit — its sibling's project had no `studio_id`, so it proved nothing about
studio boundaries. It is renamed and its fixture now gives both projects
`org-alpha`, and two new cases sit beside it:

```
with no studio record, an opted-out sibling party row in the SAME studio still blocks (fail closed) ... ok
with no studio record, ANOTHER studio's opted-out party row does not block ... ok
with no record and no resolvable studio, any opted-out row on the number still blocks ... ok
```

---

## Verification, in full

```
$ pnpm --dir .codex/worktrees/agent-people-build supabase:reset
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[...29 seed files...]
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

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
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 26 passed | 0 failed (42ms)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 32 passed | 0 failed (26ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 681 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
```

(`stripe-rail.test.ts` is the pre-existing failure documented in the report: it
wants env from `_tests/test.env`, which a bare `deno test` does not load. It
fails identically with these edits stashed. 674 → 681 passed is the seven new
cases.)

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts

# idempotency: all three migration files re-executed TWICE more over the
# migrated DB, in one rolled-back transaction
$ { echo "BEGIN;"; for i in 1 2; do for f in 00592…sql 00593…sql 00594…sql; do cat "$f"; done; done; echo "ROLLBACK;"; } \
    | psql … -v ON_ERROR_STOP=1 -f -   # grep -Ei "^ERROR|rollback"
ROLLBACK

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2625 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 12 ++++++++++++
```

The twelve lines are the two new REVOKEs (`_sync_person_company_pointer`,
`sync_studio_contact_company_pointer`) in their guarded `DO $g$` blocks. The
grants seed had to be regenerated **and the reset re-run**: the first reset ran
the old seed, whose blanket baseline re-granted EXECUTE on every routine, so the
two new functions briefly showed `anon_exec = t` locally. After the regenerate +
reset they hold EXECUTE for nobody (table above).

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 4 ++++
```

The four lines are `_sync_person_company_pointer: { Args: { p_person_id: string }, Returns: undefined }`.
Nothing else moved — the trigger function has no exposed signature, and no
column or table changed shape. (Against the wave's base `700261663` the file is
465 insertions, zero deletions, up from 461.)

---

## Report corrections (r2's M-2 class: the document must not outlive the code)

`artifacts/people-room-crm-2026-09-11/build/w1a-report.md`:

- §1 `sms.ts` bullet — the fallback is studio-scoped, with the one surviving
  phone-global case named; the flush runs the same two gates (R-AK, R-AH).
- §1 `sms-inbound` bullet — the START sentence M3-4 caught is replaced with what
  the code now does (R-AJ).
- §2 decision 12 — gains the `not_asked` refusal and the never-empty rule.
- §2 decisions **13–16** added: the org-scoped fallback, one gate for both send
  paths, affiliations-as-home with the derived pointer, START as
  re-subscription.
- §3 — the SQL-test notices (block 12), the deno counts (26 / 32 / 681+1), the
  types diff (465), the definer/ACL table (the two pointer functions), the
  trigger table (`sync_studio_contact_company_pointer_trg`), and the
  "cases added" paragraph (an **r3** paragraph).
- §5 Not done — the R-AJ consequence (a seat-holding studio with no record is
  not re-subscribed by a START).

## Still open, unchanged by this round

The migration numbers stay provisional: `refs/heads/hour-tracking/server` holds
its own 00595–00597, and the local `supabase_migrations` ledger has carried that
wave's 00592–00594 before. At integration, renumber against whichever tip wins
(report §5).
