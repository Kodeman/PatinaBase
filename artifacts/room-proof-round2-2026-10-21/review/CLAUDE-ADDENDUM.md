# Addendum: Room Proof design review

## Correction to finding 2

I was wrong to say the founders can't judge the case where the design is approved but purchasing isn't authorized because "that state never appears." The existing flow reaches it. `observed-approval-state.json` records `designApproved: true, purchaseAuthorized: false`. On `desktop-approved-without-authority.jpg`, the Accounts margin reads "Design: Direction approved / Purchases: Not authorized / Supplier release: No order released." The missing purchase authorization is a stated scope limit, not a design gap.

The rest of finding 2 still holds, and the new image supports it.

- **Observed:** the same fact is stated three times on that one screen: the deposit card ("does not authorize a purchase"), reading 03 ("A finish decision is not permission to buy") and the "Three separate facts" block.
- **Observed:** the three facts are set at about 11px, and the states differ only by a slight colour shift.
- **Observed:** both "Review the authority →" (`studio-views.js:87`) and "Review design & purchase authority" (`sourcing-views.js:135`) link to Approvals.
- **Inferred:** these labels promise a screen that the scope deliberately leaves out. They should either name the scope limit or point to a labelled design specimen.

## Do the adaptations keep the intent?

**1. Independent facts in the margin, not a chain.** Yes, and it improves on what I proposed. My chain ran from approval through authority to money and release, which implies each step grants the next. A deposit can arrive before approval, so that order is false. Two refinements:
- **Release isn't an independent fact.** It is the gate that depends on the other three. Draw it as an outcome that lists what is blocking it, as the Orders "Release checks" already do. Otherwise it reads as a fourth peer fact.
- **"Remove repetition once comprehension is demonstrated" can only be met if the next round draws a version without the repetition** for designers to test. Wording that states a consequence at the moment of acting (approve, allocate money, release) should stay. Repeated warnings on screens where no decision is made are what should go.

**2. The issued revision as the approval evidence.** Yes. "Issued Rev B" is the accurate term, and my use of "frozen" was loose. Give the design specimens one consistent label so the founders never read them as working states.

## Do the corrected lower screenshots change any findings?

They add evidence. They don't reverse anything.

- **Finding 1 (navigation):**
  - *Observed:* on Piece, the fixed dock covers the "Payment terms" row and the Price-context note.
  - *Inferred:* that strengthens the case for dropping the dock on desktop.
- **Findings 2 and 8 (separate facts; state vocabulary):**
  - *Observed:* on Orders, the largest type in the lower half is a DM Mono pull quote, "A room can be approved while its order is still held." It is a warning on a screen where nothing is being decided.
  - *Observed:* the three release checks all use the same orange dash, whatever their state.
  - *Observed:* blue also marks "Studio only" on Piece and "Ready to bill" on Hours.
- **Finding 3 (display headlines):**
  - *Observed:* display headlines continue down the page: "Source & timing", "Price context" and "Carry it forward." on Piece, "Ready to bill." on Hours.
  - *Inferred:* headlines that state a live figure, such as "0h 30m awaiting a rate.", earn their size. Slogans don't. I'd make that the rule rather than "documents only".
- **Finding 7 (scope):**
  - *Observed:* Hours still says "recorded on this project".
- **Strength 3 (honest state):**
  - *Observed:* the Hours table, the record-time form and the "Price the entry" action in the margin read cleanly. "Working choices · not saved as a configuration" on Piece is good. Leave these alone.

## The 3 most valuable visual changes for the next round

1. **The margin account of facts.** Show it on the room margin, Accounts and Orders, in four states:
   - not approved;
   - approved without authority (live, and reachable now);
   - a labelled specimen: authorized, with the order held;
   - a labelled specimen: released.

   It should share four state marks with the room pins, so the room shows where each object's decisions stand. Then draw the version with the duplicated warnings removed, so it can be tested.
2. **A single navigation masthead.** It holds the project switcher and the Inbox count, and replaces the dock on desktop. The covered rows on Piece are now observed evidence for this.
3. **Compact headers on the operational views.** Accounts, Orders and Hours get a single header line with the object's name and its live state. Large type is kept for headlines that state a figure.

## What I disagree with

- Release shouldn't be drawn as a peer of the three independent facts.
- Comprehension shouldn't be left as an open-ended precondition for removing the repetition. Without a drawn version to test, the eight warnings stay indefinitely.

Otherwise the adaptations keep what I intended: show the facts consistently in one place, explain them less in prose, and keep consequence wording only where someone is about to act.
