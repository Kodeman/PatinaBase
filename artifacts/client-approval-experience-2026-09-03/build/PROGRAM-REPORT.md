# The Decision, Delivered — closing record

The client approval experience. Built and shipped 2026-09-04 → 2026-09-06 across three waves
against `rulings-2026-09-04.md`'s sixteen rulings and the 30-proposal build sheet. All three waves
are live on Strata and Cloudflare Workers as of this record.

## 1. What shipped

### Wave 1 — the floor (merge `107549568`, deployed 2026-09-05)

P-01 the door in the email · P-02 a first notice that reads like one · P-03 the studio signs the
mail · P-04 quiet overdue · P-05 one count, not two · P-06 push that keeps the primer's promise ·
P-07 the toggle that tells the truth · P-08 the link that survives sign-in · P-09 iOS learns
Stage-2's vocabulary · P-10 end the waiting dead end · P-11 household names, not "Designer"
(reduced — no partner login) · P-12 obligations read as obligations. Plus P-24's iOS tab-badge
removal and the web's residual counts.

Deploy: migration `00568_decision_first_notice_dispatch.sql`; 28 edge functions (every importer of
the six touched `_shared` modules, headed by `decision-first-notice` at version 1); client portal
only — Worker version `ed397151-a364-42fc-a3bd-088b4e72ebca`, created 2026-09-05T12:45:57Z. iOS
changes landed on main build-green; no TestFlight cut this wave.

### Wave 2 — the ceremony (merge `42d9057e4`, deployed 2026-09-05)

P-13 the designer's one-line why · P-14 the artifact shown, ask in her hand · P-15 the weighing
becomes a sentence · P-16 three doors, three stamps · P-17 eleven states, one stamp · P-18 the act,
ranked and held · P-19 the seal and the act, full screen on iOS · P-20 the approval receipt ·
P-21 the line resumes, the afterglow row · P-22 the lock screen as the first frame (built without
the Notification Service Extension).

Deploy: migration `00569_approval_why_viewer_role_and_receipt.sql`; 6 edge functions (`apns-send`,
`decision-first-notice`, `decision-reminders`, `decision-resolved-notify`, `expire-decisions`,
`notification-digest`); client portal — Worker `c64e78bc-32e0-4896-86d9-d781a96f6b37`, created
2026-09-05T23:16:59Z; designer portal — Worker `c0937064-91c1-45b5-9187-48dd976e09c7`, created
2026-09-05T23:20:26Z (built against exported `wrangler.jsonc` vars after `.env.local` was found
pointed at local by a peer program).

### Wave 3 — the habit (merge `43804dba0`, deployed 2026-09-06)

P-26 the Record of Decision · P-27 the successor read as one thread · P-28 she sets the pace ·
P-30 the decision spread. Plus the P-24 numerals-to-words sweep residue.

Deploy: migrations `00572_she_sets_the_pace.sql` and `00573_approval_record_typed_name.sql`; 6 edge
functions (`decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
`expire-decisions`, `notification-digest`, `proposal-nudge`); client portal — Worker
`78ce6497-324e-4c29-976d-305b993180bc`, created 2026-09-06T07:20:31Z; designer portal — Worker
`090b5c5e-82bb-4141-b6a5-4a32126d4221`, created 2026-09-06T07:23:13Z. `00572` also rescheduled
four pg_cron jobs: `decision-reminders-hourly` and `notification-digest-hourly` replace two retired
dailies; `client-push-window-release` and `decision-first-notice-retry-sweep` are new.
`notification-digest-hourly` was observed firing at its first boundary (07:20:00Z) and sending no
mail — the intended behavior.

## 2. What was ruled

R1 typed legal name + press-and-hold everywhere, review leg keeps `portal_clickthrough`. R2 drawn
signatures closed permanently. R3 household, not internal reviewers; no partner login this program.
R4 no login-less door. R5 keep the springboard badge, retire web/iOS in-product badges. R6 SHA-256
leaves the email, edition-and-date line instead; twelve characters survive on the printed Record.
R7 the studio signs client mail. R8 "Still open, {Designer} asked on {date}" replaces overdue; HELD
stays; lock screen never warns. R9 the receipt names the real consequence or stays silent; no
read-time watch. R10 no DB constraint on the change note; web requires it, iOS encourages it. R11
cost/schedule/lead-time stated independently, with a baseline beside cost where one exists. R12
superseded by the Threshold cutover — see P-23 below. R13 SIGNED moves to mocha; terracotta survives
once as Declined. R14 ceremony as shared components mounted by both rails. R15 iOS carries the full
ceremony; widget untouched. R16 Patina goes quiet after the overdue notice; push honors 8am–8pm.

Re-rulings forced by the Threshold cutover (2026-09-04): P-25 obsolete (inline ceremony already
exists); P-23 deferred (its flag mechanism no longer exists); P-29 deferred; P-22 built without the
NSE; P-24 narrowed to three counts + the iOS tab badge; P-11 reduced (no household co-author to
name); P-04's "gate" removal widened to three more files; P-26 follows the print-carve-out
precedent; P-16's two `changes_requested` words reconciled to RETURNED; P-13 narrowed to a nullable
`why` column.

Later rulings: springboard badge made real via `aps.badge`; first-notice retry accepted one-shot
for W1, riding with P-28 in W3; city resolves profile → org address → omitted; "Overdue" retired to
"Past due · {date}" everywhere; Wave 2 folded to one migration, `00569`; sign consent only on
Approve, Return/Hold are press-and-hold only; the why is attributed to its frozen author;
SIGNED/APPROVED ink moves to mocha across Desk, Record and client mirror;
`client_consent_method='click_through'` (the schema's word, not the ruling's `portal_clickthrough`);
the maker's mark stays off the on-screen plate, printed copy only; the seal sentence names the
studio, never a person; the Studio hub counts Stage-2 approvals through the shared projection.

## 3. What was deferred or cut

- **P-23** (the letter arrives closed) — deferred, not built. R12 depended on a flag and a
  measurement the Threshold cutover removed; no live clients to measure against yet.
- **P-25** (ceremony inside The Making) — obsolete. The Threshold already hosts the ceremony inline.
- **P-29** (loop in a household member) — deferred. Greenfield auth/RLS, the largest and riskiest
  item; R3 rules against shipping a co-approver in the next twelve months.
- **P-22's Notification Service Extension** — deferred. Categories, thread/collapse ids and the
  AppDelegate wiring shipped; the image-attachment extension needs its own provisioning/archive.
- **R11's cost baseline** — never rendered; no projection carries `costBaselineCents` (W2-n3).
- **P-24 residue** — some surfaces still print numerals beside words that spell counts (proposals
  list headers, Studio hub profile stats); ruled a standing sweep item, not a blocker.

## 4. Evidence — final gate state per wave

| Wave | Client jest | Designer jest | Deno `_shared` | SQL tests | iOS tests | e2e | Walk rounds → verdict |
|---|---|---|---|---|---|---|---|
| 1 | 116 suites / 1546 tests | untouched this wave | 190 passed | 156/156 effective | 2467 tests, 271 suites, 2 known issues | n/a | 3 rounds → all closed, ship |
| 2 | 119 suites / 1683 tests | 512 suites / 6134 tests | 204 passed | 157/157 effective | 2639 tests, 285 suites, 2 known issues | 27 passed, 2 pre-existing (`--workers=1`) | 4 rounds (iOS 3, web 4) → both majors closed, ship |
| 3 | 123 suites / 1841 tests | 515 suites / 6174 tests | 284 passed (`_shared`) | 159/159 effective | 2726 tests, 291 suites, 2 known issues | 26 passed, 2 pre-existing + 1 TZ artifact (green under `TZ=UTC`) | 3 rounds → ship, no blocker/major |

The recurring "2 known issues" pair (`BrandVoiceLint` "curated_mix",
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`) is pre-existing, unrelated to this program.

## 5. Open items owed

**iOS** — `iosd4-m1`…`m8` (six minors) and eleven nits carried from Wave 2's iOS-D lane, aging;
`IOSC-R3-03`…`07` (empty/loading thread indistinguishable, discussion heading not announced, no
standing-line counterpart, stale header comment, studio reader attributed as studio); cross-surface
clay-ink token divergence (`#82612F` iOS vs `#7C5E30` web), accepted as a nit; `W3R3-n1` (the Studio
hub header hint is not held to the same load-honesty as its sections); `W3R3-n2` (numerals on
profile stats and the Companion sheet, outside the approval rail).

**Web** — `W2B-R3-01`…`06` (a reader with no doors still told she is approving; a draft's standing
line contradicts the sentence under it; the "in the client's court" predicate ignores the chair;
click-guard has a pointer tail, no key tail; a stale reference to the deleted `00570` migration; an
author with no why signs the bare question); `W2C-03` (`--text-subtle` substituted, unrecorded);
`W2-n1` (the weighing sentence spells to twenty, then prints figures); `W2-n2` (the door's four
non-signing acts carry identical weight); `W2-n4` (the why is signed with a given name, not display
name); `W3W-R2-n1` (two Records of Decision on one artifact edition print the same twelve-character
mark); `W3W-R2-n2` (the four Remind-me acts carry no `aria-pressed`, deliberate); `W3W-R3-01` (the
undated-approval branch is dead code — `dueAt` is non-nullable everywhere upstream — and the parser
is all-or-nothing, so one malformed row would blank the whole doorstep).

**Backend/email** — `b4-01` (an inherited why can be re-attributed to whoever reissued it) and
`b4-n2`…`n4`; designer `I-01`/`I-02` (the frozen why vanishes on settle; the pigment sweep stops
short of four marks on one Document) and `I-03`/`I-04`; `n-R3-05` (the digest's already-mailed
check still has no `ORDER BY`, shrunk to a 24-hour window rather than closed).

**Not verified in production** (consistent across all three deploy reports): no signed-in walk on
any portal — every probe was anonymous, so the ceremony itself was never seen rendered by a logged-
in eye; the new RPC arguments and columns (`why`, `viewerRole`, `clientConsentMethod`, cadence,
snoozes) were never round-tripped against Strata, only proved to exist at the right signature; five
of six edge functions per wave were verified only by version increment; no `wrangler tail` was run;
custom-domain routing was not re-verified (dashboard-managed, out of band); iOS shipped nothing to
TestFlight in any wave; `apps/designer-portal/.env.local` is still pointed at local from a peer
program's walk setup, so a future designer deploy needs the same `wrangler.jsonc` var export or
hits the preflight refusal; three of Wave 3's four rescheduled cron jobs were not observed firing
(only `notification-digest-hourly` was); `backfill_why_author_display_names()`'s effect on existing
rows was not probed.

## 6. TestFlight

Build **1.0 (4)** was archived from main at 43804dba0 (plus the version bump), exported with
`aps-environment = production`, and uploaded on 2026-09-06 at 00:25 Pacific. App Store Connect
build id `f48dd9b8-be03-4ea9-b508-35e6bef3f455`, processingState VALID, minimum iOS 26.0,
encryption exempt. IPA sha256 `f63623ebd6d493c6a85327318070782cfae554e6b3f73a56e145ac9033a874ea`.
What to Test (en-US, 1,505 characters) describes the approval ceremony, the stamps, the seal,
Keep a copy, the decision spread, the pace controls and the lock-screen actions. The Internal
Patina group has the build automatically; the external group still lists build 3.

Not done, deliberately: no beta-review submission, no external group, no App Store metadata
change, and no device pass — the build's claim level is compile-green plus processed-VALID; every
ceremony claim rests on the simulator walks, not on glass. Those remain Kody's steps (see
`testflight-build-4.md`).

Fresh-worktree trap for the next iOS archive: `Patina/Generated/GitCommit.swift` is gitignored
and written by a build phase, so the first Release build in a new worktree fails with
"cannot find 'GitCommit' in scope" and the immediate rerun passes.

## 7. Harness lessons

- **Sandbox.** Every `xcodebuild` must run unsandboxed — sandboxed runs fail with
  `permissionDenied`/`CoreSimulatorService connection refused`; Playwright cannot launch chromium
  sandboxed either.
- **Admin-portal build.** `pnpm --filter @patina/admin-portal build` can exit 0 under the sandbox
  while writing no `.next/BUILD_ID` — a false green; run it unsandboxed.
- **xcbeautify hides errors.** The iOS gate pipes `xcodebuild` through it, which can render a
  `BUILD FAILED` with zero `error:` lines on a cold-cache flake; tee the raw log to diagnose.
- **Prettier has no repo config.** `--write` reformats whole single-quoted files to its default;
  never run it to "fix" the pre-commit hook's advisory drift warning.
- **e2e against a dev server isn't parallel-safe.** `fullyParallel: true` against one Next dev
  server produces `ChunkLoadError` timeouts with different failing specs each run; `--workers=1` is
  the honest reading.
- **Generated `.next/types` shim.** A stale gitignored shim fails `type-check` on an unrelated
  `PageProps` error — recurred identically in all three wave deploys; check for a live `next dev`
  first, then `rm -rf .next/types`.
- **DB-vs-host clock.** A test computing an expected date in the host's zone against a seed
  computed with `CURRENT_DATE` in the DB's UTC goes red across midnight on a correct page; pin
  `TZ=UTC` or read the day from the DB.
- **Peer contention on the shared local stack.** Concurrent programs reset the same stack, ran
  their own `next dev` on the same ports, and re-seeded fixtures mid-walk; scope every gate to its
  own worktree (`pnpm --dir <worktree>`, never a bare `cd`) and treat "last write wins" as expected.
- **Lane logs are gitignored** (`build/`); force-added (`git add -f`) each wave so the record
  travels with the code.
