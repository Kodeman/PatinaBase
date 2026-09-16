# W2 review — round 4 QA, re-run (local production build, as Leah)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `fb8e4e528` ("fix(people-room):
W2 round-3 findings — channel key, band headings, consent word, rule clause,
way-in stamp, firm card"). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), designer@patina.dev's
studio ("Local Dev Studio", `b0000000-0000-0000-0000-000000000001`), Okonkwo
residence project (`d0e00000-0000-0000-0000-00000000000a`). No prod touched.

**This supersedes the `build/w2-review-r4-qa.md` this session found already on
disk (timestamped 01:27, staged but never committed).** That file was written
against a build that predates two later round-3 fix commits
(`3f2daada7` 02:14, `fb8e4e528` 02:56) — it is stale, not this round's answer.
It is overwritten here rather than appended to a new filename, per the task's
own naming.

## 0. Procedure actually run

1. `lsof -ti :3000` empty before starting (confirmed twice: at session start
   and again after stopping the server at the end). Worktree has no
   `.env.local` — every value below passed inline, per the task's ENV recipe.
   `supabase status -o env` (sandbox disabled for this one call, per the
   task's own instruction — the CLI's telemetry-file write trips the default
   sandbox) gave `API_URL=http://127.0.0.1:54321`,
   `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
   `INBUCKET_URL=http://127.0.0.1:54324`.
2. `pnpm --dir <worktree> --filter @patina/designer-portal build`, with
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (the local demo keys from step 1),
   `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
   `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true` exported inline —
   succeeded, full route table printed, `/people` and `/doc/[id]` present.
3. `pnpm --dir <worktree> --filter @patina/designer-portal exec next start -p
   3000` in the background, same env. Ready in 91ms. Same benign `output:
   standalone` warning every prior round saw; the server answered every
   request correctly throughout.
4. Playwright, `apps/designer-portal/playwright.config.ts` (`testDir:
   './e2e'`, `baseURL: http://localhost:3000`, `reuseExistingServer:
   !process.env.CI` with `CI` unset, so it reused the running `next start`).
   Real invocation, run twice — once with default (auto) worker count and
   once with `--workers=1` to rule out cross-test contention on the shared
   DB — both gave the **identical** pass/fail list:
   ```
   cd apps/designer-portal
   SUPABASE_SERVICE_ROLE_KEY=<local> NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<local> \
     npx playwright test --config playwright.config.ts --project=chromium e2e/people
   ```
   **Result: 10 passed / 9 failed**, both runs. Sandbox disabled for the
   Playwright process only (Chromium's launch needs OS access the default
   sandbox denies — the same friction every prior round hit).
5. Signed-in manual walk as `designer@patina.dev` (password auth, the same
   fixture `e2e/fixtures/auth.ts` itself uses — chosen over magic-link via
   Inbucket for the same reason every prior round gave: it is the suite's own
   path, not an extra risk). Walked the six Leah tasks at 1440 and 390 via
   short Playwright scripts; screenshots and full-page text dumps written to
   `build/qa-w2-r4/` (this round's 24 files, all timestamped ~03:2x today;
   the four `*-pick-*` files left over from the stale 01:2x attempt were
   removed — Bring forward is W3 scope per R-BM and was never part of this
   round's walk).
6. Console: captured via `page.on('console'/'pageerror')` during the walk
   (`console-1440.json`, `console-390.json`, `page-errors-*.json`).
7. **Two additional standalone reproductions, declared:** root-causing why
   `add-sheet.spec.ts:37` still fails post-fix required writing two
   throwaway people (a phone-collision repro and a clean-phone control).
   Both were deleted by hand before finishing, including a **pre-existing**
   stray row (`QA Dana Kowalski hncfv`, an incompletely-cleaned artifact from
   an **earlier** round, not this one) discovered auto-linked onto the real
   Dana Kowalski's card — see QA‑R5‑2. `studio_contacts`/`project_parties`
   confirmed clean of every `QA %` row before finishing.
8. Server stopped (`kill` on the `next start` PID), port confirmed free
   (`lsof -ti :3000` empty).

---

## 1. Task table

| Task | Acts | Pass/Fail | Evidence |
|---|---|---|---|
| 1 — Dana Kowalski, text-only rule | Person card → Reach & access → Contact rule reads "Text only. The email on file bounces. Set by Leah Hartwell, 12 Oct 2026." with a live "EDIT THE RULE" act; channels, consent sentence, access grant, seats, paper, history all render | **PASS** for reading/editing the EXISTING card | `qa-w2-r4/1440-person-dana.txt` |
| — same task, via the Add sheet, phone NOT already on file | Add sheet, "a sub", fresh name + fresh phone `(612) 555-0199` + rule, "Add to the roster" | **PASS** — seat, card, channel and rule all four write correctly | live repro (§3, cleaned up after) |
| — same task, via the Add sheet, phone matching an EXISTING card (the realistic "add someone met before" case, and what `add-sheet.spec.ts:37` exercises) | Add sheet, "a sub", a NEW typed name + Dana Kowalski's real phone `(612) 555-0111` + rule, "Add to the roster" | **FAIL — blocking, newly root-caused this round** | `QA‑R5‑1` below |
| 2 — Adaeze's login + Chidi's $2,500 authority | Call Sheet, Client side band | **PASS** — Adaeze `ON PAPER`/reach and Chidi's row reads "Signs money to $2,500. Approves change orders to $2,500. Certifies draws." with the rule "Email first. Call for anything over $2,500…" beneath | `qa-w2-r4/1440-callsheet.txt` (Client side band) |
| — automated coverage for task 2 | `add-sheet.spec.ts:103` | **FAIL, test-authoring gap, unchanged from QA‑R3‑2** | authority field still behind a disclosure the spec doesn't open first |
| 3 — who has site access, one click | Call Sheet head → "Open the site access card" | **PASS** | `qa-w2-r4/1440-siteaccess.txt` — who to call first (Luis Ochoa, Chidi Okonkwo, Sam Rowe, plus the seed's utility/alarm lines), the way in with no code digit anywhere, key holder, hours, receiving, who was told, "Studio only. This card never reaches a client page." — one screen, one click |
| — automated coverage for task 3 | `call-sheet.spec.ts:91` | **FAIL, test-authoring gap, unchanged from QA‑R3‑3** | `tel:` locator still unscoped to the card |
| 4 — Frank Bauer, do-not-contact routed to Rosa | Person card, Directory row, roster row, company crew line | **PASS**, wording evolved from SPEC's literal string | `qa-w2-r4/1440-person-frank.txt`, `1440-directory.txt:197`, `1440-callsheet.txt` (Frank's later-band row) — "No direct contact, at his request. Write Rosa Delgado; she forwards what he has to sign." with her email and `tel:`-linked office phone, present on all three surfaces. See `QA‑R5‑4` (copy, minor) |
| — automated coverage for task 4 | `person-card.spec.ts:51`, `:111` | **FAIL — same root cause as QA‑R5‑1** | `addSub` helper's hardcoded phone collides with a standing card by design of its own second call |
| 5 — bring Dana, Pete, Ingrid, Stonehaven onto Okonkwo | Call Sheet → "From the rolodex" | **FAIL — not built, expected/tracked, unchanged from QA‑R3‑4** | opens the single-add rolodex picker, not SPEC §5.7's multi-select travel-list pane; W3 per `w2c-report.md` §4.6 and R‑BM |
| 6 — everyone on Okonkwo by role, this week | Call Sheet opens already banded | **FAIL — newly found this round, environmental not code** | `QA‑R5‑2` below |

---

## 2. Playwright run detail

```
cd apps/designer-portal && npx playwright test --config playwright.config.ts --project=chromium e2e/people
```
(identical result with `--workers=1`)

**10 passed / 9 failed.** Failures:

1. `add-sheet.spec.ts:37` task 1 — **QA‑R5‑1 (blocking)**, re-root-caused this round (below) — QA‑R4‑1's channel-normalisation fix is real and holds for a clean phone, but the test's own scenario (a phone that collides with a standing card) surfaces a different, deeper defect the fix didn't touch
2. `add-sheet.spec.ts:103` task 2 authority disclosure — unchanged, QA‑R3‑2, minor/test-only
3. `add-sheet.spec.ts:145` "asks for a trade" strict-mode alert ambiguity — unchanged, QA‑R3‑5, minor/test-only
4. `call-sheet.spec.ts:48` task 6 bands — **QA‑R4‑2's own fix (band-heading text) verified present and working** (the test progresses past the exact assertion QA‑R4‑2 named); it now fails four lines later, at the held-clause locator scoped to `this_week` — **QA‑R5‑2** below, an environmental/seed-date cause, not the code QA‑R4‑2 touched
5. `call-sheet.spec.ts:91` task 3 tel-link locator scope — unchanged, QA‑R3‑3, minor/test-only
6. `person-card.spec.ts:51` task 4 — same root cause as QA‑R5‑1
7. `person-card.spec.ts:111` R‑V — same root cause as QA‑R5‑1
8. `add-client-letter.spec.ts:47` — environmental, unchanged from QA‑R3‑6 (flag-override gap when the server is reused rather than spawned by Playwright)
9. `add-client-letter.spec.ts:115` — same as #8, unrelated to the People room CRM build

---

## 3. QA‑R5‑1 (BLOCKING) — a phone collision silently writes the studio's typed rule and channel onto the WRONG person's card, under a success toast naming someone else

**Severity: BLOCKING. Confidence: high — reproduced live twice (a clean
control and the collision case), with DB verification before and after each,
and independently reproduced inside the real `add-sheet.spec.ts:37`,
`person-card.spec.ts:51` and `:111`.**

QA‑R4‑1's fix (re-reading the recovery row through `normalize_channel_value`)
is real and correct: adding a genuinely new person with a genuinely new phone
now writes all four rows cleanly. Verified live:

```
Add sheet: "QA Fresh Person <suffix>", sub, mobile (612) 555-0199, rule typed
→ studio_contacts row created, studio_contact_channels row +16125550199,
  studio_contact_rules row with the typed reason, project_parties seat —
  all four, correctly, under the new person's own card.
```

00626's `apply_party_rolodex_link_trg` auto-links a new seat to an EXISTING
card whenever the typed phone matches one already on file — by design, and
exactly Leah's task 1 in the wild: a studio re-adding someone it has worked
with before types that person's real, known number. **This is the scenario
`add-sheet.spec.ts:37` deliberately exercises** (`uniqueName("Dana
Kowalski")` paired with Dana's real seeded phone `(612) 555-0111`), because
it is also the realistic shape of the studio's own mistake this defect
exposes: a **different** name and an **existing** phone.

Reproduced live, deliberately typing an unrelated name against Dana's real
number:

```
Add sheet: "QA Collide Person <suffix>", sub, mobile (612) 555-0111
  (= Dana Kowalski's real, standing number), rule "Text only. Testing
  collision.", Add to the roster.
→ role="status" announces: "QA Collide Person <suffix> added to Okonkwo
  residence."
→ DB, immediately after:
   project_parties: new seat, display_name "QA Collide Person <suffix>",
     studio_contact_id = d0e10000-…-0011  (Dana Kowalski's REAL card)
   studio_contact_rules WHERE subject_id = 'd0e10000-…-0011':
     reason = 'Text only. Testing collision.'   ← Dana's ACTUAL, real
     rule — the one every send gate and every other surface reads —
     silently overwritten by a rule the studio typed while looking at a
     completely different name on screen.
```

No dialog, no confirmation, no "this phone is already on file for Dana
Kowalski" notice of any kind — the toast names the typed person, and nothing
on the face tells the studio member that the fact they just recorded landed
on somebody else's identity. The auto-link ITSELF (attach a returning
person's new seat to their existing card) is correct, intended behaviour
(CR3‑1's own description, and the only way Leah's real task 1 works at all
when the name typed matches the card's own name). The defect is narrower and
sharper: **the write proceeds identically, with identical success feedback,
whether the typed name matches the matched card's name or not** — so a
studio member who mistypes a digit, or who is entering someone who
legitimately shares a phone with an existing rolodex entry (a shared office
line, a household), corrupts that OTHER person's standing contact rule with
no way to know it happened short of opening that person's card separately
afterward.

**A second, lasting consequence, found live and NOT created by this round's
repro:** the auto-linked seat also becomes a permanent, dateless, unlabelled
extra row under "SEATS ON PROJECTS" on the matched card — `qa-w2-r4/1440-
person-dana.txt` (captured **before** this round's own collision repro/
cleanup) already showed a second "Okonkwo residence · Subcontractor ·
Electrical / ON THE JOB / No authority on this job / Hidden from the client"
seat with no window dates on Dana Kowalski's card, traced to `QA Dana
Kowalski hncfv` — a stray row from an **earlier** review round's own
incompletely-cleaned repro, sitting there since before this session started.
The mechanism this round root-caused is exactly why that artifact was able
to attach itself permanently and silently to a real fixture identity. Both
`QA Collide Person <suffix>` and `QA Dana Kowalski hncfv` were removed
(seat, rule, channel, card) before finishing this round; Dana's real rule was
restored to "Text only. The email on file bounces." / set 12 Oct 2026.

**Fix:** when the typed phone resolves to a standing card whose name differs
from the name just typed, the Add sheet must say so before or as part of the
write — at minimum, name the matched card in the consequence sentence or the
success announcement ("This phone is on file for Dana Kowalski — the rule
and channel you're adding land on her card"), so a studio member can catch a
wrong-number entry, or confirm a genuine shared-line case, before or
immediately after the fact lands somewhere other than the name on screen.

---

## 4. QA‑R5‑2 (MAJOR) — the Call Sheet's "this week" / "later" split does not match SPEC or Leah's task 6 on today's real calendar date, because the seed's engagement windows are literal 2026 dates, not dates relative to `now()`

**Severity: MAJOR (the room's own code is behaving exactly as designed;
the seed data is what makes the live face wrong today). Confidence: high —
traced to source (`rosterBandFor`, `w2a-report.md` §2's own stated rule) and
to the seed file's literal dates, reproduced live at both widths.**

`rosterBandFor` (w2a-report.md §2): "a done stage decides outright, then a
bid stage, then the window — `on_site_from > today` is Later, and everything
else … is this week." That is exactly what shipped. The problem is `today`:
the live app reads the real wall clock (today is **2026‑09‑13**), while
`supabase/seed/people_crm_dev.sql:690-737` writes Okonkwo's crew windows as
**literal** dates chosen to match SPEC's frozen specimen date of 2026‑10‑20
(`Tom Marrow`/`Erin Sato`/`Luis Ochoa`/`Ngozi Eze`/`Carol Nyström`:
`on_site_from = '2026-10-12'`; `Dana Kowalski`/`Joe Wozniak`:
`'2026-10-19'`) — every one of which is **in the future** relative to
2026‑09‑13, so every one of them lands in **Later**, not **This week**.

Live, both widths, `qa-w2-r4/1440-callsheet.txt` / `390-callsheet.txt`:

```
ON THE JOB · THIS WEEK (4 listed): Sam Rowe, Claire Bissett, Ray Thao,
  [a stray test row] — none of whom SPEC §5.4 #6 names for this band
ON THE JOB · LATER (17 listed), leading with: Carol Nyström, Erin Sato,
  Luis Ochoa, Ngozi Eze, Tom Marrow, Dana Kowalski, Joe Wozniak — every one
  of the seven SPEC §5.4 #6 names for THIS WEEK
```

Vitals read **"9 on the job this week · 1 reachable by text · 2 with
accounts · 7 on paper"**, not SPEC/R‑F's canonical **"12 · 5 · 4 · 2."**

Consequence for Leah's task 6 ("The roster narrows to who is on site this
week, leaving out unopened and closed windows"): on today's actual date, the
Call Sheet does not narrow to the studio's real this-week crew — it shows
almost the opposite, with the studio's actual on-site crew relegated to
"Later" and a handful of dateless/unrelated rows (an architect whose
15-month window happens to have no explicit "this week" marker, an
inspector, a stray test artifact) occupying "This week" instead. Nothing in
the ROOM'S code is wrong; the fixture will read correctly again on its own
once the real calendar reaches 12 Oct 2026, and will drift the same way
again after each hardcoded date passes.

This is also why `call-sheet.spec.ts:48` fails on its `[data-held-clause]`
assertion scoped to `this_week`: Dana Kowalski's held-clause paragraph is
rendered correctly, with the correct attribute and correct wording (verified
by a direct DOM query: `[data-roster-band] [data-held-clause]` returns
exactly one match, text "Site access held. Northgate Electric's COI, general
liability lapsed 31 March 2026.", parented under `data-roster-band="later"`)
— it is simply not inside `this_week`, because Dana's whole row isn't.

**Fix:** the local dev seed should mint Okonkwo's engagement windows relative
to `now()` at seed time (e.g. `CURRENT_DATE + interval 'N days'`) rather than
as literal 2026 calendar dates, so the fixture's this-week/later/bidding/done
story stays true regardless of when the seed is applied or reviewed. Absent
that, the SPEC's exact §5.4 vitals string and band composition should not be
asserted against the live local seed outside the narrow window (now through
~12 Oct 2026) during which the literal dates happen to agree with a
wall-clock `today`.

---

## 5. QA‑R4‑3 — STILL OPEN, unchanged: every company card renders a "Contact rule" region direction §5.1 says a firm should never have

**Severity: MAJOR (a live write path with zero effect anywhere, not only a
display gap). Confidence: high — confirmed in source and live on Northgate
Electric's card, this round.**

Not addressed by the round-3 second-pass fix log (`w2-fix-log-r3.md`'s later
section answers only QA‑1/QA‑2 = QA‑R4‑1/QA‑R4‑2, plus four **different**
`CR3-n` code-review majors — QA‑R4‑3 is not named anywhere in it).

`reach-access.tsx:929-951` still renders the "Contact rule" `<h3>`, the
`ContactRuleLine`/`NO_RULE_SENTENCE` fallback, and the "Edit the rule"
disclosure **unconditionally** — with no `isPerson` gate, even though the
same file already computes `isPerson` and gates the mint-consequence
paragraph on it four lines later (`:1022`). Live, Northgate Electric's card
(`qa-w2-r4/1440-company-northgate.txt`): "CREW & DESIGNATIONS" (correct) →
**"CONTACT RULE / No contact rule on file. / EDIT THE RULE"** (should not
exist) → "ACCESS GRANTS" (correct). Direction §5.1: "Company variant: …
Contact rule is replaced by three designations." SPEC §5.3 names six
regions for the company card and no "Contact rule" among them.

The "Edit the rule" control on a company card writes `studio_contact_rules`
keyed on the firm's id, `subject_type: 'company'` — a value no reader in
this build (Directory row, roster row, person card, send gate) ever queries
for; every reader keys rule lookups by person id. The act succeeds silently
and has zero effect anywhere.

**Fix (unchanged from the round-4 recommendation):** gate the whole "Contact
rule" block (heading, line/fallback, edit disclosure) behind `isPerson` in
`reach-access.tsx`, matching the designations-only company variant.

---

## 6. QA‑R5‑3 (MINOR-MAJOR) — `?person=<card id>&role=<field role>` silently fails to open the person card; the bare `?person=` works

**Severity: MINOR-to-MAJOR (no error shown, but the common path is
unaffected — every in-room click produces the bare form). Confidence:
medium-high — reproduced live twice.**

`https://…/people?person=d0e10000-…-0011` (no `role`) opens Dana Kowalski's
person card correctly (`Reach & access` region present). The same id with
`&role=sub` appended — the exact shape `briefing/current-state.md` A1
records for the app's own legacy redirects (e.g. `/portal/vendors/:id` →
`?person=:id&role=maker`) — renders the plain Directory instead, with no
card, no error, no indication anything failed. Every button click observed
inside the room itself writes the bare `?person=<id>` form (confirmed via a
live click-through), so this does not block the primary path — it is a
live-but-silent regression only for a URL carrying the pre-redesign `role`
param, which is exactly the shape of the app's own listed legacy redirects
and any bookmark or shared link minted before this build.

**Fix:** when `?person=` resolves to a card id, open the person card
regardless of a present `role` param (or fall through to the card resolution
when the role-scoped `PartyProfileSheet` lookup finds nothing), rather than
silently landing on the Directory.

---

## 7. QA‑R5‑4 (MINOR, copy only) — Frank Bauer's do-not-contact clause has evolved past SPEC's literal string

**Severity: MINOR. Confidence: high.**

SPEC §5.1 #10 / §5.8 name the clause "Do not contact directly. Write Rosa
Delgado instead." Live, every surface (Directory row, person card, Call
Sheet row) prints "No direct contact, at his request. Write Rosa Delgado;
she forwards what he has to sign." — functionally identical (blocks the
channel, routes to Rosa, prints her email and `tel:`-linked office phone,
carries the terracotta leading rule), consistently worded across all three
surfaces, but a different sentence than the one SPEC's acceptance list
quotes verbatim. Not a functional defect; flagged because the task asks for
every SPEC §5 string "spelled exactly" and this one is not, on any surface.
Recommend: either restore the SPEC wording or amend SPEC to the copy that
shipped (the room's own later-round rulings, e.g. R‑BL, already show this
kind of copy evolving past the original SPEC text elsewhere).

---

## 8. Prior findings — re-checked

| Prior finding | Status this round |
|---|---|
| QA‑R4‑1 (channel-insert failed on a phone the card already held, via un-normalised recovery read) | **Genuinely fixed for a clean/new phone** (verified live). **Superseded by QA‑R5‑1** for the collision case, which is the case the test and Leah's own task 1 actually exercise |
| QA‑R4‑2 (band headings concatenated an unlabelled count into their own accessible name) | **Fixed, confirmed live and by the e2e test progressing past that exact assertion.** `call-sheet.spec.ts:48` now fails four lines later, at `QA‑R5‑2`, an unrelated cause |
| QA‑R4‑3 (company card renders a spurious Contact rule region) | **Still open, unchanged** — not in scope of either round-3 second-pass fix (§5 above) |
| QA‑R3‑1 (Add sheet resolved the wrong studio) | **The org-resolution half remains fixed** (unchanged from round 4's finding); superseded as a user-visible symptom by `QA‑R5‑1` |
| QA‑R3‑2 (authority disclosure not opened first) | Still open, unchanged, test-authoring gap |
| QA‑R3‑3 (tel-link locator not scoped) | Still open, unchanged, test-authoring gap |
| QA‑R3‑4 (Bring-forward travel-list pane not built) | Still open, still expected/tracked — W3, per `w2c-report.md` §4.6 and R‑BM |
| QA‑R3‑5 ("asks for a trade" strict-mode ambiguity) | Still open, unchanged |
| QA‑R3‑6 (`add-client-letter.spec.ts` env gap) | Still open, unchanged, informational, not in scope of this build |
| QA‑R3‑9 (`next start` standalone warning) | Still present, unchanged, minor, non-blocking |
| CR3‑1 (seat sheet identity-less for carded seats) | **Fixed**, re-confirmed live: Dana's and Frank's cards both resolve full identity |
| CR3‑2 (Add sheet's rule write destroyed a standing rule via a bare upsert) | Not independently re-exercised this round in isolation (QA‑R5‑1's repro is a different write path — the auto-link, not a same-card re-edit) |
| CR3‑3 (duplicate-channel insert surfaced a raw Postgres string) | **The crash is fixed** (confirmed: no alert, no raw Postgres string, on either the clean or the collision repro). The underlying identity question CR3‑3/QA‑R4‑1 were chasing turned out to be `QA‑R5‑1`, one layer deeper |
| CR3‑4 (add/edit/hold a channel) | **Fixed**, confirmed present on Dana's card ("ADD A CHANNEL", "HOLD THIS LINE", "PUT THIS LINE BACK IN USE") |
| CR3‑5 (site access card key holder / emergency lines) | **Fixed**, confirmed live: full emergency-line list with "TAKE … OFF THE LIST", key holder picker present |
| CR3‑6 (PR‑l's mint choice silently overridden) | Not independently re-exercised (would require minting) |
| CR3‑7 (leading rule predicate) | Working as ruled: Dana carries no leading rule on her (non-blocking) contact-rule clause; Frank and Ray both carry one |
| CR3‑8 (verdict band erased a standing verdict) | Not independently re-exercised this round |
| CR3‑9 (composers ignore the contact rule) | Not independently re-exercised this round (no "Send a text" attempted against a blocked person) |
| CR3‑10 (two stale e2e specs) | Not independently re-run |
| CR3‑11 (double live-region announcements) | Not independently re-tested |
| CR3‑12..37 (26 named minors) | Not re-verified individually — out of this round's evidence budget, unchanged by design per the fix log |
| Round-3-second-pass CR3‑1..CR3‑4 (Add sheet wording, raw schema tokens on two faces, "Start the card" false-stamping, rail-view leaving the company card on screen) | Not independently re-exercised this round; no regression observed incidentally |

### Console / hydration
No hydration warnings at either width. The same pre-auth transient pair every
prior round saw recurs identically (`TypeError: Failed to fetch` inside a
Supabase `_getUser` call, and the resulting `AppError: Not authenticated`) —
both before the session is established, not reproduced after sign-in, not
People-room-specific. `page-errors-1440.json` / `page-errors-390.json` both
empty (`[]`) — no uncaught page errors at any point in the walk.

---

## 9. Findings summary (severity / confidence)

| # | Finding | Severity | Confidence |
|---|---|---|---|
| QA‑R5‑1 | Add sheet: a phone collision silently attributes the typed rule/channel to the WRONG, pre-existing person, under a success toast naming the typed (different) person | **BLOCKING** | High |
| QA‑R5‑2 | Call Sheet this-week/later banding does not match SPEC/task 6 today, because the seed's engagement dates are literal 2026 calendar dates, not relative to `now()` | **MAJOR** (environmental, not a code defect) | High |
| QA‑R4‑3 | Company card still renders a "Contact rule" region with a live, effect-free write, contrary to direction §5.1 | **MAJOR** | High |
| QA‑R5‑3 | `?person=<id>&role=<field role>` silently fails to open the person card; bare `?person=` works | Minor-to-Major | Medium-High |
| QA‑R5‑4 | Frank Bauer's do-not-contact clause wording has evolved past SPEC's exact quoted string (functionally equivalent) | Minor | High |
| QA‑R3‑2 | Add sheet authority-field e2e assertion doesn't open the disclosure first | Minor (test-only) | High |
| QA‑R3‑3 | Site-access `tel:` locator not scoped to the card in `call-sheet.spec.ts:91` | Minor (test-only) | High |
| QA‑R3‑4 | Bring-forward multi-select travel-list pane not built | Major, expected/tracked (W3) | High |
| QA‑R3‑5 | "asks for a trade" strict-mode locator ambiguity | Minor (test-only) | Medium |
| QA‑R3‑6 | `add-client-letter.spec.ts` flag-override gap under a reused server | Informational, out of scope | High |
| QA‑R3‑9 | `next start` / `output: standalone` benign warning | Minor, non-blocking | High |

---

## 10. Verdict

**Not clean.** One blocking finding (`QA‑R5‑1`, newly root-caused this round
— a real data-integrity defect: the wrong person's contact rule and channel
get overwritten with no disclosure), one major environmental finding that
blocks a faithful read of SPEC's roster acceptance strings against today's
real calendar date (`QA‑R5‑2`), and one already-known major finding that
remains genuinely unfixed (`QA‑R4‑3`). Two real fixes from the prior round
are confirmed and hold under a clean re-test with a negative control each:
`QA‑R4‑1`'s channel-normalisation recovery (for a non-colliding phone) and
`QA‑R4‑2`'s band-heading accessible name. `QA‑R3‑4` (Bring-forward) remains
correctly out of scope for W2. Recommend fixing `QA‑R5‑1` before ship — it
is a data-integrity defect (one person's studio-recorded consent/contact
preference can be silently overwritten by an unrelated add), not merely a
UX rough edge, and it is the same root cause failing Leah's own tasks 1 and
4 in the automated suite. `QA‑R5‑2` is not a code fix so much as a seed-data
and review-window caveat that should be recorded so it isn't re-litigated as
a regression by the next round.
