# W1a — fix log, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact.
`ls apps/*/.env.local` → `no matches found` (checked before the first reset).

Scope: the three findings handed to this round — **B-1** (blocking), **M-1**,
**M-2**. Nothing else was changed. The 13 minor findings (m-1 … m-13) are
untouched.

---

## B-1 — the two consent doors composed past a DATELESS STOP

`supabase/migrations/00594_studio_channel_consent.sql`,
`supabase/functions/sms-inbound/pipeline.ts`

### What changed

The "an unanswered refusal stands" test stopped being an inference from a
nullable date and became a stored fact.

1. **New column** `studio_channel_consent.refusal_unanswered boolean NOT NULL
   DEFAULT false`, stated both in the `CREATE TABLE` body and as an
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (the 00592/00593 rerun idiom), with
   a `COMMENT` naming why it is a column and not a date test.
2. **`backfill_channel_consent_from_parties()`** stamps it on the folded winner:
   `sms_consent_status = 'opted_out' OR (sms_opt_out_at IS NOT NULL AND
   (sms_consented_at IS NULL OR sms_consented_at <= sms_opt_out_at))`. A
   dateless `opted_out` party row — the shape `use-coordination.ts:604-617`
   writes deliberately, and every pre-00432 row — now folds to a record that
   fails closed.
3. **`record_channel_consent()`**: the granted leg of the upsert's
   `DO UPDATE … WHERE` reads the flag, and the old date test is KEPT beside it
   so a `service_role` writer that dates a refusal without raising the flag also
   fails closed:

   ```sql
   AND (EXCLUDED.status <> 'granted'
        OR scc.status = 'granted'
        OR (scc.refusal_unanswered IS NOT TRUE
            AND (scc.opt_out_at IS NULL
                 OR (scc.consented_at IS NOT NULL
                     AND scc.consented_at > scc.opt_out_at))))
   ```

   The write maintains it: `opted_out` → `true`, `granted` → `false`, `pending`
   keeps what stands (a studio re-recording the consent it holds does not answer
   the refusal). The INSERT leg writes `p_status = 'opted_out'`.
4. **`record_channel_reconsent()`** sets `refusal_unanswered = true` explicitly
   alongside the `opt_out_at` it already keeps — it supersedes the refusal with
   the studio's own fresh consent, but the person who refused still has not
   answered.
5. **`sms-inbound/pipeline.ts` `writeChannelConsent()`** writes
   `refusal_unanswered: status === "opted_out"` — so the inbound STOP raises it
   and the recipient's own YES/START is the only thing that lowers it, which is
   what reopens the studio's door.

### Evidence

The reviewer's own repro, re-run against the reset DB and rolled back
(`scratchpad/r4_probe.sql`):

```
=== B-1: the DATELESS refusal the shipped portal writes ===
 folded
--------
      1
  status   | opt_out_at | consented_at | refusal_unanswered
-----------+------------+--------------+--------------------
 opted_out |            |              | t

NOTICE:  step1 refused: channel_opted_out
NOTICE:  step2: reconsent -> pending
NOTICE:  step3 refused: consent_awaiting_recipient

 status  | opt_out_at | consented_at | refusal_unanswered
---------+------------+--------------+--------------------
 pending |            |              | t

                  id                  | sms_consent_status | sms_opt_out_at
--------------------------------------+--------------------+----------------
 e9000000-0000-4000-8000-000000000001 | pending            |
```

Step 3 was ACCEPTED before this round. The seat never reaches `granted`, so the
party-row backstop `sendPartySms` falls back on is never cleared, and
`channelConsentVerdict()` returns `"unknown"` (a `pending` record is not
`"allow"`), not the `"allow"` the finding demonstrated.

New SQL test **block 16B** ("a DATELESS refusal fails closed too") covers the
whole arc: the fold mints the dateless refusal with the flag raised (16Ba), the
direct grant is refused (16Bb), `reconsent()` → `pending` with the flag still
raised and the next grant refused with `consent_awaiting_recipient` (16Bc),
no seat on the number reads `granted` (16Bd), and only the rail's own answer —
lowering the flag — reopens the door (16Be). Block 16's own 16e was updated to
lower the flag, since that is what `writeChannelConsent` now does.

New Deno test: `STOP records the refusal as unanswered; a START lowers the flag`.

---

## M-1 — the backfill marked numbers SMS-capable that were never on an SMS rail

`supabase/migrations/00593_studio_contact_channels.sql`

### What changed

1. **New helper** `public.channel_value_was_on_sms_rail(p_value text)` —
   `STABLE`, SECURITY INVOKER, `SET search_path TO 'public'`, granted to
   `service_role` only (it is a backfill helper, not a portal reader):

   ```sql
   SELECT p_value IS NOT NULL
      AND (EXISTS (SELECT 1 FROM public.sms_conversations c
                    WHERE c.phone_e164 = p_value)
           OR EXISTS (SELECT 1 FROM public.project_parties pp
                       WHERE public.normalize_channel_value(
                               'mobile', COALESCE(pp.phone_e164, pp.phone)) = p_value
                         AND pp.party_kind IN ('gc','sub','installer','receiver')
                         AND COALESCE(pp.sms_consent_status,'not_asked') <> 'not_asked'));
   ```

   Both signals are the ones the finding named: a real `sms_conversations`
   thread (00282, keyed `(twilio_number, phone_e164)`), or a FIELD-kind seat
   (`pipeline.ts`'s `FIELD_KINDS`) that has actually been asked. Phone-global on
   purpose — SMS capability is a fact about the line, not about a studio's
   consent.
2. **Leg (a)** replaces `EXISTS (… project_parties on the same card …)` with the
   helper.
3. **Leg (c)** replaces its literal `true` with the same helper, and gained the
   `— line type unconfirmed` suffix on its own label when the evidence is
   missing (it had no unconfirmed label at all before).
4. `REVOKE`/`GRANT` added → `python3 scripts/generate-legacy-grants.py` re-run;
   `supabase/seed/00-legacy-grants.sql` gained exactly the two expected
   statements (12 lines, diff pasted below).

### Evidence

The finding's two cards, re-probed against the reset DB and rolled back
(`scratchpad/r4_probe.sql`), leg (a) for Sam and leg (c) for Ray:

```
=== M-1: the architect and the AHJ inspector ===
             full_name              | channel_kind |    value     | sms_capable |                             label
------------------------------------+--------------+--------------+-------------+----------------------------------------------------------------
 Ray Thao (AHJ) — NEVER text        | mobile       | +16125550903 | f           | From a project roster (00593 backfill) — line type unconfirmed
 Sam Rowe (architect, never texted) | mobile       | +16125550902 | f           | From the card (00593 backfill) — line type unconfirmed
```

Both were `t` with no unconfirmed label before this round.

SQL **block 15** was extended (it now runs BOTH legs verbatim, as the file
writes them): 15e the architect card with a folded `architect` party row on the
same number → `false` + unconfirmed; 15f the AHJ card that has no number of its
own, so only leg (c) can produce its channel → `false` + unconfirmed; 15g a
number with a real `sms_conversations` thread and no party row anywhere →
`true`, not labelled unconfirmed; and 15d's whole-table assertion is now stated
against `channel_value_was_on_sms_rail()` and covers both legs' labels.
15a/15b/15c are unchanged in intent — 15b's evidence is now Nell's FIELD-kind
seat that block 13 asked and granted.

---

## M-2 — an inbound YES flipped sibling seats to `granted` and parked their site requests for ever

`supabase/functions/sms-inbound/pipeline.ts`,
`supabase/migrations/00594_studio_channel_consent.sql`

Both halves of the finding's fix were taken, because the defect has two live
paths: the inbound YES (proved by the reviewer) and every studio-side grant
through `record_channel_consent()`, which is already granted to every
authenticated studio member.

### What changed

1. **The party-first write on YES covers every seat the record covers.**
   `yesTargets` is still scoped to the studios that actually hold a `pending`
   seat (R-AJ is untouched), but within those studios it now carries every seat
   on the number, and `grantPartiesForStudios` lost its `onlyPending` argument
   (START already passed `false`; nothing passes `true` any more). The record's
   `origin_project_id` still names the job the invite went out on — the origin
   is taken from the asking target, not from whichever seat sorts first.
2. **`mirror_channel_consent_to_parties()` carries a narrow release.** Before
   its UPDATE it captures the seats it is about to move onto `granted`
   (`sms_consent_status IS DISTINCT FROM 'granted'`, scoped to the record's org
   and value); after the UPDATE it calls
   `public.site_request_dispatch_after_consent(request_id)` for each of their
   site requests still at `status = 'awaiting_consent'` with
   `consent_status_snapshot IS DISTINCT FROM 'granted'`, each wrapped in
   `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING`. It does **not** call
   `invoke_edge_function`: the durable work (snapshot + `consent-granted` outbox
   row) lands in the transaction, the eager wake-up — the one outward act —
   stays with the party-row trigger, and the lifecycle sweep carries the outbox
   row out the ordinary way.
3. The invariant is restated accordingly in the migration header, in the
   `COMMENT ON TABLE public.project_parties`, and in the mirror's own
   `COMMENT`: **it is an invariant about SENDING, not about work.**
4. The two are idempotent against each other. On the inbound path the party
   write moves the seats first, so the mirror's capture comes back empty and no
   second outbox row or dispatch is minted (SQL block 13 asserts
   `d = 3` dispatches for 3 requests).

### Evidence

The studio-side path (the W2 shape — the mirror is the only writer), re-probed
and rolled back (`scratchpad/r4_probe_m2.sql`): one studio, one number, two
jobs, Job A's seat `pending`, Job B's seat `not_asked`, one parked request each,
one `record_channel_consent(..., 'granted', ...)` as an ordinary member:

```
--- seats after the record ---
 e9…0011 | Job A | granted
 e9…0012 | Job B | granted
--- parked site requests: released? ---
 a9…0021 | awaiting_consent | granted | outbox_rows 1
 a9…0022 | awaiting_consent | granted | outbox_rows 1
```

Before this round both snapshots read `not_asked` with zero outbox rows.
(`status` staying `awaiting_consent` is 00374's own shape —
`site_request_dispatch_after_consent()` stamps the snapshot and enqueues; the
dispatcher moves the request on.)

SQL **block 13** gained a third seat at `not_asked` in the same studio with its
own parked request, simulates the widened party-first write, and asserts three
outbox rows, three granted snapshots, exactly three dispatches, and 13c3 — no
granted seat on that number still holding a request parked with a stale
snapshot. SQL **block 8** was amended to the sharpened invariant: 8b/8c3 still
assert ZERO edge dispatches for a mirrored grant, and 8c/8c2 now assert that the
two parked requests WERE released (snapshot + one outbox row each). 8d is
unchanged: a direct party-row grant still dispatches once.

New Deno test: `YES grants every seat of the inviting studio, not only the
pending one` — pA (pending, org-alpha) and pB (not_asked, org-alpha) both end
`granted`, pC (not_asked, org-beta) stays `not_asked`, one consent record for
org-alpha with `origin_project_id = projA`.

---

## Verification

```
$ pnpm --dir …/agent-people-build supabase:reset
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1 … 7 passed
NOTICE:  8. mirror fan-out, site-request leg (B-1): passed
NOTICE:  9 … 12 passed
NOTICE:  13. an inbound grant releases its parked site requests (B-1/M-2): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2/M-1): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
(18 "passed" notices)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2630 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 12 ++++++++++++
   (+REVOKE ALL ON FUNCTION public.channel_value_was_on_sms_rail(text) FROM PUBLIC, anon, authenticated;
    +GRANT EXECUTE ON FUNCTION public.channel_value_was_on_sms_rail(text) TO service_role;)

$ SUPABASE_DB_URL=…54322/postgres pnpm --dir …/agent-people-build db:generate
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 9 +++++++++
   (refusal_unanswered on studio_channel_consent's Row/Insert/Update + the
    CompositeTypes row, and channel_value_was_on_sms_rail in Functions —
    nothing else)

$ { echo 'BEGIN;'; for i in 1 2; do cat 00592 00593 00594; done; echo 'ROLLBACK;'; } \
    | psql … -v ON_ERROR_STOP=1 -f -
ROLLBACK        (no ERROR line — all three replay twice over the migrated DB)

$ deno check --config supabase/functions/deno.json \
    _shared/sms.ts sms-inbound/pipeline.ts sms-inbound/index.ts site-request-dispatch/index.ts
Check … (all four clean)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/ supabase/functions/_tests/sms-inbound.test.ts
ok | 445 passed | 0 failed        (was 443 + the 2 new tests)

$ pnpm --dir …/agent-people-build --filter @patina/supabase type-check        → exit 0
$ pnpm --dir …/agent-people-build --filter @patina/designer-portal type-check → exit 0
```

Object probes (not the ledger):

```
 column_name        | data_type | is_nullable | column_default
 refusal_unanswered | boolean   | NO          | false

 proname                       | prosecdef | provolatile | proconfig
 channel_value_was_on_sms_rail | f         | s           | {search_path=public}

 grantee      | privilege_type
 service_role | EXECUTE
 postgres     | EXECUTE
```

Every probe transaction was rolled back; the shared local stack is at
`00592/00593/00594` + `20260910152111` with the seeds replayed.

## Report

`w1a-report.md` updated so it does not outlive the code: decision 17 (the
`sms_capable` evidence rule, now stated as `channel_value_was_on_sms_rail` and
applied to both legs), decision 18 (the unanswered refusal is
`refusal_unanswered`, a stored fact, not a date test), a new decision 20 (the
mirror's suppression is about sending, not work — the narrow release plus the
widened YES party write), the two file-table rows, the §1 inbound-rail
paragraph, the SQL-block narrative, and the prod-fold note about re-running the
backfill.

---

# W1a fix log — the W4 round (W4-M1, W4-M2)

Appended to this file per the round brief ("append a section to
`w1a-fix-log-r4.md` per finding"); the findings are the two MAJORs in
`w1a-review-r4-migrations.md`. Scope: exactly those two. Nothing else in the
wave was touched — the four MINORs in that review (W4-m3 … W4-m6) are
deliberately untouched.

Local stack only — no `supabase db push`, no `supabase functions deploy`, no
Strata contact. `ls apps/designer-portal/.env.local` → missing (exit 2), so
nothing in this worktree points at prod.

---

## W4-M1 — the fold read the refusal off the winning row

**What changed.** `supabase/migrations/00594_studio_channel_consent.sql`, the
`backfill_channel_consent_from_parties()` CTE chain. A new `refusal` CTE sits
beside `ranked` and asks the refusal question of **every** seat in the
`(org, phone_e164)` group:

```sql
  refusal AS (
    SELECT org, phone_e164,
           sms_consent_source      AS opt_out_source,
           sms_consent_evidence    AS opt_out_evidence,
           sms_consent_recorded_at AS opt_out_recorded_at,
           sms_consent_recorded_by AS opt_out_recorded_by
      FROM (
        SELECT party_org.*,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 ORDER BY COALESCE(sms_opt_out_at, sms_consent_recorded_at,
                                   updated_at) DESC NULLS LAST
               ) AS rrn
          FROM party_org
         WHERE org IS NOT NULL
           AND (sms_consent_status = 'opted_out'
                OR (sms_opt_out_at IS NOT NULL
                    AND (sms_consented_at IS NULL
                         OR sms_consented_at <= sms_opt_out_at)))
      ) refusals
     WHERE rrn = 1
  ),
```

The INSERT now reads `FROM ranked r LEFT JOIN refusal f ON f.org = r.org AND
f.phone_e164 = r.phone_e164 WHERE r.rn = 1`, and `refusal_unanswered` is
`(f.org IS NOT NULL)` in place of the per-row predicate that used to sit at
`:311-313`.

The review's suggested shape was `bool_or(...) GROUP BY org, phone_e164`. The
CTE above is the same boolean by construction — a group has a `refusal` row
exactly when `bool_or` would be true — and it carries the refusing row's own
evidence as well, which W4-M2 needs and a bare `bool_or` cannot give. Most
recently refused wins when a group holds more than one refusal.

**Not changed:** the winner's `opt_out_at` still comes from the ranked winner,
not from the refusing sibling. A dateless refusal is the shape this design
already treats as normal (16B), and moving the date is a behaviour change the
finding did not ask for. Flagging it rather than doing it.

**Evidence — the reviewer's exact shape, re-staged**
(`artifacts/people-room-crm-2026-09-11/build/probe9-r8.sql`, rolled back):

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f artifacts/people-room-crm-2026-09-11/build/probe9-r8.sql
 folded
--------
      1

=== W4-M1: the record the fold mints (was: granted / f / NULL) ===
 status  | refusal_unanswered | consented_at | opt_out_at | opt_out_source | opt_out_evidence | opt_out_recorded_at
---------+--------------------+--------------+------------+----------------+------------------+---------------------
 granted | t                  | 2026-09-02   |            | inbound_sms    | Replied STOP     | 2025-11-16

=== W4-M1: what the send gate sees on the seats (status only) ===
 display_name | sms_consent_status | sms_opt_out_at
--------------+--------------------+----------------
 Seat One     | granted            |
 Seat Two     | granted            | 2025-11-16
```

`refusal_unanswered` is now `t` where the review demonstrated `f`. The seats are
unchanged (both still read `granted`, which is why neither status-only gate
could catch this) — the record is what fails closed now, and
`channelConsentVerdict` refuses on that flag since r6 M6-3.

**Regression test.** `supabase/tests/people/w1a_identity_channels_consent_test.sql`
block 3 now stages the two-seat studio the review asked for: a third Alpha seat
`e0000000-…-000006` on `+16125550199` reading `granted` with a 2025-11-16
opt-out and no `sms_consented_at`, beside the existing clean 2026 grant that
wins the ranking. New assertions `3c3` (the record is minted unsendable), `3c4`
(the refusal's own source and words landed), `3c5` (the shared evidence set
still belongs to the winning grant, so the two facts do not smear).

---

## W4-M2 — reconsent erased the refusal's own 10DLC evidence

**What changed.** Fix (a) from the review, which is R-AN-shaped: the record now
carries a **refusal-side evidence set** of its own.

1. `studio_channel_consent` gains `opt_out_source` (same five-value CHECK as
   `source`), `opt_out_evidence`, `opt_out_recorded_at`, `opt_out_recorded_by`
   (FK to `profiles`, ON DELETE SET NULL). Stated in the `CREATE TABLE` body
   **and** as `ADD COLUMN IF NOT EXISTS` + a name-matched guarded
   `ADD CONSTRAINT`, the 00592/00593 idiom, so the rerun path is a no-op.
   `COMMENT ON COLUMN … .opt_out_source` states the rule for all four.
2. **The fold** writes them (the `refusal` CTE above).
3. **`record_channel_consent`** writes them when and only when the verdict *is*
   the refusal — `CASE WHEN p_status = 'opted_out' THEN … END` in the INSERT,
   and in `DO UPDATE` `CASE WHEN EXCLUDED.status = 'opted_out' THEN
   EXCLUDED.opt_out_… ELSE scc.opt_out_… END`. Every other verdict leaves them
   exactly as they stand.
4. **`record_channel_reconsent`** does not name them at all — they are absent
   from its `SET` list, with a comment saying they must stay absent and why.
5. **The inbound STOP rail** (`supabase/functions/sms-inbound/pipeline.ts`,
   `writeChannelConsent`) stamps `opt_out_source: "inbound_sms"`,
   `opt_out_evidence: evidence`, `opt_out_recorded_at: now` on a STOP, and
   carries the prior values forward untouched on a YES/START (the read's
   `select` was widened to fetch them). `opt_out_recorded_by` stays NULL on a
   rail write — nobody in the studio recorded it; the recipient did.
6. **The mirror is untouched.** These four have no `project_parties`
   counterpart, so nothing propagates and the tuple guard is unchanged — which
   is exactly why the review preferred (a).

**Evidence** (same probe file, rolled back): a recorded inbound STOP, then one
`record_channel_reconsent()` by an ordinary member:

```
=== W4-M2: the record after reconsent (was: source written / "Signed re-consent form" only) ===
  status   | refusal_unanswered | source  |              evidence               | disclosure_version | opt_out_source | opt_out_evidence
-----------+--------------------+---------+-------------------------------------+--------------------+----------------+------------------
 opted_out | t                  | written | Signed re-consent form, 11 Sep 2026 | v2                 | inbound_sms    | Replied STOP

=== W4-M2: the seat after the mirror ran ===
 sms_consent_status | sms_consent_source |        sms_consent_evidence
--------------------+--------------------+-------------------------------------
 opted_out          | written            | Signed re-consent form, 11 Sep 2026
```

Both facts are now printable off one record: `opt_out_source = 'inbound_sms'`
is R-Q's "by text", and the studio's fresh consent sits beside it. The seat
still mirrors the consent side only — the record is where the refusal's own
words live, which is the division fix (a) chose.

**R-AG is not reopened.** Nothing here nulls or overwrites
`source`/`evidence`/`disclosure_version`/`recorded_by`; the four new columns are
additive and are written only by a refusal.

**Regression tests.**
- SQL block 27: `27b3` (reconsent leaves `opt_out_source`/`opt_out_evidence`
  standing), `27b4` (it keeps who wrote the refusal down, and when), `27d2` (a
  *second* reconsent does not reach them either), `27g` (the recipient's own
  answer plus the studio's later `granted` do not speak for the refusal that
  preceded them).
- `supabase/functions/_tests/sms-inbound.test.ts`: the per-studio STOP test now
  asserts the rail stamps the refusal's own source, words and date; the
  START test seeds them and asserts they survive the re-grant.

---

## Verification run

```
$ pnpm --dir …/agent-people-build supabase:reset
… Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
… (blocks 4–26 unchanged, all passed) …
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), and leaves the refusal's own evidence standing (r8 W4-M2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --allow-all --config deno.json _tests/sms-inbound.test.ts
ok | 35 passed | 0 failed (29ms)

$ deno test --allow-all --config deno.json _shared/sms.test.ts
ok | 36 passed | 0 failed (41ms)

$ SUPABASE_DB_URL=… pnpm --dir …/agent-people-build db:generate
$ git -C … diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 34 +++++++++++++++++++++++++++++++++
 1 file changed, 34 insertions(+)
```

The 34 lines are the four columns in `Row`/`Insert`/`Update`, the two composite
RPC return types (`record_channel_consent`, `record_channel_reconsent`), and the
`opt_out_recorded_by` FK relationship. Nothing else moved.

Object probe (never the ledger):

```
     column_name     |        data_type         | is_nullable
---------------------+--------------------------+-------------
 opt_out_evidence    | text                     | YES
 opt_out_recorded_at | timestamp with time zone | YES
 opt_out_recorded_by | uuid                     | YES
 opt_out_source      | text                     | YES

 studio_channel_consent_opt_out_recorded_by_fkey | FOREIGN KEY (opt_out_recorded_by) REFERENCES profiles(id) ON DELETE SET NULL
 studio_channel_consent_opt_out_source_check     | CHECK ((opt_out_source = ANY (ARRAY['verbal'…,'written'…,'web_form'…,'inbound_sms'…,'other'…])))
```

Re-applying the `ADD COLUMN IF NOT EXISTS` block plus the guarded
`ADD CONSTRAINT` a second time is a no-op (four "already exists, skipping"
notices, constraint count unchanged) — the rerun path is idempotent.

No `GRANT` or `REVOKE` was added or removed. `python3
scripts/generate-legacy-grants.py` was re-run anyway and
`supabase/seed/00-legacy-grants.sql` came back byte-identical (`git diff --stat`
empty).
