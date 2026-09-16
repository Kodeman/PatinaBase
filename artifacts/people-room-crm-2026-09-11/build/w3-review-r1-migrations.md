# W3 (P2) — adversarial migration review, round 1

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched.**

Read in full: `build/w3-data-report.md`; migrations `00628`–`00633`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `rulings.md`;
`synthesis/direction.md` §3.1, §3.4, §5, §7, §8, §9; `synthesis/crm-model.md` §4 and
CRM-24; `specimens/SPEC.md` §5.4, §5.7; `build/w1a-report.md`, `w1b-report.md`,
`w2a/w2b/w2c-report.md`, `w2-review-r15-qa.md`, `briefing/fixture.md` §4; plus the live
bodies of `link_party_to_rolodex_card()`, `rolodex_card_for_party_phone()`,
`assert_project_party_cards()`, `set_project_studio_id()`, `project_tenant_org()`.

**Verdict: NOT clean — 2 blocking, 7 major, 10 minor.**

---

## 0. Gates I re-ran myself (not taken from the report)

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + all seeds) | **clean**; 00628–00633 all in `schema_migrations`; `cron.job` carries `compliance-document-expiry-sweep` `0 6 * * *` → `SELECT public.sweep_compliance_expiries();` |
| `w1a_identity_channels_consent_test.sql` on the fresh DB | rc=0, "All W1a assertions passed." |
| `w1b_compliance_authority_directory_test.sql` on the fresh DB | rc=0, "All W1b assertions passed." |
| `w3_merge_sweep_household_test.sql` on the fresh DB | rc=0, "W3 SQL suite: all blocks passed" |
| `python3 scripts/generate-legacy-grants.py` re-run | byte-identical — already regenerated |
| Live grants on the three new tables | exactly as the report claims (`studio_compliance_notices` = SELECT only for `authenticated`; no INSERT/UPDATE/DELETE) |
| `sweep_compliance_expiries()` run twice in a rolled-back txn | run 1 `{"notices":3,"scanned":3,"notified":6}`, run 2 `{"notices":0,...}` — idempotent; `job_runs` row `succeeded`; recipients owner/admin only |
| Cross-kind merge refusals | person→firm refused `merge_kind_mismatch`; firm→sole-prop person succeeds, channels and documents rewritten to `person`; non-member refused `merge_not_a_member` |
| 00628's UPDATE replayed with `set_project_studio_id` **enabled** | stamps correctly (the suite disables the trigger, so this path was untested — I verified it) |
| `client_decisions_court_check` name | matches 00281:166-169; the widening really does replace the narrow constraint |
| `notification_log.type` | plain `text`, no CHECK — `'compliance_document_expiry'` is admissible; `status='delivered'` and `channel='in_app'` are valid enum labels |

The report's own numbers check out. The findings below are things the report does not
name.

---

## BLOCKING

### B-1 · Merging two firm cards flips the survivor's paper word to `lapsed`

`00629:431-435`

```sql
UPDATE public.studio_compliance_documents
   SET holder_id   = p_survivor,
       holder_type = v_survivor.entity_kind
 WHERE holder_id = p_merged;
```

`crm-model.md` §4, "Company acquired or renamed", states the opposite rule in terms:

> "On acquisition, the surviving card absorbs the other, **documents of the absorbed
> firm keep their original holder id and are marked superseded**, never deleted."

The migration moves `holder_id` and marks nothing. `superseded_by` stays NULL, so
`compliance_document_state()` reads the absorbed paper as live, and
`compliance_state()` reduces worst-first over the survivor's holder.

Reproduced (rolled back, local):

```
BEFORE: survivor paper word | current      (its own coi_gl expires CURRENT_DATE + 300)
merge_studio_contacts(survivor, absorbed, 'company_name')
AFTER  merge: survivor paper word | lapsed
absorbed doc | holder_id -> survivor | superseded_by NULL | doc_state lapsed
```

What lands on a face: the Directory firm row's paper column, the roster row's held
clause with the 2px `--terracotta-ink` leading rule (PR-h, R-S, SPEC §5.4 #7) and the
company card all print **Lapsed** for a firm whose own COI is current for another ten
months — and 00630's nightly sweep then writes "…'s paper has lapsed" to every owner and
admin of the studio. A wrong fact on a face, on a gate that holds site access and draws.

Fix: in the merge, set `superseded_by` on each absorbed document to the survivor's
in-force document of the same `doc_type` where one exists, and otherwise leave
`holder_id` where crm-model puts it; either way a merge must not manufacture a block the
survivor never earned. Whatever shape is chosen, the survivor's paper word before and
after a merge belongs in the SQL suite (block 1 asserts none of this today).

---

### B-2 · After a merge, adding a seat on the merged card's number is refused outright

`00629:220-268` (the new `assert_party_card_not_merged_trg`) against the shipped
`rolodex_card_for_party_phone()` / `link_party_to_rolodex_card()`, which 00629 does not
amend.

BEFORE-row triggers on `project_parties` fire in name order:
`apply_party_rolodex_link_trg` → `assert_party_bid_quoted_by_trg` →
`assert_party_card_not_merged_trg` → `assert_project_party_cards_trg`. The first stamps
`studio_contact_id` from the phone; the third refuses a merged card. Neither
`rolodex_card_for_party_phone()` nor `link_rolodex_card_to_parties()` excludes
`merged_into IS NOT NULL`.

Reproduced (rolled back, local): survivor `+19998880001`, merged card `+19998880002`,
merged manually, then the ordinary "Add to the roster" write — `studio_contact_id` left
NULL, exactly as the room writes it:

```sql
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone, created_by)
VALUES ('d0e0…000a','sub','Probe Dupe3','+19998880002','a000…0004');
-- ERROR:  party_card_merged_away
-- HINT:  This rolodex card was merged into 1111…0031. Stamp the seat with the surviving card.
```

The studio supplied no card id. A trigger it cannot see stamped the dead one and another
trigger then rejected the row, and the hint asks the studio to do something the picker
gives it no way to do. The seat cannot be created at all — a hard write failure on the
room's most common act, created by this wave, on any number that was on a merged card.
The same collision reaches `link_rolodex_card_to_parties_trg`: a later edit of a merged
card's phone (even a cosmetic reformat) stamps seats and then fails the card UPDATE.

Fix: add `AND sc.merged_into IS NULL` to `rolodex_card_for_party_phone()`'s match (and
to `link_rolodex_card_to_parties()`'s predicate), so the resolver answers the survivor.
Both belong in 00629, beside the trigger that made them load-bearing.

---

## MAJOR

### M-1 · The canonical shared-phone merge leaves the auto-link permanently ambiguous

`00629` (no write to `studio_contacts.phone_e164`) against
`rolodex_card_for_party_phone()`'s `HAVING count(*) = 1`.

Direction §3.1's duplicate band is worded "These two cards share a phone." — rule 2 of
crm-model §4 is the primary duplicate the room asks the studio to merge. The merge moves
`studio_contact_channels` rows but never touches either card's own `phone_e164` column,
so after the merge **both** rows still carry the number and the "exactly one card" test
still fails.

Reproduced (rolled back, local):

```
BEFORE merge: auto-link is ambiguous (correctly NULL)
AFTER  merge: still ambiguous — matching_cards = 2, card = NULL
INSERT a seat on that number -> studio_contact_id NULL  (seat left UNCARDED)
```

So every new seat on the merged human's number lands on `people_directory`'s party
branch as a second, uncarded identity — the exact over-count the v4 rebuild and the
merge both exist to remove. B-2's fix (`merged_into IS NULL`) closes this one too.

---

### M-2 · The merge does not repoint `project_parties.bid_quoted_by_person_id`

`00631:34-36` adds the column after `00629`; `00629:452-471` repoints only
`studio_contact_id`, `company_id` and `warranty_contact_person_id`.

Reproduced (rolled back, local): a seat whose bid was priced by the duplicate card still
reads `bid_quoted_by_person_id = <merged card>` after the merge, and the next ordinary
save of that bid is refused:

```
seat bid_quoted_by after merge (expect survivor …0001) | 4444…0002   <- the merged card
UPDATE project_parties SET bid_amount_cents = 12345, bid_quoted_by_person_id = bid_quoted_by_person_id …
-- ERROR:  party_bid_quoted_by_merged_away
```

The room's "Who priced it" picker offers live person cards only, so there is no path in
the UI out of the state. The report's own words for 00629 are "Repoints … every seat's
`studio_contact_id` / `company_id` / `warranty_contact_person_id`"; a fourth seat pointer
arrived two files later and nothing went back for it. Fix: repoint it in
`merge_studio_contacts()` (person survivors), and assert it in block 1.

---

### M-3 · The merge bricks a `client_households` row

`00632:56-57` (`member_person_ids uuid[]`, `primary_member_person_id`) and
`00632:118-143` (`assert_client_household_members()`), neither repointed by `00629`.

Reproduced (rolled back, local): a household whose member card is merged away keeps the
dead id, and then every further act on that household is refused — including the room's
own "Add a household member":

```
household members after merge | {4444…0012} | 4444…0012      <- the merged card
add_household_member(household, <the other spouse>, 'client', NULL)
-- ERROR:  household_member_not_a_live_person_card
-- HINT:  … 4444…0012 is not.
-- CONTEXT: UPDATE public.client_households SET member_person_ids = member_person_ids || p_person_id …
```

There is no RPC to remove a member, so the row can only be repaired by hand-written SQL.
PR-c's motivating case is a two-person household whose cards are precisely the ones most
likely to be duplicated (one spouse invited twice). Even without a later edit, the
household prints two names for one human once the survivor is added beside the dead id.
Fix: repoint the array and the primary pointer inside `merge_studio_contacts()`
(de-duplicating when both ids are already members).

---

### M-4 · A plain studio member can erase the household's change-order threshold

`00632:196-201`

```sql
WITH CHECK (
  … AND (co_threshold_cents IS NULL
         OR public.is_org_admin_or_owner(organization_id))
)
```

The clause gates *carrying* a figure, not *changing* one, so `SET co_threshold_cents =
NULL` always satisfies it.

Reproduced (rolled back, local), as a plain `member` of the studio:

```
raise the figure to 999999 -> refused: new row violates row-level security policy   (correct)
set the figure to NULL     -> UPDATE 1                                              (co_threshold_cents now NULL)
```

PR-n puts the money figure with the principal. Erasing it is a money change: the Call
Sheet's household band flips to "No change-order figure is on file for this household."
and `add_household_member()` stops writing the `money` grant entirely. Fix: make the
owner/admin test cover a *change* — `(co_threshold_cents IS NOT DISTINCT FROM
old.co_threshold_cents OR is_org_admin_or_owner(...))` needs a trigger, or narrow the
column to an owner/admin-only RPC the way the grant itself is narrowed.

---

### M-5 · The nightly notice prints a schema word to the principal

`00630:266-275`

```sql
COALESCE(NULLIF(btrim(v_doc.doc_label), ''), v_doc.doc_type) || ' for ' || v_holder || ' lapsed ' …
```

`doc_label` is blank on every seeded paper, so the fallback is the raw column token.
Reproduced against the seeded book (rolled back):

```
subject | Ostrom Builders's paper has lapsed
message | coi_gl for Ostrom Builders lapsed 31 Dec 2025.
link    | /people?firm=d0e20000-0000-0000-0000-000000000021
```

`coi_gl` is a schema word on a face — SPEC §7 and §5.7 #8 forbid exactly this, and every
other sentence in this program is written in the studio's words. The deep link is
correct (`/people?firm=` is handled at `people-room.tsx:203`). Fix: a
`doc_type`→English map in the sweep ("certificate of insurance", "W-9", "licence"),
never the token. (Also `Builders's` — the possessive needs the house rule.)

---

### M-6 · The Bidding band has no column for the dates its acceptance requires

`00631:30-36` mints `bid_due_at`, `bid_outcome`, `bid_valid_until`,
`bid_quoted_by_person_id`, `bid_amount_cents`.

SPEC §5.4 #9 requires, verbatim:

> "Rivera Finishes · paint · **Asked 28 September 2026.** Due 5 October 2026." with stage
> word `No response`

and R-R requires:

> "**Quoted 2 October 2026. Selected 9 October 2026.**"

Direction §8's P2 row is "bid fields and **the Bidding band's dates** and outcomes",
plural. There is no `bid_asked_at`, no `bid_quoted_at`, no `bid_selected_at`, and
`bid_outcome` is a single current word that cannot carry two dated events on one row.
`w3-room-report.md:162` confirms the face: `data-bid-note` reads "Due 5 October 2026.
Holds until 4 November 2026. Priced by Tom Marrow." — no Asked date, no R-R pair.

The W3 report's §10 item 3 discloses that `bid_due_at` and `bid_valid_until` are *empty*;
it does not disclose that the asked / quoted / selected dates have no home at all. Fix:
either mint the dated columns (`bid_asked_at`, `bid_quoted_at`, `bid_selected_at` — the
backfill has real sources for the first two in `trade_rfq_requests.sent_at` /
`responded_at` and `trade_scope_bids.noted_at`), or take a ruling amending SPEC §5.4 #9
and R-R. It cannot stay as it is: the specimen prints a sentence the record cannot make.

---

### M-7 · `people_directory`'s TEAM branch is still gated on `is_studio_comember()` alone

`00629:936-956` (carried verbatim from 00626, itself 00594:1389-1429).

A co-member of the designer of record **through a second studio** reads the working
studio's teammate names, their `job_title`/`staff_role` and the project id. Every other
branch took the tenant leg in W1b; this one did not.

The W3 report §7 names this itself ("Reported for Fable, not changed") and it is
pre-existing, not W3's doing — recording it here at its real severity so the ruling is
made rather than inherited. It is a cross-tenant read of names, on the branch this wave
re-issued.

---

## MINOR

### m-1 · The merge record is forgeable by any studio member
`00629:144-154`. `studio_contact_merges_member_insert` lets any active member INSERT a
row naming any two cards of the studio and any `merged_by` — no merge need have
happened. The table's own COMMENT (`00629:110-116`) calls it "APPEND-ONLY lineage"; the
Compare & merge sheet reads it as history. Either drop the INSERT policy (the RPC is
`SECURITY DEFINER` and does not need it, as the comment already says) or add
`merged_by = auth.uid()` plus an `EXISTS` on `studio_contacts.merged_into = survivor_id`
to the WITH CHECK.

### m-2 · `resolve_merged_contact()` is the one new function with no `SET search_path`
`00629:172-189`. Every other function in the six files pins it. `SECURITY INVOKER`
lowers the stakes and all relations are schema-qualified, but the house rule is uniform.

### m-3 · The SQL suite tests the guards and not the repointing
`w3_merge_sweep_household_test.sql:948-984` asserts `assert_party_bid_quoted_by()`
*refuses* a merged card, and `:728-739` exercises the household member trigger — but
nothing asserts that a merge repoints an existing `bid_quoted_by_person_id` (M-2), that a
household survives a member merge (M-3), that the survivor's paper word is unchanged by a
firm merge (B-1), or that the phone auto-link resolves to the survivor afterwards (B-2,
M-1). All four defects are invisible to a green suite. Block 6 also runs with
`set_project_studio_id` DISABLED, so 00628's real UPDATE path is untested — I verified
separately that it passes.

### m-4 · "No `project_consent_org()` caller remains" is not met, by design
`00628:56-85`. Twelve callers stay. The report's argument is sound and quotes 00624 §1's
COMMENT ("it may gate access and may NEVER resolve a consent record's studio"), and
R-BD's words do scope the retirement to guards and reducers. Recorded so the deviation
from the brief is ruled rather than discovered at deploy.

### m-5 · `bid_amount_cents integer`, and a column the direction did not ask for
`00631:36`. `integer` cents caps a bid at ~$21.47M; the backfill assigns
`trade_scope_bids.amount_cents` straight into it. Direction §7's P2 row lists four bid
columns and not `bid_amount_cents`; the report §3 declares the addition, and
`w3-room-report.md:335` notes nothing writes it. Both worth a line before it ships.

### m-6 · A merge may fold live seats under an ARCHIVED survivor
`00629:336-346` checks `merged_into` on both cards and never `archived_at`. The
Directory then prints the survivor's row with `status_raw = 'archived'` while it carries
the merged card's seats, channels and paper.

### m-7 · A studio with no active owner or admin is "told" and hears nothing
`00630:281-311`. The notice row lands (`v_notices` increments) and the recipient SELECT
returns zero rows, so `studio_compliance_notices` records that the studio was told and
the unique index then guarantees it is never told again.

### m-8 · Possessive copy
`00630:262-265`: `v_holder || '''s paper has lapsed'` gives "Ostrom Builders's paper has
lapsed". Needs the house possessive rule.

### m-9 · Three more pointers at a merged card, outside the report's declared list
`agreement_draw_lien_waivers.contact_id`, `studio_trade_agreements.contact_id` and
`studio_trade_agreement_tokens.contact_id` all FK `studio_contacts(id)` and are not
repointed by `merge_studio_contacts()`. Pre-existing tables, out of this wave's stated
scope — named so the merge's repoint list is complete when someone next opens it.

### m-10 · `add_household_member()` reports a cross-tenant project as a card error
`00632:307-323`. `p_project_id` is never checked against `v_h.organization_id`; the write
is correctly refused, but by `assert_project_party_cards()` with
`party_studio_contact_other_studio` rather than by a household-shaped refusal. No hole —
I verified the guard checks `sc.organization_id = project_recorded_studio(project_id)` —
only a confusing sentence at the seam.

---

## What I checked and found sound

- `merge_studio_contacts()` is one transaction, locks both cards in id order, refuses
  person-into-firm always and firm-into-person except for a declared sole proprietor
  (all three reproduced), and refuses a non-member (`merge_not_a_member`).
- Channel dedupe matches `idx_studio_contact_channels_owner_kind_value` exactly;
  affiliation dedupe matches `idx_studio_person_affiliations_open` exactly. No merge I
  could construct hit a unique violation.
- Consent: no consent table, view or frozen `project_parties.sms_consent_*` column is
  read or written anywhere in 00628–00633. R-AY holds.
- `merged_into` is filtered on the CONTACTS branch only; `people_directory_seats` needs
  no filter because every seat is repointed. `resolve_merged_contact()` terminates on a
  cycle (depth cap 16) and a cycle cannot be created (`merge_survivor_already_merged`).
- Archive/restore restate 00417's shipped owner/admin leg exactly (`00417:224-256`),
  leak no card ids to a non-member, and are idempotent.
- The sweep: advisory xact lock, `job_runs` row per invocation, guarded `cron.unschedule`
  with an unguarded `cron.schedule`, schema-qualified body, one notice per
  `(document, state)`, notification written only where the notice landed, owner/admin
  recipients. All reproduced.
- 00633 is purely additive on the right constraint name, and 00281's survey still holds —
  no court-consuming read model carries a hardcoded pivot.
- 00628 stamps only unambiguous designers, leaves zero-and-several NULL, is idempotent,
  and passes the shipped `set_project_studio_id()` trigger with the trigger enabled.
- Numbering: 00628–00633, above W1's 00627, with 00595–00620 untouched.

---

## Suggested order for round 2

1. B-2 / M-1 — one line in `rolodex_card_for_party_phone()` (and
   `link_rolodex_card_to_parties()`), in 00629.
2. B-1 — the absorbed firm's paper, per crm-model §4.
3. M-2 / M-3 — two more repoints inside `merge_studio_contacts()`.
4. M-4 — the threshold's WITH CHECK.
5. M-5 — the `doc_type` → English map.
6. M-6 — mint the dated bid columns, or take the ruling.
7. m-3 — the four assertions that would have caught B-1, B-2, M-2 and M-3.
