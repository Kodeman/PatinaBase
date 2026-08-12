# Wave1 Workflow Stack — Engineering Review

> **Erratum (2026-08-12):** the wave1 migrations discussed below were renumbered
> `00434`–`00445` → `00461`–`00472` to clear the FF&E ledger block materialized at
> `00433`–`00445`. Migration numbers in the body of this document predate that
> renumber; see `docs/ops/wave1-prod-reconciliation-plan.md` for the current mapping.

**Date:** 2026-08-11
**Companion to:** `docs/design/workflow-alignment/the-workflow-alignment-proposal.html` (design deck)
**Audience:** Kody + whoever merges the wave
**Subject:** (a) five DocumentGuide commits already merged on main; (b) the unmerged
`feat/workflow-wave1-integration` stack (worktree `.codex/worktrees/workflow-wave1`).

Every claim below was re-verified against the repo on 2026-08-11. Commands shown were run
from the repo root or the wave1 worktree as noted. All git usage was read-only.

**Scale of the unmerged stack** (from the wave1 worktree):

```
$ git log --oneline main..HEAD | wc -l          → 32 commits
$ git diff main...HEAD --stat | tail -1         → 186 files changed, 38201 insertions(+), 953 deletions(-)
$ ls supabase/migrations | sed -n '/00433/,/00444/p'  → 00433 … 00444 (12 migrations)
$ git merge-base main feat/workflow-wave1-integration → e7fd3244 (local main tip)
```

---

## 1. What to review (and what not to)

**Review exactly one branch: `feat/workflow-wave1-integration` (tip `5eb02fef`).**

`git worktree list` shows 22 other worktrees under `.codex/worktrees/` plus 4 workflow
worktrees under `.claude/worktrees/`. They are stale checkpoints of the same linear stack,
kept as the agent rebuilt it. Sampled verification:

```
$ git merge-base --is-ancestor <tip>   feat/workflow-wave1-integration
$ git merge-base --is-ancestor <tip>^  feat/workflow-wave1-integration
feat/workflow-stage-ui          (40f0a739): tip NOT ancestor, PARENT is ancestor
feat/stage2-client-approval-cutover (2d8db14a): tip NOT ancestor, PARENT is ancestor
fix/workflow-stage-ui-review    (c28568e3): tip NOT ancestor, PARENT is ancestor
fix/stage2-client-access        (ab9ff7a6): tip NOT ancestor, PARENT is ancestor
feat/contextual-handoff-designer(1a13abf2): tip NOT ancestor, PARENT is ancestor
feat/workflow-spine-db          (161451f6): NEITHER tip nor parent is ancestor
```

**Correction vs. the working assumption** ("their parents are ancestors of wave1"): that
holds for 5 of 6 sampled tips, but `feat/workflow-spine-db` branched from main directly
(`git merge-base feat/workflow-spine-db wave1` → `e7fd3244`, the main tip). Its commits are
nonetheless patch-equivalent to commits inside wave1:

```
$ git cherry feat/workflow-wave1-integration feat/workflow-spine-db
- df73d388   - 161451f6        # both "-" = content already in wave1
$ git cherry feat/workflow-wave1-integration fix/workflow-stage-ui-review | tail -1
- c28568e3
```

The conclusion stands either way: every sampled checkpoint's content is contained in wave1.
Wave1 supersedes them all; review nothing else, and retire the worktrees after merge
(`scripts/repo-gc.sh` dry-run first, per repo convention).

**Two divergent 00433s exist across branches — do not review the short one.**

```
$ git ls-tree <branch> -- supabase/migrations/00433_canonical_workflow_spine.sql
feat/workflow-wave1-integration  → blob 7eb72c5a   $ git cat-file blob 7eb72c5a | wc -l → 1663
feat/workflow-spine-db           → blob 7eb72c5a
fix/workflow-stage-ui-review     → blob 520ec0fa   $ git cat-file blob 520ec0fa | wc -l →  891
fix/workflow-stage-ui-runtime    → blob 520ec0fa
feat/workflow-stage-ui           → (no 00433 at all — predates the migration)
```

The 891-line version is the unhardened first cut; wave1 carries the 1,663-line hardened
version. Anyone who opens `fix/workflow-stage-ui-review` or `-runtime` to "review the
migration" is reviewing the wrong file.

---

## 2. Merge-risk findings

### 2.1 `00436_project_approval_lifecycle.sql` — 3,143 lines, 20 functions, 11 restated from main · *Assessment: highest-risk file in the stack*

```
$ wc -l supabase/migrations/00436_project_approval_lifecycle.sql        → 3143
$ grep -c 'CREATE OR REPLACE FUNCTION' 00436_…                          → 20
```

**Correction vs. the working assumption** ("~25 installed RPCs"): it is 20 `CREATE OR
REPLACE FUNCTION` statements over 20 distinct functions. Of those, **11 restate whole
bodies of RPCs already installed on main** (source migration per `grep -rl` over
`supabase/migrations/` on main):

| Restated function | Currently installed by |
|---|---|
| `advance_project_phase` | 00393 |
| `guard_client_decision_completed_phase_gate` | 00393 |
| `publish_client_decision`, `apply_client_decision`, `expire_client_decision`, `expire_due_client_decisions`, `reopen_client_decision`, `extend_and_reopen_client_decision`, `mark_client_decision_viewed`, `stamp_client_decision_reminder` | 00399 |
| `_apply_client_decision_authorized` | 00399, re-restated by 00413 |

The other 9 (`get_project_workflow`, `respond_project_approval`,
`withdraw_project_approval_decision`, `supersede_project_approval_decision`,
`get_project_decision_reviews`, `guard_stage2_client_decision_edge`,
`guard_stage2_client_decision_option_edge`, `_respond_project_approval_checked`,
`_client_decision_blocks_phase`) redefine functions introduced earlier in this same stack
(00433/00435).

**Assessment.** This is exactly the known failure mode the `patina-db-migrations` skill
exists for: a restated body that silently drops a line from an earlier fix reverts that fix
with no error. `_apply_client_decision_authorized` has already been restated twice on main
(00399 → 00413); 00436 makes it a third. **Review requirement: line-level diff of each of
the 11 main-installed function bodies against their current installed definition
(00393/00399/00413) before approving.** Budget the most review time here.

### 2.2 Whole-body restatement chains inside the stack

- **00442 restates the entire 00441 body.** Header comment, 00442 lines 1–8: "Lineage:
  restates the complete 00441 body. The only behavioral delta is to retain a canonically
  sent Site Request while it waits for the frozen party's SMS consent." Sizes: 00441 = 412
  lines, 00442 = 416 lines. Only 00442's text reflects final behavior; 00441 review is
  lineage-only.
- **00435 → 00436 → 00439 → 00440 re-guard the same Stage-2 edges.** Verified via headers:
  00435 ("00436 intentionally owns publish/respond/withdraw/supersede routing"), 00439
  ("Stage-2 client access repair… Exclude Stage-2 at the raw parent table policy"), 00440
  ("Stage-2 option visibility follows frozen decision authority… installed studio read
  policy and option-ID response rail remain unchanged"). The last restatement wins; review
  policies/predicates in 00439/00440's final form, not their 00435/00436 first form.
- Both 00435 and 00436 headers carry "Adds GRANT/REVOKE → regenerate
  seed/00-legacy-grants.sql" — see 2.5.

### 2.3 Zero verification has been run — and there is no wired way to run it

```
$ find supabase/tests/workflow -type f                    → 13 files: 11 .sql + 1 .ts + 1 README
$ find supabase/tests/workflow -name '*.sql' | xargs cat | wc -l  → 9097
```

**Correction vs. the working assumption** ("~10,800 lines"): 9,097 lines of SQL contract
tests, plus a 336-line Deno storage test (`storage_privacy_contract_test.ts`) — 9,433 test
lines total, 9,556 with the README.

No npm script invokes any of them: `grep '"test' package.json` finds only
`test` (turbo), `test:library-config`, and `test:boh-audit` — nothing touching
`supabase/tests/workflow`. The suites are run only by hand-typed psql, documented in
`supabase/tests/workflow/approval_authority/README.md` ("Run them only after 00434 and
their named migration exist", with explicit `psql … -f` commands). The tests are
existence-guarded (`to_regclass`/`to_regprocedure`, stop with SQLSTATE 55000 on a schema
missing their migration) — good design, but they have never been exercised against this
integrated stack, and the repo has no CI (per CLAUDE.md: "No CI gates exist… local
verification is the only verification").

**Merge bar: a full `pnpm supabase:reset` (replays 00001–00444 + seeds) followed by every
suite under `supabase/tests/workflow/` green, run locally, with output attached to the
merge.** The run is undocumented: no repo artifact records it. Note the asymmetry before
reading that as proof — a local reset plus hand-typed psql leaves no repo artifact by
construction, so absence of evidence is expected here whether or not the run happened. The
merge bar stands either way; what discharges it is the attached output, not the history.

### 2.4 Tip commit `5eb02fef` bundles three changes beyond the workflow surface · *Assessment: unrelated to the wave; split before merge*

```
$ git show --stat 5eb02fef
    fix(auth): restore development account login
 apps/designer-portal/next.config.js                | 12 ++++--
 .../src/lib/__tests__/dev-env-contract.test.ts     | 45 ++++++++
 .../src/lib/__tests__/next-config-csp.test.ts      | 42 ++++++++
 packages/types/src/dev-accounts.ts                 |  2 +-
 turbo.json                                         |  9 ++++-
 5 files changed, 105 insertions(+), 5 deletions(-)
```

All three verified in the diff:

1. **`packages/types/src/dev-accounts.ts`** — `PORTAL_ROLE_MAPPING.designer` drops
   `'manufacturer'` (`['super_admin','admin','designer','studio_manager','manufacturer']`
   → without `'manufacturer'`). That is an auth-behavior change to which roles may enter
   the designer portal via dev accounts — not workflow work.
2. **`apps/designer-portal/next.config.js`** — derives a `ws:`/`wss:` origin from
   `NEXT_PUBLIC_SUPABASE_URL` and appends it to `connect-src` in **both** the dev and prod
   CSP branches. *Nuance vs. the working assumption:* it is a derived origin, not a
   hardcoded `wss://` literal, and the prod branch already lists
   `wss://bkvcixdmuyejfzcijpdg.supabase.co`, so the prod effect is a duplicate; the real
   effect is dev (local Supabase realtime). Still a portal-wide CSP change riding a
   workflow branch.
3. **`turbo.json`** — adds `passThroughEnv` on the `dev` task including
   `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_DB_URL`, `SUPABASE_INTERNAL_URL`, the two
   `NEXT_PUBLIC_*`). Dev-task-scoped, but it widens which env vars turbo forwards to every
   workspace dev process.

**Assessment.** None of the three belongs in the workflow merge. Cherry-pick them out (or
land them as their own reviewed commit) before the wave merges; the two new test files go
with them.

### 2.5 `supabase/seed/00-legacy-grants.sql` +1,098 lines — regenerate, never hand-merge

```
$ git diff main...feat/workflow-wave1-integration --stat -- supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 1098 ++++++++++++++++++++++++
 1 file changed, 1098 insertions(+)
```

This file is a regenerated artifact of the grant surface (00435/00436 headers both say
"regenerate seed/00-legacy-grants.sql"). It will textually conflict with any migration
landed in parallel on origin/main. At merge time: take neither side, re-run the
regeneration against the post-rebase migration set, and commit that output.

### 2.6 Realtime → polling: shim is documented, but confirm intervals and retire the name

Commit `52a38ef7 fix(approvals): replace unavailable realtime with polling` (message
verified). In `packages/supabase/src/hooks/use-project-approvals.ts`:

- `APPROVAL_FOREGROUND_REFRESH_MS = 30_000` (line 125); query options set
  `refetchInterval: APPROVAL_FOREGROUND_REFRESH_MS, refetchIntervalInBackground: false`
  (lines 132–133).
- `useProjectApprovalRealtime` survives at lines 713–723 — **correction vs. the working
  assumption ("rename or document")**: it is already documented as a `@deprecated`
  no-op compatibility shim ("intentionally creates no channel because tracked migrations
  publish none of its former source tables… Kept temporarily so installed portal callers
  do not need an atomic cutover"). Callers remain in
  `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
  and `apps/client-portal/src/app/decisions/[id]/page.tsx`.

Residual asks: (1) confirm 30s foreground polling across every approval surface is an
accepted load/UX tradeoff; (2) file the shim's retirement (remove the dead callers) as
explicit follow-up so the misleading name doesn't outlive the merge; (3) note the
CSP wss addition in 5eb02fef is unrelated to this — approvals no longer use websockets.

### 2.7 Client portal deletes the projects-service submitApproval path

Three files edited (not deleted) to remove the path — verified in the branch diff:

```
# ABRIDGED; ANNOTATIONS ADDED — not verbatim `git diff --stat` output.
# The parenthetical notes are the reviewer's, and the deleted
# milestone-decisions.tsx row is omitted here (named in the prose below).
apps/client-portal/src/app/projects/[projectId]/actions.ts   | 30 --  (submitApprovalAction removed)
apps/client-portal/src/lib/api-client.ts                     | 18 --  (submitApproval method removed)
apps/client-portal/src/lib/api-client-server.ts              | 18 --  (submitApproval method removed)
```

This is removal, not deprecation. The projects service keeps its side:
`services/projects/prisma/schema.prisma:317` `model ApprovalRecord` (`@@map
"approval_records"`, line 348), still referenced by
`services/projects/src/projects/projects.service.ts` and
`services/projects/src/application/services/project-activity.service.ts`. Wave1's only
`services/` changes are two board-storage/board-access files — it does not touch the
approval code. The contract-test README states the intended posture explicitly: "the
projects-service `approval_records` path is legacy only." **Before merge: confirm no
remaining caller (designer portal, admin portal, activity feeds) surfaces
`approval_records` as live data, and record the table as frozen history.** The
one genuinely deleted client-portal file is
`apps/client-portal/src/components/timeline/milestone-decisions.tsx`.

### 2.8 Rebase requirement — wave1 is based on a stale local main

```
# All counts in this section measured at local main = e7fd3244 (2026-08-11).
$ git rev-list --left-right --count main...origin/main   → 10	16
$ git merge-base main feat/workflow-wave1-integration    → e7fd3244 (local main tip)
```

Local main is 10 ahead / 16 behind origin/main, and wave1 branches from the local tip.
The 10 "ahead" commits are the DocumentGuide work — and `git cherry origin/main main`
marks all nine non-merge commits `-` (patch-equivalent): origin/main already carries the
identical changes under different SHAs, merged as PR #26 (`9be3f6aa`, commits
`cacc4d65`/`f9ddd0ee`/`60954be3`/`abd70d71`/`323847ff` mirroring
`742a6c67`/`191d9d60`/`3879958b`/`c8f445df`/`e7fd3244`). So the guidance work IS on
origin/main, just not by these hashes. The 16 "behind" commits (lifecycle-hooks system,
Herdr env, FF&E design docs) wave1 has never seen.

The overlap is real, not theoretical — files touched by BOTH wave1 and the guidance set
(`comm -12` of the two `--name-only` diffs, designer portal only):

```
apps/designer-portal/src/app/(document)/doc/[id]/page.tsx        (+ .test.tsx)
apps/designer-portal/src/components/document/coordination/coordination-band.tsx
apps/designer-portal/src/components/document/margin-rail.tsx
apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx
apps/designer-portal/src/components/document/schedule/schedule-spine.tsx
apps/designer-portal/src/components/document/work-block.tsx      (+ .test.tsx)
```

**These counts are already stale.** Local main has advanced past `e7fd3244` since they were
taken: it now carries a docs commit, `9b4eeba7`, cherry-picked on 2026-08-11 and marked `+`
by `git cherry` — i.e. it is *not* patch-equivalent to anything on origin/main, unlike the
10 guidance commits above. Re-run the `rev-list` and `merge-base` counts before acting on
this section; the ahead/behind numbers and the duplicate-SHA picture will both have moved.

**Precondition: rebase wave1 onto origin/main (the content-equivalence of the 10 duplicate
commits means the guidance-side hunks should replay cleanly, but the 16 unseen commits
must be integrated), then resolve local main's duplicate-SHA situation separately.**

### 2.9 Two stage-label vocabularies ship side by side

`apps/designer-portal/src/components/document/workflow/contextual-handoff-band.tsx:19–31`
declares a local `STAGE_LABELS` map whose strings differ from the `title` fields in
`packages/types/src/residential-workflow.ts` — e.g. `'07 · Documentation & authorization'`
vs. `Documentation / Authorization`, and `'10 · Delivery & installation'` vs. `Delivery,
Installation & Styling` (the casing diverges on all eleven). The stage rail renders the
canonical titles; the handoff band renders the local ones, on the same page. This is a real
product inconsistency, not a merge mechanic — reconcile it at merge by having the band read
the canonical constant.

---

## 3. Defects in the merged guidance commits (main)

All verified against files on main at `e7fd3244`.

1. **`withInputs()` overrides the branch's own action at Discovery.**
   `apps/designer-portal/src/lib/document/document-guide.ts:131–155`: when the first input
   fact has a `focusId` and `model.stage === 'discovery'` (lines 136–137), the model's
   action is replaced with `Add ${firstInput.label}`. The **paused** branch (lines
   290–300) and the **needs-attention** branch (lines 310–317) both pass `inputFacts`
   through `withInputs`, so a paused Discovery document shows "Add Working budget" instead
   of "Review project status", and an operational need's own CTA is likewise displaced.
   (The loading/unavailable branches pass `undefined` and are unaffected.)

2. **Every document open now runs the full Desk query.**
   `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:164–166`:
   `useDeskEngagements({ enabled: Boolean(row && !isError) })`. The hook
   (`src/hooks/use-desk-engagements.ts:117–139`) is one query with a six-element
   `Promise.all` (document_state, delivery_events, invoices, item_feedback, board flags,
   ceremonies) and `refetchInterval: 60_000`. `guideLoading` (page.tsx:408) gates the
   guide headline on this query — a cold deep-link to one document pays the whole Desk
   read before guidance appears.

3. **A Desk-wide query error blanks guidance for ALL stages.** page.tsx:399–407:
   `guideUnavailable = Boolean(row && (enrichedOperationalQuery.isError || …))` — line 401
   puts the Desk query's error ahead of the stage-specific conditions, so stages whose
   guidance never depended on Desk data still render "Guidance is unavailable".

4. **Dead null/undefined contract.** `use-desk-engagements.ts:57–63`:
   `selectOperationalNeedForDocument` returns `null` both when `data` is undefined (no
   Desk data) and when the folder has no need. The caller (page.tsx:416) then does
   `operationalNeed: enrichedOperationalNeed ?? undefined`, and `deriveDocumentGuide`
   (document-guide.ts:302) treats `undefined` as "derive locally" and `null` as "trust: no
   need". Because `?? undefined` collapses null into undefined, the null branch is
   unreachable from this caller — a genuine Desk "no need" answer is silently replaced by
   the local re-derivation.

5. **`retry-guidance` carries a fake destination.** document-guide.ts:282–287 gives the
   retry action a real-looking `{ kind: 'anchor', section: stage }` destination, but
   page.tsx:420–423 intercepts it purely by the string literal
   `action?.key === 'retry-guidance'` and calls `refetch()`. Any other consumer of the
   model (mobile dock, tests, future surfaces) that honors the destination will scroll
   instead of retrying.

6. **Activate guard is inert against MarginItem.** page.tsx:266–272 only clicks the focus
   target when `focusTarget.getAttribute('aria-expanded') !== 'true'`. MarginItem's button
   (`src/components/document/margin-item.tsx:52–66`) sets `id={targetId}` and
   `onClick={onToggle}` but never sets `aria-expanded`, so the guard always passes and the
   `pulse_due` path (focusId `document-pulse-control`, `activate: true` —
   document-guide.ts:181,183) can toggle an already-open pulse item **closed** on desktop.
   (Also an a11y defect in its own right: an expandable button with no expanded state.)

7. **Process.** All five commits are subject-only — `git log --format=%B` shows no bodies
   (`test(document): remove trailing test whitespace` … `fix(document): connect guidance
   to canonical controls`). And `docs/design/the-document/DECISIONS.md` has no entry for
   the guide/canonical-anchor work: grep for guide/canonical entries dated 2026-08-10/11
   returns nothing (all hits are unrelated field-capture text); the log still ends at
   "last id = I109" (the R21-era entry). The workstream charter
   (`apps/designer-portal/CLAUDE.md`: DECISIONS.md is "append-only… Every new decision,
   conflict, or deviation gets appended") was not followed.

---

## 4. What ships as built

The stack's data-model discipline is genuinely good; the review above is about merge
mechanics, not design quality.

- **00433 classification-as-metadata** (1,663-line version): canonical stage keys are
  additive nullable columns on `proposal_phases`/`project_phases` with paired constraints
  (`canonical_stage_key IS NULL OR … IN (…)`, lines 29, 51–52 — NULL is legal, unclassified
  rows keep working). The header states the invariant: "This is not a second lifecycle
  engine: project_phases remains the sole project schedule authority and
  advance_project_phase remains the sole lifecycle transition." A server-owned
  forgery-guard trigger (`guard_phase_workflow_metadata`, lines 250–363: token-checked,
  `REVOKE ALL` on the function, raises "% workflow metadata is server-owned") plus
  column-level grant boundaries enforce it. And the read-model comment (lines 1650–1656)
  pins the semantics the deck relies on: "Overdue is metadata only and never changes phase
  state."
- **00435/00436 approval semantics**: 00435 header — one explicit household authority
  snapshot, one immutable/versioned artifact, three canonical outcome options, one
  idempotency receipt, in one transaction; review confirmation as a separate authenticated
  act bound to that exact snapshot. 00436 header — immutable receipts carry
  withdraw/supersede dispositions; "overdue remains a derived condition"; one fail-closed
  phase-gate predicate (`_client_decision_blocks_phase`) shared by every consumer; the
  receipt constraint `(action_kind = 'superseded') = (successor_decision_id IS NOT NULL)`
  makes supersession lineage structural.
- **`apps/client-portal/src/lib/client-attention.ts`** (new, 69 lines + 72-line test):
  "The single Stage-2 definition of work that is currently in the client's court" — one
  derivation (`isClientActionableProjectApproval`) instead of per-surface re-derivations.
- **Margin-rail Stage-2 exclusion gated on classifier success**:
  `apps/designer-portal/src/lib/document/stage2-approval-exclusions.tsx` — "Removes only
  Stage-2 decision rows after the classifier read has succeeded"; while the classifier
  read is pending/errored, decision rows are withheld (with a
  `MarginDecisionClassificationNotice`, margin-rail.tsx:482) but "messages, notes, money,
  and time remain available". Fail-closed without blanking the rail.
- **Client outcome copy**: `decision-card-client.tsx` renders Stage-2 contract decisions
  as an explicit read-only card ("Open the authoritative approval review to inspect its
  frozen artifact and submit an outcome", `data-stage2-readonly="true"`) instead of
  silently reusing the legacy mutation card.
- **The spec set exists and is disciplined**: `docs/design/workflow-completion/`
  (APPROVAL-AUTHORITY-CONTRACT.md, CAPABILITY-LEDGER.md, CONTEXT.md,
  PRIVACY-AUTHORITY-AUDIT.md) plus exactly 4 ADRs in `docs/adr/`
  (0001-the-document-presents-the-workflow, 0002-projects-bind-one-procurement-rail,
  0003-household-comments-are-not-approvals,
  0004-external-acts-require-human-confirmation). Migration headers carry lineage
  comments (00443/00444 each name the exact prior migrations they narrow), and the
  contract tests are existence-guarded rather than assumption-laden.

---

## 5. Recommended merge sequence

Preconditions, in order — none are optional:

1. Rebase `feat/workflow-wave1-integration` onto **origin/main** (§2.8): integrates the 16
   unseen commits and lands on the canonical SHAs of the guidance work.
2. Split `5eb02fef` (§2.4): dev-accounts role change, CSP change, turbo passThroughEnv
   each reviewed on their own.
3. Regenerate `supabase/seed/00-legacy-grants.sql` post-rebase (§2.5).
4. Full local verification (§2.3): `pnpm supabase:reset` clean + every
   `supabase/tests/workflow/` suite green, output attached. Wire an npm script for the
   suites while at it so the next run isn't hand-typed psql.

Then merge in review units, in stack order:

| Unit | Content | Review note |
|---|---|---|
| 1 | Spec docs (`docs/design/workflow-completion/`, `docs/adr/0001–0004`) | Read first; they are the contract the SQL claims to implement |
| 2 | 00433 | The 1,663-line version only (§1); trigger + grant surface |
| 3 | 00434 | 2,413 lines; privacy authority |
| 4 | 00435 | 1,664 lines; evidence model |
| 5 | **00436** | **3,143 lines; budget the most review time — line-diff the 11 main-installed RPC bodies (§2.1)** |
| 6 | 00437–00440 | 00439/00440 are the FINAL form of the Stage-2 edges (§2.2) |
| 7 | 00441 + 00442 as one unit | 00442 supersedes 00441's text entirely (§2.2) |
| 8 | 00443 + 00444 | Site Request/Binder privacy narrowing; lineage headers name what they change |
| 9 | `packages/supabase` hooks | Polling intervals + deprecated realtime shim (§2.6) |
| 10 | Designer-portal surfaces | Post-rebase conflicts land here (§2.8) |
| 11 | Client portal | submitApproval removal + `approval_records` freeze confirmed (§2.7) |

After the merge, the **design re-housing from the companion deck applies before any of this
UI ships** — the deck owns where these surfaces live; this memo owns whether the stack
underneath them is sound.
