# W2 · lane R1 — integration notes

Written by the R1 implementer. Each item is a change **outside R1's owned file set** that R1's work
needs, or a fact the next lane/steward must have. Nothing below was applied by R1.

Branch `daily-return/w2-r1`, 7 build commits on `e9da02569` + 3 fix-round commits (`3d05e027d`, `ebb4d9eeb`, `0368c5cc7`). Fix round: `r1-fix-log.md`.

---

## 1. `ProductAPIClient` must pass `deleted_at` through — ⚠ **UNOWNED IN W2**, the steward must assign it

`Core/Network/ProductAPIClient.swift` is in no lane's owned set in `steward.md` §7 — not R1's, R2's,
R3's or D's — and it is not on the "unowned in W2" list either. Until it is assigned, and until R2
fetches the saved pieces' products by id, **both discovering rows draw nothing** (the honest
failure, not a wrong one). Review BL-2.

**Why.** The record's `savedPieceWithdrawn` row is composed over the `products` array the caller
supplies and reads `Product.deletedAt`. R1 added the decode to `Product` (`Core/Models/ProductModel.swift`,
commit `39698f36f`), but `Product` is not built by `Codable` on the by-id path — `ProductAPIClient`
decodes an intermediate `RawProductWithVendor` and maps it in `toProduct()`. That mapper does not
carry `deleted_at`, so on the live path `Product.deletedAt` is always nil and the withdrawn row can
never draw.

**The query is already right.** `ProductAPIClient.fetchProduct` selects
`*,vendors!products_vendor_id_fkey(...)` (`ProductAPIClient.swift:122`), so `deleted_at` is on the
wire today. Only the decode hop is missing.

**Exact diff** (`Patina/Core/Network/ProductAPIClient.swift`):

```diff
     let published_at: String?
     let photo_verified_at: String?
     let shipping_flat_cents: Int?
+    let deleted_at: String?
```
```diff
             sourceURL: source_url,
-            shippingFlatCents: shipping_flat_cents
+            shippingFlatCents: shipping_flat_cents,
+            deletedAt: Self.timestamp(deleted_at)
         )
```

**Second half, not a diff:** something has to *fetch* the saved pieces' products by id, including
withdrawn ones, and hand them to `HouseRecordBuilder(products:)`. `get_recommendations` filters
withdrawn rows out by construction, so the feed will never supply one. Until a caller does that,
`savedPieceWithdrawn` is built and tested but unfed — and it draws **nothing** rather than guessing,
which is the correct honest failure (C5). R2's `DailyRoomViewModel` is the natural caller.

## 2. `list_client_proposals()` carries no designer — owner: lane D (a later wave, not W2)

**Why.** The brief asked for `designer:profiles!<fk>(...)` embeds on the Decisions, **Proposals** and
Projects clients. Proposals do not come from PostgREST: `ProposalsAPIClient.listProposals()` calls
the RPC `list_client_proposals()` (`Services/API/ProposalsAPIClient.swift:274,286`), which is
`SECURITY DEFINER … RETURNS jsonb` and builds its own `jsonb_build_object` — **a PostgREST embed
cannot be attached to it at all** (verified: `pg_get_functiondef`, the payload has `designer_id` and
no name).

**Consequence today, and why it is not a defect:** a proposal row on the record takes the name the
record already resolved from the lead / project / decision / invoice chain, and falls back to
"Your designer". `HouseRecordBuilderTests.theRowsNameTheDesignerWhoActed` pins that it reads
"Leah Hartwell sent a proposal to review." on the walk's data.

**If lane D wants it at the source**, the one-line addition inside the RPC's `jsonb_build_object`:

```sql
'designer', CASE WHEN designer.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id', designer.id, 'display_name', designer.display_name,
  'full_name', designer.full_name, 'business_name', designer.business_name) END,
```
with `LEFT JOIN public.profiles AS designer ON designer.id = proposal.designer_id`. R1's
`RemoteProposal` would then need a matching `designer: RemoteDesignerRef?`. **Not needed for W2.**

## 3. `LastSeenStore.markSeen` has no call site yet — owner: R2 (or the steward, via `ContentView`)

`LastSeenStore.shared.markSeen(now:)` must be called on `scenePhase → .active` **after** the record
for that open has been built. Order matters: stamping before the build makes every row's `isNew`
false on the open that should have shown the ticks. `ContentView.swift` is unowned in W2 (§7 of
`steward.md`), so R1 did not wire it.

Shape R2 needs:

```swift
let record = HouseRecordBuilder.build(
    from: BadgeCountService.shared, saved: savedItems, products: products,
    story: story, liveLead: DesignRequestStatusService.shared.liveLead,
    lastSeen: LastSeenStore.shared.lastSeenAt, now: Date(),
    previous: RecordSnapshotStore.shared.load()
)
RecordSnapshotStore.shared.save(record)
LastSeenStore.shared.markSeen()          // AFTER the build, never before
```

`LastSeenStore` writes into the App Group suite (`group.cloud.patina.app`), not
`UserDefaults.standard`, so W6's widget reads the same timestamp (fix round, BL-3). The key is
unchanged: `patina.house.lastSeenAt`.

## 4. Deviations from the brief's literal interface, decided before the first commit

| Brief | Repo truth | R1 |
|---|---|---|
| `story: EditorialStory?` | no such type; the row type is `RemoteEditorialStory` (`Core/Network/EditorialStoriesAPIClient.swift:18`) | label `story:` kept, type is `RemoteEditorialStory?` |
| `build(from:saved:products:story:liveLead:lastSeen:now:)` with six-hour suppression | suppression needs the previous record; reading `RecordSnapshotStore.shared` inside the builder would make it untestable | a trailing `previous: HouseRecord? = nil`. **The brief's call site compiles verbatim.** |
| `designer:profiles!<fk>(display_name, studio_name)` | `profiles` has **no `studio_name`** (`information_schema.columns`: `display_name`, `full_name`, `business_name`). A select naming a missing column 400s the whole query | `RemoteDesignerRef.selectColumns = "id,display_name,full_name,business_name"`, matching the house pattern already at `InvoicesAPIClient.swift:192`. `studioName` reads `business_name`. Pinned by a test. |
| an embed "on the Decisions client" | `client_decisions.designer_id` FKs **`auth.users`**, not `public.profiles` — there is no relationship to embed | the designer rides in **through** `project:projects(name,designer:profiles!projects_designer_id_fkey(...))` |
| `saved_items.price_cents_at_save` vs current price | the client composes this locally; `TableItemModel.priceInCents` is the price at save on device | repriced = `TableItemModel.priceInCents` vs `Product.priceCents`; both numbers printed |
| `b-M1.sheet.html`: **Copy — as drawn, verbatim**. The mock reads `Leah asked about the rug colour.` and `Leah sent a proposal to review.` | first-name extraction from `display_name` guesses at a naming convention and breaks outright when the fallback is `business_name` ("Hartwell Studio asked…" → "Hartwell asked…") | the **full** display name, and the decision's own subject in the detail: `Leah Hartwell asked you to choose.` / `Rug color — Natural vs Sand`. The other four mock lines are verbatim. **Fable's ruling, not R1's** — flagged rather than assumed (review MJ-5) |

Also added, not in the published list, and safe for R2 to ignore: `HouseRecord.empty`,
`HouseRecord.hasMoreNeedsYou` / `.hasMoreMoved`, `RecordSnapshotStore.fileURL`,
`RecordSnapshotStore.usesAppGroupContainer`, `RecordSnapshotStore.fileName`,
`RecordSnapshotStore.init(fallbackDirectory:)` (defaulted; tests only), `LastSeenStore.key`,
`LastSeenStore.appGroupIdentifier`, `LastSeenStore.usesAppGroupDefaults`, `StudioQueueItemRow`,
`StudioQueueBuilder.named(_:)`, `DecisionsAPIClient.decisionSelectWithoutDesigner`,
`HouseRecordBuilder.maxRowsPerEyebrow` / `.suppressionWindow` / `.rollingWindow`, and — added in the
fix round and load-bearing for R2 — `HouseRecordRow.isStandingCondition` (see §9).

## 5. Two MOVED rows survive the window, and are MARKED when they do

`build`'s window filter keeps `.matchedDesigner` and `.savedPieceRepriced`, and marks them
`isStandingCondition` where the window does not vouch for their date (fix round, BL-1/MJ-3):

- **matchedDesigner** — B §1 is explicit: *"The two silent 14-day decays that exist today (F189) are
  removed, not extended: a matched request stays on the record until it resolves."* It carries a real
  event date, so it stays a **dated** row while the window covers it and becomes a standing condition
  when it does not. It is also pinned out of the three-row cap: being evicted by three newer rows is
  the same decay by another door.
- **savedPieceRepriced** — nothing on the wire says *when* a price moved (`saved_items` carries
  `price_cents_at_save`, not a changed-at), so the row is **always** a standing condition: it is
  ordered by the save date but claims no date, and never carries a "new" tick earned by the reader's
  own save (B §2, *"rejected outright: any row generated by the reader's own action dressed as an
  event"*).

**NEEDS YOU is not window-filtered at all**, same reasoning: an open obligation does not age out of
view. `needsYouIsNotWindowFiltered` pins it with a decision overdue since June.

## 6. Facts established against the live database, so nobody re-derives them

- FK names (`pg_constraint`): `projects_designer_id_fkey`, `proposals_designer_id_fkey`,
  `invoices_designer_id_fkey`. `client_decisions` has **no** FK to `public.profiles` (its
  `designer_id` → `auth.users`, its `designer_client_id` → `designer_clients`).
- `profiles` RLS: `Profiles are viewable by everyone` (SELECT, `true`, PUBLIC) — both new embeds
  resolve for a signed-in client.
- Both new selects were probed live against local PostgREST, **HTTP 200**, and the decision row came
  back carrying `"designer": {"display_name": "Leah Hartwell", "business_name": …}`.
- `designer_clients` is **not** client-readable (W1b moved the roster read to the
  `client_designer_roster` view, `integration.md` §4a), so a nested embed from `client_decisions`
  through `designer_clients` was not an option.

## 7. The App Group is compile-green only — say so in any claim

`Patina.entitlements` now carries `com.apple.security.application-groups` →
`group.cloud.patina.app`, and `CODE_SIGN_ENTITLEMENTS = Patina/Patina.entitlements` is set on both
configurations (`project.pbxproj:505,553`).

`LastSeenStore` now writes into the same App Group suite (fix round, BL-3) and reports
`usesAppGroupDefaults` the same way.

**Proof that the fallback is load-bearing, not defensive politeness:** the Simulator build signs
ad-hoc and `codesign -d --entitlements` on the produced `.app` returns an **empty dict** — the
entitlement is not honoured, `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil, and
without the fallback the snapshot would silently no-op and Today would paint blank on every cold
launch. `usesAppGroupContainer` reports which container is in use.

A genuinely shared container is a **device** claim and needs the App ID capability plus a refreshed
profile (Kody's paperwork, beside the widget bundle id). **R1 makes no such claim.**

## 8. What R1 did NOT touch

`ContentView.swift`, `CompanionSafeArea.swift`, `Features/Companion/**`, `StudioHubView.swift`,
`Features/{Proposals,Invoices,Decisions,Budget}/**`, `RoomsAPIClient.swift`, `RosterAPIClient.swift`,
`Core/State/**`, `ProductAPIClient.swift`, any `Features/Home/Views/**`, any migration.
`StudioQueueBuilder.build` and every `StudioQueueRow` id it emits are unchanged, pinned by
`StudioQueueItemRowTests.theGroupedStudioRowsAreUnchanged`.

`AttentionCountTests` (steward §9.1) and `DailyRoomFeedMappingTests` (§9.2) are green on this branch
and R1 changed neither.

## 9. What R2 must do with the fix round — owner: R2

1. **`HouseRecordRow.isStandingCondition`** (new, `Bool`, defaults false). True means *the window does
   not vouch for this row's date*. R2 draws these **without a date and without the `· new` tick** —
   the row's copy carries the whole meaning ("Leah Hartwell picked up your request.", "The Brass Arc
   Floor Lamp you saved is $100 less than when you saved it."). Drawing `row.date` on one of these
   under M1's `SINCE YOU WERE LAST HERE · THU, AUG 20` header is the exact contradiction the flag
   exists to prevent. `isNew` is already forced false on them, so a `· new` can only come from R2.
2. **`State.new` is never emitted.** `isNew` is the only newness signal. Do not switch on `.new`
   expecting rows; the case is kept only because the published interface named it.
3. **`.overdue` / `.due` are decided at build time and persisted in the snapshot.** The first paint
   of a cold launch can therefore print a stale `by Sep 8`. R2 rebuilds in the same open (§3), so the
   stale state lives one frame — but do not treat a snapshot's `.overdue` as authoritative for
   anything but that first paint.
4. **The guest/discovering spec contradiction is ruled, not open.** B §2's guest bullet 2 puts "New
   this week's count" in the record; B §2's discovering paragraph says
   *"`Three pieces joined Patina this week.` lives under NEW THIS WEEK, **not in the record**"*. R1
   followed the explicit rule and emits no such row. R2 composes the guest card on that basis.
5. **The `products:` argument still has no caller.** Until R2 fetches the saved pieces' products by
   id (§1), both discovering rows draw nothing.

## 10. Two honest silences, named rather than left in the code

- **Message attribution.** `messageRows` captions every unread thread with the record-wide designer
  ("Leah Hartwell sent you a message."). A studio associate or an admin writing in the same thread is
  captioned the same way; where no designer is known at all the row reads "A new message." A per-sender
  name needs a participant embed no W2 lane owns.
- **M1's second MOVED row.** `Leah added two pieces to the proposal.` is drawn in the mock and is
  **not built**: it has no `Kind`, no producer, and no proposal-revision event reaches the client.
  `Your dining table shipped.` is `Kind.orderMoved`, also unfed, and waits on W4's fulfillment rail —
  that one is declared in the enum.

## 11. Two things for the steward to ratify rather than discover

- **`P/Core/Models/ProductModel.swift`.** §7 of `steward.md` grants R1 `P/Core/Models/**` for "any new
  row model; existing files there are R1's only where R1 adds the row type". R1 added a **field**
  (`deletedAt`) to an existing type. No other W2 lane touches the file.
- **Two `// swiftlint:disable:this function_parameter_count`** on `HouseRecordBuilder.build` and
  `RemoteProject.init`. `lint-delta` is steward-only, so these will not surface as deltas at
  integration. Both sit on a parameter list that is the wire shape.
