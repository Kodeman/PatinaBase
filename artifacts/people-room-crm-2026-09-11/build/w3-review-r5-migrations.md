# W3 (P2) — adversarial migration review, round 5

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `61d32968a`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Every measurement below was taken in a `BEGIN … ROLLBACK`
probe or on a fresh `pnpm supabase:reset`.

Read in full: `w3-data-report.md`; `00628`, `00629`, `00630`, `00631`, `00632`, `00633`;
`w3_merge_sweep_household_test.sql`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a/w1b/w2a/w2b/w2c` reports;
`w2-review-r15-qa.md`; `fixture.md` §4; `w3-fix-log-r4.md`; `w3-review-r4-migrations.md`.

**Verdict: NOT clean — 1 blocking, 4 major, 10 minor.**

---

## 0. Gates I ran myself

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | rc=0, clean replay, head `20260910152111` (i.e. `00633` applied). The Supabase CLI telemetry write needs `dangerouslyDisableSandbox` — harness, not product |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no diff** — the committed file is current |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `cron.job` | `compliance-document-expiry-sweep` · `0 6 * * *` · `SELECT public.sweep_compliance_expiries();` |
| studio-less projects after replay | 5 of 8, 0 carrying seats — matches `w3-data-report.md` §6 |
| `client_decisions_court_check` | 11 words, strict superset of 00212/00281 |

⚠ **Environment, not product.** The local Postgres was reset **by another session** while this
review was mid-probe (measured: `schema_migrations` momentarily read `00627` with every table
empty, then recovered). That session then ran `sweep_compliance_expiries()` and **committed**: the
database I am leaving behind carries 3 `studio_compliance_notices`, 6
`notification_log` rows of type `compliance_document_expiry` and 2 `job_runs` rows that are not
mine. This is r4's `m-8` recurring. Every probe in this review rolled back
(`studio_contacts.merged_into` count 0, `client_households` count 0 at close).

## 0b. Prior findings (`w3-fix-log-r4.md`) — five FIXED, one PROMOTED

| Prior | State | Evidence |
|---|---|---|
| B-1 the login and the address travel | **fixed** | `00629:1103-1114`. Measured: pre-merge row `reach_state=account`; after merging the newer card into the older, the single surviving row reads `account` + `chidi@example.invalid`. Two different logins → `merge_two_logins` |
| B-2 a blocking rule may not vanish | **fixed** | `00629:1039-1069` + `contact_rule_blocks_contact()` `00629:848-862`. Measured: survivor "Use: email, mobile." + duplicate forbidding all four direct channels → `merge_contact_rule_conflict`. **But see M-2 below — the same defect one notch down is still open** |
| B-3 `resolve_merged_contact()` has a caller | **fixed** | `packages/supabase/src/hooks/use-studio-contacts.ts:1890 useResolvedContactId`; `people-room.tsx:130` is the deep-link resolver |
| M-1 the sole-proprietor fold aborts on renewed paper | **fixed** | `00629:1247-1280`, the cross-kind branch now takes the same-kind branch's ordered shape. Measured **5×** on a three-deep renewed chain: `MERGE OK` every run, all three certificates on the person with `holder_type='person'` and the chain intact |
| M-2 the report told Fable a change was deferred that had shipped | **fixed** | `w3-data-report.md` §7/§10.1 now read "MADE, not owed"; §3 lists all eight bid columns; §10.4 strikes the travel list; `00629:1521-1540` names **two** view deltas |
| M-3 the absorbed firm's agreement links | **fixed** | `00629:1436-1443`. Measured: token → survivor, draft agreement → survivor, **sent** agreement frozen at `state='sent'`, `access_grants_trade_agreement_links()` returns `agreement_link` keyed at the survivor's id, merge does not abort |
| r4 `m-6` (MINOR, "every scalar on the absorbed card is dropped") | **PROMOTED to BLOCKING** — see B-1 below. r4 named it as "a design gap"; measured, it is data loss on merge plus two wrong facts on faces, and r4's own list named two columns (`do_not_contact`, `reach_preference`) that do not exist on `studio_contacts` |
| r4 `m-1`,`m-2`,`m-3`,`m-4`,`m-5`,`m-7` | **all still open** — re-reported below as m-1…m-6, each re-measured |
| r4 `m-8` (sweep residue on the shared DB) | **recurred**, from another session — see the ⚠ above |

Also re-verified green, by measurement: a merge leaves **zero** orphans (channels 0, documents 0,
affiliations 0, agreement tokens 0, seats 0, card pointers 0, rules 0, households 0 naming the
folded card); an outsider reads 0 merges, 0 notices, 0 households, `resolve_merged_contact() → NULL`
and 0 Directory rows; an outsider is refused `merge_not_a_member` / `household_not_found` /
`studio_contact_not_found` / `permission denied for function sweep_compliance_expiries` /
`permission denied for table studio_contact_merges`; a plain member is refused
`studio_contact_merge_pointer_forbidden` and `permission denied for table
studio_compliance_notices`; `assert_party_bid_quoted_by()` refuses a firm card, a merged card,
another studio's card and a studio-less project by name, and all three bid CHECKs bite; the sweep
writes 3 notices / 6 notifications to exactly the owner and admin of the **holding** studio and 0
on every rerun; **no W3 migration reads or writes `studio_channel_consent`,
`record_channel_consent()` or a frozen `project_parties.sms_consent_*` column** (R-AY holds —
grep over all six files returns comments and the record-reading view legs only);
`compliance_document_state()` and `compliance_state()` agree on the depth cap (64), the
`cardinality(blocks) > 0` gate, `>= CURRENT_DATE` and `CURRENT_DATE + 30`; every SECURITY DEFINER
function pins `search_path` (except `resolve_merged_contact`, which is INVOKER — m-3) and carries
`REVOKE ALL FROM PUBLIC, anon`; `anon` holds no grant on any W3 object; `studio_contact_merges` and
`studio_compliance_notices` grant `authenticated` **SELECT only**.

---

# BLOCKING

## B-1 · A merge silently drops eleven typed facts off the absorbed card, and the room announces that it did not

`00629:1103-1114` carries exactly **two** scalars across — `profile_id` and `email` (r4 B-1) —
and nothing else. The absorbed card's own `studio_verdict`, `studio_verdict_at`, `remit_to`,
`retainage_bps`, `tax_id_last4`, `legal_name`, `dba_name`, `w9_on_file_at`, `warranty_until`,
`trades`, `specialties`, `notes` and `company_kind` stay on a card that, after the merge, emits no
`people_directory` row (`00629:2062`), no picker entry (`use-studio-contacts.ts:215` filters
`merged_into`) and no `?person=` / `?firm=` target (`people-room.tsx:130` now resolves those
**forward** — r4 B-3). This is r4 B-1's own reasoning applied to the rest of the row: the data is
not deleted from the table, it is unreachable from the room.

**Measured** (`$TMPDIR/w3r5/pE.sql`, fresh reset, rolled back). Two firm cards for one firm; the
older one blank, the newer one carrying what the studio actually typed. PR-o pre-picks the older
(`compare-merge-sheet.tsx:63-70 preferredSurvivorId`), which is the file's own default:

```
PRE-duplicate  studio_verdict "Good crew. Slow to send paper."
               remit_to       "Ostrom Builders LLC, PO Box 44, Minneapolis MN"
               retainage_bps  1000        legal_name "Ostrom Builders LLC"  dba_name "Ostrom"
               w9_on_file_at  2026-08-15  tax_id_last4 4417
               trades {framing}  specialties {millwork}  company_kind sub
               notes "Ask for Pete, not the office."   warranty_until 2027-09-14

MERGE (older survives, PR-o default) -> eeee…e001

POST-survivor  studio_verdict (null)  remit_to (null)  retainage_bps (null)
               legal_name (null) dba_name (null) w9_on_file_at (null) tax_id_last4 (null)
               trades {} specialties {} notes (null) warranty_until (null) company_kind (null)
DIRECTORY      one row, "Ostrom Builders", every one of those facts blank
```

**Three faces then lie.**

1. `compare-merge-sheet.tsx:274` announces, in the room's own `role="status"` voice:
   `Two cards are now one. ${survivorName} carries everything ${mergedName} held.`
   It did not. It carried two columns of thirteen.
2. `company-card.tsx:922` prints **"No remit-to on file."** over a firm the studio wrote a
   remit-to for — on the Payee region whose own comment (`company-card.tsx:915-918`) calls this
   "the one region direction §1 line 5 makes this card the sole writer of", and whose CR13-6 rule
   is that "a payee the studio never wrote is not a payee". After a merge the studio **did** write
   one and the card denies it. `tax_id_last4` and `retainage_bps` disappear from the same region.
3. `company-card.tsx:1056` prints **"No verdict recorded."** (`NO_VERDICT_SENTENCE`,
   `company-card.tsx:83`) over the studio's own typed verdict.

**The studio cannot know.** The sheet compares nine fields —
`compare-merge-sheet.tsx:229-237`: Name, What they are, Firm, Mobile, Email, Contact rule, Papers
on file, Seats on jobs, In the book since. None of the thirteen is among them, so PR-o's "the
studio knows which card carries the real history" is a choice made blind, and the studio's only
lever (which card survives) is the lever that decides which set is lost.

**Fix** (any one, in this order of preference): (a) COALESCE every scalar onto the survivor exactly
as `profile_id` and `email` already are — none of them is identity-bearing, none can conflict
destructively, and "the survivor's own value wins" is already the rule; (b) or refuse by name where
the absorbed card carries a money fact (`remit_to`, `retainage_bps`, `tax_id_last4`) the survivor
does not, as `merge_contact_rule_conflict` refuses for a rule; (c) at minimum, put these fields in
the sheet's comparison table and stop the announcer saying "carries everything".

---

# MAJOR

## M-1 · A household's change-order figure moves and the seats it authorises do not, so the Call Sheet prints two different money figures at once

`00632:402-411` writes the `money` authority row from `v_h.co_threshold_cents` with
`source_clause = 'client_households.co_threshold_cents'`. Nothing re-writes it.
`useSetHouseholdThreshold` (`packages/supabase/src/hooks/use-households.ts:384-415`) is a bare
`.update({ co_threshold_cents })` on `client_households` — no RPC, no propagation — and the band's
"Set the figure" act (`household-band.tsx:361-380`) is the only writer.

**Measured** (`$TMPDIR/w3r5/pF.sql`):

```
ADD (client_rep) -> seat c218cfcf…
GRANT-1         money | 250000 | client_households.co_threshold_cents
owner raises the household figure to 500000
HOUSEHOLD-after 500000
GRANT-after     money | 250000 | client_households.co_threshold_cents   <- unchanged
```

On one Call Sheet screen the band's `data-household-threshold` line
(`household-band.tsx:310-316`, `householdThresholdSentence`) then reads **"Change orders over
$5,000 need a signature from the household."** while the client_rep's seat line reads **"Signs
money to $2,500."** off `project_party_authority` — and the seat's `source_clause` says that
$2,500 came from the household, which now says $5,000. This is exactly the harm
`household-band.tsx:60-70` already names in its own banner ("two simultaneously-rendered, directly
contradictory facts about the same household on one screen, with no act between them"), on the one
fact PR-n put under the principal.

There is no repair act in the room: `add_household_member()` would upsert the grant
(`00632:407-410` `DO UPDATE`), but the band's member picker is an *add* flow and the member is
already a member.

**Fix**: have the threshold write go through an RPC that also upserts the open `money` row on every
`client_rep` seat of that household's members (PR-n's owner/admin gate is already stated at
`00632:396`), or drop `source_clause` and stop claiming the household is the source.

## M-2 · A merge still drops a recorded channel instruction, and the survivor's clause says the opposite

r4 B-2 closed the **hard-block** case (R-BL: every direct channel forbidden, or a route). The rule
repoint at `00629:1158-1166` is still conditional for everything else, so a rule that forbids
*some* channels is left on the folded card while the survivor's permissive clause stands — and
`contact_rule_summary()` feeds the Directory row, the roster row, the person card and the company
card's crew line (R-S).

**Measured** (`$TMPDIR/w3r5/pG.sql`):

```
survivor rule   allowed {email,mobile}                  "Use email or the mobile."
duplicate rule  forbidden {sms,mobile}                  "Never text. Never ring the mobile."
RESIDUAL merge -> 33330000-…-0001         (permitted, no refusal)
RESIDUAL rule on survivor        "Use: email, mobile."
RESIDUAL rule left behind        {sms,mobile}  "Never text. Never ring the mobile."
RESIDUAL directory rows for the folded card   0
```

The room now affirmatively tells the studio to ring the mobile of a human the studio recorded as
never-ring-the-mobile, and the record that says so is on a card no surface opens. R-BL rules what
earns a terracotta leading rule; it does not rule that a one-channel refusal may be dropped.
F-27 Ray Thao ("never text; email and phone open") and F-11 Dana Kowalski ("text only, the email is
dead") are exactly the fixture rows this reaches.

**Fix**: widen the r4 refusal from `contact_rule_blocks_contact()` to "the absorbed card carries a
rule the survivor's rule does not subsume" (`channels_forbidden` not `<@` the survivor's, or a
route the survivor has not), so the studio settles it on the card it is keeping — the same shape
and the same sentence r4 already ships.

## M-3 · A corrected expiry date is never announced again, so the studio loses the warning the file exists to give

`00630:141-142`'s `UNIQUE (document_id, state)` is described as the idempotency rule, and
`00630:263-272` skips the notification wherever the notice row did not land. Neither is ever
cleared. `studio_compliance_documents.expires_on` is freely editable by any active studio member
(`studio_compliance_documents_member_update`, USING/WITH CHECK `is_active_studio_member(
organization_id)`), so the ordinary act of correcting a mistyped date — or extending the same row
instead of recording a renewal — permanently spends that document's notice.

**Measured** (`$TMPDIR/w3r5/pJ.sql`):

```
sweep            -> notice (doc,'lapses_soon') written, owner + admin notified
expires_on moved to CURRENT_DATE + 400   -> compliance_document_state = current
expires_on moved back to CURRENT_DATE + 5 -> compliance_document_state = lapses_soon
sweep again      -> {"notices": 0, "notified": 0}      <- the studio is told nothing
```

Direction §8 P2's promise is "a lapse announces itself before it blocks a draw". For any document
whose date has ever been edited across the boundary, it does not.

**Fix**: key the notice on the state *and* the date it was about (`UNIQUE (document_id, state,
expires_on)`), or delete a document's notices in a trigger on `UPDATE OF expires_on`.

## M-4 · A merge into an ARCHIVED card is permitted and unwarned, and takes the whole identity out of the rolodex with it

`merge_studio_contacts()` reads `archived_at` nowhere (`00629:929-1500`). The Directory does not
hide archived cards either: `people_directory`'s CONTACTS branch emits them with
`status_raw='archived'` (`00629:1966`), `directoryIdentityRows()`
(`people-derivation.ts:892-914`) does not filter them, and `directoryChipAdmits()` returns true for
every row under `everyone`. `directoryDuplicatePairs()` (`people-derivation.ts`, the phone-bucket
loop) admits any two `role === 'contact'` rows sharing ten digits, archived or not — and
`preferredSurvivorId()` pre-picks the **older** card, which is the one a studio archives.

**Measured** (`$TMPDIR/w3r5/pA.sql`):

```
A1 merge into ARCHIVED survivor =>  aaaa…a001     (no refusal)
A2 survivor archived_at = t, merged_into IS NULL
A3 directory rows for the pair: one row, "Arch Survivor", status_raw = archived
```

Every channel, document, seat, designation, agreement token and (r4 B-1) the login now sit on an
archived card. `directory-view.tsx:173-175` reads the rolodex as
`useStudioContacts(rolodexOrgId, { includeArchived: false })` for "a firm's signer (its payee
marker) and a person's own email/office phone for a routed rule clause", so both of those silently
stop resolving for the merged identity. Recoverable by `restore_studio_contact()`, but nothing on
the sheet says the card the studio is keeping is archived — the column head reads only
"Keeps the card" / "Keep this one instead" (`compare-merge-sheet.tsx:305-320`).

**Fix**: refuse by name when the chosen survivor carries `archived_at` (the studio restores it
first, one act), or mark the archived column on the sheet and restore the survivor inside the RPC.

---

# MINOR

## m-1 · `people_directory`'s view COMMENT is still stale (r4 m-1, unfixed)
`00629:1521` uses `CREATE OR REPLACE VIEW`, which preserves the existing comment, and the file
never re-states it. Measured: `obj_description('public.people_directory')` still opens
"R57 / People Room roster (client|lead|maker|…" and `ILIKE '%merged%'` is **false** — the one
durable description of the room's central view says nothing about `merged_into` or the TEAM tenant
leg. Every prior wave in this program re-issued the comment with the view.

## m-2 · `00630`'s justification for its `merged_into IS NULL` leg is still the rule that was overturned (r4 m-2, unfixed)
`00630:245-256` argues the leg is needed because "merge_studio_contacts() leaves an absorbed
document on the absorbed card wherever the survivor holds no successor to retire it … correctly".
r3 W3-R3-1 reversed exactly that (`00629:1226-1236`: every absorbed head moves). The leg is still
worth keeping — rows past the depth-16 cap, and any pre-00629 pointer — but the reason on the file
is wrong.

## m-3 · `resolve_merged_contact()` still pins no `search_path` (r4 m-3, unfixed)
`00629:345-362`, measured `proconfig = (none)`, while every sibling in this family
(`compliance_document_state()` `00630:64`, `contact_rule_blocks_contact()` `00629:855`) pins it.
Every relation inside is schema-qualified, so there is no live exploit; it is a consistency gap in
a function called from inside a SECURITY DEFINER body (`rolodex_card_for_party_phone()`,
`00629:508`).

## m-4 · Both depth caps still strand rows silently rather than refusing (r4 m-4, unfixed)
`00629:1247` and `00629:1275` (`FOR i IN 1..16`) and `00629:359` (`h.depth < 16`). A supersede
chain deeper than sixteen leaves its tail on the absorbed card, where `00630:257`'s sweep, all
three pickers and `people_directory` skip it — the invisibility r3 W3-R3-1 was written to close,
just past the cap. Cheap fix: `RAISE` when the loop exits at 16 with rows still matching.

## m-5 · The sweep's possessive still reads "Ostrom Builders's paper has lapsed" (r4 m-5, unfixed)
`00630:276-279`. Measured on the seeded book:
`subject = "Ostrom Builders's paper has lapsed"`. SPEC §7 / §5.7 #8 hold notification copy to the
room's own voice, and a notification is a face.

## m-6 · `client_households_studio_delete` still drops the co-member leg its three siblings carry (r4 m-7, unfixed)
`00632:259-266` gates DELETE on `is_active_studio_member(organization_id) AND
is_org_admin_or_owner(organization_id)`, while SELECT/INSERT/UPDATE (`00632:223-257`) all carry
`is_studio_comember(designer_id)` beside the tenant leg. Defensible; the file's own §RLS banner
(`00632:27-37`) does not mention the asymmetry.

## m-7 · The sweep announces an ARCHIVED holder's paper, with a deep link to the archived card
`00630:242-258` filters `merged_into IS NULL` and nothing else. **Measured** (`$TMPDIR/w3r5/pJ.sql`):
an archived firm carrying a COI five days out produced
`subject = "Retired Firm's paper lapses soon"`, `deep_link = /people?firm=6666…0001`, to every
owner and admin. A firm the studio has retired is not a lapse anybody has to act on; PR-h's "a date
with no gate changes nothing" is the same argument one step over.

## m-8 · The merge sheet says the folded card's rule "stays on the folded card as a record", and no surface opens a folded card
`compare-merge-sheet.tsx:113`. True of the table, false of the room: after r4 B-3,
`?person=<old id>` and `?firm=<old id>` both resolve **forward** to the survivor
(`people-room.tsx:130`), `useStudioContacts` filters `merged_into`, and `people_directory` emits no
row. The record exists; nothing can read it. Weaker than r4 B-3 (no door is promised), but the
sentence invites the studio to believe one is there.

## m-9 · The compliance notification abbreviates the month where the room spells it out
`00630:307` / `00630:311` use `to_char(expires_on, 'FMDD Mon YYYY')`. Measured: "lapsed 31 Mar
2026". R-Q ("Written consent, 2 May 2025, on the Lindqvist kitchen.") and R-R ("Quoted 2 October
2026.") both spell the month, and `formatLongDate` does the same on every face this notification
links to.

## m-10 · Sweep residue on the shared local Postgres, again (r4 m-8, recurred)
Not W3's product, and not this review's doing: another session reset this database mid-review and
then committed a sweep. Left behind at close: 3 `studio_compliance_notices`, 6
`notification_log` rows of type `compliance_document_expiry`, 2 `job_runs` rows. Flagged because
the other program shares this Postgres and the next reviewer's baseline is not clean.

---

## Checked and clean

* **The merge is one transaction and cannot orphan a channel, a document or a seat.** Measured on a
  seeded firm plus a synthetic duplicate carrying a channel, a gating COI, a live affiliation, a
  draft agreement, a sent agreement and a live agreement token: after the merge, **0** rows in
  every one of `studio_contact_channels`, `studio_compliance_documents`,
  `studio_person_affiliations`, `studio_trade_agreement_tokens`, `project_parties` (all four card
  pointers), `studio_contacts` (`company_id` and the three designations), `studio_contact_rules`
  and `client_households` still name the folded card. The FK census
  (`pg_constraint`, `confrelid = studio_contacts`, 20 constraints) now has no unrepointed column
  except `studio_trade_agreements.contact_id` on a **sent** agreement, which 00579's own guard
  freezes and which resolves forward. `project_party_authority.copy_to` and
  `project_site_access_cards.told_refs` / `key_holder_engagement_id` are **engagement** ids, not
  card ids, so no merge can strand them.
* **No unique-index collision hides in the repoints.** `idx_studio_person_affiliations_open` is
  partial (`WHERE to_date IS NULL`), which is exactly what the conditional DELETE at `00629:1127`
  clears, so a closed affiliation to the same person on both cards cannot abort a merge;
  `idx_studio_contact_channels_owner_kind_value` is `(owner_id, channel_kind, value)`, matching
  both the dedupe DELETE and the `ON CONFLICT` inference.
* **`merged_into` is unforgeable** and the lineage is append-only: measured refusals as a plain
  member of the owning studio, and `authenticated` holds SELECT only on `studio_contact_merges`.
* **No company into a person** except crm-model §4's sole-proprietor exception, stated twice
  (`00629:916-927`, `00629:183-191`) so service_role and a repair script are held to it too.
* **The sweep** takes `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation, skips
  on contention, swallows its own exception without re-RAISE, is service_role-only, and notifies
  owners and admins of the **holding** studio only. Measured: 3 notices / 6 notifications on the
  seeded book, `{"notices":0,"notified":0}` on every rerun. The cron is guarded by the `EXISTS`
  unschedule, the body is schema-qualified, and the registry COMMENT is the only
  exception-swallowing block.
* **The bid guards bite by name**, all five: `party_bid_quoted_by_not_a_person`,
  `_merged_away`, `_other_studio`, `_project_has_no_studio`, plus the three CHECKs
  (`bid_amount >= 0`, the outcome vocabulary, `bid_valid_until >= bid_due_at`). All eight bid
  columns are read and written by the roster row's bid editor (`roster-row.tsx:374-418`), so no
  column is a promise the room cannot fill.
* **PR-c's split holds**: measured, the `client_rep` seat gets the `money` grant and the plain
  `client` seat gets none.
* **00628** stamps nothing where the designer holds zero or several active design-studio
  memberships (5 of 8 local projects, all ambiguous, 0 carrying seats), is idempotent on
  `studio_id IS NULL`, and fires rather than bypasses `set_project_studio_id()`.
* **`project_consent_org()`** is correct as shipped and the reasoning is on the file
  (`00628:56-85`): its twelve callers are all the consent ledger's key, and grafting them onto the
  caller-relative `project_tenant_org()` would make one number read two verdicts. R-BD's retirement
  is scoped to guards and reducers, and W1b finished that half.
* **R-AY holds throughout** — verified by grep over all six files and by the FK/trigger census: no
  W3 migration reads or writes a consent table, `record_channel_consent()`, or a frozen
  `project_parties.sms_consent_*` column. The only writes the merge makes near consent are channel
  **rows** (addresses), which `channel_consent_status()` then reads the record for.
* **00633** is purely additive; `project_tasks.owner` correctly untouched.
* **Money is integer cents** (`co_threshold_cents`, `bid_amount_cents`), both with `>= 0` CHECKs;
  vocabularies are named CHECK constraints, not enums; all six files carry a banner with LINEAGE
  and are idempotent; the seed's `00-legacy-grants.sql` is current and the generated types do not
  drift.
