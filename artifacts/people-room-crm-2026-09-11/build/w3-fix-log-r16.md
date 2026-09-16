# W3 fix log — round 16

Four findings, from `w3-review-r16-migrations.md` §3, `-qa.md` §5 (F1) and `-code.md` §4,
closed. Two of them carry the same id (`r16-major-1`) because the migrations round and the
code round filed the same column one layer apart; they are different defects and are closed
by different changes. Nothing else touched. Nine files:

```
supabase/migrations/00632_client_households.sql
supabase/tests/people/w3_merge_sweep_household_test.sql
packages/supabase/src/database.types.ts                       (regenerated)
packages/supabase/src/hooks/use-households.ts
packages/supabase/src/hooks/index.ts
packages/supabase/src/hooks/__tests__/use-households-r16.test.ts   (new)
apps/designer-portal/src/lib/document/bring-forward.ts
apps/designer-portal/src/lib/document/__tests__/bring-forward.test.ts
apps/designer-portal/src/components/document/roster/household-band.tsx
apps/designer-portal/src/components/document/roster/rolodex-picker.tsx
apps/designer-portal/src/components/document/roster/__tests__/household-band.test.tsx
apps/designer-portal/src/components/document/roster/__tests__/rolodex-picker.test.tsx
artifacts/people-room-crm-2026-09-11/build/probe-r16-f1-fix.sql                    (new)
```

No migration was minted: `00632` is unapplied on Strata and was edited in place, which the
brief permits. No prod contact, no server started, no port taken.

---

## r16-major-1 (migrations §3) — one card in two households, and either figure rewriting the other's grants

`source_clause = 'client_households.co_threshold_cents'` names a TABLE, not a row, and
nothing refuses a person card standing in two households. So every household in the studio
matched every other household's grant on that string: raising the Lindqvist household's
figure raised the Okonkwo residence `client_rep` seat's authority from $2,500 to $25,000
while the Okonkwo household's own record still read $2,500 (probe-r16-b), and the room's own
duplicate fold creates the two-household state without anybody meaning to (probe-r16-e).

**Fixed by stamping the household on the grant** — the first of the three shapes the finding
offered, and the only one that also settles the money half of `useProjectHousehold`'s
`.limit(1)` ambiguity. Refusing a second membership was NOT taken: the fold is the studio's
own act and cannot refuse, so a rule the fold must break is not a rule.

1. `00632` §2b (new) — `project_party_authority.source_household_id uuid REFERENCES
   client_households(id) ON DELETE SET NULL`, with a partial index and a COMMENT. SET NULL
   and never CASCADE: losing the household must not delete a money record somebody signed
   under; 00624's own shape for ending a grant is `effective_to`.

2. `add_household_member()` — the INSERT stamps `source_household_id = v_h.id`, and the
   "this is the household's own grant, move it" branch now reads
   `source_clause = 'client_households.co_threshold_cents' AND source_household_id IS NOT
   DISTINCT FROM v_h.id`. Both legs together: the id says WHICH household owns the row, the
   clause keeps r9 M-1's rule that a grant the studio re-sourced BY HAND is released.

3. `set_household_threshold()`'s loop gains `AND pa.source_household_id = v_h.id`. The
   member-array leg stays beside it — it bounds the loop to this studio's own cards, so an
   id stamped from outside cannot pull a foreign seat into the sweep.

4. `use-households.ts` — `ClientSideMoneyGrant` carries `sourceHouseholdId`, the grant read
   selects it, and the rule both RPCs make is exported once as `householdOwnsGrant(grant,
   householdId)`. `household-band.tsx` asks it instead of comparing the clause, with the
   band's own `household.id` passed in, so "already signs money … recorded outside the
   household, and that figure stands." is now also the true sentence for ANOTHER household's
   figure.

5. The `client_households` overlap fallback (`use-households.ts`) orders
   `created_at, id` before `.limit(1)`, so a card in two households resolves to the same
   household on every refetch instead of whatever Postgres returned first.

**Measured** on a fresh reset, all rolled back, with the reviewer's own probes:

```
probe-r16-b  B-c grants after the add:  Lindqvist kitchen=1000000 | Okonkwo residence=250000
             B-d after moving the LINDQVIST figure only:
                                        Lindqvist kitchen=2500000 | Okonkwo residence=250000   (was 2500000)
             B-e Okonkwo household still says 250000
probe-r16-a  A-d after H2 add: threshold=250000           (was 900000 — H2 rewrote H1's grant)
             A-e H1 figure=250000 H2 figure=1500000 SEAT grant=250000
             A-f households naming this card: 2           (the state is still reachable; the money no longer crosses)
probe-r16-e  E-b households naming the survivor after the fold: 2 (H one=250000, H two=900000)
```

**Pinned** in `w3_merge_sweep_household_test.sql` block 13, beside block 12: two households,
one member, two jobs, with 13-e carrying probe-r16-b's cross-job assertion as the negative
control, and 13-g the same-job case (household TWO may not rewrite household ONE's grant on
the seat it reuses).

---

## F1 (QA §5, major) — the `client_rep` added before the household named a figure never got a grant

`add_household_member()` correctly writes no money grant while `co_threshold_cents` is NULL,
and `set_household_threshold()` only ever UPDATEd grants that already existed — so the
ordinary order of work (decide who is in the household, then decide what figure needs a
signature) left every `client_rep` member of that first step with no authority for ever, the
person card printing "No authority on this job" beside the household band's own clause on
the same Call Sheet.

**Fixed with the QA finding's shape (b), not (a).** Shape (a) — open a placeholder grant at
add time with `threshold_cents = NULL` — is refused on the file's own stated ground: a money
grant with a NULL threshold reads "Signs money." with NO CAP (00624), which is exactly why
`set_household_threshold()` CLOSES grants when the figure is erased rather than mirroring the
NULL onto them. Opening one would widen unlimited signing authority out of a household that
names no figure at all.

So `set_household_threshold()` gained a second loop, after the move loop and before the
figure is written: for every `client_rep` seat of a member that is still OPEN
(`off_job_at IS NULL`, r15 MAJOR-1) and carries NO open money grant (a grant from the
agreement is not this act's to replace, r9 M-1; the partial unique index would refuse a
second one anyway), it opens one at `p_threshold_cents`, stamped with the clause and the
household. Nothing is opened when the figure is being erased. PR-n is asked per seat on the
studio the PROJECT records, refusing the whole act rather than half-opening the grants —
the same posture, and the same two refusals, the move loop already takes. Note the widened
consequence: a household whose member sits on a studio-less job now refuses the figure act
with `household_grant_project_has_no_studio` where it used to succeed silently, which is
R-BD's repair sentence and 00624's "a silent under-grant is the failure".

**Measured** (`probe-r16-f1-fix.sql`, seeded book, rolled back):

```
F-a seat = 6d1201d7-…
F-b grants at add time (the figure is NULL): 0
F-c after the figure is set: threshold=250000 clause=client_households.co_threshold_cents
                             household=aa000000-…-f1 open=true
F-d after raising it: rows=1 threshold=500000
F-e the agreement's own seat still reads: selections=<no figure> (Owner agreement, Exhibit B §4.1, household=none)
```

**Pinned** in block 13b: the `client_rep` added before the figure gets exactly one open grant
when the figure is named (13b-b/c); the plain `client` member still gets none, PR-c (13b-d);
a seat the studio CLOSED before the figure was named still gets none, r15 MAJOR-1 (13b-e);
and raising the figure moves that row rather than opening a second (13b-f).

---

## r16-major-1 (code §4) — the household band read a grant standing on a CLOSED seat

r15 taught `add_household_member()` to skip an `off_job_at` seat and open a new one.
`useProjectHousehold` was not told: it read every `client` / `client_rep` seat with no
`off_job_at` filter, and its comment still described the pre-r15 lookup. So the sentence in
front of the press could stand on a grant hanging off a seat the studio had closed — a row
the write never touches — and `clientSideHasAuthority` counted those rows too.

**Fixed in `use-households.ts`:**

1. The seat read selects `off_job_at`; `openSeatRows` drops closed seats, and the grant query
   is narrowed to open seat ids, so `clientSideHasAuthority` also stops counting authority
   belonging to somebody who left the job.
2. The dedupe is gone. The FIRST OPEN seat per (card, party kind) — the row the RPC reuses —
   is computed from the `created_at` sort and then asked for its grant, instead of keeping
   whichever grant the grant query happened to return first. Between two open seats the
   printed figure can no longer change between refetches.
3. The `:286-288` comment now states 00632's current lookup (`AND pp.off_job_at IS NULL …
   ORDER BY pp.created_at LIMIT 1`), and the two return-type doc blocks say "open seats
   only".

**Pinned** by a new vitest file, `use-households-r16.test.ts` (4 cases): a closed seat
carrying an open grant plus a later open seat with none returns NO standing grant, does not
report client-side authority, and never even asks about the closed seat; the first open
seat's grant wins over a later open seat's whatever order the grants arrive in; the
household stamp is carried and the overlap fallback orders `created_at, id`; and
`householdOwnsGrant`'s four branches.

---

## r16-major-2 (code §4) — the bring-forward sentence counted seats the press would refuse

`pickedFacts` was built from every ticked card, so the consequence sentence read "Adds four
seats to the Okonkwo residence." while `addPicked` dropped every already-seated pick from the
batch and, where all of them were seated, wrote nothing. `bringForwardActLabel(picked.length)`
carried the same over-count. Leah's task 5 on the seeded Okonkwo is exactly that state.

**Fixed in `rolodex-picker.tsx` + `bring-forward.ts`:** one `pickedSplit` memo runs the same
`rosterHasIdentity` test `addPicked` runs (`rosterRows` is already in hand at render and the
test is pure), and `{ seated, fresh }` now feeds all three: `bringForwardActLabel` counts
`fresh`, `pickedFacts` is built from `fresh`, and `bringForwardConsequence` takes a third
argument naming the seated picks, printing "Adds one seat to the Okonkwo residence. Dana
Kowalski is already on the call sheet." `addPicked` destructures the same memo, so the count
in front of the press, the label on it and the write behind it name the same people. The
third argument defaults to `[]`, so SPEC §5.7 #7's literal is unchanged where no pick is
seated.

**Pinned**: two cases in `bring-forward.test.ts` (fresh-count + seated clause, and the
all-seated "Adds no seats" sentence), and the two `rolodex-picker.test.tsx` bring-forward
cases now assert the sentence and the label before the press (their previous
"Add two to the roster" / "Add one to the roster" labels were the over-count itself).

---

## Gates

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, "Finished supabase db reset on branch main." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (13 and 13b last) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `SUPABASE_DB_URL=… pnpm db:generate` | one column + its FK on `project_party_authority`, nothing else |
| `python3 scripts/generate-legacy-grants.py` | re-run — no diff (no GRANT/REVOKE changed) |
| `pnpm --dir packages/supabase type-check` | exit 0 |
| `pnpm --dir apps/designer-portal type-check` | exit 0 |
| `pnpm --dir apps/admin-portal build` | exit 0, "✓ Compiled successfully", 137 routes |
| `apps/designer-portal` jest (full) | 593 suites, 7679 tests passed (was 7675: +4) |
| `packages/supabase` vitest (full) | 106 files, 1350 passed / 12 skipped (was 105 / 1346) |
| migration numbering | none minted; 00632 edited in place, above 00627, outside 00595–00620 |
