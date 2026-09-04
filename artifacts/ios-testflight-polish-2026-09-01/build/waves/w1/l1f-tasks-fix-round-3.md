# W1 · L1-F — task list, fix round 3

Branch `first-flight/w1-l1f`, worktree `.codex/worktrees/agent-ff-w1-l1f`, base `main` after W0.
Round 1 (`l1f-tasks.md`), round 2 (`l1f-tasks-fix-round.md`) and round 3-as-numbered
(`l1f-tasks-fix-round-2.md`) stand; nothing below reverts them.

**What triggered this round.** Two things, and they are different in kind:

1. **New inbox.** `l1-f-notes.md` grew three blocks after this lane's last commit
   (`acb4b3cbb`, 2026-09-02 23:52): **`E4-L1F-1`** and **`E4-L1F-2`** from L1-E round 4
   (2026-09-03), **`O15`** from L1-B round 3, **`O17`** from L1-B round 4. Exactly one of the
   four asks for code in this lane's files.
2. **A re-verification pass** over the eighteen round-one review findings
   (`RL1F-01`…`RL1F-18`), which the fix-round brief re-sent. Rounds 2 and 3 closed all
   eighteen; §"Re-verification" below records the command output that proves each one is
   still closed on `acb4b3cbb`, so the merger does not have to take round 2's word for it.

## Standing lines

**`IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81`** — this lane's clone, one simulator,
explicit udid on every `simctl` call, never `booted`. Launch arguments on every relaunch:
`-DeploymentTarget local`. **No `-PatinaFlags`** — `house-first` is default-on since W0 · D1a.

**The VISION check.** This round changes three sentences and nothing else. It adds no tab, no
zone, no dashboard, no shadow, no red/green status, no badge, no engagement mechanic and not
the word AI. Two of the three sentences get *shorter* in obligation, not longer: a fragment
("Couldn't load messages") becomes a whole sentence with a recovery, which is VISION §5's own
shape — the app says what happened and what to do, and names no server. The third changes one
glyph in copy this lane wrote last round. There is no VISION line to argue.

**The notes I must apply.** Every `build/waves/w1/<lane>-notes.md` addressed to L1-F, re-read at
the start of this round:

| note | source | state |
|---|---|---|
| `E4-L1F-1` — three strings in `MessagingViewModel.swift` (`:413`, `:75`, `:331`) | `l1-f-notes.md` §"From L1-E — round 4" | **applied this round**, task **FR3-01** |
| `E4-L1F-2` — `AppCoordinator.swift:109` is a **W2** row | same | **no action, by the note's own words.** Recorded in the report so nobody re-files it |
| `O15` — reply to `L1F→B-5`: accepted, lands at merge 4 via `l1b-notes-out.md` §S6 | `l1-f-notes.md` §"From L1-B — round 3" | **no action this round.** The `BadgeFreshnessTests.owed` entry naming `StudioQueueBuilder.swift` stays until the binding lands; **FR3-02** confirms it is still there and still not `isIntermittent` |
| `O17` — `LaunchWatchdog.swift` now differs on `first-flight/w1-l1b` (`splashSurfaceDeadline = stallDeadline − 1.5`); take **L1-B's** copy at merge 4 | `l1-f-notes.md` §"From L1-B — round 4" | **no action this round**, by the note's own words. Becomes exit line **FR3-03**, item 3, replacing `L1F→X-2`'s "identical add/add" claim which is now false |
| `O10` — swap `LocalStoreReset`'s literal for `PendingLinkQueue.appGroupIdentifier` / `.defaultsKey` at merge 4 | `l1-f-notes.md` §"From L1-B — round 2" | **rebase-time apply**, unchanged. **FR3-03** re-verifies the suite value so the swap is known-safe before merge 4 |
| `F-L1B-1`, `F-L1B-3`, `F-L1B-4` | `l1-f-notes.md` (L1-B round 1) | applied round 2 — re-verified, §"Re-verification" `RL1F-03` |
| `F-L1A-3` — the `ContentView.swift` `.auth` call-site line | `l1-f-notes.md` (L1-A fix round) | **not this lane's file.** `ContentView.swift` is in no L1-F glob; L1-A adds it at its own rebase (merge 5). Recorded |
| `D→F-1`, `D→F-2` (`A-63`, `PatinaSpacing.lg`) | `l1-f-notes.md` (L1-D) | **no L1-F code** — exit line, unchanged from round 3 |
| `D→F-3` (the fifth `pearl` divider) | `l1-f-notes.md` (L1-D round 3) | **rebase-time apply** — `PatinaColors.Border.hairline` still does not exist on this base. Exit line |
| `N3` (steward) — `sign_proposal` needs no client change | `l1x-notes.md` §N3 | **nothing owed**, by the note's own words |
| `l1-e-copy-deck.md` | L1-E | **re-read this round.** Two rows name a file at all near this lane; only `A-52` → `NotificationFeedView.swift:193` is in an L1-F glob, and it was applied in round 1 (`8d8582db2`). `C5-11` is `Services/Companion/**`, L1-C's. §"The copy deck, row by row" below records the walk |

**The notes I will send** — written to `build/waves/w1/l1f-notes-out-round5.md` and appended
verbatim to each target's own `<lane>-notes.md`:

- `L1F→E-2` → **L1-E**: `E4-L1F-1` accepted in full, including the two rewordings; plus the
  nine straight-apostrophe strings still standing in L1-F's globs that the note did *not*
  name, listed with line numbers, for the W2 48-row sweep.
- `L1F→X-3` → **the steward**: three corrections to `L1F→X-2` that `O15`/`O17` have overtaken,
  and the merge-4 checklist as it now reads.

---

## Coverage — every finding in this lane's W1 table

`build/findings-by-lane.md` §W1 · L1-F, **17 rows**. Rounds 1–3 closed sixteen; `C2-07` is the
one that is half this lane's and half L1-C's. This round changes the disposition of none of
them — it re-proves each, and adds copy to the file behind `C4-04` / `L07-03`.

| finding | closed by | pinned by | this round |
|---|---|---|---|
| `L07-02` | round 1 (`6d8a2d889`) | `ThreadHeaderTests.composerClearsTheTabBar` | re-verified |
| `A-63` | **L1-D**, `first-flight/w1-l1d` — no L1-F code | L1-D's `PrimaryButtonStyleTests` | exit line **FR3-03** |
| `A-80` | round 1 (`2326d92d6`) | `NotificationsLoadStateTests` | re-verified |
| `B-16` | rounds 1–3 (`9538f1d2b`, `5e3dac9d4`, `fc87822db`) | `WidgetSnapshotOwnershipTests` | re-verified |
| `C-13` | rounds 2–3 (`97048b898`, `3fc3a651c`) | `ThreadHeaderTests` | re-verified |
| `C-14` | round 1 (`6d8a2d889`) | `ThreadHeaderTests` | re-verified |
| `C2-02` | round 1 (`760ff545e`) | `DeepLinkQueueTests` | re-verified |
| `C2-07` | L1-F's half done; **open** on L1-C's one line (`L1F→C-1`) | `BadgeFreshnessTests.thereIsNoSecondCount` | **FR3-02** re-proves the bar still fails on contact |
| `C2-09` | rounds 1–3 (`e5673e24b`, `8eb07f18b`, `6d1be3d13`) | `PushAuthorizationCopyTests` | re-verified |
| `C2-21` | round 1 + round 3 (`6b6b93371`) | `DeepLinkQueueTests` | re-verified; acknowledgement half is L1-A's call-site line at merge 5 |
| `C4-04` | round 1 (`6d8a2d889`) | `ThreadHeaderTests` | **FR3-01** rewrites the sentence it renders |
| `GAP7B-02` | round 1 + round 3 (`fc87822db`) | `WidgetFlagOffRenderingTests`, `WidgetSnapshotOwnershipTests` | re-verified |
| `GAP7B-03` | round 1 (`9538f1d2b`) | `WidgetProjectionTests` | re-verified |
| `GAP7B-04` | round 1 + round 2 (`9cca0cb8b`) | `WidgetLinkRoutingTests` | re-verified |
| `GAP7B-05` | round 1 (`9538f1d2b`) | `WidgetProjectionTests` | re-verified |
| `GAP7B-09` | round 1 + round 3 (`6b6b93371`) | `DeepLinkQueueTests` | re-verified |
| `L07-03` | round 2 (`97048b898`) | `ThreadHeaderTests` | **FR3-01** rewrites the sentence it renders |

---

## FR3-01 · `E4-L1F-1` — three sentences in `MessagingViewModel.swift`

The note's table, verbatim, with the reason each row is taken:

| line | today | final | why |
|---|---|---|---|
| `:413` | `"We couldn't send that. Nothing was lost — your message is still here."` | `"We couldn’t send that. Nothing was lost — your message is still here."` | This lane wrote it last round. It is rendered at `ThreadDetailView.swift:198`. Only the glyph is wrong |
| `:75` | `"Couldn't load conversations"` | `"We couldn’t load your messages. Try again."` | Rendered at `ThreadListView.swift:74`. A fragment where the app ships whole sentences with a recovery |
| `:331` | `"Couldn't load messages"` | `"We couldn’t load this conversation. Try again."` | Rendered at `ThreadDetailView.swift:39`. Same |

The note offers the two rewordings rather than imposing them ("if you would rather change only
the glyph this wave and leave the wording, say so"). **Taken in full.** The rewordings are the
`MoneyFailureCopy` shape the rest of this lane's copy already follows, they are three words
longer each, and leaving a fragment beside a whole sentence in the same file would be the worse
of the two inconsistencies.

1. **Failing test.** `PatinaTests/ThreadHeaderTests.swift`:
   - `theFailureSentenceIsAHomeownerSentence` — the equality assertion takes the curly glyph,
     and gains `#expect(!line.contains("'"))` so a straight apostrophe cannot come back.
   - `sendAndLoadFailuresAreDifferentThings` — the source scan takes `:331`'s final text.
   - New case `theLoadFailuresAreWholeSentencesWithARecovery` — it **reads the sentences out of
     the file** (every `self.error = "…"` assignment) rather than restating them, and holds each
     to the rule: opens `We `, ends in a full stop, carries `Try again`, contains no `'`, names
     no server. A test that restated the two literals would be asserting its own constants, and
     a third load failure added later would slip past it entirely.
2. **Run** → `-only-testing:PatinaTests/ThreadHeaderTests`. Three assertions fail on the
   glyph and the wording; that is the whole point of running it first.
3. **Implement.** The three string literals in
   `Patina/Features/Messaging/ViewModels/MessagingViewModel.swift`. No other change: the
   `sendFailureLine` doc comment above `:413` is still accurate, and neither load site changes
   shape.
4. **Run** → `ios-gate.sh unit`, then `build`, `release`, `lint-delta main`.
5. **Commit** `fix(ios-messaging): the three sentences a failure shows, in the app's own glyph`,
   pathspecs
   `apps/mobile/Patina/Patina/Features/Messaging/ViewModels/MessagingViewModel.swift`
   `apps/mobile/Patina/PatinaTests/ThreadHeaderTests.swift`.

**Not swept, deliberately.** Nine more straight-apostrophe strings stand in this lane's globs
(§"What FR3-01 does not touch"). Every one of them is **pre-existing** — `git diff` against the
merge base shows this lane authored none of them — and `E4-L1F-2` states the rule the deck is
working to: a landmine nobody renders this wave belongs in W2 · L1-E's 48-row sweep, not in W1
exit criteria. They leave as note `L1F→E-2` with line numbers instead.

## FR3-02 · `O15` — the one-count bar is still a bar

No code. `O15` accepts `L1F→B-5` and schedules it for merge 4; the two known-issue blocks in
`BadgeFreshnessTests.thereIsNoSecondCount` are what hold the wave to it, and a fix round that
quietly softened either of them would hand the merger a green gate over an open finding.

1. **Run** → `-only-testing:PatinaTests/BadgeFreshnessTests`, and read the run's known-issue
   lines rather than only its verdict.
2. **Assert, in the report:** both entries are present, both name their note, neither is
   `isIntermittent`, and both record — i.e. the lines they grep for are still in the other
   lanes' files. If either had stopped recording, the note had landed and the block was due for
   deletion in the same commit.
3. No commit.

## FR3-03 · exit lines for merge 4 — `L1F→X-2` corrected by `O15` and `O17`

No code. `L1F→X-2` item 3 tells the steward that `Core/State/LaunchWatchdog.swift` is a
byte-identical add/add on `first-flight/w1-l1b` and `first-flight/w1-l1f`. **`O17` makes that
false**: L1-B's copy now carries `splashSurfaceDeadline = stallDeadline - 1.5`. Left uncorrected
the steward would resolve a real conflict by "either side, they are the same".

1. **Verify** the two files differ, and that the difference is only the new constant —
   `git diff first-flight/w1-l1b first-flight/w1-l1f -- <path>` from the worktree.
2. **Verify** `PendingLinkQueue.appGroupIdentifier == LastSeenStore.appGroupIdentifier`, which
   is `O10`'s explicit precondition ("if it is not `group.cloud.patina.app` … say so, because
   then the two stores are not in the same suite").
3. Write both into `l1f-notes-out-round5.md` §`L1F→X-3` and append to `l1x-notes.md`.
4. No commit to `Patina/**`.

---

## Re-verification — the eighteen round-one review findings on `acb4b3cbb`

Run before any edit this round. Each row is the command and what it returned, not a memory of
round 2.

| id | sev | state | evidence on `acb4b3cbb` |
|---|---|---|---|
| `RL1F-01` | blocker | closed (this lane's half) | `BadgeFreshnessTests.swift:161-163` scans `Features/Notifications` **+ `Features/Home` + `Features/Profile``; `:138` greps `unreadNotifications.count` as well as the filter spelling; `:148`/`:150` are the two named waivers |
| `RL1F-02` | major | closed on this side | `pendingLinkNotice` is published; the reader is `AuthScreenView` on `first-flight/w1-l1a` (note `F-L1A-3`), and the one call-site line is L1-A's at merge 5. `ContentView.swift` is in no L1-F glob |
| `RL1F-03` | major | closed | `AppCoordinator.swift:217,233,236` — `scheduleLaunchWatchdog()`, `launchDeadline`; `BadgeCountService.swift:174,183,219,243,411` — `PersistedCounts` write/read/clear; `ThreadDetailView.swift:67` — `.refreshable { await viewModel.load() }` |
| `RL1F-04` | minor | closed as a recorded deviation | `clearNavigationForEndedSession()` at `AppCoordinator.swift:404`, called from `:353`. The `AccountIsolationTests` flip is `L1F→X-2` item 1 |
| `RL1F-05` | major | closed | `ThreadDetailView.swift:146` — `.padding(.leading, Self.backChevronClearance)`, with the chrome's measured `x ∈ [18, 54.5]` in the doc comment at `:110` |
| `RL1F-06` | minor | closed | `HouseWidgetViews.swift:154` — `ForEach(snapshot.drawableRows, id: \.self)` |
| `RL1F-07` | major | closed | `AppCoordinator.swift:404` clears the queue; L1-B's half is applied on its own branch as a literal (`O10`) |
| `RL1F-08` | major | closed | `ThreadDetailView.swift:453` renders the in-flight bubble, `:469` the Sending label, `:208` disables the field |
| `RL1F-09` | minor | closed | `PushTokenService.swift:86` — `case .ask, .granted, .failed:` |
| `RL1F-10` | minor | closed | `WidgetSnapshot.swift:22-40` says what the code does — nil is the placeholder — and names `RL1F-24` |
| `RL1F-11` | minor | closed | `NotificationsLoadStateTests.loadAlwaysResolves` asserts `hasResolved` only |
| `RL1F-12` | minor | closed | `AppCoordinator.init(houseFirstRoot:endSessionSideEffects:)` — the store is injected, defaulted at `:189` |
| `RL1F-13` | minor | closed as routing | `A-63` on L1-D; exit line `L1F→X-2` item 7 |
| `RL1F-14` | minor | carried | device rows in `kodyRun` |
| `RL1F-15` | minor | carried | walker step in `kodyRun` |
| `RL1F-16` | minor | carried | `OrderHandoffTests` flake, `L1F→X-2` item 9 |
| `RL1F-17` | minor | carried | protocol hardening in `kodyRun` |
| `RL1F-18` | minor | closed | `C9-05` closed-by-`L07-02`; `L1F→X-2` item 4 |

---

## The copy deck, row by row

`build/waves/w1/l1-e-copy-deck.md` re-read this round (mtime 2026-09-02 18:06 — unchanged since
round 1). `grep -n "L1-F\|Messaging\|Notification\|Widget\|DeepLink\|AppCoordinator\|PushToken\|BadgeCount"`
returns exactly two rows:

- **`A-52`** → `Features/Notifications/Views/NotificationFeedView.swift:193` — an L1-F glob.
  **Applied**, round 1, commit `8d8582db2`. The string in the file is the deck's final text
  verbatim; the title `"Nothing yet"` is unchanged as the deck instructs.
- **`C5-11`** → `Services/Companion/Models/CompanionAPIModels.swift:280-281` — **not** an L1-F
  glob (`Services/Companion/**` is L1-C's). Not applied here.

The deck's own section headings are `L1-A applies` / `L1-B` / `L1-C` / `L1-D` / `L1-E applies`;
there is no `L1-F applies` section. `E4-L1F-1` exists precisely because this lane's new copy had
no deck row — it arrives as an inbox note instead, and `FR3-01` is where it lands.

## What FR3-01 does not touch

Nine reader-facing strings in this lane's globs still carry `U+0027`. All nine predate this
lane (`git diff <merge-base>..HEAD` shows no `+` line among them). Sent to L1-E as `L1F→E-2`:

| file:line | string |
|---|---|
| `Features/Notifications/ViewModels/NotificationsViewModel.swift:61` | `"Couldn't load notifications"` |
| `Features/Notifications/Models/AppNotification.swift:183` | `"Something's emerging"` |
| `Features/Notifications/Models/AppNotification.swift:184` | `"A piece you've been eyeing just dropped in price"` |
| `Features/Notifications/Views/PushPrimerView.swift:25` | `"We'll tell you when your designer sends something…"` |
| `Features/Messaging/Views/ThreadListView.swift:189` | `"…land here once you're working together."` |
| `Services/Notifications/InvoiceReminder.swift:32` | `"Remind me the day before it's due"` |
| `Services/Notifications/InvoiceReminder.swift:71` | `"We'll send one notification: …"` |
| `Services/Notifications/InvoiceReminder.swift:86` | `"The day before it's due"` |
| `App/Coordinators/AppCoordinator.swift:109` | `"We'll open what you tapped once you're in."` — **`E4-L1F-2` already rules this W2** |

`AppNotification.swift:183-184` are fixture rows, not shipped copy; they are listed for
completeness and flagged as such in the note.

---

## Gate

```bash
export IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

Plus the focused suite this round moves:

```bash
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination "platform=iOS Simulator,id=$IOS_GATE_UDID" \
  -only-testing:PatinaTests/ThreadHeaderTests \
  -only-testing:PatinaTests/BadgeFreshnessTests
```

## Self-check

Not a walk. On the lane clone, signed in as `client@patina.dev` where needed: the thread list
and the thread detail, before and after, into
`artifacts/ios-testflight-polish-2026-09-01/shots/w1-l1f/` with a `ledger.md` line each. The
sentences this round changes appear only on a *failed* load or a *failed* send, so the shot that
matters is the one that proves the screens still render correctly with the new strings compiled
in; the failure strings themselves are pinned by the suite, which is where a string belongs.
