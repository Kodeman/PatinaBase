# Room Proof, in practice: design review for the founders

## 1. Verdict

The expansion keeps the approved character. The room-and-margin composition survived almost unchanged, and the operational views have their own document forms instead of recoloured copies of one skin. It isn't ready for another full prototype round yet. Three structural problems sit under the polish:

- **Navigation:** there are four persistent bands even without the review chrome, and there's no model for working across several projects.
- **The separate facts:** design approval, purchase authority, money and order release are kept apart by repeating the same warning sentences, not by one consistent visual element.
- **Headlines:** the display-headline system now takes the top of every working screen.

Fixing those means redrawing about seven screens, not all thirteen.

## 2. Strengths worth protecting

1. **The approved composition survived.** Compare `approved-room.jpg` with `desktop-project.jpg`. Both have the large room photo on the left with numbered pins, and a working margin on the right. The margin keeps the large figure numeral, the object name, the material, the italic note from Leah, "Made with Northline Workshop" and a single dark call to action. Its parts are the same, now inside a working portal.
2. **Each document has its own form.** The services agreement is on stock paper with a letterhead and "Part 01" clauses (`desktop-engagement.jpg`). The spec book opens as a bound cover page with a shadowed edge (`desktop-specbook.jpg`). The purchase order is a separate sheet with a raised edge (`desktop-orders.jpg`). The schedule anchors on a large "18 November" (`desktop-schedule.jpg`). The contact record has a monogram (`desktop-people.jpg`). This directly answers the founders' earlier "recolorations" complaint.
3. **State is honest and specific.** On `desktop-hours.jpg`, "0h 30m awaiting a rate. This time is recorded, not worth zero" is good product thinking. "Order not drafted" and "Ready to draft" on the order sheet are precise. On `desktop-accounts.jpg`, the stock-coloured "Money already received" card is physically separate from the authorization ledger.
4. **Consequences are previewed before anything is committed.** The schedule previews a date change before it is written. In code, approvals bind to a frozen edition, and an order draft is flagged when the specification changes after it was saved. These patterns are strong and should spread to more screens.
5. **The working typography is restrained.** Inter at 13–15px, aligned figures in the amount columns and fine rules make the hours table and the order sheet read cleanly.

## 3. Ranked findings

**1. Navigation has too many layers, is split between top and bottom, and assumes one project.** Severity: high. Confidence: high.
*Observed:* `desktop-project.jpg` stacks six bands: sample bar, masthead, tour strip, project nav, the room/brief/drawings tabs, and the bottom dock. Removing the review chrome (sample bar and tour strip) still leaves four. With "Functionality map" gone, the masthead holds only the wordmark and "Find anything". Global places live in the bottom dock, project places sit in the middle band, and Inbox is hidden inside the "Studio books" pop-up next to Accounts. The dock shows "Lake Mendota House / Project 024" as static text, even on studio-wide views like Orders and Library, and there is no way to switch projects. The Services agreement is a project view with no tab in the project nav: nothing is underlined on `desktop-engagement.jpg`. In the code, "Studio books → Studio accounts" opens project-scoped financials and the project nav appears. "Find anything" searches only the 13 view names.
*Inferred:* a designer running eight to twelve projects needs to answer "which project am I in?" and "what's waiting for me anywhere?" all day. This design makes both hard.
*Alternative:* use one masthead as the single navigation tool. Left to right: wordmark, a project switcher showing the current project or "All projects", then that project's sections including Agreement. Studio-wide places go on the right: Desk, Inbox with a count, Library, Contacts, Books. Drop the bottom dock on desktop and keep it only as the mobile tab bar. The result is two bands instead of four.

**2. The separate facts are explained in sentences, not shown in one consistent place.** Severity: high. Confidence: high.
*Observed:* by my count, eight separate disclaimers say a variation of "this does not authorize a purchase". They appear in the room margin, the approvals margin, the accounts deposit card, accounts reading 03, the order register footer (twice), the spec-book cover and the desk. The same facts then appear in three different widgets: "Three separate facts" on Accounts, "Release checks" on Orders and "Current standing" on the record page. Purchase authority is mentioned everywhere but has no screen of its own. Nothing in the code ever grants it, and "Review design & purchase authority" leads to the design approval page.
*Inferred:* repeated warnings stop being read. The founders can't judge the hard case, where design is approved but purchasing isn't authorized and the order is still held, because that state never appears.
*Alternative:* design one component that shows where the project stands, a compact chain of facts: design approval, purchase authority, money received or allocated, vendor paid, order released, installed. Each fact gets its own mark, date and the person responsible. Show it in the same position in the right margin of every project view, and as a single row per project on the desk. Delete the disclaimers. Draw the purchase-authority act as a sibling of the approval document.

**3. Display headlines take the top of every working screen.** Severity: high. Confidence: high.
*Observed:* every view opens with a large Playfair heading in the style of a magazine line, plus an intro paragraph. Most then add a second one: "Six readings. One clear account.", "Every commitment, with its next step.", "One lead. Two readers.", "Every part, accounted for.", "Ready to bill." Working content starts around 450–500px down a 1000px screen. Accounts shows only three of its six readings above the fold.
*Inferred:* used once, this voice gives the portal character. Used on all thirteen views, it becomes the uniform skin the founders rejected, and it pushes the work below the fold.
*Alternative:* keep display headlines for documents that are read: the room, the spec book, the client's agreement and the desk greeting. On the operational views, use a single 28–32px header line with the object's name and its live state, for example "Lake Mendota · Account — $6,000 received · $0 authorized". Turn the second slogans into plain labels.

**4. The room shows one object's decisions, not the whole room's.** Severity: high to medium. Confidence: medium-high.
*Observed:* on `desktop-project.jpg` all the pins are identical white circles. The index of objects under the photo shows quantities ("2 selected", "Reference only") rather than where each decision stands. The most important fact on the page, "Design approval not yet recorded", is 11px brown text.
*Why it matters:* Room Proof promised to join room, object, material and decision record. That works for one object at a time, but the room never acts as the overview of the project.
*Alternative:* make the pins show state, for example a solid fill once an edition is approved, a ring while waiting on a decision, a dashed outline for reference-only pieces and a small notch once ordered. Turn the object index into a short room schedule with columns for finish, design, authority, order and arrival date.

**5. On the approvals screen, the main evidence is a dropdown.** Severity: medium. Confidence: high.
*Observed:* on `desktop-approvals.jpg`, under the headline "A clear yes, to an exact edition", the edition itself appears as a select menu ("A-01 · Living room direction / Rev B · issued"). The left column is a stack of form fields. The code shows the frozen edition only after the draft exists.
*Alternative:* in the create state, put the frozen edition on the left: the room plate, the list of pieces and a "Rev B" stamp. Move the question, due date and reviewers into the right margin. That also keeps the left-weight/right-flow composition the founders liked.

**6. The desk assumes one project, and its action items are written as slogans.** Severity: medium. Confidence: medium.
*Observed:* `desktop-desk.jpg` says "One room taking shape", shows a single large photo, and lists three items set as Playfair sentences. Only two and a half fit above the fold. "Bring the room into agreement." actually means "send the chair-finish review to Nora by 28 October."
*Alternative:* put a contact sheet of active projects' rooms on the left, each with the standing component from finding 2 and its next date. On the right, list work across projects, each item written as verb, object, person, due date and project tag. Keep the authored line underneath as a secondary voice.

**7. It's unclear whether some screens show the whole studio or one project.** Severity: medium. Confidence: high.
*Observed:* Accounts is labelled "Middle West Studio · Owner preview" but shows "Lake Mendota House · USD" with the project nav present. Hours is labelled "Lake Mendota House · Time ledger" but hides the project nav, and with the "My time" tab selected it still says "recorded on this project" (`desktop-hours.jpg`). Orders is studio-wide while the dock still names Lake Mendota.
*Alternative:* every view states its scope in the masthead switcher, and each operational view offers one scope toggle. Timesheets should open on a week grid across all projects.

**8. The state vocabulary is thin, and blue means too many things.** Severity: medium. Confidence: medium.
*Observed:* blue is used for small eyebrow labels, links, active tabs, "Ready to bill" and "In transit". "Waiting" states are 11px brown text. DM Mono labels everything: breadcrumbs, eyebrows, "Follow the work". That dilutes its intended role as the voice of authored annotation.
*Alternative:* use four state marks, each paired with a word: open, issued/awaiting, agreed, held. Use them the same way on pins, rows and the standing component. Reserve green for agreement and blue for authored annotation. Set state text at 12–13px.

**9. Mobile reflows the desktop layout instead of serving work on site.** Severity: medium. Confidence: high for what's observed.
*Observed:* on `mobile-project.jpg` the room starts about 617px down an 844px screen, and the pins sit under the dock. There are three stacked navigation rows with truncated tabs ("Project flow" is cut off and a fifth tab shows only "A"). On `mobile-hours.jpg`, the Rate and Billing state columns are off-screen. On `mobile-orders.jpg`, the order register starts about 670px down.
*Alternative:* define the three or four jobs mobile is for: answering a client, recording time, receiving a delivery and checking the room with its pins. Design those directly.

**10. The inbox letter doesn't show what it's about.** Severity: low. Confidence: high.
*Observed:* on `desktop-inbox.jpg`, Nora's note about the lighter oak is beautifully set, but the right third of the page is empty. Its only action leads to Contacts. The approved concept's global "Client preview" toggle has also been dropped.
*Alternative:* use the empty right margin for the subject: the chair, its finish options, where its decision stands, and a direct "Prepare finish review" action.

## 4. Brief for the next design round

These changes are ordered by how much they unlock. Draw everything without the review chrome so the founders see the real frame.

1. **Navigation spine.** One masthead with the project switcher and Inbox count, no desktop dock. Redraw the project room and studio-scope Orders. *Compare:* today's four bands against two.
2. **The standing component.** Design it once, then show it in three states where the facts diverge:
   - approved but not authorized;
   - authorized, with the deposit unallocated and the order held;
   - released and in transit.

   Place it on the room margin, Accounts and Orders, and remove the prose disclaimers. Draw the purchase-authority document. *Compare:* can someone answer "Can we order the chairs today?" faster with this than with the current version?
3. **Room as the overview.** Pins that show state, plus the room schedule beneath the photo. Redraw the project room in two states: before approval, and after one piece changes once approved (the out-of-date case).
4. **Running-head system for operational views.** Redraw Accounts and Hours with the compact header, with all six readings visible above the fold. Keep display headlines on the room, spec book, agreement and desk. *Compare:* current and compact Accounts side by side.
5. **A desk for many projects.** Redraw the desk with six to eight fictional projects: a contact sheet of rooms on the left, work across projects on the right. *Compare:* the single-room hero against the contact sheet.
6. **Approvals create state.** The frozen edition becomes the left plate, and the form moves to the margin.
7. **Mobile field screens.** Three of them: the room with pins, a reply plus time entry, and receiving.

**What stays:** the palette, the three type families, the room photo with its margin, the agreement, spec book, order sheet and schedule compositions, the consequence previews, and the honest state labels when they label something rather than warn. **Leave alone this round:** Library, Piece, Engagement, Spec book, People and Schedule, apart from what the switcher and standing component touch.

## 5. Questions to test with designers

1. At 8am with nine live projects, do designers want to land in one project's room or on a desk covering all of them? Does "the room as the entrance" survive that reality, and if so, at what level: per project or per studio?
2. Without the prose warnings, can designers correctly read the standing component? Try "Can you release the Northline order? What's missing?" on both versions and check accuracy, not preference.
3. Where does the editorial voice stop feeling like their studio and start feeling like a magazine wearing their work? Test the editorial and compact Accounts and Desk with working designers, not only the founders.

## 6. Evidence and limits

**Images I viewed:** `approved-room.jpg`, `approved-proof.jpg`, `00-presentation.jpg`, and the desktop captures for desk, project, library, piece, approvals, engagement, schedule, accounts, orders, specbook, people, hours and inbox. Also `desktop-piece-lower.jpg`, `desktop-orders-lower.jpg`, `desktop-hours-lower.jpg`, and the mobile captures for project, orders and hours.

**The three "-lower" captures are identical to the top-of-page captures.** `base.css` sets `html{scroll-behavior:smooth}`, so the capture script's `window.scrollTo` was still animating when each screenshot was taken. I have no visual evidence below the fold. For lower content I relied on the code: the object index and "The room, as agreed." under the photo, release checks on the order sheet, and record-time and rate forms on Hours.

**Files I read:** `DESIGN-PLAN.md`, `README.md`, `screenshots.json`, `capture.cjs`, `mockup.html`, `app.js` and `base.css`, plus most of `core-views.js` and `studio-views.js`. From `sourcing-views.js` I read the library, piece and orders code. I ran targeted searches in `core.css`, the CSS files and the evidence and mapping Markdown files.

**Not read or not done:** I didn't read the approved concept's code, `index.html`, or the existing `claude-feedback.md` and `prompt.txt`, which I left alone to stay independent. I did no browser interaction, no user testing, no inspection of the live portal and no measurements. Pixel positions are estimated by eye from the screenshots.
