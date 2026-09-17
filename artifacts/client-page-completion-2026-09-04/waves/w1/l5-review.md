# L5 — Papers and rooms · adversarial review

- Branch `client-page-2/l5` @ `2c78c3fb5`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5`
- Reviewer context is fresh; the implementer's report (`l5-impl.md`) was read but not trusted.
- Diff: 10 files, +1247/−2. `derive.ts` untouched; `mat.tsx` +16/−2; `threshold.tsx` +17/−1.

## Gates (run in the worktree)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5/apps/client-portal test -- threshold making
PASS src/components/threshold/__tests__/papers-sheet.test.tsx
PASS src/components/threshold/__tests__/room-capture.test.tsx
PASS src/lib/threshold/__tests__/papers.test.ts
PASS src/components/threshold/__tests__/mat.test.tsx
PASS src/components/threshold/__tests__/threshold.test.tsx
… (33 suites)

Test Suites: 33 passed, 33 total
Tests:       598 passed, 598 total
Snapshots:   0 total
Time:        5.661 s
Ran all test suites matching /threshold|making/i.
```

```
$ npx eslint src/components/threshold src/lib/threshold   (cwd apps/client-portal)
EXIT=0
```

Green gates. They do not cover the findings below, all of which are behavioural or absorb-scope.

## Absorb list — act by act

| Old act | Old source | Now | Verdict |
|---|---|---|---|
| `/documents` — plan set grouped by discipline | `app/documents/page.tsx:118-135` + `group.ts:115` | `papers-sheet.tsx:200-220` via `lib/threshold/papers.ts` (byte-identical `groupClientPlanSet`/`titleCase`) | ✅ in place |
| `/documents` — open a plan sheet | `PlanSheetRow` `documentSignedUrl` → `window.open(_blank)` | `SheetLine` → `<iframe src>` in the overlay | ⚠ partial (F7) |
| `/documents` — **"Other papers": client-visible `project_documents` files, open/download** | `useClientDocuments` + `DocumentRow` + `documentKindLabel`/`looseDocuments`/`visibleDocuments`/`groupDocumentsByProject` | **not absorbed** — replaced by `useProjectDocuments` (proposals + scope changes) | ❌ **F1** |
| `/documents` — drawings-leg failure notice | `page.tsx:106-116` | dropped; failure reads as "Nothing has been filed here yet." | ❌ **F2** |
| `/documents` — `clientEvents.documentView` | `page.tsx:228` | dropped | ⚠ F15 |
| `/scans` — the client's captured rooms | `RoomScanList` (`useRoomScans({ userId })`) | only captures whose `name` case-matches a room band and whose `project_id` is set | ⚠ **F5** |
| `/scans` — dimensions, capture date, processing/failed state | `RoomScanList:106-120` | dropped | ⚠ F14 |
| `/scans/[id]` — 3D viewer | `ClientRoomScanViewer` + toolbar (orbit/floorplan, full quality) | `CapturedRoomCanvas` hardcoded `mode="orbit"` | ⚠ F16 |
| `/scans/[id]` — viewer failure degrade | `ScanStillFallback` (still + spoken line) | local `CaptureStill`, no line, `null` when no thumbnail | ❌ **F6** |
| `/scans/[id]` — share status + revoke | `RoomScanShareStatus` | `room-capture.tsx:129-162` | ✅ in place (minus expiry, F12) |
| `/scans/[id]` — share with a designer | `ShareScanDialog` (`designer_clients`) | `useProjectTeamMembers`, `role !== 'client'` | ❌ **F3** / ⚠ **F4** |
| Executed instrument → read view | `/proposals/[id]` | `onOpenInstrument` prop, never passed; falls back to `#previously` anchor | ⚠ F19 (L3 wiring at integration) |

## Findings

1. **blocker · high · `apps/client-portal/src/components/threshold/papers-sheet.tsx:89`** — "Other papers" reads `useProjectDocuments(projectId)`, which returns only `list_client_proposals` rows and `scope_change_requests` (`packages/supabase/src/hooks/use-project-documents.ts:35-76`). The old hub's Other-papers register was `useClientDocuments` — the client-visible leg of `project_documents` (contracts, photos, specs, signed PDFs) with `documentSignedUrl(storage_path)` behind an Open act. Inventory §8 item 6 names the requirement literally ("Needs `useClientDocuments`, `useClientPlanSet`, sheet open + download") and §"hooks" marks `use-documents-client.ts` as **DIES unless sheets absorbed**. As shipped, retiring `/documents` removes the client's only route to every file the studio has shared. The lane report frames this as "a different shape, so there was nothing to copy", which conceals a source swap. *Fix: read `useClientDocuments([projectId])` + `looseDocuments`/`visibleDocuments` for the Other-papers register (copy `documentKindLabel` too), and keep `useProjectDocuments` only for the executed-instrument line.*

2. **blocker · high · `papers-sheet.tsx:125,129`** — `settled = !planSet.isLoading && !documents.isLoading` ignores `isError`. React Query drops `isLoading` on error, so a failed read makes `settled` true with `data === undefined`; the sheet then prints "Nothing has been filed here yet." (`:243`) — a false assertion, exactly what the plan's "absence is silence · never guess, never reverse" constraint forbids. Symmetrically, a plan-set-only failure silently omits the whole drawings register while "Other papers" renders, which is the failure mode the old page added `data-testid="plan-set-error"` (`app/documents/page.tsx:106-116`) specifically to prevent. *Fix: fold `isError` into `settled` (hold), and never render `nothingFiled` unless both queries succeeded.*

3. **major · high · `room-capture.tsx:99-101`** — the share list is `useProjectTeamMembers(projectId)` filtered only by `member.role !== 'client'`. `ProjectRole` is `'lead_designer' | 'support_designer' | 'vendor' | 'client' | 'bookkeeper' | 'previous_lead'` (`packages/supabase/src/hooks/use-project-team.ts:9`), so the client is offered "Show it to …" for a **vendor**, a **bookkeeper**, and a **previous lead designer who has been rotated off the project**. `share_room_scan` (`supabase/migrations/00020_room_scan_associations.sql:199`) does not check that the target is a designer, and `room_scans`' SELECT policy (`00020:138`) then grants that user read on the capture via the active association. The absorbed surface listed only `designer_clients` for the signed-in client (`ShareScanDialog.tsx:39-44`) — a strictly narrower set. This widens who a homeowner can hand a 3D capture of their house to. *Fix: keep the old source (`designer_clients` for `auth.uid()`), or at minimum allowlist `lead_designer`/`support_designer` and exclude `previous_lead`.*

4. **major · medium · `room-capture.tsx:87`** — the same read is likely to return nothing in production. `project_team_members` SELECT is gated on `is_project_team_member(project_id)` (`00087_fix_project_team_members_rls_recursion.sql`) or studio co-membership (`00421:116`); a portal client is `projects.client_id` and is not necessarily seated in `project_team_members`. If they are not, the query returns `[]` under RLS with no error and the "Show it to …" act never renders — the absorbed `ShareScanDialog` act is silently lost, and the lane's own report says the RLS reach was never probed. *Fix: probe the read as a real client session before merge; if it returns empty, revert to `designer_clients` (which is client-scoped by construction).*

5. **major · high · `room-capture.tsx:64`** — a capture surfaces only when `room_scans.name` trim/case-matches a `project_rooms` band name **and** `room_scans.project_id` equals this project. `/scans` listed every scan the client owns (`useRoomScans({ userId })`, `RoomScanList.tsx:40`), including project-less captures from the iOS app and captures whose name never matched a room. After R1–R4 delete `/scans`, those captures have no surface at all. The impl report calls this "silence, not a wrong plate" — for an absorb-then-retire plan it is data loss. *Fix: fall back to `project_room_id` (`00265_room_scans_project_linkage.sql`) where present, and give the mat or the plan key a home for unmatched captures.*

6. **major · high · `room-capture.tsx:112-121, 211-222`** — the viewer's degrade path is weaker than the one it replaces and is the *expected* path, not an edge case: `ViewerErrorBoundary`'s own docstring states r3f 8 "reads a React internal removed in React 19: mounting it throws during render". The shipped fallback `ScanStillFallback` (`ViewerErrorBoundary.tsx:52-77`) renders the still **plus** "The interactive 3D view isn't available right now…". The lane's local `CaptureStill` drops that line and returns `null` when `thumbnail_url` is null, so a capture with a model but no still opens to an empty hatched plate with no word at all. *Fix: use the exported `ScanStillFallback` as the boundary fallback.*

7. **major · medium · `papers-sheet.tsx:183`** — a plan sheet is rendered as `<iframe src={signedUrl}>` and there is no download act. The old row did `window.open(url, '_blank', 'noopener,noreferrer')`, which lets the browser choose viewer-or-download per type; the hub's own format vocabulary covers `dwg`, `xls`, `xlsx`, `doc`, `png` (`app/documents/group.ts:140-148`). A Supabase signed URL served with `Content-Disposition: attachment`, or any non-PDF format, renders a blank frame with no error and no way out but "Back to the papers". Inventory §8 item 6 lists "download" as an absorbed act. *Fix: keep the frame for PDFs and add a "Save it" anchor to the signed URL for every sheet.*

8. **major · high · `papers-sheet.tsx:102-123, 183`** — Esc and the Tab wrap are implemented as `onKeyDown` on the dialog element, but `iframe` is in `FOCUSABLE` (`:42`) and the framed document is cross-origin. Once focus enters the frame, no keydown reaches the handler: Esc stops dismissing and Tab escapes the trap into the page beneath (which is not `inert`). *Fix: bind Escape on `document` while open, and either drop `iframe` from `FOCUSABLE` or add explicit "Back to the papers" focus stops either side of the frame.*

9. **minor · high · `mat.tsx:105-114` / `papers-sheet.tsx:158`** — the state is announced on the wrong control: the mat's opener carries no `aria-expanded` and no `aria-controls`, while the dismiss tab *inside* the dialog carries a hardcoded `aria-expanded` (always true). A screen-reader user at the mat is never told the papers can be laid down or are already down. *Fix: `aria-expanded={papersOpen}` + `aria-controls="papers-sheet-title"` on the mat act; drop it from the in-dialog tab.*

10. **minor · high · `room-capture.tsx:77-80`** — the plate is appended *beside* the room drawing; the mock's own toggle removes the drawing (`path-b-the-threshold.html:1059` `svg.classList.toggle('gone', on)`). As shipped the button reads "The room as drawn" while the drawing is still on the page and the capture sits under it — the copy states a state the page is not in, and the file's own header comment ("the drawing stands aside and the capture takes its place") describes behaviour the code does not have. *Fix: hide the band's `RoomDrawing` while the plate is open (needs a prop on `RoomBand`), or change the label.*

11. **minor · high · `room-capture.tsx:179-184`** — the share payload adds `projectId`, which the absorbed act never sent (`ShareScanDialog.tsx:76`: `{ scanId, designerId, accessLevel: 'full' }`). It lands in `room_scan_associations.project_id` and changes what the row means. The brief asked for byte-faithful payloads. *Fix: drop `projectId`, or land it as a deliberate, noted change with the designer-side reader checked.*

12. **minor · high · `room-capture.tsx:143` vs `components/scans/RoomScanShareStatus.tsx:61-64`** — the old sharing line printed `Shared <date>` **and** `· expires <date>` when `expiresAt` was set. The new line prints only "Shown to X since <date>." An association with an expiry now reads as open-ended on the one surface where the client governs consent. `useRoomScanAssociations` already maps `expiresAt`. *Fix: append "· until <day month>" when `association.expiresAt` is set.*

13. **minor · high · `apps/client-portal/src/lib/threshold/papers.ts` (whole file), `room-capture.tsx:194,199`** — three strings are declared byte-copies ("Couldn't open this file.", "Couldn't revoke. Please try again.", "Couldn't share. Please try again.") with no drift guard, while this very directory ships the precedent for one: `components/threshold/__tests__/consent-copy.test.ts` reads the source route off disk and asserts each string verbatim. The sources here are scheduled for deletion by the retirement plan, after which no copy claim is checkable. A guard of that shape would also have caught F1 (it would have had to name `useClientDocuments`). *Fix: add a `papers-copy.test.ts` in the same shape while the old files still exist, and record the source paths in the file header.*

14. **minor · high · `room-capture.tsx:61-64, 110-122`** — `scan.status` is ignored. A `processing` or `failed` capture matches by name, so the act appears and opens to an empty hatched plate with live share/revoke acts and no word. `RoomScanList.tsx:106-110` surfaced the status, and `ClientRoomScanViewer.tsx:113-120` said "3D model not yet available. Your scan may still be processing." *Fix: either skip non-`ready` scans (true silence) or carry one line on the plate.*

15. **minor · high · `papers-sheet.tsx` (absent)** — `clientEvents.documentView({ documentId, kind })` fired on every document open in the old hub (`app/documents/page.tsx:228`). Nothing in the sheet replaces it; `ScoredAction`'s `makingEvents.actionSelected` is a different event with a different shape, so the documents funnel goes dark at retirement. *Fix: call `clientEvents.documentView` in `SheetLine.handleOpen` (and in the restored Other-papers row).*

16. **minor · high · `room-capture.tsx:116`** — `mode="orbit"` is hardcoded; `ClientViewerToolbar`'s orbit/floorplan switch and the full-quality control are dropped. Floorplan is the reading a homeowner most often wants of a captured room, and the inventory marks `/scans/[scanId]` **ABSORB**, not "absorb partially". *Fix: carry a two-word act on the plate ("Seen from above" / "Seen from the room") driving `mode`.*

17. **minor · high · `__tests__/threshold.test.tsx:674-684`** — the one test guarding the shared-file edit asserts the opener exists and that `queryByRole('dialog')` is absent; it never clicks it, so the mat → `papersOpen` → `PapersSheet` wiring — the entire point of the `mat.tsx`/`threshold.tsx` diff — is never exercised. (It cannot be, as written: the suite's partial `@patina/supabase` mock has no `useClientPlanSet`/`useProjectDocuments`.) *Fix: stub `../papers-sheet` the way `../room-capture` is stubbed and assert the click opens it.*

18. **minor · high · `__tests__/papers-sheet.test.tsx` / `__tests__/room-capture.test.tsx`** — missing cases, all behavioural: no error-state test for either query (F2's exact defect is untested); no test that focus returns to the opener on dismiss; no test that Esc still works from inside the frame; `useRoomScans` is never asserted to be called with `{ projectId }`; no `vendor`/`previous_lead` seat case (F3's defect is untested and the fixture only uses `lead_designer`); no two-captures-one-name case (`.find` silently takes the newest of the `created_at desc` order). Mocks are otherwise consistent with the `making/__tests__` house style. *Fix: add the six cases; the error case first.*

19. **minor · high · `threshold.tsx:770-774`** — `onOpenInstrument` is never passed, so an executed instrument's "Read it in full" ships as an anchor to `#previously`, which scrolls to a list — it does not open the instrument. The plan assigns the read view to L3, but as merged from this branch alone the act promises a reading it does not give. *Fix: leave the act out until L3's export is wired at integration, rather than shipping an anchor under that label.*

20. **minor · medium · `room-capture.tsx:111-121`** — when the boundary fires, the fallback renders inside `<div className="relative aspect-video w-full">`; `CaptureStill`'s `<img className="mb-3 max-h-[320px] w-full object-contain">` is not absolutely positioned and will overflow the ratio box rather than fill it. Unverified in a browser by the lane. *Fix: `absolute inset-0 h-full w-full object-contain` in the fallback position (resolved for free by adopting `ScanStillFallback`, F6).*

21. **nit · high · `papers-sheet.tsx:39`, `room-capture.tsx:46`, `room-band.tsx:43`** — `DAY_MONTH` is now declared three times in `components/threshold/`. *Fix: export it once from `lib/threshold/derive.ts` beside `parseSourceDate`.*

22. **nit · high · `room-capture.tsx:42-43`** — `PLATE_HATCH` hardcodes `rgba(22,32,43,.13)` where the rest of the band draws with `currentColor` / `var(--border-*)`. It is the mock's literal, but it will not follow the portal's ink. *Fix: build the hatch from an ink token.*

23. **nit · high · `papers-sheet.tsx:176-178, 283`** — `[sheet.number, \`Rev ${sheet.revLetter}\`, revised].filter(Boolean)` cannot drop the rev clause: the template literal is always truthy, so an empty `revLetter` prints a bare "Rev". Faithfully carried over from `app/documents/page.tsx:193`. *Fix: `sheet.revLetter ? \`Rev ${sheet.revLetter}\` : null`.*

24. **nit · high · `room-capture.tsx:131-133, 165`** — the name fallbacks use `??`, so an empty-string `full_name`/`fullName` yields "Shown to  since …" and an act labelled "Show it to ". `ShareScanDialog.tsx:111` used `?.trim() ||` for this reason. *Fix: `?.trim() || … || 'the studio'`.*

25. **nit · medium · `papers-sheet.tsx:132-135`** — the overlay does not lock scroll on the house behind it and sits at `z-[30]`; the page scrolls under the sheet when the wheel is over the backdrop. No competing z-index exists on this page today, so this is presentation only. *Fix: set `overflow:hidden` on `document.body` while open, in the same effect that takes focus.*

## Discipline notes (no finding)

- **Shared files**: `mat.tsx` is one optional prop + one act; `threshold.tsx` is two imports, one state, one prop and two mounts; `derive.ts` untouched. Both are small and localised — mergeable in the plan's L9→L8→L1→…→L5 order. The one merge hazard is `mat.tsx`'s papers column, which L7 and L8 also extend.
- **VISION §6**: no shadows, no red/green (the old terracotta error colour was correctly dropped for `--text-body`), no badges (the rev-letter chip is gone), no tabs/header/hamburger, `ScoredAction` throughout, no "AI", money never rendered. Voice holds ("Shown to …", "Nothing has been filed here yet."); "Your drawings"/"Other papers" are the hub's own headings.
- **Hooks discipline**: clean. `PapersSheet` has no hooks above its `if (!open) return null`, and the hooks live in the gated `PapersSheetBody`; `RoomCapture` keeps `useRoomScans`/`useState` above its early return; `document.activeElement` is read in an effect, never at render; no `window`/`document` at render. Closed sheet issues no reads (asserted at `papers-sheet.test.tsx:77`).
- **Security**: no cross-project or cross-client read was found. `useClientPlanSet([projectId])` and `useProjectDocuments(projectId)` are project-scoped; `room_scans` SELECT (`00020:138`) and `room_scan_associations` SELECT (`00020:84`) both scope to owner/consumer, so `useRoomScans({ projectId })` and `useRoomScanAssociations({ scanId })` cannot leak another household's rows. The exposure risk is on the **write** side only — F3.

## Verdict

**NOT MERGEABLE** — 2 blockers (the Other-papers register reads the wrong source, so `/documents` cannot be retired without losing every shared file; and a failed query prints "Nothing has been filed here yet.", the exact false assertion the silence rule forbids) and 6 majors, one of which widens who a homeowner can hand a 3D capture of their house to. Fix F1–F8, then re-review.
