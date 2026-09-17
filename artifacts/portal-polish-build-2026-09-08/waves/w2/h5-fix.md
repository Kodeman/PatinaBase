# Lane H5 — review fixes (PP-4 / PP-7)

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h5`
**Branch** `portal-polish/h5` — `548c01eb5` → **`1f9488cd0`**, pushed
(`548c01eb5..1f9488cd0  portal-polish/h5 -> portal-polish/h5`).
**Commit** `fix(client): address W2 review — h5`

---

## Disposition

| ID | Sev | Disposition | Note |
|---|---|---|---|
| H5-1 | P2 | **fixed** | `onError` fallback on the concept-render `<img>` |
| H5-2 | P2 | **declined — not this lane's file** | `--hairline` lives in `globals.css` (H2) |
| H5-3 | P2 | **declined — no defect; the sheet is consistent** | the specimen is the stale document |
| H5-4 | P3 | **fixed** | `gap-x-4` → `gap-x-6` (16px → 24px) |
| H5-5 | P3 | **fixed** | the silhouette is decoration, like the photograph beside it |
| H5-6 | P3 | **fixed** | `text()` returns the trimmed string |
| H5-7 | P3 | **declined — pre-existing, out of scope** | SVG `<text>` cannot wrap |
| H5-8 | P3 | informational — no action | the specimen never depicted PP-7 |
| H5-9 | P3 | **fixed** | `h5-impl.md` copied into the shared checkout |

---

## What changed

### H5-1 — a signed URL that will not load prints nothing (fixed)
`room-band.tsx`, `ConceptRenderPlate`. `useSignedConceptRender` only ever guarded the *signing*; the
signature's TTL is a fixed 3600s, so an object deleted, replaced or unreachable inside that hour fell
through to the browser's broken-image glyph — the one mark on the page nobody chose to put there.
The plate now holds a `brokenSrc` beside the signed URL and sets it `onError`, mirroring the guard
`TrackingRow`'s photograph already carried:

```tsx
const src = useSignedConceptRender(render.url);
const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
if (!src || brokenSrc === src) return null;
…
<img src={src} … onError={() => setBrokenSrc(src)} … />
```

Held *with* the src it broke on, so a band repointed at a good render draws it again. Failure is the
same failure signing already had: **no render → no slot** — no figure, no label, no caption, no rule.

New test in `__tests__/room-band.test.tsx`: sign successfully, `fireEvent.error` the image, assert
`room-band-concept` is gone and the word "Concept" appears nowhere.

### H5-4 — the row's column gap is back on the module (fixed)
`instruments/tracking-row.tsx`: `gap-x-4 gap-y-3` → `gap-x-6 gap-y-3`. Row-gap 12px was already right;
column-gap is now 24px, matching the specimen's `.piece { gap: 12px 24px }` and the sheet's A4 module
(24 / 48 / 72 / 12, nothing else — 16px was off it).

### H5-5 — the silhouette is decoration (fixed)
`instruments/piece-silhouette.tsx`: `role="img" aria-label={…}` → `aria-hidden="true"`, and the now-dead
`name` prop is gone from `PieceSilhouetteProps` and from the one call site. The row already prints the
piece's name in its own paragraph and the caption beneath already says the plate holds a drawing and
whose it is ("Walnut credenza · drawing by Quist Interiors") — a third reading of the same fact is the
"no double reading" the plan's own review checklist rules out, and it now matches the sibling
photograph's `alt=""` exactly. Test swapped from `toHaveAccessibleName` to `toHaveAttribute('aria-hidden')`.

### H5-6 — `text()` returns what it tested (fixed)
`threshold.tsx`: `? value : null` → `? value.trim() : null`, so `uploadedAt` / `uploadedBy` reach
`derive.ts` in the same shape `url` / `caption` do.

---

## Declined, with reasons

### H5-2 — `--hairline` (P2): not fixable inside this lane, and no in-lane substitute is legal
Confirmed independently rather than taken on the review's word:
- `origin/main` `apps/client-portal/src/app/globals.css` has **no** `--hairline` (only the word in two
  comments).
- `portal-polish/h2`'s `globals.css` adds `--paper-doc: #FCFAF6`, `--rail: #E8E3DB`,
  `--hairline-strong: rgba(44,41,38,.14)` — and **not** `--hairline`.
- `--rail` carries the sheet's exact `--hairline` hex (`#E8E3DB`), but SPEC.md A10 forbids the swap in
  so many words: "`--rail` is for fills/grounds only, **never a stroke**." So I cannot silently borrow it
  for a plate border.

`globals.css` belongs to H2/H4, not H5. The plates keep `var(--border-default)` (`#E5E2DD`, the portal's
own existing hairline, the token every neighbouring rule already uses). **Owed at H2 or integration:**
either add `--hairline: #E8E3DB` to the alias block and I (or integration) swap two `border-` classes in
`room-band.tsx` and `tracking-row.tsx`, or bless `--border-default` as this portal's answer and note it
on the sheet. One-line change either way once the token question is settled.

### H5-3 — caption type step (P2): no defect; the specimen is the stale document
The review framed this as an unresolved conflict between two sources of record. Reading the sheet
directly resolves it — **both** of its statements say `.t-meta`, including the §F one written about this
exact region:
- `SPEC.md:485` (§A10): "Caption, under every plate, `.t-meta` in `--ink-subtle`, sentence case."
- `SPEC.md:679` (§F, the client-house map, row 7 "Study band"): "each: 96px plate · `.t-d3` name ·
  `.t-money` price · one `.t-body-sm` state sentence · **caption `.t-meta`**."

The specimen's `<p class="caption t-body-sm">` is the only document out of step, and §F — the later,
amended layer — is unambiguous. `.t-meta` stands. No ruling needed; flagging for the specimen to be
corrected if anyone regenerates it.

### H5-7 — footprint-label truncation (P3): pre-existing and out of scope
`fitFootLabel` predates this lane; this diff only reparameterized it for the phone crop. SVG `<text>`
cannot wrap without multi-line tspan layout machinery, the plan's H5 steps never asked for it, and
building it here would be exactly the unrequested work the brief rules out. Left as-is; noting it so the
sheet's blanket "no truncation" rule can get a stated SVG exception if anyone wants one.

### H5-8 — no specimen ground truth for PP-7 (P3): informational
`client-house.html` depicts no concept render (its only image is the installed photograph the plan's
"Not in this plan" section excludes under R142). Nothing to change.

---

## Gate evidence — run on the final tree, in the worktree

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(no output — clean)

$ pnpm --filter @patina/client-portal test -- src/components/threshold
Test Suites: 42 passed, 42 total
Tests:       1061 passed, 1061 total     ← 1060 before; +1 is the onError case
Time:        9.547 s

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)   ← identical to the measured baseline
```

Grepping that lint output for this lane's four source files returns exactly one line —
`instruments/tracking-row.tsx  171:11  warning  Unused eslint-disable directive` — the same pre-existing
warning on the same comment the review already traced to `origin/main`. Zero errors, zero new warnings.

Full suite with coverage (floor 70/60/70/70):

```
$ pnpm --filter @patina/client-portal test -- --coverage --coverageReporters=text-summary
Statements   : 75.4%  ( 7165/9502 )
Branches     : 71.09% ( 5290/7441 )
Functions    : 75.57% ( 1618/2141 )
Lines        : 77.74% ( 6500/8361 )

Test Suites: 136 passed, 136 total
Tests:       2296 passed, 2296 total
```

Prettier's pre-commit warning on the six touched files is **pre-existing drift, not introduced here** —
verified by checking the parent revisions of the two largest ones:

```
$ git show HEAD~1:…/room-band.tsx > $TMPDIR/rb.tsx
$ git show HEAD~1:…/instruments/tracking-row.tsx > $TMPDIR/tr.tsx
$ npx prettier --check $TMPDIR/rb.tsx $TMPDIR/tr.tsx
[warn] rb.tsx
[warn] tr.tsx
```

Both warned before this diff existed. The hook is advisory locally; no `--write` was run (it would
reformat untouched neighbours and blow the lane's file boundary).

---

## Diff stat (`git show --stat 1f9488cd0`)

```
 .../threshold/__tests__/room-band.test.tsx                  | 12 ++++++++++++
 .../instruments/__tests__/piece-silhouette.test.tsx         |  8 +++++---
 .../threshold/instruments/piece-silhouette.tsx              | 13 ++++++++-----
 .../threshold/instruments/tracking-row.tsx                  |  4 ++--
 .../src/components/threshold/room-band.tsx                  |  6 +++++-
 .../src/components/threshold/threshold.tsx                  |  4 +++-
 6 files changed, 35 insertions(+), 12 deletions(-)
```

All six are the lane's own files. Staged by explicit pathspec — no `git add -A` / `.` / `-u`.

---

## What I did not do

- Did not touch `globals.css`, `letterbox.tsx`, the `sections` array, the landmark ledger, or any
  `.da-*` rule — H2 / H4 / H3 / H6 territory.
- Did not touch `packages/supabase/**` (A2) or `derive.ts`.
- Did not run Prettier `--write`, `supabase db reset`, `pnpm db:generate`, or a dev server; took no
  renders (Wave 2 integration owns :3002).
- Did not run git anywhere but this worktree; `main` untouched. The only write to the shared checkout is
  this report plus the copy of `h5-impl.md` (H5-9) — plain files, no git.
- Did not change the caption type step, the plate border token, or `fitFootLabel` — see Declined above.
