# W1a — adversarial migration review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, head `f7f59f017`.

Scope: `supabase/migrations/00592`, `00593`, `00594`, the two functions 00594
redefines, `supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`,
`supabase/seed/00-legacy-grants.sql`, `packages/supabase/src/database.types.ts`.

Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact. `apps/designer-portal/.env.local` does not exist in this
worktree (checked before the first reset).

**Verdict: NOT CLEAN — 0 blocking, 2 major, 11 minor.**

The two majors are both demonstrated against the live local stack, and both are
regressions of intent rather than of code: each defeats a rule this wave's own
files state in prose.

---

## 0. Gates run, with output

### `.env.local` check (before any destructive action)

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

### Reset

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
Seeding data from supabase/seed/dev-accounts.sql...
… [29 seed files] …
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(The first attempt failed inside the Bash sandbox — `EPERM … /Users/kody/.supabase/telemetry.json.tmp`.
Re-run with the sandbox disabled for that one command; nothing else needed it.)

### SQL tests — all 27 blocks pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  18. the mirror never nulls an evidence column (R-AN): passed
NOTICE:  19. the write door reads the seats too (R-AL): passed
NOTICE:  20. the pointer moves one affiliation, not all of them (R-AO): passed
NOTICE:  21. the designated people are people, in this studio (R-AP): passed
NOTICE:  22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed
NOTICE:  23. the mirror keeps both dates (r6 M6-2): passed
NOTICE:  24. the routed person is a person, in this studio (r6 M6-4): passed
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Edge-function tests

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (95ms)
```

### Legacy grants regenerate identically

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2632 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(empty)
```

### Generated types match the DB

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

### Idempotent re-run

All three files replayed a second time against the freshly reset database inside
one rolled-back transaction — no errors, no duplicate objects, no duplicate rows:

```
$ psql … -v ON_ERROR_STOP=1 -f /tmp/claude/rerun.sql
… CREATE FUNCTION / REVOKE / GRANT / COMMENT …
=== RERUN OK ===
     obj      | count
--------------+-------
 channels     |     0
 consent      |     0
 affiliations |     0
ROLLBACK
```

The three counts are zero because the seeds create **no** `studio_contacts` and
**no** `project_parties` rows at all:

```
 sc | sc_ph | pp | pp_ph | prj
----+-------+----+-------+-----
  0 |     0 |  0 |     0 |   6
```

So the backfills are exercised only by the SQL test's own fixture. The report
says this (§5) and it is correct — but it also means the fold statements have
never been run over data they did not author. Both majors below live in exactly
that untested surface.

### Object probes

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4

         table_name         |    grantee    |                          privs
----------------------------+---------------+---------------------------------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_channels    | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

`anon` holds nothing on any of the four. Every SECURITY DEFINER function pins
`search_path`; every one of the 18 new/redefined functions came back
`anon_x = f`:

```
                proname                 | prosecdef |            proconfig            | anon_x | auth_x | svc_x
----------------------------------------+-----------+---------------------------------+--------+--------+-------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f      | f      | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f      | f      | t
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f      | f      | t
 assert_channel_owner_kind              | t         | {search_path=public}            | f      | f      | t
 assert_studio_contact_designations     | t         | {search_path=public}            | f      | f      | t
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f      | f      | t
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f      | f      | t
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f      | f      | t
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f      | t      | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f      | t      | t
 normalize_channel_value                | f         | {search_path=public}            | f      | t      | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f      | t      | t
 project_party_designer                 | t         | {search_path=public}            | f      | t      | t
 record_channel_consent                 | t         | {search_path=public}            | f      | t      | t
 record_channel_reconsent               | t         | {search_path=public}            | f      | t      | t
 studio_contact_org                     | t         | {search_path=public}            | f      | t      | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f      | f      | t
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f      | f      | t
```

(`auth_x = t` on `mirror_channel_consent_to_parties` is the local
`00-legacy-grants.sql` baseline; it returns `trigger`, so it cannot be called
directly. Same posture as the two redefined dispatchers.)

### Lineage — both redefined bodies are the grep-winner, verbatim

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -1
   → 00594 (this wave). Excluding it: 00284, 00432 → winner 00432.
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" …
   → winner 00374.
```

I read `00432:27-68` and `00374:3399-3444` and compared them line by line with
`00594:376-423` and `00594:443-495`. Both are byte-identical apart from the
single documented delta — the `patina.suppress_consent_dispatch` guard as the
first statement — and both keep the original `SET search_path` spelling
(`= public` for 00432's, `TO 'public'` for 00374's), which is the tell that they
were copied rather than retyped. `00374:3446-3455`'s trigger is untouched.
`COMMENT ON TABLE public.project_parties` (00594:505) restates 00212:46's text
verbatim and appends the invariant. **No finding.**

Every other function name in the three files greps to exactly one file — the one
that creates it. Nothing is redefined from memory.

### Numbering

Head before this wave is `00591_notification_log_delivery`. Across all 200 local
and remote refs the only `0059[2-9]` files are this wave's three and the
hour-tracking wave's `00595`–`00599`. No collision today; numbers stay
provisional until merge.

### `_primary_studio_for` posture (R-AM's premise, re-verified)

```
$ psql … -Atc "select proacl from pg_proc where proname='_primary_studio_for';"
{postgres=X/postgres}
```

Confirmed: revoked from every PostgREST role. The SQL side calls it only from
inside SECURITY DEFINER bodies owned by `postgres` (correct); the edge rail never
calls it (correct).

---

## 1. Prior findings — re-checked

Every finding from r3 through r7 is **closed**. I verified each against the code
rather than against the fix log, and each has a named assertion that passes:

| Finding | Ruling | Where it now lives | Status |
|---|---|---|---|
| M3-1 | R-AG | `00594:801-806` refuses `not_asked`; evidence COALESCEd at `:993-997` | closed (SQL block 9) |
| M3-2 | R-AH | `sms.ts:1047-1051` — the flush reads `channelConsentVerdict` first | closed (Deno) |
| M3-3 | R-AI | both bindings: `00592:511-553` and `00592:578-693` | closed (SQL block 12) |
| M3-4 | R-AJ | `pipeline.ts:605-609` START targets `opted_out`/`pending` records only | closed (Deno) |
| F3 | R-AK | `sms.ts:355-381` scoped to the resolving studio | closed (Deno) |
| r2r2 BLOCKING | — | `sms.ts:1076-1090` flush's second gate narrowed to the deferred party | closed (Deno) |
| r2r2 M-1/M-2 | — | `00594:1002-1033`; `00592:390-437`, `00593:279-315` | closed (blocks 16, 17) |
| r4 B-1 | — | `refusal_unanswered` stored, `00594:159`, `:311-313` | closed (block 16B) |
| r4 M-1 | — | `channel_value_was_on_sms_rail`, `00593:201-221`, both legs | closed (block 15) |
| r4 M-2 | — | mirror's release loop `00594:641-657`; `grantPartiesForStudios` | closed (block 13) |
| B5-1 | R-AL | `00594:877-902` + the same leg inside the write `:1025-1033` | closed (block 19) |
| M5-1 | R-AM | `sms.ts:214-264` reads the tables, never the RPC | closed (Deno) |
| M5-2 | R-AN | mirror COALESCEs every evidence column `00594:583-589` | closed (block 18) |
| M5-3 | R-AO | `00592:641-655` opens one, closes none | closed (block 20) |
| M5-4 | R-AP | `assert_studio_contact_designations` `00592:188-254` | closed (block 21) |
| B6-1 | — | gate reads the refusal, not the verdict `00594:877`, `:1013` | closed (block 22) |
| M6-1 | — | no date test on the seat leg `00594:883` | closed (block 22) |
| M6-2 | — | mirror COALESCEs both dates `00594:583-584` | closed (block 23) |
| M6-3 | — | `sms.ts:487` refuses on `refusal_unanswered` | closed (Deno) |
| M6-4 | — | `assert_studio_contact_rule_route` `00592:827-904` | closed (block 24) |
| M6-5 | — | `channels_allowed/forbidden` CHECKs `00592:766-786` | closed (block 25) |
| M7-1 | — | no RPC lowers the flag `00594:991-992` | closed (block 26) |
| M7-2 | — | reconsent leaves status `00594:1206` | closed (block 27) |

Nothing reopened. The two majors below are **new**, and both are in territory
the prior rounds touched but did not finish.

---

## 2. Findings

### MAJOR — W4-M1. The consent fold reads the refusal off one row, so a sibling seat's unanswered refusal is dropped and the record is minted sendable

**Confidence: high (demonstrated).**
`supabase/migrations/00594_studio_channel_consent.sql:275-290` and `:311-313`.

r7's M7-1 ruled that a folded row carrying an unanswered refusal must be minted
**unsendable**, "whatever the status says" — and the file says so at `:305-310`:

> A row that is not opted_out still counts as an unanswered refusal when it
> carries an opt-out date no later consent has answered — INCLUDING a winner
> whose status reads `granted`.

But `refusal_unanswered` is computed from the `ranked` winner only (`WHERE rn = 1`,
`:318`). The predicate at `:311-313` reads that one row's `sms_consent_status`
and `sms_opt_out_at`. Every other seat the studio holds on the same number is
discarded by `ROW_NUMBER()` before the predicate ever sees it.

So the guarantee holds only when the row carrying the stale refusal happens to
win the ranking. It routinely will not: within `status = 'granted'` the tiebreak
is `COALESCE(sms_opt_out_at, sms_consented_at, …) DESC`, so a clean recent grant
outranks the contaminated row and the refusal is thrown away with it.

**Demonstrated.** One studio, one number `+16125550199`, two seats on two
projects — seat one a clean grant 10 days old, seat two a legacy row reading
`granted` while carrying an opt-out dated 300 days ago that no later consent
answered (the exact shape M7-1 names):

```
$ psql … -f /tmp/claude/fold.sql
 folded
--------
      1

=== the record the fold minted ===
 status  | refusal_unanswered | consented_at | opt_out_at
---------+--------------------+--------------+------------
 granted | f                  | 2026-09-02   |

=== what the send gate would see on the seats (status only) ===
 display_name | sms_consent_status | sms_opt_out_at
--------------+--------------------+----------------
 Seat One     | granted            |
 Seat Two     | granted            | 2025-11-16
```

`refusal_unanswered = false`, `opt_out_at = NULL`. The record is fully sendable.

**Why nothing else catches it.** The send rail's second gate,
`orgHasOptedOutParty` (`sms.ts:355-381`), filters on
`sms_consent_status = 'opted_out'` — seat two reads `granted`, so it is invisible
there too. `channelConsentVerdict` therefore returns `allow`
(`sms.ts:491`) and `sendPartySms` texts the number. `record_channel_consent`'s
own seat leg (`00594:877-902`) asks the same status-only question, so the write
door will not catch it either.

This is the first prod push: `backfill_channel_consent_from_parties()` runs once
inside 00594 on Strata, over real `project_parties` data the local stack does not
have (seed counts above: 0 party rows). The report's §5 mitigation — dry-run the
`ranked` CTE and read it — would not surface this, because the CTE output looks
correct; the loss is in the rows the CTE already dropped.

**Fix.** Compute the refusal as an aggregate over the whole `(org, phone_e164)`
group, not off `rn = 1`. Something like a second CTE beside `ranked`:

```sql
refused AS (
  SELECT org, phone_e164,
         bool_or(sms_consent_status = 'opted_out'
                 OR (sms_opt_out_at IS NOT NULL
                     AND (sms_consented_at IS NULL
                          OR sms_consented_at <= sms_opt_out_at))) AS unanswered
  FROM party_org WHERE org IS NOT NULL
  GROUP BY org, phone_e164
)
```

joined into the INSERT in place of the per-row expression at `:311-313`. Add an
assertion to `w1a_identity_channels_consent_test.sql` block 3 staging exactly the
two-seat shape above, since no existing block has more than one granted sibling.

---

### MAJOR — W4-M2. `record_channel_reconsent()` erases the refusal's own 10DLC evidence, on the record and on every seat

**Confidence: high (demonstrated).**
`supabase/migrations/00594_studio_channel_consent.sql:1206-1226`.

r7's M7-2 made this door evidence-only so that the refusal would keep standing
beside the studio's fresh consent. The file states the goal twice:

> the studio's fresh consent goes on the record where the room can print it
> ("opted out by text, 3 Dec 2025; fresh signed consent 11 Sep 2026, waiting on
> their reply") — `:1143-1145`

> opt_out_at is KEPT. The room still has to be able to say "opted out by text,
> 3 Dec 2025" alongside the fresh consent recorded against it. — `:1207-1208`

The record has exactly one evidence set, and the UPDATE overwrites all of it
unconditionally (`:1216-1220`): `source`, `evidence`, `recorded_at`,
`disclosure_version`, `recorded_by`. `status`, `opt_out_at` and
`refusal_unanswered` survive; **the words and the source of the refusal do not.**
"by text" is `source = 'inbound_sms'`; after reconsent the only stored source is
the studio's own.

**Demonstrated.** A recorded inbound STOP (`source inbound_sms`,
`evidence 'Replied STOP'`), then one `record_channel_reconsent()` call by an
ordinary studio member:

```
=== the record after reconsent (was: source inbound_sms / "Replied STOP") ===
  status   | refusal_unanswered | source  |              evidence               | disclosure_version | opt_out_at
-----------+--------------------+---------+-------------------------------------+--------------------+------------
 opted_out | t                  | written | Signed re-consent form, 11 Sep 2026 | v2                 | 2026-08-13

=== the seat after the mirror ran ===
 sms_consent_status | sms_consent_source |        sms_consent_evidence         | sms_consent_disclosure_version
--------------------+--------------------+-------------------------------------+--------------------------------
 opted_out          | written            | Signed re-consent form, 11 Sep 2026 | v2
```

The mirror propagates it: the tuple guard at `00594:604-616` sees the evidence
columns change, so the UPDATE runs and rewrites `sms_consent_source` /
`sms_consent_evidence` on **every seat in the studio on that number**. The
party-row copy of "Replied STOP" — the only other place the refusal's own words
lived — is gone with it.

**Consequences.**

1. R-Q's sentence is unrenderable. "Opted out by text, 3 Dec 2025, on the
   Lindqvist kitchen." is composed from `source` + `opt_out_at` +
   `origin_project_id`. After reconsent the source reads `written`, so the room
   prints the wrong noun for the refusal — and there is no second slot to read.
2. It contradicts the file's own §3 header claim at `:750` ("NO LAUNDERING, AND
   NO ERASURE") and R-AG's "no status change may null or overwrite consent
   evidence columns". R-AG is scoped to a *status* change and reconsent makes
   none, so it slips the letter of the ruling while breaking its point.
3. The carrier-audit artifact of the refusal is destroyed by a routine studio
   act. Sending stays blocked (`refusal_unanswered` is kept TRUE), so this is not
   a send-safety hole — it is an evidence hole, which is the other half of what
   10DLC asks the record to hold.

**Fix.** Either (a) give the record a second, refusal-side evidence set —
`opt_out_source`, `opt_out_evidence`, `opt_out_recorded_at`,
`opt_out_recorded_by` — populated by every writer that records a refusal
(the fold, `record_channel_consent`'s `opted_out` branch, the inbound STOP rail)
and never touched by reconsent; or (b) make reconsent write into a separate
`reconsent_*` column set and leave `source`/`evidence` as the refusal's. (a) is
the smaller change against the mirror, since the mirror already COALESCEs
per column and the new columns simply have no party-row counterpart.
SQL block 27 currently asserts only that reconsent is re-callable and leaves the
status; it should also assert that the refusal's own source and words survive.

---

### MINOR — W4-m3. The one fail-open read in `channelConsentVerdict`

**Confidence: high.** `supabase/functions/_shared/sms.ts:504-511`.

Every other read in that function refuses on error and says so —
`resolveProjectOrg`'s `failed` (`:451-457`), the record read (`:467-473`),
`orgHasOptedOutParty`'s own `return true` on error (`:365-369`). The no-studio
phone-global branch is the exception:

```ts
const { data: rows } = await supabase
  .from("project_parties")
  .select("sms_consent_status")
  .eq("phone_e164", phone);
```

`error` is discarded. A failed read yields `rows === null` → `anyOptedOut === false`
→ `"unknown"`, which is the *permissive* verdict, in the branch whose whole
purpose (`:502-503`) is "an unattributable send must not outrun a STOP".

In `sendPartySms` the legacy gate usually saves it, but not always: on the
`partyId` path `resolveRecipient` reads only that one row, so if that row says
`granted`, no studio resolves, and this read errors, the send goes out with no
phone-global check having happened. Narrow, but it is the exact branch the
comment above it promises is fail-closed.

**Fix.** Destructure `error` and `return "refuse"` with a `console.error`, the
same shape as `:467-473`.

---

### MINOR — W4-m4. The fold's tiebreak ranks a grant by its opt-out date

**Confidence: high.** `00594:285-286`.

```sql
COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC NULLS LAST
```

`sms_opt_out_at` comes first for *every* status, including `granted`. The
function's own COMMENT (`:334-335`) promises "then the most recent granted", but
a granted row carrying a stale opt-out is ranked by that stale date, not by its
grant. Two granted siblings can therefore be ordered backwards and the record
inherits the older grant's `consented_at`, evidence and `origin_project_id`.

Independent of W4-M1's fix (which removes the *safety* consequence), this still
mis-attributes which job a grant came from, which is the sentence R-Q prints.

**Fix.** Make the tiebreak status-aware — `sms_opt_out_at` first only for
`opted_out`, `sms_consented_at` first otherwise.

---

### MINOR — W4-m5. `p_origin_project_id` is never checked against the studio

**Confidence: high.** `00594:975` and `00594:1221`.

Both RPCs are SECURITY DEFINER and gate the *org* on `is_active_studio_member`,
but neither validates that `p_origin_project_id` belongs to that org. A member
can store any project uuid, and the FK will accept it. The room then prints
R-Q's "…, on the <project>." clause naming a project the studio cannot open, and
the value sits on a record `authenticated` can read.

**Fix.** One guard beside the membership check — refuse unless
`COALESCE(projects.studio_id, _primary_studio_for(projects.designer_id)) = p_organization_id`.

---

### MINOR — W4-m6. The mirror fans studio-private consent evidence onto client-visible seats

**Confidence: medium.** `00594:581-616`; policy `project_parties_client_select`.

The policy is row-level, not column-level:

```
project_parties_client_select | ((show_to_client = true) AND (EXISTS (SELECT 1 FROM projects p
                                WHERE p.id = project_parties.project_id AND p.client_id = auth.uid())))
```

so a homeowner reading a `show_to_client` seat reads `sms_consent_evidence`,
`sms_consent_source` and `sms_consent_recorded_by` on that row. That is
pre-existing (00420/00432). What this wave changes is the *contents*: before,
the evidence the studio typed lived only on the row that captured it; now one
record's evidence is stamped onto **every** seat in the studio on that number,
including client-visible seats on other projects. Free text a designer wrote
about a trade on job A can surface to a homeowner on job B.

Not a new policy and not in W1a's scope to fix, but it is the same class of
concern PR-w rules on for the site access card, and it should be named before
W2 adds a Reach editor that invites longer evidence prose.

**Fix (or at least the note).** Either restrict the mirror to
`show_to_client = false` seats for the evidence columns (status still fans out),
or narrow the client policy to a column list in a later migration. Record the
decision in `rulings.md` rather than leaving it implicit.

---

### MINOR — W4-m7. `reach_preference` is neither built nor listed as not-built

**Confidence: high.** `direction.md §7` (studio_contacts person row);
`crm-model.md §2` Person.reach_preference (CS4-5, "F-13 has no work cell").

00592's header (`:33-37`) and the report's decision 1 name four deliberate
omissions — `never_text`, `do_not_contact`, `do_not_contact_reason`,
`route_to_person_id` — and the report's §5 "Not done" list does not mention
`reach_preference` either. It is simply absent.

`studio_contact_channels.preferred` (00593:69) plausibly supersedes it and is
the better shape, but that is an unstated substitution, and `preferred` has no
uniqueness constraint (crm-model §2: "one preferred channel per kind"), so
nothing yet answers "which channel first" the way `reach_preference` would.

**Fix.** One line in the report saying `preferred` replaces it, plus a partial
unique index `(owner_id, channel_kind) WHERE preferred` — or add the column.

---

### MINOR — W4-m8. The channel vocabulary cannot express "never text, calling is fine"

**Confidence: medium (design-level).** `00593:54-60`, `00592:770-786`.

`channel_kind` is a list of *lines* (mobile / office / dispatch / after_hours /
email / ap_email / portal_311), and r6's M6-5 correctly CHECKed
`channels_forbidden` against it. But the fixture's forbidding facts are about
*modes*, not lines: F-10 Sam Rowe "never texted", F-27 Ray Thao "NEVER texted;
scheduled through 311" (crm-model §2 CS2-5). With this vocabulary the only way
to record "never text" is `channels_forbidden = '{mobile}'`, which also forbids
*calling* the mobile — a different and wrong fact.

crm-model §2 does type the field as `array channel_kind`, so the build matches
the model; the gap is in the model. But W1a is the file that freezes it into a
CHECK constraint, and W1b's rule editor will be written against it.

**Fix.** Either widen the rule vocabulary with `sms` (the mode) alongside the
line kinds and translate at the composer, or record the limitation in
`rulings.md` so W1b's editor does not offer "never text" as a checkbox that
silently means "never call".

---

### MINOR — W4-m9. `w1a-report.md` has outlived the code again

**Confidence: high.** `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:520-543`, `:443-463`, `:504-514`, `:598-603`, `:15`.

This is the third round this has been raised (r2 M-2, r3r2 M-3, r4 M-3). Current
drift:

| Report says | Actual |
|---|---|
| SQL test prints 17 blocks (`:526-541`) | 27 blocks; 18–27 absent from the report |
| `61 passed` Deno (`:603`) | `71 passed` |
| function probe table (`:446-463`) | omits `assert_studio_contact_designations`, `assert_studio_contact_rule_route`, `channel_value_was_on_sms_rail` |
| trigger list (`:504-514`) | omits `assert_studio_contact_rule_route_trg`; `assert_studio_contact_designations_trg` mentioned only in a parenthetical about a different trigger |
| §1 00592 row (`:15`) | omits `assert_studio_contact_designations()`, `assert_studio_contact_rule_route()` and the `channels_allowed/forbidden` CHECKs |

Everything the report *does* claim, I re-ran and it held. The issue is
omission, and the next reader will take the probe tables as the object inventory.

**Fix.** Re-paste §3's four probe outputs from this round and extend §1's table.

---

### MINOR — W4-m10. 00593 leg (c) is O(N²) over `project_parties` on the first Strata push

**Confidence: medium.** `00593:430-442`, `00593:201-221`.

Leg (c) calls `channel_value_was_on_sms_rail()` **twice per party row** — once
for `sms_capable`, once inside the `CASE` for the label — and each call runs

```sql
EXISTS (SELECT 1 FROM public.project_parties pp
         WHERE public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone)) = p_value …)
```

which applies a plpgsql regex function to every row of `project_parties`; no
index is usable. Leg (a) does the same once per rolodex card. The whole file runs
inside one transaction on `supabase db push`.

Locally this is free (0 rows). On Strata it is `rows × 2 × rows` normaliser
calls for leg (c) alone. The report tells the operator to dry-run 00594's consent
fold before pushing (§5) but says nothing about 00593's cost, and a migration
that holds a transaction open on `project_parties` for minutes is worth knowing
about in advance.

**Fix.** Hoist the evidence test into a CTE computed once per distinct
normalised value (`SELECT DISTINCT value … JOIN sms_conversations / party seats`)
rather than per row per call, or at minimum measure it against a prod-shaped row
count and add the number to §5 beside the dry-run instruction.

---

### MINOR — W4-m11. `studio_contacts.trades` takes any string

**Confidence: high.** `00592:115`.

`trades text[] NOT NULL DEFAULT '{}'` has no CHECK, while `studio_contact_rules.channels_allowed/forbidden`
got one in r6 M6-5 for precisely the reason that also applies here: a value the
reader cannot match is silently not there. A firm written `'Radon'` or
`'radon-mitigation'` never appears under the `radon` trade chip and the studio
has no way to see why.

Weaker than M6-5 (it fails closed — a firm goes missing rather than a forbidding
being ignored), and PD-4/PR-f keep the trade vocabulary code-resident, so this
may be a deliberate asymmetry. If so it should be stated, since the two
neighbouring `text[]` columns now have opposite postures.

---

### MINOR — W4-m12. `studio_contact_rules.subject_id` orphans are invisible and undeletable

**Confidence: high.** `00592:718-719`, `:910-958`.

`subject_id` is polymorphic and carries no FK (correctly — three target tables).
But every policy resolves it through `studio_contact_org(subject_id)` or
`project_party_designer(subject_id)`, both of which return NULL for a missing
row, and `is_active_studio_member(NULL)` is false. So a rule whose subject card
or party row is deleted becomes invisible to **and** undeletable by every
authenticated member, while still occupying the unique `(subject_type, subject_id)`
slot — a later card reusing that uuid is impossible, but a `service_role` sweep
becomes the only way to clean up.

`studio_contacts` has no DELETE policy (00417 archives instead) and
`project_parties` deletes are the documented G-10 hard-delete path
(`use-coordination.ts:814`), so the engagement leg is the live one.

**Fix.** Either an `ON DELETE` sweep trigger on `project_parties` /
`studio_contacts`, or a `service_role` cleanup in the P2 sweep, plus a note that
the engagement leg's rows die with G-10's hard delete.

---

### MINOR — W4-m13. `studio_contact_org()` / `project_party_designer()` resolve identifiers for any uuid, to any member

**Confidence: high; severity low.** `00592:63-74`, `:83-97`.

Both are SECURITY DEFINER, unqualified by the caller's own access, and granted
directly to `authenticated`. They must be — a policy expression is evaluated as
the invoking role, so the grant is load-bearing. But they return an **identifier**
(`organization_id`, `designer_id`) rather than a boolean, so any authenticated
user holding a card or party uuid can resolve which studio owns it, or which
designer leads its project, without any membership in that studio. Contrast
`is_active_studio_member(uuid) → boolean`, which reveals nothing.

Requires a foreign uuid to start from, so the practical exposure is small and
this is inherent to the chosen pattern. Named so it is a decision rather than an
accident: if it matters, the helpers can return `boolean` taking the caller's
membership as the question (`is_member_of_card_org(uuid)`), which is what the
policies actually ask.

---

## 3. Checks that came back clean

Recorded so the next round does not re-derive them.

- **Grafted bodies** — both verbatim from the grep-winner, diffed by hand
  (§0). The `SET search_path` spelling difference between the two is preserved,
  which is the strongest evidence of a real copy.
- **RLS predicate per table** — matches `direction.md §7` and the brief:
  affiliations / channels / card-rules on `is_active_studio_member(studio_contact_org(...))`;
  the rules' engagement leg on `is_studio_comember(project_party_designer(...))`,
  matching `00584:884-921`; consent on `is_active_studio_member(organization_id)`
  with SELECT only and no write policy at all.
- **Grants both directions** — every new table has
  `REVOKE ALL … FROM PUBLIC, anon, authenticated` followed by the explicit grant;
  every definer RPC has `REVOKE … FROM PUBLIC, anon` (and `authenticated` too
  where it takes a caller-supplied id and writes). `anon` ends with nothing.
  Legacy-grants seed regenerates with an empty diff.
- **SECURITY DEFINER search_path** — all pinned (§0 probe).
- **Idempotency** — full re-run of all three files, no errors, no duplicates.
  The DROP/ADD idiom is used for every CHECK so a rerun can widen; every index
  and trigger is `IF NOT EXISTS` / `DROP … CREATE`; both backfills are
  `ON CONFLICT DO NOTHING`. Ordering inside 00592 is right: the unique index and
  the kind-assert trigger precede the affiliation fold, and the pointer trigger
  follows it.
- **The mirror cannot loop** — `mirror_channel_consent_to_parties` writes only
  `project_parties`; that table's four triggers are two pure BEFORE shapers and
  the two AFTER dispatchers, both of which return at the suppression guard, and
  none writes `studio_channel_consent`. The release loop calls
  `site_request_dispatch_after_consent()` (00374:1395), which I read: it locks
  `project_parties` `FOR UPDATE` but never writes it, so calling it after the
  flag is cleared starts nothing. Double-release is prevented by
  `consent_status_snapshot IS DISTINCT FROM 'granted'` (`00594:647`), and the
  inbound rail's party-first ordering makes the mirror's capture come back empty.
- **The affiliation binding terminates** — traced both directions by hand
  (set → insert under suppression → pointer trigger returns NULL; clear → close
  the named row → re-derive → second entry hits the `IS NOT DISTINCT` early
  return at `00592:601`). `_sync_person_company_pointer`'s UPDATE is itself
  `IS DISTINCT FROM`-guarded.
- **The send gate fails closed** in every branch of `channelConsentVerdict` and
  `flushDeferredMessages` except W4-m3.
- **Backfill per-org isolation** — `PARTITION BY org, phone_e164` with
  `COALESCE(studio_id, _primary_studio_for(designer_id))` resolved identically on
  the SQL side, the send rail (`sms.ts:276-297`) and the inbound rail
  (`pipeline.ts:205-241`). SQL block 3 asserts Beta is untouched by Alpha's STOP.
- **Consent precedence `opted_out` wins** — `CASE … WHEN 'opted_out' THEN 0`
  (`00594:280`); asserted by block 3. (The *flag* derived alongside it is
  W4-M1.)
- **`people_directory`** — not touched by any of the three files
  (`grep -l people_directory 0059[234]*.sql` → empty). W1a does not rebuild it
  and the 15 new `studio_contacts` columns are additive, so the six branches and
  their per-branch predicates are unchanged. Nothing to check here until W1b.
- **The site access card** — `project_site_access_cards` is not built in W1a
  (report §5), so PR-w's "no client RLS branch" has nothing to violate yet.
  Re-check at the wave that builds it.
- **Vocabulary vs `direction.md §3.8`** — consent statuses
  `not_asked/pending/granted/opted_out` map 1:1 onto Not asked / Invited /
  Texting / Opted out. `company_kind` is crm-model §2 verbatim plus the two
  documented additions, and is a superset of the shipped
  `COMPANY_KIND_LABELS`. `channel_kind` narrows crm-model §2 by dropping
  app/account/field_link/paper, documented at `00593:86-90` as reach tiers
  belonging to E9 — correct. Stage and Paper families are out of W1a scope.
- **CHECK, not enum** — `company_kind`, `channel_kind`, `status`,
  `subject_type`, `owner_type`, consent `status`/`channel_kind` and both channel
  arrays are all TEXT + CHECK. No `ADD VALUE` anywhere. PD-4 held.
- **Money in cents** — no money column added. `retainage_bps` is an integer rate
  in basis points, which is correct and commented as such (`00592:167-169`).
- **Extension functions** — `gen_random_uuid()` resolves in `pg_catalog` on this
  stack (built-in since PG13) and 106 prior migrations call it bare; no
  `uuid_generate_*`, no `crypt`, no bare extension call anywhere in the three
  files. No cron in this wave.
- **No prod command** — `grep` for `db push`, `functions deploy`, `supabase.co`,
  `bkvcixdmuyejfzcijpdg` across the three migrations, the SQL test and the two
  edge files: nothing.
- **Numbering** — 00592–00594 after head 00591, no collision across 200 refs.

---

## 4. Recommendation

Fix **W4-M1** and **W4-M2** before this wave is called done; both are small,
local changes with a clear test to add beside each. W4-m3 is a one-line change
and worth taking in the same pass. The rest are notes for the report, for
`rulings.md`, or for W1b.

The fold statements remain the least-tested code in the wave — the local stack
has zero source rows, so they are exercised only by fixtures the author wrote.
Whatever else lands, W4-M1's regression test should stage a multi-seat studio,
which no existing block does.
