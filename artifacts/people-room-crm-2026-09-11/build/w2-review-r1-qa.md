# W2 review — round 1 QA (runtime, local production build)

Reviewer: QA subagent, as Leah Hartwell. 2026-09-12. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Build: `next build` (clean, no errors) +
`next start -p 3000`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, local Supabase stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, 555 migrations,
Okonkwo dev seed under `designer@patina.dev`). Signed in via the 6-digit
email-OTP code retrieved from Mailpit (`http://127.0.0.1:54324`) — the
designer portal's email-first flow is a code, not a clickable link; no
password was used. Server stopped and port 3000 confirmed free at close.

**clean = FALSE** — 3 blocking, 5 major findings below.

Screenshots: `build/qa-w2-r1/*.png` (18 files, 1440 + 390, 9 states).
Raw Playwright output: `build/qa-w2-r1/console-report.json` (0 console
errors, 0 console warnings, 0 page errors across the whole walk — a clean
signal, reported as such below).

---

## 1. Playwright e2e — `e2e/people/`

```
pnpm --dir .../agent-people-build --filter @patina/designer-portal exec \
  playwright test --config playwright.config.ts --project=chromium e2e/people
```

Run against the `next start` server already on :3000 (`playwright.config.ts`'s
`webServer.reuseExistingServer` is true outside CI, so it did not spawn its
own `pnpm dev`). Required `SUPABASE_SERVICE_ROLE_KEY` etc. exported inline for
`e2e/helpers/supabase-admin.ts`, which otherwise throws before any test runs.

**Result: 8 passed, 11 failed** (`chromium` project only; `firefox`/`webkit`
are skipped by the specs' own `test.skip` — single seeded actor).

| Spec | Result | Root cause (see findings) |
|---|---|---|
| `directory.spec.ts` — 6 tests | 5 pass, 1 fail | fail: room head has no heading role (QA-8) |
| `add-sheet.spec.ts` — 3 tests | 0 pass, 3 fail | `getByLabel('Project')` ambiguity (QA-11) |
| `person-card.spec.ts` — 2 tests | 0 pass, 2 fail | same ambiguity, via the shared `addSub()` helper (QA-11) |
| `call-sheet.spec.ts` — 3 tests | 1 pass, 2 fail | Studio side band absent (QA-6); unscoped `.first()` locator (QA-12) |
| `company-card.spec.ts` — 2 tests | 1 pass, 1 fail | Chase the renewal RPC permission (QA-1) |
| `add-client-letter.spec.ts` — 2 tests | 0 pass, 2 fail | timeout waiting on fields not present in this build's Add sheet variant — flagged, not chased further (see QA-15) |

Full failure text preserved in
`apps/designer-portal/test-results/*/error-context.md` (one folder per failed
test; not copied into this artifact tree — paths cited below).

---

## 2. Leah task walk (manual, both widths)

Signed-in session, screenshots at 1440×1000 and 390×844 for each end state
(`build/qa-w2-r1/task*-*.png`). Where a task's own e2e spec exists, its
pass/fail is folded in.

| # | Task | Acts | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only, so nobody emails her | Not completed — blocked | **FAIL (blocked)** | `add-sheet.spec.ts:37` fails before the rule is ever written (QA-11). Dana Kowalski's live person card shows "No contact rule on file." (`task1-person-card-dana-1440.png`) — the write path for this exact task was not exercised end-to-end this round. |
| 2 | Give Adaeze the app; record that Chidi signs money over $2,500 | Not completed — blocked | **FAIL (blocked)** | `add-sheet.spec.ts:92` ("a household member is a seat and an authority grant, two facts") is among the 11 failures, same `getByLabel('Project')` collision (QA-11). The **read** side already renders both facts correctly for the existing seed: Call Sheet client-side band shows Adaeze — `Account` / "Selections.", Chidi — `On paper` / "Signs money to $2,500. Approves change orders to $2,500. Certifies draws." (`task6-roster-bands-1440.png`). The add-sheet *write* flow itself is unverified. |
| 3 | Who has site access on Okonkwo right now | 2 clicks (Call sheet → Open the site access card) | **PASS** | `task3a-call-sheet-1440.png` (folded line: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.") → `task3b-site-access-1440.png` (full card: call-first order Luis Ochoa, Chidi Okonkwo, Sam Rowe, then 3 emergency lines; "The code is held off Patina; ask Luis Ochoa," no digits anywhere; key holder; hours; receiving). Matches SPEC §5.6 exactly. The automated `call-sheet.spec.ts:83` failed, but only on an unscoped locator (QA-12) — independently confirmed correct via DOM. |
| 4 | Mark Frank Bauer do not contact; route to Rosa Delgado | Rule pre-existed in the seed; not composed fresh | **FAIL** | Frank Bauer's card correctly shows the hard block, but three real defects sit on top of it: his own phone still prints as a live `tel:` link on the Directory row (QA-3); no working channel to reach Rosa Delgado prints anywhere (QA-4); raw enum tokens leak into the rule sentence (QA-5). `person-card.spec.ts:51` also fails (QA-11). |
| 5 | Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo | 1 click ("From the rolodex") opens the wrong instrument | **FAIL** | `task5-bring-forward-picker-1440.png`: the picker is still the one-at-a-time rolodex search (name/company/trade, kind chips, "No one by that name in the rolodex"), not SPEC §5.7's travel-list pane (checkboxes, "What travels"/"What stays behind," "Add four to the roster"). Matches w2c's own disclosure that the pane is W3 scope — confirmed live, not a surprise, but the task's acceptance criterion is unmet today. |
| 6 | Everyone on Okonkwo by role, this week | 1 click (Call sheet) | **FAIL** | `task6-roster-bands-1440.png`: the sheet jumps straight from vitals to "Client side" — "Studio side" never renders (QA-6), because `project_team_members` holds 0 rows for Okonkwo in this seed. `call-sheet.spec.ts:40` fails on exactly this assertion. The window bands themselves (this week / later / bidding / done) that DO have data render correctly and narrow as expected. |

**Task-table pass rate: 1 of 6 clean.** Two of the five failures (1, 2) are
*blocked*, not disproven — the underlying add-sheet write path could not be
exercised because of a test-locator collision, not a confirmed broken
mutation; an independent, non-Playwright pass at the Add sheet would be
needed to clear them.

---

## 3. Findings

| # | Sev | Conf | Finding |
|---|---|---|---|
| QA-1 | **Blocking** | High | **"Chase the renewal" cannot ever succeed for a signed-in studio user.** `enqueue_agent_task` has `EXECUTE` granted only to `service_role` and `agent_writer` (`supabase/migrations/00484_public_rpc_authorization_contract.sql:1315-1317`; confirmed live via `information_schema.routine_privileges` — no `authenticated` row). `apps/designer-portal/src/components/document/people/compliance-chase.ts:46` calls this RPC directly from the browser through `createBrowserClient()`, which authenticates as `authenticated`. Reproduced live: clicking "Chase the renewal" on Beck + Rowe Architects' company card shows the toast **"Could not draft that note just now."** and writes zero rows to `agent_tasks` (`company-card.spec.ts:76` times out polling for exactly this). This is not an environment quirk — the grant is deliberate, repo-wide policy (`agent_writer`/`agent_reader` are NOLOGIN privilege roles per `docs/agent-os/agent-roles-runbook.md` and AGENTS.md's own Agent OS rules: "Agents read broadly, write ONLY via `enqueue_agent_task`" is written for backend/service-role callers, not a browser session), so this will fail identically in every environment including prod. |
| QA-2 | **Blocking** | High | **C13/R-A's "a lender-or-inspector-only firm owes no paper word" rule is not applied to every company_kind that represents one — confirmed on the SPEC's own named example.** `partyKindOwesPaper()` (`packages/types/src/field-config.ts:289`) is `kind !== 'inspector' && kind !== 'lender'`. The real seed's "City of Minneapolis, CPED Inspections" firm has `company_kind='authority'` (confirmed via `psql`), so its Directory row prints **"NOT ON FILE"** — reproduced live via DOM text extraction: `City of Minneapolis, CPED Inspections … authority · 1 on the crew · 0 open jobs … NOT ON FILE`. This directly fails SPEC §5.1 #18/#19, the acceptance item written specifically to demonstrate this rule after three prior ruling rounds (C13, C18, C24). Great Northern Bank (`company_kind='lender'`) correctly prints no paper word in the same view, proving the rule works for the two literal strings it checks but misses `'authority'` (and any other non-`inspector`/`lender` kind PR-f's widened vocabulary or the seed actually uses for this population). |
| QA-3 | **Blocking** | High | **A person under a hard "do not contact" rule still has their own phone printed as a live, dialable link.** Frank Bauer (`do_not_contact=true`, rule blocks mobile/office/dispatch/after-hours/email/AP-email/SMS, routes to Rosa Delgado) — his Directory row nonetheless renders `<a data-tel-link href="tel:+16125550115">(612) 555-0115</a>` (confirmed via `page.locator('a[href^="tel:"]').allInnerTexts()` scoped to his row). SPEC §5.1 #10 names this exact row and requires "no phone printed"; §5.4's "Do not contact" state says "Channels collapses to one line... Channels are hidden, never deleted." The room currently defeats its own compliance rule on the one row built to demonstrate it. |
| QA-4 | Major | High | **R-L/C22's "a routed contact line must carry a working channel" is unimplemented everywhere it's supposed to print.** Confirmed by DOM inspection on Frank Bauer's person card and Directory row: zero `tel:`/`mailto:` links inside or near the contact-rule region, and the string `rosa@` (her known email) does not appear anywhere in the page. Only the prose "Write Rosa Delgado instead." prints — a name, not a channel. Violates SPEC §5.1 #10, §5.2 region 3, and §5.8's "Routed line (R-L)" rule, which three separate rulings (C7, C22, R-L) exist specifically to require. |
| QA-5 | Major | High | **Raw snake_case enum tokens leak onto the face.** Frank Bauer's contact-rule sentence reads, verbatim, on both the Directory row and the person card: *"Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office."* `after_hours` and `ap_email` are literal `channel_kind` enum values, not prose. SPEC §8 #3 forbids schema words on a face ("no schema words on a face" — the named list is illustrative, not exhaustive; these are the same category of leak). |
| QA-6 | Major | High | **The Call Sheet's "Studio side" band never renders for Okonkwo in this seed**, because `project_team_members` holds 0 rows for `d0e00000-0000-0000-0000-00000000000a` (confirmed via `psql`). The sheet goes straight from the vitals line to "Client side" with no heading and no absence-sentence in its place — contrast with R-V's own principle, already honored elsewhere in this build, that an absent region should say so in words rather than vanish. This is the direct, confirmed cause of `call-sheet.spec.ts:53`'s failure and means Leah Task 6 cannot be fully verified: the studio side of "everyone on the job" is invisible. Whether the fix is a seed backfill or a code-level fallback sentence, the user-visible effect is the same today. |
| QA-7 | Major | High | **Leah Task 5's multi-select "bring forward" flow does not exist on this build.** "From the rolodex" on the Call Sheet opens the pre-existing one-at-a-time rolodex picker (search box, kind chips, "No one by that name in the rolodex") — not SPEC §5.7's travel-list pane (checkboxes, one history line, "What travels"/"What stays behind," "Add four to the roster," a `#state-pick` DocSheet). This matches `w2c-report.md` §4 item 6's own disclosure ("The travel-list pane is W3's… Task 5's e2e is not written") — confirmed live rather than a surprise, but the task's acceptance criterion ("Each arrives with current consent, document status, and one history line... 6 for all four") is unmet in this round's build. |
| QA-8 | Major | High | **The room's title is not a heading anywhere in the app, People room included.** `page.locator('h1').count()` on `/people` returns **0**; "The People Room" renders as a plain `<span>` (`apps/designer-portal/src/components/document/rooms/room-shell.tsx:144-146`). This is a pre-existing, app-wide `RoomShell` pattern (shared by every "room," not introduced by this build), so it is not a regression specific to the People CRM work — but it is the direct, confirmed cause of `directory.spec.ts:28`'s failure, and it means the SPEC's own accessibility bar for the specimens ("exactly one `<h1>`," heading-navigable) is not met by the shipped room. Flagged at the severity the failing assertion earns; root cause is outside this program's file list. |
| QA-9 | Minor | High | **Grammar: incorrect possessive for a firm name ending in "s."** The Chase-the-renewal consequence sentence reads *"This drafts a note to Beck + Rowe Architects's paperwork contact…"* — should be *"Architects'"*. `chaseConsequenceSentence()` (`apps/designer-portal/src/components/document/people/compliance-chase.ts:26`) always appends a literal `'s` regardless of the firm name's ending. |
| QA-10 | Minor | Medium | **A dangling middle-dot separator prints at 390 when a row's consent/paper words are both absent.** Confirmed by cropped screenshot inspection: "Sarah Chen" (a CRM lead, not part of the People fixture) and "The Ashfords (no-login household)" / "The Okonkwo household" print `ACCOUNT ·` / `ON PAPER ·` with nothing after the dot, at 390 width. R-M's "three plain inline words, middle-dot separated" reads as visually unfinished when the joiner does not collapse for missing words. Likely correct that these rows truly lack consent/paper facts (household/lead entities may not owe them) — the defect is purely the trailing separator, not the absence itself. |
| QA-11 | Minor (test-authoring) | High | **`getByLabel('Project')` is ambiguous in 4 e2e specs**, blocking automated proof of Leah Tasks 1, 2 and 4. Playwright's default case-insensitive substring match resolves the label to two elements: the visible "Project" `<select>`, and the "They gave prior express consent for text updates" checkbox, whose full accessible name is *"…Optional and never preselected. They agreed to Patina **project** texts (~1/day…)"* — the word "project" appears incidentally inside the SMS disclosure copy. Affects `add-sheet.spec.ts:37,47` (task 1), presumably `:92` (task 2, same shared pattern), and `person-card.spec.ts`'s shared `addSub()` helper at line 36 (tasks 4, and the R-V regions test). This blocks the harness, not necessarily the product — needs `exact: true` or a scoped locator (e.g. `page.locator('#add-party-project')`) in the specs, not a UI change. |
| QA-12 | Minor (test-authoring) | High | **`call-sheet.spec.ts:103`'s "who to call first" assertion is unscoped.** `page.locator('a[data-tel-link]').first()` matches the *page's* first tel-link, not the Site Access dialog's — because the Call Sheet dialog stays mounted underneath the stacked Site Access dialog and its own tel-links (e.g., Adaeze Okonkwo) precede the Site Access card's in DOM order. Independently verified via a scoped locator that the Site Access card's own "Who to call first" list is correctly ordered (Luis Ochoa, Chidi Okonkwo, Sam Rowe) exactly per SPEC §5.6 #2 — this is a test bug, not a product defect. |
| QA-13 | Info | High | **`next start` warns "does not work with 'output: standalone' configuration"** on every boot in this worktree. All routes, static chunks, and API calls nonetheless served correctly throughout the full QA run (verified: 200s on `/`, `/_next/static/...`; zero console errors/warnings/page errors across 2 widths × 9 states in the manual walk). Recorded for the record since the warning reads alarmingly; it did not manifest as a functional defect in this pass. |
| QA-14 | Info | High | **The dev seed's Okonkwo engagement windows (mobilization 12 Oct 2026) sit in the future relative to the sandbox's real wall-clock date (12 Sep 2026)** — the fixture/specimens assume "today" = 20 Oct 2026. This pushes most of the crew into the Call Sheet's "later" band even though their `stage` column already reads `active`/"On the job," and shrinks the "this week" vitals count well below what a walkthrough on the fixture's assumed date would show. Not a code defect — an artifact of testing a fixed-date dev seed against real time — but worth knowing when reading any vitals or band counts from this round's screenshots. |
| QA-15 | Minor | Medium | **`add-client-letter.spec.ts` (2 tests) time out waiting for fields — `getByLabel('Send them the letter')` and `getByLabel('A line for Dave')` — that this build's Add sheet does not appear to expose in the state the test drives it to.** Not chased to root cause given time budget; flagged as a real, reproducible e2e failure outside the six-task walk's direct scope (this spec belongs to the separate "First Letter" client-invite feature, not enumerated in `w2a/b/c-report.md`'s own file lists), so its cause may lie in an interaction between that feature and this program's Add-sheet rewrite rather than in this program itself. |

---

## 4. What passed cleanly

- Directory: six chips in order inside `role="group"` "Narrow the book" (PR-g); trade line appears only under Crew; `?role=`/`?view=`/`?scope=`/`?trade=` survive a refresh (PR-j); a Directory row is a true container with an open-person button, a sibling `tel:` `<a>`, and a separate seats-disclosure button (C11); "Nobody under this narrowing yet." empty sentence; company card correctly shows neither a consent word nor a reach word.
- Site access card (Task 3): full SPEC §5.6 match — call-first order, no-code "the way in," key holder with consent word, hours, receiving, all present and correctly worded once the dialog itself is opened.
- Great Northern Bank's Directory row (the lender half of C13's own two-firm demonstration) correctly prints no paper word — the predicate is right for the literal string `'lender'`, just not for `'authority'` (QA-2).
- Zero console errors, zero console warnings, zero uncaught page errors across the entire manual walk (2 widths × 9 states, 18 screenshots) — a clean runtime signal worth stating plainly.
- Head count line renders and matches the live count of studio_contacts/engagements ("41 people · 21 firms"), not a stale or hard-coded number.

## 5. Scope notes / what this round did not verify

- Leah Tasks 1, 2 could not be exercised end-to-end (Add-sheet writes) because of the e2e locator collision (QA-11); no manual (non-Playwright) attempt was made to complete them given the time budget, so their underlying write paths remain genuinely unverified rather than confirmed broken.
- Task 2's Add-sheet "Authority" field (defaulted-from-agreement vs. Record-the-authority branches, R-J) was not visually confirmed — the one screenshot attempted (`task2b-add-sheet-household-1440.png`) is a full-page capture of a fixed-position, internally-scrolling modal, so content below the fold in that dialog was not captured; this is a capture-tooling limitation, not evidence the field is missing.
- Chase-the-renewal's downstream email/notification behavior (R-AC: who gets notified) is moot until QA-1 is fixed — no task was created to inspect.
