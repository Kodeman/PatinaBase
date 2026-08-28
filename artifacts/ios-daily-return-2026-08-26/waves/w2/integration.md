# W2 — Integration record (The Record)

Written by the W2 integration steward, 2026-08-27.

**Branch:** `daily-return/integration` @ `59b389293`
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-integration`
**Base:** `main` @ `e9da02569` (the W1b integration merge — the base every W2 lane was cut from)

**Verdict: the tree is green and the wave is incomplete.** Every gate on the integration branch
passes — clean migration replay, 132/132 effective-green SQL, 12/12 deno, `** BUILD SUCCEEDED **`,
885 tests in 103 suites, `lint-delta` clean, a signed simulator `.app`. But **lane R2 delivered
nothing**, so none of what landed reaches a screen. W2's own acceptance script — "Ruth's Today shows
NEEDS YOU … and MOVED with dates" — cannot be walked on this branch. Details in §6.

---

## 1. Setup

```
$ git -C /Users/kody/Code/patina-merged worktree add \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-integration \
    -b daily-return/integration main
Preparing worktree (new branch 'daily-return/integration')
HEAD is now at e9da02569 chore(daily-return): integrate W1b — …
```

`daily-return/integration` did not exist beforehand (`git log daily-return/integration` →
*fatal: ambiguous argument … unknown revision*), so nothing had to be deleted first.
`Secrets.swift` copied in from the main checkout; `git status --porcelain apps/mobile/Patina` empty
after the copy (it is gitignored). `.writer.lock.d` created.

**Simulator.** `xcrun simctl clone` still refuses a booted source, and the review device
`973D1724-…` stays the walker's. R2's lane clone `dr-w2-r2` was idle (that lane produced nothing),
so it was shut down, cloned, and left shut down:

```
dr-w2-int  (98B9DC78-61AB-4D3E-8DE4-7736B252609A)  Booted     ← this steward's
dr-w2-r1   (2F0E2EF1-…)                            Booted
dr-w2-r2   (0B472471-…)                            Shutdown   ← cloned from, then left down
dr-w2-r3   (3A0CDA6E-…)                            Booted
```

**DerivedData did not contend.** `ios-gate.sh build` resolved to
`~/Library/Developer/Xcode/DerivedData/Patina-ccxexsczounfzxaudkjepdlkxiur` — a different hash from
the lanes', because the worktree path differs. The test tiers ran with `-derivedDataPath .build/dd`
inside the worktree regardless.

⚠ The documented fresh-worktree failure reproduced exactly: the first `ios-gate.sh build`
`** BUILD FAILED **` with 3 SwiftCompile failures and no `error:` line (the `Stamp Git SHA` phase's
generated `GitCommit.swift`); the identical second invocation `** BUILD SUCCEEDED **`.

## 2. Merge order and conflicts

Order per `steward.md` §10 — **D → R1 → R3 → R2**. Subjects use `chore(daily-return):` because the
commit hook rejects a `merge:` subject.

| # | Commit | Merge | Files | Conflicts |
|---|---|---|---|---|
| 1 | `422560d4a` | `chore(daily-return): integrate w2 lane d` | 9 files, +876 −131 | none |
| 2 | `baa2632e6` | `chore(daily-return): integrate w2 lane r1` | 13 files, +2480 −30 | none |
| 3 | `a409a742c` | `chore(daily-return): integrate w2 lane r3` | 16 files, +152 −2159 | none |
| 4 | — | `chore(daily-return): integrate w2 lane r2` | **`Already up to date.`** | none |

**Zero conflicts across the wave.** `ProposalDetailView.swift` — the one file §8 flagged for two
lanes — never collided, because R2 made no edit at all; R3's `statusIcon(for:justSigned:)` addition
merged as written and needed no re-application by hand.

Mergedness, proven rather than assumed:

```
$ for b in d r1 r3 r2; do git merge-base --is-ancestor daily-return/w2-$b HEAD && echo "w2-$b MERGED"; done
w2-d MERGED
w2-r1 MERGED
w2-r3 MERGED
w2-r2 MERGED          ← trivially: the branch is still the base commit e9da02569
```

Branch tips at merge time: `w2-d` `b096364ce` · `w2-r1` `0368c5cc7` · `w2-r3` `93c3df7d7` ·
`w2-r2` `e9da02569` (**= main; no commits**).

## 3. Migrations — no renumber

```
$ ls -1 supabase/migrations | tail -6
00534_client_attention_notifications.sql
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
00537_house_on_today.sql
00538_client_account_anonymize.sql
_pending

$ ls -1 supabase/migrations/*.sql | sed 's#.*/##' | cut -c1-5 | sort | uniq -d
(no output — no duplicate numbers anywhere in the 492 files)
```

`main`'s tip was still 00536 at integration, so lane D's provisional 00537/00538 stood as minted.
Nothing was renumbered on either side. W5's reserved **00539** is still free.

## 4. Integration notes — what was applied, and by whom

### 4a. Applied at integration by the steward (three commits)

**`ba99cef76` · `fix(ios): a withdrawn piece reaches the record — ProductAPIClient carries deleted_at`**
— `r1-notes.md` §1, applied on R1's exact diff. `Core/Network/ProductAPIClient.swift` is unowned by
every W2 lane, which is why R1 could not make the change itself. `RawProductWithVendor` gained
`let deleted_at: String?` and `toProduct()` gained `deletedAt: Self.timestamp(deleted_at)`.
`productSelect` is `*,vendors!products_vendor_id_fkey(…)`, so the column was already on the wire —
only the decode hop was missing. 3 insertions, 1 deletion, one file.

**`6bfaaae61` · `chore(ios): the record's files pass lint-delta`** — see §5c.

**`59b389293` · `docs(ios): the canon digest records the July home rail's retirement (Q4)`** —
R3's own §5 canon-digest record (ruling Q4's explicit ask) had been written into the **main
checkout's working tree**, not into R3's worktree, so it sat on no branch
(`git status --porcelain` in the main checkout: `M …/research/11-canon-digest.md`, +31 −0; the same
file in every worktree was clean). Carried onto the integration branch verbatim. The main checkout
was only read.

### 4b. Verified already satisfied in the merged tree — no action needed

- **`r3-notes.md` §1 — `HomeStoryRetryRow` re-homed.** `DailyRoomView.swift:196` resolves the moved
  struct by name with no edit; the build proves it.
- **`r3-notes.md` §5 / `steward.md` §8 — the two-lane `ProposalDetailView.swift`.** No collision
  (§2). R2's `.moneyScreenTopBand()` fold at `:39` was never made, so R3's glyph fix is the file's
  only W2 change.
- **`steward.md` §9.1 — `AttentionCountTests.everyConsumerReadsTheOneHint`** reads
  `DailyRoomView.swift` by path and asserts `badges.studioHint` is present. Suite green (§5b) —
  R2 never recomposed the file it reads.
- **`steward.md` §9.2 — `DailyRoomFeedMappingTests`.** Green; neither lane reddened it.
- **`r1-notes.md` §11 — ratifications.** `Core/Models/ProductModel.swift` (R1 added the `deletedAt`
  *field* to an existing type under its `Core/Models/**` grant) and the two
  `swiftlint:disable:this function_parameter_count` comments: both confirmed, no other lane touches
  either file. The lint disables did not survive unchanged — see §5c.
- **`d-notes.md` §5 — `supabase/seed/00-legacy-grants.sql`.** Lane D regenerated the ACL seed
  outside its owned map because 00538 restates 00536's REVOKE/GRANT and
  `scripts/generate-legacy-grants.py` reads those lines. **Kept, not reverted**: the twelve appended
  lines are mechanical, no other lane touches `supabase/`, and the clean replay in §5a exercised the
  regenerated file end to end.

### 4c. Notes NOT applied, and why

**`r1-notes.md` §3 — `LastSeenStore.shared.markSeen()` has no call site.** R1 asked R2 (or the
steward, via `ContentView.swift`) to call it on `scenePhase → .active` **after** the record for that
open is built. **Deliberately not wired.** With R2 absent nothing builds a record at all, so a
`markSeen()` on foreground would advance the last-visit stamp against a record that was never drawn
— every row that should have carried a `· new` tick on the first real render would arrive already
seen. Stamping before the build is precisely the ordering error R1's note warns about; doing it with
*no* build is that error made permanent. The wiring is owed to whichever lane mounts the card, and
belongs in the same commit as the mount.

**`r3-notes.md` §2 — the second AR dead-end.** `CompanionContextProvider.nudge(for:context:)`
(~lines 272-280) still renders a persistent `"Try in your room →"` pill routing to `.arPlacement`
whenever `context.viewingPiece` is set, while `usdz_url` is NULL on every product. R3 retired the
menu row; this is a different mechanism in a file outside every W2 owned set. Not touched here —
integrating a wave is not the moment to widen its scope. Carried forward as an open item (§6).

### 4d. Lane deviations disclosed and confirmed — not defects

- **R1's five interface deviations** (`r1-notes.md` §4) are each a repo fact: `profiles` has no
  `studio_name`; `client_decisions.designer_id` FKs `auth.users`, not `public.profiles`;
  `list_client_proposals()` is a `SECURITY DEFINER … RETURNS jsonb` RPC a PostgREST embed cannot
  attach to; there is no `EditorialStory` type; the six-hour suppression needs a `previous:`
  argument to stay testable (defaulted, so the brief's call site compiles verbatim).
- **R1's copy deviation (MJ-5)** — the record says `Leah Hartwell asked you to choose.` where
  `b-M1.sheet.html` reads `Leah asked about the rug colour.` First-name extraction from
  `display_name` breaks outright on the `business_name` fallback ("Hartwell Studio asked…"). The
  other four mock lines are verbatim. **This is still Fable's ruling to make, not a lane's** — it is
  a copy change, not a code change, and nothing in the tree draws either string yet.
- **Lane D wrote no `project_rooms` policy** (`steward.md` §5d, `build-plan-critique.md` M4). The
  client-scoped SELECT from `00066:249-253` exists and filters correctly in both directions; the
  plan's own instruction was to drop the migration when no blocker exists.
- **Lane D re-points nothing in 00538** (`d-notes.md` §2). Every designer-owned leg already
  references `profiles(id)`, and GoTrue's soft delete leaves the profile row standing — so the
  profile *is* the tombstone and there is no other id to re-point to. This removes the
  `DISABLE TRIGGER` / ACCESS EXCLUSIVE maintenance window 00536 needed
  (`grep -c 'DISABLE TRIGGER' 00538_*.sql` → 0). Flagged for Fable, integrated as written.

## 5. Gates

All run in the foreground, from the integration worktree.

### 5a. Database and edge functions

```
$ cd .codex/worktrees/agent-dr-w2-integration/supabase && supabase db reset
… Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
{"target":"local","version":"","message":"Reset local database."}      ← clean replay through 00538

$ ./scripts/run-sql-tests.sh
================ summary ================
total:             132
green:              110
expected-fail:      22  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    132 / 132  (green + expected-fail)
===========================================

  PASS  supabase/tests/auth/account_purge_test.sql                 ← 00538's retention assertions
  PASS  supabase/tests/rooms/house_on_today_test.sql               ← 00537
  PASS  supabase/tests/rls/saved_items_snapshot_test.sql
  PASS  supabase/tests/rls/designer_clients_client_read_test.sql

$ deno test --allow-all --config supabase/functions/deno.json \
      supabase/functions/delete-account/handler.test.ts
ok | 12 passed | 0 failed (27ms)

$ supabase gen types typescript --db-url postgresql://…:54322/postgres  > /tmp/dbtypes.ts
$ diff /tmp/dbtypes.ts packages/supabase/src/database.types.ts
(no output — TYPES IN SYNC)
```

The suite count matches lane D's own run exactly (132 / 110 / 22 / 0, against a 131 / 109 / 22 / 0
baseline before the lane), so 00537 and 00538 each brought one new green test and reddened nothing.

### 5b. iOS

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build        # run 1 — the documented GitCommit.swift stamp
** BUILD FAILED **     (3 SwiftCompile failures, no `error:` line)
$ ./apps/mobile/Patina/scripts/ios-gate.sh build        # run 2, identical command
** BUILD SUCCEEDED **

$ xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=98B9DC78-61AB-4D3E-8DE4-7736B252609A' \
    -only-testing:PatinaTests -derivedDataPath .build/dd
✔ Test run with 885 tests in 103 suites passed after 2.544 seconds.
** TEST SUCCEEDED **

$ ./apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files
```

Both the build and the full tier were re-run **after** the lint commit, so the numbers above describe
the tree at `59b389293`, not an earlier one.

The wave's own suites, named and run alone so the counts are not buried in the tier:

```
$ xcodebuild test … -only-testing:PatinaTests/HouseRecordBuilderTests \
    (+ HouseRecordModelTests, HouseRecordDesignerTests, HouseRecordSavedPieceTests,
       StudioQueueItemRowTests, ProposalDetailStatusIconTests, AttentionCountTests,
       DailyRoomFeedMappingTests, CompanionActionMatrixTests, InvoicesMoneyRailTests,
       ProposalsMoneyRailTests)
✔ Suite HouseRecordBuilderTests passed          ✔ Suite HouseRecordDesignerTests passed
✔ Suite HouseRecordModelTests passed            ✔ Suite HouseRecordSavedPieceTests passed
✔ Suite StudioQueueItemRowTests passed          ✔ Suite ProposalDetailStatusIconTests passed
✔ Suite AttentionCountTests passed              ✔ Suite DailyRoomFeedMappingTests passed
✔ Suite CompanionActionMatrixTests passed       ✔ Suite InvoicesMoneyRailTests passed
✔ Suite ProposalsMoneyRailTests passed
✔ Test run with 141 tests in 11 suites passed.  ** TEST SUCCEEDED **

$ xcodebuild test … -only-testing:PatinaTests/LastSeenStoreTests \
                    -only-testing:PatinaTests/RecordSnapshotStoreTests
✔ Test run with 11 tests in 2 suites passed.    ** TEST SUCCEEDED **
```

(`HouseRecordStoreTests.swift` holds two suites under other names — `LastSeenStoreTests` and
`RecordSnapshotStoreTests` — hence the second invocation.)

**Signed `.app`** — built by the test tier, which runs without `CODE_SIGNING_ALLOWED=NO`:

```
$ codesign -dv .build/dd/Build/Products/Debug-iphonesimulator/Patina.app
Identifier=cloud.patina.app
Format=app bundle with Mach-O thin (arm64)
Signature=adhoc
$ codesign -d --entitlements - …/Patina.app
[Dict]          ← EMPTY
```

The empty entitlements dict is R1's §7 claim reproduced on the integrated tree: the App Group is
**not** honoured by an ad-hoc simulator signature, `containerURL(forSecurityApplicationGroupIdentifier:)`
returns nil, and `RecordSnapshotStore`'s app-container fallback is what actually runs. The App Group
remains a **compile-green** claim. A genuinely shared container is a device claim this wave does not
make.

### 5c. The lint-delta round, in full

`lint-delta` is steward-only, so R1's new warnings surfaced here for the first time — and the gate
was **red on the first run**:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Home/Models/HouseRecord.swift: 0 → 3
    Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift: 0 → 2
    PatinaTests/HouseRecordBuilderTests.swift: 0 → 3
    PatinaTests/HouseRecordStoreTests.swift: 0 → 1
```

Nine warnings: three `file_length` (586 / 596 / 802 lines against a 500 limit), two
`function_body_length` (51 and 52 lines against 50), one `function_parameter_count` on
`HouseRecordBuilder.movedRows`, one `type_body_length`, one `large_tuple`, and one
`statement_position`.

**One was a real style violation and is fixed as one.** `HouseRecordStoreTests.swift:60` put `else`
on its own line in the deferred restore inside `markSeenWritesIntoTheAppGroupSuite`; it is now a
normal braced `} else {`.

**The other eight are shape warnings, silenced with the targeted disables this project already
uses** — the same shape as `RecommendationsView.swift:14`, `StyleProfile.swift:290`,
`BadgeCountService.swift:187`, `ProjectsAPIClient.swift:45`, `ProposalsMoneyRailTests.swift:13`.
Two file-level `// swiftlint:disable file_length` (HouseRecord, StudioQueueBuilder), one on the test
file, plus four `disable:this` on the declaration lines. No behaviour changed; 16 insertions,
5 deletions across four files.

⚠ **A trap worth recording.** The first attempt put the disables on their *own* comment lines above
each declaration (`// swiftlint:disable:next …`). That silenced the original rules but broke two
others — a `//` line between a `///` doc comment and its declaration raises `orphaned_doc_comment`,
and a `disable:next` aimed one line off raises `superfluous_disable_command`. Net effect: 9 warnings
became 4. Moving every disable to a trailing `// swiftlint:disable:this …` on the declaration line
itself — R1's original shape — is what actually cleared the gate.

## 6. ⚠ Lane R2 delivered nothing — the wave's headline

```
$ git log --oneline main..daily-return/w2-r2
(no output)
$ git -C .codex/worktrees/agent-dr-w2-r2 status --porcelain
(clean — no staged, unstaged, or untracked work)
$ ls waves/w2/
d-fix-log.md  d-notes.md  d-review.md  d-tasks.md
r1-fix-log.md r1-notes.md r1-review.md r1-tasks.md
r3-notes.md   r3-review.md r3-tasks.md steward.md      ← no r2-tasks.md, no r2-review.md, no r2-notes.md
```

No commits, no working-tree changes, no tasks file, no review, no notes. `HouseRecordCard.swift`,
`YourDesignerSeat.swift`, `YourHouseRail.swift`, `NewThisWeekRail.swift` do not exist anywhere in the
tree, and `DailyRoomView.swift` / `DailyGreetingHeader.swift` are untouched from `main`.

**What that costs, measured rather than asserted.** The record layer is unreachable from any screen:

```
$ grep -rn "HouseRecordBuilder"  apps/mobile/Patina/Patina/ | grep -v Models/HouseRecord.swift   → NONE
$ grep -rn "RecordSnapshotStore" apps/mobile/Patina/Patina/ | grep -v Core/Persistence/…         → 2 comment lines only
$ grep -rn "LastSeenStore"       apps/mobile/Patina/Patina/ | grep -v Core/Persistence/…         → 1 comment line only
```

So, concretely, on this branch:

- **The whole W2 acceptance script is un-walkable.** Not one of its items — Ruth's NEEDS YOU rows,
  MOVED with dates, Leah's seat with Message, her project rooms, the story below, the two-weeks
  header, James's "picked up your request", the Studio count, dark + XXL — has a surface to be
  walked on. There is nothing for a walker to shoot.
- **R1's data layer is fully built, fully tested, and dead code.** 141 tests across 11 suites pin
  behaviour nothing calls.
- **R1's §9 hand-off to R2 is unconsumed**: `isStandingCondition` (the fix for review BL-1 — a row
  the window does not vouch for must draw without a date and without a `· new` tick) is a contract
  with no reader. Whoever writes the card must be handed `r1-notes.md` §9 as a requirement, not as
  background.
- **The `products:` argument still has no caller.** Both discovering rows (withdrawn, repriced) draw
  nothing. The `deleted_at` decode landed in `ba99cef76`, so the second half — fetching the saved
  pieces' products by id, withdrawn ones included — is all that remains, and it belongs to whoever
  writes `DailyRoomViewModel`'s fetch.
- **`markSeen()` is unwired on purpose** (§4c), and the wiring must land in the same commit as the
  mount.
- **The W1b carry-over 8a is unstarted.** `.moneyScreenTopBand()` is still its own modifier at
  `MoneyScreenChrome.swift:40` with nine call sites; the fold into `PatinaScreenChrome` was R2's.

**Nothing was improvised in R2's place.** Writing four new SwiftUI files and recomposing
`DailyRoomView.swift` at integration would be an unreviewed lane landing under a steward's commit,
with no adversarial pass and no owner. The honest state is recorded instead.

## 7. Open, for Fable

1. **R2's work needs re-dispatching** — as its own lane, with `r1-notes.md` §9 (the
   `isStandingCondition` contract), §3 (`markSeen()` ordering), §1 (the products fetch), §10 (the two
   rows the mock draws that are not built: `Leah added two pieces to the proposal.` has no producer;
   `Your dining table shipped.` waits on W4's fulfillment rail) and carry-over 8a in the brief.
2. **MJ-5, the copy ruling** — the record's decision line reads `Leah Hartwell asked you to choose.`
   against the mock's `Leah asked about the rug colour.` R1 flagged it rather than assuming; nothing
   draws either string yet, so it is still free to change (§4d).
3. **`d-notes.md` §3 — a thread the client started is deleted even when the designer is in it.**
   00538 transcribes ruling 2's clause; the narrower predicate is written out and inverts in one
   commit. Fable's or Kody's call.
4. **`d-notes.md` §4 — for Kody.** `designer_clients.client_name` / `.client_email` are not scrubbed
   by 00538. After a closure the designer's screens read "Former client" from `profiles` in some
   places and the person's real name from the CRM row in others. A retention policy question.
5. **`r3-notes.md` §2 — the second AR dead-end** (`CompanionContextProvider.nudge`), unowned and
   unfixed (§4c).
6. **`r1-notes.md` §2 — `list_client_proposals()` carries no designer.** A proposal row takes the
   name resolved from the lead / project / decision / invoice chain and falls back to "Your
   designer". The one-line RPC addition is written out for a later wave; not needed for W2.

## 8. Housekeeping

**Deferred, deliberately.** `steward.md` §11 makes the four W2 worktrees, the four `daily-return/w2-*`
branches and the three `dr-w2-*` clones the steward's to retire **after `git merge-base --is-ancestor`
proves each branch is on `main`**. They are on `daily-return/integration`, which is **not yet merged
to `main`** — that merge is Fable's act, not this steward's. Retiring now would delete the only
non-integration copies of three lanes' work before it lands. Nothing was pushed.

Current state, for whoever retires them:

```
.codex/worktrees/agent-dr-w2-{d,r1,r2,r3,integration}   ← five, all on their own branches
daily-return/{w2-d,w2-r1,w2-r2,w2-r3,integration}       ← five branches, none pushed
dr-w2-{r1,r3,int} booted · dr-w2-r2 shut down           ← review device 973D1724-… untouched, booted
```

The four unrelated worktrees (`agent-cifix`, `agent-mediatests`, `agent-repoint`, `agent-splatcam`)
belong to other programs and were not touched.

## 9. The branch, end to end

```
$ git log --oneline --first-parent main..HEAD
59b389293 docs(ios): the canon digest records the July home rail's retirement (Q4)
6bfaaae61 chore(ios): the record's files pass lint-delta
ba99cef76 fix(ios): a withdrawn piece reaches the record — ProductAPIClient carries deleted_at
a409a742c chore(daily-return): integrate w2 lane r3
baa2632e6 chore(daily-return): integrate w2 lane r1
422560d4a chore(daily-return): integrate w2 lane d

$ git diff --stat main...HEAD | tail -1
 40 files changed, 3553 insertions(+), 2321 deletions(-)

  30  apps/mobile/**        (R1's record layer + R3's twelve retirements + the steward's two fixes)
   3  supabase/functions/   (delete-account, soft delete)
   2  supabase/migrations/  (00537, 00538)
   2  supabase/tests/       (account_purge, house_on_today)
   1  supabase/seed/        (regenerated ACL seed)
   1  packages/supabase/    (database.types.ts)
   1  artifacts/…/research/ (canon digest §5)
```

---

## 9. Completion — R2 landed, two rulings applied, every gate green

Written by the integration steward after Fable re-dispatched R2. **§6's headline is
superseded**: the lane delivered, the Record is mounted, and the wave is complete on this branch.

**Branch:** `daily-return/integration` @ `f2a51a1e3` (was `59b389293`)
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-integration`
(`git rev-parse --show-toplevel` confirms; `.writer.lock.d` held for the duration)

### 9a. The R2 merge — trivial, as predicted

R2 rebased its lane onto the integration tip before reporting, so the merge carried no history to
reconcile:

```
$ git merge-base --is-ancestor 59b389293 daily-return/w2-r2 && echo "R2 branched from this tip"
R2 branched from this tip

$ git merge --no-ff daily-return/w2-r2 -m "chore(daily-return): integrate w2 lane r2"
48 files changed, 3931 insertions(+), 233 deletions(-)          ← no CONFLICT line

$ git show --no-patch --format='%h parents=%p' f05783857
f05783857 parents=59b389293 f815e4a60
```

18 lane commits, tip `f815e4a60`. **Zero conflicts across the whole wave, all four lanes.**
`ProposalDetailView.swift` — the one file `steward.md` §8 flagged for two lanes — did not collide:
R2 touched only `:39` (the `.moneyScreenTopBand()` fold), R3 only `:83` (the seal glyph), exactly as
§8 assigned.

Mergedness, proven rather than assumed:

```
$ for b in d r1 r3 r2; do git merge-base --is-ancestor daily-return/w2-$b HEAD \
    && echo "w2-$b MERGED" || echo "w2-$b NOT-MERGED"; done
w2-d MERGED   w2-r1 MERGED   w2-r3 MERGED   w2-r2 MERGED
```

**Migrations re-checked at merge, per the global constraint.** `main`'s tip has not moved; the tail
is still `00537_house_on_today.sql`, `00538_client_account_anonymize.sql`, and
`ls … | cut -c1-5 | sort | uniq -d` returns nothing across all 492 files. Nothing renumbered.
W5's reserved **00539** is still free.

**The record layer is no longer dead code.** §6 measured its unreachability; the same greps now
resolve into the screen:

```
$ grep -rln "HouseRecordBuilder\|RecordSnapshotStore\|LastSeenStore" Patina/
  Core/Persistence/{LastSeenStore,LocalStoreReset,RecordSnapshotStore}.swift
  Features/Home/Models/HouseRecord.swift
  Features/Home/ViewModels/{DailyRoomViewModel,RecordOwner,RecordRefresh}.swift

$ grep -n "HouseRecordCard(" Features/Home/Views/DailyRoomView.swift
199:                    HouseRecordCard(

$ grep -rn "moneyScreenTopBand" Patina/          ← W1b carry-over 8a: no hits, the fold is complete
```

`markSeen()` — §4c's deliberate non-wiring — is now wired where it belongs: inside
`RecordRefresh.run` **after** the build (`RecordRefresh.swift:99`), with
`RecordRefreshOrderTests` asserting the sequence `paintedSnapshot → built → saved → stamped`.
R2 put it in `DailyRoomView`, not `ContentView`, so `ContentView.swift` stayed untouched.

R2's own deviations, the five files it edited outside its owned set, and its five open questions are
in `waves/w2/r2-notes.md` — read as written; nothing there was altered at integration.

### 9b. Ruled fix 1 — §7 item 3: a thread the designer wrote in is her record too

`09a79b09d` · `fix(db): a thread the designer wrote in is her record too — 00538 keeps it`
(`supabase/migrations/00538_*.sql`, `supabase/tests/auth/account_purge_test.sql`; +97 −22)

00538 is unmerged, so it was edited in place rather than superseded. The clause was
`DELETE FROM public.comms_threads WHERE created_by = p_user_id` — every thread the client started,
cascading the designer's own messages out of a conversation ruling 2's headline promises to keep.
It now reads:

```sql
  WITH gone AS (
    DELETE FROM public.comms_threads t
     WHERE t.created_by = p_user_id
       AND NOT EXISTS (
             SELECT 1
               FROM public.comms_messages m
               JOIN public.profiles pr ON pr.id = m.sender_id
              WHERE m.thread_id = t.id
                AND m.sender_id <> p_user_id
                AND pr.is_designer)
    RETURNING t.id)
```

**Nothing inside a kept thread is scrubbed, and that is not a shortcut.** `comms_messages.sender_id`
references `profiles(id)`; that row survives step 1 as the tombstone, so the client's messages
already resolve to `Former client` and carry no identity of their own. Their bodies are the
designer's conversation — the thing ruling 2 exists to retain. The banner, the deliberately-NOT-on-
the-list bullets and `COMMENT ON FUNCTION` were all updated to say so.

`account_purge_test.sql` gains a **fourth** thread so both sides of the predicate are pinned, not
just the permissive one. The designer sits in `…0001` and `…0004`; she wrote only in `…0001`:

| Thread | Started by | Designer wrote? | Expected |
|---|---|---|---|
| `d8080000-…0001` | client | **yes** | **KEPT** — both messages, both participants |
| `d8080000-…0002` | client | no (nobody else in it) | deleted, messages cascade |
| `d8080000-…0004` | client | no (she is in it, silent) | **deleted** — presence is not authorship |
| `d8080000-…0003` | designer | — | survives, as before |

Plus: the client's kept message still names `u_client`, and reading that author gives
`Former client`. The journal's `comms_threads` count is still `2` — two deletions, not three — so
the existing retry/merge assertions hold unchanged.

```
$ psql … -f supabase/tests/auth/account_purge_test.sql
NOTICE:  account_purge_test: ALL ASSERTIONS PASSED
```

**Still open and untouched:** `d-notes.md` §4 (`designer_clients.client_name` / `.client_email` are
not scrubbed) — a retention policy for Kody, not a lane's call. Carried to §7 item 4.

### 9c. Ruled fix 2 — §7 item 5: the Companion's second AR dead-end

`378029b16` · `fix(ios): the Companion's AR pill is silent for a piece with no model`
(`Features/Companion/Models/CompanionContext.swift`,
`Features/Companion/Services/CompanionContextProvider.swift`,
`PatinaTests/CompanionActionMatrixTests.swift`; +44 −4)

W2 R3 retired the Companion **menu row**; the **nudge pill** above the resting mark
(`CompanionActionProvider.nudge`, the enum inside `CompanionContextProvider.swift`) offered the same
`.arPlacement` destination for any piece in view — a second mechanism onto the same dead end
(`r3-notes.md` §2). `ViewingPieceContext` now carries `hasARModel`, mirroring
`Product.hasARModel` (`usdz_url != nil`) — the same gate `ProductDetailView`'s own AR button has
used since SP-18 — and the guard reads
`guard let piece = context.viewingPiece, piece.hasARModel else { return nil }`.

It defaults to **false**, so a caller that has not established an AR asset cannot produce an AR
offer. Nothing in the app constructs a `ViewingPieceContext` today (`updateViewingPiece` has no
caller), so no call site changed and the pill was already unreachable in practice — the gate is for
the day a browsing surface starts reporting pieces.

**A gate, not a removal.** Both arms are pinned:
`theARNudgeIsSilentForAPieceWithNoModel` (nil on `.emergence` and `.roomEmergence`) and
`theARNudgeReturnsForAPieceThatCarriesAModel` (route `== .arPlacement(productId: "piece-1")`).
Run alone: `CompanionTierAndFreshnessTests` — 16 tests, 1 suite, ** TEST SUCCEEDED **.

### 9d. The lint round — R2's warnings, surfaced here for the first time

`f2a51a1e3` · `chore(ios): the Record's UI passes lint-delta` (6 files, +12 −10)

`lint-delta` is steward-only, so it went **red on the first run** with ten warnings across six files:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Home/ViewModels/DailyRoomViewModel.swift: 0 → 2
    Patina/Features/Home/Views/DailyRoomView.swift:            0 → 3
    Patina/Features/Home/Views/DailyStoryCard.swift:           1 → 2
    Patina/Features/Home/Views/YourDesignerSeat.swift:         0 → 1
    PatinaTests/RecordIdentityTests.swift:                     0 → 1
    PatinaTests/RecordRefreshOrderTests.swift:                 0 → 1
```

**Three were real and are fixed as real** — `DailyStoryCard`'s two
`implicit_optional_initialization` (`var namespace: Namespace.ID? = nil` → `Namespace.ID?`, same for
`publishedAt`), and `YourDesignerSeat`'s `first_where`: `.filter { !archived }.first { designer }`
folded into one `first { !archived && designer }`, which reads the same order and stops at the same
element.

**The other seven are shape warnings**, silenced with the disables this project already uses —
two `file_length` (both 500-line files), two `type_body_length`, one `cyclomatic_complexity` on
`performNextMove`, two `large_tuple` on the tests' three-store fixture. §5c's trap was respected
throughout: every one is a **trailing `// swiftlint:disable:this`** on the declaration line, never a
`disable:next` on its own comment line (which raises `orphaned_doc_comment` and
`superfluous_disable_command` instead). Build and the full tier were re-run **after** this commit,
so every number below describes the tree at `f2a51a1e3`.

### 9e. Gates — all foreground, all from the integration worktree

**Database and edge functions**

```
$ supabase db reset
{"target":"local","version":"","message":"Reset local database."}      ← clean replay through 00538

$ ./scripts/run-sql-tests.sh
total: 132 · green: 110 · expected-fail: 22 · unexpected-fail: 0
effective-green: 132 / 132
  PASS  supabase/tests/auth/account_purge_test.sql        ← 00538 + the narrowed thread clause
  PASS  supabase/tests/rooms/house_on_today_test.sql      ← 00537

$ deno test --allow-all --config supabase/functions/deno.json \
      supabase/functions/delete-account/handler.test.ts
ok | 12 passed | 0 failed (28ms)

$ supabase gen types typescript --db-url postgresql://…:54322/postgres > $TMPDIR/dbtypes.ts
$ diff $TMPDIR/dbtypes.ts packages/supabase/src/database.types.ts
(no output — TYPES IN SYNC, 34317 lines)
```

The suite totals are identical to §5a's (132 / 110 / 22 / 0), so narrowing the clause reddened
nothing and the new fixtures cost no expected-fail.

**iOS**

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **        (no GitCommit.swift stamp failure — this worktree is no longer fresh)

$ xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=98B9DC78-61AB-4D3E-8DE4-7736B252609A' \
    -only-testing:PatinaTests -derivedDataPath .build/dd
✔ Test run with 980 tests in 117 suites passed after 2.792 seconds.
** TEST SUCCEEDED **

$ ./apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files
```

980 tests in 117 suites, against §5b's 885 in 103 — fourteen new suites and 95 new tests (R2's 93
plus the two AR-nudge pins), with nothing reddened. The device is `dr-w2-int` (`98B9DC78-…`), this steward's own clone;
the review device `973D1724-…` was never targeted. `git worktree list` after the lint-delta run
shows no leftover temp worktree in the shared `.git`.

**Signed `.app`** — built by the test tier, which runs without `CODE_SIGNING_ALLOWED=NO`:

```
$ codesign -dv  .build/dd/Build/Products/Debug-iphonesimulator/Patina.app
Identifier=cloud.patina.app · Format=app bundle with Mach-O thin (arm64) · Signature=adhoc
$ codesign --verify --verbose …/Patina.app
valid on disk · satisfies its Designated Requirement
$ codesign -d --entitlements - …/Patina.app
[Dict]          ← EMPTY
```

Path: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-integration/apps/mobile/Patina/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`

⚠ **Two honest readings of the App Group, both recorded.** The entitlements dict on this ad-hoc
signature is empty, so on *this* build `containerURL(forSecurityApplicationGroupIdentifier:)` returns
nil and `RecordSnapshotStore`'s app-container fallback is what runs (R1 §7, §5b above). R2 reports
the opposite on `dr-w2-r2` running its own build — both `house-record.json` and
`group.cloud.patina.app.plist` landed in the shared container (`r2-notes.md` §3). Either way the
fallback is load-bearing and stays, and **a genuinely shared container remains a device claim this
wave does not make.** Claim levels: the Record's data path, composition and copy are
**sim-verified**; the App Group is **compile-green**.

### 9f. What is closed, and what is still open for Fable

**Closed by this session:** §7 item 1 (R2 re-dispatched and landed), item 3 (the thread clause,
§9b), item 5 (the AR nudge, §9c). W1b carry-over 8a (`.moneyScreenTopBand()` fold) is complete —
zero references remain. Carry-over 8b (the seal glyph) landed with R3 in §2.

**Still open:**

1. **The wave has not been walked.** Every gate here is a build/test gate. W2's acceptance script —
   Ruth's NEEDS YOU rows and MOVED with dates, Leah's seat with Message, her project rooms, the
   story below, the two-weeks header, James's "picked up your request", the Studio count, dark and
   XXL — is the walker's, on the review device, and has not been run on this branch.
2. **MJ-5's wording** (§7 item 2, now implemented rather than pending). R2 renders
   `<first name> asked about <decision title>.`, which on the walk's data reads
   `Leah asked about Dining chairs - Shaker Oak vs Windsor Elm.` — the decision's own title verbatim.
   `r2-notes.md` §4.1: if that reads badly, the fix is the title in the database, not the app.
3. **`· due Sep 1` vs the mock's `· Sep 1`** on the invoice row (`r2-notes.md` §2.1) — the brief and
   `b-M1.sheet.html` disagree by one word; R2 flagged rather than picked.
4. **`d-notes.md` §4 — for Kody.** `designer_clients.client_name` / `.client_email` survive the
   closure; after it the designer's screens read "Former client" in some places and the person's real
   name in others. A retention policy, unchanged by §9b.
5. **`r1-notes.md` §2** — `list_client_proposals()` carries no designer; the proposal row falls back
   through the lead / project / decision / invoice chain to "Your designer". One-line RPC addition,
   written out, not needed for W2.
6. **R2's remaining opens**, verbatim in `r2-notes.md` §4: `See all →` routes to the Studio for both
   halves (§2.4); no `Saved` summary row at discovering (§2.5); the story card carries no date chip
   because `DailyStory` has no publish date and that type is another lane's file (§2.6); the seat's
   line repeats the Next Move at engaged (§4.3); `Leah added two pieces to the proposal.` still has
   no producer and `Your dining table shipped.` waits on W4 (§4.4); the Companion orb overlaps the
   house block at XXL, pre-existing and left to W3 (§4.5).

### 9g. Housekeeping — still deferred, and why

Unchanged from §8. `steward.md` §11 makes the worktrees, branches and clones the steward's to retire
**after `git merge-base --is-ancestor` proves each branch is on `main`**. They are on
`daily-return/integration`, which is not yet on `main` — that ff-merge is Fable's act. Retiring now
would delete the only non-integration copies of four lanes' work. **Nothing was pushed.**

```
.codex/worktrees/agent-dr-w2-{d,r1,r2,r3,integration}   ← five
daily-return/{w2-d,w2-r1,w2-r2,w2-r3,integration}       ← five branches, none pushed
dr-w2-{r1,r2,r3,int} booted                             ← review device 973D1724-… untouched
```

`.writer.lock.d` released at report.
