# Marisol's Walkthrough — Mood Board Suite (panel finding, persona: solo residential designer)

## (a) Friction narrative

Client signed yesterday. Tonight, 20 minutes, one board, presenting tomorrow at 10am from my laptop, then I want to leave a link for her and her partner to react overnight.

First problem: I go to open the new agreement and look for a Boards tab. It's not there. New agreements are apparently a different animal now (`design_services` documents) and don't carry a Boards facet at all — the "Boards" strip I remember from other proposals just isn't rendered. I don't know this is a known issue; I just see nothing. I dig around, find a Project surface for the client, and start a board there instead. That's already five minutes gone figuring out where a board even lives for a brand-new client.

Adding my five library pieces is genuinely fast — "Add a product," pick from my library, it drops in with a full inspector (width, rotation, forward/back). No complaints there.

The West Elm chair: I paste the product URL expecting a live card with the photo and price the way it does for my library pieces. Nothing happens — no title, no image, no price. It's just sitting there as inert text. I have to type the chair's name by hand and it shows "No image." That's not the moment I wanted in front of a client tomorrow.

The linen swatch photo from my phone — I trust the uploads tab is there (it is, per the rail), but I can't actually judge it tonight because I'd need the photo already on my laptop first.

Palette — I pick my go-to warm-neutral palette from the palette rail tab. Fine, in theory; I haven't personally watched this succeed on a live board.

Now I'm rushing to arrange six-ish items and it's chaos: every new piece drops in the exact same spot with zero offset, so the chair I just added is sitting directly under a swatch I placed thirty seconds ago and I don't notice until I nudge something. Resize handles are tiny and close together — I grab the wrong one twice. There's no +/− zoom button anywhere, just a "100%" readout and "Fit" — I'm hunting for pinch/scroll instead of clicking something obvious. Worse: I try to marquee-select three pieces to nudge them as a group and the whole drag reverts with a vague "That change was reverted because it could not be saved" toast. Same thing happens when I try Cmd+D to duplicate a note I want to reuse as a caption — reverted, generic error. On a client-facing deadline, both of those cost me real minutes and trust in the tool.

Presenting tomorrow: Present mode itself is genuinely nice — clean, chrome-free, Escape gets me out. I'll give it that.

Leaving them a link overnight: there is no Share button anywhere on this board. Not in the toolbar, not in "More," not on the boards list. It turns out Share only exists on the (mostly inaccessible-to-me-tonight) legacy proposal-board surface, not on project boards — which is the only surface I could actually reach. So the "leave them a link" half of tonight's job is simply not possible from where I ended up. And even if I'd landed on a board that did have Share, that link is a guest, view-only link — no approve/reject/comment. Real per-pin reactions need an authenticated client-portal login, which is a separate thing I'd have to set up for a client who signed yesterday.

Three weeks later: they've approved 4 of 6 pieces. I'd expect a clean "send approved to purchasing" moment. The pieces exist as a per-item "send to schedule" action in the inspector — but I've never seen it actually fire successfully, and it rides the same save pipeline that just broke on me for blank-board creation, group drag, and duplicate. I don't have confidence it survives contact with a real order.

## (b) Findings

| ID | Severity | Confidence | Area | Claim | Evidence | Suggested direction |
|---|---|---|---|---|---|---|
| F7 | P1 | High | Entry point | Every new-agreement creation path renders `design_services` docs with no Boards facet; the Boards-capable drafting room only survives on legacy fixtures. For new client work, boards are reachable only via project surfaces. | prod-test/report-followup.md F7 — traced to `commercial-documents.ts`/`drafting-room.tsx`. | Restore a Boards facet on new agreements, or make "start a board" reachable from wherever a new client document lives, without tribal knowledge. |
| F1 | P1 | High | Board creation (project path) | "Blank board" — the top, default option — fails 100% of the time on project boards with a raw RPC error exposed to the user (`apply_board_room_state`). Starter templates work from the same dialog. | prod-test/report.md F1. | Fix the project-owned blank-create payload; never surface RPC names in a toast. |
| F2 | P1 | High | Multi-select drag (project path) | Dragging a marquee-selected group fails to save (400s), reverts silently to a generic toast. Single-item transforms work. | prod-test/report.md F2. | Fix group-move payload validation on the project RPC branch. |
| F3 | P1 | High | Duplicate (project path) | Cmd+D always fails on project boards, on both modified and plain items. | prod-test/report.md F3. | Same RPC-branch bug family as F1/F2 — likely one root cause worth fixing once. |
| F4 | P1 | High | Share (project path) | No Share entry point exists anywhere on the project-board surface (toolbar, More, Present, boards list), even though the backend can mint/resolve/revoke a project-owned share. | prod-test/report.md F4; backend proven in AC2.16 (Passed). | Wire the existing Share dialog into the project-room toolbar — this is a frontend gap, not a backend one. |
| M1 | P1 | High | Client reactions | Even where Share exists, guest links are intentionally view-only — no approve/reject/comment. Real per-pin verdicts require an authenticated client-portal session. For a same-week new client with no portal login yet, "leave a link so they react overnight" is not achievable end-to-end. | Ruled: AC2.11 (Passed, "guest never offers verdicts"), Ruling #2 unified-client-render; inventory: BoardsBlock "preview is truth". | Ruled deliberately, but worth revisiting: consider a lightweight verdict-capable guest link for exactly this common solo-designer workflow. |
| M5 | P1 | Low/med | Purchase pipeline | "Send to FF&E schedule" per-pin action exists in code but its actual success under load is unverified, and it likely rides the same `apply_board_room_state` path already shown broken for other project-board mutations (F1–F3). | Expert judgment, pattern-matched to F1–F3; no direct evidence either way. | Add explicit QA coverage for verdict-approved → send-to-schedule on project boards before trusting it in the procurement spine. |
| F2(waived) | — | — | (see F2) | The multi-drag failure is exactly the gap AC1.11 flagged and waived at GA ("an explicit persisted multi-drag delta assertion remains") — it has now manifested as a real production bug. | Known-waived, now confirmed broken — recommend un-waiving. | Prioritize above other waived rows; this one stopped being theoretical. |
| F8 | P2 | High | URL unfurl | Pasting a real West Elm URL fetches nothing (no title/price/image); inert text field. | prod-test/report-followup.md F8. | Known-waived (AC3.12: "one real reachable-site local-stack resolution remains"). Given this is core to her actual sourcing workflow (designers pull from vendor sites constantly), worth prioritizing over other waived items. |
| M2 | P2 | Med | Arranging | New items (+Note, Add product) drop at the same default position with no offset/cascade — silent overlap, easy to lose a just-placed piece under another. | prod-test/report.md UX obs. #2. New — not in AC ledger. | Cascade new-item placement by a small offset. |
| M3 | P2 | Med | Arranging | Resize/rotate handles are small (20×20px) and close together, no hover affordance, at any zoom. | prod-test/report.md UX obs. #3. New. | Larger hit targets and/or hover tooltips; check against the 44px target claim used for mobile bounds. |
| M4 | P3 | Med | Arranging | No visible +/− zoom buttons — only a "100%" readout and Fit; no discoverable path for users without scroll-zoom habits. | prod-test/report.md UX obs. #7. New. | Add explicit zoom controls next to the percentage readout. |
| F5 | P3 | Med | Covers | Console warning "Mood-board cover generation failed" fires on leaving the room; likely stale/blank list thumbnails. | prod-test/report.md F5. New. | Investigate edge-function failure; low urgency but erodes "it just works" trust. |
| F6 | P3 | Low-med | Starter template | "Furniture plan by zone" starter ships with a broken placeholder image by default, for every designer who picks it. | prod-test/report.md F6. New. | Fix the seeded asset. |
| — | P3 | Low | Present mode reliability | No evidence either way on Present mode behaving on flaky client-site wifi (a live in-home scenario). | Expert judgment, no direct evidence — unverified. | Confirm images/assets are cached/prefetched before presenting, not streamed live. |

## What's already excellent
- Add-rail → Library flow: instant, full inspector, feels professional in front of a client.
- Present mode: clean chrome removal, Escape ladder, friendly placeholder tiles.
- Single-item drag/resize/rotate, undo/redo, keyboard nudge: all solid and persist correctly.
- Export (PNG + composition PDF + spec-sheet PDF): all three succeeded with clear status.
- Templates + materialization: correctly converts owner-linked products into a real "Promote to project selection" action.
- ⌘K recent boards / search: fast, correctly scoped.

## What would make me choose Patina over Canva + email
- If the pieces on my board carried real price and vendor data end-to-end (fix F8) — that's the whole reason I wouldn't just screenshot a vendor page into Canva.
- A working, discoverable Share link that actually reaches my client the same night I finish a board (fix F4/F7) — right now Canva+email is more reliable for that exact task.
- Client reactions that don't require them creating a portal account first (address M1) — my clients want to tap "love it"/"pass," not sign up for something.
- A visible, obvious path from "client approved this" to "this is now in my purchase pipeline" (validate M5) — that's the actual differentiator over Canva, but only if it's proven to work.
- Rock-solid basic mechanics (group drag, duplicate, blank-board creation) so I trust the tool under a deadline the way I trust Canva today (fix F1–F3).
