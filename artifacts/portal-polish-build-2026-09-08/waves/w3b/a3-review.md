# Lane A3 review — concept-render record + remove hooks (PP-7 follow-up)

**Reviewer context.** Separate from the implementer; did not write any of this diff. Read
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Global constraints, Shared-state
ownership, the Wave 3 section — Wave 3b/Lane A3 has no dedicated plan section; it is a
follow-up wave dispatched after Wave 3 shipped), `docs/design/house-sheet/SPEC.md` §A/§F,
`apps/designer-portal/CLAUDE.md`, `artifacts/portal-polish-build-2026-09-08/ship/w3-ship.md`,
`waves/w3/d1-rereview.md`, and Wave 3's `d4-impl.md` (read off `origin/portal-polish/d4` — it is
not on `main`, same gap D1's and A3's own reports note). Read `waves/w3b/a3-impl.md` in full
(only found in the worktree / on `origin/portal-polish/a3`; not yet on `main` or in the shared
artifacts tree — flagging this path gap below, consistent with what D1/D6's re-reviewers already
flagged for their own lanes). Cross-checked A3's actual assignment against Wave 3's
`d6-review.md`, which is where the ask ("Orphaned storage object on Remove", no read/remove hook
existing) originates.

Inspected `origin/main...origin/portal-polish/a3` as a diff and the worktree at
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a3` (confirmed `git rev-parse
--show-toplevel` resolves there, `git log -1` = `e58e98421`, matching `git ls-remote origin
portal-polish/a3`). Ran the lane's gate myself from that worktree — see Evidence.

## Verdict

**approve.** No P1/P2 findings. This lane is a pure `@patina/supabase` hooks addition (no UI, no
migration, no RLS change) and stays inside its three-file pathspec exactly. Three P3s below, all
informational/cosmetic — none blocks merge.

---

## Scope check — what A3 was actually asked to do

Wave 3's `d6-review.md` (P3, "Orphaned storage object on Remove") and its "Hook usage vs. A2's
actual shape" section independently confirmed that `use-room-concept-render.ts` on `main` at Wave
3 time exposed **upload only** — no read hook, no remove hook, no signer — and that D6's own
component (`concept-render-upload.tsx`) worked around the gap with local, unshared
`readConceptRender`/`clearConceptRender` helpers that never delete the underlying storage object
on Remove. A3's brief (summarized in its own "Goal" line, not quoted verbatim from a plan
section — see note below) is to close exactly that gap: add
`useRoomConceptRenderRecord`/`useRemoveRoomConceptRender`, export them, and fix the
delete-before-null ordering D6 flagged. The diff does exactly this and nothing more.

**Note on "the implementer's brief (quoted in its report)":** `a3-impl.md` does not literally
quote a formal brief document — Wave 3b has no plan-file section the way Waves 1–3 do, so there is
no canonical text to quote. Its "Context read" section stands in for one. I verified the lane's
actual scope by cross-reading `d6-review.md` directly rather than trusting the report's own
characterization, and it matches. Not a lane defect; noting it so a future reviewer doesn't go
looking for a brief that doesn't exist in this wave.

---

## Pathspec discipline

```
$ git diff --stat origin/main...origin/portal-polish/a3
 .../waves/w3b/a3-impl.md                           | 174 +++++++++
 .../__tests__/use-room-concept-render.test.ts      | 389 ++++++++++++++++++---
 packages/supabase/src/hooks/index.ts               |  15 +-
 .../supabase/src/hooks/use-room-concept-render.ts  | 166 ++++++++-
 4 files changed, 674 insertions(+), 70 deletions(-)
```
Exactly the report + the three files the lane claims. `apps/designer-portal`,
`apps/client-portal`, `packages/supabase/src/database.types.ts`, and every migration file are
untouched. `git ls-remote origin portal-polish/a3` = `e58e98421...`, matching local `HEAD` — the
push landed.

## House sheet / global constraints

N/A for the substance of this lane — no component, no CSS, no markup. Confirmed mechanically
rather than assumed:
```
$ git diff origin/main...origin/portal-polish/a3 | grep '^+' | grep -oE '#[0-9A-Fa-f]{3,8}' | sort -u
(empty)
$ git diff origin/main...origin/portal-polish/a3 | grep '^+' | grep -iE 'shadow|badge|pill|spinner|✓'
(only the report file's own prose quoting "D4 (zero shadows)" — not a code hit)
```
No new hex, no shadow/badge/pill/spinner, no truncation, nothing UI-shaped to check against the
house sheet. The D7-flavored accessibility checklist items in this review's brief (combobox
completeness, 3:1 rest rule, lead-line-links-the-client) belong to Lane D7's actual scope
(confirmed: `d7-impl.md` on `origin/portal-polish/d7` is the lane that did that work) and do not
apply here — A3 touches zero files under `apps/designer-portal` or `apps/client-portal`.

## Designer shadow gate

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total
Tests:       63 passed, 63 total
```
Byte-identical to `origin/main` (A3's diff never touches `apps/designer-portal`) — confirmed via
`git diff --stat` above already showing zero designer-portal files, and the suite is green.

## Behavioral review

- **`useRoomConceptRenderRecord`** — `useQuery`, `enabled` only with both ids present; reads the
  exact four columns 00580 added, `.eq('id', roomId).eq('project_id', projectId).maybeSingle()`;
  returns `null` (not a throw) both when the row is absent and when `concept_render_url` is null.
  A row-read error still rejects. Signs the stored path via `storage.createSignedUrl(path, 3600)`
  and degrades to `url: null` (not a throw) on a signing failure, matching D6's own
  try/catch-around-sign choice for the same data. Verified the select column string, bucket name,
  and TTL constant match by reading the diff directly, not by trusting the report.
- **`useRemoveRoomConceptRender`** — deletes the storage object first
  (`storage.remove([path])`); only nulls the four `project_rooms` columns if that succeeds; a
  failed delete never nulls the row (asserted by test and confirmed by reading the mutationFn:
  the `rowError` update block is unreachable unless `removeError` is falsy). This is the direct
  fix for D6's reported P3 ("clearConceptRender never deletes the object") and lands the right
  ordering discipline — deliberately mirroring the existing upload hook's "write only if the
  storage step landed" precedent rather than inventing a new discipline.
- **Invalidation** — `onSuccess` invalidates the new record key plus the two pre-existing keys
  (`project-rooms`, `client-selections`) — three calls, asserted individually and by count
  (`toHaveBeenCalledTimes(3)`).
- **Not wired into any component.** `apps/designer-portal`'s `concept-render-upload.tsx` (D6)
  keeps its own local helpers unmodified — confirmed zero designer-portal files in the diff. This
  lane changes zero runtime behavior in the shipped app; it is additive library surface only. The
  report is explicit and correct about this ("Not done" / "For the integration lane" sections) —
  it does not overclaim a fix that isn't actually live yet.

## Tests

`use-room-concept-render.test.ts` grows from 6 to 17 tests across two new `describe` blocks. Read
the full diff, not just the report's summary:
- Record hook: null-on-no-path, null-on-absent-row, the happy path (asserts the exact select
  string, both `.eq()` calls, bucket name, `createSignedUrl` args, and the returned shape
  field-by-field), signing-failure degrades to `url: null`, row-read error rejects, `enabled`
  false/false/true across the three id combinations, key shape.
- Remove hook: delete-before-null asserted two ways — the four-null payload plus a mechanical
  `remove.mock.invocationCallOrder[0] < update.mock.invocationCallOrder[0]` check (a real ordering
  assertion, not just "both were called"); delete failure → `update` never called; a failed row
  write after a successful delete still rejects; exactly three invalidations with the exact keys.

This is genuine behavior coverage, not markup-shaped assertions (the P3 the D1 re-review flagged
for a different lane doesn't apply here — there is no markup). No test doubles as a tautology; the
ordering and never-called assertions are the kind that would actually catch a regression.

## Evidence — gate run myself, from the worktree

```
$ cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a3 && git rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a3
$ git log --oneline -1
e58e98421 docs(portal-polish): A3 implementation report

$ pnpm --filter @patina/supabase type-check
> tsc --noEmit          (clean, exit 0)

$ pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-room-concept-render.test.ts
Test Files  1 passed (1)
     Tests  17 passed (17)

$ pnpm --filter @patina/supabase test
Test Files  94 passed (94)
     Tests  1163 passed | 12 skipped (1175)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit          (clean, exit 0)

$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total · Tests: 63 passed, 63 total

$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit          (clean, exit 0)

$ git ls-remote origin portal-polish/a3
e58e984211db77643b32fd1e7fd8088c485ca370  refs/heads/portal-polish/a3
```
Every number matches the report's own claims exactly. No `@patina/aesthete-quiz` dist gap
surfaced this run (the report notes it hit that on its own first pass and fixed it; this worktree
already has the dist built).

---

## Findings

Severity: P1 blocking, P2 should-fix-or-explicit-sign-off, P3 minor/informational. Confidence is
my own calibration, independent of the report's framing.

### P3 — whole-file Prettier reformat diverges from the package's dominant quote style (confidence: high)

`use-room-concept-render.ts`'s diff converts every single-quoted string in the file — including
~90 lines of pre-existing, functionally-untouched code — to double quotes. There is no root
Prettier config for the JS/TS workspace (checked: no `.prettierrc*` outside `services/media` and
`services/projects`), so Prettier's own default (double quotes) is what a bare `prettier --write`
produces, but it is not what this package actually uses:
```
$ grep -rlE "^import .* from '.*';" packages/supabase/src/hooks/*.ts | wc -l
119
$ grep -rlE '^import .* from ".*";' packages/supabase/src/hooks/*.ts | wc -l
14
```
119 of 133 hook files in this directory use single quotes; the pre-fix version of this exact file
was one of them. The report explains why it ran `prettier --write` (an advisory pre-commit hook
flagged drift) and that is a reasonable individual call, but the result is that a small, three-hook
addition now carries ~166 lines of unrelated punctuation churn in its diff, and the file no longer
matches its neighbors. Failure scenario: none functional — this is a diff-hygiene / future-merge-
friction concern (a later lane diffing or blaming this file sees quote-style noise obscuring the
actual logic change), not a bug. Fix, if picked up: re-run with `--single-quote` (or drop the
`prettier --write` step and just fix the two new files' formatting by hand) so the file rejoins its
neighbors; not worth a fix-round on its own.

### P3 — `index.ts` diff includes two unrelated reformatting hunks (confidence: high)

Two hunks in the `index.ts` diff touch exports this lane never added or changed:
`RoomScanOwnerKind`/`RoomScanWithProvenance`'s export wraps onto three lines where it was one, and
`useBoardsReactionRollup`'s export collapses from three lines to one. Both are pure Prettier
reformatting of code A3 has no reason to touch, landing in the same barrel file as the lane's own
additions. No functional risk (no other Wave 3b lane touches `index.ts`, confirmed by diffing
`origin/portal-polish/d7` — zero overlap), but it is exactly the kind of incidental diff noise the
program's "touch only the files you list, only the region you own" discipline exists to prevent,
even inside a file that is legitimately on the lane's own list.

### P3 — the read hook queries `project_rooms` directly, not through the client-authorized RPC (confidence: medium, informational)

`useRoomConceptRenderRecord` selects straight off `public.project_rooms` rather than going through
`get_client_project_threshold` (the RPC 00580 widened specifically to carry these four fields to
client viewers). For a designer-portal consumer this is fine — `project_rooms_studio_rw`
(00316) already grants a studio member full row access. I did not find an equivalent client-select
policy on `project_rooms` itself in a targeted grep of the migrations that touch the table (client
read access to room data appears to be mediated entirely through the RPC today), so if a future
lane wires this hook into the **client** portal rather than the designer portal, its `select` may
return no row for a client viewer even though the RPC path would. Nothing currently consumes this
hook (confirmed: zero references outside its own module and test, and zero `apps/*` files in the
diff), so this is inert today — flagging it only so whoever wires it in next checks which portal
they're wiring it into before assuming parity with the RPC.

---

## What I did not do

- Did not run a dev server, `supabase db reset`, or the Supabase CLI — Wave 2b still owns the
  local database and port 3002 per the plan, and this lane's gate is jest/type-check/lint only
  regardless.
- Did not re-review Wave 1's migration (00580) or Wave 3's D6 component — both are out of A3's
  file list and were reviewed in their own rounds; I only cross-read `d6-review.md` to confirm A3
  is solving the problem it says it is.
- Did not attempt to verify the `project_rooms` client-select question exhaustively (a full audit
  of every policy touching the table) — scoped the check to "is this live today," and it isn't.
