# W3 (P2) — round 3 QA, against a local production build

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`. Local
only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod touched, no `.env.local`
created. Prior fix log re-checked: `build/w3-fix-log-r2.md` (14 findings: B2-1..B2-4, F1, F3,
B2R-1, M2R-1..M2R-7).

## 0. Port rule and environment

- `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `:3002` were both empty before starting — no PORT RULE
  cleanup was needed.
- `pnpm supabase:reset` run clean (rc=0, all 27 seeds, migrations through `00633` +
  `20260910152111`).
- `supabase status --workdir … -o env` supplied `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` (never printed). Built with
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus the `.env.example`-listed
  `ORDERS_SERVICE_URL` / `MEDIA_SERVICE_URL` / `PROJECTS_SERVICE_URL` /
  `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_CLIENT_PORTAL_URL` pointed at localhost.
- **First build+start attempt shipped with blank Supabase env** (a shell-scoping mistake in this
  QA round only, not a product defect — `$TMPDIR` resolves differently with the bash sandbox on
  vs. off, so a script written under one mode referenced a file that didn't exist under the
  other). Caught immediately by `next start`'s own `Error: Your project's URL and Key are
  required…` in the server log and by `curl` returning 500 on every route; rebuilt with the env
  file at a fixed absolute path and confirmed `/` → 200, `/people` → 307 (auth redirect),
  `/auth/signin` → 200 before proceeding. Noted here only so the eventual reader doesn't mistake
  it for a product finding — it never reached the SQL suites, the e2e run, or the manual walk
  below, all of which ran against the corrected build.
- `pnpm --filter @patina/types --filter @patina/supabase build` (types has a `tsc --build`
  script; `@patina/supabase` ships source, nothing to stale) then
  `pnpm --filter @patina/designer-portal build` — succeeded, full route table including `/people`
  and `/doc/[id]`.
- `next start -p 3000` served the build for the whole session; the "does not work with
  output: standalone" warning is cosmetic (same warning appeared in `w3-review-r2-qa.md`'s own
  clean run) — routes served correctly throughout, and the server log carried **zero** errors or
  warnings beyond that one line for the entire session (checked at the end via
  `grep -iE "error|warn"` over the full log).
- Port 3000 confirmed free after `kill` + 5s wait at the end of the session.
  `pnpm supabase:reset` run again after all QA writes — clean, rc=0, all 27 seeds, confirming no
  reset failure and no residue from this round's QA-only rows (a temp `support@patina.dev`
  studio membership added for the household-member negative check was removed before the final
  reset ran anyway).

## 1. SQL suites and the sweep

| Gate | Result |
|---|---|
| `w1a_identity_channels_consent_test.sql` | "All W1a assertions passed." |
| `w1b_compliance_authority_directory_test.sql` | "All W1b assertions passed." |
| `w3_merge_sweep_household_test.sql` | "W3 SQL suite: all blocks passed" — includes blocks **1c**, **2b**, **7b** added in r2's fix log for B2-1/B2-2/B2-4/B2-3 |
| `sweep_compliance_expiries()` | `{"notices": 3, "scanned": 3, "notified": 6}` — matches room-report §7 and r2's own run |

These three suites cover every migration-level r2 fix (B2-1 merge-pointer guard, B2-2 the
lapsed-head merge reorder, B2-3 the bid backfill's dropped `bid_selected_at`, B2-4 the sweep's
`merged_into IS NULL` leg) — all still green on a fresh reset. Not re-probed by hand this round
(no new probe files needed); the passing suite is the re-check.

## 2. e2e/people (chromium)

First attempt (22 tests, sandboxed bash) failed 22/22 on
`Check failed: kr == KERN_SUCCESS. bootstrap_check_in … MachPortRendezvousServer … Permission
denied` — the bash sandbox blocking Chromium's own mach-port rendezvous, not a product or test
failure. Re-run with the sandbox disabled for this one command (per the harness's own guidance:
retry with sandbox off on evidence of a sandbox-caused failure) gave a clean signal:

```
11 failed / 11 passed  (1.0m)
```

| Spec | This round | r2's own diagnosis | Status |
|---|---|---|---|
| `bring-forward.spec.ts` (both) | Now fails inside `openThePicker()`: `page.getByText("From the rolodex")` resolves to **3** elements (the state-bar button, the Call-sheet-actions menu's own copy of that button, and the DocSheet's `data-doc-sheet-title` span) — Playwright strict-mode violation | Previously died in `beforeAll` on `22P02` (F3's bug) | **F3 confirmed fixed** — the `client_id ?? null` change works, `beforeAll` now succeeds and the test reaches real interaction code for the first time. A **new** test-locator bug (unscoped `getByText`, three matches) now blocks it one step further in. See finding 3. |
| `merge.spec.ts` | Fails at its own last line: `expect(page.getByText(NEWER_NAME)).toHaveCount(0)` finds 1 | Same failure, called "real, but minor" (dropdown de-dup) | **Re-diagnosed this round, not the same defect r2 thought.** The announcer text the spec itself requires a few lines earlier (`"Two cards are now one"`) is, verbatim, `"Two cards are now one. Wren Ashby R3 carries everything W. Ashby R3 held."` — it necessarily contains `NEWER_NAME` as part of narrating the merge. The spec's final assertion asks for zero occurrences of that name anywhere on the page while the sentence it just asserted is visible still says it. **Test self-contradiction, not a product bug.** Separately, r2's actual minor Finding 2 (a merged card still selectable in the "who priced it" / "route to" dropdowns) is **independently re-verified fixed** below (§4). |
| `add-sheet.spec.ts` (task 1, task 2), `person-card.spec.ts` (task 4, R-V) | Same as r2: `addSub()`'s hardcoded `(612) 555-0115` collides with the seeded Frank Bauer fixture | Diagnosed as a test bug (hardcoded number colliding with a same-program fixture) | Unchanged, re-confirmed same root cause by reading the spec; not re-walked by hand since r2 already reproduced the app's correct dedup-by-phone behavior directly |
| `add-sheet.spec.ts` ("asks for a trade") | `getByRole("alert")` resolves 2 (the validation `<p>` and Next's own route-announcer) | Same | Unchanged, test-locator bug |
| `call-sheet.spec.ts` (task 3) | `a[data-tel-link]').first()` unscoped, picks up a Call-Sheet tel-link ahead of the site-access card's own | Same | Unchanged, test-locator bug |
| `add-client-letter.spec.ts` (both) | Times out on `client-invite-letter`-gated UI | Same — this round's env also only set `the-document-pilot:true` | Unchanged, out of this round's env scope |

Net: same 11 failures in substance as r2 (10 distinct specs, `bring-forward` counted as 2 tests),
none of them a product defect **except** that finding 3 below (bring-forward's own e2e coverage)
is still open, one bug further along than r2 left it.

## 3. Manual walk (signed in as `designer@patina.dev` via the OTP-code-through-Mailpit flow —
the local stack's "Inbucket" is actually Mailpit at `127.0.0.1:54324`; `/auth/signin` → "Email me
a one-time code" → code read from `GET /api/v1/messages` → entered)

### Task 5 — bring-forward (SPEC §5.7), at both widths

Used two fresh projects in the same studio (`QA Bring Forward Walk R3` at 1440, a second one at
390) for the same reason r2 and the wave's own e2e spec do: the seed already seats Dana/Pete/
Ingrid/Claire on Okonkwo itself, so bringing them forward there proves nothing. Screenshots:
`build/qa-w3-r3/task5-1440-*.png`, `task5-390-*.png`.

**Every §5.7 structural string is present and correctly worded** at both widths: "FROM THE
ROLODEX", the search field (filled "Lindqvist"), the pick-count line ("4 OF 6 FROM THE LINDQVIST
KITCHEN SELECTED" — 6 not 5 because this is live seed data, not the specimen's invented 5 rows;
not a defect, same as r2 noted), a checkbox + 30px circle + name + meta + history line per row,
the "WHAT TRAVELS" / "WHAT STAYS BEHIND" panes with the exact six/three items from SPEC §5.7 #5,
the act row first ("ADD FOUR TO THE ROSTER" / "PUT BACK", both live/enabled the whole time — no
`aria-disabled`, no `disabled` attribute, confirmed by reading the DOM), and the consequence
sentence directly beneath it, verbatim to the formula:
`"Adds four seats to the QA Bring Forward Walk R3. Pete Rusk arrives opted out of texting.
Northgate Electric's insurance lapsed 31 March 2026."` No schema words, no raw tokens, no name
outside the studio's own book appeared anywhere in either walk.

Confirming the count: `project_parties` for the QA project shows exactly 4 rows
(Dana/Pete/Ingrid/Claire), each `show_to_client=false` — the Birth rule (direction §5.2, F-12)
holds; no consent, no bid, no `show_to_client` was written by the insert.

**Compared directly against `shots/people-room-1440-state-pick-1440.png` and
`-390`** (read both files as part of this round, not only relied on r2's prior description):
layout, the panel structure, and the act-row/consequence-sentence wording all match. Two
divergences from what the specimen — the wave's own acceptance reference — explicitly shows, both
reproduced live and both **new** (not present in r2's findings, not previously fixed or flagged):

#### Finding 1 — BLOCKING: the bring-forward picker (and the single "Add to the roster" path)
never resolves a sub/gc/installer's trade, and the seat is born with the trade permanently blank

**Where**: `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:491`
(`addOne`'s single-add insert), `:540` (`addPicked`'s bring-forward insert), and `:731` (the mini
row's own display prop) all read `contact.specialties?.[0] ?? null` (or `c.specialties?.[0]`) for
"trade" — `specialties` is `studio_contacts`' pre-existing *vendor*-specialty column (used by the
`vendor` kind), not `trades`, the PR-f-widened FieldTrade column that a `sub`/`gc`/`installer`
card's own trade actually lives in. Confirmed on the local book:

```sql
select id, entity_kind, specialties, trades from studio_contacts
where full_name in ('Dana Kowalski')  -- and the matching firm cards
     or id = '<Northgate Electric firm id>';
-- Dana Kowalski (person): specialties {}  trades {}
-- Northgate Electric (firm, her company_id):  specialties {}  trades {electrical}
```

The firm card DOES hold the fact (`trades: {electrical}`, `{plumbing}` for Rusk Mechanical,
`{cabinetry}` for Halvorsen Cabinet Works) — the picker simply never looks there, and never looks
at the person card's own (also-empty) `trades` column either. This is the identical *shape* of
defect r2's own **F1** fixed for `company_name` (a value that lives on the linked firm's card,
read raw off the person's own never-populated legacy column) — F1's fix
(`directoryFirmOf()`/`people_directory`'s `meta.company_name`) covers company **name** at these
same three call sites, but nothing analogous was done for **trade**.

Live, on screen: SPEC §5.7 #4 requires "name, firm and trade" (e.g. "Dana Kowalski · Northgate
Electric · electrical") and the wave's own room report (§3, F1's description) explicitly claims
this round delivers "KIND · FIRM · TRADE." The live picker shows **"SUBCONTRACTOR · NORTHGATE
ELECTRIC"** — kind and firm only, trade silently absent — for every one of Dana Kowalski, Pete
Rusk, and Ingrid Halvorsen, at both 1440 and 390 (`task5-1440-2-four-ticked.png`,
`task5-390-1-search.png`). The specimen screenshot this round was told to compare against,
`shots/people-room-1440-state-pick-1440.png`, shows "Northgate Electric · electrical" in exactly
this position — the live app disagrees with the wave's own reference.

**This is not only a display gap.** `useBringForward`'s insert (`use-coordination.ts:2537`)
writes `trade: pick.trade?.trim() || null` from whatever the caller hands it, and the caller is
the same broken `c.specialties?.[0]` expression (rolodex-picker.tsx:540). Confirmed on the seats
this walk actually created:

```sql
select sc.full_name, pp.trade from project_parties pp
  join studio_contacts sc on sc.id = pp.studio_contact_id
  where pp.project_id = '<QA Bring Forward Walk R3>';
--  Dana Kowalski    | ''   (should be 'electrical')
--  Pete Rusk        | ''   (should be 'plumbing')
--  Ingrid Halvorsen | ''   (should be 'cabinetry')
--  Claire Bissett   | 'tile_stone'   (correct — she is `vendor` kind, and `specialties`
--                                     happens to be the RIGHT legacy column for a vendor)
```

PR-b's own ruling is that "name at time and trade on the job stay snapshotted" at seat birth, and
the room report (§3) states this is delivered. For any `sub`/`gc`/`installer` whose trade lives
in the widened `trades[]` column — which is most of the seed's own subs, and per PR-f is now the
studio's normal path for a construction trade going forward — the seat's own permanent trade
snapshot is silently blank from the moment it is born, and nothing later can recover it (it is a
snapshot by design, not a live read). Claire's own correct landing (a `vendor`, whose trade
happens to sit on the legacy column the code actually reads) is what makes this easy to miss in a
walk that doesn't check the database.

- Severity: **blocking** — a permanently wrong (empty, where a known trade exists) fact written
  to the seat's own record, visible on every future Call Sheet read of that seat's trade, and a
  direct contradiction of this wave's own room-report claim for the exact fix (F1-shaped) it says
  it delivered for trade.
- Confidence: **high** — reproduced live at both widths, traced to three exact call sites, and
  confirmed with a direct SQL comparison of what the firm card holds vs. what landed on the seat.
- Fix direction: read `contact.trades?.[0]` (own card) falling back to the linked firm's own
  `trades[0]` the same way `directoryFirmOf()` already resolves `company_name` — one function,
  reused at all three call sites (`491`, `540`, `731`), plus the two callers already loaded
  `contacts` (all `studio_contacts` rows including companies) so no new query is needed, mirroring
  F1's own "no new cost" note.

#### Finding 2 — BLOCKING: at 390px, the picker's person-name text renders at zero width — the
name is invisible on the face, though present in the DOM

**Where**: `apps/designer-portal/src/components/document/roster/party-mini-row.tsx` — the shared
`PartyMiniRow` (its own docstring: "every picker in the portal gets better for free"), in its
`selectable`/`multi` (checkbox) mode as used by the bring-forward picker. At 390 the row's flex
layout (avatar 30px + `<span class="block truncate … min-w-0 flex-1">{name}</span>` + up to three
`StateWord`/`ReachChip` badges, all forced onto one line) leaves the name's flex box **zero
width**:

```js
// getBoundingClientRect() on the "Ben Ostrom" name span at 390px:
{ x: 122.5, y: 454.5, w: 0, h: 22.7 }
color: rgb(44,41,38)   // fully opaque, not a color/contrast bug
visibility: visible; opacity: 1; display: block
class: "block truncate text-[0.84rem] text-[var(--color-charcoal)]"
```

`truncate` (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) on a zero-width box
renders **nothing** — not even an ellipsis. The text is genuinely in the DOM (confirmed via
`page.locator('body').innerText()`, which lists every name — "Ben Ostrom", "Claire Bissett",
"Dana Kowalski", etc. — in order), so a screen reader announcing the row's accessible name (the
whole `<button role="checkbox">`'s text content) is unaffected; a **sighted person on a phone
cannot read who they are picking at all**. Confirmed at both `task5-390-2-four-ticked.png` (every
row shows an avatar circle, then straight into "Worked N prior project(s)…" with a blank line
where the name belongs) and by reading the specimen this round was told to compare against —
`shots/people-room-390-state-pick-390.png` shows "Dana Kowalski" fully legible above "Northgate
Electric · electrical" at the same 390 width. The live app disagrees with its own reference here
too.

Root cause, structurally: `PartyMiniRow`'s single flex row never gained a 390 stacking rule the
way the Directory/roster rows did (SPEC §6.2's Row rule: name on its own line, then a second line
for the words) — it keeps trying to fit avatar + name + up to three chips on one line at every
width, and CSS's flexbox `min-w-0` + `flex-1` collapses the name to nothing when the siblings
don't leave room, rather than wrapping.

- Severity: **blocking** — the primary identifying fact on the row (who this is) is unreadable at
  one of the program's two contractual widths, on the exact specimen this round is told to
  diff against.
- Confidence: **high** — reproduced with `getBoundingClientRect`/`getComputedStyle` (not a
  screenshot artifact — the box is genuinely 0px wide), and directly contradicted by the shipped
  390 specimen for this same state.
- Fix direction: give the picker's mini row (at least in `multi`/checkbox mode) the same 390
  line-1/line-2 discipline SPEC §6.2 already mandates for the Directory and roster rows — name on
  its own line (wrap, never truncate), badges/words on a line beneath — rather than one row that
  silently loses the name when it runs out of horizontal room.

#### Finding 3 — MAJOR: the wave's own task-5 e2e spec (`bring-forward.spec.ts`) still cannot
complete a run — one bug further in than r2 left it

**Where**: `apps/designer-portal/e2e/people/bring-forward.spec.ts:107`,
`openThePicker()`: `await expect(page.getByText("From the rolodex")).toBeVisible(...)`. r2's F3
fix (`client_id ?? null`) is **confirmed working** — `beforeAll` now succeeds and both tests reach
real page interaction for the first time. But this line is an unscoped `getByText`, which now
resolves to **three** elements once the picker is open: the state-bar/toolbar button labelled
"From the rolodex", the same button's copy inside the "Call sheet actions" menu, and the
DocSheet's own `data-doc-sheet-title="true"` span — a Playwright strict-mode violation, so the
test still never reaches its real assertions.

- Severity: **major** (per r2's own framing of the identical situation: a Leah task's own
  automated verification coverage is still broken, has still never produced a passing run — this
  round only moved the failure point deeper).
- Confidence: **high** — reproduced deterministically twice (7-worker and default runs gave the
  same failure), root cause is the exact locator and its three matches, listed above.
- Fix direction: scope the wait to the sheet itself, e.g.
  `page.locator('[data-doc-sheet-title]', { hasText: 'From the rolodex' })`, or wait on
  `[data-doc-sheet="true"]`'s presence rather than free text that also appears on the button that
  opened it.
- Not a product defect: the feature itself is verified working by hand in this same round (task 5
  walk above).

### Merge two duplicate cards

Wrote a fresh phone collision (`Wren Ashby R3` / `W. Ashby R3`, same number, different
`created_at`, same shape as the wave's own `merge.spec.ts` fixture) so the shipped fixture was
untouched. Screenshots `build/qa-w3-r3/merge-*.png`.

- Duplicate band: "These two cards share a phone. W. Ashby R3 Wren Ashby R3 COMPARE THESE TWO" —
  matches R-Y.
- Compare sheet: older card (`Wren Ashby R3`) pre-picked, consequence sentence **verbatim** to
  M2R-2's fixed wording: *"W. Ashby R3's seats, channels, contact rule and firm designations move
  onto Wren Ashby R3. Consent stays with the number, not with the card, so nobody's yes or no
  changes. W. Ashby R3's paper stays on W. Ashby R3's card and is still readable there; where Wren
  Ashby R3 already holds the same paper, still in force, the older one is marked superseded. W.
  Ashby R3's card is kept as a record of the merge, and both ways of reaching this person still
  work."* — **M2R-2 confirmed fixed** (the old, wrong "paper moves" promise is gone).
- `Merge into Wren Ashby R3` clicked → the Room announced *"Two cards are now one. Wren Ashby R3
  carries everything W. Ashby R3 held."* and navigated to the survivor's own card. On that card
  page, `W. Ashby R3` (the merged/newer name) appears **nowhere** except inside that one
  announcement sentence — no stray reference in Channels, Contact rule, Access grants, Seats, or
  History.
- **r2's own minor Finding 2 (a merged-away card still independently selectable in the "who
  priced it" / route-to dropdowns) re-checked and confirmed fixed** — opened the Rivera Finishes
  bid editor's "WHO PRICED IT" `<select>` (30 options) immediately after this merge: `Wren Ashby
  R3` (the survivor) is listed, `W. Ashby R3` (the merged card) is **not**. M2R-5's fix
  (`.is('merged_into', null)` default on `useStudioContacts`) holds for at least this call site.
- Console clean throughout.

### Edit a bid outcome (Rivera Finishes, Okonkwo)

Opened the unfold → "Change what came back" → outcome selector read "Nothing recorded yet" with
`data-bid-note` showing "Asked 28 September 2026. Due 5 October 2026." (matching the seed).
Selected "They declined", pressed "WRITE THE BID". DB:

```sql
select display_name, bid_outcome, stage from project_parties where id = '<Rivera Finishes seat>';
--  Rivera Finishes | declined | declined
```

`stage` and `bid_outcome` moved together (MAJOR-7/M-6's original fix, still correct — a losing
bidder is never left sitting in a live crew band). Screenshots `bid-1..5`. Console clean.

### Add a household member with a threshold as the principal; confirm a member cannot

Fresh reset meant the Okonkwo residence's household band read "No household is on file for this
client…" (room-report §5's known seed gap, unchanged, not a finding). Signed in as
`designer@patina.dev` (studio **owner** = the principal here), pressed "OPEN A HOUSEHOLD" —
`client_households` row minted with `member_person_ids` = Adaeze's and Chidi's cards (matching PR-c's
own sentence, confirmed by SELECT). Pressed "SET THE FIGURE", filled `2500`, "WRITE THE FIGURE" →
`co_threshold_cents = 250000`, band now reads "The change-order figure is on the record." /
"Change orders over $2,500 need a signature from the household."

Then "ADD A HOUSEHOLD MEMBER" → picked **Sofia Ferraro** (not previously on this project), role
"SIGNS FOR THE HOUSEHOLD". Consequence sentence read **verbatim** to B2R-1's fixed wording: *"This
person joins the household and takes a seat on the Okonkwo residence. They may sign money to
$2,500. Nothing is sent to them."* — **B2R-1 confirmed fixed**. Pressed "ADD TO THE HOUSEHOLD". DB:

```sql
select member_person_ids from client_households;         -- now includes Sofia's card id
select scope, threshold_cents from project_party_authority
  where engagement_id = '<Sofia's new Okonkwo seat>';     -- money | 250000
```

Exactly one authority row, scope `money`, threshold matching the household figure — correct.

**Then signed in as a plain member** (temporarily added `support@patina.dev` to the Okonkwo
studio as `role='member'` for this probe only; membership row deleted immediately after, before
the final reset). "SET THE FIGURE" rendered:

```html
aria-disabled="true" aria-describedby="household-figure-held"
```

with the described text *"The change-order figure is the principal's to set. An owner or an admin
of the studio can write it."* always on the face — matches M-4's original fix precisely. Clicked
it with `force: true` anyway (bypassing Playwright's own disabled-check) to be sure nothing
fires: `co_threshold_cents` was unchanged (`250000`) afterward, and no request was observed.
Screenshots `household-1..7`, `household-member-1..2`. Console clean throughout both sessions.

### Close a seat with a reason

Ray Thao's seat (Okonkwo, "CONTACT · City of Minneapolis, CPED Inspections") → "CLOSE THIS SEAT" →
filled "Why it closed" (`label`-associated input, visible immediately, no disclosure toggle) with
"QA R3 walk: closing for review" → "CLOSE THE SEAT". DB:

```sql
select stage, off_job_at, off_job_reason from project_parties where id = '<Ray Thao's seat>';
-- off_job | 2026-09-13 | QA R3 walk: closing for review
```

All three landed together in one write. Screenshots `close-1..4`. Console clean.

### Archive / restore, as owner

Wren Ashby R3's card (the merge survivor from earlier in this walk, so nothing in the shipped
fixture was touched): "PUT THIS CARD AWAY" → one press → card header read *"This card was put
away 13 September 2026. It stays out of the book until it is brought back."*, `archived_at` set
(confirmed by SELECT). Re-opened via `?includeArchived=1` (PR-j: query params stay in the address
and this one round-trips through a reload) → "BRING THIS CARD BACK" → `archived_at` back to
`NULL`. Screenshots `archive-1,2,4,5`. Console clean.

## 4. Console / network

Zero console errors or `pageerror`s across every script in this walk (task 5 ×2 widths, merge,
bid, household ×2 sessions, close-seat, archive/restore) — each script's own
`page.on('console', …)`/`page.on('pageerror', …)` listener returned an empty array every time.
The designer-portal server's own stdout/stderr log carried nothing beyond the one benign
`"next start" does not work with "output: standalone"` line for the entire session (checked via
`grep -iE "error|warn"` over the full log after stopping the server).

## 5. Not findings (settled or out of scope)

- Every ruling in `rulings.md` §3 (R-A through R-BM) — none contradicted by this walk.
- The household band reading "No household is on file…" on a fresh reset — `w3-room-report.md`
  §5/§10 item 2's known seed gap, unchanged.
- Pick-count reading "4 of 6" instead of the specimen's invented "4 of 5" — live seed data
  legitimately differs from the static fixture; not a defect (same as r2).
- `add-client-letter.spec.ts` failures — `client-invite-letter` flag correctly out of this round's
  env per the brief.
- `merge.spec.ts`'s own failure — re-diagnosed above (§2) as a test self-contradiction, not the
  product defect r2 thought it might be; the actual product-facing concern r2 flagged (a merged
  card still choosable in a dropdown) is independently re-verified fixed in §3.
- The `bring-forward.spec.ts` failure point — real (finding 3), but a one-line test-locator fix;
  not evidence against the shipped feature, which this round's manual walk verifies directly.
- The shell-scoping mistake in this QA round's own first build attempt (§0) — a $TMPDIR artifact
  of this session's tooling, caught before it touched any gate, not a product finding.

## Findings summary

| # | Severity | Confidence | Summary |
|---|---|---|---|
| 1 | Blocking | High | Bring-forward picker and single-add path never resolve a sub/gc/installer's trade (read `specialties` instead of `trades`/the firm card); the seat's own permanent trade snapshot lands empty — `rolodex-picker.tsx:491,540,731` |
| 2 | Blocking | High | At 390px the picker's person-name text renders at zero width (CSS layout collapse) — the name is invisible though present in the DOM — `party-mini-row.tsx` (`multi` mode) |
| 3 | Major | High | `bring-forward.spec.ts` still cannot complete a run — F3's `beforeAll` fix holds, but a new unscoped-locator strict-mode violation blocks `openThePicker()` one step further in — `e2e/people/bring-forward.spec.ts:107` |

Zero blocking-per-r2's-own-criteria items regressed (all r2 fixes directly re-verified: F1, F3,
B2R-1, M2R-2, M2R-5 by hand; B2-1..B2-4 by the passing SQL suite). Two **new** blocking findings
surfaced this round, both in the bring-forward picker's own presentation of the very rows SPEC
§5.7 and this round's specimen comparison exist to police — the merge, bid, household, close-seat
and archive/restore flows were all clean.
