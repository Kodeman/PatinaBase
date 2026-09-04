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
