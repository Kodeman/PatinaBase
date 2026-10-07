# Local walk — Document screenshots per stage + five task scenarios

Walked 2026-10-07 against local Supabase (`127.0.0.1:54321` / DB `54322`), designer-portal
`dev:designer` from the main checkout (`/Users/kody/Code/patina-merged`), signed in as the seeded
designer account via the dev-accounts panel. Captured headless with Playwright (Chromium) from the
main checkout's `node_modules`. Observation only — no data mutated, nothing submitted.

## 1. Setup

**Flag state.** `the-document-pilot` is retired per `apps/designer-portal/CLAUDE.md` — the R21
dissolve deleted the gate, so `/desk` is the unconditional landing and no override was needed. No
PostHog key is configured locally (flags fail closed for anything still flag-gated), so any
flag-gated affordance not covered here may be invisible in this walk — not reported as absent.

**Sign-in.** `designer@patina.dev` / `password123` via the Dev Accounts panel at `/auth/signin`
(Leah Hartwell, the studio owner). Landed on `/desk`, dismissed the one-time "This is your Desk"
tour modal (Skip for now).

**Projects used per stage** (all found in Leah's own studio — verified `projects.designer_id`
matches the signed-in account before use):

| Stage | Document | engagement_id | Notes |
|---|---|---|---|
| Brief | Lily Tanaka — Full Room | `be858888-9704-4934-9c06-c4e967b0bf9f` | new lead, no response deadline pressure |
| Discovery | The Ashfords (no-login household) | `d0c10000-0000-0000-0000-0000000000a2` | only Discovery-stage row in the seed |
| Direction | Elena Marlowe — Living Room Direction | `d0c10000-0000-0000-0000-0000000000b2` | draft proposal, no-login household |
| Proposal | Aspen Loft — Living Room Refresh | `b0000000-0000-0000-0000-000000000002` | sent, unopened 2 days |
| Project | Chen Residence | `5cbf990e-faa7-4773-9463-b7bd6c8542e0` | overdue 148 days per the Desk; used for scenarios 2 and 3 |
| Install | Cedar Lane Study (Nora Ellison) | `b0000000-0000-0000-0000-00000000c0d1` | used for scenario 4 |
| Care | Lindqvist kitchen | `d0e00000-0000-0000-0000-00000000000b` | only Care-stage row in the seed; `project_status = completed` |

Additionally, for scenario 5 ("a new hire opens someone else's job cold"): **Olsen Lake House**
(`ed7f31c4-333b-4553-9d43-f7e3e17023c1`), an active project neither persona had touched before.

**One gap recorded, not a dead end in the product:** the first candidate picked for scenario 3 —
a "Buying walk P1" fixture project (`8ce84721-0b55-4ec9-a40c-9135dd95f48c`) — resolved to "No
document answers to this name." Checking `projects.designer_id` showed it belongs to a different
seeded designer entirely; it is correctly scoped away from Leah, not a bug. Swapped to Chen
Residence, which carries a real sofa-shaped piece (a "Custom Walnut Sectional — 3 pc") with a
linked, delivered purchase order.

Every stage in BRIEF.md's list (Brief/inquiry → Discovery → Direction → Proposal → Project →
Install → Care) had at least one seeded project; no stage gap to record.

## 2. Per stage

### Brief — Lily Tanaka, Full Room
`brief-1440.jpg` / `brief-1440-full.jpg` / `brief-390.jpg`

- The screen's one instruction is explicit and singular: "New lead — respond by 12 October" with a
  single button, **RESPOND TO THE INQUIRY**. One call to action above the fold.
- The eye lands on the project-type heading ("Full Room") first, then drops straight to the need
  line — the hierarchy reads cleanly at this stage because almost nothing else is populated yet.
- "The record" section is present but empty ("Nothing yet") — visible but doesn't compete for
  attention.
- Nothing is hidden behind hover/scroll/⌘K here; the page is short by design (full-page capture is
  barely taller than the fold).

### Discovery — The Ashfords (no-login household)
`discovery-1440.jpg` / `discovery-1440-full.jpg` / `discovery-390.jpg`

- The screen states two things at once: "Yours to add: scope. Waiting on the Ashfords: budget and 3
  more." — a dual-ownership sentence, then five checklist-style rows (Scope & rooms, Budget
  comfort, Timeline, Style & inspiration, How they live), all "not yet."
  Three link-style actions sit directly under that sentence (ADD PROJECT TYPE AND NAMED ROOMS,
  "+4 more", RUN THE DISCOVERY CALL, ATTACH THE ROOM SCAN, ADD INSPIRATION) — five competing calls
  to action above the fold, none visually weighted over the others.
- The eye lands on the household name, then the "Yours to add / Waiting on" sentence — that
  sentence is the de facto orienting device here, more than any heading.
- Unlike Brief/Project/Proposal, this stage has no MESSAGE/PREVIEW/SHARING/CALL SHEET row — the
  page's own chrome changes shape stage to stage, which a first-time user has no way to predict.
- Nothing additional surfaced via hover/scroll in this short document; ⌘K was not needed to find
  anything on this stage specifically.

### Direction — Elena Marlowe, Living Room Direction
`direction-1440.jpg` / `direction-1440-full.jpg` / `direction-390.jpg`

- The screen says "Draft up the direction" with one filled action, **OPEN THE CONTRACT ROOM**, plus
  a status card ("DRAFTING THE PROPOSAL — Not started yet — open the Contract Room to write it").
  Two calls to action above the fold (OPEN THE CONTRACT ROOM, CONTINUE DRAFTING) that both go to
  the same place — redundant, not competing.
- The eye lands on "$0 proposed" directly under the title, an odd first read for a project that
  hasn't started pricing yet — a $0 figure reads as either "nothing proposed" or "free," and
  nothing distinguishes the two at a glance.
- A leaked engineering note is visible in the body text, unguarded by any staff-only affadvisory
  copy: *"Draft fixture for a no-login household: proposals.designer_client_id links to the
  household so document_state Shape B rescues the client_name."* (see Worst Moments #1 — almost
  certainly a seeded dev note stored in a free-text `notes`/body field, but it demonstrates the
  Document will render whatever is in that field verbatim).

### Proposal — Aspen Loft, Living Room Refresh
`proposal-1440.jpg` / `proposal-1440-full.jpg` / `proposal-390.jpg`

- The screen states status plainly: "Sent Oct 5 · unopened 2d," with **NUDGE CLIENT USER** as the
  one visible act. One call to action above the fold.
- The eye lands on "$18,500 proposed," then the "5 unspecified +1 more" line, which is printed in
  the same terracotta/warning ink used elsewhere for overdue money — on this screen it is neutral
  information (lines still being priced), not a problem. The color doesn't distinguish "needs your
  attention" from "still in progress," which works against V9 ("act weight follows consequence").
- A "WITH THE CLIENT" status strip (Sent / Opened / Reading / Most read) is visible without any
  click — a good example of status surfaced without a modal.
- Scrolling reveals "THE CLIENT'S COPY · AS SENT" with a FULL/MILESTONES/CURATED toggle and a full
  client-facing preview embedded in the document — not visible above the fold.

### Project — Chen Residence
`project-1440.jpg` / `project-1440-full.jpg` / `project-390.jpg`

- The screen's single loudest line is "No client linked — attach one" in italic terracotta,
  directly under the title — for a project the Desk separately reports as "Overdue 148 days." Nothing
  in the document explains whether the overdue balance and the missing client link are related.
- Above the fold: RECORD PAYMENT (+1 more), SET DATES, SET A BUDGET BAND, "attach one" — four
  competing calls to action, none visually dominant.
- The eye lands on "Chen Residence," then drops immediately to the red "No client linked" line —
  that red line out-competes the project title for attention.
- A one-time top banner ("While a document is open, Patina keeps the time for you…") appeared on
  first open of this stage and had to be dismissed (UNDERSTOOD) — not seen on any other stage in
  this walk, so its trigger condition is unclear from the outside.
- The margin rail carries two "VENDOR PAYMENT DUE" cards only visible without scrolling in this
  wide layout; on `project-390.jpg` (phone) the margin rail is off-screen entirely until the user
  finds a separate control for it (see Worst Moments).

### Install — Cedar Lane Study, Nora Ellison
`install-1440.jpg` / `install-1440-full.jpg` / `install-390.jpg`

- The screen's instruction is explicit but double: "Name the phases for this project" next to
  **OPEN THE SCHEDULE**, immediately under an orange "NEEDS SETUP · 1" chip — so the single
  loudest message on an "install week" document is a setup chore, not an install status.
- Above the fold: OPEN THE SCHEDULE, SET TARGET, SET A BUDGET BAND, MESSAGE, PREVIEW, SHARING — six
  competing calls to action, more than any other stage captured.
- The eye lands on "Cedar Lane Study," then the orange "NEEDS SETUP" chip pulls attention before
  "Install" (the section heading) is read at all.
- Scrolling surfaces the actual install content: a Pieces list (Reading chair — in production;
  Built-in shelving — installed), an "INSTALL MANIFEST · 1 of 1 placed," and a "PUNCH" action and
  "HOLD A WINDOW" control that are invisible above the fold.

### Care — Lindqvist kitchen
`care-1440.jpg` / `care-1440-full.jpg` / `care-390.jpg`

- The screen's instruction is clear and singular: "Close the book on this one" next to
  **RUN THE CLOSEOUT CHECKLIST**. One call to action above the fold.
- "No client linked — attach one" appears again here, on a project the database marks
  `project_status = completed` — the same missing-client warning fires on a finished, closed job as
  on an active overdue one, with no visual distinction between "fix this now" and "this no longer
  matters."
- The left rail prints "ONGOING" as this project's status label, while the body text two sections
  down says "Project completed." — the rail and the body disagree on whether the job is still
  live.
- The section heading "Care" appears twice in sequence (once with an "ONGOING" badge and "Project
  completed" under it, once immediately after with its own Spec book link) — reads as a duplicated
  heading rather than two distinct things.

## 3. The five scenarios

Screenshots: `s1-step*.jpg` … `s5-step*.jpg`.

### Scenario 1 — A new inquiry arrives. What do I do first, and how do I know?

1. Looked for: where a brand-new inquiry shows up. Looked first: the Desk, landing page after
   sign-in. Found: **found-immediately** — `s1-step1-desk-landing.jpg` shows "Good morning, Leah…
   Two things are overdue — Chen and Aspen," then a row of folder cards, two of which are new leads
   ("Full Room — Marcus Wright — New lead — respond by 9 October," "Full Room — David Nielsen —
   respond by 11 October"). 0 clicks, 1 screenshot.
2. Opened Lily Tanaka's Full Room brief directly by id (she's a third new lead not in the Desk's
   top-3 roster, visible only via "and 7 more below"). `s1-step2-brief-opened.jpg`. **found-after-
   search** — the Desk's default view truncates to 3 cards plus a "7 more" link; a new lead further
   down the list needs that extra expand, or ⌘K.
3. Opened ⌘K to check whether "brief" leads are findable a second way. `s1-step3-cmdk-open.jpg` —
   **found-immediately** once ⌘K is known to exist: a "WHERE THE WORK STANDS" rollup groups every
   open document by stage, including "In brief · 5." 1 keystroke (⌘K), no clicks.
4. Pressed `?` to see whether there's a reference for what the available actions even are.
   `s1-step4-keys-sheet.jpg` — **found-only-via-key**. "The Keys" sheet is a full reference of every
   keyboard shortcut in the product, but nothing in the visible chrome (the bottom drawer strip)
   tells a first-time user that `?` opens it. No dead end — Esc returns cleanly to the document.

**Persona read — Scenario 1.** *Leah:* she already knows "a new inquiry" means Lily Tanaka's
message is sitting somewhere; the Desk's plain-English line ("Two things are overdue — Chen and
Aspen") reads fast because she already knows who Chen and Aspen are. The 7-more truncation doesn't
bother her — she knows roughly how many leads she has open. *The first hire:* the Desk's prose
reads as a complete picture on first glance ("Good morning… two things are overdue"), which could
mislead someone new into thinking that's the whole worklist; discovering Lily Tanaka requires
already knowing to expand "7 more" or to use ⌘K, neither of which is suggested anywhere on the
page itself.

### Scenario 2 — The client asks for a change after signing. Where do I record it, and what happens next?

Project used: Chen Residence (signed, active, overdue).

1. Looked for: a "record a change" or "change order" action on the open document. Looked first: the
   top of the document, near the money and dates controls. `s2-step1-chen-opened.jpg` —
   **not-found** at the top: the visible controls there are RECORD PAYMENT, SET DATES, SET A BUDGET
   BAND, none of which read as "the client asked for something different."
2. Followed the left-rail "Pieces" link, expecting the change to live against a specific piece
   rather than the document as a whole. `s2-step2-schedule-area.jpg` — this actually landed on the
   Schedule's "Start blank — name your first phase" prompt, immediately above the Pieces section
   header (3 lines, 3 unspecified). **found-after-search**, 1 click, but the click target (the
   left-rail nav item) scrolled past the thing being searched for rather than to it directly — a
   sticky-rail label and its matching main-content heading are not interchangeable click targets.
3. From here the actual mechanism (per the codebase: `line-unfold/change-order.tsx`) lives *inside*
   an individual line's unfold, not at the document or Pieces-section level — confirmed by scenario
   3's line-unfold capture (`s3-step3-line-unfolded.jpg`), which shows no "record a change" control
   at the top of an unfolded line either; a designer would need to already know a change order is a
   per-piece action, buried past the piece's own buy/quote/order tabs, to find it. Recorded as
   **not-found** within the time a first read would spend looking — no dead end reached, but no
   confident path to the destination either.

**Persona read — Scenario 2.** *Leah:* she knows in her head that a change belongs against the
specific piece, not the document, so she'd click Pieces before anything else — the left-rail click
cost her one wrong stop (Schedule) before Pieces, which she'd shrug off. *The first hire:* with no
domain memory of "changes live on the piece," the natural first guess is a document-level or
Schedule-level action; finding nothing there, and finding the Schedule's "Start blank" prompt
instead of a change-order anything, reads as a dead end rather than a detour — they'd likely stop
and message Leah to ask rather than keep hunting inside individual line unfolds.

### Scenario 3 — "Where is the PO for the sofa?" Find it, and find what is blocking it.

Project used: Chen Residence ("Custom Walnut Sectional — 3 pc," delivered, PO linked).

1. Looked for: the sofa by name, via global search. Typed "sectional" into ⌘K.
   `s3-step1-cmdk-no-match.jpg` — **not-found**: ⌘K returns "No match / Try the help center / Ask
   about 'sectional' → Ask & place," even though the exact string "Custom Walnut Sectional — 3 pc"
   is rendered in the Pieces section of the very document that was open when the search ran. ⌘K
   evidently does not index line-item names within an open document. 1 keystroke sequence, dead
   end at this step (recovered only by abandoning search for browsing).
2. Clicked the left-rail "Pieces" link instead. `s3-step2-pieces-rail.jpg` — **found-after-search**:
   the Pieces section lists "Custom Walnut Sectional — 3 pc · Woodward & Sons · RECEIVED · $6,800"
   directly. 1 click.
3. Clicked the line itself to unfold it. `s3-step3-line-unfolded.jpg` — **found-after-search**: the
   unfolded card shows Maker ("Not recorded"), Source ("Woodward & Sons"), and a "The buy / Quote /
   Order" tab strip at the very bottom of the captured frame — the PO itself is one more scroll/tab
   past what's visible here. Running total: 2 clicks, 1 failed search, to get to the point of being
   one tab away from the PO. "What is blocking it" was not reachable in this walk's budget — the
   line already reads "RECEIVED," so for this particular piece there is nothing blocking; a
   genuinely blocked piece would need a second, intentionally-stalled fixture to test the same
   path, which this seed didn't have within Leah's studio.

**Persona read — Scenario 3.** *Leah:* the ⌘K "No match" on "sectional" would read as a genuine
product failure to her, not a user error — she typed the piece's own name verbatim. She'd likely
abandon search and go straight to Pieces from memory, costing her the failed search but not the
destination. *The first hire:* with no memory of what the piece is called or which room it's in,
the ⌘K dead end is more costly — "Ask about 'sectional'" (routing to a help/concierge flow) looks
like the only offered next step, when the actual answer (browse Pieces) isn't suggested by the
search UI at all.

### Scenario 4 — It's install week. What's late, what's arriving, and what do I do about it?

Project used: Cedar Lane Study.

1. Looked for: a late/arriving-today list. Looked first: the top of the document.
   `s4-step1-install-opened.jpg` — **not-found** at the top: the loudest thing there is "NEEDS SETUP
   · 1" and "Name the phases for this project," not a late/arriving list.
2. Clicked "OPEN THE SCHEDULE." `s4-step2-install-section.jpg` — the click scrolled the document
   (rather than opening a distinct schedule surface) to the "Install" section: "0 of 2 installed,"
   a Pieces list (Reading chair — IN PRODUCTION; Built-in shelving — installed), an "INSTALL
   MANIFEST" with PUNCH, and "No window is held — HOLD A WINDOW." **found-after-search**, 1 click —
   but nothing here says "late" or "arriving" in those words; a designer has to infer lateness from
   status words (IN PRODUCTION vs. installed) rather than being told directly. No explicit date-vs-
   today comparison is visible above or just below the fold.
3. "What do I do about it" resolves to PUNCH (mark a punch-list item) or HOLD A WINDOW (reserve an
   install slot) — both **found-after-search**, both one click further than the schedule view
   itself.

**Persona read — Scenario 4.** *Leah:* "NEEDS SETUP" as the loudest line during install week would
mildly annoy her — she knows the phases aren't named yet because she hasn't gotten to it, and she'd
dismiss it and scroll straight to the Pieces/manifest she actually came for. *The first hire:* the
setup chore reads as the actual task — "oh, I guess I need to name the phases first" — and could
send them down a configuration detour before they ever see the late/arriving information they
opened the document for.

### Scenario 5 — A new hire opens someone else's project cold. Can they tell what stage it is in, what's waiting on them, and what to do next?

Project used: Olsen Lake House (neither persona had touched it before).

1. Opened the document directly (as a new hire would, from a link or the Desk roster).
   `s5-step1-olsen-opened.jpg` / `s5-step1-olsen-opened-full.jpg`.
2. **Stage**: not stated in words anywhere above the fold. The only cues are the left-rail's small
   section label "ACTIVE" (a status word, not a stage name) and the tiny multi-segment progress bar
   under the client name — neither names "Project" as the stage the way the Desk's folder-card chip
   ("PROJECT") does. **not-found** for an explicit stage label on the document itself; the Desk
   chip is the only place stage is spelled out.
3. **What's waiting on them**: "AP-012 has an open damage claim — FILE THE CLAIM +2 more" is the
   loudest line, immediately under the "No client linked — attach one" warning. **found-
   immediately** once the document is open — but a cold-open reader has no way to judge whether the
   damage claim or the missing client link is the more urgent of the two; both are printed in the
   same terracotta weight.
4. **What to do next**: FILE THE CLAIM is the nearest actionable verb. **found-immediately.**
   Total: 0 clicks to see the two competing needs, but no stage label and no explicit priority
   between them — a new hire would have to guess which to act on first.

**Persona read — Scenario 5.** *Leah (hypothetically opening a project she hadn't touched, which
for her is rare but does happen):* she'd recognize "Olsen Lake House" and likely already hold the
stage in her head from the Desk roster she scanned on the way in — the missing on-document stage
label costs her little because she front-loaded that context on the Desk. *The first hire, genuinely
cold:* this is the scenario where the missing stage label hurts most — arriving at the document via
a direct link (a ⌘K jump, a shared link, a notification) skips the Desk's folder-card chip
entirely, so the only stage cue available is the small "ACTIVE" word and an unlabeled progress bar,
neither of which say "Project." They'd have to guess, or go back to the Desk to look the project up
by name.

## 4. Worst ten moments

1. **The leaked engineering sentence on the Direction document** (`direction-1440.jpg`): *"Draft
   fixture for a no-login household: proposals.designer_client_id links to the household so
   document_state Shape B rescues the client_name."* A designer reading this would have no idea
   what it means and would reasonably wonder if the document is broken. Almost certainly a seeded
   dev note in a free-text field rendered verbatim — but that is itself the finding: the Document
   has no guard against internal notes surfacing in client-facing copy. S2, high confidence it's
   visible as shown, medium confidence on root cause (seed data vs. a real code path).

2. **⌘K does not find the thing on the page you're looking at** (`s3-step1-cmdk-no-match.jpg`):
   searching "sectional" from inside the very document that lists "Custom Walnut Sectional — 3 pc"
   returns "No match." For scenario 3's literal premise — "where is the PO for the sofa" — the
   fastest tool in the product (⌘K, trained into users via the Keys sheet) actively fails. S1 (blocks
   the task as the obvious first move), high confidence.

3. **"No client linked — attach one" fires identically on an overdue active job and a completed,
   closed one** (`project-1440.jpg`, `care-1440.jpg`): the same red warning, same weight, on Chen
   Residence (overdue 148 days, still live) and Lindqvist kitchen (`project_status = completed`).
   Nothing distinguishes "this blocks live work" from "this no longer matters." Breaks V9 ("act
   weight follows consequence") as written. S2, high confidence.

4. **Care stage disagrees with itself on whether the job is done**: the left rail says "ONGOING"
   while the body says "Project completed." directly beneath it (`care-1440.jpg`). A designer
   closing out a job sees the one surface meant to confirm closure contradict itself. S2, high
   confidence.

5. **The "Care" heading repeats** (`care-1440.jpg`): the section header "Care" with an "ONGOING"
   badge and "Project completed" appears, then an apparently separate "Care" heading with its own
   Spec book link appears immediately after — reads as a duplicated/glitched section rather than
   two distinct pieces of information. S3, medium confidence (could be two deliberately distinct
   sub-bands sharing a label).

6. **Change-order recording has no visible entry point at the document or section level**
   (`s2-step1-chen-opened.jpg`, `s2-step2-schedule-area.jpg`): scenario 2's whole premise — "the
   client asks for a change" — has no button, link, or menu item anywhere above the fold, in the
   Pieces section header, or in the Schedule section header. The mechanism exists in the codebase
   (`line-unfold/change-order.tsx`) but only inside a per-line unfold a designer would have to
   already suspect exists. S1, medium confidence (not fully exhausted — a real designer has more
   time than this walk's budget to keep looking).

7. **Install week's loudest message is a setup chore, not install status**
   (`install-1440.jpg`): "NEEDS SETUP · 1" and "Name the phases for this project" out-rank anything
   about what's late or arriving. A designer opening a project mid-install to check logistics is
   greeted with onboarding friction instead. S2, high confidence.

8. **The identity badge renders the raw account email mid-load before settling on the display
   name**: caught once, on an early load of the Install document, the bottom-right badge briefly
   read "DE designer@patin…" before resolving to "LH Leah Hartwell" on every subsequent render.
   A flash of a raw auth email in production would be a minor but real identity leak. S4, low
   confidence (caught once, not reproduced deliberately — may be a one-off race on cold cache).

9. **Six competing calls to action above the fold on the Install document**
   (`install-1440.jpg`): OPEN THE SCHEDULE, SET TARGET, SET A BUDGET BAND, MESSAGE, PREVIEW,
   SHARING — more simultaneous asks than any other stage captured, with no visual hierarchy between
   the setup chore and the three document-management links. S3, high confidence.

10. **A proposal's unpriced-lines count borrows the same color as overdue-money warnings**
    (`proposal-1440.jpg`): "5 unspecified +1 more" in the same terracotta as Chen Residence's
    overdue balance. On the Proposal document this is normal mid-drafting state, not a problem —
    but the color doesn't say so. S3, medium confidence.

## What was not verified

- Scenario 3's "find what is blocking it" half: the one sofa-shaped piece available in Leah's
  studio seed data was already `RECEIVED`, so a genuinely blocked PO was not exercised end to end.
- Scenario 2's change-order path was not confirmed to exist and work past the per-line unfold — the
  walk's interaction budget (no submits, bounded clicks) stopped short of opening an actual
  `change-order.tsx` surface.
- Mobile (390×844) captures were taken above-the-fold only, per the ticket's spec; no mobile
  scroll-depth or scenario walk was performed.
- Flag-gated surfaces with no local PostHog key were not probed for (see Setup) — none were
  obviously missing in this walk, but absence wasn't confirmed as absence.
