# Shared brief — The standing head of every spread (panel of 2026-09-10)

You are one lens on a five-seat panel of UI/UX experts working with Patina's designers. The ask from Kody (founder),
verbatim, sent with a screenshot of a Discovery-stage Document:

> "This section in each phase is confusing. It should call into clarity what the project is, where it stands and
> where to go next. Have a team of UX experts work on refining this area of the document and propose three possible
> improvements in an html presentation."

Your memo feeds a synthesis; a separate agent will then build an HTML deck presenting three directions, each rendered
live at three phases (Discovery · Direction · Project), desktop and 390. Be concrete and opinionated. **Report every
finding with a confidence (high/med/low); do not self-filter for severity.** Fable filters at synthesis.

Read code from this worktree only: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-phase-header` (origin/main
at 6f00099b3). The main checkout is 154 commits stale and lacks block 7 below.

## The screenshot Kody sent (described; you cannot see it)

Designer portal, `/doc/{id}`, a client named Edna Courtney in Discovery, 2000px wide, warm paper ground, generous
left margin. Top to bottom, before any real content:

| # | What it prints (verbatim) | Register | Source |
|---|---|---|---|
| 1 | A small glyph of three stacked progress bars, then **Edna Courtney** (Playfair ~64px), then `Edna Courtney · In discovery` (Inter 14, grey), then a hairline rule | letterhead | `src/components/document/doc-letterhead.tsx`; vitals from `vitalsFor()` at `src/app/(document)/doc/[id]/page.tsx:351` (`[client_name, 'In discovery']`) |
| 2 | `Finish what you need to know` (Inter ~20, ink) · `ADD PROJECT TYPE AND NAMED ROOMS` (DM Mono uppercase, double-scored) · `+2 MORE` (mono, clay) — then a heavy rule | the sticky LensBand, line 2 | `src/components/document/lens-band.tsx:259-322`; copy `src/lib/document/document-guide.ts:139`; input list `src/lib/document/document-guide-inputs.ts:22-28`; the door opens `standing-sheet.tsx` |
| 3 | `DISCOVERY & PROGRAMMING · CORE · STAGE 02` (DM Mono uppercase, clay-ink) | stage sub-label | `src/lib/document/section-stage-line.ts:113-135` (`subLabelFor`), R111 |
| 4 | a long brown bar ≈ 40% of the width, then `CORE · 02` (mono) | track band | `src/components/document/workflow/section-stage-line.tsx:80-110` |
| 5 | a thick rule, `IN PROGRESS` (mono eyebrow), **Discovery** (Playfair ~34), `Nothing yet` (Inter 14) | region head | `src/components/document/prework/prework-region.tsx:70-92`; eyebrow reported up from `discovery-section.tsx` (`ready ? 'Ready' : 'In progress'`); status `page.tsx` `preworkStatus()` falling back to the literal `'Nothing yet'` |
| 6 | a beige band: the stacked-bars glyph again · `WORKING WITH EDNA COURTNEY` (mono) · **3** `of 5 essentials captured — keep going` (Inter ~20) · right: `BEGIN THE DIRECTION` (mono, scored) | readiness band | `src/components/document/discovery/discovery-section.tsx:~408-480`; `src/lib/document/discovery-readiness.ts` |
| 7 | `RUN THE DISCOVERY CALL` · `ATTACH THE ROOM SCAN` · `ADD INSPIRATION` (mono acts) then `MOVE BACK TO NEW LEAD` · `This client's own details have been filled in.` | tool row + the studio-asks undo | `discovery-section.tsx:476-580` (`DocumentActionGroup`, `return-to-lead`) |
| 8 | `THE ESSENTIALS — STRUCTURED · THEY OPEN & SEED THE AGREEMENT` (mono eyebrow with a leader rule) then a checklist row **Scope & rooms** … `not yet ▸` | first content region | `discovery-section.tsx:~588+` |

Count them: the page states *where this project stands* in blocks 1, 2, 3, 4, 5 and 6 — six times, in three
vocabularies, before the first thing Edna actually said appears. Kody's complaint is exactly that. "Nothing yet" in
block 5 sits directly above "3 of 5 essentials captured" in block 6 — two sentences that contradict each other.

## Which of these mount on EVERY phase (this is why the ask says "in each phase")

- Blocks 1, 2, 3/4 and 5 mount once for all seven stops (`page.tsx` mounts at ~2616 letterhead, ~2667 LensBand,
  ~2775 SectionStageLineMount, ~2816 PreworkRegion). Only their copy changes with the stop.
- Blocks 6–8 are Discovery's own; every stop has an analogue (Direction: the Contract Room band; Proposal: the
  signing state; Project: `ScheduleSpine`/`ReleaseLift`; Install/Care: their bands).
- The seven stops (`SectionKey`, `src/lib/document/desk-derivation.ts:38-46`): `brief · discovery · direction ·
  proposal · project · install · care`.
- Per-stop letterhead vitals (`vitalsFor`, page.tsx ~330-352): lead → `{client} · New inquiry`; discovery →
  `{client} · In discovery`; proposal → `$X proposed`; project → `{active phase name} · {target} · $X`.
- Per-stop rail sub-labels (`src/lib/document/section-derivation.ts:87-135`): `Respond by {day}` / `In discovery` /
  `Drafting` / `Awaiting signature` / `Active · {position}` / `{phase}` / `Ongoing`; settled: `Settled · {day}`,
  `Signed · {day}`.
- Per-stop guide copy (`src/lib/document/document-guide.ts:128-181` `stageCopy`, and `:202-210` `restCopy`):
  - brief — eyebrow "Brief · decide the fit" · headline "Decide on this inquiry" · act "Accept and begin"
  - discovery — "Discovery · shape the brief" · "Finish what you need to know" · act "Add scope & rooms"; rest: "Discovery is complete. Shape the direction." / "Begin the direction"
  - direction — "Direction · compose the offer" · "Draw up the direction" · "Open the Contract Room"; rest: "The direction is written. Send it." / "Send the agreement"
  - proposal — "Proposal · in the client's hands" · "Wait for the client's signature" (proposalGuide supplies the real dated sentence, e.g. "Opened 3× — last 5 Sep, no signature yet"); rest: "Signed. Open the project."
  - project — "Project · active work" · "The work is in motion — nothing is waiting on you" · "Open the FF&E schedule"; rest: "Everything ordered is moving." / "Release the next room"
  - install — "Install · finish in the field" · "Complete the installation" / dated "Install day is Thursday, Sep 18." · "Hold the window"
  - care — "Care · close the loop" · "Close the book on this one" / "Everything is settled." · "Close the book"
  The LensBand prints only the headline, the top input as the act, and `+N MORE`; the eyebrow and reason are not on the glass.

## The three vocabularies colliding in the head

1. **The seven stops** (above) — the Document's own grammar; the stage plates on the Desk and the rail use these.
2. **The eleven-stage × three-track ResidentialWorkflow** (`packages/types/src/residential-workflow.ts:86-99,
   129-255`): 01 Inquiry & Qualification · 02 Discovery & Programming · 03 Scope & Engagement · 04 Kickoff & Existing
   Conditions · 05 Concept / Schematic · 06 Design Development · 07 Documentation / Authorization · 08 Bidding,
   Permitting & Procurement · 09 Contract Administration · 10 Delivery, Installation & Styling · 11 Closeout &
   Post-Occupancy. Tracks: Core · FF&E · Construction. The bridge from stops to stages is a four-entry static map
   (`src/lib/document/workflow-stage-derivation.ts:92-100` `SECTION_STAGE`): brief→01, discovery→02, direction→05,
   proposal→03 (note: direction maps to 05 while proposal maps to 03 — the order inverts). Project/install/care take
   their stage from the schedule resolver instead. R111 rules the sub-label shape `stage · position · fidelity`;
   R113 rules an unanchored spine renders as a band, never an error string. I114 withdrew the eleven-row rail from
   the glass and relocated the stage into the section head — which is block 3/4.
3. **The guide's sentence register** — a headline + one act, derived from the nearest open gate (I118: the guide
   names, it never activates).

There is also a legacy six-phase `PhaseSlug` (consultation · concept_development · …) in `packages/types/src/phase-config.ts`
that feeds `current_phase` text on project engagements. Do not design for it; know it exists.

## What Patina is (docs/vision/VISION.md — wins over every other doc)

- Customer = a growing design studio (Leah's studio first) at the moment it adds its first hands while workload
  doubles. Homeowners are the studio's clients; makers are the studio's vendors.
- The Document is surface #1. Promise to the studio: "you won't notice Patina." "One living document per engagement.
  No dashboards, no task manager, no tab bars. Truth-framing over taste-framing." "We will never optimize the studio
  surface for engagement."
- "Designer-Taught Intelligence" — never the word "AI".

## The design contract (context that explains the current feel — never a veto)

- V9 doctrine (`docs/vision/VISION-DECISIONS.md:144-213`): P2 money, dates and names carry the largest true type
  (15px floor; running heads and captions 11–12px metadata; one date style "11 September 2026"). P3 every act shows
  its weight and its consequence — one consequence sentence above every terminal act. P5 one scale, one rhythm;
  **a region with nothing to say renders nothing.** Non-licenses (the only true no-gos): no badges, no status dots,
  no pills, no ✓ glyphs, no dashboards, no tab bars anywhere in The Document, no red/green, no shadows.
- R126/R140 register (`docs/design/the-document/DECISIONS.md:9981+, 10777+`): 40px Playfair letterhead, five-step
  type scale, three rule weights (hairline `#E8E3DB` · strong `rgba(44,41,38,.14)` · the 2px region rule), six/seven
  stage plates (brief `#497093` · discovery `#307063` · direction `#366A3A` · proposal `#575D1D` · project `#6D4E24`
  · install/care `#823832`, white label), the ink-pool press wash. Paper `#FAF7F2`, paper-doc `#FCFAF6`, rail
  `#E8E3DB`; ink `#2C2926`, muted `#4E4339`, subtle `#5A4E43`, faint `#65594E`; oak `#8B7355`; clay `#C4A57B` /
  clay-ink `#7C5E30`; terracotta-ink `#9C5340`; sage `#A8B5A0`/`#5F6B57`. Playfair Display (display 34/26/20, 500;
  italic 400 for authorship) · Inter (16/14) · DM Mono (meta 12 .08em; heads 11 uppercase .08em; acts 13 uppercase).
  24px module; radii 2/3px only. Wrap, never truncate. Tabular numerals.
- Action tiers by consequence: tertiary = single oak-scored word; secondary = two-score (ink + clay); terminal =
  filled charcoal only where money moves or a paper is signed. 44px hit target. Focus ring 2px clay-ink.
- R127 The Smart Lens: the old fourteen-control header was deleted; one declared 56px sticky band (`lens-band.tsx`)
  carries identity/stage on line 1 and the worst standing thing with its act on line 2; "nothing between the band and
  the first head." (Block 2 is that band. Blocks 3/4/5 are, arguably, the "something between" that crept back.)
- R66 The Discovery section: five essentials (Scope & rooms · Budget comfort · Timeline · Style & inspiration · How
  they live) + deepening; "successful discovery" = essentials filled → ready for Direction, a *soft* gate, no ceremony;
  on readiness the essentials auto-seed Direction field→field.
- R124/R125 The Wayfinding Review: SP-18 renamed `Continue Discovery` → "Finish what you need to know"; the
  section↔stage mapping was **left unruled** — it is fair game.
- Governance stance (carried from the portal-polish brief): rules are context that explains the current feel; they
  are never a veto. Propose anything except the V9 non-licenses. When you cross a ruling, add a one-line
  `touches: R111, R127` note so Kody can rule with eyes open.

## The data that can feed the head (all of it exists today)

From `document_state`: engagement_kind, title, client_name, current_phase, active_section, is_paused, is_archived,
proposal_status/sent_at/viewed_at/open_count/last_opened_at, lead_response_deadline, lead_status,
overdue_decision_count, earliest_overdue_due, awaiting_inspection_count, blocked_item_count, in_flight_count,
installed_count, item_count, open_claim_count, unsent_pulse_count, draft_unsent_po_count, unacked_po_count,
due_task_count, earliest_task_due, due_task_title, updated_at.
From derivations: `deriveDocumentGuide` (state, eyebrow, headline, reason, action, topInput{label, owner, blocks,
focusId}, remainingInputCount); `deriveSectionStageLine` (stageTitle, stageNumber, track, positionText e.g. "week 3
of 9", fidelity e.g. "estimated"/"committed", provenance); `deriveDiscoveryReadiness` (done per essential,
essentialsDone 0..5, ready); the ladder's `countLine` per stop ("3 rooms · dated · 2 styles"); schedule
(activePhaseName, target, positionText); money (total_amount_cents, overdue amount + oldest due); lineage dates
(createdAt, sentAt, signedAt); people (household members, decision-makers, studio hands). Owners: client · designer · maker.
NOT available: a project photo, a one-line project description written by the designer (there is a title only),
next install date on pre-work stops.

## Realistic fixture (use these, not lorem)

Studio: Leah Hartwell, Local Dev Studio, Des Moines. Sixteen live jobs; it is Tuesday 10 September 2026.
- **Edna Courtney** — discovery — whole-house refresh, 1927 foursquare, Beaverdale; 3 of 5 essentials (scope, timeline,
  style captured; budget and lifestyle not); discovery call ran 6 Sep; no room scan yet; the client filled her own
  intake form 4 Sep (so "Move back to New Lead" is offered). Next: budget comfort (client's), how they live (client's).
- **Cedar Lane Study** (Nora Ellison) — direction — Drafting; 2 of 3 rooms scoped; fee schedule not yet chosen; act
  "Open the Contract Room"; the direction opened from discovery on 2 Sep.
- **Halvorsen townhouse** — proposal — sent 2 Sep, opened 3×, last 7 Sep, no signature; $48,200 proposed.
- **Sonnenberg residence** — project — Design Development, Core · stage 06, week 3 of 9, estimated; 6 of 11 pieces in
  production, 1 blocked; $17,500 overdue since 12 Aug; target 14 November; $212,000.
- **Vandersteen** — install — install day Thursday 18 September; 2 arrivals awaiting inspection.
- **Osterberg residence** — care — quiet, nothing needs Leah's hand; installed 22 August.
- **Marcus Wright** — brief — new inquiry, respond by 12 September.

## The question every seat answers

In one glance at the top of any spread: **what is this project, where does it stand, and what is next — and which of
today's eight blocks earns its place?** Design the head for a designer with sixteen jobs who opens this page for
forty seconds between two site visits.

## Deliverable format for your memo

Markdown, 700–1200 words, headed with your lens. Sections:
1. **Findings on today's head** — each with confidence; name the block numbers above.
2. **What every head must carry** — the register in order (what / where / next), the exact copy grammar per stop
   (write the actual sentences for Edna, Cedar Lane, Sonnenberg), which type step each line takes, and what is
   *removed* (a Was → Is → why cut list).
3. **Your one direction** — a layout sketch (ASCII boxes or precise prose) at Discovery, Direction and Project,
   desktop and 390; how the sticky band, the stage line and the region head relate (merge / demote / door / delete);
   what happens on hover, focus, press; what the quiet case prints (P5).
4. **Honors / departs** — which rulings it keeps and which it crosses, with `touches:` notes and why the crossing is
   worth it.
5. **One risk you would want Kody to rule on.**

Write to the file path you were given AND return a ≤300-word index of your memo (findings count, your direction's
thesis in one sentence, your ruling) in your final message.
