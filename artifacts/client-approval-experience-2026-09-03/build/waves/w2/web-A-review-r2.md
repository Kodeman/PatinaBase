# W2 web lane — stage A adversarial review, round 2

Reviewer: a separate context; did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web` (branch `approvals/w2-web`).
`git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`.

Commits under review (`git log --oneline main..HEAD`):

```
1c7063c76 fix(client): the note said once, and no plate that cannot be drawn
ea2f51c55 docs(approvals): W2 web lane stage-A adversarial review, round 1
9b204f01e docs(approvals): W2 web lane notes, stage A
a546231e6 feat(client): the artifact shown, and the ask in her hand (P-14)
ca561dbcd feat(client): the weighing becomes a sentence (P-15)
d848a169c feat(client): three doors, three stamps (P-16)
814359f2e feat(client): eleven states, one stamp (P-17)
```

**Verdict: fix.** No blocker. Every briefed item is on the branch and both gates are green. One
major stands — and it is not in this lane's files: the projection mapper drops the `why` column the
backend lane's 00569 now emits, so P-14's why-line renders nowhere after integration. Ten of the
round-1 findings were never dispatched and still stand; four are new.

## Gates, run by the reviewer

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web/apps/client-portal run type-check`

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web/apps/client-portal
> tsc --noEmit
```

Clean — nothing past the banner. (Note: a bare `pnpm --filter @patina/client-portal type-check`
resolves to the **main checkout** in this agent, because cwd resets between Bash calls; that run
fails on a pre-existing `.next/types/app/page.ts` error unrelated to this branch. `pnpm --dir` is
the form that reaches the worktree — the lane's notes say the same.)

`… run test`

```
Test Suites: 117 passed, 117 total
Tests:       1615 passed, 1615 total
Snapshots:   0 total
Time:        10.975 s
```

`… run test:coverage` → same 117/1615, **exit code 0**, so the configured floor
(lines 70 / branches 60 / functions 70 / statements 70) holds. The named gate `test` is plain
`jest`, so the floor is enforced only by `test:coverage`; I ran both.

## Round-1 findings, re-checked

| id | status |
|---|---|
| W2A-01 retried Return says the note twice | **fixed** — `notePosted` ref latches the accepted text (`approval-ask.tsx:694`, `:784`); two tests pin it. No regression found. |
| W2A-02 cover-image plate cannot fire | **fixed** — `coverImageOf()`, the `<img>` leg and the five tests pinning the invented keys are gone; the reason is recorded in `ArtifactPlate`'s doc comment. |
| W2A-03 duplicate `approval-budget-breakdown` id | **not fixed** — reproduced (see below). |
| W2A-04 previously.tsx not given the Stamp; three words changed pigment | **not fixed**. |
| W2A-05 wall stamp says APPROVED under "Accept the finished work" | **not fixed** (`wall-gate.tsx:269` still reads "Accept the finished work"). |
| W2A-06 ledger prints `$0` / `0 days` | **not fixed**. |
| W2A-07 baseline with no movement reads "$46,880 becomes $46,880" | **not fixed**. |
| W2A-08 change-note instruction in the eyebrow register | **not fixed**. |
| W2A-09 cover image 404 leaves a broken frame | **moot** — the cover branch is gone. |
| W2A-10 maker's mark inside the frame, bottom-right | **not fixed**. |
| W2A-11 `projectApprovalAttentionLabel` has no production callers | **not fixed** — it now has tests; still no caller. |
| W2A-12 DOM emits literal `SIGNED` beside three title-case siblings | **not fixed**. |
| W2A-13 every stamped word read aloud twice | **not fixed**. |
| W2A-14 docs commit carries a code change | historical; unchanged. |
| W2A-15 a cover would hide the budget figures | **moot** — the cover branch is gone. |

## The major

### W2B-01 · P-14's why-line renders nowhere after integration

`whyOf()` (`approval-ask.tsx:211-214`) reads `approval.why` through a cast, exactly as briefed
("code defensively against its absence"). The backend lane's 00569 **does** project it —

```
$ git show approvals/w2-backend:supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql | grep -n "'why'"
279:    v_request := v_request || jsonb_build_object('why', v_why);
564:             'why', artifact.why,
```

— but the row never reaches the surface with it. `parseProjectApprovalReview`
(`packages/supabase/src/hooks/use-project-approvals.ts:299-333`) returns an object **literal**,
field by field; `why` is not among the twenty-eight fields it copies, and neither is the
`viewerRole` the same migration adds. The backend branch does not widen it either:

```
$ git diff --stat main...approvals/w2-backend | grep packages/supabase
 packages/supabase/src/database.types.ts            |    9 +
```

Nine lines of generated types, nothing in the hook. So after both branches merge,
`data-testid="approval-why"` never renders and the studio co-member's chair is never known to the
client app. Neither lane owns the file that would fix it. **Owner: the integration steward or
whoever holds `packages/supabase` for this wave** — add `why: nullableString(row, 'why')` and
`viewerRole` to the parser, widen `ProjectApprovalReview`, and drop the two casts in
`approval-ask.tsx` once the type carries them.

The lane flagged this itself, at the end of `web-notes.md`. It is reported here as major because
the item does not ship without it, not because the lane failed to do its part.

## The rest

Detail, evidence and suggested fixes are in the structured findings returned with this review.
The four new ones, in short:

- **W2B-02** the executed banner prints the date twice — the stamp reads `SIGNED August 3, 2026`
  (`commercial-document-shell.tsx:120-126`) and the prose beside it reads
  `Fully executed on August 3, 2026.` (`:127-130`).
- **W2B-03** that stamp takes `signed_on_paper` from `anySignedOnPaper` (`:74`, `:123`), so a
  homeowner who signed in the portal sees her own mark stamped ON PAPER and upright when the
  *studio* countersigned on paper. `clientSignedOnPaper` (`:71`) already exists two lines above.
- **W2B-04** `<figcaption>` is not the first or last child of its `<figure>` — the maker's-mark
  span follows it (`approval-ask.tsx:249-268`), which the HTML content model for `figure` forbids.
- **W2B-05** `costBaselineCents` exists in no migration in the repo (`grep -rn "cost_baseline"
  supabase/migrations/` → no matches; not in 00569 either), so P-15's baseline leg is unreachable
  on real data. It is a pure, tested composer, so this is a note rather than a defect.

## What is clean

- **Every briefed item is present.** P-17 eleven states / four dials / no fill / no shadow /
  mono caps / −1.1deg / thirty-day step; P-16 three peers on one variant (`OUTCOME_VARIANT =
  'secondary'`, and the test asserting one `da-*` class set across the three doors is a real
  assertion, not a vacuous one — `ScoredAction` emits `da-act da-secondary`); P-15 sentence plus
  ledger with the four briefed test cases; P-14 plate, twelve-character maker's mark, clay
  pull-quote (`--accent-primary` resolves to `--color-clay`, globals.css:42), `— Leah`, the
  narrow-viewport scored disclosure, and the fail-closed budget guard preserved verbatim.
- **Copy is byte-exact** against the build sheet for all three consequences, both labels and the
  change-note instruction.
- **The refusals hold.** No `gate` / `task` / `overdue` / `dashboard` / `AI` in any rendered
  string on the diff; no sage, no green, no red, no checkmark, no badge, no emoji, no shadow.
  `changes_requested` is RETURNED on the stamp and `Returned` in prose
  (`client-attention.ts:61`), never Declined. Terracotta appears on exactly one state, with no
  sage counterpart, and the stamp suite asserts both.
- **The three new ink tokens match the designer portal's own values byte for byte**
  (`#7C5E30` / `#9C5340` / `#79651E`, designer-portal `globals.css:34-40`).
- **Commit hygiene.** Eighteen files, all inside `apps/client-portal/src` plus the two force-added
  program docs. Nothing stage B owns (`scored-action.tsx`, `door-gate.tsx`, `door-acts.tsx`,
  `scope-change-ask.tsx`) is touched. No `.env`, no `.claude/`, no stray files. Conventional
  subjects, no trailers, no `merge(...)`.
