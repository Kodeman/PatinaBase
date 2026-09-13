# W5 review — round 4 (SwiftUI + product)

Reviewer pass over `395cd420a` ("the People room on the designer's phone"), `a19e548cb` (r1 fix),
`35ec452e4` (r2 fix), `2b4d8afe4` (r3 fix — the link's real end date, the card's own change log, and
the job as the gate). Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Nothing outside `apps/mobile/Capture/**` and this
`build/w5-*` file (plus `build/ios-w5-review-r4/`) was touched by this review.

**Claim ladder.** `capture-gate.sh all` run fresh (sandbox disabled for the Xcode/CoreSimulator
calls — inside the sandbox it dies on CoreSimulatorService/DerivedData permission denials, same as
every prior round): `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) ·
✔ principle-4 sweep`. The app was then driven on the booted iPhone 17 Simulator (udid
`C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout, mock mode) via `capture-run.sh
PR1.roster` and blitz-iphone: roster → opened Chidi Okonkwo's card (PR-t) → back → opened the site
access card → scrolled to "Who was told" → logged a note ("Told Marcus Reyes about the lockbox.",
landed, "Written down.") → back to roster → scrolled to the mint act → filled the sheet and minted a
link for "Marcus Reyes" (landed, mock). Screenshots in `build/ios-w5-review-r4/`. Findings below are
**sim-verified** unless marked otherwise.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted\|sms_consent_status\|consentStatus" apps/mobile/Capture --include="*.swift"`,
independently re-run this round. Every hit is one of: a comment naming R-AV and stating the frozen
column is deliberately absent (`SupabaseSiteRequestService.swift:17`); `PunchTaskWrite.swift`'s pure
value type, which only ever consumes an already-resolved `smsConsentGranted: Bool` and touches no
table; or a `consentStatus` field typed against `people_directory_seats.consent_status` /
`people_directory.consent_status` (`PeopleRoomWire.swift`, `SupabasePeopleRoomService.swift`) or
`SupabaseSiteRequestService`'s `seatConsentColumns = "seat_id,consent_status"` read from
`people_directory_seats` — all record-backed, none the frozen `project_parties.sms_consent_status`.
`SupabaseSiteRequestService.partyColumns` (line 20) no longer carries `sms_consent_status` at all,
and `seatConsent(projectID:)` is the sole consent reader for both `PunchCourtResolver`'s path
(`fieldParties`) and the site-request assignee path, both keyed off `people_directory_seats`.
**No Swift file reads the frozen column for a verdict. This check is clean, independently
reconfirmed for the fourth round running.**

## Round 3's two MAJORs (12, 13), verified fixed

- **12 — the mint's expiry sentence.** `FieldLinkExpiry.resolve(windowEnd:)`
  (`CaptureKit/Work/FieldRosterRules.swift:434-448`) now mirrors 00627's own branches (seat window's
  later-of-`on_site_to`/`warranty_until`, through the end of that day, else the 90-day fallback) and
  is fed real `InsertedRow.windowEnd` from `SupabasePeopleRoomService.mint(...)` — no more borrowing
  a date off the fixture. **Live-reconfirmed this round**: with no window on the minted seat (the
  branch this screen's own UI, having no window field, always takes), the result read exactly "The
  job carries no window yet, so it ends 11 December 2026 — ninety days from today." Today is
  2026-09-12; +90 days is 2026-12-11 — correct (`ios-w5-review-r4/pr1-mint-result.png`). The mock
  (`PeopleRoomMocks.swift:319-332`) takes the identical `FieldLinkExpiry.resolve(windowEnd: nil)`
  branch rather than borrowing a fixture date, so the sim now exercises the real branch. Four new
  tests in `FieldLinkExpiryTests` cover the window/no-window/closed-window cases. **Fixed, confirmed
  live.**
- **13 — "Who was told" unconditionally empty in real mode.** `siteAccess()`'s select list
  (`SupabasePeopleRoomService.swift:161-169`) now carries `changed_by, told_refs` alongside
  `changed_at`; `SiteAccessRow.card(...)` (`PeopleRoomWire.swift:249-286`) builds one
  `FieldSiteNotice` from the card's own row when `changed_at` is present, resolving `changed_by`
  through `profiles` and `told_refs` against this project's own seats (both `try?`, so an
  unresolvable name prints as no name rather than a failed card or a raw id). This is disclosed as
  read-only and independent of W3/W4's fuller `record_notice` RPC, which still does not exist
  (`grep -rl record_notice supabase/migrations/` — no hits, confirmed again this round) — the write
  stays compile-green exactly as disclosed. **Fixed on the read side, confirmed by source re-read**
  (the mock still hardcodes its own two notices, so this specific path isn't sim-distinguishable from
  before, as the r3 fix log itself discloses).

## New findings this round

### 14 — MAJOR, confidence HIGH (compile-green; masked by every mock/sim run to date): the person card's "role at firm" line reads the wrong column in real mode and will print the party's generic classification, not their job title

`SupabasePeopleRoomService.person(...)` (`SupabasePeopleRoomService.swift:97-116`) selects
`"id, name, company_name, role, reach_state, consent_status, paper_state, contact_rule_summary"`
from `people_directory` and builds `FieldPersonCard(..., roleAtFirm: row.role, ...)`
(`SupabasePeopleRoomService.swift:109`). But `people_directory.role` is the view's **party
classification** column (`client` / `lead` / `maker` / `team` / `contact`) — confirmed against
00626 itself, whose own comment block says a carded seat "is now emitted by the CONTACTS branch as
`role='contact'`" (00626:111) and whose CONTACTS branch literally assigns `'client'::text AS role`
(00626:1437). `w1b-report.md` §4 states the same behavioural fact directly: "with every seeded seat
carded, `people_directory` now returns `role='contact'` for those humans."

The field the direction doc and the schema actually name for a person's job title at their firm is a
**different** column entirely: `studio_person_affiliations.role_at_firm` (00592:280,
`-- owner / signer / pm / superintendent / foreman / office_manager / dispatcher / estimator / ap_ar
/ rep / crew`) — exactly the shape direction.md §3.2's R1 Identity region names
("`role_at_firm`... `E4.role_at_firm`") and exactly the shape `PeopleRoomFixtures` hand-writes for
every fixture card ("owner-operator", "superintendent", "owner, signer", "household member"). 00626
does not expose `role_at_firm` on `people_directory` at all (`grep -n role_at_firm
supabase/migrations/00626_*.sql` — zero hits), so the real service has no query that could produce
the fixture's kind of value from this view alone; it aliased the wrong column instead of adding the
join `studio_person_affiliations` would need.

**Effect**: `PersonDetailScreen.header(_:)` (`PersonDetailScreen.swift:115-120`) prints
`[card.firmName, card.roleAtFirm].joined(separator: " · ")` whenever both are non-nil. In real mode,
for essentially every carded identity (which is now everyone, per 00626's own migration), this reads
as e.g. "Northgate Electric · contact" or "Okonkwo household · client" — a designer on a job site
reading a job title that is actually the CRM's internal party-role tag. This is wrong information
shown with confidence, not merely an absent region (contrast with #13 above), and it is on the
identity header, the very first thing PR2 shows.

This is masked by every sim-verified walk to date because `PeopleRoomFixtures.people` hand-writes
correct `roleAtFirm` strings directly (`PeopleRoomMocks.swift:191,214,232,248`); the mock never
reads `people_directory.role` at all.

**Fix**: either select `role_at_firm` via a join/RPC against `studio_person_affiliations` (keyed by
`person_id = personID`, `company_id = ` the firm on the winning seat) and drop `role` from the
select list entirely, or — if a join is out of scope for a quick fix — omit `roleAtFirm` in real mode
rather than feeding it a column that means something else. Printing nothing is honest; printing the
wrong job title is not.

### 15 — MAJOR, confidence HIGH (compile-green; masked by every mock/sim run to date): R-Q's consent sentence never reaches the person card in real mode, for any consent status

`FieldPersonCard.consentSentence` (`PeopleRoomService.swift:219`) is the field
`PersonDetailScreen.header(_:)` prints beneath the word row when present
(`PersonDetailScreen.swift:126-131`) — the R-Q-mandated "`<Source> consent, <d Mon yyyy>, on the
<project>.`" sentence direction.md §3.2 R2 names as part of "Reach & access" and rulings.md's R-Q
fixes the wording of. `grep -rn consentSentence apps/mobile/Capture` shows exactly three non-DTO
sites: the two `PeopleRoomFixtures.people` entries that hardcode one ("Written consent, 2 May 2025,
on the Lindqvist kitchen."; "Verbal consent, 10 Oct 2026, on the Okonkwo residence.") and the one
screen call site that reads it. **`SupabasePeopleRoomService.person(...)` never sets it** — the
`FieldPersonCard(...)` it builds (`SupabasePeopleRoomService.swift:105-116`) has no
`consentSentence:` argument, so it silently defaults to `nil` regardless of whether the identity's
consent is granted, opted out, or pending. `DirectoryRow`'s select list doesn't carry the raw
source/date fields the sentence needs either (w1b-report §4 item 3 says the two consent dates now
join through `studio_channel_consent` on `people_directory`, but `person()`'s select list never asks
for them).

**Effect**: in real mode, this entire region of the person card — a named ruling (R-Q), not an
incidental nicety — never renders for anyone, texting or opted-out alike. It is not degraded or
occasionally missing; it is structurally unreachable from the real path, exactly the "masked by
every mock/sim run" shape findings 12 and 13 had, and it isn't named in the build report's §8 "Owed"
list the way 12/13's `record_notice` gap is.

**Fix**: extend `person()`'s select on `people_directory` (or a follow-up join on
`studio_channel_consent`) to carry the source/date/project fields R-Q's sentence needs, build the
sentence the same way the sentence's canonical helper does elsewhere in the program, and pass it
into `FieldPersonCard.consentSentence`. Absent that, drop the field/UI branch from the real path
intentionally rather than leave it wired to nothing.

## Round 1–3 findings, re-verified this round

| # | Finding | Status now | Evidence |
|---|---|---|---|
| r2-3 | Real-mode phone lines print raw E.164 (`SeatRow.phoneDisplay = phoneE164`; `SiteAccessRow.keyHolderLine` prints raw `seat.phoneE164`) | **OPEN, unchanged** | `PeopleRoomWire.swift:71` (`phoneDisplay: phoneE164`) and `:288-291` (`keyHolderLine`), byte-for-byte what r1/r2/r3 flagged. Not sim-reproducible (mock's own fields are already human-formatted) — compile-green, confirmed by source re-read |
| r2-4 | `person(projectID:personID:)` never filters by `projectID` | **FIXED in r3, reconfirmed by source re-read** | `SupabasePeopleRoomService.swift:89-94` — `fetchSeats(personID:)` runs first and throws `.notOnThisJob` unless a seat carries this `projectID`; only then are the directory row/channels/authority fetched. Compile-green (the mock's `person(...)` still ignores `projectID`, r2-11) |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list (`SupabasePeopleRoomService.swift:161-169`) still omits it; fresh grep for `alarm_ref`/`alarmRef` across `apps/mobile/Capture` returns nothing |
| r2-6 | Minting a field link has no offline queue/retry | **FIXED in r3, reconfirmed by source re-read** | `PeopleRoomCache.pendingMints/queueMint/drainMints` (`PeopleRoomCache.swift:129-169`), `MintFieldLinkSheet.mint()`'s `onQueued:` path, `ProjectRosterModel.queueMint`/`drainMints`, and the roster's "Links that came through" section (`ProjectRosterScreen.swift:236-269`) are all present and unit-tested (`aMintAskedForWithNoSignalIsQueuedAndThenDrained`, `aMintDrainThatCannotReachTheStudioLeavesTheQueueIntact`). Not sim-reproducible (the mock never refuses) |
| r2-7 | The mint's three writes are not atomic | **FIXED in r3, reconfirmed by source re-read** | `mintFieldLink` (`SupabasePeopleRoomService.swift:264-287`) now compensates on each later failure (`undo(cardID:)`, `undo(seatID:)`), and a token-less RPC response is now its own `.noLink` error rather than a misleading message. Compile-green (the mock never performs the three writes) |
| r2-8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` (`ProjectRosterScreen.swift:305-308`) still carries no `isEnabled`-keyed styling; the label text is full-opacity ink regardless |
| r2-9 | Mint sheet's four fields and the notice `TextEditor` had no accessibility label | **FIXED (r2), reconfirmed live this round** | `MintFieldLinkSheet.field(_:text:identifier:)` sets `.accessibilityLabel(label.capitalized)` for all four; `people.noticeDraft` carries `"What changed and who you told"` — confirmed live via `describe_screen` this round (`AXLabel: "What changed and who you told"` on the TextArea) |
| r2-10 | Four buttons fall short of the 44pt tap-target minimum despite `.frame(minHeight: 44)` | **OPEN, unchanged, reconfirmed live** | Live `scan_ui` this round: `people.mintLink` AXFrame height **19.33pt**, `people.logWhoWasTold` **19.67pt**, `people.mint.submit` **19.67pt** — identical to r2/r3's measurements. `people.saveNotice` unchanged in source (same recipe as `people.mint.submit`), not independently re-measured live this round but not touched by any fix pass either. `SiteAccessCallLine.row` and `PeopleTelLine.line`, which both add `.contentShape(Rectangle())` after the frame, correctly measure ≥44pt — the fix (adding `.contentShape(Rectangle())`) is known and applied inconsistently across the file set |
| r2-11 | `MockPeopleRoomService.person(projectID:personID:)` silently falls back to `PeopleRoomFixtures.people[0]` for any seat not in the four-card fixture | **OPEN, unchanged** | `PeopleRoomMocks.swift:305-308`, unedited since r2 |
| — | Two writes only (`recordNotice`, `mintFieldLink`) | **Reconfirmed live** | Logged "Told Marcus Reyes about the lockbox." → "Written down."; minted "Marcus Reyes" → landed with the ninety-day sentence. No other mutating call discoverable across the five screens/sheet |
| — | No force-unwraps/`try!`/`as!` | **Reconfirmed** | Fresh grep this round across every People file, `PeopleRoomService.swift`, `FieldRosterRules.swift`, `PeopleRoomCache.swift`, and `PeopleRoomMocks.swift` — none |
| — | No hardcoded `Color(...)`/`UIColor(...)` | **Reconfirmed** | Every color in `Features/People` and `PeopleSupport.swift` is a `CaptureColor` token |
| — | R-r, R-t, R-w | **Re-walked and reconfirmed live** | PR3: "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." plus "Studio only. This card never reaches a client page." PR2 (Chidi Okonkwo, the fixture's `client_rep`): "AUTHORITY ON THIS JOB — Signs money to an agreed amount." with no figure anywhere on screen (`ios-w5-review-r4/pr2-chidi-authority.png`) |

Findings r2-3, r2-5, r2-8, r2-10 and r2-11 were out of scope for the r3 fix pass (which targeted
exactly findings 12, 13, r2-4, r2-6, r2-7 per its own stated scope) and remain open exactly as
carried forward, not silently dropped.

## Scope discipline, re-checked

- No trade- or homeowner-facing write path exists anywhere in the five screens/sheet; every write
  requires `session.ownerIdentity` (a studio member's own session) via `requireOwner()`.
- No studio-wide Directory, no compliance-document surface, no authority editing anywhere in
  `Features/People`.
- `AppConfiguration.guestSiteBaseURL` (`client.patina.cloud`, `/field/{opaque-token}` only) is the
  correct base for the minted link, matching the comment's own statement of what the installed app
  claims as a universal link.
- Capture's project was regenerated by `capture-gate.sh`/`capture-run.sh` on every invocation this
  round (no `.swift` file was added/removed/renamed by this review, so `project.pbxproj` is
  unchanged from r3).

## Verdict

**Not clean** — 2 new MAJOR findings (14, 15), 0 new BLOCKING. Round 3's two MAJORs (12, 13) are
fixed and reconfirmed live. Of round 1/2's carried-forward findings, r2-4/r2-6/r2-7 are now fixed and
reconfirmed by source re-read; r2-3, r2-5, r2-8, r2-10 and r2-11 remain open, exactly as scoped out of
every fix pass to date. R-AV remains clean for the fourth consecutive round.
