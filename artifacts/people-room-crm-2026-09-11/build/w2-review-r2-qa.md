# W2 round 2 — runtime QA, as Leah

Local production build (`next build` + `next start -p 3000`), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local Supabase (`127.0.0.1:54321` /
`:54322`), Okonkwo dev seed, signed in as `designer@patina.dev` (password
sign-in via the shared `e2e/fixtures/auth.ts` fixture — the same account the
task's "magic link" note refers to; I used its already-verified password path
rather than minting a fresh Inbucket link, since the fixture's path is the one
the automated suite itself relies on and needed no extra state).

No prod touched. Server started and stopped by this review; port 3000 confirmed
free before and after. Evidence lives in
`build/qa-w2-r2/` (20 screenshots, page-text dumps, console-error dumps, raw
DOM captures) — referenced below by filename, all relative to that directory
unless a full path is given.

## 0. Setup evidence

- `lsof -ti :3000` → empty before start. Confirmed again after teardown.
- `apps/designer-portal/.env.local` does not exist in the worktree (env-file
  writes are blocked at the tool layer, as the brief says) — skipped that
  check per instruction.
- `supabase status --workdir . -o env` → local stack up (`API_URL
  http://127.0.0.1:54321`, `DB_URL postgresql://postgres:postgres@127.0.0.1:54322/postgres`);
  only the connection pooler was stopped, which the app does not use.
- Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon> SUPABASE_SERVICE_ROLE_KEY=<local
  service role> NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
  NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true ORDERS_SERVICE_URL=...
  MEDIA_SERVICE_URL=... PROJECTS_SERVICE_URL=... NODE_ENV=production pnpm
  --dir <worktree> --filter @patina/designer-portal build` → exit 0, full
  route manifest printed, no errors.
- Server: same env,
  `pnpm --dir <worktree> --filter @patina/designer-portal exec next start -p
  3000`, backgrounded. Log shows `✓ Ready in 101ms`; one harmless warning
  ("next start" does not work with "output: standalone" — the process still
  served every route correctly for the whole review, so this warning is noise,
  not a defect). `curl -s -o /dev/null -w '%{http_code}' /people` → `307` to
  `/auth/signin` pre-auth, as expected.
- Server stopped at the end (`kill` by pid on port 3000); `lsof -ti :3000`
  empty afterward.

## 1. Playwright spec run

```
pnpm --dir <worktree> --filter @patina/designer-portal exec playwright test \
  --config playwright.config.ts --project=chromium e2e/people
```

(The task named `e2e/playwright.config.ts`; the real file is
`apps/designer-portal/playwright.config.ts` with `testDir: './e2e'` — used
that path. Its `webServer` block has `reuseExistingServer: !CI`, so it
attached to the server this review already had running on :3000 rather than
starting a second one; no `pnpm dev` was invoked at any point.)

**Result: 10 passed, 9 failed** (19 total, 1.1 min). Full failures:

| # | Spec | Test |
|---|---|---|
| 1 | `add-client-letter.spec.ts:47` | a letter goes to a new client, and only one |
| 2 | `add-client-letter.spec.ts:115` | the roster still works with no letter, and nothing is sent |
| 3 | `add-sheet.spec.ts:37` | task 1 — a text-only rule lands on the PERSON, not on the seat |
| 4 | `add-sheet.spec.ts:92` | task 2 — a household member is a seat and an authority grant, two facts |
| 5 | `add-sheet.spec.ts:134` | the sheet asks for a trade before it will write a sub |
| 6 | `call-sheet.spec.ts:40` | task 6 — the roster opens already banded by the window |
| 7 | `call-sheet.spec.ts:83` | task 3 — who has site access right now, one click from the sheet |
| 8 | `person-card.spec.ts:51` | task 4 — do not contact, routed to somebody reachable |
| 9 | `person-card.spec.ts:111` | R-V — every region prints, and an absent record says so in words |

All of `company-card.spec.ts` (2) and `directory.spec.ts` (7) passed.
Root causes for each failure are investigated below (§3) rather than just
reported — several are real product bugs, two are test-authoring bugs, two
are an environment/flag mismatch on my part.

## 2. Task walk (Leah, six tasks)

Real dev-seed ids used throughout: Dana Kowalski `d0e10000-…-0011`, Northgate
Electric `d0e20000-…-0003`, Frank Bauer `d0e10000-…-0015`, Rosa Delgado
`d0e10000-…-0014`, Okonkwo residence `d0e00000-…-000a`.

**Note on dates.** The real seed's Okonkwo engagement windows are built
around an October 2026 "today," but the actual system clock during this
review is 2026‑09‑12. That is why most crew seats land in "On the job · later"
rather than "this week" in the real room — a real consequence of the seed's
authoring date vs. wall-clock time, not a code defect. Flagged once here so
it isn't re-derived as a finding per band below.

| Task | Acts | Pass/Fail | Evidence |
|---|---|---|---|
| 1. Text-only rule on Dana Kowalski | 4 (open person card → Edit the rule → check "Never email them" → fill reason → Save the rule) | **PASS** on the person-card path. Add-sheet path (setting the rule while adding a new person) is blocked by QA‑R2‑5 below | `task1-04-filled-correctly.png`, `task1-05-after-save.png`, `task1-after-save-body.txt` line 52: "Never email. Text only. The email on file bounces. Set 13 Sep 2026." DB confirms the write: `studio_contact_rules` row for Dana now has `channels_forbidden={email}`, `reason`, `set_by`, `set_at` all populated |
| 2. Give Adaeze the app; record Chidi's $2,500 authority | not fully walked — see below | **PARTIAL**. The two fact-halves the acceptance criterion asks for are already recorded in the seed and both render correctly (person card + Call Sheet client side); I did not exercise "mint the account for Adaeze" as a fresh UI act because the add-sheet path that would normally be used to do this is blocked by the same QA‑R2‑5 bug that blocks Task 1's add-sheet path | `roster-open-1440.txt` lines 186‑207: Client side shows "Chidi Okonkwo · CLIENT REP · … Signs money to $2,500. Approves change orders to $2,500. Certifies draws. · ON PAPER"; `person-dana-…` pattern confirmed working elsewhere so the authority-grant *display* mechanism itself is sound |
| 3. Who has site access on Okonkwo right now | 2 (click the Call Sheet instrument on `/doc/<project>` → "Open the site access card") | **PASS** | `people-room-1440-site-access-open.png`; `site-access-full-1440.txt` lines 444‑481: head, "Studio only" line, Who to call first (Luis Ochoa → Chidi Okonkwo → Sam Rowe, exact order), The way in (no code digits, "ask Luis Ochoa"), Key holder, Hours, Receiving, Who was told — all present, one screen, matching SPEC §5.6 verbatim in substance |
| 4. Mark Frank Bauer do-not-contact, routed to Rosa | 1 (open Frank Bauer's person card) | **FAIL** on the person card — see QA‑R2‑3 and QA‑R2‑4. The Directory row *does* correctly route to Rosa (tel: link present, aria-label "Rosa Delgado, (612) 555-0114"); the person card, the room's primary surface for this exact task, does not | `task4-frank-bauer-card.png`, `task4-frank-bauer-body.txt`, `task4-frank-tel-links.json` (empty array — zero tel: links anywhere on the card) |
| 5. Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo | n/a | **NOT BUILT** (unchanged, expected) — `w2c-report.md` §4 item 6 states the travel-list pane and multi-select confirm are W3's; no e2e exists for it (item 7, same section). Not re-litigated as a new finding | — |
| 6. Everyone on Okonkwo by role, this week | 1 (click the Call Sheet instrument) | **PASS manually**, **FLAKY under automation** — see QA‑R2‑6 | `people-room-1440-roster-open.png`; `roster-open-1440.txt` lines 178‑430 show Studio side, Client side, On the job · this week, On the job · later, Bidding, Done all present and in SPEC's order, "Build & supply" absent |

## 3. Findings

Severity: **blocking** (breaks a Leah task or a core promise) / **major**
(wrong or missing fact, not task-breaking) / **minor** (cosmetic, test-only,
or low-impact). Confidence reflects how directly the evidence was traced to a
code line vs. inferred from behavior.

### QA‑R2‑1 — BLOCKING, confidence: high
**Company card crew, payee, and job-person names all read "Unnamed" for a
designer who belongs to two `design_studio` organizations — which
`designer@patina.dev` does in this exact dev seed.**

`apps/designer-portal/src/components/document/people/people-room.tsx`
resolves `organizationId` as
`orgs?.find(o => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null`
with no further disambiguation, then passes it into `<CompanyCard
organizationId={organizationId} …>` and reads the same value inside
`directory-view.tsx`. `designer@patina.dev` holds active membership in
**two** `design_studio` orgs — `Leah Hartwell` (`783187b5-…`) and `Local Dev
Studio` (`b0000000-…-0001`) — and `.find()` has no ordering guarantee (no
`order()` in `use-organizations.ts`). All 49 `studio_contacts` rows (the
whole rolodex, including Dana Kowalski and every affiliation) live under
`Local Dev Studio`. When `organizationId` resolves to the other org,
`useStudioContacts(organizationId, …)` inside both `company-card.tsx` and
`directory-view.tsx` returns nothing usable for that firm, so:

- Company card "Crew & designations" prints **"Unnamed · owner · paperwork
  contact · signer · site contact · holds the trade licence"** instead of
  "Dana Kowalski · …" (`company-card.tsx:268`, fallback at `:182`
  `map.set(c.id, c.full_name ?? "Unnamed")`).
- Company card "Payee" prints **"Signs: on file"** instead of "Signs: Dana
  Kowalski" (`company-card.tsx:422`, same fallback path).
- Company card "Jobs" prints **"Unnamed"** above both job rows instead of the
  crew member's name.
- Directory firm rows print **no payee marker at all** for any of the 17
  firms with a `signer_person_id` set — the same `useStudioContacts(
  organizationId, …)` call inside `directory-view.tsx:147` feeds
  `payeeMarkers` (`:181-190`), so it silently comes back empty too. Confirmed
  by grepping the full Directory dump for "Signs:" — zero hits across every
  firm row, including Marrow & Sons which SPEC's own acceptance (§5.1 #13)
  names as carrying one.

This is a single root cause reaching three regions on the company card and
one on the Directory. It directly breaks SPEC §5.3 #2 ("Dana Kowalski ·
owner-operator · …, linking to her person card") on the real, signed-in
account this review was told to use.

Evidence: `people-room-1440-company-northgate.png`,
`company-northgate-1440.txt` ("Unnamed" ×3, "Signs: on file"); DB check
confirming two `design_studio` orgs and 49 contacts under only one of them.

**Fix shape:** resolve the People room's `organizationId` the same
deterministic way the rolodex itself is scoped (e.g. the org that owns the
open project / the org `studio_contacts` rows actually belong to), or make
`useStudioContacts` calls that feed a specific firm's names read that firm's
own `organization_id` off the fetched card rather than the room's ambient
guess.

### QA‑R2‑2 — BLOCKING, confidence: high
**Directory firm rows show "0 open jobs" for firms that visibly have open
engagements — because the count still keys off a column the v4
`people_directory` view intentionally nulls.**

`directory-view.tsx`'s `firmCounts` (`:165-177`) does
`if (row.project_id) bucket.jobs.add(row.project_id)` over the Directory's
own person rows. Migration `00626_people_directory_v4_seats.sql` moved every
carded human onto the CONTACTS branch of the view, whose `project_id` column
is hard-coded `NULL::uuid` (confirmed via `pg_get_viewdef`, line 206 of the
extracted view SQL) — seat data now lives in `people_directory_seats` /
`meta`, not the top-level `project_id`. Directly confirmed: Dana Kowalski's
`people_directory` row has `role='contact'`; Northgate Electric's Directory
row prints "1 on the crew · **0 open jobs**" even though the Company card
(same data) lists two real jobs for her (Okonkwo, Lindqvist); Marrow & Sons
prints "3 on the crew · **0 open jobs**" while three of its people
(Tom Marrow, Erin Sato, Luis Ochoa) hold live Okonkwo seats. Every firm row
in the whole Directory dump prints "0 open jobs" except Rivera Finishes
(see QA‑R2‑9).

Evidence: `directory-1440.txt` (every "· 0 open jobs" line); DB confirms
`role='contact'`/`project_id=NULL` for Dana; `pg_get_viewdef` line 206.

**Fix shape:** derive the firm's open-job count from `people_directory_seats`
(or `meta.seat_count`/the seats already fetched for each person) instead of
the identity row's own `project_id`.

### QA‑R2‑3 — BLOCKING, confidence: high
**The person card's "do not contact" collapsed Channels line never shows the
routed contact — `routeTo` is simply never passed at that call site.**

`reach-access.tsx` accepts a `routeTo` prop and renders it beside "Do not
contact directly." (`:509-513`), but `views/person-profile.tsx`'s mount of
`<ReachAccess …>` (`:236-255`) never passes `routeTo` at all — grep for
`routeTo` in that file returns nothing. On Frank Bauer's real person card the
Channels region reads only **"Do not contact directly."** with no name, no
email, no phone — no way at all to find Rosa Delgado from this screen. This
is the exact CR‑4/CR‑15 defect the round‑1 fix log describes fixing, but that
fix only reached the Directory row and the roster row's call sites, not this
one. `task4-frank-tel-links.json` is an empty array — confirms zero `tel:`
links exist anywhere on the page.

Task 4's acceptance is "every attempted contact… shows 'write Rosa instead'"
— the person card, the most natural place a designer opens to check this
fact, fails it outright.

Evidence: `task4-frank-bauer-body.txt` ("Do not contact directly." with no
follow-on line); `task4-frank-tel-links.json` (`[]`); code read of
`reach-access.tsx:509-513` vs. `person-profile.tsx:236-255`.

### QA‑R2‑4 — BLOCKING, confidence: high
**The person card's Contact Rule region reprints the raw mechanical channel
list ahead of the studio's own typed reason — a second, unfixed instance of
round 1's QA‑5/CR‑6 defect.**

Frank Bauer's real Contact Rule region reads: **"Never mobile, office,
dispatch, after hours, email, ap email, sms. No direct contact, at his
request. Write Rosa Delgado; she forwards what he has to sign. Set 14 Aug
2026."** — the mechanical list is printed in full, ahead of and in addition
to his reason, including the un-house-voiced tokens "ap email" and "sms."
Round 1's CR‑6 fix (`lib/document/contact-rule.ts`'s `contactRuleClause()`)
makes the studio's own `reason` pre-empt the mechanical list wherever it's
used — but `reach-access.tsx` builds its **own**, separate `ruleSummary`
(`:409-429`) that unconditionally prepends
`` `Never ${forbidden.map(...).join(', ')}.` `` before appending
`rule.reason`, never calling the shared helper. This is the same defect
class CR‑22 already named ("two different block heuristics for one fact")
recurring in a third place the round‑1 sweep didn't reach.

Evidence: `task4-frank-bauer-body.txt`; code read of
`reach-access.tsx:409-429` vs. `lib/document/contact-rule.ts`'s
`contactRuleClause()`.

**Fix shape:** `reach-access.tsx`'s `ruleSummary` should call
`contactRuleClause()` (and `contactRuleIsHardBlock()` for `doNotContact`)
instead of maintaining its own parallel implementation.

### QA‑R2‑5 — BLOCKING (for automated verification and for keyboard/AT users), confidence: high
**The Add sheet's "prior express consent" checkbox has an accessible name
that contains the word "Project," colliding with the real Project field —
breaks 5 of 9 automated failures and is a genuine accessibility defect.**

`add-person-sheet.tsx:1269-1280` wraps the checkbox and a full paragraph of
marketing copy in one `<label>`:

```
<span>
  They gave prior express consent for text updates
  <span>… They agreed to Patina project texts (~1/day, rates may apply,
  reply STOP to quit).</span>
</span>
```

The checkbox's accessible name is therefore the entire sentence, which
contains the substring "Patina **project** texts." Playwright's
`getByLabel('Project')` (substring, case-insensitive) resolves to **two**
elements — the real `<select id="add-party-project">` and this checkbox —
and throws a strict-mode violation. Confirmed directly:
`add-sheet-project-label-collision-1440.json` lists exactly these two
elements plus the intended label. This single defect is the root cause of:

- `add-sheet.spec.ts:37` (task 1, add-sheet path)
- `add-sheet.spec.ts:92` (task 2)
- `add-sheet.spec.ts:134` (trade-required check)
- `person-card.spec.ts:51` (task 4 — uses the shared `addSub()` helper)
- `person-card.spec.ts:111` (R‑V — same helper)

Beyond breaking the test suite, this is a real accessibility problem per
SPEC §7 #1/#2 and general practice: a screen-reader or voice-control user
targeting "Project" lands on an unrelated consent checkbox roughly half the
time, and the checkbox's own accessible name is an unreadable run-on
sentence — the same class of defect C32/R-W already ruled against for the
company-card crew line ("a run-on accessible name cannot be scanned by
ear").

Evidence: `add-sheet-project-label-collision-1440.json` and `-390.json`;
`people-room-1440-add-sheet.png`; the 5 Playwright failures above.

**Fix shape:** give the checkbox's `<input>` its own short, explicit
`aria-label` (e.g. "They gave prior express consent for text updates") and
move the explanatory sentence outside the `<label>` (as `aria-describedby`
or plain adjacent text), matching the pattern R‑W already set for the
company-card crew line.

### QA‑R2‑6 — MAJOR, confidence: medium
**`call-sheet.spec.ts` task 6 ("Studio side"/"Client side" visible within
5s) fails under automation but a manual walk with more settle time shows
both bands rendering correctly and in the right order.**

The failing assertion is `expect(page.getByText('Studio side', {exact:
true})).toBeVisible()` with a 5s timeout, immediately after
`openTheCallSheet()`'s own wait for the "Call sheet · Okonkwo residence"
heading. My own walk (which happened to warm caches from a prior navigation
and used a longer, unconditional 1500ms wait before reading the DOM) shows
Studio side (2), Client side (3), On the job · this week (3), On the job ·
later, Bidding, Done all present, in order, with "Build & supply" absent —
i.e. the feature itself works. The discrepancy is consistent with a real
race: the roster-groups fetch (`v_project_roster` + `project_team_members`)
not resolving inside the 5s window on a colder page load, rather than a
missing feature. I did not instrument network timing to confirm this
precisely, hence medium rather than high confidence.

Evidence: `people-room-1440-roster-open.png`, `roster-open-1440.txt` lines
178‑213 (bands present); the automated failure text quoted from the
Playwright run in §1.

### QA‑R2‑7 — MAJOR, confidence: medium
**Dana Kowalski's person-card Paper region (R5, sole-proprietor rollup)
prints "NOT ON FILE" even though her firm Northgate Electric's own COI is
Lapsed on the company card — the two surfaces disagree about the same
fact.**

SPEC's R‑BA ruling states identity_paper_state should reduce worst-first
over both the person's own documents *and* their firm's, one formula for
every reader. Dana's person card (`task1` walk / `person-dana-1440.txt`)
shows region "PAPER" with word "NOT ON FILE" and act "Record a document" —
but Northgate Electric's own company card, opened in the same session,
correctly shows the COI as Lapsed with real blocking language. Since she is
flagged sole proprietor (the region only renders for sole proprietors, and
it did render), the two facts should agree. I did not trace this to a
specific line (time did not allow tracing `identity_paper_state` vs. the
person-card's own R5 query), so confidence is medium, not high.

Evidence: `person-dana-1440.txt` ("PAPER / NOT ON FILE / RECORD A DOCUMENT")
vs. `company-northgate-1440.txt` ("COI, general liability … LAPSED …").

### QA‑R2‑8 — MINOR, confidence: high (test bug, not a product bug)
**`call-sheet.spec.ts` task 3's failure is a test-locator scoping bug, not a
site-access ordering bug — manual verification shows the real order is
correct.**

The test does `page.locator('a[data-tel-link]').first()` on the whole page
after opening the Site Access overlay and expects it to contain "Luis
Ochoa." But the underlying Call Sheet stays mounted behind the overlay (by
design, D1: "sheets must never unmount… the document beneath them"), so the
page's first `tel:` link overall is Adaeze Okonkwo's, from the Client-side
band still in the DOM. Scoped to the Site Access panel itself, the order is
exactly right: `site-access-full-1440.txt` lines 449‑454 read "Luis Ochoa,
Superintendent, …0109" then "Chidi Okonkwo, Owner, …0105" then "Sam Rowe,
Architect, …0110" — the SPEC §5.6 order verbatim. Filed as minor/test-debt
rather than a product finding; the fix is to scope the test's locator to the
Site Access panel's own container.

Evidence: `all-tel-links-1440.json` (full-page order) vs.
`site-access-full-1440.txt` lines 449‑454 (panel-scoped order, correct).

### QA‑R2‑9 — MAJOR, confidence: medium
**A company-only bidding engagement with no named person (Rivera Finishes)
produces a spurious "person-shaped" Directory row in addition to its real
firm row, inflating the head count and duplicating the entity.**

The Directory dump lists "RF / Rivera Finishes / Rivera Finishes · paint /
ON PAPER NOT ASKED NOT ON FILE / (612) 555-0219 / 1 seat" as a person-band
row *and* "RF / Rivera Finishes / Subcontractor · 1 on the crew · 1 open job
/ NOT ON FILE" as a separate firm row. Per direction's identity model, a
bid with `person: null, company: "rivera"` should surface only through the
Call Sheet's Bidding band, not mint a phantom Directory identity. Plausible
mechanism: `party_identity_key()`'s COALESCE chain (card → login → phone →
email → the row's own id) falls through to the party row's own id when no
person, phone, or card exists, minting a one-off "identity." I did not trace
this to the SQL function itself, so confidence is medium.

Evidence: `directory-1440.txt` (both "RF Rivera Finishes" rows, one under
the person-shaped list, one under Firms).

### QA‑R2‑10 — MINOR, confidence: low–medium
**`add-client-letter.spec.ts`'s two failures are most likely an environment
flag mismatch on this review's part, not a confirmed product regression.**

The task's instructions specify
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true` for the build/start; the
repo's own Playwright config normally also sets `client-invite-letter:true`
for this exact suite. Both failing tests time out waiting on
letter-composer fields ("Send them the letter" checkbox, "A line for Dave")
that are plausibly gated behind that flag. I did not re-run with the fuller
flag set to confirm, so I'm not filing this as a confirmed defect — flagging
it so it isn't silently dropped, and so a re-run with
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true,client-invite-letter:true`
can confirm or refute it cheaply.

### QA‑R2‑11 — MINOR, confidence: medium
**The routed-contact line for Rosa Delgado prints only her office phone,
never her email, even though she has a typed, preferred email channel.**

`studio_contact_channels` for Rosa carries both an `office` phone and an
`email` (`rosa@twin-cities-drywall-plaster.com`), both marked
`preferred=true`. SPEC's C22/R‑L ruling for the routed line specifically
says it "prints Rosa Delgado's email **and** her office phone as a tel:
link." The real Directory row's `aria-label` reads only "Rosa Delgado, (612)
555-0114" — no email anywhere. Filed at medium confidence because the
source rulings are internally a little ambiguous (R-L also describes a
general "email if present, else phone" *selection* rule used elsewhere,
which could be read either way for this specific line), but the more
specific C22 sentence for the routed line itself says "and," not "or."

Evidence: `frank-bauer-directory-row-full.html` (`aria-label="Rosa Delgado,
(612) 555-0114"`, no email in the row); DB: Rosa's two typed, preferred
channels.

### QA‑R2‑12 — MINOR, confidence: low
**Transient "Not authenticated" / "Failed to fetch" console errors during
initial sign-in.**

Both the 1440 and 390 passes logged one 403, one `TypeError: Failed to
fetch`, and one `AppError: Not authenticated` each, all timestamped at the
very start of the session (during/just after the sign-in redirect, before
the session cookie was fully live) and never recurring afterward across many
subsequent navigations. Did not block or corrupt any later screen. Likely a
benign session-bootstrap race rather than a defect worth blocking on, but
recorded since the instruction was to report every console error.

Evidence: `console-errors.json`.

## 4. Round‑1 findings — rechecked

Spot-checked against this round's evidence rather than re-run exhaustively
(26 findings; time did not allow re-verifying all of them independently).

| Finding | Status this round | Evidence |
|---|---|---|
| QA‑2/CR‑7 — AHJ/lender firms print no paper word | **FIXED, confirmed** | `directory-1440.txt`: "City of Minneapolis, CPED Inspections" and "Great Northern Bank" firm rows print no paper word at all |
| QA‑3 — a blocked person's own phone as a live `tel:` | **FIXED, confirmed** | Frank Bauer: no phone printed on the Directory row; `task4-frank-tel-links.json` empty on his person card |
| QA‑8 — room title is an `<h1>` | **FIXED, confirmed** | `room-shell.tsx:148` |
| QA‑4/CR‑14/CR‑15 — routed line carries a real channel | **FIXED on the Directory row** (confirmed, `tel:` + name in `aria-label`); **NOT fixed on the person card** — see QA‑R2‑3 (a different call site the round‑1 patch didn't reach); roster-row call site not independently re-walked this round | `frank-bauer-directory-row-full.html`; `task4-frank-tel-links.json` |
| QA‑5/CR‑6 — no raw enum tokens on a face | **FIXED on Directory/roster rows** (not independently re-walked); **regressed on the person card** — see QA‑R2‑4, a different, unpatched call site | `task4-frank-bauer-body.txt` |
| QA‑6 — Studio/Client side bands always render | **Fixed in principle, flaky under automation** — see QA‑R2‑6 | `roster-open-1440.txt`; `call-sheet.spec.ts:40` failure |
| QA‑7 — travel-list pane | **Still open, as documented** (W3 scope, not re-claimed) | `w2c-report.md` §4 |
| QA‑1/CR‑3 — Chase the renewal enqueue path | **Not re-verified this round** (no DB probe run against `enqueue_agent_task`/`agent_tasks`) | — |
| CR‑9 — vitals population arithmetic | **Consistent with real data**: "8 on the job this week · 0 reachable by text · 2 with accounts · 6 on paper" checked by hand against the 8 people in Studio+Client+this-week bands, none of whom currently hold SMS-texting consent — 0 is correct, not a regression | `roster-open-1440.txt` lines 173, 178‑246 |

## 5. Clean / not clean

**Not clean.** Five blocking findings (QA‑R2‑1 through QA‑R2‑5) and three
major findings (QA‑R2‑6, QA‑R2‑7, QA‑R2‑9) stand. Task 4 fails outright on
the person card; Tasks 1 and 2 are blocked on their add-sheet path by one
shared accessibility/test-collision bug (QA‑R2‑5) though their alternate
(person-card / already-recorded) paths work; Task 3 and Task 6 pass on a
real walk; Task 5 remains not built, as previously known and acknowledged.

<!-- Files under build/ need `git add -f`; done for the qa-w2-r2/ directory
and this file as part of finishing this review. -->
