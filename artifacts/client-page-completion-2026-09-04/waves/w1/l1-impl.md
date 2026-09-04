# L1 — Approvals in place (implementation report)

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l1`
- Branch: `client-page-2/l1` (from `origin/main` = `26b15145e`)
- Absorbs: `/decisions`, `/decisions/[id]`

## What was built

`components/threshold/approval-ask.tsx` (new) replaces `threshold.tsx`'s local
`DoorstepApproval`, which linked out to `/decisions/<decisionId>`. The project approval is now
answered where it stands on the doorstep.

`ApprovalAsk` renders, in order:

- eyebrow — `A gate · your review is required` / `· your response is required` / `· answered`
- the question (h2, `id="approval-gate-<id>"`, the section's `aria-labelledby`)
- `<artifactTitle> · Edition <n> · Due <Month D>` and the immutability line
  `Edition <n> is what you answer, exactly as it stands.`
- the studio's rationale — `approval.context`, `data-testid="approval-rationale"`
- impact — Cost / Schedule / Lead time, **only the non-zero deltas** (`data-testid="approval-impact"`).
  The old page printed `$0 — no cost change`; on this surface a delta of nothing is silence.
- the stamp once an outcome exists — `Approved <d Month>` / `Declined <d Month>` / `Held <d Month>`
  with `<artifactTitle> · Edition <n>` beneath (`data-testid="approval-stamp"`), styled as the
  wall gate's stamp (brass rule, −1.1deg, mono caps — no shadow, no colour signal)
- Authority — `N of M required reviews confirmed.` + act **Review exact edition** while the gate is
  a draft with reviews outstanding
- Confirmation — three acts (`data-testid="approval-acts"`): **Approve** / **Ask a question** /
  **Decline**
- the discussion — thread + write field, always present

Section keeps `id="approval-<decisionId>"`, `data-threshold-unit="doorstep-approval"`,
`data-testid="doorstep-approval"`. `data-never-dim` is present while the ask is open and dropped
once an outcome is recorded (same rule as `wall-gate.tsx` after acceptance).

### Act → outcome map

The three acts are the old page's three `ProjectApprovalOutcome` values in the house's words, so the
web surface still reaches every outcome iOS/designer can read back:

| Act | `outcome` sent | Stamp |
|---|---|---|
| Approve | `approved` | `Approved <date>` |
| Ask a question | `needs_discussion` | `Held <date>` |
| Decline | `changes_requested` | `Declined <date>` |

The **discussion** is separate and never submits an outcome — the old page's guarantee sentence is
kept word for word: *"Comments help you and your designer discuss the work. They never submit or
change an approval outcome."*

### `useDoorstepApprovals` (exported from the same file)

`isClientActionableProjectApproval` goes false the instant an outcome lands, so filtering on it alone
would take the ask off the doorstep at the same moment its stamp was written. The hook returns
`{ asks, onAnswered }`: `asks` = actionable approvals **plus** any answered through `onAnswered` in
this visit. An approval answered elsewhere, or before the client arrived, never appears.
`threshold.tsx` keeps its existing `doorstepApprovals` filter for the **model** (so an answered ask
stops counting as owed in the ledger/sentence) and renders from `asks`.

## Hooks used (all pre-existing; no new `@patina/supabase` hook added)

Copied from `apps/client-portal/src/app/decisions/[id]/page.tsx` and
`apps/client-portal/src/components/approvals/project-approval-review.tsx`:

| Hook | Payload (byte-identical to the old page) |
|---|---|
| `useRespondProjectApproval` | `{ projectId, decisionId, outcome, expectedUpdatedAt: approval.updatedAt, idempotencyKey: crypto.randomUUID() }` |
| `useConfirmProjectApprovalReview` | `{ projectId, decisionId, authorityRevision, artifactChecksum, idempotencyKey: crypto.randomUUID() }` |
| `useDecisionComments(decisionId)` | read |
| `useCreateDecisionComment` | `{ decisionId, body }` (trimmed) |
| `useDecisionRealtime(decisionId)` | subscription |

Gating predicates copied verbatim from `project-approval-review.tsx`:
`reviewComplete = completedReviewCount >= requiredReviewCount`;
`canConfirm = lifecycleStatus === 'draft' && !reviewComplete && authorityRevision !== null`;
`canRespond = lifecycleStatus === 'pending' && disposition === 'active' && reviewComplete && outcome === null`.

Ledger/sentence refresh rides the existing `invalidateProjectApprovalQueries` rail inside
`approvalMutation` — no new invalidation was added.

## Copy sources

- error on respond: `"This approval changed while it was open. Refresh before responding."` — old page
- error on confirm: `"The artifact changed or the review could not be confirmed. Refresh and review it again."` — old page
- discussion guarantee sentence — old page (`DecisionDiscussion`), verbatim
- failed-comment line reworded to the house's third person: `"The comment could not be posted. Your draft is still here; try again."`
- eyebrow / `<title> · Edition <n> · Due <date>` line — the retired `DoorstepApproval`, unchanged
- stamp form — `wall-gate.tsx` and `path-b-the-threshold.html` `.stamp` (`docs/design/the-client-page/path-b-the-threshold.html:215`, `:578`)
- thread author labels: `You` / `The studio` (old page said `You` / `Designer`)

## Files

- `apps/client-portal/src/components/threshold/approval-ask.tsx` — **new**
- `apps/client-portal/src/components/threshold/__tests__/approval-ask.test.tsx` — **new**, 12 tests
- `apps/client-portal/src/components/threshold/threshold.tsx` — shared file, minimal:
  - deleted the `DoorstepApproval` function and the three imports/consts only it used
    (`ScoredAction`, `parseSourceDate`, `LONG_MONTH_DAY`) — **integration note:** if another lane adds
    a `ScoredAction` or `parseSourceDate` use in this file, re-add the import on merge
  - added `import { ApprovalAsk, useDoorstepApprovals } from './approval-ask';`
  - added `const { asks: doorstepAsks, onAnswered: onApprovalAnswered } = useDoorstepApprovals(projectApprovals);`
    beside the existing `doorstepApprovals` filter (hook, called before any branch)
  - the `asks` fragment renders `<ApprovalAsk … onAnswered={onApprovalAnswered} />`
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx` — shared test file:
  - added the five new hooks to the `@patina/supabase` factory and armed them in the existing
    `beforeEach` (jest.config sets `resetMocks: true`, so factory implementations are wiped per test)
  - `PHASE_APPROVAL` fixture completed (`completedReviewCount: 1`, `authorityRevision`,
    `artifactChecksum`, deltas, `updatedAt`) so `canRespond` is reachable
  - the two assertions that expected a link to `/decisions/dec-1` now assert the in-place acts

`making/*` untouched. No new hooks in `@patina/supabase`, so no vitest/admin-build gate applies.

## Gate output (verbatim)

```
### type-check

> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l1/apps/client-portal
> tsc --noEmit


### jest -- threshold making
PASS @patina/client-portal src/components/threshold/__tests__/door-gate.test.tsx
PASS @patina/client-portal src/components/threshold/__tests__/threshold.test.tsx (5.709 s)

Test Suites: 31 passed, 31 total
Tests:       580 passed, 580 total
Snapshots:   0 total
Time:        8.089 s, estimated 16 s
Ran all test suites matching /threshold|making/i.

### jest -- approval-ask
> @patina/client-portal@0.1.0 test /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l1/apps/client-portal
> jest "approval-ask"

PASS @patina/client-portal src/components/threshold/__tests__/approval-ask.test.tsx
  ApprovalAsk — the ask, answered where it stands
    ✓ renders the ask: title, edition, due date, rationale and impact (77 ms)
    ✓ approves with the payload the old detail page sent, then stamps in place (40 ms)
    ✓ declines as changes_requested and reads back as Declined (16 ms)
    ✓ holds the gate when the client asks a question (14 ms)
    ✓ reads a recorded decline back from the row, with its own date (3 ms)
    ✓ confirms the exact edition with the old page’s payload while the gate is a draft (8 ms)
    ✓ says so when the approval moved under the client (16 ms)
  ApprovalAsk — the discussion
    ✓ posts a comment through the decision thread and clears the draft (12 ms)
    ✓ writes the thread back, the client’s own words in her own name (3 ms)
    ✓ keeps the draft and says so when the comment does not land (10 ms)
  useDoorstepApprovals
    ✓ keeps an ask that was answered while the client stood on the doorstep (1 ms)
    ✓ never stands an ask that was already answered before the client arrived

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        1.069 s, estimated 2 s
Ran all test suites matching /approval-ask/i.

### eslint
eslint exit: 0
```

`npx eslint src/components/threshold src/components/threshold/__tests__` printed nothing — 0 errors,
0 warnings.

## NOT verified / not carried over

- **No real data.** Everything is jest with mocked hooks. No local Supabase, no browser, no
  Playwright. `respond_project_approval` / `confirm_project_decision_review` were never called against
  a database from this surface, so RLS and the CAS (`p_expected_updated_at`) path are unproven here.
- **Coverage floor not measured.** The gate run was `test -- threshold making` + `approval-ask`; the
  full jest-with-coverage pass (70/60/70/70) belongs to the integration lane.
- **Budget-version detail figures were NOT carried over.** The old page rendered
  `useProjectWorkingBudget` totals + room/category lines with a fail-closed
  id/version/checksum match for `artifactKind === 'budget_version'`
  (`project-approval-review.tsx`, `data-testid="approved-budget-details"`). The lane brief listed
  title / what it decides / due date / rationale / comments / acts, so this was left out. A client
  approving a budget edition on the Threshold sees the signed deltas but not the target/low/high
  table. **Flagging for a ruling before `/decisions/[id]` is deleted.**
- **Revision history links were NOT carried over.** The old page linked
  `predecessorDecisionId` / `successorDecisionId` to `/decisions/<id>` — routes this program retires.
  There is no in-place read view for a superseded edition yet.
- **The `/decisions` and `/decisions/[id]` routes are untouched** — this lane only stops the Threshold
  linking to them. Deleting them is the retirement plan's R-lanes.
- **`gate_project_approval` telemetry key is gone.** The outbound link's `ScoredAction` used it; the
  new acts report `approve_project_approval`, `question_project_approval`,
  `decline_project_approval`, `confirm_project_approval_review`, `post_approval_comment`
  (all `surfaceKey="the_threshold"`, `regionKey="doorstep"`). Any PostHog insight on the old key
  stops receiving events.
- **Shared-file merge risk**, listed above: the three removed imports in `threshold.tsx`.
- **Pre-push hook printed `Affected verification has advisory failures.`** on `git push` (the push
  succeeded). It runs the repo-wide affected build/type/lint sweep, which is noisy on `main` too; the
  three lane gates above are green. Not diagnosed further in this lane.

---

# Fix round (review `l1-review.md`, verdict MERGEABLE_WITH_FIXES)

Files touched: `apps/client-portal/src/components/threshold/approval-ask.tsx`,
`apps/client-portal/src/components/threshold/threshold.tsx`,
`apps/client-portal/src/components/threshold/__tests__/approval-ask.test.tsx`,
`apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx`.
No other file was edited; `making/*`, `mat.tsx`, `derive.ts` and both legacy routes stay untouched.

## Fixed, by finding

- **F1 · blocker — the confirm act deleted its own surface.** `confirmExactEdition` now calls
  `onAnswered(approval.decisionId)` on success, and `useDoorstepApprovals` keeps any approval that is
  `isProjectApprovalAwaitingStudioIssue` from the row itself (not from visit state), so the ask
  survives both the refetch and a reload. The surface speaks instead of vanishing: the old page's
  notice — "Review confirmed for this exact artifact. Your designer can now issue it." (`role="status"`)
  — and its awaiting branch — "Review complete. Your designer can now issue this request." — are both
  rendered, byte-identical. Eyebrow for that state reads "A gate · with your studio".
- **F2 · blocker — an answered approval left no durable record.** `useDoorstepApprovals` now returns
  `receipts` (any approval with a recorded `outcome`, read from the row), rendered by a new
  `ApprovalReceipt`: the question, the stamp (`Approved|Declined|Held <date>`), the artifact and its
  edition, no acts. It survives reload because nothing about it depends on `answeredHere`.
  *Deviation from the reviewer's suggested fix:* the receipt stands in the doorstep's own ask region,
  NOT in Previously. Previously is derived in `lib/threshold/derive.ts`, which is a shared file that
  L4 also edits; putting approval receipts there means widening `deriveThreshold`'s input and the
  Previously renderer, which is the opposite of "shared-file edits minimal". The record is durable and
  in place either way; moving it into Previously later is a rendering change, not a data change.
- **F3 · major — one un-deliberated click recorded an irreversible outcome.** The three acts no longer
  mutate. Clicking one chooses it and unfolds the consequence, in the old page's own words
  ("Approve · Accept this exact artifact and its stated impacts.", "Ask a question · Hold the gate
  while you and your designer talk it through.", "Decline · Return this edition for revision and a new
  approval request."), plus the old page's instruction line verbatim ("Choose one outcome. Add
  questions or notes in Discussion below; comments do not submit an outcome."). Recording takes a
  second act, "Submit response" (the old page's own label and `submit_project_approval_response` key);
  "Choose another outcome" backs out. The payload is unchanged.
- **F4 · major — budget editions lost their figures.** New `BudgetInEdition` renders for
  `artifactKind === 'budget_version'` only: `useProjectWorkingBudget(projectId)`, target/low/high
  totals and the per-room/category lines, behind the same fail-closed match (id + version +
  `checkpoint.evidenceFingerprint` === `artifactChecksum`), with both old sentences verbatim —
  "Budget details are loading…" (`role="status"`) and "Budget details are unavailable for this exact
  approved edition." Non-budget editions never call the hook.
- **F5 · major — superseded/revised editions unreachable.** `ApprovalAsk` takes
  `anchoredDecisionIds` (every ask + receipt id on the page, from the hook) and renders
  `predecessorDecisionId` / `successorDecisionId` as in-place anchors `#approval-<id>` with the old
  labels ("Review previous edition", "Review revised edition") — and only when that id actually stands
  on the page, so no link is ever dead and no route is introduced. *Still open for a ruling:* an
  edition that is neither actionable nor answered (e.g. withdrawn with no outcome) has no anchor and
  so no link; whether such editions must be readable at all after `/decisions/[id]` is deleted is the
  same ruling F9 needs.
- **F6 · major — dead gate with no explanation.** The `authorityRevision === null` branch is copied,
  with its sentence verbatim: "Review confirmation is temporarily unavailable. The frozen authority
  revision was not supplied." (`role="alert"`).
- **F7 · minor — Authority count hidden behind `canConfirm`.** "N of M required reviews confirmed." is
  now unconditional copy on every ask, as on the old page (`data-testid="approval-review-count"`).
- **F8 · minor — a failed comment read looked like an empty thread.** The discussion now reads
  `isLoading` / `isError`: "Loading comments..." (`role="status"`), "Comments could not be read just
  now. Refresh to try again." (`role="alert"`), "No comments yet. Add a note for your designer below."
  — all three the old page's strings. The write field is withheld while the thread is loading or
  failed, so no duplicate question can be posted into a thread that never loaded.
- **F10 · major — `projectApprovalsError` declared and never read.** `threshold.tsx` now destructures
  it and renders, where the asks would stand, the `/decisions` sentence verbatim: "Project approvals
  could not be read just now. Refresh before taking action." (`role="alert"`). The prop's doc comment
  was rewritten — it previously argued for the silence this finding overturned.
- **F11 · minor — the immutability sentence was reworded.** Restored byte-identical: "You are
  approving edition {n}, exactly as shown.", with `data-testid="immutability-sentence"` back so it is
  pinned by a test.
- **F12 · minor — all-zero deltas showed no impact at all.** Suppression kept for individual zeros;
  when all three are zero the ask states it: "No cost, schedule or lead-time change."
- **F13 · minor — raw RPC text reached the homeowner.** Both handlers now set the house sentence;
  `cause.message` is appended only when `process.env.NODE_ENV === 'development'`. The two tests that
  used to assert `approval_conflict` now assert the house sentence AND that the RPC code is absent.
- **F14 · minor — idle acts stayed live during a mutation.** Dissolved by F3: the act buttons no longer
  start a mutation, and once one is chosen the other two are not rendered, so no phantom
  `decline_project_approval` can fire on a flow that approved. "Choose another outcome" is disabled
  while the submit is in flight.
- **F15 · minor — `updatedAt` could print a date the client did not answer on.** The fallback is gone;
  the stamp prints `respondedAt`, else the in-visit timestamp, else no date at all.
- **F16 · minor — the discussion lost its heading.** It is an `<h3 id="approval-discussion-<id>">`
  styled as the mono eyebrow, inside a `<section aria-labelledby>` pointing at it.
- **F18 · nit — `useDecisionRealtime` never armed.** Armed in `threshold.test.tsx`'s `beforeEach`
  beside the other four (now six, with `useProjectWorkingBudget`).
- **F19 · nit — the global `crypto` was replaced and never restored.** Only `randomUUID` is now lent
  (jsdom's `Crypto` has none, so `jest.spyOn` is not available), and `afterEach` hands it back and
  asserts `getRandomValues` survived.
- **F20 · minor — test gaps.** 12 tests → 32. Added: all-zero deltas; `context === null`; the two-beat
  confirm (first click records nothing, other acts withdrawn, back-out); draft + review complete
  (F1's black hole); `authorityRevision === null`; a failed confirm; `disposition: 'withdrawn'`;
  `data-never-dim` present while the ask is open; the unconditional review count; the immutability
  sentence; the stamp with no `respondedAt`; four budget cases (match, version mismatch, fingerprint
  mismatch, loading) and the non-budget no-read; comments loading / error / empty; the receipt (with
  and without an outcome); the revision anchors; and, in `threshold.test.tsx`, the receipt on the page
  and the approvals-error sentence.

## Rejected

- **F17 · nit — move `useDoorstepApprovals` out of `approval-ask.tsx`.** Rejected: the hook is the
  filter that decides which approvals this component renders and in which of its two forms (ask vs
  receipt); moving it into `threshold.tsx` moves lane logic into the file every other W1 lane also
  edits, which is the merge noise the ruling asks to avoid. The reviewer offered "leave as is" as an
  acceptable outcome.

## Escalated, not fixed (ruling needed before `/decisions/[id]` is deleted)

- **F9 · major — legacy (non-`PROJECT_APPROVAL_CONTRACT`) decisions are not absorbed.** The typed-name
  consent act in `DecisionConsentBlock` and the four legacy piles on `/decisions` have no doorstep
  equivalent, and `isClientActionableLegacyDecision` is still uncalled. Building a second doorstep ask
  with its own consent ceremony is outside this lane's brief (the plan's L1 body describes the project
  approval only) and would be guesswork about copy nobody has ruled on. The reviewer's own verdict
  puts this before deletion, not before merge. **Owed: a ruling on whether legacy decisions are
  dead-on-cutover.**
- **F5's residue**, above: editions that stand on no surface at all.

## Gate output (verbatim)

```
$ pnpm --dir .../agent-cpc-l1/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output — exit 0)
```

```
$ pnpm --dir .../agent-cpc-l1/apps/client-portal test -- threshold making
Test Suites: 31 passed, 31 total
Tests:       602 passed, 602 total
Snapshots:   0 total
Time:        4.912 s
Ran all test suites matching /threshold|making/i.
```

```
$ npx eslint src/components/threshold/approval-ask.tsx src/components/threshold/threshold.tsx \
             src/components/threshold/__tests__/approval-ask.test.tsx \
             src/components/threshold/__tests__/threshold.test.tsx
(no output — 0 errors, 0 warnings)
```

```
$ npx jest approval-ask --coverage --collectCoverageFrom='src/components/threshold/approval-ask.tsx'
 approval-ask.tsx | 95.76 %Stmts | 87 %Branch | 100 %Funcs | 98.21 %Lines | uncovered 116, 500
Tests: 32 passed, 32 total
```

Line 116 is the development-only branch of `refusalSentence`; line 500 is the "choose another outcome"
disabled path — both above the 70/60/70/70 floor.

## Still not verified after this round

- No real data: everything is jest with mocked hooks. RLS, the `p_expected_updated_at` CAS and
  `get_project_working_budget` have not been exercised from this surface.
- The budget figures are rendered with `moneyInWords` (house money, whole dollars); the old page used
  `Intl` currency with cents. The numbers are the same, the presentation is the house's.
- The pre-push advisory sweep still prints `Affected verification has advisory failures.` — unchanged
  from the first round and unrelated to the three lane gates.
