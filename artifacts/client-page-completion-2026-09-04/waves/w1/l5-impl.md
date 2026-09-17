# L5 — Papers and rooms (impl report)

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5`
- Branch: `client-page-2/l5` (from `origin/main` @ `26b15145e`)

## What was built

### 1. The papers, as a laid-in sheet (absorbs `/documents`)

- **`apps/client-portal/src/lib/threshold/papers.ts`** (new, pure) — `groupClientPlanSet`
  and its `titleCase` **copied from `src/app/documents/group.ts`** (the Documents hub's own
  grouping, unchanged: discipline → title-cased, else the letters before the dash in the
  sheet number, else "Drawings"). Adds `PAPERS_TAB_LABEL` ("The papers, in full"),
  `paperKindLabel` and `isExecutedInstrument` for the `useProjectDocuments` shape (the hub's
  `documentKindLabel` reads `ClientDocument`, a different shape, so there was nothing to copy
  for those).
- **`apps/client-portal/src/components/threshold/papers-sheet.tsx`** (new) — `PapersSheet`:
  a `role="dialog" aria-modal` sheet laid over the page (paper on paper, one hairline, no
  shadow, no rounded card), `aria-labelledby` "The papers", tab-wrapping focus trap, focus
  restored to the opener on dismiss, Esc dismisses, and the same tab that opened it
  (`PAPERS_TAB_LABEL`, `aria-expanded`) dismisses it. Registers:
  - **Your drawings** — `useClientPlanSet([projectId])` grouped as above; each row's "Open"
    resolves `documentSignedUrl(sheet.storagePath)` (**copied act** from
    `app/documents/page.tsx`'s `PlanSheetRow`, including the failure copy "Couldn't open this
    file.") and renders the sheet **in the overlay's own frame** instead of the hub's
    `window.open(_blank)`.
  - **Other papers** — `useProjectDocuments(projectId)`; each line is `{kind} · Signed {date}`
    over the title. An **executed instrument** (proposal with `signed_at`) carries "Read it in
    full": it calls the optional `onOpenInstrument(proposalId)` prop when the page has a read
    view, otherwise it is an anchor to `#previously` that dismisses the sheet.
  - Absence is silence inside the sheet: nothing but a measure-holding block until both
    queries settle; only then can it say "Nothing has been filed here yet."
  - Hooks are only mounted while the sheet is open (`open` gates the body component), so a
    closed sheet issues no reads.

### 2. The room as captured (absorbs `/scans`, `/scans/[scanId]`)

- **`apps/client-portal/src/components/threshold/room-capture.tsx`** (new) — `RoomCapture`,
  mounted inside every `RoomBand`. `useRoomScans({ projectId })` (one query key, deduped
  across bands); the capture is matched to its band **by name** (trim + case-insensitive) —
  `room_scans` carries no `project_rooms` id, and the page already matches plan lines to rooms
  by name. A room with no capture renders nothing at all.
  - The act is a tertiary `ScoredAction` toggling "The room as captured" / "The room as drawn"
    with `aria-expanded` — the mock's own copy (`path-b-the-threshold.html:523,1059`).
  - Open, it draws the mock's **plate** (`html:218-221`: hairline, 210px minimum, 45° hatch,
    mono caption on paper) captioned `Captured room · {name}` (`html:1053`). With a model
    (`model_url_gltf ?? model_url`) the plate holds the scan viewer in place —
    `ClientViewerCanvas` behind `next/dynamic` (`ssr:false`, loaded only when the plate opens)
    inside the existing `ViewerErrorBoundary`, whose fallback is the scan's still. With no
    model, the still stands alone.
  - **Share / revoke in place**: active associations from `useRoomScanAssociations({ scanId })`
    read as "Shown to {designer} since {day month}." with a "Stop showing it" act
    (`useRevokeScanAccess`, payload `{ associationId }` as `RoomScanShareStatus` sent it);
    studio members on this project (`useProjectTeamMembers`, `role !== 'client'`) who are not
    already looking at it get "Show it to {name}" (`useShareRoomScan`, `{ scanId, designerId,
    accessLevel: 'full', projectId }`). Failure copy **copied** from the old surfaces:
    "Couldn't revoke. Please try again." (`RoomScanShareStatus.tsx`) and "Couldn't share.
    Please try again." (`ShareScanDialog.tsx`).

### 3. Shared-file edits (kept to the mount)

- `components/threshold/mat.tsx` — one optional prop `onOpenPapers`, one import, and the
  tertiary act at the foot of the papers column. Existing papers lines untouched.
- `components/threshold/threshold.tsx` — two imports, `papersOpen` state, `onOpenPapers` on
  `<Mat>`, `<RoomCapture>` inside the `RoomBand` children, `<PapersSheet>` mounted outside
  `SinceYesterday` (an overlay must not dim). No reformatting.

## Files

New:
- `apps/client-portal/src/lib/threshold/papers.ts`
- `apps/client-portal/src/lib/threshold/__tests__/papers.test.ts`
- `apps/client-portal/src/components/threshold/papers-sheet.tsx`
- `apps/client-portal/src/components/threshold/__tests__/papers-sheet.test.tsx`
- `apps/client-portal/src/components/threshold/room-capture.tsx`
- `apps/client-portal/src/components/threshold/__tests__/room-capture.test.tsx`

Edited:
- `apps/client-portal/src/components/threshold/mat.tsx`
- `apps/client-portal/src/components/threshold/threshold.tsx`
- `apps/client-portal/src/components/threshold/__tests__/mat.test.tsx` (+1 test)
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx`
  (+`../room-capture` stub mock — the real component reads `room_scans` and would have
  crashed that suite's partial `@patina/supabase` mock; +1 wiring test)

## Hooks used (all pre-existing; no new `@patina/supabase` hook)

`useClientPlanSet`, `useProjectDocuments`, `useRoomScans`, `useRoomScanAssociations`,
`useShareRoomScan`, `useRevokeScanAccess`, `useProjectTeamMembers` — all already exported from
the `@patina/supabase` barrel. Portal-local: `documentSignedUrl`
(`@/hooks/use-documents-client`), `parseSourceDate` (`lib/threshold/derive.ts`), `ScoredAction`,
`ViewerErrorBoundary` + `ClientViewerCanvas` (`components/scans/`).

## Gate output (verbatim)

```
$ pnpm --dir <wt>/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5/apps/client-portal
> tsc --noEmit
```
(no output, exit 0)

```
$ pnpm --dir <wt>/apps/client-portal test -- threshold making papers room-capture
PASS @patina/client-portal src/components/threshold/__tests__/room-capture.test.tsx
PASS @patina/client-portal src/components/threshold/__tests__/threshold.test.tsx

Test Suites: 33 passed, 33 total
Tests:       598 passed, 598 total
Snapshots:   0 total
Time:        4.475 s, estimated 5 s
Ran all test suites matching /threshold|making|papers|room-capture/i.
```
(`threshold making` alone: 33 suites / 598 tests passed. The three new suites contribute 28
tests + 1 test each added to `mat.test.tsx` and `threshold.test.tsx`.)

```
$ npx eslint src/components/threshold src/lib/threshold
EXIT=0
```
(0 errors, 0 warnings)

## Not verified

- **No browser or e2e pass.** Nothing here was rendered in a real page: the overlay's
  layering over the story pole, the plate's hatch against real paper, the sheet iframe against
  a real signed URL, and phone behaviour are unverified.
- **No real data.** Every hook is mocked in jest. The by-name match between `room_scans.name`
  and a `project_rooms` name is unproven against production rows — if studios name captures
  differently from rooms, the act simply never appears (silence, not a wrong plate).
- **The 3D canvas was never mounted.** `ClientViewerCanvas` is stubbed in tests; whether r3f 8
  renders or throws under React 19 inside the band is unknown — the `ViewerErrorBoundary`
  fallback path is the assumed outcome and is itself untested here.
- **`share_room_scan` / `revoke_room_scan_access` RPCs were not called for real**, and the
  RLS reach of `useRoomScanAssociations` from a client session is assumed from
  `RoomScanShareStatus`'s existing use, not probed.
- **L3's read view is not wired.** `onOpenInstrument` is left unpassed by `threshold.tsx`, so
  an executed instrument currently falls back to the `#previously` anchor. Integration should
  pass L3's export into `<PapersSheet onOpenInstrument={…}>`.
- Full `pnpm test` for the portal (coverage floor 70/60/70/70) was not run — only the
  `threshold|making|papers|room-capture` selection the brief named.

---

# Fix round — L5 (review `l5-review.md` @ `2c78c3fb5`)

Every blocker and major applied; every minor and nit accepted. Nothing rejected outright;
two findings were closed by the review's own stated alternative rather than its first option
(F10, and F5's "give it a home" clause), with the reason recorded below.

## Fixed, by number

**F1 · blocker — "Other papers" read the wrong source.** `papers-sheet.tsx` now reads
`useClientDocuments([projectId])` (the Folio's client-visible leg of `project_documents`) for
the Other-papers register, opened by `documentSignedUrl` into a new tab exactly as
`DocumentRow` opened it. `visibleDocuments`, `looseDocuments`, `documentKindLabel` (with
`FORMAT_LABELS` / `humanize`) are copied into `lib/threshold/papers.ts` from
`app/documents/group.ts`; `papersForProject` carries `groupDocumentsByProject`'s
proposal-anchor resolution, and a visible row no house can claim lands in a third register,
"Earlier papers", rather than vanishing — the hub's own sentinel behaviour.
`useProjectDocuments` is now read for the executed-instrument register only ("What you have
signed"); its `scope_change` rows are dropped (L6 owns scope changes).

**F2 · blocker — a failed read printed "Nothing has been filed here yet."** `settled` now
folds `isError` for all three registers (`!isLoading && !isError`), so a failed read holds the
sheet's measure and says nothing, and `nothingFiled` cannot be reached unless every register
answered. Two tests cover it: a failed papers read, and a failed plan-set read with papers
present.

**F3 · major — the share list widened who a homeowner can hand a capture to.**
`useProjectTeamMembers` is gone. `src/hooks/use-my-designers.ts` is `useMyDesigners` copied
verbatim from `ShareScanDialog.tsx` — `designer_clients` for `auth.uid()`, the strictly
narrower set the absorbed act used. Vendors, bookkeepers and rotated-off previous leads can
no longer be offered a 3D capture of the client's house.

**F4 · major — the seat read would likely return nothing under RLS.** Closed by F3:
`designer_clients` is client-scoped by construction (`.eq('client_id', user.id)`), so the act
does not depend on the client being seated in `project_team_members`.

**F5 · major — captures with no name match had no surface.** Two changes. (a) `RoomCapture`
takes `roomId` and matches `room_scans.project_room_id` (00265) first, falling back to the
name only for captures that carry no scope room; a capture routed to a *different* scope room
no longer answers to a band by name. (b) New `StrayCaptures`, mounted after the last room
band, reads `useRoomScans({ userId })` — the register `/scans` carried — and stands every
capture the client owns that no band claimed, project-less ones included, each with the same
plate. Captures filed against another house are left to that house.

**F6 · major — the degrade was weaker than the one it replaces.** The boundary fallback is
now the exported `ScanStillFallback`, so the client gets the still *and* "The interactive 3D
view isn't available right now…" — and a line even when there is no still at all. The local
`CaptureStill` is gone. (This also closes **F20**: `ScanStillFallback` fills its ratio box.)

**F7 · major — no download act, and a frame that cannot show every format.** The viewer panel
gained a "Save it" anchor to the signed URL (`target="_blank" rel="noopener noreferrer"`, the
hub's own `window.open` flags) for every sheet, and the frame is now rendered only for formats
a frame can draw (pdf, png/jpg/gif/webp/svg, or an unknown extension); `dwg`/`xls`/`doc` open
straight to the anchor instead of a blank frame.

**F8 · major — Esc and the Tab wrap died once focus entered the frame.** Escape is bound on
`document` in its own effect (and removed from the dialog's `onKeyDown`, so it fires once);
`iframe` is dropped from `FOCUSABLE`, leaving "Open"/"Back to the papers"/"Save it"/the tab as
the trap's stops either side of the frame.

**F9 · minor — the state was announced on the wrong control.** `Mat` takes `papersOpen`; the
opener carries `aria-expanded={papersOpen}` and `aria-controls="papers-sheet"` (the dialog now
has that id). The hardcoded `aria-expanded` on the in-dialog tab is gone.

**F10 · minor — the label stated a state the page was not in.** Taken by the review's second
option: the act now reads "The room as captured" → "Put the capture away", and the file's
header says the drawing stays. *Why not the first option:* hiding `RoomBand`'s drawing needs
the per-room open state lifted into `threshold.tsx` plus a new `room-band.tsx` prop — a larger
shared-file edit than the standing "shared-file edits minimal" ruling allows for a
presentational nit, and `mat.tsx`/`threshold.tsx` are already contended at integration.

**F11 · minor — the share payload had grown a field.** `projectId` dropped;
`{ scanId, designerId, accessLevel: 'full' }`, asserted key-for-key in the test.

**F12 · minor — an expiry read as open-ended.** "Shown to Nora Quist since 19 June · until 3
August." when `association.expiresAt` is set.

**F13 · minor — no drift guard on the copies.** New
`src/lib/threshold/__tests__/papers-copy.test.ts` (node env, the `consent-copy.test.ts`
shape): it imports `app/documents/group.ts` and asserts `groupClientPlanSet`,
`visibleDocuments`, `looseDocuments` and `documentKindLabel` agree with it output-for-output,
reads the three carried error strings and the two pending-model lines off their source files,
and asserts the share list is still `designer_clients`-for-`client_id` on both sides and that
`room-capture.tsx` does not read `useProjectTeamMembers`. `papers.ts`'s header names every
source path. The retirement plan deletes the sources and this guard together.

**F14 · minor — status ignored; dimensions and capture date dropped.** A capture with no model
now carries the /scans viewer's own two lines ("3D model not yet available." / "Your scan may
still be processing. Check back shortly.") instead of an empty plate, and the plate's caption
carries the room's measure and the day it was walked — "Captured room · Entry & stair hall ·
4.2 × 3.1 m · 19 June" — the two figures `RoomScanList` printed.

**F15 · minor — the documents funnel went dark.** `clientEvents.documentView` fires on both
open paths: `{ documentId: doc.id, kind: doc.doc_type }` on an Other-papers row (the hub's own
call, byte-copied) and `{ documentId: sheet.projectDocumentId, kind: 'plan_sheet' }` on a plan
sheet.

**F16 · minor — the orbit/floorplan switch was dropped.** A two-word act on the plate drives
`mode`: "Seen from above" → floorplan, "Seen from the room" → orbit. (Full-quality is not
carried: `ClientRoomScanViewer` documents it as informational until the media service returns
tiered URLs, so it toggles nothing.)

**F17 · minor — the shared-file wiring was never exercised.** `threshold.test.tsx` stubs
`../papers-sheet` and now clicks the mat's act, asserts the dialog opens, asserts
`aria-expanded` flips, and dismisses it; it also asserts every `RoomCapture` receives a
`roomId` and that `StrayCaptures` is mounted.

**F18 · minor — six missing behavioural cases.** Added, error case first: failed-papers and
failed-plan-set states; focus returned to the opener on dismiss; Escape from a `document`-level
keydown (the frame case); `useRoomScans` asserted to be called with `{ projectId }` and with
`{ userId }`; the two-captures-one-name case (newest wins); scope-room-vs-name precedence and
a capture routed elsewhere. The vendor/`previous_lead` seat case is moot — the seat list is no
longer read, and the copy guard asserts it stays that way.

**F19 · minor — an anchor shipped under "Read it in full".** The act renders only when
`onOpenInstrument` is passed; until L3's export is wired at integration the instrument is
named and dated and promises nothing.

**F21 · nit — `DAY_MONTH` declared three times.** Exported once from
`lib/threshold/derive.ts`; `room-band.tsx`, `papers-sheet.tsx` and `room-capture.tsx` import it.

**F22 · nit — the hatch was a hardcoded rgba.** The plate now draws its hatch from
`currentColor` on a `pointer-events-none` layer at `opacity-[0.13]`, so it follows the
portal's ink without fading the plate's contents.

**F23 · nit — a bare "Rev".** `sheet.revLetter ? \`Rev ${sheet.revLetter}\` : null`, both on
the row and in the viewer's meta line; tested.

**F24 · nit — an empty name printed a blank.** `?.trim() || … || 'the studio'` on both the
sharing line and the share act; tested.

**F25 · nit — the house scrolled under the sheet.** The focus effect also sets
`document.body.style.overflow = 'hidden'` and restores the previous value on unmount; tested.

## Rejections

None. F10 and F5's placement clause were resolved by the review's own stated alternative, for
the reasons recorded against each above.

## Gates (worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5`)

```
$ pnpm --dir .../apps/client-portal type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --dir .../apps/client-portal test -- threshold making
Test Suites: 34 passed, 34 total
Tests:       637 passed, 637 total
Ran all test suites matching /threshold|making/i.
```

```
$ npx eslint src/components/threshold src/lib/threshold src/hooks/use-my-designers.ts
✖ 1 problem (0 errors, 1 warning)   EXIT=0
```
The one warning is an unused `@typescript-eslint/no-explicit-any` disable directive in the
copied `useMyDesigners` — carried verbatim from `ShareScanDialog.tsx`; the same warning is
reported for the existing `src/hooks/use-documents-client.ts`, so it is house precedent, not
drift. Zero errors.

Full portal jest was also run: **1465 passed, 1 failed, 2 suites failed** — both failures are
pre-existing and untouched by this lane: `src/lib/__tests__/portal-access.test.ts`
(`foreignPortalFromDomain('manufacturer')` now returns the maker workspace) and
`src/lib/data/__tests__/orders.test.ts` (`Cannot find module '../orders'`). Neither file, nor
anything they import, is touched by L5; `portal-access.ts` is byte-identical to `HEAD`.

## Still not verified after the fix round

- No browser, no device, no e2e. The overlay against the story pole, the hatch on real paper,
  a real signed URL in the frame, and `ScanStillFallback` inside the plate are unrendered.
- `useMyDesigners` was not probed against a real client session. It is the read the absorbed
  dialog used, so its RLS reach is the dialog's, but a client with no `designer_clients` row
  gets no "Show it to …" act at all — that case is untested against production rows.
- `share_room_scan` / `revoke_room_scan_access` were not called for real, and
  `room_scans.project_room_id` has never been observed populated on a client's own captures —
  the name fallback is still the path that will fire in practice.
- `StrayCaptures` issues a second `room_scans` read (`{ userId }`) beside the bands'
  `{ projectId }` read. Both are cached per key; the duplicate fetch is unmeasured.
- L3's read view is still unwired; `onOpenInstrument` must be passed at integration or the
  "Read it in full" act stays absent by design.
