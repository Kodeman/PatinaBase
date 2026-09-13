# W3 (P2) — fix log, round 3

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `fa199109d`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Migrations **00626**, **00629** and **00631** edited in
place (the whole 00621–00633 block is unapplied on Strata). No migration minted: every change
belongs inside a file this program already owns.

Eleven findings handed back — W3-R3-1..W3-R3-5 (migrations), 1/2/3 (QA), MAJOR-1..MAJOR-4
(code). All eleven closed; nothing else changed. Every ruling in `rulings.md` §3 re-read; R-AY,
R-AS, R-BD, R-BI, R-BJ, R-BA, R-K, R-G, R-T, PR-o, PR-h and PR-c are each named below where they
bear.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean (the CLI telemetry `EPERM` needed `dangerouslyDisableSandbox`, as in r2/r3 QA — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` | rc=0 |
| `rls/studio_contacts_test.sql` | rc=0 |
| `rls/project_roster_test.sql` | rc=0 |
| `rls/00584_studio_comember_rls_sweep.test.sql` | rc=0 |
| `sweep_compliance_expiries()` | `{"notices": 3, "scanned": 3, "notified": 6}` — unchanged; residue reset away afterwards (0 notices, 0 job_runs on the DB left behind) |
| `python3 scripts/generate-legacy-grants.py` | one line changed (the `studio_contact_merges` INSERT grant dropped); regenerated and committed |
| `SUPABASE_DB_URL=… pnpm db:generate` | byte-identical — no column or table shape moved |
| `pnpm --filter @patina/designer-portal type-check` | rc=0 |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter @patina/admin-portal build` | rc=0 (shared-package edit) |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2868 tests, all green** |
| `npx vitest run people-crm-w3.test.ts people-crm-foundation.test.ts` | 25 + 35 passed |

No probe files this round: every measurement below is an assertion added to the shipped SQL
suite, so it runs on every future reset rather than once.

---

## W3-R3-1 · BLOCKING — a merge stranded the firm's paper on the card that disappears

`supabase/migrations/00629_studio_contact_merges.sql` (the compliance block of
`merge_studio_contacts()`), `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx`,
`supabase/tests/people/w3_merge_sweep_household_test.sql` (blocks 1, 1b, 1c).

**Fixed as instructed.** The `v_heads` / `v_succs` capture and the supersede-edge pass are
untouched; what changed is that the move is no longer conditional on earning an edge:

1. **every** absorbed head moves (`WHERE d.holder_id = p_merged AND d.superseded_by IS NULL`),
   carrying the edge it already had, which is none — so `assert_compliance_holder()` asks it no
   successor question;
2. the retired rows behind each head follow, outermost first, unchanged;
3. the supersede edge is written last, for the heads that earned one — unchanged.

That ordering is what lets the move be unconditional at all: the trigger's holder leg requires a
successor to be held for the SAME card, so a row may only move once the row it points at has.
`compliance_state()`'s worst-first reckoning then settles the word, which is the ruling the
review asked for: r1 B-1's "a merge manufactured a block the survivor never earned" is answered
by the studio's own act of declaring two cards one firm, not by hiding both a lapse and a
renewal. The sole-proprietor branch is unchanged (it already moved everything).

**Assertions added, in the suite rather than a probe** (all measured on a fresh reset):

* block 1 — the absorbed `license` with no successor now reads `holder_id = <survivor>` (was
  asserted to stay behind).
* block 1b B-1 — the absorbed certificate is still superseded by the survivor's; the absorbed
  **bond** now moves; **0** documents are left on the absorbed card; and the survivor's word is
  `lapsed`, which is the honest reckoning over both cards' paper.
* block 1b, **new** — the other direction, which is the review's own A2 case: survivor holding a
  lapsed COI, absorbed duplicate holding the current renewal. After the merge the renewal is on
  the survivor, the word still reads `lapsed` while the old certificate is unretired, and one
  ordinary member write (`superseded_by` → the renewal) takes it to `current`. That act was
  **unreachable** before this fix, because the renewal sat on a card no picker, Directory row or
  sweep can open.
* block 1c B2-2 — the absorbed bond moves; the word reads `lapsed`; the renewal chain, its edge
  and its predecessor are all as r2 left them.

**The face follows the RPC.** `mergeConsequenceSentence` said the absorbed paper "stays on
<merged>'s card and is still readable there" — true of the row and of no surface. It now reads
"…'s paper moves onto <survivor> too; where <survivor> already holds the same paper, still in
force, the older one is marked superseded." The M2R-2 jest assertion was rewritten with it.

---

## W3-R3-2 · BLOCKING — `bid_quoted_by_person_id` was checked against the CALLER's studio

`supabase/migrations/00631_project_party_bids.sql:160-200`,
`supabase/tests/people/w3_merge_sweep_household_test.sql` (new block **7c**).

`assert_party_bid_quoted_by()` takes 00624's second resolver verbatim: `v_recorded :=
public.project_recorded_studio(NEW.project_id)`, a refusal
(`party_bid_quoted_by_project_has_no_studio`, its own HINT) while the project records none, and
`AND sc.organization_id = v_recorded` beside `= v_org` on the card lookup — "THE RECORD, NOT THE
WRITER" (00624:645-655), which 00631 had reused the shape of and dropped the correction from.

**Block 7c** is the assertion the review asked for, beside block 7's three refusals. It uses the
suite's own studio-less legacy job (`W3 ambiguous legacy job`, left NULL by block 6's backfill
exactly as R-BD/R-BI require) and sets `request.jwt.claims` **without** switching role, so RLS is
not what is under test:

```
project_tenant_org()      → non-NULL (the caller-relative answer, the hole)
project_recorded_studio() → NULL
UPDATE … bid_quoted_by_person_id → REFUSED party_bid_quoted_by_project_has_no_studio
```

The fixture is checked first (both resolvers asserted) so the block fails loudly if it ever stops
reproducing rather than passing vacuously.

---

## W3-R3-3 · MAJOR — after a merge the absorbed card's number resolved to no card

`supabase/migrations/00629_studio_contact_merges.sql` (§4b `rolodex_card_for_party_phone()`),
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 1b, new).

Resolved **forward**, not excluded, as instructed. The candidate scan drops the `merged_into IS
NULL` predicate (a merged card is evidence about whose number this is), maps every candidate
through `resolve_merged_contact()`, deduplicates the heads, and then re-reads each head and holds
it to the same three facts — live, person, this studio — before the "exactly one" test. So:

* two cards one merge apart are ONE identity and answer the survivor (the case that was NULL);
* the shared-phone case §4b was written for still answers the survivor;
* two LIVE cards on one number still answer NULL — PR-o/R-Y's duplicate band, not a trigger's
  decision;
* §4's seat guard stays satisfiable by construction, because the answer is always a live card.

Measured in the suite: before the fix `+16125550922` (the absorbed card's own number, two cards
matched on **email** with different numbers) resolved to NULL and the ordinary "Add to the
roster" write landed uncarded; now it resolves to the survivor and the new seat is stamped with
the survivor. The existing B-2/M-1 shared-phone assertion is unchanged and still green.

---

## W3-R3-4 · MAJOR — the identity's consent word read `not_asked` over a recorded `opted_out`

`supabase/migrations/00629_studio_contact_merges.sql` (the channels block),
`supabase/migrations/00626_people_directory_v4_seats.sql` (`identity_phone_numbers()`),
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 1b, new).

Both halves, as instructed.

1. `merge_studio_contacts()` now upserts the absorbed card's own `phone_e164` (kind `mobile` for
   a person survivor, `office` for a firm — 00593's mapping, which `assert_channel_owner_kind()`
   requires) and its `email` (kind `email`) into `studio_contact_channels` on the survivor, with
   `ON CONFLICT (owner_id, channel_kind, value) DO NOTHING`. `sms_capable` takes 00593 leg (a)'s
   own evidence test rather than a literal, so a number nobody has texted arrives unconfirmed and
   the Reach editor asks. This is crm-model §4's "Channels union" extended over the legacy
   columns.
2. `identity_phone_numbers()` gains a third leg: the identity's own typed voice lines
   (`mobile`, `office`, `dispatch`, `after_hours`), joined on the card id, which IS the identity
   key for every carded row. The cast is guarded by a `CASE` (not a bare cast behind a regex
   predicate) because the key is a party id, a phone or an email on an uncarded row. Same-studio
   on both sides, stated on the owning card.

**R-AY holds**: no consent table, RPC or frozen `sms_consent_*` column is read or written by
either half. A channel row is an address; `channel_consent_status()` still answers per number.
The banner's "the union of channels cannot change a single verdict" is amended to say what is now
true — it cannot change a verdict, and it must change the WORD, because the reduction is
worst-first over every number the identity carries.

Measured in the suite: survivor `not_asked` + duplicate's number carrying a recorded `opted_out`
before the merge; after it, one row, `identity_phone_numbers()` answering both numbers, and
`identity_consent_status()` reading **`opted_out`** — the word R-G's Directory column, R-T's
collapsed roster row and SPEC §5.7 #4b's mini row all print.

---

## W3-R3-5 · MAJOR — the append-only lineage table was forgeable by any studio member

`supabase/migrations/00629_studio_contact_merges.sql:311-325`, `supabase/seed/00-legacy-grants.sql`,
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 1b, new).

Took the first option: `studio_contact_merges_member_insert` is dropped and the grant is now
`GRANT SELECT ON TABLE public.studio_contact_merges TO authenticated` (was `SELECT, INSERT`).
`merge_studio_contacts()` is SECURITY DEFINER and writes the row itself — its own COMMENT already
said it does not depend on the policy — and the only portal reader,
`useStudioContactMerges`, is a `.select('*')`. The table COMMENT now states the rule: SELECT is
the only member policy and the only member grant.

`python3 scripts/generate-legacy-grants.py` re-run; the one changed line is committed. Suite
assertion: a plain member's hand-written lineage INSERT is refused `insufficient_privilege`.

---

## QA finding 1 · BLOCKING — the picker never resolved a sub/gc/installer's trade, and the seat was born blank

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx`.

One resolver, `tradeFor()`, at all three call sites (`addFromRolodex`'s insert, `addPicked`'s
`picks[]`, the mini row's `trade` prop) — the same shape F1 used for the firm name:

```
own card's trades[0]  →  the linked firm card's trades[0]  →  own specialties[0]
```

The third leg keeps the vendor case that was already right (Claire Bissett's `tile_stone` really
does live in `specialties`, which is what hid this). The firm card is read from a
`useStudioContacts(org, { kind: 'all' })` map rather than from `contacts`, because a kind chip
narrows `contacts` by the PERSON's kind while a firm carries its own — Ingrid Halvorsen is a
`sub` and Halvorsen Cabinet Works is a `workroom`, so the firm drops out of the very list the
chip was set to find her in. With no chip set (the default) it is the same React Query key as the
list already read, so no extra fetch.

Confirmed on the local book that the fact is where the fix looks: Dana Kowalski / Pete Rusk /
Ingrid Halvorsen all carry `specialties {}` and `trades {}`; Northgate Electric carries
`trades {electrical}`, Rusk Mechanical `{plumbing}`, Halvorsen Cabinet Works `{cabinetry}`.

---

## QA finding 2 · BLOCKING — at 390 the picker's person-name span rendered at zero width

`apps/designer-portal/src/components/document/roster/party-mini-row.tsx`.

SPEC §6.2's row discipline, stated in the row itself: the name block takes a floor
(`min-w-[8rem] flex-1 sm:min-w-0`) so flexbox can no longer take it to zero, the name and meta
lines **wrap** instead of truncating below `sm` (`break-words sm:truncate`), and the row wraps
(`flex-wrap sm:flex-nowrap`) so the reach / consent / paper words leave the first line rather
than squeezing it away. Above `sm` — the 1440 band — every class is the one that shipped, so the
specimen row does not move.

---

## QA finding 3 · MAJOR — `bring-forward.spec.ts` still could not complete a run

`apps/designer-portal/e2e/people/bring-forward.spec.ts:107`.

`openThePicker()` now waits on the sheet, exactly as the review directed:

```ts
await expect(
  page.locator("[data-doc-sheet-title]", { hasText: "From the rolodex" }),
).toBeVisible({ timeout: 30_000 });
```

`data-doc-sheet-title` is DocSheet's own title span (`overlays/doc-sheet.tsx:161`), so the
toolbar button and its copy inside the Call-sheet-actions menu no longer match. **Not executed
this round** — the brief's gates for a portal change are the type gates and jest, and no server
was started.

---

## MAJOR-1 · Bring forward wrote a NULL firm onto every seat it created

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx`.

`picks[].companyName` is `firmNameFor(c)`, which already falls back to
`c.company_name?.trim() || null`. The single-add path (`addFromRolodex`) took the same one-line
fix: it is the path MAJOR-4's own failure scenario describes ("presses Add one to the roster"),
it writes the same column through the same guard, and leaving it would have kept the invariant
broken from the other door. Both inserts now write the firm and the trade the ROW printed.

---

## MAJOR-2 · "Open a household" minted an unfindable household, and another on every press

`apps/designer-portal/src/components/document/roster/household-band.tsx`.

The act is refused in words, per the review's first option. `householdWouldBeFindable` is
`memberCardIds.length > 0 || !!designerClientId` — the two ways `useProjectHousehold` has in —
and when it is false:

* the door renders `aria-disabled` + `aria-describedby` (never `disabled`, the room's rule) with
  the reason line always on the face: **"Seat the client on this job first, then open the
  household."**
* a press writes nothing and sets the same sentence as the error.

Nothing else moved: with a client-side seat or a resolvable `designer_clients` row, the act is
exactly as it was.

---

## MAJOR-3 · The household band and the bid editor printed raw refusal tokens

`apps/designer-portal/src/components/document/roster/household-band.tsx` (three catches),
`apps/designer-portal/src/components/document/roster/roster-row.tsx` (the bid catch),
`apps/designer-portal/src/lib/document/write-error.ts`.

All four catches now route through `writeErrorMessage(e, <fallback>)`, as `rolodex-picker.tsx`
does, so an RLS rejection reads "This studio's book is not yours to write…" instead of
`new row violates row-level security policy for table "project_parties"` — a relation name on a
face, which SPEC §8 #3 forbids by name.

`write-error.ts` gains the rest of the vocabulary those two doors can raise, each as a sentence:
`party_studio_contact_other_studio`, `party_warranty_contact_other_studio`,
`party_warranty_contact_not_a_person` (00624) and `party_bid_quoted_by_project_has_no_studio`,
`_other_studio`, `_not_a_person`, `_merged_away` (00631 — including W3-R3-2's new refusal, so the
guard added above arrives in words on its first day). The three 00624 tokens the file already
knew are unchanged.

---

## MAJOR-4 · The merge sentence promised a reachability the merge did not carry

`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx`.

Both halves of the finding are now true rather than only reworded:

* W3-R3-4 makes the absorbed card's own number and address travel, and the sentence says so —
  "…, and <merged>'s own number and address travel with them."
* the closing clause is restated as what the merge record guarantees: "<merged>'s card is kept as
  a record of the merge, **so an old link still opens this person**." The old
  "both ways of reaching this person still work" is gone, and the jest assertion asserts its
  absence.

---

## Not touched

* The six minors of the migrations review (W3-R3-6..W3-R3-10) and the fourteen minors of the code
  review — not in the handed-back list.
* `merge.spec.ts`'s own failing assertion (diagnosed in r3 QA as a test self-contradiction) — not
  in the handed-back list.
* Every ruling in `rulings.md` §3 — none contradicted. The two that came closest were re-read
  before the change: PR-o (which card survives is free) is the reason W3-R3-1 had to move the
  paper rather than keep a rule whose answer depends on the pick, and R-AY is why W3-R3-4 mints an
  address and reads no consent.
