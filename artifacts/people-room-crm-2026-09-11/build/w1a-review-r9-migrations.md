# W1a — adversarial migration review, round 9

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, tip `52c4d17ca`
("fix(consent): a STOP over a standing grant is not a refusal in writing (r10 M1/M2)").
Local stack only. No `supabase db push`, no `supabase functions deploy`, nothing
touched on Strata.

**Verdict: NOT CLEAN — 2 major, 0 blocking, 14 minor.**

---

## 0. What I ran

```
$ pnpm --dir …/agent-people-build supabase:reset
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[…29 seed files…]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
…
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an
         SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ psql … -f … | grep -c NOTICE
37
```

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 80 passed | 0 failed (108ms)
```

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts
(empty)

$ git diff --stat 700261663 -- supabase/seed/00-legacy-grants.sql packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 supabase/seed/00-legacy-grants.sql      | 216 ++++++++++++++
```

Idempotency — each migration replayed against the already-migrated database
inside its own rolled-back transaction:

```
$ for f in 00592… 00593… 00594…; do (echo BEGIN; cat $f; echo ROLLBACK) | psql -v ON_ERROR_STOP=1; done
… NOTICE: column "…" already exists, skipping   (×15)
… NOTICE: relation "studio_contact_channels" already exists, skipping
… NOTICE: relation "studio_channel_consent" already exists, skipping
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
```
No errors on any of the three. `SELECT backfill_channel_consent_from_parties()`
returns 0 on the rerun (`ON CONFLICT DO NOTHING`).

Numbering — head is `00591_notification_log_delivery`; no ref holds 00592–00594
but this branch and its origin mirror; `hour-tracking/*` now starts at 00595:

```
refs/heads/build/people-room-crm-2026-09-11: 00592… 00593… 00594…
refs/heads/hour-tracking/integration:        00595… 00596… 00597…
refs/heads/hour-tracking/server:             00595… … 00599…
```

`grep -rn "supabase db push|functions deploy|bkvcixdmuyejfzcijpdg|supabase.co"`
over the three migrations, the SQL test and the two edited edge files → nothing.

---

## 1. Prior round re-checked (`w1a-review-r8-migrations.md` + `w1a-fix-log-r8.md` / `-r10.md`)

| Prior | Status |
|---|---|
| r8 **M1** — the fold files the GRANT's paperwork as the refusal's own words on a STOP-flipped seat | **FIXED.** `refusal_words_are_its_own` (`00594:557-563`) gates all four `opt_out_*` projections and the CTE's own ranking leg (`00594:529-536`, `:549-550`). SQL block 30f passes, with 30f7/30f8 as the controls. |
| r8 **M2** — `w1a-report.md` five commits stale | **FIXED.** Every count in §3 now matches the database: 37 NOTICE lines (verified), 216 / 2633 grant lines (verified), 508 type insertions (verified), the EIGHT-name rule CHECK and the SEVEN-name channel CHECK (verified below). |
| r8 m3 — `reach_preference` neither built nor scoped out | **OPEN** (m3 below). |
| r8 m4 — rule-only `sms` token bound by a comment only | **OPEN** (m4 below). |
| r8 m5 — one un-revoked EXECUTE | **OPEN and WIDER** (m5 below — it is two functions, not one). |
| r8 m6 — two SECURITY DEFINER oracles granted to `authenticated` | **OPEN** (m6 below). |
| r8 m7 — `char(4)` / unbounded `retainage_bps` | **OPEN, reproduced** (m7 below). |
| r8 m8 — "line type unconfirmed" is person-only | **OPEN** (m8 below). |
| r8 m9 — channel rows the fold can never mint a record for | **OPEN** (m9 below). |
| r8 fix log R-AQ (wordless refusal wipes the seat) | **PRESENT**, `00594:947-958`, `:1010-1018`, tuple guard `:1043-1051`. Block 27 passes. |
| r8 fix log R-AR (identity guard) | **PRESENT**, `00593:502-612`, with the r9 R5-M1 subject leg at `:556-562`. Block 29 passes. |

---

## 2. Findings

### M1 — MAJOR (confidence: HIGH, reproduced). `record_channel_reconsent()` destroys the GRANT's evidence set and leaves `consented_at` naming the older grant — the r6 R6-M1 failure arriving through the other door

`supabase/migrations/00594_studio_channel_consent.sql:1862-1866`

```sql
         source             = p_source,
         evidence           = p_evidence,
         recorded_at        = v_now,
         disclosure_version = p_disclosure_version,
         recorded_by        = auth.uid(),
```

`consented_at` is deliberately **not** in that SET list (`00594:1843-1844`:
"opt_out_at is KEPT"), and neither is it restated. So a record that holds a real
grant — `consented_at 2 May 2025`, `written`, "Signed the kickoff form",
disclosure `v3`, which is exactly what the rail's r7 R7-M1 rule preserves
through a STOP (`pipeline.ts:414-422`) — comes out of one ordinary
`record_channel_reconsent()` call reading `verbal` / "He said it is fine now" /
`recorded_at` today / `v9`, **against the 2 May 2025 `consented_at`**.

Reproduced on the reset stack (probe rolled back):

```
--- before ---
  status   |      consented_at      | source  |        evidence         |      recorded_at       | disclosure_version
-----------+------------------------+---------+-------------------------+------------------------+--------------------
 opted_out | 2025-05-02 00:00:00+00 | written | Signed the kickoff form | 2025-05-02 00:00:00+00 | v3

--- after record_channel_reconsent(org,'sms',number,'verbal','He said it is fine now','v9') ---
  status   |      consented_at      | source |        evidence        |          recorded_at          | disclosure_version
-----------+------------------------+--------+------------------------+-------------------------------+--------------------
 opted_out | 2025-05-02 00:00:00+00 | verbal | He said it is fine now | 2026-09-12 07:02:34.090259+00 | v9
```

Three consequences, all of them the ones this file legislates against elsewhere:

1. **R-Q composes a false sentence.** `00594:159-170` states the rule in the
   header — "source / evidence / recorded_at / disclosure_version / recorded_by
   belong to the GRANT whose `consented_at` the record keeps" — and r6 R6-M1
   changed `record_channel_consent`'s `opted_out` branch for precisely the
   symptom now produced here: *"the record reading (verbal, 'He told me on
   site') against the grant's date, so R-Q's grant sentence composed to 'Verbal
   consent, 2 May 2025'"* (`00594:1489-1498`). Reconsent produces that exact
   row, and nothing in the file refuses it.
2. **The disclosure version the person was actually shown is gone.** `v3` — the
   disclosure that makes the 2025 grant auditable — is replaced by `v9`, the
   version attached to paperwork the recipient has not answered. `00594:920-921`
   and `:1216-1219` both say the version the person *was shown* is a fact the
   audit needs; this door writes over it, and no column survives it.
3. **It travels to the seats.** The mirror COALESCEs
   `sms_consent_disclosure_version` from `NEW.disclosure_version`
   (`00594:1016`) on every transition including a refusal, so `v9` is stamped
   onto every seat in the studio on that number under an `opted_out` status.

`record_channel_reconsent()` is by construction the door a studio is sent to —
the `channel_opted_out` HINT names it (`00594:1364-1367`) — so this is the
ordinary path, not an edge. `COMMENT ON FUNCTION` even advertises the behaviour
("each call restates the studio's latest evidence", `00594:1909`), which is why
it has survived nine rounds: the destruction is documented as a feature.

**Fix, in the shape the file already uses.** Either (a) give the fresh consent
its own date — restate `consented_at = v_now` alongside the five, so source and
date name the same act (this does not move `status` and does not lift
`refusal_unanswered`, so r7 M7-2 is untouched); or (b) refuse to write the five
over a standing grant the way `record_channel_consent`'s `opted_out` branch now
does (`00594:1513-1523`) and give the fresh consent a third evidence set. (a) is
one line and preserves what the function is for; (b) matches the r6 R6-M1
precedent. Either way `disclosure_version` must not silently replace the version
the person was shown at the grant it is not the grant for.

---

### M2 — MAJOR (confidence: HIGH on mechanism, reproduced; MEDIUM on whether the orchestrator rules it in scope). The fold takes the CONSENT side off the winning refusing seat only, so a group's real grant evidence is minted away — and R-AQ then wipes the sibling that held it

`supabase/migrations/00594_studio_channel_consent.sql:603-605`

```sql
           r.sms_consent_source,
           r.sms_consent_evidence, r.sms_consent_recorded_at,
           r.sms_consent_disclosure_version, r.sms_consent_recorded_by,
```

`r` is `ranked`, and `ranked` inside the refusal bucket is ordered by the
refusal's own facts (r2 R2-M1, `00594:405-410`). r8 W4-M1 added the `refusal`
CTE precisely because *"`ROW_NUMBER()` drops every sibling seat before any
predicate can see it"* — but it added it for the **refusal side only**. The
consent side still reads one row.

So for the commonest legacy shape — a studio holding a fully evidenced grant on
one seat and the shipped portal's **sourceless, dateless** `opted_out` on
another seat on the same number (`use-coordination.ts` writes exactly that, and
this file cites it seven times) — the fold mints a record that knows nothing at
all:

```
=== fold a group holding a sourceless refusal BESIDE a fully evidenced grant ===
 folded = 1
  status   | refusal_unanswered | opt_out_at | source | evidence | recorded_at | disclosure_version | has_recorder | opt_out_source
-----------+--------------------+------------+--------+----------+-------------+--------------------+--------------+----------------
 opted_out | t                  |            |        |          |             |                    | f            |
```

(Seat B carried `written` / "Signed the kickoff form" / `2025-05-02` / `v3` /
recorder. None of it reaches the record.)

That alone would be an evidence gap. It is worse than a gap because **R-AQ then
deletes the only surviving copy.** `opt_out_source` came out NULL, so the
mirror's wordless-refusal branch (`00594:947-958`, `:1010-1018`) writes NULL over
`sms_consent_source` / `_evidence` / `_recorded_at` / `_recorded_by` on *every*
seat in the studio on that number — including the grant seat. One ordinary
studio act is enough:

```
--- after ONE record_channel_reconsent() on that number ---
 display_name  | sms_consent_status | sms_consent_source | sms_consent_evidence | sms_consent_recorded_at |    sms_consented_at
---------------+--------------------+--------------------+----------------------+-------------------------+------------------------
 Granted Seat  | opted_out          |                    |                      |                         | 2025-05-02 00:00:00+00
 Refusing Seat | opted_out          |                    |                      |                         |

--- and the record holds no consent evidence for the grant either ---
  status   | consented_at | source  |       evidence       | disclosure_version | opt_out_source
-----------+--------------+---------+----------------------+--------------------+----------------
 opted_out |              | written | Fresh signed consent | v9                 |
```

After those two steps the studio's proof of prior express written consent for
that number — source, words, date, disclosure version, recorder — exists
**nowhere in the system**. `ON CONFLICT DO NOTHING` means no later fold repairs
the record, and `record_channel_reconsent` never touches `opt_out_*` by design.

Note also that in this fixture the mirror fired *on the fold itself*, because
the fold function is re-runnable and `GRANT`ed to `service_role`
(`00594:624`) and the report's §5 explicitly plans to re-run it after the push.
Only 00594's own one-shot call at `00594:653` runs before the trigger exists; every
later fold of a newly-seated number runs with the mirror live.

The seat wipe is R-AQ as ruled, and I am not re-litigating it. What is **not**
ruled is that the record — the home R-AQ's ruling implicitly relies on — is
minted empty. The symmetric fix is the one W4-M1 already established: a `grant`
CTE beside `refusal`, computed over `party_org`, projecting the group's best
evidenced consent (`sms_consent_source IS NOT NULL`, most recent
`sms_consented_at`) onto the record's five consent columns when the winning row
carries none. Alternatively, state in the migration and the report that a
sourceless-refusal group's grant evidence is deliberately discarded, so the
10DLC position is a decision rather than a side effect.

---

### m3 — MINOR (confidence: HIGH it is missing; MEDIUM it matters). `reach_preference` is still neither built nor declared out of scope

Unchanged from r8 m3. `synthesis/direction.md` §7 row 1 lists it as a P1
`studio_contacts` person column; `crm-model.md:80` types it
(`enum text/email/phone/office/app`, CS4-5, "F-13 has no work cell").

```
$ grep -rn "reach_preference" supabase/migrations/ artifacts/…/build/w1a-report.md
(nothing)
```

It is not covered by decision 1's ruling (that ruling is about the *forbidding*
rule; a preference is not one, and `studio_contact_rules` has no column for it),
it is not in 00592's "NOT DONE HERE, DELIBERATELY" block (`00592:35-43`), and it
is not in the report's §5 out-of-scope list. Add it, or name it.

---

### m4 — MINOR (confidence: MEDIUM). The rule-only `sms` token is still bound by nothing but a comment

`00592:800-822` admits `'sms'` into both rule arrays; `00593:102-108` keeps
`studio_contact_channels.channel_kind` at seven, verified:

```
 studio_contact_rules_channels_forbidden_check | CHECK ((channels_forbidden <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311','sms']))
 studio_contact_channels_channel_kind_check    | CHECK ((channel_kind = ANY (ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311'])))
```

The resolution rule ("a composer resolves a forbidden `sms` against the mobile
line's `sms_capable`") lives only in the column COMMENT (`00592:836-841`). A W1b
composer that resolves rule tokens by joining to `channel_kind` will silently
not match `'sms'` and F-10's and F-27's "never texted" will fail OPEN — the
failure `00592:754-766` names. Worth a shared constant the composer must import,
or an explicit assertion in W1b's brief.

---

### m5 — MINOR (confidence: HIGH on the fact; LOW on impact). The un-revoked EXECUTE is **two** functions, not one

r8 m5 named `mirror_channel_consent_to_parties`. `normalize_studio_contact_channel`
has the same gap (`00593:261` — `REVOKE ALL … FROM PUBLIC, anon;`, no
`authenticated`). Probed:

```
 mirror_channel_consent_to_parties | t | {search_path=public}            | anon f | auth t | svc t
 normalize_studio_contact_channel  | f | {"search_path=public, pg_temp"} | anon f | auth t | svc t
```

Every other trigger function this wave adds revokes `authenticated` too
(`00592:236`, `:423`, `:505`, `:539`, `:673`, `:976`; `00593:310`, `:587`).
Not exploitable — PostgreSQL refuses a direct call to a `RETURNS TRIGGER`
function — but the report's probe table (`w1a-report.md:771-772`) prints both
`t` without remarking on either.

---

### m6 — MINOR (confidence: MEDIUM). The two SECURITY DEFINER oracles still answer for any row id

Unchanged from r8 m6. `00592:65-76` `studio_contact_org(uuid)` and `00592:85-99`
`project_party_designer(uuid)` are `SECURITY DEFINER`, granted to
`authenticated`, and carry no membership test — by design, since the RLS
policies call them. A signed-in user holding a `studio_contacts.id` learns the
owning org; one holding a `project_parties.id` learns the lead designer's
`auth.uid()`. `_primary_studio_for` is revoked from every PostgREST role (00483)
for returning the same class of fact.

---

### m7 — MINOR (confidence: HIGH, reproduced). `tax_id_last4 char(4)` and unbounded `retainage_bps`

```
 tax_id_last4 | len | pads_equal | retainage_bps
--------------+-----+------------+---------------
 417          |   3 | t          |        987654
```

`00592:119` — `char(4)` is blank-padded and its comparisons ignore trailing
spaces, in a column whose stated job (`00592:166-168`, CS6-11) is *catching
duplicate vendor cards splitting a 1099 total*. crm-model §2 says `text`; `text`
plus `CHECK (tax_id_last4 ~ '^[0-9]{4}$')` says what is meant.
`00592:121` — `retainage_bps integer` takes 987654 (9876.54%); the file already
uses the DROP/ADD idiom that would add `BETWEEN 0 AND 10000` in one line.

---

### m8 — MINOR (confidence: HIGH). "line type unconfirmed" is still person-only

`00593:413-415`: the qualifier is `CASE WHEN sc.entity_kind = 'person' AND NOT
ev.texted …`, and `ev.texted` is hard-false for a company (`00593:418`). Every
firm's backfilled `office` channel lands `sms_capable = false` with a label
asserting nothing is unconfirmed, even though nothing on the card said the
firm's one number is an office line. Decision 17's stated purpose is "so W1b's
Reach editor can show which lines it is asking the studio to type"; firm lines
are silently excluded from that list.

---

### m9 — MINOR (confidence: MEDIUM). A channel row can still exist that the fold can never mint a consent record for

`00593:439` mints a channel from `COALESCE(pp.phone_e164, pp.phone)` (raw text
survives when the number will not parse — decision 11, deliberate).
`00594:376` filters `WHERE pp.phone_e164 IS NOT NULL`, so those seats are
dropped before precedence is computed: an unparseable number carrying a RECORDED
REFUSAL contributes to no record. Nothing is sent to it either (the rail keys on
`phone_e164`), so it is not a send hole — but decision 11's claim that the shared
normaliser means "a channel row and its consent record always land on the same
key" is false for this population.

---

### m10 — MINOR (confidence: HIGH, reproduced). A contact rule outlives the card it is filed against, and becomes invisible and undeletable

`00592:720-721` — `subject_id uuid NOT NULL` with no FK (polymorphic, by
design). `assert_studio_contact_identity_stable()` counts rules filed against a
card (`00593:556-562`) but only on **UPDATE OF entity_kind, organization_id**;
nothing fires on DELETE, and `studio_contacts` has no restricting FK from this
table.

```
=== a contact rule outlives the card it is filed against ===
INSERT 0 1        -- rule: subject_type person, channels_forbidden {sms}
DELETE 1          -- the card
 orphan_rules | org_unresolvable
--------------+------------------
            1 | t
```

`studio_contact_org(subject_id)` then returns NULL, so every RLS leg
(`00592:1009-1057`) evaluates false: the row is invisible to every reader
including its owning studio, and cannot be deleted through PostgREST. Dead rows
only — but they accumulate silently and the room has no way to sweep them. A
`BEFORE DELETE` leg on the identity guard, or an explicit sweep, closes it.

---

### m11 — MINOR (confidence: HIGH on the fact; LOW on impact). `origin_project_id` is never checked against the organization

`00594:1453` and `00594:1867` take `p_origin_project_id` straight from the
caller; the only constraint is the FK to `public.projects` (`00594:232`). A
studio member may therefore stamp another tenant's project id onto their own
consent record, which is the id R-Q's sentence resolves the job name from
("…on the Lindqvist kitchen"). No read leak — `projects` RLS blanks the lookup —
but the sentence then silently loses its job clause, and a cross-tenant id sits
in the studio's book. One `EXISTS` against
`COALESCE(studio_id, _primary_studio_for(designer_id)) = p_organization_id`
closes it, and the file already writes that predicate four times.

---

### m12 — MINOR (confidence: HIGH). crm-model CS1-21 ("one preferred channel per kind") has no constraint

`00593:77` — `preferred boolean NOT NULL DEFAULT false`, and the only unique
index on the table is `(owner_id, channel_kind, value)` (`00593:328-329`).
Nothing stops two `preferred` mobiles on one card. W1a ships no writer, which is
exactly why a partial unique index
(`UNIQUE (owner_id, channel_kind) WHERE preferred`) is cheap now and expensive
once W1b's Reach editor is the thing that has to be trusted — the same argument
the file makes for the `channel_kind` CHECK.

---

### m13 — MINOR (confidence: MEDIUM). 00593's backfill is O(cards × parties) with an un-indexable predicate, and nothing bounds it

`00593:209-229` — `channel_value_was_on_sms_rail()` runs two `EXISTS` per call,
and the second applies `normalize_channel_value('mobile', COALESCE(pp.phone_e164,
pp.phone))` **per row of `project_parties`**, so no index can serve it. Leg (a)
calls it once per `studio_contacts` row (`00593:417-422`) and leg (c) calls it
**twice** per folded party row (`00593:440-445`). Locally the backfills found
nothing (0 channels, 0 consent rows — migrations run before seeds), so the
migration's runtime on Strata-sized `project_parties` × `studio_contacts` is
entirely unmeasured. The report's §5 plans a fold dry run for 00594 but nothing
for this. Either hoist the test into a single CTE keyed on the normalised value,
or time it against a prod-shaped copy before the push.

---

### m14 — MINOR (confidence: HIGH on the asymmetry; LOW on impact). The flush re-runs both consent gates but not the opt-in evidence check

`_shared/sms.ts:800-816` — `sendPartySms` refuses an `sms_optin_invite` without
`partyId` and without a complete party-row evidence set
(`consent_evidence_required`). `flushDeferredMessages`'s invite branch
(`:1108-1121`) re-runs `channelConsentVerdict` and the narrowed party check but
never re-reads that proof. A deferred invite whose evidence was cleared between
defer and flush is sent without it. In practice the clearing writer is the
mirror's R-AQ branch, which only fires on `opted_out` (and therefore suppresses
first), so I could not construct a live path — but the two send paths are
supposed to ask the same questions (R-AH), and here they do not.

---

### m15 — MINOR (confidence: HIGH). Two writers state two different rules for `opt_out_at`

`00594:1471-1473` keeps the EARLIEST (`LEAST(scc.opt_out_at,
EXCLUDED.opt_out_at)`) — r7 R7-M1: *"a second refusal recorded over a standing
one is not a new refusal"*. The rail does the opposite:
`sms-inbound/pipeline.ts:424` — `opt_out_at: status === "opted_out" ? now : …`,
so a second inbound STOP walks the date forward. Defensible (the carrier spoke
again, and the four `opt_out_*` columns move with it by the same reading,
`00594:1542-1543`) — but the header claims the rail is held to
`record_channel_consent`'s rule "leg for leg" (`pipeline.ts:417-422`), and on
this column it is not. Either state the exception at the line or align them.

---

### m16 — MINOR (confidence: MEDIUM). `optOutAllForPhone()` is the one write in the STOP branch whose failure is not checked

`sms-inbound/pipeline.ts:511-529`, called at `:721` with its result discarded.
r7 R7-M3's rule — "a STOP the rail could not fully record is not acknowledged" —
covers `loadPhoneParties`, `studiosHoldingRecord` and `writeChannelConsent`
(`:740-742`) but not the party-row write. For a studio whose org resolves, the
consent record is the primary gate so the miss is covered; for seats whose
project org cannot be resolved at all there is no record and no backstop, and
that is the one population `channelConsentVerdict`'s last phone-global scan
exists for. One more `failed` flag.

---

### m17 — MINOR (confidence: HIGH, informational). Three documented vocabulary deviations from crm-model §2 are not in the report's §5

- `channel_kind` is 7 names, not crm-model §2's 11 (`app`, `account`,
  `field_link`, `paper` excluded — `00593:92-98`, with a good reason).
- `status` spells crm-model's `ok` as `active` (`00593:110-113`).
- `role_at_firm` is free TEXT, not crm-model's enum (`00592:277-280`, PD-4).
- `company_kind` is a CHECK, not direction §7's "enum" (`00592:41-43`) — correct
  per the migration rules, but it is a deviation from the direction table.

All four are stated in the migration files. None is in `w1a-report.md` §5, which
is where the next wave looks for what did not land as written.

---

## 3. What I verified and found correct

- **Both redefined functions are their grep-winner bodies verbatim + one guard.**
  `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`
  → `00432_twilio_activation_hardening.sql` for `fc_dispatch_optin_invite`,
  `00374_field_site_request_loop.sql` for `_site_request_consent_granted_dispatch`
  (00594 excluded). `diff` of the two extracted bodies:

  ```
  7a8,13   >   IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
           >     RETURN NEW;  END IF;
  10a11,17 >   (the same guard)
  ```
  Nothing else differs on either. `COMMENT ON TABLE public.project_parties`
  (`00594:815-834`) restates 00212:46 and appends the invariant.
- **No other object in the wave redefines anything.** For all seventeen new
  function names, `grep -rl "CREATE OR REPLACE FUNCTION[^(]*<name>"
  supabase/migrations/*.sql | grep -v 0059[234]` → 0 hits each.
- **RLS enabled with the right predicate on all four new tables**, probed:
  `studio_channel_consent` 1 policy, the other three 4 each, `relrowsecurity = t`
  on all four. `studio_person_affiliations` / `studio_contact_channels` →
  `is_active_studio_member(studio_contact_org(<card>))` on every verb, with the
  affiliation INSERT/UPDATE `WITH CHECK` also pinning both cards to one org
  (`00592:345-359`); `studio_contact_rules` → the same for person/company and
  `is_studio_comember(project_party_designer(subject_id))` for engagement
  (`00592:1013-1018`), matching 00584's posture.
- **No client-portal / anon branch anywhere.** No policy names `anon`; every
  table `REVOKE ALL … FROM PUBLIC, anon, authenticated` before granting. The
  site access card (PR-w) is out of W1a scope and absent from all three files.
- **`studio_channel_consent` is write-closed to the portal by privilege**, not
  convention: `authenticated` holds SELECT only; `record_channel_consent` and
  `record_channel_reconsent` hold EXECUTE; no INSERT/UPDATE/DELETE policy exists.
- **Every SECURITY DEFINER function pins `search_path`.** All 17 definers probed
  show `{search_path=public}`; the two invoker helpers show
  `{search_path=public}` / `{"search_path=public, pg_temp"}`.
  `normalize_channel_value` is `IMMUTABLE` and calls `normalize_phone_e164`,
  which is itself `IMMUTABLE` (`provolatile = i`) — the declaration is honest.
- **Grants both directions, and the legacy-grants seed regenerates to an empty
  diff** (2633 replayed statements).
- **Idempotent reruns** — all three files replayed over the migrated database
  with no error (transcript in §0).
- **The mirror cannot loop.** It writes `project_parties` only; that table's
  four triggers are two pure BEFORE shapers plus the two AFTER dispatchers,
  both of which now read the guard (probed: exactly three functions in the
  schema mention `patina.suppress_consent_dispatch`). The guard is set with
  `set_config(…, true)` around the mirror's own UPDATE and cleared immediately
  (`00594:976`, `:1053`); the AFTER-row events that UPDATE queues fire at the end
  of that inner statement, inside the window. The release loop
  (`00594:1076-1092`) runs outside the window and calls
  `site_request_dispatch_after_consent()` only — I read `00374:1395-1460` and
  confirmed it writes `site_requests`, the dispatch outbox and the event log,
  never `project_parties` and never `invoke_edge_function`.
- **The affiliation ↔ pointer binding terminates in one hop**, both directions,
  and never touches `OLD` on the INSERT path (probed: inserting a person card
  with `company_id` NULL succeeds — the early return at `00592:603-605` fires
  before the `TG_OP = 'UPDATE' AND OLD.company_id` test at `:618`).
- **Backfill precedence: `opted_out` wins, per org.** SQL blocks 3, 4, 6, 15,
  30, 30e, 30f all pass, including the two-studio isolation case and the
  re-run-never-overwrites case.
- **The send gate fails closed in every branch I could reach.**
  `channelConsentVerdict` refuses on an unresolved org, on a record read error,
  on `opted_out`, on `refusal_unanswered`, on an org-scoped seat refusal, and —
  since r7 R7-M2 — on a failed phone-global scan; `orgHasOptedOutParty` returns
  `true` on a read error and on an unattributable seat.
  `flushDeferredMessages` runs the same two gates in the same order, narrowed to
  the deferred row's own party. `resolveRecipient`'s unchecked reads default to
  `not_asked`, which is the refusing direction on every downstream branch.
- **`people_directory` is untouched by this wave** (`grep` over the three files →
  nothing; the view still reports 12 columns after the reset), and adding columns
  to `studio_contacts` cannot change an existing view's column list.
- **Vocabulary vs direction §3.8 / crm-model §2**: `company_kind` is a superset
  of crm-model's thirteen (plus `inspector`, `other`) and of the shipped UI's
  five, so folding `contact_kind` cannot raise 23514; consent `status` is the
  four Consent words; `studio_channel_consent.channel_kind` is `sms | email`.
  No enum was created and no `ADD VALUE` appears anywhere. Deviations listed in
  m17.
- **Money**: the only money-shaped column added is `retainage_bps`, an integer in
  basis points. No currency amounts, no floats.
- **No prod command, no Strata reference, no cron** in any of the three files,
  the SQL test, or the two edited edge files.
