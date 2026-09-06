# Wave 3 — WEB lane adversarial review, round 3

Reviewer context is separate from the implementer's. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-web`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w3-web`,
HEAD `4645c6cb2`, twelve commits over `main`.

## Gates, run by the reviewer

| Gate | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/client-portal test` | **PASS** — 122 suites, **1776** tests |
| `pnpm --filter @patina/client-portal test -- --coverage` | **PASS** — All files **73** stmts / **68.11** branches / **72.83** fns / **75.06** lines, over the 70/60/70/70 floor |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/shared` · `@patina/types` · `@patina/notifications` type-check | **PASS** |
| `pnpm --filter @patina/notifications test` | **PASS** — 6 files, 89 tests |
| `pnpm --filter @patina/designer-portal type-check` | **PASS** — run because this lane edits `@patina/shared`, `@patina/types` and `@patina/notifications`; nothing outside the four packages reads `ReminderCadence` |
| `pnpm --filter @patina/client-portal lint` | **RED, and one error worse than main** — `✖ 57 problems (11 errors, 46 warnings)` on the branch vs `✖ 55 problems (10 errors, 45 warnings)` in the main checkout. The new one is `approval-ask.tsx 998:7 react-hooks/set-state-in-effect` (W3W-23). Lint is not a lane gate and was already red; the delta is the lane's. |

Print routes rendered in jest and the markup grepped for a dotted quad: the lane's own
`never prints an IP address` tests do exactly this on both sheets, and both pass.

## The round-2 finding

**W3W-22 (major) — FIXED, correctly.** `recordStampStateForApproval` is outcome-first,
`stampStateForApproval` is untouched so the doorstep keeps its precedence, and the supersession
becomes prose under the mark (`supersededNoteSentence`) dated from the successor's own row or
left undated. A refusal test pins that the note never reaches for undone/reopened/invalid/void.
The withdrawal fallback is sound: 00465:668 permits withdrawal only on `draft`/`pending`, so a
withdrawn row can carry no outcome and disposition is the only mark left to press.

## One earlier finding RETRACTED on the schema's evidence

**W3W-11 is not a defect.** The claim was that "I'll ask you when it's due." and "I won't remind
you again until it's past its date." promise a date the row may not have, because
`client_decisions.due_date` is nullable while the projection's `dueAt` is the artifact's NOT NULL
column. For a Stage-2 approval those two cannot diverge:
`project_approval_artifacts.due_at` is `NOT NULL` (00463:145) and the artifact guard raises
`artifact question, due date, phase, or impacts are incoherent` when
`NEW.due_at IS DISTINCT FROM v_decision.due_date` (00463:735); `due_date` is then frozen for the
life of the row (00463:537, "Stage-2 request identity and frozen question are immutable").
`RemindMe` renders only for `ProjectApprovalReview` rows, every one of which has an artifact.
So `when_due`'s `COALESCE(due_date, 'infinity')` always resolves to the real date on this
surface, and both sentences are honest. No change owed; the lane's "unchanged and still true"
note was right.

## Findings — round 3

Nothing new rises to blocker or major. Everything below is minor or nit; the two new minors are
first, then the carried set re-verified at this HEAD.

### New

**W3W-32 (minor · 0.85) — the cadence picker does not degrade to the retired spellings, so a row
that still carries one shows a radio group with nothing selected.**
`details-sheet.tsx:642` is `(prefs.reminder_cadence ?? "daily") === opt.value` against options
valued `right_away` / `daily` / `weekly_sunday`. A row carrying `immediate` or `daily_digest`
matches none of the three: every radio renders unchecked, and the section silently claims she has
chosen nothing. The lane brief said in terms "degrade to the two old ones if the column still
carries them"; `getReminderCadence` in `@patina/notifications` already maps both forward and is
not used here. 00572's `UPDATE` and its `normalize_reminder_cadence` trigger close the window
once the migration lands, which is why the tests pass — but the portal is the side that renders
before it has read anything, and this is precisely the state the brief asked it to survive.
*Fix:* normalise on read — `const checked = getReminderCadence(prefs)` — or inline the two-case
map beside `REMINDER_OPTIONS`.

**W3W-33 (minor · 0.7) — the keepsake's letterhead prints "Your studio" until (and unless)
`resolve_studio_identity` answers.**
Both sheets gate rendering on the row query alone (`reviews.isLoading` /
`bundle.isLoading`) and then read `identity.data?.name?.trim() || 'Your studio'`.
`useStudioIdentity` is `enabled: !!(projectId || designerId)` (`use-studio-identity.ts:62`) and
the projectId is only known once the row has resolved, so the identity round-trip *starts* after
the sheet is already on screen: the letterhead is guaranteed to paint at least one frame as
"Your studio", and stays there for the life of the page if the RPC errors or returns no row
(`EMPTY_IDENTITY`). This is the one line on the sheet that says whose record it is, on a page
whose entire purpose is to be printed. The invoice print page has no letterhead, so the
precedent this lane follows does not cover it.
*Fix:* hold the sheet while `identity.isPending` (it is a fast, cached read), or print no
letterhead line at all rather than a placeholder one.

**W3W-34 (nit · 0.9) — `web-notes.md`'s "Contract to reconcile at integration" section is stale
and states the wrong RPC signature and the wrong cadence token; the correction is seventy lines
below it.**
Lines 187–210 still say `set_decision_snooze(p_decision_id uuid, p_choice text, p_timezone text)`,
the fourth kind `'none'`, and "**The third cadence token is `weekly_digest`**". The shipped code
posts `{ p_decision_id, p_kind }`, spells the fourth kind `never`, and writes `weekly_sunday` —
all three corrected in "Fix round 1" further down. Together with the header line still reading
"No migration minted" (W3W-27) and the gate table still reading 1762 tests, the first half of
the document contradicts the branch. The integration steward reads it top-down.
*Fix:* strike or mark the superseded section; the fix rounds already hold the truth.

**W3W-35 (nit · 0.5) — the snooze acts are offered on a draft edition, before anything has begun
asking.**
`RemindMe` is gated on `viewerAnswers && !recordedOutcome && !awaitingStudioIssue &&
disposition === 'active'` (`approval-ask.tsx:1710-1713`), which admits
`lifecycleStatus === 'draft'` — the state whose own eyebrow reads "Your approval · read the
edition first" and whose only act is `Review exact edition`. "I'll ask you tomorrow morning."
answers a reminder rail that has not started; reminders run against `pending`.
*Fix:* add `approval.lifecycleStatus === 'pending'` to the gate, or leave it and say why.

**W3W-36 (nit · 0.5) — "A notification on your phone keeps the same hours" is one clause wider
than the push leg's rule.**
The paragraph names the Sunday hold and the 8am floor, then says the phone "keeps the same hours
and stops at 8pm". `push_deliver_after` (00572:463-484) tests the hour only — `IF v_hour >= 8 AND
v_hour < 20 THEN RETURN NULL` — with no weekday branch, so a push may land at ten on a Sunday
morning. "The same hours" reads, one sentence after "nothing on Sunday", as covering Sunday too.
*Fix:* "keeps the same hours of the day" — or add the Sunday hold to the push leg (backend).

### Carried, re-verified unfixed at `4645c6cb2`

| id | sev · conf | where | one line |
|---|---|---|---|
| W3W-23 | minor · 0.95 | approval-ask.tsx:998 | the eleventh eslint error; main has ten, and none in this file |
| W3W-24 | minor · 0.8 | details-sheet.tsx:529 | the quiet-hours sentence still misses an exception — **evidence corrected**, see below |
| W3W-25 | minor · 0.65 | approval-ask.tsx:1196 | R11's baseline is `targetTotalCents − costCentsDelta`; nothing in the schema ties the delta to that total (00463's guard ties it to the decision options, not to a budget) |
| W3W-26 | minor · 0.6 | approval-ask.tsx:330 | "what changed" subtracts two independently-composed deltas; 00464:1367 confirms a **responded** decision may be superseded, so the predecessor's impact may already be applied |
| W3W-09 | minor · 0.7 | approval-ask.tsx:1470 | two "What changed since your last answer" landmarks share one accessible name |
| W3W-10 | minor · 0.9 | approval-ask.tsx:915 | four snooze acts, one `setSnooze.isPending` — pressing any turns all four into "Setting" |
| W3W-12 | minor · 0.7 | approval-ask.tsx:870 | no projection carries snooze state: after a reload "Don't remind me" is invisible, and **no act on the surface restores ordinary reminders** — all four choices are snoozes |
| W3W-13 | minor · 0.6 | record-sheet.tsx:150 | live studio identity on a keepsake; a rebrand rewrites an old sheet |
| W3W-14 | minor · 0.85 | record-of-decision.ts:97 | the docstring's "cannot disagree about one act" still stands over two different sets of nouns, and the approval sheet passes no release sentence at all |
| W3W-15 | nit · 0.85 | tracking-row.tsx:150 | `stop ${stopIndex + 1} of ${…length}` survives, sr-only; the sweep's grep cannot match it |
| W3W-17 | nit · 0.75 | approval-ask.tsx:1731 | the revisions `nav` takes the title without the edition the discussion landmark beside it now carries |
| W3W-18 | nit · 0.8 | approval-ask.tsx:996 | `if (index < 0) return;` leaves `seek` set; `approvals` is a fresh array each render, and every `ApprovalAsk` mounts its own `hashchange` listener |
| W3W-19 | nit · 0.9 | threshold.tsx:470 | `approvalsById` rebuilt every render, no `useMemo` |
| W3W-20 | nit · 0.9 | web-notes.md:220 | the fixed kind line is **6.79:1**, not 6.94 (`#5C4A3C` on `#EEE6DB`, computed); the retired mix's 3.40:1 is exact. The code comment now says "6.9:1", also high |
| W3W-21 | nit · 0.8 | door-gate.tsx:404 | "Keep a copy" is gated on `receipt`, the sentence it keeps on `receiptInked` — the act arrives 420ms before the promise |
| W3W-27 | nit · 0.95 | web-notes.md:5 | header still says "No migration minted"; the same file mints 00573 |
| W3W-28 | nit · 0.85 | details-sheet.tsx:130 | `details-sheet.tsx` **will** conflict with `approvals/w3-backend` (both edited the `REMINDER_OPTIONS` region; this lane alone added the quiet-floor paragraph and the past-date clause). The notes still name `packages/shared/src/types/notifications.ts` as "the one file that will conflict". Verified by diffing the two worktrees: the other four files are byte-identical, that one and details-sheet are not |
| W3W-29 | nit · 0.9 | details-sheet.tsx:141 | the picker is hard-coupled to 00572 (00278's CHECK is what main carries); belongs in the wave report's deploy section, not only the lane notes |
| W3W-30 | nit · 0.7 | decisions/[id]/record/page.tsx:73 | a typed URL still prints a sheet for a withdrawn, never-answered ask — and fix round 2 **pinned that behaviour with a test** while `web-notes.md:86` still says the keepsake is offered "never on a gate withdrawn before any answer — that sheet would have nothing to print". The doc and the test now disagree |
| W3W-31 | nit · 0.7 | approval-ask.tsx:900 | the four snooze acts are not a group; the cadence fieldset on the same wave does it correctly |

**W3W-24, evidence corrected.** The round-2 write-up blamed `decision_resolved`. That kind is the
DESIGNER's letter (`decision-notify.ts:889`, `audience: "designer"`, "Open your desk"), so it is
not approval mail she reads. The real bypass is the client receipt itself:
`deliverDecisionReceipt` (`decision-notify.ts:1237`) never calls `decisionMailHold` at all — it
checks preferences, the log dedupe and then `sendCompliantEmail`, which carries no quiet-hours
branch — and its own docstring says so deliberately ("sent whenever the response lands"). So an
approval answered at 3am on a Sunday sends her a co-branded "You approved …" letter at 3am on a
Sunday, and the sentence "Approval mail waits for the morning: nothing before 8am in your time
zone, and nothing on Sunday — except the weekly summary" is one exception short. The finding
stands; the fix is the same (name the receipt, or scope the promise to reminders).

## What was checked and found sound

- **P-26 routes.** Both render; `retired-routes.ts` leaves them unmapped deliberately, with the
  arms commented and `retired-routes.test.ts` pinning both as `null` while every neighbouring
  address still folds. Neither path is public in `middleware.ts`, so a signed-out arrival keeps
  the record as `callbackUrl`. Consent sentences are exactly the three the brief names. The
  checksum is twelve characters, lower-cased, at the footer. No IP, asserted twice per sheet.
  Print CSS forces white, kills shadows, and stands the mark upright with `!important` over the
  inline transform — verified against `Stamp`'s inline `transform` in `stamp.tsx:277`.
- **00573.** Diffed the whole function body against 00569's: the only difference is
  `'clientSignature', decision.client_signature` and its comment. Additive,
  `CREATE OR REPLACE`, safe on Strata. `list_my_project_decision_reviews` delegates to
  `get_project_decision_reviews` (00467:171), so the client read carries the new key. The
  backend lane's 00572 does not redefine this function, so 00572 → 00573 is a clean order.
- **The snooze hook against the RPC it calls.** `set_decision_snooze(p_decision_id, p_kind)`,
  four kinds `tomorrow_morning | sunday | when_due | never`, returning
  `{decisionId, kind, snoozedUntil, timeZone}` and no `projectId` — the hook posts exactly those
  argument names and takes the projectId off its own input. Matches 00572:336-434 line for line.
- **R16.** The surface refuses to draw a snooze over a past-due approval and says why
  ("This one is past its date, so its notice stands."); the RPC's own comment and
  `decisionMailHold` keep the overdue notice and a superseding edition outside every snooze; the
  in-app leg is never deferred (`push_deliver_after` is the push leg's alone); the default is
  `daily`, the quiet one, pinned by a test named for exactly that.
- **Vocabulary.** No homeowner-visible "overdue", "gate", "task", "dashboard", "AI", badge,
  count chip or emoji in any added string; every occurrence of "overdue" in the diff is a
  comment, a field name or a test assertion that the word does *not* appear.
- **Cross-package blast radius.** `ReminderCadence` moved to a new three-value union in
  `@patina/shared` and `@patina/types`; nothing in the designer or admin portals reads
  `reminder_cadence` at all, and `designer-portal type-check` passes on this branch.
- **Working tree.** Clean; twelve commits, all Conventional, no trailers, no `merge(...)`
  subject, no forbidden path touched, program docs force-added as ruled.

## Cross-lane advisory, for the orchestrator rather than this lane

00572's data migration maps **every** existing `immediate` row to `right_away` — including the
rows that only ever held `immediate` because it was the old column DEFAULT and their owner never
chose anything. The "no dark defaults" rule is honoured for new rows and for the picker's
fallback, but the migration hands every silent incumbent the loudest of the three. That is the
backend lane's file, not this one's, and it may well be the ruling Kody wants; it is worth
stating out loud before the migration is applied to Strata, because it cannot be un-run.

## Verdict

**ship.** No blocker, no major. W3W-22 is fixed and tested; the gates the lane brief names are
green with the coverage floor held. What remains is one brief-compliance gap the migration
happens to paper over (W3W-32), one placeholder on a printed letterhead (W3W-33), and a carried
tail of copy, a11y, perf and documentation nits that the orchestrator can rule on at integration.
