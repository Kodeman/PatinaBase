# Round six adversarial review: Patina Room Proof

I read only the four named files, plus round five's SOURCE-MAP.md for continuity. I did not open the page in a browser, so nothing below judges visual layout or contrast. Severity: H = high, M = medium, L = low. Each finding also gives my confidence in it.

## Findings

**H1 · High confidence. The shared eight-stage list puts the advisory flows in the wrong order.** In workflows.js, `R6.stages` is applied to every path, and stage 6 "Implement" comes before stage 7 "Handoff". So in the design path, "Support client implementation" comes before "Deliver a frozen package". That contradicts its own route ("Deliver edition → Client implements") and section 05 ("A design can be delivered before it is installed"). The consultation path has the same problem: "Client acts independently" comes before "Deliver what was promised". Consultation also runs all eight stages, which undercuts the intro's "may… end early". This is the forced universal process the brief warns against. **Fix:** give each path its own list of moments: consultation in 4–5 steps, and design with delivery before support. Or relabel the shared axis so it carries no order.

**H2 · Medium-high confidence. The cross-room package conflicts with the study's scope.** In index.html `#mixed`, the joinery set gathers "living-room and study sheets" issued to Sam. But the Study row says "Client buys and arranges install; client installation not tracked as studio work." **Fix:** either take the study out of the package, or mark the study sheets as information-only for a client-hired contractor and say who instructs that contractor.

**M3 · High confidence. The slip reads as the contract itself.** The `#paper` slip is headed "Our agreement" and lists terms, which reads like a substitute for the contract. **Fix:** retitle it "Agreement summary". Add a reference to the signed agreement's version and date. Say who sees each field, since fee basis may be studio-only.

**M4 · High confidence. "Release" means several different things.** It appears as "room-by-room release", "console release", "technical release" and "the relevant release". This blurs the plan's own split between purchasing authority, funding and drawing issue. **Fix:** name the actual act each time: order placement, fabrication go-ahead, or drawing issue.

**M5 · Medium confidence. The full-service closure criterion merges handoff with service closure.** `full.slip.finish` reads "Room handed over; every remaining obligation assigned". That lets the studio call itself complete while it still owns open work, such as the mirror replacement, and it leaves out the final accounting that the cited Justine Sterling process includes. **Fix:** give two separate criteria: "Handed over when…" and "Service closed when… account reconciled; studio obligations resolved or transferred."

**M6 · Medium confidence. Funding is required too early.** Full path step 2 says "agreement and funding conditions are satisfied" before discovery has started. **Fix:** require only the design start conditions here (for example a retainer), and make merchandise funding a per-order condition.

**M7 · High confidence. The two example switches change each other.** In presentation.js, the switches in `#journeys` and `#paper` share one `selectedPath`. Picking an example in `#paper` silently changes the journey section off-screen. The live region then announces a journey stage, not the paper change. **Fix:** keep the two selections separate, or label them "linked". Announce changes for the section the user is actually in.

**M8 · High confidence. Two numbered sequences don't match.** The five-item `#path-route` and the eight stage buttons sit side by side with no mapping between them. Readers may also try clicking the route items. **Fix:** map each route item to its stages, or drop one of the two sequences.

**M9 · Medium confidence. Disagreement between the lenses is resolved, not recorded.** `.tension` gives one tension and then the authors' "resolution". DESIGN-PLAN says to record conclusions that differ across lenses. **Fix:** list two or three disagreements marked unresolved, for example whether the index is organised by room or by package, and whether advisory jobs show purchasing chapters at all.

**M10 · Medium confidence. The building-team path assumes an architect.** The renovation slip says "Architect coordinates building design". Many US residential remodels have no architect, have a GC hired directly by the client, or are run by design-build firms where the designer is the builder. This matters more because the example house is in Wisconsin while the frameworks cited are UK ones (BIID, RIBA). **Fix:** add a variant note covering these cases.

**M11 · Medium confidence. A single ownership value per line is too coarse.** Common cases break it: customer's own material (COM) on a studio order, client-paid orders placed through the studio's trade account, and client-bought items received or installed by the studio's people. LR-18 skips the last case entirely. **Fix:** separate payer, purchaser of record, receiver and installer, or list this as an open question.

**M12 · Medium confidence. Termination is missing.** `.branch-note` covers pause, reduced scope and decline, but not termination or a dispute with custom deposits or orders already placed. That is often the hardest closure case. **Fix:** add a branch for it.

**M13 · Low confidence in the claims themselves; the citation gap is real. Current-capability claims can't be checked from these files.**
- **Unverified claims:** the `#evidence` table says that at 713c257f8, lead capture, triage and structured discovery, closeout, and care editions all exist. The `#finish` boundary text states how punch items behave as fact.
- **Conflict with round five:** round five used a different baseline (30235ede) and listed punch and closeout as outside that study.
- **Fix:** cite file and line for each row in round six's SOURCE-MAP.md. Put the punch claim next to its citation. Note the change of commit.

**L14 · Medium confidence. The simulation framing is slightly overstated.** "Three independent design-agent perspectives" claims more independence than separately prompted agents have. The nav label "Practice review" can read as real practitioners. **Fix:** say "separately prompted" and "Simulated practice review".

**L15 · Medium confidence. The method note is written ahead of time.** It already says "Claude Code performed an independent critique… Dispositions are recorded". **Fix:** check that this is true before publishing.

**L16 · High confidence. The study example uses the living-room image.** The caption calls it an "Illustrative design concept". **Fix:** caption it "Living-room image reused; no study artwork".

**L17 · Medium confidence. Sam's and Ana's roles are never defined.** The outlet question is attached to Ana in the Kitchen row but to Sam's drawing in `.communications`. **Fix:** label each person's role and say which drawing the question belongs to.

**L18 · Medium confidence. The consultation index contradicts the page's own rules.**
- It lists "Purchasing / Field — Not included" as a chapter, but the stated rule is that out-of-scope work appears in the agreement fold.
- "Session & recommendations: Active" appears before the session has happened.
- **Fix:** pick one placement for out-of-scope work, and use "Upcoming" before the session.

**L19 · Medium confidence. "Accountable people" lists several parties for one step.** **Fix:** split it into "Who acts" and "Who decides".

**L20 · High confidence. The downloaded notes use different question wording from the page.** The `labels` in presentation.js are shortened versions of the on-page questions. **Fix:** reuse the exact on-page text.

**L21 · Medium confidence. Small accessibility gaps.**
- The stage buttons' `aria-controls` points to an h3; it should point to the article (which needs an id).
- External links open a new tab without saying so.
- Without JavaScript, the stage detail shows empty headings.
- I couldn't check that the noscript link to REVIEW-SYNTHESIS.md exists.

**L22 · Low confidence. Possible URL typo.** The Justine Sterling link uses the slug "dicovering-home-process". It may be the real address; worth checking.

**L23 · Medium confidence. The examples overlap with the mixed job.** All four slips use Lake Mendota House, and the consultation and full-service examples both claim the living room. **Fix:** label them "alternative arrangements, not the mixed job".

**L24 · Medium confidence. The recruitment plan needs tightening.**
- The three lenses overlap, so "two from each lens" is unclear.
- It doesn't explain how the mixed-service studio fits into the six.
- Asking participants to bring a recent job has no consent or redaction step for client data.

**L25 · Low confidence. No rule for which "Next" is shown.** The single "Next" in `.mixed-title` doesn't say why that action was chosen over the others.

## Strongest agreed recommendations
1. Make the engagement slip a summary that points to the signed agreement, not a replacement for it.
2. Record ownership on each line, splitting payer, purchaser, receiver and installer where they differ.
3. Treat handoff, acceptance, financial closeout and service closure as separate facts, with named owners for whatever is left open.
4. Keep the late-change triage: classify the request first, keep the delivered edition fixed, and never charge automatically.
5. Use practice types only as starting templates; build the job from the actual agreement.
6. Ask designers to walk through a real past job before showing them the proposal.

## Open questions for real designers
- Who should see the slip, especially fee basis and markup?
- Should the working index be organised by room or by work package?
- What makes full-service work "done": open punch items, final reconciliation, or the warranty period?
- Does tracking what the client implements help, or does it create liability?
- How are revisions counted in practice?
- How should termination with orders in flight be closed?
- Does a one-off consultation need a full job paper at all?
- Is aftercare paid work or goodwill?
