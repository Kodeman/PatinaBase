# W5 review — round 6 (SwiftUI + product)

Reviewer pass over the current HEAD of `build/people-room-crm-2026-09-11` — `395cd420a` (feat, the
People room) through `d47575a1d` (r5 fix — "keep the Companion off the People room"). `git diff
--stat d47575a1d -- apps/mobile/Capture` is empty: **no code has changed since r5's fix landed**, so
this round is a from-scratch re-verification, not a review of new work. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`. Every file listed in
`w5-build-report.md` §2 was read in full this round (not diffed only):
`PeopleRoomService.swift`, `FieldRosterRules.swift`, `PeopleRoomCache.swift`, `PeopleRoomMocks.swift`,
`ProjectRosterScreen.swift`, `PersonDetailScreen.swift`, `SiteAccessScreen.swift`,
`MintFieldLinkSheet.swift`, `PeopleSupport.swift`, `PeopleScreens.swift`,
`SupabasePeopleRoomService.swift`, `PeopleRoomWire.swift`, `PeopleRoomServiceFactory.swift`,
`PeopleRoomTests.swift`, `PeopleRoomUITests.swift`, plus the companion-placement section of
`RootView.swift` (r5's fix site). Nothing outside `apps/mobile/Capture/**` and this `build/w5-*` file
(plus `build/ios-w5-review-r6/`) was touched. No `pnpm` build, no database reset, no file outside
scope written. `git status`/`git diff --stat` confirm only W2's designer-portal and
`artifacts/.../qa-w2-r2/` files are dirty in the shared worktree; nothing of W2's was read, moved, or
committed by this review.

**Claim ladder.** `capture-gate.sh all` (sandbox disabled for the Xcode/CoreSimulator calls — inside
the sandbox it dies on CoreSimulatorService/DerivedData permission denials, same as every prior
round):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

The app was then driven on the same booted iPhone 17 Simulator every prior round used (udid
`C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout via blitz-iphone, never `booted`), mock
mode, via `capture-run.sh PR1.roster`: scrolled This week/Later/Bidding/Done → measured live AX
frames on the disabled Bidding/Done rows and every plain-style action button → opened Priya
Natarajan's row (reproducing r2-11) → opened the site access card, scrolled to "Who was told", logged
a note ("Told Ngozi Eze the code changes Friday.", landed) → opened the mint sheet, filled it, minted
a link for "Marcus Reyes" (landed, correct ninety-day sentence) → opened Chidi Okonkwo's card (PR-t).
Screenshots in `build/ios-w5-review-r6/`. Findings below are **sim-verified** unless marked otherwise.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted\|sms_consent_status\|consentStatus" apps/mobile/Capture --include="*.swift"`,
independently re-run this round (sixth time). Every hit is one of: a comment naming R-AV and stating
the frozen column is deliberately absent (`SupabaseSiteRequestService.swift:17`); the pure value type
`PunchTaskWrite`/`SiteRequestService`/`FieldPartyRef`/`SiteRequestAssignee`, which only ever consume an
already-resolved `smsConsentGranted: Bool` handed to them and touch no table; or a
`consentStatus`/`consent_status` field typed against `people_directory_seats` / `people_directory`
(`PeopleRoomWire.swift`, `SupabasePeopleRoomService.swift`,
`SupabaseSiteRequestService.seatConsentColumns`, verified by source re-read at
`SupabaseSiteRequestService.swift:24,60-75,517-523` — `partyColumns` carries no
`sms_consent_status`, and `seatConsent(projectID:)` is the sole consent reader for both
`fieldParties` and the site-request assignee path, keyed off `people_directory_seats.consent_status`,
which the file's own comment identifies as `channel_consent_status()` at the project's studio). **No
Swift file reads the frozen column for a verdict. Clean, independently reconfirmed for the sixth
round running.** No new finding at MAJOR per the brief's instruction.

## Rounds 1–5 findings, re-verified

| # | Finding | Status now | Evidence this round |
|---|---|---|---|
| r1-1 | Frozen `sms_consent_status` read | **FIXED**, reconfirmed | See R-AV above |
| r1-2 | Reach/stage words invisible to VoiceOver | **FIXED**, reconfirmed live | `people.tel.seat-F-02` → `"Account, On the job, call (612) 555-0102"` |
| r2-3 | Real-mode phone lines print raw E.164 | **OPEN, unchanged** | `PeopleRoomWire.swift:73-74` (`SeatRow.seat`: `phoneDisplay: phoneE164, phoneE164: phoneE164,`) and `SiteAccessRow.keyHolderLine(_:)` (`PeopleRoomWire.swift:379-383`: `"\(name) holds a key. \(phone)."` with `phone = seat.phoneE164`) — byte-for-byte unchanged since r1. Not sim-reproducible (mock fields are pre-formatted `(612) 555-0111` strings); confirmed by source re-read this round. **Compile-green / source-only**, sixth round open |
| r2-4 | `person(...)` never filtered by `projectID` | **FIXED in r3**, reconfirmed | `SupabasePeopleRoomService.swift:89-94` |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list (`SupabasePeopleRoomService.swift:253-256`) still omits it; fresh grep for `alarm_ref`/`alarmRef` across `apps/mobile/Capture` returns nothing this round too |
| r2-6 | Mint has no offline queue/retry | **FIXED in r3**, reconfirmed | `PeopleRoomCache.pendingMints/queueMint/drainMints` present and unit-tested |
| r2-7 | Mint's three writes not atomic | **FIXED in r3**, reconfirmed | `mintFieldLink` compensates on each later failure (`undo(cardID:)`, `undo(seatID:)`) |
| r2-8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged, reconfirmed live** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` (`ProjectRosterScreen.swift:305-308`) carries no `isEnabled`-keyed styling in the `identity` view. Live this round: `people.seat.seat-rivera` (Rivera Finishes, Bidding band) scans with `"enabled": false` in the AX tree, but the screenshot (`pr1-roster-bidding-done-r6.png`) shows it in the identical full-opacity ink as every open row above it — a sighted user gets no visual cue the row is not tappable while VoiceOver gets the truth |
| r2-9 | Mint sheet fields / notice editor had no AX label | **FIXED (r2)**, reconfirmed | `people.mint.name` → `"Full Name"`, `people.noticeDraft` → `"What changed and who you told"` |
| r2-10 / r5-17 | Several plain-style buttons fall short of the 44pt tap-target minimum despite `.frame(minHeight: 44)` | **OPEN, unchanged, reconfirmed live with fresh AX-frame measurements** | Six controls re-measured live this round, all under 44pt tall: `people.mintLink` `{196 × 19.33}` at `y:788.33` (identical frame to r5's citation — confirms the defect is stable, not a one-off render glitch); `people.mint.submit` `{190.33 × 19.67}`; `people.logWhoWasTold` `{134.67 × 19.67}` (before typing) / `{88.67 × 19.67}` ("Never mind" label, after expanding); `people.saveNotice` `{109 × 19.67}`; `people.text.ch-11-m` ("Text them" on PR2) `{70.33 × 18.33}`. None carry `.contentShape(Rectangle())`; all sit beside correctly-built controls in the same files (`PeopleTelLine`, `people.openSiteAccess`, `SiteAccessCallLine.row`) that do add `.contentShape(Rectangle())` and correctly report ≥44pt. Sixth round confirming the identical defect with the identical fix available two lines away |
| r2-11 | Mock's `person(...)` silently falls back to `PeopleRoomFixtures.people[0]` (Dana Kowalski) for 13/17 seats | **OPEN, unchanged, reconfirmed live** | `MockPeopleRoomService.person(projectID:personID:)` (`PeopleRoomMocks.swift:305-308`): `PeopleRoomFixtures.people.first { $0.personID == personID } ?? PeopleRoomFixtures.people[0]`; `people` holds only F-11/F-05/F-09/F-15. Reproduced live this round on a fresh tap: opening Priya Natarajan's row (`seat-F-02`, personID `F-02`, not in the fixture's `people` array) opened **Dana Kowalski's card** instead — screen title "Dana Kowalski", her mobile/email channels, her contact rule, her two seats (`ios-w5-review-r6/pr2-dana-r2-11-repro-r6.png`). Fourth consecutive round with an independent live repro of the identical defect, each on a different tap |
| r3-12 | Mint's expiry sentence computed from data the client never sends (real mode); mock borrowed a fixture date, masking it | **FIXED in r3**, reconfirmed live | Live mint this round: "Marcus Reyes is on the roster." / "The job carries no window yet, so it ends 11 December 2026 — ninety days from today." (today is 2026-09-12; +90 days = 2026-12-11, correct — `ios-w5-review-r6/pr1-mint-result-r6.png`). **`w5-build-report.md` §7's evidence table is still stale** — it was flagged stale in r5 and remains uncorrected: it still shows the pre-fix screenshot text ("Ends with the job, 30 September 2027.") as its proof for this screen. Not a code defect; a documentation-hygiene item carried forward unfixed for the second round |
| r3-13 | "Who was told" unconditionally empty in real mode | **FIXED in r3**, reconfirmed by source re-read | `siteAccess()`'s select list carries `changed_by, told_refs` |
| r4-14 | Person card's "role at firm" read the party classification, not the job title | **FIXED in r4**, reconfirmed by source re-read | `fetchRoleAtFirm(personID:companyID:)` reads `studio_person_affiliations.role_at_firm` |
| r4-15 | R-Q's consent sentence never reached the real card | **FIXED in r4**, reconfirmed by source re-read | `consentSentence(...)` → `identity_consent_evidence` RPC → `studio_channel_consent` → `FieldConsentSentence.compose` |
| r5-16 | The pre-existing "Patina companion" bubble was not suppressed on the People room, violating ux-4 §5's "no engagement chrome" must-not | **FIXED in r5**, reconfirmed live | `RootView.swift:190-196`: `.people` returns `.hidden(.featureOwned)` in `companionPlacement`'s route switch, **and** visibility is now a pure function of the route (`companionSurface`'s `if !usesFeatureOwnedCompanionSurface, !companionPlacementHidesStrip`), not a value that can be overwritten by W1's late `.collapse` write — this is r5's second, load-bearing fix, and it is still in place. Live this round: `scan_ui` query for "Patina companion" on PR1 (`pr1-roster-r6.png`) and PR3 (`pr3-site-access-r6.png`) returns "no elements matching" both times |

Findings r2-3, r2-5, r2-8, r2-10/17, r2-11 remain open exactly as carried forward across five prior
rounds; none have been silently dropped, and none regressed further. No new findings surfaced this
round beyond fresh evidence on the already-open items above.

## Rulings re-walked and re-confirmed clean

- **PR-r**: PR3 live this round: "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." (`pr3-site-access-r6.png`).
- **PR-t**: Chidi Okonkwo's card, live: "AUTHORITY ON THIS JOB — Signs money to an agreed amount." No figure anywhere (`pr2-chidi-authority-r6.png`).
- **PR-w**: "Studio only. This card never reaches a client page." printed live on PR3.
- **Two writes only**: `recordNotice` (logged "Told Ngozi Eze the code changes Friday.", landed) and `mintFieldLink` (minted "Marcus Reyes", landed with the correct ninety-day sentence) remain the only mutations exercised or discoverable across the five screens/sheet this round. No trade/homeowner write path, no studio-wide Directory, no compliance upload, no authority editing anywhere in the code.
- **R-AV**: clean for the sixth consecutive round (see above).
- **R-X**: `people.callFirst.*` and `people.tel.*` continue to measure the full 44pt-or-more, full-width targets live (e.g. `people.callFirst.F-09` `{362 × 44}`), unaffected by the r2-10 defect elsewhere in the same files.
- No force-unwraps/`try!`/`as!` anywhere in `Features/People`, `PeopleRoomService.swift`, `FieldRosterRules.swift`, `PeopleRoomCache.swift`, or the mocks — fresh grep this round, all clean.
- No `DispatchSemaphore`/`.wait()`/`Thread.sleep` in the People files. `PeopleRoomCache` does small synchronous file I/O on `@MainActor`, the established house pattern (`CaptureProjectCache`'s own convention), not a fresh defect.
- Dark mode: every color in `Features/People`/`PeopleSupport.swift` is a `CaptureColor` token (fresh grep, no hardcoded `Color(...)`/`UIColor(...)`); rendered legibly throughout this round's live walk. Light mode and Dynamic Type XXXL were not independently re-shot this round (code identical to r5's already-clean, freshly-screenshotted pass on both axes; re-shooting an unchanged code path added no new information this round given the time budget) — **carried forward as clean on r5's evidence, not independently re-verified this round.**
- Scope discipline re-checked: no trade/homeowner write path, no studio-wide Directory, no compliance upload, no authority editing anywhere in the five screens/sheet; every write requires `session.ownerIdentity` via `requireOwner()`.

## A cosmetic observation, not a finding

`MockPeopleRoomService.mintFieldLink` returns the same hardcoded URL
(`https://client.patina.cloud/field/e3a91c74f0b24d0e8a5f`) for every mint regardless of the request —
correct for exercising the expiry-sentence branch (which is what W5 built the mock to prove) but means
the mock cannot demonstrate that two different mints produce two different tokens. Not raised as a
finding: nothing in the rulings or ux-4 requires the mock to vary the token, and the real
`SupabasePeopleRoomService.mintFieldLink` does read a fresh token off `create_field_link`'s response
each time (`SupabasePeopleRoomService.swift:366-370`).

## Verdict

**Not clean** — 0 new findings, 0 new BLOCKING, 0 new MAJOR. r2-3, r2-5, r2-8, r2-10/17, r2-11 remain
open exactly as carried forward across five prior rounds, each independently reconfirmed this round
either live (r2-8, r2-10/17, r2-11) or by source re-read (r2-3, r2-5). r5's MAJOR (16, the companion
bubble) remains fixed and is reconfirmed live on both PR1 and PR3. R-AV remains clean for the sixth
consecutive round. Rounds 3 and 4's four MAJORs (12, 13, 14, 15) remain fixed and reconfirmed.

No prior finding is BLOCKING or MAJOR-and-open at this point — the five open items are three MINOR
(r2-3, r2-5, r3-12's documentation staleness) and two MAJOR-leaning-but-previously-scoped-out items
(r2-8, r2-10/17 — visual/AX affordance gaps that do not block a sighted or VoiceOver user from
completing any task, but do violate the 44pt floor and the disabled-state affordance convention this
same codebase otherwise follows) and one MAJOR (r2-11 — a mock-only defect that misidentifies who a
tester is looking at, which would mislead anyone auditing the app who did not already know the fixture
by heart, but affects no real-mode/production behavior since `SupabasePeopleRoomService.person(...)`
has no equivalent fallback). None of the five have been re-scoped into any fix pass since r3/r4 chose
not to include them; they are not new information, but they are also not resolved, and this report
repeats the instruction from every round since r2: they remain open until a fix pass targets them.

## Claim levels

- **Sim-verified**: R-AV grep result exercised through live navigation; PR-r/PR-t/PR-w wording; the
  two writes (record-notice and mint, both landing correctly); r5-16's fix (companion absent on PR1
  and PR3); r2-8's live AX-tree `enabled:false` vs. full-opacity rendering; r2-10/17's five fresh AX
  frame measurements; r2-11's live reproduction on a new tap (Priya Natarajan → Dana Kowalski's card).
- **Compile-green / source-re-read only**: r2-3, r2-5 (real-mode-only paths the mock's own pre-shaped
  fixture data cannot exercise); the r3-12 build-report staleness observation (a documentation claim,
  not runtime behavior); light mode and Dynamic Type XXXL (carried forward on r5's live evidence, not
  re-shot this round).
- **Device-verified**: nothing — no physical-device or TestFlight run was made this round, consistent
  with every prior round.
