# W3 (P2) — QA, round 5

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), local production
build (`next build` + `next start -p 3000`), env passed inline per the binding rule — no
`.env.local` created. **No prod touched.**

**Verdict: NOT CLEAN.** One BLOCKING finding (data loss on merge, corroborating and extending
`w3-review-r5-migrations.md` §B-1 to person-to-person merges — the exact shape of Leah's own
duplicate-card scenario). Three MAJOR findings are cross-referenced from the sibling migrations
review (§M-1, M-2, M-4) because they sit on this round's assigned walk (merge, household); I did
not re-derive them independently this round — see §3.

---

## 1. Procedure

- Port rule: `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` — both free before starting. No conflict to
  report.
- `pnpm supabase:reset` — rc 0, head `00633` + `20260910152111_create_contact_messages.sql`, every
  seed replayed including `people_crm_dev.sql`.
- `pnpm --filter @patina/designer-portal build` with inline env
  (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon/service keys from
  `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, service URLs from `.env.example`) — clean
  build, full route table printed.
- `next start -p 3000` in the background with the same env. `⚠ "next start" does not work with
  "output: standalone"` printed but the server served correctly (curl 200, full hydrated HTML) —
  same as prior rounds; not a defect.
- `npx playwright test e2e/people --project=chromium` — **11 passed, 11 failed** (full run,
  parallel workers). Re-ran `bring-forward.spec.ts` alone, `--workers=1`, against a **freshly
  reset** database to rule out cross-test pollution: the same 2 failures reproduced identically in
  isolation, so they are not parallel-worker collisions. See §4.
- Manual walk: signed in as `designer@patina.dev` / `password123` through the UI sign-in form
  (Playwright driving real Chromium, not the chrome extension, which was unavailable in this
  session — `mcp__claude-in-chrome` reported "Browser extension is not connected"). Walked task 5,
  merge, bid edit, household (add-as-principal + confirm-a-member-cannot), close-seat, archive/
  restore. Screenshots and JSON result dumps under
  `artifacts/people-room-crm-2026-09-11/build/qa-w3-r5/`.
- All throwaway fixtures (temp contacts, temp project, temp low-privilege user) were created via
  `adminDb`/GoTrue-admin and deleted afterward; verified zero residue with a final sweep (no
  `QA R5%`-named projects/contacts, no stray `role='member'` org rows, Rivera Finishes' bid
  reverted to `no_response`/`no_response`). One exception, disclosed: I independently reproduced
  §B-1's data-loss-on-merge for a person pair (below) — those two throwaway person cards and the
  merge record were deleted after the read.
- Server stopped; `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty afterward — port free.

---

## 2. BLOCKING

### B-1 (corroborating & extending `w3-review-r5-migrations.md` §B-1) — merge drops typed facts off the absorbed PERSON card too, not only firm cards

The migrations review measured this on two **firm** cards. I independently reproduced the identical
defect on two **person** cards — the shape of Leah's own task ("these two cards share a phone",
SPEC §5.1 #17 / R-Y) and of my own merge walk (`merge-results.json` below) — because `studio_contacts`
is one table for both entity kinds and `merge_studio_contacts()` (`00629`) carries across only
`profile_id` and `email` regardless of `entity_kind`.

**Reproduced** (fresh rows, authenticated as `designer@patina.dev`, rolled back by manual delete
afterward — not a transaction, so recorded here in full):

```
OLDER  "QA R5 B1Repro Older"   (survivor, PR-o default — no notes/verdict/specialties/warranty)
NEWER  "QA R5 B1Repro Newer"   (absorbed) —
         notes:            "Owner-operator. Repeat sub, verified great with clients."
         studio_verdict:   "Excellent. Always on time."
         specialties:      ["electrical"]
         warranty_until:   2027-06-01

merge_studio_contacts(p_survivor=OLDER, p_merged=NEWER, p_matched_on='phone') -> succeeded

SURVIVOR AFTER MERGE: notes=null, studio_verdict=null, specialties=[], warranty_until=null
```

Every one of the absorbed card's typed facts is gone from the only card the room still opens (the
absorbed card carries `merged_into` and is filtered out of the Directory, the picker, and every
deep link — `use-studio-contacts.ts:215`, `people-room.tsx:130`). My own merge walk's announcer
read, verbatim: *"Two cards are now one. Wren Ashby QAR5 ic6l1 carries everything W. Ashby QAR5
ic6l1 held."* (`compare-merge-sheet.tsx:274`) — the same false claim the migrations review names,
now confirmed on the person-merge path this round's QA brief specifically asked me to walk. My own
throwaway fixtures (in `merge-results.json`) happened to carry only `full_name`/`phone`, so they
did not by themselves exercise this — the defect surfaced only once I built a fixture carrying the
thirteen affected columns, exactly as the migrations reviewer's probe did.

This is data loss on merge by this task's own definition of BLOCKING. I am not filing a second,
independent B-1 — I am reporting that the fix must cover **both** entity kinds, since the
migrations review's own repro used firm cards only and a narrower "firm-only" fix would leave the
person path (Leah's literal scenario) broken.

- Severity: **blocking**. Confidence: **high** (measured twice, by two independent reviewers, on
  both entity kinds).

---

## 3. MAJOR (cross-referenced from `w3-review-r5-migrations.md`, not independently re-derived this round)

These three sit squarely on this round's assigned walk (merge, household), so I am naming them
here rather than silently trusting the sibling document. I did not re-run their probes myself this
round — confidence below reflects the migrations review's own measured evidence, not my own
verification.

- **M-1 · a household's change-order figure can drift from the seats it already granted.**
  `useSetHouseholdThreshold` only updates `client_households.co_threshold_cents`; it does not
  re-write the `money` grant already sitting on any `client_rep` seat added before the figure
  changed. My own household walk set the figure ($2,500) **before** adding the member, so the grant
  and the figure matched at write time and my walk did not surface this — the migrations review's
  repro changes the figure **after** a member is seated, which I did not test this round.
  Severity: major, confidence: high (their measured repro; not independently re-run by me).
- **M-2 · a merge can leave a one-channel contact-rule block behind, unflagged, while the survivor's
  clause says the opposite.** r4's B-2 fix only refuses where the absorbed card is a hard block
  (R-BL); a partial rule (e.g. "never text" while phone/email stay open) is left on the folded card
  with no refusal. This bears directly on Leah's task 4 (do-not-contact) the moment a duplicate
  carrying a partial rule is merged. Severity: major, confidence: high (their measured repro).
- **M-4 · merging into an archived card is permitted, unwarned, and removes the identity from the
  Directory.** Not tested by me this round (my merge fixtures were never archived). Severity:
  major, confidence: high (their measured repro).

---

## 4. MINOR

### m-1 · `bring-forward.spec.ts`'s own count assertion is stale against the current seed, and now permanently red

`bring-forward.spec.ts:159-160` asserts `"4 of 5 from the Lindqvist kitchen selected"`. Reproduced
failing on a **freshly reset** database, single worker, in isolation (not cross-test pollution):
the picker actually shows **6** matches — Ben Ostrom, Claire Bissett, Dana Kowalski, **Erin Sato**,
Ingrid Halvorsen, Pete Rusk — because `people_crm_dev.sql` seats Erin Sato on the Lindqvist kitchen
job a second time (`supabase/seed/people_crm_dev.sql:822`, "F-28: Erin Sato's SECOND SEAT, on the
warranty file... one identity, two seats, two jobs"), so her prior-job history genuinely contains
"Lindqvist kitchen" alongside "Okonkwo residence". The picker's in-memory search
(`rolodex-picker.tsx:298-314`) is reading the record correctly — this is the seed legitimately
growing past the static design specimen's 5-row fixture (`people-room-1440-state-pick-1440.png`
shows exactly 5, no Erin Sato), not a picker defect. I confirmed the same "4 of 6" on the **real**
Okonkwo project too (not just the spec's throwaway project), so this is not scoped to the test's
own fixture.

**This exact discrepancy was independently triaged as "not a defect" by QA rounds r2, r3, and r4**
(`w3-review-r4-qa.md` §4: "live seed data legitimately differs from the static fixture; not a
defect (same as r2/r3)"). I am not overturning that judgment — I reproduce it because the
instruction is to never filter, and I am independently confirming it a fourth time. What **is**
newly actionable: the checked-in `bring-forward.spec.ts` has a hardcoded assertion that has been
wrong since Erin Sato's second seat was seeded, so this spec is now permanently red on every future
run regardless of product correctness, and nothing downstream of line 159 in that test ever
executes (the confirm-and-write assertions, the "no forbidden columns" sweep, the consent-carry
assertion) — meaning this round's e2e run gives **zero** automated coverage of task 5's actual
write path. I closed that coverage gap manually (§5below) rather than fixing the test, since fixing
checked-in test files is outside a QA round's mandate.

- Severity: minor (test-suite hygiene / lost coverage, not a live product defect).
  Confidence: high that the seed/product behavior itself is correct; high that the test is stale.

### m-2 · `bring-forward.spec.ts:248`'s "Put back" locator is not `exact`, and now matches two controls

`page.getByRole("button", { name: "Put back" })` (no `exact: true`) matches both the DocSheet's own
dismiss control (`aria-label="Put back · Esc"`) and the act row's own secondary act
(`data-action-key="bring-forward-put-back"`, accessible name exactly "Put back"). Playwright's
strict mode then fails the test before either control is ever clicked. The **two controls
existing** was already flagged and deliberately deferred as a known minor in an earlier round
(`w3-fix-log-r4.md`, "Not changed" §: "QA finding 2 (MINOR, two 'Put back' controls) ... not in the
handed-back list") — I am not re-filing that. What's newly-visible is that the TEST's own locator
for the second occurrence lacks `exact: true`, unlike its sibling assertions elsewhere in the same
file which do use it — a one-line test fix (`{ name: "Put back", exact: true }`), not a product
change.

- Severity: minor, confidence: high.

### m-3 · `roster-row.tsx`'s Call Sheet close-seat flow does not actually share `CloseSeatAct`, contradicting this round's own documentation

`w3-room-report.md` §6 states: *"`CloseSeatAct` is that act, extracted so the wording, the dated
write and `peopleEvents.seatClosed` cannot drift between the two surfaces."* `w3-review-r5-code.md`
line 86 repeats the same claim ("`CloseSeatAct` is one component on two surfaces"). A repo-wide
grep shows this is not so:

```
grep -rn "CloseSeatAct" --include="*.tsx" --include="*.ts" .
  close-seat-act.tsx:37        — the component's own definition
  __tests__/close-seat-act.test.tsx  — its own unit test only
  views/person-profile.tsx:65,521    — the ONLY production import
```

`roster-row.tsx` (the Call Sheet row) has its **own** independent inline implementation of the
close-seat confirm (confirm sentence at line ~866, reason input, `closeSeat.mutateAsync` at
line ~889, `peopleEvents.seatClosed` at line 895, "Close this seat" trigger at line 1014-1017) —
it never imports `close-seat-act.tsx`. Today the two wordings happen to be byte-identical (I
compared both literally), so there is **no live user-facing defect** — both surfaces currently read
"– Close ‹name›'s seat? The seat stays on the job with the day it closed, and everything it carries
stays with it." and both fire the same analytics shape. But the architectural guarantee this round's
own report claims ("cannot drift") is false: a future wording or analytics-shape edit to
`close-seat-act.tsx` will silently not reach the Call Sheet row, and vice versa. Flagging because
two separate documents this round assert a fact about the code that a grep disproves.

- Severity: minor (no current user-facing symptom; latent drift risk + a documentation-accuracy
  problem, not a broken task). Confidence: high (verified by direct grep, cited above).

### m-4 · `merge.spec.ts`'s own final assertion is self-contradictory (already filed this round as code-review m-1 — reproduced, not re-diagnosed)

`merge.spec.ts:178` asserts `getByText(NEWER_NAME)).toHaveCount(0)` after the test has already
asserted (a few lines earlier) that the room's `role="status"` announcer contains "Two cards are
now one" — and that announcer's own required text is *"‹survivor› carries everything ‹merged›
held,"* which necessarily contains `NEWER_NAME`. I reproduced this failure; `w3-review-r5-code.md`
§m-1 independently diagnosed the identical root cause this same round (itself citing r3's original
diagnosis). Not a product defect — the announcer text is intentional per §2 of this report's own
merge walk, which read correctly.

- Severity: minor, confidence: high. Not counted as new.

### m-5 · a benign console-error pair on fast scripted navigation, reproduced once, gone with realistic waits (same as r4's own disclosure)

During the very first task-5 walk (immediately following the scripted sign-in, `goto` fired at
`domcontentloaded` with no settle time), two console errors appeared once: `TypeError: Failed to
fetch` at a Supabase `_getUser` call, followed by `Error logged: AppError: Not authenticated`. A
dedicated re-walk of sign-in → directory → call sheet → person card with a 1.5s settle after
sign-in and `networkidle` waits produced **zero** console errors (`console-check-results.json`:
`{"errors": []}`). This is the identical timing artifact `w3-review-r4-qa.md` §3 disclosed and
attributed to scripted-navigation speed rather than the product; I have no evidence to overturn
that. Every write in every affected walk still succeeded correctly (confirmed by DB read).

- Severity: minor, confidence: low that it is product-caused (matches r4's own assessment).

### m-6 (informational, not a defect) — other e2e/people failures this round match r2–r4's own prior root-causing

`add-sheet.spec.ts` (×3), `person-card.spec.ts` (×2), `call-sheet.spec.ts` (×1),
`add-client-letter.spec.ts` (×2) failed in the full parallel run with symptom signatures matching
exactly what `w3-review-r4-qa.md` §4 already root-caused and left open (a hardcoded phone/email
collision across concurrent runs; Next's own route-announcer sharing `role="alert"`; an unscoped
`a[data-tel-link]` locator matching the 1440 digits-only link where R-X specifies that is correct;
the `client-invite-letter` flag correctly out of this round's env). I did not re-diagnose these from
scratch given the QA brief's specific scope (task 5, merge, bid, household, close-seat, archive);
recording their re-occurrence per "never filter," not as new findings.

- Severity: minor, confidence: high that these are the same pre-existing, already-diagnosed issues.

---

## 5. Clean (verified this round, with evidence)

- **Task 5 (bring-forward), full write path** — verified end-to-end on a throwaway project (since
  the automated spec's own early assertion failure, m-1 above, meant it never reached its own write
  assertions this round). Ticked exactly Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett;
  pick-count and consequence sentence matched the SPEC §5.7 #7 template with the project name
  substituted; confirmed. DB read (`task5-write-results.json`) shows all four seats written with:
  `studio_contact_id`, `company_id`/`company_name`, `phone`/`phone_e164` carried; `stage='active'`;
  `show_to_client=false`; `sms_consent_status='not_asked'` (PD-11 birth default; the live consent
  read is off `studio_channel_consent`, per R-AY, not this frozen column); `bid_outcome=null`; and
  **no** pricing or notes column exists on `project_parties` at all (confirmed against the live
  schema), so "no seat carries prior pricing/notes" is structurally true, not merely unwritten.
  Every §5.7 string present in the live search-result dialog at both 1440 and 390
  (`task5-1440-*.png`, `task5-390-*.png`): "From the rolodex" title, "OKONKWO RESIDENCE" eyebrow,
  search field, pick-count line, all six rows' name/firm/trade/history/reach/consent/paper words,
  "WHAT TRAVELS" / "WHAT STAYS BEHIND" panes with the exact six/three items, the act row, and the
  consequence sentence.
- **Merge — the interaction itself** (survivor pre-pick, flip, consequence sentence wording,
  `role="status"` announcement, `resolve_merged_contact()` forward resolution, `?person=<merged>`
  deep-link rewriting to the survivor) all worked exactly as specified (`merge-results.json`). The
  one thing that is **not** clean is what actually gets carried across, per §2 above.
- **Bid outcome edit** — opened the folded Rivera Finishes row, unfolded it, opened the bid editor,
  changed the outcome to "They declined", verified the pre-save note ("Recording this moves Rivera
  Finishes to Declined..."), saved, confirmed `bid_outcome='declined'` and `stage='declined'` in the
  DB (R-BL: a losing bidder's stage moves with the outcome). Reverted to `no_response`/`no_response`
  afterward (`bid-household-results.json`).
- **Household — add a member with a threshold, as the principal.** `designer@patina.dev` is the
  studio's `owner` (`organization_members`). Opened the household, set the figure to $2,500
  (`data-household-threshold` read the correct sentence before and after), added a new person as
  "signs for the household" (`client_rep`, the default-pressed role); consequence sentence read
  exactly `householdMemberConsequence()`'s template including "They may sign money to $2,500."; DB
  confirmed a new `client_rep` seat and exactly **one** `project_party_authority` row
  (`scope='money', threshold_cents=250000`) — no second `change_order` grant, consistent with
  `household-band.tsx`'s own docstring (the room-report's §5 claim of a "money **and**
  change_order" grant describes a since-fixed, no-longer-true state; not a live finding).
- **Household — confirm a plain member cannot.** Created a temporary studio member with
  `organization_members.role='member'` (neither owner nor admin) and portal access
  (`independent_designer` + `app_user`), signed in as them, and confirmed on the real Okonkwo call
  sheet: `data-edit-household-threshold` carries `aria-disabled="true"` and
  `aria-describedby="household-figure-held"` pointing at the always-visible sentence "The
  change-order figure is the principal's to set. An owner or an admin of the studio can write it."
  (PR-n's a11y contract, satisfied). Force-clicking the disabled control did not reveal the figure
  input. As defense-in-depth, I also attempted the same write directly via PostgREST as that same
  member (bypassing the UI entirely): refused server-side with `household_threshold_forbidden`.
  Both the client-side gate and the server-side WITH CHECK independently hold.
- **Close a seat with a reason.** Via the person card's `CloseSeatAct` (the canonical component):
  confirm sentence matched `closeSeatConfirmSentence()` exactly; after confirming with a reason,
  the seat's `off_job_at` was stamped to today and `off_job_reason` held the typed text verbatim;
  `stage` moved to `off_job`. A dated act with a reason, never a hard delete, as direction §3.2 R4
  requires.
- **Archive / restore, as owner.** `designer@patina.dev` (owner) was not `aria-disabled` on "Put
  this card away". Archiving stamped `archived_at`; reloading the card printed
  `archivedSentence()`'s exact wording with the correct date; "Bring this card back" cleared
  `archived_at` to null.
- **Console** — zero errors across a realistic (non-scripted-speed) walk of sign-in → directory →
  call sheet → person card. See m-5 for the one caveat.
- **Reset/port hygiene** — `pnpm supabase:reset` succeeded; server stopped cleanly; port 3000 free
  afterward; no `.env.local` created or read; no migration minted (00595–00620 stayed untouched,
  nothing above 00633 was needed).

---

## 6. Not findings (settled, or out of this round's scope)

- Every ruling in `rulings.md` §3 (R-A through R-BM) — none contradicted by this walk.
- `w3-fix-log-r4.md`'s six closed fixes (B-1, B-2, B-3, M-1, M-2, M-3) — re-checked live where this
  round's walk touched them (the deep-link forward-resolution from B-3 was directly exercised in my
  merge walk and held); not re-litigated in full since the migrations/code review lanes already did
  so this round.
- `w3-review-r5-migrations.md`'s minor findings (m-1 through m-10) — outside this round's QA brief
  (schema comments, `search_path`, depth-cap silent-strand behavior, sweep wording); not walked.
- W4-scoped items named in `w3-room-report.md` §10 (no split RPC; the bid-amount field; the
  200-card search scan cap; per-row `useComplianceNotices`; the TEAM-branch tenant leg).
