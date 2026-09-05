# Wave 2 — designer lane, adversarial review R5 (2026-09-05)

Reviewer context: fresh, not the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` confirmed), branch `approvals/w2-designer`,
head `4bab4c827`, 18 commits off `main`.

Round 4 handed back three items (H-01, H-02, H-03) and carried twelve minors and
nits forward. This round verifies all fifteen, re-reads the whole diff, checks
every RPC argument against `00569` at the backend lane's current head
`4f23ae0c1`, and runs the gates.

**Verdict: ship.** No blocker, no major. H-01 is fixed and pinned by a new test;
H-02 is genuinely closed upstream (the emitter exists and I read it); H-03 has
largely dissolved because the web lane adopted this lane's exact interface hunk.
Two new minors and two new nits below, all of them boundary or record-keeping
calls rather than defects a tester would hit.

---

## Gates, run by the reviewer

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **PASS** — `TC_EXIT=0`, `tsc --noEmit` silent |
| 2 | `pnpm --dir <wt> --filter @patina/supabase type-check` | **PASS** — `SB_TC_EXIT=0` |
| 3 | `pnpm --dir <wt> --filter @patina/designer-portal lint` | **EXIT 1, unchanged** — `✖ 205 problems (2 errors, 203 warnings)`. The two errors are `piece-room-save-gate.test.tsx:159` (`import/first` rule not found) and `use-commercial-documents.test.ts:930` (`rules-of-hooks`); neither file is in this diff. The single warning naming a lane file — `project-approval-document.tsx:229` `react-hooks/exhaustive-deps` on `approvals` — is present on `main` at line 217 of the same file (`git show main:… | sed -n '215,230p'`); the line number moved, the warning did not. |
| 4 | `… test -- src/components/document/approvals/ …red-letter-zone… …signed-stamp… …client-mirror… …desk-derivation… …proposal-watch-derivation…` | **PASS** — `Test Suites: 8 passed, 8 total · Tests: 186 passed, 186 total` |
| 5 | `… test -- 'src/app/\(document\)/doc/\[id\]/page.test.tsx'` | **PASS** — `1 suite · 101 tests` |
| 6 | `pnpm --dir <wt> --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `Test Files 1 passed (1) · Tests 21 passed (21)` |
| 7 | *(wide)* `… test -- src/lib/document/__tests__/ src/components/document/` | **1 failed, 358 passed / 359 suites · 1 failed, 4476 passed / 4477 tests**. The one failure is the W1 clock-bound `client-note-composer.test.tsx` — "Unable to find … `Taken down Sep 4`", the DOM now printing `Taken down Sep 5`. `git diff main...HEAD --name-only \| grep -c client-note-composer` → `0`; `git log --oneline -1 main -- <that file>` → `ffb9cff6f`, a Wave-1 commit. Ruled to the integration steward (rulings, "Clock-bound test"). Not this lane's. |

Working tree clean (`git status --porcelain` returns only sandbox
"Operation not permitted" lines for `.env.example` reads, no modified paths).
Every commit is pathspec-scoped; no `git add -A`; nothing pushed; no migration
minted in this worktree; no production mutation.

---

## Round-4 findings, verified one at a time

| R4 | Verdict |
|---|---|
| **H-01** SIGNED/answered sage on the client mirror | **FIXED.** `client-mirror.tsx:154` is `text-[var(--color-mocha)]`; `grep -rn "color-sage" client-mirror.tsx` → no hits. New `__tests__/client-mirror.test.tsx` (4 cases) pins the class, the absence of sage in the enclosing `<section>`, the word-and-date reading with no `✓`/`✔` substitute, and a source scan against the token creeping back on a neighbouring line. Sweep boundary re-checked: `desk-derivation.ts`'s remaining sage is `DELIVERED` (`:839`) and `PULSE` (`:1014`) only, which the ruling keeps; `doc/[id]/page.tsx` has zero `color-sage`. |
| **H-02** nothing emits `whyAuthorName` | **CLOSED UPSTREAM — verified by reading, not by report.** `git show approvals/w2-backend:supabase/migrations/00569_…sql` at `4f23ae0c1`: `:83` adds `why_author_name text`; `:94-97` the CHECK (1–120 chars, and no name without a line); `:260-278` resolves the author server-side from the caller's profile with a first-whitespace-token given-name rule; `:954` emits `'whyAuthorName', CASE WHEN artifact.why IS NOT NULL THEN artifact.why_author_name END`. Exactly the key `use-project-approvals.ts:331` parses and `project-approval-document.tsx:1092` renders. Deleting the deferral comments in fix pass 3 was correct. |
| **H-03** shared-hook collision with the web lane | **LARGELY DISSOLVED — one line of steward work left.** `git diff main...approvals/w2-web -- packages/supabase/src/hooks/use-project-approvals.ts` at web head `a386921a4` now adds `why?: string \| null` and `whyAuthorName?: string \| null` with **byte-identical comment text** to this lane's, and `why: nullableString(row,'why')` / `whyAuthorName: …` at the same insertion point — identical additions merge without conflict. What remains: web adds `viewerRole: ProjectApprovalViewerRole \| null` (**required**) plus `viewerRole: 'lead'` fixture lines in `approvals-region-head.test.tsx:94` and `project-approval-document.test.tsx:109`. This lane never touched those two `baseReview` blocks (it composes with `{...baseReview, why: …}` spreads), so the web hunks apply cleanly and every spread inherits `viewerRole`. Steward: keep both fixture hunks, keep `oneLineWhy()` in create and supersede, re-run `@patina/designer-portal type-check` and both hook suites. |

### The twelve carried minors and nits — all still open, none regressed

Each re-verified against the current head, not taken on trust.

- **H-04** — `project-approval-document.tsx:789`: the helper `<p id="approval-why-help" aria-live="polite">` is still both the `aria-describedby` target and the live region, so each keystroke past 180 re-announces the whole sentence. **Fifth round open.**
- **H-05** — four SIGNED geometries. `signed-stamp.tsx:44` (square, `-rotate-[1.1deg]`, doubled rule at `inset-[2.5px]`, `tracking-[0.18em]`); `stamp.tsx:89-102` (the generic mark, `-rotate-[1.5deg]`, `rounded-[3px]`, `tracking-[0.1em]`, single rule) which `proposal-watch.tsx:192` draws for the same word on the same page; `settled-bar` via that same generic mark for the Record's Signed/Approved; and the web lane's `threshold/instruments/stamp.tsx`. Open.
- **H-06** — supersede cannot re-word the ask. `SupersedeState` is `Omit<ApprovalFormState,'phaseId'\|'why'>` (`:96`), `beginSupersede` seeds no `why`, `submitSupersession`'s payload (`:478-495`) carries none, so `oneLineWhy()` always yields `''` and the key is always omitted → 00569's `v_why := COALESCE(v_why_given, v_old_artifact.why)` (`:767`) always carries forward. Open, and correct behaviour for silence — only the *field* is missing.
- **H-07** — `onChange` still rewrites through `oneLine(...)`, so collapsing a mid-string whitespace run throws the caret to the end. Open.
- **H-08** — `onKeyDown` still `preventDefault()`s Enter with no `isComposing` guard. Open.
- **H-09** — nothing says the why is optional; the helper is still `One line. She reads it under the question.` and the test asserts `not.toBeRequired()` while every neighbouring field passes `required`. Open.
- **H-10** — see I-04 below; the rotation half of it has changed shape.
- **H-11** — `.slice(0, WHY_MAX_LENGTH)` on UTF-16 units. Re-reasoned: the browser's own `maxLength={200}` truncates first and `oneLine()` only ever shortens, so the slice is effectively unreachable in a browser; and Postgres `char_length` counts code points, so a 200-unit string never trips 00569's `> 200` guard (`:249`). Downgraded to a nit with low reachability, still open.
- **H-12** — `readableStatus` (`:137-146`) still returns `Changes requested`, `Needs discussion`, `Pending · overdue` against the ruled APPROVED/RETURNED/HELD family. Designer-facing, no refusal breached. Open.
- **H-13** — `configuration-snapshot-card.tsx:20` `approved: 'var(--color-sage)'`; a spec-safety state outside the ruling's three surfaces. Open, defensible; see I-02, which is the same boundary drawn more sharply.
- **H-14** — 00569 defines exactly seven functions (`grep -n '^CREATE OR REPLACE FUNCTION'`): the release sentence, the two create legs, supersede, `get_project_decision_reviews`, and the two respond legs. `get_project_decision_review` (singular) and `list_my_project_decision_reviews` are **not** among them, and `viewerRole` appears once, at `:966`, inside the plural projection. P-13 therefore lands on web + designer only this wave. Open, backend/wave-report item.
- **H-15** — the label still hard-codes the client's gender; it is the build sheet's own verbatim string. Open, copy ruling if wanted.

---

## New this round

### I-01 · minor · confidence 0.85 — the frozen why vanishes the moment the approval settles

`project-approval-document.tsx:1083-1097`. The `GateWhy` block lives inside
`GatePartBlock part="question"`, which is inside the `/* State A — the boundary
unfolded. */` branch at `:1071`. The other branch — taken when `isSealed(review)`
is true, i.e. `disposition !== 'active' || outcome === 'approved'` (`:154`) —
renders the seal, the title and the predecessor link, and no question and no why.

So the studio's own record shows her sentence while the approval is pending and
drops it at exactly the moment it becomes permanent. P-13's premise is that the
line is *frozen into the immutable artifact* and read under the question; on the
client's surfaces it survives the answer, and on the designer's it does not. The
client can still read what Leah wrote; Leah cannot.

Fix: render `GateWhy` in the sealed branch too (under the title, above the seal
row), or record in the wave report that the settled face is deliberately a
one-line receipt. A test either way — there is no case in
`project-approval-document.test.tsx` that renders a sealed review carrying a why.

### I-02 · minor · confidence 0.6 — the pigment sweep stops short of four approval-shaped marks on the same Document

The ruling names "the Desk, the Record page and the client mirror". This lane
moved `desk-derivation`, `red-letter-zone`, `doc/[id]/page.tsx`'s settled bar and
the mirror. Still sage on the same page, and all four are approval vocabulary
rather than material state:

- `components/document/margin-bodies.tsx:290` — `chosen`, in `--color-sage-ink`,
  on the selected option of a client decision. That is an **answered** mark, the
  exact word the ruling names, on the Desk's margin (`margin-rail.tsx:60` mounts
  `MarginItemBody`; `mobile-sheets.tsx:41` mounts the same body on mobile).
- `components/document/schedule/authorization-stamp.tsx:43` — `Authorized · A{n}`
  in `--color-sage` / `--color-sage-ink`.
- `components/document/schedule/milestone-row.tsx:39` and
  `schedule/rule-diamond.tsx:61` — `signed: { background: 'var(--color-sage)' }`,
  a green diamond for a signed milestone beside a settled bar that now reads mocha.

Any of these may be a deliberate boundary — `Authorized` is a studio-side release,
not a client outcome — but the boundary is currently unwritten, and a later reader
looking at `chosen` in sage next to `answered` in mocha will not be able to tell
which one is the mistake. Either sweep them or write the line in the wave report.

### I-03 · nit · confidence 0.9 — the cap is 200; the build sheet says ~140

`WHY_MAX_LENGTH = 200` (`project-approval-model.ts:157`), `maxLength={200}` on the
field, and 00569's CHECK and guard are both 200 — so the wave is internally
consistent and nothing breaks. The build sheet's P-13 row says *"a first-class
one-line 'why' (~140 characters)"*. Approximate, and 200 is the friendlier number,
but the divergence has not been written down anywhere and no round has raised it.
One line in the wave report closes it.

### I-04 · nit · confidence 0.9 — rotation now agrees across the wave; aging does not (restates H-10)

Read the two implementations side by side:

- `ux/02-ceremony-and-visual-language.md:18` specifies `-rotate-[2deg]`, and
  `:358` one aging step at thirty days (outer `0.88 → 0.74`, inner rule
  `0.42 → 0.26`, word ink unchanged).
- The web lane's `threshold/instruments/stamp.tsx` uses `rotation: -1.1` for every
  stamped state **and implements the aging step** — `border: 0.88`,
  `borderAged: 0.74`, `ages: true` on `signed`, `approved` excepted per its dials.
- This lane's `signed-stamp.tsx:44` uses `-rotate-[1.1deg]` and has **no aging
  step at all**, and `signed-stamp.test.tsx` now pins `-rotate-[1.1deg]` as a
  test assertion.

So the rotation deviation from the source document is uniform across both portals
(a re-ruling to record, not a split), while the aging step is a genuine
asymmetry: at thirty days the same SIGNED mark has faded on the client's screen
and has not on the studio's. Both belong in the wave report so that a later reader
does not "correct" one surface back toward the other or toward the source doc.

---

## Cross-lane facts this round established, for the steward

1. **`create_project_approval_decision(uuid, jsonb, text, text)`** — `p_why` is the
   fourth, trailing, defaulted argument (00569 `:538-543`), which is exactly what
   `useCreateProjectApproval` sends, and 00569 `:153` **DROPs** the pre-`p_why`
   three-argument signature. `supersede_project_approval_decision` likewise
   (`:585-594`). **Migrations must precede the designer portal in the deploy
   order** — this is the standing G-08 line and it is still owed in the wave report.
2. **`whyAuthorName` is a GIVEN name**, resolved server-side (00569 `:265-273`,
   the `_shared/branded-email.ts` `givenName()` rule, `left(…, 120)`).
   `whyAttribution()` trims and returns it verbatim, which is right. Email, the
   Threshold and the iOS row must render the same key with no reshaping, or one
   sentence gets signed three ways.
3. **The idempotency contract holds both ways**: the hook omits `p_why` entirely
   when there is no line, and 00569 folds `why` into the hashed request only when
   non-null (`:344-345`, `:690-696`), so a key minted before `p_why` existed still
   resolves to the same receipt.
