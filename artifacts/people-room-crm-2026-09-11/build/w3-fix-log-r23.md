# W3 (P2) — fix log, round 23

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. NO MIGRATION MINTED** — R-BS: the remaining
fixes edit `00628`–`00634` in place.

Four findings assigned this round — `r23-MAJOR-1`, `r23-MAJOR-2` (migrations review) and
`r23-major-1`, `r23-major-2` (code review). All four fixed. `w3-review-r23-qa.md` returned CLEAN
(zero blocking, zero major), so nothing from the QA lane was in scope and nothing else was touched.

---

## r23-MAJOR-1 — `merge_seat_authority_collision` named the repair that closes the LIVE seat

**Fixed.** Shape 1 of the two the review left open: make the sentence match the shape the gate
actually catches. Shape 2 (give the room an "End this grant" act on the seat line) is not taken —
it is a new PR-n-gated writing surface, and this wave has none.

### What the gap was

The refusal fires on the asymmetric pair R-BS's clamp creates: one OPEN crew seat carrying no
grant, beside one seat dated by "They withdrew" that still carries an open grant. Both the HINT
(`00629`) and the two portal sentences (`use-studio-contacts.ts`) said **"Close the seat that is
still open"** — the live seat. Taking the refusal at its word lifts the gate by ending what the
LIVE seat carried, takes a working sub off the job, and leaves the surviving identity signing for
$2,500 on a seat that left it: the standing grant the refusal was about, untouched.

### The premise the fix rests on, measured

The pair that reaches this gate is **never two open seats**: `merge_seat_collision` is the same
join with `off_job_at IS NULL` on both legs and it raises FIRST. So at least one of the two has
left the job, and a seat that has left qualifies here only through an open grant. The repair is
therefore always the DATED seat's — put it back in the bidding (R-BR clears `off_job_at` and
`off_job_reason`), then close it by hand so 00634 ends what it carried — and that one act covers
both the asymmetric shape and the both-dated shape. The act the refusal used to imply elsewhere,
"Revoke on its grant", is confirmed to have no door: `useSetPartyAuthority` is called only from
`add-person-sheet.tsx:295`, nothing passes `effectiveTo`, and `access-grant-list.tsx`'s Revoke is
the field-link rail. That claim is struck from `00629`'s own comment.

### What changed (all in place, no new migration)

**`supabase/migrations/00629_studio_contact_merges.sql`**

* The fourth pre-check's SELECT gains a `CASE` naming which side holds the seat that left, into a
  new local `v_money_side` (`merged` / `survivor` / `both`); `DETAIL` becomes
  `'<job> · <party_kind> · <side>'`.
* The HINT is rewritten and branches on that side: *"…Put THAT seat back in the bidding, then close
  it by hand — closing a seat ends what it carried — and merge. Closing the seat that is still open
  ends only what that one carried and leaves the standing grant standing."* (and, where both have
  left, *"Put one of them back in the bidding…"*).
* The carve-out's own comment block states why the act is the dated seat's, including the proof
  that two open seats cannot reach this gate.
* `merge_seat_collision`'s comment no longer offers "Revoke on its grant" as an alternative repair;
  it records that no such door exists.
* The banner's lineage and `COMMENT ON FUNCTION merge_studio_contacts()` both record the amendment
  and the DETAIL's third word.

**`packages/supabase/src/hooks/use-studio-contacts.ts`** — `MERGE_REFUSAL_SENTENCES
.merge_seat_authority_collision` and the DETAIL-aware branch of `asMergeError()` now name the same
act, and the branch reads the third DETAIL word so the sentence can point at "the card you are
keeping" / "the card you are folding in" (and at "one of them" where both have left). The map's doc
comment reads **fifteen** (it said fourteen).

**`supabase/tests/people/w3_merge_sweep_household_test.sql`**, block `13d` — the DETAIL assertion
is now `'W3 test job · sub · merged'`; `13d-u4` pins the new repair sentence and a new `13d-u5`
refuses a HINT that prescribes closing the live seat. The repair WALK is the one the sentence names:
the dated seat goes back in the bidding, then is closed by hand (`13d-w0`, `13d-w1`), the live crew
seat is asserted still open and still signing (`13d-w1b`), and after the fold the one live figure is
asserted to stand **on an open seat** (`13d-x1b`), the retired $2,500 ended on the day of the close
(`13d-x2`, R-BN) and the live $10,000 still open (`13d-x3`).

### Gates

* `pnpm … supabase:reset` — clean, "Finished supabase db reset on branch main."
* `w3_merge_sweep_household_test.sql` — "W3 SQL suite: all blocks passed" (13d notice rewritten).
* `w1a…` / `w1b…` — "All W1a assertions passed." / "All W1b assertions passed."
* `db:generate` — no diff. `generate-legacy-grants.py` — no diff (baseline + 2767 statements).
* `@patina/supabase` vitest `people-crm-w3.test.ts` — **66 passed**, including the three new
  expectations (merged / survivor / both) and a negative pin on the old wording.
* `@patina/supabase` + designer-portal `type-check` — clean. `admin-portal build` — clean.

---

## r23-MAJOR-2 — `w3-data-report.md` did not know the fourth refusal exists

**Fixed.** Measured at HEAD from `merge_studio_contacts()`'s own body:

```
RAISE EXCEPTION sites   17
distinct tokens         15   (merge_contact_not_found ×3; the other fourteen once each)
MERGE_REFUSAL_SENTENCES 15 keys
```

**`artifacts/people-room-crm-2026-09-11/build/w3-data-report.md`**

* §0's `00629` row names the fourth seat pre-check.
* §0's re-measure banner gains an r23 paragraph stating what was taken again and why.
* §1's ordered refusal list gains `merge_seat_authority_collision`; the count is restated as
  **fifteen distinct tokens over seventeen `RAISE EXCEPTION` sites**, and the parenthetical is
  corrected — the token raised from more than one branch is `merge_contact_not_found` (three
  times), not `merge_seat_collision` (raised once).
* §1 gains a section — "The fourth seat pre-check, and the premise R-BS took away" — stating the
  check, its predicate, its DETAIL, and its repair, the way §1 already states the third.
* §9's `merge_studio_contacts` entry carries the count and the DETAIL shape.
* §10 gains item 7: the refusal count is the figure a later round must re-measure first, with the
  one-line measurement, and the cron item renumbers to 8.

---

## r23-major-1 — the room report did not describe the sheet that shipped (seventh filing)

**Fixed.** `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`

* §2: **fourteen → fifteen**, with `merge_seat_authority_collision`'s clause added beside
  `merge_seat_collision` — what it catches, why R-BS makes it necessary, the third DETAIL word and
  the repair — and the measurement named (the map's length and the migration's token count,
  re-measured at HEAD in the r23 round).
* §1: the `### Changed` table gains the four files the branch changes that it never named —
  `lib/document/people-derivation.ts` (M2R-6), `lib/document/write-error.ts` (r21's two 00634
  sentences), `components/document/overlays/doc-sheet.tsx` (r19 MAJOR-1's 390 page label) and
  `components/document/roster/use-project-authority.ts` (r19 MAJOR-1's ended-with-its-seat filter),
  all four confirmed by `git diff --stat 3d65f81e4..HEAD -- apps/designer-portal/src
  packages/supabase/src`.
* §1's opening now states the round the re-measurement was taken in (r23), what it covered, and
  that the test counts below still carry their r21 measurement except the two lines re-measured
  here: `people-crm-w3.test.ts` (66, re-run) and `rolodex-picker.test.tsx` (15 → **40**).
* `packages/supabase/src/hooks/use-studio-contacts.ts:1924` — the same wrong word in the code:
  "fourteen named refusals" → "fifteen".

---

## r23-major-2 — the bring-forward picker's search denied the firm its own row prints

**Fixed.** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx`

* A module-scope `resolveFirmName(contact, row)` holds the one firm-name rule — the directory
  join's `meta.company_name` through `directoryFirmOf`, then the legacy typed column as fallback —
  and `firmNameFor` (the mini row's own resolver) now delegates to it, so the row and the search
  cannot drift apart again.
* `hits` searches `resolveFirmName(c, wordsByCard.get(c.id))` and **every** trade from
  `tradesOfCard(c, firmCardById)` — the same resolver the trade chip uses — beside the name, the
  legacy `company_name` (kept as a fallback term) and the prior job names. Deps gain `wordsByCard`
  and `firmCardById`.
* The file's own comment at the book read said the search already covered the firm; it now says
  what the search actually reads, and names the finding.

**`…/__tests__/rolodex-picker.test.tsx`** — two pins (15 → 40 tests in the file): a carded human
with NULL `company_name`, NULL e-mail and a firm resolved only through the directory row is found
by typing the firm ("Northgate") and by typing the trade that lives on the FIRM's card
("electrical"), with a control row that must not match; and a book that really did type a firm name
onto the person's own card still matches it.

**Measured both ways.** With the search's terms reverted to `full_name / company_name / email`, the
new test fails at the first assertion (`Unable to find an element with the text: Dana Kowalski`);
with the fix, the file runs **40 passed**. The picker's placeholder — "a name, a company, a
trade…" — is now true.

### Gates

* designer-portal `type-check` — clean; `admin-portal build` — clean (shared-package edit).
* jest `rolodex-picker.test.tsx` — 40 passed; `compare-merge-sheet.test.tsx` — 17 passed.
* No dev server started, no port taken, no Playwright run.
