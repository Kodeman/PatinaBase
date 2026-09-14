# W3 (P2) — adversarial migration review, round 8

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `e9879caeb`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no file edited.**
Every measurement below was taken inside a `BEGIN … ROLLBACK` probe except the
`supabase db reset` and the suites, which are named gates.

Read in full: `w3-data-report.md`; `00628`, `00629` (all 2807 lines), `00630`, `00631`, `00632`,
`00633`; `w3-fix-log-r7.md` and `w3-review-r7-migrations.md`; `rulings.md`;
`direction.md` §3.1/§3.4/§5/§7/§8/§9 (PR-i/PR-o/PR-c/PR-h); `crm-model.md` §4 + CRM-24;
`SPEC.md` §5.4/§5.7; `fixture.md` §4; `w1a`/`w1b`/`w2a`/`w2b`/`w2c` reports; `w2-review-r15-qa.md`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`.

**Verdict: NOT clean — 1 blocking, 1 major, 21 minor.**

Probes: `$TMPDIR/probeA.sql` … `probeF.sql` (one transaction each, ROLLBACKed).

---

## 0. Gates I ran myself

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **clean**; head `00633` + `20260910152111`; seeds landed |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks, 13h restored) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (12 blocks); re-run at the end of this review, still rc=0 |
| `rls/people_directory_scope_test.sql` · `studio_contacts_test.sql` · `project_roster_test.sql` · `anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run (2763 replayed statements) — **no git diff**; the committed file is current |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no git diff** — no type drift |
| `anon` / `PUBLIC` table privileges on `studio_contact_merges`, `studio_compliance_notices`, `client_households` | **none** (`information_schema.role_table_grants` returns 0 rows) |
| EXECUTE on the 19 new/re-issued functions | no `anon`, no `PUBLIC` anywhere; `authenticated` only on the seven RPCs + `compliance_document_state` + `contact_rule_blocks_contact`; all six trigger functions and `sweep_compliance_expiries()` are off `authenticated` |
| cron registry | `compliance-document-expiry-sweep` · `0 6 * * *` · `SELECT public.sweep_compliance_expiries();` · active |
| `people_directory` code-only diff, 00626 body vs 00629 body | **exactly two deltas**, as §6's banner and the report claim: the TEAM tenant leg (`00629:2592-2595`) and `AND sc.merged_into IS NULL` (`00629:2693`) |
| R-AY | grep over all six files: **no consent write, no `record_channel_consent` call, no read of a frozen `project_parties.sms_consent_*` column for a verdict.** The only three hits are two COMMENTs and `00629:2388`'s metadata KEY name, whose value is `q.consent_word` (the record's verdict), carried verbatim from 00626 |
| R-BD callers | `project_consent_org()` has exactly **twelve** callers (8 functions, 4 views, **0 policies**) — the report's enumeration, measured against `pg_proc.prosrc` / `pg_get_viewdef` / `pg_policy` |
| `fc_dispatch_optin_invite` (the one external send a merge could fire) | returns early on every seat the merge's repoint touches — measured against its body; **no automated send from a merge** |
| FK census into `studio_contacts` | 20 columns, all reached by `merge_studio_contacts()` except the two declared freezes (`studio_trade_agreements.contact_id` on a sent agreement, the folded sole proprietor's crew `company_id`) |
| recipients | sweep notifies **owner 3 / admin 3**, no plain member (measured on the seeded book) |

### 0b. Prior findings (`w3-fix-log-r7.md`) — all five FIXED

| Prior | State | Evidence |
|---|---|---|
| r7 B-1 (a firm merge dropped the folded card's own three designations) | **fixed** | `00629:1562-1570` carries all three with `NULLIF(…, s.id)`; suite block 11 asserts it; probeB measured the sole-prop fold landing `paperwork_contact_person_id` and `signer_person_id` on the surviving person card |
| r7 M-1 (four successor legs ungated on `v_retiring`) | **fixed** | `00629:734`, `:740`, `:773`, `:844` all carry `v_retiring AND`; block 11 + negative control 11b green. **But see B-1 below**: §4c's banner justifies the gating with a read-time claim that is false for one of the four |
| r7 M-2 (the fold's closed crew affiliations re-derived on the next card save) | **fixed** | `00629:1004-1005` adds the merged-away disjunct to `sync_person_affiliation_from_pointer()`, re-issued in 00629 with its REVOKE restated (`:1048-1049`) |
| r7 M-3 (13h assertion removed in the wave that shipped the leg) | **fixed** | the predicate is back; the W1b suite is green on a fresh database |
| r7 M-4 (the data report described the pre-r4/r5/r6 migrations) | **fixed** | §1 now reads "SELECT only" and eleven refusals; channels "REDUCE", affiliations "REDUCE"/"CLOSE"; §2 carries `expires_on` and `clear_compliance_notices_on_date_change()`; §4/§9 carry `set_household_threshold()` and `assert_household_threshold_principal()`; §0 and §8 read "eight" bid columns; the empty `### The finding that is owed, not fixed` heading is gone |
| r7's 18 migration minors | **17 still open, 1 fixed** (`n-3`) — each re-measured in §MINOR below |

---

# BLOCKING

## B-1 · Retyping a renewal launders the lapse it retires: two ordinary member writes leave a firm card reading `current` with no in-force certificate on file, and the nightly sweep never says a word

`00629:657-667` is §4c's whole argument for gating six successor legs on `v_retiring`:

> "Re-running them over an unchanged edge adds nothing, because R-BF already re-reckons both facts
> at READ time — … so a chain whose head has since lapsed, **shed a gate or changed type** is already
> counted against the card whatever the trigger said when the edge was written."

Two of those three are true. **"Changed type" is not**, and nothing re-reckons it. Neither
`compliance_state()`'s `retired` CTE (00623) nor `compliance_document_state()`'s
(`00630:88-96`) carries a `doc_type` leg — both ask only that a reachable successor is **in force**
and **carries the root's gates**:

```sql
retired AS (
  SELECT 1 FROM chain c
    JOIN public.studio_compliance_documents s ON s.id = c.succ
    CROSS JOIN me m
   WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
     AND m.blocks <@ s.blocks                      -- 00630:88-96, no doc_type leg
   LIMIT 1)
```

`compliance_successor_wrong_type` is the ONLY thing holding a chain to one paper, it fires only on
the write that creates the edge, and the trigger judges a row against its own successor and never
against its predecessors — so editing the **successor's** `doc_type` is judged by nothing at all.
`studio_compliance_documents_member_update` (`00623:536-540`) lets any active studio member do it
in one PATCH.

**Measured** (`$TMPDIR/probeE.sql`, fresh seeded database, rolled back, acting as an ordinary
member of the seeded studio):

```
firm card holds  coi_gl  CURRENT_DATE-40  blocks {site_access,draw}   (the lapse)
                 coi_gl  CURRENT_DATE+300 blocks {site_access,draw}   (the renewal)

before                                     compliance_state -> lapsed
write 1  point the lapse at its renewal    compliance_state -> current      (legitimate)
write 2  UPDATE … SET doc_type='w9'        compliance_state -> current
         on the RENEWAL                    compliance_document_state(lapse) -> superseded
                                           lapsed coi_gl still on file      -> 1
```

After write 2 the firm holds **no in-force general-liability certificate** and one lapsed one, and:

1. **The company card and the Directory firm row print `current`** — R-G's paper column and R-K's
   Paper region, over a firm with no cover. This is PR-h's exact harm ("a designer mobilises an
   uninsured sub from the Call Sheet") and the r1 MAJOR-4 / r2 MAJOR-1 / r3 MAJOR-1 / r4 MAJOR-1
   consequence, reached through the one door those four fixes do not cover.
2. **The roster row prints no held clause** — `compliance_state()` is the same formula behind
   `identity_paper_state()`, so the terracotta leading rule PR-h puts on the seat line disappears.
3. **W3's own promise fails.** `compliance_document_state()` answers `superseded`, so
   `sweep_compliance_expiries()` (`00630:375`) CONTINUEs past the row: direction §8 P2's "a lapse
   announces itself before it blocks a draw" is silently switched off for that document, forever,
   with no notice row and no `notification_log` row to show it was ever considered.

**Scope, stated plainly.** The hole itself predates W3 — it lives in 00623's `compliance_state()`
and in the shape of `assert_compliance_holder()`'s trigger, and it was reachable before r7's
`v_retiring` change exactly as it is after (the `doc_type` edit fires the trigger on the SUCCESSOR,
whose own `superseded_by` is NULL, so the successor block is skipped either way). What is W3's is
(a) `00630`'s `compliance_document_state()`, which copies the gap into the file that decides whether
the studio is told, and (b) `00629:657-667`, which asserts in writing that the gap does not exist.
A reader working from §4c would conclude the leg is redundant; it is not.

The sibling doors are genuinely closed, and I measured that too: clearing the renewal's
`expires_on` is refused by `studio_compliance_documents_dated_expiry_check`
(`$TMPDIR/probeF.sql`), shrinking its `blocks` leaves `m.blocks <@ s.blocks` false so the lapse
stays counted, and pulling its date earlier leaves the successor out of force. Only `doc_type` has
no read-time counterpart.

**Fix**: add the missing leg to both reckonings — `AND s.doc_type = <root>.doc_type` in
`compliance_document_state()`'s `retired` CTE (`00630:88-96`) and in `compliance_state()`'s
(00623). It costs nothing (the row is already being read) and cannot reject a legitimate chain,
because `compliance_successor_wrong_type` already holds every edge to one paper at write time. Then
correct `00629:657-667` to name the two facts R-BF actually re-reckons. (The alternative — firing
the successor contract on a `doc_type` edit by re-judging every row that names the edited row as
its successor — is a larger change and buys the same thing.)

---

# MAJOR

## M-1 · A person-to-person merge whose survivor holds one of the three designations naming the folded card aborts with `designated_person_is_self`, and the room has no editor that can clear it

`00629:1926-1934` repoints the three designations **other** cards hold naming the merged PERSON:

```sql
IF v_survivor.entity_kind = 'person' THEN
  UPDATE public.studio_contacts
     SET paperwork_contact_person_id = p_survivor
   WHERE paperwork_contact_person_id = p_merged;      -- 00629:1927-1929
  … signer_person_id …                                 -- :1930-1931
  … site_contact_person_id …                           -- :1932-1933
```

There is no `AND id <> p_survivor`. When the SURVIVOR is itself one of those "other cards", the
statement writes `S.signer_person_id = S`, and `assert_studio_contact_designations()`
(00592/R-AP, `00592:249-256`) raises `designated_person_is_self` — the whole merge is lost, with a
raw schema token naming nothing the studio did. This is the same self-reference class r7 B-1 guarded
against three lines earlier with `NULLIF(v_merged.X, s.id)` (`00629:1562-1570`) and the same class
r6 M-1 closed for `route_to_person_id`; the "other cards" half was left unguarded.

**Measured, twice.** Directly (`$TMPDIR/probeA.sql`): two person cards, the survivor naming the
other as its `site_contact_person_id`, `merge_studio_contacts(survivor, folded, 'manual')` →

```
ERROR:  designated_person_is_self
CONTEXT: SQL statement "UPDATE public.studio_contacts
           SET site_contact_person_id = p_survivor WHERE site_contact_person_id = p_merged"
         PL/pgSQL function merge_studio_contacts(uuid,uuid,text) line 862
```

And through **two acts the room itself offers** (`$TMPDIR/probeB.sql`), which is what makes it
reachable rather than theoretical:

```
1. Compare & merge, sole-proprietor fold: "PB Firm" (paperwork contact and signer = PB Bookkeeper)
   folds into "PB Owner-operator" (is_sole_proprietor).
   -> 00629:1562-1570 (r7 B-1) carries both designations ONTO THE PERSON CARD:
      after sole-prop fold | person | paperwork_contact_person_id = PB Bookkeeper
                                    | signer_person_id            = PB Bookkeeper
2. Compare & merge again: PB Bookkeeper turns out to be the owner-operator carded twice.
   merge_studio_contacts(PB Owner-operator, PB Bookkeeper, 'manual')
   -> ERROR designated_person_is_self, from 00629:1927-1929
```

Before r7 B-1 a person card could not acquire these three through any shipped act — only
`company-card.tsx` writes them (`use-studio-contacts.ts:361-365`, reached from
`company-card.tsx:445-447`), and that sheet opens firm cards only. r7 B-1's COALESCE is what puts
them on a person card, so this is a **new reachable path opened by the r7 fix**.

**And there is no way out**, which is r6 M-1's own argument: the only designation editor in the room
is the company card, the survivor is a person card, and nothing on `person-profile.tsx` reads or
writes the three columns — so the studio cannot clear the pointer that is refusing the merge, and
the pair can never be folded.

**Fix**, in this file's own idiom: the fold ANSWERS the designation exactly as r6 M-1 says it answers
a route — after the merge the designated person IS the survivor, so the pointer is dropped rather
than written as a self-reference. Either `SET … = NULLIF(p_survivor, id)` on the three statements,
or exclude the survivor (`AND id <> p_survivor`) and null its own three in the same breath. R-BN is
satisfied either way: the folded card keeps its own copy of all three (`00629:1562-1570` is a
COALESCE onto the survivor, never a move off the folded card). Whichever is chosen, add the case to
block 11 of the suite — nothing in twelve blocks reaches it today.

---

# MINOR

Three new, seventeen carried from r7 (each re-measured this round), plus one environment note.

## New

### n5 · `00628`'s NOTICE counts a delta over every stamped project, not over the ones it stamped
`00628:164-170`. The comment says *"projects stamped here whose designer holds no `designer` domain
role"* and the NOTICE says *"% stamped project(s) have a designer with no designer domain role"*, but
the query is `WHERE p.studio_id IS NOT NULL` — every project that carries a studio, including the
three that already had one before this file ran, and every project a later `set_project_studio_id()`
write stamps. The number is 0 locally (measured: 8 projects, 3 stamped, 5 NULL, delta 0), so nothing
is wrong on this database; but this NOTICE is what the W7 preflight reads off Strata, where the
figure it prints will be the whole book's delta and will be read as this migration's. One predicate:
capture the stamped ids in the backfill's own `RETURNING`, or re-derive `n_orgs = 1 AND studio_id IS
NOT NULL` in the count.

### n6 · A merge can leave one identity holding two seats of the same kind on the same job
`00629:1938-1939` repoints every seat unconditionally and `project_parties` carries no unique index
beyond its primary key (measured: `project_parties_pkey` is the only unique index). Two cards for one
human, each seated on the same project with the same `party_kind` — crm-model §4 rules 3 and 4's
shape, where the two cards carry different numbers so the auto-link never collapsed them — come out
of the merge as two seats.

**Measured** (`$TMPDIR/probeD.sql`): after `merge_studio_contacts(…, 'email')`,

```
seats on one job for the survivor, kind `sub`   -> 2
people_directory row  "PD Dana K"  seat_count   -> 2
people_directory_seats nested under that row    -> 2   (two identical lines, one job)
```

The seats genuinely exist and "Close this seat" is the repair, so this is not data loss — but
direction §8 P2's promise for this file is "duplicates converge", and the Call Sheet's own vitals
line ("14 on the job this week") counts seats. Worth a ruling: either the merge reduces a
same-(project, kind) collision the way it reduces a channel and an affiliation collision (R-BN's
posture), or the room's roster dedupes on the identity.

### n7 · `assert_compliance_holder()` is re-issued in 00629 without restating its REVOKE
`00629:673-858`. Two sections later, `sync_person_affiliation_from_pointer()` restates its REVOKE
with the reason on the file — *"a re-issued function keeps its ACL, and stating it is cheaper than
trusting that"* (`00629:1046-1049`). §4c trusts it. The ACL is in fact correct (measured:
`postgres=X, service_role=X`, no `authenticated`, no `anon`) and `00-legacy-grants.sql` regenerates
with no diff, so this is consistency only — but the two re-issued functions in one file should make
the same promise the same way.

## Carried from r7, re-measured

| id | State | Evidence this round |
|---|---|---|
| m-1 · `people_directory`'s view COMMENT is stale | **open** | measured: `obj_description('public.people_directory')` ILIKE `'%merged%'` is **false**; `CREATE OR REPLACE VIEW` preserves the comment and `00629` never restates it, so the one durable description of the room's central view mentions neither `merged_into` nor the TEAM tenant leg |
| m-2 · `00630`'s justification for its `merged_into IS NULL` leg is the rule r3 overturned | **open** | `00630:359-363` still reads "merge_studio_contacts() leaves an absorbed document on the absorbed card"; `00629:1845-1849` moves every absorbed head. The leg is still worth keeping; the reason on the file is wrong |
| m-3 · `resolve_merged_contact()` pins no `search_path` | **open** | `00629:349-353`: `LANGUAGE sql STABLE` with no `SET`, against `search_path=public` on its siblings. INVOKER and fully schema-qualified, and its one definer caller carries its own SET, so no live exploit |
| m-4 · both depth caps strand rows silently | **open** | `00629:363` (`h.depth < 16`), `00629:1856` and `00629:1908` (`FOR i IN 1..16`). A supersede chain deeper than sixteen leaves its tail on the absorbed card, where the sweep, the pickers and `people_directory` all skip it. Cheap fix: RAISE when the loop exits at 16 with rows still matching |
| m-5 · the sweep's possessive reads "…'s" on a name ending in s | **open** | `00630:390-393`; measured on the seeded book this round: `subject = "Ostrom Builders's paper has lapsed"` |
| m-6 · `client_households_studio_delete` drops the co-member leg its three siblings carry | **open** | `00632:259-266` vs `:224-257`. Defensible; the file's RLS banner (`00632:27-37`) still does not mention the asymmetry |
| m-7 · the sweep announces an ARCHIVED holder's paper, with a deep link to the archived card | **open** | `00630:354-372` filters `sc.merged_into IS NULL` and nothing else. **Measured** this round (`$TMPDIR/probeC.sql`): archive Northgate Electric, clear the notices, sweep → `{"notices":3,"notified":6}` and a notice row for the archived holder's document, whose `deep_link` is `/people?firm=…` — a card `directory-view.tsx` reads with `includeArchived: false` |
| m-8 · the merge sheet says the folded card's rule "stays on the folded card as a record" | **open** | `compare-merge-sheet.tsx:113`; `?person=`/`?firm=` resolve forward, `useStudioContacts` filters `merged_into`, `people_directory` emits no row (`00629:2693`) |
| m-9 · the notification abbreviates the month where the room spells it out | **open** | `00630:421`/`:425` (`'FMDD Mon YYYY'`); measured: "The certificate of insurance for Ostrom Builders lapsed 31 Dec 2025." R-Q and R-R spell the month |
| m-10 · sweep residue on the shared local Postgres | **present again — environment, not a product finding** | after my own clean `supabase db reset`, `job_runs` ids 9 and 10 carry two committed `compliance-document-expiry-sweep` runs (`{"notices":3,"notified":6}` then `{"notices":0}`) from two separate transactions 14 ms apart, with 3 committed `studio_compliance_notices` and 6 `notification_log` rows. Not this session's (my probes all rolled back) and not the cron's (`0 6 * * *`, and it is 03:46 UTC). The next reviewer's first-run probe will read `{"notices":0}` over a book that has three unless they reset first |
| m-11 · one legacy studio-less job freezes a whole household's figure | **open** | `00632:534-546`: the loop raises `household_grant_project_has_no_studio` if ANY sourced seat sits on a studio-less project, aborting the change to the figure itself, and the refusal does not name the job |
| m-12 · a notice row is written even when nobody is told, and the key then silences it forever | **open** | `00630:377-387` inserts and counts; `00630:432-462` notifies only active owners/admins. A studio holding only plain members gets `notices: 1, notified: 0`, and `(document_id, state, expires_on)` means that sentence is never said again until the date moves — against a table whose COMMENT calls itself "what the studio has ALREADY been told" |
| m-13 · a merge of a card seated on a legacy studio-less job aborts on W1b's own guards | **open** | `00629:1938-1939` fires `assert_project_party_cards_trg` (`party_card_project_has_no_studio`) and `00629:1974-1976` fires `assert_party_bid_quoted_by_trg` (`00631:180-187`). Not reachable locally — measured again: 5 studio-less projects of 8, **0** carrying seats — but 00628 runs in the same push on Strata and any project it leaves NULL whose seats predate 00624 will abort a merge with a schema token. One line in the W7 preflight |
| m-14 · `00629:1516` says `company_kind` "is carried unconditionally"; the code COALESCEs it | **open** | `00629:1555` is `company_kind = COALESCE(s.company_kind, v_merged.company_kind)` |
| n-1 · `contact_rule_blocks_contact()` has no caller, and its COMMENT states a false fact | **open** | re-grepped over `supabase/`, `apps/`, `packages/`: the only hits are its own definition, its grants, one comment at `00629:1217`, and the generated `database.types.ts`. `00629:894-899` still says *"merge_studio_contacts() refuses on it"*, which r5 M-2 replaced with the subsumption test at `00629:1261-1276`. A dead function with EXECUTE granted to `authenticated` and a description of behaviour that no longer exists |
| n-2 · the report's measured numbers are stale against the seed | **partly fixed** | the project counts now agree (measured 8 / 3 / 5, report §6 `:249-257`). Still wrong: §2 `:132` says "33 papers in total" where the book holds **36** (its own breakdown 9 + 24 + 2 + 1 already sums to 36), and §2 `:130` says Lakeshore Painting Co.'s COI expires `2026-10-06` where it reads **2026-10-07** — §7.1's own class, an absolute date written against a seed that shifts with `CURRENT_DATE` |
| n-3 · the report carries an empty heading | **FIXED** — the heading is gone |
| n-4 · a merge can leave two `preferred` rows of the same kind on the survivor | **open** | `00629:1366-1369` repoints every non-duplicate channel with `preferred` intact, and the only unique index on `studio_contact_channels` is `(owner_id, channel_kind, value)` (measured) — no "one preferred per (owner, kind)". Pre-existing shape, surfaced by the merge |

---

## Checked and clean

* **The merge is one transaction and cannot orphan a channel, a document, a seat, a household, a
  bid pointer or an agreement token.** 20 FK columns into `studio_contacts` (measured census); every
  one is reached except the two declared freezes. `client_households.primary_member_person_id`
  cannot strand, because `assert_client_household_members()` re-validates the primary on every
  member write, so it is never outside `member_person_ids`.
* **`merged_into` is unforgeable and the lineage is append-only.** `assert_merged_into_write()`
  (`00629:128-222`) refuses every writer but the RPC, owners and admins included; the GUC door is
  transaction-local and shut at `00629:2048`; `studio_contact_merges` has SELECT as its only policy
  and its only member grant (`00629:314-335`); `anon` and `PUBLIC` hold nothing on any of the three
  new tables (measured).
* **No company into a person** except crm-model §4's sole-proprietor exception, stated twice
  (`00629:1167-1179` in the RPC and `00629:187-195` in the trigger) so service_role and a repair
  script are held to it too.
* **Consent is record-only (R-AY).** No W3 file writes a consent table, calls
  `record_channel_consent`, or reads a frozen `project_parties.sms_consent_*` column for a verdict.
  A merge dispatches no send: `fc_dispatch_optin_invite` returns early on every seat shape the
  repoint produces.
* **The sweep** is idempotent (measured `{"notices":3,"notified":6}` then `{"notices":0}` on a
  cleared table), takes `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation with a
  `skipped` row on contention, swallows its own exception without re-RAISE so the failed row
  persists, is `service_role`-only, schema-qualifies its cron body, guards its `cron.unschedule`
  with `EXISTS`, and notifies **owners and admins of the holding studio only** (measured 3 + 3, no
  plain member). `clear_compliance_notices_on_date_change()` is scoped to the one document's rows.
* **Households RLS** carries the tenant leg beside `is_studio_comember(designer_id)` on all four
  policies, PR-n's owner/admin gate in the WITH CHECK **and** in
  `assert_household_threshold_principal()` (the one that sees OLD), and owner/admin on DELETE.
  `add_household_member()` and `set_household_threshold()` restate both legs in their bodies because
  SECURITY DEFINER bypasses the policies, and both refuse rather than half-granting (PR-n).
  `add_household_member()` cannot seat a card across a tenant boundary: the card is held to the
  household's org and `assert_project_party_cards()` holds the seat to the studio the project
  records.
* **PR-c's split holds**: the money grant rides the `client_rep` seat and never the plain `client`
  one (`00632:388`).
* **The bid guards bite by name** and all three CHECKs hold (`00631:67-90`); `bid_selected_at`,
  `bid_due_at` and `bid_valid_until` are correctly left unbackfilled; the backfill is guarded on
  `pp.bid_outcome IS NULL` and COALESCEs each written column. Eight columns ship, as the report now
  says in all three places.
* **00628** is idempotent on `studio_id IS NULL`, fires rather than bypasses
  `set_project_studio_id()`, and stamps nothing ambiguous — measured 5 studio-less of 8, none
  carrying seats, so R-BI's duplicate-identity hazard is not live here.
* **`project_consent_org()`** has twelve callers, every one the consent ledger's key and **none a
  policy** (measured). R-BD's retirement is scoped to guards and reducers and W1b finished that
  half; settled in r6, not re-litigated.
* **00633** is purely additive; the widened CHECK admits a strict superset; `project_tasks.owner`
  correctly untouched.
* **Money is integer cents** with `>= 0` CHECKs on `bid_amount_cents` and `co_threshold_cents`;
  every vocabulary is a named CHECK, not an enum; every new SECURITY DEFINER pins `search_path`
  (the one exception, `resolve_merged_contact()`, is INVOKER — m-3).
* **A cross-kind fold cannot be refused by the channel guard**: `assert_channel_owner_kind()` holds
  only `owner_type = entity_kind`, and `studio_contact_channels` carries no `channel_kind` ×
  `owner_type` CHECK, so a firm's `dispatch` and `ap_email` rows land on the person card
  (measured constraint list).
* **Generated types and `00-legacy-grants.sql` are both current** — regenerated this round with no
  git diff. Working tree clean.
