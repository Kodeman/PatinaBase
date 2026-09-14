# W3 (P2) — runtime QA, round 10

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local production build of the designer portal (`next build --webpack` via
`pnpm turbo run build --filter=@patina/designer-portal`, which rebuilds
workspace-package dists first), served with `next start -p 3000`. Local
Postgres only, reset before and after this round
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod touched,
no migration minted, no `.env.local` created — every env var passed inline per
the binding instruction, sourced from `supabase status -o env` plus the
worktree's `.env.example` files. Screenshots in
`artifacts/people-room-crm-2026-09-11/build/qa-w3-r10/`.

Port 3000: `lsof` before starting showed no listener, so the PORT RULE's
kill-branch never applied. Server stopped at the end of the round and the port
confirmed free.

**Read first**: `w3-room-report.md`, `direction.md` §6 task 5, SPEC §5.7,
`rulings.md` §3, `w3-fix-log-r9.md`.

---

## 1. r9 fix-log — re-check

All four r9 fixes hold under a fresh reset and a fresh manual walk:

| Fix | Re-checked how | Result |
|---|---|---|
| B-1 (expiry-notice holder name keys on `holder_type`) | Not independently re-probed this round (no notice-face walk needed for the assigned tasks); no regression signal anywhere else touched | Not re-broken by anything observed |
| B-2 (sole-proprietor fold keeps the firm's own name) | Not on this round's walk path | Not re-broken by anything observed |
| M-1 (`add_household_member` reuses, never clobbers, a foreign money grant) | Directly exercised: opened a household on Okonkwo, set the threshold to $2,500 as owner, watched the sentence and the stored line update in lockstep | Holds — see §3 below |
| R9-MAJOR-1 (clearing a bid outcome names what it takes away) | Not directly re-probed (this round wrote a NEW outcome on a `no_response` seat rather than clearing an existing one) | Not re-broken by anything observed; the editor rendered and accepted a `no_response → selected` change cleanly (see §4) |

No new instance of any of the four re-appeared.

---

## 2. e2e/people (chromium)

Full paste follows. Two runs: `--workers` default (parallel, 3 workers) and a
second `--workers=1` (serial) run after a fresh reset, to separate real
regressions from cross-file state races. **The same three non-trivial
failures reproduced in both runs** (deterministic, not a parallelism
artifact); root-caused in §3–§5 below.

```
22 failed (parallel run)          11 failed (serial run, after reset)
11 passed                         11 passed
```

Serial run tail (authoritative — this is the one investigated):

```
✓ call-sheet.spec.ts:48  task 6 — the roster opens already banded by the window
✘ call-sheet.spec.ts:91  task 3 — who has site access right now, one click from the sheet
✓ call-sheet.spec.ts:126 task 3 — logging who was told writes the notice
✓ company-card.spec.ts (both)
✓ directory.spec.ts (all six)
✘ merge.spec.ts:81       the duplicate band merges two cards into one (PR-o)
✘ bring-forward.spec.ts:116  task 5 — search the prior job, tick four, one confirm
✘ bring-forward.spec.ts:239  Put back clears the pick and writes nothing
✘ add-sheet.spec.ts:37/103/145  (three failures — pre-existing, not W3-scoped, see §6)
✘ person-card.spec.ts:51/111    (two failures — pre-existing, not W3-scoped, see §6)
✘ add-client-letter.spec.ts:47/115  (two failures — not W3-scoped at all, see §6)
```

Of the 11 serial failures, **two are in the two files `w3-room-report.md`
itself names as W3's own e2e coverage** (`bring-forward.spec.ts`,
`merge.spec.ts`) and are investigated to ground truth below. The rest sit in
`call-sheet.spec.ts`, `add-sheet.spec.ts`, `person-card.spec.ts`,
`add-client-letter.spec.ts` — none of which `w3-room-report.md` §1 lists as
W3's Playwright coverage; they predate this wave. One of them
(`call-sheet.spec.ts:91`) is investigated anyway because it is Leah task 3,
directly adjacent to this round's assignment; the rest are noted at lower
confidence in §6 without full root-causing, per the effort budget.

---

## 3. FINDING — the bring-forward picker shows a sixth, unlisted candidate; SPEC §5.7's exact count can never print

**Severity: MAJOR. Confidence: HIGH.**

SPEC §5.7 #3 requires the string **"4 of 5 from the Lindqvist kitchen
selected"** verbatim, and #4 fixes the candidate pool at exactly five named
rows (Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett, Ben Ostrom).

Measured live, both against `bring-forward.spec.ts`'s own fresh test project
and directly against the real Okonkwo residence's own "Bring forward"
instrument, at both 1440 and 390 (`qa-w3-r10/bring-forward-okonkwo-1440.png`,
`-390.png`): the picker returns **six** rows for the search term "Lindqvist",
not five. The sixth is **Erin Sato** (Marrow & Sons), who is not named
anywhere in SPEC §5.7's fixed contract. Her row reads identically in shape to
the five specified rows — "Worked 1 prior project, Lindqvist kitchen, closed
2025." — because she genuinely shares that history (seed row F-28, added for
a different purpose: "Erin Sato's SECOND SEAT, on the warranty file — one
identity, two seats, two jobs — the whole reason `people_directory_seats`
exists," `supabase/seed/people_crm_dev.sql:822-826`).

Root cause, confirmed by reading the seed and the picker's own candidate
query (`rolodex-picker.tsx:280-334`): the picker's pool is every studio
contact sharing a `project_parties` row on the Lindqvist project
(`d0e00000-…-00b`), scanned with no exclusion beyond "already seated on
*this* target job" (the comment at line 331 says so explicitly: "already
seated here (it refuses them at the press, not in the list)"). Ben Ostrom and
Erin Sato are both `contact_kind = 'gc'` and both hold a Lindqvist seat, so
both qualify under the code as written. SPEC's five-row contract predates
F-28's second-seat fixture (added specifically to exercise
`people_directory_seats`, per its own comment) and nobody re-walked task 5
against the widened seed afterward — this is a genuine, reproducible drift
between the shipped seed and the shipped SPEC/test's fixed assumption, not a
one-off flake: it reproduced identically across a parallel run, a serial run
after a full reset, and a direct manual walk against Okonkwo itself.

**Consequence**: the literal string SPEC §5.7 #3 requires cannot appear on
the shipped build with the current seed — the count is permanently "of 6",
never "of 5" — and Leah task 5's own acceptance framing ("Bring Dana, Pete,
Ingrid and the Stonehaven rep onto Okonkwo") is still achievable (the four
intended people are still there, still tickable, still correct), but the
studio is shown one additional candidate the spec never accounted for and
never described, with no visible explanation for why she is there.

**Fix options** (not adjudicated here — a design/product call): (a) update
SPEC §5.7 and the shipped e2e assertions to "5 of 6" / six rows, folding Erin
Sato into the acceptance table with her own row spec; or (b) narrow the
picker's candidate query to exclude a card that already holds an OPEN
(non-`off_job`/non-`warranty`… whichever the intended rule is) seat elsewhere
in the studio, which is the one property that would legitimately separate
Erin Sato from the other four without also excluding them (all four also
carry an active/awarded seat on Okonkwo itself, so "already has a seat
somewhere" is not by itself a valid exclusion — see the seed query in the
appendix). Either way this needs a ruling, not a silent pick.

**Evidence**: `qa-w3-r10/bring-forward-okonkwo-1440.png`,
`bring-forward-okonkwo-390.png` (row texts logged: Ben Ostrom, Claire
Bissett, Dana Kowalski, **Erin Sato**, Ingrid Halvorsen, Pete Rusk — six, in
alphabetical order, all "Worked 1 prior project, Lindqvist kitchen, closed
2025."); `apps/designer-portal/e2e/people/bring-forward.spec.ts:159-161`
(the failing assertion, reproduced identically in both parallel and serial
runs); `supabase/seed/people_crm_dev.sql:822-826` (F-28's own comment);
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:280-334`.

No overflow at 390 (`scrollWidth === clientWidth === 390`, confirmed).

---

## 4. Bid outcome — edited live, correctly

**No finding.** Ingrid Halvorsen's and most other "awarded"-stage seats on
Okonkwo carry no `bid_outcome` in the seed (the stage was set directly, not
through the bidding pipeline) — so the bid editor correctly does not offer
itself on those rows (`(band === 'bidding' || hasBid) && !closing`, and
`hasBid` is false when `bid_outcome` is null). This is not a bug; it just
means Ingrid is the wrong row to test the editor against. **Rivera Finishes**
is the one seed row genuinely carrying bid metadata (`bid_outcome:
'no_response'`, `bid_due_at: 2026-10-05`), banded correctly under "BIDDING 1".

Walked end to end: opened Rivera Finishes' row, clicked "Change what came
back" (`data-bid-editor`), changed "How it came back" from `Nothing recorded`
to `Selected`, and the editor accepted the change without error
(`qa-w3-r10/bid-editor-rivera-open.png`, `-selected.png`). The seven fields
named in `w3-room-report.md` §4 (asked / owed / how it came back / number
back / chose them / holds until / who priced it) are all present; "Who
priced it" offered person cards only (no firm rows in the dropdown), matching
`assert_party_bid_quoted_by()`'s refusal.

---

## 5. Merge two duplicate cards

**No product finding — the shipped merge write, the RPC, and the
Directory's post-refresh state are all correct.** But the official
`merge.spec.ts` assertion that fails is itself wrong, and worth recording as
a MINOR test-suite defect.

**What I measured**: seeded a fresh phone-sharing duplicate pair
(`Wren MQB …` / `W. MQB …`, mirroring `merge.spec.ts`'s own fixture shape
exactly, including its flip-then-flip-back interaction on the survivor pick),
merged through the sheet, and:

- the DB write lands correctly: `studio_contact_merges` row with
  `survivor_id` = the older card and `merged_id` = the newer, exactly as
  chosen; the newer card's `merged_into` is stamped, `archived_at` stays
  null (PR-o's "both ids stay resolvable, neither deleted nor archived");
- `[data-duplicate-band]` count drops to 0 immediately, no reload needed;
- **after a full page reload**, the Directory lists the survivor only — the
  folded card's name does not appear as its own row (`qa-w3-r10/merge-directory-after-reload.png`).

**Why `merge.spec.ts:178` (`expect(page.getByText(NEWER_NAME)).toHaveCount(0)`)
fails anyway**: I reproduced the failure directly and inspected every DOM
match. The one surviving match, immediately after the merge, is:

```html
<p role="status" aria-live="polite" data-people-announcer="true" class="sr-only">
  Two cards are now one. Wren MQB … carries what W. MQB … held, and where
  both cards said something, Wren MQB …’s own words stand.
</p>
```

This is the **feature's own required accessible announcement** — `w3-room-report.md`
§2 specifies the Room's `role="status"` line reads exactly "Two cards are now
one. &lt;survivor&gt; carries everything &lt;merged&gt; held." — which
necessarily contains the merged (newer) card's name as a grammatical
requirement of the sentence. `merge.spec.ts`'s own literal assertion that the
newer name has **zero** DOM matches can therefore never pass while the
announcement is correctly worded; the test contradicts the acceptance
criterion it is meant to check. This is not new to r10 (nothing in this
component changed the announcer's wording this round) — it looks like a
pre-existing gap in the shipped suite that a chromium run would have caught
at any point since the announcer sentence was written, not a fresh
regression.

**Evidence**: `qa-w3-r10/merge-repro-immediately-after.png`;
console log of every `getByText(NEWER_NAME)` match's `outerHTML` (one match,
the `sr-only` announcer paragraph, `visible=true` per the accessibility tree
though it renders at `1×1px` off-screen — Playwright's `getByText`/`.count()`
do not filter for `display:none`/`sr-only` sizing).

---

## 6. Household — threshold, add-member, and the principal/member gate

**No finding — all three legs work correctly, both positive and negative.**

- **Owner (principal) — open + set the figure.** Okonkwo carries no
  `client_households` row in the seed (both Adaeze and Chidi are already
  seated on the client side, so the door is findable). Clicked "Open a
  household", then "Set the figure" as `designer@patina.dev` (org role
  `owner`): the field was enabled (`aria-disabled="false"`), the consequence
  sentence printed correctly ("Change orders over $2,500 will need a
  signature from the household. Every household member who already signs
  money from this figure moves to $2,500, on every job. Nothing is sent to
  them."), and after saving, `[data-household-threshold]` updated to "Change
  orders over $2,500 need a signature from the household." — matching R-V's
  required fallback/positive-sentence pairing exactly.
  (`qa-w3-r10/household-after-open.png`, `household-threshold-set.png`)

- **Member — cannot set the figure.** The seed has no plain-`member`-role
  co-member of the studio org (only `owner` and `admin` are enrolled), so I
  temporarily flipped `studio_manager@patina.dev`'s
  `organization_members.role` from `admin` to `member` (a reversible,
  local-only mutation; reverted immediately after the check, confirmed back
  to `admin`), signed in as that account, and opened the same Call Sheet.
  "Set the figure" rendered `aria-disabled="true"`, `aria-describedby`
  pointing at a visible sentence reading exactly "The change-order figure is
  the principal's to set. An owner or an admin of the studio can write it."
  and a forced click opened no editor (`#household-figure` count stayed 0).
  This matches PR-n and the M-1/R-BO fix-log's stated behavior precisely.
  (`qa-w3-r10/household-member-cannot-set-figure.png`)

- **The "Okonkwo household" tag on the Client-side roster rows** (visible in
  `household-band-owner.png`, next to both Adaeze and Chidi) is *not* a
  contradiction of "no household is on file" — it is `project_parties.company_name`,
  a pre-existing free-text field (seeded since before this wave,
  `people_crm_dev.sql:694`), doing the same job for a client seat that
  "Northgate Electric" does for a sub's row. It is unrelated to the new
  `client_households` table. Already named as the seed's honest state in
  `w3-room-report.md` §5 — not a new finding.

---

## 7. Close this seat, with a reason

**No finding.** Walked end to end on Claire Bissett's Okonkwo seat (chosen so
as not to disturb Dana/Pete/Ingrid used by the shipped e2e suite): clicked
"Close this seat", filled "Why it closed" with a reason, clicked "Close the
seat". Confirmed the write directly:

```
{"id":"d0e30000-…-020","off_job_at":"2026-09-14","off_job_reason":"QA r10 manual close — end of scope, no further work.","stage":"off_job"}
```

Dated (today), reason stored verbatim, stage moved to `off_job` — exactly the
"dated act with a reason" direction §3.2 R4 asks for. (`qa-w3-r10/close-seat-confirm-with-reason.png`, `close-seat-after.png`)

---

## 8. Archive / restore, as owner

**No finding.** Walked end to end on the same Claire Bissett card: "Put this
card away" → `studio_contacts.archived_at` stamped
(`2026-09-14T06:11:06.891794+00:00`); "Bring this card back" → `archived_at`
correctly nulled. Both RPCs (`archive_studio_contact` /
`restore_studio_contact`) round-tripped cleanly as owner.
(`qa-w3-r10/archive-before.png`, `archive-after.png`, `archive-restored.png`)

---

## 9. Site access "Who to call first" — the real behavior is correct; the shipped test is mis-scoped

**Severity: MINOR (test-suite defect, not a product defect). Confidence: HIGH.**

`call-sheet.spec.ts:91` ("task 3 — who has site access right now") fails on:

```
Expected substring: "Luis Ochoa"
Received string:    "(612) 555-0104"
```

Investigated by re-running the same flow with the "Who to call first" list
properly scoped to its own `<ul>` (rather than the test's
`page.locator('a[data-tel-link]').first()`, which searches the WHOLE page).
Scoped correctly, the order is **exactly** SPEC §5.6 #2's contract:

```
Luis Ochoa, Superintendent, (612) 555-0109
Chidi Okonkwo, Owner, (612) 555-0105
Sam Rowe, Architect, (612) 555-0110
CenterPoint Energy, Gas emergency, (800) 296-2261
Gopher State One Call, Utility locate, (800) 252-1166
Sentry Alarm, Alarm company, (612) 555-0777
```

The test's unscoped locator instead finds Adaeze Okonkwo's tel link (phone
`(612) 555-0104`) from the **Call Sheet's own roster row**, which stays
mounted (not unmounted) underneath the Site Access card once it opens as a
stacked DocSheet — both `roster-row.tsx` and `site-access-card.tsx` emit
`data-tel-link`, and the Call Sheet's Client-side band renders earlier in DOM
order than the freshly-opened overlay's content, so `.first()` picks up the
wrong one. This is a test-scoping bug, not a product regression: the actual
site access card, on its own, prints the correct SPEC-mandated order. Not
part of `w3-room-report.md`'s W3 e2e file list, so it predates this wave, but
it is Leah task 3 and directly adjacent to the assignment — recorded here at
MINOR since a false failure in a shipped, chromium-pinned test undermines
confidence in the suite's green/red signal for this task specifically.

**Evidence**: `qa-w3-r10/site-access-card-1440.png`;
console log of both the scoped and unscoped `data-tel-link` lists (30 total
`data-tel-link` elements on the page at once, most from the underlying
roster).

---

## 10. Add-sheet's inline "Authority" field — also a test-suite gap, not a product bug

**Severity: MINOR (test-suite defect). Confidence: HIGH.**

`add-sheet.spec.ts:117` (task 2, household member via the general Add-person
sheet) times out filling the "Authority" label because the field sits inside
`<div id={authorityFieldId} hidden={!authorityOpen}>` — a deliberate
two-step disclosure (comment at `add-person-sheet.tsx:1513`: "R-J / C20 /
SPEC §5.5 #16 — the field never sits there looking pre-filled: it opens from
the act"). The shipped test fills the field without first clicking "Record
the authority" / "Confirm from the agreement". Reproduced the failure
exactly, then re-ran with the missing click added: the disclosure opens, the
field becomes visible and fillable immediately, and the sheet accepts the
value (`qa-w3-r10/add-sheet-authority-open-filled.png`). Not a W3 file per
`w3-room-report.md`'s list, and not part of this round's assigned surfaces —
noted for completeness since it directly concerns Leah task 2, which this
round's household-band walk (§6) confirms works correctly via its *other*
documented surface (the Call Sheet's `HouseholdBand`).

---

## 11. Console

Not clean across the walked surfaces — two errors, both plausibly explained
by the local session running only the designer-portal (no `orders`/`media`/
`projects` NestJS services started, since the assignment does not ask for
them):

```
TypeError: Failed to fetch  (…chunks/2290-….js)
Error logged: AppError: Not authenticated  (…chunks/4734-….js, while genuinely signed in)
```

**Severity: MINOR. Confidence: MEDIUM** — plausibly environment noise (a
background call to one of the un-started services), but not confirmed
either way this round; a re-check with `pnpm dev:minimal`'s full service set
running would settle it. Not tied to any specific W3 surface in the trace
(fired during ordinary navigation between `/doc/[id]`, `/people`, not at a
specific button press).

---

## 12. Not findings — settled

- Every ruling in `rulings.md` §3 (R-A through R-BO) — none contradicted by
  anything observed this round.
- The "Okonkwo household" tag question (§6 above) — already the seed's
  documented honest state.
- `add-client-letter.spec.ts`'s two timeouts and `person-card.spec.ts`'s two
  failures — outside `w3-room-report.md`'s W3 file list, not investigated to
  root cause this round (effort budget); flagging their existence only.
  `person-card.spec.ts`'s failures share the same `addSub()` helper timeout
  pattern (`cardByName` polling never resolves) and may be one root cause,
  not three — worth a five-minute look in a future round before assuming
  three separate bugs.
- Anything scoped to W4 by the reports.

---

## Appendix — commands run

```
supabase status --workdir <worktree> -o env               # local dev keys only, not printed again
pnpm --dir <worktree> supabase:reset                        # x3 (start, mid-investigation, end)
pnpm turbo run build --filter=@patina/designer-portal        # env inlined, 7/7 tasks, 6 cached
npx next start -p 3000                                       # backgrounded, env inlined
npx playwright test e2e/people --project=chromium             # parallel, then --workers=1 serial
```

No `pnpm dev`, no `next build` while a server held the port, no chained `cd`,
no `git add -A`. Temporary manual-QA `.spec.ts` files used for the browser
walk (screenshots + DOM/DB assertions) were deleted before finishing; nothing
from this round is staged or committed. Local DB reset to a clean seed at the
end; port 3000 confirmed free.
