# Adversarial review — Lane L6 (Analytics), Wave 1

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-onb-l6`
Branch: `onboarding/w1-l6` (`c94c8659b` feat, `e4791fd20` cross-lane fixes), 2 commits ahead of `onboarding/w1-integration`.
Diff reviewed: `git diff onboarding/w1-integration...HEAD` (28 files, +576/-31). Read-only review — no files modified, no state-changing git, no prod touched.

## Verdict

**FIX** — must-fix: ZF-1, FA-1. Should-fix (non-blocking but flagged): ZF-2.

Findings by severity: **High: 2** (ZF-1, FA-1) · **Medium: 1** (ZF-2) · **Low: 0**
Findings by confidence: High: 2 (ZF-1, ZF-2) · Medium-High: 1 (FA-1)

---

## Findings

### ZF-1 — `document_zone_flight` false-fires on same-document sub-route navigation (Plans/Spec Book/Boards)

- **Severity:** High **Confidence:** High
- **File:** `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1226-1289`

`DocumentPageBody` (the component at `/doc/[id]`) registers the zone-flight "put down" signal as an unmount cleanup:

```ts
useEffect(() => () => fireZoneFlightIfDue(), [fireZoneFlightIfDue]);
```

`/doc/[id]/plans`, `/doc/[id]/spec-book`, and `/doc/[id]/boards` are **separate Next.js routes with separate page components** (`PlanRoomPage` → `PlanRoomWorkspace`, `SpecBookPage` → `SpecBookWorkspace`, `ProjectBoardsPage` → `ProjectBoardsView` — confirmed by reading each `page.tsx`), not tabs rendered inside `DocumentPageBody`. A client-side navigation from `/doc/[id]` to `/doc/[id]/plans` fully unmounts `DocumentPageBody`, which runs the cleanup above and fires `document_zone_flight` whenever the pick-up is under 10s old and no write has happened yet on the base document view — even though the designer has not left the document at all, only moved to one of its other rooms.

**Concrete failure scenario:** she opens a document, glances at the brief for a few seconds, then clicks into Plans to start laying out furniture — a real, engaged action. `fireZoneFlightIfDue` fires `document_zone_flight` anyway, because `held_ms < 10_000` and `wrote` is still `false` (nothing in `MarginRail` was written on the base page). Every trip between `/doc/[id]` and any of its three sibling rooms inside the review window double-counts as a "put-down/navigate-away" thrash signal. Since navigating into Plans/Spec Book/Boards early in a visit is one of the most ordinary things a designer does, this is not an edge case — it will be the dominant source of `document_zone_flight` events, corrupting the very stuck-signal it's meant to build (synthesis §10 frames this event as new, foundational instrumentation other stuck-signal design should "rest on").

This is exactly the second half of the review's item (4) probe ("does route-away unmount fire during a legitimate navigation to `/doc/[id]/plans`... Trace the code and say") — traced, and yes, it fires.

The first half of item (4) — opening a Sheet (e.g. Orders) over the document within 10s — does **not** false-fire: Orders is an `openShelf` leaf rendered inside the same mounted `DocumentPageBody` (`page.tsx:1084`, `openShelf` state), not a route change, so there's no unmount, and the Esc handler already bails when `openShelf` is truthy or a `[role="dialog"]` is present (`page.tsx:1282-1283`). That path is correctly guarded.

**Fix direction:** the guard needs to distinguish "left the document" from "moved within the document." Either (a) key the zone-flight ref/effect off something that survives sub-route navigation (e.g. lift it to a layout-level component shared by `/doc/[id]`, `/plans`, `/spec-book`, `/boards`, since App Router keeps a shared layout mounted across sibling routes), or (b) explicitly special-case navigation to a same-`id` sub-route as "not a put-down."

### FA-1 — `document_first_authored`'s once-ever guard is not migration-swept, unlike every sibling backend

- **Severity:** High **Confidence:** Medium-High
- **Files:** `packages/help-system/src/persistence/supabaseAdapter.ts:433-552` (`migrateLocalToSupabase`), `apps/designer-portal/src/components/document/help/first-authored-state.ts`

`migrateLocalToSupabase` sweeps three localStorage namespaces into Supabase on first authenticated mount: tours (`TOUR_STATE_STORAGE_PREFIX`), feature announcements (`patina.help.feature_announcement.v1`), and margin notes (`MARGIN_NOTE_STORAGE_PREFIX`) — each has a dedicated block that reads the local keys, writes them through the now-hydrated backend, then clears them. L6's new `patina:first-authored` key (written by `first-authored-state.ts`'s localStorage fallback) has **no equivalent sweep**. `migrateLocalToSupabase`'s signature wasn't even extended to take a first-authored backend.

The localStorage fallback exists specifically for the window before `HelpStateProvider`'s async `hydrate()` resolves (and for signed-out sessions) — i.e. it is not a hypothetical, it is the documented reason the fallback exists at all (`first-authored-state.ts:396-405`). Concrete failure scenario: a person's very first margin-note write happens in the first few hundred milliseconds after mount, before `firstAuthoredBackend.hydrate()` resolves in `help-state-provider.tsx`. `hasBeenAuthored()`/`markFirstAuthored()` fall to the `backend && backendHydrated` check being false, so the marker lands only in this browser's `localStorage` (`patina:first-authored`) — `profiles.help_state.firstAuthoredAt` on the server is **never written**, and nothing ever sweeps the local marker into it afterward (unlike margin notes, which get exactly this treatment). The next time she authors anything — same device on a later day (localStorage persists, but a cleared browser profile, a different browser, or simply "the once-only contract now silently depends on this one uncleared key never being lost" is fragile), or, more importantly, from a **second device** — the server still shows no `firstAuthoredAt`, so `document_first_authored` fires again. This breaks the explicit contract in `document-events.ts:746-751` and `types.ts:1040-1047`: "fired once per person, ever… ISO instant of this person's first successful write… cross-device."

This is a narrower race than a routine one, but it is not exotic: `hydrate()` is a live Supabase round-trip, and `MarginRail`'s composer is available and interactive well before that promise resolves. The commit message for `c94c8659b` describes the design as "same independent-cache pattern as L4's `createSupabaseMarginNoteBackend`" — that description is accurate for the cache/hydrate/flush mechanics, but omits the one piece that makes margin notes' fallback safe under the same race: the sweep.

**Fix direction:** extend `migrateLocalToSupabase` to accept the first-authored backend (or a lighter-weight sibling function) and sweep `patina:first-authored` into `help_state.firstAuthoredAt` the same way margin notes are swept, then clear the local key.

### ZF-2 — Zone-flight's actual guard logic (timing, once-per-pick-up latch, write-latch, per-engagement reset) has zero test coverage

- **Severity:** Medium **Confidence:** High
- **Files:** `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1226-1289`, `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`

The only new assertions touching zone-flight are:
- `document-events.test.ts` — tests that `documentEvents.zoneFlight({doc_id, held_ms})` calls the tracking layer (`track('document_zone_flight', props)`) with the right event name/shape. This is the **leaf tracking function**, not the guard.
- Seven `doc/[id]/*.test.tsx` files — each gained `zoneFlight: jest.fn()` in their `document-events` mock, purely so the real `fireZoneFlightIfDue` (which now runs on every test's unmount) doesn't throw on an undefined mock. No assertions reference `zoneFlight` beyond the stub declaration (confirmed by grep — the only hits in `page.test.tsx` are the mock line itself).

The actual novel logic — the 10s threshold, the "no write in between" latch (`DOCUMENT_WRITE_EVENT` listener flipping `wrote`), the "at most once per pick-up" `fired` flag, and the per-`engagement_id` reset on arrival — lives entirely in `page.tsx`'s `useRef`/`useEffect`/`useCallback` block and is exercised by **no test**. This is the piece the review brief specifically asked to be checked for tautological tests, and it's not tautological — it's simply absent. Given ZF-1 above, a test suite that actually drove the timer (e.g. fake timers: mount → advance <10s → unmount with no write → assert fired; mount → write → unmount → assert not fired; mount → advance ≥10s → unmount → assert not fired; two sequential mounts of the same `engagement_id` each firing independently) would very plausibly have caught ZF-1's route-away behavior, or at least documented the intended boundary.

---

## Everything checked and found correct

1. **Files/Interfaces from the plan (Task L6) — all delivered.** `HELP_EVENTS.GLOSSARY_OPENED`/`SHORTCUTS_OPENED` were already present from L5 in the integration base (commit `c94c8659b`'s body says so explicitly and this matches the diff — `analytics.ts` only changed a doc comment, not the `HELP_EVENTS` object). `document-events.ts` gained `firstAuthored()`/`zoneFlight()`. `guided-empty-state.tsx` fires `HELP_EVENTS.EMPTY_STATE_SHOWN` once per mount via `safeCapture`. `margin-rail.tsx` fires `documentEvents.firstAuthored()` guarded by the L4-pattern adapter, sub-key `firstAuthoredAt`. `doc/[id]/page.tsx` implements zone flight (with the ZF-1/ZF-2 issues above).

2. **The consolidation grep is complete.** Commit `c94c8659b`'s body documents the exact grep run (`grep -rn "posthog.capture(\s*['"]help\." apps/designer-portal/src`) and its one hit (`help/page.tsx`'s `help.help_center.viewed`), now routed through `safeCapture(HELP_EVENTS.HELP_CENTER_VIEWED)`. Re-ran the same grep independently against the worktree post-fix: zero remaining raw `help.*` capture call sites.

3. **`document_first_authored`'s once-ever guard — correctly implemented modulo FA-1.** `margin-rail.tsx:627-631`'s `fireFirstAuthoredIfDue` checks `hasBeenAuthored()` before calling `markFirstAuthored()` + the event; fires from both the note-save success handler and the R55 decision composer's `onCreated`, guarded identically. `first-authored-state.test.ts` gives this real coverage: unauthored-by-default, mark-then-flip-true, backend-takes-over-once-hydrated-never-touching-localStorage, pre-hydration fallback (asserting `backend.hasAuthored` is **not** called before `hydrated: true`), and sign-out clearing back to the fallback. These are genuine behavioral assertions, not tautologies.

4. **`empty_state.shown` — correctly once-per-mount, real test.** `guided-empty-state.tsx:303-309`'s `useEffect(() => {...}, [])` fires once on mount; `guided-empty-state.test.tsx`'s new test renders, asserts one call with the right `surface_key`/`region_key`, then `rerender()`s the same instance and asserts the call count is still 1 — this actually exercises "once per mount, not per render," not a tautology.

5. **`DOCUMENT_WRITE_EVENT` bus — no leaks, SSR-safe, singleton pattern matches `margin-note.tsx`.** Both `window.addEventListener(DOCUMENT_WRITE_EVENT, ...)` (page.tsx) and the write-side `window.dispatchEvent(...)` (margin-rail.tsx) are wrapped in `useEffect`/`useCallback`, so they never run during SSR render; the listener's cleanup (`removeEventListener`) is registered and will fire on unmount. `first-authored-state.ts`'s module-level `backend`/`backendHydrated` singleton is structurally identical to `margin-note.tsx`'s (`setMarginNoteStateBackend` / `hasSeen` / `markSeen` pattern), including the "fall through to localStorage on a throwing backend" defensive posture. `help-state-provider.tsx` installs it unhydrated immediately, then hydrated once `firstAuthoredBackend.hydrate()` resolves, and clears it (`setFirstAuthoredStateBackend(null)`) on sign-out — matching the tour/feature-announcement/margin-note lifecycle exactly.

6. **Sheet-over-document is correctly excluded from zone-flight** (see ZF-1 discussion above) — Orders opens as an `openShelf` leaf inside the same mount, not a route change, and the Esc "put-down" path already bails when a shelf is open or a dialog is present.

7. **The seven test-file mock edits do not hide a behavior change** — each adds a `zoneFlight: jest.fn()` stub to the `document-events` mock purely so the real `fireZoneFlightIfDue`, which now runs on every test's unmount, doesn't crash against an undefined mock property. No pre-existing assertion was weakened or removed to make this pass.

8. **Cross-lane fixes F1–F3 (`e4791fd20`) — all correct and complete.**
   - F1: stale `FirstSigninTour` references in `supabaseAdapter.ts`'s top docstring and `tourState.ts`'s wiring-pattern pointer now correctly name `help-state-provider.tsx`.
   - F2: `KeysOpenSource` dropped the dead `'panel'` value and added the real `'help_center'` source; re-grepped `openKeys(` call sites (`keys-shortcut.tsx` → `'key'`, `command-bar.tsx` → `'palette'`) and confirmed no remaining `'panel'` literal anywhere in the touched files.
   - F3: `panel-keys-block.tsx` now imports `THE_WORDS_HREF`/`THE_KEYS_HREF` from `keys-reference.ts` instead of re-deriving the glossary href locally; confirmed both constants exist there with matching values.

9. **Global Constraints — nothing user-visible in this lane.** This is an analytics-only lane; the only string-adjacent change is swapping a locally-computed href literal for an imported canonical constant (F3), not new copy. No "AI"/"!"/shadow risk here — confirmed by reading the touched component files.

10. **Gates — all green.**
    - `pnpm --filter @patina/help-system test` → **797 tests passed, 25 suites passed**.
    - `pnpm --filter @patina/designer-portal type-check` → clean, no errors.
    - `pnpm --filter @patina/designer-portal test` → **6049 tests passed, 506 suites passed** (1 snapshot passed). One benign `act(...)` warning from an unrelated pre-existing `useReducedMotion` test and a "worker failed to exit gracefully" note (standard Jest teardown noise) — neither is a failure.

---

## Must-fix before this lane merges into Wave 1

- **ZF-1**: same-document sub-route navigation (Plans/Spec Book/Boards) must not count as a zone-flight put-down.
- **FA-1**: `patina:first-authored`'s localStorage fallback must be swept into Supabase the same way tours/feature-announcements/margin-notes are, or the once-ever cross-device guarantee is not actually cross-device under the pre-hydration race the fallback exists to handle.

**Should-fix, non-blocking:** ZF-2 — add real timer-driven tests for `fireZoneFlightIfDue`'s threshold/latch/reset logic before Wave 2 leans on this taxonomy the way the cross-lane review notes L5 already does.
