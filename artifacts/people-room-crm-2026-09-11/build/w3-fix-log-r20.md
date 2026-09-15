# W3 (P2) — fix log, round 20

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted** — `00634` is unapplied on
Strata, so it is amended in place (the brief's own rule for this wave).

Five findings, four distinct defects: the migrations round's BLOCKING-1 and the QA round's
BLOCKING-1 are one gap (00634's ungated trigger); the QA round's BLOCKING-2 and the code round's
major-1 are one gap (the Call Sheet's Close-this-seat act on a seat that has already left).

---

## r20-blocking-1 · r20-qa-blocking-1 — 00634's trigger wrote a money-authority row for callers the authority table's own policies refuse, across tenants included

**Fixed in `supabase/migrations/00634_seat_close_ends_authority.sql` (amended in place).**

### What was wrong

`end_party_authority_at_seat_close()` was `SECURITY DEFINER` with no gate in its body, and the table
that fires it is not gated like the table it writes:

| | predicate |
|---|---|
| `project_parties_studio_update` (00584:895-903) | `is_studio_comember(project.designer_id)` — no tenant leg, no PR-n leg |
| `project_party_authority_studio_update` (00624:1017-1041) | `is_active_studio_member(project_party_recorded_studio(…)) AND is_studio_comember(project_party_designer(…)) AND (scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(…))` |

So the close was a door around the money policy in both populations the reviews measured: a plain
`member` of the recorded studio, refused a direct UPDATE of the money grant, ended it by closing the
seat; and a plain `member` of the designer's SECOND studio, who could not even SELECT the row, ended
another studio's money record.

### The shape taken: the gate stated in the body, and the CLOSE refused

The review left three shapes open. Two of them re-open r19 MAJOR-1: leaving a money grant standing
while the seat closes is exactly the state 00634 exists to prevent, and narrowing 00584's own seat
policy is far wider than W3 (every seat reader and writer depends on it). So the body states the
gate the way every other definer in this wave does (`add_household_member` 00632:410-416,
`set_household_threshold` 00632:655-666, `archive_studio_contact` 00629:3300-3307) and **refuses the
close** rather than ending the grant silently. The invariant then holds absolutely in every path:
**no closed seat carries an open grant.**

```
no open grant on the seat  -> nothing to gate, the close lands
auth.uid() IS NULL         -> migration / job / service_role, 00632:235's own carve-out
not an active member of project_party_recorded_studio(NEW.id),
  or not a co-member of project_party_designer(NEW.id)
                           -> seat_close_authority_forbidden
an open money / draw_certify grant and the caller is not
  is_org_admin_or_owner(recorded studio)
                           -> seat_close_money_authority_forbidden   (PR-n)
otherwise                  -> effective_to = GREATEST(effective_from, NEW.off_job_at), as before
```

The file's `COMMENT` and `LINEAGE` now say so, and the comment also states what r20-n5 observed in
passing — the UPDATE has no `scope` predicate, so **every** scope ends at the close, not money alone.

### Measured after the fix

`build/probe-r20-e-fix-negative-controls.sql` / `.out` — the same two shapes probe-r20-a and
probe-r20-b measured, on the freshly reset database, one transaction, ROLLBACKed, room acts only.
(The second studio is resolved from the seed rather than hard-coded: on this reset the designer
`a0…0004` owns `b0000000…0001` "Local Dev Studio" and `5af65c68…` "Leah Hartwell".)

```
A  plain member of the RECORDED studio closes the seat
   -> refused: seat_close_money_authority_forbidden
   A after  money 1000000  effective_to (none)  off_job_at (none)  off_job_reason (none)

B0 member_of_recorded f · comember_of_designer t · authority_rows_visible 0
B  plain member of the designer's SECOND studio closes the seat
   -> refused: seat_close_authority_forbidden
   B after  money 1000000  effective_to (none)  off_job_at (none)  off_job_reason (none)

C  the owner of the recorded studio closes it
   -> UPDATE 1
   C after  money 1000000  effective_to 2026-09-15  off_job_at 2026-09-15
```

### The pin beside 13d

**`supabase/tests/people/w3_merge_sweep_household_test.sql` gains block `13e`** — the negative
control the review asked for by name, plus the two controls that keep the gate honest in the other
direction. 13d closes its seats as `postgres` (`auth.uid() IS NULL`), which is 00634's own internal
carve-out, so nothing in the suite had ever asked who may take the act for real (r20-n6).

* fixture: a side studio `f9000000…000c` where the designer `a0…0004` and `a0…0005` are both active
  members, so `is_studio_comember(designer)` is true for `a0…0005` while
  `is_active_studio_member(W3 Test Studio)` is false — w1b r5 MAJOR-3's exact population;
* `13e-a` a plain member's direct UPDATE of the money grant still returns 0 rows;
* `13e-b/c/d` their seat close is refused `seat_close_money_authority_forbidden`, and
  `effective_to` and `off_job_at` are both still NULL afterwards;
* `13e-e/f` the outside-studio member stages the population and can SELECT 0 authority rows;
* `13e-g/h/i` their close is refused `seat_close_authority_forbidden`, record untouched;
* `13e-j` the gate is NARROW: a plain member still closes a seat whose only grant is `schedule`, and
  00634 still ends it on the day;
* `13e-k` the principal's own close still lands and still ends the $10,000 on the day.

### Gates

| Gate | Result |
|---|---|
| `pnpm … supabase:reset` | clean — "Finished supabase db reset on branch main." |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", 13e last |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + 2767 replayed statements" |
| migration numbering | nothing minted; `00634` amended in place, still above `00627`, outside `00595`–`00620` |

---

## r20-qa-blocking-2 · r20-major-1 — "Close this seat" was offered on a seat that had already left the job, and taking it overwrote the recorded day and erased the recorded reason

**Fixed in `apps/designer-portal/src/components/document/roster/roster-row.tsx` and
`packages/supabase/src/hooks/use-coordination.ts`.**

### What was wrong

The Call Sheet act was gated on `isSeat` alone — nothing read `row.offJobAt` or `row.stage` — while
the person card's `CloseSeatAct` was already correct (`person-profile.tsx:255-258` renders it over
`liveSeats`, which `DONE_STAGES` excludes). So a Done-band row carrying a recorded `off_job_at` and
`off_job_reason` still offered the act; the row's `reason` state starts at `''` and was never seeded
from the record, so the confirm sent `reason: ''` and `useCloseProjectPartySeat` wrote
`off_job_at: today, off_job_reason: NULL`. No audit row and no second copy held the originals, and
the confirm sentence ("The seat stays on the job with the day it closed") was a wrong fact in that
state. The two copies `w3-room-report` §6 and `close-seat-act.tsx:14-25` both call "hand-kept in
step" were not in step here.

### What changed — three layers, so every caller is covered

1. **The act is `held`, not hidden** (direction §5.5 / SPEC §7 #4: a gated act keeps its reason on
   the face). `seatAlreadyClosed = isSeat && (!!row.offJobAt || row.stage === 'off_job')` drives
   `disabled` + `held` + `aria-describedby`, and the sentence prints beside the act row the way the
   Text act's held reason two regions up does:
   > "This seat left the job on 10 Sep 2026. The reason on file reads “Picked another electrician.”.
   > Closing it again would write over that day. Putting a seat back on the job is its own act."
2. **The field opens on the record.** Pressing "Close this seat" now seeds `reason` from
   `row.offJobReason`, so a correction restates the sentence instead of blanking it.
3. **The rule where every future caller reaches it.** `useCloseProjectPartySeat` reads the seat's
   standing `off_job_at` / `off_job_reason` before it writes: the day a seat left the job is written
   once, and a recorded reason is restated or kept, never nulled. A first close behaves exactly as
   before. Re-opening a seat stays its own act (00634:59-64).

`w3-room-report.md` §6 now names the divergence and the repair rather than restating the
"hand-kept in step" claim unqualified.

### Pinned by test

* `apps/designer-portal/src/components/document/roster/__tests__/roster-row.test.tsx` — "holds Close
  this seat once the seat has already left the job, and says why" (`aria-disabled="true"`, the
  described-by sentence carries both the date and the recorded reason, the click opens no confirm
  and calls no mutation) and "seeds the reason field from the seat's recorded reason".
* `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` — three cases on the hook's own
  `mutationFn`: a first close writes today and the trimmed reason; a second close with no reason
  keeps `off_job_at 2026-08-20` and "Picked another HVAC sub."; a correction restates the sentence
  without moving the day. (The vitest mock's single-row read is now steerable through `standingRow`.)

### Gates

| Gate | Result |
|---|---|
| `--filter @patina/supabase type-check` | clean |
| `--filter @patina/supabase test people-crm-w3` | 48 passed |
| `--filter designer-portal exec jest src/components/document/roster src/components/document/people` | 39 suites, 614 tests passed |
| `--filter designer-portal type-check` | clean |
| `--filter admin-portal build` (shared-package edit) | clean, full route table printed |

---

## r20-major-2 — `w3-room-report.md` §2 stale at HEAD in four places, §5 misquoting a refusal the hook does not carry

**Fixed in `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`.** The fifth filing of the
report-drift defect (r7 M-4, r8 MAJOR-1, r15 MAJOR-3, r19 major-2 — whose fix log re-measured §1 and
§9 only). Every line re-read against HEAD:

1. **The refusal count.** "thirteen" → **fourteen**, and `merge_seat_collision` added to the list
   with its own clause — `MERGE_REFUSAL_SENTENCES` (`use-studio-contacts.ts:1925-1971`) holds
   fourteen, and r18 MAJOR-1's own refusal, the one r19 built 00634 around, was in neither the count
   nor the list.
2. **The `role="status"` announcement.** The report quoted "…carries EVERYTHING &lt;merged&gt; held",
   which is the wording r5 B-1 / r11 BLOCKING-1 removed as a wrong fact. Replaced with
   `compare-merge-sheet.tsx:461-465`'s actual string ("…carries what &lt;merged&gt; held, and where
   both cards said something, &lt;survivor&gt;'s own words stand — except the trades and
   specialties, which are kept together."), with a line saying which wording came out and why.
3. **The contact-rule branch of the consequence sentence.** "With no rule on the survivor it reads:"
   → the PAIR branch: `ruleMoves = mergedHasRule && !survivorHasRule` (`compare-merge-sheet.tsx:131`),
   so the quoted clause also requires the FOLDED card to hold a rule, and where neither card holds
   one "contact rule" simply drops out.
4. **The sixth clause.** "Where the survivor has a rule…" → "Where BOTH cards hold a rule
   (`ruleStays = survivorHasRule && mergedHasRule`, `:135-138`)" — the old text is the pre-r13
   MAJOR-2 behaviour.
5. **§5's principal sentence.** The quoted string is the BAND's own click handler
   (`household-band.tsx:721-724`), not the hook's. Both are now quoted and attributed: the band's
   "A change-order figure is the principal's to set. Ask an owner or an admin of the studio.", and
   `use-households.ts:116-117`'s `household_threshold_forbidden` — "…to set, **and the principal's
   to take away**. Ask an owner or an admin of the studio."

§2 now opens, as §1 already does, with the round at which it was last measured and what was measured.
