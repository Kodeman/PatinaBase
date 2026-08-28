# W4 — orchestrator rulings (2026-08-28, after the third fix round)

| # | Item | Ruling |
|---|---|---|
| 1 | Today's YOUR HOUSE rail draws the project rooms first at a fixed 240 pt, so the person's own room is the third card at x = 524 on a 402 pt screen — off-screen at rest (`waves/w4/fix3-log.md`, root cause of walk FAIL 1/2) | **The person's rooms come first; the designer's project rooms follow; then "Add a room".** It is her house. Cards are sized so the next card visibly peeks (card width ≈ 0.72 × the viewport, 16 pt gutter) — a scroll affordance, not a hidden third card. At accessibility text sizes the rail wraps to a vertical list, as `ProfileView.roomList` already does. `YourHouseRailTests.projectRoomsComeFirst` flips to the new order. Kody may reverse the order; the peek and the wrap stand regardless. |
| 2 | Fixer's `screencapture -R` caught an unrelated personal window | **Never again.** Screen capture rule added to the plan's global constraints; every walker/fixer brief carries it. Disclosed to Kody in the session summary. |
| 3 | The "first-session presentation stall" | Harness failure, not an app defect (proven by the Settings control). The `panelShielded` latch-without-fuse candidate in `fix3-log.md` becomes a W5 backlog note: add a bounded fuse to the shield's retiring task. |
| 4 | Items 2–5 of round 3 (story/rail height, one un-save path, one Companion sheet driver, Companion rows scroll at XXL) | Unit-verified; the round-4 walk proves them on glass before merge. |
