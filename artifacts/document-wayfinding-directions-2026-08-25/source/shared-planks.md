# S0 — Shared Planks

The Document — Wayfinding Review · 2026-08-25 · verified against `main@695addb5f`

Per instruments §6, "the shared-plank rule": fixes so obviously correct that both Direction A
and Direction B adopt them identically — copy, mislabels, a missing act, a dead-end shelf. Never
structure: no new surfaces, tiers, modes, or moved regions. Every plank stays within Lane A's own
bounds (zero D/R amendments) since if it needed doctrine it would not be shared.

All mock renders (both lanes) use the Vandersteen residence (§8) and must show planks applied.

---

## Shared planks (SP-01 … SP-19)

### SP-01 — Care-stage FF&E head stops calling itself `Install`
Closes: **F03**.
Change: the FF&E spread heading on a Care-stage document reads the literal word `Install`, with
empty state `No FF&E lines are scheduled for installation.` — four lines under a correct
paragraph that reads `Plan the care work`. Change the heading to `Care` (mirroring the working
`install`/`care` mode key at `document-index.ts:179`) and the empty state to `No FF&E lines
remain open for care.`
Width/flag: all widths, both flag states (the mislabel sits above the `worktable` gate).
Why a plank, not a direction: a literal wrong word printed on screen — no structural choice is
being made, only a string keyed off the mode that is already computed correctly.

### SP-02 — Two regions on one paper stop sharing the name `Schedule`
Closes: **F35**.
Change: ~120px apart, one paper prints a fold seam `Schedule … UNFOLD ↓` (`schedule-rule-title`)
and a region head `Schedule / 0 phases · nothing active …` (`project-schedule-title`). Rename the
fold-seam Rule to `Schedule dates` (it already only ever shows phase dates / install month per
`schedule-rule-region.tsx:201-210`) and leave the ledger region as `Schedule`. The running-index
row continues to point at the ledger only, unchanged.
Width/flag: all widths, both flag states.
Why a plank, not a direction: one of two identically-named headings gets a second, truer word —
no region moves, no index entry changes target.

### SP-03 — The money region's `Committed` stops meaning two numbers on one document
Closes: **F59**.
Change: the `Design authority` region's own `Committed` row reads `nothing executed yet` ($0)
while the folded `The accounts · this project` seam three screens down reads `$14,420 COMMITTED`
for the same project. Rename the region's `Committed` row to `Authorized` (it is tracking
authority granted, not money in motion — matches the region's own name) and leave `The accounts`
band's `Committed` as the one place that word appears for the ledger figure.
Width/flag: 1440, flag off (the region is unconditionally mounted; verify unchanged flag-on).
Why a plank, not a direction: one row's label changes to match what it actually counts; the two
underlying numbers, both real, are untouched.

### SP-04 — The `Moved` money row gets a plain-English gloss inline
Closes: **F76**.
Change: the fourth money row reads only `Moved · $14,420 in motion — ordered through installed`,
requiring a full paragraph below (`Absorbs today's four separate bands…`) to learn what it means.
Add a four-word inline gloss to the row itself: `Moved · $14,420 in motion — ordered through
installed (committed, not yet paid out)`. Brand-voice justification: plain-spoken Midwest pairs
studio word with trade word in place, same register as `Call sheet · who is on the job` (U4
"what stays true").
Width/flag: 1440, flag off.
Why a plank, not a direction: a six-word clause added to an existing row; no new row, no moved
content.

### SP-05 — The money explainer paragraph stops naming its own old UI
Closes: **F26**.
Change: delete the trailing sentence `Absorbs today's four separate bands: design authority,
working budget, authorizations & trade scopes, the accounts.` from the money explainer paragraph
— a leftover migration note naming UI that no longer exists on screen. The rest of the paragraph
stands.
Width/flag: 1440, flag off.
Why a plank, not a direction: deleting one leftover sentence; the region's composition and every
other row are unchanged.

### SP-06 — The needs-attention reason stops reading as a system log
Closes: **F75**.
Change: `document-guide.ts`'s needs-attention branch prints, verbatim, `This action comes from
the operational signals available on the current document.` Replace with a plain first-person-
adjacent line naming what actually triggered it, e.g. `Something on this job needs a decision.`
(the guide already has the specific reason available per-need at the folio level — U4 flags this
as one of two clearest instances of system language surviving into her voice).
Width/flag: all widths, both flag states.
Why a plank, not a direction: one boilerplate sentence swapped for a plain one; the branch logic
and its trigger conditions are untouched.

### SP-07 — ⌘K drops the `ask the Engine` framing
Closes: **F33**.
Change: the ⌘K placeholder reads `Find a document or a ledger — or ask the Engine…`; the no-match
fallback reads `Ask the Engine` / `The Engine · "{query}"` / `'{query}' · ask & place`. This is
engine/AI framing in the very first text a designer reads inside search, against the brand
skill's hard rule ("never AI/engine framing"). Replace with plain search language: placeholder
`Find a document or a ledger…`; no-match fallback `No match` / `Try the Help Center` — keep the
existing `SEARCH THE GUIDES →` link, drop the `Engine` framing entirely (the underlying capability
is unaffected; only the words that describe it change).
Width/flag: all widths, flag off (⌘K itself is unflagged).
Why a plank, not a direction: pure copy replacement on an existing surface; no new search
behavior, no structural change to ⌘K's result groups.

### SP-08 — `Next up` becomes the one stable guide eyebrow
Closes: **F91**.
Change: the eyebrow string `Next up` is used exactly once, on the `unavailable` (error) branch,
while every healthy state uses a different stage-specific eyebrow (e.g. `Project · active work`).
U4 asks whether the guide should have one stable name; the panels' own "what stays true" praise
the guide sentence as reliable once reached (P2 #1) — so this plank keeps every healthy-state
eyebrow as-is (they already work) and instead fixes only the orphaned string: rename the
unavailable-branch eyebrow from `Next up` to `Guidance is unavailable` (matching its own headline,
removing the false-positive collision with a name that otherwise means nothing) so `Next up`
stops being a dead label with exactly one, wrong, use.
Width/flag: all widths, flag off.
Why a plank, not a direction: one orphaned eyebrow string on an error branch is retired; no
change to the stage-by-stage eyebrow scheme both lanes must design around.

### SP-09 — `Add to project` and `Open a project` stop sharing a word
Closes: **F92**.
Change: FF&E's ledger act reads `Add to project` (adds a line/board/import to the current
engagement); the Desk header act and ⌘K verb read `Open a project` (starts a new engagement).
Rename the FF&E ledger act to `Add a line` (it already sits directly above/beside room-scoped FF&E
rows, so "line" is unambiguous in context; matches the FF&E line grammar the panels praise — P1
"what stays true" #5, P4 #1).
Width/flag: all widths, flag off.
Why a plank, not a direction: one act's label changes to remove a word collision; the two flows
it distinguishes are otherwise identical.

### SP-10 — The `Team…` colophon act says what it opens
Closes: **F93**.
Change: colophon actions read `Brief a vendor`, `Hold`, `Archive`, `Team…` — the first three are
plain imperatives naming their result; `Team…` is a bare noun with a trailing ellipsis that never
says it opens the Call Sheet picker (`doc-colophon.tsx:153-165`). Rename to `Add to the team`
(matches the plain-imperative register of its siblings and names the actual result: it opens the
picker that adds someone to the Call Sheet roster).
Width/flag: 1440, flag off.
Why a plank, not a direction: one colophon label reworded to match its three siblings' existing
register; the picker it opens is unchanged.

### SP-11 — `The Post` and `Message {Family}` get one connecting word
Closes: **F83**.
Change: the inbox door is `The Post` (a postal noun); the letterhead's reply action is `Message
{Family}` — both concern client correspondence with nothing tying the words together. Add the
word `mail` to the inbox door's sub-label where space allows (drawer: `The Post`, aria stays
`The Post, {n} unread`; mobile `More` menu row keeps `The Post` but its adjacent group label,
where one exists, becomes `Mail & messages`) so a first-time reader can infer the two doors are
kin without opening either. No route, chord, or count-vs-dot behavior changes (that split is
SP-15 below).
Width/flag: all widths, both flag states.
Why a plank, not a direction: a connective label word added beside two existing, unmoved doors;
no new door, no merged inbox.

### SP-12 — The proposal guide's fallthrough act names the live act, not a fixed phrase
Closes: **F36**.
Change: the sent-proposal fallthrough prints action `REVIEW SIGNING CONTROLS` under headline
`Wait for the client's signature`, while the real act, `NUDGE CLIENT USER`, sits ~200px lower on
the send-wall (which the panels repeatedly call the single best pattern on the surface — U1/U2/P1
"what stays true"). The guide's fallthrough branch (`document-guide.ts:308-313`) already has
access to the same send-wall state; when a nudge is available, print the guide action as `NUDGE
CLIENT USER` (anchored to the send-wall) instead of the generic `Review signing controls`; keep
`Review signing controls` only for states where no nudge exists.
Width/flag: all widths, flag off (guide precedence sits outside the `worktable` gate — U2 "what
stays true" #6).
Why a plank, not a direction: the guide already resolves proposal state precisely; this points
its printed action at the send-wall's own live act instead of a stand-in phrase — no new
precedence rule, no moved region.

### SP-13 — The Orders sheet stops printing `PUT BACK · ESC` twice
Closes: **F46**.
Change: `PUT BACK · ESC` appears once at the top-right of the screen and again inside the
dialog's own header row, stacked directly above each other. Remove the outer instance (the sheet
chrome's own header already carries it); the inner, dialog-owned instance is the correct single
copy since it travels with the sheet regardless of what opened it.
Width/flag: 1440, both flag states.
Why a plank, not a direction: deleting one duplicate string; the sheet's open/close mechanics are
untouched.

### SP-14 — The two leaf routes' return links both name the project the same way
Closes: **F100**.
Change: `w1440-leaf-plans-route`'s return link reads `← CHEN`; `w1440-leaf-specbook-route`'s
reads `← CHEN RESIDENCE`. Neither says Desk or document, which the finding leaves as an open
question, but the two shelf leaves at minimum must agree with each other. Standardize both leaf
routes' return link to the full project name (`← Chen Residence`) matching the fuller, less
ambiguous form.
Width/flag: 1440, both flag states.
Why a plank, not a direction: two labels are made to agree with each other on an existing pattern
(a leaf's return link); no new navigation affordance, no wording philosophy decided beyond
matching what already exists on one of the two routes.

### SP-15 — `The Post` reports the same kind of thing at every width
Closes: **F47**.
Change: the 390 `More` menu prints `The Post   3 NEW` (a count); the ≥1180 drawer prints `THE
POST` with an unlabelled dot (a state). Standardize on the dot's own information: since C4
forbids badges/counts on the persistent drawer, drop the literal count at 390 too and print `The
Post   NEW` (matching the state-only signal used everywhere else), or, if the count is judged
essential at 390 specifically, carry the same treatment used for `NEEDS YOUR HAND 8` on the Desk
(a proven pattern) rather than inventing a third form. Default recommendation: state-only at both
widths, consistent with C4.
Width/flag: 390 and ≥1180, both flag states.
Why a plank, not a direction: one inconsistency between two widths' labels for the same object is
resolved by picking the already-doctrine-compliant form; no drawer or menu structure changes.

### SP-16 — ⌘K's typed search finds the plan room
Closes: **F50**.
Change: `The plan room` (`this project · the current set`) enters ⌘K's `This surface` group only
on the empty-query branch, with `match: ''`; typing `plan` or `plan room` returns `No match`
because `matchSurfaces()` has no plan-room entry. Add a plan-room row to `matchSurfaces()`'s
typed-query table with match aliases `plan`, `plan room`, `floor plan`, `plans`, `drawings` —
mirroring how every other shelf/surface already has a typed-match entry. This is a missing
registry row, not a new door: the empty-query branch already proves the row and its destination
are correct; the fix wires the same row into the branch that currently drops it.
Width/flag: all widths, flag off (the registry itself is unflagged; `worktable` does not gate
⌘K's search table).
Why a plank, not a direction: closes a registry gap — the exact same surface, already reachable
one way, becomes reachable the other way it obviously should be. No new surface, no new door.

### SP-17 — Brief chips render their template text as words, not tokens
Closes: **F44**.
Change: the BUDGET chip reads `15k_50k` (literal underscore) and the TIMELINE chip reads
`3 6 Months` (missing separator) — raw template text a fast read of T1/T3 depends on. Format the
budget chip as `$15k – $50k` and the timeline chip as `3–6 Months`.
Width/flag: 1440, flag off.
Why a plank, not a direction: a formatting bug in two chips' string interpolation; no chip is
added, removed, or repositioned.

### SP-18 — The guide's act and the checklist row beneath it use one name for one input
Closes: **F43**.
Change: the guide's action reads `ADD PROJECT TYPE AND NAMED ROOMS` under headline `Complete
Discovery`; the first checklist row directly below is labelled `Scope & rooms` — one input, three
names, adjacent on screen. Rename the guide action to `Add scope & rooms`, matching the checklist
row's own name exactly (the checklist row is the more compact, already-legible form; the guide
action should defer to it rather than invent a third phrase).
Width/flag: 1440, flag off.
Why a plank, not a direction: one action label is made to match the row it triggers, both already
on screen; no new field, no reordered checklist.

### SP-19 — The FF&E line she edits gets a visible route to its own spec attributes
Closes: **F57**.
Change: the FF&E line unfolds on the paper for PO, movement, receiving, and room assignment, but
Sku/Finish/Material/Colour/Exact Location are editable only in the spec-book route, with no link
from the unfolded line to get there. Add a plain in-flow act to the unfolded line's own footer,
`Edit spec details →`, routed to that line's spec-book entry (the spec book already exists and is
already reachable via the shelf — this only adds a second, line-scoped door to the same
destination, matching the pattern of every other in-flow scored-ink act on the line).
Width/flag: all widths (the act text may need to wrap at ≤1280/390 but the act itself is not
width-gated), flag off (spec-book route is unflagged).
Why a plank, not a direction: one new in-flow link on an already-unfolded line pointing at an
already-existing route; no new editing surface is built, no attribute becomes editable in a place
it wasn't.

### SP-20 — Setup chores and dated overdue needs get one visual tell apart
Closes: **F41**.
Change: setup chores and dated overdue needs currently share the red-letter band and act
treatment, distinguished only by headline font-weight — while each need *kind* already carries its
own stamp colour elsewhere on the surface (the finding notes this explicitly). Reuse that existing
per-kind stamp-colour system on the red-letter zone's folio badges themselves, rather than relying
on font-weight alone, so a setup chore and a dated overdue item are visually distinct at a glance
using a device (stamp colour) the product already has.
Width/flag: all widths, both flag states.
Why a plank, not a direction: reapplies an existing, working visual device (per-kind stamp colour)
to a second location; no new urgency tier, no new zone, no count/badge added (stays within C4).

---

## Structural — left to the lanes

Every surviving blocker/high finding that is **not** a plank, with the one line explaining why it
needs a direction (a new surface/tier/mode, a moved region, or a named doctrine amendment).

| id | title | why it needs a direction |
|---|---|---|
| F01 | Shelves, rooms block, running index absent below 1440 | requires a decision about what (if anything) replaces them below 1440 — a tier-level composition choice, ruled-against C8; Lane B may amend, Lane A must route around without adding a tier |
| F14 | Index, rooms, shelves vanish on install/care documents | same device as F01, on a different axis (`engagement_kind`/`active_section` gate) — a composition-scope decision, not a copy fix |
| F48 | Spec book has no door on install or care | requires deciding whether/how a new surface entry exists in `STUDIO_ROOMS`/ledgers for two modes that currently have none — a registry-scope decision beyond one row |
| F49 | No visible way to open ⌘K anywhere on a phone | requires adding a mobile entry point inside the document shell — a new persistent affordance at 390, not a label fix |
| F28 | `ADD TO PROJECT` plate covers the FF&E heading at 390 | a layout collision requiring either a composition change to the FF&E head or a width-tier rule — not a string change |
| F02 | 1280 spine is an unlabelled 56px icon rail | ruled-against C8; restoring labels at 1280 is a tier-composition call each lane must state, not a copy swap |
| F04 | Nothing answers a phase-wide question; ⌘K `install` = No match | known-open T2/T4 — this is the "new tier or a lens?" question U1 poses directly; structural by definition |
| F15 | Mobile spine sheet lists sections and nothing else | ruled-against C8/D3 — what the mobile sheet shows is a composition decision, not a label |
| F05 | FF&E lines print under `Unsorted`, never under a room heading (zero-room projects) | the room-heading path depends on `project_rooms` existing; the fallback needs a designed alternative composition, not a rename |
| F07 | Mobile bar's one act is truncated `MESSAGE THE CLI…`; red-letter zone registers no mobile primary | two competing primaries (guide vs red-letter) at 390 is a precedence decision — U2's "leader election" question, structural |
| F08 | 3-4 competing doors answer one money question | which door leads is a leader-election decision across multiple regions — U2's core structural question |
| F16 | `Who still owes me` unanswerable inside the document | known-open I141 — adding a receivable rung to the money ladder is a region-composition decision |
| F17 | Three different things are called `room` | disambiguating three real, different concepts (scanned rooms / FF&E groups / drawings) needs a naming *system* decision across surfaces, not one label |
| F18 | Five of seven stage default acts are `Review {X}` | each stage's leader verb is a precedence/composition call across `stageCopy` — U2's central finding, structural by scope |
| F29 | The roster cannot be reached from the Desk at all | requires adding a Desk-reachable door for a `scope: 'document'` surface — a registry/composition decision |
| F30 | Mood boards shelf opens onto another fold with no way to start one | needs an in-flow "start a board" act designed and placed — new act placement inside a leaf, more than a copy fix |
| F32 | Worktable moves no item-reach cell; install week untouched (flag-on) | known-open I138/I139 — squarely Lane B's territory |
| F35-adjacent items (composition, e.g. F60) | Room lens has no substitute below 1440 | ruled-against C8 — needs a tier-level mechanism, not a string |
| F51 | Drafting Room's only Desk doorway is ⌘K | needs a Desk Contents/Begin-list entry added — a composition decision (what appears on the Desk) |
| F52 | `MESSAGE THE CLIENT` leads letterhead with no client linked | needs a conditional leader-election fix (`canSendNote` must check for a client) — logic, not copy |
| F53 | Answering a client question happens off the document | needs a margin item kind or on-paper reply surface designed — new act placement |
| F54 | Rooms rail exists on direction, disappears on project (flag-on) | ruled-against C14 — the Worktable's per-stage composition is Lane B's to answer |
| F55 | No bypass-blocks control anywhere | needs a new skip-link component added to the layout — a new affordance, not a label |
| F56 | Terracotta/clay ink fails 1.4.3 contrast | a token-level color change across ~374 uses — a system change requiring its own accessibility pass, not a single-string plank |
| F58 | Same FF&E line reads `RECEIVED` on paper, `DELIVERED` in spec book | two different state vocabularies describing possibly-different real states — needs a data/state reconciliation decision, not a rename (renaming one risks asserting a false equivalence) |
| F60 | Room lens has no substitute below 1440 | duplicate of tier mechanism gap — see F01 |
| F61 | Index says `NO AUTHORITY YET` over $14,420 in motion | the index summarizes one money tier while another is active — needs a composition decision about what the index summarizes, not a string |
| F62 | Boards have three doors, three names (flag interactions) | ruled-against C9 — reconciling three doors across stages is Lane B's or a scoped Lane A IA move, larger than a plank |
| F63 | Three `add a room` verbs mean three different things | ruled-against C12 — disambiguating three genuinely different actions needs a naming system, not a single rename |
| F64 | Two acts open the same Drafting Room, worded differently | needs one of the two acts removed/demoted — a composition decision about which region leads |
| F65 | Nothing on the Desk says what changed while she was gone | needs a "since you left" device designed — new information, not relabeling |
| F67 | Orders is a global ledger, not project-scoped | needs either a project-scoped entry point or a persistent filter-by-project default — a composition/behavior change |
| F70 | Three Worktable add-actions have three visual weights (flag-on) | Lane B's territory — Worktable composition |
| F71 | Intake's `opens when…` seams point at wrong stages (flag-on) | Lane B's territory — Worktable composition |
| F72 | Rooms block disappears at zero rooms with no placeholder | needs a placeholder state designed and added — new UI state, matching what shelves already do (close, but the empty-state pattern itself must be built for this block) |
| F73 | One boxed control breaks flat scored-ink grammar | requires restyling one control to match the system — a visual-language fix, judged structural only because it touches the shared grammar system rather than one string (borderline; lanes may triage as a plank-adjacent fast-follow, but instruments' "never structure" bar keeps grammar-system changes out of S0) |
| F74 | Drawer hidden below 1180; Orders costs 2+ taps at 390 | needs a mobile-reachable ledger door designed — new affordance |
| F77 | Care-stage document shows no guide headline at all | needs the guide to grow a Care-stage branch — logic addition, not copy |
| F78 | Compact-tier margin is a closed, unlabelled `MARGIN ←` tab | needs a count/preview added within the 1180-1439 tier's own device — composition change |
| F81 | `No client linked` silently blocks money and approvals chain | needs the money region to also surface the missing-client blocker — logic addition across two regions |
| F82 | Every project artifact is behind opening the document first | the central IA question both lanes must answer (item-reach table, §6 deliverable 4) |

*(F03, F26, F33, F35, F36, F43, F44, F46, F50, F57, F59, F75, F76, F83, F91, F92, F93, F100, F41,
F47 are covered by planks SP-01…SP-20 above and are not repeated here. Findings not listed in
either table — low-severity polish items U3/U5 raised on hover/contrast/state-dependent items not
yet reproduced with full confidence, e.g. F25, F79, F80, F84-F90, F94-F99, F101 — are available to
either lane as ordinary within-lane material; they did not clear the bar for "both directions
would obviously adopt this identically" because they are either flag-scoped speculative
(`flag-on-unverified`), state-dependent/unverified, or narrow enough to be a natural component of
one lane's specific composition choice rather than a standalone identical fix.)*

---

## What stays true

Consolidated from the nine panels' "What stays true" sections — do not break these in either
direction's mocks or IA proposals.

1. **The Esc chain (⌘K → shelf → put-down) is a correct, live-verified LIFO with zero stranding**,
   confirmed by probe across every lens and every persona that tested it — the strongest thing in
   the product (U1, U2, U3, U5, P1, P2, P3).
2. **`← Put down` is a trade verb doing real work** and should never become "Close" or "Exit"
   (U4, P1).
3. **The send-wall state line for a sent proposal (T7) is exact and complete** — sent date,
   opened/not-yet, reading state, most-read, one nudge printed once, on one scored line. The model
   for every other "state + one act" line on the surface (U1, U2, P1, P2, P3, P4).
4. **`ADD A ROOM`/`Add a room` in flow at the foot of the room list is found unaided, first
   pass** — keep it exactly there; don't promote it into a head menu (U1, P1, P2, P4).
5. **Nothing is hover-gated anywhere on the surface** — probe-verified across fold buttons,
   colophon acts, spine marks, margin rows, row-overflow glyphs (U1, U5, P4).
6. **The two Desk Begin verbs disambiguate via sub-label before the click** — `Capture a lead ·
   begin a Brief` vs `Open a project · no proposal needed` (U1).
7. **The running index's scroll-spy has zero dead zones and zero double-highlights**, and clicking
   a folded region's index row both unfolds and scrolls to it in one click — mechanics are right,
   only labels/mount condition need work (U1, U2, U3).
8. **Fold state persists correctly per-document, per-region via localStorage across reload**, and
   a folded region reads visually distinct from an open-but-empty one (U2, U3, U5).
9. **FF&E lines carry piece, order status, and price on one row** (`Møbler Lounge Chair — Bouclé ·
   ×2 / Nordic Atelier — IN PRODUCTION — $5,700`) — keep a piece and its PO state on one line in
   any redesign (U3, P1, P4).
10. **Zero-shadow depth genuinely works at ≥1440** via value contrast and flat stacked edges,
    outside two named exceptions — preserve this discipline (U3).
11. **Honest, plain-sentence empty states everywhere** (`NOTHING FILED`, `No boards yet`, `0 of 5
    essentials captured — keep going`) — nothing pretends; this is why the numbers that are there
    are trusted (P1, P3).
12. **The Studio Drawer's core doors (Library/People/Rooms/Studio books/Post/account) are
    genuinely persistent** and never move or disappear regardless of what document is open — and
    the 44×44 minimum target discipline plus visible `focus-visible` rings are applied with no
    exceptions found (U5, P2).
