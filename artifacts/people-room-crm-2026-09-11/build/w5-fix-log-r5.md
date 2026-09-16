# W5 fix log — round 5

Scope: **exactly** the one new MAJOR in `w5-review-r5.md` — Finding 16 (the root-level "Patina
companion" bubble is not suppressed on PR1/PR2/PR3, violating ux-4-field-mobile.md §5 must-not #4
and visibly obscuring content). Nothing else was touched: r2-3, r2-5, r2-8, r2-10/17 and r2-11
remain open, carried forward exactly as the review lists them.

One file changed, under `apps/mobile/Capture/**`:

| File | Why |
|---|---|
| `Capture/Features/Root/RootView.swift` | `.people` added to `companionPlacement`'s route switch; the rendered strip gated on that placement |

No `.swift` file was added, removed or renamed, so `project.pbxproj` is unchanged
(`capture-gate.sh` / `capture-run.sh` regenerated the project on every invocation regardless).

---

## Finding 16 — the companion bubble on the People room

**Fixed, sim-verified.** Two changes, because the review's suggested one-line fix is necessary but
was **not sufficient** — proven live, below.

### 1. The placement ruling (the review's fix)

```swift
case .people:
    // ux-4-field-mobile.md §5 must-not #4: the People room is a studio
    // surface and carries no engagement chrome, and the collapsed strip's
    // hint is exactly that ("What needs you" / "2 items need you").
    return .hidden(.featureOwned)
```

next to `.qrScan` in `companionPlacement`'s second `switch route` (`RootView.swift:188-196`), so all
three People screens resolve to `.hidden` rather than falling through to `.collapsed(realm, route)`.
`companionHint(for:route:)` is untouched, as the review says it need not change.

### 2. Why that alone did not work, and the second change

With only change 1 in place, PR1 was rebuilt, reinstalled and driven — **the bubble was still
there**, `AXUniqueId "fieldCompanion.bubble"`, `AXValue "2 items need you"`, frame
`{{169,740},{64,64}}`, over Priya Natarajan's phone line exactly as the review photographed it.

The control that identified the real cause: `-CaptureScreen Q1.qr-scan`, a route the placement
switch has hidden since long before W5. **The bubble was live on Q1 too**, same frame, same
"2 items need you". So the defect was never that `.people` was missing from the switch — it was
that a `.hidden` placement does not actually reach the screen.

Temporary `print` instrumentation in `applyCompanionPlacement()` and on a trial
`onChange(of: container.companion.presentation)` (both removed before the final build; `grep
PLACEMENTDBG` returns nothing) captured the mechanism on Q1, `simctl launch --console-pty`:

```
apply   placement=hidden(featureOwned) presentation=hidden(featureOwned) realm=work route=qrScan phase=ready
onChange presentation=collapsed(hint: "2 items need you") placement=hidden(featureOwned)
apply   placement=hidden(featureOwned) presentation=collapsed(hint: "2 items need you") …
```

Two writers reach `FieldCompanionController`:

- `RootView.applyCompanionPlacement()`, route-driven, fired by `.task(id: companionPlacement)` —
  which only runs when the placement **value changes**; and
- `WorkDashboardScreen.updateCompanionHint()` (`WorkDashboardScreen.swift:228-247`), which lands
  after `await model.loadAll()` and after `onChange(of: contentRevision)`. W1 is the Work realm's
  root, so it is still mounted beneath every pushed route and keeps writing.

W1's late `.collapse` therefore overwrites the hide. Re-asserting the hide from an `onChange`
handler was tried and rejected: the log's last line above is that re-assert firing, and while the
model settled on `hidden`, the **rendered** tree kept the collapsed strip — a write made during the
update phase did not reliably propagate, so the same build showed the bubble on Q1 and no bubble on
PR1 depending on timing. A fix whose result depends on which writer lands last is not a fix.

So visibility is now a pure function of the route, evaluated every body pass:

```swift
if !usesFeatureOwnedCompanionSurface, !companionPlacementHidesStrip {
    FieldCompanionHearthView(…)
}

private var companionPlacementHidesStrip: Bool {
    if case .hidden = companionPlacement { return true }
    return false
}
```

The `.hide` event is still sent (state stays truthful for `.cameraActive`, `.modalPresented`,
`.onboarding`, `.featureOwned`); the render no longer depends on it having survived. `.collapsed`
and `.featureOwned` placements are untouched, so no hint text changed anywhere.

**Knock-on, stated plainly:** this also makes `.qrScan`'s own pre-existing `.hidden(.featureOwned)`
effective for the first time. That is outside Finding 16's scope, but it is the same line of code
and the intent was already declared in the file — leaving Q1 broken would have meant writing a
People-only special case around a general bug.

---

## Claim ladder

**Sim-verified** (iPhone 17 Simulator, udid `C8850509-C7DC-43C5-9226-9446404EE98A`, explicit
throughout, mock mode). Not device-verified — no physical-device or TestFlight run this round,
consistent with every prior round. `scan_ui` queried for "Patina companion" / "fieldCompanion" on
every screen below; "absent" means the element is not in the AX tree at all.

| Screen / condition | Companion bubble | Evidence |
|---|---|---|
| PR1 roster, dark, default type | **absent** | `ios-w5-fix-r5/pr1-roster-dark-no-companion-r5fix.png`; `people.tel.seat-F-02` frame `{{20,754},{362,44}}` now unobscured |
| PR1 roster, light | **absent** | `pr1-light-mode-no-companion-r5fix.png` |
| PR1 roster, Accessibility XXXL | **absent** | `pr1-dynamic-type-ax5-no-companion-r5fix.png`; the wrapped `people.openSiteAccess` label (`{{19,595.8},{364,251}}`) is clear |
| PR2 person card (Dana Kowalski) | **absent** | `pr2-person-no-companion-r5fix.png` |
| PR3 site access | **absent** | `pr3-site-access-no-companion-r5fix.png`; the "Hours" card reads whole — "Weekdays 07:00 to 17:00. No Saturday work before 09:00." |
| Q1 qr-scan (control, out of scope) | **absent** — was present before | pre-fix and post-fix `scan_ui` |
| W1 Today (regression check) | **present**, `"2 items need you"` | `scan_ui`, frame `{{169,740},{64,64}}` |
| P2 project detail (regression check) | **present**, `"2 items need you"` | `scan_ui` — ordinary pushed Work routes still collapse, not hide |

**Gate** — `scripts/capture-gate.sh all`, sandbox disabled for the Xcode/CoreSimulator calls (inside
the sandbox it dies on CoreSimulatorService and DerivedData permission denials, same as every prior
round):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

No test was added: `companionPlacement` and `companionSurface` are `private` members of a SwiftUI
`View` in the app target, and `CaptureTests` has no host to reach them. The verification is the
live AX-tree table above.

## Still owed after this pass

- Everything the review carried forward: r2-3 (raw E.164 in real mode), r2-5 (`alarm_ref` never
  read), r2-8 (disabled bidding/done rows have no visual affordance), r2-10/17 (plain-style buttons
  report ~19pt AX frames; no `.contentShape(Rectangle())`), r2-11 (mock `person(...)` falls back to
  Dana Kowalski for 13/17 seats).
- r3-12's documentation point: `w5-build-report.md` §7 still shows the pre-fix mint screenshot
  ("Ends with the job, 30 September 2027.") as its evidence.
- A ruling worth having: W1 writing companion state while it is not the top of the stack is now
  harmless for hidden routes, but it still overwrites the hint RootView sets for every `.collapsed`
  pushed route. Not a defect this review found; noted so it is not rediscovered.

## Worktree note

`git fetch origin build/people-room-crm-2026-09-11` then
`git rev-list --left-right --count HEAD...origin/build/people-room-crm-2026-09-11` -> `0 0`: the
branch is identical to origin, so `pull --rebase` had nothing to replay. It was attempted anyway
(`-c rebase.autoStash=false`) and refused — "cannot pull with rebase: You have unstaged changes" —
which is the wanted outcome: W2 has staged and unstaged designer-portal work in this same worktree
and a rebase must not autostash it. Nothing of W2's was moved, stashed or committed. The commit stages explicit pathspecs only — `RootView.swift`, this log and the
five screenshots. `git add -A` was never run. No `pnpm` build, no database reset, nothing outside
`apps/mobile/Capture/**` and `artifacts/people-room-crm-2026-09-11/build/w5-*`.
