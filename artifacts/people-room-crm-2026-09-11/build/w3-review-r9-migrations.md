# W3 (P2) — adversarial migration review, round 9

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `c0149d3a4` ("W3 round-8"). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched. No server started.
No port taken. No migration minted. Nothing written to the branch but this file.**

Read in full: `00628`–`00633`, plus the bodies they graft or re-issue (`00417`, `00592`, `00593`,
`00594`, `00623`, `00624`, `00625`, `00626`, `00627`), `supabase/tests/people/*`,
`build/w3-data-report.md`, `build/w3-fix-log-r8.md`, `w3-review-r8-migrations.md`, `rulings.md`,
`synthesis/direction.md` §3.1/§3.4/§5/§7/§8/§9, `synthesis/crm-model.md` §4 + CRM-24,
`specimens/SPEC.md` §5.4/§5.7, `briefing/fixture.md`, `build/w1a-report.md`, `build/w1b-report.md`,
`build/w2a|b|c-report.md`, `build/w2-review-r15-qa.md`.

**Verdict: NOT clean — 2 blocking, 1 major.** Every r8 finding above minor is fixed and re-measured.
All three findings below are new this round and each was reproduced on a freshly reset database
inside a rolled-back transaction.

---

## 0. Gates I ran myself, on a fresh database

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0**, head `00633`. The CLI telemetry `EPERM` again needed the sandbox off — harness, not product |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." (51 announced blocks) |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (27 announced blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `cron.job` | `compliance-document-expiry-sweep · 0 6 * * * · SELECT public.sweep_compliance_expiries(); · active` |

### 0b. Prior findings (`w3-review-r8-migrations.md` → `w3-fix-log-r8.md`)

| r8 finding | State | Evidence this round |
|---|---|---|
| **B-1** retyping a renewal launders the lapse | **FIXED** | the `doc_type` leg rides the walk in both reckonings — `compliance_state()` (`00623:655/664/679`, read back from `pg_proc.prosrc`) and `compliance_document_state()` (`00630:81/100`); suite block **11c** passes on a fresh database |
| **M-1** person-to-person merge aborting `designated_person_is_self` | **FIXED** | `NULLIF(p_survivor, id)` on all three statements (`00629:1965/1968/1971`); suite block **11** passes |
| r8's 20 carried migration minors + 3 new | **all still open** — the r8 fix log says so in terms ("The 21 migration MINORs … were **not** addressed"), and the migration files have not changed since `c0149d3a4`. Re-measured spot checks below |

Spot checks on carried minors, this round: `obj_description('public.people_directory') ILIKE '%merged%'`
→ **false** (m-1 open); `contact_rule_blocks_contact()` has no caller in `supabase/`, `apps/`,
`packages/` — the only hit inside `merge_studio_contacts` is a **comment** line (n-1 open);
`00629:1531` says `company_kind` "is carried unconditionally" while `00629:1570` COALESCEs it (m-14
open); the book holds **36** compliance papers, not the report's 33, and Lakeshore's COI reads
**2026-10-07** against the report's 2026-10-06 (n-2 open, and §7.1's own decaying-literal class).

---

# BLOCKING

## B-1 · The nightly notice names the FIRM for a paper the PERSON holds, and deep-links to the person

`supabase/migrations/00630_compliance_expiry_sweep.sql:359-361`.

```sql
COALESCE(NULLIF(btrim(sc.company_name), ''),
         NULLIF(btrim(sc.full_name), ''),
         'this card')                  AS holder_name
```

The COALESCE asks `company_name` first **whatever the holder's kind is**. On a `company` card that
is right — a firm's name lives in `company_name` and `full_name` is NULL. On a **person** card
`studio_contacts.company_name` is 00417's typed-by-hand firm snapshot, which is exactly what
`people_directory`'s own CONTACTS branch reads as the person's FIRM
(`00629:2674-2678`, QA-1's leg). So for a person-held paper — a master licence, the reason
`holder_type = 'person'` exists at all (00623) — the notice is written about the firm.

It is reachable through a shipped act, not a hand-edit: `usePromoteToStudioContact()`
(`packages/supabase/src/hooks/use-studio-contacts.ts:640-650`) mints a PERSON card with
`company_name: party.company_name` — the seat's free-text firm — every time a studio promotes a
seat into the rolodex.

**Measured**, on a fresh reset, in a rolled-back transaction
(`build/probe46-r9-holder-name.sql`): one person card `Marco Feliz` carrying
`company_name = 'Northgate Electric'`, holding his OWN `license` dated `CURRENT_DATE - 3` gating
`{site_access}`; then `SELECT public.sweep_compliance_expiries()`:

```
 holder_type | holder_name        | subject                               | message                                                | deep_link
 person      | Northgate Electric | Northgate Electric's paper has lapsed | The licence for Northgate Electric lapsed 11 Sep 2026. | /people?person=1487dbd5-…
```

Northgate Electric holds no lapse at all; its own card and its own Directory firm row read whatever
its own paper says. The owner and the admin are told a firm's insurance has gone, the sentence names
a firm, and the link opens a person. PR-h puts the paper word on the firm card AND the roster row
from ONE source; this notice is a second source that disagrees with both. r1 M-5 already ruled that
a notification IS a face ("SPEC §7 and §5.7 #8 forbid a schema word on a face, and a notification IS
a face") — a schema token was refused there; a wrong party name is worse.

**Fix**: key the name on `holder_type`, the way `v_link` two statements later already does —
`CASE WHEN d.holder_type = 'company' THEN COALESCE(company_name, full_name, 'this card')
ELSE COALESCE(full_name, company_name, 'this card') END`.

---

## B-2 · The sole-proprietor fold takes the firm's own name off the surviving identity, on every face that prints it

`supabase/migrations/00629_studio_contact_merges.sql:1563-1594` (the "every other typed fact"
COALESCE) and `:1642-1643` (the cross-kind affiliation DELETE).

crm-model §4's one permitted cross-kind merge folds a firm card into the person who IS that firm.
r6 M-3 fixed the CREW's half of this — their affiliations are CLOSED with `to_date` and their legacy
`company_id` is deliberately left naming the folded card so `people_directory`'s `company_name`
COALESCE still resolves the firm (`00629:1634-1641`, R-BN). **The survivor's own half was not
fixed**, by two independent routes:

1. the COALESCE statement carries `legal_name`, `dba_name`, `company_kind`, `remit_to`,
   `retainage_bps`, `tax_id_last4`, `w9_on_file_at`, `warranty_until`, `notes`, `studio_verdict`,
   trades, specialties, `is_sole_proprietor` and the three designations — but **not
   `company_name`**, which is where a firm card's NAME lives (`00629:2670-2673` says so in terms);
2. `DELETE FROM studio_person_affiliations WHERE company_id = p_merged AND person_id = p_survivor`
   (`00629:1642-1643`) runs OUTSIDE the `patina.suppress_affiliation_sync` window that the very next
   statement opens, and `sync_studio_contact_company_pointer_trg` is `AFTER INSERT OR DELETE OR
   UPDATE`. The pointer is re-derived over zero open affiliations and lands NULL.

So after the fold the survivor carries neither the name nor a pointer to it, and
`people_directory`'s `meta.company_name` COALESCE has nothing to find.

**Measured**, fresh reset, rolled back (`build/probe47-r9-soleprop-firm-name.sql`), on the fixture's own
motivating pair — F-11 Dana Kowalski, owner-operator, `is_sole_proprietor`, and Northgate Electric:

```
        | display_name  | meta.company_name  | paper_state
 BEFORE | Dana Kowalski | Northgate Electric | lapsed
 AFTER  | Dana Kowalski |                    | lapsed

studio_contacts after: full_name='Dana Kowalski', company_name=NULL, company_id=NULL,
                       is_sole_proprietor=t, trades={electrical}
studio_person_affiliations WHERE company_id = <folded firm>  ->  0 rows
```

Three faces lose the fact:

* **Directory person row, identity** — direction §3.1 reads `"Dana Kowalski" / "Northgate Electric ·
  electrical"`; after the fold the firm half is empty. This is QA-1 (w2 r5) and r6 M-3's exact harm,
  reached through the third door.
* **Person card R1** — direction §3.2 reads `"Northgate Electric · owner-operator, since 2025"`.
  `views/person-profile.tsx:344-354` builds that line from `person.meta.company_name` plus the open
  affiliation; both are now gone, so the line disappears from the card of the very person the fold
  was about.
* **Bring-forward picker mini row** — SPEC §5.7 #4a is literally
  `"Dana Kowalski · Northgate Electric · electrical"`, read off the same Directory row.

The seats keep their free-text snapshot, so `v_project_roster` and the Call Sheet still print
"Northgate Electric" (measured) — which makes it worse, not better: one screen names the firm and
the other does not.

R-BN is the standing ruling this crosses: *"A merge never deletes a typed fact."* The fact is not
deleted from the table — it sits on a card the room cannot open — which is r5 B-1's own standard
("The data was not deleted from the table; it was unreachable from the room"), and r5 B-1 was
BLOCKING.

**Fix**, either half is enough and both are cheap: add `company_name = COALESCE(s.company_name,
v_merged.company_name)` to the COALESCE statement (safe — `display_name` is
`COALESCE(full_name, company_name)`, so a person survivor's own name still wins, and a firm survivor
already has its own), and/or wrap the `:1642-1643` DELETE in the same
`patina.suppress_affiliation_sync` window as the `to_date` UPDATE beside it so the survivor's
`company_id` keeps naming the folded card exactly as the crew's does (r6 M-3's posture, applied to
the survivor).

---

# MAJOR

## M-1 · `add_household_member()` silently overwrites a money grant the household did not source, and re-stamps its clause

`supabase/migrations/00632_client_households.sql:402-410`.

```sql
INSERT INTO public.project_party_authority
  (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES (v_seat_id, 'money', v_h.co_threshold_cents,
        'client_households.co_threshold_cents', auth.uid())
ON CONFLICT (engagement_id, scope) WHERE effective_to IS NULL
DO UPDATE SET threshold_cents = EXCLUDED.threshold_cents,
              source_clause   = EXCLUDED.source_clause,
              updated_at      = now();
```

The partial unique index is `(engagement_id, scope) WHERE effective_to IS NULL`, so the arbiter is
"the seat's OPEN money grant" — **whatever wrote it and whatever it is sourced from**. Two statements
above, the RPC deliberately REUSES an existing `(project_id, studio_contact_id, party_kind)` seat
(`00632:363-369`), and the band's member flow is an ADD over the job's own client-side seats. So the
ordinary act — seat Chidi as `client_rep` from the agreement (R-J's "Confirm from the agreement"),
then add him to the household — rewrites the agreement's grant in place.

Its own sibling refuses to do this. `set_household_threshold()` (`00632:519-531`) moves only the
grants `WHERE pa.source_clause = 'client_households.co_threshold_cents'`, and the file states the
rule in words: *"A grant the studio re-sourced by hand (its own clause from the agreement) is NOT the
household's to move"* (`00632:465-466`). `add_household_member()` takes the opposite rule on the same
column, so the two halves of one feature disagree about who owns a seat's money authority.

**Measured**, fresh reset, rolled back (`build/probe48-r9-household-grant-clobber.sql`):

```
BEFORE: 1000000 cents, source=Agreement clause 7
AFTER : 250000 cents, source=client_households.co_threshold_cents, effective_to=<null>
open money rows on the seat: 1        (nothing was closed; the old grant is gone, not ended)
seats created: 1 (reused = true)
```

The Call Sheet's client-side row then prints "Signs money to $2,500." over an agreement that says
$10,000 (SPEC §5.4 #5's own line). Run the other way — a household figure ABOVE the agreement's —
the act silently **over**-authorises an approval nobody granted, which is the failure 00624's own
COMMENT names ("a wrong grant silently over- or under-authorises an approval") and which PR-n puts
under the principal. There is no record either: 00624's shape for ending a delegation is a row with
`effective_to`, which `set_household_threshold()` honours (`00632:548-551`) and this does not.

**Fix**: either narrow the ON CONFLICT to grants the household already sources (read the open row
first; leave a foreign `source_clause` alone, as the sibling does), or close the standing grant with
`effective_to` and open a new one, so the change is a row and not an edit.

---

# MINOR — new this round

### n8 · `merge_studio_contacts()` answers three refusals before its membership gate
`00629:1124-1145`. `merge_contact_not_found`, `merge_other_studio` and the two `NOT FOUND` legs all
run before `merge_not_a_member` at `:1142`, and the RPC is granted to `authenticated`. Any signed-in
user can therefore distinguish "these two uuids name cards" from "they do not" and "they share a
studio" from "they do not", for cards in studios they have no membership in. The archive door two
sections later takes the opposite posture on purpose — *"A non-member reads
studio_contact_not_found, never a different error, so the door leaks no card ids"* (`00629:2831-2833`).
One reorder: read both rows, resolve the org, gate on membership, then judge.

### n9 · `studio_contact_merges`' own foreign keys are `ON DELETE CASCADE`, against §1's stated posture
`00629:263-264` (`survivor_id`, `merged_id`, both `ON DELETE CASCADE`) against `00629:81-82`, which
argues the opposite for `merged_into`: *"ON DELETE SET NULL, never CASCADE: losing the survivor must
not vaporise the history."* Deleting a survivor clears the absorbed card's `merged_into` (the FK does
that correctly) AND deletes every lineage row naming it, so the absorbed card comes back as a live
Directory row with no record that a merge ever happened. Not reachable from the room — measured:
`authenticated` holds no DELETE on `studio_contacts` — so this is a posture the table contradicts
rather than a live door.

### n10 · `00629:311`'s section header still advertises an INSERT policy the file removes
`-- ── RLS: the rolodex's own gate, and only SELECT + INSERT ──`, twenty lines above the `DROP POLICY
… studio_contact_merges_member_insert` that r3 W3-R3-5 added and the COMMENT that says "SELECT is the
whole of what a member may do with the lineage".

### n11 · `w3-data-report.md` §1's object table still carries the claim r4 M-2 corrected
`build/w3-data-report.md:41` — *"`people_directory` | re-issued v5: 00626:1388-1909 **verbatim**,
plus one line"* — against §7 `:320` and §10 `:401`, which say two deltas and name the TEAM-branch
tenant leg as MADE. Confirmed by a code-only diff of the two view bodies this round: exactly two
hunks, the TEAM tenant leg and `AND sc.merged_into IS NULL`. The summary table is the line a reader
reaches first.

### n12 · report §2's paper census is still wrong, and one of its dates decays
Carried from r8 n-2 and re-measured: the book holds **36** compliance papers (`9 current + 24 held +
2 lapsed + 1 lapses_soon`, which is the report's own breakdown) against `:132`'s "33 papers in
total"; and `:130` names Lakeshore Painting Co.'s COI as `2026-10-06` where it reads **2026-10-07**
today — the seed shifts it with `CURRENT_DATE`, which is §7.1's own trap written into §2.

---

# Carried open from r8 (re-stated, not re-argued)

`m-1` stale `people_directory` view COMMENT (**re-measured open**) · `m-2` 00630's `merged_into`
justification cites the rule r3 overturned · `m-3` `resolve_merged_contact()` pins no `search_path` ·
`m-4` both depth caps strand rows silently · `m-5` "Ostrom Builders's" · `m-6`
`client_households_studio_delete` drops the co-member leg · `m-7` the sweep announces an ARCHIVED
holder's paper with a deep link to a card `directory-view.tsx` reads with `includeArchived: false` ·
`m-8` the merge sheet's "stays on the folded card as a record" · `m-9` the notification abbreviates
the month · `m-11` one legacy studio-less job freezes a whole household's figure · `m-12` a notice
row is written even when nobody is told, and the key then silences it forever · `m-13` a merge of a
card seated on a legacy studio-less job aborts on W1b's guards · `m-14` `company_kind` "carried
unconditionally" vs the COALESCE (**re-measured open**) · `n-1` `contact_rule_blocks_contact()` is
dead and its COMMENT states a fact r5 M-2 removed (**re-measured open**) · `n-2` stale report numbers
(see n12) · `n-4` two `preferred` channel rows of one kind can survive a merge · `n-5` 00628's NOTICE
counts a delta over every stamped project · `n-6` a merge can leave one identity holding two seats of
the same kind on the same job · `n-7` `assert_compliance_holder()` re-issued without restating its
REVOKE. `m-10` (sweep residue on the shared local Postgres) is **gone** after this round's reset —
`studio_compliance_notices` is empty and `job_runs` carries no sweep row.

One environment note for the next round: two committed
`compliance-document-expiry-sweep` runs were on this database before my reset
(`job_runs` `{"notices":3,"notified":6}` then `{"notices":0}`), which makes
`w3-data-report.md` §10 item 6 ("has never run against the seeded book outside a rolled-back
transaction") false as written. It is true again now.

---

# Checked and clean

* **The merge is one transaction and orphans nothing.** Fresh FK census this round: 20 columns
  reference `studio_contacts`; every one is reached by `merge_studio_contacts()` except the two
  declared freezes (a SENT `studio_trade_agreements.contact_id`, 00579's own; the crew's legacy
  `company_id` in the sole-proprietor fold, r6 M-3 / R-BN). `project_site_access_cards.told_refs` and
  `project_party_authority.copy_to` hold SEAT ids, not card ids (`col_description`, measured), and
  seat ids do not move. `project_parties` carries no unique index beyond its primary key, so no
  repoint can collide.
* **`merged_into` is unforgeable, the lineage is append-only, and the pointer door is
  transaction-local.** `assert_merged_into_write()` (`00629:128-222`) refuses every writer but the
  RPC, owner and admin included; the door opens at `:2080` and shuts at `:2087`;
  `studio_contact_merges` has SELECT as its only policy and its only `authenticated` grant.
* **No company into a person** except crm-model §4's sole-proprietor case, stated in the RPC
  (`00629:1183-1194`) and again in the trigger (`00629:187-195`) so service_role is held to it too.
* **`resolve_merged_contact()` is SECURITY INVOKER**, so the rolodex's member-only SELECT policy is
  the access rule and no caller resolves another tenant's card id; the depth cap terminates a
  hand-built cycle at NULL.
* **Consent is record-only (R-AY).** No W3 file writes a consent table, calls
  `record_channel_consent`, or reads a frozen `project_parties.sms_consent_*` column for a verdict —
  `meta.sms_consent_status` on the party branch is `q.consent_word`, the record's own verdict
  (`00629:2427`). The 00631 backfill fires `fc_dispatch_optin_invite` on every touched seat and it
  returns early on all of them (its UPDATE guard reads OLD == NEW for every consent column), so a
  backfill sends nothing.
* **Every project tenant resolution goes through `project_tenant_org()` / `project_recorded_studio()`
  (R-BD).** Fresh enumeration over `pg_proc.prosrc`, `pg_get_viewdef` and `pg_policy`: exactly
  **twelve** `project_consent_org()` callers, no policies among them, and every one is the consent
  ledger's key or the membership guard on reading that same record. `assert_party_bid_quoted_by()`
  (`00631:161-193`) asks BOTH resolvers, which is 00624's "THE RECORD, NOT THE WRITER".
* **The sweep** takes `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation with a
  `skipped` row on contention, swallows its own exception without re-RAISE, is `service_role`-only,
  schema-qualifies its cron body, guards `cron.unschedule` with `EXISTS`, and notifies **active
  owners and admins of the holding studio only** (`00630:467-470`). The cron row is registered at
  `0 6 * * *` after a clean reset (measured).
* **Households RLS** carries `is_active_studio_member(organization_id)` beside
  `is_studio_comember(designer_id)` on all four policies, PR-n's owner/admin gate in the INSERT and
  UPDATE WITH CHECK, and `assert_household_threshold_principal()` over a CHANGE where a WITH CHECK
  cannot see OLD. RLS is enabled on all three new tables; `anon` and `PUBLIC` hold nothing on any of
  them (measured).
* **Archive gating**: owner/admin only, restated in the body because DEFINER bypasses the policy; a
  non-member reads `studio_contact_not_found` and no card id leaks; archive is idempotent.
* **The court CHECK is a strict superset** (`00633:46-51`) — 7 words become 11, every live row stays
  valid, and `project_tasks.owner` is deliberately untouched.
* **The studio_id backfill leaves ambiguous designers NULL.** Measured after a clean reset against
  the seeded book: 8 projects, 3 stamped, 5 NULL, all five with **two** active design-studio
  memberships, **0** of them carrying seats. `WHERE studio_id IS NULL` makes it idempotent.
* **Migration hygiene**: hand-numbered `00628`–`00633`, above the branch head and clear of the
  reserved 00595–00620; banner + lineage on every file; every CHECK stated as a named constraint that
  is dropped and re-added so a rerun widens it; money is integer cents; every SECURITY DEFINER pins
  `search_path`; every new function carries explicit grants in both directions with
  `REVOKE … FROM PUBLIC, anon`; RLS ships in the same file as its table; `00-legacy-grants.sql`
  regenerates with no diff.
