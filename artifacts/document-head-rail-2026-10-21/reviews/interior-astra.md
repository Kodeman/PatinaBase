LENS:interior-astra

## 1. Root causes

1. **The head organizes controls, not a handoff.** At Friday billing, Leah needs the uninvoiced state and its next action; her hire needs somewhere reliable to edit a selection. Collapse gets title-level prominence while these acts compete below. Evidence: brief lines 27–35; Kody’s FF&E screenshot. **High confidence; high usability impact.**
2. **Selection, purchasing and billing states sound interchangeable.** “1 ready” beside “No selections are ready for purchasing authorization yet” makes a new hire question whether ordering is allowed. Layout must distinguish the state summary from an action’s eligibility; it must not silently reinterpret “ready.” Evidence: brief lines 110–116 and Kody’s FF&E screenshot. **High confidence; high operational impact.**
3. **The job binder has no reliable cover and inconsistent dividers.** “PROJECT” does not tell a principal which household she is about to bill; “Pieces” does not reliably predict “FF&E selections.” Evidence: brief lines 49, 60 and 156; Kody’s rail screenshot. **High confidence; high orientation impact.**
4. **Frequently consulted references look like a footer.** During a maker’s call, the specification book and drawings belong near the job’s contents, not beyond a large blank interval. Unruled chapter labels also resemble an inert contents page. Evidence: rail screenshot; brief lines 62–79. **High confidence; medium-high findability impact.**
5. **The same job changes its vocabulary and anatomy on the phone.** The hire checking installation dates cannot rely on the desktop naming or control locations. Evidence: brief lines 44–46, 87–89; 390 approvals, financials and schedule captures. **High confidence; medium impact.**

I viewed both Kody images and all eight requested US-46 images. The file named `doc-390-ffe-head.jpg` actually shows Project schedule, not an FF&E head; mobile FF&E sizing below is therefore a proposal, not an observed result.

## 2. Head anatomy

**Proposal: “The working divider.”** Like a binder divider with a short handover note: name the subject, say where it stands, offer the next act, then keep its working tools together. Do not turn the head into another ledger.

Slots, in reading and keyboard order:

1. **Name:** `.t-d2`, Playfair 26px/1.2, 500. No redundant eyebrow. No Collapse beside the title.
2. **State:** `.t-body`, Inter 16px/1.55, 400. Optional supporting stage facts use `.t-meta`, DM Mono 12px/1.5, 400, as a separate typographic run—not fragments appended to the sentence with another separator.
3. **Next act:** R201/A5 lead, Inter 15px, 500; unfilled, existing primary score, minimum 44px target. A held lead keeps its reason immediately below, `.t-body-sm`, Inter 14px/1.5, 400, in the same unit.
4. **Working tools and head disclosure:** A5 tools, Inter 14px, 400, minimum 44px targets. Daily tools first; More/Details next; Collapse last. A disclosed panel belongs inside this head, immediately after its trigger row. Its reasons use the same 14px body step. No fixed-height panel, floating shadow or detached content below the section boundary.

Empty slots disappear without moving the remaining slots out of order. “—” below means absent, not printed.

| Fixture / slot 1 | Slot 2: state | Slot 3: next act | Slot 4: tools; disclosed contents |
|---|---|---|---|
| FF&E selections | “21 priced selections are not yet invoiced.” Supporting facts: “1 ready”, “20 released” | Bill 21 uninvoiced | Edit selections; Add items; More; Collapse. More contains **Prepare purchasing authorization** with “No selections are ready for purchasing authorization yet.” immediately beneath; Record a selection change; Open specification book. |
| Client approvals | “3 awaiting decision · Anne Hartwell” | Chase the approval | Collapse. In the alternative fixture, **New approval replaces** Chase the approval; it is not a second lead. |
| Project financials | “Client budget $48,000, $24,868 remaining. $23,132 authorized.” | Record the payment | Draft an invoice; Details; Collapse. Details contains the existing ladder, explanation and change/hour acts. |
| Project closeout | “Everything is settled — close the book when you're ready” | Close out project, held where the fixture requires | Collapse. The held reason sits under Close out project, not in a tooltip or More. |
| The record | “4 complete” | Open project record | Client approvals · 2 awaiting publish; Collapse. |

**Important fixture qualification:** closeout’s supplied “Everything is settled” sentence conflicts with a held action unless a further prerequisite exists. The deck must flag the missing reason rather than invent one. A ready state enables the act; a genuinely held state needs the actual prerequisite from its authority. Likewise, do not relabel FF&E’s “1 ready” as purchasing readiness without establishing what it means.

**Daily/weekly/once-per-job:** Edit selections and Add items remain exposed during sourcing. Held purchasing preparation moves into More with its explanation; it cannot be used now. When purchasing preparation is the elected next act, it occupies slot 3 with its exact name and leaves no duplicate. Friday billing elects Bill 21 uninvoiced. Change recording and the second path to the specification book sit in More; the rail keeps the book directly available. Closeout remains findable but gains no visual urgency merely because it ends the job.

**1440:** all slots start on the same left edge. The lead retains its own line; there is no right-hand action column. Tools may share a wrapping row beneath it. FF&E’s short state sentence and separate metadata run can share one line when they fit. Estimate **about 204px closed**, versus roughly 260px today; allow approximately 18–24px more if metadata wraps. This is an estimate to measure in the deck, not a captured result. Savings come from moving the held unit into the anchored disclosure and removing redundant control-box spacing—not smaller targets. Place “$404 priced · $23,132 released” in the body after a 24px separation, not as a sixth head line.

**390:** preserve slot order, full strings and left alignment. State and supporting facts stack; tools wrap at word boundaries with 44px targets. More opens a full-measure inline disclosure inside the head. Do not fit the desktop height budget by clipping reasons or shortening actions. Collapse leaves name, state and an explicit Expand control; it does not erase the section’s identity. For The record, opening the record and collapsing its containing section remain separate, clearly named operations.

## 3. Rail anatomy

**Proposal: “The job contents.”** The principal opening the Hartwell file and the hire retrieving its installation drawing should recognize a named binder, not a status ornament.

Top to bottom:

1. **Return and cover.** Sentence-case **Studio overview** as the return action. Then **Hartwell residence**, `.t-d3` Playfair 20px/500, wrapping; **The Hartwells**, Inter 14px/400; **Ordering**, DM Mono 12px/400. The title never depends on household availability. Remove the inert mark from this compact block rather than inventing a press action for it.
2. **Contents.** A plain instruction, “Jump to a section,” above six underlined, full-row targets: Client approvals, Project schedule, **FF&E selections**, Project financials, Project closeout, The record. Preserve fixture status facts below each in 12px mono, wrapping without abbreviating away their meaning. Existing live status supplies information, not a badge. The reading bracket and 500-weight current title follow the section in view; hover strengthens the underline, never fills the row. Jump unfolds the destination and focuses its heading. That directly supports a Monday review of approvals, dates and billing.
3. **Room in hand, at ≥1440 when FF&E is current.** One visible **Room in hand: All rooms** chooser replaces persistent rungs. Its anchored disclosure offers Living, Primary bedroom, Dining and Study, plus Clear room focus when applicable. Explain: “Bring this room’s items to the top of each list.” On selection, the closed control reads, for example, “Room in hand: Living.” During a living-room sourcing call this reveals the effect without suggesting that other rooms disappeared. Keep the selected context visible after leaving FF&E; clearing remains in the chooser.
4. **Job references**, only 24px below the contents/room control—not bottom-pinned: Drawing sets, Specification book, Design boards, Project directory. Each is an underlined 44px link/control with the same name everywhere. Routes open their actual pages; Project directory opens its existing sheet. Preserve the fixture’s directory quantity as plain metadata, not a pill.
5. **Keyboard help.** Underlined **Find anything ⌘K** and **Keyboard shortcuts ?**. A short instruction near the contents says “↑ ↓ move · Enter opens”; Home/End and existing `g` chords appear in the shortcuts sheet. Use existing shortcut mappings, not invented ones. The returning hire can learn shortcuts without needing them to discover the controls.

**1440:** retain the 200px rail. The six chapters, four doors, room chooser, return and two keyboard controls total 14 persistent actionable labels; expanded chooser options are transient. No added tools menu or overflow count.

**1180:** retain 136px width, full wrapping names and readable 12px metadata; no room rungs or room chooser. Do not recover space by shrinking type. If room focus is already active, show its context and offer clearing in the FF&E surface. Let the rail scroll vertically when needed; do not recreate a giant spacer.

**Below 1180, including 390:** MobileBar exposes **Sections** with the current section as wrapping context, not truncated mono text. The spine sheet uses the same project name, chapter names, statuses and four explicit doors; no nested More before a door. The sheet is the mobile rail: each door is one activation from that open navigator, with no intermediate reference screen. Include Find anything and Keyboard shortcuts for attached-keyboard users. Return focus to Sections on dismissal, or to the chosen heading after a jump. No room-rung list on the phone.

## 4. One BOLDER alternative for each element

**Head — “The next line.”** Put the state-elected act immediately after the title, before the state sentence; keep the same order across all sections and widths. During a billing session this makes the verb the second thing Leah sees, while retaining every explanatory and working-tool slot below. Test whether that reverses too much of the state-before-action reading habit.

**Rail — “Contents, then the open drawer.”** Place the four explicit reference doors immediately after the project identity, before the chapters. During a site call the drawing set becomes as immediate as opening the binder cover; keep all chapter statuses and the reading bracket below. No icons-only strip, tabs or new persistent global navigation.

## 5. Rulings you would revise

- **D-B52:** replace the large flex gap with 24px separation; drawings and specifications are working references, not footer material.
- **R162 / Direction C naming settlement:** extend the one-name rule to section nouns: use **FF&E selections** and **The record** in rail, heads, sheet and command results; retain the supplied act **Open project record**. This explicitly revises the “Pieces”/“Project record” aliases, not the underlying operations.

R203’s left-stacked objection is respected; no title/action columns return. R127’s permanent-label ceiling and ≥1440 room restriction remain. Fills, targets, focus, type scale and all hard bans remain unchanged. No files or source were changed; this is a design proposal, not runtime verification.
