# W1b — the data layer: compliance, authority, the window, the way in

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**Nothing was pushed to Strata: no `supabase db push`, no `supabase functions deploy`.**

## 0. The numbers the brief asked for, first

| Migration | Intent |
|---|---|
| `00623_studio_compliance_documents.sql` | E10 — the paper, held against a rolodex card, with `compliance_state(holder)` |
| `00624_project_party_window_and_authority.sql` | E5/E14 — the seat's stage, window, access mode, firm pointer and warranty; E12 — `project_party_authority` with PR-n's gate |
| `00625_project_site_access_cards.sql` | E15 — the way in, studio-only, with no code column (PR-r/PR-w) |
| `00626_people_directory_v4_seats.sql` | `people_directory` v4 (one row per identity, five appended columns) + `people_directory_seats` |
| `00627_access_grants_and_field_link_window.sql` | `v_access_grants` over the eleven doors + `create_field_link`'s window expiry (PR-d/PR-l) |

**The brief said "W1b mints from 00622 upward". It could not: `00622_consent_record_is_the_only_gate.sql`
already exists on this branch** — it is the R-AY pass, added after the brief was written and recorded in
`w1a-report.md` §8 ("W1b mints from 00623"). W1b therefore mints from **00623**, and 00595–00620 remain
untouched and reserved for the other program.

## 1. `studio_compliance_documents` and `compliance_state` (00623)

G-14 said the words COI, W-9, licence and lien waiver existed nowhere but as POLICY booleans on
`studio_trade_agreements` (00579:58-108) — what the studio ASKS FOR, never what it HOLDS. So
"do we hold a current COI for this sub" was unanswerable and F-11's lapse was invisible.

The table holds a paper against a **card**, `holder_type person|company` because a COI is the firm's and a
master licence is the person's (CS2-21). `assert_compliance_holder()` is 00592's R-AP shape reused: the
plain FK into `studio_contacts` permits a person card where `holder_type` says company, another tenant's
card, and a `superseded_by` pointing at somebody else's paper — a CHECK cannot see another table, so a
BEFORE trigger asserts all three (`compliance_holder_kind_mismatch` / `_other_studio` /
`compliance_successor_other_holder`). PR-u's whole point is that a document belongs to one rolodex.

`blocks[]` is constrained to `site_access, payment, draw` — the three gates this program has a surface for.
crm-model §2 also names `contract`, `permit`, `mobilization`; they are deliberately out of the vocabulary,
because a token no gate honours is a promise on a face.

`source` / `inbound` are here in P1 on purpose: PR-a builds the trade-side upload door in P3, and a document
that arrives over a paperwork link is the **same object** distinguished by provenance and by
`verified_at IS NULL`, never by a second table.

`compliance_state(holder)` is direction §3.8's paper word stated once: `current | lapses_soon | lapsed |
not_on_file`, over the holder's non-superseded documents, worst-first, with the 30-day window written in one
place. **SECURITY INVOKER**, so the table's member-only RLS is the whole access rule — 00594's
`channel_consent_status()` posture: a caller outside the owning studio reads `not_on_file` and can never
print another studio's word.

Two judgements worth naming:
- **An undated paper is HELD and cannot lapse.** A W-9 has no expiry, so a holder carrying only undated
  paper reads `current`; a holder with no paper reads `not_on_file`, a different fact (C21/R-K).
- **`doc_label` is required when `doc_type = 'other_named'`** (a named CHECK). PR-f's vocabulary rule; an
  unnamed other is exactly the row that goes dark. Not in the brief's column list — flagged here.

## 2. The seat's stage, window and authority (00624)

`project_parties` gains `stage` (CHECK, not an enum — an `ALTER TYPE ADD VALUE` cannot be used in the
transaction that adds it), `on_site_from`/`on_site_to`, `site_access_mode`, `contracted_through`,
`off_job_at`/`off_job_reason`, a real `company_id` FK at the firm card, `warranty_until` and
`warranty_contact_person_id`.

- **The backfill.** A party on a `completed` project becomes `warranty` while the close is inside twelve
  months and `off_job` after — crm-model §5's ladder read backwards from the only dated fact the schema
  carries. `projects.completed_at` is the close; where it is NULL, `updated_at` is the stand-in and is
  **named as such in the migration** rather than silently assumed. Guarded by `stage = 'active'` so a rerun
  cannot overwrite a stage a studio moved by hand.
- **`assert_project_party_cards()`** holds `company_id` to a COMPANY card and `warranty_contact_person_id`
  to a PERSON card, both in the studio `project_consent_org()` resolves for the project — the ONE resolver,
  which was close-review r1 MAJOR-1's lesson. A project resolving to no studio **refuses** rather than
  accept an unverifiable cross-tenant pointer.
- **The freeze is untouched.** `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF` ten named columns
  (the eight consent ones plus `phone`/`phone_e164`, R-AX); every column added here is outside that list and
  is ordinarily writable by a member. SQL block 11 asserts both halves: a member moves `stage` and the
  window, and `sms_consent_status` still raises `consent_legacy_column_frozen`.

`project_party_authority` is E12 — G-15 said nothing in Patina could record "Adaeze decides finishes, Chidi
signs money over $2,500". One row per (seat, scope); `threshold_cents` is integer cents (the $2,500 line is
`250000`); `prepares_only` is F-03's and F-08's fact.

**PR-n lives in the policy, not in code.** The INSERT/UPDATE/DELETE policies read
`scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_org(engagement_id))`. PostgREST
is a writer too, so a gate that only the portal enforces is not a gate. SQL block 5 walks it as three roles.

`copy_to uuid[]` cannot carry an FK, so `assert_party_authority_copy_to()` holds every id to a seat on the
grant's own project (`authority_copy_to_off_project`).

## 3. The site access card (00625)

**PR-r IS THE SHAPE.** There is no `gate_code` column and there is not meant to be one; crm-model §2 lists
one and direction §7 repeats it, and PR-r overrules both. Patina stores the lockbox VERSION, the key holder,
the hours and who was told. A column that does not exist needs no sensitivity treatment, no re-auth gate and
no hide-on-glance — which is the whole argument for the ruling. Probe 2 counts zero code-like columns.

**PR-w IS THE RLS.** Four policies, all `is_studio_comember(project_designer(project_id))`, no client leg and
no `show_to_client` column to make one. `show_to_client` is per ROW (00419:61-62) and this table is one row
per project, so a single toggle would expose the whole card. `anon` is revoked explicitly rather than left to
creation defaults, and the probe shows it refused **at the grant, before any policy runs**.

`assert_site_access_key_holder()` holds the key holder to a seat on the card's own project.

## 4. `people_directory` v4, and `people_directory_seats` (00626)

Lineage: `00221 → 00281 → 00420 → 00478 → 00583 → 00589:696-935 (v6) → 00594:1211-1458 → 00626`.
00594's two consent reads (`status_raw` and `meta->>'sms_consent_status'`, both through
`channel_consent_status(project_consent_org(project_id),'sms',phone_e164)`) are carried verbatim.
**Nothing was reverted**; every branch's RLS predicate is byte-for-byte 00594's.

### What changed

1. **The party branch is one row per IDENTITY.** A seat carrying a `studio_contact_id` is no longer its own
   Directory row — its identity is the person card, which the CONTACTS branch already emits — and the rest
   collapse on `party_identity_key()`: the lineage stamp, else the login, else the exact E.164 number, else
   the lowercased email, else the row itself. That is crm-model §4's precedence (rules 6, 1, 2, 3, then rule
   5's "name alone never merges"), stated ONCE in an IMMUTABLE function so the Directory, the seats view and
   an expression index cannot key the same human differently. G-9's over-count is gone and the head can
   count cards.

   `project_id` on such a row is the **winning (most recently updated) seat's** project, so every shipped
   reader that opens a person from a Directory row still lands on a real seat. `seat_count` is what says how
   many there are.

2. **Five columns APPENDED** — never inserted, because `CREATE OR REPLACE VIEW` cannot drop or reorder a
   column. All twelve existing columns keep their position and type (probe 6), so `select('*')` readers
   widen instead of breaking. PR-y is OVERRULED per rulings §6: **no flag**, this replaces the six-branch
   view at 100%.

   | Column | Source | NULL where |
   |---|---|---|
   | `reach_state` | `reach_state_for(profile_id, card_id, party_id)` — account, else a live unexpired field link on one of this identity's seats, else on paper (PD-12's order) | never |
   | `consent_status` | `channel_consent_status()` — the RECORD's verdict, which folds `refusal_unanswered` (R-AY) | client, lead, maker, team branches, and a card with no `phone_e164` |
   | `paper_state` | `compliance_state(COALESCE(company_id, id))` — the FIRM's paper for a person, the card's own for a firm and for a sole proprietor | client, lead, maker, team branches |
   | `contact_rule_summary` | `contact_rule_summary(subject_type, subject_id)` — E7 as one line, fixed clause order | no rule on file (a fact, not an empty string — R-V) |
   | `seat_count` | `identity_seat_count(identity_key)` | never (0 where none) |

3. **The two consent DATES moved onto the record.** `meta.sms_consented_at` / `.sms_opt_out_at` still read
   `project_parties`' frozen columns at 00594 — §5.3's debt to W1b. They now come off
   `studio_channel_consent` through a LEFT JOIN on the record's own primary key, resolved by
   `project_consent_org()`. **Only the raw dates are joined**; the VERDICT still comes from
   `channel_consent_status()`, so the rule that folds `refusal_unanswered` keeps one home. Probe 7:
   `dates_still_off_the_seat = f`.

4. **`people_directory_seats`** — one row per seat, keyed by the same identity, `person_id` = the identity's
   Directory row (the card when stamped, else the same `first_value()` winner over the same ORDER BY). It
   admits EVERY party kind, unlike the Directory's seven, because "where is this human seated" is a
   different question from "who is in the six chips" and PR-c's `client_rep` seat must appear under the
   household member's card.

### Display rules deliberately left in the app

`R-A`/`C13`/`C24` — a lender or an AHJ prints **no paper word at all** — is a DISPLAY rule. The view reports
the fact (`not_on_file`); the room decides whether the fact is owed. SQL block 12g asserts that split so a
later change cannot quietly move the rule into SQL. Likewise `PR-p`: `people_directory` has **no** `stage`
column, and SQL block 3k is the assertion that keeps it so.

### Every reader of the changed columns

All directory reads go through `usePeopleDirectory` / `usePerson`, both `select('*')`
(`packages/supabase/src/hooks/use-people.ts:125`, `:161`), so the widening is type-safe and no query moves.
The files that consume the row shape (`PeopleDirectoryRow`, or the view's columns) are:

| File | What it reads |
|---|---|
| `packages/supabase/src/hooks/use-people.ts` | the whole row shape, `PartyRole`, the two hooks |
| `apps/designer-portal/src/lib/document/people-derivation.ts` | the canonical party shape; `role`, `status_raw`, `last_touch_at`, `meta` |
| `apps/designer-portal/src/lib/document/desk-derivation.ts` | dormancy over the directory |
| `apps/designer-portal/src/lib/document/roster-derivation.ts` | the party kinds the branch admits; the reach derivation this wave replaces |
| `apps/designer-portal/src/components/document/people/people-room.tsx` | the head count (`:383`) |
| `.../people/views/directory-view.tsx` | `role` → chip mapping, the counts, the search |
| `.../people/directory/person-row.tsx` | the row itself |
| `.../people/views/person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`, `portfolio-view.tsx` | segment by `role`, read `meta` |
| `.../people/outreach/audience-rules.ts`, `audiences-tab.tsx` | segment by `role` and `status_raw` |
| `.../people/party-profile-sheet.tsx` | opens a party from `person_id` + `project_id` |
| `.../document/command-bar.tsx` | search over the directory |
| `.../document/desk-reconnect.tsx` | the Desk's reconnect rail |
| `packages/supabase/src/hooks/index.ts` | the barrel |

**The behavioural consequence W2 owns:** with every seeded seat carded, `people_directory` now returns
`role='contact'` for those humans and no longer returns `gc`/`sub`/`architect`/… rows for them. The chips in
`directory-view.tsx` map roles to bands, so the UI wave has to read the mixed list (PR-g) and the seats view.
That is the redesign C6 sequenced (view first, then the seats-beneath Directory) and rulings §6 ships at 100%
with no flag — it is not a regression to fix here, but it is the one thing that changes on screen before W2
lands.

## 5. `v_access_grants` and the field link's window (00627)

### The thing the brief could not have known

**Four of the eleven sources are closed to `authenticated` at the GRANT level, not by RLS** —
`trade_rfq_tokens`, `studio_trade_agreement_tokens`, `plan_transmittal_tokens`, `invoice_links`. A
`security_invoker` view checks table privileges against the CALLER at plan time, **before any policy runs**,
so the first cut of the view raised for every studio member:

```
ERROR:  permission denied for table trade_rfq_tokens
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.trade_rfq_tokens TO authenticated;
```

**No shipped table's ACL was moved.** Each of the four comes through its own narrow SECURITY DEFINER reader
(`access_grants_trade_rfq`, `access_grants_trade_agreement_links`, `access_grants_plan_transmittals`,
`access_grants_invoice_links`) that returns the twelve normalised columns ONLY — no token, no hash — behind
an explicit studio gate, `REVOKE`d from PUBLIC and anon. Two of them (`studio_trade_agreement_tokens`,
`invoice_links`) have RLS enabled with **zero policies** and are service-role-only by design, so their gate
is stated here for the first time.

**A finding for Fable, not fixed here:** `trade_rfq_tokens` and `plan_transmittal_tokens` each carry a
`FOR ALL TO authenticated` studio-co-member policy (00424, 00429) that **cannot fire today**, because the
SELECT grant was never given. Those policies are dead. Granting SELECT would restore the posture they plainly
intend and is the post-flip rule in `patina-db-migrations`, but it is an ACL change to shipped tables and
belongs to a ruling, not to this ledger.

### Two rules the ledger keeps

- **No bearer credential is in it.** `invoice_links.token` (00574:63-89) and
  `fulfillment_evidence_upload_tokens.token` (00364:55-64) are stored in PLAINTEXT and ARE the credential.
  `grant_id` uses the row uuid for the first and `md5(token)` — a stable opaque handle — for the second,
  which has no uuid of its own. No `token_hash` appears either. Probe: zero grant_ids match `[0-9a-f]{64}`.
- **`grant_id` is TEXT**, `<tier>:<natural key>`, because the sources' keys are not all uuids (one text PK,
  one composite) and a bare uuid would collide in principle across tables.

`revoked_at` is derived as `updated_at` on the sources that record the STATE but not the moment; each branch
names which.

### `create_field_link` (PR-d)

Grafted from its grep-winner `00284:37`. 00284's authorization guard is carried **verbatim** — an
authenticated caller must still own the party's project, a NULL-uid internal caller (the `field-daily` cron,
`sms-dispatch`) still bypasses it with `created_by` NULL — and so is the supersede. Only the expiry changes:

1. the seat's window end — **the later of `on_site_to` and `warranty_until`** (PR-l's second option, taken as
   the default), through the end of that day;
2. else the caller's `p_expires_at`;
3. else the old 90 days.

The 90-day clock is retired as a **default**, not removed: a seat with no window still needs a date. The
shipped one-argument signature stays callable and is now a delegate, so no call site moves
(`use-party-sms.ts:133` is the only one) and the guard and the supersede cannot drift between the two bodies.

Erin Sato's two seats, from the probe:

```
       name        | link_ends  | on_site_to | warranty_until
-------------------+------------+------------+----------------
 Lindqvist kitchen | 2026-11-22 | 2025-10-15 | 2026-11-21     ← PR-l: the later of the two
 Okonkwo residence | 2027-08-14 | 2027-08-13 |                ← PR-d: ends with the engagement
```

## 6. The dev seed — `supabase/seed/people_crm_dev.sql`

The Okonkwo fixture as data, for `designer@patina.dev`'s studio (`b0000000-…-0001`, Local Dev Studio), wired
into `config.toml [db.seed] sql_paths` after the existing entries.

### The counts, and the arithmetic behind them

```
 entity_kind | cards            project      |  status   | seats
-------------+-------          -------------------+-----------+-------
 company     |    21           Lindqvist kitchen | completed |     7
 person      |    28           Okonkwo residence | active    |    24
```

**28 person cards** = fixture §2's 27 tabulated rows (F-01 … F-27) plus **Ben Ostrom**, §4's Lindqvist GC
owner, who has to be a card for the bring-forward to have anything to pick. **F-28 is not a 28th person** —
the fixture's own row says it is Erin Sato's SECOND SEAT, which is the whole point of one identity with many
seats. (§1's arithmetic reaches 28 from Okonkwo alone by counting "4 vendors (5 people)" while tabulating
four vendor people; the fifth is never named, so the seed carries Ben Ostrom rather than invent one.)

**21 firm cards** = the 18 Okonkwo firms that have people, plus **Rivera Finishes** and **Granite North** —
both named as Okonkwo roster rows in direction §3.4's Bidding and Done bands — plus **Ostrom Builders** from
§4. **Hartwell Studio is not a firm card**: a studio does not keep itself in its own rolodex. The Okonkwo
household and "Adaeze's sister" are not firms either (E3, and a private individual).

So `people_directory` returns **28 + 21 = 49** rows of `role='contact'` for this studio, told apart by
`meta.entity_kind` (PR-g's mixed list). That is the brief's "28 people + 21 firms", exactly.

### What else is in it

```
        object        | count
----------------------+-------
 affiliations         |    22   ← opened by 00592's pointer trigger, then given role/paper/signer facts
 authority_grants     |    11
 compliance_documents |    36
 consent_records      |     7
 contact_rules        |     6
 site_access_cards    |     1
 typed_channels       |    97
```

- **Consent lives on the RECORD (R-AY).** Every seat is born at the column default `not_asked` and
  `studio_channel_consent` carries the truth: F-12 Pete Rusk opted out by text on the Lindqvist thread,
  F-18 Joe Wozniak is invited and unanswered, and **five numbers are granted** — Ngozi, Erin, Luis, Dana,
  Amara — which is exactly R-F's "5 reachable by text". Seeding the frozen columns would teach the shape the
  program just retired, and the freeze trigger would refuse the next edit anyway. Pete's
  `refusal_unanswered` is `false` because that refusal **is** the recipient's own answer; only a fold's
  inherited refusal raises the flag.
- **Documents.** The brief's two named facts are in: Northgate Electric's general liability **lapsed
  2026-03-31** (blocking `site_access` and `draw`), Marrow & Sons **current to 2027-03-31**. Lakeshore
  Painting's is `CURRENT_DATE + 23` on purpose, so `lapses_soon` — the one word that needs a moving date —
  is always demonstrated. Great Northern Bank and CPED hold **nothing**: a lender and an AHJ never owed the
  studio paper (C13/R-A). Ashgrove's install-day COI is **deliberately absent** (the fixture says pending; a
  row with no expiry would read `current`). F-09's OSHA 30 card is a **person**-held, `held_by = 'gc'`,
  `other_named` document — one row exercising three of the table's less obvious columns.
- **Rules.** The brief's two (F-14/F-15's route-through, F-27's never-text) plus the three more the fixture
  states (F-10, F-13, F-26) and F-05's escalation-by-class.
- **Windows** are direction §3.4's own bands, verbatim: this week's five (19–25 Oct 2026), then Pete 9 Nov,
  Rosa and Frank 11 Jan 2027, Jim and Kelly 1 Feb, Ingrid 5 Apr, Amara 4 May, Nadia Aug, Jonah Sep.
- **The site access card** carries the lockbox version, the alarm reference, Ngozi's seat as key holder, the
  hours, six emergency lines and four `told_refs` — **and no code** (PR-r).
- **Field links** are minted through the RPC, not inserted, so the seed itself proves PR-d's expiry.
- **Two firm-only seats with no card** (Rivera Finishes, Granite North) keep the pre-redesign shape on
  purpose: Rivera is the one seat in this fixture that exercises the uncarded-identity branch, and Granite
  North is §3.4's Done row carrying `company_name` as TEXT with no pointer.
- **Not seeded:** Priya Natarajan and Dale Whitcomb have person cards but no local logins and no
  `project_team_members` rows — creating auth users for them is not a W1b fact, and their cards carry
  `profile_id IS NULL`. F-26 and F-27 land on `party_kind = 'other'` because `PartyKind` still has no
  inspector or lender (G-13); PR-f widens the vocabulary and that is not this wave.

### One thing beyond the brief, flagged

`config.toml`'s `[db.seed]` block carries a binding comment: *"Any edit to this array must be re-applied to
the remote one below under the same rule, or staging silently drifts from what this comment documents."* The
derivation rule is mechanical (staging = local minus the two local-only files, plus
`cloudflare-phase1-staging.sql`), so `people_crm_dev.sql` was added to **both** arrays. If Fable would rather
the Okonkwo fixture never reach staging, remove the one line from `[remotes.staging.db.seed].sql_paths` and
the comment's invariant needs a stated exception.

## 7. Verification

### Reset, including the seed

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2701 replayed statements
   # +228 lines over the W1a baseline: the five migrations' REVOKE/GRANTs

$ pnpm --dir …/agent-people-build supabase:reset
RESET_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
   # the only line matching /error/i in the whole run is a migration FILENAME:
   # "Applying migration 00458_sms_message_error_capture.sql..."

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

### Both SQL suites

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0  passed=48        # unchanged from the W1a close-out

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0  passed=12
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, and a superseded lapse released: passed
NOTICE:  2. the holder guard: a person is not a firm, a document belongs to one studio, other_named needs its label, and blocks is a closed vocabulary: passed
NOTICE:  3. people_directory v4: one row per identity, Dana's two seats beneath it, her four fixture words, no person-level stage, and an honest 28 + 21: passed
NOTICE:  4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone, pointing at the newest seat: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: F-08's field link ends with the engagement (PR-d), her warranty seat's link takes the later date (PR-l), no bearer credential is in the ledger, and the four grant-closed sources read without raising: passed
NOTICE:  10. create_field_link: the engagement window sets the expiry and outranks a caller date, warranty answers alone, the 90-day fallback survives for a windowless seat, the supersede and 00284's ownership guard are untouched: passed
NOTICE:  11. the seat's new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed
NOTICE:  12. the seeded fixture reads as the fixture: five granted numbers, Pete's Lindqvist refusal answering on Okonkwo, Joe invited, Frank routed to Rosa, Ray never texted, the lender's paper reported as a fact, Chidi's $2,500 line in cents, Erin preparing only, and Ngozi holding the key: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
```

Blocks 1–2 and 5–8 build their own fixtures in a second studio. Blocks 3–4 and 9–12 assert against the
seeded Okonkwo fixture, because the brief's acceptance is stated in the fixture's own words and a test that
re-invented Dana's two seats would prove the view works on data the room will never hold.

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
654     7     packages/supabase/src/database.types.ts
$ # run twice: NO DRIFT between two db:generate runs
```

**The diff, reviewed.** 654 insertions, 7 deletions. The seven deletions are the single-signature
`create_field_link` block, which becomes an **overloaded union** carrying both signatures — a widening, not a
removal. New top-level keys:

```
studio_compliance_documents · project_party_authority · project_site_access_cards   (tables)
people_directory_seats · v_access_grants                                            (views)
compliance_state · party_identity_key · reach_state_for · identity_seat_count
contact_rule_summary · project_designer · project_party_org
access_grants_trade_rfq · access_grants_trade_agreement_links
access_grants_plan_transmittals · access_grants_invoice_links                        (functions)
```

plus `project_parties`' ten new columns in `Row`/`Insert`/`Update`, `people_directory`'s five appended
columns, and the FK relationship entries the two new tables and the new seats view introduce. Trigger
functions do not appear in generated types, so the four `assert_*` guards show as nothing — probe 5 is what
proves them.

```
$ pnpm --dir … --filter @patina/supabase   type-check    # SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check    # DESIGNER_TC=0
$ pnpm --dir … --filter @patina/supabase   test
Test Files  100 passed (100)
     Tests  1253 passed | 12 skipped (1265)
$ npx jest (the seven directory/roster/desk suites)
Test Suites: 7 passed, 7 total
Tests:       112 passed, 112 total
```

### Probes (objects and access, never the ledger)

`build/probe57-w1b-objects.sql` → `.out`, `build/probe58-w1b-directory-as-designer.sql` → `.out`.

```
=== 1. the four new relations: RLS on, their policies, and who may SELECT ===
           relname           | relkind | rls | policies | auth_select | anon_select
-----------------------------+---------+-----+----------+-------------+-------------
 people_directory            | v       | f   |        0 | t           | t
 people_directory_seats      | v       | f   |        0 | t           | f
 project_party_authority     | r       | t   |        4 | t           | f
 project_site_access_cards   | r       | t   |        4 | t           | f
 studio_compliance_documents | r       | t   |        4 | t           | f
 v_access_grants             | v       | f   |        0 | t           | f

=== 2. PR-r: there is NO access code on the site access card ===
 code_like_columns = 0        (gate_code | code | access_code | lockbox_code | show_to_client)

=== 3. PR-w: four studio policies, no client leg ===
 project_site_access_cards_studio_select | r | is_studio_comember(project_designer(project_id))
 project_site_access_cards_studio_insert | a |
 project_site_access_cards_studio_update | w | is_studio_comember(project_designer(project_id))
 project_site_access_cards_studio_delete | d | is_studio_comember(project_designer(project_id))

=== 4. PR-n: the admin gate is in the write policies ===
 project_party_authority_studio_insert | a | has_admin_gate = t
 project_party_authority_studio_update | w | has_admin_gate = t

=== 5. the new functions (abridged: definer? volatility? search_path? acl?) ===
 access_grants_invoice_links         | definer | s | {search_path=public} | postgres,authenticated,service_role
 access_grants_plan_transmittals     | definer | s | {search_path=public} | postgres,authenticated,service_role
 access_grants_trade_agreement_links | definer | s | {search_path=public} | postgres,authenticated,service_role
 access_grants_trade_rfq             | definer | s | {search_path=public} | postgres,authenticated,service_role
 assert_compliance_holder            | definer | v | {search_path=public} | postgres,service_role
 assert_party_authority_copy_to      | definer | v | {search_path=public} | postgres,service_role
 assert_project_party_cards          | definer | v | {search_path=public} | postgres,service_role
 assert_site_access_key_holder       | definer | v | {search_path=public} | postgres,service_role
 compliance_state                    | INVOKER | s | {search_path=public} | postgres,authenticated,service_role
 contact_rule_summary                | INVOKER | s | {search_path=public} | postgres,authenticated,service_role
 create_field_link  (both sigs)      | definer | v | {public, extensions, pg_temp} | postgres,authenticated,service_role
 identity_seat_count                 | INVOKER | s | {search_path=public} | postgres,authenticated,service_role
 party_identity_key                  | INVOKER | i | (none — IMMUTABLE, pure) | postgres,authenticated,service_role
 project_designer                    | definer | s | {search_path=public} | postgres,authenticated,service_role
 project_party_org                   | definer | s | {search_path=public} | postgres,authenticated,service_role
 reach_state_for                     | INVOKER | s | {search_path=public} | postgres,authenticated,service_role

=== 6. people_directory: twelve columns in place, five appended ===
 1 person_id · 2 role · 3 display_name · 4 email · 5 phone · 6 profile_id · 7 project_id ·
 8 designer_id · 9 status_raw · 10 last_touch_at · 11 meta · 12 scope ·
 13 reach_state · 14 consent_status · 15 paper_state · 16 contact_rule_summary · 17 seat_count

=== 7. the view reads the record, not a frozen seat ===
 reads_consent_record = t · reads_paper_state = t · keys_on_identity = t
 still_reads_frozen_verdict = f · dates_still_off_the_seat = f

=== 8. create_field_link: both signatures callable ===
 p_party_id uuid                                        | reads_warranty = f | reads_window = f  (the delegate)
 p_party_id uuid, p_expires_at timestamp with time zone | reads_warranty = t | reads_window = t

=== 9. the freeze trigger still names only consent + phone ===
 phone · phone_e164 · sms_consent_disclosure_version · sms_consent_evidence ·
 sms_consent_recorded_at · sms_consent_recorded_by · sms_consent_source ·
 sms_consent_status · sms_consented_at · sms_opt_out_at
   # none of 00624's ten new columns is on it

=== 10. v_access_grants: all eleven tiers ===
 tiers_named = 11
 agreement_link, client_account, doc_share, evidence_upload, field_link, invoice_pay,
 plan_link, project_review, rfq_link, site_request, studio_member
   # seven in the view's own text; four inside the definer readers
```

And the room's own reads, as `designer@patina.dev`:

```
=== people_directory rows by role ===          === the contact branch, by entity_kind ===
  role   | count                                entity_kind | count
---------+-------                              -------------+-------
 client  |     7                                company     |    21
 contact |    49                                person      |    28
 lead    |     5
 sub     |     1   ← Rivera Finishes, the one uncarded identity in the fixture

=== Dana Kowalski: ONE row, two seats, four words ===
 display_name  |  role   | seat_count | reach_state | consent_status | paper_state |       rule
---------------+---------+------------+-------------+----------------+-------------+-------------------
 Dana Kowalski | contact |          2 | field_link  | granted        | lapsed      | (no rule on file)

   project_name    | party_kind |   trade    |  stage   | on_site_from | on_site_to | consent | reach      | paper
-------------------+------------+------------+----------+--------------+------------+---------+------------+--------
 Lindqvist kitchen | sub        | electrical | warranty | 2025-05-05   | 2025-10-15 | granted | on_paper   | lapsed
 Okonkwo residence | sub        | electrical | active   | 2026-10-19   | 2027-06-30 | granted | field_link | lapsed

=== the four paper words, on real firms ===    === consent, from the record only (R-AY) ===
      display_name      | paper_state           display_name  | consent_status
------------------------+-------------          --------------+----------------
 Marrow & Sons          | current               Amara Osei    | granted
 Northgate Electric     | lapsed                Dana Kowalski | granted
 Lakeshore Painting Co. | lapses_soon           Erin Sato     | granted
 Great Northern Bank    | not_on_file           Luis Ochoa    | granted
                                                Ngozi Eze     | granted
                                                Pete Rusk     | opted_out
                                                Joe Wozniak   | pending

=== every recorded rule, as one line of words ===
 Carol Nyström    | Never text. Use: email, mobile.
 Chidi Okonkwo    | Use: email, mobile.
 Frank Bauer      | Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. Write Rosa Delgado instead.
 Ingrid Halvorsen | Never text. Do not use: mobile. Use: email, office.
 Ray Thao         | Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00.
 Sam Rowe         | Never text. Use: email, mobile.

=== what a CLIENT account reads (PR-w) ===     === what anon reads ===
 authority_grants     | 0                       ERROR:  permission denied for table project_site_access_cards
 compliance_documents | 0                       (refused at the GRANT, before any policy runs)
 directory_seats      | 0
 site_access_cards    | 0
```

**One pre-existing artefact, not mine:** probe 1 shows `people_directory` with `anon_select = t`. That is the
local-only `seed/00-legacy-grants.sql` blanket grant (00221 and 00281 only ever granted `authenticated`), and
the view is `security_invoker`, so anon reads nothing through RLS. `people_directory_seats` and
`v_access_grants` are both explicitly `REVOKE`d from anon.

## 8. Not done, and owed

**Owed to W2 (unchanged from W1a §8, and nothing here made any of it worse):**

- Patina Field's `PunchCourtResolver` + `SupabaseSiteRequestService` (R-AV) still read the frozen seat
  column; `v_project_roster` still has no `phone_e164`.
- `site_request_resend()` still gates on the frozen seat.
- The portal's two UPDATE writers of the consent columns, `sendPartySms` / `flushDeferredMessages` /
  `mayTextField`'s surviving PR-x second check, the opt-in invite's evidence proof, and the inbound YES gate.
- 00621's two dispatch gates keep a seat leg (flagged for Kody in W1a §8).
- The unattributable-**send** fail-open still needs a POLICY ruling.

**Owed by this wave:**

- **The Directory UI has to move with the view.** `directory-view.tsx`'s chips map `role` to bands and every
  carded human is now `role='contact'`; PR-g's mixed list, the honest head count and the seat lines are W2's,
  and the room will read oddly until they land. No flag exists to hide it (rulings §6).
- **The party-profile sheet is the THIRD reader W2 owes** (R-BE, w1b final review r7 MAJOR-2).
  `usePerson` (`packages/supabase/src/hooks/use-people.ts:154-166`) filters `people_directory` on
  `person_id = <seat id> AND role = <party_kind>`, which is what the Call Sheet chevron
  (`roster/call-sheet-mount.tsx:72`) and the roster row pass. v4 keys a carded human on their rolodex
  card, so of the studio's 22 field seats only the one uncarded identity still resolves and 21 open an
  empty sheet. W2 repoints it: read `people_directory_seats` for the seat, join the identity on
  `person_id`, and take the consent word from the new `consent_status` column — never from `status_raw`,
  which on a card row carries the ARCHIVE state (`active`), a third answer again. Landed here in the
  meantime: `party-profile-sheet.tsx` renders **no** consent chip when `person` is null, because the
  fallback chain printed "Not asked" over a record the same screen's seat line reads `opted_out`.
- **`bid_due_at` / `bid_outcome` / `bid_amount_cents` / `bid_valid_until` / `bid_quoted_by_person_id` are
  P2**, so §3.4's Bidding band's dates carry no column yet; Rivera Finishes' seat holds the whole fact in
  `stage = 'no_response'`.
- **`client_households` is P2** (PR-c's household object), so the seed uses Adaeze's `designer_clients` row
  as the household and Chidi as a `client_rep` seat. The change-order threshold lives on his authority grant
  rather than on a household.
- **`PartyKind` is not widened** (PR-f), so F-26 and F-27 sit on `other`. The seed records that honestly.
- **The nightly expiry sweep is P2.** `compliance_state()` computes `lapses_soon` on read; nothing writes it
  or announces it yet.
- `studio_contact_merges`, `touches`, the decision-court widening and the `notification_log` channel status
  are P2/P3 as direction §8 sequences them.

**Two things for Fable to rule:**

1. **The dead policies on `trade_rfq_tokens` and `plan_transmittal_tokens`** (§5). Granting SELECT to
   `authenticated` would make their shipped studio policies fire and let `v_access_grants` read them
   directly; four definer readers exist instead. An ACL ruling, not a ledger decision.
2. **`people_crm_dev.sql` in `[remotes.staging.db.seed]`** (§6). Added to satisfy `config.toml`'s own
   derivation invariant; remove the line if the Okonkwo fixture should never reach staging.

**Nothing deployed.** W1b added **00623–00627**, so W2 mints from **00628**; 00595–00620 remain reserved.
No edge function was touched this wave, so no `_shared/*` redeploy is added to the chain beyond the one
W1a already owes.
