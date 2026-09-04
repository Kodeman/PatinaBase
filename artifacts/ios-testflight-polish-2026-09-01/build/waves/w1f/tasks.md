# W1-followup — task list (eight rows the W1 close left open)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1f`, branch
`first-flight/w1-followup`, base `46d53c8ce` (the W1 merge on `main`). Nothing here is pushed and
nothing production is touched: the only database written is `127.0.0.1:54322`.

---

## Standing lines

**1 — simulator.** One clone, made from the review device `973D1724-90BF-4A0A-B02D-481D561547B3`
(shut down first, then rebooted with Simulator.app attached):

```bash
export IOS_GATE_UDID=4BB2FEBA-E070-4A21-9DAE-DC13A603F209   # ff-w1f-impl
```

Erased, keychain reset, status bar overridden, appearance light. Launch is
`xcrun simctl launch 4BB2FEBA-E070-4A21-9DAE-DC13A603F209 cloud.patina.app -DeploymentTarget local`
— **no `-PatinaFlags`** (D1a). Deleted at the end of the task.

**2 — gates.** `apps/mobile/Patina/scripts/ios-gate.sh` `build` · `release` · `unit` (whole
`PatinaTests`) · `lint-delta main`. Item 6 is expected to take the known-issue count from **4 to 2**
(`MatchScoreResolverTests` ×2).

**3 — VISION check.** No row here adds a tab, a zone, a dashboard, a shadow, a red/green status, a
badge, engagement optimisation or the word "AI". Rows 2, 7 and 8 are subtractions; rows 3 and 4 add
one sentence and one scroll respectively; row 1 adds one control that resolves a decision the client
already sees; rows 5 and 6 are invisible.

**4 — the diagnosis I checked before writing this.** Two of the eight briefs carry a mechanism from
the finding's `judgeNote` that the source does not bear out. Both are recorded here rather than
quietly re-scoped, and the fix follows the observed behaviour:

- **Row 2 (`W1-B-17` / `GAP3-18`)** — the brief says seeding `settledUserId` made `A → nil` stop
  reading as a scope change. It did not: `isAccountChange(previous:incoming:)` is `previous !=
  incoming`, so a sign-out is still a change and `SessionScope.reset()` still fires. What survives a
  sign-out is the **SwiftData store**, which `LocalStoreReset.wipeUserScopedData()` clears on one
  seam only (a *different* account signing in) — deliberately, so the same account signing back in
  finds its rooms. `LocalStoreOwnership.accountRowsAreVisible` is the gate L1-B built for exactly
  this, and `RoomStore`, `ProfileViewModel` and `StyleProfileStore` read through it — which is why
  the guest Studio says "Rooms: 0". `YourSpacesView` does not: it holds its own
  `@Query(sort: \RoomModel.createdAt)`, straight past the gate. That is the leak, and the finding's
  own second fix clause ("scope YourSpacesView's room query … and show the guest empty state") is
  the fix taken.
- **Row 8 (`W1-C-10`)** — `forgetAllFirstLaunchTourState()` is already in the `--resetonboarding`
  block (`PatinaApp.swift:80`, landed in fix round 2 at `7c119e563`); nothing to restore. The open
  half is the one the finding names: the tour's v2 backing is Supabase `profiles.help_state`, and
  the adapter hydrates the cleared local state straight back.

---

## The rows

### T1 · `W1-B-03` + residual — an Approval decision gets an approve control

**Where.** `supabase/migrations/00564_*.sql` (new) · `Patina/Core/Network/DecisionsAPIClient.swift`
· `Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift` ·
`Patina/Features/Decisions/Views/DecisionDetailView.swift`.

**Observed on the local stack**, not inferred:

```
id b0000000-…-00000005c301 | Design Development sign-off — drawing set B
status pending | decision_type approval | coordination_kind signoff | court client | approval_contract ␀
```

`public.apply_client_decision` (00464 §1507) takes `p_selected_option_id`, and for a row whose
`approval_contract` is null it raises `insufficient_privilege` unless `coordination_kind =
'selection'`. Below it, `_apply_client_decision_authorized` raises `check_violation` when the option
does not belong to the decision — so there is no argument list that resolves an option-less signoff.
The surface half is closed (`a9cb4ceb4` prints "There is nothing to choose here yet"); the act does
not exist.

1. **Migration 00564** — `public.approve_client_signoff(p_decision_id, p_client_consent_method,
   p_client_signature)`. Same authority checks as `apply_client_decision`'s outer legs (authenticated
   actor; actor is `designer_clients.client_id`; `court = 'client'`; `coordination_kind = 'signoff'`;
   `approval_contract` null, so Stage-2 artifact rows keep their own path). Same consent validation,
   same `status='responded'` / `responded_at` / `selected_by` / consent-column writes, the same
   `project_ffe_items` unblock and the same `_enqueue_decision_notification(…, 'decision_resolved')`
   tail as the option path. Idempotent replay returns the terminal row. `REVOKE … FROM PUBLIC, anon,
   service_role`, `GRANT EXECUTE … TO authenticated`, mirroring the neighbour.
2. **RLS/SQL test** `supabase/tests/rls/00564_client_signoff_approval.test.sql` — red→green in a
   rolled-back transaction: the addressed client approves; a stranger is refused; a `selection` row
   is refused; a replay is idempotent.
3. **Client** — `RemoteClientDecision` gains `coordination_kind` and `court` (both already
   `SELECT`-granted to `authenticated`, checked with `information_schema.column_privileges`), and
   `DecisionsAPIClient.approveSignoff(decisionId:consent:signature:)` posts the RPC.
4. **Screen** — where the decision is a client-court signoff with no options, the "nothing to choose"
   line is replaced by an **Approve** CTA that opens the *existing* `DecisionConsentSheet` (one act,
   not a new sheet class), and confirm routes to `approveSignoff`. Every other decision shape is
   untouched. The no-options line stays for the shapes that really have nothing to act on.
5. **Tests** — `DecisionApprovalPathTests`: the signoff shape offers Approve; a selection shape does
   not; a resolved signoff offers neither; the consent sheet is the one the option path uses.

**Not done, and why:** applying 00564 to Strata. That is Kody's, and it goes in `notes.md`.

### T2 · `W1-B-17` / `GAP3-18` — the guest room list

**Where.** `Patina/Features/Rooms/Views/YourSpacesView.swift`.

Route the `@Query` result through `LocalStoreOwnership.accountRowsAreVisible` before the view reads
it, so a guest on a store an account owns gets the guest empty state the Studio already gives them.
`AuthService` is `@Observable`, so the gate re-evaluates the moment the session goes.

**Test** — `PatinaTests/GuestRoomListScopeTests.swift`: signing out of a seeded account leaves the
guest room list empty, driven through the same pure predicate the view calls, plus a source pin that
the view reads the gate rather than the raw `@Query`.

### T3 · `W1-B-16` / `L07-05` — the cold-launch Studio count

**Where.** `Patina/Services/Badges/BadgeCountService.swift` ·
`Patina/Features/Profile/ViewModels/StudioHubViewModel.swift`.

The header prints `BadgeCountService.shared.studioHint ?? snapshot.attentionSummary.hint`, and on a
cold launch that hint comes from the restored floor. `PersistedCounts` **already carries `storedAt`**
— `restorePersistedCounts()` simply drops it. So:

1. restore `storedAt` into a `private(set) var floorStoredAt: Date?`, cleared by
   `resetForSessionChange()` alongside the floor it belongs to;
2. `StudioHubViewModel.stalenessLine` renders from `lastSuccessAt ?? floorStoredAt`, and its
   "is there anything retained to be stale" guard counts a restored floor as well as `held`.

**Test** — `PatinaTests/ColdLaunchStalenessTests.swift`: a floor written, a fresh service restoring
it, a total-failure `apply(…)` — the line renders and names the floor's time; with no floor and no
held rows it stays nil.

### T4 · `W1-B-18` + `W1-C-13` + `W1-B-09` — the tour bubble

**Where.** `Patina/Features/Help/FirstLaunchTour.swift` ·
`Patina/Features/Help/FirstLaunchTourPopoverPlacement.swift`.

1. **`W1-B-18`** — the card's `.frame(maxWidth: 320)` is a *width*; what ate the action row is the
   popover's own height budget. Put the card's column in a `ScrollView` bounded by the accessibility
   ramp, and keep the Skip/Next row **outside** the scroll so it is pinned inside the bubble at every
   size.
2. **`W1-C-13`** — `arrowEdge(for:)` decides by the anchor's midpoint alone, so Today's record card
   (upper half of a root that, on the four-tab root, *includes the bar* — `HouseFirstRoot` hosts the
   tour above `rootContent`) resolves `.top` and the card hangs down over the bar. Decide by the room
   actually below the anchor instead, measured off the rect the geometry already reports.
3. **`W1-B-09`** residual — the title keeps the wrap; the scroll is what stops it clipping.

**Tests** — `FirstLaunchTourPopoverPlacementTests` gains the room-below cases;
`PatinaTests` gains a source pin that the action row is outside the scroll.

**On glass** — the tour driven on the clone at accessibility-extra-large, step 1 and step 2 shot.

### T5 · `W1-C-11` — the 30-second stall that survives until relaunch

**Where.** `Patina/Core/Network/PatinaURLSession.swift` (new) + the nine clients that hold
`URLSession.shared`.

The stuck state is `URLSession.shared`'s connection pool: **every** API client in the app shares it,
so one HTTP/2 connection that stalls after CONNECTED (the walker's
`client:data_stall @3.114s` with kong logging nothing) is reused by every following request, and each
then burns the full `APIConfiguration.requestTimeout` of 30 s. Nothing in the app can clear that pool
— which is exactly why a relaunch is the only recovery.

Give the app its own session (the same `sessionConfiguration` shape `SupabaseClientManager` already
builds) and, on a timed-out / connection-lost request, `flush()` it — documented as "ensures future
requests occur on a new TCP connection". The next request opens a fresh connection, so recovery is
automatic the moment the gateway answers.

**Test** — `PatinaTests/NetworkRecoveryTests.swift`: the pure classifier says which `URLError` codes
are stall-shaped, the recovery is invoked once per stall rather than per request, and a source pin
that no `Core/Network` client holds `URLSession.shared` any more.

### T6 · `W1-S-01` = `A-34` / `C-11` — the unscored-piece guard

`git rev-parse 46752b646` resolves. Cherry-pick it, read the diff against `A-34`/`C-11` myself, and
unwrap `MatchScoreResolverTests`' two `withKnownIssue`.

### T7 · `W1-C-07` — the signed-out door on a signed-in intro

**Where.** `Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift`.

`onSignIn` is optional on both `OnboardingFlowView` and `StyleQuizView` and both already render
nothing when it is nil. Pass nil when `AuthService.shared.isAuthenticated`. The carousel stays — a
signed-in account that has not onboarded is legitimately there; the second sign-in door is not.

### T8 · `W1-C-10` — `--resetonboarding` and the server-side tour state

**Where.** `Patina/PatinaApp.swift` · `Patina/Features/Help/firstLaunchTourState.swift` ·
`Patina/Features/Help/FirstLaunchTour.swift`.

The local clear already runs. Record that it ran, and have the adapter installation honour it: when
the launch asked for a reset, clear the tour entries out of `profiles.help_state` before the model
reads them, so the tour replays instead of being hydrated back to `launched: true`.

**Test** — `WalkFixTwoTests` gains the server half: the reset flag is recorded, and the adapter
install path clears the blob's tours when it is set.

---

## Order

T6 (cherry-pick, so a conflict surfaces first) → T2 → T3 → T7 → T8 → T4 → T5 → T1. One commit per
row, pathspec-staged, finding ids in the subject.
