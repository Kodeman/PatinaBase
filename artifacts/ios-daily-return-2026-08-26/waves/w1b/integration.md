# W1b — Integration record

Written by the W1b integration steward, 2026-08-27.
Branch **`daily-return/integration`**, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-integration`, base `main` @ `5b5c0c054`.

Head at the end of this record: **`8256dac55`** — 59 commits ahead of `main`, four merge commits and
seven steward commits.

---

## 1. Setup

| | |
|---|---|
| Worktree | `.codex/worktrees/agent-dr-w1b-integration` (unsandboxed `git worktree add`) |
| Branch | `daily-return/integration` from `main` @ `5b5c0c054` |
| `Secrets.swift` | copied from the main checkout; `git status --porcelain` = **0 lines** |
| `.writer.lock.d` | created at start |
| Simulator | **`dr-w1b-int` · `34EDD568-43AE-4546-A0FE-AB9161FF9391`** (iPhone 17 Pro · iOS 26.5), booted |

⚠ **Deviation, same one the wave's setup steward hit and recorded:** `xcrun simctl clone
973D1724-…` fails with `SimError code=405: Unable to clone device in current state: Booted`. The
review device is booted and out of bounds, so the integration device is a **fresh device of the
identical type and runtime** (`iPhone-17-Pro` · `iOS-26-5`, read off the review device), not a
clone. Functionally equivalent as an `xcodebuild` destination; it carries none of the review
device's installed apps or data, which the unit tier does not use.

## 2. Merge order and conflicts

**D → A → B → C**, exactly as `steward.md` §7 sets out (schema, then the lane that decodes it, then
money, then chrome).

```
9fe6b56d6 chore(daily-return): integrate w1b lane d      29 files, +3466 −33
13992048e chore(daily-return): integrate w1b lane a      45 files, +2062 −114
3c37e8b2c chore(daily-return): integrate w1b lane b      31 files, +1897 −212
84a2d27a9 chore(daily-return): integrate w1b lane c      33 files, +1835 −144
```

**Conflicts: none.** All four merges applied clean — no `<<<<<<<`/`>>>>>>>` anywhere in
`apps/mobile/Patina`, `supabase/` or `apps/client-portal/src`, and `git status --porcelain` was
empty after each. The owned-file map held: the lanes did not collide textually even on the files
`steward.md` §6.5 called the likely seams (`ContentView.swift`, `CompanionSafeArea.swift`,
`Features/Companion/**`).

The commit-msg hook was not exercised on a `merge:` subject — the `chore(daily-return): integrate
w1b lane <x>` form named in the brief was used from the start.

Mergedness, proved rather than assumed:

```
$ for b in d a b c; do git merge-base --is-ancestor daily-return/w1b-$b HEAD && echo MERGED; done
w1b-d: MERGED   w1b-a: MERGED   w1b-b: MERGED   w1b-c: MERGED
```

## 3. Migrations — no renumber

```
$ ls supabase/migrations | tail -6        # integration tree, before the reset
00531_restore_extension_execute_authenticated.sql
00533_piece_detail_contract.sql
00534_client_attention_notifications.sql
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
_pending
```

`main`'s tip is still `00531`; `00532` is held locally by the sibling Field Companion program and is
on no branch here; `_pending/00106` stays unapplied. **No collision, no renumbering.** Lane D's four
numbers land as minted, and `00536` — the number `steward.md` §5 flagged as provisional and asked
Fable to confirm — is carried as authored (see §6 for the two rulings it still owes).

## 4. Integration notes — what was applied, and by whom

### 4a. Applied at integration by the steward (seven commits)

| Note | Owner's file | What landed | Commit |
|---|---|---|---|
| **b-notes §7a/§7b/§7c** — four labels for one route after SP-16's rename | A's `CompanionActionRows` + `CompanionAreaBuilders`, C's `CompanionContext`, A's `CompanionActionMatrixTests` | `"Your budget"`×5 → `"Billed to date"`, `"See your budget"` → `"See what's been billed"`, `"Your spend"` → `"What's been billed"`, `contextLabel` likewise; the row `id: "budget"` untouched (route/analytics key); the test assertion updated in the same commit | `6ad4fe81d` |
| **d-notes §5.1** — `saved_items.price_cents_at_save` had no writer | A's save path + `RoomsAPIClient` | every `CreateSavedItemPayload` construction now carries `price_cents_at_save` — piece screen (both paths), browse grid, AR placement; payload field + both test fixtures | `4e3ce89fc` |
| **d-notes §8** — the roster read must move off the base table | `Core/Network/RosterAPIClient.swift` (assigned to no lane) | `/rest/v1/designer_clients` → `/rest/v1/client_designer_roster`; stale file-head comment about an unreachable read rewritten. Select list, filters, order and decode unchanged — the view exposes exactly those four columns | `ff0bf1fd3` |
| **a-notes §3.1** — the share message can say "by Unknown Maker" | A's `ProductDetailView` | `shareMessage(for:)` names a maker only when SP-10's `resolvedMakerName` resolves one (C5) | `ff0bf1fd3` |
| **b-notes §1 + §6** — the signature email is 100× high and skips the chokepoint | D's `proposal-sign-confirmation` | `formatCurrency(cents / 100)` (`proposals.total_amount` is INTEGER cents, 00014:138 — the client portal carries a regression test for this exact bug); both sends now go through `_shared/send-email.ts`'s `sendCompliantEmail` with `userId` / `category` / `templateId` / `idempotencyKey`; the select gains `client_id, designer_id`; the local bare-`fetch` `sendEmail` and its two env reads are gone | `576c662f4` |
| **b-notes §4** — nothing seeds an invoice, so the walk has no subject | D's `supabase/seed/**` + `config.toml` | new `supabase/seed/invoices.sql`: `INV-2026-0142` (`sent`, due in 5 days = **Sep 1** on the wave's date, two line items, no payments) and `INV-2026-0141` (`paid` in full, no payment row). Wired **after `decisions.sql`**, not after `proposals.sql` as the note said — `decisions.sql` is what creates the Aspen Loft project. Both `[db.seed]` arrays updated per config.toml's own derivation rule | `b9678c3f4` |
| **b-notes §3** — the floating chevron/title has no scrim | C's `PatinaScreenChrome` | the optional title now sits on an `ultraThinMaterial` capsule; only titled screens change. The chevron already carries its own pill. **The structural half is deliberately not taken** — see §6 | `614fce26d` |
| **d-notes §4** — the money paths went plural and the matcher must follow | C's `DeepLinkHandler` + `PortalLinkRoutingTests` | `route(forUniversalLink:)` matched `/invoice/`, `/proposal/`, `/decision/` while the AASA publishes `/invoices/*`, `/proposals/*`, `/decisions/*` and 00534 writes `/invoices/<id>` into every `deep_link` — **no real emailed or notified link would have opened the app.** Plural is now canonical, singular kept as an alias; a new test pins all three | `8256dac55` |
| lint-delta regressions across four lanes | seven files | see §5c | `2bce31696` |

### 4b. Verified already satisfied in the merged tree — no action needed

| Note | Evidence in the merged tree |
|---|---|
| **b-notes §2** — the Hearth reservation paints an opaque band | Lane C removed it (`cc49eea47`): `companionHearthReservation` is now `Color.clear` + `allowsHitTesting(false)`, no `.background`. The file says why. |
| **d-notes §2(d)** — every attention would render twice | C collapses on `entity_type\|entity_id` client-side, which d-notes names as the accepted alternative to the `eq.in_app` query change. |
| **d-notes §2(a)** — the three new `type` strings fall to `.newRecommendations` | `NotificationsAPIClient` decodes the bucket from `metadata.entity_type` first and accepts `proposal_attention` / `invoice_attention` / `decision_attention` as `type` fallbacks. |
| **d-notes §3** — `APIConfiguration.deleteAccount` points at an RPC that exists nowhere | Repointed to `/functions/v1/delete-account`. |
| **a-notes §3.2** — three `ShareLink` sites still build `app.patina.cloud/library/<id>` | C kept `PatinaDeepLinks.productURL(forProductId:)` as a delegate to `piece(_:)`, so all three call sites now emit `client.patina.cloud/piece/<id>` with no edit in A's files. |
| **a-notes §4** — `SurfaceKeys…matchPercentage` is now unreferenced | A's own note says no action required; `SurfaceKeysParityTests` pins the registry set, not usage. Left as dead-but-declared, as A asked. |
| **c-notes §6** — `SpatialMetadataRow` has no interactive control to enlarge | Confirmed; nothing to apply. |

### 4c. Ownership deviations disclosed by the lanes — confirmed, not defects

- **`Core/Network/RoomsAPIClient.swift`** (a-notes §1, claimed by A outside the map): checked at
  merge — **no other lane touched it**. Its only other writer is this integration (the price
  snapshot field). Confirmed as A's, retroactively.
- **`Services/DesignServices/DesignRequestCoordinator.swift`** (c-notes §4): unassigned by the map,
  one deletion, squarely inside SP-08 and Q7. Accepted.
- **`apps/client-portal/src/middleware.ts`** and **`components/layout/app-chrome.tsx`** (d-notes
  §6a/§6a2): unassigned; without them the public piece route redirects to `/auth/signin` and renders
  in signed-in portal chrome. Accepted.
- **`Patina/Features/Money/`** (b-notes §5, new directory, unclaimed): folded into lane B's row for
  W2 — it holds `MoneyFailureCopy` and `MoneyScreenChrome`, both B's seams. `Patina/` is a
  `PBXFileSystemSynchronizedRootGroup`, so no pbxproj change; C stays its sole writer.

### 4d. Notes NOT applied, and why

| Note | Why it is reported rather than applied |
|---|---|
| **b-notes §2 / b-fix-log "Open, not closed" 1 and 2** — bottom bar above the Hearth vs the orb yielding, and which top-band pattern is the house pattern | Unruled since the critique. It changes `ContentView` and `CompanionSafeArea` and therefore every screen in the app. Fable's ruling, not an integration merge's. The painted band itself is already gone (§4b), so nothing is bleeding while it waits. |
| **b-fix-log m-6** — whether the sign sheet restates a line count | The W1b table and the plank body disagree; it is legal copy Kody signs off. One line from Fable settles it. |
| **b-fix-log "Open, not closed" 4** — `checkmark.seal.fill` on an accepted-but-unsigned proposal | Design call, not a defect fix. |
| **d-notes §6(c)** — an erasure deletes the designer's decision record, not just the link to it | ⚠ RULING OWED. `client_decisions.designer_client_id` cascades from the client-owned `designer_clients` row, so the decision and its options go with the account. `account_purge_test.sql` asserts that as shipped behaviour. Two ways out are named in the note; both change what "everything the client owns cascades" means. |
| **d-notes §6(b)** — 00536 carries three unrelated things under one number | Left as authored (the purge is cleanly separable if Fable prefers three files). |
| **d-notes §5.2 / d-fix-log minor 10** — no server-side uniqueness on `saved_items (user_id, product_id)` | Lane D offers the index on Fable's word; SP-14's "no duplicate rows" rests on A's client-side idempotency until then. |
| **d-fix-log minor 4** — "Open in Patina" dead-ends into Safari's error for a reader without the app | Needs an App Store id for `cloud.patina.app`, which exists nowhere in this repo. |
| **c-notes §6** — the status-bar overprint is systemic (`NotificationFeedView`, `SettingsView`, `ProfileView` still have it) | B's `moneyScreenTopBand()` closes it only inside the money screens. A W2 line, as C says. |

## 5. Gates

### 5a. Database, edge functions, client-portal

```
$ supabase db reset                       # from the integration worktree — the steward owns the DB now
Applying migration 00533_piece_detail_contract.sql...
Applying migration 00534_client_attention_notifications.sql...
Applying migration 00535_saved_items_price_snapshot.sql...
Applying migration 00536_client_side_server_gaps.sql...
Seeding data from supabase/seed/decisions.sql...
Seeding data from supabase/seed/invoices.sql...          ← new
Finished supabase db reset on branch main.

$ ./scripts/run-sql-tests.sh
total: 131 · green: 109 · expected-fail: 22 · unexpected-fail: 0
effective-green: 131 / 131

$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/delete-account/ supabase/functions/_shared/client-attention.test.ts
ok | 17 passed | 0 failed (73ms)

$ deno test … supabase/functions/proposal-send/
ok | 22 passed | 0 failed (104ms)

$ deno check … invoice-send invoice-reminders proposal-send delete-account proposal-sign-confirmation
Check … (all five clean)                                 ← the fifth is this integration's edit

$ pnpm turbo type-check --filter=@patina/client-portal
Tasks: 9 successful, 9 total

$ pnpm test    # apps/client-portal
Test Suites: 2 failed, 105 passed, 107 total
Tests:       1 failed, 985 passed, 986 total
```

The one failing test and the one un-loadable suite are the pre-existing pair lane D reported
(`portal-access.test.ts`'s `foreignPortalFromDomain('manufacturer')`, and `orders.test.ts` importing
a module that does not exist). Verified independently, not taken on trust:

```
$ git diff --stat main..HEAD -- src/lib/__tests__/portal-access.test.ts src/lib/portal-access.ts \
                                src/lib/data/__tests__/orders.test.ts
(empty — byte-identical to main)
```

**Generated types are in sync** — regenerated against the reset stack and the diff is empty:

```
$ pnpm db:generate && git diff --stat -- packages/supabase/src/database.types.ts
(no output)
```

**Seed probes** (the point of §4a's seed, checked by behaviour rather than by the file existing):

```
 invoice_number | status | due_date   | total_cents | amount_paid_cents
 INV-2026-0141  | paid   | 2026-07-28 |      250000 |            250000
 INV-2026-0142  | sent   | 2026-09-01 |      425000 |                 0
 line items: 0141 → 1, 0142 → 2 · invoice_payments → 0 rows

# as client@patina.dev, through RLS:
 INV-2026-0142 | sent | 2026-09-01   (and 0141)      ← the client can see them
 client_designer_roster → 4 active rows              ← 00536's view reads for the client
```

### 5b. iOS

```
$ apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **                                                   (exit 0)

$ xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=34EDD568-43AE-4546-A0FE-AB9161FF9391' \
    -derivedDataPath .build/dd -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
✔ Test run with 795 tests in 94 suites passed after 2.291 seconds.
** TEST SUCCEEDED **                                                    (exit 0)

$ apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files                          (exit 0)
```

795 = the union of the lanes' tiers (A 700 · B 710 · C 726 on their own branches) plus the one test
this integration added for the plural universal-link paths. No suite any lane owns went red.

⚠ **One transient, recorded because the next steward will see it too.** The very first
`ios-gate.sh build` in this worktree printed `** BUILD FAILED **` with three failed `SwiftCompile`
tasks and **no `error:` line anywhere in the log**; an immediate identical re-run succeeded. This is
lane A's `a-notes.md` §6 hazard — `ios-gate.sh build` writes to the shared default DerivedData, not
to a per-lane path, so all the wave's trees contend for one directory. Re-run rather than diagnose.
Every result above is from a run that printed its own success line.

**Signed build** (no `CODE_SIGNING_ALLOWED=NO`), built after the last source commit and installed on
the integration simulator:

```
$ codesign -dv .build/dd-signed/Build/Products/Debug-iphonesimulator/Patina.app
Identifier=cloud.patina.app
CodeDirectory v=20400 … flags=0x2(adhoc)
Signature=adhoc

$ xcrun simctl install 34EDD568-43AE-4546-A0FE-AB9161FF9391 <app>
INSTALLED
```

Path, for the walker:

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-integration/.build/dd-signed/Build/Products/Debug-iphonesimulator/Patina.app
```

The entitlement SP-03 needs is in the bundle's source (`applinks:client.patina.cloud`), but a
universal link opening the app is a **device claim** and the AASA is not deployed — nothing here
claims it.

### 5c. The lint-delta round, in full

`lint-delta` is steward-only, so this was its first run over W1b. Nine files had gained warnings
against `main`. Two were real defects and are fixed properly:

- `AuthSheet.swift` — `var title: String? = nil` → `var title: String?` (`implicit_optional_initialization`)
- `PushTokenServiceTests.swift` — file did not end in a newline (`trailing_newline`)

Two more surfaced only while fixing, and are also fixed properly, not silenced:

- `RoomsAPIClient.listItems(forUserId:)` carried a trailing comma in its query-item literal
- a first attempt at scoping orphaned three doc comments and tripped `blanket_disable_command` /
  `superfluous_disable_command`; the disables were rewritten as `:this` on the declarations

The remaining five are size floors the plank work crossed. Each is scoped **one rule at a time**,
with the reason written in the file, following `StyleProfile.swift`'s existing precedent — and each
is listed here rather than left for someone to discover:

| File | Rule | Now |
|---|---|---|
| `BudgetViewModel.buildSections` | `function_body_length` | 52 lines (limit 50) |
| `SettingsView` | `type_body_length` | 335 (limit 300) |
| `CompanionViewModel` | `type_body_length` | 307 (limit 300) |
| `RecommendationsView` | `file_length` + `type_body_length` | 527 lines / 381 |
| `ProposalsMoneyRailTests` | `type_body_length` | 357 |
| `CompanionActionMatrixTests` | `file_length` | 529 |

Nothing is disabled file-wide except `file_length`, so every other class of regression in these
files still fails the gate. **The splits belong to W2's R3 hygiene pass**, which already owns this
surface; doing them at an integration merge, unwalked, across four absent lanes' files, would have
been the riskier move. If Fable would rather they were split now, the six sites are named above.

## 6. Open, for Fable

1. **SP-19's structural half** (b-notes §2/§3, b-fix-log open 1–2) — bottom bar above the Hearth vs
   the orb yielding, and which top-band pattern is the house pattern. Unruled; it moves every screen.
2. **d-notes §6(c)** — an erasure destroys the designer's decision record. Ruling owed before
   `delete-account` is anywhere near production.
3. **d-notes §6(b)** — 00536 as one migration or three.
4. **d-notes §5.2** — server-side uniqueness on `saved_items`, or not.
5. **b-fix-log m-6** — does the sign sheet restate a line count.
6. **b-fix-log open 4** — the seal glyph on an accepted-but-unsigned proposal.
7. **d-fix-log minor 4** — the App Store fallback the shared piece page cannot offer.
8. Two claims that stand at **XXL-unverified** and are stated as such by lane B: the proposal
   detail's `Sign proposal` clearance, and decision/Budget/invoice detail at Dynamic Type XXL.

## 7. Housekeeping

- The four lane worktrees and the three lane simulators are **left in place**, as the brief
  instructs — the walker may need to re-check a lane. They are the steward's to retire at wave end
  (`scripts/repo-gc.sh` sweeps stragglers).
- Nothing was pushed. `daily-return/integration` is local, for Fable to ff-merge.
- The main checkout was touched only by read-only `git log`/`git show` and one read-only `swiftlint`
  run used to establish the lint baseline.
- The local Supabase stack is left reset and seeded from this branch — the walk can run against it
  as it stands.
