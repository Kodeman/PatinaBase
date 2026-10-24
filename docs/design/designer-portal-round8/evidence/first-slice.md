# WP-01.9 first vertical slice evidence

Status: the latest authorized browser rerun reached the failed-save recovery and phone exact-line steps, then failed on two focus assertions. Offline diagnosis confirms both are test gaps; the test-only corrections and owned-project teardown below await a new browser authorization.

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

- Latest authorized capture on `9670e0c6acbe5e3a33201d51e521645453a22cdb` — **0 passed, 4 failed**. Both focus assertions failed in Chromium and WebKit. At `first-slice.spec.ts:178–181`, the test pressed Tab after filling Finish; the error snapshot shows Material focused and the failed-save alert present. This is a test gap: the test moved focus itself before asserting the failed-save focus contract. The test now presses Enter to invoke the field's commit handler without the test's Tab-induced focus move. At `first-slice.spec.ts:297`, the phone test expected the line control to retain focus; the WebKit snapshot shows the SpecFieldsPane heading focused, matching the stacked-layout focus contract. This is a test gap; the assertion now checks the pane heading. Neither change is browser-tested yet.
- The prior authorized rerun — **0 passed, 4 failed**. It passed the FF&E lens visibility step, then failed on the Spec-lens assertion: the “Edit room selections” link intentionally opens the Rough lens (`pieces-overview-row.tsx:155–161`), while `parseBuildRoomSearch` defaults missing lens to `rough` (`build-room-url.ts:50–55`). The test now enters “Specifications” by keyboard and targets SpecLens's direct-child primary button (`spec-lens.tsx:336–343`), checking `lens=spec` and the exact line.

- Initial authorized first-slice run — **0 passed, 4 failed** on the test's ambiguous SQL `id` and expected survey caption; the query and caption assertion were repaired. The second authorized sequence ran `pieces-build-room.spec.ts` — **37 passed, 0 skipped** (Chromium, one worker); expected refusal messages and external Sanity-help fetch errors appeared while Playwright reported green.
- Repaired first-slice rerun — **0 passed, 4 failed** because the test queried FF&E before promoting the chapter into LENS. The subsequent rerun passed that chapter-visibility step, then failed all four cases on the Spec-lens assertion described above.
- F01 setup readback was `{"job":"f0180000-0000-4000-8000-000000000010","studio":"f0180000-0000-4000-8000-000000000001","lines":80,"living":36}`. No DB reset was performed. The latest rerun left the F01 project row in the shared local DB and it remains untouched per coordinator direction; SQ-1933 will clear it. Offline source review found the spec had no `afterAll` teardown. The test now deletes only the owned scan and project in one transaction and verifies the project row is gone, deliberately preserving the studio's last-owner membership that would trigger `last_owner_protected`. This teardown is not database-tested yet; do not infer the current #35 value.
- `next-env.d.ts` was restored after the browser run. No browser or dev server was started during the current offline diagnosis; SQ-1933 has the browser slot next.

## Candidate

Spec change commit SHA: `6aacc1c72e140653c67c2716db91be98a9c350d5` (browser capture pending a new GO).
