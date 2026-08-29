# W6 · X2 — adversarial review

Reviewer, separate context, read-only. Target: `.codex/worktrees/agent-dr-w6-x2`, branch
`daily-return/w6-x2`, base `main` `4b35e0a94`.

Commits reviewed (2, both unpushed):

```
79e42ab58 feat(ios): the widget's snapshot and the flag mirror (W6 X2)
13074a7f3 feat(ios): the opt-in due-date reminder on the invoice (W6 X2)
```

10 files, +1487 / −10. `git merge-base main HEAD` = `4b35e0a94`; `git branch -r --contains HEAD` is
empty (nothing pushed). No `git` write touched the main checkout in this review — `git -C` reads
only.

> ⚠ **Brief discrepancy.** The dispatch gave me lane **X1's** report JSON (commits `33bfa6558` /
> `bbe796ffb` / `583472c7b`, the `PatinaWidget` target) under a "reviewer of X2" role. I reviewed
> **X2's** actual diff, tasks file (`x2-tasks.md`) and notes (`x2-notes.md`), and used X1's tree only
> to check the cross-lane seam. **X2 filed no report JSON I can hold to its word** — the gate claims
> below are therefore my own, re-derived from the tree and the shot ledger, not verified against a
> lane report.

---

## What was checked, and against what

| Check | Source | Verdict |
|---|---|---|
| No `needsYou`, no count, no badge in the widget payload | Q8, C5, B §4, `2x-panel-u1` §6 | **PASS**, structurally + on-device |
| Stale state is named | Q8 "may sit one open behind" | **PASS** on the producer side (`refreshedAt` written); X1 draws it |
| M6b's ruled eyebrow / empty copy | `mock/fragments/b-M6b.html` | **FAIL** — F2 |
| The house on the widget | Q8, direction-b §4 | **FAIL (owed)** — F3 |
| Reminder: opt-in, one per invoice, exact copy | B §4, steward §7 | **PARTIAL** — copy and idempotency PASS; lifecycle FAILS (F1); the ask FAILS (F4) |
| App Group fallback kept, `usesAppGroup*` still reports | steward §3, `w2/r1`+`r2` notes | **PASS** |
| Flag mirror shape + honest absent-mirror | steward §6 | **PASS** in product code; **FAIL** in test hygiene (F5) |
| No edits outside the owned set | steward §8 | **PASS** |
| Pathspec commits, no `add -A`, no push | global constraints | **PASS** |
| `RecordRefresh` / `LocalStoreReset` / `HouseRecord` / entitlements / pbxproj untouched | steward §8 | **PASS** — zero bytes in any of them |
| SwiftLint over the nine touched files | steward §9 trap 5 | **PASS** — zero violations (pre-existing violations in `HelpAnalytics.swift` / `CompanionAPIClient.swift` are not this lane's) |

**Cross-lane seam, verified against `agent-dr-w6-x1`:**

| | X2 writes | X1 reads | |
|---|---|---|---|
| file name | `widget-snapshot.json` | `widget-snapshot.json` | ✓ |
| container | `group.cloud.patina.app` + fallback | same id + same fallback chain | ✓ |
| reload kind | `"PatinaHouseWidget"` | `HouseWidget.kind = "PatinaHouseWidget"` | ✓ |
| dates | ISO8601 | ISO8601 | ✓ |
| `movedRows` / `title` / `date` / row `id` | ✓ | ✓ | ✓ |
| `flagOn`, `refreshedAt` | ✓ | ✓ | ✓ |
| `houseLine` | never produced (F3) | optional | ⚠ |
| `sinceDate` | **not written** | optional, feeds M6b's copy | ✗ **F2** |
| row `route` | written | **not decoded** | ⚠ F14 |

`WidgetRouteToken`'s vocabulary was diffed line-for-line against `HouseRecord`'s private
`RouteToken` (`HouseRecord.swift:125-167`): all eight kinds identical, `designRequests`' optional id
handled the same way. No drift.

---

## Findings

### F1 — BLOCKING · confidence HIGH · the reminder is never cancelled when the invoice is paid

`InvoiceReminderService.remove(invoiceId:)` has **exactly one call site** in product code:

```
Patina/Features/Invoices/Views/InvoiceReminderRow.swift:73:  service.remove(invoiceId: offer.invoiceId)
```

That button lives inside `if let offer = InvoiceReminder.offer(for: invoice)`, and `offer(for:)`
returns nil the moment `invoice.isPayable` goes false (`InvoicesAPIClient.swift:122` — paid, void, or
a Stripe payment processing). So on payment the whole row unmounts: nothing cancels the pending
request, `.task` never runs again, and the person has **no way to remove it from inside the app**.

The scheduled notification then fires at 09:00 the day before a due date the person has already
settled, saying:

> Your invoice is due tomorrow — $4,250.00. Nothing else.

That is the app making a false statement about money, unprompted, on a Lock Screen — the exact class
C5 forbids, and steward §7 named the requirement outright: *"cancel it when the invoice is paid or
the toggle is turned off."* Only the second half shipped.

Same defect, second face: the amount is frozen at schedule time (`Offer.body` is built from
`balanceCents` when the row rendered). A partial payment after scheduling leaves the notification
quoting a balance that no longer exists.

**Smallest fix inside X2's owned files:** mount the row (or at least its `.task`) regardless of
`offer`, and make `refresh(offer:)` **cancel** a pending request when the offer is nil rather than
merely clearing `fireDate` — it already reads the system queue, so it knows the request is there.
`InvoiceReminderTests.refreshReadsTheSystemQueue` is the suite this belongs in.

### F2 — BLOCKING · confidence HIGH · the payload omits `sinceDate`, so the widget cannot draw M6b's ruled copy

X1's `HouseWidgetPayload` decodes an optional `sinceDate` and derives both ruled strings from it
(`HouseWidgetPayload.eyebrow` / `.emptyLine`, drawn at `HouseWidgetViews.swift:72` and `:85`). X2's
`WidgetSnapshot` has no such field, and `WidgetSnapshotTests.needsYouNeverReachesTheWidget` **locks
the key set**:

```swift
#expect(Set(json.keys) == ["movedRows", "houseLine", "refreshedAt", "flagOn"])
```

Confirmed on-device, not inferred — `research/01-shot-ledger.md:1523` quotes the file X2 actually
wrote on `dr-w6-x2`:

```
widget-snapshot.json keys ['flagOn','movedRows','refreshedAt']
```

Consequence on the merged wave, from X1's own fallbacks:

| Mock (`b-M6b.html`, verbatim) | What integration will actually draw |
|---|---|
| `Since Thu` | `What moved` |
| `Nothing moved since Thursday.` | `Nothing moved.` |

Both degradations are *honest* — X1 built them so the widget claims no day it was not given — which
is why this is a copy/ruling failure rather than an honesty failure. But the widget's eyebrow is the
instrument M6b is built around, and it is dark.

`sinceDate` was **not** in X2's published contract (`x2-tasks.md` §0); X1 added it as optional
forward-compat. So this is a seam the two lanes never agreed, not a broken promise. The producer is
X2's, so the fix is X2's: one argument — `sinceDate: record.window.start` — plus the key-set
assertion above.

### F3 — BLOCKING (owed, and already named) · confidence HIGH · `houseLine` has no producer, so the widget's house half never draws

`grep -rn "noteHouseLine"` over `Patina/` returns the definition and nothing else. The ledger
confirms it on the device: *"`houseLine` is absent because nothing calls `noteHouseLine` yet"*
(`01-shot-ledger.md:1531`).

Q8 and direction-b §4 put the house on the widget; X1's report describes the widget as carrying "the
MOVED rows **and the house**". As merged, it carries no house. `HouseWidgetViews.swift:109` falls
through to nothing.

X2 filed this correctly as integration note §1 (one line in `DailyRoomView`, a file X2 does not own),
so this is **owed work, not a concealed gap** — but it is owed *before* the wave can claim M6, and it
belongs on the steward's integration list, not in a later wave. I am recording it as blocking so it
cannot be closed by the ownership boundary alone.

### F4 — BLOCKING, pending Fable's ruling · confidence HIGH · the reminder opt-in shows SP-08's push primer, and silently enrols the person in remote push

`InvoiceReminderRow.swift:47` presents `PushPrimerView` when authorization is undecided. That screen
says (`PushPrimerView.swift:24`, ruled verbatim, "do not reword"):

> We'll tell you when your designer sends something that needs you — a decision, a proposal, or an
> invoice. Nothing else.

The person tapped **"Remind me the day before it's due"**. They are then shown a promise about a
different feature, and the primer's primary button calls
`PushTokenService.shared.requestAuthorizationAndRegister()` — which registers for **remote**
notifications. Someone who asked for one local reminder is enrolled in APNs without that being said
anywhere on the screen.

Two further consequences X2 names honestly in `x2-notes.md` §5:

- an install that already saw the money-moment primer never sees this one, and gets
  `Notifications are off for Patina.` instead — even when the state is *undecided*, not off (see F9);
- opting into the reminder **before** the first money moment burns Q7's one ask, so SP-08's primer
  never appears at the moment it was ruled for.

The walk took exactly this path (`01-shot-ledger.md`: *"authorization was granted through
`PushPrimerView` → the system alert (`Allow`)"*), so it is the shipped behaviour, not a corner.

Steward §7 cautioned against precisely this: *"X2 must not route the reminder through the push
primer … a reminder the person opted into on the invoice can ask for authorization on its own terms
— but if it does, its copy says exactly what it will say and nothing else."* `x2-tasks.md` §2
overrode the steward. **X2 followed its brief**; the defect is in the brief. Fable's ruling is needed
on which of the two governs — I am marking it blocking because as written the app asks for a
permission using a sentence that does not describe what it is about to do, which is the C5 line.

Fix, if the steward's reading wins: a reminder-specific primer whose sentence is the reminder's own
promise (the string already exists — `InvoiceReminder.promise`), asking for `[.alert]` only, with no
remote registration and no interaction with Q7's gate.

### F5 — MAJOR · confidence HIGH (mechanism) / MEDIUM (blast radius) · a unit run now writes the real App Group flag mirror

`resolveAtLaunch(arguments:provider:mirror:)` defaults `mirror` to `.appGroup`. Eleven existing call
sites in `PatinaTests/FeatureFlagsTests.swift` (lines 41, 59, 70, 90, 125, 130, 141, 150, 172) use
the two-argument form and therefore now write `patina.flags.resolved` into the **real**
`group.cloud.patina.app` suite. `PatinaTests.xctest` is hosted by `Patina.app`, so it runs inside the
app's entitlement context — and X2's own §7 records that the container **is** honoured on this build,
so the write lands.

The last test to run wins, and the value it leaves is read by both
`RecordSnapshotStore.shared`'s default `flagIsOn` and (on a device) the widget. A test run can
therefore flip the widget's flag under a subsequent walk on the same simulator, in either direction,
with no trace. It also means `FeatureFlagsTests` is no longer side-effect-free, which was true of it
before this lane.

Fix: pass `mirror: .testing(freshDefaults())` at those nine call sites, or give the injected form no
default at all so the compiler finds them. `FeatureFlagMirrorTests` already has the helper.

### F6 — MAJOR · confidence HIGH (path) / MEDIUM (fires today) · `noteHouseLine` can mint a snapshot out of nothing

With no file on disk, `noteHouseLine(_:)` writes:

```swift
WidgetSnapshot(movedRows: [], houseLine: line, refreshedAt: current?.refreshedAt ?? now, flagOn: …)
```

X1's payload reads that as `isEmpty` (`flagOn && movedRows.isEmpty`) and draws **`Nothing moved since
…`** — an assertion that the window held nothing, made when the app has never built a record at all.
The honest state there is X1's no-data placeholder, which only a *missing* file produces.

Latent today (F3: no call site). It goes live the moment the steward applies X2's own integration
note §1, and `DailyRoomView` has the rail cards in hand on paths where the record has not landed yet
(cold launch with a withheld/foreign record, an unauthenticated paint, a failed refresh).

Fix: `guard let current else { lock.unlock(); return }` — the house line is a decoration on a record
that exists, never a reason to create one.

### F7 — MINOR · confidence MEDIUM · the reminder carries `.default` sound

`InvoiceReminderService.schedule` sets `content.sound = .default`. `x2-tasks.md` §2 enumerated the
notification's shape as *"No urgency word, no 'Don't forget', no badge, no sound escalation, no
repeat"*, and steward §7 as *"no badge, no repeat, no escalation"*. A default sound is not
*escalation*, so this is arguably inside the letter of the ruling — but it was not in the enumerated
shape, the promise sentence does not mention it, and `2x-panel-u1` §6's whole argument for this
surface is restraint. Worth a one-word ruling; `.sound = nil` costs nothing.

### F8 — MINOR · confidence HIGH · the row prints a recomputed fire date, not the scheduled one

`refresh(offer:)` sets `fireDate = pending.contains(identifier) ? offer.fireDate : nil` — the date is
recomputed from the invoice's *current* `due_date`, while the system still holds the trigger built
from the old one. If a designer moves a due date, the row says `Reminder set for Sep 8.` while the
notification is still queued for Sep 1. Small, but it is the row's one factual claim.

### F9 — MINOR · confidence HIGH · "Notifications are off" is printed for an undecided install

In `set(_:)`'s `default:` arm, `hasAsked() == true` with status `.notDetermined` yields
`isDenied = true` and the line *"Notifications are off for Patina. You can turn them on in
Settings."* The state is **undecided**, not off, and this is a reachable path: `PushPrimerView`'s
"Not now" arms the gate without ever showing the system dialog.

### F10 — MINOR · confidence MEDIUM · `remove(invoiceId:)` does not clear `isDenied`

The denial line survives a `Remove`, and nothing re-reads `authorizationStatus()` after the first
`set` — so a person who grants in Settings and comes back still sees "Notifications are off" until
the view is rebuilt. `refresh(offer:)` is the natural place to re-check.

### F11 — MINOR · confidence HIGH · `save` and `remove` traded `defer { lock.unlock() }` for explicit unlocks

Both are correct as written (I traced every path; `writeWidgetSnapshot` and `readWidgetSnapshot`
swallow their own errors, so there is no early return). But `save` is now a 20-line body holding an
`NSLock` with a manual unlock, and one future `guard … else { return }` deadlocks every record write
in the app. `noteHouseLine` already carries the duplicated `lock.unlock()` this invites. A
`defer`-plus-`reload-after` shape (compute inside, reload outside via a local flag) keeps both
properties.

### F12 — MINOR · confidence HIGH · the consent sentence is the smallest type on the screen

`InvoiceReminderRow.offerRow` renders `offer.promise` — the one sentence the person must read before
opting in — in `PatinaTypography.captionSmall`, which is **10 pt** (`PatinaTypography.swift:63`),
under a 14 pt act label. It scales with Dynamic Type (`relativeTo: .caption2`), so this is
legibility, not accessibility failure. Still: the promise is the point of the affordance.

### F13 — MINOR · confidence MEDIUM · "refreshed on foreground" only holds while Today is mounted

Q8 rules the widget "refreshed on foreground + timeline policy". The reload rides
`RecordSnapshotStore.save`, reached only from `RecordRefresh.run` (`RecordRefresh.swift:88`), whose
foreground trigger is `DailyRoomView`'s `.onChange(of: scenePhase)` (`DailyRoomView.swift:160`).
Foregrounding while deep in Studio, Spaces or Pieces refreshes nothing and reloads nothing. The
widget then leans on its 30-minute policy and X1's staleness line, which is honest — but it is not
"refreshed on foreground".

### F14 — MINOR / observational · confidence HIGH · `route` is written per row and nobody reads it

X2 writes `route: {kind, id}` on every row (a faithful implementation of its own §0 contract); X1
deliberately does not decode it, resolving `patina://record/<rowId>` against `house-record.json`
instead so the route vocabulary lives in one place. Harmless — `JSONDecoder` ignores unknown keys —
but the two lanes' notes now disagree about whether the field is part of the contract, and it is the
only place in the payload where a route vocabulary could silently drift. Either drop it, or record
in the canon digest that it is reserved.

### F15 — observational · scope

`WidgetSnapshot.swift` is a **new** file in `Core/Persistence/`, which steward §8 names only at
`RecordSnapshotStore.swift` granularity. `x2-tasks.md` §1 task 2 authorised it, it collides with
nothing in X1's tree, and `Patina/`'s `PBXFileSystemSynchronizedRootGroup` picks it up with no
pbxproj edit — so no target membership was needed and X1 remains the pbxproj's sole writer. Recorded
so the steward does not read it as an ownership breach.

---

## What is genuinely good, and why it matters

- **The honesty rule is structural, then proven on a device.** `WidgetSnapshot` has no member for
  `needsYou`, for a count, or for a badge; `WidgetSnapshotTests.needsYouNeverReachesTheWidget`
  asserts it against the **bytes** (`JSONSerialization`, exact key set, and a substring check that no
  NEEDS YOU row id leaked through the projection), not against the Swift type. The ledger then quotes
  the real file from `dr-w6-x2`: `house-record.json` holding three NEEDS YOU rows, `widget-snapshot.json`
  holding none of them and no count. That is the single most important thing in the wave and it is
  done properly.
- **Sign-out is one choke point, and it was reasoned to, not chosen.** `remove()` deletes both files
  and reloads; the payload therefore needs no owner id, which is why a widget process that cannot ask
  who is signed in has nothing left to judge. `LocalStoreReset.swift:53` and the foreign-record
  discard both already funnel here. `removeClearsTheWidgetAndReloads` pins it.
- **The reload is an injected closure**, so `import WidgetKit` never reaches the test tier and reloads
  are counted rather than delivered — and `reloadWidgets` fires **after** the unlock on every path,
  which is the reentrancy bug this shape usually ships with.
- **Idempotency, offer rules and copy are pinned by real tests, not by assertion on the same
  constant.** `theCopyCarriesTheBalance` catches total-vs-balance; `aMomentAlreadyGoneIsWithheld`
  catches the day-before-that-has-passed edge; `theTapRoutesToTheInvoice` resolves the scheduled
  request's own `userInfo` through the **real** `NotificationRouter` rather than restating it.
- **Date handling is right in a place it is usually wrong.** `ISO8601DateParsing.dateOrDay` parses a
  bare `yyyy-MM-dd` in the device time zone, `startOfDay` comparisons stay in the local calendar, and
  the trigger is a `UNCalendarNotificationTrigger` on `[.year…minute]` — so 09:00 stays 09:00 across
  a DST boundary. The walk confirms it: due Sep 2 → `Reminder set for Sep 1.`
- **The integration notes are honest about their own costs** — §5 names the burnt Q7 ask before anyone
  had to find it, §7 reconciles the two contradictory W2 App Group findings without claiming either
  as a device result, and the claim level is stated as sim-verified with the shared-container
  question left explicitly open.

---

## Gate

**Not independently re-run.** No X2 report was supplied to this review, and `ios-gate.sh build`
writes to the shared DerivedData that X1's and the steward's runs also use, so I did not run it
rather than disturb a concurrent lane. What I did verify:

- **SwiftLint, per-file over all nine touched files: zero violations.** (Run with the file paths as
  positional arguments; passing a directory pulls in the whole `Services/` tree and reports
  pre-existing violations in `HelpAnalytics.swift` and `CompanionAPIClient.swift` that are not this
  lane's.)
- **Every symbol the new code leans on exists** at the version on this branch: `RemoteInvoice.isPayable`
  / `.balanceCents` / `.currencyCode` / `.due_date`, `PatinaCurrency.format`, `DateDisplay.short`,
  `ISO8601DateParsing.dateOrDay`, `PushPrimerView(onDecided:)`, `PushTokenService.armAuthorizationPromptGate()`
  / `.hasAskedForAuthorization`, `PatinaTypography.bodySmallMedium` / `.captionSmall`,
  `PatinaColors.Text.interactive` / `.secondary` / `.muted`, `NotificationRouter.resolve(apnsUserInfo:)`.
- **No existing test was renamed, deleted or loosened** — the diff adds three suites and touches no
  existing test file.
- **The walk is real and the evidence is quoted, not summarised**: five shots on `dr-w6-x2` from a
  *signed* `xcodebuild test` product (not `CODE_SIGNING_ALLOWED=NO`), ledger rows at
  `research/01-shot-ledger.md:1497-1544`, including the on-disk key sets of both files and the
  `group.cloud.patina.app.plist` contents showing `patina.flags.resolved` beside the visit and owner
  stamps. Claim level stated as sim-verified with no device claim, correctly.

**The steward should re-run `ios-gate.sh build` + the PatinaTests tier on the integration branch after
F1/F2/F5 land** — F2's fix changes an assertion that is currently green, and F5's fix touches nine
existing call sites.

---

## Recommendation

**Do not merge as-is.** F1 is a false money statement the app makes on its own, F2 leaves the
widget's ruled instrument dark, F3 leaves half of Q8's payload unbuilt, and F4 needs Fable's ruling
before the permission ask ships. All four are small, and three of them are one to three lines inside
files X2 already owns:

| # | Fix | Where |
|---|---|---|
| F1 | cancel a pending request when the offer disappears | `InvoiceReminderService.refresh` + mount the `.task` outside the `if let offer` |
| F2 | `sinceDate: record.window.start` | `WidgetSnapshot.init(record:…)` + the key-set assertion |
| F3 | one line, `RecordSnapshotStore.shared.noteHouseLine(cards.first?.name)` | `DailyRoomView` — **steward's**, per X2's note §1 |
| F5 | `mirror: .testing(…)` at nine call sites | `PatinaTests/FeatureFlagsTests.swift` |
| F4 | ruling first, then either leave as-is or build a reminder-specific primer | Fable |
| F6 | `guard let current` | `RecordSnapshotStore.noteHouseLine` |

The lane's core judgement — making the honesty ruling structural instead of reviewable, and proving
it against the bytes on a real container — is the right one, and it is the part of the wave hardest
to get back if it is got wrong.
