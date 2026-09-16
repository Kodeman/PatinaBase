# W1a — adversarial migration review, round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact.
`ls apps/*/.env.local` → `no matches found` (checked before the reset), so
nothing in this worktree points at prod.

Files read in full: `00592_people_cards_affiliations_rules.sql` (1061),
`00593_studio_contact_channels.sql` (583), `00594_studio_channel_consent.sql`
(1704), `supabase/tests/people/w1a_identity_channels_consent_test.sql` (3767),
`_shared/sms.ts` (1170), `sms-inbound/pipeline.ts` (1259).

**Verdict: NOT clean — 2 major, 0 blocking, 15 minor.**

---

## 1. What I ran

### 1.1 Reset (full replay + seeds)

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

(The first attempt failed inside the sandbox on `~/.supabase/telemetry.json`
— `EPERM` — not a migration failure. Re-run with the sandbox disabled for that
one command.)

### 1.2 SQL suite

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal … (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and the
         wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

33 NOTICE lines fired (`grep -c "NOTICE:"` → 33).

### 1.3 Deno suites

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (109ms)
```

### 1.4 Idempotent rerun (all three files, twice, one rolled-back transaction)

```
$ { echo 'BEGIN;'; for i in 1 2; do cat 00592 00593 00594; done; echo 'ROLLBACK;'; } \
  | psql … -v ON_ERROR_STOP=1 -f -
ROLLBACK
```

No `ERROR` line. The `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`
+ named `DROP CONSTRAINT IF EXISTS`/`ADD CONSTRAINT` + `DROP TRIGGER IF EXISTS`
idiom holds throughout, and 00594's guarded `DO $ck$` block for
`studio_channel_consent_opt_out_source_check` is a no-op on the fresh-create
path.

### 1.5 Grants seed and generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git -C … diff --stat supabase/seed/00-legacy-grants.sql
   (empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
$ git -C … diff --stat packages/supabase/src/database.types.ts
   (empty)
$ git -C … status --short -- supabase packages
   (empty)
```

The committed seed and the committed generated types both regenerate byte-identical.

### 1.6 Grep-winner lineage — both redefined functions, diffed, not read

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort
supabase/migrations/00284_field_dispatch_wiring.sql
supabase/migrations/00432_twilio_activation_hardening.sql   ← winner (00432:27)
supabase/migrations/00594_studio_channel_consent.sql

$ diff -u <(awk '/CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite/,/^\$\$;/' 00432) \
          <(awk '…' 00594)
@@ -5,6 +5,12 @@
 AS $$
 BEGIN
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
```

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" …
supabase/migrations/00374_field_site_request_loop.sql        ← winner (00374:3399)
supabase/migrations/00594_studio_channel_consent.sql

$ diff -u <(awk … 00374) <(awk … 00594)
@@ -8,6 +8,13 @@
   v_dispatch jsonb;
 BEGIN
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'granted'
```

Both grafts are the grep-winner body **verbatim plus exactly one guard**,
inserted as the first statement, with no other line changed. The banner lineage
(`00432:27-68`, `00374:3399-3444`, triggers `00284:254-257` / `00374:3446-3455`)
matches. **Clean.**

Every other function name in the three files is new — checked one at a time:

```
$ for f in $(grep -ho "CREATE OR REPLACE FUNCTION public\.[a-z_]*" 0059[2-4]*.sql | …); do
    grep -rln "CREATE OR REPLACE FUNCTION[^(]*\b$f\b" supabase/migrations/*.sql | grep -v 0059[2-4]_; done
_site_request_consent_granted_dispatch :: 00374
fc_dispatch_optin_invite               :: 00284 00432
(all 17 others)                        :: NONE
```

### 1.7 Numbering

`ls supabase/migrations/*.sql | sort | tail` → head before this wave is
`00591_notification_log_delivery.sql`; the wave mints `00592`/`00593`/`00594`
in sequence, and the one timestamp-named file (`20260910152111`) sorts after and
is correctly ignored for numbering. `inventory.md (b)` agrees. **Clean**
(provisional until merge, as the skill requires).

### 1.8 Objects, RLS, grants, definer posture (probed, never the ledger)

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4
```

Predicates read off `pg_policy`, all four tables, all eight legs:

- `studio_contact_channels` — `is_active_studio_member(studio_contact_org(owner_id))`
  on SELECT/INSERT/UPDATE/DELETE. Correct family.
- `studio_person_affiliations` — same via `person_id`, with INSERT/UPDATE
  `WITH CHECK` additionally pinning `studio_contact_org(person_id) =
  studio_contact_org(company_id)`. Correct.
- `studio_contact_rules` — `CASE subject_type WHEN 'engagement' THEN
  is_studio_comember(project_party_designer(subject_id)) ELSE
  is_active_studio_member(studio_contact_org(subject_id)) END` on all four.
  Correct: the `project_parties` family gets 00584's predicate, the
  `studio_contacts` family gets 00417's.
- `studio_channel_consent` — SELECT only, `is_active_studio_member(organization_id)`.

Grants, both directions:

```
         table_name         |    grantee    |                          privs
----------------------------+---------------+--------------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,REFERENCES,SELECT,…
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four, and `record_channel_consent()` really is
the only door into the consent table for a member (no write grant, no write
policy). Every `SECURITY DEFINER` function pins `search_path`:

```
                proname                 | prosecdef |            proconfig            | anon | auth
----------------------------------------+-----------+---------------------------------+------+------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f    | f
 _sync_person_company_pointer           | t         | {search_path=public}            | f    | f
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f    | f
 assert_channel_owner_kind              | t         | {search_path=public}            | f    | f
 assert_studio_contact_designations     | t         | {search_path=public}            | f    | f
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f    | f
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f    | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f    | f
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f    | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f    | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f    | t
 normalize_channel_value                | f         | {search_path=public}            | f    | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f    | t
 project_party_designer                 | t         | {search_path=public}            | f    | t
 record_channel_consent                 | t         | {search_path=public}            | f    | t
 record_channel_reconsent               | t         | {search_path=public}            | f    | t
 studio_contact_org                     | t         | {search_path=public}            | f    | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f    | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f    | f
(19 rows)
```

The two `authenticated=X` trigger functions (`fc_dispatch_optin_invite`,
`mirror_channel_consent_to_parties`) are `RETURNS TRIGGER` with no arguments, so
Postgres refuses a direct call regardless; that is the local
`00-legacy-grants.sql` baseline, not a new grant.

`normalize_channel_value` is declared `IMMUTABLE` and delegates to
`public.normalize_phone_e164`, which I probed as `provolatile = 'i'` — the
declaration is honest, not a lie that would mis-fold a constant.

### 1.9 Other spot checks

- **No prod command anywhere.** `grep -niE "db push|functions deploy|
  bkvcixdmuyejfzcijpdg|supabase\.co|wrangler deploy"` over the three migrations,
  the SQL test, and the report returns only the report's own negations.
- **Money in cents.** No money column is added by this wave.
  `retainage_bps integer` is basis points, not currency; `tax_id_last4` is not a
  number. Clean.
- **Client-portal path to the site access card.** `project_site_access_cards`
  is not created by this wave (report §5 lists it out of scope), and every policy
  the wave does add is `TO authenticated` with a studio-member predicate — no
  client branch, no `show_to_client`. PR-w is not violated here.
- **`people_directory`.** Not rebuilt this wave; probed unchanged at its 12
  columns (`person_id … scope`). Adding columns to `studio_contacts` cannot
  change an existing view's column list, and the 20 readers I grepped are
  untouched.
- **Mirror loop.** `mirror_channel_consent_to_parties()` writes only
  `project_parties`; `project_parties` carries no trigger that writes
  `studio_channel_consent` (probed: four non-internal triggers, two pure BEFORE,
  two guarded AFTER). The affiliation pair
  (`sync_studio_contact_company_pointer` ↔ `sync_person_affiliation_from_pointer`)
  terminates on the `patina.suppress_affiliation_sync` flag plus an
  `IS NOT DISTINCT FROM` early return; block 12 exercises it and passes.
- **Send gate fails closed in every branch.** I traced all four:
  `resolveProjectOrg` failed → `refuse`; `studio_channel_consent` read error →
  `refuse`; `orgHasOptedOutParty` read error → `true` → `refuse`;
  `orgsOfProjects` failed → `refuse`. The one branch that swallows its error
  (the no-studio phone-global read, `sms.ts:503-511` — **R4-m2, still open**)
  falls through to `"unknown"`, and the legacy gate below then refuses the send
  as `not_consented`/`not_invitable` because `resolveRecipient` also defaults to
  `not_asked`. Closed, by two layers, not one.
- **Vocabulary vs direction §3.8 / crm-model §2.** `company_kind` is crm-model §2
  verbatim plus `inspector`/`other`, and is a superset of the shipped
  `COMPANY_KIND_LABELS` (gc/workroom/showroom/vendor/supplier —
  `company-row.tsx:34`). `channel_kind` is crm-model §2's Reach list minus
  app/account/field_link/paper, documented. Consent `status` maps onto §3.8's
  four consent words. All CHECK constraints, no enums; `contact_kind` left free
  TEXT per PD-4. Clean.
- **Backfill precedence and per-org isolation.** `ranked`'s `CASE` puts
  `opted_out` first; the partition is `(org, phone_e164)`; block 3 proves Alpha's
  older STOP beats Alpha's newer grant while Beta's `not_asked` is untouched.
  Clean.

---

## 2. Findings

Severity: **blocking** = must change before merge; **major** = must change
before the prod fold / before the surface it corrupts is read; **minor** = worth
a line. Confidence is stated separately.

### MAJOR

---

#### R5-M1 — the R-AR identity guard does not count `studio_contact_rules.subject_id`, so one `entity_kind` flip files a forbidding rule under the wrong noun and the rule can never be re-saved
**severity: major · confidence: high (demonstrated) ·
`supabase/migrations/00593_studio_contact_channels.sql:517-545`**

R-AR says the guard refuses the change "while any channel, designation, rule
route, or affiliation still points at the card". `assert_studio_contact_identity_stable()`
counts exactly those four:

```sql
… FROM public.studio_contact_channels c WHERE c.owner_id = OLD.id          -- :517-519
… FROM public.studio_contacts sc WHERE sc.paperwork_contact_person_id = OLD.id
                                    OR sc.signer_person_id = OLD.id
                                    OR sc.site_contact_person_id = OLD.id  -- :524-528
… FROM public.studio_contact_rules r WHERE r.route_to_person_id = OLD.id   -- :533-535
… FROM public.studio_person_affiliations a WHERE a.person_id = OLD.id
                                              OR a.company_id = OLD.id     -- :540-542
```

There is a **fifth** pointer at `studio_contacts`, minted by this same wave:
`studio_contact_rules.subject_id` (`00592:721`). It is polymorphic and
deliberately unFK'd, and the wave's own `assert_studio_contact_rule_route()`
polices it from the rule side — `rule_subject_kind_mismatch` (`00592:929-937`),
added for r8 F1 with the reasoning spelled out at `00592:872-888`: *"a rule filed
under the other noun is invisible to every reader that asks correctly, and a
FORBIDDING rule nobody finds fails OPEN."* The identity guard is the half that
closes the same hole from the card side, and it omits the column.

`entity_kind` is member-writable (`studio_contacts_member_update`,
`is_active_studio_member(organization_id) AND archived_at IS NULL`, probed) and
is a column the shipped data layer writes (`use-studio-contacts.ts:232`).

**Demonstrated** (`$TMPDIR/r5probe2.sql`, rolled back). A card legal as both
kinds, carrying F-27's forbidding rule:

```
=== ACT: flip the rule SUBJECT card person -> company ===
NOTICE:  ACCEPTED — identity guard did not hold the card

=== the forbidding rule is now filed under the wrong noun ===
 subject_type | entity_kind | noun_agrees | channels_forbidden
--------------+-------------+-------------+--------------------
 person       | company     | f           | {sms}

=== a reader holding a COMPANY card asks by its own noun and finds nothing ===
 found
-------
     0

=== and the rule table itself would now REFUSE this row on any re-save ===
NOTICE:  rule re-save REFUSED: rule_subject_kind_mismatch

=== CONTROL: a channel on the same card DOES hold it ===
NOTICE:  REFUSED by channel holder: studio_contact_identity_held
```

The control is the point: the guard *does* fire for a channel on the very same
card, so this is an omission from the holder list, not an absent guard. And the
state is **unrepairable through the rule table** — `rule_subject_kind_mismatch`
refuses any later write to the stranded row, so W1b's rule editor cannot fix
what the card editor broke.

The `organization_id` leg has the mirror-image hole
(`$TMPDIR/r5probe3.sql`, rolled back): moving the SUBJECT card to another studio
is accepted, and the rule is left routing across tenants — the exact state
`rule_route_other_studio` exists to refuse, since the guard only counts cards
that are *routed to*, never the card that is *ruled about*:

```
=== ACT: move the SUBJECT card to another studio ===
NOTICE:  ACCEPTED — subject card moved studios
=== the rule now routes ACROSS TENANTS ===
             subject_org              |              route_org               | same_studio
--------------------------------------+--------------------------------------+-------------
 c2000000-…-00000000000b | c2000000-…-00000000000a | f
=== can the rule row even be re-saved after that? ===
NOTICE:  rule re-save REFUSED: rule_route_other_studio
```

(A cross-tenant route is what R-L / R-S print as the one line telling a designer
how to reach a do-not-contact person — `00592:858-864` says so itself.)

W1a ships no writer for `studio_contact_rules`, so nothing is broken *today* —
which is precisely the argument `00592:764-766` makes for closing the channel
vocabulary now rather than at W1b. The same argument applies here, and the fix
is two more counts in a list the file already builds.

**Fix.** Add to `assert_studio_contact_identity_stable()`:

```sql
  SELECT count(*) INTO v_n
    FROM public.studio_contact_rules r
   WHERE r.subject_type IN ('person','company') AND r.subject_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' contact rule(s) filed against this card');
  END IF;
```

and extend block 29 with the two probes above as 29g/29h.

---

#### R5-M2 — a mirrored refusal lends the seat the GRANT's recorder: every inbound STOP leaves the seat naming a studio member as the person who refused
**severity: major · confidence: high (demonstrated) ·
`supabase/migrations/00594_studio_channel_consent.sql:842-853`, `:903-911`, `:936-944`**

Decision 22/23 gave the mirror a refusal branch: when `NEW.status = 'opted_out'`
the seat's four evidence columns come from `NEW.opt_out_*`, and when the refusal
is *wordless* they are written NULL rather than COALESCEd. The wordless test is
**one column wide**:

```sql
    v_refusal_wordless := NEW.opt_out_source IS NULL;        -- :847
```

and the writes stay per-column COALESCE otherwise:

```sql
 sms_consent_recorded_by = CASE WHEN v_refusal_wordless THEN NULL
                                ELSE COALESCE(v_seat_recorded_by, pp.sms_consent_recorded_by) END,  -- :910-911
```

`opt_out_recorded_by` is **deliberately and always NULL** on a rail-written
refusal — `pipeline.ts:403-405` writes `opt_out_recorded_by: status === "opted_out" ? null : …`,
and 00594's own column comment and R7-M1 both name that NULL as the point
("nobody in the studio recorded it; the recipient did";
`00594:1384-1387`: *"opt_out_recorded_by named a studio member for a refusal the
recipient made — the attribution the inbound rail deliberately writes NULL to
avoid"*). But `NEW.opt_out_source` is `'inbound_sms'`, so `v_refusal_wordless`
is **false**, and the COALESCE hands the seat `pp.sms_consent_recorded_by` —
which on a seat that previously held a recorded grant is the studio member who
recorded **the grant**.

**Demonstrated** (`$TMPDIR/r5probe4.sql`, rolled back). This is F-12 Pete Rusk
verbatim (`fixture.md:96` — "granted 2025-05-02, then STOP 2025-12-03 after
close"): one seat with a written grant recorded by member `…0002`, then the
inbound STOP rail's record written exactly as `writeChannelConsent` writes it.

```
=== THE SEAT BEFORE THE STOP ===
 sms_consent_status | sms_consent_source |       sms_consent_evidence        | sms_consent_recorded_by
--------------------+--------------------+-----------------------------------+--------------------------
 granted            | written            | Signed the Lindqvist kickoff form | c3000000-…-000000000002

=== THE RECORD (opt_out_recorded_by is NULL — the recipient refused) ===
  status   | opt_out_source | opt_out_evidence | opt_out_recorded_by
-----------+----------------+------------------+---------------------
 opted_out | inbound_sms    | Replied STOP     |

=== THE SEAT AFTER THE MIRROR ===
 sms_consent_status | sms_consent_source | sms_consent_evidence | sms_consent_recorded_by  | seat_names_a_studio_member_as_the_refuser
--------------------+--------------------+----------------------+--------------------------+-------------------------------------------
 opted_out          | inbound_sms        | Replied STOP         | c3000000-…-000000000002  | t
```

The record says truthfully "nobody here recorded this refusal". The seat — the
only copy any shipped surface reads, since W1a ships no hook for the new table —
says a named studio member did. That is the carrier-audit attribution R7-M1 ruled
on, landing one table over, on the ordinary STOP path, with no unusual setup and
no later act by anyone.

The same one-column test leaves two sibling holes, reachable on folded legacy
data where `project_parties` carries a `sms_consent_source` without the rest of
its set: a refusal with `opt_out_source` set and `opt_out_evidence` NULL takes
the sibling seat's grant *words* under the refusal's source; one with
`opt_out_recorded_at` NULL takes the grant's *date*. R-AQ's premise — "a NULL
here means there were never any refusal words" — is asserted of the whole set in
the comments (`00594:812-816`) but tested on `opt_out_source` alone.

**Fix.** Decide the refusal's four columns as a set, not per column. The
smallest correct change: when `NEW.status = 'opted_out'`, write each of the four
from `NEW.opt_out_*` with **no** seat fallback at all (the record is the
authority for the refusal's own evidence, and every writer that has refusal
words fills what it has) — i.e. drop the `COALESCE(v_seat_*, pp.*)` on the
refusal branch and keep R-AN's refresh-never-erase for every other transition.
That collapses `v_refusal_wordless` into the same `CASE` and makes the NULL
attribution the seat's answer too. Mirror the change into the tuple guard at
`:936-944`, and extend block 27 with the probe above (a seat holding a grant's
recorder, an inbound STOP, assert the seat's `sms_consent_recorded_by` is NULL).

---

### MINOR

Ordered by how much they cost if left. Every prior-round minor I could still
reach is re-checked here with its current state.

| # | Finding | State | Evidence |
|---|---|---|---|
| R5-m1 | **`w1a-report.md` §3 is stale for the sixth consecutive round.** §3's constraint listing (`:729-730`) prints the **seven**-name channel arrays; the applied constraints carry eight (`…,'portal_311'::text, 'sms'::text]`) since r4 R4-M2. §3's SQL transcript ends at block 30 and omits **30e** and **31**, both of which fire (33 NOTICE lines, not 30). §1's 00592 row (`:15`) still says "both `<@` the seven-name channel vocabulary". §1's grants line (`:42-44`) says "baseline + 2632 replayed statements"; the generator prints **2633**. | **open** (was R4-m1, r2 R2-M2 before it) | `pg_get_constraintdef` vs report `:729`; `grep -c NOTICE:` → 33; generator stdout |
| R5-m2 | `channelConsentVerdict`'s last branch swallows its read error, unlike the three above it. `const { data: rows } = await supabase…` with no `error` — a failed read reads as "nobody opted out" → `"unknown"`. Verified to still fail closed downstream (§1.9), which is why it stays minor, but it is the one branch in the function that does not say so itself. | **open** (R4-m2) | `sms.ts:503-511` |
| R5-m3 | The inbound rail's writes swallow their errors and Twilio never retries a 200: `writeChannelConsent`'s `upsert` (`pipeline.ts:363-410`), `optOutAllForPhone`'s `update` (`:423-428`) and `grantPartiesForStudios`'s `update` (`:456-470`) all discard the result. A CHECK or FK failure on the consent upsert loses the record silently; the phone-global party write is the only thing left carrying the STOP. | **open** (R4-m3) | `pipeline.ts:363, :423, :456` |
| R5-m4 | The record's `origin_project_id` follows the current verdict in both writers, so a refusal recorded from job B over a refusal that arrived on job A moves the job R-Q's sentence names. | **open** (R4-m4) | `00594:1423`; `pipeline.ts:409` |
| R5-m5 | `grantPartiesForStudios` writes `sms_opt_out_at: null` onto every seat — the erase r6 M6-2 forbade the mirror from doing. Mitigated in practice: the mirror runs after and restores the date from `prior.opt_out_at`; it is lost only where the target studio has no prior record, which is the `pending`-seat YES case where there is usually no date to lose. | **open** (R4-m5) | `pipeline.ts:465` |
| R5-m6 | `studio_contact_org(uuid)` and `project_party_designer(uuid)` are SECURITY DEFINER, granted to `authenticated`, and answer for **any** uuid — a signed-in user who holds a card id learns which studio owns it, and which designer leads a party's project. They exist for the policies; nothing outside a policy calls them. | **open** (R4-m6) | `00592:75-76, :98-99`; probe §1.8 |
| R5-m7 | `tax_id_last4 char(4)` blank-pads; crm-model §2 says `text`. `'12'` stores as `'12  '` and compares unequal to `'12'`. | **open** (R4-m7) | `00592:119` |
| R5-m8 | One function pins a different `search_path` spelling from the other eighteen: `normalize_studio_contact_channel` uses `SET search_path = public, pg_temp`. Harmless (SECURITY INVOKER), but it is the one row that does not match. | **open** (R4-m8) | `00593:248`; probe §1.8 |
| R5-m9 | The identity guard holds the card that is POINTED AT, never the card that POINTS: a company card carrying three designations can flip to `entity_kind = 'person'` unopposed, since `assert_studio_contact_designations_trg` does not list `entity_kind` in its `UPDATE OF`. (R5-M1 is the sharp sibling of this; the designation case is cosmetic because the designations' own targets stay valid.) | **open** (R4-m9) | `00592:252-256`; `00593:512-515` |
| R5-m10 | `reach_preference` is still neither built nor recorded as not built. `direction.md:387` lists it on the person card and `crm-model.md:80` defines it (`enum text/email/phone/office/app`, F-13); `grep -rn reach_preference supabase/` is empty, 00592's deliberate-omission list (`:35-43`) names only `never_text`/`do_not_contact`/`do_not_contact_reason`/`route_to_person_id`, and the report's §5 "Not done" list does not mention it. Sixth round. One line in either place closes it. | **open** | `direction.md:387`, `crm-model.md:80` |
| R5-m11 | `studio_contact_rules.subject_id` has no FK (polymorphic, by design), so a deleted card leaves an orphan rule whose `studio_contact_org(subject_id)` resolves NULL — invisible to every member's RLS and removable only by `service_role`. Members cannot `DELETE studio_contacts` (probed: `INSERT,SELECT,UPDATE` only, no DELETE policy), so this needs an admin or a service-role path, which is why it is minor rather than part of R5-M1. | new | `$TMPDIR/r5probe3.sql` → `orphan_rules 1 · resolves_to (null)` |
| R5-m12 | Two rules for one fact: `record_channel_consent` keeps the **earliest** `opt_out_at` (`LEAST`, `00594:1357-1359`, r7 R7-M1) while the fold keeps the **latest** — `ranked`/`refusal` both order the refusal bucket by `COALESCE(sms_opt_out_at, …) DESC`, so a studio holding two dated refusals on one number folds to the more recent and the RPC would then have preserved the older. Nothing is destroyed either way; the two writers just disagree about which date R-Q prints. | new | `00594:376-377`, `:489-490` vs `:1357-1359` |
| R5-m13 | The first prod fold is `O(cards × party rows)` on a non-sargable predicate. `channel_value_was_on_sms_rail()` normalises **every** `project_parties` row per call (`00593:222-227`), and 00593 leg (c) calls it **twice per party row** (`:440` and `:442`) for the value and the label. Leg (a) calls it once per card. Cheap locally (0 rows); worth a single `WITH` or a stored expression before the Strata push. | new | `00593:407-450` |
| R5-m14 | A studio member can launder a carrier refusal's evidence by passing `p_source = 'inbound_sms'`. The "a second INBOUND refusal restates all four" exemption (`00594:1392-1419`) is keyed on `EXCLUDED.opt_out_source`, which is the caller's own `p_source` — the rail writes this table directly as `service_role` and never through the RPC, so no legitimate RPC caller ever needs that value. Narrow (a member lying about their own source), but the branch exists to let the *carrier* speak again and only the carrier can. | new | `00594:1392-1398` |
| R5-m15 | crm-model §2 says "one preferred channel per kind"; `studio_contact_channels.preferred` carries no partial unique index. W1a ships no writer, which is the same reason `00592:764-766` gives for closing the channel vocabulary now. | new | `00593:77`, `crm-model.md` §2 Reach channel |

---

## 3. Prior-round findings, re-checked

Every finding in `w1a-fix-log-r4.md` and the rounds it summarises, against the
tree and (where covered) a passing block.

| Prior | Ruling | State |
|---|---|---|
| M3-1 / R-AG — `not_asked` erased a grant | refused outright | **fixed** (`00594:1156-1161`; block 9) |
| M3-2 / R-AH — deferred path skipped the record | flush runs both gates | **fixed** (`sms.ts:1046-1085`) |
| M3-3 / R-AI — affiliations vs `company_id` | bound both ways | **fixed** (`00592:451-695`; block 12) |
| M3-4 / R-AJ — START granted seat-holders | scoped to opted_out/pending | **fixed** (`pipeline.ts`; Deno suite) |
| F3 / R-AK — phone-global fallback | studio-scoped, one global case | **fixed** (`sms.ts:355-381`, `:497-511`) |
| r2 B-1 — mirror fired the opt-in SMS | both AFTER triggers guarded | **fixed** (§1.6 diffs; block 8) |
| r3r2 BLOCKING — flush's 2nd gate reduced phone-globally | narrowed to the deferred party | **fixed** (`sms.ts:1073-1086`) |
| r4 B-1 — dateless refusal failed open | `refusal_unanswered` stored fact | **fixed** (block 16B) |
| r4 M-1 — backfill invented `sms_capable` | evidence test, both legs | **fixed** (`00593:209-229`, `:407-450`; block 15) — see **R5-m13** on its cost |
| r4 M-2 — mirror stranded parked site requests | narrow durable release | **fixed** (`00594:969-985`; block 13) |
| r5 R-AL / R-AM / R-AN / R-AO / R-AP | all five | **fixed** (blocks 18–21; `sms.ts:214-262`) |
| r6 B6-1 / M6-1..M6-5 | gate on the refusal; dateless; both dates; route guard; channel CHECK | **fixed** (blocks 22–25) |
| r7 M7-1 / M7-2 / R7-M1 | no RPC lowers the flag; reconsent evidence-only; earliest `opt_out_at` | **fixed on the record** (blocks 26–28) — R7-M1's attribution rule is **not** held on the SEAT: **R5-M2** |
| r8 W4-M1 / W4-M2 | refusal asked of the whole group; refusal's own evidence set | **fixed** (blocks 3, 27) |
| r8 R8-M1 / R-AQ | wordless refusal wipes the seats | **fixed for `opt_out_source`** (block 27i–27i5) — the test is one column wide: **R5-M2** |
| r8 R8-M2 / R-AR | identity guard | **fixed for four of five holders** (block 29) — `subject_id` omitted: **R5-M1**; the pointing-card asymmetry is **R5-m9** |
| r8 F1 | rule filed under its subject's noun | **fixed on the rule side** (`00592:889-1003`; block 31) — the card side can still break it: **R5-M1** |
| r2 R2-M1 | fold picks the refusing sibling by its own facts | **fixed** (block 30) |
| r2 R2-M2 / R4-m1 | report §3 brought to the tip | **open again** — **R5-m1** |
| r4 R4-M1 | grant's paperwork never filed as the refusal's words | **fixed** (`00594:465-472`, `:485-490`; block 30e) |
| r4 R4-M2 | `sms` as a rule-only token | **fixed** (`00592:796-822`; block 25e/25f) — and it is what makes report §3 stale again |
| r4 m2..m9 | six minors | **all still open** — R5-m2, m3, m4, m5, m6, m7, m8, m9 |

Two prior findings are half-closed into this round's majors (r8 R8-M1/R-AQ and
r7 R7-M1 → **R5-M2**; r8 R8-M2/R-AR and r8 F1 → **R5-M1**); everything else holds.

---

## 4. Not checked

- **Strata.** Nothing pushed, deployed or probed against prod.
- **The pre-push fold dry run.** `probe10-r9-fold-dry-run.sql` was not re-run;
  neither major touches the fold's CTE chain, so it does not need re-cutting for
  this round.
- **The Deno suite beyond the two named files.** 71 passed in
  `_shared/sms.test.ts` + `_tests/sms-inbound.test.ts`; the report's separate note
  about `stripe-rail.test.ts` failing on missing env is pre-existing and was not
  re-verified.
- **Portal type-check / build.** No portal code changed this wave;
  `git status -- packages` is clean.
