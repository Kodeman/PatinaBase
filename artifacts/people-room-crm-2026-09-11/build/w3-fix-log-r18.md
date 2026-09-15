# W3 (P2) — fix log, round 18

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted** — 00629 and
00632 are unapplied on Strata and were edited in place.

Six findings were handed over; they are four distinct defects, each reported twice
(once by the migrations review, once by QA, or once by the code review and once by QA):

| Handed over | Distinct defect |
|---|---|
| `r18-major-1` (00629:2400) · `major-1-merge-does-not-dedupe-seats` | **1.** the merge doubles a seat and its money authority |
| `blocking-1-bid-outcome-erases-hand-closed-seat` · `r18-blocking-1` | **2.** a bid-outcome save erases a hand-closed seat |
| `r18-major-1` (household-band.tsx:915-928) | **3.** the household's primary act is natively `disabled` |
| `r18-major-2` (w3-room-report.md:275,401) | **4.** the report states a money write the RPC cannot make |

---

## 1. BLOCKING — a bid-outcome correction erased the studio's own hand-close

`packages/supabase/src/hooks/use-coordination.ts` (`useSetPartyBid`)

**Was.** `} else if (written.stage) { dbPatch.off_job_at = null; dbPatch.off_job_reason = null; }`
— the clear fired on ANY save that wrote a stage and was not a withdrawal. `'off_job'`
is deliberately absent from `SEAT_STAGES_PAST_THE_BID`, so a seat the studio closed with
**"Close this seat"** (`useCloseProjectPartySeat` writes `stage='off_job'`, `off_job_at`
and the studio's own `off_job_reason`) fell straight through it. The bid editor is still
offered on that row ("Change what came back"), and one press of "They declined" NULLed a
sentence held nowhere else and carrying no audit row — and put the seat back on the job.

**Now.** Gated on R-BR's own scope, the seat leaving `withdrawn`:

```ts
} else if (written.stage && previous.bidOutcome === 'withdrawn') {
```

R-BR rules exactly one thing ("Correcting a bid outcome away from `'withdrawn'` clears
`off_job_at` and `off_job_reason`"); the branch now implements that and nothing wider.
The comment at the site records why the guard is on the PREVIOUS outcome and not on a
stage being written, and says that reopening a hand-closed seat, if the room wants it, is
its own named act with its own consequence sentence.

**Pinned.** `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` — new case
"leaves a HAND-CLOSED seat's date and reason alone (r18 BLOCKING-1)":
`previous: { bidOutcome: null, stage: "off_job" }` + `patch: { bidOutcome: "declined" }`
→ `bid_outcome: "declined"`, `stage: "declined"`, `off_job_at` and `off_job_reason`
**undefined**. The two existing R-BR cases (the real withdrawal correction, and the
moves-nothing case) are unchanged and still pass.

**Measured.** `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` → 43 passed.
Full package: **106 files, 1353 passed, 12 skipped**.

---

## 2. MAJOR — the merge left one human holding two open seats of one kind on one job

`supabase/migrations/00629_studio_contact_merges.sql` (`merge_studio_contacts`)

**Was.** The seat repoint is one unconditional statement and `project_parties` carries no
uniqueness on `(project_id, studio_contact_id, party_kind)`, so a human seated on ONE job
under BOTH duplicate cards did not converge at the fold. Each seat can carry its own open
`project_party_authority` row from a different door — R-J's "Confirm from the agreement"
and `add_household_member()`'s household figure — so the Call Sheet printed the same
person twice, "Signs money to $2,500." beside "Signs money to $10,000.", over a record
that had just said these are one human.

**Now.** Shape (a) of the three the review named — **refuse by name, before the first
write** — the posture the file already takes five times for a state the merge cannot
resolve FOR the studio. Choosing which of the two money grants survives is the
principal's ruling (PR-n), and R-BN forbids dropping the other, so the room cannot pick
one here; what was missing was the room SAYING the repair is owed. It now does:

```sql
RAISE EXCEPTION 'merge_seat_collision'
  USING DETAIL = v_collision_job || ' · ' || v_collision_kind,
        HINT   = 'Both cards hold an open seat of the same kind on the '
                 'same job, and one person cannot hold the job twice. '
                 'Close one of these two seats first, then merge.';
```

**Open seats only** (`off_job_at IS NULL` on both legs — 00632's own open-seat filter,
the room's "Close this seat" record). Three reasons, all in the comment at the site: a
closed seat states no second LIVE money fact (`rosterWindowClause` prints "Off the job …"
beside it wherever it is banded, r15 MAJOR-1); refusing over a row the studio has already
retired would cost the room a fold it can make, which is 11k's own rule; and the repair
the HINT names is exactly the act that lifts the gate, so the sentence is never a dead
end. The file banner and the `COMMENT ON FUNCTION` both record the sixth refusal.

**On the face.** `packages/supabase/src/hooks/use-studio-contacts.ts` gains the sentence
(`MERGE_REFUSAL_SENTENCES.merge_seat_collision`) and, in `asMergeError`, the `details`
branch that names the job and the kind — the third refusal that can name what stands in
the way, beside the two that already do. The kind is rendered through
`getPartyKindLabel` from `@patina/types` (never a raw `client_rep` on a face, SPEC §7).
Without `details` the generic sentence stands; a bare token still never reaches the sheet.

**Pinned.** `supabase/tests/people/w3_merge_sweep_household_test.sql` block **13d**,
beside 13c, with four assertions:

* **13d-b..h** the household shape: card ONE seated `client_rep` with the agreement's
  $10,000, card TWO added through `add_household_member()` on the SAME job at $2,500 —
  two open money grants — and the fold refused as `merge_seat_collision`, DETAIL
  `W3 test job · client_rep`, HINT naming the repair, **and nothing written**: both cards
  still unfolded, 0 `studio_contact_merges` rows, 1 seat on the survivor (the repoint
  never ran).
* **13d-i/j** the control the review asked for: the same shape with two ordinary TRADE
  cards and no household anywhere near it → `merge_seat_collision`, DETAIL
  `W3 test job · sub`.
* **13d-k/l** the negative control: the survivor's seat of that kind is one the studio
  CLOSED → the fold **succeeds**, and the survivor comes out with exactly one open seat.
* **13d-m/n** the repair: closing the absorbed seat lifts the gate, the fold goes
  through, and the survivor holds exactly ONE open money grant on an OPEN seat.

**Measured.** `probe-r18-g-fix-seat-collision.sql` (new, committed), fresh reset, one
transaction, ROLLBACKed, room acts only:

```
G-a refusal: merge_seat_collision | DETAIL Okonkwo residence · client_rep
            | HINT Both cards hold an open seat of the same kind on the same job, and one
              person cannot hold the job twice. Close one of these two seats first, then merge.
G-a cards still unfolded: 2 of 2
G-a merge rows written: 0
G-a seats on the survivor: 1 (1 = the repoint never ran)

G-b after the repair (Close this seat on the absorbed one), the fold goes through:
     f8e0…000a client_rep  off_job_at (none)   1000000  agreement §4
     6c25…7d70 client_rep  off_job_at 2026-09-15  250000  client_households.co_threshold_cents
     — one OPEN client_rep seat with one open money grant; the other says, in words,
       that it left the job

G-c refusal: merge_seat_collision | DETAIL Okonkwo residence · sub     (no household in it)
G-d control: survivor_cd f8d0…000e — the fold with a CLOSED survivor seat SUCCEEDS,
             leaving one open installer seat and the closed one beside it
```

`probe-r18-e-merge-duplicate-authority.sql` (the review's own probe), re-run unchanged
against the fixed function, now stops at the act with the same refusal instead of printing
E-b's two open grants.

---

## 3. MAJOR — "Add to the household" was a native `disabled` button before a person was chosen

`apps/designer-portal/src/components/document/roster/household-band.tsx`

**Was.** `disabled={addHeld || !personId || addMember.isPending}` with `held={addHeld}`
only. `DocumentAction` renders `disabled={unavailable && !held}`, so in the region's
opening state (`personId === ''`, the select reading "Choose someone from the book") the
primary act was a native `disabled` button: off the tab order, no `aria-disabled`, and no
sentence saying what was missing. A keyboard or screen-reader user reached the select, the
two role buttons and "Not now" and never the act. Direction §5.5 / CR-26 is stated
verbatim two components over (`roster-row.tsx:1220-1241`) and honoured by the Send act
there, by `ArchiveCardDoor`, and by this same file's "Record the authority".

**Now.** `held={addHeld || !personId}`, a new exported constant

```ts
export const HOUSEHOLD_PICK_HELD_REASON = "Choose someone from the book first.";
```

rendered as a VISIBLE line `id="household-person-held"` in the `!personId` branch,
`aria-describedby` pointing at whichever reason applies (`household-grant-held` when PR-n
holds it, `household-person-held` otherwise), and `onHeldActivate` routing the matching
sentence into `setError` so a press announces it in the band's `role="alert"`. The PR-n
branch is untouched and still wins where both apply.

**Pinned.** `__tests__/household-band.test.tsx`, two new cases —
"holds — never disables — the act before a person is chosen" (`aria-disabled="true"`,
`not.toBeDisabled()`, `aria-describedby="household-person-held"`, the reason on the face,
a press writes nothing and announces the reason) and "lifts the hold, and the reason, the
moment a person is chosen". One existing case
("leaves the act live for the role that mints no grant") now chooses a person first,
because the opening state is no longer the live state — it asserts the PR-n gate lifting
for `client`, which is unchanged.

**Measured.** `npx jest household-band.test.tsx` → **45 passed**. The whole roster +
document tree: **60 suites, 664 passed**. `npx eslint` on both edited files → clean.

---

## 4. MAJOR — the room report stated a money write the RPC cannot make

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:275, :401`

**Was.** Both lines said `add_household_member()` "writes `money` and `change_order`
grants at `250000`".

**Re-measured rather than restated**, because the review's own fix note said to re-run the
round trip. Two things were wrong, not one:

1. `00632` carries exactly ONE `INSERT INTO public.project_party_authority` (measured:
   `grep -c` → 1) and the string `change_order` appears **zero** times in the file —
   not at HEAD (`grep -c change_order` → 0) and not in its first commit
   (`git show b3f3907fd:…00632… | grep -c change_order` → 0).
2. The `money` + `change_order` rows at 250000 the original probe saw on Chidi's seat are
   the **seed's**, not the RPC's. Re-run in a rolled-back transaction:

```
--- before: what the seed already holds on Chidi's seat (d0e3…0005) ---
 money        | 250000 | Owner agreement, Exhibit B §4.2  | source_household_id NULL
 change_order | 250000 | Owner agreement, Exhibit B §4.2  | source_household_id NULL
 draw_certify |        | Construction loan agreement §7.1 | source_household_id NULL
--- after add_household_member(household, Chidi, 'client_rep', Okonkwo) ---
 (the same three rows, source_household_id still NULL on all three)
```

So the RPC reused the open seat and wrote **no authority row at all** — correctly: that
seat already carries an open `money` grant the household did not source, and such a grant
stands (r9 M-1 / R-BQ). Where the seat carries no standing money grant it writes exactly
one row, scope `money`, `source_clause = 'client_households.co_threshold_cents'`
(`probe-r18-g`, G-a's fixture).

Both lines now say that, with the measurement and the r18 attribution beside them.

---

## Gates run after the fixes

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, "Finished supabase db reset on branch main." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — **"W3 SQL suite: all blocks passed"**, 13d last |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| legacy grants | not regenerated — this round issued **no** GRANT or REVOKE |
| migration numbering | nothing minted; 00629 and 00632 edited in place, both unapplied on Strata |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter designer-portal type-check` | clean |
| `pnpm --filter admin-portal build` (inline local env, no `.env.local`) | **succeeded**, full route table emitted |
| `packages/supabase` vitest, whole package | 106 files, **1353 passed**, 12 skipped |
| designer-portal jest, `document/roster` + `document/__tests__` | 60 suites, **664 passed** |
| `npx eslint household-band.tsx + its test` | clean |

Nothing outside the four defects was changed. No new object, no new migration, no new
RPC, no flag, no schema column.
