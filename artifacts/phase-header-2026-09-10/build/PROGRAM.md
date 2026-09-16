# Build program — The Band (The Standing Head, ruled 10 September 2026)

Rulings: `../rulings.md`. Direction: The Band. Defects D1–D7 fold in. No deploy in this program —
build, verify, push the branch; shipping is a separate ask.

Branch `build/standing-head-2026-09-10` from origin/main 6f00099b3. Migration head 00589 → this program mints **00590**.

## What changes, by ruling

| Ruling / defect | Change | Files |
|---|---|---|
| R1 machinery | `SectionStageLineMount` unmounts at brief · discovery · direction · proposal (free-standing and the hosted `scope` mount). Stays at project · install · care. The rail keeps its `CORE · STAGE 03` register — the rail is the door. | `page.tsx:2333, 2774-2781, 2869-2886`; tests |
| R2 voice | Line 2 of the band, needs-input state, prints the standing sentence with owners: `Waiting on Edna: working budget, how they live.` / `Yours to add: project type and named rooms.` / mixed `Yours to add: scope. Waiting on Edna: budget, lifestyle.` Client is first name of `row.client_name`. | `document-guide.ts` (new `inputsSentence`), `document-guide-inputs.ts` (owner already there) |
| R3 silent region head | `PreworkRegion` at brief · discovery · direction: `<h2>` stays (sr-only), 2px rule stays, no eyebrow, no status line. Proposal-spread regions (proposal · scope · vision · investment) keep their real status lines. | `prework-region.tsx`, `page.tsx:2805-2836`; tests |
| R4 subject | Migration 00590: `subject text` on `projects`, `proposals`, `designer_clients`, `leads`; `document_state.subject` (45th column, all four legs, regrafted verbatim from 00327). Hook `useUpdateEngagementSubject`. Letterhead prints `row.subject ?? assembled` under the name at Inter 15, click-to-edit (blur-save, Enter, Esc, blank → null). Assembled: relationship/proposal → discovery `project_type` label + `N rooms`; project → nothing new (project vitals stay); lead → nothing (P5). Never persist the assembled line. | `00590_engagement_subject.sql`, `use-engagement-subject.ts`, `desk-derivation.ts`, `doc-letterhead.tsx`, `page.tsx vitalsFor` |
| R5 one leader | The readiness band loses its act and its glyph; it prints nothing (P5). When `ready`, the band's rest act `Begin the direction` runs the `begin_direction_from_discovery` mutation (today it only jumps to the section) and lands on the new document as `discovery-section.tsx` `begin()` does. Errors print on line 2 with a retry act. | `page.tsx`, `document-guide.ts` (destination kind `begin-direction`), `discovery-section.tsx` |
| R6 name 34 | `<h1>` → `text-[34px]`, tracking 0, no 1180 step. | `doc-letterhead.tsx:78`, `letterhead-vitals.tsx:499`; tests; `lens-band-height.spec.ts` constants |
| D1 door | Each sheet input row carries its own act (`anchor` with the fact's `focusId`, `activate:true`); the input the band's act names is excluded from the rows and from `withheld`. Input rows' eyebrow in clay-ink; exception rows stay terracotta-ink. | `page.tsx:2140-2194`, `standing-sheet.tsx`, `lens-band-derivation.ts` |
| D2 focus ring | `RegionHead` h2: replace `outline-none` with the letterhead's `focus-visible:outline …` declaration. | `region-head.tsx:185-191`; test |
| D4 heading order | The stage line's sr-only `<h3>Workflow stage</h3>` becomes `<h2>`. | `section-stage-line.tsx:66-70`; tests |
| D5 letterhead type | Vitals/subject line: 15px, wraps, no ellipsis. Name: no negative tracking. (The band's `LINE_CLIP` stays — R127's 56px height contract.) | `doc-letterhead.tsx:90-95` |
| D6 `Nothing yet` | The ladder's discovery register prints `N of 5 essentials` from readiness instead of the literal; brief/direction keep their literal until they carry a number. | `lens-ladder-derivation.ts:556-561`, `page.tsx` ladder facts |
| D7 undo | `Move back to New Lead` is always described by a sentence: when allowed, `Returns this to the lead queue; nothing here is lost.`; when refused, the server's reason. | `discovery-section.tsx:544-585` |
| A5 glyph twice | The readiness band's `StrataMark` goes with the band. | `discovery-section.tsx` |

## Waves

- **W1a data** (Sonnet, worktree A): 00590 + local apply + `db:generate` + SQL test + legacy-grants regen. Commits its own files.
- **W1b band** (Opus, worktree A, from W1a's commit): R2, R5, D1, D6, D7, A5 + tests.
- **W1c head** (Opus, worktree B, from W1a's commit): R1, R3, R4 hook + editor, R6, D2, D4, D5 + tests + e2e constants.
- **W2 merge + gates**: B → A; `pnpm --filter @patina/designer-portal type-check`; jest for every touched test; `pnpm --filter @patina/supabase type-check`; `pnpm --filter @patina/admin-portal build` (shared-package rule); e2e `lens-band-height`, `prework-regions`, `lens-a11y`, `lens-contrast`, `workflow-stage-responsive` against a built portal on the local stack.
- **W3 review**: adversarial review, separate context; fix; re-verify.
- **W4 canon**: DECISIONS.md — new ruling (R1–R6 of this panel as one entry), R126 amended (34), I-entry for the build. Sonnet.
- **W5**: commit (pathspecs), push branch. Not merged; not deployed.

## Gates
Designer portal: `pnpm --filter @patina/designer-portal type-check` + `jest` on touched specs. Supabase package: `type-check` + `git diff --exit-code database.types.ts` after regen. Admin: `build`. Migration: `supabase migration up` clean + `supabase/tests/document/document_state_subject_test.sql` under `ON_ERROR_STOP=1`. E2E: the five specs above.

## Scoped out

- Subject editing on project papers — no affordance yet (P5 kept the letterhead height contract); reachable later through the instruments ledger.
