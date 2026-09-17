# Lane H5 review — Rooms, plates and the concept render slot (PP-4 / PP-7)

**Reviewer:** separate context, did not implement H5. Treated `h5-impl.md`'s claims as unverified until
checked independently.

**Branch inspected:** `origin/portal-polish/h5` @ `548c01eb5` (cut from `origin/main` @ `1059f5275`,
which already carries Wave 1 — A2's `RoomConceptRender`/`ThresholdRoom.conceptRender` types in
`derive.ts` and the `use-room-concept-render` hook in `@patina/supabase`). Note: the **local** `main`
checkout at `/Users/kody/Code/patina-merged` is behind `origin/main` (stuck at `02eb0a95f`, pre-Wave-1) —
all comparisons below use `origin/main` / `origin/portal-polish/h5` refs, not the stale local worktree
tree, to avoid a false "Wave 1 missing" read.

`h5-impl.md` is **not** present as a plain file under `artifacts/portal-polish-build-2026-09-08/waves/w2/`
in the shared main checkout the way h1/h2/h3/h6's reports are — the lane committed it onto its own
branch instead (`git show origin/portal-polish/h5:artifacts/.../h5-impl.md` finds it). Not a defect, but
a process inconsistency worth naming (P3 below).

---

## Verdict

**needs-fix** — one concrete, fixable P2 (missing `onError` fallback on the concept-render image) plus
two P2s that are integration/spec-level rather than lane-code defects. No P1s. Everything else is P3
polish or informational.

---

## Gate evidence (re-run independently, not copied from the lane's report)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h5 --filter @patina/client-portal type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h5 --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1060 passed, 1060 total
Time:        32.8 s

$ pnpm --dir .../agent-pp-h5 --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```
Confirmed the lint total matches the lane's claimed baseline exactly (63/11/52). Grepped the lint output
for the lane's touched files: **zero** errors and exactly **one** pre-existing warning
(`tracking-row.tsx:171`, an "unused eslint-disable" on a comment this lane moved but did not author —
same comment exists verbatim in `origin/main`'s copy of the file) — no new lint problems introduced.

`npx eslint apps/client-portal/src/components/threshold` (the literal command in the plan's gate) does
**not** run — no `eslint.config.*` at the client-portal root or repo root — confirmed independently;
`pnpm --filter @patina/client-portal lint` is the real gate, as the lane's report says.

```
$ pnpm exec jest --coverage --coverageReporters=text-summary   (full client-portal suite, in the worktree)
Test Suites: 136 passed, 136 total
Tests:       2295 passed, 2295 total
Statements   : 75.4%   Branches : 71.08%   Functions : 75.56%   Lines : 77.73%
```
All four numbers clear the 70/60/70/70 floor (`jest.config.js` `coverageThreshold.global`). New-file
coverage specifically: `piece-silhouette.tsx` 100/100/100/100, `tracking-row.tsx` 100/100/100/100,
`room-band.tsx` 97.32/90.09/100/99.04, `plan-key.tsx` 90.24/68.75/92.3/97.14 — all new files carry tests
well over the floor, not just the global average.

**Pathspec discipline.** `git diff origin/main...origin/portal-polish/h5 --stat`:
```
threshold/__tests__/room-band.test.tsx          | 211 ++
threshold/__tests__/threshold.test.tsx          |  68 ++
instruments/__tests__/open-chapter.test.tsx     |  10 +-
instruments/__tests__/piece-silhouette.test.tsx |  68 ++  (new)
instruments/__tests__/tracking-row.test.tsx     | 137 ++  (new)
instruments/piece-silhouette.tsx                |  96 ++  (new)
instruments/tracking-row.tsx                    | 135 +--
plan-key.tsx                                    |  18 +-
room-band.tsx                                   | 263 +---
threshold.tsx                                   |  37 +-
waves/w2/h5-impl.md                             | 246 ++
```
Every file the lane's own table names is present. Two files outside the table are touched, and both are
justified in the report and independently verified as necessary, not scope creep:
- `plan-key.tsx` — the plan's own step 2 text says "export the helpers from `plan-key.tsx` and import
  them," so this file was always meant to be touched; the edit is exactly three new `export`s plus one
  call-site swap to the new `usePhoneDrawing()` hook. Confirmed minimal.
- `instruments/__tests__/open-chapter.test.tsx` — this suite pinned `tracking-row-stop-label`
  (`toHaveTextContent('In production')`) and the *name* of a test ("draws a quiet placeholder block");
  step 5 of the plan requires deleting that label. The edit only updates the two assertions the deleted
  label and renamed behaviour force; nothing else in the file moved. Reasonable, not avoidable by
  staying inside the table.

`threshold.tsx`'s edit is confined to (a) the `toConceptRender`/`toThresholdRoom` mapping and (b) the
`<RoomBand>` prop list — it does **not** touch the `sections` array (`:1283` in the branch) or the
ledger mount, which is H3's territory per the shared-file table ("H3 owns `sections`... H5 owns the
band's props"). Confirmed by reading the full hunk, not just trusting the stat.

`packages/supabase/**` (A2's territory) — zero lines touched. Confirmed.

---

## House sheet compliance

- **No new hex literal** — grepped the whole diff for `#[0-9A-Fa-f]{3,6}`: zero hits.
- **No shadow / pill / badge / dot / ✓ / spinner / gradient / stock image**: grepped for all of these;
  zero real hits (`pillow` in a regex string is the only substring match).
- **`stroke-opacity: .5`** appears exactly once, on `piece-silhouette.tsx`'s secondary hatch path — this
  is the sheet's own named exception (§F-A: "secondary hatch strokes may use `stroke-opacity: .5`").
  Nowhere else in the diff does opacity sit at `.5` on anything resembling a UI *state* (disabled,
  loading, etc.) — the pre-existing `StatusStamp` opacities (`.72`/`.42`) are unrelated, untouched by
  this lane except the font-size bump the plan asked for.
- **Radii**: `rounded-[3px]` on the tracking-row plate and the concept-render plate — matches sheet A10
  ("Radius … `3px` (image plates, stage plates …)").
- **Empty room** matches the sheet's own CSS almost to the pixel: sheet `.empty { padding: 0 0 24px }`,
  `.empty .floor { height: 1px; background: var(--rail); margin: 12px 0 }`, `.empty p { … max-width:
  56ch; color: var(--ink-subtle) }` vs. the lane's `pb-6` (24px) wrapper, `my-3 h-px w-full
  bg-[var(--rail)]` floor line, and `t-body max-w-[56ch] text-[var(--ink-subtle)]` sentence. This is the
  single closest visual match to the specimen anywhere in the diff.
- **The eleven-pixel floor is genuinely imported, not re-derived.** `plan-key.tsx` now exports
  `TYPE_FLOOR_PX` (previously module-private) and a new `usePhoneDrawing()` wrapping the existing
  `useSyncExternalStore` call; `room-band.tsx` imports `PLAN_PHONE_TYPE`, `planPhoneViewBox` and
  `usePhoneDrawing` and derives `PHONE_DRAW_W` by calling `planPhoneViewBox` — it does not recompute
  `PHONE_MAX_VIEWBOX`'s arithmetic itself. Checked the actual numbers: `PHONE_MAX_VIEWBOX = floor(17 ×
  358 / 11) = 553`; on a 390px phone with `PLAN_PHONE_CONTENT_PX = 358`, the rendered footprint label
  size is `17 × 358 / 553 ≈ 11.0px` — the floor is actually held, not just claimed. Desktop path is
  provably unchanged (a dedicated test asserts `viewBox="0 0 1000 140"` and `font-size="11"` still hold
  when `usePhoneDrawing()` returns false).
- **Plates**: 96px at ≥960px only when `priceCents >= 200_000` ($2,000), else 64px unconditionally
  (so also 64px at ≤600px, which is below the 960px breakpoint by construction) — matches R140/A10.
- **Silhouettes**: five categories, 1px `stroke: var(--ink-faint)`, `fill: none`, one detail line, one
  hatch at `stroke-opacity: .5` — matches A10's silhouette rule (§F-A) verbatim. No `<image>`, no
  `url(#…)` gradient reference, no diagonal hash pattern anywhere (asserted by test, and independently
  re-checked by reading the SVG path data).
- **The stage word prints once**: the 9px duplicate span at the end of `MicroSpine` is deleted;
  `StatusStamp` keeps its `aria-hidden` mark at 11px; the `sr-only`-equivalent sentence
  ("In production — stop 3 of 6") is untouched and still the only accessible reading of the stop.
  Re-verified with `getAllByText('In production')` returning length 1 in the lane's own test, and by
  reading the JSX — no third place the word could print.

---

## Findings

### P2 — Concept-render `<img>` has no failure fallback; a broken-image glyph is reachable
**File:** `apps/client-portal/src/components/threshold/room-band.tsx`, `ConceptRenderPlate` (~L360-385).
**Confidence:** high.

`TrackingRow`'s existing photograph `<img>` explicitly guards against a broken image: `onError={() =>
setBrokenUrl(imageUrl)}`, which hides the image rather than letting the browser draw its native
broken-image glyph — a rule stated repeatedly and emphatically across this plan ("a browser's
broken-image glyph is the one mark on this page nobody chose to put there," restated near-verbatim at
least three times in the plan and the sheet). `ConceptRenderPlate`'s `<img src={src} … />` has **no**
`onError` handler at all. `useSignedConceptRender` only guards the *signing* failure (a path that will
not sign renders nothing, and this path is well tested) — it does not guard a signed URL that
*subsequently* fails to load: the signed URL's TTL is a fixed 3600 seconds (`CONCEPT_URL_TTL_S`), so a
client who leaves the Threshold page open longer than an hour, or hits any transient network failure, or
whose studio deletes/replaces the object in that window, will see the browser's own broken-image icon —
exactly the outcome this component's own header comment says it exists to prevent. This is a real,
narrow-but-plausible gap, not a hypothetical: nothing in the current code re-signs or clears the URL on
error.
**Suggested fix:** mirror `TrackingRow`'s pattern — track a `brokenSrc` state, set it `onError`, and
render nothing (or fall back to no slot) once the current `src` matches it, consistent with "no render →
no slot" elsewhere in this component.

### P2 — Plate border token is `--border-default`, not the sheet's `--hairline` (flagged by the lane itself; owed to integration, not fixable inside this lane)
**Files:** `room-band.tsx` (`ConceptRenderPlate`), `instruments/tracking-row.tsx` (`tracking-row-plate`).
**Confidence:** high that the token mismatch exists; this is a coordination gap rather than a lane bug.

House sheet A10: "Client house room piece, ≥960px | 96 × 96px | 3px | 1px `--hairline`." The client
portal has no `--hairline` token yet, and Lane H2's own plan text (step 1/2 alias list: `--paper-doc`,
`--rail`, `--ink-subtle`, `--sage-ink`, then `--oak`, `--ink-faint`, `--ink`, `--paper`, `--clay-ink`,
`--golden-ink`, `--terracotta-ink`) does not add one either — confirmed by reading H2's plan section, not
just the lane's claim. H5 substitutes the client portal's existing hairline-equivalent,
`--border-default` (`#E5E2DD`), which is visually close to the sheet's `#E8E3DB` but is not the same
token and was never asked to stand in for it. H5 cannot fix this itself (does not own `globals.css`);
this needs a decision at H2/integration — either add a `--hairline` alias or bless `--border-default` as
the client portal's answer to it. H5's own report already surfaces this ("Owed to H2 / integration") —
confirmed accurate and not self-serving.

### P2 — Caption typography (`.t-meta`) matches the written plan and `SPEC.md` but diverges from the specimen's rendered `.t-body-sm`
**Confidence:** high that the discrepancy exists; not attributable to the lane.

`docs/design/house-sheet/SPEC.md` §A10 (unamended by §F — no `§F-*` marker touches this line): "Caption,
under every plate, `.t-meta` in `--ink-subtle`, sentence case." The plan's H5 section, step 6, says the
same thing verbatim: "Every plate gets a caption line in `.t-meta`." H5 implements exactly `.t-meta` on
both the tracking-row caption and the concept-render `<figcaption>`. But
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`'s "Study band" example renders
its piece captions as `<p class="caption t-body-sm">` (Inter 14px, not DM Mono 12px) — a different type
step from what the sheet's own prose specifies, with no `§F` amendment reconciling the two. Since the
task brief names the sheet as authoritative for type steps and treats the specimen as "visual truth,"
this is a genuine conflict between the two source-of-record documents, not a lane defect — H5 followed
the more explicit, more recently-amended written spec. Flagging so integration/Kody can rule on which
wins before a visual QA pass flags it as a "bug."

### P3 — `TrackingRow`'s grid gap doesn't match the specimen's, and breaks the 24px module on one axis
**Confidence:** medium.
The specimen's `.piece { grid-template-columns: 96px minmax(0,1fr) auto; gap: 12px 24px; … }` — row-gap
12px, column-gap 24px. The lane's `TrackingRow` uses `gap-x-4 gap-y-3` — Tailwind's default scale makes
that row-gap 12px (matches) but column-gap **16px**, not 24px. The global constraint calls out a "24px
module" as one of the sheet's three load-bearing rhythm rules; 16px is off it. Small, unlikely to be
visible at a glance, but a fixable one-class change (`gap-x-6` would give 24px) if module-exactness
matters to whoever signs off the visual pass.

### P3 — `PieceSilhouette`'s new accessible name creates some redundancy with the caption and visible name (debatable, may be intentional)
**Confidence:** medium — plausible either way, flagging for a design call rather than asserting a bug.
The old placeholder was `aria-hidden="true"` (silent). The new silhouette wrapper drops `aria-hidden` and
gives the inner `<svg>` `role="img" aria-label="A drawing of {name}"` — a real accessible name, tested
and clearly deliberate (`toHaveAccessibleName` is asserted in `piece-silhouette.test.tsx`). This is
inconsistent with the sibling real-photo `<img alt="">` (empty/decorative — the row's own visible name
paragraph already covers it), and it means a screen-reader user on this row now hears, in order: "image,
A drawing of Walnut credenza" → "Walnut credenza" (the name paragraph) → later, "Walnut credenza · drawing
by Quist Interiors" (the caption). There is a legitimate argument for surfacing the drawing/photograph
distinction to non-sighted users (sighted users get it for free from the outline vs. photo), but the
caption text already carries that exact distinction in words a few lines later, so this reads as
triple-stated information rather than a single clean announcement. Not broken, just worth a second look;
the review checklist's "no double reading" bullet was written about the stage word specifically, but the
principle generalizes here.

### P3 — `text()` helper in `threshold.tsx` doesn't trim the string it returns
**Confidence:** low likelihood of ever mattering.
`function text(value) { return typeof value === 'string' && value.trim().length > 0 ? value : null; }`
returns the *original*, untrimmed `value` once the trim-length check passes. `derive.ts`'s
`conceptRenderOf` re-trims `url` and `caption` on the way through, but passes `uploadedAt`/`uploadedBy`
straight on unaltered. Postgres `timestamptz`/`uuid` columns are exceedingly unlikely to carry stray
whitespace, so this is a near-zero-risk inconsistency, not a real bug — noting it because it's a small,
easy, free fix if anyone is in the file.

### P3 — Footprint-label truncation (pre-existing, not this lane's to fix) technically conflicts with "no truncation"
**Confidence:** high that it exists; not this lane's fault or in scope.
`fitFootLabel` still slices a piece name to its slot width and appends `…` when it overflows — unchanged
behaviour from before this lane, only reparameterized for the phone crop's wider mono characters. The
sheet's global rule is "Truncation: none. `text-overflow: ellipsis` must not appear. Wrap." SVG `<text>`
genuinely cannot wrap without much more machinery (multi-line tspans, dynamic layout), and the plan's H5
steps never asked this lane to solve that — flagging for awareness only, not as a defect in this diff.

### P3 — No specimen ground-truth exists for the concept-render feature itself
**Confidence:** high (verified by search) — informational, not a lane defect.
`client-house.html` contains no `Concept · not installed` label and no room-band concept-render example
anywhere; its only comparable image ("`.room-photo`", an embedded base64 JPEG) is the sheet's *installed
photograph* example, which the plan's own "Not in this plan" section explicitly excludes ("Installed
photographs (no data model — R142 forbids inventing one)"). So there is no region of the stated "visual
truth" to diff PP-7's new slot against; the implementation had to be built from the plan's prose and
R142/R142's caption grammar alone. Worth naming so nobody later treats "it doesn't look like the
specimen" as a finding against this lane for a feature the specimen never depicted.

### P3 — Report filed on the branch, not in the shared checkout other lanes used
**Confidence:** high, informational/process only.
`h1-review.md`, `h2-impl.md`/`-fix`/`-rereview`, `h3-review.md`, `h6-impl.md` all exist as plain
(untracked) files directly under `artifacts/portal-polish-build-2026-09-08/waves/w2/` in the shared main
checkout. `h5-impl.md` instead landed only as a commit on `portal-polish/h5`
(`git show origin/portal-polish/h5:artifacts/.../h5-impl.md`). Both technically satisfy "the durable
path, never only the scratchpad," and this review was still able to find and verify it, but a process
that only scans the shared checkout's plain files (rather than every lane branch) would miss it.

---

## What was not re-litigated

Items the lane's own report already documents accurately and I independently confirmed rather than
re-deriving from scratch: the `plan-key.tsx` and `open-chapter.test.tsx` touches outside the file table
(both necessary, both minimal — see Pathspec discipline above); the decision to sign the concept render
client-side via `useSignedConceptRender` rather than waiting on a read-side hook from A2 (A2's
`useRoomConceptRender` is upload-only, confirmed by reading `packages/supabase/src/hooks/index.ts`'s
exports — no read/list/sign hook exists there); the claim that desktop rendering is byte-identical
(re-verified via the dedicated test and by reading the constants directly, not just trusting the claim).

## Accessibility checklist (explicit pass/fail against the review protocol's list)

- **Focus rings**: no new focusable elements added by this lane (silhouettes, plates, captions, the
  concept-render figure are all non-interactive); the existing whole-row `<button>` in `room-band.tsx`
  that opens/closes a piece's record is untouched and still spans the full row (`absolute inset-0`),
  comfortably over 44px in both dimensions. N/A rather than pass/fail.
- **Roles**: `role="img"` + `aria-label` on the silhouette and the room-drawing `<svg>`s; `alt` text on
  both `<img>` elements (empty/decorative for the real photo, descriptive for the concept render). See
  P3 finding above on the silhouette's accessible name choice.
- **`aria-disabled` vs `disabled`**: no gating act, no disabled control anywhere in this diff. N/A.
- **44px targets**: no new interactive elements; the plates themselves (64/96px) are decorative content,
  not targets.
- **Contrast**: `--ink` on `--paper-doc` (concept label) and `--ink-subtle` on the portal's paper
  background (captions, empty-room sentence) are both H2-owned tokens carried over verbatim from the
  sheet's own vetted values — not a new risk introduced by this lane.
