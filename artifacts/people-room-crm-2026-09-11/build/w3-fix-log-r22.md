# W3 (P2) — fix log, round 22

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. NO MIGRATION MINTED** — R-BS: the remaining
fixes edit `00628`–`00634` in place.

One finding assigned this round: **r22-MAJOR-1**. Fixed. `w3-review-r22-qa.md` and
`w3-review-r22-code.md` both returned CLEAN (zero blocking, zero major), so nothing else was in
scope and nothing else was touched.

---

## r22-MAJOR-1 — R-BS's clamp re-opened r19 MAJOR-1 through the Bidding band

**Fixed.** Shape (a) of the three the review left open: **ask `merge_seat_collision`'s own premise
of the GRANT rather than of the seat's openness**, as a FOURTH seat pre-check beside the third.
Shape (b) is ruled out by R-BS itself (the trigger is the hand-close act's and the room has no named
re-open act to pair with a widened clamp); shape (c) alone would refuse after R-BN had already been
broken.

### What the gap was

`merge_seat_collision`'s OPEN-SEATS-ONLY carve-out justifies itself with "a closed seat … states no
second money fact — **its grant was ended at the close**" (`00629:1697-1715`), a rule 00634 makes.
R-BS then clamped 00634 off the withdrawal path, so `off_job_at IS NOT NULL` stopped implying it:
a seat dated by "They withdrew" keeps its open grants, by design, and the collision predicate —
`off_job_at IS NULL` on both legs — cannot see it.

Reproduced on the freshly reset database before the fix (the review's own
`build/probe-r22-a-withdrawal-dated-seat-merge.sql`): the fold refused while both `sub` seats were
open; **one** press of "They withdrew"; the fold **landed**; the survivor held two `sub` seats on the
Okonkwo residence with **both money grants open** at 250000 and 1000000.

### What changed (all in place, no new migration)

**`supabase/migrations/00629_studio_contact_merges.sql`**

* `merge_studio_contacts()` — a fourth seat pre-check, immediately after `merge_seat_collision` and
  before the first write. A seat is **live to the merge** where `off_job_at IS NULL` **OR** an
  `EXISTS` over `project_party_authority` finds a row with `effective_to IS NULL` on it; a pair of
  same-kind seats on one job that are both live is refused as **`merge_seat_authority_collision`**,
  `DETAIL = '<job> · <party_kind>'` (the same shape the third pre-check uses, because the repair
  cannot be taken without the job and the kind).
* Every scope, not money alone — 00634's own reach ("every open grant the seat carried — every
  scope, not money alone"). The existing `merge_seat_collision` predicate is left **byte for byte**
  as it was, so the plainer shape keeps the plainer sentence; the new gate is a strict superset.
* Two new locals `v_money_job` / `v_money_kind`, so the third check's variables are never reused.
* Banner ("TWO GUARDS THIS FILE STANDS IN FRONT OF…"), LINEAGE ("Onwards: 00634 …") and the
  `COMMENT ON FUNCTION merge_studio_contacts()` all name the fourth refusal and why it exists.
* The carve-out's own paragraph now carries the r22 note: the premise is asked directly below,
  because the trigger no longer fires on every dated seat.

**`supabase/migrations/00634_seat_close_ends_authority.sql`** — comment only, no behaviour change:
the clamp's own block states what it owes 00629 ("Changing this WHEN clause means reading that
gate"), so the two files can no longer disagree about what a dated seat means.

**`packages/supabase/src/hooks/use-studio-contacts.ts`** — the new token never reaches a face as a
schema word (r13 MAJOR-1's posture): `MERGE_REFUSAL_SENTENCES.merge_seat_authority_collision`, plus
a DETAIL-aware branch in `asMergeError()` that names the job and the kind. `useMergeStudioContacts`
already throws `new Error(asMergeError(error))` (`:2094`) and `compare-merge-sheet.tsx:469` prints
`e.message` into its `role="alert"` paragraph, so no portal edit was needed.

**`supabase/tests/people/w3_merge_sweep_household_test.sql`** — pinned **inside block 13d**, where
the review asked for it (no new block; the suite is still 21 blocks with 13f last). Two new cards
(`…d7` / `…d8`), two `sub` seats on the W3 test job, two open money grants, and five assertions:

| pin | asserts |
|---|---|
| 13d-t | the recorded withdrawal dates the seat and leaves its grant **open** — R-BS's state, the one the gate is written for |
| 13d-u | the fold is refused **`merge_seat_authority_collision`**, DETAIL `W3 test job · sub`, HINT naming the repair |
| 13d-v | the refusal writes nothing — both cards live, no merge row, no seat repointed |
| 13d-w | the repair lands: the principal's hand close on the still-open seat ends its grant (0 open), then the fold returns the survivor |
| 13d-x | after the fold **one** open money grant stands on that job counting closed seats, and the retired figure is ended, not deleted (R-BN): 1000000 ending today |

**`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts`** — the sentence and the
DETAIL-aware sentence, beside r18 MAJOR-1's.

### The repair the HINT names, measured

`build/probe-r22-fix-a-authority-collision-gate.sql` (two transactions, both ROLLBACKed, room acts
only, on the freshly reset database):

```
A1  "They withdrew" on seat …22a1  -> off_job_at 2026-09-15, grant 250000 effective_to (none)
A2  refused: merge_seat_authority_collision | DETAIL Okonkwo residence · sub | HINT One of these
    two seats has left the job but still carries a standing grant, …
A3  cards_still_live 2 · merge_rows 0                       <- the refusal wrote nothing
B   the HINT's first repair — close the still-open seat …22a2 by hand:
      grant 1000000 -> effective_to 2026-09-15 (00634 fired)
    the fold then LANDED; survivor holds ONE open grant (250000) on the job
C1  both seats dated by a withdrawal, both grants open      -> refused
C2  a hand close on an ALREADY-dated seat keeps the recorded day (r20 major-1) and does NOT fire
    00634 (its WHEN reads OLD.off_job_at IS NULL)           -> the grant stays open
C3  the room's own path — the Bidding band's correction clears the date (R-BR), then "Close this
    seat"                                                   -> grant 1000000 ends today
C4  the fold LANDED; ONE open money grant on the job
```

C2/C3 are why the HINT carries a second sentence for the both-dated case ("put one back in the
bidding first and close it by hand") rather than naming a repair that does nothing.

---

## Gates

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | rc=0 — "Finished supabase db reset on branch main." |
| `people/w1a_identity_channels_consent_test.sql` | "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | "W3 SQL suite: all blocks passed", **13f last**; 13d now reports the fourth name. Run a SECOND time against the already-run database: passes again, rc=0 |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** on `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + 2767 replayed statements" (no GRANT/REVOKE changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table printed (shared-package edit) |
| per-file `vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **66 passed** |
| migration numbering | `ls supabase/migrations | tail` still ends at `00634`; **nothing minted**, nothing in the reserved `00595`–`00620` |

No new object, no GRANT, no RLS change, no cron: the fix is one added pre-check inside an existing
`CREATE OR REPLACE FUNCTION` body, plus comments, one sentence table entry and test pins.

**Carried, not this round's to close:** the thirty-two minors in `w3-review-r22-migrations.md` §4
(including r22-n1's "N of 6" banners and r22-n2's "holds absolutely" sentence in 00634, which this
round's 00634 comment addition sits beside but does not rewrite — it was not assigned).
