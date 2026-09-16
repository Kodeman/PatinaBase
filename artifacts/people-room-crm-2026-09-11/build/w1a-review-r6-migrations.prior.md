# W1a — adversarial migration review, round 6 (r6/R6)

Scope: `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`, the
two redefined trigger functions they carry, and the edge files
`supabase/functions/_shared/sms.ts` and `supabase/functions/sms-inbound/pipeline.ts`
where the migrations' invariants land there.

Read first, in full: `rulings.md` (all six sections), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-fix-log-r5.md`.

Local stack only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact, no `.env.local` in the worktree
(`ls apps/*/.env.local` → `no matches found`, checked before the first reset).

**Verdict: NOT clean — 0 blocking, 2 major, 22 minor.**

---

## 0. Gates run, with output

### Reset

`apps/*/.env.local` absent, so nothing could point at prod. Two attempts died
mid-replay with `LegacyMigrationApplyError: Connection error` (at 00578, then at
00293) — the shared local stack was under load from the second stack on the box
(`supabase_db_patina-hours`, port 54422; ours is `supabase_db_supabase`, 54322).
The third ran clean:

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 6"
    version
----------------
 20260910152111
 00594
 00593
 00592
 00591
 00590
```

### SQL tests — 28 blocks, all pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
…
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's own
         evidence standing (r8 W4-M2), and the seat carries the refusal's own words too
         (r9 R5-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Deno tests

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (111ms)
```

### Idempotent re-run — clean

All three files re-executed against the already-migrated database in one
rolled-back transaction. Only `IF NOT EXISTS` notices; the fold returns 0 and
writes nothing:

```
NOTICE:  relation "studio_person_affiliations" already exists, skipping
NOTICE:  relation "studio_contact_rules" already exists, skipping
NOTICE:  relation "studio_contact_channels" already exists, skipping
NOTICE:  relation "studio_channel_consent" already exists, skipping
NOTICE:  column "refusal_unanswered" of relation "studio_channel_consent" already exists, skipping
NOTICE:  column "opt_out_source" … "opt_out_evidence" … "opt_out_recorded_at" … "opt_out_recorded_by" … skipping
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
```

The named-constraint DROP/ADD idiom (`studio_contacts_company_kind_check`, the
two `studio_contact_rules_channels_*_check`, the two 00593 vocabulary CHECKs)
and the `DO $ck$` guard for `studio_channel_consent_opt_out_source_check` all
re-apply without error.

### Legacy grants + generated types regenerate identically

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2632 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql      → (empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm … db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts → (empty)
```

### Lineage — both redefined bodies ARE the grep-winner, verbatim

Every `CREATE (OR REPLACE) FUNCTION` name in the three files, checked against
every earlier migration:

```
$ for f in <18 names>; do grep -rln "CREATE OR REPLACE FUNCTION[^(]*\b$f\b" \
    supabase/migrations/*.sql | grep -v '0059[234]_' | sort | tail -1; done
_site_request_consent_granted_dispatch :: supabase/migrations/00374_field_site_request_loop.sql
fc_dispatch_optin_invite               :: supabase/migrations/00432_twilio_activation_hardening.sql
(the other 16 :: NONE — all new)
```

I extracted `00432:27-68` and `00374:3399-3444` and compared them line by line
against `00594:486-533` and `00594:553-605`. Both are byte-identical apart from
the single first-statement guard
(`IF COALESCE(current_setting('patina.suppress_consent_dispatch', true),'') = '1' THEN RETURN NEW; END IF;`)
and its comment. 00374's trigger `site_request_consent_granted_dispatch`
(`00374:3446-3455`) is left untouched. No signature changed, which is why
neither appears in the types diff. **Lineage check passes.**

### Object probes — RLS, policies, grants

```
          relname           | rls | force | policies
----------------------------+-----+-------+----------
 studio_channel_consent     | t   | f     |        1
 studio_contact_channels    | t   | f     |        4
 studio_contact_rules       | t   | f     |        4
 studio_person_affiliations | t   | f     |        4
```

Predicates read back from `pg_policy`, and they are the ones the brief requires:

- `studio_person_affiliations` — `is_active_studio_member(studio_contact_org(person_id))`
  on all four, with INSERT/UPDATE `WITH CHECK` additionally requiring
  `studio_contact_org(person_id) = studio_contact_org(company_id)`.
- `studio_contact_channels` — `is_active_studio_member(studio_contact_org(owner_id))` on all four.
- `studio_contact_rules` — `CASE subject_type WHEN 'engagement' THEN is_studio_comember(project_party_designer(subject_id)) ELSE is_active_studio_member(studio_contact_org(subject_id)) END`
  on all four (the `project_parties` posture of `00584:884-921` for the job leg).
- `studio_channel_consent` — SELECT only, `is_active_studio_member(organization_id)`.
  No client branch anywhere; a client account is `authenticated` but not a studio
  member, so every one of these reads empty for it.

```
         table_name         |    grantee    |                          privs
----------------------------+---------------+----------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four. The RPC really is the only door:

```
--- direct INSERT into studio_channel_consent as authenticated ---
NOTICE:  refused: 42501 / permission denied for table studio_channel_consent
```

### SECURITY DEFINER + pinned search_path — 18 functions, all pinned

```
                proname                 | prosecdef |            proconfig            | anon | auth | svc
----------------------------------------+-----------+---------------------------------+------+------+-----
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f    | f    | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f    | f    | t
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f    | f    | t
 assert_channel_owner_kind              | t         | {search_path=public}            | f    | f    | t
 assert_studio_contact_designations     | t         | {search_path=public}            | f    | f    | t
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f    | f    | t
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f    | f    | t
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f    | f    | t
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f    | t    | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f    | t    | t
 normalize_channel_value                | f         | {search_path=public}            | f    | t    | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f    | t    | t
 project_party_designer                 | t         | {search_path=public}            | f    | t    | t
 record_channel_consent                 | t         | {search_path=public}            | f    | t    | t
 record_channel_reconsent               | t         | {search_path=public}            | f    | t    | t
 studio_contact_org                     | t         | {search_path=public}            | f    | t    | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f    | f    | t
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f    | f    | t
(18 rows)
```

Every `SECURITY DEFINER` body pins `search_path`. The two `auth=t` trigger
functions (`fc_dispatch_optin_invite`, `mirror_channel_consent_to_parties`) hold
that EXECUTE only from the local `00-legacy-grants.sql` baseline; both take no
arguments and return `trigger`, so a direct call raises before it does anything.
`normalize_channel_value` is declared `IMMUTABLE` and its one dependency
`normalize_phone_e164` really is `IMMUTABLE` (`provolatile = i`), so the
declaration is sound.

### The mirror cannot loop

```
$ psql … "select tgname, p.proname from pg_trigger t … where tgrelid='public.project_parties'::regclass and not tgisinternal"
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite                ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164              (BEFORE, pure)
 set_updated_at_project_parties        | update_updated_at_column                (BEFORE, pure)
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch  ← guarded
```

No trigger on `project_parties` writes `studio_channel_consent`, so the mirror
has no return path; and its own UPDATE is guarded `IS DISTINCT FROM` over the
whole cached tuple, so a re-fire would be a no-op anyway. The release loop calls
`site_request_dispatch_after_consent(uuid)` only — I read that body back out of
the database: it writes `site_requests` and `site_request_dispatch_outbox` and
calls `_site_request_enqueue_dispatch`, with **no** `invoke_edge_function` and
no write to `project_parties` or `studio_channel_consent`. The "durable only, no
outward act" claim holds.

The affiliation pair is loop-free for the same reason: `_sync_person_company_pointer`
guards its UPDATE `IS DISTINCT FROM`, `sync_person_affiliation_from_pointer`
returns at its first test when pointer and open affiliation already agree, and it
holds `patina.suppress_affiliation_sync` across its own write.

### Vocabulary, money, crons, prod

- No `CREATE TYPE` / `ALTER TYPE … ADD VALUE` anywhere in the three files. Every
  new vocabulary is `TEXT` + a named CHECK stated in the DROP/ADD idiom, per PD-4.
- `studio_contacts_company_kind_check` is crm-model §2's list verbatim plus
  `inspector` and `other`, and is a superset of the shipped UI's
  `COMPANY_KIND_LABELS`. ✓
- `studio_channel_consent_status_check` = not_asked/pending/granted/opted_out,
  matching direction §3.8's Consent family (Not asked / Invited / Texting /
  Opted out). ✓ Both source CHECKs are crm-model §2's five names. ✓
- Money: `retainage_bps integer` (basis points, crm-model §2), the only
  money-adjacent column in the wave. No float, no decimal, no cents column
  omitted. ✓
- `grep -n "cron\."` over the three files → no cron. ✓
- `grep -niE "db push|functions deploy|bkvcixdmuyejfzcijpdg|strata|\.supabase\.co|wrangler"` over
  the three migrations and the SQL test → **none**. ✓
- `grep -n "people_directory"` over the three files → **not touched**; the view
  still reads back its twelve columns after the reset
  (`person_id, role, display_name, email, phone, profile_id, project_id,
  designer_id, status_raw, last_touch_at, meta, scope`), and adding columns to
  `studio_contacts` cannot change an explicit-column view. The rebuild is
  correctly listed out of scope in the report's §5. ✓
- Site access card (`project_site_access_cards`, PR-w): not built in this wave,
  so there is no client-portal path to it because there is no table. Nothing in
  W1a adds a client RLS branch to anything. ✓
- Numbering: 00592–00594 appear on this wave's branch and its origin mirror and
  on no other ref (141 refs scanned); `origin/main`'s tip is still
  `00591_notification_log_delivery`. No collision today.

### Repro scripts

Every demonstration below is a single rolled-back transaction against the reset
stack; the three scripts are committed beside this file:

```
build/probe11-r6-sourceless-refusal.sql   → R6-M1
build/probe12-r6-fold-refusal-date.sql    → R6-M2
build/probe13-r6-open-minors.sql          → R6-m6, m8, m9, m17, and the 42501 write-door probe
```

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f <file>`

---

## 1. Prior findings — re-checked

| Finding | Status | Evidence |
|---|---|---|
| r3 M3-1…M3-4, F3 (R-AG/AH/AI/AJ/AK) | closed | blocks 9, 12, 13; `sms.ts:440-513` |
| r2r2 BLOCKING (flush's second gate) | closed | `sms.ts:1048-1090` |
| r4 B-1 (dateless STOP) | closed | `refusal_unanswered` stored; block 16B |
| r4 M-1 (`sms_capable` evidence) | closed | `channel_value_was_on_sms_rail`, both legs; block 15 |
| r4 M-2 (parked site requests) | closed | mirror release loop `00594:789-805`; block 13 |
| r5 B5-1…M5-4 (R-AL/AM/AN/AO/AP) | closed | blocks 18–21 |
| r6 B6-1, M6-1…M6-5 | closed | blocks 22–25; `00592:766-786`, `:827-904` |
| r7 M7-1, M7-2 | closed | blocks 26, 27 |
| r8 W4-M1 (fold read the refusal off one row) | **closed for the flag, NOT for the date** | see R6-M2 |
| r9 R5-M1 (mirrored refusal keeps its own words) | **closed only where the refusal HAS words** | see R6-M1 |
| r9 R5-M2 (report behind the code) | closed for §1–§3/§5; **§5's migration survey is stale again** | see R6-m19 |
| R5-m3 … R5-m18 (16 minors) | **all still open** | re-demonstrated below where cheap |

---

## 2. Findings

### MAJOR — R6-M1. A refusal with no recorded source still reads as the studio's own consent on every seat

**Confidence: high (demonstrated).**
`supabase/migrations/00594_studio_channel_consent.sql:673-683`, consumed at `:725-735`.

r9's R5-M1 made the mirror give the seat the refusal's own evidence when the
verdict is a refusal. The fallback chain it wrote is:

```sql
673  IF NEW.status = 'opted_out' THEN
674    v_seat_source      := COALESCE(NEW.opt_out_source,      NEW.source);
675    v_seat_evidence    := COALESCE(NEW.opt_out_evidence,    NEW.evidence);
676    v_seat_recorded_at := COALESCE(NEW.opt_out_recorded_at, NEW.recorded_at);
677    v_seat_recorded_by := COALESCE(NEW.opt_out_recorded_by, NEW.recorded_by);
```

The second term is justified in the comment at `:657-672` as "the legacy rows
minted before `opt_out_*` existed". **That population does not exist.**
`studio_channel_consent` is created in this same file with all four `opt_out_*`
columns present (`00594:183-187` in the CREATE, restated at `:204-208` as an
ALTER for the rerun path), so no database can hold a row of that shape. What the
fallback actually hits is a different, real, and large population: a refusal
that carries **no source of its own**, where `NEW.source` is then the studio's
own fresh consent written by `record_channel_reconsent()` at `:1418-1422`.

That shape is not exotic. It is what the shipped portal writes on purpose —
`use-coordination.ts:601-618` writes `opted_out` together with
`NOT_ASKED_CONSENT_COLUMNS`, nulling `sms_consent_source`, `sms_consent_evidence`,
`sms_consent_recorded_at`, `sms_consent_disclosure_version` and
`sms_consent_recorded_by` — and it is what every pre-00432 row carries. The fold
mints those verbatim, and this file's own header calls that "exactly the records
the first prod push creates".

Demonstrated end to end against the reset stack (one transaction, rolled back):

```
--- record after the fold (the shipped portal's sourceless, dateless refusal) ---
  status   | refusal_unanswered | source | evidence | opt_out_source | opt_out_evidence
-----------+--------------------+--------+----------+----------------+------------------
 opted_out | t                  |        |          |                |

--- seat BEFORE reconsent ---
 sms_consent_status | sms_consent_source | sms_consent_evidence
--------------------+--------------------+----------------------
 opted_out          |                    |

--- seat AFTER record_channel_reconsent(…, 'written', 'Signed a fresh consent form 11 Sep 2026', 'field-sms-v2') ---
 sms_consent_status | sms_consent_source |          sms_consent_evidence           |    sms_consent_recorded_at
--------------------+--------------------+-----------------------------------------+-------------------------------
 opted_out          | written            | Signed a fresh consent form 11 Sep 2026 | 2026-09-12 02:08:22.410234+00
```

This is R5-M1's exact failure, surviving for the population R5-M1 was raised
about. R-Q's sentence, read off the seat — which is the only copy every shipped
surface reads, since W1a ships no hook for the new table — becomes "Opted out in
writing, 12 Sep 2026", naming the studio's own consent document as the refusal
and dating the refusal to the day the studio filed its paperwork. The seat went
from saying nothing about the refusal (honest) to asserting something false.

Fix, two candidates, either narrow:

- drop the `NEW.source` / `NEW.evidence` / `NEW.recorded_at` / `NEW.recorded_by`
  terms from the refusal branch entirely (the seat's own standing value is then
  the fallback, which is what R-AN wants), since the population the second term
  was written for cannot exist; **or**
- have `record_channel_reconsent()` promote the standing consent set into the
  refusal set before overwriting it — `opt_out_source = COALESCE(scc.opt_out_source, scc.source)`
  and the three siblings — so `opt_out_*` is never NULL beside a consent set the
  studio has since replaced.

---

### MAJOR — R6-M2. The fold keeps the refusal's words and throws away its date

**Confidence: high (demonstrated).**
`supabase/migrations/00594_studio_channel_consent.sql:370-391` (the `refusal`
CTE), consumed at `:401` and `:420-421`.

r8's W4-M1 added the `refusal` CTE so the fold asks the refusal of every seat in
the group rather than of the winning row. The CTE selects four columns —
`sms_consent_source`, `sms_consent_evidence`, `sms_consent_recorded_at`,
`sms_consent_recorded_by` (`:372-375`) — and **not `sms_opt_out_at`**. The
INSERT then takes `opt_out_at` from the *winning* row (`:401`,
`r.sms_opt_out_at`) while taking the refusal's source and words from the
*refusing sibling* (`:420-421`). In the W4-M1 population the winner is a clean
grant, so `opt_out_at` is NULL:

```
-- one studio, one number: a clean 2026 grant and a legacy seat reading `granted`
-- while carrying an unanswered, DATED 2025-11-16 opt-out.
 status  | refusal_unanswered | opt_out_at | opt_out_source |        opt_out_evidence         |  opt_out_recorded_at   |      consented_at
---------+--------------------+------------+----------------+---------------------------------+------------------------+------------------------
 granted | t                  |            | inbound_sms    | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00 | 2026-02-02 00:00:00+00
```

The record now says, of the same refusal, "it arrived by text, it said Replied
STOP, it was written down on 2025-11-16" — and leaves `opt_out_at`, the column
that actually carries *when they refused*, empty. The date has not moved
anywhere; it is still only on the losing sibling seat, which is the thing W4-M1
existed to stop relying on.

Three consequences, all in live behaviour:

1. **R-Q's sentence loses its date for exactly this population.** "Opted out by
   text, 3 Dec 2025, on the Lindqvist kitchen" is composed from
   `opt_out_source` + `opt_out_at` + `origin_project_id` — the migration's own
   comment at `:243-249` says so. Two of the three are present and the date is
   NULL.
2. **The defence-in-depth the file claims is absent where it is claimed.**
   `00594:1103-1105` and the gate itself at `:1201-1205` say the `opt_out_at` date test
   is "KEPT alongside" `refusal_unanswered` so a writer that dates a refusal
   without raising the flag still fails closed. The fold — the writer W4-M1 was
   about, and the one that mints the first prod population — does the mirror
   image: it raises the flag and leaves the date NULL, so the belt-and-braces
   pair collapses to one strand for every record it mints.
3. **The pre-push dry run hides it.** `probe10-r9-fold-dry-run.sql` and the
   report's §5 both print `f.opt_out_recorded_at` and never `opt_out_at`, so the
   operator reading the dry run sees a dated refusal where the row about to be
   written has none.

Sendability is not affected (`refusal_unanswered` carries it, and
`channelConsentVerdict` reads the flag at `sms.ts:487`), which is why this is
major and not blocking.

Fix: add `sms_opt_out_at` to the `refusal` CTE's select list and write
`opt_out_at = COALESCE(r.sms_opt_out_at, f.sms_opt_out_at)` at `:401`. Then
extend the dry-run script and §5 to print `opt_out_at` beside
`opt_out_recorded_at`.

---

### MINOR — R6-m1. `record_channel_consent`'s `opted_out` branch overwrites an inbound STOP's own date, source and words (was R5-m3)

**Confidence: high.** `00594:1137`, `:1143-1146` (the INSERT), `:1156-1157` and `:1174-1184` (the DO UPDATE). Unchanged this round. Any
member typing two fields replaces `inbound_sms` / "Replied STOP" / 3 Dec 2025
with `verbal` / "He told me on site" / today, on the record and, through the
mirror, on every seat. It never opens a send, but the carrier-audit artifact is
one ordinary RPC call from being replaced by hearsay. Keeping the earliest
`opt_out_at`, or refusing to overwrite an `inbound_sms` refusal with a
studio-sourced one, closes it.

### MINOR — R6-m2. `p_origin_project_id` is never checked against the studio (was R5-m4/W4-m5)

**Confidence: high.** `00594:1149` and `:1189` (`record_channel_consent`), `:1423`
(`record_channel_reconsent`). Neither door checks that the project resolves to
`p_organization_id` by the `COALESCE(studio_id, _primary_studio_for(designer_id))`
rule the rest of the file uses, so a record can permanently point at another
tenant's project row. `projects` RLS blanks the join, so R-Q renders empty
rather than leaking a name. One guard beside the membership check closes it.

### MINOR — R6-m3. The one fail-open read left in `channelConsentVerdict` (was R5-m5/W4-m3)

**Confidence: high, impact low.** `supabase/functions/_shared/sms.ts:504-513`.
The final no-studio branch destructures only `data`, so a failed read reads as
"nobody on this number has opted out" — the one branch in that function that
does not follow `orgHasOptedOutParty`'s rule ("A refusal we could not read is
not a refusal we may assume away", `:365-370`). Re-tracing the callers this
round, the fail-open is currently masked: the branch can only return `"unknown"`,
and `resolveRecipient` (`:514-553`) would have to have read the same rows
successfully for `recipient.consent` to be anything but `not_asked`, which
`sendPartySms:775-788` refuses outright. Still worth the two lines — destructure
`error` and `return "refuse"` — because the masking is incidental.

### MINOR — R6-m4. The fold's tiebreak ranks a `granted` row by its opt-out date (was R5-m6/W4-m4)

**Confidence: medium.** `00594:340-348`. Inside a status class the order is
`COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC`,
so two `granted` seats are compared on whichever date each happens to carry. It
no longer decides sendability (the flag is raised either way) but it still
decides which source, words, disclosure version and `origin_project_id` the
record keeps. Make the tiebreak status-aware.

### MINOR — R6-m5. The mirror fans studio-private consent evidence onto client-visible seats (was R5-m7/W4-m6)

**Confidence: medium.** `00594:725-735`. `project_parties_client_select`
(`00420:373-383`) is row-wide, not column-wide, so every `sms_consent_*` column
the mirror writes is readable by the homeowner for any seat with
`show_to_client = true`. Unchanged by this wave, but this wave is what starts
writing studio-authored evidence text into those columns.

### MINOR — R6-m6. `studio_contacts.trades` takes any string (was R5-m8/W4-m11)

**Confidence: high (demonstrated).** `00592:115`. crm-model §2 types it
`array FieldTrade`; `company_kind` beside it got a CHECK and this did not.

```
NOTICE:  trades accepted a non-FieldTrade value      -- UPDATE … SET trades='{not-a-trade}'
```

### MINOR — R6-m7. `studio_contact_rules` engagement rows orphan invisibly and undeletably (was R5-m9/W4-m12)

**Confidence: high (demonstrated).** `00592:715-719` (`subject_id`, no FK,
polymorphic). `is_active_studio_member(NULL)` returns `f` (probed), so a rule
whose subject card or party row is deleted becomes a row no member can SELECT,
UPDATE or DELETE, while the UNIQUE index on `(subject_type, subject_id)` still
holds the slot. A `project_parties` delete is an ordinary portal act
(`useRemoveProjectParty`).

### MINOR — R6-m8. A channel row can be stored with an empty value (was R5-m10)

**Confidence: high (demonstrated).** `00593:242-250`. The normaliser
`COALESCE(..., '')` exists because `value` is `NOT NULL`; there is no
`CHECK (btrim(value) <> '')` behind it.

```
NOTICE:  stored value = [] (length 0)                -- INSERT … value = '   '
```

### MINOR — R6-m9. Nothing enforces one preferred channel per kind (was R5-m11)

**Confidence: high (demonstrated).** `00593:69`. crm-model §2 says "one
preferred channel per kind"; nothing says it in SQL.

```
NOTICE:  preferred mobiles on one card = 2
```

### MINOR — R6-m10. `reach_preference` is neither built nor listed as not built (was R5-m12/W4-m7)

**Confidence: high.** `grep -n "reach_preference" supabase/migrations/0059*.sql
artifacts/…/build/w1a-report.md` → **no match in either**. direction §7 lists it
in the P1 `studio_contacts` (person) row and crm-model §2 carries it (CS4-5,
F-13). The three rule columns dropped beside it are documented as a deliberate
ruling at `00592:33-37`; this one is simply absent, and the report's §5 "Out of
W1a scope by instruction" list does not name it, so W1b has no way to know.
Either build it or add one line to §5. Third round open.

### MINOR — R6-m11. The rule vocabulary cannot say "never text, calling is fine" (was R5-m13/W4-m8)

**Confidence: medium.** `00592:770-786`. `channels_forbidden` is CHECKed against
00593's seven kinds, which are line *types* (`mobile`, `office`, …) and carry no
`sms`/`text` member. F-27 Ray Thao ("phone and email only; NEVER texted") and
F-10 Sam Rowe ("email only; phone for emergencies") both need "this number, but
not by text" and can only be expressed by forbidding `mobile` outright.

### MINOR — R6-m12. 00593 leg (c) is non-sargable and now calls the evidence test twice per row (was R5-m14/W4-m10)

**Confidence: high.** `00593:430-442`. `channel_value_was_on_sms_rail` appears
twice in the leg-(c) select list (once for `sms_capable`, once inside the
`CASE`), and its own inner `EXISTS` predicate wraps the column in
`normalize_channel_value(...)`, so `idx_project_parties_phone_e164` cannot be
used and each call is a sequential scan of `project_parties`. Two scans per
folded party row on the first Strata push. Hoist it into a `LATERAL` the way leg
(a) already does at `:409-414`.

### MINOR — R6-m13. The seat gate is a read-then-write on the INSERT path (was R5-m15)

**Confidence: high.** `00594:1041-1066`. The in-write legs at `:1201-1222` cover
the DO UPDATE path, but when no record exists the only seat test is the read at
`:1041-1051`. A seat marked `opted_out` between that read and the INSERT is not seen.
Narrow window, and the mirror would not clear a refusal it never saw, but it is
the one place the file's own "state the gate inside the write" rule is not kept.

### MINOR — R6-m14. An `email` refusal is a one-way door with no writer that can reopen it (was R5-m16)

**Confidence: high.** `00594:159` (`channel_kind IN ('sms','email')`),
`:1164-1165`, `:1407`. `refusal_unanswered` is lowered by exactly one
writer, `sms-inbound/pipeline.ts`'s `writeChannelConsent`. There is no inbound
email rail, so an `email` record that reaches `opted_out` can never be moved by
any door in the system. Nothing writes email consent yet, which is why this is
minor — but it should be a ruling before something does.

### MINOR — R6-m15. Dropped-error reads on the send path (was R5-m17)

**Confidence: medium.** `sms.ts:517-521` (`resolveRecipient`'s party read),
`:536-540` (its phone-only read), `pipeline.ts` `writeChannelConsent`'s prior
read at `:331-341`. Each destructures only `data`. A failed party read yields
`consent = 'not_asked'`, which happens to block; a failed prior read in
`writeChannelConsent` silently discards an earlier `consented_at` /
`disclosure_version` / `opt_out_*` the upsert is supposed to carry forward.

### MINOR — R6-m16. 00593's channel vocabulary drops four kinds crm-model §2 lists, and the report still does not say so (was R5-m18)

**Confidence: high.** `00593:54-60`, `:85-89`. crm-model §2's `channel_kind` has
eleven values; the table has seven. `app`, `account`, `field_link` and `paper`
are deliberately excluded, and the migration explains why at `:85-89` (they are
reach tiers derived from an access grant, E9). `w1a-report.md` calls it "the
seven-name channel vocabulary" without naming the four or the reason, so the
divergence from the model is invisible to anyone reading only the report.

### MINOR — R6-m17. `escalation_by_class` takes channel names nothing can match — the hole r6 M6-5 closed one column over

**Confidence: high (demonstrated).** `00592:728`. `channels_allowed` and
`channels_forbidden` were CHECKed against the seven-name vocabulary precisely
because "a value the composer cannot match is not a forbidding, it is a silent
permission" (`00592:748-765`). `escalation_by_class` is the third channel-bearing
column on the same row, is read by the same composer (crm-model §2: "map
decision_class to channel", CS5-21 — F-05 wants a phone call over $2,500), and
has no validation of either half:

```
NOTICE:  escalation_by_class accepted unmatched channel names
   -- '{"co":"carrier pigeon","draw":"SMS"}'
```

A `jsonb` CHECK over the values (and over the decision-class keys) is the same
two ALTER statements the arrays got.

### MINOR — R6-m18. The fold's `opt_out_recorded_by` names whoever recorded the *consent*, not the refusal

**Confidence: high.** `00594:371-376`. The `refusal` CTE maps the refusing seat's
`sms_consent_recorded_by` onto `opt_out_recorded_by`. On a seat whose refusal
came in by text, that column holds the studio member who recorded the original
*grant* — which is why the inbound rail deliberately writes NULL there
(`pipeline.ts:391-393`: "nobody in the studio recorded this; the recipient
did"). The fold therefore attributes an inbound STOP to a studio member. Prefer
NULL when the refusing seat's source is `inbound_sms`.

### MINOR — R6-m19. The report's §5 migration-number survey is stale again

**Confidence: high.** `w1a-report.md` §5 says `hour-tracking/integration` carries
00595–00597 and `hour-tracking/server` carries those plus 00598 and 00599. Read
back this round:

```
origin/hour-tracking/server  → …00599_resolve_time_rate_cents, 00600_time_entry_rate_provenance, 00601_classifier_rate_resolver
origin/hour-tracking/edge    → …00591_notification_log_delivery, 00614_time_nudges_cron
```

The load-bearing claim survives — 00592–00594 are held by this wave's branch and
its mirror and by nothing else, across all 141 refs, and `origin/main` is still
at 00591 — but the survey itself is one round out of date, which is the shape
R5-M2 was raised for. Re-run it at merge rather than trusting the paragraph.

### MINOR — R6-m20. The mirror has no DELETE branch

**Confidence: high.** `00594:840-842` — the trigger is `AFTER INSERT OR UPDATE`.
`service_role` holds DELETE on the table. A deleted consent record leaves every
seat in the studio frozen at the deleted verdict, with the send gate then
falling through to those very seats. No caller deletes today; a
`FOR EACH ROW … AFTER DELETE` that re-derives, or a DELETE-refusing rule, would
make that explicit.

### MINOR — R6-m21. `studio_verdict` has no recorder

**Confidence: high.** `00592:109-110`. crm-model §5's Retired row wants "reason,
date, who decided" and §2 types the field "text + dated". The date is there
(`studio_verdict_at`); the "who decided" is not.

### MINOR — R6-m22. A seat-only refusal is still destroyed by removing the seat, and W1a ships no door that writes the durable record

**Confidence: high.** `use-coordination.ts:808` (`useRemoveProjectParty`),
report §5 ("No portal hook or UI"). The whole R-AL mechanism rests on a refusal
standing on a seat being visible to the write door; deleting the seat removes it,
and until W2's hook there is no surface that puts the fact in
`studio_channel_consent` instead. Pre-existing (the seat has always been the only
ledger) and explicitly deferred, but it is the live exposure for the whole
W1a→W2 window and is worth one sentence in the report's §5 beside "no portal
hook".

---

## 3. Checks that came back clean

- Both redefined bodies are the grep-winner, verbatim, with one guard grafted;
  lineage is named in the banner and at each function. 00374's trigger untouched.
- Every other object in the three files is new; `grep` over all earlier
  migrations finds no prior definition for any of the sixteen new names.
- Banner header on all three files; every DDL idempotent (`IF NOT EXISTS`,
  `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, named-constraint DROP/ADD,
  `DROP TRIGGER IF EXISTS` before every `CREATE TRIGGER`, `DROP POLICY IF EXISTS`
  before every `CREATE POLICY`); re-run in one transaction is clean.
- Every new table gets `ENABLE ROW LEVEL SECURITY` and its policies in the same
  file, with `REVOKE ALL … FROM PUBLIC, anon, authenticated` followed by the
  explicit positive grants, and `REVOKE … FROM PUBLIC, anon` on every definer
  RPC (plus `authenticated` on the seven that only triggers call).
- All eleven `SECURITY DEFINER` bodies pin `search_path`.
- `gen_random_uuid()` is the only UUID generator used; no unqualified extension
  function anywhere in the three files.
- Consent backfill precedence: `opted_out` (class 0) over `granted` over
  `pending` over `not_asked`, per `(org, phone_e164)`, org resolved
  `COALESCE(projects.studio_id, _primary_studio_for(designer_id))` — the same
  rule the mirror, the write door and the edge rail use. Per-org isolation is
  asserted by test block 3 (Alpha's older STOP beats Alpha's newer grant while
  Beta's `not_asked` on the same number is untouched).
- The mirror cannot loop, and its release path is durable-only.
- The send gate fails closed on the studio-resolution failure, on the record read
  failure, on `opted_out`, on `refusal_unanswered` at any status, and on a seat
  refusal in the same studio; `flushDeferredMessages` runs the same two gates in
  the same order keyed off the deferred row's own party. The single fail-open
  read is R6-m3, and it is masked downstream.
- No client-portal read path to any new table (all four gate on studio
  membership); the site access card is not built in this wave.
- `people_directory` untouched, all twelve columns intact after the reset.
- No enum `ADD VALUE`, no cron, no money column outside integer basis points, no
  prod command or Strata reference anywhere in the wave's SQL.
- Legacy-grants seed and generated types both regenerate byte-identical.

---

## 4. Recommendation

Two majors, both in the same seam — the refusal's own evidence set. R6-M1 is
R5-M1's fallback firing for the population R5-M1 was raised about; R6-M2 is
W4-M1's CTE keeping the refusal's words and dropping its date. Neither opens a
send: `refusal_unanswered` carries sendability in both cases and the send gate
reads it at `sms.ts:487`. Both corrupt the 10DLC artifact and R-Q's sentence for
exactly the rows the first prod fold mints, and both fixes are small and local
(one COALESCE chain, one CTE column). Fix those two, re-run the SQL suite with
an assertion for each, and re-take the dry-run script so it prints `opt_out_at`.
The twenty-two minors can be triaged; R6-m10 (`reach_preference` absent and
unlisted) and R6-m17 (`escalation_by_class` unvalidated) are the two I would
take with them, being one line and two ALTERs respectively.
