# L5 — Papers and rooms · re-review of the fix round

- Branch `client-page-2/l5` @ `3543e0717` (fix commit `3543e0717`, build commit `2c78c3fb5`), worktree
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5` (read-only).
- Prior review: `artifacts/client-page-completion-2026-09-04/waves/w1/l5-review.md` @ `2c78c3fb5`.
- Fix round documented at the end of `l5-impl.md`. Read, not trusted — every claim below was
  confirmed against the file at HEAD.
- Diff vs `origin/main`: 14 files, +2312/−7. New in the fix round: `hooks/use-my-designers.ts`,
  `lib/threshold/__tests__/papers-copy.test.ts`; `room-band.tsx` and `derive.ts` newly touched
  (the `DAY_MONTH` export, F21).

## Gates (run in the worktree)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output, EXIT=0)
```

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l5/apps/client-portal test -- threshold making
PASS src/components/threshold/__tests__/papers-sheet.test.tsx
PASS src/components/threshold/__tests__/room-capture.test.tsx
PASS src/lib/threshold/__tests__/papers.test.ts
PASS src/lib/threshold/__tests__/papers-copy.test.ts
PASS src/components/threshold/__tests__/threshold.test.tsx
… (34 suites)

Test Suites: 34 passed, 34 total
Tests:       637 passed, 637 total
Time:        5.823 s
Ran all test suites matching /threshold|making/i.
```

```
$ npx eslint src/components/threshold src/lib/threshold src/hooks/use-my-designers.ts   (cwd apps/client-portal)
✖ 1 problem (0 errors, 1 warning)
```
The warning is the unused `@typescript-eslint/no-explicit-any` directive carried verbatim from
`ShareScanDialog.tsx` into `use-my-designers.ts:33`; the same warning already stands on
`src/hooks/use-documents-client.ts`. House precedent, not drift.

No sandbox retry was needed. Neither gate covers the findings below — all are behavioural or
degrade-path.

## Prior blockers — verified against the diff

| # | Claim | Verdict |
|---|---|---|
| F1 | "Other papers" read the wrong source | ✅ **fixed** |
| F2 | a failed read printed "Nothing has been filed here yet." | ⚠ **fixed, but the fix introduced N1/N2** |

**F1 — FIXED.** `papers-sheet.tsx:112` now reads `useClientDocuments([projectId])`, and the
register at `papers-sheet.tsx:293-302` renders `FiledLine` (`:408-458`), whose act is
`DocumentRow`'s byte-for-byte: `clientEvents.documentView({ documentId, kind: doc_type })` →
`documentSignedUrl(storage_path)` → `window.open(url, '_blank', 'noopener,noreferrer')`
(`papers-sheet.tsx:411-425` vs `app/documents/page.tsx:222-238`). `visibleDocuments`,
`looseDocuments`, `documentKindLabel` + `FORMAT_LABELS`/`humanize` are copied into
`lib/threshold/papers.ts:81-124`, and `papersForProject` (`papers.ts:153-169`) carries
`groupDocumentsByProject`'s proposal-anchor resolution (`houseOf`, `papers.ts:131-139`) plus the
unclaimed-row sentinel as a third register, "Earlier papers" (`papers-sheet.tsx:304-313`).
`useProjectDocuments` is now the executed-instrument register only (`:113`, `:315-328`). The
client's route to every shared file survives the retirement of `/documents`.

**F2 — the false assertion is gone.** `answered()` folds `isError` for all three registers and
`settled` is their conjunction (`papers-sheet.tsx:164-166`); `nothingFiled` requires `settled`
(`:181`) and is the only thing that prints the line (`:330-337`). Two tests hold it
(`papers-sheet.test.tsx:160`, `:168`). But see **N1** and **N2**: the shape chosen makes any one
register's failure blank the whole sheet, silently, which is the opposite of what the surface
being absorbed does on purpose.

## Prior majors — verified against the diff

**F3 — FIXED.** `useProjectTeamMembers` is gone from the file. `room-capture.tsx:17,175,188` reads
`useMyDesigners()`, and `hooks/use-my-designers.ts:38-43` is `designer_clients` joined to
`profiles`, `.eq('client_id', user.id)` — line-for-line `ShareScanDialog.tsx:38-43`. Vendors,
bookkeepers and rotated-off previous leads can no longer be offered a capture of the house. The
drift guard asserts both sides and that `room-capture.tsx` never names `useProjectTeamMembers`
(`papers-copy.test.ts:133-141`).

**F4 — CLOSED BY F3.** `designer_clients` is client-scoped by construction
(`use-my-designers.ts:43`), so the act no longer depends on the client being seated in
`project_team_members`. Still unprobed against a real client session (impl report says so);
the failure mode is now "no act" rather than "wrong act", which is the acceptable one.

**F5 — FIXED.** Two changes, both present. `RoomCapture` prefers the capture's own scope room
and falls back to the name only for captures carrying none (`room-capture.tsx:98-101`, helper
`claims()` at `:82-86`); `threshold.tsx:752-756` passes `roomId`. `StrayCaptures`
(`room-capture.tsx:107-144`) reads `useRoomScans({ userId })` — the register `/scans` carried —
and stands every capture the client owns that no band claimed, project-less ones included,
mounted after the last band at `threshold.tsx:761-767`. Residual gap in **N5**.

**F6 — FIXED.** The boundary fallback is the exported `ScanStillFallback`
(`room-capture.tsx:16, 203-207`), the same node `ClientRoomScanViewer.tsx:106-110` passes, so the
client gets the still *and* a line, and a line even with no still
(`ViewerErrorBoundary.tsx:71-75`). The local `CaptureStill` is gone. **F20** closes with it —
`ScanStillFallback` is `h-full w-full` inside the plate's `relative aspect-video w-full`
(`room-capture.tsx:202`).

**F7 — FIXED.** `isFrameable` (`papers-sheet.tsx:71-75`, `FRAMEABLE` at `:55`) gates the frame
(`:238-244`), so `dwg`/`xls`/`doc` never render a blank one, and a "Save it" anchor to the signed
URL stands beside "Back to the papers" for **every** sheet (`:255-266`) with the hub's own
`target="_blank" rel="noopener noreferrer"`. Tested at `papers-sheet.test.tsx:228`.

**F8 — FIXED.** Escape is bound on `document` in its own effect (`papers-sheet.tsx:135-141`) and
removed from the dialog's `onKeyDown`, which now handles Tab only (`:143-159`); `iframe` is out of
`FOCUSABLE` (`:57`), leaving Open / Back / Save it / the tab as the trap's stops either side of
the frame. Tested at `papers-sheet.test.tsx:343` (including a raw `document`-level keydown) and
`:358`.

## Prior minors and nits — spot-verified

All accepted, none rejected; F10 and F5's placement clause took the review's own stated
alternative, with reasons recorded. Confirmed in the file:

F9 `mat.tsx:120-121` (`aria-expanded={papersOpen}` / `aria-controls="papers-sheet"`), hardcoded
value gone from the in-dialog tab (`papers-sheet.tsx:206-214`) · F10 label is now "The room as
captured" / "Put the capture away" (`room-capture.tsx:165`) and the header says the drawing stays
(`:146-151`) · F11 payload is `{ scanId, designerId, accessLevel: 'full' }` (`:307-311`) ·
F12 "· until <day month>" when `expiresAt` is set (`:259, 268-270`) · F13
`lib/threshold/__tests__/papers-copy.test.ts` (behaviour against `group.ts`, five carried strings
read off disk, both share-list assertions) · F14 measure + capture day in the caption
(`:56-75`) and the /scans viewer's two pending lines (`:226-231`) — **partially**, see **N4** ·
F15 `clientEvents.documentView` on both open paths (`:355`, `:412`) · F16 mode act driving
orbit/floorplan (`:238-248`) · F17 `threshold.test.tsx:698-714` clicks the mat act, asserts the
dialog opens and `aria-expanded` flips, and dismisses it · F18 the cases are real, not stubs
(failed-papers `papers-sheet.test.tsx:160`, failed-plan-set `:168`, focus restore `:373`, Escape
`:343`, `{projectId}`/`{userId}` `room-capture.test.tsx:136,332`, two-captures-one-name `:180`,
scope-room precedence `:156,171`) · F19 the act renders only when `onOpenInstrument` is passed
(`papers-sheet.tsx:481-492`), and `threshold.tsx:783-786` does not pass it · F21 `DAY_MONTH`
exported once (`derive.ts:241-244`), imported by all three · F22 hatch from `currentColor` on a
`pointer-events-none` layer (`room-capture.tsx:45-46, 196-200`) · F23 `revLetter ? … : null` at
`:230` and `:376` · F24 `?.trim() || … || 'the studio'` at `:254-257` and `:292-293` · F25
`body.style.overflow` set and restored in the focus effect (`:124-130`), tested at
`papers-sheet.test.tsx:141`.

## New defects the fix round introduced

**N1 · major · high · `apps/client-portal/src/components/threshold/papers-sheet.tsx:164-166, 217-223, 271`** —
the F2 fix made the three registers a single all-or-nothing gate: `settled` is the conjunction of
`answered(planSet) && answered(filed) && answered(instruments)`, and everything below the title
(`:271`) is gated on it. So a failed **drawings** read now hides the contracts, the photos and the
signed PDFs that loaded perfectly well. The surface being absorbed does the exact opposite, by
deliberate design — `app/documents/page.tsx:53-58`: *"A drawings-leg failure must not blank the
page: contracts and other papers keep rendering, and the drawings register carries its own inline
notice instead. Page-level error is reserved for the papers query itself."* The lane even shipped a
test locking the regression in (`papers-sheet.test.tsx:168`, "holds rather than showing a file it
cannot vouch is the whole file", asserting `papers-sheet-other` is absent on a plan-set error).
Same gate also means a *background* refetch error — React Query refetches on window focus by
default — empties the sheet mid-read, taking an open `<iframe>` reading with it, even though
`data` is still cached. *Fix: gate each register on its own query (`answered(planSet)` for the
drawings section, `answered(filed)` for Other/Earlier, `answered(instruments)` for the
instruments), keep `nothingFiled` on the conjunction, and drop that test's assertion.*

**N2 · major · high · `papers-sheet.tsx:217-223`** — on failure the sheet says nothing at all. The
hold is an empty `aria-hidden="true"` `min-h-[40vh]` div, so a client whose read fails sees the
words "The papers", a dismiss tab, and 40vh of blank paper — and a screen-reader user hears only
the title and the tab. Both of the absorbed surface's failure notices were dropped:
`app/documents/page.tsx:93-97` ("We couldn't load your documents right now. Try refreshing the
page.") and `:106-116` (`data-testid="plan-set-error"`, "We couldn't load your drawings right now.
Try refreshing the page."). Inventory §8 counts the drawings-leg failure notice as an absorbed
act, and the prior review's F2 named it as the reason that testid exists. "Absence is silence"
governs what the house asserts about *content*; it does not license silence about a failure the
client can act on by refreshing. *Fix: one line per failed register, in the house's voice, in
`--text-body` (not the old terracotta).*

**N3 · minor · high · `room-capture.tsx` (whole file)** — `scan.status` is still never read; the
only `status` in the file is the association filter at `:185`. F14 is therefore half-fixed: the
measure and capture day landed (`:56-75`), but a capture with `status: 'failed'` and no model
prints *"3D model not yet available. / Your scan may still be processing. Check back shortly."*
(`:226-231`) — an assertion that is simply false for a failed capture. `RoomScanList.tsx:106-110`
carried the literal status instead. *Fix: read `scan.status`; a `failed` capture either says so in
one line or does not offer the act.*

**N4 · minor · high · `room-capture.tsx:123-128` vs `:98-101`** — `StrayCaptures` filters out every
capture a band **claims**, but a band only ever **shows** one (`.find`, `:98-101`, newest first by
the hook's `created_at desc`). Two captures answering to one band — two walks of the same room,
the ordinary case for a re-scan — leave the older one claimed by `claims()` and therefore excluded
from the stray register, so it has no surface anywhere. This is precisely the hole F5's fix was
meant to close, and the lane's own test (`room-capture.test.tsx:180`, "takes the newest of two
captures that answer to one name") asserts the shadowing without giving the shadowed capture a
home. *Fix: have `StrayCaptures` exclude the capture each band actually displays (the same
`.find` result), not everything a band could claim.*

**N5 · minor · medium · `room-capture.tsx:95, 121`** — both reads destructure `data` only, so a
failed `room_scans` read renders nothing. `/scans` said "Couldn't load your rooms. Please refresh."
(`RoomScanList.tsx:66-72`). Lower severity than N2 because a capture is a secondary reading of a
room the band already draws, but it is the same dropped-notice class and the same one-line fix.

**N6 · nit · high · `mat.tsx:121`** — `aria-controls="papers-sheet"` points at an id that does not
exist while the sheet is closed (`papers-sheet.tsx:190` renders it only when open). Harmless in
every shipping AT, but it is a dangling IDREF whenever the act is read in its resting state.
*Fix: set `aria-controls` only when `papersOpen`.*

**N7 · nit · medium · `room-capture.tsx:203-207`** — the mandated `ScanStillFallback` is
`bg-patina-charcoal` with `text-white/80` (`ViewerErrorBoundary.tsx:60-75`): a dark box with white
type inside the threshold's hairline-on-paper plate. It is the right *content* (F6) in the wrong
ink for this surface. Flag for the design pass rather than the code pass; a paper-ground variant of
the same two lines would carry it.

**N8 · note (no finding)** — `SheetLine` fires `clientEvents.documentView({ documentId:
sheet.projectDocumentId, kind: 'plan_sheet' })` (`papers-sheet.tsx:355`). The old `PlanSheetRow`
fired nothing (`app/documents/page.tsx:163-178`) — only `DocumentRow` did — so this is a **new**
event value entering the documents funnel, emitted before the open is known to have succeeded. The
prior review's F15 asked for it explicitly; recording it so the funnel owner is not surprised by a
`kind` no dashboard has seen.

**N9 · note (no finding)** — every threshold page now issues two joined `room_scans` selects
unconditionally (`{ projectId }` shared across all bands, `{ userId }` for `StrayCaptures`), plus
three register reads whenever the sheet opens. Acknowledged in the impl report, unmeasured.

## Discipline notes

- **Shared-file edits stayed minimal.** `mat.tsx` +27/−2 (two optional props, one import, one act);
  `threshold.tsx` +30/−1 (two imports, one state, one prop, three mounts); `room-band.tsx` −3/+1
  (the `DAY_MONTH` import, F21); `derive.ts` +6 (the export). Still mergeable in the plan's
  L9→L8→L1→…→L5 order; `mat.tsx`'s papers column remains the one contended hunk.
- **Security.** The consent-widening the prior review found is genuinely closed and guarded: the
  share list is `designer_clients` for `auth.uid()` and the payload is the dialog's three keys. No
  cross-project or cross-client read exists in the new code — `papersForProject` keys on this
  project or on a null house, both RLS-scoped, and `StrayCaptures` filters out captures filed
  against another project (`room-capture.tsx:126`).
- **VISION §6.** Holds. No shadows, no badges, no red/green (the old terracotta error colour was
  not carried), money never rendered, `ScoredAction` throughout, voice intact ("Shown to … since 19
  June · until 3 August.", "Put the capture away", "Rooms you captured"). The one break is N7, and
  it is inherited.
- **Hooks discipline.** Clean. `PapersSheet` still has no hook above its `if (!open) return null`
  (`papers-sheet.tsx:96`), the reads live in `PapersSheetBody`, `CapturedRoom`'s hooks mount with
  the component rather than under a condition (`room-capture.tsx:168`), and the closed sheet issues
  no reads (asserted at `papers-sheet.test.tsx:125`).
- **The drift guard is real.** `papers-copy.test.ts` compares four functions against
  `app/documents/group.ts` output-for-output and reads five carried strings off their source files;
  it would have caught F1. It is correctly scoped to die with the sources.

## Verdict

**MERGEABLE_WITH_FIXES** — both prior blockers and all six prior majors are fixed in the file, and
every minor and nit was carried out or closed by the review's own alternative. The fix round
introduced no security or happy-path regression, but the shape chosen for F2 turned three
independent registers into one all-or-nothing gate that blanks the whole sheet — silently, with
neither of the absorbed failure notices — when any single register fails (N1, N2). Both are
one-edit fixes in `papers-sheet.tsx`; land them plus N3–N5 before merge.
