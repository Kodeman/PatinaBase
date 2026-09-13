# W5 fix log — round 7

Scope: **exactly** the three findings handed to this pass — `r7-1` (the `people.openSiteAccess`
dead zone, plus the same shape on `project.openRoster` / `project.openSite`), `r7-2` (the mint
result screen's `Copy the link` / `Share it` / `Done`, and the roster's `people.mintedLink.<id>`),
and `r7-6-carried` (disabled Bidding/Done rows render in the same full-opacity ink as tappable
rows). Nothing else was touched. `r2-3`, `r2-5`, r3-12's build-report staleness, and r7's
Finding 3 (cross-project seats on a Field person card, flagged for a ruling) remain open exactly
as `w5-review-r7.md` carries them.

Three files changed, all under `apps/mobile/Capture/**`:

| File | Why |
|---|---|
| `Capture/Features/People/ProjectRosterScreen.swift` | `people.openSiteAccess`, `people.mintedLink.<id>`, `RosterRow.identity` dimming |
| `Capture/Features/People/MintFieldLinkSheet.swift` | `people.mint.copy`, the `ShareLink` label, `Done` |
| `Capture/Features/Projects/ProjectDetailScreen.swift` | `project.openRoster`, `project.openSite` |

No `.swift` file was added, removed or renamed, so `project.pbxproj` is unchanged
(`capture-gate.sh` / `capture-run.sh` regenerate the project on every invocation regardless).

Gate, sandbox disabled for the Xcode/CoreSimulator calls (inside the sandbox it dies on
CoreSimulatorService/DerivedData permission denials, same as every prior round):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

Driven on the same booted iPhone 17 Simulator every prior round used —
udid `C8850509-C7DC-43C5-9226-9446404EE98A`, passed explicitly to every blitz-iphone call, never
`booted` — in mock mode, via `capture-run.sh PR1.roster` and `capture-run.sh P2.project-detail`.
Screenshots in `build/ios-w5-fix-r7/`.

---

## r7-1 — the dead zone inside `people.openSiteAccess` (and the same shape on the Work surface)

**Fixed, sim-verified, at the review's own failing coordinate.**

`.padding(16)` / `.frame(minHeight: 44)` moved off the `Button` and inside the label closure,
with `.contentShape(Rectangle())` applied last — the pattern `PeopleTelLine` and the five
r6-fixed controls use. `.background` / `.overlay` stay on the Button: the Button's frame equals
its label's frame, so the visible bordered card is unchanged in size and position (the AX frame
re-measured this round is byte-identical to r7's: `{19.5, 223.83}, {363, 55.67}`).

| Control | File | Live evidence this round |
|---|---|---|
| `people.openSiteAccess` | `ProjectRosterScreen.swift` `head(_:)` | Tap at **(30, 276)** — the exact coordinate r7 reproduced as dead, in the bordered box's bottom-left corner, below the key glyph, off any text — **now opens PR3**. AX tree after the tap: nav title "Site access", `people.callFirst.F-09` / `people.wayIn` / `people.logWhoWasTold` present |
| `project.openRoster` | `ProjectDetailScreen.swift:133-151` | r7 could only claim this source-only. **Tapped live this round**: frame `{19.5, 327.5}, {363, 52.67}`; off-glyph tap at **(30, 377)** (bottom-left padding margin) navigated to PR1 — AX tree after shows `people.openSiteAccess` + the seat rows |
| `project.openSite` | `ProjectDetailScreen.swift:110-130` | Also source-only at r7. **Tapped live**: frame `{19.5, 251.83}, {363, 52.67}` (it previously carried `.padding(16)` with **no** `minHeight` at all); off-glyph tap at **(30, 301)** navigated to the Site hub — AX tree after shows "New site request" / "Open Site Binder" |

So all three halves of r7-1 — the one it proved live and the two it could only infer — are now
fixed **and** independently tap-tested live. `project.openSite`'s live pass also retires the
"plausible there too" caveat r7 attached to the pre-W5 call sites in that file.

**Observation, not fixed (out of this pass's scope):** the Site hub that `project.openSite`
lands on carries its own sub-44pt controls — "New site request" `{130 × 19.67}` and
"Open Site Binder" `{129.67 × 19.67}`, neither with an accessibility identifier. Same defect
class, different (non-W5) surface. Flagged for a ruling, untouched.

## r7-2 — the mint result screen's three controls, and `people.mintedLink.<id>`

**Fixed. Three of the four sim-verified with live off-glyph tap dispatch, not only AX
re-measurement; the fourth is source-only for the reason stated below.**

Each `Button("…") { }` / `ShareLink { Text(…) }` rebuilt so the `.frame(minHeight: 44)` +
`.contentShape(Rectangle())` sit on the label's `Text`, with `.font` / `.foregroundStyle` /
`.accessibilityIdentifier` left on the control. `Share it` and `Done` gained the identifiers the
review asked for (`people.mint.share`, `people.mint.done`) — neither had one before.

Live, after a real mint ("Marcus Reyes", then "Ruth Delgado"):

| Control | AX frame at r7 | AX frame now | Live off-glyph tap |
|---|---|---|---|
| `people.mint.copy` | `{101 × 19.67}` | `{101 × 44}` | Tap at **(24, 368)** — 20pt below the text's centre, inside the new label frame. Pasteboard was primed with a sentinel string via `simctl pbcopy` first; `simctl pbpaste` after the tap returned `https://client.patina.cloud/field/e3a91c74f0b24d0e8a5f` — the minted link. **Dispatched** |
| `people.mint.share` (was unidentified "Share it") | `{59 × 19.67}` | `{59 × 44}` | Tap at **(140, 368)**, bottom-left corner, off the glyph — **system share sheet opened** (`ios-w5-fix-r7/r7fix-shareit-offglyph-opened-sharesheet.png`) |
| `people.mint.done` (was unidentified "Done") | `{40.67 × 19.67}` | `{40.67 × 44}` | Tap at **(24, 428)**, bottom-left corner, off the glyph — **sheet dismissed**, roster re-shown. This is the control r7 singled out as the only non-nav-bar way out of the mint sheet |
| `people.mintedLink.<id>` | not measurable | — | **Compile-green / source-only.** The "Links that came through" section only renders for `model.mintedOffline`, i.e. a mint that was *queued while offline and later drained* — a mock-mode Simulator run mints online and never populates it, so there is no live instance to tap. The edit is byte-identical in shape to `people.mint.copy`, which *was* proven live above |

Widths are unchanged and still narrow (101 / 59 / 40.67pt): the finding asked for the 44pt
**height** floor and the label-internal `contentShape`, and widening these three would change the
row's composition. Flagged, not done.

## r7-6-carried (r2-8) — disabled rows had no visual affordance

**Fixed, sim-verified.** `RosterRow.identity` now carries
`.opacity(seat.personID == nil ? 0.5 : 1)`, keyed off the *same* condition already gating
`.disabled(...)` on the enclosing Button — one source of truth, so the ink and the AX state can
never disagree again.

Live this round (`ios-w5-fix-r7/r7fix-disabled-rows-dimmed.png`): `people.seat.seat-rivera` still
reports `"enabled": false` in the AX tree, and now **renders visibly dimmed** — "Rivera Finishes",
its sub-line and its bid note are all at half ink against the full-ink "Amara Osei" row directly
above it. `people.seat.seat-granite` likewise. The row's *phone* line ("On paper · No response ·
No phone on file") stays at full ink, which is correct: it is a separate, still-informative
element and is not part of the disabled Button.

---

## Deliberately not changed

- `PeopleErrorState`'s "Try again" (`ProjectRosterScreen.swift`) carries the identical
  `.frame(minHeight: 44)`-on-the-Button shape. It is **not** named in any of the three findings
  handed to this pass and was not in r6's five, so it was left byte-for-byte as it stood. Same
  defect class; flagged for a ruling.
- Finding 3 (cross-project seats on a Field person card) — a product ruling, explicitly flagged
  by r7 as "not asserting a violation". No code change.
- `r2-3` (raw E.164 in real mode), `r2-5` (`alarm_ref` never read), r3-12's build-report evidence
  staleness — open, untouched, as every round since r2.

## Claim levels

- **Sim-verified**: r7-1 all three controls (`people.openSiteAccess` at r7's own failing
  coordinate, `project.openRoster`, `project.openSite` — each an off-glyph tap producing the
  correct navigation); r7-2's `people.mint.copy` (pasteboard sentinel replaced by the minted
  link), `people.mint.share` (share sheet opened), `people.mint.done` (sheet dismissed), all
  three at off-glyph coordinates inside the new label frame, plus fresh AX heights of 44;
  r7-6-carried's dimmed rendering against an adjacent enabled row.
- **Compile-green / source-only**: `people.mintedLink.<id>` (no live instance reachable in
  mock mode — see above).
- **Device-verified**: nothing. No physical-device or TestFlight run was made this round,
  consistent with every prior round.
