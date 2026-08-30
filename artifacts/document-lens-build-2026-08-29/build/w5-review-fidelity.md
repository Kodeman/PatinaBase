# W5 fidelity review — The Smart Lens, Wave 5 ("The pre-work spreads")

Reviewer: FIDELITY (adversarial, read-only). Scope: Wave 5's own changes over
`4f803118b` on `.codex/worktrees/agent-lens-w5-int` (branch `document-lens/w5`,
read at HEAD `be8d1eaf0` — a merge of the already-reviewed W4 tip). Files: the
pre-work regions (`prework/prework-region.tsx`, `document-index.ts`,
`lens-ladder-derivation.ts`, `page.tsx` pre-work mounts, `proposal-blocks-
readonly.tsx`, `brief-section.tsx`, `discovery/discovery-section.tsx`), the
Margin sheet (`use-margin-sheet.ts`, `mobile-shell.tsx`, `mobile-sheets.tsx`,
`mobile-bar.tsx`, `mobile-margin-chips.tsx`), the inline loading register
(`section-loading-line.tsx` + six sites), and the specs `prework-regions.spec.ts`,
`mobile-margin-sheet.spec.ts`, `workflow-stage-responsive.spec.ts`,
`lens-band-height.spec.ts`'s 390 gross case.

Binding sources: `artifacts/document-lens-proposal-2026-08-28/source/proposal.md`
§2/§9, `mock/final/FINAL.md` + `index.html` (`#sheet-margin-390`),
`build/design/reconciliation.md` (DL-02, W5-R1, W5-R2, W5-R3, W4-R1),
`build/design/technical-design.md` (OD-2, OD-6, OD-11), `build/design/
deviations.md` (D-B30, D-B39).

## Verdict

**SHIP-AFTER-FIXES.** The Margin sheet (D-B30/W5-R1) and the inline loading
register (D-B39/W5-R3) are built with high fidelity — I found no daylight
between the shipped code and their rulings, down to the exact Tailwind class
strings and the group-order reversal the ruling explicitly calls out. The
pre-work regions (OD-2/DL-02/W5-R2) are correct on structure — mount order,
region keys, the four-way `scope → vision → investment` re-parenting, the
retired inline `<h2>`s, the specimen corrections (`$184,500` alone, no `20%
MARGIN`, no `CORE · STAGE 03`) — but ship one **regression of an
already-fixed, already-reviewed blocker** (F1) and one **un-ratified second
line on the rail head** that breaks an explicit "the two agree" requirement
(F2). Neither requires touching the pre-work mount order or the derivation
tables; both are confined to `prework-region.tsx`'s quiet branch and
`doc-spine.tsx`'s stage-phrase fallback / the `page.tsx` prop it's fed.
Gating IDs: **F1 (blocker), F2 (major)**. F3–F5 are minor/informational.

---

## Findings

### F1 · BLOCKER · confidence: very high — `PreworkRegion` reintroduces the exact quiet-region pattern Wave 4 was reviewed and fixed for deleting

**What ships.** `components/document/prework/prework-region.tsx:85-97`:

```tsx
{quiet ? (
  <>
    <p
      data-region-count-line
      className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
    >
      {status.toUpperCase()}
    </p>
    <p className="sr-only">Quiet — opens as you read</p>
  </>
) : (
  children
)}
```

This mounts on all seven pre-work stops — `brief`, `discovery`, `direction`,
`proposal`, `scope`, `vision`, `investment` — every time
`useLensDensityStore(region)` reads `'quiet'`. `use-lens-density.ts:67,387`
observes every `[data-index-region]` root generically (`REGION_SELECTOR =
'[data-index-region]'`), so this is not a dead branch: any pre-work spread
with more than one mounted region — the proposal spread's five-region case
is the every-walk one — puts at least one of these into `quiet` as soon as
she scrolls, on the seeded document and in production alike.

**Why this is a regression, not a fresh deviation.** `region-head.tsx:170`
already prints the status line unconditionally
(`<p className="text-[12.5px]…">{status}</p>`) — `PreworkRegion` passes
`status` straight through to `RegionHead` (`prework-region.tsx:75-83`). The
`data-region-count-line` paragraph is therefore a **second** line stating
the same fact the head just printed, in a different register (uppercase
mono vs. sentence-case body). This is word-for-word the pattern
`w4-review-fidelity.md`'s F1 blocker found and required removed from the six
main stops:

> "a quiet region today prints its head, then the pre-existing R126 status
> line, then a brand-new invented second line" — `w4-review-fidelity.md` F1

`reconciliation.md`'s **W4-R1** ruling (2026-08-29), written specifically to
close that finding, states the contract in terms that leave no room for a
reading where pre-work stops are exempt:

> "A quiet stop prints its `RegionHead` and nothing else: the head's name,
> **its own status line** (the count line IS the head's status line — **no
> second paragraph, no uppercase count strip**)… **Everything W4-L2/L3 added
> beside the head — the invented uppercase count paragraph, the generic
> 'Quiet — opens as you read' string, the full act ledger — is deleted**
> (fidelity F1–F3)."

`prework-region.tsx` ships both of the two named-and-deleted forms verbatim:
the uppercase count paragraph (`data-region-count-line`) and the literal
string `"Quiet — opens as you read"` as the sr-only line — not the ruled sr-
only form (`"<first segment of the status line> · not yet on the paper ·
press <Name> on the index to open"`, W4-R1's closing paragraph), but the
exact generic sentence W4-R1 named for deletion.

**Confirmed by the very tests Wave 4 added for this fix.** Six sibling
region-body test files assert the absence of precisely this pattern —
`previous-work.test.tsx:233,262`, `care-band.test.tsx:554,578`,
`ffe-region-head.test.tsx:546`, `schedule-region-head.test.tsx:589,612`,
`money-region.test.tsx:652,686` all run
`expect(screen.queryByText('Quiet — opens as you read')).not.toBeInTheDocument()`
and `querySelectorAll('[data-region-count-line]')` assertions on the six
project stops. **No such test exists for `prework-region.tsx`** — the Wave 5
lane appears to have built the pre-work quiet form independently, off an
older shape of the pattern, rather than off the ratified W4-R1 contract or
the sibling components it otherwise so carefully names as prior art in its
own header comment.

**Also W5-R2's own words, independently.** Point 4 of `W5-R2` states: "the
head's status line stays the segment's count line (**W5 rule, never two
lines**)." `PreworkRegion`'s quiet branch prints two.

**Not caught by `prework-regions.spec.ts`.** That spec's `statusOf()` helper
selects `h2 + p` — `RegionHead`'s own status paragraph — and never queries
for a second line or the sr-only text, so the extra paragraph is invisible
to the wave's own acceptance spec.

**Fix scope:** delete `prework-region.tsx:85-97`'s quiet branch; the ratified
form is `RegionHead`'s existing status line plus a leader act (none exist on
a pre-work stop today, consistent with `allowNoActs`) plus one sr-only line
in W4-R1's fixed form, keyed off `status`'s first segment and the stop's
`name`. Confined to one file; the mount order, the derivation tables and the
five other components are unaffected.

### F2 · MAJOR · confidence: high — the rail head prints an un-ratified second line on every pre-work spread, and does not "agree" with the band as W5-R2 requires

**What ships.** `page.tsx:2382-2384` feeds `DocSpine` a `stageWord` derived
straight from `ticketPhase`, with no pre-work fallback:

```tsx
stageWord={ticketPhase ? ticketPhase.name.toUpperCase() : null}
stageIndex={ticketPhase ? `${ticketPhase.position} OF ${ticketPhase.of}` : null}
```

`ticketPhase` (`page.tsx:1355-1364`) is derived from `scheduleFacts`/
`scheduleVitals`, which exist only once a project has a schedule — never on a
`brief`/`discovery`/`direction`/`proposal` spread. So on every pre-work
spread `stageWord` is `null`, and `doc-spine.tsx:94-99` falls back to its own,
pre-Wave-5 default:

```tsx
const stagePhrase =
  stageWord != null
    ? { top: stageWord, bottom: stageIndex }
    : activeSection
      ? { top: activeSection.label, bottom: activeSection.sub }
      : null;
```

`activeSection.sub` (`section-derivation.ts`'s `activeSub()`) is a rich,
per-key sentence never intended as a second rail line in this design: `'New'`
or `'Respond by Aug 12'` (brief), `'In discovery'` (discovery), `'Drafting'`
(direction), `'Awaiting signature'`/`'Signed · Aug 12'`/`'Declined'`/
`'Expired'` (proposal). `doc-spine.tsx:219-252` prints this as a **second**
printed span (`data-spine-stage-count`) under the stage name whenever it is
non-empty — which it always is for these four keys (every `activeSub` branch
for `brief`/`discovery`/`direction`/`proposal` returns a non-empty string).

**Contrast with the band.** `page.tsx:1881-1882` computes the band's
equivalent word with an explicit pre-work fallback that the rail head does
not share:

```tsx
const bandStageWord =
  ticketPhase?.name ?? sections.find((s) => s.state === 'active')?.label ?? '';
```

— which yields exactly `'Brief'`/`'Discovery'`/`'Direction'`/`'Proposal'`,
uppercased by `stagePhrase()` in `lens-band-derivation.ts:558-565`, and never
a second sentence.

**Why this is a defect, not a style variance.** `reconciliation.md`'s
**W5-R2** point 3 states the requirement in terms of agreement between the
two surfaces:

> "Line 1 on pre-work spreads prints no ordinal — `<CLIENT> · DISCOVERY`…
> The band's identity on brief/discovery/direction/proposal is the client
> and the spread name… **the rail head prints the stage phrase without an
> ordinal on the same spreads, so the two agree.**"

The ruling's own falsifier is "no ordinal," and the shipped rail head does
satisfy that half — but "the two agree" is a second, independent clause: the
rail head is supposed to print the *same fact* the band prints (the spread
name alone), not a spread name plus a distinct, more detailed sentence that
never appears on the band at all. On the proposal spread specifically, the
band reads `<CLIENT> · PROPOSAL` while the rail head reads `PROPOSAL` /
`AWAITING SIGNATURE` (or `SIGNED · <DATE>`, `DECLINED`, `EXPIRED` depending
on `proposal_status` — a fact with its own separate home in the print
contract, the proposal ladder stop's own `SENT <date>` register) — two
different facts on two different surfaces, the opposite of "agree."

**Not caught by the wave's own spec.** `prework-regions.spec.ts`'s "line 1
carries the client and the spread name with no ordinal" test reads
`[data-spine-stage-phrase]`'s full `.textContent()` (both spans concatenated)
and asserts only `not.toMatch(/\d+\s*OF\s*\d+/i)` — absence of a digit
pattern. `'PROPOSAL' + 'Awaiting signature'` contains no such pattern, so the
test passes with the extra line present; it was written to catch the
ordinal, not the sub-sentence.

**Fix scope:** give `DocSpine` a pre-work-aware default the same shape as
`bandStageWord` — either pass `stageWord` from `page.tsx` with the same `??
sections.find(active)?.label` fallback the band uses (so `ticketPhase` and
section-label share one derivation), or gate `doc-spine.tsx`'s
`activeSection.sub` fallback off for the four pre-work keys. Confined to
`page.tsx`'s prop or `doc-spine.tsx`'s fallback branch; no ladder or
derivation-table change needed.

### F3 · MEDIUM · confidence: high — the pre-work ladder's `scope` VALUE prints `"4 ROOMS"`, not the ruled `"4 ROOMS IN SCOPE"`

**What ships.** `lens-ladder-derivation.ts:501-514`:

```ts
function scopeRegister(facts: LadderPreworkFacts | undefined): Register {
  ...
  const word = facts.scopeRooms === 1 ? 'ROOM' : 'ROOMS';
  return {
    value: cap(`${facts.scopeRooms} ${word}`, LENS_VALUE_MAX_CHARS),
    narrowValue: cap(`${facts.scopeRooms} ${word}`, LENS_VALUE_MAX_CHARS),
    countLine: cap(`${facts.scopeRooms} ${word.toLowerCase()} in scope`, LENS_COUNT_MAX_CHARS),
    ...
  };
}
```

The paper's own `countLine` is correct — `"4 rooms in scope"` matches the
ruling's prose exactly. But **W5-R2 point 2** rules the *ladder's* mono
value with the same specificity it rules the head text, and gives a
character count that only the longer form satisfies:

> "`Scope & engagement` prints `4 rooms in scope` (**ladder value `4 ROOMS
> IN SCOPE`, 16 chars ≤ 30**) in place of `CORE · STAGE 03`."

The shipped `value` is `"4 ROOMS"` (7 characters) — the rail's mono line
under the `SCOPE & ENGAGEMENT` name reads a shorter, less specific string
than the one the ruling names and counts. This is a printed-string mismatch
on the rail a walker can see directly, not a downstream inference.

**Fix scope:** `scopeRegister`'s `value`/`narrowValue` should read
`` `${facts.scopeRooms} ${word} IN SCOPE` ``, capped the same way. One
function, no cascading changes — `investmentRegister` beside it already
matches its own ruling (`$184,500` alone, no percentage) exactly.

### F4 · MINOR / untracked deviation · confidence: medium — the mockup's margin-note composer (`CAPTURE A NOTE`, `NOTE`/`PHOTO`/`VOICE`, the textarea) is entirely unshipped at 390, with no ruling addressing its omission

The mockup's `#sheet-margin-390` (`mock/final/index.html`) prints, beside the
seven item rows: a lead act `CAPTURE A NOTE` in the sheet head, an
explanatory `margin-note` sentence, an `IN THE MARGIN · 7` sub-head, three
quick-capture buttons (`NOTE` / `PHOTO` / `VOICE`), and a `<textarea
placeholder="Write it in the margin...">` composer. `deviations.md`'s D-B30
entry quotes the mockup's row form in detail (stamp, title, owner, one
inline act) when specifying what the sheet should list, but never mentions
the capture composer as included or excluded. `reconciliation.md`'s W5-R1
(the ruling that supersedes D-B30's scope) likewise rules only the grouping,
the head string and the count — it does not address note capture at all.

The shipped `components/document/mobile/mobile-sheets.tsx`'s `sheet.kind ===
'margin'` branch (`:739-864`) has no capture affordance of any kind — no
`CAPTURE A NOTE` act, no `NOTE`/`PHOTO`/`VOICE` row, no textarea. A grep for
`CAPTURE A NOTE` across `src/` and `e2e/` returns zero hits in either
direction (no shipped UI, no test asserting its absence as a ruled cut).

Under the reconciliation doc's own stated precedence ("MOCKUP governs WHAT
PRINTS"), a mockup element with no countermanding ruling is normally taken as
adopted; here it is silently dropped. This may well be an intentional,
sensible scope cut (a write affordance is a materially different feature
from "read the whole margin," and D-B30/W5-R1 both frame the wave as making
the *existing* margin visible, not adding new capture surface) — but it is
untracked. Recommend either a short deviation entry recording the cut and
its reason, or, if it was meant to ship, a follow-up ticket.

### F5 · Informational · confidence: low — stale comment in `mobile-bar.tsx` still describes the pre-W5-R1 (letterhead-only) margin scope

`mobile-bar.tsx:130-135`'s comment reads: "the margin door … names the
letterhead- and section-anchored margin (`useLetterheadMargin`), the same
set the Margin sheet lists" — but the door's count (`marginCount`, wired
from `page.tsx`'s `useMarginSheet`) and the sheet it opens both carry the
**whole** margin (7 items) per W5-R1's amendment over D-B30's original
(letterhead-only, 4 items) scope, not `useLetterheadMargin`'s narrower set.
The code is correct; the comment documents the superseded ruling. No
walker-visible effect — noted for whoever next edits this file.

---

## What checked out clean (no finding)

- **Region names/order per spread** (DL-02/OD-2): `document-index.ts`'s
  `SECTION_PAPER_REGIONS` table matches the ruled per-section lists exactly —
  `brief → [brief, record]`, `discovery → [discovery, record]`,
  `direction → [direction, record]`, `proposal → [proposal, scope, vision,
  investment, record]`. `PREWORK_PAPER_REGIONS` labels (`'The brief'`,
  `'Discovery'`, `'Direction'`, `'The proposal'`, `'Scope & engagement'`,
  `'Design vision'`, `'The investment'`) match DL-02/W5-R2 verbatim.
- **Empty-row sentences**: `empty('Nothing yet')` (brief/discovery/direction),
  `empty('Not written yet')` (vision), `empty('Not sent yet')` (proposal
  never-sent branch), all with the ladder's `'NOTHING YET'` fallback default
  — matches OD-2's dual register (rail caps, paper sentence-case) and is
  exercised end-to-end by `prework-regions.spec.ts`.
- **Investment**: prints `$184,500`-form alone, no `20% MARGIN` — matches
  W5-R2 point 2's retirement of the percentage.
- **DOM order on the proposal spread**: `page.tsx:2625-2673` mounts
  `proposal → scope → vision → investment` with `proposalOffer` at the foot
  of `investment`, matching W5-R2 point 1's re-parenting and DOM-order
  requirement exactly.
- **The double head**: `brief-section.tsx` and `discovery/discovery-
  section.tsx` carry no inline `<h2>`; both report a distinct-fact eyebrow
  (`Respond by <date>`/`Reconnect <date>`; `Ready`/`In progress`) up to
  `PreworkRegion`'s `eyebrow` slot via the same report-up shape `onDamagedOn`
  uses elsewhere — matches W5-R2 point 4.
- **The Margin sheet** (D-B30/W5-R1): `use-margin-sheet.ts`'s `useMarginSheet`
  groups `THE WHOLE JOB` **before** `BESIDE <region>` — correctly reversing
  the mockup's own order per the ruling's explicit instruction ("W5-R1
  reverses the print order, not the grouping mechanic"). Head string `Margin
  · {count}`, `{overdueCount} overdue` sub-line, group headings `THE WHOLE
  JOB · N` / `BESIDE PIECES · N`, per-row form (kind eyebrow, title, owner,
  line label for line-anchored rows, one inline act) — all match. Door is
  the first row of More's `IN THIS DOCUMENT` list (not a fourth bar slot),
  label `Margin · N`, matching OD-11/D-B30. Line-anchored chips correctly
  retire below 980 (`mobile-margin-chips.tsx`'s `useBelow980`), desktop
  (≥980) unaffected. `aria-label="The margin"` matches the mockup's dialog
  label. Escape-to-door focus return matches the ruling's reverse-focus
  requirement.
- **The inline loading register** (D-B39/W5-R3): `SectionLoadingLine`'s
  `inline` variant classes — `inline-block h-[0.85em] w-[3ch] align-middle
  ml-[0.5ch] animate-pulse rounded-[2px] motion-reduce:animate-none` — match
  the ruling's class list token-for-token. All six named sites
  (`ffe-section.tsx` ×2, `approvals/project-approval-document.tsx`,
  `commercial/authorizations-ledger.tsx`, `schedule/schedule-spine.tsx`,
  `account-band.tsx`) place the pulse as the last inline child of the head's
  own count line or nearest printed line, `role="status" aria-live="polite"`,
  sr-only label preserved. All eight named block sites (`brief-section.tsx`,
  `brief-recap.tsx`, `discovery/discovery-recap.tsx`, `work-block.tsx`,
  `commercial/derived-budget-grid.tsx`, `accounts/accounts-book.tsx`,
  `schedule-thread-panel.tsx`, `section-stage-line-mount.tsx`) remain on the
  default `block` variant, unchanged.
- **§9 Wave 5 acceptance bullets**: `paperRegionsForSection` no longer
  returns `[]` for the four pre-work spreads (met); `shelved-spine.test.tsx`
  concern is superseded by the ladder's own tests (not independently
  re-verified here — outside this review's file list); the "no new queries…
  for brief and discovery" claim holds (both read existing `useLead`/
  discovery hooks). Not verified statically: the `…d5`/`…d6` seed's live
  numeric output (requires a running app + seeded DB, out of scope for a
  read-only code review).

## Gating

**F1** must be fixed before ship — it is a direct, provable regression of a
ruling written specifically to close an already-adjudicated blocker, visible
on every walk of a pre-work spread with more than one region. **F2** should
be fixed before ship — it breaks an explicit "the two agree" requirement and
prints operationally-irrelevant proposal-status prose (`Awaiting signature`,
`Drafting`, etc.) on the rail where the design calls for one bare stage word.
**F3** is a small, mechanical one-line fix worth taking in the same pass.
**F4** and **F5** do not block ship; F4 wants a ruling (deviation entry or a
follow-up ticket) rather than a code change, and F5 is a comment-only fix.

---

# Sign-off — `document-lens/w5-fix` @ `625e61f74` over `document-lens/w5` @ `25d2d04ba`

Reviewer: FIDELITY (adversarial, read-only). Worktree: `.codex/worktrees/agent-lens-w5-fix`.
Sources read: `build/w5-fix-log.md`; `reconciliation.md` W5-R4 (amended, ~:327-337), W5-R5
(:349-359); `deviations.md` D-B44, D-B45, D-B48. No git mutations performed.

## Table

| id | status | file:line | what prints / what changed |
|---|---|---|---|
| **F1** | **CLOSED** | `prework/prework-region.tsx:94-96`, `lib/document/lens-quiet-status.ts` (`quietStateSentence`) | The duplicate `<p data-region-count-line>` and the stock `"Quiet — opens as you read"` sr-only line are gone. A quiet pre-work stop now prints exactly `RegionHead`'s own status line (unchanged) plus one sr-only `<p>` in W4-R1's fixed form (`quietStateSentence`: `"<first segment> · not yet on the paper · press <Name> on the index to open"`, or the bare fallback sentence when the status is already `Nothing yet`/`Not known yet`). New `prework-region.test.tsx` (6 cases) drives the real density store rather than relying on jsdom geometry. Matches W4-R1 and the six sibling region tests' pattern exactly. |
| **F2** | **CLOSED** | `components/document/doc-spine.tsx:94,111-113`; `app/(document)/doc/[id]/page.tsx:2390-2392` | `DocSpine` takes a new `preWork` boolean; when true, `stagePhrase.bottom` is forced `null` regardless of `activeSection.sub`, so the rail head prints **one line** (the stage name) on brief/discovery/direction/proposal — no more `Awaiting signature`/`In discovery`/`Respond by Aug 12` second line. `page.tsx` wires `preWork={isPreWorkSection(bandSpread)}`. New e2e assertions: `[data-spine-stage-count]` count 0, and the rail stage phrase's own text is exactly one non-empty line, on `…d6`. The project paper is untouched (`preWork` defaults `false`, two lines + ordinal survive). |
| **F3** | **CLOSED, by supersession (W5-R5 §2/N2)** | `lib/document/lens-ladder-derivation.ts:504-556` | `scopeRegister` no longer builds `"N ROOMS IN SCOPE"` (my original F3). W5-R5 §2 ruled a different, better-sourced string instead: the ladder value is now `CORE · STAGE 03` (+ `· N ROOMS` when the paper has rooms), read from `facts.stageLine` — the section stage-line strip's own sub-label, with the leading `"Scope & Engagement · "` segment stripped so the stop doesn't state its own name three times. Head status line: `"Core · stage 03 · 4 rooms"`. This is the SAME string the strip itself prints, now re-parented into `scope`'s body (see N2 row). Not gated on `facts.settled` (W5-C17 — a load-time text change under the reader is exactly what W5-R3 forbids). |
| **F4** *(margin capture composer)* | **CLOSED at HEAD, with a live caveat — see NF5-01** | `components/document/mobile/mobile-sheets.tsx` `sheet.kind === 'margin'`/`'note'` branches (:783-864, :983-1073); `deviations.md` D-B44 | The mockup's `CAPTURE A NOTE` now ships, text-only, exactly as W5-R4(a) rules: head row `Margin · N` / `M overdue` / `Capture a note` (`data-margin-capture-note`) / `CLOSE` (from `Sheet`'s own chrome); pressing it opens a `DocSheet` (`aria-label="Note to the margin"`) that re-hosts the rail's own composer — same `useCreateMarginNote`, same `Note body` label, placeholder `Note to the margin…`, an optional due-date control defaulting to today, `Save`/`Discard` acts, focus explicitly returned to `data-margin-capture-note` on Save/Discard/Escape. `NOTE · PHOTO · VOICE` and the prose line are correctly not printed (no web capture path for photo/voice). **At the reviewed commit `625e61f74`** the anchor line is dynamic and correct — see next section. **But the on-disk worktree now differs from that commit** (uncommitted) in exactly this area; flagged as **NF5-01**, not folded into this row's verdict since `625e61f74` is what was named for review. |
| **F5** | **CLOSED** | `mobile-bar.tsx:132-133`, `mobile-shell.tsx:70` | Both comments now name `useMarginSheet` (the whole-margin derivation actually wired) instead of the retired `useLetterheadMargin`, and cross-reference D-B45. |
| **N1** *(title wraps at 390)* | **CLOSED** | `letterhead-vitals.tsx:487-565` (`LetterheadTitle`); `deviations.md` D-B48 | Item 11 shipped D-B48 as ruled: at rest the name is `<h1>` text (`break-words`, word-boundary wrap only — the em-dash form breaks after the dash, matching the mockup), with the visible name itself as a `<button aria-label="Rename the project" data-letterhead-title-edit>` (no second glyph); pressing swaps in the existing `<input>` in the same box, caret at the end, focus restored to the button on commit/blur; **`Escape` now restores** (`setValue(serverTitle)`) rather than blurring-and-committing, which is the one behavior D-B48 called out as backwards before this fix. `lens-band-height.spec.ts` reads the `<h1>`'s measured line count and picks the gate per D-B48's table (265/435 one line, 300/470 two lines gross) rather than asserting one number per seed. Seed `…d4` (`Aspen Loft`, one-line name, letterhead-shaped-only per the log's stated narrowing) exists in `scripts/the-document-lens-seed.sql`, is idempotent, and both one-line and two-line cases are asserted in chromium + webkit (measured figures in the fix log are all inside gate). |
| **N2** *(scope = section stage line)* | **CLOSED** | `page.tsx:2568-2578` (top-level mount gated `!isPreWorkSection`), `page.tsx:2659-2668` (mount inside `PreworkRegion region="scope"`); `e2e/document/prework-regions.spec.ts:238-265` | The stage-line strip no longer stands as a free-standing band between the band and the first head on a pre-work spread — it is now `scope`'s own body, reported up via the existing `onEyebrow`-shaped callback (`onStageLine`/`setPreworkStageLine`) so the head, the rail segment (F3, above) and the body state one fact. On a project spread the strip is unchanged (still the open section's own sub-label, R1/I114). New e2e directly walks the DOM from `[data-lens-band]`'s `nextElementSibling` (skipping zero-height nodes) and asserts the first non-zero-height thing carries `data-index-region`, with the stage-line strip found INSIDE it, not beside it. |
| **N3** *(rail/sheet group counts agree)* | **CLOSED** | `margin-rail.tsx:448-474` | Group `count` is now `rows.length + settledRows.length` (was `raised`-only), so `BESIDE PIECES · 3` on the rail agrees with the sheet's `· 3` rather than under-reporting as `· 1`. The settled fold (`N settled ↓`) moved inside each group, keyed by `group.key` (`settledOpenByGroup[group.key ?? 'whole-job']`) — folding one group's settled rows no longer touches another group's count or its own fold state, and the single global "Settled" section is gone. |
| **N4** *(proposal lead line dropped, row/act kept)* | **ACCEPTED** (matches the ruling's letter; the row/act retention is the lane's own flagged, load-bearing extrapolation) | `components/document/proposal-instruments.tsx:160-208` | The restating lead sentence (`"Sent 7 days ago — Nudge client user"`) is gone, per N4. The `DocumentActionRow` (`Nudge {family}` act, or the `stateWord` fallback when the table head has already taken the act) and its `#proposal-send-wall` anchor `<div>` remain — confirmed load-bearing: `lib/document/document-guide.ts:273,599` (`SEND_WALL_ANCHOR_ID = 'proposal-send-wall'`) sends the reader here for exactly this act; deleting the row would land the guide's focus call on nothing. This is the coordinator's question answered: **yes, keeping the row is the ruling's intent as far as the ruling's own stated purpose goes** — W5-R5 §4's text objects to the *restatement*, not to the *destination*, and the fix lane's own comment says so and flags it for the design lead's confirmation rather than asserting it silently. Not fully closed in the sense of "beyond dispute" — it is the correct reading, self-flagged, pending the design lead's yes. |
| **W5-R4** *(capture-note composer, overall)* | **OPEN — see NF5-01** | see below | Everything the ruling specifies is shipped and correct **at the reviewed commit**. The one open question the fix lane itself surfaced honestly (`build/w5-fix-log.md`, "Left for a ruling" #1) — `margin_notes.anchor_id` is a `uuid` and cannot hold a stop key — was answered at commit `12b054e33` by keeping the PRINTED anchor line and `anchorKind` dynamic (`Beside <stop>` / `'section'` vs `About the whole job` / `'letterhead'`) while forcing `anchorId: null` in both cases: the reader is told the truth about where she stood, the row simply can't carry a per-line pointer back to that stop. That is a clean, ratification-shaped resolution of the open question and I would have closed it outright. **It is not what is currently on disk** — see NF5-01. |

## NF5-01 · new finding · BLOCKER · confidence: very high — uncommitted, incomplete, self-contradicting edit removes the ruled `BESIDE <STOP>` anchor line, and breaks its own e2e spec's first assertion

**What I found.** `git status` in `.codex/worktrees/agent-lens-w5-fix` shows four files modified against `625e61f74` with no commit on top of them:

```
 M apps/designer-portal/e2e/document/mobile-margin-sheet.spec.ts
 M apps/designer-portal/src/components/document/mobile/mobile-sheets.test.tsx
 M apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx
?? apps/designer-portal/playwright.w5fix-3010.config.ts
```

(`next-env.d.ts` is a generated file, ignored.) The component and jest diffs remove the dynamic
anchor entirely — `anchorStop`/`anchorLabel` (`activeDoc?.readingIndex`-driven) are deleted, and
`"About the whole job"` becomes an unconditional literal with `anchorKind: 'letterhead'` hard-coded
(no more `anchorKind: anchorStop ? 'section' : 'letterhead'`). The jest test was updated to match
this new behavior (`mobile-sheets.test.tsx`'s two anchor cases now assert `"About the whole job"`
and explicitly `.not.toHaveTextContent('Beside')` even when `readingIndex: 'ffe'`).

**Why this is a live break, not just an undocumented deviation.** The e2e diff is *partial*: it
updates the SECOND anchor assertion in `mobile-margin-sheet.spec.ts` (after landing on Pieces,
`'Beside Pieces'` → `'About the whole job'`) and adds new group-count assertions after it, but the
FIRST anchor assertion in the same test — three tests earlier in the same file, at `:243` —
**still reads**:

```ts
await expect(
  composer.locator('[data-margin-note-anchor]'),
).toHaveText('Beside Client approvals');
```

Per the test's own comment three lines above ("At s0 on this paper the first region is already in
frame, so `data-reading-index` names it"), this is not the no-stop case — it is exercised while
`readingIndex` is `'approvals'`, so under the component's new unconditional `"About the whole job"`
output this assertion **fails**. This is not a theoretical risk: it is the literal, current,
on-disk content of a file already partway edited to move to the new behavior, with one of its two
anchor assertions missed.

**Why this matters for sign-off.** Three independent things need to move together for this
re-ruling to be safe to ship — the component, the jest test, and the e2e spec — and only two and a
half of the three have moved. None of it is committed, none of it is named in `w5-fix-log.md`
(which still lists the anchor question as "Left for a ruling" #1, unresolved, and was written
against `625e61f74`'s DYNAMIC-anchor state), and neither `reconciliation.md` nor `deviations.md`
carries a ruling for "the anchor line is always `About the whole job`, never `Beside <stop>`" —
which is a real, user-visible narrowing of what D-B44/W5-R4(a) promised the reader ("the anchor
line still tells her where she was standing when she wrote it," `12b054e33`'s own commit message).

**Fix scope:** either (a) finish the edit — fix the stale `'Beside Client approvals'` assertion at
`mobile-margin-sheet.spec.ts:243` to `'About the whole job'` and add the ARCHITECT/DESIGN LEAD
ruling this re-simplification needs (a deviation row over D-B44, since it further narrows an
already-amended ruling) — or (b) discard the four uncommitted files and ship `625e61f74` as
committed, which already has a correct, self-consistent, ratified-shaped answer to the
`anchor_id`-is-a-uuid problem (keep the printed anchor dynamic, null only the id). I have not
touched the worktree; this is reported, not corrected, per the read-only instruction.

## Verdict

**NOT SIGNED — gating: NF5-01.**

Every id the coordinator asked about — F1 through F5, N1 through N4, and W5-R4 as ruled and as
committed at `625e61f74` — is CLOSED, ACCEPTED, or (for N4) closed-in-spirit with a self-flagged
confirmation still owed to the design lead, none of which block ship on their own. The blocker is
new: the worktree's current, uncommitted state contradicts its own just-updated ruling and would
fail its own e2e spec if run as-is. Committing `625e61f74` and stopping there ships clean; the four
files sitting on top of it must not go out until the first anchor assertion is reconciled with the
new behavior and the re-ruling is written down.

---

# Sign-off 2 — `document-lens/w5-fix` @ `8073bf464` over `625e61f74`

Reviewer: FIDELITY (adversarial, read-only). Worktree: `.codex/worktrees/agent-lens-w5-fix`.
Diff reviewed: `git diff 625e61f74..8073bf464` (single commit `8073bf464`). Sources: that commit's
own message; `reconciliation.md` W5-R6 (:358-362); `deviations.md` D-B44 amendment
("Amendment (2026-08-30, ARCHITECT...) — ruling (a)"). `git status` at the end of this pass shows
only the auto-generated `next-env.d.ts` modified — the four files NF5-01 found uncommitted in the
prior pass are now committed and clean; no new drift.

## Table

| id | status | file:line | what prints / what changed |
|---|---|---|---|
| **NF5-01** | **CLOSED** | `mobile-sheets.tsx:1019-1021,1043-1047`; `mobile-sheets.test.tsx:503,526-527,552`; `e2e/document/mobile-margin-sheet.spec.ts:238-244,278-279,286-311` | Component, jest and e2e now agree, at every call site, with no stragglers: the composer always writes `anchorKind: 'letterhead'`, `anchorId: null` (the `anchorStop ? 'section' : 'letterhead'` branch is gone, not just unused) and always prints `About the whole job` — checked explicitly against `readingIndex: 'ffe'` in jest (`.not.toHaveTextContent('Beside')`) and against a live "land on Pieces" walk in e2e (both the pre-scroll and post-scroll composer opens assert the same literal string). The reload case is exercised and passes: after `openPaperAt390` a second time, the saved note is still under `[data-margin-group="whole-job"]` with `THE WHOLE JOB · 5`, and `[data-margin-group="ffe"]` still reads `BESIDE PIECES · 3` with zero copies of the note body — i.e. the note did not silently move groups on refetch. `build/w5-fix-log.md` states the consequence plainly (row **W5F-05**, "the plain statement that the capturing stop is recorded nowhere (owed migration)"), matching `deviations.md`'s D-B44 amendment and `reconciliation.md`'s W5-R6 to the letter — both name `anchor_kind: 'letterhead'` (not `'section'`) as the payload, superseding W5-R6's own text where it still said `'section'` on the payload, and both agree the *print* is `ABOUT THE WHOLE JOB` always. No remaining occurrence of `anchorStop`/`Beside ${` in the tree (`grep -rn "anchorStop\|Beside \\\${"` under `mobile/` → 0 hits outside comments explaining why it was removed). |
| **Escape / title input** | **CLOSED** | `letterhead-vitals.tsx:533-550`; `app/(document)/doc/[id]/page.tsx:1195-1209`; `hooks/use-lens-state.ts:75-83` (`isEditableTarget`, exported) | Two independent stops on the same key, both present: (1) the input's own `onKeyDown` for `Escape` calls `e.stopPropagation()` **and** `e.nativeEvent.stopImmediatePropagation()` **and** `e.preventDefault()` before restoring `serverTitle` and leaving edit mode — belt-and-suspenders because the shell's listener sits on `document`, outside React's synthetic-event tree, so React's own `stopPropagation` alone would not reach it. (2) The shell's document-level `Escape` handler (`page.tsx:1195`) now checks `isEditableTarget(e.target)` first and returns before doing anything, using the exact same selector `use-lens-state.ts` uses internally to decide the `editing` lens state — "the guard that decides `editing` and the guard that decides Put-down read one selector," per the commit message, so they cannot drift apart later. Net effect: pressing Escape while renaming restores the old name, returns focus to the name button, and does **not** navigate to `/desk`. Tested both ends: `letterhead-vitals.test.tsx:337` (restores, saves nothing) and `:355` (own key is kept, verified by firing the shell's would-be handler and confirming it never fires because the DOM event never reaches it un-stopped). |
| **Strip hosted in `scope`** | **CLOSED** | `workflow/section-stage-line.tsx:44-46,60-77`; `section-stage-line-mount.tsx:24-48` (`StageFrame`); `section-stage-line.test.tsx:197-219` | `hosted` drops exactly two things and nothing else: the `subLabel` paragraph (`Core · stage 03`, the strip's own restatement of the fact the region head already prints as its status line) and the sr-only `<h3>Workflow stage</h3>` landmark (`StageFrame` renders a bare `<div>` instead of a labelled `<section>`). What remains, hosted or not: the `<ul aria-label="Live workflow tracks">` bars, each printing `{track.label} · {track.stageNumber}` (`CORE · 03`), and `provenance` when present. So inside `scope` the fact `Core · stage 03` now prints exactly twice on the paper (the region head's own status line, sourced from the same `deriveSectionStageLine` call — see next row — plus the bars' own `CORE · 03`), not three times as before the strip's `subLabel` line was dropped. Jest (`section-stage-line.test.tsx:198-204`) asserts both the label and the eyebrow are absent when `hosted`, and a sibling case (`:210-219`) asserts both are present when not — a real behavioral contrast, not just an absence check. |
| **Strip still prints on brief/discovery/direction (W5F-02)** | **CLOSED** | `page.tsx:1703-1737,2606-2612,2700-2709` | `stageStripInScope = stageStripSpread === 'proposal'` (`:1706`) replaces the prior `isPreWorkSection(...)` gate, which wrongly suppressed the free-standing strip on all four pre-work spreads even though only `proposal` re-hosts it inside `scope`. The free-standing mount is now gated `{!stageStripInScope && <SectionStageLineMount .../>}` (`:2606`, no `hosted` prop — the section-labelled form, unchanged), which is `true` (prints) on `brief`/`discovery`/`direction`/`project`/`install`/`care`, and only `false` (suppressed) on `proposal`, where the hosted copy inside `scope`'s `PreworkRegion` (`:2700`, `hosted` prop set) takes over. `stageStripSpread` is a single `row?.active_section ?? null` read shared by both gates (W5F-03), so they read one fact and cannot disagree about which spread they're on. This is a genuine defect fix, not a redundant no-op: before this commit, brief/discovery/direction had lost the strip outright (neither mount printed it), which the coordinator's framing ("the strip still prints on brief/discovery/direction") correctly flags as the thing to re-verify. |
| **`scope`'s value identical at quiet and full (W5F-04)** | **CLOSED** | `page.tsx:1686-1699` (`preworkStageLine`); `e2e/document/prework-regions.spec.ts` new test `'W5F-04 — scope says the same thing at quiet and at full'` | `preworkStageLine` is now a pure `useMemo` keyed only on `row?.active_section`, computed via `deriveSectionStageLine(deriveSectionWorkflowStageDocument(section), {activePhaseId: null, reason: 'none'}, null, null)?.subLabel` — a table lookup with no selection, fidelity or position inputs, so it cannot depend on whether `SectionStageLineMount` (the strip) is currently mounted. This replaces an effect-based report-up (`onStageLine`) that silently broke under promotion: `PreworkRegion` unmounts its children while `quiet` (by design, W4-R1), so the child-effect path could never fire while `scope` was quiet, leaving the ladder's `CORE · STAGE 03` value and the head's status line stale or null until she scrolled to it — a text change under the reader on promotion, exactly what W5-R3 forbids. The new e2e case is a real falsifier, not a tautology: it reads `scope`'s status line, rail value, AND `data-density` at rest (asserting `density === 'quiet'`-shaped content is already `Core · stage 03`/`CORE · STAGE 03`), scrolls to promote it, asserts `data-density === 'full'` (so the test can't pass by never actually promoting), and then asserts both strings are byte-identical to what they were at rest. |

## Verdict

**SIGNED.**

Every item the coordinator named is closed, with the fix in each case verified by a test that
would fail under the prior (broken) behavior — not merely an assertion of the new string in
isolation. NF5-01's specific failure mode (component/jest/e2e disagreeing, and the e2e's own first
case going stale mid-edit) does not recur: I re-ran the same check (grep for the old
`anchorStop`/`Beside ${` pattern, and a line-by-line read of all three `About the whole job`
assertion sites including the reload path) and found the three artifacts fully synchronized this
time, with the reload path — the one NF5-01 could not have caught, since NF5-01's own reload
assertions were the *last* thing added and were themselves consistent — passing as well.
`git status` is clean (no new working-tree drift beyond the generated `next-env.d.ts`). No new
findings.
