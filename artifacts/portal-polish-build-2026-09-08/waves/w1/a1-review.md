# Lane A1 — Governance amendments + the house sheet's canonical home (review)

**Reviewer:** separate context, did not implement A1. Reviewed the branch itself
(`origin/portal-polish/a1`, head `2dd8421d4af9715813362f5b0afe281bfc1aa8e1`, base
`origin/main` @ `02eb0a95fc10acfb3bdf2cf83c7604a6b2fb9520`), not the impl report's prose, treating the
report as a claim to verify rather than a source of truth.

## What I verified myself (commands + real output)

```
$ git -C /Users/kody/Code/patina-merged fetch origin
$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/a1 --stat
 apps/designer-portal/CLAUDE.md                     |    6 +-
 .../document/__tests__/document-action.test.tsx    |   25 +-
 docs/design/house-sheet/SPEC.md                    | 1005 ++++++++++++++++++++
 docs/design/the-document/DECISIONS.md              |   91 ++
 docs/vision/VISION-DECISIONS.md                    |   84 ++
 5 files changed, 1206 insertions(+), 5 deletions(-)
```
Matches the plan's file list exactly — no sixth file, no untouched file dropped.

```
$ git -C ... diff origin/main...origin/portal-polish/a1 --stat --diff-filter=A
 docs/design/house-sheet/SPEC.md | 1005 +++++++++++++++++++++++++++++++++++++++
$ git -C ... show origin/main:docs/design/house-sheet/SPEC.md
fatal: path 'docs/design/house-sheet/SPEC.md' does not exist in 'origin/main'
```
Confirms the SPEC copy is a genuinely new file, not an edit to a pre-existing one.

**Byte-identity of the SPEC copy** (run in the lane worktree, not trusted from the report):
```
$ diff artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md docs/design/house-sheet/SPEC.md
$ echo $?
0
$ shasum -a 256 artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md docs/design/house-sheet/SPEC.md
0734061147e812abb33fffdfdb2b80e30378ec87f8fe1e2e511a01bd3ad1ea64  .../specimens/SPEC.md
0734061147e812abb33fffdfdb2b80e30378ec87f8fe1e2e511a01bd3ad1ea64  docs/design/house-sheet/SPEC.md
```
Confirmed byte-identical.

**DECISIONS.md and VISION-DECISIONS.md are pure appends:**
```
$ git diff -U0 origin/main...origin/portal-polish/a1 -- docs/design/the-document/DECISIONS.md | grep -c '^-[^-]'
0
$ git diff -U0 origin/main...origin/portal-polish/a1 -- docs/vision/VISION-DECISIONS.md | grep -c '^-[^-]'
0
```
Zero deletion lines in either log. Read the full diff of both files (not only the numstat) — every
hunk is additive at the tail of the file, no interior edit.

**Sentinels and heading levels**, grepped directly:
```
### R139 · I107 amended … — 2026-09-08          (:10759)
### R140 · R126 amended … — 2026-09-08          (:10777)
### R141 · R135 amended … — 2026-09-08          (:10791)
### R142 · The client imagery doctrine … — 2026-09-08   (:10817)
### I153 · The house sheet has a home … — 2026-09-08    (:10831)
### V9 · The five principles of polish are doctrine … — 2026-09-08   (VISION-DECISIONS.md:144)
```
All five DECISIONS entries are `###` (H3), matching every neighboring entry. `*Entries add: … last id
= I153*` and `*Entries add: … last id = V9*` are both present and correctly advanced from R138/I152 and
V8 respectively. All six entries are dated 2026-09-08 and each cites at least one PP-n (checked against
`rulings.md` — every PP-n cited by R139–R142/I153/V9 exists in `rulings.md` with the paraphrase matching
the ruling's content; no invented PP-n).

**R140 vs R126 — colour-at-three-sites and elevation clauses untouched.** Read all of R126
(`:9981-10108` in the current file). R140's entry states both clauses "stand … word for word" /
"stand entirely" and does not restate, qualify or re-derive either clause's content — it only names
them by line range and says they're out of scope. Verified the referenced content is still present
and unedited in R126 itself (`grep -n "survives at exactly three sites"` → `:10003`; `grep -n "D4 is
amended"` → `:10023`, matching the plan's `:10023-10036` range for the elevation clause). One inherited
citation quirk: the plan's own text (and R140, quoting it) cites the colour clause at `:9992`; the
actual line in the current file is `:10003`. This is not something A1 introduced — the plan text itself
carries the `:9992` figure — and it's a pointer to a paragraph inside a 127-line entry, not a
misstatement of the clause's content. Noting it as a citation-drift nit, not a substantive finding.

**R141 vs R135 — refusal at `:10717` not reopened.** Read all of R135. The quoted text — *"The header
is removed for every client, solo or multi-project. No wordmark, no project switcher, no nav bar, no
More ▾, no right-side utilities"* — is an exact match for the real bullet at `:10709` in the current
file (`grep -n "The header is removed for every client"`). Same citation-drift pattern as above (plan
says `:10717`, real line is `:10709`), again inherited from the plan text, not authored by A1, and the
quoted content is verbatim-correct regardless. R141 does not reopen the clause: it draws a header/ledger
distinction and states the header clause "stands exactly as written."

**`--color-error` grep — reran independently, not trusted from the report:**
```
$ grep -rn -- '--color-error' apps/client-portal/src/
apps/client-portal/src/app/globals.css:58:  --color-error: #C77B6E;
apps/client-portal/src/app/globals.css:374:  color: var(--color-error);
apps/client-portal/src/components/threshold/instruments/__tests__/open-chapter.test.tsx:242: ... not.toContain('--color-error')
apps/client-portal/src/components/account/AvatarUploadField.tsx:130: ... --color-error, which is red (VISION §6 ...)
```
Confirmed identical to the report's quoted grep. Read `globals.css:368-375` directly: `.da-danger:hover
{ color: var(--color-error); }` is the only real consumer — the other two hits are a negative test
assertion and a prose comment. R141's conclusion (remove the token at `:58` and the `.da-danger:hover`
rule with it, do not adopt `--color-terracotta-ink`) follows correctly from this evidence. The CSS edit
itself is out of scope for A1 (it belongs to Lane H4) and A1 did not touch `globals.css` — confirmed,
it's not in the diff.

**I107 quote accuracy.** R139 quotes I107 verbatim: *"tertiary = unscored until hover, when its score
draws in."* Checked against `docs/design/the-document/DECISIONS.md:6584-6608` (the real I107 entry) —
exact match, correctly retired rather than silently reworded.

**Duplicate `### R107` handling.** `grep -n "^### R107"` → `:3765` (Room View, 2026-07-16) and `:8044`
(the fidelity ladder, 2026-08-13). R142 extends the first and names the second by content ("the
fidelity ladder") so a future reader isn't misled — matches the report's claim exactly.

**Gate — reran myself in the lane worktree, not copy-pasted from the report:**
```
$ cd .codex/worktrees/agent-pp-a1
$ git log --oneline -3
2dd8421d4 docs(governance): R139–R142, I153, V9 — the portal polish rulings; house sheet canonical copy
02eb0a95f docs(design): portal polish build — spec and plan
294686e6f docs(design): portal polish review — rulings PP-1..PP-9
$ pnpm --filter @patina/designer-portal test -- \
    src/components/document/__tests__/document-action.test.tsx \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
PASS src/components/document/__tests__/document-action.test.tsx
PASS src/lib/document/__tests__/contrast.test.ts
PASS src/lib/document/__tests__/shadow-gate.test.ts
PASS src/components/document/__tests__/rail-stock.test.ts
Test Suites: 4 passed, 4 total
Tests:       1 todo, 84 passed, 85 total
```
Matches the report's numbers exactly (4 suites, 84 passed + 1 todo, the three unedited gate files
green and byte-unmodified per the stat diff above).

**`document-action.test.tsx` diff, read in full** (not summarized from the report): one row added to
`VARIANTS` (`variant: 'terminal', retiredChrome: null, …`), a `BuiltVariant`/`BUILT_VARIANTS` type-guard
filter added, both `it.each(VARIANTS)` calls repointed to `it.each(BUILT_VARIANTS)`, one `test.todo`
added with the skip reason in its name. No assertion body in either `it.each` block was touched. This
is necessary, not cosmetic: `DocumentActionVariant` (checked in `document-action.tsx`) has no
`'terminal'` member yet, so passing `variant="terminal"` into `<DocumentAction variant={variant}>` in
the original `it.each(VARIANTS)` would not type-check — the filter is required for the file to compile
against the current (unmodified) component, and the plan's phrasing ("add one row … every other row is
unchanged") is satisfied since the pre-existing five rows are untouched.

**`apps/designer-portal/CLAUDE.md` diff, read in full:** exactly the three edits the plan specifies —
the D4 line, the typography-first line, the success-criterion line — each appended to rather than
replacing the existing sentence. The shadow ban's wording ("No `box-shadow`, no `drop-shadow`, no
Tailwind `shadow-*`…") is untouched; the appended sentence strengthens rather than relaxes it.

**Type-check — ran independently to sanity-check the report's "pre-existing, unaffected" claim:**
```
$ pnpm --filter @patina/designer-portal type-check
... 73 error TS lines total ...
$ pnpm --filter @patina/designer-portal type-check 2>&1 | grep -c "error TS"
73
$ pnpm --filter @patina/designer-portal type-check 2>&1 | grep -i "document-action"
(no output)
```
Count matches the report's "73 error TS lines" and confirms zero errors touch
`document-action.test.tsx` or any file A1 edited. However the report's claim that all 73 are "in
`packages/patina-design-system/src/components/Media/*`" is **not accurate** — most (about 55 of 73) are
`error TS2307: Cannot find module '@patina/api-routes'` across `src/app/api/**/route.ts` files, caused
by `packages/api-routes` having no built `dist/` in this worktree (`ls packages/api-routes/dist` →
"No such file or directory"), i.e. an unbuilt-workspace-package issue, not a Media-package-only issue.
This is an unbuilt-dist environment condition, not something four docs/test-only file edits could
possibly cause, so the report's bottom-line conclusion (pre-existing, not this lane's regression) is
still correct — only the report's description of *where* the errors are is wrong. Filing as a low-
severity, low-confidence documentation-accuracy nit rather than a functional defect, since it doesn't
change the gate result or the diff scope.

**Commit hygiene:** `2dd8421d4` is a Conventional Commit (`docs(governance): …`), branched cleanly from
`origin/main` (merge-base = `origin/main` HEAD), pushed and tracked. `git status --short` in the
worktree (filesystem-permission noise aside, all under `apps/*/.env*` and unrelated to this lane) shows
no uncommitted changes to lane files.

## Findings

| # | Severity | Confidence | Finding |
|---|---|---|---|
| 1 | P3 | high | The impl report's type-check note ("73 error TS lines, all in `packages/patina-design-system/src/components/Media/*`") misdescribes the error population — most of the 73 errors are `@patina/api-routes` module-resolution failures from an unbuilt package `dist/`, scattered across `src/app/api/**`, not confined to the Media package. The report's conclusion (pre-existing, zero errors in files A1 touched, not this lane's regression) is still correct and independently reproduced. No fix required to the lane's deliverable; note for whoever reads the report next. |
| 2 | P3 | low | Two line-number citations inherited from the plan text itself (`:9992` for R126's colour-at-three-sites clause, actual `:10003`; `:10717` for R135's header refusal, actual `:10709`) are off by roughly a paragraph's worth of lines in the current file. The quoted clause text in both cases is verbatim-correct and the citation drift originates in the plan document, not in anything A1 authored independently — flagging only because the review brief calls for reporting every finding regardless of severity. |
| 3 | P4/informational | high | `R137` (cited by R139 as an example of an entry recording a smaller consequence) has no closing sentinel line in the pre-existing log, as the report itself notes under "what I did not do." Confirmed pre-existing and untouched by this diff — not a defect in A1's work, listed only because the report surfaced it and it's worth a reviewer's independent confirmation that it wasn't A1 who dropped it. |

No P1 or P2 findings. Every checklist item in the plan's Lane A1 "Review checklist" passed independent
verification:
- No past entry edited — confirmed via `-U0`/`grep -c '^-[^-]'` = 0 on both logs, plus a full read of
  both diffs.
- Sentinel lines advanced in both — confirmed.
- H3 heading level correct in both — confirmed.
- Every entry dated 2026-09-08 and citing a PP-n — confirmed, and every cited PP-n verified against
  `rulings.md`.
- `SPEC.md` copy byte-identical — confirmed via `diff` and SHA-256.
- R140 leaves R126's colour and elevation clauses alone — confirmed by reading R126 in full; the
  amendment only names and defers to those clauses, never restates or edits their substance.
- V9 says what it does not license — confirmed (shadows, badges/pills/status-dots/spinners/green-fills,
  dashboards/engagement metrics, tab bars/studio engagement chrome).
- CLAUDE.md keeps the shadow ban intact — confirmed, wording strengthened not weakened.
- Pathspec discipline — `git diff --stat` shows exactly the five files the lane's "Files (only these)"
  list names, no more, no less.
- Gate green — reran the four named jest files myself: 4 suites pass, 84 passed + 1 todo, matches the
  report exactly; the three files A1 must not edit (`shadow-gate.test.ts`, `contrast.test.ts`,
  `rail-stock.test.ts`) are byte-unmodified (absent from the diff stat) and green.
- Copy-string discipline — the only pinned string A1's diff touches is the `document-action.test.tsx`
  `VARIANTS` table entry, which the plan's own "Copy strings that tests pin" table assigns to A1 with
  exactly this treatment (`retiredChrome` = none for `terminal`); no other pinned string is touched.

## Verdict

**Approve.** No P1/P2 findings. The two P3 items are documentation-accuracy nits (one inherited from
the plan text, one from the impl report's type-check description) that do not affect the diff's
correctness, the gate's outcome, or downstream lanes' ability to build on this branch.
