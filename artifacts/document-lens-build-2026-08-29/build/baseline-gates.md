# Baseline gates — re-measured 2026-08-29

Main sha: `dab057537` ("docs(the-document): smart lens deck — quote the ask as written")
Date: 2026-08-29

## type-check

```
pnpm --filter @patina/designer-portal type-check 2>&1 | tail -3
```
```
> @patina/designer-portal@0.1.0 type-check /Users/kody/Code/patina-merged/apps/designer-portal
> tsc --noEmit
```
0 errors.

## test

```
pnpm --filter @patina/designer-portal test -- --ci --silent 2>&1 | tail -8
```
```
PASS src/lib/document/__tests__/ceremony-schedule.test.ts
PASS src/lib/document/__tests__/folio-calendar-derivation.test.ts
PASS src/lib/document/__tests__/section-derivation.test.ts

Test Suites: 458 passed, 458 total
Tests:       5170 passed, 5170 total
Snapshots:   1 passed, 1 total
Time:        20.627 s, estimated 27 s
```
Matches expected 458 suites / 5170 tests.

## lint

```
pnpm --filter @patina/designer-portal lint 2>&1 | tail -4
```
```
✖ 202 problems (2 errors, 200 warnings)
  0 errors and 186 warnings potentially fixable with the `--fix` option.

/Users/kody/Code/patina-merged/apps/designer-portal:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @patina/designer-portal@0.1.0 lint: `eslint .`
Exit status 1
```
Exactly 2 errors, confirmed at the expected locations:
- `src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159:1` — `error Definition for rule 'import/first' was not found  import/first`
- `src/hooks/__tests__/use-commercial-documents.test.ts:930:8` — `error React Hook "useSendTradeRfq" is called in function "mutationFnOf" that is neither a React function component nor a custom React Hook function... react-hooks/rules-of-hooks`

## In-flight branches — merge status vs `main`

```
git merge-base --is-ancestor <b> main && echo MERGED || echo NOT-MERGED
```
```
feat/contextual-handoff-designer: NOT-MERGED
feat/designer-stage2-approval-cutover: NOT-MERGED
feat/workflow-approval-lifecycle: NOT-MERGED
document-guidance/implementation: NOT-MERGED
feat/designer-ui-polish: NOT-MERGED
```
All five confirmed unmerged, matching the freeze-rule assumption in the program plan (ruling 9).

## Live Worker version — `patina-designer-portal`

```
npx wrangler deployments list --name patina-designer-portal 2>&1 | tail -3
```
Bottom row (most recent deployment):
```
Created:     2026-08-29T01:46:45.739Z
Author:      kody@thesaunabuild.com
Source:      Unknown (deployment)
Message:     -
Version(s):  (100%) 9c0c2cdd-2041-4848-a193-93d9e8fb0b71
                 Created:  2026-08-29T01:46:42.945Z
                     Tag:  -
                     Message:  -
```
Matches expected `9c0c2cdd-2041-4848-a193-93d9e8fb0b71` — this is the pinned rollback target (program plan ruling 2).
