# V2 verify:canon-truth — findings vs. ratified DECISIONS.md

Repo main@695addb5f. Verdicts confirmed against `11-canon-digest.md` (A)(B)(E), `source/instruments.md` §5, and targeted `grep -n`/`sed -n` reads of `docs/design/the-document/DECISIONS.md` (9,431 lines, never read whole).

**Verdict key:** `open` = not ruled, fair game for both Direction A and Direction B. `ruled-against:<id>` = the observed behavior IS the ruling; Direction A may not touch it, Direction B must name the amendment (id + clause + trade + rollback per §5's amendment rule). `known-open:<id>` = already logged as an open item in the ledger itself — neither protected nor a silent bug, cite it as closing the debt. `misread` = the finding misdescribes what the ruling actually says.

**Tally:** known-open=5, open=86, ruled-against=10

---

## F01 — Shelves, rooms block and running index are absent below 1440
**Verdict:** `ruled-against:C8`

**Reason:** Shelved spine (running index/rooms/shelves) is ratified >=1440px only; D12/I136.

**Evidence:** DECISIONS.md:8427ff, :8462-8471

**Revised claim / handling instruction:** Valid gap below 1440. Direction A may not remove the width gate; Direction B must name an amendment to extend below 1440.

## F02 — At 1280 the spine is an unlabelled 56px icon rail
**Verdict:** `ruled-against:C8`

**Reason:** Compact-tier icon rail (<1440) is the ruled width-regime design, not a defect.

**Evidence:** DECISIONS.md:8427ff

**Revised claim / handling instruction:** Below 1440 an unlabelled icon rail is intended by C8; labelling/affordance fixes are fine, removing the icon-rail tier is not.

## F03 — Care-stage FF&E spread is headed `Install`
**Verdict:** `open`

**Reason:** R7 mandates stamps/labels say only true things; a wrong 'Install' header on a care-stage spread violates R7, it is not protected by it.

**Evidence:** DECISIONS.md:273-285 (R7)

**Revised claim / handling instruction:** Confirmed bug: fixing the header to read the true stage fulfills R7 rather than contradicting any ruling.

## F04 — Nothing answers a phase-wide question; ⌘K `install` returns No match
**Verdict:** `known-open:T2/T4`

**Reason:** T4 (no fleet/phase-wide view) and T2 (install-as-label) are logged open in the canon digest, untouched by any R-entry.

**Evidence:** canon digest sec.B; grep for 'fleet|roster tier|install.*mode' returns no R-entry hits

**Revised claim / handling instruction:** Fair game for both lanes; no amendment needed, cite as closing a known-open item.

## F05 — FF&E lines print under `Unsorted`, never under a room heading
**Verdict:** `open`

**Reason:** No canon entry addresses FF&E room-grouping/'Unsorted' bucket behavior.

**Evidence:** grep 'Unsorted' DECISIONS.md - no governing rule found

**Revised claim / handling instruction:** Open gap, fair game.

## F06 — Orders ledger shows no PO acknowledgment state
**Verdict:** `open`

**Reason:** No PO-acknowledgment-state ruling found in DECISIONS.md.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open gap.

## F07 — The mobile bar's one big act is a truncated `MESSAGE THE CLI…`
**Verdict:** `open`

**Reason:** C7 mandates exactly one leader per region (satisfied); it says nothing about label truncation.

**Evidence:** DECISIONS.md:8386-8393 (I135)

**Revised claim / handling instruction:** Truncation fix does not touch the one-leader rule; open, not blocked.

## F08 — Three-to-four competing doors answer one money question
**Verdict:** `open`

**Reason:** C7's one-leader-per-region rule is what the finding shows a VIOLATION of (3-4 competing doors); fixing it fulfills C7.

**Evidence:** DECISIONS.md:8386-8393

**Revised claim / handling instruction:** Open; consolidating to one leader is compliant with, not contrary to, canon.

## F09 — The money region is named `Design authority` and carries no money scent
**Verdict:** `open`

**Reason:** No canon entry on 'Design authority' naming or money-scent requirement.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F10 — The seven g-chords work but are printed nowhere on screen
**Verdict:** `open`

**Reason:** No canon entry requires g-chords/shortcuts to be printed on screen.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F11 — Ledger sheet focus-restore silently no-ops from the Studio books menu
**Verdict:** `open`

**Reason:** No canon entry on ledger-sheet focus-restore behavior.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F12 — The `Knowledge` shelf is a redirect that names itself three ways
**Verdict:** `known-open:I136`

**Reason:** Knowledge shelf naming is explicitly left as an unresolved design question by I136 itself.

**Evidence:** DECISIONS.md:8494-8499: 'Open for a design ruling: whether Knowledge should name a surface that does not exist yet, or be renamed to what /library actually holds.'

**Revised claim / handling instruction:** Not a bug to silently fix nor a protected ruling - it is logged as awaiting Kody's ruling; either lane may propose the rename as closing this item.

## F13 — ⌘K Recent lists two rows both titled `Aspen`
**Verdict:** `open`

**Reason:** No canon entry on Recent-list dedup in the kmd palette.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a data/key bug.

## F14 — Index, rooms and shelves vanish on install and care documents
**Verdict:** `open`

**Reason:** C8 ratifies the >=1440 width gate for shelves/rooms/index; it says nothing about a section-type (install/care) gate.

**Evidence:** DECISIONS.md:8427ff - no install/care-specific gating language found via grep

**Revised claim / handling instruction:** Real gap: shelves vanishing on install/care documents is not mandated by C8, which only concerns viewport width. Open for both lanes.

## F15 — The mobile spine sheet lists sections and nothing else
**Verdict:** `ruled-against:C8/D3`

**Reason:** The built mobile spine sheet is deliberately sections + margin summary only ('the seven sections on top, In the margin - N beneath'); rooms/shelves/index are >=1440-gated by C8 and never reach mobile.

**Evidence:** DECISIONS.md:774-784 (I21, D3-3 spine sheet)

**Revised claim / handling instruction:** If the observed screen is missing even the margin summary, that is a build regression (open); the absence of rooms/shelves/index specifically is ruled and Direction A may not add them below 1440 without naming C8.

## F16 — `Who still owes me` is unanswerable inside the document
**Verdict:** `known-open:I141`

**Reason:** 'Money doesn't seam on install/care' is logged as an explicit product debt, scoped out of I141, awaiting its own future ruling.

**Evidence:** DECISIONS.md:9416-9418 (I143 tail) + I141 body

**Revised claim / handling instruction:** Adjacent, not identical: F16's 'who still owes me' claim may reach beyond install/care into the general document; treat the install/care slice as known-open, the rest as open.

## F17 — Three different things are called a `room`
**Verdict:** `open`

**Reason:** C20 governs the surface-name registry (one name/icon per SURFACE, e.g. Orders, Plan room) consumed by the UI chrome; it does not extend to generic domain nouns like 'room' used differently in FF&E rooms vs. scanned rooms vs. schedule context.

**Evidence:** DECISIONS.md:2961 (I54/C20)

**Revised claim / handling instruction:** Open; C20 is adjacent but does not literally rule generic-noun consistency.

## F18 — Five of seven stage default acts are `Review {X}`, a shrug
**Verdict:** `open`

**Reason:** No canon entry on default stage-act copy ('Review {X}').

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F19 — A sent, unopened proposal is invisible on the Desk
**Verdict:** `ruled-against:C13`

**Reason:** I137 SP3 locates the one send-wall state line at ProposalInstruments, inside the document, explicitly to be the single place 'so neither wall can be silent' - the Desk is not named as a second home.

**Evidence:** DECISIONS.md:8657-8663 (I137 SP3)

**Revised claim / handling instruction:** Valid finding; Direction B may still add a Desk-level indicator but must name it as an amendment to SP3's single-home design, quoting the clause.

## F20 — Nothing on the paper names a PO, receiving or a claim
**Verdict:** `open`

**Reason:** No canon entry on naming a PO/receiving/claim on the paper.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F21 — ⌘K never restores focus to its trigger on close
**Verdict:** `open`

**Reason:** No canon entry on kmd focus-restore.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F22 — Flag-off, an absent call sheet looks like an empty crew
**Verdict:** `open`

**Reason:** No canon entry on call-sheet-absent-vs-empty-crew distinction.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F23 — `NEEDS YOUR HAND 8` prints over four folios
**Verdict:** `open`

**Reason:** No canon entry on 'NEEDS YOUR HAND' pagination.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F24 — The two Desk begin verbs carry no distinguishing sub-label
**Verdict:** `open`

**Reason:** No canon entry on Desk begin-verb sub-labels.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F25 — A held room has no visible release control once scrolled away
**Verdict:** `open`

**Reason:** I136's lens doctrine only defines release-on-width (<1440 auto-releases); it says nothing about visibility of a release control once scrolled away at >=1440.

**Evidence:** DECISIONS.md:8462-8471

**Revised claim / handling instruction:** Open; C8 does not cover this specific scroll-persistence gap.

## F26 — The money explainer is a dense paragraph that names its own old UI
**Verdict:** `open`

**Reason:** No canon entry on the money-explainer paragraph's content/register.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F27 — The install spread shows no FF&E lines at all
**Verdict:** `open`

**Reason:** No canon entry says the install spread should omit FF&E lines; adjacent to but distinct from the ruled money-doesn't-seam gap (I141).

**Evidence:** DECISIONS.md:9416-9418

**Revised claim / handling instruction:** Open - a different surface than money.

## F28 — At 390 the `ADD TO PROJECT` plate covers the FF&E heading
**Verdict:** `open`

**Reason:** No canon entry on 390px ADD TO PROJECT layout collision.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely CSS bug.

## F29 — The roster cannot be reached from the Desk at all
**Verdict:** `open`

**Reason:** R95 rules the Contents Page's FORMAT (labels + doorway glyphs + icons, never counts/tiles/metrics); it does not enumerate which surfaces must or must not appear, so roster's absence from the Desk is not itself mandated.

**Evidence:** DECISIONS.md:2951 (R95); roster appears elsewhere as a top-level Studio room (:3773)

**Revised claim / handling instruction:** Open; adding a roster doorway to the Desk's Contents page would not contradict R95's no-metrics format rule.

## F30 — The Mood boards shelf opens onto another fold, with no way to start one
**Verdict:** `open`

**Reason:** No canon entry on Mood boards shelf 'start one' affordance.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F31 — The downstream damage of a date move is prose, not a preview
**Verdict:** `open`

**Reason:** No canon entry mandates prose-only date-move previews.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F32 — The Worktable moves no item-reach cell and leaves install week untouched
**Verdict:** `known-open:I138/I139`

**Reason:** I138 (Worktable Wave 2) explicitly ships 'composition machinery only... no tools'; item-reach/room tools are I139's Wave-3 scope. The Worktable not yet moving an item-reach cell reflects incremental build sequencing, not a permanent design limit.

**Evidence:** DECISIONS.md:8738-8746 (I138), I139 summary

**Revised claim / handling instruction:** Known-open as a build-sequencing gap; C14 (Worktable is the destination) still requires either building toward full item-reach coverage or explaining the gap.

## F33 — ⌘K's placeholder and fallback both invite `ask the Engine`
**Verdict:** `open`

**Reason:** No canon entry on kmd placeholder/fallback copy inviting 'ask the Engine'.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F34 — The FF&E head leads with `ADD TO PROJECT` and shows three acts at once
**Verdict:** `open`

**Reason:** C7 mandates exactly one leader; a head showing three acts at once is a violation the direction may fix without amendment. I141's demotion rule covers only the specific release-lift case, not the general complaint.

**Evidence:** DECISIONS.md:8386-8393; I141 (:9035-9112)

**Revised claim / handling instruction:** Open outside the narrow release-lift exception, which stays ruled.

## F35 — Two regions on one paper are both called `Schedule`
**Verdict:** `open`

**Reason:** C11 rules that the running INDEX is derived from mount order; it does not address on-screen region LABELS colliding (ScheduleRule vs ScheduleSpine both user-facing 'Schedule'). The fold-key was deliberately renamed (schedule-rule vs schedule) precisely to avoid a STATE collision, but the display lab

**Evidence:** DECISIONS.md:8500-8516 (I136)

**Revised claim / handling instruction:** Open; naming the two regions differently on screen does not contradict C11.

## F36 — The proposal guide says `Review signing controls` instead of the live act
**Verdict:** `open`

**Reason:** C13 governs the send-wall state line at ProposalInstruments only; it does not govern the stage-guide organ's act copy elsewhere on the paper.

**Evidence:** DECISIONS.md:8657-8663

**Revised claim / handling instruction:** Open, likely stale/mismatched copy, not a protected ruling.

## F37 — ⌘K opens on Recent and Begin; the doorways are below the fold
**Verdict:** `open`

**Reason:** No canon entry on kmd default-open sections or fold order.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F38 — Desk Contents names doors without saying what is behind them
**Verdict:** `open`

**Reason:** R95 forbids counts/tiles/metrics on the Contents Page; a static descriptive sub-label is explicitly none of those, so it is not forbidden - but also not required, leaving the finding's gap real.

**Evidence:** DECISIONS.md:2951 (R95)

**Revised claim / handling instruction:** Open, as the collator's own parenthetical concludes.

## F39 — Studio pulse is folded by default and names nothing
**Verdict:** `open`

**Reason:** No canon entry on Studio pulse default-fold naming.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F40 — A folded region and an empty one read the same
**Verdict:** `open`

**Reason:** No canon entry distinguishing folded-vs-empty region rendering.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F41 — Setup chores and dated overdue needs wear the same red-letter clothes
**Verdict:** `open`

**Reason:** D8 forbids badges/pulsing counts; it says nothing about reusing the same red-letter hue for two different urgency classes (setup chores vs. dated overdue needs).

**Evidence:** DECISIONS.md:19 (D8)

**Revised claim / handling instruction:** Open, D8 does not reach hue semantics.

## F42 — Seven section names and `The Patina Six` both print on one paper
**Verdict:** `known-open:I114`

**Reason:** The seven section names vs. 'The Patina Six' is exactly the unresolved section<->stage mapping gap repeatedly flagged as still owed by Kody (I114), referenced in I137/I138/I143.

**Evidence:** DECISIONS.md tail (I143), I137 (:8676-8680), I138 (:8846-8848)

**Revised claim / handling instruction:** Both lanes may propose an I114 mapping as a candidate ruling, but the first slice must not depend on it per sec.6.

## F43 — The guide's act names a different verb than the row beneath it
**Verdict:** `open`

**Reason:** No canon entry on guide-vs-row verb mismatch.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely stale copy.

## F44 — Brief chips print raw template text (`15k_50k`, `3 6 Months`)
**Verdict:** `open`

**Reason:** No canon entry on raw template-text chips (e.g. '15k_50k').

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a formatting bug.

## F45 — Opening a shelf re-wraps the paper she was reading
**Verdict:** `open`

**Reason:** I136/C1 exempt shelves from D1's split-view ban (non-modal, paper stays live behind); this governs MODALITY, not whether opening a shelf causes the underlying paper to re-flow/lose reading position.

**Evidence:** DECISIONS.md:8480-8483 (I136 leaf mechanics)

**Revised claim / handling instruction:** Open; the exemption does not address the re-wrap side effect.

## F46 — The Orders sheet prints `PUT BACK · ESC` twice
**Verdict:** `open`

**Reason:** No canon entry on duplicate 'PUT BACK - ESC' captions.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a render bug.

## F47 — `The Post` shows `3 NEW` on mobile and an unlabelled dot on desktop
**Verdict:** `open`

**Reason:** D8/R96 explicitly forbid badges and pulsing counts on the persistent Drawer; a '3 NEW' badge and pulsing dot both appear to violate this outright.

**Evidence:** DECISIONS.md:19 (D8), :2955-2959 (R96)

**Revised claim / handling instruction:** Confirmed bug, not a protected ruling: removing the badge/count fulfills D8 rather than contradicting it.

## F48 — Spec book has no door on install or care
**Verdict:** `open`

**Reason:** No canon entry gates the spec-book shelf off install/care documents by section type; same gap class as F14 (C8 only covers the >=1440 width gate).

**Evidence:** DECISIONS.md:8427ff

**Revised claim / handling instruction:** Open for both lanes.

## F49 — No visible way to open ⌘K anywhere on a phone
**Verdict:** `open`

**Reason:** C8 governs the >=1440 gate for rooms/shelves/running index specifically; it does not address whether kmd (the search palette) has any mobile entry point at all - a distinct, unaddressed surface.

**Evidence:** DECISIONS.md:8427ff

**Revised claim / handling instruction:** Open; adding a mobile kmd trigger does not contradict C8's shelved-spine scope.

## F50 — The plan room disappears from ⌘K the moment she types `plan`
**Verdict:** `open`

**Reason:** No canon entry on kmd search-term filtering excluding 'plan'.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a search/alias bug.

## F51 — The Drafting Room's only Desk doorway is ⌘K
**Verdict:** `open`

**Reason:** No canon entry mandates the Drafting Room's Desk doorway be kmd-only.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F52 — `MESSAGE THE CLIENT` leads the letterhead on a doc with no client
**Verdict:** `open`

**Reason:** R7 mandates stamps/letterhead say only true things; 'MESSAGE THE CLIENT' on a document with no client attached violates R7, it does not implement it.

**Evidence:** DECISIONS.md:273-285

**Revised claim / handling instruction:** Confirmed bug: hiding/relabeling the act on a clientless doc fulfills R7.

## F53 — Answering a client question happens off the document
**Verdict:** `open`

**Reason:** No canon entry rules that answering a client question must happen off-document; adjacent to but distinct from the logged 'flagged line on a sent proposal is unanswerable' gap (I140-errata), which is specific to proposal flags, not general client Q&A/messaging.

**Evidence:** DECISIONS.md:9412-9414 (I140-errata debt)

**Revised claim / handling instruction:** Open; note the possible overlap with the logged proposal-flag debt for T16 framing, but do not conflate the two.

## F54 — The rooms rail exists on direction and disappears on the project
**Verdict:** `ruled-against:C14`

**Reason:** The Worktable's typed tables (Intake/Speccing/Finalize/Delivery) are derived purely from active_section and each carries a stage-specific tool set; I139 places the rooms-rail specifically as a Speccing-table tool. A rooms rail on Direction (Speccing) but not on the Delivery/project table matches the

**Evidence:** DECISIONS.md:8738-8746 (I138), I139 summary

**Revised claim / handling instruction:** Direction A may not simply copy the rooms-rail onto every table; Direction B must name the amendment if it wants a persistent rooms rail across tables.

## F55 — No bypass-blocks control anywhere in the layout
**Verdict:** `open`

**Reason:** No canon entry on a keyboard bypass-blocks control.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely an a11y gap.

## F56 — Terracotta and clay ink fail 1.4.3 contrast everywhere they appear
**Verdict:** `open`

**Reason:** No canon entry on terracotta/clay ink contrast ratios; 1.4.3 is a WCAG criterion, not a design-ledger ruling.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, a11y bug fair game for both lanes.

## F57 — The FF&E line she must edit is not editable on the paper
**Verdict:** `open`

**Reason:** C1/D14 rule the Room-vs-Sheet WEIGHT (which drawer objects are full-screen Rooms vs. overlay Sheets); they do not address the round-trip editing cost of an FF&E line that requires leaving the paper.

**Evidence:** DECISIONS.md:985-996 (D14)

**Revised claim / handling instruction:** Open, per the collator's own qualifier.

## F58 — The same FF&E line reads `RECEIVED` on paper and `DELIVERED` in the spec book
**Verdict:** `open`

**Reason:** No canon entry reconciles 'RECEIVED' (paper) vs 'DELIVERED' (spec book) status vocabulary.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a lexicon/data bug - also relevant to R7 truth-device but as a fix target, not a protection.

## F59 — `Committed` means $0 in one region and $14,420 in another
**Verdict:** `open`

**Reason:** No canon entry on 'Committed' meaning different dollar figures in different regions.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a real data/derivation bug.

## F60 — The room lens has no substitute below 1440
**Verdict:** `ruled-against:C8`

**Reason:** The room lens is explicitly part of the shelved-spine architecture, gated the same >=1440 the rest of C8 governs ('The hold releases if the window drops below 1440px, where nothing on screen could put it down').

**Evidence:** DECISIONS.md:8462-8471

**Revised claim / handling instruction:** Direction A may not add a lens substitute below 1440 without naming an amendment to C8; Direction B may propose one only if it names and prices it.

## F61 — The index says `NO AUTHORITY YET` over $14,420 in motion
**Verdict:** `open`

**Reason:** No canon entry on the index literally printing 'NO AUTHORITY YET' over live dollar amounts.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a stale-read/derivation bug (adjacent to the I141-errata 'never flash $0 before real figure loads' fix, but that fix was for money, not index copy).

## F62 — Boards have three doors with three different names
**Verdict:** `ruled-against:C9`

**Reason:** I139/Q1 ratifies boards existing as BOTH the shelf (everywhere) and the on-paper strip (speccing only) - the multiplicity of doors is the ruled design, not a defect; only the inconsistent NAMING across those doors is unaddressed.

**Evidence:** DECISIONS.md:8881-8892 (I139), delivery-plan.md:6 (Q1)

**Revised claim / handling instruction:** Direction may rename the doors to be consistent without amendment; removing the sanctioned duality itself needs a named amendment to C9.

## F63 — Three `add a room` verbs mean three different things
**Verdict:** `ruled-against:C12`

**Reason:** I137 SP4 specifically rules where the FF&E-list 'add a room' verb lives (in-flow scored-ink line at the foot of the room list, never promoted); other 'add a room' verbs elsewhere in the product are a separate, unruled concept from that one.

**Evidence:** DECISIONS.md:8628 (I137 SP4)

**Revised claim / handling instruction:** Direction may still clarify wording across the three verbs; the FF&E one's placement is protected without a named amendment.

## F64 — Two acts open the same Drafting Room, worded differently
**Verdict:** `open`

**Reason:** No canon entry mandates identical wording for the two entries that open the Drafting Room; I140-errata only says the entries themselves are kept open, not that they must share copy.

**Evidence:** DECISIONS.md:9026-9033 (I140-errata carve-outs)

**Revised claim / handling instruction:** Open.

## F65 — Nothing on the Desk says what changed while she was gone
**Verdict:** `open`

**Reason:** No canon entry on a 'what changed while she was gone' Desk organ.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F66 — The Drafting Room uses a different visual language from the paper
**Verdict:** `open`

**Reason:** C2/C6 (no shadows, scored ink) govern the document surface explicitly; whether the Drafting Room (a separate route) is bound by the same visual grammar is not stated either way.

**Evidence:** no direct DECISIONS.md text found binding /drafting to C2/C6

**Revised claim / handling instruction:** Open, per the collator's own qualifier.

## F67 — Orders is a global cross-project ledger, not a project-scoped view
**Verdict:** `open`

**Reason:** C4 rules the Drawer's persistence and ledger-sheet presentation; it does not rule whether the Orders ledger is project-scoped or global.

**Evidence:** DECISIONS.md:19 (D8)

**Revised claim / handling instruction:** Open.

## F68 — `CLOSE THE BOOK` looks equally clickable while blockers are listed above
**Verdict:** `open`

**Reason:** No canon entry on 'CLOSE THE BOOK' visual weight vs. listed blockers.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F69 — `BEGIN THE DIRECTION` is offered live with 0 of 5 essentials captured
**Verdict:** `open`

**Reason:** No canon entry gates 'BEGIN THE DIRECTION' behind essentials-captured count.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F70 — Three equal Worktable add-actions get three different visual weights
**Verdict:** `open`

**Reason:** I135's one-leader rule is explicitly scoped to REGION HEADS (index 0 of a region); the collator's own note confirms it does not govern a same-row trio of equal-weight add-actions.

**Evidence:** DECISIONS.md:8386-8393

**Revised claim / handling instruction:** Open, confirmed by the qualifier already in the finding's own annotation.

## F71 — Intake's `opens when…` seams point at the wrong stages
**Verdict:** `open`

**Reason:** No canon entry on Intake's 'opens when...' seam copy accuracy.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a stale-copy bug.

## F72 — The Rooms block disappears at zero rooms with no placeholder
**Verdict:** `open`

**Reason:** No canon entry on the Rooms block's zero-state (no placeholder).

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F73 — One boxed control breaks the flat scored-ink grammar
**Verdict:** `open`

**Reason:** C6 (scored ink) forbids boxes/borders/fills on DocumentAction; a boxed control on screen is a VIOLATION of C6, not something C6 protects - fixing it (removing the box) fulfills the rule.

**Evidence:** DECISIONS.md:6584 (I107)

**Revised claim / handling instruction:** Confirmed bug, open.

## F74 — The drawer is hidden below 1180; Orders costs 2+ taps at 390
**Verdict:** `open`

**Reason:** No canon entry on the drawer's visibility breakpoint (1180) or Orders' tap-depth at 390.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F75 — The guide's need-reason reads as a system log, not her voice
**Verdict:** `open`

**Reason:** No canon entry on the guide's need-reason voice/register.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F76 — The money row `Moved` is not decodable from the word alone
**Verdict:** `open`

**Reason:** No canon entry defines the money row 'Moved' label.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F77 — The Care-stage document shows no guide headline at all
**Verdict:** `open`

**Reason:** No canon entry mandates a guide headline on Care-stage documents.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F78 — The compact-tier margin is a closed, unlabelled `MARGIN ←` tab
**Verdict:** `open`

**Reason:** D8 forbids badges/pulsing counts generally, but the collator's own qualifier notes a plain numeral on a CLOSED trigger tab was never itself the subject of a ruling - D8's examples are about the persistent Drawer bar, not a margin-rail collapse tab.

**Evidence:** DECISIONS.md:19 (D8)

**Revised claim / handling instruction:** Open per the qualifier; a cautious reading of D8's spirit still argues for removing the count, but no clause is being contradicted by leaving it either way.

## F79 — Unsent POs carry the same visual weight as routine status
**Verdict:** `open`

**Reason:** No canon entry on visual weight for unsent POs vs. routine status.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F80 — The full spec-book workbench shows no order or PO status
**Verdict:** `open`

**Reason:** No canon entry requires order/PO status inside the spec-book workbench.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F81 — `No client linked` silently blocks the money and approvals chain
**Verdict:** `open`

**Reason:** No canon entry addresses a clientless document's effect on money/approvals.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely adjacent to but distinct from the ruled money-doesn't-seam-on-install/care gap.

## F82 — Every project artifact is behind opening the document first
**Verdict:** `open`

**Reason:** D1 forbids split views/tabs/peek-hold WITHIN an open document; it says nothing about a Desk-level door that opens a document directly at a given artifact (a normal navigation, not a split view).

**Evidence:** DECISIONS.md:12 (D1)

**Revised claim / handling instruction:** Open, per the collator's own qualifier - D1 does not forbid the fix.

## F83 — `The Post` and `Message {Family}` name the same idea differently
**Verdict:** `open`

**Reason:** No canon entry reconciles 'The Post' vs 'Message {Family}' naming.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a C20-adjacent lexicon gap, but no specific rule cited.

## F84 — The Worktable's on-paper boards strip exists only at the Speccing table
**Verdict:** `ruled-against:C9`

**Reason:** The on-paper boards strip existing only at the Speccing table is precisely Q1's ratified reversal - 'the speccing stage only... the shelf remains boards' home everywhere else.'

**Evidence:** DECISIONS.md:8881-8892 (I139), Q1 (delivery-plan.md:6)

**Revised claim / handling instruction:** This is the documented, intended design; Direction A may not extend the strip to other tables without a named amendment to C9/Q1.

## F85 — The Capture Inbox introduces a new bordered card pattern
**Verdict:** `open`

**Reason:** No canon entry forbids a new bordered-card pattern in the Capture Inbox specifically; C2/C6 (no shadows, scored ink, flat stacked edges) are document-surface rules whose reach into a Worktable tool like the Capture Inbox is not explicit.

**Evidence:** DECISIONS.md:15 (C2), :6584 (C6)

**Revised claim / handling instruction:** Open; likely a genuine visual-language drift worth flagging, but not clearly contradicting a named rule for this specific surface.

## F86 — The Desk header cramps and wraps at 390
**Verdict:** `open`

**Reason:** No canon entry on Desk header layout at 390px.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a CSS bug.

## F87 — Region status text truncates mid-word at 390
**Verdict:** `open`

**Reason:** No canon entry on region status text truncation at 390px.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a CSS bug.

## F88 — The Record has no footprint before the first completion
**Verdict:** `open`

**Reason:** No canon entry on The Record's footprint before first completion.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F89 — An unexplained circular badge overlaps page content
**Verdict:** `open`

**Reason:** No canon entry explains an unlabeled circular badge overlapping content; if literally a badge/count, D8 would forbid it outright.

**Evidence:** DECISIONS.md:19 (D8)

**Revised claim / handling instruction:** Open, and if confirmed as a count/badge this is itself a D8 violation to fix, not a protected behavior.

## F90 — Canon's `The Record` never prints on screen
**Verdict:** `open`

**Reason:** I137/C10 mandates The Record mounts at the foot of the paper; if it never prints at all, that is a FAILED implementation of C10, not a protected absence - fixing it (making it appear) fulfills the ruling.

**Evidence:** DECISIONS.md:8608 (I137)

**Revised claim / handling instruction:** Open - a build gap against a ruling that requires the feature to exist, not evidence the ruling forbids it.

## F91 — `Next up` appears only when guidance is broken
**Verdict:** `open`

**Reason:** No canon entry on 'Next up' visibility conditions.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F92 — `Add to project` and `Open a project` share a word, not a meaning
**Verdict:** `open`

**Reason:** No canon entry reconciles 'Add to project' vs 'Open a project' wording.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a C20-adjacent lexicon gap.

## F93 — The colophon's `Team…` is the one vague act among plain verbs
**Verdict:** `open`

**Reason:** No canon entry on the colophon's 'Team...' act specificity.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F94 — Canon's `Contents Page` prints on screen as `THE STUDIO`
**Verdict:** `ruled-against:R95/C15`

**Reason:** R95 itself names the Desk's standing front matter 'The Studio' verbatim ('The Desk gains standing front matter, \"The Studio\": a typographic contents of rooms, ledgers, and begin-verbs'). The on-screen label THE STUDIO is the ruled name; 'Contents Page' is the ledger's own descriptive shorthand for

**Evidence:** DECISIONS.md:2951 (R95)

**Revised claim / handling instruction:** Not a naming bug - the on-screen label matches canon. If a direction still wants to rename it, that is an amendment to R95, priced and named.

## F95 — The spine's mark count changes between documents
**Verdict:** `open`

**Reason:** No canon entry fixes the spine's mark count as constant across documents.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, may be intended variability (different documents have different numbers of phase markers) rather than a bug - needs product judgment, not a canon citation.

## F96 — The money region is folded by default
**Verdict:** `open`

**Reason:** No canon entry on the money region's default fold state.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F97 — The margin rail has no functional closed state at ≥1440
**Verdict:** `open`

**Reason:** No canon entry requires a functional closed state for the margin rail at >=1440.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F98 — The Receiving tab was never opened — project scoping unverified
**Verdict:** `open`

**Reason:** No canon entry on the Receiving tab's project-scoping.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open - unverified finding, not a canon question.

## F99 — Free-text description prints in the same register as studio copy
**Verdict:** `open`

**Reason:** No canon entry on free-text description typographic register.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open.

## F100 — The two leaf routes name the project differently on the way back
**Verdict:** `open`

**Reason:** No canon entry requires consistent project naming across the two leaf routes' back-navigation.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open, likely a copy/derivation bug.

## F101 — Whether a ledger sheet preserves her place from a document is unverified
**Verdict:** `open`

**Reason:** No canon entry on ledger-sheet scroll-position preservation.

**Evidence:** no matching entry

**Revised claim / handling instruction:** Open - unverified finding, not a canon question.
