# Wave 1 — integration report ("The Decision, Delivered")

Steward run: 2026-09-05. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`,
branch `approvals/w1-integration`.

## Base

`git fetch origin main` → `origin/main` = **`6600cc069986ba6e948d7201e2dd2d0978f5b0ef`**
("fix(document): merge prod flow fixes — signature two-studio guard, scope options, Contract
Room"). Local `main` sat at `d95bb80a09d5c5b7ea2ba885509d3a588d095911`;
`git merge-base --is-ancestor main origin/main` → YES, the reverse → NO. So `6600cc069` is the
tip, and it is the same sha every lane branched from (`env.md` baseSha).

**mainShaMerged = `6600cc069986ba6e948d7201e2dd2d0978f5b0ef`.**

## Lanes merged

Merged with `--no-ff`, in the briefed order. **No conflicts in any of the three merges.**

| order | lane | branch | lane head | merge commit | conflicts |
|---|---|---|---|---|---|
| 1 | backend | `approvals/w1-backend` | `3e3b890f864e35ece1ad58c41629e0e2a5d66920` | `feb696552` `chore(approvals): merge w1-backend` | none — 33 files, +2279 / −155 |
| 2 | web | `approvals/w1-web` | `23793db5a5d21790bed399d87059a0fed8a32776` | `9482ca85d` `chore(approvals): merge w1-web` | none — 9 files, +489 / −53 |
| 3 | iosa | `approvals/w1-iosa` | `62fd127d50263b04067f40a8f95b8c72ad811ad4` | `b7cd71386` `chore(approvals): merge w1-iosa` | none — 21 files, +1116 / −110 |

`git diff --stat 6600cc069...HEAD` → **63 files changed, 3884 insertions(+), 318 deletions(-)**.

### Lane NOT merged — iosb

`approvals/w1-iosb` (`0369544d71c652fedab437f108af6dc08f5a22ed`) was **skipped**.

The lane's round-3 adversarial review closes with:

> **fix** — one blocker (homeowner-visible copy calling an approval a choice) and three majors.

The blocker is **iosb3-B1**: the in-app door the lane opened routes a Stage-2 approval into
`HouseRecordBuilder.title(for:)`, whose grammar calls the ask a choice. The reviewer's probe on
the lane's own simulator printed:

```
PROBE row.title(designer known) = Leah asked about Approve the kitchen millwork as drawn?.
PROBE row.title(no designer)   = Your designer asked you to choose.
PROBE row.state(after due)     = overdue
```

Both strings are homeowner-facing and both break rulings that `rulings-2026-09-04.md` calls
binding on every surface — "decision"/"choose" reserved for an option choice between named
alternatives, and "overdue" never in copy a homeowner reads (R8, and the Vocabulary section).

The steward's merge rule is that a lane with an open blocker merges only if the blocker is
documented as accepted in its own `<lane>-notes.md`. It is not: `iosb-notes.md` was last written
at 00:17 and `iosb-review-r3.md` at 00:37 — the notes predate the finding, and a grep over the
notes for the blocker id, for "accept", or for the offending grammar returns nothing.

So the lane is held, not merged. Nothing in the three merged lanes depends on it — `git diff
approvals/w1-iosa HEAD -- apps/mobile` is empty, i.e. the integration branch's iOS tree is
exactly lane A's. Re-run integration once iosb3-B1 is fixed (or accepted in writing), and the
merge should still be conflict-free.

## Migrations

```
$ ls supabase/migrations | tail -6
00564_client_signoff_approval.sql
00565_the_client_page.sql
00566_commercial_signature_studio_resolution.sql
00567_scope_vocabulary_full_house_custom.sql
00568_decision_first_notice_dispatch.sql
_pending
```

The tip's highest number is `00567` (both `00566` and `00567` arrived on main with `6600cc069`).
The backend lane minted **`00568_decision_first_notice_dispatch.sql`** — strictly above, and
`git log --all --diff-filter=A -- 'supabase/migrations/005[6-9]*'` shows no competing `00568` on
any ref this machine can see. **No renumbering was needed and none was done.**

## Gates

Every gate below was run from the integration worktree after
`pnpm install --frozen-lockfile` (Done in 26.3s) and
`pnpm turbo build --filter=@patina/client-portal^...` (**8 successful, 8 total**, FULL TURBO).
`Secrets.swift` was copied into
`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` before the iOS tiers.

| # | gate | result |
|---|---|---|
| a | `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output, exit 0 |
| b | `pnpm --filter @patina/client-portal test` | **PASS** — Test Suites: **115 passed, 115 total**; Tests: **1533 passed, 1533 total**; 9.793 s |
| c | `pnpm --filter @patina/supabase type-check` | **PASS** — exit 0 |
| c | `pnpm --filter @patina/designer-portal type-check` | **PASS** — exit 0 |
| d | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **PASS** — `ok \| 175 passed \| 0 failed (1s)` |
| d | `deno test` on each touched function dir | **PASS** — commercial-document-notify 37, proposal-send 23, notification-digest 10, decision-reminders 6 = **76 passed, 0 failed**. The other seven touched dirs ship no tests (`error: No test modules found`): client-invite, decision-first-notice, decision-resolved-notify, expire-decisions, proposal-nudge, proposal-sign-confirmation, review-requests |
| d | `deno check` on all 10 touched `index.ts` + `proposal-send/index.ts` | **PASS** — exit 0 on all eleven |
| d | `deno.lock` sweep | clean — none at repo root, none in the worktree, none under `supabase/functions` |
| e | `supabase db reset` (integration worktree; announced in `stack-reset-notice.md` first) | **PASS** — all migrations replayed through `00568`, all seeds applied, `Reset local database.` |
| e | `bash scripts/run-sql-tests.sh` | **PASS** — total **156**, green **135**, expected-fail **21** (KNOWN_FAILURES.md), unexpected-fail **0**, effective-green 156/156 |
| e | types regen + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** — exit 0 after `SUPABASE_DB_URL=…54322 pnpm generate`; `00568` adds a trigger and a function, no table shape. No regen commit needed |
| f | `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE ios-gate.sh all` | **PASS** — `** BUILD SUCCEEDED **`; `Test run with **2367 tests in 255 suites** passed after 7.669 seconds with 2 known issues`; `** TEST SUCCEEDED **`; `✓ lint-delta: no new warnings in touched files`; exit 0 |

The two known issues on the iOS run are the pre-existing pair both iOS lanes report: a
`BrandVoiceLint` expectation on "curated_mix" and `RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

**One transient worth recording.** The *first* `ios-gate.sh all` invocation, against a cold
per-worktree `DerivedData`, reported `** BUILD FAILED **` with three failures, all in the
`x86_64` slice of one `SwiftCompile` batch (`AppConfiguration.swift, Secrets.swift, … ,
DecisionsAPIClient.swift`) and no `error:` diagnostic anywhere in the log. A bare `build` tier
immediately after returned exit 0, and the full `all` re-run returned exit 0 with the counts
above. The gate script's own header names this class of failure ("per-worktree DerivedData: six
lanes compiling into one shared tree produces transient failures the Daily Return already paid
for"). Recorded as a cold-cache transient, not a code defect; the green run is the evidence.

## Deploy set

**Migrations** (apply first, in order):

- `supabase/migrations/00568_decision_first_notice_dispatch.sql`

**Edge functions — 27.** Every directory whose own code changed, plus every importer of a changed
`_shared` module, taken to transitive closure inside `_shared`. The changed shared modules are
`branded-email.ts`, `client-portal-links.ts`, `decision-notify.ts`, `invoice-emails.ts`,
`project-approval-notification.ts` and the new `studio-identity.ts`; four further shared modules
import them and widen the set (`trade-rfq-emails.ts`, `po-emails.ts`, `quote-request-emails.ts`,
`fulfillment-templates.ts`).

```
campaign-dispatch           client-invite               commercial-document-notify
comms-notification-dispatch create-checkout-session     decision-first-notice
decision-reminders          decision-resolved-notify    digest-dispatcher
expire-decisions            fulfillment-notify          invoice-check-intent
invoice-reminders           invoice-send                morning-brief
notification-digest         notification-dispatch       po-send
proposal-nudge              proposal-send               proposal-sign-confirmation
quote-request-send          review-requests             spec-pdf
stripe-webhook              trade-rfq-send              waitlist-notify
```

This is the backend lane's declared 26 **plus `fulfillment-notify`**, which the lane's list
missed: `fulfillment-notify/core.ts` → `_shared/fulfillment-templates.ts` → `_shared/branded-email.ts`,
and `branded-email.ts` changed. `_tests` is excluded (not a deployable function). `config.toml`
carries a `[functions.fulfillment-notify]` entry, so it is a real deploy target.

**Portals:** `client` only. `git diff --name-only 6600cc069...HEAD` touches
`apps/client-portal` (9 files), `apps/mobile` (21), `supabase/functions` (28), one migration, one
seed, one SQL test and two artifact notes. **No `packages/` change and no `apps/designer-portal`
change**, so the designer portal does not need a redeploy for this wave.

**iOS:** changed (21 files under `apps/mobile/Patina`). Lands on main build-green and
sim-verified; no TestFlight cut in this wave.

## Walk prep

- Simulator **`cae-w1-walk`** created fresh — UDID **`29E64516-9C2F-4D77-95D8-55D7B61E017B`**,
  device type `iPhone 17 Pro`, runtime `com.apple.CoreSimulator.SimRuntime.iOS-26-5` (the same
  pair the lane clones use). Left **Shutdown**; nothing booted, nothing installed.
- App built from the integration worktree with signing left ON (no `CODE_SIGNING_ALLOWED=NO`):
  `xcodebuild build -scheme Patina -configuration Debug -destination 'generic/platform=iOS
  Simulator' -derivedDataPath …/.build/DerivedDataWalk` → `** BUILD SUCCEEDED **`.
  `codesign -dv` on the bundle: `Identifier=cloud.patina.app`, `Signature=adhoc`,
  `Format=app bundle with Mach-O universal (x86_64 arm64)` — the normal simulator signature.
- **walkAppPath**:
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

## Open findings carried onto the branch

Nothing below blocks the merge; all of it ships with the branch and is owed to a later round.

### backend (`approvals/w1-backend`, verdict *fix*)

- **R3-01** — for every approval already in flight at deploy there is no first-notice log row, so
  the 48-hour cron speaks the announcing register and tells a homeowner her designer "sent"
  something the studio actually sent weeks ago. The B1 lie, reintroduced for the back catalogue.
- **R3-02** — the lane never enumerated its own deploy set. **Closed by this report** (27
  functions above, one more than the lane counted).
- **R3-03** — the first notice is a one-shot with no retry. For an approval with no due date it
  is the only letter that will ever exist, so a single skip (quiet hours, milestone preference
  off at that instant, a Resend failure) silences that approval permanently.
- **R3-04** — R7's third element (city) still never renders on four client letters: three read
  `profiles.city`, the column this same round proved empty (`proposal-nudge:222`,
  `client-invite:158`, `review-requests:264`), and proposal-send omits the city entirely.
- Carried from earlier rounds, still NOT FIXED and still on the branch: F4 (`undefined` for an
  unmapped artifact kind — probe: `kitchen plan set is ready, undefined.`), F5 (missing article:
  `Leah sent approve the issued set for your approval.`), F6 (`Still open, Your designer asked on
  August 28.` — capital mid-sentence), F7 (a legacy option choice called an approval), F8
  ("Nothing has changed since it was sent", unconditional at `:656`), F9 (Patina's tagline under
  the studio's signature, twice), F10 (unused `created_at`), F11 (subject punctuation
  inconsistent across three letters), F12 (the digest links the anchor where the mail links the
  Universal Link).

### iosa (`approvals/w1-iosa`, verdict *fix*)

- **R3-01** — P-05's springboard badge is half delivered: the app writes the badge, nothing
  writes it while the app is not running, so the home-screen number is frozen at the last
  Today/feed load. The missing half is `aps.badge` in `buildApnsPayload`
  (`supabase/functions/apns-send/core.ts`) — a backend-lane file, untouched by either lane.
- **R3-02** — the retired word still ships to a homeowner on three iOS surfaces: the invoice
  list, the invoice detail and the Studio hub money row (`DateDisplay.due` →
  `Overdue · Aug 21`). `rulings-2026-09-04.md` calls the vocabulary binding on every surface.
- Minors/nits open from round 2 and renumbered into round 3: R3-03 (`· NEW` beside R8's
  sentence), R3-04/R3-10 (row gutter against the new per-half *See all*), R3-07 (a checkmark
  used as status), R3-08 (a numeric badge on the Daily header), R3-09 (a push tap marks the
  wrong row, amplified by the springboard badge), R3-11 (lane log uncommitted), R3-12 (file-wide
  SwiftLint disables), R3-13 (`markAllOpened` narrowed), R3-14/15/16/17 (test and hit-area nits).

### web (`approvals/w1-web`, verdict *ship*)

No blocker, no major. Open minors: W1W-02, W1W-06 (lane log untracked), W1W-07 (copy never
verified visually), W1W-08 (the designer's name is absent while loading, not only on error), plus
this round's F-01 (two of five copy changes ship with no test), F-02 ("Your review is confirmed."
stands two paragraphs above "Choose one outcome."), F-05 (the designer's name flips in after the
team query lands).

### iosb (`approvals/w1-iosb`, NOT merged)

Held with its four open findings: **iosb3-B1** (blocker, above), **iosb3-M1** (at exact half
dollars iOS states a different figure from the web, and the self-contradicting "+$0" is still
reachable), **iosb3-M2** (the projection is merged with no check that the caller is the frozen
decision lead, so a studio co-member's own "waiting on you" feed gains every DRAFT approval in
the studio), **iosb3-M3** (a Stage-2 approval past its date renders "overdue" in error red on
the Record, because the merge routes it into the legacy decision state machine).

## Advisories from the lanes

- **R5 needs ruling again (iosa, iosb).** iosa found that nothing anywhere sets the springboard
  badge — `grep -rn "setBadgeCount\|applicationIconBadgeNumber"` over the app returned nothing
  before the lane's work, and `apns-send` still emits no `aps.badge`. Either the payload starts
  carrying a badge sourced from the unread `in_app` count (a backend change), or R5 is recorded
  as "the springboard badge is dormant". Separately, iosb read R5's "no in-product numeric badge"
  as covering the notification bell and turned `UnreadBadge` (a clay capsule printing a capped
  count) into `UnreadMark` (an 8 pt clay dot, `accessibilityValue` "Unread notifications"). That
  change rides on the held iosb branch; if R5 was meant to leave the bell alone, `iosb2-M3` is
  the commit to revert and nothing else depends on it.
- **P-08 needed no code (iosa).** `DeepLinkHandler.swift:101` already read
  `coordinator.phase == .main` on the base sha; the lane's contribution is test coverage for all
  four `AppPhase` values.
- **P-05's premise was wrong (iosa).** `BadgeCountService.attentionCount` is
  `pendingDecisionCount + proposalsAwaitingSignatureCount + payableInvoiceCount` and never read
  `notification_log`, so it had nothing to inherit; the double count P-05 names lives in
  `unreadNotificationCount`.
- **Lane logs are gitignored (web, iosa, iosb).** `artifacts/**/build/` is caught by
  `.gitignore:7 build/`, which is why `env.md` and the iOS lanes' notes are untracked. The
  backend lane force-added its two files, so `backend-notes.md` and `stack-reset-notice.md` are
  tracked while the peers' are not. This report is force-added to match the backend precedent —
  worth one ruling so the wave's logs are all in or all out.
- **Prettier drift is inherited (web).** `npx prettier --check` warns on all eight files the web
  lane touched and warns identically on the base version of `spine-gate.tsx` straight out of
  `6600cc069`. Advisory in the pre-commit hook, not caused by this wave.
- **No lane did a live round trip (iosb, and iosa's Stage-2 work).** The RPC contracts are pinned
  by migration definition and parameter shape, not by a live call. The simulator walk on
  `cae-w1-walk` is the first real exercise of them.
- **Deploy ordering.** `00568` first, then all 27 functions (every one bundles a copy of an
  edited `_shared` module — a partial redeploy leaves mixed copy in the mail), then the client
  portal.

---

## Walk fixes — round 1 (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w1-integration`.
Five findings from the simulator walk (`walk-r1.md`): one blocker, four majors.

### The blocker was a lane, not a line — iosb is merged

**W1R1-B1** — "P-09 is entirely absent from the integration branch" — was not a defect in the
merged code. It was the held lane. `approvals/w1-iosb` (`0369544d7`) carries the whole item:
the two read RPCs (`get_project_decision_review`, `list_my_project_decision_reviews`), the
three canonical outcomes, `confirm_project_decision_review` / `respond_project_approval`, the
impact triplet, and `ProjectApprovalScreen` — the surface that ends the bell's dead end on
"Couldn't load this decision".

Merged `--no-ff` as `84918b022` **with no conflicts** — 19 files, +2264/−123, all under
`apps/mobile/Patina`, exactly as the integration report predicted.

That merge also closes two of the walk's own findings outright:

- **W1R1-M2** (the bell's numeric badge) — `UnreadBadge` is gone; `DailyGreetingHeader.swift:183`
  now mounts `UnreadMark`, an 8 pt clay dot, and the button's accessibility value says
  "Unread notifications" rather than speaking the number. `grep -rn "9+" DailyGreetingHeader.swift`
  finds only the comment recording what was removed. R5's re-ruling is no longer blocking:
  the wave gets the dot; if R5 was meant to leave the bell alone, `iosb2-M3` is still the one
  commit to revert.
- **iosb3-M3** (a Stage-2 approval past its date drawn in error red) — already answered by lane A,
  which the steward had merged: `HouseRecordRowPresentation.make` maps `.overdue` to R8's whole
  sentence in body ink (`HouseRecordCard.swift:67-78`, `:531-539`), and the only red left on the
  card is money.

The lane's open blocker had to be fixed for the merge to be honest — see below.

### The five fixes

| commit | finding | what changed |
|---|---|---|
| `0542908dd` | **W1R1-B1** (the lane's `iosb3-B1`) | The Record's decision grammar called an approval a choice. `StudioQueueItemRow` gains `isApproval`, set from `isProjectArtifactApproval \|\| isClientSignoff`; `HouseRecordBuilder.title(for:)` branches to "Leah asked for your approval." and lets the second line carry the question, so the question's own "?" never runs into an appended full stop. An untitled approval falls back to `untitledApprovalTitle` ("An approval is ready"), never to "A project choice is ready". Also in this commit, because they live in the same builder: the hub row's `checkmark.circle` and its counted detail (W1R1-M4's half of `StudioQueueBuilder`). |
| `51b50d981` | **W1R1-M3** | The eyebrow reads `APPROVAL` on a sign-off or a Stage-2 row (`DecisionDetailViewModel.isApprovalAsk`), `DECISION` on a real option choice. `availableDeferrals` drops "Neither of these" wherever there are no options to be neither of, so the screen no longer offers it in the same breath as "Nothing to choose". The deferral receipt says "This approval is still open." on an approval. |
| `00bf6eceb` | **W1R1-M4** | The hub counts in words. New `PatinaCount` mirrors the web's own list and past-twelve cutoff (`standing-sentence.ts:120-144`), and `StudioAttentionSummary` and the section-header figure both go through it: "Five things need your eye", "five", "zero". |
| `8959cb0f5` | **W1R1-M1** | P-04's clock was dead code. `AppNotification` gains `iconOverride`, set in `init(from:)` from `DecisionPushType(rawValue: notification_log.type)?.icon`, so the feed draws the type's own mark instead of one `hand.raised` for all three; `defaultTitle` is read on the same path. Because those glyphs now reach a homeowner, `.required` became `hand.raised` (the mark the bell already gave the ask) and `.resolved` left `checkmark.seal.fill` for `seal` — a check beside a row is a status mark. |
| `968ed6900` | **iosb3-M1** | `PatinaCurrency.formatWholeDollars` sets `roundingMode = .halfUp`; `NumberFormatter` defaults to half-even, so $2.50 read "$2" on iOS and "$3" in the same letter (`Intl.NumberFormat` expands a tie away from zero). And a delta under fifty cents now reads "+less than $1" instead of "+$0" under a row that exists only because the cost changed. |

Tests: two new files — `ApprovalVocabularyOnTheRecordTests` (the projection and the sign-off
through `itemizedAwaitingRows` into `title(for:)`, and that no approval row says "choose",
"choice", "decision" or "?.") and `WalkFixCopyTests` (the feed's glyph per push type, the
eyebrow, the deferral pair, the words, the rounding pair) — plus four approval cases in
`HouseRecordBuilderTests`. Four suites that pinned the retired figures were rewritten
(`AttentionCountTests`, `StudioHubTests`, `BellQueueFallbackTests`).

### One thing the merge broke that the walk could not have seen

`313853b8d` — `BadgeCountService.swift` came out of the merge at **504 lines**, four past
SwiftLint's 500-line `file_length`, and `lint-delta` failed the first re-run on it
(`Patina/Services/Badges/BadgeCountService.swift: 0 → 1`). Neither lane produced it alone: iosb
split `mergedDecisions` out precisely to stay under the floor, and iosa's own growth landed on
top. The nested `PersistedCounts` moved to `BadgeCountService+…`-style neighbour
`BadgeCountPersistedCounts.swift`, still nested on the service, so every reference in the file
reads unchanged and the four source pins that read `BadgeCountService.swift`
(`BadgeCountPersistenceTests`, `ColdLaunchStalenessTests`, `BadgeFreshnessTests`,
`ProjectApprovalPathTests`, `SessionIsolationTests`, `RecordForegroundTests`) still find what
they look for. 468 lines now.

### Gates (final tree, `313853b8d`)

```
IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/ios-gate.sh all
  ** BUILD SUCCEEDED **
  ━ Test run with 2436 tests in 265 suites passed after 7.550 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **
  ✓ lint-delta: no new warnings in touched files
  exit=0
```

2367 tests in 255 suites before this pass (the steward's run), **2436 in 265** after — the iosb
merge's suites plus this round's two new files. The two known issues are the same pre-existing
pair both iOS lanes report: a `BrandVoiceLint` expectation on "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

The first re-run failed on lint-delta alone (`exit=1`, the 504-line file above); build and tests
were green on that run too.

### The walk app is rebuilt at the same path

```
xcodebuild build -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath …/apps/mobile/Patina/.build/DerivedDataWalk
```

**walkAppPath** (unchanged, ready to re-install on `cae-w1-walk`
`29E64516-9C2F-4D77-95D8-55D7B61E017B`):
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

### Still open on the branch after this pass

- **iosb3-M2 — NOT FIXED, and it needs a ruling, not a patch.** `list_my_project_decision_reviews`
  (00467:135) is project-scoped: it returns every Stage-2 approval in every project a
  **studio co-member** co-authors, and the projection carries no field naming the frozen lead.
  So a studio person signed into the *client* app gains every draft approval in the studio as
  "waiting on you". Fixing it honestly means adding a viewer-role field to the projection — a
  migration and a redeploy, i.e. a wave decision, not a walk fix. The homeowner path is
  unaffected: 00467 hides her from nothing and shows her only her own.
- **iosa R3-02** (the retired word on the invoice list, the invoice detail and the Studio money
  row, via `DateDisplay.due` → `Overdue · Aug 21`) — carried, untouched. It is money, not the
  approval rail, and the walk did not name it this round.
- `DecisionListView.emptyView` draws `checkmark.circle` beside "Nothing waiting on you". Not
  named in the walk and arguably an illustration rather than a status mark, but it is the last
  checkmark left on this rail — worth a look in W2.
- Everything the integration report already carried (backend R3-01/03/04 and F4–F12, web's
  minors, iosa's minors) is unchanged.

---

## Close-out (2026-09-05)

Steward run from
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w1-integration`.
Close-out head **`6f10a26aeedfaefb641860623f62cc56d7e77ec9`**.

### Merges

| # | merged | from | into | result |
|---|---|---|---|---|
| 1 | `approvals/w1-backend` close-out (`b8dd6794d` … `9bb2422ff`, 14 commits) | lane head `9bb2422ff` | integration head `6c2f769af` | `6f10a26ae` `chore(approvals): merge w1-backend close-out` — **no conflicts**, 27 files, +2221 / −179 |
| 2 | `origin/main` | — | — | **not needed.** `git fetch origin main` → `origin/main` = `6600cc069986ba6e948d7201e2dd2d0978f5b0ef`, byte-identical to the base every lane branched from. Main has not moved. |

The iOS lane had advanced one commit past the head the brief named
(`09ac03adc` → `6c2f769af`, `docs(approvals): adversarial review of the W1 close-out iOS lane,
round three`); that commit is docs only and is included.

`git diff --shortstat 6600cc069...HEAD` → **117 files changed, 12127 insertions(+),
623 deletions(-)**.

### Migrations — no renumber

```
$ ls supabase/migrations | tail -5
00565_the_client_page.sql
00566_commercial_signature_studio_resolution.sql
00567_scope_vocabulary_full_house_custom.sql
00568_decision_first_notice_dispatch.sql
_pending
```

`git log --all --diff-filter=A -- 'supabase/migrations/0056[6-9]*' 'supabase/migrations/0057*'`
returns exactly three adds — `00566`, `00567` (both from main at `6600cc069`) and our own
`00568` (`1e1cbedd2`). No competing `00568` on any ref. **No renumbering was needed and none
was done.**

### Gates — all green

Run after `pnpm install --frozen-lockfile` (Done in 9.3s) and
`pnpm turbo build --filter=@patina/client-portal^...` (**8 successful, 8 total**, FULL TURBO).

| # | gate | result |
|---|---|---|
| a | `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, exit 0, no output |
| b | `pnpm --filter @patina/client-portal test` | **PASS** — Test Suites: **116 passed, 116 total**; Tests: **1546 passed, 1546 total**; 10.707 s (was 115/1533 at the last pass — the backend lane's `retired-routes` suite plus new cases in `page` and `active-project`) |
| c | `pnpm --filter @patina/supabase type-check` | **PASS** — exit 0 |
| c | `pnpm --filter @patina/designer-portal type-check` | **PASS** — exit 0 |
| d | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **PASS** — `ok \| 190 passed \| 0 failed (1s)` (was 175 — the close-out's `branded-email`, `decision-notify`, `studio-identity` cases) |
| d | `deno test` per changed function dir with tests | **PASS** — commercial-document-notify **37**, proposal-send **23**, notification-digest **11**, decision-reminders **6** = **77 passed, 0 failed**. Nine changed dirs ship no test module (`apns-send`, `client-invite`, `decision-first-notice`, `decision-resolved-notify`, `expire-decisions`, `proposal-nudge`, `proposal-sign-confirmation`, `review-requests`) — `apns-send`'s tests live in `_tests/`. |
| d | `deno test supabase/functions/_tests/apns-send.test.ts` (the close-out's new suite) | **PASS** — `ok \| 25 passed \| 0 failed (23ms)` |
| d | `deno test supabase/functions/_tests/` minus the pre-existing red | **PASS** — `235 passed, 1 failed`; the single failure is `stripe-rail.test.ts`, `error: supabaseKey is required` at `:34` — a live-stack test needing env, **untouched by this wave** (`git diff --name-only 6600cc069...HEAD -- …/stripe-rail.test.ts` is empty) |
| d | `deno test supabase/functions/_tests/` (whole dir) | **RED — pre-existing, not ours.** `TS2345` at `fulfillment-po/core.ts:314` (`encodeBase64(Uint8Array)`). Both `fulfillment-po/core.ts` and `_tests/fulfillment-po.test.ts` are byte-identical to `6600cc069` (`git diff --stat` over both paths is empty), and running that one test file alone reproduces the same failure. Same class as the noted `campaign-dispatch`/`digest-dispatcher` errors: recorded, not fixed. |
| d | `deno check` on all **15** changed function sources (`index.ts` / `core.ts` / `handler.ts` / `logic.ts`) + `proposal-send/index.ts` | **PASS** — exit 0 on all sixteen |
| d | `deno.lock` sweep | clean — none at the repo root, none in the worktree, none under `supabase/functions` |
| e | `supabase db reset` (announced in `stack-reset-notice.md` first) | **PASS** — all migrations replayed through `00568`, all seeds applied, `{"message":"Reset local database."}` |
| e | `bash scripts/run-sql-tests.sh` | **PASS** — total **156**, green **135**, expected-fail **21** (KNOWN_FAILURES.md), unexpected-fail **0**, effective-green **156 / 156** |
| e | types regen + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** — exit 0 after `SUPABASE_DB_URL=…54322 pnpm --filter @patina/supabase generate`. `00568` adds a trigger and a function, no table shape; no regen commit needed |
| f | `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE apps/mobile/Patina/scripts/ios-gate.sh all` | **PASS** — exit 0; `** BUILD SUCCEEDED **`; `Test run with **2467 tests in 271 suites** passed after 8.577 seconds with 2 known issues`; `** TEST SUCCEEDED **`; `✓ lint-delta: no new warnings in touched files` |

2436 tests in 265 suites at the walk-fix pass, **2467 in 271** now. The two known issues are
the same pre-existing pair: a `BrandVoiceLint` expectation on "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`. No cold-cache transient this run —
the gate returned exit 0 on its first invocation.

### The walk app is rebuilt, signed

```
xcodebuild build -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath …/apps/mobile/Patina/.build/DerivedDataWalk
  ** BUILD SUCCEEDED **
```

Signing left **ON** (no `CODE_SIGNING_ALLOWED=NO`). `codesign -dv` on the rebuilt bundle:

```
Identifier=cloud.patina.app
Format=app bundle with Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=425 flags=0x2(adhoc) hashes=3+7 location=embedded
Signature=adhoc
TeamIdentifier=not set
Sealed Resources version=2 rules=10 files=61
```

Binary stamped `2026-09-05 06:37:43`, after the close-out head's commit time
(`06:19:52`) — the bundle is this tree.

**walkAppPath** (unchanged path, ready to re-install on `cae-w1-walk`
`29E64516-9C2F-4D77-95D8-55D7B61E017B`):
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

### Deploy set — recomputed over the whole diff `6600cc069...HEAD`

**Migrations above 00567** (apply first):

- `supabase/migrations/00568_decision_first_notice_dispatch.sql`

**Edge functions — 28.** Six `_shared` modules changed (`branded-email.ts`,
`client-portal-links.ts`, `decision-notify.ts`, `invoice-emails.ts`,
`project-approval-notification.ts`, `studio-identity.ts`); four more are dragged in by the
transitive closure inside `_shared` (`fulfillment-templates.ts`, `po-emails.ts`,
`quote-request-emails.ts`, `trade-rfq-emails.ts`). Every function importing one of those ten,
union every function dir whose own code changed. All 28 carry an `index.ts` and are real deploy
targets.

```
apns-send                   campaign-dispatch           client-invite
commercial-document-notify  comms-notification-dispatch create-checkout-session
decision-first-notice       decision-reminders          decision-resolved-notify
digest-dispatcher           expire-decisions            fulfillment-notify
invoice-check-intent        invoice-reminders           invoice-send
morning-brief               notification-digest         notification-dispatch
po-send                     proposal-nudge              proposal-send
proposal-sign-confirmation  quote-request-send          review-requests
spec-pdf                    stripe-webhook              trade-rfq-send
waitlist-notify
```

This is the 27 of the first integration report **plus `apns-send`**, whose own `core.ts` and
`index.ts` now carry R5's `aps.badge`. `_shared` and `_tests` are excluded — neither is a
deployable function.

**Portals: `client` only.** `git diff --name-only 6600cc069...HEAD` touches
`apps/client-portal` (15 files), `apps/mobile` (60), `supabase/functions` (30), one migration,
one seed, one SQL test and ten program docs. **Zero files under `packages/` and zero under
`apps/designer-portal`** — the designer portal needs no redeploy for this wave.

**iOS:** changed (60 files under `apps/mobile/Patina`). Lands on main build-green and
sim-verified; no TestFlight cut in this wave.

**Ordering** (unchanged): `00568` first, then all 28 functions — every one bundles a copy of an
edited `_shared` module, so a partial redeploy leaves mixed copy in the mail — then the client
portal.

### Open findings carried onto the branch, by id

Nothing below blocks the merge. All of it ships with the branch.

**backend close-out (`backend-close-review-r3.md`, verdict *fix*, no blocker)** — one major
(the notification digest's own copy, which the lane names as unruled residue and which this
branch deploys), five minors, seven nits. The reviewer's own gate table is reproduced in that
file; its deploy-set recount matched this report's 28 name for name.

**iOS close-out (`ios-close-review-r3.md`, verdict *fix*, no blocker)** — three majors stand:

- **R3-01** — the record's central trade-off rests on a false invariant.
- **R3-02** — item 4's edition exclusion does not reach the Today surface.
- **R3-03** — item 9's settled title is still absent on a cold bell (third round carried).
- Minors/nits open: R3-04 (badge comment's last sentence untrue), R3-05 (two files disagree on
  what the badge counts), R3-06 (`bellClosed` is a third vocabulary), R3-07 (the opened write is
  narrower than the read it was matched to), R3-08 (W1R2-M2's name depends on a second read
  landing), R3-09 through R3-14 (source-text pins, notes misattribution, stale red comments,
  three "sign-off" strings on the legacy client-court path, the "one sentence, two surfaces"
  guarantee covering decisions only, the `State.overdue(due:)` Codable break costing a widget
  tap).

**Still open from earlier rounds, unchanged:**

- **iosb3-M2** — `list_my_project_decision_reviews` (00467:135) is project-scoped and the
  projection carries no viewer-role field, so a studio co-member signed into the client app
  gains studio-wide approvals as "waiting on you". Ruled at close: **drafts excluded now, the
  viewer-role field is a Wave 2 migration item.** The homeowner path is unaffected.
- **iosa R3-02** — the retired word on the invoice list, the invoice detail and the Studio money
  row. Ruled at close: `DateDisplay.due` reads "Past due · {date}" in body ink, never red.
- **backend R3-01 / R3-03 / R3-04** and **F4–F12** — R3-01 (the 48-hour cron announcing to the
  back catalogue) and F4–F12 are **closed by this close-out merge** (`61da87110`, `7fc0c5941`,
  `fd13b9ebb`); R3-03 (the first notice is a one-shot with no retry) is ruled **accepted for
  Wave 1, retry rides with P-28 in Wave 3**; R3-04's city is now resolved profile → org address
  → omitted (`f932a6533`), with `proposal-send` ruled cityless until its dispatch snapshot is
  widened.
- **web** — W1W-02, W1W-06, W1W-07, W1W-08, F-01, F-02, F-05, all minors, all unchanged.
- `DecisionListView.emptyView` still draws `checkmark.circle` beside "Nothing waiting on you" —
  the last checkmark on this rail, worth a look in W2.

### Advisories

- **Two pre-existing Deno reds in `_tests/`** — `fulfillment-po` (a `TS2345` on
  `encodeBase64(Uint8Array)`) and `stripe-rail` (needs a live `SUPABASE_SERVICE_ROLE_KEY`).
  Both files are byte-identical to `6600cc069`. Neither is in this wave's deploy set.
- **`apns-send` is new to the deploy set** and it is the function that makes R5's springboard
  badge real. Deploying `00568` without it, or the portal without it, leaves the badge frozen
  exactly as the walk found it.
