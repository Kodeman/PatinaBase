# WP-01.9 first vertical slice evidence

Status: preparation pending the coordinator's sequential browser go. No Playwright execution or database writes have been claimed in this record yet.

## Contract and fixture

- Fixture: F01 from `apps/designer-portal/e2e/round8/f01-fixture.sql` (fictional studio, project, living-room survey, task and 36 FF&E lines); the round-8 global setup applies this fixture without resetting the shared local database.
- Journey: `e2e/round8/first-slice.spec.ts`, using the authenticated browser fixture and real `document_open`, room scan, `UnfoldInstrument`, embedded BuildRoom and `SpecFieldsPane` paths. It records database state via the local `psqlScalar` helper.
- Viewports: 1440px desktop for the full keyboard journey; phone-project coverage and renderer-off parity are listed as separate assertions when their tests execute.

## Preparation checks

- `pnpm exec turbo run build --filter=@patina/designer-portal^...` — passed, workspace dependencies built.
- `pnpm --filter @patina/designer-portal type-check` — passed after workspace dependencies were built.
- `pnpm --filter @patina/designer-portal lint` — passed with 0 errors; existing repository warnings remain.
- `pnpm --filter @patina/designer-portal exec playwright test e2e/round8/first-slice.spec.ts --config playwright.round8.config.ts --list` — passed; listed 4 renderer-on tests across chromium and webkit-iphone (1440px full journey and 390px phone reachability in each project). The separate `@renderer-off` parity case is intentionally excluded by the default renderer-on config and is listed when `ROUND8_RENDERER=off`.

## Browser evidence

Awaiting coordinator go. Pinned browser command after commit:

```sh
cd apps/designer-portal && PLAYWRIGHT_DESIGNER_PORT=3426 pnpm exec playwright test e2e/round8/first-slice.spec.ts --config playwright.round8.config.ts --workers=1
```

The ticket's final verifier also runs `e2e/document/pieces-build-room.spec.ts` on port 3413. No browser results, DB readback, screenshots or viewport completion are claimed until those commands finish. Evidence screenshots and Playwright output belong in the dispatch evidence directory, not this repository.

## Candidate

Candidate SHA: pending scoped commit.
