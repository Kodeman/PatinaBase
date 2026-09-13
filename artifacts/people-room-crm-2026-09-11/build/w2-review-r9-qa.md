# W2 review — round 9 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `1b07d5517` (round-8 fix commit; working tree otherwise
clean). Local production build (`next build` + `next start -p 3000`), signed in as
`designer@patina.dev` via a real one-time-code email round-tripped through Mailpit
(`http://127.0.0.1:54324`), against the local Supabase stack (Okonkwo dev seed, freshly reset). No
prod touched. No migration written. Server started and stopped by this review; port 3000 confirmed
free before and after.

**Verdict: NOT CLEAN.** One MAJOR runtime finding (QA-R9-1, new) plus one still-open MINOR carried
unchanged from round 5 (QA-5) and one new MINOR (a documented-but-undelivered deep link). No
BLOCKING finding. See §2.

---

## 0. Setup, as actually run

1. `lsof -ti :3000` → empty. Confirmed before starting and after stopping.
2. `pnpm --dir <worktree> supabase:reset` → all migrations through `00627_access_grants_and_field_link_window.sql`
   and `20260910152111_create_contact_messages.sql` applied, all seeds including
   `supabase/seed/people_crm_dev.sql` (the Okonkwo fixture) replayed. Exit 0.
3. Local keys pulled via `supabase status --workdir <worktree> -o env` (not reproduced here per the
   task's own instruction).
4. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon>
   SUPABASE_SERVICE_ROLE_KEY=<local service role> NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
   NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true" NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002 ORDERS_SERVICE_URL=http://localhost:3015
   MEDIA_SERVICE_URL=http://localhost:3014 PROJECTS_SERVICE_URL=http://localhost:3016
   NEXT_PUBLIC_WS_URL=ws://localhost:3016 pnpm --filter @patina/designer-portal build` — exit 0, full
   route table printed, `/people` present as `○` static. (`the-document-pilot` is a retired flag per
   `apps/designer-portal/CLAUDE.md` — inert, harmless to pass.)
5. Start: same env, `next start -p 3000`, backgrounded. Same `output: standalone` warning rounds 5–8
   already named and judged non-blocking; `curl /api/version` → 200, `curl /people` → 307 to sign-in
   pre-auth, as expected.
6. **Sign-in method: the literal Inbucket/Mailpit path this round's brief asked for**, not the
   password fixture rounds 5–8 used. `/auth/signin`'s default flow ("Email me a one-time code") was
   driven end to end: filled `designer@patina.dev`, polled Mailpit's REST API
   (`GET /api/v1/messages`, `GET /api/v1/message/:id`) for the six-digit code, filled it into the
   code field. Landed on `/desk` every time, no retries needed. (The service is Mailpit, not
   Inbucket, despite the `INBUCKET_URL` env name and `config.toml`'s `[inbucket]` section — both
   point at the same `:54324` port and Mailpit's own REST API answered every time.)
7. Playwright specs under `e2e/people/` were run against the already-running server
   (`reuseExistingServer`); `dangerouslyDisableSandbox` was required for every `next build`/`next
   start`/`playwright test` call, per this repo's own documented Chromium-in-sandbox constraint.
8. The manual walk used temporary Playwright specs under `e2e/qa-*-r9.spec.ts`ran, then **deleted**
   before finishing — `git status` on `apps/designer-portal/e2e` is clean, and `test-results/` was
   removed.
9. A **found-in-the-doing methodology note, not a defect**: the task brief's `/doc/<id>?sheet=call`
   navigation does not open the Call Sheet (see QA-R9-3) — early attempts to drive the walk through
   that URL hung Playwright's locator wait for the full test timeout because the Call Sheet never
   rendered. The walk was corrected to open the Call Sheet the way a designer actually does — the
   "Call sheet" link in the document's left rail — and completed cleanly (37s) once corrected.
10. Server stopped: `kill -9` on the bound pid (required `dangerouslyDisableSandbox`). `lsof -ti
    :3000` confirmed empty afterward.
11. A parallel adversarial code-review pass for this same round already landed
    `build/w2-review-r9-code.md` (staged, not committed) with its own `CR9-#` findings — read for
    context, not duplicated here. Nothing below overlaps it.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

Identical pass/fail set, identical root causes, to `w2-review-r5-qa.md` §1 — **no regression, no new
failure** across rounds 6, 7, 8 or this one:

| Spec | Result | Read |
|---|---|---|
| `directory.spec.ts` — 6 tests | PASS | |
| `company-card.spec.ts` — 2 tests | PASS | |
| `call-sheet.spec.ts:48` task 6 | PASS | |
| `call-sheet.spec.ts:126` task 3 (logging) | PASS | |
| `call-sheet.spec.ts:91` task 3 (one-click) | **FAIL** | test bug — unscoped `a[data-tel-link]` locator resolves to the Call Sheet's own first row, not the site-access card (r5's QA-9, unchanged) |
| `add-sheet.spec.ts:37` task 1 | **FAIL** | test-authoring gap — the fixture types a real seeded phone number, so 00626's auto-link trigger correctly links to the existing card instead of minting a fresh one (r5's QA-10, unchanged) |
| `add-sheet.spec.ts:103` task 2 | **FAIL** | `getByLabel("Authority")` never resolves — the sheet renders a structured scope+threshold picker, not a single free-text field (r5's QA-6, still an open judgement call, unchanged) |
| `add-sheet.spec.ts:145` | **FAIL** | test bug — `getByRole('alert')` strict-mode-collides with Next's own route announcer (r5's QA-11, unchanged) |
| `person-card.spec.ts:51` task 4 | **FAIL** | same phone-collision test gap as QA-10 |
| `person-card.spec.ts:111` R-V | **FAIL** | same phone-collision test gap as QA-10 |
| `add-client-letter.spec.ts` — 2 tests | **FAIL** | orthogonal — this spec needs the local edge-runtime container serving this checkout's functions, which this task's scope does not stand up (r5's QA-12, unchanged); not in any wNa/w2N-report file list |

---

## 2. Findings (QA-R9-#)

### QA-R9-1 — MAJOR, confidence HIGH (NEW) — the "send a text" gate sentence undersells a full do-not-contact block as merely "never text," on both the person card and the roster row

**Claim.** R-BL draws an explicit line: a rule is a **hard block** only when it forbids every direct
channel (do-not-contact) or routes contact elsewhere; a rule forbidding only texting, with email or
phone still open, is a **plain clause**, not a hard block. Frank Bauer (F-15) is R-BL's own example
of the hard-block case: "Do not contact directly. Write Rosa Delgado instead." — every direct
channel forbidden, routed to Rosa Delgado.

**Reproduced.** Frank Bauer's live person card (`/people` → search "Frank Bauer" → open card) prints,
under Access grants, beneath the enabled "Send a text" act:

> "The studio's rule for this person says never text. Change the rule above before any text goes
> out."

This is the literal, unconditional `RULE_FORBIDS_TEXT_SENTENCE` constant
(`apps/designer-portal/src/components/document/people/views/person-profile.tsx:78`), gated only on
`contactRuleForbidsSms(rule)` (`lib/document/contact-rule.ts:126-129`) — which merely checks whether
`'sms'` is one of the `channels_forbidden` values. It returns `true` for Frank Bauer's rule (correct,
since sms IS among the channels his rule forbids), so the UI prints the "never text" sentence — the
same sentence a genuine single-channel case (e.g. a hypothetical "never text, email is fine" rule)
would get. Nothing in this code path distinguishes a hard do-not-contact block from a narrower
single-channel rule, even though `contactRuleIsHardBlock` / `contactRuleIsDoNotContact`
(`contact-rule.ts:110-113, 141-148`) already compute exactly that distinction elsewhere on the same
file, for the same rule shape.

**Impact.** A studio member reading "the rule says never text" on Frank Bauer's card could reasonably
conclude that emailing or calling him directly is fine — it is explicitly not (his own contact rule,
displayed two regions above this sentence, says "No direct contact... Write Rosa Delgado instead.").
The sentence also drops the routing instruction entirely, so a studio member acting only on this
sentence has no way to know Rosa Delgado is the door. This is a reader disagreeing with the record
it is standing three inches away from on the same card.

**Blast radius.** The identical unconditional string (`roster-derivation`-adjacent copy, same
wording) gates the Text act on the roster row:
`apps/designer-portal/src/components/document/roster/roster-row.tsx:251` —
`` `The studio's rule for ${row.name} says never text. Change the rule on their card first.` `` —
same predicate, same defect, for any hard-blocked identity who also holds a project seat. Frank
Bauer himself holds one (Okonkwo residence, Awarded), so his roster row carries this same
mischaracterization.

**Fix direction.** Branch the sentence on `contactRuleIsHardBlock(rule)` (already computed in this
file's neighborhood) rather than the single-channel `contactRuleForbidsSms(rule)`: a hard block
should name the actual rule ("do not contact directly — write `<name>` instead") rather than the
narrower "never text."

**Evidence.** `artifacts/people-room-crm-2026-09-11/build/qa-w2-r9/r9-1440-frank.html` (search "The
studio's rule"), `r9-1440-task4-person-frank.png`, `r9-1440-directory.html` (Frank Bauer's clause,
confirming the underlying rule text). Not previously reported: `grep -rl "says never text"
artifacts/people-room-crm-2026-09-11/build/*.md` finds only `w2-fix-log-r3.md`, the round that
introduced the constant (CR3-9) to fix a different bug (the rule outranking a live grant) — no round
since has named the wording itself.

---

### QA-R9-2 — MINOR, confidence HIGH (RE-CONFIRMED OPEN, unchanged since round 5) — Northgate Electric's company card still omits its warranty clause and tax-id line

**Claim.** SPEC §5.3 #1 wants the header "...warranty through 21 Nov 2026"; §5.3 #6 wants a
"Tax id ending ####" Payee line.

**Observed.** Unchanged from `w2-review-r5-qa.md`'s QA-5: the live card prints "Electrical sub · 1
person · 2 projects" (no warranty clause) and a two-line Payee region ("Remit to Northgate
Electric", "Retainage 10%" — no tax-id line).

**Root cause, re-verified as seed-completeness, not a code defect** — same as round 5: the
component prints-if-present (retainage does print), and `studio_contacts.warranty_until` /
`tax_id_last4` for Northgate Electric are still `NULL` in the replayed seed. `w2-review-r5-qa.md`
named this "flagged so the seed can be completed before the next round treats its absence as
'fixed'" — it was never assigned to a fix round (confirmed: not mentioned in `w2-fix-log-r6.md`
through `r8.md`), so it is carried forward open, not a regression.

**Evidence.** `r9-1440-company.html`, `r9-1440-company.png`.

---

### QA-R9-3 — MINOR, confidence HIGH (NEW) — `?sheet=call` does not open the Call Sheet; the wave report's own addressability claim does not hold on a fresh navigation

**Claim.** `synthesis/direction.md` §4's component table, under `CallSheet`, states as this
program's change: "Site access card at the head; `?sheet=call` becomes addressable while staying an
instrument (PD-6)." `w2c-report.md`'s own file list repeats the same clause verbatim for
`roster/call-sheet.tsx`.

**Reproduced.** `GET /doc/<Okonkwo id>?sheet=call` (a fresh full-page navigation, not a client-side
route change) renders the plain project document — Client approvals, Schedule, Pieces, Money,
Closing the book, The record — with the Call Sheet **not** open. `grep -rn "searchParams"
"apps/designer-portal/src/app/(document)/doc/[id]/page.tsx"` returns no hits at all; the Call Sheet
opens only via a `CustomEvent('document:open-call-sheet')`, dispatched by the "Call sheet" rail
link, ⌘K, or the kickoff band — never read back off the URL on mount.

**Impact.** A bookmarked or shared `?sheet=call` link lands the reader on the plain document, not the
Call Sheet — the opposite of what "addressable" promises. Every one of Leah's six tasks is still
reachable by clicking the "Call sheet" rail link (confirmed throughout this walk), so no task is
blocked; this is a documented-but-undelivered convenience, not a broken task.

**Evidence.** `r9-1440-task2-callsheet-clientside.png` shows the plain-document render behind the
navigation that named the query param; the code search above is definitional (zero hits).

---

### QA-R9-4 — INFORMATIONAL, not a defect — live counts and wording diverge from SPEC's static fixture, correctly

The live Okonkwo book reads "40 people · 21 firms" (SPEC's static specimen fixture reads "29 people
· 22 firms"), Adaeze/Chidi Okonkwo read reach `On paper` rather than the specimen's `Account`, and
Frank Bauer's contact-rule prose reads "No direct contact, at his request. Write Rosa Delgado; she
forwards what he has to sign." rather than the specimen's "Do not contact directly. Write Rosa
Delgado instead." — confirmed as the CORRECT, intentional dedup behavior
(`contact-rule-line.tsx:76-80`'s `alreadyRouted` check: the studio's own typed reason already names
Rosa, so the canonical `routedSentence()` is suppressed to avoid "house voice talking over the
studio"). All of this is the real dev seed disagreeing with the design session's illustrative
fixture, not the product disagreeing with the record. Named per r5's QA-8 precedent so it is not
re-discovered as a surprise next round.

---

## 3. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → search → open person card → Reach & access → Contact rule reads "Text only. The email on file bounces." live, sourced from `studio_contact_rules` | **PASS** (view); write path e2e-blocked by QA-10 (test-authoring, not product) | `r9-1440-task1-person-dana.png` |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Call Sheet → Client side band shows Adaeze (reach `On paper`, "Selections.") and Chidi (reach `On paper`, "Signs money to $2,500. Approves change orders to $2,500. Certifies draws.") as two real seats, no synthetic third row | **PASS** as a recorded, visible fact; the fresh-ADD path's Authority capture remains QA-6's open judgement call (structured picker vs. SPEC's single field) — unchanged | `r9-1440-task2-callsheet-clientside.png` |
| 3 | Who has site access on Okonkwo right now | Call Sheet → "Open the site access card", one click | **PASS** — Who to call first (6 lines, 3 more than the specimen — studio-added, correct), The way in (no code, PR-r wording verbatim), Key holder, Hours, Receiving, Who was told, in SPEC's exact region order | `r9-1440-task3-siteaccess.png`, `r9-1440-access.html` |
| 4 | Mark Frank Bauer do not contact; route to Rosa | Directory row + person card both show the block, Rosa's routed email/office-phone tel-link | **PASS** for the fact; **QA-R9-1** (new) on the accompanying "Send a text" gate sentence | `r9-1440-task4-directory-frank.png`, `r9-1440-task4-person-frank.png` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo (single-add only, per R-BM) | Call Sheet → "From the rolodex" → single-add picker: words, one history line, no verdict (PR-i), correct paper-word suppression for Great Northern Bank / CPED Inspections (R-A/C13) | **DEFERRED, correctly** (R-BM: travel-list pane is W3 scope) | `r9-1440-task5-picker.png` |
| 6 | Everyone on Okonkwo by role, this week | Call Sheet opens already banded (this week / later / bidding / done); vitals "14 on the job this week · 4 reachable by text · 2 with accounts · 7 on paper" computed live | **PASS** | `r9-1440-task6-roster.png` |

---

## 4. Prior findings — re-checked this round

| ID | This round's read |
|---|---|
| QA-1 (r5, firm name never rendered) | **STILL FIXED** — Dana Kowalski's row and card both read "Northgate Electric" |
| QA-2 (r5, "New person" opened the picker) | Not independently re-exercised (not on this round's task list); "From the rolodex" and the Directory's "Add person" both open their correct, distinct sheets |
| QA-3 (r5, spurious "Client" row) | **STILL FIXED** — Call Sheet Client side reads exactly Adaeze Okonkwo, Chidi Okonkwo, no third row |
| QA-4 (r5, raw E.164 numbers) | **STILL FIXED** — every phone observed this round (Directory, person card Channels, site access "Who to call first") renders `(612) 555-01NN`-shaped |
| QA-5 (r5, Northgate warranty/tax-id) | **STILL OPEN**, unchanged — QA-R9-2 above |
| QA-6 (r5, Authority field structured picker) | **STILL OPEN**, unchanged judgement call — `add-sheet.spec.ts:103` still times out on `getByLabel("Authority")` |
| QA-7 (r5, two console errors pre-`/people`) | **STILL PRESENT**, unchanged, orthogonal — see §5 |
| CR4-1 (hairlines near-black) | **STILL FIXED** — re-probed, identical result set to r7/r8 (see §6) |
| QA-R8-1 (grant end date off by one day) | **STILL FIXED** — Dana Kowalski's Access grants row reads "Ends with the job, 24 May 2027," matching her seat's own `on_site_to` |
| QA-R8-2 (390 company-card overflow) | **STILL FIXED** — 390 company card `scrollWidth`/`clientWidth` check: no overflow (see §7) |
| CR8-1 (roster held clause named the wrong noun) | **STILL FIXED** — Northgate's compliance-table clause reads "Site access and the draw are held until a current certificate is on file.", not a "COI, general liability" column head |
| CR8-5 (roster paper word ungated) | Not independently re-exercised (Frank Bauer's own roster row shows no paper word for his own rule status; not chased further — outside this round's assignment) |

---

## 5. Console errors and hydration warnings

Two errors fire on every fresh sign-in, at both 1440 and 390, before `/people` is ever opened —
identical text to rounds 5, 7 and 8:

```
TypeError: Failed to fetch   (Supabase auth-session read on /desk's first paint)
Error logged: AppError: Not authenticated   (a React Query fetch)
```

No further console errors, warnings, or React hydration warnings were observed across any of the
seven People-room states, at either width, across the full walk (directory, person, company, roster,
site access, add sheet, bring-forward pick). Not re-flagged as fresh; orthogonal to People CRM.
Raw: `qa-w2-r9/r9-console-errors-1440.json`, `r9-console-errors-390.json`.

---

## 6. Hairlines (CR4-1) — not near-black

Computed-style sweep of every border color on the rendered Directory at 1440:
`--hairline-strong` resolves to `#D8CCB8`. Border colors found: the pressed-chip highlight
(`oklch(0.8606 0.0321 84.5881)`), a translucent header rule (`rgba(44, 41, 38, 0.18)`), solid
`rgb(44, 41, 38)` (control chrome — buttons/focus rings, not a ledger hairline), the paper/hairline
grounds (`rgb(229, 226, 221)`, `rgb(216, 204, 184)` = `--hairline-strong` itself), and the four state
pigment families (sage/golden/terracotta, each as both a solid and a tint). **No near-black hairline
rule on any ledger row** — identical result set to rounds 7 and 8; CR6-1's original fix still holds.
Raw: `qa-w2-r9/r9-hairline-probe.json`.

A second probe confirmed the reach-word `.word` (e.g. "Account") paints `background:
rgba(0, 0, 0, 0)` with a `1px` sage border — transparent ground, not a filled pigment (SPEC §8 #10).
Raw: `qa-w2-r9/r9-account-word-probe.json`.

---

## 7. Overflow

`document.documentElement.scrollWidth` vs `clientWidth` at 390:

| State | Overflow |
|---|---|
| Directory | false |
| Person card (Dana Kowalski) | false |
| Project roster (Call Sheet) | false |

No horizontal scroll observed on any of the three programmatically-checked states, nor visually on
company card, add sheet, site access or the picker at 390.

---

## 8. SPEC §5 acceptance strings — presence sweep

A forbidden-vocabulary and schema-word sweep (AI, CRM, dashboard, wizard, badge, pill, chip, modal,
toast, spinner; `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`,
`project_parties`, `PD-n`, `CRM-n`, `F-nn`) across every dumped HTML state (directory, person,
company, roster, add, access, both widths) returned **zero hits** — no forbidden or schema word
reaches any face.

Every literal string SPEC ties to a *mechanism* (not to the static fixture's specific names/dates)
was found present and correctly derived from live data: the R-Q consent-sentence template, R-U's
site-access fold line, PR-r's "held off Patina" wording with no code digit anywhere, R-P's fixed
Paper-region order (table → leading-rule clause → consequence sentence → act), the eight Add-sheet
kind words verbatim and in order, and R-A/C13's paper-word suppression for the two lender/inspector
firms (Great Northern Bank, City of Minneapolis CPED Inspections) in the picker. Strings that differ
from SPEC's literal specimen text do so because the live seed's underlying facts differ from the
specimen's invented fixture (head count, Adaeze/Chidi's reach state, Frank Bauer's rule prose per
QA-R9-4) — not because the mechanism is wrong.

No missing SPEC acceptance string is reported as a BLOCKING finding this round.

---

## 9. Files

`artifacts/people-room-crm-2026-09-11/build/qa-w2-r9/`: `r9-1440-*.png/.html`, `r9-390-*.png/.html`,
`r9-console-errors-{1440,390}.json`, `r9-hairline-probe.json`, `r9-account-word-probe.json`,
`r9-frank-mint-area.txt`, `r9-1440-frank.html`, `r9-1440-frank-full.png`, `r9-*-overflow.txt`.
Force-added per the task's instruction that files under `build/` need `git add -f` (not yet staged —
left for the round's fix commit to bundle, matching rounds 5–8's own pattern of committing the QA
doc alongside that round's fix).
