# W3 (P2) — round 2 QA, against a local production build

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. `pnpm supabase:reset` run before and after this round; SQL suites
(`w1a_identity_channels_consent_test.sql`, `w1b_compliance_authority_directory_test.sql`,
`w3_merge_sweep_household_test.sql`) all pass on the reset database, matching
`w3-fix-log-r1.md`'s claim. `sweep_compliance_expiries()` run once
(`{"notices": 3, "scanned": 3, "notified": 6}`), matching the room report.

**Build**: `pnpm --filter @patina/designer-portal build` with the local env inline
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, local anon/service keys from
`supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`) — succeeded, full route table
printed. `next start -p 3000` served the build (port 3000 had no prior listener; freed
and confirmed empty at the end via `lsof -nP -iTCP:3000 -sTCP:LISTEN`).

**Prior-round findings, re-checked**: every fix in `w3-fix-log-r1.md` (B-1, B-2, M-1..M-7,
QA-1, QA-3/MAJOR-6, QA-4/BLOCKING-1, QA-5, MAJOR-1..7) is confirmed **still fixed** by the
passing SQL suite and by the runtime walk below (merge, bring-forward, bid, household all
exercise the code these findings touch, and none regressed). No prior finding is open.

## e2e/people (chromium)

Ran twice against the same running server: 7 workers (default) and `--workers=1`, to rule
out cross-test contention before treating a failure as real. **Same 10 failures both times**
— not flakiness.

```
11 failed / 11 passed (7 workers)   ·   10 failed / 11 passed / 1 did not run (1 worker)
```

Investigated every failure by reproducing it in a standalone signed-in session (not just
reading the stack trace):

| Spec | Root cause found | Verdict |
|---|---|---|
| `bring-forward.spec.ts` (both tests) | `client_id: seed.data.client_id ?? "bring-forward-e2e"` (line 67) — Okonkwo's `client_id` is NULL (confirmed: `SELECT client_id FROM projects WHERE id='d0e0...000a'` → empty), so the fallback string is sent to a `uuid` column → `22P02`. The spec's own setup has never once succeeded. | **Test bug**, not a product bug. Feature itself verified working manually (below). |
| `merge.spec.ts` | Confirmed live (see finding 2 below): a merged card's name still appears as a `<select><option>` in at least two dropdowns (contact-rule "route to", bid "who priced it") after settling on the survivor's own card. The DB-side merge, the announcer, and the duplicate-band removal are all correct. | **Real, but minor** (finding 2). |
| `add-sheet.spec.ts` (task 1, task 2), `person-card.spec.ts` (task 4, R-V) | All four call `addSub()`, which hardcodes mobile `(612) 555-0111` / `(612) 555-0115`. The seed's own **Frank Bauer** fixture (added for this same program, task 4's do-not-contact specimen) already holds `(612) 555-0115`. Reproduced directly: submitting "Add to the roster" with that number does **not** create a new card — the app correctly detects the existing number and attaches the seat to Frank Bauer's card, banner: *"That number is already on file for Frank Bauer, so this seat and what you wrote sit on Frank Bauer's card."* `cardByName(newName)` then polls forever for a row that was never going to exist. | **Test bug** (hardcoded phone collides with a seed fixture from the same program). The app's own dedup-by-phone + banner behavior is correct. |
| `add-sheet.spec.ts` ("asks for a trade") | `getByRole("alert")` resolves 2 elements: the validation `<p role="alert">` and Next.js's own `#__next-route-announcer__` (also `role="alert"`, framework-injected on every page). | **Test-locator bug** (unscoped selector), not an app defect. |
| `call-sheet.spec.ts` (task 3, site access) | `page.locator('a[data-tel-link]').first()` is unscoped; the page has 33 `[data-tel-link]` elements once the site-access card opens over the still-mounted Call Sheet, and DOM order puts several Call-Sheet tel-links before the site-access card's own. Scoped to the site-access card container directly, the order is correct: Luis Ochoa (Superintendent) first, then Chidi Okonkwo, then Sam Rowe. | **Test-locator bug**, not an app defect. Verified via `[data-site-access-card] a[data-tel-link]` → `["Luis Ochoa, Superintendent, ...", "Chidi Okonkwo, Owner, ...", "Sam Rowe, Architect, ...", ...]`. |
| `add-client-letter.spec.ts` (both) | Times out on `client-invite-letter`-gated UI. My server ran with only `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, the exact flag set this round's brief specifies — `client-invite-letter` was never in scope for this env. | **Out of this round's env scope**, not evaluated further. |

Net: of 10 failing specs, 1 surfaces a real (minor) product gap, 1 (`bring-forward.spec.ts`)
means task 5's own automated coverage has **never executed successfully** — worth fixing
before anyone reports it "passing" — and the rest are e2e-authoring bugs unrelated to product
behavior. None of this changes the `clean` verdict below since none rises past minor.

## Manual walk (signed in as designer@patina.dev, password123 — real UI, not the fixture)

### Task 5 — bring-forward (SPEC §5.7)
Used a fresh project (`QA Bring Forward Walk`, same designer/studio as Okonkwo — created
because the seed already seats Dana/Pete/Ingrid/Claire on Okonkwo itself, same reason the
wave's own spec avoids Okonkwo). Opened Call Sheet → From the rolodex → searched "Lindqvist".

Screenshots: `task5-1440-search-lindqvist.png`, `task5-1440-four-ticked.png`,
`task5-1440-after-confirm.png`, `task5-390-picker-opened.png`.

Every §5.7 structural element is present and correct: state title "From the rolodex",
search field, pick-count line ("4 OF 6 FROM THE LINDQVIST KITCHEN SELECTED" — 6 not 5
because this is live seed data, not the static specimen's invented 5; not a defect), a
checkbox + circle + name + history line per row, "What travels" / "What stays behind" pane,
the act row first ("ADD FOUR TO THE ROSTER" / "PUT BACK") with the consequence sentence
directly beneath, both live the whole time (never `aria-disabled`). The insert wrote exactly
4 `project_parties` rows. Compared against
`shots/people-room-1440-state-pick-1440.png` and `-390`: layout, row order, and every string
family match except the one described in finding 1 below.

**Finding 1 (blocking)** — the consequence sentence and every per-row expiry-notice clause
name the **person**, not the firm, whenever `company_id` is set but the legacy
`studio_contacts.company_name` text column is empty — see below.

### Merge two duplicate cards
Wrote a fresh phone collision (`Wren Ashby QA` / `W. Ashby QA`, same number, different
`created_at`) so the shipped fixture was untouched. Compare-merge sheet: older card
pre-picked (`aria-pressed="true"`), consequence sentence exact match to the room report's
wording, `Merge into Wren Ashby QA` click wrote `studio_contact_merges`
(survivor/merged/matched_on all correct), `resolve_merged_contact(newer)` → survivor,
`merged_into` set, `archived_at` still NULL. The room announced "Two cards are now one." and
the duplicate band disappeared; the page navigated to the survivor's own card (matching
room-report §2's documented behavior). See finding 2 for the one thing that didn't fully
clean up. Screenshots: `merge-1..4`.

### Edit a bid outcome (Rivera Finishes, Okonkwo)
Opened Rivera Finishes' unfold → "Change what came back" → outcome selector correctly reads
"No response" (`data-bid-note`: "Asked 28 September 2026. Due 5 October 2026.", matching M-6).
Changed the outcome to "They declined" and saved. DB: `stage` and `bid_outcome` both moved to
`declined` together (MAJOR-7/M6's fix, still correct — a losing bidder cannot silently sit in
a crew band). Screenshots: `bid-5-editor-open.png` (dumps the full field/option set),
`bid-6-outcome-changed.png`, `bid-7-after-save.png`.

### Add a household member with a threshold, as the principal; confirm a member cannot
The Okonkwo residence's household band read "No household is on file for this client..." on
first open (room-report §5 "owed" item — confirmed still true fresh off a reset), so I
pressed "Open a household" as the owner (`designer@patina.dev`) — this wrote a
`client_households` row with `member_person_ids` = Adaeze's and Chidi's cards (confirmed
`SELECT * FROM client_households` afterward). As owner, "Set the figure" is enabled
(`aria-disabled` absent/false); filled 2500, pressed "Write the figure" →
`co_threshold_cents = 250000` on the household row, confirmed by SELECT.

Then signed in as a **plain member** (temporarily added `support@patina.dev` to the
Okonkwo studio with `role='member'` for this probe only, removed by the final DB reset):
"Set the figure" renders `aria-disabled="true"` with `aria-describedby="household-figure-held"`
pointing at the exact sentence *"The change-order figure is the principal's to set. An owner
or an admin of the studio can write it."* — matches M-4's fix precisely.
Screenshots: `household-owner-A..H`, `household-member-A/B`.

### Close a seat with a reason
Sam Rowe's seat (first attempt) closed but the reason wasn't captured — my own script error
(I targeted a `<textarea>`; the field is a plain `<input id="close-seat-<id>">` labeled "Why
it closed", visible immediately, no disclosure toggle at all). Retried correctly on Tom
Marrow's seat: filled "Why it closed" via its label, pressed "Close the seat". DB:
`stage='off_job'`, `off_job_at='2026-09-13'`, `off_job_reason='QA walk: closing for review'`
— all landed together. Screenshots: `tom-0..4`.

### Archive / restore, as owner
Claire Bissett's card: "Put this card away" → confirmed archived
(`archived_at` set, card header read "This card was put away 13 September 2026. It stays out
of the book until it is brought back."); her still-open Okonkwo seat was unaffected (cards
and seats are independent, as designed). "Bring this card back" → `archived_at` back to NULL.
Screenshots: `claire-diag.png`, `archive-5-before-restore.png`, `archive-6-restored.png`.

### Console / network
Only errors seen across every walk: a `TypeError: Failed to fetch` + `AppError: Not
authenticated` pair on the very first paint of `/auth/signin`, before sign-in completes (a
premature session check racing the not-yet-authenticated state) — present on every fresh
context, including ones that never touched a People-room feature. Not reproduced after
sign-in, not touching any code this wave shipped. No other console errors during any of the
five feature walks.

## Findings

### Finding 1 — BLOCKING: the compliance-notice/bring-forward sentence names the wrong
entity when a card's firm is linked via `company_id` rather than the legacy `company_name`
text column

**Where**: `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:388-410`
(`paperClauseFor`, `pickedFacts`) — both call
`noticedPaperClause([contact.company_id, contact.id], contact.company_name ?? contactName(c), ...)`.
The same pattern (`??` falling back to the person's own name whenever `company_name` is
null) is the documented shape of `company-card.tsx:508` and is the exact defect W2's own
round 5 QA flagged as **BLOCKING QA-1** — "identity line/company_name never resolved" — and
round 7 marked fixed, but **only for the Directory row and person-card header**
(`w2-review-r7-qa.md:83`, `w2-review-r5-qa.md:93-111`). The fix was a SQL-view join
(`people_directory`'s `meta.company_name`); the picker (a W2/W3 surface) and, on this
evidence, `roster-row.tsx`/`company-card.tsx` never got the same join and still read the
raw, never-backfilled column.

**Confirmed on the local seed** (not test data — every seeded sub with a `company_id` is
affected):
```
select sc.full_name, sc.company_name, comp.legal_name
from studio_contacts sc left join studio_contacts comp on comp.id = sc.company_id
where sc.entity_kind='person' and sc.company_id is not null;
-- all 22 rows: company_name is NULL, comp.legal_name is populated
--   (e.g. Dana Kowalski | NULL | Northgate Electric Inc)
```

**Live, reproduced twice** (once via the automated task-5 walk, once via a standalone check):
- Every picker mini row is missing its firm entirely — SPEC §5.7 #4 requires
  "Dana Kowalski · Northgate Electric · electrical"; the live row prints
  "Dana Kowalski / SUBCONTRACTOR" with no firm segment at all
  (`task5-1440-four-ticked.png`).
- The bring-forward consequence sentence read **"Adds four seats to the QA Bring Forward
  Walk. Pete Rusk arrives opted out of texting. Dana Kowalski's insurance lapsed 31 March
  2026."** — SPEC §5.7 #7 requires the clause to name the **firm** ("Northgate Electric's
  insurance lapsed 31 Mar 2026."), not the person carrying the seat. The insurance in
  question is Northgate Electric's, not Dana's own; naming her personally is a wrong fact on
  the face (`task5-1440-four-ticked.png`).

This is a live, load-bearing defect on this wave's own SPEC-mandated exact wording (§5.7 #4,
#7; the same formula also feeds the roster-row and company-card expiry clauses per
`w3-room-report.md` §7's own table), not confined to the fixture-only static specimen. Any
studio whose sub cards were created/linked through the affiliation model (00592/`company_id`)
rather than by literally typing the firm's name into the legacy free-text field will see this
on every roster surface that names a firm.

- Severity: **blocking** (wrong fact on a face, per this round's own definition).
- Confidence: **high** — reproduced live, root cause identified in source, and confirmed as
  the exact code shape a prior W2 round already flagged and only partially fixed.
- Fix direction: resolve the display name the same way the Directory/person-card fix does —
  join `company_id → legal_name/dba_name` (or read the same `people_directory`/
  `identity_paper_state`-style resolution) wherever a caller currently reads
  `contact.company_name` directly: `rolodex-picker.tsx` (`paperClauseFor`, `pickedFacts`,
  and the mini-row's own firm/trade subline), and confirm `roster-row.tsx`/`company-card.tsx`
  aren't reading the same raw column for anything client-facing.

### Finding 2 — MINOR: a merged (non-surviving) card still appears as a selectable option
in unrelated dropdowns after merge

**Where**: reproduced live after a real merge (Wren Ashby QA / W. Ashby QA) — the merged
card's name is still offered as an option in the contact-rule "route contact to" selector
and the bid editor's "Who priced it" selector, alongside the survivor. The merge itself is
correct (DB record, `merged_into`, `resolve_merged_contact`, the Directory/duplicate-band
removal, the room announcement all check out), and the card is deliberately kept resolvable
by design ("both ways of reaching this person still work") — but a merged-away identity
being independently *choosable* as a routing target or a bid-pricer, rather than resolving
through to the survivor or being excluded, reads as the room still treating it as a live
identity in these two spots.

- Severity: **minor**.
- Confidence: **medium** — clearly reproduced (screenshots + bid-editor option dump listing
  both `W. Ashby QA` and `Wren Ashby QA`), but whether this is a genuine miss or an
  accepted consequence of "both ids stay resolvable" is a product-intent question, not a
  clear-cut defect.
- Not the direct cause of `merge.spec.ts`'s failure (that assertion targeted the Directory
  listing page's own text, and the app's designed post-merge navigation to the survivor's
  card makes the spec's assumption about which page it's still on unreliable either way);
  worth a ruling either way, not a blocker.

### Finding 3 — MAJOR: the wave's own task-5 e2e spec (`bring-forward.spec.ts`) has never
executed successfully

**Where**: `e2e/people/bring-forward.spec.ts:67` —
`client_id: seed.data.client_id ?? "bring-forward-e2e"`. Okonkwo's own `client_id` is NULL
(confirmed by SELECT), so every run sends the literal string `"bring-forward-e2e"` to a
`uuid`-typed column and fails `beforeAll` with `22P02` before either test body runs. This
predates this round (present since the spec was written in W3's first pass) and was not
caught by W3's own SQL/jest gates, because it only shows up when a server actually runs
the spec — which `w3-fix-log-r1.md`'s own "Owed" section anticipated ("the next round with
a server should be the first honest read of them"). This round is that read, and the result
is the spec still cannot start.

- Severity: **major** (a Leah task's own verification coverage is broken — task 5's
  acceptance has now only ever been confirmed by hand, never by the automated suite meant to
  pin it).
- Confidence: **high** — reproduced deterministically, root cause is a one-line literal.
- Fix direction: use `seed.data.client_id ?? null` (the column is nullable) rather than a
  non-uuid placeholder string, or seed a real client id for the probe project.

## Not findings (settled or out of scope)

- Every ruling in `rulings.md` §3 (R-A through R-BM) — none contradicted by this walk.
- `add-client-letter.spec.ts` failures — `client-invite-letter` flag was correctly out of
  this round's env per the brief; not evaluated.
- The household band reading "No household is on file..." on a fresh reset — `w3-room-report.md`
  §10 item 2 already owns this as a known seed gap, not a defect.
- Pick-count reading "6" instead of the static specimen's "5" — live seed data legitimately
  differs from the invented fixture; not a defect.

## Gates re-run this round

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (before) | clean, all 27 seeds |
| `w1a_identity_channels_consent_test.sql` | "All W1a assertions passed." |
| `w1b_compliance_authority_directory_test.sql` | "All W1b assertions passed." |
| `w3_merge_sweep_household_test.sql` | "W3 SQL suite: all blocks passed" |
| `sweep_compliance_expiries()` | `{"notices": 3, "scanned": 3, "notified": 6}` |
| `pnpm --filter @patina/designer-portal build` (local env inline) | succeeded, full route table |
| `next start -p 3000` | served; `/` → 200, `/people` → 307 (auth redirect, expected) |
| `npx playwright test e2e/people --project=chromium` (7 workers) | 11 passed / 11 failed |
| same, `--workers=1` | 11 passed / 10 failed / 1 did not run — same failures, ruling out contention |
| `pnpm supabase:reset` (after) | clean, all 27 seeds — confirms no reset failure, no QA residue left behind |
| Port 3000 | confirmed free after `kill` + 5s wait, both rounds |

Screenshots: `build/qa-w3-r2/*.png` (44 files). Console/network capture:
`build/qa-w3-r2/console-errors.json`, `console-errors-2.json`.
