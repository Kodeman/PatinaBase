# iOS-E — Wave 3, "the habit" · lane log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-iose`, branch
`approvals/w3-iose`, base `42d9057e45bbcc8e4eee4794ed15ef20314fae1b` (`main`).
App: **Patina** (client), `apps/mobile/Patina`. Swift Testing throughout.

Scope: **P-30** (the decision spread), **P-26 iOS half** (Keep a copy), **P-28 iOS half**
(the cadence and the snooze), plus the six carried Wave-2 items.

No migration. No edge function. No production mutation. The shared local Supabase stack was
never touched — nothing in this lane needs a database.

---

## P-30 — the decision spread

`DecisionDetailView`'s option path, which drew a vertical stack of full-width "Choose this"
buttons and sent every tap into `DecisionConsentSheet`.

**New files.** `Patina/Features/Decisions/DecisionSpread.swift` (layout, act label, arrival),
`Patina/Features/Decisions/Views/DecisionArrival.swift` (the zoom's two halves and the
`decisionZoomNamespace` environment entry), `Patina/Features/Decisions/ViewModels/DecisionDetailViewModel+Spread.swift`.

**What a homeowner meets now.**

- **Two options** — a horizontal spread of two equal plates. Equal is enforced by
  `maxHeight: .infinity` on each plate: the row takes the taller one's height and both fill it,
  so a one-line option does not sit in a short card beside a three-line one and read as the
  lesser offer.
- **Three or more** — a horizontally paged spread (`.scrollTargetBehavior(.viewAligned)` +
  `.containerRelativeFrame`, not a `TabView` page style, which demands a fixed height a plate
  does not have) under a **dot rule in clay**. Never "2 of 4".
- **The leaning.** Tapping a plate sets `leaningOptionId`, draws a filled clay dot in the plate
  and a clay rule around it, and fires `.sensoryFeedback(.selection, trigger:)`. It submits
  nothing. A contentless plate (`R06`) takes no leaning — the act above it would name nothing.
- **The act.** One `HoldToActButton`, `"I choose {option name}"` (`DecisionSpread.actLabel`),
  below the whole spread. Never "Choose this". Until a plate is leaning there is no act, only
  the line that says the tap is safe.
- **AX sizes.** `DecisionSpread.layout(optionCount:isAccessibilitySize:)` returns `.stacked` at
  every count above `.accessibility1` — the width cannot hold two plates and `C-06`'s defect
  (a title broken inside its own word) is what a half-width plate does there.
- **The arrival.** `.navigationTransition(.zoom(sourceID:in:))` on the pushed screen, with
  `.matchedTransitionSource` on the Record row (`HouseRecordRowView`), sharing a `@Namespace`
  published from both roots (`ContentView`, `HouseFirstRoot`) through
  `EnvironmentValues.decisionZoomNamespace`. Under Reduce Motion neither the zoom nor the push's
  slide is drawn (`W2R2-n1`'s rule, applied to a push).

**One deliberate removal, flagged for the reviewer.** The option path no longer opens
`DecisionConsentSheet`. The held act IS the consent, recorded as `click_through` with no
signature — which is exactly what that sheet sent on its default path (its "Add my signature"
toggle rested OFF), and the token the mid-Wave-2 ruling reserves for an act with no name on it.
The cost is that an option choice can no longer be e-signed. Reasoning: P-30's whole point is
"one named act" replacing a stack of submit buttons, and a press-and-hold whose only effect is
to open a second Approve button is that stack wearing a gesture — `HoldToActButton`'s own
contract ("held is not friction for its own sake") refuses it. The ruled signature moment is
Approve on the ceremony rail, which has its own screen and keeps its typed name.
`DecisionConsentSheet` survives, unchanged, for the sign-off (`W1-B-03`), which carries no
options and no spread.

**Pinned tests updated because they pinned the old shape** (not because they were wrong):
`DecisionSheetDetentTests` (three detent call sites → two), `DecisionApprovalPathTests
.theSignoffUsesTheExistingConsentSheet` (two `DecisionConsentSheet(` → one) and
`.theOptionRetryIsUnchanged`, `DecisionConsentValidationTests.failedSelectionCanBeRetried`
(the retry restores the LEANING rather than re-opening a consent step the path no longer has).

**Tests** — `PatinaTests/DecisionSpreadTests.swift`, 13 cases: the leaning submits nothing and
is revisable; a contentless plate and an answered decision take none; the act names the option
and never says "Choose this"; the untitled fallback; the consent sheet is gone from the option
path; the deferral acts are not drawn smaller than the act above them (body face, 44 pt); the
layout at 0/1/2/3/6 options and at every count under an accessibility size; the page dots draw
shapes and no figure; Reduce Motion takes the still arrival; both halves of the zoom exist and
both roots publish the namespace.

---

## P-26 (iOS half) — Keep a copy

**New files.** `Patina/Features/Shared/RecordOfDecision.swift` (the model, the two factories and
every word on the paper), `Patina/Features/Shared/Views/RecordSheet.swift` (the sheet, the
`ImageRenderer` and the `KeepACopyAct` control). One design-kit change:
`PatinaStamp(isUpright:)` — a tilted mark on a printed page reads as a misfeed, so the Record,
and nothing else, asks for the mark square.

**Where the act is offered** (all three, per the brief): the seal moment (`SealMomentView`, which
gained an optional `record:`), the settled Stage-2 approval (`ProjectApprovalBlock`'s recorded
branch, beside the mark), and the signed proposal (`ProposalDetailView`'s status row). The image
is rendered on appear and the act is not drawn until it exists — an act that cannot succeed is
not offered.

**What the sheet carries.** Masthead `RECORD OF DECISION`, the studio (where the app holds one —
never a person's name standing in, `W2R1-m2`), the title, the edition line, the mark drawn
upright, the outcome sentence, the typed name over a ruled line, the day, the consent as a
sentence, and twelve characters of the artifact hash at the foot (`R6`).

**The two refusals, and how they are held.** `RecordOfDecision.printedLines` is everything the
sheet draws, and `RecordOfDecisionTests` walks it with an IPv4 regex and with both raw column
values — so "the IP address is never on the keepsake" and "the consent is a sentence, never the
enum" are facts a test proves rather than promises.

**Consent sentences** (`RecordOfDecisionCopy.consentSentence`):

| column value | sentence |
|---|---|
| `electronic_signature` | Signed by typing your full legal name. |
| `click_through` (and `portal_clickthrough`) | Confirmed in Patina, without a typed signature. |
| `paper` | Signed on paper, and recorded here by your studio. |
| anything else, or absent | **nothing is drawn** |

**Nothing is reconstructed.** 00467's projection carries the outcome and the day, not the name
she typed or the column her consent went to — so on a return visit the approval's record prints
the outcome, edition, day and reference, and **no name and no consent line**. Only the visit she
answers on is witnessed (`DecisionDetailViewModel.approvalRecord(studio:now:)`). Inferring "she
must have signed" from APPROVED would put a legal claim on a keepsake that the app did not see.
A proposal is different and is not a guess: `sign_proposal` takes a typed full name and nothing
else, so every signed proposal's consent is the typed signature.

**Tests** — `PatinaTests/RecordOfDecisionTests.swift`, 12 cases.

---

## P-28 (iOS half) — she sets the pace

**New files.** `Patina/Features/Decisions/DecisionPace.swift` (`ReminderCadence`,
`DecisionSnooze`, `DecisionPaceCopy`), `Patina/Features/Decisions/ViewModels/DecisionDetailViewModel+Pace.swift`.

**The cadence, in Settings.** A menu row under Notifications with the three named options —
"Tell me right away" · "Once a day" · "Once a week, on Sunday" — writing
`notification_preferences.reminder_cadence` through `SettingsService`, plus the floor stated
beneath it: *"Patina never sends an approval reminder before 8am or after 8pm, or on Sunday."*

- **Coded against the three values, tolerating the two old ones.** `ReminderCadence.from(wireValue:)`
  reads `right_away | daily | weekly_sunday` AND 00278's `immediate | daily_digest`.
- **The write is attempted twice.** A database still on the 00278 CHECK refuses `right_away`, so
  the write falls back to the same choice in the old vocabulary. `weekly_sunday` is the option
  the widening ADDS and has no old spelling — there the failure stands and the row's last value
  is restored rather than a lie left on screen. **This is the one place this lane depends on the
  backend lane's migration; both sides of that deploy save.**
- **No dark default.** `ReminderCadence.quietestHonest == .daily` — not `rightAway` (a homeowner
  who hears about every frozen edition turns Patina off) and not `weeklySunday` (a Sunday-only
  cadence can miss a Tuesday date, which fails the "still gets an answer on time" half).

**The snooze, on the approval.** `ProjectApprovalScreen` gained a `pace` block: a **Remind me**
menu with the four words — "Tomorrow morning" · "Sunday" · "When it's due" · "Don't remind me —
I'll come back" — calling `set_decision_snooze(p_decision_id, p_kind)` through
`DecisionsAPIClient.setDecisionSnooze`, under the ruled sentence *"Still yours to answer; only
the reminders wait."* A choice that lands is answered once, in Patina's voice ("I'll ask you
Sunday."); one that does not says so and promises nothing.

**`R16`, and the phone's half of it.** A snooze may never suppress the overdue notice. The server
enforces that in `decision-reminders`; the screen's job is to never PROMISE otherwise — so past
its date the act is **not offered at all**, and in its place: *"This one is past its date. The
reminders stay until it's answered."* `snoozeApproval` refuses the write too, so nothing can
route round the missing control. "When it's due" is dropped from the four on an approval with no
due date — that would be an invented timing. A reader who is not the one being asked
(`viewerAnswers == false`) and an approval already answered are offered nothing.

**Tests** — `PatinaTests/DecisionPaceTests.swift`, 14 cases.

---

## The six carried Wave-2 items

1. **`W2R3-n1` — the hub's number was a load-time snapshot.** `StudioHubView`'s
   `.task(id: authService.isAuthenticated)` re-ran only across a sign-in, so three consecutive
   Today→Studio re-entries all read "Ten" while the real set had fallen to eight. The key is now
   `studioEntryKey` (`isAuthenticated` + whether the Studio is the surface she is looking at) and
   the body guards on arrival, so it refetches on the way IN and not on the way out. The
   flag-off root has no tabs — mounting is arriving there — so it behaves exactly as before.
2. **`W2R1-n3` — numerals where the neighbouring copy spells counts.** Swept: every Studio row
   built by `StudioQueueBuilder` (proposals, invoices, documents, budget, archive, threads,
   updates and the Ordered row) and the two money list eyebrows (`InvoiceListView`,
   `ProposalListView` — the brief names the invoice list; the walk's own list named the
   proposals list, and they are the same three lines of code). `PatinaCount.inWords` hands back
   figures past twelve, which is the web's own cutoff (`standing-sentence.ts`), so the walk's
   "**14** things need your eye" beside "**Nine** approvals" was already correct and is
   unchanged.
3. **`W2R1-n4` — the Stage-2 card carries a kind chip.** `RemoteClientDecision.kindChipLabel`:
   "Approval" for a Stage-2 row or a client sign-off (the projection synthesizes those rows with
   `decision_type: nil`, which is why they drew none beside three chipped ones), otherwise the
   row's own capitalized `decision_type`. The word matches the eyebrow on the screen the row
   opens.
4. **The untitled-row fallback.** `RemoteClientDecision.untitledRowTitle` — "An approval" for a
   Stage-2 or sign-off row, "A choice" otherwise. `DecisionListView`'s literal `"Decision"` is
   gone from the card and from its VoiceOver label.
5. **`IOSC-R3-01` — the red "Expired" line.** `ProposalListView:155` and
   `ProposalDetailView:239` were the last two surfaces painting a passed date in
   `PatinaColors.Text.error`. Both are body ink now, as the invoice rail already was.
   `MoneyAndStudioCopyTests` pinned the red and was updated to pin its absence.
6. **`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves`** was a race, not a
   slow test: the test resolved the tour from its own `Task.sleep(50 ms)` while the gate polled
   on a wall clock, and under full-suite load the poll loop starved the sleeping test past its
   own 5 s timeout. The polling is what the test is about, so it is now COUNTED — `TourStateBox
   (resolvingAfter: 3)` resolves itself on its fourth read — with no sleep, no second task, and
   the timeout raised to 30 s as belt and braces. The test also now asserts that the gate
   actually polled.

`OrderRoutingTests`'s four Ordered-row expectations were updated to the swept words.

---

## Gates

Run from this worktree, unsandboxed, against `simUdidA`
(`B6AD6271-E9E1-4BC6-B94A-F115E270CCAE`).

| Gate | Result |
|---|---|
| `ios-gate.sh build` | see the wave report / StructuredOutput |
| `ios-gate.sh unit` | see the wave report / StructuredOutput |
| `ios-gate.sh lint-delta main` | see the wave report / StructuredOutput |

A note for whoever runs them next: `DecisionsViewModel.swift` was 495 lines on `main` and
SwiftLint's `file_length` warning floor is 500. The spread and the pace both went into their own
extension files partly for that reason — the file is 491 now, and anything else added to the
class body will cross it.

---

## Advisories

1. **The option choice can no longer be e-signed.** Deliberate, reasoned above under P-30, and
   the one behaviour this lane removed. If a steward disagrees the fix is small: put a typed-name
   line under the spread and send `electronic_signature` when it is filled.
2. **The cadence write depends on the backend lane.** Until `notification_preferences
   .reminder_cadence`'s CHECK is widened, "Once a week, on Sunday" cannot be saved — the row
   reverts to its previous value and the screen says nothing. The other two save either way
   through the legacy fallback. Worth one line of the integration steward's deploy note: the
   migration must land before the iOS build a homeowner uses.
3. **`SettingsService.reminderCadence` defaults to `.daily` before the row is read.** If the
   backend lane leaves the column's DEFAULT at 00278's `'immediate'`, an account with no
   `notification_preferences` row will see "Once a day" over a database that would insert
   `immediate` — until she touches the control, which writes what it shows. Flagged for the
   backend lane rather than guessed at: the two defaults should be the same value.
4. **The keepsake prints no name on a return visit.** Correct per "never invent", and it will
   look thin on a walk that opens a settled approval from cold. Closing it properly means the
   projection carrying `client_signature` and `client_consent_method`, which is a migration this
   lane does not own.
5. **The snooze's confirmation is session-local.** `chosenSnooze` is not re-read from
   `decision_snoozes` on the next load, so re-opening the approval offers "Remind me" again
   rather than saying when Patina will next ask. Setting it twice is harmless (the RPC is an
   upsert by contract), but the screen cannot yet TELL her a snooze is already standing. A read
   of the snooze row into the projection would close it.
6. **`P-30`'s "standard push fallback on older OS versions" is unreachable.** The app's
   deployment target is iOS 26.0 and `.navigationTransition` is iOS 18, so there are two
   branches, not three: zoom, and the still arrival under Reduce Motion. Recorded rather than
   coded around.
7. **The paged spread is untested at runtime for more than three options.** The layout function
   is pinned at 3 and 6; the actual paging geometry wants the walker's eye at four or more.
8. **Cross-surface clay ink** (#82612F iOS vs #7C5E30 web) still stands from Wave 2; the leaning
   dot and the page dots are the newest users of it.

---

# Round 1 — the fix pass

Four findings from the adversarial review: one blocker (the lint gate), three majors. All four
closed. No new behaviour beyond what each finding asked for.

## `B1` (blocker) — `lint-delta main` was red, and had never been run

Three new SwiftLint warnings in touched files: `DecisionsAPIClient+ProjectApprovals.swift` and
`DecisionsAPIClient.swift` crossed the 500-line `file_length` floor, and `StudioHubView`'s struct
body crossed the 300-line `type_body_length` floor. The lane's own note predicted exactly this
shape for `DecisionsViewModel.swift` and then did not check the two files it had actually pushed
over.

Fixed the way this codebase already splits a full file — by moving whole units out, not by
disabling a rule:

- **`Patina/Core/Network/DecisionsAPIClient+Pace.swift`** (new) takes `setDecisionSnooze`.
  `DecisionsAPIClient+ProjectApprovals.swift`: 506 → **484**.
- **`Patina/Core/Network/RemoteClientDecision+Kind.swift`** (new) takes `kindChipLabel` and
  `untitledRowTitle`. `DecisionsAPIClient.swift`: 517 → **494**.
- **`StudioHubView`**'s `isOnStudio` / `studioEntryKey` pair moves to a `private extension` at the
  foot of the same file — `type_body_length` counts the type's own body, not its extensions. The
  file, the source pins and the behaviour are unchanged.

`DecisionPaceTests.theSnoozeCallsTheRPC`'s source pin follows the RPC to `+Pace.swift`.

## `M1` (major) — the quiet-hours caption over-claimed

`DecisionPaceCopy.quietHours` said *"Patina never sends an approval reminder before 8am or after
8pm, or on Sunday"* — drawn directly beneath a picker whose third option is "Once a week, on
Sunday", and above a backend that (a) has no 8pm ceiling on mail at all and (b) mails
`weekly_sunday` ON Sunday morning by design (`notification-digest`'s `isDigestDue`). Two false
promises in one sentence, one of them contradicting the control it sits under.

Rewritten to the two facts every leg actually keeps:

> Patina never mails about an approval before 8am, and your phone only buzzes between 8am and
> 8pm — your own clock. Anything later waits for the morning.

The 8am floor is `LOCAL_MORNING_HOUR` in the digest and `before_local_morning` in
`decision-notify`; the 8am–8pm ceiling is the PUSH leg's, 00572's `push_deliver_after`, and the
buzz is deferred to the next 8am rather than dropped — which is why the sentence says it waits.
The Sunday clause is gone. New test `theFloorDoesNotOutrunTheLegs` pins the absence of "Sunday"
against `ReminderCadence.weeklySunday.label`, so the caption cannot drift back into contradicting
the option above it.

## `M2` (major) — the option choice can be e-signed again

Advisory 1 of the build pass, ruled against. `P-30` asked for one named held act in place of a
stack of submit buttons; it did not ask for the loss of `client_consent_method =
'electronic_signature'` on a legacy option choice, and the mid-Wave-2 "signature only on Approve"
ruling is scoped to the Stage-2 ceremony rail, not to `client_decisions` (00117 carries the column
per decision). Restored as the reviewer's own suggested fix — an optional line, not a second act:

- `DecisionSpread.signatureTitle` / `signatureNote` / `signatureFieldLabel` / `signatureTooShort`,
  and `DecisionSpread.consent(forTypedName:)` → `.clickThrough` · `.signed(name)` · `.tooShort`.
- `DecisionDetailView.signatureLine` draws one `PatinaTextField` above the act. Empty is the
  ordinary path and still sends `click_through`; a name sends `electronic_signature` with it,
  through the same held act.
- The two-character floor is `_apply_client_decision`'s own. Below it the act is **held**, with
  "Your full legal name, or leave it empty." — a half-typed name is never silently downgraded to
  an unsigned submit.
- `commitLeaning(decisionId:typedName:)` carries it; the sheet stays gone.

**Second order, also closed.** The retired sheet carried the only sentence on this path naming what
the act DOES; `leaningPrompt` names only what is not happening. `DecisionSpread.actConsequence` —
*"Choosing sends your decision to your designer and unblocks any work waiting on it."* — is the
sheet's own sentence in the choice's words, drawn beside the act. "Any work" stays hedged: `R9`
says name the real consequence or stay silent, and the app cannot see whether there is any.

Five new cases in `DecisionSpreadTests`.

## `M3` (major) — the count sweep used the wrong helper

`PatinaCount.inWords` where `inWordsCapitalized` is the convention at every other head-of-line
site, so one order read "One piece on its way" and two read "two pieces on their way" in the same
slot. Swept the fourteen head-of-line strings in `StudioQueueBuilder` — eleven `detail` lines and
the three `meta` lines, which `StudioHubView` also draws as their own `Text`. Line 397's
mid-sentence "… and N more" is left lowercase, correctly. The two money list eyebrows
("Accepted (three)") are parenthetical and also stay lowercase. `OrderRoutingTests` and
`WaveTwoCarryTests` expectations follow.

## Gates, round 1

Run from this worktree, unsandboxed, `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE`.

| Gate | Result |
|---|---|
| `ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` | **PASS** — `Test run with 2694 tests in 289 suites passed after 8.547 seconds with 2 known issues.` · `** TEST SUCCEEDED **` (2688 → 2694; the six are `M1`'s one and `M2`'s five) |
| `ios-gate.sh lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` did not flake: the build
pass made its poll counted rather than clock-raced, and it is green in a full-suite run here.

## Advisories still standing from the build pass

2 (the cadence write depends on 00572), 3 (`SettingsService` default vs the column DEFAULT), 4
(the keepsake prints no name on a return visit), 5 (the snooze confirmation is session-local), 6
(the push fallback branch is unreachable at this deployment target), 7 (the paged spread wants the
walker's eye at four or more options) and 8 (cross-surface clay ink) are unchanged. Advisory 1 is
withdrawn — `M2` closed it.
