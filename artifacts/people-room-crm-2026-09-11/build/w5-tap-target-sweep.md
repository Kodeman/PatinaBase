# W5 tap-target sweep

Scope: every `Button` / `NavigationLink` / `ShareLink` in
`apps/mobile/Capture/Capture/Features/People/*.swift` plus the two W5
additions in `Capture/Features/Projects/ProjectDetailScreen.swift`
(`project.openRoster`, `project.openSite`).

The defect: `.padding(...)`, `.frame(minHeight:.../minWidth:...)` and
`.contentShape(...)` applied to a `Button { } label: { }` (or
`Button(action:)`) **outside** the label closure grow the AX-reported frame
but not the hit-test region — SwiftUI dispatches a button's tap on its
**label's** content shape, not on modifiers hung on the `Button` from
outside. `w5-fix-log-r6.md` proved this live on device for five controls,
using the shape `PeopleTelLine` already had (padding/frame/contentShape
*inside* the label; `.font`/`.foregroundStyle` stay on the `Button` and reach
the label through the environment), and flagged three more controls of the
identical shape as deliberately left unfixed. This pass fixes every
remaining instance of that shape across the four files named above,
including the three the prior round flagged and left open.

Grep confirms `Features/People/PersonDetailScreen.swift`, `PeopleScreens.swift`,
`PeopleRoomWire.swift`, `PeopleRoomServiceFactory.swift` and
`SupabasePeopleRoomService.swift` contain no `Button`/`NavigationLink`/`ShareLink`
— nothing to fix in those files.

## Controls changed

| File:line | Identifier | What moved |
|---|---|---|
| `Capture/Features/Projects/ProjectDetailScreen.swift:110-130` | `project.openSite` | `.padding(16)` moved inside the label (onto the `HStack`); `.frame(minHeight: 44)` and `.contentShape(Rectangle())` added inside the label. `.font`/`.foregroundStyle`/`.background`/`.overlay` stay on the `Button`. |
| `Capture/Features/Projects/ProjectDetailScreen.swift:131-151` | `project.openRoster` | Same: `.padding(16)` and `.frame(minHeight: 44)` moved inside the label (onto the `HStack`); `.contentShape(Rectangle())` added inside. |
| `Capture/Features/People/ProjectRosterScreen.swift:196-214` | `people.openSiteAccess` | `.padding(16)` and `.frame(minHeight: 44)` moved inside the label (onto the `HStack`); `.contentShape(Rectangle())` added inside. `.background`/`.overlay` stay outside. |
| `Capture/Features/People/ProjectRosterScreen.swift:262-271` | `people.mintedLink.<id>` | Converted `Button("Copy the link") { ... }` (string-literal init, no label to target) to `Button { ... } label: { Text(...) }`; `.frame(minHeight: 44)` moved inside the label; `.contentShape(Rectangle())` added inside. This is the exact control r6's fix log flagged and left open ("the identical defect two lines away... a one-line-each change in the same shape"). |
| `Capture/Features/People/ProjectRosterScreen.swift:385-391` (`PeopleErrorState`) | *(no identifier — matches every other "Try again" button in the app, none of which carry one)* | Converted `Button("Try again") { ... }` to `Button { } label: { Text(...) }`; `.frame(minHeight: 44)` moved inside the label; `.contentShape(Rectangle())` added inside. |
| `Capture/Features/People/MintFieldLinkSheet.swift:144-153` | `people.mint.copy` | Converted `Button("Copy the link") { ... }` to `Button { } label: { Text(...) }`; `.frame(minHeight: 44)` moved inside the label; `.contentShape(Rectangle())` added inside. One of the three the prior round flagged and left open. |
| `Capture/Features/People/MintFieldLinkSheet.swift:154-161` | `people.mint.share` (new — lacked one) | `ShareLink(item:label:)`'s `.frame(minHeight: 44)` moved inside the label (`Text("Share it")`); `.contentShape(Rectangle())` added inside; `accessibilityIdentifier` added (previously absent). One of the three the prior round flagged and left open. |
| `Capture/Features/People/MintFieldLinkSheet.swift:163-173` | `people.mint.done` (new — lacked one) | Converted `Button("Done") { ... }` to `Button { } label: { Text(...) }`; `.frame(minHeight: 44)` moved inside the label; `.contentShape(Rectangle())` added inside; `accessibilityIdentifier` added (previously absent). One of the three the prior round flagged and left open. |

## Controls checked and left unchanged (already correctly shaped)

- `Capture/Features/People/PeopleSupport.swift:92` (`PeopleTelLine`) — the reference shape; untouched.
- `Capture/Features/People/ProjectRosterScreen.swift:284` (`people.mintLink`) — already correct per r6.
- `Capture/Features/People/ProjectRosterScreen.swift:317` (`RosterRow`'s `Button(action: open) { identity }`, `people.seat.<id>`) — `identity`'s own `.frame`/`.padding`/`.contentShape` are already inside its body, which *is* the label; already correct.
- `Capture/Features/People/SiteAccessScreen.swift:266` (`people.logWhoWasTold`) and `:284` (`people.saveNotice`) — already fixed in r6.
- `Capture/Features/People/SiteAccessScreen.swift` `SiteAccessCallLine.row`, `people.callFirst.<id>` — already correct (Link-based, same pattern as `PeopleTelLine`).
- `Capture/Features/People/MintFieldLinkSheet.swift:51` (`Button("Close")`) — no padding/frame/contentShape modifiers hung on it; no defect to fix, no identifier requested.
- `Capture/Features/People/MintFieldLinkSheet.swift:79` (`people.mint.submit`) — already correct per r6.

## RosterRow.identity disabled styling

`Capture/Features/People/ProjectRosterScreen.swift:365` — `identity` (the
label of `Button(action: open) { identity }`, disabled via
`.disabled(seat.personID == nil)` at line 319) now carries
`.opacity(seat.personID == nil ? 0.5 : 1)`, keyed off the same condition the
`.disabled(...)` call already uses, so a seat with no linked person now
prints visibly dimmed instead of looking identically tappable while
silently doing nothing.

## Verification

`ruby apps/mobile/Capture/scripts/generate_project.rb` regenerated
`Capture.xcodeproj` (CaptureKit 111 files, CaptureKitMocks 4 files, Capture
app 155 files — no `.swift` file was added/removed/renamed by this pass, so
target membership is unchanged from r6).

`apps/mobile/Capture/scripts/capture-gate.sh all` (sandbox disabled for the
Xcode/CoreSimulator calls, same as every prior round):

```
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
```

**Claim level: compile-green / lint-green / unit-test-green only.** No
simulator or device tap-dispatch verification was run this pass (no
`blitz-iphone` walk); the shape change mirrors, modifier-for-modifier, the
five controls r6 already proved live on device, but the new instances
(`project.openSite`, `project.openRoster`, `people.openSiteAccess`,
`people.mintedLink.<id>`, `PeopleErrorState`'s "Try again", and the three
`MintFieldLinkSheet` result-screen controls) have not themselves been tapped
on a booted simulator.

## Scope discipline

Only `apps/mobile/Capture/**` was touched (`Features/Projects/ProjectDetailScreen.swift`,
`Features/People/ProjectRosterScreen.swift`, `Features/People/MintFieldLinkSheet.swift`,
`Capture.xcodeproj` regenerated) plus this report under
`artifacts/people-room-crm-2026-09-11/build/`. `Features/People/SiteAccessScreen.swift`
and `Features/People/PersonDetailScreen.swift` were read but needed no change.
`apps/designer-portal` and `packages/` were never opened; no `pnpm`, no database
reset. No commit or push — left for the workflow.
