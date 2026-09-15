# W3 (round 18) — runtime QA against a local production build

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no migration minted
(highest on the branch stayed `00633`, nothing touched in `00595`–`00620`); no `.env.local`
created; env passed inline per the binding instructions; no prod contact.

---

## 1. Setup

- **Port rule**: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3002` both returned no listener
  before the round started — no orphan, nothing to kill. Confirmed free again after the round's
  final stop.
- `pnpm supabase:reset` — clean replay, `Finished supabase db reset on branch main.` (run twice
  this round: once before the walk, once at the end).
- `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` — rc 0, all blocks passed
  including 13b (R-BQ) and 13c (r17 BLOCKING-1/MAJOR-1), both on the pre-walk reset and the
  final post-walk reset.
- `psql … w1a_identity_channels_consent_test.sql` / `w1b_compliance_authority_directory_test.sql`
  — rc 0, "All W1a assertions passed." / "All W1b assertions passed."
- `pnpm --dir apps/designer-portal build` with env inlined (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`,
  plus the `.env.example` service/app URLs) — exit 0, full route table printed.
- `npx next start -p 3000` (cwd `apps/designer-portal`, not `npx --prefix`, which does not resolve
  `.next` correctly and errors "Could not find a production build" — noted for the next round, not
  a product finding) — server answered 200 on `/` and a correct 307 redirect to `/auth/signin` on
  `/people` while signed out, confirming it served the real app, not a fallback.
- Restarted once mid-round (see §4, BLOCKING-1 verification) — port checked free before relaunch
  both times, killed cleanly (`kill` then confirmed) both times.

Sandbox note (not a product finding, carried from r17): `supabase db reset`, `supabase status -o
env`, `next build`/`next start`, and raw `psql` all needed the sandbox disabled — `EPERM` writing
`~/.supabase/telemetry.json.tmp.*` and denied Postgres/Docker socket access under the default
Bash sandbox. Harness restriction, not a worktree defect.

## 2. `e2e/people` (chromium)

Full suite, fresh reset, single run:

```
13 passed
9 failed:
  add-client-letter.spec.ts ×2, add-sheet.spec.ts ×3, call-sheet.spec.ts ×1,
  person-card.spec.ts ×2, bring-forward.spec.ts ×1 ("Put back clears the pick and writes nothing")
```

Exact match to r17's baseline (same 9 named failures, same counts). The first eight are the
pre-existing `getByLabel` selector-drift failures documented since r14, re-confirmed unchanged.

`bring-forward.spec.ts` reproduced r17's F5 exactly: one of its two tests failed under the full
parallel run (`"Put back clears the pick and writes nothing"`), the other passed. Isolated run
(`playwright test e2e/people/bring-forward.spec.ts`) — **2 passed**, confirming this is the same
test-infrastructure flakiness (no `test.describe.serial()` between two tests sharing one
`beforeAll`-minted project, `fullyParallel: true` with unbounded workers), not a product defect.
Carried as **F5-equiv**, not re-filed.

## 3. Sign-in

`designer@patina.dev` via Mailpit (Inbucket) at `http://127.0.0.1:54324` — OTP `493229` on the
first sign-in, `007835` on the mid-round re-sign-in after the server restart invalidated the
session (expected: `supabase db reset` clears GoTrue's session/OTP tables). Landed on `/desk` as
Leah Hartwell (`studio_owner`) both times.

Tooling note (not a product finding, carried from r16/r17): `resize_window` to 1440×900 does not
change the effective viewport — `window.innerWidth` read 500px throughout. Verification below is
DOM/textual against the picker's and rows' rendered strings, not a pixel diff against the 1440
reference PNG. Screenshots saved at the achievable width to
`build/qa-w3-r18/task5-bring-forward-4selected-r18.jpg`.

## 4. The manual walk

### Task 5 — bring forward (Okonkwo Call Sheet → From the rolodex → search "Lindqvist")

- Searching "Lindqvist" in the single-add "From the rolodex" picker switches it into the
  travel-list multi-select mode SPEC §5.7 describes (same component, not a separate dialog) —
  matches R-BM/R-C.
- "0 OF 6 FROM THE LINDQVIST KITCHEN SELECTED" before any tick — R-BP's six-person pool (Ben
  Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk) confirmed live,
  matching the specimen HTML source (`people-room-1440.html:1229` literally prints "4 of 6"),
  settled, not a finding.
- Every §5.7 #4 string checked against the six rows:
  - Dana Kowalski — "Worked 1 prior project, Lindqvist kitchen, closed 2025.", paper "LAPSED"
    ("Northgate Electric's insurance lapsed 31 March 2026."), reach "FIELD LINK", consent
    "TEXTING" — exact.
  - Pete Rusk — "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." exact (R-Q). Reach
    prints "FIELD LINK", not SPEC's literal "On paper" — **this agrees with R-BH** ("Pete Rusk
    holds his field link" though opted out of texts), which supersedes the SPEC table's literal
    for this cell; confirmed via `w1b-final-review-r10/r11/r12/r15-tests.md`. Not a finding.
  - Ingrid Halvorsen — "Email only. No cell for work — the shop line is the voice door." — the
    fuller-than-SPEC clause r16 QA filed as its F2 is still present; carried, not re-filed.
  - Claire Bissett — reach "ON PAPER", consent "NOT ASKED", paper "CURRENT" — matches R-O
    exactly. History line reads the generic "Worked 1 prior project…" rather than SPEC row d's
    literal "Saved twice, one firm."; first filed r14 QA (minor/high), re-confirmed unchanged —
    agrees with the record (she genuinely holds two `project_parties` rows), SPEC drift not a
    code defect. Carried, not re-filed.
  - Ben Ostrom / Erin Sato — "GENERAL CONTRACTOR · OSTROM BUILDERS" / "GENERAL CONTRACTOR ·
    MARROW & SONS", no third "trade" segment — r17 QA's F7 (minor/low), unchanged, carried.
  - Six-row order is alphabetical (Ben, Claire, Dana, Erin, Ingrid, Pete), not SPEC's a–f order
    (Dana, Pete, Ingrid, Claire, Ben, Erin) — r17 QA's F6 (minor/low-medium), unchanged, carried.
  - Dana's row additionally prints "Text only. The email on file bounces." — her real contact
    rule (F-11, R-BL); not in SPEC's literal row-a text but factually correct and consistent with
    how rule clauses print elsewhere in the room. Not filed as a new finding (same class as the
    carried F2, informational).
- "What travels" / "What stays behind" panes: all nine items present, exact wording, in order.
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. "4 OF 6 FROM THE LINDQVIST
  KITCHEN SELECTED" exact. Terminal act read "ADD TO THE ROSTER" (no count — correct, all four
  already seated on Okonkwo from the seed).
- **Click-count check** against `direction.md` §6 task 5's proposed figure ("6 for all four"):
  search (1) + four ticks (4) + one confirm (1) = **6**, matching exactly.
- Pressed "Add to the roster." Consequence sentence, exact: "Adds no seats to the Okonkwo
  residence. Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the call
  sheet." **Verified in Postgres**: `project_parties` count for Okonkwo unchanged at 24 before
  and after the press. No partial write, no duplicate seat.
- Screenshot: `build/qa-w3-r18/task5-bring-forward-4selected-r18.jpg`.

**Reference-screenshot note (informational, not a finding).** The task directed comparison
against `shots/people-room-1440-state-pick-1440.png` and `-390`. Both PNGs still print "4 of 5"
and omit Erin Sato — they were never regenerated after R-BP amended the pool from five to six
(2026-09-14). The specimen **HTML source** (`people-room-1440.html:1229`, `people-room-390.html`)
and the live room both correctly print "4 of 6" and list Erin Sato unticked. The PNGs are stale
artifacts of an earlier ruling round, not evidence of a live defect — the live room agrees with
the current source and the current ruling.

### Compare & merge (two duplicate cards)

Minted a duplicate-phone pair directly (`QA Older Duplicate` / `QA Newer Duplicate`, same
`+16125559931`, ages 30 days apart) mirroring `e2e/people/merge.spec.ts`'s own pattern, walked it,
then deleted both rows plus the merge record.

- Directory band: "These two cards share a phone." + "QA Newer Duplicate" + "QA Older Duplicate
  COMPARE THESE TWO" — matches R-Y wording.
- Sheet: nine fields, two columns, older card pre-picked as survivor ("KEEPS THE CARD") — PR-o.
  Evidence "They share a phone number", consequence sentence matching R-BN's template verbatim
  with names substituted.
- After "Merge into QA Older Duplicate": URL navigated to the survivor's person card
  automatically.
- **Verified in Postgres**: `merged_into` set on the absorbed row, `studio_contact_merges` holds
  `(survivor, merged, matched_on='phone')`, `resolve_merged_contact(merged_id)` returns the
  survivor. Cleanup deleted both rows and the merge record; zero residue afterward.

**MAJOR (corroborated, not independently discovered — see below) — the merge does not deduplicate
seats of the same kind on the same job, and does not reconcile the money authority each seat may
carry.** The concurrent migrations review this round (`w3-review-r18-migrations.md` §2, MAJOR-1)
found this first; I independently reproduced it myself, live, in a rolled-back transaction,
because it sits squarely inside the task I was asked to walk ("merge two duplicate cards"):

```
BEFORE — two cards, one client_rep seat each, on the same job (Okonkwo):
  seat A  client_rep  $10,000  agreement §4
  seat B  client_rep  $2,500   client_households.co_threshold_cents

merge_studio_contacts(A, B, 'phone')  -- A survives

AFTER — the survivor card holds BOTH seats, BOTH grants still open:
  seat A  client_rep  $10,000  agreement §4
  seat B  client_rep  $2,500   client_households.co_threshold_cents   (studio_contact_id now = A)
```

`merge_studio_contacts()`'s seat block (`00629:2400-2401`) repoints `studio_contact_id`
unconditionally (`UPDATE project_parties SET studio_contact_id = p_survivor WHERE
studio_contact_id = p_merged`) with no check for whether the survivor already holds a seat of the
same `party_kind` on the same `project_id` — there is no such uniqueness constraint on
`project_parties`. The result is one human holding two simultaneously live seats on one job, each
with its own open money grant, and the Call Sheet's Client side band would print both figures
("Signs money to $10,000." beside "Signs money to $2,500.") over a record that had just told the
studio the two cards are one person. This is exactly the harm PR-c/PR-n and the merge's own
consequence sentence exist to prevent, and it directly contradicts the R-BQ/F8 fix I verified is
otherwise correct (§ below) — the household figure act itself is scoped correctly, but the merge
act that is supposed to converge two cards onto one instead doubles the seat it should fold.

Severity: **major**, not blocking — no cross-tenant read/write, no fabricated value, and a repair
exists in the room (Close this seat / Revoke on the extra seat's grant, both of which the
existing owner/admin policies permit). What is broken is that the merge sheet's promise
("seats … move onto the survivor") does not hold when the survivor already has one, and nothing
on the face says so. Confidence: **high** (reproduced twice — once with two ordinary trade seats
and once with the exact household-authority shape above, both rolled back, zero residue).

### Edit a bid outcome (R-BR: correcting away from "withdrawn")

Rivera Finishes LLC (`d0e30000-…-91`), seeded `no_response` bid, `bid_asked_at 2026-09-28`,
`bid_due_at 2026-10-05` — exact match to `w3-room-report.md` §4.

1. Set outcome to "They withdrew." **Verified in Postgres**: `bid_outcome='withdrawn'`,
   `stage='off_job'`, `off_job_at='2026-09-15'` — correct, the withdrawal stamp works.
2. Corrected outcome to "Selected." **Verified in Postgres**: `bid_outcome='selected'`,
   `stage='awarded'`, `off_job_at` and `off_job_reason` both cleared to NULL. Re-opened the Call
   Sheet: Rivera Finishes now reads "AWARDED" with no stale "Off the job" clause, correctly moved
   out of the closed band into the crew list. **R-BR is fixed and correct for this exact
   scenario** — matches the r17 fix log's claim precisely.

**BLOCKING (corroborated, not independently discovered — see below), confidence high — the R-BR
fix is written wider than the ruling and destroys the record of a seat the studio closed BY HAND,
reopening it.** The concurrent code review this round (`w3-review-r18-code.md` BLOCKING-1) found
this first; I independently reproduced it myself, live, through the actual browser UI (not code
inspection), because it is a second, adjacent path through the exact task I was asked to walk:

- Seeded a probe seat carrying a real bid (`bid_asked_at`/`bid_due_at` set) that the studio had
  **closed by hand** via "Close this seat" — `stage='off_job'`, `off_job_at='2026-09-10'`,
  `off_job_reason='QA hand-closed: awarded to someone else'` — never via a bid withdrawal.
- In the live Call Sheet, "Change what came back" is offered on this row exactly as the code
  review describes (`isSeat && (band === 'bidding' || hasBid)` — the editor doesn't check
  whether the seat is already closed).
- Set "How it came back" to "They declined" and pressed "Write the bid."
- **Verified in Postgres before/after**:
  ```
  before: stage=off_job   off_job_at=2026-09-10   off_job_reason='QA hand-closed: awarded to someone else'
  after:  stage=declined  off_job_at=NULL          off_job_reason=NULL
  ```
- **Verified on the face**: the row left the "Done" band (which dropped from 2 to 1, Granite
  North only) — the studio's own closing note ("QA hand-closed: awarded to someone else") is
  gone, unrecoverable (`project_parties` carries no audit trail for `off_job_reason`), and the
  seat now reads as if it had never been closed.

`use-coordination.ts`'s `useSetPartyBid` clears `off_job_at`/`off_job_reason` whenever
`written.stage` is truthy and the outcome isn't itself `withdrawn` — R-BR says to clear them only
when the correction moves the seat **away from `'withdrawn'`**, not on any stage-writing save.
Because `'off_job'` is deliberately absent from `SEAT_STAGES_PAST_THE_BID` (to keep a different
correction door open, per the r17 fix log), a hand-closed seat's `previous.bidOutcome` is `null`
(or whatever the bid was before the studio closed it) rather than `'withdrawn'`, so the branch's
current `else if (written.stage)` fires and wipes the columns regardless. This is data loss (the
studio's own sentence, written once, held nowhere else) and a wrong fact on a face (the seat
reopens, `CloseSeatAct`/"Close this seat" is offered on it again as if fresh). Both blocking
criteria this brief names are met independently: data loss and a wrong fact on a face.

Cleanup: probe seat and its contact row deleted after verification; zero residue.

### Household — add a member with a threshold, as the principal; confirm a member cannot

Signed in as Leah Hartwell (`studio_owner`) — the principal for PR-n's purposes. This directly
re-verifies r17's F8/BLOCKING-1 (R-BQ's fix).

1. "Add a household member" → Dana Kowalski, "Signs for the household" (client_rep). Consequence
   sentence exact: "Dana Kowalski joins the household and takes a seat on the Okonkwo residence.
   Nothing is sent to them." **Verified in Postgres**: new `client_rep` seat opened for Dana, no
   `project_party_authority` row on either of her seats yet (household had no figure at add
   time) — matches R-BQ's "the figure opens nothing" half.
2. "Set the figure" → $2,500. Face read "Change orders over $2,500 need a signature from the
   household." **Verified in Postgres immediately after**: Dana's new `client_rep` seat carries
   **no** `project_party_authority` row — **the figure alone opened nothing**, confirming F8 is
   fixed. The face correctly showed the "Record the authority" gap region instead: "Dana Kowalski
   signs for the household but has no figure of their own on the Okonkwo residence. Nothing
   defaulted from the agreement." / "Dana Kowalski may sign money to $2,500 on the Okonkwo
   residence. No other job changes. Nothing is sent to them." with a live "RECORD THE AUTHORITY"
   button — exactly the replacement mechanism the r17 fix log describes.
3. Pressed "Record the authority." **Verified in Postgres**: Dana's `client_rep` seat now carries
   `project_party_authority(threshold_cents=250000, source_clause='client_households.co_threshold_cents',
   source_household_id=<Okonkwo household>)`; her `sub · electrical` seats on Okonkwo AND on the
   Lindqvist kitchen (a different project she also holds a seat on) both carry **no** grant —
   the named act reached only the job it named. The "Record the authority" region correctly
   disappeared from the face after the write.
4. **Confirmed a member cannot**, via direct RPC probes as a temporary studio `member` (inserted
   and removed inside rolled-back transactions, zero residue):
   - `set_household_threshold(...)` → `ERROR: household_threshold_forbidden`, HINT "A
     change-order figure is the principal's to set, and the principal's to take away (PR-n)."
   - `add_household_member(...)` for a new `client_rep` member while the household already
     holds a live threshold → `ERROR: household_grant_forbidden`, HINT "Only an owner or an
     admin of the studio may set a money authority (PR-n)." — the whole act refused, not just
     the grant half.

**F8/R-BQ confirmed fixed and correct** in the live UI, corroborating the SQL suite's blocks 13b
and 13c and the r17/r18 migrations reviews' own re-measurements. Not a finding.

Left standing, not re-filed (r17 fix log's own note, unchanged): a grant standing on a seat the
studio later closed is only ended when the household's figure is next touched — observed directly
in this round too (Dana's household seat, closed in the next section, kept `threshold_cents=250000`
with `effective_to` still NULL). Named in the r17 fix log as accepted, not this round's finding.

### Close a seat with a reason

Closed Dana Kowalski's newly-created household `client_rep` seat via her expanded row on the Call
Sheet ("CLOSE THIS SEAT"), reason "QA round 18 close-seat walk." **Verified in Postgres**:
`off_job_at='2026-09-15'`, `off_job_reason='QA round 18 close-seat walk'`, `threshold_cents`
unchanged at 250000 (per the "left standing" note above — expected, not a new finding). Her
person card correctly listed the seat under "PAST SEATS · Okonkwo residence · household member ·
OFF THE JOB · Closed 15 Sep 2026" — consistent across both surfaces.

### Archive / restore as owner

"Put this card away" on Dana Kowalski's person card → face read "This card was put away
15 September 2026. It stays out of the book until it is brought back." with "Bring this card
back" live. **Verified**: `studio_contacts.archived_at` stamped. Restored: `archived_at` cleared
to NULL. Both acts single-press, correct as the owner.

## 5. Console

One recurring pre-existing error, unchanged from r16/r17, first seen before any of my own
actions:

```
Error logged: AppError: permission denied for table schedule_proposals
```

`schedule_proposals` predates this branch (00475/00476) and is not touched by any W1–W3
migration — the Document's Schedule feature firing on page load regardless of anything exercised
this round. Not counted toward this program's verdict (out of scope, pre-existing, not reachable
from any act I exercised), reported per "never filter."

No other console errors or warnings appeared during the entire manual walk (bring-forward, merge,
bid edit ×2 seats, household add/threshold/record-authority/member-refusal, close-seat,
archive/restore).

## 6. Server / port

Server stopped and port confirmed free twice this round (once before the mid-round restart used
to verify the code review's BLOCKING-1 live, once at the end). `lsof -nP -iTCP:3000 -sTCP:LISTEN`
returned nothing after each stop. Database reset a final time at the end (clean replay, SQL suite
re-run green including blocks 13b/13c) so the branch is left in the same state the round started
in.

`git status` in the worktree at the end of this round shows only this report and its screenshot
as new files from my own session; the concurrent migrations- and code-review rounds' own new
files (`w3-review-r18-migrations.md`, `w3-review-r18-code.md`, six `probe-r18-*.sql` files) were
already present when I reached this step — not mine, left untouched.

## 7. Findings

**BLOCKING · confidence high (corroborated independently, live, through the actual browser UI —
see `w3-review-r18-code.md` BLOCKING-1 for the code-level root cause).** Recording ANY bid-outcome
correction on a seat the studio closed by hand (`useCloseProjectPartySeat`, not a bid withdrawal)
erases `off_job_at` and `off_job_reason` and reopens the seat, because `useSetPartyBid`'s clearing
branch fires on any stage-writing save rather than only on a correction away from `'withdrawn'`
(R-BR's actual scope). Data loss (the studio's own closing sentence, held nowhere else) and a
wrong fact on a face (the seat reads as live again, "Close this seat" reoffered). See §4, "Edit a
bid outcome."

**MAJOR · confidence high (corroborated independently, live, in Postgres — see
`w3-review-r18-migrations.md` MAJOR-1 for the full analysis including the two-household variant).**
`merge_studio_contacts()` repoints seats onto the survivor unconditionally, with no check for
whether the survivor already holds a seat of the same kind on the same job. Two duplicate cards
each carrying their own live money authority on one project converge into one card holding TWO
open seats and TWO open, unreconciled grants — a reader disagreeing with the record on the Call
Sheet's Client side band. See §4, "Compare & merge."

**MINOR · confidence high — carried, unchanged (r17 QA F5).** `bring-forward.spec.ts` is flaky
under the full `e2e/people` suite's default parallelism; reliable in isolation. Test
infrastructure, not a product defect.

**MINOR · confidence low-medium — carried, unchanged (r17 QA F6).** The bring-forward picker's
six candidate rows render alphabetically, not in SPEC §5.7 #4's literal a–f order. No content is
wrong on any row.

**MINOR · confidence low — carried, unchanged (r17 QA F7).** Ben Ostrom's and Erin Sato's
bring-forward rows omit the third "trade" segment SPEC shows, because neither "general
contracting" nor "project management" is a `FieldTrade` enum value. SPEC-vocabulary gap, not a
wrong fact.

**Carried, not re-filed as new (still open, previously reported, all re-confirmed unchanged this
round):**
- r16 QA F2 (minor/medium) — Ingrid Halvorsen's picker-row rule clause is fuller than SPEC's
  quoted text.
- r16 QA F3 (minor/low) — `noticedPaperClause()`'s possessive grammar ("Builders's").
- r16 QA F4 (minor/high, environment) — `sweep_compliance_expiries()` must be run by hand after
  every reset; not wired into a migration or seed.
- r14 QA (minor/high) — Claire Bissett's bring-forward history line reads the generic "Worked 1
  prior project…" rather than SPEC row d's literal "Saved twice, one firm."; agrees with the
  record (she genuinely holds two `project_parties` rows) — SPEC drift, not a code defect.

**Informational, not a severity-tagged finding:**
- The reference PNGs (`shots/people-room-1440-state-pick-1440.png`, `-390`) this round's brief
  directed comparison against are stale — printing "4 of 5" and omitting Erin Sato — from before
  R-BP amended the pool to six. The specimen HTML source and the live room both correctly print
  "4 of 6." The PNGs need regenerating, not the room.
- Dana Kowalski's bring-forward row prints an accurate contact-rule clause ("Text only. The
  email on file bounces.") that SPEC §5.7 #4 row a's literal text does not list. Factually
  correct, same class as the carried F2 — not filed as a defect.

## 8. Clean?

**Not clean.** One BLOCKING (bid-outcome correction on a hand-closed seat erases the closing
record and reopens the seat) and one MAJOR (merge does not deduplicate seats/authority when the
survivor already holds a seat of the same kind on the merged job), both corroborated
independently through my own live walk rather than only cited from the concurrent code/migrations
reviews. Zero data loss on merge itself (the merge act round-tripped cleanly and
`resolve_merged_contact` resolves forward — the MAJOR is a downstream consequence the merge act
leaves standing, not data destroyed by the merge). No cross-tenant read/write observed. No
RLS/grant hole observed (both new findings are missing predicates in `SECURITY DEFINER`/hook
logic, not policy or grant misconfiguration). No consent write outside `record_channel_consent`
observed. No reset failure. R-BQ/F8 and R-BR's core scenario (Rivera Finishes,
withdrawn→selected) are both confirmed fixed and correct.
