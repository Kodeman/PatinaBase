# W3 (round 16) — runtime QA against a local production build

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no migration minted
(highest on the branch stayed `00633`, nothing touched in `00595`–`00620`); no `.env.local`
created; env passed inline per the binding instructions; no prod contact.

---

## 1. Setup

- `pnpm supabase:reset` — clean replay, `Finished supabase db reset on branch main.`
- `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` — rc 0, all blocks passed,
  including block 12 (r15 MAJOR-1's closed-seat pin).
- `pnpm --dir apps/designer-portal build` with env inlined (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`,
  plus the `.env.example` service/app URLs) — exit 0, full route table printed.
- `npx next start -p 3000` in the background, port checked free first (`lsof` — no listener before
  start). Server answered 200 on `/`.

## 2. `e2e/people` (chromium)

```
14 passed
8 failed (add-client-letter.spec.ts ×2, add-sheet.spec.ts ×3, call-sheet.spec.ts ×1,
          person-card.spec.ts ×2)
```

Matches the r15 QA round's own baseline exactly ("14 passed / 8 failed, the eight pre-existing
and carried to the orchestrator", `w3-room-report.md` §9). The two flagship specs the report names
— `bring-forward.spec.ts` and `merge.spec.ts` — are both in the 14 that passed; neither regressed.
The eight failures are the same pre-existing test-authoring bugs named in the r14 QA round
(`getByLabel` selector drift against the shipped Add sheet's markup), not product defects — not
re-litigated here since the brief scopes this round to the runtime walk.

**A run-order note for whoever reads this next**: I ran the full e2e suite before the manual walk,
which leaves some timestamped junk cards/seats behind from the failing specs (they don't all clean
up on failure). I reset the database again before starting the manual walk below, so the walk
itself is against a clean seed; the round's own e2e evidence above is from the dirty-then-reset
sequence, which is fine since the suite doesn't depend on a clean starting rolodex.

## 3. Sign-in

`designer@patina.dev` via Mailpit (the CLI's Inbucket has been replaced by Mailpit on the same port,
54324 — same function, not a finding) — OTP flow, landed on `/desk` as Leah Hartwell
(`studio_owner`).

## 4. The manual walk

### Task 5 — bring forward (Okonkwo Call Sheet → From the rolodex → search "Lindqvist")

Screenshots: none saved to `build/qa-w3-r16/` — the browser tool in this environment ignores
`resize_window` (confirmed: `window.innerWidth` stays 500px after requesting 1440×900 and 700×500;
`window.screenY` places the automation window off the primary display) — see §6. I did not save
misleading "1440"/"390" screenshots at a width the harness cannot actually produce; the DOM content
below is verified textually and against the two reference PNGs' text instead of pixel comparison.

- Every §5.7 string checked against the live picker, POST the compliance-expiry sweep (see the
  finding in §5 below — the sweep has to be run by hand after any local reset, same as
  `w3-room-report.md` §7 already says):
  - "4 of 6 from the Lindqvist kitchen selected" once four of six are ticked — present, exact.
  - Ben Ostrom's row prints the expiry-notice clause "Ostrom Builders's insurance lapsed
    31 December 2025." (grammar nit — see §5).
  - Dana Kowalski's row prints "Northgate Electric's insurance lapsed 31 March 2026." — present,
    exact, matches SPEC §5.7 row a and the consequence sentence's third clause.
  - Ingrid Halvorsen's row prints "Email only. No cell for work — the shop line is the voice door."
    — SPEC §5.7 row c quotes only "Email only. No cell for work." (a truncation of the seeded rule
    text). See the minor finding in §5 — this has been true and unflagged across at least 15 prior
    QA rounds (`qa-w2-r2` onward), so it reads as either an accepted paraphrase in SPEC's own table
    or a long-standing miss; reported for completeness per the brief ("never filter"), not as new.
  - "What travels" / "What stays behind" panes: identity, typed channels, contact rule, consent by
    channel value, document expiries, one history line / prior pricing, prior project notes, show
    to client — all six + three present, in order, exact wording.
  - Act row first: "ADD FOUR TO THE ROSTER" / "PUT BACK", both live (not `aria-disabled`).
  - Consequence sentence, exact: "Adds four seats to the Okonkwo residence. Pete Rusk arrives
    opted out of texting. Northgate Electric's insurance lapsed 31 March 2026." — matches
    `w3-room-report.md` §3's quoted string and SPEC §5.7 #7 verbatim, once the sweep has run.
- Clicked "Add four to the roster" with Dana Kowalski, Pete Rusk, Ingrid Halvorsen and Claire
  Bissett ticked (the four SPEC names). Result: **"Claire Bissett, Dana Kowalski, Ingrid Halvorsen,
  Pete Rusk are already on the call sheet."** — refused, named, live. Verified by SQL: all four
  already carry seats on Okonkwo from the fixture itself (`project_parties` rows dated 2026-10-01
  through 2026-10-12, i.e. seed literals, not something this session wrote), and zero new
  `project_parties` rows were created today (`created_at::date = current_date` returns 0 rows both
  before and after the click). **This is not a new finding** — it is exactly what
  `w3-room-report.md` §10 item 1 already documents ("bring-forward.spec.ts opens its own project
  rather than Okonkwo, because the seed already seats Dana, Pete, Ingrid and Claire there — bringing
  them forward onto Okonkwo can only ever read 'already on the call sheet'"). It does confirm,
  freshly, that the refusal path itself is honest: no duplicate seat, no partial write, the four
  names are all correctly identified.
- Click-count check against `direction.md` §6 task 5's proposed figure ("6 for all four (search,
  select four, one confirm)"): search (1) + four ticks (4) + one confirm (1) = **6**, matching
  exactly, entry navigation (open the sheet, switch to the rolodex tab) excluded the same way the
  table's other rows exclude it.

### Compare & merge

No natural duplicate-phone pair exists in the seed, so I minted one (mirroring
`e2e/people/merge.spec.ts`'s own pattern): two `studio_contacts` rows, same phone
`+16125559931`, dated 2024-03-01 and 2026-08-01, in Okonkwo's studio. Walked it, then deleted both
rows plus the merge record afterward — zero residue.

- Directory band: "These two cards share a phone. QA Newer Duplicate QA Older Duplicate" +
  "Compare these two" — both names live open-person controls, exact R-Y wording.
- Sheet: nine fields, two columns; older card pre-picked as survivor ("KEEPS THE CARD"); evidence
  select defaulted to "They share a phone number"; consequence sentence matched the template in
  `w3-room-report.md` §2 with names substituted, including the branch-specific trades/specialties
  sentence and the "kept as a record of the merge" closing clause.
- After "Merge into QA Older Duplicate": Directory count dropped 42→41, survivor's card opened
  automatically with the archive door.
- **Verified in Postgres**: `merged_into` set on the absorbed row, `studio_contact_merges` holds
  `(survivor, merged, matched_on='phone')`, `resolve_merged_contact(merged_id)` returns the survivor.
  No cross-tenant read/write risk — both rows were single-studio, and the merge RPC's own
  `is_studio_comember` gates were exercised implicitly (I merged as the seeded owner).

### Edit a bid outcome

Used the one seeded bid-bearing seat, Rivera Finishes (`no_response`, asked 28 Sep 2026, due
5 Oct 2026, `d0e30000-…-91`), since no seed row carries the "Holds until … Priced by Tom Marrow"
example quoted in `w3-room-report.md` §4 (that string is illustrative, not tied to a literal
fixture row — SPEC nor rulings.md pin it to one).

- "Change what came back" opened the seven-field editor exactly as specced (asked / owed / how it
  came back / number came back / chose them / holds until / who priced it).
- Set the outcome to "Selected". Consequence sentence updated live to: "Recording this moves Rivera
  Finishes to Awarded. A bidder who did not win never reads as crew." — exact match to
  `w3-room-report.md` §4.
- Submitted ("Write the bid"). Row left the Bidding band and reappeared under "On the job · this
  week". **Verified in Postgres**: `bid_outcome='selected'`, `stage='awarded'` — the outcome-to-stage
  transition (`bidStageOutcome`) fired correctly.

### Household — add a member with a threshold, as the principal; confirm a member cannot

Signed in as `designer@patina.dev` = Leah Hartwell, seeded `studio_owner` — the principal for
PR-n's purposes.

1. "Open a household" on the seeded Okonkwo residence (inert until pressed, per
   `w3-room-report.md` §10 item 2 — confirmed, settled, not a finding). This auto-seeded the new
   `client_households` row's members with the project's existing client + client_rep cards (Adaeze,
   Chidi).
2. **Added Dana Kowalski as "Signs for the household"** (client_rep) while the household's
   `co_threshold_cents` was still NULL. A new `client_rep` seat was correctly opened for her
   (distinct from her existing `sub` seat on the same job — the lookup keys on `party_kind`, so it
   did not conflate the two facts). No error, correct consequence sentence
   ("Dana Kowalski joins the household and takes a seat on the Okonkwo residence. Nothing is sent
   to them.").
3. **Set the figure to $2,500** as the owner. Succeeded; face read "Change orders over $2,500 need
   a signature from the household."; DB `client_households.co_threshold_cents = 250000`.
4. **Found a MAJOR gap here — see §5, finding F1.** Dana's new seat received **no**
   `project_party_authority` row at all, neither at add-time (the household had no figure yet) nor
   when the figure was set afterward (`set_household_threshold()` only updates grants that already
   exist). Her own person-card seat line prints "No authority on this job" — a plain contradiction
   of the role she was just given and the household clause sitting one screen over.
5. **Confirmed a member cannot**, two ways, both via a direct RPC probe as a temporary studio
   `member` (not owner/admin), each in a rolled-back transaction, no residue:
   - `set_household_threshold(...)` → `ERROR: household_threshold_forbidden`, HINT "A change-order
     figure is the principal's to set, and the principal's to take away (PR-n)." — exact match to
     `w3-room-report.md` §5's quoted refusal.
   - `add_household_member(...)` for a NEW client_rep member while the household already holds a
     live threshold → `ERROR: household_grant_forbidden`, HINT "Only an owner or an admin of the
     studio may set a money authority (PR-n)." — the whole act is refused, not just the grant half,
     matching the function's own COMMENT.
   Both refusals are exactly what the code promises; not new findings.
6. Raised the figure to $5,000 to distinguish "a grant the household sourced" from "a grant the
   studio wrote by hand" (r9 M-1): Chidi's two agreement-sourced grants (`source_clause = 'Owner
   agreement, Exhibit B §4.2'`) stayed at 250000, untouched — correct, matches the r9 M-1 rule. A
   THIRD member added after the figure existed (Priya Natarajan, added purely to isolate the
   before/after ordering) got a correctly-sourced `money` grant at 500000
   (`source_clause='client_households.co_threshold_cents'`) immediately — confirming the bug in
   step 4 is specifically about the **order of operations** (member added before any figure exists),
   not a blanket failure of the grant-writing path.

### Close a seat with a reason

Closed Dana Kowalski's `sub · electrical` seat via her person card's "Close this seat"
(`CloseSeatAct`, R1), with reason "QA round 16 close-seat walk". Confirm sentence, two-step act,
moved to "Past seats" reading "Off the job · Closed 15 Sep 2026" (today). **Verified in Postgres**:
`off_job_at = 2026-09-15`, `off_job_reason = 'QA round 16 close-seat walk'`.

### Archive / restore as owner

"Put this card away" on Dana Kowalski's person card → face read "This card was put away
15 September 2026. It stays out of the book until it is brought back." with "Bring this card back".
**Verified**: `studio_contacts.archived_at` stamped, then cleared to NULL on restore. Both acts
single-press, idempotent-shaped, correct as the owner.

## 5. Findings

**F1 — MAJOR / HIGH confidence.** A household member added with the "signs for the household"
(`client_rep`) role while the household names no change-order figure yet (`co_threshold_cents IS
NULL`) never receives a `project_party_authority` money grant — not at add time (correctly skipped,
since there is no figure to grant), and **not later either**, once a figure is set. Cause, read in
the migration:
- `supabase/migrations/00632_client_households.sql:411` — `add_household_member()` only attempts
  the grant write `IF v_h.co_threshold_cents IS NOT NULL AND p_role = 'client_rep'`. With a NULL
  figure this whole branch is skipped, correctly, at add time.
- `supabase/migrations/00632_client_households.sql:583-` (the `FOR v_seat IN SELECT … FROM
  project_parties pp JOIN project_party_authority pa ON pa.engagement_id = pp.id …` loop inside
  `set_household_threshold()`) only **updates** rows that already exist (`JOIN`, never
  `LEFT JOIN` + `INSERT`). A `client_rep` seat with zero existing grant rows is invisible to this
  loop and is never backfilled when the figure is set or changed afterward.

Reproduced twice against a fresh reset: Dana Kowalski (added before the figure existed) carries
**zero** `project_party_authority` rows after both a $2,500 and a subsequent $5,000 threshold-set;
Priya Natarajan (added identically, but after the figure already existed) correctly received a
`money` grant matching the figure both times. The failure scenario a studio would actually hit:
open a household, add its members first (the natural order — "who's in the household" usually gets
decided before "what dollar figure needs a signature"), set the figure last. Every member added in
that first step is left permanently unable to sign per the money book, while their own Call Sheet
row and the household band's clause both look complete and give no indication anything is missing —
the person card literally prints "No authority on this job" for a person the studio just told the
system "signs for the household." This is the exact class of two-contradictory-facts harm
`household-band.tsx`'s own banner and r9 M-1 / r15 MAJOR-1 already exist to prevent, on a path
neither of those fixes covers.
**Fix shape**: either (a) `add_household_member()` should still open a `money` (and arguably
`change_order`) grant row with `threshold_cents = v_h.co_threshold_cents` (which may be NULL) when
`p_role = 'client_rep'`, regardless of whether the household currently names a figure — mirroring
the pattern the seed itself uses for Chidi's `draw_certify` row (a placeholder authority row with
`threshold_cents = NULL`) — so a later `set_household_threshold()` UPDATE has a row to find; or
(b) `set_household_threshold()`'s loop should also open a grant for any `client_rep` seat of a
household member that has none. Either closes the gap; (a) is the smaller change and keeps all the
grant-opening logic in one function.

**F2 — MINOR / MEDIUM confidence.** SPEC §5.7 row c quotes Ingrid Halvorsen's contact-rule clause
as "Email only. No cell for work." The seeded record (and the live picker, `roster-row.tsx`'s
rendering of it) reads "Email only. No cell for work — the shop line is the voice door."
(`supabase/seed/people_crm_dev.sql:464`). Every prior QA round back through `qa-w2-r2` (2026-09
onward) has captured this same fuller text without flagging it, which reads as either an accepted
abbreviation in SPEC's own table (most SPEC rows in §5.7 #4 are paraphrases, not all are literal
quotes the way §5.7 #7's consequence sentence is) or a fifteen-round-old miss; reported per the
brief's "never filter" instruction rather than assumed settled.

**F3 — MINOR / LOW confidence (style, not correctness).** `noticedPaperClause()`
(`apps/designer-portal/src/lib/document/compliance-notice.ts:69`) always appends `'s` for the
possessive regardless of whether the firm name already ends in "s": Ostrom Builders reads "Ostrom
Builders's insurance lapsed 31 December 2025." A firm name ending in a sibilant most naturally takes
a bare apostrophe ("Ostrom Builders' insurance…"). Cosmetic; no SPEC or ruling pins the exact
grammar, and no acceptance criterion is affected.

**F4 — MINOR / HIGH confidence, environment/process gap, not a code defect.** `sweep_compliance_expiries()`
is not called by any migration or seed file — it is a data sweep meant to be run by hand
(`w3-room-report.md` §7 already says so: "run once against the local database… it had never run
outside a rolled-back transaction"). Consequence: **every plain `pnpm supabase:reset` leaves
`studio_compliance_notices` empty**, and until the sweep is run again by hand, the bring-forward
picker's consequence sentence (SPEC §5.7 #7) reads only "Adds four seats to the Okonkwo residence.
Pete Rusk arrives opted out of texting." — missing the third, Northgate-insurance clause entirely,
even though the underlying certificate genuinely is lapsed (the "LAPSED" paper-word badge is
unaffected, since that reads `studio_compliance_documents` directly, not the notice table). This is
not wrong per the design's own rule ("the clause prints only where a notice exists — an absence
stated, never a false claim"), but it means SPEC §5.7's own acceptance string is silently
unreachable after the single most common local-dev action unless a QA agent (or a fresh contributor)
happens to know to run the sweep by hand first — which this round only discovered by noticing the
sentence was short and checking `w3-room-report.md` §7. Worth a line in the local-dev runbook (or a
`supabase/seed/*.sql` call to the function, if a seed calling a sweep function is acceptable —
Fable's call, not mine).

## 6. Tooling note (not a product finding)

The claude-in-chrome `resize_window` tool did not change the effective viewport in this session at
any point — `window.innerWidth` stayed 500px (and `outerWidth` 422px) after requesting 1440×900,
1440×960 and 700×500 in turn, and `window.screenY` placed the automation window off the primary
1329px-tall display. Because of this I could not produce genuine 1440px or 390px renders to compare
pixel-for-pixel against `shots/people-room-1440-state-pick-1440.png` / `-390`, so §4's checks above
are textual/DOM-content verification against both the reference screenshots' printed strings and
SPEC/rulings.md, not a visual diff. (Those two reference PNGs also predate R-BP — both dated
2026-09-11 13:38, before the 2026-09-14 six-person amendment — so they show "4 of 5" where the
live, current-SPEC room correctly shows "4 of 6"; this is the reference files being stale, not the
product regressing, and is not counted as a finding.) No screenshots were saved under
`build/qa-w3-r16/` as a result — the ones I could produce would misrepresent the actual rendered
width and could mislead a reader comparing them to the 1440/390 references.

## 7. Server / port

Server stopped after the walk (`npm exec next start` PID and its child `node` PID both killed);
`lsof -nP -iTCP:3000 -sTCP:LISTEN` and the 3002 equivalent both return nothing afterward. Database
reset once more at the end (clean replay, SQL suite re-run green including block 12) so the branch
is left in the same state the round started in. `git status` in the worktree is clean — no tracked
file was touched this round.

## 8. Clean?

**Not clean** — one MAJOR (F1). Zero BLOCKING findings: no wrong fact stated as fact on a face (F1's
gap is an absence, and the face is honest about the absence — "No authority on this job" — even
though that absence itself contradicts what the household band implies elsewhere), no cross-tenant
read/write, no RLS/grant hole, no consent write outside `record_channel_consent`, no reset failure,
no data loss on merge (verified: the merge test round-tripped cleanly, `resolve_merged_contact`
resolves forward, nothing was destroyed).
