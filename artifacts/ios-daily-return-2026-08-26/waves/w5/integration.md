# W5 — integration (the purchase wave)

Steward, integration branch `daily-return/integration`, worktree
`.codex/worktrees/agent-dr-w5-integration`, base `main` `05b3f9a18`.
Everything below was run in that worktree on 2026-08-28 and is quoted from its own output.

---

## 1. What was merged, and in what order

```
git worktree add .codex/worktrees/agent-dr-w5-integration -b daily-return/integration main
# Secrets.swift copied in (still gitignored: .gitignore:53); .writer.lock.d created
```

| # | Merge | Result |
|---|---|---|
| 1 | `daily-return/w5-d` → `d1f470e37` | clean · 19 files, +3,683 / −38 |
| 2 | `daily-return/w5-a11y` → `002d08ed8` | clean · 5 files, +247 / −33 |
| 3 | `daily-return/w5-c1` → `b773be1fd` | clean · 30 files, +4,221 / −54 |
| 4 | `daily-return/w5-c2` → `ed51f9571` | clean · 32 files, +2,978 / −23 |

**All four merges were textually clean — zero conflicts, zero hand-resolution.** All three
non-backend lanes branched from D, so the wave arrived as one line of descent rather than three
divergent ones.

The a11y lane **did** return, and its branch exists (`git branch --list 'daily-return/w5-a11y'`), so
it was merged in the ordered slot.

**The conflict everyone expected did not happen.** `c2-review.md` B1 and `c1-review.md` B1 both
predicted a six-file textual conflict over `AppRoute.orderDetail` and a duplicate enum case. C1
closed it on its own branch first (`25f76fcbd`, "hand `AppRoute.orderDetail` back to the order
lane"), so by merge time only C2 declared the case. Verified after the merge:

```
$ grep -rn "case orderDetail\|case orderList" apps/mobile/Patina/Patina
App/Coordinators/Coordinator.swift:117:    case orderList
App/Coordinators/Coordinator.swift:121:    case orderDetail(orderId: String)
```

One `orderList`, one `orderDetail`, and it is C2's prefixed-token shape — the arm both reviews said
to keep.

Total against `main`: **83 files changed, +11,245 / −170**, in 6 integration commits over the
lanes' 24.

## 2. The lane notes, applied

`waves/w5/` holds exactly one `*-notes.md`: **`a11y-notes.md`**. Both of its items were checked
against the merged tree rather than taken on trust.

- **The re-anchored `ChromeReachTests` pin.** `hearthReservationDrawsNothing()` moved its two
  anchors to `struct CompanionHearthReservation` … `extension View {` because the reservation's body
  became a `ViewModifier` (a plain `View` extension cannot hold the `@Environment(\.dynamicTypeSize)`
  the height now reads). It arrived with the merge, its four assertions unchanged, and it is green in
  the 1,413-test run below. No steward action needed; recorded because it is the one test outside
  that lane's own suite the lane touched.
- **The C1-facing note** (`CompanionHearthMetrics.reservation(accessibilityText:)`, `reservedHeight`
  and `dockHeight` unchanged, `pieceDetail` already `.minimal` at every text size) is informational:
  C1's order sheet is a `.sheet`, so the Companion overlay is behind it and none of the new yield
  reaches the purchase path. Nothing to reconcile.

## 3. The two things integration had to close itself

### 3a. `Order placed` reached nothing — `ed242d7b2`

`mock/fragments/b-M5c.html` prints **`See your order`** on the Order-placed screen. C1 built the
control and passed `onSeeOrder: nil`, saying why in the code: the route and its destination were
C2's, and "a control that goes nowhere is worse than no control". C2 built the other half and pinned
it — `OrdersService.resolve` takes a bare `direct_orders` uuid as well as a prefixed token, and
matches it against **`directOrderId`** as well as `recordId`, precisely because a settled direct
order re-keys onto the fulfillment rail under a different uuid. Neither lane could join them.

```swift
onSeeOrder: { directOrderId in
    presented = nil
    coordinator.navigate(to: .orderDetail(orderId: directOrderId))
},
```

Dismiss-then-navigate, the same shape as `Back to Today` one line down. Pinned at the source by
`orderPlacedReachesTheOrderDetail` in `OrderResolutionTests` — a SwiftUI closure has no other
reachable surface, and nothing else in the suite would notice it going back to `nil`.

This is the whole of the behaviour integration changed. No copy, number or state machine moved.

### 3b. lint-delta came in red on thirteen files — `f1ce7d948`

`steward.md` §7 makes `lint-delta` steward-only, so **no lane could run it**:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/App/DeepLinking/NotificationRouter.swift:                0 → 1
    Patina/ContentView.swift:                                       0 → 1
    Patina/Core/Network/FulfillmentAPIClient.swift:                 0 → 4
    Patina/Features/Companion/Components/CompanionHearthView.swift: 0 → 1
    Patina/Features/Navigation/HouseFirstRoot.swift:                0 → 1
    Patina/Features/Orders/Models/CarrierTracking.swift:            0 → 1
    Patina/Features/Orders/Models/ClientOrder.swift:                0 → 2
    Patina/Features/ProductDetail/Views/ProductDetailView.swift:    2 → 3
    Patina/Features/Purchase/OrderFailureCopy.swift:                0 → 1
    PatinaTests/OrderRailMergeTests.swift:                          0 → 4
    PatinaTests/OrderRecordRowTests.swift:                          0 → 5
    PatinaTests/OrderRoutingTests.swift:                            0 → 4
    PatinaTests/OrderStateDerivationTests.swift:                    0 → 5
```

Each closed at the cause, **none suppressed**, no sentence or behaviour changed:

- **Eighteen trailing commas** in collection literals (`FulfillmentAPIClient`, `CarrierTracking`,
  and the four new order test files).
- **`workDocumentsDestination`** in both roots (`ContentView`, `HouseFirstRoot`) and
  **`NotificationRouter.route(forEntityType:)`** each took two order cases and tipped the complexity
  gate. The order arm became its own small table in each (`orderDestination(for:)`,
  `orderRoute(forEntityType:entityId:)`), so the vocabulary can keep growing.
- **`ClientOrder.swift` was 502 lines** and `stateLine` was a twelve-branch switch. `ClientOrderCopy`
  moved to `Patina/Features/Orders/Models/ClientOrderCopy.swift` (423 lines left behind), and
  `stateLine` became a seven-row table over seven one-fact helpers. Every sentence is byte-identical.
- **`CompanionHearthView.swift` was 517 lines.** Its no-content convenience init moved to
  `CompanionHearthView+EmptyContent.swift` (495 left). Deliberately **not** moved: anything the three
  `CompanionSheetDriverTests` source pins read — `expandedColumn(`,
  `.padding(companionPanelPadding)`, `ViewThatFits(in: .vertical)`,
  `dynamicTypeSize.isAccessibilitySize`, `ScrollView(.vertical, showsIndicators: true)` — all of
  which stayed in the original file and are green.
- **`OrderFailureCopy.checkout`** was 53 lines; the server's refusal table split off the entry point.
- **`ProductDetailView`** loses one double blank line (it rides in `ed242d7b2` with the seam fix,
  since both touch that file). Its remaining two warnings — `file_length` (691) and
  `type_body_length` — are **base parity**, not new: `main` carried two warnings on the same file
  (`function_body_length` at :364 and `type_body_length`). That file is genuinely long and its
  `function_body_length` **error** at :299 is real, carried debt; splitting a 692-line SwiftUI view
  is a refactor with a walk behind it, not an integration edit. Named here rather than buried.

**Deliberately not "fixed": `FulfillmentAPIClient`'s 38 `identifier_name` errors.** They are
snake_case wire columns on `Decodable` DTOs, which is how every API client in the app spells them —
`RoomsAPIClient` 64, `ProposalsAPIClient` 54, `ProjectsAPIClient` 43, `InvoicesAPIClient` 30. House
pattern, not a lane defect; and `lint-delta` counts warnings only, so they never entered the gate.

Re-run after both commits: **`✓ lint-delta: no new warnings in touched files`**.

## 4. Gates

| Gate | Command | Result |
|---|---|---|
| Migration tip | `ls supabase/migrations \| tail` | `main` at **00539**; D's **00540** free — **no renumber needed** |
| Migrations replay | `supabase db reset` | clean through **00540**, all **26** seed files (incl. D's new `direct-orders-dev.sql`) |
| SQL suite | `./scripts/run-sql-tests.sh` | **137 / 137 effective green** — 115 green + 22 expected-fail, **0 unexpected** |
| Edge functions | `deno test --no-check -A` on `direct-order-checkout`, `fulfillment-intake`, `stripe-webhook-emit`, `stripe-event-processor`, `fulfillment-stripe-recon`, `agent-queue` | **81 passed, 0 failed** (20 · 18 · 8 · 25 · 6 · 4) |
| Type-check | `deno check --config supabase/functions/deno.json` on all six touched function files | clean |
| Generated types | `supabase gen types typescript --local --schema public --schema graphql_public` | **byte-identical** to the committed `packages/supabase/src/database.types.ts` — not stale |
| iOS build | `apps/mobile/Patina/scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **` (run 2; run 1 was the documented fresh-tree stamp-phase failure) |
| iOS tests | `xcodebuild test -only-testing:PatinaTests -destination id=E7D06481-…` | **`Test run with 1413 tests in 154 suites passed`** · `** TEST SUCCEEDED **` |
| Lint delta | `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main` | **✓ no new warnings in touched files** (was red; §3b) |
| Signed `.app` | `xcodebuild test … -derivedDataPath .build/dd` (no `CODE_SIGNING_ALLOWED=NO`) | `Identifier=cloud.patina.app` · `Signature=adhoc` · arm64 |
| Flag-off launch | `simctl launch … -DeploymentTarget local` | launches (pid 51562), sign-in wall, no crash report |
| Flag-on launch | `… -PatinaFlags direct-orders` | launches (pid 51697) |
| Flag-on launch | `… -PatinaFlags direct-orders,house-first` | launches (pid 51734); driven past the wall as a guest into onboarding and the style quiz — the app is alive under both roots |

Test count: 1,412 after the four merges → **1,413** with §3a's pin. C1 reported 1,337 and C2 1,322
on their own branches; the union plus a11y's is 1,412, which is what the merged tree runs.

Simulator: **`dr-w5-int` `E7D06481-1CA5-4287-B807-EDAEC9903C64`** (iPhone 17 Pro, iOS 26.5).
`xcrun simctl clone` of the review device **fails while it is Booted** (`SimError 405`), and the
review device belongs to the walker, so the integration device was `simctl create`d on the same
device-type + runtime instead. Worth knowing for the next steward. Every frame came from
`xcrun simctl io <udid> screenshot`; every tap from blitz with the explicit udid; no
`screencapture`, ever. ⚠ blitz takes **logical points** (402×874 here), not pixels — a tap in pixel
coordinates is silently swallowed.

## 5. The one gate that cannot pass, and it is not W5's

`supabase/functions/_tests/stripe-rail.test.ts` fails **both** cases in `seed()`, before any code
under test runs:

```
Error: insert projects failed: studio_id_not_designer_studio
    at insert (stripe-rail.test.ts:150)
```

D claimed this was pre-existing; independently re-proven here, and the mechanism is now exact:

```sql
-- as postgres: succeeds.  As the role PostgREST uses for the harness:
SET LOCAL ROLE service_role;
INSERT INTO public.projects (name, client_id, designer_id, created_by) VALUES (…brand-new user…);
-- NOTICE: PROBE-SR: refused -> studio_id_not_designer_studio
```

The harness creates a fresh auth user belonging to no studio and inserts a project as service_role;
`set_project_studio_id` (00317 → 00318 → 00511, with 00536 naming the same guard) refuses it. 00540
creates exactly **one** trigger, `trg_direct_orders_freeze_attribution`, on `direct_orders` — it
touches no project, organization or membership object. **Pre-existing, unrelated to W5, and a real
gap in the repo's edge-function coverage**: nothing in `scripts/`, `.github/workflows/` or the docs
runs that file, and its direct-order cases have therefore never executed. For Fable, not for this
wave.

Consequence, stated plainly: D's addition to that file's `cleanup()` is unexercised, and the wave's
settle proof rests on the deno unit suites and pgTAP, not on this harness.

## 6. Carried forward — for Fable, not closed here

1. **The Stripe key still blocks W5's headline.** The local `STRIPE_SECRET_KEY` is the 32-character
   placeholder (`steward.md` §2). W5's acceptance line — "test-mode end-to-end on the simulator with
   a Stripe test card" — is **unmet**, and no agent can meet it. The honest wave claim is
   compile-green + sim-verified + DB-proven; the live Checkout, the receipt, the settle and the
   `fulfillment_orders` row need Kody's real `sk_test_` in the local functions env. That is the one
   thing standing between this wave and its stated acceptance.
2. **`ProductDetailView` is 691 lines with a `function_body_length` error at :299.** Base parity, so
   the gate passes; it is still the largest view in the app and it grew again this wave.
3. **D's open items stand as filed** (`d-fix-log.md`): D-M4 — the settle notice is a `system`
   message, so it badges and bumps the thread but sends no email or push, and whether Leah should be
   emailed is a copy/consent ruling that belongs with W7; D-m13 — the buyer reads the same
   third-person notice, kept verbatim per direction B §5 and flagged as a copy call.
4. **C2's open items stand as filed** (`c2-fix-log.md`): MI-5 (`refresh()` on every record build —
   a Today-path performance change wants a walk behind it), MI-8 (`Message your designer` is
   ungated app-wide, not this lane's), MI-10 (no analytics on the order screens), MI-11 (the direct
   rail, `paidNotOnRail`, the merge and the refund branch are unit-tested, **not** sim-verified —
   `direct_orders` is empty on this stack).
5. **The responsibility paragraph and the contact are Kody's copy.** 00540 created the two
   `fulfillment_config` keys; until they hold real text, `tax_shipping_enabled` stays **false**,
   the sheet reads "Delivery and tax are not included yet." and Path A stays off — which is what
   B §5 requires.
6. **`create_direct_order` refuses every prod product** until direction B §10's catalogue pass sets
   `photo_verified_at` against real photography. Strata is never seeded, so that pass must **precede**
   00540 reaching prod. Ops sequencing, named in the migration's own banner.
7. **W4's `RouteTabTable.rootRoute(for: .studio) == .profile`** is still unowned. C2 landed the
   Ordered row inside Studio and met it; nothing was changed here.

## 7. Steward state at hand-off

- `main` untouched by this steward; **nothing pushed**; no git write in the main checkout.
- `daily-return/integration` at **`ed242d7b2`**, working tree clean.
- ⚠ **`main` moved under the wave, by one commit.** The branch was cut at `05b3f9a18`; while the
  gates ran, another session landed `88852d8a3 docs(the-document): final direction ruled …`. It is
  **docs-only and in a different program's folder** — all 34 files under
  `artifacts/document-life-directions-2026-08-28/` — and `git merge-base --is-ancestor 05b3f9a18
  main` still holds. **Zero file overlap with W5** (`comm -12` over the two diffs returns nothing),
  so the merge to `main` cannot conflict; it is simply no longer a fast-forward. Nothing in the
  gates above is invalidated by it.
- The root `deno.lock` the deno runs create was deleted each time; the tree carries none.
- Local DB is the integration branch's: reset through 00540, 26 seeds, SQL suite green.
- Still standing, for the walker and for Fable to retire: worktrees `agent-dr-w5-{d,a11y,c1,c2}`
  and `agent-dr-w5-integration`, simulator clones `dr-w5-{a11y,c1,c2}` and `dr-w5-int`
  (`E7D06481-…`). They are alive on purpose — the wave's walk has not run.
- No secret value was read, printed or written anywhere; nothing touched Strata or production.
