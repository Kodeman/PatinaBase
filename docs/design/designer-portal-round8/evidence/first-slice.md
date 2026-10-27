# WP-01.9 first vertical slice evidence

Status: the latest authorized capture on `7fd62af57f206c06a7582c5edec105712727fd08` failed 0/4. The first desktop journey reached the failed-save state, then failed on a page-wide live-region count; Playwright's worker restart invoked the spec-level teardown, removing F01 before later projects/cases. The candidate now scopes the no-toast assertion to the design-system toast viewport and moves fixture cleanup to Playwright global teardown.

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

- Authorized capture on `7fd62af57f206c06a7582c5edec105712727fd08` — **0 passed, 4 failed**. Chromium desktop reached the failed-save flow and failed at the page-wide `getByRole('status').toHaveCount(0)` assertion (then line 197); the document shell has legitimate status live regions, while the contract is no toast. Subsequent cases failed in `lineId()` after the spec's `afterAll` removed F01 when Playwright restarted the failed worker. The candidate now checks for open Radix toasts only inside `[data-radix-toast-viewport]` and uses config-level `globalTeardown` after the full multi-project run.
- Previous capture on `9670e0c6acbe5e3a33201d51e521645453a22cdb` — **0 passed, 4 failed** on the failed-save focus assertion and phone line-button focus assertion. Error snapshots showed the test-induced Tab moving focus to Material and the stacked-layout SpecFieldsPane heading receiving focus. The candidate keeps focus/value/inline-alert checks, presses Enter to commit without Tab navigation, and asserts the phone pane heading.

- The prior authorized rerun — **0 passed, 4 failed**. It passed the FF&E lens visibility step, then failed on the Spec-lens assertion: the “Edit room selections” link intentionally opens the Rough lens (`pieces-overview-row.tsx:155–161`), while `parseBuildRoomSearch` defaults missing lens to `rough` (`build-room-url.ts:50–55`). The test now enters “Specifications” by keyboard and targets SpecLens's direct-child primary button (`spec-lens.tsx:336–343`), checking `lens=spec` and the exact line.

- Initial authorized first-slice run — **0 passed, 4 failed** on the test's ambiguous SQL `id` and expected survey caption; the query and caption assertion were repaired. The second authorized sequence ran `pieces-build-room.spec.ts` — **37 passed, 0 skipped** (Chromium, one worker); expected refusal messages and external Sanity-help fetch errors appeared while Playwright reported green.
- Repaired first-slice rerun — **0 passed, 4 failed** because the test queried FF&E before promoting the chapter into LENS. The subsequent rerun passed that chapter-visibility step, then failed all four cases on the Spec-lens assertion described above.
- F01 setup readback for that run was `{"job":"f0180000-0000-4000-8000-000000000010","studio":"f0180000-0000-4000-8000-000000000001","lines":80,"living":36}`. No DB reset was performed. The failed run exposed that per-spec teardown can run on worker shutdown and erase shared fixture rows before the other browser cases. The current uncommitted fix removes that hook, installs global teardown to transactionally remove only the F01 scan, project, studio org, and actors, and verifies the F01 project count is zero. Org deletion uses `service_role` so cleanup does not directly delete the protected last-owner membership. The updated teardown has not yet been exercised; current F01/#35 state is unverified.
- `next-env.d.ts` was restored after the preceding browser run. The coordinator has since authorized a new foreground first-slice run; it has not yet been run on these uncommitted changes.

## Candidate

Spec change commit SHA: `6aacc1c72e140653c67c2716db91be98a9c350d5` (browser capture pending a new GO).
