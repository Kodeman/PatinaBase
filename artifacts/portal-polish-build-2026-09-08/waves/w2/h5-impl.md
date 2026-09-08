# Lane H5 — Rooms, plates and the concept render slot (PP-4 / PP-7)

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h5`
**Branch** `portal-polish/h5` (cut from `origin/main` `1059f5275`), pushed.
**Commits**

| SHA | Subject |
|---|---|
| `4493d2aed` | `feat(client): empty rooms as a sentence; the eleven-pixel floor on the band; plates, silhouettes, captions (PP-4)` |
| `471345f32` | `feat(client): concept render slot on the room band (PP-7)` |

---

## Diff stat (`git diff --stat origin/main..HEAD`)

```
 .../threshold/__tests__/room-band.test.tsx         | 211 ++++++++++++++++-
 .../threshold/__tests__/threshold.test.tsx         |  68 ++++++
 .../instruments/__tests__/open-chapter.test.tsx    |  10 +-
 .../__tests__/piece-silhouette.test.tsx            |  68 ++++++
 .../instruments/__tests__/tracking-row.test.tsx    | 137 +++++++++++
 .../threshold/instruments/piece-silhouette.tsx     |  96 ++++++++
 .../threshold/instruments/tracking-row.tsx         | 135 ++++++++---
 .../src/components/threshold/plan-key.tsx          |  18 +-
 .../src/components/threshold/room-band.tsx         | 263 +++++++++++++++++----
 .../src/components/threshold/threshold.tsx         |  37 ++-
 10 files changed, 955 insertions(+), 88 deletions(-)
```

Commit 1 = 9 files, +619/−85. Commit 2 = 4 files, +336/−3. The two commits are
genuinely separable: the PP-4 tree was gated on its own (type-check clean, 42
suites / 1051 tests green, lint 11/52) before commit 1 was made, then the PP-7
hunks were restored and re-gated before commit 2.

---

## What each step did

**1. Empty room (`room-band.tsx`).** The outlined `<rect>` and the whole
80-unit empty SVG branch are gone. `EmptyRoom` renders a 1px `--rail` floor
line at the band's full width and one `.t-body` sentence in `--ink-subtle` —
"Nothing stands here yet." plus "The {room} comes first." where the house knows
which room the work has started in. `threshold.tsx` derives that room
(`model.bands.find(band => band.pieces.length > 0)?.name ?? null`) and passes it
as `leadRoomName`; with nothing agreed anywhere the sentence stops after its
first clause rather than inventing a second. No rectangle, no zero.

**2. The eleven-pixel floor — ported, not reinvented.** `plan-key.tsx` now
*exports* `TYPE_FLOOR_PX` and a `usePhoneDrawing()` hook wrapping the existing
`useSyncExternalStore(subscribeToPhone, isPhone, isPhoneOnServer)`;
`PLAN_PHONE_TYPE`, `PLAN_PHONE_CONTENT_PX` and `planPhoneViewBox()` were
already exported. `PlanKey` itself now calls `usePhoneDrawing()`, so there is
one subscription idiom. `room-band.tsx` imports them and derives its phone
width **through `planPhoneViewBox`** — `PHONE_DRAW_W = Number(planPhoneViewBox(\`0 0 ${DRAW_W} ${DRAW_H}\`).split(' ')[2])` = 553 — so the arithmetic
(`PLAN_PHONE_TYPE × PLAN_PHONE_CONTENT_PX / TYPE_FLOOR_PX`) exists in exactly
one file.

The band holds its wall margins constant (`WALL_R_MARGIN = DRAW_W − WALL_R`)
and compresses the floor between them, so unlike the plan key's crop the band
loses **no footprint** — the phone gets the same room, read closer. Labels go
from `FOOT_TYPE` 11 units over a 1000-unit viewBox (3.9px at 358px of content)
to `PLAN_PHONE_TYPE` 17 units over 553 (11.0px). Desktop is byte-for-byte
unchanged: viewBox `0 0 1000 140`, `font-size="11"`.

**3. Plates (`tracking-row.tsx`).** The row became a 3-column / 2-row grid
(plate spans both rows; the caption spans body + side), matching the specimen's
`grid-template-areas`. The plate is `h-16 w-16` (64px) and gains
`min-[960px]:h-24 min-[960px]:w-24` (96px) only when `priceCents >= 200_000`
($2,000). `data-plate="96" | "64"` is on the element for the test. ≤600px is
below 960px, so it is 64px there by construction.

**4. Silhouettes (`instruments/piece-silhouette.tsx`, new).** Five generic
inline-SVG outlines — chair / table / case / light / textile — at 1px
`stroke: var(--ink-faint)`, `fill: none`, each with one detail path and one
hatch path at `stroke-opacity="0.5"` (§F-A), standing on a floor line.
`silhouetteCategory(name, itemType)` reads the piece's own name *and* the loose
`itemType` ('furniture' | 'lighting' | 'trade' | 'product' — verified: it is
not an enum), first match wins, defaulting to `case`, the most neutral of the
five. No gradient, no pattern fill, no `<image>`, no diagonal hash — asserted.

**5. The stage word prints once.** The 9px `tracking-row-stop-label` span at
the end of the micro-spine is deleted. `StatusStamp` keeps its mark and moves
9px → **11px**. The `sr-only` "In production — stop 3 of 6" sentence and the
`aria-hidden` stamp are untouched, so the screen-reader contract is exactly one
reading.

**6. Captions.** `plateCaption()` (exported for direct test) composes
`what · whose`: a drawing says it is a drawing and whose ("Walnut credenza ·
drawing by Quist Interiors"); a photograph says so and from whom. The maker
clause ("photograph from {maker} to follow") prints **only** where a maker is
named. `RoomBand` passes `studioName` down from `threshold.tsx:693`
(`useStudioIdentity`). The caption takes `.t-meta` in `--ink-subtle`.

**7. Concept render slot.** `toThresholdRoom` (`threshold.tsx`) maps
`concept_render_url` / `_caption` / `_uploaded_at` / `_uploaded_by` off the
`project_rooms` row onto `ThresholdRoom.conceptRender`; A2's `conceptRenderOf`
in `derive.ts` then yields `RoomBandModel.conceptRender`. Where one exists the
band renders a 3:2 plate at full band width **above** the drawing, with the
label "Concept · not installed" positioned **inside** the plate
(`absolute left-0 top-0`) at `.t-body-sm` (14px) in `--ink` on a `--paper-doc`
strip, and a `<figcaption>` "{caption} · uploaded by {studio} · {legal date}"
with every absent clause dropped. The drawing stays beneath. No render → no
slot, no heading, no rule.

**8. No installed photograph was invented.** The concept render is the only new
image source in this diff.

---

## Decisions beyond the plan's literal text (flag for review)

1. **The band signs its own concept render.** `derive.ts:41-45` states that
   `RoomConceptRender.url` is "the OBJECT PATH inside the private `room-renders`
   bucket, not a URL that resolves — a reader signs it", and no read-side helper
   exists (A2's `useRoomConceptRender` is upload-only; the barrel is A2's and I
   did not touch it). Rendering `<img src={path}>` would ship a broken-image
   glyph, which R142 forbids. So `room-band.tsx` carries a local
   `useSignedConceptRender(path)` — `createBrowserClient().storage.from(ROOM_RENDERS_BUCKET).createSignedUrl(path, 3600)` in a `useEffect`, the same
   pattern as `commercial-document-shell.tsx:613`. The signed URL is held
   **with** the path it was signed for, so a repointed band never draws the old
   image and the effect never calls `setState` synchronously (that form tripped
   `react-hooks/set-state-in-effect` and was fixed). A path that will not sign
   renders nothing. Both new suites cover the failure path.
2. **`--hairline` does not exist and H2 is not adding it.** The house sheet
   names `--hairline #E8E3DB`, but Lane H2's step 2 alias list is `--oak`,
   `--ink-faint`, `--ink`, `--paper`, `--clay-ink`, `--golden-ink`,
   `--terracotta-ink`, and its step 1 adds `--paper-doc`, `--rail`,
   `--ink-subtle`, `--sage-ink`. The client's own hairline is
   `--border-default: var(--color-pearl) #E5E2DD`, which is not the sheet's
   value. Plate and concept-plate borders therefore use `var(--border-default)`
   — the portal's existing hairline, the token every neighbouring rule already
   uses. **Owed to H2 / integration:** add `--hairline` to the alias block if
   the sheet name is meant to resolve in the client portal.
3. **Tokens this lane consumes that only exist after H2 merges:**
   `--rail`, `--ink-subtle`, `--paper-doc`, `--ink`, `--ink-faint`, and the
   classes `.t-body`, `.t-body-sm`, `.t-meta`. This is the plan's own
   integration order (H2 → H1 → H4 → H3 → H5 → H6) and is why these render
   unstyled in this branch alone. Nothing in this lane touches `globals.css`.
4. **`open-chapter.test.tsx` was edited** (10 lines) though it is not in the
   lane's file table: it owns `TrackingRow`'s first suite and pinned
   `tracking-row-stop-label`, which step 5 deletes. The assertion now reads the
   stamp and asserts the old label is absent; the sr-only assertion is kept.
   One test title was reworded from "placeholder block" to "silhouette".
   `threshold.test.tsx` was likewise extended (+68) per the brief's explicit
   "add a threshold test for it".
5. **`ClientSelection` carries no maker column** (confirmed:
   `lib/commercial-documents.ts:1085-1114`). `TrackingRow` takes an optional
   `maker` prop so the caption composes correctly the moment a maker source
   exists; the band passes none today, and the caption prints no maker clause.
   Tested on both branches.
6. **`plan-key.tsx` was edited** (18 lines, three `export`s and one call-site
   swap) though it is not in the lane's file table — the plan's step 2 requires
   it verbatim ("Export the helpers from `plan-key.tsx` and import them").
7. **The specimen puts the band's footprint labels in an HTML `<figcaption>`;
   the plan says port the plan key's crop.** I followed the plan.

---

## Gate evidence (run in the worktree, on the final tree)

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(no output — clean)

$ pnpm --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1060 passed, 1060 total
Snapshots:   0 total
Time:        8.894 s

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```

**The lint gate is "do not grow the count".** Measured baseline by stashing the
whole `components/threshold` tree: `✖ 63 problems (11 errors, 52 warnings)` —
identical. The lane briefly added one error (`setState` in the signing effect)
and three "unused eslint-disable directive" warnings; all four were removed.

`npx eslint apps/client-portal/src/components/threshold` as written in the plan
**cannot run**: the client portal has no `eslint.config.*` of its own and there
is none at the repo root, so bare `npx eslint <path>` exits with "ESLint
couldn't find an eslint.config.(js|mjs|cjs) file". `pnpm --filter
@patina/client-portal lint` (which is `eslint .` under `next lint`'s resolution)
is the command that actually gates this app.

**Full suite with coverage** (the 70/60/70/70 floor):

```
$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.4 |   71.08 |   75.56 |   77.73 |
  plan-key.tsx          |  90.24 | 68.75 |  92.3 | 97.14 |
  room-band.tsx         |  97.32 | 90.09 |   100 | 99.04 |
  threshold.tsx         |  95.85 | 82.96 | 93.75 | 98.38 |
  piece-silhouette.tsx  |    100 |   100 |   100 |   100 |
  tracking-row.tsx      |    100 |   100 |   100 |   100 |

Test Suites: 136 passed, 136 total
Tests:       2295 passed, 2295 total
```

---

## Tests added (49 new assertions across 4 files)

- `instruments/__tests__/piece-silhouette.test.tsx` (new, 16 cases) — the
  category read for ten real piece names plus the `itemType`-only and
  no-signal paths; each of the five outlines drawn with one detail, one hatch
  at `stroke-opacity="0.5"`, `fill: none`, `stroke: var(--ink-faint)`, an
  accessible name, and no `<image>` / gradient / `url(#…)` anywhere.
- `instruments/__tests__/tracking-row.test.tsx` (new, 13 cases) — the plate at
  96px above and 64px below the $2,000 threshold and for a priceless line; the
  silhouette drawn only when there is no image; the caption's four shapes; the
  stage word appearing **exactly once** (`getAllByText('In production')` has
  length 1) with the stamp at `text-[11px]` and the sr-only sentence intact.
- `__tests__/room-band.test.tsx` (+13 cases) — the empty room as a floor line
  and a sentence with **zero `rect` elements in the whole render** and no
  `room-band-drawing`; the lead-room clause; the eleven-pixel floor asserted as
  real arithmetic (`fontSize × PLAN_PHONE_CONTENT_PX / viewBoxWidth >= 11`) at a
  mocked 390 phone; every footprint inside the phone crop; the desk drawing
  unchanged; six concept-render cases including the unsigned path and an empty
  room that still carries a render.
- `__tests__/threshold.test.tsx` (+3 cases) — the W1 hand-off end to end: the
  four columns on a `useProjectRooms` row reach the band's plate with the right
  signed URL and a composed caption; no room with a render → no slot anywhere;
  a whitespace-only `concept_render_url` is not a render and never even asks
  for a signature.

---

## What I did not do

- Did not touch `globals.css` (H2/H4), `letterbox.tsx` (H6), the `sections`
  array or the landmark ledger (H3), or any `.da-*` / action-tier rule (H4).
- Did not rename any anchor id; `#room-<roomId>` is unchanged.
- Did not add a hook to `packages/supabase/src/hooks/index.ts` (A2's file) and
  did not regenerate `database.types.ts`.
- Did not run `supabase db reset`, `pnpm db:generate`, or a dev server; no
  renders were taken (Wave 2 integration owns :3002).
- Did not invent an installed photograph, a maker, or an "installed" image
  source of any kind.
- Did not run Prettier `--write`: the whole `components/threshold` tree already
  fails `prettier --check` on untouched files (`letterbox.tsx`,
  `doorstep.tsx`, `instruments/stamp.tsx` all warn), so the pre-commit
  advisory warning is pre-existing drift, not this lane's.
