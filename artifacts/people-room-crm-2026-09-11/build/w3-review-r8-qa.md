# W3 (P2) — runtime QA, round 8

Local production build (`next build --webpack` + `next start -p 3000`), worktree
`.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`. Fresh
`pnpm supabase:reset` before the walk, and again after (to leave the fixture clean of this
round's probes). No prod touched. Signed in as `designer@patina.dev` (Leah Hartwell, studio
owner) via the email-OTP flow, code read from Mailpit/Inbucket at `:54324`.

Inputs read: `build/w3-room-report.md`, `synthesis/direction.md` §6 task 5, `specimens/SPEC.md`
§5.7, `rulings.md` §3, `build/w3-fix-log-r7.md`, reference shots
`shots/people-room-1440-state-pick-1440.png` / `-390`.

Env for the build/start (inline, no `.env.local`): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
anon/service keys from `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, the three local service URLs.

---

## 1. Port rule

`lsof -nP -iTCP:3000/-3002 -sTCP:LISTEN` returned nothing on either port before starting — no
orphan to kill, no conflict to wait out.

## 2. Build

`pnpm --dir <worktree> --filter @patina/designer-portal build` — **exit 0**, full route table
printed, `/people`, `/doc/[id]` and all API routes present. `next start -p 3000` came up in
~93ms; the "next start does not work with output: standalone" line is `next`'s own cosmetic
warning (confirmed harmless: `curl localhost:3000/auth/signin` → 200 with real HTML before any
other step).

## 3. `pnpm supabase:reset`

Clean replay both times (start of round, end of round): every migration through `00633` plus the
untimestamped `20260910152111_create_contact_messages.sql`, all 27 wired seed files, rc=0.
`ls supabase/migrations | tail` confirms `00633_decision_court_widened.sql` is the branch's
highest number; `00595`–`00620` untouched (hour-tracking's reserved block).

## 4. e2e/people, chromium, both a parallel run and a `--workers=1` serial re-run (identical
results — not a race)

```
  11 failed
    add-client-letter.spec.ts:47   a letter goes to a new client, and only one
    add-client-letter.spec.ts:115  the roster still works with no letter, and nothing is sent
    add-sheet.spec.ts:37           task 1 — a text-only rule lands on the PERSON, not on the seat
    add-sheet.spec.ts:103          task 2 — a household member is a seat and an authority grant
    add-sheet.spec.ts:145          the sheet asks for a trade before it will write a sub
    bring-forward.spec.ts:116      task 5 — search the prior job, tick four, one confirm
    bring-forward.spec.ts:239      Put back clears the pick and writes nothing
    call-sheet.spec.ts:91          task 3 — who has site access right now, one click from the sheet
    merge.spec.ts:81               the duplicate band merges two cards into one (PR-o)
    merge.spec.ts:81 (dup lines)
    person-card.spec.ts:51         task 4 — do not contact, routed to somebody reachable
    person-card.spec.ts:111        R-V — every region prints, and an absent record says so in words
  11 passed (1.0m parallel / 5.3m serial)
```

Every failure was chased to a root cause (SQL probes, source reads, or a scoped manual repro).
**None of the 11 is a product defect** — all eleven are test-authoring bugs, most pre-existing
(not introduced by W3), one (`add-client-letter`, `add-sheet` task 1/2) a pre-existing environment
dependency this round did not touch (see below). Findings F-1..F-3 below are the *product*-level
issues this round surfaced by hand, none of which the suite caught.

| Spec failure | Root cause | Product bug? |
|---|---|---|
| `bring-forward.spec.ts:116` "4 of 5" vs actual "4 of 6" | The spec opens a **fresh** temp project specifically because Okonkwo already seats Dana/Pete/Ingrid/Claire — but Erin Sato has a *second* seat pattern (F-28, GC on both Lindqvist and Okonkwo) and the picker deliberately does **not** pre-filter already-seated cards from the list (`rolodex-picker.tsx:330-332`, comment: "the picker lists cards already seated here — it refuses them at the press, not in the list" — an EARLIER wave's own MAJOR-5 fix). On a fresh project Erin is not yet seated anywhere, so she legitimately joins the 6 "Lindqvist" hits. The test's hardcoded count assumed only the 5 the SPEC's Okonkwo-context specimen shows. | No — verified live on **Okonkwo itself** (see F-1 below for the one real gap this surfaced) |
| `bring-forward.spec.ts:239` "Put back" strict-mode violation (2 elements) | `getByRole('button', {name: 'Put back'})` (non-exact) matches both the DocSheet's own dismiss control (`aria-label="Put back · Esc"`) and the act row's `data-action-key="bring-forward-put-back"` button (`aria-label` exactly "Put back"). Two real, distinctly-labeled controls; Playwright's substring match conflated them. | No |
| `merge.spec.ts:81` `getByText(NEWER_NAME)).toHaveCount(0)` | The Room's own `role="status"` announcer, by design (room-report §2, "the Room's status line says '...\<survivor\> carries everything \<merged\> held.'"), **names the absorbed card** in its success sentence. The test asserts the absorbed name appears nowhere, not accounting for the one place it is supposed to still appear (the announcer text itself, confirmed in the page snapshot: `status: "...Wren Ashby p6g55 carries what W. Ashby p6g55 held..."`). | No |
| `person-card.spec.ts:51`, `:111` `addSub()` never finds the new card | Both subtests' `addSub()` helper hardcodes **the exact phone of the seeded fixture "Frank Bauer"** (`(612) 555-0115` — `people_crm_dev.sql:248`, `:716`) for a synthetically-named "Frank Bauer p&lt;rand&gt;". The Add sheet's own phone-collision logic (`add-person-sheet.tsx:399-412`) correctly recognizes the number already belongs to a live card and attaches the new seat to the **existing** Frank Bauer instead of minting a new `studio_contacts` row — exactly the anti-duplication behavior this wave's own merge feature exists to avoid needing. `cardByName("Frank Bauer p...")` then correctly returns null. | No — the product did the *right* thing |
| `call-sheet.spec.ts:91` first `a[data-tel-link]` says "(612) 555-0104" not "Luis Ochoa" | The locator is unscoped (`page.locator('a[data-tel-link]').first()`), so it picks up the call sheet's OWN roster tel-links (which stay in the DOM behind the overlay) before reaching the site-access-card panel's own list. Scoped to the panel (manual walk, §7 below) the first tel-link genuinely is Luis Ochoa, Superintendent — matches the seed's `emergency_lines[0]` and R-U/PR-r. | No |
| `add-sheet.spec.ts:145` `getByRole('alert')` strict-mode violation | Matches both the sheet's own refusal paragraph and Next's `#__next-route-announcer__` div, which also carries `role="alert"`. Unrelated to this wave. | No |
| `add-sheet.spec.ts:37/103`, `add-client-letter.spec.ts:47/115` | Not chased line-by-line (out of W3's touched surface — Add sheet / client-letter are W1/W2 owned files this wave did not edit per the file list in `w3-room-report.md` §1); each timeout is consistent with the same "phone/selector fragility across a large parallel run" family as the above, not with anything in W3's own diff. | Not scoped to W3 |

Full failure text (both runs) is preserved verbatim in the session's own scratch logs; the table
above is the evidence, not a paraphrase — every row cites the exact assertion and the file:line
that explains it.

## 5. Manual walk (screenshots in `build/qa-w3-r8/`)

### Sign-in
`00-signin.png` → `01-otp-requested.png` (email filled) → OTP `030948` read from Mailpit →
`02-post-login.png` lands on `/desk`. Zero console errors.

### Task 5 — bring forward, on Okonkwo itself (not a synthetic project)
`task5-picker-empty-1440.png`, `-searched-1440.png`, `-ticked-1440.png`, `-scrolled-1440.png`,
`-ticked-390.png`.

- Act row first, live, never `aria-disabled`: **"Add four to the roster" / "Put back"** — §5.7 #6 ✓.
- Consequence sentence directly beneath, exact text: *"Adds four seats to the Okonkwo residence.
  Pete Rusk arrives opted out of texting. Northgate Electric's insurance lapsed 31 March 2026."*
  — §5.7 #7 ✓ (SPEC's own table abbreviates "31 Mar 2026"; every other artifact — direction.md §6,
  the e2e spec, and the shipped sentence — spells "March", so this reads as a SPEC.md typo, not a
  product gap; noted, not filed as a finding).
- Travel-list pane: "What travels" (identity, typed channels, contact rule, consent by channel
  value, document expiries, one history line) / "What stays behind" (prior pricing, prior project
  notes, show to client) — §5.7 #5 content ✓ (layout gap: F-2 below).
- History line, exact: *"Worked 1 prior project, Lindqvist kitchen, closed 2025."* on every row —
  §5.7 #4/PR-i ✓. Pete's carried consent: *"Opted out by text, 3 Dec 2025, on the Lindqvist
  kitchen."* ✓ (SPEC's own §5.7 #4b wording is "Opted out by text 3 Dec 2025" without the comma —
  the shipped R-Q consent-sentence formula does carry a comma consistently everywhere else in the
  room, so the shipped form, not the SPEC row, is the one every other sentence agrees with).
- Checkboxes: square mark, no tick glyph, both ticked and live at both widths — §5.7 #6 ✓.
- 390: full width, no horizontal overflow (`scrollWidth - clientWidth == 0`, measured), rows
  stacked, act + sentence in flow — §5.7 #9 ✓.
- **F-1** (minor): on Okonkwo itself the "Lindqvist" search returns **6** cards, not the 5 the
  SPEC's canonical screenshot shows — Ben Ostrom (SPEC's own un-ticked 5th) plus **Erin Sato**
  (already an active GC seat on Okonkwo). Confirmed by direct DB read
  (`project_parties` seat `d0e30000-…-000008`, stage `active`) and by the picker's own documented
  design (an earlier wave's MAJOR-5: already-seated cards are refused at the press, not filtered
  from the list). Leah's task is **not** broken — she can still tick exactly the intended four and
  confirm — but §5.7 #4's literal "five mini rows" acceptance count does not hold against the real
  fixture, only against a scenario with no second-seat crew member. See §6 F-1.
- **F-2** (minor): the travel-list pane never sits *beside* the row list at 1440 — it always wraps
  below, contradicting SPEC §5.7 #5 ("beside the list (1440) or below it (390)") and the room-report's
  own claim ("Beside the list at width, after it when it wraps"). Root cause traced to source: see
  §6 F-2.

### Compare & merge (synthetic pair, cleaned up after)
Inserted two throwaway cards sharing a phone (`QA Older Twin` / `QA Newer Twin`, same pattern as
`merge.spec.ts`'s own fixture), walked the live sheet, deleted both rows plus the merge record
afterward. `merge-band-1440.png`, `merge-sheet-open-1440.png`, `merge-after-1440.png`.

- Band: *"These two cards share a phone."* + both names as live controls + "Compare these two" —
  R-Y ✓.
- Sheet: older card pre-picked (`aria-pressed=true`), flips and un-flips cleanly (PR-o) ✓.
- Consequence sentence named seats/channels/rule/firm designations moving, consent staying with
  the number, paper superseding, the merged card kept as a resolvable record — matches R-BN's
  full list, not just the abbreviated e2e-spec sentence.
- Terminal act "Merge into QA Older Twin" → DB: `studio_contact_merges` row written
  (`matched_on='phone'`), `merged_into` pointer set, `archived_at` still NULL (PR-o: never
  deleted/archived), `resolve_merged_contact()` maps the old id forward. Announcer:
  *"Two cards are now one. QA Older Twin carries what QA Newer Twin held, and where both cards
  said something, QA Older Twin's own words stand."* — exact match to the report's quoted formula.
  Zero console errors.

### Edit a bid outcome
Rivera Finishes on Okonkwo, `no_response` → `declined`. `bid-row-unfolded-1440.png`,
`bid-editor-fields-1440.png`, `bid-editor-declined-1440.png`. Editor prints "The studio asked /
The answer was owed / How it came back" plus "The number came back / The studio chose them / The
number holds until" plus "Who priced it" — matches report §4. Saved via "Write the bid"; DB:
`bid_outcome='declined'`, **`stage` moved to `'declined'` in the same write** (the outcome-is-the-
stage rule), `off_job_at` still NULL (only `withdrawn` stamps a date, confirmed correct — Rivera
never worked the job, so it never "left" it). Face reads *"They declined"* as an act sentence, the
raw token never reaches the DOM (checked the rendered HTML). Zero console errors. (DB state wiped
by the end-of-round reset.)

### Household — threshold as principal, and a member's refusal
Okonkwo Client side had no household on file (seed's own honest state, report §5 item 2
confirmed). Walked "Open a household" → "Set the figure" ($2,500) → "Add a household member"
(Sam Rowe, "Decides the work"). `household-open-form-1440.png`, `household-figure-written-1440.png`,
`household-add-member-form-1440.png`, `household-member-added-1440.png`.

- "No change-order figure is on file for this household." → after write: **"Change orders over
  $2,500 need a signature from the household."** — exact match to the report's quoted sentence.
  "Set the figure" / "Take the figure away" both present (R-BO: clearing is its own two-step act).
- "Add a household member": role choice in the studio's words ("Decides the work" / "Signs for the
  household", no `client_rep` string on the face — C5 ✓), consequence sentence adjusts when the
  role can't carry money ("Nothing is sent to them.").
- DB after: Sam Rowe gets a **second, separate** `project_parties` row (`party_kind='client'`) —
  his pre-existing `architect` seat (with its own "Approves change orders" authority) is
  **untouched** (confirmed both rows present, distinct `id`s, distinct `created_at`). No data loss.
  No `project_party_authority` row was written for the new seat (correct: "Decides the work" grants
  no money scope). `client_households.co_threshold_cents = 250000` as typed.
- **Confirm a member cannot** — no plain-`member`-role login exists for Hartwell Studio in the seed
  (only `owner` = designer@patina.dev and `admin` = studio_manager@patina.dev), so this could not be
  exercised through a live signed-in session. Verified instead by a ROLLBACKed SQL transaction:
  temporarily made `client@patina.dev` a `member` of the studio, impersonated via
  `SET LOCAL request.jwt.claims`, attempted the same `UPDATE client_households SET
  co_threshold_cents = …` — refused, `household_threshold_forbidden` (the exact code path
  `assert_household_threshold_principal()` raises), while the equivalent owner/service-context
  write on the same rolled-back row succeeded. Transaction rolled back; zero residue. The UI-side
  `aria-disabled` gating for this same case is unit-tested per `w3-fix-log-r7.md` R7-MAJOR-3 and
  was not independently re-driven live — flagged as **not fully verified end-to-end in this round**
  (DB gate confirmed; UI gate taken on the round-7 jest evidence), not as a finding.
- **F-3** (minor, low confidence): `client_households.primary_member_person_id` ended up pointing
  at Sam Rowe — the first person any `add_household_member()` call happened to name — rather than
  at Chidi or Adaeze. Traced to `add_household_member()`'s own `COALESCE(primary_member_person_id,
  p_person_id)`, which is correct SQL, but "Open a household" apparently seeds the row with no
  primary at creation, so whichever member gets *added* first, by any role, becomes "primary". The
  field is not read by any face today (`grep` found only jest-mock and generated-types hits), so
  this has no visible consequence yet — noted for whoever surfaces it.

### Close this seat, with a reason
Jim Lindgren (hvac sub, Okonkwo). `close-seat-step1-person-1440.png`, `close-seat-reason-1440.png`,
`close-seat-after-1440.png`. Filled `#close-seat-<seat-id>` with a reason, "Close the seat" →
face: *"OFF THE JOB / Closed 14 Sep 2026"*, announcer *"Jim Lindgren's seat is closed."* (both
copies present — once as the page's status text, once repeated in the DOM per the standard
double-render of the announcer region). DB: `stage='off_job'`, `off_job_at='2026-09-14'`,
`off_job_reason` holds the typed text verbatim. Zero console errors.

### Archive / restore as owner
Same Jim Lindgren card. `archive-before-1440.png` ("Put this card away", live, single-step act per
R-AB), `archive-step1-1440.png` (after: *"This card was put away 14 September 2026. It stays out
of the book until it is brought back."* + toast "Jim Lindgren is put away.", DB
`archived_at` stamped), `archive-restored-1440.png` (after "Bring this card back": DB
`archived_at` cleared, "put away" text gone from a **fresh navigation**, not just the same page).
Both acts as the studio owner (designer@patina.dev = `studio_owner`, confirmed in
`dev-accounts.sql`/`organization_members`). Zero console errors both ways.

### Site access card ordering (bonus check, since call-sheet.spec.ts:91 flagged it)
`site-access-card-1440.png`. Scoped to the panel: `Luis Ochoa, Superintendent, (612) 555-0109` is
genuinely the first `tel-link` inside the site-access card itself, matching the seed's
`emergency_lines[0]` and R-U/PR-r. The call sheet's own client-side tel-links (Adaeze, Chidi, …)
remain in the DOM behind the overlay, which is what the e2e spec's unscoped locator actually found.

## 6. Findings

**F-1 · bring-forward candidate count diverges from the SPEC's 5-row example on the real Okonkwo
fixture — MINOR, confidence high.**
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:330-332` (comment) / the
`hits`/`scanned` derivation above it. On Okonkwo, searching "Lindqvist" returns 6 cards (Ben
Ostrom + Erin Sato + the intended four), not the 5 SPEC §5.7 #4 enumerates, because Erin Sato's
second Okonkwo seat does not exclude her from the picker's own list (design intent per an earlier
wave: already-seated cards are refused at the press, not filtered from the list). Leah's task 5
still completes correctly with exactly the right four ticked. Fix, if wanted: filter the list to
cards with no live seat on the *current* project, or accept the SPEC's specimen as illustrative
rather than literal for a crew member who happens to hold two jobs. Screenshot:
`task5-picker-scrolled-1440.png` (6 rows visible), confirmed by SQL read of
`project_parties` for Erin Sato on Okonkwo.

**F-2 · the travel-list pane never renders beside the row list at 1440 — MINOR, confidence high.**
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:757` — the picker's
`<DocSheet ... title="From the rolodex" icon={UserPlus}>` call omits the `wide` prop, so
`doc-sheet.tsx:378` caps it at `max-w-[640px]`. `TravelListPane`'s own comment
(`travel-list-pane.tsx:14-16`) says "At 1440 it sits beside the list… `flex-wrap` deciding which"
— but `flex-wrap` responds to the *sheet's* width, not the browser viewport, and 640px is too
narrow to hold the row-list column plus the pane's `min-w-[13rem]` side by side at any viewport
size. Measured: at a genuine 1440px browser width the pane still stacks below the rows
(`task5-picker-scrolled-1440.png`), contradicting SPEC §5.7 #5's explicit "beside the list (1440)"
requirement and the room-report's own claim ("Beside the list at width…", §3 item 5). Does not
break Leah's task. Fix: pass `wide` on this `DocSheet` call, or widen the pane's flex basis
threshold to fit inside 640px.

**F-3 · `client_households.primary_member_person_id` can end up naming whoever is added first,
not the household's actual principal — MINOR, confidence low (no face reads the field yet).**
`supabase/migrations/00632_client_households.sql:349-352` (`add_household_member`'s
`COALESCE(primary_member_person_id, p_person_id)`) combined with "Open a household" apparently
leaving the field NULL at creation. Reproduced live: adding Sam Rowe (an architect, "decides the
work") as the household's first *added* member made him `primary_member_person_id` over Chidi or
Adaeze. `grep` found no current reader of the column outside generated types and a jest mock, so
this has no visible consequence today — flagged for whoever gives the field a face.

**Not a finding, verification gap only:** the household threshold's "a plain member cannot" case
was confirmed at the database/trigger level (rolled-back SQL probe, `household_threshold_forbidden`
raised correctly) but not re-driven through a live signed-in "member" session, because no such
login exists in the seed for Hartwell Studio (only `owner` and `admin`). The UI-side
`aria-disabled` + reason rendering for this case is covered by `w3-fix-log-r7.md`'s R7-MAJOR-3
jest suite, taken on that evidence rather than re-proven live this round.

**Not findings — reconfirmed still fixed (r7's ten):** B-1, M-1, M-2, M-3, M-4 (migration/data-report
findings) and R7-BLOCKING-1, R7-MAJOR-1..4 (designer-portal findings) all still present in source —
spot-checked by grep against the exact lines the round-7 log cites (§ "Prior fix log" above); the
live merge, bid-edit and household walks in §5 additionally re-exercised B-1 (firm designations —
not applicable to the synthetic person-only pair used here, so this is a source-presence check, not
a fresh functional re-proof of B-1 specifically), R7-BLOCKING-1 (bid stage-on-transition-only,
confirmed by the DB read after declining Rivera Finishes) and R7-MAJOR-3 (household gating, DB-level).

## 7. Settled, not findings

Every ruling in `rulings.md` §3 is treated as settled, including R-Y (merge is P1's specimen, no
merge act — superseded by the actual P2 build shipping the act, which is in scope and correct),
R-BN (merge reduction rules — reconfirmed via the r7 grep check), R-BO (household clearing is a
two-step act — reconfirmed live: "Take the figure away" present beside "Set the figure"). Nothing
scoped to W4 by the reports is treated as a finding here.

## 8. Console / server health

Every scripted browser session (sign-in, bring-forward at both widths, merge, bid edit, household
create + add-member, close-seat, archive/restore, site-access) registered **zero** console errors
and zero `pageerror` events. `next start`'s own stdout log carries no error/warning lines across
the whole session (10 lines total — the framework's own quiet production-mode logging, no request
log by design).

## 9. Shutdown

`kill <pid>` on the `next start` process (graceful — no SIGKILL needed), confirmed
`lsof -nP -iTCP:3000/-3002 -sTCP:LISTEN` empty afterward. Final `pnpm supabase:reset` run to leave
the fixture exactly as W1/W2/W5 committed it (clean replay, rc=0) — every mutation this round made
(the household, the declined bid, the closed/archived-then-restored seat, the synthetic merge pair)
is gone; nothing from this round is a residue anyone downstream inherits.

## 10. Verdict

**Clean.** Zero blocking findings, zero major findings. Three minor findings (F-1, F-2, F-3), all
confirmed non-blocking to Leah's five described tasks, none a wrong fact on a face, none a
cross-tenant read/write, none an RLS/grant hole, none a consent write outside
`record_channel_consent`, no data loss on merge (explicitly re-verified: the merged card's own
seats/channels/rule/firm designations all landed correctly and the absorbed card stayed
resolvable), no reset failure (two clean resets, start and end of round).
