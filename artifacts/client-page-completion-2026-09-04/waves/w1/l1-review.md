# L1 — Approvals in place · adversarial review

Reviewer: fresh context, did not write this lane.
Subject: branch `client-page-2/l1` @ `13cfd8729171bfb99b58fc7d05f36cfc83d42be3`
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l1` (read-only; no edits, no git writes)
Diff base: `origin/main` — 5 files, +1000/−64.

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
Tests:       580 passed, 580 total
Snapshots:   0 total
Time:        5.727 s
Ran all test suites matching /threshold|making/i.
```

```
$ npx eslint src/components/threshold/approval-ask.tsx \
             src/components/threshold/threshold.tsx \
             src/components/threshold/__tests__/approval-ask.test.tsx
(no output — 0 errors, 0 warnings)
```

```
$ npx jest approval-ask --coverage --collectCoverageFrom='src/components/threshold/approval-ask.tsx'
 approval-ask.tsx | 93.97 %Stmts | 78.12 %Branch | 100 %Funcs | 97.46 %Lines | uncovered 265, 307
```

All three lane gates are green, and the file clears the 70/60/70/70 floor on its own. The lane's
reported output reproduces exactly. No sandbox retries were needed.

---

## 1. The absorb list, act by act

`/decisions/[id]` and `/decisions` are the lane's absorb list (plan L1; inventory rows 82 and 94).
Both routes are still present and untouched on this branch — correct, the retirement plan deletes
them — so nothing below is a live regression yet. Each is a hole the retirement plan would open.

### Project-approval ceremony (`components/approvals/project-approval-review.tsx`)

| Old act / part | In place now? | Note |
|---|---|---|
| Confirm review of the exact edition (`confirm_project_decision_review`) | ✅ same payload | but the surface goes silent after it — **F1** |
| Record an outcome (`respond_project_approval`) | ✅ same payload | one click, no deliberation — **F3**; stamp not durable — **F2** |
| Post a comment (`useCreateDecisionComment`) | ✅ same payload, guarantee sentence verbatim | |
| Read the comment thread (`useDecisionComments`) | ✅ | loading / error / empty states dropped — **F8** |
| Decision realtime (`useDecisionRealtime`) | ✅ | |
| Artifact + immutability sentence | ⚠ reworded | **F11** |
| Scope (`context`) | ✅ | |
| Impact — cost / schedule / lead-time deltas | ⚠ zero rows suppressed | deliberate; **F12** |
| Authority — "N of M required reviews confirmed." | ⚠ shown only while `canConfirm` | **F7** |
| "Review complete. Your designer can now issue this request." | ❌ | **F1** |
| "Review confirmation is temporarily unavailable. The frozen authority revision was not supplied." | ❌ | **F6** |
| "Review confirmed for this exact artifact. Your designer can now issue it." | ❌ | **F1** |
| Recorded-outcome read-back (`approval-seal`, `held-for-discussion`, "Recorded outcome: …") | ⚠ stamp only, visit-scoped | **F2** |
| Budget-version details (`useProjectWorkingBudget`, `approved-budget-details`, fail-closed id/version/checksum match) | ❌ | **F4** — the lane flags it |
| Revision history → predecessor / successor edition | ❌ | **F5** — the lane flags it |
| Authoritative-read failure banner ("The authoritative approval evidence is unavailable…") | ❌ | **F10** |

### `/decisions/[id]` legacy branch and `/decisions` list

| Old act / section | In place now? | Note |
|---|---|---|
| Legacy decision detail: option select + typed-name consent (`DecisionCardClient` → `DecisionConsentBlock`, "this becomes a permanent record on the project") | ❌ nothing on the Threshold | **F9** |
| "Awaiting studio issue" section + its sentence | ❌ | **F1** |
| History (closed / withdrawn / superseded approvals) | ❌ | **F2** |
| Legacy piles: Overdue / Awaiting Your Response / Your Designer Is Handling / Resolved | ❌ | **F9** |
| "Project approvals could not be read just now. Refresh before taking action." | ❌ | **F10** |

Payload fidelity is the strong part of this lane. Both mutation payloads and both gating predicates
are byte-identical to `project-approval-review.tsx:103-167`, verified field by field against
`packages/supabase/src/hooks/use-project-approvals.ts:585-653`. The discussion guarantee sentence is
verbatim. The two error strings are verbatim. Nothing in `making/*`, `mat.tsx` or `derive.ts` was
touched.

---

## 2. Findings

### F1 · blocker · high · `apps/client-portal/src/components/threshold/approval-ask.tsx:252` (+ `:99`, `threshold.tsx:290`)
Confirming the exact edition makes the whole ask vanish with no word. `confirmExactEdition` never
calls `onAnswered`, so `useDoorstepApprovals` does not retain the row; the mutation's invalidation
refetches the list, `completedReviewCount` reaches `requiredReviewCount`, and
`isClientActionableProjectApproval` (`lib/client-attention.ts:23-25`) goes false for a `draft`. The
section — question, rationale, impact, stamp, and the discussion thread the client was reading —
disappears from the page mid-act, replaced by nothing. The old page stayed put and said "Review
confirmed for this exact artifact. Your designer can now issue it." and, once refetched, "Review
complete. Your designer can now issue this request."; `/decisions` carried an "Awaiting studio issue"
section for exactly this state. This is the settle-before-speaking rule inverted: the surface speaks
by deleting itself.
*Fix:* call `onAnswered(approval.decisionId)` after a successful confirm too, and render the
awaiting-studio-issue state (`isProjectApprovalAwaitingStudioIssue`) with the old page's sentence
instead of dropping the section.

### F2 · blocker · high · `approval-ask.tsx:103` / `:246`
The stamp is visit-scoped, so an answered approval leaves no record anywhere on the Threshold.
`answeredHere` is `useState` in `useDoorstepApprovals`; on the next page load the row is no longer
client-actionable, `answeredHere` is empty, and the ask is gone. `derive.ts`'s Previously carries only
retired notes and accepted instruments — approvals are not in it. Once `/decisions` is deleted, a
client who approved edition 3 last week has no surface at all that says so, and the studio's own
"Recorded outcome" evidence has no client-facing mirror. The old `/decisions` History section was that
record.
*Fix:* render answered approvals as Previously receipts (decisionId + outcome + `respondedAt`) so the
stamp survives the reload, rather than depending on in-visit state.

### F3 · major · high · `approval-ask.tsx:401-418`
An irreversible outcome is recorded on a single un-deliberated click, with no consequence copy.
`respond_project_approval` writes a terminal `outcome`; `canRespond` requires `outcome === null`, so
there is no way back. The old page required selecting a radio *and* pressing "Submit response", and
each option carried its consequence ("Return this edition for revision and a new approval request").
The house's own precedent for irreversible client acts is stronger still: `door-gate.tsx` and
`wall-gate.tsx:238-256` both demand a typed full name. Here three bare verbs sit in a row and the
first click is final.
*Fix:* give each act its consequence line and a second confirming beat (an unfold, or the typed-name
pattern the two other gates already use).

### F4 · major · high · `approval-ask.tsx:311` (absent) vs `components/approvals/project-approval-review.tsx:206-282`
Budget-version approvals lose their figures. When `artifactKind === 'budget_version'` the old page
rendered target/low/high totals and per-room/category lines from `useProjectWorkingBudget`, behind a
fail-closed id + version + `evidenceFingerprint` match, and said "Budget details are unavailable for
this exact approved edition" when the match failed. None of it is here. A client approving a budget
edition on the doorstep sees signed deltas and an immutability sentence about an edition whose numbers
are nowhere on the page. The lane flags this and asks for a ruling; it should not be a ruling — this
is the artifact the question is about.
*Fix:* port the `budget-details` section, keeping the fail-closed match and its unavailable sentence.

### F5 · major · medium · `approval-ask.tsx:311` (absent) vs `project-approval-review.tsx:483-512`
Superseded and revised editions become unreachable. The old page linked
`predecessorDecisionId`/`successorDecisionId`; the Threshold renders neither, and it renders only
client-actionable approvals, so a superseded edition has no surface at all. A client asked to approve
edition 4 cannot see what edition 3 said.
*Fix:* render the predecessor/successor as in-place read anchors (`#approval-<id>`) rather than
routes, or state explicitly that superseded editions are out of scope for the retirement.

### F6 · major · high · `approval-ask.tsx:234-237`
`authorityRevision === null` produces a dead gate with no explanation. `canConfirm` requires
`authorityRevision !== null` (copied correctly), but the old page's companion branch —
`project-approval-review.tsx:379-389`, "Review confirmation is temporarily unavailable. The frozen
authority revision was not supplied." — was not copied. The eyebrow still reads "your review is
required" and there is no act and no reason. That is the reverse of absence-is-silence: the page
asserts an ask it then refuses to let the client answer.
*Fix:* copy the `authorityRevision === null` branch and its sentence.

### F7 · minor · high · `approval-ask.tsx:380-384`
"N of M required reviews confirmed." now renders only inside the `canConfirm` block. On the old page
it was unconditional Authority copy, visible for pending and answered gates too. A client on a
`pending` gate can no longer see how many reviews stand behind the edition they are about to approve.
*Fix:* hoist the count line out of the `canConfirm` guard.

### F8 · minor · high · `approval-ask.tsx:120` / `:155`
A failed comment read is indistinguishable from an empty thread. `written = comments.data ?? []`
discards `isLoading` and `isError`; the old page rendered a `role="status"` loader, "Comments could not
be read just now. Refresh to try again.", and "No comments yet. Add a note for your designer below."
The write field still invites a reply into a thread that may have silently failed to load, so a client
can post a duplicate question.
*Fix:* hold the thread until the query settles, and say so on `isError` — silence is for absence, not
for failure.

### F9 · major · medium · absorb-list scope — nothing in `components/threshold/`
Legacy (non-`PROJECT_APPROVAL_CONTRACT`) decisions are not absorbed at all. `/decisions/[id]`'s
`LegacyDecisionDetail` branch carries a real client act — option selection confirmed by typed-name
consent, `DecisionConsentBlock` ("this becomes a permanent record on the project") — and `/decisions`
carried four legacy piles (Overdue, Awaiting Your Response, Your Designer Is Handling, Resolved).
`isClientActionableLegacyDecision` exists in `lib/client-attention.ts:45` and nothing on the Threshold
calls it. The plan's L1 body describes only the project approval, so this may be intended scope — but
the plan's absorb line names the whole routes, and the retirement plan will delete them.
*Fix:* get a ruling on whether legacy decisions are dead-on-cutover; if they are not, they need a
doorstep ask of their own before `/decisions/[id]` is deleted.

### F10 · major · high · `threshold.tsx:177` (pre-existing on main, now load-bearing)
`projectApprovalsError` is declared as a prop and never read. When `useProjectApprovals` fails, the
doorstep silently shows no asks. Today `/decisions` says "Project approvals could not be read just
now. Refresh before taking action." and the emailed `/decisions/<id>` deep link still works. After
retirement, a failed read means a pending approval simply does not exist for that client, with no
alternate route. This predates L1, but L1 is the lane that makes the doorstep the only answer surface.
*Fix:* consume `projectApprovalsError` and say so where the asks would stand.

### F11 · minor · high · `approval-ask.tsx:337-339`
The immutability sentence was reworded. Old: "You are approving edition {n}, exactly as shown."
(`project-approval-review.tsx:190`, `data-testid="immutability-sentence"`). New: "Edition {n} is what
you answer, exactly as it stands." The check for this lane was byte-faithfulness "including
confirmation copy and legal lines", and this is the line that fixes what the client is bound to. The
new wording is also slightly weaker — "what you answer" does not say the artifact cannot change under
them. The testid is gone too, so nothing pins it.
*Fix:* restore the old sentence verbatim, or get the rewording ruled and re-add a stable testid.

### F12 · minor · medium · `approval-ask.tsx:302-309`
Zero deltas are suppressed. Old copy stated them: "$0 — no cost change", "0 days — no schedule
change". The lane argues a delta of nothing is silence. That reads well, but a *stated zero* on an
approval is a fact the client is agreeing to, not a blank; an approval with all three deltas zero now
shows no impact block at all, and the client cannot tell "no impact" from "impact not disclosed".
*Fix:* keep the suppression for two of three, but render an explicit "No cost, schedule or lead-time
change." line when all three are zero.

### F13 · minor · high · `approval-ask.tsx:264-269`, `:290-295`
Raw RPC error text reaches the homeowner. `cause.message` is preferred over the house sentence, so a
`respond_project_approval` conflict surfaces as `approval_conflict` — the lane's own test asserts
exactly that (`__tests__/approval-ask.test.tsx:216,221`). The house sentence the lane copied verbatim
is the *fallback*, and will rarely be seen. `door-gate.tsx:219` / `wall-gate.tsx:168` do the same, but
those errors come from `/api` routes with curated messages; these come from Postgres. The global
constraint is "never print an error string as content".
*Fix:* map the known RPC error codes to the two house sentences and use `cause.message` only in
development.

### F14 · minor · high · `approval-ask.tsx:404-416` with `making/scored-action.tsx:134`
The two idle acts stay live while a third is in flight. `loading` is set only on the pressed act, so
`disabled` is false on the other two; `inFlight.current` swallows the second call, but
`makingEvents.actionSelected` has already fired and the client sees a click that does nothing. Telemetry
gains phantom `decline_project_approval` events on a flow that approved.
*Fix:* pass `disabled={answering !== null && answering !== act.outcome}` to the other two.

### F15 · minor · medium · `approval-ask.tsx:247-250`
`stampedAt` falls back to `approval.updatedAt` when `respondedAt` is null. `updatedAt` moves on any
later write to the row (supersede, disposition change), so a stamp can print a date that is not the
date the client answered. The old page printed no date at all rather than a wrong one.
*Fix:* drop the `updatedAt` fallback and omit the date when `respondedAt` and the local timestamp are
both absent.

### F16 · minor · high · `approval-ask.tsx:147-149`
The discussion lost its heading. The old page used `<h2 id="decision-discussion-heading">Discussion</h2>`
with the section `aria-labelledby` it; the new thread is a styled `<p>`. A screen-reader user browsing
by heading now has no landmark for the thread inside the ask, and the ask's only heading is the
question.
*Fix:* make it an `<h3>` styled as the mono eyebrow and point a wrapping region at it.

### F17 · nit · high · `approval-ask.tsx:89-116`
`useDoorstepApprovals` lives in a component file and is exported from it, so `threshold.tsx` imports a
hook and a component from the same module. The spec's file map puts wiring hooks in `threshold.tsx`
and pure helpers in `lib/threshold/`. It works and is tested; it is a placement nit that will make the
next lane's merge slightly noisier.
*Fix:* leave as is, or move the hook beside the filter it partners in `threshold.tsx`.

### F18 · nit · high · `__tests__/threshold.test.tsx:370-387`
`useDecisionRealtime` is added to the module factory but never armed in `beforeEach`, unlike the other
four and unlike `approval-ask.test.tsx:95`. `resetMocks: true` leaves it returning `undefined`, which
the component tolerates, so the suite passes by accident rather than by arrangement.
*Fix:* arm it beside the other four.

### F19 · nit · medium · `__tests__/approval-ask.test.tsx:98-101`
`Object.defineProperty(globalThis, 'crypto', …)` replaces the whole global with a one-key object and
never restores it, so `crypto.getRandomValues` is gone for the rest of the file. Nothing in this file
needs it; a future test that renders anything using it will fail confusingly.
*Fix:* spy on `crypto.randomUUID` instead, and restore in `afterEach`.

### F20 · minor · high · test coverage gaps, `__tests__/approval-ask.test.tsx`
Twelve tests, all behavioural (payloads, rendered facts, hook boundary) — no implementation-detail
assertions, mocks consistent with the `making/__tests__` idiom. Missing cases, each of which would have
caught a finding above: draft + `reviewComplete` (F1's black hole); `authorityRevision === null` (F6);
`disposition` `withdrawn`/`superseded`; a failed confirm (line 265, the only uncovered branch); all
three deltas zero (F12); `context === null`; `data-never-dim` present while the ask is open (only its
absence is asserted, at `:189`); a second act clicked while the first is in flight (F14).
*Fix:* add the draft-review-complete and `authorityRevision === null` cases at minimum — they are the
two states the client can actually reach today.

---

## 3. Checks that came back clean

- **Hooks discipline.** `useDoorstepApprovals` sits at `threshold.tsx:290` with the other top-level
  hooks, above every branch; `threshold.tsx:638` assigns `body` rather than returning early, so no hook
  is conditional. `ApprovalAsk`'s five hooks are all unconditional at the top of the component.
- **Hydration.** No `window`/`document`/`crypto` at render; `new Date()` and `crypto.randomUUID()` are
  handler-only. `LETTER_DATE.format(new Date(...))` at `:162` formats in the viewer's timezone, but
  `asks` renders only past the `!hydrated || loading || model.pending` gate (`threshold.tsx:638`), so
  the server never emits it — no mismatch.
- **VISION §6.** No shadow, badge, tab, header or route change; every act is `ScoredAction`; the stamp
  is copied class-for-class from `wall-gate.tsx:210` (brass rule, −1.1°, mono caps, `--color-mocha`).
  `--color-error` on the two alerts has precedent at `wall-gate.tsx:285` and `door-gate.tsx:504`. Voice
  is third person throughout; no first person outside quoted comments; no "AI". Money in cents via
  `moneyInWords`.
- **Overlay accessibility.** No overlay or sheet was introduced, so `role="dialog"` / focus trap / Esc
  do not apply. The textarea's `useId`-derived `htmlFor` matches its `id`; both error paths carry
  `role="alert"`; the section keeps `aria-labelledby` pointing at the question `h2`.
- **Security.** No cross-project or cross-client exposure. `projectApprovals` comes from
  `useProjectApprovals(projectId)` (`project-surface-switch.tsx:68`), project-scoped; both mutations
  send `approval.projectId` from the row the client is looking at, never a caller-chosen id; the two
  gating predicates (`canConfirm`, `canRespond`) are copied verbatim from `project-approval-review.tsx`
  so no authorization the old route enforced is skipped, and RLS + the `p_expected_updated_at` CAS are
  unchanged behind them. The comment path is the same `useCreateDecisionComment` with the same
  `{ decisionId, body }` payload.
- **Shared-file discipline.** `threshold.tsx` loses exactly one function and three now-unused imports
  and gains one import, one hook call and one element swap — 68 lines touched, all in the approval
  region. `mat.tsx`, `derive.ts` and everything in `making/` are untouched. The lane's own integration
  note about the three removed imports (`ScoredAction`, `parseSourceDate`, `LONG_MONTH_DAY`) is the
  right call-out for the merge.
- **No reversing copy.** Every eyebrow/stamp transition follows an act's own result, and the asks
  region does not render until every source has settled.

---

## Verdict

**MERGEABLE_WITH_FIXES** — the payloads, predicates and gates are faithful and green, but two blockers
must land before this merges: the confirm act deletes its own surface (F1) and an answered approval
leaves no durable record (F2). F3, F4, F6 and F10 should land with them; F5 and F9 need a ruling
before `/decisions/[id]` is deleted, not before this branch merges.
