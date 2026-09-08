# Current state — the two portals, as built

Verified ground truth for the portal polish review: what the designer portal
("The Document") and client portal ("The Threshold") actually render, the
primitives they're built from, the tokens in force, and the rulings behind
them. Sections 1–6 are read before the panel forms findings; §7 (governance)
and §8 (known rough edges) only afterward, per the panel brief.

## 1. What the two portals are

**The designer portal's landing surface is the Desk, at `/desk`** — the front
page of what the codebase calls The Document. A signed-in designer sees one
continuous page: a Playfair greeting ("Good morning, Leah"), the date, three
acts (Capture a lead / Open a project / Find anything ⌘K), then one roster of
every live job the studio carries, grouped by stage — Brief, Discovery,
Direction, Proposal, Project, Install, Care (folded into Install's colour).
There is no dashboard and no separate projects list. The repo's own mockups
and QA runs use a real-load fixture: designer Leah Hartwell, "Good morning,
Leah," a roster reading "EVERY JOB · 16 LIVE · 1 OVERDUE," grouped by the same
seven stages (`artifacts/document-life-directions-2026-08-28/research/01-shot-ledger.md:29`).

**The client portal's single house page is the Threshold** — a homeowner
lands on one page for her project, no header, no nav, no other pages to click
into (`docs/design/the-document/DECISIONS.md` R135). The repo's fixture:
homeowner Nora Ellison, project "Cedar Lane Study," designed by Leah Hartwell
out of "Local Dev Studio" (`supabase/seed/the-client-page.sql:349-350,408,447`).
The page composes a doorplate, a doorstep sentence naming what's owed, "doors"
and "walls" for standing approvals, room bands showing what's arrived, a
letterbox for invoices, a studio note, a "previously" record, and a mat with
people, papers, and the way out.

**A homeowner without an account who receives an invoice** sees a narrower
front door: `letterbox-door.tsx`, the letterbox component standing in for the
whole page. A studio invoice can reach a household with no project on the
platform at all — a consultation, a retainer — and the full Threshold has
nothing to show such a person: "the front door becomes the letterbox itself…
No header and no nav (R135): every act she has is on this page"
(`apps/client-portal/src/components/threshold/letterbox-door.tsx:47-49`). The
same file carries the household's first-ever paper — a design-services
agreement with no project attached yet, the "ORIGIN agreement" (`:51-56`).

## 2. Desk composition, top to bottom

`apps/designer-portal/src/app/(document)/desk/page.tsx` opens with its own
design intent: "Date + the ⌘K affordance are the only chrome. One roster of
every live job, grouped by stage, carries the whole studio; nothing folds on
first paint. No metric tiles, badges, feeds, or dashboard furniture"
(`desk/page.tsx:4-7`).

**Header (`:229-306`).** A time-derived greeting in Playfair with the
designer's first name in Playfair italic (`:235-249`); a DM Mono date line
(`:250-252`); an action group of Capture a lead (primary, "＋"), Open a
project (secondary, "＋"), and Find anything (tertiary, `⌘K` kbd chip)
(`:254-305`). The two capture/open acts print a DM-Mono sub-label pulled from
the same registry ⌘K reads, so header, Studio index, and ⌘K never drift
(`:53-61`, `:269-273`).

**First-touch notes.** A `MarginNote` states the Desk's purpose once: "This is
your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds
anything by name — try 'invoice'" (`:358-364`) — appears once, recedes on
dismissal or first ⌘K use. Conditional notes below it offer a walkthrough
tour, a new-hire handoff note, and a studio-setup whisper (`:370-417`).

**DeskRoster** (`components/document/desk-roster.tsx`) is the Desk's one
population: "The density rule is the whole design: one line per job, wrapping
to two or three; never a card; headings never fold; nothing folded on first
paint" (`:9-11`). Each stage group is headed by "a small plate, not a band"
(`:188`) — the stage name and count in white DM Mono caps on a saturated stage
pigment (`:34-44`, `:190-198`). Below it, one `<li>` `JobLine` per job: a 7×7px
mark dot (clay/terracotta for quiet vs. urgent need, never a badge,
`:25-30,96-107`), the job's Playfair name as a link, a muted state sentence
with an optional terracotta overdue line, and a right-aligned secondary
`DocumentAction` (`:85-155`). A row-hover wash sweeps a warm tint from the
pointer's contact point under the row (`:83,95`).

**RecentBoardsStrip** (`components/document/recent-boards-strip.tsx`), after
the roster: a horizontally scrolling row of up to 8 mood-board cards, 190px
wide × 148px cover art (`:39,50,57`). It returns `null` outright once its
query resolves empty or errors (`:21`) — a boardless studio sees no seam.

**DeskContents** (`components/document/desk-contents.tsx`), the Studio index:
"Book-style front matter, not a dashboard: three columns of labels and
doorways, and nothing else. No counts, no tiles, no cards, no metrics — R95 is
strict about this" (`:4-9`). Three columns — Rooms, Ledgers, Begin — each a
plain list of one-liners: icon, Playfair label, dotted leader (rooms/ledgers)
to a doorway glyph, optional DM-Mono sub-label (`:56-158`). Verbs lead with an
em-dash instead of a leader, "because they begin, they don't open a shelf"
(`:79-80`). On a quiet Desk (zero live jobs) this block rises above the
roster at larger type (`desk/page.tsx:224-227,445-453`). The registry feeding
all three columns (`lib/document/registry.tsx`) is "DATA ONLY: no component
imports, no event handlers, no `window` access, no React" (`:14-15`), so the
header, drawer, and ⌘K never drift apart.

## 3. Threshold composition, top to bottom

`apps/client-portal/src/components/threshold/threshold.tsx` states the page's
central discipline: "ABSENCE IS SILENCE… A region with nothing to say renders
nothing — never an empty-state card, never a zero, never an error string. A
client must not watch an ask appear and then vanish, so the doorstep's
sentence is null until the queries have all answered" (`:107-111`).

**Doorplate**, at the top: studio name, project location/name, phase, month,
and who it's prepared for (`:1193-1201`). **Body** then branches three ways
(`:1213-1338`): pending, a quiet doorstep and blank hold region; a settled
house with no rooms, a compact `GroundFloor`; otherwise the full house — a
sticky 170px `StoryPole` rail (collapsing to six dots under 860px), the
doorstep, standing asks, a `PlanKey` floor-plan summary, one `RoomBand` per
room, a road of orders, the studio's note, "Previously," and the mat.

**RoomBand** (`room-band.tsx`) draws each room as a generated section, not a
photo: "THE DRAWING IS GENERATED, NOT ILLUSTRATED. Nothing about the room's
real geometry reaches the client portal… A floor line, a wall line, and one
footprint per piece — dashed while still on its way, drawn once it stands in
the room" (`:26-30`). Each piece renders as a `TrackingRow`
(`instruments/tracking-row.tsx`): a 64×64px thumbnail (`h-16 w-16`, `:109`),
name and price, a six-stop micro-spine, a rotated inspection stamp. On the
image: "Null draws a quiet placeholder block, not a gap — and so does a URL
that fails to load, because a browser's broken-image glyph is the one mark on
this page nobody chose to put there" (`:66-70`); the placeholder is a bare
bordered block, no icon (`:112-117`).

**StoryPole** (`story-pole.tsx`): a carpenter's story-pole device — phases are
struck once and never re-marked on scroll; only a reading caret moves
(`:15-19`).

**Mat** (`mat.tsx`), at the foot: who's working the house, the homeowner's
papers, and the two acts every house owes a guest — her own details and the
way out. "'Leave the house' is REQUIRED. The Threshold takes the portal's
global header off this route, so sign-out lives nowhere else on the page"
(`:16-18`). Multi-project clients find their other houses here rather than in
a header switcher (R135).

**Letterbox** (`letterbox.tsx`): "One letter, standing half out of the slot.
The drawing states the fact before a word is read" (`:28-29`). Empty draws as
empty, never a card (`:38-40`); marked `data-never-dim` so a dimming pass
can't hide money owed (`:42-43`).

**LetterboxDoor** (`letterbox-door.tsx`) is the invoice-only front door from
§1. **WallGate**/**DoorGate** are the two accept gates: a wall draws finished
trade work as a decorator's elevation with "a square notch cut out of its
profile exactly where the client's acceptance is owed" (`wall-gate.tsx:24-28`);
a door draws a paper awaiting signature "shut across the full measure of the
page" (`door-gate.tsx:34-37`).

**ScoredAction** (`instruments/scored-action.tsx`) is the client-portal port
of the designer portal's scored-ink grammar (I107): "no border, no fill, no
plate… the word and its two scores… an honest 44px control box" (`:19-22`). Its
`HoldAction` variant handles terminal acts (sign, accept): press-and-hold
while ink fills left-to-right along the rule — "the same ink, not a new
device. No spinner, no bar, no percentage, no ring" (`:266-267`).

## 4. The primitives the portals actually use

- **`DocumentAction`** (`apps/designer-portal/src/components/document/document-action.tsx`) —
  a bare DM Mono word (12px) underscored by one or two proofreader's rules
  instead of a button box, with wet ink flooding from the pointer's contact
  point on press.
- **`ScoredAction`** (`apps/client-portal/src/components/threshold/instruments/scored-action.tsx`) —
  the same grammar, deliberately re-implemented rather than shared as a
  package yet, "so an act inks identically on both sides of the table"
  (`:27-28`).
- **`MarginNote`** (`apps/designer-portal/src/components/document/margin-note.tsx`) —
  a Playfair-italic note in the page margin with an en-dash lead, a tiny ×
  dismiss, and a DM-mono footnote stating "Appears once · Recedes on use"
  (`:5-8`).
- **`Stamp`** (`apps/client-portal/src/components/threshold/instruments/stamp.tsx`) —
  a twelve-state inspection stamp on four dials (border weight/pigment, word
  ink, rotation): "No fill, no shadow, no checkmark, no badge — a stamp is
  ink pressed onto paper" (`:5-7`); ages once, at 30 days, in border weight
  only, never in the word (`:19-23`).
- **`RowWash`** (`apps/designer-portal/src/components/document/row-wash.tsx`) —
  the hover/press device behind every roster/FF&E line: a pigment wash
  opening as a clip-path circle from the pointer's contact point (`:32-35`).

`packages/patina-design-system` also exports a conventional library —
`Button` (variants `default`/`destructive`/`outline`/`secondary`/`ghost`/`link`;
`default` carries a real CSS `shadow`, `Button.tsx:11`), `Badge`, `Tabs`,
`Toast`/`Toaster`, shadow tokens (`src/tokens/shadows.ts`), and celebration
components (`MilestoneCard`, `ApprovalCelebration`, `Confetti`, and others).
Grepping actual imports of this package (not local `ui/controls`) across all
four portals: **`Badge`** — 19 files, almost entirely
catalog/collections/CRM surfaces plus one client-portal field page, none in
the Desk or Threshold. **`Button`** — 6 files, again none in Desk or
Threshold (both use `DocumentAction`/`ScoredAction` instead). **`Toaster`** —
exactly 2 files, each portal's top-level `providers.tsx`, wiring the toast
host once; the Desk and Threshold themselves never call `toast()`. **Zero**
files import any celebration component from `@patina/design-system`.

## 5. Tokens in force

From `apps/designer-portal/src/app/globals.css`: paper — `--color-off-white:
#FAF7F2` (`:10`), `--doc-paper: #FCFAF6` (`:51`), `--doc-rail-stock: #E8E3DB`
(`:58`); ink — `--color-charcoal: #2C2926` (`:15`), `--color-quiet-ink:
#65594E` (`:18`), three real muted steps (R126) `--text-muted: #4E4339`
(`:80`), `--text-subtle: #5A4E43` (`:81`), `--text-faint: #65594E` (`:104`);
state pigments clay `#C4A57B`/ink `#7C5E30` (`:12,34`), golden hour
`#E8C547`/ink `#79651E` (`:47,40`), terracotta `#D4A090`/ink `#9C5340`
(`:46,35`), sage `#A8B5A0`/ink `#5F6B57` (`:44,41`); `--accent-primary:
var(--color-clay)` (`:91`); `--elevation-sheet: 0 1px 2px rgba(44,41,38,.08)`
(`:188`) — the one shadow token permitted, at exactly three sites (R126).
Fonts: `--font-display … 'Playfair Display'`, `--font-body … 'Inter'`,
`--font-meta … 'DM Mono'` (`:1296-1299`). `--radius: 0.75rem` is declared
(`:1251`) but concrete radii in practice run 2–3px (`:383,602`;
`rounded-[3px]` throughout desk components) — the document surfaces don't
draw the rounder corner. Spacing: `--space-1: 0.25rem` through `--space-24:
6rem` (`:204-214`).

**Client portal** (`apps/client-portal/src/app/globals.css`) shares the same
core hex values verbatim (`:9-40`) but differs: it names muted text
`--color-oak-ink: #4E4339` rather than a `--text-muted` literal, with a
comment noting an axe-contrast fix specific to this surface ("104 serious
contrast failures on the doorstep," `:12-18`); it declares no `--doc-paper`
or `--doc-rail-stock` (the Threshold is one continuous page, no "paper vs.
rail" distinction) and no `--elevation-sheet`; it declares `--color-error:
#C77B6E` (`:53`) even though R135 later forbids using it by name (§7); and it
carries `--color-gold`, scoped to one caller (`:26-29`), and per-band
`--phase-*` tokens (`:67-72`) absent from the designer portal's file.

**`#394B38` and `#A47836`** — the proposal's two new accents — appear
**nowhere** in the repo: a grep across every `.css`/`.ts`/`.tsx` under
`apps/` and `packages/` returns zero matches for either hex value.

## 6. Type in practice

- DM Mono stage plate: `font-mono text-[11px] font-semibold uppercase
  tracking-[0.1em]`, white on a saturated fill — `desk-roster.tsx:193`.
- Roster body text uses the shared `doc-type-body` class rather than an
  inline size — `desk-roster.tsx:114`; the Playfair job name beside it is
  `font-heading text-[16px] font-medium` — `:110`.
- Empty-roster italic Playfair line: `font-heading text-[15px] italic` —
  `:224`.
- Threshold headline: `font-heading … text-[clamp(1.45rem,2.9vw,2.1rem)]
  font-medium leading-[1.22]` — `doorstep.tsx:85`.
- Threshold DM Mono metadata: `font-mono text-[11.5px] leading-[1.5]
  tracking-[0.04em]` — `doorstep.tsx:104`; a second line at `text-[11px]` —
  `:127,135`.
- Tracking-row piece name: shared `type-body-small font-medium` class, not
  an inline size — `tracking-row.tsx:121`; the micro-spine stop label is
  `font-mono text-[9px] font-semibold uppercase tracking-[0.16em]` —
  `:187`; the rotated stamp word is `font-mono text-[9px] font-bold
  uppercase tracking-[0.2em]` — `:210`.
- Story-pole chapter labels: `font-mono text-[11px] uppercase leading-[1.5]
  tracking-[0.14em]` — `story-pole.tsx:148,189-190,239`.

Pattern across both portals: DM Mono metadata runs 9–11.5px, almost always
uppercase with wide tracking (0.1–0.2em); Playfair heads run 15px (empty-state
asides) up to a clamped ~1.45–2.1rem (23–34px) headline; body copy runs
through shared `doc-type-body`/`type-body-small` classes rather than one-off
`text-[]` literals — centralized, but harder to eyeball from a single file.

---

## 7. Governance — context, not constraint

**Kody has ruled that for this review, the rulings below are context that
explains why the portals look as they do — not a veto on proposals. Note
`touches: <rule>` in one line only when a proposal crosses one, for later
reconciliation.**

- **`docs/vision/VISION.md:19-24`** — Surface ranking: The Document ranks
  first of three ("Patina for the next twelve months"), iOS second, the
  marketplace third. Why: "One engine, three surfaces — in strict order."
- **`VISION.md:50-52`** — The two promises. Quoted: "**To the studio:** *you
  won't notice Patina.*… we will never optimize the studio surface for
  engagement" and "**To the homeowner:** *you're engaged every day… looking
  at the same agreed direction.*"
- **`VISION.md:58`** — Truth-framing: "one living document," "no dashboards,
  no task manager, no tab bars… Truth-framing over taste-framing."
- **`VISION.md:73`** — The ban list, quoted: "**Tab / zone / dashboard UI,
  shadows, red/green status, badges.** One living Document, typography-first."
- **`docs/vision/VISION-DECISIONS.md` V7** — iOS may use a tab bar; the
  studio-surface ban binds The Document only. Why: "a designer's document is
  one continuous thing and splitting it into tabs is what makes competitors'
  tools feel like software."
- **`VISION-DECISIONS.md` V8 (:129-132)** — The web client page may be
  designed for daily return. Quoted: "may be designed for daily return the
  same way the iOS client app already is under V7… Nothing here licenses
  tabs, badges, shadows, or engagement chrome in The Document itself."
- **`apps/designer-portal/CLAUDE.md:21`** — D4, zero shadows: "No
  `box-shadow`, no `drop-shadow`, no Tailwind `shadow-*`." Why: "depth =
  value contrast + flat stacked edges + tab."
- **`CLAUDE.md:22`** — D1, strict focus: "No split views, no document tabs,
  no persistent global nav inside a document."
- **`CLAUDE.md:23`** — Typography-first: "Hierarchy via Playfair/Inter/DM
  Mono weight, size, and color — not cards-within-cards, not tab bars."
- **`CLAUDE.md:48`** — Success criterion: "At no point does she see a
  shadow, a zone, a badge, or a dashboard."
- **`eslint.config.mjs:83-101`** — CI-blocking lint against `shadow-*`,
  `box-shadow`/`drop-shadow`, and `boxShadow`/`WebkitBoxShadow` on Document
  surfaces: "D4/R3: no shadow-* utilities on Document surfaces."
- **`docs/design/the-document/DECISIONS.md` I107 (:6584-6611)** —
  Scored-ink actions. Quoted: "Boxes, borders and fills are retired from
  DocumentAction. An action is a bare DM Mono word with proofreader's
  scoring."
- **`DECISIONS.md` R51 (:2049-2060)** — No toast, ever. Quoted: "**No toast,
  ever** (D2)… the surface answers 'did that work?' by being true, not by
  interrupting."
- **`DECISIONS.md` R126 (:9981-10080)** — Three paper stocks; colour at
  exactly three sites; one elevation token at three sites. **Kody, verbatim,
  :9988-9990**: "the desk is starting to look silly with the banded colors
  edge to edge. and the document with the dark header and yellow body looks
  terrible. Direction A would have been better guidance, pulling in a little
  more of direction B's color, Maybe an animated color highlight on hover."
- **`DECISIONS.md` R135 (:10701-10722)** — Header removed; the mat. Quoted:
  "The fourteen-control, seven-destination header the diagnosis in
  `docs/design/the-client-page/README.md` counted is deleted outright, not
  hidden behind a flag."
- **`DECISIONS.md` R137 (:10734-10738)** — The invoice may leave the page
  (the one exception to R135). Quoted: "the person who most needs to pay a
  Patina invoice is a homeowner who has **no account and no house on the
  platform**."
- **`DECISIONS.md:10717`** — Refusal styling. Quoted: "**A refusal is body
  ink under a hairline, everywhere on the page.** `--color-error` is red and
  is forbidden by name." Note: the client portal's `globals.css` still
  *declares* `--color-error: #C77B6E` (`:53`) despite this ban — a live
  token/ruling gap, not a polish question but worth the panel's notice.
- **`DECISIONS.md:3775`** (inside R107) — Drawn rooms render honestly.
  Quoted: "**Confidence renders honestly** — low-confidence walls and
  objects draw lighter and dashed, because a drawing that hides its
  uncertainty lies."
- **`docs/design/the-client-page/README.md:19`** — Diagnosis. Quoted: "the
  top navigation bar makes the client portal *feel like any other portal*."
- **`the-client-page/README.md:75-77`** — The drawing's source. Quoted:
  "Patina already holds project rooms, per-room FF&E items, and LiDAR room
  scans, so the section drawing has a source no other portal can copy."

**Kody's personal rulings vs. older team log entries.** Four entries name
Kody directly and quote him inside the entry: **I107** ("Kody's ruling from
Proof Sheet Nº 001…"), **R126** ("Kody reversed on the mockup, verbatim…"),
**R135** ("Ruled by Kody, 2026-09-04"), and **R137** ("Asked and ruled by
Kody, 2026-09-06") — each an on-the-spot reversal or amendment of an existing
direction. **R51** (no toast) carries no personal attribution — it reads as
an implementation-authority ruling resolving an open workstream item (O7,
Track 5), not a recorded outside decision. The VISION.md bans and
`apps/designer-portal/CLAUDE.md` hard constraints read as foundational,
team-authored doctrine set at the workstream's start rather than single-
session interventions, even though Kody is one of only two people on the
team.

## 8. Known rough edges already recorded

The task brief for this section cited
`artifacts/client-page-completion-2026-09-04/waves/w4/ship.md` for several
items; that file does not contain them. Verified citations below, by opening
each file at its line:

1. **Story pole loses date sublines against the mock.** The mock prints a
   date range under each phase; live prints phase names only, with a date
   line for the current phase alone. `.../waves/w3/gates.md:295`.
2. **Empty story pole on a house with no dated phases** — a project in
   Discovery with no dated phases draws no pole at all, opening straight
   into the doorstep sentence. `.../waves/w3/gates.md:308`.
3. **Tester-notes widget overlaps the letterbox on phone — confirmed, high
   severity.** At ≤600px the dark circular "N" widget sits on top of the
   letterbox's last line, partly covering the balance-due sentence; the
   planned fix had not landed. `.../waves/w2/gates.md:434-438`.
4. **Story pole date-range gap, repeated finding.** `.../waves/w2/gates.md:418`.
5. **Tester-notes widget doesn't exist in the client portal at all** — an
   L9 plan item asking to reposition it there had no real target: "the plan
   item's premise is false and no number was invented." `.../waves/w1/l9-review.md:55`.
6. **Reading-mark dateline wiring was untested at ship time**, though it
   renders correctly against the mock. `.../waves/w1/l9-review.md:52`.
7. **Open design question — who writes the studio's note to the
   homeowner:** Nora in her own words, or a standing sentence composed for
   her; mixing the two is "the one way either path turns out badly."
   `docs/design/the-client-page/README.md:93-97`.
8. **Open design question — where the room drawing's geometry comes from:**
   scans, an imported plan set, or a studio-drawn key — three different
   builds, unresolved. `the-client-page/README.md:98-100`.
9. **Live token/ruling gap:** `apps/client-portal/src/app/globals.css:53`
   still declares `--color-error: #C77B6E` though R135 forbids using
   red-by-name for a refusal anywhere on the page.
