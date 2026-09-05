# W2 web lane — stage A adversarial review, round 3

Reviewer: a separate context; did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web` (branch `approvals/w2-web`).

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web
```

Commits (`git log --oneline main..HEAD`):

```
3eef9b0a4 docs(approvals): W2 web lane fix pass, round 3
861e109e8 fix(client): the why and the chair survive the projection mapper (W2B-01)
39482312a docs(approvals): W2 web lane stage-A adversarial review, round 2
1c7063c76 fix(client): the note said once, and no plate that cannot be drawn
ea2f51c55 docs(approvals): W2 web lane stage-A adversarial review, round 1
9b204f01e docs(approvals): W2 web lane notes, stage A
a546231e6 feat(client): the artifact shown, and the ask in her hand (P-14)
ca561dbcd feat(client): the weighing becomes a sentence (P-15)
d848a169c feat(client): three doors, three stamps (P-16)
814359f2e feat(client): eleven states, one stamp (P-17)
```

**Verdict: fix.** No blocker. Every briefed item is present and every gate is green. Round 3
dispatched exactly one fix — W2B-01 — and it is correct at the boundary it chose. But the fix
reaches into `packages/supabase/src/hooks/use-project-approvals.ts`, a file no Wave-2 lane owns and
which the **designer lane had already edited sixteen minutes earlier for the same field**. The two
edits do not conflict, so nothing will warn anyone: the merge produces a duplicate `why` in both the
interface and the parser literal, and integration goes red. That is the one major. Thirteen
findings from rounds 1 and 2 were not dispatched and still stand; two are new besides the major.

## Gates, run by the reviewer

`pnpm --dir …/apps/client-portal run type-check`

```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```

Clean. (`pnpm --filter` from a bare `cd` resolves to the **main** checkout in this agent — cwd
resets between Bash calls — and fails there on a pre-existing `.next/types/app/page.ts` error
unrelated to this branch. `pnpm --dir <path>` is the form that reaches the worktree.)

`… run test`

```
Test Suites: 117 passed, 117 total
Tests:       1616 passed, 1616 total
```

`… run test:coverage` → same 117/1616, **EXIT=0**, so the 70/60/70/70 floor holds.

Because the branch now edits two workspaces it does not own, I gated those too:

```
$ pnpm --dir …/packages/supabase run test
 Test Files  84 passed (84)
      Tests  995 passed | 12 skipped (1007)

$ pnpm --dir …/apps/designer-portal run type-check      → clean
$ pnpm --dir …/apps/designer-portal run test -- --testPathPattern "document/approvals"
Test Suites: 3 passed, 3 total
Tests:       45 passed, 45 total
```

## W2B-01 — fixed, and correctly

`ProjectApprovalReview` gains `why: string | null` and `viewerRole: ProjectApprovalViewerRole | null`;
`parseProjectApprovalReview` sets both, absence read as null rather than thrown, an unrecognised
role read as null. The keys match the migration byte for byte —

```
$ git show approvals/w2-backend:supabase/migrations/00569_*.sql | grep -n "'why'\|'viewerRole'"
283:    v_request := v_request || jsonb_build_object('why', v_why);
874:             'why', artifact.why,
884:             'viewerRole', CASE
```

— and the cast in `whyOf()` is gone. Four new parser tests pin carry-through, all three chairs,
absence, and an unknown role. The `costBaselineCents` cast deliberately stays, with the reason
written at the read; that closes W2B-06 as documented-dormant.

## The major — W2C-01

Two lanes fixed the same missing field in the same unowned file:

```
$ git log --format='%h %ad %s' --date=iso main..approvals/w2-designer -- packages/supabase/src/hooks/use-project-approvals.ts
8d6646f1b 2026-09-05 08:27:05 -0500 fix(approvals): the why is signed by the hand that wrote it (D1, P-13)
ec16e1145 2026-09-05 08:03:04 -0500 feat(approvals): the designer's one-line why, first on the composer's paper (P-13)
$ git log -1 --format='%h %ad %s' --date=iso 861e109e8
861e109e8 2026-09-05 08:43:10 -0500 fix(client): the why and the chair survive the projection mapper (W2B-01)
```

The designer lane inserts `why?: string | null` (optional) plus `whyAuthorName` **above** `context`;
the web lane inserts `why: string | null` (required) plus `viewerRole` **below** it. Different
hunks, so git merges both:

```
$ git merge-tree --write-tree approvals/w2-web approvals/w2-designer
d0aae440c5acf10fc8f0e6de0fb373605c2b891f      (EXIT=0 — no conflict)
$ git show d0aae440c:packages/supabase/src/hooks/use-project-approvals.ts | grep -n 'why\|viewerRole'
 66:  why?: string | null;
 74:  whyAuthorName?: string | null;
 80:  why: string | null;
 82:  viewerRole: ProjectApprovalViewerRole | null;
347:    why: nullableString(row, 'why'),
348:    whyAuthorName: nullableString(row, 'whyAuthorName'),
352:    why: nullableString(row, 'why'),
```

That shape does not compile. Reduced to a probe and run through the repo's own tsc:

```
$ tsc --noEmit --strict probe.ts
probe.ts(1,15): error TS2300: Duplicate identifier 'why'.
probe.ts(1,15): error TS2687: All declarations of 'why' must have identical modifiers.
probe.ts(1,67): error TS2717: Subsequent property declarations must have the same type.
probe.ts(3,44): error TS1117: An object literal cannot have multiple properties with the same name.
```

The lane's own notes anticipated exactly this hazard and checked only the backend branch: *"If the
backend lane also touched it the two changes must be merged by hand."* The backend branch does not
touch the file (`git diff --stat main...approvals/w2-backend | grep packages/supabase` → only
`database.types.ts`). The designer lane does, and was not checked.

**Fix at integration:** take one `why` — the designer lane's optional `why?: string | null` is the
looser of the two and satisfies both readers — keep `whyAuthorName` and `viewerRole` alongside it,
one `why: nullableString(row, 'why')` in the literal, and re-run both portals' type-check plus
`packages/supabase` tests. The same two designer-portal fixtures are edited by both lanes but merge
without duplication.

## The two other new findings

- **W2C-02** (minor) — the client surface signs the frozen why with the project's **lead designer**
  (`threshold.tsx:528`, `role === 'lead_designer'`), while the designer lane deliberately freezes
  `whyAuthorName`, *"so the sentence is signed by its author rather than by whoever is reading it: a
  studio has more than one designer, and the record is immutable and client-facing."* In a studio
  with a second designer the homeowner reads the note attributed to the wrong hand.
- **W2C-03** (nit) — `withdrawn` / `superseded` / `expired` take `--text-muted` for the **border**
  where ux/02 §5 rules `--text-subtle`. The token does not exist in the client portal
  (`grep -rn -- '--text-subtle' apps/client-portal/src` → no matches), so the substitution is
  forced; it is simply not recorded anywhere, and it collapses border and word ink onto one pigment.

## Rounds 1–2, re-checked line by line

| id | status now |
|---|---|
| W2B-01 why/viewerRole dropped by the mapper | **fixed** (above) |
| W2B-06 dormant `costBaselineCents` | **closed** — documented at the read, `approval-ask.tsx:816-821` |
| W2A-03 duplicate `approval-budget-breakdown` id | still `id="approval-budget-breakdown"` :329, `aria-controls` :357; `threshold.tsx:953` maps one ask per approval |
| W2B-02 executed date printed twice | still `<Stamp dateLabel={date(...)}>` :123 beside `Fully executed on {date(...)}` :127 |
| W2B-03 stamp reads ON PAPER from `anySignedOnPaper` | still `:74` → `:123`; `clientSignedOnPaper` :71 unused there |
| W2A-05 wall stamp APPROVED under "Accept the finished work" | still `state="approved"` :216 vs the act at :269 |
| W2A-06 ledger prints `$0` / `0 days` | still `signedMoney`/`signedDays` :437-450 |
| W2A-07 `$46,880 becomes $46,880` | still `&& baseline === null` on the all-zero return :453 |
| W2A-08 change-note instruction in the eyebrow register | still `font-mono text-[11px] uppercase` :1035 |
| W2A-04 previously.tsx not given `Stamp`; three words moved off mocha | still `STATE_INK` :39-44, leader a plain span |
| W2A-10 maker's mark inside the frame, bottom-right | still `absolute bottom-1.5 right-2` :265 |
| W2B-04 `<figcaption>` neither first nor last child | still budget → figcaption → mark, :245-268 |
| W2A-11 `projectApprovalAttentionLabel` has no production caller | `grep -rn projectApprovalAttentionLabel apps packages` → definition, its tests, one comment |
| W2A-12 DOM emits literal `SIGNED` beside three title-case siblings | still `STAMP_DIALS.signed.word ?? 'Signed'` :36 |
| W2A-13 every stamped word read aloud twice | still `role="img"` only when `dial.word === null`, stamp.tsx:286 |
| W2B-05 note survives a refused Return into an Approve | still note-first at :784, latch only de-duplicates |
| W2A-14 docs commit 9b204f01e carries a src edit | historical; 3eef9b0a4 is docs-only |

## What is clean

- **Every briefed item present.** P-17 eleven states / four dials / no fill / no shadow / mono caps
  / −1.1° / one thirty-day step, with `ages` matching ux/02 §5 rule 3 (terminal states age, open
  states never do). P-16 three peers on one variant, and the assertion is real — `variants.size`
  over the rendered `da-*` classes, `approval-ask.test.tsx:213`. P-15 sentence + ledger with the
  four briefed composer cases. P-14 plate, twelve-character maker's mark, clay pull-quote, `— Leah`,
  narrow-viewport disclosure, and the fail-closed budget guard preserved **verbatim** against
  `git show main:…` lines 219-224.
- **Copy byte-exact** against build-sheet P-16 for both labels and all three consequences.
- **Refusals hold.** No `gate` / `task` / `overdue` / `dashboard` / `AI` in any homeowner-visible
  string (every `gate` on the diff is a comment or a DOM id); no sage, green, red, checkmark, badge,
  emoji, shadow. `changes_requested` is RETURNED on the stamp and `Returned` in prose
  (`client-attention.ts:61`), never Declined. Terracotta on exactly one state, no sage counterpart,
  both asserted.
- **Commit hygiene.** 24 files, no stray files, no `.env`, no `.claude/`, program docs force-added,
  Conventional subjects, no trailers, no `merge(...)`. Nothing stage B owns
  (`scored-action.tsx`, `door-gate.tsx`, `door-acts.tsx`, `scope-change-ask.tsx`) is touched.

## For the orchestrator

The lane was right that W2B-01 had to be fixed somewhere. The lesson is the ownership rule, not the
fix: a file no lane owns needs one lane told to own it, and the check before editing has to sweep
**every** sibling branch, not the one that seemed related.
