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
