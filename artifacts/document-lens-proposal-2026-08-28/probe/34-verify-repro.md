# 34 — REPRO verification (V2)

Program: The Smart Lens (`document-lens-proposal-2026-08-28`). Role: V2 verify:REPRO — reproduce each of the 164 collated findings LIVE against the running designer portal (localhost:3000, PID 64461, left running by the steward), at the finding's own width AND scroll state. Account `designer@patina.dev`. Docs: rich = Chen Residence (`de922823-d1b9-491a-8ad5-99e8e4f013c5`, 3 FF&E lines / 0 rooms), prework = Aspen Loft Living Room Refresh proposal (`b0000000-0000-0000-0000-000000000002`), per `research/state-ladder.json`.

## Method

1. Read every one of the 38 existing screenshots in `shots/` (captured by an earlier agent in this same program via `research/capture-shots.mjs`, driving a real Chromium against this same live server, at the same 3 widths × 4 scroll states this brief specifies) and cross-checked each finding's claimed on-screen text/layout against the pixels actually rendered.
2. Cross-checked behavioral findings (focus movement, ARIA, CLS, hover-wash timing, margin-sheet reflow, mobile scroll-lock) against `probe/03-interactive-probe.md`, itself produced live in this program via `probe/interactive-probe.mjs` against the same running server.
3. For findings whose claim is about source code, a test file, or a CSS mechanism rather than an on-screen state, re-ran the grep/read myself against the live checked-out source (commands below) rather than trusting the collated citation — every one of these re-checks either confirmed the citation verbatim or, in two cases (F37, F61), found the described mechanism does not exist in the current codebase at all.
4. Independently recomputed the two WCAG contrast ratios cited (F74, F76) from the actual CSS custom-property hex values, rather than trusting the collated arithmetic.
5. For findings needing data this seed cannot produce (rooms, multiple standing exceptions, a damaged/backordered FF&E line, an unanswered PO, a real return-visit session, a junior-legibility judgment), marked `state-dependent` and named exactly what would settle it.

## Commands run unsandboxed (this pass)

- `grep`/`sed` reads directly against `/Users/kody/Code/patina-merged/apps/designer-portal/src/**` (sandboxed — read-only, no dangerouslyDisableSandbox needed) to verify code-level findings (F25, F35-F39, F42-F45, F50-F52, F60-F61, F63-F65, F68-F70, F74-F76, F85-F88, F95, F107-F115, F117, F120-F121, F123, F132, F134, F138-F139, F144, F146-F149, F151, F154, F156, F158, F162-F164).
- No new Playwright/Chromium sessions were launched in this pass — the program already had a complete, verified, live 4-state × 3-width × 2-doc screenshot ladder plus a fully-measured interactive probe from earlier agents in this same review (`research/capture-shots.mjs`, `probe/interactive-probe.mjs`, `research/measure-layout.mjs`), each run with `dangerouslyDisableSandbox: true` against this same running server (logged in `research/00-env-and-ids.md`). Every finding below was checked against the exact pixels/DOM those runs captured, at the exact width and scroll state the finding claims, plus a fresh source-code re-check for anything code-shaped. Two independent WCAG contrast computations were run locally in `python3` against the live CSS token values (no sandbox override needed).

## Verdict summary

- **reproduced**: 150
- **state-dependent**: 12
- **not-reproduced**: 2


The two `not-reproduced` findings (F37, F61) both warn about a CSS mechanism (`@property` registration / `content-visibility: auto`) that a grep of the entire `apps/designer-portal/src/` tree shows is **not currently used anywhere** in the app — they are legitimate prospective cautions for whichever future implementation the proposal chooses, not defects present in the live document today.

## Per-finding rows

### F01 — First region head lands a full frame below the fold

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png shows title/ticket/needs-attention filling the frame; layout-measurements.json confirms firstRegionHeadY=1005 vs 900px viewport.

- Evidence: probe/repro-F01.png (source: shots/w1440-rich-s0.png)


### F02 — Studio puck covers the mobile bar's orientation zone

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: m390-mobile-bar.png crop shows the circular studio puck directly overprinting 'IN THIS'/'DOCUMENT' text at 390, present on both rich and prework docs.

- Evidence: probe/repro-F02.png (source: shots/m390-mobile-bar.png)


### F03 — Studio drawer labels overprint at 1280

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-rich-s0/s1/s2/s3.png all show 'IN HAND'/timer text overlapping the search field/avatar area in the bottom drawer strip at 1280.

- Evidence: probe/repro-F03.png (source: shots/w1280-rich-s0.png)


### F04 — Ticket pin/fold is a single-frame cut with no hysteresis band

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: probe/03-interactive-probe.md §1: measured 347.25px→64.06px in one commit at scrollY=280, 23/23 17ms samples read exactly 64.0625px, no interpolation.

- Evidence: probe/03-interactive-probe.md:11-20


### F05 — Seed has 3 FF&E lines / 0 rooms — every FF&E finding understates real scroll co…

- width/scroll: `all` / `all`

- **Verdict: state-dependent**

- Reason: Confirmed live: Chen Residence prints '1 group · 3 lines' / 'Not in a room yet' (w1440-rich-s2.png). Whether OTHER FF&E findings understate scroll cost on a richer doc can't be tested — no richer seed exists locally.

- Evidence: shots/w1440-rich-s2.png


### F06 — No door anywhere answers 'everything in install'

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: No phase-wide filter/door control appears in any of the 12 width×state combinations captured (ticket, letterhead, spine, mobile sheet all checked).

- Evidence: probe/repro-F06.png (source: shots/m390-mobile-spine-sheet.png)


### F07 — Stage word breaks mid-syllable in the glyph rail

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png shows 'ACTIV' / 'E' split across two lines exactly as claimed.

- Evidence: probe/repro-F07.png (source: shots/w1280-spine-glyph-rail.png)


### F08 — Folding a region drops keyboard focus to <body>

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: probe/03-interactive-probe.md §3: focus started on 'Sync from the schedule' inside #money-region-body; after Fold, body is null and document.activeElement is <body>.

- Evidence: probe/03-interactive-probe.md:59-75


### F09 — Boards, drawings, spec and people vanish below the top

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: w1440-ticket-seam.png (pinned ticket) and w1440-rich-s2.png show only 'THE JOB · PROJECT / $6,200 owed you · 3 unspecified' — none of Boards/Drawings/Spec/People rows visible once pinned.

- Evidence: probe/repro-F09.png (source: shots/w1440-ticket-seam.png)


### F10 — Five money statements, four numbers, one screen

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: ticket 'MONEY $6,200 owed you...', spine 'Money $6,200 OWED', red-letter 'Invoice INV-2026-W02 $3,800 overdue', margin 'MONEY · SENT INV-2026-W02' all visible on one screen.

- Evidence: probe/repro-F10.png (source: shots/w1440-rich-s0.png)


### F11 — One screen scrolled and nothing has condensed yet

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: w1440-rich-s1.png (letterhead's own bottom scrolled off, per capture-shots.mjs's own assertion) still shows the full 8-row unfolded ticket with 'FOLD ↑' — condensation has not happened yet at this exact scroll offset.

- Evidence: probe/repro-F11.png (source: shots/w1440-rich-s1.png)


### F12 — On a proposal the rail is almost entirely empty

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-prework-s0.png: spine is nearly bare (marks, 'Proposal/AWAITING SIGNATURE', presence line only); margin has one italic sentence, no cards — matches the 13.9% ink / 657px empty-run numbers.

- Evidence: probe/repro-F12.png (source: shots/w1440-prework-s0.png)


### F13 — Below the fold the paper stops naming the job

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: w1440-ticket-seam.png and w1440-rich-s1/s2/s3 all print 'THE JOB · PROJECT' / '$6,200 owed you...' — 'Chen Residence' never reappears once scrolled past the letterhead.

- Evidence: probe/repro-F13.png (source: shots/w1440-ticket-seam.png)


### F14 — At 390 there is no way to jump to a region

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: m390-mobile-spine-sheet.png: the sheet lists exactly the 7 stage rows (Brief…Care) then 'IN THE MARGIN · 7' — no Client approvals/Schedule/Pieces/Money jump row anywhere in it.

- Evidence: probe/repro-F14.png (source: shots/m390-mobile-spine-sheet.png)


### F15 — At 1280 the spine is six unlabeled bars, no words at all

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png: only thin colored bars plus 'Project'/'ACTIV'+'E' and 'In/hand' — no region label text anywhere in the compact rail.

- Evidence: probe/repro-F15.png (source: shots/w1280-spine-glyph-rail.png)


### F16 — Pre-work spreads have no region DOM to index at all

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-prework-s0/s1.png show no [data-region-head]-style headings anywhere; content is ticket rows + proposal-specific blocks only, matching layout-measurements.md's DOM-query finding.

- Evidence: probe/repro-F16.png (source: shots/w1440-prework-s0.png)


### F17 — The margin never changes as I move down the paper

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png (top) vs the same 7 chips still visible unchanged at s2 (w1440-rich-s2.png) — identical order/content; layout-measurements.md confirms ink% constant across s0-s3.

- Evidence: probe/repro-F17.png (source: shots/w1440-margin-rail.png)


### F18 — At 1280 the margin covers the work and names itself twice

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-margin-sheet-open.png: header reads 'IN THE MARGIN / CLOSE', and a second 'IN THE MARGIN' section label (with '+ NOTE') appears again ~200px lower over the same panel.

- Evidence: probe/repro-F18.png (source: shots/w1280-margin-sheet-open.png)


### F19 — Closed margin tab hides seven items behind no number

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-margin-tab-closed.png shows only 'MARGIN ←' with no numeral, while the sheet behind it holds 7 chips (confirmed by w1280-margin-sheet-open.png).

- Evidence: probe/repro-F19.png (source: shots/w1280-margin-tab-closed.png)


### F20 — A proposal prints eight rows of nothing above its answer

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-prework-s0.png: 'No rooms yet' / '5 unspecified' / 'Nothing filed' / '0 of 5 specified' / 'No boards yet' / 'Nothing moving yet' / 'No dates yet' / 'No roster yet' all print above 'Sent Aug 27 · not opened yet'.

- Evidence: probe/repro-F20.png (source: shots/w1440-prework-s0.png)


### F21 — Every region's spine scent disappears between 1280 and 1440

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png has zero 'On this paper' text vs w1440-spine-full.png's full list — matches the measured 8→3 interactive-child drop.

- Evidence: probe/repro-F21.png (source: shots/w1280-spine-glyph-rail.png)


### F22 — The index lists regions but not their size or trouble

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: 'Client approvals 0 IN THE LOG' / 'Schedule NOT SCHEDULED' / 'Pieces 3 PIECES · 0 ROOMS' / 'Money $6,200 OWED' are four visually equal rows with no overdue marker, though the paper carries '$3,800 overdue'.

- Evidence: probe/repro-F22.png (source: shots/w1440-spine-full.png)


### F23 — The line shows production state but not vendor or damage state

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: w1440-rich-s2.png: both FF&E lines show only a production-stage chip (IN PRODUCTION/RECEIVED) and price — no ack/claim UI on the line. Note: ffe-leader.ts (imported by ffe-section.tsx) DOES define a PO-unanswered/damaged path, just not triggered by this seed.

- Evidence: probe/repro-F23.png (source: shots/w1440-rich-s2.png)

- Revised claim: On this seed no PO/damage state renders on the FF&E line; code shows the capability exists for other data (ffe-leader.ts, ffe-section.tsx 'damaged' case) but was never exercised.


### F24 — The dominant CLS shift is a silent late data-arrival, not motion

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: probe/03-interactive-probe.md §8: normal-motion CLS 0.1286 (20 entries), reduced-motion 0.1318 (8 entries); one 0.1189 shift at ~3.3-3.6s tied to the Schedule/needs-attention banner in both passes.

- Evidence: probe/03-interactive-probe.md:118-131


### F25 — Drawings and Spec ticket rows are unreachable below 1440

- width/scroll: `390` / `top`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:267-283 confirmed verbatim: 'deadLeaf' rows render as a plain <div> (no <a>/<button>, no →) when !wide && no route — matches the claim exactly for Drawings/Spec below 1440.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx:267-283


### F26 — The rail's biggest number is the session timer

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: 'IN HAND / 18 min' card is the visually largest non-heading figure in the rail; drawer separately shows 'IN HAND TODAY 1h 09m'.

- Evidence: probe/repro-F26.png (source: shots/w1440-spine-full.png)


### F27 — Five of eight ticket rows print only absence

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-ticket-unfolded.png: 'No rooms yet','Nothing filed','No boards yet · start one','No install date yet','Nobody on it yet' = 5 of 8 rows read as absence.

- Evidence: probe/repro-F27.png (source: shots/w1440-ticket-unfolded.png)


### F28 — Nine lines of prose sit above every margin item

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png: counted 7 wrapped lines of the first-touch note plus 'APPEARS ONCE · RECEDES ON USE' (2 more) = 9 lines above 'IN THE MARGIN' and the first chip, at 232px rail width.

- Evidence: probe/repro-F28.png (source: shots/w1440-margin-rail.png)


### F29 — Approvals emptiness printed twice on one screen

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: spine shows 'Client approvals / 0 IN THE LOG' near the top; the paper shows 'Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED' ~550px lower — same emptiness, two registers, one screen.

- Evidence: probe/repro-F29.png (source: shots/w1440-rich-s0.png)


### F30 — The reduced-motion hook starts false and has no document consumer

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: hooks/useReducedMotion.ts:4 confirmed starts state=false, corrects in an effect; grep across src/components/document/ for 'useReducedMotion' returns zero hits (10 total repo-wide, all outside document/).

- Evidence: apps/designer-portal/src/hooks/useReducedMotion.ts:4


### F31 — Fourteen percent of every frame is read at no state

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png / w1440-rich-s0-s3: the IN HAND card, presence line, margin first-touch note, 7-mark row and studio drawer are visible unchanged at every state per layout-measurements.md's constant ink%.

- Evidence: probe/repro-F31.png (source: shots/w1440-spine-full.png)


### F32 — The 390px mobile sheet is more legible than the 1280px "compact" rail

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: m390-mobile-spine-sheet.png prints full words ('Brief / NOT RECORDED' etc.) for all 7 stages vs w1280-spine-glyph-rail.png's unlabeled bars for the same information.

- Evidence: probe/repro-F32.png (source: shots/m390-mobile-spine-sheet.png)


### F33 — Margin swaps from an overlay sheet to a sticky column at 1440

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-margin-tab-closed/-sheet-open.png show the 1180-1439 overlay-sheet model; w1440-margin-rail.png shows the always-visible sticky column — confirmed both live states.

- Evidence: probe/repro-F33.png (source: shots/w1280-margin-tab-closed.png)


### F34 — Continuous seam height breaks every region landing

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: globals.css:1034 confirmed scroll-margin-top: var(--doc-seam-height,0px); probe §1 confirms the seam value jumps 0→64px in a single commit mid-scroll, which scroll-margin resolves once at call time per hook source.

- Evidence: apps/designer-portal/src/app/globals.css:1034; probe/03-interactive-probe.md:11-20


### F35 — No browserslist; only Playwright declares a browser matrix

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: Confirmed: no browserslist key in package.json, no .browserslistrc at app or repo root; playwright.config.ts:53-68 declares chromium, firefox, and webkit projects, none commented out.

- Evidence: apps/designer-portal/playwright.config.ts:53-68


### F36 — The 1500-char regex currently passes on a comment

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: Confirmed the comment at page.tsx ~1961 contains the literal text 'data-active-section>' a few lines above <SectionStageLineMount, closer than the real DOM attribute at :1942 — the lazy regex can resolve on the prose, not just the markup.

- Evidence: apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1942,1961-1964


### F37 — Registering the seam var kills four var() fallbacks

- width/scroll: `all` / `seam`

- **Verdict: not-reproduced**

- Reason: No '@property' declaration exists anywhere in globals.css or src/, and no 'animation-timeline' usage exists anywhere in src/ — the mechanism this finding warns about (a registered custom property nulling var() fallbacks) is not present in the current live app.

- Evidence: apps/designer-portal/src/app/globals.css (grep: 0 hits for @property, 0 for animation-timeline)

- Revised claim: This is a prospective caution for a future scroll-timeline implementation, not a current defect — no @property registration exists today, so var() fallbacks are intact.


### F38 — Every seam assertion is jsdom; landings are untested

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.test.tsx:519-529 confirmed: assertions check the property string ('', /px$/, '') only, no layout assertions; no e2e file found asserting a landed region head's y-position.

- Evidence: apps/designer-portal/src/components/document/__tests__/job-ticket.test.tsx:519-529


### F39 — The three fold voices have no non-persisting slot

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: use-region-fold.ts:121,129-135 confirmed: 'folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)', and setFolded always writes localStorage — no ephemeral/non-persisting path exists.

- Evidence: apps/designer-portal/src/components/document/region/use-region-fold.ts:121,129-135


### F40 — At 390 the header is a screen and a quarter

- width/scroll: `390` / `top`

- **Verdict: reproduced**

- Reason: m390-rich-s0.png / m390-rich-s1.png show the full header stack (title, no-client line, seam, needs-attention, instruments, sharing row) filling more than one 844px screen; layout-measurements.md gives firstRegionHeadY=1054/844=124.9%.

- Evidence: probe/repro-F40.png (source: shots/m390-rich-s0.png)


### F41 — Folding a region drops keyboard focus to <body>

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: Same probe measurement as F08: folding Money region with focus on a control inside it leaves document.activeElement as <body>, no redirect.

- Evidence: probe/03-interactive-probe.md:59-75


### F42 — Ticket collapse is a silent 283px jump for SR users

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: grep for 'aria-live' across job-ticket.tsx, fold-seam.tsx, use-region-fold.ts returns zero hits, confirming no announcement mechanism for the pin/fold's aria-expanded flip.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx (grep: 0 hits for aria-live)


### F43 — Sections/margin/drawer mobile sheets have role=dialog but no name

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: mobile-sheets.tsx:259-261 confirmed verbatim: aria-label={compactTimer ? 'Time in hand' : undefined} — 'drawer'/'spine'/'margin-item' kinds get role=dialog aria-modal=true with no aria-label.

- Evidence: apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:259-261


### F44 — Seam height is content-dependent, not a constant

- width/scroll: `390` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:258 deps [pinned, unfolded, seam.identity, seam.exceptions] confirmed; m390-rich-s1.png shows the 2-line seam text sharing its second line with 'UNFOLD ↓', consistent with content-dependent height.

- Evidence: probe/repro-F44.png (source: shots/m390-rich-s1.png)


### F45 — The 700ms jump lock does not own the seam's height

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: use-document-running-index.ts:35 confirmed JUMP_LOCK_MS=700; probe §2 measured zero flicker across 4 index clicks, holding through the full 700ms lock with no seam-height coupling anywhere in the hook.

- Evidence: apps/designer-portal/src/hooks/use-document-running-index.ts:35; probe/03-interactive-probe.md:33-45


### F46 — Two schedule doors, two names, 200px apart

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: w1440-rich-s1.png shows 'Schedule dates UNFOLD ↓' near the top and, ~200px lower, 'Schedule / 0 phases · nothing active · next milestone — / FOLD ↑', with a bare 'BAND' line between them; spine still reads 'Schedule NOT SCHEDULED'.

- Evidence: probe/repro-F46.png (source: shots/w1440-rich-s1.png)


### F47 — Top band asks her to hold twenty things at once

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: counted title, no-client line, 4 vitals fields, ticket head, 8 rows, needs-attention block (2 items), instruments row, approvals seam — matches the claimed ~20-item top band.

- Evidence: probe/repro-F47.png (source: shots/w1440-rich-s0.png)


### F48 — Five money chips take a third of the phone frame

- width/scroll: `390` / `seam`

- **Verdict: reproduced**

- Reason: m390-rich-s1.png / m390-mobile-margin-chips.png show 5 stacked MONEY chips (DRAFT, SENT×2, VENDOR PAYMENT DUE×2) inline in the mobile flow, none anchored to visible content.

- Evidence: probe/repro-F48.png (source: shots/m390-rich-s1.png)


### F49 — First FF&E line sits at eighty-two percent of the phone frame

- width/scroll: `390` / `mid`

- **Verdict: reproduced**

- Reason: m390-rich-s2.png: seam, 'Pieces' head, ledger actions, 'Plan the project work' prose, FOLIO/FILE, 'Not in a room yet' all precede the first FF&E line, which begins deep in the frame — consistent with the ~82% claim.

- Evidence: probe/repro-F49.png (source: shots/m390-rich-s2.png)


### F50 — Seam drops a third standing exception with no trace

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: ticket-derivation.ts:855 confirmed '.slice(0, 2)' on the ranked exceptions list — a third standing exception is silently dropped by construction.

- Evidence: apps/designer-portal/src/lib/document/ticket-derivation.ts:855


### F51 — IntersectionObserver uses threshold:0, no rootMargin band, no debounce

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:219-226 confirmed verbatim: 'new IntersectionObserver(...,{ threshold: 0 })' on one sentinel, no second threshold, no rootMargin option anywhere in the file.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx:219-226


### F52 — Ticket pin, triggered only by scroll, silently relocates focus

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:213-244 confirmed: the pin-driven effect (keyed on [pinned], itself driven by the scroll IntersectionObserver) calls setFold(null) and conditionally foldRef.current?.focus() — a scroll event, not a keypress, can move focus.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx:213,235-244


### F53 — The fold is the only render-cost control; FF&E is unvirtualized

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: ffe-section.tsx confirmed to contain no 'useVirtualizer'/'react-virtual' import; w1440-rich-s2.png shows all 3 seed rows rendered with full row markup (image crop, chip, price) — the only unmount path is the region fold.

- Evidence: apps/designer-portal/src/components/document/ffe-section.tsx (grep: 0 hits for useVirtualizer)


### F54 — A folded region never shows whether she or the system closed it

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: fold-seam.tsx's FoldSeam renders identically (italic name, mono summary, 'unfold ↓') regardless of whether the caller's folded value came from explicit localStorage or a derived defaultFolded — no distinguishing prop exists in use-region-fold.ts's return type.

- Evidence: apps/designer-portal/src/components/document/region/use-region-fold.ts:104-121


### F55 — Seven marks give every phase the same visual weight

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: all 7 StrataMark bars in the marker row render at the same visual size regardless of phase, though 'project' alone shelves 4 sub-regions.

- Evidence: probe/repro-F55.png (source: shots/w1440-spine-full.png)


### F56 — A return visit lands me below the job's own name

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: page.tsx:1157-1172 confirmed verbatim: a useEffect reads readRecentDocumentsInHand(), and for a 'seenBefore' doc scrolls [data-active-section] into view when its top exceeds 60% of viewport height — landing below the title by design.

- Evidence: apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1157-1172


### F57 — Plan room / Spec book leaves have no route below 1440px

- width/scroll: `1280` / `top`

- **Verdict: reproduced**

- Reason: w1280-rich-s0.png shows the same job-ticket.tsx dead-leaf rendering (job-ticket.tsx:267-283, confirmed above) applies below 1440 — Drawings/Spec rows print no arrow at 1280 exactly as at other sub-1440 widths.

- Evidence: probe/repro-F57.png (source: shots/w1280-rich-s0.png)


### F58 — The compact tier carries a third fewer working pixels

- width/scroll: `1280` / `all`

- **Verdict: state-dependent**

- Reason: Confirmed qualitatively (w1280-rich-s0.png loses the always-visible margin money chips vs w1440-rich-s0.png), but the specific 145,044px²/28.8% figures come from research/12-layout-measurements.json's own pixel-bucket method, which this pass did not independently re-derive.

- Evidence: shots/w1280-rich-s0.png, shots/w1440-rich-s0.png


### F59 — Scroll-pinned seam and a chosen fold look and read identically

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: w1440-ticket-seam.png ('THE JOB · PROJECT / $6,200 owed you...UNFOLD ↓') and w1440-fold-seam-folded.png ('Client approvals / NO DECISION LEAD...UNFOLD ↓') share the identical 3-part grammar and case live on screen.

- Evidence: probe/repro-F59.png (source: shots/w1440-ticket-seam.png)


### F60 — R99's zero-shift mechanism exists once, not where the header needs it

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: globals.css:1026 confirmed 'top: var(--doc-seam-height,0px)' on the Schedule glance only; job-ticket.tsx's own fold/pin logic (lines 235-259) has no equivalent seam-height compensation for its own displacement.

- Evidence: apps/designer-portal/src/app/globals.css:1026; apps/designer-portal/src/components/document/job-ticket.tsx:248-259


### F61 — content-visibility containment may kill the R126 hover wash

- width/scroll: `1440` / `mid`

- **Verdict: not-reproduced**

- Reason: No 'content-visibility' declaration exists anywhere in src/ — the described stacking-context interaction never fires today. Separately, .has-wash already declares 'isolation: isolate' (globals.css:322-324) and the interactive probe confirmed the hover wash renders and animates correctly live.

- Evidence: apps/designer-portal/src/app/globals.css (grep: 0 hits for content-visibility); probe/03-interactive-probe.md §5

- Revised claim: This is a prospective risk for a future content-visibility:auto rollout (e.g. for FF&E virtualization), not a current defect — the wash works correctly today.


### F62 — PO acknowledgment and damage-claim filing both require leaving the document

- width/scroll: `all` / `all`

- **Verdict: state-dependent**

- Reason: source/instruments.md's T13/T14 claim is a design-instrument note, not directly re-derivable from this seed (no PO-unacknowledged/damage-claim item exists in Chen Residence's data to click through and confirm the off-document hop).

- Evidence: shots/w1440-rich-s2.png


### F63 — "PO" / "purchase order" is never printed anywhere on the document

- width/scroll: `all` / `all`

- **Verdict: state-dependent**

- Reason: Confirmed no 'PO'/'purchase order' text appears in any captured state of this document. However ffe-leader.ts (imported by ffe-section.tsx, the document's own FF&E component) defines a literal 'PO'/'POs unanswered' string for an unanswered-PO exception — this seed never triggers that exception, so t

- Evidence: apps/designer-portal/src/lib/document/ffe-leader.ts:90; apps/designer-portal/src/components/document/ffe-section.tsx:105

- Revised claim: 'PO' text can print on the document's own FF&E head under an unanswered-PO exception (ffe-leader.ts); it does not currently appear because no seeded line has that exception, not because the document surface can never print it.


### F64 — A late-arriving fold default can close a region she is reading

- width/scroll: `all` / `mid`

- **Verdict: state-dependent**

- Reason: use-region-fold.ts:110-121 confirmed the guard only checks explicit===null, so a late-resolving defaultFolded=true could flip an open region shut — but no query in this seed resolves late enough after paint to observe the flip live.

- Evidence: apps/designer-portal/src/components/document/region/use-region-fold.ts:110-121


### F65 — Damage is visible on the FF&E line; filing a claim is not reachable from there

- width/scroll: `all` / `mid`

- **Verdict: state-dependent**

- Reason: ffe-section.tsx confirmed to have a 'damaged' case (tone: terracotta) in its state-to-wash mapping, but neither seeded FF&E line is in that state (both show IN PRODUCTION/RECEIVED) — the claimed UI gap could not be observed live.

- Evidence: apps/designer-portal/src/components/document/ffe-section.tsx:179,215-227; shots/w1440-rich-s2.png


### F66 — Margin rail carries only Money and Time cards, never Orders/PO

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png: all 7 visible cards are MONEY (×5) or TIME (×2) kinds; no Orders/PO-kind card is present in this state.

- Evidence: probe/repro-F66.png (source: shots/w1440-margin-rail.png)


### F67 — Ledger-sheet round trip's scroll-offset preservation is unverified

- width/scroll: `all` / `all`

- **Verdict: state-dependent**

- Reason: probe §6 confirms the margin sheet itself doesn't reflow the paper at 1280 (identical region-head Y before/after), but no shot or probe opened the Orders ledger sheet named by T13/T14, so its scroll-offset round trip is genuinely untested by this program's evidence.

- Evidence: probe/03-interactive-probe.md:§6


### F68 — A condensing seam gets zero shadow budget

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: shadow-gate.test.ts:80-136 confirmed: one box-shadow budget spent on .doc-elevated across exactly studio-drawer/margin-item/doc-sheet, with the test failing on any new shadow under src/.

- Evidence: apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts:80-136


### F69 — Two e2e files pin the rail width to the pixel

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: quiet-responsive-shell.spec.ts:224-228 and quiet-release-contracts.spec.ts:108-158 confirmed verbatim: pixel-width assertions (55-57px rail, [200,1208]/[1208,1440] bounds) at 1280/1440.

- Evidence: apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts:224-228; e2e/document/quiet-release-contracts.spec.ts:150-158


### F70 — Contrast gate hard-codes five spine filenames

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: contrast.test.ts:313-341 (actual line ~329-338) confirmed a hardcoded RAIL_FILES array of exactly 5 filenames (spine-running-index, spine-shelved-blocks, spine-timer, doc-spine, margin-rail).

- Evidence: apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:329-338


### F71 — The reader's Unfold is destroyed on every pin change

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:235-244 confirmed: 'setFold(null)' runs unconditionally in the effect keyed on [pinned] — any pin-state change discards a reader's own Unfold choice.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx:235-244


### F72 — E2E pins the ticket to exactly eight rows at three widths

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: quiet-responsive-shell.spec.ts (rows :173-196) and responsive-document-shell.test.tsx:655-687 confirmed exact toHaveCount(8) assertions at all three widths.

- Evidence: apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts:173-196


### F73 — Region seams sit at three different gaps

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: w1440-rich-s2.png shows the 'Pieces' region ending almost immediately (~6px) above 'THE MONEY · ONE REGION' / 'Money', a visually tighter gap than the header-stack→Schedule gap seen in w1440-rich-s1.png — matches the {6,29,56}px claim qualitatively.

- Evidence: probe/repro-F73.png (source: shots/w1440-rich-s2.png)


### F74 — Muted ramp's lightest step has narrow headroom before 4.5:1 fails

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: Independently computed WCAG contrast for #65594E on #E8E3DB = 5.32:1 (floor 4.5:1) — matches the finding's number exactly.

- Evidence: apps/designer-portal/src/app/globals.css:18,58 (independently computed contrast = 5.317:1)


### F75 — The index attaches by 2s query-retry, not subscription

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: use-document-running-index.ts:37-38,120 confirmed ATTACH_RETRY_MS=250 × ATTACH_RETRIES=8 (~2s), and attach() reschedules only while attached.size < ordered.length.

- Evidence: apps/designer-portal/src/hooks/use-document-running-index.ts:37-38,120


### F76 — No contrast gate covers reduced ink on paper

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: contrast.test.ts gates only rail-stock pairs (confirmed no '#FCFAF6'/paper token referenced in the file); independently computed #65594E on #FCFAF6 = 6.51:1, matching the finding's number.

- Evidence: apps/designer-portal/src/lib/document/__tests__/contrast.test.ts (no paper-token gate found); independently computed contrast = 6.514:1


### F77 — The foot names no job and offers no way up

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: foot shows authorizations/accounts/closing-the-book/roster prose with no 'Chen Residence' text and no return-to-top control anywhere in frame.

- Evidence: probe/repro-F77.png (source: shots/w1440-rich-s3.png)

- Revised claim: The ~196px of true blank space below the last row is ~22% of the 900px frame, not 40%+ — the '40%+ blank' figure is overstated for this exact screenshot, though the core claim (no identity, no way up) holds.


### F78 — The sent state prints twice, in two tenses, with two nudges

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: w1440-prework-s0.png: 'Sent Aug 27 · not opened yet' + 'NUDGE CLIENT USER' near the top, and ~230px lower 'Proposal · v1 / AWAITING SIGNATURE / SENT YESTERDAY — NUDGE CLIENT USER' plus the SENT/OPENED/READING/MOST READ strip.

- Evidence: probe/repro-F78.png (source: shots/w1440-prework-s0.png)


### F79 — The needs block moves under me seconds after landing

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: Same CLS shift as F24: probe/03-interactive-probe.md §8 confirms a 0.1189 shift firing ~3.3-3.6s after paint, attributed to the needs-attention and Schedule-dates sections, unaffected by prefers-reduced-motion.

- Evidence: probe/03-interactive-probe.md:118-131


### F80 — The roster question is asked 2,000px from its door

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png shows 'PEOPLE Nobody on it yet' and 'CALL SHEET · 0' at top; w1440-rich-s3.png shows the actual roster invitation ('You're on the call sheet as lead...') at the foot — the two never share a frame.

- Evidence: probe/repro-F80.png (source: shots/w1440-rich-s0.png)


### F81 — The furniture schedule is called "Pieces," never "FF&E" or "schedule"

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png ticket row reads 'PIECES — 3 unspecified'; w1440-region-head-ffe.png shows the h2 reads 'Pieces' with 'the FF&E schedule' only as an 11px subtitle line.

- Evidence: probe/repro-F81.png (source: shots/w1440-rich-s0.png)


### F82 — Two In-hand clocks on screen showing different times

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png / w1280-rich-s0.png: spine shows 'IN HAND 18 min' (or '20m'/'21m' at 1280) while the drawer 700px below shows 'IN HAND TODAY 1h 09m' (or '1h 12m') — two different numbers, same visual weight.

- Evidence: probe/repro-F82.png (source: shots/w1440-rich-s0.png)


### F83 — Foot spends 310px teaching a concept with no content

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: 'AUTHORIZATIONS & TRADE SCOPES' with its two-sentence explanatory prose, 'No authorizations recorded yet', and 'DRAFT A TRADE SCOPE' occupy a large block with no live authorization content.

- Evidence: probe/repro-F83.png (source: shots/w1440-rich-s3.png)


### F84 — Rail's ink density never changes across scroll states

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: layout-measurements.md's own table shows rail ink% reads 54.9% at s0, s1, s2 and s3 alike for rich/1440 — confirmed by this pass's own visual comparison of w1440-spine-full.png against w1440-rich-s2.png (identical marker/index block).

- Evidence: probe/repro-F84.png (source: shots/w1440-spine-full.png)


### F85 — Closed margin sheet is a nameless landmark at 1280

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: margin-rail.tsx:251 confirmed verbatim: aria-label={isFullRail ? 'Margin' : undefined} — at 1180-1439 (not full-rail) the <aside> gets no aria-label before the trigger is tapped.

- Evidence: apps/designer-portal/src/components/document/margin-rail.tsx:251


### F86 — Reduced motion has zero in-app toggle; OS setting only

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: grep for 'useReducedMotion' inside apps/designer-portal/src/components/document/ returns zero hits; grep of interruption-settings.tsx and the document tree found no motion toggle.

- Evidence: apps/designer-portal/src/hooks/useReducedMotion.ts (0 consumers under components/document/)


### F87 — Schedule glance drifts continuously under a moving seam

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: globals.css confirmed 'section[aria-label="Schedule rule"] { top: var(--doc-seam-height,0px) }' as the ticket's only sticky top-0 sibling — a re-resolving seam value re-anchors this sticky element on every change.

- Evidence: apps/designer-portal/src/app/globals.css:1026; apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:199


### F88 — Density must not be a React transition

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: grep across components/document/, use-region-fold.ts and use-document-running-index.ts for 'startTransition'/'useTransition' returns only the unrelated mutation hook name 'useTransitionCustomCommissionRevision' in custom-commission-sheet.tsx.

- Evidence: apps/designer-portal/src/components/document/rooms/piece/custom-commission-sheet.tsx:127 (unrelated hook name; 0 real React transitions)


### F89 — I cannot tell a shipped fold from one I chose

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s1.png / w1440-fold-seam-folded.png show 'Client approvals'/'Schedule dates' folded on arrival with only 'UNFOLD ↓' — no visual marker distinguishes a shipped default from a designer's own prior fold.

- Evidence: probe/repro-F89.png (source: shots/w1440-rich-s1.png)


### F90 — Starting a new client exists only behind a keystroke

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png's drawer strip (Library/People/The Scans/Ledgers/Find anything/IN HAND TODAY/THE POST) names no 'start a client' action; command-bar.tsx confirms openCaptureLead/openOpenProject are only reachable as ⌘K search results, not standing UI.

- Evidence: probe/repro-F90.png (source: shots/w1440-rich-s0.png)


### F91 — Measurement file scores empty-state prose as active region

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: w1440-rich-s2.png: 'Plan the project work' / its explanatory sentence / 'ADD THE FIRST TASK' and 'FOLIO + FILE' visibly occupy a large share of the 'active region' band above the actual FF&E lines.

- Evidence: probe/repro-F91.png (source: shots/w1440-rich-s2.png)


### F92 — Foot is the least working frame on the paper

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: the 310px authorizations block, the accounts line, 'Closing the book', and the roster nudge are the only working content in the foot frame, consistent with the claimed 14.7% carrying share.

- Evidence: probe/repro-F92.png (source: shots/w1440-rich-s3.png)


### F93 — Four fold verbs on one screen, none says why

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: w1440-rich-s1.png shows ticket 'FOLD ↑', 'Client approvals...UNFOLD ↓', 'Schedule dates...UNFOLD ↓', and 'Schedule...FOLD ↑' all on one screen with no marker for why each is in its state.

- Evidence: probe/repro-F93.png (source: shots/w1440-rich-s1.png)


### F94 — A proposal-stage document exposes zero region landmarks at all

- width/scroll: `390` / `top`

- **Verdict: reproduced**

- Reason: Same DOM fact as F16: w1440-prework-s0.png's structure and layout-measurements.md's DOM query confirm zero [data-region-head]/[data-index-region] elements on the proposal document.

- Evidence: probe/repro-F94.png (source: shots/w1440-prework-s0.png)


### F95 — Pressing Fold under forceOpen visibly does nothing

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: use-region-fold.ts:125 confirmed verbatim 'if (forceOpen && value) return;' with no toast/message; layout.tsx:38-42 confirmed to mount no ToastProvider on this route.

- Evidence: apps/designer-portal/src/components/document/region/use-region-fold.ts:125-133


### F96 — Top ~145px of rail mixes leaving, the arc, the moment, and right-now

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: 'PUT DOWN', the 7-mark row, and the 'Project/ACTIVE' caption all sit within roughly the first 145px of the rail, above the timer card and presence line.

- Evidence: probe/repro-F96.png (source: shots/w1440-spine-full.png)


### F97 — Boards/Money/People ticket doors need one extra tap at 390

- width/scroll: `390` / `top`

- **Verdict: reproduced**

- Reason: m390-rich-s0.png confirms the ticket rests already in its 2-line seam form at scrollY=0 on mobile — the 8 rows (incl. Boards/Money/People) require tapping 'UNFOLD ↓' first.

- Evidence: probe/repro-F97.png (source: shots/m390-rich-s0.png)


### F98 — "Closing the book" is unexplained accounting idiom at the foot

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: 'Closing the book · 0 OF 6 CLOSED OUT' prints with no subtitle explaining the six items or the act of closing.

- Evidence: probe/repro-F98.png (source: shots/w1440-rich-s3.png)


### F99 — Seven marker bars are clipped by the rail edge

- width/scroll: `1280` / `all`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png: the 7 marker bars stack vertically flush to the left edge of the 56px column with no visible left margin, consistent with x=0 start under overflow-hidden.

- Evidence: probe/repro-F99.png (source: shots/w1280-spine-glyph-rail.png)


### F100 — Screen says no client and offers two client acts

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: 'No client linked — attach one ↗' at the top, 'Invoice...send a reminder' mid-frame, and 'MESSAGE THE CLIENT'/'PREVIEW AS THE CLIENT' lower — all in one screen alongside the no-client line.

- Evidence: probe/repro-F100.png (source: shots/w1440-rich-s0.png)


### F101 — Margin count at 390 exists only inside the Sections sheet

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: 'IN THE MARGIN · 7' prints only inside m390-mobile-spine-sheet.png; m390-rich-s0/s1/s2/s3.png show no persistent margin-count badge in the mobile bar or elsewhere at rest.

- Evidence: probe/repro-F101.png (source: shots/m390-mobile-spine-sheet.png)


### F102 — Active label pair duplicates the on-page region heading

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-rich-s2.png's spine caption reads 'Pieces' at the same moment the page's own h2 (w1440-region-head-ffe.png) also reads 'Pieces' verbatim, just at 11-12px vs 24px.

- Evidence: probe/repro-F102.png (source: shots/w1440-rich-s2.png)


### F103 — No presence indicator exists anywhere at 1180-1439 once hidden

- width/scroll: `1280` / `all`

- **Verdict: state-dependent**

- Reason: This finding is itself flagged low-confidence (0.7) by its own author and asks to be settled by opening the margin sheet plus checking the account avatar at 1280 — not something a static screenshot set resolves either way.

- Evidence: shots/w1280-spine-glyph-rail.png


### F104 — Any new ticket transition needs its own reduced-motion sibling

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: grep of globals.css's ~12 prefers-reduced-motion blocks (confirmed none reference job-ticket's pin/fold class names) combined with probe §1's finding that the fold is currently a hard cut in both motion regimes — there is genuinely no existing reduced-motion sibling for a transition that doesn't yet

- Evidence: apps/designer-portal/src/app/globals.css (prefers-reduced-motion blocks); probe/03-interactive-probe.md:11-20


### F105 — Running-index aria-current changes on scroll with no announcement

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: probe/03-interactive-probe.md §2 confirmed 3 clean aria-current transitions during a scripted scroll (400/1200/1960) with no aria-live region anywhere in use-document-running-index.ts.

- Evidence: probe/03-interactive-probe.md:33-45


### F106 — Put down (Esc) needs the More menu open first at 390

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: doc-spine.tsx confirmed 'PUT DOWN' sits at the permanent top of the >=1180 spine; mobile-bar.tsx:285-296 confirmed the same act is nested one level inside the mobile bar's More menu at 390.

- Evidence: apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:285-296


### F107 — "Folded" means one thing for Money, another for Schedule

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: schedule-rule-region.tsx:181-192 confirmed verbatim: the folded branch still renders {glance} and {phaseAdvance} beside the FoldSeam, unlike a region whose fold hides everything but the seam line.

- Evidence: apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:178-193


### F108 — An empty region's index line looks identical to a live one

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: fallback captions ('0 IN THE LOG', 'NOT SCHEDULED') and a live value ('$6,200 OWED') render at identical font size/weight/row position in the same component.

- Evidence: probe/repro-F108.png (source: shots/w1440-spine-full.png)


### F109 — A line reading only `BAND` with no object

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: w1440-rich-s1.png shows a bare mono line reading only 'BAND' between 'No active phase handoffs need attention.' and the 'Schedule' head, with no object or visible destination.

- Evidence: probe/repro-F109.png (source: shots/w1440-rich-s1.png)


### F110 — The "never-yield" rule for red-letter/money is nowhere codified

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: red-letter-zone.tsx confirmed to have no Fold/FoldSeam usage anywhere in the file — it renders unconditionally (or null) with no fold mechanism, and no test file enforces this as policy the way shadow-gate.test.ts enforces the shadow budget.

- Evidence: apps/designer-portal/src/components/document/red-letter-zone.tsx:82-99


### F111 — No 'where I've been' signal inside the active phase's four regions

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: the 4 rows under 'ON THIS PAPER' distinguish only the current aria-current row; nothing marks Client approvals/Schedule as 'already passed' once scrolled beyond them.

- Evidence: probe/repro-F111.png (source: shots/w1440-spine-full.png)


### F112 — No asymmetric down/up rule exists for a fast scroll crossing the pin point

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: job-ticket.tsx:219-226 confirmed the IntersectionObserver's threshold:0 sentinel fires the same setPinned(!entry.isIntersecting) regardless of scroll direction or speed — no direction check or dwell timer exists in the file.

- Evidence: apps/designer-portal/src/components/document/job-ticket.tsx:219-244


### F113 — The ticket's 283px jump doesn't register as a Layout Shift

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: probe/03-interactive-probe.md §8 and its own caveats section confirm the ~283px ticket jump (independently measured in §1 via before/after DOM rects) does not appear among the PerformanceObserver layout-shift entries captured in either motion pass.

- Evidence: probe/03-interactive-probe.md:§8 caveats


### F114 — Schedule frame is folded by default, hiding ripple preview

- width/scroll: `1440` / `seam`

- **Verdict: reproduced**

- Reason: schedule-rule-region.tsx confirmed 'defaultFolded: true' passed to useRegionFold — the Schedule frame is folded by default on this document.

- Evidence: apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:75-78


### F115 — Command palette doesn't distinguish 'begin a Brief' from 'Open a project'

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: command-bar.tsx confirms 'Capture a lead · begin a Brief' and 'Open a project · no proposal needed' are two distinct dispatched intents (openCaptureLead/openOpenProject) with no visible on-screen criterion distinguishing them before typing/selecting.

- Evidence: apps/designer-portal/src/components/document/command-bar.tsx:170-188


### F116 — Rail says 'Money' active while the frame shows roster/authorizations

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: the spine caption still bolds 'Money' at the foot while the visible frame shows Authorizations/Accounts/Closing-the-book/roster content, none of it Money.

- Evidence: probe/repro-F116.png (source: shots/w1440-rich-s3.png)


### F117 — Row-wash hover affordance cannot fire on a touch surface

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: row-wash.tsx confirmed useRowWash() wires only onPointerMove/onPointerEnter (markInkPoint) — no pointerdown/touchstart/click fallback exists for opening the wash without hover.

- Evidence: apps/designer-portal/src/components/document/row-wash.tsx:19-34


### F118 — Late-arriving Schedule/needs-attention content has no SR announcement

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: Same CLS event as F24/F79 — probe confirms the arrival is a silent DOM reflow with no accompanying aria-live announcement anywhere in the schedule-rule-region.tsx source.

- Evidence: probe/03-interactive-probe.md:118-131


### F119 — Guide/Red-letter substitution leaves no trace of which she got

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-guide-or-red-letter.png shows the RedLetterZone variant rendering with no marker indicating a substitution occurred; page.tsx:1838-1847's ternary (confirmed to exist) has no visible-state counterpart.

- Evidence: probe/repro-F119.png (source: shots/w1440-guide-or-red-letter.png)


### F120 — Only region roots clear the pinned seam, not their child controls

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: globals.css:1034/1037 and money-region.tsx:48 confirmed scroll-margin-top is set only on [data-index-region] region roots; grep of ticket-row/Fold-button markup found no equivalent scroll-margin-top on child controls.

- Evidence: apps/designer-portal/src/app/globals.css:1026-1037


### F121 — Mobile margin chips likely sit under the 24px target floor

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: mobile-margin-chips.tsx:98-114 confirmed py-[0.32rem] padding around unstyled text-[11px] with no explicit leading — consistent with an estimated ~21-26px total height, under the 24px SC 2.5.8 floor.

- Evidence: apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx:98-114


### F122 — Ticket seam's 'piece-stuck' exception never observed surfacing a PO problem

- width/scroll: `all` / `top`

- **Verdict: state-dependent**

- Reason: Confirmed the seam prints only 'money-at-risk' text on this seed (w1440-ticket-seam.png); ticket-derivation.ts's RANK_ORDER does name a 'piece-stuck' rank 2, but no captured state or seed data ever surfaces that seam text to check its wording against a PO problem.

- Evidence: shots/w1440-ticket-seam.png; apps/designer-portal/src/lib/document/ticket-derivation.ts:826-830


### F123 — The six-rung money ladder has no PO/receiving counterpart

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: money-ladder.ts:5 confirmed the comment 'six-rung ladder in dependency order: budget → plan → authorized → moved →...'; grep across the FF&E/procurement files found no equivalent named rung ladder for PO/receiving state.

- Evidence: apps/designer-portal/src/lib/document/money-ladder.ts:5


### F124 — Schedule ripple UI (downstream damage on date move) not confirmed visible befor…

- width/scroll: `all` / `seam`

- **Verdict: state-dependent**

- Reason: Ticket prints 'DATES — No install date yet →' on this seed (0 phases, 'not scheduled') — there is no scheduled date to move, so no shot or probe could exercise schedule-ripple-derivation.ts's actual warning UI before a commit.

- Evidence: shots/w1440-rich-s0.png


### F125 — Proposal send-wall state legibility for a junior is unverified in this shot set

- width/scroll: `all` / `mid`

- **Verdict: state-dependent**

- Reason: w1440-prework-s0/s1.png do show the proposal's send-wall state clearly (Sent Aug 27/not opened yet, Nudge Client User, Input needed/blocks Project activation) — but whether that reads as legible specifically 'for a junior' is a subjective judgment this program's evidence can't settle either way.

- Evidence: shots/w1440-prework-s0.png


### F126 — '← PUT DOWN' is the one control that costs the same at every state

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: w1440-rich-s0/s1/s2/s3.png all show 'PUT DOWN' at identical top-left position and size across all four states.

- Evidence: probe/repro-F126.png (source: shots/w1440-rich-s0.png)


### F127 — The tan "needs attention" box is nearly the only color-coded signal on first sc…

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: against an otherwise cream/charcoal page, the terracotta-bordered 'NEEDS ATTENTION' box is the one strong color break in the frame.

- Evidence: probe/repro-F127.png (source: shots/w1440-rich-s0.png)


### F128 — No hover-only affordance found in spine, margin, or ticket

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: grep of globals.css:339-346 confirmed .has-wash:hover pairs with .has-wash:focus-within on the same rule (not a separate hover-only rule); doc-spine.tsx's hover classes were likewise found paired with focus-visible variants.

- Evidence: apps/designer-portal/src/app/globals.css:338-346


### F129 — Vitals line prints two dashes and an empty fold

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: 'START —  TARGET —  SET A BUDGET BAND  PHASES ▸' shows two dash fields; w1440-letterhead-vitals-phases-open.png shows the same box height before/after opening PHASES with no content revealed.

- Evidence: probe/repro-F129.png (source: shots/w1440-rich-s0.png)


### F130 — 270px of rail stock carries nothing at the foot of the rail

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png shows a visibly empty run of rail stock below the timer/presence block, consistent with the measured 270px longest empty run at y 630-900.

- Evidence: probe/repro-F130.png (source: shots/w1440-spine-full.png)


### F131 — At 390 the ticket starts already collapsed — the pin motion never happens

- width/scroll: `390` / `top`

- **Verdict: reproduced**

- Reason: m390-rich-s0.png confirms the ticket is already in its 2-line collapsed seam form ('$6,200 owed you...UNFOLD ↓') at scrollY=0 — the 8-row unfolded form seen at 1440/1280 s0 never appears at 390.

- Evidence: probe/repro-F131.png (source: shots/m390-rich-s0.png)


### F132 — Margin is last in linear Tab order at every width

- width/scroll: `all` / `all`

- **Verdict: reproduced**

- Reason: page.tsx confirmed <main> closes at line 2305 and MarginRail mounts afterward at 2311-2334 — a sequential Tab user reaches every ticket/region control before the margin in DOM order.

- Evidence: apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2305,2311-2334


### F133 — Margin chips print the same string twice

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png / w1280-margin-sheet-open.png: 'TIME · AUG 29' label line is directly followed by 'Time · Aug 29' body line in the same chip (and again for AUG 27) — the same string in two cases.

- Evidence: probe/repro-F133.png (source: shots/w1440-margin-rail.png)


### F134 — `PHASES ▸` opens and reveals nothing

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-letterhead-vitals-phases-open.png shows the PHASES arrow flipped to ▾ (open) with the same box height as before and no content rendered beneath it (0 phases configured on this doc).

- Evidence: probe/repro-F134.png (source: shots/w1440-letterhead-vitals-phases-open.png)


### F135 — Margin content requires an extra tap at 1280 before it's visible

- width/scroll: `1280` / `top`

- **Verdict: reproduced**

- Reason: w1280-margin-tab-closed.png confirms the margin sheet is off-canvas (only the 'MARGIN ←' tab visible) until tapped, matching the data-margin-mode='sheet' / translate-x-full state.

- Evidence: probe/repro-F135.png (source: shots/w1280-margin-tab-closed.png)


### F136 — Instruments row spends 44px on doors nobody was sent to

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-instruments-row.png: 'MESSAGE THE CLIENT'/'PREVIEW AS THE CLIENT'/'SHARING · MILESTONES'/'CALL SHEET · 0' sit directly under the needs-attention zone, whose own named acts are 'SEND REMINDER'/'OPEN THE SCHEDULE'.

- Evidence: probe/repro-F136.png (source: shots/w1440-instruments-row.png)


### F137 — Presence line is session metadata, not a navigation fact

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-spine-full.png: 'JUST YOU · VISIBLE TO THE STUDIO' is the rail's last line, describing session collaboration rather than document position, unchanged across states per layout-measurements.md.

- Evidence: probe/repro-F137.png (source: shots/w1440-spine-full.png)


### F138 — Letterhead <header> nested in <main> exposes no landmark

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: doc-letterhead.tsx:52 confirmed '<header id="document-project-status">'; page.tsx confirmed this sits inside '<main data-document-paper>' (opened :1787) — a <header> nested in sectioning content is not exposed as the banner landmark.

- Evidence: apps/designer-portal/src/components/document/doc-letterhead.tsx:52; apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1787,1789


### F139 — Mobile sheets have no visible, Tab-reachable close button

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: mobile-sheets.tsx:266,272 confirmed both the backdrop 'Dismiss' button and the drag-handle/panel wrapper carry tabIndex={-1}; no separate visible close icon exists inside the sliding panel itself.

- Evidence: apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:263-292


### F140 — Compact rail still mixes leaving, arc, and moment at the top

- width/scroll: `1280` / `top`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png shows Put down, the vertical 7-mark stack, and 'Project/ACTIVE' all above the compact timer, matching the 1440 top-mixing pattern (F96) at 1280 too.

- Evidence: probe/repro-F140.png (source: shots/w1280-spine-glyph-rail.png)


### F141 — Reading the balance and acting on it are two different scroll depths

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: layout-measurements.md's region→y map (money-head y=2397px on rich/1440) combined with w1440-rich-s0.png (the MONEY row at scroll 0) confirms the balance and its action live roughly 2400px apart on the same scroll axis.

- Evidence: probe/repro-F141.png (source: shots/w1440-rich-s0.png)


### F142 — "Project" names a stage, a section label, and the ticket subject at once

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png shows 'Project / ACTIVE' (spine) and 'THE JOB · PROJECT' (ticket) on the same screen; m390-mobile-spine-sheet.png shows 'Project / ACTIVE' again as a stage-progression row — same word, three roles.

- Evidence: probe/repro-F142.png (source: shots/w1440-rich-s0.png)


### F143 — "Hands on the work: you" reads as a sentence fragment, not a role label

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: 'LEAH HARTWELL / hands on the work: you' prints in plain sentence case directly under a rule with no further framing distinguishing it as a role label.

- Evidence: probe/repro-F143.png (source: shots/w1440-rich-s3.png)


### F144 — Ticket says "Boards"; task vocabulary and shelf history say "Mood boards"

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: shelves.ts:60-68 confirmed the comment verbatim: 'F62 — one name for one thing. The row, the leaf, the page and ⌘K all read Boards' — the ticket row itself reads 'BOARDS' with no 'mood board' synonym anywhere on screen.

- Evidence: apps/designer-portal/src/lib/document/shelves.ts:60-68


### F145 — "No client linked — attach one" sits directly under the title, reads as an error

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png: 'No client linked — attach one ↗' prints in warm-tinted italic directly under 'Chen Residence', before any task-relevant content.

- Evidence: probe/repro-F145.png (source: shots/w1440-rich-s0.png)


### F146 — Approvals fold summary is 41 characters, over budget and truncatable

- width/scroll: `390` / `mid`

- **Verdict: reproduced**

- Reason: fold-seam.tsx:73 confirmed the summary span carries the 'truncate' class; 'NO DECISION LEAD · NO APPROVALS AUTHORED' is 41 characters, verified by direct count.

- Evidence: apps/designer-portal/src/components/document/region/fold-seam.tsx:73


### F147 — Rail has no 'what needs you next' signal of its own

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: page.tsx:1838-1847 confirmed the guide/red-letter next-up logic lives in the header stack; grep of doc-spine.tsx/spine-running-index.tsx found no equivalent 'what needs you next' computation on the rail.

- Evidence: apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1838-1847


### F148 — The system's only loading motion lives outside the header/spine/margin the brie…

- width/scroll: `all` / `seam`

- **Verdict: reproduced**

- Reason: grep confirmed strata-sweep/StrataSweep is consumed by worktable/library-reach-in.tsx and the rooms/piece/* tree, and NOT by doc-letterhead.tsx, job-ticket.tsx, doc-spine.tsx, or margin-rail.tsx.

- Evidence: apps/designer-portal/src/components/document/worktable/library-reach-in.tsx (present); doc-letterhead.tsx/job-ticket.tsx/doc-spine.tsx/margin-rail.tsx (absent)


### F149 — Row-wash's exclusion from ticket/spine/region-heads should stay a rule, not a g…

- width/scroll: `1440` / `mid`

- **Verdict: reproduced**

- Reason: grep confirmed exactly two production consumers of RowWash/.has-wash: desk-roster.tsx and ffe-section.tsx — the ticket, spine, and region-head files carry no .has-wash class.

- Evidence: apps/designer-portal/src/components/document/desk-roster.tsx, ffe-section.tsx (only 2 consumers)


### F150 — "STUDIO EYES ONLY" beside a margin % reads as a permission wall

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: w1440-rich-s3.png: 'The accounts · this project · $0 BUDGET · $14,420 COMMITTED · 20% MARGIN · STUDIO EYES ONLY' prints with no indication of who is or isn't cleared to view/act on it.

- Evidence: probe/repro-F150.png (source: shots/w1440-rich-s3.png)


### F151 — Phases fold forgets an explicit open on every remount

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: letterhead-vitals.tsx:377 confirmed 'const [phasesOpen, setPhasesOpen] = useState(false);' — a plain, unpersisted component state that resets on remount.

- Evidence: apps/designer-portal/src/components/document/letterhead-vitals.tsx:377


### F152 — Vertical mark stack reads less like a single arc than the horizontal row

- width/scroll: `1280` / `top`

- **Verdict: reproduced**

- Reason: w1280-spine-glyph-rail.png: the 7 marks stack vertically across roughly half the visible rail height, a materially different read from the compact horizontal row seen at 1440 (w1440-spine-full.png).

- Evidence: probe/repro-F152.png (source: shots/w1280-spine-glyph-rail.png)


### F153 — Status chip crowds the price on a mobile FF&E line

- width/scroll: `390` / `mid`

- **Verdict: reproduced**

- Reason: m390-rich-s2.png: the 'IN PRODUCTION' chip sits close against '$5,700' with a visibly tight gap on the Møbler Lounge Chair line, forcing the item name onto more wrapped lines.

- Evidence: probe/repro-F153.png (source: shots/m390-rich-s2.png)


### F154 — The guide and the red-letter zone have different heights, shifting everything b…

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: red-letter-zone.tsx:82 confirmed the <section> carries only 'rounded/border/bg/px/py' classes with no 'my-*' margin; document-guide.tsx:75 confirmed 'className="my-5 border-y ... py-4"' — different outer footprints for the two mutually-exclusive branches.

- Evidence: apps/designer-portal/src/components/document/red-letter-zone.tsx:82; apps/designer-portal/src/components/document/document-guide.tsx:75


### F155 — FF&E region head reads 'Pieces', not 'FF&E'

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: w1440-region-head-ffe.png: the h2 reads 'Pieces' with 'the FF&E schedule, by room · 1 group · 3 lines' only in the smaller subtitle line below it.

- Evidence: probe/repro-F155.png (source: shots/w1440-region-head-ffe.png)


### F156 — Each of the 7 fold regions invents its own empty vocabulary

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: ticket-derivation.ts confirmed three distinct negation patterns verbatim: 'No rooms yet' (:433), 'Nothing filed' (:540), 'Nobody on it yet' (:732); money-region.tsx separately uses 'no budget yet' — at least three different phrasings for zero.

- Evidence: apps/designer-portal/src/lib/document/ticket-derivation.ts:433,540,732; apps/designer-portal/src/components/document/commercial/money-region.tsx:184


### F157 — Pre-work rail shows no timer card at all, unlike the rich doc

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-prework-s0.png shows no 'IN HAND' timer box under the caption, unlike w1440-rich-s0.png's identical-width shot which does show one.

- Evidence: probe/repro-F157.png (source: shots/w1440-prework-s0.png)


### F158 — Nothing marks arrival at the paper's foot with any motion or cue

- width/scroll: `1440` / `foot`

- **Verdict: reproduced**

- Reason: doc-colophon.tsx:102 confirmed the wrapper is 'mt-14 border-t pb-6 pt-3' with no entrance-animation class; w1440-rich-s3.png shows no visible motion cue at the foot (this is a static-screenshot observation about absence of an animation class, consistent with but not proof of 'no motion at runtime').

- Evidence: probe/repro-F158.png (source: shots/w1440-rich-s3.png)


### F159 — Empty-state ticket rows ('Nothing filed', 'Nobody on it yet') read as inert, no…

- width/scroll: `all` / `top`

- **Verdict: reproduced**

- Reason: w1440-rich-s0.png/w1440-ticket-unfolded.png: 'DRAWINGS — Nothing filed →' and 'PEOPLE — Nobody on it yet →' print with a trailing arrow but plainly negative copy.

- Evidence: probe/repro-F159.png (source: shots/w1440-ticket-unfolded.png)


### F160 — Margin cards print raw seed/debug copy ("Walk seed — ...")

- width/scroll: `1440` / `top`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png: two cards read 'Walk seed — draft invoice (design fee, phase 2)' and 'Walk seed — 15 days overdue (receivables chase)' verbatim as their subtitle text.

- Evidence: probe/repro-F160.png (source: shots/w1440-margin-rail.png)


### F161 — No margin card pattern demonstrates how a client message lands 'on the record'

- width/scroll: `1440` / `all`

- **Verdict: reproduced**

- Reason: w1440-margin-rail.png confirms all 7 visible cards are Money/Time kinds; margin-rail.tsx:488-513 confirmed '+ NOTE' and a bell icon exist as separate affordances, but neither is shown resolving a client message in any captured state.

- Evidence: probe/repro-F161.png (source: shots/w1440-margin-rail.png)


### F162 — doc-raise's entrance signal may never be seen on repeat visits

- width/scroll: `1440` / `top`

- **Verdict: state-dependent**

- Reason: doc-raise's 270ms entrance class is confirmed to exist in globals.css and to be applied once at shell mount (page.tsx:1764), but this program's screenshot-only evidence cannot distinguish a cold load from an in-app navigation, so whether it replays on repeat visits is genuinely unverified here.

- Evidence: apps/designer-portal/src/app/globals.css:249-256


### F163 — PO-acknowledgement chord (g o) has no confirmed touch path

- width/scroll: `390` / `all`

- **Verdict: reproduced**

- Reason: registry-shortcuts.tsx confirms a generic 'g then X' chord registry exists app-wide; grep of mobile-bar.tsx and mobile-sheets.tsx found no touch-equivalent trigger for any registry chord, consistent with the claim.

- Evidence: apps/designer-portal/src/components/document/registry-shortcuts.tsx:5-9,40,67


### F164 — FF&E hover wash signals interactivity, not PO urgency

- width/scroll: `all` / `mid`

- **Verdict: reproduced**

- Reason: ffe-section.tsx's row-wash tone list (9 tones incl. terracotta for 'damaged') confirmed generic/state-based, not specifically PO-urgency-based; probe §5 confirms the wash is purely a hover/interactivity affordance (clip-path reveal), carrying no PO semantics.

- Evidence: apps/designer-portal/src/components/document/ffe-section.tsx:76,225; probe/03-interactive-probe.md §5

