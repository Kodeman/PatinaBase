# W5 fix log — round 6

Scope: **exactly** the two findings handed to this pass — `r2-10 / r5-17` (plain-style controls
report and dispatch under the 44pt minimum) and `r2-11` (the mock's `person(...)` falls back to
Dana Kowalski for 13 of 17 seats). Nothing else was touched. `r2-3`, `r2-5`, `r2-8` and r3-12's
build-report staleness remain open exactly as `w5-review-r6.md` carries them.

Five files changed, all under `apps/mobile/Capture/**`:

| File | Why |
|---|---|
| `Capture/Features/People/ProjectRosterScreen.swift` | `people.mintLink` |
| `Capture/Features/People/MintFieldLinkSheet.swift` | `people.mint.submit` |
| `Capture/Features/People/SiteAccessScreen.swift` | `people.logWhoWasTold`, `people.saveNotice` |
| `Capture/Features/People/PersonDetailScreen.swift` | `people.text.<channel>` |
| `CaptureKitMocks/PeopleRoomMocks.swift` | the mock's `person(...)` fallback |

No `.swift` file was added, removed or renamed, so `project.pbxproj` is unchanged
(`capture-gate.sh` / `capture-run.sh` regenerate the project on every invocation regardless).

Gate, sandbox disabled for the Xcode/CoreSimulator calls (inside the sandbox it dies on
CoreSimulatorService/DerivedData permission denials, same as every prior round):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

Driven on the same booted iPhone 17 Simulator every prior round used —
udid `C8850509-C7DC-43C5-9226-9446404EE98A`, passed explicitly to every blitz-iphone call, never
`booted` — in mock mode, via `capture-run.sh PR1.roster` / `PR2.person` / `PR3.site-access`.
Screenshots in `build/ios-w5-fix-r6/`.

---

## r2-10 / r5-17 — the 44pt floor

**Fixed, sim-verified.** The review's suggested one-line fix (`.contentShape(Rectangle())` beside
the existing `.frame(minHeight: 44)`) is **necessary but not sufficient**, and this round proved that
live before going further.

### What the one-line fix actually did

Adding `.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)` +
`.contentShape(Rectangle())` **to the Button/Link view itself** moved every reported AX frame to
44pt — `people.logWhoWasTold` went from `{134.67 × 19.67}` to `{330 × 44}`, `people.mintLink` from
`{196 × 19.33}` to `{354 × 44}`, `people.mint.submit` to `{362 × 44}`, `people.text.ch-11-m` to
`{362 × 44}`. An automated accessibility size audit would have passed.

**But tap dispatch did not move.** Live on PR3, with `people.logWhoWasTold` reporting `{36, 760}
{330 × 44}`:

- tap at `(70, 780)` — over the glyphs — toggled the band (label flipped to "Never mind");
- tap at `(350, 780)` — inside the reported 330pt-wide frame, past the text — **did nothing**, twice.

So the first shape of the fix would have satisfied the audit and still left the same dead zone for a
thumb. A frame hung on a `Button` grows the layout box the AX tree reports; SwiftUI hit-tests a
button on its **label's** content shape.

### The shape that works

Each of the five controls was restructured to the pattern `PeopleTelLine` already uses — the frame
and the content shape live **inside** the label closure:

```swift
Button { isLogging.toggle() } label: {
    Text(isLogging ? "Never mind" : "Log who was told")
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
}
.font(CaptureType.bodyEmph)
.foregroundStyle(CaptureColor.verdigris)
.accessibilityIdentifier("people.logWhoWasTold")
```

`.font` / `.foregroundStyle` stay on the Button and reach the label through the environment; ink is
unchanged on all five.

### Live evidence, after the fix (all on the explicit simulator udid, mock mode)

| Control | Frame before (r6 review) | Frame now | Dispatch proof — a tap far outside the glyphs |
|---|---|---|---|
| `people.logWhoWasTold` | `{134.67 × 19.67}` / `{88.67 × 19.67}` | `{330 × 44}` | `(350, 780)` toggled it open; `(360, 763)` — the top-right corner — toggled it closed |
| `people.saveNotice` | `{109 × 19.67}` | `{330 × 44}` | `(352, 799)`, the bottom-right corner, wrote the note: band collapsed and "Written down." printed (`pr3-savenotice-corner-tap-landed.png`) |
| `people.mintLink` | `{196 × 19.33}` | `{354 × 44}` | `(370, 815)`, ~174pt right of the text's right edge, opened the mint sheet |
| `people.mint.submit` | `{190.33 × 19.67}` | `{362 × 44}` | `(372, 674)`, the bottom-right corner, minted: "Marcus Reyes is on the roster." (`pr1-mint-submit-corner-tap-landed.png`) |
| `people.text.ch-11-m` | `{70.33 × 18.33}` | `{362 × 44}` | `(370, 402)`, ~300pt right of the glyphs, opened the Messages composer (`pr2-textthem-corner-tap-opened-messages.png`) |

The correctly-built siblings the review cites (`PeopleTelLine`, `people.openSiteAccess`,
`SiteAccessCallLine.row`) were not touched; `people.callFirst.F-10` still measures `{362 × 44}` and
`people.channel.ch-F-02-m` `{362 × 44}` on this round's walk.

### One control of the same shape deliberately left alone

`people.mintedLink.<id>` ("Copy the link" on the roster's minted-link receipt,
`ProjectRosterScreen.swift`) and the sheet's `people.mint.copy` / `Share it` / `Done` carry the same
`.frame(minHeight: 44)`-on-the-Button shape. **The finding names five controls and this pass fixed
exactly those five** — these are flagged here rather than fixed, for a ruling. They are the identical
defect two lines away and would be a one-line-each change in the same shape.

---

## r2-11 — the mock opened the wrong person

**Fixed, sim-verified.** `MockPeopleRoomService.person(projectID:personID:)` no longer falls back to
`PeopleRoomFixtures.people[0]`. It now resolves in three steps:

1. the hand-authored card, if one exists (F-11, F-05, F-09, F-15 — unchanged);
2. otherwise a card composed from **that seat's own roster row** —
   `PeopleRoomFixtures.cardFromSeat(personID:)`, new, covering the other 13 seats;
3. otherwise `MockPeopleRoomError.notOnThisJob(personID)`, mirroring the real service's
   `PeopleRoomError.notOnThisJob`, which the screen already renders through `PeopleErrorState`.

This is the review's first suggested remedy ("add fixture person cards for the remaining seats"),
implemented by derivation rather than by hand-authoring thirteen records, so every field on a
derived card is traceable to the seat and none of it can drift from the roster row the tester just
tapped. `roleAtFirm` is left nil — a seat carries a trade, not a job title (that distinction is
r4-14's) — and `authorityWords` is empty, so the card prints `FieldAuthorityWords.none` rather than
implying a grant the fixture does not hold.

**Live repro of the old defect, now negative.** Fresh launch, `capture-run.sh PR1.roster`, scrolled
to Priya Natarajan (`people.seat.seat-F-02`, personID `F-02` — the exact tap that produced Dana
Kowalski's card in r6), tapped:

- navigation heading: **"Priya Natarajan"** (was "Dana Kowalski")
- header: "Priya Natarajan" / "Hartwell Studio" / reach word "Account"
- one channel, `people.channel.ch-F-02-m` `{362 × 44}` → "Call (612) 555-0102" — Priya's number,
  not Dana's `(612) 555-0111`
- "No contact rule on file." (Dana's card prints "Text only. The email on file bounces.")
- Seats: "Okonkwo residence, studio · lead designer, On the job" — one seat, not Dana's two
- Authority: "No grant on file."

Screenshot `pr2-priya-r2-11-fixed.png`. Dana Kowalski's authored card still resolves unchanged —
`capture-run.sh PR2.person` (the harness resolves `PeopleRoomFixtures.personID` = F-11) still shows
her two channels and `people.text.ch-11-m`.

**Claim level.** Steps 1 and 2 are **sim-verified**. Step 3 — the `notOnThisJob` throw — is
**compile-green / source-only**: no roster row carries a personID without a seat, so the branch is
not reachable from the UI in mock mode.

`SupabasePeopleRoomService.person(...)` was not touched; production behaviour is unchanged, as the
review states.

---

## Claim levels for this round

- **Sim-verified**: all five tap targets, each with both a fresh AX-frame measurement and a tap
  dispatched far outside the glyphs; r2-11's live repro (Priya Natarajan opens Priya Natarajan) and
  the unchanged authored card for Dana Kowalski; the two writes still landing (a notice, "Written
  down."; a mint, "Marcus Reyes is on the roster.").
- **Compile-green only**: `MockPeopleRoomError.notOnThisJob`'s branch.
- **Device-verified**: nothing. No physical-device or TestFlight run was made this round, consistent
  with every prior round.

## Scope discipline

Only `apps/mobile/Capture/**` and `artifacts/people-room-crm-2026-09-11/build/w5-*` were written.
W2's designer-portal work and its `build/qa-w2-r2/` files were left untouched and uncommitted by
this pass; `apps/designer-portal` and `packages/` were never opened. No `pnpm` build, no database
reset, no prod write.
