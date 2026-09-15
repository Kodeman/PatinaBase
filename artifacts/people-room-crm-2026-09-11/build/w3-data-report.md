# W3 (P2) — the data layer: merge, expiry sweep, bids, households, court, studio_id

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**Nothing was pushed to Strata: no `supabase db push`, no `supabase functions deploy`, no portal deploy.**

---

## 0. The seven migrations

W1 ended at 00627. 00595–00620 stay reserved for the hour-tracking program and are untouched.
W3 mints **00628–00634**.

> **Re-measured at HEAD, review round 21** (r21 MAJOR-3). Every count, date and list
> in §0, §1, §2, §4, §8, §9 and §10 below was taken again against the freshly reset local
> database on 2026-09-15 after the r21 fixes landed; the round is stated beside each
> figure that a later round can move. Earlier rounds described this as a six-migration
> wave and never named `00634` — the file that gates money on a seat close.

| Migration | Intent |
|---|---|
| `00628_project_studio_id_backfill.sql` | R-BD / R-BI — the legacy studio-less projects, and the `project_consent_org()` enumeration |
| `00629_studio_contact_merges.sql` | PR-o — `merged_into`, `studio_contact_merges`, `merge_studio_contacts()`, `resolve_merged_contact()`, the merged-card seat guard, `people_directory` v5, and the archive/restore door |
| `00630_compliance_expiry_sweep.sql` | direction §8 P2 — `compliance_document_state()`, `studio_compliance_notices`, `sweep_compliance_expiries()`, nightly pg_cron at 06:00 UTC |
| `00631_project_party_bids.sql` | direction §3.4 / R-R — the **eight** bid columns (r4 M-2; §3 has the list), the quoting-person guard, the `trade_rfq` backfill |
| `00632_client_households.sql` | PR-c / CRM-19 — `client_households`, `designer_clients.household_id`, `add_household_member()` |
| `00633_decision_court_widened.sql` | fixture §3 / G-13 — `client_decisions.court` gains architect, engineer, inspector, lender |
| `00634_seat_close_ends_authority.sql` | r19 MAJOR-1 / r20 BLOCKING-1 / r21 MAJOR-2 (R-BS) — `end_party_authority_at_seat_close()` + its trigger: closing a seat BY HAND ends every open grant it carried (`effective_to = GREATEST(effective_from, off_job_at)`), the gate is stated in the definer's own body (a caller must be an active member of the recorded studio and a co-member of the designer, and an owner or admin where the seat carries an open `money` / `draw_certify` grant, else `seat_close_authority_forbidden` / `seat_close_money_authority_forbidden`), and the trigger is clamped to the hand-close act — never the statement that records a bid withdrawal. Plus the one-off backfill over seats already closed |

New SQL suite: `supabase/tests/people/w3_merge_sweep_household_test.sql` (one transaction, ROLLBACKed). Grown by the review rounds: **21 numbered blocks as of r21** — `1 · 1b · 1c · 2 · 2b · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 13b · 13c · 13d · 13e · 13f`, and **13f is the last**. Block 10 pins r6's five merge findings (R-BN); block 11 + its negative control pin r7's B-1 and M-1; 13d pins r18 MAJOR-1 / r19 MAJOR-1; 13e pins r20 BLOCKING-1 (who may fire 00634's trigger); 13f pins r21 MAJOR-2 / R-BS (a recorded withdrawal is not the hand-close act).

---

## 1. The merge record (00629)

### Objects

| Object | Shape |
|---|---|
| `studio_contacts.merged_into` | `uuid` nullable self-FK, `ON DELETE SET NULL`, CHECK `merged_into <> id`, partial index where NOT NULL |
| `studio_contact_merges` | `id, organization_id, survivor_id, merged_id, matched_on, merged_by, merged_at`; CHECK `matched_on IN (profile, phone, email, company_name, manual)`; CHECK `survivor_id <> merged_id`; three indexes |
| RLS | **SELECT only** for `is_active_studio_member(organization_id)` (r3 W3-R3-5, `00629:331`): the member INSERT policy is DROPped and `authenticated` is granted `SELECT` alone (`00629:333-334`). Measured: a member's direct INSERT answers `permission denied for table studio_contact_merges`. No INSERT, UPDATE or DELETE policy and no such grant — the SECURITY DEFINER RPC is the only writer, and the lineage is append-only |
| `resolve_merged_contact(uuid) → uuid` | SECURITY **INVOKER**, recursive walk, depth cap 16 |
| `merge_studio_contacts(uuid, uuid, text) → uuid` | SECURITY DEFINER, `search_path = public`, active-member gated in the body |
| `assert_party_card_not_merged()` + `assert_party_card_not_merged_trg` | BEFORE INSERT OR UPDATE OF `studio_contact_id, company_id` on `project_parties` |
| `archive_studio_contact(uuid) → timestamptz` | SECURITY DEFINER, owner/admin only (00417's shipped rule), idempotent |
| `restore_studio_contact(uuid) → timestamptz` | SECURITY DEFINER, owner/admin only |
| `people_directory` | re-issued v5: 00626:1388-1909 plus **two** deltas, both enumerated in the file's own banner (`00629:2716-2718`) — (1) the CONTACTS branch's WHERE gains `AND sc.merged_into IS NULL`, so a folded card leaves the Directory; (2) the TEAM branch's WHERE gains the tenant leg every other branch already carried. §7 and §10.1 argue about whether the second shipped: it did (r21 MAJOR-3, re-measured at HEAD) |

### `merge_studio_contacts(p_survivor, p_merged, p_matched_on)` — what one transaction does

Refusals, in order: `merge_contact_not_found` · `merge_same_card` · `merge_matched_on_invalid` · `merge_other_studio` · `merge_not_a_member` · `merge_already_merged` · `merge_survivor_already_merged` · `merge_survivor_archived` (r5 M-4, `00629:983`) · `merge_kind_mismatch` · `merge_two_logins` (r4 B-1, `00629:1011`) · `merge_contact_rule_conflict` (r4 B-2 / r5 M-2, `00629:1092`) · `merge_seat_on_studioless_project` · `merge_seat_card_other_studio` · `merge_seat_collision`. **Fourteen distinct tokens, not eight and not eleven** (re-measured at HEAD, r21: sixteen `RAISE EXCEPTION` sites over fourteen names — `merge_seat_collision` is raised from more than one branch). The last six were all review findings and all are pinned by the SQL suite.

Both cards are locked `FOR UPDATE` in id order (`least`/`greatest`), so two members merging the same pair from opposite directions cannot deadlock.

Repointed, in this order:

1. **Channels** — a collision on `(channel_kind, value)` **REDUCES onto the survivor first** and only then is the absorbed row deleted (r6 B-1, `00629:1143-1185`): status worst-first (`unsubscribed > dead > bounced > active`) carrying its own `status_at`, `verified` / `verified_at` and `preferred` OR'd, `label` COALESCEd. The earlier blind DELETE destroyed a recorded unsubscribe and the room then offered the address as live, which is exactly what R-BN forbids. The rest are repointed with `owner_type` rewritten to the survivor's `entity_kind` (`assert_channel_owner_kind()` holds that word).
2. **Affiliations** — an open collision **REDUCES before the duplicate goes** (r6 M-2, `00629:1422-1434` and its company-side mirror `:1448-1460`): `role_at_firm` COALESCEd, `is_paperwork_contact` / `is_signer` / `holds_trade_license` OR'd, `from_date` the LEAST of the two. Person merge: reduce, delete the duplicate, repoint `person_id`. Company merge: the same on `company_id`, plus a belt-and-braces repoint of any stranded legacy `studio_contacts.company_id`. Cross-kind (the sole-proprietor fold): only the person's affiliation **at themselves** is deleted (`studio_person_affiliations_distinct_cards_check` forbids it); every OTHER person's affiliation at the folded firm is **CLOSED with `to_date`**, keeping its role and designations readable, and their legacy `company_id` is deliberately left naming the folded card under `patina.suppress_affiliation_sync` so `people_directory`'s `company_name` COALESCE still resolves the firm (r6 M-3, `00629:1412-1420`). 00592's `sync_studio_contact_company_pointer()` keeps `company_id` true throughout — asserted by the test. **r7 M-2:** `sync_person_affiliation_from_pointer()` now stands down for a pointer naming a merged-away card, so the shipped card editor cannot re-derive a fresh open affiliation over the one the fold closed.
3. **Contact rules** — the merged card's rule is repointed **only when the survivor has none**; otherwise it stays on the merged card as history, which is also what the `(subject_type, subject_id)` unique index requires. `route_to_person_id` is repointed separately (person survivors only — a firm cannot be a route target).
4. **Compliance documents** — `holder_id` and `holder_type` both moved.
5. **Designations** — two halves. (a) `paperwork_contact_person_id`, `signer_person_id`, `site_contact_person_id` on every OTHER card are repointed off the merged PERSON (`00629:1710-1718`). **Not in the brief's list**; added because leaving them would leave a firm card printing a name the Directory no longer emits a row for. (b) **r7 B-1:** the folded card's OWN three travel onto the survivor in the COALESCE statement (`00629:1342-1364`), because nothing carried them and the merge sheet said in words that they moved — the Directory firm row's payee marker reads `signer_person_id` (not the affiliation's `is_signer`, which the merge already carried) and "Chase the renewal" passes `paperwork_contact_person_id` into the queued task with no fallback, so both went blank. `NULLIF(..., s.id)` drops the one value that cannot land — the sole-proprietor fold where the folded firm named the surviving person as its own site contact, which `assert_studio_contact_designations()` refuses as `designated_person_is_self`. R-BN: the folded card keeps its own copy either way.
6. **Seats** — `project_parties.studio_contact_id` (the v4 identity key), then `company_id` (company survivor) or `warranty_contact_person_id` (person survivor); in the cross-kind case `company_id` is set NULL, because 00624 refuses a person card there (`party_company_not_a_company`).
7. **The pointer** — `merged_into` set, and the chain **flattened**: any card already pointing at the merged one is repointed at the survivor, so `resolve_merged_contact()` normally answers in one hop.
8. **The record** — one `studio_contact_merges` row, `merged_by = auth.uid()`.

**Consent is untouched, by construction.** `studio_channel_consent` is keyed `(organization_id, channel_kind, channel_value)` and never on a card id, so a number's verdict follows the number with no write (crm-model §4, R-AY). No consent table, view, or frozen `project_parties.sms_consent_*` column is read or written anywhere in this migration.

### PR-o — both ids stay resolvable

The merged card is **not deleted and not archived**. `merged_into` is its tombstone; `resolve_merged_contact()` maps the old id forward; `studio_contact_merges` holds the act with its evidence word. The Directory folds the merged card away because the room's unit is the identity, not the card.

### No company into a person

`merge_kind_mismatch` unless `merged.entity_kind = 'company' AND survivor.entity_kind = 'person' AND survivor.is_sole_proprietor` — crm-model §4's single exception, in one direction only. A person merging into a firm is always refused.

### The seat guard (not in the brief, and why it is here)

`party_identity_key()`'s first leg is `studio_contact_id`, and the CONTACTS branch now skips merged cards, so a seat stamped with a merged id would belong to **no** Directory row at all (the party branch is `studio_contact_id IS NULL`). `merge_studio_contacts()` repoints every seat it finds; the trigger catches the later write that carries a stale id — exactly what a portal holding a cached picker list does. A separate trigger rather than a graft of `assert_project_party_cards()` (176 lines of unrelated tenancy reasoning); two triggers on one event fire in name order with no interaction.

---

## 2. The expiry sweep (00630)

### Objects

| Object | Shape |
|---|---|
| `compliance_document_state(uuid) → text` | `superseded \| held \| current \| lapses_soon \| lapsed`, SECURITY INVOKER, R-BF's transitive supersession walk with a depth cap of 64 |
| `studio_compliance_notices` | `id, organization_id, document_id, state, **expires_on NOT NULL**, noticed_at`; CHECK `state IN (lapses_soon, lapsed)`; **UNIQUE (document_id, state, expires_on)** (r5 M-3, `00630:142`, `:193-194`) |
| RLS | SELECT for `is_active_studio_member(organization_id)`. **No INSERT/UPDATE/DELETE policy and no such grant for `authenticated`** — the sweep is the only writer |
| `sweep_compliance_expiries() → jsonb` | SECURITY DEFINER, `service_role` EXECUTE only (no `authenticated` grant — this is a job, not an act) |
| `clear_compliance_notices_on_date_change()` + `_trg` | AFTER UPDATE OF `expires_on` on `studio_compliance_documents` WHEN the date actually changed; SECURITY DEFINER, no grant to `authenticated`. Drops that document's notice rows so the sweep announces the new date (r5 M-3, `00630:258-288`) |
| cron | `compliance-document-expiry-sweep`, `0 6 * * *`, guarded unschedule, body `SELECT public.sweep_compliance_expiries();` — schema-qualified, `pg_cron` registry COMMENT extended |

### The shape, per 00574

Advisory xact lock `hashtext('job:compliance-document-expiry-sweep')` → a `skipped` `job_runs` row on contention → `app.actor` set → a `running` row → the work in a guarded block (no re-RAISE, the failed row persists) → `succeeded` with `detail = {scanned, notices, notified}`.

### Which paper is swept

`expires_on IS NOT NULL AND cardinality(blocks) > 0 AND expires_on <= CURRENT_DATE + 30`, then `compliance_document_state()` must read `lapses_soon` or `lapsed`. That is `compliance_state()`'s own rule (CS2 §4, PR-h: "a date with no gate changes nothing"), one row at a time. Undated paper is `held` and cannot lapse; paper carrying no gate is `held` too. A notice for paper the room prints no word for would be a promise on a face.

### One notice per (document, state, THE DATE IT WAS ABOUT)

The unique index is the idempotency rule, not a nicety: a lapsed paper stays lapsed, and without it the studio would hear the same sentence every morning. The notification is written **only where the notice row actually landed** (`ON CONFLICT DO NOTHING ... RETURNING`), so the two records can never disagree about how many times a studio was told. A paper that crosses `lapses_soon` and later `lapsed` earns exactly two notices — asserted.

**The key carries `expires_on` (r5 M-3).** It was `(document_id, state)`, which is permanent, while `studio_compliance_documents.expires_on` is freely editable by any active studio member — so correcting a mistyped date permanently SPENT that document's notice and the studio was never told again. The date is the right third column because it is what the notice SAYS ("… lapses 31 Mar 2026"), so a different date is a different sentence. `clear_compliance_notices_on_date_change()` (`00630:258-288`) drops that document's notice rows whenever the date actually moves, so the new date is announced rather than silently swallowed by the old key.

### The notification shape (found, not invented)

There is no `notifications` table in this codebase. In-app notices are `notification_log` rows, and the shipped writers (00267:243, 00431:86-110, 00534, 00572) all use:

```
notification_log(user_id, type, channel = 'in_app', status = 'delivered', metadata, sent_at)
```

with the reader's fields inside `metadata`. The sweep writes:

- `type = 'compliance_document_expiry'`
- `channel = 'in_app'`, `status = 'delivered'`, `sent_at = now()`
- `metadata`: `document_id, holder_id, holder_type, holder_name, doc_type, doc_label, expires_on, state`, plus the reader's bag — `subject` / `title` / `headline`, `message` / `preview` / `body`, `deep_link` / `url` (`/people?firm=<id>` or `/people?person=<id>`), `read_at: null`
- `ref_type` / `ref_id` deliberately left NULL: `notification_log_ref_type_chk` admits only invoice / client_invitation / client_review / proposal, and widening a live CHECK to carry a link the metadata already carries is a change this file has no need of.

**Recipients:** the active `owner` and `admin` members of the holding studio (R-AC's population for the compliance family; a lapse is an act somebody has to take, and PR-n puts that standing with the owner and the admin). A plain member is not notified — asserted.

### The one coupling this introduces

The 30-day window is now stated in **two** places: `compliance_state()` (00623) and `compliance_document_state()` (00630). Both also carry R-BF's transitive supersession walk and the `cardinality(blocks) > 0` gate. **If one moves the other must move with it.** Both function COMMENTs say so. Not collapsed into one primitive because grafting `compliance_state()` onto a per-row function would turn one recursive walk per holder into one per paper, on a function W1b reviewed across ten rounds.

### What the seeded book would be told

| Paper | Holder | Expires | State |
|---|---|---|---|
| `d0e5…0006` `coi_gl` | Northgate Electric (F-11) | 2026-03-31 | `lapsed` |
| `d0e5…0034` `coi_gl` | Ostrom Builders | 2025-12-31 | `lapsed` |
| `d0e5…0015` `coi_gl` | Lakeshore Painting Co. | **2026-10-08** | `lapses_soon` |

**36** papers in total: 9 `current`, 24 `held`, 2 `lapsed`, 1 `lapses_soon` (re-measured at HEAD, r21 — `count(*) FROM studio_compliance_documents` = 36; the four-way breakdown was right and the total was not, and the seed's dates are relative, which is why Lakeshore reads 2026-10-08 today). The seeded studio holds 1 owner + 1 admin, so the nightly run there writes **3 notices and 6 in-app notifications** — measured, see §10.6. F-11's March lapse — the fixture's whole motivating case — is the first thing it says.

---

## 3. The bid fields (00631)

### Columns on `project_parties`

| Column | Type | Constraint |
|---|---|---|
| `bid_due_at` | `date` | — |
| `bid_outcome` | `text` | `IN (asked, quoted, selected, declined, no_response, withdrawn)` |
| `bid_valid_until` | `date` | `>= bid_due_at` when both are set |
| `bid_quoted_by_person_id` | `uuid` → `studio_contacts` ON DELETE SET NULL | `assert_party_bid_quoted_by()` |
| `bid_amount_cents` | `integer` | `>= 0` |
| `bid_asked_at` | `date` | — |
| `bid_quoted_at` | `date` | — |
| `bid_selected_at` | `date` | — |

EIGHT columns, not five — `00631:53-62` (corrected, r4 M-2: the three dated
columns R-R's roster line reads, "Quoted 2 October 2026. Selected 9 October
2026.", were missing from this table and from both halves of the backfill
table below while the backfill writes two of them).

Plus `idx_project_parties_bid (project_id, bid_outcome) WHERE bid_outcome IS NOT NULL` — the Bidding band's read.

**`date`, not `timestamptz`:** every dated fact already on this seat is a `date` (`on_site_from`, `on_site_to`, `off_job_at`, `warranty_until`, 00624), and the Call Sheet prints "Due 5 October 2026", never a clock.

`assert_party_bid_quoted_by()` is 00624's R-AP shape for one pointer: the card must be a **person**, in the studio `project_tenant_org()` resolves for the job, and not merged away — `party_bid_quoted_by_project_has_no_studio` / `_other_studio` / `_not_a_person` / `_merged_away`.

### The backfill, and what it refuses to guess

Sources: `trade_rfq_requests` (party_id, status draft|sent|responded|closed) and `trade_scope_bids` (party_id, amount_cents, status quoted|selected|withdrawn). Both name a `project_parties` id, so the join is exact.

| Written | From |
|---|---|
| `bid_outcome = 'selected' \| 'quoted' \| 'withdrawn'` | `trade_scope_bids.status`, strongest first (selected > quoted > withdrawn), then most recently noted |
| `bid_outcome = 'asked'` | `trade_rfq_requests.status = 'sent'` with no bid row |
| `bid_outcome = 'quoted'` | `trade_rfq_requests.status = 'responded'` with no bid row |
| `bid_amount_cents` | the `trade_scope_bids` row that decided the outcome |
| `bid_asked_at` | `trade_rfq_requests.sent_at::date` |
| `bid_quoted_at` | `trade_rfq_requests.responded_at`, else the earliest `quoted` bid's `noted_at` — never a `selected` row's, which is the day the NUMBER arrived (r2 B2-3) |

**Not written, and why:**

- `bid_due_at` — no source. `trade_rfq_requests` carries `timeline`, a free-text sentence ("4 weeks from award"), and no due date anywhere. Parsing prose into a date the Call Sheet then prints as fact is the guess this file refuses.
- `bid_valid_until` — no source. Nothing records how long a number holds.
- `bid_quoted_by_person_id` — no source. `trade_scope_bids` names a **party** (a seat), not the estimator at the firm.
- `status = 'draft'` — never sent; there is no bid.
- `bid_selected_at` — **not backfilled at all** (r2 B2-3). A `selected` bid row's `noted_at` is the day the number arrived, not the day the studio chose it, so the roster row would have printed "Quoted 9 Oct 2026. Selected 9 Oct 2026." over a record that says one thing.
- `status = 'closed'` — **ambiguous, left NULL**. A closed request may have been declined, gone unanswered, been withdrawn, or been tidied away after the award. The column has four words for those and the record carries none of them.

Guarded `WHERE pp.bid_outcome IS NULL`, so a rerun cannot overwrite an outcome a studio moved by hand.

**Counts:** the local database holds **0** `trade_rfq_requests` and **0** `trade_scope_bids`, so the backfill wrote **0** rows here. The migration RAISEs its own NOTICE with the per-outcome breakdown on every apply, which is the number the Strata run will report. The mapping is exercised in full by the SQL test's block 7 against hand-written rows.

---

## 4. Households (00632)

### Objects

| Object | Shape |
|---|---|
| `client_households` | `id, organization_id, designer_id, display_name, member_person_ids uuid[], primary_member_person_id, co_threshold_cents, created_by, created_at, updated_at`; CHECKs on threshold `>= 0` and a non-blank name; three indexes (designer, org, GIN on members) |
| `project_party_authority.source_household_id` | `uuid` → `client_households` ON DELETE SET NULL, partial index (`00632:333-353`). WHICH household wrote a grant, so `set_household_threshold()` moves only the grants that household is the stated source of and never a figure recorded from the agreement (r16 MAJOR-1). Added to this table at r21 — it had 0 hits in this report through twenty rounds |
| `designer_clients.household_id` | `uuid` → `client_households` ON DELETE SET NULL, partial index |
| `assert_client_household_members()` | BEFORE INSERT/UPDATE OF `member_person_ids, primary_member_person_id, organization_id` |
| `add_household_member(uuid, uuid, text, uuid) → uuid` | SECURITY DEFINER; returns the seat id, or NULL when no project is named |
| `assert_household_threshold_principal()` + `_trg` | BEFORE UPDATE OF `co_threshold_cents`; PR-n read over a CHANGE, so ERASING the figure is refused too (`household_threshold_forbidden`). The UPDATE policy's WITH CHECK can only see the new row (r1 M-4, `00632:182-218`) |
| `set_household_threshold(uuid, integer) → client_households` | SECURITY DEFINER. Writes the figure AND moves every open `money` grant the household is the stated source of, so the figure and the seats it authorised cannot drift apart; clearing it CLOSES those grants with `effective_to` rather than leaving them standing (r5 M-1, `00632:486-567`) |

`member_person_ids` is an array, not a join table — direction §7's own shape, and the posture `project_party_authority.copy_to` already takes. An array cannot carry an FK, so the trigger holds every id to a **live, unmerged PERSON card in the household's own studio** (`household_member_not_a_live_person_card`) and the primary member to one of them (`household_primary_not_a_member`).

### `add_household_member(p_household_id, p_person_id, p_role, p_project_id DEFAULT NULL)`

1. `p_role` must be `client` or `client_rep` (`household_role_invalid`) — both already in `project_parties.party_kind`.
2. Gate, stated in the body because SECURITY DEFINER bypasses the table's RLS: `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`, else `household_not_found`.
3. The card must be a live, unmerged person card in the same studio.
4. **The membership** — appended to `member_person_ids` if absent; the first member becomes `primary_member_person_id`.
5. `p_project_id IS NULL` → returns NULL; the membership alone was the act.
6. **The seat** — an existing `(project_id, studio_contact_id, party_kind)` seat is reused, else one is inserted carrying the card's name, email and phone. Idempotent — asserted.
7. **The grant** — when the household carries `co_threshold_cents` **and** the role is `client_rep`: the open `money` row on that seat, `threshold_cents` in integer cents, `source_clause = 'client_households.co_threshold_cents'`, upserted on the partial unique index `(engagement_id, scope) WHERE effective_to IS NULL`.

**PR-c pairs the figure with the member who acts on the money.** F-05 Chidi signs; F-04 Adaeze decides finishes. Writing the household threshold onto both seats would say both spouses sign money — the exact fact the household exists to split. The plain `client` seat therefore carries no money grant; asserted.

**PR-n, enforced and loud.** The money grant requires `is_org_admin_or_owner(project_party_recorded_studio(seat))` — the same resolver `project_party_authority`'s own policies use, not the caller-relative one. A caller without that standing is **refused** (`household_grant_forbidden`) rather than quietly given a seat with no authority: a silent under-grant is the failure 00624's COMMENT names. A project that records no studio raises `household_grant_project_has_no_studio` and points at R-BD.

### One narrowing of the direction's line, declared

direction §7 states the RLS as `is_studio_comember(designer_id)`. **Shipped with the tenant leg beside it** — `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)` — on all four policies, plus PR-n's owner/admin gate on any write carrying `co_threshold_cents`, and owner/admin on DELETE. Reason: w1b final review r5 MAJOR-3 established that `is_studio_comember()` alone is true whenever the caller shares **any** active organization with the designer of record, so a second studio that designer also works for would read every household's money figure. `project_party_authority` (00624) took the tenant leg for exactly this reason and a household threshold is the same fact one level up. Flagged here rather than done quietly.

---

## 5. The decision court (00633)

`client_decisions_court_check` widened from 7 words to 11: `designer, client, gc, vendor, sub, installer, receiver` (00212/00281) **plus** `architect, engineer, inspector, lender`.

Purely additive — a widened CHECK admits a strict superset, so every live row stays valid. Local ledger: 6 rows, all `court = 'client'`.

00281's survey re-run before writing the file and unchanged: no court-consuming read model carries a hardcoded pivot. `coordination_court_summary` is `GROUP BY project_id, court`; `document_state` filters `court = 'designer'` (`items_in_your_court`) or on status alone (`open_items_count`), so the new courts fold into the open count; `margin_items`, `task_blocked_state` and `room_scan_documents` pass court through as a payload column.

**`project_tasks.owner` is deliberately NOT widened.** 00281 moved the two together because its five new kinds were seats that could own a task as well as hold a decision. These four are not: an architect, an engineer, an inspector and a lender answer, certify, pass or release — they are the court a decision waits in, never a party the studio assigns a task to. direction §7's P2 row names `client_decisions.court` and nothing else.

---

## 6. R-BD — the studio_id backfill, and `project_consent_org()`

### The backfill (00628)

One rule: a studio-less project takes the studio its **designer of record** actively and unambiguously belongs to. The predicate is `project_tenant_org()`'s own second leg with the caller legs removed — `organization_members` active, `role <> 'guest'`, `organizations.type = 'design_studio'` and `status = 'active'`. Exactly one candidate, or nothing: **zero and several both stay NULL**, because R-BD says ambiguous ones are listed, not resolved, and 00563's tie-break exists only inside the proposal-activation bridge where a proposal names its own relationship.

The shipped `set_project_studio_id()` trigger (00317) is **not** bypassed: the UPDATE fires it, it sees `NEW.studio_id` already set and takes its `v_postgres_migration` return after its immutability checks. Its own derivation carries one extra predicate — `has_designer_domain_role(designer_id)` — which this file deliberately does not, because the population being repaired is the one whose tenancy the access gates need, and a designer of record whose `designer` domain role was never granted still owns a job whose seats, site access card and authority grants must resolve a tenant. That delta is counted and printed.

Idempotent: `WHERE studio_id IS NULL`.

### Counts

On a fresh `supabase db reset` the migration runs **before** the seeds, so there are no projects and it stamps 0. Measured against the **seeded** database (which is the shape the Strata run will meet):

| | |
|---|---|
| projects, total | 8 |
| with `studio_id` | 3 |
| `studio_id IS NULL` | **5** |
| … whose designer holds **0** active design-studio memberships | 0 |
| … whose designer holds **several** (ambiguous, stays NULL) | **5** |
| … of those, carrying seats (R-BI's population) | **0** |
| projects whose designer holds no `designer` domain role | 0 |

All five local studio-less projects belong to `designer@patina.dev`, who owns two design studios (`5d1a76b1-…` and `b0000000-…-0001`) — precisely the ambiguity w1b final review r6 MAJOR-1 walked. **Locally the backfill repairs nothing**, and that is the correct answer; the number that matters is the one 00628's NOTICE prints on Strata, which the W7 preflight is owed. Because none of the five carries a seat, R-BI's duplicate-identity hazard is not live on this database.

The migration prints, on every apply:

```
00628 R-BD backfill: N project(s) still studio_id IS NULL (A with no active
design-studio membership, B with several); C of those carry seats (R-BI);
D stamped project(s) have a designer with no designer domain role
```

The SQL test (block 6) builds both cases synthetically — one designer with exactly one membership, one with several — with `set_project_studio_id` temporarily DISABLED, because that trigger now derives `studio_id` on INSERT and on UPDATE, so the legacy shape being repaired can no longer be written through it. It asserts the lone job is stamped, the ambiguous one stays NULL, and that after the stamp `project_recorded_studio()` and `project_consent_org()` both answer the same studio.

### `project_consent_org()` — what changed: **nothing, and here is the enumeration**

The brief asks that every remaining `project_consent_org()` caller be grafted onto `project_tenant_org()`. Enumerated on a freshly reset database (`pg_proc.prosrc`, `pg_get_viewdef`, `pg_policy`) there are **twelve**, and **every one is the consent ledger's key**, not a guard and not a reducer over rows:

| Kind | Object | The call |
|---|---|---|
| function | `_site_request_consent_granted_dispatch` | `project_consent_org(pp.project_id) = NEW.organization_id` — matching the record |
| function | `fc_dispatch_court_assignment` | `channel_consent_status(project_consent_org(…), 'sms', phone)` |
| function | `fc_dispatch_task_assignment` | same |
| function | `identity_phone_numbers` | the studio-less disjunction, already carrying `project_tenant_org()`'s membership leg beside it as a SET (00626:1069-1077, R-AK) |
| function | `refuse_legacy_consent_write` | `channel_consent_status(project_consent_org(OLD.project_id), …) = 'opted_out'` — R-AX's phone freeze |
| function | `site_request_dispatch_after_consent` | `channel_consent_status(project_consent_org(…), …)` |
| function | `site_request_resend` | same |
| function | `site_request_send` | same |
| view | `field_activity_summary` | the consent word |
| view | `people_directory` | the consent word and its dates |
| view | `people_directory_seats` | the consent word |
| view | `v_project_roster` | the consent word |

**Nothing is grafted, and that is the ruling being followed rather than a gap.** `project_tenant_org()` is caller-relative by construction — 00624 §1's COMMENT says so in terms: *"it may gate access and may NEVER resolve a consent record's studio — that stays `project_consent_org()` (00594), which must read the same for every caller."* Grafting the ledger key onto it would make the same number read `opted_out` for one member and `not_asked` for another on the same seat. R-BD's own words scope the retirement to **guards and reducers**, and W1b finished that half: every RLS policy, every visibility leg and every paper/consent/seat reducer in 00624, 00625, 00626 and 00627 already resolves through `project_tenant_org()` or `project_recorded_studio()`.

After the backfill the question is largely moot for repaired rows: `project_consent_org()` is `COALESCE(studio_id, _primary_studio_for(designer))`, so a stamped project resolves `studio_id` in both functions and the `_primary_studio_for()` fallback is never reached.

---

## 7. Two pre-existing failures in the W1b suite, found and repaired

Both were introduced by **W2**, both were invisible because `ON_ERROR_STOP` aborted the suite at the first one, and neither is W3's doing. Both repairs are to the **test**, not to the product.

### 7.1 `9c` — an absolute date against a now-relative seed

`w1b_…_test.sql:1931` asserted `expires_at = '2027-08-14T00:00:00+00'`. W2 round 4 (`2f4964494`, "seed dates") made `people_crm_dev.sql:788-793` shift every Okonkwo window by `(CURRENT_DATE - DATE '2026-10-20')` so the fixture reads as "this week" whenever it is seeded. On 2026-09-13 that is −37 days, so the seat's `on_site_to` is 2027-07-07 and the grant ends 2027-07-08. The literal could only hold on 2026-10-20.

Repaired by stating the **rule** instead of the date: the expectation is now derived from the seat's own window (`max(on_site_to, warranty_until)::timestamptz + interval '1 day'`, which is 00627:580-584's expression), with a second assertion that the grant did **not** take the 90-day default. PR-d's claim is now tested more tightly than the literal tested it, on every day.

### 7.2 `13h` — an over-broad predicate catching the TEAM branch

`13h` asserted that a co-member of another tenant reads no Directory row with `role <> 'contact'` on the seeded projects. It returned **2** rows: `Leah Hartwell` and `Studio Manager`, from the **TEAM** branch — which 00626 carries **verbatim** from 00594:1389-1429 and which r5/r6's tenant work deliberately did not touch. W2 round 1 (`5a4e7f650`) added `project_team_members` rows to `people_crm_dev.sql` (the seed had held zero, which is why the line passed before), and from that commit the predicate started sweeping a branch its own error message does not name.

Reproduced with **00626's own view body** restored over W3's, so it is not the `merged_into` filter.

Repaired **first** by narrowing the predicate to `role NOT IN ('contact', 'team')` — and **reverted to `role <> 'contact'` in r7 (M-3)**. The narrowing was written under a comment saying the TEAM branch's gate was still `is_studio_comember(designer)` alone and that the leak was REPORTED rather than changed; §7's own correction below records that the tenant leg SHIPPED in the same wave (`00629:2376-2380`), so both halves of that comment had stopped being true and a cross-tenant visibility narrowing was left with no assertion anywhere. Measured with the original predicate against the shipped view: **0 rows**, and 0 `team` rows anywhere for that caller. The assertion is back, and the test's comment now describes what the file does.

### The finding that WAS fixed, corrected on the record (r4 M-2)

**`people_directory`'s TEAM branch was gated on `is_studio_comember(designer)` alone, and W3 gave it the tenant leg.** A co-member of the designer of record through a *second* studio read the working studio's teammate names, their `job_title` / `staff_role` and the project id from it. No consent word, no money, no site access, no seat row — those all took the tenant leg in W1b.

This section, §10.1 below, and 00629's own §6 banner each said the change had been **deferred**, and a code-only diff of the 00626 and 00629 view bodies returns **two** deltas, not one: the CONTACTS branch's `AND sc.merged_into IS NULL`, and a full tenant leg on the TEAM branch at `00629:1758-1768`. The narrowing shipped in this wave. It is stated here as **a change made, not a question parked**: `AND ( is_active_studio_member(project_tenant_org(tm.project_id)) OR pj.designer_id = auth.uid() OR pj.lead_designer_id = auth.uid() OR pj.created_by = auth.uid() )`, written exactly as every other branch writes it (R-BD).

**What Fable still owes a word on** is only whether that narrowing is the product answer — it changes who reads a studio's teammate names — not whether it is in the build. It is.

---

## 8. Gates

| Gate | Result |
|---|---|
All re-run at HEAD on 2026-09-15 (r21). Figures below are that round's.

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (migrations + all seeds incl. `people_crm_dev.sql`) | clean — "Finished supabase db reset on branch main." Ledger head `20260910152111`; the wave's highest hand number is **`00634`** |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | **All W1a assertions passed.** |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | **All W1b assertions passed.** (26 blocks) |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | **W3 SQL suite: all blocks passed** — **21 numbered blocks, 13f last** |
| 00634's trigger, from `pg_get_triggerdef` | `AFTER UPDATE OF off_job_at … WHEN ((old.off_job_at IS NULL) AND (new.off_job_at IS NOT NULL) AND (NOT ((COALESCE(new.bid_outcome,'') = 'withdrawn') AND (COALESCE(old.bid_outcome,'') <> 'withdrawn'))))` — the R-BS clamp, read back off the catalog |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` (the 301-insertion figure was the wave's FIRST run; there is nothing left to add) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | clean (shared-package edits) |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + **2767** replayed statements" (the +168 / 2752 figures were the wave's first run) |

### The generated-types diff, in full

New tables: `client_households`, `studio_compliance_notices`, `studio_contact_merges`.
New functions: `add_household_member`, `set_household_threshold` (r5 M-1), `archive_studio_contact`, `compliance_document_state`, `merge_studio_contacts`, `resolve_merged_contact`, `restore_studio_contact`, `sweep_compliance_expiries`.
New columns: `studio_contacts.merged_into`; `project_parties.bid_due_at / bid_outcome / bid_valid_until / bid_quoted_by_person_id / bid_amount_cents / bid_asked_at / bid_quoted_at / bid_selected_at` (**eight**, r4 M-2); `studio_compliance_notices.expires_on` (r5 M-3); `designer_clients.household_id`.
New FK entries: `studio_contacts_merged_into_fkey`, `project_parties_bid_quoted_by_person_id_fkey`, `designer_clients_household_id_fkey`.
**Nothing removed, nothing retyped.**

---

## 9. RPC signatures, one list

```
public.merge_studio_contacts(p_survivor uuid, p_merged uuid, p_matched_on text)
  RETURNS uuid                      -- the survivor's id
  SECURITY DEFINER · search_path=public · EXECUTE: authenticated, service_role
  REVOKE ALL FROM PUBLIC, anon

public.resolve_merged_contact(p_contact_id uuid)
  RETURNS uuid
  SECURITY INVOKER · STABLE · EXECUTE: authenticated, service_role
  REVOKE ALL FROM PUBLIC, anon

public.archive_studio_contact(p_contact_id uuid)
  RETURNS timestamptz               -- archived_at
  SECURITY DEFINER · search_path=public · EXECUTE: authenticated, service_role

public.restore_studio_contact(p_contact_id uuid)
  RETURNS timestamptz               -- NULL
  SECURITY DEFINER · search_path=public · EXECUTE: authenticated, service_role

public.compliance_document_state(p_document_id uuid)
  RETURNS text                      -- superseded|held|current|lapses_soon|lapsed
  SECURITY INVOKER · STABLE · search_path=public · EXECUTE: authenticated, service_role

public.sweep_compliance_expiries()
  RETURNS jsonb                     -- {scanned, notices, notified} | {skipped:true}
  SECURITY DEFINER · search_path=public · EXECUTE: service_role ONLY
  REVOKE ALL FROM PUBLIC, anon, authenticated

public.add_household_member(p_household_id uuid, p_person_id uuid,
                            p_role text, p_project_id uuid DEFAULT NULL)
  RETURNS uuid                      -- the seat id, or NULL when no project
  SECURITY DEFINER · search_path=public · EXECUTE: authenticated, service_role
  REVOKE ALL FROM PUBLIC, anon

public.set_household_threshold(p_household_id uuid, p_threshold_cents integer)
  RETURNS public.client_households  -- r5 M-1: the figure AND the grants it sources
  SECURITY DEFINER · search_path=public · EXECUTE: authenticated, service_role
  REVOKE ALL FROM PUBLIC, anon

public.contact_rule_blocks_contact(p_channels_forbidden text[],
                                   p_route_to_person_id uuid)
  RETURNS boolean                   -- 00629; R-BL's hard-block predicate
  SECURITY INVOKER · search_path=public · EXECUTE: authenticated, service_role
  REVOKE ALL FROM PUBLIC, anon
  -- listed at r21 (r21 MAJOR-3). NOTE, carried from r21-n2: the function has no
  -- caller on the branch, and 00629's COMMENT says the merge refuses on it while
  -- the merge actually refuses on subsumption.
```

Trigger functions (no grant to anyone; `REVOKE ALL FROM PUBLIC, anon, authenticated`):
`assert_party_card_not_merged()`, `assert_party_bid_quoted_by()`,
`assert_client_household_members()`, `assert_household_threshold_principal()`
(r1 M-4, 00632), `clear_compliance_notices_on_date_change()` (r5 M-3, 00630),
`sync_person_affiliation_from_pointer()` (00592, amended by r7 M-2),
`project_parties_touch_updated_at()` (00631 — the `updated_at` trigger's real
body; the file's own prose still names `update_updated_at_column`, r20-n3),
and `end_party_authority_at_seat_close()` (00634 — **SECURITY DEFINER**,
`search_path=public`, EXECUTE revoked from PUBLIC, `anon` and `authenticated`;
it is the one trigger function in the wave that states an authorisation gate in
its own body, because a definer bypasses the RLS of the table it writes).
Both were absent from this list through twenty rounds (r21 MAJOR-3).

---

## 10. Not done, and owed

1. **The TEAM-branch tenant leg** (§7) — **MADE, not owed** (corrected r4 M-2). The narrowing is in `00629`'s view body; what is owed to Fable is a ruling on whether narrowing who reads teammate names is the product answer, with the change already on the file.
2. **The 30-day window is stated twice** (§2). `compliance_state()` and `compliance_document_state()` must move together. A later wave could collapse them; doing it here would re-open a function W1b reviewed ten times.
3. **`bid_due_at` and `bid_valid_until` are empty everywhere** after the backfill, by design (§3). The Bidding band's "Due 5 Oct 2026" only prints once a studio types it or a future RFQ rail records it.
4. **No portal surface** was built *by this migration lane*. W3's data lane is migrations only: no hooks, no components, no `@patina/types` additions. Corrected (r4 M-2): the merge sheet (direction §8 P2 "Compare & merge") and the travel-list picker are **not** owed to W4 — R-BM rules the bring-forward travel list **W3 scope**, and both shipped in this wave's portal lane (`components/document/people/compare-merge-sheet.tsx`, `components/document/roster/travel-list-pane.tsx:44-56` beside `rolodex-picker.tsx`'s multi-select and "Put back"). The Bidding band's dates and the household editor shipped in the same lane. What is genuinely owed to W4 is what the wave's own build sheet names, not this list.
5. **The Strata numbers for R-BD are unmeasured.** Locally 5 studio-less projects, all ambiguous, none carrying seats. 00628's NOTICE prints the real counts at deploy; the W7 preflight is owed them beside 00624's own preflight SELECT.
6. **`sweep_compliance_expiries()` HAS now been run against the seeded book** (corrected r21 MAJOR-3 — this item claimed the opposite through twenty rounds). Review round 20's `probe-r20-c` ran it, and it was re-measured at HEAD on 2026-09-15: the first call answers `{"scanned":3,"notices":3,"notified":6}` and an immediate second call answers `{"scanned":3,"notices":0,"notified":0}`, leaving 3 notice rows — so §2's table is a MEASURED result, not a projection, and the sweep is idempotent within one run window. It has still never been left committed on a local book outside a review probe, which is the only part of this item that stands.
7. **The cron registry COMMENT is the only exception-swallowing block in 00630**, exactly as in 00574: the `EXISTS` guard on `cron.unschedule` and the bare `SELECT cron.schedule(...)` are unwrapped, so a stack that cannot schedule the sweep fails the migration rather than applying it with the nightly job silently absent. The SQL test asserts `cron.job` carries `compliance-document-expiry-sweep` at `0 6 * * *`; the deploy should re-check it on Strata.
