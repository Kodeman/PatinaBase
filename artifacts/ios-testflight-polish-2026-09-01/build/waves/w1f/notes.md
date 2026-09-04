# W1-followup — notes out

Branch `first-flight/w1-followup`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1f`, base `46d53c8ce`
(the W1 merge on `main`). **Code tip `10e969287`** — every gate below was run
there — with this file's own commit on top. Clean tree, nothing pushed.
Production untouched: the only database written is `127.0.0.1:54322`, and the
one write there was a `CREATE OR REPLACE FUNCTION` plus a rolled-back test
transaction.

| gate | result |
|---|---|
| `ios-gate.sh build` | `** BUILD SUCCEEDED **`, exit 0 · `.gatelogs/w1f-10e969287-build.log` |
| `ios-gate.sh release` | `** BUILD SUCCEEDED **`, exit 0 · `.gatelogs/w1f-10e969287-release.log` |
| `ios-gate.sh unit` | `━ Test run with 2309 tests in 252 suites passed after 7.805 seconds with 2 known issues.` · 0 failures · `.gatelogs/w1f-10e969287-unit.log` |
| `ios-gate.sh lint-delta main` | `✓ lint-delta: no new warnings in touched files`, exit 0 · `.gatelogs/w1f-lintdelta-2.log` |
| SQL | `psql … -f supabase/tests/rls/00564_client_signoff_approval.test.sql` → exit 0, silent (every ASSERT passed) |

⚠ **One local-stack state change to know about.** `00564` was applied to
`127.0.0.1:54322` by running the file through `psql`, not by `supabase db push`
— so `public.approve_client_signoff` exists there with **no row in
`supabase_migrations.schema_migrations`**. Harmless (the next `supabase:reset`
replays from files, and the file is on this branch), but a `db push` from a
checkout that has the file will report it as pending against a database that
already has the function; `CREATE OR REPLACE` makes that a no-op.

**The known-issue count is 4 → 2, as scheduled.** The two that remain are
`BrandVoiceLintTests` :168 (`case curatedMix = "curated_mix"`, W2 · L1-E's call)
and `RoomLifecycleTests` :297 (note O14's `LocalRoomSignal` observer, which L1-C
declined). `MatchScoreResolverTests`' two are gone — item 6 landed the guard
they were waiting for.

Clone: `ff-w1f-impl` `4BB2FEBA-E070-4A21-9DAE-DC13A603F209`, made from the
review device, erased, keychain reset, status bar overridden, light. Deleted at
task end; the review device `973D1724-…` was shut down for the clone and
rebooted with Simulator.app attached.

---

## The commits

| sha | row(s) |
|---|---|
| `60b589338` | `W1-S-01` / `A-34` / `C-11` — the unscored-piece guard, cherry-picked and re-pointed |
| `2a8bb6a3d` | `W1-B-17` / `GAP3-18` — the guest room list |
| `aa3408ab3` | `W1-B-16` / `L07-05` — the cold-launch Studio count |
| `cf154a7e0` | `W1-B-18` + `W1-C-13` + `W1-B-09` — the tour bubble |
| `19552a0e5` | `W1-C-07` — the signed-in intro's sign-in door |
| `8b22e7364` | `W1-C-10` — `--resetonboarding` and `profiles.help_state` |
| `625ce2761` | `W1-C-11` — the stalled connection pool |
| `2a3336967` | `W1-B-03` — migration 00564 + the client-court sign-off act |
| `904959e78`, `10e969287` | two follow-ons: a test pin corrected against what it can actually drive, and the branch's own two new SwiftLint warnings |

Shots: `artifacts/ios-testflight-polish-2026-09-01/shots/w1f/`.

---

## What was walked, and what was not

Four of the eight were driven on glass. Naming which is the point of this
section.

**Walked.**

- **`W1-C-13`** — step 2's card at y 315…455 with the record above it and the
  whole tab bar visible (`01-tour-step2-above-the-bar.png`), step 3 still above
  the bar at y 631…771 (`02-…`), step 1 unmoved below the greeting.
- **`W1-B-18`** — at accessibility-extra-large the card is 312 × 298 and the AX
  tree carries **Skip and Next**; the counter, the whole title and the whole
  body are drawn (`03-tour-step1-axxl-skip-and-next.png`). Walk B's shot 61 had
  a clipped counter, cut ascenders, a body line spilling below the rounded rect
  and neither button.
- **`W1-C-07`** — signed in as `client@patina.dev` (GoTrue password grant),
  relaunched with `--resetonboarding`, landed on the intro carousel, and
  `scan_ui` returns `Onboarding.SkipButton` + `Onboarding.PrimaryButton.0` and
  nothing else. As a guest, on the same build, the door is still there.
- **`W1-B-17` / `GAP3-18`** — the walk's exact condition, reproduced and then
  closed: `local_store_owner_user_id = A0000000-…-0005` in the app's
  `cloud.patina.app.plist`, `ZROOMMODEL` in `default.store` holding **"Guest
  Bedroom"**, no session — and the guest Your Spaces reads **"No rooms yet"**
  with no room card and no Whole Home bar (`04-guest-spaces-empty-on-an-owned-store.png`).
  The guest Studio agrees: 0 ROOMS, 0 SAVED.

**Not walked, and why.**

- **`W1-B-16`** needs an offline cold launch with a floor on disk. Pinned in
  `ColdLaunchStalenessTests` on both halves (the floor keeps `storedAt`; the hub
  reads `lastSuccessAt ?? restoredFloorAt()`), and it owes the same airplane-mode
  pass `R-02` had.
- **`W1-C-11`** cannot be reproduced without wedging a real socket. What is
  pinned is the mechanism. It still owes the deliberate airplane-mode round trip
  and the cold-launch push tap — R1's **D-07**.
- **`W1-B-03`** is proven end to end **against the database** (red→green in a
  rolled-back transaction; nine sections) and by source pins on the screen. The
  app path is unwalked because the simulator would not hold a session (below).
- **`W1-C-10`**'s server half is pinned, not walked, for the same reason.

### The one harness fault this task hit

On `ff-w1f-impl` a signed-in session does not survive a relaunch. supabase-swift
logs `Failed to retrieve session: Unspecified Keychain error: -34018` on every
read, in the app and in the test host alike. The guest opt-in — a plain
`UserDefaults` write — survives fine, so this is the Keychain and not the app.
The likely cause is the `simctl keychain reset` this task's own hard rules
prescribe at clone setup. **It is not caused by anything on this branch**: the
session is equally gone after a plain relaunch with no `--resetonboarding`,
which is the check that clears the flag of suspicion.

Consequence for the next walker: a clone that has had its keychain reset cannot
walk anything behind a *restored* session. Sign-in within a launch works; the
launch after it does not. Either skip the keychain reset, or reinstall the app
after it and verify one relaunch holds a session before trusting the route.

---

## Two briefs whose stated mechanism the source did not bear out

Both are recorded here rather than quietly re-scoped, because the fix follows
the behaviour and not the note.

1. **`W1-B-17`** — the brief (from the finding's `judgeNote`) says seeding
   `settledUserId` made `A → nil` stop reading as a scope change. It did not:
   `AuthService.isAccountChange(previous:incoming:)` is `previous != incoming`,
   so a sign-out is still a change and `SessionScope.reset()` still fires. What
   survives a sign-out is the **SwiftData store**, which
   `LocalStoreReset.wipeUserScopedData()` clears on one seam only — a
   *different* account signing in — deliberately, so the same account signing
   back in finds its rooms. That is also why signing in as another account did
   clear the list. `LocalStoreOwnership.accountRowsAreVisible` is the gate L1-B
   built for the guest in between; `RoomStore`, `ProfileViewModel` and
   `StyleProfileStore` read through it and `YourSpacesView`'s own `@Query` did
   not. The finding's second fix clause is the one taken.
2. **`W1-C-10`** — `forgetAllFirstLaunchTourState()` is already in the
   `--resetonboarding` block (`PatinaApp.swift:80`, landed at `7c119e563`);
   there was nothing to restore. The open half is the one the finding's own fix
   line names, and it is what this branch did.

---

## Judgement calls a reviewer should look at first

- **00564 is a new function beside `apply_client_decision`, not a change to
  it.** A nullable `p_selected_option_id` on the canonical selection path is
  currently a `check_violation` — a fail-closed answer worth keeping — and the
  two acts have genuinely different shapes: choosing feeds through to FF&E specs
  and dual pricing, approving carries only consent. The cost is a second
  entry point on one table; the guard against divergence is that
  `approve_client_signoff` refuses any decision that carries options, so no row
  is ever answerable both ways.
- **`cardClearance = 372` in the tour's placement.** It is the card's own
  accessibility worst case (16 + 300 + 8 + 44 + 16), used as "is there room for
  one below". Against the geometry measured this session — a short record card,
  rect ≈ 131…238 local, 491 pt below it — step 2 still resolves `.top`, and it
  looked correct on glass. Against walk C's geometry, a record carrying a full
  attention list, it flips `.bottom`, which is the fix. **The fixture on this
  clone did not reproduce W1-C-13's own condition**; the rule is pinned with the
  finding's geometry in `FirstLaunchTourPlacementTests` instead, and a walker
  with a full record should look at step 2 again.
- **The copy column's 300 pt cap** is a number, and the popover would have given
  it less on its own — a `ScrollView` has no ideal height, so inside a popover
  it took 105 pt of the 300 it was allowed until the column was measured and the
  height handed back. If a future step's copy is much longer than these three,
  the cap is the thing to raise.
- **`PatinaURLSession` flushes both pools on one stall-shaped failure, at most
  once per request budget.** The alternative — flushing per failed request —
  drops the connection the previous flush just opened. The alternative in the
  other direction, a counter before flushing, costs a full 30 s per stall before
  anything is tried. One immediate flush and then a budget of quiet is the
  middle, and both halves are pure functions with their own tests.
- **`--resetonboarding` now writes to `profiles.help_state`.** A debug flag that
  mutates a server row is worth a second opinion, even though the row is the
  caller's own and the flag is DEBUG-shaped. It is spent once per process.
- **Scope held.** `ARPlacementManager`'s `URLSession.shared.download(from:)` is
  left alone (a one-shot asset fetch, not part of the cold-launch burst), and
  the room screens below Your Spaces — `RoomProjectView`, `CrossRoomView`,
  `MoveOrCopyItemSheet` — are not separately gated, because every route to them
  runs through a card or a bar the gate now withholds.
- **One misfiling.** `WalkFixTwoTests`' `W1-C-04` pin was re-pointed at
  `Text(verdict)` after item 6 changed the row it reads; that edit rode in the
  `W1-C-10` commit (`8b22e7364`) rather than in item 6's. The commit body does
  not claim it.

---

## Kody-run, and owed

1. **Apply `00564_client_signoff_approval.sql` to Strata.** It is the act
   behind `W1-B-03` and nothing on this branch has touched production. It is
   independent of `00563` and `00562` and can follow them in any order; it
   creates one function and grants EXECUTE to `authenticated` only.
   Read-only probe before and after:
   ```sql
   select has_function_privilege('authenticated',
     'public.approve_client_signoff(uuid, text, text)', 'EXECUTE');
   ```
   — `false`/error before, `true` after. There is no data migration and nothing
   to roll back but the function.
2. **`W1-C-11` owes hardware.** One deliberate airplane-mode round trip plus a
   cold-launch push tap, which is R1 · **D-07** as written. The recovery is
   invisible when it works; the thing to watch is that the screen after the
   outage loads rather than sitting at 30 s.
3. **`W1-B-16` owes an offline cold launch** on the device pass — the Studio
   header should now carry a "Last updated …" line above the error card, where
   walk B found none.
4. **`W1-C-10`'s server half owes one signed-in `--resetonboarding` launch** on
   a clone whose keychain works, checking that `profiles.help_state` goes to
   `{}` and the tour replays.
5. **`W1-C-13` owes one more look** at step 2 with a record carrying several
   attention rows, which is the geometry the finding was filed against.
   — **Done in pass 2 below, and it was still broken. Now fixed and walked.**

---

# Pass 2 — the follow-up review's seven rows

Same worktree and branch. Base **`d837d4a7f`** (pass 1 plus the walk's four
shots); code tip **`da2ec81bf`**. Clean tree, nothing pushed. Production
untouched: the only database written is `127.0.0.1:54322`.

| gate | result |
|---|---|
| `ios-gate.sh build` | `** BUILD SUCCEEDED **`, exit 0 · `.gatelogs/w1f2-build-final.log` |
| `ios-gate.sh release` | `** BUILD SUCCEEDED **`, exit 0 · `.gatelogs/w1f2-release.log` |
| `ios-gate.sh unit` | `━ Test run with 2322 tests in 252 suites passed after 7.060 seconds with 2 known issues.` · `** TEST SUCCEEDED **` · `.gatelogs/w1f2-unit-final2.log` |
| `ios-gate.sh lint-delta main` | `✓ lint-delta: no new warnings in touched files`, exit 0 · `.gatelogs/w1f2-lintdelta-2.log` |
| SQL | `psql … -f supabase/tests/rls/00564_client_signoff_approval.test.sql` → exit 0, silent (every ASSERT passed, including the two new sections) |

2309 → **2322** tests. The two known issues are the same two pass 1 left
(`BrandVoiceLintTests` :168, `RoomLifecycleTests` :297).

**Compiler warnings.** `RF-03`'s nine are **0**. Counted off the build log the
same way twice — the branch's own build against pass 1's
(`.gatelogs/w1f-904959e78-build.log`):

```
the nine "main actor-isolated static property 'shared' can not be referenced
on a nonisolated actor instance" at the API clients' `= PatinaURLSession.shared`
   before 9   after 0
unique warnings across the target   before 266   after 248
new warnings introduced by this branch: 0
```

The 18 rows that look new in a naive `comm` are the same warnings at shifted
line numbers (`SanityHelpClient` +1, `DecisionsAPIClient` +13,
`FirstLaunchTour` +15) — every one matched to its pre-existing twin before this
was written.

## The commits

| sha | rows |
|---|---|
| `d4a614482` | `RF-03` + `RF-02` + `RF-09` — one file carries all three, so one commit does |
| `6412cf801` | `RF-01` + `RF-08` + `RF-11` — the expired sign-off, its two tests and its SQL |
| `a84bbc447` | `RF-04` — an empty Studio does not date itself |
| `1d2c83a85` | `W1F-01` + `RF-05` — the bar measures itself; the 83/49 doc |
| `da2ec81bf` | the branch's own two new SwiftLint warnings |

`RF-03`, `RF-02` and `RF-09` are one commit rather than three because all three
change `PatinaURLSession.swift` and two of them change
`NetworkRecoveryTests.swift`; a pathspec cannot split a file. `RF-05` rides
with `W1F-01` for the same reason (both are `FirstLaunchTour.swift`).

## `W1F-01` — what the fixture actually measures

The item that failed twice, so this one was measured rather than reasoned. A
temporary probe in the anchor modifier logged every anchor's geometry on the
clone, signed in as `client@patina.dev`, on the full Today record (invoice,
proposal, decision, message, story, shipped, See all) — the walk's own fixture:

```
[tour-geom] todayRecord      rect=(0.0, 177.33, 402.0, 486.67) container=0.0   edge=top
[tour-geom] homeGreeting     rect=(0.0,  62.0,  402.0, 115.33) container=0.0   edge=top
[tour-geom] profileMonogram  rect=(258.0, 729.0, 84.0,  49.0)  container=778.0 edge=bottom
```

**`containerHeight` is 0** for every anchor inside Today's `ScrollView`:
`proxy.bounds(of: .named(rootCoordinateSpace))` resolves nothing through the
scroll. So `arrowEdge`'s very first guard — `containerHeight > 0` — returned
`.top` for step 2 on every layout pass, and `containerHeight -
bottomReservation` (the whole of `W1-C-13`'s fix) was unreachable exactly where
it was needed. **That is why pass 1's pins passed while the screen failed**:
they fed the rule a container of 778, which the shipping path never has.

The bar's own anchor, outside the scroll, resolves the space fine (729 = screen
791). So the bar now reports its own top — `firstLaunchTourChrome()` on
`HouseFirstRoot.bar` → `FirstLaunchTourModel.reportChromeTop` → the placement —
and the rule reads a measured line instead of deriving one.

**And then the flip alone was still wrong.** The record is 487 pt of an 874 pt
screen: 115 pt above it, 127 pt below it to the bar, against a card of 139 pt
(298 at accessibility-extra-large). It fits on **neither** side. Driven on the
clone with the flip in:

- default size — the popover shrank to the ~99 pt it had; the "Step 2 of 3"
  counter was not drawn and the Skip/Next row was cut by the bubble's edge;
- accessibility-extra-large — card frame `{45, 15.33} 312 × 298`, i.e. the
  action row drawn **off the top of the screen**. That is `W1-B-18` re-opened,
  which this wave had just closed.

So the rule's third answer: an anchor with room for a card on neither side does
not get one beside it. The popover attaches to the anchor's own 44 pt top lip
(`Placement.attachment` → `attachmentAnchor: .rect(.rect(…))`) and the card
hangs from there, whole, over the subject the scrim is already holding open —
never over the chrome.

**Walked, same clone, same fixture, both text sizes** (`describe_screen`
frames):

| | before | after |
|---|---|---|
| step 2 · large | `{57, 685.17} 288 × 135.5` → bottom **820.7**, across the bar row 791–840 | `{57, 241.5} 288 × 139.17` → bottom **380.7**, whole card, whole bar |
| step 2 · AX-XL | walk's `{45, 516} 312 × 298` → 814 | `{45, 343} 312 × 298` → bottom **641**, whole card, whole bar |
| step 1 · large | `{57, 198.17} 288 × 135.5` | `{57, 197.5} 288 × 139.17` — unmoved |
| step 3 · large | `{88, 631.5} 288 × 139.2` → 770.7 | `{88, 631.5} 288 × 139.17` → **770.7** — walk C's control number exactly |
| step 3 · AX-XL | `{64, 537} 312 × 225.3` → 762.3 | `{64, 537} 312 × 225.33` → **762.3** — likewise |

Shots: `shots/w1f/05-w1f01-before-step2-across-the-bar.png` (the finding
reproduced on this clone), `06-…-after-step2-hangs-from-the-record.png` and
`07-…-after-step2-axxl.png`.

The probe was removed before the commit; what survives is
`FirstLaunchTourPlacementTests.theShippingGeometryClearsTheBar`, which drives
the rule with the logged numbers (container 0, chrome 729, the record's rect)
and asserts a 139.5 and a 298 pt card both land above 791.

## The other six

- **`RF-01`** — `awaitsClientSignoff` gated on `!isResolved`, which reads
  `status == "responded"` only. `RemoteClientDecision.isApprovableClientSignoff`
  adds the leg the RPC applies: `status = 'pending'`. `draft` and `expired` are
  both refused now, and both are pinned. The screen draws nothing in that slot
  for an expired sign-off — the header still carries the title, the date and
  the deferral acts — rather than a line about options, which is not what is
  wrong with it.
- **`RF-11`** — the migration's test gains the expired refusal (23514, the row
  does not move, nothing is announced) and the `decision_resolved` tail the walk
  saw on glass but the file never checked: exactly one row, addressed to the
  designer, and a replay does not post a second.
- **`RF-08`** — `confirmSignoff`'s two branches and `retrySelection`'s sign-off
  branch are driven, not read. The act is behind a seam on the view model
  (`approveSignoff`), which is how a failure can be produced without a network.
- **`RF-09`** — a success clears the flush mark only if the request STARTED
  after the flush (`successProvesFlush`), so a request that was already in
  flight when the stall fired cannot re-arm the recovery inside its own burst.
- **`RF-02`** — the seven, plus `SanityHelpClient`'s injected default, which is
  what makes the pin's title true. `ARPlacementManager`'s one-shot asset
  download is the only `URLSession.shared` left and the pin names it.
  `patinaData(from:)` carries the session's budget so the two `data(from:)`
  readers do not silently inherit Foundation's 60 s.
- **`RF-04`** — the hub's seam asks whether the floor draws anything before it
  dates it. `BadgeCountService.drawsAnyCount`.

## Two things a reviewer should look at first

1. **`APIConfiguration.requestTimeout` / `resourceTimeout` are `nonisolated`.**
   `PatinaURLSession` is built from them off the main actor, so without this
   `RF-03` trades nine warnings for three. They are immutable `TimeInterval`s;
   the modifier only relaxes access. It also silences the same warning at other
   call sites, which is why the target's total falls 266 → 248.
2. **The chrome's top and the scroll anchors' rects are measured in different
   spaces**, and the rule compares them anyway. The bar resolves the named
   coordinate space (729); an anchor inside the scroll does not and its frame
   comes back global (the record's 177.33 … 664 is screen space, and matches the
   drawn card exactly). The difference is the root's 62 pt top inset, so the
   rule's "room below" reads 62 pt short — conservative in the safe direction
   (it under-estimates the room below the anchor, never over-estimates it), and
   on this fixture it changes no answer. Making `bounds(of:)` resolve through
   the scroll would be the real repair, and it is nobody's item yet.

## Local-stack state this pass changed

The walk left the fixture decision `b0000000-…-00000005c301` **responded**,
with its `decision_notifications` row — the SQL test's first ASSERT is that it
is `pending`, so it could not run. The row was put back to its seeded shape
(`status='pending'`, the four resolution columns NULL, the notification row
deleted) with one `psql` transaction against `127.0.0.1:54322`. Nothing else
was touched, and no seeded `project_ffe_items` row was ever blocked by that
decision, so nothing was lost. After this pass's SQL run the row reads
`pending`, `responded_at` null, 0 notifications.

`00564` is still applied to the local stack by file and **still has no row in
`supabase_migrations.schema_migrations`** — pass 1's warning stands.

## Kody-run, and owed (pass 2)

1. Everything pass 1 owed above still stands — starting with **applying
   `00564_client_signoff_approval.sql` to Strata**.
2. **`W1F-01`'s new placement is walked on a simulator only.** What it needs on
   the device pass is one `--resetonboarding` launch with a full record at both
   text sizes; the shape to watch is that step 2's card hangs from the record's
   top edge with the whole tab bar visible.
3. **The tour's copy column cap (300 pt) is untouched.** If a future step's copy
   is much longer than these three, a card hung from the lip has the whole
   screen below it and will simply be taller — the cap, not the placement, is
   the thing to raise.
