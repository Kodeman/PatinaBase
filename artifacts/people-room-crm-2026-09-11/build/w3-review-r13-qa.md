# W3 (P2) — runtime QA, round 13

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `227d68ac1`. Local production build of the designer portal
(`pnpm --dir <worktree> exec turbo run build --filter=@patina/designer-portal`, then
`pnpm exec next start -p 3000` from `apps/designer-portal`), env passed inline per the binding
instruction — no `.env.local` created or read anywhere in the worktree (confirmed absent before
and after).

**Read first**: `w3-room-report.md`, `synthesis/direction.md` §6 task 5, `specimens/SPEC.md` §5.7,
`rulings.md` §3, `build/w3-fix-log-r12.md`. Screenshots and raw evidence: `build/qa-w3-r13/`.

**PORT RULE**: `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting showed no listener, so the kill
branch never applied. Server stopped at the end of the round (`kill`, confirmed dead — a second
`kill -9` after 5s reported no process, meaning the first `kill` alone had already succeeded), port
confirmed free by a second `lsof` (no output, rc=1).

Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), reset once at the
start of this round (`pnpm supabase:reset`, head **00633**, clean replay — nothing in 00595–00620
touched, migrations tail unchanged from r12: `ls supabase/migrations | tail` confirmed 00628–00633
then the unrelated `20260910152111_create_contact_messages.sql`). `people/w3_merge_sweep_household_test.sql`
run before the walk: rc=0, "W3 SQL suite: all blocks passed" (7d, 11j, 11k present and green — r12's
migration fixes hold). No new migration minted. No prod touched.

Signed in as `designer@patina.dev` via a one-time code retrieved from the local auth-mail box
(Mailpit at `:54324` — this stack's Inbucket successor per `config.toml`'s own deprecation
warning): code `229747`, entered at `/auth/verify-otp`, landed on `/desk` as **Leah Hartwell**.

Two evidence-gathering methods were used and are both cited below: (1) an interactive Chrome
session for the sign-in and the first half of task 5's walk (screenshots
`task5-pick-1440-ticked.jpg`, `task5-act-row-1440.jpg`, `task5-after-press-refusal-1440.jpg`), and
(2) a temporary, scoped Playwright spec (`e2e/people/_manual-qa-r13.spec.ts`, deleted before
finishing — never committed) for the 390 comparison shot and the remaining five tasks, following
the same pattern r10–r12 used, with every write reverted via `adminDb`/direct SQL and confirmed
reverted by a follow-up query. Two of that spec's own selectors needed a fix mid-round (documented
in §8, not a product finding), and one run of the household-threshold test left a stray
`client_households` row behind when it errored on a bad selector before its `finally` block had
learned the row's id — found and deleted directly (`DELETE ... where display_name ilike
'%Okonkwo%'`), confirmed zero residual rows before the passing re-run. All test-fixture and
DB-probe residue was independently swept at the end of the round (§9) and confirms clean.

---

## 1. Prior-round fixes — re-checked live

| Fix | Re-checked how | Result |
|---|---|---|
| r12 migrations MAJOR-1/2 (studio-less merge pre-check) | `people/w3_merge_sweep_household_test.sql` blocks 11j/11k, fresh reset | **Holds** — rc=0, both NOTICEs print "passed" |
| r11 BLOCKING-1 / r12 code MAJOR-1 — merge consequence sentence's trades exclusion | **Directly re-exercised**, fresh fixture pair (`R13 Older`/`R13 Newer`, disjoint circumstances, no trades set) | **Holds** — sentence reads "The trades and specialties on both cards are kept together, and a card recorded as a sole proprietor keeps that either way," correctly excluded from the "own words stand" clause; announcement excludes it too. See §3 for the full text and a defect found in the SAME sentence this round |
| r12 QA MAJOR-1 (bring-forward all-or-nothing refusal) | **Directly re-exercised**, real unmodified Okonkwo project, Leah's literal task-5 names | **Holds** — "Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the call sheet." printed, sheet stayed open, zero new seats written |
| r12-qa-owed-1 (task 5's acceptance text vs. the seed's already-seated four) | Checked `rulings.md` §3 | **Still open.** Last entry is R-BP (2026-09-14); nothing in §3 reaches this question. Confirmed not resolved by either parallel r13 migrations or code review, which both independently name it "still owed" too |
| r11 m1 (roster row paper reading only the firm's holder id) | Not reachable by this round's fixtures | Not re-broken by anything observed; not independently re-verified |
| r11 m2 (two close-seat implementations, `roster-row.tsx` inline vs. shared `CloseSeatAct`) | Used the Call Sheet's own inline path (task wording: "close a seat... on the Call Sheet") | Confirms the inline path still works (§6); the person-card's `CloseSeatAct` surface was not separately re-walked this round; standing, not re-filed |

---

## 2. Task 5 — bring forward, walked at both widths against the real Okonkwo Call Sheet

Navigated the shipped path: `/doc/<Okonkwo>` → `[data-action-key="open-call-sheet"]` → "From the
rolodex," same as `bring-forward.spec.ts`'s own `openThePicker()`.

**Every §5.7 string present, R-BP's six-row amendment confirmed live**: "From the rolodex," search
field, "**4 of 6** from the Lindqvist kitchen selected" (not "of 5" — R-BP's amendment is in the
shipped code), all six rows in alphabetical order (Ben Ostrom, Claire Bissett, Dana Kowalski, Erin
Sato, Ingrid Halvorsen, Pete Rusk) each with its own paper/consent/reach words and history line,
Erin Sato present and left unticked with no verdict language anywhere in the sheet, "What travels" /
"What stays behind" headings with sub-items, the act row ("Add four to the roster" / "Put back")
first with the consequence sentence directly beneath.

Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. Pick count read exactly **"4 of 6
from the Lindqvist kitchen selected."** Consequence sentence, measured via DOM text:

> "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate
> Electric's insurance lapsed 31 March 2026."

— byte-for-byte the SPEC/room-report text. Checked via JS: the act-row buttons and all six
checkboxes carry `aria-disabled: null`, `disabled: false`, `tabIndex: 0` — never gated, matching
SPEC §5.7 #6.

Pressed "Add four to the roster" against the real, unmodified project (all four cards are still
stamped to those seats on this seed): the sheet stayed open and printed exactly "Claire Bissett,
Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the call sheet." Confirmed zero new
`project_parties` rows written by direct query. This is the r12-fixed per-pick refusal, holding
exactly.

**390**: same picker state (search "Lindqvist," Ben Ostrom + Claire Bissett visible, unticked/ticked
correctly), overflow measured `document.documentElement.scrollWidth - clientWidth` = **0**. (First
capture used `fullPage: true` and showed the underlying document bleeding through below the
dialog's fixed-height chrome — a Playwright full-page-screenshot artifact with `position: fixed`
overlays, not a real layout bug; re-captured with `fullPage: false` and the dialog renders as a
correct full-height mobile sheet with no bleed-through. Noted here so the artifact in the tool's
intermediate output is not mistaken for a finding — the corrected screenshot is what's filed.)

**No finding.** Task 5 behaves exactly as r10–r12 measured it.

**Evidence**: `qa-w3-r13/task5-act-row-1440.jpg`, `task5-pick-1440-ticked.jpg`,
`task5-after-press-refusal-1440.jpg`, `task5-pick-390-before-tick.png`, `task5-overflow-390.txt`.

---

## 3. Merge two duplicate cards

**FINDING — confirmed live, corroborating `w3-review-r13-code.md` MAJOR-2 with an independent
runtime reproduction.**

- **Severity: major. Confidence: high** (directly reproduced, screenshotted, and the exact DOM text
  saved to disk this round).

Seeded a fresh pair directly in Postgres (`R13 Older <stamp>` / `R13 Newer <stamp>`, sharing a
phone, **neither card carrying a contact rule**) — chosen to re-probe the r11/r12 trades-sentence
fix, the same shape prior rounds used. The band showed "Compare these two"; the sheet pre-picked
the older card as survivor per PR-o. Pressed "Merge into R13 Older...". The pre-merge consequence
sentence read, in full (saved verbatim to `merge-consequence-r13.txt`):

> "R13 Newer 9zmw1's seats, channels, **contact rule** and firm designations move onto R13 Older
> 9zmw1, and R13 Newer 9zmw1's own number and address travel with them. Everything else R13 Newer
> 9zmw1 holds — the verdict, the notes and the payee facts — travels the same way, and where both
> cards say something R13 Older 9zmw1's own words stand. The trades and specialties on both cards
> are kept together, and a card recorded as a sole proprietor keeps that either way. Consent stays
> with the number, not with the card, so nobody's yes or no changes. R13 Newer 9zmw1's paper moves
> onto R13 Older 9zmw1 too; where R13 Older 9zmw1 already holds the same paper, still in force, the
> older one is marked superseded. R13 Newer 9zmw1's card is kept as a record of the merge, so an old
> link still opens this person."

**Neither card in this fixture carries a contact rule** (confirmed: both cards were created with no
row in the contact-rule table). The sentence's first clause nonetheless claims "contact rule…
move[s] onto" the survivor — a fact the record does not make, because there was no rule on either
card to move. This is exactly `w3-review-r13-code.md` MAJOR-2's second, "mirror" case: the sheet's
branch (`compare-merge-sheet.tsx:108-119`) asks only whether the **survivor** carries a rule, never
whether the **folded** card does, so "contact rule" is listed among the things that move even when
both columns would read "No contact rule on file." This is a **reader disagreeing with the
record** — the studio is told a fact moved that never existed — which is this task's own definition
of major.

The merge's mechanics otherwise held exactly as r11/r12 measured: the trades exclusion is correct
(quoted above, unaffected by this defect), the post-merge announcement read "Two cards are now one.
R13 Older \<stamp\> carries what R13 Newer \<stamp\> held, and where both cards said something,
R13 Older \<stamp\>'s own words stand — except the trades and specialties, which are kept together,"
`merged_into` was stamped (not deleted, `archived_at` null), and `studio_contact_merges` recorded
`matched_on='phone'`. Fixture cards and the merge record were deleted afterward; confirmed zero
`R13 %`-named rows remain.

**Not independently re-walked this round** (out of this round's chosen fixture, cross-referenced
only): `w3-review-r13-migrations.md` MAJOR-1 (a cross-studio legacy seat still surfaces the raw
refusal token `party_studio_contact_other_studio` on the merge sheet) and MAJOR-2 (an ordinary
firm-duplicate merge can bump `project_parties.updated_at` on an uncarded seat and flip its
Directory ranking); `w3-review-r13-code.md` MAJOR-1 (an archived estimator's "Priced by" name goes
blank on a bid it priced) and MAJOR-3 (the merge does not invalidate the `project-party-bids` or
`client-households` query-cache roots it writes through). None of these four were reached by this
round's own fixtures (my merge pair held no bid records, no household membership, and both cards
were in the same studio as Okonkwo) — reported here only so the round's full picture is visible
alongside my own directly-verified finding above.

**Evidence**: `qa-w3-r13/merge-band-1440.png`, `merge-sheet-1440.png`, `merge-after-1440.png`,
`merge-consequence-r13.txt`, `merge-announcement-r13.txt`, `merge-db-check-r13.json`.

---

## 4. Edit a bid outcome — Rivera Finishes on Okonkwo

Rivera Finishes (`bid_outcome: 'no_response'`, the one seed row carrying bid metadata — same
fixture r11/r12 used). Unfolded the row (its own `aria-expanded` toggle, not the bid-editor button
directly — the editor lives inside the row's collapsible panel), opened "Change what came back,"
read the "unchanged" guard sentence first ("The outcome is unchanged, so nothing moves. This
records the dates and who priced it."), then changed "How it came back" to "Selected." Pre-save
sentence read exactly:

> "Recording this moves Rivera Finishes to Awarded. A bidder who did not win never reads as crew."

Saved via "Write the bid": `bid_outcome` → `selected`, `stage` → `awarded`, matching `bidStageOutcome`
exactly. Reverted to `no_response`/`no_response` afterward, confirmed by direct query.

**No finding.** R-BL / the r7/r8 stage-write guard holds exactly as r10–r12 measured it.

**Evidence**: `qa-w3-r13/bid-before-1440.png`, `bid-editor-1440.png`, `bid-editor-sentence-r13.txt`,
`bid-editor-selected-1440.png`, `bid-consequence-selected-r13.txt`, `bid-after-1440.png`,
`bid-after-db-r13.json`.

---

## 5. Household — threshold, add-member consequence, member gate

Walked on the real Okonkwo residence, confirmed fresh (no household on file at the start of the
round): **"No household is on file for this client yet, so what each of them may sign is recorded
seat by seat rather than in one place."** — the empty-household branch's own sentence, which does
**not** carry a `data-household-threshold` attribute (that attribute exists only once a household
row is opened; a fixed selector assuming it always renders is a QA-script bug I hit and fixed
mid-round, not a product defect — see §8).

- **Owner (principal) — open a household, set the figure.** `designer@patina.dev` (org `owner`).
  "Open a household" → "Set the figure" measured `aria-disabled="false"`. Entered $2,500, saved via
  "Write the figure"; `[data-household-threshold]` updated to exactly "Change orders over $2,500
  need a signature from the household." Underlying row confirmed: `client_households.co_threshold_cents
  = 250000`, `display_name = "Okonkwo residence household"`.
- **Add a household member — consequence sentence.** Opened "Add a household member"; the
  consequence region read exactly "This person joins the household and takes a seat on the Okonkwo
  residence. They may sign money to $2,500. Nothing is sent to them." — identical wording to
  r11/r12's own measurement. Not carried through to a write (screenshotted the filled state only,
  same scope choice r11/r12 made to avoid a second live mutation on top of the threshold write
  already exercised).
- **Member — cannot set the figure.** A household must exist for this gate to be checkable at all;
  since the prior leg's household is deleted at test end (restoring the true pristine empty state —
  see §8), this leg minted its own household fixture directly (service role, member_person_ids set
  to Adaeze's and Chidi's cards so the overlap read finds it), then temporarily flipped
  `studio_manager@patina.dev`'s `organization_members.role` from `admin` to `member` on Okonkwo's
  org (reversible, confirmed reverted). Signed in as that account in a separate browser context:
  "Set the figure" measured `aria-disabled="true"`, `aria-describedby="household-figure-held"`
  pointing at a sentence that read exactly "The change-order figure is the principal's to set. An
  owner or an admin of the studio can write it." PR-n holds exactly as r10–r12 measured it.

**No finding** on any of the three legs.

**Evidence**: `qa-w3-r13/household-before-1440.png`, `household-threshold-before-r13.txt`,
`household-owner-aria-disabled-r13.txt`, `household-after-set-1440.png`, `household-db-after-r13.json`,
`household-add-member-form-1440.png`, `household-add-member-consequence-r13.txt`,
`household-member-view-1440.png`, `household-member-aria-disabled-r13.txt`,
`household-member-gate-sentence-r13.txt`.

---

## 6. Close a seat, with a reason

Claire Bissett's real, pre-existing Okonkwo seat (same choice r10–r12 made). Unfolded the row
(via its own name/toggle button), clicked "Close this seat," filled "Why it closed," clicked
"Close the seat":

```json
{"off_job_at": "2026-09-15", "off_job_reason": "QA r13 manual close — round 13 verification.", "stage": "off_job"}
```

Dated (today), reason stored verbatim, stage moved to `off_job`. Reverted afterward, confirmed by
direct query (`off_job_at`/`off_job_reason` null, `stage` back to `active`).

**No finding** on the write itself. **Not re-walked this round** (cross-reference only): r11 m2 —
two separate close-seat implementations (`roster-row.tsx`'s own inline version, used here, vs. the
shared `CloseSeatAct` component `person-profile.tsx` mounts) — standing, not re-filed.

**Evidence**: `qa-w3-r13/close-seat-unfolded-1440.png`, `close-seat-filled-1440.png`,
`close-seat-after-1440.png`, `close-seat-after-r13.json`.

---

## 7. Archive / restore, as owner

An unarchived, non-merged card (excluding Frank Bauer, the do-not-contact fixture) via the
standalone `/people?person=<id>` studio-wide People room, where `ArchiveCardDoor` mounts. "Put this
card away" → "Bring this card back," round-tripped cleanly:

```
afterArchive: archived_at stamped
afterRestore: archived_at null
```

Archived-sentence text read exactly "This card was put away 15 September 2026. It stays out of the
book until it is brought back."

**No finding.**

**Evidence**: `qa-w3-r13/archive-before-1440.png`, `archive-after-put-away-1440.png`,
`archive-after-restore-1440.png`, `archive-sentence-r13.txt`.

---

## 8. e2e/people (chromium)

One full run against the fresh reset, before the manual walk:

```
22 total — 11 passed, 11 failed
FAILED:
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

**Identical, line-for-line, to the canonical 11 r10, r11 and r12 all report** — no new failures, no
fewer. Not re-root-caused again this round (r11 already did that work in `w3-review-r11-qa.md` §2;
nothing in this round's manual walk contradicts any of those root causes). A second full run was
not taken this round (effort budget; r12 already demonstrated the canonical set reproduces
byte-for-byte across two full runs).

**Not a new finding** — cross-referenced only, unchanged in identity and count since r10.

### QA-script defects found and fixed mid-round (not product findings)

While writing the temporary Playwright spec used for tasks 5 (390) and 4–7 above, three of my own
script bugs surfaced and were fixed before evidence was captured — recorded here for the audit
trail, not as product findings:

1. `getByRole('button', {name: 'Call sheet'})` matched two real buttons (the document-spine nav
   item and the letterhead action) — switched to the stable `[data-action-key="open-call-sheet"]`
   selector everywhere.
2. The household-figure and close-seat-reason `<input>` elements carry no `type` attribute in the
   source (`household-band.tsx`, `roster-row.tsx`) — a `input[type="text"]` selector never matches
   an attribute that isn't there; switched to `#household-figure` and `input[id$="-reason"]`.
3. My own household-threshold test assumed `[data-household-threshold]` always renders — it does
   not in the empty-household branch (§5). The first, buggy run of that test errored before its
   `finally` block had captured the newly-created household's id, leaving one stray
   `client_households` row (`display_name = "Okonkwo residence household"`, `co_threshold_cents`
   null) on the local database. Found by comparing an unexpectedly-different "before" sentence
   against the interactive-Chrome walk's own earlier observation, confirmed via direct query
   (`created_at` matched the failed run's timestamp), and deleted. The fixed test's own `finally`
   now deletes the household row outright (not merely nulls the threshold) so the seed's true
   pristine state — no household row at all for Okonkwo — is restored on every run, pass or fail.

---

## 9. Console

Read via `mcp__claude-in-chrome__read_console_messages` with tracking armed across three full page
loads (`/doc/<Okonkwo>`, `/people`, `/desk`) during the interactive portion of the walk: **zero
messages of any kind** (no logs, warnings, or errors) — did **not** reproduce the two console errors
r10, r11 and r12 all independently observed (`TypeError: Failed to fetch` on a Supabase auth-session
refresh, `Error logged: AppError: Not authenticated` while genuinely signed in), which those three
rounds characterized as MINOR/MEDIUM-confidence environment noise from the NestJS services not
running.

**Not filed as a new finding** — this round simply did not reproduce a previously-reported
MINOR/MEDIUM item across three navigations; that is weaker evidence than a positive re-observation,
not evidence the item is fixed (nothing in this wave's diff touches auth-session refresh code), so
it is left exactly as r10–r12 characterized it: worth a `pnpm dev:minimal` re-check in some future
round to settle definitively, still not escalated.

---

## 10. Not findings — settled

- Every ruling in `rulings.md` §3 (R-A through R-BP) — none contradicted by anything observed this
  round.
- SPEC §5.7 row 7's "31 Mar" vs. every other reference's "31 March" — SPEC-internal wording slip,
  not a shipped-code defect (settled r11 §3).
- "prior pricing / prior project notes / show to client" vs. SPEC's literal "2025 pricing / 2025
  project notes" in the "What stays behind" pane — the same one-sided divergence r11 code m1
  logged; corroborated live again this round (visible in `task5-pick-1440-ticked.jpg`), not re-filed.
- The rolodex-picker sheet does not itself re-print the Call Sheet's `data-site-access-line` — the
  Call Sheet's own `DocSheet` stays `open` and mounted the whole time the nested `RolodexPicker`
  sheet is open (`call-sheet.tsx:150`/`:280`), so the line remains in the DOM "behind" the picker
  per R-U's own wording; it is visually occluded, not removed. Consistent with r2–r12's own
  unflagged reading of this same structure.
- The 390 `fullPage: true` screenshot showing the underlying document bleeding through below the
  picker's fixed-height chrome — a Playwright screenshot-capture artifact with `position: fixed`
  overlays (confirmed by re-capturing the identical state with `fullPage: false`, which renders
  correctly), not a real layout defect. See §2.
- The r11/r12 console noise not reproducing this round (§9) — recorded, not escalated, not claimed
  fixed.
- Anything scoped to W4 by the reports.
- `w3-review-r13-migrations.md` MAJOR-1/MAJOR-2 and `w3-review-r13-code.md` MAJOR-1/MAJOR-3 —
  real, already-filed findings from this same round's parallel adversarial reviews, not reachable by
  this round's own chosen fixtures, cross-referenced in §3 for completeness and not double-counted
  here.

---

## Appendix — commands run

```
supabase status --workdir <worktree> -o env                          # local dev keys only, not printed
pnpm supabase:reset                                                    # once, at the start
psql … supabase/tests/people/w3_merge_sweep_household_test.sql        # rc=0, all blocks passed
pnpm --dir <worktree> exec turbo run build --filter=@patina/designer-portal   # env inlined, 7/7 tasks
pnpm exec next start -p 3000                                           # from apps/designer-portal, backgrounded, env inlined
pnpm exec playwright test e2e/people --project=chromium --workers=1    # once, full suite
pnpm exec playwright test e2e/people/_manual-qa-r13.spec.ts --project=chromium --workers=1 -g "…"
                                                                         # temporary manual-QA spec, run in
                                                                         # scoped batches, deleted before finishing
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres           # direct probes/reverts + final residue sweep
kill <next-start-pid>; lsof -nP -iTCP:3000 -sTCP:LISTEN                 # confirmed dead + port free
```

No `pnpm dev`, no `next build` while a server held the port, no chained `cd`, no `git add -A`. The
temporary manual-QA `.spec.ts` file used for the browser walk was deleted before finishing; nothing
from this round is staged or committed except this report and its screenshots. Final residue sweep
(after the browser session closed, before writing this report):

```sql
studio_contacts R13/R12 leftover: 0
client_households Okonkwo:        0
org_members non-default roles:    0
Claire's seat off_job:            0
Rivera's bid != no_response:      0
```

---

## Verdict

**NOT CLEAN — one major, corroborated by an independent live reproduction.**

The merge consequence sentence (`compare-merge-sheet.tsx:108-119`) names "contact rule" among the
facts that move onto the survivor whenever the **survivor** lacks a rule, without checking whether
the **folded** card has one either — so a plain duplicate where neither card carries a rule still
reads a false claim on the face. This is `w3-review-r13-code.md` MAJOR-2, reproduced independently
this round with its own fixture, screenshot, and saved DOM text (§3).

Every other task in scope — bring forward (task 5), a bid-outcome edit, the household threshold and
its principal/member gate, closing a seat with a reason, and archive/restore as owner — held exactly
as r10–r12 measured them, with zero new findings. The e2e/people suite reproduced the identical
canonical 11 failures / 11 passes, unchanged from r10–r12. Two other MAJORs from the parallel r13
migrations review and two more from the parallel r13 code review were not independently reached by
this round's own fixtures and are cross-referenced, not re-verified, in §3.
