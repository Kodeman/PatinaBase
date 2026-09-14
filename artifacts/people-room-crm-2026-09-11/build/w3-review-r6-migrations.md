# W3 (P2) — adversarial migration review, round 6

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `e7c60adaa`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Every measurement below was taken inside a
`BEGIN … ROLLBACK` probe; nothing this review wrote survives.

Read in full: `w3-data-report.md`; `00628`, `00629` (all 2324 lines), `00630`, `00631`, `00632`,
`00633`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24;
`SPEC.md` §5.4/§5.7; `w1a`/`w1b`/`w2a`/`w2b`/`w2c` reports; `w2-review-r15-qa.md`;
`fixture.md` §4; `w3-fix-log-r5.md`; `w3-review-r5-migrations.md`.

**Verdict: NOT clean — 1 blocking, 4 major, 14 minor.**

Probes: `/tmp/claude/w3r6/pA.sql` … `pH.sql`.

---

## 0. Gates I ran myself

| Gate | Result |
|---|---|
| migration ledger | `00621 … 00633` + `20260910152111` present; head matches the branch |
| full `supabase db reset` replay | **observed live** — another session reset this database at 20:0x and I watched `schema_migrations` climb from `00463` to `20260910152111` with the seeds landing (49 `studio_contacts`). A clean replay of exactly these files. I did not re-run one myself: the other session is still on this Postgres (see m-10) |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no diff** — the committed file is current |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `anon` / `PUBLIC` privileges on every W3 table and function | **none** (measured across all three new tables and all fifteen new functions) |
| `authenticated` EXECUTE on `sweep_compliance_expiries()` | `f` — service_role only |
| every W3 SECURITY DEFINER pins `search_path` | yes, all 13; the only unpinned one is `resolve_merged_contact`, which is INVOKER (m-3) |
| cross-tenant sweep as a genuine outsider (`cf100000-…-0001`) | 0 households, 0 merges, 0 notices, 0 Directory rows of the seeded studio; `set_household_threshold` / `add_household_member` → `household_not_found`; `archive_studio_contact` → `studio_contact_not_found`; `sweep_compliance_expiries` → permission denied; `resolve_merged_contact` → NULL |
| R-AY | grep over all six files: **no consent write anywhere**; the only consent references are `people_directory`'s record-reading legs carried verbatim from 00626 (`00629:1905-1906`, `:1975`, `:2046`, `:2184`) and one COMMENT. No W3 file reads a frozen `project_parties.sms_consent_*` column |

### 0b. Prior findings (`w3-fix-log-r5.md`) — five FIXED, ten MINORs still open

| Prior | State | Evidence |
|---|---|---|
| r5 B-1 (typed facts dropped) | **fixed** | `00629:1210-1230`. Measured (`pH.sql`): after folding the typed card into PR-o's older pre-pick the survivor reads `studio_verdict`, `remit_to`, `retainage_bps 1000`, `tax_id_last4 4417`, `legal_name`, `trades {framing}`, `specialties {millwork}`, `notes`, `company_kind sub`. **But see M-4 — two columns of the same class are still not carried** |
| r5 M-1 (household figure drift) | **fixed** | `00632:486-567` `set_household_threshold()`; `use-households.ts:397-430` calls the RPC and invalidates `partyAuthorityKeys.all` / `peopleSeatKeys.all` / `peopleKeys.all` |
| r5 M-2 (rule subsumption) | **fixed** | `00629:1066-1080`. Measured: survivor forbidding all four + absorbed also routing → `merge_contact_rule_conflict`. **But the refusal now has no exit in one shape — see M-1** |
| r5 M-3 (corrected expiry never re-announced) | **fixed** | `00630:193-194` + `:284-288`. Measured: sweep → 1 notice; date to `+400` and back to `+5`; sweep → **1** notice; sweep again → 0 |
| r5 M-4 (merge onto an archived survivor) | **fixed** | `00629:978-982`. Measured: `merge_survivor_archived` |
| r5 `m-1 … m-10` | **all ten still open**, each re-measured below |

Also re-verified green by measurement: the FK census into `studio_contacts` is 20 columns and
`merge_studio_contacts()` reaches every one of them (or documents the freeze —
`studio_trade_agreements.contact_id` on a sent agreement); a merged card leaves **0** rows behind
on any of them; channel `value` is normalised at write time, so two cards carrying the same number
in two raw formats (`+16125551234` / `(612) 555-1234`) dedupe correctly and the merge stands;
`assert_merged_into_write()` holds the pointer against every caller; `studio_contact_merges` grants
`authenticated` SELECT only and carries no INSERT/UPDATE/DELETE policy; `studio_compliance_notices`
the same; 00633 is purely additive and `project_tasks.owner` is correctly untouched; 00628 stamps
nothing where the designer holds zero or several active design-studio memberships (5 studio-less
projects of 8, **0 carrying seats**); money is integer cents with `>= 0` CHECKs; every vocabulary is
a named CHECK, not an enum; the cron body is schema-qualified and its unschedule is `EXISTS`-guarded;
the sweep takes `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation and notifies
**owners and admins only** (measured: 2 notifications in a studio holding 1 owner + 1 admin).

---

# BLOCKING

## B-1 · A merge DELETES the absorbed card's duplicate channel row, destroying a recorded refusal — and the room then prints a refused address as open

`00629:1083-1089` opens the channel union with a blind DELETE:

```sql
DELETE FROM public.studio_contact_channels m
 WHERE m.owner_id = p_merged
   AND EXISTS (SELECT 1 FROM public.studio_contact_channels s
                WHERE s.owner_id     = p_survivor
                  AND s.channel_kind = m.channel_kind
                  AND s.value        = m.value);
```

"Exact duplicates by kind + value" is true of the `value` and of nothing else on that row.
`studio_contact_channels` also carries **`status`, `status_at`, `verified`, `verified_at`,
`preferred` and `label`**, all of them typed by the studio through the room's own act
(`reach-access.tsx:500-525`, `actionKey="save-channel-status"`), and all six are destroyed.

This fires on **the commonest merge there is**: crm-model §4 rules 2 and 3 match on a shared phone
or a shared email, and direction §3.1's duplicate band is literally "These two cards share a
phone." Both cards therefore carry a channel row with the same `(kind, value)` by construction, and
PR-o pre-picks the **older** card — the one that predates the studio marking the address held.

**Measured** (`/tmp/claude/w3r6/pF.sql`, fresh seeded database, rolled back):

```
H pre   88880000-…-0001  email dana@example.invalid  active        (no date)  verified f  preferred f  label (null)
        88880000-…-0002  email dana@example.invalid  unsubscribed  2025-12-03 verified t  preferred t  label 'Shop address'

MERGE (older survives, PR-o's default) -> 88880000-…-0001

H post  email dana@example.invalid  active  (no date)  verified f  preferred f  label (null)
H rows left on the folded card: 0        <- the row is DELETED, not stranded
```

**The face then lies.** `reach-access.tsx:178-193` `heldChannelReason()` printed
**"They unsubscribed, 3 December 2025. Calls still reach them."** with direction §5.4's held
treatment (`--rail` ground, a 2px terracotta leading rule, `isContactChannelHeld()`
`use-studio-contacts.ts:741-743`). After the merge that clause is gone, `held` is false, and the
Reach region offers the address as live. `channelRowParts()` (`reach-access.tsx:196+`) also stops
printing "preferred" and "verified 1 Nov 2025".

This is worse than r5 B-1, which the fix log rated blocking: there the facts at least survived on an
unreachable card. Here the row is **gone from the database**, so nothing can be recovered, nothing
disagrees with the room, and `studio_contact_merges` records only that a merge happened. It is the
same class of harm r5 M-2 was written to close one table over — "a recorded refusal may not vanish
in a merge" — landing on the one refusal the email rail will read in P3.

**Fix**, in order of preference: (a) reduce worst-first onto the surviving row before deleting —
a non-`active` `status` wins (with its `status_at`), `verified` / `preferred` win when true, `label`
COALESCEs — exactly the posture `compliance_state()` and `identity_paper_state()` already take for
paper; (b) or refuse by name (`merge_channel_status_conflict`) when the absorbed row carries a held
status the survivor's row does not, the shape `merge_contact_rule_conflict` already ships; (c) at
minimum put the two rows' statuses side by side in the sheet's comparison table before the press.

---

# MAJOR

## M-1 · A duplicate pair where either card's rule routes at the other can never be merged: the act aborts with `rule_route_is_self`, and the repair the refusal asks for is itself refused

`assert_studio_contact_rule_route()` raises `rule_route_is_self` when
`route_to_person_id = subject_id` ("write themselves instead is not a route"), and its trigger fires
on `UPDATE OF route_to_person_id, subject_id, subject_type`. `merge_studio_contacts()` writes both
of those columns, in two statements, with no awareness of the other:

* `00629:1277-1284` repoints the absorbed card's rule onto the survivor (`subject_id = p_survivor`),
* `00629:1289-1292` repoints every rule that routes **at** the merged card onto the survivor.

"This card is the old one — write the other one instead" is the single most natural thing a studio
records about a duplicate it has not yet merged, and R-BL/PR-e make a routed rule a first-class
recorded fact. Both directions abort.

**Measured** (`/tmp/claude/w3r6/pA.sql`, `pB.sql`, fresh database, rolled back):

```
A  absorbed card's rule routes at the SURVIVOR, survivor has no rule
   merge -> ABORTED: rule_route_is_self  (P0001)

C  SURVIVOR's rule routes at the absorbed card, absorbed has no rule
   merge -> ABORTED: rule_route_is_self  (P0001)

B  control: absorbed card's rule routes at a THIRD person ("Do not contact. Write Rosa.")
   merge -> ok; survivor's rule reads
            "Never text. Do not use: email, mobile, office. Write B Rosa instead."
```

And the third shape is a closed loop:

```
D  absorbed routes at the survivor AND the survivor has its own rule
   merge  -> refused merge_contact_rule_conflict
             ("Settle one rule on the card you are keeping, then merge.")
   repair -> the studio does exactly that: copy the route onto the survivor
             UPDATE studio_contact_rules SET route_to_person_id = <survivor>
               WHERE subject_id = <survivor>
          -> refused rule_route_is_self
```

So on D the room refuses the merge, names a repair, and the database refuses the repair. The pair
cannot be merged by any act available in the room. On A and C the studio presses "Merge" on the
sheet and gets a raw schema token naming nothing she did — the same failure mode r2 B2-2 was raised
and fixed for (`compliance_successor_already_superseded` aborting a firm merge), reached through a
different trigger.

**Fix**: in both repoint statements, drop the route rather than write a self-route — a route at the
card you are folding in IS satisfied by the fold, which is the whole point of the merge. Concretely:
before `00629:1277`, `UPDATE … SET route_to_person_id = NULL WHERE subject_id = p_merged AND
route_to_person_id = p_survivor`, and at `00629:1289-1292` add `AND subject_id <> p_survivor`
(deleting or nulling the survivor's own self-route instead). The subsumption gate at `:1071-1073`
should then treat "the absorbed rule routes at the survivor" as subsumed, not as a conflict.

## M-2 · The person-merge affiliation collision DELETE destroys the absorbed card's role at the firm, and the company card's crew line stops saying it

`00629:1242-1248` deletes the absorbed card's **open** affiliation whenever the survivor already
holds an open one for the same firm, then repoints the rest. `studio_person_affiliations` carries
`role_at_firm`, `is_paperwork_contact`, `is_signer`, `holds_trade_license` and `from_date`, and all
five are the crew line's own words — `company-card.tsx:186-201` builds
"Foreman · paperwork contact · signer · holds the trade licence" out of exactly those booleans, and
`person-profile.tsx:348-354` prints "Foreman, since 2019" from `from_date`.

PR-o pre-picks the older card, which is the one that usually carries the *blank* affiliation.

**Measured** (`/tmp/claude/w3r6/pG.sql`):

```
I pre   70000000-…-0001 (older)  role (null)  signer f  licence f  from_date 2024-01-01
        70000000-…-0002 (newer)  role Foreman signer t  licence t  from_date 2019-03-01

MERGE (older survives)

I post  70000000-…-0001  role (null)  paperwork f  signer f  licence f  from_date 2024-01-01
        rows for that firm: 1        <- the typed affiliation is DELETED
```

The crew line loses four words and the person card's "since 2019" becomes "since 2024" — a date the
studio never typed. Same class as B-1: a collision DELETE that treats a row as a duplicate key when
it is a duplicate key **plus five typed facts**.

**Fix**: merge the two rows before deleting — `role_at_firm` COALESCE, the three booleans OR'd,
`from_date` `LEAST()` — then delete the absorbed row.

## M-3 · The sole-proprietor fold deletes every affiliation naming the folded firm, including other people's, and blanks their firm pointer

`00629:1239-1240`, in the `v_cross` branch:

```sql
DELETE FROM public.studio_person_affiliations WHERE company_id = p_merged;
UPDATE public.studio_contacts SET company_id = NULL WHERE company_id = p_merged;
```

The comment above it justifies only the **self**-affiliation ("an affiliation of a person at
themselves is what `studio_person_affiliations_distinct_cards_check` already refuses"). The
statement is unconditional, so every *other* carded human affiliated with that firm loses the
affiliation and their legacy pointer in the same breath.

**Measured** (`/tmp/claude/w3r6/pG.sql`):

```
J pre   J Bookkeeper  company_id = 60000000-…-0009 ("J Firm", role Bookkeeper since 2021)
MERGE   J Firm (company) folded into J Owner (person, is_sole_proprietor)
J post  J Bookkeeper  company_id = (null)
        affiliations naming that firm: 0
```

J Bookkeeper's Directory row loses "J Firm" — `00629:2152-2156`'s `company_name` COALESCE now
misses, so direction §1 line 2 / SPEC §5.1 #8's "Northgate Electric · electrical" degrades to the
bare kind word — and the survivor's card, being a person, prints no crew line to put them back on.
This is the exact regression QA-1 (w2 r5) was raised to fix, reached by a different door.

**Fix**: scope the DELETE to the fold itself — `WHERE company_id = p_merged AND person_id =
p_survivor` — and repoint or close the remainder deliberately (a sole proprietor who really has
crew is a fact the studio recorded; either carry the affiliations onto… nothing a person card can
hold, so close them with `to_date = CURRENT_DATE` rather than erasing them, or refuse the fold by
name while the firm still carries another person's open affiliation).

## M-4 · `is_sole_proprietor` and `vendor_id` are the two typed facts the r5 B-1 fix still does not carry, and the first one is a printed line and a whole region on the person card

`00629:1210-1230` carries eleven scalars and two arrays. `studio_contacts` has 34 columns; of the
non-identity, non-timestamp ones, exactly two are left behind:

* **`is_sole_proprietor`** — `person-profile.tsx:381` reads it as `soleProprietor`, which prints the
  literal line **"Sole proprietor"** (`:423-427`), selects which documents the card shows
  (`:385-387`, `docs = soleProprietor ? [...own, ...firm's] : own`) and gates the whole **Paper**
  region (`:577-579`, `data-person-paper`). F-11 Dana Kowalski is the fixture's sole proprietor.
* **`vendor_id`** — `people-derivation.ts:1221` `directoryBandOf()` falls back to the **makers**
  band on it, so an identity can change chip.

**Measured** (`/tmp/claude/w3r6/pC.sql`):

```
E pre   E Newer  is_sole_proprietor t  vendor_id 11111111-…-1104
        E Older  is_sole_proprietor f  vendor_id (null)
MERGE (older survives, PR-o's default)
E post survivor  is_sole_proprietor f  vendor_id (null)
```

Neither is identity-bearing and neither can conflict destructively, so both belong in r5 B-1's own
list. `is_sole_proprietor` is NOT NULL, so it takes the `trades`/`specialties` treatment
(`s.is_sole_proprietor OR v_merged.is_sole_proprietor`) rather than a COALESCE; `vendor_id`
COALESCEs like the rest. The announcer at `compare-merge-sheet.tsx:274` says the survivor "carries
what <merged> held", and of these two it does not.

---

# MINOR

## m-1 · `people_directory`'s view COMMENT is still stale (r4 m-1, r5 m-1 — unfixed)
Measured: `obj_description('public.people_directory')` still opens "R57 / People Room roster
(client|lead|maker|…" and `ILIKE '%merged%'` is **false**. `00629:1668` uses `CREATE OR REPLACE
VIEW`, which preserves the comment, and the file never re-states it — so the one durable description
of the room's central view mentions neither `merged_into` nor the TEAM tenant leg this wave added.

## m-2 · `00630`'s justification for its `merged_into IS NULL` leg is still the rule r3 overturned (r4 m-2, r5 m-2 — unfixed)
`00630:362-364` still argues the leg is needed because "merge_studio_contacts() leaves an absorbed
document on the absorbed card wherever the survivor holds no successor to retire it … correctly".
`00629:1377-1383` moves **every** absorbed head. The leg is still worth keeping (rows past the
depth-16 cap, pre-00629 pointers); the reason on the file is wrong.

## m-3 · `resolve_merged_contact()` still pins no `search_path` (r4 m-3, r5 m-3 — unfixed)
`00629:345-362`; measured `proconfig = (none)`, against `search_path=public` on all thirteen of its
W3 siblings. INVOKER and fully schema-qualified, so no live exploit — a consistency gap in a
function called from inside a SECURITY DEFINER body (`rolodex_card_for_party_phone()` `00629:510`).

## m-4 · Both depth caps still strand rows silently rather than refusing (r4 m-4, r5 m-4 — unfixed)
`00629:1390`, `00629:1441` (`FOR i IN 1..16`) and `00629:359` (`h.depth < 16`). A supersede chain
deeper than sixteen leaves its tail on the absorbed card, where 00630's sweep, all three pickers and
`people_directory` skip it. Cheap fix: RAISE when the loop exits at 16 with rows still matching.

## m-5 · The sweep's possessive still reads "…'s paper has lapsed" on a name ending in s (r4 m-5, r5 m-5 — unfixed)
`00630:391-392`. Measured this round: `subject = "Retired Firm R6's paper lapses soon"`; on the
seeded book it reads "Ostrom Builders's paper has lapsed". SPEC §7 / §5.7 #8 hold notification copy
to the room's voice, and a notification is a face.

## m-6 · `client_households_studio_delete` still drops the co-member leg its three siblings carry (r4 m-7, r5 m-6 — unfixed)
`00632:259-266` gates DELETE on `is_active_studio_member(organization_id) AND
is_org_admin_or_owner(organization_id)` while SELECT/INSERT/UPDATE all carry
`is_studio_comember(designer_id)` beside the tenant leg. Defensible; the file's §RLS banner
(`00632:27-37`) still does not mention the asymmetry.

## m-7 · The sweep still announces an ARCHIVED holder's paper, with a deep link to the archived card (r5 m-7 — unfixed)
`00630:356-371` filters `merged_into IS NULL` and nothing else. **Measured** (`/tmp/claude/w3r6/pC.sql`):
an archived firm carrying a COI five days out produced
`subject = "Retired Firm R6's paper lapses soon"`, `deep_link = /people?firm=ffff0000-…-0001`, to
**both** owner and admin. `directory-view.tsx` reads the rolodex with `includeArchived: false`, so the
link lands on a card the room does not list. PR-h's "a date with no gate changes nothing" is the
same argument one step over.

## m-8 · The merge sheet still says the folded card's rule "stays on the folded card as a record", and no surface opens a folded card (r5 m-8 — unfixed)
`compare-merge-sheet.tsx:113`. True of the table, false of the room: `?person=`/`?firm=` resolve
forward (`people-room.tsx:130`), `useStudioContacts` filters `merged_into`, and `people_directory`
emits no row.

## m-9 · The compliance notification still abbreviates the month where the room spells it out (r5 m-9 — unfixed)
`00630:421` / `00630:425` use `to_char(expires_on, 'FMDD Mon YYYY')` — "lapsed 31 Mar 2026". R-Q
("Written consent, 2 May 2025, …") and R-R ("Quoted 2 October 2026.") both spell the month, and
`formatLongDate` does the same on every face this notification links to.

## m-10 · Sweep residue on the shared local Postgres, again (r4 m-8, r5 m-10 — recurred)
Another session reset this database at the start of this review (I watched `schema_migrations` go
`00463` → `20260910152111`) and has since committed a sweep: at close the database carries **3**
`studio_compliance_notices`, `notification_log` rows of type `compliance_document_expiry` and
`job_runs` rows that are not mine. Not W3's product; flagged because the next reviewer's baseline is
not clean and because a committed `studio_compliance_notices` row silently changes what a later
sweep probe measures.

## m-11 · One legacy studio-less job freezes a whole household's figure
`00632:534-541`: `set_household_threshold()` loops every open `money` grant the household sourced
and raises `household_grant_project_has_no_studio` if **any** of those seats sits on a project that
records no studio — aborting the whole act, including the change to the figure itself. R-BD's legacy
population is 5 of 8 projects locally and unmeasured on Strata. Reachable only if a project's
`studio_id` is cleared after the grant was written (`add_household_member()` refuses to write one
otherwise), so it is narrow — but the refusal names a job the studio is not being told the identity
of.

## m-12 · A notice row is written even when nobody is told, and the key then silences it forever
`00630:377-387` inserts the `studio_compliance_notices` row and counts it, then `:432-464` inserts
one `notification_log` row **per active owner/admin**. A studio whose only active members are plain
members gets `notices: 1, notified: 0`, and the `(document_id, state, expires_on)` key means that
document's `lapsed` sentence is never announced again. The notice table's own COMMENT calls itself
"what the studio has ALREADY been told". Fix: write the notice row only where at least one
notification landed, or notify the whole studio when it holds no owner/admin.

## m-13 · A merge of a card seated on a legacy studio-less job aborts on W1b's own guards
`00629:1471` (`studio_contact_id`) fires `assert_project_party_cards_trg`, which raises
`party_card_project_has_no_studio` while `project_recorded_studio()` is NULL; `00629:1507`
(`bid_quoted_by_person_id`) fires `assert_party_bid_quoted_by_trg`, which raises
`party_bid_quoted_by_project_has_no_studio` on the same condition. Both are BEFORE UPDATE OF the
exact columns the merge writes (measured trigger definitions). Not reachable locally — 0 of the 5
studio-less projects carries a seat — and 00628 is the repair, but on Strata the order matters:
00628 runs first in the same push, and any project it leaves NULL (ambiguous designer) whose seats
predate 00624 will abort a merge with a schema token. Worth one line in the W7 preflight beside
R-BD's own count.

## m-14 · `00629:1206-1209` says `company_kind` "is carried unconditionally"; the code COALESCEs it
`00629:1217` is `company_kind = COALESCE(s.company_kind, v_merged.company_kind)` — the survivor's own
value wins, like every other scalar in the statement. The comment means "not gated on entity kind",
but reads as "overwrite".

---

## Checked and clean

* **The merge is one transaction and cannot orphan a channel, a document, a seat, a designation, a
  household or an agreement token.** FK census: 20 columns reference `studio_contacts`; every one is
  repointed, and the only unrepointed case is `studio_trade_agreements.contact_id` on a **sent**
  agreement, which 00579's own guard freezes and which resolves forward. Measured: 0 rows naming the
  folded card afterwards. (What the merge *does* lose is not orphaning — it is the three DELETEs of
  B-1, M-2 and M-3.)
* **`merged_into` is unforgeable and the lineage is append-only.** `assert_merged_into_write()` with
  the transaction-local GUC door, plus the policy split; `authenticated` holds SELECT only on
  `studio_contact_merges` and no INSERT/UPDATE/DELETE policy exists.
* **No company into a person** except crm-model §4's sole-proprietor exception, stated twice
  (`00629:916-927`, `00629:183-191`) so service_role and a repair script are held to it too.
* **Channel-value normalisation is at write time**, so the dedupe DELETE's `value` equality is exact:
  measured, `+16125551234` and `(612) 555-1234` are both stored normalised and the merge stands with
  one surviving row.
* **The sweep** is idempotent, locked, schema-qualified, cron-guarded, writes one `job_runs` row per
  invocation, swallows its own exception without re-RAISE, is service_role-only, and notifies
  owners and admins of the **holding** studio only. r5 M-3's two halves both measured working.
* **Households RLS** carries the tenant leg beside `is_studio_comember(designer_id)` on all four
  policies, PR-n's owner/admin gate on the figure in the policy WITH CHECK *and* in
  `assert_household_threshold_principal()` (which is the one that sees OLD), and owner/admin on
  DELETE. An outsider reads 0 rows and is refused both RPCs by name.
* **PR-c's split holds**: the `client_rep` seat gets the `money` grant, the plain `client` seat none;
  `set_household_threshold()` moves only grants the household is the stated source of and closes them
  with `effective_to` rather than mirroring a NULL threshold.
* **The bid guards bite by name** and all three bid CHECKs hold; `bid_selected_at` / `bid_due_at` /
  `bid_valid_until` are correctly left unbackfilled.
* **00628** is idempotent on `studio_id IS NULL`, fires rather than bypasses `set_project_studio_id()`,
  and stamps nothing ambiguous (measured: 5 studio-less of 8, 0 carrying seats).
* **`project_consent_org()`** is correct as shipped and the reasoning is on the file (`00628:56-85`):
  its twelve callers are all the consent ledger's key, and grafting them onto the caller-relative
  `project_tenant_org()` would make one number read two verdicts. R-BD's retirement is scoped to
  guards and reducers, and W1b finished that half.
* **R-AY holds throughout** — no W3 file reads or writes a consent table, `record_channel_consent()`,
  or a frozen `project_parties.sms_consent_*` column.
* **00633** is purely additive; every live row stays valid; `project_tasks.owner` correctly untouched.
* **Generated types and `00-legacy-grants.sql` are both current** — both regenerated with no diff.
