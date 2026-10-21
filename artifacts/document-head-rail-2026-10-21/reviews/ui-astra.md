LENS:ui-astra

## 1. Root causes

1. **Control rank is inverted — high confidence, major usability impact.** In Kody’s FF&E screenshot, Collapse borrows the title’s prominence while the elected billing act floats between paragraphs. The head spends hierarchy on hiding work rather than doing it. Evidence: brief lines 27–30; `region-head.tsx:305–342`.
2. **Spacing separates related things and joins unrelated things — high confidence, major impact.** The sentence and stage quantities run together; the held authorization and its explanation are separated by the entire tools row. Meanwhile the body’s money reads like another head line. Evidence: brief lines 28–35; Kody’s FF&E screenshot. This is a grouping problem, not a need for more decoration.
3. **The rail has identity furniture but no useful identity — high confidence, major impact.** Kody’s rail gives substantial space to the mark and “PROJECT”, but never names the job. Its strongest rule separates that empty identity from the useful content. Evidence: brief lines 58–61 and the rail screenshot.
4. **Navigation is typeset as a caption — high confidence, major impact.** Unscored chapter names, tiny status text and distant doors make the rail resemble a printed contents note. The reading bracket communicates position, not clickability. Evidence: brief lines 61–79; `lens-ladder.tsx:87–89` specifies 13px names and 11px values.

Evidence limit: I viewed both Kody images and all eight requested 1440/390 captures. The file named `doc-390-ffe-head.jpg` actually shows Project schedule; it does not establish the phone FF&E layout.

## 2. Head anatomy

**Proposal: The Working Title.** One left edge, four stable slots, no right-hand action column. Remove duplicate explanatory eyebrows from these five fixtures. No new fill, enclosing box, mark or decorative double rule. Preserve a double rule only where it genuinely opens a movement.

**Slots, in reading order:**

1. **Name:** `.t-d2`, Playfair 26px/31.2px, 500, `--ink`. Nothing interactive beside it.
2. **Standing:** `.t-body`, Inter 16px/24.8px, 400, `--ink`; optional supporting facts on the next line, `.t-meta`, DM Mono 12px/18px, 400, `--text-muted`. Sentence and quantities are different typographic registers, not one punctuated sentence.
3. **Next act:** existing primary tier, sentence-case Inter 15px/500, unfilled, `--ink`, existing paired 1px scores. One elected act only; no invented lead for a waiting section. Its held reason, when applicable, belongs immediately beneath its own control.
4. **Working tools:** Inter 14px/21px, 400, `--text-muted`; 1px resting score, darkening on hover. Frequent tools first, More/Details next, Collapse last. A 24px horizontal gap separates controls. Every control has a minimum 44×44px **border box**, including padding; wrapped text increases height instead of clipping.

Use 12px between name/standing and standing/action group. Lead and tools are successive rows inside that single group, without an extra block gap. End the head with 12px and a 1px `--hairline-strong` rule; the body begins 24px later. This is a head/body boundary, not the region’s closing rule.

| Fixture | Name slot | Standing slot | Next act slot | Working tools / attached disclosure |
|---|---|---|---|---|
| FF&E | FF&E selections | 21 priced selections are not yet invoiced. / supporting line: 1 ready · 20 released | Bill 21 uninvoiced | Edit selections; Add items; More; Collapse. More contains Prepare purchasing authorization with “No selections are ready for purchasing authorization yet.”; Record a selection change; Open specification book. |
| Client approvals | Client approvals | 3 awaiting decision · Anne Hartwell | Chase the approval | New approval; Collapse. If New approval becomes the elected lead in another state, remove its tool duplicate. |
| Project financials | Project financials | Client budget $48,000, $24,868 remaining. $23,132 authorized. | Record the payment | Draft an invoice; Details; Collapse. Details owns the financial explanation and secondary acts. |
| Project closeout | Project closeout | Everything is settled — close the book when you're ready | Close out project | Collapse when expanded; no empty More. Held variant must pair the act with the actual unmet-readiness reason. |
| The record | The record | 4 complete | Open project record | Client approvals · 2 awaiting publish; Collapse only when expanded. If Open project record expands the same content, it becomes Collapse on expansion rather than printing two toggles for one body. |

The FF&E body starts with **“$404 priced · $23,132 released”**, not another head status. Preserve the fixture wording; use the established money treatment there.

**Disclosure:** More and Details expand an in-flow continuation *inside the head*, immediately after the tool row, with 12px inset and a 1px left rule. No detached panel, floating shadow or count. Held controls and their reasons form indivisible pairs; reasons use Inter 14px/21px, not 11.5px. Keep held controls focusable with `aria-disabled`, a described reason and activation blocked. Expansion uses `aria-expanded`/`aria-controls`; focus stays on its trigger. Collapse remains a visible 44px utility, never buried in More.

Moving the held, presently unusable authorization into More is deliberate progressive disclosure, not a claim that its readiness changed. When state elects it as lead, it returns to slot 3. More stays visible even when all its contents are held.

**1440:** everything starts at the same x-coordinate. The tool row fits; no control occupies a far-right column. Estimated FF&E height **about 200px without the movement opener, about 216px with it**, versus today’s ~260px; disclosure closed, body money excluded. This is arithmetic, not a rendered measurement. Expanded disclosure costs real height and must not be marketed as equally compact.

**390:** retain all slot sizes and order. Use 24px side gutters; status wraps; tools wrap in source order with 12px row gaps. Do not shrink type, shorten labels or horizontally scroll controls. The disclosed authorization/reason uses the full available measure. All focus outlines are 2px `--focus-ring`, offset 2px.

**Fixture honesty:** the closeout fixture supplies a settled sentence but also asks for a held act without supplying its reason. Show the settled sentence in the ready example; show a separate held example only with a real reason. Do not invent a blocker or teach contradictory state language.

## 3. Rail anatomy

**Proposal: The Job Register.** Weight comes from a named job, scored destinations and a disciplined rule—not a darker panel. Keep existing `--rail` stock, `--ink` text and no filled selection.

**Top to bottom:**

1. **Return and identity.** “Studio overview” is a sentence-case Inter 14px/400 link with a 44px target. After 12px, print **Hartwell residence**, `.t-d3` Playfair 20px/26px, 500. Then **The Hartwells**, Inter 14px/21px; **ORDERING**, DM Mono 12px/18px. No placeholder household; the project title never disappears. Remove the inert mark from this compact block. Follow with 12px and a 1px `--ink` rule.
2. **Chapter destinations.** Inter 14px/21px, 400; each name has a permanent 1px text-width underline. Status is DM Mono 12px/18px, `--text-muted`, directly below, preserving the six fixture statuses as plain text, never badges. Minimum row height 48px, growing for wraps. Current chapter uses weight 600 plus the existing reading bracket at 2px `--ink`; hover strengthens its underline, never fills its row. Jump still unfolds and focuses the heading. Use **FF&E selections**, not Pieces, so destination and arrival agree.
3. **Room-in-hand.** At ≥1440, beneath active FF&E, indent Living, Primary bedroom, Dining and Study by 12px; Inter 14px/21px, 44px targets. A plain instruction says “Choose a room to bring its items first.” The selected label reads “Living — in hand”, with `aria-pressed`; pressing it again clears focus. This avoids another clear-action label. No room counts masquerading as controls.
4. **The four doors.** After a fixed 24px gap and 1px `--hairline-strong` rule, print Drawing sets, Specification book, Design boards and Project directory, all underlined 14px Inter, 44px minimum targets. Keep the existing 14px icons as secondary cues. The directory’s fixture “6” is ordinary metadata, not a badge or overflow control. Do not pin these doors to the floor across a desert of space.
5. **Keyboard instruction, not another navigation list.** Plain 12px/18px text: “↑ ↓ move · Enter opens · Home / End”; “Find anything ⌘K · Shortcuts ?”. Show Ctrl+K on relevant platforms. The shortcuts sheet exposes the existing g-sequences and t; do not print an alphabet in the rail.

**1440:** retain the 200px rail; 12px internal insets, wrap everything. Six chapters + four rooms + four doors = fourteen destination labels. Group instructions are not additional destinations. **1180:** retain 136px, omit room rungs, allow names/statuses to wrap; a scrollable chapter track yields space to the four always-reachable doors. Never solve height by dropping below 12px.

**Below 1180:** use the existing spine sheet, not an icon rail. MobileBar exposes sentence-case “Sections” and “Project files” as 44px launchers; Project files opens the four-door chooser directly, not through More. At 390 the sheet uses 24px gutters, the same project identity and chapter styles, no room rungs. Keep the document mounted, trap sheet focus, return focus to the opener. These remain document-scoped tools, not global navigation.

## 4. One BOLDER alternative for each element

**Head — The Action Line:** put the elected lead and frequent tools on one left-origin wrapping row below the state, separated by 24px; move nothing beside the title. This can save one 44px row. Explicit R203 exception: it combines two action rows, not the rejected distant right-hand column; reject it if squinting makes tools rival the lead.

**Rail — The Open Contents:** make the desktop rail 240px at ≥1440 and 192px at 1180, with 17px Inter chapter names and 12px statuses. Keep rules, not fill, as the selection signal. This buys legibility at the cost of paper width; it needs an explicit house-scale/navigation-width exception and a real 1180 composition check.

## 5. Rulings you would revise

- **D-B52:** replace the flexible gulf before doors with 24px; retain packed chapters and independent overflow handling.
- **R203, bold head only:** allow one left-aligned action row; never restore a right-hand action column.
- **R127 / house-sheet A3, bold rail only:** widen desktop rail measures and introduce the specified 17px navigation label treatment; the primary proposal keeps existing widths and scale.

All hard bans and the one-fill budget remain intact. The existing brief and house-sheet are sufficient design instruments; no additional tooling or workspace changes are proposed.
