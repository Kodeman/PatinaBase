LENS:ux-astra

## 1. Root causes

1. **Importance and position disagree.** Collapse accompanies the largest type; the useful next act sits alone below. Kody’s FF&E screenshot makes Collapse easier to locate than billing. The tools then repeat the lead’s underline grammar. **High confidence; major usability impact.** Evidence: brief lines 27–35 and `evidence/kody-ffe-head-2026-10-21.jpg`.
2. **The head mixes orientation, action and explanation without stable ownership.** Stage quantities interrupt a sentence; a held authorization’s reason is separated from its control; More reveals content outside the head. Users must infer which words belong together. **High confidence; major impact.** Brief lines 28–34, 147–148.
3. **The rail looks like a printed contents page, not an instrument.** Its project identity is absent, chapter names lack resting link signifiers, and the large gap makes reference doors look unrelated. **High confidence; major impact.** Kody’s rail screenshot; brief lines 58–79. More visual weight alone will not teach the interactions.
4. **Capabilities depend on prior knowledge and viewport.** Room controls appear conditionally; keyboard paths are undisclosed; mobile changes names. That defeats recognition and transfer between devices. **High confidence; moderate impact.** Brief lines 65–89. The supplied `doc-390-ffe-head.jpg` actually shows Project schedule, so it is not evidence of the phone FF&E head.

## 2. Head anatomy

**Proposal: “Name, state, next, tools.”** A single left-origin reading sequence—not a title column opposite an action column. Keep actions below the state at every width, directly answering R203’s objection.

Slots, in order:

1. **Name:** `.t-d2`, Playfair 26/31.2, 500; semantic h2. Remove redundant financial/closeout eyebrows. The name itself is not a button.
2. **State:** `.t-body`, Inter 16/24.8, 400. Optional supporting metadata on its own baseline: `.t-meta`, DM Mono 12/18, 400. No sentence-plus-count concatenation.
3. **Next:** R201 lead tier, Inter 15px/500, unfilled double underline, minimum 44px target. “This is the useful next thing here.” This is a section recommendation, not an automatic send or financial commitment.
4. **Tools:** Inter 14/21, 400, single underline, minimum 44px targets. Ordered: frequent alternatives, More/Details, **Collapse last**. “These are the other things I can do here.” Same order in every section; absent alternatives leave no placeholders.
5. **Opened disclosure:** part of the head, immediately after Tools; body-sm Inter 14/21, 400, actions 14/400. “Here are this section’s less frequent actions or supporting detail.” No detached body div.

| Fixture | 1 — Name | 2 — State / metadata | 3 — Next | 4 — Tools, in order | 5 — Disclosure |
|---|---|---|---|---|---|
| FF&E | FF&E selections | “21 priced selections are not yet invoiced.” / “1 ready · 20 released” | Bill 21 uninvoiced | Edit selections; Add items; More; Collapse | Prepare purchasing authorization — held, immediately followed by “No selections are ready for purchasing authorization yet.”; Record a selection change; Open specification book |
| Approvals | Client approvals | “3 awaiting decision · Anne Hartwell” | Chase the approval | New approval; Collapse | Absent |
| Financials | Project financials | “Client budget $48,000, $24,868 remaining. $23,132 authorized.” | Record the payment | Draft an invoice; Details; Collapse | Existing financial ladder, explanation and secondary acts |
| Closeout | Project closeout | “Everything is settled — close the book when you're ready” | Close out project | Collapse | Absent |
| Record | The record | “4 complete” | Open project record | Client approvals · 2 awaiting publish; Collapse | Absent |

The approvals alternate remains a tool, never a second lead. When authorization becomes the elected FF&E lead, remove its duplicate from More. The body money “$404 priced · $23,132 released” remains in the body, separated by 24px; it is not another head slot. Use “FF&E selections” and “The record” consistently in head, rail, sheet and search; retain old names as search aliases only.

**Held means explain, not disappear.** A held action and its reason are one vertically stacked unit, with the reason at 14/21 and programmatically associated. Keep it reachable for explanation, marked unavailable, and prevent activation; do not depend on hover or low opacity. A held lead remains in Next with its reason. FF&E’s non-elected held authorization belongs inside More, not permanently consuming a whole head line.

**Closeout fixture conflict:** “Everything is settled” cannot truthfully accompany an unexplained hold. The table is the ready variant. The held variant must replace that status with the actual unmet readiness requirement and print that requirement beside the held act. The brief supplies no such requirement; do not invent one or imply that generic waiting makes closeout safe.

**Collapse:** “Fold the section’s contents, not the whole Document.” Keep name, state and an explicit Expand control; hide the action/disclosure/body slots. Move focus to Expand when folding would remove focus. Closeout and Record obey the same rule. “Open project record” opens its record content; Collapse folds the containing section—distinct scopes.

**1440:** estimate **about 210px**, versus ~260px today, closed More, one-line state: 31px name + 43px state/metadata + two 44px action rows + roughly 48px spacing. This saves about 50px without shrinking targets; final layout must measure it. Tools stay packed left, never distributed across the full width. Disclosure expansion is additional height, not hidden in the estimate.

**390:** retain the same order, full labels and type sizes. Tools wrap without horizontal scrolling; Next never competes beside the title. More/Details expands inline within the head, full width, rather than a narrow floating menu. Keep focus on the disclosure trigger when opening; Tab enters its contents, Escape closes and returns focus. Collapse remains the last tool, not a distant corner target. All focus uses `--focus-ring`; no new fill or shadow.

## 3. Rail anatomy

**Proposal: “The job’s contents and files.”** Top to bottom:

1. **Identity:** underlined Inter 14 “Back to Studio overview”; Playfair `.t-d3` 20/26, 500 “Hartwell residence”; Inter 14 “The Hartwells”; DM Mono 12 “Ordering”. The project title is never conditional on household data. Keep the inert mark subordinate; do not style it like a control.
2. **Find anything — ⌘K:** an underlined 44px text button. “Find a section or something in this job.” Chapter search performs the same jump as the rail. Show the platform-appropriate modifier, not a Mac-only promise.
3. **Jump to a section:** six underlined Inter 14 chapter names, each with its plain-text 12px metadata from §5. Full row is at least 44px; hover strengthens the underline without filling it. Keep the current-reading bracket plus heavier name and `aria-current="location"`. “This shows where I am reading, not what needs attention.” Never use status colour as a grade. Jump unfolds and focuses the heading; passive scrolling updates the bracket without stealing focus or repeatedly announcing it.
4. **Room in hand, at ≥1440:** a permanently visible labeled, unfilled chooser: All rooms, Living, Primary bedroom, Dining, Study. Plain helper text: “Bring this room’s items first; keep other rooms visible.” Choosing All rooms clears focus. This replaces conditional tiny rungs with one discoverable 44px control. “Keep this room at the front while I work”—not a filter that hides other rooms. At 1180, omit room selection; if a room is already held, expose its name and Clear room focus, never a silent lingering mode.
5. **Filed with this job:** after 24px and a hairline, not an elastic void. Four underlined 44px doors: Drawing sets, Specification book, Design boards, Project directory. The first three navigate to project reference pages; directory opens a sheet. Preserve the Document’s place on return. Directory’s supplied “6” may be ordinary metadata, never a badge.
6. **Keyboard shortcuts:** underlined 44px control, with “?” beside it. Its sheet explains arrows/Home/End, Enter to jump, existing g-letter paths and t. A short static instruction by the chapter list says “Arrow keys to move; Enter to jump.” These supplement ordinary pointer/Tab access, never replace it.

The six chapters, four doors, Back, Find, room chooser and Shortcuts total **14 actionable labels** at 1440; chooser options belong inside its disclosure. At 1180 the rail stays 136px: wrap names/status, never shrink or truncate. At short heights scroll the rail itself; do not introduce overflow counts. Keep a single roving chapter tabstop; use normal link/button semantics elsewhere.

**Below 1180:** MobileBar’s named **Sections and files** control opens the spine sheet. It repeats project identity, Find, chapters and all four doors in the same order; doors are immediately available in that sheet, not nested under another More. Preserve the existing Next/More responsibilities and timer ownership rather than adding a second dock. At 390, full-width rows, sheet focus containment, explicit Close and focus restoration; reserve the actual bar height so it cannot cover content. This intentionally requests the mobile R124 B1 revision below.

**One-session learning:** the first view names the job and visibly offers “Jump”; the first jump unfolds and focuses the destination while the bracket follows; “Room in hand” states its effect before selection; the nearby four underlined file names explain the doors. Find and Shortcuts remain visible escape routes. No tour, tooltip dependency or promotional prompt is required.

## 4. One BOLDER alternative for each element

**Head — “One act, one drawer.”** Keep only name, state, Next and “Section tools”; put all alternatives and Collapse inside that anchored disclosure. It is substantially shorter, but adds a click to ordinary tools and makes Collapse less immediately findable: test that trade-off, do not assume minimalism wins.

**Rail — “Contents first.”** Remove the decorative mark, let the project name lead, and make chapter names Playfair 20px with an explicit underlined “Jump” action per row. Stronger document character and unmistakable navigation, but a taller rail; retain 12px live metadata and scroll rather than compress.

## 5. Rulings you would revise

- **D-B52:** replace the unbounded gap before doors with 24px; proximity teaches that these files belong to this job.
- **R127 room treatment:** replace conditional ≥1440 room rungs with a permanently labeled chooser; retain the breakpoint and ≤14 actionable-label ceiling.
- **R124 B1, below 1180 only:** permit one named navigation disclosure followed by the destination. Four literal one-tap doors would require extra persistent phone chrome; two predictable taps are preferable to hiding the Document beneath it.

All other §4 constraints stand. This is a read-only design proposal based on the brief, all ten supplied images, typography specification and bounded rail/mobile source inspection—not a runtime accessibility or usability test. Heights are estimates; no files or production state changed.
