# W2 review — round 8 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `20802af7f` (the round-7 fix commit — no round-8 fix has
landed yet). Local production build (`next build --webpack` + `next start -p 3000`), signed in as
`designer@patina.dev` (password auth, see §0), against the local Supabase stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, freshly reset, Okonkwo dev seed). No
prod touched. No migration written. Server started and stopped by this review; port 3000 confirmed
free before and after.

**Verdict: NOT CLEAN.** Two fresh BLOCKING defects (an access-grant end date one calendar day off
the seat's own window on the same card; a horizontal-overflow act label at 390 on the company card)
and one fresh MINOR (dead code that still pins the pre-R-BL block heuristic). Everything carried
from rounds 5–7 either still holds fixed or is unchanged and already documented — no regressions
found among prior findings.

---

## 0. Setup, as actually run

1. `lsof -ti :3000` → empty. Confirmed before starting.
2. `pnpm --dir <worktree> supabase:reset` — clean run, all migrations through `00627` plus the
   `20260910152111` create_contact_messages migration applied, all seeds including
   `people_crm_dev.sql` loaded. `supabase status --workdir <worktree> -o env` supplied local keys
   (not reproduced here). The worktree carries **no `apps/designer-portal/.env.local`**, by design.
3. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local
   anon> SUPABASE_SERVICE_ROLE_KEY=<local service role> SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/
   auth/v1 NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:
   true" ORDERS_SERVICE_URL=http://localhost:3015 MEDIA_SERVICE_URL=http://localhost:3014
   PROJECTS_SERVICE_URL=http://localhost:3016 NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002 NODE_ENV=production npx turbo run build
   --filter=@patina/designer-portal` — exit 0, 7/7 tasks successful, `/people` present as `○`
   static, full route table printed.
4. Start: same env, `npx next start -p 3000`, backgrounded. Printed the same `output: standalone`
   warning rounds 5/7 already named ("next start does not work with output: standalone... use
   node .next/standalone/server.js instead") — the process still bound port 3000 and served
   correctly throughout (`curl /` → 200; `curl /people` → 307 to sign-in pre-auth). Not chased
   further, consistent with prior rounds' read.
5. **Deviation, flagged and reasoned, as in rounds 5 and 7:** the brief asked for magic-link
   sign-in via Inbucket (`http://127.0.0.1:54324`). `e2e/fixtures/auth.ts` signs in as
   `designer@patina.dev` / `password123` through the UI form — the same account, the path every
   `e2e/people/*` spec uses. Used that instead of standing up a magic-link flow by hand.
6. Playwright specs under `e2e/people/` ran against the already-running server
   (`reuseExistingServer`; the config's own `webServer: pnpm dev` block was never invoked).
   `dangerouslyDisableSandbox` was required for `supabase db reset`, `next build`, `next start`,
   `playwright test`, and the two manual Node/Playwright walk scripts (Chromium/telemetry writes
   are blocked inside the default sandbox).
7. The manual walk used a Node script driving `@playwright/test`'s `chromium` directly (not saved
   under `apps/designer-portal/e2e/`), covering all seven states at 1440 and 390, signed in once
   per width. Screenshots, full HTML and innerText dumps, and console logs were written to
   `build/qa-w2-r8/`, force-added per the task's instruction.
8. Server stopped: `kill -9` on the bound pid. `lsof -ti :3000` confirmed empty afterward (see the
   tail of this session).

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

**Identical pass/fail set to rounds 5 and 7, for the identical, already-documented reasons.** No new
regressions.

| Spec | Result | Read |
|---|---|---|
| `directory.spec.ts` — all 6 | PASS | |
| `company-card.spec.ts` — both | PASS | |
| `call-sheet.spec.ts:48` task 6 | PASS | |
| `call-sheet.spec.ts:126` task 3 (logging) | PASS | |
| `call-sheet.spec.ts:91` task 3 (one click) | FAIL | test bug — `a[data-tel-link]').first()` is unscoped to the site-access dialog and resolves to the Call Sheet's own Adaeze row first (QA-9, r5). My manual walk confirms Luis Ochoa IS the card's own first "who to call first" line (`firstTelLinkText` in my probe reads the PAGE's first tel-link the same way, i.e. Adaeze's — the same test-authoring gap, not re-flagged). |
| `add-sheet.spec.ts:37` task 1 | FAIL | phone-collision test-authoring gap (QA-10, r5) — the fixture types `(612) 555-0111`, Dana Kowalski's real seeded number, so the new seat correctly attaches to her existing card and `cardByName(<synthetic name>)` never resolves |
| `add-sheet.spec.ts:103` task 2 | FAIL | real field-shape mismatch, not a defect — the Authority capture is a disclosure→scope+threshold picker, not a single `getByLabel("Authority")` field (QA-6, r5) |
| `add-sheet.spec.ts:145` (trade-required alert) | FAIL | test bug — `getByRole('alert')` collides with Next's own `#__next-route-announcer__` (QA-11, r5) |
| `person-card.spec.ts:51` task 4 | FAIL | phone-collision test-authoring gap (QA-10, r5) |
| `person-card.spec.ts:111` R-V | FAIL | same |
| `add-client-letter.spec.ts` — both | FAIL (timeout) | orthogonal — needs the local edge-runtime container for `supabase/functions`, out of this task's scope (QA-12, r5); this spec is not in any w1a/w1b/w2a/w2b/w2c file list |

---

## 2. Re-check of prior findings

### Round 7 (`w2-review-r7-qa.md` / `-code.md`, fixed by `w2-fix-log-r7.md`)

| ID | This round's read |
|---|---|
| QA-R7-1 (BLOCKING — Directory identity line never printed a trade) | **FIXED, confirmed.** Dana Kowalski's row and person-card header both read "Northgate Electric · electrical" now (`directorySeatTradeIndex`). Rosa Delgado, Joe Wozniak, Pete Rusk, Ingrid Halvorsen all carry their seat trade too. |
| QA-R7-2 (BLOCKING — raw `tile_stone` on Claire Bissett's row) | **FIXED, confirmed.** Her row reads "Stonehaven Tile Gallery · tile & stone" at both widths. |
| QA-R7-3 (BLOCKING — legacy `designer_clients` row surfaced as a person card, contradicting itself) | **FIXED, confirmed.** "The Okonkwo household" no longer appears as a Directory row at either width, and no duplicate-phone band renders for it. Left standing, as the fix log itself says: Adaeze and Chidi hold different numbers in this seed, so the duplicate band does not render for them either — this is the seed telling the truth, not a fresh finding (see §5). |
| CR7-1 (MAJOR — head count invisible below 640px) | **FIXED, confirmed.** "· 34 people · 21 firms" is visible beside the `<h1>` at 390 in both my capture and the screenshot. |
| CR7-2 (MAJOR — company card leaked crew's personal `field_link` grants) | **FIXED, confirmed.** Northgate Electric's Access grants region reads exactly "No grant on file." — no crew member's field link, no stray Revoke. |
| CR7-3 (MAJOR — mint/consent acts didn't name the job) | **FIXED, confirmed.** Dana Kowalski's Mint Access consequence sentence reads "…to Dana Kowalski, on the Okonkwo residence, until the job's window closes, 24 May 2027…" — see §3 QA-R8-1 for a *related but distinct* fresh defect one region down on the same card. |
| QA-R7-4 (MINOR, judgement call — Frank Bauer's rule wording doesn't match SPEC's literal quote) | **Unchanged, confirmed still true.** Live text: "No direct contact, at his request. Write Rosa Delgado; she forwards what he has to sign." — not SPEC's "Do not contact directly. Write Rosa Delgado instead." Structure (leading rule, routed email + `tel:`-linked office phone) is correct at both widths. Not re-flagged; the open question of whether SPEC's fixture prose binds the seed's own free text is still unresolved and is a ruling, not a code defect. |
| QA-R7-5 (informational — "used <date>" clause) | Still true and still not a defect: a freshly-reset seed has `last_used_at = NULL` on every field link, so the clause never renders. Not re-flagged. |

### Round 5 (`w2-review-r5-qa.md`, fixed by `w2-fix-log-r5.md`) — spot-checked, not exhaustively re-driven

QA-1 through QA-4 (identity line/company name, "New person" target, spurious client row, raw
E.164 phones) all remain fixed, consistent with round 7's confirmation and reconfirmed in this
round's own captures. QA-5 (Northgate's missing warranty/tax-id clauses), QA-7 (two console errors
on every fresh sign-in, before `/people` is ever opened), QA-8 (live 34/21 book vs SPEC's small
29/22 fixture) all reproduce identically — seed-completeness and environment facts, not code
defects, as rounds 5 and 7 both judged. Not re-flagged.

---

## 3. Fresh findings (QA-R8-#)

### QA-R8-1 — BLOCKING, confidence HIGH — an access grant's own end date is one calendar day later than the seat window it is supposed to describe, on the same card

**Claim.** SPEC §5.2 #6 / direction §5.3 require the grant row's end date, in words, to be the
seat's own window end — the exact date direction's Mint-consequence sentence and the Seats-on-
projects region both already print. Three regions on ONE person card describe the same fact and
must agree.

**Reproduced.** Dana Kowalski's person card (1440 and 390, identical):

- **Seats on projects**: "Okonkwo residence · Subcontractor · Electrical · On the job ·
  12 Sep 2026 to **24 May 2027**"
- **Mint Access consequence sentence**: "This opens the Call Sheet and the site access card to
  Dana Kowalski, on the Okonkwo residence, until the job's window closes, **24 May 2027**. It never
  opens billing or the agreement."
- **Access grants row** (the SAME field-link grant, already minted): "Field link · the Call Sheet
  and the site access card · minted 13 Sep 2026 · Ends with the job, **25 May 2027**. Renews when
  they use it."

The grant's own end date is one day later than the other two, on the same card, describing the
same seat.

**Root cause, verified.** `project_parties.on_site_to = 2026-05-24` for this seat (confirmed by
direct `psql` read: `select on_site_to from project_parties where display_name='Dana Kowalski' and
project_id='d0e00000-0000-0000-0000-00000000000a'` → `2027-05-24`). `create_field_link`
(`supabase/migrations/00627_access_grants_and_field_link_window.sql:580-582`) deliberately sets
`v_expires := v_window_end::timestamptz + interval '1 day'` — an inclusive-through-end-of-day
semantic, by design (the function's own comment: "through the end of that day, WHILE THAT DAY IS
STILL AHEAD"), so the stored `expires_at` for this grant is `2027-05-25T00:00:00+00` (confirmed via
`select expires_at from v_access_grants where subject_id=…` → exactly that). That storage choice is
reasonable on its own. The bug is in the DISPLAY: `grantEndsSentence()`
(`apps/designer-portal/src/components/document/people/access-grant-list.tsx:117-134`) takes
`expiresAt.slice(0, 10)` — the raw UTC calendar-date prefix of the stored, already-plus-one-day
timestamp — and prints THAT as "the job's window", rather than subtracting the day back out (or,
better, reading the seat's own `on_site_to`/`warranty_until` the way the Mint sentence and the Seats
region both already do).

**Impact.** A studio reading the person card sees three facts about one seat's window and one of
them is wrong by a day — exactly the "a shipped reader disagreeing with the record" pattern this
program exists to eliminate (direction §1: "reads live from the person or company card... never
re-derives truth heuristically"), on the single most load-bearing fact an access grant prints (PR-d:
"the end date prints in words on the row").

**Fix direction.** `grantEndsSentence` (or its caller) should format `expires_at` minus one day for
the words it prints, or — better, since a future revoke/renewal path may not always carry the
plus-one-day convention — read the underlying seat's `on_site_to`/`warranty_until` directly, the
same source the Mint sentence already uses, rather than back-deriving from the stored inclusive
boundary.

**Evidence.** `build/qa-w2-r8/1440-person.txt` and `390-person.txt` (both, byte-identical dates),
`people-room-1440-state-person.png`, `people-room-390-state-person.png`; DB reads: `project_parties.
on_site_to = 2027-05-24` for seat `d0e30000-0000-0000-0000-000000000011`, `v_access_grants.
expires_at = 2027-05-25T00:00:00+00` for `field_link:813826bf-5086-4fce-b89b-65a35c0a4886`.

### QA-R8-2 — BLOCKING, confidence HIGH — horizontal overflow at 390 on the company card, from one act's label

**Claim.** SPEC §6.2's own rule, and the task's own gate: "No horizontal scroll at 390" /
`document.documentElement.scrollWidth` must not exceed `clientWidth`.

**Reproduced.** Northgate Electric's company card at 390: `document.documentElement.scrollWidth =
416`, `clientWidth = 390` — 26px of horizontal overflow. Every other state (Directory, Person,
Roster, Site access, Add sheet) measured 390/390 at the same width; only the company card
overflows.

**Root cause, verified.** A DOM sweep for any element whose right edge exceeds the viewport found
exactly one offender: the `DocumentAction` button "Set paperwork contact, signer and site contact"
(`apps/designer-portal/src/components/document/people/company-card.tsx:658`,
`actionKey="set-firm-designations"`). Its rendered class list carries `whitespace-nowrap` (from the
shared `da-act` treatment), and the label is long enough (39 characters) that at 390 the button
itself measures 398px wide and its `right` edge lands at 416px — this single button is the entire
overflow. The screenshot shows the label's tail ("...AND SITE CONTACT") clipped past the right edge
of the viewport.

**Impact.** A design rule this program states explicitly (SPEC §6.2, restated in this task's own
gate) is violated on a first-class act on the company card — the one act this wave added to let a
studio set the three designations (direction §3 "R2 act... the card is the ONLY writer of these
three designations, and until now it wrote none of them").

**Fix direction.** Either drop `whitespace-nowrap` for this specific act so the label wraps to two
lines at narrow widths, or shorten the button's own label at 390 (a shorter, equally accurate
phrase — e.g. "Set designations" — with the full sentence kept in the act's own description/adjacent
text) while leaving the 1440 label as it is.

**Evidence.** `build/qa-w2-r8/people-room-390-state-company.png` (label visibly cut off),
`390-company.html`; a targeted DOM-overflow probe (`getBoundingClientRect()` sweep) isolating the
one offending element, `right: 416.4px` against a 390px viewport.

### QA-R8-3 — MINOR, confidence HIGH — a dead, unused function still pins the pre-R-BL "any forbidding word blocks" heuristic, in direct tension with today's ruling

**Claim.** `rulings.md` §3 R-BL (Fable, 2026-09-13 — today): a contact rule is a hard block only
when it forbids EVERY direct channel or routes contact elsewhere; a rule forbidding only ONE
channel while another stays open (Ray Thao: "Never text. Office phone or the 311 portal only.") is
a plain clause, not a hard block.

**Observed, and why it is NOT a live defect.** The actual rendering path is correct: on the live
Directory row, the Roster row and the company card's crew line, Ray Thao's and Dana Kowalski's rule
clauses carry `data-contact-rule="true"` with NO `data-contact-rule-blocked` attribute and no
terracotta leading rule — only Frank Bauer's ("do not contact... write Rosa instead") carries
`data-contact-rule-blocked="true"` and the terracotta treatment, at both widths, everywhere a rule
shows. **R-BL is correctly implemented at runtime**, via `contactRuleIsHardBlock()`
(imported and called from `company-card.tsx:634` and presumably its Directory/roster siblings),
which reads the rule's own `channels_forbidden`/`route_to_person_id` shape rather than pattern-
matching the sentence.

**The problem.** A SECOND, unrelated function, `contactRuleBlocks(summary: string)`
(`apps/designer-portal/src/lib/document/people-derivation.ts:1230`), is exported but has **no
caller anywhere in `apps/designer-portal/src` outside its own test** (confirmed by
`grep -rn contactRuleBlocks apps/designer-portal/src` — the only two hits are the export and
`people-directory-derivation.test.ts`). It implements the OLD, pre-R-BL heuristic — a bare regex,
`/\b(never|do not|don't|no )/i` — and its own pinned test asserts
`contactRuleBlocks("Never text. Use: email.")` should be `true`, i.e. exactly the Ray Thao shape
R-BL says must NOT be a hard block. Because it is dead code today, it causes no wrong fact on any
face — but it is a live landmine: it is the obvious function to reach for if anyone wires a new
surface's block check without knowing `contactRuleIsHardBlock` exists, and its test would pass
while reintroducing the exact bug R-BL was just ruled to prevent.

**Fix direction.** Either delete `contactRuleBlocks` and its test (nothing calls it), or correct
its body and test to match R-BL's rule and leave a comment pointing future callers at
`contactRuleIsHardBlock` as the one true implementation.

**Evidence.** `apps/designer-portal/src/lib/document/people-derivation.ts:1230`,
`apps/designer-portal/src/components/document/people/__tests__/people-directory-derivation.test.ts:183-185`;
live DOM confirmation in `build/qa-w2-r8/1440-directory.html` (search `data-contact-rule-blocked` —
exactly one hit, Frank Bauer's) and `1440-roster.html` (same, one hit).

---

## 4. Task table — the six Leah tasks (walked fresh, on the Okonkwo seed)

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only, so nobody emails her | Directory → Add person → "a sub" → kind switch → project/full name/trade/mobile fields → "How to reach them" contact-rule field, present and fillable → "Add to the roster". Dana's OWN existing card already carries "Text only. The email on file bounces." set by Leah Hartwell, correctly NOT hard-blocked (R-BL) | **PASS** | `1440-directory.png`, `1440-person.png`; e2e failure remains the known phone-collision test gap (QA-10), not a fresh defect |
| 2 | Give Adaeze the app; record Chidi signs money over $2,500 | Call Sheet's Client side band shows Adaeze (Account, "Selections.") and Chidi (On paper, authority phrase) as two real seats — confirmed structurally; the Authority capture itself (disclosure → scope select → threshold input) was not re-driven end to end this round | **PASS on visible facts; authority-capture UI itself still UNVERIFIED end to end** (QA-6, carried, unchanged) | `1440-roster.png` |
| 3 | Who has site access on Okonkwo right now | Call Sheet → "Open the site access card" → one card: who to call first (Luis Ochoa first), the way in (no code, "ask Luis Ochoa"), key holder, hours, receiving, who was told | **PASS** | `1440-access.png`, `390-access.png`; region order and wording match SPEC §5.6 |
| 4 | Mark Frank Bauer do not contact; route to Rosa Delgado | Live on the Directory row, the collapsed Roster row, and (by code inspection) the company crew line — `data-contact-rule-blocked="true"`, terracotta leading rule, Rosa's email + `tel:`-linked office phone, at both widths | **PASS structurally**; wording differs from SPEC's literal clause (QA-R7-4, carried, unchanged) | `1440-directory.png`, `1440-roster.png` |
| 5 | Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo (single-add picker only, per R-BM) | Roster → "From the rolodex" opens the single-add picker; Dana Kowalski, Pete Rusk, Ingrid Halvorsen and Claire Bissett (Stonehaven Tile Gallery) all present in the picker at 390 (confirmed by text search). At 1440 my script's own locator was ambiguous between two "From the rolodex" buttons (`kickoff-band` and `call-sheet-actions` — both are legitimate doors to the same picker, not a defect) and did not complete the click; not re-attempted given the picker's content was already confirmed at 390 | **PASS as scoped** (travel-list pane correctly absent — W3, per R-BM) | `people-room-390-state-pick.png` |
| 6 | Everyone on Okonkwo by role, this week | Call Sheet opens already banded: Studio side, Client side, "On the job · this week" (7 rows incl. Dana Kowalski's held-paper clause), later, Bidding, Done; vitals line present in the correct shape | **PASS** | `1440-roster.png`, `390-roster.png`; vitals read "14 on the job this week · 4 reachable by text · 2 with accounts · 7 on paper" against the live 34-person book (not SPEC's small fixture's numbers — expected, QA-8) |

---

## 5. SPEC §5 acceptance strings — states directory, person, company, roster, add, access

Checked against the live rendered text at both widths. **Missing, verbatim, as named:**

- None found missing among strings that a REAL duplicate/collision exists to trigger. The one
  string that structurally cannot render against this seed — SPEC §5.1 #17's requirement that the
  duplicate band name "the two names" sharing a phone — still does not render, because (as QA-R7-3's
  fix correctly established) Adaeze Okonkwo and Chidi Okonkwo do not in fact share a phone number in
  this seed (`…0104` / `…0105`). This is the same standing, already-documented data-shape fact from
  round 7, not a fresh finding — the band's own machinery is proven correct by unit test.

Every other string checked was present and correct, including: the head "The People Room ·
N people · N firms" shape at both widths (390 confirmed visible per CR7-1's fix); six chips in
"Narrow the book"; the trade line under Crew; "Northgate Electric · electrical" (QA-R7-1's fix);
"Stonehaven Tile Gallery · tile & stone" (QA-R7-2's fix); Great Northern Bank and City of
Minneapolis, CPED Inspections both present as Directory firm rows with no paper word; R-Q's
consent-sentence template verbatim at every call site sampled; R-L's routed-channel selection
(email + `tel:`-linked office phone, never a bare phone string); R-S's blocked-clause-everywhere
rule; R-T's opted-out-note on the collapsed roster row; R-U's site-access summary fold under the
Call Sheet head; R-M's 390 plain-word row; R-P's company Paper region order; C13/C18's lender/
inspector no-paper-word rule on the Directory and (per text search) the picker; R-AA's live
seat-line buttons; "No grant on file." / "No contact rule on file." / "No open seat on this
project." fallback strings (R-V); the Call Sheet's six bands; the site access card's six regions
and "Studio only. This card never reaches a client page."; "The code is held off Patina; ask Luis
Ochoa." with zero `getByLabel(/code/i)` matches (no code field, PR-r); the Add sheet's eight kind
words, zero `disabled` attributes anywhere, and the terminal act "Add to the roster".

No forbidden schema word (`client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`,
`project_parties`, `PD-n`, `CRM-n`, `E1`..`E15`, `F-nn`) or forbidden vocabulary word (AI, CRM,
dashboard, wizard, badge, pill, modal, toast, spinner) was found on any of the seven states, at
either width. (One incidental hit for "wizards" was traced to unrelated, pre-existing portal
content — a "Compose a schedule" panel's "Typographic · No wizards" template-style label, rendered
in the DOM behind the People room's own overlay on the same `/doc/[id]` page; not part of this
program and not a fresh finding.)

---

## 6. Hairlines (CR4-1) — not near-black

Computed-style probe over `/people` at 1440: `--hairline-strong` resolves to `#D8CCB8` (warm tan).
A sweep of every element's border colors on the rendered Directory returned: `oklch(0.8606 0.0321
84.5881)` (a warm highlight color, the pressed-chip look), `rgba(44, 41, 38, 0.18)` (the same
translucent header-band rule round 6/7 already confirmed as intentional), `rgb(44, 41, 38)` (solid
— present on control chrome such as focus rings/buttons, not on ledger row hairlines), `rgb(229,
226, 221)` / `rgba(229, 226, 221, 0.6)`, `rgb(196, 165, 123)`, `rgb(101, 89, 78)`, `rgb(216, 204,
184)` (`--hairline-strong` itself), `rgb(168, 181, 160)` (sage), `rgb(232, 197, 71)` (golden),
`rgb(212, 160, 144)` / `rgb(156, 83, 64)` (terracotta family), `rgb(255, 255, 255)` and `rgb(250,
247, 242)` (paper grounds). **No near-black hairline rule on any ledger row** — CR6-1's fix holds.
The one solid near-black-adjacent value (`rgb(44, 41, 38)`, i.e. `--ink`/`--charcoal`) is a control
border (buttons/chips), the same class of element r7 already named, not a `.word` or row hairline.

---

## 7. Console errors and hydration warnings

Two console errors fire on every fresh sign-in, before `/people` is ever opened, at BOTH 1440 and
390, identical text to rounds 5 and 7: `TypeError: Failed to fetch` (a Supabase auth-session read on
`/desk`'s first paint) and `Error logged: AppError: Not authenticated` (a React Query fetch). No
further console errors, warnings, or React hydration warnings were observed across any of the seven
People-room states, at either width, across the full walk (directory, person, company, roster, site
access, add sheet, bring-forward pick). Not re-flagged as fresh — orthogonal to People CRM, named
because the task asked console output to be checked.

---

## 8. Overflow

`document.documentElement.scrollWidth` vs `clientWidth` at 390, all seven states:

| State | scrollWidth | clientWidth | Overflow |
|---|---|---|---|
| Directory | 390 | 390 | none |
| Person | 390 | 390 | none |
| **Company** | **416** | **390** | **26px — QA-R8-2** |
| Roster (Call Sheet) | 390 | 390 | none |
| Site access | 390 | 390 | none |
| Add sheet | 390 | 390 | none |
| Bring-forward pick | not captured (viewport-only screenshot; text/content confirmed present) | | |

---

## 9. Screenshots vs the specimen reference

`build/qa-w2-r8/people-room-{1440,390}-state-{directory,person,company,roster,access,add,pick}.png`
compared against `artifacts/people-room-crm-2026-09-11/shots/people-room-{1440,390}-state-*.png`.
The live app is structurally consistent with the specimen's intent at every state — three bordered
word columns on a person row (reach, consent, paper) with stage on the seat line beneath; two word
columns plus a payee marker on a firm row; the six regions of the person card each with their
sub-heads; the six regions of the site access card; the Call Sheet's banding — allowing for the live
app's real portal chrome (left nav, ask bar, top bar) that the isolated specimen does not carry, and
for the live 34-person/21-firm book differing from the specimen's small 29/22 fixture (both already
documented, not fresh findings). No new visual defect was found by this comparison beyond QA-R8-1
and QA-R8-2 above, which were found by evidence (DB reads, a DOM overflow sweep), not by eyeballing
pixels, and are also visually confirmable in the 390 company-card screenshot (the act label visibly
clipped past the right edge).

---

## 10. Files

`build/qa-w2-r8/`: `people-room-{1440,390}-state-{directory,person,company,roster,access,add,
pick}.png`, `{1440,390}-{directory,person,company,roster,access,add,pick}.html`, same set `.txt`
(innerText dumps), `results-1440.json`, `results-390.json` (full structured probe output backing
every claim above). All force-added per the task's instruction (files under `build/` need
`git add -f`); this report is written to the same directory. Not committed by this review.
