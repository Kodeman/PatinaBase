# W3 (P2) — round 4 QA, against a local production build

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`. Local
only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod touched, no `.env.local`
created or read (env passed inline for every build/start, keys sourced from
`supabase status --workdir … -o env`, never printed). Prior fix log re-checked:
`build/w3-fix-log-r3.md` (QA findings 1–3, MAJOR-1..4, W3-R3-1..5).

## 0. Port rule, build, environment

- `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `:3002` both empty before starting — no cleanup needed.
- `pnpm supabase:reset` — rc=0, clean, all migrations through `00633` + `20260910152111`, all 27
  seeds. Run a **second** time at the end of the session (after every QA write below) — rc=0
  again, confirming no reset failure and no residue left by this round's QA data.
- `supabase status --workdir … -o env` supplied the anon/service keys (never printed). Built with
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus the `.env.example`-listed
  `ORDERS_SERVICE_URL`/`MEDIA_SERVICE_URL`/`PROJECTS_SERVICE_URL`/`NEXT_PUBLIC_APP_URL`/
  `NEXT_PUBLIC_CLIENT_PORTAL_URL` pointed at localhost.
- `npx turbo build --filter=@patina/types --filter=@patina/supabase` → 2 successful (cached).
- `pnpm --filter @patina/designer-portal build` → succeeded, full route table incl. `/people` and
  `/doc/[id]`.
- `next start -p 3000` served the build for the session (restarted once, mid-session, to test a
  finding below against a fresh reset — same build artifact, no rebuild). Both server logs carry
  nothing beyond the one benign `"next start" does not work with "output: standalone"` line.
- Port 3000 confirmed free (`lsof` empty) after the final `kill`/`kill -9` at session end.
- Own-tooling note, not a product fact: my admin scripts could not use the `SERVICE_ROLE_KEY` /
  `ANON_KEY` strings `supabase status -o env` prints — PostgREST answered every request signed
  with them `PGRST301 JWT cryptographic operation failed` (this CLI version's PostgREST is keyed
  off a JWKS that these legacy static keys don't carry a matching `kid` for). The **portal itself**
  is unaffected — GoTrue-issued session JWTs verify fine, and every page in this walk loaded real
  data correctly. Where I needed service-role-equivalent access (creating QA fixture rows,
  reading back write results), I used direct `psql` against `127.0.0.1:54322` instead, which needs
  no key at all. Flagging this only so the harness quirk isn't mistaken for a product finding.

## 1. e2e/people (chromium)

```
11 failed / 11 passed  (1.0m)
```

Ran with `dangerouslyDisableSandbox` after the sandboxed run failed all 22 on Chromium's own
mach-port rendezvous (`bootstrap_check_in … Permission denied`) — a sandbox artifact, not product,
consistent with r3's own note.

| Spec | This round | Status |
|---|---|---|
| `bring-forward.spec.ts` — `task 5` | **`openThePicker()` now succeeds** (r3 finding 3's scoped-locator fix holds — the test reaches real interaction code). Fails one line later: `data-carried-consent` reads `"Opted out to the studio, 3 Dec 2025."`, the test expects `"Opted out by text, 3 Dec 2025"` | **Correctly catching a real product defect** — see Finding 1 below. Not a test bug this time. |
| `bring-forward.spec.ts` — `Put back clears the pick` | `getByRole('button', {name:'Put back'})` resolves to **2** elements: the bring-forward act's own "Put back" and DocSheet's standing dismiss, `aria-label="Put back · Esc"` | New test-locator ambiguity — see Finding 2 below (also a mild face-level naming collision). |
| `add-sheet.spec.ts` (task 1, task 2, "asks for a trade"), `person-card.spec.ts` (task 4, R-V), `call-sheet.spec.ts` (task 3) | Same root causes r2/r3 already diagnosed (hardcoded `(612) 555-0115` colliding with the seeded Frank Bauer fixture; Next's own route-announcer also carrying `role="alert"`; unscoped `a[data-tel-link]` matching the Call Sheet's own link before the site-access card's) | Unchanged, re-confirmed by reading each failure; test bugs, not product. |
| `merge.spec.ts` | Same self-contradiction r3 diagnosed: the spec's own required announcer text necessarily contains `NEWER_NAME`, then the spec asserts zero occurrences of that name anywhere on the page | Unchanged, test self-contradiction. The product-facing merge flow is independently walked by hand below, clean except for Finding 3. |
| `add-client-letter.spec.ts` (both) | Times out on `client-invite-letter`-gated UI | Unchanged, out of this round's env scope (flag not set, per the brief). |

Net: same 11-failure shape as r3, but **bring-forward.spec.ts has moved from "cannot run" to
"runs, and correctly fails on a real bug."** That is progress in the test, and the reason Finding 1
below is confidently reproduced by both an independent automated assertion and my own manual walk.

## 2. Manual walk (signed in as `designer@patina.dev` via the Mailpit one-time-code flow —
the stack's mail catcher is Mailpit on `:54324` despite the deprecated `[inbucket]` config key)

Screenshots: `build/qa-w3-r4/*.png`.

### Task 5 — bring-forward (SPEC §5.7), at both widths

Used two fresh projects in the same studio (`QA R4 Bring Forward 1440`, `QA R4 Bring Forward 390`)
for the reason r2/r3 and the wave's own e2e spec all give: the seed already seats Dana/Pete/
Ingrid/Claire on Okonkwo, so bringing them forward there proves nothing.

**Every §5.7 structural string is present and correctly worded** at both widths, compared directly
against `shots/people-room-1440-state-pick-1440.png` and `-390` (read both this round): "FROM THE
ROLODEX", the search field (filled "Lindqvist"), the pick-count line ("4 OF 6 FROM THE LINDQVIST
KITCHEN SELECTED" — 6 not 5 because this is live seed data, not the specimen's invented rows; same
non-defect r2/r3 already noted), a checkbox + circle + name + firm + trade + one history line per
row, the "WHAT TRAVELS" / "WHAT STAYS BEHIND" panes with the exact six/three items, the act row
first ("ADD FOUR TO THE ROSTER" / "PUT BACK", both live the whole time — confirmed via DOM read,
no `aria-disabled`, no `disabled` attribute), and the consequence sentence directly beneath it:

> "Adds four seats to the QA R4 Bring Forward 1440. Pete Rusk arrives opted out of texting.
> Northgate Electric's insurance lapsed 31 March 2026."

("31 March 2026" not the spec literal's abbreviated "31 Mar 2026" — same wording r1–r3 already
observed and left unflagged; settled, not a new finding.)

Confirmed the write (`project_parties` for the QA project, four rows, `sc.full_name`/`pp.trade`/
`pp.company_name`/`pp.show_to_client`/`pp.sms_consent_status`/`pp.bid_outcome`):

```
Claire Bissett    | tile       | Stonehaven Tile Gallery | show_to_client=f | not_asked | (null)
Dana Kowalski     | electrical | Northgate Electric      | show_to_client=f | not_asked | (null)
Ingrid Halvorsen  | cabinetry  | Halvorsen Cabinet Works | show_to_client=f | not_asked | (null)
Pete Rusk         | plumbing   | Rusk Mechanical         | show_to_client=f | not_asked | (null)
```

**r3's QA finding 1 (trade resolver reading `specialties` instead of `trades`/the firm card) is
CONFIRMED FIXED** — every sub's trade landed correctly on the seat, matching the firm card
(`electrical`, `plumbing`, `cabinetry`), not blank. The Birth rule holds: no consent, no bid, no
`show_to_client` written by the insert.

**r3's QA finding 2 (390 zero-width name) is CONFIRMED FIXED** — `task5-390-4-four-ticked.png`
shows every row's name ("Ben Ostrom", "Claire Bissett", "Dana Kowalski", "Erin Sato" …) fully
legible on its own line, wrapping above the meta/trade line, matching the shipped 390 specimen.

**r3's QA finding 3 (`bring-forward.spec.ts`'s `openThePicker()` unscoped-locator strict-mode
violation) is CONFIRMED FIXED** — see §1 above; the spec now reaches real interaction code.

No raw schema tokens (`not_asked`, `opted_out`, `field_link`, `inbound_sms`, `bid_outcome`,
`no_response`, `off_job`, …) appeared anywhere on either page's full body text (scanned
programmatically). No verdict word appears on any picker row (PR-i holds).

#### Finding 1 — MAJOR: the carried-consent notice states the wrong refusal channel, and never
names the origin project, contradicting SPEC §5.7 #4b and R-Q on the wave's own headline row

**Where**: `apps/designer-portal/src/lib/document/bring-forward.ts:157`
(`carriedConsentNotice`'s `how` branch), `apps/designer-portal/src/components/document/roster/
rolodex-picker.tsx:778` (`originProjectName: null`, hardcoded).

Live, at both widths, Pete Rusk's row reads:

> "Opted out to the studio, 3 Dec 2025."

SPEC §5.7 #4b requires, verbatim: "Opted out by text 3 Dec 2025, on the Lindqvist kitchen." — and
R-Q (§5.8) fixes this as one wording used everywhere a consent sentence is shown; the Directory
row, the collapsed roster row (R-T) and the person card all read Pete's SAME record correctly as
"Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." (confirmed against
`00-people-directory-1440.png`, which shows exactly that string for his row).

Two bugs compound:

1. `carriedConsentNotice`'s `how` is `record.optOutSource === "inbound_stop" ? "by text" : "to the
   studio"` — but `studio_channel_consent.opt_out_source`'s own CHECK constraint
   (`00594_studio_channel_consent.sql:222`) admits exactly `verbal | written | web_form |
   inbound_sms | other`. `inbound_stop` is not a value the schema can ever produce (confirmed:
   `select opt_out_source from studio_channel_consent where channel_value = '+16125550112'` →
   `inbound_sms`, not `inbound_stop`). The `"by text"` branch is dead code; every real inbound-STOP
   refusal falls to the wrong `else`.
2. `originProjectName: null` is hardcoded at the call site regardless of data, so the ", on the
   <project>" clause can never print no matter what the record holds.

This is exactly what `apps/designer-portal/e2e/people/bring-forward.spec.ts:146` asserts and now
fails on (§1 above) — the test is correctly catching this, not malfunctioning.

I am recording this as **MAJOR**, not blocking, under this task's own rubric: three other surfaces
(Directory row, roster row, person card) read the SAME underlying record correctly — this is "a
reader disagreeing with the record," not a case where the record itself, or every reader of it, is
wrong. **Independently corroborated**: a concurrent code-review pass in this same round
(`build/w3-review-r4-code.md`, "MAJOR-1") found and traced the identical two bugs by static
analysis before I reproduced them live — cited here as corroboration, not as my own source; my
finding above is from direct observation of the running app plus a DB read of the real
`opt_out_source` value.

- Confidence: **high** — reproduced live at both widths, root-caused to two exact lines, the wrong
  DB value confirmed by direct query, and independently reached by static analysis in a parallel
  review.
- Fix direction (as the concurrent code review also gives): drop `carriedConsentNotice` in favor
  of the one already-ruled composer (`consent-sentence.ts`'s `REFUSAL_PHRASE.inbound_sms = "Opted
  out by text"`), resolving the project name off `record.origin_project_id`, which the record
  already carries.

#### Finding 2 — MINOR: two controls in one sheet both answer to "Put back"

**Where**: `apps/designer-portal/src/components/document/overlays/doc-sheet.tsx:184` (the
standing dismiss, `aria-label="Put back · Esc"`, on every DocSheet in the portal) beside the
bring-forward picker's own secondary act, `Put back` (SPEC §5.7 #6's own chosen wording).

With the picker open, `getByRole('button', {name: 'Put back'})` (non-exact) resolves to **both**
controls — confirmed live via the e2e run (§1) and by reading the DOM: the sheet's own dismiss
carries the fuller, distinguishable accessible name `"Put back · Esc"`, so an **exact**-name
lookup, a sighted click, or a keyboard Tab pass are all unaffected; only a fuzzy/substring name
search (a screen-reader rotor's type-ahead, or a voice-control command that doesn't require an
exact match) could land on either. Not present before this wave: SPEC §5.7 #6 is what puts a
second "Put back" inside the same sheet as the DocSheet's own standing one.

- Confidence: **medium** — the collision is real and reproduced, but its practical impact is
  narrow given the two names differ in full.
- Fix direction: give the picker's own act a name that doesn't prefix-match the sheet's standing
  dismiss (e.g. "Put the pick back" or "Clear the pick"), or drop the DocSheet dismiss's visible
  label to something that doesn't share the same first two words.

#### Finding 3 — BLOCKING (confirmed live, corroborating a concurrent finding): the merge sheet's
own promise — "an old link still opens this person" — is false

**Where**: `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:105` (the
sentence); `packages/supabase/src/hooks/use-studio-contacts.ts:215` (`useStudioContacts` filters
`.is('merged_into', null)`); no reader in the repo calls `resolve_merged_contact()`
(`grep -rn "resolve_merged_contact\|resolveMergedContact" apps/designer-portal/src
packages/supabase/src` → only two comments, zero call sites).

This is the exact same defect a concurrent migrations-review pass in this round
(`build/w3-review-r4-migrations.md`, "B-3") reached by static analysis. I reproduced it live,
independently, against a **fresh reset** (not the same DB state the code review inspected):

1. Created a fresh phone-collision pair (`Older QA5 Card` / `Newer QA5 Card`, same number,
   different `created_at`) so the shipped fixture and my earlier merge fixture were both untouched.
2. Merged them (`merge_studio_contacts(older, newer, 'phone')` as the seeded designer) — survivor
   = the older card, exactly as the sheet's consequence sentence promises: "…card is kept as a
   record of the merge, **so an old link still opens this person**."
3. Signed in as `designer@patina.dev` and navigated directly to
   `/people?person=<newer-card-id>` (the merged-away card's own id — precisely the "old link" the
   sentence names).
4. **Result**: the Directory renders as a plain, unfiltered list — no card panel opens for the
   requested id, no error, no redirect to the survivor. Screenshot:
   `build/qa-w3-r4/b3-deeplink-merged-id.png`. The survivor ("Older QA5 Card") is visible in the
   list as an ordinary row; the merged card is simply absent, and the id in the URL is silently
   ignored.

This is a "wrong fact on a face" by this task's own definition: the sheet states, as a fact about
what the product does, that an old link to the merged card still opens the person — and it does
not. Anyone who bookmarked, emailed, or cross-linked a card before it was absorbed into a merge
gets a bare directory list with no indication their link failed.

- Confidence: **high** — reproduced end-to-end against a fresh database, screenshot attached,
  and independently reached by the concurrent migrations review via `grep`-level code evidence
  (no caller of `resolve_merged_contact()` exists; `useStudioContacts`/`usePerson` both filter out
  a merged card outright).
- Fix direction (as the concurrent review also gives): resolve `?person=`/`?firm=` through
  `resolve_merged_contact()` before opening the card (one RPC call in the deep-link effect), or
  remove the sentence's promise until that wiring exists.

### Merge two duplicate cards

Wrote a fresh phone collision (`Wren Ashby QA4` / `W. Ashby QA4`, same number, different
`created_at`) so the shipped fixture and merge.spec.ts's own fixture were untouched. Screenshots
`build/qa-w3-r4/merge-*.png`.

- Duplicate band: **"These two cards share a phone. W. Ashby QA4 Wren Ashby QA4 COMPARE THESE
  TWO"** — matches R-Y.
- Compare sheet: older card pre-picked (`aria-pressed="true"`) — PR-o holds.
- Consequence sentence, **verbatim** to the MAJOR-4/W3-R3-1/W3-R3-4-fixed wording: *"W. Ashby QA4's
  seats, channels, contact rule and firm designations move onto Wren Ashby QA4, and W. Ashby QA4's
  own number and address travel with them. Consent stays with the number, not with the card, so
  nobody's yes or no changes. W. Ashby QA4's paper moves onto Wren Ashby QA4 too; where Wren Ashby
  QA4 already holds the same paper, still in force, the older one is marked superseded. W. Ashby
  QA4's card is kept as a record of the merge, so an old link still opens this person."* All three
  of r3's prior fixes (paper-moves rewrite, number/address travel, the closing clause) confirmed
  present in one read.
- `Merge into Wren Ashby QA4` → announcer: *"Two cards are now one. Wren Ashby QA4 carries
  everything W. Ashby QA4 held."* Duplicate band gone (count 0) afterward.
- DB: `studio_contact_merges` holds `survivor_id`/`merged_id`/`matched_on='phone'`; the merged
  card's `merged_into` points at the survivor, `archived_at` stays NULL (PR-o: neither deleted nor
  archived).
- **The closing clause's own promise is false** — see Finding 3 above, reproduced with this exact
  flow on a separate fixture.
- Console clean (this flow only — see §3 for a caveat about a separate script's console reading).

### Edit a bid outcome (Rivera Finishes, Okonkwo)

Unfolded the row → "Change what came back" (the seed already carries `bid_outcome=no_response`
post-reset, not blank) → selected "They declined" → "Write the bid". DB:

```
Rivera Finishes | bid_outcome=declined | stage=declined
```

Both columns moved together (MAJOR-7/M-6's original fix, still correct). On the face, Rivera
Finishes correctly **stays inside the "BIDDING 1" band** with a "DECLINED" tag rather than
disappearing — matching the room report's own description ("`declined` → Declined … stay in
Bidding") — confirmed by direct read, not assumed. Screenshots `bid-1..5`. Console clean.

### Add a household member with a threshold as the principal; confirm a member cannot

Fresh reset → Okonkwo household band read "No household is on file for this client…" (known seed
gap, room-report §5/§10 item 2, unchanged, not a finding). Signed in as `designer@patina.dev`
(studio owner = principal): "Open a household" → "Set the figure" → filled `2500` → "Write the
figure" → threshold now reads **"Change orders over $2,500 need a signature from the household."**
(`co_threshold_cents=250000` confirmed by SELECT).

"Add a household member" → picked Sofia Ferraro, role defaulted to "Signs for the household" →
consequence sentence, verbatim to B2R-1's fixed wording: *"Sofia Ferraro joins the household and
takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is sent to them."* →
"Add to the household". DB: `client_households.member_person_ids` now includes Sofia's card;
exactly one `project_party_authority` row for her new seat, `scope=money`,
`threshold_cents=250000` — matches the household figure exactly.

**Then signed in as a plain member** (temporarily added `support@patina.dev` to the Okonkwo studio
as `role='member'` for this probe only; membership row deleted immediately after, before the final
reset). "Set the figure" rendered `aria-disabled="true"` with `aria-describedby="household-figure-
held"`, whose text — always on the face — reads: *"The change-order figure is the principal's to
set. An owner or an admin of the studio can write it."* Matches M-4's original fix. Screenshots
`household-r2-*`, `household-member-*`. DB confirms `co_threshold_cents` unchanged from the
member's session.

### Close a seat with a reason

Ray Thao's seat (Okonkwo) → "Close this seat" → "Why it closed" (visible immediately, no
disclosure toggle) filled "QA R4 walk: closing for review" → "Close the seat" → toast "Ray Thao's
seat is closed." DB: `stage=off_job`, `off_job_at=2026-09-13`,
`off_job_reason='QA R4 walk: closing for review'` — all three landed together in one write. Card's
own "PAST SEATS" region now reads "Okonkwo residence · contact OFF THE JOB Closed 13 Sep 2026."
Screenshots `close-1..4`. Console clean.

### Archive / restore, as owner

Wren Ashby QA4's card (this round's own merge survivor, so the shipped fixture stayed untouched):
"Put this card away" → *"This card was put away 13 September 2026. It stays out of the book until
it is brought back."*, `archived_at` set. Re-opened via `?includeArchived=1` → "Bring this card
back" → toast "Wren Ashby QA4 is back in the book.", `archived_at` back to NULL (confirmed by
SELECT). Screenshots `archive-1..4`. Console clean.

## 3. Console / network

Clean across the merge, bid, household (both sessions), close-seat and archive/restore flows, and
across a dedicated, deliberately slow re-walk of sign-in → doc → call sheet → household (zero
errors over 5 explicit idle checkpoints).

**One caveat, disclosed rather than silently dropped.** A pair of console errors (`TypeError:
Failed to fetch` at a Supabase `_getUser`/session-refresh call, followed by `Error logged: AppError:
Not authenticated`) appeared exactly once per browser context in several of my own automation
scripts — always immediately after `page.goto(doc, {waitUntil: 'domcontentloaded'})` fired right on
the heels of the OTP sign-in redirect, with no settle time before the next click. When I re-ran the
identical sign-in → doc → call-sheet → household sequence with realistic waits (`networkidle` +
explicit idle checkpoints) instead of firing the next navigation immediately, the pair did **not**
appear even once. Every write in every affected run still succeeded correctly (confirmed by DB
read in each case), so there was no functional consequence. I'm recording this rather than omitting
it per this task's "never filter" instruction, but I believe it is a timing artifact of my own
scripted navigation speed (faster than a person's next click), not a product defect — reported as
informational, not counted toward "clean."

- Severity: **minor**, confidence: **low** (that it is product-caused at all).

## 4. Not findings (settled, out of scope, or superseded)

- Every ruling in `rulings.md` §3 (R-A through R-BM) — none contradicted by this walk.
- The household band reading "No household is on file…" on a fresh reset — known seed gap
  (room-report §5/§10 item 2), unchanged.
- Pick-count reading "4 of 6" instead of the specimen's invented "4 of 5" — live seed data
  legitimately differs from the static fixture; not a defect (same as r2/r3).
- The consequence sentence's "31 March 2026" vs. the SPEC literal's abbreviated "31 Mar 2026" —
  same wording r1–r3 observed and left unflagged; settled.
- `add-client-letter.spec.ts` failures — `client-invite-letter` flag correctly out of this round's
  env per the brief.
- `merge.spec.ts`'s own failure — the same test self-contradiction r3 diagnosed (the spec's own
  required announcer text necessarily contains the name the spec's final line asserts is absent).
- The five other e2e failures (add-sheet ×3, person-card ×2, call-sheet ×1) — the same
  test-fixture/locator bugs r2/r3 already root-caused (hardcoded phone collision; Next's own
  route-announcer sharing `role="alert"`; an unscoped `a[data-tel-link]`); re-confirmed by reading
  each failure this round, not re-diagnosed from scratch.
- Considered and set aside for insufficient evidence: whether the merge survivor's own
  pre-existing legacy email is retained alongside the absorbed card's (only one Email row was
  visible on the survivor's card after my merge walk). My merge fixtures were created by raw SQL
  insert directly into `studio_contacts`, bypassing the Add-sheet's normal channel-creation path —
  so the older card's own email plausibly never had a `studio_contact_channels` row to begin with,
  independent of the merge. I could not re-verify after the final reset and did not want to
  overclaim a finding I can no longer produce evidence for.
- Two BLOCKING findings from the concurrent `build/w3-review-r4-migrations.md` pass — **B-1** (a
  merge silently drops the absorbed card's `profile_id`/Patina-account reach state) and **B-2** (a
  merge only repoints a contact rule when the survivor has none, so a stricter "do not contact"
  block can be silently left on the orphaned card) — are **not independently verified by me**. They
  concern scenarios (a merged-away card holding a login; a merged-away card holding a stricter
  contact rule than the survivor) that neither my merge fixture nor the shipped fixture exercises.
  I did not re-derive them; noting their existence here only so the synthesis step doesn't lose
  them, since they bear directly on the same merge flow this walk covers. Finding 3 above (B-3) I
  *did* independently reproduce live and report as my own.

## Findings summary

| # | Severity | Confidence | Summary |
|---|---|---|---|
| 3 | Blocking | High | The merge sheet's own promise — "so an old link still opens this person" — is false: `/people?person=<merged-id>` opens nothing, confirmed live on a fresh reset; no reader in the repo calls `resolve_merged_contact()`. Corroborates concurrent `w3-review-r4-migrations.md` B-3. |
| 1 | Major | High | The bring-forward picker's carried-consent notice states the wrong refusal channel ("to the studio" instead of "by text") and never names the origin project (`originProjectName: null` hardcoded) — disagrees with the Directory row, roster row and person card, which all read the same record correctly. Corroborates concurrent `w3-review-r4-code.md` MAJOR-1. |
| 2 | Minor | Medium | Two controls in the bring-forward sheet both answer to a non-exact "Put back" name lookup (the picker's own act, and DocSheet's standing "Put back · Esc" dismiss) — narrow practical impact since the full accessible names differ. |
| — | Minor | Low | A `Failed to fetch`/`Not authenticated` console-error pair appeared in several of my own automation scripts immediately after a same-tick post-sign-in navigation with no settle time; did not reproduce in a deliberate slow re-walk of the identical flow; no functional consequence in any run. Recorded as informational per "never filter," believed to be a QA-script timing artifact rather than a product defect. |

Two BLOCKING findings from the concurrent migrations review (B-1, B-2) are named in §4 for the
synthesis step but not independently verified here. Merge, bid, household (both principal and
member sessions), close-seat and archive/restore were otherwise clean — every DB write matched
what the face promised, and every prior r3 fix (QA findings 1–3, MAJOR-1..4, W3-R3-1..5) was
re-verified holding.
