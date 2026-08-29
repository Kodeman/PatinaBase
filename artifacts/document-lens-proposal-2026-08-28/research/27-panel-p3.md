# P3 — Junior designer, week one — walk of /doc/[id]

Seat: P3. 24, Minneapolis, two years out of school. Mydoma internship, Canva, Excel. No legacy
portal to flee to — my only escape is asking someone. I evaluate every screen by whether I can
name what I'm looking at from the label alone, because nobody handed me a glossary.

## 1. One line

The paper never once says "furniture schedule," "purchase order," or "punch list" — it says
"Pieces," "The job," "Closing the book," and "Authorizations & trade scopes," and at 1280px the
entire left spine loses even those words and becomes six unlabeled colored bars I would have to
guess at, in front of a client, on my first week.

## 2. Walk transcript, T1–T16

**T1 — "Tell me what today actually needs — across everything."**
First glance: I'm not inside a document for this one — the task points at `/desk` — but if I try
it from inside an open document (which is where I actually am most of the day, week one), my eye
lands on the tan-tinted box that says "NEEDS ATTENTION · IN ONE PLACE."
Where I'd click: nothing yet — I read the two lines under it first: "Invoice INV-2026-W02 ·
$3,800 overdue — oldest due Aug 14 — send a reminder" and "Name the phases for this project."
Where I'd hesitate: this box answers for *this one client*, not "today." I don't have a second
project open to compare, so I can't tell if this is my whole day or one-sixteenth of it.
Where I'd give up: I'd ask my manager "is there a page that shows all my jobs at once, like a
to-do list?" — I did not find one inside the document.
Frame budget: top — the red box is roughly a fifth of the 900px frame; the other four-fifths above
and below it are Chen Residence's own name, dates, and job-ticket rows telling me about one client,
not my day.
Obviousness: 2

**T2 — "Show me everything that's in install."**
First glance: the six small marks at the top of the spine — thin colored bars, no names attached
at first look.
Where I'd click: I don't have a target. There's no button, tab, or filter anywhere on the paper
that says "Install" as a group of projects — only "Project · ACTIVE" naming *this* project's own
stage.
Where I'd hesitate: I stare at the spine's six bars trying to figure out if clicking one filters
anything project-wide. It doesn't — `doc-spine.tsx` confirms these are this document's own phase
markers, not a fleet view.
Where I'd give up: I'd ask "how do I see every job that's in install?" out loud to whoever's near
me.
Frame budget: all — 0% of any frame answers this; the whole screen, at every scroll state, is one
client's paper.
Obviousness: 1

**T3 — "What's my next move on this one?"**
First glance (top): the tan "NEEDS ATTENTION · IN ONE PLACE" box, because it's colored and
everything above it is not.
Where I'd click: "SEND REMINDER" or "OPEN THE SCHEDULE" — both printed as underlined small-caps
next to the two bullet lines.
Where I'd hesitate: to get there I already scrolled past the strata mark, "Chen Residence," "No
client linked — attach one," START/TARGET/PHASES, a full rule, then "THE JOB · PROJECT" with eight
rows (Rooms, Pieces, Drawings, Spec, Boards, Money, Dates, People) before I even reach the tan box.
That's a lot of paper before one sentence.
Where I'd give up: didn't — the box itself is legible once I reach it.
Frame budget: top — the sentence I actually needed occupies maybe a sixth of the frame at the
point I finally see it; getting there cost the letterhead (title, household chip, vitals, Phases
fold) plus the entire 8-row ticket, which per the anatomy doc is ~600–700px of a 900px window.
Obviousness: 3

**T4 — "Change the fabric on the living room sofa."**
First glance (mid, scrolled to FF&E): the region head reads "Pieces" in large serif type, with "the
FF&E schedule, by room · 1 group · 3 lines" underneath in small type.
Where I'd click: I look for "Living Room" as a heading and don't find one — this seed has "Not in
a room yet" as its only group, holding all three lines. I'd click into "Møbler Lounge Chair —
Bouclé · ×2," which is a chair, not the sofa mentioned in the task, and the seed has no sofa line
at all.
Where I'd hesitate: is "Pieces" the furniture schedule? The word never appears on screen except in
that one small subtitle line — I'd have to read the small print to confirm "FF&E" is what I'm
looking at.
Where I'd give up: with a real project this would likely work once rooms exist; on this thin seed
(3 lines, 0 rooms) I can't actually complete the task — noting this moves the other way on a real
60-line schedule, where room headings would exist and the click count the brief promises (≤2 acts)
is plausible.
Frame budget: mid — the actual editable line is maybe a tenth of the frame; the rest is the ticket
seam, region head, "Plan the project work" empty-task prompt, and "FOLIO + FILE" — none of which
this task needed.
Obviousness: 3

**T5 — "Pull up the mood board for the primary bedroom."**
First glance (top): "BOARDS — No boards yet · start one" is one row inside the eight-row ticket.
Where I'd click: the row's own arrow (→).
Where I'd hesitate: the ticket calls it "Boards," not "Mood boards" — the task script and the
shelf registry both know it as "Mood boards" in places, but what's printed is just "Boards." I
would wonder for a second whether "Boards" means the same thing as the "mood board" my school
professor talked about, or something else (a kanban board? a schedule board?).
Where I'd give up: I did not give up here — the row is present and clickable at top. But the door
disappears the instant I scroll past the ticket into its two-line seam — the ledger confirms the
door is gone from `s1` down. If I'm not standing at the very top of the paper when this request
comes in mid-conversation, I have nothing.
Frame budget: top — the row is one-eighth of the eight-row ticket, itself already the second-
biggest thing on the page.
Obviousness: 3

**T6 — "Where's the floor plan? Where's the spec book?"**
First glance (top): "DRAWINGS — Nothing filed" and "SPEC — 0 of 3 specified · by room," two more
ticket rows.
Where I'd click: their arrows.
Where I'd hesitate: "Drawings" is not the phrase I'd have searched for — I was taught "floor
plan." "Spec" reads like a spec sheet for one product, not "spec book," the whole binder. I'd need
someone to tell me Drawings = floor plan and Spec = spec book.
Where I'd give up: didn't, at top, on a 1440 screen. At 1280 or narrower the anatomy notes both
leaves are dead below 1440 anyway (no routes) — so on my actual laptop (not a big external
monitor) I would click and nothing would happen, and I'd assume the feature was broken, not
missing-for-my-screen-size.
Frame budget: top — two rows, roughly a sixteenth of the frame each; both vanish the moment I
scroll one screen down.
Obviousness: 2

**T7 — "Did the Hendricks ever open my proposal? Nudge them."**
First glance (mid, on a proposal-stage document, not this project one): I'd look for a stamp or
status word near the top.
Where I'd click: whatever the send-wall state line says — I don't have this exact spread in the
shot set for the rich project (it's a `project`-stage doc, not `proposal`), so I'm inferring from
the anatomy note that it lives on "the proposal spread, inside the section body," not in the
ticket or margin.
Where I'd hesitate: as a first-week hire this is exactly the kind of thing I'd get wrong in front
of the client if the "sent/opened/viewed" word isn't in plain English.
Where I'd give up: can't fully rate without seeing this doc's proposal spread — confidence lowered
accordingly.
Frame budget: mid — estimated a fifth of frame for the state line, the rest being letterhead,
ticket, and guide with nothing to do with the question.
Obviousness: 2 (confidence 0.4 on this one specifically — what would settle it: a shot of an
actual proposal-stage document's send-wall state line)

**T8 — "Add the mudroom."**
First glance (mid, deep — below all FF&E rooms): "ADD A ROOM," printed as plain underlined text
at the foot of the one room group ("Not in a room yet").
Where I'd click: "ADD A ROOM."
Where I'd hesitate: none, once I've scrolled there — the label matches the task's own word ("room")
exactly, which is rare on this paper. But *getting* there means passing the whole FF&E body first.
On a 60-line, multi-room real schedule (this seed has one fake room and 3 lines) that scroll would
be much longer — a real Living/Dining/Primary/Mudroom list, per the task table, is 14+8+9+5 = 36
lines before this button.
Where I'd give up: didn't.
Frame budget: mid, deep — the button itself is a sliver, maybe a twentieth of frame; everything
above it in the scroll (letterhead, ticket, guide, instruments, the whole room list) was scrolling,
not reading.
Obviousness: 4

**T9 — "Bill the deposit. And who still owes me?"**
First glance (mid→foot for the money band; also the ticket's "MONEY" row at top): "$6,200 owed
you, 15 days · $16,330 deposit not drawn" in the ticket, and later "The accounts · this project ·
$0 BUDGET · $14,420 COMMITTED · 20% MARGIN · STUDIO EYES ONLY."
Where I'd click: "MONEY" row arrow at top, or ⌘K if I remembered the phrase "Draw an invoice"
(I wouldn't, week one).
Where I'd hesitate: "STUDIO EYES ONLY" next to a percentage and a dollar figure I don't fully
understand ("20% MARGIN") — is that mine to see, or did I open something I shouldn't have as a
junior? I'd freeze there.
Where I'd give up: didn't reach a dead end, but the hesitation is real and costs time.
Frame budget: mid→foot — the money band + account line together are maybe a fifth of the visible
frame at foot; getting there means passing the entire FF&E region, described in the anatomy as
"the longest body on the paper."
Obviousness: 3

**T10 — "Install slipped a week — move it and tell me what it hits."**
First glance (seam and mid): "SCHEDULE — NOT SCHEDULED" in the ticket, then later "Schedule ·
0 phases · nothing active · next milestone —."
Where I'd click: I'd look for a date to drag or an edit control and not find one on this seed — 0
phases means there's nothing to move yet. I'd click "FOLD ↑" by accident trying to find an edit
affordance.
Where I'd hesitate: "ripple" (downstream damage) is a professional concept I understand from
school but the screen never uses that word — it just says "nothing active." I wouldn't know a
ripple view exists to look for.
Where I'd give up: on this seed, yes — nothing to move. Confidence on the populated case is lower
(0.4) since I never saw a shot of an active, dated schedule with a slip in progress.
Frame budget: seam and mid — the schedule glance, per the anatomy, pins under the ticket seam; at
900px that's maybe a tenth of frame, dwarfed by the empty "0 phases" prose above and below it.
Obviousness: 2

**T11 — "Put this down, pick up the Byrnes."**
First glance (all — sticky top-left): "← PUT DOWN," always visible at the very top of the spine.
Where I'd click: "PUT DOWN," instantly — this is the single clearest label on the entire paper. It
does exactly what the label says.
Where I'd hesitate: none.
Where I'd give up: didn't — I'd land on the desk and search by name for "Byrnes," which the task
table confirms is the intended second trip (folio or ⌘K).
Frame budget: all — tiny (a corner of the frame, maybe a fortieth) but it's the one thing on this
whole paper I never had to think about.
Obviousness: 5

**T12 — "New inquiry — start them."**
First glance: nothing on the paper itself — I'd have to already know ⌘K exists.
Where I'd click: ⌘K, if someone told me about it in onboarding; the search icon "Find anything ⌘K"
does live in the persistent bottom bar (visible in every shot), so I do have a discoverable
door — I'd read the small magnifying-glass label and try it.
Where I'd hesitate: "Capture a lead · begin a Brief" versus "Open a project · no proposal needed" —
two verbs I don't have vocabulary for yet: what's a "Brief" as opposed to a normal project? I'd
guess wrong at least once.
Where I'd give up: I'd ask which one to pick the first time, every time, until it stuck.
Frame budget: all — the palette itself would be a full-frame overlay once open, but finding the
door costs nothing since the search affordance is permanent chrome.
Obviousness: 3 (recognition of the door, 4; distinguishing the two verbs, 2)

**T13 — "Did Sturdy Oak confirm the PO?"**
First glance (top): "MONEY" ticket row is my best guess for where PO status would live.
Where I'd click: "MONEY" row, expecting a PO status and finding accounts/invoices instead —
purchase-order acknowledgement per the task table actually lives on a separate Orders sheet
reached by a keyboard chord (`g o`) I do not know as a first-week hire.
Where I'd hesitate: "PO" is a word I know from school (purchase order) but nothing on this document
uses that abbreviation anywhere I can see — I'd be searching for a word that isn't printed.
Where I'd give up: yes — I'd ask a coordinator "how do I check if a vendor confirmed a PO."
Frame budget: all — the true answer is entirely off this frame, on a different sheet; 0% of the
document itself carries it.
Obviousness: 1

**T14 — "The console came in damaged — file it."**
First glance (mid, in the FF&E body): I could plausibly *see* damage on a piece's status tag if
one showed it (this seed's tags read "IN PRODUCTION" and "RECEIVED," no damage state present).
Where I'd click: I'd click the piece line itself, hoping for a "report damage" action inline —
none exists there per the anatomy; filing happens on the Receiving page, off-document.
Where I'd hesitate: I saw the damage (in a populated project) in one place and now have to go
somewhere else entirely to act on it, with no visible link between the two.
Where I'd give up: yes, first attempt — I'd ask "where do I file a damage claim."
Frame budget: mid to see it, then all (off-paper) to act — the FF&E line itself is a small strip,
maybe a fifteenth of frame; the actual filing surface is 0% of this document.
Obviousness: 1

**T15 — "Who's on this job? I need the painter's cell."**
First glance (top): "PEOPLE — Nobody on it yet," another ticket row, plus "CALL SHEET · 0" in the
action row below the tan box.
Where I'd click: "CALL SHEET · 0" — the zero at least tells me nobody's listed yet, which is
honest, if a little bleak for a "who's on this job" question.
Where I'd hesitate: "Call sheet" isn't a phrase from school — closer to a film-set term. I'd
guess it means the roster once someone explained it, but cold, I would not have known.
Where I'd give up: didn't at top. This is another top-only door — gone once I scroll to `s1` per
the ledger, so if I'm deep in the FF&E section when this question comes up mid-call, I'd have to
scroll all the way back up to reach it, or ask.
Frame budget: top — the row is a sixteenth of frame, and the overlay it opens would be full-frame,
but I never got asked this mid-scroll in my own trial run so I can't rate the return trip.
Obviousness: 3

**T16 — "Client asked a question — answer it where it's on the record."**
First glance (all — the margin, sticky on the right at 1440): "IN THE MARGIN" heading with a
"+ NOTE" button, and a stack of cards reading "MONEY · DRAFT," "MONEY · SENT," "TIME · AUG 29."
Where I'd click: I'd look for something that says "message" or "reply" and not find it among these
cards — they're money and time entries, not a client-question thread. I'd fall back to "MESSAGE THE
CLIENT," the underlined link at the top of the action row below the tan box, which is at least
plain English.
Where I'd hesitate: the margin's own first line of copy — "The margin on the right is where
decisions and money gather" — told me decisions and money live here, not client questions, so I
correctly *don't* look here for a reply thread. Good sign the margin's own onboarding text steered
me right, once.
Where I'd give up: didn't — "MESSAGE THE CLIENT" reads plainly enough to click with confidence.
Frame budget: all at 1440 (the margin column is always in frame, roughly a fifth of the 1440px
width, though most of its cards are irrelevant to this task); at 1280 it's a fixed sheet I must
open first, covering the whole paper; at 390 it's chips behind "More."
Obviousness: 4

## Score table

| Task | Obviousness (1–5) | One-line note |
|---|---|---|
| T1 | 2 | Answers for one client, not "my day" — no fleet view exists |
| T2 | 1 | No install-phase-wide surface exists at all |
| T3 | 3 | Right sentence, buried under ~700px of letterhead+ticket first |
| T4 | 3 | "Pieces" never says FF&E out loud except in fine print; thin seed blocks full test |
| T5 | 3 | Found at top; door vanishes below top; "Boards" not "Mood boards" |
| T6 | 2 | "Drawings"/"Spec" need translation; dead below 1440 |
| T7 | 2 | Could not verify on a proposal-stage shot — low confidence |
| T8 | 4 | "ADD A ROOM" matches the task's own word exactly |
| T9 | 3 | "STUDIO EYES ONLY" reads as a warning I might not be cleared to see |
| T10 | 2 | Ripple concept invisible in copy; seed has nothing to move |
| T11 | 5 | "PUT DOWN" is the one label that needs no translation |
| T12 | 3 | Door (⌘K) is discoverable; the two lead-vs-project verbs are not |
| T13 | 1 | "PO" as a word never appears anywhere on the document |
| T14 | 1 | Sees damage in one place, must file it in a place with no visible link |
| T15 | 3 | "Call sheet" needs explaining; top-only, gone on scroll |
| T16 | 4 | Margin's own copy correctly steers away from it; "MESSAGE THE CLIENT" plain enough |

## Special assignment 1 — every label I cannot define from the label alone

- **Client approvals** (spine index row, top) — I'd guess this means the client signing off on
  something, but not *what*: a proposal? a change order? a single line? Turns out ("NO DECISION
  LEAD · NO APPROVALS AUTHORED") it's about decisions and design authorizations, not the client's
  e-signature I was picturing.
- **Schedule** (spine index row, ticket row "DATES") — the spine calls it "Schedule," the ticket
  calls the same thing "DATES." I'd wonder if these are two different things before realizing
  they're one.
- **Pieces** (spine index row, ticket row, region head) — I would have looked for "FF&E" or
  "furniture schedule," the words school used. "Pieces" only tells me it's furniture once I read
  the small subtitle "the FF&E schedule, by room."
- **Money** (spine index row, ticket row) — reasonably guessable, but its contents ("$0 BUDGET ·
  $14,420 COMMITTED · 20% MARGIN · STUDIO EYES ONLY") mix client-facing invoicing with what reads
  like confidential studio profit — I would not have expected a margin percentage to live behind
  the same word as "who owes me."
- **The job · Project** (ticket eyebrow, top) — "Project" is also the stage-tab word ("Project ·
  ACTIVE") and the spine's own top label. Three different UI elements share the word "Project" for
  three different things (a section label, a lifecycle stage, and the ticket's subject line).
- **Rooms** (ticket row) — guessable, but shows "No rooms yet" even though "Pieces" shows 3 lines
  — I'd wonder if the furniture is somehow not "in" the project until it's "in a room," and whether
  that matters.
- **Drawings** (ticket row) — I would have called this "floor plan." I would not have guessed
  "Drawings" means the plan set on first read.
- **Spec** (ticket row) — reads like a single product's spec sheet to me, not "spec book," the
  binder for the whole job.
- **Boards** (ticket row, spine, ⌘K per code) — the task brief itself calls this "Mood boards"
  elsewhere; the screen only ever says "Boards." I'd wonder if a mood board and a project board
  (like a kanban board) are the same feature.
- **The accounts · this project** / **STUDIO EYES ONLY** (foot) — I do not know if this is
  something I, a first-week junior, am allowed to look at, let alone act on. Nothing tells me.
- **Closing the book** (foot) — I would have no idea this means end-of-project closeout tasks. It
  reads like an accounting idiom I've never heard used this way.
- **Authorizations & trade scopes** (foot) — the explanatory sentence under it ("An authorization
  releases signed schedule items for purchasing — a trade scope buys work") helped, but cold, the
  heading alone means nothing to me.
- **hands on the work: you** (foot, under "LEAH HARTWELL") — I'd read this as a typo or a broken
  sentence before realizing it's naming who's staffed on the job.
- **In hand** (spine timer block) — I would guess this is a work-in-progress timer once I see "18
  min" under it, but the phrase alone, cold, reads like a possession status ("this piece is in
  hand") not a running clock.
- **On this paper** (spine running-index heading, ≥1440 only) — "paper" as a synonym for "this
  document" is a metaphor I'd need explained; I would read this literally and wonder what physical
  paper it means.
- **Call sheet** (ticket row, foot roster line) — closer to a film-production term than an interior
  design one; I'd need it explained once.
- At 1280px specifically, the entire spine (`w1280-spine-glyph-rail.png`) drops every one of the
  above words and shows six unlabeled colored bars stacked vertically with no text at all except
  "Project / ACTIV / E" (word-wrapped) and "In / hand" (word-wrapped) — I could not name a single
  section from this view without hovering or clicking each bar in turn.
- I did not find "Knowledge" anywhere on the document, in the ticket, the spine, or the shelf
  registry (`shelves.ts` defines only Plan room, Spec book, Boards, Call sheet, and the client's
  copy) — if this is a label I was told to expect, it isn't reachable from anywhere I looked;
  confidence on this specific point is 0.5, since I did not check every overlay/sheet in the app.

## Special assignment 2 — what was on screen, then wasn't, with no act of mine

- **The job ticket's eight rows** (Rooms/Pieces/Drawings/Spec/Boards/Money/Dates/People) — fully
  visible at `top`; by `s1`/seam they collapse, unasked, into two lines ("$6,200 owed you · 3
  unspecified"). I did not fold anything — scrolling did it. First reaction: I'd think I
  accidentally closed something and go looking for an "undo," not realizing "UNFOLD ↓" quietly sits
  where the eight rows used to be.
- **"NEEDS ATTENTION · IN ONE PLACE" (the tan box)** and **"MESSAGE THE CLIENT / PREVIEW AS THE
  CLIENT / SHARING · MILESTONES / CALL SHEET · 0"** — both present at `top`, both gone by `s2`
  (mid). I scrolled, they left. I'd assume I could always scroll back up to find them again, which
  is true, but nothing tells me that as I lose them — no sticky trace, no "closed, tap to reopen."
- **"Drawings" and "Spec" doors** — reachable at `top` only per the anatomy notes; below `s1` these
  two rows are gone from the frame with no equivalent anywhere else on the paper. If the client
  question about the floor plan comes up mid-scroll (which is realistic — that's when people ask),
  I have nothing until I scroll all the way back to the very top.
- **"Boards" door** and **"People" / "Call sheet" door** — same pattern: top-only, then absent.
- **The right margin's own onboarding sentence** — "The margin on the right is where decisions and
  money gather... Appears once · recedes on use" — this text told me up front that it would vanish,
  which is the one instance on the whole paper where the disappearance was explained to me before
  it happened. I'd like more of the document to do this.
- **The 1280px spine's text labels** — not a scroll-triggered disappearance but a width-triggered
  one: the same information that has full words at 1440 and even fuller words on the mobile sheet
  (Brief/Discovery/Direction/Proposal/Project/Install/Care, each with a status word) has zero words
  at 1280 except the wrapped "Project / ACTIV/E" and "In / hand" fragments. I did nothing to cause
  this — I just have a smaller monitor.

## 3. Findings

```json
{ "id": "P3-01", "lens": null, "persona": "P3", "task_ids": ["T4","T5","T6"],
  "key": "doc|1440|top|ffe-never-says-ffe-on-screen",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "The furniture schedule is called \"Pieces,\" never \"FF&E\" or \"schedule\"",
  "observation": "Ticket row reads \"PIECES — 3 unspecified\"; region head reads \"Pieces / the FF&E schedule, by room · 1 group · 3 lines\" — \"FF&E\" appears only in 11px subtitle text.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-rich-s2.png"], "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:524"] },
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null, "suggested_fix": "Print \"FF&E\" or \"Furniture schedule\" at the same size as \"Pieces,\" not only in the subtitle.",
  "hesitation_seconds_estimate": 20 }

{ "id": "P3-02", "lens": null, "persona": "P3", "task_ids": ["T2"],
  "key": "doc|all|all|no-fleet-phase-view",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
  "title": "No surface answers \"show me everything in install\"",
  "observation": "The only phase-carrying element on the document is this project's own spine (\"Project · ACTIVE\") and stage tabs — nothing on the paper spans other projects.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 900,
  "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["research/10-code-anatomy.md"] },
  "severity": "blocker", "confidence": 0.7,
  "already_ruled": null, "suggested_fix": "Out of scope for the document itself per task table (T2 = desk-level); note for the desk program instead.",
  "hesitation_seconds_estimate": 30 }

{ "id": "P3-03", "lens": null, "persona": "P3", "task_ids": ["T3","T4","T9"],
  "key": "doc|1440|top|header-stack-before-next-move",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "~700px of letterhead+ticket precede the one sentence I need",
  "observation": "Strata mark, \"Chen Residence,\" household chip, vitals, Phases fold, then eight ticket rows (Rooms/Pieces/Drawings/Spec/Boards/Money/Dates/People) all print before \"NEEDS ATTENTION · IN ONE PLACE.\"",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 700,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1787-1791","apps/designer-portal/src/components/document/job-ticket.tsx:362"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "Let the guide/red-letter zone render above or beside the ticket, not strictly after all 8 rows.",
  "hesitation_seconds_estimate": 15 }

{ "id": "P3-04", "lens": null, "persona": "P3", "task_ids": ["T5","T6","T15"],
  "key": "doc|1440|seam|top-only-doors-vanish-on-scroll",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
  "title": "Boards / Drawings / Spec / Call sheet doors exist only at the very top",
  "observation": "Ticket rows for Drawings, Spec, Boards, and People/Call sheet collapse into the two-line seam (\"$6,200 owed you · 3 unspecified\") the moment the ticket pins, with no equivalent door elsewhere on the page.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-ticket-seam.png","w1440-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:244"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "Surface a compact icon-row for these doors in the pinned seam itself, or in the spine.",
  "hesitation_seconds_estimate": 25 }

{ "id": "P3-05", "lens": null, "persona": "P3", "task_ids": ["T2","T15"],
  "key": "doc|1280|all|spine-loses-all-text-at-1280",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "At 1280 the spine is six unlabeled bars, no words at all",
  "observation": "Compact rail shows only thin colored marks; \"Project\" wraps to \"ACTIV/E\" and \"In hand\" wraps to \"In/hand\" — no \"Client approvals\"/\"Schedule\"/\"Pieces\"/\"Money\" text is present anywhere.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 200,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:64"] },
  "severity": "blocker", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "Keep the four index labels as text at 1280, even abbreviated, rather than dropping to glyphs only.",
  "hesitation_seconds_estimate": 40 }

{ "id": "P3-06", "lens": null, "persona": "P3", "task_ids": ["T15"],
  "key": "doc|390|top|mobile-bar-avatar-overlaps-labels",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "both",
  "title": "Mobile bottom-bar avatar badge overlaps \"DOCUMENT\" and \"Project\" text",
  "observation": "The dark \"N\" circular avatar sits on top of the words \"...DOCUMENT\" and \"Project\" in the fixed bottom bar, obscuring several characters.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 60,
  "evidence": { "shots": ["m390-mobile-bar.png"], "refs": ["research/01-shot-ledger.md"] },
  "severity": "medium", "confidence": 0.75,
  "already_ruled": null, "suggested_fix": "Give the avatar badge its own reserved slot instead of layering it over the label text.",
  "hesitation_seconds_estimate": 5 }

{ "id": "P3-07", "lens": null, "persona": "P3", "task_ids": ["T9"],
  "key": "doc|1440|foot|studio-eyes-only-reads-as-warning",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "\"STUDIO EYES ONLY\" beside a margin % reads as a permission wall",
  "observation": "\"The accounts · this project · $0 BUDGET · $14,420 COMMITTED · 20% MARGIN · STUDIO EYES ONLY\" gives no indication whether a junior designer is cleared to view or act on this line.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 90,
  "evidence": { "shots": ["w1440-rich-s3.png"] },
  "severity": "low", "confidence": 0.55,
  "already_ruled": null, "suggested_fix": "State plainly who can see this (e.g. \"visible to principals only\" vs a role-agnostic caption).",
  "hesitation_seconds_estimate": 20 }

{ "id": "P3-08", "lens": null, "persona": "P3", "task_ids": ["T13","T14"],
  "key": "doc|all|all|po-word-never-printed",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
  "title": "\"PO\" / \"purchase order\" is never printed anywhere on the document",
  "observation": "No ticket row, region head, or margin card uses the words \"purchase order\" or \"PO\" — the closest is \"MONEY\" and generic vendor-payment margin cards.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png","w1440-margin-rail.png"] },
  "severity": "high", "confidence": 0.6,
  "already_ruled": null, "suggested_fix": "Confirm on the live Orders sheet whether \"PO\" appears there; if the document itself never uses the term, a junior has no search string to start from.",
  "hesitation_seconds_estimate": 45 }

{ "id": "P3-09", "lens": null, "persona": "P3", "task_ids": ["T14"],
  "key": "doc|all|mid|damage-seen-mid-filed-elsewhere",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
  "title": "Damage is visible on the FF&E line; filing a claim is not reachable from there",
  "observation": "FF&E line status tags read \"IN PRODUCTION\" / \"RECEIVED\" with no visible \"report damage\" action; per anatomy, claim filing lives on the Receiving page, off-document.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s2.png"] },
  "severity": "high", "confidence": 0.5,
  "already_ruled": null, "suggested_fix": "Add a damage-report door directly on the affected FF&E line, even if it opens the same off-document sheet.",
  "hesitation_seconds_estimate": 30 }

{ "id": "P3-10", "lens": null, "persona": "P3", "task_ids": ["T3","T4"],
  "key": "doc|all|all|three-things-named-project",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "both",
  "title": "\"Project\" names a stage, a section label, and the ticket subject at once",
  "observation": "\"Project ACTIVE\" (spine), \"THE JOB · PROJECT\" (ticket eyebrow), and the section-progression word \"Project\" (mobile sheet) all reuse the same word for three different roles.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png","m390-mobile-spine-sheet.png"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": null, "suggested_fix": "Give the ticket's own eyebrow a distinct word from the stage-progression label.",
  "hesitation_seconds_estimate": 10 }

{ "id": "P3-11", "lens": null, "persona": "P3", "task_ids": ["T9"],
  "key": "doc|1440|foot|closing-the-book-unexplained",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "\"Closing the book\" is unexplained accounting idiom at the foot",
  "observation": "\"Closing the book · 0 OF 6 CLOSED OUT\" prints with no subtitle explaining what the six items are or what closing means here.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 40,
  "evidence": { "shots": ["w1440-rich-s3.png"] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": null, "suggested_fix": "Add a one-line subtitle the way \"Authorizations & trade scopes\" and \"Pieces\" already get.",
  "hesitation_seconds_estimate": 15 }

{ "id": "P3-12", "lens": null, "persona": "P3", "task_ids": ["T9"],
  "key": "doc|1440|foot|hands-on-the-work-reads-as-typo",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "both",
  "title": "\"Hands on the work: you\" reads as a sentence fragment, not a role label",
  "observation": "\"LEAH HARTWELL / hands on the work: you\" printed with no further context distinguishing it from body prose.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 20,
  "evidence": { "shots": ["w1440-rich-s3.png"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": null, "suggested_fix": "Style it visibly as a label/value pair rather than inline prose.",
  "hesitation_seconds_estimate": 8 }

{ "id": "P3-13", "lens": null, "persona": "P3", "task_ids": ["T1","T3"],
  "key": "doc|1440|top|redletter-vs-guide-inconsistent-footprint",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "The guide and the red-letter zone have different heights, shifting everything below",
  "observation": "RedLetterZone has no outer margin; DocumentGuide adds \"my-5 ... py-4\" — whichever renders changes the y-position of every region below it, unpredictably per document.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 100,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/red-letter-zone.tsx:85-88","apps/designer-portal/src/components/document/document-guide.tsx:75"] },
  "severity": "low", "confidence": 0.5,
  "already_ruled": null, "suggested_fix": "Normalize the two zones to the same vertical footprint so scroll position stays predictable across documents.",
  "hesitation_seconds_estimate": 5 }

{ "id": "P3-14", "lens": null, "persona": "P3", "task_ids": ["T4","T8"],
  "key": "doc|all|mid|thin-seed-masks-real-ffe-scale",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
  "title": "Seed has 3 FF&E lines / 0 rooms — every FF&E finding understates real scroll cost",
  "observation": "\"Pieces / 1 group · 3 lines\" and \"Not in a room yet\" are the seed's real (thin) state, per the ledger's caveat; a real job's 36+ line, 4-room schedule would multiply every scroll distance measured here.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s2.png"], "refs": ["research/01-shot-ledger.md"] },
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null, "suggested_fix": "Re-test T4/T8 findings against a populated schedule before treating today's scroll costs as final.",
  "hesitation_seconds_estimate": 0 }

{ "id": "P3-15", "lens": null, "persona": "P3", "task_ids": ["T5"],
  "key": "doc|all|all|boards-vs-mood-boards-naming",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "both",
  "title": "Ticket says \"Boards\"; task vocabulary and shelf history say \"Mood boards\"",
  "observation": "Ticket row prints \"BOARDS\"; `shelves.ts` comment states \"the row, the leaf, the page and ⌘K all read Boards\" as a deliberate one-name decision, but a junior arriving with school vocabulary (\"mood board\") will not immediately connect the two.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/lib/document/shelves.ts:60-68"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": null, "suggested_fix": "Consider a one-time subtitle (\"Boards · your mood boards\") on first view for new studio members.",
  "hesitation_seconds_estimate": 10 }

{ "id": "P3-16", "lens": null, "persona": "P3", "task_ids": ["T1","T9"],
  "key": "doc|1440|top|margin-cards-print-seed-debug-text",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "Margin cards print raw seed/debug copy (\"Walk seed — ...\")",
  "observation": "Margin cards read \"Walk seed — draft invoice (design fee, phase 2)\" and \"Walk seed — 15 days overdue (receivables chase)\" as their subtitle text.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-margin-rail.png"] },
  "severity": "low", "confidence": 0.4,
  "already_ruled": null, "suggested_fix": "Confirm this is seed-only content and not a template string that could leak to production copy — what would settle this: reading the live subtitle-generation code path.",
  "hesitation_seconds_estimate": 5 }

{ "id": "P3-17", "lens": null, "persona": "P3", "task_ids": ["T2","T15"],
  "key": "doc|390|all|mobile-sheet-more-legible-than-1280-rail",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "both",
  "title": "The 390px mobile sheet is more legible than the 1280px \"compact\" rail",
  "observation": "Mobile spine sheet prints full words (\"Brief / NOT RECORDED\", \"Project / ACTIVE\"...) for all 7 stages; the 1280px rail shows the same information as unlabeled glyphs only.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["m390-mobile-spine-sheet.png","w1280-spine-glyph-rail.png"] },
  "severity": "medium", "confidence": 0.75,
  "already_ruled": null, "suggested_fix": "Let the 1180-1439 rail borrow the mobile sheet's text list, at least on demand.",
  "hesitation_seconds_estimate": 15 }

{ "id": "P3-18", "lens": null, "persona": "P3", "task_ids": ["T16"],
  "key": "doc|1280|all|margin-sheet-covers-paper",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
  "title": "At 1280 the margin opens as a sheet that fully covers the document",
  "observation": "\"IN THE MARGIN\" opens as a fixed overlay with \"CLOSE\" in the header, hiding the entire paper behind it rather than sitting beside it.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 900,
  "evidence": { "shots": ["w1280-margin-sheet-open.png"] },
  "severity": "medium", "confidence": 0.8,
  "already_ruled": null, "suggested_fix": "Consider a partial-width sheet at 1280 that keeps a sliver of the document in view, per D8's slide-over intent.",
  "hesitation_seconds_estimate": 10 }

{ "id": "P3-19", "lens": null, "persona": "P3", "task_ids": ["T3"],
  "key": "doc|1440|top|no-client-linked-competes-with-title",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "\"No client linked — attach one\" sits directly under the title, reads as an error",
  "observation": "Immediately under \"Chen Residence\" in large italic type: \"No client linked — attach one ↗\" in a warm tint, before any task-relevant content appears.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 30,
  "evidence": { "shots": ["w1440-rich-s0.png"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": null, "suggested_fix": "Demote this prompt below the ticket/guide, or fold it into the setup-chip pattern already used elsewhere.",
  "hesitation_seconds_estimate": 8 }

{ "id": "P3-20", "lens": null, "persona": "P3", "task_ids": ["T7"],
  "key": "doc|all|mid|proposal-sendwall-state-unverified",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
  "title": "Proposal send-wall state legibility for a junior is unverified in this shot set",
  "observation": "No captured shot of a proposal-stage document's send-wall state line exists among the 38 verified shots; behavior inferred from anatomy notes only.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["research/01-shot-ledger.md"] },
  "severity": "medium", "confidence": 0.3,
  "already_ruled": null, "suggested_fix": "Capture a proposal-stage document's send-wall state before finalizing this task's difficulty rating. What would settle this: an actual screenshot.",
  "hesitation_seconds_estimate": 0 }

{ "id": "P3-21", "lens": null, "persona": "P3", "task_ids": ["T5","T6"],
  "key": "doc|390|top|plan-room-spec-book-no-mobile-route",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "both",
  "title": "Plan room and Spec book have no route below 1440 at all",
  "observation": "Per the anatomy, Drawings/Spec ticket doors are dead leaves (no `→`, non-pressable) below 1440 — a junior on a phone or a 1280 laptop cannot open either, ever, from the document.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 30,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:267,283"], "shots": ["m390-rich-s0.png"] },
  "severity": "high", "confidence": 0.75,
  "already_ruled": null, "suggested_fix": "Give Drawings and Spec real routes at every width, matching Boards' pattern of resolving to a page below 1440.",
  "hesitation_seconds_estimate": 20 }

{ "id": "P3-22", "lens": null, "persona": "P3", "task_ids": ["T3","T9"],
  "key": "doc|1440|top|tan-box-only-color-signal-on-page",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
  "title": "The tan \"needs attention\" box is nearly the only color-coded signal on first screen",
  "observation": "Against an otherwise cream-and-charcoal page, the terracotta-bordered tan box is the one strong visual break — a junior's eye correctly snaps to it, which is a working signal worth protecting.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-rich-s0.png"] },
  "severity": "low", "confidence": 0.85,
  "already_ruled": "R126", "suggested_fix": "Preserve this as the single loudest element on first screen; do not add competing color.",
  "hesitation_seconds_estimate": 0 }
```

## 4. What stays true

- **"PUT DOWN" at the top of the spine.** The single most obvious, unambiguous control on the
  entire document — a first-week hire needs zero explanation. Any redesign of the spine must keep
  this exact word in this exact position.
- **The tan "NEEDS ATTENTION · IN ONE PLACE" box.** The one place on the first screen where color
  correctly pulls the eye and the copy is plain English ("Invoice ... overdue ... send a reminder").
  Don't dilute it with more color elsewhere on the page.
- **"ADD A ROOM" / "ADD THE FIRST TASK" / "ADD A LINE."** These three imperative, plain-English
  buttons at the foot of empty sections are the easiest asks on the whole paper to complete cold —
  they use the visitor's own verbs.
- **The margin's self-explaining first line** ("The margin on the right is where decisions and
  money gather ... Appears once · recedes on use"). It is the only place on the document that warns
  me something will disappear before it does. More surfaces should do this, not fewer.
- **⌘K / "Find anything" in the permanent bottom bar.** Even without knowing the exact phrase to
  type, the door itself is always visible and named in plain words — keep it in every regime.
- **"MESSAGE THE CLIENT" as plain, unmetaphored copy.** When the paper drops its house vocabulary
  and just says the verb, I never hesitate. A lens redesign should extend this plainness, not trade
  it for more evocative-but-vaguer language.
