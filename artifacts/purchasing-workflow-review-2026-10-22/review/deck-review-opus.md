# Deck review (Opus, cross-provider) — SQ-1753 candidate 7853b27a5

I found 22 issues: 3 high, 10 medium, 9 low. Prices, P-item phasing and the status of the rulings are all accurate. Every product drawing carries "Proposal drawing, not built", and "AI" never appears. The serious problems are that the deck doesn't answer Kody's four questions in plain words, three screenshots don't show what their captions claim, and the Hartwell story contradicts itself.

**Spot-checks that held up:** I checked these citations against the repo and the ranges say what the deck claims:
- `po-send/index.ts:398–402`
- `movement-cell.tsx:306–328`
- `movement-tracking.tsx:24–41`
- `00698:143–146` (header tracking "never moves status")
- `00704:575–583` and `00718:1834–1861` (balances flip to due)
- `use-procurement.ts:677–702` and `1889–1945`
- `VISION-DECISIONS.md:400–408`, `467`, `475–489`, `609–615`

The AfterShip (about $70 a month, $0.12 overage) and Ship24 ($39–$59) figures match `carrier-tracking.md`. P-01–P-16 are copied word for word and correctly sorted into NOW, NEXT and LATER. F-01–F-09 are all shown as open, and F25 is called out as open.

## 1. Fidelity

1. **Medium, high confidence. The Hartwell story contradicts itself.** Sheet 12 shows "Receiving at Hartwell site · Dining chairs ×6 · Shipment A". Sheets 4, 10 and 11 send Shipment A to the Receiving warehouse, and sheet 13 says "4 received at warehouse". The outline's sheet 12 never named the chairs; the deck added them. **Fix:** make it "Receiving at Receiving warehouse", or use the lamps (sent to the site in the walk) for the site example.
2. **Medium, medium confidence. The drawn Document left rail looks like a decision that hasn't been made.** On every sheet the rail reads "The client / The direction / Project schedule / Pieces & purchasing / Project financials / Files with this job". The walked rail is "Client approvals / Project schedule / Pieces / Project financials / Project closeout / The record" (`01`, `02v`). Founders could take this as a ruled rail rename, but the US-47 rail rulings are still owed. **Fix:** copy the current rail and change only "Pieces" to "Pieces & purchasing (F-01)".
3. **Medium, high confidence. A key correction from the synthesis is missing.** Direction §2.3 corrects the walk: saved locations already exist in the People editor, so the gap is that the order paper doesn't offer them. Sheet 8 only cites `studio-locations-editor.tsx` in a footnote. The caption "Client home had to be retyped" suggests no saved places exist at all. **Fix:** add a line to sheet 8: "Today: places can be saved under People, but the order paper only offers the warehouse, the studio, the job site or a typed address."
4. **Medium, high confidence. Sheet 6 is a list of instructions, not an example.** Rows read "Show actual standing, separately", "Show aggregate release calculation and current standing" and "Warning-only when absent under the recorded ruling". Founders can't see what Morgan would actually read. **Fix:** use example wording grounded in the walk:
   - "Agreement · Not signed yet — you can still order"
   - "Purchasing authorization · Held"
   - "Client funds · Not paid — sending fronts $3,200 of studio money"
   - "Release · With your other Hale orders this is $6,800, over the $5,000 line — Leah releases"
5. **Low, high confidence. Sheet 10's drawing mixes before and after saving.** The heading "Vendor reports dispatched 22 October" says it's already recorded, yet "Record dispatch" is still offered. "Source: Manual tracking" doesn't say who reported it. **Fix:** show the summary after saving ("Source: Hale's dispatch email · entered by Morgan, 22 October"), or show the form before saving, not both.
6. **Low, medium confidence. Sheets 6 and 7 state F-03 as if it were settled.** "Buyer retains Send" and "Morgan returns to review and Send" read as settled, though the sheet 7 footnote says F-03 is open. **Fix:** add "(F-03 recommendation)".
7. **Low, high confidence. One citation is ambiguous.** The F-09 citation "[H] direction.md:304–315" on sheet 18 points at the 2026-10-05 synthesis, but in this deck it reads as US-50's own `synthesis/direction.md`. **Fix:** write it as `procurement-buying-review-2026-10-05/synthesis/direction.md:304–315`.
8. **Low, high confidence. Some walk findings are left out.**
   - The member's Desk said "Nothing needs you today" while an order was held. Sheet 7 shows only the owner's Desk (`52`), not the member's (`43` or `21`).
   - The inbound notice is addressed "To no address on file", and no notice is drafted at all for job-site deliveries (walk.md:74). It is visible in `17`, `41` and `49` but never called out.
   - The sheet 1 crop cuts off "Everything ordered is moving."

   **Fix:** add `43-desk-1440` to sheet 7, a one-line caption for the notice problem on sheet 17, and widen the sheet 1 crop.

## 2. The four founder questions

9. **High, high confidence. Tracking: "Can I enter a tracking number, and does the status update?" is never answered directly.** The deck doesn't say yes or no anywhere. Sheet 10's subtitle ("Tracking entry does not mean a connected carrier feed") is negative and abstract. The most important fact sits only in a footnote: saving a shipment immediately marks the order *shipped* and can make the balance due. **Fix:** put the answer at the top of sheet 10: "Yes, you can type a carrier and number today. Saving it marks the order shipped straight away, and that can make the balance due. After that nothing updates by itself. UPS, FedEx and USPS numbers become a link; Estes and other freight numbers don't."
10. **High, high confidence. "How does a designer manually buy each item?" is not answered.** No sheet walks through today's path. From the walk it is:
    - open the line, then **Order**
    - order paper: pick a ship-to, then **Send** (or **Hold for release**: the owner approves, then the buyer Sends)
    - acknowledgment check
    - Movement: **Record a shipment**
    - **Log inspection**
    - **Mark installed**
    - Bought elsewhere: **Add items → Bought it already**

    **Fix:** add a short "Today, by hand" strip to sheet 2 or 5, built from walk.md steps 4–15.
11. **Medium, high confidence. "Shipping to multiple job addresses" is only answered in pieces.** The deck never says plainly that today each order has one ship-to, not one per item. The choices are the warehouse, the studio, the job site or a typed address. Only the warehouse is a saved place. Splitting items means separate orders. "One destination per paper initially" appears only in a footnote. **Fix:** state this in sheet 8's subtitle or body, and point to F-05 and P-14.
12. **Medium, high confidence. Receiving on site: today's facts are thin.** Sheet 12 doesn't say what works today: phone receiving fits at 390 with no sideways scroll. It also doesn't say what's hard:
    - four taps to reach the line
    - names cut off
    - the act is called "Log inspection", not "receive"
    - the photo button doesn't open the camera directly
    - Patina Field, the likely phone tool, wasn't walked

    **Fix:** add one "Today" sentence to sheet 12.
13. **Medium, high confidence. Sheet 14 omits the cheap parcel-only option F-07 asks about.** Parcel tracking via EasyPost or Shippo costs about $0.01–$0.03 per shipment, so 20–80 a month is a few dollars. Freight-capable services have a $40–$70 monthly floor. **Fix:** add one line comparing parcel-only cost with freight-capable cost.

## 3. Screenshots vs captions

14. **Medium, high confidence. Sheet 7, `50-paper-over-threshold`: the caption isn't shown.** Caption: "The release gate uses aggregate open orders." The visible frame is the top of the chairs' order paper; the "$6,800 — over the studio's release line ($5,000)" sentence is below the fold. **Fix:** swap in `51-member-held-for-release-1440`, or crop to the release sentence.
15. **Medium, high confidence. Sheet 16, `40-pieces-after-antique`: the caption isn't shown.** Caption: "The dealer buy then reads released to maker." Only the sofa (RECEIVED) and lamps (DAMAGED) rows are visible; the antique row 005 is off-screen. **Fix:** recapture or crop to row 005, or use the full-page `42`.
16. **Low, high confidence. Sheet 4, `42-pieces-overview-status-words`: the chips are off-screen.** The four "RELEASED TO MAKER" chips aren't visible; only the head summary and an INSTALLED sofa row are. **Fix:** crop lower, or caption the visible words ("6 released · 1 open damage claim").
17. **Low, high confidence. Sheet 13, `29-phone-after-damage-logged`: only one deadline is visible.** Caption: "competing deadline summaries". Only "Damage claim deadline not set" shows; the "by Sun 25 October" sentence doesn't. **Fix:** recaption ("Claim drafted; deadline reads 'not set'"), or pair it with the frame that shows the 72-hour sentence.
18. **Low, medium confidence. Evidence screenshots are illegible at normal size.** In the renders for sheets 10, 12 and 14, the 1440 screenshots are thumbnails whose text can't be read without expanding them. The outline says "preserve readable screenshots, crops identified as crops". **Fix:** crop each to the region the caption refers to and label it as a crop.

All other captions I opened match what's visible: `02v`, `14`, `17`, `20`, `27`, `30b`, `32`, `33`, `44`, `48`, `49`, `52`, `54`, `55b`, `56`, `57`, `01`, `07`.

## 4. Voice

No "AI", no hype. Trade terms (sidemark, BOL, PRO, LTL) are fine for a designer who buys. Phrases that are stilted or read like engineering, with suggested rewrites:

19. **Medium, high confidence.**
    - Sheet 10, "Shipment quantities change through existing dispatch authority, not telemetry." Suggest: "The shipment changes because someone recorded what left, not because a carrier sent an update."
    - Sheet 10, "This records evidenced dispatch and actual quantities." Suggest: "Save what the vendor says left, and how many."
    - Sheet 10 caption, "records a studio assertion". Suggest: "is the studio's word, not the carrier's."
    - Sheet 14 subtitle, "Automate carrier observations, not acceptance." Suggest: "Let the carrier tell us where it is, never that it arrived safely."
    - Sheet 14, "Studio reconciles; a human confirms presence and condition." Suggest: "Someone in the studio checks it's really there and in good shape."
    - Sheet 17 caption, "Installed does not reconcile all movement instruments." Suggest: "Installed, yet the shipment still offers Mark delivered and an unsent warehouse notice."
20. **Low, high confidence.**
    - Sheet 12, "Evidence source · Direct observation / named warehouse report". Suggest: "Who saw it · Me, at the door / The warehouse told us (name)".
    - Sheet 12, "Inspection · no clean default". Suggest: "Opened and checked? Not yet / Some / All".
    - Sheet 13, "Notice standing · Draft is not sent notice". Suggest: "Not sent yet — Hale hasn't been told."
    - Sheet 16, "no fictional maker lifecycle is required". Suggest: "no pretend production steps for something already bought."
    - Sheet 6, "accepted consignee to confirm". Suggest: "confirm the name the warehouse receives under."
    - Sheet 1, "No new event is recorded." Suggest: "Nothing — it's a reading."
    - Sheet 13, "under V22". Suggest: "the designer presses Send."

## 5. Vision fit

21. **Low, medium confidence.** Nothing optimizes for engagement, creates lock-in or leaks margin. "No hidden charge" and the privacy gate on the tracking provider are present. Two soft spots:
    - Sheet 14 lists five kinds of automatic internal notices without limiting how often they fire, which works against "the studio won't notice Patina". **Fix:** add "one notice per shipment event, folded into the Desk, never repeated."
    - "Hartwell site" appears in the shared destination list, and the warning about private client addresses is only in sheet 8's footnote. **Fix:** move that warning into the drawing ("visible to this job's team only").

## 6. Drawings labelled as drawings

22. **Low, low confidence.** All 17 product drawings carry "Proposal drawing, not built · Proposed example [M]". Sheet 14 adds "not functioning", sheet 10 says "future proposal, not available here", and sheet 8 says "proposed capability". This passes. One thing to check: in the 1440 and 390 renders, page content starts at x=0 with no side gutter. That may just be how the renders were cropped, so check it in a real browser at 390.

**Verdict:** Faithful on figures, phasing and open rulings, with every drawing labelled as such, but not ready for Kody and Leah. It never answers "can I enter tracking and does status update" in plain words, never describes today's manual buying path, has three captions the screenshots don't show, and contradicts itself on where Shipment A is received. Findings 1, 9–11 and 14–15 must be fixed before sending.
