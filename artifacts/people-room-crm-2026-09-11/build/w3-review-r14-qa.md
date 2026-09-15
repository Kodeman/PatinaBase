# W3 (P2) — runtime QA, round 14

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head at start `61a780967` (r13's fix commit); a companion round-14 review commit
(`ebaa6d1aa`, `w3-review-r14-code.md` + `w3-review-r14-migrations.md`) landed on the branch
from another session partway through this round — read and cross-referenced below, not
duplicated. Local production build of the designer portal
(`pnpm --dir <worktree> --filter @patina/designer-portal build`, then
`npx next start -p 3000` from `apps/designer-portal`), env passed inline per the binding
instruction — no `.env.local` created or read anywhere in the worktree.

**Read first**: `w3-room-report.md`, `synthesis/direction.md` §6 task 5, `specimens/SPEC.md`
§5.7, `rulings.md` §3, `build/w3-fix-log-r13.md`. Also read once discovered mid-round:
`build/w3-review-r14-code.md`, `build/w3-review-r14-migrations.md` (a parallel review track
for this same round — see §0). Screenshots and raw evidence: `build/qa-w3-r14/`.

**PORT RULE**: `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting showed no listener each of
the two times a server was started this round — the kill branch never applied. Server stopped
at the end of each leg (`kill`, confirmed dead by a second `lsof` with no output/rc=1; no
`kill -9` was ever needed). Port 3000 confirmed free at the very end of the round.

Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), reset once at
the start of this round (`supabase db reset --workdir …`, rc=0, clean replay through head
`00633`, every seed ran — migrations tail unchanged: `00628`–`00633` then the unrelated
`20260910152111_create_contact_messages.sql`; nothing in the reserved `00595`–`00620` band
touched). No migration minted. No prod touched. No `pnpm dev`. No `next build` while a server
was on the port (the two `next start` legs were separated by an explicit stop+port-free check,
and the one `next build` ran before any server existed on 3000).

Signed in as `designer@patina.dev` via Mailpit (`http://localhost:54324` — this stack's
Inbucket successor per `config.toml`'s own deprecation warning, same as prior rounds), landed
on `/desk` as **Leah Hartwell**. A second short leg signed in as `studio_manager@patina.dev`
(temporarily demoted from the org's `admin` to `member` — reverted immediately after, confirmed
in DB) to exercise the household-figure member gate, matching r10–r13's own pattern; a third
leg came back to `designer@patina.dev`.

Evidence method: an interactive Chrome session throughout (no Playwright spec written for the
manual walk — the two shipped specs were run as-is, see §1), with every write reverted via
direct SQL and confirmed reverted by a follow-up query, and every scratch fixture (duplicate
card pairs, a throwaway project) deleted at the end of its own leg. Sweep confirmed clean at
the very end (§8).

---

## 0. A companion review landed on the branch mid-round — read, not re-derived

While this QA leg was underway, another session pushed `ebaa6d1aa` — a round-14 adversarial
migrations review and a round-14 code review, both dated ahead of this leg's own start. Their
verdicts: migrations **NOT clean — one BLOCKING** (`sms_capable` destroyed by a merge, r6
BLOCKING-1's own gap, one column short of R-BN), zero major, twenty minor; code **zero
blocking, zero major, ten minor** (R14-1 through R14-10).

This QA report does not re-file either track's findings as if newly discovered. Where a task
this round's brief assigned ("merge two duplicate cards") overlaps their find, §3 below adds an
**independent runtime reproduction on the actual rendered face** — the kind of evidence a
migrations-only review cannot produce by itself — and is filed as corroboration, not a
duplicate line item. Every other item in §4 (code review) is left as that review filed it;
none was re-walked this round for its own sake.

---

## 1. `e2e/people` (chromium) — run for the first time this round

Neither spec has ever been executed before now (`w3-room-report.md` §1: "Not run — the
brief's own instruction; no dev server, no port taken"). This round's brief asked for the run.
Both specs execute against the local production build on `:3000`, chromium project only
(`--project=chromium`), no other browser project touched.

```
Running 3 tests using 3 workers

  1) [chromium] › e2e/people/bring-forward.spec.ts:251:5 › Put back clears the pick and writes nothing
     Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Put back' })
     resolved to 2 elements:
       1) aria-label="Put back · Esc" (doc-type-meta, the DocSheet's own dismiss control)
       2) data-action-key="bring-forward-put-back" aka getByRole(..., { name: 'Put back', exact: true })

  2) [chromium] › e2e/people/merge.spec.ts:81:5 › the duplicate band merges two cards into one (PR-o)
     Error: expect(locator).toHaveCount(2) — wait, toHaveCount(0) failed
     Locator: getByText('W. Ashby bp1y5')
     Expected: 0
     Received: 1 (9 retries, same each time)

  3) [chromium] › e2e/people/bring-forward.spec.ts:116:5 › task 5 — search the prior job, tick four, one confirm
     Error: expect(received).toBe(expected)
     Expected: "opted_out"
     Received: null
     (polling people_directory_seats.consent_status via adminDb)

  3 failed
    bring-forward.spec.ts:116:5 › task 5 — search the prior job, tick four, one confirm
    bring-forward.spec.ts:251:5 › Put back clears the pick and writes nothing
    merge.spec.ts:81:5 › the duplicate band merges two cards into one (PR-o)
```

**3 of 3 tests failed on their first-ever run. All three are test-authoring defects, not
product regressions** — each was independently root-caused and reproduced by hand against the
same running build (details in §2/§3/§5). This exact trio of failures, and this exact
diagnosis for two of the three, was **already reached once before**, in `w3-review-r8-qa.md`
§(the spec-vs-product table) — this round's independent re-derivation agrees with it, and adds
the root cause for the third (task 5's consent poll), which r8 did not attempt.

**Finding QA-R14-1 — major, confidence high.** The e2e suite this wave shipped for its own two
flagship flows (merge, bring-forward) has **never once passed**, and the room report's own test
inventory (`bring-forward.spec.ts`, `merge.spec.ts`, "chromium-pinned") reads as coverage that
does not exist. This is not a defect in the shipped feature (verified independently, live, in
§2/§3 below) — it is a defect in the safety net around it. Filed as major because task 5 and
merge are two of Leah's six named tasks and the program's own definition of done leans on tests
that cannot currently confirm either works.

- **`bring-forward.spec.ts:260`, "Put back" strict-mode violation.** Two real, distinctly
  purposed controls share an overlapping accessible name in the SAME open sheet: the standard
  `DocSheet` header's universal dismiss control (`overlays/doc-sheet.tsx:184-191`, `aria-label`
  and visible text both **"Put back · Esc"**, present on every sheet in the app since an
  earlier wave, SP-13/F46) and the bring-forward act row's own **"Put back"**
  (`data-action-key="bring-forward-put-back"`), which SPEC §5.7 #6 itself names. Playwright's
  default substring name-match conflates them; `{ exact: true }` or the `data-action-key`
  selector resolves it. Not a new defect in the suite's authoring pattern — the same collision
  and the same "no, not a product bug" verdict is on record in `w3-review-r8-qa.md`.
- **`merge.spec.ts:178`, the absorbed name still visible after merge.** Confirmed by DOM walk
  (`document.createTreeWalker`, see `qa-w3-r14/merge-consequence-ashby-r14.txt` for the same
  sentence measured against a fresh pair): the surviving text is the Room's own `role="status"`
  announcer (`data-people-announcer`, `class="sr-only"`), whose sentence is SPEC's own
  literal contract ("Two cards are now one. `<survivor>` carries what `<merged>` held…") — the
  test asserts the folded name appears nowhere, which contradicts the room's own designed
  confirmation text. Also on record in `w3-review-r8-qa.md`, same verdict.
- **`bring-forward.spec.ts:227`, Pete's `people_directory_seats.consent_status` reads `null`.**
  Root-caused this round (not attempted in r8): `people_directory_seats` is
  `security_invoker=true` and its `consent_status` column is gated on
  `is_active_studio_member(project_consent_org(...))`, which resolves through `auth.uid()`.
  `e2e/helpers/supabase-admin.ts`'s `adminDb` is a bare `SUPABASE_SERVICE_ROLE_KEY` client with
  **no acting user** — `auth.uid()` is NULL for it, so the view's own WHERE clause excludes
  every row for every project, not only the fresh one this spec creates. Proven two ways:
  (a) reproduced the identical `null` querying the SAME view as plain `postgres` with no JWT
  claims set; (b) wrapped the identical query in a transaction with
  `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"<designer
  uid>","role":"authenticated"}', true);` and got `opted_out` back correctly for **both** the
  real Okonkwo seat and a freshly-created project's fresh seat. The feature (PR-b / R-BB) is
  correct; the test's own read path cannot see any row this view emits, for any project, ever.

**Evidence**: full run log kept in this round's scratch output (not a repo artifact — the exact
error text is quoted above verbatim); `qa-w3-r14/merge-consequence-ashby-r14.txt` for the
independent DOM reproduction of finding 2.

---

## 2. Task 5 — bring forward, walked at both widths against the real Okonkwo Call Sheet

Navigated the shipped path: `/doc/<Okonkwo>` → `[data-action-key="open-call-sheet"]` → "From
the rolodex," same as `bring-forward.spec.ts`'s own `openThePicker()`.

**Every §5.7 string present, R-BP's six-row amendment confirmed live**: "From the rolodex,"
search field, **"0 of 6 from the Lindqvist kitchen selected"** before any tick, all six rows
present (Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk),
Erin Sato present, unticked, no verdict language anywhere in the sheet.

Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. Pick count read exactly
**"4 of 6 from the Lindqvist kitchen selected."** Consequence sentence, measured via
`[data-bring-forward-consequence]`:

> "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate
> Electric's insurance lapsed 31 March 2026."

— byte-for-byte the SPEC/room-report text (`qa-w3-r14/task5-consequence-r14.txt`). Act row and
all four checkboxes carry `aria-disabled: null` (never gated), matching SPEC §5.7 #6.

Pressed "Add four to the roster" against the real, unmodified project (all four already seated
on this seed): the sheet stayed open and printed exactly "Claire Bissett, Dana Kowalski, Ingrid
Halvorsen, Pete Rusk are already on the call sheet." Confirmed by direct query:
`project_parties` count for Okonkwo unchanged at 24 before and after. This is r12's per-pick
refusal, holding exactly, still.

**A discrepancy, not against the code — against the SPEC's own literal acceptance text, never
ruled.** SPEC §5.7 row (d) specifies Claire Bissett's history line as **"Saved twice, one
firm."** — distinct wording from the repeat-visit line the other rows carry. The shipped room
prints, for Claire, **"Worked 1 prior project, Lindqvist kitchen, closed 2025."** — the same
line Dana/Pete/Ingrid/Ben get. This is not a code defect: queried directly, Claire genuinely
holds two `project_parties` rows — one completed on the Lindqvist kitchen (`completed_at
2025-11-21`), one active on Okonkwo — so the shipped line **agrees with the record**. It is
SPEC's own acceptance text that has drifted from the seed, exactly the shape R-BP fixed for
Erin Sato's five→six row count — but unlike Erin's change, no ruling in `rulings.md` §3 amends
Claire's line, and eight-plus rounds of QA/code/migrations review (I grepped every prior
`w3-review-r*-qa.md` and the r13 migrations report for "Saved twice, one firm" and for
Claire's history text specifically) never called it out. **Severity: minor, confidence: high**
(directly queried and measured). Not a Leah-task break — the line the studio reads is true —
but SPEC §5.7 row (d) should either be re-amended (R-BP's own shape) or the seed's Claire
Bissett fixture should be reshaped to genuinely read "Saved twice, one firm," whichever the
build intended.

**390**: same picker state (search "Lindqvist," ticks preserved). Measured viewport was 500px
wide, not exactly 390 — the browser-window automation tool used this round manages a real OS
window and could not be forced below ~500px on this machine, unlike Playwright's
`setViewportSize`. `scrollWidth − clientWidth = 0` at that width (no horizontal overflow). This
is a tooling limitation of this round's evidence-gathering method, not a product measurement —
flagged so it is not mistaken for a verified-at-exactly-390 claim.

**No product finding.** Task 5 behaves exactly as r10–r13 measured it, on the real unmodified
project, one round after r13's own six major fixes.

**Evidence**: `qa-w3-r14/task5-pick-1440-r14.jpg`, `task5-pick-390width-r14.jpg`,
`task5-consequence-r14.txt`.

---

## 3. Merge two duplicate cards

### 3a. The r13 QA/code fix (contact-rule branch on the pair, not the survivor alone) — holds

Seeded a fresh pair (`Wren Ashby R14Q` / `W. Ashby R14Q`, sharing a phone, **neither** card
carrying a contact rule — the exact shape that caught r13-qa-major-1). Band read "These two
cards share a phone." + both names as live open-person controls + "Compare these two." Sheet
pre-picked the **older** card (Wren Ashby, 1 March 2024) as survivor, both column heads
`aria-pressed` buttons (PR-o). Consequence sentence read:

> "…seats, channels and firm designations move onto Wren Ashby R14Q… The trades and
> specialties on both cards are kept together, and a card recorded as a sole proprietor keeps
> that either way. Consent stays with the number, not with the card…"

— **"contact rule" correctly absent** from the moves-list (neither card carries one); the fix
from r13-qa-major-1 / r13-code-major-2 holds exactly. Pressed "Merge into Wren Ashby R14Q…":
Directory head count dropped 42 → 41, the survivor's profile opened directly (the room-report's
own designed behavior, "the survivor's card opens"), and the `role="status"` announcer read
"Two cards are now one. Wren Ashby R14Q carries what W. Ashby R14Q held…" — the same sentence
whose presence in the DOM is what trips `merge.spec.ts` (§1). Fixture deleted afterward,
confirmed zero `R14Q`-named rows remain.

**No finding** on the contact-rule branch or the merge mechanics generally.

### 3b. Independent runtime corroboration of `w3-review-r14-migrations.md` BLOCKING-1

The parallel migrations review (§0) filed a fresh blocking finding this same round: a merge
DELETEs the absorbed card's `studio_contact_channels` row outright without first reducing its
**`sms_capable`** column onto the survivor (R-BN names six reduced columns; the table carries a
seventh). Measured there in a rolled-back SQL transaction. This QA leg reproduced it live, on
the actual rendered face, as an independent check (not a re-filing):

- Seeded a pair on one phone (`+16125559940`): `R14Q SMS Older` (2024, pre-picked survivor per
  PR-o) and `R14Q SMS Newer` (2026, folded) — each holding a `mobile` channel row on that
  number, **only the newer/folded row** stamped `sms_capable = true` (the shape the
  finding names: "the studio had pressed 'This line takes texts' on the newer one").
- Pressed "Merge into R14Q SMS Older" via the live sheet, no survivor flip.
- **DB after**: exactly one `studio_contact_channels` row remains on the number, owned by the
  survivor, `sms_capable = false`. The folded row is gone — not stranded on an unreachable
  card, gone.
- **The face after** (survivor's own Reach & access panel, same session, no reload):

  > "Mobile · preferred (612) 555-9940 … Patina has not been told this line takes texts, so
  > nothing about texting can be written down on it yet." — with **"THIS LINE TAKES TEXTS"**
  > showing again as an unpressed act.

  A previously-confirmed typed fact is gone from the face the studio reads. This is this
  task's own definition of **blocking** ("a wrong fact on a face") independently satisfied on
  the rendered UI, not only in a SQL probe.

**Severity: blocking (as filed by the migrations review; this leg adds runtime corroboration).
Confidence: high.** Fixture rows deleted afterward; confirmed zero `R14Q`-named
`studio_contacts` remain.

**Evidence**: `qa-w3-r14/sms-capable-merge-destruction-r14.txt`,
`qa-w3-r14/merge-consequence-ashby-r14.txt`.

**Not independently re-walked this round** (out of scope for this leg's own fixtures, and
already covered by the migrations review at r14 and the code review's ten minors): the
migrations review's twenty minors, and code review R14-1 through R14-10 (stale
`studio-contact-history` cache key, zero-row bid-write plumbing leak, the `CloseSeatAct`
duplication itself, the room report's stale quoted strings, the one-way withdrawn-bid door, the
`carried_opt_out` mis-derivation, the 200-uuid history scan's request-size ceiling, the two
status-voice refusals, the natively-`disabled` add-household-member button, and the missing
`company_kind` compare-table row). None of these were reached by this leg's own walk; reported
here only so the round's full picture is visible alongside this report.

---

## 4. Edit a bid outcome — Rivera Finishes on Okonkwo

Same fixture r10–r13 used (`bid_outcome: 'no_response'`). Unfolded the row (its own
`aria-expanded` toggle), opened "Change what came back," read the unchanged-guard sentence
first: "The outcome is unchanged, so nothing moves. This records the dates and who priced it."
Changed "How it came back" to "Selected." Pre-save sentence read exactly:

> "Recording this moves Rivera Finishes to Awarded. A bidder who did not win never reads as
> crew."

Saved via "Write the bid": `bid_outcome → selected`, `stage → awarded`, matching
`bidStageOutcome` exactly. Reverted to `no_response` / `no_response` (the seed's own value —
confirmed against `people_crm_dev.sql`, not guessed) afterward, confirmed by direct query.

**No finding.** R-BL / the r7/r8 stage-write guard holds exactly as r10–r13 measured it.

**Evidence**: `qa-w3-r14/bid-outcome-r14.txt`.

---

## 5. Household — threshold as principal, add-member consequence, member gate

Confirmed fresh at round start (no household on Okonkwo): **"No household is on file for this
client yet, so what each of them may sign is recorded seat by seat rather than in one place."**

- **Owner (principal) opens a household, sets the figure.** `designer@patina.dev` (org
  `owner`). "Open a household" → household created → `[data-household-threshold]` read "No
  change-order figure is on file for this household." "Set the figure" measured
  `aria-disabled="false"`. Entered `2500`; consequence sentence read exactly "Change orders
  over $2,500 will need a signature from the household. Every household member who already
  signs money from this figure moves to $2,500, on every job. Nothing is sent to them." Saved
  via "Write the figure": `[data-household-threshold]` updated to exactly "Change orders over
  $2,500 need a signature from the household." DB confirmed: `client_households.co_threshold_cents
  = 250000`, `display_name = "Okonkwo residence household"`.
- **Add a household member — consequence sentence.** Opened "Add a household member"; role
  toggle offered "Decides the work" / "Signs for the household" (client_rep/household_member,
  the studio's own words, C5); consequence region read exactly "This person joins the household
  and takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is sent to
  them." — identical wording to r11–r13's own measurement. Dismissed via "Not now," not carried
  through to a write (same scope choice r11–r13 made, to avoid a second live mutation stacked
  on the threshold write already exercised).
- **Member — cannot set the figure.** `studio_manager@patina.dev`'s
  `organization_members.role` temporarily flipped `admin → member` on Okonkwo's org (reversible;
  confirmed reverted to `admin` immediately after this leg). Signed in as that account: "Set the
  figure" measured `aria-disabled="true"`, `aria-describedby="household-figure-held"` pointing
  at a sentence **always on the face**, pressed or not: "The change-order figure is the
  principal's to set. An owner or an admin of the studio can write it." PR-n holds exactly as
  r10–r13 measured it, confirmed this round against a genuine `member` role (not merely
  `admin`, which is itself permitted to write).
- The household fixture was **deleted** at the end of this leg (matching r13's own practice) to
  restore the true pristine empty state; confirmed zero `client_households` rows named
  "Okonkwo" remain.

**No finding** on any of the three legs.

**Evidence**: `qa-w3-r14/household-threshold-set-r14.txt`,
`qa-w3-r14/household-add-member-consequence-1440-r14.jpg`,
`qa-w3-r14/household-member-gate-aria-disabled-1440-r14.jpg`,
`qa-w3-r14/household-member-gate-r14.txt`.

---

## 6. Close a seat, with a reason

Claire Bissett's real, pre-existing Okonkwo seat (same choice r10–r13 made — the Call Sheet's
own inline path, `roster-row.tsx`, per this round's task wording "close a seat... on the Call
Sheet"). Unfolded the row, clicked "Close this seat" — dialog read "Close Claire Bissett's
seat? The seat stays on the job with the day it closed, and everything it carries stays with
it." and offered "Added by mistake" as a REFUSED alternative ("This seat carries paperwork the
studio holds. Close it instead, so the paper keeps its place.") — the pre-existing
`seatDeleteRefusal` (W2c) held. Filled "Why it closed": "QA r14 manual close — round 14
verification." Clicked "Close the seat":

```
off_job_at: 2026-09-15
off_job_reason: "QA r14 manual close — round 14 verification."
stage: off_job
```

Dated (today), reason stored verbatim, stage moved. Reverted afterward
(`off_job_at`/`off_job_reason` NULL, `stage` back to `active`), confirmed by direct query.

**No finding** on the write itself. **Not re-walked this round** (cross-reference only): code
review R14-3 / r11 m2 — `CloseSeatAct` remains mounted on one surface (`person-profile.tsx`)
while the Call Sheet row keeps its own byte-identical inline copy; standing, not re-filed here.

**Evidence**: `qa-w3-r14/close-seat-r14.txt`.

---

## 7. Archive / restore, as owner

An unarchived, non-merged, non-do-not-contact card (`Nadia Brooks`, Kestrel Staging) via the
standalone `/people?role=all&scope=studio` studio-wide People room. "Put this card away" — a
single press, no confirmation step (the standing act R-AB describes) — immediately printed
"This card was put away 15 September 2026. It stays out of the book until it is brought back."
with "Bring this card back" beside it. Directory head count dropped 42 → 41. Pressed "Bring
this card back": card restored, head count back to 42, "Put this card away" reappeared with no
archived banner. DB confirmed round-trip: `archived_at` NULL both before the archive (baseline)
and after the restore.

**No finding.**

**Evidence**: (round-trip confirmed by direct query and by the rendered card text; no separate
screenshot filed — the two `household-*` and two `task5-*` images already cover this round's
1440/390 evidence quota).

---

## 8. Console, cleanup, and port

Console tracking was armed for the bulk of this round's interactive session (armed before the
signed-in walk began through to the final archive/restore leg); **zero console errors or
exceptions** were reported at any point queried. Not independently re-checked: the brief moment
between initial page load and the first `read_console_messages` call, before tracking attaches
(a known limitation of the tool, not a gap in the walk — every screen this round's tasks
touched was re-visited at least once after tracking armed).

**Fixture sweep, confirmed clean at the end of the round:**

| Check | Result |
|---|---|
| `studio_contacts` named `%R14Q%` | 0 |
| `projects` named `%R14Q%` / `%bring forward%` | 0 |
| Rivera Finishes bid | `no_response` / `no_response` (seed value) |
| Claire Bissett's Okonkwo seat | `off_job_at` NULL, `stage = active` |
| `studio_manager@patina.dev` org role | `admin` (reverted) |
| `client_households` named `%okonkwo%` | 0 |
| Nadia Brooks `archived_at` | NULL |
| Okonkwo `project_parties` count | 24 (unchanged from round start) |

No migration minted. No `git add -A`; this report and its `qa-w3-r14/` evidence directory are
the only new paths under `build/`, added with explicit pathspecs and `git add -f` per the
binding instruction on the next commit. Working tree otherwise clean
(`git status --porcelain` empty before this report was written).

**Port**: `lsof -nP -iTCP:3000 -sTCP:LISTEN` confirmed no listener after each of the two
`kill`s issued this round (once after the main walk, once after the §3b corroboration leg) —
no `kill -9` was needed either time.

---

## 9. Summary

**Not clean — one blocking (corroborated, not newly discovered), one major (the e2e suite's
0-for-3 first run), three minors.** Every task-5/merge/bid/household/close-seat/archive-restore
walk this round's brief assigned came back matching r10–r13's own measurements exactly, with
one SPEC-text drift (Claire Bissett's history line) surfacing along the way. The one blocking
fact — a merge silently reverting a confirmed "this line takes texts" record to unconfirmed —
was already on the branch from a parallel migrations review by the time this leg reached it;
this report's contribution there is proving it on the rendered face, not only in SQL.
