# W3 (P2) — adversarial migration review, round 2

Reviewer context: separate from the implementer and from round 1. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `5f264a602`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched.
No server started. No migration edited.**

Read in full: `build/w3-data-report.md`; `build/w3-fix-log-r1.md`;
`build/w3-review-r1-migrations.md`; migrations `00628`–`00633`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `rulings.md` §3;
`synthesis/direction.md` §3.1, §3.4, §5, §7, §8, §9 (PR-i/PR-o/PR-c/PR-h);
`synthesis/crm-model.md` §4 and CRM-24; `specimens/SPEC.md` §5.4, §5.7;
`build/w1a-report.md`, `w1b-report.md`, `w2a/w2b/w2c-report.md`,
`w2-review-r15-qa.md`, `briefing/fixture.md` §4; plus the live bodies of
`assert_compliance_holder()`, `assert_project_party_cards()`,
`project_tenant_org()`, `project_recorded_studio()`,
`select_trade_scope_bid()` (00423:1450-1510), `fc_dispatch_optin_invite()`,
and 00626's own `rolodex_card_for_party_phone()` / `link_rolodex_card_to_parties()`
/ `people_directory` bodies for graft fidelity.

**Verdict: NOT clean — 1 blocking, 3 major, 16 minor.**

---

## 0. Gates I re-ran myself

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + all 30 seed paths) | **clean**, rc=0; 00628–00633 applied in order; head = `20260910152111` over `00633` |
| `cron.job` after reset | `compliance-document-expiry-sweep` · `0 6 * * *` · `SELECT public.sweep_compliance_expiries();` |
| `w1a_identity_channels_consent_test.sql` (fresh DB) | rc=0 — "All W1a assertions passed." |
| `w1b_compliance_authority_directory_test.sql` (fresh DB) | rc=0 — "All W1b assertions passed." |
| `w3_merge_sweep_household_test.sql` (fresh DB) | rc=0 — "W3 SQL suite: all blocks passed" |
| `rls/people_directory_scope_test.sql` (the view this wave re-issued) | rc=0 — all cases (a)–(k) |
| `rls/studio_contacts_test.sql`, `rls/project_roster_test.sql`, `rls/00584_studio_comember_rls_sweep.test.sql` | rc=0 |
| `python3 scripts/generate-legacy-grants.py` re-run | **byte-identical** — already regenerated |
| `SUPABASE_DB_URL=… pnpm db:generate` re-run | **byte-identical** — `database.types.ts` up to date |
| Grants on the three new tables + ten new functions | exactly as `w3-data-report.md` §9 claims; **no `anon` anywhere**; `sweep_compliance_expiries()` refused to `authenticated` (`permission denied for function`) |
| `sweep_compliance_expiries()` on the fresh seed (rolled back) | `{"notices":3,"scanned":3,"notified":6}`; owner+admin only; re-run → `{"notices":0}` |
| Cross-tenant sweep over the three new tables (second-studio co-member) | 0 rows from `client_households`, `studio_contact_merges`, `studio_compliance_notices`; `resolve_merged_contact(foreign card)` → NULL; cross-tenant forge of a merge row refused by RLS |
| Consent (R-AY) | no consent table, view, RPC or frozen `project_parties.sms_consent_*` column is read for a verdict or written anywhere in 00628–00633. `merge_studio_contacts()`'s seat UPDATE does fire `fc_optin_invite_dispatch` but its UPDATE branch short-circuits (`OLD` already complete) — no dispatch, no write |
| Graft fidelity | `rolodex_card_for_party_phone()` = 00626 + exactly one predicate; `link_rolodex_card_to_parties()` = 00626 + one guard + one comment; `people_directory` = 00626 verbatim + the TEAM tenant leg + `sc.merged_into IS NULL` (diffed mechanically) |
| Numbering | 00628–00633, above W1's 00627; 00595–00620 untouched |
| Migration hygiene | all six carry banner + LINEAGE; all idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP … IF EXISTS` / guarded backfills); RLS in the same file as each new table; `REVOKE … FROM PUBLIC, anon` on every new function; every `SECURITY DEFINER` pins `search_path`; `cron.*` schema-qualified; CHECKs not enums; money in integer cents |

### Every round-1 finding, re-checked

| r1 | State | Evidence |
|---|---|---|
| B-1 firm merge flips the survivor to `lapsed` | **FIXED** | survivor firm reads `current` before and after; absorbed lapsed COI moved with `superseded_by` set only because the survivor held a legitimate successor |
| B-2 seat write on a merged card's number refused | **FIXED** | ordinary `INSERT INTO project_parties (… phone …)` with no card named comes back stamped with the survivor |
| M-1 shared-phone merge permanently ambiguous | **FIXED** | `rolodex_card_for_party_phone(project,'+16125557001')` → survivor |
| M-2 `bid_quoted_by_person_id` not repointed | **FIXED** | seat reads the survivor after the merge |
| M-3 member merge bricks a household | **FIXED** | household holding BOTH ids reads `{survivor}`, primary repointed |
| M-4 plain member can erase the threshold | **FIXED** | both directions refused `household_threshold_forbidden`; figure unchanged |
| M-5 notice prints a schema word | **FIXED** | "The certificate of insurance for Ostrom Builders lapsed 31 Dec 2025." |
| M-6 no columns for the Bidding band's dates | **FIXED** (columns) — but see MAJOR-2 for what the backfill puts in them |
| M-7 TEAM branch had no tenant leg | **FIXED** | second-studio co-member reads 0 TEAM rows for the working job; the working-studio admin reads 1 |
| m-1 merge record forgeable | **OPEN** (reproduced) |
| m-2 `resolve_merged_contact()` unpinned `search_path` | **OPEN** |
| m-3 suite tests guards not repointing | **PARTLY CLOSED** — block 1b now asserts B-1/B-2/M-1/M-2/M-3; the 00631 backfill is still untested (see MAJOR-2 / minor-3) |
| m-4 twelve `project_consent_org()` callers remain | **OPEN, ruled** |
| m-5 `bid_amount_cents integer`, undeclared column | **OPEN, declared** |
| m-6 merge under an ARCHIVED survivor | **OPEN** (reproduced: survivor's Directory row reads `status_raw = archived` carrying the merged card's seats) |
| m-7 studio with no owner/admin told and hears nothing | **OPEN** |
| m-8 possessive copy | **OPEN** ("Ostrom Builders's paper has lapsed") |
| m-9 three `contact_id` FKs not repointed | **OPEN** |
| m-10 cross-tenant project reported as a card error | **OPEN** |

Nine of nine handed-back findings are genuinely closed. Everything below is new.

---

## BLOCKING

### B2-1 · `studio_contacts.merged_into` has no write guard: any member can fold a card out of the room and orphan its seats

`00629:53-76` (the column and its index) against `00417`'s column-blind member
UPDATE policy on `studio_contacts`. Nothing in 00629 restricts who may write the
column, and unlike `archived_at` — which 00417 split into a member policy that
refuses it on both sides plus an owner/admin leg (`00417:224-256`, restated as
`archive_studio_contact()` at `00629:1341`) — `merged_into` is an ordinary
updatable column reachable from PostgREST.

Reproduced (rolled back, local, as a plain `member` of the studio):

```
UPDATE public.studio_contacts SET merged_into='<another card>' WHERE id='<card>';
-- DIRECT merged_into write by a plain member: ALLOWED
 merged_into now                | f9210000-…-0000000000b1
 directory row for folded card  | 0        <- the human is gone from /people
 directory rows naming the seat | 0        <- the party branch only carries UNSTAMPED seats
 seat still stamped with        | f9210000-…-0000000000b2   <- the dead card
 seats view rows for the seat   | 1        <- nested under a person_id the Directory never returns
```

That is precisely the shape `00629:204-219`'s own banner says must never occur
("a seat stamped with a MERGED id belongs to no Directory row at all … The human
would vanish from the room"), and precisely the r3 MAJOR-1 defect the v4 rebuild
closed. One PATCH reaches it.

It also bypasses every rule `merge_studio_contacts()` exists to state:

- no channel, affiliation, document, designation, seat, bid pointer or household
  is repointed (§5's whole body is skipped);
- `merge_kind_mismatch` is skipped — a **person can be folded into a firm**, the
  one merge crm-model §4 forbids outright;
- `merge_survivor_already_merged` is skipped — chains and cycles are hand-buildable,
  and `resolve_merged_contact()`'s depth cap becomes the only thing between the
  room and a loop;
- no `studio_contact_merges` row is written, so PR-o's "append-only lineage" has
  a gap the Compare & merge sheet will read as "no merge happened";
- **the pointer may name a card in another studio.** Reproduced as a plain member
  of studio C1 pointing a C1 card at a C2 card; `merged_into` took the value, the
  card left the Directory, and the SECURITY DEFINER guard then echoed the foreign
  id back: `ERROR: party_card_merged_away · HINT: This rolodex card was merged
  into f9310000-…-0000000000c2`. The seat can no longer be written at all, and
  the only repair is another hand-written PATCH.

`merge_studio_contacts()` then refuses to help: both `merge_already_merged` and
`merge_survivor_already_merged` fire on a hand-folded card, so the room's own act
cannot undo the room's own damage.

Fix shape: split the member UPDATE policy on `studio_contacts` the way `00417`
splits `archived_at` (refuse `merged_into` on both sides for `authenticated`,
leaving `merge_studio_contacts()` — SECURITY DEFINER — as the only writer), or
add a BEFORE UPDATE OF `merged_into` trigger that refuses a change whose
`current_setting('app.merge_in_progress')` is not set. Whichever shape, the
same-studio and kind checks belong beside it, and the SQL suite has no assertion
that a member cannot write the column today.

---

## MAJOR

### B2-2 · A merge aborts outright when the absorbed card holds a renewal and the survivor holds the successor

`00629:593-633` — the successor UPDATE and the retired-rows loop it is followed by.

Step 1 moves the absorbed HEAD onto the survivor **and writes
`superseded_by = <the survivor's certificate>` on it**. Step 2 then walks the
rows behind that head. But `assert_compliance_holder()` re-validates the whole
successor contract on every `UPDATE OF holder_id`, and its head-of-chain leg
(`compliance_successor_already_superseded`, live body line 112) now sees a
successor that step 1 itself just retired. The merge raises and the transaction
is lost.

Reproduced (rolled back, local — the most ordinary shape there is: the absorbed
firm renewed its COI once, the surviving firm's COI is current):

```
BEFORE survivor word | current
merge_studio_contacts(survivor, absorbed, 'company_name')
ERROR:  compliance_successor_already_superseded
HINT:   superseded_by must name the paper that is STILL in force …
CONTEXT: PL/pgSQL function assert_compliance_holder() line 112 at RAISE
SQL statement "UPDATE public.studio_compliance_documents d
                  SET holder_id = p_survivor, holder_type = v_survivor.entity_kind
                WHERE d.holder_id = p_merged AND d.superseded_by IS NOT NULL
                  AND EXISTS (… s.holder_id = p_survivor)"
PL/pgSQL function merge_studio_contacts(uuid,uuid,text) line 210
```

Negative controls, both rolled back:

- absorbed holds the same chain, survivor holds **nothing** of that type →
  merge SUCCEEDS (step 1 moves nothing, so step 2's `EXISTS` is empty). Correct.
- the sole-proprietor cross-kind fold with a depth-1 chain → SUCCEEDS (that branch
  never writes `superseded_by`).

So the failure needs exactly: a retired predecessor on the absorbed card, plus a
legitimate successor on the survivor. Every W1b object exists to make the first
of those normal — R-AZ, R-BF and `compliance_document_state()`'s depth-64 walk
are all about supersede chains — and B2-2's own fix (r1 B-1) created the second.

What Leah sees: "Compare & merge" on two firm cards fails with a Postgres error
string naming nothing she did, and it fails **every time** for that pair. There
is no path in the room past it.

Invisible to every gate: the seed holds **0** rows with `superseded_by IS NOT NULL`
(measured, 36 documents), and the SQL suite's block 1b uses a single absorbed
document with no chain, so the whole class is untested.

Fix shape: move the absorbed lineage's `holder_id` first (one statement, the head
last), then write `superseded_by` on the head in a second statement — the head's
own move carries no successor check, and the retired rows' successors are already
on the survivor by then.

### B2-3 · The bid backfill writes a selection date the record does not hold, and the room prints it as fact

`00631:271-280` (`selected_bid`), `:284-291` (`quoted_bid`), `:314-315`, against
`select_trade_scope_bid()` at `00423:1500-1503`.

`bid_selected_at`'s own COMMENT (`00631:119-122`) says `trade_scope_bids.noted_at`
of a `selected` row is "the only record Patina holds of when a selection was made."
It is not. The shipped RPC promotes an **existing** bid row in place:

```sql
UPDATE public.trade_scope_bids SET status = 'quoted'
 WHERE proposal_id = v_bid.proposal_id AND status = 'selected' AND id <> p_bid_id;
UPDATE public.trade_scope_bids SET status = 'selected' WHERE id = p_bid_id …
```

`noted_at` is never touched, and the table carries no `updated_at`. So
`noted_at` on a `selected` row is the day the **number was written down**, not
the day the studio chose. And because `quoted_bid` is
`WHERE b.status IN ('quoted','selected')` — not `'quoted'` as `00631:229-231`'s
own header comment says — the same `noted_at` also answers `bid_quoted_at`
wherever the RFQ rail recorded no `responded_at`.

Reproduced (rolled back, local; `00631`'s mapping CTEs run verbatim over one
bid row in the shipped shape):

```
 party_id  | outcome  |  asked_at  | quoted_at  | selected_at
 d0e3…0004 | selected | 2026-09-28 | 2026-10-02 | 2026-10-02
```

`roster-derivation.ts:978-984` prints those straight through: `Asked …. Quoted ….
Selected ….` So a backfilled selected bid renders **"Quoted 2 October 2026.
Selected 2 October 2026."** — the two dates always identical, and the second one
a fact the studio never recorded. That is the exact guess `00631:239-243` says
the file refuses for `bid_due_at`, taken on a column two lines later.

Locally invisible in both directions: `trade_scope_bids` and `trade_rfq_requests`
each hold **0** rows, so the backfill writes nothing here and only ever really
runs on Strata.

Fix shape: leave `bid_selected_at` NULL in the backfill (the honest answer, the
one `bid_due_at` already takes), and narrow `quoted_bid` to `status = 'quoted'`
so the comment and the code agree.

### B2-4 · The nightly sweep announces the paper of a firm the room has folded away

`00630:228-245` (the sweep's scan) against `00629:593-646` (what stays on the
absorbed card) and `00629:1319-1327` (what the Directory emits).

After r1 B-1's fix, an absorbed document the survivor holds no successor for
correctly **stays on the absorbed card** — but `compliance_document_state()`
still reads it `lapsed`, and the sweep's scan has no `merged_into` leg, so it
writes a notice and one `notification_log` row per owner/admin naming a firm the
Directory no longer emits.

Reproduced (rolled back, local; firm merge, absorbed card holds a lapsed bond the
survivor holds nothing to retire):

```
absorbed doc after merge | holder_id = <absorbed card> | superseded_by NULL | lapsed
sweep                    | {"notices": 1, "scanned": 4, "notified": 1}
subject   | Absorbed Firm B's paper has lapsed
message   | The bond for Absorbed Firm B lapsed 3 Sep 2026.
deep_link | /people?firm=f9b10000-…-000000000002
directory rows for absorbed | 0
directory rows for survivor | 1   (paper word: current)
```

The link is not dead — `people-room.tsx:254` hands it to `<CompanyCard>` and
`company-card.tsx:264` reads `useStudioContact(firmId)`, which reads
`studio_contacts` directly and will happily render the merged card. Nothing on
that card says it was merged. So the principal is told to chase a renewal for a
firm that is not in the room, is sent to a card that looks live, and the lapse
blocks nothing — the opposite of direction §8 P2's "a lapse announces itself
before it blocks a draw."

Fix shape: the sweep's scan takes `AND sc.merged_into IS NULL` (the same leg the
Directory and the auto-link resolver already took in 00629), or the deep link
and the holder name resolve through `resolve_merged_contact()` so the notice
names the survivor.

---

## MINOR

### m2-1 · The backfill the report says is "exercised in full" is not exercised at all
`w3-data-report.md:172` — "The mapping is exercised in full by the SQL test's
block 7 against hand-written rows." Block 7
(`w3_merge_sweep_household_test.sql:1198-1247`) writes `bid_outcome`,
`bid_due_at`, `bid_valid_until`, `bid_amount_cents` and
`bid_quoted_by_person_id` by hand and then tests three refusals; it inserts no
`trade_scope_bids` and no `trade_rfq_requests` row and never runs a line of
00631's mapping. `grep -n "bid_selected_at" w3_merge_sweep_household_test.sql`
returns only block 1b's typed round-trip (`:539`, `:547`). The one statement in
this wave that can only ever run on Strata has zero coverage, which is how
B2-3 survived a green suite.

### m2-2 · The shipped `people_directory` COMMENT now contradicts the shipped view
`00629:785` re-issues the view but not its `COMMENT ON VIEW`, so the live comment
still reads (verified against `obj_description`): *"The CLIENT, LEAD, MAKER and
TEAM branches are DESIGNER-SCOPED BY INHERITANCE — is_studio_comember(designer_id)
alone, carried verbatim from 00594/00420"*. The TEAM branch took the tenant leg at
`00629:1226-1229` (r1 M-7). The next author grepping the comment for the view's
tenancy posture is told something false about a security-relevant branch.

### m2-3 · 00631's header comment and its code disagree on `bid_quoted_at`'s fallback
`00631:229-231` says "the noted_at of that party's **earliest trade_scope_bids
row with status 'quoted'**"; `00631:289` is `WHERE b.status IN ('quoted','selected')`.
The mechanism of B2-3, recorded separately because the comment is what a reader
will trust.

### m2-4 · `bid_asked_at` takes the LATEST RFQ while the outcome may come from the first
`00631:292-300` (`latest_rfq`, `ORDER BY r.created_at DESC`) vs `:258-270`
(`strongest_bid`, keyed on the bid ledger). A party asked twice prints the second
ask date beside the first round's outcome. No source of truth is wrong; the pair
on the face can be.

### m2-5 · `client_households_studio_delete` drops the co-member leg the other three carry
`00632:259-266`. SELECT, INSERT and UPDATE all require
`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`;
DELETE requires only the tenant leg plus `is_org_admin_or_owner`. Where the
designer of record has left the organization, an owner or admin can DELETE a
household row they cannot SELECT. Not a cross-tenant hole (the tenant leg holds),
only an asymmetry the file's own §27-37 banner does not mention.

### m2-6 · A household DELETE strands the money grants it wrote
`00632:402-411` writes `project_party_authority` rows with
`source_clause = 'client_households.co_threshold_cents'`; `designer_clients.household_id`
is `ON DELETE SET NULL` but the authority rows are not touched, so a deleted
household leaves open `money` grants citing a clause that no longer exists.

### m2-7 · After a merge, seats already carrying the survivor's number are not claimed
`00629:356-385`. `link_rolodex_card_to_parties()` fires only on
`UPDATE OF phone, phone_e164`, and the merge writes neither. So the moment the
number stops being ambiguous (B-2's fix), the unstamped seats that were left
uncarded *because* it was ambiguous stay uncarded until something else touches a
phone. Only the next seat write benefits.

### m2-8 · `resolve_merged_contact()` is still the one new function with no `SET search_path`
`00629:172-189`. Unchanged from r1 m-2. `SECURITY INVOKER` and every relation
schema-qualified, so the exposure is operator resolution only — but it is the
sole exception in six files.

### m2-9 · The merge record is still forgeable by any member of the studio
`00629:144-154`. Re-reproduced as a plain `member`: an INSERT naming two real
cards of the studio and any `merged_by`, with no merge having happened, is
accepted. The table's COMMENT calls itself "APPEND-ONLY lineage" and the
Compare & merge sheet will read it as history. (r1 m-1, open.)

### m2-10 · A merge may still fold live seats under an ARCHIVED survivor
`00629:469-479` checks `merged_into` on both cards and never `archived_at`.
Reproduced: merging a live card into an archived one succeeds and the survivor's
Directory row reads `status_raw = archived` while carrying the merged card's
seats. (r1 m-6, open.)

### m2-11 · A studio with no active owner or admin is recorded as told and hears nothing
`00630:305-337`. The notice row lands and the recipient SELECT returns zero rows;
the unique index then guarantees the studio is never told again. (r1 m-7, open.)

### m2-12 · Possessive copy
`00630:263-266` — "Ostrom Builders's paper has lapsed". (r1 m-8, open.)

### m2-13 · Three pointers at a merged card are still not repointed
`agreement_draw_lien_waivers.contact_id`, `studio_trade_agreements.contact_id`,
`studio_trade_agreement_tokens.contact_id` (confirmed against `pg_constraint`:
twenty FKs reference `studio_contacts`; `merge_studio_contacts()` repoints all
but these three and `studio_contact_merges`' own two). (r1 m-9, open.)

### m2-14 · `add_household_member()` still reports a cross-tenant project as a card error
`00632:362-379`. `p_project_id` is never checked against `v_h.organization_id`;
the write is correctly refused by `assert_project_party_cards()` with
`party_studio_contact_other_studio`. No hole, a confusing sentence at the seam.
(r1 m-10, open.)

### m2-15 · Twelve `project_consent_org()` callers remain, and `bid_amount_cents` is an undeclared column
`00628:56-85` and `00631:59`. Both are ruled and declared in
`w3-data-report.md` §6 and §3; recorded so the deviations from the brief are
carried into W7's preflight rather than rediscovered. (r1 m-4 / m-5, open.)

### m2-16 · Two numbers in the report do not match the ledger
`w3-data-report.md:129` — "33 papers in total: 9 `current`, 24 `held`, 2 `lapsed`,
1 `lapses_soon`". Measured on the fresh reset: 9 + 24 + 2 + 1 = **36**, and
`SELECT count(*) FROM studio_compliance_documents` = **36**. The state breakdown
is right; the total is a typo. §10.4 also scopes the SPEC §5.7 travel-list
picker to "the W4 portal wave", which R-BM (`rulings.md` §3) rules W3 scope —
a coordination note for Fable, not a defect in these files.

---

## What I checked and found sound

- **Consent (R-AY).** No consent table, view, RPC, trigger or frozen
  `project_parties.sms_consent_*` column is read for a verdict or written
  anywhere in 00628–00633. The directory view's three `project_consent_org()`
  uses are 00626's ledger key, carried byte-for-byte. `merge_studio_contacts()`'s
  seat UPDATE fires `fc_optin_invite_dispatch` (AFTER INSERT OR UPDATE) but its
  UPDATE branch returns before dispatch whenever `OLD` already carried a complete
  pending consent — verified against the live body.
- **Cross-tenant.** Every new table's RLS holds against a second-studio co-member
  of the designer of record (the r5 MAJOR-3 shape): `client_households`,
  `studio_contact_merges`, `studio_compliance_notices` all return 0;
  `resolve_merged_contact()` answers NULL for a foreign card;
  `sweep_compliance_expiries()` is `permission denied` for `authenticated`;
  a forged cross-tenant merge row is refused by the INSERT policy. The one
  cross-tenant write that IS reachable is B2-1's, through the ungated column.
- **The merge cannot orphan a channel, document or seat when it runs.** One
  transaction, both cards locked in id order, channels/affiliations/rules/
  designations/seats/bids/household all repointed, `merged_into` set last, the
  chain flattened. `project_parties` carries no unique constraint beyond its PK
  (verified), so no repoint can collide. The orphaning path is B2-1's, outside
  the RPC.
- **No company into a person** except crm-model §4's declared sole-proprietor
  exception, in one direction; a person into a firm is always
  `merge_kind_mismatch`.
- **The sweep.** Advisory xact lock → `skipped` row on contention → `app.actor`
  → `running` row → guarded block with no re-RAISE → `succeeded` with
  `{scanned, notices, notified}`. One notice per `(document, state)` enforced by
  a unique index; the notification is written only where the notice landed
  (`ON CONFLICT DO NOTHING … RETURNING`); recipients are the active owners and
  admins of the holding studio and nobody else. Idempotent across two runs in one
  transaction. The cron is guarded on unschedule, unguarded on schedule (00574's
  idiom, deliberate), its body is schema-qualified, and the registry COMMENT is
  the only exception-swallowing block.
- **`compliance_document_state()`** reproduces `compliance_state()`'s rule for one
  row: R-BF's transitive walk, the `cardinality(blocks) > 0` gate, the 30-day
  window, `held` for undated or gateless paper. The duplication is declared in
  both COMMENTs and in the report.
- **00633** replaces the right constraint name (`client_decisions_court_check`,
  00281:166-169), is a strict superset, and 00281's survey still holds — no
  court-consuming read model carries a hardcoded pivot.
- **00628** stamps only unambiguous designers, leaves zero-and-several NULL, is
  idempotent on `studio_id IS NULL`, and passes the shipped
  `set_project_studio_id()` trigger. The suite's block 6 disables that trigger to
  stage its fixture and says so.
- **00632's PR-n trigger** reads over a CHANGE, not a value: both raising and
  erasing are refused to a plain member with `household_threshold_forbidden`,
  and internal callers (`auth.uid() IS NULL`) pass exactly as they pass RLS.
- **Grafts.** `rolodex_card_for_party_phone()`, `link_rolodex_card_to_parties()`
  and `people_directory` diff against 00626 to exactly the changes the file
  claims — no silent retype, no reorder, no dropped predicate.
- **`gen_random_uuid()`** resolves in `pg_catalog` on this stack (it exists in
  both `pg_catalog` and `extensions`), so the bare call is safe on the Strata
  push path; no other extension function is called unqualified.

## Pre-existing red, not W3's

`supabase/tests/rls/field_parties_test.sql` exits non-zero with
`consent_legacy_column_frozen` (R-AX's freeze, W1a's). Already recorded as
w1b final review r3 MINOR-28 and in five later W1b reviews. Unchanged by this
wave.

---

## Suggested order for round 3

1. **B2-1** — a column-scoped refusal of `merged_into` for `authenticated`, plus
   an assertion in the suite that a member cannot write it.
2. **B2-2** — reorder the merge's compliance block: move the lineage's
   `holder_id` first, write `superseded_by` on the head second; assert a merge
   over a renewed absorbed card in block 1b.
3. **B2-3** — leave `bid_selected_at` NULL in the backfill, narrow `quoted_bid`
   to `'quoted'`, and give block 7 real `trade_scope_bids` / `trade_rfq_requests`
   rows (m2-1).
4. **B2-4** — a `merged_into IS NULL` leg on the sweep's scan.
5. **m2-2** — re-issue the view's COMMENT beside the view.
