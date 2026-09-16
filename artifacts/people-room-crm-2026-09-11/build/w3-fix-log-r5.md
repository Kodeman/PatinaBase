# W3 (P2) — fix log, round 5

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `76c715bcb`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Migrations **00629**, **00630** and **00632** edited in
place (the 00621–00633 block is unapplied on Strata). **No migration minted** — nothing here needs
a number above 00633, and 00595–00620 stay reserved to the hour-tracking program.

Nine findings handed back, four of them the same defect reached twice by two reviewers
(`B-1` = `B-1-person-merge`; `M-1` = `M-1-household-figure-drift`; `M-2` =
`M-2-merge-partial-rule`; `M-4` = `M-4-merge-into-archived`), so **five distinct fixes**: B-1, M-1,
M-2, M-3, M-4. All closed; nothing else changed. Rulings re-read and named where they bear:
**PR-o**, **PR-c**, **PR-n**, **PR-h**, **R-BL**, **R-S**, **R-AY**, **R-BD**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay, head `00633` (the CLI telemetry `EPERM` needed `dangerouslyDisableSandbox`, as every round before — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (now with **block 9**, and block 8 re-stated for M-2) | rc=0 — "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | +18 lines — the two new functions' REVOKE/GRANT statements; regenerated and committed |
| `SUPABASE_DB_URL=… pnpm db:generate` | +24 lines — `studio_compliance_notices.expires_on` and `set_household_threshold`; no other shape moved |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0 (shared-package edit) |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2876 tests, all green** (2874 before; +2 new) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |
| `npx eslint` on the two touched designer files | clean |

No e2e run: the brief forbids starting a server this round. `apps/designer-portal/e2e/people/merge.spec.ts:172`
asserts only the announcer's prefix ("Two cards are now one"), which is unchanged, so no e2e edit
is owed by the announcer rewrite.

---

## B-1 (+ B-1-person-merge) · every typed fact travels, on both entity kinds

**Fix (a), the reviewer's first preference.** `00629` now COALESCEs the absorbed card's
`studio_verdict` (with `studio_verdict_at`, as a pair), `legal_name`, `dba_name`, `company_kind`,
`remit_to`, `retainage_bps`, `tax_id_last4`, `w9_on_file_at`, `warranty_until` and `notes` onto the
survivor exactly as `profile_id` and `email` already were — the survivor's own value wins, none is
identity-bearing. `trades` and `specialties` are NOT NULL arrays with no NULL to coalesce, so they
are **unioned** (the survivor's own order kept, only unseen values appended): that is the only
shape under which nothing is dropped, and it is what one firm carded twice actually means.

The statement sits in the **shared path**, above the `v_cross` branch and beside the login/address
block, so it covers the firm fold *and* the person fold — the QA review's point that a firm-only
fix would leave Leah's literal scenario broken.

Measured, block 9, fresh reset, rolled back:

```
firm fold   survivor "R5 Ostrom Blank" (older, PR-o's pre-pick; holds notes + trades{siding})
            absorbed "R5 Ostrom Typed" (verdict, remit_to, retainage 1000, tax_id 4417,
                                        legal_name, dba, w9, warranty, notes, trades{framing},
                                        specialties{millwork}, company_kind)
AFTER       verdict + verdict_at        travelled
            remit_to / retainage_bps / tax_id_last4   travelled
            legal_name / dba_name / company_kind / w9_on_file_at / warranty_until  travelled
            notes        = "The survivor's own note."   (COALESCE: the survivor's stands)
            trades       = {siding, framing}            (UNION: neither card's is lost)
            specialties  = {millwork}
            people_directory rows for the survivor: 1

person fold survivor "R5 Wren Older" (blank), absorbed "R5 Wren Newer"
AFTER       studio_verdict "Excellent. Always on time."
            notes          "Owner-operator. Repeat sub."
            specialties    {electrical}
            warranty_until 2027-06-01
```

The two derived faces the finding named now read the carried values off the survivor's own columns
with no further change: `company-card.tsx:922`'s Payee region (`remit_to`, `tax_id_last4`,
`retainage_bps`) and `company-card.tsx:1056`'s Verdict region.

**And the third face.** The announcer said `"<survivor> carries everything <merged> held."`, which
was false of thirteen columns and is still not quite true of a fact both cards hold. It now reads
`"Two cards are now one. <survivor> carries what <merged> held, and where both cards said
something, <survivor>'s own words stand."` — and because that choice is the studio's, the sheet's
comparison table now prints the eleven typed facts beside the nine it already compared
(`carriedRows()`), **only where a card actually holds one**, so two thin duplicate cards still show
the same nine rows they did. The consequence sentence above the act says the same thing in the
room's voice.

Files: `supabase/migrations/00629_studio_contact_merges.sql` ·
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx` ·
`apps/designer-portal/src/components/document/people/__tests__/compare-merge-sheet.test.tsx`
(announcer assertion updated; two new cases) · `supabase/tests/people/w3_merge_sweep_household_test.sql`
(block 9).

---

## M-1 (+ M-1-household-figure-drift) · the figure and the seats it authorised move together

**Fix as ruled:** the threshold write goes through a new RPC. `set_household_threshold(uuid,
integer)` (`00632` §4) writes `co_threshold_cents` **and** moves every open `money` grant the
household is the stated source of — a `client_rep` seat of one of its own members carrying
`source_clause = 'client_households.co_threshold_cents'`. A grant the studio re-sourced by hand is
left alone; the plain `client` seat never carried the figure (PR-c splits the spouses on exactly
this). PR-n is enforced twice and **refuses rather than skips** both times: once on the household's
own org for the figure, and once per seat on the studio the **project records**
(`project_party_recorded_studio()`), which is the resolver `project_party_authority`'s own policies
use — a silent under- or over-grant is the failure 00624's COMMENT names.

**Erasing the figure closes those grants** (`effective_to = CURRENT_DATE`) rather than mirroring
the NULL: a money grant with a NULL `threshold_cents` reads "Signs money." with **no cap** (00624),
so mirroring would widen unlimited signing authority out of an act that took a limit away, and
leaving 250000 standing is the drift this fix exists to close. 00624's own shape for ending a
delegation is a row, not an edit, and PR-n already tells the studio the figure is "the principal's
to set, and the principal's to take away".

`useSetHouseholdThreshold` calls the RPC instead of a bare `.update()`, and now invalidates
`partyAuthorityKeys.all`, `peopleSeatKeys.all` and `peopleKeys.all` beside the household keys,
because the grants moved with the figure and every seat-authority reader is stale.

Measured, block 9, on block 3's own seeded seat:

```
BEFORE          grant money | 250000 | client_households.co_threshold_cents
plain member    set_household_threshold(…, 500000)  -> household_threshold_forbidden (PR-n)
owner           set_household_threshold(…, 500000)
AFTER           household 500000   ·   grant 500000        <- moved
re-sourced      source_clause = 'The agreement, clause 9.'
owner           set_household_threshold(…, 750000)
AFTER           grant still 500000                          <- not the household's to move
re-sourced back and erased: set_household_threshold(…, NULL)
AFTER           0 open money grants; the closed row carries an effective_to
```

Files: `supabase/migrations/00632_client_households.sql` ·
`packages/supabase/src/hooks/use-households.ts` ·
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 9).

---

## M-2 (+ M-2-merge-partial-rule) · the refusal gate is subsumption, not hard-blockedness

**Fix as ruled.** `00629`'s rule gate was `contact_rule_blocks_contact()`, which is R-BL's formula
— and R-BL rules what earns a terracotta leading rule on a face, not what may vanish in a merge.
The gate is now: **does the survivor's rule already say everything the absorbed card's rule says?**
Two legs, both about facts that disappear:

* `channels_forbidden <@` the survivor's, and
* a route the absorbed rule names is the same route the survivor's rule names — "write Rosa
  instead" is not carried by a survivor that merely forbids everything and says nothing about Rosa.

`channels_allowed` is deliberately not in the test: an allowance the survivor lacks closes nothing.
Same refusal token, same sentence, same studio act as r4 already ships
(`merge_contact_rule_conflict`). The rule left behind on the folded card is now only the reason
text and the contact hours, which forbid nothing — the file's own comment at the conditional
repoint says so.

Two block-8 cases moved as a result, and both moved **toward** the finding:

```
survivor forbids all four, absorbed forbids all four AND routes to R4 Rosa
  was: PERMITTED ("both cards block, nothing is lost")   now: merge_contact_rule_conflict
  (the route was the thing being lost; the merge stands once the survivor carries it too)

survivor allows {email}, absorbed forbids {sms}   — F-27 Ray Thao's shape
  was: PERMITTED (R-BL: not a hard block)                now: merge_contact_rule_conflict
  contact_rule_summary() on the survivor carries no "Never…" clause after the refusal
  (the merge stands once the survivor's own rule forbids sms too)
```

Files: `supabase/migrations/00629_studio_contact_merges.sql` ·
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 8 re-stated, with a positive
control on each side of the new line).

---

## M-3 · a corrected expiry announces again

**Both of the reviewer's named fixes, because the first alone does not close the measured repro.**

1. The idempotency key is now `(document_id, state, expires_on)` — the notice row carries the date
   it was about (new NOT NULL column, backfilled and idempotent for an existing shape). That
   answers the ordinary correction: a mistyped 2026 for 2025, or a renewal recorded by extending
   the same row, is a different sentence the studio has never heard.
2. But the repro moves the date OUT of the window and back to the **same** value, and the key then
   matches the notice already on file. So a genuine change to `expires_on` also clears that
   document's notices: `clear_compliance_notices_on_date_change_trg`, `AFTER UPDATE OF expires_on
   … WHEN (OLD.expires_on IS DISTINCT FROM NEW.expires_on)`, SECURITY DEFINER because the writer is
   an ordinary member and `authenticated` holds no DELETE on the notices table.

Nothing the studio was actually **told** is lost: `notification_log` is the record of what was
said and is untouched; this table is the sweep's idempotency ledger.

Measured, block 9:

```
sweep                                   -> 1 notice (lapses_soon), the row records expires_on
expires_on -> CURRENT_DATE + 400        -> state `current`, 0 notices left  (the trigger)
expires_on -> CURRENT_DATE + 5          (the SAME date it was first told about)
sweep                                   -> 1 lapses_soon notice, expires_on = CURRENT_DATE + 5
sweep again, nothing changed            -> still 1 notice                  (the original rule)
```

Block 2's "the second state earns its own notice" case moves the date to simulate **the clock**,
not a studio edit — `CURRENT_DATE` cannot be moved inside one transaction — so the trigger is held
off for that one statement, with the reason on the file. The studio-edit case is block 9's.

Files: `supabase/migrations/00630_compliance_expiry_sweep.sql` ·
`supabase/tests/people/w3_merge_sweep_household_test.sql` (blocks 2 and 9).

---

## M-4 (+ M-4-merge-into-archived) · a merge onto a put-away card refuses by name

**Fix as ruled, first option.** `merge_studio_contacts()` read `merged_into` and never
`archived_at`, while PR-o pre-picks the OLDER card — which is exactly the card a studio archives —
and `directoryDuplicatePairs()` buckets an archived row beside a live one. The RPC now refuses
`merge_survivor_archived` when the chosen survivor carries `archived_at`. The **merged** card's
`archived_at` is deliberately not read: folding a put-away duplicate into a live card is the
ordinary tidy this room exists for, and it is measured standing.

Restoring is the studio's own act (`restore_studio_contact()`, one press on the card), so the RPC
does not undo a putting-away nobody asked it to undo. `asMergeError()` renders the refusal as "The
card you chose to keep has been put away. Put it back on the shelf first, or keep the other card
instead.", and — because the column head read only "Keeps the card" / "Keep this one instead" — the
sheet now marks the put-away column ("Put away", `data-survivor-archived`) before the press.

Measured, block 9:

```
merge(survivor = archived card, merged = live card)  -> merge_survivor_archived
merge(survivor = live card,     merged = archived)   -> stands (the ordinary tidy)
```

Files: `supabase/migrations/00629_studio_contact_merges.sql` ·
`packages/supabase/src/hooks/use-studio-contacts.ts` ·
`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` ·
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx` (+ its jest case) ·
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 9).

---

## Not touched

Every MINOR in `w3-review-r5-migrations.md` (m-1…m-10) and in `-qa.md` / `-code.md`, and the r5
sweep-residue note (m-10), which is another session's commit on the shared local Postgres and not
W3's product. The brief named five findings; nothing else was changed.
