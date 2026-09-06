# iOS-E — Wave 3, round 1 · adversarial review

Reviewer: separate context, did not write this code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-iose`
(`git rev-parse --show-toplevel` confirmed), branch `approvals/w3-iose`, five commits over
`main` (`42d9057e4`).

**Verdict: fix.** One blocker (a named gate is red), three majors, and a tail of minors.
Every scoped item — P-30, P-26's iOS half, P-28's iOS half, and all six carried Wave-2
items — is present and, apart from the findings below, correctly built.

---

## Gates, run by the reviewer

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD6271-… ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `… ios-gate.sh unit` | **PASS** — `Test run with 2688 tests in 289 suites passed after 8.857 seconds with 2 known issues`, `** TEST SUCCEEDED **`, exit 0 |
| `… ios-gate.sh lint-delta main` | **FAIL** — three new SwiftLint warnings in touched files |

The unit run is clean, including
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` — the flake the brief
named is genuinely fixed (counted reads, not a wall clock).

---

## Blocker

### B1 — `lint-delta main` is red: three new SwiftLint warnings

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift: 0 → 1
    Patina/Core/Network/DecisionsAPIClient.swift: 4 → 5
    Patina/Features/Profile/Views/StudioHubView.swift: 0 → 1
```

The three, resolved:

- `DecisionsAPIClient+ProjectApprovals.swift:506` — `file_length`: 506 lines (484 on `main`);
  `setDecisionSnooze` (+22) crossed the 500 floor.
- `DecisionsAPIClient.swift:517` — `file_length`: 517 lines (494 on `main`); `kindChipLabel` +
  `untitledRowTitle` (+23) crossed it.
- `StudioHubView.swift:11` — `type_body_length`: the struct body spans 305 lines (limit 300);
  `studioEntryKey` + `isOnStudio` + their comments (+22) crossed it.

The lane's own log records the 500-line floor as the reason the spread and the pace went into
extension files off `DecisionsViewModel.swift` — and then walked into the same floor on two
other files. The gate row for `lint-delta` in the lane log reads "see the wave report /
StructuredOutput", i.e. it was not run.

Fix is mechanical and matches the pattern the lane already used: move `setDecisionSnooze` into
a `DecisionsAPIClient+Pace.swift`, move the two `RemoteClientDecision` computed properties into
a `RemoteClientDecision+Kind.swift`, and lift `StudioHubView`'s entry-key pair (or one of its
existing sub-views) out of the struct body.

---

## Majors

### M1 — the Settings quiet-hours sentence contradicts the option directly above it, and over-claims the email leg

`DecisionPace.swift` · `DecisionPaceCopy.quietHours`:

> "Patina never sends an approval reminder before 8am or after 8pm, or on Sunday."

`SettingsView.reminderCadenceRow` draws that caption immediately beneath a `Picker` whose third
option is `ReminderCadence.weeklySunday.label` — **"Once a week, on Sunday."** One row says
Patina never mails on Sunday; the control above it offers a Sunday-only cadence. A homeowner
reading the two lines together cannot reconcile them, and the backend lane resolves it against
the caption: `supabase/functions/notification-digest/logic.ts` `isDigestDue` — *"`weekly_sunday`
is the one cadence that mails ON Sunday"* — and the digest's own category map includes
`approval: "Approvals that need you"`. So the sentence is false for one of the three cadences it
sits under.

The "after 8pm" clause is a second over-claim: the email gate in
`supabase/functions/_shared/decision-notify.ts` is `weekday === 0 → sunday_quiet` and
`hour < 8 → before_local_morning`. There is no 8pm ceiling on the letter — the 8pm–8am window is
the **push** leg only (R16, and 00572's `client_push_deliver_after`). As written the caption
promises a quiet the email rail does not keep.

This is the exact failure the lane's own `DecisionDetailViewModel+Pace.swift` header warns
against ("the phone must not PROMISE otherwise"), applied to the cadence row instead of the
snooze. Fix: state the morning floor and the push window without the blanket Sunday claim, or
make the Sunday clause conditional on the chosen cadence.

### M2 — the option path silently lost the ability to e-sign a choice

`DecisionDetailView.consentSheetBinding` now returns `viewModel.isApprovingSignoff` alone, and
`DecisionDetailViewModel+Spread.commitLeaning` always sends `.clickThrough` with a nil
signature. The `DecisionConsentSheet` the option path used offered an "Add my signature" toggle
that sent `.electronicSignature` with a typed name (`DecisionDetailView.swift`, the sheet's
`safeAreaInset` — `requireSignature ? .electronicSignature : .clickThrough`).

P-30 asks for one thing on this path: replace "a vertical stack of two full-width submit
buttons" with plates and one named held act. It does not ask to remove a consent capability.
The mid-Wave-2 "signature only on Approve" ruling is scoped to the **Stage-2 ceremony rail**
(Approve / Return / Hold) — a legacy `client_decisions` option choice is a different contract
with its own `client_consent_method` column (00117), and no ruling in
`rulings-2026-09-04.md` covers removing the e-signature affordance from it.

The lane flags the removal honestly in its notes (advisory 1) and offers the fix ("a typed-name
line under the spread"), which is the right call — but it is a ruling the lane made for itself.
Either restore the optional typed name or get it ruled before merge.

Second-order: the removed sheet also carried the only sentence on this path that named the
consequence — *"Approving sends your decision to your designer and unblocks any work waiting on
it."* What replaces it is `leaningPrompt` ("Nothing is sent until you hold the act"), which says
what is *not* happening, not what will.

### M3 — twelve Studio rows now read "two pieces on their way" with a lowercase head

`StudioQueueBuilder.swift` (12 sites: :440, :471, :513, :519, :527, :573, :576, :597, :600,
:621, :627, :672, :696, :718). Every one pairs a **capitalized** singular with a **lowercase**
plural:

```swift
singular: "One piece on its way",
plural:   "\(PatinaCount.inWords(moving.count)) pieces on their way"
```

`StudioHubView.swift:370` draws `Text(row.detail)` as its own line, so this is head-of-sentence
copy: a homeowner with one order reads "One piece on its way" and with two reads "two pieces on
their way". The codebase already has the right helper and uses it at every other head-of-line
site — `PatinaCount.inWordsCapitalized` at `StudioQueueBuilder:323`, `:363`,
`StudioQueueModels:110/119/123/127`, `BadgeCountService+Attention:63/67`,
`TodayExperience:123`. `OrderRoutingTests` was updated to pin the lowercase form
(`#expect(row?.detail == "two pieces on their way")`), so the defect is now nailed down by a
test.

The eyebrows in `InvoiceListView`/`ProposalListView` are unaffected — `.textCase(.uppercase)`
covers them.

---

## Minors

### m1 — the Reduce Motion arrival is applied where it probably cannot take effect, and is a hard cut rather than a cross-fade

`DecisionArrival.swift:47` — `content.transaction { $0.disablesAnimations = true }` on the
**pushed destination**. The `W2R2-n1` precedent it cites (`ProposalDetailView.swift:93-95`)
applies `.transaction` at the **presenting** site, which is where the transaction driving the
presentation originates. A `NavigationStack` push's transaction originates at the
`NavigationPath` mutation (the Record row's tap, in `HouseFirstRoot` / `ContentView`), not
inside the destination — so this modifier is unlikely to still the push's slide, which is the
whole claim. It also disables every animation inside the decision screen for its lifetime, not
only the arrival.

Separately, P-30 asks for "a cross-fade under Reduce Motion"; `DecisionSpread.Transition` names
the case `.crossFade` and implements no transition at all. No runtime evidence was gathered
either way — this needs the walker's eye with Reduce Motion on.

### m2 — a cadence write that fails reverts the picker with no word

`SettingsService.setReminderCadence` writes optimistically and, on failure, restores `previous`
with no user-visible state. Before 00572 lands, "Once a week, on Sunday" (which has no
`legacyWireValue`) snaps back silently. The snooze on the same wave sets `snoozeFailed` and says
so; the cadence should be consistent.

### m3 — `retrySelection` restores a leaning the `chooseLeaning` guard would refuse

`DecisionsViewModel.swift:347` sets `leaningOptionId = lastAttemptedOptionId` with no
`hasRenderableContent` check, while `chooseLeaning` refuses a contentless option for exactly the
reason "the act above it would name nothing". A contentless option whose submit failed comes
back as a live leaning over a plate that is not tappable, with the act reading "I choose this
one".

### m4 — the keepsake does not pin a light appearance

`RecordSheet` paints `.background(PatinaColors.Background.primary)` and `PatinaColors` resolves
through `Color.patinaDynamic` → `UIColor { traits in … }` (`PatinaColors.swift:333`). The app
follows the OS appearance (`AppearanceSetting`, `PatinaApp.swift:106`). P-26's own risk note is
that the printed record must be white paper. `ImageRenderer` should be handed
`.environment(\.colorScheme, .light)` (or the sheet given static paper ink) rather than relying
on the renderer's default. Not proven at runtime — worth one dark-mode share on the walk.

### m5 — the hub's refresh key only moves on a tab change

`StudioHubView.studioEntryKey` is `isAuthenticated#isOnStudio`. Today → Studio (the walk's own
case) is fixed. Studio → decision detail → back leaves `tabs.selected == .studio` throughout, so
the number does not refresh on that re-entry. Narrower than "on re-entry", but it does close the
reported walk.

### m6 — "hold the act" is product vocabulary in homeowner copy

`DecisionSpread.leaningPrompt` — "Tap one to sit with it. Nothing is sent until you hold the
act." A homeowner has no referent for "the act"; the control below says "I choose Shaker Oak"
with "PRESS AND HOLD" under it. "…until you press and hold below" says the same thing in her
words.

---

## Nits

- **n1** — `DecisionPaceTests.theDefaultIsQuiet` asserts on `SettingsService.shared`, a shared
  mutable singleton, inside a suite that runs alongside everything else.
- **n2** — past-due is computed from the device clock (`approvalIsPastDue` → `Date()` vs
  `dueAt`). The projection carries its own `isOverdue`, which `RemoteProjectApprovalReview`
  does not decode; a skewed clock offers a snooze the server would call overdue. Cheap to close
  by decoding the flag.
- **n3** — the snooze confirmation is session-local (lane advisory 5): re-opening the approval
  offers "Remind me" again rather than saying when Patina will next ask.
- **n4** — no test asserts `.sensoryFeedback(.selection, trigger: viewModel.leaningOptionId)`,
  which the brief names as part of P-30's leaning. It is present at
  `DecisionDetailView.swift:479`; nothing pins it.
- **n5** — `ProposalListView`'s eyebrow was swept alongside the invoice list the brief named.
  Consistent and harmless; recorded so integration knows the scope grew by one file.
- **n6** — the paged spread's geometry (`containerRelativeFrame` inside a
  `.padding(.horizontal, 24)` `LazyHStack`) has no runtime verification at four or more options;
  the lane says so itself (advisory 7).

---

## What is correct, and worth saying

- **P-30** is delivered whole: `DecisionSpread.layout` (2 → side-by-side, 3+ → paged with a clay
  dot rule and no figure, every count stacked at an accessibility size), the leaning that writes
  nothing and refuses a contentless plate, the one named `HoldToActButton` act
  ("I choose Shaker Oak", never "Choose this"), the deferral pair unchanged at body face and
  44 pt below it, and both halves of the zoom wired through a `decisionZoomNamespace`
  environment entry published by both roots. The "iOS 18 fallback" is genuinely unreachable —
  `IPHONEOS_DEPLOYMENT_TARGET = 26.0` — and the lane says so rather than writing dead code.
- **P-26**'s two refusals are held by a test that walks `printedLines` with an IPv4 regex and
  both raw column values, and the "nothing is reconstructed" rule (no name on a return visit) is
  the right call, not a gap.
- **P-28**'s wire vocabulary matches the backend lane exactly — `right_away | daily |
  weekly_sunday` against 00572's CHECK, and `tomorrow_morning | sunday | when_due | never`
  against `decision_snoozes.kind` and `set_decision_snooze`'s own guard. The legacy fallback
  write is a real answer to the deploy ordering. R16's phone-side half is right: no snooze act
  over a past-due approval, the write refused as well as the control hidden, "When it's due"
  dropped where there is no date.
- All five commits are pathspec-scoped, Conventional-Commit-subjected, trailer-free, and confined
  to the lane's own files. No migration, no edge function, no production mutation, no touch of
  the shared local stack.
