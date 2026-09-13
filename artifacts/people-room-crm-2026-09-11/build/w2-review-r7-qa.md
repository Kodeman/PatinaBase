# W2 review — round 7 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `4aadffce4` (the round-6 fix commit). Local production
build (`next build` + `next start -p 3000`), signed in as `designer@patina.dev` via the UI password
form (same deviation round 5 took, reasoned there — Inbucket magic-link was not exercised this
round either), against the local Supabase stack reset fresh for this round
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Okonkwo dev seed replayed by
`supabase db reset`). No prod touched, no migration written. Server started and stopped by this
review; port 3000 confirmed free before and after.

**Verdict: NOT CLEAN.** Three BLOCKING-grade defects (a systemic missing SPEC string, a raw
schema-shaped token on a face, and a legacy row misrepresented as a duplicate person card with a
dead-end open) survive from a fresh read of the live build. All four round-5 QA findings and all
three round-6 findings (QA-1..QA-4, QA-R6-1, QA-R6-2, CR6-1, CR6-2) that were assigned fixes are
independently re-verified FIXED below. One round-5 MINOR (QA-5) is still OPEN, unchanged.

---

## 0. Setup, as actually run

1. `lsof -ti :3000` → empty. Confirmed before starting.
2. `pnpm --dir <worktree> supabase:reset` — the sandboxed shell's telemetry-file write is denied
   (`EPERM … telemetry.json.tmp`), unrelated to the product; re-run with the sandbox disabled
   succeeded, replaying migrations through `00627` (W2 still mints from `00628`, per w2a-report) and
   every seed including `people_crm_dev.sql`.
3. `supabase status -o env` supplied local keys (not reproduced here, per instruction).
4. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon>
   SUPABASE_SERVICE_ROLE_KEY=<local service role> SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1
   NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true"
   ORDERS_SERVICE_URL=… MEDIA_SERVICE_URL=… PROJECTS_SERVICE_URL=… pnpm --dir <worktree> --filter
   @patina/designer-portal build` — exit 0, `/people` present as `○` static. (Note:
   `apps/designer-portal/CLAUDE.md` records that `the-document-pilot` flag was retired in the R21
   dissolve; the override is a no-op against a flag that no longer gates anything, harmless.)
5. Start: `next start -p 3000`, backgrounded. Same `output: standalone` warning round 5 saw; server
   bound and served correctly throughout (`/api/version` → 200, `/people` → 307 pre-auth).
6. Playwright specs under `e2e/people/` ran against the running server (`reuseExistingServer`).
   Chromium required `dangerouslyDisableSandbox` for every `next build`/`next start`/`playwright
   test` call, per SPEC's own note.
7. The manual walk used a temporary Playwright spec (`e2e/qa-walk-r7.spec.ts` and a second small
   probe spec), run and then **deleted** before finishing — `git status` on `apps/designer-portal/e2e`
   is clean.
8. Server stopped by PID (`kill -9`, required `dangerouslyDisableSandbox`); `lsof -ti :3000` empty
   afterward.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using workers
  11 passed
  8 failed
```

Identical pass/fail set to round 5, for the identical reasons (re-verified, not re-litigated):

| Spec | Result | Read |
|---|---|---|
| `directory.spec.ts` — all 6 | PASS | |
| `company-card.spec.ts` — both | PASS | |
| `call-sheet.spec.ts:48` task 6 | PASS | |
| `call-sheet.spec.ts:126` task 3 (logging) | PASS | |
| `call-sheet.spec.ts:91` task 3 (one click) | FAIL | test bug — `a[data-tel-link]').first()` unscoped to the site-access dialog, resolves to the Call Sheet's own Adaeze row first (QA-9, r5). Manual walk confirms Luis Ochoa IS the card's own first line |
| `add-sheet.spec.ts:37` task 1 | FAIL | phone-collision test-authoring gap (QA-10, r5) — the fixture number collides with a seeded card |
| `add-sheet.spec.ts:103` task 2 | FAIL | real field-shape mismatch — the sheet's Authority capture is a disclosure→scope+threshold picker, not a single `getByLabel("Authority")` field (QA-6, r5) |
| `add-sheet.spec.ts:145` (trade-required alert) | FAIL | test bug — `role=alert` collides with Next's route announcer (QA-11, r5) |
| `person-card.spec.ts:51` task 4 | FAIL | phone-collision test-authoring gap (QA-10, r5) |
| `person-card.spec.ts:111` R-V | FAIL | same |
| `add-client-letter.spec.ts` — both | FAIL (timeout) | orthogonal — needs the local edge-runtime container for `supabase/functions`, out of this task's scope (QA-12, r5) |

No new Playwright regressions.

---

## 2. Re-check of prior findings

### Round 5 (`w2-review-r5-qa.md`, fixed by `w2-fix-log-r5.md`)

| ID | This round's read |
|---|---|
| QA-1 (BLOCKING — identity line/company_name never resolved) | **FIXED, confirmed.** Dana Kowalski's Directory row and person-card header both print "Northgate Electric" now (`personIdentityLine`/header both read the joined `company_name`). See §3 QA-R7-1 for a *related but distinct* remaining gap (trade suffix). |
| QA-2 (MAJOR — "New person" opened the rolodex picker) | **FIXED, confirmed.** From the Call Sheet, "New person" opens the "Bring someone in" sheet (the 8-word kind switch), not "FROM THE ROLODEX". |
| QA-3 (MAJOR — spurious "Client" row) | **FIXED, confirmed.** Client side reads "2, 2 listed" — Adaeze Okonkwo and Chidi Okonkwo only, no ghost "Client"/"THE CLIENT" row. |
| QA-4 (MAJOR — raw E.164 phones) | **FIXED, confirmed.** Person card Channels, company card Channels, and the Site Access card's "Who to call first"/key-holder lines all print `(612) 555-01NN`-shaped numbers; hrefs remain the raw `tel:+1…`. |
| QA-5 (MINOR — Northgate warranty/tax-id gap) | **STILL OPEN, unchanged.** `warranty_until` and `tax_id_last4` are still `NULL` for Northgate Electric in the seed; the card correctly omits both clauses (print-if-present is doing its job) rather than fabricating them. Seed-completeness, not a code defect, as r5 judged. |
| QA-6 (judgement call — Authority is a structured picker) | Unchanged. Not independently re-driven end to end this round (would require completing the confirm→submit→DB loop by hand); the field-shape observation stands. |
| QA-7 (MINOR — two console errors on every fresh sign-in) | **STILL PRESENT**, identical text, at both 1440 and 390, before `/people` is ever opened. Orthogonal to People CRM (session-hydration race on `/desk`'s first paint), not re-flagged as fresh. |
| QA-8 (informational — live order/count vs. SPEC's small fixture) | Confirmed still true: the live book is 41 people/21 firms (the whole seeded studio), not SPEC's 29/22 (the Okonkwo+Lindqvist-only specimen dataset). Not a finding. |
| QA-9 / QA-10 / QA-11 / QA-12 (test-authoring / orthogonal) | All reproduce identically. Not re-flagged. |

### Round 6 (`w2-review-r6-qa.md` / `-code.md`, fixed by `w2-fix-log-r6.md`)

| ID | This round's read |
|---|---|
| QA-R6-1 (BLOCKING — picker printed a forbidden paper word for lender/inspector firms) | **FIXED, confirmed visually.** In the single-add "From the rolodex" picker, Great Northern Bank and City of Minneapolis, CPED Inspections each show exactly two bordered word boxes (`ON PAPER`, `NOT ASKED`); every other firm row (e.g. Ashgrove Millwork) shows three, the third being the paper word. No paper box renders for either firm at all — not even hidden/empty. |
| QA-R6-2 (MAJOR — routed contact line printed raw E.164) | **FIXED, confirmed.** Frank Bauer's routed clause on the Directory row and the collapsed roster row both print Rosa Delgado's office phone as `(612) 555-0114`, `tel:`-linked, never the raw digits. |
| CR6-1 (MAJOR — `var(--hairline)` resolved to nothing, rules rendered near-black) | **FIXED, confirmed by computed-style probe.** `--hairline-strong` resolves to `#D8CCB8` at the root; a sample of 12 bordered rows/rules on `/people` returned only `rgb(216,204,184)` (`--hairline-strong` itself), `rgba(229,226,221,…)`, `rgba(44,41,38,0.18)` (an intentional header-band rule) and one warm-brown pressed-chip border — nothing near-black. |
| CR6-2 (MAJOR — company card printed the raw `company_kind` token) | **FIXED, confirmed.** Directory firm rows print "GC", "Lender", "Authority", "Stager", "Photography", "Supplier" etc., not raw lowercase tokens. The trade-branch exception (a company WITH a trade prints "Electrical sub", not "Subcontractor") is unchanged and still correct per the fix log's own reasoning — confirmed on Northgate Electric's company card: "Electrical sub · 1 person · 2 projects". |
| CR6-3 (MAJOR — "The way in" free-text label) | Not independently re-verified against the accessibility tree this round (would need an axe/aria probe); no contrary symptom observed — the Edit control for the lockbox line renders correctly and the region's own sentence is unaffected. Carried forward as presumed holding, not independently confirmed. |

---

## 3. Fresh findings (QA-R7-#)

### QA-R7-1 — BLOCKING, confidence HIGH — the Directory identity line still never prints a trade, for every non-maker person

**Claim.** SPEC §5.1 #8 requires Dana Kowalski's Directory row to read "Northgate Electric ·
electrical" on line 2 (and direction §3.2 R1 the same pattern on the person-card header). QA-1's
round-5 fix restored the firm NAME half of this string. The TRADE half is still missing.

**Reproduced.** Every crew/sub row sampled (Dana Kowalski, Rosa Delgado, Joe Wozniak, Pete Rusk,
Ingrid Halvorsen, Tom Marrow, Ray Thao) prints only the firm name on its identity line — e.g.
`<p class="t-meta …">Northgate Electric</p>` for Dana, with no "· electrical" appended anywhere on
the row or the person-card header ("Northgate Electric · owner, since 2019", no trade). This holds
at both widths (verified in the 390 capture as well, same markup).

**Root cause, verified.** `personIdentityLine()` (`apps/designer-portal/src/lib/document/
people-derivation.ts:1042-1055`) appends `directoryTradeOf(p)` only when it is non-null;
`directoryTradeOf` (`:868-875`) reads `p.meta?.["trade"]` or `p.meta?.["specialties"][0]`. For a
CARDED crew/sub identity (`studio_contacts`), neither key is ever populated by
`people_directory` — trade is a SEAT fact (`project_parties.trade`), not a card fact, and the view's
CONTACTS branch (the same branch QA-1 patched for `company_name`) never joins it in. So the
function silently falls back to firm-name-only for every carded human who has a trade only on their
engagement, which today is essentially every crew/sub row in the Directory.

**Blast radius.** This is the exact string direction's own component-inventory line 2 promises
("trade on a second line") and SPEC's own per-row acceptance criteria for Dana Kowalski, and by the
same code path, every other trade-carrying crew/sub identity in the book.

**Fix direction.** Either the view's contacts branch joins the person's most relevant open seat's
`trade` into `meta.trade` (mirroring the `company_name` join QA-1 already added), or the derivation
takes the seat list the caller already holds (`people_directory_seats`) and reads the current/most
recent seat's trade when the card carries none of its own — a ruling the orchestrator should make,
since a person can hold different trades on different jobs and "one trade on the identity line"
is a simplification the model does not otherwise claim.

**Evidence.** `build/qa-w2-r7/1440-directory.html` (search "Dana Kowalski", "Rosa Delgado", "Joe
Wozniak"), `1440-directory.png`, `1440-person.html`.

### QA-R7-2 — BLOCKING, confidence HIGH — a raw, un-humanized specialty token prints on Claire Bissett's Directory row

**Claim.** SPEC §8 #3 forbids schema words on a face and requires plain, present-tense,
sentence-case English; direction's whole redesign is built on "the studio's own words."

**Reproduced.** Claire Bissett's (a maker/showroom rep) Directory row second line reads
"Stonehaven Tile Gallery · tile_stone" — the raw snake_case value, not a human label such as "tile
& stone".

**Root cause, verified.** `studio_contacts.specialties = {tile_stone}` for Claire Bissett (confirmed
by direct query). `directoryTradeOf` returns `specialties[0]` verbatim; `getFieldTradeLabel`
(`packages/types/src/field-config.ts:110-113`) falls back to the raw string when the value is not a
recognized `FieldTrade` key — `tile_stone` is a specialty vocabulary value, not a `FieldTrade`, so
it is never looked up and prints untouched.

**Impact.** A raw internal token on a designer-facing face, on the exact line direction says carries
"trade on a second line" — the one visible symptom that DOES render a trade also renders it wrong.

**Fix direction.** Either give `getFieldTradeLabel` (or a sibling specialty-label lookup) an entry
for `tile_stone` and every other specialty value the seed uses, or have `directoryTradeOf` route
`specialties[]` values through a distinct specialty-label map rather than the trade one — the two
vocabularies are different (CRM-10/PR-f widened `FieldTrade`; specialties are the maker's own list),
and neither the trade map nor the fallback path is safe to leave un-humanized in this form.

**Evidence.** `build/qa-w2-r7/1440-directory.html` (search "tile_stone"), `1440-directory.png` (row
visible, gold-highlighted, roughly two-thirds down the page), DB query
(`studio_contacts.specialties` for Claire Bissett).

### QA-R7-3 — BLOCKING, confidence HIGH — a legacy `designer_clients` row is surfaced as a duplicate person card sharing Adaeze's phone, and opening it shows contradictory, empty facts

**Claim.** SPEC §5.1 #17 / R-Y require the duplicate-phone band to read "These two cards share a
phone." followed by the two real people who share it, each a live open-person control to that
person's own card.

**Reproduced.** The Directory's duplicate band reads "These two cards share a phone." followed by
**Adaeze Okonkwo** and **The Okonkwo household** — not Chidi Okonkwo. (Adaeze's and Chidi's actual
phones in this seed are different numbers, `…0104` and `…0105` — they do not collide at all; SPEC's
own two-spouses-share-a-number scenario does not hold in the real seed.) "The Okonkwo household" is
ALSO listed as its own independent Directory row, rendered exactly like a person (34px circle "TH",
`tel:+16125550104` — Adaeze's own number). Both the band's control and the standalone row's control
carry `data-open-person="d0e80000-0000-0000-0000-000000000001"` and open what the room presents as a
person card.

**Root cause, verified.** `d0e80000-0000-0000-0000-000000000001` is not a `studio_contacts` (E1
person) row at all — it is a row in the legacy `designer_clients` table (seed comment, verbatim:
"the household OBJECT (`client_households`) is P2, so Adaeze's `designer_clients` row stands for the
household here and Chidi is a `client_rep` seat"). The Directory's identity list is pulling this
legacy CRM/lead-tracking row in as if it were a first-class person card, and its phone/email happen
to duplicate Adaeze's own (both were seeded from the same household contact info), which is exactly
what trips `directoryDuplicatePairs`' phone-collision scan.

**What the open card actually shows** (confirmed by clicking it): "Nothing on file yet. Add a phone
or email to reach them." under Channels — despite the ROW that opened it carrying a live `tel:` link
to that very number — "No contact rule on file.", "No grant on file.", "No closed seat on file.",
and "Worked 0 of the studio's projects." This is a face actively contradicting itself: the row says
this identity holds a phone (and shares it with Adaeze); the card that same row opens says it holds
none.

**Impact.** BLOCKING on two independent grounds: (1) a wrong fact on a face — the duplicate band
names an entity as a phone-sharing "card" whose own opened view denies holding that phone at all;
(2) the acceptance string itself is not met — R-Y specifically names "the two names" as the
requirement, and the live band never shows Chidi Okonkwo (the actual second household member) at
all. A studio using this feature to catch real data duplicates gets pointed at a legacy
lead-tracking artifact instead.

**Fix direction.** The Directory's identity list (and `directoryDuplicatePairs`) should not admit
`designer_clients` rows as person entries at all — E1 person identity is `studio_contacts`
(direction §2.2's own object-to-surface table); a `designer_clients` row is a different, older
entity (the pre-People-CRM lead/client tracker) and does not carry the channels, rules, grants,
seats or history the person card promises to read. Where a designer_clients-only household needs a
Directory presence, that is exactly the household OBJECT PR-c called for (P2, `client_households`),
not an incidental phone-collision surfacing of an unrelated table.

**Evidence.** `build/qa-w2-r7/1440-directory.html` (search "The Okonkwo household" — three
occurrences: the duplicate band, the standalone row, and the row's `tel:` link),
`1440-household-dup-click.png` (the opened card), `1440-household-dup-click.html`, seed comment at
`supabase/seed/people_crm_dev.sql:78-88`.

### QA-R7-4 — MINOR, confidence MEDIUM (judgement call) — Frank Bauer's contact-rule wording does not match SPEC's literal quoted clause, and round 5's report appears to have mis-evidenced this

**Claim.** SPEC §5.1 #10 / §3's fixture require the exact clause "Do not contact directly. Write
Rosa Delgado instead." on Frank Bauer's row.

**Observed.** The live row (and the collapsed roster row) prints "No direct contact, at his
request. Write Rosa Delgado; she forwards what he has to sign." — a different, though
semantically equivalent, sentence. `git blame` on the seed shows this exact wording has stood
unchanged since the original W1b seed commit (`f21cc0087`, 2026-09-12), i.e. it is not a round 5/6
regression.

**Why this is a judgement call, not a clean BLOCKING claim.** `w2-review-r5-qa.md`'s Task 4 PASS
explicitly quotes "Do not contact directly. Write Rosa Delgado instead." as observed live on this
exact row at that time — which the seed history says was never true. Either round 5's evidence was
taken from SPEC rather than the rendered page, or something reset the seed's wording back and forth
between rounds; this round's read is the one grounded in a live `git blame` and a fresh capture.
Separately, a contact rule's `reason` is free text a studio member types (`studio_contact_rules.reason`)
— unlike R-Q's templated consent sentence, there is no shared formatting function enforcing one
wording, so whether SPEC's fixture prose is meant to bind the live seed's own authored text, versus
only the static specimen, is a genuine open question the rulings do not settle.

**Recommendation.** Either the seed's Frank Bauer rule text is corrected to match SPEC's fixture
literally (if literal parity with SPEC's examples is intended for every Okonkwo-fixture person), or
SPEC/direction is amended to state that a contact rule's `reason` is studio-authored prose and only
the STRUCTURE (leading rule, routed line with a real channel) is a live-build requirement — and
round 5's report is corrected, since its Task 4 evidence does not match what the seed has held
since 2026-09-12.

**Evidence.** `build/qa-w2-r7/1440-directory.html` (search "No direct contact"),
`supabase/seed/people_crm_dev.sql:443-449` and its `git blame`.

### QA-R7-5 — INFORMATIONAL, not a fresh finding — the "used <date>" clause on a freshly-minted access grant

Every field-link grant in a just-reset local seed has `last_used_at = NULL` (tokens are minted at
seed time with no synthetic "last used" history), so `access-grant-list.tsx`'s "used <date>" segment
never renders anywhere in a fresh local walk — correctly, since the code omits it exactly when the
column is null. This means SPEC §5.2 #6's literal three-part grant line ("minted … · used … · Ends
…") can never be reproduced against a freshly-reset local seed, only against a database that has
recorded at least one real field-link visit. Not a code defect (the display logic is doing the
right thing with what it is given); named so the next round does not treat its absence as new.

---

## 4. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → Add person → kind switch → contact-rule field present and fillable | **PASS** | consistent with r5; e2e failure remains QA-10 (test-authoring), not a fresh defect |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Studio side / Client side bands on the Call Sheet correctly show Adaeze (Account, "Selections.") and Chidi (On paper, "Signs money to $2,500. Approves change orders to $2,500. Certifies draws.") as two real seats, not a synthetic row (QA-3 fix holding) | **PASS on the visible facts**; authority-capture UI itself **UNVERIFIED** end to end (QA-6, carried) | `1440-roster.html`/`.png` |
| 3 | Who has site access on Okonkwo right now | Call Sheet → "Open the site access card" → key holder, gate control, hours, receiving, who-was-told, all on one card, no code digit anywhere | **PASS** | `1440-access.html`/`.png` matches SPEC §5.6 region-for-region |
| 4 | Frank Bauer do-not-contact, routed to Rosa | Live on the Directory row, the collapsed roster row, and the company card's crew line — blocked leading rule, Rosa's email + `tel:`-linked office phone all present | **PASS structurally**; wording differs from SPEC's literal clause (QA-R7-4) | `1440-directory.html`, `1440-roster.html` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo (single-add only, per R-BM) | "From the rolodex" opens the single-add picker; confirmed lender/inspector firms correctly print no paper word (QA-R6-1 fix holding) | **PASS as scoped** (travel-list pane is W3, not walked, per R-BM) | `1440-pick.html`/`.png` |
| 6 | Everyone on Okonkwo this week, by role | Call Sheet opens already banded (Studio side / Client side / this week / later / Bidding / Done), vitals line present in the correct shape | **PASS** | `1440-roster.html`/`.png` |

---

## 5. SPEC §5 acceptance strings — states directory, person, company, roster, add, access

Every string checked was present **except** the two named as missing verbatim in §3 above:

- §5.1 #8's "Northgate Electric · electrical" — only "Northgate Electric" renders (QA-R7-1).
- §5.1 #17's requirement that the duplicate band name the two real people sharing a phone — the
  live band names Adaeze Okonkwo and a legacy `designer_clients` row, never Chidi Okonkwo, because
  Adaeze and Chidi do not in fact share a phone in this seed (QA-R7-3).

Everything else checked (head "The People Room · N people · N firms" shape, six chips in
"Narrow the book", the trade line under Crew, R-Q's consent-sentence template verbatim at every call
site sampled, R-L's routed-channel selection, R-S's blocked-clause-everywhere rule, R-T's
opted-out-note-on-collapsed-row, R-U's site-access summary fold, R-M's 390 plain-word row, R-P's
company Paper region order, C13/C18's lender/inspector no-paper-word rule on both the Directory and
the picker, R-AA's live seat-line buttons, the Call Sheet's six bands, the site access card's six
regions and "no code digit anywhere") rendered as required, with the caveat that literal per-person
prose that is real seed-authored free text (names, dates, a rule's own wording) naturally differs
from SPEC's own small Okonkwo/Lindqvist specimen dataset — expected, and not itself a finding
(consistent with QA-8's standing note).

---

## 6. Hairlines (CR4-1) — not near-black

Computed-style probe over `/people`'s rendered rows: `--hairline-strong` resolves to `#D8CCB8`
(warm tan); sampled border colors across header, chip, and row rules returned only
`rgb(216,204,184)`, `rgba(229,226,221,…)`, `rgba(44,41,38,0.18)` (an intentional darker header-band
rule) and one warm-brown pressed-chip border. No near-black hairline anywhere sampled — CR6-1's fix
holds.

---

## 7. Console errors and hydration warnings

Two console errors fire on every fresh sign-in, before `/people` is ever opened, at both 1440 and
390 (identical to QA-7, r5): `TypeError: Failed to fetch` (a Supabase auth session read) and
`AppError: Not authenticated` (a React Query fetch), both on `/desk`'s first paint. No further
console errors, warnings, or React hydration warnings were observed across the full walk (directory,
person, company, roster, site access, bring-forward pick, add sheet). Not re-flagged as fresh; named
because the brief asked console output to be checked.

---

## 8. Overflow

`document.documentElement.scrollWidth === clientWidth` (390) confirmed on both the Directory and
the open Call Sheet/roster. No horizontal overflow found.

---

## 9. Files

`build/qa-w2-r7/`: `1440-directory.{png,html,txt}`, `1440-person.{png,html}`,
`1440-company.{png,html}`, `1440-roster.{png,html}`, `1440-access.{png,html}`, `1440-pick.{png,html}`,
`1440-add.{png,html}`, `390-directory.{png,html}`, `390-person.{png,html}`, `390-roster.{png,html}`,
`390-access.{png,html}`, `390-overflow.txt`, `390-overflow-roster.txt`, `console-1440.json`,
`console-390.json`, `hairline-probe.json`, `1440-household-dup-click.{png,html}`,
`console-household-dup.json`. All force-added per the task's instruction (files under `build/` need
`git add -f`); this file itself staged the same way. Not committed by this review — a concurrent
adversarial code-review pass (`w2-review-r7-code.md`) is mid-flight in this same worktree
(`git status` showed it already staged, `A`, at the start of this session); leaving the round-7
commit to whoever synthesizes both reports, per this program's own pattern of bundling a round's
review evidence into its fix commit.
