# Design brief: Document section head + left rail (2026-10-21)

**Status:** design study only. No portal code, deploy or prod change. The output goes to the founders (Kody and Leah) as an HTML deck with three directions for each element.

## 1. The ask (Kody, 2026-10-21)

> Each section header on the documents are crowded and jumbled and hard to read. … develop and design a more usable, intuitive, repeatable-across-sections header bar for the sections. The designers using the portal should be able to quickly look at the header section and know how to find and use the controls they want to perform on the section.
>
> The designers are also overlooking functionality in the left hand document sidebar … give this navigational useful bar more weight and draw attention for functionality here as well.

Evidence:
- `evidence/kody-ffe-head-2026-10-21.jpg`: the FF&E head as Kody sees it today.
- `evidence/kody-rail-2026-10-21.jpg`: the rail.
- More current captures are in `artifacts/ui-contrast-calm-2026-10-20/us46-plate/shots/doc-{1440,768,390}-{ffe,approvals,money,schedule}-head.jpg`.

**Who is the user?** A growing studio: Leah, the studio lead, plus her first hire. They run several live jobs at once. The Document is the surface they live on. The promise is that "the studio won't notice Patina", so the design should be calm, findable and repeatable, never engagement bait (`docs/vision/VISION.md`).

## 2. What the head is today

Source: `apps/designer-portal/src/components/document/region/region-head.tsx`.

It is one left-stacked column at every width, with no breakpoints (US-46 / R203). Top to bottom:

| # | Line | Source | Problem |
|---|---|---|---|
| 1 | Double rule (FF&E only, `RegionRule strong`) | `region-rule.tsx` | Only one section opens with it, so it reads as decoration rather than structure |
| 2 | Name (26px Playfair `.t-d2`) + "Collapse ↑" (tertiary act beside it) | `region-head.tsx:305` | Collapse is the most visible control, but it is the least-used one |
| 3 | Status sentence + up to 2 exceptions joined by " · " ("21 priced selections are not yet invoiced. · 1 ready · 20 released") | `:291` | Two grammars (a sentence plus counts) in one line |
| 4 | Lead act on its own 44px line ("Bill 21 uninvoiced") | `:328` | Isolated; reads as a stray link |
| 5 | Tools row on another 44px line: "Edit selections →", "Add items", "Prepare purchasing authorization", "More ⌄" | `:336`; FF&E ledger `ffe-section.tsx:499` | Same underline weight as the lead; no grouping; the arrow (→) means navigation on one act and nothing on the rest |
| 6 | Gated note at 11.5px ("No selections are ready for purchasing authorization yet.") | `:228` | Off the type scale; a held act is printed and then explained away |
| 7 | Money line from the body ("$404 priced · $23,132 released") | `pieces/pieces-overview.tsx:142` | Reads as part of the head, but it isn't |

- **More is not part of the head.** FF&E's More discloses a div **below** the head (`ffe-section.tsx:2614`, holding "Record a selection change" and "Open specification book"). Financials' "Details" also opens below (`money-region.tsx:403`).
- **Stacking cost.** Every act is at least 44px plus 10px of padding, so lines 4 and 5 alone take about 110px.

### Per-section inventory (the head must hold all of these with ONE anatomy)

| Section | Name (h2) / index label | Status | Lead (elected) | Other acts | Disclosure | Oddities |
|---|---|---|---|---|---|---|
| FF&E | "FF&E selections" / "Pieces" | `ffeStateSentence` + `overviewHeadStages` | One of: Prepare purchasing authorization · File the claim · Follow up with the maker · Fill the N placeholders · Add the missing price(s) · Bill N uninvoiced · Add items. None when waiting or held | Edit selections → (href) · Add items · Prepare purchasing authorization (held + reason) · Bill N unbilled purchases → · Bill N unbilled riders → · More ⌄ | More: Record a selection change · Open specification book | Two other head forms exist: install/care/selecting (a hand-built 16px h2) and ReleaseLift |
| Client approvals | "Client approvals" | "N awaiting decision · {lead}" / proposal outcome / "No decision lead named yet." | New approval · Close draft · Assign project client · Chase the approval (at quiet) | none | none | One act only |
| Project schedule (spine) | "Project schedule" | "N phases · {active} · next milestone {x}" | + New open item (leaderless under one-voice) · Adjust dates (at quiet) | none | none | A second schedule head ("Schedule", rule strip) also exists |
| Project financials | "Project financials", eyebrow "Project financial summary" | "Client budget $X, $Y remaining. $Z authorized." | Record the payment, or Draft an invoice | Draft an invoice · Details (tertiary) | Details: ladder, explainer, a second act group (Record a change / Amendment / Add a change / Hours) | Refund notice under the head |
| Project closeout | "Project closeout", eyebrow "Care · project closeout" | "Everything is settled — close the book when you're ready" / "N closed out · …" | Close out project (disabled until ready, with no reason given) | none | none | Tinted rounded box, a StrataMark beside it, and **no Collapse** |
| The record | "Project record" / "The record" | "N complete" / "Nothing yet" | Open project record (a toggle) | none | none | Mono link "Client approvals · N awaiting publish →" |
| Pre-work (brief, discovery, direction, proposal, scope, vision, investment) | `DOCUMENT_INDEX_LABELS` | `preworkStatus` | none | none | none | brief/discovery/direction are `silent` (sr-only h2) |

**Name drift:** Pieces vs "FF&E selections"; "The record" vs "Project record"; "Schedule" vs "Schedule dates" vs "Project schedule".

## 3. What the rail is today

Sources: `components/document/doc-spine.tsx` and `components/document/spine/lens-ladder.tsx`.

It is a 200px rail at 1440 and up, 136px from 1180 to 1439, and hidden below 1180 (the MobileBar and spine sheet take over).

**What the designer sees:**
- "← BACK TO STUDIO OVERVIEW" (12px mono caps).
- An inert StrataMark (`role=img`, with no press or tooltip).
- "PROJECT". This is actually the **stage phrase**. The household line above it hides itself when the client name is blank or a placeholder (`act-names.ts:267`), and the rail never prints the project title. So the head block can be 107px tall and show nothing useful.
- A chapter list: 13px Inter names, with **11px** DM Mono caps values ("21 LINES", "$23,132 RECEIVABLE", "NOTHING YET"). The 11px values sit below the 12px floor.
- A big flex gap (ruled in by D-B52).
- "FILED WITH THIS JOB": Drawing sets, Specification book, Boards, Project directory (14px lucide icons).

**What it can actually do (and designers miss):**
- Click a chapter to jump to it. This unfolds a folded region and focuses its heading.
- Arrow, Home and End keys move through the list on one tab stop.
- A sliding reading bracket follows a scroll-spy (`use-document-running-index.ts`).
- Status at a glance per chapter.
- Room rungs, at 1440 and up when Pieces is active: take a room "in hand", which lifts its items to the top of every list. Also "Clear room focus".
- Four doors: `/plans`, `/spec-book`, `/boards`, and Project directory (an overlay sheet).

**What makes it read as static:**
- No hover state on chapter rows.
- 11px values.
- An inert mark.
- No tooltips.
- A dead head block.
- The doors sit at the very bottom, after a gap.

**Related tools nobody discovers:**
- ⌘K (`command-bar.tsx`): typing a chapter name jumps to it.
- `g` + letter shortcuts, `?` for the shortcuts sheet, `t` to log time.
- The Studio drawer (bottom strip).
- Letterhead "Project directory · N" duplicates the door.

**Label drift (Direction C, V18):**
- The mobile spine sheet says "Spec book", "Call sheet" and "Put down · back to the Desk".
- The rail says "Boards", but mobile More says "Design boards".

## 4. Rules every direction must respect, or else NAME the ruling it asks to revise

Rulings are in `docs/design/the-document/DECISIONS.md` and `docs/vision/VISION-DECISIONS.md`.

| Area | Ruling |
|---|---|
| Fills | **One fill per view** (V18 Q8, R203): the single charcoal `.da-plate` (the Next act) or a forest `.da-terminal` (money moves or a paper is signed; R139/R202). Nothing else fills |
| Leads | **One state-elected lead per section**, unfilled (R201/V25 R4). LEADER_VARIANTS = primary, plate |
| Labels | Sentence-case Inter actions; **mono caps for metadata only** (R201, V18 Q9) |
| Names | 26px Playfair region names (R201/V25 R2). The house-sheet type steps apply (`docs/design/house-sheet/SPEC.md` §A3: seven steps; §A4: 24px module, never truncate; §A5: action tiers) |
| Targets and focus | 44px minimum targets. Focus uses `--focus-ring` (clay-ink) only. Never a plain clay ring |
| Visual furniture | **D4: no shadows.** **VISION §6 / V18 Q1 / V19 Q1: no tabs, zones, dashboards, badges, dots or overflow counts.** Colour orients but never grades |
| Navigation | **D1: no persistent global nav inside a document.** **R124: the "Thumb Index" was removed by Kody; do not re-propose.** R124 B1: the four reference pages stay one action away at every width. **R127: the rail holds ≤14 labels**; room rungs only at 1440 and up |
| Head layout | **US-46 (R203): Kody flagged that actions sat in a right-hand column and had them stacked left.** Any side-by-side layout must answer that objection directly |
| Region close | Space plus a hairline (R201/V25 R3); the double rule opens a movement |
| Labels | One name per act across every surface (R162). Direction C labels: Project financials, Project closeout, Project directory, Specification book, Design boards, Studio overview |

## 5. Fixtures (use these real strings in every mockup)

**FF&E, Kody's state:**
- name "FF&E selections";
- status "21 priced selections are not yet invoiced." plus "1 ready", "20 released";
- lead "Bill 21 uninvoiced";
- tools: Edit selections, Add items, Prepare purchasing authorization (held: "No selections are ready for purchasing authorization yet.");
- More: Record a selection change, Open specification book;
- body money "$404 priced · $23,132 released".

**Client approvals:**
- "3 awaiting decision · Anne Hartwell";
- lead "Chase the approval";
- alt "New approval".

**Project financials:**
- "Client budget $48,000, $24,868 remaining. $23,132 authorized.";
- lead "Record the payment";
- other acts: Draft an invoice, Details.

**Project closeout:**
- "Everything is settled — close the book when you're ready";
- lead "Close out project" (held until ready).

**The record:**
- "4 complete";
- lead "Open project record";
- link "Client approvals · 2 awaiting publish".

**Rail:**
- project "Hartwell residence", household "The Hartwells", stage "Ordering";
- chapters: Client approvals (3 AWAITING · 1 OVERDUE 7D), Project schedule (INSTALL DEC 4 · 6 WEEKS), Pieces (21 LINES · 4 ROOMS), Project financials ($23,132 RECEIVABLE), Project closeout (NOTHING YET), The record (4 COMPLETE);
- rooms: Living, Primary bedroom, Dining, Study;
- doors: Drawing sets, Specification book, Design boards, Project directory · 6.

## 6. Success tests (the deck must show each direction passing them)

1. **Glance test.** Squint at a head (the Squint toggle). Within 3 seconds you can point to (a) what the section is, (b) its state, (c) the one thing to do next, and (d) where every other control lives, including Collapse and More.
2. **One anatomy.** The same slots in the same order hold FF&E, Approvals, Financials, Closeout and The record. Empty slots collapse predictably. Closeout and The record are no longer special cases.
3. **Held acts are honest.** A held act and its reason read as one unit, at a type size on the scale.
4. **Disclosure lives in the head.** More/Details opens from the head and is anchored to it, with no detached div below.
5. **Height budget.** The FF&E head at 1440 takes noticeably less height than today's ~260px (state the measured or estimated number).
6. **The rail reads as a navigator before hover.** A first-time designer can say "these are clickable sections with live status, and these four open the job's files" without touching it. The project is named.
7. **Rail affordances discoverable without badges:** jump, room-in-hand, doors, and the keyboard/⌘K paths.
8. **390 works.** Each direction states what the head and the rail (spine sheet / MobileBar) become below 600.

## 7. Defects to fix whichever direction wins (list in the deck)

- The rail's project name is blank: the household is hidden for placeholder names, and the title is never printed.
- Rail values are 11px, below the 12px floor.
- Chapter rows have no hover state.
- The gated note is 11.5px, off the scale.
- More/Details render outside the head.
- Section name drift.
- Mobile label drift (Spec book / Call sheet / Put down).
- Closeout's held "Close out project" is disabled with no reason.
- Door comments promise an in-place panel that `LensLadder` never reaches (`shelves.ts:127`).
