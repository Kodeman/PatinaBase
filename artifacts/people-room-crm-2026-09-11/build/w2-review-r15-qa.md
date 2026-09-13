# W2 review — round 15 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `e6aa10bdd` ("fix(people-room): W2 round-14 — one seat
vocabulary on the Call Sheet row"). Local production build (`next build` + `next start -p 3000`),
signed in as `designer@patina.dev` against the local Supabase stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `supabase:reset` replayed immediately
before this round, Okonkwo dev seed). No prod touched, no migration written.

**Verdict: CLEAN.** Zero blocking, zero major. Two carried-forward MINOR findings from round 13
remain open (unchanged), one orthogonal MINOR console-error pair remains present (unchanged), and
round 14's CR14-1 fix (the Call Sheet's seat vocabulary) is independently confirmed live on both
named cards (Chidi Okonkwo, Dana Kowalski). No new blocking or major findings this round.

---

## 0. Procedure, as run

1. `lsof -nP -iTCP:3000 -sTCP:LISTEN` → empty. Confirmed before starting (PORT RULE).
2. `pnpm --dir <worktree> supabase:reset` — required `dangerouslyDisableSandbox` once: the CLI's
   telemetry writer tried `/Users/kody/.supabase/telemetry.json.tmp.*`, refused by the sandbox's
   default filesystem policy (`EPERM`). Not a product finding, same harness/sandbox interaction
   named in `w2-review-r13-qa.md` §0. Reset replayed all migrations through
   `00627_access_grants_and_field_link_window.sql` plus `20260910152111_create_contact_messages.sql`,
   then every seed file including `people_crm_dev.sql`. Exit 0.
3. `supabase status --workdir <worktree> -o env` supplied the local anon/service-role keys.
   **Tooling note, not a finding:** the CLI's `-o env` output quotes each value
   (`ANON_KEY="eyJ…"`), and a first-pass extraction script left the surrounding quote characters
   on the exported values. That corrupted key made every direct-JWT REST call (and the
   `e2e/people` Playwright run) fail with `PGRST301 JWT cryptographic operation failed` — reproduced
   and root-caused by hand (decoded the JWT, checked its `iss`/`alg`, and found a literal trailing
   `"` byte on the exported string; a fresh `supabase auth token` password-grant round trip proved
   the actual stack was healthy the whole time). Fixed by stripping the quotes in the extraction
   script; rebuilt and restarted before proceeding. Recorded here in case a future round hits the
   same shape of failure and wonders whether the stack itself regressed — it did not.
4. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local>
   SUPABASE_SERVICE_ROLE_KEY=<local> NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
   NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true" SUPABASE_JWT_ISSUER=… ORDERS_SERVICE_URL=…
   MEDIA_SERVICE_URL=… PROJECTS_SERVICE_URL=… NEXT_PUBLIC_APP_URL=… NEXT_PUBLIC_CLIENT_PORTAL_URL=…
   pnpm --filter @patina/designer-portal build` — exit 0, full route table printed, `/people` static.
5. Start: same env, `npx next start -p 3000`, backgrounded; the `output: standalone` warning
   printed (pre-existing, named in r5/r13) but the process served correctly throughout
   (`curl /api/version` → 200, `curl /people` pre-auth → 307). `.env.local` was never created; no
   `.env*` file under the worktree was touched.
6. `e2e/people/*.spec.ts` run against the live server with `dangerouslyDisableSandbox` (Chromium's
   documented Mach-port-bootstrap sandbox conflict, per SPEC §9's own note).
7. Manual walk used short Playwright scripts saved as temporary specs under
   `e2e/people/qa-walk-r15*.spec.ts`, run, then deleted before finishing —
   `git status --short apps/designer-portal/e2e/people/` is clean.
8. Server stopped by PID (`lsof -ti :3000` → `kill`, then `kill -9`). `lsof -ti :3000` confirmed
   empty afterward, both mid-session (before the final overflow sweep needed a second `next start`)
   and at hand-off.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

Identical pass/fail signature to rounds 5 and 13 — same eight specs, same documented
test-authoring/environment reasons, re-confirmed at this HEAD:

| Spec | Result | Read |
|---|---|---|
| `directory.spec.ts` — all 6 | PASS | six chips, trade line, PR-j persistence, legacy `?role=` map, C11 row-as-container, empty sentence |
| `company-card.spec.ts` — both | PASS | Chase-the-renewal drafts `awaiting_review`; no consent/reach word on a firm |
| `call-sheet.spec.ts:48` task 6 | PASS | roster opens already banded by window |
| `call-sheet.spec.ts:126` task 3 (logging who was told) | PASS | |
| `call-sheet.spec.ts:91` task 3 (one click) | FAIL | test bug — unscoped `a[data-tel-link]` locator resolves to the underlying Call Sheet's own first row, not the overlay (QA-9, r5) |
| `add-sheet.spec.ts:37` task 1 | FAIL | known test-authoring gap (phone-collision fixture, QA-10, r5) |
| `add-sheet.spec.ts:103` task 2 | FAIL | `getByLabel("Authority")` — the shipped field is a structured scope+threshold picker, not one field named "Authority" (QA-6, r5) |
| `add-sheet.spec.ts:145` (trade-required alert) | FAIL | test bug — `role=alert` collides with Next's route announcer (QA-11, r5) |
| `person-card.spec.ts:51` task 4 | FAIL | phone-collision fixture gap (QA-10) |
| `person-card.spec.ts:111` R-V | FAIL | same, unchanged |
| `add-client-letter.spec.ts` — both | FAIL | orthogonal spec requiring the local edge-function runtime container (QA-12, r5) |

No regression, no new e2e failure across nine fix rounds (r6–r14) that touched product code.

---

## 2. Fresh findings (QA-R15-#)

**None.** No blocking, major, or minor finding surfaced this round that was not already on record
from a prior round. See §4 for the acceptance-string sweep and §3 for the re-check of every prior
finding.

---

## 3. Prior findings — re-checked live this round

| ID | Round | This round's read |
|---|---|---|
| CR14-1 (Call Sheet spoke column-head vocabulary — Chidi Okonkwo "Client Rep", Dana Kowalski "Subcontractor · Electrical") | r14 fix | **HOLDS.** Live Call Sheet, Okonkwo residence, both widths: Chidi Okonkwo reads "HOUSEHOLD MEMBER" (case is CSS `text-transform: uppercase` on the row, the underlying word is correct per the fix's own documented residue), Dana Kowalski reads "SUB · ELECTRICAL". Confirmed in the full-page screenshot and the `body.innerText` dump at both 1440 and 390 |
| QA-R13-1 (a consent record's origin project disagreed between the Directory and the roster) | r13/14 fix | **HOLDS.** Pete Rusk's opted-out sentence reads "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." on BOTH the Directory row and the Call Sheet roster row this round — the two surfaces now agree |
| QA-R13-2 (site access card never printed the project's street address) | r13/14 fix | **HOLDS.** "4412 Fremont Ave S, Minneapolis MN 55409" prints under "Site access · Okonkwo residence" at both widths |
| QA-R13-3 (Who was told held one entry, not SPEC's two) | closed by SPEC amendment | **HOLDS as amended.** Live card prints exactly one entry ("The way in changed 16 Oct 2026, by Leah Hartwell. Told: …"), matching the now-amended SPEC §5.6 #7 acceptance for the SHIPPED face |
| QA-R13-4 (Northgate Electric's company card omits warranty clause and tax-id line) | never assigned/fixed | **STILL OPEN.** Header reads "Electrical sub · 1 person · 2 projects" (no "warranty through …"); Payee region reads "No remit-to on file." / "Retainage 10%" (no "Tax id ending …"). `warranty_until` / `tax_id_last4` still NULL in the seed. Seed-completeness, not a fresh code defect |
| QA-R13-5 (Beck + Rowe Architects's malformed possessive in the Chase-the-renewal sentence) | never assigned/fixed | Not re-visited this round (walk did not open that firm's card); no regression signal either way |
| QA-R13-6 (site access key-holder line prints "TEXTING (612) 555-0106" instead of SPEC's "Text only, (612) 555-0106") | never assigned/fixed | **STILL OPEN,** confirmed at both widths this round: `Ngozi Eze holds a key. TEXTING (612) 555-0106` |
| QA-R13-7 (two console errors fire on every fresh sign-in, before `/people` is ever opened) | never assigned/fixed | **STILL PRESENT, identical to r13,** both widths this round: `TypeError: Failed to fetch` (session read) and `Error logged: AppError: Not authenticated` (pre-navigation `/desk` query). No further console errors or hydration warnings on any of the seven states walked, either width |
| QA-R13-8 (live seed's own prose vs. SPEC's literal fixture text — informational) | not a finding | Reconfirmed: 40 people · 21 firms (vs. SPEC's literal 29 · 22), per-record rule/consent prose reads the seed's own typed text. Structural/code-owned strings (headings, act labels, the four word-family vocabularies, R-Q's template shape, R-P's fixed Paper order, the eight-kind switch) all print correctly — see §4 |
| CR14-38 (the studio's own principal/lead designer/bookkeeper and both homeowners print "Not on file" paper word) | open, needs a ruling | **HOLDS**, reconfirmed live: Adaeze Okonkwo and Chidi Okonkwo both print paper word `NOT ON FILE` on the Directory. Not re-reported as a fresh finding — already on record, ruling owed, not a code defect per CR14-38 |
| C13/C18/C21/R-A (lender/inspector firms and people carry no paper word) | settled | **HOLDS.** Great Northern Bank and City of Minneapolis, CPED Inspections firm rows print no paper word and no payee marker; Carol Nyström and Ray Thao (both inspector/lender-side people) print reach + consent only, no paper word |
| R-S/R-T/C29/C30 (blocked clause and opted-out note visible on the COLLAPSED roster row) | settled | **HOLDS.** Dana Kowalski's held clause, Pete Rusk's opted-out note, and Frank Bauer's routed do-not-contact clause (with Rosa Delgado's email and tel-linked office phone) all print on their collapsed roster rows without needing an unfold |
| R-Y (duplicate band, two named doors, no Compare & merge act) | settled | **Cannot fire on this seed** — reconfirmed CR14-42's finding that no two person cards share a `phone_e164` in the current dev seed. Not re-reported (pre-existing, documented seed gap, not a W2 code defect) |
| R-BM (bring-forward stops at the single-add picker; picker prints kind/trade vocabulary, not firm/trade) | settled, W3 scope | **HOLDS.** "From the rolodex" opens a single-add picker with kind-filter chips (ALL, GENERAL CONTRACTOR, SUBCONTRACTOR, …), a "Worked N prior project(s)" history line per row, and "ADD SOMEONE NEW" — no multi-select travel-list pane. Walked no further, per the task's own instruction |
| `disabled` attribute anywhere on Directory/Person/Company | settled | **0 of 0** at 1440, scripted via `document.querySelectorAll('[disabled]').length` on all three states |
| `StatusDot`-style bare colour dot | settled | **0** matches for `[class*="StatusDot"]` / `[class*="status-dot"]` on the Directory |
| Forbidden schema/UI words on a face | settled | Scripted grep over all thirteen `body.innerText` dumps (both widths × Directory/Person/Company/Roster/Access/Add/Pick) for `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `lorem ipsum`, `TBD`, `dashboard`, `wizard`, `badge`, `pill`, `modal`, `toast`, `spinner`, `CRM` (as a visible word) — **no hits** |

---

## 4. SPEC §5 acceptance-string sweep, this round

Checked directly against the live build's rendered text at both widths, HEAD `e6aa10bdd`.
Per-record prose that legitimately differs because the live seed is not the literal SPEC fixture
(names, exact dates, exact rule wording, the head count) is not re-listed as missing, consistent
with r13's own ruling on this (QA-R13-8).

**Present and correct, confirmed this round (structural/code-owned strings):**

- §5.1 — six chips in order (Everyone, Clients, Crew, Makers, Studio, Firms); MINE/STUDIO lens,
  STUDIO pressed; a person row's exactly three bordered word columns (reach, consent, paper) at
  1440, three plain inline words at 390; Ray Thao's and Carol Nyström's rows carry no paper word
  (inspector/lender exemption); Frank Bauer's row carries no phone and the routed clause with Rosa
  Delgado's email and tel-linked office phone; every phone rendered `tel:`-linked.
- §5.2 — person card region order "Channels", "Contact rule", "Access grants" under "Reach &
  access"; the held-channel treatment (rail ground, terracotta leading rule, reason in words) on
  Dana Kowalski's dead email line; the R-Q consent-sentence template; "Seats on projects" /
  "Past seats" / "Paper" / "History" all present with the sole-proprietor Paper region; "Send a
  text" act enabled with its consequence sentence above it; zero `disabled` attributes.
- §5.3 — company card region order "Crew & designations" / "Reach & access" / "Paper" / "Payee" /
  "Jobs" / "History"; the Paper region's fixed order (table → leading-rule clause → consequence
  sentence → act row, R-P/C26) on Northgate Electric; no consent word and no reach word anywhere on
  the card; the §5.3 #7 amended sentence "Waiver ledger and draw state, in the money book." printed
  with no control (R-B/CR9-3).
- §5.4 — "Call sheet · Okonkwo residence" head; the site-access fold line printed verbatim: "Key
  held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026."; Studio side / Client side
  / On the job · this week / On the job · later / Bidding / Done bands, correctly populated and
  ordered against the live seed's own engagements; the word "Remove" appears nowhere — closing acts
  read "Close this seat" everywhere checked.
- §5.5 — the Add sheet's eight-word kind switch, exact order and wording: a client, a household
  member, a maker, a GC, a sub, an installer, a receiver, someone else.
- §5.6 — "Site access · Okonkwo residence" head; the address line; "Who to call first" region with
  `tel:`-linked entries; "The way in" with no code digits anywhere; "Hours"; "Receiving"; "Who was
  told" (one entry, per the SPEC amendment); "Studio only. This card never reaches a client page."

**Missing/mismatched, verbatim (both carried forward from round 13, unchanged):**

- §5.6 #4 — "Text only, (612) 555-0106" — live prints "TEXTING (612) 555-0106" (QA-R13-6).
- §5.3 #1 / #6 — Northgate's warranty clause and "Tax id ending 4417" line — both absent, seed gap
  (QA-R13-4).

---

## 5. Overflow

`document.documentElement.scrollWidth > document.documentElement.clientWidth`, measured directly:

| State | 1440 | 390 |
|---|---|---|
| Directory | `false` | `false` |
| Person card | `false` | `false` |
| Company card | `false` | `false` |
| Roster (Call Sheet) | `false` | `false` |
| Site access card | `false` | `false` |
| Bring-forward pick | `false` | `false` |
| Add sheet | `false` | `false` |

No horizontal overflow on any of the seven states, either width.

---

## 6. Console errors and hydration warnings

Identical two-error pair at both widths, matching QA-R13-7 (orthogonal, pre-existing session-
hydration race, not investigated further this round):

```
TypeError: Failed to fetch  (…/_next/static/chunks/2290-….js — Supabase auth session read)
Error logged: AppError: Not authenticated  (a React Query fetch on /desk, pre-navigation)
```

No further console errors, warnings, or hydration warnings on any of the seven states walked, at
either width.

---

## 7. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → "Add person" and Call Sheet → "New person" both open the Add sheet, kind switch + typed channels + contact-rule field all present | PASS | `qa-w2-r15/live-1440-add.txt`, `live-390-add.txt`; e2e failure is QA-10 (phone-collision fixture), not a fresh defect |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Call Sheet Client side prints Chidi Okonkwo, "HOUSEHOLD MEMBER · Signs money to $2,500. Approves change orders to $2,500. Certifies draws." — the authority fact is recorded and visible; the vocabulary fix (CR14-1) confirmed live | PASS, same caveat as r13 (Add sheet's authority capture is a structured scope+threshold picker, not a field literally labelled "Authority" — QA-6, unchanged) | `qa-w2-r15/live-1440-roster.txt` |
| 3 | Who has site access right now | Call Sheet → "Open the site access card", one click | PASS — address present (QA-R13-2 fix holds), "Who was told" prints one entry per the SPEC amendment; key-holder line still reads "TEXTING …" instead of "Text only, …" (QA-R13-6, MINOR, carried) | `qa-w2-r15/live-1440-access.txt`, `-state-access.png` |
| 4 | Frank Bauer do not contact, routed to Rosa | Live on the Directory row and the roster row (collapsed, per C29/R-S), both with Rosa's email and tel-linked office phone | PASS | `qa-w2-r15/live-1440-directory.txt`, `live-1440-roster.txt` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo | "From the rolodex" opens the single-add picker (kind chips, mini rows with reach/consent/paper words, one history line, no verdict) — stops short of the multi-select travel-list pane, W3 scope per R-BM | PASS (to the scope owed) | `qa-w2-r15/live-1440-pick.txt`, `-state-pick.png` |
| 6 | Everyone on Okonkwo by role, this week | Call Sheet opens already banded: Studio side (2), Client side (2), On the job · this week (10), On the job · later (10), Bidding (1), Done (1) | PASS | `qa-w2-r15/live-1440-roster.txt` |

---

## 8. Files

`build/qa-w2-r15/` (force-added — the directory is `.gitignore`d):

- Full-page screenshots: `live-{1440,390}-state-{directory,person,company,roster,access,pick,add}.png`.
- Raw `body.innerText` dumps for every state above, both widths.
- `console-1440.txt`, `console-390.txt` — full console-error capture, both widths.
- `overflow-{1440,390}-{directory,roster,access}.txt`, `overflow-{1440,390}-all.json` — direct
  `scrollWidth`/`clientWidth` measurements for person, company, pick, add.
- `sweep-1440.txt` — `disabled` count, `StatusDot` count, `tel:` link count, live-region count,
  a word-column border sample, all via `document.querySelectorAll`.

---

## 9. Summary

**CLEAN** — 0 BLOCKING, 0 MAJOR, 0 fresh MINOR. Two pre-disclosed MINOR findings from round 13
(QA-R13-4 seed-completeness, QA-R13-6 key-holder line wording) remain open and are carried forward
unchanged, not fresh regressions. One pre-existing orthogonal MINOR (QA-R13-7 console errors) is
unchanged. Round 14's CR14-1 fix (the Call Sheet's seat vocabulary — "household member" /
"sub · electrical" rather than "Client Rep" / "Subcontractor · Electrical") is independently
confirmed live on both named cards. Zero forbidden strings, zero broken states, zero
unreachable/inert acts, zero horizontal overflow across all seven states at both widths, zero
`disabled` attributes observed, zero site-access code fields, zero consent writes attempted or
observed outside the documented RPC set. `e2e/people` holds its round-5/round-13 11-passed/8-failed
signature with no new failure. Server stopped by PID; port 3000 confirmed free at hand-off.
