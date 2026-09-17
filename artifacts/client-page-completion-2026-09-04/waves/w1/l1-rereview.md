# L1 — Approvals in place · fix-round re-review

Reviewer: fresh context, wrote neither the lane nor the first review.
Subject: branch `client-page-2/l1` @ `7dc29fa0e73e0080a372cf618c2d5fec3c2911d9`
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l1` (read-only; no edits, no git writes)
Prior review: `l1-review.md` @ `13cfd8729` — verdict MERGEABLE_WITH_FIXES, 2 blockers / 6 majors.
Fix round: `l1-impl.md` §"Fix round", commit `7dc29fa0e` *fix(client): l1 — the ask keeps its place, its record and its ceremony*.
Diff base `origin/main`: 5 files, +1877/−69 (4 code files + the lane report).

---

## Gate output (run by this reviewer, verbatim)

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
Time:        6.211 s
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

Every number the lane reported reproduces exactly (602 tests, 95.76/87/100/98.21). No sandbox
retries were needed. Uncovered line 116 is the dev-only branch of `refusalSentence`; line 500 is the
disabled path of "Choose another outcome" — both above the 70/60/70/70 floor.

---

## 1. Prior findings, confirmed against the diff

All line references are `apps/client-portal/src/components/threshold/approval-ask.tsx` unless named.

| # | Sev (prior) | Status | Evidence |
|---|---|---|---|
| F1 | blocker | **FIXED** | `approval-ask.tsx:463` calls `onAnswered?.(approval.decisionId)` on a successful confirm; `:147` keeps `isProjectApprovalAwaitingStudioIssue` rows in `asks` **from the row**, not from visit state, so the ask survives a reload too. `:458` sets the notice and `:686-694` renders it `role="status"`; `:618-625` renders "Review complete. Your designer can now issue this request." Both strings byte-match `project-approval-review.tsx:134` and `:392`. Eyebrow gains the third state at `:516-517`. Pinned by `approval-ask.test.tsx:342` and `:676`. |
| F2 | blocker | **FIXED** (with residue — see N1–N3) | `:150-152` derives `receipts` from `approval.outcome !== null` on the row; `ApprovalReceipt` at `:356-382` renders question + stamp + artifact/edition and no acts; `threshold.tsx:626-628` renders them. Nothing about it depends on `answeredHere`, so it survives the reload. Pinned by `threshold.test.tsx` *"keeps the record of an approval answered on an earlier visit"* and `approval-ask.test.tsx:621`. |
| F3 | major | **FIXED** | `:635-682`. First click only `setChosen` (`:644`) — no mutation. `:651-657` unfolds `${label} · ${consequence}`, the three consequence strings byte-identical to `project-approval-review.tsx:39/44/49` and correctly mapped to their outcomes. `:630-633` carries the old instruction line verbatim (`project-approval-review.tsx:408-409`). Recording takes `submit_project_approval_response` at `:660-669`; `:670-679` backs out. Payload at `:477-483` unchanged. Pinned at `approval-ask.test.tsx:193`. |
| F4 | major | **FIXED** (see N8) | `BudgetInEdition` `:162-229`, rendered only for `artifactKind === 'budget_version'` (`:548`). The fail-closed match at `:167-170` is field-for-field the old `budgetMatchesArtifact` (`project-approval-review.tsx:115-119`): id + version + `checkpoint.evidenceFingerprint` === `artifactChecksum`. Both sentences verbatim (`:181`, `:188`). Four cases tested (`approval-ask.test.tsx:470-521`), including the non-budget no-read. |
| F5 | major | **FIXED in part**, residue escalated | `:437-443` filters predecessor/successor against `anchoredDecisionIds`; `:702-721` renders `#approval-<id>` in-place anchors with the old labels. `useDoorstepApprovals:157` builds the id list from asks + receipts, so no anchor can be dead and no route is reintroduced. The residue the lane names is real and confirmed: an edition that is neither actionable nor answered (withdrawn/superseded with `outcome === null`) matches neither filter at `:144-152` and stands on no surface. That is the same ruling F9 needs. |
| F6 | major | **FIXED** | `:417-420` adds `confirmationUnavailable`; `:607-616` renders the old sentence verbatim under `role="alert"`. Pinned at `approval-ask.test.tsx:364`. |
| F7 | minor | **FIXED** | `:582-588` — the count line is now outside the `canConfirm` guard (`:590`), with `data-testid="approval-review-count"`. |
| F8 | minor | **FIXED** | `:271-309` branches `isLoading` → `isError` → empty → thread, all three strings the old page's. `:311` withholds the write field while the thread is loading or failed, so no duplicate question can be posted. Three tests at `approval-ask.test.tsx:579-603`. |
| F9 | major | **NOT FIXED — escalated**, as the prior review allowed | `isClientActionableLegacyDecision` (`lib/client-attention.ts:45`) is still uncalled anywhere under `components/threshold/`. The prior verdict put this before deletion of `/decisions/[id]`, not before merge. **Owed: a ruling on whether legacy decisions are dead-on-cutover.** |
| F10 | major | **FIXED** | `threshold.tsx:186` destructures `projectApprovalsError`; `:611-619` renders the `/decisions` sentence verbatim under `role="alert"` where the asks stand. The prop is really fed: `making/project-surface-switch.tsx:70/83/97` → `project-view-wrapper.tsx:140` → `Threshold`. The prop's doc comment (`:169-176`) was rewritten to stop arguing for the silence this overturned. Pinned in `threshold.test.tsx`. |
| F11 | minor | **FIXED** | `:532-537` — "You are approving edition {n}, exactly as shown." matches `project-approval-review.tsx:190-192` byte for byte, and `data-testid="immutability-sentence"` is back. |
| F12 | minor | **FIXED** | `:562-569` renders "No cost, schedule or lead-time change." when all three deltas are zero. Sound: `costCentsDelta`/`scheduleDaysDelta`/`leadTimeDaysDelta` are non-nullable `number` (`packages/supabase/src/hooks/use-project-approvals.ts:53-55, 312-314`), so the falsy test cannot mistake absent data for a stated zero. |
| F13 | minor | **FIXED** | `refusalSentence` `:114-119` returns the house sentence and appends `cause.message` only under `NODE_ENV === 'development'`. Both tests now assert the RPC code is *absent* (`approval-ask.test.tsx:338`, `:393`). |
| F14 | minor | **FIXED (dissolved)** | The three acts no longer mutate (`:644`); once one is chosen the other two are not rendered (`:635` ternary), and "Choose another outcome" is `disabled` while the submit is pending (`:675`). `ScoredAction` treats `loading` as unavailable (`making/scored-action.tsx:134`), so the submit cannot double-fire. |
| F15 | minor | **FIXED** | `:434` — `parseSourceDate(approval.respondedAt) ?? justAnswered?.at ?? null`; the `updatedAt` fallback is gone. Pinned at `approval-ask.test.tsx:274`. |
| F16 | minor | **FIXED** | `:260-263` — `<section aria-labelledby>` around an `<h3 id="approval-discussion-<id>">` styled as the mono eyebrow. (Heading text reworded "Discussion" → "The discussion"; the fix asked only for a heading.) |
| F17 | nit | **REJECTED**, within latitude | The hook stays in `approval-ask.tsx`. The prior review offered "leave as is" as an acceptable outcome; the lane's reason (keeping lane logic out of the file every W1 lane edits) is the stronger one. |
| F18 | nit | **FIXED** | `threshold.test.tsx:392` arms `useDecisionRealtime` in `beforeEach` beside the other five. |
| F19 | nit | **FIXED** | `approval-ask.test.tsx:105` captures the real `randomUUID`, `:120` lends only that key on the existing `globalThis.crypto`, `:127-138` hands it back and asserts `getRandomValues` survived. |
| F20 | minor | **FIXED** | 12 → 32 tests. Every case the prior review named is present: draft + review complete (`:342`), `authorityRevision === null` (`:364`), failed confirm (`:324`), all-zero deltas (`:175`), `context === null` (`:405`), `disposition: 'withdrawn'` (`:397`), the two-beat confirm (`:193`), plus four budget cases, three comment-state cases, the receipt, and the revision anchors. |

**Payload and predicate fidelity re-checked and still exact.** `confirmReview.mutateAsync` (`:451-457`)
and `respond.mutateAsync` (`:477-483`) match `project-approval-review.tsx:126-135` / `:150-160`
field for field, including `expectedUpdatedAt: approval.updatedAt` and a fresh `idempotencyKey`.
`reviewComplete` / `canConfirm` / `canRespond` (`:412-426`) are unchanged from the old page
(`project-approval-review.tsx:103-113`). `making/*`, `mat.tsx`, `lib/threshold/derive.ts` and both
legacy routes are untouched — the diff carries four code files and the lane report only.

**Hook discipline re-checked.** `useDoorstepApprovals` sits at `threshold.tsx:291-296`, above every
branch (`awk` over `:183-300` finds no early `return` — the two hits are inside `useMemo` callbacks);
`body` is still assigned rather than returned early. `BudgetInEdition` and `Discussion` are separate
components, so their hooks are unconditional within their own bodies.

---

## 2. New defects the fix round introduced

### N1 · minor · high · `approval-ask.tsx:356-382` (F2's fix)
**A receipt states the outcome and drops the disposition.** `receipts` (`:150-152`) selects on
`outcome !== null` alone, and the receipt prints only `STAMP_WORD[outcome]`. The house's own
precedence says otherwise: `lib/client-attention.ts:58-59` puts `Withdrawn` / `Superseded` *ahead* of
the outcome, and the old `/decisions` History pile rendered exactly that label
(`app/decisions/page.tsx:220-223`). So a superseded edition 3 now stands on the doorstep reading
plainly "Declined 14 August · Library elevations · Edition 3", beside the live ask for edition 4 and
linked from it by F5's "Review previous edition" anchor, with nothing saying it was superseded.
*Fix:* carry the disposition into the stamp (or a line beneath it) the way
`projectApprovalAttentionLabel` orders it.

### N2 · minor · high · `approval-ask.tsx:356-382` vs `:723`
**The discussion dies on reload.** An approval answered *during this visit* stays in `asks`
(`:148`) and keeps its `<Discussion>`; the same approval on the client's next visit is a receipt,
which renders no thread at all. The old `/decisions/[id]` kept the comment thread readable after an
outcome was recorded. Same gate, two different surfaces depending only on when the client came back —
and the conversation that explains the outcome is the half that disappears. Within the letter of the
prior review's suggested fix (id + outcome + `respondedAt`), so not a regression against the brief,
but it is the record's other half.
*Fix:* render `<Discussion>` on the receipt too, read-only or not.

### N3 · minor · high · `approval-ask.tsx:150-152` + `threshold.tsx:626-628`
**Receipts are unbounded, unheaded and unordered.** The filter runs over the whole
`get_project_decision_reviews` list (`packages/supabase/src/hooks/use-project-approvals.ts:374-391`),
so every approval the project has ever answered stacks onto the doorstep as its own full-width
`SECTION_CLASS` block, in RPC order, with no heading, no count and no collapse. `/decisions` put the
same rows behind `History (N)` (`app/decisions/page.tsx:217`). A year-old project puts a dozen
stamps between the ask and the plan key.
*Fix:* group them under one heading with a count, newest first, and cap or fold the tail.

### N4 · minor · high · `approval-ask.tsx:637-648` with `making/scored-action.tsx:229`
**Outcome telemetry moved off the act that records.** `ScoredAction` fires
`makingEvents.actionSelected` on click; the three outcome buttons now only `setChosen`, so
`approve_project_approval` / `question_project_approval` / `decline_project_approval` fire when the
client *considers* an outcome, and a client who chooses Decline and then backs out emits
`decline_project_approval` on a gate they later approved. The act that actually writes is
`submit_project_approval_response` (`:660`), which carries no outcome in its key or props. After this
round no event says which outcome was recorded. The impl report's telemetry section still describes
the round-1 mapping and does not mention the shift.
*Fix:* give the submit act an outcome-specific `actionKey` (or add the outcome to its analytics
payload), and re-label the choose-click keys as selection.

### N5 · nit · medium · `approval-ask.tsx:508`
`data-never-dim` is dropped only on `recordedOutcome`, so a gate the client has already reviewed and
which is now `awaitingStudioIssue` is still spared the Since-Yesterday dim
(`since-yesterday.tsx:101`) as though something were owed on it. The two sibling gates use the same
proxy (`wall-gate.tsx:186`, `door-gate.tsx:284`), so this is a consistency nit, not a break.

### N6 · nit · medium · `approval-ask.tsx:362-371`
The receipt's `<section>` has no accessible name and no heading — the question is a `<p>` — while the
ask carries an `<h2>` and `aria-labelledby` (`:510`, `:522`). A screen-reader user browsing by
heading finds the asks and skips every receipt. This is the same class of gap F16 fixed for the
thread.

### N7 · nit · low (latent shape, not reachable today) · `approval-ask.tsx:144-152`
An approval that is `active` + `draft` + reviews-complete **and** carries an `outcome` satisfies both
`asks` (via `:147`) and `receipts` (`:151`), which would render two elements with
`id="approval-<decisionId>"` and break F5's anchors. `respond_project_approval` writes an outcome only
from `pending`, so the shape is not reachable through the RPCs as written — worth one exclusion
clause, not a fix.

### N8 · minor · medium · `approval-ask.tsx:203`, `:216-219`
**Budget figures round to whole dollars.** `moneyInWords` sets `maximumFractionDigits: 0`
(`making/standing-sentence.ts:150-157`); the old page's `formatMoney`
(`project-approval-review.tsx:71-76`) printed cents. The lane discloses this as a house-presentation
choice, and it is right for the ledger's prose — but these are the figures of the artifact the client
is being bound to, and a target of $48,200.60 now reads $48,201. The delta rows can keep the house
form; the artifact table should not.

---

## 3. Checks that came back clean

- **No copy regressed.** Every string the prior round flagged is now byte-identical to
  `project-approval-review.tsx` or `app/decisions/page.tsx`: the immutability sentence, both refusal
  sentences, the confirm notice, the awaiting-studio sentence, the authority-revision sentence, the
  three consequence lines, the "Choose one outcome…" instruction, the three comment-state lines, the
  two budget sentences, "Submit response", and the approvals-error sentence.
- **No new route, hook or package.** The five `@patina/supabase` hooks and `useProjectWorkingBudget`
  all pre-exist; nothing was added to `packages/supabase`, so no vitest or admin-build gate applies.
- **Security unchanged by the fix round.** Both mutations still send `approval.projectId` from the row
  in hand, never a caller-chosen id; `canConfirm`/`canRespond` are still the old page's predicates, so
  RLS and the `p_expected_updated_at` CAS sit behind the same doors. `BudgetInEdition` reads
  `useProjectWorkingBudget(approval.projectId)` — the same project — and fails closed on any mismatch.
  The F5 anchors are same-page fragments, never routes, and are rendered only for ids that actually
  stand on the page, so no id is disclosed that the client could not already see.
- **Hydration.** No `window`/`document`/`crypto` at render; `new Date()` and `crypto.randomUUID()`
  stay in handlers. `LETTER_DATE`/`DAY_MONTH` formatting still renders only past the
  `!hydrated || loading || model.pending` hold (`threshold.tsx:658`), including the new receipts and
  the new error line, which sit inside the same `asks` fragment.
- **The ledger did not move.** `threshold.tsx:289` still derives the model from
  `isClientActionableProjectApproval`, so a confirmed or answered gate stops counting as owed in the
  sentence and ledger even while its ask or receipt stands. Correct: what stands is a record, not a debt.
- **Test quality.** All 32 cases assert rendered facts, payloads or the hook boundary; no
  implementation-detail assertions, and the two refusal tests assert the *absence* of the RPC string
  rather than only the presence of the house sentence. `threshold.test.tsx`'s six hook arms are in
  `beforeEach`, correct under `resetMocks: true`.

---

## Verdict

**MERGEABLE** — both blockers (F1, F2) and four of the five in-scope majors (F3, F4, F6, F10) are
genuinely fixed in the diff, F5 is fixed to the edge of its ruling, and every minor and nit is
addressed or rejected within the latitude the prior review gave. F9 remains escalated, which the prior
verdict explicitly placed before deletion of `/decisions/[id]`, not before this merge. The eight new
findings are all minor or nit; N1 (a superseded edition reading plainly "Declined") and N4 (no event
records which outcome landed) are the two worth taking on the merge commit rather than deferring.

**Owed before `/decisions/[id]` is deleted:** the F9 ruling on legacy decisions, and F5's residue —
an approval that is neither client-actionable nor answered stands on no surface at all.
