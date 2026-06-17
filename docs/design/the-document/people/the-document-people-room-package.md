# THE PEOPLE ROOM PACKAGE — the unified relationship layer

**To:** Claude Code · **From:** the design session, 2026-06-14
**Closes:** Feature Gap Matrix — **CRM / People zone.** The matrix names this the **second-largest absent cluster (17 capabilities)** and flags the **People book as a literal placeholder.** It even prescribes the build: *"CRM 'People' book — build the Studio Drawer sheet: client directory + profile/relationship + threads; surface client-initiated messaging,"* plus the marketing ops (*communications dashboard, campaigns, email templates, audience segmentation, nurture, reviews, portfolio*). This package builds all of it — but per an explicit design ruling in-session, **as a walk-in Room, not a sheet,** holding a **unified directory of every party** (clients, makers/vendors, GCs, team), not clients alone.

**Design decisions locked in the session interview (record in the ruling):**
1. **Scope = everyone.** One unified directory of people: clients, makers/vendors, GCs, team — not a clients-only CRM.
2. **Depth = everything.** Relationship core *and* marketing ops (campaigns, templates, audiences) in v1.
3. **Form = a Room.** The whole experience opens as a walk-in Room (D14 — put-down origin stash), not a Studio Drawer sheet like Orders/Accounts.

**Canonical design reference (commit to `docs/design/the-document/`):**
- `patina-people-room-prototype.html` — **the build target.** The Room shell, the unified directory + role filter + Engine reconnect intelligence, the role-adaptive Person Profile centered on the Relationship Journey, the unified Threads/inbox, Nurture, Reviews, Portfolio, Outreach.
- `portal-vs-desk-feature-gap-matrix.md` — the source of truth (CRM/People zone).

**Port intent, never markup.** **Authority order unchanged:** codebase → spec → prototypes → DECISIONS.md.

> **NUMBERING FLAG (read first).** Numbered **R50–R53**, assuming the live repo is at **R49** (after the decision-system package R46–R49 → after proposal authoring R42–R45 → after the gap-matrix baseline R41/I30). The uploaded DECISIONS.md snapshot is the stale pre-Track-1 copy (last id I25 / next R33). **Before appending: run `workstream_state.py` against the real repo and renumber to the true next-R.** `append_entry.py` recomputes the footer regardless.

> **DEPENDENCY THIS RESOLVES.** The decision-system package (R48, Track C — ball-in-court) was **blocked on People being a placeholder**: generalized decisions need GCs and vendors as *first-class parties*. **This package is that unblock.** Build the People Room's unified-party model (Track A) before — or alongside — decision-system Track C.

---

# PART A — DECISIONS.md paste block (append verbatim, renumber if needed)

```markdown
## Rulings — design session, 2026-06-14 (The People Room)

> Source: patina-people-room-prototype.html, against the Feature Gap Matrix
> CRM/People zone (17 gaps — the placeholder book). Design interview locked:
> scope = all parties (clients/makers/GCs/team); depth = relationship + marketing
> ops; form = a walk-in Room, not a sheet. Resolves the People-placeholder
> dependency that blocked R48 (decision ball-in-court).

### R50 · The People Room — the unified party directory, as a Room — 2026-06-14

The People book opens as a **walk-in Room** (D14 — full-bleed paper, put-down
returns to the origin stash), NOT a Studio Drawer sheet like Orders/Accounts.
Its spine is a **unified directory of every party Patina works with — clients,
makers/vendors, GCs, and studio team — in one roster**, role-filterable
(All/Clients/Makers/GCs/Team), each row carrying a role badge + a
role-appropriate relationship line + a status dot. A left rail switches between
six **views** (Strata-ruled, not tabs): Directory · Threads · Nurture ·
Reviews · Portfolio · Outreach. An **ask bar** queries the Aesthete Engine over
people + history ("who should I reconnect with", "which maker fits this
piece"). New leads enter the directory (lead intake gets a home); lead *detail*
cross-links to the document Brief. Declined from scope: a clients-only CRM; a
sheet form; a separate per-zone contacts page.

### R51 · The relationship journey — the role-adaptive profile — 2026-06-14

Opening a person opens a **role-adaptive Person Profile** whose heart is the
**Relationship Journey** — a single woven timeline of the entire relationship:
inquiry → proposal → project → messages → decisions → touchpoints → install →
care. **The journey is a DERIVATION, not a stored activity log** — woven from
the person's document history (proposal, project, decisions), their threads,
their nurture touchpoints, and their reviews, the same way sections, the Desk,
and the margin are derived. For **clients** the profile also shows **Style DNA
— the Engine's read** (taste tags + palette + a plain-language narrative,
sourced from the teaching/style layer), plus Projects, Trust & history,
Nurture, and a private note. For **makers/GCs/team** the profile adapts:
makers/GCs cross-link to the Orders book (terms, orders, lead times) and the
coordination view (open items in their court); team links to document margin
visibility (the colophon). Closes Client Profile & Relationship Journey (P0).

### R52 · Relationship operations — threads, nurture, reviews, portfolio — 2026-06-14

Four operating views over the directory. **Threads** is a unified inbox — every
conversation (client, project, vendor) in one list, scope-filterable
(all/direct/project/vendor), opening to a conversation (read + reply). A thread
is **one conversation surfaced everywhere** — it lives on the person AND on
their document margin (R27 client mirror), never duplicated. Per-person
messaging starts from the profile. **Nurture** is the touchpoint queue —
relationships ranked by dormancy + trust, the Engine surfacing who's drifting
(a *derivation*, deriveNurtureQueue), with touchpoint composition. **Reviews**
is three-state feedback collection (pending/collected/queued) with request
composition. **Portfolio** is the finished-rooms gallery (completed projects).
Closes Unified Inbox (Messages), Messages Hub thread list, Thread Conversation,
Per-Client Messaging (P0); Nurture, Reviews, Portfolio (P1).

### R53 · Outreach + People on the Desk + the cross-link contract — 2026-06-14

**Outreach** is the marketing-ops view: **campaigns** (list, compose, send,
stats), an **email template library** (browse, author, edit, delete), and
**audience segments** — which **draw from the same directory** (segment by role,
status, project history, trust). Closes Communications Dashboard, Campaign
list/detail/send, Template library/creation/deletion, Audience
segmentation/creation/deletion (P1). **People on the Desk:** nurture-due /
reconnect surfaces as Desk **need-lines** (a derivation extension — the Desk
stays engagement-focused, but a dormant high-trust tie is a need); the Unified
Inbox *notifications* tab stays TRANSFORMED into the margin model; the Sales
Pipeline stays TRANSFORMED into the Desk's need-filtered view. **Cross-link
contract (not rebuilt here):** maker/GC terms+orders live in the Orders book;
GC open-items in the coordination view; full team invite/management stays
/portal/team (the colophon handles margin-visibility add); lead detail/eval
cross-links to the Brief. The People Room is the *people* layer over those, not
a re-home of them.
```

**After appending, restore the footer** (the skill derives it; shape):
`*Entries: D1–D14 · O1–O7 (resolved) · I1–I30 · R1–R53 · L1–L4 · THE GO · FLIP CONFIRMED · last id = R53*`

---

# PART B — Build plan

## Sequencing

People is the second-biggest gap and almost entirely net-new — there is no
Document-layer analog to port from. But the **data exists** (clients,
threads, nurture, reviews, campaigns all live behind `/portal`); this is a new
**Room surface + derivations** over it. Build order: Track A (Room shell +
unified directory — also the R48 unblock), Track B (the relationship journey /
profile — the heart, the hardest derivation), Track C (relationship
operations), Track D (outreach + Desk + cross-links). **Audit-first** every
"does X exist?" — the matrix is capability-grain, not schema-verified.

## Track A — The People Room shell + unified directory (R50)

**Audit first:** `/portal/clients` (page.tsx, ClientListItem, AddClientDialog,
FilterRow, MetricsRow), `useClients`; the vendor/maker source behind
`orders-book-vendors.tsx`; GC records (do they exist as parties, or only as
text on coordination items? — this is the crux of the R48 unblock); the team
source behind `doc-colophon.tsx`; `room-shell.tsx` + `room-origin.ts` (D14
origin stash); `/portal/leads` (LeadListItem).

1. **Room shell:** reuse `room-shell.tsx` + `room-origin.ts` — put-down returns
   to origin (NOT a Studio Drawer sheet). The People book in the drawer raises
   into a Room.
2. **Unified party model:** a `parties`/`people` read model unifying clients +
   makers/vendors + GCs + team behind one interface with a `role`/`type`
   discriminator. **This is the dependency the decision system needs** — GCs +
   vendors as first-class parties for ball-in-court.
3. **Directory view:** roster with role filter (All/Clients/Makers/GCs/Team),
   role-adaptive relationship line, status dot. Left-rail view switcher
   (Strata-ruled).
4. **Ask bar → Engine:** people + history search; reconnect/maker-fit
   recommendations (R38 Engine integration).
5. **Lead entry:** new leads appear in the directory; lead detail cross-links
   to the Brief.

*Accept (maps to matrix CRM rows):* **Client Directory** (list + search +
filter) · directory holds **makers, GCs, and team**, not just clients · a GC /
vendor is a queryable first-class party (unblocks R48) · the Room opens with
put-down origin (not a sheet) · the ask bar returns Engine results · leads have
a directory home (**Lead Intake** partial → resolved for browse).

## Track B — The relationship journey / role-adaptive profile (R51)

**Audit first:** `/portal/clients/[id]` (ClientTimeline, ActivityFeed,
StyleTag, ProjectCard); **how Style DNA is stored** — the style/teaching layer,
pgvector style embeddings, `StyleTag`; the document/lineage data the journey
must weave (proposal, project, decisions, threads, touchpoints, reviews).

1. **Role-adaptive Person Profile:** one component, branches by `role`. Client
   → full relationship view; maker/GC → Orders + coordination cross-links;
   team → margin-visibility view.
2. **The relationship journey — a PURE DERIVATION.** Build
   `deriveRelationshipJourney(person, documents, threads, touchpoints,
   decisions, reviews, now) → JourneyEvent[]` — the SAME pattern as
   `deriveSections` / `desk-derivation` / `partitionMargin`. **Do NOT add a
   redundant activity_feed table** — the journey is woven from surfaces that
   already exist plus minimal nurture/touchpoint anchors. A person's journey IS
   their document history + the human touchpoints.
3. **Style DNA (clients):** taste tags + palette + narrative from the
   style/teaching layer (the Engine's read). Connect to the existing style
   profile store; do not invent a parallel one.
4. **Side cards:** Projects (their documents, deep-link), Trust & history,
   Nurture status, private note.

*Accept:* a client profile renders Style DNA + the woven journey + projects +
trust + note (matrix: **Client Profile & Relationship Journey**, was
ABSENT/P0) · the journey is a derived `JourneyEvent[]`, not a stored log (CI:
no activity_feed write path) · maker/GC/team profiles adapt and cross-link
correctly · opening a project from the profile opens that document.

## Track C — Relationship operations: threads, nurture, reviews, portfolio (R52)

**Audit first:** `/portal/inbox` (useInboxMessages), `/portal/messages`
(useThreads, per-scope inbox/direct/project/vendor), `/portal/messages/[id]`
(MessageThread, MessageComposer, useThread, useSendMessage, useThreadRealtime);
`margin-bodies.tsx` MessageBody (the existing thread read+reply in margin);
`/portal/nurture` (NurtureCard, NurtureComposeModal, useNurtureTouchpoints);
`/portal/reviews` (ReviewCard, three-tab); `/portal/portfolio`.

1. **Threads / unified inbox:** thread list with scope filter
   (all/direct/project/vendor); conversation view (read + reply) reusing
   `useThread`/`useSendMessage`. **One conversation, every surface** — the same
   thread renders here and in the document margin (R27); shared model, not a
   copy. Per-person messaging from the profile (`useStartDirectThread`).
2. **Nurture:** the touchpoint queue as a derivation (deriveNurtureQueue —
   dormancy + trust ranking); touchpoint composition (reuse NurtureComposeModal
   logic).
3. **Reviews:** three-state collection (pending/collected/queued); request
   composition (reuse ReviewRequestCard).
4. **Portfolio:** completed-projects gallery.

*Accept:* **Unified Inbox** + **Messages Hub thread list** + **Thread
Conversation** + **Per-Client Messaging** (all P0) reachable in the Room · a
thread is shared between People and the document margin (no duplicate write) ·
**Nurture Queue**, **Reviews**, **Portfolio** (P1) functional · the inbox
*notifications* tab stays the margin model (TRANSFORMED, not rebuilt).

## Track D — Outreach + People Desk derivation + cross-links (R53)

**Audit first:** `/portal/communications` (dashboard stats),
`/portal/communications/campaigns` (useCampaigns, useCreateCampaign,
useCampaign, useSendCampaign, useDeleteCampaign), `.../templates` (useTemplates,
useCreateTemplate, useTemplate, useDeleteTemplate), `.../audiences`
(useAudienceSegments, useCreateAudienceSegment, useDeleteAudienceSegment);
`desk-derivation.ts` (to add the nurture-due need line).

1. **Outreach view:** campaigns (list/compose/send/stats), template library
   (browse/author/edit/delete), audience segments — **audiences segment from
   the unified directory** (role/status/history/trust).
2. **People on the Desk:** extend `desk-derivation.ts` so nurture-due /
   high-trust-dormant surfaces as a need-line. Pipeline + inbox-notifications
   stay TRANSFORMED (do not rebuild).
3. **Cross-link contract:** maker/GC → Orders book + coordination; team →
   /portal/team; lead detail → Brief. Wire the links; don't re-home the surfaces.

*Accept:* **Communications Dashboard**, **Campaign** list/detail/send,
**Template** library/creation/deletion, **Audience** segmentation/creation/
deletion (all P1) reachable in Outreach · an audience is built from directory
parties · a nurture-due tie appears on the Desk · maker/GC/team/lead links
resolve to the right existing surfaces (not rebuilt) · pipeline + inbox-notifs
remain Desk/margin derivations.

## Dependencies & flags

- **Artifact landing (the recurring bug):** the People Room prototype + the gap
  matrix must reach `docs/design/the-document/` WITH this ruling. Run
  `land_artifact.py --check` on Part A; land any missing before building.
- **This UNBLOCKS the decision system (R48 / Track C).** The unified-party model
  (Track A) is the prerequisite for ball-in-court with GCs + vendors. Sequence
  Track A before — or with — decision-system Track C, and update that package's
  People-dependency flag to "resolved" once Track A lands.
- **The journey is a derivation, not a table** (Track B) — the single most
  important technical call here. Mirror section/desk/margin derivation. A
  redundant activity_feed table is the anti-pattern to avoid.
- **Style DNA reuses the teaching/style layer** — connect to the existing style
  profile store (pgvector embeddings / StyleTag), don't fork it.
- **Spec fold:** after Track A+B review, fold R50–R53 into the spec and **update
  the gap-matrix CRM/People rows** from "17 absent" toward parity.
- **TRANSFORMED, not built:** Sales Pipeline, Unified Inbox notifications tab —
  stay Desk/margin derivations per the matrix caveat.

**Kickoff:** *"R50–R53 appended (renumber to true next-R first, footer
restored). People Room prototype + gap matrix committed to
docs/design/the-document/. Build Track A (the Room shell + unified party
directory) first — it both stands up the People Room AND unblocks decision-
system Track C (GCs/vendors as first-class parties); audit /portal/clients +
the vendor/GC/team sources, and confirm whether GCs exist as party records
today. Then Track B (the role-adaptive profile + the relationship journey AS A
DERIVATION — deriveRelationshipJourney, no activity_feed table; Style DNA reuses
the teaching layer), Track C (threads/inbox + nurture + reviews + portfolio,
threads shared with the document margin), Track D (outreach marketing ops +
the nurture-due Desk need + cross-links). Review milestone: open the People Room
→ the directory shows all four party types → a client profile renders the woven
relationship journey + Style DNA → message and nurture flows work."*
