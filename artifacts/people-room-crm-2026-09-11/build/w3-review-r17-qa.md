# W3 (round 17) — runtime QA against a local production build

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no migration minted
(highest on the branch stayed `00633`, nothing touched in `00595`–`00620`); no `.env.local`
created; env passed inline per the binding instructions; no prod contact.

---

## 1. Setup

- `pnpm supabase:reset` — clean replay, `Finished supabase db reset on branch main.`
- `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` — rc 0, all blocks passed,
  including block 13 (r16 MAJOR-1's two-household fix) and block 13b (r16 F1's grant-on-add
  fix). Re-run again at the end of the round after a second reset — still green.
- `pnpm --dir apps/designer-portal build` with env inlined (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`,
  plus the `.env.example` service/app URLs) — exit 0, full route table printed, 137+ routes.
- Port 3000 checked free (`lsof -nP -iTCP:3000 -sTCP:LISTEN` — no listener) before start; port
  3002 also checked free and left untouched throughout. `npx next start -p 3000` in the
  background; server answered 200 on `/`.

Sandbox note (not a product finding): several setup commands (`supabase db reset`,
`supabase status -o env`, `docker ps`) failed under the default Bash sandbox with
`EPERM`/`operation not permitted` writing to `~/.supabase/telemetry.json.tmp.*` or reading the
Docker socket. Re-run with the sandbox disabled for those specific commands; this is a harness
restriction, not something in the worktree.

## 2. `e2e/people` (chromium)

Full suite, fresh reset, single run:

```
13 passed
9 failed:
  add-client-letter.spec.ts ×2, add-sheet.spec.ts ×3, call-sheet.spec.ts ×1,
  person-card.spec.ts ×2, bring-forward.spec.ts ×1 ("Put back clears the pick and writes nothing")
```

The first eight are the same pre-existing test-authoring failures (`getByLabel` selector drift
against the shipped Add sheet's markup) documented since the r14 QA round and re-confirmed
unchanged by r16 QA — not re-litigated here.

**New this round: `bring-forward.spec.ts` is flaky under the full-suite parallel run.** Three
consecutive full-suite runs (no reset between the first two, one fresh reset before the third)
produced three different results for this one file:

| Run | bring-forward result |
|---|---|
| 1 (dirty carry-over) | "Put back clears the pick and writes nothing" failed; "task 5" passed |
| 2 (same dirty state) | "task 5 — search the prior job, tick four, one confirm" failed; "Put back" passed |
| 3 (fresh reset) | "Put back clears the pick and writes nothing" failed; "task 5" passed |

Both tests share one `beforeAll`-minted project (no `test.describe.serial()`), and
`playwright.config.ts` runs `fullyParallel: true` with `workers: undefined` (unbounded
locally) — under full-suite load the two `bring-forward` tests, or contention from other
files' workers hitting the same local Postgres/Next server, appear to race. Isolated runs are
reliable: `playwright test e2e/people/bring-forward.spec.ts` alone (2 workers) — 2 passed;
filtering to just the failing test name alone — 1 passed. My own careful, single-actor manual
walk of task 5 below (§4) also behaved correctly and matched the record exactly. This reads as
test-infrastructure flakiness (resource contention under full parallelism), not a product
defect — but it is a genuine change from r16's clean "14 passed / 8 failed, no bring-forward
failures" baseline, so it is reported as **F5** below rather than silently absorbed into the
"same eight" bucket.

## 3. Sign-in

`designer@patina.dev` via Mailpit (OTP `176535` this round) — landed on `/doc/<Okonkwo>` as
Leah Hartwell (`studio_owner`), per the callback URL baked into the sign-in redirect.

## 4. The manual walk

### Task 5 — bring forward (Okonkwo Call Sheet → From the rolodex → search "Lindqvist")

Tooling note, not a product finding (same as r16 QA §6): `claude-in-chrome`'s `resize_window`
did not change the effective viewport this round either — `window.innerWidth` stayed 500px
after requesting 1440×900. Verification below is DOM/textual against the picker's rendered
strings and against the two reference PNGs' printed text, not a pixel diff. One screenshot at
the achievable ~500px width saved to `build/qa-w3-r17/task5-pick-500w-r17.jpg` for the record.

- `sweep_compliance_expiries()` run by hand post-reset (`{"notices": 3, "scanned": 3, "notified": 6}`)
  — same environment/process gap r16 QA's F4 already documents (the sweep is not wired into any
  migration or seed, so a plain reset leaves the Northgate-lapse clause unreachable until it is
  run once by hand). Not re-filed as a new finding.
- "0 OF 6 FROM THE LINDQVIST KITCHEN SELECTED" before any tick, six rows present (Ben Ostrom,
  Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk) — R-BP's six-person
  pool confirmed live, settled, not a finding.
- Ben Ostrom's row: "Ostrom Builders's insurance lapsed 31 December 2025." — present, the
  possessive-grammar nit r16 QA filed as F3 (minor/low) is still there; carried, not re-filed
  as new.
- Dana Kowalski's row: "Northgate Electric's insurance lapsed 31 March 2026." — exact.
- Ingrid Halvorsen's row: "Email only. No cell for work — the shop line is the voice door." —
  the fuller-than-SPEC text r16 QA filed as F2 (minor/medium) is still there; carried.
- Pete Rusk's row: "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." — exact.
- "What travels" / "What stays behind" panes: all nine items present, exact wording, in order.
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett (the four SPEC names).
  "4 OF 6 FROM THE LINDQVIST KITCHEN SELECTED" — exact. Terminal act read "ADD TO THE ROSTER"
  (no count — correct: `bringForwardActLabel(fresh.length)` with `fresh.length === 0` reads
  "Add to the roster" by the r1 MAJOR-4 / r16 MAJOR-2 design, since all four are already seated
  on Okonkwo from the seed). Consequence sentence, exact: "Adds no seats to the Okonkwo
  residence. Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the call
  sheet." — matches `w3-room-report.md` §10 item 1 and r16 QA's own measurement.
- **Click-count check** against `direction.md` §6 task 5's proposed figure ("6 for all four"):
  search (1) + four ticks (4) + one confirm (1) = **6**, matching exactly.
- Pressed "Add to the roster" anyway to exercise the refusal path live: a `role="status"`-style
  banner read "Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the
  call sheet." **Verified in Postgres**: `project_parties` count for Okonkwo unchanged at 24
  before and after the press — no partial write, no duplicate seat.

**F6 (minor, low–medium confidence) — the six candidate rows render in alphabetical order, not
SPEC §5.7 #4's specified a–f order.** SPEC's own table and the specimen's `CARRY` array
(`specimens/people-room-1440.html:1168-1176`) both order the six rows Dana, Pete, Ingrid,
Claire, Ben, Erin — the four eventually-picked names first, the two not-picked last — and SPEC
literally says "Six mini rows **in this order**". The live picker renders them alphabetically:
Ben, Claire, Dana, Erin, Ingrid, Pete (confirmed via the dialog's own `innerText`, both before
and after ticking). No content is wrong on any row — same names, same facts — so this is a
presentation-order mismatch, not a wrong fact. Confidence is medium-low because it is
plausible the specimen's order was chosen only for narrative clarity in a static mock (showing
picks grouped first) and was never meant as a pinned rendering rule for the live, genuinely
interactive room, where alphabetical is a defensible default; nothing in `rulings.md` §3
settles it either way.

**F7 (minor, low confidence) — Ben Ostrom's and Erin Sato's rows print only "KIND · FIRM", not
"KIND · FIRM · TRADE".** SPEC §5.7 #4 rows e/f show "Ben Ostrom · Ostrom Builders · general
contracting" and "Erin Sato · Marrow & Sons · project management" (a third, trade segment).
Live: "GENERAL CONTRACTOR · OSTROM BUILDERS" and "GENERAL CONTRACTOR · MARROW & SONS" — no
third segment for either. Root cause read in `rolodex-picker.tsx:540`: `tradeFor()` returns
`tradesOfCard(contact, firmCardById)[0] ?? null`, and neither "general contracting" nor
"project management" is a `FieldTrade` value the way "electrical"/"plumbing"/"cabinetry"/"tile"
are — so `tradeFor()` correctly returns `null` for a GC/PM-kind card and the row omits the
segment rather than print a wrong one. Most likely SPEC's prose is treating the *kind* label
as if it were a *trade* for these two rows and the vocabulary gap is old (not confirmed
against any prior QA round's quoted text — r16 QA quoted Ben's row only up through the
insurance clause, not the kind/firm line), so this may be an accepted paraphrase rather than an
unnoticed miss; reported per the brief's "never filter" instruction.

### Compare & merge

No natural duplicate-phone pair exists in the seed — minted one directly on `studio_contacts`
(mirroring `e2e/people/merge.spec.ts`'s own INSERT pattern: `contact_kind='sub'`, same
`phone`), walked it, then deleted both rows plus the merge record afterward.

- Directory band: "These two cards share a phone." + both names as live open-person controls +
  "Compare these two" — exact R-Y wording.
- Sheet: nine fields, two columns, older card pre-picked as survivor ("KEEPS THE CARD"),
  evidence "They share a phone number", consequence sentence matching R-BN's template with
  names substituted.
- After "Merge into QA Older Duplicate": Directory count dropped 42→41 (survivor's card opened
  automatically).
- **Verified in Postgres**: `merged_into` set on the absorbed row, `studio_contact_merges` holds
  `(survivor, merged, matched_on='phone')`, `resolve_merged_contact(merged_id)` returns the
  survivor. Attempting to hand-write `merged_into` afterward was correctly refused by
  `assert_merged_into_write()` (`studio_contact_merge_pointer_forbidden` — "merged_into is
  written by merge_studio_contacts() and by nothing else") — confirms the hardening trigger is
  live; cleanup instead deleted both rows outright. Zero residue afterward (both ids gone,
  directory count back to 40).

### Edit a bid outcome

Rivera Finishes LLC (`d0e30000-…-91`), the seeded `no_response` bid, `bid_asked_at
2026-09-28`, `bid_due_at 2026-10-05` — exact match to the fixture literal `w3-room-report.md`
§4 quotes.

- Unfolding the row (its name button, `aria-expanded`) revealed "Change what came back" inline
  under the row — a click-counting slip on my own part cost one round-trip (I double-toggled
  the fold closed on my first two attempts and briefly suspected the editor was unreachable;
  re-verified against `roster-row.tsx:756,796` that the whole block sits inside a
  `hidden={!expanded}` panel, confirmed it renders correctly on a single clean toggle — **not a
  finding**, an artefact of my own click sequence).
- Seven-field editor opened exactly as specced. Set "How it came back" to "Selected".
  Consequence sentence updated live to: "Recording this moves Rivera Finishes to Awarded. A
  bidder who did not win never reads as crew." — exact match to `w3-room-report.md` §4.
- Submitted ("Write the bid"). Row left the Bidding band. **Verified in Postgres**:
  `bid_outcome='selected'`, `stage='awarded'`.

**Not independently re-walked this round, carried from the concurrent code review
(`w3-review-r17-code.md` MAJOR-1, major/high confidence, not verified by me):** correcting a
bid FROM `withdrawn` back to a live outcome (e.g. "They quoted") leaves `off_job_at` stamped
from the withdrawal, because `useSetPartyBid` only ever *sets* `off_job_at` on the transition
into `withdrawn` and never clears it on the way back out, while `off_job` is absent from
`SEAT_STAGES_PAST_THE_BID` so the write is not blocked. The reviewer's reproduction has the
row banding back into Bidding while `rosterWindowClause` still prints "Off the job 15 Sep
2026." beside it, and `useProjectHousehold`'s open-seat filter would independently treat the
same row as closed on a `client_rep` seat — three readers disagreeing about one seat. I did
not exercise a withdraw-then-correct sequence in my own walk (my one seat went straight from
`no_response` to `selected`), so I cannot confirm or refute this beyond citing it; carried here
because it touches the exact task family ("Change what came back") this round asked me to
walk, and the brief requires reporting every finding, not only the ones a given QA pass happens
to trip over itself.

### Household — add a member with a threshold, as the principal; confirm a member cannot

Signed in as Leah Hartwell (`studio_owner`) — the principal for PR-n's purposes.

1. "Open a household" on the seeded Okonkwo residence — auto-seeded with the project's existing
   client + client_rep cards (Adaeze, Chidi). "No change-order figure is on file for this
   household." printed, both "SET THE FIGURE" and "ADD A HOUSEHOLD MEMBER" live.
2. **Added Dana Kowalski as "Signs for the household" (client_rep) while the figure was still
   NULL** — exactly the order r16 F1 was filed for. New `client_rep` seat opened correctly
   (distinct from her existing `sub · electrical` seat — the lookup keys on `party_kind`).
   Consequence sentence: "This person joins the household and takes a seat on the Okonkwo
   residence. Nothing is sent to them." — exact.
3. Attempted an **empty figure** first (clicked "Set the figure" with nothing typed): refused
   live with "Nothing is written until this reads as a figure in dollars. The figure on file
   stands until then." — R-BO confirmed, settled, not a finding.
4. **Set the figure to $2,500** as the owner. Face read "Change orders over $2,500 need a
   signature from the household." **Verified in Postgres**: Dana's NEW `client_rep` seat
   (`d8bd7459-…`) now carries `project_party_authority(threshold_cents=250000,
   source_clause='client_households.co_threshold_cents', source_household_id=<Okonkwo
   household>)` — **r16 F1's fix confirmed live and correct for this seat**, matching the SQL
   suite's block 13b.
5. **Confirmed a member cannot**, via a direct RPC probe as a temporary studio `member` (not
   owner/admin, inserted and removed inside one rolled-back transaction, zero residue):
   - `set_household_threshold(...)` → `ERROR: household_threshold_forbidden`, HINT "A
     change-order figure is the principal's to set, and the principal's to take away (PR-n)."
     — exact match.
   - `add_household_member(...)` for a new `client_rep` member while the household already
     holds a live threshold → `ERROR: household_grant_forbidden`, HINT "Only an owner or an
     admin of the studio may set a money authority (PR-n)." — the whole act refused, not just
     the grant half.
6. Raised the figure to $5,000. Face read "Change orders over $5,000 need a signature from the
   household." **Verified in Postgres**: Chidi's two agreement-sourced grants (`source_clause`
   = "Owner agreement, Exhibit B §4.1" / "§4.2") stayed at $250,000, untouched — r9 M-1 holds.
   Dana's household-sourced grant moved to $500,000 correctly.

**F8 — BLOCKING / HIGH confidence — `set_household_threshold()`'s grant-opening loop (r16 F1's
own fix) is not scoped to the household's own job, and can silently open live money authority
on a household member's seat on an UNRELATED project.**

This is the migrations-review round's own **BLOCKING-1** (`w3-review-r17-migrations.md` §2) and
the code-review round's **MAJOR-2** (`w3-review-r17-code.md`), read together — I re-verified it
myself, independently, against a freshly reset database, because it is directly downstream of
the exact household task this round asked me to walk and the concurrent reviews' probe files
were sitting in the worktree (`build/probe-r17-b-loop2-onehousehold.sql`) when I went to reset
the database at the end of my own walk.

Reproduced with the simplest case the migrations round found — **one household, no merge, no
second household** — by running `probe-r17-b-loop2-onehousehold.sql` as written, in a rolled-
back transaction, on a fresh reset:

```
B-a household seat (Okonkwo) = 2bfbdf5b-c01e-4537-8ad8-5829f5123e7b
B-b open money grants before the figure: none
B-c open money grants after the figure: Lindqvist kitchen=250000 | Okonkwo residence=250000
```

A `client_rep` card (Chidi Okonkwo) that ALSO holds an ordinary, hand-written `client_rep` seat
on the Lindqvist kitchen — a job with no household relationship to the Okonkwo household at
all — is granted $2,500 of signing authority there too, the moment the Okonkwo household's
principal writes its own $2,500 figure. Nobody acted on the Lindqvist kitchen; no act in the
room named that job.

**Why this is a face-level fact and not just a data hygiene issue**: `00632`'s own second loop
(added by r16's F1 fix) matches every OPEN `client_rep` seat of every household member **on any
job in the studio's book**, with no `project_id` predicate — unlike `add_household_member()`,
which correctly scopes its own grant-write to the one project a caller names. The migrations
round's own two-household case (`probe-r17-a-loop2-crossjob.sql`) shows the harm at its worst:
a SECOND household's own Call Sheet, under a DIFFERENT principal, ends up showing a client-side
seat that "Signs money to $2,500" while that same household's own band, one screen element
away, reads "No change-order figure is on file for this household" — two simultaneously
rendered, directly contradictory facts about money, with no act between them and (per the
migrations round's read of the two loops) **no repair path once it happens**, since the grant is
stamped `source_household_id` = the WRONG household's id, which is exactly the fact the move
loop and the opening loop both use to decide what they may touch.

I did not personally reproduce the two-household variant in this pass (time-boxed to the
single-household case, which is sufficient to confirm the defect is live and does not need a
merge or a second household to reach), but the mechanism is the same loop I exercised in step 4
above for my own walk — my own Dana Kowalski case did not trip it only because Dana held no
OTHER `client_rep` seat on a different job at the time I ran the walk, not because the loop is
scoped correctly.

**This is not the same finding as r16 F1** (member added before a figure exists gets no grant
at all) — F1 is fixed and confirmed correct in step 4 above. F8 is a NEW regression the F1 fix
itself introduced, one layer over: the fix correctly opens a grant for the RIGHT seat, but does
not refuse to also open one for every OTHER open `client_rep` seat the same card holds anywhere
else in the book.

### Close a seat with a reason

Closed Dana Kowalski's `sub · electrical` seat via her person card's "Close this seat"
(`CloseSeatAct`), reason "QA round 17 close-seat walk". Confirm sentence — "Close Dana
Kowalski's seat? The seat stays on the job with the day it closed, and everything it carries
stays with it." — two-step act, moved out of "On the job" bands. **Verified in Postgres**:
`off_job_at = 2026-09-15`, `off_job_reason = 'QA round 17 close-seat walk'`.

### Archive / restore as owner

"Put this card away" on Dana Kowalski's person card → face read "This card was put away
15 September 2026. It stays out of the book until it is brought back." with "Bring this card
back", plus a live announcement "Dana Kowalski is put away." **Verified**:
`studio_contacts.archived_at` stamped `2026-09-15 10:25:20+00`. Restored: announcement "Dana
Kowalski is back in the book."; `archived_at` cleared to NULL. Both acts single-press,
idempotent-shaped, correct as the owner.

## 5. Console

One recurring pre-existing error, first seen before any of my own actions and unchanged
throughout the session (same timestamp on every later check, i.e. it never re-fired):

```
Error logged: AppError: permission denied for table schedule_proposals
```

`schedule_proposals` is defined in `00475`/`00476` (long before this branch's 00590–00633
range) and is not touched by any W1–W3 migration on this branch — this is the Document's
Schedule feature, not the People room, firing on page load regardless of anything I did.
**Not counted toward this program's verdict** (out of scope: not a People/CRM table, predates
this branch, not reachable from any act I exercised), but reported per "never filter."

No other console errors or warnings appeared during the entire manual walk (bring-forward,
merge, bid edit, household add/threshold/raise, close-seat, archive/restore).

## 6. Server / port

Server stopped (`kill` on the `next start` PID; `lsof -nP -iTCP:3000 -sTCP:LISTEN` returns
nothing afterward — confirmed free). Database reset once more at the end (clean replay, SQL
suite re-run green including blocks 13/13b) so the branch is left in the same state the round
started in. `git status` in the worktree shows only this report and its screenshot as new
files from my own session; the concurrent code/migrations reviews' own new files
(`w3-review-r17-code.md`, `w3-review-r17-migrations.md`, three `probe-r17-*.sql` files) were
already present and staged when I reached this step — not mine, left untouched.

## 7. Findings

**F5 — MINOR / HIGH confidence.** `bring-forward.spec.ts` is flaky under the full `e2e/people`
suite's default parallelism (a different one of its two tests fails on different runs; both
pass reliably in isolation). See §2. Test-infrastructure gap (missing `test.describe.serial()`
between two tests sharing one `beforeAll`-minted project, or general resource contention under
`workers: undefined`), not a product defect — my own manual walk of the same task behaved
correctly throughout.

**F6 — MINOR / LOW-MEDIUM confidence.** The bring-forward picker's six candidate rows render
alphabetically, not in SPEC §5.7 #4's literal specified order (which the specimen's own source
also hard-codes). No row's content is wrong. See §4.

**F7 — MINOR / LOW confidence.** Ben Ostrom's and Erin Sato's picker rows omit the third
"trade" segment SPEC §5.7 #4 rows e/f show ("general contracting" / "project management"),
most likely because neither value exists in the `FieldTrade` enum `tradeFor()` reads from —
a SPEC-vocabulary gap, not a wrong fact. See §4.

**F8 — BLOCKING / HIGH confidence.** `set_household_threshold()`'s grant-opening loop (r16
F1's own fix) opens live money authority on EVERY open `client_rep` seat a household member
holds anywhere in the studio's book, not only the household's own job — reproduced
independently on a fresh reset. See §4 (household task) for the full writeup; also filed by
the concurrent migrations review as BLOCKING-1 and the concurrent code review as MAJOR-2.

**Carried, not re-filed as new (still open, previously reported):**
- F2-equiv (r16 QA F2, minor/medium) — Ingrid Halvorsen's picker-row clause is fuller than
  SPEC §5.7's quoted text.
- F3-equiv (r16 QA F3, minor/low) — `noticedPaperClause()`'s possessive grammar ("Builders's").
- F4-equiv (r16 QA F4, minor/high, environment) — `sweep_compliance_expiries()` must be run by
  hand after every reset.
- Claire Bissett's bring-forward history line reads the generic "Worked 1 prior project…"
  rather than SPEC §5.7 row (d)'s literal "Saved twice, one firm." — first filed at r14 QA
  (minor/high), re-confirmed present and unchanged this round; agrees with the record (she
  genuinely holds two `project_parties` rows), so this is SPEC drift, not a code defect.

**Not re-filed, cited for completeness (concurrent code review this round, not independently
verified by me):** MAJOR-1 in `w3-review-r17-code.md` — correcting a bid outcome back out of
`withdrawn` leaves a stale `off_job_at`, producing contradictory band/window-clause/household
readings on one seat. See §4 (Edit a bid outcome).

## 8. Clean?

**Not clean.** One BLOCKING (F8) — a wrong money fact reachable on an unrelated project's face,
with (per the migrations round's analysis) no repair act in the room once a second household is
involved. Zero data loss on merge (verified: round-tripped cleanly, `resolve_merged_contact`
resolves forward, the hardening trigger correctly refused a hand-write to `merged_into`, nothing
was destroyed). No cross-tenant read/write observed. No RLS hole observed beyond F8 (which is a
missing project-scope predicate inside a `SECURITY DEFINER` function, not a policy/grant
misconfiguration). No consent write outside `record_channel_consent` observed. No reset failure.
