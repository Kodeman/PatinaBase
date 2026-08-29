# W6 · X2 — fix round (X2 review, F1–F6)

Worktree `.codex/worktrees/agent-dr-w6-x2`, branch `daily-return/w6-x2`, base `main` `4b35e0a94`.
Fix commits sit on top of `79e42ab58` / `13074a7f3`. Nothing pushed; no git write touched the main
checkout. `.writer.lock.d` held for the duration.

Every blocking and major finding is addressed below with the evidence that closes it. Three minors
(F7, F8, F9) fell out of the blocking fixes and are recorded; F10 was one line and is done; F11–F15
are answered without a change, or with the smallest one, and the reasoning is stated.

---

## F1 — BLOCKING · the reminder was never cancelled when the invoice was paid · **FIXED**

Two changes, both inside X2's owned set.

**a. The row stays mounted when the offer disappears.** `InvoiceReminderRow.body` computed
`InvoiceReminder.offer(for: invoice)` once and hung *everything* — content, `.task`, `.sheet` —
inside `if let offer`. When `isPayable` went false the whole view became `EmptyView` and the `.task`
never ran again. It now draws a `VStack` unconditionally, keeps the content inside the `if let`, and
carries `.task(id: offer)` on the outside. `offer` is `Equatable` and `Optional<Offer>` is too, so
the payable → paid transition **is** an id change and the task re-runs on exactly that edge.

**b. `refresh` cancels rather than merely forgetting.** The signature is now
`refresh(invoiceId:offer:)` — the invoice id is passed separately because the identifier has to be
derivable when there is no offer left to derive it from:

```swift
guard let offer else {
    if existing != nil { scheduler.cancel(identifiers: [identifier]) }
    fireDate = nil
    return
}
```

**The second face — the frozen amount — is fixed too.** The seam's `pendingIdentifiers() -> Set<String>`
became `pending() -> [UNNotificationRequest]`, so `refresh` can compare what is *queued* against what
the invoice says *now*. A different body (a part payment) or a moment more than a minute away (a
moved due date) replaces the request instead of leaving it quoting a figure that has changed.

**A third path the review did not name, closed as well.** The detail screen only learns an invoice
was settled if the person opens it again — which covers this app's own Pay button (it lives on that
screen and the view model polls after the Safari return), but not a payment made in the portal or by
cheque. `InvoiceReminderService.cancelStaleReminders(among:now:scheduler:)` cancels the reminders of
invoices that can no longer be reminded about, **scoped to the invoices in hand** so an invoice a
page has not loaded is never touched. Its call site is real, not owed: `InvoiceListView`'s `.task`
and `.refreshable`, both in X2's owned `Features/Invoices/**`.

**Evidence — on the device, not inferred** (clone `dr-w6-x2`, walk below):

| Step | What the queue said |
|---|---|
| set the reminder | `Reminder set for Sep 1.` (`w6-x2-fix-05`) |
| `invoices.status → 'paid'` in the local stack, pull-to-refresh | header `Paid in full`, the reminder row is a **zero-height** `invoiceDetail.reminder` — mounted, drawing nothing (`w6-x2-fix-06`) |
| `status → 'sent'` again, pull-to-refresh | **`Remind me the day before it's due`** — not `Reminder set for Sep 1.` (`w6-x2-fix-07`) |

That last row is the whole proof. The row's only source for "is it set" is
`UNUserNotificationCenter`'s own pending queue; the only way it can read *unset* on an invoice that
was set two steps earlier is that the pending request was genuinely cancelled while the invoice was
paid.

Unit-pinned by `InvoiceReminderServiceTests.payingCancelsThePendingReminder`,
`.aPartPaymentReplacesTheQueuedSentence`, `.theListSweepsReminderOfSettledInvoices`.

## F2 — BLOCKING · `sinceDate` was missing, so M6b's ruled copy could not be drawn · **FIXED**

`WidgetSnapshot` gains `let sinceDate: Date?`, set in `init(record:…)` to `record.window.start` — the
window the app computed, never a day derived from "now". `noteHouseLine` carries the existing value
forward rather than blanking it. The key-set assertion in
`WidgetSnapshotTests.needsYouNeverReachesTheWidget` now reads
`["movedRows", "houseLine", "sinceDate", "refreshedAt", "flagOn"]`, so the field cannot be dropped
again without a red test.

**Evidence — the file X2 actually wrote on `dr-w6-x2`:**

```
widget-snapshot.json  keys ['flagOn','movedRows','refreshedAt','sinceDate']
                      sinceDate   2026-08-21T05:00:00Z
house-record.json     window      {'start': '2026-08-21T05:00:00Z', duration 675151.27}
```

Byte-identical to the record's window start. 2026-08-21 is a Friday, so X1's `eyebrow` now draws
`Since Fri` and its `emptyLine` `Nothing moved since Friday.` — the M6b strings — instead of the
`What moved` / `Nothing moved.` fallbacks.

The reviewer's note that `sinceDate` was never in X2's published §0 contract stands: it is an
**amendment** to that contract, not a repair of it. §0's field list should be read as gaining one
optional `Date` — X1 already decodes it as optional forward-compat, so nothing on X1's side changes.
`decodesThroughAnIndependentMirror` now decodes it through a structurally identical local type, as
the widget will.

## F3 — BLOCKING (owed) · `houseLine` still has no producer · **UNCHANGED, and still owed**

Confirmed still true after this round: `houseLine` is **absent** from the file on the device (quoted
above). The one call site is `RecordSnapshotStore.shared.noteHouseLine(cards.first?.name)` in
`Features/Home/Views/DailyRoomView.swift`, which X2 does not own (steward §8) — so this remains the
steward's line, restated in `x2-notes.md` §1 and flagged here so it stays on the integration list
rather than sliding into a later wave.

Two things about that line changed underneath it, and the steward should know both:

- It no longer takes a `now:` argument (`noteHouseLine(_:)`). The refreshed-at stamp belongs to the
  record, not to the note.
- Per F6 it is now safe to call **early and often**. With no record on disk it writes nothing and
  holds the line in memory; the next `save` carries it in. So the natural SwiftUI shape — a `.task`
  or `.onChange` on the rail's cards — is correct with no ordering constraint against `RecordRefresh`.

## F4 — BLOCKING, pending a ruling · the opt-in presented SP-08's push primer · **FIXED, the steward's reading taken**

The brief (`x2-tasks.md` §2) and the steward (§7) contradicted each other. Taking the steward's
reading, because the brief's version has the app asking for a permission with a sentence that does
not describe what it is about to do — the C5 line, and not something a lane brief can waive.

- **`InvoiceReminderPrimerView`** (new, `Features/Invoices/Views/`) replaces `PushPrimerView` at this
  call site. Its copy is the reminder's own: `The day before it's due`, then `offer.promise` — the
  exact sentence the notification carries, in quotes, with this invoice's balance in it — then
  `That is the whole of it — no badge, no repeat, nothing else. Remove it from this invoice whenever
  you like.` Buttons: `Turn on the reminder` / `Not now`.
- **`[.alert]` only, and no remote registration.** The seam gained
  `requestAlertAuthorization() -> Bool`; the live wrapper calls
  `center.requestAuthorization(options: [.alert])`. `PushTokenService` is no longer referenced by
  this feature at all — `armPrompt` and `hasAsked` are gone from `InvoiceReminderService.init`.
- **Q7's gate is untouched.** The reminder neither reads nor arms
  `armAuthorizationPromptGate()`, so SP-08's primer still gets its once-per-install ask at the money
  moment, whichever comes first.

**Evidence — the walk took the hard path.** On a fresh install the money-moment trigger fired
SP-08's primer on its own (`w6-x2-fix-01`), verbatim and untouched by this lane. `Not now` was tapped,
which **arms** Q7's gate while leaving authorization `notDetermined` — precisely the state that,
before this fix, made the invoice act print `Notifications are off for Patina.` at someone who had
never been asked. Tapping the act then showed the reminder's own primer (`w6-x2-fix-04`), whose accessibility
tree reads:

```
The day before it's due
We'll send one notification: “Your invoice is due tomorrow — $4,250.00. Nothing else.”
That is the whole of it — no badge, no repeat, nothing else. Remove it from this invoice whenever you like.
[invoiceDetail.reminder.primer.allow] Turn on the reminder
[invoiceDetail.reminder.primer.dismiss] Not now
```

`Turn on the reminder` → the system alert → `Allow` → `Reminder set for Sep 1.`

Pinned by `InvoiceReminderAuthorizationTests.anUndecidedInstallSeesTheRemindersOwnPrimer`,
`.thePrimerQuotesTheNotification`, `.grantingThroughThePrimerSchedules` (asserts exactly one
authorization request), `.dismissingThePrimerClaimsNothing`.

If Fable rules the other way, the revert is one file and two lines in `InvoiceReminderRow.sheet`.

## F5 — MAJOR · a unit run wrote the real App Group flag mirror · **FIXED**

Taken the compiler-enforced option rather than the nine-call-site one: `mirror` has **no default** on
`resolveAtLaunch(arguments:provider:mirror:)`. `FeatureFlags.resolveAtLaunch()` names `.appGroup`
explicitly; the nine sites in `FeatureFlagsTests` name `.testing(try freshDefaults())` (a throwaway
suite per call, cleared on creation). A tenth site added later cannot silently inherit the real suite.

**Evidence — measured, not argued.** `launchArgumentOverrideWins` is the test that names
`house-first,house-widget`. Run alone against the clone, then the real suite read back:

```
$ xcodebuild test … -only-testing:PatinaTests/FeatureFlagsTests/launchArgumentOverrideWins
** TEST SUCCEEDED **
$ plutil -p …/AppGroup/…/Library/Preferences/group.cloud.patina.app.plist
  "patina.flags.resolved" => { "direct-orders" => false, "house-first" => false, "house-widget" => false }
```

All three false — the test's `true`s went to its own suite. (The `false`s are the **app host's** own
launch resolution, which is `Patina.app` doing what it does at every launch; that write is the app's,
not the test's, and is correct.)

## F6 — MAJOR · `noteHouseLine` could mint a snapshot out of nothing · **FIXED**

`guard let current = readWidgetSnapshot()` — with nothing on disk it now writes nothing and does not
reload. The reviewer's exact prescription, plus one thing it did not cover: dropping the line
outright would mean that on the ordering the steward's F3 line will most often produce (rail cards in
hand before the record lands) the house would never reach the widget at all. So the line is **held**
in a lock-guarded `notedHouseLine`, and `save` uses it as the fallback ahead of what is on disk.
`remove()` clears it — sign-out deletes the last account's room name along with its files, or the
next account's first save would write it back.

Pinned by `WidgetSnapshotTests.aHouseLineAloneWritesNothing` (asserts `loadWidgetSnapshot() == nil`
**and** zero reloads, then that the following save carries the line in) and `.removeForgetsTheHeldHouseLine`.

---

## Minors

| # | Verdict |
|---|---|
| **F7** — `.sound = .default` | **Fixed.** The line is gone. It was not in the enumerated shape, the promise does not mention it, and now that the ask is `[.alert]` only, setting a sound would be asking for one thing and configuring another. `theNotificationIsOneLineAndNothingElse` asserts `content.sound == nil`, `badge == nil`, `title.isEmpty`, `!trigger.repeats`. |
| **F8** — the row printed a recomputed date | **Fixed**, and it fell out of F1's seam change. `fireDate` now comes from the queued request's own `UNCalendarNotificationTrigger.nextTriggerDate()`. When that disagrees with the offer by a minute or more the request is replaced, so the row and the queue cannot drift apart in either direction. |
| **F9** — "Notifications are off" for an undecided install | **Fixed by F4, structurally.** The `default:` arm no longer consults `hasAsked` — undecided always gets the primer. `isDenied` is now set only after a real `.denied` status or a refused system alert. `dismissingThePrimerClaimsNothing` pins that "Not now" claims nothing. |
| **F10** — `isDenied` survived a grant in Settings | **Fixed.** `refresh` re-reads `authorizationStatus()` when `isDenied` is set and clears it if the status is no longer `.denied` (one extra read, and only while the line is showing). `grantingInSettingsClearsTheLine`. |
| **F11** — manual `lock.unlock()` in a 20-line body | **Fixed.** Every mutation now runs inside `locked { }` (`lock.lock()` + `defer`), and every `reloadWidgets` outside it. `noteHouseLine` returns a `Bool` from the closure and reloads on it, so the conditional reload survives the shape. |
| **F12** — the consent sentence at 10 pt | **Fixed.** `PatinaTypography.captionSmall` (10 pt) → `.caption` (12 pt) for both the promise and the denied line. Not raised to the act's 14 pt: at equal size the sentence competes with the control rather than explaining it. |
| **F13** — "refreshed on foreground" only while Today is mounted | **Rebutted, not this lane's to fix.** The scene-phase hook is `DailyRoomView.onChange(of: scenePhase)` and the step order is `RecordRefresh`'s — both outside X2's owned set (steward §8 lists `RecordRefresh.swift` as shared and neither lane's). The finding is accurate and worth a ruling; recorded as a **program** item, not an X2 one. X1's staleness line keeps the widget honest in the meantime. |
| **F14** — `route` is written and nobody reads it | **Kept, and recorded as reserved.** Dropping it would narrow the published §0 contract after X1 built against it, and `JSONDecoder` ignores what it does not read. It stays a producer-side field with no consumer; noted in `x2-notes.md` §8 for the canon digest so a future reader does not mistake silence for agreement. |
| **F15** — `WidgetSnapshot.swift` is a new file in `Core/Persistence/` | **Acknowledged, no change.** Authorised by `x2-tasks.md` §1 task 2; the synchronized root group picks it up with no pbxproj edit, so X1 remains the pbxproj's sole writer. Two more new files land this round under `Features/Invoices/Views/` and `PatinaTests/`, both inside X2's owned paths and both picked up the same way. |

---

## One structural change the reviewer should know about

`InvoiceReminderTests.swift` was over SwiftLint's `file_length` (553) and `type_body_length` (400)
once F1's and F4's cases were added — and the previous state of this lane was zero violations, so
splitting was the only way to keep it. The suite is now three, by subject, with no test renamed,
deleted or loosened:

| File | What it holds |
|---|---|
| `InvoiceReminderTests` | the pure rules — when it is offered, when it fires, what it says |
| `InvoiceReminderServiceTests` | scheduling, idempotency, and the cancellation lifecycle |
| `InvoiceReminderAuthorizationTests` | the reminder's own ask, and the shape of the notification |

---

## Gate

Run in this worktree, in the foreground, after every edit.

```
apps/mobile/Patina/scripts/ios-gate.sh build                       ** BUILD SUCCEEDED **
xcodebuild test -project …/Patina.xcodeproj -scheme Patina \
  -destination 'platform=iOS Simulator,id=05F96C3D-FC4F-4C6B-AC07-503261141C8F' \
  -derivedDataPath .build/dd -only-testing:PatinaTests            ** TEST SUCCEEDED **
  → Test run with 1464 tests in 159 suites passed after 4.383 seconds.   0 failures
```

1,455 → **1,464**. No `ios-gate.sh all`, no `lint-delta` (steward-only).

**SwiftLint, per-file over every file this round touched or added: zero violations.** (Run with the
paths as positional arguments — a directory pulls in pre-existing violations in `HelpAnalytics.swift`
and `CompanionAPIClient.swift` that are not this lane's.)

Signed `.app` (adhoc, from the `xcodebuild test` product — **not** `CODE_SIGNING_ALLOWED=NO`):
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w6-x2/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`

## Claim level

**Sim-verified.** The App Group being genuinely shared between the app process and a widget process
remains a **device** claim: no widget was installed and none was drawn. Notification *delivery* was
not exercised — the walk proves the request reaches and leaves `UNUserNotificationCenter`'s pending
queue, not that iOS presents it at 09:00 on Sep 1. No APNs claim of any kind; the reminder registers
for nothing remote by design.
