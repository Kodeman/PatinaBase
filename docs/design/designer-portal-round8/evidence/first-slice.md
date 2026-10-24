# WP-01.9 first vertical slice evidence

Status: browser capture revealed two test assertion defects; the spec is repaired and awaits a new browser authorization before its rerun.

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

- Authorized initial run of `first-slice.spec.ts` on port 3426 — **0 passed, 4 failed**. The failures were blocked before the journey by an ambiguous `id` in the test's initial SQL and an expected caption string that differed from the real caption. Corrected the query to `i.id`; the assertion now checks the rendered caption `Survey, not installed`, which accurately distinguishes survey evidence from installed work. The repaired spec has not yet been browser-tested.
- The same authorized sequence then ran `pieces-build-room.spec.ts` on port 3413 — **37 passed, 0 skipped** (Chromium, one worker). It logged expected refusal messages from exercised refusal cases and external Sanity-help fetch failures; Playwright reported all tests passed.
- The F01 setup readback was `{"job":"f0180000-0000-4000-8000-000000000010","studio":"f0180000-0000-4000-8000-000000000001","lines":80,"living":36}`. After both browser runs, the owned F01 project and survey rows were deleted; no DB reset was performed. Shared actor/studio scaffold rows remain as in the existing local fixture convention.
- Browser slot ports 3426, 3413 and 3424 had no listeners after the runs. `next-env.d.ts` was restored from the pre-run saved baseline. The exact #35 check (`SELECT count(*) FROM public.project_ffe_items WHERE project_id <> 'e6590000-0000-4000-8000-000000000001' AND product_id::text LIKE 'e6590000%';`) returned **0** after cleanup.
- New browser authorization is pending; SQ-1830 currently owns the slot.

## Candidate

Candidate SHA: pending scoped commit of the corrected spec and this evidence update.
