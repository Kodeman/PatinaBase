# U1 — Information architecture & wayfinding

Lens: U1 (UX/UI). Persona of record for scoring: **P1, Leah** (solo residential principal, six live
projects, one always in install). Baselines walked: flag-off (`w1440-`/`w1280-`/`m390-`) and
flag-on Worktable (`wt-`). Verified against `main@695addb5f`.

---

## 1. Overall (≤120 words)

The document's whole wayfinding apparatus — running index, rooms block, the five shelves — is
mounted on one condition: `engagement_kind === 'project' && active_section === 'project'`, at
≥1440px. Every other document she opens in a week (brief, discovery, direction, proposal,
**install, care**) gets a spine that carries a Put-down link, seven unlabelled marks and a timer,
and nothing else. Install week — the week with the most artifacts in play — is the week the
plan room, spec book, mood boards, call sheet and running index all disappear. Below 1440 the
same amputation happens to every document, plus the section's own name. Findability is not
degraded gracefully; it is switched off by a state the designer never chose and cannot see.

---

## 2. Task table (T1–T16)

Scored for P1 at her real width mix (1440 desk, 1280 laptop, 390 on site). 1 = could not find,
3 = second-guess, 5 = without thinking.

| Task | what to do | how to get there | Note |
|---|---|---|---|
| T1 "what does today need" | 4 | 4 | `NEEDS YOUR HAND 8` prints over four folios; the other four are behind `REVEAL 4 MORE FOLIOS ↓`, and `Studio pulse` is folded to two generic lines. |
| T2 "everything in install" | 2 | 1 | No tier answers it. ⌘K typed `install` returns `No match — Browse the Help Center`. Only the folder tab `ASPEN · INSTALL` carries the word, one project at a time. |
| T3 "next move on this one" | 4 | 4 | Red-letter zone / guide sits above the fold at 1440. At 1280 nothing prints the section's name; at 390 the bar's centre slot advertises `MESSAGE THE CLI…`, not the need. |
| T4 "change the fabric on the living room sofa" | 3 | 2 | The FF&E line prints name · maker · state · price and no fabric field; the editable `Color Fabric` lives in the Spec Book, a full-screen room. Rooms block never appeared (0 `project_rooms`). |
| T5 "pull up the mood board" | 3 | 2 | `Mood boards` shelf exists only ≥1440 on a project-section doc, and the leaf then opens onto a second `UNFOLD ↓`. Below 1440: no door at all. |
| T6 "where's the floor plan / spec book" | 3 | 2 | `Plan room` is a ≥1440 shelf or an un-typed ⌘K row; `Spec book →` is an FF&E head link that only renders in `mode === 'project'`. On install/care: neither exists. |
| T7 "did they open it — nudge them" | 5 | 4 | Best-served task on the surface: `SENT YESTERDAY — NUDGE CLIENT USER` plus `SENT / OPENED not yet / READING / MOST READ`. Only weakness: the desk stays silent until a need derives. |
| T8 "add the mudroom" | 4 | 4 | `ADD A ROOM` prints as a scored line at the foot of the room list, unhidden, exactly as I137 SP4 ruled. Competing `+ Add a room` on the Speccing rail is the friction. |
| T9 "bill the deposit / who owes me" | 3 | 3 | Billing has ≥3 doors (`DRAW AN INVOICE`, `BILL 3 UNINVOICED`, ⌘K `Draw an invoice for…`). "Who owes me" has none in the document — receivables live only in the Accounts sheet. |
| T10 "install slipped — what does it hit" | 3 | 2 | Two regions on the same paper are both titled `Schedule`, with independent folds; the index carries one row and points at only one of them. |
| T11 "put this down, pick up the Byrnes" | 5 | 5 | `← PUT DOWN` / Esc → `/desk` → folio. Esc chain is LIFO and clean (probe §2). The one unambiguous trip on the surface. |
| T12 "new inquiry — start them" | 4 | 5 | `Capture a lead · begin a Brief` vs `Open a project · no proposal needed` — the sub-labels do the disambiguating work before the click. |
| T13 "did Sturdy Oak confirm the PO" | 3 | 3 | Answerable only in the Orders sheet, which is a studio-wide register (`PROJECT · ALL / CHEN RESIDENCE / OLSEN LAKE HOUSE`), not the project's frame. No ack word on the document. |
| T14 "console came in damaged — file it" | 4 | 3 | The desk folio says it plainly (`AP-012 has an open damage claim` / `REVIEW THE CLAIM`); from inside the document she must leave for Orders → Receiving. |
| T15 "who's on this job" | 3 | 2 | `Call sheet` is flag-gated, document-scoped, unreachable from `/desk` at all, and its shelf row disappears on install — the stage that most needs a roster. |
| T16 "answer the client on the record" | 3 | 3 | `THE POST` bell is one act; but `MESSAGE THE CLIENT` prints as the letterhead's leader on a document whose own subtitle says `No client linked — attach one ↗`. |

---

## 3. Findings

Schema per §4. `already_ruled` cites a canon id only where the finding runs against a ruling.

---

**U1-01** · `desk|all|both|no-phase-wide-view`
**No surface answers a phase-wide question**
task_ids: T2 · surface `/desk` · width all · flag both · severity **blocker** · confidence 0.95
Observation: `/desk` groups by folio, one per engagement; the only phase word on screen is the
folder tab (`ASPEN · INSTALL`, `OLSEN · PROJECT`, `WRIGHT · BRIEF`). ⌘K typed `install` returns
exactly two rows: `No match — Browse the Help Center` / `SEARCH THE GUIDES →` and `Ask the Engine
· "INSTALL" · ASK & PLACE`. The typed branch of `command-bar.tsx:589–617` matches only documents
(by title/household), registry surfaces, people and utility rows — no phase, no section, no state.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-desk.png`, `w1440-cmdk-typed.png`; refs
`apps/designer-portal/src/components/document/command-bar.tsx:589–617`,
`apps/designer-portal/src/app/(document)/desk/page.tsx:339–370`.
already_ruled: — (known-open: "T2 install-as-label", canon digest §B).
Fix: add section/phase to each document row's `match` string and one `Everything in install`
grouping to the un-typed palette. Hesitation: 60s.

---

**U1-02** · `doc|1440|both|shelves-die-outside-project-section`
**Index, rooms and shelves vanish on install and care**
task_ids: T4, T5, T6, T15 · surface `/doc/[id]` · width all · flag both · severity **blocker** ·
confidence 0.97
Observation: on `w1440-doc-install.png` (Aspen Loft Refresh) and `w1440-doc-care.png` (Birch
Hollow) the spine reads, top to bottom: `← PUT DOWN`, seven marks, `Install` / `INSTALLATION`,
`● IN HAND / under a min / PAUSE + LOG`, `JUST YOU · VISIBLE TO THE STUDIO`. There is no
`IN THIS DOCUMENT` block and no `THE SHELVES` block — so `Plan room`, `Spec book`, `Mood boards`,
`Call sheet` and `Knowledge` are all absent, at every width, on the two stages where drawings,
specs, rosters and receiving matter most. `DocSpineShelvedBlocks` mounts only when
`row.engagement_kind === 'project' && row.active_section === 'project'`.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-doc-install.png`, `w1440-doc-care.png`, `w1440-doc-project-rich.png`;
refs `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:938–952`;
probe `07-room-lens-no-rooms.png` (independently confirms the install spine has no such blocks).
already_ruled: C8 (I136 ratifies the shelved spine at ≥1440; it does **not** ratify tying it to
one section — this is a mount condition, not a ruling).
Fix: mount the shelves block on every project document regardless of `active_section`, with
per-stage contents. Hesitation: 120s.

---

**U1-03** · `doc|all|both|spec-book-no-door-on-install`
**Spec book has no door on install or care**
task_ids: T4, T6 · surface `/doc/[id]` · width all · flag both · severity **blocker** ·
confidence 0.92
Observation: the `Spec book →` link is rendered inside `{mode === 'project' && …}`
(`ffe-section.tsx:1057–1065`); in `mode === 'install'` the head prints only the word `Install`
plus meta. There is no `spec book` entry in `STUDIO_ROOMS`/`LEDGERS`/`VERBS`, so `matchSurfaces`
cannot find it, and ⌘K has no spec-book row in either branch. With the shelves also gone
(U1-02), an install-stage document contains zero paths to its own spec book.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-doc-install.png`, `w1440-leaf-specbook-route.png`; refs
`apps/designer-portal/src/components/document/ffe-section.tsx:1030–1065`,
`apps/designer-portal/src/lib/document/registry.tsx:77–327`.
already_ruled: —
Fix: keep the `Spec book →` head link in install mode; add `spec book / specifications /
schedule` aliases to a registry entry. Hesitation: 90s.

---

**U1-04** · `doc|all|both|plan-room-vanishes-when-typed`
**The plan room disappears from ⌘K the moment she types "plan"**
task_ids: T6 · surface `/doc/[id]` · width all · flag both · severity **high** · confidence 0.93
Observation: `The plan room` · `this project · the current set` is pushed into the `This surface`
group **only in the empty-query branch** (`command-bar.tsx:562–572`), and carries `match: ''`.
The typed branch (`:589–617`) never re-adds the `This surface` rows and `matchSurfaces()` has no
plan-room entry — so typing the words `plan room` produces `No match — Browse the Help Center`.
`PlanRoomBand` exists in the tree (`plans/plan-room-band.tsx:80`) but is mounted nowhere.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-cmdk-open.png`, `w1440-cmdk-typed.png`, `w1440-leaf-plans-route.png`;
refs `command-bar.tsx:558–572`, `command-bar.tsx:589–617`, `lib/document/registry.tsx:344–351`.
already_ruled: —
Fix: give `The plan room` a real `match` string and include the `This surface` rows in the typed
filter. Hesitation: 45s.

---

**U1-05** · `doc|1280|both|no-board-door-below-1440`
**Boards have no door below 1440**
task_ids: T5 · surface `/doc/[id]` · width 1280 · flag both · severity **high** · confidence 0.9
Observation: `w1280-doc-project-rich.png` shows the whole left rail as a 56px column of seven
unlabelled marks plus `In hand / <1m`. The `Mood boards` shelf row does not exist there, and an
already-open shelf is force-closed on crossing below 1440 (`page.tsx:553–562`). At 390 the spine
sheet lists sections and `IN THE MARGIN · 3` only. The only remaining board doors are the Desk's
`Recent boards` strip (which renders nothing when there are no recent boards) and ⌘K by exact
board name — pure recall.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1280-doc-project-rich.png`, `m390-mobile-spine-sheet.png`,
`w1440-shelf-moodboards.png`; refs `doc-spine.tsx:135`, `doc/[id]/page.tsx:553–562`.
already_ruled: C8 (I136: index/rooms/shelves ≥1440 only), C9 (I139/Q1: boards live on the shelf
except the speccing stage).
Fix: print a `Boards · n` line in the FF&E head ledger at all widths — no new region, one entry.
Hesitation: 75s.

---

**U1-06** · `doc|1440|both|moodboard-leaf-opens-onto-a-fold`
**The mood-board shelf opens onto another fold**
task_ids: T5 · surface `/doc/[id]` · width 1440 · flag both · severity **medium** ·
confidence 0.85
Observation: clicking `Mood boards / NO BOARDS YET →` opens a 320px leaf headed
`MOOD BOARDS · SHARED & DRAFT / Mood boards / ✕ CLOSE` whose entire body is one more folded row:
`Mood boards   NO BOARDS YET   UNFOLD ↓`. Two acts to see a list; a third to open a board. The
Plan room and Spec book leaves print their contents directly.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-shelf-moodboards.png`, `w1440-shelf-planroom.png`,
`w1440-shelf-specbook.png`.
already_ruled: —
Fix: the leaf is already a disclosure; render the board list (or the empty line + `Start a board`)
unfolded inside it. Hesitation: 20s.

---

**U1-07** · `doc|1280|both|compact-tier-prints-no-section-name`
**At 1280 nothing on screen says which section she is in**
task_ids: T3, T10, T11 · surface `/doc/[id]` · width 1280 · flag both · severity **high** ·
confidence 0.95
Observation: at 1440 the spine prints `Project` / `ACTIVE` beneath the marks. That paragraph is
`className="mt-2.5 hidden min-[1440px]:block"` (`doc-spine.tsx:122–130`), and `StrataMark`'s
`label` becomes `aria-label` only (`strata-mark.tsx:81–82`) — so at 1180–1439 the seven marks are
silent bars and the section's name is printed nowhere. `w1280-spine-detail.png` shows the full
rail: an `←` glyph, seven bars, `In hand / <1m`. The word `Project` appears nowhere in the rail.
Why it blocks: both.
Evidence: shots `w1280-spine-detail.png`, `w1280-doc-project-rich.png`, `w1440-spine-detail.png`;
refs `components/document/doc-spine.tsx:122–130`, `components/document/strata-mark.tsx:81–82`.
already_ruled: —
Fix: print the active section's label + sub in the compact rail (rotated or two-line); it costs no
new mount. Hesitation: 30s.

---

**U1-08** · `all|all|both|three-room-nouns-collide`
**Three different things are called a "room"**
task_ids: T4, T5, T8 · surface `/desk` + `/doc/[id]` · width all · flag both · severity **high** ·
confidence 0.9
Observation: (a) the drawer's `The Rooms` (`g r`) opens `/rooms` — `THE ROOMS · 6 scanned rooms`,
cards titled by **person** (`Lily Tanaka` / `Kitchen · scanned Aug 24`, `→ THE DOCUMENT · BRIEF`),
i.e. LiDAR captures. (b) the spine's `Rooms` block lists a project's FF&E room groups and lifts a
room lens (`Take a room in hand · nothing hides`). (c) `/room/[id]/file` is a third surface, whose
route the shot ledger records returning `Cannot coerce the result to a single JSON object` on a
valid id. A designer asking "show me the living room" has three doors, one of which is a scan
gallery keyed to client names and one of which is a live dead-end.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-room-rooms.png`, `w1440-shelves-block.png`, `w1440-room-file-route.png`;
refs `lib/document/registry.tsx:106–119`, `components/document/spine-rooms-block.tsx:36–79`;
shot ledger Harness note §9.
already_ruled: C20 (one icon language / one name per surface — this is the same law applied to
nouns rather than icons).
Fix: rename the drawer entry to what it holds (`Scans`), keeping `rooms, scans, room view` as
aliases. Hesitation: 40s.

---

**U1-09** · `doc|all|both|two-regions-named-schedule`
**Two regions on one paper are both called "Schedule"**
task_ids: T10 · surface `/doc/[id]` · width all · flag both · severity **high** · confidence 0.95
Observation: on `w1440-doc-project-rich.png`, ~120px apart, the paper prints a fold seam
`Schedule … UNFOLD ↓` (the Rule, heading id `schedule-rule-title`, fold key `schedule-rule`) and
then a region head `Schedule / 0 phases · nothing active · next milestone —  FOLD ↑` (the ledger,
heading id `project-schedule-title`, fold key `schedule`). They fold independently into separate
localStorage keys. The running index carries exactly one row, `Schedule / NOT SCHEDULED`, wired to
`project-schedule-title` — so the Rule is reachable from the index never.
Why it blocks: both.
Evidence: shot `w1440-doc-project-rich.png`; refs
`components/document/schedule/schedule-rule-region.tsx:46–47`,
`components/document/schedule/schedule-spine.tsx:765`, `lib/document/document-index.ts:34–55`.
already_ruled: C11 (I137: the index is derived from mount order — it is; the paper simply mounts
two regions under one name).
Fix: name the Rule for what it is (`Phase dates`) and leave `Schedule` to the ledger.
Hesitation: 50s.

---

**U1-10** · `doc|1440|both|index-scent-contradicts-region`
**The index says "no authority yet" over $14,420 in motion**
task_ids: T9 · surface `/doc/[id]` · width 1440 · flag both · severity **high** · confidence 0.9
Observation: the running index row reads `Design authority / NO AUTHORITY YET`. Unfolding the same
region prints `Moved · $14,420 in motion — ordered through installed` and an accounts band
`The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. The index's label
carries no money word at all (the region's own eyebrow `MONEY · ONE REGION` is not projected into
the index), and its status line reports the one tier that is empty.
Why it blocks: obvious-how-to-get-there — she reads the index and skips the region.
Evidence: shots `w1440-doc-project-rich.png`, `w1440-money-region.png`, `w1440-record-foot.png`;
refs `components/document/spine-shelved-blocks.tsx:109–115`,
`components/document/commercial/money-region.tsx:295–336`.
already_ruled: —
Fix: index value falls back to the strongest non-empty tier (`$14,420 committed`), and the row
label pairs the studio word with the trade word. Hesitation: 35s.

---

**U1-11** · `doc|1440|both|knowledge-shelf-is-a-duplicate-door`
**A shelf slot is spent forwarding to the Library**
task_ids: T5, T6 · surface `/doc/[id]` · width 1440 · flag both · severity **medium** ·
confidence 0.9
Observation: `Knowledge / STUDIO LIBRARY →` opens a leaf reading `STUDIO LIBRARY ·
CROSS-PROJECT` / `Knowledge` / `STUDIO LIBRARY — CROSS-PROJECT STANDARDS. NOTHING FILED FOR THIS
PROJECT.` / `OPEN THE STUDIO LIBRARY →`. It cannot hold anything (no filing act anywhere) and its
only exit is `/library`, which the drawer already carries at one act from every screen. One of the
document's five reference slots is a slower copy of a permanent door.
Why it blocks: obvious-what-to-do.
Evidence: shot `w1440-shelf-knowledge.png`; refs `lib/document/shelves.ts:62–68`,
`components/document/shelves/` leaf.
already_ruled: — (known-open: "Knowledge names a non-existent surface", canon digest §B).
Fix: retire the slot and give it to Boards, which currently has no ≥1440 non-speccing home
outside its own shelf. Hesitation: 25s.

---

**U1-12** · `doc|all|both|message-the-client-with-no-client`
**"Message the client" leads the letterhead on a doc with no client**
task_ids: T16 · surface `/doc/[id]` · width all · flag both · severity **high** · confidence 0.93
Observation: Chen Residence prints, in order: title, `No client linked — attach one ↗`, then the
letterhead ledger `MESSAGE THE CLIENT · PREVIEW AS THE CLIENT · SHARING · MILESTONES · CALL SHEET
· 0` with `MESSAGE THE CLIENT` scored as the inked leader. `canSendNote = Boolean(projectId ||
clientProfileId)` — it never consults whether a client exists — and the composer's own caption
reads `It lands in {client}'s portal messages.`
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-doc-project-rich.png`, `m390-doc-project-rich.png`; refs
`components/document/letterhead-instruments.tsx:293–331`,
`components/document/household-chip.tsx:57–65`.
already_ruled: C18 (R7: "stamps only say true things" — the same law, applied to acts).
Fix: when no client is linked, the leader becomes `Attach a client`. Hesitation: 30s.

---

**U1-13** · `doc|390|both|mobile-bar-advertises-wrong-act`
**At 390 the bar's one big act is not the document's need**
task_ids: T3 · surface `/doc/[id]` · width 390 · flag both · severity **high** · confidence 0.9
Observation: on Chen at 390 the bar reads `IN THIS DOCUMENT / Project` · **`MESSAGE THE CLI…`** ·
`··· MORE`, while the paper's red-letter zone says `NEEDS ATTENTION · IN ONE PLACE / Name the
phases for this project / OPEN THE SCHEDULE`. Only `document-guide.tsx:52` registers a
`useMobilePrimaryAction`; `red-letter-zone.tsx` registers none, so on every project document that
shows the red letter the guide's act is absent from the bar and a lower-priority letterhead act
claims the slot — truncated at that.
Why it blocks: obvious-what-to-do.
Evidence: shots `m390-mobile-bar.png`, `m390-doc-project-rich.png`; refs
`components/document/red-letter-zone.tsx:23–70`, `components/document/document-guide.tsx:52–64`,
`components/document/letterhead-instruments.tsx:303–312`.
already_ruled: C7 (I135's one-leader contract — the zone is a region with a ledger and no mobile
registration).
Fix: register the red letter's first row as the mobile primary at the guide's priority.
Hesitation: 40s.

---

**U1-14** · `desk|all|both|call-sheet-unreachable-from-desk`
**The roster cannot be reached from the Desk at all**
task_ids: T15 · surface `/desk` · width all · flag both · severity **high** · confidence 0.95
Observation: `Call sheet` is `scope: 'document'` and is filtered out of the Desk's Contents
(`desk-contents.tsx:141–143`), out of ⌘K's unfiltered `Rooms & ledgers` group
(`command-bar.tsx:580`), and out of typed ⌘K results unless a project document is already in hand
**and** the `call-sheet` flag is on (`command-bar.tsx:610–615`). The Desk's `THE STUDIO` contents
print `ROOMS: Library · People · The Rooms` — `People` is the studio directory, not this job's
roster. With the flag off the shelf row is absent rather than empty, so "nobody is on this job"
and "this feature is off" are the same picture.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-desk.png`, `w1440-shelves-block.png`; refs
`components/document/desk-contents.tsx:141–143`, `components/document/command-bar.tsx:580,
610–615`, `lib/document/shelves.ts:55–61`.
already_ruled: C15 (R95: Contents = labels + doorways only — this is about which doorways exist,
not their treatment).
Fix: keep the shelf row present-and-empty when the flag is off (`Nobody on it yet`), and add a
per-folio roster glance to the Desk. Hesitation: 60s.

---

**U1-15** · `all|all|both|chords-are-invisible`
**The seven chords are printed nowhere; `/` and `?` are dead**
task_ids: T9, T11, T13, T16 · surface `/desk` + `/doc/[id]` · width all · flag both ·
severity **medium** · confidence 0.95
Observation: `g l`, `g p`, `g r`, `g o`, `g a`, `g h`, `g t` all work (probe §3) and are the only
one-act paths to the seven global surfaces. A regex sweep of both pages' visible text found no
chord hint anywhere; ⌘K prints its own `⌘K` badge next to `FIND ANYTHING`, and prints chord badges
inside the palette — which she must open with ⌘K to see. `/` and `?` register no handler at all.
Why it blocks: obvious-how-to-get-there (pure recall).
Evidence: probe `03-chords-desk-final.png`, probe §3; shots `w1440-desk.png`,
`w1440-drawer-strip.png`; refs `components/document/registry-shortcuts.tsx:42–47`,
`components/document/command-bar.tsx:766–768`.
already_ruled: —
Fix: print the chord as a mono suffix on each Desk Contents row (`Orders   g o`) — labels only,
no counts, so R95 holds. Hesitation: 0s (she never learns them).

---

**U1-16** · `all|1440|both|cmdk-doorways-below-the-fold`
**⌘K opens on Recent and Begin; the doorways are below the fold**
task_ids: T6, T9, T13, T15 · surface `/desk` + `/doc/[id]` · width all · flag both ·
severity **medium** · confidence 0.85
Observation: `w1440-cmdk-open.png` shows the whole visible palette: `RECENT` (Birch, Aspen,
Aspen) then `BEGIN` (`Capture a lead`, `Open a project`, `Draft a design agreement`, `Draw an
invoice`, `Add a maker`) — and the panel ends there. `This surface`, `Rooms & ledgers` and
`Studio` are pushed off-screen, which is where `The plan room`, `Open the call sheet` and the seven
chorded surfaces live. The one group whose rows she cannot re-find by typing (U1-04) is the group
she cannot see.
Why it blocks: obvious-how-to-get-there.
Evidence: shot `w1440-cmdk-open.png`; refs `components/document/command-bar.tsx:496–583`.
already_ruled: —
Fix: order `This surface` above `Recent` when a document is in hand. Hesitation: 25s.

---

**U1-17** · `desk|all|both|contents-carries-no-scent`
**Desk Contents names doors without saying what is behind them**
task_ids: T13, T14, T9 · surface `/desk` · width all · flag both · severity **medium** ·
confidence 0.85
Observation: the contents block prints `THE STUDIO` over three columns — `ROOMS: Library ↗ /
People ↗ / The Rooms ↗`, `LEDGERS: Orders SHEET / Accounts SHEET / Hours SHEET / The Post SHEET`,
`BEGIN: Open a project / Draft a design agreement / Draw an invoice / Add a maker`. The word
`SHEET` is the only sub-label, and it describes the presentation, not the contents. Nothing here
says that receiving, damage claims and vendor acknowledgement live under `Orders`, or that
receivables live under `Accounts`. That is the whole of T13/T14's scent from a cold start.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-desk.png`, `m390-desk.png`, `w1440-ledger-sheet-orders.png`; refs
`components/document/desk-contents.tsx:183–236`.
already_ruled: C15 (R95 forbids counts/tiles/metrics — a static sub-label is neither).
Fix: give each ledger row the registry `subLabel` it already carries in ⌘K
(`Orders · POs, receiving, vendors`). Hesitation: 45s.

---

**U1-18** · `desk|all|both|artifacts-need-a-document-open-first`
**Every project artifact is behind opening the document first**
task_ids: T5, T6, T15 · surface `/desk` · width all · flag both · severity **medium** ·
confidence 0.9
Observation: the reachability inventory records that the Call Sheet, the Drafting Room's direct
route, the plan room, the spec book and every shelf leaf are "reachable **only** from an open
document". From `/desk`, "pull up the primary bedroom board" is: open the folio (1) → find the
shelf (2) → unfold (3) → the board (4), and only at ≥1440 on a project-section document. There is
no artifact-first path anywhere in the product.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-desk.png`, `w1440-cmdk-open.png`; refs anatomy §7 "Surfaces reachable only
from an open document"; `lib/document/registry.tsx:128, 236`.
already_ruled: C1 (D1 forbids split views — it does not forbid a Desk door that opens a document
scrolled to an artifact).
Fix: let a Desk folio's ledger act deep-link to a region/artifact (`need.deepLink` already does
this for needs). Hesitation: 40s.

---

**U1-19** · `desk|all|both|needs-count-exceeds-what-is-shown`
**"Needs your hand 8" prints over four folios**
task_ids: T1 · surface `/desk` · width all · flag both · severity **medium** · confidence 0.95
Observation: the eyebrow reads `NEEDS YOUR HAND  8`; four folio cards render; the footer reads
`4 IN REACH · 4 FOLDED BELOW` on the left and `REVEAL 4 MORE FOLIOS ↓` on the right. The count and
the visible set disagree, and the reconciliation is printed in 9px mono at the bottom-left of the
block, opposite the control that fixes it.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-desk.png`, `w1280-desk.png`, `m390-desk.png`; refs
`components/document/desk/page.tsx:339–341`, `components/document/folder-card.tsx:104–134`.
already_ruled: —
Fix: put the count and the reveal on the same line, or fold to eight when eight is the count.
Hesitation: 20s.

---

**U1-20** · `desk|all|both|pulse-is-folded-and-generic`
**Studio pulse is folded by default and says nothing locating**
task_ids: T1, T2 · surface `/desk` · width all · flag both · severity **medium** ·
confidence 0.85
Observation: below the folios: `STUDIO PULSE` / `4 moving · 3 reconnecting · Field quiet` /
`1 decision is overdue, and 4 pieces are on the way.` / `7 STUDIO ITEMS   OPEN PULSE ↓`. No
project name, no phase, no due date — the one cross-project organ on the Desk is a folded
adjective. It is the closest thing the product has to an answer for T2 and it names nothing.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-desk.png`, `m390-desk.png`; refs
`components/document/studio-pulse.tsx:60–101, 232`.
already_ruled: —
Fix: print the two most time-sensitive items by name in the folded state. Hesitation: 30s.

---

**U1-21** · `doc|all|both|ffe-line-has-no-editable-spec`
**The FF&E line she must edit is not editable on the paper**
task_ids: T4 · surface `/doc/[id]` · width all · flag both · severity **high** · confidence 0.85
Observation: an FF&E line prints `Møbler Lounge Chair — Bouclé · ×2 / Nordic Atelier` ·
`IN PRODUCTION` · `$5,700` and nothing else. The fields T4 names live in the Spec Book route:
`Sku / Finish / Material / Color Fabric / Selected Dimensions / Exact Location`, all
`Not specified`. The Spec Book is a full-screen room (`← CHEN RESIDENCE` back link) — entering it
puts the document down per D14, and the return trip restores neither scroll position nor fold
state. So "change the fabric on the living room sofa" is: scroll to FF&E → `SPEC BOOK →` →
find the item → edit → walk back.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-doc-project-rich.png`, `w1440-leaf-specbook-route.png`; refs
`components/document/ffe-section.tsx:1009–1015`.
already_ruled: C1/D14 (the Room-vs-Sheet weight is ruled; the round-trip cost is not).
Fix: the row's always-visible `···` overflow gains `Specify…`, opening the spec fields as a sheet
over the document rather than a room. Hesitation: 90s.

---

**U1-22** · `doc|all|both|three-add-a-room-verbs`
**Three different "add a room" verbs mean three different things**
task_ids: T8, T4 · surface `/doc/[id]` · width all · flag both · severity **medium** ·
confidence 0.8
Observation: flag-off, `ADD A ROOM` prints at the foot of the FF&E room list (adds an FF&E group).
Flag-on, the Speccing table's rail prints `ROOMS  All  + Add a room` at the top of the paper (adds
a room to the scheme). `/rooms` is a gallery of scanned rooms with no add verb at all. Two of the
three sit on documents she moves between in one week, in opposite corners of the page, with the
same words.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-doc-project-rich.png`, `wt-speccing-1440.png`, `w1440-room-rooms.png`.
already_ruled: C12 (I137 SP4 rules where the FF&E one lives — not that a second may share its
wording).
Fix: the Speccing rail's verb becomes `+ Room to the scheme`. Hesitation: 25s.

---

**U1-23** · `doc|all|both|receivables-have-no-home-on-the-paper`
**"Who still owes me" is unanswerable inside the document**
task_ids: T9 · surface `/doc/[id]` · width all · flag both · severity **high** · confidence 0.9
Observation: the money region's four tiers are `Authority · what the client has agreed to fund`,
`Plan · what the plan intends to spend`, `Committed · what is contractually owed`, `Moved · the
accounts' committed figure`. None of them is invoiced-vs-paid. The accounts band prints
`$0 BUDGET · $14,420 COMMITTED · 20% MARGIN` — still no outstanding. Receivables exist only in
the Accounts sheet (`g a`, or drawer → `Studio books` → `Accounts`), a studio-wide overlay.
Meanwhile *billing* has three doors on the same page (`DRAW AN INVOICE`, `BILL 3 UNINVOICED`, ⌘K
`Draw an invoice for {Project}`).
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-money-region.png`, `w1440-record-foot.png`, `w1440-drawer-books.png`;
refs `components/document/commercial/money-region.tsx:308–336`.
already_ruled: — (adjacent known-open: "money doesn't seam on install/care", I141).
Fix: add one `Outstanding · $X · N days` line to the money head status, linking to the Accounts
sheet scoped to this project. Hesitation: 60s.

---

**U1-24** · `doc|all|both|care-spread-titles-itself-install`
**The Care spread's schedule heading says "Install"**
task_ids: T4, T6 · surface `/doc/[id]` · width all · flag both · severity **medium** ·
confidence 0.95
Observation: on Birch Hollow (`care`, book closed Aug 25) the paper prints, in this order:
`Care` / `The book closed Aug 25.` / `REQUEST CLIENT REVIEW`, then a heading reading **`Install`**,
then `Plan the care work`, then `No FF&E lines are scheduled for installation.` The heading is
derived from `mode` alone (`ffe-section.tsx:1030–1037`), never `sectionKey`; the body one component
over reads `sectionKey` correctly. Label↔content correspondence fails inside four lines of itself.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-doc-care.png`, `wt-delivery-care-1440.png`; refs
`components/document/ffe-section.tsx:1030–1037`,
`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1438–1448`.
already_ruled: C18 (R7 truth device).
Fix: heading reads `sectionKey`, as the body already does. Hesitation: 15s.

---

**U1-25** · `doc|all|on|worktable-changes-no-reach`
**The Worktable moves no item-reach cell**
task_ids: T4, T5, T6, T15 · surface `/doc/[id]` · width all · flag **on** · severity **high** ·
confidence 0.9
Observation: `wt-delivery-project-1440.png` and `w1440-doc-project-rich.png` are door-for-door
identical: same spine, same `IN THIS DOCUMENT` four rows, same five shelves, same FF&E ledger,
same `ADD A ROOM`. The Delivery table adds nothing reachable that flag-off lacks (the release lift
never appears; the money seam is the same seam). The two real gains are elsewhere: Intake's three
forward seams (U1-26) and Finalize's `The client's copy` shelf on a proposal document — the first
time a non-project document carries a shelves block at all. If the Worktable is the destination
(C14), the destination as built does not answer T2, T5, T6 or T15.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `wt-delivery-project-1440.png`, `wt-delivery-install-1440.png`,
`wt-finalize-1440.png`, `w1440-doc-project-rich.png`; refs shot ledger "Flag-on (Worktable)".
already_ruled: C14 (Worktable is the destination — cited, not contested).
Fix: for whichever lane builds toward the Worktable, put the shelves fix (U1-02) inside the table
composition rather than beside it. Hesitation: n/a (a strategy finding).

---

**U1-26** · `doc|all|on|intake-seams-are-the-model-for-absence`
**Intake's "opens when…" seams are the right answer, applied to the wrong stages**
task_ids: T3, T6 · surface `/doc/[id]` · width all · flag **on** · severity **medium** ·
confidence 0.88
Observation: flag-on, the brief document ends with three inert rows: `Schedule  OPENS WHEN THE
PROJECT BEGINS`, `Project · FF&E  OPENS WITH THE DIRECTION`, `Design authority  OPENS WHEN THE
PROJECT BEGINS`. That is exactly the device the install and care spreads need and do not have —
those stages lose regions and shelves silently (U1-02), with no line saying where the spec book
went. The pattern exists, ships, and is pointed only at the stage where nothing is missing yet.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `wt-intake-1440.png`, `w1440-doc-install.png`, `w1440-doc-care.png`.
already_ruled: —
Fix: reuse `IntakeFutureSeams`' grammar for what a stage has *closed* — `Project · FF&E · moved to
the spec book →`. Hesitation: 20s.

---

**U1-27** · `doc|1440|both|shelf-leaf-reflows-the-paper`
**Opening a shelf re-wraps the paper she was reading**
task_ids: T5, T6 · surface `/doc/[id]` · width 1440 · flag both · severity **low** ·
confidence 0.8
Observation: with the Knowledge or Mood boards leaf open, the paper's own headings rewrap —
`Project · FF&E` becomes `Project ·` / `FF&E`, `1 group · 3 lines` truncates to `1 group · 3 li…`
The reference leaf is declared non-modal (paper stays live behind it), but the reading position
visibly moves under it.
Why it blocks: obvious-how-to-get-there.
Evidence: shots `w1440-shelf-knowledge.png`, `w1440-shelf-moodboards.png` vs
`w1440-shelves-block.png`; refs `components/document/shelves/shelf-panel.tsx:94`.
already_ruled: C8 / C1 (I136 exempts reference material from D1's split-view ban).
Fix: the leaf overlays without narrowing the paper's measure. Hesitation: 10s.

---

**U1-28** · `doc|all|both|mark-count-changes-per-document`
**The progress row's denominator changes between documents**
task_ids: T3, T11 · surface `/doc/[id]` · width all · flag both · severity **low** ·
confidence 0.65
Observation: the spine's mark row prints seven marks on a project document and four on the sent
proposal (`w1440-doc-proposal-sent.png`), six on the brief. Since the marks carry no visible
labels at any width (U1-07) and no ordinal, the same visual device reads as a different scale on
each document she picks up in a morning. What would settle this: a per-document count of
`sections` returned by `deriveSections` across all seven ladder states.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-doc-proposal-sent.png`, `w1440-doc-brief.png`, `w1440-spine-detail.png`.
already_ruled: —
Fix: print all seven marks always, greying the ones this engagement kind will never reach.
Hesitation: 15s.

---

**U1-29** · `all|390|both|post-count-only-on-mobile`
**"3 NEW" appears on mobile and nowhere else**
task_ids: T16 · surface `/doc/[id]` · width 390 · flag both · severity **low** · confidence 0.9
Observation: the 390 `More` menu prints `The Post   3 NEW`; the ≥1180 drawer prints `THE POST`
with an unlabelled dot. The same object reports a count at one width and a state at another.
Why it blocks: obvious-what-to-do.
Evidence: shots `m390-mobile-more-actions.png`, `w1440-drawer-strip.png`; refs
`components/document/mobile/mobile-bar.tsx:299–302`, `components/document/studio-drawer.tsx:486`.
already_ruled: C4 (D8: "no badges, no pulsing counts" — the mobile row breaks it, the drawer
keeps it).
Fix: pick one. Hesitation: 5s.

---

**U1-30** · `doc|all|both|no-desk-signal-for-a-sent-unopened-proposal`
**A sent, unopened proposal is invisible on the Desk**
task_ids: T7 · surface `/desk` · width all · flag both · severity **medium** · confidence 0.7
Observation: Aspen Loft — Living Room Refresh was sent Aug 24 and shows `OPENED not yet` in the
document. On the Desk it appears in neither of the four visible folios; the visible proposal folio
is `SAMPLE · PROPOSAL / Signed — open the project`. The sent-state and its age are legible only
after she opens that specific document — which is exactly the trip T7 says she should not have to
make. What would settle this: the `hesitating_proposal` need's age threshold in
`desk-derivation`.
Why it blocks: obvious-what-to-do.
Evidence: shots `w1440-desk.png`, `w1440-doc-proposal-sent.png`, `w1440-guide-proposal-sent.png`;
refs `lib/document/document-guide.ts:208–245`.
already_ruled: C13 (I137 SP3 rules the send-wall line's home — inside the document).
Fix: print `sent · N days · not opened` on the proposal folio's stage line. Hesitation: 45s.

---

## 4. Answers to the U1 brief questions

**(1) The reachability graph, act-counted.** Two hubs, no cross-links.

*From `/desk`* — 1 act: any folio → its document; `Library` / `People` / `The Rooms`; `Orders` /
`Accounts` / `Hours` / `The Post` (Contents rows); the four `BEGIN` verbs; `Capture a lead`;
`Recent boards` row (when one exists); the account nameplate. 2 acts: drawer `Studio books` → a
book; `Open pulse` → a pulse row; every ⌘K destination. **⌘K-only (pure recall):** the Drafting
Room, Help Center, contextual `Help…`, the walkthrough, Interruptions, a person deep link, Ask the
Engine. **Unreachable from the Desk at any act count:** the Call Sheet, any plan room, any spec
book, any shelf leaf.

*From an open project document at ≥1440 with `active_section='project'`* — 1 act: a section (spine
mark), a region (index row), a room lens, any of the five shelves, the guide/red-letter act, the
household sheet, every letterhead instrument, every region-head ledger entry, the colophon acts,
`+ Decision` / `+ Note`, `← Put down`. 2 acts: a folio file; a settled record; `Archive`; a margin
draft; anything in ⌘K.

*Cells over 2 acts, or off the graph entirely:*

| Item | ≥1440 project-section | 1280 | 390 | install / care, any width |
|---|---|---|---|---|
| Rooms | 1 (spine block; absent at 0 rooms) | **none** | **none** | **none** |
| Products (FF&E line) | 1 | 2 (scroll) | 2 (scroll) | 2 |
| Product's editable spec | 3 (→ Spec Book room) | 3 | 3 | **none** (U1-03) |
| Boards | 3 (shelf → unfold → board) | **none** | **none** | **none** |
| Plan room | 1 (shelf) | 2, ⌘K-only, un-typed | **none** (no ⌘K) | 2, ⌘K-only |
| Spec book | 1 (shelf or head link) | 1 (head link) | 1 (head link) | **none** |
| Money | 1 | 2 | 2 | 1 (accounts band only) |
| Schedule | 1 (but two regions, U1-09) | 2 | 2 | 2 |
| People / roster | 1 (flagged) | 1 (flagged) | 1 (flagged) | 1 (flagged) |

**(2) The noun collisions.** Two cost a wrong turn every time. *Room*: the drawer's `The Rooms`
opens a gallery of LiDAR scans titled by **client name** (`Lily Tanaka / Kitchen`), while the word
"room" in her mouth means an FF&E group (`Living room`) which lives only in the spine block, and
`/room/[id]/file` is a third surface that currently errors. *Board*: `Mood boards` shelf (≥1440,
project section), the Speccing table's `BOARDS / START A BOARD` strip (direction stage only,
flag-on), and the Desk's `Recent boards` strip (empty until there is a recent one). Three doors,
none of which is open at the same time as either other. A fourth, quieter collision: the Library
room's own copy reads "The **shelves** are your eye" — a second meaning for the document's
`THE SHELVES`.

**(3) Does anything carry scent toward money?** Inside the unfolded region, yes — barely: the
eyebrow `MONEY · ONE REGION` sits above `Design authority`, and the folded seam appends
`$0 COMMITTED`. Everywhere it matters, no: the running index row is `Design authority /
NO AUTHORITY YET` with no money word and a status that reports the one empty tier over a region
holding `$14,420 in motion` (U1-10). Nothing anywhere in the document carries scent toward
*receivables* — the tier she actually asks for (U1-23).

**(4) What a dead shelf costs.** `Knowledge` is not literally dead — it forwards to
`OPEN THE STUDIO LIBRARY →`. That is worse than dead for wayfinding: it teaches that a shelf row
may be a redirect rather than a container, which makes the other four rows' promises weaker, and it
spends one of five reference slots on a door the drawer already carries permanently at one act
(U1-11). The direct cost is one slot; the indirect cost is that `Plan room / NOTHING FILED` and
`Mood boards / NO BOARDS YET` now read as possibly-also-redirects.

**(5) Correct home for cross-project questions (T2).** Not a lens, and not a new tier. It belongs
on **the Desk**, because the Desk is already the cross-project surface and D1 does not reach it —
a lens over an open document would either break strict focus or answer about one job. Concretely:
make the Desk's `Needs your hand` block groupable by the folder tab's own second word
(`INSTALL`, `PROJECT`, `BRIEF`) and make section/phase searchable in ⌘K's typed branch. A separate
fleet tier is the Lane-B answer and costs a doctrine amendment; the grouping is Lane A and costs a
sort.

**(6) Is Desk Contents doing wayfinding work?** Partly. It does the *inventory* job — after one
reading she knows the studio has three rooms, four ledgers and four begin-verbs, and it survives
to 390 intact, which the document does not. It does not do the *scent* job: `Orders / SHEET` tells
her nothing about receiving or damage claims, and R95's constraint (labels + doorway glyphs, never
counts/tiles/metrics) does not forbid the static sub-labels the same rows already carry in ⌘K
(U1-17). Its worst omission is silent: the Drafting Room and the Call Sheet are deliberately
excluded, so Contents reads as complete when it is not (U1-14, U1-18).

**(7) ⌘K-only surfaces (pure recall).** From the Desk: the Drafting Room, `Browse the Help
Center`, `Help…`, `Take the walkthrough`, `Interruptions`, a person deep link, `Ask the Engine`.
From an open document, additionally: **`The plan room`** (below 1440 its only door), and
`Add a change` on install/care spreads. Two aggravations make these worse than ordinary recall:
the `This surface` group sits below ⌘K's opening fold (U1-16), and its rows carry `match: ''` so
they vanish the instant she types the surface's own name (U1-04). And at 390 there is no ⌘K at
all — every recall-only door is simply gone.

---

## 5. What stays true — do not break these

1. **`← PUT DOWN` / Esc / folio is the cleanest loop in the product.** The Esc chain is strict LIFO
   (⌘K → shelf → put-down, probe §2), the trip home is one act from anywhere, and T11 scores 5/5.
   Everything else should be measured against this.
2. **The running index's scroll-spy is exact.** Eleven scroll samples, exactly one
   `aria-current="true"` at every one, no gaps, no doubles (probe §4) — and clicking a row for a
   *folded* region both unfolds and scrolls (probe §5b). The index's mechanics are right; only its
   labels and mount condition are wrong.
3. **The send wall answers T7 completely.** `SENT YESTERDAY — NUDGE CLIENT USER` above
   `SENT Aug 24 / OPENED not yet / READING — / MOST READ —`, one nudge, printed once. This is the
   model for every other "what is the state and what do I do" line on the surface.
4. **`ADD A ROOM` in flow at the foot of the room list.** Unhidden, unhoverable, exactly where the
   list ends (I137 SP4). Found first pass. Keep it there and make the other add-verbs defer to it.
5. **Nothing is hover-gated.** Probe §1 checked fold buttons, colophon acts, spine marks and margin
   rows: opacity 1 → 1 on every one. The doctrine holds in the built product.
6. **The two Begin verbs disambiguate themselves.** `Capture a lead · begin a Brief` vs
   `Open a project · no proposal needed` — the sub-label does the work before the click, which is
   the pattern the shelf rows, the ledger rows and Desk Contents all need and mostly lack.
