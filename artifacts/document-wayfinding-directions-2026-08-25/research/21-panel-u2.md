# U2 — Interaction & flow / next-action clarity

Lens U2, per `source/instruments.md` §3. All 16 tasks walked against both baselines
(w1440/w1280/m390 flag-off; wt- flag-on) using the shot set, `10-code-anatomy.md`,
`11-canon-digest.md`, `01-shot-ledger.md`, and `probe/01-interactive-probe.md`. Heuristics:
visibility of system status; single primary action; Fitts; Hick; progressive disclosure;
goal gradient.

## Overall

The document's "one sentence, one act" promise (T3) is real about half the time. Where a
specific operational need or the send-wall line fires, the act is exact. But the plain
`stageCopy` fallback — what she sees on five of seven stages once nothing more specific is
active — is a generic "Review {section}," not a named act; and several regions (FF&E, money,
direction) print two or three acts at once with no clear single leader, undercutting the
one-leader doctrine visually even where it holds in code. ⌘K cannot answer a phase-wide
question (T2) and has no entry point at all on a phone, closing off every ⌘K-only door below
1440px. The Worktable (flag-on) does not change any of this — it inherits the same guide,
the same competing acts, and the same mislabeled Care/Install spread.

## Task table

| Task | What-to-do | How-to-get-there | Note |
|---|---|---|---|
| T1 | 5 | 5 | Desk answers the day in one screen at ≥1440; needs-your-hand cards carry a real act each. |
| T2 | 1 | 1 | No surface answers "everything in install"; ⌘K "install" returns zero matches — literally impossible. |
| T3 | 3 | 4 | Guide fires a real act on brief/proposal-with-need/direction; 5 of 7 stage defaults are "Review {X}," a shrug. |
| T4 | 3 | 3 | Region is 1 click away, but the FF&E head shows 3 acts at once and lines can be fully "Unsorted." |
| T5 | 2 | 2 | Works ≥1440 via the shelf leaf; below that, only Desk Recent boards or ⌘K — and ⌘K has no mobile entry point. |
| T6 | 2 | 2 | Same shape as T5 — Plan room/Spec book are ⌘K-only doors below 1440, and ⌘K is unreachable on a phone. |
| T7 | 3 | 4 | The send-wall line (Sent/Opened/Reading/Nudge) is exact once reached; the guide sentence above it is a shrug. |
| T8 | 4 | 4 | "Add a room" is genuinely in-flow at the foot of the FF&E list, found unaided. |
| T9 | 3 | 3 | Three doors to money (Draw an invoice / Amendment / Hours), and the money region itself is folded by default. |
| T10 | 3 | 3 | "Complete Phase" and a timeline are visible; no reviewed shot shows a date-edit control with its ripple preview attached. |
| T11 | 4 | 3 | Esc chain is flawless (probe-verified LIFO); but compact-tier spine marks carry no text and ⌘K Recent can list near-duplicate names. |
| T12 | 3 | 4 | Both Desk header acts are 1 click away, but their distinguishing sub-labels only exist inside ⌘K, not on the Desk itself. |
| T13 | 3 | 3 | Orders sheet shows delivery status per PO but is a global, cross-project ledger — not obviously "without leaving the project's frame." |
| T14 | 2 | 2 | Same global-ledger shape as T13; Receiving tab exists but was not directly verifiable as project-scoped. |
| T15 | 3 | 3 | Call sheet doorway works when the flag is on; flag-off state is structurally indistinguishable from "nobody on this job yet." |
| T16 | 4 | 4 | The Post / margin system generally works and `g t` is instant, but ⌘K's own focus-restore gap taxes any detour through it. |

## Findings

```json
{"id":"U2-01","lens":"U2","persona":null,"task_ids":["T3","T7","T9","T10","T13","T15"],
 "key":"doc|all|both|stagecopy-shrug-verbs",
 "surface":"/doc/[id]","width":"all","flag":"both",
 "title":"5 of 7 stage defaults are 'Review {X}', a shrug",
 "observation":"stageCopy's default action labels are: brief 'Review the brief', proposal (fallthrough) 'Review signing controls', project 'Review active work', install 'Review installation', care 'Review closeout'. Only discovery's 'Continue Discovery' and direction's 'Open Drafting Room' name a real destination or act.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-proposal-sent.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:91-141"]},
 "severity":"high","confidence":0.9,
 "already_ruled":null,
 "suggested_fix":"Name the actual next act per stage instead of 'Review' — e.g. project's default could read 'Move the schedule forward' with a real anchor, not a generic verb standing in for whatever is below the fold.",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-02","lens":"U2","persona":null,"task_ids":["T7","T3"],
 "key":"doc|1440|both|proposal-shrug-buries-nudge",
 "surface":"/doc/[id] proposal spread","width":"all","flag":"both",
 "title":"Guide says 'Review signing controls'; the real act (Nudge) is buried below",
 "observation":"On the sent-proposal fallthrough branch, the guide headline reads 'Wait for the client's signature' with action 'REVIEW SIGNING CONTROLS' — a deferral, not an act. The actual T7 act, 'NUDGE CLIENT USER', sits in a separate block ~200px lower, inside the send-wall state line ('SENT YESTERDAY — NUDGE CLIENT USER').",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-proposal-sent.png","w1440-guide-proposal-sent.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:308-313"]},
 "severity":"medium","confidence":0.85,
 "already_ruled":"C13",
 "suggested_fix":"When a nudge is actually available, let the guide's own action be 'Nudge Client User' instead of 'Review signing controls' — the send-wall line already knows this; the guide should ask it.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-03","lens":"U2","persona":null,"task_ids":["T3"],
 "key":"doc|1440|both|direction-double-leader-drafting-room",
 "surface":"/doc/[id] direction spread","width":"all","flag":"both",
 "title":"Two acts open the same Drafting Room, worded differently",
 "observation":"The guide's action reads 'OPEN DRAFTING ROOM'. Directly below it, the Direction·v1 block prints its own act, 'CONTINUE DRAFTING', for the same destination ('Not started yet — open the Drafting Room to write it'). Both are scored, both are live, ~250px apart on the same screen.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-direction.png","wt-speccing-1440.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:388-397"]},
 "severity":"medium","confidence":0.85,
 "already_ruled":"C7",
 "suggested_fix":"Let the Direction·v1 block carry the one leader for this stage and drop the guide's duplicate act, or vice versa — never both on screen at once.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-04","lens":"U2","persona":null,"task_ids":["T4","T8","T9"],
 "key":"doc|1440|both|ffe-head-three-acts",
 "surface":"/doc/[id] Project·FF&E region head","width":"all","flag":"both",
 "title":"FF&E head shows 3 acts competing for one job",
 "observation":"The FF&E region head prints, left to right: 'ADD TO PROJECT' (rendered as a filled/inked chip, heavier weight), 'BILL 3 UNINVOICED' (scored underline), 'SPEC BOOK →' (scored underline). Three controls at index 0 of the same region head.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-project-rich.png","w1440-spine-detail.png"],"refs":["apps/designer-portal/src/lib/document/ffe-section.tsx:1116-1125,971-1021"]},
 "severity":"medium","confidence":0.85,
 "already_ruled":"C7",
 "suggested_fix":"Pick one leader per state (e.g. 'Add to project' only while nothing is billable, 'Bill N uninvoiced' once something is) and demote the rest under the row-level overflow.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-05","lens":"U2","persona":null,"task_ids":["T9"],
 "key":"doc|1440|both|money-head-three-doors",
 "surface":"/doc/[id] Design authority region head","width":"all","flag":"both",
 "title":"Money region head shows 3 doors for one job",
 "observation":"The Design authority head prints 'DRAW AN INVOICE' (filled chip), 'AMENDMENT', and 'HOURS · THIS PROJECT ↗' side by side, all at the region head.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-money-region.png"],"refs":["apps/designer-portal/src/lib/document/commercial/money-region.tsx:245-273,295-305"]},
 "severity":"medium","confidence":0.85,
 "already_ruled":"C7",
 "suggested_fix":"Named directly by the brief (U2 Q4) — collapse to one scored leader ('Draw an invoice' when money is owed) with Amendment/Hours under the row overflow.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-06","lens":"U2","persona":null,"task_ids":["T9"],
 "key":"doc|1440|both|money-region-folded-by-default",
 "surface":"/doc/[id] Design authority region","width":"all","flag":"both",
 "title":"Money region is folded by default, hiding T9's act behind an extra click",
 "observation":"'Design authority · no authority yet' prints as a fold seam ('UNFOLD ↓') on Chen Residence; the Draw-an-invoice act is only visible after that click.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-doc-project-rich.png"],"refs":["apps/designer-portal/src/lib/document/commercial/money-region.tsx:282"]},
 "severity":"low","confidence":0.75,
 "already_ruled":null,
 "suggested_fix":"Auto-unfold Design authority whenever money is actually owed/overdue, matching the exception already carved for AccountBand on the Delivery table (I141-errata).",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-07","lens":"U2","persona":null,"task_ids":["T3","T10"],
 "key":"doc|1440|off|two-schedule-regions-same-page",
 "surface":"/doc/[id] project spread","width":"1440","flag":"off",
 "title":"Two regions both named 'Schedule' on the same document",
 "observation":"Near the top, a folded seam reads 'Schedule · UNFOLD ↓' (the Rule, folded under key `schedule-rule`). Below a bare 'BAND' divider, an open, unfolded 'Schedule' heading appears with its own 'FOLD ↑' and phase-composer content — same word, different region, ~150px apart.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-doc-project-rich.png"],"refs":["apps/designer-portal/src/lib/document/schedule/schedule-rule-region.tsx:201-210","apps/designer-portal/src/components/document/schedule/schedule-spine.tsx:1070-1088"]},
 "severity":"medium","confidence":0.75,
 "already_ruled":null,
 "suggested_fix":"Give the Rule a distinct printed name ('The Rule' or similar) so 'Schedule' names exactly one thing on the page.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-08","lens":"U2","persona":null,"task_ids":["T3"],
 "key":"doc|1440|both|care-ffe-says-install",
 "surface":"/doc/[id] care spread","width":"all","flag":"both",
 "title":"Care-stage FF&E spread heading literally reads 'Install'",
 "observation":"On Birch Hollow (Care, closed 'Aug 25'), the FF&E spread's own heading is the literal word 'Install', and its empty state reads 'No FF&E lines are scheduled for installation.' — both hardcoded off `mode==='install'` regardless of the fact the section is Care.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-care.png","wt-delivery-care-1440.png"],"refs":["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1436-1445","apps/designer-portal/src/components/document/ffe-section.tsx:~1037,~1232"]},
 "severity":"high","confidence":0.9,
 "already_ruled":null,
 "suggested_fix":"Read `sectionKey` for the heading and empty-state copy the same way `work-block.tsx` already does for its own body text ('Plan the care work' is correct one component over).",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-09","lens":"U2","persona":null,"task_ids":["T3","T15"],
 "key":"doc|1440|off|care-doc-no-guide-headline",
 "surface":"/doc/[id] care spread","width":"1440","flag":"off",
 "title":"Care-stage document shows no guide/next-action headline at all",
 "observation":"On Birch Hollow, between the letterhead vitals row and the 'MESSAGE CLIENT USER / PREVIEW AS CLIENT USER' instruments row, no eyebrow/headline/reason/action block is visible — the page goes straight from vitals to instruments with nothing narrating 'what's next.'",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-care.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:134-140"]},
 "severity":"medium","confidence":0.5,
 "already_ruled":null,
 "suggested_fix":"Confirm whether RedLetterZone/DocumentGuide should be printing 'Close out the project' here and, if it's suppressed by `rows.length===0`, ensure the plain stageCopy default still renders instead of nothing.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-10","lens":"U2","persona":null,"task_ids":["T2"],
 "key":"cmdk|1440|both|phase-search-zero-results",
 "surface":"Command bar","width":"all","flag":"both",
 "title":"⌘K search for a phase ('install') returns zero results",
 "observation":"Typing 'install' into ⌘K, with Aspen Loft Refresh (an Install-phase project) visible behind the dialog, returns only 'No match — Browse the Help Center' and 'Ask the Engine · \"install\"'. No document, ledger, or section is offered.",
 "why_it_blocks":"both",
 "evidence":{"shots":["w1440-cmdk-typed.png"],"refs":["apps/designer-portal/src/components/document/command-bar.tsx:610-645"]},
 "severity":"blocker","confidence":0.9,
 "already_ruled":null,
 "suggested_fix":"Index `active_section`/phase alongside titles so a phase-word query surfaces the matching documents, even without a dedicated fleet view.",
 "hesitation_seconds_estimate":45}
```

```json
{"id":"U2-11","lens":"U2","persona":null,"task_ids":["T5","T6","T2"],
 "key":"mobile|390|both|no-cmdk-entry-point",
 "surface":"Mobile bar / More sheet","width":"390","flag":"both",
 "title":"No visible way to open ⌘K anywhere on a phone",
 "observation":"The mobile bar's left third, centre, and 'More' menu (Time in hand / The Post / Studio books / Leave a note) contain no search/find affordance. Source confirms no mobile component calls the command-bar opener. Since shelves (Plan room/Spec book/Mood boards/Knowledge/Call sheet) are ≥1440-only by ruling (C8) and ⌘K is the stated fallback door below that, T5 and T6 have no path at all on a phone.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["m390-mobile-bar.png","m390-mobile-more-actions.png"],"refs":["apps/designer-portal/src/components/document/mobile/mobile-bar.tsx","apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx"]},
 "severity":"blocker","confidence":0.85,
 "already_ruled":"C8",
 "suggested_fix":"Give the mobile 'More' menu a 'Find anything' row that opens the same Command Bar, even without the ⌘K keyboard chord.",
 "hesitation_seconds_estimate":60}
```

```json
{"id":"U2-12","lens":"U2","persona":null,"task_ids":["T11"],
 "key":"cmdk|1440|both|recent-list-near-duplicate-labels",
 "surface":"Command bar Recent group","width":"1440","flag":"off",
 "title":"⌘K Recent can list two entries both labelled 'Aspen'",
 "observation":"The Recent group shows 'Aspen / ASPEN LOFT REFRESH' and 'Aspen / ASPEN LOFT — LIVING ROOM REFRESH' stacked — same first word, distinguished only by the smaller sub-label.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-cmdk-open.png"],"refs":["apps/designer-portal/src/components/document/command-bar.tsx:503-515"]},
 "severity":"medium","confidence":0.8,
 "already_ruled":null,
 "suggested_fix":"Lead the Recent row with the fuller title (or the household name) rather than a truncated first word, so two live documents for the same household read as different at a glance.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-13","lens":"U2","persona":null,"task_ids":["T11","T3"],
 "key":"spine|1280|both|compact-marks-unlabeled",
 "surface":"Document spine, 1180-1439","width":"1280","flag":"off",
 "title":"Compact-tier spine marks carry no text at all",
 "observation":"At 1280, the seven spine marks render as bare colored bars with no printed label; only the currently-active section's label/sub prints once, below the row. Identifying any other mark requires a hover tooltip.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1280-spine-detail.png"],"refs":["apps/designer-portal/src/components/document/doc-spine.tsx:63,122-130"]},
 "severity":"low","confidence":0.85,
 "already_ruled":"C8",
 "suggested_fix":"Not free for Lane A per C8, but worth naming: even a single-letter or abbreviated label per mark (B/D/Dr/P/Pr/I/C) would beat pure color at this tier.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-14","lens":"U2","persona":null,"task_ids":["T4"],
 "key":"doc|1440|both|ffe-lines-fully-unsorted",
 "surface":"/doc/[id] Project·FF&E region","width":"all","flag":"both",
 "title":"FF&E lines can render with no room heading to anchor a search",
 "observation":"On Chen Residence (0 rooms), all 3 FF&E lines sit under a single 'Unsorted' heading rather than a room name. T4's expected path ('room heading → line unfold') has nothing to click on this document.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-doc-project-rich.png","m390-doc-project-rich.png"],"refs":["apps/designer-portal/src/components/document/ffe-section.tsx"]},
 "severity":"medium","confidence":0.6,
 "already_ruled":null,
 "suggested_fix":"Confirm whether 'Unsorted' is meant to prompt room-assignment explicitly (e.g. 'Assign a room →' per line) rather than reading as a flat, unlabeled list.",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-15","lens":"U2","persona":null,"task_ids":["T3"],
 "key":"doc|1440|off|discovery-advance-act-no-consequence",
 "surface":"/doc/[id] discovery spread","width":"1440","flag":"off",
 "title":"'Begin the Direction' is offered live with 0 of 5 essentials captured",
 "observation":"The Discovery band reads '0 of 5 essentials captured — keep going' with 'BEGIN THE DIRECTION' printed in the same scored, apparently-live style as any other act, directly beside it — no visible warning of what's incomplete or what advancing skips.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-discovery.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:99-105"]},
 "severity":"medium","confidence":0.6,
 "already_ruled":null,
 "suggested_fix":"If this act is not actually disabled pre-essentials, show what carries forward incomplete (or gray it until a minimum is captured) — the brief's Q6 (decision without consequence) applies here too, cannot confirm click-through in this pass.",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-16","lens":"U2","persona":null,"task_ids":["T3"],
 "key":"doc|1440|off|discovery-guide-label-mismatch",
 "surface":"/doc/[id] discovery spread","width":"1440","flag":"off",
 "title":"Guide act label doesn't match the checklist item beneath it",
 "observation":"The guide's action reads 'ADD PROJECT TYPE AND NAMED ROOMS'; the first checklist row directly below it is labelled 'Scope & rooms'. Same input, two different names, adjacent on screen.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-discovery.png"],"refs":["apps/designer-portal/src/lib/document/document-guide.ts:143-170"]},
 "severity":"low","confidence":0.7,
 "already_ruled":null,
 "suggested_fix":"Use the checklist row's own label ('Scope & rooms') as the guide's action text when `withInputs` points at it.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-17","lens":"U2","persona":null,"task_ids":["T1","T3"],
 "key":"doc|1440|off|brief-chips-broken-template-text",
 "surface":"/doc/[id] brief spread","width":"1440","flag":"off",
 "title":"Brief chips print raw template text ('15k_50k', '3 6 Months')",
 "observation":"The Budget chip reads '15k_50k' (literal underscore) and the Timeline chip reads '3 6 Months' (missing separator/dash) — the very facts T1/T3 rely on for a fast read are printed unformatted.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-brief.png"],"refs":["apps/designer-portal/src/components/document/brief-section.tsx"]},
 "severity":"low","confidence":0.85,
 "already_ruled":null,
 "suggested_fix":"Format the budget as a currency range ('$15k–$50k') and the timeline with its separator ('3–6 months') before printing.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-18","lens":"U2","persona":null,"task_ids":["T10"],
 "key":"doc|1440|both|ripple-not-visible-in-schedule",
 "surface":"/doc/[id] Schedule region","width":"1440","flag":"both",
 "title":"No reviewed shot shows a date-edit control with its ripple preview",
 "observation":"Every reviewed Install/Delivery Schedule shot (flag-off and Worktable) shows a phase timeline and 'COMPLETE PHASE' (advances the phase) but no visible 'change this date' control paired with a downstream-impact preview, even though `schedule-ripple-derivation.ts` exists in code.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-doc-install.png","wt-delivery-install-1440.png"],"refs":["apps/designer-portal/src/lib/document/schedule-ripple-derivation.ts"]},
 "severity":"medium","confidence":0.4,
 "already_ruled":null,
 "suggested_fix":"Would be settled by actually clicking 'Adjust dates' on the Rule region (not screenshotted in this pass) — cite as needing a live click-through to confirm whether the ripple surfaces before or only after committing a date change.",
 "hesitation_seconds_estimate":30}
```

```json
{"id":"U2-19","lens":"U2","persona":null,"task_ids":["T2","T5","T6","T9","T12","T13","T16"],
 "key":"cmdk|1440|both|no-focus-restore-on-close",
 "surface":"Command bar","width":"all","flag":"both",
 "title":"⌘K never restores focus to its trigger on close",
 "observation":"Probe-confirmed: `command-bar.tsx` has exactly one focus line (focus the input on open) and no capture/restore of the pre-open `document.activeElement`. Closing with Escape leaves focus on `<body>`, unlike the shelf leaf, margin panel, and ledger sheets, which all restore correctly.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["probe/06-focus-return.png"],"refs":["apps/designer-portal/src/components/document/command-bar.tsx"]},
 "severity":"medium","confidence":0.9,
 "already_ruled":null,
 "suggested_fix":"Capture `document.activeElement` on open and restore it on close, matching the pattern already used by `doc-sheet.tsx` and `margin-rail.tsx`.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-20","lens":"U2","persona":null,"task_ids":["T13"],
 "key":"drawer|1440|both|orders-sheet-focus-restore-noop",
 "surface":"Studio Drawer → Studio books → Orders","width":"1440","flag":"both",
 "title":"Orders sheet's focus-restore silently no-ops from the Studio-books menu",
 "observation":"Probe-confirmed: opening Orders from inside the 'Studio books' disclosure both opens `DocSheet` and unmounts the disclosure (and its own Orders button); `DocSheet`'s restore guard (`if (!focusTarget?.isConnected) return;`) then finds nothing to restore focus to, and focus lands on `<body>`.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["probe/06-focus-return.png"],"refs":["apps/designer-portal/src/components/document/overlays/doc-sheet.tsx:228-262","apps/designer-portal/src/components/document/studio-drawer.tsx:343-372"]},
 "severity":"low","confidence":0.85,
 "already_ruled":null,
 "suggested_fix":"Fall back to the still-mounted 'Studio books' toggle when the original trigger has detached.",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-21","lens":"U2","persona":null,"task_ids":["T4"],
 "key":"room-lens|1440|off|no-visible-release-control",
 "surface":"Document spine, held room","width":"1440","flag":"off",
 "title":"A held room has no visible release control besides its own spine row",
 "observation":"Source-confirmed (not dynamically verified — no reachable project doc in this seed has both rooms and `active_section='project'`): the letterhead's 'In hand · {Room}' line is plain text with no × or close affordance; the only way to release a held room while staying ≥1440px is clicking the same Rooms-block row again.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["probe/07-room-lens-no-rooms.png"],"refs":["apps/designer-portal/src/components/document/doc-letterhead.tsx:63-68","apps/designer-portal/src/lib/document/room-lens-context.tsx"]},
 "severity":"low","confidence":0.5,
 "already_ruled":"C8",
 "suggested_fix":"Add a release control to the letterhead's 'In hand' line itself, so releasing doesn't depend on the Rooms block still being in view.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-22","lens":"U2","persona":null,"task_ids":["T13","T14"],
 "key":"drawer|1440|off|orders-sheet-leaves-project-frame",
 "surface":"Studio Drawer → Orders ledger sheet","width":"1440","flag":"off",
 "title":"Orders is a global cross-project ledger, not a project-scoped view",
 "observation":"T13's success criterion is 'Ack state visible per PO without leaving the project's frame.' The actual door (`g o` or Studio books → Orders) opens a studio-wide sheet filterable by 'ALL / CHEN RESIDENCE / OLSEN LAKE HOUSE' — she must consult and filter a cross-project register rather than anything mounted inside the open document.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-ledger-sheet-orders.png"],"refs":["apps/designer-portal/src/lib/document/registry.tsx:153-175"]},
 "severity":"medium","confidence":0.6,
 "already_ruled":"C4",
 "suggested_fix":"Pre-filter the Orders sheet to the open project when launched from inside a document (the sheet already supports a project filter — default it to the current one).",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-23","lens":"U2","persona":null,"task_ids":["T13"],
 "key":"drawer|1440|off|put-back-esc-doubled",
 "surface":"Orders ledger sheet","width":"1440","flag":"off",
 "title":"'PUT BACK · ESC' prints twice in the same view",
 "observation":"The hint 'PUT BACK · ESC' appears once at the top-right corner of the screen and again inside the dialog's own header row, stacked directly above each other.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-ledger-sheet-orders.png"],"refs":["apps/designer-portal/src/components/document/overlays/doc-sheet.tsx"]},
 "severity":"low","confidence":0.7,
 "already_ruled":null,
 "suggested_fix":"Print the hint once.",
 "hesitation_seconds_estimate":5}
```

```json
{"id":"U2-24","lens":"U2","persona":null,"task_ids":["T10"],
 "key":"doc|1440|both|close-the-book-styled-as-ready-with-blockers-open",
 "surface":"/doc/[id] Closing the book band","width":"1440","flag":"both",
 "title":"'Close the book' looks equally clickable while blockers are listed above it",
 "observation":"On Aspen Loft Refresh (install), the band reads '1 of 6 closed out' and lists 'OPERATIONAL CLOSEOUT STILL OPEN — 2 project phases not completed · 3 coordination items unresolved' directly above a filled 'CLOSE THE BOOK' button rendered in the same weight as any other available act.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-install.png","wt-delivery-install-1440.png"],"refs":["apps/designer-portal/src/components/document/care-band.tsx:275-329"]},
 "severity":"medium","confidence":0.5,
 "already_ruled":null,
 "suggested_fix":"Cannot confirm without clicking whether this act is actually disabled server-side; if it isn't visually distinguished, give it a plainly inert style until blockers clear.",
 "hesitation_seconds_estimate":15}
```

```json
{"id":"U2-25","lens":"U2","persona":null,"task_ids":["T16"],
 "key":"margin|1440|off|no-closed-state-above-1440",
 "surface":"Margin rail","width":"1440","flag":"off",
 "title":"Margin rail has no functional closed state at ≥1440",
 "observation":"Harness-confirmed: `isFullRail` is always true above 1440, so 'margin-open' and 'margin-closed' screenshots are pixel-identical — the rail is permanently mounted and cannot be collapsed, unlike the 1180-1439 tier's explicit 'Margin ←' toggle tab.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-margin-open.png"],"refs":["apps/designer-portal/src/components/document/margin-rail.tsx:228-262"]},
 "severity":"low","confidence":0.85,
 "already_ruled":null,
 "suggested_fix":"Decide deliberately whether ≥1440 should also get a collapse control, or document that the rail is meant to be permanent at that width (currently reads as an oversight, not a decision).",
 "hesitation_seconds_estimate":10}
```

```json
{"id":"U2-26","lens":"U2","persona":null,"task_ids":["T16"],
 "key":"mobile|390|off|primary-action-label-truncates",
 "surface":"Mobile bar","width":"390","flag":"off",
 "title":"Mobile bar's primary action label truncates mid-word",
 "observation":"The centre primary action prints 'MESSAGE THE CLI…' with no visible full label anywhere else on screen — the verb is legible, the object is cut.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["m390-mobile-bar.png"],"refs":["apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:190-205"]},
 "severity":"low","confidence":0.7,
 "already_ruled":null,
 "suggested_fix":"Shorten the label ('Message client') rather than truncating the household name mid-render.",
 "hesitation_seconds_estimate":5}
```

```json
{"id":"U2-27","lens":"U2","persona":null,"task_ids":["T12"],
 "key":"desk|1440|off|capture-lead-vs-open-project-no-sublabel",
 "surface":"/desk header","width":"1440","flag":"off",
 "title":"Desk's two Begin acts carry no distinguishing sub-label on the Desk itself",
 "observation":"The Desk header shows only 'CAPTURE A LEAD' and 'OPEN A PROJECT', no subtext. Their actual distinction ('begin a Brief' vs 'no proposal needed') exists only inside ⌘K's Begin group.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-desk.png","w1440-cmdk-open.png"],"refs":["apps/designer-portal/src/lib/document/registry.tsx:253-278"]},
 "severity":"medium","confidence":0.6,
 "already_ruled":null,
 "suggested_fix":"Print the same sub-label under each Desk header act that ⌘K already carries, so the choice is legible before she opens the command bar.",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-28","lens":"U2","persona":null,"task_ids":["T14"],
 "key":"drawer|1440|off|damage-claim-path-not-verified-project-scoped",
 "surface":"Orders ledger sheet → Receiving","width":"1440","flag":"off",
 "title":"T14's Receiving path shares the same frame-leaving shape as T13, unverified in detail",
 "observation":"The Orders sheet's tab row includes 'RECEIVING' (visible in the same shot used for T13), but no shot in this pass opens that tab, so whether a damage claim can be filed there without losing the open project's context was not directly confirmed.",
 "why_it_blocks":"obvious-how-to-get-there",
 "evidence":{"shots":["w1440-ledger-sheet-orders.png"],"refs":["apps/designer-portal/src/lib/document/registry.tsx:153-175"]},
 "severity":"low","confidence":0.4,
 "already_ruled":null,
 "suggested_fix":"Would be settled by opening the Receiving tab directly and checking for a project filter/return path — flagged as unverified rather than asserted broken.",
 "hesitation_seconds_estimate":20}
```

```json
{"id":"U2-29","lens":"U2","persona":null,"task_ids":["T15"],
 "key":"doc|1440|off|call-sheet-flag-off-indistinguishable-from-empty",
 "surface":"Letterhead instruments / Shelves","width":"1440","flag":"off",
 "title":"Flag-off Call sheet is structurally identical to 'nobody on this job yet'",
 "observation":"The `call-sheet` flag gates the entire roster read, the 'Call sheet' shelf row, and the letterhead's 'CALL SHEET · {n}' instrument (all present, `n=0`, in this fixture because the flag is on). With the flag off, none of these mount at all — a designer would see no Call sheet row anywhere, the same visual result as a project that genuinely has nobody staffed yet.",
 "why_it_blocks":"obvious-what-to-do",
 "evidence":{"shots":["w1440-doc-project-rich.png"],"refs":["apps/designer-portal/CLAUDE.md","apps/designer-portal/src/lib/document/shelves.ts:55-61,106"]},
 "severity":"low","confidence":0.7,
 "already_ruled":null,
 "suggested_fix":"Would be settled by a flag-off shot for direct comparison (not captured in this pass, since the harness ran with `call-sheet:true`); named here because the code structure alone (a fully absent mount, not a disabled one) already predicts the ambiguity.",
 "hesitation_seconds_estimate":15}
```

## Answers to the brief's numbered questions

1. **`deriveDocumentGuide` precedence — is the sentence the actual next move, at each stage?**
   Precedence is unavailable → paused → gate → operational need → proposal lifecycle → stage
   default. The top three tiers (unavailable/paused/gate) and the operational-need tier print
   real, specific acts (confirmed on `doc-brief`'s "New lead — respond by Aug 30 / Review now"
   and the red-letter zone's "Name the phases for this project / Open the schedule"). The
   bottom two tiers are weaker: the proposal-lifecycle fallthrough prints "Review signing
   controls" instead of naming the one live control (U2-02), and the plain `stageCopy`
   default — what she sees once nothing more specific fires — is a shrug on 5 of 7 stages
   (U2-01). So: yes at the top of the chain, no at the bottom, and the bottom is exactly what
   she sees on a quiet Tuesday with nothing overdue.

2. **`stageCopy`'s one-act-per-stage contract — which leader verbs are shrugs?** `brief`
   ("Review the brief"), `proposal` fallthrough ("Review signing controls"), `project`
   ("Review active work"), `install` ("Review installation"), `care` ("Review closeout") — five
   of seven. Only `discovery` ("Continue Discovery") and `direction` ("Open Drafting Room")
   name something concrete, and even discovery's default is vague until `withInputs` overrides
   it with a real field name. See U2-01.

3. **I135's one-leader contract — which regions lead with the wrong word, or with more than
   one word?** The contract holds at the type level (`RegionHead` enforces one `inked` slot),
   but three regions visually print more than one act at index 0 anyway because the head
   composes a leader plus additional scored siblings: FF&E (Add to project / Bill N uninvoiced
   / Spec book →, U2-04), Money (Draw an invoice / Amendment / Hours, U2-05), and Direction
   (guide's Open Drafting Room duplicated by the block's own Continue Drafting, U2-03). None of
   these break the type contract — they just don't read as "one leader" to an eye scanning the
   region head.

4. **Where do ≥2 controls compete for one job?** FF&E head (3), Money head (3), Direction
   stage (2, same destination), Discovery stage (guide act vs. checklist row label mismatch,
   U2-16) — see U2-03/04/05/16.

5. **Round-trip cost after a sheet / leaf / Esc — is she where she was?** Mixed. The shelf
   leaf and the margin panel both restore focus correctly (probe-verified). Two real gaps:
   ⌘K never restores focus on close (U2-19, touches every ⌘K-only door — T2, T5, T6, T9, T12,
   T13, T16), and the Orders/Accounts/Hours sheet's restore silently no-ops when opened from
   inside the Studio-books disclosure (U2-20, touches T13/T14 specifically).

6. **Where is a decision asked without its consequence shown?** T10's ripple derivation exists
   in code but no reviewed screenshot shows a date-edit control paired with a downstream
   preview (U2-18, low confidence, needs a live click to settle). T13's PO ack state was not
   visibly distinct from delivery status on the two Orders rows reviewed. Discovery's "Begin
   the Direction" sits live beside "0 of 5 essentials captured" with no visible warning
   (U2-15). Install's "Close the book" sits inked directly below two listed blockers (U2-24).

7. **Always-visible `···` at FF&E row density — help or noise?** Not observable in this pass:
   the probe found zero row-overflow glyphs anywhere on Chen Residence at the scroll position
   tested, because none of its schedule phases currently carry `headingActions` — there was
   legitimately nothing to render, not a hidden trigger. No verdict possible from the evidence
   gathered.

8. **Where is flag-gated `call-sheet` absence indistinguishable from "nobody on this job"?**
   Structurally, everywhere the flag gates a mount rather than a disabled state: the roster
   read, the shelf row, and the letterhead instrument all fail to render at all when the flag
   is off, which looks identical to a project that genuinely has no one staffed. See U2-29
   (confidence capped at 0.7 — no flag-off shot was captured in this pass to confirm visually).

## What stays true

- **The Esc chain is flawless.** Probe-verified LIFO order (dialog → shelf → put-down) with
  zero stranding, at every layer tested. Any direction should leave this alone.
- **The send-wall state line (T7) is exact once reached.** Sent/Opened/Reading/Most-read plus
  a single nudge act, one scored line, matches C13 to the letter — keep this pattern and
  extend its clarity to the guide sentence that sits above it (U2-02).
- **"Add a room" (T8) is genuinely found unaided**, in-flow at the foot of the FF&E list per
  C12 — no promotion needed, no hunting required.
- **Fold/unfold and its localStorage persistence work correctly** (probe-verified: fold state
  survives a reload, running-index clicks unfold a folded region and scroll to it in one
  click) — a returning designer's reading state is honored.
- **Scroll-spy has no dead zones or double-active zones** (probe-verified across 11 samples) —
  the running index always shows exactly one current reading position.
- **The Worktable (flag-on) changes none of the above, for better or worse** — every finding
  above that isn't explicitly flag-scoped applies identically on the Worktable, because the
  guide, the FF&E/money heads, and the Care/Install mislabel all sit outside the
  `worktable`-gated composition.
