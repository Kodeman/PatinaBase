# W1b — final review, round 7 (migrations)

Adversarial review of `00623`–`00627`, `supabase/seed/people_crm_dev.sql`,
`supabase/config.toml` and the two SQL suites, on
`build/people-room-crm-2026-09-11` in
`.codex/worktrees/agent-people-build`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing was
pushed to Strata.**

Read first, as instructed: `rulings.md` (all of §3, R-A … R-AW/R-AY … R-BC),
`synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md`
§1/§2/§4/§5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`,
`build/w1a-close-review-r6-migrations.md` and `-tests.md`,
`build/w1b-report.md`, and the prior fix log
`build/w1b-final-fix-log-r6.md`. Every ruling in §3 is treated as settled and
is not a finding.

**Verdict: NOT clean — 1 BLOCKING, 2 MAJOR, 5 new MINOR (plus the carried
MINOR list, re-checked).**

---

## 0. Environment, before the destructive local act

```
$ grep -n SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co   ← commented
3:SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                    ← commented
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                             ← ACTIVE, local
```

The worktree itself carries no `apps/designer-portal/.env.local`; the repo
root's active `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1:54321`, so the reset
gate is satisfied. (Line 3's `SUPABASE_URL` — a different variable, read by
scripts, not by the portal build — still names Strata. Not this wave's, worth
knowing before anyone runs a script that reads it.)

⚠ **The local database is still not solely owned.** Between my two resets the
seeded `Leah Hartwell` organisation came back with a **different uuid**
(`d004b23c-…65f3` → `b4bad09f-…5c05`), which is how the seed mints it. Probes
that hard-code that id are not replayable; `probe137` below resolves it by
name instead. Every number in this report was taken after the second reset.

## 1. What I ran

### 1.1 Legacy grants, regenerated first — no drift

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2715 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
        (both empty — the committed file is already current)
```

### 1.2 Reset, twice

```
$ pnpm --dir …/agent-people-build supabase:reset     # first
RESET1_EXIT=0
… Seeding data from supabase/seed/people_crm_dev.sql...
… Finished supabase db reset on branch main.
$ pnpm --dir …/agent-people-build supabase:reset     # second
RESET2_EXIT=0
… Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -At -c "select max(version) from supabase_migrations.schema_migrations"
20260910152111        (00623–00627 applied; 00595–00620 untouched)
```

(The first attempt failed inside the tool sandbox on
`~/.supabase/telemetry.json` — `EPERM`, not a migration error. Re-run with the
sandbox off: exit 0.)

### 1.3 The dev seed replays on an already-seeded database

```
$ psql … -v ON_ERROR_STOP=1 -q -f supabase/seed/people_crm_dev.sql
SEED_REPLAY_EXIT=0        (0 lines matching /error/i)
```

### 1.4 Idempotency — all five files applied TWICE in one rolled-back transaction

```
$ psql … -v ON_ERROR_STOP=1 -f <00623,4,5,6,7 ×2>
IDEM_EXIT=0   errors=0   ROLLBACK
```

### 1.5 Both suites

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0   → 15 blocks, "All W1b assertions passed."
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0   → "All W1a assertions passed."   (45 numbered notices)
```
Both re-run after the second reset: same result.

**One shipped SQL gate is RED** (carried MINOR-27, re-measured):
```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
ERROR:  FAIL a2: expected exactly 12 columns, got 17
```

### 1.6 Generated types — no drift

```
$ SUPABASE_DB_URL=…54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
        (empty)
```

### 1.7 My own probes

Saved under `artifacts/people-room-crm-2026-09-11/build/`, each with its `.out`:

| Probe | What it measures |
|---|---|
| `probe136-r7-supersede-successor-edit` | the compliance supersede invariants under an edit to the **successor** row |
| `probe137-r7-party-card-resolver` | `assert_project_party_cards()` on a `studio_id IS NULL` project, four actors |
| `probe138-r7-studioless-seat-number-dropped` | a seat's number dropped from the consent reduction, with the mutation control |
| `probe139-r7-party-sheet-useperson` / `probe139b-…-reach` | what `usePerson(<seat id>, <kind>)` returns after v4, and what the sheet then prints |
| `probe140-r7-cross-tenant-sweep` | every new table, view, RPC and write, as an unrelated studio's owner and as `anon` |
| `probe141-r7-r6-blocking1-rewalk` | r6 BLOCKING-1's own actor — a **manufacturer**-org co-member of the designer |
| `probe142-r7-overclaim-and-room` | seat_count vs nestable seats, and the room as the studio's admin |

---

## 2. Migration rules — pass/fail

| Rule | Result |
|---|---|
| Hand-numbered `NNNNN_slug.sql`, minting above the reserved block | PASS — `00623`–`00627`; `00622` already existed on the branch, so W1b mints from 00623 (`w1b-report.md` §0 states this); `00595`–`00620` untouched |
| grep-winner before redefining a function | PASS — 18 of the 19 functions are new in this wave (grep returns only the W1b file). `create_field_link`'s winner is `00284`, and the graft is faithful: the guard (`auth.uid() IS NOT NULL AND NOT EXISTS …designer_id = auth.uid()`), the supersede UPDATE and the token/hash lines are byte-equal to `00284:37`; the only additions are the window computation and `expires_at` in the INSERT (00283's column default was `now() + 90 days`, which the fallback restates) |
| Banner + lineage | PASS — all five carry a banner; `00626:4-11` carries the full `people_directory` lineage and `00623`/`00626` carry per-round fix lineage |
| Idempotent | PASS — §1.4 |
| RLS in the same file | PASS — each of the three new tables enables RLS and creates its four policies in its own file |
| Explicit grants both directions + `REVOKE … FROM PUBLIC, anon` | PASS — measured from the catalog: `anon` EXECUTE is **false** on all 19 new functions and SELECT is false on `people_directory_seats`, `v_access_grants` and the three tables. (`people_directory` itself still shows `anon SELECT = true` from the local blanket seed — carried MINOR-7, and it reads nothing: `permission denied for table studio_contacts`) |
| SECURITY DEFINER pins `search_path` | PASS — every definer function has `proconfig` `search_path=public` (`create_field_link` keeps `00284`'s `public, extensions, pg_temp`, verbatim) |
| Schema-qualify extension fns | PASS — `extensions.gen_random_bytes` / `extensions.digest` |
| Guarded crons | N/A — no cron in this wave |
| CHECK over enum | PASS — `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `blocks`, `scope`, `held_by`, `source` are all named CHECKs, drop-and-re-added so a rerun widens them |
| Money integer cents | PASS — `threshold_cents integer`, `>= 0`; the fixture's $2,500 is `250000` |
| Regenerate `seed/00-legacy-grants.sql` | PASS — §1.1, no drift |

### 2.1 The RLS predicates the brief names

```
studio_compliance_documents  ×4   is_active_studio_member(organization_id)                     ← the studio_contacts family ✔
project_party_authority      ×4   is_active_studio_member(project_party_org(engagement_id))
                                  AND is_studio_comember(project_party_designer(engagement_id))
                                  AND (scope <> ALL {money,draw_certify} OR is_org_admin_or_owner(...))  ← PR-n in the policy ✔
project_site_access_cards    ×4   is_active_studio_member(project_tenant_org(project_id))
                                  AND is_studio_comember(project_designer(project_id))         ← PR-w, no client leg ✔
```
All twelve are `TO authenticated`; there is no client policy and no `anon`
policy anywhere, and `project_site_access_cards` carries **no** code-like
column (`gate_code | code | access_code | lockbox_code | show_to_client` → 0).

### 2.2 Cross-tenant — one new hole

`probe140`, as the owner of **Phase One Synthetic Studio** (unrelated to the
seeded studio):

```
docs 0 | authority 0 | site_cards 0 | seats 0 | v_access_grants 1 (their own studio_member row)
people_directory: 0 rows
the four definer readers: rfq 0 | agreement 0 | plan 0 | invoice 0
compliance_state(<foreign firm>)        = not_on_file
identity_paper_state(<foreign person>)  = not_on_file
contact_rule_summary(<foreign person>)  = (null)
identity_seat_count(<foreign card>)     = 0
identity_phone_numbers(<foreign org>,…) = 0 rows
identity_consent_status(<foreign org>,…)= (null)
identity_consent_evidence(<foreign org>,…) = 0 rows
site access INSERT refused: new row violates row-level security policy
document  INSERT refused: new row violates row-level security policy
lockbox   UPDATE touched 0 row(s)
anon: refused on people_directory_seats, v_access_grants, project_site_access_cards,
      compliance_state, and on people_directory's own base table
```

The read boundary holds. The **write** boundary does not, on one path:
`assert_project_party_cards()` — BLOCKING-1 below.

### 2.3 `v_access_grants` — the eleven sources

`tiers_named = 11`. The four grant-closed sources come through their own
definer readers, all four now tenant-first; `probe141` re-walks r6
BLOCKING-1's own actor and reads 0 from each. The seven invoker branches all
sit behind their base tables' shipped RLS (measured: `organization_members`
`is_active_org_member`, `designer_clients`/`leads` designer-scoped,
`document_shares` `is_design_studio_comember`, `site_request_access` and
`project_review_access` studio-co-member, `fulfillment_evidence_upload_tokens`
admin-role-only), so the ledger inherits and adds nothing. No bearer
credential: `rows matching [0-9a-f]{64} = 0`.

### 2.4 The stage/window backfill

```
Lindqvist kitchen | warranty   | 7      ← completed project, close inside 12 months
Okonkwo residence | active     | 13
Okonkwo residence | awarded    |  9
Okonkwo residence | no_response|  1
Okonkwo residence | off_job    |  1
```

### 2.5 `compliance_state` and the 30-day window

```
today = 2026-09-12   boundary = 2026-10-12
Great Northern Bank    | not_on_file | (no paper)
Lakeshore Painting Co. | lapses_soon | 2026-10-05   ← inside the window
Marrow & Sons          | current     | 2027-03-31
Northgate Electric     | lapsed      | 2026-03-31
```
All four words on real fixture rows; suite block 1 walks the boundary both
ways and the worst-first precedence.

### 2.6 `people_directory` v4 — the shape the brief asks for

Twelve carried columns in place and in order, five appended:
`1 person_id · 2 role · 3 display_name · 4 email · 5 phone · 6 profile_id ·
7 project_id · 8 designer_id · 9 status_raw · 10 last_touch_at · 11 meta ·
12 scope · 13 reach_state · 14 consent_status · 15 paper_state ·
16 contact_rule_summary · 17 seat_count`. As the studio's **admin** (not the
designer): `client 7 · contact 49 · lead 5 · sub 1`, 31 seat rows,
`rows_overclaiming = 0`. Every branch predicate is the one the record now
documents branch by branch (r6 MAJOR-2's ruling).

---

## 3. `w1b-final-fix-log-r6.md`'s three findings, re-checked

| r6 finding | Status |
|---|---|
| **BLOCKING-1** — three definer readers gated on `is_studio_comember(<designer>)` | **CLOSED**, re-walked with the finding's own actor. `probe141`: a manufacturer-org co-member of the designer (`comember_any_org t · design_studio_comember f · member_of_the_owning_studio f`) reads `rfq 0 · agreement 0 · plan 0 · invoice 0 · through_the_ledger 0` over an RFQ token on recorded-tenant paperwork, while the owning studio's admin reads it (`rfq_grants_for_the_owning_admin = 1`). The four readers' texts carry the tenant leg and `is_design_studio_comember` beside it |
| **MAJOR-1** — the tenant conjunct went dark on a `studio_id IS NULL` project | **CLOSED for the gates, and it moved the same defect into a guard.** `probe137`: on `Aspen Loft Refresh` the gate resolver names `Local Dev Studio` for the working studio's admin (the consent resolver still names `Leah Hartwell`), and suite block 14 passes. But `assert_project_party_cards()` was not moved with the four policies and two views — see BLOCKING-1 below. Also still open in the same family: `identity_phone_numbers()`' seat leg (the fix log's own "still open" note calls it fail-closed; it is fail-**open** — MAJOR-1 below) |
| **MAJOR-2** — the four designer-scoped branches | **CLOSED as a ruling of record.** The view COMMENT now names, branch by branch, which are tenant-scoped and which are designer-scoped by inheritance, what that admits and what the close is. `probe141` re-measures the residual: the same outsider reads `client 6 · lead 5` from the view and the same columns straight off `designer_clients`/`leads`. Not re-flagged |

---

## 4. Findings

### BLOCKING-1 — `assert_project_party_cards()` still resolves the studio through the GUESSING resolver, so on a `studio_id IS NULL` project the tenant guard is **inverted**: it refuses the working studio's own rolodex cards and accepts a card belonging to a studio the caller is not a member of and cannot read

**Where.** `supabase/migrations/00624_project_party_window_and_authority.sql:305`

```sql
v_org := public.project_consent_org(NEW.project_id);
```

r6 MAJOR-1 moved every gate in this wave onto the new resolver
`project_tenant_org()` — the four site-access policies (`00625:216-250`), the
four authority policies (through `project_party_org()`, `00624:167-176`), the
Directory's party branch (`00626:1173`) and the seats view (`00626:1493`).
The BEFORE trigger that is the **only** tenant guard on
`project_parties.company_id` and `.warranty_contact_person_id` was not moved,
and the function's own COMMENT (`00624:356`) now claims both resolvers at
once: "the studio `project_party_org()`/`project_consent_org()` resolves".
They are not the same studio. On 5 of 8 local projects they are different
studios, which is the measurement r6 MAJOR-1 rests on.

**Failure scenario, walked** (`probe137`, as `studio_manager@patina.dev`, an
**admin** of Local Dev Studio and not a member of Leah Hartwell):

```
=== premise: the two resolvers disagree on this project ===
 consent_resolver_names = Leah Hartwell
 gate_resolver_names_for_the_working_admin = Local Dev Studio

=== A. the working studio's ADMIN names their OWN firm card on their own seat ===
NOTICE:  A: REFUSED — party_company_other_studio  (P0001)

=== B. the same admin names a card of the GUESSED studio, which they are not a member of ===
NOTICE:  B: a FOREIGN studio's firm pointer LANDED on this studio's seat

=== C. what the working studio now reads on its own seat line ===
 seat_id               | display_name   | company_id                           | paper_state
 e7000000-…-0000e1     | Studioless Sub | e7000000-…-0000f1                    | not_on_file
 can_the_admin_read_that_card = 0

=== D. and the warranty contact pointer, same resolver ===
NOTICE:  D: REFUSED — party_warranty_contact_other_studio
```

So, on every project that records no `studio_id`:

1. **The compliant write is refused.** `company_id` is the whole point of
   `00624` §2 and of PR-b's hybrid (the firm's channels, rule, consent and
   document expiries read live from the card), and `warranty_contact_person_id`
   is CS5-25's one named person after close. Neither can be set to a card in
   the studio actually doing the work. The r6 fix log's MAJOR-1 walk claims
   "the admin … may record both" and suite block 14 asserts the same for a
   site access card and a money grant; the firm pointer and the warranty
   contact are a third and fourth write, and they do not land.
2. **A cross-tenant pointer lands.** The trigger is SECURITY DEFINER and
   checks only `studio_contacts.organization_id = v_org`; it never asks
   whether the caller belongs to `v_org`. A member of the working studio can
   therefore write a foreign studio's card id onto their own seat — a card
   they read 0 rows of — and the working studio's own seat line then carries
   it, with `paper_state` degrading to `not_on_file` (so the room prints "no
   paper on file" for a firm the studio never named). The exposure is a uuid,
   not PII, and the caller must already know that uuid, which the wave's
   surfaces do not hand them; I grade it BLOCKING anyway because the brief's
   BLOCKING class names "any cross-tenant … write" without a reachability
   qualifier, and because the guard's own error name
   (`party_company_other_studio`) is precisely the violation it now permits.
   Downgrade it knowingly if Fable weighs discoverability.

**The fix.** One line: `v_org := public.project_tenant_org(NEW.project_id);`
— the same substitution r6 made everywhere else, so this wave keeps exactly
one gate resolver as its banner claims. Note the consequence to state in the
COMMENT: `project_tenant_org()` is caller-relative, so a service-role writer
(`auth.uid() IS NULL`) on a studio-less project resolves NULL and the trigger
takes its existing `party_card_project_has_no_studio` refusal — which is the
honest answer and is already the behaviour for a project that resolves to no
studio at all. Correct the COMMENT at `:356` either way; it currently names
both resolvers as if they were interchangeable.

---

### MAJOR-1 — `identity_phone_numbers()`' seat leg drops a number the studio holds an `opted_out` record for, and the Directory row then prints `granted`

**Where.** `supabase/migrations/00626_people_directory_v4_seats.sql:624`

```sql
AND public.project_consent_org(pj.id) = p_organization_id
```

r5 BLOCKING-1 added that leg to close a cross-tenant phone-number oracle, and
it does close it. But it is an **equality test against the guessing resolver**,
while the number set feeds a **worst-first** reduction — and r4 MAJOR-3
established, in this same function's banner, that removing a number from a
worst-first reduction can only make the printed word MORE PERMISSIVE. On a
project that records no `studio_id`, `project_consent_org()` names the studio
the designer's memberships rank first, which need not be the studio whose
rolodex card the row belongs to; that seat's number drops out. `r6`'s fix log
lists this as a still-open MINOR-13 sibling and calls it "fail-closed, not
fail-open". It is fail-open.

**Failure scenario, walked with a mutation control**
(`probe138`; Dana Kowalski's card is in Local Dev Studio, her card number
`+16125550111` is `granted`, and she takes a seat carrying a second work
mobile `+16125558888` on `Aspen Loft Refresh`, a job of the same studio that
records no `studio_id`):

```
=== the record this studio holds for that number ===
 record_word = opted_out

=== the numbers the reduction actually sees for Dana ===
 +16125550111            ← the seat's +16125558888 is gone

=== what Dana's Directory row prints ===
 Dana Kowalski | consent_status = granted | seat_count 3

=== and her seat lines ===
 Aspen Loft Refresh | +16125558888 |            ← NULL (the r6 gate)
 Lindqvist kitchen  | +16125550111 | granted
 Okonkwo residence  | +16125550111 | granted

=== CONTROL: move the same seat onto a job that RECORDS its studio ===
 +16125550111
 +16125558888
 Dana Kowalski | consent_status = opted_out
```

One field — `projects.studio_id` — decides whether the studio's own recorded
refusal reaches the face. Nothing else about the seat, the number or the
record changes. And nothing on the row argues: the seat line for that job
prints NULL (the r6 fix's "unknown" gate), so the only word the room shows for
the number is the affirmative one on the identity row — which is the row
`party-profile-sheet.tsx:262` computes `granted` from and `:742` opens the
composer on.

**Not BLOCKING.** The send rail is independently fail-closed for this shape:
`_shared/sms.ts`'s `resolveProjectOrg()` (`:271`, over `primaryStudioFor()`
at `:209-258`) resolves the org the same way SQL does —
`COALESCE(studio_id, _primary_studio_for(designer))` — finds no record for
`+16125558888` at the guessed studio, and `channelConsentVerdict` returns
`refuse` on `!record` (`:427`). So a text
does not go out; a reader shows a verdict the record contradicts, which is the
MAJOR class exactly.

**Owed beside it, and the reason the Strata count matters.** On a studio-less
project the send rail resolves consent at the **guessed** studio. If that
studio holds a `granted` record for a number the studio doing the work has
recorded `opted_out`, the rail sends. That is `project_consent_org()`'s own
pre-existing posture (00594 / R-AK), not something 00623–00627 introduced, and
it is the same population the 00624 banner already flags — "THE COUNT OF
`studio_id IS NULL` PROJECTS ON STRATA IS OWED BEFORE THIS CHAIN RUNS". It is
worth saying plainly in the deploy brief that the owed number gates a consent
question, not only a visibility one.

**The fix.** R-BB is explicit: `identity_consent_status` "reduces over the
studio's consent records, not over seats visible to the caller, so it cannot
fail open". The honest number set for a studio is every number carried by a
seat on a project **that studio is doing the work on** — i.e. resolve the
seat's studio through `project_tenant_org()` beside (not instead of) the
consent resolver, or accept the union of the two, since both legs are already
inside a function gated on `is_active_studio_member(p_organization_id)` and a
wider-but-same-studio set can only make the word less permissive. Either way,
drop the claim that the current leg is fail-closed.

---

### MAJOR-2 — after v4 the shipped party-profile sheet cannot resolve 21 of the studio's 22 field seats, and prints "Not asked" over a record that says `opted_out`

**Where.** `00626`'s party branch (`00626:1153` — `AND pp.studio_contact_id IS
NULL`) plus the contacts branch's `person_id = sc.id`, against
`packages/supabase/src/hooks/use-people.ts:154-166` (`usePerson` filters
`people_directory` on `person_id = <id> AND role = <role>`) and
`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:194,259-262`.

Before v4 the party branch emitted one row per seat with
`person_id = pp.id, role = pp.party_kind`, so
`usePerson(<seat id>, <party_kind>)` — which is what the Call Sheet chevron
(`roster/call-sheet-mount.tsx:72`) and the roster row chevron pass — resolved
the seat. After v4 a stamped seat is not in the view at all (its identity is
the card row, whose `person_id` is the card id), and an unstamped identity is
addressable only at its **winning** seat.

**Failure scenario, walked** (`probe139`, `probe139b`, as the studio's admin):

```
=== how many of the studio's seats can the shipped party sheet still open? ===
 seats_of_the_seven_kinds | usePerson_finds_a_row | sheet_opens_empty
                       22 |                     1 |                21

=== the seats whose record refuses texts, and what the sheet would print ===
 Pete Rusk | +16125550112 | seat_line_word opted_out | card_row_word opted_out
           | no row -> chip falls back to Not asked
 Pete Rusk | +16125550112 | seat_line_word opted_out | card_row_word opted_out
           | no row -> chip falls back to Not asked
```

With `person` null, `party-profile-sheet.tsx:259-262`
(`person?.status_raw ?? meta.sms_consent_status ?? 'not_asked'`) yields
`'not_asked'`, and `ConsentChip` (`people/person-bits.tsx:179-180`) maps an
unknown key onto `SMS_CONSENT_DISPLAY.not_asked` — so the sheet prints **"Not
asked"** for a human whose record, on the same screen's seat line, says
`opted_out`. The contact card beside it is empty (name, company, trade, phone
and email all come from that row).

Two further consequences of the same shape, for the record: the card row that
*is* returned carries `status_raw = 'active'` (the card's archive state, not a
consent word — measured: `Pete Rusk | contact | active | opted_out`), so a
reader that keeps reading `status_raw` for consent gets a third answer; and
`people-derivation.ts:232-239`'s status dot for `sub`/`installer`/`receiver`
now never fires, because those roles no longer appear.

**Not BLOCKING.** `granted = consent === 'granted'` is false, so the composer
stays disabled and the phone is null, so the invite branch at `:786`
(`consent === 'not_asked' && phone`) does not render either. Nothing sends.

**Why this is a finding and not the settled W2 consequence.** `w1b-report.md`
§4 lists `party-profile-sheet.tsx` as a reader and §8 says "the Directory UI
has to move with the view", naming `directory-view.tsx`'s chips, the head
count and the seat lines. Those are the Directory. This is a different
surface, reached from the Call Sheet and the roster, and what it shows is a
**consent verdict that contradicts the record** — the class the last three
rounds treated as MAJOR. rulings §6 (100%, no flag) and the `00626:96-110`
deploy-sequencing constraint mean W2's Directory work is what unblocks it, so
the fix may well be W2's; the point is that it has to be *named* in W2's brief
with the other two, and the wave's own report does not name it.

**The fix (W2, or a note here).** `usePerson` / the sheet resolve an identity,
not a seat: read `people_directory_seats` for the seat and join to the
identity row on `person_id`, and take the consent word from the new
`consent_status` column rather than from `status_raw`. Until then the sheet
should not render a consent chip at all when `person` is null, rather than
falling back to the affirmative-adjacent "Not asked".

---

### MINOR findings

| # | Finding | Cite | Evidence |
|---|---|---|---|
| MINOR-r7-1 | **The compliance supersede invariants are one-shot.** The guard trigger fires on `holder_id, holder_type, organization_id, superseded_by, doc_type, expires_on` and validates only the written row's own `superseded_by`; it never re-validates a chain from the **successor's** side, and `blocks` is not in its column list at all. So a renewal recorded correctly (gates carried, in force, dated) can be gutted afterwards by one ordinary member UPDATE, and `compliance_successor_drops_a_gate` / `_already_lapsed` are speed bumps. Walked: Northgate Electric `lapsed` → record the renewal with `{site_access,draw}` and retire the lapse → `current` (correct) → `UPDATE successor SET blocks='{}'` (trigger silent) → `current` → `UPDATE successor SET expires_on = CURRENT_DATE-1` (trigger fires, passes: the row's own `superseded_by` is NULL) → **still `current`**, over a card whose only general-liability papers are one retired 2026-03-31 lapse and one expired gateless row. Dana Kowalski's Directory row reads `current` with it. Graded MINOR for the same reason r6 graded MINOR-2/31/36/41 so: `blocks` is the studio's own declaration of what a paper gates, so `compliance_state()` still agrees with the record as written. It is nonetheless the fourth round in which this consequence is reachable, and the one-line fix is to add `blocks` to the trigger's `UPDATE OF` list and re-assert the chain when a row that is somebody's `superseded_by` target is edited | `00623:477-478`, `00623:425-433`, `00623:414-422` | `probe136-…out` |
| MINOR-r7-2 | **A shipped SQL gate is red.** `supabase/tests/rls/people_directory_scope_test.sql:308` asserts exactly 12 columns and the view now has 17: `ERROR: FAIL a2: expected exactly 12 columns, got 17`, non-zero exit. This is carried MINOR-27, re-measured after the second reset; it is the only red gate I found, and it is one line. It matters more than its severity suggests because it is the gate a verification pass would run | `supabase/tests/rls/people_directory_scope_test.sql:308` | §1.5 |
| MINOR-r7-3 | **`project_tenant_org()` is a third ungated definer oracle** (carried MINOR-12's family, new in r6). Its first COALESCE leg returns `projects.studio_id` with no membership test, so any authenticated caller learns which studio owns any project uuid. Measured as the unrelated Phase One owner: `project_tenant_org('d0e00000-…-000a') = b0000000-…-0001` and `project_designer(<same>) = a0000000-…-0004`, while every object gated on them returns 0. A uuid→uuid mapping, no PII; the fix is the same as MINOR-12's (`is_active_studio_member` on the return, or leave it recorded) | `00624:109-141` | `probe140-…out` |
| MINOR-r7-4 | **On a studio-less project the "tenant conjunct" is not a tenant gate.** `is_active_studio_member(project_tenant_org(p))` is caller-relative there, so it is true for *every* caller who shares an active `design_studio` with the job's designer / lead / creator — i.e. on that population the conjunct narrows `is_studio_comember` from any-org to design-studio-org and does nothing more. Both of the designer's studios read the seats, each resolving "their own" org. The COMMENTs say the resolver is caller-relative; the suite's block-14 summary ("the admin of the studio doing the work reads its seat…") and the fix log's framing read as a tenant boundary. Worth one sentence in the 00624 banner so the next reader does not over-trust the conjunct on that population | `00624:109-141`, `00626:1173`, `00626:1493`, `00625:216-250` | read; `probe137` premise |
| MINOR-r7-5 | **The definer readers' tenant-less populations are gated on `is_design_studio_comember` alone** — `proposals.project_id IS NULL` (5 of 12 proposals locally) and an invoice with neither `studio_id` nor `project_id` (0 locally). Each reader's COMMENT says so, which is why this is MINOR rather than a hole; but for `invoice_links` the table was service-role-only before this file, so the population is new exposure, and "which studio owns a projectless proposal" is a question the record cannot answer. A ruling is owed alongside the dead-policy ACL ruling the report already asks for | `00627:122-125`, `00627:251-258` | measured populations, §2.3 |

### The carried MINOR list, re-checked

| Carried | Status this round |
|---|---|
| MINOR-7 (`people_directory` restates GRANT with no REVOKE) | **OPEN** — `anon SELECT = true` from the local blanket; reads nothing (`permission denied for table studio_contacts`) |
| MINOR-12 (ungated definer oracles) | **OPEN**, and now three functions — see MINOR-r7-3 |
| MINOR-13 (the `_primary_studio_for` fallback) | **OPEN in two new places** — BLOCKING-1 (the card guard) and MAJOR-1 (the number set) |
| MINOR-16 (`people_crm_dev.sql` in the staging seed array) | **OPEN** — `supabase/config.toml:60` and `:88` |
| MINOR-27 (the shipped scope test's column count) | **OPEN** — MINOR-r7-2 |
| MINOR-31 / MINOR-2 / MINOR-36 / MINOR-41 (one-write `lapsed` → `current` doors) | **OPEN**, and MINOR-r7-1 adds the post-supersede leg |
| MINOR-33 (`party_identity_key` / `party_kind_in_directory` pin no `search_path`) | **OPEN** — `proconfig` NULL on both, `search_path=public` on all 17 others. Both bodies resolve only to `pg_catalog`, so nothing is hijackable today |
| MINOR-35 (`w1b-report.md` stale) | **OPEN AND WORSE — seven rounds.** `grep -c` over the report: `identity_paper_state` 0, `identity_phone_numbers` 0, `identity_consent_status` 0, `identity_consent_evidence` 0, `reach_state_for_identity` 0, `party_kind_in_directory` 0, `field_link_window_closed` 0, **`is_active_studio_member` 0, `project_tenant_org` 0**. §3 still prints the site-access policies as `is_studio_comember(project_designer(...))` alone; §4 still presents `compliance_state(COALESCE(company_id, id))` as the design; §7 still claims `passed=12` and a `654 7` type diff where there are 15 blocks and no diff. The report is not a usable input for W2's brief as it stands |
| MINOR-42 (`identity_seat_count()` vs the seats view) | **OPEN** — `identity_seat_count` (`00626:333-346`) still has no tenant leg and reads under `project_parties`' own `is_studio_comember(designer)` policies, so `seat_count` is computed over a strictly broader population than the seats a row can nest. `rows_overclaiming = 0` on the fixture, because every seeded seat sits on a project whose `studio_id` is set |
| MINOR-1, 3, 4, 5, 6, 8, 9, 10, 14, 15, 17–26, 28, 29, 30, 32, 34, 37, 40, 43, 44 | **Carried unchanged**; nothing this round touched them and nothing I measured contradicts r6's status for them |
| MINOR-11, 21, 24, 38, 39 | CLOSED (as of r3/r4/r5) |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- Legacy grants regenerate to no diff; generated types regenerate to no diff.
- All five files apply twice in one transaction with zero errors.
- Reset twice; the dev seed replays against an already-seeded database.
- Both SQL suites green, before and after the second reset.
- `anon` is refused on every new object and every new function.
- An unrelated studio's owner reads nothing from any new table, view or RPC
  and can write nothing (`probe140`).
- r6 BLOCKING-1's own actor reads nothing from the four definer readers
  (`probe141`).
- `compliance_state`'s four words on real fixture rows, with the 30-day
  boundary.
- PR-r: no code-like column on the site access card. PR-w: four policies,
  `TO authenticated`, no client leg, no `show_to_client`.
- PR-n in the INSERT/UPDATE/DELETE policies, walked by suite block 5.
- `create_field_link` is a faithful graft of `00284:37`; both signatures
  callable; `field_link_tokens.expires_at`'s 90-day default matches the
  fallback the new body restates.
- The stage backfill, `people_directory`'s twelve carried columns and their
  types, the eleven tiers, and no bearer credential in the ledger.

## 6. What would make this clean

1. `00624:305` → `project_tenant_org()`, and fix the COMMENT at `:356`
   (BLOCKING-1). Add a suite leg to block 14: the working studio's admin
   records a `company_id` and a `warranty_contact_person_id` naming their own
   cards on a studio-less job, and a foreign studio's card is refused.
2. `00626:624` — give the seat leg the studio doing the work, and retire the
   "fail-closed" claim (MAJOR-1). Suite leg: the mutation control from
   `probe138`, both ways.
3. Name the party-profile sheet in what W2 owes, with the two other readers
   (MAJOR-2) — `usePerson` resolves an identity, and the consent chip comes
   from `consent_status`, not `status_raw`.
4. Then the two one-liners that cost nothing: `blocks` into the compliance
   trigger's `UPDATE OF` list (MINOR-r7-1) and the column count in
   `supabase/tests/rls/people_directory_scope_test.sql:308` (MINOR-r7-2).
5. Rewrite `w1b-report.md` against the code as it now stands before W2's brief
   is written from it (MINOR-35).

## 7. Not a finding, for the record

- Every ruling in `rulings.md` §3 is settled, R-AW/R-AY included, and I found
  no place where 00623–00627 reads or writes a frozen
  `project_parties.sms_consent_*` column. `grep -nE "pp\\.sms_consent|\\.sms_consent_[a-z_]+\\b" supabase/migrations/0062[3-7]*.sql`
  returns nothing; the 13 textual hits are banner prose plus the three `meta`
  JSON **key names** at `00626:1060-1062`, whose values are `q.consent_word`,
  `q.record_consented_at` and `q.record_opt_out_at` — the record's. The dev
  seed writes none either (`people_crm_dev.sql:684`).
- The four designer-scoped Directory branches are r6 MAJOR-2's recorded
  ruling; the `client 6 / lead 5` read by an outsider in `probe141` is that
  ruling's own measured residual, not a new finding.
- Every carded human moving to `role='contact'` is settled (rulings §6, no
  flag, one chain). MAJOR-2 above is not that consequence — it is a consent
  verdict on a different surface.
