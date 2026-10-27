# Round-six follow-up: are H1, H2 and M3–M13 resolved?

I read only the five named files and did not open the page in a browser. "Resolved" below means the presentation no longer misleads on that point. I did not check that the code at `713c257f8` actually does what the page says.

## Prior findings

**H1: resolved (high confidence).**
- **Consultation:** `stageOrder()` now shows only stages `[0,1,2,3,6,7]`. That gives five core moments (Lead & fit → Book the session → Prepare → Advise → Deliver advice) plus "Later / optional". The "Client acts independently" stage is gone.
- **Design:** the order is `[...,4,6,5,7]`, so "Deliver design" now comes before "Client implements". This matches the intro: "design delivery precedes client implementation".
- **Numbering:** stage numbers use the position in the list, not the stage index.
- **Leftover (low):** the old stage 4 is now hidden, and it held the only "distinguish advice from instructions to a trade" text in the consultation path. Also, the design path's delivery stage says "service completion recorded", but support runs to 5 Nov afterwards. The slip's own close condition ("included obligations fulfilled") is right, so that stage text should say "delivery recorded".

**H2: resolved (high confidence).** The joinery set is now "living-room console and kitchen joinery sheets", and "the client's study package remains separate."

**M3: resolved (high).** It now reads "Agreement summary / studio view", gives the fictional reference AG-01 with its date, says it "does not replace" the agreement, and states which audiences see what.

**M4: mostly resolved (medium).** Most uses now name the actual act: order placement, drawing issue or fabrication go-ahead. "Release" survives in K-07 ("GC pricing / release") and in renovation stage 5 ("acceptance and release"), where at least the following act is named. "Approve & release" remains in route data that is no longer rendered.

**M5: resolved (high).** In the full-service path, the close condition now requires that the account is reconciled and studio obligations are resolved or transferred, with "Handoff is recorded separately." `#finish` adds: "Handoff does not itself close the studio's obligations or accounts."

**M6: resolved (high).** Full-service step 2 now says "Merchandise funding is checked later, per order."

**M7: resolved by disclosure (medium-high).** The two switches are still linked, but this is now labelled in two places. The status announcement now matches the section where the switch was clicked.

**M8: resolved (high).** `#path-route` has been removed from the page. The `route` arrays in workflows.js are now unused (trivial).

**M9: resolved (high).** There is a new fold, "Three disagreements to take to real designers", which also says the current answer is unvalidated.

**M10: largely resolved (medium).**
- The slip now says "In this example, the client appoints the architect and GC." The `.communications` note covers GC-led remodels and design-build teams.
- **Leftover (low):** the renovation summary still says the designer "works alongside an architect, GC…". Stage 2's line "does not make the designer the builder" sits awkwardly with design-build, where the designer is the builder.

**M11: resolved as disclosure (high).** The "When one buying owner is not enough" fold covers payer, purchaser of record, receiver and installer, customer's own material, and payment through a trade account. LR-18 now covers the receiver/installer case. The single label per line stays as the default, which is fine.

**M12: resolved, briefly (medium).** The branch note now says: "ends early or is disputed… Stopping new work does not cancel existing commitments."

**M13: resolved within the artifact (medium).**
- SOURCE-MAP.md gives file and line ranges for each row.
- The punch claim now cites `care-band.tsx:140–142` inline.
- The evidence table caption gives both commits (713c257f8 and 30235ede4).
- I cannot confirm the cited lines against the code.

**Earlier low-severity items:** L16 (study caption), L17 (roles now defined), L18 (consultation index), L21 (stage-button `aria-controls`, new-tab notice) and L25 ("Designer-pinned") all appear fixed.

## New findings from the revisions

**N1 · Medium severity, medium confidence. The joinery package now crosses two parties' scopes, and the page doesn't say who instructs Sam.**
- The living room is a studio scope ("custom scope to confirm"). The kitchen is "GC buys and builds its scope."
- Sam, the carpenter, holds a set that covers both rooms, but the page never says whether the studio, Ana or the client appoints him.
- "Before the next act… drawing issue and any separately required fabrication go-ahead" names no one who gives that go-ahead.
- This is exactly the authority question the page says "a viewing role never establishes."
- **Fix:** add one line naming Sam's appointing party and who may issue the go-ahead for each room's sheets.

**N2 · Low severity, high confidence. The kitchen example and the living-room outlet question are mixed up.**
- The renovation example is the kitchen ("Kitchen design & site coordination"), but its working-detail fold describes A-201/B, the north-wall elevation, and OBS-07.
- `.communications` calls OBS-07 "Sam's living-room outlet question". The kitchen row uses a different question, KQ-02, for Ana.
- So the kitchen example shows living-room records.
- **Fix:** point the fold at a kitchen sheet and KQ-02, or relabel the example.

**N3 · Low severity, medium confidence. Hidden consultation stages still exist in the data.** Steps 4 and 5 still hold text that a consultation never displays. That is harmless now, but it would confuse anyone reusing this data.

**N4 · Low severity, medium confidence. The example switches' `aria-controls` point to headings.** They point to `path-title` and `paper-service`, both headings, rather than the regions that change. This is the same pattern I flagged for the stage buttons.

**N5 · Low severity, low confidence. The method note's claim about dispositions can't be checked.** It still says "Dispositions are recorded in the collaboration notes." Those notes weren't among the files I read, so I can't verify it.

## Bottom line

H1, H2, M3, M5, M6, M8, M9, M11, M12 and M13 are resolved in the final artifact. M7 is resolved by labelling the link rather than removing it. M4 and M10 are mostly resolved, with small leftovers. N1 is the only medium-severity item and is worth one sentence before presenting.
