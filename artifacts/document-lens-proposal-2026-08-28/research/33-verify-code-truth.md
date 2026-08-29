# 33 — V1 verify:CODE-TRUTH — refutation pass over the 164 canonical findings

Method: for each finding, read the component, hook or derivation it actually concerns under `apps/designer-portal/src/{app,components/document,lib/document,hooks}` (plus the tests and `app/globals.css` where the claim is about a gate), then rule. Every verdict below carries a file:line, a quoted clause or a shot.

**Tally — 164 findings:** 132 stands · 21 narrows · 11 misread.

## Killed outright (misread)

| id | title | why it dies |
|---|---|---|
| F02 | Studio puck covers the mobile bar's orientation zone | No product code draws a circular puck in the mobile bar: the identity zone is a flex row (items-center gap-2) whose only mark is STRATA, three 12px clay bars, and the studio drawer is hidden below 1180. The black circle with an N in the shot is the Next.js dev-tools indicator. |
| F25 | Drawings and Spec ticket rows are unreachable below 1440 | planroom and specbook both declare routeSegments, and the page passes shelfRouteFor for both, so `routes[door.shelf]` is truthy and the deadLeaf branch never applies to those two rows. Below 1440 they render as `<a href='/doc/{id}/plans'>` and `/spec-book`. |
| F57 | Plan room / Spec book leaves have no route below 1440px | Same refutation as F25: shelfRouteFor supplies /doc/{id}/plans and /doc/{id}/spec-book, so those rows are `<a href>` links below 1440, not dead leaves. A dead leaf only occurs for a shelf whose routeSegment is null (callsheet, clientcopy), and those rows are not leaf doors. |
| F61 | content-visibility containment may kill the R126 hover wash | `.has-wash` already declares `isolation: isolate`, so every washed row is its own stacking context today and the wash's z-index:-1 already paints behind the row's content and above its ground. An added content-visibility container does not change that, and inset:0 overflows nothing. |
| F76 | No contrast gate covers reduced ink on paper | contrast.test.ts DOES gate ink on paper: PAPER_STOCKS includes --doc-paper #FCFAF6, and the whole muted ramp is asserted at 4.5:1 against all three stocks. The seat's own 6.5:1 figure for #65594E on paper is exactly what that test enforces. |
| F85 | Closed margin sheet is a nameless landmark at 1280 | A closed compact margin is not a landmark at all: the aside carries aria-hidden and inert while `!visible`, so AT never reaches it; once open it takes role=dialog with aria-labelledby pointing at the 'In the margin' title. |
| F95 | Pressing Fold under forceOpen visibly does nothing | The scenario cannot occur: forceOpen has exactly one consumer, and that consumer's open branch passes RegionHead neither bodyId nor onFold, so showFold is false and no Fold control is rendered under forceOpen at all. |
| F115 | Command palette doesn't distinguish 'begin a Brief' from 'Open a project' | Each verb carries a printed criterion: the registry gives capture-lead the subLabel 'begin a Brief' and open-project 'no proposal needed', plus a help blurb each — and the seat quotes both subLabels in its own observation. |
| F122 | Ticket seam's 'piece-stuck' exception never observed surfacing a PO problem | The code already answers the question: an unanswered PO IS the seam's piece-stuck exception, carrying the PO's own phrase and its sent date, fed from row.unacked_po_count on the page. It is simply zero on this seed. |
| F124 | Schedule ripple UI (downstream damage on date move) not confirmed visible befor… | The ripple preview is wired: the derivation has four live consumers, including the confirm strip that stands between a date move and its commit and the ghost layer that draws the downstream shift. It is unexercised on a zero-phase seed, not absent. |
| F162 | doc-raise's entrance signal may never be seen on repeat visits | The animation class sits on the shell root that DocumentPage renders, and the whole route unmounts on navigation away — the body is even explicitly keyed on the document id so a different document is a fresh mount by construction. The raise therefore replays on every arrival, not only a cold load. |

## Narrowed

| id | title | narrower claim | evidence |
|---|---|---|---|
| F15 | At 1280 the spine is six unlabeled bars, no words at all | At 1280 the spine's seven section marks are unlabelled glyphs — the only words the rail prints are 'Put down', the active section's own two-line caption, and the compact timer. | doc-spine.tsx:52 (`min-[1180px]:inline`); doc-spine.tsx:122-136; doc-spine.tsx:64-120 (seven sections, aria-label per cell) |
| F23 | The line shows production state but not vendor or damage state | The FF&E line carries production and damage state but no PO-acknowledgement state, and no act that files a claim — the line's claim controls only advance a claim that already exists. | ffe-section.tsx:214-216 (`case 'damaged': return 'damaged'`); ffe-section.tsx:224-229 (ffeWashTone); line-unfold.tsx:188-260 (ClaimActs) |
| F34 | Continuous seam height breaks every region landing | A seam whose height changes during a smooth scroll mis-lands the region head by up to one seam height (~64px today, more under a continuously-condensing seam), because scroll-margin-top is resolved once at scrollIntoView call time. | job-ticket.tsx:248-259 (removeProperty when `!pinned || unfolded`); globals.css:1034; use-document-running-index.ts:206-215 (scrollIntoView at call time) |
| F42 | Ticket collapse is a silent 283px jump for SR users | A scroll-driven ticket collapse is announced only to a reader who was already focused inside the ticket (focus moves to the Fold button); for every other screen-reader user the 283px change is silent, since job-ticket.tsx declares no live region. | job-ticket.tsx:235-242 (`foldRef.current?.focus()`), :388-398 (`aria-expanded={unfolded}` + 'Unfold ↓'); no aria-live anywhere in job-ticket.tsx |
| F52 | Ticket pin, triggered only by scroll, silently relocates focus | A scroll-driven pin relocates keyboard focus onto the ticket's Fold button for a reader who was standing on a row that the pin unmounts — a scroll gesture producing a focus move, though a deliberate and bounded one. | job-ticket.tsx:213 (focusWithin ref), :229-242 (`if (!focusWithin.current || stillInside) return; foldRef.current?.focus()`) |
| F55 | Seven marks give every phase the same visual weight | The seven spine marks are all one size and weight, so a phase that shelves four regions reads no larger than one that shelves none — only fill level and the active mark's breath distinguish them. | doc-spine.tsx:66-88 (fill + breathing per mark), :103, :113-114 (xs at ≥1440); strata-mark.tsx:41 |
| F59 | Scroll-pinned seam and a chosen fold look and read identically | The pinned ticket seam and a chosen region fold share the same three-part grammar (name · summary · unfold verb) and so read as one kind of thing, though their type treatments differ. | job-ticket.tsx:381-386 + :106 (SEAM_IDENTITY_CLASS); fold-seam.tsx:64-79 (`font-heading text-[12.5px] italic` + `truncate font-mono text-[11px]`) |
| F62 | PO acknowledgment and damage-claim filing both require leaving the document | Acknowledging a PO and filing a new damage claim both require leaving the document, though the FF&E line unfold does surface the purchase order and can advance a claim that already exists. | line-unfold.tsx:390 (`label="Purchase order"`); po-preview.tsx:292; line-unfold.tsx:188-260 (ClaimActs); orders-book-receiving.tsx:83 (the claim lifecycle's home) |
| F63 | "PO" / "purchase order" is never printed anywhere on the document | No ticket row, region head, margin card or spine label prints 'PO' or 'purchase order' — the words appear only once an FF&E line is unfolded. | line-unfold.tsx:390; po-preview.tsx:292 ('Resend purchase order' / 'Purchase order') |
| F65 | Damage is visible on the FF&E line; filing a claim is not reachable from there | Damage is visible on the FF&E line and an existing claim can be advanced from the line unfold, but FILING a claim exists only on the Receiving page, off the document. | line-unfold.tsx:182-260 (ClaimActs, 'notify-vendor-of-ffe-claim' / 'open-resolve-ffe-claim'); ffe-section.tsx:224-229; orders-book-receiving.tsx:83 |
| F84 | Rail's ink density never changes across scroll states | Nothing in the rail changes weight, size or ink area across scroll states; the only scroll-responsive element is the running index's current-row bolding and its 2px reading rule. | spine-running-index.tsx:44-59 (measure on activeKey), :76-82 (the moving rule), :86 (`aria-current`); doc-spine.tsx:46-154 (nothing else reads scroll) |
| F87 | Schedule glance drifts continuously under a moving seam | Under a continuously-condensing seam the schedule's zero-height pinned glance, which offsets itself by top: var(--doc-seam-height), would re-resolve its sticky constraint every frame and slide against the paper. | globals.css:1026; schedule-rule.tsx:546-548 (`aria-label="Schedule rule"`, `pointer-events-none sticky top-0 z-[3] h-0`); job-ticket.tsx:248-259 (two-value publication) |
| F99 | Seven marker bars are clipped by the rail edge | At 1280 the seven 48px `sm` marks overflow the rail's 44px inner measure and lose about 2px at each end to the spine's own overflow-x-hidden. | strata-mark.tsx:41 (`sm: { w: 48, ... }`); doc-spine.tsx:44 (`min-[1180px]:overflow-x-hidden min-[1180px]:px-1.5`); doc-spine.tsx:106-115 (`w-full min-w-11 ... justify-center`) |
| F102 | Active label pair duplicates the on-page region heading | The running index's 'Pieces' row duplicates the page's own <h2> 'Pieces' region head verbatim, at 13px against the head's 24px. | doc-spine.tsx:128-131 (`{activeSection.label}`); section-derivation.ts:59-77 (ORDER/labels); spine-running-index.tsx:96-105 (`{entry.label}`) |
| F106 | Put down (Esc) needs the More menu open first at 390 | At ≥1180 'Put down' sits permanently at the top of the spine; at 390 the same act is one level deeper, as the first row of the sections sheet. | mobile-sheets.tsx:444-455; mobile-bar.tsx:218-232 (`onClick={openSpine}`) |
| F117 | Row-wash hover affordance cannot fire on a touch surface | On a touch surface the row wash loses its pointer-origin sweep (markInkPoint runs only on pointerenter/pointermove); it still opens from the centre via :focus-within when a control in the row takes focus. | globals.css:338-343 (`.has-wash:hover .row-wash, .has-wash:focus-within .row-wash`), :345-349 (the focus-only centre override); row-wash.tsx:29-34 |
| F118 | Late-arriving Schedule/needs-attention content has no SR announcement | The late-arriving RedLetterZone and schedule content carry no live region, unlike the DocumentGuide branch they displace, which announces itself. | red-letter-zone.tsx:85-99 (no live region); document-guide.tsx:123 (`<span className="sr-only" aria-live="polite" aria-atomic="true">`); section-loading-line.tsx:26 |
| F133 | Margin chips print the same string twice | Two of the seven margin chips print a title identical to their own derived kind line, because MarginItem renders both fields unconditionally and nothing suppresses a title that repeats its kind. | margin-item.tsx:52-67 (`<MItemContent kindLine={deriveKindLine(row)} title={row.title} detail={row.detail} .../>`); shots/w1440-rich-s1.png (the two TIME chips) |
| F157 | Pre-work rail shows no timer card at all, unlike the rich doc | A pre-work document shows no timer card because SpineTimer returns null without a held project — time attaches to projects, so the absence is a data gate, not an untriggered session. | spine-timer.tsx:97-100 (`// Time attaches to projects (00177 FK) — pre-project documents carry no timer in v1.` / `if (!heldProjectId) return null;`) |
| F160 | Margin cards print raw seed/debug copy ("Walk seed — ...") | Three margin cards carry seed copy ('Walk seed — …') as their detail line, which MarginItem renders verbatim from the row. | margin-item.tsx:52-62 (`<MItemContent ... detail={row.detail} />`); shots/w1440-rich-s1.png |
| F164 | FF&E hover wash signals interactivity, not PO urgency | The FF&E hover wash already carries damage state (terracotta) and decision-due state (golden), but no tone distinguishes an unacknowledged PO from an ordinary line. | ffe-section.tsx:220-229 (`if (kind === 'decision_due') return 'golden'; if (kind === 'damaged') return 'terracotta'; return 'clay';`) |

## Full per-finding rows

### F01 — First region head lands a full frame below the fold
- **width / state:** 1440 · top — severity blocker, seat confidence 0.95
- **claim under test:** At scrollY 0 the frame holds `Chen Residence`, `No client linked — attach one ↗`, `START — TARGET — SET A BUDGET BAND PHASES ▸`, the eight `THE JOB · PROJECT` rows, `NEEDS ATTENTION · IN ONE PLACE` and `MESSAGE THE CLIENT`. First region head y=1005 in a 900 frame.
- **verdict:** `stands`
- **reason:** The mount order and the spacing sites in the code compose exactly this stack: letterhead, eight-row ticket, guide/red-letter, instruments, then approvals opening with mt-6 + border + py-6 before its own rule and head.
- **evidence:** page.tsx:1797-1900 (mount order); doc-letterhead.tsx:52; job-ticket.tsx:401-407; approvals/project-approval-document.tsx:584-590

### F02 — Studio puck covers the mobile bar's orientation zone
- **width / state:** 390 · all — severity high, seat confidence 0.85
- **claim under test:** The bar's left zone reads `IN THIS DOCUMENT` / `Project`; the circular dark studio mark overprints the first characters of both lines so it renders as `⬤N THIS` / `⬤OCUMENT` / `Project`. Present at all four states. Normalised to the 844px frame.
- **verdict:** `misread`
- **reason:** No product code draws a circular puck in the mobile bar: the identity zone is a flex row (items-center gap-2) whose only mark is STRATA, three 12px clay bars, and the studio drawer is hidden below 1180. The black circle with an N in the shot is the Next.js dev-tools indicator.
- **evidence:** mobile-bar.tsx:36-42 (STRATA = three bars); mobile-bar.tsx:221-232 (flex items-center gap-2); studio-drawer.tsx:289 ('hidden ... min-[1180px]:grid')
- **revised claim:** In the 390 capture a Next.js dev-tools indicator (a dev-only overlay, not product chrome) overprints the bar's identity zone; the bar's own layout has no overlapping element.

### F03 — Studio drawer labels overprint at 1280
- **width / state:** 1280 · all — severity medium, seat confidence 0.8
- **claim under test:** At 1280 the drawer strip prints 'Find anything' and 'IN HAND TODAY' overlapping in the same glyph run; at 1440 they are separate. The strip is always present at every scroll state, so the collision is permanent chrome, not a scroll artefact.
- **verdict:** `stands`
- **reason:** The drawer strip is one fixed 60px grid whose columns are [1fr_auto_1fr] with gap-4 and px-22; at 1280 the right column's 'IN HAND TODAY 1h 12m' runs back over the centre 'Find anything', as the capture shows.
- **evidence:** studio-drawer.tsx:289; shots/w1280-rich-s0.png (bottom strip)

### F04 — Ticket pin/fold is a single-frame cut with no hysteresis band
- **width / state:** all · seam — severity blocker, seat confidence 0.95
- **claim under test:** At scrollY 280 the ticket swaps 347.25px → 64.06px in one React commit; the first region head's document Y jumps −283.19px. Sampled every ~17ms for 400ms: 23 of 23 samples read exactly 64.0625px — no interpolation in either direction.
- **verdict:** `stands`
- **reason:** unfolded is a pure derivation of a boolean pin, and the sticky section carries no transition or animation class, so the swap is one commit.
- **evidence:** job-ticket.tsx:244 (`const unfolded = fold ?? (!pinned && !seamAtRest)`); job-ticket.tsx:219-226 (threshold 0); job-ticket.tsx:362 (className has no transition)

### F05 — Seed has 3 FF&E lines / 0 rooms — every FF&E finding understates real scroll co…
- **width / state:** all · all — severity medium, seat confidence 0.9
- **claim under test:** Chen Residence prints 'the FF&E schedule, by room · 1 group · 3 lines' with all 3 lines under one 'Not in a room yet' folio — the room-lens promise (T4's success bar) is untestable here.
- **verdict:** `stands`
- **reason:** The head's counts are read straight off the data, so a three-line one-group seed is what those strings report; nothing in the code inflates or normalises them.
- **evidence:** ffe-section.tsx:1084 (`const ffeStatus = \`the FF&E schedule, by room · ${ffeCounts}\``)

### F06 — No door anywhere answers 'everything in install'
- **width / state:** all · all — severity blocker, seat confidence 0.8
- **claim under test:** Path today is 'none — no fleet/roster tier; ⌘K searches names, not phases' (instrument T2); confirmed no phase-filter control on the ticket, letterhead, or spine in any captured state.
- **verdict:** `stands`
- **reason:** deriveTicket returns a fixed eight rows and none of them is a filter; the spine's marks jump to sections, not phases; the ⌘K registry's verbs are surfaces and acts, with no phase predicate.
- **evidence:** ticket-derivation.ts:780-793; doc-spine.tsx:106-115 (onJump(s.key)); registry.tsx:259-295

### F07 — Stage word breaks mid-syllable in the glyph rail
- **width / state:** 1280 · all — severity high, seat confidence 0.95
- **claim under test:** 56px column: `PUT` / `DOWN` wrapped, seven unlabelled rule glyphs, then `Project` / `ACTIV` / `E` — ACTIVE broken mid-word across two lines — then `In hand` / `21m`. No `ON THIS PAPER`, no region names.
- **verdict:** `stands`
- **reason:** The caption span carries `break-words`, and the comment beside it states the break is deliberately preferred over being clipped by the rail's overflow-x-hidden.
- **evidence:** doc-spine.tsx:129 (`block break-words text-[11px] ... min-[1440px]:text-[12px]`); doc-spine.tsx:123-128 (the rationale comment)

### F08 — Folding a region drops keyboard focus to <body>
- **width / state:** all · mid — severity high, seat confidence 0.9
- **claim under test:** Measured: focus started on 'Sync from the schedule' inside #money-region-body; after Fold the body is null and document.activeElement is <body>. Unfolding is disciplined (focus lands on <h2 id='money-region-heading'>); folding has no equivalent.
- **verdict:** `stands`
- **reason:** The fold path is asymmetric by construction: every unfold sets a ref and calls focusRegionHeading, while every onFold is a bare setFolded(true) that unmounts the head and body with no focus handling.
- **evidence:** project-approval-document.tsx:600 (`onFold={() => fold.setFolded(true)}`) vs :569-573 (unfoldFocusRef + focusRegionHeading); fold-seam.tsx:41-44

### F09 — Boards, drawings, spec and people vanish below the top
- **width / state:** all · seam — severity high, seat confidence 0.9
- **claim under test:** `BOARDS`, `DRAWINGS`, `SPEC`, `PEOPLE` are ticket rows. Once the seam pins, the frame carries only `THE JOB · PROJECT` / `$6,200 owed you · 3 unspecified`, and the rail lists `Client approvals`, `Schedule`, `Pieces`, `Money` — none of the four.
- **verdict:** `stands`
- **reason:** The eight rows are inside `{unfolded && ...}`, so pinning unmounts them outright; the seam prints only the identity line and at most two exception phrases.
- **evidence:** job-ticket.tsx:401-407; ticket-derivation.ts:849-856 (`.slice(0, 2)`)

### F10 — Five money statements, four numbers, one screen
- **width / state:** all · all — severity high, seat confidence 0.9
- **claim under test:** `MONEY $6,200 owed you, 15 days · $16,330 deposit not drawn` (ticket) · `Money` / `$6,200 OWED` (spine) · `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14` (red letter) · `MONEY · SENT / INV-2026-W02` ×2 (margin).
- **verdict:** `stands`
- **reason:** Four independent derivations print money on one screen — the ticket's Money row, the running index's money rung, the red-letter rows and the margin's money cards — with no shared suppression.
- **evidence:** ticket-derivation.ts:653-657; spine-shelved-blocks.tsx:58-67; red-letter-zone.tsx:85-99; margin-rail.tsx:635

### F11 — One screen scrolled and nothing has condensed yet
- **width / state:** 1440 · seam — severity high, seat confidence 0.9
- **claim under test:** With the letterhead fully off screen, the frame still shows all eight rows `ROOMS · PIECES · DRAWINGS · SPEC · BOARDS · MONEY · DATES · PEOPLE`, the `NEEDS ATTENTION · IN ONE PLACE` block and `MESSAGE THE CLIENT`. Measured header/summary share at s1: 60.7%; active region 10.4%.
- **verdict:** `stands`
- **reason:** The capture at s1 shows FOLD ↑ and all eight rows still standing, which is what the code allows: the pin only fires when the ticket's own sentinel leaves the viewport, and the sentinel sits immediately above the sticky element.
- **evidence:** shots/w1440-rich-s1.png; job-ticket.tsx:345-348 (sentinel in flow directly above the section); job-ticket.tsx:219-226

### F12 — On a proposal the rail is almost entirely empty
- **width / state:** 1440 · all — severity high, seat confidence 0.9
- **claim under test:** Proposal doc at 1440 s0: the 200px spine prints `← PUT DOWN`, four marks, `Proposal` / `AWAITING SIGNATURE`, `JUST YOU · VISIBLE TO THE STUDIO` — ink 13.9%, longest empty run 657px. The 232px margin prints `IN THE MARGIN + NOTE` and `The margin — decisions, messages, and money gather here`.
- **verdict:** `stands`
- **reason:** Both rail blocks are structurally absent on a proposal: paperRegionsForSection returns [] for every pre-work section so SpineRunningIndex renders null, and SpineTimer returns null without a held project.
- **evidence:** document-index.ts:76-82 (`return []`); spine-running-index.tsx:61; spine-timer.tsx:100 (`if (!heldProjectId) return null`)

### F13 — Below the fold the paper stops naming the job
- **width / state:** all · all — severity blocker, seat confidence 0.95
- **claim under test:** The pinned seam prints `THE JOB · PROJECT` over `$6,200 owed you · 3 unspecified` and `UNFOLD ↓`. The rail prints `Project` / `ACTIVE`. Neither prints `Chen Residence` or a household. At seam, mid and foot no frame contains the client's name.
- **verdict:** `stands`
- **reason:** deriveTicketIdentity composes only `The job · <Section>` plus an optional phase; the client's name is never an input. The rail caption prints the section label, not the household.
- **evidence:** ticket-derivation.ts:795-802; doc-spine.tsx:128-135

### F14 — At 390 there is no way to jump to a region
- **width / state:** 390 · all — severity blocker, seat confidence 0.9
- **claim under test:** The sheet lists only the seven stages — `Brief NOT RECORDED` … `Care —` — then `IN THE MARGIN · 7`. `Client approvals`, `Schedule`, `Pieces` and `Money` appear nowhere; reaching Pieces means scrolling ~1,050px of an 844 frame (normalised to the 844 frame).
- **verdict:** `stands`
- **reason:** The spine sheet iterates sections, then rooms, then margin items — there is no region list in it — and the running index is gated to ≥1440.
- **evidence:** mobile-sheets.tsx:455-507 (sections), :509-536 (rooms), :538-575 (margin); doc-spine.tsx:141 (`hidden min-[1440px]:block`)

### F15 — At 1280 the spine is six unlabeled bars, no words at all
- **width / state:** 1280 · all — severity blocker, seat confidence 0.9
- **claim under test:** Compact rail shows only thin colored marks; "Project" wraps to "ACTIV/E" and "In hand" wraps to "In/hand" — no "Client approvals"/"Schedule"/"Pieces"/"Money" text is present anywhere.
- **verdict:** `narrows`
- **reason:** Words do print at 1280: 'Put down' is min-[1180px]:inline and the active caption block is hidden min-[1180px]:block, which is why the seat's own observation quotes 'ACTIV/E' and 'In/hand'. There are seven marks, not six, and each carries an aria-label.
- **evidence:** doc-spine.tsx:52 (`min-[1180px]:inline`); doc-spine.tsx:122-136; doc-spine.tsx:64-120 (seven sections, aria-label per cell)
- **revised claim:** At 1280 the spine's seven section marks are unlabelled glyphs — the only words the rail prints are 'Put down', the active section's own two-line caption, and the compact timer.

### F16 — Pre-work spreads have no region DOM to index at all
- **width / state:** 1440 · top — severity high, seat confidence 0.95
- **claim under test:** The proposal doc renders zero [data-region-head] and zero [data-index-region] elements — confirmed twice by direct DOM query. Its content ('PROPOSAL · WITH THE CLIENT', 'Sent Aug 27 · not opened yet', 'SCOPE & ENGAGEMENT · CORE · STAGE 03') is inline in page.tsx, head at :2006.
- **verdict:** `stands`
- **reason:** paperRegionsForSection returns an empty array for every section that is not project/install/care, so a proposal mounts no [data-index-region] root and the index renders null.
- **evidence:** document-index.ts:76-82; spine-running-index.tsx:61 (`if (entries.length === 0) return null`)

### F17 — The margin never changes as I move down the paper
- **width / state:** 1440 · all — severity high, seat confidence 0.9
- **claim under test:** At top, seam, mid and foot the rail prints the same seven chips in the same order — `MONEY · DRAFT`, `MONEY · SENT INV-2026-W01`, `MONEY · SENT INV-2026-W02`, `TIME · AUG 29`, `TIME · AUG 27`, `MONEY · VENDOR PAYMENT DUE`. Scrolled 2,000px into `Pieces`, nothing beside me is about pieces.
- **verdict:** `stands`
- **reason:** Margin ordering is needs-action floats, then anchor order, then the settled fold — a memo over the item rows with no scroll or viewport input anywhere in the component.
- **evidence:** margin-rail.tsx:345-350 (the ordering comment and useMemo); margin-rail.tsx:635 (`{raised.map(renderItem)}`)

### F18 — At 1280 the margin covers the work and names itself twice
- **width / state:** 1280 · all — severity high, seat confidence 0.9
- **claim under test:** A fixed `MARGIN ←` tab at the right edge; pressing it opens a 360px panel headed `IN THE MARGIN` / `CLOSE`, whose body prints `IN THE MARGIN` again 200px lower, over the paper.
- **verdict:** `stands`
- **reason:** The sheet header prints 'In the margin' and is hidden only from 1440; MarginRail's own body header prints the same words again, so both are on screen in the 1180-1439 sheet.
- **evidence:** margin-rail.tsx:264-275 (`sticky ... min-[1440px]:hidden`, 'In the margin'); margin-rail.tsx:489-491

### F19 — Closed margin tab hides seven items behind no number
- **width / state:** 1280 · all — severity high, seat confidence 0.9
- **claim under test:** The only margin affordance at 1280 is the fixed tab reading `MARGIN ←`. Behind it sit seven `.doc-elevated` chips (three of them invoices). The tab prints no count, and the closed state is indistinguishable from a document with an empty margin.
- **verdict:** `stands`
- **reason:** The trigger's children are exactly the word 'Margin' and an arrow; no count, badge or aria-description is passed.
- **evidence:** margin-rail.tsx:227-237

### F20 — A proposal prints eight rows of nothing above its answer
- **width / state:** 1440 · top — severity high, seat confidence 0.9
- **claim under test:** `No rooms yet` · `5 unspecified` · `Nothing filed` · `0 of 5 specified · by room` · `No boards yet` · `Nothing moving yet` · `No dates yet` · `No roster yet` — ~300px — above `Sent Aug 27 · not opened yet` and `NUDGE CLIENT USER`, on a doc that already prints `THE JOB · PROPOSAL`.
- **verdict:** `stands`
- **reason:** deriveTicket always returns the same eight rows, and regionDoor degrades to `none` rather than dropping the row when the spread does not mount that region.
- **evidence:** ticket-derivation.ts:780-793; ticket-derivation.ts:781-788 (regionDoor → {kind:'none'})

### F21 — Every region's spine scent disappears between 1280 and 1440
- **width / state:** 1280 · all — severity high, seat confidence 0.9
- **claim under test:** At 1280 the spine shows only Put down, seven marks, Project/ACTIVE and the compact timer — no "On this paper" list, no region labels, no values (measured: 8 interactive children at 1440 drop to 3 at 1280).
- **verdict:** `stands`
- **reason:** Both the running-index wrapper and the SpineTimer/presence block are `hidden min-[1440px]:block`, so the whole scent layer is a breakpoint away.
- **evidence:** doc-spine.tsx:141; doc-spine.tsx:145-154

### F22 — The index lists regions but not their size or trouble
- **width / state:** 1440 · all — severity high, seat confidence 0.85
- **claim under test:** `ON THIS PAPER` / `Client approvals 0 IN THE LOG` / `Schedule NOT SCHEDULED` / `Pieces 3 PIECES · 0 ROOMS` / `Money $6,200 OWED`. Four equal rows: no extent, no distance, no mark of which one is overdue — though the paper below carries `$3,800 overdue`.
- **verdict:** `stands`
- **reason:** Each index row renders exactly a label span and a value span; no exception rank, extent or distance is passed into SpineRunningIndex.
- **evidence:** spine-running-index.tsx:96-114; spine-shelved-blocks.tsx:88-101 (the four values built)

### F23 — The line shows production state but not vendor or damage state
- **width / state:** all · mid — severity high, seat confidence 0.85
- **claim under test:** `Møbler Lounge Chair — Bouclé · ×2` / `Nordic Atelier` / `IN PRODUCTION` / `$5,700`; `Custom Walnut Sectional — 3 pc` / `Woodward & Sons` / `RECEIVED` / `$6,800`. No acknowledgement state, no claim act; the head's ledger offers only `SPEC THE 3 UNSPECIFIED →`, `ADD A LINE`, `BILL 3 UNINVOICED LINES…
- **verdict:** `narrows`
- **reason:** The line's own state vocabulary does include damage: LineStamp resolves a 'damaged' kind and the hover wash turns terracotta for it, and the line unfold carries claim lifecycle acts. What is genuinely absent is a PO-acknowledgement state and a file-a-claim act.
- **evidence:** ffe-section.tsx:214-216 (`case 'damaged': return 'damaged'`); ffe-section.tsx:224-229 (ffeWashTone); line-unfold.tsx:188-260 (ClaimActs)
- **revised claim:** The FF&E line carries production and damage state but no PO-acknowledgement state, and no act that files a claim — the line's claim controls only advance a claim that already exists.

### F24 — The dominant CLS shift is a silent late data-arrival, not motion
- **width / state:** 1440 · mid — severity high, seat confidence 0.85
- **claim under test:** Normal motion CLS total 0.1286 (20 entries); reduced motion 0.1318 (8 entries). One shift of 0.1189 dominates both, at ~3.3-3.6s, attributed to the Schedule 'needs attention' banner and 'No active phase ha[s started]' arriving from a query.
- **verdict:** `stands`
- **reason:** Nothing in the schedule region or the needs block is animated; both bodies swap on query settle, and no reduced-motion rule in globals.css touches a data-arrival swap.
- **evidence:** schedule-rule-region.tsx:178-211 (both branches are plain conditional renders); globals.css:283-1523 (the nine reduce blocks all target animations/transitions)

### F25 — Drawings and Spec ticket rows are unreachable below 1440
- **width / state:** 390 · top — severity high, seat confidence 0.75
- **claim under test:** "DRAWINGS · Nothing filed" and "SPEC · 0 of 3 specified · by room" print with a -> arrow at 1440 but job-ticket.tsx:267,283 makes a dead leaf (no route, not wide) print no arrow and not press.
- **verdict:** `misread`
- **reason:** planroom and specbook both declare routeSegments, and the page passes shelfRouteFor for both, so `routes[door.shelf]` is truthy and the deadLeaf branch never applies to those two rows. Below 1440 they render as `<a href='/doc/{id}/plans'>` and `/spec-book`.
- **evidence:** shelves.ts:50-62 (routeSegment 'plans' / 'spec-book'); page.tsx:762-765 (`planroom: shelfRouteFor('planroom', routeId) ?? undefined`); job-ticket.tsx:283-289

### F26 — The rail's biggest number is the session timer
- **width / state:** 1440 · all — severity medium, seat confidence 0.85
- **claim under test:** Below the index: a bordered card with `IN HAND` / `18 min` / `PAUSE` / `+ LOG`, then `JUST YOU · VISIBLE TO THE STUDIO` — about 210px, and `18 min` is the largest non-Playfair figure in the rail. The drawer already prints `IN HAND TODAY 1h 00m`.
- **verdict:** `stands`
- **reason:** The elapsed figure is font-mono text-[17px]; every other string in the rail is 11-12px.
- **evidence:** spine-timer.tsx:140 (`font-mono text-[17px] tracking-[0.04em]`); doc-spine.tsx:129-135, spine-running-index.tsx:97-113

### F27 — Five of eight ticket rows print only absence
- **width / state:** all · top — severity medium, seat confidence 0.85
- **claim under test:** `ROOMS No rooms yet`, `DRAWINGS Nothing filed`, `BOARDS No boards yet · start one`, `DATES No install date yet`, `PEOPLE Nobody on it yet` — 180px of a 900px frame. Thin-seed dependent; on a real project these carry payloads but still cost the same 8 rows.
- **verdict:** `stands`
- **reason:** The eight rows are unconditional, so a spread with nothing recorded pays the same eight-row height in honest empties.
- **evidence:** ticket-derivation.ts:780-793; job-ticket.tsx:402-407 (one wrapper per row, unconditionally mapped)

### F28 — Nine lines of prose sit above every margin item
- **width / state:** 1440 · all — severity medium, seat confidence 0.85
- **claim under test:** `– The margin on the right is where decisions and money gather. Esc puts the document down — and the hours log themselves while it's in your hand.` then `APPEARS ONCE · RECEDES ON USE` — nine wrapped lines, ~230px, above `IN THE MARGIN` and the first chip.
- **verdict:** `stands`
- **reason:** The first-touch note is the first child of MarginRail's body on every project document, above the 'In the margin' header row, and carries the default 'Appears once · Recedes on use' caption.
- **evidence:** margin-rail.tsx:462-468; margin-note.tsx:99 (caption default); margin-rail.tsx:488-491 (the header that follows)

### F29 — Approvals emptiness printed twice on one screen
- **width / state:** 1440 · top — severity medium, seat confidence 0.85
- **claim under test:** Spine at y252: `Client approvals` / `0 IN THE LOG`. Paper at y792: `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓`. Same region, same emptiness, 540px apart, in two different type registers.
- **verdict:** `stands`
- **reason:** The rail's approvals value and the paper's approvals fold summary are two separate derivations of the same emptiness, printed in two different type registers on one screen.
- **evidence:** spine-shelved-blocks.tsx:88-95 (approvalsValue into the index); project-approval-document.tsx:556-572 (`${leadPhrase} · ${authoredPhrase}`)

### F30 — The reduced-motion hook starts false and has no document consumer
- **width / state:** all · all — severity medium, seat confidence 0.85
- **claim under test:** hooks/useReducedMotion.ts starts state false (:4) and corrects in an effect (:7-10). No file under components/document imports it — the Document's motion policy is CSS media queries only (9 reduce blocks plus one no-preference gate in globals.css).
- **verdict:** `stands`
- **reason:** useState(false) is the initial value and the media query is only read in an effect; a grep for the hook across components/document returns no importer.
- **evidence:** useReducedMotion.ts:4 (`useState(false)`), :6-10; no match for `useReducedMotion` under components/document

### F31 — Fourteen percent of every frame is read at no state
- **width / state:** 1440 · all — severity medium, seat confidence 0.8
- **claim under test:** Present at all four states and read at none: the `IN HAND` card (25,400px²), `JUST YOU · VISIBLE TO THE STUDIO` (6,800), the margin first-touch note (53,360), the seven-mark row (9,900), the studio drawer (86,400) = 181,860px² = 14.0% of 1440×900.
- **verdict:** `stands`
- **reason:** All five elements are unconditional at ≥1440 and none takes scroll, section or region as an input, so they occupy the same pixels in every state.
- **evidence:** doc-spine.tsx:143-154; spine-timer.tsx:128-181; margin-rail.tsx:462-468; studio-drawer.tsx:289

### F32 — The 390px mobile sheet is more legible than the 1280px "compact" rail
- **width / state:** 390 · all — severity medium, seat confidence 0.75
- **claim under test:** Mobile spine sheet prints full words ("Brief / NOT RECORDED", "Project / ACTIVE"...) for all 7 stages; the 1280px rail shows the same information as unlabeled glyphs only.
- **verdict:** `stands`
- **reason:** The mobile sheet prints label and sub for all seven sections as text rows; the compact rail prints the same seven as bare marks plus one caption.
- **evidence:** mobile-sheets.tsx:455-507 (label at :466, sub at :476); doc-spine.tsx:64-120

### F33 — Margin swaps from an overlay sheet to a sticky column at 1440
- **width / state:** 1280 · all — severity medium, seat confidence 0.7
- **claim under test:** 1180–1439: fixed tab "MARGIN ←" opens a focus-trapped, Esc-dismissed 360px sheet with a scrim. ≥1440: the same content is a permanent sticky 232px column, always open, no scrim.
- **verdict:** `stands`
- **reason:** One element carries both regimes: fixed/translate-x-full sheet from 1180 with a scrim and a focus trap, sticky col-start-3 from 1440.
- **evidence:** margin-rail.tsx:258-262; margin-rail.tsx:242-250 (scrim); margin-rail.tsx:135-198 (trap)

### F34 — Continuous seam height breaks every region landing
- **width / state:** all · seam — severity blocker, seat confidence 0.85
- **claim under test:** `[data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px) }` (globals.css:1034). scrollIntoView resolves scroll-margin once at call time; a seam that keeps changing during the smooth scroll lands the head off by up to 283px.
- **verdict:** `narrows`
- **reason:** The mechanism is real but today's error is bounded by one seam height, not 283px: the ticket publishes --doc-seam-height only in the pinned-and-folded state and removes it otherwise, so a jump started unpinned resolves scroll-margin at 0 and lands under a ~64px seam that appears mid-scroll.
- **evidence:** job-ticket.tsx:248-259 (removeProperty when `!pinned || unfolded`); globals.css:1034; use-document-running-index.ts:206-215 (scrollIntoView at call time)
- **revised claim:** A seam whose height changes during a smooth scroll mis-lands the region head by up to one seam height (~64px today, more under a continuously-condensing seam), because scroll-margin-top is resolved once at scrollIntoView call time.

### F35 — No browserslist; only Playwright declares a browser matrix
- **width / state:** all · all — severity high, seat confidence 0.95
- **claim under test:** No `browserslist` key in apps/designer-portal/package.json, no .browserslistrc, none at the repo root. The only declared matrix is playwright.config.ts:54-68 — chromium, firefox AND webkit, all enabled. So WebKit is in scope by the only artefact that says anything.
- **verdict:** `stands`
- **reason:** No `browserslist` key in apps/designer-portal/package.json or the repo root, and no .browserslistrc anywhere; playwright.config.ts declares chromium, firefox and webkit.
- **evidence:** playwright.config.ts:54-68; apps/designer-portal/package.json (no browserslist key)

### F36 — The 1500-char regex currently passes on a comment
- **width / state:** all · all — severity high, seat confidence 0.95
- **claim under test:** Measured: the real `data-active-section` attribute (page.tsx:1942) is 1128 chars from `<SectionStageLineMount` (:1964) — 372 chars of headroom, not 600. A comment at :1962 containing the literal 'data-active-section>' matches at 162 chars, so the test passes on prose.
- **verdict:** `stands`
- **reason:** Measured: the attribute at :1942 is 1109 chars from `<SectionStageLineMount` (391 headroom), and the comment at :1962 carries the same literal within ~160 chars of the mount, so the regex has a prose fallback once the real window exceeds 1500.
- **evidence:** stage2-approval-cutover-contract.test.ts:19; page.tsx:1942 (attribute), :1962 (comment containing `<div data-active-section>`), :1964 (mount)

### F37 — Registering the seam var kills four var() fallbacks
- **width / state:** all · seam — severity high, seat confidence 0.9
- **claim under test:** `animation-timeline: scroll()` on a custom property requires @property registration. A registered property always computes, so `var(--doc-seam-height, 0px)` at globals.css:1026, :1034, :1037 and money-region.tsx:48 loses its fallback arm.
- **verdict:** `stands`
- **reason:** There are exactly four `var(--doc-seam-height, 0px)` sites, all relying on the fallback arm while the property is unregistered and the ticket removes it whenever unpinned.
- **evidence:** globals.css:1026, :1034, :1037; money-region.tsx:48; job-ticket.tsx:250-253 (removeProperty)

### F38 — Every seam assertion is jsdom; landings are untested
- **width / state:** all · seam — severity high, seat confidence 0.9
- **claim under test:** job-ticket.test.tsx:519/:524/:529 assert the property string only ('' / /px$/ / ''). jsdom has no layout, so a mis-landing after a seam change is invisible to the whole unit suite; no e2e asserts a landed region head's y.
- **verdict:** `stands`
- **reason:** All three seam assertions read only the property string on documentElement, and no e2e file measures a landed region head's box — a grep for boundingBox across e2e/document returns only shell/spine/margin/paper column checks.
- **evidence:** job-ticket.test.tsx:519, :524, :529; e2e/document/quiet-release-contracts.spec.ts:74-161 (column boxes only)

### F39 — The three fold voices have no non-persisting slot
- **width / state:** all · mid — severity high, seat confidence 0.9
- **claim under test:** `folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)` (use-region-fold.ts:121). Every path that changes folded either writes localStorage (setFolded, :129-135) or is a caller prop. A scroll-driven fold would therefore persist a state the designer never chose.
- **verdict:** `stands`
- **reason:** setFolded is the only mutator and it always calls writeExplicit; the sole non-persisting input is the caller's defaultFolded/forceOpen props.
- **evidence:** use-region-fold.ts:118-136 (`setExplicit(value); writeExplicit(docId, region, value)`); use-region-fold.ts:121

### F40 — At 390 the header is a screen and a quarter
- **width / state:** 390 · top — severity high, seat confidence 0.9
- **claim under test:** First region head y=1054 against an 844 frame — 124.9% (normalised to the 844 frame). The resting frame holds `Chen Residence`, `No client linked — attach one ↗`, the seam, `NEEDS ATTENTION · IN ONE PLACE`, `MESSAGE THE CLIENT`, `PREVIEW AS THE CLIENT`, `SHARING · MILESTONES CALL SHEET · 0` and thr…
- **verdict:** `stands`
- **reason:** At 390 the ticket rests as the seam, and the stack below it still mounts the guide/red-letter zone, the instruments row and the letterhead margin chips before any region head.
- **evidence:** job-ticket.tsx:202, :244; page.tsx:1838-1889; shots/m390-rich-s0.png

### F41 — Folding a region drops keyboard focus to <body>
- **width / state:** all · seam — severity high, seat confidence 0.9
- **claim under test:** Probe: folding the Money region with focus on 'Sync from the schedule' unmounts the body and leaves document.activeElement as <body> — no redirect at all.
- **verdict:** `stands`
- **reason:** Same defect as F08 at the seam state: onFold is a bare setFolded(true) with no focus contract, while the unfold path lands focus on the heading.
- **evidence:** region-head.tsx:177-187 (the Fold control calls onFold and nothing else); project-approval-document.tsx:600; fold-seam.tsx:41-44

### F42 — Ticket collapse is a silent 283px jump for SR users
- **width / state:** 1440 · seam — severity high, seat confidence 0.9
- **claim under test:** grep for aria-live across job-ticket.tsx, fold-seam.tsx, use-region-fold.ts returns zero hits; the ticket's aria-expanded flips with no reader interaction and nothing announces the change.
- **verdict:** `narrows`
- **reason:** There is no aria-live in job-ticket.tsx, but the collapse is not unannounced for every reader: when the reader was standing inside the ticket, focus is moved onto the Fold button, whose label and aria-expanded flip together. The silence is for a reader who was NOT inside the ticket.
- **evidence:** job-ticket.tsx:235-242 (`foldRef.current?.focus()`), :388-398 (`aria-expanded={unfolded}` + 'Unfold ↓'); no aria-live anywhere in job-ticket.tsx
- **revised claim:** A scroll-driven ticket collapse is announced only to a reader who was already focused inside the ticket (focus moves to the Fold button); for every other screen-reader user the 283px change is silent, since job-ticket.tsx declares no live region.

### F43 — Sections/margin/drawer mobile sheets have role=dialog but no name
- **width / state:** 390 · all — severity high, seat confidence 0.9
- **claim under test:** mobile-sheets.tsx:260 sets aria-label only when kind==='timer' (compactTimer); the 'drawer', 'spine' and 'margin-item' sheet kinds render role="dialog" aria-modal="true" with aria-label={undefined}.
- **verdict:** `stands`
- **reason:** aria-label is `compactTimer ? 'Time in hand' : undefined` on the role=dialog wrapper, and no aria-labelledby is set for the other three kinds.
- **evidence:** mobile-sheets.tsx:255-261 (`aria-label={compactTimer ? 'Time in hand' : undefined}` beside `role="dialog" aria-modal="true"`)

### F44 — Seam height is content-dependent, not a constant
- **width / state:** 390 · seam — severity high, seat confidence 0.85
- **claim under test:** The publish effect's deps are [pinned, unfolded, seam.identity, seam.exceptions] (job-ticket.tsx:258). At 390 the seam prints 'THE JOB · PROJECT' over '$6,200 owed you · 3 unspecified' with 'UNFOLD ↓' sharing the second line; a two-exception seam is taller again. Frame normalised to 844.
- **verdict:** `stands`
- **reason:** The publish effect measures getBoundingClientRect().height at run time and re-runs on seam.identity and seam.exceptions, so a longer exception line republishes a taller seam.
- **evidence:** job-ticket.tsx:254-258 (`Math.round(height)`, deps `[pinned, unfolded, seam.identity, seam.exceptions]`)

### F45 — The 700ms jump lock does not own the seam's height
- **width / state:** all · mid — severity high, seat confidence 0.85
- **claim under test:** JUMP_LOCK_MS 700 (use-document-running-index.ts:35) holds the reading line through a smooth scroll but says nothing about the seam. Measured: four index clicks show zero flicker on the line — the lock works, and it is the only place a lens could freeze the seam.
- **verdict:** `stands`
- **reason:** The lock only sets activeKey and a ref; it never touches the ticket, the seam variable or scroll.
- **evidence:** use-document-running-index.ts:35, :161-180 (setActiveKey + lockRef only)

### F46 — Two schedule doors, two names, 200px apart
- **width / state:** 1440 · seam — severity high, seat confidence 0.85
- **claim under test:** `Schedule dates UNFOLD ↓` sits ~200px above a 24px head reading `Schedule` / `0 phases · nothing active · next milestone —` / `FOLD ↑`; between them the line `No active phase handoffs need attention.` and a bare word `BAND`. The rail meanwhile says `Schedule NOT SCHEDULED`.
- **verdict:** `stands`
- **reason:** Two different regions both name themselves Schedule with two different fold keys: the rule's 'Schedule dates' seam and the ledger's 'Schedule' head, deliberately kept separate in the fold-key union.
- **evidence:** schedule-rule-region.tsx:181-192 (name='Schedule dates'), :199-210 (name='Schedule'); use-region-fold.ts:27-31 ('schedule' vs 'schedule-rule' comment)

### F47 — Top band asks her to hold twenty things at once
- **width / state:** 1440 · top — severity high, seat confidence 0.85
- **claim under test:** Counted literally on the paper: title, `No client linked — attach one ↗`, four vitals (`START —`, `TARGET —`, `SET A BUDGET BAND`, `PHASES ▸`), ticket head, eight rows, zone label, two needs, instruments row, approvals seam = 20. Whole frame with spine, margin and drawer = 45.
- **verdict:** `stands`
- **reason:** The mount order in page.tsx puts letterhead, ticket, guide/red-letter, instruments, mobile chips and the approvals mount all above the fold with no density control between them.
- **evidence:** page.tsx:1797-1900

### F48 — Five money chips take a third of the phone frame
- **width / state:** 390 · seam — severity high, seat confidence 0.85
- **claim under test:** Normalised to the 844px frame: `MONEY · DRAFT Draft invoice`, `MONEY · SENT INV-2026-W01`, `MONEY · SENT INV-2026-W02`, `MONEY · VENDOR PAYMENT DUE Vendor payment …` ×2 stack for ~250px = 29.6%. None is anchored to anything in view.
- **verdict:** `stands`
- **reason:** The mobile chips are an unbounded flex-wrap of every anchored margin row at that anchor, with no cap and no scroll container.
- **evidence:** mobile-margin-chips.tsx:89 (`flex flex-wrap gap-1.5 ... min-[980px]:hidden`), :110-125 (`chips.map`)

### F49 — First FF&E line sits at eighty-two percent of the phone frame
- **width / state:** 390 · mid — severity high, seat confidence 0.85
- **claim under test:** Normalised to 844px: seam 0–64, then `Pieces` / `the FF&E schedule, by room · 1 group · 3 lines` / `3 unspecified · 3 uninvoiced`, then four stacked ledger acts, then `Plan the project work` prose, then `FOLIO + FILE`, then `Not in a room yet`; `Møbler Lounge Chair — Bouclé · ×2` begins at ~690px.
- **verdict:** `stands`
- **reason:** The FF&E region head is preceded by a rule with mt-5 and followed by mb-1.5, with the status line, exception line and full ledger all above the first folio and line.
- **evidence:** ffe-section.tsx:1290 (`RegionRule className='mt-5'`), :1302-1315 (head wrapper `mb-1.5` + status + exceptions + actions)

### F50 — Seam drops a third standing exception with no trace
- **width / state:** all · all — severity high, seat confidence 0.85
- **claim under test:** The seam prints the worst two by rank and drops any third whole (`.slice(0, 2)`), printing `Nothing overdue` only when there are none. On this thin seed it prints `$6,200 owed you · 3 unspecified`; at install week with four standing exceptions two are invisible at every offset below top.
- **verdict:** `stands`
- **reason:** The seam takes the worst two by rank and drops the rest with `.slice(0, 2)`; no count, no ellipsis, no residue.
- **evidence:** ticket-derivation.ts:849-856

### F51 — IntersectionObserver uses threshold:0, no rootMargin band, no debounce
- **width / state:** 1440 · seam — severity high, seat confidence 0.85
- **claim under test:** job-ticket.tsx: new IntersectionObserver((...) => setPinned(...), { threshold: 0 }) on one sentinel; no second threshold, no rootMargin.
- **verdict:** `stands`
- **reason:** One observer, one sentinel, `{ threshold: 0 }`, no rootMargin, no debounce, setPinned called straight from the callback.
- **evidence:** job-ticket.tsx:219-226

### F52 — Ticket pin, triggered only by scroll, silently relocates focus
- **width / state:** 1440 · seam — severity high, seat confidence 0.85
- **claim under test:** job-ticket.tsx:235-244 resets fold to null and refocuses the Fold button on every pin change when focus was inside the ticket; the pin itself is driven by an IntersectionObserver on scroll, not a keypress.
- **verdict:** `narrows`
- **reason:** The relocation is deliberate and conditional, not indiscriminate: it fires only when the reader was inside the ticket AND focus has already fallen out of it, and it lands on the Fold button — the control that puts the rows back — with the rationale stated in the comment above.
- **evidence:** job-ticket.tsx:213 (focusWithin ref), :229-242 (`if (!focusWithin.current || stillInside) return; foldRef.current?.focus()`)
- **revised claim:** A scroll-driven pin relocates keyboard focus onto the ticket's Fold button for a reader who was standing on a row that the pin unmounts — a scroll gesture producing a focus move, though a deliberate and bounded one.

### F53 — The fold is the only render-cost control; FF&E is unvirtualized
- **width / state:** 1440 · mid — severity high, seat confidence 0.8
- **claim under test:** ffe-section.tsx is 1549 lines with no useVirtualizer and no react-virtual import, rendering one row plus a 48px crop per line ('Møbler Lounge Chair — Bouclé · x2', 'Oak Drum Side Table', 'Custom Walnut Sectional — 3 pc'). Unmounting on fold is what keeps 60 rows out of the DOM.
- **verdict:** `stands`
- **reason:** ffe-section.tsx is 1549 lines with no virtualiser import of any kind; the region fold's unmount is the only thing that keeps rows out of the DOM.
- **evidence:** ffe-section.tsx (1549 lines, no `virtual` match anywhere); use-region-fold.ts:121; ffe-section.tsx:1291-1300 (folded → FoldSeam only)

### F54 — A folded region never shows whether she or the system closed it
- **width / state:** all · mid — severity high, seat confidence 0.8
- **claim under test:** FoldSeam renders identically (italic name, mono summary, "unfold ↓") whether folded state came from her own localStorage choice or a live-derived default (use-region-fold.ts:121).
- **verdict:** `stands`
- **reason:** FoldSeam's props are headingId, name, summary, onUnfold, surfaceKey and regionKey — no origin, and the hook returns only the resolved boolean.
- **evidence:** fold-seam.tsx:46-82; use-region-fold.ts:121, :138 (returns `{ folded, toggle, setFolded }`)

### F55 — Seven marks give every phase the same visual weight
- **width / state:** 1440 · top — severity high, seat confidence 0.8
- **claim under test:** Each StrataMark is 22px (xs) regardless of phase; 'project' shelves four sub-regions (approvals/schedule/ffe/money) while 'brief'/'discovery'/'direction'/'proposal' shelve zero.
- **verdict:** `narrows`
- **reason:** Size and weight are uniform — every mark is `xs` at ≥1440 — but the marks are not visually identical: each takes `fill={fillStateAtSection(s.key)}` and only the active one breathes.
- **evidence:** doc-spine.tsx:66-88 (fill + breathing per mark), :103, :113-114 (xs at ≥1440); strata-mark.tsx:41
- **revised claim:** The seven spine marks are all one size and weight, so a phase that shelves four regions reads no larger than one that shelves none — only fill level and the active mark's breath distinguish them.

### F56 — A return visit lands me below the job's own name
- **width / state:** 1440 · top — severity high, seat confidence 0.75
- **claim under test:** A returning reader is dropped at `[data-active-section]` rather than the top when the doc is in her recent list. Coming back after ten days the first frame can carry `THE JOB · PROJECT` / `$6,200 owed you · 3 unspecified` and folded seams, with `Chen Residence` already scrolled off.
- **verdict:** `stands`
- **reason:** The resume-landing effect scrolls [data-active-section] into view whenever the doc is in the recent list and the section sits below 60% of the viewport, so the letterhead is skipped past.
- **evidence:** page.tsx:1166-1174

### F57 — Plan room / Spec book leaves have no route below 1440px
- **width / state:** 1280 · top — severity high, seat confidence 0.75
- **claim under test:** 10-code-anatomy.md: 'A dead leaf (leaf door, not wide, no route) prints no → and does not press — job-ticket.tsx:267,283.' Instrument sheet confirms Drawings/Spec are dead below 1440.
- **verdict:** `misread`
- **reason:** Same refutation as F25: shelfRouteFor supplies /doc/{id}/plans and /doc/{id}/spec-book, so those rows are `<a href>` links below 1440, not dead leaves. A dead leaf only occurs for a shelf whose routeSegment is null (callsheet, clientcopy), and those rows are not leaf doors.
- **evidence:** shelves.ts:50-62, :130-135; page.tsx:762-765; job-ticket.tsx:266-267, :283-289

### F58 — The compact tier carries a third fewer working pixels
- **width / state:** 1280 · all — severity high, seat confidence 0.75
- **claim under test:** Classified px²: 1440 s0 carrying 203,820 (15.7%) → 1280 s0 carrying 145,044 (12.6%), a 28.8% absolute drop, while `neither` rises from 61.2% to 64.6%. The tier removes 66,120px² of anchored money chips and returns only 48px of content measure (900→948).
- **verdict:** `stands`
- **reason:** At 1180-1439 the margin panel is translate-x-full and pointer-events-none until the trigger is pressed, so its content contributes nothing to the resting frame while the paper gains only the 56px→0 spine difference.
- **evidence:** margin-rail.tsx:200-201, :259-262

### F59 — Scroll-pinned seam and a chosen fold look and read identically
- **width / state:** 1440 · mid — severity high, seat confidence 0.75
- **claim under test:** Ticket seam: "THE JOB · PROJECT / $6,200 owed you · 3 unspecified … UNFOLD ↓". Region fold seam: italic name + mono summary + "unfold ↓" — same three-part grammar, same case.
- **verdict:** `narrows`
- **reason:** The grammar rhymes but the type does not: the ticket seam sets its identity in the mono SEAM_IDENTITY_CLASS over a 13.5px medium sentence, while a region seam sets an italic serif name beside a mono summary in a three-column grid.
- **evidence:** job-ticket.tsx:381-386 + :106 (SEAM_IDENTITY_CLASS); fold-seam.tsx:64-79 (`font-heading text-[12.5px] italic` + `truncate font-mono text-[11px]`)
- **revised claim:** The pinned ticket seam and a chosen region fold share the same three-part grammar (name · summary · unfold verb) and so read as one kind of thing, though their type treatments differ.

### F60 — R99's zero-shift mechanism exists once, not where the header needs it
- **width / state:** 1440 · seam — severity high, seat confidence 0.75
- **claim under test:** Schedule's pinned glance uses top: var(--doc-seam-height,0px) (globals.css:1026); the Ticket's own fold uses a plain state swap with no such compensation for what it visually displaces.
- **verdict:** `stands`
- **reason:** The only zero-shift device in the shell is the schedule glance's zero-height sticky wrapper reading the seam variable; the ticket's own fold is a plain conditional render with no compensation for the 283px it removes.
- **evidence:** schedule-rule.tsx:546-548 (`pointer-events-none sticky top-0 z-[3] h-0`); globals.css:1026; job-ticket.tsx:401 (`{unfolded && (`)

### F61 — content-visibility containment may kill the R126 hover wash
- **width / state:** 1440 · mid — severity high, seat confidence 0.7
- **claim under test:** `content-visibility: auto` implies `contain: layout paint`, creating a stacking context. `.row-wash` is `position:absolute; inset:0; z-index:-1` (globals.css:327-334) on FF&E lines. A z-index:-1 child of a fresh stacking context paints behind that context's own ground, not behind the row.
- **verdict:** `misread`
- **reason:** `.has-wash` already declares `isolation: isolate`, so every washed row is its own stacking context today and the wash's z-index:-1 already paints behind the row's content and above its ground. An added content-visibility container does not change that, and inset:0 overflows nothing.
- **evidence:** globals.css:321-325 (`.has-wash { position: relative; isolation: isolate; }`); globals.css:327-336 (`.row-wash` inset:0, z-index:-1); ffe-section.tsx:480 (`has-wash` on the line)

### F62 — PO acknowledgment and damage-claim filing both require leaving the document
- **width / state:** all · all — severity high, seat confidence 0.7
- **claim under test:** Instrument sheet T13/T14: 'the answer is off-paper, on a sheet over it' / 'the FF&E body to see it, then out of the document to act on it'. Chen Residence FF&E line shows only a stage chip (IN PRODUCTION / RECEIVED), no ack or claim state.
- **verdict:** `narrows`
- **reason:** The document does reach PO material without leaving: the FF&E line unfold labels a Purchase order and opens the PO preview, and it carries claim lifecycle acts. What is off-document is the acknowledgement itself and the filing of a new claim.
- **evidence:** line-unfold.tsx:390 (`label="Purchase order"`); po-preview.tsx:292; line-unfold.tsx:188-260 (ClaimActs); orders-book-receiving.tsx:83 (the claim lifecycle's home)
- **revised claim:** Acknowledging a PO and filing a new damage claim both require leaving the document, though the FF&E line unfold does surface the purchase order and can advance a claim that already exists.

### F63 — "PO" / "purchase order" is never printed anywhere on the document
- **width / state:** all · all — severity high, seat confidence 0.6
- **claim under test:** No ticket row, region head, or margin card uses the words "purchase order" or "PO" — the closest is "MONEY" and generic vendor-payment margin cards.
- **verdict:** `narrows`
- **reason:** True of the ticket rows, region heads and margin cards, but not of the document: the FF&E line unfold prints the words `Purchase order` and opens a sheet headed the same.
- **evidence:** line-unfold.tsx:390; po-preview.tsx:292 ('Resend purchase order' / 'Purchase order')
- **revised claim:** No ticket row, region head, margin card or spine label prints 'PO' or 'purchase order' — the words appear only once an FF&E line is unfolded.

### F64 — A late-arriving fold default can close a region she is reading
- **width / state:** all · mid — severity high, seat confidence 0.6
- **claim under test:** use-region-fold.ts:110-116 only refuses to override an EXPLICIT choice; with explicit===null a defaultFolded that resolves true after first paint (rendered open) flips folded=true with no gesture from her.
- **verdict:** `stands`
- **reason:** The latch effect refuses a late default only when an EXPLICIT choice already exists; with explicit === null a defaultFolded that resolves true after first paint latches and folds a region rendered open.
- **evidence:** use-region-fold.ts:110-116 (`setLatchedDefault((current) => (explicit === null ? defaultFolded : current))`), :121

### F65 — Damage is visible on the FF&E line; filing a claim is not reachable from there
- **width / state:** all · mid — severity high, seat confidence 0.5
- **claim under test:** FF&E line status tags read "IN PRODUCTION" / "RECEIVED" with no visible "report damage" action; per anatomy, claim filing lives on the Receiving page, off-document.
- **verdict:** `narrows`
- **reason:** Filing is indeed off-document, but the line unfold is not inert on claims: it renders ClaimActs for an open item-grain claim, and the line's hover wash turns terracotta for a damaged line.
- **evidence:** line-unfold.tsx:182-260 (ClaimActs, 'notify-vendor-of-ffe-claim' / 'open-resolve-ffe-claim'); ffe-section.tsx:224-229; orders-book-receiving.tsx:83
- **revised claim:** Damage is visible on the FF&E line and an existing claim can be advanced from the line unfold, but FILING a claim exists only on the Receiving page, off the document.

### F66 — Margin rail carries only Money and Time cards, never Orders/PO
- **width / state:** 1440 · all — severity high, seat confidence 0.5
- **claim under test:** All 7 margin cards visible are 'MONEY · DRAFT', 'MONEY · SENT' ×2, 'TIME · AUG 29', 'TIME · AUG 27', 'MONEY · VENDOR PAYMENT DUE' ×2 — no PO-ack, damage, or backorder card kind present.
- **verdict:** `stands`
- **reason:** MarginRail renders whatever kinds the margin query returns; no PO-ack, damage or backorder kind is constructed anywhere in the component, and the accent map has no such entry.
- **evidence:** margin-rail.tsx:294-679; margin-item.tsx:52-62 (`deriveKindLine(row)`)

### F67 — Ledger-sheet round trip's scroll-offset preservation is unverified
- **width / state:** all · all — severity high, seat confidence 0.4
- **claim under test:** Probe §6 confirms the margin sheet doesn't reflow the document at 1280 (region-head Y unchanged before/after); no probe or shot exercises the Orders ledger sheet named by T13/T14, so scroll-offset preservation there is untested.
- **verdict:** `stands`
- **reason:** No probe or shot exercises the Orders ledger sheet; the DocSheet primitive that would carry it leaves the document mounted, so the question is untested rather than answered.
- **evidence:** overlays/doc-sheet.tsx:199+ (the document beneath stays mounted); probe/03-interactive-probe.md §6

### F68 — A condensing seam gets zero shadow budget
- **width / state:** all · seam — severity medium, seat confidence 0.95
- **claim under test:** shadow-gate.test.ts allows one box-shadow in globals.css spent only by .doc-elevated (:80-95), fails on any new shadow under src/ (:97-105), and caps .doc-elevated at three TSX files (:129-136) — already spent on studio-drawer, margin-item and doc-sheet.
- **verdict:** `stands`
- **reason:** The gate is three-fold and all three are already spent: one box-shadow rule in globals.css, and it must be `.doc-elevated`; no new shadow anywhere under src/; and at most three files under components/document may wear the class — currently studio-drawer, margin-item and doc-sheet.
- **evidence:** shadow-gate.test.ts:84-95, :97-105, :129-136; globals.css:294-296

### F69 — Two e2e files pin the rail width to the pixel
- **width / state:** 1280 · all — severity medium, seat confidence 0.9
- **claim under test:** quiet-responsive-shell.spec.ts:224-228 asserts the spine boundingBox width is 55-57px; quiet-release-contracts.spec.ts:108-118 asserts the same with bounds [0,56], and :150-158 pins paper [200,1208] / margin [1208,1440] at 1440. shelf-panel.test.tsx:145 pins min-[1440px]:left-[200px].
- **verdict:** `stands`
- **reason:** Two independent e2e specs assert the compact spine's box at 55-57px, and shelf-panel.test.tsx pins a class derived from the 200px full spine.
- **evidence:** quiet-responsive-shell.spec.ts:220-228; quiet-release-contracts.spec.ts:108-118, :150-158; shelf-panel.test.tsx:145

### F70 — Contrast gate hard-codes five spine filenames
- **width / state:** 1440 · all — severity medium, seat confidence 0.9
- **claim under test:** contrast.test.ts:313-341 scans exactly spine-running-index.tsx, spine-shelved-blocks.tsx, spine-timer.tsx, doc-spine.tsx and margin-rail.tsx. Renaming, splitting or extracting any of them drops it from the scan with no failure — the test stays green and stops testing.
- **verdict:** `stands`
- **reason:** RAIL_FILES is a literal array of five paths read with readFileSync; a renamed or split file simply drops out of the scan and the assertion still passes on an empty offender list.
- **evidence:** contrast.test.ts:325-341 (`const RAIL_FILES = [...]`, `expect(offenders).toEqual([])`)

### F71 — The reader's Unfold is destroyed on every pin change
- **width / state:** all · seam — severity medium, seat confidence 0.9
- **claim under test:** `setFold(null)` runs in the effect keyed on [pinned] (job-ticket.tsx:236). A designer who presses 'UNFOLD ↓' while pinned loses that choice the moment she scrolls back above the sentinel; the ticket re-derives from `!pinned && !seamAtRest`.
- **verdict:** `stands`
- **reason:** setFold(null) is the first statement of an effect keyed on [pinned], so any pin transition erases the reader's explicit fold and re-derives from `!pinned && !seamAtRest`.
- **evidence:** job-ticket.tsx:234-236; job-ticket.tsx:244

### F72 — E2E pins the ticket to exactly eight rows at three widths
- **width / state:** all · seam — severity medium, seat confidence 0.9
- **claim under test:** quiet-responsive-shell.spec.ts asserts toHaveCount(8) at 1440 (:173-176) and at 1280 and 390 (:183-196); responsive-document-shell.test.tsx:655-687 asserts 8 rows plus data-unfolded='true' at 1440. Any intermediate header density showing fewer rows is a red e2e.
- **verdict:** `stands`
- **reason:** Eight rows are asserted at 1440, at 1280, and at 390 after an explicit Unfold, plus a jsdom assertion of eight rows with data-unfolded='true' at 1440.
- **evidence:** quiet-responsive-shell.spec.ts:175, :185, :195; responsive-document-shell.test.tsx:655-687

### F73 — Region seams sit at three different gaps
- **width / state:** all · mid — severity medium, seat confidence 0.9
- **claim under test:** Measured button-to-button gaps on the same document at every width: header-stack-end→`Schedule` 56px, `Schedule`→`Pieces` 29px, `Pieces`→`money-head` 6px. Visually they read as one uniform list of seams; the ask's words are `each section is crammed into the next`.
- **verdict:** `stands`
- **reason:** There is no shared inter-region spacing token or wrapper: each region declares its own margin, ranging from mt-8 through mt-6, mt-5, mt-4, mt-2, mb-5 and nothing at all.
- **evidence:** care-band.tsx:249; project-approval-document.tsx:588 vs :565 (folded carries no spacing at all); ffe-section.tsx:1204-1210 (`scroll-mt-16` only); money-region.tsx:227-230; schedule-spine.tsx:1055-1060

### F74 — Muted ramp's lightest step has narrow headroom before 4.5:1 fails
- **width / state:** all · all — severity medium, seat confidence 0.9
- **claim under test:** #65594E measures 5.32:1 on rail stock #E8E3DB (floor is 4.5:1) — computed relative luminance 0.1046 against a floor of 0.1327; room for roughly one more small step, not a new tint family.
- **verdict:** `stands`
- **reason:** Computed from the declared tokens: --text-faint #65594E on --doc-rail-stock #E8E3DB is 5.317:1 against a 4.5:1 floor, with relative luminance 0.1046 — the figures the seat states.
- **evidence:** globals.css:104 (`--text-faint: #65594E`), :58 (`--doc-rail-stock: #E8E3DB`); contrast.test.ts:233, :304-311

### F75 — The index attaches by 2s query-retry, not subscription
- **width / state:** all · mid — severity medium, seat confidence 0.85
- **claim under test:** ATTACH_RETRY_MS 250 x ATTACH_RETRIES 8 (use-document-running-index.ts:37-38) — about 2s. attach() re-queries and re-schedules only while attached.size < ordered.length; a region root that mounts after the window is never observed at all.
- **verdict:** `stands`
- **reason:** attach() re-queries every root and re-schedules itself only while attached.size < ordered.length, eight times at 250ms; the docstring names the late-mount case as a known limit.
- **evidence:** use-document-running-index.ts:36-38, :120-133 (`if (attached.size < ordered.length && retriesLeft > 0)`), :12-19

### F76 — No contrast gate covers reduced ink on paper
- **width / state:** 1440 · mid — severity medium, seat confidence 0.85
- **claim under test:** contrast.test.ts gates the rail stock #E8E3DB and rail inks (:297-311) but nothing on paper #FCFAF6. Computed for the record: the muted ramp's lightest step #65594E on paper is 6.5:1, roughly one lightening step above the 4.5:1 floor.
- **verdict:** `misread`
- **reason:** contrast.test.ts DOES gate ink on paper: PAPER_STOCKS includes --doc-paper #FCFAF6, and the whole muted ramp is asserted at 4.5:1 against all three stocks. The seat's own 6.5:1 figure for #65594E on paper is exactly what that test enforces.
- **evidence:** contrast.test.ts:233-240 (MUTED_RAMP, PAPER_STOCKS incl. '--doc-paper': '#FCFAF6'), :282-295 ('clears 4.5:1 on the paper, the desk ground and the rail')

### F77 — The foot names no job and offers no way up
- **width / state:** 1440 · foot — severity medium, seat confidence 0.85
- **claim under test:** At foot: `No authorizations recorded yet`, `The accounts · this project … UNFOLD ↓`, `Closing the book 0 OF 6 CLOSED OUT UNFOLD ↓`, `– You're on the call sheet as lead. Who else is on the job?`, `LEAH HARTWELL HANDS ON THE WORK: YOU`. No client name, no return-to-top, and 40%+ of the frame is blank…
- **verdict:** `stands`
- **reason:** The colophon prints the studio name, the hands line and two acts; it takes no client name and declares no return-to-top control.
- **evidence:** doc-colophon.tsx:101-135

### F78 — The sent state prints twice, in two tenses, with two nudges
- **width / state:** 1440 · seam — severity medium, seat confidence 0.85
- **claim under test:** `Sent Aug 27 · not opened yet` with `NUDGE CLIENT USER`, then ~230px lower `Proposal · v1` / `AWAITING SIGNATURE` / `SENT YESTERDAY — NUDGE CLIENT USER` and a strip `SENT Aug 27` · `OPENED not yet` · `READING —` · `MOST READ —`.
- **verdict:** `stands`
- **reason:** The send state is derived independently by the guide/needs zone and by the proposal head block in page.tsx, with no cross-suppression.
- **evidence:** page.tsx:1838-1847 (guide/red-letter); page.tsx:2006 (the proposal head, `mb-1.5 mt-5 flex items-baseline justify-between`)

### F79 — The needs block moves under me seconds after landing
- **width / state:** 1440 · top — severity medium, seat confidence 0.85
- **claim under test:** A single layout shift of value 0.1189 fires ~3.3–3.6s in, attributed to the `Needs attention · in one place… Invoice…` section and the `Schedule dates… unfold ↓… No active phase ha[s started]` section. Total CLS 0.1286 normal, 0.1318 reduced — reduced motion does not suppress it.
- **verdict:** `stands`
- **reason:** Both surfaces named in the shift render straight off query state with no reserved height and no motion to reduce, so the reflow is a data arrival that reduced motion cannot suppress.
- **evidence:** schedule-rule-region.tsx:178-211; red-letter-zone.tsx:82 (`if (rows.length === 0) return null`); probe/03-interactive-probe.md:206-224

### F80 — The roster question is asked 2,000px from its door
- **width / state:** 1440 · foot — severity medium, seat confidence 0.85
- **claim under test:** `PEOPLE Nobody on it yet` and `CALL SHEET · 0` sit at top; the actual invitation `– You're on the call sheet as lead. Who else is on the job?` with `FROM THE ROLODEX` / `NEW PERSON` / `LATER` sits at the foot, ~2,000px lower, and neither frame contains the other.
- **verdict:** `stands`
- **reason:** The People row's door is the call-sheet overlay and prints its own emptiness at the top; the roster invitation is a separate foot-of-paper surface with its own acts.
- **evidence:** ticket-derivation.ts:735-741; doc-colophon.tsx:101-109

### F81 — The furniture schedule is called "Pieces," never "FF&E" or "schedule"
- **width / state:** 1440 · top — severity medium, seat confidence 0.85
- **claim under test:** Ticket row reads "PIECES — 3 unspecified"; region head reads "Pieces / the FF&E schedule, by room · 1 group · 3 lines" — "FF&E" appears only in 11px subtitle text.
- **verdict:** `stands`
- **reason:** The region's name is the literal 'Pieces' and 'FF&E' appears only inside the status sentence beneath it.
- **evidence:** ffe-section.tsx:1084 (`the FF&E schedule, by room · ...`); ffe-section.tsx:1291 (`name="Pieces"`); ticket-derivation.ts:524-531

### F82 — Two In-hand clocks on screen showing different times
- **width / state:** 1440 · all — severity medium, seat confidence 0.85
- **claim under test:** Spine card prints `IN HAND` / `18 min` / `PAUSE` `+ LOG`; the studio drawer 700px below prints `IN HAND TODAY 1h 09m`. Both present at all four states; the only distinguishing word is `TODAY`, same mono, same size.
- **verdict:** `stands`
- **reason:** Two independent elapsed readouts render simultaneously at ≥1440 from two different clocks — the spine's session timer and the drawer's day total — in the same mono register.
- **evidence:** spine-timer.tsx:128-140; studio-drawer.tsx:289 (the fixed strip that carries 'In hand today')

### F83 — Foot spends 310px teaching a concept with no content
- **width / state:** 1440 · foot — severity medium, seat confidence 0.85
- **claim under test:** `AUTHORIZATIONS & TRADE SCOPES` / `An authorization releases signed schedule items for purchasing — release one from the schedule. A trade scope buys work: written here, bid here, signed by the client, then engaged.` / `No authorizations recorded yet` / `DRAFT A TRADE SCOPE`.
- **verdict:** `stands`
- **reason:** Confirmed verbatim, though in a different file than cited: the label, the three-line explanation, the GuidedEmptyState 'No authorizations recorded yet' and its 'Draft a trade scope' action are one block, and with zero rows the head's own action is suppressed so the act prints once.
- **evidence:** commercial/authorizations-ledger.tsx:165-168 (label), :181-185 (prose), :198-205 (GuidedEmptyState), :169 (head action gated on rows.length > 0)

### F84 — Rail's ink density never changes across scroll states
- **width / state:** 1440 · all — severity medium, seat confidence 0.85
- **claim under test:** Spine ink utilisation reads 54.9% at s0, s1, s2, and s3 alike (rich/1440); marker-row rects and interactive-child count (8) are identical at every state.
- **verdict:** `narrows`
- **reason:** The rail's ink AREA is constant, but one element in it does answer to scroll: the running index's aria-current row and the 2px reading rule measured off the active button move as the reading band crosses regions.
- **evidence:** spine-running-index.tsx:44-59 (measure on activeKey), :76-82 (the moving rule), :86 (`aria-current`); doc-spine.tsx:46-154 (nothing else reads scroll)
- **revised claim:** Nothing in the rail changes weight, size or ink area across scroll states; the only scroll-responsive element is the running index's current-row bolding and its 2px reading rule.

### F85 — Closed margin sheet is a nameless landmark at 1280
- **width / state:** 1280 · all — severity medium, seat confidence 0.85
- **claim under test:** margin-rail.tsx:251 sets aria-label only when isFullRail; at 1180-1439, before the reader taps 'MARGIN ←', the <aside> has no role override and no aria-label.
- **verdict:** `misread`
- **reason:** A closed compact margin is not a landmark at all: the aside carries aria-hidden and inert while `!visible`, so AT never reaches it; once open it takes role=dialog with aria-labelledby pointing at the 'In the margin' title.
- **evidence:** margin-rail.tsx:249-255 (`aria-labelledby={openAsSheet ? titleId : undefined}`, `aria-hidden={!visible || ...}`, `inert={...}`); margin-rail.tsx:266-271 (the title element)

### F86 — Reduced motion has zero in-app toggle; OS setting only
- **width / state:** all · all — severity medium, seat confidence 0.85
- **claim under test:** hooks/useReducedMotion.ts has no consumers under components/document/; no motion setting exists in interruption-settings.tsx or any other found settings surface.
- **verdict:** `stands`
- **reason:** The only reduced-motion source is the OS media query — nine CSS blocks plus Tailwind's motion-safe/motion-reduce variants — and interruption-settings.tsx contains no motion setting at all.
- **evidence:** useReducedMotion.ts (no consumer under components/document); interruption-settings.tsx (no 'motion' match); globals.css:283-1523

### F87 — Schedule glance drifts continuously under a moving seam
- **width / state:** 1440 · seam — severity medium, seat confidence 0.8
- **claim under test:** `[data-document-shell] section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px) }` — the ticket's only sticky top-0 sibling. A continuous seam re-resolves its sticky constraint every frame, so the glance slides against the paper independently.
- **verdict:** `narrows`
- **reason:** The selector is live but resolves against schedule-rule.tsx, not schedule-rule-region.tsx, and it targets a ZERO-HEIGHT sticky wrapper — so today the glance simply parks at the published seam height. The continuous drift is a property of a proposed condensing seam, not of the current code.
- **evidence:** globals.css:1026; schedule-rule.tsx:546-548 (`aria-label="Schedule rule"`, `pointer-events-none sticky top-0 z-[3] h-0`); job-ticket.tsx:248-259 (two-value publication)
- **revised claim:** Under a continuously-condensing seam the schedule's zero-height pinned glance, which offsets itself by top: var(--doc-seam-height), would re-resolve its sticky constraint every frame and slide against the paper.

### F88 — Density must not be a React transition
- **width / state:** all · mid — severity medium, seat confidence 0.8
- **claim under test:** The whole document tree contains zero startTransition/useTransition calls (only an unrelated mutation-hook name in rooms/piece/custom-commission-sheet.tsx). A transition yields and can be interrupted; a density lagging scroll by frames reads as the paper catching up.
- **verdict:** `stands`
- **reason:** A grep for startTransition/useTransition across components/document returns only an unrelated mutation-hook name in the custom-commission sheet.
- **evidence:** components/document/rooms/piece/custom-commission-sheet.tsx:365 (`useTransitionCustomCommissionRevision`) is the only match

### F89 — I cannot tell a shipped fold from one I chose
- **width / state:** all · top — severity medium, seat confidence 0.8
- **claim under test:** `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓` and `Schedule dates UNFOLD ↓` are folded on arrival. The fold choice persists per doc/region in `localStorage`; nothing on the seam distinguishes ships-folded from I-folded-it-ten-days-ago.
- **verdict:** `stands`
- **reason:** The persisted choice and the derived default resolve into one boolean before the seam is rendered, and the seam takes no argument that could distinguish them.
- **evidence:** use-region-fold.ts:42-58 (the storage key), :121; fold-seam.tsx:46-82

### F90 — Starting a new client exists only behind a keystroke
- **width / state:** all · all — severity medium, seat confidence 0.8
- **claim under test:** Nothing on the paper or in the drawer (`Library`, `People`, `The Scans`, `Ledgers ↑`, `Find anything ⌘K`, `IN HAND TODAY`, `THE POST`) names starting a client. The two verbs `Capture a lead · begin a Brief` and `Open a project · no proposal needed` are only visible after typing.
- **verdict:** `stands`
- **reason:** Both verbs are registry entries with global scope reached through the command bar's events; nothing in the spine, the letterhead, the ticket or the drawer strip names them.
- **evidence:** registry.tsx:259-285 (`scope: 'global'`); command-bar.tsx:176-188 (openCaptureLead / openOpenProject); studio-drawer.tsx:289

### F91 — Measurement file scores empty-state prose as active region
- **width / state:** 1440 · mid — severity medium, seat confidence 0.8
- **claim under test:** File reports rich/1440/s2 activeRegion 775px (86.1%). On screen those rows include `Plan the project work` / `List the concrete work here so the next action and due date stay visible in the document.` / `ADD THE FIRST TASK` and `FOLIO + FILE`. ~433 of 775 is not the FF&E schedule.
- **verdict:** `stands`
- **reason:** The FF&E region root is one element, so any classifier keyed on it counts the empty-state prose and the folio strip as active region.
- **evidence:** ffe-section.tsx:1204-1210 (one `<section data-index-region="ffe">` wrapping head, empty states and lines)

### F92 — Foot is the least working frame on the paper
- **width / state:** 1440 · foot — severity medium, seat confidence 0.8
- **claim under test:** Classified: carrying 190,200px² (14.7%), orienting 194,660 (15.0%), neither 911,140 (70.3%). On screen: the 310px authorizations block, `The accounts · this project $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`, `Closing the book 0 OF 6 CLOSED OUT`, a roster nudge, then ~115px of blank paper.
- **verdict:** `stands`
- **reason:** The foot mounts explanatory blocks and closing furniture, none of which is a working control on the document's current job.
- **evidence:** commercial/authorizations-ledger.tsx:165-205; care-band.tsx:249-262; doc-colophon.tsx:101-135

### F93 — Four fold verbs on one screen, none says why
- **width / state:** 1440 · seam — severity medium, seat confidence 0.8
- **claim under test:** In one frame: ticket `FOLD ↑`, `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓`, `Schedule dates UNFOLD ↓`, `Schedule … FOLD ↑`. Nothing distinguishes folded-because-she-folded-it from folded-by-default.
- **verdict:** `stands`
- **reason:** Four fold controls with three implementations — the ticket's Fold/Unfold, a region head's tertiary Fold, and two FoldSeams — and none carries a reason or an origin.
- **evidence:** job-ticket.tsx:388-398; region-head.tsx:177-187; fold-seam.tsx:46-82; use-region-fold.ts:97-142

### F94 — A proposal-stage document exposes zero region landmarks at all
- **width / state:** 390 · top — severity medium, seat confidence 0.8
- **claim under test:** The prework (proposal) document renders zero [data-region-head]/[data-index-region] elements anywhere (confirmed via DOM query, research/12); "On this paper" running index is entirely absent on the spine for this doc type.
- **verdict:** `stands`
- **reason:** A proposal document is a pre-work section, and paperRegionsForSection returns [] for those, so no [data-index-region] root and no index block exist.
- **evidence:** document-index.ts:76-82; spine-running-index.tsx:61; doc-spine.tsx:141

### F95 — Pressing Fold under forceOpen visibly does nothing
- **width / state:** all · all — severity medium, seat confidence 0.75
- **claim under test:** setFolded's guard "if (forceOpen && value) return;" swallows the fold; the route carries no ToastProvider (layout.tsx:38-42) so there is no message telling her why the press had no effect.
- **verdict:** `misread`
- **reason:** The scenario cannot occur: forceOpen has exactly one consumer, and that consumer's open branch passes RegionHead neither bodyId nor onFold, so showFold is false and no Fold control is rendered under forceOpen at all.
- **evidence:** care-band.tsx:188-191 (`forceOpen: nearClose` — the only usage); care-band.tsx:313-330 (RegionHead without bodyId/onFold); region-head.tsx:84 (`const showFold = Boolean(bodyId && onFold)`)

### F96 — Top ~145px of rail mixes leaving, the arc, the moment, and right-now
- **width / state:** 1440 · top — severity medium, seat confidence 0.75
- **claim under test:** Put down (leaving), 7-mark row (whole arc), active caption (this moment), and the breathing dot (right now) all sit within the first ~145px of vertical rail space.
- **verdict:** `stands`
- **reason:** Put down, the seven-mark list and the active caption are the first three children of the aside, in that order, before any timer or index.
- **evidence:** doc-spine.tsx:46-55, :64-120, :122-136

### F97 — Boards/Money/People ticket doors need one extra tap at 390
- **width / state:** 390 · top — severity medium, seat confidence 0.75
- **claim under test:** "THE JOB · PROJECT / $6,200 owed you · 3 unspecified / UNFOLD ↓" is the ticket's resting state at 390 (seamAtRest, job-ticket.tsx:202,244) — the 8 rows exist only after that tap.
- **verdict:** `stands`
- **reason:** seamAtRest is true below 1180, so `unfolded = fold ?? (!pinned && !seamAtRest)` resolves false at rest and the eight rows are unmounted until the reader presses Unfold.
- **evidence:** job-ticket.tsx:202, :244, :401

### F98 — "Closing the book" is unexplained accounting idiom at the foot
- **width / state:** 1440 · foot — severity medium, seat confidence 0.7
- **claim under test:** "Closing the book · 0 OF 6 CLOSED OUT" prints with no subtitle explaining what the six items are or what closing means here.
- **verdict:** `stands`
- **reason:** The seam's summary is `${done} of ${items.length} closed out` beside the bare name 'Closing the book'; no subtitle or eyebrow explains the six items in the folded form.
- **evidence:** care-band.tsx:249-262

### F99 — Seven marker bars are clipped by the rail edge
- **width / state:** 1280 · all — severity medium, seat confidence 0.7
- **claim under test:** At 1280 the seven StrataMark rows stack vertically (measured 41.5×373.5) inside a 56px column with `px-1.5` and `min-[1180px]:overflow-x-hidden`; the rendered bars begin at x=0 with their left ends cut off.
- **verdict:** `narrows`
- **reason:** Clipping is real but symmetric and small: the `sm` mark is 48px wide against a 44px inner rail (56px minus px-1.5 on both sides), and the jump button centres it, so roughly 2px is lost at each side to overflow-x-hidden — not a left-only cut.
- **evidence:** strata-mark.tsx:41 (`sm: { w: 48, ... }`); doc-spine.tsx:44 (`min-[1180px]:overflow-x-hidden min-[1180px]:px-1.5`); doc-spine.tsx:106-115 (`w-full min-w-11 ... justify-center`)
- **revised claim:** At 1280 the seven 48px `sm` marks overflow the rail's 44px inner measure and lose about 2px at each end to the spine's own overflow-x-hidden.

### F100 — Screen says no client and offers two client acts
- **width / state:** 1440 · top — severity medium, seat confidence 0.7
- **claim under test:** `No client linked — attach one ↗` at y119 sits above `MESSAGE THE CLIENT` and `PREVIEW AS THE CLIENT` at y767 and above `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14 — send a reminder` at y651. Thin-seed dependent, but the composition permits the contradiction on any document.
- **verdict:** `stands`
- **reason:** The contradiction is structural, not seed-specific: canSendNote is `Boolean(projectId || clientProfileId)`, so 'Message …' renders on any project document whether or not a household is linked, while the chip beside it prints 'No client linked — attach one'.
- **evidence:** letterhead-instruments.tsx:301 (`const canSendNote = Boolean(projectId || clientProfileId)`), :317-331; household-chip.tsx:57

### F101 — Margin count at 390 exists only inside the Sections sheet
- **width / state:** 390 · all — severity medium, seat confidence 0.7
- **claim under test:** "In the margin · 7" prints only inside the Sections sheet (m390-mobile-spine-sheet.png); at rest, only line-anchored chips show (one chip visible on m390-rich-s0), with no persistent count badge anywhere in the mobile bar.
- **verdict:** `stands`
- **reason:** The 'In the margin · N' heading is rendered only inside the spine sheet; the mobile bar's three zones are the section handle, the primary action or timer, and More — no count.
- **evidence:** mobile-sheets.tsx:538-540; mobile-bar.tsx:213-298

### F102 — Active label pair duplicates the on-page region heading
- **width / state:** 1440 · all — severity medium, seat confidence 0.7
- **claim under test:** Rail caption reads 'Pieces' at s2, matching the page's own <h2> 'Pieces' region head verbatim, at 11-12px vs the head's 24px.
- **verdict:** `narrows`
- **reason:** The cited caption cannot print 'Pieces': doc-spine.tsx renders activeSection.label, which is one of the seven section labels. The duplication the seat saw is the running index's own row.
- **evidence:** doc-spine.tsx:128-131 (`{activeSection.label}`); section-derivation.ts:59-77 (ORDER/labels); spine-running-index.tsx:96-105 (`{entry.label}`)
- **revised claim:** The running index's 'Pieces' row duplicates the page's own <h2> 'Pieces' region head verbatim, at 13px against the head's 24px.

### F103 — No presence indicator exists anywhere at 1180-1439 once hidden
- **width / state:** 1280 · all — severity medium, seat confidence 0.7
- **claim under test:** The margin rail sits closed-by-default (off-canvas sheet) at 1280 and carries no presence line in its header per the anatomy notes; the mobile bar pattern only exists below 1180 -- confidence 0.7, would settle by opening the margin sheet and account avatar at 1280 to confirm.
- **verdict:** `stands`
- **reason:** The presence line lives inside the ≥1440-only block, and no other document surface at 1180-1439 prints it — the margin panel's header carries only the title and Close.
- **evidence:** doc-spine.tsx:145-154 (`hidden min-[1440px]:mt-4 min-[1440px]:block`); margin-rail.tsx:264-283

### F104 — Any new ticket transition needs its own reduced-motion sibling
- **width / state:** all · seam — severity medium, seat confidence 0.7
- **claim under test:** None of the 12 existing prefers-reduced-motion hits in globals.css cover the ticket's pin/fold, because it currently has no animation to reduce (probe: hard cut in both motion regimes already).
- **verdict:** `stands`
- **reason:** The ticket's sticky section carries no transition or animation class, so no reduced-motion rule targets it — and none would have anything to neutralise today.
- **evidence:** job-ticket.tsx:362; globals.css:283-1523 (the nine reduce blocks name no ticket selector)

### F105 — Running-index aria-current changes on scroll with no announcement
- **width / state:** all · mid — severity medium, seat confidence 0.7
- **claim under test:** Three clean aria-current transitions recorded across a scripted scroll (approvals→schedule at 400, schedule→pieces at 1200, pieces→money at 1960) with no live region.
- **verdict:** `stands`
- **reason:** aria-current is toggled per row on every resolve with no live region and no status element anywhere in the index or its hook.
- **evidence:** spine-running-index.tsx:86 (`aria-current={current ? 'true' : 'false'}`); use-document-running-index.ts:101-113 (resolve on every intersection and scroll frame)

### F106 — Put down (Esc) needs the More menu open first at 390
- **width / state:** 390 · all — severity medium, seat confidence 0.7
- **claim under test:** At >=1180 'PUT DOWN' sits permanently at the top of the spine (doc-spine.tsx:46-55); at 390 the same act is one level deeper, inside the mobile bar's More menu (mobile-bar.tsx:285-296).
- **verdict:** `narrows`
- **reason:** Put down at 390 is one tap, not two: the spine sheet's FIRST control is '← Put down · back to the Desk', and the sheet opens straight from the bar's section handle.
- **evidence:** mobile-sheets.tsx:444-455; mobile-bar.tsx:218-232 (`onClick={openSpine}`)
- **revised claim:** At ≥1180 'Put down' sits permanently at the top of the spine; at 390 the same act is one level deeper, as the first row of the sections sheet.

### F107 — "Folded" means one thing for Money, another for Schedule
- **width / state:** 1440 · seam — severity medium, seat confidence 0.65
- **claim under test:** schedule-rule-region.tsx:181-192: the folded branch still renders the glance strip and phase-advance control beside the seam — every other region's fold hides everything but the one-line seam.
- **verdict:** `stands`
- **reason:** The schedule rule's folded branch renders the glance strip and the phase-advance control alongside the seam; approvals, money and care all render RegionRule + FoldSeam and nothing else.
- **evidence:** schedule-rule-region.tsx:180-195 (`{glance}{phaseAdvance}` inside the folded branch); money-region.tsx:225-243; project-approval-document.tsx:565-579; care-band.tsx:249-262

### F108 — An empty region's index line looks identical to a live one
- **width / state:** 1440 · top — severity medium, seat confidence 0.65
- **claim under test:** Fallback text ('Money unread', 'Nothing moving yet') and live values ('$6,200 OWED') print at the same font size, weight, and row position in the same component.
- **verdict:** `stands`
- **reason:** The fallback strings and the live rung are passed into the same `value` slot of the same entry object and rendered by one span with one class.
- **evidence:** spine-shelved-blocks.tsx:62-66 (`?? (failed ? 'Money unread' : settled ? 'Nothing moving yet' : 'Reading…')`); spine-running-index.tsx:106-113

### F109 — A line reading only `BAND` with no object
- **width / state:** 1440 · seam — severity medium, seat confidence 0.6
- **claim under test:** Between `No active phase handoffs need attention.` and the `Schedule` head, one mono line reads `BAND` and nothing else. It names no region, carries no value and presses nowhere I can tell.
- **verdict:** `stands`
- **reason:** Confirmed, and the site is identifiable: when the stage model resolves to null but a fidelity is known, the stage line renders a bare `<p role="status">{FIDELITY_WORD[fidelity]}</p>` — one word, no object. The cited mount lines are the loading/error shapes, not this one.
- **evidence:** workflow/section-stage-line.tsx:100-103 (`) : fidelity ? (<p role="status" ...>{FIDELITY_WORD[fidelity]}</p>`); section-stage-line.ts:186-190 (subLabel null when no headline)

### F110 — The "never-yield" rule for red-letter/money is nowhere codified
- **width / state:** all · top — severity medium, seat confidence 0.6
- **claim under test:** Red-letter Zone has no fold mechanism at all; nothing in code or tests states this is deliberate policy rather than an oversight (contrast with shadow-gate.test.ts, which does enforce the elevation budget mechanically).
- **verdict:** `stands`
- **reason:** RedLetterZone imports no fold hook and renders no fold control; its only escape is rows.length === 0. Nothing states that as policy the way shadow-gate.test.ts states the elevation budget.
- **evidence:** red-letter-zone.tsx:82-99 (no useRegionFold, no Fold action); shadow-gate.test.ts:80-136 (the contrasting mechanical rule)

### F111 — No 'where I've been' signal inside the active phase's four regions
- **width / state:** 1440 · all — severity medium, seat confidence 0.6
- **claim under test:** The seven marks show settled/active/future at the phase level only; within 'project' (where approvals/schedule/ffe/money all live) nothing distinguishes regions already scrolled past.
- **verdict:** `stands`
- **reason:** The index marks exactly one row aria-current and nothing else; there is no visited, passed or read state anywhere in the entry shape.
- **evidence:** spine-running-index.tsx:26-31 (entry shape `{key,label,value}`), :86; doc-spine.tsx:64-120 (marks carry only settled/active/future/unrecorded)

### F112 — No asymmetric down/up rule exists for a fast scroll crossing the pin point
- **width / state:** all · seam — severity medium, seat confidence 0.6
- **claim under test:** The single scrollY=280 trigger fires identically whether the reader is scrolling down or up, with no dwell requirement in either direction.
- **verdict:** `stands`
- **reason:** One IntersectionObserver callback sets pinned from isIntersecting; there is no direction test, dwell timer or second threshold anywhere in the component.
- **evidence:** job-ticket.tsx:219-226; job-ticket.tsx:234-244

### F113 — The ticket's 283px jump doesn't register as a Layout Shift
- **width / state:** all · seam — severity medium, seat confidence 0.6
- **claim under test:** Probe §8 CLS pass found the ticket fold's ~283px jump absent from PerformanceObserver layout-shift entries in either motion setting, despite being independently confirmed via before/after DOM measurement in §1.
- **verdict:** `stands`
- **reason:** Nothing in the ticket suppresses layout-shift reporting; the ticket itself is sticky so its own box does not move, which is consistent with the probe finding the displacement of the content below it unattributed.
- **evidence:** job-ticket.tsx:362 (`sticky top-0`); probe/03-interactive-probe.md §8

### F114 — Schedule frame is folded by default, hiding ripple preview
- **width / state:** 1440 · seam — severity medium, seat confidence 0.55
- **claim under test:** 10-code-anatomy.md: 'ScheduleRuleRegion ... folded branch prints RegionRule + FoldSeam + the glance + the phase-advance control' at schedule-rule-region.tsx:181 — folded is the resting state.
- **verdict:** `stands`
- **reason:** defaultFolded is the literal `true`, so a first visit with no stored choice opens the document with the schedule frame folded.
- **evidence:** schedule-rule-region.tsx:75-79 (`defaultFolded: true`)

### F115 — Command palette doesn't distinguish 'begin a Brief' from 'Open a project'
- **width / state:** all · all — severity medium, seat confidence 0.55
- **claim under test:** Instrument sheet T12: 'The difference between the two verbs is obvious before picking' is the success bar, but both routes ('Capture a lead · begin a Brief' vs 'Open a project · no proposal needed') sit in the same ⌘K list with no visible criterion shown.
- **verdict:** `misread`
- **reason:** Each verb carries a printed criterion: the registry gives capture-lead the subLabel 'begin a Brief' and open-project 'no proposal needed', plus a help blurb each — and the seat quotes both subLabels in its own observation.
- **evidence:** registry.tsx:262-270 (label 'Capture a lead', subLabel 'begin a Brief', blurb), :274-284 (label 'Open a project', subLabel 'no proposal needed', blurb)

### F116 — Rail says 'Money' active while the frame shows roster/authorizations
- **width / state:** 1440 · foot — severity medium, seat confidence 0.55
- **claim under test:** At s3 the rail caption reads 'Money' (bold, ruled) while the visible frame shows 'AUTHORIZATIONS & TRADE SCOPES', 'The accounts', 'Closing the book', and a roster row -- none labeled Money.
- **verdict:** `stands`
- **reason:** The foot-of-the-paper branch hands the reading line to the last attached region unconditionally, so at s3 the index marks Money while the frame shows the closing furniture below it.
- **evidence:** use-document-running-index.ts:78-87 (`if (atFoot) { setActiveKey(present[present.length - 1]); return; }`)

### F117 — Row-wash hover affordance cannot fire on a touch surface
- **width / state:** 390 · all — severity medium, seat confidence 0.55
- **claim under test:** .row-wash consumers (desk-roster.tsx, ffe-section.tsx) rely on pointerenter/pointermove for clip-path origin; no touch equivalent exists.
- **verdict:** `narrows`
- **reason:** The wash is not hover-only: `.has-wash:focus-within .row-wash` opens it to the same 150% circle, from the centre and without a sweep, so a tap that focuses a control inside the row still opens it. What touch loses is the pointer-origin sweep.
- **evidence:** globals.css:338-343 (`.has-wash:hover .row-wash, .has-wash:focus-within .row-wash`), :345-349 (the focus-only centre override); row-wash.tsx:29-34
- **revised claim:** On a touch surface the row wash loses its pointer-origin sweep (markInkPoint runs only on pointerenter/pointermove); it still opens from the centre via :focus-within when a control in the row takes focus.

### F118 — Late-arriving Schedule/needs-attention content has no SR announcement
- **width / state:** all · mid — severity medium, seat confidence 0.55
- **claim under test:** The 0.1189-value CLS shift (Workflow stage/Band/Schedule div, terracotta Needs attention section, Schedule-dates no-active-phase line) fires ~3.3-3.6s post-paint with no aria-live coverage evidenced.
- **verdict:** `narrows`
- **reason:** The needs block genuinely has none, but the sibling it replaces does: DocumentGuide renders an sr-only aria-live region, and the stage line's loading shape is a role=status with aria-live=polite. So the gap is specific to RedLetterZone and the schedule region.
- **evidence:** red-letter-zone.tsx:85-99 (no live region); document-guide.tsx:123 (`<span className="sr-only" aria-live="polite" aria-atomic="true">`); section-loading-line.tsx:26
- **revised claim:** The late-arriving RedLetterZone and schedule content carry no live region, unlike the DocumentGuide branch they displace, which announces itself.

### F119 — Guide/Red-letter substitution leaves no trace of which she got
- **width / state:** all · top — severity medium, seat confidence 0.5
- **claim under test:** page.tsx:1838-1847's ternary swaps DocumentGuide for RedLetterZone based on four hidden conditions (engagement_kind, enrichedOperationalNeeds, redLetterRows.length, deskGuidanceFailed) with no visible marker that a fallback occurred.
- **verdict:** `stands`
- **reason:** The ternary is exactly the four conditions named, and neither branch renders a marker that a substitution happened.
- **evidence:** page.tsx:1838-1847

### F120 — Only region roots clear the pinned seam, not their child controls
- **width / state:** all · mid — severity medium, seat confidence 0.5
- **claim under test:** globals.css:1034/1037 and money-region.tsx:48 set scroll-margin-top on [data-index-region] roots only; individual ticket-row links, Fold buttons and FF&E line controls carry no scroll-margin-top of their own.
- **verdict:** `stands`
- **reason:** Both global rules and the money region's inline style are scoped to [data-index-region] roots; no ticket row, fold control or FF&E line control declares scroll-margin-top of its own.
- **evidence:** globals.css:1033-1038; money-region.tsx:48, :231, :252

### F121 — Mobile margin chips likely sit under the 24px target floor
- **width / state:** 390 · all — severity medium, seat confidence 0.5
- **claim under test:** mobile-margin-chips.tsx:98,114 chips use py-[0.32rem] (~5.12px) padding around an unstyled text-[11px] line, with no explicit leading class; estimated total height ~21-26px against SC 2.5.8's 24x24 minimum.
- **verdict:** `stands`
- **reason:** The chip is a py-[0.32rem] box around an 11px line with no min-height and no leading class, so its computed height sits below the 24px target floor.
- **evidence:** mobile-margin-chips.tsx:98 (static chip), :114 (pressable chip) — `py-[0.32rem] pl-2 pr-2.5 text-[11px]`, no min-h

### F122 — Ticket seam's 'piece-stuck' exception never observed surfacing a PO problem
- **width / state:** all · top — severity medium, seat confidence 0.4
- **claim under test:** Seam prints '$6,200 owed you · 3 unspecified' (money-at-risk rank 0); RANK_ORDER also names 'piece-stuck' (rank 2) but no captured state shows this seam text, so whether it ever reads as an unacknowledged-PO signal is unconfirmed on this seed.
- **verdict:** `misread`
- **reason:** The code already answers the question: an unanswered PO IS the seam's piece-stuck exception, carrying the PO's own phrase and its sent date, fed from row.unacked_po_count on the page. It is simply zero on this seed.
- **evidence:** ticket-derivation.ts:504-514 (`? { rank: 'piece-stuck', phrase: po.phrase, standingSince: po.sentAt }`); page.tsx:1706-1713 (unansweredPo from `row.unacked_po_count`)

### F123 — The six-rung money ladder has no PO/receiving counterpart
- **width / state:** all · top — severity medium, seat confidence 0.4
- **claim under test:** Anatomy names a six-rung money ladder ('Budget · Plan · Authorized · Moved · Owed · Not drawn', I148) shelved on the spine; no equivalent rung ladder exists for PO/receiving state anywhere in the shell.
- **verdict:** `stands`
- **reason:** No rung ladder exists on the receiving side — the receiving surface reasons in PO statuses and inspection sets, not in a rung sequence.
- **evidence:** orders-book-receiving.tsx:318 (`.filter((po) => po.status === 'delivered' && !inspectedPoIds.has(po.id))`); no `rung`/`ladder` match in that file

### F124 — Schedule ripple UI (downstream damage on date move) not confirmed visible befor…
- **width / state:** all · seam — severity medium, seat confidence 0.35
- **claim under test:** Ticket prints 'DATES — No install date yet →'; this seed has 0 phases/'not scheduled', so no captured shot shows the ripple-derivation UI actually warning before a date-move commits.
- **verdict:** `misread`
- **reason:** The ripple preview is wired: the derivation has four live consumers, including the confirm strip that stands between a date move and its commit and the ghost layer that draws the downstream shift. It is unexercised on a zero-phase seed, not absent.
- **evidence:** schedule/schedule-confirm-strip.tsx, schedule/rule-ghost-layer.tsx, schedule/drafting-strip.tsx and commercial/schedule-impact-block.tsx all consume schedule-ripple-derivation / the ripple context

### F125 — Proposal send-wall state legibility for a junior is unverified in this shot set
- **width / state:** all · mid — severity medium, seat confidence 0.3
- **claim under test:** No captured shot of a proposal-stage document's send-wall state line exists among the 38 verified shots; behavior inferred from anatomy notes only.
- **verdict:** `stands`
- **reason:** No captured shot covers it; the send-wall behaviour is inferred from source only.
- **evidence:** research/01-shot-ledger.md (38 shots, none of a proposal send-wall state line)

### F126 — '← PUT DOWN' is the one control that costs the same at every state
- **width / state:** all · all — severity low, seat confidence 0.9
- **claim under test:** Present, unchanged, top-left in w1440-rich-s0/s1/s2/s3.png at identical position and size every time — a genuine bright spot, not a defect (recorded for the record, not as a problem).
- **verdict:** `stands`
- **reason:** The Put down link is the first child of a sticky rail and takes no scroll, section or region input, so it is genuinely invariant across all four states.
- **evidence:** doc-spine.tsx:46-55; doc-spine.tsx:44 (`sticky top-0`)

### F127 — The tan "needs attention" box is nearly the only color-coded signal on first sc…
- **width / state:** 1440 · top — severity low, seat confidence 0.85
- **claim under test:** Against an otherwise cream-and-charcoal page, the terracotta-bordered tan box is the one strong visual break — a junior's eye correctly snaps to it, which is a working signal worth protecting.
- **verdict:** `stands`
- **reason:** The red-letter zone is the only tinted, terracotta-bordered block in the header stack; every sibling is rules and type on paper.
- **evidence:** red-letter-zone.tsx:85-88 (`border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)]`); document-guide.tsx:75 (`border-y border-[var(--color-pearl)]`)

### F128 — No hover-only affordance found in spine, margin, or ticket
- **width / state:** all · all — severity low, seat confidence 0.85
- **claim under test:** Every hover: class in job-ticket.tsx, doc-spine.tsx, margin-rail.tsx, region-head.tsx, fold-seam.tsx pairs with a focus-visible or group-focus-visible variant; row-wash gates on :hover, :focus-within together.
- **verdict:** `stands`
- **reason:** Every hover in the shell is paired: the spine's link and jump buttons pair hover with focus-visible, and the wash rule names :hover and :focus-within in one selector.
- **evidence:** doc-spine.tsx:52 (`group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100`), :111; globals.css:338-343; margin-rail.tsx:234-236, :278-281

### F129 — Vitals line prints two dashes and an empty fold
- **width / state:** 1440 · top — severity low, seat confidence 0.8
- **claim under test:** `START — TARGET — SET A BUDGET BAND PHASES ▸`. Two fields print a dash; `PHASES ▸` opens onto nothing (0 phases configured — the toggle's box measures 189.3px before and after the click).
- **verdict:** `stands`
- **reason:** The Phases button renders unconditionally in the vitals line, while PhasesFold returns null with no phases — so on a phase-less project the toggle opens onto nothing.
- **evidence:** letterhead-vitals.tsx:444-452 (the button, no gate), :454 (`{phasesOpen && <PhasesFold .../>}`), :283 (`if (!phases || phases.length === 0) return null`)

### F130 — 270px of rail stock carries nothing at the foot of the rail
- **width / state:** 1440 · foot — severity low, seat confidence 0.8
- **claim under test:** Longest empty run on rich/1440 measures 270px (y 630-900), present unchanged at s0 through s3.
- **verdict:** `stands`
- **reason:** The rail's last child is the ≥1440 timer/presence block; below it the aside's pb-24 and h-screen leave stock with nothing on it at every state.
- **evidence:** doc-spine.tsx:145-154 (last child); doc-spine.tsx:44 (`min-[1180px]:h-screen min-[1180px]:pb-24`)

### F131 — At 390 the ticket starts already collapsed — the pin motion never happens
- **width / state:** 390 · top — severity low, seat confidence 0.8
- **claim under test:** m390-rich-s0.png shows the two-line seam ('$6,200 owed you · 3 unspecified UNFOLD ↓') at top of scroll, not the 8-row unfolded ticket 1440/1280 show at s0.
- **verdict:** `stands`
- **reason:** seamAtRest is a media match on (max-width: 1179px) with a false default, so at 390 the resting derivation is folded and the pin transition never has anything to do.
- **evidence:** job-ticket.tsx:202 (`useMediaMatch(SEAM_AT_REST_QUERY, false)`), :244; shots/m390-rich-s0.png

### F132 — Margin is last in linear Tab order at every width
- **width / state:** all · all — severity low, seat confidence 0.75
- **claim under test:** MarginRail mounts at page.tsx:2316-2334, after <main> closes at page.tsx:2305; a sequential Tab user must pass every ticket row, region, and action before reaching it.
- **verdict:** `stands`
- **reason:** ResponsiveMarginRail is a sibling that follows </main> in the source, and at ≥1440 CSS grid places it visually in column three while DOM order — and therefore Tab order — leaves it last.
- **evidence:** page.tsx:2305 (`</main>`), :2308-2334 (ResponsiveMarginRail); margin-rail.tsx:258 (`min-[1440px]:col-start-3`)

### F133 — Margin chips print the same string twice
- **width / state:** 1440 · all — severity low, seat confidence 0.7
- **claim under test:** `TIME · AUG 29` on the label line and `Time · Aug 29` on the body line, in one chip; the same in the next chip with `AUG 27`. Two of seven chips carry no information below their own label.
- **verdict:** `narrows`
- **reason:** The component prints two data fields — deriveKindLine(row) and row.title — with no rule that they differ; the duplication is a property of these seed rows, not of the rendering.
- **evidence:** margin-item.tsx:52-67 (`<MItemContent kindLine={deriveKindLine(row)} title={row.title} detail={row.detail} .../>`); shots/w1440-rich-s1.png (the two TIME chips)
- **revised claim:** Two of the seven margin chips print a title identical to their own derived kind line, because MarginItem renders both fields unconditionally and nothing suppresses a title that repeats its kind.

### F134 — `PHASES ▸` opens and reveals nothing
- **width / state:** all · top — severity low, seat confidence 0.7
- **claim under test:** The vitals line reads `START — TARGET — SET A BUDGET BAND PHASES ▸`. Pressing `PHASES ▸` flips the arrow and reveals no content on this document; the needs block separately asks me to `Name the phases for this project`. Nowhere does the frame print my phase as `4 of 6`.
- **verdict:** `stands`
- **reason:** Same mechanism as F129: the toggle is unconditional and the body returns null with zero phases, so the arrow flips and no content appears.
- **evidence:** letterhead-vitals.tsx:444-454; letterhead-vitals.tsx:283

### F135 — Margin content requires an extra tap at 1280 before it's visible
- **width / state:** 1280 · top — severity low, seat confidence 0.7
- **claim under test:** 12-layout-measurements.md caveat 4: margin renders data-margin-mode='sheet', translate-x-full (off-canvas) by default at 1180-1439px until the 'Margin' trigger is tapped.
- **verdict:** `stands`
- **reason:** visible is `isFullRail || openAsSheet`, and openAsSheet requires the reader's own `open`; until then the panel is translate-x-full, pointer-events-none, aria-hidden and inert.
- **evidence:** margin-rail.tsx:200-201, :253-262

### F136 — Instruments row spends 44px on doors nobody was sent to
- **width / state:** 1440 · top — severity low, seat confidence 0.7
- **claim under test:** `MESSAGE THE CLIENT`, `PREVIEW AS THE CLIENT`, `SHARING · MILESTONES`, `CALL SHEET · 0` sit directly under the zone whose named acts are `SEND REMINDER` and `OPEN THE SCHEDULE`. Two of the four address a client the letterhead says is `No client linked`.
- **verdict:** `stands`
- **reason:** The instruments group is one flat row of up to four acts under the guide zone, and the two client-facing ones render from `Boolean(projectId || clientProfileId)` rather than from a linked household.
- **evidence:** letterhead-instruments.tsx:301, :317-341; page.tsx:1863-1872 (mounted directly after the guide/red-letter ternary)

### F137 — Presence line is session metadata, not a navigation fact
- **width / state:** 1440 · all — severity low, seat confidence 0.7
- **claim under test:** 'JUST YOU · VISIBLE TO THE STUDIO' prints as the rail's last line at every scroll state, describing session collaboration, not document structure.
- **verdict:** `stands`
- **reason:** The presence line is the last child of the rail and prints session collaboration, with the comment stating it is deliberately unlabelled because the index above already names the paper.
- **evidence:** doc-spine.tsx:146-154

### F138 — Letterhead <header> nested in <main> exposes no landmark
- **width / state:** all · top — severity low, seat confidence 0.7
- **claim under test:** DocLetterhead root is <header id="document-project-status"> inside <main data-document-paper>; a <header> nested under sectioning content is not the 'banner' landmark.
- **verdict:** `stands`
- **reason:** The letterhead's root is a <header> and it is a descendant of <main data-document-paper>, so it is sectioning-scoped and exposes no banner landmark.
- **evidence:** doc-letterhead.tsx:52 (`<header id="document-project-status" tabIndex={-1} ...>`); page.tsx:1787-1791 (the <main> it sits inside)

### F139 — Mobile sheets have no visible, Tab-reachable close button
- **width / state:** 390 · all — severity low, seat confidence 0.7
- **claim under test:** The Dismiss button (mobile-sheets.tsx:263-269) is the full-screen backdrop with tabIndex={-1} — not in the Tab order; the only Tab-reachable close path is the Escape key, with no on-screen close icon inside the panel itself.
- **verdict:** `stands`
- **reason:** The only close control in the sheet chrome is the backdrop button at tabIndex={-1}; the panel's own first child is the grab handle, and the spine sheet's first control is 'Put down', not a close.
- **evidence:** mobile-sheets.tsx:263-269 (`aria-label="Dismiss" tabIndex={-1}`), :283-289 (grab handle); mobile-sheets.tsx:445-455

### F140 — Compact rail still mixes leaving, arc, and moment at the top
- **width / state:** 1280 · top — severity low, seat confidence 0.65
- **claim under test:** Put down, the vertical 7-mark stack, and the 'Project / ACTIVE' caption appear together above the compact timer doorway in `w1280-spine-glyph-rail.png`.
- **verdict:** `stands`
- **reason:** The compact rail's child order is identical to the full rail's for the first three children — leaving, the arc, the moment — before the compact timer doorway.
- **evidence:** doc-spine.tsx:46-136, :143 (CompactSpineTimerDoorway); spine-timer.tsx:61 (`min-[1180px]:flex min-[1440px]:hidden`)

### F141 — Reading the balance and acting on it are two different scroll depths
- **width / state:** 1440 · mid — severity low, seat confidence 0.6
- **claim under test:** 12-layout-measurements.md region→y map: money-head sits at y=2397px, well past ffe (1666px); the MONEY ticket row that answers 'who owes me' sits at scroll 0, ~2400px above the DRAW AN INVOICE action.
- **verdict:** `stands`
- **reason:** Money is the last of the four paper regions in mount order, so the region that answers the ticket's Money row sits at the bottom of the paper.
- **evidence:** document-index.ts:36-57 (PROJECT_PAPER_ORDER: approvals, schedule, ffe, money); money-region.tsx:246-252

### F142 — "Project" names a stage, a section label, and the ticket subject at once
- **width / state:** all · top — severity low, seat confidence 0.6
- **claim under test:** "Project ACTIVE" (spine), "THE JOB · PROJECT" (ticket eyebrow), and the section-progression word "Project" (mobile sheet) all reuse the same word for three different roles.
- **verdict:** `stands`
- **reason:** One word, three derivations: the section label from section-derivation's ORDER, the ticket's `The job · Project` subject, and the same section label again in the mobile sheet's list.
- **evidence:** section-derivation.ts:59-77; ticket-derivation.ts:797-802, :811-818; mobile-sheets.tsx:466

### F143 — "Hands on the work: you" reads as a sentence fragment, not a role label
- **width / state:** 1440 · foot — severity low, seat confidence 0.6
- **claim under test:** "LEAH HARTWELL / hands on the work: you" printed with no further context distinguishing it from body prose.
- **verdict:** `stands`
- **reason:** The colophon prints `hands on the work: {hands}` as one uppercase mono span with no separate label element or role.
- **evidence:** doc-colophon.tsx:107-109

### F144 — Ticket says "Boards"; task vocabulary and shelf history say "Mood boards"
- **width / state:** all · top — severity low, seat confidence 0.6
- **claim under test:** Ticket row prints "BOARDS"; `shelves.ts` comment states "the row, the leaf, the page and ⌘K all read Boards" as a deliberate one-name decision, but a junior arriving with school vocabulary ("mood board") will not immediately connect the two.
- **verdict:** `stands`
- **reason:** The registry's own comment states the one-name decision, and the title is the literal 'Boards' while the key stays 'moodboards' as an address.
- **evidence:** shelves.ts:60-68 (`title: 'Boards'`, the F62 comment); ticket-derivation.ts:580-594

### F145 — "No client linked — attach one" sits directly under the title, reads as an error
- **width / state:** 1440 · top — severity low, seat confidence 0.6
- **claim under test:** Immediately under "Chen Residence" in large italic type: "No client linked — attach one ↗" in a warm tint, before any task-relevant content appears.
- **verdict:** `stands`
- **reason:** The chip renders that sentence as the letterhead's client line, immediately under the title and above the vitals.
- **evidence:** household-chip.tsx:57 ('No client linked — attach one'); doc-letterhead.tsx:57-64 (title, then {client}, then vitals)

### F146 — Approvals fold summary is 41 characters, over budget and truncatable
- **width / state:** 390 · mid — severity low, seat confidence 0.6
- **claim under test:** "NO DECISION LEAD · NO APPROVALS AUTHORED" (41 chars, verbatim) sits in a `truncate` column (fold-seam.tsx:73); at 1440 it fits, at 390/1280 the column narrows.
- **verdict:** `stands`
- **reason:** The summary is composed as `${leadPhrase} · ${authoredPhrase}` and lands in the seam's middle column, which carries `truncate`.
- **evidence:** project-approval-document.tsx:556-572; fold-seam.tsx:71-73 (`truncate font-mono text-[11px] ...`)

### F147 — Rail has no 'what needs you next' signal of its own
- **width / state:** 1440 · all — severity low, seat confidence 0.6
- **claim under test:** The red-letter zone/DocumentGuide computes next-up reasoning already, but it lives in the header stack (page.tsx:1838-1847), not on the rail; the rail has no equivalent.
- **verdict:** `stands`
- **reason:** The next-up reasoning is computed and rendered in the header stack only; the rail's children are Put down, the marks, the caption, the index, the timer and presence — none of them a needs signal.
- **evidence:** page.tsx:1838-1847; doc-spine.tsx:46-154

### F148 — The system's only loading motion lives outside the header/spine/margin the brie…
- **width / state:** all · seam — severity low, seat confidence 0.6
- **claim under test:** strata-sweep's consumers inside the document tree are worktable/library-reach-in.tsx and the rooms/piece/* tree, not doc-letterhead, job-ticket, doc-spine, or margin-rail — a lens adding new loading states to those surfaces has no existing pattern to reuse there.
- **verdict:** `stands`
- **reason:** The strata sweep's consumers sit in the worktable and rooms trees; none of the four surfaces the brief names imports it.
- **evidence:** globals.css:485-499 (`.strata-sweep`); no strata-sweep usage in doc-letterhead.tsx, job-ticket.tsx, doc-spine.tsx or margin-rail.tsx

### F149 — Row-wash's exclusion from ticket/spine/region-heads should stay a rule, not a g…
- **width / state:** 1440 · mid — severity low, seat confidence 0.6
- **claim under test:** row-wash.tsx confirms exactly two consumers (desk-roster.tsx, ffe-section.tsx); the ticket, spine, and region heads carry no .has-wash class anywhere.
- **verdict:** `stands`
- **reason:** RowWash has exactly two consumer files and the `has-wash` class appears on the FF&E line and the desk roster row only; the ticket, spine and region heads carry it nowhere.
- **evidence:** row-wash.tsx:39-52; ffe-section.tsx:480-484; desk-roster.tsx:23, :83-110

### F150 — "STUDIO EYES ONLY" beside a margin % reads as a permission wall
- **width / state:** 1440 · foot — severity low, seat confidence 0.55
- **claim under test:** "The accounts · this project · $0 BUDGET · $14,420 COMMITTED · 20% MARGIN · STUDIO EYES ONLY" gives no indication whether a junior designer is cleared to view or act on this line.
- **verdict:** `stands`
- **reason:** The accounts line prints its permission phrase as one more mono fragment in the same run as the figures, with no gating or explanatory element.
- **evidence:** commercial/money-region.tsx:246-260 (the head's status run); shots/w1440-rich-s3.png

### F151 — Phases fold forgets an explicit open on every remount
- **width / state:** all · top — severity low, seat confidence 0.55
- **claim under test:** phasesOpen is a plain useState with no persistence (letterhead-vitals.tsx:377) — a ⌘K jump away and back re-closes it with no signal that it will.
- **verdict:** `stands`
- **reason:** phasesOpen is a plain useState with no storage and no lifting, so any unmount of LetterheadVitals discards it.
- **evidence:** letterhead-vitals.tsx:376 (`const [phasesOpen, setPhasesOpen] = useState(false)`), :444-454

### F152 — Vertical mark stack reads less like a single arc than the horizontal row
- **width / state:** 1280 · top — severity low, seat confidence 0.55
- **claim under test:** At 1280 the seven marks lay out 41.5x373.5px vertically (y 81-454.5), stretching what was a compact 181x49.5px horizontal row at 1440 across nearly half the viewport height.
- **verdict:** `stands`
- **reason:** The list is flex-col below 1440 and flex-row from 1440, so the same seven marks change from a stacked column to a single horizontal run.
- **evidence:** doc-spine.tsx:64 (`flex flex-col items-center gap-1 min-[1440px]:flex-row min-[1440px]:flex-nowrap`)

### F153 — Status chip crowds the price on a mobile FF&E line
- **width / state:** 390 · mid — severity low, seat confidence 0.5
- **claim under test:** m390-rich-s2.png: the 'IN PRODUCTION' chip on the Møbler Lounge Chair line visually overlaps/abuts '$5,700' with almost no gap, harder to read as two separate facts at a glance.
- **verdict:** `stands`
- **reason:** The line's stamp and price are siblings in one row with no reserved gutter between them, so at 390 they abut.
- **evidence:** ffe-section.tsx:480-560 (the line row); shots/m390-rich-s2.png

### F154 — The guide and the red-letter zone have different heights, shifting everything b…
- **width / state:** 1440 · top — severity low, seat confidence 0.5
- **claim under test:** RedLetterZone has no outer margin; DocumentGuide adds "my-5 ... py-4" — whichever renders changes the y-position of every region below it, unpredictably per document.
- **verdict:** `stands`
- **reason:** The two branches of one ternary carry different vertical footprints — the guide adds my-5 + border-y + py-4, the red-letter zone adds no outer margin at all — so which one renders shifts every y below it.
- **evidence:** red-letter-zone.tsx:85-88; document-guide.tsx:75; page.tsx:1838-1847

### F155 — FF&E region head reads 'Pieces', not 'FF&E'
- **width / state:** all · mid — severity low, seat confidence 0.5
- **claim under test:** Region head prints 'Pieces / the FF&E schedule, by room · 1 group · 3 lines / 3 unspecified · 3 uninvoiced' — 'FF&E' only appears as a subtitle, not the heading itself.
- **verdict:** `stands`
- **reason:** RegionHead is given name='Pieces'; 'FF&E' appears only inside the status string beneath the heading.
- **evidence:** ffe-section.tsx:1291 (`name="Pieces"`), :1084 (the status sentence)

### F156 — Each of the 7 fold regions invents its own empty vocabulary
- **width / state:** all · top — severity low, seat confidence 0.5
- **claim under test:** Money: "no budget yet". Approvals: "NO DECISION LEAD · NO APPROVALS AUTHORED". Ticket rows: "No rooms yet" / "Nothing filed" / "Nobody on it yet" — three different negation patterns for the same underlying concept (zero).
- **verdict:** `stands`
- **reason:** Each row and each region composes its own empty phrase locally; there is no shared empty-state vocabulary or helper anywhere in the derivation or the regions.
- **evidence:** ticket-derivation.ts:440-741 (per-row phrases); project-approval-document.tsx:556-562; money-region.tsx:225-243

### F157 — Pre-work rail shows no timer card at all, unlike the rich doc
- **width / state:** 1440 · top — severity low, seat confidence 0.5
- **claim under test:** `w1440-prework-s0.png` shows no 'IN HAND' timer box beneath the caption, unlike the rich doc's identical-width shot, suggesting SpineTimer's mount is conditional on session state not yet triggered on this doc.
- **verdict:** `narrows`
- **reason:** The gate is project linkage, not session state: SpineTimer returns null when there is no held project, and time attaches to projects by construction, so a pre-work document can never show the card.
- **evidence:** spine-timer.tsx:97-100 (`// Time attaches to projects (00177 FK) — pre-project documents carry no timer in v1.` / `if (!heldProjectId) return null;`)
- **revised claim:** A pre-work document shows no timer card because SpineTimer returns null without a held project — time attaches to projects, so the absence is a data gate, not an untriggered session.

### F158 — Nothing marks arrival at the paper's foot with any motion or cue
- **width / state:** 1440 · foot — severity low, seat confidence 0.5
- **claim under test:** Colophon wrapper is mt-14 border-t pb-6 pt-3 (doc-colophon.tsx:102) with no entrance treatment; per §6 measurements the foot frame budget is dominated by chrome (13.9%) with 0% active-task share at 1440 s3.
- **verdict:** `stands`
- **reason:** The colophon is a plain footer with margin, border and padding; no entrance class, keyframe or motion-safe variant appears on it or its children.
- **evidence:** doc-colophon.tsx:101 (`<footer className="mt-14 border-t border-[var(--color-pearl)] pb-6 pt-3">`)

### F159 — Empty-state ticket rows ('Nothing filed', 'Nobody on it yet') read as inert, no…
- **width / state:** all · top — severity low, seat confidence 0.45
- **claim under test:** Rows print 'DRAWINGS — Nothing filed →', 'PEOPLE — Nobody on it yet →' — the arrow is present but the copy itself reads like a dead end rather than an invitation.
- **verdict:** `stands`
- **reason:** The empty phrases are composed as statements of absence in the derivation, while the arrow is decided separately by whether a door exists — so an inviting arrow can sit beside a dead-end sentence.
- **evidence:** ticket-derivation.ts:543-547, :735-741; job-ticket.tsx:266-269 (hasDoor decides the arrow independently of the phrase)

### F160 — Margin cards print raw seed/debug copy ("Walk seed — ...")
- **width / state:** 1440 · top — severity low, seat confidence 0.4
- **claim under test:** Margin cards read "Walk seed — draft invoice (design fee, phase 2)" and "Walk seed — 15 days overdue (receivables chase)" as their subtitle text.
- **verdict:** `narrows`
- **reason:** No code prints 'Walk seed' — MarginItem renders row.detail verbatim from the margin query, so these are seed rows carrying that copy in the database, not debug output the component adds.
- **evidence:** margin-item.tsx:52-62 (`<MItemContent ... detail={row.detail} />`); shots/w1440-rich-s1.png
- **revised claim:** Three margin cards carry seed copy ('Walk seed — …') as their detail line, which MarginItem renders verbatim from the row.

### F161 — No margin card pattern demonstrates how a client message lands 'on the record'
- **width / state:** 1440 · all — severity low, seat confidence 0.4
- **claim under test:** Margin cards visible are all Money/Time kinds; '+ NOTE' and 'THE POST' bell both exist as candidate doors but neither is shown resolving a client question in any captured state.
- **verdict:** `stands`
- **reason:** The margin's capture group offers + Decision and + Note only, and neither is demonstrated resolving a client question in any captured state.
- **evidence:** margin-rail.tsx:492-513

### F162 — doc-raise's entrance signal may never be seen on repeat visits
- **width / state:** 1440 · top — severity low, seat confidence 0.4
- **claim under test:** doc-raise 270ms is applied once at page.tsx:1764 shell mount; whether it replays on every /doc/[id] navigation (vs. only a cold load) is not confirmed by the anatomy or probe.
- **verdict:** `misread`
- **reason:** The animation class sits on the shell root that DocumentPage renders, and the whole route unmounts on navigation away — the body is even explicitly keyed on the document id so a different document is a fresh mount by construction. The raise therefore replays on every arrival, not only a cold load.
- **evidence:** page.tsx:1764 (`motion-safe:animate-[doc-raise_270ms_ease-out]` on the shell root); page.tsx:1740-1748 (the id-keyed body comment)

### F163 — PO-acknowledgement chord (g o) has no confirmed touch path
- **width / state:** 390 · all — severity low, seat confidence 0.4
- **claim under test:** instruments.md's T13 script relies on a bare-letter 'g o' chord; no equivalent touch affordance for it was found in the read mobile-bar/mobile-sheets source, leaving the ticket's Money row (itself behind the seam-unfold tap) as the only route.
- **verdict:** `stands`
- **reason:** The chord is bound to a keydown sequence beginning with the bare letter g, with no pointer or touch equivalent registered anywhere.
- **evidence:** registry-shortcuts.tsx:45 (`s.shortcut.length === 2 && s.shortcut[0] === 'g'`), :105 (`if (key === 'g') armedAt.current = now`)

### F164 — FF&E hover wash signals interactivity, not PO urgency
- **width / state:** all · mid — severity low, seat confidence 0.35
- **claim under test:** '.row-wash' consumers include ffe-section.tsx; the wash tone is generic (nine tones available) but nothing in the anatomy ties a wash tone to PO-ack/damage state specifically.
- **verdict:** `narrows`
- **reason:** The wash tone is not generic — it is a three-way split on the line's own state, with terracotta reserved for a damaged line and golden for a decision due. What has no tone is PO acknowledgement.
- **evidence:** ffe-section.tsx:220-229 (`if (kind === 'decision_due') return 'golden'; if (kind === 'damaged') return 'terracotta'; return 'clay';`)
- **revised claim:** The FF&E hover wash already carries damage state (terracotta) and decision-due state (golden), but no tone distinguishes an unacknowledged PO from an ordinary line.
