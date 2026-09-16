# W5 review — round 2 (SwiftUI + product)

Reviewer pass over `395cd420a` ("the People room on the designer's phone") **and** the r1 fix
commit `a19e548cb` ("W5 r1 — the record's consent word, and the words VoiceOver was missing"),
plus every pre-existing file either touches. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Nothing outside `apps/mobile/Capture/**` and this
`build/w5-*` file was touched by this review.

**Claim ladder.** `capture-gate.sh all` run fresh (sandbox disabled for the Xcode/CoreSimulator
calls): `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4
sweep` — matches both prior reports. The app was then driven on the booted iPhone 17 Simulator
(udid `C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout, mock mode) via
`capture-run.sh PR1.roster` and blitz-iphone: roster → a person card → back → site access card →
scrolled → logged a "who was told" note (landed, mock, "Written down.") → back to roster →
scrolled to the mint act → minted a field link for "Marcus Reyes" (landed, mock, "Marcus Reyes is
on the roster. / Ends with the job, 30 September 2027." with link + Copy/Share). Screenshots in
`build/ios-w5-review-r2/`. Findings below are **sim-verified** unless marked otherwise.

Tooling note: on this pass, `swipe` gestures starting over a full-width row `Button` did not move
the `ScrollView` at all (repeated attempts, several parameter variants, screenshots confirmed no
scroll); starting the same swipe at `x≈395` (just outside every row's tap target) scrolled
normally. Recorded in case it recurs — not a finding against the app, since a real finger drag
starting anywhere in the row still scrolls a `ScrollView` in iOS; this reads as a simulator/driver
quirk with how touch-down-on-a-Button vs. touch-down-on-plain-content is delivered by this
automation harness specifically, not a defect in the SwiftUI it is driving.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted\|sms_consent_status\|consentStatus" apps/mobile/Capture --include="*.swift"`
— every remaining hit is either (a) a comment stating the frozen column is deliberately absent, (b)
`PunchTaskWrite.swift`'s pure value type/resolver, which consumes an already-resolved
`smsConsentGranted: Bool` it is handed and never reads a database column itself, or (c) the new
`consentStatus` fields in `PeopleRoomWire.swift`/`SupabasePeopleRoomService.swift`, which are typed
against `people_directory_seats.consent_status` / `people_directory.consent_status` — record-backed
columns, not the frozen `project_parties.sms_consent_status`. **No Swift file selects the frozen
column for a verdict.** `SupabaseSiteRequestService.partyColumns` (the file r1's Finding 1 named)
no longer includes `sms_consent_status`; the new private `seatConsent(projectID:)` reads
`people_directory_seats.consent_status` instead of `v_project_roster.sms_consent_status` as R-AV's
prose names — the fix log's stated reason (`v_project_roster` emits no `phone_e164`, renames
`id`→`roster_id`/`party_kind`→`kind`, and UNIONs a team branch whose `sms_consent_status` is always
NULL) is verifiable from the view shape and is the other reader R-AV's own text allows ("another
reader backed by `channel_consent_status()`"). `PunchCourtResolver`
(`CaptureKit/Sync/PunchTaskWrite.swift:66`) never touches Postgres directly — it operates on
`FieldPartyRef`/`SiteRequestAssignee` values that already carry the resolved `smsConsentGranted`
bool, so there is nothing in it to repoint. **This check is clean.**

## Round-1 findings, re-verified

| # | r1 finding | Status now | Evidence |
|---|---|---|---|
| 1 | `SupabaseSiteRequestService` reads the frozen `project_parties.sms_consent_status` column | **FIXED** | See R-AV section above; also confirmed live — no code path reads it |
| 2 | Reach/stage words invisible to VoiceOver on dialable rows | **FIXED** | Live scan: `people.tel.seat-F-04` → `"Account, On the job, call (612) 555-0104"`; `seat-F-05` → `"On paper, On the job, call (612) 555-0105"`; `seat-F-09` → `"Field link, On the job, call (612) 555-0109"`. All three reach families plus the stage word reach VoiceOver now |
| 3 | Real-mode phone lines print raw E.164 (`SeatRow.phoneDisplay = phoneE164`, `SiteAccessRow.keyHolderLine`) | **OPEN, unchanged** | `PeopleRoomWire.swift:71` (`phoneDisplay: phoneE164`) and `:271` (`"\(name) holds a key. \(phone)."` with `phone = seat.phoneE164`) are byte-for-byte what r1 flagged. Fix log scope was explicitly F1/F2 only, so this was never touched |
| 4 | `person(projectID:personID:)` never uses `projectID` in its query | **OPEN, unchanged** | `SupabasePeopleRoomService.swift:82-89` — `.eq("id", value: personID)` only, no `project_id` filter or check |
| 5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list (`SupabasePeopleRoomService.swift:151-154`) still omits it; grep for `alarm_ref`/`alarmRef` across `apps/mobile/Capture` still returns nothing |
| 6 | Minting a field link has no offline queue/retry (contra ux-4-field-mobile §6.4) | **OPEN, unchanged** | `MintFieldLinkSheet.mint()` (lines 158-175) still only sets `errorMessage` on failure; no `PeopleRoomCache` call anywhere in the file |
| 7 | The mint's three writes are not atomic | **OPEN, unchanged** | `mintFieldLink` (`SupabasePeopleRoomService.swift:211-232`) is still three sequential independent calls with no compensation |
| 8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged, now also device-observed on this pass** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` still carries no `isEnabled`-keyed styling. Live: Rivera Finishes and Granite North render in the same full-opacity ink-black text as every open row above them (`pr1-roster-bidding-done-and-mint.png`); the AX tree does correctly report `"enabled": false` for both, so VoiceOver users get the truth even though sighted users don't |

Findings 3–7 were explicitly out of scope for the r1 fix pass per its own stated scope note
("exactly the two findings handed over... findings 3–8 remain open"), so none of this is a
surprise — recorded here per the brief's instruction to re-check every prior finding rather than
assume.

## New findings this round

### 9 — MAJOR, confidence HIGH (device-verified): every text field in the mint sheet, and the "who was told" note editor, has no accessibility label

`MintFieldLinkSheet.field(_:text:identifier:)` (lines 86-99) renders a `Text(label)` eyebrow
sibling above a bare `TextField("", text: text)` — the title argument that would otherwise double
as the field's accessible name is passed as `""`. Live AX scan of the open mint sheet confirms it:
every one of the four fields reports `"AXLabel": null`:

```
people.mint.name   → role text field, AXLabel: null, AXValue: "Marcus Reyes"
people.mint.firm   → role text field, AXLabel: null, AXValue: ""
people.mint.trade  → role text field, AXLabel: null, AXValue: ""
people.mint.phone  → role text field, AXLabel: null, AXValue: ""
```

A VoiceOver user landing on any of these hears "text field" with no indication of which fact it is
asking for — full name, company, trade or mobile are visually distinguished only by a sibling
`Text`, which VoiceOver does not associate with the field unless the two are explicitly combined or
the field carries its own label. `SiteAccessScreen`'s `logBand` has the identical shape:
`TextEditor(text: $model.draft)` under a `Text("WHAT CHANGED AND WHO YOU TOLD")` eyebrow, no
`.accessibilityLabel` on the editor.

This is not a house style gap — the same app, one file away, already carries the fix as
convention: `SiteRequestScreens.swift:540` attaches `.accessibilityLabel("Redo instructions for
measurements")` to a `TextEditor` under exactly this "eyebrow label + bare input" shape. The People
room's four mint fields and its one note editor are the only inputs in the feature, and none of the
five follow it.

**Fix**: pass the visible label as the `TextField` title (or add `.accessibilityLabel(label)` to
`field(_:text:identifier:)`), and add `.accessibilityLabel("What changed and who you told")` to the
`TextEditor` in `logBand`.

### 10 — MINOR, confidence HIGH (device-verified): several plain-style action buttons fall short of a 44pt accessibility/hit frame despite a `.frame(minHeight: 44)` modifier

Live AX measurements, iPhone 17 Simulator:

| Element | Code | Measured AXFrame height |
|---|---|---|
| `people.mintLink` ("Add someone met on site") | `ProjectRosterScreen.swift:209-213` | **19.33pt** |
| `people.logWhoWasTold` ("Log who was told" / "Never mind") | `SiteAccessScreen.swift:266-272` | **19.67pt** (confirmed twice, at two different scroll positions) |
| `people.saveNotice` ("Save this note") | `SiteAccessScreen.swift:282-291` | **19.67pt** |
| `people.mint.submit` ("Add them and mint a link") | `MintFieldLinkSheet.swift:75-80` | **19.67pt** |

All four apply the exact same recipe — `Button("Label") { ... }.font(...).foregroundStyle(...)
.frame(minHeight: 44).accessibilityIdentifier(...)` — with no `.contentShape(Rectangle())` and no
enclosing padding. By contrast, every element in this feature that reaches the real 44pt (or more)
lands there because padding is applied *before* the `frame(minHeight:)` and/or a `contentShape` is
set: `PeopleTelLine`'s row (`padding(.horizontal, 16).frame(minHeight: 44).contentShape(Rectangle())`,
measured at exactly 44pt live) and `people.openSiteAccess` (`padding(16).frame(minHeight: 44)`,
measured at 55.67pt live). A plain-style `Button` sized only by its label's intrinsic content plus a
bare `frame(minHeight:)` does not reliably grow its accessible/hit region to that minimum the way
the padded rows do — four real, tappable, finger-operated actions in this feature (the room's own
two new writes, plus the entry point to the third) come in under Apple's 44×44pt HIG minimum for a
tap target.

**Fix**: give each of the four the same shape the working rows already use — wrap the label in a
container with real `.padding()` before `.frame(minHeight: 44)`, or add `.contentShape(Rectangle())`
after the frame — and re-measure.

### 11 — MINOR, confidence HIGH (device-verified, mock-mode fidelity only): tapping most roster rows in mock mode silently opens a different, real-named person's card

`MockPeopleRoomService.person(projectID:personID:)` (`PeopleRoomMocks.swift:305-308`) is:

```swift
public func person(projectID: String, personID: String) async throws -> FieldPersonCard {
    PeopleRoomFixtures.people.first { $0.personID == personID }
        ?? PeopleRoomFixtures.people[0]
}
```

`PeopleRoomFixtures.people` defines exactly four cards — F-11 (Dana Kowalski), F-05 (Chidi
Okonkwo), F-09 (Luis Ochoa), F-15 (Frank Bauer) — against a roster of 17 seats. Tapping any of the
other 13 rows (confirmed live: tapped Adaeze Okonkwo's row, `seat-F-04`) falls through to
`PeopleRoomFixtures.people[0]`, which is **Dana Kowalski's full card** — her firm, channels,
consent sentence, bounced-email clause and authority all rendered under a screen whose navigation
title reads "Dana Kowalski," with no indication the tapped row (Adaeze) was ever Dana. This is a
mock/fixture-completeness gap, not a production code path — the real `SupabasePeopleRoomService`
uses `.single()` against `people_directory`, which throws (surfacing `PeopleErrorState`) rather than
substituting a different real person's identity. Confined to mock mode as it is, it still means any
sim-verified screenshot or demo walk that taps a seat outside {F-05, F-09, F-11, F-15} — 13 of 17
rows — is at risk of silently showing the wrong named person's private consent/contact data rather
than a "no card" state, undermining confidence in any future sim-verified walk of this screen that
doesn't happen to land on one of the four fixtured names.

**Fix**: either fixture a `FieldPersonCard` for every seat with a `personID`, or have the mock throw
/return a "no card for this person" placeholder rather than falling back to an arbitrary named
person's real data.

## Rulings re-walked and re-confirmed clean

- **PR-r** (never store/print the gate code): PR3 live read exactly "Lockbox, version 3. The code
  is held off Patina; ask Luis Ochoa."
- **PR-t** (no threshold figure on a phone): not walked to a fixtured authority card this round
  (Finding 11 means an arbitrary tap can land on a card with no `authorityWords`), but the code
  path (`FieldAuthorityWords.phoneSafe`, `SupabasePeopleRoomService.fetchAuthority`'s select list)
  is unchanged from r1's direct confirmation and still never selects `threshold_cents`.
- **PR-w**: "Studio only. This card never reaches a client page." printed live on PR3.
- **Two writes only**: confirmed live — `recordNotice` (logged a note, "Written down.") and
  `mintFieldLink` (minted Marcus Reyes, link + expiry sentence) are the only mutations exercised or
  discoverable in the five screens/sheet; nothing else writes.
- **R-X** (390 tel: target): `people.tel.seat-*` and `people.callFirst.*` all measure the full
  44pt-or-more, full-width targets live.
- Offline: `PeopleRoomCache` per-project/per-owner JSON, "Last loaded …" line — unchanged from r1,
  not re-exercised against a forced-offline condition this round (no regression signal either).
- No force-unwraps/`try!`/`as!` in any People file (fresh grep, this round).

## Verdict

**Not clean** — 1 new MAJOR (Finding 9), 0 new BLOCKING. Findings 3–8 from round 1 remain open
exactly as scoped by the r1 fix log (out of scope for that pass, not silently dropped). Round 1's
two MAJORs (frozen consent column, VoiceOver reach/stage words) are both fixed and reverified live.
