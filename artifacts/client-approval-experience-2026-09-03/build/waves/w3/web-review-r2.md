# Wave 3 — WEB lane adversarial review, round 2

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-web`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w3-web`,
ten commits over base `42d9057e4`. Nothing pushed, no production mutation, no touch of the
shared local Supabase stack, no `.env` read or written.

## Verdict

**fix** — no blocker survives; one major, and thirteen of the round-1 minors/nits are still
open (the fix round addressed the four blockers and the four majors only, and does not say
the rest were declined).

## Gates, run by the reviewer

```
pnpm --filter @patina/client-portal type-check   → tsc --noEmit, clean
pnpm --filter @patina/supabase   type-check      → tsc --noEmit, clean
pnpm --filter @patina/client-portal test         → 122 suites, 1766 tests, all passing
pnpm --filter @patina/client-portal test:coverage
    → All files 72.94 stmts / 67.98 branch / 72.78 funcs / 75.02 lines (floor 70/60/70/70 — held)
pnpm --filter @patina/supabase test              → 84 files, 1009 passing, 12 skipped
pnpm --filter @patina/notifications test         → 6 files, 89 passing
pnpm --filter @patina/client-portal lint         → 11 errors, 46 warnings (main: 10 errors, 45
    warnings — the branch adds ONE, `approval-ask.tsx:998`)
```

## Round-1 findings — verified

| id | state | evidence |
|---|---|---|
| W3W-01 snooze RPC signature | **FIXED** | `use-project-approvals.ts:783` posts `{ p_decision_id, p_kind }`; matches 00572:318. A test pins the argument-name set. |
| W3W-02 `none` vs `never` | **FIXED** | `DecisionSnoozeChoice` and `SNOOZE_ACTS` both say `never`; a test walks all four kinds. |
| W3W-03 success reported as failure | **FIXED** | `useSetDecisionSnooze` no longer routes through `parseActionResult`; takes `projectId` off its own input. Tested. |
| W3W-04 cadence tokens | **FIXED** | `right_away \| daily \| weekly_sunday` across the union, the zod enum, `@patina/types`, `preferences.ts`, the seed and `REMINDER_OPTIONS`. Byte-identical to the backend lane in four of six files. |
| W3W-05 dark default | **FIXED** | seed and the `??` fallback are `daily`, which is 00572's column DEFAULT; the self-contradicting comment is gone. |
| W3W-06 typed name absent | **FIXED** | 00573 adds `'clientSignature', decision.client_signature` to `get_project_decision_reviews` — diffed against 00569 and the ONLY difference is that key plus its comment; grants and comment preserved. `list_my_project_decision_reviews` (00467) delegates to it, so the client-scoped read carries it. |
| W3W-07 quiet-hours absolute | **FIXED (with residue, see W3W-24)** | The copy now names the weekly-summary and passed-date exceptions and matches `decisionMailHold` (sunday_quiet + before 8am) and `notification-digest` (weekly on Sunday in her zone). |
| W3W-08 hash never resolves an open ask | **FIXED** | `useAddressedApproval()` lifted; `ApprovalAsk` scrolls to itself. Two tests. |
| W3W-09 non-unique "What changed" landmark | **OPEN** | heading text is still a constant. |
| W3W-10 all four snooze acts pulse | **OPEN** | `loading={setSnooze.isPending}` on all four. |
| W3W-11 "when it's due" over a dateless row | **OPEN** | unconditional. |
| W3W-12 snooze invisible after reload | **OPEN** | no projection key added. |
| W3W-13 live studio identity, not the dispatch snapshot | **OPEN** | both pages read `useStudioIdentity`. Defensible (invoice-print precedent) but still not recorded as a ruling. |
| W3W-14 release grammar claim | **OPEN** | `releasedWorkSentence` unchanged; the docstring still claims the SQL and the TS "cannot disagree". |
| W3W-15 `stop N of M` | **OPEN** | `tracking-row.tsx:150` still prints it (sr-only); the notes' residue claim is unchanged. |
| W3W-16 backward fallback | **CLOSED by documentation** | the docstring now reads "The single act along the thread, forward first", which is the deliberate statement the finding asked for. |
| W3W-17 revisions nav label without the edition | **OPEN** | `Approval revision history for ${artifactTitle}`. |
| W3W-18 `seek` never cleared | **OPEN** | `if (index < 0) return;` unchanged; now the normal path. |
| W3W-19 `approvalsById` not memoized | **OPEN** | `threshold.tsx:470`. |
| W3W-20 contrast figure in the notes | **OPEN** | still 6.94:1. |
| W3W-21 keepsake outruns the receipt's fade | **OPEN** | `door-gate.tsx:404` has no `receiptInked` gate. |

## New in round 2

See the structured findings. The one that matters is **W3W-22**: the Record of Decision of an
approval she signed and the studio later superseded stamps SUPERSEDED, not APPROVED, because
`stampStateForApproval` puts disposition ahead of outcome — right on the doorstep, wrong on
a sheet whose whole job is P-26's "her outcome as the stamp".

## What is genuinely good here

- 00573 is a careful, minimal redefinition with a redefinition ledger in its header, and it
  does not collide with the backend lane's 00572 (which never touches that function) or the
  peer program's 00571.
- The record pages' auth story is honest: `list_my_project_decision_reviews` and the
  commercial bundle are caller-scoped, the middleware still gates sign-in (three-segment
  paths fall out of `retiredRouteTarget` unmapped, with a test), and the not-found copy
  never reveals whether the id exists.
- The IP-address refusal is tested on both sheets by grepping the rendered markup.
- No homeowner-facing string in the diff carries a refused word — scanned the whole added
  surface for gate / overdue / task / dashboard / AI outside comments and identifiers.
