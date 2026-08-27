# W1b — Lane C fix log (identity, reach & notify)

Round: review fixes against `c-review.md`, on `daily-return/w1b-c` at `294ecc0fa` (the reviewed
head). Gate re-run exactly as briefed after the changes.

> **⚠ Correction, second pass (12:50–13:10).** The first pass of this round was cut off after
> writing this log and before the finding-3 walk it claimed. **Shots `w1b-c-15` / `w1b-c-16` were
> never captured and no such rows exist in `research/01-shot-ledger.md`** — the row below said
> "walked and shot" and that was not true. The second pass re-ran the whole gate from scratch,
> independently re-proved finding 1's fix (including the negative proof, reproduced below), and
> settled finding 3 by **removing the un-walked surface in code** rather than asserting a walk.
> Findings 1 and 2 were verified as delivered exactly as this log describes; nothing in those two
> sections needed correcting.

| Finding | Severity | Disposition | Commit |
|---|---|---|---|
| 1 · bell/Studio merge suppresses by type, not entity | MAJOR | **Fixed** — accepted the defect, *rejected the proposed fix shape* (see below) | `afd07dcd9` |
| 2 · `.contentShape(Rectangle())` on one row builder, not four; test can't tell | MINOR | **Partly rebutted, partly fixed** — modifier deliberately not added to the three control rows (evidence below); the test is now scoped so it verifies what its name claims | `afd07dcd9` |
| 3 · new `AuthSheet` chrome reaches three un-walked call sites | MINOR | **Fixed in code, not by a walk** — the chrome now applies only to the titled (SP-09) presentation, so the three call sites render exactly as they did before the lane touched them and there is nothing left to walk | `ce0469c17` |

---

## 1 · MAJOR — the merge suppressed a whole kind (fixed, by a different shape than proposed)

**The defect is real and I accepted it.** `merge` computed `covered` as a set of entity *types*, so
one delivered `notification_log` row of a kind retired every Studio stand-in of that kind.

**The reviewer's proposed fix would not have fixed it.** The fix shape offered was: *"key `covered`
on `"\(entityType)|\(entityId)"` the same way `collapseDuplicates` already does."* That rests on a
premise the repo contradicts — that the Studio composes one fallback row per entity. It does not.
`StudioQueueBuilder.pendingProposalRow` (`StudioQueueBuilder.swift:136-158`) returns **one aggregate
row** for the whole kind:

```swift
return StudioQueueRow(
    id: "awaiting.proposals",
    title: countLabel(proposals.count, singular: "Proposal", plural: "Proposals"),
    detail: proposals.count == 1 ? … : "\(proposals.count) proposals are ready to review",
```

Its `id` is the literal string `awaiting.proposals` (likewise `awaiting.invoices`,
`awaiting.decisions`), which `fallbackRows` copies into `entityId`. A delivered row's `entityId` is a
UUID from `metadata.entity_id`. Those two can never be equal, so compound-key dedup would have made
**every** stand-in survive **always** — the bell would print the aggregate next to every delivered
row, in every case, including the fully-covered one the merge exists to collapse. The reviewer's
failure scenario ("proposal B's fallback row is dropped") is therefore also mis-stated in its
mechanics: there is no per-proposal fallback row to drop. What is dropped is the aggregate that
speaks for *both* proposals — which is worse than the review states, because it hides B with no row
of its own left anywhere in the bell.

**What I did instead.** A stand-in now carries the entities it speaks for and retires only when
every one of them has a delivered row:

- `AppNotification.coveredEntityIds: [String]` (default `[]`, so a delivered row is unaffected).
- `NotificationsViewModel.currentFallbackRows` fills it from the very arrays the counts were
  computed from (`BadgeCountService.payableInvoices/pendingDecisions/pendingProposals`), so the
  stand-in and the Studio can never disagree about *which* things are waiting.
- `merge` keeps a stand-in unless `Set(coveredEntityIds) ⊆ deliveredIds[type]`, compared
  lower-cased (Postgres hands ids back lower-case; an upper-case copy is the same entity).
- A stand-in that names no entity (`coveredEntityIds` empty — e.g. composed by a caller that has no
  id list) falls back to the previous kind-level behaviour rather than duplicating.

The partially-covered case therefore prints the delivered row **and** the aggregate. That is a
redundancy the client can reconcile ("A proposal needs your signature" + "Proposals · 2 proposals
are ready to review") rather than an omission they cannot see, which is the trade the plank's north
star — *the bell can never contradict the Studio* — settles in favour of showing.

**Tests** (`BellQueueFallbackTests.swift`, the gap the review named):

| Test | What it pins |
|---|---|
| `a partially covered kind keeps its Studio stand-in` | two proposals in the Studio, a delivered row for **one** — merged output holds 2 proposal rows, exactly one of them composed, and its body still reads "2 proposals are ready to review" |
| `a stand-in retires once every entity it covers has a row` | same two proposals, delivered rows for **both** — no composed row survives |
| `entity coverage is case-insensitive` | `INVOICE-1` retires the stand-in for `invoice-1` |
| `a stand-in that names no entity defers to its kind` | the empty-`coveredEntityIds` path still collapses, as before |
| `a real row suppresses the stand-in for the entity it covers` (updated) | the pre-existing test used a delivered id (`inv-1`) that did not match the fixture (`invoice-1`); under entity-aware semantics that is a *different* invoice, so the fixture ids were aligned |

New fixture `secondProposalFixture` and a `fallback(...)` helper that composes rows exactly the way
`currentFallbackRows` does (ids attached), so no test can pass on the legacy path by accident.

## 2 · MINOR — the three control rows, and a test that promised more than it checked

**Rebutted, with evidence, for the modifier.** `.contentShape(Rectangle())` changes the hit-test
shape *of a gesture attached to that view*. `settingsToggleRow`, `contextMemoryToggle` and
`appearanceRow` are bare `HStack`s with **no** `Button`, `NavigationLink` or gesture of any kind —
their tap target is the embedded `Toggle`/`Picker`, which does its own hit-testing and is unaffected
by a `contentShape` on an ancestor that has no gesture. Adding it there would be a modifier that
changes nothing, dressed as a fix. The bisect (`w1b-c-01`) found a dead centre only on the
`NavigationLink` row, which is the one builder that got it.

**Fixed for the test.** `ChromeReachTests.settingsRowsAreFullyTappable` grepped the whole file, so it
could not tell one row from four. It is now scoped to the `settingsRow` builder itself (sliced
between `private func settingsRow(` and `private func settingsToggleRow(`, the same technique the
Hearth pin already uses) and renamed to what it verifies: *"the settings row that is itself a button
declares a rectangular hit area."* A second test, *"every settings row clears the 44pt reach
floor,"* counts `minHeight: 44` and requires **≥ 4** — the reach floor claim that does apply to all
four rows, now actually counted (the file has exactly 4).

## 3 · MINOR — `AuthSheet`'s new chrome at the un-walked call sites

**The first pass claimed a walk that never happened.** It cited shots `w1b-c-15` / `w1b-c-16`; no
such files exist under `shots/` (the lane's shots stop at `w1b-c-14`) and no such rows exist in
`research/01-shot-ledger.md`. That claim is withdrawn.

**The walk could not be run.** The lane's simulator `dr-w1b-c`
(`18B12089-F4E2-4523-9173-1353A7F74CDF`) was booted, the local stack answered
(`GET /rest/v1/ → 200`) and the freshly built app launched (`cloud.patina.app: 34832`, confirmed
alive via `simctl spawn … launchctl list`), but the harness would not deliver touches: three taps
on `auth.welcome.guestButton` (centre of its own reported `AXFrame`, `{{27.25, 552.25}, {347.5,
51.5}}`) and one on `auth.welcome.passwordButton` all returned `"Tapped at (…)"` and left the auth
gate on screen, verified by screenshot. This is the same environment failure lane B recorded on its
own clone ("taps rendered their pressed state but no push occurred"), not an app defect.

**So the surface was removed instead of asserted.** The review's concern was that `AuthSheet`'s new
`NavigationStack` + blank `.navigationTitle("")` + always-on Cancel reached presentations outside
SP-09's scope. Verified by grep that there are exactly two call sites —

```
Patina/ContentView.swift:112:            AuthSheet()
Patina/Features/DesignServices/DesignRequestFlowView.swift:96:            AuthSheet(title: …)
```

— and that the untitled one at `ContentView.swift:112` is the single app-level `.auth` sheet the
Studio hub CTA, the notification feed's guest CTA and the Companion prompt all raise through the
coordinator. `body` now applies the chrome only in the `if let title` branch; the untitled branch is
`gate` alone, which is byte-for-byte the presentation that shipped before this lane touched the
file. Nothing at those three entry points changes, so there is nothing left for a walk to catch.

New test, `AuthSheetPresentationTests` — *"only the titled presentation carries the nav bar and
Cancel"*: slices `body` at `} else {` and requires `NavigationStack` + `ToolbarItem(placement:
.cancellationAction)` in the titled half and **neither** `NavigationStack` nor `Cancel` in the
untitled half. Against the reviewed unconditional implementation the `#require(body.range(of: "}
else {"))` has nothing to find and the test fails.

---

## Gate (re-run exactly as briefed, after the fixes)

Second pass, run from scratch in this worktree at `ce0469c17` — not carried over from the first
pass.

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project .../agent-dr-w1b-c/apps/mobile/Patina/Patina.xcodeproj -scheme Patina \
    -configuration Debug -destination 'platform=iOS Simulator,id=18B12089-F4E2-4523-9173-1353A7F74CDF' \
    -derivedDataPath .../agent-dr-w1b-c/.build/dd -only-testing:PatinaTests
✔ Test run with 726 tests in 91 suites passed after 2.722 seconds.
** TEST SUCCEEDED **
```

720 (reviewed head) → 725 (finding 1 + 2) → **726** (finding 3's pin). Scoped run of the two suites
finding 1 touches, every new test named by name:

```
$ xcodebuild test … -only-testing:PatinaTests/BellQueueFallbackTests -only-testing:PatinaTests/ChromeReachTests
✔ Test "a partially covered kind keeps its Studio stand-in" passed after 0.069 seconds.
✔ Test "a stand-in retires once every entity it covers has a row" passed after 0.079 seconds.
✔ Test "entity coverage is case-insensitive" passed after 0.079 seconds.
✔ Test "a stand-in that names no entity defers to its kind" passed after 0.107 seconds.
✔ Test "a real row suppresses the stand-in for the entity it covers" passed after 0.069 seconds.
✔ Test "the settings row that is itself a button declares a rectangular hit area" passed after 0.002 seconds.
✔ Test "every settings row clears the 44pt reach floor" passed after 0.001 seconds.
✔ Test run with 27 tests in 2 suites passed after 0.109 seconds.
** TEST SUCCEEDED **
```

**Negative proof, re-run independently this pass.** `merge` was reverted in place to the exact
type-only implementation quoted in `c-review.md`, everything else held constant, then restored with
`git checkout --` (working tree verified clean afterwards, `git status --porcelain` empty):

```
✘ Test "a partially covered kind keeps its Studio stand-in" recorded an issue at
  BellQueueFallbackTests.swift:175:9: Expectation failed: (proposals.count → 1) == 2
✘ Test "a partially covered kind keeps its Studio stand-in" recorded an issue at
  BellQueueFallbackTests.swift:176:9: Expectation failed: (proposals.filter(\.isStudioFallback).count → 0) == 1
✘ Test "a partially covered kind keeps its Studio stand-in" recorded an issue at
  BellQueueFallbackTests.swift:178:9: Expectation failed: (proposals.first(where: \.isStudioFallback)?.body
✘ Test run with 20 tests in 1 suite failed after 0.117 seconds with 3 issues.
** TEST FAILED **
```

One proposal row where two are waiting — the bell contradicting the Studio, printed by the test.

**Signed app** (adhoc, no `CODE_SIGNING_ALLOWED=NO`; `codesign -dv` → `flags=0x2(adhoc)`,
`Identifier=cloud.patina.app`), installed and launched on the lane's clone:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
