# W1b · Lane A — fix round

Written by the lane A implementer against `waves/w1b/a-review.md`. Branch
`daily-return/w1b-a`, worktree `.codex/worktrees/agent-dr-w1b-a`. Two fix commits on
top of the reviewed tip `00362b443`:

```
4b1f7ed59 fix(ios): SP-10 — withhold a piece with no resolvable maker from the feed
5a6cd508f fix(ios): SP-14 — a guest's save stays saved, and the notice tells the truth
```

Every blocking and major finding is **fixed in code**. Nothing is rebutted.

---

## Finding 1 — BLOCKING. Guest saves reverted themselves and blamed the connection. **FIXED.**

The review's trace was right, end to end. `saveProduct` called
`RoomsAPIClient.resolveUserId()` unconditionally; with no session that throws
`RoomsAPIError.notAuthenticated`; the catch deleted the just-inserted `TableItemModel`,
dropped the id from `savedProductIds` and printed *"Couldn't save — check your
connection and try again."* — a reason that was not true for a guest, on the one loop
SP-14 exists to protect.

**What changed** (`5a6cd508f`):

1. **`Core/Models/SavedItem.swift`** — new `SavedItemMirror`, carrying SP-14's own risk
   note as the rule: `shouldAttempt(isAuthenticated:)`, plus the copy for the one case a
   reader must hear about.
2. **`RecommendationsViewModel.saveProduct`** — the mirror `Task` is now inside
   `if SavedItemMirror.shouldAttempt(isAuthenticated: isAccountAvailable())`. A guest
   makes no request, sees no message, and keeps the piece. `isAccountAvailable` defaults
   to `{ AuthService.shared.isAuthenticated }` and exists so the guest path is testable
   without an ambient session.
3. **The failure branch no longer reverts.** SP-14 makes the local store what "saved"
   means, so a signed-in mirror failure keeps the row and shows
   **"Saved on this phone. We couldn't reach your account just now."** — which also
   closes finding 4 (below).
4. **`ProductDetailViewModel.mirrorSave` / `mirrorUnsave`** — the same gate, so the piece
   screen stops making a call it knows will throw. Its behaviour is otherwise unchanged
   (it already only logged).

**Proof, in three forms.**

*Unit (new, in `SavedItemMirrorTests`)* — `aGuestHeartTapKeepsThePieceAndSaysNothingFailed`
drives the real `saveProduct` against an in-memory `ModelContext`, waits 400 ms (long
enough for the old mirror `Task` to have thrown and reverted), then asserts the piece is
still saved, `saveFailureMessage == nil`, and exactly one `TableItemModel` row survives.
On the reviewed code this test fails on all three assertions. `aGuestSaveIsNotMirrored`
pins the policy; `theDeferredNoticeSaysWhatIsTrue` pins the copy.

*Sim, on `dr-w1b-a` `15C4C76A-DCDD-43C1-9119-D0B022F0A653`, guest, local stack* — the
walk the review said was never run. Two guest saves from the **browse grid** (swipe-right
→ `toggleSaved` → `saveProduct`, the same call the heart makes):

- `shots/w1b-a-10-guest-saves-survive-grid.png` — Heirloom Oak Dining Table and Live-Edge
  Coffee Table carry **filled** hearts; the two unsaved cards carry outlined ones; no
  failure banner anywhere on the screen.
- `shots/w1b-a-11-guest-saved-shelf-two-pieces.png` — both pieces are on the **Saved**
  shelf (All items), with maker lines and `$2,100` / `$4,200`.
- The piece screen agrees: `scan_ui` on each detail reports `Saved ✓` and the top-bar
  heart as `heart.fill` / "Remove from saved", seeded from the local store.

*Gate* — below.

## Finding 2 — MAJOR. SP-10's "withhold from the feed" was not implemented. **FIXED.**

`hasResolvableMaker` only blanked the maker line. Now `ProductAPIClient` carries
`withholdingUnresolvedMakers(_:)` and `fetchRecommendations` applies it, so **both** feeds
that read `get_recommendations` — the browse grid and the Daily Room's picks — drop a row
whose maker resolves from neither `brand` nor a real vendor name. The direct
single-piece fetch is deliberately untouched: a piece opened by id or by link still
renders, because withholding is about what the app *offers*, not what it can *show* when
asked for one thing by name.

Pinned by `theFeedWithholdsAPieceWithNoResolvableMaker` (four rows in, two out — and the
two withheld ids asserted, not just the count) and `brandRescuesAPieceTheVendorJoinCouldNotName`.

**What the sim shows, honestly: nothing is withheld on this stack.** Lane D's
00533–00536 are already applied locally (`select version from
supabase_migrations.schema_migrations` → `00536, 00535, 00534, 00533, 00531`), so the RPC
returns `brand`, and all ten feed rows resolve a maker:

```
$ psql … -c "select name, maker_name, brand from get_recommendations(NULL::uuid,NULL::text,20,0);"
 Terracotta Planter Set    | Unknown Maker | Rejuvenation
 Woven Jute Area Rug 8x10  | Unknown Maker | Studio Piet
 Oak Reading Chair         | Unknown Maker | Nordic Atelier
 Wool Kilim Runner         | Unknown Maker | Studio Piet
 … 6 more, all with a brand
```

So `w1b-a-10` still reads **"10 pieces chosen for your space"** — the filter withholds
nothing that has a maker, which is the negative check worth having. The four rows the
pre-00533 RPC could only call "Unknown Maker" are exactly the ones `brand` rescues. A
visibly withheld card would need a product row with neither `brand` nor `vendor_id`, and
seeding one means writing to the local stack, which is lane D's alone this wave — so the
withhold itself is **unit-pinned, not sim-verified**, and this is the disclosure.

## Finding 3 — Minor, no action. `RoomsAPIClient.swift` claimed outside the map.

Already disclosed in `a-notes.md` §1, unchanged this round. The steward's confirmation
step still applies.

## Finding 4 — Minor. The failure copy blamed the connection. **FIXED with finding 1.**

`"Couldn't save — check your connection and try again."` is gone. The only message that
can now reach a reader from this path is `SavedItemMirror.deferredNotice`:

> Saved on this phone. We couldn't reach your account just now.

It states the two things the app actually knows and nothing it does not: it does not name
a connection it cannot see, and — checked deliberately — it does **not** promise a later
retry, because no push-side retry exists (`seedSavedState` reads remote → local only).
`theDeferredNoticeSaysWhatIsTrue` pins all three properties. It is only reachable when
signed in, so the failure modes that remain are genuine HTTP/timeout/PostgREST failures.

---

## Gate, re-run exactly as the brief specifies

From the worktree, foreground, unsandboxed:

```
$ apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project …/agent-dr-w1b-a/apps/mobile/Patina/Patina.xcodeproj \
    -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=15C4C76A-DCDD-43C1-9119-D0B022F0A653' \
    -derivedDataPath …/agent-dr-w1b-a/.build/dd -only-testing:PatinaTests
✔ Test run with 700 tests in 88 suites passed after 2.210 seconds.
** TEST SUCCEEDED **
```

695 → **700** (+5: 3 in `SavedItemMirrorTests`, 2 in `ProductDecodingTests`). No suite the
lane owns went red. `ios-gate.sh all` and `lint-delta` are steward-only this wave and were
not run.

Signed simulator build (adhoc, no `CODE_SIGNING_ALLOWED=NO`), installed and walked:
`.codex/worktrees/agent-dr-w1b-a/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`.
