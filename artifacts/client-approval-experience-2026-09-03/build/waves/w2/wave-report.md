# Wave 2 — "The Decision, Delivered": the ceremony · integration report

Branch **`approvals/w2-integration`**, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`.
Integration sha at report time: **`6e7b69750`**. Base: `origin/main` = **`36b4b539e`**.

This wave was integrated across two stewards. The first merged all five lanes and folded the
migration, then was stopped mid-pass to hand the shared local stack to a peer program. The
second (this report) resumed at the migration verification and carried the branch through every
gate. Nothing was re-merged; nothing was recreated.

---

## 1 · The merges

Five lanes, merged in order onto the base. Read straight off `git log --merges`:

| # | Commit | Lane | Diffstat |
|---|---|---|---|
| 1 | `0eb19e0f2` | `chore(approvals): merge w2-backend` | 24 files, +5808 / −74 |
| 2 | `e0330a013` | `chore(approvals): merge w2-designer` | 26 files, +3003 / −19 |
| 3 | `60353bd5b` | `chore(approvals): merge w2-web` | 39 files, +5607 / −323 |
| 4 | `0dcac83e0` | `chore(approvals): merge w2-iosc` | 39 files, +5381 / −305 |
| 5 | `bd96b6956` | `chore(approvals): merge w2-iosd` | 26 files, +4611 / −78 |

Then, on top: `10d014ec6` (the fold), `2d436f359` (designer clock freeze), `6e7b69750`
(client e2e truth-up).

### Conflicts the first steward resolved

Three of the five merges were clean. Two carried conflicts, and both were resolved as a
**union** — each lane's contribution kept, neither side dropped. Verified by diffing the merge
result against *both* parents.

**`60353bd5b` (w2-web) — 3 files**

- `packages/supabase/src/hooks/use-project-approvals.ts` — the wave's one genuinely contested
  file. The designer lane added `why?` / `whyAuthorName?` **above** `context`; the web lane added
  `viewerRole` **below** it, plus the `oneLineWhy()` newline-stripper on the create and supersede
  paths. The merged file carries all four (lines 66, 76, 79, 612, 764) and type-checks.
- `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts` — both lanes' cases kept.
- `apps/designer-portal/src/components/document/approvals/project-approval-document.test.tsx` —
  same shape.

**`bd96b6956` (w2-iosd) — 4 files**

- `ProjectApprovalCopy.swift` — the big one (+39 over the iOS-C side, +97 over the iOS-D side),
  resolved exactly as iOS-D's round-2 note directed: iOS-C's `acts`, signature/note copy and
  `stamp(for:)`; iOS-D's `recorded(_:thing:)`, `unnamedEdition`, `artifactNoun(kind:)`.
- `DecisionsAPIClient+ProjectApprovals.swift`, `DecisionListView.swift`,
  `WalkCASAndFeedTests.swift` — each takes lines from both sides.

---

## 2 · The migration fold

Ruled: **one migration for Wave 2, `00569`.**

- `00569_approval_why_viewer_role_and_receipt.sql` is the single Wave-2 migration. It already
  carried the web lane's wrapper keys when this steward resumed — `clientConsentMethod` and
  `clientSignature` appear in the `respond_project_approval` wrapper body at lines 1398–1399 and
  are validated at 1683–1698. **No graft was needed.**
- `00570_approval_response_signature.sql` — **deleted** (`10d014ec6`). The peer program keeps its
  own 00570; Wave 3 mints from 00571.
- The iOS-C lane's duplicate `00569_stage2_outcome_signature_payload.sql` was already deleted by
  the lane itself in `92ee2068f`, before integration. Not present on the branch.
- **No renumber was required.** `origin/main`'s highest migration is `00568_decision_first_notice_dispatch.sql`
  — no peer migration landed above 00568 during the wave, so our 00569 keeps its number.

Applied ledger after reset reads `00569, 00568, 00567, 00566, 00565`.

---

## 3 · Gates

Every gate below was run by this steward from the integration worktree.

| Gate | Result |
|---|---|
| `@patina/client-portal` type-check | **PASS** (clean `tsc --noEmit`) |
| `@patina/client-portal` test | **PASS** — 119 suites, 1669 tests |
| `@patina/designer-portal` type-check | **PASS** |
| `@patina/designer-portal` lint | **2 errors, 203 warnings** — both errors pre-existing, see below |
| `@patina/designer-portal` test (full jest) | **PASS** — 512 suites, 6134 tests, 1 snapshot |
| `@patina/supabase` type-check | **PASS** |
| `@patina/admin-portal` build | **PASS** — full route table emitted |
| deno test `_shared/` | **PASS** — 204 passed, 0 failed |
| deno test touched `_tests/` | **PASS** — 42 passed, 0 failed |
| deno check, 5 touched `index.ts` | **PASS** — all five clean |
| root `deno.lock` | **absent** (correct) |
| `supabase db reset` | **exit 0**, ledger tops out at 00569 |
| `scripts/run-sql-tests.sh` | **PASS** — 157/157 effective green, **0 unexpected failures** |
| `database.types.ts` regen | **no drift** — regenerated against the local DB, zero diff |
| iOS gate `all` (build · unit · lint-delta) | **PASS** — see below |
| client-portal e2e | **PASS** — 27 passed, only the 2 named pre-existing failures |

### The two designer lint errors (pre-existing — reported, not fixed)

Both are in test files and both are on `main`:

- `src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159` — `Definition for rule
  'import/first' was not found` (`import/first`).
- `src/hooks/__tests__/use-commercial-documents.test.ts:930` — `react-hooks/rules-of-hooks`, a
  hook called inside `mutationFnOf`.

### iOS

`IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh all`

- **First run failed spuriously** (`exit 65`) on a cold-cache first build in the fresh worktree —
  exactly the failure mode `env.md` warns about. The gate pipes xcodebuild through `xcbeautify`,
  which swallowed the diagnostic entirely: 32 lines of log with **no `error:` line at all**, only
  a failed `SwiftCompile` batch. A raw `xcodebuild` rerun of the same invocation returned
  **`** BUILD SUCCEEDED **`** with zero errors, confirming the flake.
- **Second gate run:** build **SUCCEEDED**; unit ran **2608 tests in 281 suites**, failing only
  `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` — the load flake named
  in the brief and in iOS-D's own R4 note. Re-run in isolation: **21 tests, exit 0, TEST SUCCEEDED**.
- `lint-delta` never ran inside `all` (the tier aborts on the unit failure), so it was run
  separately against `origin/main`: **`✓ lint-delta: no new warnings in touched files`**.

### Client e2e — what the first full run actually showed

The configured suite runs `fullyParallel: true` against **one** Next **dev** server. Under that
load the dev server fails to serve its own chunks —

```
Uncaught ChunkLoadError: Loading chunk app/layout failed.
(timeout: http://localhost:3002/_next/static/chunks/app/layout.js)
```

— which lands as a 60s `waitForURL` timeout inside `signIn()` and cascades through the whole
`threshold.spec.ts` file. Parallel runs produced 7 and then 9 failures with *different members
each time*; the same specs pass serially. **`--workers=1` is the honest reading of this gate**,
and at `--workers=1` the suite is:

**27 passed · 2 failed — `plans-link.spec.ts:190` and `share-link.spec.ts:114`, the two
pre-existing setup failures named in the brief.** Nothing else fails.

Two specs did need fixing, and both were genuine (committed as `6e7b69750`):

1. **`stands the acceptance ask on the wall`** — a real Wave-2 seam. `wall-gate.tsx:271` now
   holds the act `disabled={!signatureIsComplete(signedName)}` per **R1** ("typed legal name plus
   a scored press-and-hold"). The e2e was unchanged from `main` and still asserted
   `toBeEnabled()` on an empty line. The web lane updated its unit test (`wall-gate.test.tsx`,
   +94) but not the e2e that covers the same act. Now asserts the ruled behaviour: unlit, then
   armed once "Nora Ellison" is on the line. The act is **still never pressed** — accepting is
   irreversible and would take `HELD_DRAW` off the fixture for every later run.
2. **`prints the five facts the seed put in the house`** — expected `"September 11"` against a
   seed that dates the invoice `CURRENT_DATE + 7` (`the-client-page.sql:621`). True only on the
   day it was written; red every morning after. Now derived from the same rule the seed uses.
   This is the same defect class as the ruled `client-note-composer` clock freeze.

---

## 4 · Deploy set (`origin/main...HEAD`)

**Migrations** — one, as ruled:

- `00569_approval_why_viewer_role_and_receipt.sql`

**Edge functions** — the transitive closure of importers of every changed `_shared` module, unioned
with the changed function dirs. Changed shared modules: `_shared/decision-notify.ts`,
`_shared/project-approval-notification.ts`.

| Function | Why it is in the set |
|---|---|
| `apns-send` | changed dir (`core.ts` +141, `index.ts` +68) |
| `decision-first-notice` | changed dir · imports both shared modules |
| `decision-reminders` | changed dir · imports both (`index.ts` + `logic.ts`) |
| `decision-resolved-notify` | changed dir · imports both |
| `expire-decisions` | changed dir · imports both |
| `notification-digest` | **importer only** — `index.ts:39` imports `project-approval-notification.ts`; `logic.ts:12` type-imports `decision-notify.ts` |

**Six functions.** `invoice-reminders` was checked and **excluded**: its only mention of
`decision-notify` is a prose comment at `index.ts:4` explaining why it is *exempt* from that
cadence — there is no import. `apns-send/core.ts` has no importer outside its own dir except
`_tests/`.

**Portals** — `client-portal` and `designer-portal`.

Deploy order is load-bearing (backend `b4-n1`): migrations → edge functions → portals.

---

## 5 · Walk prep

- **walkAppPath** (Debug, simulator, signing left ON — `codesign -dv`: `Identifier=cloud.patina.app`,
  `Signature=adhoc`, universal x86_64 + arm64):

  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

- Walk simulator remains `cae-w1-walk` — `29E64516-9C2F-4D77-95D8-55D7B61E017B`.
- **`web-walk-env.md`** written beside this report: the three `webServer.env` variables the client
  portal dev server needs, how to read the two keys out of `supabase status -o env` without
  writing them down, the seeded homeowner (**Nora Ellison**, `client-solo@patina.dev` /
  `password123`, Cedar Lane Study `b0000000-…-00000000c0d1`), the five seeded figures, and how to
  reach the wall.

---

## 6 · Open findings carried onto the branch

None of this blocks the merge; all of it ships with the branch. Ids are from each lane's **last**
review.

### backend — `backend-review-r4.md`, verdict **ship**

- `b4-01` (minor) — an inherited why can be re-attributed to whoever reissued it.
- Nits: `b4-n1` (deploy order is load-bearing and its cost is permanent), `b4-n2` (the ask letter
  now carries two names), `b4-n3` (a doc overclaim about the springboard number), `b4-n4` (a stray
  blank line in the supersede graft).
- R3's `B1`, `B2`, `B3`, `m1` all fixed and re-proven; `n3` closed by `B2`.

### designer — `designer-review-r5.md`, verdict **ship**

- `I-01` (minor, 0.85) — the frozen why vanishes the moment the approval settles.
- `I-02` (minor, 0.6) — the pigment sweep stops short of four approval-shaped marks on one Document.
- `I-03` (nit, 0.9) — the cap is 200; the build sheet says ~140.
- `I-04` (nit, 0.9) — rotation agrees across the wave; aging does not (restates `H-10`).
- Twelve carried minors/nits still open, none regressed. `H-01` fixed and pinned by a new test.

### web stage A — `web-A-review-r3.md`, verdict **fix**

- **`W2C-01` (major) — CLOSED BY THIS INTEGRATION.** It *was* the cross-lane collision on
  `use-project-approvals.ts`: two lanes fixing the same missing field in the same unowned file in
  non-overlapping hunks. The merge kept both sides; `@patina/supabase` type-check and both portal
  suites are green over the union.
- **`W2C-02` (minor) — CLOSED ON THE MERGED TREE.** The client surface no longer signs the why
  with the project's lead designer: `approval-ask.tsx:229` reads the frozen `whyAuthorName` and
  signs "by its author or by nobody", which is the 2026-09-05 ruling exactly. The
  `lead_designer` lookup in `threshold.tsx:528` feeds unrelated "your designer" copy.
- `W2C-03` (nit) — `withdrawn`/`superseded`/`expired` take `--text-muted` for the border where
  ux/02 §5 rules `--text-subtle`; that token does not exist in the client portal, so the
  substitution is forced but unrecorded.

### web stage B — `web-B-review-r3.md`, verdict **fix** (no blocker, no major)

- `W2B-R3-01` (minor, 0.95) — a reader with no doors is still told SHE is approving the edition.
- `W2B-R3-02` (minor, 0.85) — on a draft, the new standing line contradicts the sentence under it.
- `W2B-R3-03` (minor, 0.9) — the chair stops at the ask; the shared "in the client's court"
  predicate still ignores it.
- `W2B-R3-04` (minor, 0.5) — the click guard has a pointer tail and no key tail.
- `W2B-R3-05` (nit, 0.9) — the code names a migration the ruling deletes. **Worth a sweep before
  ship:** the ruling deleted 00570 and this branch did too, so any surviving reference is now stale.
- `W2B-R3-06` (nit, 0.9) — an author with no why signs the bare question.

### iOS-C — `iosc-review-r3.md`, verdict **ship**

- `IOSC-R3-01` (minor) — the red "Expired" line survives two lines from the badge P-17 just retired.
  **Touches a vision refusal (no red status); worth a ruling.**
- `IOSC-R3-02` (minor) — the discussion is the one thing pull-to-refresh does not refresh.
- `IOSC-R3-03` … `IOSC-R3-07` (nits) — empty-vs-loading thread look identical; the discussion
  heading is not a heading and its failure is not announced; no iOS counterpart to the web's
  standing line; a stale header comment; a studio reader and the homeowner both attributed as the
  studio.
- R2's two majors (`IOSC-R2-01` write-only change note, `IOSC-R2-02` muted stamp contrast) both
  genuinely fixed; `IOSC-R2-06` closed.

### iOS-D — `iosd-review-r4.md`, verdict **fix** — **four majors stand**

These are the largest open items in the wave and the ones most likely to need a ruling before ship:

- **`iosd4-M1`** — the afterglow rows draw on the widget, and round 3's mitigation is false. **No
  flag gates it, so it ships the moment iOS-D lands.** The reviewer asks for a ruling *before* merge.
- **`iosd4-M2`** — the Studio subhead prints figures where its own sibling prints words. Two lines;
  cheapest major on the board.
- **`iosd4-M3`** — Today's own approval prompt carries a figure, the wrong noun, and a checkmark as
  status. **Three vision refusals at once**; needs a scope call on whether `TodayExperience` is
  inside this lane.
- **`iosd4-M4`** — P-21's row still carries no stamp MARK, three rounds on. Now that iOS-C and
  iOS-D are on one tree, `PatinaStamp` can be wired in — or the word-only row recorded as ruled.
- Minors `iosd4-m1` … `iosd4-m8` (six of them carried and aging), plus eleven nits.
- Round 3's `iosd3-M1` (hub said Approvals, screen said DECISIONS) is closed.

---

## 7 · Advisories

None of these blocked the pass.

1. **The iOS gate hides its own errors.** `run_xcb` pipes xcodebuild through `xcbeautify`, and on
   this failure the pretty-printer emitted a 32-line log with **no `error:` line at all** — a
   `BUILD FAILED` with no diagnostic. Diagnosing the cold-cache flake required re-running raw
   xcodebuild. Worth teeing the raw log.
2. **`pnpm --filter @patina/admin-portal build` silently produced nothing under the sandbox** —
   exit **0**, but no `.next/BUILD_ID` and a 372-byte log ending at "Creating an optimized
   production build …". Re-run unsandboxed it completed and emitted the full route table. A
   sandboxed Next build that reports success while writing no artifacts is a false green; every
   admin-portal build gate should run unsandboxed.
3. **`deno test _tests/` cannot be run whole.** It fails type-checking on
   `fulfillment-po/core.ts:314` (`TS2345`, `Uint8Array` vs `string | ArrayBuffer`) — an
   **untouched** function, byte-identical on `origin/main`, so pre-existing and not ours. The two
   touched test files were run by name instead (42 passed).
4. **`threshold.spec.ts` is not parallel-safe against a dev server**, per §3. Left as-is
   (fixing it is a config change outside this wave), but any future reading of this gate should
   use `--workers=1` or it will report failures that are not there.
5. **The repo has no Prettier config.** `npx prettier --write` therefore applies the double-quote
   default against a single-quoted codebase and reformats whole files. The pre-commit hook's
   "formatting drift" line is advisory for exactly this reason — do not "fix" it by running
   Prettier, which is why `6e7b69750` was committed `--no-verify` with a 19/3 diff rather than the
   206/124 whole-file rewrite Prettier wanted.
6. **The secret-scanner did not trip** on `apns-send/core.ts`'s PEM framing this pass; the only
   `--no-verify` commit was the Prettier case above.
7. **Not done here, by rule:** nothing was pushed, no production mutation was run, and
   `stack-reset-notice.md` was appended before the reset (mirrored into the main checkout so the
   other lanes see it).

---

## 8 · Carry fixes (integration, 2026-09-05)

The seven cross-lane items that only made sense once every lane was on one tree. Four commits on
`approvals/w2-integration`, each with explicit pathspecs, none pushed.

| # | Item | Commit | State |
|---|---|---|---|
| 1 | P-13's why on iOS | `c8f1edce4` | FIXED |
| 2 | `IOSC-R2-07` — the acts ask who is reading | `c8f1edce4` | FIXED |
| 3 | `iosd4-M1` / R15 — the afterglow off the widget | `d1eeb7aaf` | FIXED |
| 4 | `iosd4-M2` / `M3` / `M4`, `iosd3-M1` carry | `f0b7c0486` | FIXED |
| 4 | `IOSC-R2-01`, `IOSC-R2-02` | — | ALREADY CLOSED in the lane (`14a6cf857`, `476b0c50b`); re-verified, no change |
| 5 | `H-01` (client mirror's answered mark) | — | ALREADY CLOSED in the lane (`223d144de`); re-verified, no change |
| 5 | `W2B-R2-02` — the assistive path | `aa5fbbe72` | CONFIRMED NOT INVERTED; three jsdom tests added |
| 6 | `B1` — the why signed by its frozen author | — | ALREADY CLOSED in the lane (`459de403b`); Deno tests exist and pass |

### 1 · The frozen why now reaches the phone — and **H-14 is a false alarm**

The item allowed for widening 00569 if only `get_project_decision_reviews` emitted the two keys.
**It did not need widening, and 00569 is untouched.** Both client-facing reads delegate their
serialization to the plural projection that 00569 redefines:

- `list_my_project_decision_reviews()` (00467:135) is a `CROSS JOIN LATERAL
  jsonb_array_elements(public.get_project_decision_reviews(authorized_project.project_id))`;
- `get_project_decision_review(uuid)` (00467:101) → `app_private.project_decision_review_for_actor`
  (00467:44), which selects the matching element out of the same call.

Neither is redefined by any migration after 00467 (`grep -rn` over `supabase/migrations`: one hit
each, plus a comment in 00569), so 00569's `why` / `whyAuthorName` / `viewerRole` reach all three
reads. Confirmed against the running local Postgres as well —
`position('get_project_decision_reviews' in pg_get_functiondef(oid)) > 0` is true for
`list_my_project_decision_reviews` and for `app_private.project_decision_review_for_actor`.
**H-14 (designer r4/r5) can be closed as read-through rather than carried into Wave 3**, and the
wave report's "P-13 lands on web + designer only" line is superseded: it lands on iOS too.

What changed is the phone. `RemoteProjectApprovalReview` decodes `why` and `whyAuthorName`
(optional, so an approval composed before 00569 decodes as before) and exposes `designerWhy` /
`designerWhyAuthor`, which trim and withhold a name that has no sentence over it —
`approval-ask.tsx`'s `whyOf` / `whyAuthorOf` reading, ported. `ProjectApprovalBlock` draws
`ApprovalWhyLine` between the question and the edition line: the web's own order, `— {name}` in
`ProjectApprovalCopy.whyAttribution` (em dash, muted), with the identifiers
`decisionDetail.approval.why` and `.whyAuthor` for the walk.

### 2 · `IOSC-R2-07` — four legs, not two

`respond_project_approval` and `confirm_project_decision_review` accept the frozen decision lead
and nobody else, so every act leg now reads `review.viewerAnswers` beside its own condition: the
three doors, the review hold, the review-unavailable line (it says "your designer has to send it
again" to somebody who IS the designer), and the immutability sentence — whose own comment already
ruled it "exactly `outcomeLeg`'s guard", and which otherwise would have told a studio co-member she
was approving edition 3. `viewerAnswers` default-INCLUDES an absent or unknown role, so no
homeowner loses her doors to a projection this build cannot read.

Two existing source pins named the old conditions verbatim (`HoldToActTests`,
`WalkCASAndFeedTests`); both were updated to the new ones rather than loosened.

### 3 · `iosd4-M1` — R15 holds

`WidgetSnapshot.init(record:…)` drops `row.kind.isOwnAct` before it maps a route, so
`decisionAnswered` and `proposalSigned` never reach the payload. The subtraction is the kind's own
predicate, not a list of ids, so a later own-act kind is off the widget the day it is added. Three
tests: the mixed record, the record that is nothing but her own acts (projects empty), and the
predicate itself.

### 4 · The four M-items and the carry

- **`iosd4-M2`** — `studioHint`'s three rungs print `StudioAttentionSummary.hint`'s own sentences,
  in words: "One new conversation", "Three projects are moving". A real-value test (three projects
  → "Three projects are moving") plus a source pin that neither `\(unreadMessageCount)` nor
  `\(activeProjectCount)` survives.
- **`iosd4-M3`** — Today's move reads "Review a project approval" / "One approval is waiting on
  you." and carries **no mark at all**: `symbol` is empty and `TodayNextMoveCard` draws no tile
  rather than an empty one holding its place. (`PatinaStamp` has no SF Symbol and the awaiting
  outline is a bordered word, which does not fit a 54 pt tile — so the ruling's second option was
  taken.) The two strings are now inside `ApprovalVocabularySweepTests.noRefusedWords`, the digit
  and refused-word sweep that never reached them.
- **`iosd4-M4`** — the afterglow row carries `stamp`, the raw word of the `PatinaStamp.State` that
  `ProjectApprovalCopy.stamp(for:)` gives its outcome (`.signed` for a proposal she signed here),
  and `HouseRecordRowView` draws the mark beside the sentence — stacked, because a mark, a date and
  a full sentence do not share a 375 pt line. It is a string on the row so a snapshot written by a
  later build draws no mark rather than costing the record a row; the field round-trips through
  `Codable`, `markingNew` and `asStandingCondition`, all pinned.
- **`iosd3-M1` carry** — `DecisionsListViewModel.eyebrow` is the constant "Waiting on you". The
  list holds approvals AND option choices, so it is titled for what it is doing; `groupNoun` still
  titles the Studio hub row, which names one group. The mixed-list case that used to read
  DECISIONS now reads "Waiting on you" too.
- **`IOSC-R2-01`** re-verified: `ApprovalDiscussionBlock` mounts `ApprovalDiscussion`, which SELECTs
  `decision_comments` for the decision, oldest first, and attributes her own note "You · {date}".
  **`IOSC-R2-02`** re-verified: `PatinaStamp.Pigment.muted`'s ink is `4E4339` (the portals'
  `--text-muted`), not the old `8B7355`; `ContrastTests` measures it on both grounds in both
  appearances. Neither needed a change.

### 5 · Web

`H-01` re-verified: `client-mirror.tsx:154` draws the answered mark in `var(--color-mocha)` and the
file carries no sage. No change.

`W2B-R2-02` — the guard is **not** inverted. `scored-action.tsx:585-589` is
`preventDefault → unavailable/running → pointer tail → take()`, with no `isTrusted` anywhere. Three
tests added to `hold-action.test.tsx`: an activation with no pointer behind it is taken (the screen
reader / Voice Control / switch path, which the browser dispatches TRUSTED off the accessibility
API), an instant click in a pointer gesture's tail is refused (a sighted hand's click, also
trusted), and a third that reads the click handler and pins that it consults `POINTER_TAIL_MS` and
never the trust flag. **jsdom cannot forge `isTrusted`** — it is an unforgeable own property,
`configurable: false`, and `Object.defineProperty` throws (verified directly against the repo's
jsdom) — so the trusted half of the pair is pinned in the code rather than in a dispatch, and the
test says so.

### 6 · Email

`B1` was fixed in the lane and is verified here, not re-fixed: `renderDesignerNote`
(`_shared/decision-notify.ts:517`) prefers `artifact.whyAuthorName` over `cobrand.designerGivenName`
and the studio name, `project-approval-notification.ts:70` carries `why_author_name` onto the
payload only beside a why, and `decision-notify.test.ts` pins the frozen author against the live
signature across the first notice, the reminder and the overdue letter, plus the blank-name
fallback and HTML escaping. `deno test --allow-all --config supabase/functions/deno.json
supabase/functions/_shared` → **204 passed, 0 failed**; no `deno.lock` appeared.

### 7 · Gates re-run

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD…CCAE apps/mobile/Patina/scripts/ios-gate.sh all` | **PASS** — `** BUILD SUCCEEDED **`, `Test run with 2630 tests in 284 suites passed … with 2 known issues` (the two pre-existing ones: `BrandVoiceLintTests` "curated_mix", `RoomLifecycleTests.theTodayRailFollowsALocalDelete`), `✓ lint-delta: no new warnings in touched files` |
| `pnpm --filter @patina/client-portal type-check` | **PASS** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/client-portal test` | **PASS** — 119 suites, 1672 tests |
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared` | **PASS** — 204 tests |
| SQL suite | **NOT RUN, and not owed**: 00569 was not changed (see §1), so nothing was applied and the shared stack was not reset |
| designer-portal | **NOT RUN, and not owed**: no designer-portal file was touched — H-01 was already fixed on the branch |

The signed walk app was rebuilt from this worktree after the last iOS change —
`xcodebuild build -scheme Patina -configuration Debug -destination 'generic/platform=iOS Simulator'
-derivedDataPath …/.build/DerivedDataWalk` → `** BUILD SUCCEEDED **`; `codesign -dv` reads
`Identifier=cloud.patina.app`, `Signature=adhoc`. **walkAppPath**:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

### Carry advisories

1. **The shared local stack is not ours any more.** Its ledger tail reads `00571, 00568, 00567` —
   no 00569, no 00570 — so a peer program reset it from its own branch after the steward's pass.
   Nothing here needed it (no migration changed), but **the walkers must re-seed against a stack
   carrying our 00569, or reset from this worktree first** — and `00571` on another branch is worth
   a look before Wave 3 mints.
2. **H-14 should be closed, not carried** (§1). The wave report's line "P-13 lands on web +
   designer only this wave" is superseded by the delegation evidence.
3. **`ProjectApprovalBlock` is at `type_body_length` again.** The why is drawn by a file-scope
   `ApprovalWhyLine` view for that reason; the next addition to that screen needs its own file, as
   `ApprovalDiscussionBlock` did.
4. **Prettier was not run**, per the report's own advisory 5: `npx prettier --write` on
   `hold-action.test.tsx` produced a 71/68 whole-file requote against a single-quoted file, so it
   was reverted and the commit carries the hook's advisory drift line instead. No `--no-verify` was
   needed on any commit this pass; the secret scanner did not trip.
5. **`TodayNextMove.symbol` can now be empty**, and exactly one move uses that. A future move that
   forgets to set a symbol will silently draw no tile rather than crash — worth a default in the
   type if more such moves appear.

---

## Walk fixes — round 1 (2026-09-05)

Every blocker and major from the round-1 iOS and web walks, fixed on this branch. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`, branch
`approvals/w2-integration`.

### The two blockers

**`W2R1-B1` — an expired approval drew nothing at all.** A lapsed row
(`lifecycleStatus='expired'`, `disposition='active'`, published, never answered) satisfied none of
`closureLeg`'s three branches, and `outcomeLeg` withheld the doors because `canRespond` is false —
so the ceremony drew the question, the edition line and the impact block and then stopped.
`PatinaStamp.State.expired` had existed since P-17 and was mounted nowhere in the app.

- `DecisionsAPIClient+ProjectApprovals.swift` — `isLapsed`: `expired`, no disposition closure, no
  outcome. An expired row that DOES carry an answer stays an answered approval.
- `ProjectApprovalBlock.swift` — a fourth `closureLeg` branch, last in the house's own order
  (disposition → outcome → the clock).
- `ProjectApprovalCopy.expired` — "This approval closed before it was answered. Your designer can
  send it again." A fact about the paper, never about her: no "overdue", no blame, and the next
  move named because there is one (R8).
- `PatinaTests/ProjectApprovalLapseTests.swift` (new, 4 tests). It is its own file because
  `ProjectApprovalActTests.swift` is at SwiftLint's 500-line `file_length` — adding there tripped
  it at 534 lines, which `lint-delta` would have failed.

**`W2R1-B2` — the discussion read never fired, so `IOSC-R2-01` was inert.** `body` was
`content.task(id: readKey)`, and `content` is a ViewBuilder whose only branches are
"there are comments" / "the read failed". On first mount both are false, so the `.task` hung off an
unrendered empty view and never ran — the comments could therefore never become non-empty and her
own returned note was write-only on the phone, on submit, on re-entry and on a cold deep-link
launch alike.

- `ApprovalDiscussionBlock.swift` — the read is attached to a `VStack` that is always in the tree.
- `ApprovalDiscussionTests.swift` — a pin: the span between `var body` and `.task(id: readKey)`
  must contain a container, so the read can never be hung off the conditional again.

### The two iOS majors

**`W2R1-M1` — sage marking an answered state on the proposals list.** The ACCEPTED section header
took `PatinaColors.sage` (~2.2:1 as a text heading). Ruled 2026-09-05: sage stops carrying approval
meaning; SIGNED/APPROVED/answered marks move to mocha. `ProposalListView.swift` now takes
`PatinaColors.Stamp.mocha` — the same ink the stamps are held to at 4.5:1.

**`W2R1-M2` — a filled sage checkmark as status, one row from the ceremony.** The legacy
option-choice branch drew `checkmark.circle.fill` in sage over "Your choice", inside a sage-stroked
card: an icon standing in for status, a fill, and sage carrying approval meaning, all on a screen
reached from the same list as the Stage-2 ceremony. `DecisionDetailView.swift` now draws the word
alone, in mocha, and the selected card's rule is mocha too. The branch keeps its own grammar
otherwise — this is the refusal, applied, not a rewrite of the option rail.

### The four web majors

**`W1-01` — "You are approving edition N, exactly as shown." was unconditional**, and false in
three states the lead reaches: a draft with the review outstanding (the act on offer is READING),
a reviewed edition sitting with the studio, and the moment after she answers, beside her own stamp
under an eyebrow reading "answered". `approval-ask.tsx` now derives the sentence from the act
actually offered — present tense under `canRespond`, conditional ("You would be approving edition
N, exactly as shown.") on a draft, silent everywhere else. Two tests cover all four states,
including the no-refetch case where the row in hand still says she may answer.

**`W1-02` — the sign route printed the database's own sentence to the homeowner.** Three sites
answered `executeError.message`, and `refusalSentence()` renders an unmapped token verbatim, so the
door leaf read "trade scope b0000000-… not found or access denied" mid-signature. Both halves are
closed: the route answers `sign_failed` and logs the detail server-side, and `refusalSentence` falls
back to the house's own line instead of echoing. `sign_failed` joins `REFUSALS` (so the drift guard
holds it), and a new guard fails the build if any `NextResponse.json({ error: …message })` returns.

**`W1-03` — the keyboard hold's label was charcoal-on-charcoal at 1.00 for 900ms.** `.da-primary`
inverts its word under `:active`, and a keyboard hold never gets `:active` because `onKeyDown`
calls `preventDefault()`. The inverted ink is now driven by `[data-hold-state='holding']` for the
two variants that flood a dark pool (primary, danger), so both paths light the word identically.

**`W1-04` — `--text-muted` was `#8B7355`, 4.19:1 at 11px** (axe: 104 serious failures on the
doorstep, 39 inside one approval). It now aliases a new `--color-oak-ink: #4E4339` — the value iOS
moved to in `IOSC-R2-02`, so the two surfaces write the meta register in the same ink.
`--color-aged-oak` itself is untouched: it is still the right hairline and the right glyph.

### Gates re-run after these fixes

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD…CCAE apps/mobile/Patina/scripts/ios-gate.sh all` | **PASS** — `** BUILD SUCCEEDED **`, `Test run with 2634 tests in 285 suites passed … with 2 known issues` (the same pre-existing pair: `BrandVoiceLintTests` "curated_mix", `RoomLifecycleTests.theTodayRailFollowsALocalDelete`), `✓ lint-delta: no new warnings in touched files`, exit 0 |
| `pnpm --dir … --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --dir … --filter @patina/client-portal test` | **PASS** — 119 suites, 1677 tests (1669 before) |
| migrations / edge functions / designer portal | **NOT RUN, and not owed** — none touched |

The signed walk app was rebuilt from this worktree after the last iOS change: `xcodebuild build -scheme Patina -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath …/.build/DerivedDataWalk` → `** BUILD SUCCEEDED **` (exit 0). `Patina.debug.dylib` re-stamped 2026-09-05 15:40 and carrying this pass's code — `strings` finds "This approval closed before it was answered", `decision_comments` and `The discussion`. `codesign --verify` → `valid on disk`, `Identifier=cloud.patina.app`, `Signature=adhoc`.

**walkAppPath**:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

### Advisories from this pass

1. **`--text-muted` is a portal-wide token.** 218 uses; four of them are not text (three
   `border-[var(--text-muted)]` on `proposal-line-feedback.tsx`, one `fill-` in `room-band.tsx`).
   Those four now draw a shade stronger. Nothing else about the token changed.
2. **`ProjectApprovalActTests.swift` is at exactly 500 lines** — SwiftLint's `file_length` ceiling.
   The next assertion on that suite needs a new file, as `ProjectApprovalLapseTests.swift` did.
3. **`W2R1-M2` was ruled, not deferred.** The finding asked for a scope ruling; the vision refusals
   are binding on every surface a homeowner reaches, and this screen is reached from the same list
   as the ceremony, so the refusal was applied rather than recorded as an exception.
4. **The lapsed-approval sentence is new client-facing copy.** It says the approval closed and that
   the designer can send it again; nothing on the row knows when, and it does not pretend to.

---

## Final fixes — the round-2 walk findings, closed (2026-09-05)

Branch `approvals/w2-integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`. Nine commits over
`3428dca48`; head **`96fd71c89`**. No push, no production mutation, no migration — the wave's one
migration is still 00569, and the local ledger already carried it (`00571, 00569, 00568, 00567`),
so the stack was not reset.

| # | Commit | What it closes |
|---|---|---|
| 1 | `805ef7830` | `W2R2-M1` — the Studio hub counts through the projection |
| 2 | `8cfc27cdd` | `W2R1-m1`, `W2R1-m2`, `W2R1-n2`, `W2R2-n2`, `W2R2-n1` |
| 3 | `300dd15f1` | `W2-01` — the swing, and P-19 on the door receipt |
| 4 | `fa98d4695` | `W2-02` (web), `W2-04` / `W2-n5`, `W2-05` |
| 5 | `b74709af4` | `W2-03`, `W2-06` |
| 6 | `71ad61d4d` | `W2-02` (iOS half) |
| 7 | `7f79cc111` | `W2-01` follow-on — an unmount releases the held-back refetch |
| 8 | `a457c8fde` | lint-delta: `LoadStateHonestyTests` back under `file_length` |
| 9 | `96fd71c89` | the acts dock's own measuring hook, asserted |

### iOS

**`W2R2-M1` — the Studio hub never counted a Stage-2 approval.** `StudioHubViewModel
.fetchDecisions()` was `DecisionsAPIClient.listPending()`, a PostgREST read on `client_decisions`,
and 00467 hides every Stage-2 row from the homeowner behind it — so the hub read "Three approvals
are waiting on you" over six open ones, and a homeowner whose only open asks are approvals got no
Awaiting-you row at all. The hub now fetches `list_my_project_decision_reviews` beside
`listPending()` and folds both through `BadgeCountService.mergedDecisions`, the same merge Today and
"Awaiting your call" already read. Three surfaces, one set. `StudioLoadResult` carries the
projection but does **not** count it as a failure source of its own: it is the second half of one
feed, and `mergedDecisions` gives a failed half the same degrade `held` gives every other source —
the rows it last returned. Two behaviour tests (the hub's number equals Today's merged set; an
approvals-only homeowner gets a row) plus a source pin naming the third caller.

**`W2R1-m1` — one name, once.** The placeholder keeps the designer's given name ("Tell Leah what to
change."); `noteHelp` stops naming anyone — "Optional. Your note goes with this returned edition."

**`W2R1-m2` — the seal names the studio.** `whatHappensNext(studio:)` falls back to "Your studio",
and the resolver behind it (`countersigningStudio` → **`signingStudio`**) no longer hands over
`designer?.displayName` when `business_name` is empty. Nil is the honest answer and the copy has a
general for it. The identifier was renamed with the sentence: "countersign" is retired in the app
outside one historical comment.

**`W2R1-n2` — the refused signature is body ink** (`PatinaColors.Text.secondary`), not
`Text.error`. It was the only red sentence left in the ceremony.

**`W2R2-n2` — the studio's terms are printed as the studio wrote them.**
`PaymentTermsDisplay.label` humanizes a slug (underscore, no whitespace) and returns anything else
verbatim, so "Fifty percent on signature." stops arriving at the sign act as "Fifty Percent On
Signature." `net_45` still reads "Net 45".

**`W2R2-n1` — the seal arrives without the slide under Reduce Motion.** The stamp's settle was
already a measured cross-fade; the `.fullScreenCover` carrying it was not, because a cover's
presentation is the system's and cross-fades only under *Prefer Cross-Fade Transitions* (off by
default). `ProposalDetailView` reads `accessibilityReduceMotion` and disables the presentation's
animations itself.

**`W2-02`, iOS half.** `respondToProjectApproval` sent no consent method without a signature, so a
Return or a Hold left the column NULL — the ruling's "the equivalent on iOS" was not being sent.
It now sends `ProjectApprovalConsent.clickThrough`.

### Web

**`W2-01` — the door never swung, and the receipt was unreachable.** `onSign` awaited
`invalidateSignedCommercialDocument` before it set `signedAt` or started the swing; that refetch
takes the signed paper out of the papers the Threshold draws doors from, so `renderDoor` answered
null and the section unmounted ~40 ms after the POST. The swing now starts on the response and runs
on this component's own state; the invalidation waits the 520 ms out and goes last, and a refetch
that fails after a signature that landed is no longer reported as a refusal. An unmount **releases**
that wait rather than cancelling it, so the refetch still happens. Ordering is pinned by a test that
holds the invalidation open: the leaf is `swinging` and the receipt is drawn with
`invalidateSignedCommercialDocument` not yet called.

And the receipt carries the ruled P-19 sentence — `{Studio} has your signature. You'll have a copy.`
— in place of `{studio} countersigns`, on every kind of paper the door takes, trade scope included.

**`W2-02` — Return and Hold record a consent method.** `clientConsentMethod` was sent only with a
signature. It is now always sent. **The token is `click_through`, not `portal_clickthrough`:**
`client_decisions_client_consent_method_check` allows exactly `electronic_signature`,
`click_through`, `paper`, and `_respond_project_approval_checked` (00569:1312) allowlists the first
two — `portal_clickthrough` would have been refused outright and cost a homeowner her Return. That
spelling belongs to the review leg (`confirm_project_decision_review`), which is untouched. The
ruling's meaning — never NULL, a press and hold is a click-through — is what shipped.

**`W2-04` / `W2-n5` — the maker's mark leaves the on-screen plate.** R6 keeps the twelve characters
for the printed Record of Decision (Wave 3, P-26). On screen it was the doorstep's last serious axe
violation (`#938B83` on `#FAF7F2`, 3.13:1, 11 nodes) and `aria-hidden`, so it was a string sighted
readers could see and screen readers could not. The plate keeps its frame, its title and its
edition line.

**`W2-05` — the discussion landmark names its own approval.** `aria-label="Discussion about
{artifactTitle}"` replaces an `aria-labelledby` pointing at a heading whose words ("The discussion")
are identical on all thirteen. The heading a reader sees is unchanged.

**`W2-03` — the hold's retreat is stilled too.** `.da-hold[data-hold-state='idle'] .da-pool` is
(0,3,0); `.da-hold-still .da-pool` and the `prefers-reduced-motion` block were (0,2,0), so the idle
transition won whatever the order and the pool animated back over 180 ms for a reader who had turned
motion off. Both blocks now name the idle state at a weight that wins.

**`W2-06` — the door's other four acts dock.** At 390×844 with Sign docked at y=751 they sat at
y=840 and y=896; the clearance (`max-[600px]:pb-16`) was what put them there. They now dock as a
compact row riding 61 px up — the primary dock's own height (44 px act + 2×8 px padding + its 1 px
rule) — directly on top of it. `DoorActs` returns a fragment so the sticky box is a direct child of
the leaf (a sticky box is constrained by its parent, and a wrapper its own height pins nothing) and
holds nothing but the row: the unfolded panels are siblings, or they would be pinned to the bottom
edge with it. `data-acts-dock` mirrors `[data-hold-dock]` so a walk can measure both.

**Cross-check.** `grep -rn countersign apps/client-portal apps/mobile` — nothing left in the
homeowner copy this program owns. What remains is the design-services agreement's, and it is
substantiated: see advisory 1.

### Gates

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/scripts/ios-gate.sh all` | **PASS**, exit 0 — `** BUILD SUCCEEDED **`, `Test run with 2639 tests in 285 suites passed after 8.262 seconds with 2 known issues`, `** TEST SUCCEEDED **`, `✓ lint-delta: no new warnings in touched files` |
| `pnpm --dir … --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --dir … --filter @patina/client-portal test` | **PASS** — 119 suites, **1681** tests (1677 before) |
| `pnpm --dir … --filter @patina/supabase type-check` | **NOT RUN, and not owed** — no hook changed; the whole diff is under `apps/` |
| migrations / edge functions / designer portal | **NOT RUN, and not owed** — none touched |

The two known issues are the same pre-existing pair the last pass recorded: `BrandVoiceLintTests`
("curated_mix") and `RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

The gate ran three times and only the third is the pass above. The first was killed by the sandbox
(`xcodebuild: error: Could not resolve package dependencies: error: permissionDenied`, plus
`CoreSimulatorService connection refused`) — every xcodebuild invocation has to run unsandboxed. The
second was green on build and unit and failed lint-delta alone
(`PatinaTests/LoadStateHonestyTests.swift: 0 → 1`): the fixture's new `approvals:` argument put the
file at 501 lines against SwiftLint's 500. `a457c8fde` folds it onto the `decisions` line.

### The walk app, rebuilt

```
xcodebuild build -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath …/apps/mobile/Patina/.build/DerivedDataWalk
  ** BUILD SUCCEEDED **   (exit 0)
```

Signing left ON. `codesign -dv`:

```
Executable=…/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app/Patina
Identifier=cloud.patina.app
Format=app bundle with Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=425 flags=0x2(adhoc) hashes=3+7 location=embedded
Signature=adhoc
Info.plist entries=39
TeamIdentifier=not set
Sealed Resources version=2 rules=10 files=61
```

`codesign --verify --verbose=2` → *valid on disk*, *satisfies its Designated Requirement*.
`Patina.debug.dylib` stamped 2026-09-05 17:07 and carrying this pass's code — `strings` finds
`Your studio` (4), `has your signature` (2), `Optional. Your note goes with this returned edition.`
(2), `click_through` (2), and **no** `Your designer has your signature`.

**walkAppPath**:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

### Advisories from this pass

1. **"Countersigns" survives on the design-services agreement, and should.**
   `consent-copy.ts:34,59` ("…my signature alone does not authorize work until the studio
   countersigns", "The agreement becomes effective only after the studio countersigns") and
   `commercial-document-shell.tsx` ("Awaiting studio countersignature") describe a second act that
   is real for that kind — `countersign_design_services_agreement` exists, and the document carries
   a `client_signed` state waiting on it. The ruling retired the *unsubstantiated* line, which was
   the door receipt asserting a countersignature on every paper including a trade scope, whose own
   consent is pinned never to claim one. Removing the DSA copy would make a legal statement of
   effect false. Flagged for a steward reading rather than deleted.
2. **`W2-02`'s token diverges from the ruling's wording, not its meaning.** See above: the column
   and the checked function accept `click_through`; `portal_clickthrough` is the review leg's word.
   Worth one line of the ruling so a future reader does not "fix" it back.
3. **`W2-02` was closed on BOTH surfaces**, though the brief listed it under Web. The mid-Wave-2
   ruling says "portal_clickthrough on web and the equivalent on iOS. Same on both surfaces", and
   the iOS walk had recorded the NULL as correct. Both now send the method.
4. **Prettier drift on the client portal is inherited, not introduced.** The pre-commit hook warns
   (advisory) on `door-gate.tsx`, `approval-ask.tsx`, `door-acts.tsx`, `globals.css` and their
   suites. Checked against the base commit `3428dca48`: the same files already failed
   `prettier --check` there. Nothing was reformatted, so the diffs stay readable.
5. **The seal's studio name is still often absent.** `signingStudio` reads
   `projects[].designer.business_name`, and the seeded designer carries none — so the walk will read
   "Your studio has your signature." rather than a name. That is the ruled fallback working, not a
   defect; a walk that wants the named branch has to seed `business_name`.
6. **`W2-06`'s 61 px is measured, not derived.** It is the primary dock's height as its classes
   build it (`min-h-[44px]` + `max-[600px]:py-2` + a 1 px rule). If that dock's padding changes, the
   acts row's offset has to change with it; the constant is commented at both ends.
7. **`data-acts-dock` and `[data-hold-dock]` are the two selectors** a narrow-width walk should
   measure. Both are asserted in their suites.

### What is NOT closed

- **`W2-n1`** (the weighing sentence spells to twenty then prints figures), **`W2-n2`** (the door's
  four acts carry identical weight), **`W2-n3`** (R11's baseline never renders — no projection
  carries `costBaselineCents`), **`W2-n4`** (the why is signed with a given name where the ruling
  says display name), **`W2R1-n3`** (numerals on the Studio hub), **`W2R1-n4`** (the Stage-2 card
  carries no kind chip). All are nits the walks recorded as outside this round's scope; the
  numerals are ruled a Wave 3 sweep item (P-24 residue).
- **The two lock-screen actions** still cannot be driven by the harness (an AX custom action), and
  the seal's haptic still cannot be observed on a simulator. Both are harness limits, unchanged.
