# PORTAL POLISH — technical blueprint (both portals, one house sheet) — 2026-09-08

Rulings of record: `artifacts/portal-polish-review-2026-09-08/rulings.md` (PP-1…PP-9, Kody,
8 September 2026). Panel evidence: `artifacts/portal-polish-review-2026-09-08/synthesis.md`.
Visual truth: `artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md` §A as amended by §F,
proved by `specimens/client-house.html`, `specimens/designer-desk.html`,
`specimens/decision-moment.html`.

Ship ruling (Kody, 2026-09-08): **no feature flag, straight to everyone**, and "deliver this entire
program to prod" — which authorizes the whole chain, migration through deploy, per patina-deploy.

Program name **portal-polish**. Three waves: amendments + backend → the house page → the Desk.
The lane-by-lane executable form is `docs/superpowers/plans/2026-09-08-portal-polish-build.md`.

---

## 0. Verified ground

| Fact | Evidence |
|---|---|
| Client acts are `ScoredAction` / `HoldAction`, variants primary·secondary·tertiary·danger | `apps/client-portal/src/components/threshold/instruments/scored-action.tsx:40-53` |
| No filled `.da-*` variant exists in the client portal | `apps/client-portal/src/app/globals.css` Scored Ink block from :193; the only fill is the bespoke `--pay-act-bg` button at `app/pay/[token]/invoice-sheet.tsx:773` |
| Tertiary rest rule is hover-gated in both portals | client `globals.css:328` `transform: scaleX(0)`; designer `globals.css:693` the same |
| Secondary rest score is `rgba(44,41,38,.28)` on the Desk | designer `globals.css:679` |
| Disabled state is `opacity-50` in both `BASE_CLASS`es | client `scored-action.tsx:46-47`; designer `document-action.tsx:52-53` |
| The gate uses the real `disabled` attribute | client `scored-action.tsx:521` (`HoldAction`), `:249` (`ScoredAction`) |
| The hold sentence is `sr-only` | client `scored-action.tsx:610-612`; `HOLD_MS = 900` at `:288` |
| Focus is a caret with `outline: none` | client `globals.css:430-451`; designer `globals.css:841-858` |
| `--color-error` has one consumer | client `globals.css:58`, read only by `.da-danger:hover` at `:373-375` |
| The colophon phrase already exists twice | `app/pay/[token]/invoice-sheet.tsx:895`, `app/pay/[token]/settling-sheet.tsx:130` |
| Studio identity resolves through an RPC | `threshold.tsx:279` `useStudioIdentity({ projectId })` → `studioName` at `:693` → `Doorplate` at `:1194-1200` |
| Anchors the redirect map depends on | `#letterbox` `letterbox.tsx:226`; `#wall` `wall-gate.tsx:190` (first only); `#door` `door-gate.tsx:497` (first only); route map `docs/design/the-client-page/README.md:102-118` |
| Story-pole sections omit money and gates | `threshold.tsx:1254-1264` — doorstep, key, band anchors, road, note, previously, mat |
| The rail is hidden on a phone | `story-pole.tsx:178` `max-[600px]:hidden`; caret `:231-233` |
| `project_rooms` carries no image column | `packages/supabase/src/database.types.ts` — actual_cents, budget_cents, committed_cents, created_at, dimensions, ffe_categories, floor_area_sqft, id, name, notes, project_id, room_id, room_type, sort_order, source_scope_room_id, updated_at |
| The threshold RPC's head is 00578 | `supabase/migrations/00578_design_build_kind.sql:3451` `CREATE OR REPLACE FUNCTION public.get_client_project_threshold` (lineage banner at `:27`: 00565:447 → 00578) |
| Migration head | `supabase/migrations/00579_trade_agreements.sql`; next number **00580** |
| The eleven-pixel floor is solved once | `plan-key.tsx:35-50` — `PLAN_PHONE_TYPE 17`, `PLAN_PHONE_CONTENT_PX 358`, `TYPE_FLOOR_PX 11`, `planPhoneViewBox()`; `room-band.tsx:70` `FOOT_TYPE = 11` in user units, used at `:151`/`:230` |
| The stage word prints twice at 9px | `instruments/tracking-row.tsx:187` and `:210`; plate is `h-16 w-16` at `:109`/`:112-118` |
| The Desk roster derivation lives in its own file | `lib/document/desk-roster-derivation.ts` — `ROSTER_STAGE_ORDER:29`, `URGENT_NEED_KINDS:59`, `overdueSentence:181`, `overdueLine:127`; `DocumentStateRow.designer_id` is `lib/document/desk-derivation.ts:53` |
| `project_notes.answered_at` exists and nothing on the Desk reads it | `supabase/migrations/00565_the_client_page.sql:236`; `hooks/use-desk-engagements.ts:217-232` reads `item_feedback` verdict `rejected` only |
| The Desk page is a single 1120px column | `app/(document)/desk/page.tsx:230`; roster `:433`, boards `:442`, rollup `:443`, contents `:447`/`:453`; `useOrganizationMembers` already fetched at `:90` |
| The ⌘K palette has a bare `role="dialog"` | `command-bar.tsx:1073-1076`; results are `<ul><li><button>` at `:1145-1166` with no listbox semantics |
| The mobile bar prints a dwell timer | `mobile/mobile-bar.tsx:368-381` (centre fallback), `:498-514` (the More row, which stays) |
| The shadow gate is real and lints Document surfaces | `apps/designer-portal/eslint.config.mjs:72-108` |
| Client coverage floor | `apps/client-portal/jest.config.js:71-78` — 70/60/70/70 |
| The house sheet's tokens are already all present on the Desk | designer `globals.css` carries all sixteen sheet hexes; the client portal is missing `#FCFAF6`, `#E8E3DB`, `#5A4E43`, `#5F6B57` |

**Two research corrections, made in verification.** (1) The threshold RPC's current body is in
**00578**, not 00565 — 00580 must `CREATE OR REPLACE` from the 00578 body. (2) The date-idiom sweep is
wider than ten files: `ground-floor.tsx`, `instruments/standing-sentence.ts` and
`instruments/tracking-row.tsx` also format en-US, and `scope-change-ask.tsx` and `review-ask.tsx` also
format en-GB; `story-pole.tsx` and `approval-ask.tsx` format **both**.

---

## 1. The house sheet as a repository artifact

`artifacts/…/specimens/SPEC.md` is a review artifact and will rot there. Lane A1 copies it verbatim to
**`docs/design/house-sheet/SPEC.md`**, which becomes the canonical location and the thing I153 names.
The copy is byte-identical; §F stays in it, because §F wins over §A and a reader who loses §F loses the
terminal label, `.act--inline`, the pressed state and the 390 dock.

The sheet is applied **surface by surface as each is touched** (PP-5). Nothing in this program rewrites
a screen the waves do not otherwise open.

**Tokens.** Both portals gain the sheet tokens they lack. The client portal is short four —
`--paper-doc #FCFAF6`, `--rail #E8E3DB`, `--ink-subtle #5A4E43`, `--sage-ink #5F6B57` — and it already
carries the rest under other names. **Alias, never rename**: the designer's `--color-aged-oak #8B7355`
gains `--oak: var(--color-aged-oak)`; the client's `--color-quiet-ink #65594E` gains
`--ink-faint: var(--color-quiet-ink)`. Renaming a token that ~90 files read is a refactor nobody asked
for, and the sheet's own names are what the seven-step classes will reference.

**Type steps.** `.t-d1 .t-d2 .t-d3 .t-body .t-body-sm .t-meta .t-head` plus `.t-money` and
`.t-authorship` are implemented **local to each portal** — the client's in `app/globals.css`, the
designer's in `app/globals.css` — as plain CSS classes, not a shared package. A shared package would
make every portal's type contract one lane's property and break the "as each is touched" rule. No new
hex literal enters either file: everything the classes need is already a token or is added as one.

---

## 2. Action tiers (PP-3)

A fourth variant, **`terminal`**, joins `ScoredActionVariant` and `DocumentActionVariant`: filled
`--color-charcoal`, `--ink-paper` text, Inter 500 / 16px / sentence case / tracking 0 / tabular figures,
`min-height: 48px`, `border-radius: 3px`, the amount inside the label. It appears in exactly three
places in this program: the wall gate, the door gate, and `/pay/[token]`'s Pay act — which stops being
a bespoke `--pay-act-bg` button at `invoice-sheet.tsx:773` and becomes the same tier CSS, so the product
stops shipping three action grammars (IX10).

Four rest-state corrections ride with it, and all four are one-line CSS deletions or swaps:

- **Tertiary rests visible.** Remove `transform: scaleX(0)` from client `globals.css:328` and designer
  `globals.css:693`. The rule rests at 1px `--oak` (4.20:1), unconditionally — no `@media (hover:none)`
  variant. This is the fix for a phone that today shows zero interactive marks (B01/IX03/IX04).
- **Secondary rests at `--oak`** on the Desk: `rgba(44,41,38,.28)` → `var(--color-aged-oak)` at designer
  `globals.css:679`.
- **Disabled loses `opacity-50`.** Drop it from both `BASE_CLASS`es (client `scored-action.tsx:46-47`,
  designer `document-action.tsx:52-53`). Unavailability reads as `--text-faint` at full opacity with
  hairline scores — quiet ink at half opacity measures 2.21:1 and is not a state anyone can read.
- **Focus gains an outline.** `:focus-visible { outline: 2px solid var(--color-clay-ink); outline-offset:
  2px }` **in addition to** the proofreader's caret, which stays. `outline` does not affect layout, so
  no neighbour resizes.

**The gate stops using `disabled`.** `HoldAction` at `scored-action.tsx:521` takes `aria-disabled` plus
`aria-describedby` pointing at the visible reason; the control stays in the tab order. Activating it
while unmet moves focus to the name input and writes the reason into the gate's existing `role="status"`
line — it never silently does nothing. The `sr-only` hold sentence at `:610-612` becomes a **visible**
`.t-meta` caption under the act reading "Press and hold to accept": a pointer user who cannot see the
gesture cannot perform it.

**Every terminal act carries a consequence sentence** at 15px directly above it, present in every state
including unavailable, saying what the act does *and* what it does not do. The wall gate composes its
sentence from data it already reads: `bundle.data.tradeScope.draws[]` filtered on `gatesOnAcceptance`
and `tradeScope.party.displayName` — the same fields the existing caption uses at `wall-gate.tsx:132-147`.
Nothing is invented.

**After the act, the act is gone.** The control unmounts and the existing Stamp record stands in its
place. No enabled act ever sits beside its own completed state (IX11).

---

## 3. The client page

### 3.1 Letterhead and colophon (PP-1)

`doorplate.tsx` (93 lines, props only) is unchanged in structure. Studio identity keeps coming from
`useStudioIdentity` through `threshold.tsx:279`. Where `user?.name` is absent the right-hand slot already
prints nothing — that behaviour is **pinned with a test** rather than rewritten, so "PREPARED FOR CLIENT
USER" can never come back.

A `Colophon` instrument is extracted to `components/threshold/instruments/colophon.tsx` — "Prepared by
{studio} · Sent through Patina", the exact phrase already living at `invoice-sheet.tsx:895` and
`settling-sheet.tsx:130` — and used in all three places. It renders after the mat. **No PATINA wordmark
exists on the Threshold today and none is added**; the assertion is a test, because a refusal nobody
tests is a refusal that expires.

Mat: "Leave the house" becomes **"Sign out"** (`mat.test.tsx:194` updates with it). Column headings whose
column has no rows are dropped. The mat's house-wide "Ask for a change" stays exactly once. The studio
note signs full name · studio · date.

### 3.2 The money block (PP-2)

The owed figure takes the announcement rank: 26px Playfair at the display step, with "due 11 September
2026" beneath at `.t-meta`. The reconciling sentence — agreed / paid / owed — sits under it in 16px body
with every figure in `.t-money` (DM Mono 15px, tabular). The letterbox's figure line goes to 15px. The
letterbox drawing takes the plain gloss "Invoice". Pay becomes a `terminal` act under the consequence
sentence "This opens payment. Nothing is charged until you choose how to pay."

**One date helper** ends the two-idiom split: `apps/client-portal/src/lib/threshold/dates.ts` exporting
`legalDate(d)` → "11 September 2026" and `dayMonth(d)` → "11 September", both en-GB. One lane owns the
sweep across all ~15 formatting sites and updates the strings the tests pin. "due 11 September" one line
above "due September 11" (BE-16) is a bug that only a single helper can close for good.

### 3.3 Landmark ledger and story pole (PP-5, IA-20/23)

A new `landmark-ledger.tsx` renders under the doorplate: five `.t-head` tertiary acts — Where we are →
`#doorstep`, What changed → `#changed` (a new id on the doorstep's since block), What you owe →
`#letterbox` (carrying `data-never-dim`), What needs you → the first rendered of `#wall` / `#door` /
`#approval-<id>`, The papers → `#mat-papers`. **A landmark whose target does not render is omitted, never
disabled** — the failure mode IA-21 names is a footer index pointing at ids that do not exist.

The story pole becomes navigable: graduation labels and the held label become anchor links; the caret
stays a non-interactive reading mark. Below 600px the hidden rail is replaced by a sticky one-line
"You are in: {section}" button that expands the same list. The `sections` array at `threshold.tsx:1254-1264`
extends to include `letterbox` and the first gate, so the caret can land on the two things the page is
actually about. The doorstep's sentence object becomes an inline link to its gate — today it announces an
ask whose gate sits ~1,400px below with no jump.

**No anchor id is renamed.** The middleware 308 map and the README route map at
`docs/design/the-client-page/README.md:102-118` stay valid by construction.

### 3.4 Rooms and plates (PP-4)

An empty room stops being an outlined rectangle (`room-band.tsx:134-158`) and becomes a floor line and
one sentence — plus the next real step where one is known. `plan-key.tsx`'s eleven-pixel floor is
**ported, not reinvented**: `TYPE_FLOOR_PX`, `PLAN_PHONE_TYPE`, `planPhoneViewBox` and the
`useSyncExternalStore` phone hook move to the band's footprint labels, which today render at 3.9px on a
390 phone.

`tracking-row.tsx`: the plate goes to 96px at ≥960px when the piece is worth ≥ $2,000, 64px otherwise.
The hash-block placeholder becomes a **drawn silhouette** by category — chair, table, case, light,
textile — as inline SVG in `--ink-faint`, captioned "Photograph from {maker} to follow" where the maker
is known. The stage word prints **once** at 11px (the 9px duplicate at `:187` goes; the stamp at `:210`
keeps its mark at 11px). Every plate gets a caption: what · whose · when.

**Concept renders are the only new image source** (PP-7). Where `room.conceptRenderUrl` exists, a 3:2
plate at band width sits above the drawing, carrying an on-image label "Concept · not installed" at
≥14px in `--ink` on a `--paper-doc` strip, and the caption "{caption} · uploaded by {studio} ·
{legalDate}". The drawing stays beneath it. Installed photographs do not exist in the data model and are
**not invented**.

---

## 4. Concept render backend (PP-7)

Migration **`00580_room_concept_render.sql`** adds four nullable columns to `project_rooms` —
`concept_render_url text`, `concept_render_caption text`, `concept_render_uploaded_at timestamptz`,
`concept_render_uploaded_by uuid references auth.users(id)` — creates a **private** `room-renders`
bucket keyed `<project_id>/<room_id>/…` (studio members of the project insert/update/delete; project
clients and studio members select), and widens `get_client_project_threshold` by `CREATE OR REPLACE`
from the **00578** body with the four fields added to the rooms payload. Everything is additive and
nullable, so the columns ride the existing `project_rooms` policies — which the lane verifies rather
than assumes.

A hook `packages/supabase/src/hooks/use-room-concept-render.ts` uploads through `supabase.storage`, then
updates the row, then invalidates `['project-rooms', projectId]` and the threshold key. The client's
`deriveThreshold` maps the four fields onto `RoomBandModel.conceptRender`. On the designer side the
upload UI lands in the document's rooms/FF&E area beside the existing R25 room heading
(`components/document/ffe-section.tsx:567`): a tertiary act "Add a concept render", a file input
(jpg/png/webp ≤ 8 MB), a caption field, and the consent line "Labeled 'Concept · not installed' on the
client's page". **No new route.**

---

## 5. The Desk

**The day's line** replaces the proposal's hero: at most three lines inside `DeskRoster`, between the
head and the first stage plate, every one of them a view of a roster row that links to it. The overdue
sentence (with the job name inline-linked to its `data-roster-line` row), the earliest lead deadline,
and "{client} replied last night — {job}" from `project_notes.answered_at` inside 24h — a new read in
or beside `use-desk-engagements.ts`, no RPC, since RLS already scopes it. "and N more below" links to the
first plate. **When nothing needs her, the band does not render.** Absence is silence, and a queue that
prints "Nothing needs you" above sixteen live jobs is a second queue.

**Facets, not a density toggle.** "Only what needs me" (rows carrying a mark) and "By person" (regroup by
`DocumentStateRow.designer_id` against the `organization_members` profiles already fetched at
`desk/page.tsx:90`, unassigned under the principal) sit on the roster head with `aria-pressed`, and the
head sentence states the active facet in words. Saving fifteen pixels a row was never the ask.

**Boards beside the head, not below the roster.** At ≥1280px the 1120px container becomes a two-column
grid — roster `minmax(0,1fr)` plus a 260px rail — and `RecentBoardsStrip` renders a `compact` variant
(three boards, 92px cover, name and relative time) in the rail. Below 1280 the existing strip stays where
it is. At sixteen jobs the studio's creative work is currently ~2,000px down the page; at forty-three,
~4,000px.

**Row affordance:** roster job names take a resting 1px `--color-aged-oak` rule (`desk-roster.tsx:110`,
`.row-wash-score` at `globals.css:409-428`). `--elevation-sheet` and `desk-settle` are untouched.

**The dwell timer goes.** The "Today / In hand + elapsed" centre readout at `mobile-bar.tsx:368-381` is
removed; the centre slot shows nothing when no primary action is registered. The "Time in hand … review
or adjust" row in More (`:498-514`) stays — a timer she opens is a tool; a timer that watches her is not
(VISION.md:50). The bar's colour and identity block stay as built (Kody).

**The ⌘K palette gets its semantics** (B03): `aria-modal="true"` on the dialog, `role="listbox"` on the
results list, `role="option"` + `aria-selected` per row, `aria-activedescendant` on the input, and a
`role="status"` result count.

---

## 6. Governance (PP-6) — amend before building

All entries are new, appended, H3-headed, dated 2026-09-08, with the sentinel lines advanced. Past
entries are never edited.

`docs/design/the-document/DECISIONS.md`: **R139** amends I107 (`:6584`) — the tertiary rest rule at ≥3:1
and a `terminal` tier, filled charcoal, only where money moves or a paper is signed; the two-score
secondary unchanged; the invoice's Pay joins the tier. **R140** amends R126 (`:9981`) — the seven-step
scale plus the 15px money step as the type contract; plates 96–120px above a value threshold; owed
outranks agreed; colour-at-three-sites and the elevation clause unchanged. **R141** amends R135
(`:10701`) — the landmark ledger is page furniture, not a header; "Sign out"; the colophon; consequence
sentences at gates; `--color-error` stays forbidden. **R142** the client imagery doctrine — the source
hierarchy, studio-uploaded concept renders labeled on-image and permitted to lead a band, never stock or
procedural fills, the eleven-pixel rendered floor; extends R107 (`:3765`) to the client page. **I153**
names `docs/design/house-sheet/SPEC.md` as the type and rhythm contract for both portals, applied as
surfaces are touched.

`docs/vision/VISION-DECISIONS.md`: **V9** under a new `## Ruled — 2026-09-08 (portal polish)` heading,
in V8's Question / Decision / Consequence / Source shape — the five principles as ruled, PP-1 scoped to
client pages, PP-7's concept renders, rules back on. It says explicitly what it does **not** license:
shadows, badges, dashboards, engagement metrics. The Desk keeps its wordmark (PP-9).

`apps/designer-portal/CLAUDE.md`: the D4 line (`:21`) notes R126's one token and that nothing here adds
depth; typography-first (`:23`) references the house sheet; the success criterion (`:48`) is reworded to
end "…a shadow, a zone, a badge, or a dashboard; the only filled control she ever sees is a terminal act
where money moves or a paper is signed."

The eslint shadow gate (`eslint.config.mjs:72-108`) **stays**: no depth was adopted, and the one
`--elevation-sheet` token the house sheet names is for a temporary sheet, which none of these surfaces
is. `shadow-gate.test.ts`, `contrast.test.ts` and `rail-stock.test.ts` stay green untouched.
`document-action.test.tsx:29-105` gains a `terminal` row with `retiredChrome` = none; the other rows are
unchanged, which is the point — the filled charcoal that is *retired chrome* everywhere else is the
*correct grammar* here, and the table has to say so in one place.

---

## 7. Risks

1. **`threshold.tsx` and `globals.css` are each touched by two lanes.** Resolved by ordering and by
   splitting file ownership inside the plan, not by hoping merges are clean.
2. **The RPC's real head is 00578, not 00565.** Copying the wrong body silently drops the design-build
   fields shipped four days ago. The lane reads 00578:3451 first and diffs.
3. **Copy strings are pinned by tests in both jest and Playwright.** "Leave the house" → "Sign out" and
   every reformatted date breaks assertions by design; the plan carries the table.
4. **`--color-error` may have a second consumer.** If `.da-danger:hover` is not the only reader, that
   hover re-points to `--color-terracotta-ink` rather than the token surviving.
5. **The client portal's `.env.local` has pointed at Strata prod before.** Every wave's stack owner
   verifies `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1` before any `supabase db reset`.
6. **Lint baselines are non-zero** (client 11, designer 2). The gate is "do not grow the count", not
   "zero" — a lane that reports zero has almost certainly run the wrong command.
