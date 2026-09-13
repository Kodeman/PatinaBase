# W5 fix log — round 2

Scope: **exactly one finding** from `w5-review-r2.md` — Finding 9 (MAJOR, the five People-room
inputs carrying no accessibility label). Findings 3–8 and 10–11 were **not** in this pass's brief
and remain open, untouched. Nothing outside `apps/mobile/Capture/**` and this `build/w5-*` file
was edited; no `pnpm` build, no database action, no prod write.

## Finding 9 — FIXED (sim-verified)

**What was wrong.** `MintFieldLinkSheet.field(_:text:identifier:)` rendered
`TextField("", text: text)` under a sibling `Text(label)` eyebrow, so all four mint inputs
reported `AXLabel: null`; `SiteAccessScreen.logBand`'s `TextEditor(text: $model.draft)` had the
same shape and likewise no label.

**Change.** Two one-line additions, following the convention already set at
`Capture/Features/SiteRequests/SiteRequestScreens.swift:540`:

- `Capture/Features/People/MintFieldLinkSheet.swift` — `.accessibilityLabel(label.capitalized)`
  on the `TextField` inside `field(_:text:identifier:)`. One call site, four fields: the eyebrow
  string is the accessible name, title-cased so VoiceOver speaks "Full Name" rather than reading a
  shouted all-caps token.
- `Capture/Features/People/SiteAccessScreen.swift` — `.accessibilityLabel("What changed and who
  you told")` on the `TextEditor` in `logBand`.

No files added, removed, or renamed, so `generate_project.rb` had nothing new to pick up
(`capture-gate.sh` regenerates regardless, and did).

**Gate (compile-green).** `scripts/capture-gate.sh all`, sandbox disabled for the Xcode /
CoreSimulator calls:
`✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`.
(A first run inside the sandbox failed on CoreSimulatorService + DerivedData permission denials —
environment, not code.)

**Live AX proof (sim-verified).** iPhone 17 Simulator, udid `C8850509-C7DC-43C5-9226-9446404EE98A`
passed explicitly on every blitz-iphone call, mock mode, `capture-run.sh PR1.roster` then
`capture-run.sh PR3.site-access`. `describe_screen` after opening the mint sheet and after tapping
**Log who was told**:

| Element | AXLabel before (r2 review) | AXLabel now |
|---|---|---|
| `people.mint.name` | null | `Full Name` |
| `people.mint.firm` | null | `Company` |
| `people.mint.trade` | null | `Trade` |
| `people.mint.phone` | null | `Mobile` |
| `people.noticeDraft` | null | `What changed and who you told` |

Roles are unchanged (`AXTextField` ×4, `AXTextArea` ×1), the identifiers are unchanged, and the
visible eyebrow `Text`s still render (`FULL NAME`, `COMPANY`, `TRADE`, `MOBILE`,
`WHAT CHANGED AND WHO YOU TOLD` all still present in the tree) — so no UI test keyed on an
identifier or a visible string is disturbed.

**Claim level: sim-verified.** Not device-verified — this is a pure SwiftUI accessibility-modifier
change with no camera, ARKit, or upload path, and the AX tree is the same surface a device would
report.
