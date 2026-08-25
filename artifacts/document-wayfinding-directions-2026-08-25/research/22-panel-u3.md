# U3 — Visual hierarchy & layout across tiers

Lens: U3 (UX/UI, Sonnet). Surfaces: `/desk`, `/doc/[id]` (all 7 sections), shelves, margin,
Studio Drawer, ⌘K, the Worktable (flag `worktable`). Tiers: ≥1440 / 1180–1439 (compact) / <1180
(mobile, shot at 390). Verified against `main@695addb5f`. Heuristics used throughout: Gestalt
proximity/common region, type scale & rhythm, F-pattern, density vs legibility, graceful
degradation.

Screenshots opened directly (not summarized secondhand): `w1440-desk`, `w1280-desk`,
`m390-desk`; `w1440/w1280/m390-doc-project-rich`; `w1440-doc-brief`, `w1440-doc-direction`,
`w1440-doc-proposal-sent`, `w1440-doc-install`, `w1440-doc-care`; `w1440/w1280-spine-detail`,
`w1440-shelves-block`, `w1440-running-index-midscroll`, `w1440-red-letter-zone`,
`w1440-money-region`, `w1440-record-foot`, `w1440-cmdk-open`, `w1440-drawer-strip`,
`w1440-drafting-route`; `m390-mobile-spine-sheet`, `m390-mobile-margin-chips`; and the
Worktable's `wt-intake-1440`, `wt-speccing-1440`, `wt-finalize-1440`,
`wt-delivery-project-1440`. Cross-read against `research/10-code-anatomy.md` (§2 component
tree, §5 width regime, §6 label inventory) and `probe/01-interactive-probe.md` (fold
persistence, scroll-spy, room-lens release-on-resize).

---

## Overall (≤120 words)

At ≥1440 the three-column grammar works: spine, paper, margin separate cleanly with no
shadows, using rule-weight and value contrast instead. Below 1440 the surface doesn't shrink,
it amputates — the entire shelved spine (running index, rooms, shelves) disappears rather than
reflowing, the margin becomes a closed recall-only tab, and the compact rail is unlabeled
icons. Two real layout defects compound this: at 390 a scored-ink leader button visually
overlaps and obscures the FF&E region's own heading, and a Care-stage document's FF&E spread
is headed "Install" — a heading that lies about which section you're in, at any width, flag
either way.

---

## Task table (T1–T16)

| # | What-to-do | How-to-get-there | Note |
|---|---|---|---|
| T1 | 4 | 4 | Desk folio cards land in the first viewport at ≥1440/1280; at 390 the 3-line greeting wraps and pushes the first "Needs your hand" card mostly below the fold — chrome-before-work at mobile. |
| T2 | 2 | 2 | No surface answers a phase-wide question at any tier (out of layout's control; U1 territory) — but where it fails, it fails identically at all three tiers, which is at least consistent. |
| T3 | 4 | 4 | Guide/red-letter renders at the top of the paper at all three tiers (confirmed `m390-doc-project-rich`). Docked below 1 point for the Install-labeled Care spread (U3-08) undermining trust in headings generally. |
| T4 | 3 | 2 | Works cleanly ≥1440 (room lens lifts the line). Room lens is a ≥1440-only mechanism (spine `Rooms` block; probe #7 confirms auto-release below 1440) — below 1440 she's back to scrolling the FF&E list unaided, so "≤2 acts" fails below 1440. |
| T5 | 3 | 2 | Shelf leaves (Mood boards) exist only ≥1440. Below that, only ⌘K-by-name — recall, not recognition, and the visual doorway itself vanishes rather than degrading. |
| T6 | 3 | 2 | Same shape as T5 — Plan room/Spec book only visible ≥1440; ⌘K still routes there below 1440 (not gated by width), but there is no on-screen affordance prompting her to try it. |
| T7 | 4 | 4 | Send-wall state line is legible and compact at 1440 (`w1440-doc-proposal-sent`); nothing layout-specific breaks it below 1440 in the shots reviewed. |
| T8 | 3 | 3 | "Add a room" line is findable at the foot of the FF&E list at ≥1440. At 390 the region's own heading is unreadable (U3-02) before she even gets there, costing confidence before the act. |
| T9 | 4 | 3 | Money region is dense but orderly at ≥1440; the one boxed "Sync from the schedule" control (U3-09) is a visual outlier that could read as a different kind of control (a form field, not an act). |
| T10 | 3 | 3 | Schedule ripple/timeline renders cleanly at ≥1440 (`w1440-doc-install`); not separately width-tested at 390 in this pass — flag `medium` confidence carried through from other regions' behavior. |
| T11 | 4 | 4 | Esc chain is correct LIFO at ≥1440 (probe #2); Put-down is a full word at ≥1440, an arrow-only glyph at 1180–1439 (anatomy §5) — slightly less certain but still one clear control. |
| T12 | 4 | 4 | ⌘K "Begin" group is legible and grouped correctly (`w1440-cmdk-open`); no layout defect found. |
| T13 | 3 | 2 | Orders ledger reachable via Drawer at ≥1180 (1 act via g-chord); at 390 the Drawer itself is hidden entirely (anatomy §5) and she must go through the mobile bar's "More" menu (2+ taps). |
| T14 | 3 | 3 | Not directly re-shot this pass; inherits T13's mobile-reachability cost for Orders/Receiving. |
| T15 | 3 | 3 | Call sheet doorway sits on the shelves list (≥1440 only) or the letterhead instrument row (present at all tiers per anatomy) — the letterhead instrument is the width-safe path; the shelf row is not. |
| T16 | 4 | 4 | The Post bell is in the persistent Drawer at ≥1180 and in the mobile bar's "More" menu at 390 — reachable everywhere, no layout defect observed. |

Ratings are this lens's read of *what to do* / *how to get there* obviousness (1–5), not a
full walkthrough — see findings below for the evidence behind each score.

---

## Findings

**U3-01 — Desk header cramps and wraps at 390**
- task_ids: T1
- key: `desk|390|off|header-wrap-cramped`
- surface: `/desk` · width: 390 · flag: off
- observation: "Good afternoon," breaks after the comma and "Leah" drops to its own line (3
  lines total for the greeting), directly above/beside "+ CAPTURE A LEAD" / "+ OPEN A PROJECT"
  / "FIND ANYTHING ⌘K" which stack immediately below with very little breathing room —
  confirmed in `m390-desk.png`.
- why_it_blocks: obvious-what-to-do (the first viewport reads as three stacked chrome
  elements before any project content appears)
- evidence: shots: `m390-desk.png`; refs: `apps/designer-portal/src/app/(document)/desk/page.tsx:182-191` (greeting), `:197-234` (header acts)
- severity: low · confidence: 0.75
- already_ruled: —
- suggested_fix: Shorten the mobile greeting to one line ("Good afternoon" without the name,
  or drop the comma-break) and give the header acts a clear top margin from it.
- hesitation_seconds_estimate: 3

**U3-02 — "Project · FF&E" heading is unreadable under its own leader button at 390**
- task_ids: T4, T8
- key: `doc-project-rich|390|off|ffe-heading-button-overlap`
- surface: `/doc/[id]` (project, FF&E region) · width: 390 · flag: off
- observation: The "Project · FF&E" region heading wraps to three lines ("Pro" / "." /
  "FF&E") and the scored-ink "ADD TO PROJECT" leader button — rendered as a solid dark
  pill — sits directly on top of the middle line, physically covering "ject" so only "Pro"
  and a stray "·" remain visible above the button. Confirmed by direct pixel crop of
  `m390-doc-project-rich.png` (y≈3280–3600 of the 780×6272 PNG): heading reads "Pro[BUTTON
  obscuring rest]" / "." / "FF&E" on the line below.
- why_it_blocks: obvious-what-to-do (a designer following T8 or T4 cannot read which region
  she has scrolled to at the moment she needs to confirm it, and the leader control itself
  looks pasted over broken text rather than a deliberate button)
- evidence: shots: `m390-doc-project-rich.png`; refs: `apps/designer-portal/src/components/document/ffe-section.tsx:1116-1125` (leader placement), `:1108-1109` (heading text)
- severity: blocker · confidence: 0.9
- already_ruled: —
- suggested_fix: At <1180 stack the region heading above the leader action instead of
  right-aligning them on the same line — the same pattern other regions already use when
  their head ledger doesn't fit (e.g. Money's status wraps below its heading).
- hesitation_seconds_estimate: 20

**U3-03 — Compact tier (1180–1439) spine is a 56px unlabeled icon rail**
- task_ids: T3, T5, T6, T7
- key: `doc|1280|off|compact-spine-unlabeled`
- surface: `/doc/[id]` · width: 1280 · flag: off
- observation: At 1280 the left column shrinks from the 200px labelled spine to a bare 56px
  strip of horizontal glyph marks with no visible text — confirmed in `w1280-spine-detail.png`
  and `w1280-doc-project-rich.png`, where the same seven section marks that carry
  "Project ACTIVE" / "IN THIS DOCUMENT" / etc. labels at 1440 render as unlabeled bars only.
- why_it_blocks: obvious-how-to-get-there (she must hover or guess which mark is which
  section; recognition is replaced by trial)
- evidence: shots: `w1280-spine-detail.png`, `w1280-doc-project-rich.png`; refs: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1047` (grid), `doc-spine.tsx:43,63` (compact regime)
- severity: high · confidence: 0.85
- already_ruled: C8 (shelved spine ≥1440 only) — this finding is the *cost* of that ruling on
  the compact tier specifically, not a re-proposal of the rule itself.
- suggested_fix: Keep at least the active section's own label visible at 1180–1439 (a
  single line under the icon rail), even if the other six marks stay icon-only.
- hesitation_seconds_estimate: 8

**U3-04 — Compact-tier margin is a closed, unlabeled "MARGIN ←" tab**
- task_ids: T7, T9, T16
- key: `doc|1280|off|compact-margin-closed-tab`
- surface: `/doc/[id]` (margin) · width: 1280 · flag: off
- observation: At 1180–1439 the right column that shows live margin items (decisions,
  vendor payments, notes) at ≥1440 collapses to a single fixed tab reading "MARGIN ←" with no
  count, no preview of what's inside — confirmed `w1280-doc-project-rich.png` top-right.
- why_it_blocks: obvious-how-to-get-there (she has no way to know from the tab alone whether
  the margin holds an urgent vendor payment or nothing at all — the tab carries zero scent)
- evidence: shots: `w1280-doc-project-rich.png`; refs: `apps/designer-portal/src/components/document/margin-rail.tsx:228-234` (trigger), `:264-283` (sheet)
- severity: medium · confidence: 0.85
- already_ruled: D8 forbids badges/counts generally, but a plain count on this one closed
  trigger (distinct from a notification badge) wasn't itself ruled on — flagging as
  open, not an amendment.
- suggested_fix: Print an item count on the closed tab itself ("MARGIN · 3 ←"), consistent
  with how the mobile spine sheet already prints "In the margin · 3."
- hesitation_seconds_estimate: 10

**U3-05 — Shelved spine vanishes entirely below 1440, doesn't reflow**
- task_ids: T5, T6
- key: `doc|1280,390|off|shelved-spine-full-removal`
- surface: `/doc/[id]` (spine) · width: 1280, 390 · flag: off
- observation: The running index ("In this document"), the Rooms block, and the shelves list
  (Plan room / Spec book / Mood boards / Call sheet / Knowledge) are all present at 1440
  (`w1440-shelves-block.png`) and completely absent — not condensed, not iconified, simply
  not in the DOM — at 1280 and 390 (`w1280-doc-project-rich.png`, `m390-doc-project-rich.png`
  show no trace of any of the three blocks).
- why_it_blocks: obvious-how-to-get-there (the only surviving path to a shelf below 1440 is
  ⌘K by name — pure recall, no visual doorway at all)
- evidence: shots: `w1440-shelves-block.png`, `w1280-doc-project-rich.png`; refs: `apps/designer-portal/src/components/document/doc-spine.tsx:135` (hidden below 1440), `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:553-562` (force-close)
- severity: high · confidence: 0.9
- already_ruled: C8 — restating the cost precisely rather than re-proposing the rule: this is
  a full removal, not a narrowing, and the brief asks for exactly this enumeration.
- suggested_fix: n/a for Lane A (doctrine-locked); for Lane B, a labelled icon-only doorway
  row at 1180–1439 (five glyphs, no text) would restore recognition without restoring the
  full 320px leaf.
- hesitation_seconds_estimate: 15

**U3-06 — Rooms block disappears with zero rooms instead of an empty placeholder**
- task_ids: T4
- key: `doc-project-rich|1440|off|rooms-block-silent-when-empty`
- surface: `/doc/[id]` (spine, Rooms block) · width: 1440 · flag: off
- observation: On Chen Residence (0 `project_rooms` rows) the spine jumps directly from "IN
  THIS DOCUMENT" (ending at "Design authority") to "THE SHELVES" with no "Rooms" heading or
  row in between — confirmed in both `w1440-spine-detail.png` and `w1440-shelves-block.png`.
  By contrast every shelf in the same block prints its own placeholder row even when empty
  ("Plan room · Nothing filed," "Mood boards · No boards yet").
- why_it_blocks: obvious-how-to-get-there (a designer scanning the spine has no cue that
  "Rooms" is a concept on this surface at all when the current project happens to have none
  yet — she can't discover the feature exists until a room is added some other way)
- evidence: shots: `w1440-spine-detail.png`; refs: `apps/designer-portal/src/lib/document/shelves.ts:36-75` (shelf placeholders always render), `spine-rooms-block.tsx:79` (rooms empty copy "Take a room in hand · nothing hides" — not observed rendering in this fixture)
- severity: medium · confidence: 0.55 — what would settle this: confirming in source whether
  `SpineRoomsBlock` truly returns `null` at zero rooms vs. the shot simply not scrolling far
  enough (both spine shots reviewed show contiguous content with no gap, suggesting a real
  return-null, but this wasn't independently re-verified via a live DOM query in this pass).
- already_ruled: —
- suggested_fix: Give Rooms the same "nothing hides" placeholder row the shelves already use,
  even at zero rooms, for visual-pattern consistency across the same block.
- hesitation_seconds_estimate: 6

**U3-07 — Left rail is nearly empty at Install/Care stages, at any width**
- task_ids: T5, T6
- key: `doc-install|1440|off|shelved-spine-gone-off-project-section`
- surface: `/doc/[id]` (spine) · width: 1440 · flag: off
- observation: On the Aspen Loft Refresh (Install) and Birch Hollow (Care) documents, the
  200px spine column at ≥1440 shows only the phase marks, an "IN HAND" timer box, and nothing
  else — no running index, no Rooms, no shelves — confirmed `w1440-doc-install.png` and
  `w1440-doc-care.png`, contrasted directly against `w1440-doc-project-rich.png`'s full
  spine for the same document type at a different section.
- why_it_blocks: obvious-how-to-get-there (T6 — "where's the spec book" — has literally no
  visual answer during Install or Care, the exact stages where a designer is most likely to
  need the plan set or the spec book on-site, and this happens *even at the widest tier*,
  which the width-regime table doesn't capture since it's gated on `active_section`, not
  viewport)
- evidence: shots: `w1440-doc-install.png`, `w1440-doc-care.png`; refs: `research/10-code-anatomy.md §2` row `1a` ("only on a project doc whose active_section === 'project'"), `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (shelvedSpine derivation)
- severity: high · confidence: 0.85
- already_ruled: —
- suggested_fix: Mount the shelves list (at minimum) on Install/Care sections too — a
  designer standing in a finished room still needs the plan room and spec book; running
  index and Rooms can stay project-scoped if that's intentional, but shelves shouldn't
  disappear with the section.
- hesitation_seconds_estimate: 25

**U3-08 — Care-stage FF&E spread is headed "Install"**
- task_ids: T3
- key: `doc-care|1440|both|install-heading-on-care-document`
- surface: `/doc/[id]` (Care section, FF&E spread) · width: 1440 · flag: both
- observation: On Birch Hollow (Care, book closed Aug 25), directly under the paragraph that
  correctly reads "Plan the **care** work," the region above it is headed, verbatim,
  **"Install"** — confirmed in `w1440-doc-care.png`, where "Care · Ongoing" then "Install"
  then "Plan the care work" print in that literal order on the same page.
- why_it_blocks: obvious-what-to-do (a heading that names the wrong section undermines trust
  in every other heading on the page — she has to double-check where she actually is)
- evidence: shots: `w1440-doc-care.png`; refs: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1436-1445` (`mode="install"` for the care section), `apps/designer-portal/src/components/document/ffe-section.tsx:~1037` (heading keyed off `mode`, never `sectionKey`)
- severity: high · confidence: 0.9 (independently confirmed by E1's dynamic-probe finding 1)
- already_ruled: —
- suggested_fix: Key the FF&E region heading off `sectionKey` the same way the body copy at
  `work-block.tsx:181` already correctly does ("Plan the {sectionLabel} work").
- hesitation_seconds_estimate: 10

**U3-09 — One boxed/bordered control breaks the flat scored-ink grammar**
- task_ids: T9
- key: `money-region|1440|off|boxed-sync-button-outlier`
- surface: `/doc/[id]` (Money region, Working budget) · width: 1440 · flag: off
- observation: "Sync from the schedule" renders inside a visible rounded-corner bordered box
  — the only bordered/boxed button on the whole page — while every other act on the same
  region (Draw an invoice, Amendment, Hours · this project, Draft a trade scope) is a bare
  underlined DM-mono word per the scored-ink language. Confirmed in `w1440-money-region.png`.
- why_it_blocks: obvious-what-to-do (an act that looks structurally different from every
  other act on the page reads as a different *kind* of control — a form field or a disabled
  state — rather than an equally-available action)
- evidence: shots: `w1440-money-region.png`; refs: `apps/designer-portal/src/components/document/commercial/money-region.tsx` (Working budget block)
- severity: medium · confidence: 0.65
- already_ruled: C6 (scored ink, no boxes/borders/fills for DocumentAction) — flagging as a
  likely implementation gap against the existing rule, not proposing an amendment.
- suggested_fix: Restyle "Sync from the schedule" as a scored-ink word like its siblings, or
  confirm in source it's intentionally a different (non-DocumentAction) control and document
  why money's working-budget sync gets an exception.
- hesitation_seconds_estimate: 5

**U3-10 — Drafting Room uses a different visual language from the paper it belongs to**
- task_ids: T3
- key: `drafting-route|1440|off|boxed-card-language-mismatch`
- surface: `/drafting/[proposalId]` · width: 1440 · flag: off
- observation: The Drafting Room's Scope/Vision/Offer facets ("Rooms," "FF&E," "Palette,"
  "Boards," "Phases," "Exclusions," "Payments," "Terms") each render inside a bordered,
  rounded-corner card with a checkbox and a chevron, and "+ Add Room" / "ESTIMATE · ROM
  ESTIMATE" render as filled/outlined pill buttons — confirmed `w1440-drafting-route.png`.
  None of this matches the flat, underlined, borderless scored-ink language used everywhere
  on `/doc/[id]` itself, including the very same Direction document one click away
  (`w1440-doc-direction.png`).
- why_it_blocks: obvious-how-to-get-there (opening the Drafting Room reads as leaving the
  product into a different app, which raises the stakes of the click and slows the decision
  to open it in the first place)
- evidence: shots: `w1440-drafting-route.png`, `w1440-doc-direction.png`; refs: `apps/designer-portal/src/app/(document)/drafting/[proposalId]/page.tsx:11` ("Unflagged — it rides the (document) layout")
- severity: medium · confidence: 0.6
- already_ruled: C2/C6 govern DocumentAction and shadows on the document surface; whether
  the Drafting Room is bound by the same grammar isn't explicit in the canon guard — noted
  as an open question, not an amendment claim.
- suggested_fix: Either bring the Drafting Room's facet rows and buttons into the scored-ink
  language, or explicitly rule that the Drafting Room is a distinct "workshop" register (and
  say so in the lexicon) so the shift reads as intentional rather than accidental.
- hesitation_seconds_estimate: 8

**U3-11 — Three equal-weight Worktable actions render with three different visual weights**
- task_ids: T8
- key: `wt-speccing|1440|on|unequal-weight-parallel-actions`
- surface: `/doc/[id]` (Speccing table, scheme) · width: 1440 · flag: on
- observation: "+ Add Item" renders as a solid tan-filled box, "+ Add Allowance" as a
  white-bordered box, and "+ Add TBD" as plain unstyled text — three conceptually parallel
  ways to start a scheme line, given three different levels of visual emphasis. Confirmed
  `wt-speccing-1440.png`.
- why_it_blocks: obvious-what-to-do (the visual weight tells her "Add Item" is the important
  one and "Add TBD" is an afterthought, when the copy right above them — "The scheme starts
  loose — a first line is enough" — implies they're equally valid starting points)
- evidence: shots: `wt-speccing-1440.png`; refs: `apps/designer-portal/src/components/document/worktable/` (Speccing table scheme composer)
- severity: medium · confidence: 0.6
- already_ruled: I135's one-leader-per-region rule governs region heads, not necessarily a
  same-row action trio inside a sub-component — flagged as new ground, not a re-proposal.
- suggested_fix: Give all three the same visual weight (either all three scored-ink words, or
  all three the same box treatment) unless one is genuinely meant to be the default.
- hesitation_seconds_estimate: 4

**U3-12 — ⌘K "Recent" shows two rows both titled "Aspen"**
- task_ids: T1, T11
- key: `cmdk|1440|off|duplicate-recent-titles`
- surface: ⌘K · width: 1440 · flag: off
- observation: The "RECENT" group lists two rows with the identical primary label "Aspen" —
  one subtitled "ASPEN LOFT REFRESH," the other "ASPEN LOFT — LIVING ROOM REFRESH" — confirmed
  `w1440-cmdk-open.png`. The subtitle is the only differentiator, in small DM-mono caps below
  the bold title.
- why_it_blocks: obvious-how-to-get-there (T11 — "put this down, pick up the Byrnes" — depends
  on scanning ⌘K's Recent list correctly under time pressure; two rows reading "Aspen" at a
  glance risks opening the wrong document, e.g., the sent proposal instead of the active
  install project, or vice versa)
- evidence: shots: `w1440-cmdk-open.png`; refs: `apps/designer-portal/src/components/document/command-bar.tsx:503` (Recent group), `:507`
- severity: medium · confidence: 0.7
- already_ruled: —
- suggested_fix: Print the row's section/stage (Install vs. Proposal) as a same-weight prefix
  to the title, not only as a smaller subtitle underneath — e.g. "Aspen · Install" as the
  primary label.
- hesitation_seconds_estimate: 5

**U3-13 — Red-letter urgency color is reused for routine folio status tags**
- task_ids: T1, T3
- key: `red-letter-zone|1440|off|urgency-color-reused-for-routine-tags`
- surface: `/desk`, `/doc/[id]` (red-letter zone) · width: 1440 · flag: off
- observation: The Needs Attention zone's terracotta eyebrow and left rule
  (`w1440-red-letter-zone.png`) use the same dusty-terracotta hue as the routine folio tab
  tags on the Desk ("ASPEN · INSTALL," "OLSEN · PROJECT" — `w1440-desk.png`) and the
  "DECISION DUE" / "CLAIM OPEN" status chips on those same cards. One is a blocking,
  document-specific alert; the others are everyday categorical labels.
- why_it_blocks: obvious-what-to-do (color is one of the few signals doing double duty for
  "this is different from everything else on the page" and "this is just how we tag things,"
  which weakens exactly the read Q5 asks about)
- evidence: shots: `w1440-red-letter-zone.png`, `w1440-desk.png`; refs: `apps/designer-portal/src/components/document/red-letter-zone.tsx`, `folder-card.tsx:154,259` (folio tab color)
- severity: medium · confidence: 0.55
- already_ruled: D8 forbids badges but doesn't govern hue reuse specifically — new ground.
- suggested_fix: Reserve the red-letter hue exclusively for the Needs Attention zone and give
  routine folio tags/status chips a distinct, cooler accent color.
- hesitation_seconds_estimate: 3

**U3-14 — Region status text truncates mid-word at 390**
- task_ids: T3
- key: `doc-project-rich|390|off|status-text-mid-word-truncation`
- surface: `/doc/[id]` (Client approvals region head) · width: 390 · flag: off
- observation: "Client approvals — NO DECISION LEAD · N…" is cut off mid-word with an
  ellipsis, losing the rest of the status line, confirmed in `m390-mobile-margin-chips.png`.
- why_it_blocks: obvious-what-to-do (a status line that stops mid-word reads as broken, and
  the missing information is exactly what tells her whether the region needs anything)
- evidence: shots: `m390-mobile-margin-chips.png`; refs: `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx:591-601`
- severity: low · confidence: 0.6
- already_ruled: —
- suggested_fix: Wrap the status line to a second line at narrow widths instead of
  truncating, matching how the region heading itself is allowed to wrap.
- hesitation_seconds_estimate: 3

**U3-15 — Room lens has no substitute below 1440**
- task_ids: T4
- key: `doc|1280,390|off|room-lens-no-substitute-below-1440`
- surface: `/doc/[id]` (room lens) · width: 1280, 390 · flag: off
- observation: The only mechanism to "hold" a room and have it lift across the FF&E list is
  the ≥1440 spine Rooms block; the probe confirms a live resize below 1440 auto-releases any
  held room (`room-lens-context.tsx`'s own comment: "there is no put-down affordance under
  the full spine, so a held room carried down to a narrow window would strand its 'IN HAND'
  line"). No alternate control (search-by-room, a room filter chip, anything) exists at
  1280 or 390.
- why_it_blocks: obvious-how-to-get-there (T4's "≤2 acts to the editable line" promise is
  structurally unmet below 1440 — she's back to reading the whole FF&E list top to bottom)
- evidence: refs: `probe/01-interactive-probe.md §7`; `apps/designer-portal/src/components/document/room-lens-context.tsx`
- severity: high · confidence: 0.8
- already_ruled: C8 (room lens is part of the shelved-spine ≥1440 restriction) — the
  cost is being named precisely per the brief's ask, not re-proposed.
- suggested_fix: A lightweight room filter (not a full lens) at 1180–1439 — e.g. a dropdown
  above the FF&E list — would restore the ≤2-act path without touching the ≥1440 lens
  mechanism.
- hesitation_seconds_estimate: 20

**U3-16 — The Record has no visible footprint before the first completion**
- task_ids: T3
- key: `doc-project-rich|1440|off|the-record-invisible-when-empty`
- surface: `/doc/[id]` (The Record / Previous work) · width: 1440 · flag: off
- observation: On Chen Residence (no completed sections yet) there is no "Previous work · N
  complete" line anywhere between Design authority and Closing the book — confirmed
  `w1440-record-foot.png`, where the foot goes straight from the accounts strip to the
  kickoff band with no Record device at all. By contrast the Worktable's Intake table prints
  three quiet "opens when…" teaser rows for content that doesn't exist yet.
- why_it_blocks: obvious-what-to-do (a designer on a young project never sees the device that
  will eventually hold her project's history, so she has no idea it's coming or where)
- evidence: shots: `w1440-record-foot.png`, `wt-intake-1440.png` (contrast); refs: `apps/designer-portal/src/components/document/previous-work.tsx:45-46`
- severity: low · confidence: 0.5 — what would settle this: confirming in source whether
  `PreviousWork` truly renders `null` at zero completions (very likely, given the visual
  gap) versus a possible fold state this pass didn't trigger.
- already_ruled: —
- suggested_fix: Apply the same quiet teaser-row treatment the Worktable's Intake table
  already uses for not-yet-open regions.
- hesitation_seconds_estimate: 2

**U3-17 — Folded-by-default (empty) and user-folded regions look identical**
- task_ids: T3
- key: `doc-project-rich|1440|off|fold-state-ambiguous-origin`
- surface: `/doc/[id]` (region fold seams) · width: 1440 · flag: off
- observation: A region that's folded because it's genuinely empty (e.g. Client approvals on
  a brand-new project) and a region a designer folded herself on a previous visit (per the
  localStorage persistence probe #5 confirms) render as the exact same one-line seam — name,
  status summary, "unfold ↓" — with no visual distinction for *why* it's folded.
- why_it_blocks: obvious-what-to-do (low-severity: a returning designer can't tell "I closed
  this" from "the app starts this closed because there's nothing in it yet," though the
  status summary text itself usually resolves the ambiguity on a second read)
- evidence: refs: `probe/01-interactive-probe.md §5`; `apps/designer-portal/src/components/document/region/fold-seam.tsx:41-65`
- severity: low · confidence: 0.45 — what would settle this: user-testing whether designers
  actually care about this distinction, since the status text usually answers "is this
  empty" without needing a separate visual cue.
- already_ruled: —
- suggested_fix: Optional — a subtly different seam treatment (e.g. dotted vs solid rule) for
  a genuinely-empty auto-folded region vs. a designer-folded one with content inside.
- hesitation_seconds_estimate: 2

**U3-18 — Worktable Capture Inbox introduces a bordered thumbnail-card pattern not used elsewhere**
- task_ids: T8
- key: `wt-speccing|1440|on|capture-inbox-card-pattern-new`
- surface: `/doc/[id]` (Speccing table, Capture Inbox) · width: 1440 · flag: on
- observation: The Capture Inbox's five pending vendor captures each render as a bordered
  card with a colored thumbnail swatch, vendor name, source domain, and a relative timestamp
  — a card pattern with a visible border that doesn't appear anywhere on the flag-off paper.
  Confirmed `wt-speccing-1440.png`.
- why_it_blocks: obvious-what-to-do (low confidence this actively costs an act, but it's a
  fourth distinct visual-weight pattern introduced in one table alongside the scored-ink
  language, the three add-buttons of U3-11, and the boards strip — density of new patterns
  in one region)
- evidence: shots: `wt-speccing-1440.png`; refs: `apps/designer-portal/src/components/document/worktable/` (Capture Inbox)
- severity: low · confidence: 0.4
- already_ruled: —
- suggested_fix: If bordered cards are the right pattern for capture items specifically (they
  do need a thumbnail), keep them, but audit the table for how many distinct visual
  vocabularies exist in one screen and consolidate the ones that don't need to differ.
- hesitation_seconds_estimate: 2

**U3-19 — Studio Drawer disappears below 1180, Orders/Accounts/Hours cost 2+ taps at 390**
- task_ids: T13, T14
- key: `mobile-bar|390|off|drawer-hidden-more-menu-cost`
- surface: `/doc/[id]`, `/desk` (mobile bar) · width: 390 · flag: off
- observation: The persistent Studio Drawer strip that gives one-tap/one-chord access to
  Orders/Accounts/Hours/The Post at ≥1180 is `hidden` below 1180 (anatomy §5); at 390 the
  same ledgers are reachable only via the mobile bar's "More" menu → "Studio books" → a book
  row, confirmed by the row order documented in anatomy §5's mobile-bar breakdown.
- why_it_blocks: obvious-how-to-get-there (T13's "Did Sturdy Oak confirm the PO" now costs a
  three-tap path on the device she's most likely holding at a job site, versus one `g o`
  chord at a desk)
- evidence: refs: `research/10-code-anatomy.md §5` (Studio Drawer row), `apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:222-235,319`
- severity: medium · confidence: 0.75
- already_ruled: —
- suggested_fix: Surface Orders/Accounts as direct rows in the mobile bar's primary menu
  rather than nested one level inside "More → Studio books," given how field-relevant they
  are for exactly the personas most likely to be on a phone (P1's install week, P4's
  receiving-day reconciliation).
- hesitation_seconds_estimate: 6

**U3-20 — Money region's explainer paragraph breaks the region's own rhythm**
- task_ids: T9
- key: `money-region|1440|off|dense-explainer-paragraph-density-break`
- surface: `/doc/[id]` (Money region) · width: 1440 · flag: off
- observation: Four short labeled rows (Authority/Plan/Committed/Moved, each one line plus a
  small-caps one-line gloss) are immediately followed by one dense, unbroken paragraph
  ("Authority → plan → committed → moved. Moved is the accounts' committed figure — the
  client value of schedule lines at ordered, in production, shipped, delivered or installed —
  not funds disbursed... Absorbs today's four separate bands...") — confirmed
  `w1440-money-region.png`. The jump from terse label-value rows to a jargon-dense paragraph
  is a sharp density change inside one region.
- why_it_blocks: obvious-what-to-do (medium-low: this is the region that answers "who owes
  me," and the one paragraph most likely to explain the numbers is also the hardest one on
  the page to skim)
- evidence: shots: `w1440-money-region.png`; refs: `apps/designer-portal/src/components/document/commercial/money-region.tsx:327-336`
- severity: low · confidence: 0.5
- already_ruled: —
- suggested_fix: Break the explainer into the same short-line rhythm as the four rows above
  it, or fold it behind its own "why these four numbers →" disclosure.
- hesitation_seconds_estimate: 8

**U3-21 — An unexplained circular badge overlaps page content in most captures**
- task_ids: T1, T3
- key: `surface|1440|off|circular-badge-overlaps-content`
- surface: all · width: 1440 (also seen at 1280/390) · flag: off
- observation: A small black circle containing "N" sits fixed at the bottom-left corner in
  nearly every screenshot reviewed, overlapping the Studio Drawer's "Patina" wordmark in
  `w1440-drawer-strip.png` (leaving only "INA" legible) and sitting over document content in
  several full-page captures (e.g. `w1440-doc-project-rich.png`, `w1440-doc-install.png`).
- why_it_blocks: obvious-what-to-do (if real product chrome, it's actively obscuring the
  wordmark and section text; if a dev-only artifact, it's noise in this evidence set that
  should be discounted)
- evidence: shots: `w1440-drawer-strip.png`, `w1440-doc-project-rich.png`
- severity: low · confidence: 0.3 — what would settle this: the shot ledger's harness notes
  don't mention hiding dev overlays for this pass (only the separate probe script mentions a
  `hide-dev-overlays.ts` helper), which is consistent with this being an un-hidden Next.js
  dev-mode indicator rather than a real product element — but this wasn't independently
  confirmed against a clean production build in this pass.
- already_ruled: —
- suggested_fix: Confirm whether this is a dev-only badge (in which case no product action is
  needed, but future shot passes should hide it) or a real overlay (in which case it needs
  repositioning away from the wordmark).
- hesitation_seconds_estimate: 0

---

## Answers to the U3 brief questions

**(1) First viewport per tier — work or chrome?**
≥1440 and 1280: mostly work. On `/desk`, the greeting/date/header-acts occupy roughly the top
200px, then the first two "Needs your hand" folio cards (real, actionable content) are
visible without scrolling. On `/doc/[id]`, the spine + letterhead + red-letter zone/guide are
all in the first viewport — the actionable sentence is immediately visible. At 390: more
chrome-heavy. The greeting wraps to 3 lines (U3-01) and pushes the first folio card mostly
below the fold on `/desk`; on `/doc/[id]` the guide/red-letter zone still makes it into the
first viewport (confirmed `m390-doc-project-rich.png`), so the document surface degrades
better than the Desk does at mobile width.

**(2) Enumerate exactly what is lost 1440→1280**
Per anatomy §5 and direct shot comparison: the entire shelved spine block (running index,
Rooms, shelves list) disappears, not narrows (U3-05); the shelf leaf is force-closed and
cannot open at all; the margin rail becomes a closed, focus-trapped sheet behind a "MARGIN ←"
tab instead of a permanently visible rail (U3-04); the spine's per-mark text labels drop,
leaving unlabeled glyphs (U3-03); the full spine timer with pause/resume/log controls becomes
a compact readout-only doorway that must be tapped open; and the room lens's only write
mechanism (the ≥1440 Rooms block) goes away with no substitute (U3-15). The Studio Drawer
strip and its seven surfaces persist unchanged down to 1180.

**(3) Zero shadows (D4) — how is depth carried, where does it fail?**
Depth is carried by: value contrast (cream paper vs. slightly-darker column backgrounds),
rule weight (a heavy black horizontal rule separates region heads from body, a thin gray rule
separates rows), left-edge colored accent bars (red-letter zone, margin note cards, the
kickoff band all use a colored left border instead of a box), and typographic register
(italic Playfair for names/summaries vs. DM-mono for status/labels). It fails to separate two
places found in this pass: the Money region's one bordered "Sync" button (U3-09) reads as a
foreign, boxed element against everything else's flat language; and at 390, the FF&E leader
button doesn't just fail to signal depth — it actively overlaps the heading text underneath it
(U3-02), which is the sharpest failure mode zero-shadow design can have: without a shadow or
outline to say "this is on top," an overlap just looks broken rather than layered.

**(4) Where does the Record at the foot (I137) get in the way or become undiscoverable?**
It never gets in the way in this evidence set — on both a young project (Chen, 0 complete)
and a further-along one (Aspen install, 1 complete; Aspen proposal, 3 complete) it stays
compact and foldable. It does go fully undiscoverable on a young project: at zero completions
it renders nothing at all (U3-16), with no placeholder hinting that it exists and will fill in
later, unlike the Worktable's own Intake table which already solves this exact problem with
quiet teaser rows for FF&E/Money/Schedule.

**(5) Does the red-letter zone read urgent without a badge, or decorative?**
Mostly urgent, with one real dilution: the terracotta/peach color and left-rule treatment do
separate it from the surrounding flat paper, and the "NEEDS ATTENTION · IN ONE PLACE" eyebrow
plus black serif body copy reads seriously rather than decoratively in isolation
(`w1440-red-letter-zone.png`). But the same terracotta hue is reused for routine, non-urgent
folio status tags on the Desk (U3-13) — so a designer who's internalized "terracotta = pay
attention" from the Desk's everyday tags arrives at the document's Needs Attention zone with
that signal already partially spent.

**(6) At 390 can she complete T3, T4, T9, T13? Rank tiers by task coverage.**
T3: yes — the guide/red-letter renders at the top of the document at 390. T4: no, not within
"≤2 acts" — room lens has no 390 (or 1280) equivalent (U3-15), so she's reduced to scrolling
the FF&E list. T9: yes, functionally — the Money region and its acts render on the paper at
390 (not independently re-shot at 390 in this pass, but nothing in the width regime hides
MoneyRegion below 1440); the "≥3 doors to money" competition U2 raises is a separate axis. T13:
yes, but costlier — Orders is reachable only via mobile bar → More → Studio books → Orders (3
taps, U3-19) versus a 1-chord path at ≥1180. Ranking, full 16-task coverage: **≥1440** (full
recognition-based access to every surface named in the brief) > **1180–1439** (loses shelves/
Rooms/room-lens visual doorways but keeps the Drawer, margin, and running index in a
sheet-form) > **<1180/390** (loses the Drawer entirely on top of everything 1280 loses,
compensated only by the mobile spine sheet + mobile bar's More menu, which consolidate well
but always cost more taps).

**(7) Per-region fold persists in localStorage — can a returning designer tell folded from
empty?**
Mostly yes, at the fold/full-region level: a folded seam is always a single compressed line,
while an unfolded-but-genuinely-empty region (e.g. FF&E's "Build the FF&E schedule" empty
state) is a full block with a heading, explanatory copy, and a CTA — structurally distinct at
a glance. Probe #5 confirms the fold state itself survives a reload correctly. Where it
doesn't fully resolve (U3-17, low severity): two *folded* seams look identical whether the
region is folded because a designer chose to hide it or because it defaulted closed for being
empty — the status summary text on the seam is usually what actually answers "is this empty,"
not the seam's visual treatment.

---

## What stays true (do not break these)

1. **Scroll-spy on the running index has zero dead zones and zero double-highlights** —
   probe #4 confirms exactly one active entry at every sample point across a full scroll of
   Chen Residence. This is a genuinely reliable "where am I" signal at ≥1440 and should
   survive any Lane A or Lane B change to the spine.
2. **The Esc chain is correct LIFO with no stranding** — dialog → shelf → put-down, verified
   directly (probe #2). Any restructuring of the spine/shelves must preserve this exact
   unwind order.
3. **Fold state persists correctly across reload**, and a folded region is always visually
   distinct (one-line seam) from an open-but-empty one (full block with copy) — this
   distinction is doing real work and should be extended (per U3-06/U3-16), not diluted.
4. **Zero-shadow depth genuinely works at ≥1440** outside the two exceptions found (U3-02,
   U3-09) — value contrast, rule weight, and colored left-edge bars carry region separation
   cleanly with no shadows anywhere in the primary reading flow.
5. **FF&E line-item status chips (IN PRODUCTION / RECEIVED) are the one consistent bordered
   pattern in the whole product**, used only for state, never for actions — this is the
   correct place for a box to exist and should not be blurred with U3-09's outlier button or
   U3-18's new card pattern.
6. **The 390 mobile spine sheet consolidates the running index + margin capture into one
   reachable bottom sheet** (`m390-mobile-spine-sheet.png`) — a good compression that answers
   "where am I / what's waiting" in one tap even though the full desktop rail is gone.
