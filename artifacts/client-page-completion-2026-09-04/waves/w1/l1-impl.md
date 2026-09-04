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
