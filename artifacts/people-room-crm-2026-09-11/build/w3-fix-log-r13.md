# W3 (P2) — fix log, round 13

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only. No prod, no server, no port taken. **No migration minted** — 00629
is unapplied on Strata and was edited in place; 00628–00633 all still sit above 00627 and
outside the reserved 00595–00620 band.

Six findings, all major, all fixed. Nothing else touched.

---

## r13-mig-major-1 — the merge aborted with `party_studio_contact_other_studio`, the guard's third door

**Where:** `supabase/migrations/00629_studio_contact_merges.sql` (the §5 pre-check, now
two refusals), `packages/supabase/src/hooks/use-studio-contacts.ts` (`asMergeError`).

`assert_project_party_cards()` (00624) has three doors, not two. r11 pinned leg 1, r12
pinned leg 2, and leg 3 — reached where `project_tenant_org()` and
`project_recorded_studio()` BOTH answer and simply name a studio the card is not in — was
untouched. Both halves of the reviewer's fix are taken, because the second covers every
future leg and the first names the act for this one:

1. **A fourth conjunct, by name.** A second pre-check runs directly after
   `merge_seat_on_studioless_project`, over exactly the seats the merge will WRITE (11k's
   rule: the three repoints are branch-dependent, and a row nothing writes fires no
   trigger) and over the EFFECTIVE pointers the guard will judge, not today's — the
   trigger reads all three card columns of `NEW` whichever one moved. Its three legs are
   the guard's own three "other studio" tests in the guard's own order:
   `studio_contact_id` against tenant AND record, `company_id` and
   `warranty_contact_person_id` against tenant. It raises
   **`merge_seat_card_other_studio`** with the job in `DETAIL`, before the first write.
2. **A generic fallback, so no schema word can reach a face at all.** `asMergeError()`
   gained the new sentence (with the `details` leg that names the job) and, after the
   sentence table, a last resort: a message that is a bare `snake_case` token is answered
   "The merge did not go through, and nothing was changed." Prose — a Postgres message, a
   network error — still comes back as it came. That closes leg 3, the two mirror legs,
   and every other trigger the merge fires inside its one transaction
   (`designated_person_is_self`, `household_member_not_a_live_person_card`, …), which all
   fell through to `return message` into the sheet's `role="alert"` paragraph.

**Pinned by** `supabase/tests/people/w3_merge_sweep_household_test.sql` **BLOCK 11l**, in
11j's shape: studio B records the job, both duplicate cards live in studio A, one legacy
seat carries studio A's card and one carries studio A's firm card (both staged around
`assert_project_party_cards_trg`). The block asserts the fixture still reproduces (both
resolvers non-NULL — 11i's and 11j's conjuncts cannot see it), that **neither**
`party_studio_contact_other_studio` **nor** `party_company_other_studio` reaches the
caller, that the refusal is `merge_seat_card_other_studio` naming `W3 other-studio job` in
DETAIL, and that nothing was folded. Its control clears the two foreign pointers and both
folds go through.

Also pinned in `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts`: the new
sentence, the `details` variant verbatim, and a loop asserting five raw guard tokens
(`party_studio_contact_other_studio`, `party_company_other_studio`,
`party_warranty_contact_other_studio`, `designated_person_is_self`,
`household_member_not_a_live_person_card`) each render as the fallback sentence and
contain no token, while `"network request failed"` comes back unchanged.

---

## r13-mig-major-2 — a firm-duplicate fold moved `project_parties.updated_at` and flipped an uncarded identity's Directory row

**Where:** `supabase/migrations/00629_studio_contact_merges.sql` §4g (new) and §"seats".

Not `ALTER TABLE … DISABLE TRIGGER`: inside the RPC that takes ACCESS EXCLUSIVE on
`project_parties` and holds it to COMMIT, which is a worse trade than the defect. The
reviewer's second shape is taken — the `patina.suppress_affiliation_sync` treatment this
file already uses twice:

* `public.project_parties_touch_updated_at()` (new, `LANGUAGE plpgsql`, `SET search_path
  TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`) replaces
  `update_updated_at_column()` on this table only. It stands down while
  `patina.suppress_party_touch` is `'1'`.
* The trigger keeps its 00212 **name** `set_updated_at_project_parties`, so 00624:806/819,
  00626:580/591 and 00631:335/404's bracketing still names the same object. Verified on
  the reset DB: `set_updated_at_project_parties → project_parties_touch_updated_at`,
  `proconfig {search_path=public}`, ACL `postgres,service_role` only.
* `merge_studio_contacts()` sets the GUC transaction-locally immediately before the seat
  block and clears it immediately after the fourth seat repoint
  (`bid_quoted_by_person_id`), the way `app.contact_merge_in_progress` is opened and shut
  forty lines below. All four `project_parties` statements are inside the window; nothing
  else is.
* `python3 scripts/generate-legacy-grants.py` re-run after the REVOKE — 6 new statements,
  2766 replayed.

**Pinned by BLOCK 11m**, block 7d's shape over the merge instead of the backfill. Two firm
cards ("R13 Stonehaven Tile" / "… Gallery", crm-model §4 rule 4); one UNCARDED human on a
phone with two seats — the OLD one on a closed job naming the duplicate firm, 400 days
quiet, the LIVE one naming no firm, 10 days quiet.

* **11m-a** the LIVE seat is the Directory winner before anything moves.
* **11m-b** NEGATIVE CONTROL, inside a SAVEPOINT that is rolled back: the same old seat
  touched with the stamp ARMED **does** flip the Directory winner onto the closed job — so
  the fixture still reproduces r13 MAJOR-2 and 11m-c is not vacuous.
* **11m-c/d/e** the real fold: the firm pointer still repoints to the survivor (this is a
  fix about the STAMP, not the fold), `updated_at` is byte-identical before and after, and
  the Directory row keeps its `person_id` and `W3 live job`.
* **11m-f** the stand-down is NARROW: an ordinary seat edit after the merge still stamps
  `updated_at`, so the GUC did not leak past the block.

---

## r13-qa-major-1 + r13-code-major-2 — the merge consequence sentence branched on the survivor alone

Same defect, two reports (QA reproduced it live at 1440 over a fresh fixture pair, DOM
text saved to `build/qa-w3-r13/merge-consequence-r13.txt`). One fix.

**Where:** `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx`.

`mergeConsequenceSentence()` gained a fourth argument, `mergedHasRule`, and branches on
the PAIR — the discipline r11 BLOCKING-1 already applied to trades, specialties and sole
proprietor in this same sentence:

* "contact rule" appears in the moves-list **only** when the folded card carries a rule
  and the survivor does not (`ruleMoves`), which is the only case where one actually
  moves. Both the QA-reproduced mirror case (neither card carries one) and the ordinary
  duplicate (survivor carries one, fresh duplicate carries none) now read "seats, channels
  and firm designations".
* the `ruleStays` clause ("…and <folded>'s stays on the folded card as a record.") appears
  **only** when both cards carry one — it used to print beside a
  `data-compare-field="Contact rule"` column reading "No contact rule on file."

Call site `:567-571` passes `!!(mergedId && ruleIndex.get(mergedId))` beside the survivor's.

**Pinned by** `compare-merge-sheet.test.tsx`: the existing "names what moves" case now
asserts the no-rule pair does NOT name a contact rule, the existing survivor-rule case
passes both flags, and a new case walks all four combinations.

---

## r13-code-major-1 — an ARCHIVED estimator erased "Priced by …" from two faces

**Where:** `roster/roster-groups.tsx`, `roster/roster-row.tsx`,
`lib/document/roster-derivation.ts`.

The reviewer's shape, exactly: resolve the NAME from a book that includes archived cards
(`compare-merge-sheet.tsx:327-329`'s own idiom), keep the selectable OPTIONS
archived-excluded, and MARK a resolved-but-archived estimator rather than dropping the
clause.

* `RosterGroups` adds one read, `useStudioContacts(consentOrg, { includeArchived: true })`
  — its own cache entry, since `studioContactKeys.list` keys on the filters — and builds
  `bidPeople` from it carrying `archived: !!c.archived_at`. `peopleById` and
  `cardKindById` are untouched and stay archived-excluded.
* `RosterRow` resolves the recorded estimator against the whole book and passes
  `quotedByArchived` to `bidNote`, which prints
  **"Priced by Tom Marrow, whose card is put away."** instead of going silent.
* The "Who priced it" `<select>` offers live cards, PLUS the recorded/drafted estimator
  where their card has been put away, labelled "Tom Marrow (card put away)" — a controlled
  select whose value names no option renders at `selectedIndex = -1`, which is the blank
  face the finding names.

**Pinned by three new cases in** `roster-row.test.tsx`: the note keeps the clause with the
marking; the editor's select reports `value === 'card-tom'`,
`selectedIndex > -1` and options `['Nobody named', 'Rosa Delgado', 'Tom Marrow (card put
away)']`; and the negative control — a put-away card nobody recorded is NOT offered
(`['Nobody named', 'Rosa Delgado']`).

---

## r13-code-major-3 — the merge did not invalidate two roots it writes through

**Where:** `packages/supabase/src/hooks/use-studio-contacts.ts`
(`useMergeStudioContacts.onSuccess`).

Added, using the exported factories rather than hand-typed literals (imports:
`partyBidKeys` from `./use-coordination`, `clientHouseholdKeys` from `./use-households` —
neither imports this file, so no cycle):

* `partyBidKeys.all` (`['project-party-bids']`) — 00629:2254-2256 repoints
  `bid_quoted_by_person_id`, and `['project-parties']` is a different root that does not
  reach the bid read;
* `clientHouseholdKeys.all` (`['client-households']`) — 00629:2303-2311 rewrites
  `member_person_ids` / `primary_member_person_id`, including
  `useProjectHousehold`'s `['client-households','project',id]`;
* `resolvedContactKeys.all` — `resolve_merged_contact()` answers differently for both ids
  the moment the fold lands (PR-o).

With `staleTime` five minutes and `refetchOnWindowFocus: false` this was MAJOR-1's blank
face out of a cache rather than an archive.

**Pinned by** the extended `"fans out to every key a card's facts are read through"` case
in `people-crm-w3.test.ts`, which now asserts the three new roots by name and also asserts
they equal `partyBidKeys.all[0]` / `clientHouseholdKeys.all[0]`.

---

## Gates, this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | rc=0, clean replay through 00633 + every seed |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed"; **11l** and **11m** (a–f) new and passing |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` · `rls/studio_contacts_backfill_test.sql` | rc=0 each |
| `field/apply_field_effect_test.sql` · `field/field_capture_visit_test.sql` · `field/field_links_test.sql` | rc=0 each |
| `rls/field_parties_test.sql` · `field/field_capture_note_routing_test.sql` | **pre-existing** failures (`consent_legacy_column_frozen`, the 5-vs-9 policy count) — the same two w1b-fix-log-r12/r13 record as baseline |
| `python3 scripts/generate-legacy-grants.py` | re-run after the REVOKE — 6 new statements, 2766 replayed |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| trigger wiring on `project_parties`, measured | `set_updated_at_project_parties → project_parties_touch_updated_at`, `{search_path=public}`, ACL `postgres,service_role` only; no `anon`, no `PUBLIC` |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `packages/supabase` `npx vitest run` (full) | 105 files, **1340 passed / 12 skipped** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **34 passed** |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `apps/designer-portal` `npx jest src/components/document/{roster,people} src/lib/document` | 149 suites, **2941 passed** (was 2937 — three new roster-row cases, one new merge-sentence case) |
| `apps/designer-portal` `npx jest` (full) | **7666 passed**, 592/593 suites; the one FAIL is `draft-proposal-opener.test.tsx` "A jest worker process was terminated … signal=SIGSEGV" — an unrelated worker crash, re-run alone **8 passed** |
| `npx eslint src/components/document/{roster,people} src/lib/document/roster-derivation.ts` | **0 errors**, 4 warnings, all pre-existing in files this round did not touch |
| `pnpm --filter admin-portal build` | **EXIT=0**, full route table |

No server started, no port taken, no prod touched, no migration minted, no `git add -A`.
