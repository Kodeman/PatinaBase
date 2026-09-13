# W2 review — round 13 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `4788522b4` ("fix(people-room): W2 round-12 findings").
Local production build (`next build` + `next start -p 3000`), signed in as `designer@patina.dev`
against the local Supabase stack (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
`supabase:reset` replayed immediately before this round, Okonkwo dev seed). No prod touched, no
migration written.

**Deviation, flagged as r5 flagged it:** the brief names Inbucket-mediated sign-in; port 54324 in
this worktree runs Mailpit, not Inbucket, and this portal's own `e2e/fixtures/auth.ts` (used by
every `e2e/people/*` spec) signs in as `designer@patina.dev` / `password123` through the UI's
password disclosure. I used that path rather than standing up a magic-link/OTP flow by hand — same
account, the one every people spec already trusts. A magic-link-specific regression was not
exercised this round.

**Verdict: NOT CLEAN.** One fresh BLOCKING finding (a consent record's origin project prints two
different, disagreeing names depending on which surface reads it), one BLOCKING gap against SPEC
§5.6 (the site access card never prints the project's street address, though the fact exists in the
database and matches the specimen's fixture value byte for byte), and one already-disclosed BLOCKING
gap (the site access "who was told" log holds one entry, not two) carried forward, unfixed, from
`w2c-report.md`. Everything QA rounds 5 and 12 fixed (QA-1..QA-4, CR5-1, CR5-2, CR12-1) was
independently re-verified live and holds. See §4 for the full re-check table and §2 for new findings.

---

## 0. Procedure, as run

1. `lsof -ti :3000` → empty. Confirmed before starting.
2. `pnpm --dir <worktree> supabase:reset` — required `dangerouslyDisableSandbox` once: the CLI's
   telemetry writer tried `/Users/kody/.supabase/telemetry.json.tmp.*` and the sandbox's default
   filesystem policy refused that path (`EPERM`). Not a product finding — a harness/sandbox
   interaction with the Supabase CLI's own telemetry writer, outside `$TMPDIR`/the working tree.
   Reset replayed all migrations through `00627_access_grants_and_field_link_window.sql` plus
   `20260910152111_create_contact_messages.sql`, then every seed file including
   `people_crm_dev.sql`. Exit 0.
3. `supabase status --workdir <worktree> -o env` supplied the local anon/service-role keys (not
   reproduced here; these are the fixed, published local-dev demo keys, not secrets).
4. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local>
   SUPABASE_SERVICE_ROLE_KEY=<local> NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
   NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true" SUPABASE_JWT_ISSUER=… ORDERS_SERVICE_URL=…
   MEDIA_SERVICE_URL=… PROJECTS_SERVICE_URL=… NEXT_PUBLIC_APP_URL=… NEXT_PUBLIC_CLIENT_PORTAL_URL=…
   pnpm --filter @patina/designer-portal build` — exit 0, full route table printed, `/people` static.
5. Start: same env, `npx next start -p 3000`, backgrounded; `output: standalone` warning printed
   (pre-existing, named in r5) but the process served correctly throughout
   (`curl /api/version` → 200, `curl /people` pre-auth → 307). `.env.local` was never created; no
   `.env*` file under the worktree was touched.
6. `e2e/people/*.spec.ts` run against the live server with `dangerouslyDisableSandbox` (Chromium's
   own documented Mach-port-bootstrap sandbox conflict, per SPEC §9's own note).
7. Manual walk used short Playwright scripts saved as temporary specs under
   `e2e/people/qa-walk-r13*.spec.ts`, run, and then deleted before finishing —
   `git status --short apps/designer-portal/e2e/people/` is clean.
8. Server stopped by PID (`lsof -ti :3000` → `kill -9`, required `dangerouslyDisableSandbox`).
   `lsof -ti :3000` confirmed empty afterward, both mid-session and at hand-off.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

| Spec | Result | Read |
|---|---|---|
| `directory.spec.ts` — all 6 | PASS | six chips, trade line, PR-j persistence, legacy `?role=` map, C11 row-as-container, empty sentence |
| `company-card.spec.ts` — both | PASS | Chase-the-renewal drafts `awaiting_review`; no consent/reach word on a firm |
| `call-sheet.spec.ts:48` task 6 | PASS | roster opens already banded by window |
| `call-sheet.spec.ts:126` task 3 (logging who was told) | PASS | |
| `call-sheet.spec.ts:91` task 3 (one click) | FAIL | test bug, not a product defect — unscoped `a[data-tel-link]` locator resolves to the underlying Call Sheet's own first row, not the overlay. Named QA-9 in `w2-review-r5-qa.md`; unchanged, still a test bug |
| `add-sheet.spec.ts:37` task 1 | FAIL | known test-authoring gap (phone-collision fixture) — QA-10 in r5, unchanged |
| `add-sheet.spec.ts:103` task 2 | FAIL | `getByLabel("Authority")` — the shipped field is a structured scope+threshold picker, not one field named "Authority" — QA-6 in r5, unchanged |
| `add-sheet.spec.ts:145` (trade-required alert) | FAIL | test bug — `role=alert` collides with Next's route announcer — QA-11 in r5, unchanged |
| `person-card.spec.ts:51` task 4 | FAIL | phone-collision fixture gap — QA-10, unchanged |
| `person-card.spec.ts:111` R-V | FAIL | same, unchanged |
| `add-client-letter.spec.ts` — both | FAIL | orthogonal spec requiring the local edge-function runtime container, not named in any w1/w2 file list — QA-12 in r5, unchanged |

**Read: identical pass/fail signature to round 5** (11/19, the same eight specs, for the same
documented reasons). No regression and no new e2e failure across seven fix rounds (r6–r12) that
touched product code. Full transcript not re-pasted; available in this session's tool output.

---

## 2. Fresh findings (QA-R13-#)

### QA-R13-1 — BLOCKING, confidence HIGH — a consent record prints two different, disagreeing origin projects depending on which surface reads it

**Claim.** R-Q requires one wording for a consent sentence, "*Source* consent, *date*, on the
*project*." — the same fact, the same words, everywhere the channel value appears. Direction §5.2
("Display: printed against the channel value with source, date, and origin job, everywhere the
number appears") and the Directory's own read (`origin_project_id`) name a single true origin job
per record.

**Reproduced.** Pete Rusk's (F-12 pattern) opted-out record, phone `(612) 555-0112`, is the SAME row
in `studio_channel_consent` (one `(organization_id, channel_kind, channel_value)` key) on both
surfaces, read within seconds of each other in this walk:

- **Directory row** (`/people`): "Opted out by text, 3 Dec 2025, **on the Lindqvist kitchen**."
- **Call Sheet roster row** (`/doc/<Okonkwo>` → Call sheet, Pete Rusk, "On the job · later" band):
  "Opted out by text, 3 Dec 2025, **on the Okonkwo residence**."

Same person, same channel value, same date — two different claimed origin jobs.

**Root cause, as the build's own report states it.** `w2c-report.md` §4 item 4 names this outright:
*"The consent sentence's 'on the project' clause only prints where the project can be named.
`studio_channel_consent.origin_project_id` is an id, not a name; the sheet knows its own job's name
and nothing else's. … the Call Sheet passes its own project name."* The Call Sheet substitutes ITS
OWN project's name into the R-Q template regardless of the record's true `origin_project_id` — so a
consent record carried forward from a different job (exactly Pete Rusk's case, per SPEC's own
fixture and F-12) reads correctly on the Directory (which resolves the real origin) and reads
**wrong** on the roster (which always claims the current job).

**Why this is a finding, not an accepted limitation.** The same paragraph in `w2c-report.md`
describes the intended behaviour as "prints its source and its date and **stops rather than
inventing a place**" — but what is shipped does invent a place, for the one population (a carried-
forward record) where inventing one is observably wrong. The report's stated intent and the shipped
behaviour disagree with each other, and the shipped behaviour is what a studio reads.

**Impact.** A studio reading Pete Rusk's roster row is told, in the room's own words, that he opted
out **on the Okonkwo residence** — a claim the record does not make and the Directory (reading the
same record) contradicts one click away. This is exactly a "wrong fact on a face" and a shipped
reader disagreeing with the record it is supposed to render.

**Evidence.** `build/qa-w2-r13/live-1440-directory.txt` (search "Pete Rusk"; the sentence sits at
the line right before his three word columns), `build/qa-w2-r13/live-1440-roster.txt` (search "Pete
Rusk" under "ON THE JOB · LATER").

**Fix direction.** The roster row should read the record's own `origin_project_id` and name it
(joining to `projects.name`) when it differs from the seat's own job, falling back to "on this job"
or omitting the clause only when the id cannot be resolved — not substituting the current project's
name unconditionally.

### QA-R13-2 — BLOCKING, confidence HIGH — the site access card never prints the project's street address, though the fact exists and matches the specimen exactly

**Claim.** SPEC §5.6 #1: "Head 'Site access · Okonkwo residence' and '4412 Fremont Ave S,
Minneapolis MN 55409'."

**Reproduced.** The live `#state-access`-equivalent card (opened via "Open the site access card" on
the Okonkwo Call Sheet, both 1440 and 390) prints "Site access · Okonkwo residence" and "Studio
only. This card never reaches a client page." and then goes straight to "Who to call first" — the
address line is absent entirely, at both widths.

**Root cause, verified.** The data is not missing:

```
$ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "select site_address from projects where id = 'd0e00000-0000-0000-0000-00000000000a';"
               site_address
-------------------------------------------
 4412 Fremont Ave S, Minneapolis MN 55409
```

— byte-identical to SPEC's own fixture value. `grep -n "address" apps/designer-portal/src/components/
document/roster/site-access-card.tsx` returns **nothing**: the component never reads or renders
`projects.site_address` at all. This is a code omission, not a seed gap.

**Evidence.** `build/qa-w2-r13/live-1440-access.txt` and `live-390-access.txt` (head, no address
line at either width), `build/qa-w2-r13/live-1440-state-access.png`.

### QA-R13-3 — BLOCKING (SPEC acceptance), confidence HIGH, already disclosed — "Who was told" holds one entry, not two

**Claim.** SPEC §5.6 #7 requires two "Who was told" entries, newest first.

**Reproduced.** The live card prints exactly one: "The way in changed 16 Oct 2026, by Leah Hartwell.
Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana Kowalski, Adaeze Okonkwo." — no second entry.

**Not a fresh regression.** `w2c-report.md` §4 item 3 names this outright: `project_site_access_
cards` holds a single `changed_at`/`changed_by`/`told_refs` triple, not a log table, so only the
last change can ever print. Carried forward, unfixed, across rounds 5–12 because no round's finding
list named it. Reported here because the task's own rubric treats a missing SPEC §5 acceptance
string as blocking regardless of whether it was previously disclosed, and because the brief asks for
every SPEC §5 acceptance string to be checked, not only fresh ones.

**Evidence.** `build/qa-w2-r13/live-1440-access.txt` (one "Who was told" entry; SPEC's two-entry
literal has no second line to find).

### QA-R13-4 — MINOR, confidence HIGH — still-open seed-completeness gap named in r5 (QA-5): Northgate Electric's company card omits its warranty clause and tax-id line

**Reproduced, unchanged from r5.** Header reads "Electrical sub · 1 person · 2 projects" (no
"warranty through …" clause); Payee region reads "Remit to Northgate Electric" / "Retainage 10%"
(no "Tax id ending …" line). `select warranty_until, tax_id_last4 from studio_contacts where …`
still returns both NULL. r5 flagged this as seed-completeness, not chased; still true eight rounds
later. Carrying forward at the same severity — not a fresh code defect, but still visibly absent
from the face SPEC names.

**Evidence.** `build/qa-w2-r13/live-1440-company-retake.txt`.

### QA-R13-5 — MINOR, confidence MEDIUM — a firm name ending in "s" produces a grammatically malformed possessive in the Chase-the-renewal consequence sentence

**Observed.** Beck + Rowe Architects's Paper region consequence sentence reads: "This drafts a note
to **Beck + Rowe Architects's** paperwork contact and files it for your review." The template
appends `'s` to every firm name unconditionally; "Architects's" is not English. Functionally
harmless (the act still works — confirmed via the passing `company-card.spec.ts` e2e for a
different firm), purely a copy defect on a face the room otherwise holds to a high bar.

**Evidence.** `build/qa-w2-r13/firm-Beck___Rowe_Architects.txt`.

### QA-R13-6 — MINOR, confidence MEDIUM — the site access card's key-holder line does not print SPEC's literal "Text only," phrase

**Observed.** SPEC §5.6 #4: "Ngozi Eze holds a key. Text only, (612) 555-0106." Live:
"Ngozi Eze holds a key. TEXTING (612) 555-0106" — the shipped component
(`site-access-card.tsx:550`) substitutes the `consent` family's `StateWord` badge ("Texting") for
the reach/channel phrase "Text only,". Root-caused in the component: `<StateWord family="consent"
value={keyHolder.consent} plain />` sits where the literal prose would go. The underlying fact
(she's reachable by text, and the number) is still conveyed; only the exact wording differs. Given
SPEC §5's own header ("every string below must appear on the face, spelled exactly"), reporting as a
literal-string miss rather than silently accepting the substitution.

**Evidence.** `build/qa-w2-r13/live-1440-access.txt`, `site-access-card.tsx:543-558`.

### QA-R13-7 — MINOR, confidence HIGH, orthogonal (carried forward from r5's QA-7) — two console errors fire on every fresh sign-in, before `/people` is ever opened

**Observed, identical to r5, both 1440 and 390 this round:**
```
TypeError: Failed to fetch  (…/_next/static/chunks/2290-….js — Supabase auth session read)
Error logged: AppError: Not authenticated  (a React Query fetch on /desk, pre-navigation)
```
No further console errors, warnings, or hydration warnings were seen on any of the seven People-room
states walked this round (directory, person, company × 2 widths + 4 additional firm cards, roster,
site access, add sheet, bring-forward pick) at either width. Reads as the same session-hydration
race r5 named, orthogonal to the People-room program. Not re-investigated.

**Evidence.** `build/qa-w2-r13/console-1440.json`, `console-390.json` (byte-identical pair to r5's).

### QA-R13-8 — not a finding, informational — literal SPEC fixture text vs. the live dev seed's own text

As r5's QA-8 already established: the live directory (40 people · 21 firms, vs. SPEC's literal 29 ·
22) and every per-person rule/consent sentence read the SEED's own typed text, not SPEC's fixture
prose. Frank Bauer's live rule ("No direct contact, at his request. Write Rosa Delgado; she forwards
what he has to sign.") differs word-for-word from SPEC's mock ("Do not contact directly. Write Rosa
Delgado instead.") while carrying the same meaning, the same hard-block treatment, and (per R-L) the
routed person's email and tel-linked office phone. Not treating per-record prose differences as
findings, consistent with r5's own ruling on this; noted so a future reviewer does not re-discover
it. What IS checked and holds: the STRUCTURAL/code-owned strings — region headings, act labels, the
four word-family vocabularies, empty/fallback sentences, R-Q's template shape, the eight-kind switch,
R-P's fixed Paper-region order — all print correctly (see §5 below for the acceptance-string sweep).

---

## 3. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → "Add person" opens the Add sheet (client-first default); Call Sheet → "New person" opens the SAME sheet pre-scoped to the job (confirmed live, screenshot below — QA-2's r5 fix holds); kind switch + contact-rule field present | PASS | `build/qa-w2-r13/newperson-click-result.png`; e2e failure is QA-10 (phone-collision fixture), not a fresh defect |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Add sheet's authority capture is a structured scope+threshold picker (not a field literally labelled "Authority" — QA-6, unchanged); the FACT is visible downstream: Call Sheet Client Side prints Chidi Okonkwo, "Signs money to $2,500. Approves change orders to $2,500. Certifies draws." | PASS (fact visible), same caveat as r5 | `build/qa-w2-r13/live-1440-roster.txt` |
| 3 | Who has site access right now | Call Sheet → "Open the site access card", one click | PASS (mechanism), but the resulting card is missing the street address (QA-R13-2) and shows only one "who was told" entry where SPEC wants two (QA-R13-3) | `build/qa-w2-r13/live-1440-access.txt`, `-state-access.png` |
| 4 | Frank Bauer do not contact, routed to Rosa | Already live on the Directory row, the roster row (collapsed, per C29/R-S), and the company card's crew line, each with Rosa's email and tel-linked office phone | PASS | `build/qa-w2-r13/live-1440-directory.txt`, `live-1440-roster.txt` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo | "From the rolodex" opens the single-add picker (kind chips, mini rows with reach/consent/paper words, one history line, no verdict) — correctly stops short of the multi-select travel-list pane, which is W3 scope per R-BM | PASS (to the scope owed) | `build/qa-w2-r13/live-1440-pick.txt`, `-state-pick.png` |
| 6 | Everyone on Okonkwo by role, this week | Call Sheet opens already banded: Studio side (2), Client side (2), On the job · this week (10), On the job · later (10), Bidding (1), Done (1) | PASS | `build/qa-w2-r13/live-1440-roster.txt` |

---

## 4. Prior findings — re-checked live this round

| ID | Round fixed | This round's read |
|---|---|---|
| QA-1 (identity line dropped the firm name) | r5 | **HOLDS.** Every crew/maker Directory row and roster row prints "Firm · trade" (Dana Kowalski → "Northgate Electric · electrical"; Erin Sato → "Marrow & Sons"; Joe Wozniak → "Cedar & Iron Framing · carpentry & framing"; etc.), confirmed across ~25 rows |
| QA-2 ("New person" opened the picker, not the Add sheet) | r5 | **HOLDS.** Live-clicked on the Okonkwo Call Sheet: "New person" opens "ADD · TO YOUR ROSTER / Bring someone in", not "FROM THE ROLODEX". Screenshot captured |
| QA-3 (spurious unnamed "Client" row) | r5 | **HOLDS.** Okonkwo's Client Side band shows exactly 2 rows (Adaeze Okonkwo, Chidi Okonkwo), no third "Client" row |
| QA-4 (raw E.164 on Channels / site access) | r5 | **HOLDS.** Every phone observed this round — Directory rows, person-card Channels, company-card Channels, site-access call-first lines — renders `(612) 555-0NNN` shaped, none raw |
| CR5-1 (rolodex writes guessed the studio) | r5 | Not re-exercised (no write attempted this round); no regression signal |
| CR5-2 (whole-edition revoke silent) | r5 | Not re-exercised (no revoke attempted this round); no regression signal |
| CR12-1 (SMS consent offered on a landline / 311 handle) | r12 | **HOLDS.** Ray Thao's person card: office line and the 311-portal line both render with `[data-state-family="consent"]` count = 0 (no consent word, no "Record consent" act on either); confirmed live, not only in jest |
| QA-R12-1 (round-12 QA never ran — port busy) | r12 | Superseded: this round completed the full procedure the port conflict blocked |
| QA-5 (Northgate warranty/tax-id gap) | never assigned/fixed | **STILL OPEN** — see QA-R13-4 |
| QA-6 (Authority field structure vs. spec) | never assigned/fixed | **STILL OPEN**, same shape as r5 |
| QA-7 (console errors on sign-in) | never assigned/fixed | **STILL PRESENT**, same two errors — see QA-R13-7 |
| QA-8 through QA-12 | informational/test bugs | unchanged, not re-litigated (see §2's QA-R13-8 and §1) |

---

## 5. SPEC §5 acceptance-string sweep

Checked directly against the live build's rendered text at both widths. Only misses are listed
verbatim; everything else in §5.1–§5.6 that is a code-owned string (region headings, act labels, the
four word-family vocabularies and their pigments — see §6 below, empty/fallback sentences, the R-Q
template shape, R-P's fixed Paper order, the eight-kind Add-sheet switch, R-L's routed-channel rule,
C13/C18/C21's "No paper is held for this firm.") was found present and correctly structured. Per-
record prose that legitimately differs because the live seed is not the literal fixture (names,
exact dates, exact rule wording, "40 people · 21 firms" vs. "29 · 22") is not re-listed as missing —
see §2's QA-R13-8.

**Missing, verbatim:**

- §5.6 #1 — "4412 Fremont Ave S, Minneapolis MN 55409" — absent from the site access card at both
  widths (QA-R13-2).
- §5.6 #4 — "Text only, (612) 555-0106" — the key holder line prints "TEXTING (612) 555-0106"
  instead (QA-R13-6).
- §5.6 #7 — the second "Who was told" entry ("Site hours set for the demo phase. 12 October 2026,
  by Priya Natarajan. Told: …") — only one entry ever prints (QA-R13-3).

**Present and correct, worth naming because they were prior rounds' blocking findings:**
"Northgate Electric · electrical" (Directory identity line, QA-1); "No paper is held for this
firm." (Great Northern Bank and City of Minneapolis, CPED Inspections company cards, verbatim,
confirmed this round — C13/C18/C21); the fixed Paper-region order table → leading-rule clause →
consequence sentence → act row (Northgate Electric's company card, R-P/C26); "Site access held.
Northgate Electric's insurance lapsed 31 March 2026." (Dana Kowalski's collapsed roster row,
verbatim — PR-h/C29); no `disabled` attribute anywhere on the company card at either width (0 of 0,
directly counted via `document.querySelectorAll('[disabled]')`).

---

## 6. CR4-1 — hairline check

Directly measured via computed style on live `[data-state-family]` elements, both widths:

- 1440, bordered `.word`-equivalent spans: `border-width: 1px`, `border-color: rgb(216, 204, 184)`
  (paper/dormant), `rgb(168, 181, 160)` (reach/current-sage), `rgb(216, 204, 184)`
  (hairline-strong) — warm tan/sage hairlines, nowhere near black.
- 390: the plain (borderless, inline, middle-dot) variant is the one with non-zero size
  (confirms R-M's responsive toggle is implemented via CSS, not JS — both variants exist in the DOM
  at both widths, and the non-active one collapses to 0×0); the bordered 1440 variant is the one
  that collapses to 0×0 at 390, and vice versa. No near-black hairline observed at either width.

**No CR4-1 finding.**

---

## 7. Overflow

`document.documentElement.scrollWidth > clientWidth`, measured directly (not eyeballed):

| State | 1440 | 390 |
|---|---|---|
| Directory | `false` | `false` |
| Roster (Call Sheet) | not measured | `false` |

No horizontal overflow observed on any state walked, either width.

---

## 8. Files

`build/qa-w2-r13/` (force-added, per the task's own instruction that files under `build/` need
`git add -f` — the directory is `.gitignore`d):

- Full-page screenshots: `live-1440-state-{directory,person,company,roster,access,pick,add}.png`,
  `live-390-state-{directory,person,company,roster,access}.png`, plus
  `live-1440-company-retake.png`, `newperson-click-result.png`.
- Raw `body.innerText` dumps for every state above, both widths, plus four extra firm cards
  (`firm-Great_Northern_Bank.txt`, `firm-City_of_Minneapolis__CPED_Inspections.txt`,
  `firm-Rusk_Mechanical.txt`, `firm-Beck___Rowe_Architects.txt`) and Ray Thao's person card
  (`person-ray-thao.txt`).
- `console-1440.json`, `console-390.json` — full console capture, both widths.
- `hairline-1440-deep.json`, `wordcolumn-390-deep.json` — computed-style dumps behind §6.
- `overflow-*.txt`, `disabled-count-*-company.txt`, `ray-thao-consent-word-count.txt`.

---

## 9. Summary

**NOT CLEAN** — 3 BLOCKING, 4 MINOR (one of the BLOCKING findings, QA-R13-3, and one MINOR,
QA-R13-4, are pre-disclosed limitations named in `w2c-report.md`/`w2-review-r5-qa.md` and carried
forward unfixed rather than fresh regressions; QA-R13-1 and QA-R13-2 are fresh). Zero forbidden
strings, zero broken states, zero unreachable/inert acts, zero horizontal overflow, zero consent
writes observed outside `record_channel_consent`/`record_channel_invite`/`record_channel_reconsent`,
zero site-access code fields — and every one of rounds 5's and 12's fixed findings (QA-1..QA-4,
CR12-1) independently re-verified live and holding across seven further rounds of unrelated changes.
