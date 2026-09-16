# W5 review — round 5 (SwiftUI + product)

Reviewer pass over `395cd420a` (feat, the People room), `a19e548cb` (r1 fix), `35ec452e4` (r2 fix),
`2b4d8afe4` (r3 fix), and `fd3175a52` (r4 fix — "the job at the firm, and R-Q's consent sentence on
the real card"). Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Every changed Swift file was read in full (not diffed
only). Nothing outside `apps/mobile/Capture/**` and this `build/w5-*` file (plus
`build/ios-w5-review-r5/`) was touched by this review. No `pnpm` build was run, no database was
reset, no file outside the allowed scope was written.

**Claim ladder.** `capture-gate.sh all` run fresh, sandbox disabled for the Xcode/CoreSimulator
calls (same requirement every prior round records): `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep
(inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`. The app was then driven on the booted iPhone 17
Simulator (udid `C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout, mock mode) via
`capture-run.sh PR1.roster` and blitz-iphone: roster → scrolled This week/Later/Bidding/Done → opened
the mint sheet, filled it, minted a link for "Marcus Reyes" (landed, mock) → back to roster → opened
Dana Kowalski's and Chidi Okonkwo's cards (PR-t) → opened the site access card → scrolled to "Who was
told" → logged a note ("Told Ngozi Eze the code changes Friday.", landed, "Written down.") → measured
live AX frames on every plain-style action button across all three screens and the mint sheet →
relaunched with `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityXXXL`
(Dynamic Type accessibility XXXL) and re-walked PR1 → toggled `simctl ui … appearance light` and
re-walked PR1. Screenshots in `build/ios-w5-review-r5/`. Findings below are **sim-verified** unless
marked otherwise.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted\|sms_consent_status\|consentStatus" apps/mobile/Capture --include="*.swift"`,
independently re-run this round (fifth time). Every hit is one of: a comment naming R-AV and stating
the frozen column is deliberately absent (`SupabaseSiteRequestService.swift:17`); `PunchTaskWrite.swift`'s
pure value type, which only ever consumes an already-resolved `smsConsentGranted: Bool` handed to it
and touches no table (`PunchCourtResolver` itself, `CaptureKit/Sync/PunchTaskWrite.swift:66`, reads no
column at all — it operates on `FieldPartyRef`/`SiteRequestAssignee` values already resolved
upstream); or a `consentStatus`/`consent_status` field typed against `people_directory_seats` /
`people_directory` (`PeopleRoomWire.swift`, `SupabasePeopleRoomService.swift`,
`SupabaseSiteRequestService.seatConsentColumns`). `SupabaseSiteRequestService.partyColumns` (line 24)
does not carry `sms_consent_status`; `seatConsent(projectID:)` is the sole consent reader for both
`fieldParties` (`PunchCourtResolver`'s path) and the site-request assignee path, both keyed off
`people_directory_seats.consent_status`. **No Swift file reads the frozen column for a verdict. This
check is clean, independently reconfirmed for the fifth round running.** No new finding at MAJOR per
the brief's instruction.

## Rounds 1–4 findings, re-verified

| # | Finding | Status now | Evidence this round |
|---|---|---|---|
| r1-1 | Frozen `sms_consent_status` read | **FIXED**, reconfirmed | See R-AV above |
| r1-2 | Reach/stage words invisible to VoiceOver | **FIXED**, reconfirmed live | `people.tel.seat-F-04` → `"Account, On the job, call (612) 555-0104"` |
| r2-3 | Real-mode phone lines print raw E.164 (`SeatRow.phoneDisplay = phoneE164`; `SiteAccessRow`'s `keyHolderLine`) | **OPEN, unchanged** | `PeopleRoomWire.swift:73-74` (`phoneDisplay: phoneE164, phoneE164: phoneE164,`) and the `keyHolderLine(_:)` static func (`return "\(name) holds a key. \(phone)."` with `phone = seat.phoneE164`), byte-for-byte what r1–r4 flagged. Not sim-reproducible (mock fields are pre-formatted) — compile-green, confirmed by source re-read this round |
| r2-4 | `person(...)` never filtered by `projectID` | **FIXED in r3**, reconfirmed | `SupabasePeopleRoomService.swift:89-94` — `fetchSeats(personID:)` then `guard let here = seatRows.first(where: { $0.projectID == projectID }) else { throw .notOnThisJob }` |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list still omits it; fresh grep for `alarm_ref`/`alarmRef` across `apps/mobile/Capture` returns nothing this round too |
| r2-6 | Mint has no offline queue/retry | **FIXED in r3**, reconfirmed | `PeopleRoomCache.pendingMints/queueMint/drainMints`, `MintFieldLinkSheet`'s `onQueued:`, `ProjectRosterModel.queueMint`/`drainMints`, "Links that came through" section all present; unit-tested (`aMintAskedForWithNoSignalIsQueuedAndThenDrained`, `aMintDrainThatCannotReachTheStudioLeavesTheQueueIntact`) |
| r2-7 | Mint's three writes not atomic | **FIXED in r3**, reconfirmed | `mintFieldLink` compensates on each later failure (`undo(cardID:)`, `undo(seatID:)`); a token-less RPC response throws `.noLink` |
| r2-8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` (`ProjectRosterScreen.swift:305-308`) carries no `isEnabled`-keyed styling. Live this round: Rivera Finishes and Granite North render in the same full-opacity ink as every open row above them; AX tree correctly reports `"enabled": false` for both (confirmed via `scan_ui` this round — VoiceOver users get the truth, sighted users don't) |
| r2-9 | Mint sheet fields / notice editor had no AX label | **FIXED (r2)**, reconfirmed | `people.mint.name` → `"Full Name"`, `people.noticeDraft` → `"What changed and who you told"` |
| r2-10 | Several plain-style buttons fall short of the 44pt tap-target minimum despite `.frame(minHeight: 44)` | **OPEN, unchanged, reconfirmed live** | See Finding 16 below — re-measured and boundary-probed this round with a new result the prior three rounds didn't establish |
| r2-11 | Mock's `person(...)` silently falls back to `PeopleRoomFixtures.people[0]` (Dana Kowalski) for 13/17 seats | **OPEN, unchanged, reconfirmed live** | Reproduced again this round without intending to: navigating to what should have been Chidi Okonkwo's row after a scroll opened Dana Kowalski's card instead (screen title "Dana Kowalski", her full channels/consent/authority) — a second independent live repro of the exact defect r2/r3 describe, on a different tap this time |
| r3-12 | Mint's expiry sentence computed from data the client never sends (real mode); mock borrowed a fixture date, masking it | **FIXED in r3**, reconfirmed live | Live mint this round: "Marcus Reyes is on the roster." / "The job carries no window yet, so it ends 11 December 2026 — ninety days from today." (today is 2026-09-12; +90 days is 2026-12-11 — correct). Matches `FieldLinkExpiryTests`' assertion. **Note:** the top-level `build/w5-build-report.md` §7 evidence table still shows the *original, pre-fix* screenshot text ("Ends with the job, 30 September 2027.") as its "sim-verified" proof for this screen — that screenshot predates r3's fix and was never refreshed. Not a live code defect (the current behavior is correct and intentional), but the build report's own claim table is now stale and should be corrected or re-shot; a reader trusting `w5-build-report.md` alone would believe the mint prints a job-window date it no longer prints |
| r3-13 | "Who was told" unconditionally empty in real mode | **FIXED in r3**, reconfirmed by source re-read | `siteAccess()`'s select list carries `changed_by, told_refs`; `SiteAccessRow.card(...)` builds one `FieldSiteNotice` from the card's own row |
| r4-14 | Person card's "role at firm" read the party classification, not the job title | **FIXED in r4**, reconfirmed by source re-read | `fetchRoleAtFirm(personID:companyID:)` reads `studio_person_affiliations.role_at_firm`, open rows only, preferring the affiliation at the seat's own firm |
| r4-15 | R-Q's consent sentence never reached the real card | **FIXED in r4**, reconfirmed by source re-read | `consentSentence(organizationID:personID:cardPhone:status:)` → `identity_consent_evidence` RPC → `studio_channel_consent` → `FieldConsentSentence.compose` |

Findings r2-3, r2-5, r2-8, r2-10, r2-11 were out of scope for every fix pass to date (r3 targeted
12/13/r2-4/r2-6/r2-7; r4 targeted 14/15 only) and remain open exactly as scoped, not silently
dropped.

## New findings this round

### 16 — MAJOR, confidence HIGH (device-verified): the pre-existing "Patina companion" bubble is not suppressed on any of the three People-room screens, violates ux-4 §5's explicit "no engagement chrome" must-not, and visibly overlaps real content

Live on PR1 (mock mode, both dark and light appearance, both default and Accessibility-XXXL text
size) and again on PR3, a floating circular control persists over the screen:

```
AXUniqueId: "fieldCompanion.bubble"
AXLabel: "Patina companion"
AXValue: "2 items need you"      (on PR1)   /   "What needs you"   (on PR3)
help: "Opens the Companion."
```

This is `AppContainer.companion` (`FieldCompanionController`), composed once at the app root
(`RootView.swift:56-58`, `.environment(container.companion)` + `companionSurface`) and shown or
hidden per-route by `companionPlacement` / `companionHint(for:route:)`
(`RootView.swift:156-211`). Both switches enumerate specific routes to special-case
(`.siteScan`/`.syncStatus` → `.featureOwned`; `.qrScan` → `.hidden(.featureOwned)`;
`.syncStatus`/`.specimen`/`.session`/`.settings`/`.account` → specific hints) and **fall through to
a generic default for every route they don't name** — `.people` (W5's new route) is not named
anywhere in either switch, so it takes the `default: return .collapsed(realm, route)` branch in
`companionPlacement` and the `default: return realm == .work ? "What needs you" : "Next steps"`
branch in `companionHint`. Since Field routes the People screens through the Work realm
(`CaptureDeepLink.swift`'s realm map lists `.pr1Roster, .pr2Person, .pr3SiteAccess` under `.work`),
the fallback resolves to exactly "What needs you" — which is what PR3 showed live.

**This is not merely cosmetic.** ux-4-field-mobile.md §5's must-not list states explicitly:

> 4. Engagement chrome: counts, streaks, "N days since last touch" badges. This is a studio surface;
> never optimized for engagement (`VISION-DECISIONS.md:21`).

A floating bubble whose own AXValue reads "2 items need you" is a count-based engagement nudge by
construction — the same shape the ruling names, not an edge case of it. None of the three People-room
screens (`ProjectRosterScreen.swift`, `PersonDetailScreen.swift`, `SiteAccessScreen.swift`) reference
`companion`/`FieldCompanionController` at all, so this was never addressed one way or the other by
W5 — an omission, not a regression, but a live one on the exact surface the ruling names.

**And it visibly obscures real content**, confirmed on two different screens:
- PR1, default text size, dark **and** light appearance: the bubble sits over Priya Natarajan's
  roster row, its trailing edge covering the leading digit of her phone number (`(612) 555-0102`
  reads as `…12) 555-0102` behind the bubble in the screenshot) — `ios-w5-review-r5/pr1-roster-dark-companion-overlap-r5.png`,
  `pr1-light-mode-companion-overlap-r5.png`.
- PR3: the bubble sits directly over the tail of the "Hours" card's text ("…before 09:00" partly
  covered) and above the "Receiving" heading — `ios-w5-review-r5/pr3-site-access-r5.png`.
- At Accessibility-XXXL Dynamic Type, the same bubble additionally lands mid-way through the wrapped
  "Open the site access card" button label, appearing to sit inside the wrapped text block —
  `ios-w5-review-r5/pr1-dynamic-type-ax5-overlap-r5.png`.

The bubble is a fixed-position root-level overlay (unaffected by the People screens' own
`ScrollView` offset), so which row or section it obscures changes with scroll position — every
screen in this feature is affected at some scroll offset, not just the ones photographed here.

**Fix**: add `.people` next to `.qrScan` in `companionPlacement`'s `switch route` (`RootView.swift:178-181`)
so the People room hides the companion outright (`.hidden(.featureOwned)`, or a dedicated reason),
matching ux-4 §5's explicit ruling and removing both the content-obscuring overlap and the
scope violation. `companionHint(for:route:)`'s default branch does not need its own `.people` case if
the placement switch hides it first.

### 17 — MINOR, confidence HIGH, new evidence on an existing open finding (r2-10): the real hit-dispatch area of the under-measured buttons is larger than their reported AX frame, but not verified to reach 44pt, and remains inconsistent with the rest of the file

r2-10 already established that six plain-style `Button`/`Link` controls report AX-frame heights of
~19–20pt against the 44pt target: `people.mintLink`, `people.mint.submit`, the mint sheet's `Done`,
`people.text.ch-11-m` ("Text them" on PR2 — a new instance not previously named, same recipe),
`people.logWhoWasTold`/`"Never mind"`, and `people.saveNotice`. This round adds a boundary probe
`r2-10` did not run: tapping *outside* `people.mintLink`'s reported AX frame (`y: 788.33…807.67`) at
`y=780` and `y=820` both still opened the mint sheet; tapping at `y=765` (15pt further out) did not.
So the true tap-dispatch rectangle is larger than the ~19pt AX frame VoiceOver and automated
accessibility tooling would report — roughly 40–55pt by this rough probe, plausibly meeting the 44pt
floor for an ordinary finger tap — but this was not established precisely enough to downgrade r2-10's
finding, only to note that a *sighted, precise, un-gloved* tap likely still lands the action most of
the time. It does not change the underlying defect: no `.contentShape(Rectangle())` was added (the
fix r2/r3/r4 all name), so VoiceOver's touch-exploration and any AX-based automated size audit still
sees ~19pt targets, and a gloved or hurried tap nearer the reported/visual center-only zone still has
a meaningfully smaller margin than the padded controls in the same file
(`PeopleTelLine`, `people.openSiteAccess`) that do it correctly. Recorded as new evidence on the
existing r2-10 finding rather than a new finding number, since it is the same defect, same root
cause, same fix, fourth round confirming it open.

## Rulings re-walked and re-confirmed clean

- **PR-r**: PR3 live this round: "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa."
  (`pr3-site-access-r5.png`).
- **PR-t**: Chidi Okonkwo's card, live: "AUTHORITY ON THIS JOB — Signs money to an agreed amount."
  with no figure anywhere (`pr2-chidi-authority-r5.png`). Dana Kowalski's card (opened via the r2-11
  mock-fallback repro, so evidentially a bonus): "AUTHORITY ON THIS JOB — No grant on file."
  (`pr2-dana-kowalski-r5.png`), matching the fixture's empty `authorityWords`.
- **PR-w**: "Studio only. This card never reaches a client page." printed live on PR3.
- **Two writes only**: `recordNotice` (logged "Told Ngozi Eze the code changes Friday.", landed,
  "Written down.") and `mintFieldLink` (minted "Marcus Reyes", landed with the correct ninety-day
  sentence) remain the only mutations exercised or discoverable across the five screens/sheet this
  round.
- **R-X**: `people.tel.*` and `people.callFirst.*` continue to measure the full 44pt-or-more,
  full-width targets live, unaffected by Finding 17.
- No force-unwraps/`try!`/`as!` in any People file, `PeopleRoomService.swift`,
  `FieldRosterRules.swift`, `PeopleRoomCache.swift`, or the mocks — fresh grep this round, all clean.
- No `DispatchSemaphore`/`.wait()`/`Thread.sleep` anywhere in the People files — no main-thread
  blocking construct found. `PeopleRoomCache` does small synchronous file I/O on `@MainActor`,
  matching `CaptureProjectCache`'s own established house pattern (noted clean by r3, reconfirmed —
  not flagged as a fresh defect since it is the convention this feature correctly followed).
- Dynamic Type: text scales correctly and readably up to Accessibility XXXL on PR1's headings, rows,
  and body copy — no truncation or clipping found in the text itself. The one defect found at this
  size is Finding 16's companion overlap (present at every size, just more visually confusing when
  huge) — no *new* Dynamic Type–specific defect beyond that.
- Dark mode and light mode both render legibly with correct contrast; every color in
  `Features/People`/`PeopleSupport.swift` is a `CaptureColor` token (fresh grep, no hardcoded
  `Color(...)`/`UIColor(...)`).
- Scope discipline re-checked: no trade/homeowner write path, no studio-wide Directory, no compliance
  upload, no authority editing anywhere in the five screens/sheet; every write requires
  `session.ownerIdentity` via `requireOwner()`.

## Verdict

**Not clean** — 1 new MAJOR (16), 0 new BLOCKING. r2-3, r2-5, r2-8, r2-10, r2-11 remain open exactly
as carried forward across four prior rounds (r2-10 gains a boundary-probe data point but is not
downgraded). Round 3's two MAJORs (12, 13) and round 4's two MAJORs (14, 15) remain fixed and are
reconfirmed live or by source re-read. R-AV remains clean for the fifth consecutive round.

## Claim levels

- **Sim-verified**: R-AV grep result exercised through live navigation; PR-r/PR-t/PR-w/R-X wording;
  the two writes; Finding 16 (both screens, both appearances, both text-size regimes); Finding 17's
  boundary probe; r2-8/r2-10/r2-11 reproductions.
- **Compile-green / source-re-read only**: r2-3, r2-5 (real-mode-only paths the mock's own
  pre-shaped fixture data cannot exercise); the r3-12 build-report staleness observation (a
  documentation claim, not a runtime behavior).
- **Device-verified**: nothing — no physical-device or TestFlight run was made this round, consistent
  with every prior round.
