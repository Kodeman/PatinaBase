# WP-01.9 first vertical slice evidence

Status: the latest browser rerun exposed a Spec-lens entry gap in the test, not a product defect. The spec now selects “Specifications” and the exact line through their primary controls; the corrected candidate awaits a new browser authorization.

## Contract and fixture

- Fixture: F01 from `apps/designer-portal/e2e/round8/f01-fixture.sql` (fictional studio, project, living-room survey, task and 36 FF&E lines); round-8 global setup applies it without resetting the shared local database.
- Journey: `e2e/round8/first-slice.spec.ts`, using the authenticated browser fixture and real `document_open`, room scan, `UnfoldInstrument`, embedded BuildRoom and `SpecFieldsPane` paths. It records database state via the local `psqlScalar` helper.
- Viewports: 1440px desktop full keyboard journey; 390px phone reachability; Chromium and WebKit; separate renderer-off parity case.

## Preparation checks

- `pnpm exec turbo run build --filter=@patina/designer-portal^...` — passed; workspace dependencies built.
- `pnpm --filter @patina/designer-portal type-check` — passed after workspace dependencies were built.
- `pnpm --filter @patina/designer-portal lint` — passed with 0 errors; existing repository warnings remain.
- Playwright `--list` — parsed the 4 renderer-on cases across Chromium and WebKit; the renderer-off case is listed separately with `ROUND8_RENDERER=off`.

## Browser evidence

- The repaired authorized rerun — **0 passed, 4 failed**. It passed the FF&E lens visibility step; the shared assertion at `first-slice.spec.ts:128,274` then looked for `aria-current=true` on any button below the line row. The “Edit room selections” link intentionally opens the Rough lens (`pieces-overview-row.tsx:155–161`), while `parseBuildRoomSearch` defaults missing lens to `rough` (`build-room-url.ts:50–55`); the assertion was expecting the Spec lens without entering it. The broad locator also matched the row-actions menu button instead of SpecLens's primary line button (`spec-lens.tsx:336–343`). This is a test gap, not a product gap. The spec now enters “Specifications” by keyboard, selects the exact line, and uses a direct-child primary-button locator scoped to `data-testid="spec-lens"`; it also checks the address's `lens=spec` and exact `line`. This correction has not been browser-tested.
- Initial authorized first-slice run — **0 passed, 4 failed** on the test's ambiguous SQL `id` and expected survey caption; the query and caption assertion were repaired. The second authorized sequence ran `pieces-build-room.spec.ts` — **37 passed, 0 skipped** (Chromium, one worker); expected refusal messages and external Sanity-help fetch errors appeared while Playwright reported green.
- Repaired first-slice rerun — **0 passed, 4 failed** because the test queried FF&E before promoting the chapter into LENS. The subsequent rerun passed that chapter-visibility step, then failed all four cases on the Spec-lens assertion described above.
- F01 setup readback was `{"job":"f0180000-0000-4000-8000-000000000010","studio":"f0180000-0000-4000-8000-000000000001","lines":80,"living":36}`. No DB reset was performed. The initial sequence's owned F01 project and survey rows were torn down and #35 returned **0**. The latest rerun's F01 project row remains in the shared local DB; per coordinator instruction it is being left untouched. Do not infer a current #35 value from the older result.
- The local Next.js `next-env.d.ts` was restored from the pre-run baseline after the latest rerun. SQ-1830 now owns the browser slot; no browser or dev server was started during this offline diagnosis.

## Candidate

Candidate SHA: pending scoped commit of the corrected spec and this evidence update.
