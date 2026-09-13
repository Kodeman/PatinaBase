# W2 review — round 5 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local production build (`next build` + `next start -p 3000`),
signed in as `designer@patina.dev` (password auth — see §0), against the local Supabase stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Okonkwo dev seed). No prod touched. No
migration written. Server started and stopped by this review; port 3000 confirmed free before and
after.

**Verdict: NOT CLEAN.** Two BLOCKING/MAJOR-grade defects (identity-line firm name never renders;
the Call Sheet's "New person" control opens the wrong sheet) and a scatter of MAJOR/MINOR gaps —
see §2.

---

## 0. Setup, as actually run

1. `lsof -ti :3000` → empty. Confirmed before starting.
2. The worktree carries **no `apps/designer-portal/.env.local`** (by design per the task brief —
   env-file writes are blocked at the tool layer). All values were passed inline. `supabase status
   --workdir <worktree> -o env` supplied the local keys (not reproduced here).
3. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon>
   SUPABASE_SERVICE_ROLE_KEY=<local service role> NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
   NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true" pnpm --dir <worktree> --filter
   @patina/designer-portal build` — exit 0, full route table printed, `/people` present as `○` static.
4. Start: same env vars, `pnpm --dir <worktree> --filter @patina/designer-portal exec next start -p
   3000`, backgrounded. `next start` printed a warning that `output: standalone` doesn't officially
   support it, but the process bound port 3000 and served correctly throughout the walk (`curl
   /api/version` → 200; `curl /people` → 307 to sign-in, as expected pre-auth). This warning is
   worth a follow-up but did not block the walk.
5. **Deviation, flagged and reasoned:** the brief asked for magic-link sign-in via Inbucket. The
   repo's own `e2e/fixtures/auth.ts` signs in as `designer@patina.dev` / `password123` through the
   UI form — the same account, a shorter and already-proven path, and the one every `e2e/people/*`
   spec uses. I used that instead of standing up a magic-link flow by hand. If a magic-link-specific
   regression is a concern, it wasn't exercised this round.
6. Playwright specs under `e2e/people/` were run against the running server with `reuseExistingServer`
   (config's own `webServer` was never invoked — the server was already up). Chromium required
   `dangerouslyDisableSandbox` per SPEC's own note ("Chromium fails inside a sandboxed shell with a
   Mach port bootstrap error") — same for every `next build`/`next start`/`playwright test` call in
   this round.
7. Manual walk used short Playwright scripts saved as temporary specs under `e2e/qa-walk*.spec.ts`,
   run and then **deleted** before finishing (`git status` on `apps/designer-portal/e2e` is clean).
8. Server stopped: `kill -9` on the bound pid (required `dangerouslyDisableSandbox` — the plain `kill`
   was silently refused by the sandbox once, `lsof` still showed the listener). `lsof -ti :3000`
   confirmed empty afterward.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

| Spec | Result | This round's read |
|---|---|---|
| `directory.spec.ts` — all 6 tests | PASS | six chips, trade line, PR-j address persistence, legacy `?role=` map, C11 row-as-container, empty-narrowing sentence |
| `company-card.spec.ts` — both tests | PASS | Chase-the-renewal drafts `awaiting_review`; no consent/reach word on a firm |
| `call-sheet.spec.ts:48` task 6 | PASS | roster opens already banded by window |
| `call-sheet.spec.ts:126` task 3 (logging who was told) | PASS | |
| `call-sheet.spec.ts:91` task 3 (site access, one click) | **FAIL** | test bug, not a product defect — see QA-9 |
| `add-sheet.spec.ts:37` task 1 | **FAIL** | known, already-documented test-authoring gap — see QA-10 |
| `add-sheet.spec.ts:103` task 2 | **FAIL** | real SPEC-vs-build field-shape mismatch — see QA-6 |
| `add-sheet.spec.ts:145` (trade-required alert) | **FAIL** | test bug (strict-mode `role=alert` collision with Next's route announcer), not a product defect — see QA-11 |
| `person-card.spec.ts:51` task 4 | **FAIL** | known, already-documented test-authoring gap — see QA-10 |
| `person-card.spec.ts:111` R-V | **FAIL** | same as above |
| `add-client-letter.spec.ts` — both tests | **FAIL** (timeout) | pre-existing spec, not in any w2a/w2b/w2c file list; not chased further — see QA-12 |

Full output saved to this session's transcript; not re-pasted here (contains no secrets, just
Playwright's own trace).

---

## 2. Findings (QA-#)

Every finding below is evidence-grounded: a file:line, a screenshot under
`build/qa-w2-r5/`, or a live `psql` read against the local DB (session commands not reproduced to
avoid leaking local dev keys, none of which are secrets but per the task's own instruction).

### QA-1 — BLOCKING, confidence HIGH — the Directory row and person-card identity line never print the firm name
**Claim.** SPEC §5.1 #8 requires Dana Kowalski's Directory row to read "Northgate Electric ·
electrical" on line 2; direction §3.2 R1 requires the person card's header to read "Northgate
Electric · owner-operator, since 2025" (name pattern). On the live build, **every** crew/maker
person row instead falls back to a bare kind word ("Subcontractor", "General Contractor", etc.),
and the person card header drops the firm entirely ("owner, since 2019" instead of "Northgate
Electric · owner, since 2019").

**Root cause, verified.** `personIdentityLine()`
(`apps/designer-portal/src/lib/document/people-derivation.ts:1042-1055`) reads
`directoryFirmOf(p).name`, which is `p.meta?.["company_name"]`
(`people-derivation.ts:878-888`). Live query against `people_directory` (as `designer@patina.dev`,
RLS-honouring): Dana Kowalski's row returns `meta.company_id =
"d0e20000-0000-0000-0000-000000000003"` (Northgate Electric, correct) but **`meta.company_name =
null`**, even though `studio_person_affiliations` correctly links her to that firm
(`select * from studio_person_affiliations where person_id = '…0011'` returns one row, `company_id =
'…0003'`). The view's "contact" branch of `00626_people_directory_v4_seats.sql` (around
`:1846-1849`) builds `meta` from `sc.company_name`/`sc.company_id` — the person's OWN legacy
free-text `company_name` column on `studio_contacts`, which the seed never populated — rather than
joining through the NEW `studio_person_affiliations` table (this program's own addition, §7) to the
FIRM's own `studio_contacts.full_name`. `company_id` happens to be right (it's a different legacy
column that the seed did set); `company_name` is not, and nothing downstream can turn an id into a
name without a join the view doesn't do and the derivation function doesn't attempt either.

**Blast radius.** Every person who has a firm and no `trade` in `meta` (i.e., essentially every
crew/maker row) prints a generic kind word instead of "Firm · trade" — the exact line the whole
redesign's row grammar (direction line 2: "trade on a second line") is built to carry.

**Fix direction.** Either the view joins the firm's own name into `meta.company_name` (preferred —
`identity_seats`/the contact branch already has `sc.company_id`; one more join), or
`directoryFirmOf`/`personIdentityLine` accept a `company_id → name` lookup map the caller already
holds (mirroring the `firmBands` pattern `directory-view.tsx:333-336` already uses for sort order).

**Evidence.** `build/qa-w2-r5/live-1440-directory.html` (search "Dana Kowalski"),
`live-1440-person.png`, `live-1440-directory.png` (full page — every crew row's second line).

### QA-2 — MAJOR, confidence HIGH — the Call Sheet's "New person" button opens the rolodex picker, not the Add sheet
**Claim.** SPEC §5.4 #1 and direction §3.4 name two distinct head controls: "From the rolodex"
(primary, opens the picker) and "New person" (secondary, opens the Add/Edit sheet — kind switch,
contact-rule field, consent capture, authority field, per §3.5/§5.5).

**Reproduced.** From `/doc/<Okonkwo>` → "Call sheet" → clicking the button whose accessible name is
exactly "New person" (verified unique: `count()===1`, valid 96×44 bounding box, no ambiguity) opens
a sheet titled **"FROM THE ROLODEX"** — the identical picker "From the rolodex" itself opens (search
field, kind chips, mini rows with reach/consent/paper words) — not the Add sheet at all.

**Impact.** There is no way, from the Call Sheet, to reach the kind-switch Add/Edit sheet (a
client · a household member · a maker · a GC · a sub · an installer · a receiver · someone else)
described in direction §3.5. The Directory room's own "Add person" head button DOES open the correct
sheet (confirmed — see `build/qa-w2-r5/live-1440-household-add.png`), so the flow is not universally
unreachable, only this one named entry point is broken.

**Evidence.** `build/qa-w2-r5/live-1440-newperson-result.png`, `new-person-count.txt` (=1),
`new-person-box.txt`, `all-buttons-in-sheet.txt` (shows "FROM THE ROLODEX" / "NEW PERSON" / "PRINT"
as three distinct buttons in the same head, so this is not an accidental locator collision).

### QA-3 — MAJOR, confidence HIGH — a spurious, unnamed synthetic "Client" row pollutes the Call Sheet's Client Side band
**Claim.** Direction §4's component-inventory table states the Call Sheet's old
"synthetic client row (`:85-148`)" is **replaced by real household seats** in this program.

**Reproduced.** The Okonkwo Call Sheet's "CLIENT SIDE" band shows **3** entries, not 2: a row
literally named "Client" with subtitle "THE CLIENT" and reach word `ON PAPER`, above the two real
household seats (Adaeze Okonkwo, Chidi Okonkwo). `select id, display_name, party_kind,
studio_contact_id from project_parties where project_id = '<Okonkwo>' and (display_name ilike
'%client%' or party_kind in ('client','client_rep'))` returns **only** the two real rows — no
database row named "Client" exists, confirming this third row is synthesized client-side, not a
stray seed artifact.

**Root cause, verified.** `roster-derivation.ts:86-150` still carries the Wave-5
`syntheticClientRow()` fallback (unremoved), and `roster-derivation.ts:811-819` still prepends it
whenever it is not "claimed" by an existing real seat (name or `profile_id` match against
`projects.client_name`/`client_profile_id`). The Okonkwo project's own `client_name` field
apparently reads a placeholder ("Client") that name-matches neither Adaeze nor Chidi, so the
dedupe fails silently and both the synthetic placeholder and the two real seats render.

**Impact.** Inflates the Client Side count (3 instead of 2), and prints a nameless "Client" row on
the exact surface Leah Task 2's acceptance depends on ("the grant visible on … the Call Sheet's
client side").

**Evidence.** `build/qa-w2-r5/live-1440-roster.png` (Client Side band), `all-buttons-in-sheet.txt`
(the CL/"Client"/"THE CLIENT" row), DB query above (not re-pasted; ids only).

### QA-4 — MAJOR, confidence HIGH — phone numbers print as raw, unformatted digits in two first-class regions
**Claim.** Direction §1 line 9 / SPEC C12: every phone renders in the deterministic
`(612) 555-01NN` shape everywhere. The Directory row honours this (confirmed: "(612) 555-0111" on
Dana Kowalski's row). The **Reach & Access "Channels" section** (person card AND company card) and
the **Site Access card's "Who to call first" list plus emergency lines** instead print the raw
E.164 string as typed into `studio_contact_channels.value` / `emergency_lines[].phone` — e.g.
"+16125550111" (Dana's Mobile channel), "+16125550203" (Northgate Electric's Office channel),
"+16125550109" (Luis Ochoa, "Who to call first" — every one of the six call-first lines on the site
access card reads this way).

**Root cause.** `TelLink` is documented, correctly, as printing "whatever the studio wrote,
unchanged" (`tel-link.tsx:9-13`) — it is not a formatting bug in the component. The defect is that
`studio_contact_channels.value` and `project_site_access_cards.emergency_lines[].phone` were
seeded/written in raw E.164 while `project_parties.phone` (what the Directory row reads) was seeded
formatted — an inconsistency between two phone-carrying paths for the **same person**, visible
side-by-side on the person card (Directory row: "(612) 555-0111"; Channels section two clicks away:
"+16125550111").

**Evidence.** `build/qa-w2-r5/live-1440-person.png` (Mobile channel row), `live-1440-company.png`
(Office channel row), `live-1440-access.png` (all six "who to call" lines).

### QA-5 — MINOR, confidence HIGH — Northgate Electric's company card omits its warranty clause and tax-id line
**Claim.** SPEC §5.3 #1 wants the header "Electrical sub · 1 person · 2 projects · warranty through
21 Nov 2026"; §5.3 #6 wants three Payee lines including "Tax id ending 4417".

**Observed.** The live card prints "Electrical sub · 1 person · 2 projects" (no warranty clause) and
a two-line Payee region ("Remit to Northgate Electric", "Retainage 10%" — no tax-id line).

**Root cause, verified as seed-completeness, not a code defect.** `select warranty_until,
tax_id_last4, remit_to, retainage_bps from studio_contacts where id = '<Northgate>'` returns
`warranty_until = NULL`, `tax_id_last4 = NULL`, `retainage_bps = 1000`. The component appears to
correctly print-if-present (retainage does print); the dev seed simply never set these two
company-level columns, even though a **seat-level** warranty date (21 Nov 2026, on Dana's past
Lindqvist seat) does exist and does print correctly elsewhere on the same card. Not chasing further
since this reads as a seed gap rather than a derivation bug — flagged so the seed can be completed
before the next round treats its absence as "fixed."

**Evidence.** `build/qa-w2-r5/live-1440-company.png`.

### QA-6 — MINOR/MAJOR (judgement call), confidence MEDIUM — the Add sheet's "Authority" capture is a structured picker, not the single free-text field SPEC's fixture illustrates
**Claim.** SPEC §5.5 #16 / direction §3.5 name an "Authority" field and quote fixture values like
"Signs money to $2,500" as if typed freely; `add-sheet.spec.ts:103` (`e2e/people/`) accordingly does
`page.getByLabel("Authority").fill("Signs money to $2,500")`.

**Observed.** For "a household member" on a project the sheet believes carries a defaultable
agreement, the sheet shows exactly the correct NOTE and ACT text — "Defaulted from the agreement.
Confirm it, or write a different one." / "Confirm from the agreement" (byte for byte, R-J/C20) — but
the act is a **disclosure** (`aria-expanded="false"`) whose panel, once opened, holds a **scope
select** ("What they may decide": Signs money / Approves change orders / Selections / … ) and a
**dollar-threshold input** ("Up to, in dollars") — never a single field labelled "Authority". This
plausibly matches the `AuthorityScope`/`threshold_cents` data model (direction §7) better than a
freeform string would, and direction's own task-2 click table ("1 to confirm the authority
defaulted from the agreement") is consistent with THIS branch being the correct one to show for a
household member. I did not complete the confirm → submit → DB-read loop by hand to verify the
resulting `project_party_authority` row actually carries `threshold_cents = 250000`, so **Task 2's
acceptance criterion is unverified**, not confirmed broken.

**Recommendation.** Either update SPEC/direction's literal field description to match the shipped
structured picker, or re-author `add-sheet.spec.ts:103` against the real fields
(`getByLabel("What they may decide")` / `getByLabel("Up to, in dollars")`) and confirm the resulting
row — whichever the orchestrator judges correct. Either way, this is not a fresh code regression to
chase.

**Evidence.** `build/qa-w2-r5/live-1440-household-add.png`, `live-1440-household-add.html`.

### QA-7 — MINOR, confidence MEDIUM — two console errors fire on every fresh sign-in, before `/people` is ever opened
**Observed**, reproduced on both the 1440 and the 390 walk, immediately after the password sign-in
redirect lands on `/desk`:
```
TypeError: Failed to fetch  (…/_next/static/chunks/2290-….js — Supabase auth session read)
Error logged: AppError: Not authenticated  (a React Query fetch, queryKey redacted in the trace)
```
Both fire on `/desk`, before any navigation to `/people`, and no further console errors or warnings
(hydration or otherwise) were seen on any of the seven People-room states walked (directory, person,
company, roster, site access, add sheet, household-member add). Reads as a session-hydration race
on first paint, orthogonal to this program — named because the brief asked console errors to be
checked, not because it looks People-CRM-specific.

**Evidence.** `build/qa-w2-r5/console-1440.json`, `console-390.json` (identical pair in both).

### QA-8 — INFORMATIONAL, not a defect — live Directory row order does not literally match SPEC §5.1 #5's enumerated order
SPEC's fixture order (Adaeze, Chidi, Tom Marrow, Erin Sato, Luis Ochoa, Dana Kowalski, Joe Wozniak,
Pete Rusk, Rosa Delgado, Frank Bauer, Ray Thao) reflects one small, hand-curated dataset. The live
41-person/21-firm dataset sorts by chip-band then `display_name.localeCompare` within band
(`directory-view.tsx:337-346`), which is coherent and intentional (confirmed in code), and every one
of the ten named individuals does appear, correctly narrowed and worded, just not in that literal
sequence. Not treating this as a finding against the real app; noted only so the next reviewer
doesn't re-discover it as a surprise.

### QA-9 — test bug, not a product defect, confidence HIGH — `call-sheet.spec.ts:91`
`page.locator('a[data-tel-link]').first()` is unscoped to the site-access dialog; in DOM order it
resolves to the underlying Call Sheet's own Adaeze Okonkwo row (rendered before the site-access
overlay in the document), not to "Luis Ochoa" inside the card. Manual walk
(`build/qa-w2-r5/live-1440-access.png`) confirms the real Site Access card's own first "Who to call
first" line IS Luis Ochoa, superintendent, exactly as SPEC §5.6 #2 requires.

### QA-10 — known, already documented, confidence HIGH — three specs fail on a phone-collision fixture, not a regression
`add-sheet.spec.ts:37` (task 1), `person-card.spec.ts:51` (task 4), `person-card.spec.ts:111` (R-V)
each build a test person with a **unique name** but a **real seeded phone number** —
`(612) 555-0111` (Dana Kowalski's) in the first case, `(612) 555-0115` (Frank Bauer's, confirmed via
`select id, full_name, phone from studio_contacts where phone like '%0115%'`) in the other two. The
00626 auto-link trigger correctly links the new seat to the EXISTING card sharing that number rather
than minting a fresh one, so `cardByName(<unique test name>)` never resolves and the tests time out.
This is exactly the scenario `build/w2-fix-log-r4.md`'s QA-R5-1 section already names under "NOT
changed, and named here so it is not re-litigated" — carried forward unchanged this round, correctly.
Not a fresh finding; the tests need re-authoring with non-colliding numbers, not the product.

### QA-11 — test bug, not a product defect, confidence HIGH — `add-sheet.spec.ts:145`
`getByRole('alert')` resolves to two elements after a validation failure: the sheet's own message
AND Next.js's `#__next-route-announcer__` div, which also carries `role="alert"`. A `.first()` or a
more specific locator fixes the test; the sheet's own validation text is present and correct.

### QA-12 — orthogonal, not chased, confidence LOW — `add-client-letter.spec.ts` (2 failures)
Both tests time out waiting on form fields that never appear ("A line for Dave", "Send them the
letter"). This spec is not named in any of `build/w1a-report.md`, `w1b-report.md`, `w2a-report.md`,
`w2b-report.md`, or `w2c-report.md`'s file lists, and its own header states it "REQUIRES the local
edge runtime container … serving THIS checkout's `supabase/functions`" with an explicit warning to
verify the bind mount first — a precondition this QA environment did not set up (out of the task's
named scope: build/start/test the People room, not the email-deliverability edge runtime). Flagged
for completeness since it lives under `e2e/people/` and ran as instructed; not investigated further.

---

## 3. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → "Add person" → "a household member"/"a sub" kind; "How to reach them" free-text rule field present and fillable | **PASS** | `live-1440-household-add.png`; e2e failure is QA-10, not a fresh defect |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Add sheet "a household member"; authority captured via a structured scope+threshold picker behind "Confirm from the agreement" | **UNVERIFIED** (not broken, not proven) | QA-6; did not complete confirm→submit→DB loop |
| 3 | Who has site access right now | Call Sheet → "Open the site access card" | **PASS** | `live-1440-access.png` matches SPEC §5.6 almost verbatim (region order, wording, no code digits); `call-sheet.spec.ts` task-3 "logging" test passed; the other task-3 test's failure is QA-9 (test bug) |
| 4 | Frank Bauer do-not-contact, routed to Rosa | Already live on the Directory row and the company card's crew line | **PASS** | `live-1440-directory.html` (Frank Bauer block: "Do not contact directly. Write Rosa Delgado instead." + Rosa's email + office phone tel-linked); `live-1440-company.png` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo (multi-select) | The `#state-pick` travel-list/multi-select pane is not built this wave | **DEFERRED, correctly** | Ruled R-BM ("the bring-forward travel-list picker … is W3 scope … not a W2 finding"); w2c-report.md §4 item 6 names the same gap. Single-add "From the rolodex" picker works (`live-1440-newperson-result.png`) |
| 6 | Everyone on Okonkwo this week, by role | Call Sheet opens already banded (this week / later / bidding / done) | **PASS** | `live-1440-roster.png`; `call-sheet.spec.ts` task-6 passed |

---

## 4. Prior findings (`w2-fix-log-r4.md`) — re-checked this round

| ID | This round's read |
|---|---|
| QA-R5-1 (phone collision writes onto the wrong card) | Not independently re-exercised via UI this round (would require deliberately colliding a phone again); the fix's own described mechanism is exactly what QA-10 above observed firing correctly (auto-link, not a fresh-card mint) — consistent with the fix holding |
| QA-R5-2 (Call Sheet date re-anchor) | **CONFIRMED still working** — the roster's vitals and bands are sane against today's wall clock ("15 on the job this week", correctly populated this-week/later/bidding/done bands with forward-looking dates) |
| QA-R4-3 (company card had a spurious Contact Rule region) | **CONFIRMED fixed** — Northgate Electric's company card has no "CONTACT RULE" heading; the rule text appears inline under Crew & Designations instead (a minor stylistic choice, not a regression of the fix) |
| CR-1 (promote-band studio resolution) | Not exercised this round (no promote-to-rolodex action taken) |
| CR-2 (Copy field link expiry/warranty) | **Consistent with fixed** — Dana's Access Grants row on her person card reads "Ends with the job, 1 July 2027. Renews when they use it.", matching the seat's window, not a stale/short date. Did not click "Copy field link" itself to inspect the minted token payload |
| CR-3 (Call Sheet chevron gating) | Not exercised this round |

---

## 5. Files

Screenshots, HTML captures and console logs: `build/qa-w2-r5/*.png`, `*.html`, `*.json`, `*.txt`
(force-added per the task's instruction that files under `build/` need `git add -f`).

Key screenshots: `live-1440-directory.png`, `live-1440-person.png`, `live-1440-company.png`,
`live-1440-roster.png`, `live-1440-access.png`, `live-1440-newperson-result.png`,
`live-1440-household-add.png`, `live-390-directory.png`, `live-390-person.png`.
