# 31 - Findings

Visual audit of the designer portal against the complaint "it is too flat and everything
blends together". One seat: a senior interior designer who uses the portal daily, plus the
measurements in `research/12-measurements.json` and the source.

**Scope is UI only.** Every finding's fix is a token, a type step, a rule weight, a fill, a
ground or a crop. No finding proposes a new surface, a new act, moved copy, a changed route
or changed behaviour. Observations that failed that filter are listed under *Dropped as UX*
in `research/20-audit.md`.

**25 findings** - 4 blocker - 11 high - 9 medium - 1 low.
Themes: type 7 - tone 5 - state 4 - chrome 4 - color 2 - material 2 - rule 1.

Severity: **blocker** = two different states cannot be told apart - **high** = the
separation exists but only by reading - **medium** = hesitation - **low** = polish.

---

## F01 - Hover and decision-due paint one FF&E row identically

`blocker` - `doc` - **all** - confidence 0.95 - theme `state`

**What is seen.** Three grounds compete on one furniture line: a highlighted row, a row whose stamp reads DECISION DUE, and a row under the cursor. On w1440-ffe-lines.png the first row ("Mobler Lounge Chair - Boucle - x2 / Nordic Atelier / IN PRODUCTION / $5,700") carries the highlight tint; the rows below it carry none. A row that needs a decision and a row the cursor happens to be over resolve to the same colour.

**Measurement.** hover rgba(196,165,123,0.04) vs decision-due rgba(232,197,71,0.05), both over --doc-paper: 1.0005:1. Highlight rgba(196,165,123,0.08) vs paper 1.059:1; decision-due vs paper 1.026:1.

**Shots.** `w1440-ffe-lines.png`, `w1440-doc-project-rich.png`

**Refs.** `apps/designer-portal/src/components/document/ffe-section.tsx:396-399`, `apps/designer-portal/src/components/document/ffe-section.tsx:403`

**Fix (UI only).** Give the three row grounds three separable values instead of three alphas of the same order: keep hover as the weakest (a tint step, not a hue), raise decision-due to a real tinted stock at >=1.15:1 against paper, and carry the highlight as a left ink edge rather than a fill so it never competes with state. All three stay flat fills, no shadow.

**Canon.** D4 - fills and value contrast only, no elevation.

---

## F02 - Six-pixel dots carry five states one hue apart

`blocker` - `desk` - **all** - confidence 0.90 - theme `color`

**What is seen.** On the desk roster a 6px dot is the only mark separating a job that needs a hand from one that does not: "Full Room  Sarah Chen - New lead - respond by Sep 2" has one, "Consultation  Elena Ruiz - quiet - nothing needs your hand" has none, "Olsen Lake House  AP-012 has an open damage claim" has a warmer one. The People room repeats the device at the right edge of every card - a yellow dot on "Client User", a grey one on "Elena Marlowe (no-login household)", a warm one on "David Nielsen", a green one on "Elena Ruiz".

**Measurement.** Pigment pairs: clay/terracotta 1.024:1, terracotta/sage 1.060:1, clay/sage 1.085:1, terracotta/golden 1.36:1. Against the off-white ground: dusty-blue 2.64:1, clay 2.18:1, terracotta 2.13:1, sage 2.01:1, golden 1.57:1. Rendered at h-1.5 w-1.5 = 6px.

**Shots.** `w1440-desk.png`, `w1440-desk-roster-rows.png`, `w1440-room-people.png`

**Refs.** `research/12-measurements.json people.pairwiseContrast`, `research/12-measurements.json desk.pairwiseContrast`, `apps/designer-portal/src/app/globals.css:44-47`

**Fix (UI only).** Stop asking hue alone to carry state at 6px. Either enlarge and differentiate the mark (a filled dot, a hollow ring, a short rule, an absent slot) so shape carries the distinction and pigment only confirms it, or drop the pigment to two values - present and absent - and let a word carry the rest. Keep the mark inline, no badge, no pill.

**Canon.** typography-first - state should not depend on a colour the eye cannot resolve at 6px.

---

## F03 - One stamp shape carries every kind of state

`blocker` - `doc` - **all** - confidence 0.90 - theme `state`

**What is seen.** The same rotated outlined box appears as "IN PRODUCTION" and "RECEIVED" on furniture lines, as "SENT" on a proposal, as "ANCHORED - NOV 21" on a schedule phase, as "OUTLINE" on a drafting mode, and as "RECEIVED / INSPECT" and "IN TRANSIT" in the orders register. Lifecycle, shipping, calendar and editing states all wear one geometry; the only difference is the border hue.

**Measurement.** One component, 14 call-site files. Geometry fixed: border-[1.5px], rounded-[3px], -rotate-[1.5deg], bg-transparent, mono 600 caps at 10px or 12px. Separating pigments sit 1.024:1 (clay/terracotta) to 1.388:1 (clay/golden) apart.

**Shots.** `w1440-ffe-lines.png`, `w1440-doc-proposal-sent.png`, `w1440-ledger-sheet-orders.png`, `w1440-doc-project-plain.png`, `w1440-status-chips.png`

**Refs.** `apps/designer-portal/src/components/document/stamp.tsx:26-31`, `apps/designer-portal/src/app/globals.css:32-40`

**Fix (UI only).** Give the stamp two or three declared registers that differ in more than hue - e.g. an outline mark for a passive fact, a filled mark using the pigment plus its -ink companion for a state that stops work, and a rule-only mark for a date. Same component, same rotation, same mono; the fill and the weight do the separating.

**Canon.** D4 - fills, not shadows; F56/I151 -ink tokens must carry any pigment used as text on a fill.

---

## F04 - An empty document and a working one print alike

`blocker` - `doc` - **all** - confidence 0.90 - theme `type`

**What is seen.** The job ticket is the first block on every document and it prints the same eight-row table whatever the document holds. On the brief it reads "No rooms yet / No pieces yet / Nothing filed / Nothing specified yet / No boards yet / Nothing moving yet / No dates yet / No roster yet"; on the plain project, nearly the same; on the rich project it reads "3 unspecified", "0 of 3 specified - by room", "$16,330 deposit not drawn". Same block, same weight, same height, same rules. Deeper in, "No authorizations recorded yet" is typeset larger than any real furniture line on the page.

**Measurement.** Ticket label 10px mono aged-oak, value 13.5px, door 11px mono - identical whether the value is a fact or an absence. Empty-state heading in the Money region renders at ~17px Playfair against a 12.5px FF&E product name.

**Shots.** `w1440-doc-brief.png`, `w1440-doc-project-plain.png`, `w1440-doc-project-rich.png`, `w1440-status-chips.png`

**Refs.** `apps/designer-portal/src/components/document/job-ticket.tsx:90-101`, `apps/designer-portal/src/components/document/job-ticket.tsx:407-418`, `apps/designer-portal/src/components/document/ffe-section.tsx:342`

**Fix (UI only).** Give absence its own tonal register: set every 'nothing yet' value in the quiet ink at the metadata weight and let a recorded value take the body weight and the charcoal, so a filled row is visibly heavier than an unfilled one. Empty-state headings drop to the body size rather than outranking real content. No new rows, no new copy - only weight and colour.

**Canon.** typography-first - hierarchy by weight and colour, not by adding chrome to empty rows.

---

## F05 - Room, paper and card sit inside 1.07 to 1

`high` - `doc` - **all** - confidence 0.95 - theme `tone`

**What is seen.** Three grounds are meant to name three different things - the room you stand in, the document you picked up, and an object laid on it - and all three are the same cream. Crossing from the desk into Chen Residence does not change the paper under the eye.

**Measurement.** --bg-primary #FAF7F2 vs --doc-paper #FCFAF6 = 1.025:1; ground vs --bg-surface #FFFFFF = 1.069:1; paper vs card = 1.042:1.

**Shots.** `w1440-desk.png`, `w1440-doc-project-rich.png`, `w1440-drawer-strip.png`

**Refs.** `apps/designer-portal/src/app/globals.css:63-64`, `apps/designer-portal/src/app/globals.css:52`, `research/12-measurements.json desk.tokens`

**Fix (UI only).** Open the three stocks to at least 1.15:1 between neighbours - a warmer, slightly deeper room ground, the document paper unchanged as the lightest reading surface, and a card stock that is not pure white. Three flat fills, three tokens, no new surfaces.

**Canon.** D4 - depth by value contrast is the sanctioned mechanism; this is the mechanism unused.

---

## F06 - The Studio Drawer is the same white as a card

`high` - `drawer` - **1440** - confidence 0.95 - theme `chrome`

**What is seen.** The drawer strip crosses the whole window carrying "Library - People - The Scans - Ledgers - Find anything" on the left and "HANDS FREE - THE POST - Leah Hartwell" on the right. It is white on off-white with one hairline along the top; in the full-page desk capture it reads as a strip of paper laid on the page rather than as the one persistent piece of chrome. Which room is current is carried by a 2px clay underline under one word.

**Measurement.** bg-[var(--bg-surface)] = #FFFFFF, border-t --border-default #E5E2DD. Drawer vs ground 1.069:1; hairline vs ground 1.209:1. Compare mobile-bar.tsx:216, charcoal, 14.46:1 against white.

**Shots.** `w1440-drawer-strip.png`, `w1440-desk.png`, `w1440-room-library.png`

**Refs.** `apps/designer-portal/src/components/document/studio-drawer.tsx:289`, `apps/designer-portal/src/components/document/studio-drawer.tsx:347`, `research/12-measurements.json desk.namedSurfaces.drawer`

**Fix (UI only).** Give the drawer a ground of its own - the deepest of the three paper stocks, or the warm fill the log strip already uses above 1180px - and raise its top edge to the 2px charcoal weight the region rule already defines. The current-room mark stays a rule, but on a ground that separates it from the page.

**Canon.** never-a-card - the drawer must stop sharing the card token; D4 forbids lifting it with a shadow instead.

---

## F07 - The margin rail has no ground of its own

`high` - `margin` - **1440** - confidence 0.95 - theme `tone`

**What is seen.** At 1440 the right rail holds "IN THE MARGIN", "+ NOTE" and the note chips, and it is painted in the ground colour at 55% over the ground - which is the ground. The three chips inside it therefore float rather than sit on a rail, and on the proposal document, where the rail holds only its own instruction, the right third of the page reads as blank paper rather than as a place.

**Measurement.** bg-[rgba(250,247,242,0.55)] over #FAF7F2 composites to #FAF7F2 - 1.000:1. Measured drawer-vs-margin 1.069:1, spine-vs-margin 1.209:1.

**Shots.** `w1440-margin-rail.png`, `w1440-doc-project-rich.png`, `w1440-doc-proposal-sent.png`

**Refs.** `apps/designer-portal/src/components/document/margin-rail.tsx:258`, `research/12-measurements.json doc-project-rich.namedSurfaces.marginRail`

**Fix (UI only).** Paint the rail on a declared stock (the same one the spine takes, so the paper is visibly flanked) and hold the paper's own edge with the 2px charcoal rule rather than a pearl hairline. Same width, same contents, same position.

**Canon.** D4 - a value edge, not a shadow, separates rail from paper.

---

## F08 - The spine wash is invisible against its own paper

`high` - `spine` - **1440** - confidence 0.95 - theme `tone`

**What is seen.** The spine carries the document's four places - "Client approvals / 0 IN THE LOG", "Schedule / NOT SCHEDULED", "Pieces / 3 PIECES - 0 ROOMS", "Money / $16,330 NOT DRAWN" - and the column itself does not read as a column. Which place is current is a 2px clay bar beside "Schedule". The one object in the spine with an edge is the "IN HAND / under a min / PAUSE / + LOG" box, so the timer looks weightier than the four places the document goes.

**Measurement.** bg-[rgba(229,226,221,0.28)] composited = rgb(246,243,239): 1.080:1 vs --doc-paper, 1.053:1 vs the off-white ground. Entry name and entry status are both text-[12px] at >=1440.

**Shots.** `w1440-spine-detail.png`, `w1440-doc-project-rich.png`

**Refs.** `apps/designer-portal/src/components/document/doc-spine.tsx:44`, `apps/designer-portal/src/components/document/doc-spine.tsx:129-132`, `research/12-measurements.json doc-project-rich.namedSurfaces.spineRail`

**Fix (UI only).** Take the spine to the same declared stock as the margin so the paper is flanked by two visibly different grounds, and separate the entry name from its state line by one size step and by ink weight rather than by family alone. Current-place mark keeps its clay bar but gains the ground behind it.

**Canon.** D4 - value contrast is the sanctioned depth cue; typography-first for the name/state split.

---

## F09 - The most urgent band is the palest band

`high` - `doc` - **all** - confidence 0.95 - theme `color`

**What is seen.** "NEEDS ATTENTION - IN ONE PLACE" over "Name the phases for this project" on the rich project, and over "1 decision overdue - oldest due Aug 25" on the install, is the one region on a document that says something is wrong. It is the lowest-contrast fill the document paints. It is found by its left edge, not by its ground. On the install document the empty portfolio form beneath it - white inputs on a warm band - is the highest-contrast object on the page.

**Measurement.** bg-[rgba(212,160,144,0.08)] over --doc-paper = rgb(249,243,238), 1.056:1. Its internal dashed rule rgba(139,115,85,0.14) is 1.173:1 against its own fill. Compare bg-warm #EEE6DB at 1.187:1.

**Shots.** `w1440-doc-install.png`, `w1440-doc-project-rich.png`, `m390-doc-project-rich.png`

**Refs.** `apps/designer-portal/src/components/document/red-letter-zone.tsx:87`, `apps/designer-portal/src/components/document/red-letter-zone.tsx:106`

**Fix (UI only).** Raise the zone to a real tinted stock (terracotta at a strength that clears 1.2:1 against paper), keep the -ink companion for its eyebrow so the label stays above 4.5:1 on the new ground, and thicken the left edge to the charcoal rule weight. Same words, same position, same act.

**Canon.** D4 no shadow; I151 - --color-terracotta-ink must carry the eyebrow on any raised fill.

---

## F10 - A section head and a state chip are one style

`high` - `doc` - **all** - confidence 0.90 - theme `type`

**What is seen.** The device that opens a section of the desk - "EVERY JOB - 16 LIVE - 1 OVERDUE", "THE STUDIO", "BRIEF - 5" - and the device that reports the state of a single thing are declared with the same class. In practice this means a heading and a status read as siblings: on the brief, "BRIEF - DECIDE THE FIT - NEEDS ATTENTION" sits in the same register as "THE JOB - BRIEF" and "INQUIRY & QUALIFICATION - CORE - STAGE 01", so the two words that mean something is required of me are buried among captions.

**Measurement.** Both declare font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]. RegionHead's eyebrow is the same construction at 9px. Route-wide uppercase-mono counts: desk 46, doc-project-rich 104.

**Shots.** `w1440-doc-brief.png`, `w1440-desk.png`, `w1440-status-chips.png`

**Refs.** `apps/designer-portal/src/components/document/section-eyebrow.tsx:17`, `apps/designer-portal/src/components/document/status-chip.tsx:10`, `apps/designer-portal/src/components/document/region/region-head.tsx:124`

**Fix (UI only).** Split the register. Section heads keep the mono caps but take a heavier weight, wider tracking and the charcoal ink plus the Strata mark; state words drop to the quiet ink at a smaller size and lose the tracking. One class becomes two tokens; no markup moves.

**Canon.** typography-first; Strata Mark rules as the section device.

---

## F11 - Playfair has thirty-nine sizes and no scale

`high` - `doc` - **all** - confidence 0.90 - theme `type`

**What is seen.** The serif is the document's own voice and it is spent almost entirely on captions. Region heads land at 18px, fold seams at 12.5px, room heads at 13.5px, roster job names at 16px, margin notes at 15px, the document title at 27.9px. On the rich project, "Pieces", "Money", "Schedule", "Client approvals", "Schedule dates", "Closing the book" and "The accounts - this project" all read as the same order of heading; some italic, some roman, with no inferable rule.

**Measurement.** 39 distinct arbitrary Playfair sizes across src/components/document; 71 usages sit at 13-15px (33 at 15px, 23 at 14px, 15 at 13px). Largest Playfair per route: desk 30.6px, doc 27.9px, library 45px, people 28.8px.

**Shots.** `w1440-doc-project-rich.png`, `w1440-doc-install.png`, `w1440-doc-project-plain.png`

**Refs.** `apps/designer-portal/src/components/document/region/region-head.tsx:131`, `apps/designer-portal/src/components/document/region/fold-seam.tsx:55`, `apps/designer-portal/src/components/document/doc-letterhead.tsx:59`

**Fix (UI only).** Declare three or four serif steps and map every existing size onto the nearest - a document title, a region head, a sub-region head, and a serif inline voice - and hold italic for one job only (the document's own asides). Same elements, same words, fewer values.

**Canon.** typography-first - the scale is the hierarchy.

---

## F12 - Three in four mono labels are ten pixels or under

`high` - `doc` - **all** - confidence 0.95 - theme `type`

**What is seen.** Every eyebrow, tag, state word, provenance note and act on a document is small mono capitals, and there are enough of them that the page reads as one texture. On the rich project alone 104 uppercase-mono elements are on screen at once. The tokens that declare a floor exist and are almost never used.

**Measurement.** 1,029 font-mono usages and 969 uppercase usages in src/components/document. 18 distinct mono sizes from 6.5px to 26px; 649 of 863 (75.2%) are <=10px, 296 of them at exactly 9px. --type-metadata-min is 12px but .doc-type-meta is used 139 times against 863 arbitrary sizes. Route histograms: 76.4% of doc text is 8-12px, 68.5% on library, 52.4% on people, 47.7% on desk.

**Shots.** `w1440-doc-project-rich.png`, `w1440-doc-install.png`, `w1440-ffe-lines.png`

**Refs.** `apps/designer-portal/src/app/globals.css:73-75`, `apps/designer-portal/src/app/globals.css:817-823`, `research/12-measurements.json doc-project-rich.fontSizeBuckets`

**Fix (UI only).** Adopt the declared 12px metadata floor as the real floor and fold the eighteen mono sizes onto two or three steps. Where that costs room, cut the number of labels rather than their size - the same information at 12px in fewer places reads better than all of it at 9px.

**Canon.** typography-first; the 12px floor is already declared at globals.css:73.

---

## F13 - The desk's type gives the work no rank

`high` - `desk` - **all** - confidence 0.95 - theme `type`

**What is seen.** On the desk roster "Full Room" and "Sarah Chen - New lead - respond by Sep 2" sit on one baseline at the same height. The job is told from its own metadata only by the typeface. Repeated sixteen times down the page, with an identical "OPEN THE JOB" in the third lane, the roster becomes one field the eye reads sequentially rather than scans. The ranking is inverted at the foot of the page too: the standing index - "Library", "People", "The Scans", "Orders", "Accounts", "Hours", "The Post", "Open a project", "Draft a design agreement", "Add a maker", "Open the Drafting Room" - is set larger than any of the sixteen live jobs above it.

**Measurement.** Job name font-heading text-[16px]; meta .doc-type-body = max(14px, 0.875rem) = 15.75px at the 18px root. Difference 0.25px. Desk-contents labels are 19px (prominent) / 17px - 1 to 3px larger than the job names. Route font histogram: desk is bimodal, 49 elements at 11-12px and 44 at 15-16px.

**Shots.** `w1440-desk-roster-rows.png`, `w1440-desk.png`, `m390-desk.png`

**Refs.** `apps/designer-portal/src/components/document/desk-roster.tsx:50`, `apps/designer-portal/src/components/document/desk-roster.tsx:54`, `apps/designer-portal/src/app/globals.css:825-830`, `apps/designer-portal/src/components/document/desk-contents.tsx:97`

**Fix (UI only).** Open the roster's two ranks: the job name up one or two serif steps in charcoal, the meta line down to the metadata step in the quiet ink. In the same pass, drop the contents index labels to the roster step or below in the quiet ink so the live work outranks the standing furniture. Nothing moves; the roster keeps its single-line density rule and the index keeps its labels-and-doorways form.

**Canon.** never-a-card on the roster; no counts/tiles/cards/metrics in desk contents - the fix is size and colour only; typography-first.

---

## F14 - On a furniture line the price outranks the piece

`high` - `doc` - **all** - confidence 0.95 - theme `type`

**What is seen.** "Mobler Lounge Chair - Boucle - x2 / Nordic Atelier / IN PRODUCTION / $5,700". The largest element on the line is the number. The name of the chair is smaller than the number; the maker, which is the relationship being managed, is smaller than the name; two mono meta lines sit under both. Five sizes in five pixels, none of which reaches the declared body floor.

**Measurement.** name 12.5px, maker 10.5px, mono meta 8px (x2), quantity 9px, price font-heading 13px. --type-body-min is 14px (globals.css:74).

**Shots.** `w1440-ffe-lines.png`, `w1440-doc-proposal-sent.png`

**Refs.** `apps/designer-portal/src/components/document/ffe-section.tsx:342`, `apps/designer-portal/src/components/document/ffe-section.tsx:347`, `apps/designer-portal/src/components/document/ffe-section.tsx:352`, `apps/designer-portal/src/components/document/ffe-section.tsx:380`

**Fix (UI only).** Rank the line: piece name at the body step in charcoal, maker at the metadata step in quiet ink, price at the same step as the name in the serif so it reads as a peer not a headline, and fold the two 8px mono lines into one at the 12px floor.

**Canon.** typography-first; no card, no tile - the line stays a line.

---

## F15 - No interiors surface shows what is being bought

`high` - `doc` - **all** - confidence 0.85 - theme `material`

**What is seen.** Across all twenty-two captures nothing shows a piece of furniture, a fabric, a finish or a room. The Library header reads "THE LIBRARY - 19 pieces" over an empty shelf. The proposal lists "Walnut sectional sofa - $6,500", "Hand-knotted wool rug - $4,200", "Walnut coffee table - $2,800", "Reading lounge chair - $3,700", "Floor lamp - $1,300" as five identical text rows. The brief's one image slot, under "ROOM SCAN", renders a bordered square reading "No preview" with a dark "PRIMARY" tab. A designer's day is spent judging things by eye and there is nothing here for the eye.

**Measurement.** No next/image or <img> in desk-roster.tsx, desk-contents.tsx, job-ticket.tsx, ffe-section.tsx or doc-letterhead.tsx. The only rendered image slot in 22 shots is the brief's scan tile, empty. The only texture in the product is a 1px repeating line at rgba(139,115,85,0.01).

**Shots.** `w1440-room-library.png`, `w1440-ffe-lines.png`, `w1440-doc-proposal-sent.png`, `w1440-doc-brief.png`

**Refs.** `apps/designer-portal/src/components/document/ffe-section.tsx:342-380`, `apps/designer-portal/src/components/document/desk-roster.tsx:34-62`, `research/12-measurements.json library.topBackgrounds`

**Fix (UI only).** Introduce a small material slot on the surfaces where a catalogue product is actually linked - a 40-56px crop on an FF&E line, a roster row and a Library row - and where no product is linked, print a neutral material swatch rather than nothing, so the column exists at a fixed width and the line does not reflow. A crop is not a card.

**Canon.** never-a-card / no-tiles - the crop rides in the line, it does not create one; D4 no shadow on the crop.

---

## F16 - Three muted ink tokens are one colour

`medium` - `doc` - **all** - confidence 0.95 - theme `tone`

**What is seen.** Metadata, quiet explanatory copy and the faintest provenance notes are all printed in the same ink, so the three ranks the tokens promise do not exist on the page. On a document with 104 uppercase-mono elements this is what makes the small type read as one grey field.

**Measurement.** --text-muted, --text-subtle and --text-faint all resolve to #65594E on all four routes measured; all three alias --color-quiet-ink. 6.51:1 on --doc-paper.

**Shots.** `w1440-doc-project-rich.png`, `w1440-doc-install.png`

**Refs.** `apps/designer-portal/src/app/globals.css:68-69`, `apps/designer-portal/src/app/globals.css:92`, `research/12-measurements.json doc-project-rich.tokens`

**Fix (UI only).** Make the three tokens three real steps between charcoal and the current quiet ink, each still clearing 4.5:1 on all three grounds, and repoint existing usages by role: metadata to the darkest, quiet copy to the middle, provenance to the lightest.

**Canon.** I151 / contrast.test.ts - every step must still clear AA on paper, off-white and white.

---

## F17 - Hover is one and four hundredths to one

`medium` - `doc` - **1440** - confidence 0.90 - theme `state`

**What is seen.** Every hoverable row, doorway and act on the surface takes the same wash, and it does not register as a change. On a page built from lines rather than buttons, hover is the main way the surface tells me a line is live, and it does not.

**Measurement.** --bg-hover rgba(196,165,123,0.06) composites to 1.042:1 over #FAF7F2 and 1.044:1 over #FFFFFF. The FF&E row's local hover is weaker still at 4%.

**Shots.** `w1440-desk.png`, `w1440-room-library.png`, `w1440-ffe-lines.png`

**Refs.** `apps/designer-portal/src/app/globals.css:64`, `apps/designer-portal/src/components/document/studio-drawer.tsx:335`, `apps/designer-portal/src/components/document/ffe-section.tsx:399`

**Fix (UI only).** Raise the hover fill until it clears roughly 1.10:1 against every ground it lands on, and pair it with the existing score-ink underline so hover reads as both a ground change and a rule change. One token, no new markup.

**Canon.** D4 - a fill, never a lift.

---

## F18 - Dashed means two things and pearl means everything

`medium` - `doc` - **all** - confidence 0.90 - theme `rule`

**What is seen.** The dashed rule says 'unfinished' around "NEEDS SETUP - 1" and under "Name a phase...", and says 'this row ended' between every job on the desk roster and between every line in the red-letter zone. Meanwhile one pearl hairline separates rows, closes regions, outlines input fields, edges the drawer, edges the spine and edges the margin - so the rule that ends a line and the rule that ends a chapter have the same weight.

**Measurement.** 502 border-[var(--color-pearl)] usages and 73 border-dashed usages in src/components/document; one border-dotted. Pearl is 1.209:1 against the ground, 1.292:1 against white; the subtle variant 1.123:1. The only heavier device is .doc-region-rule, 2px charcoal over 1px charcoal at 18%. Rendered pearl border-sides per route: desk 16, doc 38, library 25, people 78.

**Shots.** `w1440-desk-roster-rows.png`, `w1440-doc-project-rich.png`, `m390-doc-project-rich.png`, `w1440-doc-install.png`

**Refs.** `apps/designer-portal/src/components/document/desk-roster.tsx:34`, `apps/designer-portal/src/app/globals.css:738-742`, `apps/designer-portal/src/components/document/desk-contents.tsx:130`

**Fix (UI only).** Declare three rule weights - hairline for a row, a mid rule for a sub-region, the existing charcoal double rule for a region - and reserve dashed for one meaning only (a thing not yet written), moving row separators to the hairline.

**Canon.** typography-first - rules are the section device, so they must carry rank.

---

## F19 - People renders cards where the Desk renders lines

`medium` - `people` - **1440** - confidence 0.85 - theme `chrome`

**What is seen.** The Directory is nine white bordered cards, each with a round monogram, a name, an outlined role tag, a second line of metadata and a chevron. Two clicks away the desk roster is bare lines with no container at all. Same studio, same kind of list, two grammars - and the card grammar is the one canon says the Document does not use.

**Measurement.** 20 white backgrounds and 78 pearl border-sides on /people - the densest border count of any route measured - against 3 distinct border colours and no card container on /desk. White card vs ground 1.069:1.

**Shots.** `w1440-room-people.png`, `w1440-desk-roster-rows.png`

**Refs.** `apps/designer-portal/src/components/document/desk-roster.tsx:34`, `research/12-measurements.json people.topBackgrounds`, `research/12-measurements.json people.topBorders`

**Fix (UI only).** Bring the Directory onto the roster's line grammar - name, role, metadata and act on one line with a hairline between, the monogram kept as an inline mark - or, if the card must stay, give it the declared card stock from F05 so it is at least legible as an object. One grammar for both rooms.

**Canon.** never-a-card is the roster rule; the Directory should not contradict it.

---

## F20 - Selection reads three different ways in three rooms

`medium` - `library` - **1440** - confidence 0.85 - theme `state`

**What is seen.** In the Library, "All pieces" is selected among "One spec / Variants / Options / Modular / Custom" and shows it with a clay hairline instead of a pearl one. In the People room, "ALL" among "FIELD / CLIENTS / LEADS / MAKERS / TEAM / GCS / SUBS / INSTALLERS / RECEIVERS / COMPANIES" shows it with a filled charcoal pill. In the orders sheet, "ALL" under "PROJECT -" and "PAYMENT -" shows it with a one-pixel underline. Three rooms, three answers to the same question.

**Measurement.** Library selected/unselected differ only by border colour: clay #C4A57B vs pearl #E5E2DD, 1.803:1 between the two hairlines. People selected is charcoal fill at 14.46:1 against white. Orders selected is a 1px rule.

**Shots.** `w1440-room-library.png`, `w1440-room-people.png`, `w1440-ledger-sheet-orders.png`

**Refs.** `research/12-measurements.json library.topBorders`, `research/12-measurements.json people.topBackgrounds`, `apps/designer-portal/src/app/globals.css:79-84`

**Fix (UI only).** Pick one selected-state device and apply it in all three rooms - the charcoal fill already proven in the People room is the strongest and needs no new token - and let the unselected members keep the hairline outline.

**Canon.** D4 - a fill, not a lift; no new surface.

---

## F21 - The margin chip is a card with an eight-pixel eyebrow

`medium` - `margin` - **all** - confidence 0.90 - theme `chrome`

**What is seen.** Two margin chips read "MONEY - VENDOR PAYMENT DUE / Vendor payment - balance / WS-188 - Woodward & Sons" and "MONEY - VENDOR PAYMENT DUE / Vendor payment - deposit / SK-087 - Sawkille Co". Same eyebrow, same rounded outline, same clay left edge; only the last word of the middle line differs. Each chip is a bordered rounded box - a card - and its top line is the smallest type in the product.

**Measurement.** Eyebrow text-[8px], title text-[11.5px], detail text-[10.5px]; container rounded-[5px] border with a 2.5px left edge. The eyebrow is 4px below the declared 12px metadata floor.

**Shots.** `w1440-margin-rail.png`, `m390-doc-project-rich.png`, `w1440-doc-install.png`

**Refs.** `apps/designer-portal/src/components/document/m-item.tsx:46`, `apps/designer-portal/src/components/document/m-item.tsx:51-55`, `apps/designer-portal/src/components/document/m-item.tsx:93-94`

**Fix (UI only).** Drop the container to a left rule on the rail's own ground (see F07) so the chip stops being a card, and lift the three lines onto the 12px floor with the kind word in the pigment's -ink companion so the two identical eyebrows at least differ in weight from their titles.

**Canon.** never-a-card; I151 -ink for the pigment word; D4 no shadow.

---

## F22 - In the money register the money is caption-sized

`medium` - `ledger` - **1440** - confidence 0.90 - theme `type`

**What is seen.** An order reads "AP-012 / RECEIVED / INSPECT / Received and dispositioned / ~May 6" on line one and "OLSEN LAKE HOUSE - $4,200 - NOT SENT / PDF / open document" on line two. The amount is not a typographic object at all: it is a token inside a caption, between a project name and a send state, separated by middots. The PO number above it is set larger. "THROUGHPUT - 6 OPEN - 1 UNSENT" reads as decoration rather than as the register's total.

**Measurement.** PO number is .doc-type-body (15.75px, charcoal, medium); the joined string carrying project, amount and send state is .doc-type-meta (12px mono, quiet ink, uppercase, 0.05em). Rows separated by pearl hairlines with no column rules and no alternating ground.

**Shots.** `w1440-ledger-sheet-orders.png`

**Refs.** `apps/designer-portal/src/components/document/orders-ledger.tsx:563-573`, `apps/designer-portal/src/components/document/orders-ledger.tsx:505`, `apps/designer-portal/src/app/globals.css:817-823`

**Fix (UI only).** Give money its own rank in the ledger: the amount in the serif at the body step, right-aligned on its own axis, in charcoal; leave the project and send state in the caption register. Columns keep their order; only weight, face and alignment change.

**Canon.** typography-first - a ledger's hierarchy is its column ranks, not a box.

---

## F23 - The only ground with value contrast lives below 1180px

`medium` - `mobile` - **390** - confidence 0.85 - theme `tone`

**What is seen.** On a phone the charcoal bar is the single place the eye can land - "IN THIS DOCUMENT / Project - OPEN THE SCHEDULE - MORE" - and the clay underline under the current item is the clearest selected state anywhere in the product. Above 1180px nothing is dark except type and two filled action chips, so the widescreen surface has no anchor at all.

**Measurement.** mobile-bar bg-[var(--color-charcoal)] #2C2926 at 14.46:1 against white; log-strip is charcoal below 1180 and --bg-warm #EEE6DB (1.187:1) above. Route background inventories at 1440 show one charcoal element on desk and seven on the rich document, all of them marks or chips.

**Shots.** `m390-mobile-bar.png`, `m390-desk.png`, `w1440-drawer-strip.png`

**Refs.** `apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:216`, `apps/designer-portal/src/components/document/log-strip.tsx:86`, `apps/designer-portal/src/app/globals.css:25-33`

**Fix (UI only).** Carry the charcoal ground upward into the desktop chrome the mobile bar already stands in for - the drawer strip, and optionally the spine and margin - so the paper reads as a sheet on a desk at every width. The pigment-on-dark inversion the tokens already declare covers the ink.

**Canon.** D4 - value contrast is the sanctioned depth mechanism; the inversion rule in globals.css:25-33 and contrast.test.ts already holds both halves.

---

## F24 - The desk at 390 overflows onto a fourth, unpainted ground

`medium` - `desk` - **390** - confidence 0.85 - theme `chrome`

**What is seen.** At 390 the desk shows a narrow strip down its right edge in a colour that appears nowhere else in the product. It is the Tailwind base layer showing through beyond the shell's painted width. On every other 390 capture the shell covers the viewport and the strip is absent, so the desk alone appears to sit on a different paper.

**Measurement.** m390-desk.png is 874px at DPR 2 = 437 CSS px of content in a 390px viewport - 47px of overflow. All six other m390 captures are 780px (390 CSS). The exposed ground is --background oklch(0.9582 0.0152 90.2357) = approx #F5F1E6, 1.056:1 from the off-white.

**Shots.** `m390-desk.png`, `m390-doc-project-rich.png`

**Refs.** `apps/designer-portal/src/app/globals.css:860`, `apps/designer-portal/src/app/(document)/layout.tsx:55`, `apps/designer-portal/src/components/document/desk-roster.tsx:34`

**Fix (UI only).** Let the roster row's three lanes collapse to a stacked block below the drawer breakpoint so the row stops holding a fixed act lane, and paint the base layer with --bg-primary so any residual overflow shows the room's own ground rather than a fourth colour.

**Canon.** none

---

## F25 - The one texture in the product is one percent alpha

`low` - `doc` - **all** - confidence 0.90 - theme `material`

**What is seen.** The document shell paints a paper grain behind everything. At its declared strength it is not visible on any of the eleven document captures - the paper reads as flat screen cream rather than as stock. It is the only material gesture in a product about materials.

**Measurement.** repeating-linear-gradient with rgba(139,115,85,0.01) on 1 of every 4 pixel rows - roughly a single 8-bit step against #FCFAF6.

**Shots.** `w1440-doc-project-rich.png`, `w1440-doc-brief.png`

**Refs.** `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1766-1775`

**Fix (UI only).** Take the grain to a strength that is actually perceptible on a calibrated display (2-3%) and vary it so it is not a regular 4px stripe, or remove it and let the paper stocks from F05 carry the material read. Either is honest; the current value is neither.

**Canon.** D4 - a background texture, never a shadow.

---

## Index

| id | severity | surface | width | theme | title |
|---|---|---|---|---|---|
| F01 | blocker | doc | all | state | Hover and decision-due paint one FF&E row identically |
| F02 | blocker | desk | all | color | Six-pixel dots carry five states one hue apart |
| F03 | blocker | doc | all | state | One stamp shape carries every kind of state |
| F04 | blocker | doc | all | type | An empty document and a working one print alike |
| F05 | high | doc | all | tone | Room, paper and card sit inside 1.07 to 1 |
| F06 | high | drawer | 1440 | chrome | The Studio Drawer is the same white as a card |
| F07 | high | margin | 1440 | tone | The margin rail has no ground of its own |
| F08 | high | spine | 1440 | tone | The spine wash is invisible against its own paper |
| F09 | high | doc | all | color | The most urgent band is the palest band |
| F10 | high | doc | all | type | A section head and a state chip are one style |
| F11 | high | doc | all | type | Playfair has thirty-nine sizes and no scale |
| F12 | high | doc | all | type | Three in four mono labels are ten pixels or under |
| F13 | high | desk | all | type | The desk's type gives the work no rank |
| F14 | high | doc | all | type | On a furniture line the price outranks the piece |
| F15 | high | doc | all | material | No interiors surface shows what is being bought |
| F16 | medium | doc | all | tone | Three muted ink tokens are one colour |
| F17 | medium | doc | 1440 | state | Hover is one and four hundredths to one |
| F18 | medium | doc | all | rule | Dashed means two things and pearl means everything |
| F19 | medium | people | 1440 | chrome | People renders cards where the Desk renders lines |
| F20 | medium | library | 1440 | state | Selection reads three different ways in three rooms |
| F21 | medium | margin | all | chrome | The margin chip is a card with an eight-pixel eyebrow |
| F22 | medium | ledger | 1440 | type | In the money register the money is caption-sized |
| F23 | medium | mobile | 390 | tone | The only ground with value contrast lives below 1180px |
| F24 | medium | desk | 390 | chrome | The desk at 390 overflows onto a fourth, unpainted ground |
| F25 | low | doc | all | material | The one texture in the product is one percent alpha |
