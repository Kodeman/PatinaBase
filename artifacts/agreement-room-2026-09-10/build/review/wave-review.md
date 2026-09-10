# Wave review — the Agreement Room galley (T1 + T2 + T3 + integration)

Adversarial reviewer, fresh context; implemented none of it. Read-only on
source — nothing in the worktree was edited. This file is the only thing
written, plus the screenshots named in §7.

| | |
|---|---|
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agreement-galley` |
| Branch · tip | `agreement-room/galley` · `4035eab00` |
| Base | `7eed713b7` (origin/main) |
| Reviewed | 8 commits, 62 files, **4,133+ / 6,747−** |
| Yardsticks | `rulings.md` (worktree copy, AR-a…AM-3 + consequences) · `build/build-sheet.md` §2 T1–T3, §3 · `synthesis.md` §5 · `specimens/SPEC.md` §4 Direction I, §5, §8 · `panel/memo-critic.md` §5 (the twenty) · `docs/design/house-sheet/SPEC.md` §A · `build/review/t1-review.md` · `build/review/integration-log.md` |
| Render | local production build of the worktree, `next build --webpack` + `next start -p 3000`, flags `procurement-workspace-pilot,the-document-pilot,agreement-parts,agreement-library,design-build` all `true`, signed in as `designer@patina.dev`. Two throwaway drafts seeded (`c2ec954c-f465-45db-80c1-7f2a2301e6be` with a client attached; `34753a45-eb8f-4456-b3aa-8b90e7a946c5` with deposit and ceiling NULL). No server was serving `:3000` when I started; mine is stopped. |

**Verdict: FIX** — P1: `WR-01`, `WR-02`, `WR-03`.

Nothing here is a shipped-surface regression, every gate is green, and the
retirements are complete and clean. The three P1s are two measured acceptance
checks that fail on the built page and one acceptance check that cannot pass as
written and was never disposed of after T1's review raised it.

---

## §1 · Gates, run by the reviewer

All in the worktree, sandbox off, tails verbatim.

**`pnpm --filter @patina/designer-portal type-check`**
```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```
exit 0, no output.

**`pnpm --filter @patina/designer-portal test`** — the FULL suite, not a path filter
```
Test Suites: 568 passed, 568 total
Tests:       7106 passed, 7106 total
Snapshots:   1 passed, 1 total
Time:        26.719 s
Ran all test suites.
```
exit 0. No red, including `discovery-return-to-lead.test.tsx` — R5b/R8's
regression is genuinely fixed, not excused.

**`pnpm --filter @patina/client-portal type-check`**
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
exit 0, no output.

**`grep -rn 'box-shadow' apps/designer-portal/src/components/document/rooms/drafting/agreement`**
→ no output, exit 1. **0 hits.**

**`grep -rn 'aged-oak' …/drafting/agreement`** → no output, exit 1. **0 hits.**
T1R-01 is closed outright.

### The `disabled` audit — every native `disabled` in the room's runtime path

Tests, mocks and `__tests__` excluded. `…` = `apps/designer-portal/src/components/document`.

| file:line | element | form control (allowed) / act (not) | note |
|---|---|---|---|
| `…/rooms/drafting/agreement/part-editor.tsx` :128, :209, :329, :345, :356, :373, :396, :420, :436, :454, :479, :489, :526, :537, :554, :591, :623, :634 | `input` / `textarea` / `select` / `checkbox` | **form control** | all `disabled={readOnly}`; §A5 governs acts |
| `…/agreement/schedules/{flat,cost-plus,day-rate,package,percent,procurement}-editor.tsx` (15 sites) | `input` / `select` | **form control** | `disabled={readOnly}` |
| `…/agreement/schedules/per-phase-editor.tsx` :61, :77, :115, :127 | `input` / `Button "Add a phase"` mix | **form control** (:61, :77) | |
| **`…/agreement/schedules/per-phase-editor.tsx` :96, :105** | **`<Button>` `Move phase N up` / `down`** | **ACT — not allowed, not exempted** | see `WR-17` |
| `…/agreement/turnkey/{allowances,draws,pricing-basis,sub-disclosure,supervision}-*.tsx` (≈35 sites) | `input` / `select` / `checkbox` | **form control** | `disabled={readOnly}` |
| **`…/agreement/turnkey/jurisdiction-attachments.tsx` :78** | **`<Button>` attach-notice** | **ACT** — build sheet's "turnkey-editors (2)" plausibly covers it | `disabled={readOnly \|\| !onAttach}` |
| `…/agreement/turnkey/sub-picker.tsx` :36, :70 | `Input` search | **form control** | |
| `…/agreement/turnkey/sub-picker.tsx` :97 | `<button>` contact row | ACT — **exempt** (build sheet §T4) | |
| `…/agreement/add-part-sheet.tsx` :227, :321, :364 | `<button>` / `<Button>` | ACT — **exempt** | |
| `…/agreement/template-picker-sheet.tsx` :167, :239 | `<button>` / `<Button>` | ACT — **exempt** | |
| `…/agreement/save-as-template-action.tsx` :124 | `<Button>` | ACT — **exempt** | |
| `…/agreement/agreement-composer.tsx` :1164 | `<select>` via `ClientPicker` | **form control** | |
| `…/agreement/agreement-composer.tsx` :1238 | prop into the exempt `SaveAsTemplateAction` | ACT — **exempt** | |
| `…/agreement/agreement-composer.tsx` :1285 | `DocumentAction` + `held` | **emits no native `disabled`** — measured `disabled` absent, `aria-disabled="true"`, `tabIndex 0` (`probe heldTerminal`) | ✓ |
| `…/commercial/service-agreement-send-sheet.tsx` :206 | `Button` + `held` | **emits no native `disabled`** — measured `ad: null` when ready, and the held branch keeps it focusable | ✓ |

**Nothing in the galley proper or the send sheet ships a native `disabled`
act.** Two acts outside the sheet's exemption list do (`WR-17`), both
pre-existing on `origin/main` and untouched by this wave.

---

## §2 · Rulings honoured (brief §1)

| Ask | Verdict | Evidence |
|---|---|---|
| No "facet" on the studio's face | **PASS** | `probe structure1440.bannedText.facet === false`. `grep 'facets written'` → 0. The one `Return to the seven facets` hit left in `apps`/`packages` is a **comment** in `agreement-composer-library-off.test.tsx:18`. `facet` survives only in comments and in the unrelated **proposal** room (`drafting/drafting-room.tsx`), which §3 R10 rules out of scope and whose suite is green — the canary did not fire. |
| No return act | **PASS** | `returnedToFacets` → 0; `composedElsewhere` → 0; `AGREEMENT_PART_COPY.returnToFacets` deleted (`agreement-copy.ts` diff); `onReturnToFacets` gone. `discard_agreement_parts` survives only as an unconsumed hook — `WR-31`. |
| No seven-facet room | **PASS** | `service-agreement-drafting-room.tsx` 777 → **70 lines**; `ServiceAgreementEditor` → 0 hits anywhere. |
| Preview retired; the overlay renders the same designer body | **PASS in the room** — `probe structure1440.bannedText.preview === false`; `WholePaperSheet` mounts `ServiceAgreementPreview` → `AgreementPartsBody` → `AgreementPartSection`, the same export `GalleyPart` prints (`whole-paper-sheet.tsx:28`, `galley-part.tsx:162`). Overlay text is byte-for-byte the galley's own print (`1440-whole-paper.png`, `probe overlayText`). **One live `Preview client copy` survives outside the room** — `WR-13`. |
| Hide-a-part on every agreement, R48 refusal | **PASS** | Runtime: `Hide from the client` on 8 of 9 standard parts (`probe r48.withHide`), hiding Exclusions removed it from the paper and left a rest row with `Show to the client` (`1440-hide-exclusions.png`). R48 is enforced by *withholding the act*, `agreement-composer.tsx:857-866` — not exercised at runtime (a `design_services` fixture carries no `pricing_basis`/`draws`). |
| Review & send on the page at 1024 and 390 | **PASS** | `probe structure1024/390.sendLabel === "Send the agreement · $5,000.00 retainer"`, `sendPresent: true`. `RoomShell` no longer receives `action`/`count`. |
| The fold act word "Write" | **PASS** | `galley-part.tsx:213`, rendered on every part head and every rest row. |
| AR-g and AM-2 **not** applied to the paper | **PASS** | `agreement-parts-body.tsx` diff adds only `partDrawsNothing` + `AgreementPartSection`; `PartHeading` unchanged, no `noTotal`. Overlay prints the origin/main body for all nine fixture parts. |
| R33 — readiness names a hidden fee | **PASS** | Hiding Role rates: `#room-status` → `One thing before this can go: This fee is hidden from your client, so it cannot bill.` (`probe hideFee`, `1440-hidden-fee.png`). The *grammar* of that sentence is `WR-09`. |

---

## §3 · Strings vs synthesis §5 (brief §2)

Diffed against `synthesis.md` §5 and `SPEC.md` §5, verbatim.

| # | String | Verdict |
|---|---|---|
| 1–3 | eyebrow · h1 · `Draft` | **PASS** — `Design services agreement · V1` / `Client User` / `Draft`. AM-3 honoured: `.t-d2` at 390 too. |
| Title, 3rd state | `A draft with no client yet` | **PASS** — `agreement-composer.tsx:1121`. |
| 6 | `Prepared for … — Change the client account` | **PASS** — rendered verbatim, `.g-act--inline`. `Link a client` is the unlinked variant (`:1146`, measured on the second fixture). |
| 7 | `Only the agreement owner can change the client account.` | **PASS** as a string; **`WR-11`** on when it is attached. |
| 9 | the paper's own headline | **PASS** — `Okonkwo house — design services agreement`, `.g-paper__head`. |
| 10–12 | the Save record | **PASS on wording**, and it prints **TWICE, verbatim**: `.g-head .g-record` and `.g-fold .g-record` both read `Saved 10 September 2026, 12:13 pm` (`probe roleRatesOpen`). SPEC §4 Direction I explicitly asks for both ("the Save record sits under the prepared-for line, **with a per-part record inside each open fold**"), so this is sanctioned, not a defect — logged as `WR-19`. Dirty with no fold open yields an unpinned string — `WR-20`. |
| 13 | `One thing before this can go: name a fee.` | **PASS**, measured. |
| 14 | `One thing before this can go: name a ceiling.` | **PASS** by code (`readiness.ts:541` `{ask:"name a ceiling"}`); not reachable on this fixture (a written ceiling clears it). |
| 15 | the transition | **code present** (`readiness-voice.ts:55-57`); needs 2→1 and was not reached. 1→0 gave #17 correctly. |
| 16 | `Two things before this can go: name a fee; link a client.` | **PASS**, measured verbatim on the unlinked fixture (`probe restRows.status`). |
| 17 | `Nothing left to finish.` | **PASS**, measured (`probe afterFill`). |
| 18 | `This agreement names no fee. …` | **wording PASS, placement FAIL** — `WR-05`. |
| 19 | `An agreement that bills hourly needs a ceiling. …` | wording unchanged in `readiness.ts:543`; placement follows `ceilingPart.id`, so it *does* reach the Ceiling strip when a Ceiling part exists. |
| 21 | `THE STUDIO` | **PASS** — `.studio-note > .head`, on every strip and on `#room-status-wrap`. |
| 22 | `needs attention` | **PASS** as a string (`part-outline.tsx:84`); never rendered on this fixture (no blocker carries a `partId`). Accessible-name caveat: `WR-36`. |
| 23 | `Not written yet. Your client's copy does not print this part.` | **PASS**, measured on the unset Furnishings deposit (`probe restRows`, `1440-unset-deposit.png`). Curly apostrophe, as authored. |
| 24 | `Not yet set` | present via `AGREEMENT_PART_COPY.notYetSet`, unchanged. |
| 25/26 | the consequence sentence | **composition PASS, pronoun FAIL** — `WR-03`. Composed correctly: client-visible **written** parts only, in position order, no serial comma, money with cents, count as a word. Hiding Deliverables took it 9 → 8 parts and dropped `the deliverables`; hiding Role rates took it to 7 and dropped `the role rates` (`probe hiddenConsequence`, `hideFee`). Unwritten Role rates never named. Unnamed client → `The client receives …` ✓. |
| 27 | `Send the agreement · $5,000.00 retainer` | **PASS**, on the page and in the sheet. |
| 28 | `Read the whole paper` | **PASS**. |
| 32/33 | `+ Add a part` · `Move up`/`Move down` | **PASS**. |
| 35 | `Save as template…` | **PASS** (`save-as-template-action.tsx:130`), at the outline's foot with `Start from a template…`. |
| 39 | `Billing cadence is now part 7 of 9.` | **PASS**, measured twice running (`probe moveProbe`). |
| 40 | `Creates authority` | **PASS** at ≥1248; **suppressed below 1248 including inside the run that exists to gather it** — `WR-04`. |
| **The send sheet** | every slot | title `Send design agreement` **kept**; eyebrow + heading **cut**; consequence **composed and directly above the act**; Recipient box **cut**; Furnishings-deposit box **cut** with the caution slot carrying `The furnishings deposit is not set. Authorizations will default to 50%.` when unset (measured on the second fixture); `Ready to send · every contractual facet is present.` **cut — N4 closed**; `Finish before sending` kept verbatim; `A note to the client · optional` kept with the placeholder promoted to a `.t-meta` line; `Send later` → **`Not yet`**; `Send agreement →` → **`Send the agreement · $5,000.00 retainer`** with `held` + `aria-describedby`; `Record a signature received outside Patina` kept verbatim at the foot under its own rule. **All PASS** (`probe sendSheet`, `1440-send-sheet.png`). |

---

## §4 · Layout, behaviour, a11y — measured

**1440 bands** — `.g-room` x120 w1200 · `.g-outline` x120 **w192** · `.g-paper`
x360 **w720** · `.g-strip` x1128 **w192**. Gutters: 360−(120+192)=**48**;
1128−(360+720)=**48**. Exactly SPEC §4's `120 │ 192 │ 48 │ 720 │ 48 │ 192 │ 120`.
**PASS.**

**390** — `.g-room` w390, `.g-paper` x16 **w358**. Correct — but the *document*
is 410 wide: `WR-01`.

**1024** — `.g-room` x180 **w664**, no notes column: `WR-07`.

**Strips below 1248** — name-only strips `display:none` (measured), standings
gather into `.g-studio-run` below the paper. Correct in structure; `WR-04` on
content.

**Module** — `.g-strip{margin:24px 0}` · `.g-paper+.g-paper{margin-top:24px}` ·
`.g-part{padding-bottom:24px}` · `.g-seam{min-height:48px}` ·
`.g-galley-foot{padding-top:24px;margin-top:24px}`; half-modules (12px) only
inside a group, as §A14 allows. **PASS** (`.g-seam` 48 vs SPEC's 44 — `WR-35`).

**One status region, never empty** — `#room-status` is unconditionally mounted
inside `<header>` (`agreement-composer.tsx:1200-1210`), renders
`announcement ?? readinessVoice`, and carried a full sentence at first paint in
every state measured. **check 5/6 PASS.**

**Reserved boxes, Δ = 0px** — part *above* Role rates and Role rates itself both
moved **0px** across an unfold at **1440, 1024 and 390** (`probe delta1440/1024/390`).
Scrolled to `scrollY 900`, opening *and* closing the Billing-cadence fold left
`scrollY` at **900** and the part above at **Δ 0px** (`probe scrollPreserved`).
**check 18 PASS — D's crux is met.**

**Tab order on a middle part** — `Write → Move up → Move down → Hide from the
client`, then the fold's fields (`probe tabOrderMiddle`). **PASS.**

**Seam acts persistent and focusable** — `+ Add a part` renders at every seam
with no hover, including the seam beside the unwritten Furnishings deposit, and
is reached by Tab between `write-patina-ceiling` and `write-patina-deposit`
(`probe restRowTab`). **T2 acceptance 7 PASS.**

**One open fold at a time, keyed on `partKey`** — a single `openKey: string|null`
(`:252`); ids derived from the part key (`idsFor`, `:133`); `GalleyFold`
keyed `fold-${partKey}`. **The intent is defeated one level up by
`GalleyPart key={part.id}` — `WR-02`.**

**Fold-close persists via the whole-array RPC, only when dirty** — `toggleFold`
(`:455`) and the outline's `onSelect` (`:1225`) both guard on
`dirty && !readOnly`; `persist()` is `save.mutateAsync(parts)` =
`useSaveAgreementParts` = `upsert_agreement_parts` with the whole ordered array.
No per-keystroke and no per-part write; `useSaveAgreementPart` is only the
Library keep. **PASS.**

**A failed persist reports in `#room-status`** — the catch sets both `saveNote`
and `announcement` (`:740-741`). **Code correct; a *locally* refused save is
silent — `WR-08`.**

**`onHeldActivate` writes the reason and moves focus** — activating the held
Send wrote the blocker into `#room-status` and moved focus (to `+ Add a part`
when no blocker carries a part; to `write-patina-role-rates` when one does).
**check 8 PASS**, with `WR-27` on which blocker is named.

**Move up/down keep focus and announce, with no pointer** — with
`document.body.style.pointerEvents='none'`, two moves gave
`Billing cadence is now part 7 of 9.` then `… 6 of 9.`, and
`document.activeElement` was `head-patina-cadence-move-up` after each.
**checks 14/15 PASS.**

**Library + turnkey mount points (R7)** — `Start from a template…` and
`Save as template…` at the outline's foot (`1440-resting.png`);
`+ Add a part` → `AddPartSheet` when `libraryOn`; `Keep in my Library` /
`Remove from this agreement` inside the open fold; `PartHistoryStrip` inside the
fold under the editor (`390-services-open.png` shows `HISTORY · Edited · Leah ·
today`); the turnkey run below the paper's foot (`:1303-1330`). **PASS.**

**Headings** — one `h1` (`Client User`), `h2` for the outline and the paper's
head, `h3` per part, no level skipped, in every state. `.t-authorship` is not a
heading anywhere. **check 4 PASS · AM-2 honoured on the page.**

**Held terminal contrast (check 9)** — `#65594E` on `#E8E3DB`, `opacity: 1`,
`box-shadow: none` → **5.38:1. PASS**, and N-6 is closed.
Other measured pairs, all AA: `#room-status` `#2C2926`/`#E8E3DB` **11.4:1** ·
`.g-strip .t-head` `#4E4339`/`#E8E3DB` **7.4:1** · `.g-act--tertiary`
`#4E4339`/`#FCFAF6` **8.9:1** · `.g-consequence` `#2C2926`/`#FCFAF6` **13.7:1**.

**Pinch-zoom (check 12)** — `maximumScale` removed from `layout.tsx`. N-3 closed.

**Reduced motion / forced colours (check 20)** — 12 `prefers-reduced-motion`
rules and 1 `forced-colors` rule live in the served stylesheets. Present, thin.

**No font below 11px in the room** — 0 elements (`probe fontFloor390`).
**No `opacity` state, no truncation, no pills/badges/dots** in the galley's own
CSS. **`box-shadow` in the room's tree**: one, pre-existing and `hidden` at
1440 — `WR-33`.

**`globals.css` collisions** — checked. **None.** Every `.field*`, `.label`,
`.money-row*`, `.studio-note`, `.t-*`, `.reason` selector in the file is new
(from `:2024`); no earlier declaration of any of them; zero non-galley `className`
consumers of those tokens across `apps/*/src` and `packages/*/src`. Every new
`:root` token name is new; no pre-existing declaration, no other `var()`
consumer. **Additive as claimed** — with the layering caveat at `WR-10b`.

---

## §5 · Findings

| ID | sev | conf | file:line / shot | claim | evidence | proposed fix |
|---|---|---|---|---|---|---|
| **WR-01** | **P1** | high | `galley.css` `.g-part__acts-ghost` (`:361-369`) · `390-resting.png`, `390-services-open.png` | **The reserved act box overflows the viewport at 390: the page scrolls horizontally.** memo-critic check 13's pass condition is `scrollWidth <= clientWidth`; T2 acceptance 2 names it. | `probe structure390.scrollWH = [410, 390]`, `horizontalScroll: true`. `probe overflow390` names the culprit on **every** part: `.g-part__acts-ghost` is `display:flex` with no wrap, `left 41 → right 410`, `w 369`, holding `Move up Move down Hide from the client` at `white-space: nowrap`. The paper's content box at 390 is 310px. | Let the ghost wrap (`flex-wrap: wrap` on `.g-part__acts-ghost`, matching `.g-part__head-row`), or below 768 reserve only the tallest single row rather than the full act row, or shorten the hide label at 390. Re-assert `scrollWidth <= clientWidth` at 390 in T4. |
| **WR-02** | **P1** | high | `agreement-composer.tsx:1026` (`<GalleyPart key={part.id}>`) · also `part-outline.tsx:74` | **Every part — and the open fold inside it — remounts on every persist, because the leaf is keyed on the re-minted uuid.** This is exactly N-8/FS-26 and §3 R2, which the wave closed one level down (`GalleyFold key={fold-${partKey}}`, `openKey: partKey`) and reopened one level up. It is also T1R-11's bug class, carried from the deleted `parts-rail.tsx` into the composer rather than closed. | Typed into the open Terms fold, closed it (persist), reopened: the `<section id="part-patina-terms">` DOM node is **not the same node** (`probe afterPersistNodes.sectionSame === false`), nor is the textarea (`taSame === false`). Value survived (`"es. ZZ"`); **focus did not** — `document.activeElement` came back as `rename-patina.terms`, i.e. `GalleyPart`'s `useEffect([open])` autofocus firing on a fresh mount. The same happened persisting with the fold left open (`probe persistWhileOpen`: `sameNode:false`, `focused:false`, `selStart:0`). §3 R2's own test — "type into Services, Save, assert the textbox keeps focus and value" — fails on focus. | `key={part.partKey}` on `GalleyPart` (and on the outline's `<li>`), the same reason `GalleyFold` already uses it. `partKey` is unique within a composition (`upsert_agreement_parts` enforces it) where `id` is not stable. |
| **WR-03** | **P1** | high | `agreement-copy.ts:379` · `synthesis.md` §5 #25/#26 · `SPEC.md` §5 #25/#26 | **The consequence sentence cannot reproduce synthesis §5 #25/#26 exactly — it says `their signature` where both canonical strings say `his signature`.** T1's reviewer raised this as P1 (`T1R-02`); the integration log disposes of R1–R8 and **never dispositions T1R-02**, so build-sheet T1 acceptance 6 ("reproduces synthesis §5 strings #25 and #26 exactly") is still recorded as unmet. | Rendered: `Client User receives the eight parts … and **their** signature preserves consent; …` (`probe structure1440.consequence`, `1440-resting.png`). Code comment at `:376-378` states the choice deliberately: "The pronoun is `their` in every case: a name carries no gender". | The code is right and the string is wrong — a name carries no gender and no data supplies one. **Amend synthesis §5 #25/#26 and SPEC §5 #25/#26 to `their signature`**, record it against T1R-02, and restate acceptance 6 against the amended strings. No code change. |
| **WR-04** | P2 | high | `galley.css` `@media (max-width:1247px) { .g-strip .g-strip__standing { display:none } }` · `1024-resting.png`, `390-resting.png` | **The gathered studio run prints no standings — the very thing it gathers.** `StudioRun` renders `<aside class="g-strip g-studio-run">`, so it is itself a `.g-strip` and the blanket rule hides its `.g-strip__standing` children too. Below 1248 the run reads `THE STUDIO / Role rates · Ceiling · Retainer · Billing cadence / Furnishings deposit` with no word about what any of them does. SPEC §5 #40 asks for `Creates authority` at every width. | `probe studioRunContrast`: both `t-head g-strip__standing` nodes report `display: "none"`, `visible: false`. Visually confirmed in `1024-resting.png` and `390-resting.png`. | Scope the rule: `.g-strip:not(.g-studio-run) .g-strip__standing { display: none }`, or move the suppression onto `.g-strip--quiet`. |
| **WR-05** | P2 | high | `readiness.ts:499-505` (`add(null, …)`) · `agreement-composer.tsx:1053-1055`, `:1248-1261` · `1440-resting.png` | **The fee-floor note prints at the paper's foot, not beside the Role rates seam.** SPEC §5 #18 places it "`.studio-note` beside the Role rates seam"; D's crux (iv) is "the fee-floor note beside the Role rates seam in resting and the ceiling note beside the Ceiling seam in money, `#room-status` moving between them". The blocker is filed with `partId: null`, so `documentBlockers()` routes it to `.g-blockers` at the foot and no `.g-strip` ever carries it. Consequence: the outline's `needs attention` word (#22) also never appears on this fixture (`probe restRows.attn === []`). | `probe structure1440.footBlockers = ["The studioThis agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."]`, and no `.g-strip` contains that sentence. Visible at the paper's foot in `1440-resting.png`. | File the fee-floor blocker against the rate-card part when one exists (`add(rateCardPart?.id ?? null, …)`), the way the ceiling blocker already does at `:541`. That puts it in the Role rates strip, lights `needs attention` in the outline, and makes `heldOnPart` point at the part the reason names (see `WR-27`). |
| **WR-06** | P2 | high | `agreement-composer.tsx:1248-1261` vs `:1200-1210` · `1440-resting.png`, `1440-unset-deposit.png` | **The foot strip restates the readiness voice, immediately above the consequence sentence.** Not word for word — the voice speaks `ask`, the foot speaks `message` — but the same facts are printed twice on one page, in two identically-styled `.studio-note` blocks. On the unlinked fixture the voice says `Two things before this can go: name a fee; link a client.` and the foot prints both blockers again in full. | `probe restRows`: `status = "Two things before this can go: name a fee; link a client."`; `foot[0] = "The studio | This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee. | Link a client with an email address."`. Both visible in `1440-unset-deposit.png`. Note SPEC §5 marks #20 (`Link a client with an email address.`) as "**comment, not rendered**". | Decide which voice owns the count. If `WR-05` lands, part-filed blockers move to their strips and the foot carries only genuinely document-wide ones; the remaining duplication (the client blocker) should then follow SPEC #20 and not print at the foot at all. |
| **WR-07** | P2 | high | `galley.css` `@media (min-width:768px) and (max-width:1247px)` · `1024-resting.png` | **The 1024 band does not match SPEC §4's pinned CSS.** SPEC: `grid-template-columns: minmax(600px,1fr) 216px; column-gap: 48px; padding: 0 48px; width: 100%` — a 664 residual galley **plus a 216px notes column**, notes still marginal at 1024. Built: `width: 664px; max-width: calc(100% - 96px)` — a fixed centred column with 180px of empty margin on each side and no notes column at all. The build sheet's `studio-strip.tsx` row ("Absolute in the right margin ≥1248; in flow … below 1248") sanctions the *strip* behaviour but not the band. | `probe structure1024.roomRect = {x:180, w:664}`; `paperRect = {x:180, w:664}`. `1024-resting.png` shows the sheet centred with wide empty margins and the studio run below the paper. | A spec-vs-build-sheet conflict, not a code defect — the lane followed the build sheet. Fable to rule: either amend SPEC §4's 1024 CSS to the built band, or restore the 216px notes column at 1024 and drop `.g-strip--quiet { display:none }` down to `max-width: 767px`. |
| **WR-08** | P2 | high | `agreement-composer.tsx:725` (`if (refusedAtSave) return false;`) | **A locally-refused save is silent.** `persist()` returns `false` without touching `saveNote` or `announcement`, so closing a fold on a composition with a duplicate money variant or an unnamed rate-card role does nothing and says nothing; the record line keeps reading `… not yet saved` with no reason. `reviewAndSend()` then returns silently too. Where `refusedAtSave` has a matching readiness blocker the voice happens to cover it; `duplicateMoneyVariants` has **no** readiness blocker, so `sayWhyHeld()`'s `roomBlockers[0] ?? readiness.blockers[0]?.message` can be `undefined` and the held Send announces nothing. | Forced an unnamed rate-card role and closed the fold: `probe afterRefusedPersist` → `saveNote: []` (no `.g-reason` rendered), `record: "Saved 10 September 2026, 12:24 pm · This agreement not yet saved"`. `1440-refused-save.png`. | Give the `refusedAtSave` branch a sentence: set `saveNote` **and** `announcement` from `duplicates`/`unnamedRoles` before returning `false`, and make `sayWhyHeld()` fall back to that sentence when no blocker is available. |
| **WR-09** | P2 | high | `readiness-voice.ts:30, :60-64` · `probe afterRefusedPersist` | **The uncoded-blocker fallback produces ungrammatical sentences.** `ask` falls back to the blocker's whole `message` with only the full stop stripped, then the composer splices it into a list after a colon. Real output: `Four things before this can go: Add at least one role with an hourly rate; Every role on the rate card needs a name; name a fee; link a client.` — capitalised declaratives and imperatives mixed mid-sentence. Also seen on the R33 path: `One thing before this can go: This fee is hidden from your client, so it cannot bill.` | `probe refusalSetup.status`, `probe hideFee.status`. | Either author `ask` on every blocker `assessAgreementReadiness` can raise (there are not many), or, when any outstanding thing lacks an `ask`, drop the list form and print the messages as their own sentences instead of splicing them. §A10 wants a region that is never empty **and never wrong**. |
| **WR-10** | P2 | high | `service-agreement-send-sheet.tsx:204-217` | **`held` is passed unconditionally, so it also fires while the send is in flight.** `Button`'s `isHeld = held && (disabled \|\| loading)`, so during `send.isPending` the act becomes `aria-disabled` with **no `aria-describedby`** (the describedby is `readiness.ready ? undefined : blockerListId`) — a check-7 violation — and clicking it writes `This agreement is not ready to send yet.` into the sheet's status region, which is false. | Read from the diff; `probe sendSheet.acts` confirms `aria-describedby: null` on the ready act, and `loading` puts it on the same branch. | `held={!readiness.ready}` rather than a bare `held`, so a pending send stays a plain busy control; keep `aria-busy` for the in-flight state. |
| **WR-10b** | P2 | med | `globals.css` new block (unlayered, after `@tailwind utilities`) · `service-agreement-send-sheet.tsx:174` · `1440-send-sheet.png` | **T1R-21 now has a live consequence.** The house-sheet block is unlayered CSS emitted after the utilities layer, so `.t-meta` beats every Tailwind utility of equal specificity. The send sheet's note hint is `className="t-meta mt-1 block normal-case tracking-normal …"` — `.t-meta`'s `letter-spacing:.08em` and `font-family: var(--font-meta)` win, so `tracking-normal` is inert and the hint renders letter-spaced monospace, not the intended normal-tracking line. | Visible in `1440-send-sheet.png`: `A short personal note to accompany the agreement.` is set in the meta face with tracking. | Wrap the house-sheet block in `@layer components { … }` so utilities keep the last word, or drop the conflicting utilities at the one call site. |
| **WR-11** | P2 | high | `agreement-composer.tsx:1133-1136`, `:1150` | **A held act with no reason attached, on two paths.** (a) When `readOnly && ownsProposal`, the prepared-for act is `aria-disabled="true"` but `aria-describedby` is only set when `!ownsProposal` — a held act with no resolving reason (check 7). (b) The reason `<p id="agreement-client-reason">` is also gated on `authStatus !== "loading"`, so while auth is loading a `!ownsProposal` reader gets `aria-describedby` pointing at a node that does not exist. | Read from source; on the fixture I own the proposal, so neither path renders — code-only, high confidence in the reading. | Set `aria-describedby` whenever the act is held, and render the reason paragraph on the same condition (`!ownsProposal \|\| readOnly`), unconditionally on auth status. |
| **WR-12** | P2 | med | `doc-sheet.tsx:77-84` · `date/folio-presets.tsx:64` · `care-band.tsx:501` · `mobile/mobile-sheets.tsx:80` | **The focus-trap change is portal-wide and un-tested outside the agreement.** Dropping the `aria-disabled !== 'true'` clause is right for N-4, but `getFocusableElements` also scopes the **Calendar Folio popover** (`doc-sheet.tsx:317`), whose blocked presets are `aria-disabled` `<button>`s with no native `disabled` — Tab now stops on them, and they are the trap's `first`/`last` candidates. `care-band.tsx:501`'s permanently-inert payment row is the same shape. And `mobile-sheets.tsx:80` **still filters** `aria-disabled`, so the portal now has two focus traps that disagree. | Grepped every `aria-disabled` site outside the room: 5 non-primitive callers, of which the folio presets and the care band can sit inside a `DocSheet` scope. `folio-month-grid.tsx:188`'s cells are roving `tabIndex=-1`, so they are unaffected. | Accept the change (it is the correct reading of §A5) but land the matching change in `mobile-sheets.tsx:80`, and add one folio test asserting Tab reaches a blocked preset and its reason. Name it in the ship report as a portal-wide behaviour change, not a room change. |
| **WR-13** | P2 | med | `commercial/service-agreement-instruments.tsx:255-262` | **One live `Preview client copy` act survives AR-d.** The ruling is "Retire `Preview client copy` in D and in A"; the build sheet scopes AR-d to the agreement composer, and §3 R10 exempts only the *proposal* drafting room. `service-agreement-instruments.tsx` is neither — it is the other design-services agreement surface, and T3 already reached into it to plumb `parts`. | `grep 'Preview client copy' apps/*/src packages/*/src` → 6 hits: 1 live act here, 1 live act in the exempt `drafting-room.tsx:454`, 4 in tests. | Either retire the instruments act in this wave (the surface now has `Review & send` beside it and the whole-paper overlay one route away) or record it in the ship report as AR-d's known remainder with an owner. |
| **WR-14** | P2 | high | `agreement-parts-body.tsx:366` (`if (roles.length === 0) return <RecordedLine />`) · `partDrawsNothing` `:552-563` · `1440-resting.png` | **An unwritten rate card prints on the paper, so D's resting state does not match the specimen it was picked from.** SPEC §4 Direction I's RESTING markup is pinned on exactly this: "Role rates is unwritten, so the paper prints NOTHING; the studio rest row is what the designer reaches (R21, FS-6)". Because an empty rate card renders `Recorded with your agreement.`, `partDrawsNothing` is `false`, the galley prints an `<h3>Role rates</h3>` and that line, and the Role rates strip degrades to a name-and-standing marginal note that vanishes below 1248. This is N-12 carried, but N-12 records it as a *keepsake-vs-portal* gap, not as the specimen's own resting state. | `probe structure1440.headings` contains `H3:Role rates`; `probe restRows.printedKeys` includes `patina.role_rates`; `probe restRows.strips[1]` is `g-strip--quiet` with only `The studio / Role rates / creates authority`. `1440-resting.png` shows `Role rates` + `Recorded with your agreement.` on the paper. The rest row **does** work — measured on an unset Furnishings deposit (`1440-unset-deposit.png`) — so the mechanism is sound; only the rate card escapes it. | Ruling owed, not a code call: either `partDrawsNothing` treats a role-less rate card as silent (closing N-12 on this surface and making the specimen's resting state real), or SPEC §4's Direction I markup is amended to print the rate card at rest. The two cannot both stand. |
| **WR-15** | P2 | med | `1440-resting.png`, `1440-send-sheet.png` | **A pre-existing floating act sits on top of the studio's new right-margin strips at 1440.** The `Estimate · ROM estimate` pill overlaps the `Furnishings deposit` strip; at 390 it overlaps the open fold. The right margin was empty before this wave, so the collision is new even though the pill is not. | Visible in `1440-resting.png` (pill at ~x1080 over the strip column at x1128–1320), `1440-send-sheet.png`, `390-services-open.png`. | Offset the pill, or reserve the strip column against it. Also touches check 19 (focus never obscured by a fixed element) for anything under it. |
| **WR-16** | P2 | low | `galley.css` `.g-part__acts-live { display:none }` + `:focus-within`/`[data-selected]` reveal | **`Move up` / `Move down` / `Hide from the client` are invisible on a resting page.** A pointer reader sees only `Write` until they focus or open a part. This is not a check-17 failure (the reveal is focus-driven, not hover-driven, and the ghost holds the space so Δ stays 0), and the build sheet asks for the ghost/live pair by name — but SPEC §4's Direction I markup prints `.part__acts` unconditionally, and the reserved-but-invisible box also leaves a visible empty gap in the head row. | `probe structure1024/390.actNames1` lists only `Write` and `+ Add a part` for every part at rest. `1440-resting.png`: no move or hide act visible anywhere. | Low confidence that this is wrong — it may be the intended reading of "reserved, not revealed". Worth Kody's eye at the walk: if order and hiding are meant to be discoverable, the live box should be visible at rest and the ghost dropped. |
| **WR-17** | P2 | high | `schedules/per-phase-editor.tsx:96, :105` | **Two acts in the room's runtime path carry native `disabled` and are not on the build sheet's exemption list.** `Move phase N up` / `Move phase N down` are `<Button disabled={readOnly \|\| index === 0}>` — removed from the tab order at the ends of the list, with no `aria-disabled` and no reason, inside an open fold. The sheet exempts `add-part-sheet` (7), `template-picker-sheet` (2), `save-as-template-action` (1) and "turnkey-editors (2)"; `schedules/` is none of those. They are also glyph-only (`↑`/`↓`) at `size="sm"`. | The audit table in §1. Both lines are unchanged from `origin/main` (`per-phase-editor.tsx` shows 2 changed lines in the wave, both token renames), so this is pre-existing, not introduced. | `held` + `aria-describedby` on both, or accept them as exempt in writing and add them to the sheet's list so the standing grep has a fixed baseline. Also: the integration log's own note stands — the sheet's `disabled` grep is unsatisfiable as written and needs narrowing to acts before T5 can read it as a gate. |
| **WR-18** | P3 | high | `packages/types` | **The three copy helpers still have no direct tests, and `@patina/types` has no `test` script at all** — so `pnpm test` silently skips the package (patina-verification's own trap). T1R-03 is unresolved. | `grep -rl agreementConsequenceSentence` finds only source; `packages/types/package.json` has no `"test"`; `packages/types/src/__tests__/` holds five unrelated files. The sentence is exercised only indirectly through the composer and send-sheet suites. | Add a vitest file for `agreementCountWord` / `agreementPartNounPhrase` / `agreementConsequenceSentence` pinned to synthesis §5, and a `test` script so turbo stops skipping the package. T4's lane. |
| **WR-19** | P3 | high | `agreement-composer.tsx:1180-1186` and `galley-fold.tsx:72` | The Save record prints **twice, verbatim**, on an open fold — once under the prepared-for line, once inside the fold. Both read the same string because the header line uses `openPart?.title` and the fold uses `part.title`. | `probe roleRatesOpen`: `headerRecord === foldRecord === "Saved 10 September 2026, 12:13 pm"`. | SPEC §4 asks for both slots, so this is sanctioned — but the two are identical rather than complementary. Consider making the header record the agreement's and the fold record the part's (`Role rates not yet saved` only in the fold). |
| **WR-20** | P3 | high | `agreement-composer.tsx:1184` | Dirty with no fold open, the header record reads `Saved … · **This agreement** not yet saved` — a string synthesis §5 does not pin. Reachable after a Move up/down or a Hide, both of which set `dirty` without opening a fold. | `probe afterRefusedPersist.record`. | Pin the string in synthesis §5, or fall back to the plain `Saved …` line when nothing is open. |
| **WR-21** | P3 | high | `1440-resting.png`, `probe retainer.printed`, `probe afterFill.printed` | Money on the paper prints **without cents** — `$5,000`, `$24,000`, `$185 / hr` — against SPEC §4's "Money prints with cents, always — `$185.00`, never `$185` (TY-3)". The *sentence* money is correct (`$5,000.00`). | Rendered by the unchanged `origin/main` body, which the brief requires to stay unchanged. | Carried, not this wave's: TY-3 and the shipped body renderer disagree, and the wave was told to leave the renderer alone. Record it as owed. |
| **WR-22** | P3 | high | `galley.css` `.g-part { scroll-margin-top: 84px }` | SPEC §4 pins `scroll-margin-top: 24px`; the build uses 84 (60px sticky bar + 24 module), with the reason in a comment. Defensible and measurably harmless (Δ 0 at scroll 900), but it is an unrecorded deviation. | Source. | Amend SPEC §4 to `24px + the sticky bar`, or note it. |
| **WR-23** | P3 | high | `galley-fold.tsx:50-62` · `probe delta1440.activeEl` | The fold's **first** field is a rename input (`The name of this part`) that SPEC §4's fold markup does not contain, and `GalleyPart`'s open effect autofocuses it — so pressing `Write` on Services lands the caret in the title field, not the clause body. | `probe delta1440.activeEl = "INPUT#rename-patina.role_rates"`; `probe servicesOpen.active = "INPUT#rename-patina.services"`. | Put the rename below the editor, or focus the editor's first content field on open. |
| **WR-24** | P3 | high | `probe tapTargets` | Two acts under 44×44 (AX-17): `Link a client` (`.g-act--inline`) at **90×29**, and `Save as template…` (a design-system `type-btn-text` Button) at **147×30**. | Measured. | The inline act is a genuine conflict between SPEC's own two rules ("every act ≥44×44" vs "`.act--inline` is an act inside a sentence"); rule it. `Save as template…` should take `.g-act` metrics like its neighbour `Start from a template…`. |
| **WR-25** | P3 | high | `agreement-composer.tsx:357-360` | `setAnnouncement(null)` is called **inside** a `setReadinessVoice` updater. Updaters must be pure; React StrictMode double-invokes them, and React 19 may warn. Idempotent here, so no observed defect. | Source. | Compare outside the updater and call both setters at the effect's top level. |
| **WR-26** | P3 | high | `agreement-composer.tsx:390-427` and `:556-570` | Two effects with **no dependency array** — the marginalia placement effect and the move-focus effect run after every render, re-registering `resize`/`change` listeners and scheduling a rAF each time, in a tree with nine parts and an editor. | Source. | Depend on `[leaves.length, openKey]` and `[parts]` respectively; the marginalia effect can also observe the room with a `ResizeObserver` instead. |
| **WR-27** | P3 | high | `agreement-composer.tsx:1087-1094` · `probe heldSendOnRefusal` | The held Send announces `roomBlockers[0]` but moves focus to `heldOn`'s part — two different blockers. Measured: status `This agreement names no fee. …`, focus `write-patina-role-rates` (the rate-card blocker's part). | Probe. | Announce the blocker whose part takes focus, or focus the part the announced blocker names. `WR-05` would collapse the two. |
| **WR-28** | P3 | high | `1440-send-sheet.png` | The same act with the same label is drawn two different ways: filled clay `Button` in the sheet, filled charcoal `DocumentAction variant="terminal"` on the page. | Screenshot. | Give the sheet's terminal act the `DocumentAction` terminal treatment, so §A5's tiers read the same in both places. |
| **WR-29** | P3 | high | `service-agreement-send-sheet.tsx:180-187` | The sheet's `role="status"` renders `{result ?? held}` = empty at rest, and reserves vertical space. Check 5's amendment prefers a region that carries something at load. | `probe sendSheet.text` shows a blank line between the textarea and the consequence; visible in `1440-send-sheet.png`. | Give it a resting sentence, or collapse it until it speaks. |
| **WR-30** | P3 | med | `service-agreement-send-sheet.tsx:107` | `depositUnset = !turnkey && terms?.furnishingsDepositPercent === null` — with **no** terms row `terms?.…` is `undefined`, `=== null` is false, so a document with no terms shows no deposit caution. `service-agreement-instruments.tsx:377` reaches this path for a document with no parts. | Source. | `terms?.furnishingsDepositPercent == null`, or gate on `!terms \|\| terms.furnishingsDepositPercent === null`. |
| **WR-31** | P3 | high | `packages/supabase/src/hooks/use-agreement-parts.ts:247` | `discard_agreement_parts` and its hook survive with **no consumer** in `apps/*/src`. The ruling sheet says "The RPC itself may stay for admin use — **ruling owed at build time** on the RPC". That ruling is still owed and the log does not raise it. | grep: 4 hits, all in `packages/supabase` (hook, types, its own test). | Rule it: keep the RPC for admin and delete the client hook, or delete both. Either way, record it. |
| **WR-32** | P3 | high | `agreement/__tests__/agreement-composer-library-off.test.tsx:18` | `Return to the seven facets` survives in a file-header comment describing the retired room. Harmless, but it is the last instance of the phrase in the tree and will confuse the next `grep`. | grep. | Rewrite the comment. |
| **WR-33** | P3 | high | `probe structure1440.boxShadows` | One `box-shadow` element in the room's rendered tree: the RoomShell's `doc-elevated fixed inset-x-0 bottom-0 z-40 hidden h-[60px]` mobile bar. Pre-existing, `hidden` at 1440, outside the galley's own CSS (which greps clean). | Probe. | Nothing owed by this wave; noted so the house-sheet audit does not read the grep as a full pass. |
| **WR-34** | P3 | high | `1024-resting.png` | The reserved ghost box makes the head row **wrap** for longer titles — `Furnishings deposit` pushes `WRITE` onto a second line at 1024, where shorter titles keep it inline. Cosmetic, and the same root cause as `WR-01`. | Screenshot. | Falls out with `WR-01`'s fix. |
| **WR-35** | P3 | high | `galley.css` `.g-seam { min-height: 48px }` | SPEC §4 pins `min-height: 44px`. 48 is module-aligned and larger, so AX-17 is satisfied more generously; still a deviation from a pinned number. | Source. | Amend SPEC, or use 44. |
| **WR-36** | P3 | med | `part-outline.tsx:83-85` | `needs attention` is a `<span>` **sibling** of the row `<button>`, so it is not in the row's accessible name — a screen-reader walk of the outline hears `Services`, `Ceiling`, … with no attention word. SPEC §5 #22 calls it "the outline's attention word". | Source; not rendered on this fixture (see `WR-05`). | Move it inside the button, or reference it with `aria-describedby`. |
| **WR-37** | P3 | low | `1440-send-sheet.png` vs `probe sendSheet.text` | The sheet title `Send design agreement` is in the DOM and is the dialog's `h2`, but I could not see it painted in the panel — the panel shows only `PUT BACK · ESC`. Synthesis §5 keeps the title as a slot. | Screenshot vs text extraction. | Confirm whether `DocSheet` renders its title visually; if it is `sr-only`, synthesis §5's "sheet title *(kept)*" should say so. Pre-existing `DocSheet` behaviour, low confidence. |

### T1 and integration dispositions, confirmed

| Finding | Disposition claimed | Confirmed? |
|---|---|---|
| T1R-01 aged-oak (P1) | closed, 0 hits | **YES** — grep exit 1 |
| **T1R-02 `their signature` (P1)** | **not dispositioned anywhere** | **NO — still open → `WR-03`** |
| T1R-03 helpers untested (P2) | T4's lane | **still open → `WR-18`** |
| T1R-04 `partDrawsNothing` vs the body's filters (P2) | integration R3, fixed in the galley | **YES** — hidden Exclusions vanished from the paper at runtime; attestation never reaches `rows` |
| T1R-06 inert held classes (P2) | integration R5, deleted | **YES** — removed in the `document-action.tsx` diff, and the rendered held pair measures 5.38:1 |
| T1R-08 `asChild + held` (P2) | integration R4, fixed | **YES** — conditional spread + swallowing `onClick` on the clone |
| **T1R-11 uuid keys (P3)** | closed with `parts-rail.tsx` | **NO — the bug class moved into `agreement-composer.tsx:1026` → `WR-02`** |
| T1R-12 `agreementCountWord(0)` (P3) | — | **still open**, `agreement-copy.ts:244` unchanged |
| T1R-13 invented empty-composition sentence (P3) | — | **still open**, `agreement-copy.ts:388` |
| T1R-19 doc-sheet filters `aria-disabled` (P3) | T3, fixed | **YES** — and it has a portal-wide tail, `WR-12` |
| T1R-09/10/15/20 globals.css token deviations (P3) | — | **still open**, unchanged |
| **T1R-21 unlayered CSS beats utilities (P3)** | — | **still open, and now has a live consequence → `WR-10b`** |
| R5b / R8 `DocumentAction` erased a caller's `aria-disabled` | fixed | **YES** — `heldMark` conditional spread; `discovery-return-to-lead` green in a full-suite run |
| R6 `agreement-parts` flag | closed, no change | **YES** — the drafting room does not read it; the two surviving readers are the expected ones |
| R7 fold-close persist | whole-array, dirty-gated, failure reported | **YES on all three** — with `WR-08` on the *local* refusal path |

---

## §6 · Acceptance checks

**T1**

| # | Check | Result |
|---|---|---|
| 1 | No new native `disabled` in the room's path; every `held` act `aria-disabled` + resolved visible reason | **PASS** in the galley and the send sheet (§1 audit); `WR-11` and `WR-10` are two held acts whose reason does not resolve on a branch |
| 2 | `--ink-faint` on `--rail` ≥ 4.5:1 | **PASS** — 5.38:1 measured on the rendered held Send |
| 3 | `grep maximum-scale\|maximumScale` → 0 | **PASS** |
| 4 | Surviving `aged-oak` never on `color` | **PASS** — 0 hits at all |
| 5 | `partDrawsNothing(unsetDeposit) === true`; body byte-identical to `7eed713b7` | **PASS** — rest row rendered on the unset deposit; overlay body unchanged |
| 6 | Consequence reproduces synthesis §5 #25/#26 exactly | **FAIL — `WR-03`** |

**T2**

| # | Check | Result |
|---|---|---|
| 1 | Check 18 — Δ = 0px at 1440 **and** 390 | **PASS** — 0px at 1440, 1024 and 390, and at `scrollY 900` on both open and close |
| 2 | Check 13 — a `/review\|send/i` act at 390; 390 set not a subset of 1440 | **PARTIAL FAIL** — the act is present at 390 ✓, but the check's own pass condition `scrollWidth <= clientWidth` fails: **`WR-01`** |
| 3 | Checks 14/15 — Move up twice, pointer-events off | **PASS** |
| 4 | Checks 5/6 — status node at load, rewrites to a full sentence | **PASS** |
| 5 | Check 8 — held Send writes the reason and moves focus | **PASS**, with `WR-27` |
| 6 | Check 4 — one `h1`, one `h3` per part, no level skipped | **PASS** in every state |
| 7 | FS-6 — unset Furnishings deposit prints nothing, reachable by Tab, `+ Add a part` at its seam | **PASS** |
| 8 | Consequence directly above the terminal act, `Read the whole paper` beneath, no `Preview client copy` | **PASS in the room**; `WR-13` outside it |

**T3**

| Check | Result |
|---|---|
| The four §4 greps return nothing in the source tree | **PASS** for `Return to the seven facets` (comment only), `facets written` (0), `every contractual facet` (test comment only); **`Preview client copy` returns 2 live hits** — one exempt, one not (`WR-13`) |
| The sheet prints one consequence sentence composed from the composition | **PASS** |
| The caution slot carries the deposit sentence only when unset | **PASS** — measured both ways; `WR-30` on the no-terms edge |
| A held Send is reachable by Tab inside the sheet | **PASS** — `getFocusableElements` no longer filters `aria-disabled`; `probe sheetFocusables` lists the Send |

---

## §7 · Screenshots

All under `/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/review/`,
plus `probe.json` in the same directory (the machine-readable measurements this
report quotes). Every one was read.

```
1440-resting.png              1024-resting.png            390-resting.png
1440-services-open.png        1024-services-open.png      390-services-open.png
1440-role-rates-open.png      1024-role-rates-open.png    390-role-rates-open.png
1440-role-rates-written.png
1440-retainer-open.png
1440-after-rates.png
1440-hide-exclusions.png
1440-hidden-fee.png
1440-unset-deposit.png
1440-refused-save.png
1440-whole-paper.png          1024-whole-paper.png        390-whole-paper.png
1440-send-held.png            1024-send-held.png          390-send-held.png
1440-send-sheet.png
probe.json
```

`*-send-held.png` are the held state (the seed produces the fee floor);
`1440-send-sheet.png` is the sheet actually open, after writing a role rate to
clear the floor. `1440-unset-deposit.png` and `1440-refused-save.png` are the
second fixture (deposit and ceiling NULL, unlinked client).

---

## §8 · Verdict

**FIX.** P1: **`WR-01`** (the reserved act box scrolls the page horizontally at
390 — check 13's own pass condition), **`WR-02`** (`key={part.id}` remounts every
part and its open fold on every persist, so focus is lost mid-writing — N-8 /
FS-26 / §3 R2, and T1R-11's bug class carried rather than closed), and
**`WR-03`** (the consequence sentence cannot satisfy T1 acceptance 6 as written;
T1R-02 was raised as P1 and never dispositioned — the fix is an amendment to
synthesis §5 and SPEC §5, not to the code).

Everything else is P2 or below. The retirements are complete, the send sheet
matches synthesis §5 slot for slot, Δ = 0px holds at all three widths and under
scroll, the keyboard reorder announces and holds focus with no pointer, the
readiness voice is one permanent region that never empties, the held Send is
focusable with a resolving reason at 5.38:1, and all four gates are green with
the full 568-suite designer run — which is the gate the integration log itself
says any commit touching the primitives must use.

---
---

# Round 2 — re-review of `b2321da62`

Same reviewer, same worktree, fresh render. I implemented none of the fixes.
This section is appended; §1–§8 above are Round 1 and stand as written.

| | |
|---|---|
| Branch · tip | `agreement-room/galley` · **`b2321da62`** (was `4035eab00`) |
| New commits | `8400d9d2c` (WR- fixes) · `91ea2069f` (T4 e2e) · `4c3249749` (merge) · `b2321da62` (in-flight fix) |
| Diff since Round 1 | 14 files, **1,342+ / 149−** |
| Dispositions read | `build/review/wave-fix-log.md` (all 37) |
| Render | local production build of **this** worktree at `b2321da62`, `next start -p 3005`, same flags and env, signed in as `designer@patina.dev`. Three throwaway drafts: `ceee44a6-…` (client linked), `cecc5cf3-…` (unlinked), reusing `ceee44a6` for the concurrency probe. **Server killed at the end.** |

**Verdict: FIX** — P1: **`WR-101`**.

Every one of Round 1's three P1s is closed and I verified each on the rendered
page, not from the log. The single P1 that remains is new, and it is the same
defect class integration 2 set out to close, one layer further down: the
revision guard reconciles the room's *state* after a save lands, but nothing
serializes the saves themselves.

---

## R2 §1 · Gates, re-run by the reviewer

**`pnpm --filter @patina/designer-portal type-check`**
```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```
exit 0, no output.

**`pnpm --filter @patina/designer-portal test`** — full suite
```
Test Suites: 569 passed, 569 total
Tests:       7120 passed, 7120 total
Snapshots:   1 passed, 1 total
Time:        28.578 s
Ran all test suites.
```
exit 0. (Round 1 baseline 568 / 7106 → **+1 suite, +14 tests**.)

**`pnpm --filter @patina/client-portal type-check`** — exit 0, no output.

**`grep -rn 'box-shadow' …/drafting/agreement`** → 0 hits, exit 1.
**`grep -rn 'aged-oak' …/drafting/agreement`** → 0 hits, exit 1.

### `document.documentElement.scrollWidth` at 390 — three states

Measured on the live page, `[scrollWidth, clientWidth]`, plus every element
whose right edge passes the viewport:

| state | 390 | 1024 | 1440 | `overflowing` |
|---|---|---|---|---|
| resting | **390 / 390** | 1024 / 1024 | 1440 / 1440 | `[]` |
| Services fold open | **390 / 390** | 1024 / 1024 | 1440 / 1440 | `[]` |
| Role rates fold open | **390 / 390** | 1024 / 1024 | 1440 / 1440 | `[]` |

Round 1 measured `410 / 390`. **check 13's pass condition now holds at every
width in every state**, and `.g-part__acts-ghost` no longer appears in the
overflow list at all.

### Reflow Δ — the part above an unfold, in DOCUMENT coordinates

| width | Services fold | Role rates fold |
|---|---|---|
| 1440 | **0px** | **0px** |
| 1024 | **0px** | **0px** |
| 390 | **0px** | **0px** |

The wrap change did not cost the reserved box its job. **check 18 still passes.**

---

## R2 §2 · Every Round 1 finding, dispositioned

`✅` = I verified the close myself on the rendered page or in the diff.
`🤝` = declined, and I accept the reason. `⚠️` = declined, accepted **with a
condition**.

| ID | fix log says | my verdict | how I checked |
|---|---|---|---|
| **WR-01** | FIXED | **✅ CLOSED** | `scrollWidth === clientWidth` at 390 in all three states, `overflowing: []`. `390-resting.png`, `390-services-open.png`, `390-role-rates-open.png`. |
| **WR-02** | FIXED | **✅ CLOSED** | Not the unit test — the live page. Through a **real 4-second in-flight save** (route-delayed), `window.__sec === document.getElementById("part-patina-services")` and `window.__ta === the textarea` both stayed `true` across the landing (`probe B1-duringFlight`, `B1-afterLand`). A remount would have dropped both witnesses. |
| **WR-03** | DECLINED-ACCEPTED (orchestrator ruled `their` stands) | **🤝 ACCEPT** | I accept it, and it was always my own recommendation — a name carries no gender and no field supplies one. `agreement-copy.test.ts` now pins the sentence, which is better than the string being merely read. **The spec amendment is still owed**: `synthesis.md` §5 and `SPEC.md` §5 #25/#26 still read `his signature`, and build-sheet T1 acceptance 6 still points at them. Until those three edits land, the sheet records an unmet check for a thing that is correct. |
| **WR-04** | FIXED | **✅ CLOSED** | `probe voice390.runStandings` — both standings `display: "block"`, the run `vis: true`. `390-resting.png` reads `CREATES AUTHORITY / Role rates · Ceiling · Retainer · Billing cadence / CREATES AUTHORITY · DEPOSIT ONLY / Furnishings deposit`. |
| **WR-05** | FIXED | **✅ CLOSED** | `probe voice1440.strips[0]` is a **non-quiet** `g-strip` carrying `Role rates · creates authority · This agreement names no fee. …` — in the notes column at 1440 (`1440-resting.png`) and interrupting the sheet immediately above Role rates at 390 (`390-resting.png`). `attention: [{t:"needs attention", id:"outline-attn-patina.role_rates"}]`. D's crux (iv) is now actually met. |
| **WR-06** | FIXED | **✅ CLOSED** | `probe voice1440.foot === []` and `voice390.foot === []` while the status carries the sentence. On the unlinked fixture the foot is `[]` too, with the voice reading `Two things before this can go: name a fee; link a client.` The foot now prints only the consequence and the two acts. |
| **WR-07** | DECLINED by orchestrator ruling (one column below 1248) | **🤝 ACCEPT** | Ruled; the built band is the specimen's final rule. SPEC §4's 1024 CSS is what should be amended — **owed**, not done. |
| **WR-08** | FIXED | **✅ CLOSED** | Forced an unnamed rate-card role and closed the fold: `#room-status` and the `.g-reason` note both read `Every role on the rate card needs a name.` (`probe B5`, `1440-refused-save.png`). Round 1 had both empty. |
| **WR-10** | FIXED | **✅ CLOSED** | `held={!readiness.ready}` in the diff; a pending send no longer takes the held branch. |
| **WR-10b** | FIXED at the call site | **⚠️ ACCEPT with a condition** | The two inert utilities are gone and the class list now says what the browser does. But the **cause** — an unlayered house-sheet block emitted after `@tailwind utilities`, so every `.t-*`, `.field*`, `.money-row*` and `.studio-note` beats every utility of equal specificity — is untouched, and the fix log is right that layering it is a portal-wide change. Condition: this must reach the ship report as a live cascade hazard for the next author who writes `class="t-meta text-sm"`, not just as T1R-21 in an old review. |
| **WR-11** | FIXED | **✅ CLOSED** | `probe voice1440.heldAll` — the one held act on the page is `Send the agreement · $5,000.00 retainer`, `aria-describedby="part-patina-role-rates-blocker-0"`, **`resolves: true`**, `tabIndex: 0`. On the unlinked fixture it resolves to the fee-floor sentence. Both `agreement-client-reason` and `agreement-frozen-reason` are now unconditional in the diff. check 7 passes. |
| **WR-12** | DECLINED, owner needed | **🤝 ACCEPT** | Landing half of a portal-wide focus-trap change untested is worse than recording it. I agree. It must appear in the ship report as a **portal-wide behaviour change**, with `mobile-sheets.tsx:80` named as the surviving disagreement. |
| **WR-13** | DECLINED, AR-d's known remainder | **🤝 ACCEPT** | Retiring a live act on a second shipped surface is a product change. Needs an owner and a line in the ship report. |
| **WR-14** | DECLINED, ruling owed | **🤝 ACCEPT** | My own words; the lane may not pick. Still true on the page: `1440-resting.png` prints `Role rates / Recorded with your agreement.` at rest. The ruling is owed. |
| **WR-15** | DECLINED | **🤝 ACCEPT** | Still visible — the `ESTIMATE · ROM ESTIMATE` pill sits over the right margin in `1440-resting.png`, now beside the *taller* Role rates strip. Which component yields the margin is a ruling. |
| **WR-16** | DECLINED | **🤝 ACCEPT** | My own confidence was low and it belongs at Kody's walk. |
| **WR-17** | DECLINED, exemption-list route preferred | **⚠️ ACCEPT with a condition** | Both lines are unchanged from `origin/main`, so declining is right. But the cheap close the log names — adding them to the build sheet's exemption list — **has not been done**, so the standing `disabled` grep still has no fixed baseline and the integration log's own "unsatisfiable as written" note still stands. Condition: amend the sheet, or the next reviewer re-raises it. |
| **WR-18** | FIXED in part | **✅ CLOSED (the half that matters)** | `agreement-copy.test.ts` exists, 10 cases, inside the gate that actually runs. **🤝 ACCEPT** the declined half — adding a `test` script to `packages/types` would newly run five never-run suites, which is a verification-lane change. |
| **WR-19** | FIXED | **✅ CLOSED** | The header line is now the agreement's in every state (`Saved … · This agreement not yet saved`, `probe B1-afterLand`) and the fold's is the part's. The two are complementary rather than one string twice. |
| **WR-20** | FIXED by the same change | **✅ CLOSED as a defect** | One string in every state. The spec note is still **owed** — synthesis §5 does not pin it. |
| **WR-21** | DECLINED, carried | **🤝 ACCEPT** | The brief required the body renderer to stay unchanged; the sentence money is now pinned by test. |
| **WR-22** | DECLINED, amend SPEC | **🤝 ACCEPT** | Deliberate and documented; Δ 0 measured again. SPEC amendment **owed**. |
| **WR-23** | FIXED | **✅ CLOSED** | `probe w1440/w1024/w390.foldFirstFocus` = `{tag: "TEXTAREA", rename: null}` at all three widths. The caret lands in the clause body, not the rename input. |
| **WR-24** | FIXED in part | **✅ CLOSED (Save as template…)** | Measured **147 × 44** (was 147 × 30) and `Start from a template…` 195 × 44. **🤝 ACCEPT** the declined half — boxing `.g-act--inline` would break the sentence it sits in; SPEC's own two rules conflict and a ruling is owed. |
| **WR-25** | FIXED | **✅ CLOSED** | Comparison outside the updater; the updater is pure. |
| **WR-26** | DECLINED | **🤝 ACCEPT — and I now agree with the reason, not just the decision.** The marginalia placement genuinely must re-measure after every render, because a strip's height changes with any content change; a dependency array there would reintroduce exactly the drift N-15 exists to prevent. My Round 1 finding was wrong on the merits. |
| **WR-27** | FIXED | **✅ CLOSED** | `probe unlinkedHeldActivate` — status `This agreement names no fee. …`, focus `write-patina-role-rates`. The announced blocker and the focused part are now the same blocker. |
| **WR-28** | DECLINED | **🤝 ACCEPT** | A design-system decision. |
| **WR-29** | DECLINED, copy owed | **🤝 ACCEPT** | The resting sentence it wants does not exist yet. |
| **WR-30** | FIXED | **✅ CLOSED** | `== null` in the diff. |
| **WR-31** | DECLINED, ruling owed | **🤝 ACCEPT** | Deleting an RPC on a guess is the one irreversible option. |
| **WR-32** | FIXED | **✅ CLOSED** | Greps clean. |
| **WR-33** | DECLINED | **🤝 ACCEPT** | Pre-existing, `hidden` at 1440, outside the galley's CSS. |
| **WR-34** | DECLINED as "falls out of WR-01" | **✅ CLOSED** | It did fall out. No overflow at 1024 and the ghost wraps inside the measure. |
| **WR-35** | DECLINED, amend SPEC | **🤝 ACCEPT** | 48 is module-aligned and larger. Amendment **owed**. |
| **WR-36** | FIXED | **✅ CLOSED** | `probe voice1440.outlineDescribedby = ["outline-attn-patina.role_rates"]`; the row's accessible description now carries `needs attention`. |
| **WR-37** | DECLINED | **🤝 ACCEPT** | Pre-existing `DocSheet` behaviour; the title is the dialog's `h2`. |

**Nothing from Round 1 is STILL OPEN as a code defect.** Five things are open
as **owed paperwork**, and they are the only reason a reader of the build sheet
would still see red: the SPEC/synthesis amendments behind `WR-03`, `WR-07`,
`WR-20`, `WR-22`, `WR-35`, plus the exemption-list edit behind `WR-17`.

---

## R2 §3 · The in-flight fix, attacked

Every probe below ran against the live page with
`**/rest/v1/rpc/upsert_agreement_parts` route-delayed, so a persist was
genuinely in flight while I acted.

**B1 · type during a slow persist (4s delay) — PASSES.**
Typed `FIRST WRITE`, selected the same part from the outline (fires
`void persist()`, fold stays open), then typed
`FIRST WRITE + TYPED DURING THE FLIGHT` while it flew. After the landing:
the value is the newer prose, the paper prints it, the DOM nodes are the same
(`sameTa: true`, `sameSec: true`), and the head record still reads
`… · This agreement not yet saved` — the room kept the writing **and** told
the truth about it. The **second** save's request body carried
`{"partKey":"patina.services","payload":{"body":"FIRST WRITE + TYPED DURING THE FLIGHT"}}`,
and a reload confirmed it reached the table. The revision guard does exactly
what it says.

**B2 · reorder during a slow persist — PASSES.**
Dirtied Terms, started a save, moved Billing cadence up mid-flight. After the
landing the order is `… deposit · cadence · retainer · terms` (the move held),
`#room-status` announced `Billing cadence is now part 7 of 9.`, the Terms edit
survived (`TERMS EDIT B2`), and the record stayed dirty.

**B3 · remove during a slow persist — PASSES.**
Removed Deliverables mid-flight. The landing did **not** resurrect it
(`resurrected: false`) and the record stayed `… not yet saved`. A reload
brought it back, which is correct and honest: the removal was never saved and
the page said so — this room has no autosave.

**B4 · hide during a slow persist — PASSES.**
Hid Exclusions mid-flight; it stayed hidden through the landing and the
consequence sentence dropped to seven parts without `the exclusions`.

**B5 · a locally refused save — PASSES** (WR-08, above).

**B6 · two overlapping persists — FAILS. This is `WR-101`.**

---

## R2 §4 · New findings

| ID | sev | conf | file:line / probe | claim | evidence | proposed fix |
|---|---|---|---|---|---|---|
| **WR-101** | **P1** | med-high | `agreement-composer.tsx:757` (`const persist = async () => {`), `:768-793` · `probe concurrent`, `concurrentInDb` | **Nothing serializes `persist()`, and a reordered landing loses the write while the room reports `Saved`.** `persist()` is fired unawaited from `toggleFold` (`:455`) and the outline's `onSelect` (`:1225`), so two `upsert_agreement_parts` calls can be in flight at once. The revision guard reconciles the room's *state* per call, but it has no notion of another call. When the older save is the one the server applies **last**, the database keeps the older payload, the page keeps the newer text, and — because the newer save's landing already ran `setDirty(false)` and the older save's landing takes the stale branch, which never re-asserts `dirty` — the head record reads a clean `Saved …`. The designer's clause is gone with a green record. | Two saves, first route-delayed 5s and second 500ms so the server applies them out of order. Page after: `value: "CONCURRENT A THEN B"`, `printed: "CONCURRENT A THEN B"`, `headRecord: "Saved 10 September 2026, 1:29 pm"` — **no "not yet saved"**. Reload: `concurrentInDb: "CONCURRENT A"`. The newer prose is not in the table and nothing on the page said so. `concurrentCalls: 2`. | Serialize. Keep an in-flight promise in a ref: while one persist is outstanding, a second act does not issue an RPC — it sets a `pendingSave` flag and the outstanding call chains one more save when it resolves. Cheapest correct version is four lines around `save.mutateAsync`. Failing that, at minimum have the stale branch `setDirty(true)` unconditionally, so the room never claims a save it cannot vouch for. **Honest caveat on severity:** the *client* defect (no serialization, and a stale landing that can leave `dirty` false) is certain from the code and the probe. The *data loss* needs the server to apply the two calls out of order, which I induced with an artificial 5s/0.5s inversion; over one healthy HTTP/2 connection requests normally arrive in order. I rate it P1 anyway because the failure is silent and what it loses is a contract clause. |
| **WR-102** | P2 | high | `agreement-composer.tsx:693` (`setParts(landed)` in `applyTemplate`) · `:304` (the materialize effect) | **Two paths replace the whole composition without bumping `revision`.** `revision.current += 1` lives only in `mutate` (`:482`). `applyTemplate` sets `setParts(landed)` + `setDirty(false)` directly, so a persist already in flight resolves with `revision.current === sentAt`, takes the "the server's answer IS the paper" branch, and **overwrites the template's parts with the pre-template composition** while clearing dirty. Server-side it is worse: the stale `upsert_agreement_parts` can be applied after `materialize_agreement_template`, re-inserting the old part set over the template. The path is reachable — the picker offers four Patina templates on a stock local stack (`probe templatePicker`). The materialize effect at `:304` shares the hole but is safe in practice: it only runs when `bundle.parts.length === 0`, when nothing can be dirty. | `grep -n 'revision.current'` returns exactly three lines — `:482`, `:768`, `:774`. `setParts(` returns five — `:304`, `:483`, `:693`, `:777`, `:785`. `:304` and `:693` are the two that bypass `mutate`. I did not force the race (it needs a destructive template materialize on the fixture); the mechanism is the one `WR-101` demonstrates. | `revision.current += 1` beside `setParts(landed)` in `applyTemplate`, and beside `setParts(seeded)` in the materialize effect. One line each. Better still, route both through a small `replaceParts()` that bumps the counter, so the next path that replaces the composition cannot forget. |
| **WR-103** | P3 | high | `readiness.ts:568` (`quiet: true`) · `probe unlinked` | The client-link **remedy sentence** no longer prints anywhere on the page: `clientSentenceOnPage: false`. The voice counts it (`… link a client.`) and the prepared-for line offers the act (`Prepared for no one yet — Link a client`), so the designer is not stranded — but SPEC §5 marked #20 "comment, not rendered" for a *specimen* that had no client picker, and the product now has one fewer sentence than the send sheet's `Finish before sending` list shows. Worth a conscious nod rather than a silent consequence of `quiet`. | `probe unlinked` — `status` carries it, `foot: []`, body text does not contain `Link a client with an email address`. | None needed if it is intended; say so in the ship report. The act on the prepared-for line is a better remedy than the sentence was. |
| **WR-104** | P3 | high | `agreement-composer.tsx:1130` | `heldOnPart` is still found by `parts.find((entry) => entry.id === heldOn.partId)` — the one lookup left on `part.id` after the wave moved every other one to `partKey`. It is correct today, because `readiness` is memoized from the same render's `parts`, so the ids agree within a render. It is the last place the old invariant survives, and it will read as an oversight to the next author. | Source; `probe voice1440.heldAll` shows it resolving correctly. | Leave it and comment why it is safe, or file blockers with a `partKey` alongside `partId` so nothing in the room addresses a part by uuid. |

---

## R2 §5 · Acceptance checks, refreshed

**T1**

| # | Check | R1 | R2 |
|---|---|---|---|
| 1 | No new native `disabled` in the room's path; every held act `aria-disabled` + resolved visible reason | PASS with two unresolved branches | **PASS** — `heldAll` resolves on every held act at 1440, 390 and on the unlinked fixture |
| 2 | `--ink-faint` on `--rail` ≥ 4.5:1 | PASS (5.38:1) | **PASS** |
| 3 | `grep maximum-scale` → 0 | PASS | **PASS** |
| 4 | Surviving `aged-oak` never on `color` | PASS (0 hits) | **PASS** (0 hits) |
| 5 | `partDrawsNothing(unsetDeposit)`; body byte-identical | PASS | **PASS** |
| 6 | Consequence reproduces synthesis §5 #25/#26 exactly | **FAIL** | **PASS by ruling** — `their` stands; the spec amendment is owed |

**T2**

| # | Check | R1 | R2 |
|---|---|---|---|
| 1 | Check 18 — Δ = 0px at 1440 and 390 | PASS | **PASS** — 0px at 1440, 1024, 390, both folds, document coordinates |
| 2 | Check 13 — `/review\|send/i` act at 390; `scrollWidth <= clientWidth` | **PARTIAL FAIL** (410/390) | **PASS** — 390/390 in three states, `overflowing: []` |
| 3 | Checks 14/15 — Move up twice, pointer-events off | PASS | **PASS** — re-proved mid-flight in B2 |
| 4 | Checks 5/6 — status at load, rewrites to a full sentence | PASS | **PASS** |
| 5 | Check 8 — held Send writes the reason and moves focus | PASS with a mismatch | **PASS** — reason and focus are now the same blocker |
| 6 | Check 4 — one `h1`, one `h3` per part, no level skipped | PASS | **PASS** |
| 7 | FS-6 — unset deposit prints nothing, reachable, seam act beside it | PASS | **PASS** |
| 8 | Consequence above the terminal act, `Read the whole paper` beneath, no Preview | PASS in the room | **PASS in the room**; `WR-13` outside it |

**T3**

| Check | R2 |
|---|---|
| The four §4 greps return nothing in the source tree | **PASS** for three; `Preview client copy` still returns one live hit outside the room (`WR-13`, declined with an owner needed) |
| One composed consequence sentence in the sheet | **PASS** |
| Caution slot only when the deposit is unset | **PASS** (`WR-30` closed) |
| A held Send reachable by Tab inside the sheet | **PASS** |

**New, this round**

| Check | R2 |
|---|---|
| A write made during an in-flight save survives and reaches the table | **PASS** (B1) |
| A reorder / a removal / a hide made during an in-flight save survives | **PASS** (B2, B3, B4) |
| Two overlapping saves cannot lose a write or misreport `Saved` | **FAIL — `WR-101`** |
| A composition replaced outside `mutate` bumps the revision | **FAIL — `WR-102`** |

---

## R2 §6 · Screenshots

`/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/review-r2/`
— all read, plus `probe-r2.json` with every measurement quoted above.

```
1440-resting.png   1024-resting.png   390-resting.png
1440-services-open.png                390-services-open.png
                                      390-role-rates-open.png
1440-unlinked.png          (the unlinked fixture: two blockers, quiet client blocker)
1440-refused-save.png      (WR-08 — the refusal now speaks)
probe-r2.json
```

---

## R2 §7 · Verdict

**FIX** — P1: **`WR-101`** (overlapping persists are not serialized; a
reordered landing loses the write and the head record still reads `Saved`).
`WR-102` (P2) is one line each and is the same hole on the template path.

Round 1's three P1s are closed and I verified all three on the rendered page:
390 no longer scrolls sideways in any state, the fold and its textarea are the
same DOM nodes across a real four-second in-flight save, and `their signature`
is ruled and now pinned by test. Δ = 0px still holds at every width. The
readiness voice, the notes column and the paper's foot now divide the work the
way SPEC §5 asks — the fee-floor sentence sits beside Role rates, the outline
says `needs attention`, and the foot prints nothing it has already said. Every
held act's reason resolves. All four gates are green at 569 suites / 7120 tests.
