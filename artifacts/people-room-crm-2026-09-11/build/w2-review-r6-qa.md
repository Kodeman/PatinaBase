# W2 review — round 6 — runtime QA (local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `23e922802` (the round-5 fix commit). Local production
build (`next build` + `next start -p 3000`), signed in as `designer@patina.dev` via a real
magic-link OTP flow through Mailpit at `http://127.0.0.1:54324` (not password auth — see §0),
against the local Supabase stack (Okonkwo dev seed, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
No prod touched, no migration written. Port 3000 confirmed empty before and after.

**Verdict: NOT CLEAN.** One BLOCKING finding (a forbidden paper word on the bring-forward/rolodex
picker for lender and inspector firms) and one MAJOR finding (the routed-contact phone still
prints raw E.164 on the Directory row and roster row — QA-4's fix from round 5 missed one call
site), plus MINOR/informational items. See §2.

---

## 0. Setup, as actually run

1. `lsof -ti :3000` → empty. Confirmed before starting.
2. `pnpm --dir <worktree> supabase:reset` — ran clean under `dangerouslyDisableSandbox` (the CLI's
   telemetry write and its read of `supabase/.env.local` are both outside the default sandbox
   allowlist; this is a sandbox restriction, not a product defect). All migrations through `00627`
   plus `20260910152111` applied; `people_crm_dev.sql` seeded.
3. **Key-extraction bug caught and fixed before any build/server/test step counted as evidence:**
   `supabase status --workdir <worktree> -o env` prints `KEY="value"` (quoted) format. A first pass
   captured the literal quote characters into `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY`, which silently corrupted the JWTs baked into the build (`NEXT_PUBLIC_*`
   is inlined at build time). The first build/start/Playwright run under that corruption produced
   19/19 Playwright failures, all `PGRST301 JWT cryptographic operation failed` — a false signal,
   not a product regression. Caught, keys re-extracted correctly (quotes stripped), and the portal
   was **rebuilt and restarted** before any of this report's findings were gathered. Every result
   below is against the corrected build.
4. Build: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (from the corrected extraction),
   `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES="the-document-pilot:true"`,
   plus `ORDERS_SERVICE_URL` / `MEDIA_SERVICE_URL` / `PROJECTS_SERVICE_URL` / `NEXT_PUBLIC_APP_URL` /
   `NEXT_PUBLIC_CLIENT_PORTAL_URL` pointed at localhost per `.env.example` — exit 0, `/people` static.
5. Start: same env, `npx next start -p 3000`, backgrounded; `next start` printed the same
   `output: standalone` advisory round 5 noted (unrelated to this program, not chased). `curl
   /api/version` → 200, `curl /people` → 307 to sign-in pre-auth.
6. Sign-in: **the brief's own instruction was followed literally this round** — a real magic-link
   (email one-time-code) flow through the portal's own sign-in form (`#portal-auth-email` →
   "Email me a one-time code" → `#portal-auth-code`), with the six-digit code pulled from the local
   mail catcher's own API. **Correction to the brief and to round 5's own note:** the service at
   `127.0.0.1:54324` in this stack is **Mailpit**, not classic Inbucket — `config.toml`'s `[inbucket]`
   section is a deprecated alias for `[local_smtp]`, and Mailpit's API (`/api/v1/messages`,
   `/api/v1/message/<id>`) was used, not Inbucket's `/api/v1/mailbox/<name>` shape (which 404s here).
7. Playwright specs under `e2e/people/` run against the live server with `dangerouslyDisableSandbox`
   (Chromium's own documented sandbox requirement, per SPEC §9's note — same for every
   build/start/test call this round).
8. The manual walk used a temporary Playwright spec (`e2e/qa-walk-r6.spec.ts` +
   `e2e/qa-walk-r6-fixup.spec.ts`), run, then **deleted** before finishing;
   `git -C <worktree> status --porcelain apps/designer-portal/e2e/` is clean.
9. Server stopped: `kill -9` on the bound pid (required `dangerouslyDisableSandbox`, same as round
   5 found). `lsof -ti :3000` confirmed empty afterward.

---

## 1. Playwright — `e2e/people/`

```
$ npx playwright test --config playwright.config.ts --project=chromium e2e/people
Running 19 tests using 7 workers
  11 passed
  8 failed
```

Identical pass/fail count and identical failing specs to round 5 (`w2-review-r5-qa.md` §1), for the
same reasons round 5 already documented — re-verified, not re-litigated:

| Spec | Result | Round 5's read, reconfirmed |
|---|---|---|
| `directory.spec.ts` — all 6 | PASS | — |
| `company-card.spec.ts` — both | PASS | — |
| `call-sheet.spec.ts:48` task 6 | PASS | — |
| `call-sheet.spec.ts:126` task 3 (logging) | PASS | — |
| `call-sheet.spec.ts:91` task 3 (one click) | FAIL | QA-9 — unscoped `a[data-tel-link]` locator resolves to the underlying page, not the dialog; test bug |
| `add-sheet.spec.ts:37` task 1 | FAIL | QA-10 — phone-collision fixture, auto-link firing correctly |
| `add-sheet.spec.ts:103` task 2 | FAIL | QA-6 — Authority is a structured scope+threshold picker, not the single field the test fills |
| `add-sheet.spec.ts:145` (trade-required alert) | FAIL | QA-11 — `getByRole('alert')` strict-mode collision with Next's route announcer |
| `person-card.spec.ts:51` task 4 | FAIL | QA-10 — same phone-collision fixture gap |
| `person-card.spec.ts:111` R-V | FAIL | QA-10 — same |
| `add-client-letter.spec.ts` — both | FAIL | QA-12 — needs the local edge-runtime container; out of this task's scope |

---

## 2. Findings (QA-R6-#)

### QA-R6-1 — BLOCKING, confidence HIGH — the bring-forward/rolodex picker prints a forbidden "Not on file" paper word for lender and inspector firms

**Claim.** SPEC §3.8: "Not printed for lender or inspector firms: a firm whose only people are
inspectors or lenders holds no compliance paper for the studio and carries no paper word at all, on
any surface." SPEC §5.1 #18 (extended to persons by R-A/C24, and to every company-card render by
C21): "Never 'Not on file', never blocked." Rulings §3 R-A/R-N carry the same rule forward from the
static specimen into the build.

**Reproduced.** Call Sheet → "From the rolodex" opens the single-add picker (`#state-pick`'s live
equivalent; task 5 per R-BM is in scope only this far). Two firm rows in the list:

- **Great Northern Bank** (Lender) — mini row prints three bordered words: `On paper` (reach),
  `Not asked` (consent), and **`Not on file`** (paper).
- **City of Minneapolis, CPED Inspections** (Authority/inspector) — the same three words, including
  the same forbidden **`Not on file`**.

**Root cause, verified in source.** `roster/party-mini-row.tsx:173` —
`{paper && <StateWord family="paper" value={paper} />}` — renders unconditionally whenever `paper`
is truthy, with no `partyKindOwesPaper()` gate. The `paper` prop is wired at
`roster/rolodex-picker.tsx:418` — `paper={words?.paper_state ?? null}` — straight off
`people_directory`'s raw `paper_state` column, which for a lender/inspector firm with no documents
legitimately computes `not_on_file`; nothing between the view and this component ever asks whether
the firm **owed** paper in the first place. `packages/types/src/field-config.ts`'s own
`partyKindOwesPaper(kind)` — built by W2a explicitly to answer this question (w2a-report.md §1: "the
DISPLAY rule that decides whether the fact is owed") — is imported by the Directory row's
derivations (`entryOwesPaperWord` / `entryPaperWord` in `people-derivation.ts`, per w2b-report.md
§4) and by the company card's Paper region (C21), but **not** by `party-mini-row.tsx` or
`rolodex-picker.tsx`.

**Blast radius.** Every lender/inspector/authority-kind firm shown in the rolodex picker — the door
Leah task 5 uses, and the door the future W3 travel-list picker (SPEC §5.7) will extend.

**Fix direction.** Gate `party-mini-row.tsx`'s paper `StateWord` (or the `paper` value computed at
its one call site in `rolodex-picker.tsx`) on `partyKindOwesPaper(kind)`, exactly as
`entryOwesPaperWord` already does for the Directory row.

**Evidence.** `build/qa-w2-r6/live-1440-pick.png`, `live-1440-pick.html` (search "Great Northern
Bank" / "City of Minneapolis" — both carry `data-state-word="not_on_file" data-state-family="paper"`).

---

### QA-R6-2 — MAJOR, confidence HIGH — round 5's QA-4 fix (raw E.164 phones) missed the routed-contact-rule line; it still prints an unformatted number on the Directory row and the roster row

**Claim.** SPEC C12's determinism rule and round 5's own QA-4 fix (`w2-fix-log-r5.md`) establish
one shape for a phone on any face: `(612) 555-0111`, never raw E.164 — the fix log states this was
applied "at both call sites named by the finding": `reach-access.tsx` (Channels, person and company
card) and `roster/site-access-card.tsx` (Who to call first, key holder). Confirmed those two hold:
Dana Kowalski's Mobile channel reads `(612) 555-0111`, Northgate Electric's Office channel reads
`(612) 555-0203`, and every "who to call first" line on the Site access card reads formatted,
`tel:`-linked digits.

**Reproduced, at both widths.** Frank Bauer's row (task 4's own target — "do not contact, routed to
somebody reachable") on the Directory, both 1440 and 390: the routed clause prints "No direct
contact, at his request. Write Rosa Delgado; she forwards what he has to sign." followed by her
email (correct) and then **`+16125550114`** — raw, not `(612) 555-0114` — though it IS still a real
`tel:` link (`href="tel:+16125550114"`), so this is a display-shape gap, not a broken link.

**Root cause, verified in source.** `TelLink`'s label defaults to the raw stored value
(`tel-link.tsx`: `const text = label ?? (phone ?? '').trim();`) unless the caller passes
`label={telDisplay(phone)}`. `reach-access.tsx` and `site-access-card.tsx` do. `contact-rule-line.tsx:113`
— `<TelLink phone={routeTo.officePhone} personName={routeTo.name} />` — does not. This is the
`ContactRouteTarget` renderer used by the Directory row's routed clause (and, per R-L/R-S, the same
component the roster row and company card crew line are supposed to share for a routed contact) —
a call site round 5's fix did not enumerate.

**Impact.** The identical fact (Rosa Delgado's office phone) prints two different shapes depending
on which surface names it — the exact defect class QA-4 was written to eliminate, now surviving at
one more first-class location: the Directory row of a Leah-task-4 subject.

**Fix direction.** `contact-rule-line.tsx:113` → `<TelLink phone={routeTo.officePhone}
label={telDisplay(routeTo.officePhone)} personName={routeTo.name} />`, importing `telDisplay` from
`tel-link.tsx` (already imported by the two fixed call sites).

**Evidence.** `build/qa-w2-r6/live-1440-directory.html` and `live-390-directory.html` (search
`+16125550114`).

---

### QA-R6-3 — MINOR, confidence MEDIUM — the company card's Access grants section lists a crew member's personal field-link grant, not a firm-scoped token

SPEC §5.1's Company variant line: "Access grants lists firm-scoped tokens only." On Northgate
Electric's company card, the Access grants region shows the exact same grant
(`field_link:1dc8d738-…`) that appears on Dana Kowalski's own person card — her personal field
link, not a token scoped to the firm. Verified in source: `company-card.tsx:329-330` derives
`firmSeatIds` (every seat belonging to the firm's crew) and passes it as `grantSubjectIds` to
`ReachAccess`, with a docblock stating the design intentionally: "The doors open onto this firm's
crew — grants key on the ENGAGEMENT." This reads as a deliberate, reasoned call (there is no
separate firm-level token concept in the schema besides the paperwork-chase token, which is a
different act), but it does diverge from the SPEC's literal "firm-scoped tokens only" line. Flagging
for a ruling rather than treating as an open code defect — the behavior may be correct and the SPEC
line the one that needs amending.

**Evidence.** `build/qa-w2-r6/live-1440-company-fixed.html` (grant id repeats between
`live-1440-person.html` and `live-1440-company-fixed.html`).

---

### QA-R6-4 — MINOR, confidence HIGH, seed-completeness (not a code defect) — Northgate Electric's warranty clause and Adaeze Okonkwo's "Account" reach both trace to unset seed columns

Two carried-forward gaps, same class as round 5's QA-5:

1. Northgate Electric's company-card header prints "Electrical sub · 1 person · 2 projects" with no
   warranty clause, though a seat-level warranty date (21 Nov 2026, on Dana's closed Lindqvist seat)
   exists and prints correctly elsewhere on the same card. `studio_contacts.warranty_until` is `NULL`
   for this card — a seed gap, not a derivation bug (component prints-if-present; confirmed the
   Payee region's own `retainage_bps` DOES print, so the pattern holds).
2. Adaeze Okonkwo's Call Sheet client-side row reads reach `ON PAPER`, not `Account` — despite task
   2's own premise ("Give Adaeze the app"). Traced to source: `reach_state_for(p_profile_id, p_card_id,
   p_party_id)` returns `'account'` only when `p_profile_id IS NOT NULL`; both her `studio_contacts`
   card and her `project_parties` seat carry `profile_id = NULL` in this dev seed — she was never
   actually wired to a real Supabase Auth login (or a `designer_clients`/`client_account`-tier grant,
   the only other path `v_access_grants` recognizes — confirmed zero rows for her `profile_id` or
   card id in `v_access_grants`). This is the identical "not seeded" class w1b-report.md §6 already
   named for Priya Natarajan and Dale Whitcomb ("person cards but no local logins... `profile_id IS
   NULL`"), just not previously called out for Adaeze specifically. Task 2's "give the app" half
   remains **unverifiable** on this build for the same underlying reason round 5's QA-6 left task 2
   overall "unverified, not confirmed broken."

**Evidence.** `build/qa-w2-r6/live-1440-company-fixed.png`, `live-1440-roster.png`; DB reads
(`studio_contacts.warranty_until`, `.profile_id`, `project_parties.profile_id`, `v_access_grants`)
not reproduced here (no secrets, but per the task's own instruction).

---

### QA-R6-5 — INFORMATIONAL, not a defect — live Directory head count and duplicate-band pair differ from SPEC's fixture, as expected for a real, larger studio book

Consistent with round 5's QA-8 disposition:

- Head line reads **"41 people · 21 firms"**, not SPEC's fixture-only "29 people · 22 firms" — the
  live Directory counts the whole studio's book (multiple projects' worth of seed data), not the
  Okonkwo-only illustrative set SPEC's static HTML specimen renders from. Not treated as a finding
  against the real app.
- The duplicate band reads "These two cards share a phone. **Adaeze Okonkwo** **The Okonkwo
  household**" — a real phone collision the live, larger dataset actually has, distinct from SPEC's
  illustrative Adaeze/Chidi pair. The shape R-Y requires (a plain sentence, two live open-card
  controls, no "Compare & merge" act) is present and correct; only the specific pair named differs,
  which is expected since this is real data, not the fixture.

**Evidence.** `build/qa-w2-r6/head-line-1440.txt`, `live-1440-directory.png`.

---

### QA-R6-6 — MINOR, confidence HIGH — console errors on every fresh sign-in, before `/people` is ever opened (reconfirmed, unchanged)

Identical to round 5's QA-7: `TypeError: Failed to fetch` (a Supabase auth session read) and `Error
logged: AppError: Not authenticated` fire on `/desk` immediately after sign-in, before any
navigation to `/people`. No further console errors or hydration warnings were seen across any of
the seven states walked (directory, person, company, roster, site access, add sheet, pick) at either
width. Reads as the same session-hydration race round 5 named, orthogonal to this program.

**Evidence.** `build/qa-w2-r6/console-1440.json` (two entries), `console-390.json` (empty).

---

## 3. Overflow and hairline checks

- `document.documentElement.scrollWidth > clientWidth` — **false at both 1440 and 390** on the
  Directory (`overflow-1440-directory.txt`, `overflow-390-directory.txt`). No horizontal overflow
  found anywhere in the walk.
- CR4-1 (hairline rules render as hairlines, not near-black) — pixel-sampled the person card's
  region-seam rules: `rgb(229,226,221)`, `rgb(236,233,228)`, `rgb(243,241,236)` — light warm grays,
  consistent with a hairline treatment, nowhere near-black. **No finding.**

---

## 4. Task table — the six Leah tasks

| # | Task | Acts (as walked) | Pass/Fail | Evidence |
|---|---|---|---|---|
| 1 | Add Dana Kowalski text only | Directory → Add person → kind switch (8 words) → "a sub" branch shows Project/Company/Trade/Mobile/Email fields | **PASS** (reachable; e2e failure is QA-10, a fixture gap, not a fresh defect) | `live-1440-add.png`, `live-1440-add-sub.png` |
| 2 | Give Adaeze the app; Chidi signs >$2,500 | Call Sheet client side shows both real seats (QA-3 fixed) with authority phrases; Adaeze's reach reads On paper, not Account | **UNVERIFIED** (QA-R6-4: seed never wired her a real login; same disposition as round 5's QA-6) | `live-1440-roster.png` |
| 3 | Who has site access right now | Call Sheet → "Open the site access card" — one click | **PASS** | `live-1440-access.png` matches SPEC §5.6 closely: no code digits, formatted phones, correct region order |
| 4 | Frank Bauer do-not-contact, routed to Rosa | Live on the Directory row and reproducible at both widths | **PASS for the rule itself; QA-R6-2 (raw phone) found on this exact row** | `live-1440-directory.html`, `live-390-directory.html` |
| 5 | Bring Dana, Pete, Ingrid, Claire onto Okonkwo | Single-add "From the rolodex" picker (task 5 per R-BM: only this far) reachable from the Call Sheet | **PASS for reachability; QA-R6-1 (forbidden paper word) found in this picker** | `live-1440-pick.png` |
| 6 | Everyone on Okonkwo by role, this week | Call Sheet opens already banded (this week / later / bidding / done) | **PASS** | `live-1440-roster.png`; `call-sheet.spec.ts` task-6 e2e passed |

---

## 5. Round-5 findings — re-checked at this round's HEAD

### `w2-review-r5-qa.md`

| ID | This round's read |
|---|---|
| QA-1 (identity line never named the firm) | **CONFIRMED FIXED.** Dana Kowalski's Directory row and person-card header both name "Northgate Electric" |
| QA-2 ("New person" opened the picker) | **CONFIRMED FIXED.** "New person" now opens the Add sheet (kind switch, 8 words) stacked over the Call Sheet; "From the rolodex" still opens the picker |
| QA-3 (spurious "Client" row) | **CONFIRMED FIXED.** Client side band shows exactly 2 rows — Adaeze Okonkwo, Chidi Okonkwo — no nameless third row |
| QA-4 (raw E.164 phones) | **PARTIALLY FIXED.** Channels (person + company card) and Site access card confirmed formatted. **QA-R6-2 above: the routed-contact-rule line (`contact-rule-line.tsx`) was missed** and still prints raw digits |
| QA-5 (Northgate warranty/tax-id absent) | Not on round 5's fix list; **still open**, confirmed a seed gap (QA-R6-4) |
| QA-6 (Add sheet Authority is a structured picker) | Not on round 5's fix list; **still open/unverified**, same disposition — the household/sub Add sheet shows a scope+threshold picker, not a single field; did not complete the confirm→submit→DB loop this round either |
| QA-7 (console errors on fresh sign-in) | **Reconfirmed, unchanged** — same two errors, same timing (QA-R6-6) |
| QA-8 (row order vs. SPEC's literal order) | Informational, unchanged (QA-R6-5) |
| QA-9 (`call-sheet.spec.ts:91` unscoped locator) | **Reconfirmed** — same test bug, same failure |
| QA-10 (phone-collision fixtures) | **Reconfirmed** — same three specs fail the same way |
| QA-11 (`getByRole('alert')` collision) | **Reconfirmed** — same failure |
| QA-12 (`add-client-letter.spec.ts`, edge runtime) | **Reconfirmed** — same two failures, same precondition gap |

### `w2-review-r5-code.md`

CR5-1 and CR5-2 (studio-guess orphan cards; whole-edition Revoke) require, respectively, a
studio-less project and a `project_review_access` row — the local seed holds none of either
(confirmed by round 5's own code review and by a fresh count this round:
`select count(*) from project_review_access` → 0). **Not exercised this round** — a runtime walk
cannot reach either without deliberately constructing the missing fixture, which is outside this
task's scope. CR5-3 through CR5-23 are static/source-level findings (query-key fan-outs,
`aria-describedby` references, live-region multiplicity, docblock drift, etc.); `w2-fix-log-r5.md`
states plainly that none of them were touched this round ("Every other finding in
`w2-review-r5-qa.md` (QA-5 … QA-12) and `w2-review-r5-code.md` (CR5-3 … CR5-22), which were not on
this round's list"). **Presumed still open** per that log's own statement; not independently
re-verified by this runtime QA pass, which is scoped to behavior a signed-in walk can observe, not
a second source read of the diff.

---

## 6. Files

Screenshots, HTML captures, and console logs under `build/qa-w2-r6/`:
`live-{1440,390}-{directory,person,company,company-fixed,roster,access,add}.{png,html}`,
`live-1440-{pick,add-sub,frank-search}.{png,html}`, `console-{1440,390}.json`,
`overflow-{1440,390}-directory.txt`, `head-line-1440.txt`.

(`live-1440-company.png`/`.html` is the first, mis-clicked capture — the search box's own filtered
Directory view, not the company card, kept only as a record of the scripting mistake and its fix;
`live-1440-company-fixed.*` is the actual company card, used for §2/§5's findings.)
