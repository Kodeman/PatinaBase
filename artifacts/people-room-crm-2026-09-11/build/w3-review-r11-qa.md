# W3 (P2) — runtime QA, round 11

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD
`42ddf0aa4`. Local production build of the designer portal (`pnpm turbo run build
--filter=@patina/designer-portal`, which rebuilds workspace-package dists first, then `npx next
start -p 3000`), env passed inline per the binding instruction (no `.env.local` created or read).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), reset before and
after this round via `pnpm supabase:reset` (head **00633**, clean replay each time — nothing in
00595–00620 touched). No prod touched, no migration minted, no `.env.local` created.

Port 3000: `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting showed no listener, so the PORT RULE's
kill-branch never applied. Server stopped at the end of the round (`kill`, confirmed dead) and the
port confirmed free by a second `lsof` (no output).

**Read first**: `w3-room-report.md`, `direction.md` §6 task 5, SPEC §5.7, `rulings.md` §3,
`w3-fix-log-r10.md`. Also read in full, because they exist for this same round and share ground
truth with this report: `w3-review-r11-code.md` (adversarial code review, NOT clean — 1 blocking,
1 major, 9 minor) and `w3-review-r11-migrations.md` (adversarial migration review, NOT clean — 2
major, 8 minor). Neither has a fix log yet. This report does not re-derive their findings from
scratch; where my own walk touched the same surface I corroborate with fresh runtime evidence and
cross-reference rather than re-file.

Screenshots and raw evidence: `build/qa-w3-r11/`.

---

## 1. r10 fix-log — re-check

All five r10 fixes hold under a fresh reset:

| Fix | Re-checked how | Result |
|---|---|---|
| BLOCKING-1 (data) — sole-proprietor fold blanked the firm's paper on its crew | Not directly re-probed this round (SQL-level, already re-verified independently by `w3-review-r11-migrations.md` §1, "FIXED, and verified independently of the suite") | Not re-broken by anything observed |
| BLOCKING-1 (portal) — household promising money the RPC leaves standing | Directly exercised: opened a fresh household on Okonkwo, set the figure as owner, the sentence and stored line updated in lockstep | Holds — see §5 below |
| MAJOR-1 — dead bid-refusal token | Not directly re-probed (no refusal-path walk this round); `w3-review-r11-code.md` re-ran the gates and found it fixed | Not re-broken |
| MAJOR-2 — picker could not see a person-held paper | Not directly re-probed; `w3-review-r11-code.md` §0b: "fixed for the picker... still open on the roster row" (its own new MAJOR-1) | Not re-broken on the picker |
| F1 / R-BP — the sixth bring-forward candidate | Directly exercised at both widths — see §2 | **Holds exactly**: six rows, Erin Sato present and unticked, "4 of 6" |

No new instance of any of the five re-appeared.

---

## 2. e2e/people (chromium)

Two full runs against a fresh reset each time (once before this round's manual walk, once after,
to confirm nothing in the suite moved). Both runs, identical:

```
11 failed
11 passed (5.6m)

Failed:
  add-client-letter.spec.ts:47   a letter goes to a new client, and only one
  add-client-letter.spec.ts:115  the roster still works with no letter, and nothing is sent
  add-sheet.spec.ts:37           task 1 — a text-only rule lands on the PERSON, not on the seat
  add-sheet.spec.ts:103          task 2 — a household member is a seat and an authority grant, two facts
  add-sheet.spec.ts:145          the sheet asks for a trade before it will write a sub
  bring-forward.spec.ts:116      task 5 — search the prior job, tick four, one confirm
  bring-forward.spec.ts:251      Put back clears the pick and writes nothing
  call-sheet.spec.ts:91          task 3 — who has site access right now, one click from the sheet
  merge.spec.ts:81               the duplicate band merges two cards into one (PR-o)
  person-card.spec.ts:51         task 4 — do not contact, routed to somebody reachable
  person-card.spec.ts:111        R-V — every region prints, and an absent record says so in words
```

Byte-for-byte the same eleven as r10's serial run. Root-caused this round, with fresh evidence:

- **`bring-forward.spec.ts:116`** — NOT the r10 "sixth candidate" cause any more (that's fixed;
  the test's own assertions for "4 of 6" pass). It now fails at line 227 polling
  `people_directory_seats.consent_status` for Pete's newly-added seat and getting `null` instead of
  `opted_out`. Root-caused in §3 below: this is `adminDb` (service role, no `auth.uid()`) reading a
  view whose WHERE clause and consent CASE both gate on `is_active_studio_member()` /
  `is_studio_comember()` — both hard-require a real session and evaluate false for a service-role
  caller with no JWT `sub`, so the view returns zero rows / NULL regardless of what the record
  actually says. Confirmed by an independent walk (§3) that the SAME write, read back through the
  real authenticated UI path, correctly shows "Opted out by text, 3 Dec 2025." **Test-infrastructure
  defect, not a product defect** — same class as r10 §9's site-access test-scoping finding.
- **`bring-forward.spec.ts:251`**, **`call-sheet.spec.ts:91`**, **`add-sheet.spec.ts`** (all three),
  **`person-card.spec.ts`** (both), **`add-client-letter.spec.ts`** (both) — unchanged from r10's
  own root-causing (§5/§9/§10/§12 of `w3-review-r10-qa.md`): a strict-mode double-match on "Put
  back", an unscoped `tel:` locator picking up the mounted-behind roster instead of the site-access
  card, a two-step authority disclosure the test fills without first opening, and an `addSub()`
  helper polling pattern that times out. None are W3-scoped per `w3-room-report.md`'s own file list
  except the two named W3 files, both already accounted for above. Not re-investigated to further
  depth this round (unchanged from r10, effort budget).
- **`merge.spec.ts:81`** — unchanged from r10: the shipped announcement necessarily contains the
  merged card's name (`role="status"`: "Two cards are now one. `<survivor>` carries what `<merged>`
  held."), so `expect(page.getByText(NEWER_NAME)).toHaveCount(0)` can never pass. Test defect, not a
  product defect (r10 §5).

---

## 3. Task 5 — bring forward, walked live against the real Okonkwo Call Sheet

Both widths, against the actual `/doc/<Okonkwo>` Call Sheet's own "From the rolodex" instrument (not
a synthetic project), per the assignment.

**Every §5.7 string present** (case-insensitive, since several are CSS-uppercased, not literally
capitalized in the DOM): "From the rolodex", the "OKONKWO RESIDENCE" eyebrow — read as the
still-mounted Call Sheet's own title "Call sheet · Okonkwo residence" behind/above the picker, which
r2–r7 QA rounds already independently settled as satisfying #2 (DocSheet has no `eyebrow` prop; not
re-litigated here) — the site-access summary line, "What travels" / "What stays behind" with all
nine sub-items, the act row, "Put back". Screenshots:
`task5-pick-1440-before.png`, `-1440-ticked.png`, `-390-ticked.png`.

**Six rows, exactly as R-BP amended**: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid
Halvorsen, Pete Rusk. Erin Sato confirmed unticked. Pick count read exactly "4 of 6 from the
Lindqvist kitchen selected" after ticking Dana/Pete/Ingrid/Claire. Consequence sentence read
exactly "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate
Electric's insurance lapsed 31 March 2026." (SPEC.md §5.7 row 7's own literal text says "31 Mar
2026" — every OTHER reference, including SPEC.md's own lines 368/541, `w3-room-report.md` §3 and
the checked-in `bring-forward.spec.ts:184`, says "31 March 2026"; treated as a SPEC.md-internal typo
in one table row, not a shipped-code defect). 390: no horizontal overflow
(`scrollWidth === clientWidth`). "What stays behind" prints "prior pricing / prior project notes",
not SPEC's literal "2025 pricing / 2025 project notes" — already logged as
`w3-review-r11-code.md` minor m1 (deliberate one-sided divergence, SPEC amendment recommended);
corroborated live here, not re-filed.

### FINDING — pressing "Add four to the roster" against the literal Okonkwo project writes ZERO seats, because all four of Leah's own named task-5 people are already seated there

**Severity: MAJOR. Confidence: HIGH (measured twice on independent fresh resets; root-caused against
the shipped source).**

Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett (exactly Leah task 5's own named
four — "Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo") and pressed "Add four to the
roster" on the real Okonkwo Call Sheet, twice, on two separately-reset databases:

```
task5-new-seats-written.json (both runs): { "newSeatCount": 0, "newSeatIds": [] }
```

Zero new `project_parties` rows were written. Root cause, confirmed against
`rolodex-picker.tsx:655-676` (`addPicked`): the multi-select confirm path checks **every** ticked
card against the CLIENT'S already-cached roster via `rosterHasIdentity`, and if **any one** of them
is already seated on the target project, it sets one error ("`<names>` are already on the call
sheet.") and `return`s **before calling `bringForward.mutateAsync` at all** — refusing the WHOLE
batch, not just the already-seated pick.

All four of task 5's own named people are, in fact, already seated on the real Okonkwo residence in
the seed (`d0e30000-…-0011/0012/0013/0020`, all `studio_contact_id`-stamped to the exact cards the
picker's candidate rows resolve to) — confirmed by direct query. This is not an edge case reached by
an unlucky combination; it is the **guaranteed, 100%-reproducible outcome** of performing Leah's
task 5 exactly as SPEC and direction §6 describe it, against the one project the whole room is
demonstrated on. The checked-in `bring-forward.spec.ts` avoids this entirely by minting a fresh
synthetic project in its own `beforeAll` specifically because "the seed already seats those four on
the Okonkwo residence — that is the fixture's whole point" (its own top-of-file comment) — which
means the shipped Playwright coverage **cannot** and does not exercise the literal, named scenario
Leah's task 5 and SPEC §5.7 both describe.

This also means `w3-room-report.md` §3's own claim — "**One pick refused does not cost the
others.** The insert runs per pick; refusals come back named, the refused rows stay ticked, and the
sentence says which did not go on." — is **false** for the multi-select confirm path exercised by
Leah's own task 5 phrasing: on the real Okonkwo project the refusal costs every pick, silently
matching the acceptance criterion's own literal request. (The claim is true only for a refusal the
RPC itself raises per-pick, `useBringForward`'s own per-pick insert loop — a different code path
from the client-side pre-check `addPicked` that fires here.)

**Independently confirmed the underlying write and consent-read ARE correct when the "already
seated" collision doesn't apply**: on a fresh synthetic project (mirroring the checked-in test's own
pattern, avoiding the collision), the identical three-of-four pick (Dana/Pete/Ingrid) wrote three
real seats and Pete Rusk's new seat correctly read, live, through the real authenticated UI:

```
consent-check-pete-context.txt:
Pete Rusk / SUB · PLUMBING / ■ Rusk Mechanical / ON PAPER / ON THE JOB
(612) 555-0112
Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.
```

So the defect is precisely and only the client-side all-or-nothing pre-check in `addPicked` — not
the RPC, not the consent read, not the picker's rendering. This is the exact code path
`w3-review-r11-code.md` m7 already names (`rolodex-picker.tsx:664-680`, rated minor there, static
read, no live reproduction) — this round's live walk against the literal seed proves it is not a
low-reachability edge case but the deterministic outcome of the named acceptance scenario, which is
why I am rating it MAJOR here rather than deferring entirely to m7's minor rating: cross-reference,
not a duplicate filing.

**Fix options** (not adjudicated here): (a) have `addPicked` drop the already-seated rows from the
batch and proceed with the rest — the room-report's own stated behavior, and what the RPC path
already does; or (b) if the whole-batch refusal is intentional, the SPEC/direction task-5 acceptance
text needs a caveat that the four named people are already seated on Okonkwo and the walk must use a
different project — but that contradicts the acceptance criterion's own plain reading.

**Evidence**: `qa-w3-r11/task5-new-seats-written.json` (both runs), `qa-w3-r11/task5-pick-1440-*.png`,
`qa-w3-r11/consent-check-callsheet.png`, `qa-w3-r11/consent-check-pete-context.txt`,
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:655-676`,
`supabase/seed/people_crm_dev.sql:726-727` (Claire's seeded Okonkwo seat, same shape for Dana/Pete/
Ingrid).

---

## 4. Merge two duplicate cards

Seeded a fresh phone-sharing duplicate pair (own fixture, not the shipped one), each card carrying a
**disjoint trade** (`electrical` on the older/survivor, `plumbing` on the newer/absorbed) — chosen
specifically to probe `w3-review-r11-code.md` BLOCKING-1 live.

The band, the sheet (survivor pre-picked as the older card), and the terminal act all worked as
documented: `studio_contact_merges` row written correctly, `merged_into` stamped, Directory band
cleared. Screenshots: `merge-band-1440.png`, `merge-sheet-1440.png`, `merge-after-1440.png`.

**Corroborates `w3-review-r11-code.md` BLOCKING-1 live, exactly.** The sheet's own consequence
sentence read (accepting the default pre-pick, no flip):

> "…Everything else W. QA11 x87b9 holds — the verdict, the trades, the notes and the payee facts —
> travels the same way, and where both cards say something Wren QA11 x87b9's own words stand."

— i.e. it explicitly claims the survivor's OWN word ("electrical") stands where both cards say
something. The actual write:

```
merge-record.json: survivorAfter.trades = ["electrical", "plumbing"]
```

Both trades landed, unioned — not the survivor's word alone. This is not a new finding; it is the
live, empirical confirmation of the exact defect `w3-review-r11-code.md` BLOCKING-1 already reports
from reading `00629_studio_contact_merges.sql:1717-1724` and `compare-merge-sheet.tsx:122-124`.
Recorded here as corroborating evidence, not re-filed as a separate finding.

**Evidence**: `qa-w3-r11/merge-sheet-consequence-text.txt`, `qa-w3-r11/merge-record.json`.

---

## 5. Household — threshold, add-member, principal/member gate

Walked on the real Okonkwo residence, no household on file at the start of the round (confirmed:
`household-threshold-before.txt` on a pristine reset reads "No household is on file for this client
yet…").

- **Owner (principal) — open, set the figure.** "Open a household" → "Set the figure" rendered
  `aria-disabled="false"` as `designer@patina.dev` (org `owner`). Entered $2,500, saved via "Write
  the figure"; `[data-household-threshold]` updated to "Change orders over $2,500 need a signature
  from the household." (`household-before.png`, `household-figure-open.png`,
  `household-after-set.png`.) r10 BLOCKING-1's fix holds — the sentence read the household's own
  clause, not a foreign grant's.
- **Add a household member.** Opened "Add a household member", selected the "signs for the
  household" role and Adaeze Okonkwo; the consequence sentence read exactly "This person joins the
  household and takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is
  sent to them." (`household-add-member-consequence.txt`). Not confirmed through to the write this
  round (screenshotted the filled state only, to avoid a second live mutation on top of the
  threshold write already exercised) — not a finding, just a scope note.
- **Member — cannot set the figure.** Temporarily flipped `studio_manager@patina.dev`'s
  `organization_members.role` from `admin` to `member` (reversible, local-only, reverted
  immediately after in a `finally` block — confirmed reverted), signed in as that account in a
  **separate browser context**, opened the same Call Sheet: "Set the figure" rendered
  `aria-disabled="true"`, `aria-describedby` pointed at a visible sentence reading exactly "The
  change-order figure is the principal's to set. An owner or an admin of the studio can write it."
  A forced click (`{force: true}`) opened no editor (`#household-figure` count stayed 0).
  (`household-member-cannot-set-figure.png`, `household-member-gate.txt`,
  `household-member-force-click-result.txt`.) PR-n holds exactly as r10 measured it.

**No finding** on any of the three legs.

---

## 6. Edit a bid outcome

Rivera Finishes on Okonkwo (the one seed row genuinely carrying bid metadata: `bid_outcome:
'no_response'`, banded "BIDDING · 1"). Unfolded the row, opened "Change what came back", changed
"How it came back" to "Selected", read the pre-save sentence, saved via "Write the bid":

```
bid-editor-sentence.txt:  "Recording this moves Rivera Finishes to Awarded. A bidder who did not
                           win never reads as crew."
bid-editor-db-result.json:
  before: { bid_outcome: "no_response", stage: "no_response" }
  after:  { bid_outcome: "selected",    stage: "awarded"      }
```

R-BL / `bidStageOutcome` correctly moved the seat's stage with the outcome. Reverted to the exact
pre-edit values afterward (confirmed by direct query post-run). **No finding.**

---

## 7. Close a seat, with a reason

Claire Bissett's real, pre-existing Okonkwo seat (chosen, per r10's precedent, because no shipped
e2e suite depends on it). Clicked her name to unfold the Call Sheet row — this is `roster-row.tsx`'s
**own, separate** close-seat implementation, not the shared `CloseSeatAct` component
(`person-profile.tsx` mounts that one; see `w3-review-r11-code.md` m2, which this round's walk
independently corroborates: two implementations exist, not one shared component "cannot drift" as
`w3-room-report.md` claims). Clicked "Close this seat", filled "Why it closed", clicked "Close the
seat":

```
close-seat-db-result.json:
{ "off_job_at": "2026-09-14", "off_job_reason": "QA r11 manual close — end of scope, no further work.", "stage": "off_job" }
```

Dated (today), reason stored verbatim, stage moved to `off_job`. Reverted afterward (confirmed by
direct query: `off_job_at`/`off_job_reason` null, `stage` back to `active`). **No finding** on the
write itself; the m2 duplication is already reported and corroborated, not re-filed.

**Cross-reference, not walked further this round**: `w3-review-r11-migrations.md` MAJOR-2 (a merge
on a studio-less project raises a raw schema token) does not apply to Okonkwo — its `studio_id` is
set — so this round's walk cannot corroborate or refute it; noted only for completeness.

---

## 8. Archive / restore, as owner

Same Claire Bissett card, via the standalone `/people?person=<id>` studio-wide People room (where
`ArchiveCardDoor` actually mounts — the in-document Call Sheet row does not carry this act).
"Put this card away" → "Bring this card back", both round-tripped cleanly:

```
archive-restore-db-result.json:
  claireAfterArchive: { archived_at: "2026-09-14T07:28:24.788037+00:00" }
  claireAfterRestore: { archived_at: null }
```

**No finding.**

---

## 9. Console

Two errors recurred, unchanged in shape from r10 §11:

```
TypeError: Failed to fetch  (…chunks/2290-….js — Supabase auth session refresh)
Error logged: AppError: Not authenticated  (…chunks/4734-….js, while genuinely signed in)
Error logged: AppError: TypeError: Failed to fetch  (×2 more, same shape)
```

**Severity: MINOR. Confidence: MEDIUM** — same characterization as r10: plausibly environment noise
from the `orders`/`media`/`projects` NestJS services not being started (this round's assignment is
designer-portal-only), not tied to a specific button press or W3 surface in the trace. Recurred
identically across three separate fresh-reset runs this round, so it is at least consistently
reproducible under this environment shape — worth a `pnpm dev:minimal` re-check in a future round to
settle it definitively, as r10 also said.

---

## 10. A defect in my own harness, corrected mid-round (methodology note, not a product finding)

My first manual-walk attempt cleaned up the four bring-forward test seats by deleting
`project_parties` rows matching `studio_contact_id IN (Dana, Pete, Ingrid, Claire)` on Okonkwo —
which also deleted Claire Bissett's **pre-existing seeded seat** (same `studio_contact_id`,
`people_crm_dev.sql:726-727`), since the picker's confirm had in fact written **new** seats that
time (a stale `client_households` row and non-conflicting card ids from an earlier debugging
iteration meant the "already seated" collision described in §3 hadn't yet been isolated). Caught via
`pnpm supabase:reset` before this became load-bearing for any other finding; the corrected harness
diffs seat ids before/after and deletes only the new ones. No data loss reached a review artifact —
recorded here in case any other iteration's transient DB state was screenshotted by mistake (it was
not; all screenshots in `qa-w3-r11/` are from clean, fully-reset runs).

---

## 11. Not findings — settled

- Every ruling in `rulings.md` §3 (R-A through R-BP) — none contradicted by anything observed this
  round.
- SPEC.md §5.7 row 7's "31 Mar" vs. every other reference's "31 March" — a SPEC.md-internal wording
  slip, not a shipped-code defect (§3).
- The "OKONKWO RESIDENCE" eyebrow reading as the mounted Call Sheet's own title — settled by r2–r7
  QA rounds, re-confirmed, not re-litigated.
- `w3-review-r11-code.md` m1 ("2025 pricing" vs. "prior pricing") and BLOCKING-1 (merge trades
  sentence) — already reported there; corroborated live in §3 and §4, not re-filed as new findings.
- `w3-review-r11-code.md` m2 (two close-seat implementations) — already reported there; corroborated
  live in §7.
- `w3-review-r11-migrations.md` MAJOR-1 (merge company_name outranking) and MAJOR-2 (studio-less
  merge) — neither surface was reached by this round's walk (my merge fixture used two person cards
  with no firm; Okonkwo has a studio_id); noted, not corroborated or refuted.
- Anything scoped to W4 by the reports.

---

## Appendix — commands run

```
supabase status --workdir <worktree> -o env                     # local dev keys only, not printed
pnpm --dir <worktree> supabase:reset                              # x4 (start, mid-walk fix, end, +1)
pnpm turbo run build --filter=@patina/designer-portal              # env inlined, 7/7 tasks
npx next start -p 3000                                             # backgrounded, env inlined
npx playwright test e2e/people --project=chromium --workers=1      # x2 (before + after the manual walk)
npx playwright test e2e/people/_manual-qa-r11*.spec.ts             # temporary manual-QA specs,
                                                                     # deleted before finishing
kill <next-start-pid>; lsof -nP -iTCP:3000 -sTCP:LISTEN            # confirmed dead + port free
```

No `pnpm dev`, no `next build` while a server held the port, no chained `cd`, no `git add -A`.
Temporary manual-QA `.spec.ts` files used for the browser walk were deleted before finishing;
nothing from this round is staged or committed. Local DB reset to a clean seed at the end.

---

## Verdict

**NOT clean.** One MAJOR finding of my own (§3 — task 5's own named acceptance scenario writes zero
seats against the real Okonkwo project), corroborating live evidence for two already-reported
findings from the parallel r11 code review (BLOCKING-1 merge-trades sentence, m2 two close-seat
implementations), and one MINOR (console noise, unchanged from r10, still unexplained). Combined
with `w3-review-r11-code.md` (1 blocking, 1 major, 9 minor, no fix log yet) and
`w3-review-r11-migrations.md` (2 major, 8 minor, no fix log yet), this round's build is not ready to
close out — all three r11 reports (code, migrations, this one) should go to a single fix round
together, the way r1–r10 each did.
