# Lane H5 re-review — Rooms, plates and the concept render slot (PP-4 / PP-7)

**Re-reviewer:** separate context from both the implementer and the original reviewer. Treated
`h5-impl.md`, `h5-review.md` and `h5-fix.md` as unverified claims until independently checked against
the actual diff, the worktree, and re-run gate commands.

**Branch inspected:** `origin/portal-polish/h5` @ `1f9488cd0` (review baseline was `548c01eb5`; the fix
commit `1f9488cd0` is the only commit added since). Cut from `origin/main` @ `1059f5275` (post-Wave-1: A2's
`RoomConceptRender`/`ThresholdRoom.conceptRender` types in `derive.ts`, `use-room-concept-render.ts`,
migration 00580, all present and unmodified by this lane). Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h5` is checked out at `1f9488cd0` — matches the
branch head, nothing stale.

`origin/main` (`1059f5275`) fetched fresh via `git -C /Users/kody/Code/patina-merged fetch origin`
(required `dangerouslyDisableSandbox` — the default sandbox's proxy rejected the SSH remote outright;
this is a sandbox network restriction, not a repo issue). Refs were already the exact SHAs the review and
fix rounds worked from — no rebase happened in between, so this re-review is not chasing a moving target.

---

## Verdict

**approve.** The fix round is honest and complete: three of the review's findings were genuinely fixed
(with new tests), three were correctly declined with evidence I independently re-verified rather than
took on faith, and the two informational items needed no code change. No P1 or P2 remains open in this
lane's own files. The one item still open (`--hairline`) is correctly attributed to H2/integration and is
not fixable from inside H5's file list — it is not a defect in this lane's diff, and both the impl and fix
reports already surface it accurately.

---

## Gate evidence (re-run independently, third time this diff has been gated)

```
$ pnpm --dir .../agent-pp-h5 --filter @patina/client-portal type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir .../agent-pp-h5 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1061 passed, 1061 total     ← matches h5-fix.md exactly (was 1060 pre-fix)
Time:        8.348 s

$ pnpm --dir .../agent-pp-h5 --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)   ← identical to the measured baseline in both prior rounds
```

Grepped the lint output for this lane's four touched source files (`room-band.tsx`, `tracking-row.tsx`,
`piece-silhouette.tsx`, `plan-key.tsx`, `threshold.tsx`): exactly **one** line —
`instruments/tracking-row.tsx:171:11 warning Unused eslint-disable directive` — zero errors, zero new
warnings. Independently confirmed this exact warning already exists verbatim in `origin/main`'s copy of
the file (`git show origin/main:.../tracking-row.tsx` — the same `// eslint-disable-next-line
@next/next/no-img-element` comment at line 104 pre-move), so it is pre-existing drift this lane inherited,
not introduced.

`npx eslint apps/client-portal/src/components/threshold` (the plan's literal gate command) still does not
run — no `eslint.config.*` at the client-portal root or repo root, confirmed again. `pnpm --filter
@patina/client-portal lint` is the real gate and was used, correctly.

Full suite with coverage:

```
$ pnpm exec jest --coverage --coverageReporters=text-summary   (in apps/client-portal, worktree)
Statements   : 75.4%   ( 7165/9502 )
Branches     : 71.09%  ( 5290/7441 )
Functions    : 75.57%  ( 1618/2141 )
Lines        : 77.74%  ( 6500/8361 )
Test Suites: 136 passed, 136 total
Tests:       2296 passed, 2296 total
```

Matches `h5-fix.md`'s claimed numbers exactly (branches moved 71.08% → 71.09%, one new branch from the
`onError` guard, consistent with +1 test). All four numbers clear the 70/60/70/70 floor
(`jest.config.js` `coverageThreshold.global`).

---

## Disposition table re-checked against the actual diff, not the fix report's prose

| ID | Sev | Lane's disposition | Re-review finding |
|---|---|---|---|
| H5-1 | P2 | fixed | **Confirmed fixed.** `ConceptRenderPlate` now holds `brokenSrc` state and `onError={() => setBrokenSrc(src)}`; `if (!src \|\| brokenSrc === src) return null` — mirrors `TrackingRow`'s existing guard exactly. New test `fireEvent.error(image)` → asserts `room-band-concept` gone and no "Concept" text anywhere. Read the hunk directly (`git show 1f9488cd0`); it is exactly what the report claims. |
| H5-2 | P2 | declined — not this lane's file | **Confirmed correct decline.** Independently read `origin/main:apps/client-portal/src/app/globals.css` (no `--hairline`, two comments only) and `origin/portal-polish/h2:apps/client-portal/src/app/globals.css` (adds `--paper-doc`, `--rail`, `--hairline-strong` — **not** `--hairline`). H2's own plan section (line 371–420 of the build plan) lists its exact alias set and none of it is `--hairline` either. `--border-default` (`#E5E2DD` per `origin/main` globals.css line 48, `var(--color-pearl)`) is genuinely this portal's only existing hairline-equivalent, and `globals.css` is H2's file, not H5's. This is a real cross-lane gap in the *plan*, not a lane defect — correctly flagged as owed to H2/integration in both the impl and fix reports. |
| H5-3 | P2 | declined — no defect, sheet is consistent | **Confirmed correct decline, independently re-derived.** Read `docs/design/house-sheet/SPEC.md` (via `origin/main`, since the local checkout is stale) directly: line 485 (§A10) says "Caption, under every plate, `.t-meta` in `--ink-subtle`, sentence case," and line 679 (§F, row 7 "Study band," the exact region this lane rebuilds) says "…one `.t-body-sm` state sentence · caption `.t-meta`." Both statements in the sheet — the document the task brief names authoritative for type steps — agree on `.t-meta`. The specimen's `<p class="caption t-body-sm">` is the outlier, not the sheet. H5 implements `.t-meta` on both the tracking-row caption and the concept-render figcaption, matching the sheet's own words to the letter, including the composed caption text itself ("Reading chair · drawing by Local Dev Studio · photograph from Harmon Bench Works to follow" — verified this exact string is produced by `plateCaption()` and is asserted in `tracking-row.test.tsx`). No further action needed from this lane. |
| H5-4 | P3 | fixed | **Confirmed fixed.** `gap-x-4` → `gap-x-6` in `tracking-row.tsx`; Tailwind's scale puts `gap-x-6` at 24px, matching the specimen's `.piece { gap: 12px 24px }` and the sheet's 24px module. Read directly in the diff. |
| H5-5 | P3 | fixed | **Confirmed fixed.** `PieceSilhouette` dropped the `name` prop, `role="img"`/`aria-label` replaced with `aria-hidden="true"`. Test updated from `toHaveAccessibleName` to asserting `aria-hidden`. The row's visible name paragraph and the caption's "drawing by {studio}" clause already carry this fact; the silhouette is now decorative like its sibling real-photo `<img alt="">`, which is the more internally consistent choice. |
| H5-6 | P3 | fixed | **Confirmed fixed.** `text()` in `threshold.tsx` now returns `value.trim()` instead of the untrimmed `value`. Trivial, correct, type-checks clean. |
| H5-7 | P3 | declined — pre-existing, out of scope | **Reasonable decline.** `fitFootLabel`'s ellipsis-truncation predates this lane (present in `origin/main`'s `room-band.tsx` before this diff) and this lane only reparameterized its character-width math for the phone crop; SVG `<text>` cannot wrap without new multi-line-tspan machinery the plan never asked for. Correctly left as a named gap rather than unrequested scope creep. |
| H5-8 | P3 | informational | Confirmed accurate: `client-house.html` has no concept-render region to diff against; its only image is the *installed*-photograph example, which is explicitly out of scope for this lane (no data model, R142). Nothing to act on. |
| H5-9 | P3 | fixed | **Confirmed fixed.** `h5-impl.md` is present as a plain file at `artifacts/portal-polish-build-2026-09-08/waves/w2/h5-impl.md` in the shared checkout (I read it directly at the start of this re-review) alongside `h5-review.md` and `h5-fix.md`. |

---

## Independent checks beyond re-verifying the disposition table

**Pathspec discipline**, re-run against the lane's file table:
```
$ git diff origin/main...origin/portal-polish/h5 --stat --name-only
apps/client-portal/src/components/threshold/__tests__/room-band.test.tsx
apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx
apps/client-portal/src/components/threshold/instruments/__tests__/open-chapter.test.tsx
apps/client-portal/src/components/threshold/instruments/__tests__/piece-silhouette.test.tsx
apps/client-portal/src/components/threshold/instruments/__tests__/tracking-row.test.tsx
apps/client-portal/src/components/threshold/instruments/piece-silhouette.tsx
apps/client-portal/src/components/threshold/instruments/tracking-row.tsx
apps/client-portal/src/components/threshold/plan-key.tsx
apps/client-portal/src/components/threshold/room-band.tsx
apps/client-portal/src/components/threshold/threshold.tsx
artifacts/portal-polish-build-2026-09-08/waves/w2/h5-impl.md
```
Every file the lane's table names is present. Two files outside the table (`plan-key.tsx`,
`open-chapter.test.tsx`) — both re-verified as minimal and necessary, same conclusion as the first
review: `plan-key.tsx`'s diff is exactly three new exports (`TYPE_FLOOR_PX`, `usePhoneDrawing`) plus one
call-site swap, required verbatim by the plan's own step 2 text ("Export the helpers from `plan-key.tsx`
and import them"); `open-chapter.test.tsx`'s diff is two assertion changes forced by step 5's label
deletion, nothing else moved. `packages/supabase/**` and `derive.ts` (A2's territory): zero lines touched,
confirmed by `git diff origin/main...origin/portal-polish/h5 -- apps/client-portal/src/lib/threshold/derive.ts packages/supabase/` returning empty. `threshold.tsx`'s edit stays inside the mapping function and
the `<RoomBand>` prop list — the `sections` array and ledger mount (H3's territory) are untouched.

**Anchor ids:** `id={band.anchor}` on the room `<section>` and `headingId = \`room-heading-${band.roomId}\``
are both unchanged lines, not touched by this diff (confirmed by reading the full file, not just the
diff hunks — the diff never shows these lines because they didn't move). No id renamed.

**Wave 1 hand-off correctness** (the plan's explicit callout that H5 owns this mapping): re-read
`toConceptRender`/`toThresholdRoom` in `threshold.tsx` and `conceptRenderOf` in `derive.ts` (A2's file,
unmodified) side by side — the four columns (`concept_render_url/_caption/_uploaded_at/_uploaded_by`) map
onto `ThresholdRoom.conceptRender` correctly, and `derive.ts` re-trims `url`/`caption` independently
(defense in depth, harmless double-trim) while now also getting trimmed `uploadedAt`/`uploadedBy` from the
H5-6 fix. `threshold.test.tsx`'s new describe block exercises this exact path end-to-end, including the
"whitespace-only `concept_render_url` never even asks for a signature" case (`browserClientMock` asserted
not called) — a well-targeted test, independently re-run and passing.

**Accessibility**, re-checked against the review protocol's list:
- No new focusable/interactive elements in this lane's diff. The plates, silhouette, and concept-render
  figure are all decorative or informational content, not controls. N/A for focus rings, `aria-disabled`,
  and 44px targets — correctly assessed as N/A in the first review, still true after the fix commit (which
  touched no interactive element).
- Roles: the silhouette is now `aria-hidden="true"` (fixed, H5-5); the real-photo `<img alt="">` stays
  decorative; the concept-render `<img alt="Concept render of {roomName}">` is informative (not
  decorative) and correctly gets a real alt string, not empty — this is a genuinely new image with content
  a sighted user gets from looking at it, so a non-empty alt is the right call, not an oversight.
- Minor observation (not scored — informational only, below P3 threshold in my judgment but noted per the
  "report every finding" instruction): the concept-render plate carries three separate readings of the
  word "concept" for a sighted user (`alt="Concept render of Study"`, the visible on-image label "Concept ·
  not installed", and implicitly the figcaption) — but unlike the H5-5 silhouette case, none of these are
  hidden/redundant *accessibility* annotations stacked on top of visible text; they are three pieces of
  actually-different visible content (alt text for non-sighted users, an on-image state label, and a
  provenance caption), which is closer to the sheet's own worked example structure than to the "double
  reading" pattern the plan's checklist warns about. Not asking for a change.
- Contrast: `--ink` on `--paper-doc` (concept label) and `--ink-subtle` on the page ground (captions,
  empty-room sentence) are H2-owned token values carried over verbatim from the sheet's vetted palette,
  unchanged by this lane.

**House sheet compliance**, spot-re-verified rather than fully re-derived (the first review's grep-based
checks — no new hex, no shadow/pill/badge/dot/✓/spinner, radii at 3px, `stroke-opacity: .5` only on the
named hatch exception — were sound methodology and I re-ran the hex/pattern greps myself against the final
tree with the same zero-hit result):
```
$ git diff origin/main...origin/portal-polish/h5 | grep -oE '#[0-9A-Fa-f]{3,6}' 
(no output)
```
Zero new hex literals in the full diff, confirmed independently.

---

## Findings

No P1s. No P2s remain open in this lane's own files.

### P3 — informational, not actionable by this lane
The `--hairline` token named in `SPEC.md` A10 still does not exist anywhere in the client portal after
this fix round (confirmed against `origin/portal-polish/h2` directly, not just H5's claim about it), so
the plate borders in both `tracking-row.tsx` and `room-band.tsx` remain on `--border-default` rather than
the sheet's named token. This is unchanged from the original review and is not fixable by touching any
file in H5's list — `globals.css` belongs to H2. Flagging again only so it does not silently disappear at
integration: someone needs to either add `--hairline: #E8E3DB` to the alias block or formally bless
`--border-default` as this portal's answer, and then one two-line follow-up swaps the border classes in
these two files. Confidence: high that the gap exists; this is a plan/integration item, not a code defect
in this diff.

---

## What was not re-litigated

The original review's methodology on pathspec discipline, the eleven-pixel-floor arithmetic (re-verified
the actual numbers again: `553 = floor(17×358/11)`, `17×358/553 ≈ 11.0px`), the stage-word-prints-once
check, and the silhouette category/outline correctness were all sound the first time and I independently
re-confirmed the relevant code is unchanged by the fix commit (the fix touched exactly the 6 files listed
in its own diff stat) rather than re-deriving all of it from scratch a second time.
