# W3 — adversarial review of the Standing Head build

Branch `build/standing-head-2026-09-10`, HEAD `4525da0c5`, reviewed against `origin/main` (41 files)
plus the uncommitted `docs/design/the-document/DECISIONS.md` R150 entry. Reviewer did not write the
build. No source file was modified.

**What was actually run** (evidence, not inference)

- `pnpm --filter @patina/designer-portal type-check` → exit 0.
- jest over `src/lib/document`, `src/components/document/{discovery,prework,region,workflow}`,
  `lens-band`, `letterhead-subject`, `doc-letterhead`, and `page.test.tsx` → **121 suites, 2387 tests,
  all pass**, 6.7s.
- `psql … -f supabase/migrations/00590_engagement_subject.sql` a **second** time against the local
  stack (already at 00590) → four `column "subject" … already exists, skipping` NOTICEs,
  `CREATE VIEW`, `COMMENT`, two `GRANT`s, `COMMIT`, **exit 0**. Idempotent.
- View-body diff: `00327:83-500` vs `00590:56-477` with `subject` lines stripped → **identical except
  four trailing commas** on `proposal_last_opened_at`, one per leg (the commas the four new columns
  force). The four additions are `p.subject` (Shape A), `pr.subject` (B), `l.subject` (C), `dc.subject`
  (D), each last in its select list. `comment on view` and both grants are reissued verbatim.
- Render pass: the built portal under `next start -p 3000` with the playwright.config webServer env
  plus `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, signed in as `designer@patina.dev` through the
  e2e auth fixture, at 1440×900 and 390×844. Server stopped; port 3000 confirmed free.
  Shots and probe logs in
  `/private/tmp/claude-501/-Users-kody-Code-patina-merged/813ac53a-fa71-4121-9b17-bdf07c59e542/scratchpad/w3/`.

---

## Ruling fidelity

**1 · HIGH · high** — `apps/designer-portal/src/lib/document/document-guide.ts:395`
(`inputsSentence`). The client's first name is `(clientName ?? '').trim().split(/\s+/)[0]`, so any
household name that opens with an article prints the article. **Observed live** on the only seeded
discovery paper: `The Ashfords (no-login household)` →
`Yours to add: project type and named rooms. Waiting on The: working budget, target or hard date,
style direction, lifestyle needs.` R2 is the ruling about *naming who is waiting on whom*, and it
names "The". Household names of the form "The X's" are the product's normal case.
**Fix:** strip a leading `the/a/an` before taking the first token; if what remains is empty or is
itself a household phrase (parenthetical, possessive), fall back to the full `client_name` or to
`the client`. Better still, read the client profile's own first name and treat `client_name` as a
household label.

**2 · HIGH · high** — `apps/designer-portal/src/lib/document/lens-band-derivation.ts:714-748` and
`src/components/document/lens-band.tsx:267-282`. **The band cannot print R2's sentence at either
width.** Measured on the live paper:

| width | `[data-lens-sentence]` rendered | its `scrollWidth` | `+4 MORE` right edge | paper right |
|---|---|---|---|---|
| 1440 | **541.14px** | 914px | 1154 | 1208 |
| 390 | **0px** | 914px | **390.36** | 390 |

At 1440 41% of the sentence is amputated by `LINE_CLIP`'s CSS ellipsis (the reader sees
`… Waiting on The: working budget…`). At 390 the sentence renders at **zero width** — R2 prints
*nothing at all* on the phone — and `+4 MORE` is pushed 31.9px outside the band's own 327 measure,
bleeding to the viewport edge. Cause: `short` is built only when a standing exception exists
(`const short = worst ? {…} : null`), so a **guide** line never has a second form; `fits(long)` is
never consulted, and `budgetPx` goes negative once the act label (`ADD PROJECT TYPE AND NAMED ROOMS`)
and the door are both present. Note the old headline (`Finish what you need to know`, ~200px) fit the
541px slot, so the 1440 truncation is **new with R2**; the 390 zero-width is pre-existing but R2 is
the ruling that now depends on it.
**Fix:** give the guide line its own short form (`Yours: scope. Waiting on Avery: 3.`) and let
`fits()` choose it, exactly as the standing line does; and clamp the act + door inside the measure
(they are both `shrink-0` on a line with no `overflow-hidden`, deliberately, so the clamp has to be
in the derivation).
Shots: `shots/discovery-rest-1440.png`, `shots/discovery-rest-390.png`.

**3 · MED · high** — `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:974` vs `:376`
(`subjectFor`). `useDiscovery` is called only when `row.active_section === 'discovery'`, so
`subjectFor`'s `discovery?.row` is always `undefined` on a **proposal** paper — yet R4 and the W1c
brief both say "relationship/proposal → from the discovery row". **Observed live:** `…b2` (direction)
and `…d6` (proposal spread) print no `[data-letterhead-subject]` at all, only the
`Add a subject line` act. Half of R4's assembled-line ruling is unbuilt.
**Fix:** read discovery on proposal papers too (via the chain's `designer_client_id`), or amend R4 to
relationship-only and say so in DECISIONS.

**4 · MED · high** — `apps/designer-portal/src/components/document/lens-band.tsx:267`. R6 reads
"**34.** Amends R126; **the standing sentence rises to 16.**" The `<h1>` came down to 34 (verified
live: `font-size: 34px`, one line at 1440 / two at 390) but line 2 is still `text-[15px]` (verified
live). `PROGRAM.md`'s R6 row names only the `<h1>`, so the second half was dropped without a recorded
deviation.
**Fix:** raise it and re-derive `LENS_LINE2_MEASURE_PX`/`sentencePx` against the 56px contract
(interacts with finding 2), or record the deviation in the R150 entry.

**5 · MED · med** — `apps/designer-portal/src/lib/document/document-guide.ts:814-841` (the
`alreadySeeded` branch). Shape D of the view (`00590:360` and its `not exists` clause) suppresses a
`designer_clients` row the moment **any** proposal carries its `designer_client_id`, and
`begin_direction_from_discovery` sets exactly that column on insert. A seeded relationship paper
therefore stops resolving, so `Open the direction` can never reach the glass. Nothing breaks — the
RPC is itself idempotent on `seeded_proposal_id` — but R5's seeded case is dead code with no
reachable proof, and the page test that covers it (`page.test.tsx`, "opens an already-seeded
direction") proves the derivation, not the product.
**Fix:** say so in the build record, or drop the branch and let the RPC's own idempotence carry it.

**6 · MED · high** — `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1689`
(`runBeginDirection`) vs the deleted `discovery-section.tsx begin()`. The old act opened with
`await flush()` and an explicit comment: *"AWAIT the serialized save chain — the server gate must read
the FINAL facts, not race a still-in-flight edit (F2)."* The lifted version has no equivalent. The
readiness gate itself is safe (the band only reaches rest off the **server** read — `useUpsertDiscovery`
does no optimistic write), but the RPC **copies the discovery row into the seeded agreement**, and the
600ms debounce (`discovery-section.tsx:267`) plus the section's fire-and-forget focusout flush
(`:392`, `void flush()`) can still be in flight. A last edit can land *after* the agreement is seeded
from the row without it.
**Fix:** lift the flush too — hand the page a flush callback from `DiscoverySection` (the same shape
`onEyebrow` already uses) and `await` it at the top of `runBeginDirection`.

**7 · MED · high** — `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2211-2213`.
`bandNamesTopInput` is derived from `guideModel.state` **alone**, but `deriveLensBand` prints
`worst.sentence`/`worst.act` whenever `standing` is non-empty — i.e. line 2 is naming an *exception*,
not `guideInputs[0]`. `doorFacts` has nevertheless already dropped `guideInputs[0]`, so that input
appears nowhere: not on line 2, not behind the door, and `withheld` is short by one. Unreachable on
today's data (`redLetterRows` returns `[]` unless `engagement_kind === 'project'`, and `needs_input`
is discovery-only), but it is one `composeDocumentGuideInputs` change away from shipping.
**Fix:** derive the exclusion from what the band actually printed —
`bandModel.line2.act?.key === 'open-missing-input'` — not from the guide's state.

**8 · LOW · high** — R5 reads "one leader act per page"; the build implements "delete the readiness
band". **Measured live** with `[data-action-variant="primary"]`: the discovery paper has exactly one
(`Add Project type and named rooms`) ✓; the project paper `…d5` has **four** (`Message`,
`Send reminder`, `Complete phase`, `Message Client User`). `PROGRAM.md` scoped R5 to the readiness
band, so this is a scoping question for Fable, not a build defect.

## Correctness and regressions

**9 · LOW · high** — `page.tsx:1997`. `essentialsDone` is gated on `row?.active_section === 'discovery'`
while the rest of the spread reads `spreadSection`. Under a pinned worktable the ladder's discovery
register and the printed spread can disagree. (`spreadSection` is computed after the early returns, so
the fix needs a hoist or an explicit comment.) D6 itself is correct: `discoveryReadiness.state ===
'ready'` means *the read answered*, not *discovery is complete*, so `ESSENTIAL_KEYS.length -
guideInputs.length` is the real count — verified live, the rail printed `0 OF 5` on a paper with all
five open.

**10 · LOW · low** — `page.tsx:2450` (`stageOnGlass`) gates on `spreadSection` while the mount still
receives `activeSection={row.active_section}`. A pinned composition whose `section` is `project` on a
non-project engagement (`projectId` null) would take the mount's section branch and reprint
`Core · stage 03` — the exact W5F2-01 trap the deleted comment describes. Currently unreachable
(`table-derivation.ts:87` sets `section = input.activeSection`, and a proposal engagement never
carries `active_section: 'project'`). Note only.

**11 · LOW · high** — `page.tsx:2196-2207`. `beginDirectionError` is cleared only by pressing Retry.
Once set it overrides `guideHeadline`, `guideActLabel` and `guideActKey` for the life of the page —
jumping sections, editing a facet, or the discovery read changing all leave
`Couldn’t begin the Direction — …` standing on line 2 with a `Retry` where the leader belongs.
**Fix:** clear it when the guide model changes (or on `discoveryQuery.dataUpdatedAt`).

**12 · LOW · high** — `src/components/document/workflow/section-stage-line.tsx:66-70`. With
`model === null` the component still renders the sr-only `<h2>Workflow stage</h2>` and nothing else.
**Measured live** on `…d5` (the one paper R1 keeps the strip on): the surviving
`[data-section-stage-line]`'s entire `textContent` is `"Workflow stage"` — the strip prints nothing
visible, so D4's newly promoted `<h2>` names an empty region in the heading outline, immediately
before `Schedule`. **Fix:** render nothing at all (heading included) when `model` is null.

**13 · LOW · high** — `supabase/tests/document/document_state_subject_test.sql`. Two of the four legs
are asserted (relationship, project). `proposals.subject` (Shape B, `00590:235`) and `leads.subject`
(Shape C, `00590:309`) are unasserted, and Shape B is the leg finding 3 is about. **Fix:** add the two
cases.

**14 · INFO · high** — RLS and grants, **read from the catalog, not simulated with `set role`**:
`information_schema.column_privileges` shows `UPDATE` on `subject` for `authenticated` on all four
tables (inherited from the table-level grants — no column-level restriction). Row policies allow the
owning designer / studio co-member on all four: `projects_studio_update`, `proposals_design_studio_update`,
`leads_studio_update`, `designer_clients_studio_rw` (plus the pre-00582 owner policies). The write path
in `useUpdateEngagementSubject` therefore works for a co-member.
One thing worth a ruling: `guard_proposal_copy_immutability` does **not** list `subject`, so the
subject stays editable on a `sent`/`signed` proposal while `title`, `description`, every money field
and `valid_until` are frozen. Probably right for a studio-private head line — but nobody has said so.
Query keys in the hook were checked against their owners and are all real: `['document-state']`,
`['desk-engagements']`, `['desk']`, `['projects']`, `['proposals']`, `['leads']`, `['designer-clients']`.
No `admin-portal`, `client-portal` or `manufacturer-portal` source references `DocumentStateRow` or
`document_state`; the `hooks/index.ts` export and the four `Row`/`Insert`/`Update` additions in
`database.types.ts` are additive.

## Design contract

**15 · MED · high** — `src/components/document/letterhead-subject.tsx:169-186`. The printed subject is
`<p role="button" aria-label="Edit the subject line">`. `aria-label` **replaces** the element's text as
its accessible name, so a screen reader is told "Edit the subject line, button" and **never hears the
subject**. The line R4 exists to print is invisible to assistive tech. **Fix:**
``aria-label={`Edit the subject line: ${printed}`}`` — or drop the label and let the content name the
control with a visually-hidden suffix.

**16 · MED · high** — same file, same element. Measured live: `[data-letterhead-subject]` is
**20.25px** tall with no `min-h`, against the 44px target the brief asks of every new control; and it
carries **no `focus-visible:` declaration** — the very defect D2 was raised to fix one file away
(`region-head.tsx:198`, which now sets the ring explicitly). It falls back to the UA outline.
**Fix:** the letterhead's `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-[var(--color-clay)]` set, and a 44px hit box (padding, or the `::before` inset
`.da-act` already uses). The `<input>` (`:151`) likewise sets `focus:outline-none` and is ~20px tall;
its `focus:border-[var(--color-clay)]` is the only ring.

**17 · LOW · med** — `letterhead-subject.tsx:35-51`. The new `SaveDot` prints **`✓`** on success and
pairs `--color-sage` (green) with `--color-terracotta-ink` (red). V9's non-licenses name ✓ and
red/green. It is a verbatim copy of `letterhead-vitals.tsx:86-101`, so this is duplicated precedent
rather than a new invention — but it is new markup, and it is now duplicated in two files. **Fix:**
export the existing one and rule on the glyph once, or print a word.

**18 · LOW · high** — same file. `<p role="button" tabIndex={0}>` where the precedent it cites
(`LetterheadTitle`, `letterhead-vitals.tsx:561`) uses a real `<button>` — which is why this file needs
its own hand-written Enter/Space handler. Use `<button>`.

**19 · LOW · high** — `src/components/document/standing-sheet.tsx:90-105`. With no standing exceptions
the sheet still renders the empty `<ul>` for `items` **and** the `mt-4 border-t` above
`INPUT NEEDED · N`, so the door opens on a stray hairline over ~30px of white; and the sheet is titled
`Standing · 4` under an `AlertCircle` over a list that holds no exceptions at all. Visible in
`shots/discovery-door-1440.png`. **Fix:** drop the rule/margin when `items.length === 0` and title the
sheet by what it holds.

**20 · LOW · med** — `standing-sheet.tsx:113`. D1's row acts call `item.act.onAct` directly and the
sheet stays open. `DocSheet` traps Tab to the panel and covers the page with `fixed inset-0`, so
`Add Lifestyle needs` focuses the facet **behind an open modal** (`page.test.tsx` asserts the focus and
stops there). Pre-existing behaviour for exception rows; D1 makes it the primary path. **Fix:** wrap
each act so it closes the sheet first.

**21 · LOW · med** — `page.tsx:2247`. The row eyebrow is `label.split(/\s+/).pop().toUpperCase()`,
which prints `DIRECTION` over `Style direction · Client · blocks Direction` and `NEEDS` over
`Lifestyle needs · …` — the kind word collides with the stage word beside it. Visible in
`shots/discovery-door-1440.png`. Pre-existing, newly load-bearing under D1.

**22 · LOW · high** — `lens-band.tsx:312`. `+N MORE` is still `--color-terracotta-ink` while D1 moved
the sheet's input eyebrows to `--color-clay-ink` on the principle that "an open input is not an
exception". The door that names four open inputs is painted in the exception register.

**Confirmed clean:** the band is exactly **56px** at 1440 and 390, pinned at `y: 0` after a 600px
scroll (measured); `globals.css` is untouched. `<h1>` is 34px at both widths with no `tracking-`.
R3's silent heads verified live — the discovery, brief and direction `[data-region-head]`s render
**0 `<p>`** with an `sr-only` `<h2>` that keeps its `id` and `tabIndex=-1`, while the proposal spread's
`proposal`/`scope`/`vision`/`investment` heads keep **2 `<p>` each**. Rail jumps still land: both
`jumpToSection` and `scrollToRegion` scroll the region **root** and focus the heading with
`preventScroll: true`, so an `sr-only` target changes nothing. R1 verified live: **0**
`[data-section-stage-line]` on brief, discovery, direction and proposal spreads; exactly **1** on a
project spread, contained by `[data-active-section]`. `data-letterhead-vitals` is safe in
`lens-band-height.spec.ts` — the spec measures `LONG_PAPER_ID`, a **project** paper, whose vitals come
from `LetterheadVitals` (`letterhead-vitals.tsx:415`), not from the static `<p>` that `vitalsFor` can
now empty. No reduced-motion or hydration issue in the new code; the new `useBeginDirection` call and
both new `useState`s sit at `page.tsx:1682-1687`, well above the first early return at `:2363`.

## Copy

**23 · MED · med** — the owner sentence is a bare comma list with no conjunction:
`Waiting on Avery: working budget, target or hard date, style direction, lifestyle needs.` The
ruling's own example is two items. At four it reads as machine output. Consider a serial "and", or a
count past two.

**24 · LOW · high** — `document-guide.ts:397`. Lower-casing is `charAt(0).toLowerCase() + slice(1)`.
Correct for today's `DISCOVERY_INPUTS` vocabulary; any future label carrying a proper noun or acronym
will print mid-sentence with its own casing and a dropped first letter. Note only.

**25 · INFO** — `Couldn’t begin the Direction — {message}` uses the curly apostrophe (U+2019) and an
em dash ✓. `Returns this to the lead queue; nothing here is lost.` ✓ (D7's sentence is rendered
unconditionally with `aria-describedby` unconditional — verified live: the seeded paper prints the
server's refusal instead, correctly). `Open the direction` / `Begin the direction` are sentence-cased
consistently with the other rest acts ✓. Nothing in the diff says "AI" ✓. Label capitalisation after
`Waiting on Avery:` is correct ✓.

## Test gaps

**26 · MED · high** — nothing asserts what the band **prints at a width**. Every R2 assertion is on
`bandSentence()` textContent, which is 100% present in the DOM while 41% (1440) or 100% (390) of it is
clipped. This is why finding 2 shipped. Belongs in
`apps/designer-portal/e2e/document/lens-band-height.spec.ts` (it already owns this kind of
measurement): on a **guide** line assert `[data-lens-sentence]` `scrollWidth <= clientWidth` at 1440
and 390, and that `[data-lens-more]`'s right edge is inside the band's.

**27 · MED · high** — no fixture has a client name whose first token is not a first name (finding 1).
Belongs in `apps/designer-portal/src/lib/document/__tests__/document-guide.test.ts`, the
`R2 — line 2 names who is waiting on whom` describe: add `client_name: 'The Ashfords'`.

**28 · MED · high** — no test covers `subjectFor` on a **proposal** paper (finding 3). Belongs in
`apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`, beside the R4 letterhead cases.

**29 · LOW · high** — `withheld` is asserted at three open inputs (`+2 MORE`) and implicitly at zero;
there is no case at **exactly one** (band names it ⇒ no door at all) or at **five**. Belongs in
`apps/designer-portal/src/lib/document/__tests__/lens-band-derivation.test.ts`.

**30 · LOW · high** — no test covers D1's exclusion when a standing exception outranks the guide
(finding 7). Belongs in `apps/designer-portal/src/components/document/__tests__/lens-band.test.tsx`.

**31 · LOW · high** — no test asserts the subject editor's accessible name carries the printed line,
its focus ring, or its hit target (findings 15/16). Belongs in
`apps/designer-portal/src/components/document/letterhead-subject.test.tsx`.

**32 · LOW · high** — the D7 refusal case
(`discovery/__tests__/discovery-return-to-lead.test.tsx:172`) asserts only the **absence** of the
consequence sentence, never that the server's reason prints in its place.

**33 · LOW · med** — `beginDirectionError`'s persistence (finding 11) is untested. Belongs in the R5
describe in `page.test.tsx`.

## Render pass (for Fable)

- `shots/discovery-rest-1440.png` — head at 34, subject line `Full room` at 15px, silent discovery
  head, rail at `0 OF 5` (D6 working), and the truncated R2 sentence.
- `shots/discovery-rest-390.png` — the R2 sentence renders at **zero width**; `+4 MORE` bleeds off the
  paper.
- `shots/discovery-door-1440.png` / `shots/discovery-door-390.png` — D1 working: four rows, each with
  its own act, the named input correctly absent. Also shows the stray hairline (finding 19) and the
  eyebrow collision (finding 21).
- `shots/discovery-scrolled-1440.png` / `shots/discovery-scrolled-390.png` — band pinned, 56px at
  both widths.
- `shots/project-top-1440.png` / `shots/project-top-390.png` — project head, no subject line (P5),
  one stage strip that prints nothing visible (finding 12).

---

## Verdict

**Return to build.** Two HIGH findings sit in the one ruling this direction is named for: the band
prints `Waiting on **The**:` on the seeded data, and it cannot print R2's sentence at all on a phone
or in full on a desktop. Neither is a polish item — R2 is the reason the readiness band, the region
head and the stage line were all taken off the glass, and the sentence they were removed for does not
reach the reader. Findings 3–7 (the proposal-paper subject, R6's second half, the unreachable seeded
branch, the lost flush, the D1 exclusion) should come back with them; 8–33 can follow.

Everything else the program set out to do is in and provably correct: R1, R3, D2, D4, D5, D6, D7 and
A5 all verified in the built portal; the migration is byte-clean against 00327 and idempotent;
type-check and 2387 tests are green.
