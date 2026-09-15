# W3 round 15 — runtime QA against a local production build

Local production build (`next build --webpack` then `next start -p 3000`), env passed inline
per the binding ENV rules — no `.env.local` created. `pnpm supabase:reset` run first (clean
replay, head `00633`). Server started, `e2e/people` run, then a live walk signed in as
`designer@patina.dev` (Leah Hartwell, studio owner) via Inbucket OTP. Server stopped at the end;
port 3000 confirmed free.

**Verdict: NOT clean — zero blocking, ONE major (independently reproduced, corroborates a
fresh finding from this same round's migrations review), zero minor from this walk.**

---

## 0. Setup, measured

```
pnpm supabase:reset            → clean replay, "Finished supabase db reset on branch main."
pnpm turbo build --filter='@patina/designer-portal^...'  → 6/6 cached, FULL TURBO
pnpm --filter @patina/designer-portal build               → route table built, /people present
next start -p 3000 (inline env)                            → "Ready in 89ms", curl / → 200
```

`lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting: empty (no orphan, no conflict — PORT RULE
not invoked). Env passed inline (local Supabase URL, anon/service keys from `supabase status
-o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`).
No `.env.local` exists or was created in the worktree (checked).

## 1. `e2e/people` (chromium), pasted

```
14 passed, 8 failed (5.2m)
✓ bring-forward.spec.ts:117 › task 5 — search the prior job, tick four, one confirm
✓ bring-forward.spec.ts:264 › Put back clears the pick and writes nothing
✓ merge.spec.ts:81 › the duplicate band merges two cards into one (PR-o)
✓ directory.spec.ts (6/6) · company-card.spec.ts (2/2) · call-sheet.spec.ts (1/3, "task 6" passed)
✗ add-client-letter.spec.ts (2) · add-sheet.spec.ts (3) · call-sheet.spec.ts:91 (1) ·
  person-card.spec.ts (2)
```

**Identical to `w3-fix-log-r14.md`'s own count and file list** ("14 passed / 8 failed... in
`add-sheet.spec.ts` (3), `person-card.spec.ts` (2), `add-client-letter.spec.ts` (2) and
`call-sheet.spec.ts` (1)"). No file touched this round changed any of those four specs or the
surfaces they exercise (r14's diff was `00629`, a merge-sweep SQL test, `psql.ts`, and the two
now-passing specs). **Not a new finding, not re-filed** — carried forward exactly as r14 flagged
it "to the orchestrator," unresolved: `add-sheet.spec.ts`'s `addSub` helper (`page.getByRole
("button", {name:"Add to the roster"}).click()` then poll `cardByName`) still times out waiting
for the new card to resolve in two independent spec files, and r14 already said this one
("could be a product defect") is uncharacterized. I did not re-characterize it this round — out
of this brief's six named tasks, and the two failing specs never touch bring-forward, merge, bid,
household, close-seat, or archive.

## 2. Task 5 — bring forward (SPEC §5.7)

Opened the Okonkwo Call Sheet → "From the rolodex", searched "Lindqvist".

- **"4 of 6 from the Lindqvist kitchen selected"** appears verbatim once four of the six rows
  are ticked (§5.7 #3 — R-BP's six-not-five amendment, confirmed).
- **Six rows present**: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen,
  Pete Rusk — **alphabetical**, not the SPEC table's a–f narrative order. This is the *r10/r12/
  r13-logged, already-settled non-mismatch* ("SPEC §5.7 does not assert an ordering rule") —
  re-confirmed, not re-filed.
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett (Stonehaven Tile Gallery —
  "the Stonehaven rep"). Erin Sato and Ben Ostrom stayed unticked; no verdict text anywhere.
- **Travel-list pane**, verbatim: "What travels" → identity, typed channels, contact rule,
  consent by channel value, document expiries, one history line. "What stays behind" → prior
  pricing, prior project notes, show to client. (The "prior" vs SPEC's literal "2025 pricing /
  2025 project notes" is the *already-logged* `w3-review-r11-code.md` m1 divergence — re-measured
  present, not re-filed.)
- **Act row first**: "Add four to the roster" / "Put back", both live (no `aria-disabled`).
- **Consequence sentence**, byte-for-byte: "Adds four seats to the Okonkwo residence. Pete Rusk
  arrives opted out of texting. Northgate Electric's insurance lapsed 31 March 2026."
- Screenshot compared against `shots/people-room-1440-state-pick-1440.png`: layout, row grammar
  (checkbox, 34px circle, name/firm/trade, history line, three words), and every string match —
  the only differences are the two already-logged ones above. Screenshot saved:
  `build/qa-w3-r15/task5-pick-1440.jpg`.
- **390 width**: could NOT be captured this round — the browser-automation tool's `resize_window`
  call reported success but the tab's actual viewport stayed at 1440 (`window.innerWidth` read
  1440 after the call; `screenshot` output stayed 1400×855 regardless). This is a tool limitation
  in this session, not a product observation — **not verified this round**. r12/r13's own 390
  screenshots (`task5-pick-390-viewport-only.png`) already measured zero overflow and full string
  parity for this state and nothing in scope this round touches the picker's CSS, so it is carried
  forward rather than asserted fresh.
- **Pressing "Add four to the roster" against Okonkwo itself refused all four**, naming them:
  "Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the call sheet." This
  is the room's own documented, deliberate behavior — `bring-forward.spec.ts`'s own header comment
  says so explicitly: *"The seed already seats those four on the Okonkwo residence — that is the
  fixture's whole point — so a spec that brought them THERE would only ever read 'already on the
  call sheet'."* The spec instead opens a fresh project to test a real insert; that insert already
  passed (`bring-forward.spec.ts:117`, above), with its own DB-level assertions (channel values
  written, no consent/bid/show_to_client column touched, per-row refusal naming). My manual press
  exercised the **refusal path** correctly — refusal named per person, nothing silently duplicated,
  nothing silently dropped. Not a finding.

## 3. Merge two duplicate cards

No duplicate exists in the base seed (the merge spec creates its own pair and tears it down). I
inserted a fresh pair directly (`Wren Ashby QA` / `W. Ashby QA`, same `+16125559931`, same shape
the spec uses) to exercise the live UI, then removed it after.

- Directory showed the band: **"These two cards share a phone. W. Ashby QA Wren Ashby QA COMPARE
  THESE TWO"** — both names live open-person links, "Compare these two" as the secondary word
  (R-Y, verbatim).
- Sheet pre-picked the **older** card (Wren Ashby QA, "in the book since 1 March 2024") as
  survivor over the newer (W. Ashby QA, "1 August 2026") — PR-o confirmed.
- Consequence sentence rendered correctly and data-driven (no contact rule on either card → no
  "contact rule" clause; no firm on either → no firm-designation clause — the sentence only names
  what actually exists to move, matching R-BN's "shows both values wherever a reduction will
  pick one").
- Pressed "Merge into Wren Ashby QA". Directory count dropped from 42 → 41. Survivor's card
  opened; **URL carried the OLD (folded) id** (`?person=…a1`… — actually the SURVIVOR's id, since
  I'd assigned the older row that id) and the room announced the merge.
- **Both ids resolvable, confirmed**: navigating directly to `?person=<the folded id>`
  auto-resolved to the survivor's card ("Wren Ashby QA") rather than 404ing or showing a dead
  card — `resolve_merged_contact()` verified live, not just by the room-report's prose.
- DB: `studio_contact_merges` row correct (`survivor_id`/`merged_id`/`matched_on='phone'`/
  `merged_by`=the signed-in designer/`merged_at` present). No cross-tenant leak (single org
  throughout), no data loss observed on the collision fields checked (name, phone, "in the book
  since" dates both read correctly pre-merge).

Cleaned up: deleted the test pair's `studio_contact_merges` row, channels, and both
`studio_contacts` rows afterward (`DELETE ... WHERE id IN (...)`, explicit ids only).

## 4. Edit a bid outcome

Okonkwo Call Sheet → Bidding band → Rivera Finishes ("No response", "Asked 28 September 2026.
Due 5 October 2026."). Opened "Change what came back" → the seven-field editor appeared exactly
as the room-report describes. Set "How it came back" → Selected, filled both dates (10/09/2026),
"Who priced it" → **person cards only** (confirmed: the dropdown lists 29 people, zero firms —
"who priced it offers person cards only" held), chose Tom Marrow.

- Consequence sentence, live and correct: "Recording this moves Rivera Finishes to Awarded. A
  bidder who did not win never reads as crew."
- Pressed "Write the bid". Rivera Finishes **moved out of the Bidding band into "On the job ·
  this week"** with badge **AWARDED** and note "Asked 28 September 2026. Due 5 October 2026.
  Quoted 9 October 2026. Selected 9 October 2026. Priced by Tom Marrow." — matches R-R's bid-note
  format; every dated event is its own fact, none derived from the outcome.
- DB confirmed: `bid_outcome='selected'`, `stage='awarded'` (the `SEAT_BID_OUTCOME_STAGE` mapping
  held), `bid_quoted_by_person_id` = Tom Marrow's card id, all three dates written.

Screenshot saved: `build/qa-w3-r15/task-bid-awarded-1440.jpg`.

## 5. Household — add a member with a threshold, principal vs. member

The Okonkwo client side carried no household (the seed's honest state — "No household is on file
for this client yet... OPEN A HOUSEHOLD"). Opened one via the door; band correctly showed "No
change-order figure is on file for this household." with "SET THE FIGURE" / "ADD A HOUSEHOLD
MEMBER".

- **As the principal** (signed in as Leah Hartwell — checked: she is the studio's `owner` in
  `organization_members`, which is what `set_household_threshold()`'s
  `is_org_admin_or_owner()` gate actually keys on, not household-client role; the UI copy says
  "the principal's to set" but the enforced predicate is studio owner/admin — worth naming so the
  copy and the gate aren't misread as the same axis): typed `2500`, live consequence sentence
  updated as I typed ("Change orders over $2,500 will need a signature from the household. Every
  household member who already signs money from this figure moves to $2,500, on every job.
  Nothing is sent to them."), pressed "Write the figure" → succeeded, band now reads "Change
  orders over $2,500 need a signature from the household."
- **As a plain studio member — confirmed refused.** No plain-`member`-role user is seeded
  anywhere in the database (`organization_members` holds only `owner` and `admin` rows across
  every org), so there is no real portal account to sign into for this half of the test. I
  impersonated one at the RPC/RLS layer instead (temporarily added `support@patina.dev` as
  `member` of the studio, called `set_household_threshold()` as them inside a transaction, then
  rolled back and removed the temporary membership): **refused**, `household_threshold_forbidden`,
  hint *"A change-order figure is the principal's to set, and the principal's to take away
  (PR-n)."* — matching the UI's own refusal sentence exactly. This is the RPC path the UI's
  `useSetHouseholdThreshold` renders; a live UI walk as a genuine plain-member portal user was not
  possible against this seed and is flagged as **not verified via the UI** — only at the RPC/RLS
  boundary the UI calls into.
- **Add a household member**: picked Dale Whitcomb from "Choose someone from the book" (a person
  card already on the studio's book but not yet seated on Okonkwo), role "Signs for the
  household," consequence sentence correct ("Dale Whitcomb joins the household and takes a seat
  on the Okonkwo residence. They may sign money to $2,500."). Pressed "Add to the household":
  Dale Whitcomb appeared as a new **Household member** row, seated on Okonkwo, "Signs money to
  $2,500." DB confirmed: `client_households.member_person_ids` grew by his card id;
  `project_party_authority` row written with `scope='money'`, `threshold_cents=250000`,
  `source_clause='client_households.co_threshold_cents'`, `effective_from`=today, `effective_to`
  NULL, on a **new** `client_rep` seat.

## 6. MAJOR — a closed seat keeps its household money grant, and the Call Sheet prints it as live

**Severity: major. Confidence: high — independently reproduced live on Okonkwo, corroborating
`w3-review-r15-migrations.md` MAJOR-1 (measured this same round on Cedar Lane Study).**

Directly observed in my own walk, no contrived setup needed: after pressing "Close this seat" on
Dale Whitcomb's row (task 6 below) and confirming, the row's badges correctly flipped to
`OFF THE JOB`, but the same row **still printed "Signs money to $2,500."** underneath his name —
the household money-authority clause the room prints for a live grant, with no "Closed <date>"
qualifier anywhere on that line. The Call Sheet's Client-side band therefore shows one fact
(closed) and one clause (signs money) that contradict each other on the same row, with no act
between them — a reader (a designer glancing at the Call Sheet, or a client-facing "who signs
what" question) is told Dale Whitcomb both left the job and still holds authority to sign a
change order on it.

I then reproduced the underlying write-path defect the parallel migrations review filed this
round, on Okonkwo rather than their Cedar Lane Study, in a ROLLBACKed transaction as the signed-in
designer:

```sql
-- BEFORE: Dale's seat is off_job (closed by the UI moments earlier)
 id: be5cefe5-…  stage: off_job  off_job_at: 2026-09-15

-- add_household_member(household, Dale's card, 'client_rep', Okonkwo) called again
-- (the same act the Call Sheet's "Add a household member" control invokes)
 returns: be5cefe5-…                       -- the SAME closed seat id, no new row opened
 seat count for this card on this project: 1   -- confirmed no new seat was created

-- AFTER: same seat, still off_job, now carrying an OPEN money grant
 threshold_cents: 250000  effective_to: NULL
 source_clause: client_households.co_threshold_cents
 off_job_at: 2026-09-15  stage: off_job
```

`add_household_member()`'s seat lookup (`00632:364-370`) matches on `project_id` +
`studio_contact_id` + `party_kind` only, `ORDER BY created_at LIMIT 1` with no `off_job_at IS
NULL` leg, so it reattaches to the oldest matching row regardless of whether the studio closed it.
The money grant it then writes carries `effective_to = NULL` — unrevoked, live authority — on a
seat the room's own "Close this seat" act says left the job. `set_household_threshold()`'s update
loop (`00632:560-570`) has the identical gap.

This is squarely inside this round's six named tasks (task 6, "add a household member with a
threshold," and task 6, "close a seat with a reason," in combination) and is a reader — the Call
Sheet's own Client-side row — disagreeing with the record (the seat's `off_job_at`), which is this
brief's MAJOR definition. Filed here as an independent live corroboration; the migrations review's
`w3-review-r15-migrations.md` §3 has the full source citation, the fix-location note, and a second
probe (`probe-r15-a-closed-seat-household.sql`) already staged — I am not duplicating the fix
recommendation, only confirming the defect reproduces on a second project with a second seat via
the UI's own controls, and that its face-level symptom (the stale "Signs money to $2,500." clause
on a closed row) is visible without needing to re-invoke `add_household_member()` at all.

**Not independently re-verified this round** (read, not re-run live): `w3-review-r15-code.md`
MAJOR-1 (the household band's query key is never invalidated by seat/authority mutations, so it
can show a stale grant or a stale "seat the client first" door for up to five minutes) and MAJOR-2
(`CloseSeatAct` duplication claim). Both are in-scope of what I walked (household + close-seat)
and worth the orchestrator's attention alongside this section, but I did not exercise the specific
repro sequences either describes (an authority-grant-then-household-add race, and a two-surface
`CloseSeatAct` diff) inside this session's time budget.

## 7. Close a seat with a reason

Dale Whitcomb's Call Sheet row → "Close this seat" → two-step act appeared: "Close Dale
Whitcomb's seat? The seat stays on the job with the day it closed, and everything it carries stays
with it." with a "WHY IT CLOSED" reason field, "Close the seat" / "Keep it open" /
"Added by mistake" (three options, matching the room-report's "two-step dated close" plus the
surviving hard-delete escape hatch). Filled "Moved out of state; no longer acting for the
household." and pressed "Close the seat": row confirmed "Dale Whitcomb's seat is closed.", badge
flipped `ON THE JOB` → `OFF THE JOB`.

DB confirmed: `stage='off_job'`, `off_job_at='2026-09-15'` (today, dated correctly),
`off_job_reason='Moved out of state; no longer acting for the household.'` — exact text, no
truncation. (The stale-authority-clause defect this closure surfaced is §6 above.)

## 8. Archive / restore as owner

Dale Whitcomb's person card → "Put this card away" → confirmed: "This card was put away 15
September 2026. It stays out of the book until it is brought back." with "BRING THIS CARD BACK".
DB confirmed `archived_at` set to the current timestamp. Pressed "Bring this card back" →
confirmed: door reverted to "Put this card away", DB confirmed `archived_at` cleared to NULL.
Both acts performed as the studio owner (Leah Hartwell); no separate non-owner archive attempt was
made (`useArchiveStudioContact`/`useRestoreStudioContact` route through 00629's RPCs which restate
the 00417 owner/admin rule — not independently re-probed as a non-member this round; the household
threshold probe in §5 already exercises the analogous non-owner-refusal shape at the RPC layer for
a sibling feature).

## 9. Console

Console tracking armed fresh after a full reload of `/doc/<Okonkwo>` (Call Sheet opened) and of
`/people?role=all&scope=studio` — **zero messages of any kind** on both (not just zero errors;
the read returned "No console messages found for this tab" after the reload, meaning no
console.log/warn/error fired at all during load + interaction).

## 10. Shutdown

`kill <pid>` on the `next start` process, `sleep 5`, `lsof -nP -iTCP:3000 -sTCP:LISTEN` → empty.
Port confirmed free.

## 11. Not findings (settled / out of scope)

- Every ruling in `rulings.md` §3 — none reopened.
- The bring-forward picker's alphabetical row order (§2 above) — r10/r12/r13-settled, SPEC
  asserts no ordering rule.
- "prior pricing/notes" vs SPEC's literal "2025 pricing/notes" (§2 above) — `w3-review-r11-code.md`
  m1, already logged, not a shipped defect per that finding's own framing (design-target text,
  the picker's own words are internally consistent).
- The 8 pre-existing `e2e/people` failures (§1) — identical to r14's own count/file list, not
  touched by anything in scope this round, already flagged to the orchestrator by name.
- Rivera Finishes' bid was left in the "Selected/Awarded" state after this walk (not reset) —
  the branch's next `pnpm supabase:reset` restores the seed; not flagged as a defect.
